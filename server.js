const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const express = require("express");
const session = require("express-session");
const { DatabaseSync } = require("node:sqlite");

loadEnv();

const app = express();
const port = Number(process.env.PORT || 5174);
const adminPasswordSeed = process.env.ADMIN_PASSWORD || "admin123";
const sessionSecret = process.env.SESSION_SECRET || "solo-social-dev-secret";

const dataDir = path.join(__dirname, "data");
const dbPath = path.join(dataDir, "letheris.db");
ensureDataDir(dataDir);
const db = new DatabaseSync(dbPath);

initializeSchema();
ensureAdminCredentials();

app.use(express.json());
app.use(
  session({
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      maxAge: 1000 * 60 * 60 * 24 * 7
    }
  })
);

app.get("/api/session", (req, res) => {
  res.json({ loggedIn: Boolean(req.session?.isAdmin) });
});

app.get("/api/public/account", (req, res) => {
  const account = getPublicAccountFromSession(req);
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

app.post("/api/public/register", (req, res) => {
  const existing = getPublicAccountFromSession(req);
  if (existing) {
    return res.status(409).json({ error: "Esta sessão já possui uma conta criada." });
  }

  const { name, handle } = req.body || {};
  const cleanName = (name || "").trim();
  const cleanHandle = (handle || "").trim().replace(/^@+/, "").toLowerCase();

  if (!cleanName || !cleanHandle) {
    return res.status(400).json({ error: "Nome e @usuario são obrigatórios." });
  }

  const handleExists = db.prepare("SELECT 1 FROM profiles WHERE handle = ?").get(cleanHandle);
  if (handleExists) {
    return res.status(409).json({ error: "@usuario já existe." });
  }

  const profileId = cryptoRandomId();
  const accountId = cryptoRandomId();

  const transaction = wrapTransaction(() => {
    db.prepare("INSERT INTO profiles (id, name, handle, bio, is_public) VALUES (?, ?, ?, '', 1)")
      .run(profileId, cleanName, cleanHandle);
    db.prepare("INSERT INTO public_accounts (id, profile_id) VALUES (?, ?)")
      .run(accountId, profileId);
  });

  transaction();
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

app.post("/api/login", (req, res) => {
  const { password } = req.body || {};
  if (!password || !verifyAdminPassword(password)) {
    return res.status(401).json({ error: "Senha inválida." });
  }

  req.session.isAdmin = true;
  res.json({ ok: true });
});

app.post("/api/admin/password", requireAuth, (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  const cleanCurrent = (currentPassword || "").trim();
  const cleanNext = (newPassword || "").trim();

  if (!cleanCurrent || !cleanNext) {
    return res.status(400).json({ error: "Informe senha atual e nova senha." });
  }

  if (!verifyAdminPassword(cleanCurrent)) {
    return res.status(401).json({ error: "Senha atual inválida." });
  }

  if (!isValidNewPassword(cleanNext)) {
    return res.status(400).json({ error: "A nova senha deve ter ao menos 6 caracteres." });
  }

  const nextHash = hashPassword(cleanNext);
  db.prepare("UPDATE admin_config SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1")
    .run(nextHash);

  res.json({ ok: true });
});

app.post("/api/logout", requireAuth, (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("connect.sid");
    res.json({ ok: true });
  });
});

app.get("/api/profiles", requireAuth, (req, res) => {
  const profiles = db
    .prepare("SELECT id, name, handle, bio, created_at FROM profiles WHERE is_public = 0 ORDER BY created_at DESC")
    .all();
  res.json(profiles);
});

app.post("/api/profiles", requireAuth, (req, res) => {
  const { name, handle, bio } = req.body || {};
  const cleanName = (name || "").trim();
  const cleanHandle = (handle || "").trim().replace(/^@+/, "").toLowerCase();
  const cleanBio = (bio || "").trim();

  if (!cleanName || !cleanHandle) {
    return res.status(400).json({ error: "Nome e usuário são obrigatórios." });
  }

  const exists = db.prepare("SELECT 1 FROM profiles WHERE handle = ?").get(cleanHandle);
  if (exists) {
    return res.status(409).json({ error: "@usuario já existe." });
  }

  const id = cryptoRandomId();
  db.prepare(
    "INSERT INTO profiles (id, name, handle, bio, is_public) VALUES (?, ?, ?, ?, 0)"
  ).run(id, cleanName, cleanHandle, cleanBio);

  const profile = db.prepare("SELECT id, name, handle, bio, created_at FROM profiles WHERE id = ?").get(id);
  res.status(201).json(profile);
});

app.put("/api/profiles/:id", requireAuth, (req, res) => {
  const { id } = req.params;
  const { name, handle, bio } = req.body || {};
  const cleanName = (name || "").trim();
  const cleanHandle = (handle || "").trim().replace(/^@+/, "").toLowerCase();
  const cleanBio = (bio || "").trim();

  if (!cleanName || !cleanHandle) {
    return res.status(400).json({ error: "Nome e usuário são obrigatórios." });
  }

  const current = db.prepare("SELECT id FROM profiles WHERE id = ? AND is_public = 0").get(id);
  if (!current) {
    return res.status(404).json({ error: "Perfil não encontrado." });
  }

  const conflict = db
    .prepare("SELECT id FROM profiles WHERE handle = ? AND id <> ?")
    .get(cleanHandle, id);
  if (conflict) {
    return res.status(409).json({ error: "@usuario já existe." });
  }

  db.prepare("UPDATE profiles SET name = ?, handle = ?, bio = ? WHERE id = ?").run(
    cleanName,
    cleanHandle,
    cleanBio,
    id
  );

  const profile = db.prepare("SELECT id, name, handle, bio, created_at FROM profiles WHERE id = ?").get(id);
  res.json(profile);
});

app.delete("/api/profiles/:id", requireAuth, (req, res) => {
  const { id } = req.params;

  const profile = db.prepare("SELECT id FROM profiles WHERE id = ? AND is_public = 0").get(id);
  if (!profile) {
    return res.status(404).json({ error: "Perfil não encontrado." });
  }

  const transaction = wrapTransaction((profileId) => {
    db.prepare("DELETE FROM replies WHERE profile_id = ?").run(profileId);
    db.prepare("DELETE FROM replies WHERE post_id IN (SELECT id FROM posts WHERE profile_id = ?)").run(profileId);
    db.prepare("DELETE FROM posts WHERE profile_id = ?").run(profileId);
    db.prepare("DELETE FROM profiles WHERE id = ?").run(profileId);
  });

  transaction(id);
  res.json({ ok: true });
});

app.get("/api/posts", requireAuth, (req, res) => {
  const profileId = (req.query.profileId || "").toString().trim();
  res.json(getPostsWithReplies(profileId));
});

app.get("/api/public/posts", (req, res) => {
  res.json(getPostsWithReplies());
});

app.post("/api/public/posts", requirePublicAccount, (req, res) => {
  const { content } = req.body || {};
  const cleanContent = (content || "").trim();
  if (!cleanContent) {
    return res.status(400).json({ error: "Conteúdo é obrigatório." });
  }

  const lastPost = db
    .prepare("SELECT created_at FROM posts WHERE profile_id = ? ORDER BY created_at DESC LIMIT 1")
    .get(req.publicAccount.profile_id);

  const waitForPost = getRateLimitInfo(lastPost?.created_at, 30);
  if (!waitForPost.allowed) {
    return res.status(429).json({
      error: `Você pode criar 1 post original a cada 30 minutos. Aguarde ${waitForPost.remainingMinutes} min.`
    });
  }

  const postId = cryptoRandomId();
  const createdAt = getBrasiliaIsoTimestamp();
  db.prepare("INSERT INTO posts (id, profile_id, content, created_at) VALUES (?, ?, ?, ?)")
    .run(postId, req.publicAccount.profile_id, cleanContent, createdAt);

  res.status(201).json({ ok: true, id: postId });
});

app.post("/api/public/posts/:id/replies", requirePublicAccount, (req, res) => {
  const { id } = req.params;
  const { content } = req.body || {};
  const cleanContent = (content || "").trim();

  if (!cleanContent) {
    return res.status(400).json({ error: "Conteúdo é obrigatório." });
  }

  const post = db.prepare("SELECT id FROM posts WHERE id = ?").get(id);
  if (!post) {
    return res.status(404).json({ error: "Post não encontrado." });
  }

  const lastReply = db
    .prepare("SELECT created_at FROM replies WHERE post_id = ? AND profile_id = ? ORDER BY created_at DESC LIMIT 1")
    .get(id, req.publicAccount.profile_id);

  const waitForReply = getRateLimitInfo(lastReply?.created_at, 30);
  if (!waitForReply.allowed) {
    return res.status(429).json({
      error: `Você pode responder este post apenas 1 vez a cada 30 minutos. Aguarde ${waitForReply.remainingMinutes} min.`
    });
  }

  const replyId = cryptoRandomId();
  const createdAt = getBrasiliaIsoTimestamp();
  db.prepare("INSERT INTO replies (id, post_id, profile_id, content, created_at) VALUES (?, ?, ?, ?, ?)")
    .run(replyId, id, req.publicAccount.profile_id, cleanContent, createdAt);

  res.status(201).json({ ok: true, id: replyId });
});

app.post("/api/posts", requireAuth, (req, res) => {
  const { profileId, content } = req.body || {};
  const cleanContent = (content || "").trim();
  if (!profileId || !cleanContent) {
    return res.status(400).json({ error: "Perfil e conteúdo são obrigatórios." });
  }

  const profile = db.prepare("SELECT id FROM profiles WHERE id = ?").get(profileId);
  if (!profile) {
    return res.status(404).json({ error: "Perfil não encontrado." });
  }

  const id = cryptoRandomId();
  const createdAt = getBrasiliaIsoTimestamp();
  db.prepare("INSERT INTO posts (id, profile_id, content, created_at) VALUES (?, ?, ?, ?)")
    .run(id, profileId, cleanContent, createdAt);
  res.status(201).json({ ok: true, id });
});

app.delete("/api/posts/:id", requireAuth, (req, res) => {
  const { id } = req.params;

  const post = db.prepare("SELECT id FROM posts WHERE id = ?").get(id);
  if (!post) {
    return res.status(404).json({ error: "Post não encontrado." });
  }

  const transaction = wrapTransaction((postId) => {
    db.prepare("DELETE FROM replies WHERE post_id = ?").run(postId);
    db.prepare("DELETE FROM posts WHERE id = ?").run(postId);
  });

  transaction(id);
  res.json({ ok: true });
});

app.post("/api/posts/:id/replies", requireAuth, (req, res) => {
  const { id } = req.params;
  const { profileId, content } = req.body || {};
  const cleanContent = (content || "").trim();

  if (!profileId || !cleanContent) {
    return res.status(400).json({ error: "Perfil e conteúdo são obrigatórios." });
  }

  const post = db.prepare("SELECT id FROM posts WHERE id = ?").get(id);
  if (!post) {
    return res.status(404).json({ error: "Post não encontrado." });
  }

  const profile = db.prepare("SELECT id FROM profiles WHERE id = ?").get(profileId);
  if (!profile) {
    return res.status(404).json({ error: "Perfil não encontrado." });
  }

  const replyId = cryptoRandomId();
  const createdAt = getBrasiliaIsoTimestamp();
  db.prepare("INSERT INTO replies (id, post_id, profile_id, content, created_at) VALUES (?, ?, ?, ?, ?)").run(
    replyId,
    id,
    profileId,
    cleanContent,
    createdAt
  );

  res.status(201).json({ ok: true, id: replyId });
});

app.delete("/api/replies/:id", requireAuth, (req, res) => {
  const { id } = req.params;
  const reply = db.prepare("SELECT id FROM replies WHERE id = ?").get(id);
  if (!reply) {
    return res.status(404).json({ error: "Resposta não encontrada." });
  }

  db.prepare("DELETE FROM replies WHERE id = ?").run(id);
  res.json({ ok: true });
});

app.use(express.static(__dirname));

app.listen(port, () => {
  console.log(`Letheris rodando em http://localhost:${port}`);
});

function requireAuth(req, res, next) {
  if (!req.session?.isAdmin) {
    return res.status(401).json({ error: "Não autorizado." });
  }
  next();
}

function requirePublicAccount(req, res, next) {
  const account = getPublicAccountFromSession(req);
  if (!account) {
    return res.status(401).json({ error: "Crie sua conta de usuário para interagir." });
  }
  req.publicAccount = account;
  next();
}

function initializeSchema() {
  db.exec(`
    PRAGMA journal_mode = WAL;

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
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (profile_id) REFERENCES profiles(id)
    );

    CREATE TABLE IF NOT EXISTS replies (
      id TEXT PRIMARY KEY,
      post_id TEXT NOT NULL,
      profile_id TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (post_id) REFERENCES posts(id),
      FOREIGN KEY (profile_id) REFERENCES profiles(id)
    );

    CREATE TABLE IF NOT EXISTS admin_config (
      id INTEGER PRIMARY KEY CHECK(id = 1),
      password_hash TEXT NOT NULL,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS public_accounts (
      id TEXT PRIMARY KEY,
      profile_id TEXT NOT NULL UNIQUE,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (profile_id) REFERENCES profiles(id)
    );
  `);

  ensureProfilesMigration();
}

function ensureAdminCredentials() {
  const existing = db.prepare("SELECT id FROM admin_config WHERE id = 1").get();
  if (existing) {
    return;
  }

  const hash = hashPassword(adminPasswordSeed);
  db.prepare("INSERT INTO admin_config (id, password_hash) VALUES (1, ?)").run(hash);
}

function verifyAdminPassword(password) {
  const row = db.prepare("SELECT password_hash FROM admin_config WHERE id = 1").get();
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

function wrapTransaction(fn) {
  return (...args) => {
    db.exec("BEGIN");
    try {
      fn(...args);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  };
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

function getPostsWithReplies(profileId = "") {
  const cleanProfileId = (profileId || "").toString().trim();

  const postRows = cleanProfileId
    ? db
        .prepare(
          `SELECT p.id, p.content, p.created_at,
                  pr.id AS author_id, pr.name AS author_name, pr.handle AS author_handle
           FROM posts p
           JOIN profiles pr ON pr.id = p.profile_id
           WHERE p.profile_id = ?
           ORDER BY p.created_at DESC`
        )
        .all(cleanProfileId)
    : db
        .prepare(
          `SELECT p.id, p.content, p.created_at,
                  pr.id AS author_id, pr.name AS author_name, pr.handle AS author_handle
           FROM posts p
           JOIN profiles pr ON pr.id = p.profile_id
           ORDER BY p.created_at DESC`
        )
        .all();

  const replyRows = db
    .prepare(
      `SELECT r.id, r.post_id, r.content, r.created_at,
              pr.id AS author_id, pr.name AS author_name, pr.handle AS author_handle
       FROM replies r
       JOIN profiles pr ON pr.id = r.profile_id
       ORDER BY r.created_at DESC`
    )
    .all();

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

function getPublicAccountFromSession(req) {
  const accountId = (req.session?.publicAccountId || "").trim();
  if (!accountId) {
    return null;
  }

  return db
    .prepare(
      `SELECT pa.id, pa.profile_id, p.name, p.handle
       FROM public_accounts pa
       JOIN profiles p ON p.id = pa.profile_id
       WHERE pa.id = ? AND p.is_public = 1`
    )
    .get(accountId);
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

function ensureProfilesMigration() {
  const columns = db.prepare("PRAGMA table_info(profiles)").all();
  const hasIsPublic = columns.some((column) => column.name === "is_public");
  if (!hasIsPublic) {
    db.exec("ALTER TABLE profiles ADD COLUMN is_public INTEGER NOT NULL DEFAULT 0");
  }
}

function ensureDataDir(targetDir) {
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
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
