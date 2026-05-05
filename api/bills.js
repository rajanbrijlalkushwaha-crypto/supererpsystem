const express = require('express');
const path    = require('path');
const fs      = require('fs');
const { ROOT } = require('./helpers');

const router = express.Router();

const cid = req => req.query.companyId || req.body?.companyId;

const billDir = (companyId, type) =>
  path.join(ROOT, 'Database', 'Companies', companyId,
    type === 'purchase' ? 'PurchaseBills' : 'SalesBills');

const readAll = (dir) => {
  if (!fs.existsSync(dir)) return [];
  const results = [];
  fs.readdirSync(dir).forEach(entry => {
    const full = path.join(dir, entry);
    try {
      const stat = fs.statSync(full);
      if (stat.isDirectory()) {
        fs.readdirSync(full).filter(f => f.endsWith('.json')).forEach(f => {
          try { results.push(JSON.parse(fs.readFileSync(path.join(full, f), 'utf-8'))); } catch {}
        });
      } else if (entry.endsWith('.json')) {
        try { results.push(JSON.parse(fs.readFileSync(full, 'utf-8'))); } catch {}
      }
    } catch {}
  });
  return results;
};

// GET all bills (type=sales|purchase)
router.get('/', (req, res) => {
  try {
    const type = req.query.type || 'sales';
    const dir  = billDir(cid(req), type);
    res.json(readAll(dir));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST create bill
router.post('/', (req, res) => {
  try {
    const companyId = cid(req);
    const type = req.body.type || 'sales';
    const dir  = billDir(companyId, type);

    const existing = readAll(dir);
    const prefix   = type === 'purchase' ? 'PB' : 'SB';
    const lastNum  = existing.length > 0
      ? Math.max(...existing.map(b => parseInt((b.billId || '').replace(/\D/g, '')) || 0))
      : 0;
    const billId = `${prefix}${String(lastNum + 1).padStart(6, '0')}`;

    const bill = { ...req.body, billId, companyId, createdAt: new Date().toISOString() };

    const bDir = path.join(dir, billId);
    fs.mkdirSync(bDir, { recursive: true });
    fs.writeFileSync(path.join(bDir, `${billId}.json`), JSON.stringify(bill, null, 2));

    res.json(bill);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET single bill
router.get('/:billId', (req, res) => {
  try {
    const type = req.query.type || 'sales';
    const dir  = billDir(cid(req), type);
    const file = path.join(dir, req.params.billId, `${req.params.billId}.json`);
    if (!fs.existsSync(file)) return res.status(404).json({ error: 'Not found' });
    res.json(JSON.parse(fs.readFileSync(file, 'utf-8')));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT update bill
router.put('/:billId', (req, res) => {
  try {
    const type = req.query.type || req.body.type || 'sales';
    const dir  = billDir(cid(req), type);
    const file = path.join(dir, req.params.billId, `${req.params.billId}.json`);
    if (!fs.existsSync(file)) return res.status(404).json({ error: 'Not found' });
    const existing = JSON.parse(fs.readFileSync(file, 'utf-8'));
    const updated  = { ...existing, ...req.body, billId: req.params.billId, updatedAt: new Date().toISOString() };
    fs.writeFileSync(file, JSON.stringify(updated, null, 2));
    res.json(updated);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE bill
router.delete('/:billId', (req, res) => {
  try {
    const type = req.query.type || 'sales';
    const dir  = billDir(cid(req), type);
    const file = path.join(dir, req.params.billId, `${req.params.billId}.json`);
    if (fs.existsSync(file)) fs.unlinkSync(file);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
