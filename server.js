require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const axios = require('axios');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Usuario = require('./models/Usuario');

const app = express();
app.use(cors());
app.use(express.json());
app.get('/', (req, res) => {
    res.send('🚀 Servidor do Paraná Living Score está online e operante!');
});

// 1. MODELO DE DADOS
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

// 2. CONEXÃO MONGODB
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log("✅ MongoDB Conectado com sucesso!"))
    .catch(err => console.error("❌ Erro ao conectar no MongoDB:", err));

// 3. CONFIGURAÇÃO DA IA (USANDO GEMINI-PRO PARA EVITAR 404)
const genAI = new GoogleGenerativeAI(process.env.GEMINI_KEY);

function calcularLivingScore(indicadores) {
    // Definimos os pesos de cada área (Soma total dos pesos = 10)
    const PESOS = {
        seguranca: 3,
        educacao: 3,
        saude: 2,
        economia: 2
    };

    // Pegamos os valores (se não existir o dado, usamos 0 para não quebrar o cálculo)
    const seg = indicadores.seguranca_indice || 0;
    const edu = indicadores.ideb * 10 || 0; // IDEB é 0 a 10, multiplicamos por 10 para escala 100
    const sau = indicadores.saude_leitos * 10 || 0; // Exemplo de normalização
    const eco = indicadores.pib_per_capita > 50000 ? 100 : (indicadores.pib_per_capita / 500);

    // Cálculo da Média Ponderada
    const resultado = (
        (seg * PESOS.seguranca) +
        (edu * PESOS.educacao) +
        (sau * PESOS.saude) +
        (eco * PESOS.economia)
    ) / 10;

    return resultado.toFixed(1); // Retorna com uma casa decimal (ex: 85.5)
}

// 4. ROTA DE BUSCA PÚBLICA (Lê a memória do Admin)
app.get('/api/cidades/busca/:nome', async (req, res) => {
    try {
        const nomeCidade = req.params.nome;
        let cidade = await Cidade.findOne({ nome: new RegExp(`^${nomeCidade}$`, 'i') });

        if (!cidade) return res.status(404).json({ erro: "Cidade não encontrada" });

        // --- CÁLCULO DO SCORE EM TEMPO REAL ---
        // Criamos um objeto temporário com o score calculado
        const cidadeComScore = cidade.toObject();
        cidadeComScore.score_final = calcularLivingScore(cidade.indicadores);

        // ... resto do código (clima, IA, etc) ...

        res.json({
            ...cidadeComScore,
            data_consulta: new Date().toLocaleDateString('pt-BR'),
            clima: climaDados
        });

    } catch (error) {
        res.status(500).json({ erro: error.message });
    }
});

// 5. ROTA DO CHAT ADMIN (Onde você ensina a IA)
app.post('/api/admin/treinar-chat', async (req, res) => {
    try {
        const { cidadeNome, mensagemAdmin } = req.body;
        const cidade = await Cidade.findOne({ nome: new RegExp(`^${cidadeNome}$`, 'i') });
        
        if (!cidade) return res.status(404).json({ resposta: "Cidade não encontrada." });

        const model = genAI.getGenerativeModel({ model: "gemini-pro" });

        const promptTreino = `
            Você é um assistente de banco de dados. O Administrador está te ensinando sobre ${cidadeNome}.
            INFO NOVA: "${mensagemAdmin}"
            MEMÓRIA ATUAL: "${cidade.info_curadoria}"
            
            Sua missão:
            1. Una a info nova com a memória atual.
            2. Responda confirmando o que aprendeu.
            3. No fim da resposta, coloque a tag [MEMORIA] e o texto final da memória.
        `;

        const result = await model.generateContent(promptTreino);
        const response = await result.response;
        const respostaIA = response.text();

        if (respostaIA.includes("[MEMORIA]")) {
            const partes = respostaIA.split("[MEMORIA]");
            cidade.info_curadoria = partes[1].trim();
            cidade.relatorio_ia = ""; // Reseta para a busca pública atualizar
            await cidade.save();
            res.json({ resposta: partes[0].trim() });
        } else {
            res.json({ resposta: "Aprendi! Pode continuar enviando informações." });
        }
    } catch (err) { 
        console.error("ERRO NO CHAT:", err);
        res.status(500).json({ resposta: "Erro na IA: " + err.message }); 
    }
});

app.get('/api/cidades', async (req, res) => {
    const cidades = await Cidade.find().select('nome');
    res.json(cidades);
});

app.post('/api/auth/cadastro', async (req, res) => {
    try {
        const { nome, email, senha } = req.body;

        // 1. Verifica se o usuário já existe
        const usuarioExiste = await Usuario.findOne({ email });
        if (usuarioExiste) return res.status(400).json({ erro: "E-mail já cadastrado." });

        // 2. Segurança: Criptografar a senha
        const salt = await bcrypt.genSalt(10);
        const senhaCripto = await bcrypt.hash(senha, salt);

        // 3. Salvar no banco (O primeiro a se cadastrar pode ser admin manualmente no banco)
        const novoUsuario = new Usuario({
            nome,
            email,
            senha: senhaCripto,
            role: 'user' // Por padrão, todo cadastro é usuário comum
        });

        await novoUsuario.save();
        res.status(201).json({ msg: "Usuário criado com sucesso!" });

    } catch (err) {
        res.status(500).json({ erro: err.message });
    }
});

// --- ROTA DE LOGIN ---
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, senha } = req.body;

        // 1. Verificar se o e-mail existe
        const usuario = await Usuario.findOne({ email });
        if (!usuario) return res.status(400).json({ erro: "Usuário não encontrado." });

        // 2. Verificar se a senha está correta
        const senhaCorreta = await bcrypt.compare(senha, usuario.senha);
        if (!senhaCorreta) return res.status(400).json({ erro: "Senha incorreta." });

        // 3. Criar o Token (O crachá digital)
        const token = jwt.sign(
            { id: usuario._id, role: usuario.role },
            "NOSSO_SEGREDO_SUPER_SEGURO", // Em produção, use process.env.JWT_SECRET
            { expiresIn: '1h' }
        );

        // 4. Responder com os dados e o cargo (role)
        res.json({
            token,
            usuario: { nome: usuario.nome, role: usuario.role }
        });

    } catch (err) {
        res.status(500).json({ erro: err.message });
    }
});

// Localize: app.listen(3000, ...
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Servidor rodando na porta ${PORT}`));