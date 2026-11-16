/* The e-way bill PDF as the e-way portal prints it — kept with its delivery challan so it can be printed, shared
 * or e-mailed with (or without) the DC.
 *   Comes from: the E-Way Helper (it captures the portal's print page after generating / checking), or a person
 *   uploading the PDF they saved from the portal.
 *   Stored as Database/Companies/<company>/DeliveryChallan/<dcId>/EwayBill-<ewb no>.pdf, noted on the DC as ewayPdf.
 *   Return notes (material back from a client / back to a vendor) keep theirs the same way under Returns/<id>/. */
const fs = require('fs');
const path = require('path');

const DB = path.join(__dirname, '..', 'Database', 'Companies');
const safeId = v => /^[A-Za-z0-9_-]{1,40}$/.test(String(v || ''));
const isPdf = b => Buffer.isBuffer(b) && b.length > 100 && b.slice(0, 5).toString('latin1') === '%PDF-';

/* the same store for any document kept in Database/Companies/<company>/<folder>/<id>/<id>.json
   (delivery challans, return notes) */
function store(folder, label) {
  const entryDir = (cid, id) => path.join(DB, String(cid), folder, String(id));
  const docFile = (cid, id) => path.join(entryDir(cid, id), `${id}.json`);
  function readDc(cid, id) {
    if (!safeId(cid) || !safeId(id)) return null;
    try { return JSON.parse(fs.readFileSync(docFile(cid, id), 'utf8')); } catch { return null; }
  }
  /* save the portal PDF on the document (replaces an earlier one) → its ewayPdf note */
  function savePortalPdf(cid, dcId, buf, { ewbNo = '', source = 'upload', by = '' } = {}) {
    const dc = readDc(cid, dcId);
    if (!dc) throw new Error(`${label} not found.`);
    if (!isPdf(buf)) throw new Error('This is not a PDF file.');
    if (buf.length > 15 * 1024 * 1024) throw new Error('The PDF is larger than 15 MB.');
    const no = String(ewbNo || dc.ewayBillNo || '').replace(/\D/g, '').slice(0, 12);
    const file = `EwayBill-${no || 'portal'}.pdf`;
    const old = dc.ewayPdf && dc.ewayPdf.file;
    fs.writeFileSync(path.join(entryDir(cid, dcId), file), buf);
    if (old && old !== file && /^EwayBill-[\w-]+\.pdf$/.test(old)) fs.rmSync(path.join(entryDir(cid, dcId), old), { force: true });
    const note = { file, ewbNo: no, source, by: String(by || '').slice(0, 80), at: new Date().toISOString(), size: buf.length };
    fs.writeFileSync(docFile(cid, dcId), JSON.stringify({ ...dc, ewayPdf: note, updatedAt: new Date().toISOString() }, null, 2));
    return note;
  }
  function portalPdfPath(cid, dcId) {
    const dc = readDc(cid, dcId);
    const f = dc && dc.ewayPdf && dc.ewayPdf.file;
    if (!f || !/^EwayBill-[\w-]+\.pdf$/.test(f)) return null;
    const p = path.join(entryDir(cid, dcId), f);
    return fs.existsSync(p) ? { path: p, dc } : null;
  }
  function removePortalPdf(cid, dcId) {
    const got = portalPdfPath(cid, dcId);
    const dc = readDc(cid, dcId);
    if (!dc) throw new Error(`${label} not found.`);
    if (got) fs.rmSync(got.path, { force: true });
    const { ewayPdf, ...rest } = dc;
    fs.writeFileSync(docFile(cid, dcId), JSON.stringify({ ...rest, updatedAt: new Date().toISOString() }, null, 2));
  }
  return { readDc, savePortalPdf, portalPdfPath, removePortalPdf, docFile };
}
const dcStore = store('DeliveryChallan', 'Delivery challan');
const returnStore = store('Returns', 'Return note');

/* the portal's print page (html sent by the helper: its own styles and pictures included) → an A4 PDF.
   A page wider than A4 is scaled down to fit the width. */
async function htmlToPdf(html) {
  const puppeteer = require('puppeteer');
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1000, height: 1400 });
    await page.setContent(String(html), { waitUntil: 'networkidle0', timeout: 30000 }).catch(() => {});
    await page.emulateMediaType('print');
    const w = await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body ? document.body.scrollWidth : 0));
    const usable = 194 / 25.4 * 96;   // A4 width less 8 mm margins, in CSS px
    const scale = Math.max(0.4, Math.min(1, usable / (w || usable)));
    return Buffer.from(await page.pdf({ format: 'A4', printBackground: true, scale, margin: { top: '8mm', bottom: '8mm', left: '8mm', right: '8mm' } }));
  } finally { await browser.close().catch(() => {}); }
}

module.exports = { ...dcStore, returns: returnStore, htmlToPdf, isPdf };
