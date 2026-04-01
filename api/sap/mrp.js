/**
 * SAP MODE — MRP (Material Requirements Planning) Engine
 * Core Logic: requiredQty - purchasedQty = balanceQty
 * Also handles BOM explosion for Manufactured items.
 *
 * GET /api/sap/mrp/:projectId/balance
 *   Returns each material with requiredQty, orderedQty, receivedQty, balanceToOrder, balanceToReceive
 *
 * GET /api/sap/mrp/:projectId/bom-explosion
 *   Explodes all Manufactured items into their raw material requirements
 */
const express = require('express');
const path    = require('path');
const fs      = require('fs');
const { getCompanyPath } = require('../helpers');

const router = express.Router();

/* ── helpers ────────────────────────────────────────────────── */
const readJSON = (file) => {
  if (!fs.existsSync(file)) return null;
  try { return JSON.parse(fs.readFileSync(file, 'utf-8')); } catch { return null; }
};

const readProject = (cid, projectId) => {
  const dir  = getCompanyPath('SAP/Projects', cid);
  const file = path.join(dir, projectId, `${projectId}.json`);
  return readJSON(file);
};

const readAllPOs = (cid, projectId) => {
  const dir  = getCompanyPath('SAP/PurchaseOrders', cid);
  const list = [];
  if (!fs.existsSync(dir)) return list;
  fs.readdirSync(dir).forEach(folder => {
    const file = path.join(dir, folder, `${folder}.json`);
    const po   = readJSON(file);
    if (po && po.projectId === projectId && po.status !== 'Cancelled') list.push(po);
  });
  return list;
};

const readAllGRNs = (cid, projectId) => {
  const dir  = getCompanyPath('SAP/GRN', cid);
  const list = [];
  if (!fs.existsSync(dir)) return list;
  fs.readdirSync(dir).forEach(folder => {
    const file = path.join(dir, folder, `${folder}.json`);
    const grn  = readJSON(file);
    if (grn && grn.projectId === projectId && grn.status === 'Posted') list.push(grn);
  });
  return list;
};

/* ── BOM Explosion ──────────────────────────────────────────── */
/**
 * For each Manufactured item, multiply its BOM lines by qty.
 * Returns a flat list of raw-material requirements.
 */
const explodeBOM = (materialItems) => {
  const rawMap = {}; // itemName → { itemName, requiredQty, unit }

  materialItems.forEach(mat => {
    if (mat.type === 'Manufactured' && Array.isArray(mat.bomLines)) {
      mat.bomLines.forEach(bl => {
        const key = bl.rawMaterial;
        const qty = (parseFloat(bl.qty) || 0) * (parseFloat(mat.requiredQty) || 1);
        if (!rawMap[key]) rawMap[key] = { itemName: key, unit: bl.unit || 'NOS', requiredQty: 0 };
        rawMap[key].requiredQty += qty;
      });
    }
  });

  return Object.values(rawMap);
};

/* ── Balance Calculation ────────────────────────────────────── */
const calcBalance = (project, pos, grns) => {
  const result = [];

  (project.materialItems || []).forEach(mat => {
    const itemName = mat.itemName;

    // Sum ordered qty from all POs for this item
    let orderedQty = 0;
    pos.forEach(po => {
      (po.items || []).forEach(pi => {
        if (pi.itemName === itemName) orderedQty += parseFloat(pi.orderedQty) || 0;
      });
    });

    // Sum received qty from all GRNs for this item
    let receivedQty = 0;
    grns.forEach(grn => {
      (grn.items || []).forEach(gi => {
        if (gi.itemName === itemName) receivedQty += parseFloat(gi.receivedQty) || 0;
      });
    });

    const requiredQty     = parseFloat(mat.requiredQty) || 0;
    const balanceToOrder  = Math.max(0, requiredQty - orderedQty);
    const balanceToReceive = Math.max(0, orderedQty - receivedQty);
    const overOrdered     = orderedQty > requiredQty;

    result.push({
      itemName,
      type:            mat.type,
      unit:            mat.unit,
      unitGroup:       mat.unitGroup || '',
      requiredQty,
      orderedQty,
      receivedQty,
      balanceToOrder,
      balanceToReceive,
      overOrdered,
      fulfillmentPct:  requiredQty > 0 ? Math.min(100, Math.round(receivedQty / requiredQty * 100)) : 0,
    });
  });

  return result;
};

/* ── GET material balance ───────────────────────────────────── */
router.get('/:projectId/balance', (req, res) => {
  try {
    const cid       = req.query.companyId;
    const { projectId } = req.params;

    const project = readProject(cid, projectId);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const pos  = readAllPOs(cid, projectId);
    const grns = readAllGRNs(cid, projectId);

    const balance = calcBalance(project, pos, grns);

    res.json({
      projectId,
      projectName:    project.projectName,
      materialCount:  balance.length,
      pendingItems:   balance.filter(b => b.balanceToOrder > 0).length,
      fullyOrdered:   balance.filter(b => b.balanceToOrder === 0 && b.requiredQty > 0).length,
      items:          balance,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ── GET BOM explosion ──────────────────────────────────────── */
router.get('/:projectId/bom-explosion', (req, res) => {
  try {
    const cid     = req.query.companyId;
    const project = readProject(cid, req.params.projectId);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const rawMaterials = explodeBOM(project.materialItems || []);

    // Also include Purchase items
    const purchaseItems = (project.materialItems || [])
      .filter(m => m.type === 'Purchase')
      .map(m => ({ itemName: m.itemName, requiredQty: m.requiredQty, unit: m.unit, fromType: 'Direct' }));

    res.json({
      projectId: req.params.projectId,
      projectName: project.projectName,
      bomExplosion: rawMaterials,
      directPurchase: purchaseItems,
      totalItems: rawMaterials.length + purchaseItems.length,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ── GET document flow for a project ───────────────────────── */
router.get('/:projectId/document-flow', (req, res) => {
  try {
    const cid       = req.query.companyId;
    const { projectId } = req.params;

    const project = readProject(cid, projectId);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    // Read linked SOs
    const soDir = getCompanyPath('SAP/SalesOrders', cid);
    const sos   = [];
    if (fs.existsSync(soDir)) {
      fs.readdirSync(soDir).forEach(folder => {
        const file = path.join(soDir, folder, `${folder}.json`);
        const so   = readJSON(file);
        if (so && so.projectId === projectId) sos.push(so);
      });
    }

    const pos  = readAllPOs(cid, projectId);
    const grns = readAllGRNs(cid, projectId);

    // Read productions
    const prodDir = getCompanyPath('SAP/Production', cid);
    const prods   = [];
    if (fs.existsSync(prodDir)) {
      fs.readdirSync(prodDir).forEach(folder => {
        const file = path.join(prodDir, folder, `${folder}.json`);
        const pr   = readJSON(file);
        if (pr && pr.projectId === projectId) prods.push(pr);
      });
    }

    // Read invoices
    const invDir = getCompanyPath('SAP/Invoices', cid);
    const invoices = [];
    if (fs.existsSync(invDir)) {
      fs.readdirSync(invDir).forEach(folder => {
        const file = path.join(invDir, folder, `${folder}.json`);
        const inv  = readJSON(file);
        if (inv && inv.projectId === projectId) invoices.push(inv);
      });
    }

    // Read payments
    const payDir = getCompanyPath('SAP/Payments', cid);
    const payments = [];
    if (fs.existsSync(payDir)) {
      fs.readdirSync(payDir).forEach(folder => {
        const file = path.join(payDir, folder, `${folder}.json`);
        const pay  = readJSON(file);
        if (pay && pay.projectId === projectId) payments.push(pay);
      });
    }

    res.json({
      project: {
        projectId: project.projectId,
        projectName: project.projectName,
        status: project.status,
        clientName: project.clientName,
        budget: project.budget,
      },
      flow: {
        salesOrders:    sos.map(s => ({ id: s.soId, number: s.soNumber, status: s.status, amount: s.grandTotal, date: s.orderDate })),
        purchaseOrders: pos.map(p => ({ id: p.poId, number: p.poNumber, status: p.status, amount: p.grandTotal, vendor: p.vendorName, date: p.orderDate })),
        grn:            grns.map(g => ({ id: g.grnId, number: g.grnNumber, status: g.status, date: g.receivedDate })),
        production:     prods.map(p => ({ id: p.prodId, itemName: p.itemName, producedQty: p.producedQty, status: p.status })),
        invoices:       invoices.map(i => ({ id: i.invId, number: i.invNumber, status: i.status, amount: i.grandTotal, date: i.invoiceDate })),
        payments:       payments.map(p => ({ id: p.payId, amount: p.amount, date: p.paymentDate, mode: p.paymentMode })),
      },
      summary: {
        soCount:  sos.length,
        poCount:  pos.length,
        grnCount: grns.length,
        prodCount: prods.length,
        invCount:  invoices.length,
        payCount:  payments.length,
        soValue:   sos.reduce((s, o) => s + (o.grandTotal||0), 0),
        poValue:   pos.reduce((s, o) => s + (o.grandTotal||0), 0),
        paidValue: payments.reduce((s, p) => s + (p.amount||0), 0),
      },
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
