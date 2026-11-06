const express = require('express');
const path    = require('path');
const fs      = require('fs');
const { ROOT, upload, saveUploadedFiles, saveJson, auditEntry, pushAudit, resolveUser } = require('./helpers');
const jstore  = require('./json-store');

/* A suspended client must not get new sales orders (or have an order moved to it). Returns the client name when blocked. */
const suspendedClient = (companyId, clientId) => {
  if (!companyId || !clientId) return null;
  try { const c = jstore.readOne('Client', companyId, clientId); return c && c.status === 'suspended' ? (c.companyName || c.clientName || String(clientId)) : null; }
  catch { return null; }
};
const { addSystemLog } = require('./communication');
const { notifyApprovers } = require('./notifications');

const soJsonPath = (companyId, orderId) =>
  path.join(ROOT, 'Database', 'Companies', companyId, 'SalesOrder', String(orderId), `${orderId}.json`);
const db = require('../db');

const router = express.Router();

const docsBase = (companyId, orderId) =>
  path.join(ROOT, 'Database', 'Companies', companyId, 'SalesOrder', String(orderId), 'docs');

/* Pairs freshly-uploaded files with their metadata entries by matching against
   whichever meta entries are still missing a filePath (in order), instead of
   assuming the uploaded-files array and the full metadata array share the same
   index. That assumption breaks the moment a save mixes already-uploaded files
   (no new binary this request) with newly added ones — e.g. editing an order to
   add one more spec file when three were already attached — which silently
   corrupted file/metadata pairing (issue: printed "Missing PDF" for attachments
   that were actually a different file's bytes under the wrong name). */
const mergeIntoMeta = (meta, saved) => {
  let si = 0;
  for (let mi = 0; mi < meta.length && si < saved.length; mi++) {
    if (meta[mi] && !meta[mi].filePath) { meta[mi].filePath = saved[si].filePath; meta[mi].fileName = saved[si].fileName; si++; }
  }
  while (si < saved.length) { meta.push(saved[si]); si++; }
  return meta;
};

/* Writes uploaded spec/drawing files into docs/specs/ and returns the same
   {name, filePath, fileName, fileType} shape saveUploadedFiles() returns. */
const saveSpecFiles = (files, docsPath) => {
  if (!files.length) return [];
  const specsDir = path.join(docsPath, 'specs');
  fs.mkdirSync(specsDir, { recursive: true });
  return files.map((sf, i) => {
    const fname = Date.now() + i + '-' + sf.originalname;
    fs.writeFileSync(path.join(specsDir, fname), sf.buffer);
    return { name: sf.originalname, filePath: 'docs/specs/' + fname, fileName: fname, fileType: sf.originalname.split('.').pop().toLowerCase() };
  });
};

const parseJ = (v, fb = {}) => {
  if (v && typeof v === 'object') return v;
  try { return JSON.parse(v); } catch { return fb; }
};
// Restore full order object from DB row — individual columns are fallback when r.data is null/sparse
const toRow = r => {
  const d = parseJ(r.data, {});
  return {
    ...d,
    id:            undefined,
    orderId:       r.id,
    status:        r.status        || d.status        || '',
    orderNo:       d.orderNo       || r.order_no       || '',
    orderDate:     d.orderDate     || r.order_date     || '',
    customerName:  d.customerName  || r.customer_name  || d.party || '',
    party:         d.customerName  || r.customer_name  || d.party || '',
    customerPO:    d.customerPO    || r.customer_po    || '',
    customerGstin: d.customerGstin || r.customer_gstin || '',
    customerState: d.customerState || r.customer_state || '',
    poDate:        d.poDate        || r.po_date        || '',
    deliveryDate:  d.deliveryDate  || r.delivery_date  || '',
    dueDate:       d.dueDate       || d.deliveryDate   || r.delivery_date || '',
    paymentTerms:  d.paymentTerms  || r.payment_terms  || '',
    grandTotal:    d.grandTotal    || r.grand_total    || 0,
    createdAt:     r.created_at,
    updatedAt:     r.updated_at,
  };
};

// GET - List all sales orders
router.get('/', async (req, res) => {
  try {
    if (!db.connected) {
      return res.json(jstore.readAll('SalesOrder', req.query.companyId));
    }
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
    if (!db.connected) {
      return res.json({ nextId: jstore.nextId('SalesOrder', req.query.companyId, 300001) });
    }
    const [[row]] = await db.query('SELECT MAX(id) AS max_id FROM sales_orders');
    res.json({ nextId: row.max_id ? row.max_id + 1 : 300001 });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET - Material balance
router.get('/:orderId/material-balance', async (req, res) => {
  try {
    const { orderId } = req.params;
    const companyId   = req.query.companyId;

    let so, poList;

    if (!db.connected) {
      so = jstore.readOne('SalesOrder', companyId, orderId);
      if (!so) return res.status(404).json({ error: 'Sales order not found' });
      poList = jstore.readAll('PurchaseOrder', companyId)
        .filter(p => String(p.linkedSalesOrderId) === String(orderId) && p.status !== 'rejected');
    } else {
      const [[soRow]] = await db.query('SELECT * FROM sales_orders WHERE id = ? AND company_id = ?', [orderId, companyId]);
      if (!soRow) return res.status(404).json({ error: 'Sales order not found' });
      so = parseJ(soRow.data, {});

      const [poRows] = await db.query(
        "SELECT data FROM purchase_orders WHERE company_id = ? AND JSON_EXTRACT(data, '$.linkedSalesOrderId') = ? AND status != 'rejected'",
        [companyId, String(orderId)]
      );
      poList = poRows.map(pr => parseJ(pr.data, {}));
    }

    const soItems  = so.items || so.materialPlanningItems || [];
    const soAddons = so.addons || [];

    // Per-item spec text written in the SO's Specifications tab (the
    // "✍ Write Specs" note beside each item) — stored separately from the
    // item's own additionalDesc field, keyed by item _id.
    let specNotesByItemId = {};
    try {
      const specSheet = typeof so.specSheet === 'string' ? JSON.parse(so.specSheet) : (so.specSheet || {});
      (specSheet.itemNotes || []).forEach(n => {
        if (n && n.itemId && n.text) specNotesByItemId[String(n.itemId)] = n.text;
      });
    } catch {}

    const purchasedMap = {};
    poList.forEach(poData => {
      (poData.items || []).forEach(it => {
        const key = (it.itemName || '').toLowerCase().trim();
        if (key) purchasedMap[key] = (purchasedMap[key] || 0) + (parseFloat(it.qty) || 0);
      });
    });

    const mapItem = (m) => {
      const key       = (m.itemName || m.material || m.description || '').toLowerCase().trim();
      const required  = parseFloat(m.qty || m.requiredQty || m.quantity) || 0;
      const purchased = purchasedMap[key] || 0;
      const writtenSpec = m._id ? specNotesByItemId[String(m._id)] : '';
      const baseSpec     = m.additionalDesc || m.specs || m.specifications || m.remarks || '';
      return {
        itemName:     m.itemName || m.material || m.description || '',
        specs:        [baseSpec, writtenSpec].filter(Boolean).join(' — '),
        qty:          required,
        unit:         m.unit || 'NOS',
        hsnCode:      m.hsnCode || '',
        itemCode:     m.itemCode || m.code || '',
        itemType:     m.type || m.itemType || '',
        bom:          m.bom || [],
        purchasedQty: purchased,
        balanceQty:   Math.max(0, required - purchased),
        overPurchased: purchased > required,
      };
    };

    const mapAddon = (a) => {
      const key      = (a.description || '').toLowerCase().trim();
      const required = parseFloat(a.qty) || 0;
      const purchased = purchasedMap[key] || 0;
      return {
        itemName:     a.description || '',
        specs:        a.remarks || '',
        qty:          required,
        unit:         a.unit || 'NOS',
        hsnCode:      '',
        itemCode:     '',
        itemType:     a.category || 'Add-on',
        bom:          [],
        purchasedQty: purchased,
        balanceQty:   Math.max(0, required - purchased),
        overPurchased: purchased > required,
        isAddon:      true,
      };
    };

    const result = [
      ...soItems.map(mapItem),
      ...soAddons.filter(a => a.description).map(mapAddon),
    ];

    res.json({ orderId, orderNo: so.orderNo, customerName: so.customerName, items: result, specFiles: so.specFiles || [] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET - Single sales order
router.get('/:orderId', async (req, res) => {
  try {
    if (!db.connected) {
      const rec = jstore.readOne('SalesOrder', req.query.companyId, req.params.orderId);
      if (!rec) return res.status(404).json({ error: 'Sales order not found' });
      return res.json(rec);
    }
    const [[row]] = await db.query('SELECT * FROM sales_orders WHERE id = ? AND company_id = ?', [req.params.orderId, req.query.companyId]);
    if (!row) return res.status(404).json({ error: 'Sales order not found' });
    res.json(toRow(row));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST - Create sales order
const soUploadFields = upload.fields([
  { name: 'attachmentFiles', maxCount: 30 },
  { name: 'specUploadFiles', maxCount: 20 },
]);

router.post('/', soUploadFields, async (req, res) => {
  try {
    const b = req.body;
    const companyId = req.query.companyId || (Array.isArray(b.companyId) ? b.companyId[0] : b.companyId);
    const status    = Array.isArray(b.status) ? b.status[0] : (b.status || 'draft');
    const newClient = Array.isArray(b.customerCode) ? b.customerCode[0] : b.customerCode;
    const susp = suspendedClient(companyId, newClient);
    if (susp) return res.status(400).json({ error: `Client ${susp} (${newClient}) is suspended — a sales order cannot be created for this client.` });

    const orderId = db.connected
      ? await (async () => {
          const [[row]] = await db.query('SELECT MAX(id) AS max_id FROM sales_orders');
          return row.max_id ? row.max_id + 1 : 300001;
        })()
      : jstore.nextId('SalesOrder', companyId, 300001);

    const docsPath = docsBase(companyId, orderId);

    const str = k => (Array.isArray(b[k]) ? b[k][0] : b[k]) || '';
    const num = k => parseFloat(str(k)) || 0;
    const jp  = (k, fb=[]) => { try { const v=str(k); return v ? JSON.parse(v) : fb; } catch { return fb; } };

    const attFiles  = (req.files && req.files['attachmentFiles']) || [];
    const specFiles = (req.files && req.files['specUploadFiles'])  || [];

    let attMeta = jp('attachments');
    if (attFiles.length > 0) {
      fs.mkdirSync(docsPath, { recursive: true });
      mergeIntoMeta(attMeta, saveUploadedFiles(attFiles, docsPath));
    }

    const data = {
      orderId, status,
      orderNo: str('orderNo'), orderDate: str('orderDate'), orderType: str('orderType'),
      salesPerson: str('salesPerson'), customerName: str('customerName'), customerCode: str('customerCode'),
      customerGstin: str('customerGstin'), customerState: str('customerState'),
      customerCity: str('customerCity'), customerPincode: str('customerPincode'),
      shipToName: str('shipToName'), shipToAddress: str('shipToAddress'),
      shipToCity: str('shipToCity'), shipToState: str('shipToState'), shipToPincode: str('shipToPincode'),
      shipToContact: str('shipToContact'), shipToMobile: str('shipToMobile'), shipToEmail: str('shipToEmail'),
      shipToGstin: str('shipToGstin'), billToContact: str('billToContact'), billToMobile: str('billToMobile'),
      address: str('address'),
      contactPerson: str('contactPerson'), mobile: str('mobile'), email: str('email'),
      customerPO: str('customerPO'), poDate: str('poDate'), enquiryRef: str('enquiryRef'),
      quotationRef: str('quotationRef'), quotationDate: str('quotationDate'), deliveryDate: str('deliveryDate'), incoterms: str('incoterms'),
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
      specSheet: str('specSheet'),
      specFiles: mergeIntoMeta(jp('specFiles', []), saveSpecFiles(specFiles, docsPath)),
    };

    if (db.connected) {
      await db.query(
        `INSERT INTO sales_orders (id, company_id, status, order_no, order_date, order_type, customer_name, customer_code, customer_gstin, customer_state, customer_po, po_date, delivery_date, payment_terms, grand_total, data)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [orderId, companyId, status, data.orderNo, data.orderDate || null, data.orderType, data.customerName, data.customerCode, data.customerGstin, data.customerState, data.customerPO, data.poDate || null, data.deliveryDate || null, data.paymentTerms, data.grandTotal, JSON.stringify(data)]
      );
    }

    saveJson(soJsonPath(companyId, orderId), { ...data, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      audit: [auditEntry(req, 'created')] });

    const fmtAmt = n => Number(n || 0).toLocaleString('en-IN');
    addSystemLog(companyId, orderId, 'System',
      `Order received — SO #${orderId}${data.orderNo ? ` (${data.orderNo})` : ''} from ${data.customerName || 'Customer'}` +
      (data.grandTotal ? ` for ₹${fmtAmt(data.grandTotal)}` : ''),
      data.orderDate);

    if (status === 'pending') {
      const submitter = resolveUser(req);
      notifyApprovers({
        companyId, module: 'salesorder', recordId: orderId,
        recordLabel: `Sales Order ${data.orderNo || orderId} — ${data.customerName || 'Customer'}`,
        message: `Sales Order ${data.orderNo || orderId} (${data.customerName || 'Customer'}) needs your approval`,
        link: '/sales-order/pending',
        createdBy: submitter?.name || submitter?.username || 'System',
        targetUserId: str('approverId') || null,
      });
    }

    res.json({ success: true, orderId, message: `Sales Order created with ID: ${orderId}` });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT - Update sales order
router.put('/:orderId', soUploadFields, async (req, res) => {
  try {
    const { orderId } = req.params;
    const b = req.body;
    const companyId = req.query.companyId || (Array.isArray(b.companyId) ? b.companyId[0] : b.companyId);

    let ex;
    if (db.connected) {
      const [[existing]] = await db.query('SELECT * FROM sales_orders WHERE id = ? AND company_id = ?', [orderId, companyId]);
      if (existing) {
        ex = parseJ(existing.data, {});
      } else {
        // Created while DB was offline — fall back to file store
        const fileEx = jstore.readOne('SalesOrder', companyId, orderId);
        if (!fileEx) return res.status(404).json({ error: 'Sales order not found' });
        ex = fileEx;
      }
    } else {
      const existing = jstore.readOne('SalesOrder', companyId, orderId);
      if (!existing) return res.status(404).json({ error: 'Sales order not found' });
      ex = existing;
    }

    const str = k => (Array.isArray(b[k]) ? b[k][0] : b[k]) || '';
    const num = k => parseFloat(str(k)) || 0;
    const jp  = (k, fb) => { try { const v = str(k); return v ? JSON.parse(v) : fb; } catch { return fb; } };

    const docsPath = docsBase(companyId, orderId);
    fs.mkdirSync(docsPath, { recursive: true });

    const attFiles2  = (req.files && req.files['attachmentFiles']) || [];
    const specFiles2 = (req.files && req.files['specUploadFiles'])  || [];

    let attMeta = jp('attachments', ex.attachments || []);
    mergeIntoMeta(attMeta, saveUploadedFiles(attFiles2, docsPath));

    const status = str('status') || ex.status || 'draft';
    const movedTo = str('customerCode');
    if (movedTo && String(movedTo) !== String(ex.customerCode || '')) {
      const susp = suspendedClient(companyId, movedTo);
      if (susp) return res.status(400).json({ error: `Client ${susp} (${movedTo}) is suspended — the order cannot be moved to this client.` });
    }
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
      shipToGstin: str('shipToGstin') || ex.shipToGstin || '', billToContact: str('billToContact') || ex.billToContact || '', billToMobile: str('billToMobile') || ex.billToMobile || '',
      shipToMobile: str('shipToMobile') || ex.shipToMobile || '', shipToEmail: str('shipToEmail') || ex.shipToEmail || '',
      address: str('address') || ex.address || '',
      contactPerson: str('contactPerson') || ex.contactPerson || '', mobile: str('mobile') || ex.mobile || '',
      email: str('email') || ex.email || '', customerPO: str('customerPO') || ex.customerPO || '',
      poDate: str('poDate') || ex.poDate || '', enquiryRef: str('enquiryRef') || ex.enquiryRef || '',
      quotationRef: str('quotationRef') || ex.quotationRef || '', quotationDate: str('quotationDate') || ex.quotationDate || '', deliveryDate: str('deliveryDate') || ex.deliveryDate || '',
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
      specSheet: str('specSheet') !== '' ? str('specSheet') : (ex.specSheet || ''),
      specFiles: mergeIntoMeta(jp('specFiles', ex.specFiles || []), saveSpecFiles(specFiles2, docsPath)),
    };

    if (db.connected) {
      await db.query(
        `UPDATE sales_orders SET status=?, order_no=?, order_date=?, order_type=?, customer_name=?, customer_code=?, customer_gstin=?, customer_state=?, customer_po=?, po_date=?, delivery_date=?, payment_terms=?, grand_total=?, data=? WHERE id=? AND company_id=?`,
        [status, data.orderNo, data.orderDate || null, data.orderType, data.customerName, data.customerCode, data.customerGstin, data.customerState, data.customerPO, data.poDate || null, data.deliveryDate || null, data.paymentTerms, data.grandTotal, JSON.stringify(data), orderId, companyId]
      );
    }

    const oldStatus = ex.status;
    const newStatus = data.status;
    const soAction = newStatus !== oldStatus
      ? (newStatus === 'approved' ? 'approved' : newStatus === 'rejected' ? 'rejected' : 'status_changed')
      : 'edited';
    const soExtra = newStatus !== oldStatus ? { from: oldStatus, to: newStatus } : {};
    saveJson(soJsonPath(companyId, orderId), { ...data, updatedAt: new Date().toISOString(),
      audit: pushAudit(ex, req, soAction, soExtra) });

    if (newStatus === 'pending' && oldStatus !== 'pending') {
      const submitter = resolveUser(req);
      notifyApprovers({
        companyId, module: 'salesorder', recordId: orderId,
        recordLabel: `Sales Order ${data.orderNo || orderId} — ${data.customerName || 'Customer'}`,
        message: `Sales Order ${data.orderNo || orderId} (${data.customerName || 'Customer'}) needs your approval`,
        link: '/sales-order/pending',
        createdBy: submitter?.name || submitter?.username || 'System',
        targetUserId: str('approverId') || null,
      });
    }

    res.json({ success: true, message: 'Sales order updated successfully' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE
router.delete('/:orderId', async (req, res) => {
  try {
    const companyId = req.query.companyId;
    const orderId   = req.params.orderId;

    if (db.connected) {
      await db.query('DELETE FROM sales_orders WHERE id = ? AND company_id = ?', [orderId, companyId]);
      // Don't return 404 — record may exist only in file system (created while DB was offline)
    }

    const p = path.join(ROOT, 'Database', 'Companies', companyId, 'SalesOrder', String(orderId));
    if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true });
    else if (db.connected) { /* already removed from DB above; nothing else to do */ }

    res.json({ success: true, message: 'Sales order deleted' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET - Render attachment file as embeddable content (PDF base64, Excel/Word HTML, text)
router.get('/:orderId/render-attachment/:fileName', async (req, res) => {
  try {
    let fp = path.join(docsBase(req.query.companyId, req.params.orderId), req.params.fileName);
    if (!fs.existsSync(fp)) {
      /* spec/drawing uploads live under docs/specs/ — fall back there */
      const specFp = path.join(docsBase(req.query.companyId, req.params.orderId), 'specs', req.params.fileName);
      if (fs.existsSync(specFp)) fp = specFp;
    }
    if (!fs.existsSync(fp)) return res.status(404).json({ error: 'File not found' });

    const ext = path.extname(req.params.fileName).toLowerCase();

    if (ext === '.pdf') {
      const b64 = `data:application/pdf;base64,${fs.readFileSync(fp).toString('base64')}`;
      return res.json({ kind: 'pdf', base64: b64 });
    }

    if (['.xlsx', '.xls'].includes(ext)) {
      const XLSX = require('xlsx');
      const wb = XLSX.readFile(fp);
      let html = '';
      wb.SheetNames.forEach(name => {
        const ws   = wb.Sheets[name];
        const shHtml = XLSX.utils.sheet_to_html(ws, { editable: false });
        html += `<div style="margin-bottom:8px;"><div style="background:#1a3c6e;color:#fff;font-weight:700;padding:3px 8px;">Sheet: ${name}</div>${shHtml}</div>`;
      });
      return res.json({ kind: 'excel', html });
    }

    if (['.docx', '.doc'].includes(ext)) {
      try {
        const mammoth = require('mammoth');
        const result  = await mammoth.convertToHtml({ path: fp });
        return res.json({ kind: 'word', html: result.value });
      } catch {
        return res.json({ kind: 'word', html: '<p><em>Word document — content cannot be rendered inline.</em></p>' });
      }
    }

    if (ext === '.txt') {
      return res.json({ kind: 'text', text: fs.readFileSync(fp, 'utf8') });
    }

    const imgMime = { '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.png':'image/png', '.gif':'image/gif', '.webp':'image/webp', '.bmp':'image/bmp' };
    if (imgMime[ext]) {
      const b64 = `data:${imgMime[ext]};base64,${fs.readFileSync(fp).toString('base64')}`;
      return res.json({ kind: 'image', base64: b64 });
    }

    return res.json({ kind: 'unknown' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET - Serve spec uploaded file inline
router.get('/:orderId/spec-file/:fileName', (req, res) => {
  try {
    const fp = path.join(docsBase(req.query.companyId, req.params.orderId), 'specs', req.params.fileName);
    if (!fs.existsSync(fp)) return res.status(404).json({ error: 'File not found' });
    res.sendFile(path.resolve(fp));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET - Download/view file
router.get('/:orderId/download/:fileName', (req, res) => {
  try {
    let fp = path.join(docsBase(req.query.companyId, req.params.orderId), req.params.fileName);
    if (!fs.existsSync(fp)) {
      const specFp = path.join(docsBase(req.query.companyId, req.params.orderId), 'specs', req.params.fileName);
      if (fs.existsSync(specFp)) fp = specFp;
    }
    if (!fs.existsSync(fp)) return res.status(404).json({ error: 'File not found' });
    if (req.query.inline) {
      res.sendFile(path.resolve(fp));
    } else {
      res.download(fp);
    }
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST - print pack: the order page (html from the browser) + its spec files and attachments as one PDF
router.post('/:orderId/print-pack', async (req, res) => {
  const companyId = req.query.companyId || req.body?.companyId;
  const html = String(req.body?.html || '');
  if (!resolveUser(req)) return res.status(401).json({ error: 'Please sign in again.' });
  if (!companyId || !html) return res.status(400).json({ error: 'companyId and html are needed.' });
  let browser;
  try {
    const so = jstore.readOne('SalesOrder', companyId, req.params.orderId);
    if (!so) return res.status(404).json({ error: 'Sales order not found' });
    const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
    const puppeteer = require('puppeteer');
    browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load' });
    const soPdf = await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true });
    await browser.close(); browser = null;

    const out = await PDFDocument.load(soPdf);
    const font = await out.embedFont(StandardFonts.HelveticaBold);
    const docsDir = path.resolve(docsBase(companyId, req.params.orderId));
    const files = [...(so.specFiles || []).map(f => ({ ...f, kind: 'Specification' })), ...(so.attachments || so.documents || []).map(f => ({ ...f, kind: 'Attachment' }))]
      .filter(f => f && f.fileName);
    const seen = new Set(), notPrinted = [];
    for (const f of files) {
      if (seen.has(f.fileName)) continue;
      seen.add(f.fileName);
      const base = path.basename(String(f.fileName));
      let fp = path.resolve(docsDir, base);
      if (!fs.existsSync(fp)) fp = path.resolve(docsDir, 'specs', base);
      const label = f.name || f.fileName;
      if (!fp.startsWith(docsDir + path.sep) || !fs.existsSync(fp)) { notPrinted.push(`${label} (missing)`); continue; }
      const ext = path.extname(fp).toLowerCase();
      try {
        const buf = fs.readFileSync(fp);
        if (ext === '.pdf') {
          const src = await PDFDocument.load(buf, { ignoreEncryption: true });
          (await out.copyPages(src, src.getPageIndices())).forEach(p => out.addPage(p));
        } else if (['.png', '.jpg', '.jpeg'].includes(ext)) {
          const img = ext === '.png' ? await out.embedPng(buf) : await out.embedJpg(buf);
          const W = 595.28, H = 841.89, M = 28, top = 24;   // A4 in points
          const pg = out.addPage([W, H]);
          const title = `${f.kind}: ${label}${f.itemName ? ` (${f.itemName})` : ''} — SO ${so.orderNo || so.orderId}`.replace(/[^\x20-\x7E]/g, ' ');
          pg.drawText(title.slice(0, 110), { x: M, y: H - M - 10, size: 9, font, color: rgb(0, 0, 0) });
          const k = Math.min((W - 2 * M) / img.width, (H - 2 * M - top) / img.height, 1.6);
          const w = img.width * k, h = img.height * k;
          pg.drawImage(img, { x: (W - w) / 2, y: H - M - top - h, width: w, height: h });
        } else notPrinted.push(label);
      } catch { notPrinted.push(`${label} (could not be read)`); }
    }
    const bytes = await out.save();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('X-Not-Printed', encodeURIComponent(JSON.stringify(notPrinted)));
    res.setHeader('Access-Control-Expose-Headers', 'X-Not-Printed');
    res.send(Buffer.from(bytes));
  } catch (e) {
    if (browser) { try { await browser.close(); } catch { /* closed */ } }
    res.status(500).json({ error: 'Could not make the print: ' + e.message });
  }
});

module.exports = router;
