const express = require('express');
const path    = require('path');
const fs      = require('fs');
const { ROOT, upload, saveUploadedFiles, saveJson } = require('./helpers');
const jstore  = require('./json-store');

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
      return {
        itemName:     m.itemName || m.material || m.description || '',
        specs:        m.additionalDesc || m.specs || m.specifications || m.remarks || '',
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
      const saved = saveUploadedFiles(attFiles, docsPath);
      saved.forEach((s, i) => { if (attMeta[i]) { attMeta[i].filePath = s.filePath; attMeta[i].fileName = s.fileName; } else attMeta.push(s); });
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
      specSheet: str('specSheet'),
      specFiles: (() => {
        let meta = jp('specFiles', []);
        if (specFiles.length > 0) {
          const specsDir = path.join(docsPath, 'specs');
          fs.mkdirSync(specsDir, { recursive: true });
          specFiles.forEach((sf, i) => {
            const fname = Date.now() + i + '-' + sf.originalname;
            fs.writeFileSync(path.join(specsDir, fname), sf.buffer);
            const rel = 'docs/specs/' + fname;
            if (meta[i]) { meta[i].filePath = rel; meta[i].fileName = fname; }
            else meta.push({ name: sf.originalname, fileName: fname, filePath: rel, fileType: sf.originalname.split('.').pop().toLowerCase() });
          });
        }
        return meta;
      })(),
    };

    if (db.connected) {
      await db.query(
        `INSERT INTO sales_orders (id, company_id, status, order_no, order_date, order_type, customer_name, customer_code, customer_gstin, customer_state, customer_po, po_date, delivery_date, payment_terms, grand_total, data)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [orderId, companyId, status, data.orderNo, data.orderDate || null, data.orderType, data.customerName, data.customerCode, data.customerGstin, data.customerState, data.customerPO, data.poDate || null, data.deliveryDate || null, data.paymentTerms, data.grandTotal, JSON.stringify(data)]
      );
    }

    saveJson(soJsonPath(companyId, orderId), { ...data, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });

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
      if (!existing) return res.status(404).json({ error: 'Sales order not found' });
      ex = parseJ(existing.data, {});
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
    saveUploadedFiles(attFiles2, docsPath).forEach((s, i) => {
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
      specSheet: str('specSheet') !== '' ? str('specSheet') : (ex.specSheet || ''),
      specFiles: (() => {
        let meta = jp('specFiles', ex.specFiles || []);
        if (specFiles2.length > 0) {
          const specsDir = path.join(docsPath, 'specs');
          fs.mkdirSync(specsDir, { recursive: true });
          specFiles2.forEach((sf, i) => {
            const fname = Date.now() + i + '-' + sf.originalname;
            fs.writeFileSync(path.join(specsDir, fname), sf.buffer);
            const rel = 'docs/specs/' + fname;
            if (meta[i]) { meta[i].filePath = rel; meta[i].fileName = fname; }
            else meta.push({ name: sf.originalname, fileName: fname, filePath: rel, fileType: sf.originalname.split('.').pop().toLowerCase() });
          });
        }
        return meta;
      })(),
    };

    if (db.connected) {
      await db.query(
        `UPDATE sales_orders SET status=?, order_no=?, order_date=?, order_type=?, customer_name=?, customer_code=?, customer_gstin=?, customer_state=?, customer_po=?, po_date=?, delivery_date=?, payment_terms=?, grand_total=?, data=? WHERE id=? AND company_id=?`,
        [status, data.orderNo, data.orderDate || null, data.orderType, data.customerName, data.customerCode, data.customerGstin, data.customerState, data.customerPO, data.poDate || null, data.deliveryDate || null, data.paymentTerms, data.grandTotal, JSON.stringify(data), orderId, companyId]
      );
    }

    saveJson(soJsonPath(companyId, orderId), { ...data, updatedAt: new Date().toISOString() });

    res.json({ success: true, message: 'Sales order updated successfully' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE
router.delete('/:orderId', async (req, res) => {
  try {
    const companyId = req.query.companyId;
    const orderId   = req.params.orderId;

    if (db.connected) {
      const [result] = await db.query('DELETE FROM sales_orders WHERE id = ? AND company_id = ?', [orderId, companyId]);
      if (!result.affectedRows) return res.status(404).json({ error: 'Sales order not found' });
    }

    const p = path.join(ROOT, 'Database', 'Companies', companyId, 'SalesOrder', orderId);
    if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true });

    res.json({ success: true, message: 'Sales order deleted' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET - Render attachment file as embeddable content (PDF base64, Excel/Word HTML, text)
router.get('/:orderId/render-attachment/:fileName', async (req, res) => {
  try {
    const fp = path.join(docsBase(req.query.companyId, req.params.orderId), req.params.fileName);
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
