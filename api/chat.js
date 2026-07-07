const express = require('express');
const path    = require('path');
const fs      = require('fs');
const multer  = require('multer');
const { ROOT } = require('./helpers');

const router = express.Router();

/* ── Storage helpers ── */
const chatDir  = (cid) => path.join(ROOT, 'Database', 'Companies', cid, 'Chat');
const filesDir = (cid) => path.join(ROOT, 'Database', 'Companies', cid, 'ChatFiles');
const convFile = (cid, uid1, uid2) => {
  const key = [uid1, uid2].sort().join('_');
  return path.join(chatDir(cid), `${key}.json`);
};

const readConv = (cid, uid1, uid2) => {
  const f = convFile(cid, uid1, uid2);
  if (!fs.existsSync(f)) return [];
  try { return JSON.parse(fs.readFileSync(f, 'utf-8')); } catch { return []; }
};

const writeConv = (cid, uid1, uid2, msgs) => {
  const dir = chatDir(cid);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(convFile(cid, uid1, uid2), JSON.stringify(msgs, null, 2));
};

/* ── File upload (20 MB limit) ── */
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, _f, cb) => {
      const dir = filesDir(req.body.companyId || req.query.companyId || '');
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (_req, file, cb) => {
      const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
      cb(null, `${Date.now()}-${safe}`);
    },
  }),
  limits: { fileSize: 20 * 1024 * 1024 },
});

/* ── GET /api/chat/messages?companyId=&fromUserId=&toUserId= ── */
router.get('/messages', (req, res) => {
  const { companyId, fromUserId, toUserId } = req.query;
  if (!companyId || !fromUserId || !toUserId) return res.status(400).json({ error: 'Missing params' });
  const msgs = readConv(companyId, fromUserId, toUserId);
  // Mark all messages to fromUserId (viewer) as read
  let changed = false;
  msgs.forEach(m => { if (m.toUserId === fromUserId && !m.read) { m.read = true; changed = true; } });
  if (changed) writeConv(companyId, fromUserId, toUserId, msgs);
  res.json(msgs);
});

/* ── POST /api/chat/messages — send a text message ── */
router.post('/messages', (req, res) => {
  const { companyId, fromUserId, toUserId, text } = req.body;
  if (!companyId || !fromUserId || !toUserId) return res.status(400).json({ error: 'Missing params' });
  const msgs = readConv(companyId, fromUserId, toUserId);
  const msg = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2,7)}`,
    fromUserId, toUserId, companyId,
    text: text || '',
    file: null,
    timestamp: new Date().toISOString(),
    read: false,
  };
  msgs.push(msg);
  writeConv(companyId, fromUserId, toUserId, msgs);
  res.json(msg);
});

/* ── POST /api/chat/upload — upload a file attachment ── */
router.post('/upload', upload.single('file'), (req, res) => {
  const { companyId, fromUserId, toUserId } = req.body;
  if (!companyId || !fromUserId || !toUserId || !req.file) return res.status(400).json({ error: 'Missing params or file' });
  const msgs = readConv(companyId, fromUserId, toUserId);
  const msg = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2,7)}`,
    fromUserId, toUserId, companyId,
    text: '',
    file: {
      name: req.file.originalname,
      storedAs: req.file.filename,
      size: req.file.size,
      mime: req.file.mimetype,
    },
    timestamp: new Date().toISOString(),
    read: false,
  };
  msgs.push(msg);
  writeConv(companyId, fromUserId, toUserId, msgs);
  res.json(msg);
});

/* ── GET /api/chat/file/:companyId/:filename ── serve file ── */
router.get('/file/:companyId/:filename', (req, res) => {
  const fp = path.join(filesDir(req.params.companyId), req.params.filename);
  if (!fs.existsSync(fp)) return res.status(404).json({ error: 'File not found' });
  res.sendFile(path.resolve(fp));
});

/* ── GET /api/chat/unread?companyId=&userId= — count unread per sender ── */
router.get('/unread', (req, res) => {
  const { companyId, userId } = req.query;
  if (!companyId || !userId) return res.status(400).json({ error: 'Missing params' });
  const dir = chatDir(companyId);
  if (!fs.existsSync(dir)) return res.json({});
  const counts = {};
  fs.readdirSync(dir).forEach(f => {
    if (!f.endsWith('.json')) return;
    const msgs = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8') || '[]');
    msgs.forEach(m => {
      if (m.toUserId === userId && !m.read) {
        counts[m.fromUserId] = (counts[m.fromUserId] || 0) + 1;
      }
    });
  });
  res.json(counts);
});

module.exports = router;
