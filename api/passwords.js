const express = require('express');
const router  = express.Router();
const path    = require('path');
const fs      = require('fs');
const crypto  = require('crypto');
const { exec } = require('child_process');
const { resolveUser } = require('./helpers');

const ROOT = path.join(__dirname, '..');
const dir  = cid => path.join(ROOT, 'Database', 'Companies', cid, 'Passwords');
const file = cid => path.join(dir(cid), 'passwords.json');

/* ─────────────────────────────────────────────────────────
   ENCRYPTION AT REST — AES-256-GCM.
   The key lives in .secrets/passwords.key (outside Database/, not in git).
   It is made on first use. KEEP A COPY OF THIS FILE: without it the saved
   passwords cannot be read again (e.g. after moving the server).
   Stored form: "enc:v1:<base64 iv|tag|ciphertext>". Old plain-text entries
   are encrypted the first time the file is read.
───────────────────────────────────────────────────────── */
const KEY_FILE = path.join(ROOT, '.secrets', 'passwords.key');
let KEY = null;
function key() {
  if (KEY) return KEY;
  if (process.env.ERP_PASSWORD_KEY && /^[0-9a-f]{64}$/i.test(process.env.ERP_PASSWORD_KEY)) return (KEY = Buffer.from(process.env.ERP_PASSWORD_KEY, 'hex'));
  if (!fs.existsSync(KEY_FILE)) {
    fs.mkdirSync(path.dirname(KEY_FILE), { recursive: true });
    fs.writeFileSync(KEY_FILE, crypto.randomBytes(32).toString('hex'), { mode: 0o600, flag: 'wx' });
  }
  const hex = fs.readFileSync(KEY_FILE, 'utf8').trim();
  if (!/^[0-9a-f]{64}$/i.test(hex)) throw new Error('Password key file is damaged');
  return (KEY = Buffer.from(hex, 'hex'));
}
const PREFIX = 'enc:v1:';
const isEnc = v => typeof v === 'string' && v.startsWith(PREFIX);
function enc(plain) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const ct = Buffer.concat([c.update(String(plain ?? ''), 'utf8'), c.final()]);
  return PREFIX + Buffer.concat([iv, c.getAuthTag(), ct]).toString('base64');
}
function dec(v) {
  if (!isEnc(v)) return v == null ? '' : String(v);
  const raw = Buffer.from(v.slice(PREFIX.length), 'base64');
  const d = crypto.createDecipheriv('aes-256-gcm', key(), raw.subarray(0, 12));
  d.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString('utf8');
}

/* file → entries with plain passwords (in memory only) */
const read = cid => {
  let list;
  try {
    if (!fs.existsSync(file(cid))) return [];
    list = JSON.parse(fs.readFileSync(file(cid), 'utf8')) || [];
  } catch { return []; }
  if (list.some(p => p.password && !isEnc(p.password))) write(cid, list.map(p => ({ ...p, password: dec(p.password) })));   // one-time: encrypt old plain entries
  return list.map(p => {
    // wrong key / damaged value: shown as unreadable, and the stored value is kept untouched on the next save
    try { return { ...p, password: dec(p.password) }; } catch { return { ...p, password: '', unreadable: true, _enc: p.password }; }
  });
};
/* entries → file with encrypted passwords (written to a temp file first, then swapped in) */
const write = (cid, data) => {
  fs.mkdirSync(dir(cid), { recursive: true });
  const out = data.map(({ unreadable, _enc, ...p }) => ({ ...p, password: unreadable && _enc && !p.password ? _enc : isEnc(p.password) ? p.password : enc(p.password) }));
  const tmp = file(cid) + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(out, null, 2));
  fs.renameSync(tmp, file(cid));
};

/* ─────────────────────────────────────────────────────────
   ACCESS — a logged-in user with the Password Manager permission
   (same rule as the screens: admin = all; no permissions set = all but approve).
───────────────────────────────────────────────────────── */
const USERS_FILE = path.join(ROOT, 'Database', 'users.json');
function allowed(sess, action) {
  if (sess.role === 'admin') return true;
  let u = null;
  try { u = (JSON.parse(fs.readFileSync(USERS_FILE, 'utf8')) || []).find(x => x.id === sess.id); } catch { /* no users file */ }
  const perms = u ? u.permissions : undefined;
  if (perms == null) return true;
  return !!(perms.passwords && perms.passwords[action]);
}
const guard = action => (req, res, next) => {
  const sess = resolveUser(req);
  if (!sess) return res.status(401).json({ error: 'Please log in again.' });
  if (!allowed(sess, action)) return res.status(403).json({ error: 'You do not have access to the Password Manager.' });
  req.pmUser = sess;
  next();
};
const by = req => ({ id: req.pmUser.id, name: req.pmUser.name || req.pmUser.username });

/* ─────────────────────────────────────────────────────────
   CLIENT-SIDE AUTO-LOGIN
   Returns credentials to the calling browser so IT opens
   the tab — not the server. Works from any PC on the network.
───────────────────────────────────────────────────────── */

/* GET /api/passwords/:id/credentials — returns {url,username,password,siteName} */
router.get('/:id/credentials', guard('view'), (req, res) => {
  const { companyId } = req.query;
  if (!companyId) return res.status(400).json({ error: 'companyId required' });
  const passwords = read(companyId);
  const entry = passwords.find(p => p.id === req.params.id);
  if (!entry) return res.status(404).json({ error: 'Entry not found' });
  if (!entry.url && !req.query.any) return res.status(400).json({ error: 'No login URL saved for this entry' });
  const url = !entry.url ? '' : entry.url.startsWith('http') ? entry.url : 'https://' + entry.url;
  res.json({ ok: true, url, username: entry.username || '', password: entry.password || '', siteName: entry.siteName || '' });
});

/* ─────────────────────────────────────────────────────────
   BROWSER LAUNCH — opens URL in chosen browser on this machine
   body: { url, browser: 'chrome'|'edge'|'firefox'|'default' }
───────────────────────────────────────────────────────── */
router.post('/launch-browser', guard('view'), (req, res) => {
  const { url, browser = 'default' } = req.body;
  if (!url) return res.status(400).json({ error: 'url required' });
  const safeUrl = url.replace(/"/g, '').replace(/'/g, '');
  let cmd;
  if      (browser === 'chrome')  cmd = `start chrome "${safeUrl}"`;
  else if (browser === 'edge')    cmd = `start msedge "${safeUrl}"`;
  else if (browser === 'firefox') cmd = `start firefox "${safeUrl}"`;
  else                            cmd = `start "" "${safeUrl}"`;
  exec(cmd, err => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ ok: true });
  });
});

/* ─────────────────────────────────────────────────────────
   CRUD + AUTOFILL
───────────────────────────────────────────────────────── */

router.get('/autofill', guard('view'), (req, res) => {
  const { companyId, url } = req.query;
  if (!companyId || !url) return res.json(null);
  const passwords = read(companyId);
  let targetHost;
  try { targetHost = new URL(url).hostname.replace(/^www\./, ''); } catch { return res.json(null); }

  const match = passwords.find(p => {
    if (!p.url) return false;
    try {
      const raw = p.url.startsWith('http') ? p.url : 'https://' + p.url;
      const pHost = new URL(raw).hostname.replace(/^www\./, '');
      return targetHost === pHost || targetHost.endsWith('.' + pHost) || pHost.endsWith('.' + targetHost);
    } catch { return false; }
  });

  res.json(match ? { username: match.username, password: match.password, siteName: match.siteName } : null);
});

/* list — ?masked=1 leaves the passwords out (the Beta screen asks for one only when it is shown / copied) */
router.get('/', guard('view'), (req, res) => {
  const { companyId } = req.query;
  if (!companyId) return res.status(400).json({ error: 'companyId required' });
  const list = read(companyId).map(({ _enc, ...p }) => p);
  res.json(req.query.masked ? list.map(({ password, ...p }) => ({ ...p, hasPassword: !!password })) : list);
});

router.post('/', guard('create'), (req, res) => {
  const { companyId } = req.query;
  if (!companyId) return res.status(400).json({ error: 'companyId required' });
  const passwords = read(companyId);
  const entry = { id: Date.now().toString(), ...req.body,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), createdBy: by(req) };
  passwords.push(entry);
  write(companyId, passwords);
  res.json(entry);
});

router.put('/:id', guard('edit'), (req, res) => {
  const { companyId } = req.query;
  if (!companyId) return res.status(400).json({ error: 'companyId required' });
  const passwords = read(companyId);
  const idx = passwords.findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  const body = { ...req.body };
  if (body.password === undefined || body.password === null) delete body.password;   // a form may leave the password untouched
  passwords[idx] = { ...passwords[idx], ...body, id: passwords[idx].id, updatedAt: new Date().toISOString(), updatedBy: by(req) };
  write(companyId, passwords);
  res.json(passwords[idx]);
});

router.delete('/:id', guard('delete'), (req, res) => {
  const { companyId } = req.query;
  if (!companyId) return res.status(400).json({ error: 'companyId required' });
  const filtered = read(companyId).filter(p => p.id !== req.params.id);
  write(companyId, filtered);
  res.json({ ok: true });
});

/* for the E-Way Helper (server side only): the first readable login whose URL contains host */
/* the first saved login whose URL passes test(url) */
router.findLoginBy = (cid, test) => read(cid).find(p => !p.unreadable && p.password && test(String(p.url || '').toLowerCase())) || null;
router.findLogin = (cid, host) => read(cid).find(p => !p.unreadable && p.password && String(p.url || '').toLowerCase().includes(String(host).toLowerCase())) || null;

module.exports = router;
