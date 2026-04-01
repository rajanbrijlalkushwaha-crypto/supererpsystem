/**
 * SAP MODE — Production Entry (PP Module lite)
 * Flow: Material Issue → Production → Produced Qty update → Inventory update
 */
const express = require('express');
const path    = require('path');
const fs      = require('fs');
const { getCompanyPath, generateSequentialId } = require('../helpers');

const router = express.Router();

const dbPath  = (cid) => getCompanyPath('SAP/Production', cid);
const invPath = (cid) => getCompanyPath('SAP/Inventory', cid);
const jrnPath = (cid) => getCompanyPath('SAP/Journals', cid);

const readJSON = (file) => { try { return JSON.parse(fs.readFileSync(file, 'utf-8')); } catch { return null; } };
const writeRec = (dir, id, data) => { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, `${id}.json`), JSON.stringify(data, null, 2)); };
const nextId   = (cid) => `SAP-PROD-${generateSequentialId(dbPath(cid), 1).toString().padStart(4,'0')}`;

/* ── Deduct issued materials from inventory ─────────────────── */
const issueFromInventory = (cid, projectId, materialIssues, prodId) => {
  materialIssues.forEach(mi => {
    const key  = mi.itemName.replace(/[^a-zA-Z0-9]/g, '_');
    const file = path.join(invPath(cid), `${key}.json`);
    const inv  = readJSON(file);
    if (!inv) return;
    inv.totalStock = Math.max(0, (inv.totalStock || 0) - mi.issuedQty);
    if (inv.projectAllocations) {
      inv.projectAllocations[projectId] = Math.max(0, (inv.projectAllocations[projectId] || 0) - mi.issuedQty);
    }
    inv.transactions = inv.transactions || [];
    inv.transactions.push({ type: 'Issue', qty: -mi.issuedQty, date: new Date().toISOString().slice(0,10), reference: prodId, projectId });
    fs.writeFileSync(file, JSON.stringify(inv, null, 2));
  });
};

/* ── Add produced item to inventory ─────────────────────────── */
const addProducedToInventory = (cid, projectId, itemName, unit, qty, prodId) => {
  const key  = itemName.replace(/[^a-zA-Z0-9]/g, '_');
  const dir  = invPath(cid);
  const file = path.join(dir, `${key}.json`);
  fs.mkdirSync(dir, { recursive: true });
  const inv  = readJSON(file) || { itemName, unit, totalStock: 0, projectAllocations: {}, transactions: [] };
  inv.totalStock = (inv.totalStock || 0) + qty;
  inv.projectAllocations[projectId] = (inv.projectAllocations[projectId] || 0) + qty;
  inv.transactions.push({ type: 'Production', qty, date: new Date().toISOString().slice(0,10), reference: prodId, projectId });
  fs.writeFileSync(file, JSON.stringify(inv, null, 2));
};

/* ── GET all production entries ────────────────────────────── */
router.get('/', (req, res) => {
  try {
    const cid = req.query.companyId;
    const dir = dbPath(cid);
    const list = [];
    if (fs.existsSync(dir)) {
      fs.readdirSync(dir).forEach(folder => {
        const file = path.join(dir, folder, `${folder}.json`);
        if (fs.existsSync(file)) { try { list.push(JSON.parse(fs.readFileSync(file,'utf-8'))); } catch {} }
      });
    }
    const pid = req.query.projectId;
    res.json(pid ? list.filter(p => p.projectId === pid) : list);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ── POST create production entry ─────────────────────────── */
router.post('/', (req, res) => {
  try {
    const cid = req.body.companyId || req.query.companyId;
    const id  = nextId(cid);
    const now = new Date().toISOString();
    const entry = {
      prodId:          id,
      projectId:       req.body.projectId,
      itemName:        req.body.itemName,
      plannedQty:      parseFloat(req.body.plannedQty) || 0,
      producedQty:     0,
      unit:            req.body.unit || 'NOS',
      materialIssues:  req.body.materialIssues || [],
      status:          'Planned',  // Planned | InProgress | Completed
      startDate:       req.body.startDate || now.slice(0,10),
      completionDate:  '',
      notes:           req.body.notes || '',
      companyId:       cid,
      createdAt:       now,
      updatedAt:       now,
    };
    writeRec(path.join(dbPath(cid), id), id, entry);
    res.status(201).json(entry);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ── POST /prodId/complete — Mark production complete ───────── */
router.post('/:prodId/complete', (req, res) => {
  try {
    const cid    = req.body.companyId || req.query.companyId;
    const prodId = req.params.prodId;
    const file   = path.join(dbPath(cid), prodId, `${prodId}.json`);
    const entry  = readJSON(file);
    if (!entry) return res.status(404).json({ error: 'Not found' });
    if (entry.status === 'Completed') return res.status(400).json({ error: 'Already completed' });

    const producedQty      = parseFloat(req.body.producedQty) || entry.plannedQty;
    const materialIssues   = req.body.materialIssues || entry.materialIssues || [];

    // Deduct consumed raw materials from inventory
    issueFromInventory(cid, entry.projectId, materialIssues, prodId);

    // Add produced item to inventory
    addProducedToInventory(cid, entry.projectId, entry.itemName, entry.unit, producedQty, prodId);

    const updated = {
      ...entry,
      producedQty,
      materialIssues,
      status:         'Completed',
      completionDate: new Date().toISOString().slice(0,10),
      updatedAt:      new Date().toISOString(),
    };
    fs.writeFileSync(file, JSON.stringify(updated, null, 2));
    res.json(updated);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
