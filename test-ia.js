require('dotenv').config();
const axios = require('axios');

async function encontrarModeloFuncional() {
    const key = process.env.GEMINI_KEY?.trim();
    console.log("🔍 Analisando todos os modelos disponíveis para sua chave...\n");

    try {
        const res = await axios.get(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
        const modelos = (res.data.models || [])
            .filter(m => m.supportedGenerationMethods && m.supportedGenerationMethods.includes("generateContent"))
            .map(m => m.name.replace("models/", ""));

        for (const modelo of modelos) {
            process.stdout.write(`👉 Testando [${modelo}]... `);
            try {
                const resposta = await axios.post(
                    `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${key}`,
                    { contents: [{ parts: [{ text: "Diga apenas 'Paraná Living Score OK!'" }] }] },
                    { headers: { 'Content-Type': 'application/json' } }
                );

                const texto = resposta.data?.candidates?.[0]?.content?.parts?.[0]?.text;
                console.log(`\n\n🎉 MODELO ENCONTRADO COM SUCESSO!`);
                console.log(`🌟 Modelo ativo: "${modelo}"`);
                console.log(`💬 Resposta da IA: ${texto.trim()}\n`);
                return;
            } catch (err) {
                const status = err.response?.status || "Erro";
                const msg = err.response?.data?.error?.message || err.message;
                console.log(`❌ (${status}: ${msg.substring(0, 40)}...)`);
            }
        }

        console.log("\n⚠️ Nenhum dos modelos listados respondeu.");
    } catch (e) {
        console.error("Erro ao listar modelos:", e.message);
    }
}

encontrarModeloFuncional();