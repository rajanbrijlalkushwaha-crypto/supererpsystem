const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { addSystemLog } = require('./communication');

const DB = path.join(__dirname, '..', 'Database', 'Companies');

const soJsonPath = (cid, orderId) =>
  path.join(DB, cid, 'SalesOrder', String(orderId), `${orderId}.json`);

const DISPATCH_ELIGIBLE = new Set(['in-progress','order-received','confirmed','approved','active','dispatch-pending']);
function autoAdvanceSoToDispatched(companyId, linkedSalesOrderId) {
  if (!linkedSalesOrderId || !companyId) return;
  const soPath = soJsonPath(companyId, linkedSalesOrderId);
  try {
    if (!fs.existsSync(soPath)) return;
    const so = JSON.parse(fs.readFileSync(soPath, 'utf8'));
    if (!DISPATCH_ELIGIBLE.has((so.status || '').toLowerCase())) return;
    fs.writeFileSync(soPath, JSON.stringify({ ...so, status: 'dispatched', updatedAt: new Date().toISOString() }, null, 2));
  } catch (e) { console.error('autoAdvanceSoToDispatched:', e.message); }
}
const dcDir   = cid => path.join(DB, cid, 'DeliveryChallan');
const entryDir= (cid, id) => path.join(dcDir(cid), String(id));
const dcFile  = (cid, id) => path.join(entryDir(cid, id), `${id}.json`);
const ctrFile = cid => path.join(dcDir(cid), 'counter.json');

const ensureDir = d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); };
const readJSON  = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const writeJSON = (f, d) => fs.writeFileSync(f, JSON.stringify(d, null, 2));

function nextSeq(cid) {
  ensureDir(dcDir(cid));
  const cf = ctrFile(cid);
  const c  = readJSON(cf) || { seq: 700000 };
  c.seq += 1;
  writeJSON(cf, c);
  return c.seq;
}

const getFY = () => {
  const n = new Date(); const m = n.getMonth() + 1; const y = n.getFullYear();
  const s = m >= 4 ? y : y - 1;
  return `${s}-${String(s + 1).slice(2)}`;
};
const makeDcNo = seq => `DC/${getFY()}/${String(seq - 700000).padStart(4, '0')}`;

function listAll(cid) {
  const dir = dcDir(cid);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => /^\d+$/.test(f))
    .map(f => readJSON(dcFile(cid, f)))
    .filter(Boolean)
    .sort((a, b) => b.dcId - a.dcId);
}

/* GET all */
router.get('/', (req, res) => {
  const { companyId, status } = req.query;
  if (!companyId) return res.status(400).json({ error: 'companyId required' });
  let list = listAll(companyId);
  if (status) list = list.filter(d => d.status === status);
  res.json(list);
});

/* GET one */
router.get('/:dcId', (req, res) => {
  const { companyId } = req.query;
  if (!companyId) return res.status(400).json({ error: 'companyId required' });
  const dc = readJSON(dcFile(companyId, req.params.dcId));
  if (!dc) return res.status(404).json({ error: 'DC not found' });
  res.json(dc);
});

/* POST create */
router.post('/', (req, res) => {
  const { companyId, ...data } = req.body;
  if (!companyId) return res.status(400).json({ error: 'companyId required' });
  const dcId = nextSeq(companyId);
  const dcNo = makeDcNo(dcId);
  const dc = { dcId, dcNo, status: 'issued', ...data,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  ensureDir(entryDir(companyId, dcId));
  writeJSON(dcFile(companyId, dcId), dc);
  autoAdvanceSoToDispatched(companyId, data.linkedSalesOrderId);
  if (data.linkedSalesOrderId) {
    addSystemLog(companyId, data.linkedSalesOrderId, 'System',
      `Material dispatched — Delivery Challan ${dcNo} issued`);
  }
  res.json(dc);
});

/* PUT update */
router.put('/:dcId', (req, res) => {
  const { companyId, ...data } = req.body;
  if (!companyId) return res.status(400).json({ error: 'companyId required' });
  const file = dcFile(companyId, req.params.dcId);
  const existing = readJSON(file);
  if (!existing) return res.status(404).json({ error: 'DC not found' });
  const updated = { ...existing, ...data, updatedAt: new Date().toISOString() };
  writeJSON(file, updated);
  res.json(updated);
});

/* PUT link to invoice — changes status to 'invoiced' */
router.put('/:dcId/link-invoice', (req, res) => {
  const { companyId, invoiceId, invoiceNo } = req.body;
  if (!companyId) return res.status(400).json({ error: 'companyId required' });
  const file = dcFile(companyId, req.params.dcId);
  const existing = readJSON(file);
  if (!existing) return res.status(404).json({ error: 'DC not found' });
  const updated = { ...existing, status: 'invoiced',
    linkedInvoiceId: invoiceId, linkedInvoiceNo: invoiceNo,
    invoicedAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  writeJSON(file, updated);
  res.json(updated);
});

/* DELETE */
router.delete('/:dcId', (req, res) => {
  const { companyId } = req.query;
  if (!companyId) return res.status(400).json({ error: 'companyId required' });
  const dir = entryDir(companyId, req.params.dcId);
  if (!fs.existsSync(dir)) return res.status(404).json({ error: 'DC not found' });
  fs.rmSync(dir, { recursive: true });
  res.json({ ok: true });
});

module.exports = router;
