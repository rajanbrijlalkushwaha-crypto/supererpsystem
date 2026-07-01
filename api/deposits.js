const express = require('express');
const path    = require('path');
const fs      = require('fs');
const multer  = require('multer');
const { ROOT } = require('./helpers');

const router = express.Router();
const cid = req => req.query.companyId || req.body?.companyId || '';

const depDir = (companyId) =>
  path.join(ROOT, 'Database', 'Companies', companyId, 'Deposits');

const readAll = (dir) => {
  if (!fs.existsSync(dir)) return [];
  const results = [];
  fs.readdirSync(dir, { withFileTypes: true }).forEach(e => {
    if (e.isDirectory()) {
      const sub = path.join(dir, e.name);
      fs.readdirSync(sub).filter(f => f.endsWith('.json')).forEach(f => {
        try { results.push(JSON.parse(fs.readFileSync(path.join(sub, f), 'utf-8'))); } catch {}
      });
    }
  });
  return results.filter(Boolean);
};

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const dir = path.join(depDir(req.query.companyId || ''), req.params.depositId, 'docs');
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
  }),
  limits: { fileSize: 20 * 1024 * 1024 },
});

// GET all
router.get('/', (req, res) => {
  try { res.json(readAll(depDir(cid(req)))); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// GET next letter ref serial — MUST be before /:depositId to avoid mis-match
router.get('/letter-serial/:letterType', (req, res) => {
  try {
    const co  = cid(req);
    const all = readAll(depDir(co));
    const lt  = req.params.letterType;
    const fy  = req.query.fy || '';
    let count = 0;
    all.forEach(d => {
      const ref = d.letterRefs?.[lt] || '';
      if (ref && fy && ref.includes(fy)) count++;
    });
    res.json({ next: count + 1 });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET single
router.get('/:depositId', (req, res) => {
  try {
    const file = path.join(depDir(cid(req)), req.params.depositId, `${req.params.depositId}.json`);
    if (!fs.existsSync(file)) return res.status(404).json({ error: 'Not found' });
    res.json(JSON.parse(fs.readFileSync(file, 'utf-8')));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST create
router.post('/', (req, res) => {
  try {
    const companyId = cid(req);
    const dir = depDir(companyId);
    const existing = readAll(dir);
    const lastNum = existing.length > 0
      ? Math.max(...existing.map(d => parseInt((d.depositId||'').replace(/\D/g,''))||0))
      : 0;
    const depositId = `DEP${String(lastNum + 1).padStart(6, '0')}`;
    const deposit = { ...req.body, depositId, companyId, createdAt: new Date().toISOString() };
    const dDir = path.join(dir, depositId);
    fs.mkdirSync(dDir, { recursive: true });
    fs.writeFileSync(path.join(dDir, `${depositId}.json`), JSON.stringify(deposit, null, 2));
    res.json(deposit);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT update
router.put('/:depositId', (req, res) => {
  try {
    const file = path.join(depDir(cid(req)), req.params.depositId, `${req.params.depositId}.json`);
    if (!fs.existsSync(file)) return res.status(404).json({ error: 'Not found' });
    const existing = JSON.parse(fs.readFileSync(file, 'utf-8'));
    const updated = { ...existing, ...req.body, depositId: req.params.depositId, updatedAt: new Date().toISOString() };
    fs.writeFileSync(file, JSON.stringify(updated, null, 2));
    res.json(updated);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST upload BG PDF
router.post('/:depositId/upload', upload.single('file'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const companyId = req.query.companyId || '';
    const jsonFile = path.join(depDir(companyId), req.params.depositId, `${req.params.depositId}.json`);
    if (fs.existsSync(jsonFile)) {
      const dep = JSON.parse(fs.readFileSync(jsonFile, 'utf-8'));
      dep.pdfFiles = [...(dep.pdfFiles || []), { name: req.file.originalname, file: req.file.filename, uploadedAt: new Date().toISOString() }];
      fs.writeFileSync(jsonFile, JSON.stringify(dep, null, 2));
    }
    res.json({ filename: req.file.filename, originalname: req.file.originalname });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET download PDF
router.get('/:depositId/docs/:filename', (req, res) => {
  try {
    const file = path.join(depDir(cid(req)), req.params.depositId, 'docs', req.params.filename);
    if (!fs.existsSync(file)) return res.status(404).json({ error: 'Not found' });
    res.download(file);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT approve (pending → active)
router.put('/:depositId/approve', (req, res) => {
  try {
    const file = path.join(depDir(cid(req)), req.params.depositId, `${req.params.depositId}.json`);
    if (!fs.existsSync(file)) return res.status(404).json({ error: 'Not found' });
    const dep = JSON.parse(fs.readFileSync(file, 'utf-8'));
    dep.status = 'active';
    dep.approvedAt = new Date().toISOString();
    dep.approvedBy = req.body?.approvedBy || 'Admin';
    dep.updatedAt  = new Date().toISOString();
    fs.writeFileSync(file, JSON.stringify(dep, null, 2));
    res.json(dep);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT unreleased (released → active — undo release)
router.put('/:depositId/unreleased', (req, res) => {
  try {
    const file = path.join(depDir(cid(req)), req.params.depositId, `${req.params.depositId}.json`);
    if (!fs.existsSync(file)) return res.status(404).json({ error: 'Not found' });
    const dep = JSON.parse(fs.readFileSync(file, 'utf-8'));
    dep.status      = 'active';
    dep.releasedAt  = null;
    dep.unreleasedAt = new Date().toISOString();
    dep.updatedAt   = new Date().toISOString();
    fs.writeFileSync(file, JSON.stringify(dep, null, 2));
    res.json(dep);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST save letter ref (stores ref number used for a letter type)
router.post('/:depositId/letter-ref', (req, res) => {
  try {
    const file = path.join(depDir(cid(req)), req.params.depositId, `${req.params.depositId}.json`);
    if (!fs.existsSync(file)) return res.status(404).json({ error: 'Not found' });
    const dep = JSON.parse(fs.readFileSync(file, 'utf-8'));
    dep.letterRefs = { ...(dep.letterRefs || {}), [req.body.letterType]: req.body.ref };
    dep.updatedAt  = new Date().toISOString();
    fs.writeFileSync(file, JSON.stringify(dep, null, 2));
    res.json({ success: true, letterRefs: dep.letterRefs });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
