# 🌆 Paraná Living Score - Inteligência Urbana

> **Projeto Final de Curso (PFC)** do Curso Técnico em Informática para Internet - IFPR Campus Assis Chateaubriand.

O **Paraná Living Score** é uma plataforma inteligente que analisa e classifica a qualidade de vida nos 399 municípios do Paraná. Utilizando Inteligência Artificial e dados oficiais, o sistema transforma números complexos em relatórios compreensíveis para auxiliar cidadãos na tomada de decisão sobre moradia e investimento.

---

## 🚀 Funcionalidades Principais

- **Coleta Automatizada (ETL):** Ingestão de dados reais de todos os municípios via API do IBGE.
- **Relatórios com IA:** Geração automática de análises qualitativas utilizando o modelo **Google Gemini 1.5-flash**.
- **Dados em Tempo Real:** Integração com serviços em nuvem (**OpenWeatherMap**) para exibir o clima e condições atmosféricas atuais.
- **Living Score:** Algoritmo de média ponderada (Segurança, Educação, Saúde e Economia) para classificar as cidades.
- **Ranking Interativo:** Visualização das melhores cidades do estado baseada em indicadores técnicos.

---

## 🛠️ Tecnologias e Serviços em Nuvem

O projeto utiliza uma arquitetura moderna baseada em microserviços e APIs:

- **Back-end:** Node.js com Framework Express.
- **Banco de Dados (DBaaS):** MongoDB Atlas (Nuvem).
- **Inteligência Artificial (AIaaS):** Google Gemini AI API.
- **Serviços de Terceiros:** OpenWeatherMap API (Clima em tempo real) e API de Localidades do IBGE.
- **Front-end:** HTML5, CSS3 moderno (Flexbox/Grid) e JavaScript Assíncrono (Fetch API).

---

## 📋 Pré-requisitos

Antes de começar, você vai precisar ter instalado:
- [Node.js](https://nodejs.org/en/) (v18 ou superior)
- Uma conta no [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
- Chaves de API para o **Google AI Studio** e **OpenWeatherMap**

---

## 📦 Instalação e Configuração

