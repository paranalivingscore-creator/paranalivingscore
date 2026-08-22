const mongoose = require('mongoose');

// Sub-schema para armazenar um indicador completo com rastreabilidade
const IndicadorItemSchema = new mongoose.Schema({
    valor: { 
        type: Number, 
        required: true,
        default: 0 
    },
    ano: { 
        type: Number, 
        default: () => new Date().getFullYear() 
    },
    fonte: { 
        type: String, 
        trim: true,
        default: 'IPARDES' 
    }
}, { _id: false });

const CidadeSchema = new mongoose.Schema({
    ibge_id: { 
        type: Number, 
        required: true, 
        unique: true 
    },
    nome: { 
        type: String, 
        required: true,
        trim: true 
    },
    estado: {
        type: String,
        default: 'PR'
    },
    indicadores: {
        // EDUCAÇÃO
        ideb: IndicadorItemSchema,
        taxa_alfabetizacao: IndicadorItemSchema,

        // SEGURANÇA
        seguranca_indice: IndicadorItemSchema,

        // SAÚDE E SANEAMENTO
        saude_leitos: IndicadorItemSchema,
        saneamento_basico: IndicadorItemSchema,

        // ECONOMIA E TRABALHO
        pib_per_capita: IndicadorItemSchema,
        taxa_ocupacao: IndicadorItemSchema
    },
    score_calculado: {
        type: Number,
        default: 0
    },
    relatorio_ia: { 
        type: String,
        default: ''
    },
    info_curadoria: {
        type: String,
        default: ''
    },
    ultima_atualizacao: { 
        type: Date, 
        default: Date.now 
    }
});

module.exports = mongoose.model('Cidade', CidadeSchema);