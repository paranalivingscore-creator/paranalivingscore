require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const axios = require('axios');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Importação dos Modelos (Certifique-se que os arquivos existem em /models)
const Usuario = require('./models/Usuario');
// Nota: Se ainda não criou o modelo Conversa, o código abaixo define a estrutura
const Conversa = require('./models/Conversa'); 

const app = express();
app.use(cors());
app.use(express.json());

// --- 1. CONFIGURAÇÃO DA IA ---
const genAI = new GoogleGenerativeAI(process.env.GEMINI_KEY);
const JWT_SECRET = process.env.GEMINI_KEY; // Usando a chave da IA como segredo do Token

// --- 2. MODELO DE CIDADE (Definido no server para garantir acesso) ---
const CidadeSchema = new mongoose.Schema({
    ibge_id: Number,
    nome: String,
    indicadores: {
        pib_per_capita: { type: Number, default: 0 },
        ideb: { type: Number, default: 0 },
        seguranca_indice: { type: Number, default: 0 },
        saude_leitos: { type: Number, default: 0 },
        taxa_emprego: { type: Number, default: 0 },
        transporte_publico: { type: Number, default: 0 }
    },
    info_curadoria: { type: String, default: "" },
    relatorio_ia: { type: String, default: "" }
});
const Cidade = mongoose.model('Cidade', CidadeSchema);

// --- 3. MIDDLEWARE DE PROTEÇÃO (Verifica se o usuário está logado) ---
const verificarToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Pega o token após "Bearer"

    if (!token) return res.status(403).json({ erro: "Acesso negado. Faça login." });

    try {
        const verificado = jwt.verify(token, JWT_SECRET);
        req.usuario = verificado; // Guarda ID e Role do usuário para usar nas rotas
        next();
    } catch (err) {
        res.status(401).json({ erro: "Sessão inválida ou expirada." });
    }
};

// --- 4. FUNÇÃO DE LÓGICA: LIVING SCORE ---
function calcularLivingScore(indicadores) {
    const PESOS = { seguranca: 3, educacao: 3, saude: 2, economia: 2 };
    const seg = indicadores.seguranca_indice || 0;
    const edu = (indicadores.ideb || 0) * 10;
    const sau = (indicadores.saude_leitos || 0) * 10;
    const eco = indicadores.pib_per_capita > 50000 ? 100 : (indicadores.pib_per_capita / 500);

    const resultado = ((seg * PESOS.seguranca) + (edu * PESOS.educacao) + (sau * PESOS.saude) + (eco * PESOS.economia)) / 10;
    return resultado.toFixed(1);
}

// --- 5. ROTAS DE AUTENTICAÇÃO (Cadastro e Login) ---

app.post('/api/auth/cadastro', async (req, res) => {
    try {
        const { nome, email, senha } = req.body;
        const existe = await Usuario.findOne({ email });
        if (existe) return res.status(400).json({ erro: "E-mail já cadastrado." });

        const salt = await bcrypt.genSalt(10);
        const senha_hash = await bcrypt.hash(senha, salt);

        const novoUsuario = new Usuario({ nome, email, senha_hash });
        await novoUsuario.save();
        res.status(201).json({ msg: "Conta criada com sucesso!" });
    } catch (err) {
        res.status(500).json({ erro: "Erro ao cadastrar: " + err.message });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, senha } = req.body;
        const usuario = await Usuario.findOne({ email });
        if (!usuario) return res.status(400).json({ erro: "Usuário não encontrado." });

        const senhaValida = await bcrypt.compare(senha, usuario.senha_hash);
        if (!senhaValida) return res.status(400).json({ erro: "Senha incorreta." });

        const token = jwt.sign({ id: usuario._id, role: usuario.role }, JWT_SECRET, { expiresIn: '2h' });
        res.json({ token, usuario: { nome: usuario.nome, role: usuario.role, email: usuario.email } });
    } catch (err) {
        res.status(500).json({ erro: "Erro no login." });
    }
});

// --- 6. ROTAS DE PERFIL (Edição e Visualização) ---

app.get('/api/usuario/perfil', verificarToken, async (req, res) => {
    try {
        const usuario = await Usuario.findById(req.usuario.id).select('-senha_hash');
        res.json(usuario);
    } catch (err) {
        res.status(500).json({ erro: "Erro ao buscar perfil." });
    }
});

app.put('/api/usuario/perfil', verificarToken, async (req, res) => {
    try {
        const { nome, email } = req.body;
        await Usuario.findByIdAndUpdate(req.usuario.id, { nome, email });
        res.json({ msg: "Perfil atualizado com sucesso!" });
    } catch (err) {
        res.status(500).json({ erro: "Erro ao atualizar perfil." });
    }
});

// --- 7. ROTAS DE CIDADES E BUSCA ---

app.get('/api/cidades/busca/:nome', async (req, res) => {
    try {
        const nomeCidade = req.params.nome;
        let cidade = await Cidade.findOne({ nome: new RegExp(`^${nomeCidade}$`, 'i') });
        if (!cidade) return res.status(404).json({ erro: "Cidade não encontrada" });

        // Busca Clima Real
        let climaDados = null;
        try {
            const weatherUrl = `https://api.openweathermap.org/data/2.5/weather?q=${nomeCidade},BR&units=metric&lang=pt_br&appid=${process.env.WEATHER_API_KEY}`;
            const weatherRes = await axios.get(weatherUrl);
            climaDados = { temp: Math.round(weatherRes.data.main.temp), descricao: weatherRes.data.weather[0].description };
        } catch (e) { console.log("Erro clima"); }

        const cidadeComScore = cidade.toObject();
        cidadeComScore.score_final = calcularLivingScore(cidade.indicadores);

        res.json({ ...cidadeComScore, clima: climaDados, data_consulta: new Date().toLocaleDateString('pt-BR') });
    } catch (error) {
        res.status(500).json({ erro: error.message });
    }
});

app.get('/api/cidades', async (req, res) => {
    const cidades = await Cidade.find().select('nome indicadores');
    // Mapeia para incluir score no ranking
    const listaComp = cidades.map(c => ({
        ...c.toObject(),
        score_final: calcularLivingScore(c.indicadores)
    }));
    res.json(listaComp);
});

// --- 8. ROTA DO CHAT COM IA E HISTÓRICO ---

app.post('/api/chat/enviar', verificarToken, async (req, res) => {
    const { mensagem, conversaId } = req.body;
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const prompt = `Você é o consultor do Paraná Living Score. Responda sobre cidades do PR. Pergunta: ${mensagem}`;
        const result = await model.generateContent(prompt);
        const respostaIA = result.response.text();

        // Persistência no histórico
        let conversa;
        if (conversaId) {
            conversa = await Conversa.findById(conversaId);
        } else {
            conversa = new Conversa({ usuario_id: req.usuario.id, titulo: mensagem.substring(0, 30) });
        }

        conversa.mensagens.push({ remetente: 'usuario', conteudo: mensagem });
        conversa.mensagens.push({ remetente: 'ia', conteudo: respostaIA });
        await conversa.save();

        res.json({ resposta: respostaIA, conversaId: conversa._id, mensagens: conversa.mensagens });
    } catch (err) {
        res.status(500).json({ erro: err.message });
    }
});

// --- 9. CONEXÃO E START ---
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log("✅ MongoDB Conectado!"))
    .catch(err => console.error("❌ Erro MongoDB:", err));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Servidor na porta ${PORT}`));