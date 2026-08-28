const mongoose = require('mongoose');

const IBGEMunicipioSchema = new mongoose.Schema({
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
    geografia: {
        microrregiao: { type: String, default: '' },
        mesorregiao: { type: String, default: '' },
        regiao_imediata: { type: String, default: '' },
        regiao_intermediaria: { type: String, default: '' }
    },
    demografia: {
        populacao_censo_2022: { type: Number, default: 0 },
        area_km2: { type: Number, default: 0 },
        densidade_hab_km2: { type: Number, default: 0 }
    },
    atualizado_em: { 
        type: Date, 
        default: Date.now 
    }
}, { 
    collection: 'IBGEMunicipios' // Nome da nova coleção no MongoDB
});

module.exports = mongoose.model('IBGEMunicipio', IBGEMunicipioSchema, 'IBGEMunicipios');