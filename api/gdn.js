const express = require('express');
const router  = express.Router();
const fs      = require('fs');
const path    = require('path');

const DB = path.join(__dirname, '..', 'Database', 'Companies');

const gdnDir   = cid => path.join(DB, cid, 'GDN');
const entryDir = (cid, id) => path.join(gdnDir(cid), String(id));
const gdnFile  = (cid, id) => path.join(entryDir(cid, id), `${id}.json`);
const ctrFile  = cid => path.join(gdnDir(cid), 'counter.json');

const ensureDir = d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); };
const readJSON  = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const writeJSON = (f, d) => fs.writeFileSync(f, JSON.stringify(d, null, 2));

function nextSeq(cid) {
  ensureDir(gdnDir(cid));
  const cf = ctrFile(cid);
  const c  = readJSON(cf) || { seq: 600000 };
  c.seq += 1;
  writeJSON(cf, c);
  return c.seq;
}

const getFY = () => {
  const n = new Date(); const m = n.getMonth() + 1; const y = n.getFullYear();
  const s = m >= 4 ? y : y - 1;
  return `${String(s).slice(2)}-${String(s + 1).slice(2)}`;
};
const makeGdnNo = seq => `GDN/${getFY()}/${String(seq - 600000).padStart(4, '0')}`;

function listAll(cid) {
  const dir = gdnDir(cid);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => /^\d+$/.test(f))
    .map(f => readJSON(gdnFile(cid, f)))
    .filter(Boolean)
    .sort((a, b) => b.gdnId - a.gdnId);
}

router.get('/', (req, res) => {
  const { companyId } = req.query;
  if (!companyId) return res.status(400).json({ error: 'companyId required' });
  res.json(listAll(companyId));
});

router.get('/:gdnId', (req, res) => {
  const { companyId } = req.query;
  if (!companyId) return res.status(400).json({ error: 'companyId required' });
  const gdn = readJSON(gdnFile(companyId, req.params.gdnId));
  if (!gdn) return res.status(404).json({ error: 'GDN not found' });
  res.json(gdn);
});

router.post('/', (req, res) => {
  const { companyId, ...data } = req.body;
  if (!companyId) return res.status(400).json({ error: 'companyId required' });
  const gdnId = nextSeq(companyId);
  const gdnNo = makeGdnNo(gdnId);
  const gdn = { gdnId, gdnNo, ...data, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  ensureDir(entryDir(companyId, gdnId));
  writeJSON(gdnFile(companyId, gdnId), gdn);
  res.json(gdn);
});

router.put('/:gdnId', (req, res) => {
  const { companyId, ...data } = req.body;
  if (!companyId) return res.status(400).json({ error: 'companyId required' });
  const file = gdnFile(companyId, req.params.gdnId);
  const existing = readJSON(file);
  if (!existing) return res.status(404).json({ error: 'GDN not found' });
  writeJSON(file, { ...existing, ...data, updatedAt: new Date().toISOString() });
  res.json({ success: true });
});

router.delete('/:gdnId', (req, res) => {
  const { companyId } = req.query;
  if (!companyId) return res.status(400).json({ error: 'companyId required' });
  const dir = entryDir(companyId, req.params.gdnId);
  if (!fs.existsSync(dir)) return res.status(404).json({ error: 'GDN not found' });
  fs.rmSync(dir, { recursive: true, force: true });
  res.json({ success: true });
});

module.exports = router;
