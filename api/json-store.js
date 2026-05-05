/**
 * json-store.js
 * JSON file CRUD helpers — used as fallback when MariaDB is unavailable.
 * All data lives in: Database/Companies/{companyId}/{Module}/{id}/{id}.json
 * Companies are flat:  Database/Companies/{companyId}.json
 */
const fs   = require('fs');
const path = require('path');
const { ROOT } = require('./helpers');

const companyBase = (companyId, module) =>
  path.join(ROOT, 'Database', 'Companies', companyId, module);

// ── Read all records for a module+company (each record in its own subdir) ──
const readAll = (module, companyId) => {
  const dir = companyBase(companyId, module);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(d => {
      const full = path.join(dir, d);
      return fs.statSync(full).isDirectory() && !isNaN(parseInt(d, 10));
    })
    .sort((a, b) => parseInt(b, 10) - parseInt(a, 10)) // newest first
    .map(d => {
      const subdir = path.join(dir, d);
      // Only read the MOST RECENTLY MODIFIED json file in each ID folder
      // (prevents duplicates when a record is renamed and old file isn't cleaned up)
      const jsonFiles = fs.readdirSync(subdir)
        .filter(f => f.endsWith('.json'))
        .map(f => ({ f, mtime: fs.statSync(path.join(subdir, f)).mtimeMs }))
        .sort((a, b) => b.mtime - a.mtime); // newest first
      if (!jsonFiles.length) return null;
      try { return JSON.parse(fs.readFileSync(path.join(subdir, jsonFiles[0].f), 'utf-8')); }
      catch { return null; }
    })
    .filter(Boolean);
};

// ── Get next sequential ID for a module ──
const nextId = (module, companyId, base) => {
  const dir = companyBase(companyId, module);
  if (!fs.existsSync(dir)) return base;
  let max = base - 1;
  fs.readdirSync(dir).forEach(d => {
    const n = parseInt(d, 10);
    if (!isNaN(n) && n > max) max = n;
  });
  return max + 1;
};

// ── Read one record by ID ──
const readOne = (module, companyId, id) => {
  const dir = path.join(companyBase(companyId, module), String(id));
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
  if (!files.length) return null;
  try { return JSON.parse(fs.readFileSync(path.join(dir, files[0]), 'utf-8')); }
  catch { return null; }
};

// ── Delete one record folder ──
const deleteOne = (module, companyId, id) => {
  const dir = path.join(companyBase(companyId, module), String(id));
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
};

// ── Companies: stored at Database/Companies/{companyId}/company.json ──
const _companyFile = (companyId) => {
  const dir = path.join(ROOT, 'Database', 'Companies');
  const newPath    = path.join(dir, companyId, 'company.json');
  const legacyPath = path.join(dir, `${companyId}.json`);
  return fs.existsSync(newPath) ? newPath : fs.existsSync(legacyPath) ? legacyPath : null;
};

const readAllCompanies = () => {
  const dir = path.join(ROOT, 'Database', 'Companies');
  if (!fs.existsSync(dir)) return [];
  const results = [];
  fs.readdirSync(dir).forEach(entry => {
    const full = path.join(dir, entry);
    try {
      if (fs.statSync(full).isDirectory() && /^C\d+$/.test(entry)) {
        const fp = _companyFile(entry);
        if (fp) results.push(JSON.parse(fs.readFileSync(fp, 'utf-8')));
      }
    } catch {}
  });
  return results;
};

const readOneCompany = (companyId) => {
  const fp = _companyFile(companyId);
  if (!fp) return null;
  try { return JSON.parse(fs.readFileSync(fp, 'utf-8')); } catch { return null; }
};

const nextCompanyId = () => {
  const dir = path.join(ROOT, 'Database', 'Companies');
  if (!fs.existsSync(dir)) return 'C1';
  let max = 0;
  fs.readdirSync(dir).forEach(entry => {
    const m = entry.match(/^C(\d+)$/);
    if (m && parseInt(m[1]) > max) max = parseInt(m[1]);
  });
  return 'C' + (max + 1);
};

module.exports = { readAll, nextId, readOne, deleteOne, readAllCompanies, readOneCompany, nextCompanyId };
