/**
 * SAP MODE — Finance (FICO lite)
 * Auto journal entries for: Invoice, Payment, GRN (GR/IR)
 * GET /api/sap/finance/journals — all journal entries
 * POST /api/sap/finance/invoice — create sales invoice
 * POST /api/sap/finance/payment — record payment received
 * GET /api/sap/finance/project-pnl/:projectId — P&L summary
 */
const express = require('express');
const path    = require('path');
const fs      = require('fs');
const { getCompanyPath, generateSequentialId } = require('../helpers');

const router = express.Router();

const invPath  = (cid) => getCompanyPath('SAP/Invoices', cid);
const payPath  = (cid) => getCompanyPath('SAP/Payments', cid);
const jrnPath  = (cid) => getCompanyPath('SAP/Journals', cid);

const readJSON = (file) => { try { return JSON.parse(fs.readFileSync(file,'utf-8')); } catch { return null; } };
const writeRec = (dir, id, data) => { fs.mkdirSync(dir,{recursive:true}); fs.writeFileSync(path.join(dir,`${id}.json`),JSON.stringify(data,null,2)); };

/* ── Create auto journal ─────────────────────────────────────── */
const createJournal = (cid, data) => {
  const dir = jrnPath(cid);
  const id  = `SAP-JRN-${generateSequentialId(dir, 1).toString().padStart(5,'0')}`;
  writeRec(path.join(dir, id), id, { journalId: id, ...data, createdAt: new Date().toISOString() });
  return id;
};

/* ════════════════ INVOICES ════════════════════════════════════ */
router.get('/invoices', (req, res) => {
  try {
    const dir = invPath(req.query.companyId);
    const list = [];
    if (fs.existsSync(dir)) fs.readdirSync(dir).forEach(f => { const d = readJSON(path.join(dir,f,`${f}.json`)); if(d) list.push(d); });
    const pid = req.query.projectId;
    res.json(pid ? list.filter(i => i.projectId === pid) : list);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/invoice', (req, res) => {
  try {
    const cid = req.body.companyId || req.query.companyId;
    const dir = invPath(cid);
    const id  = `SAP-INV-${generateSequentialId(dir,1).toString().padStart(4,'0')}`;
    const now = new Date().toISOString();

    const items = (req.body.items || []).map(it => {
      const qty  = parseFloat(it.qty) || 0;
      const price= parseFloat(it.unitPrice) || 0;
      const tax  = parseFloat(it.taxPct) || 0;
      const sub  = qty * price;
      return { ...it, qty, unitPrice: price, taxPct: tax, subtotal: sub, taxAmount: sub*tax/100, lineTotal: sub + sub*tax/100 };
    });
    const subtotal  = items.reduce((s,i)=>s+i.subtotal,0);
    const taxTotal  = items.reduce((s,i)=>s+i.taxAmount,0);
    const grandTotal = subtotal + taxTotal;

    const inv = {
      invId: id, invNumber: `SAP/INV/${id.split('-')[2]}/${id.split('-')[3] || id.split('-')[2]}`,
      projectId: req.body.projectId, soId: req.body.soId || '',
      clientId: req.body.clientId, clientName: req.body.clientName,
      invoiceDate: req.body.invoiceDate || now.slice(0,10),
      dueDate: req.body.dueDate || '',
      items, subtotal, taxTotal, grandTotal,
      paidAmount: 0, balanceAmount: grandTotal,
      status: 'Unpaid',   // Unpaid | PartiallyPaid | Paid
      notes: req.body.notes || '',
      companyId: cid, createdAt: now, updatedAt: now,
    };

    writeRec(path.join(dir, id), id, inv);

    // Auto journal: Dr Customer / Cr Revenue
    createJournal(cid, {
      documentType: 'Invoice', referenceId: id, referenceNum: inv.invNumber,
      postingDate: inv.invoiceDate, description: `Invoice: ${inv.invNumber} — ${inv.clientName}`,
      entries: [
        { account: 'Accounts Receivable', debit: grandTotal, credit: 0, costCenter: inv.projectId },
        { account: 'Revenue / Sales',     debit: 0, credit: subtotal,   costCenter: inv.projectId },
        { account: 'GST Payable',         debit: 0, credit: taxTotal,   costCenter: inv.projectId },
      ],
      companyId: cid,
    });

    res.status(201).json(inv);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ════════════════ PAYMENTS ════════════════════════════════════ */
router.get('/payments', (req, res) => {
  try {
    const dir = payPath(req.query.companyId);
    const list = [];
    if (fs.existsSync(dir)) fs.readdirSync(dir).forEach(f => { const d = readJSON(path.join(dir,f,`${f}.json`)); if(d) list.push(d); });
    const pid = req.query.projectId;
    res.json(pid ? list.filter(p => p.projectId === pid) : list);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/payment', (req, res) => {
  try {
    const cid = req.body.companyId || req.query.companyId;
    const dir = payPath(cid);
    const id  = `SAP-PAY-${generateSequentialId(dir,1).toString().padStart(4,'0')}`;
    const now = new Date().toISOString();
    const amount = parseFloat(req.body.amount) || 0;

    const pay = {
      payId: id, projectId: req.body.projectId, invId: req.body.invId || '',
      clientId: req.body.clientId, clientName: req.body.clientName,
      amount, paymentMode: req.body.paymentMode || 'NEFT',
      paymentDate: req.body.paymentDate || now.slice(0,10),
      reference: req.body.reference || '',
      notes: req.body.notes || '',
      companyId: cid, createdAt: now,
    };

    writeRec(path.join(dir, id), id, pay);

    // Update invoice paid amount
    if (req.body.invId) {
      const invDir  = invPath(cid);
      const invFile = path.join(invDir, req.body.invId, `${req.body.invId}.json`);
      const inv     = readJSON(invFile);
      if (inv) {
        inv.paidAmount    = (inv.paidAmount || 0) + amount;
        inv.balanceAmount = Math.max(0, inv.grandTotal - inv.paidAmount);
        inv.status        = inv.balanceAmount <= 0 ? 'Paid' : 'PartiallyPaid';
        inv.updatedAt     = now;
        fs.writeFileSync(invFile, JSON.stringify(inv, null, 2));
      }
    }

    // Auto journal: Dr Bank / Cr Customer
    createJournal(cid, {
      documentType: 'Payment', referenceId: id,
      postingDate: pay.paymentDate, description: `Payment received: ${pay.clientName}`,
      entries: [
        { account: 'Bank / Cash',         debit: amount, credit: 0,      costCenter: pay.projectId },
        { account: 'Accounts Receivable', debit: 0,      credit: amount, costCenter: pay.projectId },
      ],
      companyId: cid,
    });

    res.status(201).json(pay);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ════════════════ JOURNALS ════════════════════════════════════ */
router.get('/journals', (req, res) => {
  try {
    const dir  = jrnPath(req.query.companyId);
    const list = [];
    if (fs.existsSync(dir)) fs.readdirSync(dir).forEach(f => { const d = readJSON(path.join(dir,f,`${f}.json`)); if(d) list.push(d); });
    const pid = req.query.projectId;
    res.json(pid ? list.filter(j => j.entries?.some(e => e.costCenter === pid)) : list);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ════════════════ PROJECT P&L ════════════════════════════════ */
router.get('/project-pnl/:projectId', (req, res) => {
  try {
    const cid = req.query.companyId;
    const pid = req.params.projectId;

    // Read all invoices for project
    const invDir = invPath(cid);
    let revenue = 0, received = 0, outstanding = 0;
    if (fs.existsSync(invDir)) {
      fs.readdirSync(invDir).forEach(f => {
        const inv = readJSON(path.join(invDir, f, `${f}.json`));
        if (inv && inv.projectId === pid) {
          revenue     += inv.grandTotal || 0;
          received    += inv.paidAmount || 0;
          outstanding += inv.balanceAmount || 0;
        }
      });
    }

    // Read all POs for cost
    const poDir = getCompanyPath('SAP/PurchaseOrders', cid);
    let procurementCost = 0;
    if (fs.existsSync(poDir)) {
      fs.readdirSync(poDir).forEach(f => {
        const po = readJSON(path.join(poDir, f, `${f}.json`));
        if (po && po.projectId === pid && po.status !== 'Cancelled') procurementCost += po.grandTotal || 0;
      });
    }

    const grossMargin = revenue - procurementCost;
    const marginPct   = revenue > 0 ? Math.round(grossMargin / revenue * 100) : 0;

    res.json({ projectId: pid, revenue, received, outstanding, procurementCost, grossMargin, marginPct });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
