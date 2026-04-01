const express = require('express');
const path    = require('path');
const fs      = require('fs');
const { ROOT, upload, saveUploadedFiles, saveJson } = require('./helpers');

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
    const [rows] = await db.query('SELECT * FROM vendors WHERE company_id = ? ORDER BY id', [req.query.companyId]);
    res.json(rows.map(toRow));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET - Next ID
router.get('/next-id', async (req, res) => {
  try {
    const [[row]] = await db.query('SELECT MAX(id) AS max_id FROM vendors WHERE company_id = ?', [req.query.companyId]);
    res.json({ nextId: row.max_id ? row.max_id + 1 : 200001 });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET - Single vendor
router.get('/:vendorId', async (req, res) => {
  try {
    const [[row]] = await db.query('SELECT * FROM vendors WHERE id = ? AND company_id = ?', [req.params.vendorId, req.query.companyId]);
    if (!row) return res.status(404).json({ error: 'Vendor not found' });
    res.json(toRow(row));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST - Create vendor
router.post('/', upload.array('documents'), async (req, res) => {
  try {
    const b = req.body;
    const companyId = req.query.companyId || b.companyId;
    const { vendorName, address, city, state, pincode, gstin, gstType, contactPersons, documents, status = 'draft' } = b;

    const [[row]] = await db.query('SELECT MAX(id) AS max_id FROM vendors WHERE company_id = ?', [companyId]);
    const vendorId = row.max_id ? row.max_id + 1 : 200001;

    const docsPath = docsBase(companyId, vendorId);
    fs.mkdirSync(docsPath, { recursive: true });

    const contactList = typeof contactPersons === 'string' ? JSON.parse(contactPersons) : (contactPersons || []);
    let docList = typeof documents === 'string' ? JSON.parse(documents) : (Array.isArray(documents) ? documents : []);

    const saved = saveUploadedFiles(req.files, docsPath);
    saved.forEach((s, i) => { if (docList[i]) { docList[i].filePath = s.filePath; docList[i].fileName = s.fileName; } else docList.push(s); });

    // Extra vendor-specific fields stored in JSON
    const extra = {
      pan: b.pan, msmeNo: b.msmeNo, msmeType: b.msmeType,
      bankName: b.bankName, bankAccount: b.bankAccount, bankIfsc: b.bankIfsc, bankBranch: b.bankBranch,
      creditLimit: b.creditLimit, creditDays: b.creditDays, paymentTerms: b.paymentTerms,
      email: b.email, phone: b.phone, website: b.website, notes: b.notes,
    };

    await db.query(
      `INSERT INTO vendors (id, company_id, name, address, city, state, pincode, gstin, gst_type, status, contacts, documents, extra)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [vendorId, companyId, vendorName, address, city, state, pincode, gstin, gstType, status, JSON.stringify(contactList), JSON.stringify(docList), JSON.stringify(extra)]
    );

    const now = new Date().toISOString();
    saveJson(vendorJsonPath(companyId, vendorId, vendorName), {
      vendorId, vendorName, address, city, state, pincode, gstin, gstType,
      contactPersons: contactList, documents: docList, status, ...extra,
      createdAt: now, updatedAt: now,
    });

    res.json({ success: true, vendorId, message: `Vendor created with ID: ${vendorId}` });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT - Update vendor
router.put('/:vendorId', upload.array('newFiles'), async (req, res) => {
  try {
    const { vendorId } = req.params;
    const b = req.body;
    const companyId = req.query.companyId || b.companyId;
    const { vendorName, address, city, state, pincode, gstin, gstType, contactPersons, documents, status } = b;

    const [[existing]] = await db.query('SELECT * FROM vendors WHERE id = ? AND company_id = ?', [vendorId, companyId]);
    if (!existing) return res.status(404).json({ error: 'Vendor not found' });

    const contactList = typeof contactPersons === 'string' ? JSON.parse(contactPersons) : (contactPersons || []);
    let docList = typeof documents === 'string' ? JSON.parse(documents) : (Array.isArray(documents) ? documents : []);

    const docsPath = docsBase(companyId, vendorId);
    fs.mkdirSync(docsPath, { recursive: true });

    const fileNames = b.fileNames ? JSON.parse(b.fileNames) : [];
    const saved = saveUploadedFiles(req.files, docsPath, fileNames);
    saved.forEach(s => docList.push(s));

    const extra = {
      pan: b.pan, msmeNo: b.msmeNo, msmeType: b.msmeType,
      bankName: b.bankName, bankAccount: b.bankAccount, bankIfsc: b.bankIfsc, bankBranch: b.bankBranch,
      creditLimit: b.creditLimit, creditDays: b.creditDays, paymentTerms: b.paymentTerms,
      email: b.email, phone: b.phone, website: b.website, notes: b.notes,
    };

    await db.query(
      `UPDATE vendors SET name=?, address=?, city=?, state=?, pincode=?, gstin=?, gst_type=?, status=?, contacts=?, documents=?, extra=? WHERE id=? AND company_id=?`,
      [vendorName, address, city, state, pincode, gstin, gstType, status, JSON.stringify(contactList), JSON.stringify(docList), JSON.stringify(extra), vendorId, companyId]
    );

    saveJson(vendorJsonPath(companyId, vendorId, vendorName), {
      vendorId: parseInt(vendorId), vendorName, address, city, state, pincode, gstin, gstType,
      contactPersons: contactList, documents: docList, status, ...extra,
      createdAt: existing.created_at, updatedAt: new Date().toISOString(),
    });

    res.json({ success: true, message: 'Vendor updated successfully' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE - Delete vendor
router.delete('/:vendorId', async (req, res) => {
  try {
    const companyId = req.query.companyId;
    const vendorId  = req.params.vendorId;
    const [result] = await db.query('DELETE FROM vendors WHERE id = ? AND company_id = ?', [vendorId, companyId]);
    const p = path.join(ROOT, 'Database', 'Companies', companyId, 'Vendor', vendorId);
    if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true });
    if (result.affectedRows) res.json({ success: true });
    else res.status(404).json({ error: 'Vendor not found' });
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
