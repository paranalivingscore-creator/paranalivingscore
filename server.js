/**
 * PARANÁ LIVING SCORE - BACKEND OFICIAL
 * Tecnologias: Node.js, Express, MongoDB, Google Gemini IA
 */

require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const Cidade = require('./models/Cidade');

const app = express();

// --- CONFIGURAÇÕES ---
app.use(cors());
app.use(express.json());

// Configuração da IA Gemini (A chave deve estar no seu arquivo .env)
const genAI = new GoogleGenerativeAI(process.env.GEMINI_KEY);

// --- CONEXÃO COM O MONGODB ---
// Usando o link que funcionou nos seus testes
const MONGO_URI = "mongodb+srv://admin:admin12345@cluster0.9oqgya9.mongodb.net/ParanaLivingScore?retryWrites=true&w=majority";

console.log('⏳ Tentando conectar ao MongoDB...');
mongoose.connect(MONGO_URI)
    .then(() => console.log('✅ CONECTADO AO MONGODB COM SUCESSO!'))
    .catch(err => console.error('❌ ERRO DE CONEXÃO:', err.message));

// ============================================================
// ROTAS DA API
// ============================================================

/**
 * ROTA 1: Teste de Funcionamento
 */
app.get('/', (req, res) => {
    res.send('API Paraná Living Score está online! 🚀');
});

/**
 * ROTA 2: Buscar todas as cidades (Para o Ranking)
 */
app.get('/api/cidades', async (req, res) => {
    try {
        // Busca todas as cidades e ordena pelo Score (do maior para o menor)
        const cidades = await Cidade.find().sort({ score_geral: -1 });
        res.json(cidades);
    } catch (error) {
        res.status(500).json({ erro: "Erro ao buscar ranking", detalhes: error.message });
    }
});

/**
 * ROTA 3: Buscar cidade por nome + GERAR RELATÓRIO IA (A MAIS IMPORTANTE)
 */
app.get('/api/cidades/busca/:nome', async (req, res) => {
    try {
        const nomeCidade = req.params.nome;
        
        // Busca no banco (ignora maiúsculas e minúsculas)
        let cidade = await Cidade.findOne({ nome: new RegExp(`^${nomeCidade}$`, 'i') });

        if (!cidade) {
            return res.status(404).json({ erro: "Cidade não encontrada no banco oficial." });
        }

        // --- LÓGICA DA INTELIGÊNCIA ARTIFICIAL ---
        // Só chamamos o Gemini se a cidade ainda não tiver um relatório pronto
        const precisaDeIA = !cidade.relatorio_ia || 
                           cidade.relatorio_ia === "Análise pendente pela IA..." || 
                           cidade.relatorio_ia === "Aguardando processamento da IA...";

        if (precisaDeIA) {
            console.log(`🤖 IA está gerando relatório para: ${cidade.nome}...`);

            try {
                const model = genAI.getGenerativeModel({ model: "gemini-pro" });
                
                // O Prompt (instruções para a IA)
                const prompt = `Analise a qualidade de vida da cidade de ${cidade.nome}/PR. 
                                Considere os seguintes indicadores reais: 
                                - IDEB (Educação): ${cidade.indicadores.ideb}
                                - Segurança (Nota): ${cidade.indicadores.seguranca_indice}/100
                                - Saúde (Leitos por 1k hab): ${cidade.indicadores.saude_leitos}
                                
                                Escreva um relatório curto (máximo 120 palavras). 
                                Destaque um ponto forte, um ponto fraco e dê um veredito final para quem quer morar lá. 
                                Use um tom profissional e acolhedor.`;

                const result = await model.generateContent(prompt);
                const response = await result.response;
                const textoIA = response.text();

                // Salva o relatório gerado no banco de dados (assim não gasta créditos na próxima vez)
                cidade.relatorio_ia = textoIA;
                await cidade.save();
                
                console.log(`✅ Relatório salvo para ${cidade.nome}`);
            } catch (errorIA) {
                console.error("❌ Erro ao chamar Gemini:", errorIA.message);
                cidade.relatorio_ia = "Não foi possível gerar o relatório da IA no momento.";
            }
        }

        // Retorna a cidade completa (dados + texto da IA) para o seu site
        res.json(cidade);

    } catch (error) {
        res.status(500).json({ erro: "Erro interno no servidor", detalhes: error.message });
    }
});

// --- INICIALIZAÇÃO DO SERVIDOR ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 SERVIDOR RODANDO EM http://localhost:${PORT}`);
    console.log(`💡 Para testar o ranking: http://localhost:${PORT}/api/cidades`);
});