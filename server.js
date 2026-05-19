require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const axios = require('axios');

const app = express();
app.use(cors());
app.use(express.json());

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

// 4. ROTA DE BUSCA PÚBLICA (Lê a memória do Admin)
app.get('/api/cidades/busca/:nome', async (req, res) => {
    try {
        const nomeCidade = req.params.nome;
        let cidade = await Cidade.findOne({ nome: new RegExp(`^${nomeCidade}$`, 'i') });

        if (!cidade) return res.status(404).json({ erro: "Cidade não encontrada" });

        // --- NOVIDADE: BUSCANDO CLIMA EM TEMPO REAL (Serviço em Nuvem) ---
        let climaDados = null;
        try {
            const weatherUrl = `https://api.openweathermap.org/data/2.5/weather?q=${nomeCidade},BR&units=metric&lang=pt_br&appid=${process.env.WEATHER_API_KEY}`;
            const weatherRes = await axios.get(weatherUrl);
            climaDados = {
                temp: Math.round(weatherRes.data.main.temp),
                descricao: weatherRes.data.weather[0].description,
                icone: weatherRes.data.weather[0].icon,
                umidade: weatherRes.data.main.humidity
            };
        } catch (errWeather) {
            console.error("Erro ao buscar clima:", errWeather.message);
        }

        // --- LÓGICA DA IA (Mantém a que já tínhamos) ---
        if (!cidade.relatorio_ia || cidade.relatorio_ia.includes("Aguardando")) {
            console.log(`🤖 IA gerando relatório para: ${cidade.nome}...`);
            const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
            const prompt = `Analise a qualidade de vida em ${cidade.nome}/PR. PIB: ${cidade.indicadores.pib_per_capita}, IDEB: ${cidade.indicadores.ideb}. Seja breve.`;
            const result = await model.generateContent(prompt);
            cidade.relatorio_ia = (await result.response).text();
            await cidade.save();
        }

        // --- RESPOSTA FINAL (Dados do Banco + Dados da Nuvem + Data Atual) ---
        res.json({
            ...cidade.toObject(),
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

app.listen(3000, () => console.log("🚀 SERVIDOR ON-LINE NA PORTA 3000"));