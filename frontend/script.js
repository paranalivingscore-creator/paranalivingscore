const API_URL = 'https://parana-living-backend.onrender.com/api';

// Função para buscar cidade (Usada na Home)
async function realizarBusca() {
    const input = document.getElementById('citySearch');
    const btn = document.querySelector('.btn-main');
    const termo = input.value.trim();

    if (!termo) return alert("Digite o nome de uma cidade!");

    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Analisando...';
    btn.disabled = true;

    try {
        const res = await fetch(`${API_URL}/cidades/busca/${termo}`);
        if (!res.ok) throw new Error("Cidade não encontrada");
        const cidade = await res.json();

        // Mostrar Seção de Resultados
        const section = document.getElementById('resultadoBusca');
        if (section) {
            section.style.display = 'block';
            document.getElementById('res-nome-cidade').innerText = cidade.nome + " / PR";
            document.getElementById('res-score').innerText = cidade.score_final;
            document.getElementById('res-ia-texto').innerText = cidade.relatorio_ia;
            document.getElementById('res-ideb').innerText = cidade.indicadores.ideb;
            document.getElementById('res-seguranca').innerText = cidade.indicadores.seguranca_indice + "/100";
            document.getElementById('res-saude').innerText = cidade.indicadores.saude_leitos;
            document.getElementById('res-pib').innerText = "R$ " + cidade.indicadores.pib_per_capita.toLocaleString('pt-BR');
            section.scrollIntoView({ behavior: 'smooth' });
        }
    } catch (err) {
        alert("Erro: " + err.message);
    } finally {
        btn.innerHTML = 'Analisar com IA';
        btn.disabled = false;
    }
}

// Função para carregar o Ranking (Usada na página Ranking)
async function carregarRanking() {
    const tableBody = document.getElementById('rankingTableBody');
    if (!tableBody) return;

    try {
        const res = await fetch(`${API_URL}/cidades`);
        const cidades = await res.json();

        tableBody.innerHTML = "";
        cidades.forEach((c, index) => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${index + 1}º</td>
                <td><strong>${c.nome}</strong></td>
                <td>${c.indicadores.ideb}</td>
                <td>${c.indicadores.seguranca_indice}</td>
                <td>${c.indicadores.saude_leitos}</td>
                <td class="td-score">${c.score_final}</td>
                <td><button class="btn-view" onclick="alert('${c.relatorio_ia}')">Ver Mais</button></td>
            `;
            tableBody.appendChild(tr);

            // Se for top 3, preenche o pódio
            if(index < 3) {
                const nomeElement = document.getElementById(`pos${index+1}-nome`);
                const scoreElement = document.getElementById(`pos${index+1}-score`);
                if(nomeElement) nomeElement.innerText = c.nome;
                if(scoreElement) scoreElement.innerText = c.score_final;
            }
        });
    } catch (err) {
        console.error("Erro ao carregar ranking", err);
    }
}

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    const btnBusca = document.querySelector('.btn-main');
    if (btnBusca) btnBusca.onclick = realizarBusca;
    
    if (window.location.pathname.includes('ranking.html')) {
        carregarRanking();
    }
    // Dentro do seu script.js, quando receber o 'cidade' do servidor:
if (cidade) {
    // 1. Mostra os dados que já tínhamos (IA e Score)
    alert(`🤖 Relatório IA: ${cidade.relatorio_ia}`);

    // 2. MOSTRA A NOVIDADE (DADOS DA NUVEM)
    if (cidade.clima) {
        console.log(`Clima em tempo real: ${cidade.clima.temp}°C e ${cidade.clima.descricao}`);
        
        // Se quiser mostrar num alerta bonitinho:
        alert(`
            📍 ${cidade.nome}
            🌡️ Temperatura atual: ${cidade.clima.temp}°C
            ☁️ Condição: ${cidade.clima.descricao}
            📅 Data da consulta: ${cidade.data_consulta}
        `);
    }
}
});