// ==========================================
// 1. CONFIGURAÇÃO DINÂMICA DA API
// ==========================================
const API_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://localhost:3000/api'
    : 'https://parana-living-backend.onrender.com/api';

const FOTO_PADRAO_PARANA = "https://images.unsplash.com/photo-1596422846543-75c6fc197f07?auto=format&fit=crop&w=1200&q=80";

// Converte Markdown da IA para HTML estilizado (ChatGPT Style)
function formatarMarkdownVisual(texto) {
    if (!texto) return '';
    let html = texto
        .replace(/^### (.*$)/gim, '<h4 style="margin: 12px 0 6px; color: var(--secondary-color); font-weight: 800;">$1</h4>')
        .replace(/^## (.*$)/gim, '<h3 style="margin: 14px 0 8px; color: var(--secondary-color); font-weight: 800;">$1</h3>')
        .replace(/^# (.*$)/gim, '<h2 style="margin: 16px 0 10px; color: var(--secondary-color); font-weight: 800;">$1</h2>')
        .replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/gim, '<em>$1</em>')
        .replace(/^\s*[-*]\s+(.*$)/gim, '<div style="margin: 4px 0; padding-left: 8px;">• $1</div>')
        .replace(/---/gim, '<hr style="border:0; border-top: 1px solid #e2e8f0; margin: 12px 0;">')
        .replace(/\n\n/gim, '<div style="height: 8px;"></div>')
        .replace(/\n/gim, '<br>');
    return html;
}

function obterValorNum(campo) {
    if (campo === undefined || campo === null) return 0;
    if (typeof campo === 'number') return campo;
    if (typeof campo === 'object') {
        if (campo['2023'] !== undefined) return Number(campo['2023']) || 0;
        if (campo['2022'] !== undefined) return Number(campo['2022']) || 0;
        if (campo.valor !== undefined) return Number(campo.valor) || 0;
    }
    return Number(campo) || 0;
}

// Busca foto com desambiguação
async function obterUrlFotoCidade(nomeCidade) {
    const tentativas = [
        `${nomeCidade} (Paraná)`,
        nomeCidade,
        `Município de ${nomeCidade}`
    ];

    for (const termo of tentativas) {
        try {
            const url = `https://pt.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(termo)}`;
            const res = await fetch(url);
            if (!res.ok) continue;

            const data = await res.json();
            const fotoUrl = data.originalimage?.source || data.thumbnail?.source;
            if (fotoUrl) return fotoUrl;
        } catch (err) { }
    }
    return FOTO_PADRAO_PARANA;
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
            <li><a href="cidades.html">Municípios</a></li>
            <li><a href="comparar.html">Comparar</a></li>
            <li><a href="chat.html">Chat IA</a></li>
            ${usuarioRole === 'admin' ? '<li><a href="admin.html" style="color: #ffd700;"><i class="fas fa-shield-alt"></i> Admin</a></li>' : ''}
            <li><a href="perfil.html"><i class="fas fa-user-circle"></i> ${usuarioNome.split(' ')[0]}</a></li>
            <li><a href="javascript:void(0)" onclick="logout()" style="color: #ef4444;"><i class="fas fa-sign-out-alt"></i> Sair</a></li>
        `;
    }
}

// ==========================================
// 3. CARROSSEL PREMIUM & FOTOS (INDEX.HTML)
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
            premiumCidades = data.slice(0, 5);
            if (loader) loader.style.display = 'none';
            content.style.display = 'block';
            await exibirSlidePremium(0);
        } else {
            if (loader) loader.innerText = 'Nenhuma cidade cadastrada ainda.';
        }
    } catch (err) {
        console.error("Erro no carrossel:", err);
    }
}

async function exibirSlidePremium(index) {
    if (!premiumCidades || premiumCidades.length === 0) return;
    const cidade = premiumCidades[index];

    const tit = document.getElementById('p-titulo');
    const grade = document.getElementById('p-grade');
    const desc = document.getElementById('p-descricao');
    const carrosselElem = document.querySelector('.ranking-premium');

    if (tit) tit.innerText = `${index + 1}º - ${cidade.nome}`;
    if (grade) grade.innerText = cidade.score_final;
    if (desc) {
        desc.innerHTML = `
            ${cidade.relatorio_ia || `Município em destaque com Living Score oficial de <strong>${cidade.score_final}</strong> pontos.`}
            <br><br>
            <a href="cidades.html?nome=${encodeURIComponent(cidade.nome)}" class="btn-main" style="display: inline-block; padding: 8px 18px; font-size: 0.85rem; text-decoration: none;">
                <i class="fas fa-search-plus"></i> Ver Indicadores Completos
            </a>
        `;
    }

    if (carrosselElem) {
        const fotoUrl = await obterUrlFotoCidade(cidade.nome);
        carrosselElem.style.backgroundImage = `linear-gradient(to right, rgba(15, 23, 42, 0.95) 0%, rgba(15, 23, 42, 0.75) 55%, rgba(15, 23, 42, 0.4) 100%), url('${fotoUrl}')`;
        carrosselElem.style.backgroundSize = 'cover';
        carrosselElem.style.backgroundPosition = 'center';
        carrosselElem.style.transition = 'background-image 0.5s ease-in-out';
    }
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
// 4. RANKING COMPLETO E FILTRO REGIONAL (RANKING.HTML)
// ==========================================

let dadosRankingGlobal = [];
let listaRankingFiltrada = [];

async function carregarRankingCompleto() {
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

        aplicarFiltrosRanking();
    } catch (err) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: red;">Erro ao carregar dados do ranking.</td></tr>';
    }
}

function aplicarFiltrosRanking() {
    const btnAtivo = document.querySelector('.filter-btn.active');
    const pilar = btnAtivo ? btnAtivo.innerText.trim() : 'Geral';
    const regiao = document.getElementById('selectMesorregiao')?.value || 'Todas';

    let lista = [...dadosRankingGlobal];

    // 1. Filtro por Região
    if (regiao !== 'Todas') {
        lista = lista.filter(c => c.mesorregiao && c.mesorregiao.toLowerCase().includes(regiao.toLowerCase()));
    }

    // 2. Ordenação por Pilar
    if (pilar === 'Educação') {
        lista.sort((a, b) => obterValorNum(b.indicadores?.educacao) - obterValorNum(a.indicadores?.educacao));
    } else if (pilar === 'Saúde') {
        lista.sort((a, b) => obterValorNum(b.indicadores?.saude) - obterValorNum(a.indicadores?.saude));
    } else if (pilar === 'Economia' || pilar === 'Emprego') {
        lista.sort((a, b) => obterValorNum(b.indicadores?.economia) - obterValorNum(a.indicadores?.economia));
    } else {
        lista.sort((a, b) => b.score_final - a.score_final);
    }

    listaRankingFiltrada = lista.map((c, index) => ({ ...c, posicaoOficial: index + 1 }));

    // Atualiza Pódio
    if (listaRankingFiltrada.length >= 1) {
        if (document.getElementById('pos1-nome')) document.getElementById('pos1-nome').innerText = listaRankingFiltrada[0].nome;
        if (document.getElementById('pos1-score')) document.getElementById('pos1-score').innerText = listaRankingFiltrada[0].score_final;
    }
    if (listaRankingFiltrada.length >= 2) {
        if (document.getElementById('pos2-nome')) document.getElementById('pos2-nome').innerText = listaRankingFiltrada[1].nome;
        if (document.getElementById('pos2-score')) document.getElementById('pos2-score').innerText = listaRankingFiltrada[1].score_final;
    }
    if (listaRankingFiltrada.length >= 3) {
        if (document.getElementById('pos3-nome')) document.getElementById('pos3-nome').innerText = listaRankingFiltrada[2].nome;
        if (document.getElementById('pos3-score')) document.getElementById('pos3-score').innerText = listaRankingFiltrada[2].score_final;
    }

    filtrarTabelaRanking();
}

function filtrarTabelaRanking() {
    const tbody = document.getElementById('rankingTableBody');
    if (!tbody) return;

    const termo = (document.getElementById('inputBuscaRanking')?.value || '').toLowerCase().trim();

    const cidadesParaExibir = termo 
        ? listaRankingFiltrada.filter(c => c.nome.toLowerCase().includes(termo))
        : listaRankingFiltrada;

    tbody.innerHTML = '';

    if (cidadesParaExibir.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 25px; color: var(--text-muted);">Nenhum município encontrado.</td></tr>`;
        return;
    }

    cidadesParaExibir.forEach(c => {
        const ind = c.indicadores || {};
        const eduVal = obterValorNum(ind.educacao);
        const sauVal = obterValorNum(ind.saude);
        const ecoVal = obterValorNum(ind.economia);

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>#${c.posicaoOficial}</strong></td>
            <td><strong>${c.nome}</strong> <span style="font-size:0.75rem; color:#94a3b8;">(${c.mesorregiao || 'PR'})</span></td>
            <td>${eduVal ? (eduVal <= 1 ? (eduVal * 10).toFixed(2) : eduVal.toFixed(1)) : '0.0'}</td>
            <td>${sauVal ? (sauVal <= 1 ? (sauVal * 10).toFixed(2) : sauVal.toFixed(1)) : '0.0'}</td>
            <td>${ecoVal ? (ecoVal <= 1 ? (ecoVal * 10).toFixed(2) : ecoVal.toFixed(1)) : '0.0'}</td>
            <td class="td-score">${c.score_final}</td>
            <td><button class="btn-view" onclick="verDetalhesCidade('${c.nome}')">Ver Análise</button></td>
        `;
        tbody.appendChild(tr);
    });
}

function verDetalhesCidade(nome) {
    window.location.href = `cidades.html?nome=${encodeURIComponent(nome)}`;
}

function configurarFiltrosRanking() {
    const botoes = document.querySelectorAll('.filter-btn');
    botoes.forEach(btn => {
        btn.addEventListener('click', () => {
            botoes.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            aplicarFiltrosRanking();
        });
    });
}

// ==========================================
// 5. CHAT IA (CHAT.HTML)
// ==========================================

// ==========================================
// 5. CHAT IA COM MENU SANDUÍCHE & HISTÓRICO
// ==========================================

let chatConversaIdAtual = null;

// Controle da Sidebar Lateral (Menu Sanduíche)
function abrirSidebarChat() {
    document.getElementById('chatSidebarDrawer')?.classList.add('open');
    document.getElementById('chatSidebarBackdrop')?.classList.add('active');
    carregarListaHistoricoDrawer();
}

function fecharSidebarChat() {
    document.getElementById('chatSidebarDrawer')?.classList.remove('open');
    document.getElementById('chatSidebarBackdrop')?.classList.remove('active');
}

// Carrega as conversas salvas no menu lateral
async function carregarListaHistoricoDrawer() {
    const listaElem = document.getElementById('listaHistoricoConversas');
    const token = localStorage.getItem('token');
    if (!listaElem) return;

    if (!token) {
        listaElem.innerHTML = `
            <div style="text-align: center; color: var(--text-muted); font-size: 0.85rem; padding: 20px 10px;">
                Faça login para ver e salvar seu histórico.
            </div>
        `;
        return;
    }

    try {
        const res = await fetch(`${API_URL}/chat/conversas`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (res.ok) {
            const conversas = await res.json();
            listaElem.innerHTML = '';

            if (conversas.length === 0) {
                listaElem.innerHTML = `
                    <div style="text-align: center; color: var(--text-muted); font-size: 0.85rem; padding: 20px 10px;">
                        Nenhuma conversa salva ainda.
                    </div>
                `;
                return;
            }

            conversas.forEach(conv => {
                const dataFormatada = new Date(conv.atualizado_em).toLocaleDateString('pt-BR', {
                    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
                });

                const itemDiv = document.createElement('div');
                itemDiv.className = `chat-history-item ${conv._id === chatConversaIdAtual ? 'active' : ''}`;
                itemDiv.onclick = () => carregarConversaEspecifica(conv._id);

                itemDiv.innerHTML = `
                    <div class="chat-history-info">
                        <div class="chat-history-title">${conv.titulo || 'Conversa sem título'}</div>
                        <div class="chat-history-date">${dataFormatada}</div>
                    </div>
                    <button class="btn-delete-history-item" onclick="excluirConversaEspecifica('${conv._id}', event)" title="Excluir conversa">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                `;
                listaElem.appendChild(itemDiv);
            });
        }
    } catch (err) {
        listaElem.innerHTML = `<div style="text-align:center; color:red; font-size:0.85rem;">Erro ao carregar histórico.</div>`;
    }
}

// Abre uma conversa específica do histórico
async function carregarConversaEspecifica(id) {
    const token = localStorage.getItem('token');
    const chatWindow = document.getElementById('chatWindow');
    if (!token || !chatWindow) return;

    chatWindow.innerHTML = `<div class="msg-bubble msg-ia"><i class="fas fa-spinner fa-spin"></i> Carregando conversa...</div>`;
    fecharSidebarChat();

    try {
        const res = await fetch(`${API_URL}/chat/conversa/${id}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (res.ok) {
            const data = await res.json();
            chatConversaIdAtual = data.conversaId;
            chatWindow.innerHTML = '';

            data.mensagens.forEach(msg => {
                const tipo = msg.remetente === 'usuario' ? 'msg-usuario' : 'msg-ia';
                const avatar = msg.remetente === 'ia'
                    ? `<div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px; font-weight: bold; color: var(--primary-color);">
                         <span style="font-size: 1.2rem;">🦫</span>
                         <span>Capiá:</span>
                       </div>`
                    : '';
                const conteudo = msg.remetente === 'usuario' ? msg.conteudo : formatarMarkdownVisual(msg.conteudo);
                chatWindow.innerHTML += `<div class="msg-bubble ${tipo}">${avatar}${conteudo}</div>`;
            });
            chatWindow.scrollTop = chatWindow.scrollHeight;
        }
    } catch (err) {
        alert("Erro ao carregar a conversa selecionada.");
    }
}
// Inicia um novo chat limpo
function iniciarNovoChat() {
    chatConversaIdAtual = null;
    const chatWindow = document.getElementById('chatWindow');
    if (chatWindow) {
        chatWindow.innerHTML = `
            <div class="msg-bubble msg-ia">
                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px; font-weight: bold; color: var(--primary-color);">
                    <span style="font-size: 1.2rem;">🦫</span>
                    <span>Capiá:</span>
                </div>
                Nova conversa iniciada! 🌲 Sobre qual município paranaense você quer conversar agora?
            </div>
        `;
    }
    fecharSidebarChat();
}


// Exclui uma conversa específica
async function excluirConversaEspecifica(id, event) {
    if (event) event.stopPropagation(); // Evita abrir a conversa ao clicar em excluir
    const token = localStorage.getItem('token');
    if (!token || !confirm("Deseja excluir esta conversa do histórico?")) return;

    try {
        const res = await fetch(`${API_URL}/chat/conversa/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (res.ok) {
            if (chatConversaIdAtual === id) {
                iniciarNovoChat();
            }
            carregarListaHistoricoDrawer();
        }
    } catch (err) {
        alert("Erro ao excluir conversa.");
    }
}

// Limpa todo o histórico de conversas
async function limparTodoHistorico() {
    const token = localStorage.getItem('token');
    if (!token || !confirm("Tem certeza que deseja apagar TODO o seu histórico de conversas?")) return;

    try {
        await fetch(`${API_URL}/chat/limpar`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        iniciarNovoChat();
        carregarListaHistoricoDrawer();
    } catch (err) {
        alert("Erro ao limpar histórico.");
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
    chatWindow.innerHTML += `
        <div class="msg-bubble msg-typing" id="${typingId}">
            <i class="fas fa-spinner fa-spin"></i> Capiá está consultando os dados oficiais do Paraná...
        </div>
    `;
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
            chatWindow.innerHTML += `
                <div class="msg-bubble msg-ia">
                    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px; font-weight: bold; color: var(--primary-color);">
                        <span style="font-size: 1.2rem;">🦫</span>
                        <span>Capiá:</span>
                    </div>
                    ${formatarMarkdownVisual(dados.resposta)}
                </div>
            `;
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

// ==========================================
// 6. CONSULTOR IA NA HOME PAGE (INDEX)
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
// 7. MÓDULO ADMINISTRATIVO (CRUD ADAPTADO AO IPARDES)
// ==========================================

let listaCidadesAdminGlobal = [];

function exibirMensagemAdmin(texto, tipo) {
    const msg = document.getElementById('admin-msg');
    if (!msg) return;
    msg.innerText = texto;
    msg.className = `msg-box msg-${tipo}`;
    msg.style.display = 'block';
    msg.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    setTimeout(() => { msg.style.display = 'none'; }, 6000);
}

function formatarNotaAdmin(campo) {
    if (campo === undefined || campo === null) return '-';
    if (typeof campo === 'number') return campo.toFixed(4);
    if (typeof campo === 'object') {
        const val = campo['2023'] ?? campo['2022'] ?? campo.valor;
        return (val !== undefined && val !== null) ? Number(val).toFixed(4) : '-';
    }
    return campo;
}

async function carregarCidadesAdmin() {
    const tbody = document.getElementById('adminTableBody');
    const token = localStorage.getItem('token');
    if (!tbody || !token) return;

    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;"><i class="fas fa-spinner fa-spin"></i> Carregando municípios do Paraná...</td></tr>';

    try {
        const res = await fetch(`${API_URL}/admin/cidades`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (res.status === 401 || res.status === 403) {
            alert("Sua sessão expirou ou você não tem permissão de administrador.");
            window.location.href = 'login.html';
            return;
        }

        listaCidadesAdminGlobal = await res.json();
        const contador = document.getElementById('totalCidadesContador');
        if (contador) contador.innerText = listaCidadesAdminGlobal.length;

        renderizarTabelaAdmin(listaCidadesAdminGlobal);
    } catch (err) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; color: red;">Erro de conexão ao carregar cidades.</td></tr>';
    }
}

function renderizarTabelaAdmin(lista) {
    const tbody = document.getElementById('adminTableBody');
    if (!tbody) return;

    tbody.innerHTML = '';

    if (!lista || lista.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;">Nenhum município encontrado.</td></tr>';
        return;
    }

    lista.forEach(c => {
        const ind = c.indicadores || {};
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${c.ibge_id || '-'}</td>
            <td><strong>${c.nome}</strong></td>
            <td>${formatarNotaAdmin(ind.educacao)}</td>
            <td>${formatarNotaAdmin(ind.saude)}</td>
            <td>${formatarNotaAdmin(ind.economia)}</td>
            <td>${formatarNotaAdmin(ind.seguranca)}</td>
            <td class="td-score">${c.score_calculado || '0.0'}</td>
            <td>
                <button class="btn-action-edit" onclick="prepararEdicaoCidade('${c._id}')" title="Editar"><i class="fas fa-edit"></i></button>
                <button class="btn-action-delete" onclick="excluirCidade('${c._id}', '${c.nome}')" title="Excluir"><i class="fas fa-trash-alt"></i></button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function filtrarTabelaAdmin() {
    const termo = (document.getElementById('filtroAdminCidade')?.value || '').toLowerCase().trim();
    if (!termo) {
        renderizarTabelaAdmin(listaCidadesAdminGlobal);
        return;
    }

    const filtradas = listaCidadesAdminGlobal.filter(c => 
        (c.nome && c.nome.toLowerCase().includes(termo)) ||
        (c.ibge_id && String(c.ibge_id).includes(termo))
    );
    renderizarTabelaAdmin(filtradas);
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
            document.getElementById('ibge_id').value = cidade.ibge_id || '';
            document.getElementById('cidade-nome').value = cidade.nome || '';

            const ind = cidade.indicadores || {};

            document.getElementById('ind-edu-2022').value = ind.educacao?.['2022'] ?? '';
            document.getElementById('ind-edu-2023').value = ind.educacao?.['2023'] ?? '';
            document.getElementById('ind-sau-2022').value = ind.saude?.['2022'] ?? '';
            document.getElementById('ind-sau-2023').value = ind.saude?.['2023'] ?? '';
            document.getElementById('ind-eco-2022').value = ind.economia?.['2022'] ?? '';
            document.getElementById('ind-eco-2023').value = ind.economia?.['2023'] ?? '';
            document.getElementById('ind-seg-2022').value = ind.seguranca?.['2022'] ?? '';
            document.getElementById('ind-seg-2023').value = ind.seguranca?.['2023'] ?? '';
            document.getElementById('ind-agro-2022').value = ind.agropecuaria?.['2022'] ?? '';
            document.getElementById('ind-agro-2023').value = ind.agropecuaria?.['2023'] ?? '';
            document.getElementById('ind-san-2022').value = ind.saneamento?.['2022'] ?? '';
            document.getElementById('ind-san-2023').value = ind.saneamento?.['2023'] ?? '';

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
    document.getElementById('form-titulo').innerHTML = '<i class="fas fa-edit"></i> Formulário do Município';
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
            educacao: {
                "2022": parseFloat(document.getElementById('ind-edu-2022').value) || 0,
                "2023": parseFloat(document.getElementById('ind-edu-2023').value) || 0
            },
            saude: {
                "2022": parseFloat(document.getElementById('ind-sau-2022').value) || 0,
                "2023": parseFloat(document.getElementById('ind-sau-2023').value) || 0
            },
            economia: {
                "2022": parseFloat(document.getElementById('ind-eco-2022').value) || 0,
                "2023": parseFloat(document.getElementById('ind-eco-2023').value) || 0
            },
            seguranca: {
                "2022": parseFloat(document.getElementById('ind-seg-2022').value) || 0,
                "2023": parseFloat(document.getElementById('ind-seg-2023').value) || 0
            },
            agropecuaria: {
                "2022": parseFloat(document.getElementById('ind-agro-2022').value) || 0,
                "2023": parseFloat(document.getElementById('ind-agro-2023').value) || 0
            },
            saneamento: {
                "2022": parseFloat(document.getElementById('ind-san-2022').value) || 0,
                "2023": parseFloat(document.getElementById('ind-san-2023').value) || 0
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
// 8. MÓDULO DA PÁGINA MUNICÍPIOS (CIDADES.HTML)
// ==========================================

let listaCidadesAutocompletar = [];
let cidadeAtualSelecionada = null;
let instanciaGraficoEvolucao = null;

async function inicializarPaginaCidades() {
    const datalist = document.getElementById('listaSugestoesCidades');
    if (!datalist) return;

    try {
        const res = await fetch(`${API_URL}/cidades`);
        const cidades = await res.json();
        listaCidadesAutocompletar = cidades;

        datalist.innerHTML = '';
        cidades.forEach(c => {
            const option = document.createElement('option');
            option.value = c.nome;
            datalist.appendChild(option);
        });

        const params = new URLSearchParams(window.location.search);
        const nomeParam = params.get('nome') || params.get('busca');
        if (nomeParam) {
            document.getElementById('inputBuscaMunicipio').value = nomeParam;
            pesquisarMunicipioDetalhes(nomeParam);
        } else if (cidades.length > 0) {
            const padrao = cidades.find(c => c.nome.toLowerCase().includes("assis")) || cidades[0];
            document.getElementById('inputBuscaMunicipio').value = padrao.nome;
            pesquisarMunicipioDetalhes(padrao.nome);
        }

        document.getElementById('inputBuscaMunicipio')?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') pesquisarMunicipioDetalhes();
        });

    } catch (err) {
        console.error("Erro ao carregar lista de cidades:", err);
    }
}

async function carregarFotoCidade(nomeCidade) {
    const bannerImg = document.getElementById('detalhe-foto-banner');
    const descTexto = document.getElementById('detalhe-descricao-texto');

    if (bannerImg) bannerImg.src = FOTO_PADRAO_PARANA;
    if (descTexto) descTexto.innerText = "Buscando dados enciclopédicos e perfil histórico do município...";

    const tentativas = [
        `${nomeCidade} (Paraná)`,
        nomeCidade,
        `Município de ${nomeCidade}`
    ];

    for (const termo of tentativas) {
        try {
            const url = `https://pt.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(termo)}`;
            const res = await fetch(url);
            if (!res.ok) continue;

            const data = await res.json();
            const fotoUrl = data.originalimage?.source || data.thumbnail?.source;
            if (fotoUrl && bannerImg) {
                bannerImg.src = fotoUrl;
            }

            if (data.extract && descTexto) {
                descTexto.innerText = data.extract;
                return;
            }
        } catch (err) { }
    }

    if (descTexto) {
        descTexto.innerText = `${nomeCidade} é um município localizado no estado do Paraná, integrante da base oficial de indicadores do projeto Paraná Living Score.`;
    }
}

function renderizarGraficoEvolucao(ind) {
    const canvas = document.getElementById('graficoEvolucaoCidade');
    if (!canvas) return;

    if (instanciaGraficoEvolucao) {
        instanciaGraficoEvolucao.destroy();
    }

    const ctx = canvas.getContext('2d');

    const edu22 = (Number(ind.educacao?.['2022']) || 0) * 100;
    const edu23 = (Number(ind.educacao?.['2023']) || 0) * 100;

    const sau22 = (Number(ind.saude?.['2022']) || 0) * 100;
    const sau23 = (Number(ind.saude?.['2023']) || 0) * 100;

    const eco22 = (Number(ind.economia?.['2022']) || 0) * 100;
    const eco23 = (Number(ind.economia?.['2023']) || 0) * 100;

    instanciaGraficoEvolucao = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['🎓 Educação', '🏥 Saúde', '💼 Economia e Renda'],
            datasets: [
                {
                    label: 'Ano 2022 (IPARDES)',
                    data: [edu22.toFixed(1), sau22.toFixed(1), eco22.toFixed(1)],
                    backgroundColor: 'rgba(148, 163, 184, 0.7)',
                    borderColor: '#94a3b8',
                    borderWidth: 1
                },
                {
                    label: 'Ano 2023 (IPARDES)',
                    data: [edu23.toFixed(1), sau23.toFixed(1), eco23.toFixed(1)],
                    backgroundColor: 'rgba(37, 99, 235, 0.85)',
                    borderColor: '#2563eb',
                    borderWidth: 1
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    max: 100,
                    title: { display: true, text: 'Pontuação (0 a 100)' }
                }
            }
        }
    });
}

async function pesquisarMunicipioDetalhes(nomeFixo = null) {
    const termo = (nomeFixo || document.getElementById('inputBuscaMunicipio')?.value || '').trim();
    if (!termo) return;

    const loader = document.getElementById('cidade-loader');
    const painel = document.getElementById('painelDetalhesCidade');

    if (loader) loader.style.display = 'block';
    if (painel) painel.style.display = 'none';

    try {
        const res = await fetch(`${API_URL}/cidades/detalhes/${encodeURIComponent(termo)}`);
        if (!res.ok) {
            alert(`Município "${termo}" não encontrado.`);
            return;
        }

        const data = await res.json();
        const c = data.cidade;
        const ibge = data.ibge;
        cidadeAtualSelecionada = c.nome;

        carregarFotoCidade(c.nome);

        document.getElementById('detalhe-nome').innerText = c.nome;
        document.getElementById('detalhe-ibge').innerText = c.ibge_id || '-';
        document.getElementById('detalhe-score').innerText = data.score_final || '0.0';
        document.getElementById('detalhe-meso').innerText = ibge?.geografia?.mesorregiao || 'Paraná';
        document.getElementById('detalhe-micro').innerText = ibge?.geografia?.microrregiao || 'Geral';

        const climaTxt = document.getElementById('detalhe-clima-valor');
        if (climaTxt) {
            if (data.clima) {
                climaTxt.innerText = `${data.clima.temp}°C, ${data.clima.descricao} (Umidade: ${data.clima.umidade}%)`;
            } else {
                climaTxt.innerText = 'Previsão momentaneamente indisponível';
            }
        }

        const ind = c.indicadores || {};

        const edu22 = ind.educacao?.['2022'] !== undefined ? Number(ind.educacao['2022']).toFixed(4) : '-';
        const edu23 = ind.educacao?.['2023'] !== undefined ? Number(ind.educacao['2023']).toFixed(4) : '-';
        document.getElementById('card-edu-2022').innerText = edu22;
        document.getElementById('card-edu-2023').innerText = edu23;
        document.getElementById('card-edu-atual').innerText = edu23 !== '-' ? edu23 : edu22;

        const sau22 = ind.saude?.['2022'] !== undefined ? Number(ind.saude['2022']).toFixed(4) : '-';
        const sau23 = ind.saude?.['2023'] !== undefined ? Number(ind.saude['2023']).toFixed(4) : '-';
        document.getElementById('card-sau-2022').innerText = sau22;
        document.getElementById('card-sau-2023').innerText = sau23;
        document.getElementById('card-sau-atual').innerText = sau23 !== '-' ? sau23 : sau22;

        const eco22 = ind.economia?.['2022'] !== undefined ? Number(ind.economia['2022']).toFixed(4) : '-';
        const eco23 = ind.economia?.['2023'] !== undefined ? Number(ind.economia['2023']).toFixed(4) : '-';
        document.getElementById('card-eco-2022').innerText = eco22;
        document.getElementById('card-eco-2023').innerText = eco23;
        document.getElementById('card-eco-atual').innerText = eco23 !== '-' ? eco23 : eco22;

        document.getElementById('card-ibge-imediata').innerText = ibge?.geografia?.regiao_imediata || 'Não informada';
        document.getElementById('card-ibge-intermediaria').innerText = ibge?.geografia?.regiao_intermediaria || 'Não informada';
        document.getElementById('card-ibge-regiao-completa').innerText = `${ibge?.geografia?.mesorregiao || 'PR'} / ${ibge?.geografia?.microrregiao || 'PR'}`;

        const popFormatada = (ibge?.demografia?.populacao_censo_2022 && ibge.demografia.populacao_censo_2022 > 0)
            ? Number(ibge.demografia.populacao_censo_2022).toLocaleString('pt-BR') + ' hab.'
            : 'Em catalogação';
            
        const areaFormatada = (ibge?.demografia?.area_km2 && ibge.demografia.area_km2 > 0)
            ? Number(ibge.demografia.area_km2).toLocaleString('pt-BR') + ' km²'
            : 'Paraná';

        if (document.getElementById('detalhe-populacao')) document.getElementById('detalhe-populacao').innerText = popFormatada;
        if (document.getElementById('detalhe-area')) document.getElementById('detalhe-area').innerText = areaFormatada;
        if (document.getElementById('detalhe-gentilico')) document.getElementById('detalhe-gentilico').innerText = `${c.nome.toLowerCase()}ense`;
        if (document.getElementById('detalhe-prefeitura')) document.getElementById('detalhe-prefeitura').innerText = `Prefeitura de ${c.nome}`;

        const mapaIframe = document.getElementById('mapaCidadeIframe');
        if (mapaIframe) {
            mapaIframe.src = `https://maps.google.com/maps?q=${encodeURIComponent(c.nome + ', PR, Brasil')}&t=&z=12&ie=UTF8&iwloc=&output=embed`;
        }

        renderizarGraficoEvolucao(ind);

        if (painel) painel.style.display = 'block';

    } catch (err) {
        console.error("Erro na busca de detalhes:", err);
        alert("Erro ao buscar informações do município.");
    } finally {
        if (loader) loader.style.display = 'none';
    }
}

function perguntarSobreEstaCidade() {
    if (!cidadeAtualSelecionada) return;
    window.location.href = `chat.html?pergunta=${encodeURIComponent(`Faça uma análise detalhada sobre a qualidade de vida e os indicadores de ${cidadeAtualSelecionada}`)}`;
}

// ==========================================
// 9. MÓDULO DO COMPARADOR (COMPARAR.HTML)
// ==========================================

let dadosComparador = { c1: null, c2: null };
let instanciaRadarComparador = null;

async function inicializarComparador() {
    const datalist = document.getElementById('listaSugestoesCidades');
    if (!datalist) return;

    try {
        const res = await fetch(`${API_URL}/cidades`);
        const cidades = await res.json();

        datalist.innerHTML = '';
        cidades.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c.nome;
            datalist.appendChild(opt);
        });

        // Inicia com duelo clássico por padrão
        dueloRapido('Maringá', 'Londrina');
    } catch (err) {
        console.error("Erro ao inicializar comparador:", err);
    }
}

function dueloRapido(cidade1, cidade2) {
    document.getElementById('comp-cidade-1').value = cidade1;
    document.getElementById('comp-cidade-2').value = cidade2;
    executarComparacao();
}

async function executarComparacao() {
    const nome1 = document.getElementById('comp-cidade-1')?.value.trim();
    const nome2 = document.getElementById('comp-cidade-2')?.value.trim();

    if (!nome1 || !nome2) {
        alert("Por favor, preencha o nome dos dois municípios.");
        return;
    }

    const loader = document.getElementById('comp-loader');
    const painel = document.getElementById('painelConfronto');

    if (loader) loader.style.display = 'block';
    if (painel) painel.style.display = 'none';

    try {
        const [res1, res2] = await Promise.all([
            fetch(`${API_URL}/cidades/detalhes/${encodeURIComponent(nome1)}`),
            fetch(`${API_URL}/cidades/detalhes/${encodeURIComponent(nome2)}`)
        ]);

        if (!res1.ok || !res2.ok) {
            alert("Uma ou ambas as cidades não foram encontradas no banco.");
            return;
        }

        const data1 = await res1.json();
        const data2 = await res2.json();

        dadosComparador.c1 = data1;
        dadosComparador.c2 = data2;

        // Fotos
        const [foto1, foto2] = await Promise.all([
            obterUrlFotoCidade(data1.cidade.nome),
            obterUrlFotoCidade(data2.cidade.nome)
        ]);

        // Preenche Cabeçalhos
        document.getElementById('c1-nome').innerText = data1.cidade.nome;
        document.getElementById('c1-regiao').innerText = data1.ibge?.geografia?.mesorregiao || 'Paraná';
        document.getElementById('c1-score').innerText = data1.score_final;
        document.getElementById('c1-foto').src = foto1;
        document.getElementById('th-cidade-1').innerText = data1.cidade.nome;

        document.getElementById('c2-nome').innerText = data2.cidade.nome;
        document.getElementById('c2-regiao').innerText = data2.ibge?.geografia?.mesorregiao || 'Paraná';
        document.getElementById('c2-score').innerText = data2.score_final;
        document.getElementById('c2-foto').src = foto2;
        document.getElementById('th-cidade-2').innerText = data2.cidade.nome;

        // Monta Tabela Comparativa com Placar de Vantagens
        montarTabelaComparativa(data1, data2);

        // Gráfico Radar
        renderizarGraficoRadar(data1, data2);

        if (painel) painel.style.display = 'block';

    } catch (err) {
        console.error("Erro na comparação:", err);
        alert("Erro de conexão ao comparar cidades.");
    } finally {
        if (loader) loader.style.display = 'none';
    }
}

function montarTabelaComparativa(d1, d2) {
    const tbody = document.getElementById('corpoTabelaComparativa');
    if (!tbody) return;

    const ind1 = d1.cidade.indicadores || {};
    const ind2 = d2.cidade.indicadores || {};

    const edu1 = (Number(ind1.educacao?.['2023']) || 0);
    const edu2 = (Number(ind2.educacao?.['2023']) || 0);

    const sau1 = (Number(ind1.saude?.['2023']) || 0);
    const sau2 = (Number(ind2.saude?.['2023']) || 0);

    const eco1 = (Number(ind1.economia?.['2023']) || 0);
    const eco2 = (Number(ind2.economia?.['2023']) || 0);

    const score1 = Number(d1.score_final);
    const score2 = Number(d2.score_final);

    const linhas = [
        {
            nome: 'Living Score Geral',
            v1: `${score1.toFixed(1)} pts`,
            v2: `${score2.toFixed(1)} pts`,
            vencedor: score1 > score2 ? d1.cidade.nome : (score2 > score1 ? d2.cidade.nome : 'Empate')
        },
        {
            nome: '🎓 Educação (IPARDES 2023)',
            v1: edu1.toFixed(4),
            v2: edu2.toFixed(4),
            vencedor: edu1 > edu2 ? d1.cidade.nome : (edu2 > edu1 ? d2.cidade.nome : 'Empate')
        },
        {
            nome: '🏥 Saúde (IPARDES 2023)',
            v1: sau1.toFixed(4),
            v2: sau2.toFixed(4),
            vencedor: sau1 > sau2 ? d1.cidade.nome : (sau2 > sau1 ? d2.cidade.nome : 'Empate')
        },
        {
            nome: '💼 Economia e Renda (IPARDES 2023)',
            v1: eco1.toFixed(4),
            v2: eco2.toFixed(4),
            vencedor: eco1 > eco2 ? d1.cidade.nome : (eco2 > eco1 ? d2.cidade.nome : 'Empate')
        },
        {
            nome: '👥 População (Censo)',
            v1: d1.ibge?.demografia?.populacao_censo_2022 ? Number(d1.ibge.demografia.populacao_censo_2022).toLocaleString('pt-BR') + ' hab.' : 'Em catalogação',
            v2: d2.ibge?.demografia?.populacao_censo_2022 ? Number(d2.ibge.demografia.populacao_censo_2022).toLocaleString('pt-BR') + ' hab.' : 'Em catalogação',
            vencedor: '-'
        },
        {
            nome: '🗺️ Região Geográfica',
            v1: d1.ibge?.geografia?.mesorregiao || 'PR',
            v2: d2.ibge?.geografia?.mesorregiao || 'PR',
            vencedor: '-'
        }
    ];

    tbody.innerHTML = '';
    linhas.forEach(l => {
        const tr = document.createElement('tr');
        const badgeVencedor = l.vencedor !== '-' 
            ? `<span style="background: #dcfce7; color: #166534; padding: 4px 10px; border-radius: 12px; font-weight: bold; font-size: 0.8rem;">🏆 ${l.vencedor}</span>`
            : '<span style="color:#94a3b8;">Informativo</span>';

        tr.innerHTML = `
            <td><strong>${l.nome}</strong></td>
            <td style="font-weight: 600;">${l.v1}</td>
            <td style="font-weight: 600;">${l.v2}</td>
            <td>${badgeVencedor}</td>
        `;
        tbody.appendChild(tr);
    });
}

function renderizarGraficoRadar(d1, d2) {
    const canvas = document.getElementById('graficoRadarComparador');
    if (!canvas) return;

    if (instanciaRadarComparador) {
        instanciaRadarComparador.destroy();
    }

    const ctx = canvas.getContext('2d');

    const ind1 = d1.cidade.indicadores || {};
    const ind2 = d2.cidade.indicadores || {};

    const edu1 = (Number(ind1.educacao?.['2023']) || 0) * 100;
    const edu2 = (Number(ind2.educacao?.['2023']) || 0) * 100;

    const sau1 = (Number(ind1.saude?.['2023']) || 0) * 100;
    const sau2 = (Number(ind2.saude?.['2023']) || 0) * 100;

    const eco1 = (Number(ind1.economia?.['2023']) || 0) * 100;
    const eco2 = (Number(ind2.economia?.['2023']) || 0) * 100;

    instanciaRadarComparador = new Chart(ctx, {
        type: 'radar',
        data: {
            labels: ['Educação', 'Saúde', 'Economia/Renda', 'Living Score Geral'],
            datasets: [
                {
                    label: d1.cidade.nome,
                    data: [edu1.toFixed(1), sau1.toFixed(1), eco1.toFixed(1), d1.score_final],
                    backgroundColor: 'rgba(37, 99, 235, 0.2)',
                    borderColor: '#2563eb',
                    pointBackgroundColor: '#2563eb'
                },
                {
                    label: d2.cidade.nome,
                    data: [edu2.toFixed(1), sau2.toFixed(1), eco2.toFixed(1), d2.score_final],
                    backgroundColor: 'rgba(16, 185, 129, 0.2)',
                    borderColor: '#10b981',
                    pointBackgroundColor: '#10b981'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                r: {
                    beginAtZero: true,
                    max: 100
                }
            }
        }
    });
}

async function pedirVereditoIA() {
    const token = localStorage.getItem('token');
    const textoVeredito = document.getElementById('textoVereditoIA');
    if (!dadosComparador.c1 || !dadosComparador.c2) return;

    if (!token) {
        if (confirm("Você precisa estar logado para consultar a Inteligência Artificial. Deseja fazer login?")) {
            window.location.href = 'login.html';
        }
        return;
    }

    textoVeredito.innerHTML = '<i class="fas fa-spinner fa-spin"></i> O Consultor IA está comparando as cidades e gerando o veredito...';

    try {
        const c1 = dadosComparador.c1.cidade;
        const c2 = dadosComparador.c2.cidade;

        const pergunta = `Faça um parecer executivo comparando as cidades de ${c1.nome} (Living Score: ${dadosComparador.c1.score_final}) e ${c2.nome} (Living Score: ${dadosComparador.c2.score_final}) em qualidade de vida, educação, saúde e economia. Aponte os pontos fortes de cada uma em no máximo 4 tópicos curtos e objetivos.`;

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
            textoVeredito.innerText = data.resposta;
        } else {
            textoVeredito.innerText = `❌ ${data.erro || 'Falha ao gerar análise de IA.'}`;
        }
    } catch (err) {
        textoVeredito.innerText = "❌ Erro ao consultar a IA.";
    }
}

// ==========================================
// 10. INICIALIZADOR DE EVENTOS (DOM LOADED)
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
    atualizarMenuNavegacao();

    const formCad = document.getElementById('cadastroForm');
    if (formCad) formCad.onsubmit = realizarCadastro;

    const formLog = document.getElementById('loginForm');
    if (formLog) formLog.onsubmit = fazerLogin;

    const formPerfil = document.getElementById('perfilForm');
    if (formPerfil) {
        formPerfil.onsubmit = salvarPerfil;
        carregarPerfil();
    }

    if (document.getElementById('premiumCarousel')) {
        carregarCarrosselPremium();
    }

    if (document.getElementById('rankingTableBody')) {
        carregarRankingCompleto();
        configurarFiltrosRanking();
    }

    const formChat = document.getElementById('chatForm');
    if (formChat) {
        formChat.onsubmit = enviarMensagemChat;
        carregarHistoricoChat();
    }

    const formAdmin = document.getElementById('adminCidadeForm');
    if (formAdmin) {
        formAdmin.onsubmit = salvarCidadeAdmin;
    }

    const heroForm = document.getElementById('heroAiForm');
    if (heroForm) {
        heroForm.onsubmit = enviarPerguntaHero;
    }
});