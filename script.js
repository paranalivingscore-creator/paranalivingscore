// 1. CONFIGURAÇÕES GLOBAIS
const API_URL = 'https://parana-living-backend.onrender.com/api';

/**
 * FUNÇÃO AUXILIAR: exibirMensagem
 * Exibe avisos de erro ou sucesso diretamente no HTML, sem usar alert().
 * Requer uma <div id="auth-msg"> no seu HTML.
 */
function exibirMensagem(texto, tipo) {
    const msgDiv = document.getElementById('auth-msg');
    if (!msgDiv) return console.warn("Aviso: Falta a <div id='auth-msg'> no seu HTML.");

    msgDiv.innerText = texto;
    msgDiv.className = `msg-box msg-${tipo}`; // msg-success ou msg-error
    msgDiv.style.display = 'block';

    // Esconde a mensagem após 5 segundos automaticamente
    setTimeout(() => { msgDiv.style.display = 'none'; }, 5000);
}

// --- 2. SISTEMA DE AUTENTICAÇÃO (CADASTRO E LOGIN) ---

async function realizarCadastro(event) {
    event.preventDefault(); // Impede o refresh da página
    const btn = document.getElementById('btnCadastro');
    const nome = document.getElementById('nome').value;
    const email = document.getElementById('email').value;
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
            exibirMensagem("✅ Cadastro realizado! Redirecionando...", "success");
            setTimeout(() => { window.location.href = 'login.html'; }, 2000);
        } else {
            exibirMensagem(`❌ ${dados.erro}`, "error");
        }
    } catch (err) {
        exibirMensagem("❌ Erro de conexão com o servidor.", "error");
    } finally {
        btn.innerHTML = 'Finalizar Cadastro';
        btn.disabled = false;
    }
}

async function fazerLogin(event) {
    event.preventDefault();
    const btn = document.getElementById('btnLogin');
    const email = document.getElementById('email').value;
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
            // Persistência: Guardamos o Token e o Objeto do Usuário
            localStorage.setItem('token', dados.token);
            localStorage.setItem('usuario', JSON.stringify(dados.usuario));
            
            exibirMensagem("✅ Bem-vindo! Acessando sistema...", "success");
            
            setTimeout(() => {
                window.location.href = dados.usuario.role === 'admin' ? 'admin.html' : 'index.html';
            }, 1500);
        } else {
            exibirMensagem(`❌ ${dados.erro}`, "error");
        }
    } catch (err) {
        exibirMensagem("❌ Servidor offline.", "error");
    } finally {
        btn.innerHTML = 'Acessar Painel';
        btn.disabled = false;
    }
}

// --- 3. SISTEMA DE PERFIL (DADOS REAIS DO BANCO) ---

async function carregarPerfil() {
    const token = localStorage.getItem('token');
    if (!token) return window.location.href = 'login.html';

    try {
        const res = await fetch(`${API_URL}/usuario/perfil`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const usuario = await res.json();

        if (res.ok) {
            // Preenche os campos da página de perfil se eles existirem
            if(document.getElementById('perfil-nome')) document.getElementById('perfil-nome').value = usuario.nome;
            if(document.getElementById('perfil-email')) document.getElementById('perfil-email').value = usuario.email;
        }
    } catch (err) {
        console.error("Erro ao carregar perfil:", err);
    }
}

// --- 4. SISTEMA DE BUSCA (DASHBOARD) ---

async function realizarBusca() {
    const input = document.getElementById('citySearch');
    const termo = input.value.trim();
    if (!termo) return;

    try {
        const res = await fetch(`${API_URL}/cidades/busca/${termo}`);
        const cidade = await res.json();

        if (res.ok) {
            const section = document.getElementById('resultadoBusca');
            section.style.display = 'block';
            document.getElementById('res-nome-cidade').innerText = cidade.nome;
            document.getElementById('res-score').innerText = cidade.score_final || "0.0";
            document.getElementById('res-ia-texto').innerText = cidade.relatorio_ia || "Gerando relatório...";
            section.scrollIntoView({ behavior: 'smooth' });
        }
    } catch (err) { console.error(err); }
}

// --- 5. SISTEMA DE CHAT COM IA (PERSISTENTE) ---

async function enviarMensagemChat() {
    const input = document.getElementById('msg-input');
    const chatWindow = document.getElementById('chat-window');
    const token = localStorage.getItem('token');
    const msg = input.value.trim();

    if (!msg || !token) return;

    // Adiciona a bolha do usuário na tela imediatamente
    chatWindow.innerHTML += `<div class="msg-bubble msg-usuario">${msg}</div>`;
    input.value = "";
    chatWindow.scrollTop = chatWindow.scrollHeight;

    try {
        const res = await fetch(`${API_URL}/chat/enviar`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}` 
            },
            body: JSON.stringify({ mensagem: msg })
        });
        const dados = await res.json();

        if (res.ok) {
            // Adiciona a resposta da IA na tela
            chatWindow.innerHTML += `<div class="msg-bubble msg-ia">${dados.resposta}</div>`;
            chatWindow.scrollTop = chatWindow.scrollHeight;
        }
    } catch (err) {
        chatWindow.innerHTML += `<div class="msg-bubble msg-ia">Erro ao falar com a IA.</div>`;
    }
}

// --- 6. INICIALIZADOR DE EVENTOS ---

document.addEventListener('DOMContentLoaded', () => {
    // Configura Formulários
    const formCad = document.getElementById('cadastroForm');
    if (formCad) formCad.onsubmit = realizarCadastro;

    const formLog = document.getElementById('loginForm');
    if (formLog) formLog.onsubmit = fazerLogin;

    // Configura Busca
    const btnBusca = document.querySelector('.btn-main');
    if (btnBusca) btnBusca.onclick = realizarBusca;

    // Configura Chat (se estiver na página de chat)
    const btnChat = document.getElementById('btnEnviarChat');
    if (btnChat) btnChat.onclick = enviarMensagemChat;

    // Se estiver na página de perfil, carrega os dados
    if (window.location.pathname.includes('perfil.html')) {
        carregarPerfil();
    }
});