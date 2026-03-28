const mongoose = require('mongoose');
const Cidade = require('./models/Cidade');

const linkConexao = "mongodb+srv://admin:admin12345@cluster0.9oqgya9.mongodb.net/ParanaLivingScore?retryWrites=true&w=majority";

const cidadesIniciais = [
  {
    ibge_id: 4115200, nome: "Maringá",
    indicadores: { ideb: 7.1, seguranca_indice: 85, saude_leitos: 4.2, pib_per_capita: 45000 },
    relatorio_ia: "Maringá é destaque nacional em arborização e planejamento urbano."
  },
  {
    ibge_id: 4106902, nome: "Curitiba",
    indicadores: { ideb: 6.8, seguranca_indice: 78, saude_leitos: 5.1, pib_per_capita: 52000 },
    relatorio_ia: "A capital paranaense é referência em transporte público e inovação."
  }
];

mongoose.connect(linkConexao)
  .then(async () => {
    console.log("🌱 Populando o banco...");
    await Cidade.deleteMany({});
    await Cidade.insertMany(cidadesIniciais);
    console.log("✅ CIDADES INSERIDAS COM SUCESSO!");
    process.exit();
  })
  .catch(err => console.error(err));