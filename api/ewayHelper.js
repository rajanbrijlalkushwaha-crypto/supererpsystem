/* E-Way Helper — the server side.
 *
 * The helper is a small program on each user's PC (eway-helper/). It never receives calls from the browser;
 * it asks this server for work, so it works from any PC and even when the ERP is opened as a website.
 *
 *   1. Pairing   — the user asks for a code in the ERP (POST /pair/start); the helper sends it once
 *                  (POST /pair/finish) and gets its own long-lived helper token, tied to that ERP user.
 *   2. A job     — the ERP posts the e-way JSON made from the chosen DCs (POST /jobs).
 *   3. The helper of that user picks it up (GET /helper/next, long poll) together with the e-way portal
 *                  login from the Password Manager, opens Chrome on its PC, fills the login, the user types the
 *                  captcha, the helper uploads the JSON and reads the e-way bill numbers back.
 *   4. Result    — the helper posts what it read (POST /helper/jobs/:id/result); the e-way no., date and
 *                  validity are written into each DC; the ERP screen polls GET /jobs/:id meanwhile.
 *
 * Server mode (default): the same helper program runs on this server as a few headless workers
 * (startServerHelpers, called by server.js) and does every user's jobs — nothing is installed on any PC; the
 * captcha picture is shown in the ERP and typed there. EWAY_SERVER_HELPER=0 goes back to the helper on each PC.
 *
 * Job kinds: "generate" (bulk JSON upload), "cancel" (cancel one e-way bill on the portal, within 24 hours of
 * generation) and "check" (read the e-way bill's status on the portal — used when the user says it is already
 * cancelled). A confirmed cancel marks the DC's e-way bill as cancelled.
 */
const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { resolveUser, ROOT } = require('./helpers');
const passwords = require('./passwords');

const router = express.Router();
const DIR = path.join(ROOT, 'Database', 'EwayHelper');
const HELPERS = path.join(DIR, 'helpers.json');
const JOBS = path.join(DIR, 'jobs.json');
const PORTAL = process.env.EWAY_PORTAL_LOGIN || 'https://ewaybillgst.gov.in/Login.aspx';   // env only for testing against a mock portal
const GST_SEARCH = process.env.GST_SEARCH_URL || 'https://services.gst.gov.in/services/searchtp';   // public taxpayer search (env only for tests)

const readJ = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const writeJ = (f, v) => { fs.mkdirSync(DIR, { recursive: true }); const t = f + '.tmp'; fs.writeFileSync(t, JSON.stringify(v, null, 2)); fs.renameSync(t, f); };
const sha = s => crypto.createHash('sha256').update(String(s)).digest('hex');
const now = () => new Date().toISOString();

let helpers = readJ(HELPERS, []);                 // [{ id, userId, userName, machine, tokenHash, createdAt, lastSeen }]
let jobs = readJ(JOBS, []);                       // newest first, last 200 kept
const pairCodes = new Map();                      // code → { userId, userName, expires }
const waiting = new Map();                        // helperId → resolve() of a long poll
const saveJobs = () => { jobs = jobs.slice(0, 200); writeJ(JOBS, jobs.map(({ creds, ...j }) => j)); };   // logins never written to disk

/* ── server workers ── */
const SERVER_MODE = process.env.EWAY_SERVER_HELPER !== '0';
const SERVER_WORKERS = Math.max(1, Math.min(4, parseInt(process.env.EWAY_SERVER_WORKERS || '2', 10) || 2));
const serverHelpers = [];   // { id: 'server-1', server: true, userId: '*', machine: 'Server', tokenHash, lastSeen }
const findHelper = tok => (tok ? [...serverHelpers, ...helpers].find(x => x.tokenHash === sha(tok)) : null);
/* who can run a job of this user right now: the server workers, or (PC mode) the user's own PCs */
const runnersFor = userId => (SERVER_MODE ? serverHelpers : helpers.filter(h => h.userId === userId)).filter(h => online(h));
const NOT_RUNNING = () => (SERVER_MODE ? 'The portal worker on the server is stopped — restart the ERP backend and try again.'
  : 'The E-Way Helper on your PC is not running. Start it (or pair this PC) and try again.');
const wake = list => list.forEach(h => { const w = waiting.get(h.id); if (w) { waiting.delete(h.id); w(); } });

const needUser = (req, res, next) => {
  const u = resolveUser(req);
  if (!u) return res.status(401).json({ error: 'Please log in again.' });
  req.erpUser = u; next();
};
const needHelper = (req, res, next) => {
  const tok = (req.headers.authorization || '').replace(/^Bearer\s+/, '').trim();
  const h = findHelper(tok);
  if (!h) return res.status(401).json({ error: 'This helper is not paired. Pair it again from the ERP.' });
  h.lastSeen = now(); req.helper = h; next();
};
const online = h => h.lastSeen && Date.now() - new Date(h.lastSeen).getTime() < 45000;
const publicJob = ({ creds, json, captchaAnswer, ...j }) => j;

/* ── one-click setup ──
   GET /setup?erp=<the address the browser uses> → a Windows .cmd with that address and a fresh pairing code inside.
   Run once on the PC: it downloads the helper files from this server, installs, pairs, starts it with Windows and
   registers "epsilon-eway://" so the ERP's "Start Helper" button can start it. Needs Node.js on the PC. */
const HELPER_DIR = path.join(ROOT, 'eway-helper');
const HELPER_FILES = ['index.js', 'package.json', 'start-hidden.vbs'];
router.get('/files/:name', (req, res) => {   // helper program files (code only — no secrets)
  if (!HELPER_FILES.includes(req.params.name)) return res.status(404).end();
  res.type('text/plain').send(fs.readFileSync(path.join(HELPER_DIR, req.params.name)));
});
router.get('/setup', needUser, (req, res) => {
  const erp = String(req.query.erp || '').trim().replace(/\/+$/, '');
  if (!/^https?:\/\/[a-z0-9.\-]+(:\d{2,5})?$/i.test(erp)) return res.status(400).json({ error: 'Bad ERP address' });
  const code = String(crypto.randomInt(100000, 999999));
  pairCodes.set(code, { userId: req.erpUser.id, userName: req.erpUser.name || req.erpUser.username, expires: Date.now() + 60 * 60 * 1000 });
  const get = f => `powershell -NoProfile -ExecutionPolicy Bypass -Command "Invoke-WebRequest -UseBasicParsing '%ERP%/api/eway-helper/files/${f}' -OutFile '%DIR%\\${f}'" || goto :fail`;
  const cmd = [
    '@echo off',
    'title Epsilon E-Way Helper - setup',
    `set "ERP=${erp}"`,
    `set "CODE=${code}"`,
    'set "DIR=%LOCALAPPDATA%\\EpsilonEwayHelper\\app"',
    'echo.',
    'echo  Epsilon E-Way Helper - one time setup for %USERNAME% on %COMPUTERNAME%',
    'echo.',
    'where node >nul 2>nul || (echo  Node.js is not installed on this PC. Install the LTS version, then run this file again. & start https://nodejs.org/en/download & pause & exit /b 1)',
    'if not exist "%DIR%" mkdir "%DIR%"',
    'echo  Downloading the helper from the ERP...',
    ...HELPER_FILES.map(get),
    'echo  Installing (one minute)...',
    'pushd "%DIR%"',
    'call npm install --omit=dev --no-audit --no-fund --loglevel=error || goto :fail',
    'node index.js --pair %ERP% %CODE% || goto :fail',
    'popd',
    'if not exist "%APPDATA%\\EpsilonEwayHelper" mkdir "%APPDATA%\\EpsilonEwayHelper"',
    '>"%APPDATA%\\EpsilonEwayHelper\\install-dir.txt" echo %DIR%',
    'copy /y "%DIR%\\start-hidden.vbs" "%APPDATA%\\Microsoft\\Windows\\Start Menu\\Programs\\Startup\\Epsilon E-Way Helper.vbs" >nul',
    'reg add "HKCU\\Software\\Classes\\epsilon-eway" /ve /d "URL:Epsilon E-Way Helper" /f >nul',
    'reg add "HKCU\\Software\\Classes\\epsilon-eway" /v "URL Protocol" /d "" /f >nul',
    'reg add "HKCU\\Software\\Classes\\epsilon-eway\\shell\\open\\command" /ve /d "wscript.exe \\"%DIR%\\start-hidden.vbs\\"" /f >nul',
    'wscript "%DIR%\\start-hidden.vbs"',
    'echo.',
    'echo  Done. The helper is running and starts with Windows. You can close this window.',
    'timeout /t 8 >nul',
    'exit /b 0',
    ':fail',
    'echo.',
    'echo  Setup did not finish. Check the internet / ERP connection and run this file again.',
    'pause',
    'exit /b 1',
    '',
  ].join('\r\n');
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Disposition', 'attachment; filename="EpsilonEwayHelper-Setup.cmd"');
  res.send(cmd);
});

/* the helper says it is alive while it is busy with a job (so the ERP does not show it as "not running") */
router.post('/helper/ping', (req, res, next) => next(), (req, res) => {
  const tok = (req.headers.authorization || '').replace(/^Bearer\s+/, '').trim();
  const h = findHelper(tok);
  if (!h) return res.status(401).json({ error: 'not paired' });
  h.lastSeen = now(); h.busy = !!req.body?.busy;
  res.json({ ok: true });
});

/* ── pairing ── */
router.post('/pair/start', needUser, (req, res) => {
  const code = String(crypto.randomInt(100000, 999999));
  pairCodes.set(code, { userId: req.erpUser.id, userName: req.erpUser.name || req.erpUser.username, expires: Date.now() + 10 * 60 * 1000 });
  res.json({ code, expiresInMin: 10 });
});
router.post('/pair/finish', (req, res) => {
  const { code, machine } = req.body || {};
  const p = pairCodes.get(String(code || '').trim());
  if (!p || p.expires < Date.now()) return res.status(400).json({ error: 'Code is wrong or expired — make a new one in the ERP.' });
  pairCodes.delete(String(code).trim());
  const token = crypto.randomBytes(32).toString('hex');
  const machineName = String(machine || 'PC').slice(0, 60);
  helpers = helpers.filter(h => !(h.userId === p.userId && h.machine === machineName));   // re-pairing the same PC replaces it
  const h = { id: crypto.randomBytes(6).toString('hex'), userId: p.userId, userName: p.userName, machine: machineName, tokenHash: sha(token), createdAt: now(), lastSeen: now() };
  helpers.push(h); writeJ(HELPERS, helpers);
  res.json({ token, helperId: h.id, user: p.userName });
});
router.get('/status', needUser, (req, res) => {
  const srv = SERVER_MODE ? [{ id: 'server', machine: 'ERP Server', server: true, lastSeen: serverHelpers.map(h => h.lastSeen).filter(Boolean).sort().pop() || null,
    online: serverHelpers.some(online), busy: serverHelpers.length > 0 && serverHelpers.every(h => online(h) && h.busy) }] : [];
  res.json([...srv, ...helpers.filter(h => h.userId === req.erpUser.id).map(h => ({ id: h.id, machine: h.machine, lastSeen: h.lastSeen, online: online(h), busy: online(h) && !!h.busy }))]);
});
router.delete('/helpers/:id', needUser, (req, res) => {
  helpers = helpers.filter(h => !(h.id === req.params.id && h.userId === req.erpUser.id)); writeJ(HELPERS, helpers); res.json({ ok: true });
});

/* ── jobs (ERP side) ── */
router.post('/jobs', needUser, (req, res) => {
  const { companyId, json, docs } = req.body || {};
  const kind = ['cancel', 'check', 'gst'].includes(req.body?.kind) ? req.body.kind : 'generate';
  /* GST search: the helper opens the GST portal's public taxpayer search; nothing is saved here, the form fills itself */
  if (kind === 'gst') {
    const gstin = String(req.body?.gstin || '').toUpperCase().replace(/\s/g, '');
    if (!/^[0-9]{2}[A-Z0-9]{13}$/.test(gstin)) return res.status(400).json({ error: 'Enter the 15-character GSTIN first.' });
    const on = runnersFor(req.erpUser.id);
    if (!on.length) return res.status(409).json({ error: NOT_RUNNING() });
    /* a new search ends this user's earlier GST searches still running — their Chrome closes at once */
    jobs.forEach(x => { if (x.kind === 'gst' && x.userId === req.erpUser.id && !['done', 'failed'].includes(x.status)) { x.status = 'failed'; x.message = 'Replaced by a new search.'; x.updatedAt = now(); } });
    const job = { id: crypto.randomBytes(8).toString('hex'), userId: req.erpUser.id, userName: req.erpUser.name || req.erpUser.username, companyId: companyId || '',
      kind, gstin, docs: [], status: 'queued', message: 'Waiting for the helper on your PC…', results: [], createdAt: now(), updatedAt: now() };
    jobs.unshift(job); saveJobs();
    wake(on);
    return res.json(publicJob(job));
  }
  const ewbNo = String(req.body?.ewbNo || '').replace(/\D/g, '');
  if (!companyId) return res.status(400).json({ error: 'companyId required' });
  if (kind === 'generate' && (!json || !Array.isArray(json.billLists) || !json.billLists.length)) return res.status(400).json({ error: 'Nothing to send.' });
  if (kind !== 'generate' && (!/^\d{12}$/.test(ewbNo) || !req.body?.dcId)) return res.status(400).json({ error: 'E-way bill no. and DC are needed.' });
  const mine = runnersFor(req.erpUser.id);
  if (!mine.length) return res.status(409).json({ error: NOT_RUNNING() });
  const login = passwords.findLogin(companyId, 'ewaybillgst.gov.in');
  if (!login) return res.status(409).json({ error: 'No e-way portal login in the Password Manager (a login whose URL is ewaybillgst.gov.in).' });
  const job = {
    id: crypto.randomBytes(8).toString('hex'), userId: req.erpUser.id, userName: req.erpUser.name || req.erpUser.username, companyId,
    kind, json: kind === 'generate' ? json : null, docs: Array.isArray(docs) ? docs : [], status: 'queued', message: 'Waiting for the helper on your PC…', results: [],
    ...(kind !== 'generate' ? { ewbNo, dcId: req.body.dcId, reason: Math.min(4, Math.max(1, parseInt(req.body.reason, 10) || 2)), remarks: String(req.body.remarks || '').slice(0, 50), after: req.body.after === 'delete' ? 'delete' : '' } : {}),
    createdAt: now(), updatedAt: now(),
  };
  jobs.unshift(job); saveJobs();
  wake(mine);
  res.json(publicJob(job));
});
router.get('/jobs/:id', needUser, (req, res) => {
  const j = jobs.find(x => x.id === req.params.id && x.userId === req.erpUser.id);
  if (!j) return res.status(404).json({ error: 'Not found' });
  res.json(publicJob(j));
});
router.post('/jobs/:id/cancel', needUser, (req, res) => {
  const j = jobs.find(x => x.id === req.params.id && x.userId === req.erpUser.id);
  if (j && !['done', 'failed'].includes(j.status)) { j.status = 'failed'; j.message = 'Cancelled.'; j.updatedAt = now(); saveJobs(); }
  res.json({ ok: true });
});

/* ── helper side ── */
const takeJob = h => {
  if (SERVER_MODE && !h.server) return null;   // the server does the work; PC helpers stay idle
  const j = jobs.slice().reverse().find(x => (h.server || x.userId === h.userId) && x.status === 'queued' && Date.now() - new Date(x.createdAt).getTime() < 30 * 60 * 1000);
  if (!j) return null;
  const gst = j.kind === 'gst';
  const login = gst ? null : passwords.findLogin(j.companyId, 'ewaybillgst.gov.in');
  j.status = 'picked'; j.helperId = h.id; j.machine = h.machine; j.message = `Opening the ${gst ? 'GST' : 'e-way'} portal ${h.server ? 'on the server' : `on ${h.machine}`}…`; j.updatedAt = now(); saveJobs();
  if (gst) return { id: j.id, kind: 'gst', gstin: j.gstin, portal: GST_SEARCH };
  return { id: j.id, kind: j.kind || 'generate', json: j.json, docs: j.docs, ewbNo: j.ewbNo, reason: j.reason, remarks: j.remarks,
    portal: PORTAL, username: login?.username || '', password: login?.password || '' };
};
router.get('/helper/next', needHelper, (req, res) => {
  if (!req.helper.server) writeJ(HELPERS, helpers);
  const j = takeJob(req.helper);
  if (j) return res.json({ job: j });
  let done = false;
  const finish = () => { if (done) return; done = true; clearTimeout(t); waiting.delete(req.helper.id); const k = takeJob(req.helper); res.json(k ? { job: k } : { job: null }); };
  const t = setTimeout(finish, 25000);
  waiting.set(req.helper.id, finish);
  req.on('close', () => { if (!done) { done = true; clearTimeout(t); waiting.delete(req.helper.id); } });
});
router.post('/helper/jobs/:id/progress', needHelper, (req, res) => {
  const j = jobs.find(x => x.id === req.params.id && x.helperId === req.helper.id);
  if (!j) return res.status(404).json({ error: 'Not found' });
  if (!['done', 'failed'].includes(j.status)) {
    j.status = String(req.body?.status || j.status).slice(0, 30); j.message = String(req.body?.message || '').slice(0, 300);
    // a captcha picture (GST search / e-way login) for the user to read in the ERP
    const cap = req.body?.captcha;
    if (typeof cap === 'string' && /^data:image\/(png|jpe?g|gif);base64,[A-Za-z0-9+/=]+$/.test(cap) && cap.length < 400000) {
      j.captchaImg = cap; j.captchaSeq = parseInt(req.body.captchaSeq, 10) || (j.captchaSeq || 0) + 1; j.captchaAnswer = null;
    }
    j.updatedAt = now(); saveJobs();
  }
  res.json({ ok: true, cancelled: j.status === 'failed' });
});
/* the helper waits here for what the user typed for captcha no. <seq> */
router.get('/helper/jobs/:id/captcha', needHelper, (req, res) => {
  const j = jobs.find(x => x.id === req.params.id && x.helperId === req.helper.id);
  if (!j) return res.status(404).json({ error: 'Not found' });
  const a = j.captchaAnswer;
  const mine = a && a.seq === parseInt(req.query.seq, 10);
  res.json({ cancelled: j.status === 'failed', ...(mine && a.text ? { answer: a.text } : {}), ...(mine && a.refresh ? { refresh: true } : {}) });
});
/* ERP: the user typed the captcha (or wants a new picture) */
router.post('/jobs/:id/captcha', needUser, (req, res) => {
  const j = jobs.find(x => x.id === req.params.id && x.userId === req.erpUser.id);
  if (!j) return res.status(404).json({ error: 'Not found' });
  if (['done', 'failed'].includes(j.status)) return res.status(409).json({ error: 'This search has finished.' });
  const seq = parseInt(req.body?.seq, 10);
  if (seq !== j.captchaSeq) return res.status(409).json({ error: 'A new captcha is shown — type that one.' });
  const text = String(req.body?.answer || '').trim().slice(0, 20);
  if (!req.body?.refresh && !text) return res.status(400).json({ error: 'Type the captcha.' });
  j.captchaAnswer = req.body?.refresh ? { seq, refresh: true } : { seq, text };
  j.message = req.body?.refresh ? 'Getting a new captcha…' : 'Searching on the GST portal…';
  j.updatedAt = now(); saveJobs();
  res.json({ ok: true });
});

/* write the e-way no. into the DC it was made for */
const dcFile = (cid, id) => path.join(ROOT, 'Database', 'Companies', cid, 'DeliveryChallan', String(id), `${id}.json`);
router.post('/helper/jobs/:id/result', needHelper, (req, res) => {
  const j = jobs.find(x => x.id === req.params.id && x.helperId === req.helper.id);
  if (!j) return res.status(404).json({ error: 'Not found' });
  delete j.captchaImg; delete j.captchaAnswer;   // the captcha picture is not kept once the job ends
  if (j.kind === 'gst') {
    // taxpayer details read from the GST portal — only handed back to the form, never written to a file here
    const g = req.body?.gst && typeof req.body.gst === 'object' ? req.body.gst : null;
    const keep = ['gstin', 'legalName', 'tradeName', 'status', 'regDate', 'constitution', 'taxpayerType', 'address', 'jurisdiction', 'natureOfBusiness'];
    j.gst = g ? Object.fromEntries(keep.filter(k => g[k]).map(k => [k, String(g[k]).replace(/\s+/g, ' ').trim().slice(0, 300)])) : null;
    const error = String(req.body?.error || '').slice(0, 300);
    delete j.captchaImg; delete j.captchaAnswer;
    j.status = j.gst && j.gst.legalName ? 'done' : 'failed';
    j.message = j.status === 'done' ? `Details of ${j.gstin} read from the GST portal and filled in.` : (error || `The details of ${j.gstin} could not be read from the GST portal.`);
    j.updatedAt = now(); saveJobs();
    return res.json({ ok: true });
  }
  if (j.kind === 'cancel' || j.kind === 'check') {
    // the helper reports what the portal says about this e-way bill: cancelled / active / unknown
    const r = (Array.isArray(req.body?.results) ? req.body.results : []).find(x => String(x.ewbNo || '') === j.ewbNo) || {};
    // expired = "not active" on the cancel page and no CANCELLED mark on its print: validity over, not cancelled
    const status = ['cancelled', 'active', 'expired'].includes(r.status) ? r.status : 'unknown';
    const error = String(req.body?.error || r.message || '').slice(0, 300);
    // what the portal shows for this e-way bill (generated date-time, valid upto, distance) — kept on the DC
    const det = r.details || {};
    const detUpd = { ...(det.ewbDate ? { ewayGenDate: String(det.ewbDate).slice(0, 40) } : {}), ...(det.validUpto ? { ewayValidUpto: String(det.validUpto).slice(0, 40) } : {}), ...(/^\d+$/.test(String(det.distanceKm || '')) ? { approxDistanceKm: String(det.distanceKm) } : {}) };
    if (status === 'active' || status === 'expired') {
      // also undoes an earlier "cancelled" that was wrong
      try {
        const f = dcFile(j.companyId, j.dcId), dc = JSON.parse(fs.readFileSync(f, 'utf8'));
        if (String(dc.ewayBillNo) === j.ewbNo) {
          const { ewayCancelledAt, ewayCancelReason, ...rest } = dc;
          fs.writeFileSync(f, JSON.stringify({ ...rest, ...detUpd, ewayStatus: status === 'expired' ? 'expired' : 'generated', updatedAt: now() }, null, 2));
        }
      } catch { /* DC removed meanwhile */ }
    }
    if (status === 'cancelled') {
      try {
        const f = dcFile(j.companyId, j.dcId), dc = JSON.parse(fs.readFileSync(f, 'utf8'));
        if (String(dc.ewayBillNo) === j.ewbNo) {
          fs.writeFileSync(f, JSON.stringify({ ...dc, ...detUpd, ewayStatus: 'cancelled', ewayCancelledAt: now(), ewayCancelReason: j.kind === 'cancel' ? j.reason : dc.ewayCancelReason, ewayJobId: j.id, updatedAt: now() }, null, 2));
        }
      } catch { /* DC removed meanwhile */ }
    }
    j.outcome = status;
    j.results = [{ ewbNo: j.ewbNo, dcId: j.dcId, status }];
    j.status = status === 'unknown' ? 'failed' : 'done';
    j.message = status === 'cancelled' ? `E-way bill ${j.ewbNo} is cancelled on the portal.`
      : status === 'expired' ? `E-way bill ${j.ewbNo} is NOT ACTIVE on the portal — its validity is over. It is not cancelled${j.kind === 'cancel' ? ', and it can no longer be cancelled' : ''}.`
      : status === 'active' ? `E-way bill ${j.ewbNo} is ACTIVE on the portal${j.kind === 'cancel' ? ' — it was not cancelled' : ' — details updated'}.${error ? ' ' + error : ''}`
        : (error || `The status of e-way bill ${j.ewbNo} could not be read from the portal.`);
    j.updatedAt = now(); saveJobs();
    return res.json({ ok: true, status });
  }
  const results = Array.isArray(req.body?.results) ? req.body.results : [];
  const saved = [];
  results.forEach(r => {
    const doc = j.docs.find(d => String(d.docNo).trim() === String(r.docNo || '').trim());
    if (!doc || !/^\d{12}$/.test(String(r.ewbNo || ''))) return;
    const f = dcFile(j.companyId, doc.dcId);
    try {
      const dc = JSON.parse(fs.readFileSync(f, 'utf8'));
      const upd = { ...dc, ewayBillNo: String(r.ewbNo), ...(r.ewbDate ? { ewayGenDate: String(r.ewbDate) } : {}), ...(r.validUpto ? { ewayValidUpto: String(r.validUpto) } : {}), ...(/^\d+$/.test(String(r.distanceKm || '')) ? { approxDistanceKm: String(r.distanceKm) } : {}),
        ewayStatus: 'generated', ewayJobId: j.id, updatedAt: now() };
      fs.writeFileSync(f, JSON.stringify(upd, null, 2));
      saved.push({ dcId: doc.dcId, dcNo: dc.dcNo, docNo: doc.docNo, ewbNo: String(r.ewbNo) });
    } catch { /* DC removed meanwhile */ }
  });
  j.results = saved;
  const error = String(req.body?.error || '').slice(0, 300);
  j.status = saved.length ? 'done' : 'failed';
  j.message = saved.length ? `${saved.length} of ${j.docs.length} e-way bill${j.docs.length === 1 ? '' : 's'} saved in the DC${saved.length === 1 ? '' : 's'}.${error ? ' ' + error : ''}` : (error || 'No e-way bill number could be read from the portal.');
  j.updatedAt = now(); saveJobs();
  res.json({ ok: true, saved });
});

/* start the server workers (server.js, after it listens): each is the helper program in its own folder, headless,
   talking to this server on localhost with a token made for this run. Restarted if it stops. */
function startServerHelpers(port) {
  if (!SERVER_MODE || serverHelpers.length) return;
  const { spawn } = require('child_process');
  let browserPath = '';
  for (const p of [
    path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Google\\Chrome\\Application\\chrome.exe'),
    path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Google\\Chrome\\Application\\chrome.exe'),
    path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Microsoft\\Edge\\Application\\msedge.exe'),
    path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Microsoft\\Edge\\Application\\msedge.exe'),
  ]) { if (fs.existsSync(p)) { browserPath = p; break; } }
  if (!browserPath) { try { const p = require('puppeteer').executablePath(); if (p && fs.existsSync(p)) browserPath = p; } catch { /* none */ } }
  if (!browserPath) { console.warn('[eway] no Chrome / Edge on the server — the portal workers are not started'); return; }
  const children = [];
  for (let i = 1; i <= SERVER_WORKERS; i++) {
    const token = crypto.randomBytes(32).toString('hex');
    const h = { id: `server-${i}`, server: true, userId: '*', machine: 'ERP Server', tokenHash: sha(token), lastSeen: null };
    serverHelpers.push(h);
    const home = path.join(DIR, `server-worker-${i}`);
    fs.mkdirSync(home, { recursive: true });
    fs.writeFileSync(path.join(home, 'config.json'), JSON.stringify({ server: `http://127.0.0.1:${port}`, token, user: 'ERP Server', browserPath }, null, 2));
    let tries = 0;
    const run = () => {
      const c = spawn(process.execPath, [path.join(ROOT, 'eway-helper', 'index.js')], {
        env: { ...process.env, EWAY_HELPER_HOME: home, EWAY_SERVER_MODE: '1', EWAY_HEADLESS: '1', EWAY_HELPER_LOCK_PORT: String(47380 + i) },
        stdio: 'ignore', windowsHide: true,
      });
      children[i] = c;
      c.on('exit', () => { if (process.exitCode == null && !startServerHelpers.stopping) setTimeout(run, Math.min(60000, 3000 * ++tries)); });
    };
    run();
  }
  const stop = () => { startServerHelpers.stopping = true; children.forEach(c => { try { c && c.kill(); } catch { /* gone */ } }); };
  process.on('exit', stop);
  ['SIGINT', 'SIGTERM'].forEach(sig => process.on(sig, () => { stop(); process.exit(0); }));
  console.log(`[eway] ${SERVER_WORKERS} portal worker(s) started on the server (${path.basename(browserPath)})`);
}

module.exports = router;
module.exports.startServerHelpers = startServerHelpers;
