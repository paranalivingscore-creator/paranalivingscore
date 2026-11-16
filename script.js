// ==========================================
// 1. CONFIGURAÇÃO DINÂMICA DA API
// ==========================================
const API_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://localhost:3000/api'
    : 'https://parana-living-backend.onrender.com/api';

const FOTO_PADRAO_PARANA = "https://images.unsplash.com/photo-1596422846543-75c6fc197f07?auto=format&fit=crop&w=1200&q=80";

function escaparHtml(texto) {
    if (!texto) return '';
    return texto
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function formatarMarkdownVisual(texto) {
    if (!texto) return '';
    return texto
        .replace(/^### (.*$)/gim, '<h4 style="margin: 12px 0 6px; font-weight: 800;">$1</h4>')
        .replace(/^## (.*$)/gim, '<h3 style="margin: 14px 0 8px; font-weight: 800;">$1</h3>')
        .replace(/^# (.*$)/gim, '<h2 style="margin: 16px 0 10px; font-weight: 800;">$1</h2>')
        .replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/gim, '<em>$1</em>')
        .replace(/^\s*[-*]\s+(.*$)/gim, '<div style="margin: 4px 0; padding-left: 8px;">• $1</div>')
        .replace(/---/gim, '<hr style="border:0; border-top: 1px solid #e2e8f0; margin: 12px 0;">')
        .replace(/\n\n/gim, '<div style="height: 8px;"></div>')
        .replace(/\n/gim, '<br>');
}

function obterValorNum(campo) {
    if (campo === undefined || campo === null) return 0;
    if (typeof campo === 'number') return isNaN(campo) ? 0 : campo;
    if (typeof campo === 'string') {
        const n = Number(campo.replace(',', '.'));
        return isNaN(n) ? 0 : n;
    }
    if (typeof campo === 'object') {
        if (campo['2023'] !== undefined) return obterValorNum(campo['2023']);
        if (campo['2022'] !== undefined) return obterValorNum(campo['2022']);
        if (campo.valor !== undefined) return obterValorNum(campo.valor);

        const chaves = Object.keys(campo).sort().reverse();
        for (const k of chaves) {
            const num = obterValorNum(campo[k]);
            if (num > 0) return num;
        }
    }
    return 0;
}

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
    const navList = document.querySelector('nav.desktop-nav ul');
    if (navList) {
        const paginaAtual = window.location.pathname.split('/').pop() || 'index.html';
        const links = [
            { href: 'index.html', label: 'Início' },
            { href: 'ranking.html', label: 'Ranking' },
            { href: 'cidades.html', label: 'Municípios' },
            { href: 'comparar.html', label: 'Comparar' },
            { href: 'chat.html', label: 'Chat IA' }
        ];

        navList.innerHTML = links
            .map(l => `<li><a href="${l.href}" class="${paginaAtual === l.href ? 'active' : ''}">${l.label}</a></li>`)
            .join('');
    }

    renderizarMenuDrawerAuth();
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

function atualizarCardPodio(posicao, item) {
    const elNome = document.getElementById(`pos${posicao}-nome`);
    const elScore = document.getElementById(`pos${posicao}-score`);
    if (elNome) elNome.innerText = item ? item.nome : '---';
    if (elScore) elScore.innerText = (item && item.score_final !== null) ? item.score_final : '00.0';
}

function aplicarFiltrosRanking() {
    const btnAtivo = document.querySelector('.filter-btn.active');
    const pilar = btnAtivo ? btnAtivo.innerText.trim() : 'Geral';
    const regiao = document.getElementById('selectMesorregiao')?.value || 'Todas';
    const incluirIncompletas = document.getElementById('chkIncluirIncompletas')?.checked || false;

    let lista = [...dadosRankingGlobal];

    if (regiao !== 'Todas') {
        lista = lista.filter(c => c.mesorregiao && c.mesorregiao.toLowerCase().includes(regiao.toLowerCase()));
    }

    // Separa cidades com os 4 pilares completos das incompletas
    const completas = lista.filter(c => c.dados_completos === true);
    const incompletas = lista.filter(c => c.dados_completos !== true);

    const ordenarPorPilar = (arr) => {
        if (pilar === 'Educação') {
            arr.sort((a, b) => obterValorNum(b.indicadores?.educacao) - obterValorNum(a.indicadores?.educacao));
        } else if (pilar === 'Saúde') {
            arr.sort((a, b) => obterValorNum(b.indicadores?.saude) - obterValorNum(a.indicadores?.saude));
        } else if (pilar === 'Economia' || pilar === 'Emprego') {
            arr.sort((a, b) => obterValorNum(b.indicadores?.economia) - obterValorNum(a.indicadores?.economia));
        } else {
            arr.sort((a, b) => (b.score_final || 0) - (a.score_final || 0));
        }
    };

    ordenarPorPilar(completas);
    incompletas.sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt-BR'));

    // Numeração oficial (#1, #2, #3...) só vale para cidades com os 4 pilares completos
    const completasNumeradas = completas.map((c, idx) => ({ ...c, posicaoOficial: idx + 1 }));
    const incompletasSemPosicao = incompletas.map(c => ({ ...c, posicaoOficial: null }));

    listaRankingFiltrada = incluirIncompletas
        ? [...completasNumeradas, ...incompletasSemPosicao]
        : completasNumeradas;

    // Pódio sempre mostra apenas cidades com dados completos
    atualizarCardPodio(1, completasNumeradas[0]);
    atualizarCardPodio(2, completasNumeradas[1]);
    atualizarCardPodio(3, completasNumeradas[2]);

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
        tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 25px; color: var(--text-muted);">Nenhum município com os 4 pilares completos encontrado para este filtro.</td></tr>`;
        return;
    }

    const formatarCelulaPilar = (val) => {
        if (!val || val <= 0) return '<span style="color:#94a3b8; font-size:0.85rem;">Não informado</span>';
        return val <= 1 ? (val * 10).toFixed(2) : val.toFixed(1);
    };

    cidadesParaExibir.forEach(c => {
        const ind = c.indicadores || {};
        const eduVal = obterValorNum(ind.educacao) || obterValorNum(ind.ideb);
        const sauVal = obterValorNum(ind.saude) || obterValorNum(ind.saude_leitos);
        const ecoVal = obterValorNum(ind.economia);
        const nomeEncoded = encodeURIComponent(c.nome);

        const posHtml = c.posicaoOficial
            ? `<strong>#${c.posicaoOficial}</strong>`
            : `<span style="color:#94a3b8;">—</span>`;

        const scoreHtml = c.dados_completos && c.score_final !== null
            ? `<span class="td-score">${c.score_final}</span>`
            : `<span style="color:#94a3b8; font-size:0.82rem; font-weight:600;">Dados não informados</span>`;

        const tr = document.createElement('tr');
        if (!c.dados_completos) {
            tr.style.opacity = '0.78';
        }
        tr.innerHTML = `
            <td>${posHtml}</td>
            <td><strong>${escaparHtml(c.nome)}</strong> <span style="font-size:0.75rem; color:#94a3b8;">(${escaparHtml(c.mesorregiao || 'PR')})</span></td>
            <td>${formatarCelulaPilar(eduVal)}</td>
            <td>${formatarCelulaPilar(sauVal)}</td>
            <td>${formatarCelulaPilar(ecoVal)}</td>
            <td>${scoreHtml}</td>
            <td><button class="btn-view" onclick="verDetalhesCidade(decodeURIComponent('${nomeEncoded}'))">Ver Análise</button></td>
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
// 5. CHAT IA COM HISTÓRICO & SIDEBAR
// ==========================================

let chatConversaIdAtual = null;

function abrirSidebarChat() {
    document.getElementById('chatSidebarDrawer')?.classList.add('open');
    document.getElementById('chatSidebarBackdrop')?.classList.add('active');
    carregarListaHistoricoDrawer();
}

function fecharSidebarChat() {
    document.getElementById('chatSidebarDrawer')?.classList.remove('open');
    document.getElementById('chatSidebarBackdrop')?.classList.remove('active');
}

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
                        <div class="chat-history-title">${escaparHtml(conv.titulo || 'Conversa sem título')}</div>
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
                const conteudo = msg.remetente === 'usuario'
                    ? escaparHtml(msg.conteudo)
                    : formatarMarkdownVisual(msg.conteudo);
                chatWindow.innerHTML += `<div class="msg-bubble ${tipo}">${avatar}${conteudo}</div>`;
            });
            chatWindow.scrollTop = chatWindow.scrollHeight;
        }
    } catch (err) {
        alert("Erro ao carregar a conversa selecionada.");
    }
}

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

async function excluirConversaEspecifica(id, event) {
    if (event) event.stopPropagation();
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

    if (!msg) return;

    if (!token) {
        if (confirm("Você precisa estar logado para conversar com a Capiá. Deseja fazer login agora?")) {
            window.location.href = 'login.html';
        }
        return;
    }

    chatWindow.innerHTML += `<div class="msg-bubble msg-usuario">${escaparHtml(msg)}</div>`;
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
            corpoTexto.innerHTML = formatarMarkdownVisual(data.resposta);
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
        const nomeEncoded = encodeURIComponent(c.nome || '');
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${c.ibge_id || '-'}</td>
            <td><strong>${escaparHtml(c.nome)}</strong></td>
            <td>${formatarNotaAdmin(ind.educacao)}</td>
            <td>${formatarNotaAdmin(ind.saude)}</td>
            <td>${formatarNotaAdmin(ind.economia)}</td>
            <td>${formatarNotaAdmin(ind.seguranca)}</td>
            <td class="td-score">${c.score_calculado || '0.0'}</td>
            <td>
                <button class="btn-action-edit" onclick="prepararEdicaoCidade('${c._id}')" title="Editar"><i class="fas fa-edit"></i></button>
                <button class="btn-action-delete" onclick="excluirCidade('${c._id}', decodeURIComponent('${nomeEncoded}'))" title="Excluir"><i class="fas fa-trash-alt"></i></button>
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

let listaCidadesCompleta = [];
let cidadeAtualDetalhes = null;
let cidadeComparadaDados = null;
let fotosGaleriaAtual = [];
let indiceLightboxAtual = 0;
let cidadesInicializado = false;

const graficosCidades = {
    radar: null,
    barras: null,
    distribuicao: null,
    evolucao: null
};

function textoOuNaoInformado(valor) {
    if (valor === undefined || valor === null) return 'Não informado';
    const str = String(valor).trim();
    if (!str || ['null', 'undefined', 'nan', 'n/d', '-'].includes(str.toLowerCase())) {
        return 'Não informado';
    }
    return str;
}

async function inicializarPaginaCidades() {
    if (cidadesInicializado) return;
    cidadesInicializado = true;

    const datalist = document.getElementById('listaSugestoesCidades');
    if (!datalist) return;

    try {
        const res = await fetch(`${API_URL}/cidades`);
        const cidades = await res.json();
        listaCidadesCompleta = Array.isArray(cidades) ? cidades : [];

        atualizarDatalistCidades(listaCidadesCompleta);
        aplicarFiltrosExploracao();

        const params = new URLSearchParams(window.location.search);
        const nomeParam = params.get('nome') || params.get('busca');

        if (nomeParam) {
            document.getElementById('inputBuscaMunicipio').value = nomeParam;
            pesquisarMunicipioDetalhes(nomeParam);
        } else if (listaCidadesCompleta.length > 0) {
            const padrao = listaCidadesCompleta.find(c => c.nome.toLowerCase().includes('assis chateaubriand'))
                || listaCidadesCompleta[0];
            document.getElementById('inputBuscaMunicipio').value = padrao.nome;
            pesquisarMunicipioDetalhes(padrao.nome, padrao.ibge_id);
        }

        document.getElementById('inputBuscaMunicipio')?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') pesquisarMunicipioDetalhes();
        });

        document.getElementById('inputCompararCom')?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') aplicarComparacaoRapida();
        });

    } catch (err) {
        console.error("Erro ao inicializar página de municípios:", err);
    }
}

function atualizarDatalistCidades(lista) {
    const datalist = document.getElementById('listaSugestoesCidades');
    if (!datalist) return;
    datalist.innerHTML = '';
    lista.forEach(c => {
        const option = document.createElement('option');
        option.value = c.nome;
        datalist.appendChild(option);
    });
}

function obterNotaPilarBruta(cidade, pilar) {
    const ind = cidade?.indicadores || {};
    if (pilar === 'score') return parseFloat(cidade.score_final) || 0;
    const val = obterValorNum(ind[pilar]);
    return val <= 1 && val > 0 ? val * 100 : val;
}

function aplicarFiltrosExploracao() {
    const regiao = document.getElementById('filtroRegiaoCidades')?.value || 'Todas';
    const ordenacao = document.getElementById('filtroOrdenacaoCidades')?.value || 'score';
    const pillsContainer = document.getElementById('exploracaoTopPills');

    let filtradas = [...listaCidadesCompleta];
    if (regiao !== 'Todas') {
        filtradas = filtradas.filter(c =>
            c.mesorregiao && c.mesorregiao.toLowerCase().includes(regiao.toLowerCase())
        );
    }

    atualizarDatalistCidades(filtradas);

    // Quando ordenar pelo Living Score geral, considera apenas cidades com os 4 pilares completos
    let candidatas = ordenacao === 'score'
        ? filtradas.filter(c => c.dados_completos === true)
        : filtradas.filter(c => obterNotaPilarBruta(c, ordenacao) > 0);

    candidatas.sort((a, b) => obterNotaPilarBruta(b, ordenacao) - obterNotaPilarBruta(a, ordenacao));

    if (!pillsContainer) return;

    const top5 = candidatas.slice(0, 5);
    const labelPilar = {
        score: 'Destaques',
        seguranca: 'Top Segurança',
        educacao: 'Top Educação',
        saude: 'Top Saúde',
        economia: 'Top Economia'
    }[ordenacao] || 'Destaques';

    if (top5.length === 0) {
        pillsContainer.innerHTML = `<span class="exp-pill-label">Nenhum município completo encontrado para este filtro.</span>`;
        return;
    }

    pillsContainer.innerHTML = `<span class="exp-pill-label">${labelPilar}:</span>`;
    top5.forEach((c, idx) => {
        const nota = obterNotaPilarBruta(c, ordenacao).toFixed(1);
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'exp-pill-btn';
        btn.innerHTML = `<span>${idx + 1}º ${escaparHtml(c.nome)}</span> <span class="exp-pill-score">${nota}</span>`;
        btn.onclick = () => {
            document.getElementById('inputBuscaMunicipio').value = c.nome;
            pesquisarMunicipioDetalhes(c.nome, c.ibge_id);
        };
        pillsContainer.appendChild(btn);
    });
}

function calcularNotaLocalFallback(campo) {
    const val = obterValorNum(campo);
    if (!val || val <= 0) return null;
    return val <= 1 ? Number((val * 100).toFixed(1)) : Number(Math.min(100, val).toFixed(1));
}

function extrairPilaresComFallback(data) {
    const ind = data?.cidade?.indicadores || {};
    const pc = data?.analise_estadual?.pilares_cidade || {};

    const seg = pc.seguranca ?? calcularNotaLocalFallback(ind.seguranca ?? ind.seguranca_indice);
    const edu = pc.educacao ?? calcularNotaLocalFallback(ind.educacao) ?? (obterValorNum(ind.ideb) > 0 ? Number((obterValorNum(ind.ideb) * 10).toFixed(1)) : null);
    const sau = pc.saude ?? calcularNotaLocalFallback(ind.saude) ?? (obterValorNum(ind.saude_leitos) > 0 ? Number((obterValorNum(ind.saude_leitos) * 10).toFixed(1)) : null);
    const pibVal = obterValorNum(ind.pib_per_capita);
    const eco = pc.economia ?? calcularNotaLocalFallback(ind.economia) ?? (pibVal > 0 ? Number(Math.min(100, pibVal / 500).toFixed(1)) : null);

    return { seguranca: seg, educacao: edu, saude: sau, economia: eco };
}

async function pesquisarMunicipioDetalhes(nomeFixo = null, ibgeIdPreferencial = null) {
    const termoDigitado = (nomeFixo || document.getElementById('inputBuscaMunicipio')?.value || '').trim();
    if (!termoDigitado && !ibgeIdPreferencial) return;

    let identificadorConsulta = ibgeIdPreferencial;
    if (!identificadorConsulta && termoDigitado) {
        if (!isNaN(Number(termoDigitado))) {
            identificadorConsulta = Number(termoDigitado);
        } else {
            const termoLower = termoDigitado.toLowerCase();
            const matchExato = listaCidadesCompleta.find(c => c.nome && c.nome.toLowerCase() === termoLower);
            if (matchExato?.ibge_id) {
                identificadorConsulta = matchExato.ibge_id;
            }
        }
    }
    const termoConsulta = identificadorConsulta || termoDigitado;

    const loader = document.getElementById('cidade-loader');
    const erroBox = document.getElementById('cidade-erro');
    const painel = document.getElementById('painelDetalhesCidade');

    if (loader) loader.style.display = 'block';
    if (erroBox) erroBox.style.display = 'none';
    if (painel) painel.style.display = 'none';

    cidadeComparadaDados = null;
    const inputComp = document.getElementById('inputCompararCom');
    if (inputComp) inputComp.value = '';

    try {
        const res = await fetch(`${API_URL}/cidades/detalhes/${encodeURIComponent(termoConsulta)}`);
        if (!res.ok) {
            if (erroBox) {
                erroBox.innerText = `❌ Município "${termoDigitado || termoConsulta}" não encontrado na base de dados oficial.`;
                erroBox.style.display = 'block';
            }
            return;
        }

        const data = await res.json();
        console.log("📦 Detalhes recebidos da API:", data);
        cidadeAtualDetalhes = data;

        const inputBusca = document.getElementById('inputBuscaMunicipio');
        if (inputBusca && data.cidade?.nome) {
            inputBusca.value = data.cidade.nome;
        }

        await preencherHeroEFatos(data);
        preencherPilaresEContexto(data);
        preencherCartografia(data.cidade);

        if (painel) painel.style.display = 'block';

        renderizarTodosOsGraficos(data, null);

        const fotoPrincipal = document.getElementById('detalhe-foto-banner')?.src || '';
        carregarGaleriaMunicipio(data.cidade.nome, fotoPrincipal);

    } catch (err) {
        console.error("Erro ao carregar detalhes do município:", err);
        if (erroBox) {
            erroBox.innerText = "❌ Erro de conexão ao consultar os dados do município.";
            erroBox.style.display = 'block';
        }
    } finally {
        if (loader) loader.style.display = 'none';
    }
}

async function preencherHeroEFatos(data) {
    const c = data.cidade || {};
    const ibge = data.ibge || {};
    const demo = data.dados_complementares || ibge.demografia || {};
    const stats = data.analise_estadual || {};
    const wiki = data.contexto_wiki || {};

    const bannerImg = document.getElementById('detalhe-foto-banner');
    let fotoUrl = wiki.imagem_principal || await obterUrlFotoCidade(c.nome);
    if (!fotoUrl) fotoUrl = FOTO_PADRAO_PARANA;
    if (bannerImg) {
        bannerImg.src = fotoUrl;
        bannerImg.onerror = () => { bannerImg.src = FOTO_PADRAO_PARANA; };
    }

    document.getElementById('detalhe-nome').innerText = textoOuNaoInformado(c.nome);
    document.getElementById('detalhe-ibge').innerText = c.ibge_id || 'Não informado';
    document.getElementById('detalhe-meso').innerText = textoOuNaoInformado(ibge.geografia?.mesorregiao);
    document.getElementById('detalhe-micro').innerText = textoOuNaoInformado(ibge.geografia?.microrregiao);

    const completo = data.dados_completos ?? stats.dados_completos ?? (data.score_final !== null && data.score_final !== undefined);
    const temScore = completo && data.score_final !== null && data.score_final !== undefined && !isNaN(parseFloat(data.score_final));

    document.getElementById('detalhe-score').innerText = temScore ? data.score_final : 'S/D';

    const badgeRank = document.getElementById('detalhe-ranking-badge');
    if (badgeRank) {
        if (!temScore || !stats.posicao_geral) {
            badgeRank.innerHTML = `<i class="fas fa-info-circle"></i> Sem ranking (faltam pilares)`;
        } else {
            badgeRank.innerHTML = `<i class="fas fa-trophy"></i> ${stats.posicao_geral}º de ${stats.total_municipios} no PR`;
        }
    }

    const diffEl = document.getElementById('detalhe-diff-media');
    if (diffEl) {
        if (temScore && typeof stats.medias_estaduais?.score === 'number') {
            const diff = (parseFloat(data.score_final) - stats.medias_estaduais.score).toFixed(1);
            const sinal = Number(diff) >= 0 ? '+' : '';
            diffEl.innerText = `${sinal}${diff} vs média PR (${stats.medias_estaduais.score})`;
            diffEl.className = `score-spotlight-diff ${Number(diff) >= 0 ? 'positivo' : 'negativo'}`;
        } else if (!temScore) {
            diffEl.innerText = 'Dados incompletos';
            diffEl.className = 'score-spotlight-diff';
        } else {
            diffEl.innerText = 'Índice oficial PLS';
            diffEl.className = 'score-spotlight-diff';
        }
    }

    const climaEl = document.getElementById('detalhe-clima-valor');
    if (climaEl) {
        climaEl.innerText = data.clima
            ? `${data.clima.temp}°C, ${data.clima.descricao} (Umidade: ${data.clima.umidade}%)`
            : 'Não informado';
    }

    const popNum = Number(demo.populacao ?? demo.populacao_censo_2022);
    document.getElementById('detalhe-populacao').innerText = (!isNaN(popNum) && popNum > 0)
        ? `${popNum.toLocaleString('pt-BR')} hab.`
        : 'Não informado';

    const areaNum = Number(demo.area_km2);
    document.getElementById('detalhe-area').innerText = (!isNaN(areaNum) && areaNum > 0)
        ? `${areaNum.toLocaleString('pt-BR', { maximumFractionDigits: 3 })} km²`
        : 'Não informado';

    const densNum = Number(demo.densidade_hab_km2);
    document.getElementById('detalhe-densidade').innerText = (!isNaN(densNum) && densNum > 0)
        ? `${densNum.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} hab./km²`
        : 'Não informado';

    document.getElementById('detalhe-fundacao').innerText = textoOuNaoInformado(demo.fundacao);
    document.getElementById('detalhe-gentilico').innerText = textoOuNaoInformado(demo.gentilico);

    const pibNum = Number(demo.pib_per_capita);
    document.getElementById('detalhe-pib-per-capita').innerText = (!isNaN(pibNum) && pibNum > 0)
        ? pibNum.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
        : 'Não informado';

    document.getElementById('detalhe-descricao-texto').innerText = textoOuNaoInformado(
        wiki.resumo || c.descricao || c.sobre || c.info_curadoria
    );
}

function preencherPilarCard(prefixo, nota100, rankInfo) {
    const notaEl = document.getElementById(`pilar-${prefixo}-nota`);
    const barraEl = document.getElementById(`pilar-${prefixo}-barra`);
    const rankEl = document.getElementById(`pilar-${prefixo}-rank`);

    const temNota = typeof nota100 === 'number' && !isNaN(nota100);

    if (notaEl) notaEl.innerText = temNota ? `${nota100.toFixed(1)} pts` : 'Não informado';
    if (barraEl) barraEl.style.width = temNota ? `${Math.min(100, Math.max(0, nota100))}%` : '0%';
    if (rankEl) rankEl.innerText = rankInfo ? `#${rankInfo.posicao} / ${rankInfo.total}` : 'Ranking PR';
}

function formatarSaneamentoBanco(data) {
    const sanObj = data?.dados_complementares?.saneamento_detalhado
        || data?.cidade?.saneamento;

    if (sanObj && typeof sanObj === 'object' && sanObj.esgoto) {
        const esg = sanObj.esgoto;
        const partes = [];
        if (Number(esg.unidades_atendidas_total) > 0) {
            partes.push(`${Number(esg.unidades_atendidas_total).toLocaleString('pt-BR')} unid. atendidas`);
        }
        if (Number(esg.unidades_atendidas_residencial) > 0) {
            partes.push(`${Number(esg.unidades_atendidas_residencial).toLocaleString('pt-BR')} residenciais`);
        }
        if (Number(esg.ligacoes_total) > 0) {
            partes.push(`${Number(esg.ligacoes_total).toLocaleString('pt-BR')} ligações de esgoto`);
        }
        if (partes.length > 0) {
            return esg.ano ? `${partes.join(' • ')} (${esg.ano})` : partes.join(' • ');
        }
    }

    const ind = data?.cidade?.indicadores || {};
    return extrairUltimoAnoTexto(ind.saneamento ?? ind.saneamento_basico);
}

function preencherPilaresEContexto(data) {
    const ind = data.cidade?.indicadores || {};
    const stats = data.analise_estadual || {};
    const rp = stats.ranking_pilares || {};
    const pilares = extrairPilaresComFallback(data);

    preencherPilarCard('seg', pilares.seguranca, rp.seguranca);
    preencherPilarCard('edu', pilares.educacao, rp.educacao);
    preencherPilarCard('sau', pilares.saude, rp.saude);
    preencherPilarCard('eco', pilares.economia, rp.economia);

    const geo = data.ibge?.geografia || {};
    document.getElementById('card-ibge-imediata').innerText = textoOuNaoInformado(geo.regiao_imediata);
    document.getElementById('card-ibge-intermediaria').innerText = textoOuNaoInformado(geo.regiao_intermediaria);
    document.getElementById('card-ibge-regiao-completa').innerText =
        (geo.mesorregiao && geo.mesorregiao !== 'Não informado') || (geo.microrregiao && geo.microrregiao !== 'Não informado')
            ? `${textoOuNaoInformado(geo.mesorregiao)} / ${textoOuNaoInformado(geo.microrregiao)}`
            : 'Não informado';

    document.getElementById('ind-saneamento').innerText = formatarSaneamentoBanco(data);
    document.getElementById('ind-agropecuaria').innerText = extrairUltimoAnoTexto(ind.agropecuaria);

    const lider = stats.lider_estadual;
    document.getElementById('detalhe-lider-estado').innerText = (lider && typeof lider.score === 'number')
        ? `${lider.nome} (${lider.score.toFixed(1)} pts)`
        : 'Não informado';
}

function extrairUltimoAnoTexto(campo) {
    if (campo === undefined || campo === null) return 'Não informado';
    if (typeof campo === 'number' && campo > 0) return campo.toFixed(4);
    if (typeof campo === 'object') {
        if (campo['2023'] > 0) return `${Number(campo['2023']).toFixed(4)} (2023)`;
        if (campo['2022'] > 0) return `${Number(campo['2022']).toFixed(4)} (2022)`;
    }
    return 'Não informado';
}

async function carregarGaleriaMunicipio(nomeCidade, fotoPrincipalUrl) {
    const loader = document.getElementById('galeriaLoader');
    const vazia = document.getElementById('galeriaVazia');
    const grid = document.getElementById('galeriaGrid');
    const spanNome = document.getElementById('galeria-nome-cidade');

    if (spanNome) spanNome.innerText = nomeCidade;
    if (grid) grid.innerHTML = '';
    if (vazia) vazia.style.display = 'none';
    if (loader) loader.style.display = 'block';

    fotosGaleriaAtual = [];

    try {
        const res = await fetch(
            `${API_URL}/cidades/galeria/${encodeURIComponent(nomeCidade)}?principal=${encodeURIComponent(fotoPrincipalUrl)}`
        );

        if (!res.ok) {
            if (vazia) vazia.style.display = 'block';
            return;
        }

        const data = await res.json();
        const fotos = Array.isArray(data.fotos) ? data.fotos : [];

        fotosGaleriaAtual = fotos;

        if (fotos.length === 0) {
            if (vazia) vazia.style.display = 'block';
            return;
        }

        fotos.forEach((foto, index) => {
            const card = document.createElement('div');
            card.className = 'galeria-card';
            card.onclick = () => abrirLightbox(index);

            card.innerHTML = `
                <img src="${foto.url}" alt="${escaparHtml(foto.titulo)}" loading="lazy">
                <div class="galeria-zoom-badge"><i class="fas fa-expand-alt"></i></div>
                <div class="galeria-overlay">
                    <div class="galeria-overlay-title">${escaparHtml(foto.titulo)}</div>
                    <div class="galeria-overlay-credit">📷 ${escaparHtml(foto.credito)} • ${escaparHtml(foto.licenca)}</div>
                </div>
            `;

            const imgEl = card.querySelector('img');
            imgEl.onerror = () => {
                card.remove();
                if (grid.children.length === 0 && vazia) {
                    vazia.style.display = 'block';
                }
            };

            grid.appendChild(card);
        });
    } catch (err) {
        if (vazia) vazia.style.display = 'block';
    } finally {
        if (loader) loader.style.display = 'none';
    }
}

function abrirLightbox(index) {
    if (!fotosGaleriaAtual[index]) return;
    indiceLightboxAtual = index;
    atualizarConteudoLightbox();
    document.getElementById('modalLightbox')?.classList.add('open');
}

function atualizarConteudoLightbox() {
    const foto = fotosGaleriaAtual[indiceLightboxAtual];
    if (!foto) return;

    document.getElementById('lightboxImg').src = foto.fullUrl || foto.url;
    document.getElementById('lightboxTitulo').innerText = foto.titulo;
    document.getElementById('lightboxLegenda').innerText = foto.legenda;
    document.getElementById('lightboxCredito').innerText = `Crédito: ${foto.credito} (${foto.licenca})`;
    document.getElementById('lightboxContador').innerText = `${indiceLightboxAtual + 1} de ${fotosGaleriaAtual.length}`;
}

function fecharLightbox(event, forcar = false) {
    if (forcar || event?.target?.id === 'modalLightbox') {
        document.getElementById('modalLightbox')?.classList.remove('open');
    }
}

function navegarLightbox(delta, event) {
    if (event) event.stopPropagation();
    if (fotosGaleriaAtual.length === 0) return;
    indiceLightboxAtual = (indiceLightboxAtual + delta + fotosGaleriaAtual.length) % fotosGaleriaAtual.length;
    atualizarConteudoLightbox();
}

document.addEventListener('keydown', (e) => {
    const modal = document.getElementById('modalLightbox');
    if (!modal || !modal.classList.contains('open')) return;
    if (e.key === 'Escape') fecharLightbox(null, true);
    if (e.key === 'ArrowRight') navegarLightbox(1);
    if (e.key === 'ArrowLeft') navegarLightbox(-1);
});

async function aplicarComparacaoRapida() {
    const nomeComp = document.getElementById('inputCompararCom')?.value.trim();
    if (!nomeComp || !cidadeAtualDetalhes) return;

    const matchExato = listaCidadesCompleta.find(c => c.nome && c.nome.toLowerCase() === nomeComp.toLowerCase());
    const termoConsulta = matchExato?.ibge_id || nomeComp;

    try {
        const res = await fetch(`${API_URL}/cidades/detalhes/${encodeURIComponent(termoConsulta)}`);
        if (!res.ok) {
            alert(`Município "${nomeComp}" não encontrado para comparação.`);
            return;
        }
        cidadeComparadaDados = await res.json();
        renderizarTodosOsGraficos(cidadeAtualDetalhes, cidadeComparadaDados);
    } catch {
        alert("Erro ao buscar município para comparação.");
    }
}

function destruirGrafico(chave) {
    if (graficosCidades[chave]) {
        graficosCidades[chave].destroy();
        graficosCidades[chave] = null;
    }
}

function renderizarTodosOsGraficos(data, compData) {
    if (typeof Chart === 'undefined') {
        console.error("❌ Chart.js não foi carregado no HTML!");
        return;
    }

    const ehDark = document.body.classList.contains('dark-mode');
    const corTexto = ehDark ? '#cbd5e1' : '#334155';
    const corGrid = ehDark ? 'rgba(148, 163, 184, 0.16)' : 'rgba(15, 23, 42, 0.08)';

    renderizarRadar(data, compData, corTexto, corGrid);
    renderizarBarrasEstado(data, compData, corTexto, corGrid);
    renderizarDistribuicao(data, corTexto, corGrid);
    renderizarEvolucaoValida(data, corTexto, corGrid);
}

function renderizarRadar(data, compData, corTexto, corGrid) {
    destruirGrafico('radar');
    const canvas = document.getElementById('graficoRadarPilares');
    if (!canvas) return;

    const pc = extrairPilaresComFallback(data);
    const me = data.analise_estadual?.medias_estaduais || {};

    const datasets = [
        {
            label: data.cidade.nome,
            data: [pc.seguranca || 0, pc.educacao || 0, pc.saude || 0, pc.economia || 0],
            backgroundColor: 'rgba(37, 99, 235, 0.22)',
            borderColor: '#2563eb',
            pointBackgroundColor: '#2563eb',
            borderWidth: 2
        }
    ];

    if (me.seguranca || me.educacao || me.saude || me.economia) {
        datasets.push({
            label: 'Média do Paraná',
            data: [me.seguranca || 0, me.educacao || 0, me.saude || 0, me.economia || 0],
            backgroundColor: 'rgba(148, 163, 184, 0.15)',
            borderColor: '#94a3b8',
            borderDash: [5, 5],
            pointBackgroundColor: '#94a3b8',
            borderWidth: 2
        });
    }

    if (compData) {
        const pComp = extrairPilaresComFallback(compData);
        datasets.push({
            label: compData.cidade.nome,
            data: [pComp.seguranca || 0, pComp.educacao || 0, pComp.saude || 0, pComp.economia || 0],
            backgroundColor: 'rgba(16, 185, 129, 0.2)',
            borderColor: '#10b981',
            pointBackgroundColor: '#10b981',
            borderWidth: 2
        });
    }

    graficosCidades.radar = new Chart(canvas.getContext('2d'), {
        type: 'radar',
        data: {
            labels: ['Segurança', 'Educação', 'Saúde', 'Economia'],
            datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { labels: { color: corTexto } }
            },
            scales: {
                r: {
                    beginAtZero: true,
                    max: 100,
                    ticks: { color: corTexto, backdropColor: 'transparent' },
                    grid: { color: corGrid },
                    pointLabels: { color: corTexto, font: { weight: 'bold', size: 12 } }
                }
            }
        }
    });
}

function renderizarBarrasEstado(data, compData, corTexto, corGrid) {
    destruirGrafico('barras');
    const canvas = document.getElementById('graficoBarrasEstado');
    if (!canvas) return;

    const pc = extrairPilaresComFallback(data);
    const me = data.analise_estadual?.medias_estaduais || {};

    const datasets = [
        {
            label: `${data.cidade.nome}`,
            data: [pc.seguranca || 0, pc.educacao || 0, pc.saude || 0, pc.economia || 0],
            backgroundColor: 'rgba(37, 99, 235, 0.85)',
            borderRadius: 6
        }
    ];

    if (me.seguranca || me.educacao || me.saude || me.economia) {
        datasets.push({
            label: 'Média Estadual (PR)',
            data: [me.seguranca || 0, me.educacao || 0, me.saude || 0, me.economia || 0],
            backgroundColor: 'rgba(148, 163, 184, 0.6)',
            borderRadius: 6
        });
    }

    if (compData) {
        const pComp = extrairPilaresComFallback(compData);
        datasets.push({
            label: compData.cidade.nome,
            data: [pComp.seguranca || 0, pComp.educacao || 0, pComp.saude || 0, pComp.economia || 0],
            backgroundColor: 'rgba(16, 185, 129, 0.82)',
            borderRadius: 6
        });
    }

    graficosCidades.barras = new Chart(canvas.getContext('2d'), {
        type: 'bar',
        data: {
            labels: ['Segurança', 'Educação', 'Saúde', 'Economia'],
            datasets
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { labels: { color: corTexto } },
                tooltip: {
                    callbacks: {
                        label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.x} pts`
                    }
                }
            },
            scales: {
                x: {
                    beginAtZero: true,
                    max: 100,
                    grid: { color: corGrid },
                    ticks: { color: corTexto }
                },
                y: {
                    grid: { display: false },
                    ticks: { color: corTexto, font: { weight: 'bold' } }
                }
            }
        }
    });
}

function renderizarDistribuicao(data, corTexto, corGrid) {
    destruirGrafico('distribuicao');
    const canvas = document.getElementById('graficoDistribuicaoPR');
    if (!canvas) return;

    const dist = data.analise_estadual?.distribuicao;
    if (!dist) return;

    const cores = dist.labels.map((_, i) =>
        i === dist.faixa_atual_idx ? '#10b981' : 'rgba(37, 99, 235, 0.5)'
    );

    const subtitulo = document.getElementById('distribuicaoSubtitulo');
    if (subtitulo && dist.faixa_atual_idx >= 0) {
        subtitulo.innerText = `${data.cidade.nome} está na faixa ${dist.labels[dist.faixa_atual_idx]} pts (em verde)`;
    }

    graficosCidades.distribuicao = new Chart(canvas.getContext('2d'), {
        type: 'bar',
        data: {
            labels: dist.labels.map(l => `${l} pts`),
            datasets: [{
                label: 'Quantidade de municípios',
                data: dist.valores,
                backgroundColor: cores,
                borderRadius: 8
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (ctx) => `${ctx.parsed.y} municípios nesta faixa`
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: corGrid },
                    ticks: { color: corTexto, precision: 0 }
                },
                x: {
                    grid: { display: false },
                    ticks: { color: corTexto }
                }
            }
        }
    });
}

function renderizarEvolucaoValida(data, corTexto, corGrid) {
    destruirGrafico('evolucao');
    const canvas = document.getElementById('graficoEvolucaoCidade');
    const wrap = document.getElementById('wrapGraficoEvolucao');
    const aviso = document.getElementById('avisoSemEvolucao');
    if (!canvas) return;

    const ind = data.cidade.indicadores || {};
    const candidatos = [
        { nome: 'Segurança', obj: ind.seguranca },
        { nome: 'Educação', obj: ind.educacao },
        { nome: 'Saúde', obj: ind.saude },
        { nome: 'Economia', obj: ind.economia }
    ];

    const validos = candidatos.filter(item =>
        item.obj &&
        typeof item.obj === 'object' &&
        Number(item.obj['2022']) > 0 &&
        Number(item.obj['2023']) > 0
    );

    if (validos.length === 0) {
        if (wrap) wrap.style.display = 'none';
        if (aviso) aviso.style.display = 'block';
        return;
    }

    if (wrap) wrap.style.display = 'block';
    if (aviso) aviso.style.display = 'none';

    const normalizar = (v) => (Number(v) <= 1 ? Number(v) * 100 : Number(v)).toFixed(1);

    graficosCidades.evolucao = new Chart(canvas.getContext('2d'), {
        type: 'bar',
        data: {
            labels: validos.map(v => v.nome),
            datasets: [
                {
                    label: '2022',
                    data: validos.map(v => normalizar(v.obj['2022'])),
                    backgroundColor: 'rgba(148, 163, 184, 0.72)',
                    borderRadius: 6
                },
                {
                    label: '2023',
                    data: validos.map(v => normalizar(v.obj['2023'])),
                    backgroundColor: 'rgba(37, 99, 235, 0.88)',
                    borderRadius: 6
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { labels: { color: corTexto } },
                tooltip: {
                    callbacks: {
                        label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y} pts`
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    max: 100,
                    grid: { color: corGrid },
                    ticks: { color: corTexto }
                },
                x: {
                    grid: { display: false },
                    ticks: { color: corTexto }
                }
            }
        }
    });
}

function preencherCartografia(cidade) {
    const mapaIframe = document.getElementById('mapaCidadeIframe');
    if (mapaIframe) {
        mapaIframe.src = `https://maps.google.com/maps?q=${encodeURIComponent(cidade.nome + ', PR, Brasil')}&t=&z=12&ie=UTF8&iwloc=&output=embed`;
    }

    const imgMalha = document.getElementById('imgMalhaIbge');
    const erroMsg = document.getElementById('malhaErroMsg');
    if (imgMalha && cidade.ibge_id) {
        imgMalha.style.display = 'block';
        if (erroMsg) erroMsg.style.display = 'none';
        imgMalha.src = `https://servicodados.ibge.gov.br/api/v3/malhas/municipios/${cidade.ibge_id}?formato=image/svg+xml`;
    }
}

function alternarAbaMapa(aba) {
    const painelMapa = document.getElementById('painelMapaInterativo');
    const painelMalha = document.getElementById('painelMalhaIbge');
    const btnMapa = document.getElementById('tabBtnMapa');
    const btnMalha = document.getElementById('tabBtnMalha');

    if (aba === 'malha') {
        if (painelMapa) painelMapa.style.display = 'none';
        if (painelMalha) painelMalha.style.display = 'block';
        btnMapa?.classList.remove('active');
        btnMalha?.classList.add('active');
    } else {
        if (painelMapa) painelMapa.style.display = 'block';
        if (painelMalha) painelMalha.style.display = 'none';
        btnMapa?.classList.add('active');
        btnMalha?.classList.remove('active');
    }
}

function perguntarSobreEstaCidade() {
    if (!cidadeAtualDetalhes?.cidade?.nome) return;
    const nome = cidadeAtualDetalhes.cidade.nome;
    window.location.href = `chat.html?pergunta=${encodeURIComponent(`Faça uma análise detalhada sobre a qualidade de vida e os indicadores de ${nome}`)}`;
}
// ==========================================
// 9. MÓDULO DO COMPARADOR (COMPARAR.HTML)
// ==========================================

let dadosComparador = { c1: null, c2: null };
let instanciaRadarComparador = null;
let comparadorInicializado = false;

async function inicializarComparador() {
    if (comparadorInicializado) return;
    comparadorInicializado = true;

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

        const [foto1, foto2] = await Promise.all([
            obterUrlFotoCidade(data1.cidade.nome),
            obterUrlFotoCidade(data2.cidade.nome)
        ]);

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

        montarTabelaComparativa(data1, data2);
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

    const pop1 = d1.dados_complementares?.populacao ?? d1.ibge?.demografia?.populacao_censo_2022;
    const pop2 = d2.dados_complementares?.populacao ?? d2.ibge?.demografia?.populacao_censo_2022;

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
            nome: '👥 População',
            v1: (pop1 && Number(pop1) > 0) ? Number(pop1).toLocaleString('pt-BR') + ' hab.' : 'Não informado',
            v2: (pop2 && Number(pop2) > 0) ? Number(pop2).toLocaleString('pt-BR') + ' hab.' : 'Não informado',
            vencedor: '-'
        },
        {
            nome: '🗺️ Região Geográfica',
            v1: d1.ibge?.geografia?.mesorregiao || 'Não informado',
            v2: d2.ibge?.geografia?.mesorregiao || 'Não informado',
            vencedor: '-'
        }
    ];

    tbody.innerHTML = '';
    linhas.forEach(l => {
        const tr = document.createElement('tr');
        const badgeVencedor = l.vencedor !== '-'
            ? `<span style="background: #dcfce7; color: #166534; padding: 4px 10px; border-radius: 12px; font-weight: bold; font-size: 0.8rem;">🏆 ${escaparHtml(l.vencedor)}</span>`
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
            textoVeredito.innerHTML = formatarMarkdownVisual(data.resposta);
        } else {
            textoVeredito.innerText = `❌ ${data.erro || 'Falha ao gerar análise de IA.'}`;
        }
    } catch (err) {
        textoVeredito.innerText = "❌ Erro ao consultar a IA.";
    }
}

// ============================================================
// 10. CONTROLE DO MENU SANDUÍCHE & MODO NOTURNO
// ============================================================

function abrirMenuDrawer() {
    document.getElementById('menuDrawer')?.classList.add('open');
    document.getElementById('menuBackdrop')?.classList.add('active');
    renderizarMenuDrawerAuth();
}

function fecharMenuDrawer() {
    document.getElementById('menuDrawer')?.classList.remove('open');
    document.getElementById('menuBackdrop')?.classList.remove('active');
}

function renderizarMenuDrawerAuth() {
    const container = document.getElementById('drawerAuthContent');
    if (!container) return;

    const token = localStorage.getItem('token');
    const usuarioNome = localStorage.getItem('usuarioNome');
    const usuarioRole = localStorage.getItem('usuarioRole');

    if (token && usuarioNome) {
        container.innerHTML = `
            <div class="drawer-user-card">
                <i class="fas fa-user-circle"></i>
                <div>
                    <strong style="display:block; font-size: 0.95rem;">${escaparHtml(usuarioNome)}</strong>
                    <span style="font-size: 0.78rem; color: var(--text-muted);">${usuarioRole === 'admin' ? '🛡️ Administrador' : 'Cidadão'}</span>
                </div>
            </div>
            <div class="drawer-section">
                <h4>Minha Conta</h4>
                <ul class="drawer-links">
                    <li><a href="perfil.html"><i class="fas fa-cog"></i> Configurações do Perfil</a></li>
                    ${usuarioRole === 'admin' ? '<li><a href="admin.html" style="color: #eab308;"><i class="fas fa-shield-alt"></i> Painel Administrativo</a></li>' : ''}
                    <li><button onclick="logout()" class="btn-drawer-logout"><i class="fas fa-sign-out-alt"></i> Sair da Conta</button></li>
                </ul>
            </div>
        `;
    } else {
        container.innerHTML = `
            <div class="drawer-section">
                <h4>Acesso</h4>
                <ul class="drawer-links">
                    <li><a href="login.html" class="btn-main" style="justify-content: center; color: white;"><i class="fas fa-sign-in-alt"></i> Entrar na Conta</a></li>
                    <li><a href="cadastro.html" style="justify-content: center;"><i class="fas fa-user-plus"></i> Criar Nova Conta</a></li>
                </ul>
            </div>
        `;
    }
}

function alternarModoNoturno() {
    const checkbox = document.getElementById('darkModeSwitch');
    const ativado = checkbox ? checkbox.checked : false;

    if (ativado) {
        document.body.classList.add('dark-mode');
        localStorage.setItem('temaEscuro', 'true');
    } else {
        document.body.classList.remove('dark-mode');
        localStorage.setItem('temaEscuro', 'false');
    }
}

function inicializarTema() {
    const temaSalvo = localStorage.getItem('temaEscuro');
    const checkbox = document.getElementById('darkModeSwitch');

    if (temaSalvo === 'true') {
        document.body.classList.add('dark-mode');
        if (checkbox) checkbox.checked = true;
    }
}

// ============================================================
// 11. MÓDULO DE ACESSIBILIDADE (WCAG)
// ============================================================

let tamanhoFonteAtual = 100;

function alterarFonte(delta) {
    tamanhoFonteAtual += delta;
    if (tamanhoFonteAtual < 80) tamanhoFonteAtual = 80;
    if (tamanhoFonteAtual > 150) tamanhoFonteAtual = 150;

    document.documentElement.style.fontSize = `${tamanhoFonteAtual}%`;
    localStorage.setItem('fonteAcessibilidade', tamanhoFonteAtual);
}

function resetarFonte() {
    tamanhoFonteAtual = 100;
    document.documentElement.style.fontSize = '100%';
    localStorage.setItem('fonteAcessibilidade', 100);
}

function alternarAltoContraste() {
    document.body.classList.toggle('alto-contraste');
    const ativado = document.body.classList.contains('alto-contraste');
    localStorage.setItem('altoContraste', ativado ? 'true' : 'false');
}

function inicializarAcessibilidade() {
    const fonteSalva = localStorage.getItem('fonteAcessibilidade');
    if (fonteSalva) {
        tamanhoFonteAtual = Number(fonteSalva);
        document.documentElement.style.fontSize = `${tamanhoFonteAtual}%`;
    }

    const contrasteSalvo = localStorage.getItem('altoContraste');
    if (contrasteSalvo === 'true') {
        document.body.classList.add('alto-contraste');
    }
}

// ==========================================
// 12. INICIALIZADOR DE EVENTOS (DOM LOADED)
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
    atualizarMenuNavegacao();
    inicializarTema();
    inicializarAcessibilidade();

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

        const params = new URLSearchParams(window.location.search);
        const perguntaUrl = params.get('pergunta');
        if (perguntaUrl) {
            const inputChat = document.getElementById('msg-input');
            if (inputChat) {
                inputChat.value = perguntaUrl;
                if (localStorage.getItem('token')) {
                    enviarMensagemChat();
                }
            }
        }
    }

    const formAdmin = document.getElementById('adminCidadeForm');
    if (formAdmin) {
        formAdmin.onsubmit = salvarCidadeAdmin;
    }

    const heroForm = document.getElementById('heroAiForm');
    if (heroForm) {
        heroForm.onsubmit = enviarPerguntaHero;
    }

    if (document.getElementById('listaSugestoesCidades') && document.getElementById('painelDetalhesCidade')) {
        inicializarPaginaCidades();
    }

    if (document.getElementById('painelConfronto') || document.getElementById('comp-cidade-1')) {
        inicializarComparador();
    }
});