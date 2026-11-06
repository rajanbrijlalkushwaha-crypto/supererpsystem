const express  = require('express');
const path     = require('path');
const fs       = require('fs');
const multer   = require('multer');
const XLSX     = require('xlsx');
const { ROOT, upload, saveUploadedFiles, saveJson, deleteJson, auditEntry, pushAudit, resolveUser } = require('./helpers');
const { notifyApprovers } = require('./notifications');
const jstore   = require('./json-store');

/* ── multer for Excel upload (memory storage) ── */
const xlsUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const clientJsonPath = (companyId, clientId, name) => {
  const safe = (name || '').replace(/[\\/:*?"<>|]/g, '_').slice(0, 60);
  return path.join(ROOT, 'Database', 'Companies', companyId, 'Client', String(clientId), `${clientId}-${safe}.json`);
};
const db = require('../db');

const router = express.Router();

const docsBase = (companyId, clientId) =>
  path.join(ROOT, 'Database', 'Companies', companyId, 'Client', String(clientId), 'docs');

const parseJ = (v, fb = []) => {
  if (Array.isArray(v) || (v && typeof v === 'object')) return v;
  try { return JSON.parse(v); } catch { return fb; }
};

const toRow = r => ({
  clientId:       r.id,
  companyName:    r.name,
  address:        r.address,
  city:           r.city,
  state:          r.state,
  pincode:        r.pincode,
  gstin:          r.gstin,
  gstType:        r.gst_type,
  status:         r.status,
  contactPersons: parseJ(r.contacts,  []),
  documents:      parseJ(r.documents, []),
  createdAt:      r.created_at,
  updatedAt:      r.updated_at,
});

// GET - List all clients
router.get('/', async (req, res) => {
  try {
    if (!db.connected) {
      return res.json(jstore.readAll('Client', req.query.companyId));
    }
    const [rows] = await db.query('SELECT * FROM clients WHERE company_id = ? ORDER BY id', [req.query.companyId]);
    res.json(rows.map(toRow));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET - Next ID
router.get('/next-id', async (req, res) => {
  try {
    if (!db.connected) {
      return res.json({ nextId: jstore.nextId('Client', req.query.companyId, 100001) });
    }
    const [[row]] = await db.query('SELECT MAX(id) AS max_id FROM clients');
    const nextId = row.max_id ? row.max_id + 1 : 100001;
    res.json({ nextId });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ═══════════════════════════════════════════════
   EXCEL — column definitions (single source of truth)
═══════════════════════════════════════════════ */
const XL_COLS = [
  /* Basic */
  { key:'clientName',     hdr:'Client Name *',          hint:'Full legal company / person name',                              req:true  },
  { key:'businessType',   hdr:'Business Type *',         hint:'Proprietorship / Partnership / Private Limited / LLP / Government / Individual / Trust / HUF', req:true },
  { key:'industryType',   hdr:'Industry Type',           hint:'e.g. Manufacturing / Trading / IT / Retail …',                req:false },
  { key:'pan',            hdr:'PAN Number',              hint:'10-char PAN e.g. ABCDE1234F',                                  req:false },
  { key:'gst',            hdr:'GST Number',              hint:'15-char GSTIN e.g. 27ABCDE1234F1Z5',                          req:false },
  { key:'cin',            hdr:'CIN Number',              hint:'Optional — Corporate Identity Number',                         req:false },
  { key:'msme',           hdr:'MSME Number',             hint:'Optional — UDYAM-XX-00-0000000',                              req:false },
  /* Contact */
  { key:'contactPerson',  hdr:'Contact Person *',        hint:'Primary contact full name',                                    req:true  },
  { key:'mobile',         hdr:'Mobile Number *',         hint:'10-digit starting with 6-9',                                   req:true  },
  { key:'altMobile',      hdr:'Alternate Mobile',        hint:'Optional second mobile',                                       req:false },
  { key:'email',          hdr:'Email Address',           hint:'e.g. contact@company.com',                                     req:false },
  { key:'landline',       hdr:'Landline',                hint:'STD code + number e.g. 02212345678',                          req:false },
  { key:'website',        hdr:'Website',                 hint:'e.g. https://www.company.com',                                req:false },
  /* Address */
  { key:'billingAddr',    hdr:'Billing Address *',       hint:'Full street / area / locality',                                req:true  },
  { key:'city',           hdr:'City *',                  hint:'City name',                                                    req:true  },
  { key:'state',          hdr:'State *',                 hint:'Full state name e.g. Maharashtra',                             req:true  },
  { key:'pincode',        hdr:'Pincode',                 hint:'6-digit PIN code',                                             req:false },
  { key:'country',        hdr:'Country',                 hint:'Default: India',                                               req:false },
  { key:'shippingAddr',   hdr:'Shipping Address',        hint:'Leave blank if same as billing',                               req:false },
  /* Tax */
  { key:'gstRegistered',  hdr:'GST Registered',          hint:'Yes / No',                                                     req:false },
  { key:'gstType',        hdr:'GST Type',                hint:'Regular / Composition / Unregistered / Consumer / SEZ',       req:false },
  { key:'tdsApplicable',  hdr:'TDS Applicable',          hint:'Yes / No',                                                     req:false },
  /* Bank */
  { key:'bankName',       hdr:'Bank Name',               hint:'e.g. State Bank of India',                                    req:false },
  { key:'accountHolder',  hdr:'Account Holder Name',     hint:'As per bank records',                                          req:false },
  { key:'accountNo',      hdr:'Account Number',          hint:'Bank account number',                                          req:false },
  { key:'ifsc',           hdr:'IFSC Code',               hint:'11-char e.g. SBIN0001234',                                    req:false },
  { key:'branch',         hdr:'Branch Name',             hint:'Bank branch name',                                             req:false },
  { key:'upi',            hdr:'UPI ID',                  hint:'Optional e.g. name@bank',                                     req:false },
  /* Payment */
  { key:'paymentTerms',   hdr:'Payment Terms',           hint:'Advance / 7 Days / 15 Days / 30 Days / 45 Days / 60 Days / 90 Days / On Delivery', req:false },
  { key:'creditLimit',    hdr:'Credit Limit (₹)',        hint:'Numeric only e.g. 500000',                                    req:false },
  { key:'paymentModes',   hdr:'Payment Modes',           hint:'Comma-separated: NEFT,RTGS,Cheque,Cash,UPI,IMPS,DD',         req:false },
  { key:'currency',       hdr:'Currency',                hint:'INR / USD / EUR / GBP / AED  (default INR)',                  req:false },
  /* Extra */
  { key:'category',       hdr:'Category',                hint:'Regular / VIP / Blacklisted',                                  req:false },
  { key:'salesPerson',    hdr:'Sales Person',            hint:'Assigned sales person name',                                   req:false },
  { key:'remarks',        hdr:'Remarks',                 hint:'Internal notes (optional)',                                     req:false },
];

/* ── GET /api/clients/sample-excel ── */
router.get('/sample-excel', (req, res) => {
  try {
    const wb = XLSX.utils.book_new();

    /* ── Sheet 1: Template ── */
    const templateData = [
      XL_COLS.map(c => c.hdr),   // row 1 — headers
      XL_COLS.map(c => c.hint),  // row 2 — hints
      /* Sample row 1 */
      [
        'Acme Pvt Ltd','Private Limited','Manufacturing','ABCDE1234F','27ABCDE1234F1Z5','','',
        'Rahul Sharma','9876543210','9876543211','rahul@acme.com','02212345678','https://acme.com',
        'Plot 12, MIDC Industrial Area, Andheri East','Mumbai','Maharashtra','400093','India','',
        'Yes','Regular','No',
        'HDFC Bank','Rahul Sharma','12345678901234','HDFC0001234','Andheri East Branch','rahul@upi',
        '30 Days','1000000','NEFT,RTGS,Cheque','INR',
        'Regular','Raj Sales','Long-standing client',
      ],
      /* Sample row 2 */
      [
        'Global Traders','Proprietorship','Trading','XYZPQ5678K','24XYZPQ5678K1Z2','','UDYAM-GJ-01-0001234',
        'Priya Patel','8765432109','','priya@global.com','','',
        '45, Sindhi Market, Near Bus Stand','Rajkot','Gujarat','360001','India','Same as billing',
        'Yes','Regular','Yes',
        'State Bank of India','Priya Patel','98765432101','SBIN0004321','Rajkot Main Branch','',
        '45 Days','500000','NEFT,Cash,UPI','INR',
        'VIP','','Premium customer',
      ],
    ];

    const ws = XLSX.utils.aoa_to_sheet(templateData);

    /* Column widths */
    ws['!cols'] = XL_COLS.map((c, i) => ({ wch: Math.max(c.hdr.length + 2, c.hint.length * 0.55, 16) }));

    /* Freeze top 2 rows */
    ws['!freeze'] = { xSplit: 0, ySplit: 2 };

    XLSX.utils.book_append_sheet(wb, ws, 'Client Import Template');

    /* ── Sheet 2: Field Guide ── */
    const guideRows = [
      ['FIELD', 'REQUIRED', 'ALLOWED VALUES / FORMAT', 'EXAMPLE'],
      ...XL_COLS.map(c => [c.hdr.replace(' *',''), c.req ? 'YES ★' : 'No', c.hint, '']),
    ];
    const ws2 = XLSX.utils.aoa_to_sheet(guideRows);
    ws2['!cols'] = [{ wch:28 }, { wch:12 }, { wch:70 }, { wch:30 }];
    XLSX.utils.book_append_sheet(wb, ws2, 'Field Guide');

    const buf = XLSX.write(wb, { type:'buffer', bookType:'xlsx' });
    res.setHeader('Content-Disposition', 'attachment; filename="Client_Import_Template.xlsx"');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buf);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ── POST /api/clients/import-excel ── */
router.post('/import-excel', xlsUpload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });

    const companyId = req.body.companyId || req.query.companyId;
    if (!companyId) return res.status(400).json({ error: 'companyId is required.' });

    const wb    = XLSX.read(req.file.buffer, { type:'buffer' });
    const ws    = wb.Sheets[wb.SheetNames[0]];
    const rows  = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

    /* Row 0 = headers, Row 1 = hints, Row 2+ = data */
    const dataRows = rows.slice(2).filter(r => r.some(cell => String(cell).trim() !== ''));
    if (!dataRows.length) return res.status(400).json({ error: 'No data rows found in the Excel file.' });

    const results   = [];
    const errors    = [];
    const colKeys   = XL_COLS.map(c => c.key);

    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i];
      const rowNum = i + 3; // actual Excel row number (1-indexed, skip header+hints)
      const data   = {};
      colKeys.forEach((key, idx) => { data[key] = String(row[idx] || '').trim(); });

      /* Required field check */
      const missing = XL_COLS.filter(c => c.req && !data[c.key]).map(c => c.hdr.replace(' *',''));
      if (missing.length) {
        errors.push({ row: rowNum, name: data.clientName || `Row ${rowNum}`, error: `Missing required: ${missing.join(', ')}` });
        continue;
      }

      try {
        const now = new Date().toISOString();
        const clientId = db.connected
          ? await (async () => { const [[r]] = await db.query('SELECT MAX(id) AS m FROM clients'); return r.m ? r.m+1 : 100001; })()
          : jstore.nextId('Client', companyId, 100001);

        const paymentModes = data.paymentModes ? data.paymentModes.split(',').map(s => s.trim()).filter(Boolean) : [];
        const contactList  = [{ name: data.contactPerson, mobileNumber: data.mobile, altMobile: data.altMobile, email: data.email, website: data.website, landline: data.landline }];

        if (db.connected) {
          await db.query(
            `INSERT INTO clients (id,company_id,name,address,city,state,pincode,gstin,gst_type,status,contacts,documents) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
            [clientId, companyId, data.clientName, data.billingAddr, data.city, data.state, data.pincode, data.gst, data.gstType||'Regular', 'pending', JSON.stringify(contactList), '[]']
          );
        }

        const fullData = {
          clientId, companyId,
          companyName: data.clientName, clientName: data.clientName, status: 'pending',
          businessType: data.businessType, industryType: data.industryType,
          pan: data.pan.toUpperCase(), gst: data.gst.toUpperCase(), gstin: data.gst.toUpperCase(),
          cin: data.cin, msme: data.msme, gstType: data.gstType || 'Regular',
          gstRegistered: data.gstRegistered.toLowerCase() !== 'no',
          tdsApplicable: data.tdsApplicable.toLowerCase() === 'yes',
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
          category: data.category || 'Regular', salesPerson: data.salesPerson, remarks: data.remarks,
          documents: [], importSource: 'excel',
          createdAt: now, updatedAt: now,
        };

        saveJson(clientJsonPath(companyId, clientId, data.clientName), fullData);
        results.push({ row: rowNum, clientId, name: data.clientName });
      } catch (e) {
        errors.push({ row: rowNum, name: data.clientName || `Row ${rowNum}`, error: e.message });
      }
    }

    res.json({
      success: true,
      total:    dataRows.length,
      imported: results.length,
      failed:   errors.length,
      results,
      errors,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET - Single client
router.get('/:clientId', async (req, res) => {
  try {
    const companyId = req.query.companyId;
    const { clientId } = req.params;

    // Always prefer the rich JSON file — it has ALL fields (businessType, pan, bank, etc.)
    // The DB row only has a subset, so read JSON first regardless of DB mode
    if (companyId) {
      const jsonRec = jstore.readOne('Client', companyId, clientId);
      if (jsonRec) return res.json(jsonRec);
    }

    // Fall back to DB if JSON not found
    if (db.connected) {
      const [[row]] = await db.query('SELECT * FROM clients WHERE id = ?', [clientId]);
      if (!row) return res.status(404).json({ error: 'Client not found' });
      return res.json(toRow(row));
    }

    res.status(404).json({ error: 'Client not found' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST - Create client
router.post('/', upload.array('documents'), async (req, res) => {
  try {
    const b = req.body;
    const str = k => (Array.isArray(b[k]) ? b[k][0] : b[k]) || '';
    const jp  = k => { try { return JSON.parse(str(k)); } catch { return null; } };

    // Support both old field names (companyName/address/gstin) and new (clientName/billingAddr/gst)
    const clientName  = str('clientName')  || str('companyName');
    const address     = str('billingAddr') || str('address');
    const city        = str('city');
    const state       = str('state');
    const pincode     = str('pincode');
    const gstin       = str('gst')         || str('gstin');
    const gstType     = str('gstType')     || 'Regular';
    const status      = str('status')      || 'active';
    const companyId   = str('companyId');

    // Build contact list — new form sends flat fields; old sends JSON array
    let contactList = jp('contactPersons');
    if (!contactList) {
      contactList = [{ name: str('contactPerson'), mobileNumber: str('mobile'), altMobile: str('altMobile'), email: str('email'), website: str('website'), landline: str('landline') }];
    }

    let docList = jp('documentsJson') || [];

    const clientId = db.connected
      ? await (async () => {
          const [[row]] = await db.query('SELECT MAX(id) AS max_id FROM clients');
          return row.max_id ? row.max_id + 1 : 100001;
        })()
      : jstore.nextId('Client', companyId, 100001);

    const docsPathFinal = docsBase(companyId, clientId);
    // Only create the directory when there are actual files to save (prevents phantom empty folders)
    const saved = req.files && req.files.length > 0
      ? (fs.mkdirSync(docsPathFinal, { recursive: true }), saveUploadedFiles(req.files, docsPathFinal))
      : [];
    saved.forEach((s, i) => { if (docList[i]) { docList[i].filePath = s.filePath; docList[i].fileName = s.fileName; } else docList.push(s); });

    if (db.connected) {
      await db.query(
        `INSERT INTO clients (id, company_id, name, address, city, state, pincode, gstin, gst_type, status, contacts, documents)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [clientId, companyId, clientName, address, city, state, pincode, gstin, gstType, status, JSON.stringify(contactList), JSON.stringify(docList)]
      );
    }

    // Save full rich data to JSON file
    const now = new Date().toISOString();
    const fullData = {
      clientId, companyName: clientName, clientName, status,
      address, billingAddr: address, shippingAddr: str('shippingAddr'),
      city, state, pincode, country: str('country') || 'India',
      gstin, gst: gstin, gstType, gstRegistered: str('gstRegistered') !== 'false',
      pan: str('pan'), cin: str('cin'), msme: str('msme'),
      tdsApplicable: str('tdsApplicable') === 'true',
      businessType: str('businessType'), industryType: str('industryType'),
      contactPersons: contactList,
      bankName: str('bankName'), accountHolder: str('accountHolder'),
      accountNo: str('accountNo'), ifsc: str('ifsc'), branch: str('branch'), upi: str('upi'),
      paymentTerms: str('paymentTerms'), creditLimit: str('creditLimit'),
      paymentModes: jp('paymentModes') || [],
      currency: str('currency') || 'INR',
      category: str('category') || 'Regular',
      salesPerson: str('salesPerson'), remarks: str('remarks'),
      epsilonVendorCode: str('epsilonVendorCode'),
      alias: str('alias'), mailingName: str('mailingName'),
      openingBalance: parseFloat(str('openingBalance')) || 0, openingBalanceType: str('openingBalanceType') === 'Cr' ? 'Cr' : 'Dr',
      documents: docList, createdAt: now, updatedAt: now,
      audit: [auditEntry(req, 'created')],
    };
    saveJson(clientJsonPath(companyId, clientId, clientName), fullData);

    if (status === 'pending') {
      const submitter = resolveUser(req);
      notifyApprovers({
        companyId, module: 'client', recordId: clientId,
        recordLabel: `Client ${clientName || clientId}`,
        message: `Client ${clientName || clientId} needs your approval`,
        link: '/client/pending',
        createdBy: submitter?.name || submitter?.username || 'System',
        targetUserId: str('approverId') || null,
      });
    }

    res.json({ success: true, clientId, message: `Client created with ID: ${clientId}` });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT - Update client
router.put('/:clientId', upload.array('newFiles'), async (req, res) => {
  try {
    const { clientId } = req.params;
    const b = req.body;
    const companyId = b.companyId;
    const str = k => (Array.isArray(b[k]) ? b[k][0] : b[k]) || '';
    const jp  = k => { try { return JSON.parse(str(k) || b[k]); } catch { return null; } };

    // Support both old field names (companyName/address/gstin) and new (clientName/billingAddr/gst)
    const clientName = str('clientName')  || str('companyName');
    const address    = str('billingAddr') || str('address');
    const city       = str('city');
    const state      = str('state');
    const pincode    = str('pincode');
    const gstin      = str('gst')         || str('gstin');
    const gstType    = str('gstType')     || 'Regular';

    // Read existing record so we can preserve fields not sent by the form
    let existing = {};
    if (db.connected) {
      const [[row]] = await db.query('SELECT * FROM clients WHERE id = ? AND company_id = ?', [clientId, companyId]);
      if (!row) return res.status(404).json({ error: 'Client not found' });
      existing = row;
    } else {
      const rec = jstore.readOne('Client', companyId, clientId);
      if (!rec) return res.status(404).json({ error: 'Client not found' });
      existing = rec;
    }

    // Preserve the existing status — don't allow edit to reset it back to pending
    const status = str('status') || existing.status || 'approved';

    // Build contact list — new form sends flat fields; old sends JSON array
    let contactList = jp('contactPersons');
    if (!contactList) {
      const cp = str('contactPerson');
      contactList = cp
        ? [{ name: cp, mobileNumber: str('mobile'), altMobile: str('altMobile'), email: str('email'), website: str('website'), landline: str('landline') }]
        : (existing.contactPersons || []);
    }

    // Documents: keep existing metadata + append any new uploads
    let docList = jp('documentsJson') || jp('documents') || (existing.documents || []);
    const docsPath = docsBase(companyId, clientId);
    if (req.files && req.files.length > 0) fs.mkdirSync(docsPath, { recursive: true });
    const fileNames = jp('fileNames') || [];
    const saved = saveUploadedFiles(req.files || [], docsPath, fileNames);
    saved.forEach(s => docList.push(s));

    if (db.connected) {
      await db.query(
        `UPDATE clients SET name=?, address=?, city=?, state=?, pincode=?, gstin=?, gst_type=?, status=?, contacts=?, documents=? WHERE id=? AND company_id=?`,
        [clientName, address, city, state, pincode, gstin, gstType, status, JSON.stringify(contactList), JSON.stringify(docList), clientId, companyId]
      );
    }

    // Delete all existing JSON files in this client's folder before saving
    // Prevents duplicates when the client name (and thus filename) changes
    const clientDir = path.join(ROOT, 'Database', 'Companies', companyId, 'Client', String(clientId));
    if (fs.existsSync(clientDir)) {
      fs.readdirSync(clientDir)
        .filter(f => f.endsWith('.json'))
        .forEach(f => { try { fs.unlinkSync(path.join(clientDir, f)); } catch {} });
    }

    const now = new Date().toISOString();
    const resolvedName    = clientName  || existing.clientName  || existing.companyName || '';
    const resolvedAddr    = address     || existing.billingAddr || existing.address     || '';
    const resolvedCity    = city        || existing.city        || '';
    const resolvedState   = state       || existing.state       || '';
    const resolvedPincode = pincode     || existing.pincode     || '';
    const resolvedGstin   = gstin       || existing.gstin       || existing.gst         || '';
    const resolvedGstType = str('gstType') || existing.gstType || 'Regular';   // not sent = keep the saved type
    const fullData = {
      // Merge existing data first, then overwrite with incoming values
      ...existing,
      clientId: parseInt(clientId),
      companyName: resolvedName, clientName: resolvedName, status,
      address: resolvedAddr, billingAddr: resolvedAddr,
      shippingAddr: str('shippingAddr') || existing.shippingAddr || '',
      city: resolvedCity, state: resolvedState, pincode: resolvedPincode,
      country:       str('country')      || existing.country      || 'India',
      gstin: resolvedGstin, gst: resolvedGstin, gstType: resolvedGstType,
      gstRegistered: str('gstRegistered') !== '' ? str('gstRegistered') !== 'false' : (existing.gstRegistered !== undefined ? existing.gstRegistered : true),
      pan:           str('pan')           || existing.pan           || '',
      cin:           str('cin')           || existing.cin           || '',
      msme:          str('msme')          || existing.msme          || '',
      tdsApplicable: str('tdsApplicable') !== '' ? str('tdsApplicable') === 'true' : (existing.tdsApplicable || false),
      businessType:  str('businessType')  || existing.businessType  || '',
      industryType:  str('industryType')  || existing.industryType  || '',
      contactPersons: contactList,
      bankName:      str('bankName')      || existing.bankName      || '',
      accountHolder: str('accountHolder') || existing.accountHolder || '',
      accountNo:     str('accountNo')     || existing.accountNo     || '',
      ifsc:          str('ifsc')          || existing.ifsc          || '',
      branch:        str('branch')        || existing.branch        || '',
      upi:           str('upi')           || existing.upi           || '',
      paymentTerms:  str('paymentTerms')  || existing.paymentTerms  || '30 Days',
      creditLimit:   str('creditLimit')   || existing.creditLimit   || '',
      paymentModes:  jp('paymentModes')   || existing.paymentModes  || [],
      currency:      str('currency')      || existing.currency      || 'INR',
      category:      str('category')      || existing.category      || 'Regular',
      salesPerson:   str('salesPerson')   || existing.salesPerson   || '',
      remarks:       str('remarks')       || existing.remarks        || '',
      website:       str('website')       || existing.website        || '',
      landline:      str('landline')      || existing.landline       || '',
      // fields from the new (beta) client form — sent value wins (even blank), otherwise keep what was saved
      epsilonVendorCode: b.epsilonVendorCode !== undefined ? str('epsilonVendorCode') : (existing.epsilonVendorCode || ''),
      alias:             b.alias !== undefined ? str('alias') : (existing.alias || ''),
      mailingName:       b.mailingName !== undefined ? str('mailingName') : (existing.mailingName || ''),
      openingBalance:    b.openingBalance !== undefined ? (parseFloat(str('openingBalance')) || 0) : (existing.openingBalance || 0),
      openingBalanceType: b.openingBalanceType !== undefined ? (str('openingBalanceType') === 'Cr' ? 'Cr' : 'Dr') : (existing.openingBalanceType || 'Dr'),
      documents: docList,
      createdAt: existing.createdAt || existing.created_at || now,
      updatedAt: now,
    };
    const clOldStatus = existing.status;
    const clNewStatus = fullData.status;
    const clAction = clNewStatus !== clOldStatus
      ? (clNewStatus === 'approved' ? 'approved' : clNewStatus === 'rejected' ? 'rejected' : 'status_changed')
      : 'edited';
    const clExtra = clNewStatus !== clOldStatus ? { from: clOldStatus, to: clNewStatus } : {};
    fullData.audit = pushAudit(existing, req, clAction, clExtra);
    saveJson(clientJsonPath(companyId, clientId, resolvedName), fullData);

    if (clNewStatus === 'pending' && clOldStatus !== 'pending') {
      const submitter = resolveUser(req);
      notifyApprovers({
        companyId, module: 'client', recordId: clientId,
        recordLabel: `Client ${resolvedName || clientId}`,
        message: `Client ${resolvedName || clientId} needs your approval`,
        link: '/client/pending',
        createdBy: submitter?.name || submitter?.username || 'System',
        targetUserId: str('approverId') || null,
      });
    }

    res.json({ success: true, message: 'Client updated successfully' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE - Delete client
router.delete('/:clientId', async (req, res) => {
  try {
    const companyId = req.query.companyId;
    const clientId  = req.params.clientId;

    if (db.connected) {
      const [result] = await db.query('DELETE FROM clients WHERE id = ? AND company_id = ?', [clientId, companyId]);
      if (!result.affectedRows) return res.status(404).json({ error: 'Client not found' });
    }

    const docsPath = path.join(ROOT, 'Database', 'Companies', companyId, 'Client', clientId);
    if (fs.existsSync(docsPath)) fs.rmSync(docsPath, { recursive: true, force: true });

    res.json({ success: true, message: 'Client deleted' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET - Download file
router.get('/:clientId/download/:fileName', (req, res) => {
  try {
    const fp = path.join(docsBase(req.query.companyId, req.params.clientId), req.params.fileName);
    if (fs.existsSync(fp)) res.download(fp);
    else res.status(404).json({ error: 'File not found' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
