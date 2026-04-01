/**
 * SAP MODE — GRN (Goods Receipt Note) — MM Module
 * Flow: PO → GRN → Stock Update → Auto Journal Entry
 * Path: Database/Companies/{companyId}/SAP/GRN/{grnId}/{grnId}.json
 */
const express = require('express');
const path    = require('path');
const fs      = require('fs');
const { getCompanyPath, generateSequentialId } = require('../helpers');

const router = express.Router();

const dbPath  = (cid) => getCompanyPath('SAP/GRN', cid);
const poPath  = (cid) => getCompanyPath('SAP/PurchaseOrders', cid);
const invPath = (cid) => getCompanyPath('SAP/Inventory', cid);
const jrnPath = (cid) => getCompanyPath('SAP/Journals', cid);

/* ── helpers ────────────────────────────────────────────────── */
const readJSON = (file) => {
  if (!fs.existsSync(file)) return null;
  try { return JSON.parse(fs.readFileSync(file, 'utf-8')); } catch { return null; }
};

const writeJSON = (dir, id, data) => {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${id}.json`), JSON.stringify(data, null, 2));
};

const nextId = (cid) => {
  const n  = generateSequentialId(dbPath(cid), 1);
  const fy = (() => { const d = new Date(); return d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear()-1; })();
  return `SAP-GRN-${fy}-${String(n).padStart(4, '0')}`;
};

/* ── Update inventory on GRN posting ───────────────────────── */
const updateInventory = (cid, projectId, items, grnId, receivedDate) => {
  const dir = invPath(cid);
  items.forEach(gi => {
    const key  = gi.itemName.replace(/[^a-zA-Z0-9]/g, '_');
    const file = path.join(dir, `${key}.json`);
    let inv    = readJSON(file) || {
      itemName: gi.itemName, unit: gi.unit,
      totalStock: 0, projectAllocations: {}, transactions: [],
    };

    inv.totalStock = (inv.totalStock || 0) + gi.receivedQty;
    inv.projectAllocations[projectId] = (inv.projectAllocations[projectId] || 0) + gi.receivedQty;
    inv.transactions.push({
      type: 'GRN', qty: gi.receivedQty, unit: gi.unit,
      date: receivedDate, reference: grnId, projectId,
    });
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(inv, null, 2));
  });
};

/* ── Auto journal entry (GR/IR) ────────────────────────────── */
const createJournalEntry = (cid, grn) => {
  const dir = jrnPath(cid);
  const n   = generateSequentialId(dir, 1);
  const id  = `SAP-JRN-${n}`;
  const jrn = {
    journalId:     id,
    documentType:  'GRN',
    referenceId:   grn.grnId,
    referenceNum:  grn.grnNumber,
    postingDate:   grn.receivedDate,
    description:   `GRN: ${grn.grnNumber} — ${grn.vendorName}`,
    entries: [
      { account: 'Inventory / Stock', debit: grn.totalValue, credit: 0,              costCenter: grn.projectId },
      { account: 'GR/IR Clearing',   debit: 0,               credit: grn.totalValue, costCenter: grn.projectId },
    ],
    companyId: grn.companyId,
    createdAt: new Date().toISOString(),
  };
  writeJSON(path.join(dir, id), `${id}`, jrn);
};

/* ── GET all GRNs ─────────────────────────────────────────── */
router.get('/', (req, res) => {
  try {
    const cid  = req.query.companyId;
    const dir  = dbPath(cid);
    const list = [];
    if (fs.existsSync(dir)) {
      fs.readdirSync(dir).forEach(folder => {
        const file = path.join(dir, folder, `${folder}.json`);
        if (fs.existsSync(file)) {
          try { list.push(JSON.parse(fs.readFileSync(file, 'utf-8'))); } catch {}
        }
      });
    }
    const pid = req.query.projectId;
    const out = pid ? list.filter(g => g.projectId === pid) : list;
    out.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json(out);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ── GET /inventory — all inventory items ─────────────────── */
router.get('/inventory', (req, res) => {
  try {
    const cid = req.query.companyId;
    const dir = invPath(cid);
    const list = [];
    if (fs.existsSync(dir)) {
      fs.readdirSync(dir).forEach(f => {
        if (!f.endsWith('.json')) return;
        const d = readJSON(path.join(dir, f));
        if (d) list.push(d);
      });
    }
    res.json(list);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ── GET single GRN ─────────────────────────────────────────── */
router.get('/:grnId', (req, res) => {
  try {
    const file = path.join(dbPath(req.query.companyId), req.params.grnId, `${req.params.grnId}.json`);
    const grn  = readJSON(file);
    if (!grn) return res.status(404).json({ error: 'GRN not found' });
    res.json(grn);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ── POST create GRN (Draft) ────────────────────────────────── */
router.post('/', (req, res) => {
  try {
    const cid = req.body.companyId || req.query.companyId;
    if (!req.body.poId) return res.status(400).json({ error: 'poId is required' });

    // Read PO
    const poFile = path.join(poPath(cid), req.body.poId, `${req.body.poId}.json`);
    const po     = readJSON(poFile);
    if (!po) return res.status(404).json({ error: 'Purchase Order not found' });
    if (po.status === 'Cancelled') return res.status(400).json({ error: 'Cannot create GRN for cancelled PO' });
    if (po.status === 'Received')  return res.status(400).json({ error: 'PO already fully received' });

    const id  = nextId(cid);
    const now = new Date().toISOString();

    // Validate received qty doesn't exceed pending
    const items    = [];
    let totalValue = 0;
    for (const gi of (req.body.items || [])) {
      const poItem = po.items.find(pi => pi.itemName === gi.itemName);
      if (!poItem) continue;
      const maxCanReceive = poItem.pendingQty || 0;
      const receivedQty   = Math.min(parseFloat(gi.receivedQty) || 0, maxCanReceive);
      const lineValue     = receivedQty * (poItem.unitPrice || 0);
      totalValue += lineValue;
      items.push({
        itemName:    gi.itemName,
        orderedQty:  poItem.orderedQty,
        pendingQty:  poItem.pendingQty,
        receivedQty,
        unit:        poItem.unit,
        unitPrice:   poItem.unitPrice,
        lineValue,
      });
    }

    const grn = {
      grnId:        id,
      grnNumber:    `SAP/GRN/${id.split('-')[2]}/${id.split('-')[3]}`,
      poId:         req.body.poId,
      poNumber:     po.poNumber,
      projectId:    po.projectId,
      vendorId:     po.vendorId,
      vendorName:   po.vendorName,
      receivedDate: req.body.receivedDate || now.slice(0, 10),
      warehouse:    req.body.warehouse    || 'Main Warehouse',
      items,
      totalValue,
      notes:        req.body.notes || '',
      status:       'Draft',  // Draft → Posted
      companyId:    cid,
      createdAt:    now,
      updatedAt:    now,
    };

    const dir = path.join(dbPath(cid), id);
    writeJSON(dir, id, grn);
    res.status(201).json(grn);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ── POST /grnId/post — Post GRN (update inventory + PO) ──── */
router.post('/:grnId/post', (req, res) => {
  try {
    const cid   = req.body.companyId || req.query.companyId;
    const grnId = req.params.grnId;
    const grnFile = path.join(dbPath(cid), grnId, `${grnId}.json`);
    const grn     = readJSON(grnFile);
    if (!grn) return res.status(404).json({ error: 'GRN not found' });
    if (grn.status === 'Posted') return res.status(400).json({ error: 'GRN already posted' });

    // Update PO received quantities
    const poFile = path.join(poPath(cid), grn.poId, `${grn.poId}.json`);
    const po     = readJSON(poFile);
    if (po) {
      grn.items.forEach(gi => {
        const poItem = po.items.find(pi => pi.itemName === gi.itemName);
        if (poItem) {
          poItem.receivedQty = (poItem.receivedQty || 0) + gi.receivedQty;
          poItem.pendingQty  = Math.max(0, (poItem.orderedQty || 0) - poItem.receivedQty);
        }
      });
      // Update PO status
      const allReceived = po.items.every(pi => (pi.pendingQty || 0) === 0);
      const anyReceived = po.items.some(pi => (pi.receivedQty || 0) > 0);
      po.status    = allReceived ? 'Received' : anyReceived ? 'Partial' : po.status;
      po.updatedAt = new Date().toISOString();
      fs.writeFileSync(poFile, JSON.stringify(po, null, 2));
    }

    // Update inventory
    updateInventory(cid, grn.projectId, grn.items, grnId, grn.receivedDate);

    // Create journal entry
    createJournalEntry(cid, grn);

    // Post GRN
    grn.status    = 'Posted';
    grn.postedAt  = new Date().toISOString();
    grn.updatedAt = new Date().toISOString();
    fs.writeFileSync(grnFile, JSON.stringify(grn, null, 2));

    res.json(grn);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
