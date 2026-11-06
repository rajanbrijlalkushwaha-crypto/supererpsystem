/**
 * tallyReports.js — Balance Sheet and Profit & Loss read live from Tally.
 *
 * READ-ONLY BY DESIGN. Every request sent to Tally goes through tallyExport(),
 * which refuses anything that is not an <TALLYREQUEST>Export…</TALLYREQUEST>
 * request. No Import / Alter / Create request can leave this module, so Tally's
 * books cannot be changed or corrupted from here.
 *
 *   GET /api/tally-reports/companies
 *   GET /api/tally-reports/balance-sheet?companyId=C3&from=YYYY-MM-DD&to=YYYY-MM-DD
 *   GET /api/tally-reports/profit-loss  ?companyId=C3&from=…&to=…
 *   GET /api/tally-reports/profit-by-fy ?companyId=C3
 * Add &fresh=1 to skip the short cache.
 */
const express = require('express');
const http    = require('http');
const fs      = require('fs');
const path    = require('path');
const { ROOT } = require('./helpers');

const router = express.Router();

/* ── saved copies (in the ERP, never in Tally) ──
   Each successful fetch is stored per ERP company as Database/Companies/<cid>/TallyReports/
   bs-<fy>.json, pl-<fy>.json and profit-by-fy.json. Opening the page reads these copies
   without contacting Tally; "Fetch from Tally" reads fresh figures and overwrites them. */
const snapDir  = cid => path.join(ROOT, 'Database', 'Companies', String(cid || '').replace(/[^A-Za-z0-9]/g, ''), 'TallyReports');
const snapFile = (cid, name) => path.join(snapDir(cid), name.replace(/[^A-Za-z0-9-]/g, '') + '.json');
const saveSnap = (cid, name, data) => {
  if (!cid) return;
  fs.mkdirSync(snapDir(cid), { recursive: true });
  const f = snapFile(cid, name), tmp = f + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify({ ...data, savedAt: new Date().toISOString() }, null, 1));
  fs.renameSync(tmp, f);   // replace in one step so a half-written copy is never read
};
const readSnap = (cid, name) => { try { return JSON.parse(fs.readFileSync(snapFile(cid, name), 'utf8')); } catch { return null; } };
const fyKey = fy => (/^\d{2}-\d{2}$/.test(String(fy || '')) ? fy : '');

/* saved copies are served even while Tally fetching is paused — no Tally contact */
router.get('/saved', (req, res) => {
  const cid = req.query.companyId, fy = fyKey(req.query.fy);
  if (!cid || !fy) return res.status(400).json({ error: 'companyId and fy (e.g. 26-27) are required' });
  res.json({ bs: readSnap(cid, `bs-${fy}`), pl: readSnap(cid, `pl-${fy}`), fy: readSnap(cid, 'profit-by-fy') });
});

/* ── Tally debtors ↔ ERP clients ──
   The Sundry Debtors list fetched from Tally is saved as TallyReports/debtors.json.
   Each Tally ledger is matched to an ERP client (GSTIN first, then name); the user
   approves the right pairs, stored in TallyReports/debtor-links.json. An approved
   ledger is "already in the ERP" — not to be imported again; its balance comes from
   Tally. Nothing here writes to Tally. */
const jstore = require('./json-store');
const nameKey = s => String(s || '').toLowerCase()
  .replace(/^\s*m\s*\/\s*s\.?\s*/, '').replace(/&/g, ' and ')
  .replace(/\bprivate\b/g, 'pvt').replace(/\blimited\b/g, 'ltd').replace(/\bcompany\b/g, 'co')
  .replace(/[^a-z0-9]/g, '');
const words = s => new Set(String(s || '').toLowerCase().replace(/&/g, ' ').replace(/\bprivate\b/g, 'pvt').replace(/\blimited\b/g, 'ltd')
  .split(/[^a-z0-9]+/).filter(w => w.length > 1 && !['ms', 'the', 'and', 'of', 'pvt', 'ltd', 'co'].includes(w)));
const similarity = (a, b) => {
  const A = words(a), B = words(b); if (!A.size || !B.size) return 0;
  let n = 0; A.forEach(w => { if (B.has(w)) n++; });
  return n / Math.max(A.size, B.size);
};
/* Sundry Debtors are matched to ERP clients, Sundry Creditors to ERP vendors — same logic.
   Replies keep the field names "client"/"clientId" for both, the id being the vendorId for creditors. */
const PARTY = {
  debtors:   { snap: 'debtors',   links: 'debtor-links',   store: 'Client', id: 'clientId', name: c => c.clientName || c.companyName, group: '$$GroupSundryDebtors',   what: 'client' },
  creditors: { snap: 'creditors', links: 'creditor-links', store: 'Vendor', id: 'vendorId', name: v => v.vendorName || v.companyName, group: '$$GroupSundryCreditors', what: 'vendor' },
};
const readLinks  = (cid, kind = 'debtors') => readSnap(cid, PARTY[kind].links)?.links || {};
const writeLinks = (cid, links, kind = 'debtors') => saveSnap(cid, PARTY[kind].links, { links });

function matchDebtors(cid, snap, kind = 'debtors') {
  const K = PARTY[kind];
  const clients = jstore.readAll(K.store, cid).filter(c => c && c[K.id] != null).map(c => ({
    clientId: c[K.id], name: K.name(c) || '', gstin: String(c.gstin || c.gst || '').toUpperCase().trim(),
    city: c.city || '', state: c.state || '',
  })).filter(c => c.name);
  const byGst = {}, byName = {};
  clients.forEach(c => { if (c.gstin) byGst[c.gstin] = c; byName[nameKey(c.name)] = byName[nameKey(c.name)] || c; });
  const links = readLinks(cid, kind);
  /* GSTINs of the ERP's own companies — such a ledger is an inter-company account, not a client */
  const own = {};
  try {
    const base = path.join(ROOT, 'Database', 'Companies');
    fs.readdirSync(base).filter(d => /^C\d+$/.test(d)).forEach(d => {
      try { const j = JSON.parse(fs.readFileSync(path.join(base, d, 'company.json'), 'utf8')); const g = String(j.gstin || j.gst || '').toUpperCase().trim(); if (g) own[g] = j.companyName || d; } catch { /* skip */ }
    });
  } catch { /* none */ }
  /* an ERP client already approved for one Tally ledger is taken — it is not offered again,
     and a client whose GSTIN differs from the ledger's is a different branch, not a match */
  const taken = new Set(Object.values(links).map(l => String(l.clientId)));
  const free = c => !taken.has(String(c.clientId));
  const otherGst = (l, c) => c.gstin && (l.gstins || []).length > 0 && !(l.gstins || []).includes(c.gstin);
  // a party that some ledger matches exactly (GSTIN or name) is not suggested for another one
  const exactUsed = new Set();
  (snap?.ledgers || []).forEach(l => {
    if (links[l.name]) return;
    const g = (l.gstins || []).find(x => byGst[x] && free(byGst[x])), byN = byName[nameKey(l.name)];
    const hit = g ? byGst[g] : byN && free(byN) && !otherGst(l, byN) ? byN : null;
    if (hit) exactUsed.add(String(hit.clientId));
  });
  const rows = (snap?.ledgers || []).map(l => {
    const ownCo = (l.gstins || []).map(g => own[g]).find(Boolean) || null;
    let match = null;
    const g = (l.gstins || []).find(x => byGst[x] && free(byGst[x]));
    const byN = byName[nameKey(l.name)];
    if (g) match = { by: 'gstin', client: byGst[g] };
    else if (byN && free(byN) && !otherGst(l, byN)) match = { by: 'name', client: byN };
    else {
      let best = null, score = 0;
      for (const c of clients) { if (!free(c) || exactUsed.has(String(c.clientId)) || otherGst(l, c)) continue; const sc = similarity(l.name, c.name); if (sc > score) { score = sc; best = c; } }
      if (best && score >= 0.6) match = { by: 'suggest', client: best, score: +score.toFixed(2) };
    }
    const link = links[l.name] || null;
    const linked = link ? clients.find(c => String(c.clientId) === String(link.clientId)) || { clientId: link.clientId, name: link.clientName || `(${K.what} removed)` } : null;
    return { ...l, match, ownCompany: ownCo, link: link && { ...link, client: linked } };
  });
  return { rows, clientCount: clients.length };
}

for (const kind of Object.keys(PARTY)) {
  const K = PARTY[kind];
  router.get(`/${kind}/saved`, (req, res) => {
    const cid = req.query.companyId;
    if (!cid) return res.status(400).json({ error: 'companyId is required' });
    const snap = readSnap(cid, K.snap);
    if (!snap) return res.json({ saved: null, rows: [] });
    const { rows, clientCount } = matchDebtors(cid, snap, kind);
    const { ledgers, ...meta } = snap;
    res.json({ saved: meta, rows, clientCount });
  });
  /* approve: this Tally ledger IS this ERP client / vendor (already created — don't import) */
  router.post(`/${kind}/link`, (req, res) => {
    const { companyId: cid, tallyName, clientId } = req.body || {};
    if (!cid || !tallyName || !clientId) return res.status(400).json({ error: 'companyId, tallyName and clientId are required' });
    const rec = jstore.readAll(K.store, cid).find(c => String(c[K.id]) === String(clientId));
    if (!rec) return res.status(404).json({ error: `ERP ${K.what} not found` });
    const links = readLinks(cid, kind);
    links[tallyName] = { clientId: rec[K.id], clientName: K.name(rec) || '', approvedAt: new Date().toISOString(),
      approvedBy: req.headers['x-user-name'] || req.body.approvedBy || '' };
    writeLinks(cid, links, kind);
    res.json({ ok: true, link: links[tallyName] });
  });
  router.post(`/${kind}/unlink`, (req, res) => {
    const { companyId: cid, tallyName } = req.body || {};
    if (!cid || !tallyName) return res.status(400).json({ error: 'companyId and tallyName are required' });
    const links = readLinks(cid, kind); delete links[tallyName]; writeLinks(cid, links, kind);
    res.json({ ok: true });
  });
}

/* ── Tally Sales Orders ↔ ERP Sales Orders ──
   Sales Order vouchers fetched from Tally (one file per FY: TallyReports/so-<fy>.json) are
   matched to ERP sales orders: the client's PO number first, then the same party (through
   the approved debtor links or the name) with the same amount, else same party + date as
   a suggestion. Approved pairs are stored in TallyReports/so-links.json. Nothing here
   writes to Tally. */
const poKey = s => String(s || '').toUpperCase().replace(/DATED?[\s\S]*$/, '').replace(/[^A-Z0-9]/g, '');
const readSoLinks  = cid => readSnap(cid, 'so-links')?.links || {};
const writeSoLinks = (cid, links) => saveSnap(cid, 'so-links', { links });
const soKey = o => `${o.number}|${o.date}`;   // a Tally SO: number + date (numbers can repeat across years)

function matchSalesOrders(cid, snap) {
  const erp = jstore.readAll('SalesOrder', cid).filter(o => o && o.orderId != null).map(o => ({
    orderId: o.orderId, orderNo: o.orderNo || '', orderDate: o.orderDate || '', customerName: o.customerName || o.party || '',
    customerCode: String(o.customerCode || ''), customerPO: o.customerPO || o.reference || '', grandTotal: parseFloat(o.grandTotal) || 0, status: o.status || '',
  }));
  const dLinks = readLinks(cid);                       // Tally debtor name → ERP client
  const links  = readSoLinks(cid);
  const byPO = {}; erp.forEach(o => { const k = poKey(o.customerPO); if (k.length >= 4) (byPO[k] = byPO[k] || []).push(o); });
  const sameParty = (t, o) => {
    const l = dLinks[t.party];
    if (l && String(l.clientId) === o.customerCode) return true;
    return nameKey(t.party) === nameKey(o.customerName);
  };
  const rows = (snap?.orders || []).map(t => {
    let match = null;
    const k = poKey(t.reference);
    const poHits = k.length >= 4 ? (byPO[k] || Object.entries(byPO).filter(([pk]) => pk.startsWith(k) || k.startsWith(pk)).flatMap(([, v]) => v)) : [];
    if (poHits.length) {
      const best = poHits.find(o => Math.abs(o.grandTotal - t.amount) < 1) || poHits[0];
      match = { by: 'po', order: best };
    } else {
      const party = erp.filter(o => sameParty(t, o));
      const amt = party.find(o => Math.abs(o.grandTotal - t.amount) < 1);
      if (amt) match = { by: 'amount', order: amt };
      else { const d = party.find(o => o.orderDate === t.date); if (d) match = { by: 'suggest', order: d }; }
    }
    const link = links[soKey(t)] || null;
    const linked = link ? erp.find(o => String(o.orderId) === String(link.orderId)) || { orderId: link.orderId, orderNo: link.orderNo || '(removed)' } : null;
    return { ...t, key: soKey(t), match, link: link && { ...link, order: linked }, partyClient: dLinks[t.party] || null };
  });
  return { rows, erpOrders: erp };
}

router.get('/sales-orders/saved', (req, res) => {
  const cid = req.query.companyId, fy = fyKey(req.query.fy);
  if (!cid || !fy) return res.status(400).json({ error: 'companyId and fy are required' });
  const snap = readSnap(cid, `so-${fy}`);
  const { rows, erpOrders } = matchSalesOrders(cid, snap);
  const fyErp = erpOrders.filter(o => o.orderDate >= `20${fy.slice(0, 2)}-04-01` && o.orderDate <= `20${fy.slice(3, 5)}-03-31`);
  const used = new Set(rows.filter(r => r.link).map(r => String(r.link.orderId)));
  res.json({ saved: snap ? (({ orders, ...m }) => m)(snap) : null, rows, erpOrders,
    erpNotInTally: fyErp.filter(o => !used.has(String(o.orderId))).length, erpInFy: fyErp.length });
});
router.post('/sales-orders/link', (req, res) => {
  const { companyId: cid, key, orderId } = req.body || {};
  if (!cid || !key || !orderId) return res.status(400).json({ error: 'companyId, key and orderId are required' });
  const o = jstore.readAll('SalesOrder', cid).find(x => String(x.orderId) === String(orderId));
  if (!o) return res.status(404).json({ error: 'ERP sales order not found' });
  const links = readSoLinks(cid);
  links[key] = { orderId: o.orderId, orderNo: o.orderNo || '', approvedAt: new Date().toISOString() };
  writeSoLinks(cid, links);
  res.json({ ok: true, link: links[key] });
});
router.post('/sales-orders/unlink', (req, res) => {
  const { companyId: cid, key } = req.body || {};
  if (!cid || !key) return res.status(400).json({ error: 'companyId and key are required' });
  const links = readSoLinks(cid); delete links[key]; writeSoLinks(cid, links);
  res.json({ ok: true });
});

/* PAUSED: TallyPrime showed an error and closed while these reports were being read.
   Until the cause is found nothing is sent to Tally — every route answers 503. */
const TALLY_PAUSED = false;   // re-enabled 16-10-2026 after the gentler version was tested
router.use((req, res, next) => TALLY_PAUSED
  ? res.status(503).json({ code: 'PAUSED', error: 'Tally fetch is paused — nothing is sent to Tally until the crash is fixed.' })
  : next());
const CFG_FILE = path.join(ROOT, 'Database', 'TallyImport', 'config.json');
const readCfg  = () => { try { return JSON.parse(fs.readFileSync(CFG_FILE, 'utf8')); } catch { return {}; } };

/* ── the only door to Tally: export requests only, one at a time ──
   Requests are queued so the ERP never has two requests open in Tally together,
   with a short pause between them so Tally (and other tools reading it) keep up. */
let queue = Promise.resolve();
const GAP_MS = 400;
function tallyExport(host, port, xml, timeoutMs = 90000) {
  const run = queue.then(() => tallyExportNow(host, port, xml, timeoutMs));
  queue = run.catch(() => {}).then(() => new Promise(r => setTimeout(r, GAP_MS)));
  return run;
}
function tallyExportNow(host, port, xml, timeoutMs) {
  const kind = (xml.match(/<TALLYREQUEST>\s*([^<]*?)\s*<\/TALLYREQUEST>/i) || [])[1] || '';
  if (!/^Export( Data)?$/i.test(kind)) return Promise.reject(new Error('Blocked: only read-only Export requests may be sent to Tally.'));
  return new Promise((resolve, reject) => {
    const buf = Buffer.from(xml, 'utf8');
    const req = http.request({ hostname: host, port, path: '/', method: 'POST',
      headers: { 'Content-Type': 'text/xml;charset=utf-8', 'Content-Length': buf.length } }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks);
        // Tally may answer in UTF-16 LE
        const txt = raw.length > 1 && raw[1] === 0 ? raw.toString('utf16le') : raw.toString('utf8');
        resolve(txt.replace(/\u0000/g, ''));
      });
    });
    req.on('error', e => reject(new Error(`Cannot reach Tally at ${host}:${port} — ${e.message}. Open TallyPrime with the company loaded.`)));
    req.setTimeout(timeoutMs, () => { req.destroy(); reject(new Error('Tally did not answer in time — is the company open in TallyPrime?')); });
    req.write(buf); req.end();
  });
}

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const dec = s => String(s || '').replace(/&#4;\s*/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").trim();
const num = s => { const t = String(s || '').trim(); if (!t) return null; const n = parseFloat(t); return isNaN(n) ? null : n; };
const ymd = d => String(d || '').replace(/-/g, '');

/* ── which port is Tally's data server? (the configured one may be the licence server) ── */
let conn = null, connAt = 0;
const COMPANY_XML = `<ENVELOPE><HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Collection</TYPE><ID>ErpCoList</ID></HEADER><BODY><DESC><STATICVARIABLES><SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT></STATICVARIABLES><TDL><TDLMESSAGE><COLLECTION NAME="ErpCoList"><TYPE>Company</TYPE><FETCH>NAME,STARTINGFROM,BOOKSFROM</FETCH></COLLECTION></TDLMESSAGE></TDL></DESC></BODY></ENVELOPE>`;
async function connect() {
  if (conn && Date.now() - connAt < 10 * 60 * 1000) return conn;
  const cfg  = readCfg();
  const host = cfg.host || 'localhost';
  const ports = [...new Set([cfg.reportPort, cfg.port, 9000].filter(Boolean).map(Number))];
  let lastErr = null;
  for (const port of ports) {
    try {
      const xml = await tallyExport(host, port, COMPANY_XML, 15000);
      if (!/<COMPANY NAME=/i.test(xml)) continue;   // e.g. the licence server answers on 9999
      const companies = [...xml.matchAll(/<COMPANY NAME="([^"]*)"[^>]*>([\s\S]*?)<\/COMPANY>/g)].map(m => ({
        name: dec(m[1]),
        startingFrom: (m[2].match(/<STARTINGFROM[^>]*>(\d{8})</) || [])[1] || '',
        booksFrom:    (m[2].match(/<BOOKSFROM[^>]*>(\d{8})</) || [])[1] || '',
      }));
      conn = { host, port, companies }; connAt = Date.now();
      return conn;
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error(`Tally data server not found on ${host} (tried ports ${ports.join(', ')}). In TallyPrime: F1 Help → Settings → Connectivity → "TallyPrime acts as Server", port 9000.`);
}

/* ── GSTIN check: the Tally company and the ERP company must be the same business ──
   The GSTIN is looked up in the company master and, in newer TallyPrime, in the GST
   Registration (tax unit) master; any valid GSTIN in those read-only replies counts. */
const GSTIN_RE = /\b\d{2}[A-Z]{5}\d{4}[A-Z][A-Z0-9]Z[A-Z0-9]\b/g;
const gstCache = new Map();
/* NOTE: only object TYPES Tally knows may be requested — an unknown type (e.g.
   "GSTRegistration") makes TallyPrime hang. Company and TaxUnit are both safe. */
const gstXml = company =>
  `<ENVELOPE><HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Collection</TYPE><ID>ErpGstTu</ID></HEADER><BODY><DESC>` +
  `<STATICVARIABLES><SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT><SVCURRENTCOMPANY>${esc(company)}</SVCURRENTCOMPANY></STATICVARIABLES>` +
  `<TDL><TDLMESSAGE><COLLECTION NAME="ErpGstTu"><TYPE>TaxUnit</TYPE><FETCH>NAME,GSTREGNUMBER</FETCH></COLLECTION></TDLMESSAGE></TDL></DESC></BODY></ENVELOPE>`;
/* GSTINs of a Tally company: the GSTREGNUMBER of each of its GST registrations (Tax Units) */
async function tallyGstins(c, company) {
  const hit = gstCache.get(company);
  if (hit && Date.now() - hit.at < 10 * 60 * 1000) return hit.list;
  const found = new Set();
  try {
    const xml = await tallyExport(c.host, c.port, gstXml(company), 30000);
    for (const m of xml.matchAll(/<GSTREGNUMBER[^>]*>([^<]*)</g)) {
      const g = m[1].toUpperCase().trim(); if (GSTIN_RE.test(g)) found.add(g); GSTIN_RE.lastIndex = 0;
    }
  } catch { /* reported as "cannot confirm" below */ }
  const list = [...found];
  if (list.length) gstCache.set(company, { at: Date.now(), list });   // kept 10 min
  return list;
}
/* The Tally company whose GSTIN equals the ERP company's GSTIN. Companies open in Tally
   are tried best-name-first; if none matches, nothing is shown ("Company not matched"). */
async function resolveCompany(c, cid, wanted) {
  let erp = {};
  try { erp = JSON.parse(fs.readFileSync(path.join(ROOT, 'Database', 'Companies', cid, 'company.json'), 'utf8')); } catch { /* none */ }
  const erpGst = String(erp.gstin || erp.gst || '').toUpperCase().trim();
  const fail = (code, message, extra = {}) => Object.assign(new Error(message), { code, ...extra });
  if (!erpGst) throw fail('NO_ERP_GSTIN', 'This ERP company has no GSTIN — add it in Company Info first.');
  if (!c.companies.length) throw new Error('No company is open in TallyPrime.');
  const first = pickCompany(c, cid, wanted);
  const order = [first, ...c.companies.filter(x => x !== first)];
  const seen = [];
  for (const co of order) {
    const g = await tallyGstins(c, co.name);
    seen.push({ name: co.name, gstins: g });
    if (g.includes(erpGst)) return { co, match: { gstin: erpGst, tallyCompany: co.name } };
  }
  const withGst = seen.filter(s => s.gstins.length);
  if (!withGst.length) throw fail('NO_TALLY_GSTIN', `Could not read a GSTIN for ${seen.map(s => `"${s.name}"`).join(', ')} from Tally, so the company cannot be confirmed. Check the GST registration in Tally.`, { erpGstin: erpGst });
  throw fail('GSTIN_MISMATCH', `Company not matched: the company open in Tally (${withGst.map(s => `"${s.name}" — ${s.gstins.join(', ')}`).join('; ')}) does not have this ERP company's GSTIN ${erpGst}. Open the right company in Tally.`,
    { tallyGstin: withGst.flatMap(s => s.gstins), erpGstin: erpGst, tallyCompanies: withGst.map(s => s.name) });
}

/* the Tally company matching the ERP company (names differ in case / "M/s." punctuation) */
const key = s => String(s || '').toLowerCase().replace(/^m\s*\/?\s*s\.?\s*/, '').replace(/[^a-z0-9]/g, '');
function pickCompany(c, cid, wanted) {
  if (!c.companies.length) throw new Error('No company is open in TallyPrime.');
  if (wanted) { const w = c.companies.find(x => x.name === wanted); if (w) return w; }
  let erpName = '';
  try { erpName = JSON.parse(fs.readFileSync(path.join(ROOT, 'Database', 'Companies', cid, 'company.json'), 'utf8')).companyName || ''; } catch { /* no company file */ }
  return c.companies.find(x => key(x.name) === key(erpName)) || c.companies[0];
}

const reportXml = (report, company, from, to) =>
  `<ENVELOPE><HEADER><TALLYREQUEST>Export Data</TALLYREQUEST></HEADER><BODY><EXPORTDATA><REQUESTDESC><REPORTNAME>${report}</REPORTNAME>` +
  `<STATICVARIABLES><SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT><SVCURRENTCOMPANY>${esc(company)}</SVCURRENTCOMPANY>` +
  `<SVFROMDATE>${ymd(from)}</SVFROMDATE><SVTODATE>${ymd(to)}</SVTODATE><EXPLODEFLAG>Yes</EXPLODEFLAG></STATICVARIABLES></REQUESTDESC></EXPORTDATA></BODY></ENVELOPE>`;

/* rows of a Tally report export: { name, kind: 'head'|'line', sub, main } in report order */
function parseRows(xml) {
  const re = /<DSPDISPNAME>([^<]*)<\/DSPDISPNAME>\s*<\/DSPACCNAME>\s*(?:<\/BSNAME>)?\s*<(BSAMT|PLAMT)>([\s\S]*?)<\/\2>/g;
  const rows = []; let m;
  while ((m = re.exec(xml))) {
    const a = m[3];
    rows.push({ name: dec(m[1]), kind: m[2] === 'PLAMT' ? 'head' : 'line',
      sub: num((a.match(/<(?:BS|PL)SUBAMT>([^<]*)</) || [])[1]), main: num((a.match(/<BSMAINAMT>([^<]*)</) || [])[1]) });
  }
  return rows;
}

/* primary groups → side of the balance sheet (debit-natured = assets) */
let groupCache = null, groupAt = 0;
async function primaryGroups(c, company) {
  if (groupCache && groupCache.company === company && Date.now() - groupAt < 10 * 60 * 1000) return groupCache.map;
  const xml = await tallyExport(c.host, c.port,
    `<ENVELOPE><HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Collection</TYPE><ID>ErpGrpList</ID></HEADER><BODY><DESC><STATICVARIABLES><SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT><SVCURRENTCOMPANY>${esc(company)}</SVCURRENTCOMPANY></STATICVARIABLES><TDL><TDLMESSAGE><COLLECTION NAME="ErpGrpList"><TYPE>Group</TYPE><FETCH>NAME,PARENT,ISREVENUE,ISDEEMEDPOSITIVE</FETCH></COLLECTION></TDLMESSAGE></TDL></DESC></BODY></ENVELOPE>`, 30000);
  const map = {};
  for (const m of xml.matchAll(/<GROUP NAME="([^"]*)"[^>]*>([\s\S]*?)<\/GROUP>/g)) {
    const b = m[2], g = t => dec((b.match(new RegExp(`<${t}[^>]*>([^<]*)</${t}>`)) || [])[1]);
    if (g('PARENT') !== 'Primary' && g('PARENT') !== '') continue;
    map[dec(m[1])] = { revenue: g('ISREVENUE') === 'Yes', asset: g('ISDEEMEDPOSITIVE') === 'Yes' };
  }
  groupCache = { company, map }; groupAt = Date.now();
  return map;
}

function buildBalanceSheet(rows, groups) {
  const SPECIAL = ['Profit & Loss A/c', 'Difference in opening balances'];
  const sides = { liabilities: [], assets: [] };
  let side = 'liabilities', head = null;
  for (const r of rows) {
    const isHead = r.main !== null || (groups[r.name] && !groups[r.name].revenue) || SPECIAL.includes(r.name);
    if (isHead) {
      if (groups[r.name]) side = groups[r.name].asset ? 'assets' : 'liabilities';
      else if (r.name === 'Profit & Loss A/c') side = (r.main || 0) >= 0 ? 'liabilities' : 'assets';
      // Tally exports debit (asset-side) amounts as negatives — show them as Tally displays them
      const sign = side === 'assets' ? -1 : 1;
      const amount = r.main == null ? 0 : (r.name === 'Profit & Loss A/c' ? Math.abs(r.main) : sign * r.main);
      head = { name: r.name, amount, items: [], sign };
      sides[side].push(head);
    } else if (head) {
      head.items.push({ name: r.name, amount: r.sub == null ? null : head.sign * r.sub });
    }
  }
  const total = list => +list.reduce((s, h) => s + (h.amount || 0), 0).toFixed(2);
  [...sides.liabilities, ...sides.assets].forEach(h => { delete h.sign; });
  return { liabilities: sides.liabilities, assets: sides.assets, totalLiabilities: total(sides.liabilities), totalAssets: total(sides.assets) };
}

const COST_PARTS = ['Opening Stock', 'Add: Purchase Accounts', 'Less: Closing Stock', 'Direct Expenses'];
function buildProfitLoss(rows) {
  const heads = []; let cur = null, parent = null;
  for (const r of rows) {
    if (r.kind === 'head') {
      const node = { name: r.name.replace(/\s*:\s*$/, ''), amount: r.main != null ? r.main : (r.sub || 0), items: [], parts: [] };
      if (COST_PARTS.includes(r.name) && parent) { parent.parts.push(node); }
      else { heads.push(node); parent = /^Cost of Sales/i.test(r.name) ? node : null; }
      cur = node;
    } else if (cur) cur.items.push({ name: r.name, amount: r.sub != null ? r.sub : r.main });
  }
  const amt = re => heads.filter(h => re.test(h.name)).reduce((s, h) => s + (h.amount || 0), 0);
  const indirectIncomes  = amt(/^Indirect Incomes/i);
  const indirectExpenses = amt(/^Indirect Expenses/i);
  const net   = heads.reduce((s, h) => s + (h.amount || 0), 0);
  const gross = net - indirectIncomes - indirectExpenses;
  return {
    heads,
    sales: amt(/^Sales Accounts/i), directIncomes: amt(/^Direct Incomes/i), costOfSales: amt(/^Cost of Sales/i),
    grossProfit: +gross.toFixed(2), indirectIncomes, indirectExpenses, netProfit: +net.toFixed(2),
  };
}

/* ── tiny cache so tab switches don't re-query Tally ── */
const cache = new Map();
const cached = async (k, fresh, fn) => {
  const hit = cache.get(k);
  if (!fresh && hit && Date.now() - hit.at < (k.startsWith('fy|') ? 12 * 3600 * 1000 : 2 * 60 * 1000)) return hit.val;
  const val = await fn(); cache.set(k, { at: Date.now(), val }); return val;
};
const fyBounds = (y) => ({ fy: `${String(y).slice(2)}-${String(y + 1).slice(2)}`, from: `${y}-04-01`, to: `${y + 1}-03-31` });
const curFyStart = () => { const d = new Date(); return d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1; };

router.get('/companies', async (req, res) => {
  try { const c = await connect(); res.json({ host: c.host, port: c.port, companies: c.companies }); }
  catch (e) { res.status(502).json({ error: e.message }); }
});

router.get('/balance-sheet', async (req, res) => {
  try {
    const c = await connect(); const { co, match } = await resolveCompany(c, req.query.companyId, req.query.company);
    const { from, to } = { ...fyBounds(curFyStart()), ...req.query };
    const out = await cached(`bs|${co.name}|${from}|${to}`, req.query.fresh, async () => {
      const xml    = await tallyExport(c.host, c.port, reportXml('Balance Sheet', co.name, from, to));
      const groups = await primaryGroups(c, co.name);
      const bs     = buildBalanceSheet(parseRows(xml), groups);
      /* Tally's export leaves out the lines under Profit & Loss A/c — rebuild them:
         current period = net profit for the same dates, opening balance = the rest */
      const pla = [...bs.liabilities, ...bs.assets].find(h => h.name === 'Profit & Loss A/c');
      if (pla) {
        const pl  = buildProfitLoss(parseRows(await tallyExport(c.host, c.port, reportXml('Profit and Loss', co.name, from, to))));
        const onLiab = bs.liabilities.includes(pla);
        const cur = onLiab ? pl.netProfit : -pl.netProfit;
        pla.items = [{ name: 'Opening Balance', amount: +(pla.amount - cur).toFixed(2) || null }, { name: 'Current Period', amount: cur || null }];
      }
      return { company: co.name, gstin: match.gstin, from, to, fetchedAt: new Date().toISOString(), ...bs };
    });
    if (fyKey(req.query.fy)) saveSnap(req.query.companyId, `bs-${req.query.fy}`, out);
    res.json(out);
  } catch (e) { res.status(e.code ? 409 : 502).json({ error: e.message, code: e.code || 'TALLY', tallyGstin: e.tallyGstin, erpGstin: e.erpGstin }); }
});

router.get('/profit-loss', async (req, res) => {
  try {
    const c = await connect(); const { co, match } = await resolveCompany(c, req.query.companyId, req.query.company);
    const { from, to } = { ...fyBounds(curFyStart()), ...req.query };
    const out = await cached(`pl|${co.name}|${from}|${to}`, req.query.fresh, async () => {
      const xml = await tallyExport(c.host, c.port, reportXml('Profit and Loss', co.name, from, to));
      return { company: co.name, gstin: match.gstin, from, to, fetchedAt: new Date().toISOString(), ...buildProfitLoss(parseRows(xml)) };
    });
    if (fyKey(req.query.fy)) saveSnap(req.query.companyId, `pl-${req.query.fy}`, out);
    res.json(out);
  } catch (e) { res.status(e.code ? 409 : 502).json({ error: e.message, code: e.code || 'TALLY', tallyGstin: e.tallyGstin, erpGstin: e.erpGstin }); }
});

router.get('/profit-by-fy', async (req, res) => {
  try {
    const c = await connect(); const { co, match } = await resolveCompany(c, req.query.companyId, req.query.company);
    const first = parseInt((co.booksFrom || co.startingFrom || '').slice(0, 4), 10) || curFyStart();
    const out = await cached(`fy|${co.name}|${new Date().toISOString().slice(0, 10)}`, req.query.fresh, async () => {
      const years = [];
      for (let y = first; y <= curFyStart(); y++) {   // one at a time — Tally answers requests serially
        const b = fyBounds(y);
        const pl = buildProfitLoss(parseRows(await tallyExport(c.host, c.port, reportXml('Profit and Loss', co.name, b.from, b.to))));
        years.push({ ...b, sales: pl.sales, directIncomes: pl.directIncomes, costOfSales: pl.costOfSales, grossProfit: pl.grossProfit,
          indirectIncomes: pl.indirectIncomes, indirectExpenses: pl.indirectExpenses, netProfit: pl.netProfit });
      }
      return { company: co.name, gstin: match.gstin, fetchedAt: new Date().toISOString(), years };
    });
    saveSnap(req.query.companyId, 'profit-by-fy', out);
    res.json(out);
  } catch (e) { res.status(e.code ? 409 : 502).json({ error: e.message, code: e.code || 'TALLY', tallyGstin: e.tallyGstin, erpGstin: e.erpGstin }); }
});

/* Sundry Debtors / Sundry Creditors ledgers from Tally — names, balances as at today, GSTIN, state, address */
for (const kind of Object.keys(PARTY)) router.get(`/${kind}/fetch`, async (req, res) => {
  const cid = req.query.companyId, K = PARTY[kind];
  try {
    const c = await connect(); const { co, match } = await resolveCompany(c, cid, req.query.company);
    const today = new Date().toISOString().slice(0, 10);
    const fyFrom = `${curFyStart()}-04-01`;
    const xml = await tallyExport(c.host, c.port,
      `<ENVELOPE><HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Collection</TYPE><ID>ErpDebtors</ID></HEADER><BODY><DESC>` +
      `<STATICVARIABLES><SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT><SVCURRENTCOMPANY>${esc(co.name)}</SVCURRENTCOMPANY>` +
      `<SVFROMDATE>${ymd(fyFrom)}</SVFROMDATE><SVTODATE>${ymd(today)}</SVTODATE></STATICVARIABLES>` +
      `<TDL><TDLMESSAGE><COLLECTION NAME="ErpDebtors"><TYPE>Ledger</TYPE><CHILDOF>${K.group}</CHILDOF><BELONGSTO>Yes</BELONGSTO>` +
      `<FETCH>NAME,PARENT,OPENINGBALANCE,CLOSINGBALANCE,PARTYGSTIN,LEDSTATENAME,ADDRESS,EMAIL,LEDGERMOBILE,LEDGERPHONE,LEDGERCONTACT,LEDGSTREGDETAILS,` +
      `LEDMAILINGDETAILS,MAILINGNAME,PINCODE,COUNTRYNAME,INCOMETAXNUMBER</FETCH>` +
      `</COLLECTION></TDLMESSAGE></TDL></DESC></BODY></ENVELOPE>`, 90000);
    const ledgers = [...xml.matchAll(/<LEDGER NAME="([^"]*)"[^>]*>([\s\S]*?)<\/LEDGER>/g)].map(m => {
      const b = m[2], g = t => dec((b.match(new RegExp(`<${t}[^>]*>([^<]*)</${t}>`)) || [])[1]);
      const n = t => -(parseFloat(g(t)) || 0);   // Tally exports debit balances as negatives
      const gstins = [...new Set((b.toUpperCase().match(GSTIN_RE) || []))];
      return {
        name: dec(m[1]), parent: g('PARENT'),
        opening: +n('OPENINGBALANCE').toFixed(2), closing: +n('CLOSINGBALANCE').toFixed(2),
        gstins, state: g('LEDSTATENAME'),
        // address lines de-duplicated (newer TallyPrime repeats them in the mailing details), no stray commas
        address: [...new Set([...b.matchAll(/<ADDRESS[^>]*>([^<]*)<\/ADDRESS>/g)].map(a => dec(a[1]).replace(/[\s,]+$/, '').trim()).filter(Boolean))].join(', '),
        pincode: g('PINCODE'), country: g('COUNTRYNAME'), mailingName: g('MAILINGNAME'),
        pan: g('INCOMETAXNUMBER') || (gstins[0] ? gstins[0].slice(2, 12) : ''),
        email: g('EMAIL'), mobile: g('LEDGERMOBILE') || g('LEDGERPHONE'), contact: g('LEDGERCONTACT'),
      };
    });
    const snap = { company: co.name, gstin: match.gstin, asAt: today, fetchedAt: new Date().toISOString(), ledgers };
    saveSnap(cid, K.snap, snap);
    const { rows, clientCount } = matchDebtors(cid, readSnap(cid, K.snap), kind);
    const { ledgers: _l, ...meta } = readSnap(cid, K.snap);
    res.json({ saved: meta, rows, clientCount });
  } catch (e) { res.status(e.code ? 409 : 502).json({ error: e.message, code: e.code || 'TALLY', tallyGstin: e.tallyGstin, erpGstin: e.erpGstin }); }
});

/* Sales Order vouchers from Tally — number, date, party, client PO (reference), amount and
   the items. Read through Tally's own "Voucher Register" report: a TDL voucher collection
   only ever returns the company's current period whatever dates are sent, the report
   honours them. Read-only, GSTIN-checked like every Tally read. Cancelled orders are left out. */
const isoDate = d => (/^\d{8}$/.test(d) ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` : d);
async function readSalesOrders(c, coName, from, to, vtype = 'Sales Order') {
  const xml = await tallyExport(c.host, c.port,
    `<ENVELOPE><HEADER><TALLYREQUEST>Export Data</TALLYREQUEST></HEADER><BODY><EXPORTDATA><REQUESTDESC><REPORTNAME>Voucher Register</REPORTNAME>` +
    `<STATICVARIABLES><SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT><SVCURRENTCOMPANY>${esc(coName)}</SVCURRENTCOMPANY>` +
    `<SVFROMDATE>${ymd(from)}</SVFROMDATE><SVTODATE>${ymd(to)}</SVTODATE><VOUCHERTYPENAME>${esc(vtype)}</VOUCHERTYPENAME>` +
    `</STATICVARIABLES></REQUESTDESC></EXPORTDATA></BODY></ENVELOPE>`, 180000);
  return [...xml.matchAll(/<VOUCHER ([^>]*)>([\s\S]*?)<\/VOUCHER>/g)].map(m => {
    const attrs = m[1], b = m[2];
    if (/ACTION="(Cancel|Delete)"/.test(attrs) || /<ISCANCELLED>Yes</.test(b) || /<ISDELETED>Yes</.test(b)) return null;
    const entries = re => [...b.matchAll(re)].map(x => x[1]);
    const ledgers = entries(/<(?:ALL)?LEDGERENTRIES\.LIST>([\s\S]*?)<\/(?:ALL)?LEDGERENTRIES\.LIST>/g);
    const invs    = entries(/<ALLINVENTORYENTRIES\.LIST>([\s\S]*?)<\/ALLINVENTORYENTRIES\.LIST>/g);
    const head = b.replace(/<(ALL)?LEDGERENTRIES\.LIST>[\s\S]*?<\/(ALL)?LEDGERENTRIES\.LIST>/g, '').replace(/<ALLINVENTORYENTRIES\.LIST>[\s\S]*?<\/ALLINVENTORYENTRIES\.LIST>/g, '');
    const g = (t, src = head) => dec((src.match(new RegExp(`<${t}>([^<]*)</${t}>`)) || [])[1]);
    const items = invs.map(ib => {
      const qtyTxt = g('ACTUALQTY', ib) || g('BILLEDQTY', ib);
      const qn = parseFloat(qtyTxt) || 0, unit = (qtyTxt.replace(/^[\s\d.,-]+/, '').trim()) || '';
      return { item: g('STOCKITEMNAME', ib), qty: Math.abs(qn), unit, rate: parseFloat(g('RATE', ib)) || 0, amount: Math.abs(parseFloat(g('AMOUNT', ib)) || 0) };
    }).filter(i => i.item);
    // order value = the party's line (debit, exported negative); else items + tax lines
    const party = ledgers.find(l => /<ISPARTYLEDGER>Yes</.test(l));
    const amount = party ? Math.abs(parseFloat(g('AMOUNT', party)) || 0)
      : items.reduce((t, i) => t + i.amount, 0) + ledgers.reduce((t, l) => t + Math.abs(parseFloat(g('AMOUNT', l)) || 0), 0);
    return {
      number: g('VOUCHERNUMBER'), date: isoDate(g('DATE')), party: g('PARTYLEDGERNAME') || (party ? g('LEDGERNAME', party) : ''),
      partyGstin: g('PARTYGSTIN'), reference: g('REFERENCE'), referenceDate: isoDate(g('REFERENCEDATE')),
      amount: +amount.toFixed(2), narration: g('NARRATION'), items,
    };
  }).filter(o => o && (o.number || o.party));
}
const soFyRange = fy => {
  const y = 2000 + parseInt(fy.slice(0, 2), 10), today = new Date().toISOString().slice(0, 10);
  return { from: `${y}-04-01`, to: `${y + 1}-03-31` < today ? `${y + 1}-03-31` : today };
};
const soReply = (cid, fy) => {
  const snap = readSnap(cid, `so-${fy}`);
  const { rows, erpOrders } = matchSalesOrders(cid, snap);
  const { orders: _o, ...meta } = snap || {};
  return { saved: snap ? meta : null, rows, erpOrders };
};

/* one FY */
router.get('/sales-orders/fetch', async (req, res) => {
  const cid = req.query.companyId, fy = fyKey(req.query.fy);
  if (!fy) return res.status(400).json({ error: 'fy is required (e.g. 26-27)' });
  try {
    const c = await connect(); const { co, match } = await resolveCompany(c, cid, req.query.company);
    const { from, to } = soFyRange(fy);
    const orders = await readSalesOrders(c, co.name, from, to);
    saveSnap(cid, `so-${fy}`, { company: co.name, gstin: match.gstin, fy, from, to, fetchedAt: new Date().toISOString(), orders });
    res.json(soReply(cid, fy));
  } catch (e) { res.status(e.code ? 409 : 502).json({ error: e.message, code: e.code || 'TALLY', tallyGstin: e.tallyGstin, erpGstin: e.erpGstin }); }
});

/* every FY in Tally's books, one click — one report per year, one at a time through the queue */
const soAllRunning = new Set();
router.get('/sales-orders/fetch-all', async (req, res) => {
  const cid = req.query.companyId, want = fyKey(req.query.fy);
  if (soAllRunning.has(cid)) return res.status(409).json({ code: 'BUSY', error: 'A fetch of all years is already running — please wait for it to finish.' });
  soAllRunning.add(cid);
  try {
    const c = await connect(); const { co, match } = await resolveCompany(c, cid, req.query.company);
    const first = parseInt((co.booksFrom || co.startingFrom || '').slice(0, 4), 10) || curFyStart();
    const years = [];
    for (let y = first; y <= curFyStart(); y++) {
      const fy = fyBounds(y).fy, { from, to } = soFyRange(fy);
      const orders = await readSalesOrders(c, co.name, from, to);
      saveSnap(cid, `so-${fy}`, { company: co.name, gstin: match.gstin, fy, from, to, fetchedAt: new Date().toISOString(), orders });
      years.push({ fy, count: orders.length });
    }
    res.json({ years, ...soReply(cid, want || fyBounds(curFyStart()).fy) });
  } catch (e) { res.status(e.code ? 409 : 502).json({ error: e.message, code: e.code || 'TALLY', tallyGstin: e.tallyGstin, erpGstin: e.erpGstin }); }
  finally { soAllRunning.delete(cid); }
});

/* ── Tally stock items ↔ ERP items ──
   The Stock Items master read from Tally (its standard "List of Accounts" export) is saved
   as TallyReports/stock-items.json and matched to the ERP's items by name; the user approves
   the right pairs, stored in TallyReports/item-links.json. An ERP item already approved for
   one Tally item is not offered again. Nothing here writes to Tally. */
const readItemLinks  = cid => readSnap(cid, 'item-links')?.links || {};
const writeItemLinks = (cid, links) => saveSnap(cid, 'item-links', { links });
const UOM_MAP = { NOS: 'NOS', NO: 'NOS', PCS: 'Pcs', PC: 'Pcs', PAIR: 'Pair', SET: 'Set', SETS: 'Set', KG: 'Kg', KGS: 'Kg', MTR: 'Mtr', MTRS: 'Mtr',
  SQ: 'Sqft', SQFT: 'Sqft', LTR: 'Ltr', MT: 'MT', TON: 'Ton', BOX: 'Box', ROLL: 'Roll', JOB: 'Job' };
const erpUom = u => { const k = String(u || '').toUpperCase().replace(/[^A-Z]/g, ''); return !k || /NOTAPPLICABLE/.test(k) ? 'N/A' : UOM_MAP[k] || 'NOS'; };

function matchItems(cid, snap) {
  const items = jstore.readAll('Items', cid).filter(i => i && i.itemCode != null).map(i => ({
    itemCode: i.itemCode, name: String(i.itemName || '').trim(), uom: i.uom || '', hsn: String(i.hsnCode || '').trim(), type: i.itemType || '',
  })).filter(i => i.name);
  const links = readItemLinks(cid);
  const taken = new Set(Object.values(links).map(l => String(l.itemCode)));
  const free = i => !taken.has(String(i.itemCode));
  const byName = {}; items.forEach(i => { const k = nameKey(i.name); if (!byName[k]) byName[k] = i; });
  const exactOf = t => [t.name, ...(t.aliases || [])].map(nameKey).map(k => byName[k]).find(i => i && free(i));
  // ERP items that some Tally item matches exactly are not suggested for another one
  const exactUsed = new Set((snap?.items || []).map(exactOf).filter(Boolean).map(i => String(i.itemCode)));
  const rows = (snap?.items || []).map(t => {
    let match = null;
    const exact = exactOf(t);
    if (exact) match = { by: 'name', item: exact };
    else {
      // the numbers in a name are its size / capacity (20x10x8.5 ft, 06 seater, 5%) — if they
      // differ it is a different item, however alike the words are
      const nums = s => (String(s).match(/\d+(?:\.\d+)?/g) || []).map(Number).join('x');
      let best = null, score = 0;
      for (const i of items) {
        if (!free(i) || exactUsed.has(String(i.itemCode)) || nums(t.name) !== nums(i.name)) continue;
        let sc = similarity(t.name, i.name);
        if (t.hsn && i.hsn && t.hsn.slice(0, 4) === i.hsn.slice(0, 4)) sc += 0.1;   // same HSN heading — a little more likely
        if (sc > score) { score = sc; best = i; }
      }
      if (best && score >= 0.6) match = { by: 'suggest', item: best, score: +Math.min(1, score).toFixed(2) };
    }
    const link = links[t.name] || null;
    const linked = link ? items.find(i => String(i.itemCode) === String(link.itemCode)) || { itemCode: link.itemCode, name: link.itemName || '(item removed)' } : null;
    return { ...t, match, link: link && { ...link, item: linked } };
  });
  return { rows, erpItems: items };
}

router.get('/items/fetch', async (req, res) => {
  const cid = req.query.companyId;
  try {
    const c = await connect(); const { co, match } = await resolveCompany(c, cid, req.query.company);
    const xml = await tallyExport(c.host, c.port,
      `<ENVELOPE><HEADER><TALLYREQUEST>Export Data</TALLYREQUEST></HEADER><BODY><EXPORTDATA><REQUESTDESC><REPORTNAME>List of Accounts</REPORTNAME>` +
      `<STATICVARIABLES><SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT><SVCURRENTCOMPANY>${esc(co.name)}</SVCURRENTCOMPANY><ACCOUNTTYPE>Stock Items</ACCOUNTTYPE></STATICVARIABLES>` +
      `</REQUESTDESC></EXPORTDATA></BODY></ENVELOPE>`, 120000);
    const items = [...xml.matchAll(/<STOCKITEM NAME="([^"]*)"[^>]*>([\s\S]*?)<\/STOCKITEM>/g)].map(m => {
      const b = m[2], g = (t, src = b) => dec((src.match(new RegExp(`<${t}[^>]*>([^<]*)</${t}>`)) || [])[1]);
      const all = t => [...b.matchAll(new RegExp(`<${t}>([^<]*)</${t}>`, 'g'))].map(x => dec(x[1])).filter(Boolean);
      // GST details are kept per "applicable from" date — the last block is the one in force
      const gstBlocks = [...b.matchAll(/<GSTDETAILS\.LIST>([\s\S]*?)<\/GSTDETAILS\.LIST>/g)].map(x => x[1]);
      const gb = gstBlocks[gstBlocks.length - 1] || '';
      const igst = (gb.match(/<GSTRATEDUTYHEAD>IGST<\/GSTRATEDUTYHEAD>[\s\S]*?<GSTRATE>\s*([\d.]+)<\/GSTRATE>/) || [])[1];
      const hsns = all('HSNCODE');
      const name = dec(m[1]);
      return {
        name, aliases: [...new Set(all('NAME'))].filter(n => n !== name),
        group: g('PARENT'), category: g('CATEGORY'), unit: g('BASEUNITS'), erpUom: erpUom(g('BASEUNITS')),
        hsn: hsns[hsns.length - 1] || '', gst: igst != null ? parseFloat(igst) : null,
        service: /service/i.test(g('GSTTYPEOFSUPPLY')), description: g('DESCRIPTION'),
      };
    }).filter(i => i.name);
    saveSnap(cid, 'stock-items', { company: co.name, gstin: match.gstin, fetchedAt: new Date().toISOString(), items });
    const snap = readSnap(cid, 'stock-items');
    const { items: _i, ...meta } = snap;
    res.json({ saved: meta, ...matchItems(cid, snap) });
  } catch (e) { res.status(e.code ? 409 : 502).json({ error: e.message, code: e.code || 'TALLY', tallyGstin: e.tallyGstin, erpGstin: e.erpGstin }); }
});
router.get('/items/saved', (req, res) => {
  const cid = req.query.companyId;
  if (!cid) return res.status(400).json({ error: 'companyId is required' });
  const snap = readSnap(cid, 'stock-items');
  if (!snap) return res.json({ saved: null, rows: [], erpItems: matchItems(cid, null).erpItems });
  const { items: _i, ...meta } = snap;
  res.json({ saved: meta, ...matchItems(cid, snap) });
});
/* approve: this Tally stock item IS this ERP item */
router.post('/items/link', (req, res) => {
  const { companyId: cid, tallyName, itemCode } = req.body || {};
  if (!cid || !tallyName || !itemCode) return res.status(400).json({ error: 'companyId, tallyName and itemCode are required' });
  const it = jstore.readAll('Items', cid).find(i => String(i.itemCode) === String(itemCode));
  if (!it) return res.status(404).json({ error: 'ERP item not found' });
  const links = readItemLinks(cid);
  const other = Object.entries(links).find(([k, l]) => k !== tallyName && String(l.itemCode) === String(itemCode));
  if (other) return res.status(409).json({ error: `ERP item ${it.itemName} is already approved for Tally item "${other[0]}"` });
  links[tallyName] = { itemCode: it.itemCode, itemName: it.itemName || '', approvedAt: new Date().toISOString() };
  writeItemLinks(cid, links);
  res.json({ ok: true, link: links[tallyName] });
});
router.post('/items/unlink', (req, res) => {
  const { companyId: cid, tallyName } = req.body || {};
  if (!cid || !tallyName) return res.status(400).json({ error: 'companyId and tallyName are required' });
  const links = readItemLinks(cid); delete links[tallyName]; writeItemLinks(cid, links);
  res.json({ ok: true });
});

/* ── Tally Payments & Receipts ↔ ERP bank entries ──
   Payment and Receipt vouchers are read from Tally's "Voucher Register" one month at a time
   (the vouchers are large — ~50 KB each — so small requests keep Tally's load light). Only
   the bank lines are kept (a ledger line with a bank allocation, e.g. STATE BANK OF INDIA);
   cash vouchers are counted but not matched. One file per FY: TallyReports/bank-<fy>.json.
   Each Tally bank line is matched to an ERP payment/receipt of the same type and bank with
   the same amount, dated within 3 days (party agreeing makes it surer); approved pairs are
   stored in TallyReports/bank-links.json, Tally bank → ERP bank in bank-map.json.
   Nothing here writes to Tally. */
const sqliteIdx = require('./sqlite');
const readBankLinks  = cid => readSnap(cid, 'bank-links')?.links || {};
const writeBankLinks = (cid, links) => saveSnap(cid, 'bank-links', { links });
const readBankMap    = cid => readSnap(cid, 'bank-map')?.map || {};
const erpBanks    = cid => sqliteIdx.listFlatByDir(path.join(ROOT, 'Database', 'Companies', cid, 'Accounts', 'Banks')).filter(b => b && b.bankId != null);
const erpPayments = cid => sqliteIdx.listFlatByDir(path.join(ROOT, 'Database', 'Companies', cid, 'Payments')).filter(p => p && p.paymentId != null);
const dayNo = d => { const t = Date.parse(String(d || '').slice(0, 10)); return isNaN(t) ? null : Math.round(t / 86400000); };

/* Tally's bank ledgers (reserved groups "Bank Accounts" / "Bank OD A/c") with account no.,
   IFSC and balances — Dr shown positive (Tally exports debits as negatives) */
async function readBankLedgers(c, coName) {
  const out = [];
  for (const grp of ['Bank Accounts', 'Bank OD A/c']) {
    const xml = await tallyExport(c.host, c.port,
      `<ENVELOPE><HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Collection</TYPE><ID>ErpBankLedgers</ID></HEADER><BODY><DESC>` +
      `<STATICVARIABLES><SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT><SVCURRENTCOMPANY>${esc(coName)}</SVCURRENTCOMPANY></STATICVARIABLES>` +
      `<TDL><TDLMESSAGE><COLLECTION NAME="ErpBankLedgers"><TYPE>Ledger</TYPE><CHILDOF>${esc(grp)}</CHILDOF><BELONGSTO>Yes</BELONGSTO>` +
      `<FETCH>NAME,PARENT,OPENINGBALANCE,CLOSINGBALANCE,BANKDETAILS,IFSCODE</FETCH></COLLECTION></TDLMESSAGE></TDL></DESC></BODY></ENVELOPE>`, 60000);
    for (const m of xml.matchAll(/<LEDGER NAME="([^"]*)"[^>]*>([\s\S]*?)<\/LEDGER>/g)) {
      const g = t => dec((m[2].match(new RegExp(`<${t}[^>]*>([^<]*)</${t}>`)) || [])[1]);
      out.push({ name: dec(m[1]), group: grp, accountNo: g('BANKDETAILS'), ifsc: g('IFSCODE'),
        opening: +(-(parseFloat(g('OPENINGBALANCE')) || 0)).toFixed(2), closing: +(-(parseFloat(g('CLOSINGBALANCE')) || 0)).toFixed(2) });
    }
  }
  return out;
}

/* bankSet: Tally's bank ledger names — a voucher line on one of them is a bank line. Money into
   the bank (a debit, exported negative) is a receipt, out of it a payment, whatever the voucher type. */
async function readBankVouchers(c, coName, vtype, from, to, bankSet) {
  const xml = await tallyExport(c.host, c.port,
    `<ENVELOPE><HEADER><TALLYREQUEST>Export Data</TALLYREQUEST></HEADER><BODY><EXPORTDATA><REQUESTDESC><REPORTNAME>Voucher Register</REPORTNAME>` +
    `<STATICVARIABLES><SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT><SVCURRENTCOMPANY>${esc(coName)}</SVCURRENTCOMPANY>` +
    `<SVFROMDATE>${ymd(from)}</SVFROMDATE><SVTODATE>${ymd(to)}</SVTODATE><VOUCHERTYPENAME>${esc(vtype)}</VOUCHERTYPENAME>` +
    `</STATICVARIABLES></REQUESTDESC></EXPORTDATA></BODY></ENVELOPE>`, 180000);
  const rows = []; let cash = 0, vouchers = 0;
  const isBank = l => (bankSet && bankSet.size ? bankSet.has(l.name) : !!l.bank);
  for (const m of xml.matchAll(/<VOUCHER ([^>]*)>([\s\S]*?)<\/VOUCHER>/g)) {
    const attrs = m[1], b = m[2];
    if (/ACTION="(Cancel|Delete)"/.test(attrs) || /<ISCANCELLED>Yes</.test(b) || /<ISDELETED>Yes</.test(b) || /<ISOPTIONAL>Yes</.test(b)) continue;
    vouchers++;
    const remoteId = (attrs.match(/REMOTEID="([^"]*)"/) || [])[1] || '';
    const head = b.replace(/<(ALL)?LEDGERENTRIES\.LIST>[\s\S]*?<\/(ALL)?LEDGERENTRIES\.LIST>/g, '').replace(/<ALLINVENTORYENTRIES\.LIST>[\s\S]*?<\/ALLINVENTORYENTRIES\.LIST>/g, '');
    const g = (t, src) => dec((src.match(new RegExp(`<${t}>([^<]*)</${t}>`)) || [])[1]);
    const lines = [...b.matchAll(/<(?:ALL)?LEDGERENTRIES\.LIST>([\s\S]*?)<\/(?:ALL)?LEDGERENTRIES\.LIST>/g)].map(x => {
      const e = x[1];
      const top = e.replace(/<(BANKALLOCATIONS|BILLALLOCATIONS|CATEGORYALLOCATIONS|INTERESTCOLLECTION|OLDAUDITENTRIES)\.LIST>[\s\S]*?<\/\1\.LIST>/g, '');
      const ba = (e.match(/<BANKALLOCATIONS\.LIST>([\s\S]*?)<\/BANKALLOCATIONS\.LIST>/) || [])[1] || '';
      return { name: g('LEDGERNAME', top), amount: parseFloat(g('AMOUNT', top)) || 0, bank: g('TRANSACTIONTYPE', ba) ? ba : null, ba };
    }).filter(l => l.name);
    const banks = lines.filter(isBank);
    if (!banks.length) { cash++; continue; }
    for (const bl of banks) {
      const others = lines.filter(l => l !== bl);   // a contra between two banks: the other bank is the party
      const party = others.slice().sort((x, y) => Math.abs(y.amount) - Math.abs(x.amount))[0];
      rows.push({
        key: `${remoteId || g('VOUCHERNUMBER', head) + '|' + g('DATE', head)}|${bl.name}`,
        type: bl.amount < 0 ? 'receipt' : 'payment', vchType: vtype,
        number: g('VOUCHERNUMBER', head), date: isoDate(g('DATE', head)), bank: bl.name, amount: +Math.abs(bl.amount).toFixed(2),
        party: party?.name || '', others: others.map(o => ({ name: o.name, amount: +Math.abs(o.amount).toFixed(2) })),
        txnType: g('TRANSACTIONTYPE', bl.ba), instrumentNo: g('INSTRUMENTNUMBER', bl.ba), instrumentDate: isoDate(g('INSTRUMENTDATE', bl.ba)),
        reconciled: isoDate(g('BANKERSDATE', bl.ba)), narration: g('NARRATION', head),
      });
    }
  }
  return { rows, cash, vouchers };
}
const monthsOf = (from, to) => {
  const out = []; let d = new Date(from + 'T00:00:00Z');
  while (d.toISOString().slice(0, 10) <= to) {
    const s = d.toISOString().slice(0, 10), e = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
    out.push([s, e < to ? e : to]); d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
  }
  return out;
};
/* every voucher type that can move a bank balance — transfers (Contra) and Journals too, so the
   running balance is complete */
const BANK_VTYPES = ['Receipt', 'Payment', 'Contra', 'Journal'];
async function fetchBankFy(c, co, match, cid, fy, onStep, bankSet) {
  const { from, to } = soFyRange(fy);
  const rows = []; let cash = 0, vouchers = 0;
  for (const vtype of BANK_VTYPES) for (const [a, b] of monthsOf(from, to)) {
    onStep && onStep(`${vtype} ${fmtMonth(a)}`);
    const r = await readBankVouchers(c, co.name, vtype, a, b, bankSet);
    rows.push(...r.rows); cash += r.cash; vouchers += r.vouchers;
  }
  saveSnap(cid, `bank-${fy}`, { company: co.name, gstin: match.gstin, fy, from, to, fetchedAt: new Date().toISOString(), vouchers, cash, rows });
  return { fy, lines: rows.length, vouchers, cash };
}
const fmtMonth = d => new Date(d + 'T00:00:00Z').toLocaleString('en-IN', { month: 'short', year: 'numeric', timeZone: 'UTC' });

/* Tally bank ledger → ERP bank: saved choice, else the same name (Ltd = Limited) or a close one */
function bankMapping(cid, tallyBanks) {
  const banks = erpBanks(cid), saved = readBankMap(cid), out = {};
  for (const t of tallyBanks) {
    if (saved[t] && banks.some(b => String(b.bankId) === String(saved[t]))) { out[t] = { bankId: String(saved[t]), by: 'chosen' }; continue; }
    const exact = banks.find(b => nameKey(b.bankName) === nameKey(t));
    if (exact) { out[t] = { bankId: String(exact.bankId), by: 'name' }; continue; }
    let best = null, sc = 0; banks.forEach(b => { const s = similarity(t, b.bankName); if (s > sc) { sc = s; best = b; } });
    out[t] = best && sc >= 0.6 ? { bankId: String(best.bankId), by: 'similar' } : null;
  }
  return { map: out, banks: banks.map(b => ({ bankId: String(b.bankId), bankName: b.bankName, accountNumber: b.accountNumber || '' })) };
}

function matchBank(cid, snap) {
  const tRows = snap?.rows || [];
  const tBanks = (readSnap(cid, 'bank-ledgers')?.ledgers || []).map(l => l.name);   // every Tally bank, even one without entries
  const { map, banks } = bankMapping(cid, [...new Set([...tBanks, ...tRows.map(r => r.bank)])]);
  const links = readBankLinks(cid);
  const dl = readLinks(cid, 'debtors'), cl = readLinks(cid, 'creditors');
  const partyOf = name => dl[name] ? { kind: 'client', id: dl[name].clientId, name: dl[name].clientName }
    : cl[name] ? { kind: 'vendor', id: cl[name].clientId, name: cl[name].clientName } : null;
  const fyFrom = dayNo(snap?.from), fyTo = dayNo(snap?.to);
  const all = erpPayments(cid).map(p => ({
    paymentId: p.paymentId, type: p.type, date: String(p.date || '').slice(0, 10), day: dayNo(p.date), amount: parseFloat(p.amount) || 0,
    bankId: p.bankId != null ? String(p.bankId) : '', party: p.entityName || p.party || '', entityType: p.entityType || '', entityId: p.entityId != null ? String(p.entityId) : '',
    mode: p.paymentMode || '', ref: p.referenceNo || p.reference || '', status: p.status || '', orderNo: p.orderNo || '', orderId: p.orderId != null ? String(p.orderId) : '', orderType: p.orderType || '', notes: p.notes || '', poAllocations: Array.isArray(p.poAllocations) ? p.poAllocations : [],
  }));
  const linkedIds = new Set(Object.values(links).map(l => String(l.paymentId)));
  const free = all.filter(p => !linkedIds.has(String(p.paymentId)));
  const agrees = (t, p) => { const pl = partyOf(t.party); return pl ? (pl.kind === p.entityType && String(pl.id) === p.entityId) : nameKey(t.party) === nameKey(p.party); };
  /* candidate pairs: same type, same bank (or the ERP entry has none), same amount, within 15 days */
  const pairs = [];
  tRows.forEach((t, i) => {
    if (links[t.key]) return;
    const bid = map[t.bank]?.bankId, td = dayNo(t.date);
    free.forEach(p => {
      if (p.type !== t.type || Math.abs(p.amount - t.amount) >= 1 || p.day == null || td == null) return;
      if (p.bankId && bid && p.bankId !== bid) return;
      const dd = Math.abs(p.day - td); if (dd > 15) return;
      pairs.push({ i, p, dd, ok: agrees(t, p) });
    });
  });
  pairs.sort((a, b) => ((b.dd <= 3) - (a.dd <= 3)) || (b.ok - a.ok) || (a.dd - b.dd));   // within 3 days, party agrees, nearest date
  const usedT = new Set(), usedP = new Set(), found = {};
  for (const x of pairs) {
    if (usedT.has(x.i) || usedP.has(String(x.p.paymentId))) continue;
    usedT.add(x.i); usedP.add(String(x.p.paymentId));
    found[x.i] = { by: x.dd <= 3 && x.ok ? 'match' : 'suggest', erp: x.p, days: x.dd, partyOk: x.ok };
  }
  const byId = Object.fromEntries(all.map(p => [String(p.paymentId), p]));
  const rows = tRows.map((t, i) => {
    const link = links[t.key] || null;
    return { ...t, erpBankId: map[t.bank]?.bankId || '', partyLink: partyOf(t.party), match: link ? null : found[i] || null,
      link: link && { ...link, erp: byId[String(link.paymentId)] || { paymentId: link.paymentId, missing: true } } };
  });
  const mappedBanks = new Set(Object.values(map).filter(Boolean).map(m => m.bankId));
  const erpOnly = free.filter(p => !usedP.has(String(p.paymentId)) && p.day != null && p.day >= fyFrom && p.day <= fyTo && (!p.bankId || mappedBanks.has(p.bankId)));
  return { rows, erpOnly, bankMap: map, erpBanks: banks };
}
const bankReply = (cid, fy) => {
  const snap = readSnap(cid, `bank-${fy}`);
  const { rows: _r, ...meta } = snap || {};
  return { saved: snap ? meta : null, ...matchBank(cid, snap) };
};

router.get('/bank/saved', (req, res) => {
  const cid = req.query.companyId, fy = fyKey(req.query.fy);
  if (!cid || !fy) return res.status(400).json({ error: 'companyId and fy are required' });
  res.json(bankReply(cid, fy));
});
/* fetching runs in the background (one FY ≈ 24 small reads, all FYs ≈ 120) — the page polls /bank/fetch-status */
const bankJobs = {};
router.get('/bank/fetch', async (req, res) => {
  const cid = req.query.companyId, fy = fyKey(req.query.fy), allYears = req.query.all === '1';
  const what = ['bank', 'bills'].includes(req.query.what) ? req.query.what : 'all';   // bank lines, bills, or both
  if (!cid || (!fy && !allYears)) return res.status(400).json({ error: 'companyId and fy (or all=1) are required' });
  if (bankJobs[cid]?.running) return res.status(409).json({ code: 'BUSY', error: 'A fetch is already running — please wait for it to finish.', job: bankJobs[cid] });
  let c, co, match;
  try { c = await connect(); ({ co, match } = await resolveCompany(c, cid, req.query.company)); }
  catch (e) { return res.status(e.code ? 409 : 502).json({ error: e.message, code: e.code || 'TALLY', tallyGstin: e.tallyGstin, erpGstin: e.erpGstin }); }
  const first = parseInt((co.booksFrom || co.startingFrom || '').slice(0, 4), 10) || curFyStart();
  const fys = allYears ? Array.from({ length: curFyStart() - first + 1 }, (_, k) => fyBounds(first + k).fy) : [fy];
  const job = bankJobs[cid] = { running: true, what, fys, done: [], step: '', startedAt: new Date().toISOString(), error: null };
  res.json({ started: true, job });
  (async () => {
    try {
      job.step = 'bank ledgers';
      const ledgers = await readBankLedgers(c, co.name);
      saveSnap(cid, 'bank-ledgers', { company: co.name, gstin: match.gstin, booksFrom: isoDate(co.booksFrom || co.startingFrom || ''), fetchedAt: new Date().toISOString(), ledgers });
      const bankSet = new Set(ledgers.map(l => l.name));
      job.step = 'ledger groups';
      saveSnap(cid, 'ledger-groups', { company: co.name, gstin: match.gstin, fetchedAt: new Date().toISOString(), ledgers: await readLedgerGroups(c, co.name) });
      for (const y of fys) {
        const d = { fy: y };
        if (what !== 'bills') Object.assign(d, await fetchBankFy(c, co, match, cid, y, s => { job.step = `FY ${y} · ${s}`; }, bankSet));
        if (what !== 'bank') Object.assign(d, await fetchBillsFy(c, co, match, cid, y, s => { job.step = `FY ${y} · bills · ${s}`; }));
        job.done.push(d);
      }
    }
    catch (e) { job.error = e.message; }
    job.running = false; job.step = ''; job.endedAt = new Date().toISOString();
  })();
});
router.get('/bank/fetch-status', (req, res) => res.json({ job: bankJobs[req.query.companyId] || null }));
/* which ERP bank a Tally bank ledger is */
router.post('/bank/map', (req, res) => {
  const { companyId: cid, tallyBank, bankId } = req.body || {};
  if (!cid || !tallyBank) return res.status(400).json({ error: 'companyId and tallyBank are required' });
  const map = readBankMap(cid);
  if (bankId) { if (!erpBanks(cid).some(b => String(b.bankId) === String(bankId))) return res.status(404).json({ error: 'ERP bank not found' }); map[tallyBank] = String(bankId); }
  else delete map[tallyBank];
  saveSnap(cid, 'bank-map', { map });
  res.json({ ok: true });
});
/* approve: this Tally bank line IS this ERP payment / receipt */
router.post('/bank/link', (req, res) => {
  const { companyId: cid, key, paymentId } = req.body || {};
  if (!cid || !key || !paymentId) return res.status(400).json({ error: 'companyId, key and paymentId are required' });
  const p = erpPayments(cid).find(x => String(x.paymentId) === String(paymentId));
  if (!p) return res.status(404).json({ error: 'ERP payment / receipt not found' });
  const links = readBankLinks(cid);
  const other = Object.entries(links).find(([k, l]) => k !== key && String(l.paymentId) === String(paymentId));
  if (other) return res.status(409).json({ error: `ERP entry ${paymentId} is already approved for another Tally voucher` });
  links[key] = { paymentId: p.paymentId, approvedAt: new Date().toISOString() };
  writeBankLinks(cid, links);
  res.json({ ok: true, link: links[key] });
});
router.post('/bank/unlink', (req, res) => {
  const { companyId: cid, key } = req.body || {};
  if (!cid || !key) return res.status(400).json({ error: 'companyId and key are required' });
  const links = readBankLinks(cid); delete links[key]; writeBankLinks(cid, links);
  res.json({ ok: true });
});
/* Every ledger's group chain up to its primary group (e.g. "Tea & Coffee" → Office Expenses →
   Indirect Expenses), read from Tally's Group and Ledger lists — tells what a bank entry was for.
   Saved as TallyReports/ledger-groups.json. Read-only. */
async function readLedgerGroups(c, coName) {
  const coll = (id, type, fetch) => `<ENVELOPE><HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Collection</TYPE><ID>${id}</ID></HEADER><BODY><DESC>` +
    `<STATICVARIABLES><SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT><SVCURRENTCOMPANY>${esc(coName)}</SVCURRENTCOMPANY></STATICVARIABLES>` +
    `<TDL><TDLMESSAGE><COLLECTION NAME="${id}"><TYPE>${type}</TYPE><FETCH>${fetch}</FETCH></COLLECTION></TDLMESSAGE></TDL></DESC></BODY></ENVELOPE>`;
  const parentOf = (xml, tag) => {
    const out = {};
    for (const m of xml.matchAll(new RegExp(`<${tag} NAME="([^"]*)"[^>]*>([\\s\\S]*?)</${tag}>`, 'g'))) out[dec(m[1])] = dec((m[2].match(/<PARENT[^>]*>([^<]*)<\/PARENT>/) || [])[1]);
    return out;
  };
  const groups = parentOf(await tallyExport(c.host, c.port, coll('ErpGrpTree', 'Group', 'NAME,PARENT'), 60000), 'GROUP');
  const ledgers = parentOf(await tallyExport(c.host, c.port, coll('ErpLedTree', 'Ledger', 'NAME,PARENT'), 120000), 'LEDGER');
  const chainOf = g => { const out = []; let x = g; while (x && x !== 'Primary' && !out.includes(x) && out.length < 12) { out.push(x); x = groups[x]; } return out; };
  return Object.fromEntries(Object.entries(ledgers).map(([l, g]) => [l, chainOf(g)]));
}
router.get('/ledger-groups/fetch', async (req, res) => {
  const cid = req.query.companyId;
  try {
    const c = await connect(); const { co, match } = await resolveCompany(c, cid, req.query.company);
    const ledgers = await readLedgerGroups(c, co.name);
    saveSnap(cid, 'ledger-groups', { company: co.name, gstin: match.gstin, fetchedAt: new Date().toISOString(), ledgers });
    res.json({ ok: true, count: Object.keys(ledgers).length });
  } catch (e) { res.status(e.code ? 409 : 502).json({ error: e.message, code: e.code || 'TALLY', tallyGstin: e.tallyGstin, erpGstin: e.erpGstin }); }
});

/* what a bank entry was for — from the party ledger's group (the user can override it) */
const BANK_CATS = {
  client:   'Client receipt / payment', 'vendor-po': 'Vendor — against PO', vendor: 'Vendor — without PO',
  expense:  'Office / other expense', salary: 'Salary / wages', tax: 'Tax (GST / TDS)', asset: 'Asset purchase',
  loan:     'Loan / capital', investment: 'Investment / FD / BG', income: 'Other income', transfer: 'Bank transfer', cash: 'Cash withdrawal / deposit',
  suspense: 'Suspense', other: 'Other',
};
function bankCategory(line, chain) {
  const name = String(line.party || ''), has = g => (chain || []).includes(g);
  if (line.vchType === 'Contra' || has('Bank Accounts') || has('Bank OD A/c')) return has('Cash-in-Hand') ? 'cash' : 'transfer';
  if (has('Cash-in-Hand')) return 'cash';
  if (/salary|wages|stipend/i.test(name) || (chain || []).some(g => /salary|wages/i.test(g))) return 'salary';
  const any = re => re.test(name) || (chain || []).some(g => re.test(g));
  if (has('Sundry Debtors')) return 'client';
  if (has('Sundry Creditors') || any(/contractor/i)) return line.po ? 'vendor-po' : 'vendor';
  if (has('Duties & Taxes')) return 'tax';
  if (has('Investments') || any(/mutu?al\s*fund|fixed\s*deposit|\bfd\b|bank\s*gu?a?rantee|demand\s*draft|\bemd\b/i)) return 'investment';
  if (has('Fixed Assets')) return 'asset';
  if (has('Indirect Expenses') || has('Direct Expenses') || has('Purchase Accounts')) return 'expense';
  if (any(/\b(gst|igst|cgst|sgst|utgst|tds|tcs)\b|\btds\s*\d/i)) return 'tax';   // GST / TDS payable kept under Current Liabilities etc.
  if (has('Loans (Liability)') || has('Capital Account') || has('Loans & Advances (Asset)') || has('Secured Loans') || has('Unsecured Loans')) return 'loan';
  if (has('Indirect Incomes') || has('Direct Incomes') || has('Sales Accounts')) return 'income';
  if (has('Suspense A/c')) return 'suspense';
  return 'other';
}
const taxKind = n => /tds/i.test(n) ? 'TDS' : /tcs/i.test(n) ? 'TCS' : /gst|igst|cgst|sgst|utgst/i.test(n) ? 'GST' : /professional/i.test(n) ? 'Prof. tax' : '';

/* ── Bank statement from Tally ──
   One bank, one FY: every bank line read from Tally (receipts, payments, contra, journals), in date
   order, with the running balance. Opening = Tally's opening balance of the running FY, worked back
   through every later FY's movement (so those FYs must have been fetched). Each line shows
   the ERP sales order (SO file no.), the client's order no. and the purchase order — taken from the
   matched ERP entry, or assigned by the user here (TallyReports/bank-assign.json). Read-only for Tally. */
const readAssign = cid => readSnap(cid, 'bank-assign')?.assign || {};
router.get('/bank/statement', (req, res) => {
  const cid = req.query.companyId, fy = fyKey(req.query.fy), bank = String(req.query.bank || '');
  if (!cid || !fy || !bank) return res.status(400).json({ error: 'companyId, fy and bank are required' });
  const led = readSnap(cid, 'bank-ledgers');
  const ledger = (led?.ledgers || []).find(l => l.name === bank);   // opening = at the start of the running FY
  if (!ledger) return res.json({ saved: null, error: 'Bank not found in the saved Tally bank list — fetch from Tally first.' });
  const snap = readSnap(cid, `bank-${fy}`);
  if (!snap) return res.json({ saved: null, ledger });
  // Tally's ledger opening is the opening of its CURRENT period (the running FY) — checked: that opening
  // + this FY's lines = Tally's closing, to the paisa. An earlier FY's opening is worked back from it,
  // taking off the movement of every FY from that one up to the running one.
  const fyY = 2000 + parseInt(fy.slice(0, 2), 10);
  let opening = ledger.opening; const missing = [];
  for (let y = fyY; y < curFyStart(); y++) {
    const f = fyBounds(y).fy, s = readSnap(cid, `bank-${f}`);
    if (!s) { missing.push(f); continue; }
    (s.rows || []).filter(r => r.bank === bank).forEach(r => { opening -= r.type === 'receipt' ? r.amount : -r.amount; });
  }
  const { rows: matched } = matchBank(cid, snap);
  const ctx = bookCtx(cid);
  const { chains, sos, pos } = ctx;
  // which bill each payment settled needs the party's payments of every FY (oldest bill first)
  const allRows = savedFys(cid, 'bank').flatMap(f => f === fy ? matched : (readSnap(cid, `bank-${f}`)?.rows || []));
  const closed = closedMap(ctx, allRows);
  const soOut = o => o && { orderId: String(o.orderId), orderNo: o.orderNo || '', customerPO: o.customerPO || '' };
  const poOut = o => o && { orderId: String(o.orderId), poNumber: o.poNumber || o.poNo || '' };
  let bal = opening, sr = 0, totIn = 0, totOut = 0;
  const lines = matched.filter(r => r.bank === bank)
    .sort((a, b) => a.date.localeCompare(b.date) || (parseInt(a.number, 10) || 0) - (parseInt(b.number, 10) || 0))
    .map(r => {
      const res = resolveLine(r, ctx);
      const { erp, a, so, po, src, category, head, chain, kind } = res;
      const inAmt = r.type === 'receipt' ? r.amount : 0, outAmt = r.type === 'payment' ? r.amount : 0;
      bal += inAmt - outAmt; totIn += inAmt; totOut += outAmt;
      return { sr: ++sr, key: r.key, date: r.date, vchType: r.vchType || (r.type === 'receipt' ? 'Receipt' : 'Payment'), number: r.number,
        party: r.party, partyLink: r.partyLink, debit: inAmt, credit: outAmt, balance: +bal.toFixed(2),
        so: soOut(so), po: poOut(po), src, category, catAuto: !a.category, taxKind: category === 'tax' ? taxKind(r.party) : '', partyGroup: chain[0] || '', erpId: erp ? erp.paymentId : null, approved: !!r.link,
        head, partyKind: kind, closed: closed[r.key] || null, tallyPo: res.tallyPo || '',
        poSplit: res.split ? res.split.map(x => ({ poNumber: x.po.poNumber || x.po.poNo || '', amount: x.amount })) : null,
        remark: a.remark != null ? a.remark : '', narration: r.narration || '', txnType: r.txnType, instrumentNo: r.instrumentNo, reconciled: r.reconciled };
    });
  const isCur = fy === fyBounds(curFyStart()).fy;
  const { rows: _r, ...meta } = snap;
  res.json({
    saved: meta, ledger, opening: +opening.toFixed(2), openingMissing: missing, closing: +bal.toFixed(2), totIn: +totIn.toFixed(2), totOut: +totOut.toFixed(2), lines,
    // for the running FY, the computed closing should equal Tally's own closing balance
    check: isCur && !missing.length ? { tally: ledger.closing, diff: +(bal - ledger.closing).toFixed(2) } : null,
    banks: (led.ledgers || []).map(l => ({ name: l.name, accountNo: l.accountNo, ifsc: l.ifsc })),
    categories: BANK_CATS, groupsKnown: Object.keys(chains).length > 0,
    salesOrders: sos.map(o => ({ orderId: String(o.orderId), orderNo: o.orderNo || '', customerPO: o.customerPO || '', customerCode: String(o.customerCode || ''), customerName: o.customerName || '', orderDate: o.orderDate || '' })),
    purchaseOrders: pos.map(o => ({ orderId: String(o.orderId), poNumber: o.poNumber || o.poNo || '', vendorId: String(o.vendorId || ''), vendorName: o.vendorName || '', linkedSalesOrderId: String(o.linkedSalesOrderId || ''), poDate: o.poDate || '' })),
  });
});
/* assign the SO / PO / remark of one statement line (stored in the ERP only) */
router.post('/bank/assign', (req, res) => {
  const { companyId: cid, key } = req.body || {};
  if (!cid || !key) return res.status(400).json({ error: 'companyId and key are required' });
  const assign = readAssign(cid), cur = { ...(assign[key] || {}) };
  for (const k of ['soId', 'poId', 'remark', 'category']) if (req.body[k] !== undefined) { if (req.body[k] === '' || req.body[k] === null) delete cur[k]; else cur[k] = String(req.body[k]); }
  if (Object.keys(cur).length) assign[key] = { ...cur, at: new Date().toISOString() }; else delete assign[key];
  saveSnap(cid, 'bank-assign', { assign });
  res.json({ ok: true, assign: assign[key] || null });
});

/* ── Bills & journals from Tally ──
   The bill decides what a payment was for: Purchase / Purchase GST / RCM / Journal vouchers
   (Dr purchase or expense, Cr the party) and Sales / Sales GST / notes (Dr the client). Read one month
   at a time from the Voucher Register, kept compact per FY: TallyReports/bills-<fy>.json. Read-only. */
const BILL_VTYPES = ['Purchase', 'PURCHASE GST', 'RCM', 'Journal', 'Sales', 'SALES GST', 'Credit Note', 'Debit Note'];
async function readBillVouchers(c, coName, vtype, from, to) {
  const xml = await tallyExport(c.host, c.port,
    `<ENVELOPE><HEADER><TALLYREQUEST>Export Data</TALLYREQUEST></HEADER><BODY><EXPORTDATA><REQUESTDESC><REPORTNAME>Voucher Register</REPORTNAME>` +
    `<STATICVARIABLES><SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT><SVCURRENTCOMPANY>${esc(coName)}</SVCURRENTCOMPANY>` +
    `<SVFROMDATE>${ymd(from)}</SVFROMDATE><SVTODATE>${ymd(to)}</SVTODATE><VOUCHERTYPENAME>${esc(vtype)}</VOUCHERTYPENAME>` +
    `</STATICVARIABLES></REQUESTDESC></EXPORTDATA></BODY></ENVELOPE>`, 180000);
  const out = [];
  for (const m of xml.matchAll(/<VOUCHER ([^>]*)>([\s\S]*?)<\/VOUCHER>/g)) {
    const attrs = m[1], b = m[2];
    if (/ACTION="(Cancel|Delete)"/.test(attrs) || /<ISCANCELLED>Yes</.test(b) || /<ISDELETED>Yes</.test(b) || /<ISOPTIONAL>Yes</.test(b)) continue;
    const g = (t, s) => dec((s.match(new RegExp(`<${t}>([^<]*)</${t}>`)) || [])[1]);
    const strip = s => s.replace(/<(BANKALLOCATIONS|BILLALLOCATIONS|CATEGORYALLOCATIONS|OLDAUDITENTRIES|BATCHALLOCATIONS)\.LIST>[\s\S]*?<\/\1\.LIST>/g, '');
    const lines = [...b.matchAll(/<(?:ALL)?LEDGERENTRIES\.LIST>([\s\S]*?)<\/(?:ALL)?LEDGERENTRIES\.LIST>/g)].map(x => ({ name: g('LEDGERNAME', strip(x[1])), amt: parseFloat(g('AMOUNT', strip(x[1]))) || 0 }));
    const orders = new Set();
    for (const x of b.matchAll(/<ALLINVENTORYENTRIES\.LIST>([\s\S]*?)<\/ALLINVENTORYENTRIES\.LIST>/g)) {
      // an item invoice posts to its purchase / sales ledger through the item's accounting allocation
      for (const a of x[1].matchAll(/<ACCOUNTINGALLOCATIONS\.LIST>([\s\S]*?)<\/ACCOUNTINGALLOCATIONS\.LIST>/g)) lines.push({ name: g('LEDGERNAME', strip(a[1])), amt: parseFloat(g('AMOUNT', strip(a[1]))) || 0 });
      for (const o of x[1].matchAll(/<ORDERNO>([^<]*)<\/ORDERNO>/g)) { const v = dec(o[1]); if (v && !/not applicable/i.test(v)) orders.add(v); }
    }
    const head = b.replace(/<(ALL)?LEDGERENTRIES\.LIST>[\s\S]*?<\/(ALL)?LEDGERENTRIES\.LIST>/g, '').replace(/<ALLINVENTORYENTRIES\.LIST>[\s\S]*?<\/ALLINVENTORYENTRIES\.LIST>/g, '');
    out.push({ vt: vtype, date: isoDate(g('DATE', head)), no: g('VOUCHERNUMBER', head), party: g('PARTYLEDGERNAME', head), ref: g('REFERENCE', head),
      narr: g('NARRATION', head).slice(0, 120), lines: lines.filter(l => l.name && l.amt).map(l => ({ name: l.name, amt: +l.amt.toFixed(2) })), orders: [...orders] });
  }
  return out;
}
async function fetchBillsFy(c, co, match, cid, fy, onStep) {
  const { from, to } = soFyRange(fy);
  const vouchers = [];
  for (const vtype of BILL_VTYPES) for (const [a, b] of monthsOf(from, to)) {
    onStep && onStep(`${vtype} ${fmtMonth(a)}`);
    vouchers.push(...await readBillVouchers(c, co.name, vtype, a, b));
  }
  saveSnap(cid, `bills-${fy}`, { company: co.name, gstin: match.gstin, fy, from, to, fetchedAt: new Date().toISOString(), vouchers });
  return { fy, bills: vouchers.length };
}

/* ── the book: every bank line of every FY, resolved the same way everywhere ── */
const savedFys = (cid, prefix) => { try { return fs.readdirSync(snapDir(cid)).map(f => (f.match(new RegExp(`^${prefix}-(\\d\\d-\\d\\d)\\.json$`)) || [])[1]).filter(Boolean).sort(); } catch { return []; } };
const EXP_GROUPS = ['Indirect Expenses', 'Direct Expenses'];
function bookCtx(cid) {
  const chains = readSnap(cid, 'ledger-groups')?.ledgers || {};
  const assign = readAssign(cid);
  const sos = jstore.readAll('SalesOrder', cid).filter(o => o && o.orderId != null);
  const pos = jstore.readAll('PurchaseOrder', cid).filter(o => o && o.orderId != null);
  const soById = Object.fromEntries(sos.map(o => [String(o.orderId), o])), poById = Object.fromEntries(pos.map(o => [String(o.orderId), o]));
  const poByNo = Object.fromEntries(pos.map(o => [String(o.poNumber || o.poNo || '').trim().toUpperCase(), o]).filter(([k]) => k));
  const nk = s => String(s || '').toLowerCase().replace(/^\s*m\s*\/?\s*s\.?\s*/, '').replace(/\b(pvt|private|ltd|limited|co|company|the)\b/g, '').replace(/[^a-z0-9]/g, '');
  const poVendors = new Set(pos.map(p => nk(p.vendorName)).filter(Boolean));
  const isParty = l => { const ch = chains[l] || []; return ch.includes('Sundry Creditors') || ch.includes('Sundry Debtors') || ch.some(x => /salary payable|contractor|vendor/i.test(x)); };
  const debitKind = l => { const ch = chains[l] || [];
    if (ch.includes('Duties & Taxes')) return 'tax'; if (ch.includes('Purchase Accounts')) return 'purchase'; if (ch.includes('Fixed Assets')) return 'asset';
    if (EXP_GROUPS.some(x => ch.includes(x))) return 'expense'; if (isParty(l) || ch.includes('Bank Accounts') || ch.includes('Cash-in-Hand')) return 'skip';
    if (/(^|[^a-z])(igst|cgst|sgst|utgst|tds|tcs)([^a-z]|$)/i.test(l) || /round\s*off/i.test(l)) return 'tax'; return 'other'; };
  const bills = savedFys(cid, 'bills').flatMap(f => readSnap(cid, `bills-${f}`)?.vouchers || []);
  /* party profiles from the bills: what each creditor's bills were booked to */
  const party = {};
  const P = n => (party[n] = party[n] || { heads: {}, purchase: 0, expense: 0, billsCr: [], billsDr: [] });
  for (const v of bills) {
    const pl = v.lines.filter(l => isParty(l.name));
    if (!pl.length) continue;
    const debits = v.lines.filter(l => l.amt < 0 && !isParty(l.name));
    for (const p of pl) {
      const x = P(p.name);
      if (p.amt > 0) {   // the party is credited: its bill (purchase / expense / salary journal)
        x.billsCr.push({ amt: p.amt, date: v.date, vt: v.vt, no: v.no, orders: v.orders });
        debits.forEach(d => { const k = debitKind(d.name); if (k === 'expense' || k === 'purchase' || k === 'asset') { x.heads[d.name] = (x.heads[d.name] || 0) - d.amt; if (k === 'purchase') x.purchase -= d.amt; else if (k === 'expense') x.expense -= d.amt; } });
      } else x.billsDr.push({ amt: -p.amt, date: v.date, vt: v.vt, no: v.no, orders: v.orders });   // the party is debited: a sales invoice / debit note
    }
  }
  Object.entries(party).forEach(([n, x]) => {
    const top = Object.entries(x.heads).sort((a, b) => b[1] - a[1])[0];
    x.head = top ? top[0] : '';
    const ch = chains[n] || [];
    x.kind = ch.includes('Sundry Debtors') ? 'client'
      : (/salary|wages/i.test(n) || ch.some(g => /salary/i.test(g)) || /salary/i.test(x.head)) ? 'salary'
      : poVendors.has(nk(n)) || x.purchase > x.expense ? 'material' : x.billsCr.length ? 'expense' : '';
  });
  const tallyBal = {};   // the party's balance as Tally shows it now (Dr +) — from the debtor / creditor lists
  for (const k of ['debtors', 'creditors']) (readSnap(cid, k)?.ledgers || []).forEach(l => { tallyBal[l.name] = l.closing; });
  /* the PO no. on a Tally bill → the ERP PO with exactly that number */
  const poFor = ref => poByNo[String(ref || '').trim().toUpperCase()] || null;
  /* the order ref on a Tally sales invoice (a Tally SO no. or the client's order no.) → ERP sales order */
  const soRef = {};
  const putSo = (ref, id) => { const k = String(ref || '').trim().toUpperCase(); if (k && id && !soRef[k]) soRef[k] = String(id); };
  Object.entries(readSoLinks(cid)).forEach(([k, v]) => putSo(k.split('|')[0], v.orderId));            // approved Tally ↔ ERP pairs
  for (const f of savedFys(cid, 'so')) {                                                                 // automatic matches (same client PO / amount)
    try { matchSalesOrders(cid, readSnap(cid, `so-${f}`)).rows.forEach(r => { const m = r.link?.orderId || (r.match && r.match.by !== 'suggest' ? r.match.order.orderId : null); if (m) { putSo(r.number, m); putSo(r.reference, m); } }); } catch { /* skip */ }
  }
  sos.forEach(o => { putSo(o.orderNo, o.orderId); putSo(o.customerPO, o.orderId); if (poKey(o.customerPO).length >= 6) putSo(poKey(o.customerPO), o.orderId); });
  const soFor = ref => { const k = String(ref || '').trim().toUpperCase(); return soRef[k] || soRef[poKey(k)] || null; };
  return { cid, chains, assign, sos, pos, soById, poById, poByNo, poFor, soFor, party, tallyBal, bills, nk, poVendors };
}
/* what one Tally bank line is for: SO / PO (assigned, or from the matched ERP entry), type and expense head */
function resolveLine(r, ctx) {
  const erp = r.link?.erp && !r.link.erp.missing ? r.link.erp : r.match?.by === 'match' ? r.match.erp : null;
  const a = ctx.assign[r.key] || {};
  let so = null, po = null, src = '';
  if (a.soId && ctx.soById[a.soId]) { so = ctx.soById[a.soId]; src = 'assigned'; }
  if (a.poId && ctx.poById[a.poId]) { po = ctx.poById[a.poId]; src = 'assigned'; }
  let split = null;
  if (!so && !po && erp?.poAllocations?.length) {   // the ERP payment is split over several POs
    split = erp.poAllocations.map(x => ({ po: ctx.poById[String(x.orderId)], tallyPo: '', amount: parseFloat(x.amount) || 0 })).filter(x => x.po);
    if (split.length) { po = split[0].po; src = 'erp'; } else split = null;
  }
  if (!so && !po && erp?.orderId) {
    if (erp.orderType === 'purchase' && ctx.poById[erp.orderId]) po = ctx.poById[erp.orderId];
    else if (ctx.soById[erp.orderId]) so = ctx.soById[erp.orderId];
    if (so || po) src = 'erp';
  }
  if (!so && po?.linkedSalesOrderId && ctx.soById[String(po.linkedSalesOrderId)]) so = ctx.soById[String(po.linkedSalesOrderId)];   // the PO's own sales order
  const chain = ctx.chains[r.party] || [], pi = ctx.party[r.party];
  let category = a.category && BANK_CATS[a.category] ? a.category : bankCategory({ ...r, po }, chain);
  if (!a.category && (category === 'vendor' || category === 'vendor-po') && !po) {   // a creditor whose bills are expenses / salary, not material
    if (pi?.kind === 'expense') category = 'expense';
    else if (pi?.kind === 'salary') category = 'salary';
  }
  const head = category === 'expense' ? (EXP_GROUPS.some(x => chain.includes(x)) ? r.party : pi?.head || r.party)
    : category === 'salary' ? (pi?.head && /salary|wages/i.test(pi.head) ? pi.head : 'SALARY EXP.') : '';
  return { erp, a, so, po, src, category, head, chain, kind: pi?.kind || '', split: split && split.length > 1 ? split : null };
}
/* Which bills did each payment settle? Most entries in Tally are "on account" (not bill-wise), so the
   standard rule is used: per party, payments settle the oldest unpaid bills first (FIFO) — TDS / debit-note
   entries against the party settle bills the same way, so a bill paid net of TDS still closes. Receipts
   settle a client's oldest invoices. Each line gets the bills it paid (with the PO / order nos. on them):
   'bill' = fully settled, 'part' = partly, 'pending' = an advance — the bill / JV is not booked yet. */
function closedMap(ctx, allRows) {
  const out = {}, byParty = {};
  allRows.forEach(r => (byParty[r.party] = byParty[r.party] || []).push(r));
  for (const [name, rows] of Object.entries(byParty)) {
    const pi = ctx.party[name], ch = ctx.chains[name] || [];
    const tracked = pi || ch.includes('Sundry Creditors') || ch.includes('Sundry Debtors') || ch.some(g => /salary payable/i.test(g));
    if (!tracked) continue;
    const bal = ctx.tallyBal[name];
    // the party's balance before the first FY read (e.g. a bill of 2021-22 still unpaid in 2022) — Tally's
    // balance now, less every bill / payment read since: Dr + = the party owes us / advance with them
    const sumOf = a => (a || []).reduce((t, b) => t + b.amt, 0);
    const drNow = rows.reduce((t, r) => t + (r.type === 'payment' ? r.amount : -r.amount), 0) + sumOf(pi?.billsDr) - sumOf(pi?.billsCr);
    const openDr = bal != null ? +(bal - drNow).toFixed(2) : 0;
    for (const side of ['payment', 'receipt']) {
      // bills to settle: a creditor's bills (Cr) for payments, a client's invoices (Dr) for receipts
      const bills = (side === 'payment' ? pi?.billsCr : pi?.billsDr) || [];
      const queue = bills.slice().sort((a, b) => a.date.localeCompare(b.date)).map(b => ({ ...b, left: b.amt }));
      const open = side === 'payment' ? -openDr : openDr;   // an opening payable is settled by payments, an opening receivable by receipts
      if (open > 0.5) queue.unshift({ no: 'opening balance', vt: 'Opening', date: '2000-01-01', amt: open, left: open, orders: [] });
      // what settles them: the bank lines + the party's own non-bank settling entries (TDS, debit / credit notes)
      const others = ((side === 'payment' ? pi?.billsDr : pi?.billsCr) || []).map(b => ({ key: null, date: b.date, amount: b.amt }));
      if (open < -0.5) others.push({ key: null, date: '2000-01-01', amount: -open });   // an opening advance settles the first bills
      const settlers = [...rows.filter(r => r.type === side).map(r => ({ key: r.key, date: r.date, amount: r.amount })), ...others].sort((a, b) => a.date.localeCompare(b.date));
      let qi = 0;
      for (const st of settlers) {
        let left = st.amount; const paid = [];
        while (left > 0.5 && qi < queue.length) {
          const b = queue[qi], take = Math.min(left, b.left);
          b.left -= take; left -= take;
          paid.push({ no: b.no, vt: b.vt, date: b.date, amt: +take.toFixed(2), orders: b.orders || [] });
          if (b.left <= 0.5) qi++;
        }
        if (!st.key) continue;
        out[st.key] = paid.length
          ? { status: left > 0.5 ? 'part' : 'bill', bills: paid, unsettled: +Math.max(0, left).toFixed(2), vt: paid[0].vt, no: paid[0].no, date: paid[0].date }
          : { status: bal != null && Math.abs(bal) < 1 ? 'balance0' : 'pending', bills: [], unsettled: st.amount, balance: bal ?? null };
      }
    }
  }
  return out;
}
/* every FY's bank lines, matched + resolved */
function bookLines(cid, ctx) {
  const lines = [];
  for (const fy of savedFys(cid, 'bank')) {
    const snap = readSnap(cid, `bank-${fy}`);
    const { rows } = matchBank(cid, snap);
    rows.forEach(r => lines.push({ ...r, fy, res: resolveLine(r, ctx) }));
  }
  return lines;
}

/* ══ Tally Reconciliation ══
   One place for Client | SO | Vendor | PO | Payment | Receipt | Journal. Nothing here writes to Tally. */

/* Can a Tally order be imported? Only when its party is already in the ERP with the same name and GST:
   the approved Tally ↔ ERP link, or exactly the same name; and the GSTINs must agree. */
function partyCheck(cid, kind, partyName, partyGstin) {
  const K = PARTY[kind];
  if (!nameKey(partyName)) return { ok: false, reason: `the Tally order has no party name` };
  const recs = jstore.readAll(K.store, cid).filter(r => r && r[K.id] != null && nameKey(K.name(r)));
  const link = readLinks(cid, kind)[partyName];
  const rec = (link && recs.find(r => String(r[K.id]) === String(link.clientId))) || recs.find(r => nameKey(K.name(r)) === nameKey(partyName));
  const tl = (readSnap(cid, K.snap)?.ledgers || []).find(l => l.name === partyName);
  const tg = String(partyGstin || (tl?.gstins || [])[0] || '').toUpperCase().trim();
  if (!rec) return { ok: false, reason: `${partyName} is not in the ERP ${K.what}s — import the ${K.what} first` };
  const eg = String(rec.gstin || rec.gst || '').toUpperCase().trim();
  const out = { id: String(rec[K.id]), name: K.name(rec) || '', gstin: eg, tallyGstin: tg, how: link ? 'linked' : 'same name' };
  if (tg && eg && tg !== eg) return { ...out, ok: false, reason: `GST differs — Tally ${tg}, ERP ${eg}` };
  if (tg && !eg) return { ...out, ok: false, reason: `ERP ${K.what} has no GST — Tally has ${tg}` };
  if (!tg && eg) return { ...out, ok: false, reason: `Tally ledger has no GST — ERP has ${eg}` };
  return { ...out, ok: true };
}

/* ── Tally Purchase Orders ↔ ERP POs (like the sales orders) ── */
const readPoLinks  = cid => readSnap(cid, 'po-links')?.links || {};
const writePoLinks = (cid, links) => saveSnap(cid, 'po-links', { links });
function matchPurchaseOrders(cid, snap) {
  const erp = jstore.readAll('PurchaseOrder', cid).filter(o => o && o.orderId != null).map(o => ({
    orderId: o.orderId, poNumber: o.poNumber || o.poNo || '', poDate: o.poDate || '', vendorName: o.vendorName || '', vendorId: String(o.vendorId || ''),
    grandTotal: parseFloat(o.grandTotal) || 0, status: o.status || '', linkedSalesOrderId: String(o.linkedSalesOrderId || ''),
  }));
  const cLinks = readLinks(cid, 'creditors'), links = readPoLinks(cid);
  const sameVendor = (t, o) => { const l = cLinks[t.party]; return (l && String(l.clientId) === o.vendorId) || nameKey(t.party) === nameKey(o.vendorName); };
  const rows = (snap?.orders || []).map(t => {
    let match = null;
    const byNo = erp.find(o => o.poNumber && o.poNumber.trim().toUpperCase() === String(t.number || '').trim().toUpperCase());
    if (byNo) match = { by: 'number', order: byNo };
    else {
      const v = erp.filter(o => sameVendor(t, o));
      const amt = v.find(o => Math.abs(o.grandTotal - t.amount) < 1);
      if (amt) match = { by: 'amount', order: amt };
      else { const d = v.find(o => o.poDate === t.date); if (d) match = { by: 'suggest', order: d }; }
    }
    const key = soKey(t), link = links[key] || null;
    const linked = link ? erp.find(o => String(o.orderId) === String(link.orderId)) || { orderId: link.orderId, poNumber: link.poNumber || '(removed)' } : null;
    return { ...t, key, match, link: link && { ...link, order: linked } };
  });
  return { rows, erpOrders: erp };
}
const poReply = (cid, fy) => {
  const snap = readSnap(cid, `po-${fy}`);
  const { rows, erpOrders } = matchPurchaseOrders(cid, snap);
  const checked = rows.map(r => ({ ...r, partyCheck: r.link || r.match ? null : partyCheck(cid, 'creditors', r.party, r.partyGstin) }));
  const { orders: _o, ...meta } = snap || {};
  return { saved: snap ? meta : null, rows: checked, erpOrders };
};
router.get('/purchase-orders/saved', (req, res) => {
  const cid = req.query.companyId, fy = fyKey(req.query.fy);
  if (!cid || !fy) return res.status(400).json({ error: 'companyId and fy are required' });
  res.json(poReply(cid, fy));
});
const poAllRunning = new Set();
router.get('/purchase-orders/fetch-all', async (req, res) => {
  const cid = req.query.companyId, want = fyKey(req.query.fy);
  if (poAllRunning.has(cid)) return res.status(409).json({ code: 'BUSY', error: 'A fetch is already running — please wait for it to finish.' });
  poAllRunning.add(cid);
  try {
    const c = await connect(); const { co, match } = await resolveCompany(c, cid, req.query.company);
    const first = parseInt((co.booksFrom || co.startingFrom || '').slice(0, 4), 10) || curFyStart();
    const years = [];
    for (let y = first; y <= curFyStart(); y++) {
      const fy = fyBounds(y).fy, { from, to } = soFyRange(fy);
      const orders = await readSalesOrders(c, co.name, from, to, 'Purchase Order');
      saveSnap(cid, `po-${fy}`, { company: co.name, gstin: match.gstin, fy, from, to, fetchedAt: new Date().toISOString(), orders });
      years.push({ fy, count: orders.length });
    }
    res.json({ years, ...poReply(cid, want || fyBounds(curFyStart()).fy) });
  } catch (e) { res.status(e.code ? 409 : 502).json({ error: e.message, code: e.code || 'TALLY', tallyGstin: e.tallyGstin, erpGstin: e.erpGstin }); }
  finally { poAllRunning.delete(cid); }
});
router.post('/purchase-orders/link', (req, res) => {
  const { companyId: cid, key, orderId } = req.body || {};
  if (!cid || !key || !orderId) return res.status(400).json({ error: 'companyId, key and orderId are required' });
  const o = jstore.readAll('PurchaseOrder', cid).find(x => String(x.orderId) === String(orderId));
  if (!o) return res.status(404).json({ error: 'ERP purchase order not found' });
  const links = readPoLinks(cid);
  links[key] = { orderId: o.orderId, poNumber: o.poNumber || o.poNo || '', approvedAt: new Date().toISOString() };
  writePoLinks(cid, links);
  res.json({ ok: true, link: links[key] });
});
router.post('/purchase-orders/unlink', (req, res) => {
  const { companyId: cid, key } = req.body || {};
  if (!cid || !key) return res.status(400).json({ error: 'companyId and key are required' });
  const links = readPoLinks(cid); delete links[key]; writePoLinks(cid, links);
  res.json({ ok: true });
});
/* the import check for Tally sales orders (client must exist with the same name + GST) */
router.get('/sales-orders/party-check', (req, res) => {
  const cid = req.query.companyId, fy = fyKey(req.query.fy);
  if (!cid || !fy) return res.status(400).json({ error: 'companyId and fy are required' });
  const out = {};
  (readSnap(cid, `so-${fy}`)?.orders || []).forEach(o => { out[soKey(o)] = partyCheck(cid, 'debtors', o.party, o.partyGstin); });
  res.json({ checks: out });
});

/* lists for the SO / PO pickers */
const orderLists = ctx => ({
  categories: BANK_CATS,
  salesOrders: ctx.sos.map(o => ({ orderId: String(o.orderId), orderNo: o.orderNo || '', customerPO: o.customerPO || '', customerCode: String(o.customerCode || ''), customerName: o.customerName || '', orderDate: o.orderDate || '' })),
  purchaseOrders: ctx.pos.map(o => ({ orderId: String(o.orderId), poNumber: o.poNumber || o.poNo || '', vendorId: String(o.vendorId || ''), vendorName: o.vendorName || '', linkedSalesOrderId: String(o.linkedSalesOrderId || ''), poDate: o.poDate || '' })),
});

/* ── Payment / Receipt: every bank's Tally entries of one FY — assign SO / PO, match the ERP entry ── */
router.get('/book/lines', (req, res) => {
  const cid = req.query.companyId, fy = fyKey(req.query.fy), type = req.query.type === 'receipt' ? 'receipt' : 'payment';
  if (!cid || !fy) return res.status(400).json({ error: 'companyId and fy are required' });
  const snap = readSnap(cid, `bank-${fy}`);
  const ctx = bookCtx(cid);
  if (!snap) return res.json({ saved: null, lines: [], ...orderLists(ctx) });
  const { rows } = matchBank(cid, snap);
  const lines = rows.filter(r => r.type === type && (r.vchType || (type === 'receipt' ? 'Receipt' : 'Payment')) !== 'Contra').map(r => {
    const x = resolveLine(r, ctx);
    const so = x.so && { orderId: String(x.so.orderId), orderNo: x.so.orderNo || '', customerPO: x.so.customerPO || '' };
    const po = x.po && { orderId: String(x.po.orderId), poNumber: x.po.poNumber || x.po.poNo || '' };
    return { key: r.key, date: r.date, bank: r.bank, erpBankId: r.erpBankId, party: r.party, partyLink: r.partyLink, amount: r.amount, type: r.type,
      vchType: r.vchType || '', number: r.number, debit: type === 'receipt' ? r.amount : 0, credit: type === 'payment' ? r.amount : 0,
      category: x.category, catAuto: !x.a.category, partyGroup: x.chain[0] || '', so, po, src: x.src,
      poSplit: x.split ? x.split.map(s => ({ poNumber: s.po.poNumber || s.po.poNo || '', amount: s.amount })) : null,
      erp: r.link ? { paymentId: r.link.paymentId, status: 'linked', ...(r.link.erp || {}) } : r.match ? { ...r.match.erp, status: r.match.by, days: r.match.days, partyOk: r.match.partyOk } : null,
      remark: x.a.remark || '', narration: r.narration || '' };
  }).sort((a, b) => a.date.localeCompare(b.date) || (parseInt(a.number, 10) || 0) - (parseInt(b.number, 10) || 0));
  const { rows: _r, ...meta } = snap;
  res.json({ saved: meta, lines, ...orderLists(ctx) });
});

/* ── Journal: Tally journal vouchers of one FY — assign the SO a project expense belongs to ── */
const journalKey = (fy, v) => `J|${fy}|${v.date}|${v.no}`;
function journalRows(cid, fy, ctx) {
  const snap = readSnap(cid, `bills-${fy}`);
  return (snap?.vouchers || []).filter(v => v.vt === 'Journal').map(v => {
    const key = journalKey(fy, v), a = ctx.assign[key] || {};
    const dr = v.lines.filter(l => l.amt < 0).map(l => ({ name: l.name, amt: +(-l.amt).toFixed(2), group: (ctx.chains[l.name] || [])[0] || '' }));
    const cr = v.lines.filter(l => l.amt > 0).map(l => ({ name: l.name, amt: +l.amt.toFixed(2), group: (ctx.chains[l.name] || [])[0] || '' }));
    const so = a.soId && ctx.soById[a.soId];
    // the expense part of a journal (Dr an expense / purchase ledger) — what a project is charged
    const expense = dr.filter(d => { const ch = ctx.chains[d.name] || []; return EXP_GROUPS.some(g => ch.includes(g)) || ch.includes('Purchase Accounts'); }).reduce((t, d) => t + d.amt, 0);
    return { key, fy, date: v.date, number: v.no, narration: v.narr || '', dr, cr, amount: +dr.reduce((t, d) => t + d.amt, 0).toFixed(2), expense: +expense.toFixed(2),
      so: so ? { orderId: String(so.orderId), orderNo: so.orderNo || '', customerPO: so.customerPO || '' } : null, remark: a.remark || '' };
  }).sort((a, b) => a.date.localeCompare(b.date) || (parseInt(a.number, 10) || 0) - (parseInt(b.number, 10) || 0));
}
router.get('/journal/list', (req, res) => {
  const cid = req.query.companyId, fy = fyKey(req.query.fy);
  if (!cid || !fy) return res.status(400).json({ error: 'companyId and fy are required' });
  const ctx = bookCtx(cid), snap = readSnap(cid, `bills-${fy}`);
  res.json({ saved: snap ? { fy, from: snap.from, to: snap.to, fetchedAt: snap.fetchedAt, company: snap.company, gstin: snap.gstin } : null, lines: journalRows(cid, fy, ctx), ...orderLists(ctx) });
});

/* ── Order Profit: every Order ID with its POs, payments, receipts and expenses; vendors PO-wise;
   clients order-wise; overheads by head. Values ex-GST from the ERP orders / POs; cash incl. GST. ── */
router.get('/orders/summary', (req, res) => {
  const cid = req.query.companyId, fy = fyKey(req.query.fy);
  if (!cid) return res.status(400).json({ error: 'companyId is required' });
  const ctx = bookCtx(cid);
  const lines = bookLines(cid, ctx);
  const closed = closedMap(ctx, lines);
  const inFy = d => { if (!fy) return true; const y = 2000 + parseInt(fy.slice(0, 2), 10); return d >= `${y}-04-01` && d <= `${y + 1}-03-31`; };
  const num = v => parseFloat(v) || 0;
  const pay = l => ({ key: l.key, date: l.date, amount: l.amount, bank: l.bank, voucher: `${l.vchType || ''} ${l.number}`.trim(), party: l.party, head: l.res.head, category: l.res.category, closed: closed[l.key]?.status || '' });
  // Tally SO number → ERP order (approved Tally ↔ ERP sales-order pairs)
  const soLinks = readSoLinks(cid), tallySoToErp = {};
  Object.entries(soLinks).forEach(([k, l]) => { tallySoToErp[k.split('|')[0].trim().toUpperCase()] = String(l.orderId); });
  const O = {};   // orderId → order card
  const order = id => {
    const o = ctx.soById[id]; if (!o) return null;
    return O[id] = O[id] || { orderId: String(id), orderNo: o.orderNo || '', client: o.customerName || '', clientId: String(o.customerCode || ''), customerPO: o.customerPO || '',
      orderDate: o.orderDate || '', status: o.status || '', value: num(o.subTotal), valueGst: num(o.grandTotal), invoiced: 0, invoices: [], received: 0, receipts: [], pos: {}, expenses: [], expTotal: 0, vendorPaidNoPo: 0 };
  };
  const poCard = (oc, p) => (oc.pos[p.orderId] = oc.pos[p.orderId] || { poId: String(p.orderId), poNumber: p.poNumber || p.poNo || '', vendor: p.vendorName || '', poDate: p.poDate || '',
    value: num(p.subTotal), valueGst: num(p.grandTotal), billed: 0, bills: [], paid: 0, payments: [] });
  ctx.sos.forEach(o => order(String(o.orderId)));
  const noOrderPos = {};
  ctx.pos.forEach(p => { const oc = p.linkedSalesOrderId && order(String(p.linkedSalesOrderId)); if (oc) poCard(oc, p); else noOrderPos[p.orderId] = p; });
  // Tally bills against a PO (purchase item lines carry the PO no.) and sales invoices against a Tally SO
  for (const v of ctx.bills) {
    const partyLine = v.lines.find(l => l.name === v.party) || null, amt = partyLine ? Math.abs(partyLine.amt) : 0;
    for (const ono of v.orders) {
      const p = ctx.poFor(ono, v.party);
      if (p && partyLine && partyLine.amt > 0) { const oc = order(String(p.linkedSalesOrderId || '')); if (oc) { const pc = poCard(oc, p); pc.billed += amt / v.orders.length; pc.bills.push({ date: v.date, vt: v.vt, no: v.no, amount: +(amt / v.orders.length).toFixed(2) }); } }
      const erpId = ctx.soFor(ono);
      if (erpId && partyLine && partyLine.amt < 0) { const oc = order(erpId); if (oc) { oc.invoiced += amt / v.orders.length; oc.invoices.push({ date: v.date, vt: v.vt, no: v.no, amount: +(amt / v.orders.length).toFixed(2) }); } }
    }
  }
  // bank lines onto orders / POs / overheads / vendors / clients
  const overhead = {}, V = {}, C = {}, unassigned = { receipts: [], vendor: [] };
  const vend = name => (V[name] = V[name] || { vendor: name, kind: ctx.party[name]?.kind || '', pos: {}, paidPo: 0, paidNoPo: 0, payments: [], balance: ctx.tallyBal[name] ?? null, billed: (ctx.party[name]?.billsCr || []).reduce((t, b) => t + b.amt, 0) });
  const cli = name => (C[name] = C[name] || { client: name, orders: {}, received: 0, receivedNoOrder: 0, receipts: [], balance: ctx.tallyBal[name] ?? null, invoiced: (ctx.party[name]?.billsDr || []).reduce((t, b) => t + b.amt, 0) });
  for (const l of lines) {
    const r = l.res, oc = r.so ? order(String(r.so.orderId)) : null, p = pay(l);
    if (l.type === 'receipt' && r.category === 'client') {
      const c = cli(l.party); c.received += l.amount;
      if (oc) { oc.received += l.amount; oc.receipts.push(p); c.orders[oc.orderId] = true; } else { c.receivedNoOrder += l.amount; c.receipts.push(p); if (inFy(l.date)) unassigned.receipts.push(p); }
      continue;
    }
    if (l.type !== 'payment') continue;
    if (r.category === 'vendor-po' || r.category === 'vendor') {
      const v = vend(l.party);
      if (r.po || r.split) {
        // one payment can settle bills of several POs — each PO gets its share; any rest stays "without PO"
        const parts = r.split || [{ po: r.po, amount: l.amount }];
        let used = 0;
        for (const part of parts) {
          if (!part.po) {   // a PO that exists only in Tally — still shown PO-wise under the vendor
            const k = 'T:' + part.tallyPo.toUpperCase();
            const vp = v.pos[k] = v.pos[k] || { poId: k, poNumber: part.tallyPo, orderNo: '', value: 0, paid: 0, payments: [], tallyOnly: true };
            vp.paid += part.amount; vp.payments.push({ ...p, amount: part.amount, of: part.amount !== l.amount ? l.amount : undefined }); v.paidPo += part.amount; used += part.amount;
            continue;
          }
          const pp = { ...p, amount: part.amount, of: parts.length > 1 || part.amount !== l.amount ? l.amount : undefined };
          const so2 = part.po.linkedSalesOrderId ? order(String(part.po.linkedSalesOrderId)) : null;
          const pc = so2 ? poCard(so2, part.po) : null;
          if (pc) { pc.paid += part.amount; pc.payments.push(pp); } else noOrderPos[part.po.orderId] = part.po;
          const vp = v.pos[part.po.orderId] = v.pos[part.po.orderId] || { poId: String(part.po.orderId), poNumber: part.po.poNumber || part.po.poNo || '', orderNo: so2?.orderNo || '', value: num(part.po.subTotal), paid: 0, payments: [] };
          vp.paid += part.amount; vp.payments.push(pp); v.paidPo += part.amount; used += part.amount;
        }
        const rest = +(l.amount - used).toFixed(2);
        if (rest > 0.5) { v.paidNoPo += rest; v.payments.push({ ...p, amount: rest, of: l.amount }); }
      } else { v.paidNoPo += l.amount; v.payments.push(p); if (oc) oc.vendorPaidNoPo += l.amount; else if (inFy(l.date)) unassigned.vendor.push(p); }
      continue;
    }
    if (r.category === 'expense' || r.category === 'salary' || r.category === 'other' || r.category === 'suspense') {
      if (oc) { oc.expenses.push(p); oc.expTotal += l.amount; }
      else if (inFy(l.date)) { const h = r.category === 'salary' ? 'Salary' : r.head || r.category; const o = overhead[h] = overhead[h] || { head: h, category: r.category, amount: 0, count: 0, items: [] }; o.amount += l.amount; o.count++; if (o.items.length < 200) o.items.push(p); }
    }
  }
  // add every ERP PO of each vendor, so a vendor's list shows POs not paid yet too
  ctx.pos.forEach(p => { const name = Object.keys(V).find(n => ctx.nk(n) === ctx.nk(p.vendorName)) || p.vendorName; if (!name) return; const v = vend(name);
    const oc = p.linkedSalesOrderId ? O[String(p.linkedSalesOrderId)] : null;
    v.pos[p.orderId] = v.pos[p.orderId] || { poId: String(p.orderId), poNumber: p.poNumber || p.poNo || '', orderNo: oc?.orderNo || '', value: num(p.subTotal), paid: 0, payments: [] };
    v.pos[p.orderId].billed = oc?.pos[p.orderId]?.billed || 0; });
  for (const f of savedFys(cid, 'bills')) journalRows(cid, f, ctx).forEach(j => {
    if (!j.so || !(j.expense || j.amount)) return;
    const oc = order(j.so.orderId); if (!oc) return;
    const amt = j.expense || j.amount;
    oc.expenses.push({ key: j.key, date: j.date, amount: amt, bank: 'Journal', voucher: `Journal ${j.number}`, party: j.dr.map(d => d.name).join(', '), head: j.dr[0]?.name || '', category: 'expense', closed: '' });
    oc.expTotal += amt;
  });
  const orders = Object.values(O).map(o => {
    const pos = Object.values(o.pos), poValue = pos.reduce((t, p) => t + p.value, 0), poPaid = pos.reduce((t, p) => t + p.paid, 0);
    const cost = poValue + o.expTotal, costLinked = pos.length > 0 || o.expTotal > 0;
    return { ...o, costLinked, pos: pos.map(p => ({ ...p, billed: +p.billed.toFixed(2), paid: +p.paid.toFixed(2) })), invoiced: +o.invoiced.toFixed(2), received: +o.received.toFixed(2), expTotal: +o.expTotal.toFixed(2),
      poValue: +poValue.toFixed(2), poPaid: +poPaid.toFixed(2), cost: +cost.toFixed(2), profit: costLinked ? +(o.value - cost).toFixed(2) : null, margin: costLinked && o.value ? +((o.value - cost) / o.value * 100).toFixed(1) : null,
      toReceive: +((o.invoiced || o.valueGst) - o.received).toFixed(2), cash: +(o.received - poPaid - o.vendorPaidNoPo - o.expTotal).toFixed(2) };
  }).filter(o => !fy || inFy(o.orderDate)).sort((a, b) => String(b.orderDate).localeCompare(String(a.orderDate)));
  const overheads = Object.values(overhead).map(o => ({ ...o, amount: +o.amount.toFixed(2) })).sort((a, b) => b.amount - a.amount);
  const vendors = Object.values(V).map(v => ({ ...v, pos: Object.values(v.pos).sort((a, b) => String(b.poNumber).localeCompare(String(a.poNumber))), paidPo: +v.paidPo.toFixed(2), paidNoPo: +v.paidNoPo.toFixed(2), billed: +v.billed.toFixed(2) }))
    .filter(v => v.paidPo || v.paidNoPo || v.pos.length).sort((a, b) => (b.paidPo + b.paidNoPo) - (a.paidPo + a.paidNoPo));
  const clients = Object.values(C).map(c => ({ ...c, orders: Object.keys(c.orders).map(id => O[id]).filter(Boolean).map(o => ({ orderId: o.orderId, orderNo: o.orderNo, customerPO: o.customerPO, valueGst: o.valueGst, invoiced: +o.invoiced.toFixed(2), received: +o.received.toFixed(2), receipts: o.receipts })),
    received: +c.received.toFixed(2), receivedNoOrder: +c.receivedNoOrder.toFixed(2), invoiced: +c.invoiced.toFixed(2) })).sort((a, b) => b.received - a.received);
  const sum = (a, k) => +a.reduce((t, x) => t + (x[k] || 0), 0).toFixed(2);
  const linked = orders.filter(o => o.costLinked);
  const ordersProfit = sum(linked, 'profit'), overheadTotal = sum(overheads.filter(o => o.category !== 'suspense'), 'amount');
  // the company's real result is Tally's own Profit & Loss (saved with the Balance Sheet)
  const plOf = f => readSnap(cid, `pl-${f}`);
  const tallyPl = fy ? plOf(fy) : null;
  const tallyNet = fy ? (tallyPl ? tallyPl.netProfit : null) : (readSnap(cid, 'profit-by-fy')?.years || []).reduce((t, y) => t + (y.netProfit || 0), 0);
  res.json({
    fy: fy || 'all', fysWithBank: savedFys(cid, 'bank'), fysWithBills: savedFys(cid, 'bills'),
    totals: { orders: orders.length, value: sum(orders, 'value'), cost: sum(linked, 'cost'), ordersProfit, overheads: overheadTotal, net: +(ordersProfit - overheadTotal).toFixed(2),
      linkedOrders: linked.length, linkedValue: sum(linked, 'value'), noCostOrders: orders.length - linked.length, noCostValue: +(sum(orders, 'value') - sum(linked, 'value')).toFixed(2),
      tallyNet: tallyNet != null ? +tallyNet.toFixed(2) : null, tallyPlAt: tallyPl?.fetchedAt || null,
      received: sum(orders, 'received'), poPaid: sum(orders, 'poPaid'), expOnOrders: sum(orders, 'expTotal'),
      unassignedReceipts: sum(unassigned.receipts, 'amount'), unassignedVendor: sum(unassigned.vendor, 'amount') },
    orders, vendors, clients, overheads, unassigned: { receipts: unassigned.receipts.slice(0, 300), vendor: unassigned.vendor.slice(0, 300) },
  });
});

/* the ERP entries already matched to Tally (for the bank statement's "in Tally" tick) */
router.get('/bank/linked-ids', (req, res) => {
  const cid = req.query.companyId;
  if (!cid) return res.status(400).json({ error: 'companyId is required' });
  res.json({ paymentIds: Object.values(readBankLinks(cid)).map(l => String(l.paymentId)) });
});

/* Fetch every FY in one go: for each year in Tally's books, its P&L and Balance Sheet
   (2 reports a year, one at a time through the queue), each saved in the ERP, plus the
   FY comparison built from those same P&Ls. Only one run at a time per ERP company. */
const fetchAllRunning = new Set();
router.get('/fetch-all', async (req, res) => {
  const cid = req.query.companyId;
  if (fetchAllRunning.has(cid)) return res.status(409).json({ code: 'BUSY', error: 'A fetch of all FYs is already running — please wait for it to finish.' });
  fetchAllRunning.add(cid);
  try {
    const c = await connect(); const { co, match } = await resolveCompany(c, cid, req.query.company);
    const groups = await primaryGroups(c, co.name);
    const first = parseInt((co.booksFrom || co.startingFrom || '').slice(0, 4), 10) || curFyStart();
    const today = new Date().toISOString().slice(0, 10);
    const years = [], done = [];
    for (let y = first; y <= curFyStart(); y++) {
      const b = fyBounds(y);
      const to = y === curFyStart() ? today : b.to;            // running FY: up to today, as Tally shows
      const stamp = { company: co.name, gstin: match.gstin, from: b.from, to, fetchedAt: new Date().toISOString() };
      const pl = buildProfitLoss(parseRows(await tallyExport(c.host, c.port, reportXml('Profit and Loss', co.name, b.from, to))));
      const bs = buildBalanceSheet(parseRows(await tallyExport(c.host, c.port, reportXml('Balance Sheet', co.name, b.from, to))), groups);
      const pla = [...bs.liabilities, ...bs.assets].find(h => h.name === 'Profit & Loss A/c');
      if (pla) {
        const cur = bs.liabilities.includes(pla) ? pl.netProfit : -pl.netProfit;
        pla.items = [{ name: 'Opening Balance', amount: +(pla.amount - cur).toFixed(2) || null }, { name: 'Current Period', amount: cur || null }];
      }
      saveSnap(cid, `pl-${b.fy}`, { ...stamp, ...pl });
      saveSnap(cid, `bs-${b.fy}`, { ...stamp, ...bs });
      years.push({ ...b, to, sales: pl.sales, directIncomes: pl.directIncomes, costOfSales: pl.costOfSales, grossProfit: pl.grossProfit,
        indirectIncomes: pl.indirectIncomes, indirectExpenses: pl.indirectExpenses, netProfit: pl.netProfit });
      done.push(b.fy);
    }
    const fyOut = { company: co.name, gstin: match.gstin, fetchedAt: new Date().toISOString(), years };
    saveSnap(cid, 'profit-by-fy', fyOut);
    res.json({ company: co.name, gstin: match.gstin, fys: done, profitByFy: fyOut });
  } catch (e) { res.status(e.code ? 409 : 502).json({ error: e.message, code: e.code || 'TALLY', tallyGstin: e.tallyGstin, erpGstin: e.erpGstin }); }
  finally { fetchAllRunning.delete(cid); }
});

module.exports = router;
module.exports._test = { parseRows, buildBalanceSheet, buildProfitLoss, tallyExport };
