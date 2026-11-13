/* GST returns as per the GST portal — the GSTR-1 and GSTR-2B JSON the portal worker downloads (api/ewayHelper.js,
 * job kind "gstret"). Stored per company and month:
 *   Database/Companies/{cid}/GstPortal/{MMYYYY}/r1.json | r2b.json   the return (ZIP files unpacked, split files merged)
 *   Database/Companies/{cid}/GstPortal/{MMYYYY}/raw/…                  the files as downloaded
 *   Database/Companies/{cid}/GstPortal/index.json                       { MMYYYY: { r1: { at, files, by }, r2b: {…}, r1Req: { at } } }
 *   r1Req = the GSTR-1 file was asked for on the portal at that time (it takes ~20 minutes to be made); cleared when
 *   the file is downloaded.
 * GET /api/gst-portal?companyId=          → index
 * GET /api/gst-portal/:period/:kind       → the saved JSON */
const express = require('express');
const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');
const { ROOT, resolveUser } = require('./helpers');

const router = express.Router();
const cid = req => String(req.query.companyId || '').replace(/[^\w-]/g, '');
const base = co => path.join(ROOT, 'Database', 'Companies', co, 'GstPortal');
const readJ = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const okPeriod = p => /^(0[1-9]|1[0-2])20\d\d$/.test(p);

/* several files of one return (the portal splits a big GSTR-1): lists are joined, the rest is taken from the first */
function merge(parts) {
  if (parts.length === 1) return parts[0];
  const out = JSON.parse(JSON.stringify(parts[0]));
  const join = (a, b) => {
    Object.keys(b).forEach(k => {
      if (Array.isArray(b[k])) a[k] = [...(Array.isArray(a[k]) ? a[k] : []), ...b[k]];
      else if (b[k] && typeof b[k] === 'object') { a[k] = a[k] && typeof a[k] === 'object' && !Array.isArray(a[k]) ? a[k] : {}; join(a[k], b[k]); }
      else if (a[k] == null) a[k] = b[k];
    });
  };
  parts.slice(1).forEach(p => join(out, p));
  return out;
}

/* a downloaded file → the JSON inside (ZIP or plain JSON) */
async function jsonsOf(name, buf) {
  if (buf.slice(0, 2).toString() === 'PK') {
    const zip = await JSZip.loadAsync(buf);
    const files = Object.values(zip.files).filter(f => !f.dir && /\.json$/i.test(f.name));
    if (!files.length) throw new Error(`No JSON inside ${name || 'the ZIP file'}`);
    return Promise.all(files.map(async f => JSON.parse((await f.async('string')).replace(/^﻿/, ''))));
  }
  return [JSON.parse(buf.toString('utf8').replace(/^﻿/, ''))];
}

/* called by the portal worker for each file it downloaded */
async function saveDownload(co, period, kind, name, buf, meta = {}) {
  if (!okPeriod(period) || !['r1', 'r2b'].includes(kind)) throw new Error('Bad month / return');
  if (!buf.length || buf.length > 60 * 1024 * 1024) throw new Error('Empty or too big file');
  const parts = await jsonsOf(name, buf);
  const dir = path.join(base(co), period);
  fs.mkdirSync(path.join(dir, 'raw'), { recursive: true });
  const safeName = `${kind}-${Date.now()}-${String(name || 'file').replace(/[^\w.-]/g, '_').slice(-80)}`;
  fs.writeFileSync(path.join(dir, 'raw', safeName), buf);
  const idxF = path.join(base(co), 'index.json');
  const idx = readJ(idxF, {});
  const cur = (idx[period] || {})[kind];
  // files of the same job are parts of one return; a new job replaces the old download
  const sameJob = cur && meta.jobId && cur.jobId === meta.jobId;
  const all = sameJob ? [readJ(path.join(dir, `${kind}.json`), null), ...parts].filter(Boolean) : parts;
  const data = merge(all);
  fs.writeFileSync(path.join(dir, `${kind}.json`), JSON.stringify(data));
  if (kind === 'r1' && idx[period]) delete idx[period].r1Req;
  idx[period] = { ...(idx[period] || {}), [kind]: { at: new Date().toISOString(), by: meta.by || '', jobId: meta.jobId || '', files: (sameJob ? cur.files : 0) + 1 } };
  fs.writeFileSync(idxF, JSON.stringify(idx, null, 2));
  return { ok: true, period, kind, files: idx[period][kind].files };
}

const readIndex = co => readJ(path.join(base(co), 'index.json'), {});
/* the portal is making the GSTR-1 file of this month (kept from the first request until it is downloaded) */
function markRequested(co, period) {
  if (!okPeriod(period)) return;
  const idxF = path.join(base(co), 'index.json'), idx = readJ(idxF, {});
  const cur = (idx[period] || {}).r1Req;
  if (cur && Date.now() - new Date(cur.at).getTime() < 3 * 60 * 60 * 1000) return;   // asked already — keep that time
  fs.mkdirSync(base(co), { recursive: true });
  idx[period] = { ...(idx[period] || {}), r1Req: { at: new Date().toISOString() } };
  fs.writeFileSync(idxF, JSON.stringify(idx, null, 2));
}

const needUser = (req, res, next) => (resolveUser(req) ? next() : res.status(401).json({ error: 'Please log in again.' }));
router.get('/', needUser, (req, res) => {
  const co = cid(req); if (!co) return res.status(400).json({ error: 'companyId required' });
  res.json(readJ(path.join(base(co), 'index.json'), {}));
});
router.get('/:period/:kind', needUser, (req, res) => {
  const co = cid(req), { period, kind } = req.params;
  if (!co || !okPeriod(period) || !['r1', 'r2b'].includes(kind)) return res.status(400).json({ error: 'Bad request' });
  const f = path.join(base(co), period, `${kind}.json`);
  if (!fs.existsSync(f)) return res.status(404).json({ error: 'Not downloaded yet' });
  res.type('application/json').send(fs.readFileSync(f));
});

module.exports = router;
module.exports.saveDownload = saveDownload;
module.exports.markRequested = markRequested;
module.exports.readIndex = readIndex;
