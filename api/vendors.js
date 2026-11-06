const express = require('express');
const path    = require('path');
const fs      = require('fs');
const multer  = require('multer');
const XLSX    = require('xlsx');
const { ROOT, upload, saveUploadedFiles, saveJson, auditEntry, pushAudit, resolveUser } = require('./helpers');
const { notifyApprovers } = require('./notifications');
const jstore  = require('./json-store');

/* ── multer for Excel upload (memory storage) ── */
const xlsUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

/* ── Column definitions — drives both sample generation and import parsing ── */
const VL_COLS = [
  { key:'vendorName',    hdr:'Vendor Name *',      hint:'Full legal company name',           req:true  },
  { key:'businessType',  hdr:'Business Type *',     hint:'Proprietorship/Partnership/Pvt Ltd/LLP/Government/Individual/Trust',req:true },
  { key:'industryType',  hdr:'Industry Type',       hint:'Manufacturing/Trading/Services etc',req:false },
  { key:'pan',           hdr:'PAN Number',          hint:'10-char PAN e.g. ABCDE1234F',      req:false },
  { key:'gst',           hdr:'GST Number',          hint:'15-char GSTIN e.g. 22AAAAA0000A1Z5',req:false },
  { key:'gstType',       hdr:'GST Type',            hint:'Regular/Composition/Unregistered/SEZ',req:false },
  { key:'cin',           hdr:'CIN Number',          hint:'21-char CIN (optional)',            req:false },
  { key:'msme',          hdr:'MSME / Udyam No.',    hint:'UDYAM-XX-00-0000000 (optional)',   req:false },
  { key:'gstRegistered', hdr:'GST Registered',      hint:'Yes / No',                         req:false },
  { key:'tdsApplicable', hdr:'TDS Applicable',      hint:'Yes / No',                         req:false },
  { key:'contactPerson', hdr:'Contact Person *',    hint:'Primary contact full name',         req:true  },
  { key:'mobile',        hdr:'Mobile Number *',     hint:'10-digit mobile starting 6-9',      req:true  },
  { key:'altMobile',     hdr:'Alternate Mobile',    hint:'10-digit mobile (optional)',        req:false },
  { key:'email',         hdr:'Email Address',       hint:'name@domain.com',                  req:false },
  { key:'website',       hdr:'Website',             hint:'https://example.com',              req:false },
  { key:'landline',      hdr:'Landline',            hint:'STD code + number',                req:false },
  { key:'billingAddr',   hdr:'Billing Address *',   hint:'Full billing address',              req:true  },
  { key:'shippingAddr',  hdr:'Shipping Address',    hint:'Leave blank to copy billing address',req:false },
  { key:'city',          hdr:'City *',              hint:'City name',                        req:true  },
  { key:'state',         hdr:'State *',             hint:'Full state name e.g. Maharashtra',  req:true  },
  { key:'pincode',       hdr:'Pincode',             hint:'6-digit pincode',                  req:false },
  { key:'country',       hdr:'Country',             hint:'Default: India',                   req:false },
  { key:'bankName',      hdr:'Bank Name',           hint:'e.g. State Bank of India',         req:false },
  { key:'accountHolder', hdr:'Account Holder Name', hint:'Name on bank account',             req:false },
  { key:'accountNo',     hdr:'Account Number',      hint:'Bank account number',              req:false },
  { key:'ifsc',          hdr:'IFSC Code',           hint:'e.g. SBIN0001234',                 req:false },
  { key:'branch',        hdr:'Bank Branch',         hint:'Branch name/city',                 req:false },
  { key:'upi',           hdr:'UPI ID',              hint:'name@upi',                         req:false },
  { key:'paymentTerms',  hdr:'Payment Terms',       hint:'30 Days / 60 Days / Immediate etc',req:false },
  { key:'creditLimit',   hdr:'Credit Limit (₹)',    hint:'Number only e.g. 500000',          req:false },
  { key:'paymentModes',  hdr:'Payment Modes',       hint:'Comma-separated: NEFT,RTGS,UPI',   req:false },
  { key:'currency',      hdr:'Currency',            hint:'INR / USD / EUR (default INR)',     req:false },
  { key:'category',      hdr:'Category',            hint:'Regular / Preferred / Blacklisted', req:false },
  { key:'purchasePerson',hdr:'Purchase Person',     hint:'Assigned purchase manager name',   req:false },
  { key:'remarks',       hdr:'Remarks',             hint:'Internal notes (optional)',         req:false },
];

const vendorJsonPath = (companyId, vendorId, name) => {
  const safe = (name || '').replace(/[\\/:*?"<>|]/g, '_').slice(0, 60);
  return path.join(ROOT, 'Database', 'Companies', companyId, 'Vendor', String(vendorId), `${vendorId}-${safe}.json`);
};
const db = require('../db');

const router = express.Router();

const docsBase = (companyId, vendorId) =>
  path.join(ROOT, 'Database', 'Companies', companyId, 'Vendor', String(vendorId), 'docs');

const parseJ = (v, fb = []) => {
  if (Array.isArray(v) || (v && typeof v === 'object')) return v;
  try { return JSON.parse(v); } catch { return fb; }
};

const toRow = r => ({
  vendorId:       r.id,
  vendorName:     r.name,
  address:        r.address,
  city:           r.city,
  state:          r.state,
  pincode:        r.pincode,
  gstin:          r.gstin,
  gstType:        r.gst_type,
  status:         r.status,
  contactPersons: parseJ(r.contacts,  []),
  documents:      parseJ(r.documents, []),
  ...(parseJ(r.extra, {})),
  createdAt:      r.created_at,
  updatedAt:      r.updated_at,
});

// GET - List all vendors
router.get('/', async (req, res) => {
  try {
    if (!db.connected) {
      return res.json(jstore.readAll('Vendor', req.query.companyId));
    }
    const [rows] = await db.query('SELECT * FROM vendors WHERE company_id = ? ORDER BY id', [req.query.companyId]);
    res.json(rows.map(toRow));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET - Next ID
router.get('/next-id', async (req, res) => {
  try {
    if (!db.connected) {
      return res.json({ nextId: jstore.nextId('Vendor', req.query.companyId, 200001) });
    }
    const [[row]] = await db.query('SELECT MAX(id) AS max_id FROM vendors');
    res.json({ nextId: row.max_id ? row.max_id + 1 : 200001 });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ── GET /api/vendors/sample-excel ── */
router.get('/sample-excel', (req, res) => {
  try {
    const wb = XLSX.utils.book_new();

    const ws = XLSX.utils.aoa_to_sheet([
      VL_COLS.map(c => c.hdr),
      VL_COLS.map(c => c.hint),
    ]);
    ws['!cols'] = VL_COLS.map(c => ({ wch: Math.max(c.hdr.length + 2, c.hint.length * 0.55, 16) }));
    ws['!freeze'] = { xSplit: 0, ySplit: 2 };
    XLSX.utils.book_append_sheet(wb, ws, 'Vendor Template');

    const guide = XLSX.utils.aoa_to_sheet([
      ['Column Name', 'Required?', 'Description / Example', 'Notes'],
      ...VL_COLS.map(c => [c.hdr.replace(' *',''), c.req ? 'YES ★' : 'No', c.hint, '']),
    ]);
    guide['!cols'] = [{ wch: 28 }, { wch: 12 }, { wch: 45 }, { wch: 20 }];
    XLSX.utils.book_append_sheet(wb, guide, 'Field Guide');

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Disposition', 'attachment; filename="Vendor_Import_Template.xlsx"');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buf);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ── POST /api/vendors/import-excel ── */
router.post('/import-excel', xlsUpload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });

    const companyId = req.body.companyId || req.query.companyId;
    if (!companyId) return res.status(400).json({ error: 'companyId is required.' });

    const wb    = XLSX.read(req.file.buffer, { type: 'buffer' });
    const ws    = wb.Sheets[wb.SheetNames[0]];
    const rows  = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

    const dataRows = rows.slice(2).filter(r => r.some(cell => String(cell).trim() !== ''));
    if (!dataRows.length) return res.status(400).json({ error: 'No data rows found in the Excel file.' });

    const results  = [];
    const errors   = [];
    const colKeys  = VL_COLS.map(c => c.key);

    for (let i = 0; i < dataRows.length; i++) {
      const row    = dataRows[i];
      const rowNum = i + 3;
      const data   = {};
      colKeys.forEach((key, idx) => { data[key] = String(row[idx] || '').trim(); });

      const missing = VL_COLS.filter(c => c.req && !data[c.key]).map(c => c.hdr.replace(' *', ''));
      if (missing.length) {
        errors.push({ row: rowNum, name: data.vendorName || `Row ${rowNum}`, error: `Missing required: ${missing.join(', ')}` });
        continue;
      }

      try {
        const now = new Date().toISOString();
        const vendorId = db.connected
          ? await (async () => { const [[r]] = await db.query('SELECT MAX(id) AS m FROM vendors'); return r.m ? r.m + 1 : 200001; })()
          : jstore.nextId('Vendor', companyId, 200001);

        const paymentModes = data.paymentModes ? data.paymentModes.split(',').map(s => s.trim()).filter(Boolean) : [];
        const contactList  = [{ name: data.contactPerson, mobileNumber: data.mobile, altMobile: data.altMobile, email: data.email, website: data.website, landline: data.landline }];

        if (db.connected) {
          await db.query(
            `INSERT INTO vendors (id,company_id,name,address,city,state,pincode,gstin,gst_type,status,contacts,documents) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
            [vendorId, companyId, data.vendorName, data.billingAddr, data.city, data.state, data.pincode, data.gst, data.gstType || 'Regular', 'pending', JSON.stringify(contactList), '[]']
          );
        }

        const fullData = {
          vendorId, companyId, vendorName: data.vendorName, status: 'pending',
          businessType: data.businessType, industryType: data.industryType,
          pan: data.pan.toUpperCase(), gst: data.gst.toUpperCase(), gstin: data.gst.toUpperCase(),
          cin: data.cin, msme: data.msme, gstType: data.gstType || 'Regular',
          gstRegistered: (data.gstRegistered || '').toLowerCase() !== 'no',
          tdsApplicable: (data.tdsApplicable || '').toLowerCase() === 'yes',
          contactPersons: contactList, contactPerson: data.contactPerson,
          mobile: data.mobile, altMobile: data.altMobile, email: data.email,
          landline: data.landline, website: data.website,
          address: data.billingAddr, billingAddr: data.billingAddr,
          shippingAddr: data.shippingAddr || data.billingAddr,
          city: data.city, state: data.state, pincode: data.pincode, country: data.country || 'India',
          bankName: data.bankName, accountHolder: data.accountHolder,
          accountNo: data.accountNo, ifsc: data.ifsc.toUpperCase(),
          branch: data.branch, upi: data.upi,
          paymentTerms: data.paymentTerms || '30 Days', creditLimit: data.creditLimit,
          paymentModes, currency: data.currency || 'INR',
          category: data.category || 'Regular', purchasePerson: data.purchasePerson, remarks: data.remarks,
          documents: [], importSource: 'excel',
          createdAt: now, updatedAt: now,
        };

        saveJson(vendorJsonPath(companyId, vendorId, data.vendorName), fullData);
        results.push({ row: rowNum, vendorId, name: data.vendorName });
      } catch (e) {
        errors.push({ row: rowNum, name: data.vendorName || `Row ${rowNum}`, error: e.message });
      }
    }

    res.json({ total: dataRows.length, imported: results.length, failed: errors.length, results, errors });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET - Single vendor
router.get('/:vendorId', async (req, res) => {
  try {
    const companyId = req.query.companyId;
    const { vendorId } = req.params;

    // Always prefer the rich JSON file — it has ALL fields (businessType, pan, bank, etc.)
    if (companyId) {
      const jsonRec = jstore.readOne('Vendor', companyId, vendorId);
      if (jsonRec) return res.json(jsonRec);
    }

    // Fall back to DB if JSON not found
    if (db.connected) {
      const [[row]] = await db.query('SELECT * FROM vendors WHERE id = ?', [vendorId]);
      if (!row) return res.status(404).json({ error: 'Vendor not found' });
      return res.json(toRow(row));
    }

    res.status(404).json({ error: 'Vendor not found' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST - Create vendor
router.post('/', upload.array('documents'), async (req, res) => {
  try {
    const b = req.body;
    const companyId = req.query.companyId || b.companyId;
    const { vendorName, address, city, state, pincode, gstin, gstType, contactPersons, documents, status = 'draft' } = b;

    const vendorId = db.connected
      ? await (async () => {
          const [[row]] = await db.query('SELECT MAX(id) AS max_id FROM vendors');
          return row.max_id ? row.max_id + 1 : 200001;
        })()
      : jstore.nextId('Vendor', companyId, 200001);

    const docsPath = docsBase(companyId, vendorId);

    const contactList = typeof contactPersons === 'string' ? JSON.parse(contactPersons) : (contactPersons || []);
    let docList = typeof documents === 'string' ? JSON.parse(documents) : (Array.isArray(documents) ? documents : []);

    const saved = req.files && req.files.length > 0
      ? (fs.mkdirSync(docsPath, { recursive: true }), saveUploadedFiles(req.files, docsPath))
      : [];
    saved.forEach((s, i) => { if (docList[i]) { docList[i].filePath = s.filePath; docList[i].fileName = s.fileName; } else docList.push(s); });

    const extra = {
      vendorCode:    b.vendorCode    || '',
      businessType:  b.businessType  || '',
      industryType:  b.industryType  || '',
      pan:           b.pan           || '',
      cin:           b.cin           || '',
      msme:          b.msme          || '',
      contactPerson: b.contactPerson || '',
      mobile:        b.mobile        || '',
      altMobile:     b.altMobile     || '',
      email:         b.email         || '',
      website:       b.website       || '',
      landline:      b.landline      || '',
      shippingAddr:  b.shippingAddr  || '',
      country:       b.country       || 'India',
      gstRegistered: b.gstRegistered,
      tdsApplicable: b.tdsApplicable || b.tcsApplicable,
      tcsApplicable: b.tcsApplicable || b.tdsApplicable,
      bankName:      b.bankName      || '',
      accountHolder: b.accountHolder || '',
      accountNo:     b.accountNo     || '',
      ifsc:          b.ifsc          || '',
      branch:        b.branch        || '',
      upi:           b.upi           || '',
      paymentTerms:  b.paymentTerms  || '',
      creditLimit:   b.creditLimit   || '',
      paymentModes:  b.paymentModes  ? (typeof b.paymentModes === 'string' ? JSON.parse(b.paymentModes) : b.paymentModes) : [],
      currency:      b.currency      || 'INR',
      category:      b.category      || '',
      purchasePerson:b.purchasePerson|| '',
      remarks:       b.remarks       || '',
      alias:         b.alias         || '',
      // Dispatch From: where the vendor sends the goods from (Bill From is the vendor's own address above)
      dispatchSame:  b.dispatchSame === 'false' || b.dispatchSame === false ? false : true,
      dispatchFrom:  (() => { try { const d = typeof b.dispatchFrom === 'string' ? JSON.parse(b.dispatchFrom) : b.dispatchFrom; return d && typeof d === 'object' ? { address: String(d.address || ''), city: String(d.city || ''), state: String(d.state || ''), pincode: String(d.pincode || ''), country: String(d.country || 'India') } : null; } catch { return null; } })(),
    };

    if (!extra.vendorCode) extra.vendorCode = String(vendorId);   // the vendor code is the vendor id unless one is typed

    if (db.connected) {
      await db.query(
        `INSERT INTO vendors (id, company_id, name, address, city, state, pincode, gstin, gst_type, status, contacts, documents, extra)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [vendorId, companyId, vendorName, address, city, state, pincode, gstin, gstType, status, JSON.stringify(contactList), JSON.stringify(docList), JSON.stringify(extra)]
      );
    }

    const now = new Date().toISOString();
    saveJson(vendorJsonPath(companyId, vendorId, vendorName), {
      vendorId, vendorName, address, city, state, pincode, gstin, gstType,
      contactPersons: contactList, documents: docList, status, ...extra,
      createdAt: now, updatedAt: now,
      audit: [auditEntry(req, 'created')],
    });

    if (status === 'pending') {
      const submitter = resolveUser(req);
      notifyApprovers({
        companyId, module: 'vendor', recordId: vendorId,
        recordLabel: `Vendor ${vendorName || vendorId}`,
        message: `Vendor ${vendorName || vendorId} needs your approval`,
        link: '/vendor/pending',
        createdBy: submitter?.name || submitter?.username || 'System',
        targetUserId: b.approverId || null,
      });
    }

    res.json({ success: true, vendorId, message: `Vendor created with ID: ${vendorId}` });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT - Update vendor
router.put('/:vendorId', upload.array('newFiles'), async (req, res) => {
  try {
    const { vendorId } = req.params;
    const b = req.body;
    const companyId = req.query.companyId || b.companyId;
    const str = k => (Array.isArray(b[k]) ? b[k][0] : b[k]) || '';
    const { vendorName, address, city, state, pincode, gstin, gstType, contactPersons, documents } = b;
    // Preserve existing status — editing should not reset an approved vendor back to pending
    const existingRecord = (() => {
      try { return jstore.readOne('Vendor', companyId, vendorId) || {}; } catch { return {}; }
    })();
    const status = str('status') || existingRecord.status || 'approved';

    let existingCreatedAt;
    if (db.connected) {
      const [[existing]] = await db.query('SELECT * FROM vendors WHERE id = ? AND company_id = ?', [vendorId, companyId]);
      if (!existing) return res.status(404).json({ error: 'Vendor not found' });
      existingCreatedAt = existing.created_at;
    } else {
      const existing = jstore.readOne('Vendor', companyId, vendorId);
      if (!existing) return res.status(404).json({ error: 'Vendor not found' });
      existingCreatedAt = existing.createdAt;
    }

    const contactList = typeof contactPersons === 'string' ? JSON.parse(contactPersons) : (contactPersons || []);
    let docList = typeof documents === 'string' ? JSON.parse(documents) : (Array.isArray(documents) ? documents : []);

    const docsPath = docsBase(companyId, vendorId);
    fs.mkdirSync(docsPath, { recursive: true });

    const fileNames = b.fileNames ? JSON.parse(b.fileNames) : [];
    const saved = saveUploadedFiles(req.files, docsPath, fileNames);
    saved.forEach(s => docList.push(s));

    const extra = {
      vendorCode:    b.vendorCode    || '',
      businessType:  b.businessType  || '',
      industryType:  b.industryType  || '',
      pan:           b.pan           || '',
      cin:           b.cin           || '',
      msme:          b.msme          || '',
      contactPerson: b.contactPerson || '',
      mobile:        b.mobile        || '',
      altMobile:     b.altMobile     || '',
      email:         b.email         || '',
      website:       b.website       || '',
      landline:      b.landline      || '',
      shippingAddr:  b.shippingAddr  || '',
      country:       b.country       || 'India',
      gstRegistered: b.gstRegistered,
      tdsApplicable: b.tdsApplicable || b.tcsApplicable,
      tcsApplicable: b.tcsApplicable || b.tdsApplicable,
      bankName:      b.bankName      || '',
      accountHolder: b.accountHolder || '',
      accountNo:     b.accountNo     || '',
      ifsc:          b.ifsc          || '',
      branch:        b.branch        || '',
      upi:           b.upi           || '',
      paymentTerms:  b.paymentTerms  || '',
      creditLimit:   b.creditLimit   || '',
      paymentModes:  b.paymentModes  ? (typeof b.paymentModes === 'string' ? JSON.parse(b.paymentModes) : b.paymentModes) : [],
      currency:      b.currency      || 'INR',
      category:      b.category      || '',
      purchasePerson:b.purchasePerson|| '',
      remarks:       b.remarks       || '',
      alias:         b.alias         || '',
      // Dispatch From: where the vendor sends the goods from (Bill From is the vendor's own address above)
      dispatchSame:  b.dispatchSame === 'false' || b.dispatchSame === false ? false : true,
      dispatchFrom:  (() => { try { const d = typeof b.dispatchFrom === 'string' ? JSON.parse(b.dispatchFrom) : b.dispatchFrom; return d && typeof d === 'object' ? { address: String(d.address || ''), city: String(d.city || ''), state: String(d.state || ''), pincode: String(d.pincode || ''), country: String(d.country || 'India') } : null; } catch { return null; } })(),
    };

    // a form that does not send these (the classic vendor form) keeps what is saved
    if (b.alias === undefined) extra.alias = existingRecord.alias || '';
    if (!extra.vendorCode) extra.vendorCode = existingRecord.vendorCode || String(vendorId);
    if (b.dispatchSame === undefined) { extra.dispatchSame = existingRecord.dispatchSame !== false; extra.dispatchFrom = existingRecord.dispatchFrom || null; }

    if (db.connected) {
      await db.query(
        `UPDATE vendors SET name=?, address=?, city=?, state=?, pincode=?, gstin=?, gst_type=?, status=?, contacts=?, documents=?, extra=? WHERE id=? AND company_id=?`,
        [vendorName, address, city, state, pincode, gstin, gstType, status, JSON.stringify(contactList), JSON.stringify(docList), JSON.stringify(extra), vendorId, companyId]
      );
    }

    // Delete old JSON files to prevent duplicates when vendor name changes
    const vendorDir = path.join(ROOT, 'Database', 'Companies', companyId, 'Vendor', String(vendorId));
    if (fs.existsSync(vendorDir)) {
      fs.readdirSync(vendorDir)
        .filter(f => f.endsWith('.json'))
        .forEach(f => { try { fs.unlinkSync(path.join(vendorDir, f)); } catch {} });
    }

    const vOldStatus = existingRecord.status;
    const vNewStatus = status;
    const vAction = vNewStatus !== vOldStatus
      ? (vNewStatus === 'approved' ? 'approved' : vNewStatus === 'rejected' ? 'rejected' : 'status_changed')
      : 'edited';
    const vExtra = vNewStatus !== vOldStatus ? { from: vOldStatus, to: vNewStatus } : {};
    saveJson(vendorJsonPath(companyId, vendorId, vendorName), {
      ...existingRecord,
      vendorId: parseInt(vendorId), vendorName, address, city, state, pincode, gstin, gstType,
      contactPersons: contactList, documents: docList, status, ...extra,
      createdAt: existingCreatedAt, updatedAt: new Date().toISOString(),
      audit: pushAudit(existingRecord, req, vAction, vExtra),
    });

    if (vNewStatus === 'pending' && vOldStatus !== 'pending') {
      const submitter = resolveUser(req);
      notifyApprovers({
        companyId, module: 'vendor', recordId: vendorId,
        recordLabel: `Vendor ${vendorName || vendorId}`,
        message: `Vendor ${vendorName || vendorId} needs your approval`,
        link: '/vendor/pending',
        createdBy: submitter?.name || submitter?.username || 'System',
        targetUserId: req.body.approverId || null,
      });
    }

    res.json({ success: true, message: 'Vendor updated successfully' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE - Delete vendor
router.delete('/:vendorId', async (req, res) => {
  try {
    const companyId = req.query.companyId;
    const vendorId  = req.params.vendorId;

    if (db.connected) {
      const [result] = await db.query('DELETE FROM vendors WHERE id = ? AND company_id = ?', [vendorId, companyId]);
      if (!result.affectedRows) return res.status(404).json({ error: 'Vendor not found' });
    }

    const p = path.join(ROOT, 'Database', 'Companies', companyId, 'Vendor', vendorId);
    if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true });

    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET - Download file
router.get('/:vendorId/download/:fileName', (req, res) => {
  try {
    const fp = path.join(docsBase(req.query.companyId, req.params.vendorId), req.params.fileName);
    if (fs.existsSync(fp)) res.download(fp);
    else res.status(404).json({ error: 'File not found' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
