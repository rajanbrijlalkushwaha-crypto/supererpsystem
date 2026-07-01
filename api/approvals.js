/**
 * approvals.js — Central approval registry for all modules.
 * Reads pending items from every module directory and provides
 * approve / reject endpoints that update the source file directly.
 *
 * Registry stored at: Database/Companies/{co}/Approvals/registry.json
 *   { counter: N, items: { "module:refId": { approvalId, registeredAt } } }
 */
const express = require('express');
const path    = require('path');
const fs      = require('fs');
const { ROOT } = require('./helpers');

const router = express.Router();

const coBase  = co => path.join(ROOT, 'Database', 'Companies', co);
const aprDir  = co => path.join(coBase(co), 'Approvals');
const aprFile = co => path.join(aprDir(co), 'registry.json');

/* ── Registry helpers ── */
function getRegistry(co) {
  const f = aprFile(co);
  if (!fs.existsSync(f)) return { counter: 0, items: {} };
  try { return JSON.parse(fs.readFileSync(f, 'utf-8')); } catch { return { counter: 0, items: {} }; }
}
function saveRegistry(co, reg) {
  const d = aprDir(co);
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(aprFile(co), JSON.stringify(reg, null, 2));
}
function getOrAssign(co, moduleKey, refId) {
  const reg = getRegistry(co);
  const key = `${moduleKey}:${refId}`;
  if (!reg.items[key]) {
    reg.counter = (reg.counter || 0) + 1;
    reg.items[key] = { approvalId: `APR${String(reg.counter).padStart(5,'0')}`, registeredAt: new Date().toISOString(), module: moduleKey, refId };
    saveRegistry(co, reg);
  }
  return reg.items[key].approvalId;
}

/* ── File readers ── */
function readFlat(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.json'))
    .map(f => { try { return JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8')); } catch { return null; } })
    .filter(Boolean);
}

function readSubdirNumeric(dir) {
  /* {dir}/{numericId}/{numericId}.json  — json-store pattern */
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter(e => e.isDirectory())
    .map(e => {
      const canonical = path.join(dir, e.name, `${e.name}.json`);
      if (fs.existsSync(canonical)) { try { return JSON.parse(fs.readFileSync(canonical,'utf-8')); } catch { return null; } }
      /* vendor/client style: {id}-{name}.json */
      const files = fs.readdirSync(path.join(dir, e.name)).filter(f => f.endsWith('.json') && !f.includes('communication'));
      if (!files.length) return null;
      try { return JSON.parse(fs.readFileSync(path.join(dir, e.name, files[0]),'utf-8')); } catch { return null; }
    })
    .filter(Boolean);
}

function readSubdirDeposit(dir) {
  /* {dir}/{depositId}/{depositId}.json */
  if (!fs.existsSync(dir)) return [];
  const results = [];
  fs.readdirSync(dir, { withFileTypes: true }).forEach(e => {
    if (!e.isDirectory()) return;
    const f = path.join(dir, e.name, `${e.name}.json`);
    if (fs.existsSync(f)) { try { results.push(JSON.parse(fs.readFileSync(f,'utf-8'))); } catch {} }
  });
  return results;
}

/* ── Module configuration ── */
const MODULES = [
  {
    key: 'deposit', label: 'BG / Deposit',
    reader: co => readSubdirDeposit(path.join(coBase(co), 'Deposits')),
    getFile: (co, rec) => path.join(coBase(co), 'Deposits', rec.depositId, `${rec.depositId}.json`),
    idField: 'depositId', refField: 'bgNo', partyField: 'customerName', amtField: 'amount', dateField: 'startDate',
    pendingStatuses: ['pending'],
    approvedStatus: 'active',
    subTypeField: 'depositType',
  },
  {
    key: 'payment', label: 'Payment',
    reader: co => readFlat(path.join(coBase(co), 'Payments')).filter(r => r.type !== 'receipt'),
    getFile: (co, rec) => path.join(coBase(co), 'Payments', `${rec.paymentId}.json`),
    idField: 'paymentId', refField: 'paymentId', partyField: 'party', amtField: 'amount', dateField: 'date',
    pendingStatuses: ['pending'],
    approvedStatus: 'confirmed',
  },
  {
    key: 'receipt', label: 'Receipt',
    reader: co => readFlat(path.join(coBase(co), 'Payments')).filter(r => r.type === 'receipt'),
    getFile: (co, rec) => path.join(coBase(co), 'Payments', `${rec.paymentId}.json`),
    idField: 'paymentId', refField: 'paymentId', partyField: 'party', amtField: 'amount', dateField: 'date',
    pendingStatuses: ['pending'],
    approvedStatus: 'confirmed',
  },
  {
    key: 'journal', label: 'Journal Entry',
    reader: co => readFlat(path.join(coBase(co), 'Journals')),
    getFile: (co, rec) => path.join(coBase(co), 'Journals', `${rec.journalId}.json`),
    idField: 'journalId', refField: 'refNo', partyField: null, amtField: 'totalDebit', dateField: 'date',
    pendingStatuses: ['pending', 'draft'],
    approvedStatus: 'posted',
  },
  {
    key: 'expense', label: 'Expense',
    reader: co => readFlat(path.join(coBase(co), 'Expenses')),
    getFile: (co, rec) => path.join(coBase(co), 'Expenses', `${rec.expenseId}.json`),
    idField: 'expenseId', refField: 'expenseId', partyField: 'party', amtField: 'amount', dateField: 'date',
    pendingStatuses: ['pending', 'draft'],
    approvedStatus: 'approved',
  },
  {
    key: 'creditnote', label: 'Credit Note',
    reader: co => readFlat(path.join(coBase(co), 'CreditNotes')),
    getFile: (co, rec) => path.join(coBase(co), 'CreditNotes', `${rec.cnId}.json`),
    idField: 'cnId', refField: 'cnNo', partyField: 'party', amtField: 'amount', dateField: 'date',
    pendingStatuses: ['pending', 'draft'],
    approvedStatus: 'approved',
  },
  {
    key: 'debitnote', label: 'Debit Note',
    reader: co => readFlat(path.join(coBase(co), 'DebitNotes')),
    getFile: (co, rec) => path.join(coBase(co), 'DebitNotes', `${rec.dnId}.json`),
    idField: 'dnId', refField: 'dnNo', partyField: 'party', amtField: 'amount', dateField: 'date',
    pendingStatuses: ['pending', 'draft'],
    approvedStatus: 'approved',
  },
  {
    key: 'salesorder', label: 'Sales Order',
    reader: co => readSubdirNumeric(path.join(coBase(co), 'SalesOrder')),
    getFile: (co, rec) => {
      const dir = path.join(coBase(co), 'SalesOrder', String(rec.orderId));
      if (fs.existsSync(dir)) return path.join(dir, `${rec.orderId}.json`);
      return null;
    },
    idField: 'orderId', refField: 'orderNo', partyField: 'customerName', amtField: 'grandTotal', dateField: 'orderDate',
    pendingStatuses: ['pending', 'draft'],
    approvedStatus: 'approved',
  },
  {
    key: 'purchaseorder', label: 'Purchase Order',
    reader: co => readSubdirNumeric(path.join(coBase(co), 'PurchaseOrder')),
    getFile: (co, rec) => {
      const dir = path.join(coBase(co), 'PurchaseOrder', String(rec.orderId));
      if (fs.existsSync(dir)) return path.join(dir, `${rec.orderId}.json`);
      return null;
    },
    idField: 'orderId', refField: 'orderNo', partyField: 'vendorName', amtField: 'grandTotal', dateField: 'poDate',
    pendingStatuses: ['pending', 'draft'],
    approvedStatus: 'approved',
  },
  {
    key: 'salesbill', label: 'Sales Bill',
    reader: co => readSubdirNumeric(path.join(coBase(co), 'SalesBills')),
    getFile: (co, rec) => {
      const dir = path.join(coBase(co), 'SalesBills', String(rec.billId));
      if (fs.existsSync(dir)) return path.join(dir, `${rec.billId}.json`);
      return null;
    },
    idField: 'billId', refField: 'billNo', partyField: 'customerName', amtField: 'grandTotal', dateField: 'billDate',
    pendingStatuses: ['pending', 'draft'],
    approvedStatus: 'posted',
  },
  {
    key: 'purchasebill', label: 'Purchase Bill',
    reader: co => readSubdirNumeric(path.join(coBase(co), 'PurchaseBills')),
    getFile: (co, rec) => {
      const dir = path.join(coBase(co), 'PurchaseBills', String(rec.billId));
      if (fs.existsSync(dir)) return path.join(dir, `${rec.billId}.json`);
      return null;
    },
    idField: 'billId', refField: 'billNo', partyField: 'vendorName', amtField: 'grandTotal', dateField: 'billDate',
    pendingStatuses: ['pending', 'draft'],
    approvedStatus: 'posted',
  },
  {
    key: 'vendor', label: 'Vendor',
    reader: co => readSubdirNumeric(path.join(coBase(co), 'Vendor')),
    getFile: (co, rec) => {
      const dir = path.join(coBase(co), 'Vendor', String(rec.vendorId));
      if (!fs.existsSync(dir)) return null;
      const files = fs.readdirSync(dir).filter(f => f.endsWith('.json') && !f.includes('communication'));
      return files.length ? path.join(dir, files[0]) : null;
    },
    idField: 'vendorId', refField: 'vendorId', partyField: 'vendorName', amtField: null, dateField: 'createdAt',
    pendingStatuses: ['pending'],
    approvedStatus: 'approved',
  },
  {
    key: 'client', label: 'Client',
    reader: co => readSubdirNumeric(path.join(coBase(co), 'Client')),
    getFile: (co, rec) => {
      const dir = path.join(coBase(co), 'Client', String(rec.clientId));
      if (!fs.existsSync(dir)) return null;
      const files = fs.readdirSync(dir).filter(f => f.endsWith('.json') && !f.includes('communication'));
      return files.length ? path.join(dir, files[0]) : null;
    },
    idField: 'clientId', refField: 'clientId', partyField: 'companyName', amtField: null, dateField: 'createdAt',
    pendingStatuses: ['pending'],
    approvedStatus: 'approved',
  },
];

const cid = req => req.query.companyId || req.body?.companyId || '';

/* ─────────────────────────────────────────────
   GET /api/approvals?companyId=X[&status=pending|approved|rejected|all]
───────────────────────────────────────────────*/
router.get('/', (req, res) => {
  try {
    const co       = cid(req);
    if (!co) return res.status(400).json({ error: 'companyId required' });
    const wantStatus = (req.query.status || 'pending').toLowerCase();
    const reg = getRegistry(co);
    const results = [];

    MODULES.forEach(mod => {
      let records;
      try { records = mod.reader(co); } catch { records = []; }

      records.forEach(rec => {
        const recStatus = (rec.status || '').toLowerCase();
        const isPending  = mod.pendingStatuses.includes(recStatus);
        const isApproved = recStatus === mod.approvedStatus || recStatus === 'approved' || recStatus === 'posted' || recStatus === 'confirmed' || recStatus === 'active';
        const isRejected = recStatus === 'rejected';

        let include = false;
        if (wantStatus === 'pending')  include = isPending;
        else if (wantStatus === 'approved') include = isApproved && !isPending;
        else if (wantStatus === 'rejected') include = isRejected;
        else if (wantStatus === 'all')      include = true;

        if (!include) return;

        const refId = String(rec[mod.idField] || '');
        const approvalId = getOrAssign(co, mod.key, refId);
        const regEntry   = reg.items[`${mod.key}:${refId}`] || {};

        results.push({
          approvalId,
          module:    mod.key,
          moduleLabel: mod.label,
          subType:   mod.subTypeField ? rec[mod.subTypeField] : null,
          refId,
          refNo:     rec[mod.refField] || refId,
          party:     mod.partyField ? (rec[mod.partyField] || rec.entityName || rec.clientName || rec.vendorName || rec.companyName || '') : '',
          amount:    mod.amtField    ? (rec[mod.amtField]   || 0) : null,
          date:      rec[mod.dateField] || rec.createdAt || '',
          status:    rec.status || 'pending',
          submittedBy: rec.createdBy || rec.submittedBy || '',
          approvedBy:  rec.approvedBy || '',
          approvedAt:  rec.approvedAt || '',
          rejectedBy:  rec.rejectedBy || '',
          rejectedAt:  rec.rejectedAt || '',
          rejectReason: rec.rejectReason || '',
          registeredAt: regEntry.registeredAt || rec.createdAt || '',
          rawData: rec,   /* full record for preview modal */
        });
      });
    });

    /* Sort: pending first, then by date desc */
    results.sort((a, b) => {
      const ap = mod => mod.pendingStatuses?.includes((a.status||'').toLowerCase());
      const bp = mod => mod.pendingStatuses?.includes((b.status||'').toLowerCase());
      const aP = ['pending','draft'].includes((a.status||'').toLowerCase()) ? 1 : 0;
      const bP = ['pending','draft'].includes((b.status||'').toLowerCase()) ? 1 : 0;
      if (bP !== aP) return bP - aP;
      return new Date(b.date||0) - new Date(a.date||0);
    });

    res.json(results);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ─────────────────────────────────────────────
   PUT /api/approvals/approve?companyId=X
   Body: { module, refId, approvedBy }
───────────────────────────────────────────────*/
router.put('/approve', (req, res) => {
  try {
    const co = cid(req);
    const { module: moduleKey, refId, approvedBy = 'Admin' } = req.body;
    if (!co || !moduleKey || !refId) return res.status(400).json({ error: 'companyId, module, refId required' });

    const mod = MODULES.find(m => m.key === moduleKey);
    if (!mod) return res.status(400).json({ error: `Unknown module: ${moduleKey}` });

    /* Find the record */
    let record;
    try { record = mod.reader(co).find(r => String(r[mod.idField]) === String(refId)); } catch {}
    if (!record) return res.status(404).json({ error: 'Record not found' });

    const filePath = mod.getFile(co, record);
    if (!filePath || !fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found: ' + filePath });

    const updated = {
      ...JSON.parse(fs.readFileSync(filePath, 'utf-8')),
      status: mod.approvedStatus,
      approvedBy,
      approvedAt: new Date().toISOString(),
      updatedAt:  new Date().toISOString(),
    };
    fs.writeFileSync(filePath, JSON.stringify(updated, null, 2));

    /* Update registry */
    const reg = getRegistry(co);
    const key = `${moduleKey}:${refId}`;
    if (reg.items[key]) { reg.items[key].approvedAt = updated.approvedAt; reg.items[key].approvedBy = approvedBy; }
    saveRegistry(co, reg);

    res.json({ success: true, approvalId: getOrAssign(co, moduleKey, refId), status: updated.status });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ─────────────────────────────────────────────
   PUT /api/approvals/reject?companyId=X
   Body: { module, refId, rejectedBy, reason }
───────────────────────────────────────────────*/
router.put('/reject', (req, res) => {
  try {
    const co = cid(req);
    const { module: moduleKey, refId, rejectedBy = 'Admin', reason = '' } = req.body;
    if (!co || !moduleKey || !refId) return res.status(400).json({ error: 'companyId, module, refId required' });

    const mod = MODULES.find(m => m.key === moduleKey);
    if (!mod) return res.status(400).json({ error: `Unknown module: ${moduleKey}` });

    let record;
    try { record = mod.reader(co).find(r => String(r[mod.idField]) === String(refId)); } catch {}
    if (!record) return res.status(404).json({ error: 'Record not found' });

    const filePath = mod.getFile(co, record);
    if (!filePath || !fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });

    const updated = {
      ...JSON.parse(fs.readFileSync(filePath, 'utf-8')),
      status: 'rejected',
      rejectedBy,
      rejectedAt:   new Date().toISOString(),
      rejectReason: reason,
      updatedAt:    new Date().toISOString(),
    };
    fs.writeFileSync(filePath, JSON.stringify(updated, null, 2));

    const reg = getRegistry(co);
    const key = `${moduleKey}:${refId}`;
    if (reg.items[key]) { reg.items[key].rejectedAt = updated.rejectedAt; }
    saveRegistry(co, reg);

    res.json({ success: true, status: 'rejected' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ─────────────────────────────────────────────
   GET /api/approvals/stats?companyId=X
───────────────────────────────────────────────*/
router.get('/stats', (req, res) => {
  try {
    const co = cid(req);
    if (!co) return res.status(400).json({ error: 'companyId required' });
    const stats = {};
    MODULES.forEach(mod => {
      let records;
      try { records = mod.reader(co); } catch { records = []; }
      stats[mod.key] = {
        label: mod.label,
        pending:  records.filter(r => mod.pendingStatuses.includes((r.status||'').toLowerCase())).length,
        approved: records.filter(r => ['active','approved','confirmed','posted'].includes((r.status||'').toLowerCase())).length,
        rejected: records.filter(r => r.status === 'rejected').length,
        total:    records.length,
      };
    });
    res.json(stats);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
