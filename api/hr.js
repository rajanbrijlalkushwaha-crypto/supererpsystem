/**
 * hr.js — HR: Recruitment (candidates + CVs), Employees, Salary (monthly sheet).
 * Stored per company:
 *   Database/Companies/{cid}/HR/Candidates/{id}.json   + docs/{id}/  (CV and other files)
 *   Database/Companies/{cid}/HR/Employees/{id}.json    + docs/{id}/  (employee documents)
 *   Database/Companies/{cid}/HR/Salary/{yyyy-mm}.json  (one salary sheet per month)
 */
const express = require('express');
const path = require('path');
const fs = require('fs');
const { ROOT, upload, saveUploadedFiles, saveJson, auditEntry, pushAudit } = require('./helpers');

const router = express.Router();
const cidOf = req => String((Array.isArray(req.query.companyId) ? req.query.companyId[0] : req.query.companyId) || req.body?.companyId || '').replace(/[^A-Za-z0-9]/g, '');
const base = (cid, mod) => path.join(ROOT, 'Database', 'Companies', cid, 'HR', mod);
const docsDir = (cid, mod, id) => path.join(base(cid, mod), 'docs', String(id));
const recFile = (cid, mod, id) => path.join(base(cid, mod), `${id}.json`);
const readJson = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const listAll = (cid, mod) => { const d = base(cid, mod); try { return fs.readdirSync(d).filter(f => f.endsWith('.json')).map(f => readJson(path.join(d, f))).filter(Boolean); } catch { return []; } };
const nextId = (cid, mod, start) => Math.max(start - 1, ...listAll(cid, mod).map(r => parseInt(r.id, 10) || 0)) + 1;
const jsonField = (v, dflt) => { if (v == null || v === '') return dflt; if (typeof v !== 'string') return v; try { return JSON.parse(v); } catch { return dflt; } };
const need = (req, res) => { const cid = cidOf(req); if (!cid) { res.status(400).json({ error: 'companyId required' }); return null; } return cid; };

/* fields kept on each record (anything else in the body is ignored) */
const CAND_FIELDS = ['name', 'mobile', 'email', 'position', 'department', 'experience', 'currentCtc', 'expectedCtc', 'noticePeriod', 'location',
  'qualification', 'skills', 'source', 'referredBy', 'status', 'interviewDate', 'interviewer', 'rating', 'remarks', 'appliedOn'];
const EMP_FIELDS = ['empCode', 'name', 'fatherName', 'dob', 'gender', 'maritalStatus', 'bloodGroup', 'mobile', 'altMobile', 'email', 'currentAddress', 'permanentAddress',
  'emergencyName', 'emergencyMobile', 'department', 'designation', 'joiningDate', 'employmentType', 'reportingTo', 'workLocation', 'status', 'leavingDate', 'leavingReason',
  'pan', 'aadhaar', 'uan', 'pfNo', 'esicNo', 'bankName', 'bankAccount', 'ifsc', 'accountHolder', 'qualification', 'experience', 'remarks', 'candidateId'];
const SALARY_FIELDS = ['basic', 'hra', 'conveyance', 'special', 'other', 'pfApplicable', 'esiApplicable', 'ptApplicable', 'tds'];
const pick = (b, fields) => Object.fromEntries(fields.filter(k => b[k] !== undefined).map(k => [k, typeof b[k] === 'string' ? b[k].trim() : b[k]]));

/* ════════ Recruitment — candidates ════════ */
router.get('/candidates', (req, res) => {
  const cid = need(req, res); if (!cid) return;
  res.json(listAll(cid, 'Candidates').sort((a, b) => (b.id || 0) - (a.id || 0)));
});
router.post('/candidates', upload.array('files'), (req, res) => {
  try {
    const cid = need(req, res); if (!cid) return;
    const b = req.body || {};
    if (!String(b.name || '').trim()) return res.status(400).json({ error: 'Candidate name is required' });
    const id = nextId(cid, 'Candidates', 1001), now = new Date().toISOString();
    let files = [];
    if (req.files?.length) { fs.mkdirSync(docsDir(cid, 'Candidates', id), { recursive: true }); files = saveUploadedFiles(req.files, docsDir(cid, 'Candidates', id), jsonField(b.fileNames, [])); }
    const rec = { id, ...pick(b, CAND_FIELDS), status: b.status || 'New', appliedOn: b.appliedOn || now.slice(0, 10), files, createdAt: now, updatedAt: now, audit: [auditEntry(req, 'created')] };
    saveJson(recFile(cid, 'Candidates', id), rec);
    res.json({ success: true, id, candidate: rec });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
router.put('/candidates/:id', upload.array('files'), (req, res) => {
  try {
    const cid = need(req, res); if (!cid) return;
    const f = recFile(cid, 'Candidates', req.params.id), ex = readJson(f);
    if (!ex) return res.status(404).json({ error: 'Candidate not found' });
    const b = req.body || {};
    let files = Array.isArray(jsonField(b.keepFiles, null)) ? ex.files.filter(x => jsonField(b.keepFiles, []).includes(x.fileName)) : (ex.files || []);
    if (req.files?.length) { fs.mkdirSync(docsDir(cid, 'Candidates', ex.id), { recursive: true }); files = [...files, ...saveUploadedFiles(req.files, docsDir(cid, 'Candidates', ex.id), jsonField(b.fileNames, []))]; }
    const rec = { ...ex, ...pick(b, CAND_FIELDS), files, id: ex.id, updatedAt: new Date().toISOString(), audit: pushAudit(ex, req, b.status && b.status !== ex.status ? 'status_changed' : 'edited', b.status && b.status !== ex.status ? { from: ex.status, to: b.status } : {}) };
    saveJson(f, rec);
    res.json({ success: true, candidate: rec });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
router.delete('/candidates/:id', (req, res) => {
  const cid = need(req, res); if (!cid) return;
  const f = recFile(cid, 'Candidates', req.params.id);
  if (!fs.existsSync(f)) return res.status(404).json({ error: 'Candidate not found' });
  const ex = readJson(f);
  if (ex?.employeeId) return res.status(409).json({ error: `${ex.name} is already an employee — remove the employee first` });
  fs.unlinkSync(f); fs.rmSync(docsDir(cid, 'Candidates', req.params.id), { recursive: true, force: true });
  res.json({ success: true });
});

/* a candidate's / employee's file (CV, documents) */
for (const mod of ['Candidates', 'Employees']) {
  router.get(`/${mod.toLowerCase()}/:id/file/:fileName`, (req, res) => {
    const cid = need(req, res); if (!cid) return;
    const fp = path.join(docsDir(cid, mod, req.params.id), path.basename(req.params.fileName));
    if (!fs.existsSync(fp)) return res.status(404).json({ error: 'File not found' });
    res.sendFile(fp);
  });
}

/* ════════ Employees ════════ */
router.get('/employees', (req, res) => {
  const cid = need(req, res); if (!cid) return;
  res.json(listAll(cid, 'Employees').sort((a, b) => String(a.empCode || '').localeCompare(String(b.empCode || ''), undefined, { numeric: true })));
});
router.get('/employees/next-code', (req, res) => {
  const cid = need(req, res); if (!cid) return;
  const n = Math.max(0, ...listAll(cid, 'Employees').map(e => parseInt(String(e.empCode || '').replace(/\D/g, ''), 10) || 0)) + 1;
  res.json({ empCode: `EMP${String(n).padStart(3, '0')}` });
});
const saveEmployee = (req, res, ex) => {
  const cid = need(req, res); if (!cid) return;
  const b = req.body || {};
  if (!String(b.name || ex?.name || '').trim()) return res.status(400).json({ error: 'Employee name is required' });
  const all = listAll(cid, 'Employees');
  const code = String(b.empCode || ex?.empCode || '').trim();
  if (code && all.some(e => e.id !== ex?.id && String(e.empCode).toUpperCase() === code.toUpperCase())) return res.status(409).json({ error: `Employee code ${code} is already used` });
  const id = ex ? ex.id : nextId(cid, 'Employees', 5001), now = new Date().toISOString();
  let files = ex?.files || [];
  if (ex && Array.isArray(jsonField(b.keepFiles, null))) files = files.filter(x => jsonField(b.keepFiles, []).includes(x.fileName));
  if (req.files?.length) { fs.mkdirSync(docsDir(cid, 'Employees', id), { recursive: true }); files = [...files, ...saveUploadedFiles(req.files, docsDir(cid, 'Employees', id), jsonField(b.fileNames, []))]; }
  const salary = { ...(ex?.salary || {}), ...pick(jsonField(b.salary, {}) || {}, SALARY_FIELDS) };
  for (const k of ['pfApplicable', 'esiApplicable', 'ptApplicable']) if (salary[k] !== undefined) salary[k] = salary[k] === true || salary[k] === 'true' || salary[k] === 'Yes';   // form data sends text
  const rec = { ...(ex || {}), id, ...pick(b, EMP_FIELDS), empCode: code, status: b.status || ex?.status || 'Active', salary, files,
    createdAt: ex?.createdAt || now, updatedAt: now, audit: ex ? pushAudit(ex, req, 'edited') : [auditEntry(req, 'created')] };
  // made from a recruitment candidate: copy the CV across and mark the candidate as joined
  if (!ex && b.candidateId) {
    const cf = recFile(cid, 'Candidates', b.candidateId), cand = readJson(cf);
    if (cand) {
      const src = docsDir(cid, 'Candidates', cand.id), dst = docsDir(cid, 'Employees', id);
      (cand.files || []).forEach(x => { try { fs.mkdirSync(dst, { recursive: true }); fs.copyFileSync(path.join(src, x.fileName), path.join(dst, x.fileName)); rec.files.push({ ...x, name: x.name || 'CV' }); } catch { /* missing file */ } });
      saveJson(cf, { ...cand, status: 'Joined', employeeId: id, updatedAt: now, audit: pushAudit(cand, req, 'status_changed', { from: cand.status, to: 'Joined' }) });
    }
  }
  saveJson(recFile(cid, 'Employees', id), rec);
  res.json({ success: true, id, employee: rec });
};
router.post('/employees', upload.array('files'), (req, res) => { try { saveEmployee(req, res, null); } catch (e) { res.status(500).json({ error: e.message }); } });
router.put('/employees/:id', upload.array('files'), (req, res) => {
  try {
    const cid = need(req, res); if (!cid) return;
    const ex = readJson(recFile(cid, 'Employees', req.params.id));
    if (!ex) return res.status(404).json({ error: 'Employee not found' });
    saveEmployee(req, res, ex);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
router.delete('/employees/:id', (req, res) => {
  const cid = need(req, res); if (!cid) return;
  const f = recFile(cid, 'Employees', req.params.id), ex = readJson(f);
  if (!ex) return res.status(404).json({ error: 'Employee not found' });
  const paid = listAll(cid, 'Salary').some(s => (s.rows || []).some(r => String(r.employeeId) === String(ex.id) && r.paidOn));
  if (paid) return res.status(409).json({ error: `${ex.name} has salary paid — set the status to "Left" instead of deleting` });
  fs.unlinkSync(f); fs.rmSync(docsDir(cid, 'Employees', ex.id), { recursive: true, force: true });
  if (ex.candidateId) { const cf = recFile(cid, 'Candidates', ex.candidateId), c = readJson(cf); if (c) saveJson(cf, { ...c, status: 'Selected', employeeId: null }); }
  res.json({ success: true });
});

/* ════════ Salary — one sheet per month ════════
   Earnings from each employee's salary structure, pro-rated by paid days. Employee deductions:
   PF 12% of basic (basic capped at ₹15,000), ESI 0.75% of gross when gross ≤ ₹21,000,
   Professional Tax (Gujarat) ₹200 when gross ≥ ₹12,000, TDS as set, advance / other as entered. */
const r2 = n => Math.round((parseFloat(n) || 0) * 100) / 100;
const daysIn = month => { const [y, m] = month.split('-').map(Number); return new Date(y, m, 0).getDate(); };
function calcRow(emp, month, entry = {}) {
  const s = emp.salary || {}, days = daysIn(month);
  const paidDays = entry.paidDays != null && entry.paidDays !== '' ? Math.max(0, Math.min(days, parseFloat(entry.paidDays) || 0)) : days;
  const f = paidDays / days;
  const earn = { basic: r2((+s.basic || 0) * f), hra: r2((+s.hra || 0) * f), conveyance: r2((+s.conveyance || 0) * f), special: r2((+s.special || 0) * f), other: r2((+s.other || 0) * f) };
  const bonus = r2(entry.bonus), gross = r2(Object.values(earn).reduce((t, v) => t + v, 0) + bonus);
  const yes = v => v === true || v === 'true' || v === 'Yes';
  const pf = yes(s.pfApplicable) ? r2(Math.min(earn.basic, 15000 * f) * 0.12) : 0;
  const esi = yes(s.esiApplicable) && gross <= 21000 ? Math.ceil(gross * 0.0075) : 0;
  const pt = yes(s.ptApplicable) ? (gross >= 12000 ? 200 : 0) : 0;
  const tds = r2(entry.tds != null && entry.tds !== '' ? entry.tds : s.tds), advance = r2(entry.advance), otherDed = r2(entry.otherDed);
  const deductions = r2(pf + esi + pt + tds + advance + otherDed);
  return { employeeId: emp.id, empCode: emp.empCode, name: emp.name, department: emp.department || '', designation: emp.designation || '',
    bankName: emp.bankName || '', bankAccount: emp.bankAccount || '', ifsc: emp.ifsc || '', uan: emp.uan || '', pan: emp.pan || '',
    days, paidDays, ...earn, bonus, gross, pf, esi, pt, tds, advance, otherDed, deductions, net: r2(gross - deductions),
    paidOn: entry.paidOn || '', paidVia: entry.paidVia || '', paidRef: entry.paidRef || '', remark: entry.remark || '' };
}
const ENTRY_FIELDS = ['paidDays', 'bonus', 'tds', 'advance', 'otherDed', 'paidOn', 'paidVia', 'paidRef', 'remark'];
router.get('/salary', (req, res) => {
  const cid = need(req, res); if (!cid) return;
  const month = String(req.query.month || '');
  if (!/^\d{4}-\d{2}$/.test(month)) return res.status(400).json({ error: 'month (yyyy-mm) is required' });
  const sheet = readJson(path.join(base(cid, 'Salary'), `${month}.json`)) || { month, rows: [] };
  const saved = Object.fromEntries((sheet.rows || []).map(r => [String(r.employeeId), r]));
  const start = `${month}-01`, end = `${month}-${String(daysIn(month)).padStart(2, '0')}`;
  // employees on the rolls in that month (joined by its end, not left before its start), or already on the saved sheet
  const emps = listAll(cid, 'Employees').filter(e => saved[String(e.id)] || ((!e.joiningDate || e.joiningDate <= end) && (!e.leavingDate || e.leavingDate >= start) && e.status !== 'Inactive'));
  const rows = emps.map(e => calcRow(e, month, saved[String(e.id)] || {})).sort((a, b) => String(a.empCode).localeCompare(String(b.empCode), undefined, { numeric: true }));
  res.json({ month, days: daysIn(month), savedAt: sheet.savedAt || null, rows });
});
router.post('/salary/:month', (req, res) => {
  try {
    const cid = need(req, res); if (!cid) return;
    const month = req.params.month;
    if (!/^\d{4}-\d{2}$/.test(month)) return res.status(400).json({ error: 'month (yyyy-mm) is required' });
    const emps = Object.fromEntries(listAll(cid, 'Employees').map(e => [String(e.id), e]));
    const f = path.join(base(cid, 'Salary'), `${month}.json`), ex = readJson(f) || { month, rows: [] };
    const prev = Object.fromEntries((ex.rows || []).map(r => [String(r.employeeId), r]));
    const rows = (Array.isArray(req.body?.rows) ? req.body.rows : []).filter(r => emps[String(r.employeeId)])
      .map(r => calcRow(emps[String(r.employeeId)], month, { ...(prev[String(r.employeeId)] || {}), ...pick(r, ENTRY_FIELDS) }));
    const sheet = { month, rows, savedAt: new Date().toISOString(), audit: ex.audit ? pushAudit(ex, req, 'edited') : [auditEntry(req, 'created')] };
    saveJson(f, sheet);
    res.json({ success: true, sheet });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
