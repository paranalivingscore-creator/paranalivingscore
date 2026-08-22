// ==========================================
// 1. CONFIGURAÇÃO DINÂMICA DA API
// ==========================================
const API_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://localhost:3000/api'
    : 'https://parana-living-backend.onrender.com/api';

// Função utilitária para extrair número de indicadores com segurança
function obterValorNum(campo) {
    if (campo === undefined || campo === null) return 0;
    if (typeof campo === 'number') return campo;
    if (typeof campo === 'object' && campo.valor !== undefined) return Number(campo.valor) || 0;
    return Number(campo) || 0;
}

// ==========================================
// 2. SISTEMA DE AUTENTICAÇÃO E PERFIL
// ==========================================

function exibirMensagem(texto, tipo) {
    const msgDiv = document.getElementById('auth-msg');
    if (!msgDiv) return;

    msgDiv.innerText = texto;
    msgDiv.className = `msg-box msg-${tipo}`;
    msgDiv.style.display = 'block';

    setTimeout(() => { msgDiv.style.display = 'none'; }, 5000);
}

async function realizarCadastro(event) {
    event.preventDefault();
    const btn = document.getElementById('btnCadastro');
    const nome = document.getElementById('nome').value.trim();
    const email = document.getElementById('email').value.trim();
    const senha = document.getElementById('senha').value;

    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Criando conta...';
    btn.disabled = true;

    try {
        const res = await fetch(`${API_URL}/auth/cadastro`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nome, email, senha })
        });

        const dados = await res.json();
        if (res.ok) {
            exibirMensagem("✅ Conta criada com sucesso! Redirecionando...", "success");
            setTimeout(() => { window.location.href = 'login.html'; }, 2000);
        } else {
            exibirMensagem(`❌ ${dados.erro || 'Falha no cadastro'}`, "error");
        }
    } catch (err) {
        exibirMensagem("❌ Erro ao conectar ao servidor.", "error");
    } finally {
        btn.innerHTML = 'Finalizar Cadastro';
        btn.disabled = false;
    }
}

async function fazerLogin(event) {
    event.preventDefault();
    const btn = document.getElementById('btnLogin');
    const email = document.getElementById('email').value.trim();
    const senha = document.getElementById('senha').value;

    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Entrando...';
    btn.disabled = true;

    try {
        const res = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, senha })
        });

        const dados = await res.json();
        if (res.ok) {
            localStorage.setItem('token', dados.token);
            localStorage.setItem('usuario', JSON.stringify(dados.usuario));
            localStorage.setItem('usuarioRole', dados.usuario.role);
            localStorage.setItem('usuarioNome', dados.usuario.nome);

            exibirMensagem(`✅ Olá, ${dados.usuario.nome}! Entrando...`, "success");
            setTimeout(() => {
                window.location.href = dados.usuario.role === 'admin' ? 'admin.html' : 'index.html';
            }, 1200);
        } else {
            exibirMensagem(`❌ ${dados.erro || 'Dados incorretos.'}`, "error");
        }
    } catch (err) {
        exibirMensagem("❌ Servidor offline ou inacessível.", "error");
    } finally {
        btn.innerHTML = 'Acessar Painel';
        btn.disabled = false;
    }
}

function logout() {
    localStorage.clear();
    window.location.href = 'login.html';
}

async function carregarPerfil() {
    const token = localStorage.getItem('token');
    if (!token) { window.location.href = 'login.html'; return; }

    try {
        const res = await fetch(`${API_URL}/usuario/perfil`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.status === 401 || res.status === 403) { logout(); return; }

        const usuario = await res.json();
        if (res.ok) {
            const inputNome = document.getElementById('perfil-nome');
            const inputEmail = document.getElementById('perfil-email');
            if (inputNome) inputNome.value = usuario.nome;
            if (inputEmail) { inputEmail.value = usuario.email; inputEmail.disabled = true; }
        }
    } catch (err) { console.error("Erro ao obter perfil:", err); }
}

async function salvarPerfil(event) {
    event.preventDefault();
    const token = localStorage.getItem('token');
    const btn = document.getElementById('btnSalvarPerfil');
    const nome = document.getElementById('perfil-nome').value.trim();
    const senha = document.getElementById('perfil-senha').value;

    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';
    btn.disabled = true;

    try {
        const bodyData = { nome };
        if (senha && senha.trim().length > 0) bodyData.senha = senha;

        const res = await fetch(`${API_URL}/usuario/perfil`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify(bodyData)
        });

        const dados = await res.json();
        if (res.ok) {
            exibirMensagem("✅ Informações atualizadas com sucesso!", "success");
            localStorage.setItem('usuarioNome', dados.usuario.nome);
            atualizarMenuNavegacao();
        } else {
            exibirMensagem(`❌ ${dados.erro}`, "error");
        }
    } catch (err) {
        exibirMensagem("❌ Erro ao salvar alterações.", "error");
    } finally {
        btn.innerHTML = 'Salvar Alterações';
        btn.disabled = false;
    }
}

function atualizarMenuNavegacao() {
    const token = localStorage.getItem('token');
    const usuarioNome = localStorage.getItem('usuarioNome');
    const usuarioRole = localStorage.getItem('usuarioRole');
    const navList = document.querySelector('nav ul');

    if (!navList) return;

    if (token && usuarioNome) {
        navList.innerHTML = `
            <li><a href="index.html">Início</a></li>
            <li><a href="ranking.html">Ranking</a></li>
            <li><a href="chat.html">Chat IA</a></li>
            <li><a href="sobre.html">Sobre</a></li>
            ${usuarioRole === 'admin' ? '<li><a href="admin.html" style="color: #ffd700;"><i class="fas fa-tools"></i> Admin</a></li>' : ''}
            <li><a href="perfil.html"><i class="fas fa-user-circle"></i> ${usuarioNome.split(' ')[0]}</a></li>
            <li><a href="javascript:void(0)" onclick="logout()" style="color: #ef4444;"><i class="fas fa-sign-out-alt"></i> Sair</a></li>
        `;
    }
}

// ==========================================
// 3. SISTEMA DE BUSCA (DASHBOARD INDEX)
// ==========================================

async function realizarBusca() {
    const input = document.getElementById('citySearch');
    if (!input) return;
    const termo = input.value.trim();
    if (!termo) return;

    const section = document.getElementById('resultadoBusca');
    const btnBusca = document.querySelector('.btn-main');

    if (btnBusca) btnBusca.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Analisando...';

    try {
        const res = await fetch(`${API_URL}/cidades/busca/${encodeURIComponent(termo)}`);
        const cidade = await res.json();

        if (res.ok) {
            if (section) section.style.display = 'block';

            document.getElementById('res-nome-cidade').innerText = cidade.nome;
            document.getElementById('res-score').innerText = cidade.score_final || "0.0";
            document.getElementById('res-ia-texto').innerText = cidade.relatorio_ia || "Análise concluída com base nos indicadores oficiais.";

            // Indicadores estruturados
            const ind = cidade.indicadores || {};
            const idebVal = obterValorNum(ind.ideb);
            const segVal = obterValorNum(ind.seguranca_indice);
            const sauVal = obterValorNum(ind.saude_leitos);
            const pibVal = obterValorNum(ind.pib_per_capita);

            if (document.getElementById('res-ideb')) document.getElementById('res-ideb').innerText = idebVal ? idebVal.toFixed(1) : '0.0';
            if (document.getElementById('res-seguranca')) document.getElementById('res-seguranca').innerText = segVal ? segVal.toFixed(1) : '0';
            if (document.getElementById('res-saude')) document.getElementById('res-saude').innerText = sauVal ? sauVal.toFixed(1) : '0.0';
            if (document.getElementById('res-pib')) document.getElementById('res-pib').innerText = pibVal ? `R$ ${pibVal.toLocaleString('pt-BR')}` : 'R$ 0';

            // Clima em tempo real
            const climaCard = document.getElementById('resultado-ia');
            if (cidade.clima && climaCard) {
                climaCard.style.display = 'block';
                document.getElementById('temp-valor').innerText = cidade.clima.temp;
                document.getElementById('clima-desc').innerText = cidade.clima.descricao;
                if (cidade.clima.icone) {
                    document.getElementById('clima-icone').src = `https://openweathermap.org/img/wn/${cidade.clima.icone}.png`;
                }
            }

            section.scrollIntoView({ behavior: 'smooth' });
        } else {
            alert(`Cidade "${termo}" não encontrada na base oficial do Paraná.`);
        }
    } catch (err) {
        console.error("Erro na busca:", err);
        alert("Erro de conexão ao buscar cidade.");
    } finally {
        if (btnBusca) btnBusca.innerHTML = 'Analisar com IA';
    }
}

// ==========================================
// 4. CARROSSEL PREMIUM (INDEX)
// ==========================================

let premiumCidades = [];
let premiumIndex = 0;

async function carregarCarrosselPremium() {
    const content = document.getElementById('premiumContent');
    const loader = document.getElementById('loader');
    if (!content) return;

    try {
        const res = await fetch(`${API_URL}/cidades/ranking`);
        const data = await res.json();

        if (res.ok && data.length > 0) {
            premiumCidades = data.slice(0, 5); // Top 5
            if (loader) loader.style.display = 'none';
            content.style.display = 'block';
            exibirSlidePremium(0);
        } else {
            if (loader) loader.innerText = 'Cadastre cidades no Admin para visualizar o carrossel.';
        }
    } catch (err) {
        console.error("Erro no carrossel:", err);
    }
}

function exibirSlidePremium(index) {
    if (!premiumCidades || premiumCidades.length === 0) return;
    const cidade = premiumCidades[index];

    const tit = document.getElementById('p-titulo');
    const grade = document.getElementById('p-grade');
    const desc = document.getElementById('p-descricao');

    if (tit) tit.innerText = `${index + 1}º - ${cidade.nome}`;
    if (grade) grade.innerText = cidade.score_final;
    if (desc) desc.innerText = cidade.relatorio_ia || `Município com Living Score oficial de ${cidade.score_final} pontos.`;
}

function nextPremium() {
    if (premiumCidades.length === 0) return;
    premiumIndex = (premiumIndex + 1) % premiumCidades.length;
    exibirSlidePremium(premiumIndex);
}

function prevPremium() {
    if (premiumCidades.length === 0) return;
    premiumIndex = (premiumIndex - 1 + premiumCidades.length) % premiumCidades.length;
    exibirSlidePremium(premiumIndex);
}

// ==========================================
// 5. RANKING COMPLETO E PÓDIO (RANKING.HTML)
// ==========================================

let dadosRankingGlobal = [];

async function carregarRankingCompleto(filtro = 'Geral') {
    const tbody = document.getElementById('rankingTableBody');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 20px;"><i class="fas fa-spinner fa-spin"></i> Carregando dados oficiais do Paraná...</td></tr>';

    try {
        const res = await fetch(`${API_URL}/cidades/ranking`);
        dadosRankingGlobal = await res.json();

        if (!dadosRankingGlobal || dadosRankingGlobal.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align: center;">Nenhuma cidade cadastrada no banco de dados.</td></tr>';
            return;
        }

        let lista = [...dadosRankingGlobal];

        // Ordenação por filtro selecionado
        if (filtro === 'Segurança') {
            lista.sort((a, b) => obterValorNum(b.indicadores?.seguranca_indice) - obterValorNum(a.indicadores?.seguranca_indice));
        } else if (filtro === 'Educação') {
            lista.sort((a, b) => obterValorNum(b.indicadores?.ideb) - obterValorNum(a.indicadores?.ideb));
        } else if (filtro === 'Emprego') {
            lista.sort((a, b) => obterValorNum(b.indicadores?.pib_per_capita) - obterValorNum(a.indicadores?.pib_per_capita));
        } else {
            lista.sort((a, b) => b.score_final - a.score_final);
        }

        // 1. Atualizar Pódio
        if (lista.length >= 1) {
            if (document.getElementById('pos1-nome')) document.getElementById('pos1-nome').innerText = lista[0].nome;
            if (document.getElementById('pos1-score')) document.getElementById('pos1-score').innerText = lista[0].score_final;
        }
        if (lista.length >= 2) {
            if (document.getElementById('pos2-nome')) document.getElementById('pos2-nome').innerText = lista[1].nome;
            if (document.getElementById('pos2-score')) document.getElementById('pos2-score').innerText = lista[1].score_final;
        }
        if (lista.length >= 3) {
            if (document.getElementById('pos3-nome')) document.getElementById('pos3-nome').innerText = lista[2].nome;
            if (document.getElementById('pos3-score')) document.getElementById('pos3-score').innerText = lista[2].score_final;
        }

        // 2. Preencher Tabela
        tbody.innerHTML = '';
        lista.forEach((c, idx) => {
            const ind = c.indicadores || {};
            const idebVal = obterValorNum(ind.ideb);
            const segVal = obterValorNum(ind.seguranca_indice);
            const sauVal = obterValorNum(ind.saude_leitos);

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>#${idx + 1}</strong></td>
                <td><strong>${c.nome}</strong></td>
                <td>${idebVal ? idebVal.toFixed(1) : '0.0'}</td>
                <td>${segVal ? segVal.toFixed(1) : '0'}</td>
                <td>${sauVal ? sauVal.toFixed(1) : '0.0'}</td>
                <td class="td-score">${c.score_final}</td>
                <td><button class="btn-view" onclick="verDetalhesCidade('${c.nome}')">Ver Análise</button></td>
            `;
            tbody.appendChild(tr);
        });

    } catch (err) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: red;">Erro ao carregar dados do ranking.</td></tr>';
    }
}

function verDetalhesCidade(nome) {
    window.location.href = `index.html?busca=${encodeURIComponent(nome)}`;
}

function configurarFiltrosRanking() {
    const botoes = document.querySelectorAll('.filter-btn');
    botoes.forEach(btn => {
        btn.addEventListener('click', () => {
            botoes.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            carregarRankingCompleto(btn.innerText.trim());
        });
    });
}

// ==========================================
// 6. CHAT IA (CHAT.HTML)
// ==========================================

let chatConversaIdAtual = null;

async function carregarHistoricoChat() {
    const token = localStorage.getItem('token');
    const chatWindow = document.getElementById('chatWindow');
    if (!chatWindow) return;

    if (!token) {
        chatWindow.innerHTML = `
            <div class="msg-bubble msg-ia">
                ⚠️ Você precisa estar logado para conversar com o consultor IA.
                <br><br><a href="login.html" style="color: var(--primary-color); font-weight: bold;">Clique aqui para fazer login</a>.
            </div>
        `;
        const input = document.getElementById('msg-input');
        const btn = document.getElementById('btnEnviarChat');
        if (input) input.disabled = true;
        if (btn) btn.disabled = true;
        return;
    }

    try {
        const res = await fetch(`${API_URL}/chat/historico`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (res.ok) {
            const data = await res.json();
            if (data.conversaId) chatConversaIdAtual = data.conversaId;

            if (data.mensagens && data.mensagens.length > 0) {
                chatWindow.innerHTML = '';
                data.mensagens.forEach(msg => {
                    const tipo = msg.remetente === 'usuario' ? 'msg-usuario' : 'msg-ia';
                    chatWindow.innerHTML += `<div class="msg-bubble ${tipo}">${msg.conteudo}</div>`;
                });
                chatWindow.scrollTop = chatWindow.scrollHeight;
            }
        }
    } catch (err) {
        console.error("Erro ao carregar histórico:", err);
    }
}

async function enviarMensagemChat(event) {
    if (event) event.preventDefault();

    const input = document.getElementById('msg-input');
    const chatWindow = document.getElementById('chatWindow');
    const token = localStorage.getItem('token');
    const msg = input.value.trim();

    if (!msg || !token) return;

    chatWindow.innerHTML += `<div class="msg-bubble msg-usuario">${msg}</div>`;
    input.value = "";

    const typingId = "typing-" + Date.now();
    chatWindow.innerHTML += `<div class="msg-bubble msg-typing" id="${typingId}"><i class="fas fa-spinner fa-spin"></i> Consultando dados oficiais do Paraná...</div>`;
    chatWindow.scrollTop = chatWindow.scrollHeight;

    try {
        const res = await fetch(`${API_URL}/chat/enviar`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ mensagem: msg, conversaId: chatConversaIdAtual })
        });

        const typingElem = document.getElementById(typingId);
        if (typingElem) typingElem.remove();

        const dados = await res.json();

        if (res.ok) {
            chatConversaIdAtual = dados.conversaId;
            chatWindow.innerHTML += `<div class="msg-bubble msg-ia">${dados.resposta}</div>`;
        } else {
            chatWindow.innerHTML += `<div class="msg-bubble msg-ia">❌ ${dados.erro || 'Erro ao processar resposta.'}</div>`;
        }
    } catch (err) {
        const typingElem = document.getElementById(typingId);
        if (typingElem) typingElem.remove();
        chatWindow.innerHTML += `<div class="msg-bubble msg-ia">❌ Erro de conexão com o servidor.</div>`;
    }

    chatWindow.scrollTop = chatWindow.scrollHeight;
}

async function limparChat() {
    const token = localStorage.getItem('token');
    if (!token || !confirm("Deseja realmente iniciar uma nova conversa e limpar o histórico?")) return;

    try {
        await fetch(`${API_URL}/chat/limpar`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        chatConversaIdAtual = null;
        const chatWindow = document.getElementById('chatWindow');
        chatWindow.innerHTML = `
            <div class="msg-bubble msg-ia">
                Conversa reiniciada! Como posso ajudar você a analisar as cidades paranaenses com base nos dados oficiais?
            </div>
        `;
    } catch (err) {
        alert("Erro ao limpar histórico.");
    }
}

function usarSugestao(texto) {
    const input = document.getElementById('msg-input');
    if (input) {
        input.value = texto;
        enviarMensagemChat();
    }
}

// ==========================================
// 7. CONSULTOR IA NA HOME PAGE (INDEX)
// ==========================================

async function enviarPerguntaHero(event) {
    if (event) event.preventDefault();

    const input = document.getElementById('heroPromptInput');
    const btn = document.getElementById('btnHeroAi');
    const card = document.getElementById('heroAiResponseCard');
    const corpoTexto = document.getElementById('heroAiText');
    const token = localStorage.getItem('token');

    if (!input) return;
    const pergunta = input.value.trim();
    if (!pergunta) return;

    if (!token) {
        if (confirm("Você precisa estar logado para consultar a Inteligência Artificial. Deseja fazer login agora?")) {
            window.location.href = 'login.html';
        }
        return;
    }

    card.style.display = 'block';
    corpoTexto.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Consultando dados oficiais e calculando indicadores do Paraná...';
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    btn.disabled = true;

    try {
        const res = await fetch(`${API_URL}/chat/enviar`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ mensagem: pergunta })
        });

        const data = await res.json();

        if (res.ok) {
            corpoTexto.innerText = data.resposta;
        } else {
            corpoTexto.innerText = `❌ ${data.erro || 'Falha ao consultar a IA.'}`;
        }
    } catch (err) {
        corpoTexto.innerText = "❌ Erro de conexão com o servidor da IA.";
    } finally {
        btn.innerHTML = '<i class="fas fa-paper-plane"></i> Consultar IA';
        btn.disabled = false;
        card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
}

function fazerPerguntaHero(texto) {
    const input = document.getElementById('heroPromptInput');
    if (input) {
        input.value = texto;
        enviarPerguntaHero();
    }
}

// ==========================================
// 8. MÓDULO ADMINISTRATIVO (CRUD NO FRONTEND)
// ==========================================

function exibirMensagemAdmin(texto, tipo) {
    const msg = document.getElementById('admin-msg');
    if (!msg) return;
    msg.innerText = texto;
    msg.className = `msg-box msg-${tipo}`;
    msg.style.display = 'block';
    msg.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    setTimeout(() => { msg.style.display = 'none'; }, 6000);
}

function extrairValorFront(campo) {
    if (campo === undefined || campo === null) return '-';
    if (typeof campo === 'number') return campo;
    if (typeof campo === 'object' && campo.valor !== undefined) return campo.valor;
    return campo;
}

async function carregarCidadesAdmin() {
    const tbody = document.getElementById('adminTableBody');
    const token = localStorage.getItem('token');
    if (!tbody || !token) return;

    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;"><i class="fas fa-spinner fa-spin"></i> Carregando dados oficiais do banco...</td></tr>';

    try {
        const res = await fetch(`${API_URL}/admin/cidades`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (res.status === 401 || res.status === 403) {
            alert("Sua sessão expirou ou você não tem permissão de administrador.");
            window.location.href = 'login.html';
            return;
        }

        const cidades = await res.json();
        tbody.innerHTML = '';

        if (!cidades || cidades.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;">Nenhuma cidade cadastrada ainda. Use o formulário acima para cadastrar.</td></tr>';
            return;
        }

        cidades.forEach(c => {
            const ind = c.indicadores || {};
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${c.ibge_id}</td>
                <td><strong>${c.nome}</strong></td>
                <td>${extrairValorFront(ind.ideb)}</td>
                <td>${extrairValorFront(ind.seguranca_indice)}</td>
                <td>${extrairValorFront(ind.saude_leitos)}</td>
                <td>R$ ${extrairValorFront(ind.pib_per_capita)}</td>
                <td class="td-score">${c.score_calculado || '0.0'}</td>
                <td>
                    <button class="btn-action-edit" onclick="prepararEdicaoCidade('${c._id}')" title="Editar"><i class="fas fa-edit"></i></button>
                    <button class="btn-action-delete" onclick="excluirCidade('${c._id}', '${c.nome}')" title="Excluir"><i class="fas fa-trash-alt"></i></button>
                </td>
            `;
            tbody.appendChild(tr);
        });

    } catch (err) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; color: red;">Erro de conexão ao carregar cidades.</td></tr>';
    }
}

async function prepararEdicaoCidade(id) {
    const token = localStorage.getItem('token');
    try {
        const res = await fetch(`${API_URL}/admin/cidades/${id}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const cidade = await res.json();

        if (res.ok) {
            document.getElementById('cidade-id').value = cidade._id;
            document.getElementById('ibge_id').value = cidade.ibge_id;
            document.getElementById('cidade-nome').value = cidade.nome;

            const ind = cidade.indicadores || {};

            // 1. IDEB
            document.getElementById('ind-ideb-val').value = ind.ideb?.valor ?? (typeof ind.ideb === 'number' ? ind.ideb : '');
            document.getElementById('ind-ideb-ano').value = ind.ideb?.ano || 2023;
            document.getElementById('ind-ideb-fonte').value = ind.ideb?.fonte || 'INEP / IPARDES';

            // 2. Alfabetização
            document.getElementById('ind-alfa-val').value = ind.taxa_alfabetizacao?.valor ?? (typeof ind.taxa_alfabetizacao === 'number' ? ind.taxa_alfabetizacao : '');
            document.getElementById('ind-alfa-ano').value = ind.taxa_alfabetizacao?.ano || 2022;
            document.getElementById('ind-alfa-fonte').value = ind.taxa_alfabetizacao?.fonte || 'IBGE / IPARDES';

            // 3. Segurança
            document.getElementById('ind-seg-val').value = ind.seguranca_indice?.valor ?? (typeof ind.seguranca_indice === 'number' ? ind.seguranca_indice : '');
            document.getElementById('ind-seg-ano').value = ind.seguranca_indice?.ano || 2023;
            document.getElementById('ind-seg-fonte').value = ind.seguranca_indice?.fonte || 'SESP-PR / IPARDES';

            // 4. Leitos
            document.getElementById('ind-leitos-val').value = ind.saude_leitos?.valor ?? (typeof ind.saude_leitos === 'number' ? ind.saude_leitos : '');
            document.getElementById('ind-leitos-ano').value = ind.saude_leitos?.ano || 2023;
            document.getElementById('ind-leitos-fonte').value = ind.saude_leitos?.fonte || 'DATASUS / IPARDES';

            // 5. Saneamento
            document.getElementById('ind-saneamento-val').value = ind.saneamento_basico?.valor ?? (typeof ind.saneamento_basico === 'number' ? ind.saneamento_basico : '');
            document.getElementById('ind-saneamento-ano').value = ind.saneamento_basico?.ano || 2023;
            document.getElementById('ind-saneamento-fonte').value = ind.saneamento_basico?.fonte || 'SNIS / IPARDES';

            // 6. PIB
            document.getElementById('ind-pib-val').value = ind.pib_per_capita?.valor ?? (typeof ind.pib_per_capita === 'number' ? ind.pib_per_capita : '');
            document.getElementById('ind-pib-ano').value = ind.pib_per_capita?.ano || 2021;
            document.getElementById('ind-pib-fonte').value = ind.pib_per_capita?.fonte || 'IBGE / IPARDES';

            // 7. Emprego
            document.getElementById('ind-emp-val').value = ind.taxa_ocupacao?.valor ?? (typeof ind.taxa_ocupacao === 'number' ? ind.taxa_ocupacao : '');
            document.getElementById('ind-emp-ano').value = ind.taxa_ocupacao?.ano || 2023;
            document.getElementById('ind-emp-fonte').value = ind.taxa_ocupacao?.fonte || 'CAGED / IPARDES';

            document.getElementById('form-titulo').innerHTML = `<i class="fas fa-edit"></i> Editando: ${cidade.nome}`;
            document.getElementById('btnSalvarCidade').innerHTML = '<i class="fas fa-sync-alt"></i> Atualizar Município';
            document.getElementById('btnCancelarEdicao').style.display = 'inline-block';
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    } catch (err) {
        exibirMensagemAdmin("Erro ao carregar dados da cidade para edição.", "error");
    }
}

function cancelarEdicao() {
    const form = document.getElementById('adminCidadeForm');
    if (form) form.reset();
    document.getElementById('cidade-id').value = '';
    document.getElementById('form-titulo').innerHTML = '<i class="fas fa-plus-circle"></i> Cadastrar Nova Cidade';
    document.getElementById('btnSalvarCidade').innerHTML = '<i class="fas fa-save"></i> Salvar Município';
    document.getElementById('btnCancelarEdicao').style.display = 'none';
}

async function salvarCidadeAdmin(event) {
    event.preventDefault();
    const token = localStorage.getItem('token');
    const id = document.getElementById('cidade-id').value;
    const btn = document.getElementById('btnSalvarCidade');

    const cidadeData = {
        ibge_id: Number(document.getElementById('ibge_id').value),
        nome: document.getElementById('cidade-nome').value.trim(),
        indicadores: {
            ideb: {
                valor: Number(document.getElementById('ind-ideb-val').value) || 0,
                ano: Number(document.getElementById('ind-ideb-ano').value) || 2023,
                fonte: document.getElementById('ind-ideb-fonte').value.trim() || 'INEP / IPARDES'
            },
            taxa_alfabetizacao: {
                valor: Number(document.getElementById('ind-alfa-val').value) || 0,
                ano: Number(document.getElementById('ind-alfa-ano').value) || 2022,
                fonte: document.getElementById('ind-alfa-fonte').value.trim() || 'IBGE / IPARDES'
            },
            seguranca_indice: {
                valor: Number(document.getElementById('ind-seg-val').value) || 0,
                ano: Number(document.getElementById('ind-seg-ano').value) || 2023,
                fonte: document.getElementById('ind-seg-fonte').value.trim() || 'SESP-PR / IPARDES'
            },
            saude_leitos: {
                valor: Number(document.getElementById('ind-leitos-val').value) || 0,
                ano: Number(document.getElementById('ind-leitos-ano').value) || 2023,
                fonte: document.getElementById('ind-leitos-fonte').value.trim() || 'DATASUS / IPARDES'
            },
            saneamento_basico: {
                valor: Number(document.getElementById('ind-saneamento-val').value) || 0,
                ano: Number(document.getElementById('ind-saneamento-ano').value) || 2023,
                fonte: document.getElementById('ind-saneamento-fonte').value.trim() || 'SNIS / IPARDES'
            },
            pib_per_capita: {
                valor: Number(document.getElementById('ind-pib-val').value) || 0,
                ano: Number(document.getElementById('ind-pib-ano').value) || 2021,
                fonte: document.getElementById('ind-pib-fonte').value.trim() || 'IBGE / IPARDES'
            },
            taxa_ocupacao: {
                valor: Number(document.getElementById('ind-emp-val').value) || 0,
                ano: Number(document.getElementById('ind-emp-ano').value) || 2023,
                fonte: document.getElementById('ind-emp-fonte').value.trim() || 'CAGED / IPARDES'
            }
        }
    };

    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Gravando dados no banco...';
    btn.disabled = true;

    try {
        const url = id ? `${API_URL}/admin/cidades/${id}` : `${API_URL}/admin/cidades`;
        const method = id ? 'PUT' : 'POST';

        const res = await fetch(url, {
            method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(cidadeData)
        });

        const dados = await res.json();

        if (res.ok) {
            exibirMensagemAdmin(`✅ ${dados.msg || 'Operação realizada com sucesso!'}`, "success");
            cancelarEdicao();
            carregarCidadesAdmin();
        } else {
            exibirMensagemAdmin(`❌ ${dados.erro || 'Erro ao salvar dados.'}`, "error");
        }
    } catch (err) {
        exibirMensagemAdmin("❌ Erro de comunicação com o servidor.", "error");
    } finally {
        btn.innerHTML = id ? '<i class="fas fa-sync-alt"></i> Atualizar Município' : '<i class="fas fa-save"></i> Salvar Município';
        btn.disabled = false;
    }
}

async function excluirCidade(id, nome) {
    const confirmou = confirm(`Tem certeza que deseja excluir o município de "${nome}" da base de dados oficial?`);
    if (!confirmou) return;

    const token = localStorage.getItem('token');
    try {
        const res = await fetch(`${API_URL}/admin/cidades/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        const dados = await res.json();
        if (res.ok) {
            exibirMensagemAdmin(`✅ ${dados.msg}`, "success");
            carregarCidadesAdmin();
        } else {
            exibirMensagemAdmin(`❌ ${dados.erro}`, "error");
        }
    } catch (err) {
        exibirMensagemAdmin("❌ Falha ao excluir cidade.", "error");
    }
}

// ==========================================
// 9. INICIALIZADOR DE EVENTOS (DOM LOADED)
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
    atualizarMenuNavegacao();

    // Formulários de Auth
    const formCad = document.getElementById('cadastroForm');
    if (formCad) formCad.onsubmit = realizarCadastro;

    const formLog = document.getElementById('loginForm');
    if (formLog) formLog.onsubmit = fazerLogin;

    const formPerfil = document.getElementById('perfilForm');
    if (formPerfil) {
        formPerfil.onsubmit = salvarPerfil;
        carregarPerfil();
    }

    // Busca na Página Inicial
    const btnBusca = document.querySelector('.btn-main');
    if (btnBusca && document.getElementById('citySearch')) btnBusca.onclick = realizarBusca;

    const inputBusca = document.getElementById('citySearch');
    if (inputBusca) {
        inputBusca.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') realizarBusca();
        });

        const params = new URLSearchParams(window.location.search);
        const cidadeURL = params.get('busca');
        if (cidadeURL) {
            inputBusca.value = cidadeURL;
            realizarBusca();
        }
    }

    // Carrossel Premium
    if (document.getElementById('premiumCarousel')) {
        carregarCarrosselPremium();
    }

    // Ranking e Pódio
    if (document.getElementById('rankingTableBody')) {
        carregarRankingCompleto();
        configurarFiltrosRanking();
    }

    // Chat
    const formChat = document.getElementById('chatForm');
    if (formChat) {
        formChat.onsubmit = enviarMensagemChat;
        carregarHistoricoChat();
    }

    // Formulário do Admin
    const formAdmin = document.getElementById('adminCidadeForm');
    if (formAdmin) {
        formAdmin.onsubmit = salvarCidadeAdmin;
    }

    // Formulário de Pergunta na Hero (Home)
    const heroForm = document.getElementById('heroAiForm');
    if (heroForm) {
        heroForm.onsubmit = enviarPerguntaHero;
    }
});