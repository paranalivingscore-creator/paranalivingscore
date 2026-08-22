require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const axios = require('axios');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Modelos do Banco e Configurações
const Cidade = require('./models/Cidade');
const Usuario = require('./models/Usuario');
const Conversa = require('./models/Conversa');
const DICIONARIO_INDICADORES = require('./config/dicionarioIndicadores');

const app = express();
app.use(cors());
app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET || "chave_secreta_pls_2024";

// 1. CONEXÃO MONGODB
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log("✅ MongoDB Conectado com sucesso!"))
    .catch(err => console.error("❌ Erro ao conectar no MongoDB:", err));

// 2. CONFIGURAÇÃO DA IA GEMINI (COM TRATAMENTO RESILIENTE)
const genAI = new GoogleGenerativeAI(process.env.GEMINI_KEY);

async function gerarTextoComIA(prompt) {
    const modelosParaTentar = [
        "gemini-1.5-flash",
        "gemma-4-26b-a4b-it",
        "gemma-4-31b-it",
        "gemini-flash-latest"
    ];

    let ultimoErro = null;
    const promptDireto = `${prompt}\n\n[INSTRUÇÃO IMPORTANTE: Responda diretamente ao usuário com a resposta final em português. NÃO inclua rascunho de planejamento, tags de raciocínio, regras ou anotações internas.]`;

    for (const nomeModelo of modelosParaTentar) {
        try {
            const model = genAI.getGenerativeModel({ model: nomeModelo });
            const result = await model.generateContent(promptDireto);
            const response = await result.response;
            let texto = response.text();

            // Limpa eventuais saídas de pensamento prévio
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

// 3. MIDDLEWARES DE AUTENTICAÇÃO
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

const verificarAdmin = (req, res, next) => {
    verificarToken(req, res, () => {
        if (req.usuario && req.usuario.role === 'admin') {
            next();
        } else {
            return res.status(403).json({ erro: "Acesso restrito para administradores." });
        }
    });
};

// 4. FUNÇÃO DO CÁLCULO DO SCORE (Média Ponderada Oficial)
function extrairValor(campo) {
    if (campo === undefined || campo === null) return 0;
    if (typeof campo === 'number') return campo;
    if (typeof campo === 'object' && campo.valor !== undefined) return Number(campo.valor) || 0;
    return Number(campo) || 0;
}

function calcularLivingScore(indicadores) {
    if (!indicadores) return "0.0";

    const PESOS = { seguranca: 3, educacao: 3, saude: 2, economia: 2 };
    
    const seg = extrairValor(indicadores.seguranca_indice);
    const edu = extrairValor(indicadores.ideb) * 10;
    const sau = extrairValor(indicadores.saude_leitos) * 10;
    
    const pib = extrairValor(indicadores.pib_per_capita);
    const eco = pib > 50000 ? 100 : (pib / 500);

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
        const cidades = await Cidade.find().select('nome ibge_id indicadores relatorio_ia score_calculado');
        const formatadas = cidades.map(c => {
            const obj = c.toObject();
            obj.score_final = calcularLivingScore(c.indicadores);
            return obj;
        });
        res.json(formatadas);
    } catch (err) {
        res.status(500).json({ erro: err.message });
    }
});

// Ranking Oficial ordenado por score
app.get('/api/cidades/ranking', async (req, res) => {
    try {
        const cidades = await Cidade.find();
        const cidadesComScore = cidades.map(c => {
            const obj = c.toObject();
            obj.score_final = parseFloat(calcularLivingScore(c.indicadores));
            return obj;
        });

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

        // Clima em tempo real
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

        const scoreFinal = calcularLivingScore(cidade.indicadores);

        // Relatório IA sob demanda baseado nos dados oficiais
        if (!cidade.relatorio_ia || cidade.relatorio_ia.trim() === '' || cidade.relatorio_ia.includes("Aguardando")) {
            try {
                const pib = extrairValor(cidade.indicadores?.pib_per_capita);
                const ideb = extrairValor(cidade.indicadores?.ideb);
                const seg = extrairValor(cidade.indicadores?.seguranca_indice);
                const leitos = extrairValor(cidade.indicadores?.saude_leitos);

                const prompt = `
                    Você é o consultor oficial do Paraná Living Score.
                    Escreva uma análise executiva e agradável de no máximo 3 frases sobre a qualidade de vida em ${cidade.nome}/PR.
                    
                    Dados Oficiais da Base:
                    - Living Score Oficial: ${scoreFinal}/100
                    - IDEB: ${ideb || 'N/D'}
                    - Segurança Pública: ${seg || 'N/D'}/100
                    - PIB per Capita: R$ ${pib ? pib.toLocaleString('pt-BR') : 'N/D'}
                    - Leitos SUS / 1k hab: ${leitos || 'N/D'}

                    Diretrizes: Baseie-se estritamente nestes dados oficiais. Não invente números.
                `;
                cidade.relatorio_ia = await gerarTextoComIA(prompt);
                await cidade.save();
            } catch (errIA) {
                console.error("Aviso: Falha ao gerar IA inicial:", errIA.message);
            }
        }

        const cidadeObj = cidade.toObject();
        cidadeObj.score_final = scoreFinal;

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
            { expiresIn: '8h' }
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
// ROTAS PRIVADAS DO USUÁRIO
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

// CHAT IA COM RAG E DADOS OFICIAIS
app.post('/api/chat/enviar', verificarToken, async (req, res) => {
    try {
        const { mensagem, conversaId } = req.body;
        if (!mensagem) return res.status(400).json({ erro: "A mensagem não pode ser vazia." });

        // 1. RAG: Busca todas as cidades no banco de dados para alimentar a IA
        const cidadesNoBanco = await Cidade.find().limit(30);
        let contextoCidades = "BASE DE DADOS OFICIAL DO PARANÁ LIVING SCORE (FONTE: IPARDES / MINISTÉRIOS / GOV.PR):\n";
        
        cidadesNoBanco.forEach(c => {
            const score = calcularLivingScore(c.indicadores);
            const ideb = extrairValor(c.indicadores?.ideb);
            const alfa = extrairValor(c.indicadores?.taxa_alfabetizacao);
            const pib = extrairValor(c.indicadores?.pib_per_capita);
            const emp = extrairValor(c.indicadores?.taxa_ocupacao);
            const seg = extrairValor(c.indicadores?.seguranca_indice);
            const leitos = extrairValor(c.indicadores?.saude_leitos);
            const saneamento = extrairValor(c.indicadores?.saneamento_basico);

            contextoCidades += `• ${c.nome}:
  - Living Score Oficial: ${score}/100
  - Educação: IDEB ${ideb || 'N/D'} | Alfabetização: ${alfa ? alfa + '%' : 'N/D'}
  - Segurança: ${seg || 'N/D'}/100
  - Saúde & Saneamento: Leitos SUS ${leitos || 'N/D'}/1k hab | Saneamento: ${saneamento ? saneamento + '%' : 'N/D'}
  - Economia: PIB per capita R$ ${pib ? pib.toLocaleString('pt-BR') : 'N/D'} | Ocupação: ${emp ? emp + '%' : 'N/D'}
  - Curadoria/Anotações: ${c.info_curadoria || 'Nenhuma'}
\n`;
        });

        // 2. Prompt com diretrizes estritas de fidelidade aos dados
        const prompt = `
Você é o Consultor Oficial de Inteligência Urbana do projeto "Paraná Living Score".
Seu papel é interpretar os dados oficiais e explicar aos cidadãos a qualidade de vida nos municípios paranaenses.

${contextoCidades}

PERGUNTA DO USUÁRIO: "${mensagem}"

DIRETRIZES FUNDAMENTAIS DE RESPOSTA:
1. AUTORIDADE BASEADA EM DADOS: Responda fundamentado estritamente nos dados oficiais acima. Cite os Living Scores oficiais e notas específicas ao comparar ou descrever cidades.
2. FIDELIDADE AOS DADOS: NUNCA invente ou chute valores de indicadores. Se uma cidade não estiver na lista acima, informe de forma gentil que os dados oficiais daquele município ainda estão sendo catalogados pela equipe.
3. CLAREZA E DIDÁTICA: Explique os resultados em português claro, acolhedor e objetivo.
4. ESTRUTURAÇÃO: Use tópicos curtos e emojis sutis quando for apresentar comparações ou destaques.
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

// CHAT IA - LIMPAR HISTÓRICO
app.delete('/api/chat/limpar', verificarToken, async (req, res) => {
    try {
        await Conversa.deleteMany({ usuario_id: req.usuario.id });
        res.json({ msg: "Histórico limpo com sucesso!" });
    } catch (err) {
        res.status(500).json({ erro: "Erro ao limpar histórico: " + err.message });
    }
});

// ==========================================
// ROTAS ADMINISTRATIVAS (CRUD COMPLETO)
// ==========================================

// Catálogo de indicadores aceitos
app.get('/api/admin/indicadores/catalogo', verificarAdmin, (req, res) => {
    res.json(DICIONARIO_INDICADORES);
});

// Listar todas as cidades completas (para a tabela do Admin)
app.get('/api/admin/cidades', verificarAdmin, async (req, res) => {
    try {
        const cidades = await Cidade.find().sort({ nome: 1 });
        const formatadas = cidades.map(c => {
            const obj = c.toObject();
            obj.score_calculado = parseFloat(calcularLivingScore(c.indicadores));
            return obj;
        });
        res.json(formatadas);
    } catch (err) {
        res.status(500).json({ erro: "Erro ao listar cidades: " + err.message });
    }
});

// Obter uma cidade por ID
app.get('/api/admin/cidades/:id', verificarAdmin, async (req, res) => {
    try {
        const cidade = await Cidade.findById(req.params.id);
        if (!cidade) return res.status(404).json({ erro: "Cidade não encontrada." });
        
        const obj = cidade.toObject();
        obj.score_calculado = parseFloat(calcularLivingScore(cidade.indicadores));
        res.json(obj);
    } catch (err) {
        res.status(500).json({ erro: "Erro ao buscar cidade: " + err.message });
    }
});

// Cadastrar nova cidade com indicadores
app.post('/api/admin/cidades', verificarAdmin, async (req, res) => {
    try {
        const { ibge_id, nome, indicadores } = req.body;

        if (!ibge_id || !nome) {
            return res.status(400).json({ erro: "Código IBGE e Nome da cidade são obrigatórios." });
        }

        const existe = await Cidade.findOne({ ibge_id: Number(ibge_id) });
        if (existe) {
            return res.status(400).json({ erro: "Já existe uma cidade cadastrada com este código IBGE." });
        }

        const scoreCalculado = parseFloat(calcularLivingScore(indicadores));

        const novaCidade = new Cidade({
            ibge_id: Number(ibge_id),
            nome: nome.trim(),
            estado: 'PR',
            indicadores: indicadores || {},
            score_calculado: scoreCalculado,
            ultima_atualizacao: new Date()
        });

        await novaCidade.save();
        res.status(201).json({ msg: "Cidade cadastrada com sucesso!", cidade: novaCidade });
    } catch (err) {
        res.status(500).json({ erro: "Erro ao cadastrar cidade: " + err.message });
    }
});

// Atualizar cidade e indicadores existentes
app.put('/api/admin/cidades/:id', verificarAdmin, async (req, res) => {
    try {
        const { nome, ibge_id, indicadores } = req.body;
        const cidade = await Cidade.findById(req.params.id);

        if (!cidade) return res.status(404).json({ erro: "Cidade não encontrada." });

        if (nome) cidade.nome = nome.trim();
        if (ibge_id) cidade.ibge_id = Number(ibge_id);
        if (indicadores) cidade.indicadores = indicadores;

        cidade.score_calculado = parseFloat(calcularLivingScore(cidade.indicadores));
        cidade.ultima_atualizacao = new Date();
        cidade.relatorio_ia = ""; // Força novo relatório alinhado aos novos dados

        await cidade.save();
        res.json({ msg: "Cidade e indicadores atualizados com sucesso!", cidade });
    } catch (err) {
        res.status(500).json({ erro: "Erro ao atualizar cidade: " + err.message });
    }
});

// Excluir cidade
app.delete('/api/admin/cidades/:id', verificarAdmin, async (req, res) => {
    try {
        const cidade = await Cidade.findByIdAndDelete(req.params.id);
        if (!cidade) return res.status(404).json({ erro: "Cidade não encontrada." });
        res.json({ msg: `Cidade ${cidade.nome} excluída com sucesso!` });
    } catch (err) {
        res.status(500).json({ erro: "Erro ao excluir cidade: " + err.message });
    }
});

// Treinamento contextual via IA
app.post('/api/admin/treinar-chat', verificarAdmin, async (req, res) => {
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