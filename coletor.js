const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');

// Configurações do seu Supabase
const supabase = createClient('SUA_URL', 'SUA_CHAVE_ANON');

async function popularCidadesDoParana() {
    try {
        console.log("🚀 Iniciando coleta de cidades do PR...");

        // 1. Busca todas as cidades do Paraná no IBGE
        const response = await axios.get('https://servicodados.ibge.gov.br/api/v1/localidades/estados/41/municipios');
        const cidades = response.data;

        for (const cidade of cidades) {
            // 2. Para cada cidade, você pode buscar mais dados específicos 
            // (Aqui simularemos dados que viriam de outros endpoints do IBGE/SIDRA)

            const { data, error } = await supabase
                .from('cidades')
                .upsert({
                    nome: cidade.nome,
                    // Aqui você mapearia os dados reais das APIs
                    populacao: Math.floor(Math.random() * 100000), // Exemplo: buscar do SIDRA
                    pib_per_capita: (Math.random() * 50000).toFixed(2),
                    idh: (0.6 + Math.random() * 0.2).toFixed(3),
                    descricao_base: `Cidade localizada no estado do Paraná, código IBGE: ${cidade.id}`
                });

            if (error) console.error(`Erro ao inserir ${cidade.nome}:`, error.message);
            else console.log(`✅ ${cidade.nome} atualizada.`);
        }

        console.log("🏁 Coleta finalizada!");
    } catch (err) {
        console.error("Erro na coleta:", err);
    }
}

popularCidadesDoParana();