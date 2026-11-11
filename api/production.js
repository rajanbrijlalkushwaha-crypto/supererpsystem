/**
 * production.js — manufacturing records that sit beside the Job Sheets.
 *
 * Stored under Database/Companies/{co}/Manufacturing/
 *   BOM/{id}.json       Bill of materials per product
 *                       { bomId, code 'BOM0001', itemName, itemCode, uom, batchQty, materials:[{ rmId, code, name, unit, qty, scrapPct }],
 *                         labourPerUnit, overheadPerUnit, notes, status 'active'|'deleted' }
 *                       materials.qty is for batchQty units of the product.
 *   Issues/{id}.json    Material issue / return slip against a job sheet (this is what takes raw material out of stock)
 *                       { issueId, no 'MI0001' | 'MR0001', kind 'issue'|'return', date, jobId, jobNo, soNumber, customerName,
 *                         lines:[{ rmId, code, name, unit, qty, rate }], remarks }
 *   QC/{id}.json        QC inspection of a job's output
 *                       { qcId, no 'QC0001', date, jobId, jobNo, itemName, inspected, passed, rework, rejected,
 *                         params:[{ name, spec, actual, ok }], result 'pass'|'partial'|'fail', inspector, remarks }
 *   JobCost/{jobId}.json  Labour, overhead and scrap booked to a job
 *                       { jobId, labour:[{ desc, amount }], overhead:[{ desc, amount }], scrap:[{ rmId, name, unit, qty, value }], remarks }
 * Every change keeps an audit trail. A delete of a BOM only marks it deleted; issue / QC slips are removed.
 */
const express = require('express');
const fs = require('fs');
const path = require('path');
const { ROOT, auditEntry, pushAudit, resolveUser } = require('./helpers');

const router = express.Router();
const base = co => path.join(ROOT, 'Database', 'Companies', co, 'Manufacturing');
const readJSON = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const writeJSON = (f, d) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(d, null, 2)); };
const cid = req => String(req.query.companyId || req.body?.companyId || '').replace(/[^\w-]/g, '');
const n = v => Math.round((parseFloat(v) || 0) * 1000) / 1000;
const m2 = v => Math.round((parseFloat(v) || 0) * 100) / 100;
const s = (v, max = 200) => String(v ?? '').trim().slice(0, max);
const low = v => s(v).toLowerCase().replace(/\s+/g, ' ');
const who = req => { const u = resolveUser(req); return u ? (u.name || u.username || '') : ''; };
const isDate = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ''));
const today = () => new Date().toISOString().slice(0, 10);

const DIRS = { boms: 'BOM', issues: 'Issues', qc: 'QC', jobcost: 'JobCost' };
const dirOf = (co, kind) => path.join(base(co), DIRS[kind]);
const fileOf = (co, kind, id) => path.join(dirOf(co, kind), `${String(id).replace(/[^\w-]/g, '')}.json`);
function listAll(co, kind) {
  const d = dirOf(co, kind);
  if (!fs.existsSync(d)) return [];
  return fs.readdirSync(d).filter(x => x.endsWith('.json')).map(x => readJSON(path.join(d, x))).filter(Boolean);
}
const nextId = (list, k, start) => list.reduce((mx, r) => Math.max(mx, Number(r[k]) || 0), start) + 1;
const nextNo = (list, prefix) => `${prefix}${String(list.filter(r => String(r.no || '').startsWith(prefix)).reduce((mx, r) => Math.max(mx, parseInt(String(r.no).slice(prefix.length), 10) || 0), 0) + 1).padStart(4, '0')}`;
const need = (req, res) => { const co = cid(req); if (!co) { res.status(400).json({ error: 'companyId required' }); return null; } return co; };
const wrap = fn => (req, res) => { try { fn(req, res); } catch (e) { res.status(500).json({ error: e.message }); } };

/* ── BOM ── */
function cleanBom(b) {
  return {
    itemName: s(b.itemName, 200), itemCode: s(b.itemCode, 40), uom: s(b.uom, 20) || 'NOS', batchQty: n(b.batchQty) > 0 ? n(b.batchQty) : 1,
    materials: (Array.isArray(b.materials) ? b.materials : []).map(x => ({
      rmId: Number(x.rmId) || 0, code: s(x.code, 20), name: s(x.name, 150), unit: s(x.unit, 20), qty: Math.max(0, n(x.qty)), scrapPct: Math.min(100, Math.max(0, n(x.scrapPct))),
    })).filter(x => x.name && x.qty > 0),
    labourPerUnit: Math.max(0, m2(b.labourPerUnit)), overheadPerUnit: Math.max(0, m2(b.overheadPerUnit)), notes: s(b.notes, 500),
  };
}
router.get('/boms', wrap((req, res) => {
  const co = need(req, res); if (!co) return;
  const list = listAll(co, 'boms').sort((a, b) => String(a.itemName).localeCompare(String(b.itemName)));
  res.json(req.query.withDeleted ? list : list.filter(r => r.status !== 'deleted'));
}));
const bomClash = (list, body, selfId) => list.find(r => r.bomId !== selfId && r.status !== 'deleted' && low(r.itemName) === low(body.itemName));
router.post('/boms', wrap((req, res) => {
  const co = need(req, res); if (!co) return;
  const body = cleanBom(req.body || {});
  if (!body.itemName) return res.status(400).json({ error: 'Pick the product this BOM makes.' });
  if (!body.materials.length) return res.status(400).json({ error: 'Add at least one material with its qty.' });
  const all = listAll(co, 'boms');
  if (bomClash(all, body)) return res.status(400).json({ error: `“${body.itemName}” already has a BOM — edit that one.` });
  const bomId = nextId(all, 'bomId', 0), now = new Date().toISOString();
  const rec = { bomId, code: `BOM${String(bomId).padStart(4, '0')}`, ...body, status: 'active', createdBy: who(req), createdAt: now, updatedAt: now, audit: [auditEntry(req, 'created')] };
  writeJSON(fileOf(co, 'boms', bomId), rec);
  res.json(rec);
}));
router.put('/boms/:id', wrap((req, res) => {
  const co = need(req, res); if (!co) return;
  const f = fileOf(co, 'boms', req.params.id), old = readJSON(f);
  if (!old || old.status === 'deleted') return res.status(404).json({ error: 'BOM not found' });
  const body = cleanBom({ ...old, ...req.body });
  if (!body.itemName) return res.status(400).json({ error: 'Pick the product this BOM makes.' });
  if (!body.materials.length) return res.status(400).json({ error: 'Add at least one material with its qty.' });
  if (bomClash(listAll(co, 'boms'), body, old.bomId)) return res.status(400).json({ error: `“${body.itemName}” already has a BOM.` });
  const upd = { ...old, ...body, updatedBy: who(req), updatedAt: new Date().toISOString() };
  upd.audit = pushAudit(old, req, 'edited', { from: { materials: old.materials, labourPerUnit: old.labourPerUnit, overheadPerUnit: old.overheadPerUnit } });
  writeJSON(f, upd);
  res.json(upd);
}));
router.delete('/boms/:id', wrap((req, res) => {
  const co = need(req, res); if (!co) return;
  const f = fileOf(co, 'boms', req.params.id), old = readJSON(f);
  if (!old) return res.status(404).json({ error: 'BOM not found' });
  const now = new Date().toISOString();
  writeJSON(f, { ...old, status: 'deleted', deletedBy: who(req), deletedAt: now, updatedAt: now, audit: pushAudit(old, req, 'deleted') });
  res.json({ success: true });
}));

/* ── Material issue / return ── */
function cleanIssue(b) {
  return {
    kind: b.kind === 'return' ? 'return' : 'issue', date: isDate(b.date) ? b.date : today(),
    jobId: s(b.jobId, 20), jobNo: s(b.jobNo, 40), soNumber: s(b.soNumber, 60), customerName: s(b.customerName, 200),
    lines: (Array.isArray(b.lines) ? b.lines : []).map(x => ({ rmId: Number(x.rmId) || 0, code: s(x.code, 20), name: s(x.name, 150), unit: s(x.unit, 20), qty: Math.max(0, n(x.qty)), rate: Math.max(0, m2(x.rate)) }))
      .filter(x => x.rmId && x.qty > 0),
    remarks: s(b.remarks, 300), issuedTo: s(b.issuedTo, 100),
  };
}
/* a return cannot be more than was issued to that job (net of other returns) */
function returnProblem(all, body, selfId) {
  if (body.kind !== 'return') return null;
  const net = {};
  all.filter(r => r.issueId !== selfId && String(r.jobId) === String(body.jobId)).forEach(r => r.lines.forEach(l => { net[l.rmId] = (net[l.rmId] || 0) + (r.kind === 'return' ? -l.qty : l.qty); }));
  const bad = body.lines.find(l => l.qty > n(net[l.rmId]) + 0.0005);
  return bad ? `${bad.name}: only ${n(net[bad.rmId])} ${bad.unit} is with job ${body.jobNo} — cannot return ${bad.qty}.` : null;
}
router.get('/issues', wrap((req, res) => {
  const co = need(req, res); if (!co) return;
  res.json(listAll(co, 'issues').sort((a, b) => String(b.date).localeCompare(String(a.date)) || b.issueId - a.issueId));
}));
router.post('/issues', wrap((req, res) => {
  const co = need(req, res); if (!co) return;
  const body = cleanIssue(req.body || {});
  if (!body.jobId) return res.status(400).json({ error: 'Pick the job sheet.' });
  if (!body.lines.length) return res.status(400).json({ error: 'Enter the qty of at least one material.' });
  const all = listAll(co, 'issues');
  const prob = returnProblem(all, body); if (prob) return res.status(400).json({ error: prob });
  const issueId = nextId(all, 'issueId', 0), now = new Date().toISOString();
  const rec = { issueId, no: nextNo(all, body.kind === 'return' ? 'MR' : 'MI'), ...body, createdBy: who(req), createdAt: now, updatedAt: now, audit: [auditEntry(req, 'created')] };
  writeJSON(fileOf(co, 'issues', issueId), rec);
  res.json(rec);
}));
router.put('/issues/:id', wrap((req, res) => {
  const co = need(req, res); if (!co) return;
  const f = fileOf(co, 'issues', req.params.id), old = readJSON(f);
  if (!old) return res.status(404).json({ error: 'Slip not found' });
  const body = cleanIssue({ ...old, ...req.body, kind: old.kind });
  if (!body.lines.length) return res.status(400).json({ error: 'Enter the qty of at least one material.' });
  const prob = returnProblem(listAll(co, 'issues'), body, old.issueId); if (prob) return res.status(400).json({ error: prob });
  const upd = { ...old, ...body, updatedBy: who(req), updatedAt: new Date().toISOString() };
  upd.audit = pushAudit(old, req, 'edited', { from: { date: old.date, lines: old.lines } });
  writeJSON(f, upd);
  res.json(upd);
}));
router.delete('/issues/:id', wrap((req, res) => {
  const co = need(req, res); if (!co) return;
  const f = fileOf(co, 'issues', req.params.id), old = readJSON(f);
  if (!old) return res.status(404).json({ error: 'Slip not found' });
  if (old.kind === 'issue') {   // the job must not be left with more returned than issued
    const rest = listAll(co, 'issues').filter(r => r.issueId !== old.issueId && String(r.jobId) === String(old.jobId));
    const net = {}; rest.forEach(r => r.lines.forEach(l => { net[l.rmId] = (net[l.rmId] || 0) + (r.kind === 'return' ? -l.qty : l.qty); }));
    const bad = old.lines.find(l => n(net[l.rmId]) < -0.0005);
    if (bad) return res.status(400).json({ error: `Delete the return slip of ${bad.name} for job ${old.jobNo} first.` });
  }
  fs.unlinkSync(f);
  res.json({ success: true });
}));

/* ── QC inspection ── */
function cleanQc(b) {
  const inspected = Math.max(0, n(b.inspected)), passed = Math.max(0, n(b.passed)), rework = Math.max(0, n(b.rework)), rejected = Math.max(0, n(b.rejected));
  const params = (Array.isArray(b.params) ? b.params : []).map(x => ({ name: s(x.name, 120), spec: s(x.spec, 120), actual: s(x.actual, 120), ok: x.ok === false || x.ok === 'false' ? false : x.ok === true || x.ok === 'true' ? true : null }))
    .filter(x => x.name);
  return {
    date: isDate(b.date) ? b.date : today(), jobId: s(b.jobId, 20), jobNo: s(b.jobNo, 40), soNumber: s(b.soNumber, 60), customerName: s(b.customerName, 200),
    itemName: s(b.itemName, 200), uom: s(b.uom, 20), inspected, passed, rework, rejected, params,
    result: rejected === 0 && rework === 0 && passed > 0 ? 'pass' : passed === 0 ? 'fail' : 'partial',
    inspector: s(b.inspector, 100), remarks: s(b.remarks, 500),
  };
}
const qcProblem = body => {
  if (!body.jobId) return 'Pick the job sheet.';
  if (!body.inspected) return 'Enter the qty inspected.';
  if (Math.abs(body.passed + body.rework + body.rejected - body.inspected) > 0.0005) return `Passed + rework + rejected (${n(body.passed + body.rework + body.rejected)}) must equal the qty inspected (${body.inspected}).`;
  return null;
};
router.get('/qc', wrap((req, res) => {
  const co = need(req, res); if (!co) return;
  res.json(listAll(co, 'qc').sort((a, b) => String(b.date).localeCompare(String(a.date)) || b.qcId - a.qcId));
}));
router.post('/qc', wrap((req, res) => {
  const co = need(req, res); if (!co) return;
  const body = cleanQc(req.body || {});
  const prob = qcProblem(body); if (prob) return res.status(400).json({ error: prob });
  const all = listAll(co, 'qc'), qcId = nextId(all, 'qcId', 0), now = new Date().toISOString();
  const rec = { qcId, no: nextNo(all, 'QC'), ...body, createdBy: who(req), createdAt: now, updatedAt: now, audit: [auditEntry(req, 'created')] };
  writeJSON(fileOf(co, 'qc', qcId), rec);
  res.json(rec);
}));
router.put('/qc/:id', wrap((req, res) => {
  const co = need(req, res); if (!co) return;
  const f = fileOf(co, 'qc', req.params.id), old = readJSON(f);
  if (!old) return res.status(404).json({ error: 'QC report not found' });
  const body = cleanQc({ ...old, ...req.body });
  const prob = qcProblem(body); if (prob) return res.status(400).json({ error: prob });
  const upd = { ...old, ...body, updatedBy: who(req), updatedAt: new Date().toISOString() };
  upd.audit = pushAudit(old, req, 'edited', { from: { inspected: old.inspected, passed: old.passed, rework: old.rework, rejected: old.rejected } });
  writeJSON(f, upd);
  res.json(upd);
}));
router.delete('/qc/:id', wrap((req, res) => {
  const co = need(req, res); if (!co) return;
  const f = fileOf(co, 'qc', req.params.id);
  if (!fs.existsSync(f)) return res.status(404).json({ error: 'QC report not found' });
  fs.unlinkSync(f);
  res.json({ success: true });
}));

/* ── Job cost (labour, overhead, scrap) — one record per job ── */
router.get('/jobcost', wrap((req, res) => {
  const co = need(req, res); if (!co) return;
  res.json(listAll(co, 'jobcost'));
}));
router.put('/jobcost/:jobId', wrap((req, res) => {
  const co = need(req, res); if (!co) return;
  const jobId = s(req.params.jobId, 20).replace(/[^\w-]/g, '');
  if (!jobId) return res.status(400).json({ error: 'Job id required' });
  const f = fileOf(co, 'jobcost', jobId), old = readJSON(f) || { jobId, audit: [] };
  const b = req.body || {};
  const money = l => (Array.isArray(l) ? l : []).map(x => ({ desc: s(x.desc, 150), amount: Math.max(0, m2(x.amount)) })).filter(x => x.desc || x.amount);
  const upd = {
    ...old, jobId, jobNo: s(b.jobNo ?? old.jobNo, 40),
    labour: money(b.labour), overhead: money(b.overhead),
    scrap: (Array.isArray(b.scrap) ? b.scrap : []).map(x => ({ rmId: Number(x.rmId) || 0, name: s(x.name, 150), unit: s(x.unit, 20), qty: Math.max(0, n(x.qty)), value: Math.max(0, m2(x.value)) })).filter(x => x.name && (x.qty || x.value)),
    remarks: s(b.remarks, 500), updatedBy: who(req), updatedAt: new Date().toISOString(),
  };
  upd.audit = pushAudit(old, req, old.updatedAt ? 'edited' : 'created');
  writeJSON(f, upd);
  res.json(upd);
}));

module.exports = router;
