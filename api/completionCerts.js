/**
 * completionCerts.js — Completion Certificates for a sales order (work / supply completed, for the client to certify).
 *
 * Stored at Database/Companies/{co}/CompletionCertificates/{id}/{id}.json
 *   { certId: 960001…, certNo: 'CC/26-27/0001', certDate, orderId, orderNo, orderDate, clientPO, clientPoDate,
 *     clientName, clientAddress, workTitle, workDetails, orderValue, invoiceNo, invoiceDate, dcNo, dcDate,
 *     startDate, completionDate, performance, items: [{ description, qty, unit }], remarks,
 *     status: 'issued' | 'deleted', createdBy, audit[] }
 * A delete only marks the certificate deleted (its number is never given again).
 */
const express = require('express');
const fs = require('fs');
const path = require('path');
const { ROOT, auditEntry, pushAudit, resolveUser } = require('./helpers');

const router = express.Router();
const dir = co => path.join(ROOT, 'Database', 'Companies', co, 'CompletionCertificates');
const file = (co, id) => path.join(dir(co), String(id), `${id}.json`);
const readJSON = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const writeJSON = (f, d) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(d, null, 2)); };
const cid = req => req.query.companyId || req.body?.companyId || '';
const n = v => Math.round((parseFloat(v) || 0) * 1000) / 1000;
const s = (v, max = 200) => String(v ?? '').trim().slice(0, max);
const who = req => { const u = resolveUser(req); return u ? (u.name || u.username || '') : ''; };
const BASE = 960000;

/* financial year of a date, e.g. 2026-11-06 → "26-27" */
const fyOf = d => { const x = new Date(d || Date.now()); const y = isNaN(x) ? new Date().getFullYear() : (x.getMonth() >= 3 ? x.getFullYear() : x.getFullYear() - 1); return `${String(y).slice(2)}-${String(y + 1).slice(2)}`; };

function listAll(co) {
  const d = dir(co);
  if (!fs.existsSync(d)) return [];
  return fs.readdirSync(d).filter(x => /^\d+$/.test(x)).map(x => readJSON(file(co, x))).filter(Boolean)
    .sort((a, b) => String(b.certDate || '').localeCompare(String(a.certDate || '')) || b.certId - a.certId);
}
/* next number in the FY of the certificate date: CC/26-27/0001 */
function nextNo(co, date) {
  const fy = fyOf(date), pre = `CC/${fy}/`;
  const last = listAll(co).filter(c => String(c.certNo || '').startsWith(pre)).reduce((m, c) => Math.max(m, parseInt(String(c.certNo).slice(pre.length), 10) || 0), 0);
  return `${pre}${String(last + 1).padStart(4, '0')}`;
}
const PERF = ['Excellent', 'Very Good', 'Good', 'Satisfactory'];
function clean(b) {
  return {
    certDate: s(b.certDate, 10), orderId: s(b.orderId, 30), orderNo: s(b.orderNo, 60), orderDate: s(b.orderDate, 10),
    clientPO: s(b.clientPO, 120), clientPoDate: s(b.clientPoDate, 10), clientId: s(b.clientId, 30), clientName: s(b.clientName, 200), clientAddress: s(b.clientAddress, 500),
    workTitle: s(b.workTitle, 300), workDetails: s(b.workDetails, 4000), orderValue: n(b.orderValue),
    invoiceNo: s(b.invoiceNo, 60), invoiceDate: s(b.invoiceDate, 10), dcNo: s(b.dcNo, 60), dcDate: s(b.dcDate, 10),
    startDate: s(b.startDate, 10), completionDate: s(b.completionDate, 10), performance: PERF.includes(b.performance) ? b.performance : 'Satisfactory',
    items: (Array.isArray(b.items) ? b.items : []).map(i => ({ description: s(i.description, 200), qty: n(i.qty), unit: s(i.unit, 20) || 'NOS' }))
      .filter(i => i.description).slice(0, 60),
    remarks: s(b.remarks, 1000),
  };
}
const check = b => (!b.clientName ? 'Pick the sales order (client).' : !b.workTitle ? 'Enter the work / supply completed.'
  : !b.completionDate ? 'Enter the completion date.' : b.startDate && b.completionDate < b.startDate ? 'The completion date is before the start date.' : '');

router.get('/', (req, res) => {
  const co = cid(req); if (!co) return res.status(400).json({ error: 'companyId required' });
  const list = listAll(co);
  res.json(req.query.withDeleted ? list : list.filter(r => r.status !== 'deleted'));
});

router.get('/next-no', (req, res) => {
  const co = cid(req); if (!co) return res.status(400).json({ error: 'companyId required' });
  res.json({ certNo: nextNo(co, req.query.date) });
});

router.post('/', (req, res) => {
  try {
    const co = cid(req); if (!co) return res.status(400).json({ error: 'companyId required' });
    const body = clean(req.body || {});
    const err = check(body); if (err) return res.status(400).json({ error: err });
    if (!body.certDate) body.certDate = new Date().toISOString().slice(0, 10);
    const all = listAll(co);
    const certId = all.reduce((m, r) => Math.max(m, r.certId || 0), BASE) + 1;
    const now = new Date().toISOString();
    const rec = { certId, certNo: nextNo(co, body.certDate), ...body, status: 'issued', createdBy: who(req), createdAt: now, updatedAt: now, audit: [auditEntry(req, 'created')] };
    writeJSON(file(co, certId), rec);
    res.json(rec);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/:id', (req, res) => {
  try {
    const co = cid(req); if (!co) return res.status(400).json({ error: 'companyId required' });
    const old = readJSON(file(co, req.params.id));
    if (!old || old.status === 'deleted') return res.status(404).json({ error: 'Certificate not found.' });
    const body = clean(req.body || {});
    const err = check(body); if (err) return res.status(400).json({ error: err });
    const rec = { ...old, ...body, certNo: old.certNo, updatedAt: new Date().toISOString() };
    rec.audit = pushAudit(old, req, 'edited');
    writeJSON(file(co, old.certId), rec);
    res.json(rec);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id', (req, res) => {
  try {
    const co = cid(req); if (!co) return res.status(400).json({ error: 'companyId required' });
    const old = readJSON(file(co, req.params.id));
    if (!old) return res.status(404).json({ error: 'Certificate not found.' });
    const rec = { ...old, status: 'deleted', deletedAt: new Date().toISOString(), deletedBy: who(req) };
    rec.audit = pushAudit(old, req, 'deleted');
    writeJSON(file(co, old.certId), rec);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
