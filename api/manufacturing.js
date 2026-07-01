const express = require('express');
const path = require('path');
const fs = require('fs');
const db = require('../db');
const jstore = require('./json-store');
const { ROOT, upload, saveUploadedFiles } = require('./helpers');

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
  // Add columns if upgrading from older schema
  try { await db.query(`ALTER TABLE manufacturing_job_sheets ADD COLUMN IF NOT EXISTS output_items JSON`); } catch(_) {}
  try { await db.query(`ALTER TABLE manufacturing_job_sheets ADD COLUMN IF NOT EXISTS specifications TEXT`); } catch(_) {}
  try { await db.query(`ALTER TABLE manufacturing_job_sheets ADD COLUMN IF NOT EXISTS work_instructions TEXT`); } catch(_) {}
  try { await db.query(`ALTER TABLE manufacturing_job_sheets ADD COLUMN IF NOT EXISTS attachments JSON`); } catch(_) {}
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

// ── HELPER: build map of already-scheduled mfg qty per SO item ──────────────────
// mfgMap[soId][itemKey] = total qty already in job sheets (excl. cancelled/rejected)
// Pass excludeJobId to omit a specific job sheet (used in edit mode)
function buildMfgMap(jobSheets, excludeJobId) {
  const map = {};
  jobSheets.forEach(js => {
    if (['cancelled', 'rejected'].includes((js.status || ''))) return;
    if (excludeJobId && String(js.id) === String(excludeJobId)) return;
    const soId = String(js.soId || '');
    if (!soId) return;
    (js.outputItems || []).forEach(it => {
      const key = (it.itemCode || it.itemName || '').toLowerCase();
      if (!key) return;
      if (!map[soId]) map[soId] = {};
      map[soId][key] = (map[soId][key] || 0) + (parseFloat(it.mfgQty != null ? it.mfgQty : it.qty) || 0);
    });
  });
  return map;
}

function applyPendingQty(items, mfgMap, soId) {
  const soMfg = mfgMap[String(soId)] || {};
  return items.map(it => {
    const key = (it.itemCode || it.itemName || '').toLowerCase();
    const alreadyMfg = soMfg[key] || 0;
    const pendingQty = Math.max(0, it.soQty - alreadyMfg);
    return { ...it, alreadyMfg, pendingQty };
  }).filter(it => it.pendingQty > 0);
}

// ── GET SO ITEMS ────────────────────────────────────────────────────────────────
// Returns only SOs/items with pending (un-manufactured) qty.
// ?editJobId=  — exclude that job sheet from the "already manufactured" count (edit mode)

router.get('/so-items', async (req, res) => {
  try {
    const companyId = req.query.companyId;
    const editJobId = req.query.editJobId || null;
    if (!companyId) return res.status(400).json({ error: 'companyId required' });

    if (db.connected) {
      const [soRows] = await db.query(
        `SELECT id, order_no, customer_name, data FROM sales_orders
         WHERE company_id = ? AND status IN ('confirmed','approved','active')
         ORDER BY id DESC`,
        [companyId]
      );

      // Load all job sheets to compute manufactured quantities
      await ensureTables();
      const [jsRows] = await db.query(
        `SELECT id, so_id, status, output_items FROM manufacturing_job_sheets WHERE company_id = ?`,
        [companyId]
      );
      const mfgMap = buildMfgMap(jsRows.map(r => ({
        id: r.id, soId: r.so_id, status: r.status,
        outputItems: typeof r.output_items === 'string' ? JSON.parse(r.output_items || '[]') : (r.output_items || []),
      })), editJobId);

      const result = soRows.map(r => {
        let data = {};
        try { data = typeof r.data === 'string' ? JSON.parse(r.data) : (r.data || {}); } catch {}
        const rawItems = (data.items || []).map(it => ({
          itemName: it.description || it.itemName || it.item_name || '',
          itemCode: it.itemCode || it.item_code || '',
          soQty: parseFloat(it.qty || it.quantity || 0),
          uom: it.unit || it.uom || '',
          rate: parseFloat(it.rate || 0),
          type: it.type || '',
          bom: (it.bom || []).map(b => ({
            material: b.itemName || b.material || b.name || '',
            qty: parseFloat(b.qty || 0),
            uom: b.unit || b.uom || '',
            hsn: b.hsnCode || b.hsn || '',
            availableQty: '',
          })),
        }));
        const items = applyPendingQty(rawItems, mfgMap, r.id);
        if (!items.length) return null;
        return {
          soId: r.id,
          soNumber: r.order_no,
          customerName: r.customer_name,
          items,
          scopeItems: data.scopeItems || [],
          productSpecs: data.productSpecs || '',
          technicalDetails: data.technicalDetails || '',
          drawingNumber: data.drawingNumber || '',
          version: data.version || '',
          soAttachments: (data.attachments || []).map(a => ({ ...a, soId: r.id })),
        };
      }).filter(Boolean);

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
            soRecords.push(JSON.parse(fs.readFileSync(full, 'utf-8')));
          } else if (fs.statSync(full).isDirectory()) {
            fs.readdirSync(full).filter(f => f.endsWith('.json')).forEach(f => {
              try { soRecords.push(JSON.parse(fs.readFileSync(path.join(full, f), 'utf-8'))); } catch {}
            });
          }
        } catch {}
      });
    }

    // Build mfgMap from existing JSON job sheets
    const existingJs = readAllJobSheets(companyId);
    const mfgMap = buildMfgMap(existingJs, editJobId);

    const filtered = soRecords.filter(so =>
      ['confirmed', 'approved', 'active'].includes((so.status || '').toLowerCase())
    );
    const result = filtered.map(so => {
      const sid = so.id || so.orderId;
      const rawItems = (so.items || so.data?.items || []).map(it => ({
        itemName: it.description || it.itemName || it.item_name || '',
        itemCode: it.itemCode || it.item_code || '',
        soQty: parseFloat(it.qty || it.quantity || 0),
        uom: it.unit || it.uom || '',
        rate: parseFloat(it.rate || 0),
        type: it.type || '',
        bom: (it.bom || []).map(b => ({
          material: b.itemName || b.material || b.name || '',
          qty: parseFloat(b.qty || 0),
          uom: b.unit || b.uom || '',
          hsn: b.hsnCode || b.hsn || '',
          availableQty: '',
        })),
      }));
      const items = applyPendingQty(rawItems, mfgMap, sid);
      if (!items.length) return null;
      return {
        soId: sid,
        soNumber: so.voucherNumber || so.orderNo || so.order_no || so.soNumber || '',
        customerName: so.party || so.customerName || so.customer_name || '',
        items,
        scopeItems: so.scopeItems || [],
        productSpecs: so.productSpecs || '',
        technicalDetails: so.technicalDetails || '',
        drawingNumber: so.drawingNumber || '',
        version: so.version || '',
        soAttachments: (so.attachments || []).map(a => ({ ...a, soId: sid })),
      };
    }).filter(Boolean);
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ── GET MANUFACTURING ORDERS — SOs grouped with job sheet progress ───────────────

router.get('/manufacturing-orders', async (req, res) => {
  try {
    const companyId = req.query.companyId;
    if (!companyId) return res.status(400).json({ error: 'companyId required' });

    let jobSheets;
    if (db.connected) {
      await ensureTables();
      const [rows] = await db.query(
        `SELECT id, job_no, so_id, so_number, customer_name, location_name,
                status, due_date, start_date, created_at, output_items
         FROM manufacturing_job_sheets WHERE company_id = ? ORDER BY id DESC`,
        [companyId]
      );
      jobSheets = rows.map(r => ({
        id: r.id, jobNo: r.job_no, soId: r.so_id, soNumber: r.so_number,
        customerName: r.customer_name, locationName: r.location_name,
        status: r.status, dueDate: r.due_date, startDate: r.start_date, createdAt: r.created_at,
        outputItems: typeof r.output_items === 'string' ? JSON.parse(r.output_items || '[]') : (r.output_items || []),
      }));
    } else {
      jobSheets = readAllJobSheets(companyId);
    }

    // Group by soId — only include job sheets with a linked SO
    const soGroups = {};
    jobSheets.forEach(js => {
      if (!js.soId) return;
      const key = String(js.soId);
      if (!soGroups[key]) {
        soGroups[key] = {
          soId: js.soId, soNumber: js.soNumber || '', customerName: js.customerName || '',
          jobSheets: [], itemMap: {}, latestDate: null,
        };
      }
      soGroups[key].jobSheets.push({ id: js.id, jobNo: js.jobNo, status: js.status, dueDate: js.dueDate, locationName: js.locationName });
      if (!soGroups[key].latestDate || new Date(js.createdAt) > new Date(soGroups[key].latestDate)) {
        soGroups[key].latestDate = js.createdAt;
      }
      // Accumulate item manufacturing quantities
      (js.outputItems || []).forEach(it => {
        const k = (it.itemCode || it.itemName || '').toLowerCase();
        if (!k) return;
        if (!soGroups[key].itemMap[k]) {
          soGroups[key].itemMap[k] = { itemName: it.itemName, itemCode: it.itemCode, uom: it.uom, mfgQty: 0 };
        }
        soGroups[key].itemMap[k].mfgQty += parseFloat(it.mfgQty != null ? it.mfgQty : it.qty) || 0;
      });
    });

    const result = Object.values(soGroups).map(g => {
      const statuses = [...new Set(g.jobSheets.map(js => js.status))];
      const overallStatus = g.jobSheets.every(js => js.status === 'completed') ? 'completed'
        : g.jobSheets.some(js => js.status === 'in-progress') ? 'in-progress'
        : g.jobSheets.some(js => js.status === 'approved') ? 'approved'
        : g.jobSheets.some(js => js.status === 'submitted') ? 'submitted'
        : 'pending';
      return {
        soId: g.soId, soNumber: g.soNumber, customerName: g.customerName,
        jobSheets: g.jobSheets, items: Object.values(g.itemMap),
        statuses, overallStatus, latestDate: g.latestDate,
        jobCount: g.jobSheets.length,
      };
    }).sort((a, b) => new Date(b.latestDate) - new Date(a.latestDate));

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
        specifications: r.specifications || '', workInstructions: r.work_instructions || '',
        attachments: typeof r.attachments === 'string' ? JSON.parse(r.attachments || '[]') : (r.attachments || []),
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
        specifications: r.specifications || '', workInstructions: r.work_instructions || '',
        attachments: typeof r.attachments === 'string' ? JSON.parse(r.attachments || '[]') : (r.attachments || []),
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

router.post('/job-sheets', upload.array('attachmentFiles'), async (req, res) => {
  try {
    const companyId = req.body.companyId || req.query.companyId;
    if (!companyId) return res.status(400).json({ error: 'companyId required' });

    /* parse a body field that may be a JSON string (arrays/objects) or plain string */
    const jp = (k, def = null) => {
      const v = req.body[k]; if (v == null || v === '') return def;
      try { return (typeof v === 'string' && (v[0] === '[' || v[0] === '{')) ? JSON.parse(v) : v; } catch { return def; }
    };

    const soId         = req.body.soId  || null;
    const soNumber     = req.body.soNumber     || null;
    const customerName = req.body.customerName || null;
    const locationId   = parseInt(req.body.locationId)   || 0;
    const locationName = req.body.locationName || null;
    const itemName     = req.body.itemName     || null;
    const itemCode     = req.body.itemCode     || null;
    const qtyRequired  = parseFloat(req.body.qtyRequired) || 0;
    const uom          = req.body.uom       || null;
    const dueDate      = req.body.dueDate   || null;
    const startDate    = req.body.startDate || null;
    const notes        = req.body.notes     || null;
    const status       = req.body.status    || 'pending';
    const specifications   = req.body.specifications   || '';
    const workInstructions = req.body.workInstructions || '';
    const bom         = jp('bom',  []);
    const outputItems = jp('outputItems', []);

    /* save uploaded files to docs folder */
    const saveFiles = (id) => {
      if (!req.files?.length) return [];
      const docsPath = path.join(jsDir(companyId), String(id), 'docs');
      fs.mkdirSync(docsPath, { recursive: true });
      const rawNames = req.body.attachmentNames;
      const names = rawNames ? (Array.isArray(rawNames) ? rawNames : [rawNames]) : [];
      return saveUploadedFiles(req.files, docsPath, names);
    };

    if (db.connected) {
      await ensureTables();
      const [result] = await db.query(
        `INSERT INTO manufacturing_job_sheets
          (company_id, job_no, so_id, so_number, customer_name, location_id, location_name,
           item_name, item_code, qty_required, qty_produced, uom, due_date, start_date, status,
           bom, output_items, notes, specifications, work_instructions, attachments)
         VALUES (?, '', ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, '[]')`,
        [
          companyId, soId, soNumber, customerName,
          locationId, locationName, itemName, itemCode,
          qtyRequired, uom, dueDate, startDate,
          status, JSON.stringify(bom), JSON.stringify(outputItems), notes,
          specifications || null, workInstructions || null,
        ]
      );
      const id = result.insertId;
      const jobNo = `JSM${String(id).padStart(6, '0')}`;
      await db.query('UPDATE manufacturing_job_sheets SET job_no = ? WHERE id = ?', [jobNo, id]);
      const attachments = saveFiles(id);
      if (attachments.length) await db.query('UPDATE manufacturing_job_sheets SET attachments=? WHERE id=?', [JSON.stringify(attachments), id]);
      return res.json({ success: true, id, jobNo, attachments, message: `Job Sheet ${jobNo} created` });
    }

    // JSON fallback
    const id = nextJobId(companyId);
    const jobNo = `JSM${String(id).padStart(6, '0')}`;
    const attachments = saveFiles(id);
    const record = {
      id, companyId, jobNo,
      soId: soId || null, soNumber, customerName,
      locationId, locationName, itemName, itemCode,
      qtyRequired, qtyProduced: 0, uom,
      dueDate, startDate, endDate: null,
      status, bom, outputItems, notes,
      specifications, workInstructions, attachments,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    saveJobSheetJson(companyId, id, record);
    res.json({ success: true, id, jobNo, attachments, message: `Job Sheet ${jobNo} created` });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.put('/job-sheets/:id', upload.array('attachmentFiles'), async (req, res) => {
  try {
    const companyId = req.body.companyId || req.query.companyId;
    if (!companyId) return res.status(400).json({ error: 'companyId required' });

    const jp = (k, def = null) => {
      const v = req.body[k]; if (v == null || v === '') return def;
      try { return (typeof v === 'string' && (v[0] === '[' || v[0] === '{')) ? JSON.parse(v) : v; } catch { return def; }
    };

    const soId             = req.body.soId        || null;
    const soNumber         = req.body.soNumber     || null;
    const customerName     = req.body.customerName || null;
    const locationId       = parseInt(req.body.locationId)   || 0;
    const locationName     = req.body.locationName || null;
    const itemName         = req.body.itemName     || null;
    const itemCode         = req.body.itemCode     || null;
    const qtyRequired      = parseFloat(req.body.qtyRequired)  || 0;
    const qtyProduced      = parseFloat(req.body.qtyProduced)  || 0;
    const uom              = req.body.uom       || null;
    const dueDate          = req.body.dueDate   || null;
    const startDate        = req.body.startDate || null;
    const endDate          = req.body.endDate   || null;
    const notes            = req.body.notes     || null;
    const status           = req.body.status    || 'pending';
    const specifications   = req.body.specifications   || '';
    const workInstructions = req.body.workInstructions || '';
    const bom              = jp('bom', []);
    const outputItems      = jp('outputItems', []);
    const existingAtts     = jp('existingAttachments', []);

    const saveFiles = (id) => {
      if (!req.files?.length) return [];
      const docsPath = path.join(jsDir(companyId), String(id), 'docs');
      fs.mkdirSync(docsPath, { recursive: true });
      const rawNames = req.body.attachmentNames;
      const names = rawNames ? (Array.isArray(rawNames) ? rawNames : [rawNames]) : [];
      return saveUploadedFiles(req.files, docsPath, names);
    };

    const id = req.params.id;
    const newAtts = saveFiles(id);
    const allAtts = [...(Array.isArray(existingAtts) ? existingAtts : []), ...newAtts];

    if (db.connected) {
      await ensureTables();
      await db.query(
        `UPDATE manufacturing_job_sheets SET
          so_id=?, so_number=?, customer_name=?, location_id=?, location_name=?,
          item_name=?, item_code=?, qty_required=?, qty_produced=?, uom=?,
          due_date=?, start_date=?, end_date=?, status=?, bom=?, output_items=?, notes=?,
          specifications=?, work_instructions=?, attachments=?
         WHERE id=? AND company_id=?`,
        [
          soId, soNumber, customerName,
          locationId, locationName,
          itemName, itemCode,
          qtyRequired, qtyProduced, uom,
          dueDate || null, startDate || null, endDate || null,
          status, JSON.stringify(bom), JSON.stringify(outputItems), notes,
          specifications || null, workInstructions || null, JSON.stringify(allAtts),
          id, companyId,
        ]
      );
      return res.json({ success: true, attachments: allAtts, message: 'Job sheet updated' });
    }

    // JSON fallback
    const fp = jsFile(companyId, id);
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
      specifications, workInstructions,
      attachments: allAtts,
      updatedAt: new Date().toISOString(),
    };
    saveJobSheetJson(companyId, id, updated);
    res.json({ success: true, attachments: allAtts, message: 'Job sheet updated' });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ── Serve job sheet attached files ──────────────────────────────────────────────
router.get('/job-sheets/:id/docs/:fileName', (req, res) => {
  const companyId = req.query.companyId;
  if (!companyId) return res.status(400).send('companyId required');
  const fp = path.join(jsDir(companyId), String(req.params.id), 'docs', req.params.fileName);
  if (!fs.existsSync(fp)) return res.status(404).send('File not found');
  res.sendFile(path.resolve(fp));
});

// ── Upload attachments to an existing job sheet ──────────────────────────────────
router.patch('/job-sheets/:id/attachments', upload.array('attachmentFiles'), async (req, res) => {
  try {
    const companyId = req.body.companyId || req.query.companyId;
    if (!companyId) return res.status(400).json({ error: 'companyId required' });
    if (!req.files || req.files.length === 0) return res.json({ success: true, attachments: [] });

    const docsPath = path.join(jsDir(companyId), String(req.params.id), 'docs');
    fs.mkdirSync(docsPath, { recursive: true });

    const rawNames = req.body.attachmentNames;
    const fileNames = rawNames ? (Array.isArray(rawNames) ? rawNames : [rawNames]) : [];
    const saved = saveUploadedFiles(req.files, docsPath, fileNames);

    // Merge into job sheet record
    if (db.connected) {
      await ensureTables();
      const [[r]] = await db.query('SELECT attachments FROM manufacturing_job_sheets WHERE id=? AND company_id=?', [req.params.id, companyId]);
      const existing = r ? (typeof r.attachments === 'string' ? JSON.parse(r.attachments || '[]') : (r.attachments || [])) : [];
      const merged = [...existing, ...saved];
      await db.query('UPDATE manufacturing_job_sheets SET attachments=? WHERE id=? AND company_id=?', [JSON.stringify(merged), req.params.id, companyId]);
      return res.json({ success: true, attachments: merged });
    }

    const fp = jsFile(companyId, req.params.id);
    if (!fs.existsSync(fp)) return res.status(404).json({ error: 'Job sheet not found' });
    const existing2 = JSON.parse(fs.readFileSync(fp, 'utf-8'));
    const merged2 = [...(existing2.attachments || []), ...saved];
    saveJobSheetJson(companyId, req.params.id, { ...existing2, attachments: merged2, updatedAt: new Date().toISOString() });
    res.json({ success: true, attachments: merged2 });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ── Remove a single attachment from a job sheet ──────────────────────────────────
router.delete('/job-sheets/:id/attachments/:fileName', async (req, res) => {
  try {
    const companyId = req.query.companyId;
    if (!companyId) return res.status(400).json({ error: 'companyId required' });
    const fileName = req.params.fileName;

    if (db.connected) {
      await ensureTables();
      const [[r]] = await db.query('SELECT attachments FROM manufacturing_job_sheets WHERE id=? AND company_id=?', [req.params.id, companyId]);
      const atts = r ? (typeof r.attachments === 'string' ? JSON.parse(r.attachments || '[]') : (r.attachments || [])) : [];
      const filtered = atts.filter(a => a.fileName !== fileName);
      await db.query('UPDATE manufacturing_job_sheets SET attachments=? WHERE id=? AND company_id=?', [JSON.stringify(filtered), req.params.id, companyId]);
      return res.json({ success: true });
    }

    const fp = jsFile(companyId, req.params.id);
    if (!fs.existsSync(fp)) return res.status(404).json({ error: 'Job sheet not found' });
    const existing = JSON.parse(fs.readFileSync(fp, 'utf-8'));
    const filtered = (existing.attachments || []).filter(a => a.fileName !== fileName);
    saveJobSheetJson(companyId, req.params.id, { ...existing, attachments: filtered, updatedAt: new Date().toISOString() });
    res.json({ success: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.patch('/job-sheets/:id/approve', async (req, res) => {
  try {
    const companyId = req.body.companyId || req.query.companyId;
    if (!companyId) return res.status(400).json({ error: 'companyId required' });
    const approvedAt = new Date().toISOString();
    const approvedBy = req.body.approvedBy || 'Admin';

    if (db.connected) {
      await ensureTables();
      try { await db.query(`ALTER TABLE manufacturing_job_sheets ADD COLUMN IF NOT EXISTS approved_at DATETIME`); } catch (_) {}
      try { await db.query(`ALTER TABLE manufacturing_job_sheets ADD COLUMN IF NOT EXISTS approved_by VARCHAR(100)`); } catch (_) {}
      await db.query(
        `UPDATE manufacturing_job_sheets SET status='approved', approved_at=?, approved_by=? WHERE id=? AND company_id=?`,
        [approvedAt, approvedBy, req.params.id, companyId]
      );
      return res.json({ success: true, message: 'Job sheet approved' });
    }

    const fp = jsFile(companyId, req.params.id);
    if (!fs.existsSync(fp)) return res.status(404).json({ error: 'Job sheet not found' });
    const existing = JSON.parse(fs.readFileSync(fp, 'utf-8'));
    saveJobSheetJson(companyId, req.params.id, { ...existing, status: 'approved', approvedAt, approvedBy, updatedAt: approvedAt });
    res.json({ success: true, message: 'Job sheet approved' });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.patch('/job-sheets/:id/reject', async (req, res) => {
  try {
    const companyId = req.body.companyId || req.query.companyId;
    if (!companyId) return res.status(400).json({ error: 'companyId required' });
    const rejectedAt = new Date().toISOString();
    const reason = req.body.reason || '';

    if (db.connected) {
      await ensureTables();
      try { await db.query(`ALTER TABLE manufacturing_job_sheets ADD COLUMN IF NOT EXISTS rejected_reason TEXT`); } catch (_) {}
      await db.query(
        `UPDATE manufacturing_job_sheets SET status='rejected', rejected_reason=? WHERE id=? AND company_id=?`,
        [reason, req.params.id, companyId]
      );
      return res.json({ success: true, message: 'Job sheet rejected' });
    }

    const fp = jsFile(companyId, req.params.id);
    if (!fs.existsSync(fp)) return res.status(404).json({ error: 'Job sheet not found' });
    const existing = JSON.parse(fs.readFileSync(fp, 'utf-8'));
    saveJobSheetJson(companyId, req.params.id, { ...existing, status: 'rejected', rejectedReason: reason, rejectedAt, updatedAt: rejectedAt });
    res.json({ success: true, message: 'Job sheet rejected' });
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
