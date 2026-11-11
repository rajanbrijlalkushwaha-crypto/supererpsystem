/* printKit.js — the print preview (Save PDF / Print / Close) used by the BG and Warranty prints.
 *  openPreview(title, { html } | { pdfUrl, fileName })   previewPdf(blob, title)   logoData(company) */
import axios from 'axios';

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
.cpv iframe { flex:1; border:0; width:100%; background:#E4E7EC; }`;
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

/* opts: { html } for a page, or { pdfUrl, fileName } for a ready PDF */
export function openPreview(title, opts) {
  document.getElementById('cpv-root')?.remove();
  if (!document.getElementById('cpv-css')) { const s = document.createElement('style'); s.id = 'cpv-css'; s.textContent = PV_CSS; document.head.appendChild(s); }
  const ov = document.createElement('div'); ov.id = 'cpv-root'; ov.className = 'cpv-ov';
  ov.innerHTML = `<div class="cpv" role="dialog" aria-modal="true" aria-label="Print preview"><div class="cpv-bar"><b></b>
    <button type="button" data-a="save">Save PDF</button><button type="button" class="pri" data-a="print">Print</button><button type="button" class="x" data-a="close" aria-label="Close">×</button></div>
    <iframe title="Preview"></iframe></div>`;
  ov.querySelector('b').textContent = title || titleOf(opts.html);
  document.body.appendChild(ov);
  const fr = ov.querySelector('iframe'), box = ov.querySelector('.cpv');
  if (opts.html) {
    fr.onload = () => {
      try {
        const d = fr.contentDocument, land = /size:\s*A4\s+landscape/i.test(opts.html), st = d.createElement('style');
        st.textContent = sheetCss(land); d.head.appendChild(st);
        if (!land) setTimeout(() => fillPages(d), 60);   // after the fonts / logo are laid out
      } catch { /* shown as is */ }
    };
    fr.srcdoc = opts.html;
  } else fr.src = opts.pdfUrl;
  const msg = t => { let m = ov.querySelector('.cpv-msg'); if (!m) { m = document.createElement('div'); m.className = 'cpv-msg'; box.insertBefore(m, fr); } m.textContent = t; };
  const close = () => { ov.remove(); document.removeEventListener('keydown', key); if (opts.pdfUrl) URL.revokeObjectURL(opts.pdfUrl); };
  const key = e => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', key);
  ov.addEventListener('mousedown', e => { if (e.target === ov) close(); });
  ov.addEventListener('click', async e => {
    const a = e.target.closest('button')?.dataset.a;
    if (a === 'close') close();
    if (a === 'print') { fr.contentWindow.focus(); fr.contentWindow.print(); }
    if (a === 'save') {
      const name = opts.fileName || fileName(ov.querySelector('b').textContent);
      if (opts.pdfUrl) { saveBlob(await (await fetch(opts.pdfUrl)).blob(), name); return; }
      const btn = e.target; btn.disabled = true; btn.textContent = 'Making PDF…';
      try {
        let html = opts.html;
        try { html = '<!DOCTYPE html>' + fr.contentDocument.documentElement.outerHTML; } catch { /* the page as sent */ }
        const r = await axios.post('/api/print-merge', { htmls: [html] }, { responseType: 'blob' });
        saveBlob(r.data, name);
      } catch {
        msg('Could not make the PDF here — in the print window choose "Save as PDF" as the printer.');
        fr.contentWindow.focus(); fr.contentWindow.print();
      } finally { btn.disabled = false; btn.textContent = 'Save PDF'; }
    }
  });
}

/* a hidden print frame that is already laid out (fill rows sized) → preview it */
export function previewFrame(fr, title) {
  const doc = fr.contentWindow.document;
  const html = '<!DOCTYPE html>' + doc.documentElement.outerHTML;
  fr.remove();
  openPreview(title || doc.title, { html });
}
export function previewHtml(html, title) { openPreview(title, { html }); }
export function previewPdf(blob, title, name) {
  const url = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
  openPreview(title, { pdfUrl: url, fileName: name || fileName(title) });
}
