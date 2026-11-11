/**
 * insurance.js — the company's insurance policies and the claims made on them.
 *
 * Stored at Database/Companies/{co}/Insurance/Policies/{id}/{id}.json  (policyId 970001…)
 *   { policyNo, policyType, insurer, agentName, agentPhone, coverFor, coverDetails, orderId, orderNo, clientName,
 *     sumInsured, premium, gstPct, gst, totalPremium, paymentMode, paymentRef, paymentDate, startDate, endDate,
 *     remarks, renewedFromId, renewedToId, status: 'active' | 'cancelled' | 'deleted', docs[], audit[] }
 * and          Database/Companies/{co}/Insurance/Claims/{id}/{id}.json    (claimId 980001…)
 *   { policyId, policyNo, policyType, insurer, claimNo, claimDate, incidentDate, reason, amountClaimed,
 *     amountSettled, settledDate, claimStatus: Filed | Survey | Approved | Settled | Rejected, remarks, docs[] }
 * Documents (policy copy, premium receipt, claim papers) go in the record's docs/ folder.
 * A delete only marks the record deleted.
 */
const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { ROOT, auditEntry, pushAudit, resolveUser } = require('./helpers');

const router = express.Router();
const KINDS = {
  policies: { dir: 'Policies', base: 970000, id: 'policyId' },
  claims:   { dir: 'Claims',   base: 980000, id: 'claimId' },
};
const kindOf = req => KINDS[req.params.kind];
const dir = (co, k) => path.join(ROOT, 'Database', 'Companies', co, 'Insurance', k.dir);
const file = (co, k, id) => path.join(dir(co, k), String(id), `${id}.json`);
const readJSON = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const writeJSON = (f, d) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(d, null, 2)); };
const cid = req => req.query.companyId || req.body?.companyId || '';
const n = v => Math.round((parseFloat(v) || 0) * 100) / 100;
const s = (v, max = 200) => String(v ?? '').trim().slice(0, max);
const d10 = v => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : '');
const who = req => { const u = resolveUser(req); return u ? (u.name || u.username || '') : ''; };
const safeId = v => /^\d+$/.test(String(v || ''));

function listAll(co, k) {
  const d = dir(co, k);
  if (!fs.existsSync(d)) return [];
  return fs.readdirSync(d).filter(x => /^\d+$/.test(x)).map(x => readJSON(file(co, k, x))).filter(Boolean);
}

const TYPES = ['Fire', 'Marine / Transit', 'Vehicle', 'Workmen Compensation', 'Group Health / Mediclaim', 'Group Personal Accident',
  "Contractor's All Risk", 'Public Liability', 'Stock / Burglary', 'Machinery Breakdown', 'Keyman', 'Office Package', 'Other'];
const CLAIM_ST = ['Filed', 'Survey', 'Approved', 'Settled', 'Rejected'];

const clean = {
  policies: b => {
    const premium = n(b.premium), gstPct = n(b.gstPct), gst = b.gst !== undefined && b.gst !== '' ? n(b.gst) : n(premium * gstPct / 100);
    return {
      policyNo: s(b.policyNo, 80), policyType: TYPES.includes(b.policyType) ? b.policyType : 'Other', insurer: s(b.insurer, 150),
      agentName: s(b.agentName, 120), agentPhone: s(b.agentPhone, 60), coverFor: s(b.coverFor, 250), coverDetails: s(b.coverDetails, 2000),
      orderId: s(b.orderId, 30), orderNo: s(b.orderNo, 60), clientName: s(b.clientName, 200),
      sumInsured: n(b.sumInsured), premium, gstPct, gst, totalPremium: n(premium + gst),
      paymentMode: s(b.paymentMode, 40), paymentRef: s(b.paymentRef, 80), paymentDate: d10(b.paymentDate),
      startDate: d10(b.startDate), endDate: d10(b.endDate), remarks: s(b.remarks, 1000),
    };
  },
  claims: b => ({
    policyId: s(b.policyId, 20), policyNo: s(b.policyNo, 80), policyType: s(b.policyType, 60), insurer: s(b.insurer, 150),
    claimNo: s(b.claimNo, 80), claimDate: d10(b.claimDate), incidentDate: d10(b.incidentDate), reason: s(b.reason, 1000),
    amountClaimed: n(b.amountClaimed), amountSettled: n(b.amountSettled), settledDate: d10(b.settledDate),
    claimStatus: CLAIM_ST.includes(b.claimStatus) ? b.claimStatus : 'Filed', remarks: s(b.remarks, 1000),
  }),
};
const check = {
  policies: b => (!b.policyNo ? 'Enter the policy number.' : !b.insurer ? 'Enter the insurance company.' : !b.coverFor ? 'Enter what the policy covers.'
    : !b.startDate || !b.endDate ? 'Enter the start and expiry date.' : b.endDate < b.startDate ? 'The expiry date is before the start date.' : ''),
  claims: b => (!b.policyId ? 'Pick the policy.' : !b.claimDate ? 'Enter the claim date.' : !(b.amountClaimed > 0) ? 'Enter the amount claimed.'
    : b.amountSettled > b.amountClaimed ? 'The settled amount is more than the amount claimed.' : ''),
};

router.get('/meta', (_req, res) => res.json({ types: TYPES, claimStatuses: CLAIM_ST }));

router.get('/:kind', (req, res) => {
  const k = kindOf(req), co = cid(req);
  if (!k) return res.status(404).json({ error: 'Not found' });
  if (!co) return res.status(400).json({ error: 'companyId required' });
  res.json(listAll(co, k).filter(r => r.status !== 'deleted'));
});

router.post('/:kind', (req, res) => {
  try {
    const k = kindOf(req), co = cid(req);
    if (!k) return res.status(404).json({ error: 'Not found' });
    if (!co) return res.status(400).json({ error: 'companyId required' });
    const body = clean[req.params.kind](req.body || {});
    const err = check[req.params.kind](body); if (err) return res.status(400).json({ error: err });
    const all = listAll(co, k);
    if (req.params.kind === 'policies' && all.some(r => r.status !== 'deleted' && r.policyNo.toLowerCase() === body.policyNo.toLowerCase()))
      return res.status(400).json({ error: `Policy ${body.policyNo} is already saved.` });
    const id = all.reduce((m, r) => Math.max(m, r[k.id] || 0), k.base) + 1;
    const now = new Date().toISOString();
    const rec = { [k.id]: id, ...body, status: 'active', docs: [], createdBy: who(req), createdAt: now, updatedAt: now, audit: [auditEntry(req, 'created')] };
    // a renewal: tie the new policy to the old one
    const from = req.params.kind === 'policies' && safeId(req.body.renewedFromId) ? readJSON(file(co, k, req.body.renewedFromId)) : null;
    if (from) {
      rec.renewedFromId = from.policyId;
      writeJSON(file(co, k, from.policyId), { ...from, renewedToId: id, renewedToNo: rec.policyNo, updatedAt: now, audit: pushAudit(from, req, `renewed as ${rec.policyNo}`) });
    }
    writeJSON(file(co, k, id), rec);
    res.json(rec);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/:kind/:id', (req, res) => {
  try {
    const k = kindOf(req), co = cid(req);
    if (!k || !safeId(req.params.id)) return res.status(404).json({ error: 'Not found' });
    const old = readJSON(file(co, k, req.params.id));
    if (!old || old.status === 'deleted') return res.status(404).json({ error: 'Record not found.' });
    let rec;
    if (req.body && req.body.setStatus) {     // cancel / re-activate a policy
      if (!['active', 'cancelled'].includes(req.body.setStatus)) return res.status(400).json({ error: 'Bad status.' });
      rec = { ...old, status: req.body.setStatus, updatedAt: new Date().toISOString() };
      rec.audit = pushAudit(old, req, req.body.setStatus === 'cancelled' ? 'cancelled' : 're-activated');
    } else {
      const body = clean[req.params.kind](req.body || {});
      const err = check[req.params.kind](body); if (err) return res.status(400).json({ error: err });
      rec = { ...old, ...body, updatedAt: new Date().toISOString() };
      rec.audit = pushAudit(old, req, 'edited');
    }
    writeJSON(file(co, k, old[k.id]), rec);
    res.json(rec);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:kind/:id', (req, res) => {
  try {
    const k = kindOf(req), co = cid(req);
    if (!k || !safeId(req.params.id)) return res.status(404).json({ error: 'Not found' });
    const old = readJSON(file(co, k, req.params.id));
    if (!old) return res.status(404).json({ error: 'Record not found.' });
    const rec = { ...old, status: 'deleted', deletedAt: new Date().toISOString(), deletedBy: who(req) };
    rec.audit = pushAudit(old, req, 'deleted');
    writeJSON(file(co, k, old[k.id]), rec);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* documents: policy copy, premium receipt, claim papers */
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, _f, cb) => {
      const k = kindOf(req);
      if (!k || !safeId(req.params.id) || !cid(req)) return cb(new Error('Bad request'));
      const d = path.join(dir(cid(req), k), req.params.id, 'docs');
      fs.mkdirSync(d, { recursive: true }); cb(null, d);
    },
    filename: (_req, f, cb) => cb(null, `${Date.now()}-${path.basename(f.originalname).replace(/[^\w.\- ]+/g, '_')}`),
  }),
  limits: { fileSize: 20 * 1024 * 1024 },
});
router.post('/:kind/:id/upload', upload.single('file'), (req, res) => {
  try {
    const k = kindOf(req), co = cid(req);
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const f = file(co, k, req.params.id), rec = readJSON(f);
    if (!rec) return res.status(404).json({ error: 'Record not found.' });
    const doc = { name: req.file.originalname, file: req.file.filename, label: s(req.body?.label, 60) || 'Document', uploadedAt: new Date().toISOString(), by: who(req) };
    writeJSON(f, { ...rec, docs: [...(rec.docs || []), doc], updatedAt: doc.uploadedAt });
    res.json(doc);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
router.get('/:kind/:id/docs/:name', (req, res) => {
  const k = kindOf(req), co = cid(req);
  if (!k || !safeId(req.params.id)) return res.status(404).json({ error: 'Not found' });
  const f = path.join(dir(co, k), req.params.id, 'docs', path.basename(req.params.name));
  if (!fs.existsSync(f)) return res.status(404).json({ error: 'Not found' });
  res.sendFile(f);
});

module.exports = router;
