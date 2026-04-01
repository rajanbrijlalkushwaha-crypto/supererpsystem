const express = require('express');
const path    = require('path');
const fs      = require('fs');
const { ROOT, upload, saveUploadedFiles, saveJson } = require('./helpers');

const poJsonPath = (companyId, orderId) =>
  path.join(ROOT, 'Database', 'Companies', companyId, 'PurchaseOrder', String(orderId), `${orderId}.json`);
const db = require('../db');

const router = express.Router();

const docsBase = (companyId, orderId) =>
  path.join(ROOT, 'Database', 'Companies', companyId, 'PurchaseOrder', String(orderId), 'docs');

const parseJ = (v, fb = {}) => {
  if (v && typeof v === 'object') return v;
  try { return JSON.parse(v); } catch { return fb; }
};
const toRow = r => ({ ...parseJ(r.data, {}), orderId: r.id, status: r.status, createdAt: r.created_at, updatedAt: r.updated_at });

// GET - Next ID
router.get('/next-id', async (req, res) => {
  try {
    const [[row]] = await db.query('SELECT MAX(id) AS max_id FROM purchase_orders WHERE company_id = ?', [req.query.companyId]);
    res.json({ nextId: row.max_id ? row.max_id + 1 : 400001 });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET - List all purchase orders
router.get('/', async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT id, status, vendor_name, po_date, delivery_date, grand_total, data, created_at, updated_at FROM purchase_orders WHERE company_id = ? ORDER BY id DESC',
      [req.query.companyId]
    );
    res.json(rows.map(toRow));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET - Single purchase order
router.get('/:orderId', async (req, res) => {
  try {
    const [[row]] = await db.query('SELECT * FROM purchase_orders WHERE id = ? AND company_id = ?', [req.params.orderId, req.query.companyId]);
    if (!row) return res.status(404).json({ error: 'Purchase order not found' });
    res.json(toRow(row));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST - Create purchase order
router.post('/', upload.array('attachmentFiles'), async (req, res) => {
  try {
    const b = req.body;
    const companyId = req.query.companyId || (Array.isArray(b.companyId) ? b.companyId[0] : b.companyId);
    const str = k => (Array.isArray(b[k]) ? b[k][0] : b[k]) || '';
    const num = k => parseFloat(str(k)) || 0;
    const jp  = k => { try { return JSON.parse(str(k)); } catch { return []; } };

    const [[row]] = await db.query('SELECT MAX(id) AS max_id FROM purchase_orders WHERE company_id = ?', [companyId]);
    const orderId = row.max_id ? row.max_id + 1 : 400001;

    const docsPath = docsBase(companyId, orderId);
    fs.mkdirSync(docsPath, { recursive: true });

    let attMeta = jp('attachments');
    saveUploadedFiles(req.files, docsPath).forEach((s, i) => {
      if (attMeta[i]) { attMeta[i].filePath = s.filePath; attMeta[i].fileName = s.fileName; } else attMeta.push(s);
    });

    const data = {
      orderId, status: str('status') || 'draft',
      vendorId: str('vendorId'), vendorName: str('vendorName'), vendorGstin: str('vendorGstin'),
      vendorCode: str('vendorCode'), vendorState: str('vendorState'), vendorAddress: str('vendorAddress'),
      vendorCity: str('vendorCity'), vendorPincode: str('vendorPincode'),
      poNo: str('poNo'), poNumber: str('poNo') || str('poNumber'),
      poDate: str('poDate'), poType: str('poType'), purchasePerson: str('purchasePerson'),
      deliveryDate: str('deliveryDate'), incoterms: str('incoterms'),
      deliveryAddr: str('deliveryAddr'), deliveryAddress: str('deliveryAddr'),
      shippingAddr: str('shippingAddr'), dispatchMode: str('dispatchMode'),
      shipFromAddress: str('shipFromAddress'), shipFromCity: str('shipFromCity'),
      shipFromState: str('shipFromState'), shipFromPincode: str('shipFromPincode'),
      transporterName: str('transporterName'), vehicleNumber: str('vehicleNumber'),
      deliveryInstructions: str('deliveryInstructions'),
      contactPerson: str('contactPerson'), mobile: str('mobile'), email: str('email'),
      contactPerson2: str('contactPerson2'), mobile2: str('mobile2'), email2: str('email2'),
      paymentTerms: str('paymentTerms'), paymentMode: str('paymentMode'),
      billingTerms: str('billingTerms'), creditLimit: str('creditLimit'), dueDate: str('dueDate'),
      vendorRef: str('vendorRef'), enquiryRef: str('enquiryRef'), quotationRef: str('quotationRef'),
      quoteDate: str('quoteDate'), eroNo: str('eroNo'),
      freightTerms: str('freightTerms'), linkedSalesOrderId: str('linkedSalesOrderId'),
      subTotal: num('subTotal'), totalGST: num('totalGST'), grandTotal: num('grandTotal'),
      cgst: num('cgst'), sgst: num('sgst'), igst: num('igst'),
      overallDiscount: num('overallDiscount'), freightCharges: num('freightCharges'),
      packingCharges: num('packingCharges'), roundOff: num('roundOff'),
      termsConditions: str('termsConditions'), internalNotes: str('internalNotes'),
      vendorNotes: str('vendorNotes'), notes: str('internalNotes'),
      items: jp('items'), charges: jp('charges'), attachments: attMeta, documents: attMeta,
    };

    await db.query(
      `INSERT INTO purchase_orders (id, company_id, status, vendor_name, po_date, delivery_date, grand_total, data)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [orderId, companyId, data.status, data.vendorName, data.poDate || null, data.deliveryDate || null, data.grandTotal, JSON.stringify(data)]
    );

    saveJson(poJsonPath(companyId, orderId), { ...data, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });

    res.json({ success: true, orderId, message: `Purchase Order created with ID: ${orderId}` });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT - Update purchase order
router.put('/:orderId', upload.array('attachmentFiles'), async (req, res) => {
  try {
    const { orderId } = req.params;
    const b = req.body;
    const companyId = req.query.companyId || (Array.isArray(b.companyId) ? b.companyId[0] : b.companyId);

    const [[existing]] = await db.query('SELECT * FROM purchase_orders WHERE id = ? AND company_id = ?', [orderId, companyId]);
    if (!existing) return res.status(404).json({ error: 'Purchase order not found' });

    const ex = parseJ(existing.data, {});
    const str = k => (Array.isArray(b[k]) ? b[k][0] : b[k]) || '';
    const num = k => parseFloat(str(k)) || 0;
    const jp  = (k, fb) => { try { const v = str(k); return v ? JSON.parse(v) : fb; } catch { return fb; } };

    const docsPath = docsBase(companyId, orderId);
    fs.mkdirSync(docsPath, { recursive: true });

    let attMeta = jp('attachments', ex.attachments || []);
    saveUploadedFiles(req.files, docsPath).forEach((s, i) => {
      if (attMeta[i]) { attMeta[i].filePath = s.filePath; attMeta[i].fileName = s.fileName; } else attMeta.push(s);
    });

    const data = {
      ...ex,
      status: str('status') || ex.status || 'draft',
      vendorId: str('vendorId') || ex.vendorId, vendorName: str('vendorName') || ex.vendorName,
      vendorGstin: str('vendorGstin') || ex.vendorGstin,
      vendorCode: str('vendorCode') || ex.vendorCode || '',
      vendorState: str('vendorState') || ex.vendorState || '',
      vendorAddress: str('vendorAddress') || ex.vendorAddress || '',
      vendorCity: str('vendorCity') || ex.vendorCity || '',
      vendorPincode: str('vendorPincode') || ex.vendorPincode || '',
      poNo: str('poNo') || ex.poNo || '',
      poNumber: str('poNo') || str('poNumber') || ex.poNumber || '',
      poDate: str('poDate') || ex.poDate, poType: str('poType') || ex.poType || 'Standard',
      purchasePerson: str('purchasePerson') || ex.purchasePerson || '',
      deliveryDate: str('deliveryDate') || ex.deliveryDate,
      incoterms: str('incoterms') || ex.incoterms || '',
      deliveryAddr: str('deliveryAddr') || ex.deliveryAddr || '',
      deliveryAddress: str('deliveryAddr') || ex.deliveryAddress || '',
      shippingAddr: str('shippingAddr') || ex.shippingAddr || '',
      dispatchMode: str('dispatchMode') || ex.dispatchMode || '',
      shipFromAddress: str('shipFromAddress') || ex.shipFromAddress || '',
      shipFromCity: str('shipFromCity') || ex.shipFromCity || '',
      shipFromState: str('shipFromState') || ex.shipFromState || '',
      shipFromPincode: str('shipFromPincode') || ex.shipFromPincode || '',
      transporterName: str('transporterName') || ex.transporterName || '',
      vehicleNumber: str('vehicleNumber') || ex.vehicleNumber || '',
      deliveryInstructions: str('deliveryInstructions') || ex.deliveryInstructions || '',
      contactPerson: str('contactPerson') || ex.contactPerson || '',
      mobile: str('mobile') || ex.mobile || '', email: str('email') || ex.email || '',
      contactPerson2: str('contactPerson2') || ex.contactPerson2 || '',
      mobile2: str('mobile2') || ex.mobile2 || '', email2: str('email2') || ex.email2 || '',
      paymentTerms: str('paymentTerms') || ex.paymentTerms,
      paymentMode: str('paymentMode') || ex.paymentMode || '',
      billingTerms: str('billingTerms') || ex.billingTerms || '',
      creditLimit: str('creditLimit') || ex.creditLimit || '', dueDate: str('dueDate') || ex.dueDate || '',
      vendorRef: str('vendorRef') || ex.vendorRef || '',
      enquiryRef: str('enquiryRef') || ex.enquiryRef || '',
      quotationRef: str('quotationRef') || ex.quotationRef || '',
      quoteDate: str('quoteDate') || ex.quoteDate || '',
      eroNo: str('eroNo') || ex.eroNo || '',
      freightTerms: str('freightTerms') || ex.freightTerms || '',
      linkedSalesOrderId: str('linkedSalesOrderId') || ex.linkedSalesOrderId,
      subTotal: num('subTotal') || ex.subTotal, totalGST: num('totalGST') || ex.totalGST,
      grandTotal: num('grandTotal') || ex.grandTotal,
      cgst: num('cgst') || ex.cgst, sgst: num('sgst') || ex.sgst, igst: num('igst') || ex.igst,
      overallDiscount: num('overallDiscount') || ex.overallDiscount || 0,
      freightCharges: num('freightCharges') || ex.freightCharges || 0,
      packingCharges: num('packingCharges') || ex.packingCharges || 0,
      roundOff: num('roundOff') || ex.roundOff || 0,
      termsConditions: str('termsConditions') || ex.termsConditions || '',
      internalNotes: str('internalNotes') || ex.internalNotes || '',
      vendorNotes: str('vendorNotes') || ex.vendorNotes || '',
      notes: str('internalNotes') || ex.notes || '',
      items: jp('items', ex.items || []),
      charges: jp('charges', ex.charges || []),
      attachments: attMeta, documents: attMeta,
    };

    await db.query(
      `UPDATE purchase_orders SET status=?, vendor_name=?, po_date=?, delivery_date=?, grand_total=?, data=? WHERE id=? AND company_id=?`,
      [data.status, data.vendorName, data.poDate || null, data.deliveryDate || null, data.grandTotal, JSON.stringify(data), orderId, companyId]
    );

    saveJson(poJsonPath(companyId, orderId), { ...data, updatedAt: new Date().toISOString() });

    res.json({ success: true, message: 'Purchase order updated successfully' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE
router.delete('/:orderId', async (req, res) => {
  try {
    const companyId = req.query.companyId;
    const orderId   = req.params.orderId;
    const [result] = await db.query('DELETE FROM purchase_orders WHERE id = ? AND company_id = ?', [orderId, companyId]);
    const p = path.join(ROOT, 'Database', 'Companies', companyId, 'PurchaseOrder', orderId);
    if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true });
    if (result.affectedRows) res.json({ success: true, message: 'Purchase order deleted' });
    else res.status(404).json({ error: 'Purchase order not found' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET - Download file
router.get('/:orderId/download/:fileName', (req, res) => {
  try {
    const fp = path.join(docsBase(req.query.companyId, req.params.orderId), req.params.fileName);
    if (fs.existsSync(fp)) res.download(fp);
    else res.status(404).json({ error: 'File not found' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
