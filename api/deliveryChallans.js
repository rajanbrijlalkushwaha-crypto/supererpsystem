const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { addSystemLog } = require('./communication');
const { saveJson, resolveUser } = require('./helpers');
const stockApi = require('./stock');

const DB = path.join(__dirname, '..', 'Database', 'Companies');

/* Delivery Challan dispatches material against a Sales Order — it should
   move stock the same way a GDN does, not just record a document. This
   writes/updates a matching Stock/{txnId}.json (type:'gdn') alongside the
   DC, linked via dc.stockTxnId, so Stock View always reflects reality
   regardless of which screen the dispatch was recorded from.
   No stock-availability block here (unlike manual GDN) — this business
   ships plenty of made-to-order items that never went through a formal
   GRN, so refusing to let a DC print because "stock" doesn't know about
   a fabricated item would break real sales flow; it just records the
   movement, negative stock included, which is informationally correct. */
function syncStockForDC(companyId, dc, existingTxnId = null) {
  const items = (dc.items || []).map(it => ({
    itemCode: it.itemCode || it.itemName || it.description || it.name || '',
    itemName: it.itemName || it.description || it.name || '',
    hsnCode:  it.hsnCode || '',
    qty:      parseFloat(it.qty || it.quantity) || 0,
    unit:     it.unit || it.uom || '',
    rate:     parseFloat(it.rate) || 0,
  }));

  const txnId = existingTxnId || stockApi.nextId(stockApi.stockDir(companyId));
  const rec = stockApi.buildGdnRecord(companyId, txnId, {
    date: dc.dcDate || dc.date || '',
    fromType: 'store',
    dispatchFrom: 'Our Yard',
    toType: 'client',
    partyName: dc.billingName || dc.customerName || dc.clientName || dc.shippingName || '',
    soRef: dc.linkedSalesOrderId || '',
    dcNo: dc.dcNo || '',
    vehicleNo: dc.vehicleNo || '',
    notes: `Auto-recorded from Delivery Challan ${dc.dcNo || ''}`,
    items,
  });

  if (!rec.items.length) {
    if (existingTxnId) {
      const f = stockApi.stockFile(companyId, existingTxnId);
      if (fs.existsSync(f)) fs.unlinkSync(f);
    }
    return null;
  }

  stockApi.ensureDir(stockApi.stockDir(companyId));
  saveJson(stockApi.stockFile(companyId, txnId), rec);
  return txnId;
}

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

/* GET all — deleted DCs are kept on file (status 'deleted') and listed only with ?withDeleted=1 */
router.get('/', (req, res) => {
  const { companyId, status, withDeleted } = req.query;
  if (!companyId) return res.status(400).json({ error: 'companyId required' });
  let list = listAll(companyId);
  if (!withDeleted) list = list.filter(d => d.status !== 'deleted');
  if (status) list = list.filter(d => d.status === status);
  res.json(list);
});

/* GET the DC counter — the list uses it to show numbers that were deleted before deletions were kept */
router.get('/meta/counter', (req, res) => {
  const { companyId } = req.query;
  if (!companyId) return res.status(400).json({ error: 'companyId required' });
  const c = readJSON(ctrFile(companyId)) || { seq: 700000 };
  res.json({ last: Math.max(0, (Number(c.seq) || 700000) - 700000) });
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
  dc.stockTxnId = syncStockForDC(companyId, dc);
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
  updated.stockTxnId = syncStockForDC(companyId, updated, existing.stockTxnId || null);
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

/* DELETE — the DC is not removed: it is marked deleted (who / when) so the list still shows it;
   its stock entry is reversed and it no longer counts as material sent */
router.delete('/:dcId', (req, res) => {
  const { companyId } = req.query;
  if (!companyId) return res.status(400).json({ error: 'companyId required' });
  const file = dcFile(companyId, req.params.dcId);
  const existing = readJSON(file);
  if (!existing) return res.status(404).json({ error: 'DC not found' });
  if (existing.stockTxnId) {
    const f = stockApi.stockFile(companyId, existing.stockTxnId);
    if (fs.existsSync(f)) fs.unlinkSync(f);
  }
  const u = resolveUser(req);
  writeJSON(file, { ...existing, status: 'deleted', statusBeforeDelete: existing.status || '', stockTxnId: null,
    deletedAt: new Date().toISOString(), deletedBy: u ? (u.name || u.username || '') : '', deleteReason: String(req.query.reason || '').slice(0, 200),
    updatedAt: new Date().toISOString() });
  res.json({ ok: true });
});

module.exports = router;
