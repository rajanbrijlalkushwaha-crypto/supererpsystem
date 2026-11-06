const express = require('express');
const path    = require('path');
const fs      = require('fs');
const multer  = require('multer');
const { ROOT, auditEntry, pushAudit, resolveUser } = require('./helpers');
const { extractQrs } = require('./pdf-qr');
const { addSystemLog } = require('./communication');
const { notifyApprovers } = require('./notifications');

const router = express.Router();

/* ── multer: store files in SalesBills|PurchaseBills/<billId>/docs/ (by ?type=) ── */
const billUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const dir = path.join(ROOT, 'Database', 'Companies',
        req.query.companyId || req.body.companyId || '',
        req.query.type === 'purchase' ? 'PurchaseBills' : 'SalesBills', req.params.billId, 'docs');
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
  }),
});

const cid = req => req.query.companyId || req.body?.companyId;

/* Resolve a bill attachment on disk. Older purchase-bill uploads were wrongly saved
   under SalesBills/<billId>/docs, so fall back to that folder when the file is missing. */
const findBillDoc = (companyId, type, billId, fileName) => {
  const base = path.join(ROOT, 'Database', 'Companies', companyId || '');
  const own   = type === 'purchase' ? 'PurchaseBills' : 'SalesBills';
  const other = type === 'purchase' ? 'SalesBills' : 'PurchaseBills';
  for (const folder of [own, other]) {
    const p = path.join(base, folder, billId, 'docs', fileName);
    if (fs.existsSync(p)) return p;
  }
  return null;
};

/* ── multer: memory storage for transient PDF parsing ── */
const memUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

/* Convert "20-Dec-25" / "20-Dec-2025" → "2025-12-20" (ISO date for <input type=date>) */
function parseBillDate(s) {
  if (!s) return '';
  const MON = { jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12 };
  const m = s.match(/(\d{1,2})[-\/]([A-Za-z]{3})[-\/](\d{2,4})/);
  if (!m) return '';
  const d = parseInt(m[1]), mon = MON[m[2].toLowerCase()], y = parseInt(m[3]) < 100 ? 2000 + parseInt(m[3]) : parseInt(m[3]);
  if (!mon) return '';
  return `${y}-${String(mon).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
}

/* Extra fields from a Tally tax-invoice PDF: buyer's order no./date, buyer GSTIN + state,
   tax totals, grand total and product lines. The Beta sales bill uses them to find the order
   and cross-check amounts. Best-effort: anything not found comes back empty / 0. */
function parseInvoiceExtra(text) {
  const find = re => { const m = text.match(re); return m ? m[1].trim() : ''; };
  const money = s => parseFloat(String(s || '').replace(/,/g, '')) || 0;
  // Buyer's Order No. — value is the next line, unless that line is the next label (blank field)
  let buyerOrderNo = find(/Buyer.?s\s*Order\s*No\.?\s*[\r\n]+\s*([^\r\n]+)/i);
  if (/^(Dispatch|Dated|Delivery|Mode|Destination|Terms)\b/i.test(buyerOrderNo)) buyerOrderNo = '';
  buyerOrderNo = buyerOrderNo.replace(/\s*\(?\s*Dated?\b.*$/i, '').trim();   // "3100009317 Dated:28.09.2026"
  const buyerOrderDate = parseBillDate(find(/Mode\/Terms\s*of\s*Payment[\s\S]{0,80}?Dated\s*[\r\n]+\s*(\d{1,2}-[A-Za-z]{3}-\d{2,4})/i));
  const buyerBlock = (text.match(/Buyer\s*\(Bill\s*to\)([\s\S]{0,600}?)(?:Invoice\s*No|$)/i) || [])[1] || '';
  const buyerGstin = ((buyerBlock.match(/GSTIN\/UIN\s*:?\s*([0-9]{2}[A-Z0-9]{13})/i) || [])[1] || '').toUpperCase();
  const buyerState = ((buyerBlock.match(/State\s*Name\s*:\s*([A-Za-z &]+?)\s*,\s*Code/i) || [])[1] || '').trim();
  // tax + total lines of the invoice table: "IGST\n93,960.00", "Total\n6,15,960.00"
  const inv = text.split(/Amount\s*Chargeable/i)[0] || text;
  const taxOf = k => { let s = 0; const re = new RegExp(`(?:^|[\\r\\n])\\s*${k}\\s*[\\r\\n]+\\s*([\\d,]+\\.\\d{2})`, 'gi'); let m; while ((m = re.exec(inv))) s += money(m[1]); return s; };
  const igst = taxOf('IGST'), cgst = taxOf('CGST'), sgst = taxOf('SGST');
  const totM = [...inv.matchAll(/(?:^|[\r\n])\s*Total\s*[\r\n]+\s*([\d,]+\.\d{2})/gi)];
  const grandTotal = totM.length ? money(totM[totM.length - 1][1]) : 0;
  // product lines: "<description><amount><unit><rate><qty> <unit><hsn>"
  const items = [];
  const lineRe = /^(.+?)(\d{1,3}(?:,\d{2,3})*\.\d{2})([A-Za-z]{1,8})(\d{1,3}(?:,\d{2,3})*\.\d{2})(\d+(?:\.\d+)?)\s*([A-Za-z]{1,8})\s*(\d{4,8})\s*$/gm;
  let m;
  while ((m = lineRe.exec(inv))) items.push({ description: m[1].trim(), amount: money(m[2]), rate: money(m[4]), qty: parseFloat(m[5]) || 0, unit: m[6], hsn: m[7] });
  const gst = Math.round((igst + cgst + sgst) * 100) / 100;

  // e-Way Bill page → "2. Address Details": From / Dispatch From / To / Ship To blocks
  const flat = s => String(s || '').split(/[\r\n]+/).map(x => x.trim()).filter(Boolean).join(' ').replace(/\s+,/g, ',').replace(/,{2,}/g, ',').replace(/\s{2,}/g, ' ').trim();
  const addr = (text.match(/2\.\s*Address\s*Details([\s\S]*?)(?:3\.\s*Goods\s*Details|$)/i) || [])[1] || '';
  const block = (from, to) => { const m = addr.match(new RegExp(`(?:^|[\\r\\n])\\s*${from}\\s*[\\r\\n]+([\\s\\S]*?)(?=[\\r\\n]\\s*(?:${to})\\s*[\\r\\n]|$)`, 'i')); return m ? m[1] : ''; };
  const party = s => {   // "name / GSTIN : X / state"
    const lines = String(s || '').split(/[\r\n]+/).map(x => x.trim()).filter(Boolean);
    const gi = lines.findIndex(l => /^GSTIN/i.test(l));
    return {
      name: flat((gi >= 0 ? lines.slice(0, gi) : lines.slice(0, 1)).join('\n')),
      gstin: gi >= 0 ? ((lines[gi].match(/([0-9]{2}[A-Z0-9]{13})/i) || [])[1] || '').toUpperCase() : '',
      state: gi >= 0 ? flat(lines.slice(gi + 1).join('\n')) : '',
    };
  };
  const ewFrom = party(block('From', 'Dispatch\\s*From|To')), ewTo = party(block('To', 'Ship\\s*To'));
  const ewDispatch = flat(block('Dispatch\\s*From', 'To')), ewShipTo = flat(block('Ship\\s*To', '\\d\\.'));
  // "4. Transportation Details" / "5. Vehicle Details" (blank labels run together: "Transporter ID:Doc No.:")
  const trans = (text.match(/4\.\s*Transportation\s*Details([\s\S]*?)(?:5\.\s*Vehicle|$)/i) || [])[1] || '';
  const veh = (text.match(/5\.\s*Vehicle\s*Details([\s\S]*)$/i) || [])[1] || '';
  const after = (src, label, stop) => { const m = src.match(new RegExp(`${label}\\s*:?\\s*([\\s\\S]*?)\\s*(?:${stop})`, 'i')); return m ? flat(m[1]) : ''; };
  const transporterId = ((trans.match(/Transporter\s*ID\s*:?\s*([0-9]{2}[A-Z0-9]{13})/i) || [])[1] || '').toUpperCase();
  const transporterName = after(trans, '\\bName', 'Date\\s*:|$');
  const vehicleFromCity = after(veh, '\\bFrom', 'CEWB|$');
  const sameLine = (src, label) => { const m = src.match(new RegExp(`${label}[ \\t]*:?[ \\t]*([^\\r\\n]*)`, 'i')); return m ? m[1].trim() : ''; };
  const transDocNo = sameLine(trans, 'Doc\\s*No\\.?');
  const transDocDate = sameLine(trans, '\\bDate');
  const cewbNo = (veh.match(/CEWB\s*No\.?\s*:?\s*([0-9]{6,})/i) || [])[1] || '';
  const ewayGeneratedBy = ((text.match(/Generated\s*By\s*:?\s*[\s\S]{0,40}?([0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][A-Z0-9]{3})/i) || [])[1] || '').toUpperCase();

  return {
    ...(ewDispatch ? { dispatchFrom: ewDispatch } : {}),
    ewayFromName: ewFrom.name, ewayFromGstin: ewFrom.gstin, ewayFromState: ewFrom.state,
    ewayToName: ewTo.name, ewayToGstin: ewTo.gstin, ewayToState: ewTo.state, ewayShipTo: ewShipTo,
    ewayGeneratedBy, transporterId, transporterName, transDocNo, transDocDate, vehicleFromCity, cewbNo,
    buyerOrderNo, buyerOrderDate, buyerGstin, buyerState,
    pdfIgst: igst, pdfCgst: cgst, pdfSgst: sgst, pdfGst: gst,
    pdfTotal: grandTotal, pdfTaxable: grandTotal ? Math.round((grandTotal - gst) * 100) / 100 : 0,
    pdfItems: items,
  };
}

// POST /api/bills/parse-pdf — extract e-invoice fields from a PDF (not stored)
router.post('/parse-pdf', memUpload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const pdfParse = require('pdf-parse');
    // Suppress noisy cMap/hex-string warnings from the underlying pdf.js engine
    const _warn = console.warn; console.warn = () => {};
    let text;
    try { ({ text } = await pdfParse(req.file.buffer, { verbosity: -1 })); }
    finally { console.warn = _warn; }

    const find = (re) => { const m = text.match(re); return m ? m[1].trim() : ''; };

    // IRN: 64-char hex. PDFs frequently hyphenate it across a line-wrap
    // ("...e209f-\n115445...") — capture any hyphen-continued segments too,
    // then strip the whitespace/hyphens back out so the saved IRN is whole.
    const irnRaw = find(/IRN\s*:?\s*([a-f0-9]{20,}(?:-\s*[a-f0-9]+)*)/i);
    const irnNo  = irnRaw.replace(/[\s-]+/g, '');
    // Ack No: 12+ digit number after "Ack No"
    const acknNo   = find(/Ack\s*No[.\s]*:?\s*([0-9]{10,})/i);
    // Ack Date
    const ackDateS = find(/Ack\s*Date\s*:?\s*(\d{1,2}-[A-Za-z]{3}-\d{2,4})/i);
    // Invoice No: pattern like ABC/XY/YY-YY/NNN
    // PDF may linearise two-column row as "EPS/TI/26-27/032642128237719" (invoice + e-way merged)
    // Strip trailing 12-digit e-way bill suffix if present, and save it for e-way extraction
    const invRaw   = find(/([A-Z]{2,10}\/[A-Z]{1,6}\/\d{2}-\d{2}\/\d+)/) || '';
    const billNo   = invRaw.replace(/\d{12}$/, '');
    const mergedEway = /\d{12}$/.test(invRaw) ? invRaw.slice(-12) : '';
    // e-Way Bill No: prefer label-based match, then merged suffix, then any standalone 12-digit number
    const eWayRaw  = find(/e[-\s]?[Ww]ay\s*[Bb]ill\s*No[.:\s]*(?:\n|\r\n?|\s)+([0-9]{12})/i)
                  || mergedEway
                  || find(/\b([0-9]{12})\b/);
    // e-Way Bill Details is a 3-column table ("e-Way Bill No | Mode |
    // Generated Date" then "Generated By | Approx Distance | Valid Upto").
    // Once pdf-parse linearises it, the 3rd column's value routinely lands
    // glued onto the 2nd column's value with no separator at all —
    // "Mode:\n1 - Road16-Jul-26 12:48 PM" (Mode's own value immediately
    // followed by Generated Date's value), and "Approx Distance:\n1171
    // KM22-Jul-26 11:59 PM" (distance immediately followed by Valid Upto).
    // The 3rd column's own label ("Generated Date:"/"Valid Upto:") then
    // shows up later in the stream with nothing after it. So the reliable
    // way to read the 3rd column is off the END of the 2nd column's own
    // match, not by searching near its own (now-empty) label.
    const modeGenMatch = text.match(/Mode\s*:\s*([\s\S]{1,30}?)(\d{1,2}[-\/][A-Za-z]{3}[-\/]\d{2,4}\s+\d{1,2}:\d{2}\s*(?:AM|PM)?)/i);
    const ewayMode = modeGenMatch ? modeGenMatch[1].trim() : find(/Mode\s*:\s*([A-Za-z0-9][A-Za-z0-9\s\-]{0,20}?)[\r\n]/i);
    const ewayGenDate = modeGenMatch ? modeGenMatch[2].trim()
      : find(/Generated\s*Date[\s\S]{0,15}?(\d{1,2}[-\/][A-Za-z]{3}[-\/]\d{2,4}(?:\s+\d{1,2}:\d{2}\s*(?:AM|PM)?)?)/i);

    const distValidMatch = text.match(/Approx\s*Distance\s*:?\s*(\d+)\s*KM(\d{1,2}[-\/][A-Za-z]{3}[-\/]\d{2,4}\s+\d{1,2}:\d{2}\s*(?:AM|PM)?)/i);
    const approxDistanceKm = distValidMatch ? distValidMatch[1]
      : find(/Approx(?:imate)?\s*Distance[\s\S]{0,15}?(\d+)\s*KM/i);
    const ewayValidUpto = distValidMatch ? distValidMatch[2].trim()
      : find(/Valid\s*(?:Upto|Until|Up\s*to)[\s\S]{0,15}?(\d{1,2}[-\/][A-Za-z]{3}[-\/]\d{2,4}(?:\s+\d{1,2}:\d{2}\s*(?:AM|PM)?)?)/i);

    const supplyType     = find(/Supply\s*Type\s*:?\s*[\r\n]+\s*([^\r\n]{2,40})/i);
    const transactionType = find(/Transaction\s*Type\s*:?\s*[\r\n]+\s*([^\r\n]{2,60})/i);
    // Vehicle No — "Motor Vehicle No." (tax invoice) or "Vehicle No." (e-way bill), Indian reg-no format
    const vehicleNo     = find(/(?:Motor\s*)?Vehicle\s*No\.?[\s\S]{0,20}?([A-Z]{2}[\s-]?\d{1,2}[\s-]?[A-Z]{1,3}[\s-]?\d{1,4})\b/i);
    // Invoice date: first "Dated\n<date>" or "Date\s*:\s*<date>"
    const invDateS = find(/[Dd]ated\s*[\r\n]+\s*(\d{1,2}-[A-Za-z]{3}-\d{2,4})/)
                  || find(/Invoice\s*Date\s*:?\s*(\d{1,2}-[A-Za-z]{3}-\d{2,4})/i);

    // Buyer / Bill-To name: line immediately after "Buyer (Bill to)" heading
    const partyName = find(/Buyer\s*\(Bill\s*to\)\s*[\r\n]+\s*([^\r\n]{3,})/i)
                   || find(/Bill\s*to\s*[\r\n]+\s*([^\r\n]{3,})/i);

    // Dispatch From — the e-way bill's physical dispatch address, which can
    // differ from the company's registered "From" address. Best-effort:
    // capture the line(s) right after the "Dispatch From" heading up to the
    // next section heading.
    const dispatchFrom = find(/Dispatch\s*From\s*[\r\n]+\s*([^\r\n]{3,}(?:[\r\n]+(?!Ship\s*To|To\b|\d\.\s)[^\r\n]{3,})*)/i);

    res.json({
      billNo:     billNo     || '',
      billDate:   parseBillDate(invDateS),
      ewayBillNo: eWayRaw    || '',
      irnNo:      irnNo      || '',
      acknNo:     acknNo     || '',
      acknDate:   parseBillDate(ackDateS),
      ewayValidUpto: ewayValidUpto || '',
      ewayGenDate: ewayGenDate || '',
      approxDistanceKm: approxDistanceKm || '',
      ewayMode: ewayMode || '',
      supplyType: supplyType || '',
      transactionType: transactionType || '',
      vehicleNo:  vehicleNo   || '',
      dispatchFrom: dispatchFrom ? dispatchFrom.replace(/\s*[\r\n]+\s*/g, ', ').trim() : '',
      partyName:  partyName  || '',
      ...parseInvoiceExtra(text),
      ...(await extractQrs(req.file.buffer)),   // e-invoice + e-way bill QR images
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

const billDir = (companyId, type) =>
  path.join(ROOT, 'Database', 'Companies', companyId,
    type === 'purchase' ? 'PurchaseBills' : 'SalesBills');

const readAll = (dir) => require('./sqlite').listAnyByDirOrdered(dir);

// GET all bills (type=sales|purchase)
router.get('/', (req, res) => {
  try {
    const type = req.query.type || 'sales';
    const dir  = billDir(cid(req), type);
    res.json(readAll(dir));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST create bill
router.post('/', (req, res) => {
  try {
    const companyId = cid(req);
    const type = req.body.type || 'sales';
    const dir  = billDir(companyId, type);

    const prefix   = type === 'purchase' ? 'PB' : 'SB';
    // Derive the next id from disk, not the read index — the index lags a write
    // by the watcher debounce, and a stale max here would overwrite a bill.
    const existingNums = fs.existsSync(dir)
      ? fs.readdirSync(dir).map(n => parseInt(n.replace(/\D/g, ''), 10) || 0)
      : [];
    const lastNum = existingNums.length ? Math.max(...existingNums) : 0;
    const billId = `${prefix}${String(lastNum + 1).padStart(6, '0')}`;

    const bill = { ...req.body, billId, companyId, createdAt: new Date().toISOString(),
      audit: [auditEntry(req, 'created')] };
    if (type === 'purchase' && !bill.status) bill.status = 'draft';

    const bDir = path.join(dir, billId);
    fs.mkdirSync(bDir, { recursive: true });
    const bFile = path.join(bDir, `${billId}.json`);
    fs.writeFileSync(bFile, JSON.stringify(bill, null, 2));
    require('./sqlite').indexFile(bFile);

    if (type === 'sales' && bill.orderId) {
      const fmtAmt = n => Number(n || 0).toLocaleString('en-IN');
      addSystemLog(companyId, bill.orderId, 'System',
        `Sales Bill ${billId} (${bill.billNo || billId}) created for ₹${fmtAmt(bill.grandTotal || bill.amount)}`,
        bill.billDate);
    }

    if (bill.status === 'pending') {
      const submitter = resolveUser(req);
      const partyName = bill.customerName || bill.vendorName || bill.partyName || 'Party';
      notifyApprovers({
        companyId, module: type === 'purchase' ? 'purchasebill' : 'salesbill', recordId: billId,
        recordLabel: `${type === 'purchase' ? 'Purchase' : 'Sales'} Bill ${bill.billNo || billId} — ${partyName}`,
        message: `${type === 'purchase' ? 'Purchase' : 'Sales'} Bill ${bill.billNo || billId} (${partyName}) needs your approval`,
        link: type === 'purchase' ? '/purchase-bill' : '/sales-bill',
        createdBy: submitter?.name || submitter?.username || 'System',
        targetUserId: req.body.approverId || null,
      });
    }

    res.json(bill);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/bills/:billId/pdf-details — read the bill's attached invoice PDF again (QR codes, e-way /
// transport details) for printing older bills. Nothing is saved.
router.get('/:billId/pdf-details', async (req, res) => {
  try {
    const type = req.query.type || 'sales';
    const bDir = path.join(billDir(cid(req), type), req.params.billId);
    const file = path.join(bDir, `${req.params.billId}.json`);
    if (!fs.existsSync(file)) return res.status(404).json({ error: 'Not found' });
    const bill = JSON.parse(fs.readFileSync(file, 'utf-8'));
    const att = (bill.attachments || []).find(a => /\.pdf$/i.test(a.fileName || ''));
    const pdfFile = att && findBillDoc(cid(req), type, req.params.billId, att.fileName);
    if (!pdfFile || !fs.existsSync(pdfFile)) return res.json({});
    const buf = fs.readFileSync(pdfFile);
    const pdfParse = require('pdf-parse');
    const _warn = console.warn; console.warn = () => {};
    let text = '';
    try { ({ text } = await pdfParse(buf, { verbosity: -1 })); } catch { text = ''; } finally { console.warn = _warn; }
    res.json({ ...(text ? parseInvoiceExtra(text) : {}), ...(await extractQrs(buf)) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET single bill
router.get('/:billId', (req, res) => {
  try {
    const type = req.query.type || 'sales';
    const dir  = billDir(cid(req), type);
    const file = path.join(dir, req.params.billId, `${req.params.billId}.json`);
    if (!fs.existsSync(file)) return res.status(404).json({ error: 'Not found' });
    res.json(JSON.parse(fs.readFileSync(file, 'utf-8')));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT update bill
router.put('/:billId', (req, res) => {
  try {
    const type = req.query.type || req.body.type || 'sales';
    const dir  = billDir(cid(req), type);
    const file = path.join(dir, req.params.billId, `${req.params.billId}.json`);
    if (!fs.existsSync(file)) return res.status(404).json({ error: 'Not found' });
    const existing = JSON.parse(fs.readFileSync(file, 'utf-8'));
    const newStatus = req.body.status || existing.status;
    const oldStatus = existing.status;
    const action = newStatus !== oldStatus
      ? ((newStatus === 'approved' || newStatus === 'posted') ? 'approved' : newStatus === 'rejected' ? 'rejected' : 'status_changed')
      : 'edited';
    const extra = newStatus !== oldStatus ? { from: oldStatus, to: newStatus } : {};
    const updated  = { ...existing, ...req.body, billId: req.params.billId, updatedAt: new Date().toISOString(),
      audit: pushAudit(existing, req, action, extra) };
    fs.writeFileSync(file, JSON.stringify(updated, null, 2));

    if (newStatus === 'pending' && oldStatus !== 'pending') {
      const submitter = resolveUser(req);
      const partyName = updated.customerName || updated.vendorName || updated.partyName || 'Party';
      notifyApprovers({
        companyId: cid(req), module: type === 'purchase' ? 'purchasebill' : 'salesbill', recordId: req.params.billId,
        recordLabel: `${type === 'purchase' ? 'Purchase' : 'Sales'} Bill ${updated.billNo || req.params.billId} — ${partyName}`,
        message: `${type === 'purchase' ? 'Purchase' : 'Sales'} Bill ${updated.billNo || req.params.billId} (${partyName}) needs your approval`,
        link: type === 'purchase' ? '/purchase-bill' : '/sales-bill',
        createdBy: submitter?.name || submitter?.username || 'System',
        targetUserId: req.body.approverId || null,
      });
    }

    res.json(updated);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE bill
router.delete('/:billId', (req, res) => {
  try {
    const type = req.query.type || 'sales';
    const dir  = billDir(cid(req), type);
    const file = path.join(dir, req.params.billId, `${req.params.billId}.json`);
    if (fs.existsSync(file)) fs.unlinkSync(file);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST upload attachment to a bill
router.post('/:billId/upload', billUpload.single('file'), (req, res) => {
  try {
    const companyId = cid(req);
    const type = req.query.type || 'sales';
    const dir  = billDir(companyId, type);
    const file = path.join(dir, req.params.billId, `${req.params.billId}.json`);
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const attachment = { name: req.file.originalname, fileName: req.file.filename, fileType: path.extname(req.file.originalname).slice(1).toLowerCase() };
    if (fs.existsSync(file)) {
      const bill = JSON.parse(fs.readFileSync(file, 'utf-8'));
      bill.attachments = [...(bill.attachments || []), attachment];
      bill.updatedAt = new Date().toISOString();
      fs.writeFileSync(file, JSON.stringify(bill, null, 2));
      res.json(bill);
    } else {
      res.status(404).json({ error: 'Bill not found' });
    }
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET view/download attachment
router.get('/:billId/download/:fileName', (req, res) => {
  try {
    const companyId = cid(req);
    const type = req.query.type || 'sales';
    const filePath = findBillDoc(companyId, type, req.params.billId, path.basename(req.params.fileName));
    if (!filePath) return res.status(404).json({ error: 'File not found' });
    const ext  = path.extname(req.params.fileName).slice(1).toLowerCase();
    const mime = { pdf:'application/pdf', jpg:'image/jpeg', jpeg:'image/jpeg', png:'image/png', gif:'image/gif' }[ext] || 'application/octet-stream';
    res.setHeader('Content-Type', mime);
    // inline = view in browser; download = force save
    const disposition = req.query.dl === '1' ? 'attachment' : 'inline';
    res.setHeader('Content-Disposition', `${disposition}; filename="${req.params.fileName}"`);
    fs.createReadStream(filePath).pipe(res);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
