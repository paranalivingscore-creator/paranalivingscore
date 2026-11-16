const mongoose = require('mongoose');

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
    // Schema flexível (Mixed) para aceitar tanto os dados do IPARDES (2022/2023) quanto campos avulsos
    indicadores: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
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
}, { 
    strict: false, // Permite carregar todos os campos existentes no MongoDB sem descartar nada
    collection: 'cidades' // Garante conexão direta com a coleção 'cidades'
});

module.exports = mongoose.model('Cidade', CidadeSchema, 'cidades');