/**
 * returns.js — material that comes back or goes back
 *
 *   kind 'client'  Return Note (RN)         material returned BY a client against a sales order / DC  → stock IN
 *   kind 'vendor'  Return to Vendor (VRN)   material sent BACK to a vendor against a PO               → stock OUT
 *
 * Stored at Database/Companies/{co}/Returns/{id}/{id}.json.
 * Accountability: who created / edited / deleted and when (audit trail). A delete only marks the note
 * 'deleted' (who / when / why) — it stays on file and in the list, and no longer counts in stock.
 */
const express = require('express');
const fs = require('fs');
const path = require('path');
const { ROOT, auditEntry, pushAudit, resolveUser } = require('./helpers');

const router = express.Router();
const dir = co => path.join(ROOT, 'Database', 'Companies', co, 'Returns');
const file = (co, id) => path.join(dir(co), String(id), `${id}.json`);
const readJSON = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const writeJSON = (f, d) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(d, null, 2)); };
const cid = req => req.query.companyId || req.body?.companyId || '';
const n = v => parseFloat(v) || 0;
const s = (v, max = 300) => String(v ?? '').trim().slice(0, max);
const who = req => { const u = resolveUser(req); return u ? (u.name || u.username || '') : ''; };

const fyOf = d => {
  const x = new Date(d || Date.now()); const t = isNaN(x) ? new Date() : x;
  const y = t.getMonth() >= 3 ? t.getFullYear() : t.getFullYear() - 1;
  return `${String(y).slice(2)}-${String(y + 1).slice(2)}`;
};
const PREFIX = { client: 'RN', vendor: 'VRN' };

function listAll(co) {
  const d = dir(co);
  if (!fs.existsSync(d)) return [];
  return fs.readdirSync(d).filter(x => /^\d+$/.test(x)).map(x => readJSON(file(co, x))).filter(Boolean)
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) || b.returnId - a.returnId);
}
/* next id from disk + next number per kind and financial year (RN/26-27/0001, VRN/26-27/0001) */
function nextIds(co, kind, date) {
  const all = listAll(co);
  const returnId = all.reduce((m, r) => Math.max(m, r.returnId || 0), 700000) + 1;
  const pre = `${PREFIX[kind]}/${fyOf(date)}/`;
  const last = all.filter(r => String(r.returnNo || '').startsWith(pre)).reduce((m, r) => Math.max(m, parseInt(String(r.returnNo).slice(pre.length), 10) || 0), 0);
  return { returnId, returnNo: pre + String(last + 1).padStart(4, '0') };
}

/* only the fields a note may carry — never trust the rest of the body */
function clean(b, kind) {
  const items = (Array.isArray(b.items) ? b.items : [])
    .map(it => ({ itemIdx: it.itemIdx != null && it.itemIdx !== '' ? Number(it.itemIdx) : null, itemName: s(it.itemName, 200), unit: s(it.unit, 20) || 'NOS', qty: Math.round(n(it.qty) * 1000) / 1000, remarks: s(it.remarks, 200) }))
    .filter(it => it.itemName && it.qty > 0);
  const base = { date: s(b.date, 10) || new Date().toISOString().slice(0, 10), reason: s(b.reason, 100), remarks: s(b.remarks, 500), vehicleNo: s(b.vehicleNo, 30), items };
  return kind === 'client'
    ? { ...base, orderId: s(b.orderId, 30), orderNo: s(b.orderNo, 60), customerName: s(b.customerName, 200), dcId: s(b.dcId, 30), dcNo: s(b.dcNo, 60), location: s(b.location, 120) }
    : { ...base, poId: s(b.poId, 30), poNo: s(b.poNo, 60), vendorId: s(b.vendorId, 30), vendorName: s(b.vendorName, 200), orderId: s(b.orderId, 30), orderNo: s(b.orderNo, 60), location: s(b.location, 120) };
}
const check = (r, kind) => {
  if (kind === 'client' && !r.orderId) return 'Choose the sales order.';
  if (kind === 'vendor' && !r.poId) return 'Choose the purchase order.';
  if (!r.items.length) return 'Enter the quantity of at least one item.';
  return '';
};

router.get('/', (req, res) => {
  const co = cid(req); if (!co) return res.status(400).json({ error: 'companyId required' });
  let list = listAll(co);
  if (req.query.kind) list = list.filter(r => r.kind === req.query.kind);
  if (!req.query.withDeleted) list = list.filter(r => r.status !== 'deleted');
  res.json(list);
});

router.get('/:id', (req, res) => {
  const r = readJSON(file(cid(req), req.params.id));
  if (!r) return res.status(404).json({ error: 'Not found' });
  res.json(r);
});

router.post('/', (req, res) => {
  try {
    const co = cid(req); if (!co) return res.status(400).json({ error: 'companyId required' });
    const kind = req.body?.kind === 'vendor' ? 'vendor' : req.body?.kind === 'client' ? 'client' : '';
    if (!kind) return res.status(400).json({ error: "kind must be 'client' or 'vendor'" });
    const body = clean(req.body || {}, kind);
    const err = check(body, kind); if (err) return res.status(400).json({ error: err });
    const ids = nextIds(co, kind, body.date);
    const now = new Date().toISOString();
    const rec = { ...ids, kind, status: 'active', ...body, createdBy: who(req), createdAt: now, updatedAt: now, audit: [auditEntry(req, 'created')] };
    writeJSON(file(co, ids.returnId), rec);
    res.json(rec);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/:id', (req, res) => {
  try {
    const co = cid(req), f = file(co, req.params.id), old = readJSON(f);
    if (!old) return res.status(404).json({ error: 'Not found' });
    if (old.status === 'deleted') return res.status(400).json({ error: 'A deleted note cannot be edited.' });
    const body = clean({ ...old, ...req.body }, old.kind);
    const err = check(body, old.kind); if (err) return res.status(400).json({ error: err });
    const upd = { ...old, ...body, updatedBy: who(req), updatedAt: new Date().toISOString() };
    upd.audit = pushAudit(old, req, 'edited', { from: { items: old.items.map(i => `${i.itemName} × ${i.qty}`).join(', ') }, to: { items: body.items.map(i => `${i.itemName} × ${i.qty}`).join(', ') } });
    writeJSON(f, upd);
    res.json(upd);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* delete = mark deleted (stays on file, listed with ?withDeleted=1) */
router.delete('/:id', (req, res) => {
  try {
    const co = cid(req), f = file(co, req.params.id), old = readJSON(f);
    if (!old) return res.status(404).json({ error: 'Not found' });
    const now = new Date().toISOString();
    const upd = { ...old, status: 'deleted', deletedBy: who(req), deletedAt: now, deleteReason: s(req.query.reason, 200), updatedAt: now };
    upd.audit = pushAudit(old, req, 'deleted', { reason: upd.deleteReason });
    writeJSON(f, upd);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
