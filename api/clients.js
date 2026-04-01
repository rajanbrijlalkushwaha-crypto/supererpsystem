const express = require('express');
const path    = require('path');
const fs      = require('fs');
const { ROOT, upload, saveUploadedFiles, saveJson, deleteJson } = require('./helpers');

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
    const [rows] = await db.query('SELECT * FROM clients WHERE company_id = ? ORDER BY id', [req.query.companyId]);
    res.json(rows.map(toRow));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET - Next ID
router.get('/next-id', async (req, res) => {
  try {
    const [[row]] = await db.query('SELECT MAX(id) AS max_id FROM clients WHERE company_id = ?', [req.query.companyId]);
    const nextId = row.max_id ? row.max_id + 1 : 100001;
    res.json({ nextId });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET - Single client
router.get('/:clientId', async (req, res) => {
  try {
    const [[row]] = await db.query('SELECT * FROM clients WHERE id = ? AND company_id = ?', [req.params.clientId, req.query.companyId]);
    if (!row) return res.status(404).json({ error: 'Client not found' });
    res.json(toRow(row));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST - Create client
router.post('/', upload.array('documents'), async (req, res) => {
  try {
    const { companyName, address, city, state, pincode, gstin, gstType, contactPersons, documents, status = 'draft' } = req.body;
    const companyId = req.body.companyId;

    const [[row]] = await db.query('SELECT MAX(id) AS max_id FROM clients WHERE company_id = ?', [companyId]);
    const clientId = row.max_id ? row.max_id + 1 : 100001;

    const docsPath = docsBase(companyId, clientId);
    fs.mkdirSync(docsPath, { recursive: true });

    const contactList = typeof contactPersons === 'string' ? JSON.parse(contactPersons) : (contactPersons || []);
    let docList = typeof documents === 'string' ? JSON.parse(documents) : (Array.isArray(documents) ? documents : []);

    const saved = saveUploadedFiles(req.files, docsPath);
    saved.forEach((s, i) => { if (docList[i]) { docList[i].filePath = s.filePath; docList[i].fileName = s.fileName; } else docList.push(s); });

    await db.query(
      `INSERT INTO clients (id, company_id, name, address, city, state, pincode, gstin, gst_type, status, contacts, documents)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [clientId, companyId, companyName, address, city, state, pincode, gstin, gstType, status, JSON.stringify(contactList), JSON.stringify(docList)]
    );

    const now = new Date().toISOString();
    saveJson(clientJsonPath(companyId, clientId, companyName), {
      clientId, companyName, address, city, state, pincode, gstin,
      gstType, contactPersons: contactList, documents: docList, status,
      createdAt: now, updatedAt: now,
    });

    res.json({ success: true, clientId, message: `Client created with ID: ${clientId}` });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT - Update client
router.put('/:clientId', upload.array('newFiles'), async (req, res) => {
  try {
    const { clientId } = req.params;
    const { companyName, address, city, state, pincode, gstin, gstType, contactPersons, documents, status } = req.body;
    const companyId = req.body.companyId;

    const [[existing]] = await db.query('SELECT * FROM clients WHERE id = ? AND company_id = ?', [clientId, companyId]);
    if (!existing) return res.status(404).json({ error: 'Client not found' });

    const contactList = typeof contactPersons === 'string' ? JSON.parse(contactPersons) : (contactPersons || []);
    let docList = typeof documents === 'string' ? JSON.parse(documents) : (Array.isArray(documents) ? documents : []);

    const docsPath = docsBase(companyId, clientId);
    fs.mkdirSync(docsPath, { recursive: true });

    const fileNames = req.body.fileNames ? JSON.parse(req.body.fileNames) : [];
    const saved = saveUploadedFiles(req.files, docsPath, fileNames);
    saved.forEach(s => docList.push(s));

    await db.query(
      `UPDATE clients SET name=?, address=?, city=?, state=?, pincode=?, gstin=?, gst_type=?, status=?, contacts=?, documents=? WHERE id=? AND company_id=?`,
      [companyName, address, city, state, pincode, gstin, gstType, status, JSON.stringify(contactList), JSON.stringify(docList), clientId, companyId]
    );

    saveJson(clientJsonPath(companyId, clientId, companyName), {
      clientId: parseInt(clientId), companyName, address, city, state, pincode, gstin,
      gstType, contactPersons: contactList, documents: docList, status,
      createdAt: existing.created_at, updatedAt: new Date().toISOString(),
    });

    res.json({ success: true, message: 'Client updated successfully' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE - Delete client
router.delete('/:clientId', async (req, res) => {
  try {
    const companyId = req.query.companyId;
    const clientId  = req.params.clientId;
    const [result] = await db.query('DELETE FROM clients WHERE id = ? AND company_id = ?', [clientId, companyId]);

    // Remove docs folder if it exists
    const docsPath = path.join(ROOT, 'Database', 'Companies', companyId, 'Client', clientId);
    if (fs.existsSync(docsPath)) fs.rmSync(docsPath, { recursive: true, force: true });

    if (result.affectedRows) res.json({ success: true, message: 'Client deleted' });
    else res.status(404).json({ error: 'Client not found' });
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
