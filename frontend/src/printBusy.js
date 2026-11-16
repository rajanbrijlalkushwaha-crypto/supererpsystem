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
    if (!b || b.disabled || b.closest('#cpv-root')) return;   // buttons inside the open preview have their own progress
    const t = (b.textContent || '').trim();
    if (!/print/i.test(t) || /▾|▼/.test(t) || b.getAttribute('aria-haspopup')) return;
    printBusyStart();
  }, true);
}
