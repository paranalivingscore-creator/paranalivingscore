// 1. CONFIGURAÇÃO SUPABASE (Substitua pelos seus dados do painel do Supabase)
const SUPABASE_URL = 'https://fmtaijkuidmfladqqgxd.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZtdGFpamt1aWRtZmxhZHFxZ3hkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIwNDY5MTMsImV4cCI6MjA4NzYyMjkxM30.vQXL97T4xWkoOOkiRPc8PIhMrrhOZgFSvdWTYv87KlE';
const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Variável global para armazenar as cidades após o carregamento
let cidadesGlobais = [];

// --- FUNÇÃO DE BUSCA DE DADOS REAIS ---
async function carregarDados() {
    console.log("Buscando dados no Supabase...");
    const { data, error } = await _supabase
        .from('cidades') // Nome da sua tabela no Supabase
        .select('*')
        .order('pib_per_capita', { ascending: false });

    if (error) {
        console.error('Erro ao buscar cidades:', error);
        return [];
    }
    return data;
}

// --- LÓGICA DA BUSCA (Página Inicial) ---
const btnBusca = document.querySelector('.btn-main');
const inputBusca = document.querySelector('#citySearch');

if (btnBusca) {
    btnBusca.addEventListener('click', async () => {
        const termoBusca = inputBusca.value.trim();

        if (termoBusca === "") {
            alert("Por favor, digite o nome de uma cidade.");
            return;
        }

        btnBusca.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Analisando...';
        btnBusca.disabled = true;

        // Busca no Banco de Dados pelo nome exato (ou similar)
        const { data, error } = await _supabase
            .from('cidades')
            .select('*')
            .ilike('nome', termoBusca) // Busca sem diferenciar maiúsculas/minúsculas
            .single();

        if (data) {
            alert(`📍 Cidade: ${data.nome}\n📈 PIB per Capita: R$ ${data.pib_per_capita}\n🎓 IDEB: ${data.ideb}\n🤖 Relatório IA: ${data.descricao_base || 'Processando análise...'}`);
            // Futuramente: Redirecionar para página de detalhes
        } else {
            alert("Cidade não encontrada na base de dados do Paraná.");
        }

        btnBusca.innerHTML = 'Analisar com IA';
        btnBusca.disabled = false;
    });
}

// --- LÓGICA DO RANKING (Tabela) ---
async function renderizarRanking() {
    const tableBody = document.getElementById('rankingTableBody');
    if (!tableBody) return;

    tableBody.innerHTML = '<tr><td colspan="7">Carregando dados oficiais...</td></tr>';

    const cidades = await carregarDados();
    cidadesGlobais = cidades; // Salva para uso nos carrosséis

    tableBody.innerHTML = ''; // Limpa o carregando

    cidades.forEach((cidade, index) => {
        const scoreFinal = calcularScore(cidade);
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${index + 1}º</td>
            <td><strong>${cidade.nome}</strong></td>
            <td>${cidade.ideb || '--'}</td>
            <td>${cidade.seguranca_indice || '--'}</td>
            <td>${cidade.saude_leitos || '--'}</td>
            <td class="td-score">${scoreFinal}</td>
            <td><button class="btn-view" onclick="alert('Detalhes de ${cidade.nome} em breve!')">Ver mais</button></td>
        `;
        tableBody.appendChild(tr);
    });

    // Após carregar o ranking, inicializa os carrosséis com dados reais
    inicializarCarrosseis(cidades);
}

// Função simples para calcular o score (vocês podem melhorar a fórmula)
function calcularScore(c) {
    const p1 = (c.ideb || 0) * 10;
    const p2 = (c.seguranca_indice || 0);
    const p3 = (c.pib_per_capita / 1000) || 0;
    return ((p1 + p2 + p3) / 3).toFixed(1);
}

// --- CARROSSEL PREMIUM (Destaque) ---
let itemAtual = 0;
let cidadesDestaque = [];

function atualizarCarrosselPremium() {
    if (cidadesDestaque.length === 0) return;

    const info = cidadesDestaque[itemAtual];
    const container = document.getElementById('premiumCarousel');

    if (container) {
        container.style.backgroundImage = `url('${info.imagem_url || 'https://via.placeholder.com/1600x900'}')`;
        document.getElementById('p-titulo').innerText = `${itemAtual + 1}º ${info.nome}`;
        document.getElementById('p-grade').innerText = info.ideb > 6 ? 'A' : 'B';
        document.getElementById('p-descricao').innerText = info.descricao_base || "Dados em análise pela nossa IA...";

        const badge = document.getElementById('p-grade');
        badge.style.background = info.ideb > 6 ? "#6ab04c" : "#f0932b";

        // Mostra o conteúdo (que estava hidden)
        document.querySelector('.premium-content').style.display = 'block';
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

// --- INICIALIZAÇÃO GERAL ---
async function inicializarCarrosseis(cidades) {
    // Premium: Pega as 3 primeiras cidades
    cidadesDestaque = cidades.slice(0, 3);
    atualizarCarrosselPremium();

    // Carrossel Simples (Track)
    const track = document.getElementById('carouselTrack');
    if (track) {
        track.innerHTML = ''; // Limpa o mock
        cidades.forEach((cidade, index) => {
            const li = document.createElement('li');
            li.className = 'carousel-card';
            li.innerHTML = `
                <div class="rank-number">#${index + 1}</div>
                <h3>${cidade.nome}</h3>
                <div class="score">${calcularScore(cidade)}</div>
                <p>Qualidade de Vida</p>
            `;
            track.appendChild(li);
        });
    }
}

// --- EVENTOS AO CARREGAR A PÁGINA ---
window.addEventListener('DOMContentLoaded', () => {
    renderizarRanking(); // Isso dispara toda a cadeia de carregamento de dados

    // Intervalo para o carrossel premium
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