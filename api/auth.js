const express  = require('express');
const crypto   = require('crypto');
const path     = require('path');
const fs       = require('fs');
const { ROOT } = require('./helpers');

const router     = express.Router();
const USERS_FILE = path.join(ROOT, 'Database', 'users.json');

// In-memory session store  { token → { userId, username, name, role, expiresAt } }
const SESSIONS = new Map();

/* ── helpers ──────────────────────────────────── */
const hashPwd = pwd => crypto.createHash('sha256').update(pwd + 'epsilon-erp-salt-2024').digest('hex');

const ensureUsers = () => {
  if (!fs.existsSync(USERS_FILE)) {
    fs.mkdirSync(path.dirname(USERS_FILE), { recursive: true });
    const defaults = [
      {
        id: 1, username: 'admin', password: hashPwd('admin123'),
        name: 'Administrator', role: 'admin',
        email: 'admin@epsilon.com', active: true,
        createdAt: new Date().toISOString(),
      },
    ];
    fs.writeFileSync(USERS_FILE, JSON.stringify(defaults, null, 2));
    return defaults;
  }
  try { return JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8')); }
  catch { return []; }
};

const saveUsers = users =>
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));

const tokenFromHeader = req =>
  (req.headers.authorization || '').replace(/^Bearer\s+/, '').trim();

/* ── POST /api/auth/login ─────────────────────── */
router.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password)
    return res.status(400).json({ error: 'Username and password are required.' });

  const users = ensureUsers();
  const user  = users.find(
    u => (u.username === username.trim() || u.email === username.trim()) && u.active !== false
  );

  if (!user || user.password !== hashPwd(password))
    return res.status(401).json({ error: 'Invalid username or password.' });

  const token     = crypto.randomBytes(32).toString('hex');
  const expiresAt = Date.now() + 8 * 60 * 60 * 1000; // 8 hours
  SESSIONS.set(token, { userId: user.id, username: user.username, name: user.name, role: user.role, expiresAt });

  res.json({
    token,
    user: { id: user.id, username: user.username, name: user.name, role: user.role, email: user.email },
  });
});

/* ── POST /api/auth/logout ────────────────────── */
router.post('/logout', (req, res) => {
  SESSIONS.delete(tokenFromHeader(req));
  res.json({ success: true });
});

/* ── GET /api/auth/me ─────────────────────────── */
router.get('/me', (req, res) => {
  const token   = tokenFromHeader(req);
  const session = SESSIONS.get(token);
  if (!session || session.expiresAt < Date.now()) {
    SESSIONS.delete(token);
    return res.status(401).json({ error: 'Session expired. Please log in again.' });
  }
  // Extend session on activity
  session.expiresAt = Date.now() + 8 * 60 * 60 * 1000;
  res.json({ userId: session.userId, username: session.username, name: session.name, role: session.role });
});

/* ── GET /api/auth/users ──────────────────────── */
router.get('/users', (req, res) => {
  const users = ensureUsers().map(({ password, ...rest }) => rest);
  res.json(users);
});

/* ── POST /api/auth/users ─────────────────────── */
router.post('/users', (req, res) => {
  const { username, password, name, role, email } = req.body || {};
  if (!username || !password || !name)
    return res.status(400).json({ error: 'username, password and name are required.' });

  const users = ensureUsers();
  if (users.find(u => u.username === username))
    return res.status(409).json({ error: 'Username already exists.' });

  const newUser = {
    id: Date.now(), username, password: hashPwd(password),
    name, role: role || 'user', email: email || '', active: true,
    createdAt: new Date().toISOString(),
  };
  users.push(newUser);
  saveUsers(users);

  const { password: _, ...safe } = newUser;
  res.json({ success: true, user: safe });
});

/* ── PUT /api/auth/users/:id/password ────────── */
router.put('/users/:id/password', (req, res) => {
  const { password } = req.body || {};
  if (!password) return res.status(400).json({ error: 'password is required.' });

  const users = ensureUsers();
  const idx   = users.findIndex(u => u.id == req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'User not found.' });

  users[idx].password = hashPwd(password);
  saveUsers(users);
  res.json({ success: true });
});

/* ── DELETE /api/auth/users/:id ──────────────── */
router.delete('/users/:id', (req, res) => {
  const users  = ensureUsers();
  const idx    = users.findIndex(u => u.id == req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'User not found.' });
  if (users[idx].role === 'admin' && users.filter(u => u.role === 'admin').length === 1)
    return res.status(400).json({ error: 'Cannot delete the last admin.' });

  users.splice(idx, 1);
  saveUsers(users);
  res.json({ success: true });
});

/* ── Email Config ──────────────────────────────── */
const EMAIL_CFG_FILE = path.join(ROOT, 'Database', 'email-config.json');

router.get('/email-config', (_req, res) => {
  try {
    const cfg = fs.existsSync(EMAIL_CFG_FILE) ? JSON.parse(fs.readFileSync(EMAIL_CFG_FILE, 'utf8')) : {};
    // Never return the password to the client
    const { password: _, ...safe } = cfg;
    res.json({ ...safe, hasPassword: !!cfg.password });
  } catch { res.json({}); }
});

router.post('/email-config', (req, res) => {
  try {
    const existing = fs.existsSync(EMAIL_CFG_FILE) ? JSON.parse(fs.readFileSync(EMAIL_CFG_FILE, 'utf8')) : {};
    const { password, ...rest } = req.body;
    const cfg = { ...existing, ...rest };
    if (password) cfg.password = password; // only update password if provided
    fs.mkdirSync(path.dirname(EMAIL_CFG_FILE), { recursive: true });
    fs.writeFileSync(EMAIL_CFG_FILE, JSON.stringify(cfg, null, 2));
    const { password: _, ...safe } = cfg;
    res.json({ success: true, config: { ...safe, hasPassword: !!cfg.password } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/email-config/test', async (req, res) => {
  try {
    const cfg = fs.existsSync(EMAIL_CFG_FILE) ? JSON.parse(fs.readFileSync(EMAIL_CFG_FILE, 'utf8')) : {};
    if (!cfg.email || !cfg.password) return res.status(400).json({ error: 'Email config not saved yet.' });
    const nodemailer = require('nodemailer');
    const transport = nodemailer.createTransport({
      service: cfg.service || 'gmail',
      host: cfg.host || undefined,
      port: cfg.port ? Number(cfg.port) : undefined,
      auth: { user: cfg.email, pass: cfg.password },
    });
    await transport.verify();
    res.json({ success: true, message: 'Connection successful! Email is configured correctly.' });
  } catch (e) { res.status(500).json({ error: 'Connection failed: ' + e.message }); }
});

module.exports = { router, SESSIONS };
