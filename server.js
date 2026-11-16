require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const axios = require('axios');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Modelos do Banco e Configurações
const Cidade = require('./models/Cidade');
const Usuario = require('./models/Usuario');
const Conversa = require('./models/Conversa');
const IBGEMunicipio = require('./models/IBGEMunicipio');
const DICIONARIO_INDICADORES = require('./config/dicionarioIndicadores');

const app = express();
app.use(cors());
app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET || "chave_secreta_pls_2024";

// 1. CONEXÃO MONGODB
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log("✅ MongoDB Conectado com sucesso!"))
    .catch(err => console.error("❌ Erro ao conectar no MongoDB:", err));

// 2. CONFIGURAÇÃO DA IA GEMINI (CAPIÁ COM MEMÓRIA + PESQUISA WEB)
const genAI = new GoogleGenerativeAI((process.env.GEMINI_KEY || "").trim());

function montarHistoricoGemini(mensagens = []) {
    const historico = [];

    for (const msg of mensagens) {
        const role = msg.remetente === 'usuario' ? 'user' : 'model';
        const texto = (msg.conteudo || "").trim();
        if (!texto) continue;

        if (historico.length === 0 && role !== 'user') continue;

        if (historico.length > 0 && historico[historico.length - 1].role === role) {
            historico[historico.length - 1].parts[0].text += `\n\n${texto}`;
        } else {
            historico.push({ role, parts: [{ text: texto }] });
        }
    }

    if (historico.length > 0 && historico[historico.length - 1].role === 'user') {
        historico.pop();
    }

    return historico;
}

async function gerarTextoComIA(promptAtual, historicoMensagens = []) {
    const modelosParaTentar = [
        "gemini-3.6-flash",
        "gemini-3.5-flash",
        "gemini-3-flash-preview",
        "gemini-3.5-flash-lite",
        "gemini-3.1-flash-lite",
        "gemini-flash-lite-latest"
    ];

    const jaExisteConversa = historicoMensagens.length > 0;

    const systemPromptCapia = `Você é a CAPIÁ 🦫, a inteligência artificial oficial do Paraná Living Score (PLS).
Sua identidade é inspirada em uma capivara: calma, analítica, acolhedora, imparcial e paranaense.
LEMA: "Vamos entender o Paraná pelos dados."

DIRETRIZES DE CONVERSA E DADOS:
1. Responda em português com formatação clara em Markdown (use negrito, tópicos e emojis com moderação, como 🦫, 🌲, 📊).
2. ${jaExisteConversa
        ? 'ESTA É UMA CONVERSA EM ANDAMENTO: NÃO cumprimente novamente com "Olá", "Oi", "Tudo bem?" nem se apresente de novo. Vá direto à resposta mantendo o fio da conversa e entendendo referências anteriores (ex: "de lá", "essa cidade").'
        : 'Se for a primeira interação, seja acolhedora e objetiva.'}
3. DADOS DO PARANÁ LIVING SCORE: Para Living Score, posição no ranking e indicadores do PLS (Educação, Saúde, Economia, Segurança, Saneamento, Agropecuária), use EXCLUSIVAMENTE os números oficiais fornecidos no contexto. Nunca invente uma nota do PLS.
4. PESQUISA EXTERNA / INTERNET: Quando o usuário perguntar algo que NÃO está na base do PLS (como história, turismo, universidades, empresas, eventos, notícias atuais, clima, rodovias ou temas gerais), USE a ferramenta de pesquisa na web (Google Search) e seu conhecimento para responder de forma completa e atualizada, deixando claro o que é dado oficial do PLS e o que é informação externa.
5. NUNCA inclua rascunhos em inglês, análises internas ou tags de pensamento.`;

    const historyFormatado = montarHistoricoGemini(historicoMensagens);
    let ultimoErro = null;

    for (const usarGoogleSearch of [true, false]) {
        for (const nomeModelo of modelosParaTentar) {
            try {
                const configModelo = {
                    model: nomeModelo,
                    systemInstruction: systemPromptCapia
                };

                if (usarGoogleSearch) {
                    configModelo.tools = [{ googleSearch: {} }];
                }

                const model = genAI.getGenerativeModel(configModelo);
                const chat = model.startChat({ history: historyFormatado });
                const result = await chat.sendMessage(promptAtual);
                const response = await result.response;
                const texto = (response.text() || "").trim();

                if (!texto) {
                    throw new Error("O modelo retornou resposta vazia.");
                }

                const usouBuscaWeb = Boolean(
                    response.candidates?.[0]?.groundingMetadata?.webSearchQueries?.length
                );
                console.log(`✅ Capiá respondeu via [${nomeModelo}] | Histórico: ${historyFormatado.length} msgs | Busca Web: ${usouBuscaWeb ? 'SIM 🌐' : 'NÃO'}`);

                return texto;
            } catch (err) {
                ultimoErro = err;
                console.warn(`⚠️ [${nomeModelo}] (search=${usarGoogleSearch}) falhou: ${err.message}`);
            }
        }
    }

    throw new Error("Falha na IA Capiá: " + (ultimoErro?.message || "Erro desconhecido"));
}

// 3. MIDDLEWARES DE AUTENTICAÇÃO
const verificarToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader) return res.status(403).json({ erro: "Acesso negado. Faça login." });

    const token = authHeader.startsWith('Bearer ') ? authHeader.split(" ")[1] : authHeader;

    try {
        const verificado = jwt.verify(token, JWT_SECRET);
        req.usuario = verificado;
        next();
    } catch (err) {
        return res.status(401).json({ erro: "Sessão inválida ou expirada. Entre novamente." });
    }
};

const verificarAdmin = (req, res, next) => {
    verificarToken(req, res, () => {
        if (req.usuario && req.usuario.role === 'admin') {
            next();
        } else {
            return res.status(403).json({ erro: "Acesso restrito para administradores." });
        }
    });
};

// 4. FUNÇÕES AUXILIARES, DADOS DO BANCO E CÁLCULO DO SCORE
function normalizarTexto(texto) {
    return (texto || "")
        .toString()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim();
}

function extrairValor(campo) {
    if (campo === undefined || campo === null) return 0;
    if (typeof campo === 'number') return isNaN(campo) ? 0 : campo;
    if (typeof campo === 'string') {
        const n = Number(campo.replace(',', '.'));
        return isNaN(n) ? 0 : n;
    }
    if (typeof campo === 'object') {
        if (campo['2023'] !== undefined) return extrairValor(campo['2023']);
        if (campo['2022'] !== undefined) return extrairValor(campo['2022']);
        if (campo.valor !== undefined) return extrairValor(campo.valor);

        const chaves = Object.keys(campo).sort().reverse();
        for (const k of chaves) {
            const num = extrairValor(campo[k]);
            if (num > 0) return num;
        }
    }
    return 0;
}

function calcularLivingScore(indicadores) {
    if (!indicadores) return "0.0";

    const PESOS = { seguranca: 3, educacao: 3, saude: 2, economia: 2 };

    let edu = extrairValor(indicadores.educacao);
    if (edu === 0) edu = extrairValor(indicadores.ideb) / 10;
    const notaEdu = edu <= 1 ? (edu * 100) : edu;

    let sau = extrairValor(indicadores.saude);
    if (sau === 0) sau = extrairValor(indicadores.saude_leitos) / 10;
    const notaSau = sau <= 1 ? (sau * 100) : sau;

    let seg = extrairValor(indicadores.seguranca) || extrairValor(indicadores.seguranca_indice) || 75;
    const notaSeg = seg <= 1 ? (seg * 100) : seg;

    const pib = extrairValor(indicadores.pib_per_capita);
    let eco = extrairValor(indicadores.economia);
    if (eco > 0 && eco <= 1) eco = eco * 100;
    else if (pib > 0) eco = (pib > 50000 ? 100 : (pib / 500));
    else eco = 70;

    const resultado = (
        (notaSeg * PESOS.seguranca) +
        (notaEdu * PESOS.educacao) +
        (notaSau * PESOS.saude) +
        (eco * PESOS.economia)
    ) / 10;

    return Math.min(100, Math.max(0, resultado)).toFixed(1);
}

function avaliarCompletudePilares(indicadores) {
    const ind = indicadores || {};
    const temEdu = extrairValor(ind.educacao) > 0 || extrairValor(ind.ideb) > 0;
    const temSau = extrairValor(ind.saude) > 0 || extrairValor(ind.saude_leitos) > 0;
    const temSeg = extrairValor(ind.seguranca) > 0 || extrairValor(ind.seguranca_indice) > 0;
    const temEco = extrairValor(ind.economia) > 0 || extrairValor(ind.pib_per_capita) > 0;

    const faltantes = [];
    if (!temSeg) faltantes.push('Segurança');
    if (!temEdu) faltantes.push('Educação');
    if (!temSau) faltantes.push('Saúde');
    if (!temEco) faltantes.push('Economia');

    return {
        completo: temEdu && temSau && temSeg && temEco,
        faltantes
    };
}

const WIKI_HEADERS = {
    'User-Agent': 'ParanaLivingScore/1.0 (Projeto Academico IFPR Campus Assis Chateaubriand)'
};
const cacheContextoWiki = new Map();

function limparHtmlTexto(str) {
    return (str || "")
        .replace(/<[^>]*>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function normalizarPilarPara100(campo) {
    if (campo === undefined || campo === null) return null;
    const val = extrairValor(campo);
    if (!val || val <= 0) return null;
    return val <= 1 ? Number((val * 100).toFixed(1)) : Number(Math.min(100, val).toFixed(1));
}

function textoBancoValido(valor) {
    if (valor === undefined || valor === null) return null;
    if (typeof valor === 'number') return isNaN(valor) ? null : String(valor);
    const str = String(valor).trim();
    if (!str) return null;
    const norm = str.toLowerCase();
    if (['null', 'undefined', 'nan', 'n/d', 'não informado', 'nao informado', '-'].includes(norm)) {
        return null;
    }
    return str;
}

function parseNumeroBanco(valor) {
    if (valor === undefined || valor === null) return null;
    if (typeof valor === 'number') return (!isNaN(valor) && valor > 0) ? valor : null;
    if (typeof valor === 'object') {
        if (valor.valor !== undefined) return parseNumeroBanco(valor.valor);
        if (valor['2023'] !== undefined) return parseNumeroBanco(valor['2023']);
        if (valor['2022'] !== undefined) return parseNumeroBanco(valor['2022']);
        return null;
    }
    const str = textoBancoValido(valor);
    if (!str) return null;

    let limpo = str.replace(/R\$/gi, '').replace(/hab\.?\/km²|km²|hab\.?/gi, '').trim();
    if (limpo.includes(',')) {
        limpo = limpo.replace(/\./g, '').replace(',', '.');
    }
    limpo = limpo.replace(/[^\d.-]/g, '');
    const num = Number(limpo);
    return (!isNaN(num) && num > 0) ? num : null;
}

function formatarFundacaoBanco(valor) {
    if (valor === undefined || valor === null) return null;
    if (valor instanceof Date && !isNaN(valor.getTime())) {
        return valor.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
    }
    if (typeof valor === 'number') {
        return (!isNaN(valor) && valor > 0) ? String(Math.trunc(valor)) : null;
    }
    const str = textoBancoValido(valor);
    if (!str) return null;

    if (/^\d{4}-\d{2}-\d{2}T/.test(str)) {
        const d = new Date(str);
        if (!isNaN(d.getTime())) return d.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
    }
    return str;
}

function primeiroValorPreenchido(lista, parser) {
    for (const item of lista) {
        const resultado = parser(item);
        if (resultado !== null) return resultado;
    }
    return null;
}

function extrairDadosComplementaresDoBanco(cidadeObj, ibgeLocal) {
    const comp = cidadeObj.dados_complementares || {};
    const demo = cidadeObj.demografia || {};
    const info = cidadeObj.informacoes_gerais || {};
    const eco = cidadeObj.economia || {};
    const ind = cidadeObj.indicadores || {};
    const ibgeDoc = cidadeObj.ibge || {};

    const ibgeBase = ibgeLocal || {};
    const ibgeLocalDemo = ibgeBase.demografia || {};
    const ibgeLocalComp = ibgeBase.dados_complementares || {};

    const populacao = primeiroValorPreenchido([
        cidadeObj.populacao,
        cidadeObj.populacao_estimada,
        cidadeObj.populacao_censo_2022,
        cidadeObj.populacao_censo,
        cidadeObj.habitantes,
        comp.populacao,
        comp.populacao_estimada,
        comp.populacao_censo_2022,
        demo.populacao,
        demo.populacao_estimada,
        demo.populacao_censo_2022,
        info.populacao,
        ibgeDoc.populacao,
        ibgeLocalDemo.populacao_censo_2022,
        ibgeLocalDemo.populacao,
        ibgeBase.populacao,
        ibgeBase.populacao_censo_2022
    ], parseNumeroBanco);

    const area_km2 = primeiroValorPreenchido([
        cidadeObj.area_km2,
        cidadeObj.area_territorial,
        cidadeObj.area,
        comp.area_km2,
        comp.area_territorial,
        demo.area_km2,
        demo.area_territorial,
        info.area_km2,
        ibgeDoc.area_km2,
        ibgeLocalDemo.area_km2,
        ibgeBase.area_km2
    ], parseNumeroBanco);

    const densidade_hab_km2 = primeiroValorPreenchido([
        cidadeObj.densidade_demografica,
        cidadeObj.densidade_hab_km2,
        cidadeObj.densidade,
        comp.densidade_demografica,
        comp.densidade_hab_km2,
        demo.densidade_demografica,
        demo.densidade_hab_km2,
        info.densidade_demografica,
        ibgeDoc.densidade_hab_km2,
        ibgeLocalDemo.densidade_hab_km2,
        ibgeBase.densidade_hab_km2
    ], parseNumeroBanco);

    const fundacao = primeiroValorPreenchido([
        cidadeObj.fundacao,
        cidadeObj.emancipacao,
        cidadeObj.fundacao_emancipacao,
        cidadeObj.data_fundacao,
        cidadeObj.ano_fundacao,
        cidadeObj.data_emancipacao,
        cidadeObj.ano_emancipacao,
        comp.fundacao,
        comp.emancipacao,
        demo.fundacao,
        demo.ano_fundacao,
        info.fundacao,
        ibgeBase.fundacao,
        ibgeBase.emancipacao,
        ibgeBase.ano_fundacao,
        ibgeLocalDemo.fundacao,
        ibgeLocalComp.fundacao
    ], formatarFundacaoBanco);

    const gentilico = primeiroValorPreenchido([
        cidadeObj.gentilico,
        cidadeObj.gentilico_oficial,
        comp.gentilico,
        demo.gentilico,
        info.gentilico,
        ibgeDoc.gentilico,
        ibgeBase.gentilico,
        ibgeBase.gentilico_oficial,
        ibgeLocalDemo.gentilico,
        ibgeLocalComp.gentilico
    ], textoBancoValido);

    const pib_per_capita = primeiroValorPreenchido([
        cidadeObj.pibpercapita,
        cidadeObj.pib_per_capita,
        ind.pibpercapita,
        ind.pib_per_capita,
        eco.pibpercapita,
        eco.pib_per_capita,
        comp.pibpercapita,
        comp.pib_per_capita,
        ibgeBase.pibpercapita,
        ibgeBase.pib_per_capita,
        ibgeLocalDemo.pibpercapita,
        ibgeLocalDemo.pib_per_capita
    ], parseNumeroBanco);

    const saneamento_detalhado = cidadeObj.saneamento || ibgeBase.saneamento || null;

    return {
        populacao,
        area_km2,
        densidade_hab_km2,
        fundacao,
        gentilico,
        pib_per_capita,
        saneamento_detalhado
    };
}

async function buscarContextoWikimedia(nomeCidade) {
    const chaveCache = normalizarTexto(nomeCidade);
    if (cacheContextoWiki.has(chaveCache)) {
        return cacheContextoWiki.get(chaveCache);
    }

    const resultado = {
        resumo: null,
        imagem_principal: null,
        commons_categoria: null
    };

    try {
        const tentativas = [`${nomeCidade} (Paraná)`, nomeCidade];
        let qid = null;

        for (const titulo of tentativas) {
            const urlWiki = `https://pt.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(titulo)}&redirects=1&prop=pageprops|pageimages|extracts&exintro=1&explaintext=1&pithumbsize=1400&ppprop=wikibase_item&format=json`;
            const resWiki = await axios.get(urlWiki, { headers: WIKI_HEADERS, timeout: 4000 });
            const pages = resWiki.data?.query?.pages || {};
            const page = Object.values(pages)[0];

            if (!page || page.missing !== undefined) continue;

            const extract = (page.extract || "").trim();
            if (titulo === nomeCidade && extract && !extract.toLowerCase().includes("paraná")) {
                continue;
            }

            resultado.resumo = extract || null;
            resultado.imagem_principal = page.thumbnail?.source || null;
            qid = page.pageprops?.wikibase_item || null;
            if (qid || resultado.resumo) break;
        }

        if (qid) {
            const urlWd = `https://www.wikidata.org/wiki/Special:EntityData/${qid}.json`;
            const resWd = await axios.get(urlWd, { headers: WIKI_HEADERS, timeout: 4000 });
            const claims = resWd.data?.entities?.[qid]?.claims || {};
            const catCommons = claims?.P373?.[0]?.mainsnak?.datavalue?.value;
            if (catCommons) {
                resultado.commons_categoria = catCommons;
            }
        }
    } catch (err) {
        console.warn(`⚠️ Contexto Wikimedia indisponível para ${nomeCidade}: ${err.message}`);
    }

    cacheContextoWiki.set(chaveCache, resultado);
    return resultado;
}

// ==========================================
// ROTAS PÚBLICAS
// ==========================================

app.get('/', (req, res) => {
    res.send('🚀 Servidor do Paraná Living Score está online e operante!');
});

// Listar todas as cidades (com mesorregiao real e flag de completude)
app.get('/api/cidades', async (req, res) => {
    try {
        const [cidades, ibgeDocs] = await Promise.all([
            Cidade.find().select('nome ibge_id indicadores relatorio_ia score_calculado geografia'),
            IBGEMunicipio.find().select('ibge_id geografia')
        ]);

        const mapaIbge = new Map(ibgeDocs.map(doc => [doc.ibge_id, doc]));

        const formatadas = cidades.map(c => {
            const obj = c.toObject();
            const ibgeDoc = mapaIbge.get(c.ibge_id);
            const status = avaliarCompletudePilares(c.indicadores);

            obj.dados_completos = status.completo;
            obj.pilares_faltantes = status.faltantes;
            obj.score_final = status.completo ? calcularLivingScore(c.indicadores) : null;
            obj.mesorregiao = obj.geografia?.mesorregiao || ibgeDoc?.geografia?.mesorregiao || 'Paraná';
            return obj;
        });
        res.json(formatadas);
    } catch (err) {
        res.status(500).json({ erro: err.message });
    }
});

// Ranking Oficial (com mesorregiões reais do IBGE)
// Ranking Oficial (completas primeiro por score; incompletas abaixo sem score artificial)
app.get('/api/cidades/ranking', async (req, res) => {
    try {
        const [cidades, ibgeDocs] = await Promise.all([
            Cidade.find(),
            IBGEMunicipio.find().select('ibge_id geografia')
        ]);

        const mapaIbge = new Map(ibgeDocs.map(doc => [doc.ibge_id, doc]));

        const cidadesFormatadas = cidades.map(c => {
            const obj = c.toObject();
            const ibgeDoc = mapaIbge.get(c.ibge_id);
            const status = avaliarCompletudePilares(c.indicadores);

            obj.dados_completos = status.completo;
            obj.pilares_faltantes = status.faltantes;
            obj.score_final = status.completo ? parseFloat(calcularLivingScore(c.indicadores)) : null;
            obj.mesorregiao = obj.geografia?.mesorregiao || ibgeDoc?.geografia?.mesorregiao || 'Paraná';
            return obj;
        });

        cidadesFormatadas.sort((a, b) => {
            if (a.dados_completos !== b.dados_completos) {
                return a.dados_completos ? -1 : 1;
            }
            if (a.dados_completos && b.dados_completos) {
                return b.score_final - a.score_final;
            }
            return (a.nome || '').localeCompare(b.nome || '', 'pt-BR');
        });

        res.json(cidadesFormatadas);
    } catch (err) {
        res.status(500).json({ erro: "Erro ao gerar ranking: " + err.message });
    }
});

// Rota de Ficha Completa (cidades.html e comparar.html)
app.get('/api/cidades/detalhes/:termo', async (req, res) => {
    try {
        const termoBruto = decodeURIComponent(req.params.termo).trim();
        const ehNumero = !isNaN(Number(termoBruto));

        let query = ehNumero
            ? { ibge_id: Number(termoBruto) }
            : { nome: { $regex: new RegExp(`^${termoBruto.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')}$`, 'i') } };

        let cidade = await Cidade.findOne(query).lean();

        if (!cidade && !ehNumero) {
            cidade = await Cidade.findOne({ nome: { $regex: new RegExp(termoBruto, 'i') } }).lean();
        }

        const todasCidades = await Cidade.find().select('ibge_id nome indicadores').lean();

        if (!cidade && !ehNumero) {
            const termoNorm = normalizarTexto(termoBruto);
            const achada = todasCidades.find(c => normalizarTexto(c.nome) === termoNorm);
            if (achada) {
                cidade = await Cidade.findById(achada._id).lean();
            }
        }

        if (!cidade) {
            return res.status(404).json({ erro: `Município "${termoBruto}" não encontrado na base de dados.` });
        }

        const [climaDados, ibgeLocal, wikiCtx] = await Promise.all([
            (async () => {
                if (!process.env.WEATHER_API_KEY) return null;
                try {
                    const weatherUrl = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(cidade.nome)},BR&units=metric&lang=pt_br&appid=${process.env.WEATHER_API_KEY}`;
                    const weatherRes = await axios.get(weatherUrl, { timeout: 3000 });
                    return {
                        temp: Math.round(weatherRes.data.main.temp),
                        descricao: weatherRes.data.weather[0].description,
                        icone: weatherRes.data.weather[0].icon,
                        umidade: weatherRes.data.main.humidity
                    };
                } catch { return null; }
            })(),
            cidade.ibge_id ? IBGEMunicipio.findOne({ ibge_id: Number(cidade.ibge_id) }).lean() : null,
            buscarContextoWikimedia(cidade.nome)
        ]);

        const dadosComp = extrairDadosComplementaresDoBanco(cidade, ibgeLocal);

        let ibgeInfo = {
            geografia: {
                mesorregiao: cidade.geografia?.mesorregiao || cidade.mesorregiao || ibgeLocal?.geografia?.mesorregiao || "Não informado",
                microrregiao: cidade.geografia?.microrregiao || cidade.microrregiao || ibgeLocal?.geografia?.microrregiao || "Não informado",
                regiao_imediata: cidade.geografia?.regiao_imediata || cidade.regiao_imediata || ibgeLocal?.geografia?.regiao_imediata || "Não informado",
                regiao_intermediaria: cidade.geografia?.regiao_intermediaria || cidade.regiao_intermediaria || ibgeLocal?.geografia?.regiao_intermediaria || "Não informado"
            },
            demografia: {
                populacao_censo_2022: dadosComp.populacao,
                area_km2: dadosComp.area_km2,
                densidade_hab_km2: dadosComp.densidade_hab_km2,
                fundacao: dadosComp.fundacao,
                gentilico: dadosComp.gentilico,
                pib_per_capita: dadosComp.pib_per_capita
            }
        };

        if (cidade.ibge_id && ibgeInfo.geografia.microrregiao === "Não informado") {
            try {
                const ibgeRes = await axios.get(`https://servicodados.ibge.gov.br/api/v1/localidades/municipios/${cidade.ibge_id}`, { timeout: 3000 });
                if (ibgeRes.data) {
                    ibgeInfo.geografia.mesorregiao = ibgeRes.data.microrregiao?.mesorregiao?.nome || ibgeInfo.geografia.mesorregiao;
                    ibgeInfo.geografia.microrregiao = ibgeRes.data.microrregiao?.nome || ibgeInfo.geografia.microrregiao;
                    ibgeInfo.geografia.regiao_imediata = ibgeRes.data['regiao-imediata']?.nome || ibgeInfo.geografia.regiao_imediata;
                    ibgeInfo.geografia.regiao_intermediaria = ibgeRes.data['regiao-intermediaria']?.nome || ibgeRes.data['regiao-imediata']?.['regiao-intermediaria']?.nome || ibgeInfo.geografia.regiao_intermediaria;
                }
            } catch (e) {}
        }

        const baseAnalise = todasCidades.map(c => {
            const ind = c.indicadores || {};
            const status = avaliarCompletudePilares(ind);
            const pibVal = extrairValor(ind.pib_per_capita);
            const ecoBruto = extrairValor(ind.economia);
            const ecoNormalizado = ecoBruto > 0
                ? normalizarPilarPara100(ecoBruto)
                : (pibVal > 0 ? Number(Math.min(100, pibVal / 500).toFixed(1)) : null);

            return {
                id: String(c._id),
                ibge_id: c.ibge_id,
                nome: c.nome,
                completo: status.completo,
                faltantes: status.faltantes,
                score: status.completo ? parseFloat(calcularLivingScore(ind)) : null,
                edu: normalizarPilarPara100(ind.educacao) ?? (extrairValor(ind.ideb) > 0 ? Number(Math.min(100, extrairValor(ind.ideb) * 10).toFixed(1)) : null),
                sau: normalizarPilarPara100(ind.saude) ?? (extrairValor(ind.saude_leitos) > 0 ? Number(Math.min(100, extrairValor(ind.saude_leitos) * 10).toFixed(1)) : null),
                eco: ecoNormalizado,
                seg: normalizarPilarPara100(ind.seguranca) ?? normalizarPilarPara100(ind.seguranca_indice)
            };
        });

        const completasOrdenadas = baseAnalise
            .filter(x => x.completo)
            .sort((a, b) => b.score - a.score);

        const posGeral = completasOrdenadas.findIndex(x => x.id === String(cidade._id)) + 1;

        const calcularMedia = (campo) => {
            const validos = baseAnalise.map(x => x[campo]).filter(v => v !== null && !isNaN(v));
            if (validos.length === 0) return null;
            return Number((validos.reduce((acc, v) => acc + v, 0) / validos.length).toFixed(1));
        };

        const calcularPosicaoPilar = (campo) => {
            const validos = baseAnalise.filter(x => x[campo] !== null).sort((a, b) => b[campo] - a[campo]);
            const idx = validos.findIndex(x => x.id === String(cidade._id));
            return idx >= 0 ? { posicao: idx + 1, total: validos.length } : null;
        };

        const faixas = [
            { label: '0–49', min: 0, max: 49.99, qtd: 0 },
            { label: '50–59', min: 50, max: 59.99, qtd: 0 },
            { label: '60–69', min: 60, max: 69.99, qtd: 0 },
            { label: '70–79', min: 70, max: 79.99, qtd: 0 },
            { label: '80–89', min: 80, max: 89.99, qtd: 0 },
            { label: '90–100', min: 90, max: 100, qtd: 0 }
        ];

        const statusAtual = avaliarCompletudePilares(cidade.indicadores);
        const scoreCalculado = statusAtual.completo ? calcularLivingScore(cidade.indicadores) : null;
        const scoreNum = scoreCalculado !== null ? parseFloat(scoreCalculado) : null;

        completasOrdenadas.forEach(item => {
            const f = faixas.find(x => item.score >= x.min && item.score <= x.max);
            if (f) f.qtd++;
        });
        const faixaAtualIdx = scoreNum !== null ? faixas.findIndex(x => scoreNum >= x.min && scoreNum <= x.max) : -1;

        const atualItem = baseAnalise.find(x => x.id === String(cidade._id)) || {};

        res.json({
            cidade,
            score_final: scoreCalculado,
            clima: climaDados,
            ibge: ibgeInfo,
            dados_complementares: dadosComp,
            contexto_wiki: {
                resumo: cidade.descricao || cidade.sobre || cidade.info_curadoria || wikiCtx.resumo,
                imagem_principal: wikiCtx.imagem_principal,
                commons_categoria: wikiCtx.commons_categoria
            },
            analise_estadual: {
                posicao_geral: posGeral || null,
                total_municipios: baseAnalise.length,
                lider_estadual: baseAnalise[0] ? { nome: baseAnalise[0].nome, score: baseAnalise[0].score } : null,
                pilares_cidade: {
                    seguranca: atualItem.seg ?? null,
                    educacao: atualItem.edu ?? null,
                    saude: atualItem.sau ?? null,
                    economia: atualItem.eco ?? null
                },
                medias_estaduais: {
                    score: calcularMedia('score'),
                    seguranca: calcularMedia('seg'),
                    educacao: calcularMedia('edu'),
                    saude: calcularMedia('sau'),
                    economia: calcularMedia('eco')
                },
                ranking_pilares: {
                    seguranca: calcularPosicaoPilar('seg'),
                    educacao: calcularPosicaoPilar('edu'),
                    saude: calcularPosicaoPilar('sau'),
                    economia: calcularPosicaoPilar('eco')
                },
                distribuicao: {
                    labels: faixas.map(f => f.label),
                    valores: faixas.map(f => f.qtd),
                    faixa_atual_idx: faixaAtualIdx
                }
            }
        });

    } catch (err) {
        console.error("Erro em /detalhes:", err);
        res.status(500).json({ erro: "Erro ao buscar detalhes: " + err.message });
    }
});

// Galeria de Fotografias Reais do Município (Wikimedia Commons)
app.get('/api/cidades/galeria/:termo', async (req, res) => {
    try {
        const nomeCidade = decodeURIComponent(req.params.termo).trim();
        const urlPrincipal = (req.query.principal || "").toString();
        const arquivoPrincipal = urlPrincipal.split('/').pop()?.toLowerCase() || "";

        const wikiCtx = await buscarContextoWikimedia(nomeCidade);
        const fotosColetadas = [];
        const urlsVistas = new Set();

        const termosBanidos = [
            'brasao', 'brasão', 'bandeira', 'flag', 'coat_of_arms',
            'locator', 'mapa', 'map_of', 'mesorregiao', 'microrregiao', 'simbolo'
        ];

        const adicionarFotosDePages = (pagesObj) => {
            if (!pagesObj) return;
            for (const page of Object.values(pagesObj)) {
                const info = page.imageinfo?.[0];
                if (!info) continue;

                const mime = info.mime || '';
                if (!['image/jpeg', 'image/png', 'image/webp'].includes(mime)) continue;
                if ((info.width || 0) < 500) continue;

                const tituloLimpo = (page.title || '').replace(/^File:/i, '').replace(/\.[^.]+$/, '');
                const tituloNorm = normalizarTexto(tituloLimpo);
                if (termosBanidos.some(t => tituloNorm.includes(t))) continue;

                const imgUrl = info.thumburl || info.url;
                const nomeArquivo = (imgUrl.split('/').pop() || '').toLowerCase();

                if (arquivoPrincipal && nomeArquivo && nomeArquivo === arquivoPrincipal) continue;
                if (urlsVistas.has(imgUrl) || urlsVistas.has(nomeArquivo)) continue;

                urlsVistas.add(imgUrl);
                urlsVistas.add(nomeArquivo);

                const meta = info.extmetadata || {};
                const legendaBruta = limparHtmlTexto(meta.ImageDescription?.value || meta.ObjectName?.value || '');
                const artistaBruto = limparHtmlTexto(meta.Artist?.value || 'Acervo Wikimedia Commons');
                const licenca = limparHtmlTexto(meta.LicenseShortName?.value || 'Wikimedia Commons');

                fotosColetadas.push({
                    url: imgUrl,
                    fullUrl: info.url,
                    titulo: tituloLimpo.replace(/_/g, ' '),
                    legenda: legendaBruta ? legendaBruta.substring(0, 150) + (legendaBruta.length > 150 ? '...' : '') : `Registro fotográfico de ${nomeCidade} (PR).`,
                    credito: artistaBruto.substring(0, 70),
                    licenca
                });

                if (fotosColetadas.length >= 9) break;
            }
        };

        const categorias = [
            wikiCtx.commons_categoria,
            `${nomeCidade} (Paraná)`,
            nomeCidade
        ].filter(Boolean);

        for (const cat of categorias) {
            if (fotosColetadas.length >= 9) break;
            try {
                const urlCat = `https://commons.wikimedia.org/w/api.php?action=query&generator=categorymembers&gcmtitle=Category:${encodeURIComponent(cat)}&gcmtype=file&gcmlimit=20&prop=imageinfo&iiprop=url|extmetadata|mime|size&iiurlwidth=1200&format=json`;
                const r = await axios.get(urlCat, { headers: WIKI_HEADERS, timeout: 4000 });
                adicionarFotosDePages(r.data?.query?.pages);
            } catch {}
        }

        if (fotosColetadas.length < 6) {
            try {
                const urlSearch = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(nomeCidade + ' Paraná')}&gsrnamespace=6&gsrlimit=20&prop=imageinfo&iiprop=url|extmetadata|mime|size&iiurlwidth=1200&format=json`;
                const r = await axios.get(urlSearch, { headers: WIKI_HEADERS, timeout: 4000 });
                adicionarFotosDePages(r.data?.query?.pages);
            } catch {}
        }

        res.json({ fotos: fotosColetadas });
    } catch (err) {
        console.error("Erro em /galeria:", err.message);
        res.json({ fotos: [] });
    }
});

// Buscar cidade simples + Clima
app.get('/api/cidades/busca/:nome', async (req, res) => {
    try {
        const nomeCidade = decodeURIComponent(req.params.nome).trim();
        let cidade = await Cidade.findOne({ nome: new RegExp(`^${nomeCidade}$`, 'i') });

        if (!cidade) return res.status(404).json({ erro: "Cidade não encontrada" });

        let climaDados = null;
        if (process.env.WEATHER_API_KEY) {
            try {
                const weatherUrl = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(nomeCidade)},BR&units=metric&lang=pt_br&appid=${process.env.WEATHER_API_KEY}`;
                const weatherRes = await axios.get(weatherUrl, { timeout: 3000 });
                climaDados = {
                    temp: Math.round(weatherRes.data.main.temp),
                    descricao: weatherRes.data.weather[0].description,
                    icone: weatherRes.data.weather[0].icon,
                    umidade: weatherRes.data.main.humidity
                };
            } catch (errWeather) {}
        }

        const scoreFinal = calcularLivingScore(cidade.indicadores);
        const cidadeObj = cidade.toObject();
        cidadeObj.score_final = scoreFinal;

        res.json({
            ...cidadeObj,
            data_consulta: new Date().toLocaleDateString('pt-BR'),
            clima: climaDados
        });

    } catch (error) {
        res.status(500).json({ erro: error.message });
    }
});

// ==========================================
// ROTAS DE AUTENTICAÇÃO E PERFIL
// ==========================================

app.post('/api/auth/cadastro', async (req, res) => {
    try {
        const { nome, email, senha } = req.body;
        if (!nome || !email || !senha) {
            return res.status(400).json({ erro: "Preencha todos os campos obrigatórios." });
        }

        const usuarioExiste = await Usuario.findOne({ email });
        if (usuarioExiste) {
            return res.status(400).json({ erro: "Este e-mail já está cadastrado." });
        }

        const salt = await bcrypt.genSalt(10);
        const senhaCripto = await bcrypt.hash(senha, salt);

        const novoUsuario = new Usuario({
            nome,
            email,
            senha: senhaCripto,
            role: 'user'
        });

        await novoUsuario.save();
        res.status(201).json({ msg: "Cadastro realizado com sucesso!" });
    } catch (err) {
        res.status(500).json({ erro: err.message });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, senha } = req.body;

        const usuario = await Usuario.findOne({ email });
        if (!usuario) return res.status(400).json({ erro: "Credenciais inválidas." });

        const senhaCorreta = await bcrypt.compare(senha, usuario.senha);
        if (!senhaCorreta) return res.status(400).json({ erro: "Credenciais inválidas." });

        const token = jwt.sign(
            { id: usuario._id, role: usuario.role, nome: usuario.nome },
            JWT_SECRET,
            { expiresIn: '8h' }
        );

        res.json({
            token,
            usuario: {
                id: usuario._id,
                nome: usuario.nome,
                email: usuario.email,
                role: usuario.role
            }
        });
    } catch (err) {
        res.status(500).json({ erro: err.message });
    }
});

app.get('/api/usuario/perfil', verificarToken, async (req, res) => {
    try {
        const usuario = await Usuario.findById(req.usuario.id).select('-senha');
        if (!usuario) return res.status(404).json({ erro: "Usuário não encontrado." });
        res.json(usuario);
    } catch (err) {
        res.status(500).json({ erro: "Erro ao buscar perfil: " + err.message });
    }
});

app.put('/api/usuario/perfil', verificarToken, async (req, res) => {
    try {
        const { nome, senha } = req.body;
        const usuario = await Usuario.findById(req.usuario.id);
        if (!usuario) return res.status(404).json({ erro: "Usuário não encontrado." });

        if (nome && nome.trim().length > 0) {
            usuario.nome = nome.trim();
        }

        if (senha && senha.trim().length > 0) {
            const salt = await bcrypt.genSalt(10);
            usuario.senha = await bcrypt.hash(senha, salt);
        }

        await usuario.save();

        res.json({
            msg: "Perfil atualizado com sucesso!",
            usuario: {
                id: usuario._id,
                nome: usuario.nome,
                email: usuario.email,
                role: usuario.role
            }
        });
    } catch (err) {
        res.status(500).json({ erro: "Erro ao atualizar perfil: " + err.message });
    }
});

// ==========================================
// ROTAS DE CHAT E HISTÓRICO
// ==========================================

app.get('/api/chat/conversas', verificarToken, async (req, res) => {
    try {
        const conversas = await Conversa.find({ usuario_id: req.usuario.id })
            .select('titulo atualizado_em')
            .sort({ atualizado_em: -1 });
        res.json(conversas);
    } catch (err) {
        res.status(500).json({ erro: "Erro ao buscar conversas: " + err.message });
    }
});

app.get('/api/chat/conversa/:id', verificarToken, async (req, res) => {
    try {
        const conversa = await Conversa.findOne({ _id: req.params.id, usuario_id: req.usuario.id });
        if (!conversa) return res.status(404).json({ erro: "Conversa não encontrada." });
        res.json({ mensagens: conversa.mensagens, conversaId: conversa._id });
    } catch (err) {
        res.status(500).json({ erro: "Erro ao abrir conversa: " + err.message });
    }
});

app.delete('/api/chat/conversa/:id', verificarToken, async (req, res) => {
    try {
        await Conversa.findOneAndDelete({ _id: req.params.id, usuario_id: req.usuario.id });
        res.json({ msg: "Conversa excluída com sucesso!" });
    } catch (err) {
        res.status(500).json({ erro: "Erro ao excluir conversa: " + err.message });
    }
});

app.delete('/api/chat/limpar', verificarToken, async (req, res) => {
    try {
        await Conversa.deleteMany({ usuario_id: req.usuario.id });
        res.json({ msg: "Histórico completo limpo com sucesso!" });
    } catch (err) {
        res.status(500).json({ erro: "Erro ao limpar histórico: " + err.message });
    }
});

app.post('/api/chat/enviar', verificarToken, async (req, res) => {
    try {
        const { mensagem, conversaId } = req.body;
        if (!mensagem) return res.status(400).json({ erro: "A mensagem não pode ser vazia." });

        let conversa = null;
        if (conversaId) {
            conversa = await Conversa.findOne({ _id: conversaId, usuario_id: req.usuario.id });
        }

        const historicoRecente = conversa ? conversa.mensagens.slice(-10) : [];

        const todasCidades = await Cidade.find();
        const cidadesComRanking = todasCidades
            .map(c => ({
                doc: c,
                score: parseFloat(calcularLivingScore(c.indicadores))
            }))
            .sort((a, b) => b.score - a.score)
            .map((item, idx) => ({ ...item, posicao: idx + 1 }));

        let contextoTopRanking = "TOP 10 CIDADES NO RANKING GERAL:\n";
        cidadesComRanking.slice(0, 10).forEach(item => {
            contextoTopRanking += `${item.posicao}º ${item.doc.nome} (${item.score.toFixed(1)} pts)\n`;
        });

        const textoParaBusca = [
            mensagem,
            ...historicoRecente.slice(-4).map(m => m.conteudo)
        ].join(" ");

        const textoLimpo = ` ${normalizarTexto(textoParaBusca).replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()} `;
        const cidadesMencionadas = [...cidadesComRanking]
            .sort((a, b) => b.doc.nome.length - a.doc.nome.length)
            .filter(item => {
                const nomeLimpo = normalizarTexto(item.doc.nome).replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
                return nomeLimpo.length > 0 && textoLimpo.includes(` ${nomeLimpo} `);
            });

        let contextoMencionadas = "";
        if (cidadesMencionadas.length > 0) {
            contextoMencionadas = "\nDADOS OFICIAIS DO PLS PARA OS MUNICÍPIOS DO CONTEXTO:\n";
            cidadesMencionadas.slice(0, 5).forEach(({ doc, score, posicao }) => {
                const ind = doc.indicadores || {};
                contextoMencionadas += `
- ${doc.nome} (Código IBGE: ${doc.ibge_id} | Posição no Ranking Estadual: ${posicao}º de ${cidadesComRanking.length} | Living Score: ${score.toFixed(1)} pts)
  • Educação: 2022=${ind.educacao?.['2022'] ?? 'N/D'}, 2023=${ind.educacao?.['2023'] ?? 'N/D'}
  • Saúde: 2022=${ind.saude?.['2022'] ?? 'N/D'}, 2023=${ind.saude?.['2023'] ?? 'N/D'}
  • Economia: 2022=${ind.economia?.['2022'] ?? 'N/D'}, 2023=${ind.economia?.['2023'] ?? 'N/D'}
  • Segurança: 2022=${ind.seguranca?.['2022'] ?? 'N/D'}, 2023=${ind.seguranca?.['2023'] ?? 'N/D'}
  • Saneamento: 2022=${ind.saneamento?.['2022'] ?? 'N/D'}, 2023=${ind.saneamento?.['2023'] ?? 'N/D'}
  • Agropecuária: 2022=${ind.agropecuaria?.['2022'] ?? 'N/D'}, 2023=${ind.agropecuaria?.['2023'] ?? 'N/D'}
`;
            });
        }

        const promptCapia = `
CONTEXTO DA BASE DO PARANÁ LIVING SCORE (Total de ${cidadesComRanking.length} municípios cadastrados):
${contextoTopRanking}
${contextoMencionadas}

MENSAGEM DO USUÁRIO:
${mensagem}
`;

        const respostaIA = await gerarTextoComIA(promptCapia, historicoRecente);

        if (!conversa) {
            conversa = new Conversa({
                usuario_id: req.usuario.id,
                titulo: mensagem.substring(0, 30),
                mensagens: []
            });
        }

        conversa.mensagens.push({ remetente: 'usuario', conteudo: mensagem });
        conversa.mensagens.push({ remetente: 'ia', conteudo: respostaIA });
        conversa.atualizado_em = new Date();
        await conversa.save();

        res.json({ resposta: respostaIA, conversaId: conversa._id });
    } catch (err) {
        console.error("Erro no chat:", err);
        res.status(500).json({ erro: "Erro ao consultar a Capiá: " + err.message });
    }
});

// ==========================================
// ROTAS ADMINISTRATIVAS (CRUD COMPLETO)
// ==========================================

app.get('/api/admin/indicadores/catalogo', verificarAdmin, (req, res) => {
    res.json(DICIONARIO_INDICADORES);
});

app.get('/api/admin/cidades', verificarAdmin, async (req, res) => {
    try {
        const cidades = await Cidade.find().sort({ nome: 1 });
        const formatadas = cidades.map(c => {
            const obj = c.toObject();
            obj.score_calculado = parseFloat(calcularLivingScore(c.indicadores));
            return obj;
        });
        res.json(formatadas);
    } catch (err) {
        res.status(500).json({ erro: "Erro ao listar cidades: " + err.message });
    }
});

app.get('/api/admin/cidades/:id', verificarAdmin, async (req, res) => {
    try {
        const cidade = await Cidade.findById(req.params.id);
        if (!cidade) return res.status(404).json({ erro: "Cidade não encontrada." });

        const obj = cidade.toObject();
        obj.score_calculado = parseFloat(calcularLivingScore(cidade.indicadores));
        res.json(obj);
    } catch (err) {
        res.status(500).json({ erro: "Erro ao buscar cidade: " + err.message });
    }
});

app.post('/api/admin/cidades', verificarAdmin, async (req, res) => {
    try {
        const { ibge_id, nome, indicadores } = req.body;

        if (!ibge_id || !nome) {
            return res.status(400).json({ erro: "Código IBGE e Nome da cidade são obrigatórios." });
        }

        const existe = await Cidade.findOne({ ibge_id: Number(ibge_id) });
        if (existe) {
            return res.status(400).json({ erro: "Já existe uma cidade cadastrada com este código IBGE." });
        }

        const scoreCalculado = parseFloat(calcularLivingScore(indicadores));

        const novaCidade = new Cidade({
            ibge_id: Number(ibge_id),
            nome: nome.trim(),
            estado: 'PR',
            indicadores: indicadores || {},
            score_calculado: scoreCalculado,
            ultima_atualizacao: new Date()
        });

        await novaCidade.save();
        res.status(201).json({ msg: "Cidade cadastrada com sucesso!", cidade: novaCidade });
    } catch (err) {
        res.status(500).json({ erro: "Erro ao cadastrar cidade: " + err.message });
    }
});

app.put('/api/admin/cidades/:id', verificarAdmin, async (req, res) => {
    try {
        const { nome, ibge_id, indicadores } = req.body;
        const cidade = await Cidade.findById(req.params.id);

        if (!cidade) return res.status(404).json({ erro: "Cidade não encontrada." });

        if (nome) cidade.nome = nome.trim();
        if (ibge_id) cidade.ibge_id = Number(ibge_id);
        if (indicadores) cidade.indicadores = indicadores;

        cidade.score_calculado = parseFloat(calcularLivingScore(cidade.indicadores));
        cidade.ultima_atualizacao = new Date();

        await cidade.save();
        res.json({ msg: "Cidade e indicadores atualizados com sucesso!", cidade });
    } catch (err) {
        res.status(500).json({ erro: "Erro ao atualizar cidade: " + err.message });
    }
});

app.delete('/api/admin/cidades/:id', verificarAdmin, async (req, res) => {
    try {
        const cidade = await Cidade.findByIdAndDelete(req.params.id);
        if (!cidade) return res.status(404).json({ erro: "Cidade não encontrada." });
        res.json({ msg: `Cidade ${cidade.nome} excluída com sucesso!` });
    } catch (err) {
        res.status(500).json({ erro: "Erro ao excluir cidade: " + err.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Servidor rodando na porta ${PORT}`));