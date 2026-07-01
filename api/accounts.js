/**
 * accounts.js — JSON-only storage for Banks, Payments, Journals, Dues, Expenses, Assets
 * All data stored in: Database/Companies/{companyId}/{Module}/
 * Bank accounts: Database/Accounts/Banks/ (global, not per-company)
 */
const express = require('express');
const path    = require('path');
const fs      = require('fs');
const { ROOT, saveJson, auditEntry, pushAudit } = require('./helpers');
const { addSystemLog } = require('./communication');

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
    const rec = { paymentId, ...req.body, companyId, status: req.body.status || 'pending', createdAt: now, updatedAt: now,
      audit: [auditEntry(req, 'created')] };
    saveJson(coFile(companyId, 'Payments', paymentId), rec);

    if (rec.type === 'receipt' && rec.orderId) {
      const fmtAmt = n => Number(n || 0).toLocaleString('en-IN');
      addSystemLog(companyId, rec.orderId, 'System',
        `Advance/Receipt received — ₹${fmtAmt(rec.amount)} via ${rec.paymentMode || 'cash'}` +
        (rec.reference || rec.referenceNo ? ` (Ref: ${rec.reference || rec.referenceNo})` : ''),
        rec.date);
    }

    res.json({ success: true, paymentId, message: `Payment recorded with ID: ${paymentId}` });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/payments/:id', (req, res) => {
  try {
    const companyId = cid(req);
    const fp = coFile(companyId, 'Payments', req.params.id);
    if (!fs.existsSync(fp)) return res.status(404).json({ error: 'Not found' });
    const existing = JSON.parse(fs.readFileSync(fp, 'utf-8'));
    const newStatus = req.body.status || existing.status;
    const oldStatus = existing.status;
    const action = newStatus !== oldStatus
      ? (newStatus === 'confirmed' ? 'approved' : newStatus === 'rejected' ? 'rejected' : 'status_changed')
      : 'edited';
    const extra = newStatus !== oldStatus ? { from: oldStatus, to: newStatus } : {};
    const updated = { ...existing, ...req.body, paymentId: existing.paymentId, updatedAt: new Date().toISOString(),
      audit: pushAudit(existing, req, action, extra) };
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
    const soMap = {};
    salesOrders.forEach(so => { soMap[String(so.orderId || so.id)] = so; });

    // Build credit-note → sales order map via linked bill
    const salesBillsList = readAllRecords(coDir(companyId, 'SalesBills'));
    const billToOrderMap = {};
    salesBillsList.forEach(b => { if (b.billId && b.orderId) billToOrderMap[String(b.billId)] = String(b.orderId); });
    const creditNotesList = readAll(coDir(companyId, 'CreditNotes')).filter(cn => cn.status !== 'cancelled');
    const cnByOrder = {};
    const cnRecsByOrder = {};
    creditNotesList.forEach(cn => {
      const oid = cn.linkedBillId ? billToOrderMap[String(cn.linkedBillId)] : null;
      if (!oid) return;
      cnByOrder[oid]    = (cnByOrder[oid] || 0) + (parseFloat(cn.grandTotal) || 0);
      if (!cnRecsByOrder[oid]) cnRecsByOrder[oid] = [];
      cnRecsByOrder[oid].push({ cnId: cn.cnId, cnNo: cn.cnNo, date: cn.date, amount: parseFloat(cn.grandTotal)||0 });
    });

    // Build debit-note → purchase order map via linked bill
    const purchBillsList = readAllRecords(coDir(companyId, 'PurchaseBills'));
    const pbillToOrderMap = {};
    purchBillsList.forEach(b => { if (b.billId && b.orderId) pbillToOrderMap[String(b.billId)] = String(b.orderId); });
    const debitNotesList = readAll(coDir(companyId, 'DebitNotes')).filter(dn => dn.status !== 'cancelled');
    const dnByOrder = {};
    const dnRecsByOrder = {};
    debitNotesList.forEach(dn => {
      const oid = dn.linkedBillId ? pbillToOrderMap[String(dn.linkedBillId)] : null;
      if (!oid) return;
      dnByOrder[oid]    = (dnByOrder[oid] || 0) + (parseFloat(dn.grandTotal) || 0);
      if (!dnRecsByOrder[oid]) dnRecsByOrder[oid] = [];
      dnRecsByOrder[oid].push({ dnId: dn.dnId, dnNo: dn.dnNo, date: dn.date, amount: parseFloat(dn.grandTotal)||0 });
    });

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
        const received        = linkedPayments.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
        const creditNotesAmt  = cnByOrder[String(oid)] || 0;
        return {
          orderId:         oid,
          orderNo:         o.orderNo || o.voucherNumber || o.soNo || `SO-${oid}`,
          orderDate:       o.orderDate || o.date || o.createdAt,
          deliveryDate:    o.deliveryDate || o.dueDate || '',
          clientId:        o.clientId,
          entityName:      o.customerName || o.clientName || o.party || '—',
          orderType:       o.orderType || '',
          status:          o.status || 'approved',
          orderTotal,
          received,
          creditNotesAmt,
          linkedCreditNotes: cnRecsByOrder[String(oid)] || [],
          linkedPayments,
          items:           o.items     || [],
          addOnItems:      o.addOnItems || [],
          charges:         o.charges   || [],
          due:             orderTotal - received - creditNotesAmt,
          scopeOfWork:     o.scopeOfWork  || '',
          clientScope:     o.clientScope  || '',
          epsilonScope:    o.epsilonScope || '',
          scopeItems:      o.scopeItems   || [],
          paymentTerms:    o.paymentTerms || o.billingTerms || '',
          contactPerson:   o.contactPerson || '',
          mobile:          o.mobile || '',
          mobile2:         o.mobile2 || '',
          email:           o.email || '',
          deliveryAddress: o.deliveryAddress || o.deliveryAddr || '',
          deliveryCity:    o.deliveryCity || '',
          deliveryState:   o.deliveryState || '',
          deliveryPincode: o.deliveryPincode || '',
          shipFromAddress: o.shipFromAddress || '',
          shipFromCity:    o.shipFromCity || '',
          shipFromState:   o.shipFromState || '',
          shipFromPincode: o.shipFromPincode || '',
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
        const paid         = linkedPayments.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
        const debitNotesAmt = dnByOrder[String(oid)] || 0;
        return {
          orderId:          oid,
          orderNo:          o.poNo || o.poNumber || o.voucherNumber || `PO-${oid}`,
          poNo:             o.poNo || o.poNumber || '',
          orderDate:        o.poDate || o.date || o.createdAt,
          poDate:           o.poDate || '',
          deliveryDate:     o.deliveryDate || o.dueDate || '',
          vendorId:         o.vendorId,
          vendorCode:       o.vendorCode || '',
          entityName:       o.vendorName || o.party || '—',
          poType:           o.poType || '',
          status:           o.status || 'approved',
          orderTotal,
          paid,
          debitNotesAmt,
          linkedDebitNotes: dnRecsByOrder[String(oid)] || [],
          linkedPayments,
          items:            o.items     || [],
          addOnItems:       o.addOnItems || [],
          charges:          o.charges   || [],
          due:              orderTotal - paid - debitNotesAmt,
          vendorScope:      o.vendorScope  || '',
          epsilonScope:     o.epsilonScope || '',
          clientScope:      o.clientScope  || '',
          scopeItems:       o.scopeItems   || [],
          paymentTerms:     o.paymentTerms || o.billingTerms || '',
          contactPerson:    o.contactPerson || '',
          mobile:           o.mobile || '',
          mobile2:          o.mobile2 || '',
          email:            o.email || '',
          deliveryAddress:  o.deliveryAddress || o.deliveryAddr || '',
          deliveryCity:     o.deliveryCity || '',
          deliveryState:    o.deliveryState || '',
          deliveryPincode:  o.deliveryPincode || '',
          shipFromAddress:  o.shipFromAddress || '',
          shipFromCity:     o.shipFromCity || '',
          shipFromState:    o.shipFromState || '',
          shipFromPincode:  o.shipFromPincode || '',
          linkedSalesOrderId: o.linkedSalesOrderId || '',
          clientName: (() => {
            const sid = String(o.linkedSalesOrderId || '');
            if (!sid) return '';
            const so = soMap[sid];
            return so ? (so.customerName || so.clientName || so.party || '') : '';
          })(),
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

/* ════════════════════════════════════════════════════════
   LEDGER — aggregate all transactions by party / ledger name
════════════════════════════════════════════════════════ */

/* reads JSON files one level deep (handles sub-folder structures) */
const readAllDeep = (dir) => {
  if (!fs.existsSync(dir)) return [];
  const results = [];
  fs.readdirSync(dir, { withFileTypes: true }).forEach(e => {
    if (e.isDirectory()) {
      const sub = path.join(dir, e.name);
      fs.readdirSync(sub).filter(f => f.endsWith('.json')).forEach(f => {
        try { results.push(JSON.parse(fs.readFileSync(path.join(sub, f), 'utf-8'))); } catch {}
      });
    } else if (e.name.endsWith('.json')) {
      try { results.push(JSON.parse(fs.readFileSync(path.join(dir, e.name), 'utf-8'))); } catch {}
    }
  });
  return results.filter(Boolean);
};

router.get('/ledger', (req, res) => {
  try {
    const companyId = cid(req);
    const journals    = readAll(coDir(companyId, 'Journals')).filter(j => j.status !== 'rejected');
    const banks       = readAll(banksDir(companyId));
    const payments    = readAll(coDir(companyId, 'Payments'));
    const salesBills  = readAllDeep(coDir(companyId, 'SalesBills'));
    const purchBills  = readAllDeep(coDir(companyId, 'PurchaseBills'));
    const clients     = readAllDeep(coDir(companyId, 'Client'));
    const vendors     = readAllDeep(coDir(companyId, 'Vendor'));

    const map = {};
    const ensure = (name, type) => {
      if (!name) return;
      if (!map[name]) map[name] = { ledger: name, totalDebit: 0, totalCredit: 0, entries: [], partyType: type || null };
    };

    /* 1. Journal entries */
    journals.forEach(j => {
      (j.entries || []).forEach(e => {
        if (!e.ledger) return;
        ensure(e.ledger);
        map[e.ledger].totalDebit  += parseFloat(e.debit)  || 0;
        map[e.ledger].totalCredit += parseFloat(e.credit) || 0;
        map[e.ledger].entries.push({
          journalId: j.journalId, date: j.date, narration: j.narration,
          refNo: j.refNo || '', status: j.status || 'draft',
          debit: parseFloat(e.debit) || 0, credit: parseFloat(e.credit) || 0,
          source: 'journal',
        });
      });
    });

    /* 2. Sales Bills → Dr client (they owe us) */
    salesBills.forEach(b => {
      const name = b.partyName;
      if (!name) return;
      ensure(name, 'client');
      const amt = parseFloat(b.grandTotal) || 0;
      map[name].totalDebit += amt;
      map[name].entries.push({
        journalId: b.billId, date: b.billDate, narration: `Sales Bill: ${b.billNo || b.billId}`,
        refNo: b.billNo || b.billId, status: 'posted',
        debit: amt, credit: 0, source: 'sales-bill',
      });
    });

    /* 3. Receipts (payments type=receipt) → Cr client (they paid us) */
    payments.filter(p => p.type === 'receipt' && p.status === 'confirmed').forEach(p => {
      const name = p.party || p.entityName;
      if (!name) return;
      ensure(name, 'client');
      const amt = parseFloat(p.amount) || 0;
      map[name].totalCredit += amt;
      map[name].entries.push({
        journalId: `PMT-${p.paymentId}`, date: p.date, narration: `Receipt: ${p.paymentMode || ''}`,
        refNo: p.reference || p.referenceNo || String(p.paymentId), status: 'confirmed',
        debit: 0, credit: amt, source: 'receipt',
      });
    });

    /* 4. Purchase Bills → Cr vendor (we owe them) */
    purchBills.forEach(b => {
      const name = b.partyName;
      if (!name) return;
      ensure(name, 'vendor');
      const amt = parseFloat(b.grandTotal) || 0;
      map[name].totalCredit += amt;
      map[name].entries.push({
        journalId: b.billId, date: b.billDate, narration: `Purchase Bill: ${b.billNo || b.billId}`,
        refNo: b.billNo || b.billId, status: 'posted',
        debit: 0, credit: amt, source: 'purchase-bill',
      });
    });

    /* 5. Payments (type=payment) → Dr vendor (we paid them) */
    payments.filter(p => p.type === 'payment' && p.status === 'confirmed').forEach(p => {
      const name = p.party || p.entityName;
      if (!name) return;
      ensure(name, 'vendor');
      const amt = parseFloat(p.amount) || 0;
      map[name].totalDebit += amt;
      map[name].entries.push({
        journalId: `PMT-${p.paymentId}`, date: p.date, narration: `Payment: ${p.paymentMode || ''}`,
        refNo: p.reference || p.referenceNo || String(p.paymentId), status: 'confirmed',
        debit: amt, credit: 0, source: 'payment',
      });
    });

    /* 6. Credit Notes → Cr client (reduce receivable) */
    const creditNotesLedger = readAll(coDir(companyId, 'CreditNotes')).filter(cn => cn.status !== 'cancelled');
    creditNotesLedger.forEach(cn => {
      const name = cn.clientName;
      if (!name) return;
      ensure(name, 'client');
      const amt = parseFloat(cn.grandTotal) || 0;
      map[name].totalCredit += amt;
      map[name].entries.push({
        journalId: String(cn.cnId), date: cn.date,
        narration: `Credit Note: ${cn.cnNo || cn.cnId}`,
        refNo: cn.cnNo || String(cn.cnId), status: cn.status || 'draft',
        debit: 0, credit: amt, source: 'credit-note',
      });
    });

    /* 7. Debit Notes → Dr vendor (reduce payable) */
    const debitNotesLedger = readAll(coDir(companyId, 'DebitNotes')).filter(dn => dn.status !== 'cancelled');
    debitNotesLedger.forEach(dn => {
      const name = dn.vendorName;
      if (!name) return;
      ensure(name, 'vendor');
      const amt = parseFloat(dn.grandTotal) || 0;
      map[name].totalDebit += amt;
      map[name].entries.push({
        journalId: String(dn.dnId), date: dn.date,
        narration: `Debit Note: ${dn.dnNo || dn.dnId}`,
        refNo: dn.dnNo || String(dn.dnId), status: dn.status || 'draft',
        debit: amt, credit: 0, source: 'debit-note',
      });
    });

    /* 8. Ensure all clients and vendors appear even with zero transactions */
    clients.forEach(c => {
      const name = c.clientName || c.companyName;
      if (!name || name.trim() === '') return;
      ensure(name, 'client');
    });
    vendors.forEach(v => {
      const name = v.vendorName || v.companyName;
      if (!name || name.trim() === '') return;
      ensure(name, 'vendor');
    });

    /* 7. Bank accounts — enrich with current balance */
    banks.forEach(b => {
      const name = `Bank - ${b.bankName}`;
      ensure(name, 'bank');
      const conf     = payments.filter(p => String(p.bankId) === String(b.bankId) && p.status === 'confirmed');
      const inflow   = conf.filter(p => p.type === 'receipt').reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
      const outflow  = conf.filter(p => p.type === 'payment').reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
      map[name].openingBalance = parseFloat(b.openingBalance) || 0;
      map[name].currentBalance = (parseFloat(b.openingBalance) || 0) + inflow - outflow;
      map[name].bankId         = b.bankId;
      map[name].accountNumber  = b.accountNumber;
      map[name].bankType       = true;
    });

    const result = Object.values(map)
      .map(l => ({
        ...l,
        totalDebit:  +l.totalDebit.toFixed(2),
        totalCredit: +l.totalCredit.toFixed(2),
        balance:     +(l.totalDebit - l.totalCredit).toFixed(2),
        entries: l.entries.sort((a, b) => new Date(a.date) - new Date(b.date)),
      }))
      .sort((a, b) => a.ledger.localeCompare(b.ledger));

    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ════════════════════════════════════════════════════════
   DEBIT NOTES  — per company
   Path: Database/Companies/{cid}/DebitNotes/{id}.json
════════════════════════════════════════════════════════ */
const calcNoteItems = (items = []) => {
  let subTotal = 0, totalGST = 0;
  const computed = items.map(it => {
    const taxable = (parseFloat(it.qty)||0) * (parseFloat(it.rate)||0);
    const gst = taxable * (parseFloat(it.gstPercent)||0) / 100;
    subTotal += taxable; totalGST += gst;
    return { ...it, taxableAmt: +taxable.toFixed(2), gstAmt: +gst.toFixed(2), totalAmt: +(taxable+gst).toFixed(2) };
  });
  return { items: computed, subTotal: +subTotal.toFixed(2), totalGST: +totalGST.toFixed(2), grandTotal: +(subTotal+totalGST).toFixed(2) };
};
const currentFY = () => { const d = new Date(); const m = d.getMonth()+1, y = d.getFullYear(); return m >= 4 ? y : y-1; };

router.get('/debit-notes', (req, res) => {
  try { res.json(readAll(coDir(cid(req), 'DebitNotes')).sort((a,b)=>(b.dnId||0)-(a.dnId||0))); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
router.post('/debit-notes', (req, res) => {
  try {
    const companyId = cid(req);
    if (!companyId) return res.status(400).json({ error: 'companyId required' });
    const dir = coDir(companyId, 'DebitNotes'); ensureDir(dir);
    const dnId = nextId(dir, 950001);
    const dnNo = `DN-${currentFY()}-${dnId}`;
    const { items: computed, subTotal, totalGST, grandTotal } = calcNoteItems(req.body.items);
    const now = new Date().toISOString();
    const rec = { dnId, dnNo, ...req.body, items: computed, subTotal, totalGST, grandTotal, companyId, createdAt: now, updatedAt: now };
    saveJson(coFile(companyId, 'DebitNotes', dnId), rec);
    res.json({ success: true, dnId, dnNo });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
router.get('/debit-notes/:id', (req, res) => {
  try {
    const fp = coFile(cid(req), 'DebitNotes', req.params.id);
    if (!fs.existsSync(fp)) return res.status(404).json({ error: 'Not found' });
    res.json(JSON.parse(fs.readFileSync(fp, 'utf-8')));
  } catch (e) { res.status(500).json({ error: e.message }); }
});
router.put('/debit-notes/:id', (req, res) => {
  try {
    const companyId = cid(req);
    const fp = coFile(companyId, 'DebitNotes', req.params.id);
    if (!fs.existsSync(fp)) return res.status(404).json({ error: 'Not found' });
    const existing = JSON.parse(fs.readFileSync(fp, 'utf-8'));
    const { items: computed, subTotal, totalGST, grandTotal } = calcNoteItems(req.body.items || existing.items);
    saveJson(fp, { ...existing, ...req.body, items: computed, subTotal, totalGST, grandTotal, updatedAt: new Date().toISOString() });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
router.delete('/debit-notes/:id', (req, res) => {
  try {
    const fp = coFile(cid(req), 'DebitNotes', req.params.id);
    if (!fs.existsSync(fp)) return res.status(404).json({ error: 'Not found' });
    fs.unlinkSync(fp); res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ════════════════════════════════════════════════════════
   CREDIT NOTES  — per company
   Path: Database/Companies/{cid}/CreditNotes/{id}.json
════════════════════════════════════════════════════════ */
router.get('/credit-notes', (req, res) => {
  try { res.json(readAll(coDir(cid(req), 'CreditNotes')).sort((a,b)=>(b.cnId||0)-(a.cnId||0))); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
router.post('/credit-notes', (req, res) => {
  try {
    const companyId = cid(req);
    if (!companyId) return res.status(400).json({ error: 'companyId required' });
    const dir = coDir(companyId, 'CreditNotes'); ensureDir(dir);
    const cnId = nextId(dir, 960001);
    const cnNo = `CN-${currentFY()}-${cnId}`;
    const { items: computed, subTotal, totalGST, grandTotal } = calcNoteItems(req.body.items);
    const now = new Date().toISOString();
    const rec = { cnId, cnNo, ...req.body, items: computed, subTotal, totalGST, grandTotal, companyId, createdAt: now, updatedAt: now };
    saveJson(coFile(companyId, 'CreditNotes', cnId), rec);
    res.json({ success: true, cnId, cnNo });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
router.get('/credit-notes/:id', (req, res) => {
  try {
    const fp = coFile(cid(req), 'CreditNotes', req.params.id);
    if (!fs.existsSync(fp)) return res.status(404).json({ error: 'Not found' });
    res.json(JSON.parse(fs.readFileSync(fp, 'utf-8')));
  } catch (e) { res.status(500).json({ error: e.message }); }
});
router.put('/credit-notes/:id', (req, res) => {
  try {
    const companyId = cid(req);
    const fp = coFile(companyId, 'CreditNotes', req.params.id);
    if (!fs.existsSync(fp)) return res.status(404).json({ error: 'Not found' });
    const existing = JSON.parse(fs.readFileSync(fp, 'utf-8'));
    const { items: computed, subTotal, totalGST, grandTotal } = calcNoteItems(req.body.items || existing.items);
    saveJson(fp, { ...existing, ...req.body, items: computed, subTotal, totalGST, grandTotal, updatedAt: new Date().toISOString() });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
router.delete('/credit-notes/:id', (req, res) => {
  try {
    const fp = coFile(cid(req), 'CreditNotes', req.params.id);
    if (!fs.existsSync(fp)) return res.status(404).json({ error: 'Not found' });
    fs.unlinkSync(fp); res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
