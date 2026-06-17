const mongoose = require('mongoose');

const UsuarioSchema = new mongoose.Schema({
    nome: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    senha_hash: { type: String, required: true },
    role: { type: String, default: 'user' },
    data_criacao: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Usuario', UsuarioSchema);