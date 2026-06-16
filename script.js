// 1. Configuração da URL Base
// Adicionamos o /api aqui para que as chamadas fiquem mais curtas e organizadas
const API_URL = 'https://parana-living-backend.onrender.com/api';

/**
 * FUNÇÃO: realizarBusca
 * Objetivo: Buscar dados de uma cidade específica e atualizar o Dashboard.
 */
async function realizarBusca() {
    const input = document.getElementById('citySearch');
    const btn = document.querySelector('.btn-main');
    const termo = input.value.trim();

    // Validação simples
    if (!termo) return alert("Digite o nome de uma cidade!");

    // Feedback visual para o usuário (UX)
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Analisando...';
    btn.disabled = true;

    try {
        // Faz a requisição ao nosso Backend no Render
        const res = await fetch(`${API_URL}/cidades/busca/${termo}`);
        
        if (!res.ok) throw new Error("Cidade não encontrada no banco de dados.");
        
        const cidade = await res.json(); // Aqui a variável 'cidade' é criada e populada

        // --- ATUALIZAÇÃO DA INTERFACE (DOM) ---
        const section = document.getElementById('resultadoBusca');
        if (section) {
            section.style.display = 'block';
            
            // Preenchendo os dados básicos e Score
            document.getElementById('res-nome-cidade').innerText = `${cidade.nome} / PR`;
            document.getElementById('res-score').innerText = cidade.score_final || "0.0";
            document.getElementById('res-ia-texto').innerText = cidade.relatorio_ia || "Análise indisponível no momento.";
            
            // Preenchendo os Indicadores (Tratando caso os dados venham vazios)
            document.getElementById('res-ideb').innerText = cidade.indicadores?.ideb || "---";
            document.getElementById('res-seguranca').innerText = cidade.indicadores?.seguranca_indice ? `${cidade.indicadores.seguranca_indice}/100` : "---";
            document.getElementById('res-saude').innerText = cidade.indicadores?.saude_leitos || "---";
            
            const pibFormatado = cidade.indicadores?.pib_per_capita 
                ? `R$ ${cidade.indicadores.pib_per_capita.toLocaleString('pt-BR')}` 
                : "---";
            document.getElementById('res-pib').innerText = pibFormatado;

            // --- LÓGICA DO CLIMA (DADOS DA NUVEM) ---
            if (cidade.clima) {
                console.log("Dados do clima recebidos:", cidade.clima);
                // Exemplo: Mostrar um alerta ou atualizar um campo de clima se você tiver no HTML
                // alert(`Clima atual em ${cidade.nome}: ${cidade.clima.temp}°C e ${cidade.clima.descricao}`);
            }

            // Rola a página suavemente até o resultado
            section.scrollIntoView({ behavior: 'smooth' });
        }

    } catch (err) {
        console.error("Erro na busca:", err);
        alert(err.message);
    } finally {
        // Restaura o botão original
        btn.innerHTML = 'Analisar com IA';
        btn.disabled = false;
    }
}

/**
 * FUNÇÃO: carregarRanking
 * Objetivo: Buscar a lista de todas as cidades e montar a tabela de ranking.
 */
async function carregarRanking() {
    const tableBody = document.getElementById('rankingTableBody');
    if (!tableBody) return;

    try {
        const res = await fetch(`${API_URL}/cidades`);
        const cidades = await res.json();

        tableBody.innerHTML = ""; // Limpa a tabela antes de preencher

        cidades.forEach((c, index) => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${index + 1}º</td>
                <td><strong>${c.nome}</strong></td>
                <td>${c.indicadores?.ideb || '---'}</td>
                <td>${c.indicadores?.seguranca_indice || '---'}</td>
                <td>${c.indicadores?.saude_leitos || '---'}</td>
                <td class="td-score">${c.score_final || '0.0'}</td>
                <td><button class="btn-view" onclick="alert('${c.relatorio_ia || 'Sem relatório'}')">Ver Mais</button></td>
            `;
            tableBody.appendChild(tr);

            // Preenchimento do Pódio (Top 3)
            if (index < 3) {
                const nomeElem = document.getElementById(`pos${index + 1}-nome`);
                const scoreElem = document.getElementById(`pos${index + 1}-score`);
                if (nomeElem) nomeElem.innerText = c.nome;
                if (scoreElem) scoreElem.innerText = c.score_final || "0.0";
            }
        });
    } catch (err) {
        console.error("Erro ao carregar ranking:", err);
    }
}

async function fazerLogin(event) {
    event.preventDefault();
    
    // Pegar dados do formulário...
    const dados = { email: '...', senha: '...' };

    const res = await fetch('https://parana-living-backend.onrender.com/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dados)
    });

    const resultado = await res.json();

    if (res.ok) {
        // Guardar o token no navegador
        localStorage.setItem('token', resultado.token);
        localStorage.setItem('role', resultado.usuario.role);

        // --- A GRANDE LÓGICA DE REDIRECIONAMENTO ---
        if (resultado.usuario.role === 'admin') {
            window.location.href = 'admin.html'; // Vai para a área do mestre
        } else {
            window.location.href = 'index.html'; // Vai para a área de busca
        }
    } else {
        alert(resultado.erro);
    }
}

// 1. Configuração da URL Base (Já definida anteriormente)
const API_URL = 'https://parana-living-backend.onrender.com/api';

/**
 * FUNÇÃO: fazerLogin
 * Lógica para autenticar o usuário e redirecionar conforme o cargo (role).
 */
async function fazerLogin(event) {
    event.preventDefault(); // Impede o recarregamento da página

    const email = document.getElementById('email').value;
    const senha = document.getElementById('senha').value;
    const btn = document.getElementById('btnLogin');

    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Entrando...';
    btn.disabled = true;

    try {
        const res = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, senha })
        });

        const dados = await res.json();

        if (!res.ok) throw new Error(dados.erro || "Falha no login");

        // Guardamos os dados de sessão
        localStorage.setItem('token', dados.token);
        localStorage.setItem('usuarioRole', dados.usuario.role);
        localStorage.setItem('usuarioNome', dados.usuario.nome);

        // Redirecionamento Inteligente
        if (dados.usuario.role === 'admin') {
            window.location.href = 'admin.html';
        } else {
            window.location.href = 'index.html';
        }

    } catch (err) {
        alert("Erro ao entrar: " + err.message);
    } finally {
        btn.innerHTML = 'Acessar Painel';
        btn.disabled = false;
    }
}

/**
 * FUNÇÃO: fazerCadastro
 * Cria um novo usuário no banco de dados.
 */
async function fazerCadastro(event) {
    event.preventDefault();

    const nome = document.getElementById('nome').value;
    const email = document.getElementById('email').value;
    const senha = document.getElementById('senha').value;
    const btn = document.getElementById('btnCadastro');

    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Criando conta...';
    btn.disabled = true;

    try {
        const res = await fetch(`${API_URL}/auth/cadastro`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nome, email, senha })
        });

        const dados = await res.json();

        if (!res.ok) throw new Error(dados.erro || "Erro ao cadastrar");

        alert("Conta criada com sucesso! Agora faça seu login.");
        window.location.href = 'login.html';

    } catch (err) {
        alert("Erro no cadastro: " + err.message);
    } finally {
        btn.innerHTML = 'Finalizar Cadastro';
        btn.disabled = false;
    }
}

// --- ATUALIZAÇÃO DO DOMCONTENTLOADED ---
// Aqui garantimos que cada página execute apenas o que lhe cabe.
document.addEventListener('DOMContentLoaded', () => {
    
    // 1. Configuração da Busca (Home)
    const btnBusca = document.querySelector('.btn-main');
    if (btnBusca) btnBusca.onclick = realizarBusca;

    // 2. Configuração do Login
    const formLogin = document.getElementById('loginForm');
    if (formLogin) formLogin.onsubmit = fazerLogin;

    // 3. Configuração do Cadastro
    const formCadastro = document.getElementById('cadastroForm');
    if (formCadastro) formCadastro.onsubmit = fazerCadastro;

    // 4. Configuração do Ranking
    if (window.location.pathname.includes('ranking.html')) {
        carregarRanking();
    }
});

/**
 * INICIALIZAÇÃO: Event Listeners
 * Garante que o código só rode quando o HTML estiver pronto.
 */
document.addEventListener('DOMContentLoaded', () => {
    // Configura o clique do botão de busca
    const btnBusca = document.querySelector('.btn-main');
    if (btnBusca) {
        btnBusca.addEventListener('click', realizarBusca);
    }

    // Configura o clique da tecla Enter no input
    const inputBusca = document.getElementById('citySearch');
    if (inputBusca) {
        inputBusca.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') realizarBusca();
        });
    }

    // Se estiver na página de ranking, carrega os dados automaticamente
    if (window.location.pathname.includes('ranking.html')) {
        carregarRanking();
    }
});