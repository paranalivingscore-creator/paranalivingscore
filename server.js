require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const axios = require('axios');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Modelos do Banco
const Cidade = require('./models/Cidade');
const Usuario = require('./models/Usuario');
const Conversa = require('./models/Conversa');

const app = express();
app.use(cors());
app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET || "chave_secreta_pls_2024";

// 1. CONEXÃO MONGODB
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log("✅ MongoDB Conectado com sucesso!"))
    .catch(err => console.error("❌ Erro ao conectar no MongoDB:", err));

// 2. CONFIGURAÇÃO DA IA GEMINI (COM FALLBACK INTELIGENTE)
// 2. CONFIGURAÇÃO DA IA COM O MODELO ATIVO
const genAI = new GoogleGenerativeAI(process.env.GEMINI_KEY);

async function gerarTextoComIA(prompt) {
    const modelosParaTentar = [
        "gemma-4-26b-a4b-it",
        "gemma-4-31b-it",
        "gemini-flash-latest"
    ];

    let ultimoErro = null;

    // Adiciona instrução direta para evitar rascunho
    const promptDireto = `${prompt}\n\n[INSTRUÇÃO IMPORTANTE: Responda diretamente ao usuário com a resposta final em português. NÃO inclua rascunho de planejamento, regras ou anotações internas.]`;

    for (const nomeModelo of modelosParaTentar) {
        try {
            const model = genAI.getGenerativeModel({ model: nomeModelo });
            const result = await model.generateContent(promptDireto);
            const response = await result.response;
            let texto = response.text();

            // Remove o rascunho interno caso o modelo inclua
            if (texto.includes("Olá!") || texto.includes("Olá,") || texto.includes("Olá ")) {
                const indiceOla = Math.min(
                    texto.indexOf("Olá!") !== -1 ? texto.indexOf("Olá!") : Infinity,
                    texto.indexOf("Olá,") !== -1 ? texto.indexOf("Olá,") : Infinity,
                    texto.indexOf("Olá ") !== -1 ? texto.indexOf("Olá ") : Infinity
                );
                if (indiceOla !== Infinity) {
                    texto = texto.substring(indiceOla).trim();
                }
            }

            return texto;
        } catch (err) {
            ultimoErro = err;
            console.warn(`⚠️ Tentativa com ${nomeModelo} falhou, tentando próximo...`);
        }
    }

    throw new Error("Falha na IA: " + (ultimoErro?.message || "Erro desconhecido"));
}

// 3. MIDDLEWARE DE AUTENTICAÇÃO JWT
const verificarToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader) return res.status(403).json({ erro: "Acesso negado. Faça login." });

    const token = authHeader.startsWith('Bearer ') ? authHeader.split(" ")[1] : authHeader;

    try {
        const verificado = jwt.verify(token, JWT_SECRET);
        req.usuario = verificado;
        next();
    } catch (err) {
        return res.status(401).json({ erro: "Sessão inválida ou expirada. Entre novamente." });
    }
};

// 4. FUNÇÃO DO CÁLCULO DO SCORE (Média Ponderada)
function calcularLivingScore(indicadores) {
    if (!indicadores) return "0.0";

    const PESOS = { seguranca: 3, educacao: 3, saude: 2, economia: 2 };
    const seg = Number(indicadores.seguranca_indice) || 0;
    const edu = (Number(indicadores.ideb) || 0) * 10;
    const sau = (Number(indicadores.saude_leitos) || 0) * 10;
    const eco = Number(indicadores.pib_per_capita) > 50000 
        ? 100 
        : ((Number(indicadores.pib_per_capita) || 0) / 500);

    const resultado = (
        (seg * PESOS.seguranca) +
        (edu * PESOS.educacao) +
        (sau * PESOS.saude) +
        (eco * PESOS.economia)
    ) / 10;

    return Math.min(100, Math.max(0, resultado)).toFixed(1);
}

// ==========================================
// ROTAS PÚBLICAS
// ==========================================

app.get('/', (req, res) => {
    res.send('🚀 Servidor do Paraná Living Score está online e operante!');
});

// Listar todas as cidades
app.get('/api/cidades', async (req, res) => {
    try {
        const cidades = await Cidade.find().select('nome ibge_id indicadores relatorio_ia');
        res.json(cidades);
    } catch (err) {
        res.status(500).json({ erro: err.message });
    }
});

// Rota de Ranking Oficial (Calcula o score de todas as cidades e ordena)
app.get('/api/cidades/ranking', async (req, res) => {
    try {
        const cidades = await Cidade.find();
        const cidadesComScore = cidades.map(c => {
            const obj = c.toObject();
            obj.score_final = parseFloat(calcularLivingScore(c.indicadores));
            return obj;
        });

        // Ordena da maior nota para a menor
        cidadesComScore.sort((a, b) => b.score_final - a.score_final);

        res.json(cidadesComScore);
    } catch (err) {
        res.status(500).json({ erro: "Erro ao gerar ranking: " + err.message });
    }
});

// Buscar cidade específica + Clima + Relatório IA
app.get('/api/cidades/busca/:nome', async (req, res) => {
    try {
        const nomeCidade = req.params.nome;
        let cidade = await Cidade.findOne({ nome: new RegExp(`^${nomeCidade}$`, 'i') });

        if (!cidade) return res.status(404).json({ erro: "Cidade não encontrada" });

        // Busca Clima em tempo real
        let climaDados = null;
        if (process.env.WEATHER_API_KEY) {
            try {
                const weatherUrl = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(nomeCidade)},BR&units=metric&lang=pt_br&appid=${process.env.WEATHER_API_KEY}`;
                const weatherRes = await axios.get(weatherUrl);
                climaDados = {
                    temp: Math.round(weatherRes.data.main.temp),
                    descricao: weatherRes.data.weather[0].description,
                    icone: weatherRes.data.weather[0].icon,
                    umidade: weatherRes.data.main.humidity
                };
            } catch (errWeather) {
                console.error("Aviso: Falha ao buscar clima:", errWeather.message);
            }
        }

        // Gera Relatório IA se ainda não existir
        if (!cidade.relatorio_ia || cidade.relatorio_ia.includes("Aguardando")) {
            try {
                const prompt = `Analise a qualidade de vida em ${cidade.nome}/PR de forma resumida (máximo 3 frases). PIB per capita: ${cidade.indicadores?.pib_per_capita || 'N/D'}, IDEB: ${cidade.indicadores?.ideb || 'N/D'}.`;
                cidade.relatorio_ia = await gerarTextoComIA(prompt);
                await cidade.save();
            } catch (errIA) {
                console.error("Aviso: Falha ao gerar IA inicial:", errIA.message);
            }
        }

        const cidadeObj = cidade.toObject();
        cidadeObj.score_final = calcularLivingScore(cidade.indicadores);

        res.json({
            ...cidadeObj,
            data_consulta: new Date().toLocaleDateString('pt-BR'),
            clima: climaDados
        });

    } catch (error) {
        res.status(500).json({ erro: error.message });
    }
});

// ==========================================
// ROTAS DE AUTENTICAÇÃO
// ==========================================

app.post('/api/auth/cadastro', async (req, res) => {
    try {
        const { nome, email, senha } = req.body;
        if (!nome || !email || !senha) {
            return res.status(400).json({ erro: "Preencha todos os campos obrigatórios." });
        }

        const usuarioExiste = await Usuario.findOne({ email });
        if (usuarioExiste) {
            return res.status(400).json({ erro: "Este e-mail já está cadastrado." });
        }

        const salt = await bcrypt.genSalt(10);
        const senhaCripto = await bcrypt.hash(senha, salt);

        const novoUsuario = new Usuario({
            nome,
            email,
            senha: senhaCripto,
            role: 'user'
        });

        await novoUsuario.save();
        res.status(201).json({ msg: "Cadastro realizado com sucesso!" });
    } catch (err) {
        res.status(500).json({ erro: err.message });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, senha } = req.body;

        const usuario = await Usuario.findOne({ email });
        if (!usuario) return res.status(400).json({ erro: "Credenciais inválidas." });

        const senhaCorreta = await bcrypt.compare(senha, usuario.senha);
        if (!senhaCorreta) return res.status(400).json({ erro: "Credenciais inválidas." });

        const token = jwt.sign(
            { id: usuario._id, role: usuario.role, nome: usuario.nome },
            JWT_SECRET,
            { expiresIn: '2h' }
        );

        res.json({
            token,
            usuario: {
                id: usuario._id,
                nome: usuario.nome,
                email: usuario.email,
                role: usuario.role
            }
        });
    } catch (err) {
        res.status(500).json({ erro: err.message });
    }
});

// ==========================================
// ROTAS PRIVADAS
// ==========================================

app.get('/api/usuario/perfil', verificarToken, async (req, res) => {
    try {
        const usuario = await Usuario.findById(req.usuario.id).select('-senha');
        if (!usuario) return res.status(404).json({ erro: "Usuário não encontrado." });
        res.json(usuario);
    } catch (err) {
        res.status(500).json({ erro: err.message });
    }
});

app.put('/api/usuario/perfil', verificarToken, async (req, res) => {
    try {
        const { nome, senha } = req.body;
        const usuario = await Usuario.findById(req.usuario.id);
        if (!usuario) return res.status(404).json({ erro: "Usuário não encontrado." });

        if (nome) usuario.nome = nome;
        if (senha && senha.trim().length >= 4) {
            const salt = await bcrypt.genSalt(10);
            usuario.senha = await bcrypt.hash(senha, salt);
        }

        await usuario.save();
        res.json({ 
            msg: "Perfil atualizado com sucesso!", 
            usuario: { id: usuario._id, nome: usuario.nome, email: usuario.email, role: usuario.role } 
        });
    } catch (err) {
        res.status(500).json({ erro: err.message });
    }
});

// CHAT IA - ENVIO
// CHAT IA COM RAG (Consulta o banco do Paraná antes de responder)
app.post('/api/chat/enviar', verificarToken, async (req, res) => {
    try {
        const { mensagem, conversaId } = req.body;
        if (!mensagem) return res.status(400).json({ erro: "A mensagem não pode ser vazia." });

        // 1. RAG: Busca cidades no banco de dados para alimentar o contexto da IA
        const cidadesNoBanco = await Cidade.find().limit(15);
        let contextoCidades = "DADOS OFICIAIS DO BANCO DE DADOS DO PARANÁ LIVING SCORE:\n";
        
        cidadesNoBanco.forEach(c => {
            const score = calcularLivingScore(c.indicadores);
            contextoCidades += `- ${c.nome}: Living Score Oficial = ${score}/100 | IDEB: ${c.indicadores?.ideb || 'N/D'} | PIB per capita: R$ ${c.indicadores?.pib_per_capita || 'N/D'} | Segurança: ${c.indicadores?.seguranca_indice || 'N/D'}/100.\n`;
        });

        // 2. Prompt Estruturado
        const prompt = `
            Você é o consultor de cidades inteligentes do Paraná Living Score.
            Use os dados oficiais abaixo para responder ao usuário com autoridade e precisão matemática.
            
            ${contextoCidades}
            
            Pergunta do usuário: "${mensagem}"
            
            Diretrizes:
            - Seja acolhedor, profissional e direto.
            - Cite os Living Scores oficiais e indicadores das cidades quando relevante.
            - Responda em português de forma clara e objetiva.
        `;

        const respostaIA = await gerarTextoComIA(prompt);

        // 3. Persistência da Conversa
        let conversa;
        if (conversaId) {
            conversa = await Conversa.findOne({ _id: conversaId, usuario_id: req.usuario.id });
        }

        if (!conversa) {
            conversa = new Conversa({
                usuario_id: req.usuario.id,
                titulo: mensagem.substring(0, 30),
                mensagens: []
            });
        }

        conversa.mensagens.push({ remetente: 'usuario', conteudo: mensagem });
        conversa.mensagens.push({ remetente: 'ia', conteudo: respostaIA });
        conversa.atualizado_em = new Date();
        await conversa.save();

        res.json({ resposta: respostaIA, conversaId: conversa._id });
    } catch (err) {
        console.error("Erro no chat:", err);
        res.status(500).json({ erro: "Erro ao processar mensagem com IA: " + err.message });
    }
});

// CHAT IA - HISTÓRICO
app.get('/api/chat/historico', verificarToken, async (req, res) => {
    try {
        const conversa = await Conversa.findOne({ usuario_id: req.usuario.id }).sort({ atualizado_em: -1 });
        if (!conversa) return res.json({ mensagens: [], conversaId: null });
        res.json({ mensagens: conversa.mensagens, conversaId: conversa._id });
    } catch (err) {
        res.status(500).json({ erro: "Erro ao buscar histórico: " + err.message });
    }
});

// CHAT IA - LIMPAR
app.delete('/api/chat/limpar', verificarToken, async (req, res) => {
    try {
        await Conversa.deleteMany({ usuario_id: req.usuario.id });
        res.json({ msg: "Histórico limpo com sucesso!" });
    } catch (err) {
        res.status(500).json({ erro: "Erro ao limpar histórico: " + err.message });
    }
});

// ==========================================
// ROTA ADMIN
// ==========================================

app.post('/api/admin/treinar-chat', async (req, res) => {
    try {
        const { cidadeNome, mensagemAdmin } = req.body;
        const cidade = await Cidade.findOne({ nome: new RegExp(`^${cidadeNome}$`, 'i') });
        
        if (!cidade) return res.status(404).json({ resposta: "Cidade não encontrada." });

        const promptTreino = `
            Você é um assistente de banco de dados do Paraná Living Score. O Administrador está ensinando sobre ${cidadeNome}.
            INFORMAÇÃO NOVA: "${mensagemAdmin}"
            MEMÓRIA ATUAL: "${cidade.info_curadoria || ''}"
            
            Sua missão:
            1. Una a info nova com a memória atual de forma coerente.
            2. Responda confirmando o que aprendeu.
            3. No fim da resposta, inclua exatamente a tag [MEMORIA] seguida do texto unificado.
        `;

        const respostaIA = await gerarTextoComIA(promptTreino);

        if (respostaIA.includes("[MEMORIA]")) {
            const partes = respostaIA.split("[MEMORIA]");
            cidade.info_curadoria = partes[1].trim();
            cidade.relatorio_ia = ""; 
            await cidade.save();
            res.json({ resposta: partes[0].trim() });
        } else {
            res.json({ resposta: "Aprendizado registrado com sucesso!" });
        }
    } catch (err) { 
        res.status(500).json({ resposta: "Erro na IA: " + err.message }); 
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Servidor rodando na porta ${PORT}`));