const express = require('express');
const path    = require('path');
const fs      = require('fs');
const { ROOT, upload, saveUploadedFiles, saveJson } = require('./helpers');
const jstore  = require('./json-store');

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
    if (!db.connected) {
      return res.json({ nextId: jstore.nextId('PurchaseOrder', req.query.companyId, 400001) });
    }
    const [[row]] = await db.query('SELECT MAX(id) AS max_id FROM purchase_orders');
    res.json({ nextId: row.max_id ? row.max_id + 1 : 400001 });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET - List all purchase orders
router.get('/', async (req, res) => {
  try {
    if (!db.connected) {
      return res.json(jstore.readAll('PurchaseOrder', req.query.companyId));
    }
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
    if (!db.connected) {
      const rec = jstore.readOne('PurchaseOrder', req.query.companyId, req.params.orderId);
      if (!rec) return res.status(404).json({ error: 'Purchase order not found' });
      return res.json(rec);
    }
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

    const orderId = db.connected
      ? await (async () => {
          const [[row]] = await db.query('SELECT MAX(id) AS max_id FROM purchase_orders');
          return row.max_id ? row.max_id + 1 : 400001;
        })()
      : jstore.nextId('PurchaseOrder', companyId, 400001);

    const docsPath = docsBase(companyId, orderId);

    let attMeta = jp('attachments');
    if (req.files && req.files.length > 0) {
      fs.mkdirSync(docsPath, { recursive: true });
      saveUploadedFiles(req.files, docsPath).forEach((s, i) => {
        if (attMeta[i]) { attMeta[i].filePath = s.filePath; attMeta[i].fileName = s.fileName; } else attMeta.push(s);
      });
    }

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

    if (db.connected) {
      await db.query(
        `INSERT INTO purchase_orders (id, company_id, status, vendor_name, po_date, delivery_date, grand_total, data)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [orderId, companyId, data.status, data.vendorName, data.poDate || null, data.deliveryDate || null, data.grandTotal, JSON.stringify(data)]
      );
    }

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

    let ex;
    if (db.connected) {
      const [[existing]] = await db.query('SELECT * FROM purchase_orders WHERE id = ? AND company_id = ?', [orderId, companyId]);
      if (!existing) return res.status(404).json({ error: 'Purchase order not found' });
      ex = parseJ(existing.data, {});
    } else {
      const existing = jstore.readOne('PurchaseOrder', companyId, orderId);
      if (!existing) return res.status(404).json({ error: 'Purchase order not found' });
      ex = existing;
    }

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

    if (db.connected) {
      await db.query(
        `UPDATE purchase_orders SET status=?, vendor_name=?, po_date=?, delivery_date=?, grand_total=?, data=? WHERE id=? AND company_id=?`,
        [data.status, data.vendorName, data.poDate || null, data.deliveryDate || null, data.grandTotal, JSON.stringify(data), orderId, companyId]
      );
    }

    saveJson(poJsonPath(companyId, orderId), { ...data, updatedAt: new Date().toISOString() });

    res.json({ success: true, message: 'Purchase order updated successfully' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE
router.delete('/:orderId', async (req, res) => {
  try {
    const companyId = req.query.companyId;
    const orderId   = req.params.orderId;

    if (db.connected) {
      const [result] = await db.query('DELETE FROM purchase_orders WHERE id = ? AND company_id = ?', [orderId, companyId]);
      if (!result.affectedRows) return res.status(404).json({ error: 'Purchase order not found' });
    }

    const p = path.join(ROOT, 'Database', 'Companies', companyId, 'PurchaseOrder', orderId);
    if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true });

    res.json({ success: true, message: 'Purchase order deleted' });
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

// ── Helper: build PO HTML for PDF generation ──
function buildPOHtml(po, company, logoBase64) {
  const esc = v => (!v && v !== 0) ? '' : String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const dv  = v => esc(v) || '';
  const fmtD = v => { if (!v) return ''; const d=new Date(v); return isNaN(d)?String(v):`${String(d.getDate()).padStart(2,'0')}-${String(d.getMonth()+1).padStart(2,'0')}-${d.getFullYear()}`; };
  const fmtN = n => Number(n||0).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2});
  function numWords(n) {
    n=Math.round(Math.abs(n||0)); if(!n) return 'Zero Rupees Only';
    const a=['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'];
    const b=['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
    const seg=x=>!x?'':x<20?a[x]+' ':b[Math.floor(x/10)]+(x%10?' '+a[x%10]:'')+' ';
    let w='';
    if(Math.floor(n/10000000))          w+=seg(Math.floor(n/10000000))+'Crore ';
    if(Math.floor((n%10000000)/100000)) w+=seg(Math.floor((n%10000000)/100000))+'Lakh ';
    if(Math.floor((n%100000)/1000))     w+=seg(Math.floor((n%100000)/1000))+'Thousand ';
    if(Math.floor((n%1000)/100))        w+=seg(Math.floor((n%1000)/100))+'Hundred ';
    if(n%100) w+=seg(n%100);
    return 'INR '+w.trim()+' Only';
  }

  const items   = Array.isArray(po.items)   ? po.items   : [];
  const charges = Array.isArray(po.charges) ? po.charges : [];
  const coState     = (company.state||'').toLowerCase().trim();
  const vendorState = (po.vendorState||'').toLowerCase().trim();
  const sameState   = coState && vendorState && coState === vendorState;

  const itemTaxable = items.reduce((s,it)=>{ const base=(parseFloat(it.qty)||0)*(parseFloat(it.rate)||0); const disc=it.discountType==='%'?base*(parseFloat(it.discount)||0)/100:(parseFloat(it.discount)||0); return s+base-disc; },0);
  const itemGstAmt  = items.reduce((s,it)=>{ const base=(parseFloat(it.qty)||0)*(parseFloat(it.rate)||0); const disc=it.discountType==='%'?base*(parseFloat(it.discount)||0)/100:(parseFloat(it.discount)||0); return s+(base-disc)*(parseFloat(it.gstPercent)||0)/100; },0);
  const validChg    = charges.filter(c=>parseFloat(c.amount)>0);
  const chgNet      = validChg.reduce((s,c)=>s+(parseFloat(c.amount)||0),0);
  const chgGstAmt   = validChg.reduce((s,c)=>{ const a=parseFloat(c.amount)||0; return s+a*(parseFloat(c.gstPercent||c.gst)||0)/100; },0);
  const totalTaxable= itemTaxable+chgNet;
  const totalGst    = itemGstAmt+chgGstAmt;
  const discount    = parseFloat(po.overallDiscount)||0;
  const freight     = parseFloat(po.freightCharges)||0;
  const packing     = parseFloat(po.packingCharges)||0;
  const roundOff    = parseFloat(po.roundOff)||0;
  const grand       = parseFloat(po.grandTotal)||(totalTaxable+totalGst-discount+freight+packing+roundOff);
  const poNo        = po.poNo||po.voucherNumber||po.orderId||'';

  const BL   = '1px solid #555';
  const SECL = '1.5px solid #555';
  const oc   = 'border:none;padding:3px 8px;vertical-align:top;font-size:9.5pt;';
  const lbl  = `${oc}white-space:nowrap;width:130px;`;
  const sep  = `${oc}width:12px;text-align:center;`;
  const val  = oc;
  const secHdr = `border-top:${SECL};border-bottom:${SECL};border-left:none;border-right:none;text-align:center;font-size:10.5pt;font-weight:bold;padding:6px 8px;`;
  const subHdr = 'border:none;padding:7px 8px 2px;font-weight:bold;font-size:10pt;text-decoration:underline;';

  const fr=(ll,lv,rl,rv)=>`<tr><td style="${lbl}">${ll}</td><td style="${sep}">:</td><td style="${val}">${lv}</td><td style="${lbl}">${rl}</td><td style="${sep}">:</td><td style="${val}">${rv}</td></tr>`;
  const fr1=(ll,lv)=>`<tr><td style="${lbl}">${ll}</td><td style="${sep}">:</td><td style="${val}" colspan="3">${lv}</td></tr>`;

  // Item table
  const itemRows = items.map((it,i)=>{
    const qty=parseFloat(it.qty)||0; const rate=parseFloat(it.rate)||0;
    const base=qty*rate; const disc=it.discountType==='%'?base*(parseFloat(it.discount)||0)/100:(parseFloat(it.discount)||0);
    const taxable=base-disc; const gst=parseFloat(it.gstPercent)||0; const amt=taxable*(1+gst/100);
    const discStr=parseFloat(it.discount)>0?(it.discountType==='%'?`${it.discount}%`:fmtN(it.discount)):'—';
    return `<tr style="background:${i%2===0?'#fff':'#f8f8f8'}">
      <td style="border-left:none;border-right:none;border-top:none;border-bottom:none;border-left:none;padding:3px 5px;font-size:9pt;text-align:center;">${i+1}</td>
      <td style="border-left:${BL};padding:3px 5px;font-size:9pt;font-weight:600;">${dv(it.itemName)}</td>
      <td style="border-left:${BL};padding:3px 5px;font-size:8.5pt;white-space:pre-wrap;">${dv(it.description)}</td>
      <td style="border-left:${BL};padding:3px 5px;font-size:9pt;text-align:center;">${dv(it.hsnCode)}</td>
      <td style="border-left:${BL};padding:3px 5px;font-size:9pt;text-align:right;">${qty}</td>
      <td style="border-left:${BL};padding:3px 5px;font-size:9pt;text-align:center;">${dv(it.unit)}</td>
      <td style="border-left:${BL};padding:3px 5px;font-size:9pt;text-align:right;">${fmtN(rate)}</td>
      <td style="border-left:${BL};padding:3px 5px;font-size:9pt;text-align:center;">${discStr}</td>
      <td style="border-left:${BL};padding:3px 5px;font-size:9pt;text-align:center;">${gst}%</td>
      <td style="border-left:${BL};padding:3px 5px;font-size:9pt;text-align:right;font-weight:600;">${fmtN(taxable)}</td>
    </tr>`;
  }).join('');

  const chgRows = validChg.map(c=>`<tr>
    <td colspan="8" style="border-left:none;border-top:${BL};padding:3px 8px;font-size:9pt;">${dv(c.description||c.label)}</td>
    <td style="border-left:${BL};border-top:${BL};padding:3px 5px;font-size:9pt;text-align:center;">${parseFloat(c.gstPercent||c.gst)||0}%</td>
    <td style="border-left:${BL};border-top:${BL};padding:3px 8px;font-size:9pt;text-align:right;">${fmtN(parseFloat(c.amount)||0)}</td>
  </tr>`).join('');

  const footRows=[];
  if(totalTaxable) footRows.push(`<tr><td colspan="9" style="border-left:none;border-top:${BL};padding:4px 8px;font-size:9pt;font-weight:bold;text-align:right;">Total Taxable</td><td style="border-left:${BL};border-top:${BL};padding:4px 8px;font-size:9pt;font-weight:bold;text-align:right;">${fmtN(totalTaxable)}</td></tr>`);
  if(discount>0)   footRows.push(`<tr><td colspan="9" style="border-left:none;padding:3px 8px;font-size:9pt;text-align:right;">Overall Discount</td><td style="border-left:${BL};padding:3px 8px;font-size:9pt;text-align:right;">- ${fmtN(discount)}</td></tr>`);
  if(sameState) {
    const h=totalGst/2;
    footRows.push(`<tr><td colspan="9" style="border-left:none;padding:3px 8px;font-size:9pt;text-align:right;">CGST @ ${((itemGstAmt/2/itemTaxable)||0)*100 < 0.01?'':''}&nbsp;</td><td style="border-left:${BL};padding:3px 8px;font-size:9pt;text-align:right;">${fmtN(h)}</td></tr>`);
    footRows.push(`<tr><td colspan="9" style="border-left:none;padding:3px 8px;font-size:9pt;text-align:right;">SGST</td><td style="border-left:${BL};padding:3px 8px;font-size:9pt;text-align:right;">${fmtN(h)}</td></tr>`);
  } else {
    footRows.push(`<tr><td colspan="9" style="border-left:none;padding:3px 8px;font-size:9pt;text-align:right;">IGST</td><td style="border-left:${BL};padding:3px 8px;font-size:9pt;text-align:right;">${fmtN(totalGst)}</td></tr>`);
  }
  if(freight>0)  footRows.push(`<tr><td colspan="9" style="border-left:none;padding:3px 8px;font-size:9pt;text-align:right;">Freight</td><td style="border-left:${BL};padding:3px 8px;font-size:9pt;text-align:right;">${fmtN(freight)}</td></tr>`);
  if(packing>0)  footRows.push(`<tr><td colspan="9" style="border-left:none;padding:3px 8px;font-size:9pt;text-align:right;">Packing</td><td style="border-left:${BL};padding:3px 8px;font-size:9pt;text-align:right;">${fmtN(packing)}</td></tr>`);
  if(roundOff)   footRows.push(`<tr><td colspan="9" style="border-left:none;padding:3px 8px;font-size:9pt;text-align:right;">Round Off</td><td style="border-left:${BL};padding:3px 8px;font-size:9pt;text-align:right;">${fmtN(roundOff)}</td></tr>`);
  footRows.push(`<tr><td colspan="9" style="border-left:none;border-top:${SECL};border-bottom:${SECL};padding:5px 8px;font-size:10.5pt;font-weight:bold;text-align:right;">Total Order Value</td><td style="border-left:${BL};border-top:${SECL};border-bottom:${SECL};padding:5px 8px;font-size:11pt;font-weight:bold;text-align:right;">&#8377; ${fmtN(grand)}</td></tr>`);

  const coName  = company.companyName||'Epsilon Enterprise';
  const coAddr  = [company.address,company.city,company.state,company.pincode].filter(Boolean).join(', ');
  const logoTag = logoBase64?`<img src="${logoBase64}" style="height:56px;max-width:120px;object-fit:contain;vertical-align:middle;margin-right:12px;">`:'';
  const today   = new Date().toLocaleDateString('en-IN',{day:'2-digit',month:'long',year:'numeric'});

  const gstItems = items.map(it=>{
    const base=(parseFloat(it.qty)||0)*(parseFloat(it.rate)||0);
    const disc=it.discountType==='%'?base*(parseFloat(it.discount)||0)/100:(parseFloat(it.discount)||0);
    const taxable=base-disc; const gst=parseFloat(it.gstPercent)||0;
    return {taxable,gstPct:gst,cgst:sameState?taxable*gst/200:0,sgst:sameState?taxable*gst/200:0,igst:sameState?0:taxable*gst/100};
  });
  const cgstRows=[...new Set(gstItems.map(x=>x.gstPct))].filter(r=>r>0&&sameState).map(r=>{
    const tot=gstItems.filter(x=>x.gstPct===r).reduce((s,x)=>s+x.cgst,0);
    return `CGST @ ${r/2}%: ₹${fmtN(tot)}`;
  }).join(' | ');
  const sgstRows=[...new Set(gstItems.map(x=>x.gstPct))].filter(r=>r>0&&sameState).map(r=>{
    const tot=gstItems.filter(x=>x.gstPct===r).reduce((s,x)=>s+x.sgst,0);
    return `SGST @ ${r/2}%: ₹${fmtN(tot)}`;
  }).join(' | ');

  const declaration = po.declaration||`1. Please mention PO Number in each Invoice.\n2. Please ensure proper quality check & inspection of supplied items before dispatch.\n3. If the supplier does not respond within 3 days about any change in PO, the PO shall be deemed accepted &amp; enforced.`;
  const declLines = declaration.split(/\n|<br\s*\/?>/i).map(l=>l.trim()).filter(Boolean).map(l=>`<div style="margin-bottom:3px;">${esc(l)}</div>`).join('');

  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
  @page { size:A4; margin:10mm 12mm; }
  body { font-family:Arial,Helvetica,sans-serif; font-size:9.5pt; color:#111; margin:0; padding:0; }
  table { border-collapse:collapse; width:100%; }
  th,td { font-size:9.5pt; }
  .page-num:after { content: "Page " counter(page) " of " counter(pages); }
</style>
</head><body>
<table style="border:${BL};"><tbody>

<!-- Company Header -->
<tr><td colspan="6" style="${'border:none;text-align:center;padding:10px 14px;'}">
  ${logoTag}
  <div style="font-size:20pt;font-weight:bold;letter-spacing:1px;">${dv(coName)}</div>
  <div style="font-size:8.5pt;color:#444;margin-top:3px;">${dv(coAddr)}</div>
  <div style="font-size:8.5pt;color:#444;">GSTIN: ${dv(company.gstin)} &nbsp;|&nbsp; Ph: ${dv(company.phone)} &nbsp;|&nbsp; Email: ${dv(company.email)}</div>
</td></tr>

<!-- Title -->
<tr><td colspan="6" style="${'border-top:'+SECL+';border-bottom:'+SECL+';border-left:none;border-right:none;text-align:center;font-size:15pt;font-weight:bold;letter-spacing:3px;padding:9px;'}">
  P u r c h a s e &nbsp; O r d e r
</td></tr>

<!-- Vendor + Tax -->
<tr><td colspan="3" style="${'border:none;padding:0;vertical-align:top;width:50%;'}">
  <table><tbody>
    <tr><td colspan="5" style="${subHdr}">Vendor Details</td></tr>
    ${fr('Vendor Name',`<b>${dv(po.vendorName)}</b>`,'GSTIN No',dv(po.vendorGstin))}
    ${fr('Vendor Code',dv(po.vendorCode||po.vendorId),'State',dv(po.vendorState))}
    ${fr('Contact',dv(po.contactPerson),'Mobile',dv(po.mobile))}
    ${fr1('Email',dv(po.email))}
    ${po.mobile2?fr1('Mobile 2',dv(po.mobile2)):''}
  </tbody></table>
</td><td colspan="3" style="${'border-left:'+SECL+';padding:0;vertical-align:top;'}">
  <table><tbody>
    <tr><td colspan="5" style="${subHdr}">Tax Identity</td></tr>
    ${fr('GSTIN No',dv(po.vendorGstin),'State',dv(po.vendorState))}
    ${fr('Mobile',dv(po.mobile),'Mobile 2',dv(po.mobile2))}
  </tbody></table>
</td></tr>

<!-- Order Description -->
<tr><td colspan="6" style="${secHdr}">Order Description</td></tr>
<tr><td colspan="6" style="border:none;padding:0;">
  <table><tbody>
    ${fr('ERP No',dv(po.orderId),'PO Date',fmtD(po.poDate||po.orderDate))}
    ${fr('PO No',`<b>${dv(poNo)}</b>`,'Delivery Date',fmtD(po.deliveryDate))}
    ${fr('PO Type',dv(po.poType),'Payment Terms',dv(po.paymentTerms))}
    ${po.linkedSalesOrderId?fr('Linked SO',`<b>SO #${dv(po.linkedSalesOrderId)}</b>`,'Dispatch Mode',dv(po.dispatchMode)):''}
    ${fr('Purchase By',dv(po.purchasePerson),'Incoterms',dv(po.incoterms))}
  </tbody></table>
</td></tr>

<!-- Delivery & Shipping -->
<tr><td colspan="6" style="${secHdr}">Delivery &amp; Shipping</td></tr>
<tr>
<td colspan="3" style="border:none;padding:0;vertical-align:top;">
  <table><tbody>
    <tr><td colspan="5" style="${subHdr}">Delivery Address</td></tr>
    ${fr1('Address',dv(po.deliveryAddr||po.deliveryAddress))}
    ${fr('City',dv(po.deliveryCity),'State',dv(po.deliveryState))}
    ${fr1('Pincode',dv(po.deliveryPincode))}
    ${fr('Transporter',dv(po.transporterName),'Vehicle No',dv(po.vehicleNumber))}
  </tbody></table>
</td>
<td colspan="3" style="border-left:${SECL};padding:0;vertical-align:top;">
  <table><tbody>
    <tr><td colspan="5" style="${subHdr}">Ship From (Vendor)</td></tr>
    ${fr1('Address',dv(po.shipFromAddress||po.vendorAddress))}
    ${fr('City',dv(po.shipFromCity||po.vendorCity),'State',dv(po.shipFromState||po.vendorState))}
    ${fr1('Pincode',dv(po.shipFromPincode||po.vendorPincode))}
  </tbody></table>
</td>
</tr>

<!-- Item Description -->
<tr><td colspan="6" style="${secHdr}">Item Description</td></tr>
<tr><td colspan="6" style="border:none;padding:0;">
  <table style="border-collapse:collapse;border:${BL};">
    <thead><tr>
      <th style="border-top:none;border-bottom:${BL};border-left:none;border-right:none;font-size:8.5pt;padding:3px 5px;text-align:center;width:30px;">Sr No</th>
      <th style="border-top:none;border-bottom:${BL};border-left:${BL};border-right:none;font-size:8.5pt;padding:3px 5px;">Item Name</th>
      <th style="border-top:none;border-bottom:${BL};border-left:${BL};border-right:none;font-size:8.5pt;padding:3px 5px;">Specs / Description</th>
      <th style="border-top:none;border-bottom:${BL};border-left:${BL};border-right:none;font-size:8.5pt;padding:3px 5px;width:75px;">HSN Code</th>
      <th style="border-top:none;border-bottom:${BL};border-left:${BL};border-right:none;font-size:8.5pt;padding:3px 5px;width:45px;">Qty</th>
      <th style="border-top:none;border-bottom:${BL};border-left:${BL};border-right:none;font-size:8.5pt;padding:3px 5px;width:50px;">Unit</th>
      <th style="border-top:none;border-bottom:${BL};border-left:${BL};border-right:none;font-size:8.5pt;padding:3px 5px;width:75px;">Rate</th>
      <th style="border-top:none;border-bottom:${BL};border-left:${BL};border-right:none;font-size:8.5pt;padding:3px 5px;width:60px;">Disc</th>
      <th style="border-top:none;border-bottom:${BL};border-left:${BL};border-right:none;font-size:8.5pt;padding:3px 5px;width:50px;">GST%</th>
      <th style="border-top:none;border-bottom:${BL};border-left:${BL};border-right:none;font-size:8.5pt;padding:3px 5px;width:90px;">Amount</th>
    </tr></thead>
    <tbody>${itemRows}${chgRows}</tbody>
    <tfoot>${footRows.join('')}</tfoot>
  </table>
</td></tr>

<!-- Amount in Words -->
<tr><td colspan="6" style="border-top:${SECL};border-bottom:none;border-left:none;border-right:none;padding:6px 8px;">
  <b>Amount in Words:</b> ${numWords(grand)}
</td></tr>

${po.termsConditions?`
<tr><td colspan="6" style="${secHdr}">Terms &amp; Conditions</td></tr>
<tr><td colspan="6" style="border:none;padding:6px 8px;font-size:9pt;white-space:pre-wrap;">${dv(po.termsConditions)}</td></tr>`:''}

<!-- Declaration -->
<tr><td colspan="6" style="${secHdr}">Declaration</td></tr>
<tr><td colspan="6" style="border:none;padding:6px 8px;font-size:9pt;">${declLines}</td></tr>

<!-- Signature Row -->
<tr>
  <td colspan="2" style="border-top:${SECL};padding:22px 8px 6px;text-align:center;font-size:9pt;">Prepared By</td>
  <td colspan="2" style="border-top:${SECL};border-left:${SECL};padding:22px 8px 6px;text-align:center;font-size:9pt;">Checked By</td>
  <td colspan="2" style="border-top:${SECL};border-left:${SECL};padding:22px 8px 6px;text-align:center;font-size:9pt;font-weight:bold;">Authorised Signatory<br><span style="font-weight:normal;">For ${dv(coName)}</span></td>
</tr>

<!-- Printed date -->
<tr><td colspan="6" style="border-top:${BL};border-left:none;border-right:none;border-bottom:none;padding:3px 8px;text-align:right;font-size:8pt;color:#666;">
  Printed: ${today}
</td></tr>

</tbody></table>
</body></html>`;
}

// POST - Send PO email to vendor
router.post('/:orderId/send-email', async (req, res) => {
  try {
    const { orderId } = req.params;
    const { companyId, to, cc, bcc, subject, message, attachFileNames = [], poHtml = '' } = req.body;

    const EMAIL_CFG_FILE = path.join(ROOT, 'Database', 'email-config.json');
    const cfg = fs.existsSync(EMAIL_CFG_FILE) ? JSON.parse(fs.readFileSync(EMAIL_CFG_FILE, 'utf8')) : {};
    if (!cfg.email || !cfg.password)
      return res.status(400).json({ error: 'Email not configured. Go to Admin → Email Config.' });

    let po;
    if (!db.connected) {
      po = jstore.readOne('PurchaseOrder', companyId, orderId);
    } else {
      const [[row]] = await db.query('SELECT * FROM purchase_orders WHERE id = ? AND company_id = ?', [orderId, companyId]);
      po = row ? parseJ(row.data, {}) : null;
    }
    if (!po) return res.status(404).json({ error: 'PO not found' });

    const fmtD = v => { if (!v) return '—'; const d = new Date(v); return isNaN(d) ? v : `${String(d.getDate()).padStart(2,'0')}-${String(d.getMonth()+1).padStart(2,'0')}-${d.getFullYear()}`; };
    const fmtN = n => Number(n||0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const poNo = po.poNo || po.voucherNumber || orderId;
    const items = po.items || [];
    const grand = parseFloat(po.grandTotal) || 0;

    const itemRows = items.map((it, i) => `
      <tr style="background:${i%2===0?'#fff':'#f7f9fc'}">
        <td style="padding:8px 10px;border:1px solid #dde;">${i+1}</td>
        <td style="padding:8px 10px;border:1px solid #dde;font-weight:600;">${it.itemName||it.description||'—'}</td>
        ${it.description&&it.description!==(it.itemName||'')?`<td style="padding:8px 10px;border:1px solid #dde;font-size:12px;color:#555;">${it.description}</td>`:'<td style="padding:8px 10px;border:1px solid #dde;">—</td>'}
        <td style="padding:8px 10px;border:1px solid #dde;text-align:center;">${it.qty||0} ${it.unit||''}</td>
        <td style="padding:8px 10px;border:1px solid #dde;text-align:right;">₹ ${fmtN(it.rate)}</td>
        <td style="padding:8px 10px;border:1px solid #dde;text-align:center;">${it.gstPercent||0}%</td>
      </tr>`).join('');

    const emailHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;padding:0;background:#f0f4f8;font-family:Arial,Helvetica,sans-serif;">
<div style="max-width:660px;margin:24px auto;background:#fff;border-radius:6px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.1);">

  <!-- Header -->
  <div style="background:#1a3c6e;padding:22px 28px;">
    <div style="font-size:22px;font-weight:bold;color:#fff;letter-spacing:1px;">${cfg.fromName||'Epsilon Enterprise'}</div>
    <div style="color:rgba(255,255,255,0.75);font-size:12px;margin-top:4px;">${cfg.email||''}</div>
  </div>

  <!-- PO Banner -->
  <div style="background:#2563EB;padding:14px 28px;display:flex;justify-content:space-between;align-items:center;">
    <span style="color:#fff;font-size:20px;font-weight:bold;letter-spacing:2px;">PURCHASE ORDER</span>
    <span style="color:#dbeafe;font-size:18px;font-weight:700;">${poNo}</span>
  </div>

  <!-- Body -->
  <div style="padding:28px;color:#222;">
    <p style="font-size:15px;margin:0 0 8px;">Dear <strong>${po.vendorName||'Vendor'}</strong>,</p>
    <div style="font-size:14px;line-height:1.7;margin-bottom:20px;white-space:pre-wrap;">${(message||'').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div>

    <!-- PO Summary -->
    <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:20px;border:1px solid #dde;">
      <thead>
        <tr style="background:#1a3c6e;color:#fff;">
          <th colspan="2" style="padding:8px 14px;text-align:left;font-size:12px;letter-spacing:0.5px;">PO SUMMARY</th>
        </tr>
      </thead>
      <tbody>
        <tr style="background:#f7f9fc"><td style="padding:7px 14px;border:1px solid #dde;color:#555;width:45%;">PO Number</td><td style="padding:7px 14px;border:1px solid #dde;font-weight:700;">${poNo}</td></tr>
        <tr><td style="padding:7px 14px;border:1px solid #dde;color:#555;">PO Date</td><td style="padding:7px 14px;border:1px solid #dde;">${fmtD(po.poDate||po.orderDate)}</td></tr>
        <tr style="background:#f7f9fc"><td style="padding:7px 14px;border:1px solid #dde;color:#555;">Delivery Date</td><td style="padding:7px 14px;border:1px solid #dde;font-weight:600;color:#c05000;">${fmtD(po.deliveryDate)}</td></tr>
        <tr><td style="padding:7px 14px;border:1px solid #dde;color:#555;">Payment Terms</td><td style="padding:7px 14px;border:1px solid #dde;">${po.paymentTerms||'—'}</td></tr>
        <tr style="background:#f7f9fc"><td style="padding:7px 14px;border:1px solid #dde;color:#555;">Status</td><td style="padding:7px 14px;border:1px solid #dde;"><span style="background:#d1fae5;color:#065f46;padding:2px 10px;border-radius:20px;font-weight:700;font-size:12px;">APPROVED</span></td></tr>
        <tr><td style="padding:7px 14px;border:1px solid #dde;color:#555;">Total Value</td><td style="padding:7px 14px;border:1px solid #dde;font-size:16px;font-weight:800;color:#1a3c6e;">₹ ${fmtN(grand)}</td></tr>
      </tbody>
    </table>

    <!-- Items -->
    ${items.length > 0 ? `
    <div style="font-size:13px;font-weight:700;margin-bottom:8px;color:#1a3c6e;">Items Ordered</div>
    <table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:20px;">
      <thead>
        <tr style="background:#1a3c6e;color:#fff;">
          <th style="padding:7px 10px;border:1px solid #2a5a9e;text-align:center;width:30px;">#</th>
          <th style="padding:7px 10px;border:1px solid #2a5a9e;text-align:left;">Item Name</th>
          <th style="padding:7px 10px;border:1px solid #2a5a9e;text-align:left;">Description / Specs</th>
          <th style="padding:7px 10px;border:1px solid #2a5a9e;text-align:center;">Qty</th>
          <th style="padding:7px 10px;border:1px solid #2a5a9e;text-align:right;">Rate</th>
          <th style="padding:7px 10px;border:1px solid #2a5a9e;text-align:center;">GST%</th>
        </tr>
      </thead>
      <tbody>${itemRows}</tbody>
    </table>` : ''}

    <p style="font-size:13px;color:#444;margin-top:12px;">Please confirm receipt of this Purchase Order and provide the expected delivery schedule.</p>
    <p style="font-size:13px;color:#444;">For queries, reply to this email.</p>
  </div>

  <!-- Footer -->
  <div style="background:#f0f4f8;padding:14px 28px;text-align:center;font-size:11px;color:#888;border-top:1px solid #e0e0e0;">
    This is an automated email from <strong>${cfg.fromName||'Epsilon Enterprise'}</strong> ERP System &nbsp;·&nbsp; Do not reply directly to this email.
  </div>
</div>
</body></html>`;

    // ── Generate PO PDF using puppeteer (from client-generated HTML) ──
    let poPdfBuffer = null;
    if (poHtml) {
      try {
        const puppeteer = require('puppeteer');
        const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox','--disable-setuid-sandbox'] });
        const page = await browser.newPage();
        await page.setContent(poHtml, { waitUntil: 'domcontentloaded' });
        poPdfBuffer = await page.pdf({ format: 'A4', printBackground: true, margin: { top:'10mm', bottom:'14mm', left:'10mm', right:'10mm' } });
        await browser.close();
      } catch (pdfErr) {
        console.error('PO PDF generation failed:', pdfErr.message);
      }
    }

    // ── File attachments ──
    const docsPath = docsBase(companyId, orderId);
    const fileAtts = attachFileNames
      .map(fn => {
        const fp = path.join(docsPath, fn);
        if (!fs.existsSync(fp)) return null;
        return { filename: fn, content: fs.readFileSync(fp) };
      })
      .filter(Boolean);

    const notFound = attachFileNames.filter(fn => !fs.existsSync(path.join(docsPath, fn)));

    // PO PDF first, then spec files
    const allAttachments = [
      ...(poPdfBuffer ? [{ filename: `Purchase Order - ${poNo}.pdf`, content: poPdfBuffer }] : []),
      ...fileAtts,
    ];

    const nodemailer = require('nodemailer');
    const transport = nodemailer.createTransport({
      service: cfg.service && cfg.service !== 'custom' ? cfg.service : undefined,
      host:    cfg.host    || undefined,
      port:    cfg.port    ? Number(cfg.port) : undefined,
      secure:  cfg.secure  !== undefined ? cfg.secure : undefined,
      auth:    { user: cfg.email, pass: cfg.password },
    });

    await transport.sendMail({
      from:    `"${cfg.fromName||'Epsilon Enterprise'}" <${cfg.email}>`,
      to, cc: cc||undefined, bcc: bcc||undefined,
      subject: subject || `Purchase Order ${poNo} — Approved`,
      html:    emailHtml,
      attachments: allAttachments,
    });

    const totalAtts = allAttachments.length;
    const msg = `Email sent to ${to} with ${totalAtts} attachment(s)${!poPdfBuffer?' (PO PDF generation failed — check server logs)':''}${notFound.length>0?` (${notFound.length} file(s) not found on disk)`:''}`;
    res.json({ ok: true, message: msg });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET - Render attachment as embeddable content (PDF base64 / Excel / Word / TXT)
router.get('/:orderId/render-attachment/:fileName', async (req, res) => {
  try {
    const fp = path.join(docsBase(req.query.companyId, req.params.orderId), req.params.fileName);
    if (!fs.existsSync(fp)) return res.status(404).json({ error: 'File not found' });
    const ext = path.extname(req.params.fileName).toLowerCase();
    if (ext === '.pdf') {
      return res.json({ kind: 'pdf', base64: `data:application/pdf;base64,${fs.readFileSync(fp).toString('base64')}` });
    }
    if (['.xlsx', '.xls'].includes(ext)) {
      const XLSX = require('xlsx');
      const wb = XLSX.readFile(fp);
      let html = '';
      wb.SheetNames.forEach(name => {
        const ws = wb.Sheets[name];
        html += `<div style="margin-bottom:8px;"><div style="background:#1a3c6e;color:#fff;font-weight:700;padding:3px 8px;">Sheet: ${name}</div>${XLSX.utils.sheet_to_html(ws,{editable:false})}</div>`;
      });
      return res.json({ kind: 'excel', html });
    }
    if (['.docx', '.doc'].includes(ext)) {
      try {
        const mammoth = require('mammoth');
        const result  = await mammoth.convertToHtml({ path: fp });
        return res.json({ kind: 'word', html: result.value });
      } catch {
        return res.json({ kind: 'word', html: '<p><em>Word document — cannot render inline.</em></p>' });
      }
    }
    if (ext === '.txt') return res.json({ kind: 'text', text: fs.readFileSync(fp, 'utf8') });
    return res.json({ kind: 'unknown' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ── GET /:orderId/vendor-bills — list vendor bills for admin ── */
router.get('/:orderId/vendor-bills', async (req, res) => {
  try {
    const companyId = req.query.companyId;
    const po = jstore.readOne('PurchaseOrder', companyId, req.params.orderId);
    if (!po) return res.status(404).json({ error: 'PO not found' });
    res.json(po.vendorBills || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ── PUT /:orderId/vendor-bills/:billId — admin approve / reject vendor bill ── */
router.put('/:orderId/vendor-bills/:billId', async (req, res) => {
  try {
    const { orderId, billId } = req.params;
    const { status, adminRemarks, companyId: bodyCompanyId } = req.body;
    const companyId = req.query.companyId || bodyCompanyId;
    const po = jstore.readOne('PurchaseOrder', companyId, orderId);
    if (!po) return res.status(404).json({ error: 'PO not found' });
    const bills = po.vendorBills || [];
    const idx = bills.findIndex(b => b.billId === billId);
    if (idx === -1) return res.status(404).json({ error: 'Bill not found' });
    bills[idx] = { ...bills[idx], status, adminRemarks: adminRemarks || '', reviewedAt: new Date().toISOString() };
    po.vendorBills = bills;
    saveJson(poJsonPath(companyId, orderId), po);
    res.json({ success: true, bill: bills[idx] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ── GET /:orderId/vendor-bills/:fileName — admin download vendor bill file ── */
router.get('/:orderId/vendor-bill-file/:fileName', async (req, res) => {
  try {
    const companyId = req.query.companyId;
    const { orderId, fileName } = req.params;
    const fp = path.join(ROOT, 'Database', 'Companies', companyId, 'PurchaseOrder', String(orderId), 'vendor-bills', fileName);
    if (!fs.existsSync(fp)) return res.status(404).json({ error: 'File not found.' });
    res.download(fp, fileName);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
