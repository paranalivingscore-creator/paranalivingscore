/**
 * PARANÁ LIVING SCORE - Script Principal
 * Este script controla a interface e busca dados do nosso servidor Node.js
 */

// URL do seu servidor local (Back-end)
const API_URL = 'http://localhost:3000/api';

// Variáveis globais para controle de interface
let cidadesGlobais = [];
let cidadesDestaque = [];
let itemAtual = 0;

// --- 1. FUNÇÕES DE BUSCA (CONEXÃO COM O BACK-END) ---

/**
 * Busca a lista completa de cidades para o Ranking
 */
async function carregarTodasCidades() {
    try {
        console.log("Buscando cidades no servidor...");
        const response = await fetch(`${API_URL}/cidades`);
        if (!response.ok) throw new Error("Erro ao carregar ranking");
        return await response.json();
    } catch (error) {
        console.error('Erro na API:', error);
        return [];
    }
}

/**
 * Busca uma cidade específica pelo nome (usado na lupa de busca)
 */
async function buscarCidadePorNome(nome) {
    try {
        const response = await fetch(`${API_URL}/cidades/busca/${nome}`);
        if (!response.ok) {
            if (response.status === 404) return null;
            throw new Error("Erro na busca");
        }
        return await response.json();
    } catch (error) {
        console.error('Erro ao buscar cidade:', error);
        return null;
    }
}

// --- 2. CÁLCULO DO SCORE (LÓGICA DO PFC) ---

/**
 * Calcula o Living Score baseado em pesos (Média Ponderada)
 */
function calcularScore(c) {
    // Pegando indicadores (caso não existam, assume 0)
    const ideb = c.indicadores?.ideb || 0;
    const seguranca = c.indicadores?.seguranca_indice || 0;
    const saude = c.indicadores?.saude_leitos || 0;
    const pib = c.indicadores?.pib_per_capita || 0;

    // Normalização básica para escala 0-100
    const nEdu = ideb * 10;
    const nSeg = seguranca;
    const nSau = Math.min((saude / 5) * 100, 100); // 5 leitos por 1k hab = nota 100
    const nEco = Math.min((pib / 60000) * 100, 100); // 60k PIB = nota 100

    // Pesos: Segurança(4), Educação(3), Saúde(2), Economia(1)
    const scoreFinal = ((nSeg * 4) + (nEdu * 3) + (nSau * 2) + (nEco * 1)) / 10;

    return scoreFinal.toFixed(1);
}

// --- 3. LÓGICA DA BUSCA (PÁGINA INICIAL) ---

const btnBusca = document.querySelector('.btn-main');
const inputBusca = document.querySelector('#citySearch');

if (btnBusca) {
    btnBusca.addEventListener('click', async () => {
        const termoBusca = inputBusca.value.trim();

        if (termoBusca === "") {
            alert("Por favor, digite o nome de uma cidade.");
            return;
        }

        btnBusca.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Analisando com IA...';
        btnBusca.disabled = true;

        const cidade = await buscarCidadePorNome(termoBusca);

        if (cidade) {
            // Exemplo de como mostrar o resultado. 
            // Dica: Você pode criar um modal ou redirecionar para uma página de detalhes.
            alert(`
                📍 Cidade: ${cidade.nome}
                ⭐ Living Score: ${calcularScore(cidade)}
                🤖 Análise da IA: ${cidade.relatorio_ia || 'Análise sendo gerada...'}
            `);
        } else {
            alert("Cidade não encontrada na nossa base oficial do Paraná.");
        }

        btnBusca.innerHTML = 'Analisar com IA';
        btnBusca.disabled = false;
    });
}

// --- 4. LÓGICA DO RANKING E CARROSSEL ---

/**
 * Renderiza a tabela de ranking
 */
async function renderizarRanking() {
    const tableBody = document.getElementById('rankingTableBody');
    if (!tableBody) return;

    tableBody.innerHTML = '<tr><td colspan="7">Carregando dados oficiais...</td></tr>';

    const cidades = await carregarTodasCidades();
    cidadesGlobais = cidades;

    tableBody.innerHTML = ''; // Limpa o carregando

    cidades.forEach((cidade, index) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${index + 1}º</td>
            <td><strong>${cidade.nome}</strong></td>
            <td>${cidade.indicadores?.ideb || '--'}</td>
            <td>${cidade.indicadores?.seguranca_indice || '--'}</td>
            <td>${cidade.indicadores?.saude_leitos || '--'}</td>
            <td class="td-score">${calcularScore(cidade)}</td>
            <td><button class="btn-view" onclick="alert('Relatório IA: ${cidade.relatorio_ia}')">Ver mais</button></td>
        `;
        tableBody.appendChild(tr);
    });

    inicializarCarrosseis(cidades);
}

/**
 * Controla o carrossel premium da Home
 */
function atualizarCarrosselPremium() {
    if (cidadesDestaque.length === 0) return;

    const info = cidadesDestaque[itemAtual];
    const container = document.getElementById('premiumCarousel');

    if (container) {
        // Se tiver imagem no banco usa ela, senão usa uma padrão
        const img = info.imagem_url || 'https://images.unsplash.com/photo-1544735168-19e34070a758?auto=format&fit=crop&w=1600&q=80';
        container.style.backgroundImage = `url('${img}')`;

        document.getElementById('p-titulo').innerText = `${itemAtual + 1}º ${info.nome}`;
        document.getElementById('p-grade').innerText = calcularScore(info) > 80 ? 'A' : 'B';
        document.getElementById('p-descricao').innerText = info.relatorio_ia || "Nossa IA está analisando os indicadores desta cidade...";

        const badge = document.getElementById('p-grade');
        badge.style.background = calcularScore(info) > 80 ? "#10b981" : "#f59e0b";

        document.querySelector('.premium-content').style.display = 'block';
        if (document.getElementById('loader')) document.getElementById('loader').style.display = 'none';
    }
}

function nextPremium() {
    itemAtual = (itemAtual + 1) % cidadesDestaque.length;
    atualizarCarrosselPremium();
}

function prevPremium() {
    itemAtual = (itemAtual - 1 + cidadesDestaque.length) % cidadesDestaque.length;
    atualizarCarrosselPremium();
}

/**
 * Prepara os dados para os carrosséis
 */
function inicializarCarrosseis(cidades) {
    cidadesDestaque = cidades.slice(0, 3); // Top 3 para o Premium
    atualizarCarrosselPremium();
}

// --- 5. INICIALIZAÇÃO AO CARREGAR PÁGINA ---

window.addEventListener('DOMContentLoaded', () => {
    // Tenta renderizar o ranking se estiver na página de ranking
    renderizarRanking();

    // Intervalo de troca automática do carrossel premium
    setInterval(nextPremium, 8000);
});

// Animação suave de scroll
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) target.scrollIntoView({ behavior: 'smooth' });
    });
});