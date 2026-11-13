/**
 * hr.js — HR: Recruitment (candidates + CVs), Employees, Salary (monthly sheet), Attendance, Company assets, HR settings.
 * Stored per company:
 *   Database/Companies/{cid}/HR/Candidates/{id}.json   + docs/{id}/  (CV and other files)
 *   Database/Companies/{cid}/HR/Employees/{id}.json    + docs/{id}/  (employee documents)
 *   Database/Companies/{cid}/HR/Salary/{yyyy-mm}.json  (one salary sheet per month)
 *   Database/Companies/{cid}/HR/Attendance/{yyyy-mm}.json  { marks: { empId: { '1': 'P' … } }, holidays: [day…] }
 *   Database/Companies/{cid}/HR/Assets/{id}.json       + docs/{id}/  (asset issued to an employee, signed agreement)
 *   Database/Companies/{cid}/HR/settings.json          (joining terms & conditions, asset terms, weekly off)
 */
const express = require('express');
const path = require('path');
const fs = require('fs');
const { ROOT, upload, saveUploadedFiles, saveJson, auditEntry, pushAudit, resolveUser } = require('./helpers');

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
  'pan', 'aadhaar', 'uan', 'pfNo', 'esicNo', 'bankName', 'bankAccount', 'ifsc', 'accountHolder', 'qualification', 'experience', 'remarks', 'candidateId',
  // joining terms (printed on the joining letter) and when the employee accepted them
  'probationMonths', 'noticeDays', 'workHours', 'weeklyOff', 'shift', 'termsAcceptedOn', 'termsNote', 'joiningFormOn',
  'contractEndDate', 'stipend'];   // temporary / contract / trainee: the agreed end date; trainee: stipend wording
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
  let salaryHistory = ex?.salaryHistory;
  if (salaryHistory?.length && b.salary !== undefined) {   // a correction on the form updates the newest revision's structure too
    const last = salaryHistory.reduce((m, r) => (String(r.effectiveFrom) > String(m.effectiveFrom) ? r : m), salaryHistory[0]);
    salaryHistory = salaryHistory.map(r => (r === last ? { ...r, to: { ...r.to, ...salary } } : r));
  }
  // full & final settlement (when the employee leaves): kept as one object on the employee
  const FNF_FIELDS = ['settlementDate', 'lastWorkingDay', 'resignationDate', 'noticeServedDays', 'salaryDays', 'leaveDays', 'bonus', 'gratuity', 'otherEarning', 'otherEarningNote',
    'noticeShortDays', 'advance', 'assetRecovery', 'otherDeduction', 'otherDeductionNote', 'tds', 'paidOn', 'paidVia', 'paidRef', 'notes', 'returnCopyOn'];
  const fnf = b.fnf !== undefined ? { ...(ex?.fnf || {}), ...pick(jsonField(b.fnf, {}) || {}, FNF_FIELDS) } : ex?.fnf;
  for (const k of ['pfApplicable', 'esiApplicable', 'ptApplicable']) if (salary[k] !== undefined) salary[k] = salary[k] === true || salary[k] === 'true' || salary[k] === 'Yes';   // form data sends text
  const rec = { ...(ex || {}), id, ...pick(b, EMP_FIELDS), empCode: code, status: b.status || ex?.status || 'Active', salary, files, ...(fnf ? { fnf } : {}), ...(salaryHistory ? { salaryHistory } : {}),
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

/* ════════ Salary revisions — "from Nov 2026 the salary is ₹40,000" ════════
   emp.salaryHistory = [{ id, effectiveFrom: 'yyyy-mm', from: {…structure before}, to: {…structure after}, note, revisedOn, by }]
   The structure for a month = the 'to' of the last revision effective on or before that month; before the first
   revision it is that revision's 'from'. emp.salary is always the newest structure. */
const salaryFor = (emp, month) => {
  const h = (emp.salaryHistory || []).slice().sort((a, b) => String(a.effectiveFrom).localeCompare(String(b.effectiveFrom)));
  if (!h.length) return emp.salary || {};
  let cur = h[0].from || emp.salary || {};
  h.forEach(r => { if (String(r.effectiveFrom) <= month) cur = r.to; });
  return cur || {};
};

/* ════════ Salary — one sheet per month ════════
   Earnings from each employee's salary structure, pro-rated by paid days. Employee deductions:
   PF 12% of basic (basic capped at ₹15,000), ESI 0.75% of gross when gross ≤ ₹21,000,
   Professional Tax (Gujarat) ₹200 when gross ≥ ₹12,000, TDS as set, advance / other as entered. */
const r2 = n => Math.round((parseFloat(n) || 0) * 100) / 100;
const daysIn = month => { const [y, m] = month.split('-').map(Number); return new Date(y, m, 0).getDate(); };
function calcRow(emp, month, entry = {}) {
  const s = salaryFor(emp, month), days = daysIn(month);
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

/* ════════ HR settings — the joining terms & conditions and the asset terms printed on the letters ════════ */
const DEFAULT_SETTINGS = {
  weeklyOff: 'Sunday',
  policies: [],
  joiningTerms: [
    'Probation: You will be on probation for the period stated above. Your services may be confirmed in writing on satisfactory completion of the probation.',
    'Working hours: The working hours and weekly off are as stated above. You may be required to work extra hours or at sites as the work requires.',
    'Notice period: Either side may end the employment by giving the notice stated above, or salary in lieu of the notice. During probation the notice is 15 days.',
    'Leave: Leave is as per the company leave policy. Unauthorised absence is treated as leave without pay.',
    'Confidentiality: You shall not disclose any information about the company, its clients, prices, drawings or processes, during or after your employment.',
    'Company property: Company assets given to you (SIM, mobile, laptop, tools, vehicle, ID card…) remain company property, are to be used for company work only, and must be returned in good condition on leaving. Loss or damage due to negligence may be recovered from you.',
    'Conduct: You shall follow the company rules, safety instructions and the instructions of your reporting manager. Misconduct may lead to disciplinary action, including termination.',
    'Documents: Your appointment is subject to the documents and details given by you being correct. Any false information may lead to termination.',
    'Salary: Your salary is as per the structure stated above, paid monthly after statutory deductions (PF / ESI / PT / TDS as applicable). Salary details are confidential.',
    'Full and final settlement: On leaving, the settlement is made after the notice period is served, all company property is returned and dues are cleared.',
  ].join('\n'),
  assetTerms: [
    'The asset(s) listed above are the property of the company and are given to me for official use only.',
    'I will keep the asset(s) safe and in good working condition, and will not lend, sell, pledge or misuse them.',
    'I will report any loss, theft or damage to the company immediately (and to the police in case of theft).',
    'Loss or damage due to my negligence may be recovered from my salary / full and final settlement.',
    'Company SIM / mobile / data are for official use; the company may check usage and bills. Personal charges above the plan may be recovered.',
    'I will return all the asset(s), with accessories, on leaving the company or whenever asked, in the condition received (normal wear excepted).',
  ].join('\n'),
};
const settingsFile = cid => path.join(ROOT, 'Database', 'Companies', cid, 'HR', 'settings.json');
const readSettings = cid => ({ ...DEFAULT_SETTINGS, ...(readJson(settingsFile(cid)) || {}) });
router.get('/settings', (req, res) => { const cid = need(req, res); if (!cid) return; res.json(readSettings(cid)); });
router.put('/settings', (req, res) => {
  const cid = need(req, res); if (!cid) return;
  const b = req.body || {}, cur = readSettings(cid);
  const next = { ...cur, ...pick(b, ['joiningTerms', 'assetTerms', 'weeklyOff']), updatedAt: new Date().toISOString() };
  // company policies — as many as wanted: { id, title, text, inAgreement }
  if (Array.isArray(b.policies)) next.policies = b.policies.map((p, i) => ({ id: String(p.id || `${Date.now()}${i}`).slice(0, 40), title: String(p.title || '').trim().slice(0, 150),
    text: String(p.text || '').slice(0, 20000), inAgreement: p.inAgreement === true || p.inAgreement === 'true' })).filter(p => p.title).slice(0, 60);
  ['joiningTerms', 'assetTerms'].forEach(k => { next[k] = String(next[k] || '').slice(0, 20000); });
  fs.mkdirSync(path.dirname(settingsFile(cid)), { recursive: true });
  saveJson(settingsFile(cid), next);
  res.json(next);
});

/* ════════ Attendance — one register per month ════════
   marks: P present · A absent · HD half day · L paid leave · LWP leave without pay · WO weekly off · H holiday */
const MARKS = ['P', 'A', 'HD', 'L', 'LWP', 'WO', 'H'];
router.get('/attendance', (req, res) => {
  const cid = need(req, res); if (!cid) return;
  const month = String(req.query.month || '');
  if (!/^\d{4}-\d{2}$/.test(month)) return res.status(400).json({ error: 'month (yyyy-mm) is required' });
  const reg = readJson(path.join(base(cid, 'Attendance'), `${month}.json`)) || {};
  res.json({ month, days: daysIn(month), marks: reg.marks || {}, holidays: reg.holidays || [], savedAt: reg.savedAt || null });
});
router.post('/attendance/:month', (req, res) => {
  try {
    const cid = need(req, res); if (!cid) return;
    const month = req.params.month;
    if (!/^\d{4}-\d{2}$/.test(month)) return res.status(400).json({ error: 'month (yyyy-mm) is required' });
    const days = daysIn(month), emps = Object.fromEntries(listAll(cid, 'Employees').map(e => [String(e.id), e]));
    const now0 = new Date(), todayStr = `${now0.getFullYear()}-${String(now0.getMonth() + 1).padStart(2, '0')}-${String(now0.getDate()).padStart(2, '0')}`;   // local date
    const marks = {};
    Object.entries(req.body?.marks || {}).forEach(([emp, row]) => {
      const e = emps[String(emp)];
      if (!e || !row || typeof row !== 'object') return;
      const r = {};
      Object.entries(row).forEach(([d, m]) => {
        const n = parseInt(d, 10), ds = `${month}-${String(n).padStart(2, '0')}`;
        if (!(n >= 1 && n <= days) || !MARKS.includes(m)) return;
        if (ds > todayStr || (e.joiningDate && ds < e.joiningDate) || (e.leavingDate && ds > e.leavingDate)) return;   // future / not on the rolls
        r[n] = m;
      });
      marks[emp] = r;
    });
    const holidays = [...new Set((Array.isArray(req.body?.holidays) ? req.body.holidays : []).map(Number).filter(n => n >= 1 && n <= days))].sort((a, b) => a - b);
    const f = path.join(base(cid, 'Attendance'), `${month}.json`), ex = readJson(f);
    const reg = { month, marks, holidays, savedAt: new Date().toISOString(), audit: ex?.audit ? pushAudit(ex, req, 'edited') : [auditEntry(req, 'created')] };
    fs.mkdirSync(base(cid, 'Attendance'), { recursive: true });
    saveJson(f, reg);
    res.json({ success: true, savedAt: reg.savedAt });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ════════ Company assets issued to employees ════════ */
const ASSET_FIELDS = ['assetType', 'assetName', 'serialNo', 'simNo', 'mobileNo', 'value', 'accessories', 'employeeId', 'empCode', 'empName',
  'issuedOn', 'issueCondition', 'returnedOn', 'returnCondition', 'status', 'remarks', 'agreementSignedOn'];
const ASSET_ST = ['issued', 'returned', 'lost', 'damaged'];
router.get('/assets', (req, res) => {
  const cid = need(req, res); if (!cid) return;
  res.json(listAll(cid, 'Assets').filter(a => a.status !== 'deleted').sort((a, b) => String(b.issuedOn || '').localeCompare(String(a.issuedOn || '')) || (b.id || 0) - (a.id || 0)));
});
const saveAsset = (req, res, ex) => {
  const cid = need(req, res); if (!cid) return;
  const b = req.body || {};
  const rec0 = { ...(ex || {}), ...pick(b, ASSET_FIELDS) };
  if (!String(rec0.assetName || '').trim()) return res.status(400).json({ error: 'Enter the asset (e.g. Jio SIM, Dell laptop).' });
  if (!rec0.employeeId) return res.status(400).json({ error: 'Pick the employee the asset is given to.' });
  if (!rec0.issuedOn) return res.status(400).json({ error: 'Enter the issue date.' });
  if (!ASSET_ST.includes(rec0.status)) rec0.status = rec0.returnedOn ? 'returned' : 'issued';
  const emp = readJson(recFile(cid, 'Employees', rec0.employeeId));
  if (!emp) return res.status(400).json({ error: 'Employee not found.' });
  const id = ex ? ex.id : nextId(cid, 'Assets', 7001), now = new Date().toISOString();
  let files = ex?.files || [];
  if (ex && Array.isArray(jsonField(b.keepFiles, null))) files = files.filter(x => jsonField(b.keepFiles, []).includes(x.fileName));
  if (req.files?.length) { fs.mkdirSync(docsDir(cid, 'Assets', id), { recursive: true }); files = [...files, ...saveUploadedFiles(req.files, docsDir(cid, 'Assets', id), jsonField(b.fileNames, []))]; }
  const rec = { ...rec0, id, value: r2(rec0.value), empCode: emp.empCode || '', empName: emp.name || '', files, createdAt: ex?.createdAt || now, updatedAt: now,
    audit: ex ? pushAudit(ex, req, b.status && b.status !== ex.status ? 'status_changed' : 'edited') : [auditEntry(req, 'created')] };
  saveJson(recFile(cid, 'Assets', id), rec);
  res.json({ success: true, id, asset: rec });
};
router.post('/assets', upload.array('files'), (req, res) => { try { saveAsset(req, res, null); } catch (e) { res.status(500).json({ error: e.message }); } });
router.put('/assets/:id', upload.array('files'), (req, res) => {
  try {
    const cid = need(req, res); if (!cid) return;
    const ex = readJson(recFile(cid, 'Assets', req.params.id));
    if (!ex || ex.status === 'deleted') return res.status(404).json({ error: 'Asset not found' });
    saveAsset(req, res, ex);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
router.delete('/assets/:id', (req, res) => {
  const cid = need(req, res); if (!cid) return;
  const f = recFile(cid, 'Assets', req.params.id), ex = readJson(f);
  if (!ex) return res.status(404).json({ error: 'Asset not found' });
  saveJson(f, { ...ex, status: 'deleted', deletedAt: new Date().toISOString(), audit: pushAudit(ex, req, 'deleted') });
  res.json({ success: true });
});
router.get('/assets/:id/file/:fileName', (req, res) => {
  const cid = need(req, res); if (!cid) return;
  const fp = path.join(docsDir(cid, 'Assets', req.params.id), path.basename(req.params.fileName));
  if (!fs.existsSync(fp)) return res.status(404).json({ error: 'File not found' });
  res.sendFile(fp);
});

/* ════════ One employee's history — every month's attendance row and salary row (for the employee report) ════════ */
router.get('/employees/:id/history', (req, res) => {
  const cid = need(req, res); if (!cid) return;
  const emp = readJson(recFile(cid, 'Employees', req.params.id));
  if (!emp) return res.status(404).json({ error: 'Employee not found' });
  const id = String(emp.id), months = {};
  const each = (mod, fn) => { try { fs.readdirSync(base(cid, mod)).filter(f => /^\d{4}-\d{2}\.json$/.test(f)).forEach(f => fn(f.slice(0, 7), readJson(path.join(base(cid, mod), f)) || {})); } catch { /* none yet */ } };
  each('Attendance', (m, reg) => { const row = (reg.marks || {})[id]; if (row && Object.keys(row).length) (months[m] = months[m] || { month: m, days: daysIn(m) }).marks = row; });
  each('Salary', (m, sh) => { const row = (sh.rows || []).find(r => String(r.employeeId) === id); if (row) (months[m] = months[m] || { month: m, days: daysIn(m) }).salary = row; });
  const assets = listAll(cid, 'Assets').filter(a => String(a.employeeId) === id && a.status !== 'deleted');
  res.json({ employee: emp, months: Object.values(months).sort((a, b) => a.month.localeCompare(b.month)), assets });
});

/* ════════ Attendance by Excel — download the month's format (active employees × days), fill it, upload it ════════
   The upload is only read and checked here: the marks go back to the screen, where they are reviewed and saved. */
const XLSX = require('xlsx');
const DOWS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const localToday = () => { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`; };
const rollsIn = (cid, month) => {
  const end = `${month}-${String(daysIn(month)).padStart(2, '0')}`, start = `${month}-01`;
  return listAll(cid, 'Employees').filter(e => (!e.joiningDate || e.joiningDate <= end) && (!e.leavingDate || e.leavingDate >= start) && e.status !== 'Left' && e.status !== 'Inactive')
    .sort((a, b) => String(a.empCode).localeCompare(String(b.empCode), undefined, { numeric: true }));
};
const lockOf = (e, month, d, today) => { const ds = `${month}-${String(d).padStart(2, '0')}`; return ds > today ? 'future date' : e.joiningDate && ds < e.joiningDate ? 'before joining' : e.leavingDate && ds > e.leavingDate ? 'after leaving' : ''; };
router.get('/attendance/template', (req, res) => {
  const cid = need(req, res); if (!cid) return;
  const month = String(req.query.month || '');
  if (!/^\d{4}-\d{2}$/.test(month)) return res.status(400).json({ error: 'month (yyyy-mm) is required' });
  const days = daysIn(month), today = localToday(), [y, m] = month.split('-').map(Number);
  const reg = readJson(path.join(base(cid, 'Attendance'), `${month}.json`)) || {};
  const label = new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  const head = ['Emp Code', 'Name', 'Designation', ...Array.from({ length: days }, (_, i) => `${i + 1} ${DOWS[new Date(y, m - 1, i + 1).getDay()]}`)];
  const rows = rollsIn(cid, month).map(e => [e.empCode || '', e.name || '', e.designation || '',
    ...Array.from({ length: days }, (_, i) => { const d = i + 1, lk = lockOf(e, month, d, today); return lk ? '-' : ((reg.marks || {})[String(e.id)] || {})[d] || ''; })]);
  const ws = XLSX.utils.aoa_to_sheet([[`Attendance — ${label}`], ['Marks: P present · A absent · HD half day · L paid leave · LWP leave without pay · WO weekly off · H holiday.  "-" = before joining / future (not counted). Do not change Emp Code.'], [], head, ...rows]);
  ws['!cols'] = [{ wch: 10 }, { wch: 24 }, { wch: 18 }, ...Array.from({ length: days }, () => ({ wch: 6 }))];
  ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 8 } }, { s: { r: 1, c: 0 }, e: { r: 1, c: Math.min(head.length - 1, 25) } }];
  ws['!freeze'] = { xSplit: 3, ySplit: 4 };
  const help = XLSX.utils.aoa_to_sheet([['Mark', 'Meaning', 'Counts as paid'], ['P', 'Present', '1 day'], ['A', 'Absent', '0'], ['HD', 'Half day', '½ day'], ['L', 'Paid leave', '1 day'],
    ['LWP', 'Leave without pay', '0'], ['WO', 'Weekly off', '1 day'], ['H', 'Holiday', '1 day'], ['-', 'Before joining / future — leave it', '—'], ['(blank)', 'Not marked — the saved mark stays', '—']]);
  help['!cols'] = [{ wch: 10 }, { wch: 40 }, { wch: 16 }];
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Attendance'); XLSX.utils.book_append_sheet(wb, help, 'Marks');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="Attendance-${month}.xlsx"`);
  res.send(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
});
const ALIAS = { P: 'P', PRESENT: 'P', A: 'A', ABSENT: 'A', AB: 'A', HD: 'HD', H_D: 'HD', HALF: 'HD', '½': 'HD', D: 'HD', L: 'L', PL: 'L', CL: 'L', SL: 'L', EL: 'L', LEAVE: 'L',
  LWP: 'LWP', UL: 'LWP', U: 'LWP', WO: 'WO', W: 'WO', OFF: 'WO', H: 'H', HOL: 'H', HOLIDAY: 'H', PH: 'H' };
router.post('/attendance/:month/parse', upload.single('file'), (req, res) => {
  try {
    const cid = need(req, res); if (!cid) return;
    const month = req.params.month;
    if (!/^\d{4}-\d{2}$/.test(month)) return res.status(400).json({ error: 'month (yyyy-mm) is required' });
    if (!req.file) return res.status(400).json({ error: 'Choose the filled Excel file.' });
    const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
    const aoa = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '', raw: false });
    const hi = aoa.findIndex(r => String(r[0] || '').trim().toLowerCase().replace(/\s+/g, '') === 'empcode');
    if (hi < 0) return res.status(400).json({ error: 'This is not the attendance format — download the format for the month and fill that.' });
    const days = daysIn(month), today = localToday(), head = aoa[hi];
    const dayCol = {}; head.forEach((h, c) => { const n = parseInt(String(h).trim(), 10); if (c >= 2 && n >= 1 && n <= days && /^\d{1,2}(\s|$)/.test(String(h).trim())) dayCol[c] = n; });
    if (!Object.keys(dayCol).length) return res.status(400).json({ error: 'No day columns (1, 2, 3…) found in the header row.' });
    const emps = listAll(cid, 'Employees'), byCode = Object.fromEntries(emps.map(e => [String(e.empCode || '').trim().toUpperCase(), e]));
    const byName = Object.fromEntries(emps.map(e => [String(e.name || '').trim().toUpperCase(), e]));
    const marks = {}, issues = []; let cells = 0, skipped = 0;
    aoa.slice(hi + 1).forEach((r, i) => {
      const code = String(r[0] || '').trim(), name = String(r[1] || '').trim();
      if (!code && !name) return;
      const e = byCode[code.toUpperCase()] || (!code ? byName[name.toUpperCase()] : null);
      if (!e) { issues.push(`Row ${hi + i + 2}: employee “${code || name}” not found`); return; }
      const row = {};
      Object.entries(dayCol).forEach(([c, d]) => {
        const raw = String(r[c] ?? '').trim(); if (!raw || raw === '-') return;
        const k = ALIAS[raw.toUpperCase().replace(/[\s.]/g, '')];
        if (!k) { issues.push(`${e.empCode || e.name} day ${d}: “${raw}” is not a mark`); return; }
        const lk = lockOf(e, month, d, today); if (lk) { skipped++; return; }
        row[d] = k; cells++;
      });
      if (Object.keys(row).length) marks[String(e.id)] = row;
    });
    res.json({ month, marks, cells, employees: Object.keys(marks).length, skipped, issues: issues.slice(0, 50), moreIssues: Math.max(0, issues.length - 50) });
  } catch (e) { res.status(400).json({ error: `Could not read the file: ${e.message}` }); }
});

/* add a salary revision (increment / change) effective from a month; remove the newest one */
router.post('/employees/:id/revise', (req, res) => {
  try {
    const cid = need(req, res); if (!cid) return;
    const f = recFile(cid, 'Employees', req.params.id), ex = readJson(f);
    if (!ex) return res.status(404).json({ error: 'Employee not found' });
    const b = req.body || {}, eff = String(b.effectiveFrom || '');
    if (!/^\d{4}-\d{2}$/.test(eff)) return res.status(400).json({ error: 'Pick the month the new salary starts from.' });
    if (ex.joiningDate && eff < ex.joiningDate.slice(0, 7)) return res.status(400).json({ error: 'The revision month is before the joining month.' });
    const to = pick(b.salary || {}, SALARY_FIELDS);
    for (const k of ['pfApplicable', 'esiApplicable', 'ptApplicable']) if (to[k] !== undefined) to[k] = to[k] === true || to[k] === 'true';
    const hist = (ex.salaryHistory || []).slice();
    if (hist.some(r => r.effectiveFrom === eff)) return res.status(409).json({ error: 'There is already a revision from that month — remove it first or pick another month.' });
    const paid = listAll(cid, 'Salary').filter(sh => sh.month >= eff && (sh.rows || []).some(r => String(r.employeeId) === String(ex.id) && r.paidOn)).map(sh => sh.month);
    const from = salaryFor(ex, eff);   // what applied in that month until now
    const u = resolveUser(req);
    hist.push({ id: Date.now(), effectiveFrom: eff, from, to: { ...from, ...to }, note: String(b.note || '').trim().slice(0, 500), revisedOn: new Date().toISOString().slice(0, 10), by: u ? (u.name || u.username) : '' });
    hist.sort((a, c) => String(a.effectiveFrom).localeCompare(String(c.effectiveFrom)));
    // a later revision built on the old figures keeps its own structure; the newest one is the current salary
    const rec = { ...ex, salaryHistory: hist, salary: hist[hist.length - 1].to, updatedAt: new Date().toISOString(), audit: pushAudit(ex, req, 'salary_revised', { effectiveFrom: eff }) };
    saveJson(f, rec);
    res.json({ success: true, employee: rec, paidMonths: paid });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
router.delete('/employees/:id/revise/:revId', (req, res) => {
  const cid = need(req, res); if (!cid) return;
  const f = recFile(cid, 'Employees', req.params.id), ex = readJson(f);
  if (!ex) return res.status(404).json({ error: 'Employee not found' });
  const hist = (ex.salaryHistory || []).filter(r => String(r.id) !== String(req.params.revId));
  if (hist.length === (ex.salaryHistory || []).length) return res.status(404).json({ error: 'Revision not found' });
  const removed = (ex.salaryHistory || []).find(r => String(r.id) === String(req.params.revId));
  const salary = hist.length ? hist[hist.length - 1].to : (removed?.from || ex.salary);
  saveJson(f, { ...ex, salaryHistory: hist, salary, updatedAt: new Date().toISOString(), audit: pushAudit(ex, req, 'salary_revision_removed', { effectiveFrom: removed?.effectiveFrom }) });
  res.json({ success: true });
});

module.exports = router;
