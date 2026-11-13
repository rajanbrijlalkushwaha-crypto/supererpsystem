/* printKit.js — the print preview used by every beta print: Email (To / CC / files, sent as PDF) · Save PDF · Print.
 * Every page shown here gets the beta teal print look (withTeal).
 *  openPreview(title, { html } | { pdfUrl, fileName })   previewPdf(blob, title)   logoData(company) */
import axios from 'axios';
import { isAppMode } from '../../appBridge';

const TEAL = '#03444f';

/* what the preview adds on screen only: the page as an A4 sheet on grey */
const sheetCss = landscape => `@media screen {
  html { background:#E4E7EC; }
  body { width:${landscape ? '297mm' : '210mm'}; min-height:${landscape ? '210mm' : '297mm'}; margin:14px auto !important; padding:8mm !important; background:#fff; box-shadow:0 2px 10px rgba(0,0,0,.25); }
}`;

export async function logoData(co) {
  if (!co?.logoFileName) return '';
  try {
    const b = (await axios.get(`/api/companies/logo/${encodeURIComponent(co.logoFileName)}`, { params: { companyId: co.companyId }, responseType: 'blob' })).data;
    return await new Promise(res => { const rd = new FileReader(); rd.onload = () => res(rd.result); rd.onerror = () => res(''); rd.readAsDataURL(b); });
  } catch { return ''; }
}

/* ── preview: Save PDF / Print / Close ── */
const PV_CSS = `
.cpv-ov { position:fixed; inset:0; background:rgba(16,24,40,.6); z-index:100000; display:flex; align-items:center; justify-content:center; }
.cpv { width:min(1240px, 96vw); height:94vh; background:#fff; border-radius:10px; display:flex; flex-direction:column; overflow:hidden; box-shadow:0 20px 50px rgba(0,0,0,.35); font:13px Inter, Arial, sans-serif; }
.cpv-bar { display:flex; align-items:center; gap:8px; padding:9px 12px; background:${TEAL}; color:#fff; }
.cpv-bar b { font-size:14px; flex:1; overflow:hidden; white-space:nowrap; text-overflow:ellipsis; }
.cpv-bar button { border:1px solid rgba(255,255,255,.5); background:transparent; color:#fff; font:600 13px Inter, Arial, sans-serif; padding:6px 14px; border-radius:6px; cursor:pointer; }
.cpv-bar button.pri { background:#fff; color:${TEAL}; border-color:#fff; }
.cpv-bar button:hover:not(:disabled) { filter:brightness(1.1); } .cpv-bar button:disabled { opacity:.6; cursor:default; }
.cpv-bar .x { font-size:18px; line-height:1; padding:4px 10px; }
.cpv-msg { padding:6px 12px; background:#FFFAEB; color:#B54708; font-size:12px; border-bottom:1px solid #FEDF89; }
.cpv iframe { flex:1; border:0; width:100%; background:#E4E7EC; }
.cpv-main { flex:1; min-height:0; display:flex; position:relative; }
.cpv { position:relative; }`;
const fileName = t => String(t || 'document').replace(/[\\/:*?"<>|]+/g, '-').trim() + '.pdf';
const saveBlob = (blob, name) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); };
const titleOf = html => ((String(html).match(/<title>([\s\S]*?)<\/title>/) || [])[1] || 'Print').replace(/&amp;/g, '&');


/* Full page: on each printed page (pages are split by .pb), grow the element marked data-fill so the document
   reaches the bottom of the A4 page — the same as the Delivery Challan. A page that is already full is left alone. */
export function fillPages(doc, pageMm = 279) {
  try {
    const probe = doc.createElement('div'); probe.style.cssText = `position:absolute;visibility:hidden;height:${pageMm}mm;width:1px`;
    doc.body.appendChild(probe); const pageH = probe.getBoundingClientRect().height; probe.remove();
    const kids = [...doc.body.children].filter(el => !['STYLE', 'SCRIPT'].includes(el.tagName));
    const segs = [[]];
    kids.forEach(el => { if (el.classList.contains('pb')) segs.push([]); else segs[segs.length - 1].push(el); });
    segs.forEach(seg => {
      if (!seg.length) return;
      const fill = seg.map(el => (el.matches('[data-fill]') ? el : el.querySelector('[data-fill]'))).find(Boolean);
      if (!fill) return;
      const last = seg[seg.length - 1];
      const used = last.getBoundingClientRect().bottom + (parseFloat(doc.defaultView.getComputedStyle(last).marginBottom) || 0) - seg[0].getBoundingClientRect().top;
      const spare = Math.floor(pageH - used - 6);
      if (spare <= 0) return;
      const h = fill.getBoundingClientRect().height + spare;
      (fill.tagName === 'TR' ? [...fill.children] : [fill]).forEach(c => { c.style.height = `${h}px`; });
    });
  } catch { /* print as is */ }
}

/* ── the beta print look: the same bordered layouts, coloured in the beta teal ──
   One sheet over every print (it only recolours the shared parts: title / section bars, column headings, totals).
   Borders stay black and the text dark, so a black-and-white print still reads well. */
export const TEAL_PRINT_CSS = `
* { -webkit-print-color-adjust:exact !important; print-color-adjust:exact !important; }
.ttl, td.ttl, .hdr .ttl .t, .title, .head, .doc-title { background:#03444f !important; color:#fff !important; }
.ttl *, .hdr .ttl .t *, .title *, .head * { color:#fff !important; }
.sec td, div.sec, td.sec, th.sec, tr.sec > td { background:#03444f !important; color:#fff !important; }
.hd th, .hd td, .doc > table > thead > tr > th, .doc > table > tbody > tr.hd > th, .lst th, .rep th, table.items thead th, thead.hd th { background:#D4EBEE !important; color:#03444f !important; }
.kv th, .doc > table > tbody > tr > th { background:#EEF6F7 !important; color:#023840 !important; }
tr.tot td, tr.gt td, tr.due td, tr.tt td, tr.g1 td, .rep tr.tot td, .lst tr.tot td { background:#E3F1F3 !important; color:#023840 !important; }
.co .nm, .hdr .co .nm, .nm.co { color:#03444f !important; }
.lbl { color:#2C6670 !important; }
`;
/* the teal colouring is switched off — prints keep their plain bordered black-and-white look (owner's choice) */
export const withTeal = html => html;

/* ── e-mail panel (inside the preview) ── */
const MAIL_CSS = `
.cpv-main { flex:1; min-height:0; display:flex; }
.cpv-main iframe { flex:1; min-width:0; }
.cpm { width:400px; flex-shrink:0; border-left:1px solid #DCE6E8; background:#F7FAFA; display:flex; flex-direction:column; min-height:0; }
.cpm-h { display:flex; align-items:center; gap:8px; padding:12px 14px; border-bottom:1px solid #E4ECEE; background:#fff; }
.cpm-h b { flex:1; font-size:14px; color:#101828; } .cpm-h button { border:0; background:none; font-size:18px; cursor:pointer; color:#667085; }
.cpm-b { flex:1; overflow:auto; padding:12px 14px; display:flex; flex-direction:column; gap:10px; }
.cpm label { display:block; font-size:11.5px; font-weight:700; color:#475467; margin-bottom:4px; letter-spacing:.2px; }
.cpm input[type=text], .cpm textarea { width:100%; box-sizing:border-box; border:1px solid #C9D7DA; border-radius:6px; padding:8px 10px; font:13px Inter, Arial, sans-serif; color:#101828; background:#fff; }
.cpm textarea { min-height:150px; resize:vertical; line-height:1.5; }
.cpm input:focus, .cpm textarea:focus { outline:none; border-color:#2A9DAA; box-shadow:0 0 0 3px rgba(42,157,170,.15); }
.cpm .fld { position:relative; }
.cpm .sug { position:absolute; left:0; right:0; top:100%; z-index:5; background:#fff; border:1px solid #C9D7DA; border-radius:6px; box-shadow:0 8px 20px rgba(16,24,40,.12); max-height:220px; overflow:auto; margin-top:2px; }
.cpm .sug button { display:block; width:100%; text-align:left; border:0; background:none; padding:7px 10px; cursor:pointer; font:12.5px Inter, Arial, sans-serif; color:#101828; }
.cpm .sug button:hover, .cpm .sug button.on { background:#E8F3F4; } .cpm .sug small { display:block; color:#667085; font-size:11px; }
.cpm .hint { font-size:11px; color:#667085; margin-top:3px; }
.cpm .att { display:flex; align-items:center; gap:8px; padding:7px 9px; background:#fff; border:1px solid #DCE6E8; border-radius:6px; margin-bottom:6px; }
.cpm .att i { font-style:normal; width:30px; height:30px; border-radius:5px; background:#03444f; color:#fff; font:700 9.5px Arial, sans-serif; display:grid; place-items:center; flex-shrink:0; }
.cpm .att input { border:0 !important; padding:2px 0 !important; box-shadow:none !important; font-weight:600 !important; background:transparent !important; }
.cpm .att span { flex:1; min-width:0; font-size:12.5px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.cpm .att button { border:0; background:none; color:#B42318; cursor:pointer; font-size:15px; }
.cpm .add { border:1px dashed #9FC3C9; background:#fff; color:#03444f; border-radius:6px; padding:7px; width:100%; cursor:pointer; font:600 12.5px Inter, Arial, sans-serif; }
.cpm-f { padding:10px 14px; border-top:1px solid #E4ECEE; background:#fff; display:flex; gap:8px; align-items:center; }
.cpm-f .st { flex:1; font-size:12px; color:#667085; } .cpm-f .st.err { color:#B42318; } .cpm-f .st.ok { color:#067647; font-weight:600; }
.cpm-f button { border:0; background:#03444f; color:#fff; font:600 13px Inter, Arial, sans-serif; padding:9px 18px; border-radius:6px; cursor:pointer; }
.cpm-f button:disabled { opacity:.6; cursor:default; }
@media (max-width:900px) { .cpm { position:absolute; inset:46px 0 0 auto; width:min(400px, 100%); box-shadow:-8px 0 24px rgba(16,24,40,.18); } .cpv { position:relative; } }`;

let contactsCache = null;
const loadContacts = () => contactsCache || (contactsCache = axios.get('/api/mail/contacts').then(r => r.data).catch(() => ({ company: {}, contacts: [] })));
const toB64 = blob => new Promise(res => { const rd = new FileReader(); rd.onload = () => res(String(rd.result).split(',')[1] || ''); rd.onerror = () => res(''); rd.readAsDataURL(blob); });
const emailsIn = html => [...new Set((String(html).replace(/<[^>]+>/g, ' ').match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) || []).map(e => e.toLowerCase()))];

function mailPanel(box, getDoc, title, opts) {
  box.querySelector('.cpm')?.remove();
  const pn = document.createElement('div'); pn.className = 'cpm';
  pn.innerHTML = `<div class="cpm-h"><b>E-mail this document</b><button type="button" data-m="x" aria-label="Close e-mail">×</button></div>
  <div class="cpm-b">
    <div class="fld"><label for="cpm-to">To</label><input type="text" id="cpm-to" autocomplete="off" placeholder="name@company.com, …"><div class="hint">Separate several addresses with a comma.</div></div>
    <div class="fld"><label for="cpm-cc">CC</label><input type="text" id="cpm-cc" autocomplete="off" placeholder="Anyone to copy (optional)"></div>
    <div><label for="cpm-sub">Subject</label><input type="text" id="cpm-sub"></div>
    <div><label for="cpm-msg">Message</label><textarea id="cpm-msg"></textarea></div>
    <div><label>Attachments</label><div class="atts"></div><input type="file" multiple hidden><button type="button" class="add" data-m="add">+ Add files</button></div>
  </div>
  <div class="cpm-f"><span class="st" role="status"></span><button type="button" data-m="send">Send e-mail</button></div>`;
  box.querySelector('.cpv-main').appendChild(pn);
  const $ = s => pn.querySelector(s);
  const st = (t, k = '') => { const e = $('.st'); e.textContent = t; e.className = `st ${k}`; };
  const docName = String(opts.fileName || title || 'document').replace(/[\\/:*?"<>|]+/g, '-').replace(/\.pdf$/i, '').trim();
  let extra = [];
  const drawAtts = () => {
    $('.atts').innerHTML = `<div class="att"><i>PDF</i><input type="text" value="${docName.replace(/"/g, '&quot;')}" aria-label="Attachment name"><span style="flex:0;color:#667085">.pdf</span></div>`
      + extra.map((f, i) => `<div class="att"><i>${(f.name.split('.').pop() || 'FILE').slice(0, 4).toUpperCase()}</i><span title="${f.name}">${f.name}</span><small style="color:#667085">${Math.ceil(f.size / 1024)} KB</small><button type="button" data-rm="${i}" aria-label="Remove">×</button></div>`).join('');
  };
  drawAtts();
  $('#cpm-sub').value = title;
  loadContacts().then(({ company, contacts }) => {
    const coMail = String(company?.email || '').toLowerCase();
    const found = opts.to ? [].concat(opts.to) : emailsIn(opts.html || opts.mailHtml || '').filter(e => e !== coMail).slice(0, 1);
    if (!$('#cpm-to').value) $('#cpm-to').value = found.join(', ');
    if ($('#cpm-sub').value === title) $('#cpm-sub').value = opts.mail?.subject || (company?.name ? `${title} — ${company.name}` : title);
    if (!$('#cpm-msg').value) $('#cpm-msg').value = opts.mail?.message || `Dear Sir / Madam,\n\nPlease find attached ${title}.\n\nKindly acknowledge receipt. For any query, please reply to this e-mail.`;
    // suggestions for To / CC: the word being typed after the last comma
    ['#cpm-to', '#cpm-cc'].forEach(sel => {
      const inp = $(sel), wrap = inp.parentElement;
      const close = () => wrap.querySelector('.sug')?.remove();
      const show = () => {
        close();
        const parts = inp.value.split(','), q = parts[parts.length - 1].trim().toLowerCase();
        if (q.length < 2) return;
        const hits = contacts.filter(c => `${c.email} ${c.name} ${c.party}`.toLowerCase().includes(q)).slice(0, 8);
        if (!hits.length) return;
        const s = document.createElement('div'); s.className = 'sug';
        s.innerHTML = hits.map((c, i) => `<button type="button" data-i="${i}">${c.email}<small>${[c.name, c.party].filter(Boolean).join(' · ')}</small></button>`).join('');
        s.addEventListener('mousedown', e => { const b = e.target.closest('button'); if (!b) return; e.preventDefault();
          parts[parts.length - 1] = ` ${hits[+b.dataset.i].email}`; inp.value = parts.join(',').replace(/^\s+/, '') + ', '; close(); inp.focus(); });
        wrap.appendChild(s);
      };
      inp.addEventListener('input', show); inp.addEventListener('blur', () => setTimeout(close, 150));
    });
  });
  const fileIn = pn.querySelector('input[type=file]');
  fileIn.addEventListener('change', () => { extra = [...extra, ...fileIn.files].slice(0, 10); fileIn.value = ''; drawAtts(); });
  pn.addEventListener('click', async e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.rm != null) { extra.splice(+b.dataset.rm, 1); drawAtts(); return; }
    if (b.dataset.m === 'x') { pn.remove(); return; }
    if (b.dataset.m === 'add') { fileIn.click(); return; }
    if (b.dataset.m !== 'send') return;
    const to = $('#cpm-to').value, cc = $('#cpm-cc').value;
    if (!to.trim()) { st('Enter the e-mail address in To.', 'err'); $('#cpm-to').focus(); return; }
    b.disabled = true; st('Making the PDF and sending…');
    try {
      const doc = await getDoc();
      const files = await Promise.all(extra.map(async f => ({ name: f.name, data: await toB64(f) })));
      const name = ($('.att input')?.value || docName).trim() || docName;
      const r = await axios.post('/api/mail/send', { to, cc, subject: $('#cpm-sub').value, message: $('#cpm-msg').value, docTitle: title, fileName: `${name}.pdf`, document: doc, files, summary: opts.mail?.summary || [] });
      st(r.data?.message || 'Sent.', 'ok'); b.textContent = 'Sent ✓';
    } catch (err) { st(err.response?.data?.error || 'Could not send the e-mail.', 'err'); b.disabled = false; }
  });
  setTimeout(() => $('#cpm-to').focus(), 50);
}

/* products for an e-mail subject: "A, B + 3 more" */
export const prodText = names => { const l = names.map(x => String(x || '').trim()).filter(Boolean); return l.length ? l.slice(0, 2).join(', ') + (l.length > 2 ? ` + ${l.length - 2} more` : '') : ''; };

/* ── e-signatures on a print ──
   opts.sign = { type, id, perm }: who signed this document (prepared / reviewed / approved) — each signature image is
   put above its label on the page ("Prepared By", "Verified / Checked / Reviewed By", "Authorised Signatory"). */
const SIGN_ROLES = [
  ['prepared', 'Prepared by', /^\s*(prepared|created|made)\s*by\s*:?\s*$/i],
  ['reviewed', 'Reviewed / verified by', /^\s*(verified|checked|reviewed)\s*by\s*:?\s*$/i],
  ['approved', 'Approved (authorised signatory)', /^\s*(authori[sz]ed\s+signatory|approved\s+by)\s*:?\s*$/i],
];
const SIG_CSS = `
/* each signature column: the signature (fitted) · the label · the name in bold · the date — all three columns the same size */
.esig-i { display:flex !important; align-items:flex-end; justify-content:center; height:22mm; margin:0 0 2px; }
.esig-i img { display:block; max-height:22mm; max-width:100%; object-fit:contain; }
.esig-n { display:block !important; font:bold 8.6pt Arial, sans-serif !important; color:#000 !important; margin-top:2px; min-height:11pt; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.esig-d { display:block !important; font:normal 7.6pt Arial, sans-serif !important; color:#000 !important; min-height:9pt; }
.sig .row3 b, .sg .tri span { display:flex !important; flex-direction:column; justify-content:flex-end; text-align:center; flex:1 1 0; min-width:0; }`;
const sdmy = v => { const x = new Date(v); return isNaN(x) ? '' : `${String(x.getDate()).padStart(2, '0')}-${String(x.getMonth() + 1).padStart(2, '0')}-${x.getFullYear()}`; };
export async function loadSigns(sign) {
  if (!sign?.type || !sign?.id) return {};
  try { return (await axios.get('/api/sign/doc', { params: { type: sign.type, id: sign.id } })).data || {}; } catch { return {}; }
}
export function applySigns(doc, signs) {
  try {
    doc.querySelectorAll('.esig, .esig-i, .esig-n, .esig-d').forEach(e => e.remove());
    doc.querySelectorAll('[data-esig-wrap]').forEach(e => e.removeAttribute('data-esig-wrap'));
    const any = SIGN_ROLES.some(([role]) => signs?.[role]?.img);
    if (!any) return;
    if (!doc.getElementById('esig-css')) { const st = doc.createElement('style'); st.id = 'esig-css'; st.textContent = SIG_CSS; doc.head.appendChild(st); }
    const labels = [...doc.body.querySelectorAll('b, span, div, td, p, strong, th')].filter(e => !e.children.length);
    SIGN_ROLES.forEach(([role, , rx]) => {
      const s = signs?.[role] && signs[role].img ? signs[role] : null;
      labels.filter(e => rx.test(e.textContent || '')).forEach(el => {
        // signed or not, every column gets the same parts so the three boxes are the same size
        const top = doc.createElement('span'); top.className = 'esig-i';
        if (s) { const img = doc.createElement('img'); img.src = s.img; img.alt = ''; top.appendChild(img); }
        const nm = doc.createElement('span'); nm.className = 'esig-n'; nm.textContent = s ? s.name : '\u00a0';
        const dt = doc.createElement('span'); dt.className = 'esig-d'; dt.textContent = s && s.at ? sdmy(s.at) : '\u00a0';
        el.insertBefore(top, el.firstChild); el.appendChild(nm); el.appendChild(dt);
        el.setAttribute('data-esig-wrap', '1');
      });
    });
  } catch { /* the page as it is */ }
}
/* a page (html text) with the signatures put in — for PDFs made on the server */
export async function signHtml(html, sign) {
  const signs = await loadSigns(sign);
  if (!Object.keys(signs).length) return html;
  const d = new DOMParser().parseFromString(String(html), 'text/html');
  applySigns(d, signs);
  return '<!DOCTYPE html>' + d.documentElement.outerHTML;
}
const SIGN_CSS = `
.cps { position:absolute; right:12px; top:46px; z-index:6; width:330px; background:#fff; border:1px solid #DCE6E8; border-radius:10px; box-shadow:0 14px 34px rgba(16,24,40,.22); padding:10px; font:13px Inter, Arial, sans-serif; color:#101828; }
.cps h4 { margin:2px 4px 8px; font-size:13px; }
.cps .r { display:flex; align-items:center; gap:10px; padding:8px; border-radius:8px; }
.cps .r + .r { border-top:1px solid #EEF2F3; }
.cps .r .t { flex:1; min-width:0; } .cps .r .t b { display:block; font-size:12.5px; } .cps .r .t small { display:block; font-size:11.5px; color:#667085; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.cps .r .t small.ok { color:#067647; font-weight:600; }
.cps .r img { height:26px; max-width:70px; object-fit:contain; }
.cps button { border:1px solid #03444f; background:#03444f; color:#fff; font:600 12px Inter, Arial, sans-serif; padding:5px 10px; border-radius:6px; cursor:pointer; white-space:nowrap; }
.cps button.gh { background:#fff; color:#B42318; border-color:#F3C3BE; }
.cps button:disabled { opacity:.5; cursor:default; }
.cps .m { margin:6px 4px 2px; font-size:11.5px; color:#667085; } .cps .m.err { color:#B42318; }
.cps .m a { color:#03444f; font-weight:600; }
.cps .pg { margin-top:6px; padding:10px 8px 4px; border-top:1px solid #EEF2F3; }
.cps .pg > b { display:block; font-size:12.5px; }
.cps .plc { width:100%; padding:8px !important; font-size:12.5px !important; } .cps .pg > small { display:block; font-size:11px; color:#667085; margin:2px 0 8px; }
.cps .pgr { display:flex; align-items:center; gap:8px; margin-bottom:8px; font-size:12.5px; }
.cps .pgr label { display:inline-flex; align-items:center; gap:4px; cursor:pointer; white-space:nowrap; }
.cps .pgr input[type=text], .cps .pgr select { flex:1; min-width:0; height:30px; border:1px solid #C9D7DA; border-radius:6px; padding:0 8px; font:12.5px Inter, Arial, sans-serif; }
.cps .pgr input:disabled { background:#F2F4F7; }
.cps .st { display:flex; align-items:center; gap:8px; font-size:11.5px; color:#067647; font-weight:600; padding:4px 0; } .cps .st span { flex:1; }
.cpb { position:absolute; inset:0; z-index:5; background:rgba(255,255,255,.55); display:grid; place-items:center; backdrop-filter:blur(1px); }
.cpb .w { width:min(380px, 86%); background:#fff; border:1px solid #CFD8DC; border-radius:8px; padding:16px 18px; box-shadow:0 12px 30px rgba(16,24,40,.22); font:13px Inter, Arial, sans-serif; }
.cpb .w b { display:block; color:#101828; margin-bottom:10px; } .cpb .w small { display:block; margin-top:8px; color:#667085; font-size:11.5px; }
/* a Windows 7 style progress bar: green, glossy, moving shine */
.cpb .bar { position:relative; height:16px; border:1px solid #8E8F8F; border-radius:3px; background:linear-gradient(#F3F3F3, #DCDCDC); overflow:hidden; box-shadow:inset 0 1px 2px rgba(0,0,0,.15); }
.cpb .bar i { position:absolute; inset:0; background:linear-gradient(#6FE36B, #2DB52A 48%, #10A00E 52%, #3CC738); }
.cpb .bar i::after { content:''; position:absolute; top:0; bottom:0; width:40%; left:-40%; background:linear-gradient(90deg, transparent, rgba(255,255,255,.75), transparent); animation:cpbsh 1.4s linear infinite; }
@keyframes cpbsh { to { left:110%; } }`;

/* ── place signatures by clicking on the pages of the PDF (client PO, drawings…: their sign spaces differ page to page) ── */
const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';
const loadPdfJs = () => (window.pdfjsLib ? Promise.resolve(window.pdfjsLib) : new Promise((res, rej) => {
  const sc = document.createElement('script'); sc.src = PDFJS + 'pdf.min.js';
  sc.onload = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS + 'pdf.worker.min.js'; res(window.pdfjsLib); };
  sc.onerror = () => rej(new Error('The page viewer could not load — check the internet connection.'));
  document.head.appendChild(sc);
}));
const PLACE_CSS = `
.cpp { position:absolute; inset:0; z-index:7; background:#525659; display:flex; flex-direction:column; font:13px Inter, Arial, sans-serif; }
.cpp-t { display:flex; align-items:center; gap:12px; padding:9px 14px; background:#fff; border-bottom:1px solid #DCE6E8; flex-wrap:wrap; }
.cpp-t .h { flex:1; min-width:220px; } .cpp-t .h b { display:block; font-size:13.5px; color:#101828; } .cpp-t .h small { color:#667085; font-size:12px; }
.cpp-t label { display:inline-flex; align-items:center; gap:6px; font-size:12.5px; color:#344054; }
.cpp-t input[type=range] { width:120px; accent-color:#03444f; }
.cpp-t button { border:1px solid #C9D7DA; background:#fff; color:#03444f; font:600 12.5px Inter, Arial, sans-serif; padding:7px 12px; border-radius:6px; cursor:pointer; }
.cpp-t button.pri { background:#03444f; color:#fff; border-color:#03444f; } .cpp-t button:disabled { opacity:.5; cursor:default; }
.cpp-b { flex:1; overflow:auto; padding:18px 0 40px; }
.cpp-p { position:relative; margin:0 auto 18px; background:#fff; box-shadow:0 2px 10px rgba(0,0,0,.35); cursor:crosshair; }
.cpp-p canvas { display:block; width:100%; height:auto; }
.cpp-p .no { position:absolute; left:-2px; top:-24px; color:#E4E7EC; font-size:12px; }
.cpp-m { position:absolute; border:1.5px dashed #2A9DAA; background:rgba(42,157,170,.06); cursor:move; text-align:center; touch-action:none; }
.cpp-m img { display:block; width:100%; height:auto; pointer-events:none; }
.cpp-m b { display:block; font:bold 10px Arial, sans-serif; color:#000; white-space:nowrap; overflow:hidden; } .cpp-m i { display:block; font:normal 9px Arial, sans-serif; color:#000; font-style:normal; }
.cpp-m .x { position:absolute; right:-10px; top:-10px; width:20px; height:20px; border-radius:50%; border:0; background:#B42318; color:#fff; font-size:13px; line-height:20px; cursor:pointer; padding:0; }
.cpp-msg { color:#fff; text-align:center; padding:40px; }`;

function openPlacer(box, opts, sigUrl, onSave) {
  box.querySelector('.cpp')?.remove();
  const main = box.querySelector('.cpv-main');
  const el = document.createElement('div'); el.className = 'cpp';
  el.innerHTML = `<div class="cpp-t"><div class="h"><b>Click on a page where you want to sign</b><small>Drag a signature to move it · × to remove it · each page can have its own place</small></div>
    <label>Size <input type="range" min="10" max="40" value="22" aria-label="Signature size"></label>
    <button type="button" data-p="all" disabled>Same place on all pages</button>
    <span class="cnt" style="font-size:12.5px;color:#475467">0 places</span>
    <button type="button" data-p="cancel">Cancel</button><button type="button" class="pri" data-p="save" disabled>Sign</button></div>
    <div class="cpp-b"><div class="cpp-msg">Opening the pages…</div></div>`;
  main.appendChild(el);
  const body = el.querySelector('.cpp-b'), size = el.querySelector('input[type=range]');
  const today = sdmy(new Date()), myName = opts.__me?.name || '';
  let marks = [], pageEls = [], ratio = 0.5, last = null;
  const img = new Image(); img.onload = () => { ratio = img.naturalHeight / img.naturalWidth || 0.5; }; img.src = sigUrl;
  const count = () => { el.querySelector('.cnt').textContent = `${marks.length} place${marks.length === 1 ? '' : 's'}`; el.querySelector('[data-p=save]').disabled = !marks.length; el.querySelector('[data-p=all]').disabled = !last || pageEls.length < 2; };
  const draw = () => {
    pageEls.forEach(p => p.querySelectorAll('.cpp-m').forEach(m => m.remove()));
    marks.forEach((m, i) => {
      const pg = pageEls[m.page - 1]; if (!pg) return;
      const d = document.createElement('div'); d.className = 'cpp-m';
      d.style.left = `${m.x * 100}%`; d.style.top = `${m.y * 100}%`; d.style.width = `${m.w * 100}%`;
      d.innerHTML = `<img src="${sigUrl}" alt=""><b>${myName}</b><i>${today}</i><button type="button" class="x" aria-label="Remove">×</button>`;
      d.querySelector('.x').addEventListener('click', e => { e.stopPropagation(); marks.splice(i, 1); if (last === m) last = marks[marks.length - 1] || null; draw(); count(); });
      d.addEventListener('pointerdown', e => {
        if (e.target.closest('.x')) return;
        e.preventDefault(); e.stopPropagation(); d.setPointerCapture(e.pointerId);
        const r = pg.getBoundingClientRect(), sx = e.clientX, sy = e.clientY, ox = m.x, oy = m.y;
        const mv = ev => { m.x = Math.min(1 - m.w, Math.max(0, ox + (ev.clientX - sx) / r.width)); m.y = Math.min(0.97, Math.max(0, oy + (ev.clientY - sy) / r.height)); d.style.left = `${m.x * 100}%`; d.style.top = `${m.y * 100}%`; };
        const up = () => { d.removeEventListener('pointermove', mv); d.removeEventListener('pointerup', up); last = m; count(); };
        d.addEventListener('pointermove', mv); d.addEventListener('pointerup', up);
      });
      pg.appendChild(d);
    });
  };
  size.addEventListener('input', () => { const w = +size.value / 100; marks.forEach(m => { m.w = w; m.x = Math.min(m.x, 1 - w); }); draw(); });
  el.addEventListener('click', async e => {
    const b = e.target.closest('button[data-p]'); if (!b) return;
    if (b.dataset.p === 'cancel') { el.remove(); return; }
    if (b.dataset.p === 'all' && last) {
      pageEls.forEach((_, i) => { if (!marks.some(m => m.page === i + 1 && Math.abs(m.x - last.x) < 0.02 && Math.abs(m.y - last.y) < 0.02)) marks.push({ ...last, page: i + 1 }); });
      draw(); count(); return;
    }
    if (b.dataset.p === 'save') { b.disabled = true; const ok = await onSave(marks.map(m => ({ page: m.page, x: m.x, y: m.y, w: m.w }))); if (ok) el.remove(); else b.disabled = false; }
  });
  (async () => {
    try {
      const lib = await loadPdfJs();
      const data = new Uint8Array(await (await fetch(opts.pdfUrl)).arrayBuffer());
      const doc = await lib.getDocument({ data }).promise;
      body.innerHTML = '';
      const W = Math.min(860, body.clientWidth - 60);
      for (let n = 1; n <= doc.numPages; n++) {
        const page = await doc.getPage(n), vp0 = page.getViewport({ scale: 1 }), sc = (W / vp0.width) * (window.devicePixelRatio || 1);
        const vp = page.getViewport({ scale: sc });
        const wrap = document.createElement('div'); wrap.className = 'cpp-p'; wrap.style.width = `${W}px`; wrap.style.marginTop = '26px';
        const cv = document.createElement('canvas'); cv.width = vp.width; cv.height = vp.height;
        wrap.innerHTML = `<span class="no">Page ${n} of ${doc.numPages}</span>`; wrap.appendChild(cv); body.appendChild(wrap);
        await page.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise;
        // eslint-disable-next-line no-loop-func -- the click uses the current size / last mark on purpose
        wrap.addEventListener('click', ev => {
          if (ev.target.closest('.cpp-m')) return;
          const r = wrap.getBoundingClientRect(), w = +size.value / 100;
          const fx = (ev.clientX - r.left) / r.width, fy = (ev.clientY - r.top) / r.height;
          const hFrac = (w * r.width * ratio) / r.height;
          const m = { page: n, w, x: Math.min(1 - w, Math.max(0, fx - w / 2)), y: Math.min(0.97, Math.max(0, fy - hFrac / 2)) };
          marks.push(m); last = m; draw(); count();
        });
        pageEls.push(wrap);
      }
      count();
    } catch (err) { body.innerHTML = `<div class="cpp-msg">${err.message || 'The pages could not be opened.'}</div>`; }
  })();
}

/* opts: { html } for a page, or { pdfUrl, fileName } for a ready PDF.
   { to } fills the e-mail address · { mail: { subject, message, summary } } the e-mail · { sign: { type, id, perm } } e-signatures
   · { rebuild } (PDF made on the server) makes it again after signing — shown in place with a progress bar */
export function openPreview(title, opts) {
  document.getElementById('cpv-root')?.remove();
  if (!document.getElementById('cpv-css')) { const s = document.createElement('style'); s.id = 'cpv-css'; s.textContent = PV_CSS + MAIL_CSS + SIGN_CSS + PLACE_CSS; document.head.appendChild(s); }
  if (opts.html) opts = { ...opts, html: withTeal(opts.html) };
  const ov = document.createElement('div'); ov.id = 'cpv-root'; ov.className = 'cpv-ov';
  ov.innerHTML = `<div class="cpv" role="dialog" aria-modal="true" aria-label="Print preview"><div class="cpv-bar"><b></b>
    ${opts.sign ? '<button type="button" data-a="sign">✍ Sign</button>' : ''}<button type="button" data-a="mail">✉ Email</button><button type="button" data-a="save">Save PDF</button><button type="button" class="pri" data-a="print">Print</button><button type="button" class="x" data-a="close" aria-label="Close">×</button></div>
    <div class="cpv-main"><iframe title="Preview"></iframe></div></div>`;
  const docTitle = title || titleOf(opts.html);
  let signsP = loadSigns(opts.sign);
  ov.querySelector('b').textContent = docTitle;
  document.body.appendChild(ov);
  const fr = ov.querySelector('iframe'), box = ov.querySelector('.cpv');
  if (opts.html) {
    fr.onload = () => {
      try {
        const d = fr.contentDocument, land = /size:\s*A4\s+landscape/i.test(opts.html), st = d.createElement('style');
        st.textContent = sheetCss(land); d.head.appendChild(st);
        if (!land) setTimeout(() => fillPages(d), 60);   // after the fonts / logo are laid out
        // a page with signature boxes but no document id given: sign it under its title (each document has its own)
        if (!opts.sign && SIGN_ROLES.some(([, , rx]) => [...d.body.querySelectorAll('b, span, div, td, p, strong, th')].some(e => !e.children.length && rx.test(e.textContent || '')))) {
          opts.sign = { type: 'print', id: String(docTitle).replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) };
          signsP = loadSigns(opts.sign);
          if (!ov.querySelector('[data-a="sign"]')) { const b = document.createElement('button'); b.type = 'button'; b.dataset.a = 'sign'; b.textContent = '✍ Sign'; ov.querySelector('[data-a="mail"]').before(b); }
        }
        signsP.then(sg => applySigns(d, sg));
      } catch { /* shown as is */ }
    };
    fr.srcdoc = opts.html;
  } else fr.src = opts.pdfUrl;
  const msg = t => { let m = ov.querySelector('.cpv-msg'); if (!m) { m = document.createElement('div'); m.className = 'cpv-msg'; box.insertBefore(m, box.querySelector('.cpv-main')); } m.textContent = t; };
  const close = () => { ov.remove(); document.removeEventListener('keydown', key); if (opts.pdfUrl) URL.revokeObjectURL(opts.pdfUrl); };
  const key = e => { if (e.key === 'Escape' && !ov.querySelector('.cpm')) close(); };
  document.addEventListener('keydown', key);
  ov.addEventListener('mousedown', e => { if (e.target === ov) close(); });
  const pageHtml = () => { try { return '<!DOCTYPE html>' + fr.contentDocument.documentElement.outerHTML; } catch { return opts.html; } };
  ov.addEventListener('click', async e => {
    const a = e.target.closest('.cpv-bar button')?.dataset.a;
    if (a === 'close') close();
    if (a === 'print') { if (isAppMode()) { ov.querySelector('.cpv-bar [data-a="save"]').click(); return; } fr.contentWindow.focus(); fr.contentWindow.print(); }   // the app: a PDF to share
    if (a === 'sign') {
      if (box.querySelector('.cps')) { box.querySelector('.cps').remove(); return; }
      const pn = document.createElement('div'); pn.className = 'cps'; box.appendChild(pn);
      let me = null;
      const pdfMode = !opts.html && !!opts.rebuild;
      const docs = opts.signs && opts.signs.length > 1 ? opts.signs : null;   // e.g. delivery challan + tax invoice in one PDF
      let target = opts.sign;
      const draw = async (note, err) => {
        const [sg, mine] = await Promise.all([signsP, me || (me = axios.get('/api/sign/my').then(r => r.data).catch(() => ({})))]);
        const stamps = sg.stamps || [];
        pn.innerHTML = `<h4>Sign this document</h4>${docs ? `<div class="pgr"><select class="doc" aria-label="Document to sign">${docs.map((x, i) => `<option value="${i}" ${x.id === target.id && x.type === target.type ? 'selected' : ''}>${x.label || `${x.type} ${x.id}`}</option>`).join('')}</select></div>` : ''}${SIGN_ROLES.map(([r, label]) => { const s = sg[r]; return `<div class="r"><div class="t"><b>${label}</b>${s ? `<small class="ok">✓ ${s.name} · ${sdmy(s.at)}</small>` : '<small>Not signed</small>'}</div>
          ${s && s.img ? `<img src="${s.img}" alt="">` : ''}${s ? `<button type="button" class="gh" data-sg="del" data-r="${r}">Remove</button>` : `<button type="button" data-sg="add" data-r="${r}" ${mine?.has ? '' : 'disabled'}>Sign</button>`}</div>`; }).join('')}
          ${pdfMode ? `<div class="pg"><b>Sign pages of this PDF</b><small>The order and the files uploaded with it (client PO, drawings…).</small>
            <button type="button" class="plc" data-sg="place" ${mine?.has ? '' : 'disabled'}>🖊 Place by clicking on the pages…</button>
            <small style="margin:8px 0 6px">Or the same corner on many pages:</small>
            <div class="pgr"><label><input type="radio" name="cps-pg" value="all" checked> All pages</label><label><input type="radio" name="cps-pg" value="some"> Pages</label>
              <input type="text" class="pgs" placeholder="e.g. 2-4, 6" disabled></div>
            <div class="pgr"><select class="pos" aria-label="Where on the page"><option value="br">Bottom right</option><option value="bc">Bottom centre</option><option value="bl">Bottom left</option></select>
              <button type="button" data-sg="stamp" ${mine?.has ? '' : 'disabled'}>Sign pages</button></div>
            ${stamps.map(st => `<div class="st"><span>✓ ${st.name} · ${st.pos === 'xy' ? `page ${st.pages} · placed` : `pages ${st.pages === 'all' ? 'all' : st.pages} · ${({ br: 'bottom right', bc: 'bottom centre', bl: 'bottom left' })[st.pos] || ''}`}</span><button type="button" class="gh" data-sg="unstamp" data-sid="${st.sid}">Remove</button></div>`).join('')}
          </div>` : ''}
          <div class="m ${err ? 'err' : ''}">${note || (mine?.has ? 'Your saved signature is used.' : 'Add your signature first: <a href="/beta/profile?tab=signature">My Profile → Signature</a>.')}</div>`;
        pn.querySelector('select.doc')?.addEventListener('change', e => { target = docs[+e.target.value]; signsP = loadSigns(target); draw(); });
        pn.querySelectorAll('input[name="cps-pg"]').forEach(r => r.addEventListener('change', () => { const t = pn.querySelector('.pgs'); t.disabled = r.value !== 'some' || !r.checked; if (!t.disabled) t.focus(); }));
      };
      /* the document stays on screen while it is signed: a progress bar over it, then the page / PDF is refreshed in place */
      const busy = text => {
        const main = box.querySelector('.cpv-main');
        let b = main.querySelector('.cpb');
        if (!text) { if (b) b.remove(); return; }
        if (!b) { b = document.createElement('div'); b.className = 'cpb'; b.innerHTML = '<div class="w"><b></b><div class="bar"><i></i></div><small>Please wait — the document is updated here.</small></div>'; main.appendChild(b); }
        b.querySelector('b').textContent = text;
      };
      const refresh = async sg => {
        signsP = (act0 => (act0 ? loadSigns(target) : Promise.resolve(sg || {})))(docs);
        if (opts.html) { try { applySigns(fr.contentDocument, sg || {}); } catch { /* frame gone */ } await new Promise(r => setTimeout(r, 500)); return; }
        if (!opts.rebuild) return;
        const blob = await opts.rebuild();
        const url = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
        await new Promise(res => { fr.onload = () => res(); fr.src = url; setTimeout(res, 8000); });
        if (opts.pdfUrl) URL.revokeObjectURL(opts.pdfUrl);
        opts.pdfUrl = url;
      };
      pn.addEventListener('click', async ev => {
        const bt = ev.target.closest('button[data-sg]'); if (!bt) return;
        const act = bt.dataset.sg;
        if (act === 'place') {
          const mine = await me;
          opts.__me = { name: mine?.name || '' };
          pn.remove();
          openPlacer(box, opts, mine.dataUrl, async place => {
            busy('Signing the pages…');
            try { const r = await axios.post('/api/sign/stamp', { ...opts.sign, place }); await refresh(r.data); return true; }
            catch (e3) { alert(e3.response?.data?.error || 'Could not sign the pages.'); return false; }
            finally { busy(''); }
          });
          return;
        }
        let body = null;
        if (act === 'stamp') {
          const some = pn.querySelector('input[name="cps-pg"][value="some"]').checked, pages = some ? pn.querySelector('.pgs').value.trim() : 'all';
          if (some && !/^\d+(-\d+)?([,\s]+\d+(-\d+)?)*$/.test(pages)) { await draw('Write the pages like 2-4, 6.', true); return; }
          body = { pages, pos: pn.querySelector('.pos').value };
        }
        pn.querySelectorAll('button').forEach(x => { x.disabled = true; });
        busy(act === 'add' || act === 'stamp' ? 'Signing the document…' : 'Removing the signature…');
        try {
          const r = act === 'add' ? await axios.post('/api/sign/doc', { ...target, label: undefined, role: bt.dataset.r })
            : act === 'del' ? await axios.delete('/api/sign/doc', { params: { type: target.type, id: target.id, role: bt.dataset.r } })
              : act === 'stamp' ? await axios.post('/api/sign/stamp', { ...opts.sign, ...body })
                : await axios.delete('/api/sign/stamp', { params: { type: opts.sign.type, id: opts.sign.id, sid: bt.dataset.sid } });
          await refresh(r.data);
          await draw(act === 'add' || act === 'stamp' ? 'Signed — the document is updated.' : 'Removed — the document is updated.');
        } catch (e2) { await draw(e2.response?.data?.error || 'Could not sign.', true); }
        finally { busy(''); }
      });
      draw();
      return;
    }
    if (a === 'mail') {
      if (box.querySelector('.cpm')) { box.querySelector('.cpm').remove(); return; }
      mailPanel(box, async () => (!opts.html ? { pdf: await toB64(await (await fetch(opts.pdfUrl)).blob()) } : { html: pageHtml() }), docTitle, opts);
    }
    if (a === 'save') {
      const name = opts.fileName || fileName(ov.querySelector('b').textContent);
      if (!opts.html) { saveBlob(await (await fetch(opts.pdfUrl)).blob(), name); return; }
      const btn = e.target; btn.disabled = true; btn.textContent = 'Making PDF…';
      try {
        const r = await axios.post('/api/print-merge', { htmls: [pageHtml()] }, { responseType: 'blob' });
        saveBlob(r.data, name);
      } catch {
        msg('Could not make the PDF here — in the print window choose "Save as PDF" as the printer.');
        fr.contentWindow.focus(); fr.contentWindow.print();
      } finally { btn.disabled = false; btn.textContent = 'Save PDF'; }
    }
  });
}

/* a hidden print frame that is already laid out (fill rows sized) → preview it */
export function previewFrame(fr, title, extra = {}) {
  const doc = fr.contentWindow.document;
  const html = '<!DOCTYPE html>' + doc.documentElement.outerHTML;
  fr.remove();
  openPreview(title || doc.title, { html, ...extra });
}
export function previewHtml(html, title, extra = {}) { openPreview(title, { html, ...extra }); }
export function previewPdf(blob, title, name, extra = {}) {
  const url = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
  openPreview(title, { pdfUrl: url, fileName: name || fileName(title), mailHtml: extra.html || '', to: extra.to, mail: extra.mail, sign: extra.sign, signs: extra.signs, rebuild: extra.rebuild });
}
/* a PDF with the page signatures saved for this document drawn on it */
export async function finalPdf(blob, sign) {
  if (!sign?.type || !sign?.id) return blob;
  try {
    const pdf = await toB64(blob instanceof Blob ? blob : new Blob([blob], { type: 'application/pdf' }));
    return (await axios.post('/api/sign/apply', { ...sign, pdf }, { responseType: 'blob' })).data;
  } catch { return blob; }
}
