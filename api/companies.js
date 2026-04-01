const express = require('express');
const path    = require('path');
const fs      = require('fs');
const { ROOT, upload, saveJson } = require('./helpers');

const companyJsonPath = (companyId) =>
  path.join(ROOT, 'Database', 'Companies', `${companyId}.json`);
const db = require('../db');

const router = express.Router();
const LOGO_PATH = path.join(ROOT, 'Database', 'Companies', 'logos');
if (!fs.existsSync(LOGO_PATH)) fs.mkdirSync(LOGO_PATH, { recursive: true });

// GET - List all companies
router.get('/', async (_req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM companies ORDER BY id');
    res.json(rows.map(r => ({
      companyId:    r.id,
      companyName:  r.company_name,
      address:      r.address,
      city:         r.city,
      state:        r.state,
      pincode:      r.pincode,
      gstin:        r.gstin,
      pan:          r.pan,
      email:        r.email,
      phone:        r.phone,
      website:      r.website,
      bankName:     r.bank_name,
      bankAccount:  r.bank_account,
      bankIfsc:     r.bank_ifsc,
      isDefault:    !!r.is_default,
      logoFileName: r.logo_file || '',
      createdAt:    r.created_at,
      updatedAt:    r.updated_at,
    })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST - Create company
router.post('/', upload.single('logo'), async (req, res) => {
  try {
    const { companyName, address, city, state, pincode, gstin, pan, email, phone, website, bankName, bankAccount, bankIfsc, isDefault } = req.body;

    const [rows] = await db.query('SELECT id FROM companies ORDER BY id DESC LIMIT 1');
    let maxNum = 0;
    if (rows.length) maxNum = parseInt(rows[0].id.replace('C', ''), 10) || 0;
    const companyId = 'C' + (maxNum + 1);

    let logoFile = '';
    if (req.file) {
      logoFile = req.file.originalname;
      fs.writeFileSync(path.join(LOGO_PATH, logoFile), req.file.buffer);
    }

    await db.query(
      `INSERT INTO companies (id, company_name, address, city, state, pincode, gstin, pan, email, phone, website, bank_name, bank_account, bank_ifsc, is_default, logo_file)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [companyId, companyName, address, city, state, pincode, gstin, pan, email, phone, website, bankName, bankAccount, bankIfsc, isDefault === 'true' ? 1 : 0, logoFile]
    );

    const now = new Date().toISOString();
    saveJson(companyJsonPath(companyId), {
      companyId, companyName, address, city, state, pincode, gstin, pan,
      email, phone, website, bankName, bankAccount, bankIfsc,
      isDefault: isDefault === 'true', logoFileName: logoFile,
      createdAt: now, updatedAt: now,
    });

    res.json({ success: true, companyId, message: 'Company created successfully' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT - Update company
router.put('/:companyId', upload.single('logo'), async (req, res) => {
  try {
    const { companyId } = req.params;
    const { companyName, address, city, state, pincode, gstin, pan, email, phone, website, bankName, bankAccount, bankIfsc, isDefault } = req.body;

    const [rows] = await db.query('SELECT * FROM companies WHERE id = ?', [companyId]);
    if (!rows.length) return res.status(404).json({ error: 'Company not found' });

    let logoFile = rows[0].logo_file || '';
    if (req.file) {
      logoFile = req.file.originalname;
      fs.writeFileSync(path.join(LOGO_PATH, logoFile), req.file.buffer);
    }

    await db.query(
      `UPDATE companies SET company_name=?, address=?, city=?, state=?, pincode=?, gstin=?, pan=?, email=?, phone=?, website=?, bank_name=?, bank_account=?, bank_ifsc=?, is_default=?, logo_file=? WHERE id=?`,
      [companyName, address, city, state, pincode, gstin, pan, email, phone, website, bankName, bankAccount, bankIfsc, isDefault === 'true' ? 1 : 0, logoFile, companyId]
    );

    saveJson(companyJsonPath(companyId), {
      companyId, companyName, address, city, state, pincode, gstin, pan,
      email, phone, website, bankName, bankAccount, bankIfsc,
      isDefault: isDefault === 'true', logoFileName: logoFile,
      createdAt: rows[0].created_at, updatedAt: new Date().toISOString(),
    });

    res.json({ success: true, message: 'Company updated successfully' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE - Delete company
router.delete('/:companyId', async (req, res) => {
  try {
    const [result] = await db.query('DELETE FROM companies WHERE id = ?', [req.params.companyId]);
    if (result.affectedRows) res.json({ success: true });
    else res.status(404).json({ error: 'Company not found' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
