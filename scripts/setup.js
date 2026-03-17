const fs = require("fs");
const path = require("path");

const rootDir = path.join(__dirname, "..");
const envPath = path.join(rootDir, ".env");
const envExamplePath = path.join(rootDir, ".env.example");

console.log("🔧 Verificando setup do projeto...");

// Se .env já existe, não faz nada
if (fs.existsSync(envPath)) {
  console.log("✅ Arquivo .env encontrado. Setup completo!");
  process.exit(0);
}

// Se .env.example não existe, erro
if (!fs.existsSync(envExamplePath)) {
  console.error("❌ Erro: arquivo .env.example não encontrado!");
  process.exit(1);
}

// Copia .env.example para .env
try {
  const envExample = fs.readFileSync(envExamplePath, "utf-8");
  fs.writeFileSync(envPath, envExample, "utf-8");
  console.log("✅ Arquivo .env criado com sucesso!");
  console.log("📝 Edite .env com suas credenciais se necessário.");
} catch (error) {
  console.error("❌ Erro ao criar .env:", error.message);
  process.exit(1);
}
