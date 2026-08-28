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

// 2. CONFIGURAÇÃO DA IA GEMINI (COM TRATAMENTO RESILIENTE)
const genAI = new GoogleGenerativeAI(process.env.GEMINI_KEY);

async function gerarTextoComIA(prompt) {
    const modelosParaTentar = [
        "gemini-1.5-flash",
        "gemma-4-26b-a4b-it",
        "gemma-4-31b-it",
        "gemini-flash-latest"
    ];

    let ultimoErro = null;
    const promptDireto = `${prompt}\n\n[INSTRUÇÃO IMPORTANTE: Responda diretamente ao usuário com a resposta final em português. NÃO inclua rascunho de planejamento, tags de raciocínio, regras ou anotações internas.]`;

    for (const nomeModelo of modelosParaTentar) {
        try {
            const model = genAI.getGenerativeModel({ model: nomeModelo });
            const result = await model.generateContent(promptDireto);
            const response = await result.response;
            let texto = response.text();

            // Limpa eventuais saídas de pensamento prévio
            if (texto.includes("Olá!") || texto.includes("Olá,") || texto.includes("Olá ")) {
                const indiceOla = Math.min(
                    texto.indexOf("Olá!") !== -1 ? texto.indexOf("Olá!") : Infinity,
                    texto.indexOf("Olá,") !== -1 ? texto.indexOf("Olá,") : Infinity,
                    texto.indexOf("Olá ") !== -1 ? texto.indexOf("Olá ") : Infinity
                );
                if (indiceOla !== Infinity) {
                    texto = texto.substring(indiceOla).trim();
                }
            }

            return texto;
        } catch (err) {
            ultimoErro = err;
            console.warn(`⚠️ Tentativa com ${nomeModelo} falhou, tentando próximo...`);
        }
    }

    throw new Error("Falha na IA: " + (ultimoErro?.message || "Erro desconhecido"));
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

// 4. FUNÇÃO DO CÁLCULO DO SCORE (Média Ponderada Oficial)
// 4. FUNÇÃO DO CÁLCULO DO SCORE (Média Ponderada Inteligente)
function extrairValor(campo) {
    if (campo === undefined || campo === null) return 0;
    if (typeof campo === 'number') return campo;
    if (typeof campo === 'object') {
        // Se for IPARDES com anos (ex: { "2023": 0.81, "2022": 0.72 })
        if (campo['2023'] !== undefined) return Number(campo['2023']) || 0;
        if (campo['2022'] !== undefined) return Number(campo['2022']) || 0;
        if (campo.valor !== undefined) return Number(campo.valor) || 0;
    }
    return Number(campo) || 0;
}

function calcularLivingScore(indicadores) {
    if (!indicadores) return "0.0";

    const PESOS = { seguranca: 3, educacao: 3, saude: 2, economia: 2 };
    
    // Educação: Lê IPARDES (0 a 1) e converte para escala de 100 pontos
    let edu = extrairValor(indicadores.educacao);
    if (edu === 0) edu = extrairValor(indicadores.ideb) / 10;
    const notaEdu = edu <= 1 ? (edu * 100) : edu;

    // Saúde: Lê IPARDES (0 a 1) e converte para escala de 100 pontos
    let sau = extrairValor(indicadores.saude);
    if (sau === 0) sau = extrairValor(indicadores.saude_leitos) / 10;
    const notaSau = sau <= 1 ? (sau * 100) : sau;

    // Segurança e Economia
    const seg = extrairValor(indicadores.seguranca_indice) || 75; // Padrão provisório até a etapa de Segurança
    const pib = extrairValor(indicadores.pib_per_capita);
    const eco = pib > 0 ? (pib > 50000 ? 100 : (pib / 500)) : 70; // Padrão provisório

    const resultado = (
        (seg * PESOS.seguranca) +
        (notaEdu * PESOS.educacao) +
        (notaSau * PESOS.saude) +
        (eco * PESOS.economia)
    ) / 10;

    return Math.min(100, Math.max(0, resultado)).toFixed(1);
}

// ==========================================
// ROTAS PÚBLICAS
// ==========================================

app.get('/', (req, res) => {
    res.send('🚀 Servidor do Paraná Living Score está online e operante!');
});

// Listar todas as cidades
app.get('/api/cidades', async (req, res) => {
    try {
        const cidades = await Cidade.find().select('nome ibge_id indicadores relatorio_ia score_calculado');
        const formatadas = cidades.map(c => {
            const obj = c.toObject();
            obj.score_final = calcularLivingScore(c.indicadores);
            return obj;
        });
        res.json(formatadas);
    } catch (err) {
        res.status(500).json({ erro: err.message });
    }
});

// Ranking Oficial ordenado por score
// Ranking Oficial com Mesorregião do IBGE incluída
app.get('/api/cidades/ranking', async (req, res) => {
    try {
        const cidades = await Cidade.find();
        const ibges = await IBGEMunicipio.find().select('ibge_id nome geografia');
        
        // Mapeia mesorregião por IBGE ID e por Nome
        const ibgeMap = new Map();
        ibges.forEach(i => {
            if (i.ibge_id) ibgeMap.set(String(i.ibge_id), i.geografia?.mesorregiao || '');
            if (i.nome) ibgeMap.set(i.nome.toLowerCase(), i.geografia?.mesorregiao || '');
        });

        const cidadesComScore = cidades.map(c => {
            const obj = c.toObject();
            obj.score_final = parseFloat(calcularLivingScore(c.indicadores));
            obj.mesorregiao = ibgeMap.get(String(c.ibge_id)) || ibgeMap.get(c.nome?.toLowerCase()) || 'Geral';
            return obj;
        });

        cidadesComScore.sort((a, b) => b.score_final - a.score_final);
        res.json(cidadesComScore);
    } catch (err) {
        res.status(500).json({ erro: "Erro ao gerar ranking: " + err.message });
    }
});
// Rota de Ficha Completa: Paraná Living Score + Contexto IBGE
app.get('/api/cidades/detalhes/:termo', async (req, res) => {
    try {
        const termo = decodeURIComponent(req.params.termo).trim();
        const ehNumero = !isNaN(Number(termo));

        // 1. Busca na base do Paraná Living Score (por nome ou ibge_id)
        const filtroPLS = ehNumero ? { ibge_id: Number(termo) } : { nome: new RegExp(`^${termo}$`, 'i') };
        let cidade = await Cidade.findOne(filtroPLS);

        if (!cidade) {
            return res.status(404).json({ erro: "Município não encontrado na base do Paraná Living Score." });
        }

        // 2. Busca na base de contexto do IBGE
        const ibgeInfo = await IBGEMunicipio.findOne({ 
            $or: [
                { ibge_id: cidade.ibge_id },
                { nome: new RegExp(`^${cidade.nome}$`, 'i') }
            ]
        });

        // 3. Clima em tempo real (OpenWeatherMap)
        let climaDados = null;
        if (process.env.WEATHER_API_KEY) {
            try {
                const weatherUrl = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(cidade.nome)},BR&units=metric&lang=pt_br&appid=${process.env.WEATHER_API_KEY}`;
                const weatherRes = await axios.get(weatherUrl);
                climaDados = {
                    temp: Math.round(weatherRes.data.main.temp),
                    descricao: weatherRes.data.weather[0].description,
                    icone: weatherRes.data.weather[0].icon,
                    umidade: weatherRes.data.main.humidity
                };
            } catch (errWeather) {
                // Se der erro no clima, continua sem travar
            }
        }

        const scoreFinal = calcularLivingScore(cidade.indicadores);

        res.json({
            cidade: cidade.toObject(),
            ibge: ibgeInfo ? ibgeInfo.toObject() : null,
            score_final: scoreFinal,
            clima: climaDados
        });

    } catch (err) {
        res.status(500).json({ erro: "Erro ao carregar detalhes do município: " + err.message });
    }
});

// Buscar cidade específica + Clima + Relatório IA
app.get('/api/cidades/busca/:nome', async (req, res) => {
    try {
        const nomeCidade = req.params.nome;
        let cidade = await Cidade.findOne({ nome: new RegExp(`^${nomeCidade}$`, 'i') });

        if (!cidade) return res.status(404).json({ erro: "Cidade não encontrada" });

        // Clima em tempo real
        let climaDados = null;
        if (process.env.WEATHER_API_KEY) {
            try {
                const weatherUrl = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(nomeCidade)},BR&units=metric&lang=pt_br&appid=${process.env.WEATHER_API_KEY}`;
                const weatherRes = await axios.get(weatherUrl);
                climaDados = {
                    temp: Math.round(weatherRes.data.main.temp),
                    descricao: weatherRes.data.weather[0].description,
                    icone: weatherRes.data.weather[0].icon,
                    umidade: weatherRes.data.main.humidity
                };
            } catch (errWeather) {
                console.error("Aviso: Falha ao buscar clima:", errWeather.message);
            }
        }

        const scoreFinal = calcularLivingScore(cidade.indicadores);

        // Relatório IA sob demanda baseado nos dados oficiais
        if (!cidade.relatorio_ia || cidade.relatorio_ia.trim() === '' || cidade.relatorio_ia.includes("Aguardando")) {
            try {
                const pib = extrairValor(cidade.indicadores?.pib_per_capita);
                const ideb = extrairValor(cidade.indicadores?.ideb);
                const seg = extrairValor(cidade.indicadores?.seguranca_indice);
                const leitos = extrairValor(cidade.indicadores?.saude_leitos);

                const prompt = `
                    Você é o consultor oficial do Paraná Living Score.
                    Escreva uma análise executiva e agradável de no máximo 3 frases sobre a qualidade de vida em ${cidade.nome}/PR.
                    
                    Dados Oficiais da Base:
                    - Living Score Oficial: ${scoreFinal}/100
                    - IDEB: ${ideb || 'N/D'}
                    - Segurança Pública: ${seg || 'N/D'}/100
                    - PIB per Capita: R$ ${pib ? pib.toLocaleString('pt-BR') : 'N/D'}
                    - Leitos SUS / 1k hab: ${leitos || 'N/D'}

                    Diretrizes: Baseie-se estritamente nestes dados oficiais. Não invente números.
                `;
                cidade.relatorio_ia = await gerarTextoComIA(prompt);
                await cidade.save();
            } catch (errIA) {
                console.error("Aviso: Falha ao gerar IA inicial:", errIA.message);
            }
        }

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
// ROTAS DE AUTENTICAÇÃO
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

// ==========================================
// ROTAS PRIVADAS DO USUÁRIO
// ==========================================
// ==========================================
// ROTAS DE GERENCIAMENTO DO HISTÓRICO DA CAPIÁ
// ==========================================

// 1. Listar todas as conversas do usuário (para o menu lateral)
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

// 2. Carregar mensagens de uma conversa específica
app.get('/api/chat/conversa/:id', verificarToken, async (req, res) => {
    try {
        const conversa = await Conversa.findOne({ _id: req.params.id, usuario_id: req.usuario.id });
        if (!conversa) return res.status(404).json({ erro: "Conversa não encontrada." });
        res.json({ mensagens: conversa.mensagens, conversaId: conversa._id });
    } catch (err) {
        res.status(500).json({ erro: "Erro ao abrir conversa: " + err.message });
    }
});

// 3. Excluir uma conversa específica
app.delete('/api/chat/conversa/:id', verificarToken, async (req, res) => {
    try {
        await Conversa.findOneAndDelete({ _id: req.params.id, usuario_id: req.usuario.id });
        res.json({ msg: "Conversa excluída com sucesso!" });
    } catch (err) {
        res.status(500).json({ erro: "Erro ao excluir conversa: " + err.message });
    }
});

// 4. Limpar todas as conversas
app.delete('/api/chat/limpar', verificarToken, async (req, res) => {
    try {
        await Conversa.deleteMany({ usuario_id: req.usuario.id });
        res.json({ msg: "Histórico completo limpo com sucesso!" });
    } catch (err) {
        res.status(500).json({ erro: "Erro ao limpar histórico: " + err.message });
    }
});


app.get('/api/usuario/perfil', verificarToken, async (req, res) => {
    try {
        const usuario = await Usuario.findById(req.usuario.id).select('-senha');
        if (!usuario) return res.status(404).json({ erro: "Usuário não encontrado." });
        res.json(usuario);
    } catch (err) {
        res.status(500).json({ erro: err.message });
    }
});

app.put('/api/usuario/perfil', verificarToken, async (req, res) => {
    try {
        const { nome, senha } = req.body;
        const usuario = await Usuario.findById(req.usuario.id);
        if (!usuario) return res.status(404).json({ erro: "Usuário não encontrado." });

        if (nome) usuario.nome = nome;
        if (senha && senha.trim().length >= 4) {
            const salt = await bcrypt.genSalt(10);
            usuario.senha = await bcrypt.hash(senha, salt);
        }

        await usuario.save();
        res.json({ 
            msg: "Perfil atualizado com sucesso!", 
            usuario: { id: usuario._id, nome: usuario.nome, email: usuario.email, role: usuario.role } 
        });
    } catch (err) {
        res.status(500).json({ erro: err.message });
    }
});

// CHAT IA COM PERSONA CONSULTOR URBANO (ESTILO CHATGPT)
// 2. CONFIGURAÇÃO DA IA GEMINI COM FILTRO ANTI-RASCUNHO
async function gerarTextoComIA(prompt) {
    const modelosParaTentar = [
        "gemini-1.5-flash",
        "gemini-1.5-flash-latest",
        "gemini-pro"
    ];

    let ultimoErro = null;
    const promptDireto = `${prompt}\n\n[IMPORTANTE: Responda diretamente ao usuário com o texto final formatado em português. NUNCA inclua rascunhos em inglês, análises internas, tags de pensamento ou planejamento prévio.]`;

    for (const nomeModelo of modelosParaTentar) {
        try {
            const model = genAI.getGenerativeModel({ model: nomeModelo });
            const result = await model.generateContent(promptDireto);
            const response = await result.response;
            let texto = response.text();

            // Limpa eventuais rascunhos de pensamento prévio vazados
            if (texto.includes("Official Urban Intelligence Consultant")) {
                const partes = texto.split("Official Urban Intelligence Consultant");
                texto = partes[partes.length - 1];
            }
            if (texto.includes("📊") || texto.includes("Olá!")) {
                const idxInicio = Math.min(
                    texto.indexOf("📊") !== -1 ? texto.indexOf("📊") : Infinity,
                    texto.indexOf("Olá!") !== -1 ? texto.indexOf("Olá!") : Infinity
                );
                if (idxInicio !== Infinity) {
                    texto = texto.substring(idxInicio);
                }
            }

            return texto.trim();
        } catch (err) {
            ultimoErro = err;
            console.warn(`⚠️ Tentativa com ${nomeModelo} falhou, tentando próximo...`);
        }
    }

    throw new Error("Falha na IA: " + (ultimoErro?.message || "Erro desconhecido"));
}

// 3. CHAT IA: DETECÇÃO INTELIGENTE DE CIDADES + DADOS REAIS DO IPARDES E IBGE
// 2. CONFIGURAÇÃO DA IA GEMINI COM SYSTEM INSTRUCTION NATIVA
async function gerarTextoComIA(prompt, contextoInstrucao = "") {
    const modelosParaTentar = [
        "gemini-1.5-flash",
        "gemini-1.5-flash-latest",
        "gemini-pro"
    ];

    let ultimoErro = null;

    const systemPrompt = contextoInstrucao || `
Você é o Consultor Oficial de Inteligência Urbana do projeto Paraná Living Score.
Você interpreta dados oficiais do IPARDES e IBGE com tom amigável, analítico, persuasivo e altamente conversacional (estilo ChatGPT).
NUNCA mostre rascunhos de pensamento, análises em inglês ou notas de planejamento. Responda diretamente ao usuário com formatação rica em Markdown (títulos, negrito, tópicos e divisórias).
`;

    for (const nomeModelo of modelosParaTentar) {
        try {
            const model = genAI.getGenerativeModel({ 
                model: nomeModelo,
                systemInstruction: systemPrompt,
                generationConfig: {
                    temperature: 0.7
                }
            });

            const result = await model.generateContent(prompt);
            const response = await result.response;
            let texto = response.text();

            // Filtro de segurança para limpar qualquer resquício de rascunho
            if (texto.includes("Official Urban Intelligence Consultant") || texto.includes("Main Data:")) {
                const linhas = texto.split('\n').filter(l => !l.includes('* *') && !l.includes('Authority based on data'));
                texto = linhas.join('\n');
            }

            return texto.trim();
        } catch (err) {
            ultimoErro = err;
            console.warn(`⚠️ Tentativa com ${nomeModelo} falhou:`, err.message);
        }
    }

    throw new Error("Falha na IA: " + (ultimoErro?.message || "Erro desconhecido"));
}

// BUSCA DE CIDADE COM GERAÇÃO INTELIGENTE DE RELATÓRIO IA
app.get('/api/cidades/busca/:nome', async (req, res) => {
    try {
        const nomeCidade = req.params.nome;
        let cidade = await Cidade.findOne({ nome: new RegExp(`^${nomeCidade}$`, 'i') });

        if (!cidade) return res.status(404).json({ erro: "Cidade não encontrada" });

        let climaDados = null;
        if (process.env.WEATHER_API_KEY) {
            try {
                const weatherUrl = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(nomeCidade)},BR&units=metric&lang=pt_br&appid=${process.env.WEATHER_API_KEY}`;
                const weatherRes = await axios.get(weatherUrl);
                climaDados = {
                    temp: Math.round(weatherRes.data.main.temp),
                    descricao: weatherRes.data.weather[0].description,
                    icone: weatherRes.data.weather[0].icon,
                    umidade: weatherRes.data.main.humidity
                };
            } catch (errWeather) {}
        }

        const scoreFinal = calcularLivingScore(cidade.indicadores);
        const ind = cidade.indicadores || {};

        // Extrai os dados reais do IPARDES
        const edu23 = ind.educacao?.['2023'] ? Number(ind.educacao['2023']).toFixed(4) : (ind.educacao?.['2022'] || 'N/D');
        const sau23 = ind.saude?.['2023'] ? Number(ind.saude['2023']).toFixed(4) : (ind.saude?.['2022'] || 'N/D');
        const eco23 = ind.economia?.['2023'] ? Number(ind.economia['2023']).toFixed(4) : (ind.economia?.['2022'] || 'N/D');

        // Gera relatório dinâmico caso não exista
        if (!cidade.relatorio_ia || cidade.relatorio_ia.trim() === '' || cidade.relatorio_ia.includes("Aguardando") || cidade.relatorio_ia.includes("N/D")) {
            try {
                const promptCidade = `
Analise a qualidade de vida no município de ${cidade.nome}/PR.

DADOS OFICIAIS DO BANCO:
- Living Score Oficial: ${scoreFinal}/100
- Educação (IPARDES 2023): ${edu23} (escala 0 a 1)
- Saúde (IPARDES 2023): ${sau23} (escala 0 a 1)
- Renda e Emprego (IPARDES 2023): ${eco23} (escala 0 a 1)

Escreva uma análise executiva e elegante de 2 a 3 frases destacando o score e os pontos fortes da cidade.
`;
                cidade.relatorio_ia = await gerarTextoComIA(promptCidade);
                await cidade.save();
            } catch (errIA) {}
        }

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

// CHAT IA COM RAG COMPLETO E FORMATAÇÃO PREMIUM
// 2. CONFIGURAÇÃO DA CAPIÁ IA (COM PERSONALIDADE NATIVA)
async function gerarTextoComIA(prompt) {
    const modelosParaTentar = [
        "gemini-1.5-flash",
        "gemini-1.5-flash-latest",
        "gemini-pro"
    ];

    const systemPromptCapiá = `
Você é a CAPIÁ 🦫, a inteligência artificial oficial do Paraná Living Score (PLS).
Sua identidade é inspirada em uma capivara: tranquila, curiosa, analítica, imparcial, acolhedora e paranaense.

LEMA: "Vamos entender o Paraná pelos dados."
CRENÇA CENTRAL: "Conhecer uma cidade é mais do que conhecer sua nota."

SUAS 6 CARACTERÍSTICAS FUNDAMENTAIS:
1. TRANQUILA: Nunca use sensacionalismo ("cidade péssima/perfeita"). Prefira "um indicador que merece atenção" ou "resultado consistente".
2. CURIOSA: Use expressões como "Olha só que interessante...", "Vale a pena observar esse indicador...", "Tem um detalhe curioso aqui...".
3. ANALÍTICA: Baseie-se estritamente nos dados oficiais do IPARDES e IBGE. Converta índices de 0 a 1 para notas de 0 a 10 (ex: 0.8111 vira 8.1/10).
4. IMPARCIAL: Não tenha cidades favoritas. Mostre os pontos fortes e os pontos de atenção de cada município.
5. PARANAENSE: Conheça as mesorregiões (Oeste, Norte, RMC, Campos Gerais, Sudoeste, etc.) e a vocação regional (agro, indústria, serviços). Use emojis sutis como 🦫, 🌲, 📊, 📍, 🎓, 🏥, 💼, 🌾.
6. SIMPÁTICA: Conversacional, elegante, acolhedora e inteligente (estilo ChatGPT).

ESTRUTURA DE ANÁLISE DE CIDADES:
- Saudação acolhedora da Capiá 🦫
- 📊 Living Score Oficial (com breve contextualização)
- 🔍 Indicadores Oficiais (IPARDES: Educação, Saúde, Economia com evolução 2022 -> 2023)
- 🌲 Contexto Regional e População (IBGE)
- 🦫 Análise da Capiá (reflexão curiosa e equilibrada sobre pontos fortes e de atenção)
- Fechamento simpático convidando a comparar ou analisar outro município.

REGRA TÉCNICA: Responda diretamente com a resposta final em Markdown formatado. NUNCA exiba notas de planejamento, rascunhos em inglês ou tags de pensamento.
`;

    let ultimoErro = null;

    for (const nomeModelo of modelosParaTentar) {
        try {
            const model = genAI.getGenerativeModel({ 
                model: nomeModelo,
                systemInstruction: systemPromptCapiá,
                generationConfig: { temperature: 0.7 }
            });

            const result = await model.generateContent(prompt);
            const response = await result.response;
            let texto = response.text();

            // Limpeza de segurança caso vaze qualquer rascunho
            if (texto.includes("Official Urban Intelligence") || texto.includes("Main Data:")) {
                const linhas = texto.split('\n').filter(l => !l.includes('* *') && !l.includes('Authority based'));
                texto = linhas.join('\n');
            }

            return texto.trim();
        } catch (err) {
            ultimoErro = err;
            console.warn(`⚠️ Tentativa com ${nomeModelo} falhou:`, err.message);
        }
    }

    throw new Error("Falha na IA Capiá: " + (ultimoErro?.message || "Erro desconhecido"));
}

// ROTA DO CHAT COM A CAPIÁ
app.post('/api/chat/enviar', verificarToken, async (req, res) => {
    try {
        const { mensagem, conversaId } = req.body;
        if (!mensagem) return res.status(400).json({ erro: "A mensagem não pode ser vazia." });

        const todasCidades = await Cidade.find().sort({ score_calculado: -1 });
        const todosIBGE = await IBGEMunicipio.find();

        const ibgeMap = new Map();
        todosIBGE.forEach(i => {
            if (i.nome) ibgeMap.set(i.nome.toLowerCase(), i);
        });

        // Identifica municípios citados na pergunta
        const msgLower = mensagem.toLowerCase();
        const cidadesMencionadas = todasCidades.filter(c => msgLower.includes(c.nome.toLowerCase()));

        let contextoCidades = "";

        if (cidadesMencionadas.length > 0) {
            contextoCidades = "DADOS OFICIAIS DAS CIDADES CONSULTADAS:\n";
            cidadesMencionadas.forEach(c => {
                const score = calcularLivingScore(c.indicadores);
                const ind = c.indicadores || {};
                const ibge = ibgeMap.get(c.nome.toLowerCase());

                const edu22 = ind.educacao?.['2022'] ? Number(ind.educacao['2022']).toFixed(4) : '0.0';
                const edu23 = ind.educacao?.['2023'] ? Number(ind.educacao['2023']).toFixed(4) : '0.0';

                const sau22 = ind.saude?.['2022'] ? Number(ind.saude['2022']).toFixed(4) : '0.0';
                const sau23 = ind.saude?.['2023'] ? Number(ind.saude['2023']).toFixed(4) : '0.0';

                const eco22 = ind.economia?.['2022'] ? Number(ind.economia['2022']).toFixed(4) : '0.0';
                const eco23 = ind.economia?.['2023'] ? Number(ind.economia['2023']).toFixed(4) : '0.0';

                contextoCidades += `
• MUNICÍPIO: ${c.nome} (Código IBGE: ${c.ibge_id})
  - Living Score: ${score}/100
  - Educação (IPARDES): 2022 = ${edu22} | 2023 = ${edu23} (Nota: ${(Number(edu23) * 10).toFixed(1)}/10)
  - Saúde (IPARDES): 2022 = ${sau22} | 2023 = ${sau23} (Nota: ${(Number(sau23) * 10).toFixed(1)}/10)
  - Economia/Renda (IPARDES): 2022 = ${eco22} | 2023 = ${eco23} (Nota: ${(Number(eco23) * 10).toFixed(1)}/10)
  - Mesorregião (IBGE): ${ibge?.geografia?.mesorregiao || 'Paraná'} (Microrregião: ${ibge?.geografia?.microrregiao || 'Regional'})
  - População: ${ibge?.demografia?.populacao_censo_2022 ? Number(ibge.demografia.populacao_censo_2022).toLocaleString('pt-BR') + ' habitantes' : 'Em catalogação'}
`;
            });
        }

        let contextoTopRanking = "TOP 10 CIDADES NO RANKING GERAL:\n";
        todasCidades.slice(0, 10).forEach((c, idx) => {
            contextoTopRanking += `${idx + 1}º ${c.nome} (${calcularLivingScore(c.indicadores)} pts)\n`;
        });

        const promptCapiá = `
PERGUNTA DO USUÁRIO: "${mensagem}"

DADOS DISPONÍVEIS NA BASE DO PARANÁ LIVING SCORE:
${contextoCidades}
${contextoTopRanking}

Responda com a voz e personalidade da Capiá 🦫. Explique os dados com clareza, destaque os pontos fortes e pontos de atenção com imparcialidade, e use a estrutura padrão de análise.
`;

        const respostaIA = await gerarTextoComIA(promptCapiá);

        let conversa;
        if (conversaId) {
            conversa = await Conversa.findOne({ _id: conversaId, usuario_id: req.usuario.id });
        }

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

// Catálogo de indicadores aceitos
app.get('/api/admin/indicadores/catalogo', verificarAdmin, (req, res) => {
    res.json(DICIONARIO_INDICADORES);
});

// Listar todas as cidades completas (para a tabela do Admin)
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

// Obter uma cidade por ID
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

// Cadastrar nova cidade com indicadores
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

// Atualizar cidade e indicadores existentes
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
        cidade.relatorio_ia = ""; // Força novo relatório alinhado aos novos dados

        await cidade.save();
        res.json({ msg: "Cidade e indicadores atualizados com sucesso!", cidade });
    } catch (err) {
        res.status(500).json({ erro: "Erro ao atualizar cidade: " + err.message });
    }
});

// Excluir cidade
app.delete('/api/admin/cidades/:id', verificarAdmin, async (req, res) => {
    try {
        const cidade = await Cidade.findByIdAndDelete(req.params.id);
        if (!cidade) return res.status(404).json({ erro: "Cidade não encontrada." });
        res.json({ msg: `Cidade ${cidade.nome} excluída com sucesso!` });
    } catch (err) {
        res.status(500).json({ erro: "Erro ao excluir cidade: " + err.message });
    }
});

// Treinamento contextual via IA
app.post('/api/admin/treinar-chat', verificarAdmin, async (req, res) => {
    try {
        const { cidadeNome, mensagemAdmin } = req.body;
        const cidade = await Cidade.findOne({ nome: new RegExp(`^${cidadeNome}$`, 'i') });
        
        if (!cidade) return res.status(404).json({ resposta: "Cidade não encontrada." });

        const promptTreino = `
            Você é um assistente de banco de dados do Paraná Living Score. O Administrador está ensinando sobre ${cidadeNome}.
            INFORMAÇÃO NOVA: "${mensagemAdmin}"
            MEMÓRIA ATUAL: "${cidade.info_curadoria || ''}"
            
            Sua missão:
            1. Una a info nova com a memória atual de forma coerente.
            2. Responda confirmando o que aprendeu.
            3. No fim da resposta, inclua exatamente a tag [MEMORIA] seguida do texto unificado.
        `;

        const respostaIA = await gerarTextoComIA(promptTreino);

        if (respostaIA.includes("[MEMORIA]")) {
            const partes = respostaIA.split("[MEMORIA]");
            cidade.info_curadoria = partes[1].trim();
            cidade.relatorio_ia = ""; 
            await cidade.save();
            res.json({ resposta: partes[0].trim() });
        } else {
            res.json({ resposta: "Aprendizado registrado com sucesso!" });
        }
    } catch (err) { 
        res.status(500).json({ resposta: "Erro na IA: " + err.message }); 
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Servidor rodando na porta ${PORT}`));