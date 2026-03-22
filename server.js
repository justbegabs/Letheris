const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const express = require("express");
const session = require("express-session");
const { Pool } = require("pg");

loadEnv();

const app = express();
const port = Number(process.env.PORT || 5174);
const adminPasswordSeed = "admin123";
const sessionSecret = normalizeEnvValue(process.env.SESSION_SECRET) || "solo-social-dev-secret";
const allowedOrigins = parseAllowedOrigins(process.env.ALLOWED_ORIGIN || process.env.ALLOWED_ORIGINS);
const isProduction = process.env.NODE_ENV === "production";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

(async () => {
  await initializeSchema();
  await ensureAdminCredentials();
  app.listen(port, () => {
    console.log(`Letheris rodando em http://localhost:${port}`);
  });
})().catch(err => {
  console.error("Erro ao inicializar banco:", err.message);
  process.exit(1);
});

app.use(express.json());

if (isProduction) {
  app.set("trust proxy", 1);
}

// CORS - permitir requisições do frontend local e do GitHub Pages
app.use((req, res, next) => {
  const origin = typeof req.headers.origin === "string" ? req.headers.origin : "";
  const requestedHeaders =
    typeof req.headers["access-control-request-headers"] === "string"
      ? req.headers["access-control-request-headers"]
      : "Content-Type, Authorization";

  if (!origin || isAllowedOrigin(origin)) {
    res.header("Access-Control-Allow-Origin", origin || "http://localhost:5174");
    res.header("Access-Control-Allow-Credentials", "true");
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.header("Access-Control-Allow-Headers", requestedHeaders);
    res.header("Access-Control-Max-Age", "86400");
    res.header("Vary", "Origin");
  }

  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }

  next();
});

app.use(
  session({
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: isProduction ? "none" : "lax",
      secure: isProduction,
      maxAge: 1000 * 60 * 60 * 24 * 7
    }
  })
);

app.get("/api/session", (req, res) => {
  res.json({ loggedIn: Boolean(req.session?.isAdmin) });
});

app.get("/api/public/account", async (req, res) => {
  const account = await getPublicAccountFromSession(req);
  if (!account) {
    return res.json({ account: null });
  }
  res.json({
    account: {
      id: account.id,
      profile: {
        id: account.profile_id,
        name: account.name,
        handle: account.handle
      }
    }
  });
});

app.post("/api/public/register", async (req, res) => {
  const existing = await getPublicAccountFromSession(req);
  if (existing) {
    return res.status(409).json({ error: "Esta sessão já possui uma conta criada." });
  }

  const { name, handle } = req.body || {};
  const cleanName = (name || "").trim();
  const cleanHandle = (handle || "").trim().replace(/^@+/, "").toLowerCase();

  if (!cleanName || !cleanHandle) {
    return res.status(400).json({ error: "Nome e @usuario são obrigatórios." });
  }

  const handleExists = (await pool.query("SELECT 1 FROM profiles WHERE handle = $1", [cleanHandle])).rows[0];
  if (handleExists) {
    return res.status(409).json({ error: "@usuario já existe." });
  }

  const profileId = cryptoRandomId();
  const accountId = cryptoRandomId();

  await withTransaction(async (client) => {
    await client.query("INSERT INTO profiles (id, name, handle, bio, is_public) VALUES ($1, $2, $3, '', 1)", [profileId, cleanName, cleanHandle]);
    await client.query("INSERT INTO public_accounts (id, profile_id) VALUES ($1, $2)", [accountId, profileId]);
  });

  req.session.publicAccountId = accountId;

  res.status(201).json({
    ok: true,
    account: {
      id: accountId,
      profile: {
        id: profileId,
        name: cleanName,
        handle: cleanHandle
      }
    }
  });
});

app.post("/api/public/logout", (req, res) => {
  req.session.publicAccountId = "";
  res.json({ ok: true });
});

app.post("/api/login", async (req, res) => {
  const { password } = req.body || {};
  if (!password || !await verifyAdminPassword(password)) {
    return res.status(401).json({ error: "Senha inválida." });
  }

  req.session.isAdmin = true;
  res.json({ ok: true });
});

app.post("/api/admin/password", requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  const cleanCurrent = (currentPassword || "").trim();
  const cleanNext = (newPassword || "").trim();

  if (!cleanCurrent || !cleanNext) {
    return res.status(400).json({ error: "Informe senha atual e nova senha." });
  }

  if (!await verifyAdminPassword(cleanCurrent)) {
    return res.status(401).json({ error: "Senha atual inválida." });
  }

  if (!isValidNewPassword(cleanNext)) {
    return res.status(400).json({ error: "A nova senha deve ter ao menos 6 caracteres." });
  }

  const nextHash = hashPassword(cleanNext);
  await pool.query("UPDATE admin_config SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = 1", [nextHash]);

  res.json({ ok: true });
});

app.post("/api/logout", requireAuth, (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("connect.sid");
    res.json({ ok: true });
  });
});

app.get("/api/profiles", requireAuth, async (req, res) => {
  const profiles = (await pool.query(
    "SELECT id, name, handle, bio, created_at FROM profiles WHERE is_public = 0 ORDER BY created_at DESC"
  )).rows;
  res.json(profiles);
});

app.post("/api/profiles", requireAuth, async (req, res) => {
  const { name, handle, bio } = req.body || {};
  const cleanName = (name || "").trim();
  const cleanHandle = (handle || "").trim().replace(/^@+/, "").toLowerCase();
  const cleanBio = (bio || "").trim();

  if (!cleanName || !cleanHandle) {
    return res.status(400).json({ error: "Nome e usuário são obrigatórios." });
  }

  const exists = (await pool.query("SELECT 1 FROM profiles WHERE handle = $1", [cleanHandle])).rows[0];
  if (exists) {
    return res.status(409).json({ error: "@usuario já existe." });
  }

  const id = cryptoRandomId();
  await pool.query(
    "INSERT INTO profiles (id, name, handle, bio, is_public) VALUES ($1, $2, $3, $4, 0)",
    [id, cleanName, cleanHandle, cleanBio]
  );

  const profile = (await pool.query("SELECT id, name, handle, bio, created_at FROM profiles WHERE id = $1", [id])).rows[0];
  res.status(201).json(profile);
});

app.put("/api/profiles/:id", requireAuth, async (req, res) => {
  const { id } = req.params;
  const { name, handle, bio } = req.body || {};
  const cleanName = (name || "").trim();
  const cleanHandle = (handle || "").trim().replace(/^@+/, "").toLowerCase();
  const cleanBio = (bio || "").trim();

  if (!cleanName || !cleanHandle) {
    return res.status(400).json({ error: "Nome e usuário são obrigatórios." });
  }

  const current = (await pool.query("SELECT id FROM profiles WHERE id = $1 AND is_public = 0", [id])).rows[0];
  if (!current) {
    return res.status(404).json({ error: "Perfil não encontrado." });
  }

  const conflict = (await pool.query("SELECT id FROM profiles WHERE handle = $1 AND id <> $2", [cleanHandle, id])).rows[0];
  if (conflict) {
    return res.status(409).json({ error: "@usuario já existe." });
  }

  await pool.query(
    "UPDATE profiles SET name = $1, handle = $2, bio = $3 WHERE id = $4",
    [cleanName, cleanHandle, cleanBio, id]
  );

  const profile = (await pool.query("SELECT id, name, handle, bio, created_at FROM profiles WHERE id = $1", [id])).rows[0];
  res.json(profile);
});

app.delete("/api/profiles/:id", requireAuth, async (req, res) => {
  const { id } = req.params;

  const profile = (await pool.query("SELECT id FROM profiles WHERE id = $1 AND is_public = 0", [id])).rows[0];
  if (!profile) {
    return res.status(404).json({ error: "Perfil não encontrado." });
  }

  await withTransaction(async (client) => {
    await client.query("DELETE FROM replies WHERE profile_id = $1", [id]);
    await client.query("DELETE FROM replies WHERE post_id IN (SELECT id FROM posts WHERE profile_id = $1)", [id]);
    await client.query("DELETE FROM posts WHERE profile_id = $1", [id]);
    await client.query("DELETE FROM profiles WHERE id = $1", [id]);
  });

  res.json({ ok: true });
});

app.get("/api/posts", requireAuth, async (req, res) => {
  const profileId = (req.query.profileId || "").toString().trim();
  res.json(await getPostsWithReplies(profileId));
});

app.get("/api/public/posts", async (req, res) => {
  res.json(await getPostsWithReplies());
});

app.post("/api/public/posts", requirePublicAccount, async (req, res) => {
  const { content } = req.body || {};
  const cleanContent = (content || "").trim();
  if (!cleanContent) {
    return res.status(400).json({ error: "Conteúdo é obrigatório." });
  }

  const lastPost = (await pool.query(
    "SELECT created_at FROM posts WHERE profile_id = $1 ORDER BY created_at DESC LIMIT 1",
    [req.publicAccount.profile_id]
  )).rows[0];

  const waitForPost = getRateLimitInfo(lastPost?.created_at, 30);
  if (!waitForPost.allowed) {
    return res.status(429).json({
      error: `Você pode criar 1 post original a cada 30 minutos. Aguarde ${waitForPost.remainingMinutes} min.`
    });
  }

  const postId = cryptoRandomId();
  const createdAt = getBrasiliaIsoTimestamp();
  await pool.query(
    "INSERT INTO posts (id, profile_id, content, created_at) VALUES ($1, $2, $3, $4)",
    [postId, req.publicAccount.profile_id, cleanContent, createdAt]
  );

  res.status(201).json({ ok: true, id: postId });
});

app.post("/api/public/posts/:id/replies", requirePublicAccount, async (req, res) => {
  const { id } = req.params;
  const { content } = req.body || {};
  const cleanContent = (content || "").trim();

  if (!cleanContent) {
    return res.status(400).json({ error: "Conteúdo é obrigatório." });
  }

  const post = (await pool.query("SELECT id FROM posts WHERE id = $1", [id])).rows[0];
  if (!post) {
    return res.status(404).json({ error: "Post não encontrado." });
  }

  const lastReply = (await pool.query(
    "SELECT created_at FROM replies WHERE post_id = $1 AND profile_id = $2 ORDER BY created_at DESC LIMIT 1",
    [id, req.publicAccount.profile_id]
  )).rows[0];

  const waitForReply = getRateLimitInfo(lastReply?.created_at, 30);
  if (!waitForReply.allowed) {
    return res.status(429).json({
      error: `Você pode responder este post apenas 1 vez a cada 30 minutos. Aguarde ${waitForReply.remainingMinutes} min.`
    });
  }

  const replyId = cryptoRandomId();
  const createdAt = getBrasiliaIsoTimestamp();
  await pool.query(
    "INSERT INTO replies (id, post_id, profile_id, content, created_at) VALUES ($1, $2, $3, $4, $5)",
    [replyId, id, req.publicAccount.profile_id, cleanContent, createdAt]
  );

  res.status(201).json({ ok: true, id: replyId });
});

app.post("/api/posts", requireAuth, async (req, res) => {
  const { profileId, content } = req.body || {};
  const cleanContent = (content || "").trim();
  if (!profileId || !cleanContent) {
    return res.status(400).json({ error: "Perfil e conteúdo são obrigatórios." });
  }

  const profile = (await pool.query("SELECT id FROM profiles WHERE id = $1", [profileId])).rows[0];
  if (!profile) {
    return res.status(404).json({ error: "Perfil não encontrado." });
  }

  const id = cryptoRandomId();
  const createdAt = getBrasiliaIsoTimestamp();
  await pool.query(
    "INSERT INTO posts (id, profile_id, content, created_at) VALUES ($1, $2, $3, $4)",
    [id, profileId, cleanContent, createdAt]
  );
  res.status(201).json({ ok: true, id });
});

app.delete("/api/posts/:id", requireAuth, async (req, res) => {
  const { id } = req.params;

  const post = (await pool.query("SELECT id FROM posts WHERE id = $1", [id])).rows[0];
  if (!post) {
    return res.status(404).json({ error: "Post não encontrado." });
  }

  await withTransaction(async (client) => {
    await client.query("DELETE FROM replies WHERE post_id = $1", [id]);
    await client.query("DELETE FROM posts WHERE id = $1", [id]);
  });

  res.json({ ok: true });
});

app.post("/api/posts/:id/replies", requireAuth, async (req, res) => {
  const { id } = req.params;
  const { profileId, content } = req.body || {};
  const cleanContent = (content || "").trim();

  if (!profileId || !cleanContent) {
    return res.status(400).json({ error: "Perfil e conteúdo são obrigatórios." });
  }

  const post = (await pool.query("SELECT id FROM posts WHERE id = $1", [id])).rows[0];
  if (!post) {
    return res.status(404).json({ error: "Post não encontrado." });
  }

  const profile = (await pool.query("SELECT id FROM profiles WHERE id = $1", [profileId])).rows[0];
  if (!profile) {
    return res.status(404).json({ error: "Perfil não encontrado." });
  }

  const replyId = cryptoRandomId();
  const createdAt = getBrasiliaIsoTimestamp();
  await pool.query(
    "INSERT INTO replies (id, post_id, profile_id, content, created_at) VALUES ($1, $2, $3, $4, $5)",
    [replyId, id, profileId, cleanContent, createdAt]
  );

  res.status(201).json({ ok: true, id: replyId });
});

app.delete("/api/replies/:id", requireAuth, async (req, res) => {
  const { id } = req.params;
  const reply = (await pool.query("SELECT id FROM replies WHERE id = $1", [id])).rows[0];
  if (!reply) {
    return res.status(404).json({ error: "Resposta não encontrada." });
  }

  await pool.query("DELETE FROM replies WHERE id = $1", [id]);
  res.json({ ok: true });
});

app.use(express.static(__dirname));

function requireAuth(req, res, next) {
  if (!req.session?.isAdmin) {
    return res.status(401).json({ error: "Não autorizado." });
  }
  next();
}

function requirePublicAccount(req, res, next) {
  getPublicAccountFromSession(req).then(account => {
    if (!account) {
      return res.status(401).json({ error: "Crie sua conta de usuário para interagir." });
    }
    req.publicAccount = account;
    next();
  }).catch(next);
}

async function initializeSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS profiles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      handle TEXT NOT NULL UNIQUE,
      bio TEXT DEFAULT '',
      is_public INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS posts (
      id TEXT PRIMARY KEY,
      profile_id TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS replies (
      id TEXT PRIMARY KEY,
      post_id TEXT NOT NULL,
      profile_id TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS admin_config (
      id INTEGER PRIMARY KEY,
      password_hash TEXT NOT NULL,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS public_accounts (
      id TEXT PRIMARY KEY,
      profile_id TEXT NOT NULL UNIQUE,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await ensureProfilesMigration();
}

async function ensureAdminCredentials() {
  const existing = (await pool.query("SELECT id FROM admin_config WHERE id = 1")).rows[0];
  if (existing && await verifyAdminPassword(adminPasswordSeed)) {
    return;
  }

  const hash = hashPassword(adminPasswordSeed);

  if (existing) {
    await pool.query("UPDATE admin_config SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = 1", [hash]);
    console.log("Senha de admin sincronizada no startup para o valor definido no código.");
    return;
  }

  await pool.query("INSERT INTO admin_config (id, password_hash) VALUES (1, $1)", [hash]);
}

async function verifyAdminPassword(password) {
  const row = (await pool.query("SELECT password_hash FROM admin_config WHERE id = 1")).rows[0];
  if (!row?.password_hash) {
    return false;
  }
  return verifyPassword(password, row.password_hash);
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = crypto.scryptSync(password, salt, 64).toString("hex");
  return `scrypt:${salt}:${derived}`;
}

function verifyPassword(password, storedHash) {
  if (!storedHash || typeof storedHash !== "string") {
    return false;
  }

  const [algorithm, salt, stored] = storedHash.split(":");
  if (algorithm !== "scrypt" || !salt || !stored) {
    return false;
  }

  const candidate = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(stored, "hex");
  if (candidate.length !== expected.length) {
    return false;
  }
  return crypto.timingSafeEqual(candidate, expected);
}

function isValidNewPassword(password) {
  return password.length >= 6;
}

function getBrasiliaIsoTimestamp() {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });

  const parts = formatter.formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}:${values.second}-03:00`;
}

async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await fn(client);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

function mapRowToEntry(row) {
  return {
    id: row.id,
    content: row.content,
    createdAt: row.created_at,
    author: {
      id: row.author_id,
      name: row.author_name,
      handle: row.author_handle
    }
  };
}

async function getPostsWithReplies(profileId = "") {
  const cleanProfileId = (profileId || "").toString().trim();

  const postRows = cleanProfileId
    ? (await pool.query(
        `SELECT p.id, p.content, p.created_at,
                pr.id AS author_id, pr.name AS author_name, pr.handle AS author_handle
         FROM posts p
         JOIN profiles pr ON pr.id = p.profile_id
         WHERE p.profile_id = $1
         ORDER BY p.created_at DESC`,
        [cleanProfileId]
      )).rows
    : (await pool.query(
        `SELECT p.id, p.content, p.created_at,
                pr.id AS author_id, pr.name AS author_name, pr.handle AS author_handle
         FROM posts p
         JOIN profiles pr ON pr.id = p.profile_id
         ORDER BY p.created_at DESC`
      )).rows;

  const replyRows = (await pool.query(
    `SELECT r.id, r.post_id, r.content, r.created_at,
            pr.id AS author_id, pr.name AS author_name, pr.handle AS author_handle
     FROM replies r
     JOIN profiles pr ON pr.id = r.profile_id
     ORDER BY r.created_at DESC`
  )).rows;

  const repliesByPost = new Map();
  for (const row of replyRows) {
    const list = repliesByPost.get(row.post_id) || [];
    list.push(mapRowToEntry(row));
    repliesByPost.set(row.post_id, list);
  }

  return postRows.map((row) => ({
    ...mapRowToEntry(row),
    replies: repliesByPost.get(row.id) || []
  }));
}

async function getPublicAccountFromSession(req) {
  const accountId = (req.session?.publicAccountId || "").trim();
  if (!accountId) {
    return null;
  }

  const result = await pool.query(
    `SELECT pa.id, pa.profile_id, p.name, p.handle
     FROM public_accounts pa
     JOIN profiles p ON p.id = pa.profile_id
     WHERE pa.id = $1 AND p.is_public = 1`,
    [accountId]
  );
  return result.rows[0] || null;
}

function getRateLimitInfo(lastCreatedAt, limitMinutes) {
  if (!lastCreatedAt) {
    return { allowed: true, remainingMinutes: 0 };
  }

  const lastDate = parseStoredDate(lastCreatedAt);
  if (!lastDate) {
    return { allowed: true, remainingMinutes: 0 };
  }

  const diffMs = Date.now() - lastDate.getTime();
  const limitMs = limitMinutes * 60 * 1000;
  if (diffMs >= limitMs) {
    return { allowed: true, remainingMinutes: 0 };
  }

  const remainingMinutes = Math.ceil((limitMs - diffMs) / (60 * 1000));
  return { allowed: false, remainingMinutes };
}

function parseStoredDate(value) {
  if (!value || typeof value !== "string") {
    return null;
  }

  if (value.includes("T")) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const normalized = value.replace(" ", "T") + "-03:00";
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

async function ensureProfilesMigration() {
  const result = await pool.query(
    "SELECT column_name FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'is_public'"
  );
  if (result.rows.length === 0) {
    await pool.query("ALTER TABLE profiles ADD COLUMN is_public INTEGER NOT NULL DEFAULT 0");
  }
}

function cryptoRandomId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function loadEnv() {
  const envPath = path.join(__dirname, ".env");
  if (!fs.existsSync(envPath)) return;

  const raw = fs.readFileSync(envPath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex <= 0) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function parseAllowedOrigins(rawValue) {
  if (!rawValue || typeof rawValue !== "string") {
    return [];
  }

  return rawValue
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((origin) => origin.replace(/\/+$/, ""));
}

function normalizeEnvValue(rawValue) {
  if (typeof rawValue !== "string") {
    return "";
  }

  const trimmed = rawValue.trim();
  if (!trimmed) {
    return "";
  }

  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }

  return trimmed;
}

function isAllowedOrigin(origin) {
  const normalizedOrigin = origin.replace(/\/+$/, "");
  if (normalizedOrigin === "http://localhost:3000" || normalizedOrigin === "http://localhost:5174") {
    return true;
  }

  if (allowedOrigins.includes(normalizedOrigin)) {
    return true;
  }

  try {
    const host = new URL(normalizedOrigin).hostname;
    return host.endsWith(".github.io");
  } catch {
    return false;
  }
}
