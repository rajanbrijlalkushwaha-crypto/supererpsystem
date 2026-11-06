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
/* Build a GRN record from whichever field names the caller used — the
   Stock module's own form (StockIn.jsx) and the Purchase Bill module's
   GRN tab (PurchaseBill.jsx) send slightly different shapes; this is the
   single place both now write through, so both get normalised here. */
function buildGrnRecord(companyId, txnId, body) {
  const { date, receiptDate, sourceType, partyType, partyId, partyName,
          poRef, dcNo, vehicleNo, notes, remarks, items,
          clientId, clientName, soId, soNo, poId, poNo, withoutPO,
          vendorId, vendorName, vendorInvoiceNo, vendorInvoiceDate,
          receiveLocationType, receiveAt, receiveDetails, receivedBy,
          deliveryType, deliveryLocation, toVendorName } = body;

  const validItems = (items || [])
    .map(it => ({ ...it, itemCode: it.itemCode || it.itemName || '',
      qty: parseFloat(it.qty ?? it.receivedQty ?? it.orderedQty) || 0 }))
    .filter(it => it.itemCode && it.qty > 0);

  const now = new Date().toISOString();
  const effDate = date || receiptDate || now.slice(0, 10);
  return {
    txnId, grnId: txnId, type: 'grn',
    grnNo: `GRN-${txnId}`,
    date: effDate, receiptDate: effDate,
    /* SO / PO references */
    clientId:   clientId   || '',
    clientName: clientName || '',
    soId:       soId       || '',
    soNo:       soNo       || '',
    poId:       poId       || '',
    poNo:       poNo       || '',
    withoutPO:  !!withoutPO,
    /* vendor */
    vendorId:           vendorId           || partyId   || '',
    vendorName:         vendorName         || partyName || '',
    vendorInvoiceNo:    vendorInvoiceNo    || '',
    vendorInvoiceDate:  vendorInvoiceDate  || '',
    /* legacy / compat */
    sourceType: sourceType || 'purchase',
    partyType:  partyType  || 'vendor',
    partyId:    vendorId   || partyId   || '',
    partyName:  vendorName || partyName || '',
    poRef:      poNo       || poRef     || '',
    dcNo:       dcNo       || '',
    vehicleNo:  vehicleNo  || '',
    /* location — either a warehouse receipt, or straight to a client /
       another vendor (drop-ship, never touches our yard) */
    receiveLocationType: receiveLocationType || 'warehouse',
    receiveAt:    receiveAt    || '',
    receiveDetails: receiveDetails || '',
    receivedBy:   receivedBy   || '',
    deliveryType:     deliveryType     || 'our-yard', // 'our-yard'|'direct-client'|'to-vendor'
    deliveryLocation: deliveryLocation || '',
    toVendorName:     toVendorName     || '',
    notes: notes || remarks || '',
    remarks: notes || remarks || '',
    items: validItems.map(it => ({
      itemCode: it.itemCode,
      itemName: it.itemName || '',
      hsnCode:  it.hsnCode  || '',
      qty:      it.qty,
      receivedQty: it.qty,
      orderedQty:  parseFloat(it.orderedQty) || it.qty,
      unit:     it.unit     || '',
      location: it.location || receiveAt || 'Default',
      rate:     parseFloat(it.rate) || 0,
      remarks:  it.remarks  || '',
    })),
    companyId, createdAt: now,
  };
}

router.post('/grn', (req, res) => {
  try {
    const companyId = cid(req);
    if (!companyId) return res.status(400).json({ error: 'companyId required' });
    if (!Array.isArray(req.body.items) || req.body.items.length === 0)
      return res.status(400).json({ error: 'At least one item is required' });

    const dir = stockDir(companyId);
    ensureDir(dir);
    const txnId = nextId(dir);
    const rec = buildGrnRecord(companyId, txnId, req.body);
    if (rec.items.length === 0)
      return res.status(400).json({ error: 'All items must have a name/code and qty > 0' });

    saveJson(stockFile(companyId, txnId), rec);
    res.json({ success: true, txnId, grnId: txnId, grnNo: rec.grnNo, message: `GRN recorded — ${rec.grnNo}` });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* Edit an existing GRN (Purchase Bill module's GRN tab supports editing) */
router.put('/grn/:txnId', (req, res) => {
  try {
    const companyId = cid(req);
    if (!companyId) return res.status(400).json({ error: 'companyId required' });
    const txnId = parseInt(req.params.txnId, 10);
    const file = stockFile(companyId, txnId);
    if (!fs.existsSync(file)) return res.status(404).json({ error: 'GRN not found' });
    const rec = buildGrnRecord(companyId, txnId, req.body);
    saveJson(file, { ...rec, updatedAt: new Date().toISOString() });
    res.json({ success: true, txnId, grnNo: rec.grnNo });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ═══════════════════════════════════════════════════════
   POST /gdn  — create Goods Delivery Note
═══════════════════════════════════════════════════════ */
/* Build a GDN record from whichever field names the caller used — same
   dual-shape reasoning as buildGrnRecord above. */
function buildGdnRecord(companyId, txnId, body) {
  const { date, destinationType, partyType, partyId, partyName,
          fromType, dispatchFrom, fromName, preparedBy, dispatchedBy,
          fromVendorId, fromVendorName, fromPOId, fromPONo, poRef: gdnPoRef,
          soRef, poRef, orderRef, dcNo, refDate, vehicleNo, lrNo, transporter,
          notes, remarks, items,
          toType, toClientId, toName } = body;

  const validItems = (items || [])
    .map(it => ({ ...it, itemCode: it.itemCode || it.itemName || '',
      qty: parseFloat(it.qty) || 0 }))
    .filter(it => it.itemCode && it.qty > 0);

  const now = new Date().toISOString();
  const from = fromType === 'vendor' ? 'vendor' : (fromType || 'store');
  return {
    txnId, gdnId: txnId, type: 'gdn',
    gdnNo: `GDN-${txnId}`,
    date: date || now.slice(0, 10),
    fromType: from,
    dispatchFrom: dispatchFrom || fromName || '',
    fromName: fromName || dispatchFrom || '',
    fromVendorId: fromVendorId || '',
    fromVendorName: fromVendorName || (from === 'vendor' ? (fromName || dispatchFrom) : '') || '',
    fromPOId: fromPOId || '',
    fromPONo: fromPONo || '',
    preparedBy: preparedBy || dispatchedBy || '',
    dispatchedBy: dispatchedBy || preparedBy || '',
    /* destination — client, vendor (drop-ship onward) or other */
    destinationType: toType || destinationType || 'client',
    toType: toType || destinationType || 'client',
    partyType: partyType || toType || 'client',
    partyId: partyId || toClientId || '',
    toClientId: toClientId || partyId || '',
    partyName: partyName || toName || '',
    toName: toName || partyName || '',
    soRef: soRef || '',
    poRef: gdnPoRef || poRef || '',
    orderRef: orderRef || '',
    dcNo: dcNo || '',
    refDate: refDate || '',
    vehicleNo: vehicleNo || '',
    lrNo: lrNo || '',
    transporter: transporter || '',
    notes: notes || remarks || '',
    remarks: notes || remarks || '',
    items: validItems.map(it => ({
      itemCode: it.itemCode,
      itemName: it.itemName || '',
      hsnCode:  it.hsnCode  || '',
      qty: it.qty,
      unit: it.unit || '',
      rate: parseFloat(it.rate) || 0,
      location: it.location || 'Default',
      remarks: it.remarks || '',
    })),
    companyId, createdAt: now,
  };
}

/* Available stock per item, optionally excluding one transaction (used
   when editing a GDN so it doesn't count its own old quantity twice). */
function stockAvailability(companyId, excludeTxnId = null) {
  const transactions = readAll(stockDir(companyId))
    .filter(t => !excludeTxnId || String(t.txnId) !== String(excludeTxnId));
  const stockMap = {};
  transactions.forEach(t => {
    const isIn = t.type === 'grn' || t.type === 'in';
    normaliseItems(t).forEach(it => {
      const key = String(it.itemCode || it.itemName);
      if (!stockMap[key]) stockMap[key] = 0;
      stockMap[key] += isIn ? (parseFloat(it.qty) || 0) : -(parseFloat(it.qty) || 0);
    });
  });
  return stockMap;
}

router.post('/gdn', (req, res) => {
  try {
    const companyId = cid(req);
    if (!companyId) return res.status(400).json({ error: 'companyId required' });
    if (!Array.isArray(req.body.items) || req.body.items.length === 0)
      return res.status(400).json({ error: 'At least one item is required' });

    const dir = stockDir(companyId);
    ensureDir(dir);
    const txnId = nextId(dir);
    const rec = buildGdnRecord(companyId, txnId, req.body);
    if (rec.items.length === 0)
      return res.status(400).json({ error: 'All items must have a name/code and qty > 0' });

    const stockMap = stockAvailability(companyId);
    for (const it of rec.items) {
      const avail = stockMap[String(it.itemCode)] || 0;
      if (it.qty > avail)
        return res.status(400).json({
          error: `Insufficient stock for "${it.itemName || it.itemCode}". Available: ${avail} ${it.unit || ''}`,
        });
    }

    saveJson(stockFile(companyId, txnId), rec);
    res.json({ success: true, txnId, gdnId: txnId, gdnNo: rec.gdnNo, message: `GDN recorded — ${rec.gdnNo}` });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* Edit an existing GDN (Purchase Bill module's GDN tab supports editing) */
router.put('/gdn/:txnId', (req, res) => {
  try {
    const companyId = cid(req);
    if (!companyId) return res.status(400).json({ error: 'companyId required' });
    const txnId = parseInt(req.params.txnId, 10);
    const file = stockFile(companyId, txnId);
    if (!fs.existsSync(file)) return res.status(404).json({ error: 'GDN not found' });
    const rec = buildGdnRecord(companyId, txnId, req.body);

    const stockMap = stockAvailability(companyId, txnId);
    for (const it of rec.items) {
      const avail = stockMap[String(it.itemCode)] || 0;
      if (it.qty > avail)
        return res.status(400).json({
          error: `Insufficient stock for "${it.itemName || it.itemCode}". Available: ${avail} ${it.unit || ''}`,
        });
    }

    saveJson(file, { ...rec, updatedAt: new Date().toISOString() });
    res.json({ success: true, txnId, gdnNo: rec.gdnNo });
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

/* Exposed so other modules (e.g. deliveryChallans.js) can write a matching
   stock-out transaction without duplicating the GDN-building logic. */
router.stockDir = stockDir;
router.stockFile = stockFile;
router.nextId = nextId;
router.ensureDir = ensureDir;
router.buildGdnRecord = buildGdnRecord;
router.stockAvailability = stockAvailability;

module.exports = router;
