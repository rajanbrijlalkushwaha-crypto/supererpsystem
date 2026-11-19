/**
 * office.js — Office Suite: letters (Word) and sheets (Excel) made inside the ERP, kept with an order / client.
 *
 * Stored at Database/Companies/{co}/Office/
 *   Docs/{docId}/doc.json   { docId, kind: 'word' | 'excel', title, letterType, letterheadId, orderId, orderNo, clientId, clientName,
 *                             html (word) | sheet { rows, cols, cells{A1:{v,b,a}}, widths{} } (excel), landscape,
 *                             pdfAt, pdfBy, signedBy, signedAt, createdBy, createdAt, updatedBy, updatedAt, status, audit[] }
 *   Docs/{docId}/base.pdf   the PDF as made (with the letterhead, no signature)
 *   Docs/{docId}/doc.pdf    the PDF to use: base.pdf, or base.pdf with the signature placed where the user put it
 *   Letterheads/{id}.json   { id, name, file, type: 'pdf' | 'png' | 'jpg', top, bottom, left, right (mm), addedBy, addedAt }
 *   Letterheads/{id}.{pdf|png|jpg} and {id}-preview.png (page 1 as a picture, for the editor screen)
 *
 *   GET    /api/office/docs                     list (without the body)
 *   GET    /api/office/docs/:id                 one, with the body
 *   POST   /api/office/docs                     save { docId?, kind, title, … }  → the saved doc
 *   DELETE /api/office/docs/:id                 marks it deleted (who made it, or the admin)
 *   POST   /api/office/docs/:id/pdf { html }     make the PDF: html laid out by headless Chrome, drawn on the letterhead
 *   GET    /api/office/docs/:id/pdf[?base=1]    the PDF (base = without the signature, for placing it)
 *   POST   /api/office/docs/:id/sign { page, x, y, w, withName }  your own saved signature (My Profile) drawn on that page;
 *          x, y, w are fractions of the page (top-left of the signature); signing again replaces the earlier signature
 *   GET    /api/office/pdfjs/:file              pdf.js for the browser (shows the PDF pages to place the signature)
 *   GET    /api/office/letterheads              list · POST (multipart: file, name, top, bottom, left, right) · PUT /:id (margins / name)
 *   GET    /api/office/letterheads/:id/preview  page 1 as PNG · DELETE /api/office/letterheads/:id
 */
const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { ROOT, resolveUser } = require('./helpers');

const router = express.Router();
const base = co => path.join(ROOT, 'Database', 'Companies', String(co).replace(/[^\w-]/g, ''), 'Office');
const docDir = (co, id) => path.join(base(co), 'Docs', String(id));
const lhDir = co => path.join(base(co), 'Letterheads');
const readJ = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const writeJ = (f, d) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(d, null, 2)); };
const s = (v, max = 200) => String(v ?? '').trim().slice(0, max);
const mm = (v, d) => { const x = parseFloat(v); return Number.isFinite(x) && x >= 0 && x <= 120 ? Math.round(x * 10) / 10 : d; };
const okId = v => /^\d{6,16}$/.test(String(v || ''));
const need = (req, res) => { const u = resolveUser(req); if (!u) { res.status(401).json({ error: 'Please sign in again.' }); return null; } return u; };
const isAdmin = u => u.role === 'admin';
const KINDS = ['word', 'excel'];
const LETTER_TYPES = ['Blank', 'Letter', 'Reminder Letter', 'Covering Letter', 'Notice', 'Other'];
const newId = dir => { let id = Date.now(); while (fs.existsSync(path.join(dir, String(id)))) id += 1; return String(id); };

/* ── documents ── */
function allDocs(co) {
  const d = path.join(base(co), 'Docs');
  if (!fs.existsSync(d)) return [];
  return fs.readdirSync(d).filter(okId).map(x => readJ(path.join(d, x, 'doc.json'))).filter(x => x && x.status !== 'deleted');
}
const head = x => { const { html, sheet, audit, ...rest } = x; return { ...rest, hasPdf: !!x.pdfAt }; };

router.get('/docs', (req, res) => {
  const u = need(req, res); if (!u) return;
  res.json(allDocs(u.companyId).map(head).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))));
});

router.get('/docs/:id', (req, res) => {
  const u = need(req, res); if (!u) return;
  if (!okId(req.params.id)) return res.status(400).json({ error: 'Bad document.' });
  const x = readJ(path.join(docDir(u.companyId, req.params.id), 'doc.json'));
  if (!x || x.status === 'deleted') return res.status(404).json({ error: 'Document not found.' });
  res.json(x);
});

const COLOR = v => (/^#[0-9a-f]{6}$/i.test(String(v || '')) ? String(v).toUpperCase() : '');
const KEY = /^[A-Z]{1,2}\d{1,4}$/;
function cleanSheet(sh) {
  const rows = Math.min(1000, Math.max(1, parseInt(sh?.rows, 10) || 50));
  const cols = Math.min(52, Math.max(1, parseInt(sh?.cols, 10) || 15));
  const cells = {};
  Object.entries(sh?.cells || {}).forEach(([k, c]) => {
    if (!KEY.test(k) || !c || typeof c !== 'object') return;
    const x = {};
    const v = s(c.v, 4000); if (v) x.v = v;
    ['b', 'i', 'u', 's', 'wr'].forEach(f => { if (c[f]) x[f] = 1; });
    if (['l', 'c', 'r'].includes(c.a)) x.a = c.a;
    if (['t', 'm', 'b'].includes(c.va)) x.va = c.va;
    if (COLOR(c.fc)) x.fc = COLOR(c.fc);
    if (COLOR(c.bg)) x.bg = COLOR(c.bg);
    const fs = parseFloat(c.fs); if (fs >= 6 && fs <= 72) x.fs = fs;
    if (['num', 'inr', 'pct', 'plain', 'text'].includes(c.nf)) x.nf = c.nf;
    const dp = parseInt(c.dp, 10); if (dp >= 0 && dp <= 6 && c.dp != null && c.dp !== '') x.dp = dp;
    const bd = String(c.bd || '').replace(/[^tlrb]/g, '').split('').filter((y, i, a) => a.indexOf(y) === i).sort().join(''); if (bd) x.bd = bd;
    if (Object.keys(x).length) cells[k] = x;
  });
  const widths = {};
  Object.entries(sh?.widths || {}).forEach(([k, w]) => { const x = parseInt(w, 10); if (/^[A-Z]{1,2}$/.test(k) && x >= 30 && x <= 600) widths[k] = x; });
  const heights = {};
  Object.entries(sh?.heights || {}).forEach(([k, h]) => { const x = parseInt(h, 10); if (/^\d{1,4}$/.test(k) && x >= 16 && x <= 300) heights[k] = x; });
  const merges = (Array.isArray(sh?.merges) ? sh.merges : []).map(String).filter(m => /^[A-Z]{1,2}\d{1,4}:[A-Z]{1,2}\d{1,4}$/.test(m)).slice(0, 500);
  return { rows, cols, cells, widths, heights, merges, grid: sh?.grid !== false };
}

router.post('/docs', (req, res) => {
  const u = need(req, res); if (!u) return;
  const b = req.body || {};
  const kind = KINDS.includes(b.kind) ? b.kind : '';
  if (!kind) return res.status(400).json({ error: 'Word or Excel?' });
  const title = s(b.title, 160);
  if (!title) return res.status(400).json({ error: 'Give the document a name.' });
  if (!s(b.orderNo) && !s(b.clientName)) return res.status(400).json({ error: 'Choose the order (or the client) this document is for.' });
  const co = u.companyId;
  const dir = path.join(base(co), 'Docs');
  const old = okId(b.docId) ? readJ(path.join(docDir(co, b.docId), 'doc.json')) : null;
  if (b.docId && (!old || old.status === 'deleted')) return res.status(404).json({ error: 'Document not found.' });
  const now = new Date().toISOString();
  const by = u.name || u.username || '';
  const body = kind === 'word' ? { html: String(b.html || '').slice(0, 3 * 1024 * 1024) } : { sheet: cleanSheet(b.sheet) };
  const changed = !old || (kind === 'word' ? old.html !== body.html : JSON.stringify(old.sheet) !== JSON.stringify(body.sheet))
    || old.letterheadId !== s(b.letterheadId, 20) || !!old.landscape !== !!b.landscape;
  const doc = {
    ...(old || {}),
    docId: old ? old.docId : newId(dir), kind, title,
    letterType: LETTER_TYPES.includes(b.letterType) ? b.letterType : (kind === 'word' ? 'Letter' : ''),
    letterheadId: s(b.letterheadId, 20), landscape: !!b.landscape,
    orderId: s(b.orderId, 40), orderNo: s(b.orderNo, 60), clientId: s(b.clientId, 40), clientName: s(b.clientName, 160),
    ...body,
    // the PDF (and its signature) no longer matches once the text changes — make it again
    ...(changed && old ? { pdfAt: '', pdfBy: '', signedBy: '', signedAt: '' } : {}),
    createdBy: old ? old.createdBy : by, createdById: old ? old.createdById : String(u.id), createdAt: old ? old.createdAt : now,
    updatedBy: by, updatedAt: now, status: 'active',
    audit: [...(old?.audit || []), { action: old ? 'edited' : 'created', by, at: now }].slice(-50),
  };
  if (changed && old) ['doc.pdf', 'base.pdf'].forEach(n => { try { fs.unlinkSync(path.join(docDir(co, doc.docId), n)); } catch { /* none */ } });
  writeJ(path.join(docDir(co, doc.docId), 'doc.json'), doc);
  res.json(doc);
});

router.delete('/docs/:id', (req, res) => {
  const u = need(req, res); if (!u) return;
  if (!okId(req.params.id)) return res.status(400).json({ error: 'Bad document.' });
  const f = path.join(docDir(u.companyId, req.params.id), 'doc.json');
  const x = readJ(f);
  if (!x || x.status === 'deleted') return res.status(404).json({ error: 'Document not found.' });
  if (String(x.createdById) !== String(u.id) && !isAdmin(u)) return res.status(403).json({ error: `Only ${x.createdBy || 'who made it'} or the admin can delete this.` });
  const now = new Date().toISOString();
  writeJ(f, { ...x, status: 'deleted', audit: [...(x.audit || []), { action: 'deleted', by: u.name || u.username, at: now }] });
  res.json({ ok: true });
});

/* ── PDF: the page laid out by headless Chrome (clear background), drawn on top of the letterhead ── */
let browserP = null;
async function browser() {
  if (browserP) { const b = await browserP.catch(() => null); if (b && b.connected !== false && b.isConnected?.() !== false) return b; }
  const puppeteer = require('puppeteer');
  browserP = puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  return browserP;
}
async function withPage(fn) {
  const b = await browser();
  const page = await b.newPage();
  try { return await fn(page); } finally { await page.close().catch(() => {}); }
}

async function onLetterhead(contentPdf, lh, co) {
  const { PDFDocument } = require('pdf-lib');
  const src = await PDFDocument.load(contentPdf);
  if (!lh) return Buffer.from(contentPdf);
  const bytes = fs.readFileSync(path.join(lhDir(co), lh.file));
  const out = await PDFDocument.create();
  let bgPage = null; let bgImg = null;
  if (lh.type === 'pdf') [bgPage] = await out.embedPdf(bytes, [0]);
  else bgImg = lh.type === 'png' ? await out.embedPng(bytes) : await out.embedJpg(bytes);
  const pages = await out.embedPdf(contentPdf, src.getPageIndices());
  src.getPages().forEach((p, i) => {
    const { width, height } = p.getSize();
    const pg = out.addPage([width, height]);
    if (bgPage) pg.drawPage(bgPage, { x: 0, y: 0, width, height });
    if (bgImg) pg.drawImage(bgImg, { x: 0, y: 0, width, height });
    pg.drawPage(pages[i], { x: 0, y: 0, width, height });
  });
  return Buffer.from(await out.save());
}

router.post('/docs/:id/pdf', async (req, res) => {
  const u = need(req, res); if (!u) return;
  if (!okId(req.params.id)) return res.status(400).json({ error: 'Bad document.' });
  const co = u.companyId;
  const f = path.join(docDir(co, req.params.id), 'doc.json');
  const x = readJ(f);
  if (!x || x.status === 'deleted') return res.status(404).json({ error: 'Save the document first.' });
  const html = String(req.body?.html || '');
  if (!html) return res.status(400).json({ error: 'Nothing to print.' });
  const lh = x.letterheadId ? readJ(path.join(lhDir(co), `${x.letterheadId}.json`)) : null;
  try {
    const content = await withPage(async page => {
      await page.setContent(html, { waitUntil: 'load' });
      return page.pdf({ printBackground: true, preferCSSPageSize: true, omitBackground: !!lh });
    });
    const pdf = await onLetterhead(content, lh, co);
    fs.writeFileSync(path.join(docDir(co, x.docId), 'base.pdf'), pdf);
    fs.writeFileSync(path.join(docDir(co, x.docId), 'doc.pdf'), pdf);
    const now = new Date().toISOString();
    const by = u.name || u.username || '';
    writeJ(f, { ...x, pdfAt: now, pdfBy: by, signedBy: '', signedAt: '', sign: null,
      audit: [...(x.audit || []), { action: 'made PDF', by, at: now }].slice(-50) });
    res.setHeader('Content-Type', 'application/pdf');
    res.send(pdf);
  } catch (e) {
    browserP = null;
    res.status(500).json({ error: 'Could not make the PDF: ' + e.message });
  }
});

router.get('/docs/:id/pdf', (req, res) => {
  const u = need(req, res); if (!u) return;
  if (!okId(req.params.id)) return res.status(400).json({ error: 'Bad document.' });
  const d = docDir(u.companyId, req.params.id);
  const p = req.query.base && fs.existsSync(path.join(d, 'base.pdf')) ? path.join(d, 'base.pdf') : path.join(d, 'doc.pdf');
  if (!fs.existsSync(p)) return res.status(404).json({ error: 'No PDF yet — make it first.' });
  res.setHeader('Content-Type', 'application/pdf');
  res.send(fs.readFileSync(p));
});

/* ── signature placed by the user on the PDF ── */
const T = require('./tenant');
const frac = (v, lo = 0, hi = 1) => { const x = parseFloat(v); return Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : null; };
router.post('/docs/:id/sign', async (req, res) => {
  const u = need(req, res); if (!u) return;
  if (!okId(req.params.id)) return res.status(400).json({ error: 'Bad document.' });
  const co = u.companyId;
  const dir = docDir(co, req.params.id);
  const f = path.join(dir, 'doc.json');
  const x = readJ(f);
  if (!x || x.status === 'deleted') return res.status(404).json({ error: 'Document not found.' });
  const baseF = fs.existsSync(path.join(dir, 'base.pdf')) ? path.join(dir, 'base.pdf') : path.join(dir, 'doc.pdf');
  if (!x.pdfAt || !fs.existsSync(baseF)) return res.status(400).json({ error: 'Make the PDF first.' });
  let img;
  try { img = fs.readFileSync(path.join(T.userDir(co, u.id), 'signature.png')); } catch { return res.status(400).json({ error: 'Save your signature first: My Profile → My signature.' }); }
  const b = req.body || {};
  const page = parseInt(b.page, 10) || 0;
  const px = frac(b.x); const py = frac(b.y); const pw = frac(b.w, 0.03, 0.9);
  if (px == null || py == null || pw == null) return res.status(400).json({ error: 'Place the signature on the page.' });
  try {
    const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
    const doc = await PDFDocument.load(fs.readFileSync(baseF));
    if (page < 0 || page >= doc.getPageCount()) return res.status(400).json({ error: 'That page is not in the PDF.' });
    const pg = doc.getPage(page);
    const { width, height } = pg.getSize();
    const im = img[0] === 0xFF ? await doc.embedJpg(img) : await doc.embedPng(img);
    const w = pw * width; const h = w * im.height / im.width;
    const left = px * width; const top = py * height;
    pg.drawImage(im, { x: left, y: height - top - h, width: w, height: h });
    // the name as in the user's profile (the same name the signing window shows)
    const prof = (T.readUsers(co) || []).find(x => String(x.id) === String(u.id)) || {};
    const by = [prof.firstName, prof.middleName, prof.lastName].filter(Boolean).join(' ') || prof.name || u.name || u.username || '';
    const now = new Date().toISOString();
    if (b.withName) {
      const font = await doc.embedFont(StandardFonts.Helvetica);
      const t = `${by} · ${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })}`;
      const size = 8; const tw = font.widthOfTextAtSize(t, size);
      pg.drawText(t, { x: left + Math.max(0, (w - tw) / 2), y: height - top - h - size - 1, size, font, color: rgb(0, 0, 0) });
    }
    const pdf = Buffer.from(await doc.save());
    fs.writeFileSync(path.join(dir, 'doc.pdf'), pdf);
    writeJ(f, { ...x, signedBy: by, signedById: String(u.id), signedAt: now, sign: { page, x: px, y: py, w: pw, withName: !!b.withName },
      audit: [...(x.audit || []), { action: `signed PDF (page ${page + 1})`, by, at: now }].slice(-50) });
    res.setHeader('Content-Type', 'application/pdf');
    res.send(pdf);
  } catch (e) {
    res.status(500).json({ error: 'Could not sign the PDF: ' + e.message });
  }
});

/* pdf.js for the browser — shows the PDF pages so the signature can be placed */
router.get('/pdfjs/:file', (req, res) => {
  const file = { 'pdf.min.js': 'pdf.min.js', 'pdf.worker.min.js': 'pdf.worker.min.js' }[req.params.file];
  if (!file) return res.status(404).end();
  res.setHeader('Content-Type', 'text/javascript; charset=utf-8');
  res.setHeader('Cache-Control', 'private, max-age=604800');
  res.sendFile(path.join(__dirname, 'vendor', 'pdfjs', file));
});

/* ── letterheads ── */
const PDFJS = path.join(__dirname, 'vendor', 'pdfjs');
async function pdfToPng(bytes) {
  return withPage(async page => {
    await page.setViewport({ width: 800, height: 1000 });
    await page.setContent('<!DOCTYPE html><html><body style="margin:0;background:#fff"><canvas id="c"></canvas></body></html>');
    await page.addScriptTag({ content: fs.readFileSync(path.join(PDFJS, 'pdf.min.js'), 'utf8') });
    const worker = fs.readFileSync(path.join(PDFJS, 'pdf.worker.min.js'), 'utf8');
    const dataUrl = await page.evaluate(async (b64, wsrc) => {
      /* global pdfjsLib */
      pdfjsLib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(new Blob([wsrc], { type: 'text/javascript' }));
      const raw = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
      const doc = await pdfjsLib.getDocument({ data: raw }).promise;
      const pg = await doc.getPage(1);
      const v1 = pg.getViewport({ scale: 1 });
      const vp = pg.getViewport({ scale: 1240 / v1.width });
      const c = document.getElementById('c'); c.width = vp.width; c.height = vp.height;
      const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
      await pg.render({ canvasContext: ctx, viewport: vp }).promise;
      return c.toDataURL('image/png');
    }, bytes.toString('base64'), worker);
    return Buffer.from(dataUrl.split(',')[1], 'base64');
  });
}

const allLh = co => { const d = lhDir(co); return fs.existsSync(d) ? fs.readdirSync(d).filter(x => /^\d+\.json$/.test(x)).map(x => readJ(path.join(d, x))).filter(x => x && !x.deleted) : []; };
router.get('/letterheads', (req, res) => { const u = need(req, res); if (!u) return; res.json(allLh(u.companyId).sort((a, b) => String(a.name).localeCompare(String(b.name)))); });

const up = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
router.post('/letterheads', up.single('file'), async (req, res) => {
  const u = need(req, res); if (!u) return;
  const f = req.file;
  if (!f) return res.status(400).json({ error: 'Choose the letterhead file (PDF, PNG or JPG).' });
  const head4 = f.buffer.slice(0, 4).toString('latin1');
  const type = head4 === '%PDF' ? 'pdf' : f.buffer[0] === 0x89 && head4.slice(1) === 'PNG' ? 'png' : f.buffer[0] === 0xFF && f.buffer[1] === 0xD8 ? 'jpg' : '';
  if (!type) return res.status(400).json({ error: 'The letterhead must be a PDF, PNG or JPG.' });
  const co = u.companyId;
  const id = newId(lhDir(co));
  try {
    fs.mkdirSync(lhDir(co), { recursive: true });
    fs.writeFileSync(path.join(lhDir(co), `${id}.${type}`), f.buffer);
    fs.writeFileSync(path.join(lhDir(co), `${id}-preview.png`), type === 'pdf' ? await pdfToPng(f.buffer) : f.buffer);
  } catch (e) {
    browserP = null;
    return res.status(500).json({ error: 'Could not read the letterhead: ' + e.message });
  }
  const b = req.body || {};
  const lh = { id, name: s(b.name, 80) || s(f.originalname, 80).replace(/\.\w+$/, ''), file: `${id}.${type}`, type,
    top: mm(b.top, 35), bottom: mm(b.bottom, 32), left: mm(b.left, 20), right: mm(b.right, 20),
    addedBy: u.name || u.username || '', addedAt: new Date().toISOString() };
  writeJ(path.join(lhDir(co), `${id}.json`), lh);
  res.json(lh);
});

router.put('/letterheads/:id', (req, res) => {
  const u = need(req, res); if (!u) return;
  if (!okId(req.params.id)) return res.status(400).json({ error: 'Bad letterhead.' });
  const f = path.join(lhDir(u.companyId), `${req.params.id}.json`);
  const x = readJ(f); if (!x || x.deleted) return res.status(404).json({ error: 'Letterhead not found.' });
  const b = req.body || {};
  const lh = { ...x, name: s(b.name, 80) || x.name, top: mm(b.top, x.top), bottom: mm(b.bottom, x.bottom), left: mm(b.left, x.left), right: mm(b.right, x.right) };
  writeJ(f, lh); res.json(lh);
});

router.get('/letterheads/:id/preview', (req, res) => {
  const u = need(req, res); if (!u) return;
  if (!okId(req.params.id)) return res.status(400).end();
  const p = path.join(lhDir(u.companyId), `${req.params.id}-preview.png`);
  if (!fs.existsSync(p)) return res.status(404).end();
  const b = fs.readFileSync(p);
  res.setHeader('Content-Type', b[0] === 0xFF ? 'image/jpeg' : 'image/png');
  res.setHeader('Cache-Control', 'private, max-age=86400');
  res.send(b);
});

router.delete('/letterheads/:id', (req, res) => {
  const u = need(req, res); if (!u) return;
  if (!okId(req.params.id)) return res.status(400).json({ error: 'Bad letterhead.' });
  const f = path.join(lhDir(u.companyId), `${req.params.id}.json`);
  const x = readJ(f); if (!x) return res.status(404).json({ error: 'Letterhead not found.' });
  writeJ(f, { ...x, deleted: true, deletedBy: u.name || u.username, deletedAt: new Date().toISOString() });
  res.json({ ok: true });
});

module.exports = router;
