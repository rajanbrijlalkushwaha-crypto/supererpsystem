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
  // Mark all messages to fromUserId (viewer) as delivered + read
  let changed = false;
  msgs.forEach(m => {
    if (m.toUserId === fromUserId) {
      if (!m.delivered) { m.delivered = true; changed = true; }
      if (!m.read)      { m.read      = true; changed = true; }
    }
  });
  if (changed) writeConv(companyId, fromUserId, toUserId, msgs);
  res.json(msgs);
});

/* ── POST /api/chat/messages — send a text message ── */
router.post('/messages', (req, res) => {
  const { companyId, fromUserId, toUserId, text, replyTo, order } = req.body;
  if (!companyId || !fromUserId || !toUserId) return res.status(400).json({ error: 'Missing params' });
  const msgs = readConv(companyId, fromUserId, toUserId);
  const msg = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2,7)}`,
    fromUserId, toUserId, companyId,
    text: text || '',
    file: null,
    order: order || null,
    replyTo: replyTo || null,
    timestamp: new Date().toISOString(),
    delivered: false,
    read: false,
  };
  msgs.push(msg);
  writeConv(companyId, fromUserId, toUserId, msgs);
  res.json(msg);
});

/* ── POST /api/chat/upload — upload a file attachment (1-1 or group) ── */
router.post('/upload', upload.single('file'), (req, res) => {
  const { companyId, fromUserId, toUserId, groupId } = req.body;
  if (!companyId || !fromUserId || !req.file) return res.status(400).json({ error: 'Missing params or file' });
  let replyTo = null;
  try { replyTo = req.body.replyTo ? JSON.parse(req.body.replyTo) : null; } catch {}
  const fileInfo = { name: req.file.originalname, storedAs: req.file.filename, size: req.file.size, mime: req.file.mimetype };
  if (groupId) {
    const fp = path.join(chatDir(companyId), `grp_${groupId}.json`);
    const msgs = fs.existsSync(fp) ? JSON.parse(fs.readFileSync(fp, 'utf-8') || '[]') : [];
    const msg = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2,7)}`,
      groupId, fromUserId: String(fromUserId), companyId,
      text: '', file: fileInfo, order: null, replyTo,
      timestamp: new Date().toISOString(),
      readBy: [String(fromUserId)],
    };
    msgs.push(msg);
    fs.mkdirSync(chatDir(companyId), { recursive: true });
    fs.writeFileSync(fp, JSON.stringify(msgs, null, 2));
    return res.json(msg);
  }
  if (!toUserId) return res.status(400).json({ error: 'Missing toUserId' });
  const msgs = readConv(companyId, fromUserId, toUserId);
  const msg = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2,7)}`,
    fromUserId, toUserId, companyId,
    text: '', file: fileInfo, order: null, replyTo,
    timestamp: new Date().toISOString(),
    delivered: false, read: false,
  };
  msgs.push(msg);
  writeConv(companyId, fromUserId, toUserId, msgs);
  res.json(msg);
});

/* ── POST /api/chat/deliver — mark a message as delivered ── */
router.post('/deliver', (req, res) => {
  const { companyId, msgId, fromUserId, toUserId } = req.body;
  if (!companyId || !msgId || !fromUserId || !toUserId) return res.status(400).json({ error: 'Missing params' });
  const msgs = readConv(companyId, fromUserId, toUserId);
  const m = msgs.find(x => x.id === msgId);
  if (m && !m.delivered) { m.delivered = true; writeConv(companyId, fromUserId, toUserId, msgs); }
  res.json({ ok: true });
});

/* ── GET /api/chat/file/:companyId/:filename ── serve file ── */
router.get('/file/:companyId/:filename', (req, res) => {
  const fp = path.join(filesDir(req.params.companyId), req.params.filename);
  if (!fs.existsSync(fp)) return res.status(404).json({ error: 'File not found' });
  if (req.query.download === '1') {
    // Force browser to download
    const orig = req.query.name || req.params.filename;
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(orig)}"`);
  }
  res.sendFile(path.resolve(fp));
});

/* ── GET /api/chat/groups?companyId=&userId= ── */
router.get('/groups', (req, res) => {
  const { companyId, userId } = req.query;
  if (!companyId || !userId) return res.status(400).json({ error: 'Missing params' });
  const gf = path.join(chatDir(companyId), '_groups.json');
  if (!fs.existsSync(gf)) return res.json([]);
  try {
    const all = JSON.parse(fs.readFileSync(gf, 'utf-8') || '[]');
    res.json(all.filter(g => g.members.includes(String(userId))));
  } catch { res.json([]); }
});

/* ── POST /api/chat/groups — create group ── */
router.post('/groups', (req, res) => {
  const { companyId, name, members, createdBy } = req.body;
  if (!companyId || !name || !members) return res.status(400).json({ error: 'Missing params' });
  const dir = chatDir(companyId);
  fs.mkdirSync(dir, { recursive: true });
  const gf = path.join(dir, '_groups.json');
  const all = fs.existsSync(gf) ? JSON.parse(fs.readFileSync(gf, 'utf-8') || '[]') : [];
  const group = {
    id: `grp-${Date.now()}-${Math.random().toString(36).slice(2,6)}`,
    name: name.trim(), members: members.map(String),
    createdBy: String(createdBy), createdAt: new Date().toISOString(),
  };
  all.push(group);
  fs.writeFileSync(gf, JSON.stringify(all, null, 2));
  res.json(group);
});

/* ── GET /api/chat/group-messages?companyId=&groupId=&userId= ── */
router.get('/group-messages', (req, res) => {
  const { companyId, groupId, userId } = req.query;
  if (!companyId || !groupId) return res.status(400).json({ error: 'Missing params' });
  const fp = path.join(chatDir(companyId), `grp_${groupId}.json`);
  const msgs = fs.existsSync(fp) ? JSON.parse(fs.readFileSync(fp, 'utf-8') || '[]') : [];
  if (userId) {
    let changed = false;
    msgs.forEach(m => {
      if (!m.readBy) m.readBy = [];
      if (!m.readBy.includes(String(userId))) { m.readBy.push(String(userId)); changed = true; }
    });
    if (changed) fs.writeFileSync(fp, JSON.stringify(msgs, null, 2));
  }
  res.json(msgs);
});

/* ── POST /api/chat/group-messages ── */
router.post('/group-messages', (req, res) => {
  const { companyId, groupId, fromUserId, text, replyTo, order } = req.body;
  if (!companyId || !groupId || !fromUserId) return res.status(400).json({ error: 'Missing params' });
  const fp = path.join(chatDir(companyId), `grp_${groupId}.json`);
  const msgs = fs.existsSync(fp) ? JSON.parse(fs.readFileSync(fp, 'utf-8') || '[]') : [];
  const msg = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2,7)}`,
    groupId, fromUserId: String(fromUserId), companyId,
    text: text || '', file: null, order: order || null, replyTo: replyTo || null,
    timestamp: new Date().toISOString(),
    readBy: [String(fromUserId)],
  };
  msgs.push(msg);
  fs.mkdirSync(chatDir(companyId), { recursive: true });
  fs.writeFileSync(fp, JSON.stringify(msgs, null, 2));
  res.json(msg);
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
