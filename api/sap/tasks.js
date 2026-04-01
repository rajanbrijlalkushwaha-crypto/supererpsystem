/**
 * SAP MODE — Task Management (Project Execution)
 * Path: Database/Companies/{companyId}/SAP/Tasks/{taskId}/{taskId}.json
 */
const express = require('express');
const path    = require('path');
const fs      = require('fs');
const { getCompanyPath, generateSequentialId } = require('../helpers');

const router = express.Router();

const dbPath = (cid) => getCompanyPath('SAP/Tasks', cid);

const readTask  = (cid, id) => { const f = path.join(dbPath(cid), id, `${id}.json`); return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf-8')) : null; };
const writeTask = (cid, id, data) => { const d = path.join(dbPath(cid), id); fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(d, `${id}.json`), JSON.stringify(data, null, 2)); };
const nextId    = (cid) => `SAP-TASK-${generateSequentialId(dbPath(cid), 1).toString().padStart(4, '0')}`;

/* ── GET all tasks ───────────────────────────────────────────── */
router.get('/', (req, res) => {
  try {
    const cid = req.query.companyId;
    const dir = dbPath(cid);
    const list = [];
    if (fs.existsSync(dir)) {
      fs.readdirSync(dir).forEach(folder => {
        const file = path.join(dir, folder, `${folder}.json`);
        if (fs.existsSync(file)) { try { list.push(JSON.parse(fs.readFileSync(file, 'utf-8'))); } catch {} }
      });
    }
    const pid = req.query.projectId;
    const out = pid ? list.filter(t => t.projectId === pid) : list;
    out.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0) || a.createdAt?.localeCompare(b.createdAt || ''));
    res.json(out);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ── GET single task ─────────────────────────────────────────── */
router.get('/:taskId', (req, res) => {
  try {
    const task = readTask(req.query.companyId, req.params.taskId);
    if (!task) return res.status(404).json({ error: 'Task not found' });
    res.json(task);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ── POST create task ───────────────────────────────────────── */
router.post('/', (req, res) => {
  try {
    const cid = req.body.companyId || req.query.companyId;
    if (!req.body.projectId) return res.status(400).json({ error: 'projectId is required' });
    if (!req.body.title)     return res.status(400).json({ error: 'title is required' });

    const id  = nextId(cid);
    const now = new Date().toISOString();

    const task = {
      taskId:      id,
      projectId:   req.body.projectId,
      title:       req.body.title,
      description: req.body.description || '',
      assignedTo:  req.body.assignedTo  || '',
      priority:    req.body.priority    || 'Medium',  // High | Medium | Low
      status:      req.body.status      || 'Open',    // Open | InProgress | Done | Blocked
      startDate:   req.body.startDate   || now.slice(0, 10),
      endDate:     req.body.endDate     || '',
      sortOrder:   req.body.sortOrder   || 0,
      tags:        req.body.tags        || [],
      companyId:   cid,
      createdAt:   now,
      updatedAt:   now,
    };

    writeTask(cid, id, task);
    res.status(201).json(task);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ── PATCH update task status ───────────────────────────────── */
router.patch('/:taskId/status', (req, res) => {
  try {
    const cid  = req.body.companyId || req.query.companyId;
    const task = readTask(cid, req.params.taskId);
    if (!task) return res.status(404).json({ error: 'Task not found' });
    const updated = { ...task, status: req.body.status, updatedAt: new Date().toISOString() };
    writeTask(cid, task.taskId, updated);
    res.json(updated);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ── PUT update task ────────────────────────────────────────── */
router.put('/:taskId', (req, res) => {
  try {
    const cid  = req.body.companyId || req.query.companyId;
    const task = readTask(cid, req.params.taskId);
    if (!task) return res.status(404).json({ error: 'Task not found' });
    const updated = {
      ...task,
      title:       req.body.title       ?? task.title,
      description: req.body.description ?? task.description,
      assignedTo:  req.body.assignedTo  ?? task.assignedTo,
      priority:    req.body.priority    ?? task.priority,
      status:      req.body.status      ?? task.status,
      startDate:   req.body.startDate   ?? task.startDate,
      endDate:     req.body.endDate     ?? task.endDate,
      tags:        req.body.tags        ?? task.tags,
      updatedAt:   new Date().toISOString(),
    };
    writeTask(cid, task.taskId, updated);
    res.json(updated);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ── DELETE task ────────────────────────────────────────────── */
router.delete('/:taskId', (req, res) => {
  try {
    const cid = req.query.companyId;
    const dir = path.join(dbPath(cid), req.params.taskId);
    if (!fs.existsSync(dir)) return res.status(404).json({ error: 'Not found' });
    fs.rmSync(dir, { recursive: true, force: true });
    res.json({ deleted: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
