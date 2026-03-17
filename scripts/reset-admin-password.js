const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { DatabaseSync } = require("node:sqlite");

const nextPassword = (process.argv[2] || "").trim();

if (!nextPassword || nextPassword.length < 6) {
  console.error("Informe uma senha com no mínimo 6 caracteres.");
  process.exit(1);
}

const dbPath = path.join(__dirname, "..", "data", "letheris.db");
if (!fs.existsSync(dbPath)) {
  console.error("Banco não encontrado. Execute o servidor ao menos uma vez antes de resetar a senha.");
  process.exit(1);
}

const db = new DatabaseSync(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS admin_config (
    id INTEGER PRIMARY KEY CHECK(id = 1),
    password_hash TEXT NOT NULL,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
`);

const hash = hashPassword(nextPassword);
const existing = db.prepare("SELECT id FROM admin_config WHERE id = 1").get();

if (existing) {
  db.prepare("UPDATE admin_config SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1")
    .run(hash);
} else {
  db.prepare("INSERT INTO admin_config (id, password_hash) VALUES (1, ?)").run(hash);
}

console.log("Senha de admin atualizada com sucesso.");

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = crypto.scryptSync(password, salt, 64).toString("hex");
  return `scrypt:${salt}:${derived}`;
}
