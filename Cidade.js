const mongoose = require('mongoose');

const CidadeSchema = new mongoose.Schema({
    ibge_id: { type: Number, required: true, unique: true },
    nome: { type: String, required: true },
    indicadores: {
        // ECONOMIA E TRABALHO
        pib_per_capita: Number,
        taxa_ocupacao: Number, // % de pessoas empregadas (IBGE)
        
        // EDUCAÇÃO
        ideb: Number, // Nota do IDEB
        taxa_alfabetizacao: Number,
        
        // SAÚDE E SANEAMENTO
        saude_leitos: Number,
        saneamento_basico: Number, // % atendimento de esgoto (SNIS/IBGE)
        
        // MOBILIDADE E PLANEJAMENTO
        transporte_publico: Number, // Índice de frota/acesso
        urbanizacao_vias: Number, // % de vias urbanizadas (Censo)
        
        // MEIO AMBIENTE
        arborizacao_vias: Number, // % de vias com árvores (Censo)
        
        // SEGURANÇA
        seguranca_indice: Number
    },
    relatorio_ia: String,
    ultima_atualizacao: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Cidade', CidadeSchema);