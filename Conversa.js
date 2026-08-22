const mongoose = require('mongoose');

const MensagemSchema = new mongoose.Schema({
    remetente: { 
        type: String, 
        enum: ['usuario', 'ia'], 
        required: true 
    },
    conteudo: { 
        type: String, 
        required: true 
    },
    data: { 
        type: Date, 
        default: Date.now 
    }
});

const ConversaSchema = new mongoose.Schema({
    usuario_id: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Usuario', 
        required: true 
    },
    titulo: { 
        type: String, 
        default: 'Nova Conversa' 
    },
    mensagens: [MensagemSchema],
    atualizado_em: { 
        type: Date, 
        default: Date.now 
    }
});

module.exports = mongoose.model('Conversa', ConversaSchema);