require('dotenv').config();
const mongoose = require('mongoose');
const axios = require('axios');
const Cidade = require('./models/Cidade');
const IBGEMunicipio = require('./models/IBGEMunicipio');

function normalizarNome(str) {
    return (str || '')
        .toString()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/['’\-.,]/g, ' ')
        .replace(/\s+/g, ' ')
        .toLowerCase()
        .trim();
}

async function auditarECorrigirIBGE() {
    try {
        console.log("⏳ Conectando ao MongoDB Atlas...");
        await mongoose.connect(process.env.MONGO_URI);
        console.log("✅ Conectado!");

        console.log("🌐 Baixando base oficial dos 399 municípios do PR na API do IBGE...");
        const resIBGE = await axios.get('https://servicodados.ibge.gov.br/api/v1/localidades/estados/41/municipios');
        const municipiosOficiais = resIBGE.data;
        console.log(`📦 ${municipiosOficiais.length} municípios oficiais recebidos.`);

        // 1. Atualiza geografia oficial na coleção IBGEMunicipios (preserva demografia, pibpercapita e saneamento)
        const opsIbge = municipiosOficiais.map(m => ({
            updateOne: {
                filter: { ibge_id: m.id },
                update: {
                    $set: {
                        ibge_id: m.id,
                        nome: m.nome,
                        geografia: {
                            microrregiao: m.microrregiao?.nome || '',
                            mesorregiao: m.microrregiao?.mesorregiao?.nome || '',
                            regiao_imediata: m['regiao-imediata']?.nome || '',
                            regiao_intermediaria: m['regiao-imediata']?.['regiao-intermediaria']?.nome || ''
                        },
                        atualizado_em: new Date()
                    }
                },
                upsert: true
            }
        }));

        await IBGEMunicipio.bulkWrite(opsIbge);
        console.log("✅ Coleção 'IBGEMunicipios' sincronizada com a geografia oficial do IBGE.");

        // Mapa oficial por nome normalizado
        const mapaPorNome = new Map();
        for (const m of municipiosOficiais) {
            mapaPorNome.set(normalizarNome(m.nome), {
                id: m.id,
                nome: m.nome,
                geografia: {
                    microrregiao: m.microrregiao?.nome || '',
                    mesorregiao: m.microrregiao?.mesorregiao?.nome || '',
                    regiao_imediata: m['regiao-imediata']?.nome || '',
                    regiao_intermediaria: m['regiao-imediata']?.['regiao-intermediaria']?.nome || ''
                }
            });
        }

        // 2. Audita a coleção 'cidades'
        const cidadesBanco = await Cidade.find().lean();
        console.log(`🔍 Auditando ${cidadesBanco.length} documentos na coleção 'cidades'...`);

        const paraCorrigir = [];
        const naoEncontradasNoIBGE = [];
        const idsAlvoVistos = new Set();

        for (const c of cidadesBanco) {
            const chave = normalizarNome(c.nome);
            const oficial = mapaPorNome.get(chave);

            if (!oficial) {
                naoEncontradasNoIBGE.push({ _id: c._id, nome: c.nome, ibge_id: c.ibge_id });
                continue;
            }

            if (idsAlvoVistos.has(oficial.id)) {
                console.warn(`⚠️ Nome duplicado na coleção 'cidades': "${c.nome}" (pulando alteração de ibge_id).`);
                continue;
            }
            idsAlvoVistos.add(oficial.id);

            const idErrado = Number(c.ibge_id) !== Number(oficial.id);
            const geoErrada = Boolean(
                (c.geografia && (
                    c.geografia.mesorregiao !== oficial.geografia.mesorregiao ||
                    c.geografia.microrregiao !== oficial.geografia.microrregiao
                )) ||
                (c.mesorregiao && c.mesorregiao !== oficial.geografia.mesorregiao)
            );

            if (idErrado || geoErrada) {
                paraCorrigir.push({
                    _id: c._id,
                    nome: c.nome,
                    ibgeAtual: c.ibge_id,
                    ibgeOficial: oficial.id,
                    geografiaOficial: oficial.geografia,
                    temCampoGeo: Boolean(c.geografia),
                    temCampoMeso: Boolean(c.mesorregiao),
                    idErrado,
                    geoErrada
                });
            }
        }

        console.log("--------------------------------------------------");
        console.log(`📊 Cidades com divergência encontradas: ${paraCorrigir.length}`);

        if (paraCorrigir.length > 0) {
            paraCorrigir.slice(0, 20).forEach(item => {
                console.log(`   👉 ${item.nome}: IBGE ${item.ibgeAtual} -> ${item.ibgeOficial}${item.geoErrada ? ' (geografia corrigida)' : ''}`);
            });
            if (paraCorrigir.length > 20) {
                console.log(`   ... e mais ${paraCorrigir.length - 20} municípios.`);
            }

            // Fase A: move temporariamente os IDs errados para valores negativos únicos (evita erro de índice unique ao trocar pares)
            const comIdErrado = paraCorrigir.filter(x => x.idErrado);
            if (comIdErrado.length > 0) {
                const opsTemp = comIdErrado.map((item, idx) => ({
                    updateOne: {
                        filter: { _id: item._id },
                        update: { $set: { ibge_id: -(9000000 + idx) } }
                    }
                }));
                await Cidade.bulkWrite(opsTemp);
            }

            // Fase B: aplica o ibge_id oficial e corrige geografia se o campo existir no documento
            const opsFinais = paraCorrigir.map(item => {
                const setFields = { ibge_id: item.ibgeOficial };
                if (item.temCampoGeo) setFields.geografia = item.geografiaOficial;
                if (item.temCampoMeso) setFields.mesorregiao = item.geografiaOficial.mesorregiao;
                if (item.temCampoGeo && item.temCampoMeso) setFields.microrregiao = item.geografiaOficial.microrregiao;

                return {
                    updateOne: {
                        filter: { _id: item._id },
                        update: { $set: setFields }
                    }
                };
            });

            await Cidade.bulkWrite(opsFinais);
            console.log(`🎉 ${paraCorrigir.length} municípios corrigidos na coleção 'cidades'!`);
        } else {
            console.log("✅ Todos os municípios da coleção 'cidades' já estão com IBGE e geografia corretos!");
        }

        if (naoEncontradasNoIBGE.length > 0) {
            console.log("⚠️ Cidades não reconhecidas automaticamente pelo nome (verificar manualmente):");
            naoEncontradasNoIBGE.forEach(n => console.log(`   - ${n.nome} (ibge_id: ${n.ibge_id})`));
        }

    } catch (err) {
        console.error("❌ Erro na auditoria:", err.message);
    } finally {
        await mongoose.disconnect();
        console.log("🔌 Conexão encerrada.");
        process.exit();
    }
}

auditarECorrigirIBGE();