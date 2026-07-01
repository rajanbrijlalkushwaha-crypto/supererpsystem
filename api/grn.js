const express = require('express');
const router  = express.Router();
const fs      = require('fs');
const path    = require('path');

const DB = path.join(__dirname, '..', 'Database', 'Companies');

const grnDir   = cid => path.join(DB, cid, 'GRN');
const entryDir = (cid, id) => path.join(grnDir(cid), String(id));
const grnFile  = (cid, id) => path.join(entryDir(cid, id), `${id}.json`);
const ctrFile  = cid => path.join(grnDir(cid), 'counter.json');

const ensureDir = d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); };
const readJSON  = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const writeJSON = (f, d) => fs.writeFileSync(f, JSON.stringify(d, null, 2));

function nextSeq(cid) {
  ensureDir(grnDir(cid));
  const cf = ctrFile(cid);
  const c  = readJSON(cf) || { seq: 500000 };
  c.seq += 1;
  writeJSON(cf, c);
  return c.seq;
}

const getFY = () => {
  const n = new Date(); const m = n.getMonth() + 1; const y = n.getFullYear();
  const s = m >= 4 ? y : y - 1;
  return `${String(s).slice(2)}-${String(s + 1).slice(2)}`;
};
const makeGrnNo = seq => `GRN/${getFY()}/${String(seq - 500000).padStart(4, '0')}`;

function listAll(cid) {
  const dir = grnDir(cid);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => /^\d+$/.test(f))
    .map(f => readJSON(grnFile(cid, f)))
    .filter(Boolean)
    .sort((a, b) => b.grnId - a.grnId);
}

router.get('/', (req, res) => {
  const { companyId } = req.query;
  if (!companyId) return res.status(400).json({ error: 'companyId required' });
  res.json(listAll(companyId));
});

router.get('/:grnId', (req, res) => {
  const { companyId } = req.query;
  if (!companyId) return res.status(400).json({ error: 'companyId required' });
  const grn = readJSON(grnFile(companyId, req.params.grnId));
  if (!grn) return res.status(404).json({ error: 'GRN not found' });
  res.json(grn);
});

router.post('/', (req, res) => {
  const { companyId, ...data } = req.body;
  if (!companyId) return res.status(400).json({ error: 'companyId required' });
  const grnId = nextSeq(companyId);
  const grnNo = makeGrnNo(grnId);
  const grn = { grnId, grnNo, ...data, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  ensureDir(entryDir(companyId, grnId));
  writeJSON(grnFile(companyId, grnId), grn);
  res.json(grn);
});

router.put('/:grnId', (req, res) => {
  const { companyId, ...data } = req.body;
  if (!companyId) return res.status(400).json({ error: 'companyId required' });
  const file = grnFile(companyId, req.params.grnId);
  const existing = readJSON(file);
  if (!existing) return res.status(404).json({ error: 'GRN not found' });
  writeJSON(file, { ...existing, ...data, updatedAt: new Date().toISOString() });
  res.json({ success: true });
});

router.delete('/:grnId', (req, res) => {
  const { companyId } = req.query;
  if (!companyId) return res.status(400).json({ error: 'companyId required' });
  const dir = entryDir(companyId, req.params.grnId);
  if (!fs.existsSync(dir)) return res.status(404).json({ error: 'GRN not found' });
  fs.rmSync(dir, { recursive: true, force: true });
  res.json({ success: true });
});

module.exports = router;
