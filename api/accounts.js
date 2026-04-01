const express = require('express');
const db = require('../db');

const router = express.Router();

// ── EXPENSES ──────────────────────────────────────────────────────────────────
router.get('/expenses', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM expenses WHERE company_id = ? ORDER BY id DESC', [req.query.companyId]);
    res.json(rows.map(r => ({
      expenseId: r.id, date: r.expense_date, category: r.category,
      description: r.description, amount: r.amount, taxRate: r.tax_rate,
      taxAmount: r.tax_amount, totalAmount: r.total_amount,
      paymentMode: r.payment_mode, bankId: r.bank_id, notes: r.notes,
      status: r.status, createdAt: r.created_at, updatedAt: r.updated_at,
    })));
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.post('/expenses', async (req, res) => {
  try {
    const { date, category, description, amount, taxRate = 0, paymentMode, bankId, notes, status = 'draft' } = req.body;
    const companyId = req.body.companyId || req.query.companyId;

    const [[row]] = await db.query('SELECT MAX(id) AS max_id FROM expenses WHERE company_id = ?', [companyId]);
    const expenseId = row.max_id ? row.max_id + 1 : 500001;
    const taxAmount   = parseFloat(((parseFloat(amount) || 0) * (parseFloat(taxRate) / 100)).toFixed(2));
    const totalAmount = parseFloat(((parseFloat(amount) || 0) + taxAmount).toFixed(2));

    await db.query(
      `INSERT INTO expenses (id, company_id, expense_date, category, description, amount, tax_rate, tax_amount, total_amount, payment_mode, bank_id, notes, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [expenseId, companyId, date || null, category, description, parseFloat(amount) || 0, parseFloat(taxRate) || 0, taxAmount, totalAmount, paymentMode, bankId, notes, status]
    );

    res.json({ success: true, expenseId, message: `Expense created with ID: ${expenseId}` });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.get('/expenses/:id', async (req, res) => {
  try {
    const [[row]] = await db.query('SELECT * FROM expenses WHERE id = ? AND company_id = ?', [req.params.id, req.query.companyId]);
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json({ expenseId: row.id, date: row.expense_date, category: row.category, description: row.description, amount: row.amount, taxRate: row.tax_rate, taxAmount: row.tax_amount, totalAmount: row.total_amount, paymentMode: row.payment_mode, bankId: row.bank_id, notes: row.notes, status: row.status });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.put('/expenses/:id', async (req, res) => {
  try {
    const { date, category, description, amount, taxRate = 0, paymentMode, bankId, notes, status } = req.body;
    const companyId = req.body.companyId || req.query.companyId;
    const taxAmount   = parseFloat(((parseFloat(amount) || 0) * (parseFloat(taxRate) / 100)).toFixed(2));
    const totalAmount = parseFloat(((parseFloat(amount) || 0) + taxAmount).toFixed(2));

    await db.query(
      `UPDATE expenses SET expense_date=?, category=?, description=?, amount=?, tax_rate=?, tax_amount=?, total_amount=?, payment_mode=?, bank_id=?, notes=?, status=? WHERE id=? AND company_id=?`,
      [date || null, category, description, parseFloat(amount) || 0, parseFloat(taxRate) || 0, taxAmount, totalAmount, paymentMode, bankId, notes, status, req.params.id, companyId]
    );
    res.json({ success: true, message: 'Expense updated' });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.delete('/expenses/:id', async (req, res) => {
  try {
    const [r] = await db.query('DELETE FROM expenses WHERE id = ? AND company_id = ?', [req.params.id, req.query.companyId]);
    if (r.affectedRows) res.json({ success: true });
    else res.status(404).json({ error: 'Not found' });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// ── ASSETS ────────────────────────────────────────────────────────────────────
router.get('/assets', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM assets WHERE company_id = ? ORDER BY id DESC', [req.query.companyId]);
    res.json(rows.map(r => ({
      assetId: r.id, date: r.asset_date, assetName: r.asset_name, category: r.category,
      description: r.description, purchaseAmount: r.purchase_amount,
      depreciationRate: r.depreciation_rate, currentValue: r.current_value,
      notes: r.notes, status: r.status, createdAt: r.created_at, updatedAt: r.updated_at,
    })));
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.post('/assets', async (req, res) => {
  try {
    const { date, assetName, category, description, purchaseAmount, depreciationRate = 0, notes, status = 'active' } = req.body;
    const companyId = req.body.companyId || req.query.companyId;

    const [[row]] = await db.query('SELECT MAX(id) AS max_id FROM assets WHERE company_id = ?', [companyId]);
    const assetId = row.max_id ? row.max_id + 1 : 600001;

    await db.query(
      `INSERT INTO assets (id, company_id, asset_date, asset_name, category, description, purchase_amount, depreciation_rate, current_value, notes, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [assetId, companyId, date || null, assetName, category, description, parseFloat(purchaseAmount) || 0, parseFloat(depreciationRate) || 0, parseFloat(purchaseAmount) || 0, notes, status]
    );
    res.json({ success: true, assetId, message: `Asset created with ID: ${assetId}` });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.get('/assets/:id', async (req, res) => {
  try {
    const [[row]] = await db.query('SELECT * FROM assets WHERE id = ? AND company_id = ?', [req.params.id, req.query.companyId]);
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json({ assetId: row.id, date: row.asset_date, assetName: row.asset_name, category: row.category, description: row.description, purchaseAmount: row.purchase_amount, depreciationRate: row.depreciation_rate, currentValue: row.current_value, notes: row.notes, status: row.status });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.put('/assets/:id', async (req, res) => {
  try {
    const { date, assetName, category, description, purchaseAmount, depreciationRate = 0, currentValue, notes, status } = req.body;
    const companyId = req.body.companyId || req.query.companyId;
    await db.query(
      `UPDATE assets SET asset_date=?, asset_name=?, category=?, description=?, purchase_amount=?, depreciation_rate=?, current_value=?, notes=?, status=? WHERE id=? AND company_id=?`,
      [date || null, assetName, category, description, parseFloat(purchaseAmount) || 0, parseFloat(depreciationRate) || 0, parseFloat(currentValue || purchaseAmount) || 0, notes, status, req.params.id, companyId]
    );
    res.json({ success: true, message: 'Asset updated' });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.delete('/assets/:id', async (req, res) => {
  try {
    const [r] = await db.query('DELETE FROM assets WHERE id = ? AND company_id = ?', [req.params.id, req.query.companyId]);
    if (r.affectedRows) res.json({ success: true });
    else res.status(404).json({ error: 'Not found' });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

module.exports = router;
