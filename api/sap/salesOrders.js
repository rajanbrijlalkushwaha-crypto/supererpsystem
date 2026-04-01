/**
 * SAP MODE — Sales Orders (SD module)
 * SO is the ENTRY POINT of the document flow.
 * If no projectId → auto-create project from SO data.
 * Path: Database/Companies/{companyId}/SAP/SalesOrders/{soId}/{soId}.json
 */
const express = require('express');
const path    = require('path');
const fs      = require('fs');
const { getCompanyPath, generateSequentialId } = require('../helpers');

const router = express.Router();

const dbPath   = (cid) => getCompanyPath('SAP/SalesOrders', cid);
const projPath = (cid) => getCompanyPath('SAP/Projects', cid);

/* ── helpers ────────────────────────────────────────────────── */
const readSO = (cid, id) => {
  const file = path.join(dbPath(cid), String(id), `${id}.json`);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf-8'));
};

const writeSO = (cid, id, data) => {
  const dir = path.join(dbPath(cid), String(id));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${id}.json`), JSON.stringify(data, null, 2));
};

const nextSOId = (cid) => {
  const n  = generateSequentialId(dbPath(cid), 1);
  const fy = (() => { const d = new Date(); return d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear()-1; })();
  return `SAP-SO-${fy}-${String(n).padStart(4, '0')}`;
};

const nextProjId = (cid) => {
  const n = generateSequentialId(projPath(cid), 1);
  return `PROJ-${String(n).padStart(4, '0')}`;
};

const genSONumber = (id) => {
  const parts = id.split('-');
  return `SAP/SO/${parts[2]}/${parts[3]}`;
};

/* ── Auto-create project from SO data ───────────────────────── */
const autoCreateProject = (cid, soData, projId, now) => {
  const proj = {
    projectId:    projId,
    projectName:  soData.projectName || `Project — ${soData.clientName}`,
    clientId:     soData.clientId    || '',
    clientName:   soData.clientName  || '',
    location:     soData.location    || '',
    projectType:  soData.projectType || 'Trading',
    startDate:    soData.orderDate   || now.slice(0, 10),
    endDate:      soData.deliveryDate || '',
    status:       'Active',
    budget:       0,
    scopeItems:   [],
    materialItems: soData.materialItems || [],
    tasks:        [],
    salesOrderIds:[],
    companyId:    soData.companyId,
    autoCreated:  true,
    createdAt:    now,
    updatedAt:    now,
  };
  const dir = path.join(projPath(cid), projId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${projId}.json`), JSON.stringify(proj, null, 2));
  return proj;
};

/* ── GET all SOs ─────────────────────────────────────────────── */
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
    const projectId = req.query.projectId;
    const filtered  = projectId ? list.filter(s => s.projectId === projectId) : list;
    filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json(filtered);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ── GET single SO ──────────────────────────────────────────── */
router.get('/:soId', (req, res) => {
  try {
    const so = readSO(req.query.companyId, req.params.soId);
    if (!so) return res.status(404).json({ error: 'Sales order not found' });
    res.json(so);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ── POST create SO ─────────────────────────────────────────── */
/* If projectId is missing → auto-create project first           */
router.post('/', (req, res) => {
  try {
    const cid = req.body.companyId || req.query.companyId;
    const now = new Date().toISOString();

    let projectId    = req.body.projectId || '';
    let projectCreated = null;

    /* ── Auto-create project if not provided ── */
    if (!projectId) {
      if (!req.body.clientName) return res.status(400).json({ error: 'clientName is required to auto-create project' });
      projectId = nextProjId(cid);
      projectCreated = autoCreateProject(cid, { ...req.body, companyId: cid }, projectId, now);
    } else {
      /* Verify the project exists */
      const projFile = path.join(projPath(cid), projectId, `${projectId}.json`);
      if (!fs.existsSync(projFile)) return res.status(400).json({ error: `Project ${projectId} not found` });
    }

    const id = nextSOId(cid);

    /* Compute line totals */
    const items = (req.body.items || []).map(it => {
      const qty       = parseFloat(it.qty) || 0;
      const unitPrice = parseFloat(it.unitPrice) || 0;
      const taxPct    = parseFloat(it.taxPct) || 0;
      const subtotal  = qty * unitPrice;
      const taxAmt    = subtotal * taxPct / 100;
      return { ...it, qty, unitPrice, taxPct, subtotal, taxAmount: taxAmt, lineTotal: subtotal + taxAmt };
    });

    const subtotal   = items.reduce((s, i) => s + i.subtotal, 0);
    const taxTotal   = items.reduce((s, i) => s + i.taxAmount, 0);
    const grandTotal = subtotal + taxTotal;

    const so = {
      soId:         id,
      soNumber:     genSONumber(id),
      projectId,
      clientId:     req.body.clientId     || '',
      clientName:   req.body.clientName   || '',
      orderDate:    req.body.orderDate    || now.slice(0, 10),
      deliveryDate: req.body.deliveryDate || '',
      paymentTerms: req.body.paymentTerms || 'Net 30',
      items,
      subtotal,
      taxTotal,
      grandTotal,
      notes:        req.body.notes  || '',
      status:       'Draft',  // Draft | Confirmed | Invoiced | Closed
      companyId:    cid,
      createdAt:    now,
      updatedAt:    now,
    };

    writeSO(cid, id, so);

    /* Link SO → project */
    const projFile = path.join(projPath(cid), projectId, `${projectId}.json`);
    if (fs.existsSync(projFile)) {
      const proj = JSON.parse(fs.readFileSync(projFile, 'utf-8'));
      proj.salesOrderIds = [...(proj.salesOrderIds || []), id];
      proj.updatedAt     = now;
      /* If project has materialItems in SO, merge them */
      if ((req.body.materialItems || []).length > 0) {
        proj.materialItems = req.body.materialItems;
      }
      fs.writeFileSync(projFile, JSON.stringify(proj, null, 2));
    }

    res.status(201).json({ ...so, projectCreated });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ── PATCH confirm SO ───────────────────────────────────────── */
router.patch('/:soId/confirm', (req, res) => {
  try {
    const cid = req.body.companyId || req.query.companyId;
    const so  = readSO(cid, req.params.soId);
    if (!so) return res.status(404).json({ error: 'Not found' });
    const updated = { ...so, status: 'Confirmed', updatedAt: new Date().toISOString() };
    writeSO(cid, so.soId, updated);
    res.json(updated);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ── PUT update SO ──────────────────────────────────────────── */
router.put('/:soId', (req, res) => {
  try {
    const cid = req.body.companyId || req.query.companyId;
    const id  = req.params.soId;
    const existing = readSO(cid, id);
    if (!existing) return res.status(404).json({ error: 'Not found' });

    const items = (req.body.items ?? existing.items).map(it => {
      const qty       = parseFloat(it.qty) || 0;
      const unitPrice = parseFloat(it.unitPrice) || 0;
      const taxPct    = parseFloat(it.taxPct) || 0;
      const subtotal  = qty * unitPrice;
      const taxAmt    = subtotal * taxPct / 100;
      return { ...it, qty, unitPrice, taxPct, subtotal, taxAmount: taxAmt, lineTotal: subtotal + taxAmt };
    });
    const subtotal  = items.reduce((s, i) => s + i.subtotal, 0);
    const taxTotal  = items.reduce((s, i) => s + i.taxAmount, 0);

    const updated = {
      ...existing,
      clientId:     req.body.clientId     ?? existing.clientId,
      clientName:   req.body.clientName   ?? existing.clientName,
      orderDate:    req.body.orderDate     ?? existing.orderDate,
      deliveryDate: req.body.deliveryDate  ?? existing.deliveryDate,
      paymentTerms: req.body.paymentTerms  ?? existing.paymentTerms,
      notes:        req.body.notes         ?? existing.notes,
      status:       req.body.status        ?? existing.status,
      items,
      subtotal,
      taxTotal,
      grandTotal: subtotal + taxTotal,
      updatedAt:  new Date().toISOString(),
    };
    writeSO(cid, id, updated);
    res.json(updated);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
