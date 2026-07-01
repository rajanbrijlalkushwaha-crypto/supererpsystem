const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

const DB = path.join(__dirname, '..', 'Database', 'Companies');

const crmDir = (companyId) => path.join(DB, companyId, 'CRM');
const quoteDir = (companyId, quoteId) => path.join(crmDir(companyId), String(quoteId));
const quoteFile = (companyId, quoteId) => path.join(quoteDir(companyId, quoteId), `${quoteId}.json`);
const counterFile = (companyId) => path.join(crmDir(companyId), 'counter.json');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function readJSON(file) {
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function nextSeq(companyId) {
  ensureDir(crmDir(companyId));
  const cf = counterFile(companyId);
  const c = readJSON(cf) || { seq: 500000 };
  c.seq += 1;
  writeJSON(cf, c);
  return c.seq;
}

const getFY = () => {
  const now = new Date(); const m = now.getMonth() + 1; const y = now.getFullYear();
  const s = m >= 4 ? y : y - 1;
  return `${s}-${String(s + 1).slice(2)}`;
};

const makeQuoteNo = (seq) => `QT/${getFY()}/${String(seq - 500000).padStart(3, '0')}`;

function listQuotes(companyId) {
  const dir = crmDir(companyId);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => /^\d+$/.test(f))
    .map(f => readJSON(quoteFile(companyId, f)))
    .filter(Boolean)
    .sort((a, b) => b.quoteId - a.quoteId);
}

/* ── List ── */
router.get('/quotes', (req, res) => {
  const { companyId, status } = req.query;
  if (!companyId) return res.status(400).json({ error: 'companyId required' });
  let quotes = listQuotes(companyId);
  if (status) quotes = quotes.filter(q => q.status === status);
  res.json(quotes);
});

/* ── Get one ── */
router.get('/quotes/:quoteId', (req, res) => {
  const { companyId } = req.query;
  if (!companyId) return res.status(400).json({ error: 'companyId required' });
  const q = readJSON(quoteFile(companyId, req.params.quoteId));
  if (!q) return res.status(404).json({ error: 'Quote not found' });
  res.json(q);
});

/* ── Create ── */
router.post('/quotes', (req, res) => {
  const { companyId, ...data } = req.body;
  if (!companyId) return res.status(400).json({ error: 'companyId required' });
  const quoteId = nextSeq(companyId);
  const quoteNo = makeQuoteNo(quoteId);
  const quote = {
    quoteId,
    quoteNo,
    status: 'draft',
    ...data,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  ensureDir(quoteDir(companyId, quoteId));
  writeJSON(quoteFile(companyId, quoteId), quote);
  res.json(quote);
});

/* ── Update ── */
router.put('/quotes/:quoteId', (req, res) => {
  const { companyId, ...data } = req.body;
  if (!companyId) return res.status(400).json({ error: 'companyId required' });
  const file = quoteFile(companyId, req.params.quoteId);
  const existing = readJSON(file);
  if (!existing) return res.status(404).json({ error: 'Quote not found' });
  const updated = { ...existing, ...data, updatedAt: new Date().toISOString() };
  writeJSON(file, updated);
  res.json(updated);
});

/* ── Status change: approve / reject / send ── */
router.put('/quotes/:quoteId/status', (req, res) => {
  const { companyId, status, rejectedReason, approvedBy } = req.body;
  if (!companyId) return res.status(400).json({ error: 'companyId required' });
  const file = quoteFile(companyId, req.params.quoteId);
  const existing = readJSON(file);
  if (!existing) return res.status(404).json({ error: 'Quote not found' });
  const patch = { status, updatedAt: new Date().toISOString() };
  if (status === 'approved') { patch.approvedBy = approvedBy || 'Admin'; patch.approvedAt = new Date().toISOString(); }
  if (status === 'rejected') { patch.rejectedReason = rejectedReason || ''; patch.rejectedAt = new Date().toISOString(); }
  if (status === 'sent') { patch.sentAt = new Date().toISOString(); }
  const updated = { ...existing, ...patch };
  writeJSON(file, updated);
  res.json(updated);
});

/* ── Delete ── */
router.delete('/quotes/:quoteId', (req, res) => {
  const { companyId } = req.query;
  if (!companyId) return res.status(400).json({ error: 'companyId required' });
  const dir = quoteDir(companyId, req.params.quoteId);
  if (!fs.existsSync(dir)) return res.status(404).json({ error: 'Quote not found' });
  fs.rmSync(dir, { recursive: true });
  res.json({ ok: true });
});

module.exports = router;
