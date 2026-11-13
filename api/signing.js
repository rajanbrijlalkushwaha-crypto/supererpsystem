/* signing.js — e-signatures.
 *
 * My signature (each user, from My Profile): an image (uploaded or drawn), kept at Database/Users/{userId}/signature.png
 *   GET    /api/sign/my                 → { has, dataUrl }
 *   POST   /api/sign/my  { dataUrl }    save (PNG / JPEG, ≤ 600 KB)
 *   DELETE /api/sign/my                 remove
 *
 * Document signatures: who signed a document, and as what — prepared (created), reviewed (checked), approved.
 * Kept at Database/Companies/{cid}/DocSigns/{type}/{id}.json. The print shows each signature above its label
 * ("Prepared By", "Verified / Reviewed By", "Authorised Signatory").
 *   GET    /api/sign/doc?companyId&type&id                 → { prepared?, reviewed?, approved? } each { userId, name, designation, at, img }
 *   POST   /api/sign/doc { companyId, type, id, role, perm } sign as role (needs your signature saved);
 *          "approved" needs the approve right on that module (perm), on Approvals, or the admin role
 *   DELETE /api/sign/doc?companyId&type&id&role            take back your own signature (admin: anyone's)
 *
 * Page signatures on the full PDF of a document (the order + the files uploaded with it — client PO, drawings…):
 *   POST   /api/sign/stamp { companyId, type, id, pages: "all" | "1-3, 5", pos: br | bl | bc }   your signature on those pages
 *   DELETE /api/sign/stamp?companyId&type&id&sid           remove one (your own; admin: any)
 *   POST   /api/sign/apply { companyId, type, id, pdf (base64) } → the PDF with every saved page signature drawn on it
 */
const express = require('express');
const fs = require('fs');
const path = require('path');
const { ROOT, resolveUser } = require('./helpers');

const router = express.Router();
const ROLES = ['prepared', 'reviewed', 'approved'];
const userDir = id => path.join(ROOT, 'Database', 'Users', String(id).replace(/[^\w-]/g, ''));
const sigFile = id => path.join(userDir(id), 'signature.png');
const readJ = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const usersAll = () => readJ(path.join(ROOT, 'Database', 'users.json'), []);
const fullUser = u => usersAll().find(x => String(x.id) === String(u.id)) || {};
const nameOf = (u, f) => [f.firstName, f.middleName, f.lastName].filter(Boolean).join(' ') || f.name || u.name || u.username || '';
const sigData = id => { try { const b = fs.readFileSync(sigFile(id)); return `data:${b[0] === 0xFF ? 'image/jpeg' : 'image/png'};base64,${b.toString('base64')}`; } catch { return ''; } };
const clean = v => String(v || '').replace(/[^\w.-]/g, '').slice(0, 80);
const docFile = (cid, type, id) => path.join(ROOT, 'Database', 'Companies', clean(cid), 'DocSigns', clean(type), `${clean(id)}.json`);
const need = (req, res) => { const u = resolveUser(req); if (!u) { res.status(401).json({ error: 'Please sign in again.' }); return null; } return u; };

router.get('/my', (req, res) => { const u = need(req, res); if (!u) return; const d = sigData(u.id); res.json({ has: !!d, dataUrl: d, name: nameOf(u, fullUser(u)) }); });
router.post('/my', (req, res) => {
  const u = need(req, res); if (!u) return;
  const m = String(req.body?.dataUrl || '').match(/^data:image\/(png|jpe?g);base64,([A-Za-z0-9+/=]+)$/);
  if (!m) return res.status(400).json({ error: 'Send a PNG or JPG image.' });
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > 600 * 1024) return res.status(400).json({ error: 'The signature image is too big (max 600 KB) — crop it to the signature.' });
  fs.mkdirSync(userDir(u.id), { recursive: true });
  // the old signature is kept (last 3) so a replaced one can be brought back
  if (fs.existsSync(sigFile(u.id))) {
    fs.copyFileSync(sigFile(u.id), path.join(userDir(u.id), `signature-old-${Date.now()}.png`));
    fs.readdirSync(userDir(u.id)).filter(f => /^signature-old-\d+\.png$/.test(f)).sort().slice(0, -3).forEach(f => fs.rmSync(path.join(userDir(u.id), f), { force: true }));
  }
  fs.writeFileSync(sigFile(u.id), buf);
  res.json({ ok: true, dataUrl: sigData(u.id) });
});
router.delete('/my', (req, res) => { const u = need(req, res); if (!u) return; try { fs.unlinkSync(sigFile(u.id)); } catch { /* none */ } res.json({ ok: true }); });

/* the signatures of one document, with each signer's current signature image */
function signsOf(cid, type, id) {
  const rec = readJ(docFile(cid, type, id), {});
  const out = { stamps: (rec.stamps || []).map(({ userId, ...x }) => ({ ...x, mine: false, userId })) };
  ROLES.forEach(r => { if (rec[r]) out[r] = { ...rec[r], img: sigData(rec[r].userId) }; });
  return out;
}
router.get('/doc', (req, res) => {
  if (!need(req, res)) return;
  const { companyId, type, id } = req.query;
  if (!clean(companyId) || !clean(type) || !clean(id)) return res.status(400).json({ error: 'companyId, type and id are needed.' });
  res.json(signsOf(companyId, type, id));
});
router.post('/doc', (req, res) => {
  const u = need(req, res); if (!u) return;
  const { companyId, type, id, role, perm } = req.body || {};
  if (!clean(companyId) || !clean(type) || !clean(id) || !ROLES.includes(role)) return res.status(400).json({ error: 'Bad request.' });
  if (!fs.existsSync(sigFile(u.id))) return res.status(409).json({ error: 'Add your signature first — My Profile → Signature.' });
  const f = fullUser(u);
  if (role === 'approved') {
    const p = f.permissions;
    const ok = u.role === 'admin' || f.role === 'admin' || (p && ((perm && p[perm]?.approve) || p.approvals?.approve || p.accApproval?.approve));
    if (!ok) return res.status(403).json({ error: 'Only someone who can approve this document can sign it as approved.' });
  }
  const file = docFile(companyId, type, id);
  const rec = readJ(file, {});
  if (rec[role] && String(rec[role].userId) !== String(u.id) && u.role !== 'admin') return res.status(409).json({ error: `Already signed as ${role} by ${rec[role].name}.` });
  rec[role] = { userId: u.id, name: nameOf(u, f), designation: f.designation || '', at: new Date().toISOString() };
  (rec.log = rec.log || []).push({ role, by: rec[role].name, at: rec[role].at });
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(rec, null, 2));
  res.json(signsOf(companyId, type, id));
});
router.delete('/doc', (req, res) => {
  const u = need(req, res); if (!u) return;
  const { companyId, type, id, role } = req.query;
  const file = docFile(companyId, type, id), rec = readJ(file, {});
  if (!rec[role]) return res.json(signsOf(companyId, type, id));
  if (String(rec[role].userId) !== String(u.id) && u.role !== 'admin') return res.status(403).json({ error: 'You can only take back your own signature.' });
  (rec.log = rec.log || []).push({ role, removedBy: nameOf(u, fullUser(u)), at: new Date().toISOString() });
  delete rec[role];
  fs.writeFileSync(file, JSON.stringify(rec, null, 2));
  res.json(signsOf(companyId, type, id));
});

/* "all" | "1-3, 5" → sorted page numbers (1-based) within 1..count; null when the text is wrong */
function parsePages(spec, count) {
  const t = String(spec || '').trim().toLowerCase();
  if (!t || t === 'all') return Array.from({ length: count }, (_, i) => i + 1);
  const out = new Set();
  for (const part of t.split(/[,\s]+/).filter(Boolean)) {
    const m = part.match(/^(\d+)(?:-(\d+))?$/); if (!m) return null;
    const a = +m[1], b = m[2] ? +m[2] : a; if (!a || b < a) return null;
    for (let k = a; k <= Math.min(b, count); k++) out.add(k);
  }
  return [...out].sort((x, y) => x - y);
}
const validSpec = spec => { const t = String(spec || '').trim().toLowerCase(); return t === 'all' || /^\d+(-\d+)?([,\s]+\d+(-\d+)?)*$/.test(t); };
router.post('/stamp', (req, res) => {
  const u = need(req, res); if (!u) return;
  const { companyId, type, id, pages, pos, place } = req.body || {};
  if (!clean(companyId) || !clean(type) || !clean(id)) return res.status(400).json({ error: 'Bad request.' });
  // place: [{ page, x, y, w }] — spots picked on the pages (x, y = top-left, w = width; all as a part of the page, 0–1)
  const spots = Array.isArray(place) ? place.filter(p => Number.isInteger(+p.page) && +p.page > 0 && [p.x, p.y, p.w].every(v => Number.isFinite(+v) && +v >= 0 && +v <= 1)).slice(0, 200) : null;
  if (place && !spots?.length) return res.status(400).json({ error: 'Click on the pages where you want to sign.' });
  if (!spots && !validSpec(pages)) return res.status(400).json({ error: 'Pages: write "all", a range like 2-4, or a list like 1, 3, 5.' });
  if (!fs.existsSync(sigFile(u.id))) return res.status(409).json({ error: 'Add your signature first — My Profile → Signature.' });
  const f = fullUser(u), file = docFile(companyId, type, id), rec = readJ(file, {});
  const sid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  rec.stamps = rec.stamps || [];
  if (spots) spots.forEach(p => rec.stamps.push({ sid: sid(), userId: u.id, name: nameOf(u, f), pages: String(+p.page), pos: 'xy', x: +(+p.x).toFixed(4), y: +(+p.y).toFixed(4), w: +(+p.w).toFixed(4), at: new Date().toISOString() }));
  else rec.stamps.push({ sid: sid(), userId: u.id, name: nameOf(u, f), pages: String(pages).trim().toLowerCase(), pos: ['bl', 'bc', 'br'].includes(pos) ? pos : 'br', at: new Date().toISOString() });
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(rec, null, 2));
  res.json(signsOf(companyId, type, id));
});
router.delete('/stamp', (req, res) => {
  const u = need(req, res); if (!u) return;
  const { companyId, type, id, sid } = req.query;
  const file = docFile(companyId, type, id), rec = readJ(file, {});
  const st = (rec.stamps || []).find(x => x.sid === sid);
  if (st && String(st.userId) !== String(u.id) && u.role !== 'admin') return res.status(403).json({ error: 'You can only remove your own page signatures.' });
  rec.stamps = (rec.stamps || []).filter(x => x.sid !== sid);
  fs.writeFileSync(file, JSON.stringify(rec, null, 2));
  res.json(signsOf(companyId, type, id));
});
router.post('/apply', async (req, res) => {
  if (!need(req, res)) return;
  const { companyId, type, id, pdf } = req.body || {};
  const buf = Buffer.from(String(pdf || ''), 'base64');
  if (!buf.length) return res.status(400).json({ error: 'No PDF.' });
  const stamps = (readJ(docFile(companyId, type, id), {}).stamps || []);
  res.setHeader('Content-Type', 'application/pdf');
  if (!stamps.length) return res.send(buf);
  try {
    const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
    const doc = await PDFDocument.load(buf, { ignoreEncryption: true });
    const font = await doc.embedFont(StandardFonts.Helvetica), bold = await doc.embedFont(StandardFonts.HelveticaBold);
    const imgs = {};
    const pages = doc.getPages();
    for (const st of stamps) {
      const raw = sigData(st.userId); if (!raw) continue;
      if (!imgs[st.userId]) { const b = Buffer.from(raw.split(',')[1], 'base64'); imgs[st.userId] = raw.startsWith('data:image/jpeg') ? await doc.embedJpg(b) : await doc.embedPng(b); }
      const img = imgs[st.userId];
      const at = new Date(st.at), date = `${String(at.getDate()).padStart(2, '0')}-${String(at.getMonth() + 1).padStart(2, '0')}-${at.getFullYear()}`;
      (parsePages(st.pages, pages.length) || []).forEach(n => {
        const pg = pages[n - 1]; if (!pg) return;
        const { width: W, height: H } = pg.getSize();
        let w, h, box, x, y;
        if (st.pos === 'xy') {   // the spot picked on the page: the box's top-left and width
          box = st.w * W; const k = Math.min(box / img.width, (H * 0.3) / img.height); w = img.width * k; h = img.height * k;
          x = st.x * W; y = H - st.y * H - h;
        } else {
          // the signature (about 56 × 28 mm at most), then the name in bold and the date under it
          const k = Math.min(160 / img.width, 80 / img.height); w = img.width * k; h = img.height * k;
          box = Math.max(w, bold.widthOfTextAtSize(st.name, 8.5), 60);
          x = st.pos === 'bl' ? 28 : st.pos === 'bc' ? (W - box) / 2 : W - box - 28; y = 40;
        }
        pg.drawImage(img, { x: x + (box - w) / 2, y, width: w, height: h });
        pg.drawText(st.name, { x: x + (box - bold.widthOfTextAtSize(st.name, 8.5)) / 2, y: y - 11, size: 8.5, font: bold, color: rgb(0, 0, 0) });
        pg.drawText(date, { x: x + (box - font.widthOfTextAtSize(date, 7.5)) / 2, y: y - 21, size: 7.5, font, color: rgb(0, 0, 0) });
      });
    }
    res.send(Buffer.from(await doc.save()));
  } catch (e) { res.status(500).json({ error: 'Could not sign the PDF pages: ' + e.message }); }
});

module.exports = router;
module.exports.sigData = sigData;
module.exports.fullUser = fullUser;
module.exports.nameOf = nameOf;
