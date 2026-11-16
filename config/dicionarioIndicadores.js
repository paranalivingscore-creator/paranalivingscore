/**
 * DICIONÁRIO OFICIAL DE INDICADORES - PARANÁ LIVING SCORE
 * Define os indicadores aceitos, fontes governamentais e pesos no índice.
 */

const DICIONARIO_INDICADORES = {
    // 🎓 EDUCAÇÃO (Peso 3)
    ideb: {
        chave: "ideb",
        nome: "IDEB - Anos Iniciais",
        area: "educacao",
        peso: 3,
        unidade: "nota (0 a 10)",
        fonte_padrao: "INEP / Ministério da Educação"
    },
    taxa_alfabetizacao: {
        chave: "taxa_alfabetizacao",
        nome: "Taxa de Alfabetização",
        area: "educacao",
        peso: 1,
        unidade: "%",
        fonte_padrao: "IBGE / IPARDES"
    },

    // 🛡️ SEGURANÇA (Peso 3)
    seguranca_indice: {
        chave: "seguranca_indice",
        nome: "Índice de Segurança Pública",
        area: "seguranca",
        peso: 3,
        unidade: "pontuação (0 a 100)",
        fonte_padrao: "SESP-PR / IPARDES"
    },

    // 🏥 SAÚDE E SANEAMENTO (Peso 2)
    saude_leitos: {
        chave: "saude_leitos",
        nome: "Leitos SUS por Mil Habitantes",
        area: "saude",
        peso: 2,
        unidade: "leitos / 1.000 hab",
        fonte_padrao: "DATASUS / IPARDES"
    },
    saneamento_basico: {
        chave: "saneamento_basico",
        nome: "Atendimento de Água e Esgoto",
        area: "saude",
        peso: 1,
        unidade: "%",
        fonte_padrao: "SNIS / IPARDES"
    },

    // 💼 ECONOMIA E TRABALHO (Peso 2)
    pib_per_capita: {
        chave: "pib_per_capita",
        nome: "PIB per Capita",
        area: "economia",
        peso: 2,
        unidade: "R$",
        fonte_padrao: "IBGE / IPARDES"
    },
    taxa_ocupacao: {
        chave: "taxa_ocupacao",
        nome: "Taxa de Ocupação / Emprego",
        area: "economia",
        peso: 1,
        unidade: "%",
        fonte_padrao: "IPARDES / Novo CAGED"
    }
};

module.exports = DICIONARIO_INDICADORES;