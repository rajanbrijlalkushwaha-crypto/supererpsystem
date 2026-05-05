const express = require('express');
const path    = require('path');
const fs      = require('fs');
const { ROOT, saveJson } = require('./helpers');
const jstore  = require('./json-store');
const db      = require('../db');

const router = express.Router();

const itemJsonPath = (companyId, itemCode) =>
  path.join(ROOT, 'Database', 'Companies', companyId, 'Items', String(itemCode), `${itemCode}.json`);

/* ─── One-time migration: add item_code column ──────────────────────────── */
let _migrated = false;
async function ensureItemCode() {
  if (_migrated || !db.connected) return;
  _migrated = true; // set before queries so concurrent calls don't double-run
  try {
    await db.query(`ALTER TABLE items MODIFY COLUMN id INT NOT NULL AUTO_INCREMENT`);
  } catch (_) { /* already AUTO_INCREMENT */ }
  try {
    await db.query(`ALTER TABLE items ADD COLUMN IF NOT EXISTS item_code INT NOT NULL DEFAULT 0`);
  } catch (_) { /* column already exists */ }
  try {
    await db.query(`UPDATE items SET item_code = id WHERE item_code = 0`);
  } catch (_) { /* nothing to backfill */ }
  try {
    await db.query(`ALTER TABLE items ADD UNIQUE IF NOT EXISTS uniq_company_item (company_id, item_code)`);
  } catch (_) { /* index already exists */ }
}

const toRow = r => ({
  itemCode:  r.item_code || r.id,
  itemName:  r.item_name,
  uom:       r.uom,
  hsnCode:   r.hsn_code,
  itemType:  r.item_type,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

// GET - List all items
router.get('/', async (req, res) => {
  try {
    if (!db.connected) {
      return res.json(jstore.readAll('Items', req.query.companyId));
    }
    await ensureItemCode();
    const [rows] = await db.query(
      'SELECT * FROM items WHERE company_id = ? ORDER BY item_code',
      [req.query.companyId]
    );
    res.json(rows.map(toRow));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET - Next item code (per-company)
router.get('/next-code', async (req, res) => {
  try {
    if (!db.connected) {
      return res.json({ nextCode: jstore.nextId('Items', req.query.companyId, 9000001) });
    }
    await ensureItemCode();
    const [[row]] = await db.query(
      'SELECT MAX(item_code) AS max_code FROM items WHERE company_id = ?',
      [req.query.companyId]
    );
    res.json({ nextCode: row.max_code ? row.max_code + 1 : 9000001 });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET - Single item
router.get('/:itemCode', async (req, res) => {
  try {
    if (!db.connected) {
      const rec = jstore.readOne('Items', req.query.companyId, req.params.itemCode);
      if (!rec) return res.status(404).json({ error: 'Item not found' });
      return res.json(rec);
    }
    await ensureItemCode();
    const [[row]] = await db.query(
      'SELECT * FROM items WHERE item_code = ? AND company_id = ?',
      [req.params.itemCode, req.query.companyId]
    );
    if (!row) return res.status(404).json({ error: 'Item not found' });
    res.json(toRow(row));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST - Create item
router.post('/', async (req, res) => {
  try {
    const { itemName, uom, hsnCode, itemType, companyId: bodyCompanyId } = req.body;
    const companyId = req.query.companyId || bodyCompanyId;

    if (!itemName) return res.status(400).json({ error: 'Item name is required' });

    let itemCode;
    if (db.connected) {
      await ensureItemCode();
      const [[row]] = await db.query(
        'SELECT MAX(item_code) AS max_code FROM items WHERE company_id = ?',
        [companyId]
      );
      itemCode = row.max_code ? row.max_code + 1 : 9000001;

      await db.query(
        `INSERT INTO items (company_id, item_code, item_name, uom, hsn_code, item_type) VALUES (?, ?, ?, ?, ?, ?)`,
        [companyId, itemCode, itemName, uom || '', hsnCode || '', itemType || 'Raw Material']
      );
    } else {
      itemCode = jstore.nextId('Items', companyId, 9000001);
    }

    const now = new Date().toISOString();
    saveJson(itemJsonPath(companyId, itemCode), {
      itemCode, itemName, uom: uom || '', hsnCode: hsnCode || '',
      itemType: itemType || 'Raw Material',
      createdAt: now, updatedAt: now,
    });

    res.json({ success: true, itemCode, message: `Item created with code: ${itemCode}` });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT - Update item
router.put('/:itemCode', async (req, res) => {
  try {
    const { itemCode } = req.params;
    const { itemName, uom, hsnCode, itemType, companyId: bodyCompanyId } = req.body;
    const companyId = req.query.companyId || bodyCompanyId;

    if (db.connected) {
      await ensureItemCode();
      const [[existing]] = await db.query(
        'SELECT * FROM items WHERE item_code = ? AND company_id = ?',
        [itemCode, companyId]
      );
      if (!existing) return res.status(404).json({ error: 'Item not found' });
      await db.query(
        `UPDATE items SET item_name=?, uom=?, hsn_code=?, item_type=? WHERE item_code=? AND company_id=?`,
        [itemName, uom || '', hsnCode || '', itemType || 'Raw Material', itemCode, companyId]
      );
    } else {
      const existing = jstore.readOne('Items', companyId, itemCode);
      if (!existing) return res.status(404).json({ error: 'Item not found' });
    }

    saveJson(itemJsonPath(companyId, itemCode), {
      itemCode: parseInt(itemCode), itemName, uom: uom || '', hsnCode: hsnCode || '',
      itemType: itemType || 'Raw Material',
      updatedAt: new Date().toISOString(),
    });

    res.json({ success: true, message: 'Item updated successfully' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE - Delete item
router.delete('/:itemCode', async (req, res) => {
  try {
    const companyId = req.query.companyId;
    const itemCode  = req.params.itemCode;

    if (db.connected) {
      await ensureItemCode();
      await db.query('DELETE FROM items WHERE item_code = ? AND company_id = ?', [itemCode, companyId]);
    }

    const p = path.join(ROOT, 'Database', 'Companies', companyId, 'Items', itemCode);
    if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true });

    res.json({ success: true, message: 'Item deleted' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
