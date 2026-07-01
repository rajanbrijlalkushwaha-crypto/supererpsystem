const express = require('express');
const path    = require('path');
const fs      = require('fs');
const multer  = require('multer');
const { ROOT, auditEntry, pushAudit } = require('./helpers');
const { addSystemLog } = require('./communication');

const router = express.Router();

/* ── multer: store files in SalesBills/<billId>/docs/ ── */
const billUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const dir = path.join(ROOT, 'Database', 'Companies',
        req.query.companyId || req.body.companyId || '',
        'SalesBills', req.params.billId, 'docs');
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
  }),
});

const cid = req => req.query.companyId || req.body?.companyId;

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

    // IRN: 64-char hex
    const irnNo    = find(/IRN\s*:?\s*([a-f0-9]{32,})/i);
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
    // Invoice date: first "Dated\n<date>" or "Date\s*:\s*<date>"
    const invDateS = find(/[Dd]ated\s*[\r\n]+\s*(\d{1,2}-[A-Za-z]{3}-\d{2,4})/)
                  || find(/Invoice\s*Date\s*:?\s*(\d{1,2}-[A-Za-z]{3}-\d{2,4})/i);

    // Buyer / Bill-To name: line immediately after "Buyer (Bill to)" heading
    const partyName = find(/Buyer\s*\(Bill\s*to\)\s*[\r\n]+\s*([^\r\n]{3,})/i)
                   || find(/Bill\s*to\s*[\r\n]+\s*([^\r\n]{3,})/i);

    res.json({
      billNo:     billNo     || '',
      billDate:   parseBillDate(invDateS),
      ewayBillNo: eWayRaw    || '',
      irnNo:      irnNo      || '',
      acknNo:     acknNo     || '',
      acknDate:   parseBillDate(ackDateS),
      partyName:  partyName  || '',
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

const billDir = (companyId, type) =>
  path.join(ROOT, 'Database', 'Companies', companyId,
    type === 'purchase' ? 'PurchaseBills' : 'SalesBills');

const readAll = (dir) => {
  if (!fs.existsSync(dir)) return [];
  const results = [];
  fs.readdirSync(dir).forEach(entry => {
    const full = path.join(dir, entry);
    try {
      const stat = fs.statSync(full);
      if (stat.isDirectory()) {
        fs.readdirSync(full).filter(f => f.endsWith('.json')).forEach(f => {
          try { results.push(JSON.parse(fs.readFileSync(path.join(full, f), 'utf-8'))); } catch {}
        });
      } else if (entry.endsWith('.json')) {
        try { results.push(JSON.parse(fs.readFileSync(full, 'utf-8'))); } catch {}
      }
    } catch {}
  });
  return results;
};

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

    const existing = readAll(dir);
    const prefix   = type === 'purchase' ? 'PB' : 'SB';
    const lastNum  = existing.length > 0
      ? Math.max(...existing.map(b => parseInt((b.billId || '').replace(/\D/g, '')) || 0))
      : 0;
    const billId = `${prefix}${String(lastNum + 1).padStart(6, '0')}`;

    const bill = { ...req.body, billId, companyId, createdAt: new Date().toISOString(),
      audit: [auditEntry(req, 'created')] };

    const bDir = path.join(dir, billId);
    fs.mkdirSync(bDir, { recursive: true });
    fs.writeFileSync(path.join(bDir, `${billId}.json`), JSON.stringify(bill, null, 2));

    if (type === 'sales' && bill.orderId) {
      const fmtAmt = n => Number(n || 0).toLocaleString('en-IN');
      addSystemLog(companyId, bill.orderId, 'System',
        `Sales Bill ${billId} (${bill.billNo || billId}) created for ₹${fmtAmt(bill.grandTotal || bill.amount)}`,
        bill.billDate);
    }

    res.json(bill);
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
      ? (newStatus === 'approved' ? 'approved' : newStatus === 'rejected' ? 'rejected' : 'status_changed')
      : 'edited';
    const extra = newStatus !== oldStatus ? { from: oldStatus, to: newStatus } : {};
    const updated  = { ...existing, ...req.body, billId: req.params.billId, updatedAt: new Date().toISOString(),
      audit: pushAudit(existing, req, action, extra) };
    fs.writeFileSync(file, JSON.stringify(updated, null, 2));
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
    const folder = type === 'purchase' ? 'PurchaseBills' : 'SalesBills';
    const filePath = path.join(ROOT, 'Database', 'Companies', companyId, folder, req.params.billId, 'docs', req.params.fileName);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });
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
