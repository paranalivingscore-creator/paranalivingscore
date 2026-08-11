// Defina a URL do seu backend no Render
const API_BASE_URL = 'https://parana-living-backend.onrender.com/api';

document.getElementById('loginForm')?.addEventListener('submit', async (e) => {
    e.preventDefault(); // Impede a página de recarregar

    const email = document.getElementById('email').value;
    const senha = document.getElementById('senha').value;
    const btn = document.getElementById('btnLogin');

    // Feedback visual
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Autenticando...';
    btn.disabled = true;

    try {
        const response = await fetch(`${API_BASE_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, senha })
        });

        const data = await response.json();

        if (response.ok) {
            // --- SUCESSO NO LOGIN ---
            // 1. Guardamos o Token e as informações no LocalStorage (Memória do Navegador)
            localStorage.setItem('token', data.token);
            localStorage.setItem('usuarioNome', data.usuario.nome);
            localStorage.setItem('usuarioRole', data.usuario.role);

            // 2. Lógica de Redirecionamento baseada no Cargo (Role)
            if (data.usuario.role === 'admin') {
                alert(`Bem-vindo, Administrador ${data.usuario.nome}!`);
                window.location.href = 'admin.html';
            } else {
                alert(`Olá, ${data.usuario.nome}! Login realizado.`);
                window.location.href = 'index.html';
            }
        } else {
            // --- ERRO NO LOGIN ---
            alert(data.erro || "Falha ao entrar. Verifique seus dados.");
        }

    } catch (error) {
        console.error("Erro na conexão:", error);
        alert("Não foi possível conectar ao servidor. Tente novamente mais tarde.");
    } finally {
        btn.innerHTML = 'Entrar no Sistema';
        btn.disabled = false;
    }
});