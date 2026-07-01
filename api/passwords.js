const express = require('express');
const router  = express.Router();
const path    = require('path');
const fs      = require('fs');
const { exec } = require('child_process');

const ROOT = path.join(__dirname, '..');
const dir  = cid => path.join(ROOT, 'Database', 'Companies', cid, 'Passwords');
const file = cid => path.join(dir(cid), 'passwords.json');

const read  = cid => {
  try {
    if (!fs.existsSync(file(cid))) return [];
    return JSON.parse(fs.readFileSync(file(cid), 'utf8')) || [];
  } catch { return []; }
};
const write = (cid, data) => {
  fs.mkdirSync(dir(cid), { recursive: true });
  fs.writeFileSync(file(cid), JSON.stringify(data, null, 2));
};

/* ─────────────────────────────────────────────────────────
   CLIENT-SIDE AUTO-LOGIN
   Returns credentials to the calling browser so IT opens
   the tab — not the server. Works from any PC on the network.
───────────────────────────────────────────────────────── */

/* GET /api/passwords/:id/credentials — returns {url,username,password,siteName} */
router.get('/:id/credentials', (req, res) => {
  const { companyId } = req.query;
  if (!companyId) return res.status(400).json({ error: 'companyId required' });
  const passwords = read(companyId);
  const entry = passwords.find(p => p.id === req.params.id);
  if (!entry) return res.status(404).json({ error: 'Entry not found' });
  if (!entry.url) return res.status(400).json({ error: 'No login URL saved for this entry' });
  const url = entry.url.startsWith('http') ? entry.url : 'https://' + entry.url;
  res.json({ ok: true, url, username: entry.username || '', password: entry.password || '', siteName: entry.siteName || '' });
});

/* ─────────────────────────────────────────────────────────
   BROWSER LAUNCH — opens URL in chosen browser on this machine
   body: { url, browser: 'chrome'|'edge'|'firefox'|'default' }
───────────────────────────────────────────────────────── */
router.post('/launch-browser', (req, res) => {
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
   CRUD + AUTOFILL (unchanged)
───────────────────────────────────────────────────────── */

router.get('/autofill', (req, res) => {
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

router.get('/', (req, res) => {
  const { companyId } = req.query;
  if (!companyId) return res.status(400).json({ error: 'companyId required' });
  res.json(read(companyId));
});

router.post('/', (req, res) => {
  const { companyId } = req.query;
  if (!companyId) return res.status(400).json({ error: 'companyId required' });
  const passwords = read(companyId);
  const entry = { id: Date.now().toString(), ...req.body,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  passwords.push(entry);
  write(companyId, passwords);
  res.json(entry);
});

router.put('/:id', (req, res) => {
  const { companyId } = req.query;
  if (!companyId) return res.status(400).json({ error: 'companyId required' });
  const passwords = read(companyId);
  const idx = passwords.findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  passwords[idx] = { ...passwords[idx], ...req.body, updatedAt: new Date().toISOString() };
  write(companyId, passwords);
  res.json(passwords[idx]);
});

router.delete('/:id', (req, res) => {
  const { companyId } = req.query;
  if (!companyId) return res.status(400).json({ error: 'companyId required' });
  const filtered = read(companyId).filter(p => p.id !== req.params.id);
  write(companyId, filtered);
  res.json({ ok: true });
});

module.exports = router;
