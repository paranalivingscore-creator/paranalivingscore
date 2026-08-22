require('dotenv').config();
const { GoogleGenerativeAI } = require("@google/generative-ai");

async function testarModelosDisponiveis() {
    console.log("==================================================");
    console.log("🔍 TESTE DE MODELOS DA IA - PARANÁ LIVING SCORE");
    console.log("==================================================");
    console.log("Chave carregada do .env:", process.env.GEMINI_KEY ? `${process.env.GEMINI_KEY.substring(0, 8)}...` : "❌ NÃO ENCONTRADA");
    console.log("--------------------------------------------------");

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_KEY);

    // Lista de modelos para testar
    const modelosParaTestar = [
        "gemini-1.5-flash",
        "gemini-1.5-flash-latest",
        "gemini-1.5-flash-8b",
        "gemini-1.5-pro",
        "gemini-1.5-pro-latest",
        "gemini-pro",
        "gemma-2-27b-it",
        "gemma-2-9b-it"
    ];

    let algumFuncionou = false;
    const modelosValidos = [];

    for (const nomeModelo of modelosParaTestar) {
        process.stdout.write(`⏳ Testando modelo: [${nomeModelo}] ... `);
        try {
            const model = genAI.getGenerativeModel({ model: nomeModelo });
            const result = await model.generateContent("Responda apenas com a palavra: OK");
            const response = await result.response;
            const texto = response.text().trim();

            console.log(`✅ SUCESSO! Resposta: "${texto}"`);
            modelosValidos.push(nomeModelo);
            algumFuncionou = true;
        } catch (erro) {
            console.log(`❌ FALHOU`);
            console.log(`   Motivo: ${erro.message}`);
        }
    }

    console.log("\n==================================================");
    if (algumFuncionou) {
        console.log("🎉 MODELOS QUE FUNCIONARAM COM SUCESSO:");
        modelosValidos.forEach(m => console.log(`   👉 "${m}"`));
        console.log("\nCopie o primeiro da lista acima e coloque no server.js!");
    } else {
        console.log("⚠️ NENHUM modelo respondeu com sucesso.");
    }
    console.log("==================================================");
}

testarModelosDisponiveis();