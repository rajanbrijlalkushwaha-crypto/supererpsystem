const express = require('express');
const path    = require('path');
const fs      = require('fs');
const multer  = require('multer');
const { ROOT } = require('./helpers');

const router = express.Router();

const cid = req => req.query.companyId || req.body?.companyId;

const docsDir = (companyId) =>
  path.join(ROOT, 'Database', 'Companies', companyId, 'FinancialDocs');

const indexFile = (companyId) =>
  path.join(docsDir(companyId), 'index.json');

const readIndex = (companyId) => {
  const f = indexFile(companyId);
  if (!fs.existsSync(f)) return [];
  try { return JSON.parse(fs.readFileSync(f, 'utf-8')); } catch { return []; }
};

const writeIndex = (companyId, docs) => {
  const dir = docsDir(companyId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(indexFile(companyId), JSON.stringify(docs, null, 2));
};

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const dir = docsDir(cid(req) || '');
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
  }),
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf') cb(null, true);
    else cb(new Error('Only PDF files are allowed'));
  },
});

// GET /api/financial-docs?companyId=
router.get('/', (req, res) => {
  try {
    const companyId = cid(req);
    if (!companyId) return res.status(400).json({ error: 'companyId required' });
    res.json(readIndex(companyId));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/financial-docs — upload multiple PDFs
// Body fields: companyId, fy, docName
// Files: files[] (multiple PDFs)
router.post('/', upload.array('files', 20), (req, res) => {
  try {
    const companyId = cid(req);
    if (!companyId) return res.status(400).json({ error: 'companyId required' });

    const { fy = '', docName = '' } = req.body;
    const docs = readIndex(companyId);

    const newDocs = (req.files || []).map(f => ({
      id:        `${Date.now()}-${Math.random().toString(36).slice(2,7)}`,
      fy,
      docName,
      fileName:  f.originalname,
      storedAs:  f.filename,
      size:      f.size,
      createdAt: new Date().toISOString(),
    }));

    docs.push(...newDocs);
    writeIndex(companyId, docs);
    res.json(newDocs);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/financial-docs/:docId/view?companyId= — serve PDF inline in browser
router.get('/:docId/view', (req, res) => {
  try {
    const companyId = cid(req);
    if (!companyId) return res.status(400).json({ error: 'companyId required' });
    const docs = readIndex(companyId);
    const doc  = docs.find(d => d.id === req.params.docId);
    if (!doc) return res.status(404).json({ error: 'Document not found' });
    const filePath = path.resolve(path.join(docsDir(companyId), doc.storedAs));
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found on disk' });
    const stat = fs.statSync(filePath);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${doc.fileName}"`);
    res.setHeader('Content-Length', stat.size);
    res.setHeader('Cache-Control', 'no-cache');
    fs.createReadStream(filePath).pipe(res);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/financial-docs/:docId/download?companyId=
router.get('/:docId/download', (req, res) => {
  try {
    const companyId = cid(req);
    if (!companyId) return res.status(400).json({ error: 'companyId required' });

    const docs = readIndex(companyId);
    const doc  = docs.find(d => d.id === req.params.docId);
    if (!doc) return res.status(404).json({ error: 'Document not found' });

    const filePath = path.join(docsDir(companyId), doc.storedAs);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found on disk' });
    res.download(filePath, doc.fileName);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/financial-docs/:docId?companyId=
router.delete('/:docId', (req, res) => {
  try {
    const companyId = cid(req);
    if (!companyId) return res.status(400).json({ error: 'companyId required' });

    const docs = readIndex(companyId);
    const idx  = docs.findIndex(d => d.id === req.params.docId);
    if (idx === -1) return res.status(404).json({ error: 'Document not found' });

    const [doc] = docs.splice(idx, 1);
    writeIndex(companyId, docs);

    // Remove file from disk (best-effort)
    try {
      const filePath = path.join(docsDir(companyId), doc.storedAs);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch {}

    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
