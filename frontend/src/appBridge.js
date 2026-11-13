import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
/* App mode: when the Android app opens an ERP page inside itself, it adds
 *   #erpapp=1&t=<login token>&c=<company id>
 * to the address. We keep the login, hide the desktop side menu and top bar (the app has its own),
 * and hand files (Save PDF, Print, Excel, JSON downloads) to the app so it can share or save them.
 * Without that address part nothing here runs, so the desktop website is unchanged. */
const KEY = 'erp_app';

function readHash() {
  const h = window.location.hash || '';
  if (!h.includes('erpapp=1')) return;
  const q = new URLSearchParams(h.slice(1));
  try {
    if (q.get('t')) sessionStorage.setItem('erp_token', q.get('t'));
    if (q.get('c')) localStorage.setItem('selectedCompanyId', q.get('c'));
    localStorage.setItem('ui-version', 'beta');   // the app always uses the new look
    sessionStorage.setItem(KEY, '1');
  } catch { /* storage blocked */ }
  window.history.replaceState(null, '', window.location.pathname + window.location.search);
}

export const isAppMode = () => { try { return sessionStorage.getItem(KEY) === '1'; } catch { return false; } };

const toParent = msg => { try { window.parent.postMessage(msg, '*'); } catch { /* not in the app */ } };

const blobToB64 = blob => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] || ''); r.onerror = rej; r.readAsDataURL(blob); });

/* a file the page wants to download → the app */
async function sendFile(href, name) {
  try {
    const blob = await (await fetch(href)).blob();
    toParent({ type: 'erp-file', name: name || 'document', mime: blob.type || 'application/octet-stream', b64: await blobToB64(blob) });
  } catch { toParent({ type: 'erp-toast', text: 'Could not get this file.' }); }
}

const APP_CSS = `
.bx-side, .bx-top { display:none !important; }
html.erp-app, html.erp-app body { font-size:15px; -webkit-text-size-adjust:100%; }
.bx-body { -webkit-overflow-scrolling:touch; }
/* fields: big enough for a finger, 16px text so the phone does not zoom in */
.erp-app input:not([type="checkbox"]):not([type="radio"]):not([type="file"]):not([type="color"]), .erp-app select, .erp-app textarea {
  font-size:16px !important; min-height:44px; border-radius:10px !important; box-sizing:border-box; max-width:100%; }
.erp-app textarea { min-height:72px; }
.erp-app input[type="checkbox"], .erp-app input[type="radio"] { width:22px !important; height:22px !important; min-height:0 !important; flex:none !important; }
.erp-app button { min-height:40px; }
/* form grids with two or more columns → one column */
.erp-app .ph-1 { grid-template-columns:minmax(0,1fr) !important; }
.erp-app .ph-1 > * { grid-column:1 / -1 !important; }   /* a field that spanned 2 desktop columns must not add a hidden column */
.erp-app .ph-fit { grid-template-columns:repeat(auto-fill, minmax(118px, 1fr)) !important; grid-auto-flow:row !important; height:auto !important; }
.erp-app .ph-wrap { flex-wrap:wrap !important; height:auto !important; }
.erp-app .ph-wrap > * { min-width:0; }
.erp-app .ph-full { width:100% !important; max-width:100% !important; min-width:0 !important; }
/* label | value tables → the label above its field */
.erp-app table.ph-kv, .erp-app table.ph-kv > tbody, .erp-app table.ph-kv > tbody > tr { display:block !important; width:100% !important; }
.erp-app table.ph-kv > tbody > tr { padding:2px 0 6px; border:0 !important; }
.erp-app table.ph-kv > tbody > tr > th, .erp-app table.ph-kv > tbody > tr > td { display:block !important; width:auto !important; max-width:none !important;
  border:0 !important; background:none !important; text-align:left !important; white-space:normal !important; }
.erp-app table.ph-kv > tbody > tr > th { padding:8px 12px 3px !important; font-size:13px !important; color:#4f6670 !important; font-weight:600; height:auto !important; }
.erp-app table.ph-kv > tbody > tr > td { padding:0 12px !important; height:auto !important; }
.erp-app table.ph-kv > tbody > tr > td input:not([type="checkbox"]):not([type="radio"]), .erp-app table.ph-kv > tbody > tr > td select, .erp-app table.ph-kv > tbody > tr > td textarea { width:100% !important; }
/* lists and item tables → one card per row, each value with its column name */
.erp-app table.ph-cards { display:block !important; width:100% !important; min-width:0 !important; border:0 !important; background:none !important; }
.erp-app table.ph-cards > thead { display:none !important; }
.erp-app table.ph-cards > tbody, .erp-app table.ph-cards > tfoot { display:block !important; }
.erp-app table.ph-cards > * > tr { display:block !important; margin:10px 10px; padding:8px 4px; border:1px solid #cfdfe2 !important; border-radius:14px;
  background:#fff !important; box-shadow:0 2px 6px rgba(3,68,79,.06); height:auto !important; position:relative; }
.erp-app table.ph-cards > tbody > tr { content-visibility:auto; contain-intrinsic-size:auto 320px; }   /* cards off screen are drawn only when scrolled to */
/* records with several rows (an order with several products): the whole group is one card */
.erp-app table.ph-groups > tbody { display:block !important; margin:10px; padding:4px 0; border:1px solid #cfdfe2; border-radius:14px; background:#fff; box-shadow:0 2px 6px rgba(3,68,79,.06);
  content-visibility:auto; contain-intrinsic-size:auto 360px; }
.erp-app table.ph-groups > tbody > tr { margin:0 !important; border:0 !important; border-radius:0; box-shadow:none !important; content-visibility:visible; background:transparent !important; }
.erp-app table.ph-groups > tbody > tr.ph-more { border-top:1px dashed #cfdfe2 !important; }
.erp-app table.ph-groups > tbody > tr.ph-more > td:first-child { font-weight:600; font-size:15px; }
.erp-app table.ph-groups > tbody.sel, .erp-app table.ph-groups > tbody.on, .erp-app table.ph-groups > tbody.selected, .erp-app table.ph-groups > tbody.active,
.erp-app table.ph-groups > tbody[aria-selected="true"] { border-color:#0B6E7C !important; box-shadow:0 0 0 2px #0B6E7C; background:#F3FAFA !important; }
.erp-app table.ph-cards > * > tr.ph-sel, .erp-app table.ph-cards > * > tr[aria-selected="true"], .erp-app table.ph-cards > * > tr.sel, .erp-app table.ph-cards > * > tr.on, .erp-app table.ph-cards > * > tr.selected, .erp-app table.ph-cards > * > tr.active { border-color:#0B6E7C !important; box-shadow:0 0 0 2px #0B6E7C; }
.erp-app table.ph-cards > * > tr > td, .erp-app table.ph-cards > * > tr > th { display:grid !important; grid-template-columns:38% minmax(0,1fr); gap:8px; align-items:center;
  width:auto !important; max-width:none !important; min-width:0 !important; height:auto !important; border:0 !important; padding:5px 10px !important;
  text-align:left !important; white-space:normal !important; overflow:visible !important; text-overflow:clip !important; background:none !important; position:static !important; }
.erp-app table.ph-cards > * > tr > td::before, .erp-app table.ph-cards > * > tr > th::before { content:attr(data-label); font-size:12.5px; color:#5d7680; font-weight:600; }
.erp-app table.ph-cards > * > tr > td.ph-nolabel, .erp-app table.ph-cards > * > tr > th.ph-nolabel { grid-template-columns:minmax(0,1fr); }
.erp-app table.ph-cards > * > tr > td.ph-nolabel::before, .erp-app table.ph-cards > * > tr > th.ph-nolabel::before { display:none; }
.erp-app table.ph-cards > * > tr > td.ph-empty { display:none !important; }
.erp-app table.ph-cards > * > tr > td.ph-stack { grid-template-columns:minmax(0,1fr); gap:3px; }
.erp-app table.ph-cards > * > tr > td:first-child { font-weight:700; font-size:15.5px; }
.erp-app table.ph-cards > * > tr > td > * { min-width:0; max-width:100%; }
.erp-app table.ph-cards > * > tr > td input:not([type="checkbox"]):not([type="radio"]), .erp-app table.ph-cards > * > tr > td select, .erp-app table.ph-cards > * > tr > td textarea { width:100% !important; }
.erp-app .ph-scroll { overflow-x:hidden !important; }
/* tabs: one line that scrolls sideways; the page toolbar (search, Edit, Print…) gets its own line */
[class$="-tabs"], [class*="-tabs "] { flex-wrap:wrap !important; height:auto !important; }
[class$="-tabs"] > button, [class*="-tabs "] > button { min-height:44px; font-size:14px !important; }
.sb-slot { flex:1 1 100% !important; min-height:44px; overflow-x:auto; overflow-y:visible; border-top:1px solid #B9D0D3; }
.sb-slot:empty { display:none !important; }
.sb-slot input { min-width:0 !important; flex:1 1 140px !important; }
/* pop-ups use the whole screen */
.erp-app [role="dialog"] { max-width:100vw !important; max-height:100vh !important; }
.erp-app .ph-pop { width:100vw !important; max-width:100vw !important; left:0 !important; right:0 !important; border-radius:0 !important; }
/* a PDF drawn as pages (instead of a blank PDF box) */
.ph-pdf { flex:1 1 auto; align-self:stretch; min-height:200px; overflow:auto; background:#525659; padding:0 8px 12px; -webkit-overflow-scrolling:touch; }
.cpv-main > .ph-pdf { width:100%; height:100%; }
.ph-pdf canvas { display:block; margin:8px auto 0; background:#fff; box-shadow:0 1px 4px rgba(0,0,0,.4); }
.ph-pdf-bar { position:sticky; top:0; z-index:1; display:flex; align-items:center; gap:8px; padding:8px 0; color:#fff; font-size:13px; background:#525659; }
.ph-pdf-bar span { flex:1; }
.ph-pdf-bar button { min-height:40px; padding:0 16px; border:0; border-radius:10px; background:#fff; color:#03444f; font-weight:700; font-size:14px; }
/* print preview: full screen, the A4 page shrunk to the phone width */
.cpv { width:calc(100vw / var(--ui-zoom, 1)) !important; height:calc(100vh / var(--ui-zoom, 1)) !important; border-radius:0 !important; }
.cpv-bar { flex-wrap:wrap; }
.cpv-main { overflow:hidden !important; }
.cpv-main > iframe { flex:none !important; width:960px !important; height:calc(100% / var(--app-k, 1)) !important; transform:scale(var(--app-k, 1)); transform-origin:0 0; }
`;

/* PDFs: the phone's built-in browser cannot show a PDF inside a page (it stays blank), so inside the app each PDF
 * box gets its pages drawn as pictures with pdf.js (the same viewer the print preview uses), plus a Share button */
const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';
const loadPdfJs = () => (window.pdfjsLib ? Promise.resolve(window.pdfjsLib) : new Promise((res, rej) => {
  const sc = document.createElement('script'); sc.src = `${PDFJS}pdf.min.js`;
  sc.onload = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = `${PDFJS}pdf.worker.min.js`; res(window.pdfjsLib); };
  sc.onerror = () => rej(new Error('no viewer'));
  document.head.appendChild(sc);
}));
const MAYBE_PDF = /^blob:|\.pdf($|[#?])|\/download\/|render-attachment|inline=1/i;
async function showPdf(fr) {
  const src = fr.getAttribute('src') || '';
  if (fr.dataset.phPdf === src) return;
  fr.dataset.phPdf = src;
  const old = fr.nextElementSibling; if (old && old.classList.contains('ph-pdf')) old.remove();
  if (!src || !MAYBE_PDF.test(src)) { fr.style.display = ''; return; }
  let data;
  try {
    data = new Uint8Array(await (await fetch(src.split('#')[0])).arrayBuffer());
    if (String.fromCharCode(data[0], data[1], data[2], data[3]) !== '%PDF') return;   // not a PDF: leave it as it is
  } catch { return; }
  if (fr.dataset.phPdf !== src) return;   // changed meanwhile
  const name = `${(fr.getAttribute('title') || 'document').replace(/\.pdf$/i, '')}.pdf`;
  const box = document.createElement('div'); box.className = 'ph-pdf';
  const bar = document.createElement('div'); bar.className = 'ph-pdf-bar';
  const share = document.createElement('button'); share.type = 'button'; share.textContent = 'Share PDF';
  share.onclick = async () => toParent({ type: 'erp-file', name, mime: 'application/pdf', b64: await blobToB64(new Blob([data], { type: 'application/pdf' })) });
  const note = document.createElement('span'); note.textContent = 'Opening…';
  bar.append(note, share); box.append(bar);
  fr.style.display = 'none'; fr.after(box);
  try {
    const lib = await loadPdfJs();
    const doc = await lib.getDocument({ data: data.slice() }).promise;
    note.textContent = `${doc.numPages} page${doc.numPages > 1 ? 's' : ''}`;
    const W = Math.max(200, (box.clientWidth || window.innerWidth) - 16), dpr = Math.min(2.5, window.devicePixelRatio || 1);
    for (let n = 1; n <= doc.numPages; n++) {
      if (!box.isConnected) return;
      const page = await doc.getPage(n);   // eslint-disable-line no-await-in-loop
      const vp = page.getViewport({ scale: (W / page.getViewport({ scale: 1 }).width) * dpr });
      const c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height; c.style.width = `${W}px`;
      box.appendChild(c);
      await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;   // eslint-disable-line no-await-in-loop
    }
  } catch { note.textContent = 'Could not show this PDF here — use Share PDF to open it in another app.'; }
}

/* the pop-up on top (print preview, PDF viewer, picker, form…) — the app's back key closes it first */
function topLayer() {
  const W = window.innerWidth, H = window.innerHeight;
  const cands = [...document.querySelectorAll('.cpv-ov, .cpv, [role="dialog"], [aria-modal="true"], .ph-pop, body *')]
    .filter((el, i, a) => a.indexOf(el) === i);
  let top = null;
  for (const el of cands) {
    if (el.closest('.bx-side, .bx-top') || /(^|\s)bx(\s|-|$)/.test(el.className) || el.querySelector('.bx-body')) continue;   // the page frame itself
    const named = el.matches('.cpv-ov, .cpv, [role="dialog"], [aria-modal="true"], .ph-pop');
    if (!named) {
      const cs = getComputedStyle(el);
      if (cs.position !== 'fixed' || cs.display === 'none' || cs.visibility === 'hidden') continue;
      const r = el.getBoundingClientRect();
      if (r.width < W * 0.6 || r.height < H * 0.5) continue;
    } else if (!el.getClientRects().length) continue;
    top = el;   // the last one in the page is the one on top
  }
  return top;
}
function closeLayer(el) {
  // the outermost fixed layer (the dark backdrop) around it
  let outer = el.closest('.cpv-ov') || el;
  for (let a = outer.parentElement; a && a !== document.body; a = a.parentElement) if (getComputedStyle(a).position === 'fixed' && !a.querySelector('.bx-body')) outer = a;
  const btn = [...outer.querySelectorAll('button, [role="button"]')].find(b => b.matches('[data-a="close"], [aria-label="Close" i], [aria-label^="Close" i]') || /^(×|✕|close|cancel)$/i.test(b.textContent.trim()));
  if (btn && !btn.disabled) { btn.click(); return; }
  // a tap on the dark backdrop closes most pop-ups; Escape the rest
  outer.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  outer.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  const esc = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
  (outer.querySelector('input, button, [tabindex]') || outer).dispatchEvent(esc);
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
}

/* the phone layout: looks at what the page draws and marks it with the classes above */
const FORM = 'input:not([type="checkbox"]):not([type="radio"]):not([type="hidden"]), select, textarea';
function headLabels(table) {
  const head = table.tHead && table.tHead.rows[table.tHead.rows.length - 1];
  if (!head) return null;
  const out = [];
  // textContent, not innerText: innerText makes the browser measure the page every time (slow on phones)
  [...head.cells].forEach(c => { const t = c.textContent.replace(/\s+/g, ' ').trim(); for (let i = 0; i < (c.colSpan || 1); i++) out.push(t); });
  return out;
}
const CTRL = 'input, select, textarea, button, img, svg';
function phoneTable(t) {
  if (t.closest('.cpv, .cpv-ov') || t.dataset.ph === 'skip') return;
  if (!t.dataset.phKind) {
    const kv = /kv|tot/.test(t.className) || (!t.tHead && [...t.rows].some(r => r.cells[0] && r.cells[0].tagName === 'TH'));
    const labels = kv ? null : headLabels(t);
    const cols = labels ? labels.length : Math.max(0, ...[...t.rows].slice(0, 5).map(r => r.cells.length));
    t.dataset.phKind = kv ? 'kv' : cols < 3 ? 'plain' : 'cards';
    if (kv) t.classList.add('ph-kv');
    if (t.dataset.phKind === 'cards') { t.classList.add('ph-cards'); if (t.parentElement) t.parentElement.classList.add('ph-scroll'); }
  }
  if (t.dataset.phKind !== 'cards') return;
  const labels = headLabels(t);
  // one record = one tbody (several product rows) → the tbody is the card
  if (t.tBodies.length > 1) t.classList.add('ph-groups');
  [...t.tBodies, ...(t.tFoot ? [t.tFoot] : [])].forEach(b => {
    const sig = [...b.rows].map(r => r.cells.length).join(',');
    if (b.dataset.phDone === sig) return;
    b.dataset.phDone = sig;
    // column of each cell, allowing for cells of earlier rows that span down (rowSpan)
    const busy = [];   // busy[col] = rows still covered
    [...b.rows].forEach((r, ri) => {
      r.dataset.phDone = '1';
      let col = 0;
      [...r.cells].forEach(c => {
        while (busy[col] > 0) col++;
        const lab = (labels && labels[col]) || '';
        const span = c.colSpan || 1;
        for (let k = 0; k < span; k++) busy[col + k] = Math.max(busy[col + k] || 0, (c.rowSpan || 1));
        col += span;
        const named = !!lab && span < 3;
        if (named) c.dataset.label = lab;
        // only DOM reads that need no layout (textContent, querySelector), then class changes
        const field = !!c.querySelector(FORM);
        const empty = !field && !c.querySelector(CTRL) && !c.textContent.trim();
        c.className = [...c.classList].filter(x => !/^ph-(nolabel|empty|stack)$/.test(x)).concat(named ? [] : ['ph-nolabel'], empty ? ['ph-empty'] : [], field ? ['ph-stack'] : []).join(' ');
      });
      for (let k = 0; k < busy.length; k++) if (busy[k] > 0) busy[k]--;
      r.classList.toggle('ph-more', ri > 0);
    });
  });
}
function phoneLayout(root) {
  root.querySelectorAll('iframe').forEach(fr => { if (fr.dataset.phPdf !== (fr.getAttribute('src') || '')) showPdf(fr); });
  root.querySelectorAll('table').forEach(phoneTable);
  const W = window.innerWidth;
  // 1) measure everything new, 2) then change classes — mixing the two makes the phone re-measure the page each time
  const els = [...root.querySelectorAll('div:not([data-ph-seen]), form:not([data-ph-seen]), section:not([data-ph-seen]), fieldset:not([data-ph-seen])')]
    .filter(el => !el.closest('.cpv, .cpv-ov, table.ph-cards'));
  const todo = els.map(el => {
    const cs = getComputedStyle(el), add = [];
    const bx = /(^|\s)bx/.test(el.className);
    if (cs.display === 'grid' || cs.display === 'inline-grid') {
      const n = cs.gridTemplateColumns.split(' ').filter(Boolean).length;
      if (n > 1 && el.querySelector(FORM)) add.push('ph-1');
      else if (n > 2 && !bx && el.scrollWidth > el.clientWidth + 4) add.push('ph-fit');
    } else if ((cs.display === 'flex' || cs.display === 'inline-flex') && cs.flexDirection.startsWith('row') && !bx
      && el.offsetHeight < 160 && el.scrollWidth > el.clientWidth + 4) add.push('ph-wrap');   // a row of fields/buttons, not the page frame
    if (!bx && cs.position !== 'fixed' && el.offsetWidth > W + 2) add.push('ph-full');
    if (cs.position === 'fixed' && el.offsetWidth > W * 0.7 && el.offsetHeight > 120 && el.querySelector('button')) add.push('ph-pop');
    return [el, add];
  });
  todo.forEach(([el, add]) => { if (add.length) el.classList.add(...add); el.dataset.phSeen = '1'; });
}
/* desktop words → phone words in hints and placeholders ("Click to select" → "Tap to select") */
const WORDS = [[/\bdouble-click/gi, 'double-tap'], [/\bDouble-click/g, 'Double-tap'], [/\bClick\b/g, 'Tap'], [/\bclick\b/g, 'tap'], [/\bclicks\b/g, 'taps']];
const toPhone = t => WORDS.reduce((x, [a, b]) => x.replace(a, b), t);
function phoneWords(node) {
  if (!node || node.nodeType !== 1 || node.closest('.cpv, .cpv-ov')) return;
  const w = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, { acceptNode: n => (/click/i.test(n.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT) });
  const hits = []; for (let n = w.nextNode(); n; n = w.nextNode()) hits.push(n);
  hits.forEach(n => { if (!n.parentElement || !n.parentElement.closest('textarea, [contenteditable]')) n.nodeValue = toPhone(n.nodeValue); });
  [node, ...node.querySelectorAll('[placeholder*="lick"], [title*="lick"]')].forEach(el => {
    if (el.placeholder && /click/i.test(el.placeholder)) el.placeholder = toPhone(el.placeholder);
    if (el.title && /click/i.test(el.title)) el.title = toPhone(el.title);
  });
}
function startPhoneLayout() {
  let q = false;
  const run = () => {
    q = false;
    try { phoneLayout(document.body); } catch { /* layout helper only */ }
    try { const list = [...fresh]; fresh.clear(); list.forEach(phoneWords); } catch { /* wording only */ }
  };
  const ask = () => { if (!q) { q = true; requestAnimationFrame(run); } };
  const fresh = new Set();
  new MutationObserver(muts => {
    muts.forEach(m => { m.addedNodes.forEach(n => fresh.add(n.nodeType === 3 ? n.parentElement : n)); if (m.type === 'characterData' && m.target.parentElement) fresh.add(m.target.parentElement); });
    // a row or field re-drawn: look at it again
    muts.forEach(m => { if (m.target.nodeType === 1 && m.target.dataset && m.target.dataset.phSeen) delete m.target.dataset.phSeen; });
    ask();
  }).observe(document.body, { childList: true, subtree: true, characterData: true });
  fresh.add(document.body);
  window.addEventListener('resize', ask);
  ask();
}

export function initAppBridge() {
  readHash();
  if (!isAppMode() || window.parent === window) return;
  document.documentElement.classList.add('erp-app');
  // inside the app the browser does not send the login cookie, so requests the page makes itself (logos, files,
  // print pages) get the login added here — only for this ERP's own /api addresses
  const f0 = window.fetch.bind(window);
  window.fetch = (input, init = {}) => {
    try {
      const u = new URL(typeof input === 'string' ? input : input.url, window.location.href);
      const t = sessionStorage.getItem('erp_token');
      if (t && u.origin === window.location.origin && u.pathname.startsWith('/api/')) {
        const h = new Headers(init.headers || (typeof input === 'string' ? undefined : input.headers));
        if (!h.has('Authorization')) h.set('Authorization', `Bearer ${t}`);
        return f0(input, { ...init, headers: h });
      }
    } catch { /* not a normal address */ }
    return f0(input, init);
  };
  const st = document.createElement('style'); st.textContent = APP_CSS; document.head.appendChild(st);
  // how much a 960 px wide A4 preview is shrunk to fit (the page zoom is taken into account)
  const fit = () => { const z = parseFloat(document.documentElement.style.zoom) || 1; document.documentElement.style.setProperty('--app-k', String(Math.min(1, window.innerWidth / z / 960))); };
  fit(); window.addEventListener('resize', fit); setTimeout(fit, 500);
  if (document.body) startPhoneLayout(); else document.addEventListener('DOMContentLoaded', startPhoneLayout);

  // "open in a new tab" cannot work inside the app: this ERP's files (blob / /api) go to the app to share or open
  const open0 = window.open;
  window.open = function appOpen(url, ...rest) {
    try {
      const u = new URL(String(url || ''), window.location.href);
      if (u.protocol === 'blob:' || (u.origin === window.location.origin && u.pathname.startsWith('/api/'))) {
        const name = decodeURIComponent(u.pathname.split('/').pop() || 'document').replace(/^[0-9a-f-]{20,}$/i, 'document');
        sendFile(u.href, /\.[a-z0-9]{2,5}$/i.test(name) ? name : `${name}.pdf`);
        return null;
      }
    } catch { /* not a normal address */ }
    return open0.call(window, url, ...rest);
  };

  // downloads made in code: a.click() on an <a download>
  const click = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function appClick() {
    if (this.hasAttribute('download') && this.href) { sendFile(this.href, this.getAttribute('download')); return; }
    return click.call(this);
  };
  // downloads the user taps
  document.addEventListener('click', e => {
    const a = e.target.closest && e.target.closest('a[download]');
    if (a && a.href) { e.preventDefault(); sendFile(a.href, a.getAttribute('download')); }
  }, true);
  // the server ended the login (restart, or 8 hours unused): ask the app to sign in again, then repeat the request once
  let asking = null;
  const askToken = () => asking || (asking = new Promise(res => {
    const on = e => { if (e.data && e.data.type === 'erp-token') { window.removeEventListener('message', on); clearTimeout(t); res(e.data.t || ''); } };
    const t = setTimeout(() => { window.removeEventListener('message', on); res(''); }, 10000);
    window.addEventListener('message', on);
    toParent({ type: 'erp-relogin' });
  }).finally(() => { setTimeout(() => { asking = null; }, 0); }));
  axios.interceptors.response.use(null, async err => {
    const cfg = err && err.config;
    if (err && err.response && err.response.status === 401 && cfg && !cfg.appRetry && !/\/api\/(auth|vendor-portal)\//.test(cfg.url || '')) {
      const t = await askToken();
      if (t) {
        try { sessionStorage.setItem('erp_token', t); } catch { /* storage blocked */ }
        cfg.appRetry = true; cfg.headers = { ...(cfg.headers || {}), Authorization: `Bearer ${t}` };
        return axios(cfg);
      }
    }
    throw err;
  });

  // the app keeps this page loaded and asks for another ERP page: open it at once (no reload)
  let base = 0;   // history position of the page the app opened; ‹ never goes back past it
  const idx = () => (window.history.state && window.history.state.idx) || 0;
  window.addEventListener('message', e => {
    const d = e.data || {};
    if (d.type === 'erp-go' && d.path) {
      try { if (d.t) sessionStorage.setItem('erp_token', d.t); } catch { /* storage blocked */ }
      const go = () => {
        if (!window.__erpNav) { setTimeout(go, 100); return; }
        window.__erpNav(d.path, { state: { app: Date.now() } });
        setTimeout(() => { base = idx(); const b = document.querySelector('.bx-body'); if (b) b.scrollTop = 0; window.scrollTo(0, 0); }, 0);
      };
      go();
      return;
    }
    if (d.type === 'erp-back') {
      const open = topLayer();
      if (open) { toParent({ type: 'erp-back-ok' }); closeLayer(open); return; }
      if (idx() > base) { toParent({ type: 'erp-back-ok' }); window.history.back(); }
      else toParent({ type: 'erp-close' });
    }
  });
  // tell the app which page is open (for its title bar)
  const report = () => toParent({ type: 'erp-page', path: window.location.pathname + window.location.search, title: document.title });
  const push = window.history.pushState; const rep = window.history.replaceState;
  window.history.pushState = function p(...a) { const r = push.apply(this, a); setTimeout(report, 50); return r; };
  window.history.replaceState = function p(...a) { const r = rep.apply(this, a); setTimeout(report, 50); return r; };
  window.addEventListener('popstate', () => setTimeout(report, 50));
  setTimeout(report, 300);
  toParent({ type: 'erp-ready' });
}

/* inside the router: lets the app open pages without reloading (does nothing on the desktop) */
export function AppNav() {
  const nav = useNavigate();
  useEffect(() => { if (isAppMode()) { window.__erpNav = nav; toParent({ type: 'erp-ready' }); } }, [nav]);
  return null;
}
