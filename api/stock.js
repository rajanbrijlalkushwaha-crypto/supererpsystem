/**
 * stock.js — GRN / GDN based inventory management
 *
 * GRN (Goods Receipt Note)  — stock IN  — stored in Stock/{txnId}.json with type:'grn'
 * GDN (Goods Delivery Note) — stock OUT — stored in Stock/{txnId}.json with type:'gdn'
 *
 * Each record has an `items` array:
 *   [{ itemCode, itemName, qty, unit, location }]
 *
 * Stock level per item = SUM(grn qty) - SUM(gdn qty)
 */
const express = require('express');
const path    = require('path');
const fs      = require('fs');
const { ROOT, saveJson } = require('./helpers');

const router = express.Router();

const stockDir  = (cid)     => path.join(ROOT, 'Database', 'Companies', cid, 'Stock');
const stockFile = (cid, id) => path.join(stockDir(cid), `${id}.json`);

const ensureDir = (d) => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); };

const readAll = (dir) => {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.json'))
    .map(f => { try { return JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8')); } catch { return null; } })
    .filter(Boolean);
};

const nextId = (dir, base = 100001) => {
  if (!fs.existsSync(dir)) return base;
  let max = base - 1;
  fs.readdirSync(dir).forEach(f => {
    const n = parseInt(f, 10);
    if (!isNaN(n) && n > max) max = n;
  });
  return max + 1;
};

const cid = (req) => req.query.companyId || req.body?.companyId || '';

/* ── normalise old single-item records to items[] format ── */
const normaliseItems = (rec) => {
  if (Array.isArray(rec.items) && rec.items.length > 0) return rec.items;
  // legacy single-item record
  if (rec.itemCode) {
    return [{ itemCode: rec.itemCode, itemName: rec.itemName || '', qty: parseFloat(rec.qty) || 0,
               unit: rec.unit || '', location: rec.location || 'Default' }];
  }
  return [];
};

/* ═══════════════════════════════════════════════════════
   GET /levels  — current stock per item (aggregated)
═══════════════════════════════════════════════════════ */
router.get('/levels', (req, res) => {
  try {
    const companyId = cid(req);
    if (!companyId) return res.status(400).json({ error: 'companyId required' });

    const transactions = readAll(stockDir(companyId));
    const map = {};   // itemCode → { itemName, unit, totalIn, totalOut, locations:{loc→{in,out}} }

    transactions.forEach(t => {
      const isIn = t.type === 'grn' || t.type === 'in';
      normaliseItems(t).forEach(it => {
        const key = String(it.itemCode);
        if (!map[key]) map[key] = { itemCode: it.itemCode, itemName: it.itemName || '', unit: it.unit || '', totalIn: 0, totalOut: 0, locations: {} };
        const qty = parseFloat(it.qty) || 0;
        if (isIn)  map[key].totalIn  += qty;
        else       map[key].totalOut += qty;
        const loc = it.location || 'Default';
        if (!map[key].locations[loc]) map[key].locations[loc] = { in: 0, out: 0 };
        if (isIn) map[key].locations[loc].in  += qty;
        else      map[key].locations[loc].out += qty;
      });
    });

    const levels = Object.values(map).map(r => ({
      ...r,
      currentStock: r.totalIn - r.totalOut,
      locationBreakdown: Object.entries(r.locations).map(([loc, v]) => ({
        location: loc, totalIn: v.in, totalOut: v.out, currentStock: v.in - v.out,
      })),
    })).sort((a, b) => String(a.itemCode).localeCompare(String(b.itemCode)));

    res.json(levels);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ═══════════════════════════════════════════════════════
   GET /grn   — list all GRN records
═══════════════════════════════════════════════════════ */
router.get('/grn', (req, res) => {
  try {
    const companyId = cid(req);
    if (!companyId) return res.status(400).json({ error: 'companyId required' });
    const all = readAll(stockDir(companyId))
      .filter(r => r.type === 'grn' || r.type === 'in')
      .sort((a, b) => (b.txnId || 0) - (a.txnId || 0));
    res.json(all);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ═══════════════════════════════════════════════════════
   GET /gdn   — list all GDN records
═══════════════════════════════════════════════════════ */
router.get('/gdn', (req, res) => {
  try {
    const companyId = cid(req);
    if (!companyId) return res.status(400).json({ error: 'companyId required' });
    const all = readAll(stockDir(companyId))
      .filter(r => r.type === 'gdn' || r.type === 'out')
      .sort((a, b) => (b.txnId || 0) - (a.txnId || 0));
    res.json(all);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ═══════════════════════════════════════════════════════
   POST /grn  — create Goods Receipt Note
═══════════════════════════════════════════════════════ */
router.post('/grn', (req, res) => {
  try {
    const companyId = cid(req);
    if (!companyId) return res.status(400).json({ error: 'companyId required' });

    const { date, sourceType, partyType, partyId, partyName,
            poRef, dcNo, vehicleNo, notes, items } = req.body;

    if (!Array.isArray(items) || items.length === 0)
      return res.status(400).json({ error: 'At least one item is required' });

    const validItems = items.filter(it => it.itemCode && parseFloat(it.qty) > 0);
    if (validItems.length === 0)
      return res.status(400).json({ error: 'All items must have itemCode and qty > 0' });

    const dir = stockDir(companyId);
    ensureDir(dir);
    const txnId = nextId(dir);
    const now = new Date().toISOString();
    const rec = {
      txnId, type: 'grn',
      grnNo: `GRN-${txnId}`,
      date: date || now.slice(0, 10),
      sourceType: sourceType || 'purchase',
      partyType: partyType || 'vendor',
      partyId: partyId || '',
      partyName: partyName || '',
      poRef: poRef || '',
      dcNo: dcNo || '',
      vehicleNo: vehicleNo || '',
      notes: notes || '',
      items: validItems.map(it => ({
        itemCode: it.itemCode,
        itemName: it.itemName || '',
        qty: parseFloat(it.qty),
        unit: it.unit || '',
        location: it.location || 'Default',
        rate: parseFloat(it.rate) || 0,
      })),
      companyId, createdAt: now,
    };
    saveJson(stockFile(companyId, txnId), rec);
    res.json({ success: true, txnId, grnNo: rec.grnNo, message: `GRN recorded — ${rec.grnNo}` });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ═══════════════════════════════════════════════════════
   POST /gdn  — create Goods Delivery Note
═══════════════════════════════════════════════════════ */
router.post('/gdn', (req, res) => {
  try {
    const companyId = cid(req);
    if (!companyId) return res.status(400).json({ error: 'companyId required' });

    const { date, destinationType, partyType, partyId, partyName,
            fromType, dispatchFrom, preparedBy,
            fromVendorId, fromVendorName, fromPOId, fromPONo,
            soRef, poRef, orderRef, dcNo, refDate, vehicleNo, notes, items } = req.body;

    if (!Array.isArray(items) || items.length === 0)
      return res.status(400).json({ error: 'At least one item is required' });

    const validItems = items.filter(it => it.itemCode && parseFloat(it.qty) > 0);
    if (validItems.length === 0)
      return res.status(400).json({ error: 'All items must have itemCode and qty > 0' });

    // Check available stock for each item
    const transactions = readAll(stockDir(companyId));
    const stockMap = {};
    transactions.forEach(t => {
      const isIn = t.type === 'grn' || t.type === 'in';
      normaliseItems(t).forEach(it => {
        const key = String(it.itemCode);
        if (!stockMap[key]) stockMap[key] = 0;
        stockMap[key] += isIn ? (parseFloat(it.qty) || 0) : -(parseFloat(it.qty) || 0);
      });
    });

    for (const it of validItems) {
      const avail = stockMap[String(it.itemCode)] || 0;
      if (parseFloat(it.qty) > avail)
        return res.status(400).json({
          error: `Insufficient stock for "${it.itemName || it.itemCode}". Available: ${avail} ${it.unit || ''}`,
        });
    }

    const dir = stockDir(companyId);
    ensureDir(dir);
    const txnId = nextId(dir);
    const now = new Date().toISOString();
    const rec = {
      txnId, type: 'gdn',
      gdnNo: `GDN-${txnId}`,
      date: date || now.slice(0, 10),
      fromType: fromType || 'store',
      dispatchFrom: dispatchFrom || '',
      fromVendorId: fromVendorId || '',
      fromVendorName: fromVendorName || '',
      fromPOId: fromPOId || '',
      fromPONo: fromPONo || '',
      preparedBy: preparedBy || '',
      destinationType: destinationType || 'client',
      partyType: partyType || 'client',
      partyId: partyId || '',
      partyName: partyName || '',
      soRef: soRef || '',
      poRef: poRef || '',
      orderRef: orderRef || '',
      dcNo: dcNo || '',
      refDate: refDate || '',
      vehicleNo: vehicleNo || '',
      notes: notes || '',
      items: validItems.map(it => ({
        itemCode: it.itemCode,
        itemName: it.itemName || '',
        qty: parseFloat(it.qty),
        unit: it.unit || '',
        location: it.location || 'Default',
      })),
      companyId, createdAt: now,
    };
    saveJson(stockFile(companyId, txnId), rec);
    res.json({ success: true, txnId, gdnNo: rec.gdnNo, message: `GDN recorded — ${rec.gdnNo}` });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ═══════════════════════════════════════════════════════
   DELETE /transactions/:id
═══════════════════════════════════════════════════════ */
router.delete('/transactions/:id', (req, res) => {
  try {
    const companyId = cid(req);
    const fp = stockFile(companyId, req.params.id);
    if (!fs.existsSync(fp)) return res.status(404).json({ error: 'Not found' });
    fs.unlinkSync(fp);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* keep legacy single-item endpoints for backward compat */
router.post('/in',  (req, res) => {
  req.body.items = [{ itemCode: req.body.itemCode, itemName: req.body.itemName,
    qty: req.body.qty, unit: req.body.unit, location: req.body.location || 'Default' }];
  req.body.sourceType = 'other'; req.body.type = 'grn';
  router.handle({ ...req, url: '/grn', method: 'POST' }, res, () => {});
});
router.post('/out', (req, res) => {
  req.body.items = [{ itemCode: req.body.itemCode, itemName: req.body.itemName,
    qty: req.body.qty, unit: req.body.unit, location: req.body.location || 'Default' }];
  req.body.destinationType = 'other'; req.body.type = 'gdn';
  router.handle({ ...req, url: '/gdn', method: 'POST' }, res, () => {});
});

module.exports = router;
