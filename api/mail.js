/* mail.js — e-mail any printed document from the print preview.
 *
 * POST /api/mail/send   { companyId, to:[…], cc:[…], subject, message, docTitle,
 *                         document: { html } | { pdf (base64) }, fileName, files:[{ name, data (base64) }] }
 *   The document is made into a PDF (headless Chrome, same as Save PDF) and sent with the extra files through the
 *   mail account saved in Admin → Email settings (Database/email-config.json). The mail body is a clean teal
 *   letter: company header (logo), the message, a card naming the attachment, company footer.
 *   Every mail is logged: Database/Companies/{cid}/MailLog/log.jsonl
 * GET  /api/mail/contacts?companyId=  → { company: { name, email }, contacts: [{ name, email, party, kind }] }
 *   clients' contact persons and vendors — for the To / CC suggestions.
 */
const express = require('express');
const fs = require('fs');
const path = require('path');
const { ROOT, resolveUser } = require('./helpers');

const router = express.Router();
const CFG = path.join(ROOT, 'Database', 'email-config.json');
const cidOf = req => String(req.query.companyId || req.body?.companyId || '').replace(/[^\w-]/g, '');
const coDir = cid => path.join(ROOT, 'Database', 'Companies', cid);
const readJ = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const esc = v => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const EMAIL_RE = /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[a-z]{2,}$/i;
const list = v => [...new Set((Array.isArray(v) ? v : String(v || '').split(/[,;\s]+/)).map(x => String(x).trim()).filter(Boolean))];
const TEAL = '#03444f';

function allJson(dir) {
  const out = [];
  const walk = d => { let ents = []; try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    ents.forEach(e => { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (e.name.endsWith('.json')) { const j = readJ(p, null); if (j && typeof j === 'object') out.push(j); } }); };
  walk(dir);
  return out;
}

router.get('/contacts', (req, res) => {
  if (!resolveUser(req)) return res.status(401).json({ error: 'Please sign in again.' });
  const cid = cidOf(req); if (!cid) return res.status(400).json({ error: 'companyId required' });
  const co = readJ(path.join(coDir(cid), 'company.json'), {});
  const out = [], seen = new Set();
  const add = (email, name, party, kind) => {
    const e = String(email || '').trim(); if (!EMAIL_RE.test(e) || seen.has(e.toLowerCase())) return;
    seen.add(e.toLowerCase()); out.push({ email: e, name: String(name || '').trim(), party: String(party || '').trim(), kind });
  };
  allJson(path.join(coDir(cid), 'Client')).forEach(c => {
    const party = c.clientName || c.companyName;
    (c.contactPersons || []).forEach(p => add(p.email, p.name, party, 'client'));
    add(c.email, c.contactPerson, party, 'client');
  });
  allJson(path.join(coDir(cid), 'Vendor')).forEach(v => {
    const party = v.vendorName || v.companyName;
    add(v.email, v.contactPerson, party, 'vendor');
    (v.contactPersons || []).forEach(p => add(p.email, p.name, party, 'vendor'));
  });
  res.json({ company: { name: co.companyName || '', email: co.email || '' }, contacts: out });
});

/* the mail body: table layout + inline styles (mail programs ignore <style> and modern CSS) */
function mailHtml({ co, logoCid, message, docTitle, fileNames, by, summary = [], sender = {} }) {
  const rows = (Array.isArray(summary) ? summary : []).filter(r => Array.isArray(r) && r[1] != null && String(r[1]).trim()).slice(0, 12).map(([k, v]) => [String(k).slice(0, 60), String(v).slice(0, 400)]);
  const paras = String(message || '').trim().split(/\n{2,}/).map(p => `<p style="margin:0 0 14px;line-height:1.6">${esc(p).replace(/\n/g, '<br>')}</p>`).join('');
  const addr = [co.address, co.city, co.state, co.pincode].filter(Boolean).map(s => String(s).trim()).join(', ');
  const contact = [co.phone && `Ph: ${esc(co.phone)}`, co.email && `<a href="mailto:${esc(co.email)}" style="color:${TEAL};text-decoration:none">${esc(co.email)}</a>`, co.website && esc(co.website)].filter(Boolean).join(' &nbsp;·&nbsp; ');
  const files = fileNames.map(n => `<tr><td style="padding:10px 12px;border:1px solid #D5E6E9;border-radius:8px;background:#F5FAFB">
      <table role="presentation" cellpadding="0" cellspacing="0"><tr>
        <td style="width:34px;height:34px;background:${TEAL};border-radius:6px;color:#fff;font:700 10px Arial,sans-serif;text-align:center;vertical-align:middle">${/\.pdf$/i.test(n) ? 'PDF' : 'FILE'}</td>
        <td style="padding-left:12px;font:600 13px Arial,sans-serif;color:#101828">${esc(n)}<div style="font:400 12px Arial,sans-serif;color:#667085;margin-top:2px">Attached to this e-mail</div></td>
      </tr></table></td></tr><tr><td style="height:8px"></td></tr>`).join('');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(docTitle)}</title></head>
<body style="margin:0;padding:0;background:#EEF4F5">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EEF4F5"><tr><td align="center" style="padding:24px 12px">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #DCE8EA">
    <tr><td style="background:${TEAL};padding:18px 24px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
        ${logoCid ? `<td style="width:52px;padding-right:14px"><img src="cid:${logoCid}" width="48" height="48" alt="" style="display:block;width:48px;height:48px;object-fit:contain;background:#fff;border-radius:8px;padding:3px"></td>` : ''}
        <td style="font:700 18px Arial,sans-serif;color:#ffffff">${esc(co.companyName || '')}<div style="font:400 12px Arial,sans-serif;color:#BFE3E8;margin-top:3px">${esc(docTitle)}</div></td>
      </tr></table>
    </td></tr>
    <tr><td style="height:4px;background:#2A9DAA"></td></tr>
    <tr><td style="padding:26px 24px 8px;font:14px Arial,sans-serif;color:#344054">${paras}</td></tr>
    ${rows.length ? `<tr><td style="padding:2px 24px 18px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #D5E6E9;border-radius:10px;overflow:hidden;border-collapse:separate">
        <tr><td colspan="2" style="background:#E8F3F4;padding:9px 14px;font:700 12px Arial,sans-serif;color:${TEAL};letter-spacing:.4px;text-transform:uppercase">${esc(docTitle)}</td></tr>
        ${rows.map(([k, v], i) => `<tr><td style="padding:8px 14px;font:12.5px Arial,sans-serif;color:#667085;width:38%;vertical-align:top;${i ? 'border-top:1px solid #EEF4F5;' : ''}">${esc(k)}</td><td style="padding:8px 14px;font:600 13px Arial,sans-serif;color:#101828;vertical-align:top;${i ? 'border-top:1px solid #EEF4F5;' : ''}">${esc(v).replace(/\n/g, '<br>')}</td></tr>`).join('')}
      </table></td></tr>` : ''}
    <tr><td style="padding:0 24px 20px;font:14px Arial,sans-serif;color:#344054;line-height:1.5">
      Thanks &amp; regards,<br>
      ${sender.sigCid ? `<img src="cid:${sender.sigCid}" alt="" height="44" style="display:block;height:44px;max-width:180px;margin:6px 0 2px">` : ''}
      <b style="color:#101828">${esc(sender.name || by || '')}</b>${sender.designation ? `<br><span style="color:#667085;font-size:13px">${esc(sender.designation)}</span>` : ''}
      <br><span style="color:${TEAL};font-weight:600">${esc(co.companyName || '')}</span>
      ${[sender.phone && `Mob: ${esc(sender.phone)}`, sender.email && `<a href="mailto:${esc(sender.email)}" style="color:${TEAL};text-decoration:none">${esc(sender.email)}</a>`].filter(Boolean).length ? `<br><span style="font-size:12.5px;color:#667085">${[sender.phone && `Mob: ${esc(sender.phone)}`, sender.email && `<a href="mailto:${esc(sender.email)}" style="color:${TEAL};text-decoration:none">${esc(sender.email)}</a>`].filter(Boolean).join(' &nbsp;·&nbsp; ')}</span>` : ''}
    </td></tr>
    ${fileNames.length ? `<tr><td style="padding:4px 24px 16px"><div style="font:700 11px Arial,sans-serif;color:#667085;letter-spacing:.6px;text-transform:uppercase;margin-bottom:8px">Attachment${fileNames.length === 1 ? '' : 's'}</div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${files}</table></td></tr>` : ''}
    <tr><td style="padding:16px 24px 20px;border-top:1px solid #E4ECEE;background:#F8FBFB;font:12px Arial,sans-serif;color:#667085;line-height:1.6">
      <b style="color:${TEAL}">${esc(co.companyName || '')}</b>${addr ? `<br>${esc(addr)}` : ''}${contact ? `<br>${contact}` : ''}

    </td></tr>
  </table>
  <div style="font:11px Arial,sans-serif;color:#98A2B3;margin-top:12px">This e-mail and its attachments are meant only for the person it is addressed to.</div>
</td></tr></table></body></html>`;
}

async function htmlToPdf(html) {
  const puppeteer = require('puppeteer');
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load', timeout: 60000 });
    return Buffer.from(await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true }));
  } finally { await browser.close().catch(() => {}); }
}
const safeName = (n, ext) => { let s = String(n || 'document').replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim().slice(0, 120) || 'document'; if (ext && !s.toLowerCase().endsWith(ext)) s += ext; return s; };

router.post('/send', async (req, res) => {
  const user = resolveUser(req);
  if (!user) return res.status(401).json({ error: 'Please sign in again.' });
  const cid = cidOf(req); if (!cid) return res.status(400).json({ error: 'companyId required' });
  const b = req.body || {};
  const to = list(b.to), cc = list(b.cc);
  const bad = [...to, ...cc].filter(e => !EMAIL_RE.test(e));
  if (!to.length) return res.status(400).json({ error: 'Enter at least one e-mail address in To.' });
  if (bad.length) return res.status(400).json({ error: `Not a valid e-mail address: ${bad.join(', ')}` });
  if (to.length + cc.length > 30) return res.status(400).json({ error: 'At most 30 addresses.' });
  const cfg = readJ(CFG, {});
  if (!cfg.email || !cfg.password) return res.status(409).json({ error: 'The mail account is not set up — Admin → Email settings.' });
  const co = readJ(path.join(coDir(cid), 'company.json'), {});
  const docTitle = String(b.docTitle || b.subject || 'Document').slice(0, 200);
  try {
    const attachments = [];
    if (b.document?.pdf) attachments.push({ filename: safeName(b.fileName || docTitle, '.pdf'), content: Buffer.from(String(b.document.pdf), 'base64'), contentType: 'application/pdf' });
    else if (b.document?.html) attachments.push({ filename: safeName(b.fileName || docTitle, '.pdf'), content: await htmlToPdf(String(b.document.html)), contentType: 'application/pdf' });
    (Array.isArray(b.files) ? b.files : []).slice(0, 10).forEach(f => { if (f && f.data) attachments.push({ filename: safeName(f.name), content: Buffer.from(String(f.data), 'base64') }); });
    const size = attachments.reduce((t, a) => t + a.content.length, 0);
    if (size > 22 * 1024 * 1024) return res.status(400).json({ error: 'The attachments are bigger than 22 MB — remove some files.' });
    // the company logo, shown inside the mail
    let logoCid = '';
    const logoPath = co.logoFileName ? [path.join(coDir(cid), 'logo', co.logoFileName), path.join(ROOT, 'Database', 'Companies', 'logos', co.logoFileName)].find(p => fs.existsSync(p)) : '';
    const inline = [];
    if (logoPath) { logoCid = 'company-logo'; inline.push({ filename: path.basename(logoPath), path: logoPath, cid: logoCid }); }
    const by = user.name || user.username || '';
    const sg = require('./signing'), fu = sg.fullUser(user);
    const sigUrl = sg.sigData(user.id);
    const sender = { name: sg.nameOf(user, fu) || by, designation: fu.designation || '', phone: fu.phone || '', email: fu.email || '' };
    if (sigUrl) { sender.sigCid = 'sender-signature'; const [, mime, b64] = sigUrl.match(/^data:(image\/\w+);base64,(.*)$/) || []; if (b64) inline.push({ filename: 'signature.png', content: Buffer.from(b64, 'base64'), contentType: mime, cid: sender.sigCid }); }
    const nodemailer = require('nodemailer');
    const transport = nodemailer.createTransport({
      service: cfg.service && cfg.service !== 'custom' ? cfg.service : undefined,
      host: cfg.host || undefined, port: cfg.port ? Number(cfg.port) : undefined, secure: cfg.secure !== undefined ? cfg.secure : undefined,
      auth: { user: cfg.email, pass: cfg.password },
    });
    const subject = String(b.subject || docTitle).slice(0, 250);
    const info = await transport.sendMail({
      from: `"${String(co.companyName || cfg.fromName || 'ERP').replace(/"/g, '')}" <${cfg.email}>`,
      replyTo: co.email && EMAIL_RE.test(co.email) ? co.email : undefined,
      to, cc: cc.length ? cc : undefined, subject,
      text: `${String(b.message || '').trim()}\n\nThanks & regards,\n${sender.name}${sender.designation ? `\n${sender.designation}` : ''}\n${co.companyName || ''}`,
      html: mailHtml({ co, logoCid, message: b.message, docTitle, fileNames: attachments.map(a => a.filename), by, summary: b.summary, sender }),
      attachments: [...attachments, ...inline],
    });
    try {
      const d = path.join(coDir(cid), 'MailLog'); fs.mkdirSync(d, { recursive: true });
      fs.appendFileSync(path.join(d, 'log.jsonl'), JSON.stringify({ at: new Date().toISOString(), by, to, cc, subject, files: attachments.map(a => a.filename), id: info.messageId || '' }) + '\n');
    } catch { /* the mail went anyway */ }
    res.json({ ok: true, message: `E-mail sent to ${to.join(', ')}${cc.length ? ` (cc ${cc.join(', ')})` : ''} with ${attachments.length} attachment${attachments.length === 1 ? '' : 's'}.` });
  } catch (e) {
    res.status(500).json({ error: /Invalid login|auth/i.test(e.message) ? 'The mail account login was refused — check Admin → Email settings.' : `Could not send: ${e.message}` });
  }
});

module.exports = router;
module.exports.mailHtml = mailHtml;
