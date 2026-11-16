require('dotenv').config();
const axios = require('axios');
const { GoogleGenerativeAI } = require("@google/generative-ai");

function comTimeout(promise, ms) {
    return Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error(`Timeout (${ms / 1000}s)`)), ms))
    ]);
}

async function testarTodosModelosTexto() {
    const key = (process.env.GEMINI_KEY || "").trim();
    const res = await axios.get(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);

    const modelosTexto = (res.data.models || [])
        .filter(m => m.supportedGenerationMethods?.includes("generateContent"))
        .map(m => m.name.replace("models/", ""))
        .filter(nome =>
            !nome.includes("tts") &&
            !nome.includes("image") &&
            !nome.includes("audio") &&
            !nome.includes("robotics") &&
            !nome.includes("computer-use") &&
            !nome.includes("deep-research") &&
            !nome.includes("2.5") &&
            !nome.includes("2.0") &&
            !nome.includes("1.5")
        );

    console.log(`📋 Testando ${modelosTexto.length} modelos (máx. 6s cada):`);
    console.log(modelosTexto.join(", "));
    console.log("--------------------------------------------------");

    const genAI = new GoogleGenerativeAI(key);
    const validos = [];

    for (const nomeModelo of modelosTexto) {
        process.stdout.write(`⏳ [${nomeModelo}] ... `);
        try {
            const model = genAI.getGenerativeModel({ model: nomeModelo });
            const result = await comTimeout(
                model.generateContent("Responda apenas com a palavra: OK"),
                6000
            );
            const texto = result.response.text().trim().replace(/\n/g, " ");
            console.log(`✅ OK -> "${texto.substring(0, 80)}"`);
            validos.push(nomeModelo);
        } catch (err) {
            const msgCurta = err.message.split('\n')[0].substring(0, 90);
            console.log(`❌ ${msgCurta}`);
        }
    }

    console.log("\n🎉 MODELOS QUE FUNCIONARAM:");
    validos.forEach(m => console.log(`   👉 "${m}"`));
}

testarTodosModelosTexto();