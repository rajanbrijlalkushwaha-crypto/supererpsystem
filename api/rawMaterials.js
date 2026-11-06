/**
 * rawMaterials.js — Raw Material master (resin, glass fibre, catalyst, fittings…) for manufacturing.
 *
 * Stored at Database/Companies/{co}/RawMaterials/{id}/{id}.json
 *   { rmId, code: 'RM0001', name, unit, hsnCode, gstPercent, category, minLevel,
 *     opening: { qty, rate, date, location }, status: 'active' | 'deleted', createdBy, audit[] }
 * The stock itself is worked out from documents (opening + GRNs of "For stock" POs − issues + returns);
 * nothing here changes stock. A delete only marks the item deleted (kept for old documents).
 */
const express = require('express');
const fs = require('fs');
const path = require('path');
const { ROOT, auditEntry, pushAudit, resolveUser } = require('./helpers');

const router = express.Router();
const dir = co => path.join(ROOT, 'Database', 'Companies', co, 'RawMaterials');
const file = (co, id) => path.join(dir(co), String(id), `${id}.json`);
const readJSON = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const writeJSON = (f, d) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(d, null, 2)); };
const cid = req => req.query.companyId || req.body?.companyId || '';
const n = v => Math.round((parseFloat(v) || 0) * 1000) / 1000;
const s = (v, max = 200) => String(v ?? '').trim().slice(0, max);
const low = v => s(v).toLowerCase().replace(/\s+/g, ' ');
const who = req => { const u = resolveUser(req); return u ? (u.name || u.username || '') : ''; };

function listAll(co) {
  const d = dir(co);
  if (!fs.existsSync(d)) return [];
  return fs.readdirSync(d).filter(x => /^\d+$/.test(x)).map(x => readJSON(file(co, x))).filter(Boolean)
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
}
function clean(b) {
  const o = b.opening || {};
  return {
    name: s(b.name, 150), unit: s(b.unit, 20) || 'KG', hsnCode: s(b.hsnCode, 20), gstPercent: n(b.gstPercent ?? 18), category: s(b.category, 60),
    minLevel: Math.max(0, n(b.minLevel)), remarks: s(b.remarks, 300),
    opening: { qty: Math.max(0, n(o.qty)), rate: Math.max(0, n(o.rate)), date: s(o.date, 10), location: s(o.location, 120) },
  };
}

router.get('/', (req, res) => {
  const co = cid(req); if (!co) return res.status(400).json({ error: 'companyId required' });
  const list = listAll(co);
  res.json(req.query.withDeleted ? list : list.filter(r => r.status !== 'deleted'));
});

router.post('/', (req, res) => {
  try {
    const co = cid(req); if (!co) return res.status(400).json({ error: 'companyId required' });
    const body = clean(req.body || {});
    if (!body.name) return res.status(400).json({ error: 'Enter the raw material name.' });
    const all = listAll(co);
    if (all.some(r => r.status !== 'deleted' && low(r.name) === low(body.name))) return res.status(400).json({ error: `“${body.name}” is already in the list.` });
    const rmId = all.reduce((m, r) => Math.max(m, r.rmId || 0), 800000) + 1;
    const code = `RM${String(rmId - 800000).padStart(4, '0')}`;
    const now = new Date().toISOString();
    const rec = { rmId, code, ...body, status: 'active', createdBy: who(req), createdAt: now, updatedAt: now, audit: [auditEntry(req, 'created')] };
    writeJSON(file(co, rmId), rec);
    res.json(rec);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/:id', (req, res) => {
  try {
    const co = cid(req), f = file(co, req.params.id), old = readJSON(f);
    if (!old) return res.status(404).json({ error: 'Not found' });
    if (old.status === 'deleted') return res.status(400).json({ error: 'A deleted item cannot be edited.' });
    const body = clean({ ...old, ...req.body, opening: { ...(old.opening || {}), ...(req.body?.opening || {}) } });
    if (!body.name) return res.status(400).json({ error: 'Enter the raw material name.' });
    if (listAll(co).some(r => r.rmId !== old.rmId && r.status !== 'deleted' && low(r.name) === low(body.name))) return res.status(400).json({ error: `“${body.name}” is already in the list.` });
    const upd = { ...old, ...body, updatedBy: who(req), updatedAt: new Date().toISOString() };
    upd.audit = pushAudit(old, req, 'edited', { from: { name: old.name, opening: old.opening }, to: { name: upd.name, opening: upd.opening } });
    writeJSON(f, upd);
    res.json(upd);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id', (req, res) => {
  try {
    const co = cid(req), f = file(co, req.params.id), old = readJSON(f);
    if (!old) return res.status(404).json({ error: 'Not found' });
    const now = new Date().toISOString();
    const upd = { ...old, status: 'deleted', deletedBy: who(req), deletedAt: now, updatedAt: now };
    upd.audit = pushAudit(old, req, 'deleted');
    writeJSON(f, upd);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
