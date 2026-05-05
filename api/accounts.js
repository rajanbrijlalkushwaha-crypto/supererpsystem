/**
 * accounts.js — JSON-only storage for Banks, Payments, Journals, Dues, Expenses, Assets
 * All data stored in: Database/Companies/{companyId}/{Module}/
 * Bank accounts: Database/Accounts/Banks/ (global, not per-company)
 */
const express = require('express');
const path    = require('path');
const fs      = require('fs');
const { ROOT, saveJson } = require('./helpers');

const router = express.Router();

/* ── path helpers ── */
// Banks are per-company: Database/Companies/{cid}/Accounts/Banks/
const banksDir   = (cid)        => path.join(ROOT, 'Database', 'Companies', cid, 'Accounts', 'Banks');
const bankFile   = (cid, id)    => path.join(banksDir(cid), `${id}.json`);


const coDir      = (cid, mod)   => path.join(ROOT, 'Database', 'Companies', cid, mod);
const coFile     = (cid, mod, id) => path.join(coDir(cid, mod), `${id}.json`);

/* ── helpers ── */
const readAll = (dir) => {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.json'))
    .map(f => { try { return JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8')); } catch { return null; } })
    .filter(Boolean);
};

const nextId = (dir, base) => {
  if (!fs.existsSync(dir)) return base;
  let max = base - 1;
  fs.readdirSync(dir).forEach(f => {
    const n = parseInt(f, 10);
    if (!isNaN(n) && n > max) max = n;
  });
  return max + 1;
};

const cid = (req) => req.query.companyId || req.body?.companyId || '';

const ensureDir = (d) => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); };

/* ════════════════════════════════════════════════════════
   BANK ACCOUNTS  — per company
   Path: Database/Companies/{companyId}/Accounts/Banks/{bankId}.json
   Each company has completely separate bank accounts.
════════════════════════════════════════════════════════ */

router.get('/banks', (req, res) => {
  try {
    const companyId = req.query.companyId || cid(req);
    if (!companyId) return res.status(400).json({ error: 'companyId required' });

    const records = readAll(banksDir(companyId)).sort((a, b) => (b.bankId || 0) - (a.bankId || 0));

    // Compute live balance from company's confirmed payments/receipts
    const payments = readAll(coDir(companyId, 'Payments'));
    const result = records.map(bank => {
      const confirmed = payments.filter(p => String(p.bankId) === String(bank.bankId) && p.status === 'confirmed');
      const totalIn  = confirmed.filter(p => p.type === 'receipt').reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
      const totalOut = confirmed.filter(p => p.type === 'payment').reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
      const currentBalance = (parseFloat(bank.openingBalance) || 0) + totalIn - totalOut;
      return { ...bank, currentBalance };
    });
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/banks', (req, res) => {
  try {
    const companyId = cid(req);
    if (!companyId) return res.status(400).json({ error: 'companyId required' });
    const { bankName, accountHolder, accountNumber, ifscCode, accountType = 'Current',
            openingBalance = 0, notes, status = 'active' } = req.body;
    if (!bankName || !accountNumber)
      return res.status(400).json({ error: 'Bank name and account number are required.' });

    const dir = banksDir(companyId);
    ensureDir(dir);
    const bankId = nextId(dir, 700001);
    const ob = parseFloat(openingBalance) || 0;
    const now = new Date().toISOString();
    const rec = { bankId, companyId, bankName, accountHolder, accountNumber, ifscCode, accountType,
                  openingBalance: ob, currentBalance: ob, notes, status, createdAt: now, updatedAt: now };
    saveJson(bankFile(companyId, bankId), rec);
    res.json({ success: true, bankId, message: `Bank account created with ID: ${bankId}` });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/banks/:id', (req, res) => {
  try {
    const companyId = cid(req);
    if (!companyId) return res.status(400).json({ error: 'companyId required' });
    const fp = bankFile(companyId, req.params.id);
    if (!fs.existsSync(fp)) return res.status(404).json({ error: 'Bank account not found' });
    const existing = JSON.parse(fs.readFileSync(fp, 'utf-8'));
    const updated = { ...existing, ...req.body, bankId: existing.bankId, companyId, updatedAt: new Date().toISOString() };
    saveJson(fp, updated);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/banks/:id', (req, res) => {
  try {
    const companyId = cid(req);
    if (!companyId) return res.status(400).json({ error: 'companyId required' });
    const fp = bankFile(companyId, req.params.id);
    if (!fs.existsSync(fp)) return res.status(404).json({ error: 'Bank account not found' });
    fs.unlinkSync(fp);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ════════════════════════════════════════════════════════
   PAYMENTS & RECEIPTS  — per company
════════════════════════════════════════════════════════ */
router.get('/payments', (req, res) => {
  try {
    const companyId = cid(req);
    const dir = coDir(companyId, 'Payments');
    const records = readAll(dir).sort((a, b) => (b.paymentId || 0) - (a.paymentId || 0));
    res.json(records);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/payments', (req, res) => {
  try {
    const companyId = cid(req);
    if (!companyId) return res.status(400).json({ error: 'companyId required' });
    const dir = coDir(companyId, 'Payments');
    ensureDir(dir);
    const paymentId = nextId(dir, 800001);
    const now = new Date().toISOString();
    const rec = { paymentId, ...req.body, companyId, status: req.body.status || 'pending', createdAt: now, updatedAt: now };
    saveJson(coFile(companyId, 'Payments', paymentId), rec);
    res.json({ success: true, paymentId, message: `Payment recorded with ID: ${paymentId}` });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/payments/:id', (req, res) => {
  try {
    const companyId = cid(req);
    const fp = coFile(companyId, 'Payments', req.params.id);
    if (!fs.existsSync(fp)) return res.status(404).json({ error: 'Not found' });
    const existing = JSON.parse(fs.readFileSync(fp, 'utf-8'));
    const updated = { ...existing, ...req.body, paymentId: existing.paymentId, updatedAt: new Date().toISOString() };
    saveJson(fp, updated);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/payments/:id', (req, res) => {
  try {
    const fp = coFile(cid(req), 'Payments', req.params.id);
    if (!fs.existsSync(fp)) return res.status(404).json({ error: 'Not found' });
    res.json(JSON.parse(fs.readFileSync(fp, 'utf-8')));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/payments/:id', (req, res) => {
  try {
    const fp = coFile(cid(req), 'Payments', req.params.id);
    if (!fs.existsSync(fp)) return res.status(404).json({ error: 'Not found' });
    fs.unlinkSync(fp);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ════════════════════════════════════════════════════════
   JOURNALS  — per company
════════════════════════════════════════════════════════ */
router.get('/journals', (req, res) => {
  try {
    const companyId = cid(req);
    const dir = coDir(companyId, 'Journals');
    const records = readAll(dir).sort((a, b) => (b.journalId || 0) - (a.journalId || 0));
    res.json(records);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/journals', (req, res) => {
  try {
    const companyId = cid(req);
    if (!companyId) return res.status(400).json({ error: 'companyId required' });
    const dir = coDir(companyId, 'Journals');
    ensureDir(dir);
    const journalId = nextId(dir, 900001);
    const now = new Date().toISOString();
    const rec = { journalId, ...req.body, companyId, createdAt: now, updatedAt: now };
    saveJson(coFile(companyId, 'Journals', journalId), rec);
    res.json({ success: true, journalId, message: `Journal created with ID: ${journalId}` });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/journals/:id', (req, res) => {
  try {
    const fp = coFile(cid(req), 'Journals', req.params.id);
    if (!fs.existsSync(fp)) return res.status(404).json({ error: 'Not found' });
    res.json(JSON.parse(fs.readFileSync(fp, 'utf-8')));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/journals/:id', (req, res) => {
  try {
    const fp = coFile(cid(req), 'Journals', req.params.id);
    if (!fs.existsSync(fp)) return res.status(404).json({ error: 'Not found' });
    fs.unlinkSync(fp);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ════════════════════════════════════════════════════════
   DUES — compute outstanding from Sales/Purchase Orders + Payments
════════════════════════════════════════════════════════ */
router.get('/dues', (req, res) => {
  try {
    const companyId = cid(req);

    // Helper: read all JSON records from a directory — handles BOTH:
    //   1. Flat files: dir/EPROP_SO_25_26_001.json  (Tally-imported)
    //   2. Subdirs:    dir/400001/400001.json         (app-created)
    const readAllRecords = (dir) => {
      if (!fs.existsSync(dir)) return [];
      const results = [];
      fs.readdirSync(dir).forEach(entry => {
        const full = path.join(dir, entry);
        try {
          const stat = fs.statSync(full);
          if (stat.isFile() && entry.endsWith('.json')) {
            const rec = JSON.parse(fs.readFileSync(full, 'utf-8'));
            if (rec) results.push(rec);
          } else if (stat.isDirectory()) {
            fs.readdirSync(full).filter(f => f.endsWith('.json')).forEach(f => {
              try { const rec = JSON.parse(fs.readFileSync(path.join(full, f), 'utf-8')); if (rec) results.push(rec); } catch {}
            });
          }
        } catch {}
      });
      return results;
    };

    const calcTotal = (items = []) =>
      items.reduce((s, it) => {
        const base = (parseFloat(it.qty || it.quantity) || 0) * (parseFloat(it.rate) || 0);
        const disc = it.discountType === '%' ? base * (parseFloat(it.discount) || 0) / 100 : (parseFloat(it.discount) || 0);
        const taxable = base - disc;
        return s + taxable + taxable * (parseFloat(it.gstPercent) || 0) / 100;
      }, 0);

    const salesOrders    = readAllRecords(coDir(companyId, 'SalesOrder'));
    const purchaseOrders = readAllRecords(coDir(companyId, 'PurchaseOrder'));
    const payments       = readAll(coDir(companyId, 'Payments'));

    // Client dues (receivable) — only app-created orders (not Tally imports) with non-zero value
    const clientDues = salesOrders
      .filter(o => !o.tallyImported && !['rejected', 'draft'].includes(o.status))
      .map(o => {
        const oid = o.orderId || o.id;
        const orderTotal = parseFloat(o.grandTotal || o.amount) || calcTotal(o.items);
        const linkedPayments = payments.filter(p =>
          p.type === 'receipt' && p.status !== 'rejected' &&
          (String(p.orderId) === String(oid) || String(p.orderId) === String(o.voucherNumber))
        );
        const received = linkedPayments.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
        return {
          orderId:    oid,
          orderNo:    o.orderNo || o.voucherNumber || o.soNo || `SO-${oid}`,
          orderDate:  o.orderDate || o.date || o.createdAt,
          clientId:   o.clientId,
          entityName: o.customerName || o.clientName || o.party || '—',
          status:     o.status || 'approved',
          orderTotal,
          received,
          linkedPayments,
          items:      o.items || [],
          due: orderTotal - received,
        };
      })
      .filter(r => r.orderTotal > 0);

    // Vendor dues (payable) — only app-created orders (not Tally imports) with non-zero value
    const vendorDues = purchaseOrders
      .filter(o => !o.tallyImported && !['rejected', 'draft'].includes(o.status))
      .map(o => {
        const oid = o.orderId || o.id;
        const orderTotal = parseFloat(o.grandTotal || o.amount) || calcTotal(o.items);
        const linkedPayments = payments.filter(p =>
          p.type === 'payment' && p.status !== 'rejected' &&
          (String(p.orderId) === String(oid) || String(p.orderId) === String(o.voucherNumber))
        );
        const paid = linkedPayments.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
        return {
          orderId:    oid,
          orderNo:    o.poNo || o.poNumber || o.voucherNumber || `PO-${oid}`,
          orderDate:  o.poDate || o.date || o.createdAt,
          vendorId:   o.vendorId,
          entityName: o.vendorName || o.party || '—',
          status:     o.status || 'approved',
          orderTotal,
          paid,
          linkedPayments,
          items:      o.items || [],
          due: orderTotal - paid,
        };
      })
      .filter(r => r.orderTotal > 0);

    res.json({ clientDues, vendorDues });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ════════════════════════════════════════════════════════
   STATEMENT — all payments + orders in one ledger view
════════════════════════════════════════════════════════ */
router.get('/statement', (req, res) => {
  try {
    const companyId = cid(req);

    const readAllRecords = (dir) => {
      if (!fs.existsSync(dir)) return [];
      const results = [];
      fs.readdirSync(dir).forEach(entry => {
        const full = path.join(dir, entry);
        try {
          const stat = fs.statSync(full);
          if (stat.isFile() && entry.endsWith('.json')) {
            const rec = JSON.parse(fs.readFileSync(full, 'utf-8')); if (rec) results.push(rec);
          } else if (stat.isDirectory()) {
            fs.readdirSync(full).filter(f => f.endsWith('.json')).forEach(f => {
              try { const rec = JSON.parse(fs.readFileSync(path.join(full, f), 'utf-8')); if (rec) results.push(rec); } catch {}
            });
          }
        } catch {}
      });
      return results;
    };

    const payments       = readAll(coDir(companyId, 'Payments'));
    const salesOrders    = readAllRecords(coDir(companyId, 'SalesOrder'));
    const purchaseOrders = readAllRecords(coDir(companyId, 'PurchaseOrder'));

    const entries = [
      ...salesOrders.map(o => ({
        id: o.orderId || o.id,
        type: 'sales-order',
        ref: o.orderNo || o.soNo || o.voucherNumber || `SO-${o.orderId}`,
        date: o.orderDate || o.date || o.createdAt || '',
        party: o.customerName || o.clientName || o.party || '—',
        description: `Sales Order`,
        amount: parseFloat(o.grandTotal) || 0,
        status: o.status || 'draft',
        direction: 'receivable',
      })),
      ...purchaseOrders.map(o => ({
        id: o.orderId || o.id,
        type: 'purchase-order',
        ref: o.poNo || o.poNumber || o.voucherNumber || `PO-${o.orderId}`,
        date: o.poDate || o.date || o.createdAt || '',
        party: o.vendorName || o.party || '—',
        description: `Purchase Order`,
        amount: parseFloat(o.grandTotal) || 0,
        status: o.status || 'draft',
        direction: 'payable',
      })),
      ...payments.filter(p => p.status !== 'rejected').map(p => ({
        id: p.paymentId,
        type: p.type || 'payment',
        ref: p.referenceNo || `PMT-${p.paymentId}`,
        date: p.date || p.createdAt || '',
        party: p.entityName || '—',
        description: `${p.type === 'receipt' ? 'Receipt' : 'Payment'} — ${p.paymentMode || ''}`,
        amount: parseFloat(p.amount) || 0,
        status: p.status || 'confirmed',
        direction: p.type === 'receipt' ? 'receivable' : 'payable',
        orderId: p.orderId,
      })),
    ];

    entries.sort((a, b) => new Date(b.date) - new Date(a.date));
    res.json(entries);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ════════════════════════════════════════════════════════
   EXPENSES  — per company
════════════════════════════════════════════════════════ */
router.get('/expenses', (req, res) => {
  try {
    const dir = coDir(cid(req), 'Expenses');
    res.json(readAll(dir).sort((a, b) => (b.expenseId || 0) - (a.expenseId || 0)));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/expenses', (req, res) => {
  try {
    const companyId = cid(req);
    if (!companyId) return res.status(400).json({ error: 'companyId required' });
    const dir = coDir(companyId, 'Expenses');
    ensureDir(dir);
    const expenseId = nextId(dir, 500001);
    const expItems = Array.isArray(req.body.items) ? req.body.items : [];
    let grandTotal = 0;
    if (expItems.length > 0) {
      expItems.forEach(it => {
        const base = (parseFloat(it.qty)||0) * (parseFloat(it.rate)||0);
        grandTotal += base + base * (parseFloat(it.gstPercent)||0) / 100;
      });
    } else {
      const am = parseFloat(req.body.amount)||0;
      grandTotal = am + am * (parseFloat(req.body.taxRate)||0) / 100;
    }
    grandTotal = parseFloat(grandTotal.toFixed(2));
    const now = new Date().toISOString();
    const rec = { expenseId, ...req.body, grandTotal, companyId, createdAt: now, updatedAt: now };
    saveJson(coFile(companyId, 'Expenses', expenseId), rec);
    res.json({ success: true, expenseId, message: `Expense created: ${expenseId}` });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/expenses/:id', (req, res) => {
  try {
    const fp = coFile(cid(req), 'Expenses', req.params.id);
    if (!fs.existsSync(fp)) return res.status(404).json({ error: 'Not found' });
    res.json(JSON.parse(fs.readFileSync(fp, 'utf-8')));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/expenses/:id', (req, res) => {
  try {
    const companyId = cid(req);
    const fp = coFile(companyId, 'Expenses', req.params.id);
    if (!fs.existsSync(fp)) return res.status(404).json({ error: 'Not found' });
    const existing = JSON.parse(fs.readFileSync(fp, 'utf-8'));
    const expItems = Array.isArray(req.body.items) ? req.body.items : (existing.items || []);
    let grandTotal = 0;
    if (expItems.length > 0) {
      expItems.forEach(it => {
        const base = (parseFloat(it.qty)||0) * (parseFloat(it.rate)||0);
        grandTotal += base + base * (parseFloat(it.gstPercent)||0) / 100;
      });
    } else {
      const am = parseFloat(req.body.amount || existing.amount)||0;
      grandTotal = am + am * (parseFloat(req.body.taxRate || existing.taxRate)||0) / 100;
    }
    grandTotal = parseFloat(grandTotal.toFixed(2));
    const rec = { ...existing, ...req.body, grandTotal, updatedAt: new Date().toISOString() };
    saveJson(fp, rec);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/expenses/:id', (req, res) => {
  try {
    const fp = coFile(cid(req), 'Expenses', req.params.id);
    if (!fs.existsSync(fp)) return res.status(404).json({ error: 'Not found' });
    fs.unlinkSync(fp);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ════════════════════════════════════════════════════════
   ASSETS  — per company
════════════════════════════════════════════════════════ */
router.get('/assets', (req, res) => {
  try {
    const dir = coDir(cid(req), 'Assets');
    res.json(readAll(dir).sort((a, b) => (b.assetId || 0) - (a.assetId || 0)));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/assets', (req, res) => {
  try {
    const companyId = cid(req);
    if (!companyId) return res.status(400).json({ error: 'companyId required' });
    const dir = coDir(companyId, 'Assets');
    ensureDir(dir);
    const assetId = nextId(dir, 600001);
    const now = new Date().toISOString();
    const { purchaseAmount = 0 } = req.body;
    const rec = { assetId, ...req.body, currentValue: parseFloat(purchaseAmount) || 0, companyId, createdAt: now, updatedAt: now };
    saveJson(coFile(companyId, 'Assets', assetId), rec);
    res.json({ success: true, assetId, message: `Asset created: ${assetId}` });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/assets/:id', (req, res) => {
  try {
    const fp = coFile(cid(req), 'Assets', req.params.id);
    if (!fs.existsSync(fp)) return res.status(404).json({ error: 'Not found' });
    res.json(JSON.parse(fs.readFileSync(fp, 'utf-8')));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/assets/:id', (req, res) => {
  try {
    const companyId = cid(req);
    const fp = coFile(companyId, 'Assets', req.params.id);
    if (!fs.existsSync(fp)) return res.status(404).json({ error: 'Not found' });
    const existing = JSON.parse(fs.readFileSync(fp, 'utf-8'));
    const rec = { ...existing, ...req.body, updatedAt: new Date().toISOString() };
    saveJson(fp, rec);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/assets/:id', (req, res) => {
  try {
    const fp = coFile(cid(req), 'Assets', req.params.id);
    if (!fs.existsSync(fp)) return res.status(404).json({ error: 'Not found' });
    fs.unlinkSync(fp);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
