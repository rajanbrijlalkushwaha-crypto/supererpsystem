const express = require('express');
const path    = require('path');
const fs      = require('fs');
const multer  = require('multer');
const { ROOT } = require('./helpers');

const router = express.Router();

const cid = req => req.query.companyId || req.body?.companyId;

/* Store logs inside the SalesOrder folder so they live alongside the order data */
const soDir    = (companyId, orderId) =>
  path.join(ROOT, 'Database', 'Companies', companyId, 'SalesOrder', String(orderId));
const logsFile = (companyId, orderId) =>
  path.join(soDir(companyId, orderId), 'communication-logs.json');
const docsDir  = (companyId, orderId) =>
  path.join(soDir(companyId, orderId), 'comm-docs');

const readLogs = (companyId, orderId) => {
  const f = logsFile(companyId, orderId);
  if (!fs.existsSync(f)) return [];
  try { return JSON.parse(fs.readFileSync(f, 'utf-8')); } catch { return []; }
};

const writeLogs = (companyId, orderId, logs) => {
  const dir = soDir(companyId, orderId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(logsFile(companyId, orderId), JSON.stringify(logs, null, 2));
};

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const dir = docsDir(cid(req) || '', req.params.orderId || '');
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
  }),
});

// POST backfill — scan existing bills/DCs/SOs and add missing system logs
router.post('/backfill', (req, res) => {
  const companyId = cid(req);
  if (!companyId) return res.status(400).json({ error: 'companyId required' });

  let added = 0;

  const addIfMissing = (orderId, entry) => {
    if (!orderId) return;
    const logs = readLogs(companyId, orderId);
    const already = logs.some(l => l.isSystem && l.referenceNo && l.referenceNo === entry.referenceNo);
    if (already) return;
    logs.push({ ...entry, id: Date.now() + added, createdAt: entry.createdAt || new Date().toISOString(), isSystem: true });
    writeLogs(companyId, orderId, logs);
    added++;
  };

  // ── Sales Orders (Order Received) ──
  try {
    const soBase = path.join(ROOT, 'Database', 'Companies', companyId, 'SalesOrder');
    if (fs.existsSync(soBase)) {
      fs.readdirSync(soBase).forEach(folder => {
        try {
          const f = path.join(soBase, folder, `${folder}.json`);
          if (!fs.existsSync(f)) return;
          const so = JSON.parse(fs.readFileSync(f, 'utf-8'));
          addIfMissing(so.orderId || folder, {
            date:        so.orderDate || so.createdAt?.slice(0,10) || new Date().toISOString().slice(0,10),
            stage:       'Order Received',
            type:        'Order Received',
            description: `Order received — SO #${so.orderId || folder}${so.orderNo ? ` (${so.orderNo})` : ''} from ${so.customerName || 'Customer'}${so.grandTotal ? ` for ₹${so.grandTotal}` : ''}`,
            details:     `Order received — SO #${so.orderId || folder}`,
            department:  'Sales',
            referenceNo: String(so.orderId || folder),
            by: 'System', referredBy: '', status: 'Completed', remarks: '',
            createdBy: 'System', attachments: [],
            createdAt: so.createdAt || new Date().toISOString(),
          });
        } catch {}
      });
    }
  } catch {}

  // ── Sales Bills ──
  try {
    const billsBase = path.join(ROOT, 'Database', 'Companies', companyId, 'SalesBills');
    if (fs.existsSync(billsBase)) {
      fs.readdirSync(billsBase).forEach(folder => {
        try {
          const f = path.join(billsBase, folder, `${folder}.json`);
          if (!fs.existsSync(f)) return;
          const bill = JSON.parse(fs.readFileSync(f, 'utf-8'));
          if (!bill.orderId) return;
          addIfMissing(bill.orderId, {
            date:        bill.billDate || bill.createdAt?.slice(0,10) || new Date().toISOString().slice(0,10),
            stage:       'Sales Bill Created',
            type:        'Sales Bill Created',
            description: `Sales Bill ${bill.billNo || bill.billId} created for amount ₹${bill.grandTotal || 0}`,
            details:     `Sales Bill ${bill.billNo || bill.billId} created`,
            department:  'Accounts',
            referenceNo: bill.billNo || bill.billId || folder,
            by: 'System', referredBy: '', status: 'Completed', remarks: '',
            createdBy: 'System', attachments: [],
            createdAt: bill.createdAt || new Date().toISOString(),
          });
        } catch {}
      });
    }
  } catch {}

  // ── Delivery Challans ──
  try {
    const dcBase = path.join(ROOT, 'Database', 'Companies', companyId, 'DeliveryChallans');
    if (fs.existsSync(dcBase)) {
      fs.readdirSync(dcBase).forEach(folder => {
        try {
          const f = path.join(dcBase, folder, `${folder}.json`);
          if (!fs.existsSync(f)) return;
          const dc = JSON.parse(fs.readFileSync(f, 'utf-8'));
          const soId = dc.linkedSalesOrderId || dc.orderId;
          if (!soId) return;
          addIfMissing(soId, {
            date:        dc.date || dc.createdAt?.slice(0,10) || new Date().toISOString().slice(0,10),
            stage:       'Material Dispatched',
            type:        'Material Dispatched',
            description: `Material dispatched — Delivery Challan ${dc.dcNo || dc.challanNo || folder} issued`,
            details:     `DC ${dc.dcNo || dc.challanNo || folder}`,
            department:  'Stores',
            referenceNo: dc.dcNo || dc.challanNo || folder,
            by: 'System', referredBy: '', status: 'Completed', remarks: '',
            createdBy: 'System', attachments: [],
            createdAt: dc.createdAt || new Date().toISOString(),
          });
        } catch {}
      });
    }
  } catch {}

  // ── Receipts / Payments linked to SOs ──
  let fixed = 0;
  try {
    const payDir = path.join(ROOT, 'Database', 'Companies', companyId, 'Payments');
    if (fs.existsSync(payDir)) {
      const payments = fs.readdirSync(payDir)
        .map(f => { try { return JSON.parse(fs.readFileSync(path.join(payDir, f), 'utf-8')); } catch { return null; } })
        .filter(Boolean);

      // Build lookup: amount+orderId → actual date
      const payByAmt = {};
      payments.forEach(p => {
        if (!p.orderId || !p.date) return;
        const key = `${p.orderId}:${p.amount}`;
        payByAmt[key] = p.date;
      });

      // Fix existing receipt system-logs that ended up with today's (wrong) date
      const soBase = path.join(ROOT, 'Database', 'Companies', companyId, 'SalesOrder');
      if (fs.existsSync(soBase)) {
        fs.readdirSync(soBase).forEach(folder => {
          try {
            const logF = path.join(soBase, folder, 'communication-logs.json');
            if (!fs.existsSync(logF)) return;
            const logs = JSON.parse(fs.readFileSync(logF, 'utf-8'));
            let dirty = false;
            logs.forEach(l => {
              if (!l.isSystem) return;
              if (l.date !== l.createdAt?.slice(0, 10)) return; // already has distinct date — skip
              // Try to fix receipt logs
              const amtMatch = (l.description || '').match(/₹([\d,]+)/);
              if (amtMatch && (l.description||'').includes('Receipt')) {
                const amt = amtMatch[1].replace(/,/g, '');
                const key = `${folder}:${amt}`;
                if (payByAmt[key]) { l.date = payByAmt[key]; dirty = true; fixed++; }
              }
            });
            if (dirty) fs.writeFileSync(logF, JSON.stringify(logs, null, 2));
          } catch {}
        });
      }
    }
  } catch {}

  // ── Fix bill logs that have wrong date (date === createdAt) ──
  try {
    const billsBase = path.join(ROOT, 'Database', 'Companies', companyId, 'SalesBills');
    if (fs.existsSync(billsBase)) {
      const soBase = path.join(ROOT, 'Database', 'Companies', companyId, 'SalesOrder');

      fs.readdirSync(billsBase).forEach(folder => {
        try {
          const bf = path.join(billsBase, folder, `${folder}.json`);
          if (!fs.existsSync(bf)) return;
          const bill = JSON.parse(fs.readFileSync(bf, 'utf-8'));
          if (!bill.orderId || !bill.billDate) return;

          const logF = path.join(soBase, String(bill.orderId), 'communication-logs.json');
          if (!fs.existsSync(logF)) return;
          const logs = JSON.parse(fs.readFileSync(logF, 'utf-8'));
          let dirty = false;
          logs.forEach(l => {
            if (!l.isSystem) return;
            if (l.date !== l.createdAt?.slice(0, 10)) return;
            const refNo = bill.billNo || bill.billId || folder;
            if ((l.description||'').includes(refNo) || (l.referenceNo||'') === refNo) {
              l.date = bill.billDate; dirty = true; fixed++;
            }
          });
          if (dirty) fs.writeFileSync(logF, JSON.stringify(logs, null, 2));
        } catch {}
      });
    }
  } catch {}

  res.json({ success: true, added, fixed, message: `Backfill complete — ${added} entries added, ${fixed} dates corrected` });
});

// GET logs for one order
router.get('/:orderId', (req, res) => {
  try {
    res.json(readLogs(cid(req), req.params.orderId));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST manual log entry
router.post('/:orderId', upload.array('attachments', 10), (req, res) => {
  try {
    const companyId = cid(req);
    const { orderId } = req.params;
    const logs = readLogs(companyId, orderId);

    const entry = {
      id:          Date.now(),
      date:        req.body.date        || new Date().toISOString().slice(0, 10),
      stage:       req.body.stage       || req.body.type || '',
      type:        req.body.stage       || req.body.type || '',
      description: req.body.description || req.body.details || '',
      details:     req.body.description || req.body.details || '',
      department:  req.body.department  || '',
      referenceNo: req.body.referenceNo || '',
      by:          req.body.by          || req.body.referredBy || req.body.createdBy || '',
      referredBy:  req.body.by          || req.body.referredBy || '',
      status:      req.body.status      || 'Completed',
      remarks:     req.body.remarks     || '',
      createdBy:   req.body.createdBy   || '',
      attachments: (req.files || []).map(f => ({ name: f.originalname, file: f.filename, size: f.size })),
      createdAt:   new Date().toISOString(),
      isSystem:    false,
    };

    logs.push(entry);
    writeLogs(companyId, orderId, logs);
    res.json(entry);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET download attachment
router.get('/:orderId/docs/:filename', (req, res) => {
  try {
    const filePath = path.join(docsDir(cid(req), req.params.orderId), req.params.filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });
    res.download(filePath);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Internal helper — called from bills.js / deliveryChallans.js / salesOrders.js
// `txDate` is the actual transaction date (YYYY-MM-DD); falls back to today if omitted.
const addSystemLog = (companyId, orderId, type, details, txDate) => {
  if (!companyId || !orderId) return;
  try {
    const logs = readLogs(companyId, orderId);
    logs.push({
      id:          Date.now(),
      date:        txDate || new Date().toISOString().slice(0, 10),
      stage:       type,
      type,
      description: details,
      details,
      department:  '',
      referenceNo: '',
      by:          'System',
      referredBy:  '',
      status:      'Completed',
      remarks:     '',
      createdBy:   'System',
      attachments: [],
      createdAt:   new Date().toISOString(),
      isSystem:    true,
    });
    writeLogs(companyId, orderId, logs);
  } catch {}
};

module.exports = { router, addSystemLog };
