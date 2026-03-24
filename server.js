// C:\pfc\backend\server.js
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const Cidade = require('./models/Cidade');

const app = express();

// Configurações de segurança e leitura de JSON
app.use(cors());
app.use(express.json());

// Conexão com o MongoDB
console.log('⏳ Tentando conectar ao MongoDB...');
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('✅ Conectado ao MongoDB com sucesso!'))
    .catch(err => console.error('❌ Erro ao conectar no MongoDB:', err.message));

// ==========================================
// ROTAS DA API
// ==========================================

// Rota de teste
app.get('/', (req, res) => {
    res.send('API do Paraná Living Score está online! 🚀');
});

// Rota para buscar todas as cidades (usada no Ranking)
app.get('/api/cidades', async (req, res) => {
    try {
        const cidades = await Cidade.find().sort({ score_geral: -1 });
        res.json(cidades);
    } catch (erro) {
        res.status(500).json({ erro: 'Erro ao buscar cidades' });
    }
});

// Rota para buscar cidade pelo nome (Busca IA)
app.get('/api/cidades/busca/:nome', async (req, res) => {
    try {
        const regexBusca = new RegExp(req.params.nome, 'i'); // ignora maiúsculas/minúsculas
        const cidade = await Cidade.findOne({ nome: regexBusca });

        if (cidade) res.json(cidade);
        else res.status(404).json({ mensagem: 'Cidade não encontrada' });
    } catch (erro) {
        res.status(500).json({ erro: 'Erro na busca' });
    }
});

// Iniciar o Servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor rodando em http://localhost:${PORT}`);
});