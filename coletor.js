/**
 * PARANÁ LIVING SCORE - MÓDULO COLETOR (INGESTÃO)
 * Este script busca dados reais na API do IBGE e popula o MongoDB.
 */

const axios = require('axios');
const mongoose = require('mongoose');
const Cidade = require('./models/Cidade');

// 1. LINK DE CONEXÃO (Senha: admin12345)
const MONGO_URI = "mongodb+srv://admin:admin12345@cluster0.9oqgya9.mongodb.net/ParanaLivingScore?retryWrites=true&w=majority";

async function iniciarColeta() {
    try {
        console.log("🚀 Iniciando Módulo Coletor de Dados Reais...");
        
        // Conectar ao banco
        await mongoose.connect(MONGO_URI);
        console.log("✅ CONEXÃO COM MONGODB ESTABELECIDA!");

        // 2. BUSCAR LISTA OFICIAL DE MUNICÍPIOS DO PARANÁ (API IBGE)
        console.log("📡 Conectando à API de Localidades do IBGE...");
        const urlIBGE = "https://servicodados.ibge.gov.br/api/v1/localidades/estados/41/municipios";
        const response = await axios.get(urlIBGE);
        const municipios = response.data;

        console.log(`📍 Sucesso! ${municipios.length} municípios encontrados no Paraná.`);

        // 3. PERCORRER CADA CIDADE E SALVAR NO BANCO
        console.log("📊 Processando indicadores e salvando no banco de dados...");

        for (let i = 0; i < municipios.length; i++) {
            const m = municipios[i];

            // Criamos o objeto da cidade com os dados REAIS do IBGE (ID e Nome)
            // Os indicadores são gerados de forma dinâmica para o seu PFC
            const dadosCidade = {
                ibge_id: m.id,
                nome: m.nome,
                indicadores: {
                    // Estes valores simulam o que viria de outras APIs (PIB, IDEB, etc)
                    pib_per_capita: Math.floor(Math.random() * (70000 - 18000) + 18000), 
                    ideb: (Math.random() * (7.9 - 4.2) + 4.2).toFixed(1),
                    seguranca_indice: Math.floor(Math.random() * (100 - 45) + 45),
                    saude_leitos: (Math.random() * 4.5).toFixed(1)
                },
                relatorio_ia: "Aguardando processamento da IA..."
            };

            // UPSERT: Se a cidade já existir (pelo ibge_id), ele atualiza. Se não existir, cria.
            // Isso evita que o seu banco fique com cidades duplicadas.
            await Cidade.findOneAndUpdate(
                { ibge_id: m.id },
                dadosCidade,
                { upsert: true, new: true }
            );

            // Log de progresso a cada 20 cidades
            if ((i + 1) % 20 === 0 || (i + 1) === municipios.length) {
                console.log(`⏳ [${i + 1}/${municipios.length}] Cidades sincronizadas...`);
            }
        }

        console.log("🏁 COLETA FINALIZADA COM SUCESSO!");
        console.log("💡 Agora você pode rodar 'node server.js' e usar o site.");
        process.exit();

    } catch (error) {
        console.error("❌ ERRO CRÍTICO NO COLETOR:", error.message);
        process.exit(1);
    }
}

// Inicia o processo
iniciarColeta();