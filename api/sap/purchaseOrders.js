/**
 * SAP MODE — Purchase Orders (MM Module)
 * Hard validation: cannot order more than balanceToOrder for any item.
 * Path: Database/Companies/{companyId}/SAP/PurchaseOrders/{poId}/{poId}.json
 */
const express = require('express');
const path    = require('path');
const fs      = require('fs');
const { getCompanyPath, generateSequentialId } = require('../helpers');

const router = express.Router();

const dbPath   = (cid) => getCompanyPath('SAP/PurchaseOrders', cid);
const projPath = (cid) => getCompanyPath('SAP/Projects', cid);

/* ── helpers ────────────────────────────────────────────────── */
const readPO = (cid, id) => {
  const file = path.join(dbPath(cid), String(id), `${id}.json`);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf-8'));
};

const writePO = (cid, id, data) => {
  const dir = path.join(dbPath(cid), String(id));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${id}.json`), JSON.stringify(data, null, 2));
};

const nextId = (cid) => {
  const n  = generateSequentialId(dbPath(cid), 1);
  const fy = (() => { const d = new Date(); return d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear()-1; })();
  return `SAP-PO-${fy}-${String(n).padStart(4, '0')}`;
};

/* ── Compute already-ordered qty for an item in a project ── */
const getOrderedQty = (cid, projectId, itemName, excludePoId = null) => {
  const dir = dbPath(cid);
  let total = 0;
  if (!fs.existsSync(dir)) return 0;
  fs.readdirSync(dir).forEach(folder => {
    const file = path.join(dir, folder, `${folder}.json`);
    if (!fs.existsSync(file)) return;
    try {
      const po = JSON.parse(fs.readFileSync(file, 'utf-8'));
      if (po.projectId !== projectId) return;
      if (po.status === 'Cancelled') return;
      if (excludePoId && po.poId === excludePoId) return;
      (po.items || []).forEach(it => {
        if (it.itemName === itemName) total += parseFloat(it.orderedQty) || 0;
      });
    } catch {}
  });
  return total;
};

/* ── GET all POs ─────────────────────────────────────────── */
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
    const out = pid ? list.filter(p => p.projectId === pid) : list;
    out.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json(out);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ── GET single PO ──────────────────────────────────────────── */
router.get('/:poId', (req, res) => {
  try {
    const po = readPO(req.query.companyId, req.params.poId);
    if (!po) return res.status(404).json({ error: 'PO not found' });
    res.json(po);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ── POST create PO ─────────────────────────────────────────── */
router.post('/', (req, res) => {
  try {
    const cid = req.body.companyId || req.query.companyId;
    if (!req.body.projectId) return res.status(400).json({ error: 'projectId is mandatory' });

    // Read project to get required quantities
    const projFile = path.join(projPath(cid), req.body.projectId, `${req.body.projectId}.json`);
    const project  = fs.existsSync(projFile) ? JSON.parse(fs.readFileSync(projFile, 'utf-8')) : null;

    const id  = nextId(cid);
    const now = new Date().toISOString();

    // Process items with hard over-order validation
    const items = [];
    const violations = [];
    for (const it of (req.body.items || [])) {
      const orderedQty = parseFloat(it.orderedQty) || 0;

      // Validate against project material requirements
      if (project) {
        const matItem = (project.materialItems || []).find(m => m.itemName === it.itemName);
        if (matItem) {
          const alreadyOrdered = getOrderedQty(cid, req.body.projectId, it.itemName);
          const requiredQty    = parseFloat(matItem.requiredQty) || 0;
          const canOrder       = requiredQty - alreadyOrdered;

          if (orderedQty > canOrder) {
            violations.push({
              itemName: it.itemName,
              required: requiredQty,
              alreadyOrdered,
              attempted: orderedQty,
              canOrder: Math.max(0, canOrder),
            });
            continue; // Skip this item
          }
        }
      }

      const unitPrice = parseFloat(it.unitPrice) || 0;
      const taxPct    = parseFloat(it.taxPct) || 0;
      const subtotal  = orderedQty * unitPrice;
      const taxAmt    = subtotal * taxPct / 100;

      items.push({
        id:           it.id || `PI-${items.length+1}`,
        itemName:     it.itemName,
        description:  it.description || '',
        orderedQty,
        receivedQty:  0,
        pendingQty:   orderedQty,
        unit:         it.unit || 'NOS',
        unitPrice,
        taxPct,
        subtotal,
        taxAmount:    taxAmt,
        lineTotal:    subtotal + taxAmt,
      });
    }

    if (violations.length > 0) {
      return res.status(400).json({
        error: 'Over-purchase validation failed',
        violations,
        message: 'Cannot order more than the balance quantity for one or more items',
      });
    }

    if (items.length === 0) return res.status(400).json({ error: 'No valid items to create PO' });

    const subtotal  = items.reduce((s, i) => s + i.subtotal, 0);
    const taxTotal  = items.reduce((s, i) => s + i.taxAmount, 0);

    const po = {
      poId:         id,
      poNumber:     `SAP/PO/${id.split('-')[2]}/${id.split('-')[3]}`,
      projectId:    req.body.projectId,
      linkedSOId:   req.body.linkedSOId || '',
      vendorId:     req.body.vendorId   || '',
      vendorName:   req.body.vendorName || '',
      orderDate:    req.body.orderDate  || now.slice(0, 10),
      expectedDate: req.body.expectedDate || '',
      deliveryAddr: req.body.deliveryAddr || '',
      paymentTerms: req.body.paymentTerms || 'Net 30',
      items,
      subtotal,
      taxTotal,
      grandTotal:   subtotal + taxTotal,
      notes:        req.body.notes  || '',
      status:       'Open',   // Open | Partial | Received | Closed | Cancelled
      companyId:    cid,
      createdAt:    now,
      updatedAt:    now,
    };

    writePO(cid, id, po);
    res.status(201).json(po);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ── PUT update PO (only Draft/Open allowed) ────────────────── */
router.put('/:poId', (req, res) => {
  try {
    const cid = req.body.companyId || req.query.companyId;
    const id  = req.params.poId;
    const existing = readPO(cid, id);
    if (!existing) return res.status(404).json({ error: 'Not found' });
    if (!['Open', 'Draft'].includes(existing.status)) {
      return res.status(400).json({ error: `Cannot edit PO in status "${existing.status}"` });
    }

    const updated = {
      ...existing,
      vendorId:     req.body.vendorId      ?? existing.vendorId,
      vendorName:   req.body.vendorName    ?? existing.vendorName,
      expectedDate: req.body.expectedDate  ?? existing.expectedDate,
      paymentTerms: req.body.paymentTerms  ?? existing.paymentTerms,
      notes:        req.body.notes         ?? existing.notes,
      status:       req.body.status        ?? existing.status,
      updatedAt:    new Date().toISOString(),
    };
    writePO(cid, id, updated);
    res.json(updated);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ── PATCH cancel PO ────────────────────────────────────────── */
router.patch('/:poId/cancel', (req, res) => {
  try {
    const cid = req.body.companyId || req.query.companyId;
    const po  = readPO(cid, req.params.poId);
    if (!po) return res.status(404).json({ error: 'Not found' });
    if (po.status === 'Received') return res.status(400).json({ error: 'Cannot cancel a fully received PO' });
    const updated = { ...po, status: 'Cancelled', updatedAt: new Date().toISOString() };
    writePO(cid, req.params.poId, updated);
    res.json(updated);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
