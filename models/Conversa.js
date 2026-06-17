const MensagemSchema = new mongoose.Schema({
    remetente: { type: String, enum: ['usuario', 'ia'], required: true },
    conteudo: { type: String, required: true },
    data_envio: { type: Date, default: Date.now }
});

const ConversaSchema = new mongoose.Schema({
    usuario_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: true },
    titulo: { type: String, required: true },
    mensagens: [MensagemSchema], // Array de mensagens dentro da conversa
    data_criacao: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Conversa', ConversaSchema);