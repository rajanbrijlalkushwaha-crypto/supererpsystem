const express = require('express');
const path = require('path');
const fs = require('fs');
const db = require('../db');
const jstore = require('./json-store');
const { ROOT } = require('./helpers');

const router = express.Router();

// ── CREATE TABLE SQL ────────────────────────────────────────────────────────────

const CREATE_LOCATIONS_TABLE = `
  CREATE TABLE IF NOT EXISTS manufacturing_locations (
    id           INT AUTO_INCREMENT PRIMARY KEY,
    company_id   VARCHAR(20),
    name         VARCHAR(255) NOT NULL,
    address      TEXT,
    city         VARCHAR(100),
    type         VARCHAR(50)  DEFAULT 'Factory',
    capacity     VARCHAR(100),
    status       VARCHAR(30)  DEFAULT 'active',
    notes        TEXT,
    created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_company (company_id)
  ) ENGINE=InnoDB
`;

const CREATE_JOB_SHEETS_TABLE = `
  CREATE TABLE IF NOT EXISTS manufacturing_job_sheets (
    id             INT AUTO_INCREMENT PRIMARY KEY,
    company_id     VARCHAR(20),
    job_no         VARCHAR(100),
    so_id          INT,
    so_number      VARCHAR(100),
    customer_name  VARCHAR(255),
    location_id    INT DEFAULT 0,
    location_name  VARCHAR(255),
    item_name      VARCHAR(255),
    item_code      VARCHAR(100),
    qty_required   DECIMAL(15,3) DEFAULT 0,
    qty_produced   DECIMAL(15,3) DEFAULT 0,
    uom            VARCHAR(50),
    due_date       DATE,
    start_date     DATE,
    end_date       DATE,
    status         VARCHAR(30)  DEFAULT 'pending',
    bom            JSON,
    notes          TEXT,
    created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_company (company_id)
  ) ENGINE=InnoDB
`;

// ── ENSURE TABLES ───────────────────────────────────────────────────────────────

async function ensureTables() {
  await db.query(CREATE_LOCATIONS_TABLE);
  await db.query(CREATE_JOB_SHEETS_TABLE);
  // Add output_items column if upgrading from older schema
  try { await db.query(`ALTER TABLE manufacturing_job_sheets ADD COLUMN IF NOT EXISTS output_items JSON`); } catch(_) {}
}

// ── HELPER: job sheet JSON files (flat subdir pattern matching jstore) ──────────
// Path: Database/Companies/{cid}/ManufacturingJobSheets/{id}/{id}.json
// This matches jstore.readAll/readOne('ManufacturingJobSheets', cid, id)

const jsDir  = (cid)      => path.join(ROOT, 'Database', 'Companies', cid, 'ManufacturingJobSheets');
const jsFile = (cid, id)  => path.join(jsDir(cid), String(id), `${id}.json`);

function readAllJobSheets(cid) {
  const dir = jsDir(cid);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(d => { const full = path.join(dir, d); return fs.statSync(full).isDirectory() && !isNaN(parseInt(d, 10)); })
    .sort((a, b) => parseInt(b, 10) - parseInt(a, 10))
    .flatMap(d => {
      const sub = path.join(dir, d);
      return fs.readdirSync(sub).filter(f => f.endsWith('.json'))
        .map(f => { try { return JSON.parse(fs.readFileSync(path.join(sub, f), 'utf-8')); } catch { return null; } })
        .filter(Boolean);
    });
}

function nextJobId(cid, base = 700001) {
  const dir = jsDir(cid);
  if (!fs.existsSync(dir)) return base;
  let max = base - 1;
  fs.readdirSync(dir).forEach(d => { const n = parseInt(d, 10); if (!isNaN(n) && n > max) max = n; });
  return max + 1;
}

function saveJobSheetJson(cid, id, data) {
  const sub = path.join(jsDir(cid), String(id));
  fs.mkdirSync(sub, { recursive: true });
  fs.writeFileSync(path.join(sub, `${id}.json`), JSON.stringify(data, null, 2));
}

// Location helpers — flat files in Manufacturing/Locations/
const locDir  = (companyId)      => path.join(ROOT, 'Database', 'Companies', companyId, 'Manufacturing', 'Locations');
const locFile = (companyId, id)  => path.join(locDir(companyId), `${id}.json`);

function readAllLocations(companyId) {
  const dir = locDir(companyId);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.json'))
    .map(f => { try { return JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8')); } catch { return null; } })
    .filter(Boolean)
    .sort((a, b) => (b.id || 0) - (a.id || 0));
}

function nextLocId(companyId, base = 800001) {
  const dir = locDir(companyId);
  if (!fs.existsSync(dir)) return base;
  let max = base - 1;
  fs.readdirSync(dir).forEach(f => {
    const n = parseInt(f, 10);
    if (!isNaN(n) && n > max) max = n;
  });
  return max + 1;
}

function saveLocationJson(companyId, id, data) {
  const dir = locDir(companyId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(locFile(companyId, id), JSON.stringify(data, null, 2));
}

// ── GET SO ITEMS ────────────────────────────────────────────────────────────────

router.get('/so-items', async (req, res) => {
  try {
    const companyId = req.query.companyId;
    if (!companyId) return res.status(400).json({ error: 'companyId required' });

    if (db.connected) {
      const [rows] = await db.query(
        `SELECT id, order_no, customer_name, data FROM sales_orders
         WHERE company_id = ? AND status IN ('confirmed','approved','active')
         ORDER BY id DESC`,
        [companyId]
      );

      const result = rows.map(r => {
        let data = {};
        try { data = typeof r.data === 'string' ? JSON.parse(r.data) : (r.data || {}); } catch {}
        const items = (data.items || []).map(it => ({
          itemName: it.description || it.itemName || it.item_name || '',
          itemCode: it.itemCode || it.item_code || '',
          qty: parseFloat(it.qty || it.quantity || 0),
          uom: it.unit || it.uom || '',
          rate: parseFloat(it.rate || 0),
          type: it.type || '',
          bom: (it.bom || []).map(b => ({
            material:     b.itemName || b.material || b.name || '',
            qty:          parseFloat(b.qty || 0),
            uom:          b.unit || b.uom || '',
            hsn:          b.hsnCode || b.hsn || '',
            availableQty: '',
          })),
        }));
        return {
          soId: r.id,
          soNumber: r.order_no,
          customerName: r.customer_name,
          items,
        };
      });

      return res.json(result);
    }

    // JSON fallback — read BOTH flat files and subdirectory format from SalesOrder dir
    const soDir = path.join(ROOT, 'Database', 'Companies', companyId, 'SalesOrder');
    const soRecords = [];
    if (fs.existsSync(soDir)) {
      fs.readdirSync(soDir).forEach(entry => {
        const full = path.join(soDir, entry);
        try {
          if (entry.endsWith('.json') && fs.statSync(full).isFile()) {
            // flat file (Tally-imported)
            soRecords.push(JSON.parse(fs.readFileSync(full, 'utf-8')));
          } else if (fs.statSync(full).isDirectory()) {
            // subdirectory format (app-created)
            fs.readdirSync(full).filter(f => f.endsWith('.json')).forEach(f => {
              try { soRecords.push(JSON.parse(fs.readFileSync(path.join(full, f), 'utf-8'))); } catch {}
            });
          }
        } catch {}
      });
    }
    const filtered = soRecords.filter(so =>
      ['confirmed', 'approved', 'active'].includes((so.status || '').toLowerCase())
    );
    const result = filtered.map(so => ({
      soId: so.id || so.orderId,
      soNumber: so.voucherNumber || so.orderNo || so.order_no || so.soNumber || '',
      customerName: so.party || so.customerName || so.customer_name || '',
      items: (so.items || so.data?.items || []).map(it => ({
        itemName: it.description || it.itemName || it.item_name || '',
        itemCode: it.itemCode || it.item_code || '',
        qty: parseFloat(it.qty || it.quantity || 0),
        uom: it.unit || it.uom || '',
        rate: parseFloat(it.rate || 0),
        type: it.type || '',
        bom: (it.bom || []).map(b => ({
          material:     b.itemName || b.material || b.name || '',
          qty:          parseFloat(b.qty || 0),
          uom:          b.unit || b.uom || '',
          hsn:          b.hsnCode || b.hsn || '',
          availableQty: '',
        })),
      })),
    }));
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ── LOCATIONS ───────────────────────────────────────────────────────────────────

router.get('/locations', async (req, res) => {
  try {
    const companyId = req.query.companyId;
    if (!companyId) return res.status(400).json({ error: 'companyId required' });

    if (db.connected) {
      await ensureTables();
      const [rows] = await db.query(
        'SELECT * FROM manufacturing_locations WHERE company_id = ? ORDER BY id DESC',
        [companyId]
      );
      return res.json(rows.map(r => ({
        id: r.id, companyId: r.company_id, name: r.name, address: r.address,
        city: r.city, type: r.type, capacity: r.capacity, status: r.status,
        notes: r.notes, createdAt: r.created_at,
      })));
    }

    // JSON fallback
    res.json(readAllLocations(companyId));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.post('/locations', async (req, res) => {
  try {
    const companyId = req.body.companyId || req.query.companyId;
    if (!companyId) return res.status(400).json({ error: 'companyId required' });
    const { name, address, city, type = 'Factory', capacity, status = 'active', notes } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });

    if (db.connected) {
      await ensureTables();
      const [result] = await db.query(
        `INSERT INTO manufacturing_locations (company_id, name, address, city, type, capacity, status, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [companyId, name, address || null, city || null, type, capacity || null, status, notes || null]
      );
      const id = result.insertId;
      return res.json({ success: true, id, message: `Location created with ID: ${id}` });
    }

    // JSON fallback
    const id = nextLocId(companyId);
    const record = { id, companyId, name, address, city, type, capacity, status, notes, createdAt: new Date().toISOString() };
    saveLocationJson(companyId, id, record);
    res.json({ success: true, id, message: `Location created with ID: ${id}` });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.delete('/locations/:id', async (req, res) => {
  try {
    const companyId = req.query.companyId;
    if (!companyId) return res.status(400).json({ error: 'companyId required' });

    if (db.connected) {
      const [r] = await db.query(
        'DELETE FROM manufacturing_locations WHERE id = ? AND company_id = ?',
        [req.params.id, companyId]
      );
      if (r.affectedRows) return res.json({ success: true });
      return res.status(404).json({ error: 'Location not found' });
    }

    // JSON fallback
    const fp = locFile(companyId, req.params.id);
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
    res.json({ success: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.put('/locations/:id', async (req, res) => {
  try {
    const companyId = req.body.companyId || req.query.companyId;
    if (!companyId) return res.status(400).json({ error: 'companyId required' });
    const { name, address, city, type, capacity, status, notes } = req.body;

    if (db.connected) {
      await db.query(
        `UPDATE manufacturing_locations SET name=?, address=?, city=?, type=?, capacity=?, status=?, notes=?
         WHERE id=? AND company_id=?`,
        [name, address || null, city || null, type, capacity || null, status, notes || null, req.params.id, companyId]
      );
      return res.json({ success: true, message: 'Location updated' });
    }

    // JSON fallback
    const fp = locFile(companyId, req.params.id);
    if (!fs.existsSync(fp)) return res.status(404).json({ error: 'Location not found' });
    const existing = JSON.parse(fs.readFileSync(fp, 'utf-8'));
    const updated = { ...existing, name, address, city, type, capacity, status, notes };
    saveLocationJson(companyId, req.params.id, updated);
    res.json({ success: true, message: 'Location updated' });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ── JOB SHEETS ──────────────────────────────────────────────────────────────────

router.get('/job-sheets', async (req, res) => {
  try {
    const companyId = req.query.companyId;
    if (!companyId) return res.status(400).json({ error: 'companyId required' });

    if (db.connected) {
      await ensureTables();
      const [rows] = await db.query(
        'SELECT * FROM manufacturing_job_sheets WHERE company_id = ? ORDER BY id DESC',
        [companyId]
      );
      return res.json(rows.map(r => ({
        id: r.id, companyId: r.company_id, jobNo: r.job_no,
        soId: r.so_id, soNumber: r.so_number, customerName: r.customer_name,
        locationId: r.location_id, locationName: r.location_name,
        itemName: r.item_name, itemCode: r.item_code,
        qtyRequired: r.qty_required, qtyProduced: r.qty_produced, uom: r.uom,
        dueDate: r.due_date, startDate: r.start_date, endDate: r.end_date,
        status: r.status,
        bom: typeof r.bom === 'string' ? JSON.parse(r.bom || '[]') : (r.bom || []),
        outputItems: typeof r.output_items === 'string' ? JSON.parse(r.output_items || '[]') : (r.output_items || []),
        notes: r.notes, createdAt: r.created_at, updatedAt: r.updated_at,
      })));
    }

    // JSON fallback
    res.json(readAllJobSheets(companyId));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.get('/job-sheets/:id', async (req, res) => {
  try {
    const companyId = req.query.companyId;
    if (!companyId) return res.status(400).json({ error: 'companyId required' });

    if (db.connected) {
      await ensureTables();
      const [[r]] = await db.query(
        'SELECT * FROM manufacturing_job_sheets WHERE id = ? AND company_id = ?',
        [req.params.id, companyId]
      );
      if (!r) return res.status(404).json({ error: 'Job sheet not found' });
      return res.json({
        id: r.id, companyId: r.company_id, jobNo: r.job_no,
        soId: r.so_id, soNumber: r.so_number, customerName: r.customer_name,
        locationId: r.location_id, locationName: r.location_name,
        itemName: r.item_name, itemCode: r.item_code,
        qtyRequired: r.qty_required, qtyProduced: r.qty_produced, uom: r.uom,
        dueDate: r.due_date, startDate: r.start_date, endDate: r.end_date,
        status: r.status,
        bom: typeof r.bom === 'string' ? JSON.parse(r.bom || '[]') : (r.bom || []),
        outputItems: typeof r.output_items === 'string' ? JSON.parse(r.output_items || '[]') : (r.output_items || []),
        notes: r.notes, createdAt: r.created_at, updatedAt: r.updated_at,
      });
    }

    // JSON fallback
    const fp = jsFile(companyId, req.params.id);
    if (!fs.existsSync(fp)) return res.status(404).json({ error: 'Job sheet not found' });
    const record = JSON.parse(fs.readFileSync(fp, 'utf-8'));
    res.json(record);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.post('/job-sheets', async (req, res) => {
  try {
    const companyId = req.body.companyId || req.query.companyId;
    if (!companyId) return res.status(400).json({ error: 'companyId required' });

    const {
      soId, soNumber, customerName,
      locationId = 0, locationName,
      itemName, itemCode,
      qtyRequired = 0, uom,
      dueDate, startDate,
      bom = [],
      outputItems = [],
      notes,
      status = 'pending',
    } = req.body;

    if (db.connected) {
      await ensureTables();
      const [result] = await db.query(
        `INSERT INTO manufacturing_job_sheets
          (company_id, job_no, so_id, so_number, customer_name, location_id, location_name,
           item_name, item_code, qty_required, qty_produced, uom, due_date, start_date, status, bom, output_items, notes)
         VALUES (?, '', ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?)`,
        [
          companyId, soId || null, soNumber || null, customerName || null,
          parseInt(locationId) || 0, locationName || null,
          itemName || null, itemCode || null,
          parseFloat(qtyRequired) || 0, uom || null,
          dueDate || null, startDate || null,
          status, JSON.stringify(bom), JSON.stringify(outputItems), notes || null,
        ]
      );
      const id = result.insertId;
      const jobNo = `JSM${String(id).padStart(6, '0')}`;
      await db.query('UPDATE manufacturing_job_sheets SET job_no = ? WHERE id = ?', [jobNo, id]);
      return res.json({ success: true, id, jobNo, message: `Job Sheet ${jobNo} created` });
    }

    // JSON fallback
    const id = nextJobId(companyId);
    const jobNo = `JSM${String(id).padStart(6, '0')}`;
    const record = {
      id, companyId, jobNo,
      soId: soId || null, soNumber, customerName,
      locationId, locationName,
      itemName, itemCode,
      qtyRequired, qtyProduced: 0, uom,
      dueDate, startDate, endDate: null,
      status, bom, outputItems, notes,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    saveJobSheetJson(companyId, id, record);
    res.json({ success: true, id, jobNo, message: `Job Sheet ${jobNo} created` });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.put('/job-sheets/:id', async (req, res) => {
  try {
    const companyId = req.body.companyId || req.query.companyId;
    if (!companyId) return res.status(400).json({ error: 'companyId required' });

    const {
      soId, soNumber, customerName,
      locationId = 0, locationName,
      itemName, itemCode,
      qtyRequired = 0, qtyProduced = 0, uom,
      dueDate, startDate, endDate,
      bom = [],
      outputItems = [],
      notes,
      status,
    } = req.body;

    if (db.connected) {
      await db.query(
        `UPDATE manufacturing_job_sheets SET
          so_id=?, so_number=?, customer_name=?, location_id=?, location_name=?,
          item_name=?, item_code=?, qty_required=?, qty_produced=?, uom=?,
          due_date=?, start_date=?, end_date=?, status=?, bom=?, output_items=?, notes=?
         WHERE id=? AND company_id=?`,
        [
          soId || null, soNumber || null, customerName || null,
          parseInt(locationId) || 0, locationName || null,
          itemName || null, itemCode || null,
          parseFloat(qtyRequired) || 0, parseFloat(qtyProduced) || 0, uom || null,
          dueDate || null, startDate || null, endDate || null,
          status || 'pending', JSON.stringify(bom), JSON.stringify(outputItems), notes || null,
          req.params.id, companyId,
        ]
      );
      return res.json({ success: true, message: 'Job sheet updated' });
    }

    // JSON fallback
    const fp = jsFile(companyId, req.params.id);
    if (!fs.existsSync(fp)) return res.status(404).json({ error: 'Job sheet not found' });
    const existing = JSON.parse(fs.readFileSync(fp, 'utf-8'));
    const updated = {
      ...existing,
      soId, soNumber, customerName,
      locationId, locationName,
      itemName, itemCode,
      qtyRequired, qtyProduced, uom,
      dueDate, startDate, endDate,
      status: status || existing.status,
      bom, outputItems, notes,
      updatedAt: new Date().toISOString(),
    };
    saveJobSheetJson(companyId, req.params.id, updated);
    res.json({ success: true, message: 'Job sheet updated' });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.delete('/job-sheets/:id', async (req, res) => {
  try {
    const companyId = req.query.companyId;
    if (!companyId) return res.status(400).json({ error: 'companyId required' });

    if (db.connected) {
      const [r] = await db.query(
        'DELETE FROM manufacturing_job_sheets WHERE id = ? AND company_id = ?',
        [req.params.id, companyId]
      );
      if (r.affectedRows) return res.json({ success: true });
      return res.status(404).json({ error: 'Job sheet not found' });
    }

    // JSON fallback
    const sub = path.join(jsDir(companyId), String(req.params.id));
    if (fs.existsSync(sub)) fs.rmSync(sub, { recursive: true });
    res.json({ success: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

module.exports = router;
