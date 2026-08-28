require('dotenv').config();
const mongoose = require('mongoose');
const axios = require('axios');
const IBGEMunicipio = require('./models/IBGEMunicipio');

async function importarDadosOficiaisIBGE() {
    try {
        console.log("⏳ Conectando ao MongoDB Atlas...");
        await mongoose.connect(process.env.MONGO_URI);
        console.log("✅ Conectado com sucesso!");

        console.log("🌐 Buscando dados geográficos de todos os municípios do Paraná na API do IBGE...");
        
        // 1. Busca todas as cidades do Paraná (UF 41) com meso e microrregiões
        const resLocalidades = await axios.get('https://servicodados.ibge.gov.br/api/v1/localidades/estados/41/municipios');
        const municipiosPR = resLocalidades.data;

        console.log(`📦 ${municipiosPR.length} municípios encontrados na API do IBGE. Preparando dados...`);

        const operacoes = municipiosPR.map(m => {
            return {
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
            };
        });

        console.log("💾 Gravando dados na coleção 'IBGEMunicipios' no MongoDB...");
        const resultado = await IBGEMunicipio.bulkWrite(operacoes);
        
        console.log("🎉 Sucesso!");
        console.log(`   - Cidades inseridas/atualizadas: ${resultado.upsertedCount + resultado.modifiedCount + resultado.matchedCount}`);
        console.log("--------------------------------------------------");

    } catch (erro) {
        console.error("❌ Erro ao importar dados do IBGE:", erro.message);
    } finally {
        await mongoose.disconnect();
        console.log("🔌 Conexão encerrada.");
        process.exit();
    }
}

importarDadosOficiaisIBGE();