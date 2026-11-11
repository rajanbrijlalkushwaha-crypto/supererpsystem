const express = require('express');
const path    = require('path');
const fs      = require('fs');
const { ROOT, upload, saveJson } = require('./helpers');
const jstore  = require('./json-store');

const companyDir      = (companyId) => path.join(ROOT, 'Database', 'Companies', companyId);
const companyJsonPath = (companyId) => path.join(companyDir(companyId), 'company.json');
const companyLogoDir  = (companyId) => path.join(companyDir(companyId), 'logo');
const db = require('../db');

const router = express.Router();

const toApiRow = r => ({
  companyId:    r.id || r.companyId,
  companyName:  r.company_name || r.companyName,
  address:      r.address,
  city:         r.city,
  state:        r.state,
  pincode:      r.pincode,
  gstin:        r.gstin,
  pan:          r.pan,
  email:        r.email,
  phone:        r.phone,
  website:      r.website,
  bankName:     r.bank_name || r.bankName,
  bankAccount:  r.bank_account || r.bankAccount,
  bankIfsc:     r.bank_ifsc || r.bankIfsc,
  bankBranch:   r.bank_branch || r.bankBranch,
  // court jurisdiction printed on documents (city / district) — kept in the company JSON
  jurisdiction: r.jurisdiction != null ? r.jurisdiction : ((jstore.readOneCompany(r.id || r.companyId) || {}).jurisdiction || ''),
  isDefault:    r.is_default !== undefined ? !!r.is_default : !!r.isDefault,
  logoFileName: r.logo_file || r.logoFileName || '',
  createdAt:    r.created_at || r.createdAt,
  updatedAt:    r.updated_at || r.updatedAt,
});

// GET - List all companies
router.get('/', async (_req, res) => {
  try {
    if (!db.connected) {
      return res.json(jstore.readAllCompanies().map(toApiRow));
    }
    const [rows] = await db.query('SELECT * FROM companies ORDER BY id');
    res.json(rows.map(toApiRow));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST - Create company
router.post('/', upload.single('logo'), async (req, res) => {
  try {
    const { companyName, address, city, state, pincode, gstin, pan, email, phone, website, bankName, bankAccount, bankIfsc, bankBranch, isDefault, jurisdiction } = req.body;

    let companyId;
    if (db.connected) {
      const [rows] = await db.query('SELECT id FROM companies ORDER BY id DESC LIMIT 1');
      let maxNum = 0;
      if (rows.length) maxNum = parseInt(rows[0].id.replace('C', ''), 10) || 0;
      companyId = 'C' + (maxNum + 1);
    } else {
      companyId = jstore.nextCompanyId();
    }

    let logoFile = '';
    if (req.file) {
      logoFile = req.file.originalname;
      const logoDir = companyLogoDir(companyId);
      fs.mkdirSync(logoDir, { recursive: true });
      fs.writeFileSync(path.join(logoDir, logoFile), req.file.buffer);
    }

    if (db.connected) {
      await db.query(
        `INSERT INTO companies (id, company_name, address, city, state, pincode, gstin, pan, email, phone, website, bank_name, bank_account, bank_ifsc, is_default, logo_file)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [companyId, companyName, address, city, state, pincode, gstin, pan, email, phone, website, bankName, bankAccount, bankIfsc, isDefault === 'true' ? 1 : 0, logoFile]
      );
    }

    const now = new Date().toISOString();
    saveJson(companyJsonPath(companyId), {
      companyId, companyName, address, city, state, pincode, gstin, pan,
      email, phone, website, bankName, bankAccount, bankIfsc, bankBranch, jurisdiction: String(jurisdiction || '').trim(),
      isDefault: isDefault === 'true', logoFileName: logoFile,
      createdAt: now, updatedAt: now,
    });

    // Create isolated folder structure for this company
    [
      'SalesOrder', 'PurchaseOrder', 'Payments', 'Journals', 'Expenses', 'Assets',
      'Accounts/Banks', 'GDN', 'GRN', 'SalesInvoice', 'PurchaseInvoice',
      'ManufacturingJobSheets', 'Stock', 'Items', 'Projects', 'Client', 'Vendor', 'logo',
    ].forEach(sub => fs.mkdirSync(path.join(companyDir(companyId), sub), { recursive: true }));

    res.json({ success: true, companyId, message: 'Company created successfully' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT - Update company
router.put('/:companyId', upload.single('logo'), async (req, res) => {
  try {
    const { companyId } = req.params;
    const { companyName, address, city, state, pincode, gstin, pan, email, phone, website, bankName, bankAccount, bankIfsc, bankBranch, isDefault, jurisdiction } = req.body;

    let logoFile = '';
    if (db.connected) {
      const [rows] = await db.query('SELECT * FROM companies WHERE id = ?', [companyId]);
      if (!rows.length) return res.status(404).json({ error: 'Company not found' });
      logoFile = rows[0].logo_file || '';
    } else {
      const existing = jstore.readOneCompany(companyId);
      if (!existing) return res.status(404).json({ error: 'Company not found' });
      logoFile = existing.logoFileName || '';
    }

    if (req.file) {
      logoFile = req.file.originalname;
      const logoDir = companyLogoDir(companyId);
      fs.mkdirSync(logoDir, { recursive: true });
      fs.writeFileSync(path.join(logoDir, logoFile), req.file.buffer);
    }

    if (db.connected) {
      await db.query(
        `UPDATE companies SET company_name=?, address=?, city=?, state=?, pincode=?, gstin=?, pan=?, email=?, phone=?, website=?, bank_name=?, bank_account=?, bank_ifsc=?, is_default=?, logo_file=? WHERE id=?`,
        [companyName, address, city, state, pincode, gstin, pan, email, phone, website, bankName, bankAccount, bankIfsc, isDefault === 'true' ? 1 : 0, logoFile, companyId]
      );
    }

    /* keep every other field already saved for the company; store / factory locations come as a JSON list */
    const prev = jstore.readOneCompany(companyId) || {};
    let locations = prev.locations || [];
    if (req.body.locations != null) {
      try {
        const l = JSON.parse(req.body.locations);
        if (Array.isArray(l)) locations = l.map(x => ({ name: String(x?.name || '').trim().slice(0, 120), type: x?.type === 'Factory' ? 'Factory' : 'Store', address: String(x?.address || '').trim().slice(0, 300) })).filter(x => x.name);
      } catch { /* keep the saved list */ }
    }
    saveJson(companyJsonPath(companyId), {
      ...prev,
      companyId, companyName, address, city, state, pincode, gstin, pan,
      email, phone, website, bankName, bankAccount, bankIfsc, bankBranch, jurisdiction: jurisdiction != null ? String(jurisdiction).trim() : (prev.jurisdiction || ''),
      isDefault: isDefault === 'true', logoFileName: logoFile, locations,
      updatedAt: new Date().toISOString(),
    });

    res.json({ success: true, message: 'Company updated successfully' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE - Delete company
router.delete('/:companyId', async (req, res) => {
  try {
    if (db.connected) {
      const [result] = await db.query('DELETE FROM companies WHERE id = ?', [req.params.companyId]);
      if (!result.affectedRows) return res.status(404).json({ error: 'Company not found' });
    }
    // Remove JSON backup too
    const fp = companyJsonPath(req.params.companyId);
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/companies/logo/:fileName — serve logo (searches per-company then legacy shared folder)
router.get('/logo/:fileName', (req, res) => {
  try {
    const fileName   = req.params.fileName;
    const companyId  = req.query.companyId || '';
    // Try per-company folder first, then legacy shared folder
    const perCompany = companyId ? path.join(companyLogoDir(companyId), fileName) : null;
    const legacy     = path.join(ROOT, 'Database', 'Companies', 'logos', fileName);
    const fp = (perCompany && fs.existsSync(perCompany)) ? perCompany
             : fs.existsSync(legacy) ? legacy : null;
    if (fp) res.sendFile(path.resolve(fp));
    else res.status(404).json({ error: 'Logo not found' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
