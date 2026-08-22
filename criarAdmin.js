require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const Usuario = require('./models/Usuario');

async function criarUsuarioAdmin() {
    try {
        console.log("⏳ Conectando ao MongoDB Atlas...");
        await mongoose.connect(process.env.MONGO_URI);
        console.log("✅ Conectado com sucesso!");

        // Dados do Administrador inicial (você pode alterar se desejar)
        const emailAdmin = "paranalivingscore@gmail.com";
        const senhaAdmin = "24302009";
        const nomeAdmin = "Arthur Admin";

        // Verifica se o admin já existe
        const usuarioExistente = await Usuario.findOne({ email: emailAdmin });

        if (usuarioExistente) {
            console.log(`⚠️ O usuário com o e-mail '${emailAdmin}' já existe.`);
            usuarioExistente.role = 'admin'; // Garante que é admin
            await usuarioExistente.save();
            console.log("✅ Permissão de ADMIN confirmada para este usuário!");
        } else {
            // Criptografa a senha
            const salt = await bcrypt.genSalt(10);
            const senhaCripto = await bcrypt.hash(senhaAdmin, salt);

            // Cria o novo usuário com role: 'admin'
            const novoAdmin = new Usuario({
                nome: nomeAdmin,
                email: emailAdmin,
                senha: senhaCripto,
                role: 'admin'
            });

            await novoAdmin.save();
            console.log("🎉 Administrador criado com sucesso!");
        }

        console.log("\n------------------------------------------------");
        console.log("🔑 CREDENCIAIS DE ACESSO AO PAINEL ADMIN:");
        console.log(`📧 E-mail: ${emailAdmin}`);
        console.log(`🔒 Senha:  ${senhaAdmin}`);
        console.log("------------------------------------------------\n");

    } catch (erro) {
        console.error("❌ Erro ao criar administrador:", erro.message);
    } finally {
        await mongoose.disconnect();
        console.log("🔌 Conexão encerrada.");
        process.exit();
    }
}

criarUsuarioAdmin();