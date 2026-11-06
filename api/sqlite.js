/**
 * sqlite.js — SQLite-backed read index over the Database/Companies JSON tree.
 *
 * Writes still go to JSON files through the existing fs calls across the API.
 * A recursive watcher re-indexes changed files, so reads are served from SQLite
 * without any write path needing to know this layer exists.
 */
const fs   = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { ROOT } = require('./helpers');

const COMPANIES = path.join(ROOT, 'Database', 'Companies');
const DB_FILE   = path.join(ROOT, 'Database', 'epsilon.db');

const db = new Database(DB_FILE);
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS records (
    company_id   TEXT    NOT NULL,
    module       TEXT    NOT NULL,
    rec_id       TEXT    NOT NULL,
    rel_path     TEXT    NOT NULL,
    depth        INTEGER NOT NULL,
    is_canonical INTEGER NOT NULL,
    sort_key     INTEGER,
    mtime_ms     INTEGER NOT NULL,
    data         TEXT    NOT NULL,
    PRIMARY KEY (company_id, module, rel_path)
  );
  CREATE INDEX IF NOT EXISTS idx_records_lookup ON records(company_id, module, sort_key DESC);
  CREATE INDEX IF NOT EXISTS idx_records_id     ON records(company_id, module, rec_id);
`);

const upsert = db.prepare(`
  INSERT INTO records (company_id, module, rec_id, rel_path, depth, is_canonical, sort_key, mtime_ms, data)
  VALUES (@company_id, @module, @rec_id, @rel_path, @depth, @is_canonical, @sort_key, @mtime_ms, @data)
  ON CONFLICT(company_id, module, rel_path) DO UPDATE SET
    rec_id = excluded.rec_id, depth = excluded.depth, is_canonical = excluded.is_canonical,
    sort_key = excluded.sort_key, mtime_ms = excluded.mtime_ms, data = excluded.data
`);
const delByPath   = db.prepare(`DELETE FROM records WHERE company_id=? AND module=? AND rel_path=?`);
const delByPrefix = db.prepare(`DELETE FROM records WHERE company_id=? AND module=? AND (rel_path=? OR rel_path LIKE ?)`);
const delByRecId  = db.prepare(`DELETE FROM records WHERE company_id=? AND module=? AND rec_id=?`);

/** Split a path under Database/Companies into {companyId, module, relPath}. */
function classify(absPath) {
  const rel = path.relative(COMPANIES, absPath);
  if (rel.startsWith('..')) return null;
  const parts = rel.split(path.sep);
  if (parts.length < 2) return null;
  const companyId = parts[0];
  if (!/^C\d+$/.test(companyId)) return null;

  // Banks live one level deeper (Accounts/Banks) and are read as their own module.
  const isBanks = parts[1] === 'Accounts' && parts[2] === 'Banks';
  const module  = isBanks ? 'Accounts/Banks' : parts[1];
  const tail    = parts.slice(isBanks ? 3 : 2);
  if (!tail.length) return null;
  return { companyId, module, relPath: tail.join('/'), tail };
}

/** Split a module DIRECTORY path into {companyId, module}. */
function classifyDir(absPath) {
  const rel = path.relative(COMPANIES, absPath);
  if (rel.startsWith('..')) return null;
  const parts = rel.split(path.sep).filter(Boolean);
  if (parts.length < 2) return null;
  if (!/^C\d+$/.test(parts[0])) return null;
  return { companyId: parts[0], module: parts.slice(1).join('/') };
}

function indexFile(absPath) {
  if (!absPath.endsWith('.json')) return;
  const c = classify(absPath);
  if (!c) return;

  let stat;
  try { stat = fs.statSync(absPath); } catch { return; }
  if (!stat.isFile()) return;

  let raw;
  try { raw = fs.readFileSync(absPath, 'utf-8'); } catch { return; }
  try { JSON.parse(raw); } catch { return; } // skip malformed files, same as the old readers

  const depth = c.tail.length - 1;          // 0 = flat file in module dir, 1 = inside {id}/
  const stem  = path.basename(c.relPath, '.json');
  const recId = depth === 0 ? stem : c.tail[0];
  const n     = parseInt(recId, 10);

  upsert.run({
    company_id: c.companyId,
    module: c.module,
    rec_id: recId,
    rel_path: c.relPath,
    depth,
    is_canonical: stem === recId ? 1 : 0,
    sort_key: isNaN(n) ? null : n,
    mtime_ms: Math.floor(stat.mtimeMs),
    data: raw,
  });
}

function walk(dir, onFile) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'docs' || e.name === 'node_modules') continue; // attachments, never records
      walk(full, onFile);
    } else if (e.isFile() && e.name.endsWith('.json')) {
      onFile(full);
    }
  }
}

/**
 * Sync the index with disk. Only files whose mtime changed are re-read, so a
 * restart on an unchanged tree costs a directory walk rather than 3k JSON parses.
 */
function reindexAll() {
  const started = Date.now();

  const onDisk = new Map(); // "company|module|relPath" -> {abs, mtime}
  walk(COMPANIES, abs => {
    const c = classify(abs);
    if (!c) return;
    let st; try { st = fs.statSync(abs); } catch { return; }
    onDisk.set(`${c.companyId}|${c.module}|${c.relPath}`, { abs, mtime: Math.floor(st.mtimeMs) });
  });

  const known = new Map();
  for (const r of db.prepare('SELECT company_id, module, rel_path, mtime_ms FROM records').all()) {
    known.set(`${r.company_id}|${r.module}|${r.rel_path}`, r.mtime_ms);
  }

  const changed = [];
  for (const [key, v] of onDisk) if (known.get(key) !== v.mtime) changed.push(v.abs);
  const removed = [...known.keys()].filter(k => !onDisk.has(k));

  const apply = db.transaction(() => {
    changed.forEach(indexFile);
    const del = db.prepare('DELETE FROM records WHERE company_id=? AND module=? AND rel_path=?');
    removed.forEach(k => { const [c, m, ...rest] = k.split('|'); del.run(c, m, rest.join('|')); });
  });
  apply();

  const count = db.prepare('SELECT COUNT(*) n FROM records').get().n;
  console.log(`[sqlite] index ready: ${count} records (${changed.length} updated, ${removed.length} removed) in ${Date.now() - started}ms`);
  return count;
}

/** Remove index rows for a path that no longer exists (file or record folder). */
function removePath(absPath) {
  const c = classify(absPath);
  if (!c) return;
  delByPath.run(c.companyId, c.module, c.relPath);
  delByPrefix.run(c.companyId, c.module, c.relPath, `${c.relPath}/%`);
}

let watcher = null;
const pending = new Map();

function startWatcher() {
  if (watcher) return;
  try {
    watcher = fs.watch(COMPANIES, { recursive: true }, (_event, filename) => {
      if (!filename) return;
      const abs = path.join(COMPANIES, filename);
      if (!abs.endsWith('.json') && fs.existsSync(abs) && fs.statSync(abs).isFile()) return;
      // Debounce: editors and the API often touch a file several times in a row.
      clearTimeout(pending.get(abs));
      pending.set(abs, setTimeout(() => {
        pending.delete(abs);
        if (fs.existsSync(abs)) indexFile(abs);
        else removePath(abs);
      }, 15));
    });
    watcher.on('error', e => console.error('[sqlite] watcher error:', e.message));
    console.log('[sqlite] watching Database/Companies for changes');
  } catch (e) {
    console.error('[sqlite] watch unavailable, falling back to periodic reindex:', e.message);
    setInterval(reindexAll, 30000).unref();
  }
}

/* ── Query helpers used by the read layer ── */

// Mirrors json-store.readAll: numeric subdirs only, prefer {id}.json, else the
// most recently modified json in that folder, newest record first.
const qCanonical = db.prepare(`
  SELECT data FROM (
    SELECT data, sort_key,
           ROW_NUMBER() OVER (
             PARTITION BY rec_id ORDER BY is_canonical DESC, mtime_ms DESC, rel_path ASC
           ) AS rn
    FROM records
    WHERE company_id=? AND module=? AND depth=1 AND sort_key IS NOT NULL
  )
  WHERE rn=1
  ORDER BY sort_key DESC
`);
// These two feed financial aggregation (dues, statement, bank balances). Float
// summation is order-dependent, so they must return rows in the same order the
// old fs readers did — readdir order, i.e. alphabetical by path.
const qFlat = db.prepare(`
  SELECT data FROM records WHERE company_id=? AND module=? AND depth=0
  ORDER BY rel_path ASC
`);
const qAny = db.prepare(`
  SELECT data FROM records WHERE company_id=? AND module=?
  ORDER BY rel_path ASC
`);
// Flat files plus every json one level down ({dir}/{id}/*.json) — what the
// ledger's old readAllDeep walked — in readdir (alphabetical path) order.
const qShallow = db.prepare(`
  SELECT data FROM records WHERE company_id=? AND module=? AND depth<=1
  ORDER BY rel_path ASC
`);
// {dir}/{id}/{id}.json only — strict canonical, readdir order.
const qSubCanonical = db.prepare(`
  SELECT data FROM records
  WHERE company_id=? AND module=? AND depth=1 AND is_canonical=1
  ORDER BY rel_path ASC
`);
// One record per subfolder: prefer {id}.json, else the first other json in that
// folder, ignoring communication side-car files. Mirrors approvals' reader.
const qSubPreferCanonical = db.prepare(`
  SELECT data FROM (
    SELECT data, rel_path,
           ROW_NUMBER() OVER (
             PARTITION BY rec_id ORDER BY is_canonical DESC, rel_path ASC
           ) AS rn
    FROM records
    WHERE company_id=? AND module=? AND depth=1
      -- GLOB, not LIKE: the original filter is case-sensitive, and a client
      -- named "K & D Communication Limited" must not be excluded.
      AND rel_path NOT GLOB '*communication*'
  )
  WHERE rn=1
  ORDER BY rel_path ASC
`);
const qOne = db.prepare(`
  SELECT data FROM records WHERE company_id=? AND module=? AND rec_id=?
  ORDER BY is_canonical DESC, depth ASC, rel_path ASC LIMIT 1
`);
const qMaxId = db.prepare(`SELECT MAX(sort_key) m FROM records WHERE company_id=? AND module=?`);

const parse = rows => {
  const out = [];
  for (const r of rows) { try { out.push(JSON.parse(r.data)); } catch {} }
  return out;
};

module.exports = {
  db,
  reindexAll,
  startWatcher,
  indexFile,
  removePath,
  // Immediate removal so a delete is visible before the watcher fires.
  removeRecord: (companyId, module, id) => delByRecId.run(companyId, module, String(id)),
  /** Re-read one record's folder from disk now (used right after a write). */
  syncRecord: (companyId, module, id) => {
    const dir = path.join(COMPANIES, companyId, module, String(id));
    delByRecId.run(companyId, module, String(id));
    if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) walk(dir, indexFile);
    const flat = path.join(COMPANIES, companyId, module, `${id}.json`);
    if (fs.existsSync(flat)) indexFile(flat);
  },
  // numeric-subdir modules (Client, Items, SalesOrder, ...) — canonical record per folder
  listCanonical: (companyId, module) => parse(qCanonical.all(companyId, module)),
  // flat *.json directly in the module dir (Banks, some Payments layouts)
  listFlat:      (companyId, module) => parse(qFlat.all(companyId, module)),
  // everything, both layouts (dues/statement walkers)
  listAny:       (companyId, module) => parse(qAny.all(companyId, module)),
  // Same two, addressed by module directory path (accounts.js passes paths).
  listFlatByDir: (dir) => { const c = classifyDir(dir); return c ? parse(qFlat.all(c.companyId, c.module)) : []; },
  listAnyByDir:  (dir) => { const c = classifyDir(dir); return c ? parse(qAny.all(c.companyId, c.module))  : []; },
  listShallowByDir: (dir) => { const c = classifyDir(dir); return c ? parse(qShallow.all(c.companyId, c.module)) : []; },
  listAnyByDirOrdered: (dir) => { const c = classifyDir(dir); return c ? parse(qAny.all(c.companyId, c.module)) : []; },
  listSubCanonicalByDir:       (dir) => { const c = classifyDir(dir); return c ? parse(qSubCanonical.all(c.companyId, c.module))       : []; },
  listSubPreferCanonicalByDir: (dir) => { const c = classifyDir(dir); return c ? parse(qSubPreferCanonical.all(c.companyId, c.module)) : []; },
  getOne: (companyId, module, id) => {
    const row = qOne.get(companyId, module, String(id));
    if (!row) return null;
    try { return JSON.parse(row.data); } catch { return null; }
  },
  maxId: (companyId, module) => qMaxId.get(companyId, module)?.m ?? null,
};
