const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { Pool } = require("pg");

loadEnv();

const nextPassword = (process.argv[2] || "").trim();

if (!nextPassword || nextPassword.length < 6) {
  console.error("Informe uma senha com no mínimo 6 caracteres.");
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error("Variável DATABASE_URL não configurada.");
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

(async () => {
  const hash = hashPassword(nextPassword);
  const existing = (await pool.query("SELECT id FROM admin_config WHERE id = 1")).rows[0];

  if (existing) {
    await pool.query("UPDATE admin_config SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = 1", [hash]);
  } else {
    await pool.query("INSERT INTO admin_config (id, password_hash) VALUES (1, $1)", [hash]);
  }

  console.log("Senha de admin atualizada com sucesso.");
  await pool.end();
})().catch(err => {
  console.error("Erro:", err.message);
  process.exit(1);
});

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = crypto.scryptSync(password, salt, 64).toString("hex");
  return `scrypt:${salt}:${derived}`;
}

function loadEnv() {
  const envPath = path.join(__dirname, "..", ".env");
  if (!fs.existsSync(envPath)) return;
  const raw = fs.readFileSync(envPath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const sep = trimmed.indexOf("=");
    if (sep <= 0) continue;
    const key = trimmed.slice(0, sep).trim();
    const value = trimmed.slice(sep + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}
