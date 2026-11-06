const path = require('path');
const fs = require('fs');
const multer = require('multer');

const ROOT = path.join(__dirname, '..');

const DB_BASE_PATH = path.join(ROOT, 'Database', 'Client');
if (!fs.existsSync(DB_BASE_PATH)) fs.mkdirSync(DB_BASE_PATH, { recursive: true });

// Use memory storage — files are written to disk inside each route handler
const upload = multer({ storage: multer.memoryStorage() });

// Get company-specific DB path — throws if no companyId
const getCompanyPath = (module, companyId) => {
  // Normalize: axios interceptor + manual query param can both fire, giving an array
  const cid = Array.isArray(companyId) ? companyId[0] : companyId;
  if (!cid || cid === 'undefined' || cid === 'null') {
    throw new Error('No company selected. Please select a company before performing this action.');
  }
  const p = path.join(ROOT, 'Database', 'Companies', cid, module);
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
  return p;
};

// Helper: write buffered files to the client's docs folder
const saveUploadedFiles = (files, docsPath, fileNames = []) => {
  const saved = [];
  (files || []).forEach((file, i) => {
    const filename = Date.now() + i + '-' + file.originalname;
    fs.writeFileSync(path.join(docsPath, filename), file.buffer);
    saved.push({
      name: fileNames[i] || file.originalname,
      filePath: 'docs/' + filename,
      fileName: filename
    });
  });
  return saved;
};

// Generate next sequential ID by scanning existing folder names in dbPath
const generateSequentialId = (dbPath, base) => {
  let max = base - 1;
  if (fs.existsSync(dbPath)) {
    fs.readdirSync(dbPath).forEach(name => {
      const num = parseInt(name, 10);
      if (!isNaN(num) && num > max) max = num;
    });
  }
  return max + 1;
};

// Read all flat JSON records from a directory
const readAllRecords = (dir) => {
  const records = [];
  if (!fs.existsSync(dir)) return records;
  fs.readdirSync(dir).forEach(f => {
    if (f.endsWith('.json')) {
      try { records.push(JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8'))); } catch {}
    }
  });
  return records;
};

// Required lazily: sqlite.js depends on ROOT from this module.
const index = () => require('./sqlite');

// Write data as a JSON file (creates folder if needed). Silent on error.
const saveJson = (filePath, data) => {
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    // Index synchronously so a read straight after this write is never stale.
    index().indexFile(filePath);
  } catch (e) {
    console.warn('[saveJson] Failed to write', filePath, e.message);
  }
};

// Delete a JSON file silently
const deleteJson = (filePath) => {
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    index().removePath(filePath);
  } catch {}
};

/* ── Audit trail helpers ── */
const SESSIONS = require('./sessions');

const resolveUser = (req) => {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/, '').trim();
  if (!token) return null;
  const sess = SESSIONS.get(token);
  if (!sess || sess.expiresAt < Date.now()) return null;
  return { id: sess.userId, username: sess.username, name: sess.name, role: sess.role };
};

const auditEntry = (req, action, extra = {}) => ({
  action,
  by: resolveUser(req) || { name: 'System' },
  at: new Date().toISOString(),
  ...extra,
});

const pushAudit = (existing, req, action, extra = {}) => {
  const trail = Array.isArray(existing.audit) ? existing.audit : [];
  trail.push(auditEntry(req, action, extra));
  return trail;
};

module.exports = { ROOT, upload, getCompanyPath, saveUploadedFiles, generateSequentialId, readAllRecords, saveJson, deleteJson, resolveUser, auditEntry, pushAudit };
