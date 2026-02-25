// Dados simulados para teste (Mock Data)
const cidadesParana = [
    { nome: "Curitiba", score: 95, seg: 8.5, edu: 9.8, sau: 9.2, emp: 9.5, resumo: "A capital paranaense é referência em transporte e planejamento urbano." },
    { nome: "Maringá", score: 92, seg: 9.0, edu: 9.1, sau: 8.9, emp: 8.8, resumo: "Destaque em arborização e qualidade de vida constante." },
    { nome: "Cascavel", score: 89, seg: 8.2, edu: 8.5, sau: 8.0, emp: 9.2, resumo: "Polo do agronegócio com forte crescimento econômico." },
    { nome: "Assis Chateaubriand", score: 81, seg: 9.2, edu: 8.5, sau: 7.8, emp: 8.1, resumo: "Cidade segura com forte potencial de crescimento agroindustrial." },
    { nome: "Toledo", score: 87, seg: 8.2, edu: 9.1, sau: 8.0, emp: 9.4, resumo: "Referência estadual em produtividade e desenvolvimento econômico." }
];

// --- Lógica da Busca (Página Inicial) ---
const btnBusca = document.querySelector('.btn-main');
const inputBusca = document.querySelector('#citySearch');

if (btnBusca) {
    btnBusca.addEventListener('click', () => {
        const termoBusca = inputBusca.value.trim().toLowerCase();

        if (termoBusca === "") {
            alert("Por favor, digite o nome de uma cidade.");
            return;
        }

        // Simula o carregamento da IA
        btnBusca.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Analisando...';
        btnBusca.disabled = true;

        setTimeout(() => {
            const cidadeEncontrada = cidadesParana.find(c => c.nome.toLowerCase() === termoBusca);

            if (cidadeEncontrada) {
                // Aqui você pode redirecionar para uma página de resultado ou mostrar um modal
                // Por enquanto, vamos apenas mostrar no console e dar um feedback
                alert(`IA Localizou: ${cidadeEncontrada.nome}\nScore: ${cidadeEncontrada.score}\nResumo: ${cidadeEncontrada.resumo}`);

                // Exemplo de como você alteraria os elementos na tela futuramente:
                // document.querySelector('.score-value').innerText = cidadeEncontrada.score;
            } else {
                alert("Cidade não encontrada na base de dados do Paraná. Tente Curitiba ou Toledo.");
            }

            btnBusca.innerHTML = 'Analisar com IA';
            btnBusca.disabled = false;
        }, 1500); // Simula 1.5 segundos de "pensamento" da IA
    });
}

// --- Lógica de Filtros (Página Ranking) ---
const botoesFiltro = document.querySelectorAll('.filter-btn');
const linhasTabela = document.querySelectorAll('.styled-table tbody tr');

if (botoesFiltro.length > 0) {
    botoesFiltro.forEach(botao => {
        botao.addEventListener('click', () => {
            // Remove classe active de todos e adiciona no clicado
            botoesFiltro.forEach(b => b.classList.remove('active'));
            botao.classList.add('active');

            const categoria = botao.innerText.toLowerCase();

            // Simulação simples: apenas uma animação de "atualizando"
            const tabela = document.querySelector('.styled-table');
            tabela.style.opacity = '0.5';

            setTimeout(() => {
                tabela.style.opacity = '1';
                // No futuro, aqui você faria uma requisição para o banco de dados
                // ordenando pelo critério escolhido (Educação, Segurança, etc.)
                console.log(`Ordenando ranking por: ${categoria}`);
            }, 500);
        });
    });
}

// --- Animação Suave ao Rolar ---
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        document.querySelector(this.getAttribute('href')).scrollIntoView({
            behavior: 'smooth'
        });
    });
});

// Adicione isso ao seu script.js existente

const track = document.getElementById('carouselTrack');
const nextBtn = document.getElementById('nextBtn');
const prevBtn = document.getElementById('prevBtn');

// Ordenar cidades por score para o ranking
const rankingCidades = [...cidadesParana].sort((a, b) => b.score - a.score);

// 1. Criar os cards do carrossel dinamicamente
if (track) {
    rankingCidades.forEach((cidade, index) => {
        const li = document.createElement('li');
        li.className = 'carousel-card';
        li.innerHTML = `
            <div class="rank-number">#${index + 1}</div>
            <h3>${cidade.nome}</h3>
            <div class="score">${cidade.score}</div>
            <p>Qualidade de Vida</p>
        `;
        track.appendChild(li);
    });

    // Lógica de Movimentação
    let index = 0;

    function moveCarousel() {
        const cardWidth = document.querySelector('.carousel-card').offsetWidth + 20;
        const maxIndex = rankingCidades.length - (window.innerWidth > 768 ? 3 : 1);

        if (index > maxIndex) index = 0;
        if (index < 0) index = maxIndex;

        track.style.transform = `translateX(-${index * cardWidth}px)`;
    }

    nextBtn.addEventListener('click', () => {
        index++;
        moveCarousel();
    });

    prevBtn.addEventListener('click', () => {
        index--;
        moveCarousel();
    });

    // Auto-play (opcional)
    setInterval(() => {
        index++;
        moveCarousel();
    }, 5000);
}

// Novos dados detalhados para o carrossel premium
const dadosDestaque = [
    {
        posicao: "1º",
        nome: "Curitiba",
        grade: "A",
        descricao: "Curitiba é a capital do estado brasileiro do Paraná, localizada a 934 metros de altitude. É mundialmente reconhecida pelo seu planejamento urbano e sistema de transporte inovador.",
        imagem: "https://images.unsplash.com/photo-159672612be79-196020581335?q=80&w=1600" // Exemplo de imagem
    },
    {
        posicao: "2º",
        nome: "Maringá",
        grade: "A",
        descricao: "Maringá destaca-se como uma das cidades mais arborizadas do Brasil, oferecendo uma qualidade de vida excepcional com infraestrutura moderna e alto índice de segurança.",
        imagem: "https://images.unsplash.com/photo-1627914439149-623838380302?q=80&w=1600"
    },
    {
        posicao: "3º",
        nome: "Toledo",
        grade: "B",
        descricao: "Toledo é o maior produtor de grãos e suínos do Paraná. A cidade combina prosperidade econômica com investimentos constantes em educação e lazer para a população.",
        imagem: "https://images.unsplash.com/photo-1582234373132-7235227d8196?q=80&w=1600"
    }
];

let itemAtual = 0;

function atualizarCarrosselPremium() {
    const info = dadosDestaque[itemAtual];
    const container = document.getElementById('premiumCarousel');

    // Atualiza a imagem de fundo
    container.style.backgroundImage = `url('${info.imagem}')`;

    // Atualiza os textos com uma pequena animação de fade (opcional)
    document.getElementById('p-titulo').innerText = `${info.posicao} ${info.nome}`;
    document.getElementById('p-grade').innerText = info.grade;
    document.getElementById('p-descricao').innerText = info.descricao;

    // Muda a cor da badge baseado na nota
    const badge = document.getElementById('p-grade');
    badge.style.background = info.grade === "A" ? "#6ab04c" : "#f0932b";
}

function nextPremium() {
    itemAtual = (itemAtual + 1) % dadosDestaque.length;
    atualizarCarrosselPremium();
}

function prevPremium() {
    itemAtual = (itemAtual - 1 + dadosDestaque.length) % dadosDestaque.length;
    atualizarCarrosselPremium();
}

// Inicia o carrossel automático
setInterval(nextPremium, 8000);

// Chama uma vez ao carregar a página
window.onload = atualizarCarrosselPremium;