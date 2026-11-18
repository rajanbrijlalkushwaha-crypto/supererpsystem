/* "Preparing to print…" — a Windows 7 style progress window shown from the moment a Print button is clicked until
 * the print preview opens. The bar moves as the data the print needs arrives (each request the page makes).
 * Installed once from index.js; printKit's openPreview calls printBusyDone(). */
import axios from 'axios';

let box = null, started = 0, done = 0, quietTimer = null, maxTimer = null, active = false;

const CSS = `
#pb-ov{position:fixed;inset:0;z-index:2147483000;background:rgba(0,0,0,.18);display:flex;align-items:center;justify-content:center;font:13px "Segoe UI",Inter,Tahoma,sans-serif}
#pb-ov .w{width:380px;max-width:calc(100vw - 32px);background:#f0f0f0;border:1px solid #6b7a8f;border-radius:6px;box-shadow:0 8px 28px rgba(0,0,0,.35);overflow:hidden}
#pb-ov .t{background:linear-gradient(#dbe8f7,#c2d6ee);padding:7px 12px;border-bottom:1px solid #9fb3cc;color:#1e2b3c;font-weight:600}
#pb-ov .b{padding:16px 16px 14px;color:#1e2b3c}
#pb-ov .b p{margin:0 0 10px}
#pb-ov .bar{position:relative;height:18px;border:1px solid #8e8f8f;border-radius:3px;background:linear-gradient(#e6e6e6,#f7f7f7);overflow:hidden}
#pb-ov .fill{position:absolute;left:0;top:0;bottom:0;width:0;background:linear-gradient(#a7f0a0 0%,#3fc43a 45%,#28a923 55%,#5cd457 100%);transition:width .35s ease}
#pb-ov .fill:after{content:"";position:absolute;inset:0;width:80px;background:linear-gradient(90deg,transparent,rgba(255,255,255,.65),transparent);animation:pb-glint 1.6s linear infinite}
@keyframes pb-glint{from{transform:translateX(-80px)}to{transform:translateX(400px)}}
#pb-ov small{display:block;margin-top:8px;color:#4a5566}
#pb-ov .opts{display:flex;flex-direction:column;gap:7px;margin:4px 0 2px}
#pb-ov .opts button{display:flex;flex-direction:column;align-items:flex-start;text-align:left;padding:8px 12px;border:1px solid #8e9bb0;border-radius:4px;background:linear-gradient(#fdfdfd,#e8ecf2);color:#1e2b3c;font:600 13px "Segoe UI",Inter,Tahoma,sans-serif;cursor:pointer}
#pb-ov .opts button small{margin:2px 0 0;font-weight:400;font-size:11.5px}
#pb-ov .opts button:hover,#pb-ov .opts button:focus-visible{border-color:#3c7fb1;background:linear-gradient(#eaf6fd,#cfe8f9);outline:none}
#pb-ov .ft{display:flex;justify-content:flex-end;margin-top:10px}
#pb-ov .ft button{min-width:80px;padding:4px 14px;border:1px solid #8e9bb0;border-radius:3px;background:linear-gradient(#fdfdfd,#e3e7ee);font:13px "Segoe UI",Inter,Tahoma,sans-serif;cursor:pointer}
@media (prefers-reduced-motion:reduce){#pb-ov .fill:after{animation:none}}`;

function paint(text) {
  if (!box) return;
  const pct = active ? Math.min(95, 12 + (started ? (done / started) * 80 : 0)) : 100;
  box.querySelector('.fill').style.width = `${pct}%`;
  if (text) box.querySelector('small').textContent = text;
  else box.querySelector('small').textContent = started ? `Getting the document… ${done} of ${started}` : 'Getting the document…';
}

export function printBusyStart(title = 'Preparing to print') {
  if (!document.getElementById('pb-css')) { const s = document.createElement('style'); s.id = 'pb-css'; s.textContent = CSS; document.head.appendChild(s); }
  printBusyDone();
  active = true; started = 0; done = 0;
  box = document.createElement('div'); box.id = 'pb-ov';
  box.innerHTML = `<div class="w" role="progressbar" aria-label="${title}"><div class="t">${title}</div><div class="b"><p>Please wait — the print window will open.</p><div class="bar"><div class="fill"></div></div><small></small></div></div>`;
  document.body.appendChild(box);
  requestAnimationFrame(() => paint());
  // nothing to wait for (the click only opened a menu, or printing failed with a message) → go away by itself
  armQuiet();
  maxTimer = setTimeout(printBusyDone, 180000);
}

/* "What to print?" in the same window: options [{ value, label, hint }] → resolves the value picked (null = Cancel).
   The caller then calls printBusyStart(title) and the window turns into the progress bar. */
export function printChoose({ title = 'Print', text = 'What do you want to print?', options = [] }) {
  if (!document.getElementById('pb-css')) { const s = document.createElement('style'); s.id = 'pb-css'; s.textContent = CSS; document.head.appendChild(s); }
  printBusyDone();
  const esc = v => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  return new Promise(resolve => {
    const ov = document.createElement('div'); ov.id = 'pb-ov'; ov.dataset.choose = '1';
    ov.innerHTML = `<div class="w" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="t">${esc(title)}</div><div class="b"><p>${esc(text)}</p>
      <div class="opts">${options.map((o, i) => `<button type="button" data-i="${i}">${esc(o.label)}${o.hint ? `<small>${esc(o.hint)}</small>` : ''}</button>`).join('')}</div>
      <div class="ft"><button type="button" data-i="-1">Cancel</button></div></div></div>`;
    const end = v => { ov.remove(); document.removeEventListener('keydown', key, true); resolve(v); };
    const key = e => { if (e.key === 'Escape') { e.stopPropagation(); end(null); } };
    ov.addEventListener('click', e => { const b = e.target.closest('button[data-i]'); if (b) end(+b.dataset.i < 0 ? null : options[+b.dataset.i].value); else if (e.target === ov) end(null); });
    document.addEventListener('keydown', key, true);
    document.body.appendChild(ov);
    ov.querySelector('.opts button')?.focus();
  });
}

function armQuiet() {
  clearTimeout(quietTimer);
  quietTimer = setTimeout(() => { if (active && done >= started) printBusyDone(); }, 2500);
}

export function printBusyDone() {
  active = false;
  clearTimeout(quietTimer); clearTimeout(maxTimer);
  if (box) { const b = box; box = null; paint(); b.remove(); }
}

/* the print preview / alert appeared → close; a Print button clicked → open */
export function installPrintBusy() {
  axios.interceptors.request.use(cfg => { if (active) { started += 1; clearTimeout(quietTimer); paint(); } return cfg; });
  const end = () => { if (active) { done += 1; paint(); if (done >= started) armQuiet(); } };
  axios.interceptors.response.use(r => { end(); return r; }, e => { end(); return Promise.reject(e); });
  const f0 = window.fetch;   // older pages fetch the logo / files with fetch()
  window.fetch = (...a) => {
    if (!active) return f0.apply(window, a);
    started += 1; clearTimeout(quietTimer); paint();
    return f0.apply(window, a).finally(end);
  };
  ['alert', 'confirm'].forEach(k => { const o = window[k]; window[k] = (...a) => { printBusyDone(); return o.apply(window, a); }; });

  document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('button, [role="menuitem"], a');
    if (!b || b.disabled || b.closest('#cpv-root, #pb-ov')) return;   // buttons inside the open preview have their own progress
    const t = (b.textContent || '').trim();
    if (!/print/i.test(t) || /▾|▼/.test(t) || b.getAttribute('aria-haspopup')) return;
    printBusyStart();
  }, true);
}
