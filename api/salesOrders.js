const express = require('express');
const path    = require('path');
const fs      = require('fs');
const { ROOT, upload, saveUploadedFiles, saveJson } = require('./helpers');

const soJsonPath = (companyId, orderId) =>
  path.join(ROOT, 'Database', 'Companies', companyId, 'SalesOrder', String(orderId), `${orderId}.json`);
const db = require('../db');

const router = express.Router();

const docsBase = (companyId, orderId) =>
  path.join(ROOT, 'Database', 'Companies', companyId, 'SalesOrder', String(orderId), 'docs');

const parseJ = (v, fb = {}) => {
  if (v && typeof v === 'object') return v;
  try { return JSON.parse(v); } catch { return fb; }
};
// Restore full order object from DB row
const toRow = r => ({ ...parseJ(r.data, {}), id: undefined, orderId: r.id, status: r.status, createdAt: r.created_at, updatedAt: r.updated_at });

// GET - List all sales orders
router.get('/', async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT id, status, order_no, order_date, customer_name, customer_po, grand_total, data, created_at, updated_at FROM sales_orders WHERE company_id = ? ORDER BY id DESC',
      [req.query.companyId]
    );
    res.json(rows.map(toRow));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET - Next ID
router.get('/next-id', async (req, res) => {
  try {
    const [[row]] = await db.query('SELECT MAX(id) AS max_id FROM sales_orders WHERE company_id = ?', [req.query.companyId]);
    res.json({ nextId: row.max_id ? row.max_id + 1 : 300001 });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET - Material balance
router.get('/:orderId/material-balance', async (req, res) => {
  try {
    const { orderId } = req.params;
    const companyId   = req.query.companyId;

    const [[soRow]] = await db.query('SELECT * FROM sales_orders WHERE id = ? AND company_id = ?', [orderId, companyId]);
    if (!soRow) return res.status(404).json({ error: 'Sales order not found' });

    const so = parseJ(soRow.data, {});
    // Use SO items as the source; fall back to materialPlanningItems for legacy
    const soItems = so.items || so.materialPlanningItems || [];

    const [poRows] = await db.query(
      "SELECT data FROM purchase_orders WHERE company_id = ? AND JSON_EXTRACT(data, '$.linkedSalesOrderId') = ? AND status != 'rejected'",
      [companyId, String(orderId)]
    );

    const purchasedMap = {};
    poRows.forEach(pr => {
      const poData = parseJ(pr.data, {});
      (poData.items || []).forEach(it => {
        const key = (it.itemName || '').toLowerCase().trim();
        if (key) purchasedMap[key] = (purchasedMap[key] || 0) + (parseFloat(it.qty) || 0);
      });
    });

    const result = soItems.map(m => {
      const key       = (m.itemName || m.material || m.description || '').toLowerCase().trim();
      const required  = parseFloat(m.qty || m.requiredQty || m.quantity) || 0;
      const purchased = purchasedMap[key] || 0;
      return {
        itemName: m.itemName || m.material || m.description || '',
        qty: required, unit: m.unit || 'NOS', hsnCode: m.hsnCode || '',
        itemType: m.type || m.itemType || '',
        purchasedQty: purchased,
        balanceQty: Math.max(0, required - purchased),
        overPurchased: purchased > required,
      };
    });

    res.json({ orderId, orderNo: so.orderNo, customerName: so.customerName, items: result });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET - Single sales order
router.get('/:orderId', async (req, res) => {
  try {
    const [[row]] = await db.query('SELECT * FROM sales_orders WHERE id = ? AND company_id = ?', [req.params.orderId, req.query.companyId]);
    if (!row) return res.status(404).json({ error: 'Sales order not found' });
    res.json(toRow(row));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST - Create sales order
router.post('/', upload.array('attachmentFiles'), async (req, res) => {
  try {
    const b = req.body;
    const companyId = req.query.companyId || (Array.isArray(b.companyId) ? b.companyId[0] : b.companyId);
    const status    = Array.isArray(b.status) ? b.status[0] : (b.status || 'draft');

    const [[row]] = await db.query('SELECT MAX(id) AS max_id FROM sales_orders WHERE company_id = ?', [companyId]);
    const orderId = row.max_id ? row.max_id + 1 : 300001;

    const docsPath = docsBase(companyId, orderId);
    fs.mkdirSync(docsPath, { recursive: true });

    const str = k => (Array.isArray(b[k]) ? b[k][0] : b[k]) || '';
    const num = k => parseFloat(str(k)) || 0;
    const jp  = (k, fb=[]) => { try { const v=str(k); return v ? JSON.parse(v) : fb; } catch { return fb; } };

    let attMeta = jp('attachments');
    const saved = saveUploadedFiles(req.files, docsPath);
    saved.forEach((s, i) => { if (attMeta[i]) { attMeta[i].filePath = s.filePath; attMeta[i].fileName = s.fileName; } else attMeta.push(s); });

    const data = {
      orderId, status,
      orderNo: str('orderNo'), orderDate: str('orderDate'), orderType: str('orderType'),
      salesPerson: str('salesPerson'), customerName: str('customerName'), customerCode: str('customerCode'),
      customerGstin: str('customerGstin'), customerState: str('customerState'),
      customerCity: str('customerCity'), customerPincode: str('customerPincode'),
      shipToName: str('shipToName'), shipToAddress: str('shipToAddress'),
      shipToCity: str('shipToCity'), shipToState: str('shipToState'), shipToPincode: str('shipToPincode'),
      shipToContact: str('shipToContact'), shipToMobile: str('shipToMobile'), shipToEmail: str('shipToEmail'),
      address: str('address'),
      contactPerson: str('contactPerson'), mobile: str('mobile'), email: str('email'),
      customerPO: str('customerPO'), poDate: str('poDate'), enquiryRef: str('enquiryRef'),
      quotationRef: str('quotationRef'), deliveryDate: str('deliveryDate'), incoterms: str('incoterms'),
      overallDiscount: num('overallDiscount'), freightCharges: num('freightCharges'),
      packingCharges: num('packingCharges'), roundOff: num('roundOff'),
      subTotal: num('subTotal'), totalGST: num('totalGST'), grandTotal: num('grandTotal'),
      cgst: num('cgst'), sgst: num('sgst'), igst: num('igst'),
      deliveryAddr: str('deliveryAddr'), shippingAddr: str('shippingAddr'),
      dispatchMode: str('dispatchMode'), transporterName: str('transporterName'),
      vehicleNumber: str('vehicleNumber'), deliveryInstructions: str('deliveryInstructions'),
      paymentTerms: str('paymentTerms'), paymentMode: str('paymentMode'),
      billingTerms: str('billingTerms'), creditLimit: str('creditLimit'), dueDate: str('dueDate'),
      productSpecs: str('productSpecs'), technicalDetails: str('technicalDetails'),
      drawingNumber: str('drawingNumber'), version: str('version'),
      customFields: jp('customFields'), termsConditions: str('termsConditions'),
      internalNotes: str('internalNotes'), customerNotes: str('customerNotes'),
      // Legacy compat
      party: str('customerName'), partyGstin: str('customerGstin'),
      reference: str('customerPO'), orderRef: str('quotationRef'),
      shippedBy: str('dispatchMode'), destination: str('deliveryAddr'), narration: str('internalNotes'),
      // Arrays
      items: jp('items'), charges: jp('charges'), attachments: attMeta, documents: attMeta,
      scopeItems: jp('scopeItems'), bomItems: jp('bomItems'),
      tasks: jp('tasks'), materialPlanningItems: jp('materialPlanningItems'),
      bankGuarantee: jp('bankGuarantee') || {}, warranty: jp('warranty') || {},
      addons: jp('addons'),
    };

    await db.query(
      `INSERT INTO sales_orders (id, company_id, status, order_no, order_date, order_type, customer_name, customer_code, customer_gstin, customer_state, customer_po, po_date, delivery_date, payment_terms, grand_total, data)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [orderId, companyId, status, data.orderNo, data.orderDate || null, data.orderType, data.customerName, data.customerCode, data.customerGstin, data.customerState, data.customerPO, data.poDate || null, data.deliveryDate || null, data.paymentTerms, data.grandTotal, JSON.stringify(data)]
    );

    saveJson(soJsonPath(companyId, orderId), { ...data, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });

    res.json({ success: true, orderId, message: `Sales Order created with ID: ${orderId}` });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT - Update sales order
router.put('/:orderId', upload.array('attachmentFiles'), async (req, res) => {
  try {
    const { orderId } = req.params;
    const b = req.body;
    const companyId = req.query.companyId || (Array.isArray(b.companyId) ? b.companyId[0] : b.companyId);

    const [[existing]] = await db.query('SELECT * FROM sales_orders WHERE id = ? AND company_id = ?', [orderId, companyId]);
    if (!existing) return res.status(404).json({ error: 'Sales order not found' });

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

    const status = str('status') || ex.status || 'draft';
    const data = {
      ...ex, status,
      orderNo: str('orderNo') || ex.orderNo || '', orderDate: str('orderDate') || ex.orderDate || '',
      orderType: str('orderType') || ex.orderType || '', salesPerson: str('salesPerson') || ex.salesPerson || '',
      customerName: str('customerName') || ex.customerName || '', customerCode: str('customerCode') || ex.customerCode || '',
      customerGstin: str('customerGstin') || ex.customerGstin || '', customerState: str('customerState') || ex.customerState || '',
      customerCity: str('customerCity') || ex.customerCity || '', customerPincode: str('customerPincode') || ex.customerPincode || '',
      shipToName: str('shipToName') || ex.shipToName || '', shipToAddress: str('shipToAddress') || ex.shipToAddress || '',
      shipToCity: str('shipToCity') || ex.shipToCity || '', shipToState: str('shipToState') || ex.shipToState || '',
      shipToPincode: str('shipToPincode') || ex.shipToPincode || '',
      shipToContact: str('shipToContact') || ex.shipToContact || '',
      shipToMobile: str('shipToMobile') || ex.shipToMobile || '', shipToEmail: str('shipToEmail') || ex.shipToEmail || '',
      address: str('address') || ex.address || '',
      contactPerson: str('contactPerson') || ex.contactPerson || '', mobile: str('mobile') || ex.mobile || '',
      email: str('email') || ex.email || '', customerPO: str('customerPO') || ex.customerPO || '',
      poDate: str('poDate') || ex.poDate || '', enquiryRef: str('enquiryRef') || ex.enquiryRef || '',
      quotationRef: str('quotationRef') || ex.quotationRef || '', deliveryDate: str('deliveryDate') || ex.deliveryDate || '',
      incoterms: str('incoterms') || ex.incoterms || '',
      overallDiscount: num('overallDiscount') || ex.overallDiscount || 0,
      freightCharges: num('freightCharges') || ex.freightCharges || 0,
      packingCharges: num('packingCharges') || ex.packingCharges || 0,
      roundOff: num('roundOff') || ex.roundOff || 0,
      subTotal: num('subTotal') || ex.subTotal || 0, totalGST: num('totalGST') || ex.totalGST || 0,
      grandTotal: num('grandTotal') || ex.grandTotal || 0,
      cgst: num('cgst') || ex.cgst || 0, sgst: num('sgst') || ex.sgst || 0, igst: num('igst') || ex.igst || 0,
      deliveryAddr: str('deliveryAddr') || ex.deliveryAddr || '', shippingAddr: str('shippingAddr') || ex.shippingAddr || '',
      dispatchMode: str('dispatchMode') || ex.dispatchMode || '', transporterName: str('transporterName') || ex.transporterName || '',
      vehicleNumber: str('vehicleNumber') || ex.vehicleNumber || '', deliveryInstructions: str('deliveryInstructions') || ex.deliveryInstructions || '',
      paymentTerms: str('paymentTerms') || ex.paymentTerms || '', paymentMode: str('paymentMode') || ex.paymentMode || '',
      billingTerms: str('billingTerms') || ex.billingTerms || '', creditLimit: str('creditLimit') || ex.creditLimit || '',
      dueDate: str('dueDate') || ex.dueDate || '',
      productSpecs: str('productSpecs') || ex.productSpecs || '', technicalDetails: str('technicalDetails') || ex.technicalDetails || '',
      drawingNumber: str('drawingNumber') || ex.drawingNumber || '', version: str('version') || ex.version || '',
      customFields: jp('customFields', ex.customFields || []),
      termsConditions: str('termsConditions') || ex.termsConditions || '',
      internalNotes: str('internalNotes') || ex.internalNotes || '',
      customerNotes: str('customerNotes') || ex.customerNotes || '',
      party: str('customerName') || ex.party || '', partyGstin: str('customerGstin') || ex.partyGstin || '',
      reference: str('customerPO') || ex.reference || '', orderRef: str('quotationRef') || ex.orderRef || '',
      shippedBy: str('dispatchMode') || ex.shippedBy || '', destination: str('deliveryAddr') || ex.destination || '',
      narration: str('internalNotes') || ex.narration || '',
      items: jp('items', ex.items || []),
      charges: jp('charges', ex.charges || []),
      attachments: attMeta, documents: attMeta,
      scopeItems: jp('scopeItems', ex.scopeItems || []), bomItems: jp('bomItems', ex.bomItems || []),
      tasks: jp('tasks', ex.tasks || []), materialPlanningItems: jp('materialPlanningItems', ex.materialPlanningItems || []),
      bankGuarantee: jp('bankGuarantee', ex.bankGuarantee || {}), warranty: jp('warranty', ex.warranty || {}),
      addons: jp('addons', ex.addons || []),
    };

    await db.query(
      `UPDATE sales_orders SET status=?, order_no=?, order_date=?, order_type=?, customer_name=?, customer_code=?, customer_gstin=?, customer_state=?, customer_po=?, po_date=?, delivery_date=?, payment_terms=?, grand_total=?, data=? WHERE id=? AND company_id=?`,
      [status, data.orderNo, data.orderDate || null, data.orderType, data.customerName, data.customerCode, data.customerGstin, data.customerState, data.customerPO, data.poDate || null, data.deliveryDate || null, data.paymentTerms, data.grandTotal, JSON.stringify(data), orderId, companyId]
    );

    saveJson(soJsonPath(companyId, orderId), { ...data, updatedAt: new Date().toISOString() });

    res.json({ success: true, message: 'Sales order updated successfully' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE
router.delete('/:orderId', async (req, res) => {
  try {
    const companyId = req.query.companyId;
    const orderId   = req.params.orderId;
    const [result] = await db.query('DELETE FROM sales_orders WHERE id = ? AND company_id = ?', [orderId, companyId]);
    const p = path.join(ROOT, 'Database', 'Companies', companyId, 'SalesOrder', orderId);
    if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true });
    if (result.affectedRows) res.json({ success: true, message: 'Sales order deleted' });
    else res.status(404).json({ error: 'Sales order not found' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET - Download/view file  (?inline=1 for inline PDF viewer, default triggers download)
router.get('/:orderId/download/:fileName', (req, res) => {
  try {
    const fp = path.join(docsBase(req.query.companyId, req.params.orderId), req.params.fileName);
    if (!fs.existsSync(fp)) return res.status(404).json({ error: 'File not found' });
    if (req.query.inline) {
      res.sendFile(path.resolve(fp));
    } else {
      res.download(fp);
    }
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
