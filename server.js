require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const axios = require('axios');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Modelos do Banco e Configurações (SEM DEPENDÊNCIAS FALTANDO)
const Cidade = require('./models/Cidade');
const Usuario = require('./models/Usuario');
const Conversa = require('./models/Conversa');
const DICIONARIO_INDICADORES = require('./config/dicionarioIndicadores');

const app = express();
app.use(cors());
app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET || "chave_secreta_pls_2024";

// 1. CONEXÃO MONGODB
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log("✅ MongoDB Conectado com sucesso!"))
    .catch(err => console.error("❌ Erro ao conectar no MongoDB:", err));

// 2. CONFIGURAÇÃO DA IA GEMINI (CAPIÁ)
const genAI = new GoogleGenerativeAI(process.env.GEMINI_KEY || "");

async function gerarTextoComIA(prompt) {
    const modelosParaTentar = [
        "gemini-1.5-flash",
        "gemini-1.5-flash-latest",
        "gemini-pro"
    ];

    const systemPromptCapiá = `
Você é a CAPIÁ 🦫, a inteligência artificial oficial do Paraná Living Score (PLS).
Sua identidade é inspirada em uma capivara: calma, analítica, acolhedora e paranaense.
LEMA: "Vamos entender o Paraná pelos dados."
Responda diretamente ao usuário em português formatado em Markdown. Nunca inclua rascunhos em inglês ou análises internas.
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

// 4. FUNÇÃO DO CÁLCULO DO SCORE (Média Ponderada)
function extrairValor(campo) {
    if (campo === undefined || campo === null) return 0;
    if (typeof campo === 'number') return campo;
    if (typeof campo === 'object') {
        if (campo['2023'] !== undefined) return Number(campo['2023']) || 0;
        if (campo['2022'] !== undefined) return Number(campo['2022']) || 0;
        if (campo.valor !== undefined) return Number(campo.valor) || 0;
    }
    return Number(campo) || 0;
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

    const seg = extrairValor(indicadores.seguranca) || extrairValor(indicadores.seguranca_indice) || 75;
    const pib = extrairValor(indicadores.pib_per_capita);
    let eco = extrairValor(indicadores.economia);
    if (eco > 0 && eco <= 1) eco = eco * 100;
    else if (pib > 0) eco = (pib > 50000 ? 100 : (pib / 500));
    else eco = 70;

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
    res.send('🚀 Servidor do Paraná Living Score está online e operante no Render!');
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

// Ranking Oficial
app.get('/api/cidades/ranking', async (req, res) => {
    try {
        const cidades = await Cidade.find();
        const cidadesComScore = cidades.map(c => {
            const obj = c.toObject();
            obj.score_final = parseFloat(calcularLivingScore(c.indicadores));
            obj.mesorregiao = 'Paraná';
            return obj;
        });

        cidadesComScore.sort((a, b) => b.score_final - a.score_final);
        res.json(cidadesComScore);
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

        let cidade = await Cidade.findOne(query);

        if (!cidade && !ehNumero) {
            cidade = await Cidade.findOne({ nome: { $regex: new RegExp(termoBruto, 'i') } });
        }

        if (!cidade) {
            return res.status(404).json({ erro: `Município "${termoBruto}" não encontrado na base de dados.` });
        }

        // Clima em tempo real (OpenWeatherMap)
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
            } catch (errWeather) {}
        }

        // Metadados do IBGE
        let ibgeInfo = {
            geografia: {
                mesorregiao: "Oeste Paranaense",
                microrregiao: "Toledo",
                regiao_imediata: "Toledo",
                regiao_intermediaria: "Cascavel"
            },
            demografia: {
                populacao_censo_2022: 36808,
                area_km2: 846.6
            }
        };

        if (cidade.ibge_id) {
            try {
                const ibgeRes = await axios.get(`https://servicodados.ibge.gov.br/api/v1/localidades/municipios/${cidade.ibge_id}`, { timeout: 3000 });
                if (ibgeRes.data) {
                    ibgeInfo.geografia.mesorregiao = ibgeRes.data.microrregiao?.mesorregiao?.nome || ibgeInfo.geografia.mesorregiao;
                    ibgeInfo.geografia.microrregiao = ibgeRes.data.microrregiao?.nome || ibgeInfo.geografia.microrregiao;
                    ibgeInfo.geografia.regiao_imediata = ibgeRes.data['regiao-imediata']?.nome || ibgeInfo.geografia.regiao_imediata;
                    ibgeInfo.geografia.regiao_intermediaria = ibgeRes.data['regiao-imediata']?.['regiao-intermediaria']?.nome || ibgeInfo.geografia.regiao_intermediaria;
                }
            } catch (e) {}
        }

        const scoreCalculado = calcularLivingScore(cidade.indicadores);

        res.json({
            cidade: cidade.toObject(),
            score_final: scoreCalculado,
            clima: climaDados,
            ibge: ibgeInfo
        });

    } catch (err) {
        console.error("Erro em /detalhes:", err);
        res.status(500).json({ erro: "Erro ao buscar detalhes: " + err.message });
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

        const todasCidades = await Cidade.find().sort({ score_calculado: -1 });
        let contextoTopRanking = "TOP 10 CIDADES NO RANKING GERAL:\n";
        todasCidades.slice(0, 10).forEach((c, idx) => {
            contextoTopRanking += `${idx + 1}º ${c.nome} (${calcularLivingScore(c.indicadores)} pts)\n`;
        });

        const promptCapiá = `
PERGUNTA DO USUÁRIO: "${mensagem}"

DADOS DISPONÍVEIS NA BASE DO PARANÁ LIVING SCORE:
${contextoTopRanking}

Responda com a voz e personalidade da Capiá 🦫. Explique os dados com clareza e imparcialidade.
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