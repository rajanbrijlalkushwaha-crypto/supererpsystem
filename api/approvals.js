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
const sqlite   = require('./sqlite');

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
/* Assign into an already-loaded registry. Returns the id; caller saves once.
   Kept separate from getOrAssign so listing N records costs one write, not N. */
function assignInto(reg, moduleKey, refId) {
  const key = `${moduleKey}:${refId}`;
  if (!reg.items[key]) {
    reg.counter = (reg.counter || 0) + 1;
    reg.items[key] = { approvalId: `APR${String(reg.counter).padStart(5,'0')}`, registeredAt: new Date().toISOString(), module: moduleKey, refId };
    reg._dirty = true;
  }
  return reg.items[key].approvalId;
}

function getOrAssign(co, moduleKey, refId) {
  const reg = getRegistry(co);
  const id  = assignInto(reg, moduleKey, refId);
  if (reg._dirty) { delete reg._dirty; saveRegistry(co, reg); }
  return id;
}

/* ── File readers — served from the SQLite index, same records and order ── */
const readFlat           = dir => sqlite.listFlatByDir(dir);
const readSubdirNumeric  = dir => sqlite.listSubPreferCanonicalByDir(dir);
const readSubdirDeposit  = dir => sqlite.listSubCanonicalByDir(dir);

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
        const approvalId = assignInto(reg, mod.key, refId);
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

    /* One registry write for the whole listing, not one per record. */
    if (reg._dirty) { delete reg._dirty; saveRegistry(co, reg); }

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
    sqlite.indexFile(filePath);

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
    sqlite.indexFile(filePath);

    const reg = getRegistry(co);
    const key = `${moduleKey}:${refId}`;
    if (reg.items[key]) { reg.items[key].rejectedAt = updated.rejectedAt; }
    saveRegistry(co, reg);

    res.json({ success: true, status: 'rejected' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ─────────────────────────────────────────────
   PUT /api/approvals/bulk?companyId=X
   Body: { action: 'approve'|'reject', items: [{module, refId}], by, reason }
   Groups by module so each module's records are read once for the whole batch.
───────────────────────────────────────────────*/
router.put('/bulk', (req, res) => {
  try {
    const co = cid(req);
    const { action = 'approve', items = [], by = 'Admin', reason = '' } = req.body;
    if (!co) return res.status(400).json({ error: 'companyId required' });
    if (!Array.isArray(items) || !items.length) return res.status(400).json({ error: 'items required' });
    if (!['approve', 'reject'].includes(action)) return res.status(400).json({ error: 'action must be approve or reject' });

    const byModule = new Map();
    items.forEach(it => {
      if (!it || !it.module || it.refId === undefined) return;
      if (!byModule.has(it.module)) byModule.set(it.module, []);
      byModule.get(it.module).push(String(it.refId));
    });

    const reg  = getRegistry(co);
    const now  = new Date().toISOString();
    const done = [], failed = [];

    for (const [moduleKey, refIds] of byModule) {
      const mod = MODULES.find(m => m.key === moduleKey);
      if (!mod) { refIds.forEach(r => failed.push({ module: moduleKey, refId: r, error: 'Unknown module' })); continue; }

      let records = [];
      try { records = mod.reader(co); } catch {}
      const index = new Map(records.map(r => [String(r[mod.idField]), r]));

      for (const refId of refIds) {
        const record = index.get(refId);
        if (!record) { failed.push({ module: moduleKey, refId, error: 'Record not found' }); continue; }

        const filePath = mod.getFile(co, record);
        if (!filePath || !fs.existsSync(filePath)) { failed.push({ module: moduleKey, refId, error: 'File not found' }); continue; }

        try {
          const current = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
          const updated = action === 'approve'
            ? { ...current, status: mod.approvedStatus, approvedBy: by, approvedAt: now, updatedAt: now }
            : { ...current, status: 'rejected', rejectedBy: by, rejectedAt: now, rejectReason: reason, updatedAt: now };
          fs.writeFileSync(filePath, JSON.stringify(updated, null, 2));
          sqlite.indexFile(filePath);

          const key = `${moduleKey}:${refId}`;
          assignInto(reg, moduleKey, refId);
          if (action === 'approve') { reg.items[key].approvedAt = now; reg.items[key].approvedBy = by; }
          else                      { reg.items[key].rejectedAt = now; }
          reg._dirty = true;

          done.push({ module: moduleKey, refId, approvalId: reg.items[key].approvalId, status: updated.status });
        } catch (e) {
          failed.push({ module: moduleKey, refId, error: e.message });
        }
      }
    }

    if (reg._dirty) { delete reg._dirty; saveRegistry(co, reg); }
    res.json({ success: failed.length === 0, action, approved: done.length, failedCount: failed.length, done, failed });
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
