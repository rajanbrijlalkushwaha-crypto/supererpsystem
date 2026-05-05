/**
 * projects.js — JSON-only project management
 * Stored flat: Database/Companies/{companyId}/Projects/{projectId}.json
 */
const express = require('express');
const path    = require('path');
const fs      = require('fs');
const { ROOT, saveJson } = require('./helpers');

const router = express.Router();

const projDir  = (cid)      => path.join(ROOT, 'Database', 'Companies', cid, 'Projects');
const projFile = (cid, id)  => path.join(projDir(cid), `${id}.json`);

const ensureDir = (d) => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); };

const readAll = (dir) => {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.json'))
    .map(f => { try { return JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8')); } catch { return null; } })
    .filter(Boolean);
};

const nextId = (dir, base = 200001) => {
  if (!fs.existsSync(dir)) return base;
  let max = base - 1;
  fs.readdirSync(dir).forEach(f => {
    const n = parseInt(f, 10);
    if (!isNaN(n) && n > max) max = n;
  });
  return max + 1;
};

const cid = (req) => req.query.companyId || req.body?.companyId || '';

router.get('/', (req, res) => {
  try {
    const companyId = cid(req);
    if (!companyId) return res.status(400).json({ error: 'companyId required' });
    const records = readAll(projDir(companyId)).sort((a, b) => (b.projectId || 0) - (a.projectId || 0));
    res.json(records);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/', (req, res) => {
  try {
    const companyId = cid(req);
    if (!companyId) return res.status(400).json({ error: 'companyId required' });
    const { projectName } = req.body;
    if (!projectName) return res.status(400).json({ error: 'projectName required' });
    const dir = projDir(companyId);
    ensureDir(dir);
    const projectId = nextId(dir);
    const now = new Date().toISOString();
    const rec = { projectId, ...req.body, companyId, status: req.body.status || 'active', createdAt: now, updatedAt: now };
    saveJson(projFile(companyId, projectId), rec);
    res.json({ success: true, projectId, message: `Project created: ${projectId}` });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/:id', (req, res) => {
  try {
    const fp = projFile(cid(req), req.params.id);
    if (!fs.existsSync(fp)) return res.status(404).json({ error: 'Not found' });
    res.json(JSON.parse(fs.readFileSync(fp, 'utf-8')));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/:id', (req, res) => {
  try {
    const companyId = cid(req);
    const fp = projFile(companyId, req.params.id);
    if (!fs.existsSync(fp)) return res.status(404).json({ error: 'Not found' });
    const existing = JSON.parse(fs.readFileSync(fp, 'utf-8'));
    const updated = { ...existing, ...req.body, projectId: existing.projectId, updatedAt: new Date().toISOString() };
    saveJson(fp, updated);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id', (req, res) => {
  try {
    const fp = projFile(cid(req), req.params.id);
    if (!fs.existsSync(fp)) return res.status(404).json({ error: 'Not found' });
    fs.unlinkSync(fp);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
