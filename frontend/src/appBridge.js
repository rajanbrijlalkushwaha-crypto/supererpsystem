import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
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
/* print preview: full screen, the A4 page shrunk to the phone width */
.cpv { width:calc(100vw / var(--ui-zoom, 1)) !important; height:calc(100vh / var(--ui-zoom, 1)) !important; border-radius:0 !important; }
.cpv-bar { flex-wrap:wrap; }
.cpv-main { overflow:hidden !important; }
.cpv-main > iframe { flex:none !important; width:960px !important; height:calc(100% / var(--app-k, 1)) !important; transform:scale(var(--app-k, 1)); transform-origin:0 0; }
`;

/* the phone layout: looks at what the page draws and marks it with the classes above */
const FORM = 'input:not([type="checkbox"]):not([type="radio"]):not([type="hidden"]), select, textarea';
function headLabels(table) {
  const head = table.tHead && table.tHead.rows[table.tHead.rows.length - 1];
  if (!head) return null;
  const out = [];
  [...head.cells].forEach(c => { const t = c.innerText.replace(/\s+/g, ' ').trim(); for (let i = 0; i < (c.colSpan || 1); i++) out.push(t); });
  return out;
}
function phoneTable(t) {
  if (t.closest('.cpv, .cpv-ov') || t.dataset.ph === 'skip') return;
  const kv = /kv|tot/.test(t.className) || (!t.tHead && [...t.rows].some(r => r.cells[0] && r.cells[0].tagName === 'TH'));
  if (kv) { t.classList.add('ph-kv'); return; }
  const labels = headLabels(t);
  const cols = labels ? labels.length : Math.max(0, ...[...t.rows].map(r => r.cells.length));
  if (cols < 3) return;
  t.classList.add('ph-cards');
  const par = t.parentElement; if (par) par.classList.add('ph-scroll');
  [...t.tBodies, ...(t.tFoot ? [t.tFoot] : [])].forEach(b => [...b.rows].forEach(r => {
    if (r.dataset.phDone === String(r.cells.length)) return;
    r.dataset.phDone = String(r.cells.length);
    let i = 0;
    [...r.cells].forEach(c => {
      const lab = (labels && labels[i]) || '';
      i += c.colSpan || 1;
      if (lab && c.colSpan < 3) { c.dataset.label = lab; c.classList.remove('ph-nolabel'); } else c.classList.add('ph-nolabel');
      const empty = !c.querySelector('input, select, textarea, button, img, svg') && !c.innerText.trim();
      c.classList.toggle('ph-empty', empty);
      c.classList.toggle('ph-stack', !!c.querySelector(FORM));   // a field: its name above it, full width
    });
  }));
}
function phoneLayout(root) {
  root.querySelectorAll('table').forEach(phoneTable);
  const W = window.innerWidth;
  root.querySelectorAll('div, form, section, fieldset').forEach(el => {
    if (el.closest('.cpv, .cpv-ov') || el.dataset.phSeen) return;
    const cs = getComputedStyle(el);
    if (cs.display === 'grid' || cs.display === 'inline-grid') {
      const n = cs.gridTemplateColumns.split(' ').filter(Boolean).length;
      if (n > 1 && el.querySelector(FORM)) el.classList.add('ph-1');
      else if (n > 2 && el.scrollWidth > el.clientWidth + 4 && !/(^|\s)bx/.test(el.className)) el.classList.add('ph-fit');   // a strip of totals → tiles that wrap
    } else if ((cs.display === 'flex' || cs.display === 'inline-flex') && cs.flexDirection.startsWith('row') && el.offsetHeight < 160
      && !/(^|\s)bx/.test(el.className) && el.scrollWidth > el.clientWidth + 4) el.classList.add('ph-wrap');   // a row of fields/buttons, not the page frame
    if (el.offsetWidth > W + 2 && cs.position !== 'fixed' && !/(^|\s)bx/.test(el.className)) el.classList.add('ph-full');
    if (cs.position === 'fixed' && el.offsetWidth > W * 0.7 && el.offsetHeight > 120 && el.querySelector('button')) el.classList.add('ph-pop');
    el.dataset.phSeen = '1';
  });
}
function startPhoneLayout() {
  let q = false;
  const run = () => { q = false; try { phoneLayout(document.body); } catch { /* layout helper only */ } };
  const ask = () => { if (!q) { q = true; requestAnimationFrame(run); } };
  new MutationObserver(muts => {
    // a row or field re-drawn: look at it again
    muts.forEach(m => m.target.nodeType === 1 && m.target.closest && m.target.closest('[data-ph-seen]') && m.target.querySelectorAll && [m.target, ...m.target.querySelectorAll('[data-ph-seen]')].forEach(x => { if (x.dataset) delete x.dataset.phSeen; }));
    ask();
  }).observe(document.body, { childList: true, subtree: true });
  window.addEventListener('resize', ask);
  ask();
}

export function initAppBridge() {
  readHash();
  if (!isAppMode() || window.parent === window) return;
  document.documentElement.classList.add('erp-app');
  const st = document.createElement('style'); st.textContent = APP_CSS; document.head.appendChild(st);
  // how much a 960 px wide A4 preview is shrunk to fit (the page zoom is taken into account)
  const fit = () => { const z = parseFloat(document.documentElement.style.zoom) || 1; document.documentElement.style.setProperty('--app-k', String(Math.min(1, window.innerWidth / z / 960))); };
  fit(); window.addEventListener('resize', fit); setTimeout(fit, 500);
  if (document.body) startPhoneLayout(); else document.addEventListener('DOMContentLoaded', startPhoneLayout);

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
      const open = document.querySelector('.cpv-ov, .cpv, [role="dialog"]');
      if (open) { toParent({ type: 'erp-back-ok' }); const x = open.querySelector('[data-a="close"], [aria-label="Close"]'); if (x) x.click(); else document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); return; }
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
