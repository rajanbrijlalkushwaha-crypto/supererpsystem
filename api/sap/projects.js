/**
 * SAP MODE — Projects API
 * Central controlling object. Everything links back to a Project.
 * Path: Database/Companies/{companyId}/SAP/Projects/{projectId}/{projectId}.json
 */
const express = require('express');
const path    = require('path');
const fs      = require('fs');
const { getCompanyPath, generateSequentialId, readAllRecords } = require('../helpers');

const router = express.Router();

const dbPath = (cid) => getCompanyPath('SAP/Projects', cid);

/* ── helpers ────────────────────────────────────────────────── */
const readProject = (cid, id) => {
  const dir  = path.join(dbPath(cid), String(id));
  const file = path.join(dir, `${id}.json`);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf-8'));
};

const writeProject = (cid, id, data) => {
  const dir = path.join(dbPath(cid), String(id));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${id}.json`), JSON.stringify(data, null, 2));
};

const nextId = (cid) => {
  const n = generateSequentialId(dbPath(cid), 1);
  return `PROJ-${String(n).padStart(4, '0')}`;
};

/* ── GET all projects ───────────────────────────────────────── */
router.get('/', (req, res) => {
  try {
    const cid  = req.query.companyId;
    const dir  = dbPath(cid);
    const list = [];
    if (fs.existsSync(dir)) {
      fs.readdirSync(dir).forEach(folder => {
        const file = path.join(dir, folder, `${folder}.json`);
        if (fs.existsSync(file)) {
          try { list.push(JSON.parse(fs.readFileSync(file, 'utf-8'))); } catch {}
        }
      });
    }
    // Sort by createdAt desc
    list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json(list);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ── GET single project ─────────────────────────────────────── */
router.get('/:projectId', (req, res) => {
  try {
    const p = readProject(req.query.companyId, req.params.projectId);
    if (!p) return res.status(404).json({ error: 'Project not found' });
    res.json(p);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ── POST create project ────────────────────────────────────── */
router.post('/', (req, res) => {
  try {
    const cid  = req.body.companyId || req.query.companyId;
    const id   = nextId(cid);
    const now  = new Date().toISOString();

    const project = {
      projectId:    id,
      projectName:  req.body.projectName  || '',
      clientId:     req.body.clientId     || '',
      clientName:   req.body.clientName   || '',
      location:     req.body.location     || '',
      projectType:  req.body.projectType  || 'Prefab',   // Prefab | Cabin | Civil | Trading
      startDate:    req.body.startDate    || '',
      endDate:      req.body.endDate      || '',
      status:       req.body.status       || 'Planning', // Planning | Active | Completed | OnHold | Cancelled
      budget:       parseFloat(req.body.budget) || 0,
      description:  req.body.description  || '',
      companyId:    cid,
      createdAt:    now,
      updatedAt:    now,

      // Embedded sub-collections
      scopeItems:    req.body.scopeItems    || [],
      materialItems: req.body.materialItems || [],
      tasks:         req.body.tasks         || [],
    };

    writeProject(cid, id, project);
    res.status(201).json(project);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ── PUT update project ─────────────────────────────────────── */
router.put('/:projectId', (req, res) => {
  try {
    const cid = req.body.companyId || req.query.companyId;
    const id  = req.params.projectId;
    const existing = readProject(cid, id);
    if (!existing) return res.status(404).json({ error: 'Project not found' });

    const updated = {
      ...existing,
      projectName:  req.body.projectName  ?? existing.projectName,
      clientId:     req.body.clientId     ?? existing.clientId,
      clientName:   req.body.clientName   ?? existing.clientName,
      location:     req.body.location     ?? existing.location,
      projectType:  req.body.projectType  ?? existing.projectType,
      startDate:    req.body.startDate    ?? existing.startDate,
      endDate:      req.body.endDate      ?? existing.endDate,
      status:       req.body.status       ?? existing.status,
      budget:       req.body.budget !== undefined ? parseFloat(req.body.budget) : existing.budget,
      description:  req.body.description  ?? existing.description,
      scopeItems:    req.body.scopeItems    ?? existing.scopeItems,
      materialItems: req.body.materialItems ?? existing.materialItems,
      tasks:         req.body.tasks         ?? existing.tasks,
      updatedAt:    new Date().toISOString(),
    };

    writeProject(cid, id, updated);
    res.json(updated);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ── PATCH status only ──────────────────────────────────────── */
router.patch('/:projectId/status', (req, res) => {
  try {
    const cid = req.body.companyId || req.query.companyId;
    const id  = req.params.projectId;
    const existing = readProject(cid, id);
    if (!existing) return res.status(404).json({ error: 'Not found' });
    const updated = { ...existing, status: req.body.status, updatedAt: new Date().toISOString() };
    writeProject(cid, id, updated);
    res.json(updated);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ── DELETE project ─────────────────────────────────────────── */
router.delete('/:projectId', (req, res) => {
  try {
    const cid = req.query.companyId;
    const id  = req.params.projectId;
    const dir = path.join(dbPath(cid), String(id));
    if (!fs.existsSync(dir)) return res.status(404).json({ error: 'Not found' });
    fs.rmSync(dir, { recursive: true, force: true });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
