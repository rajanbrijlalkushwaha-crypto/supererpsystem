/* "Print list" for every list page: prints the list that is on screen now — after the search, year and status
 * filters — as a plain bordered A4 table (black and white), with the company, the page name, the filter and the
 * count. Works on any page: it finds the page's main list table itself. */
import { previewHtml } from './printKit';

const esc = v => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dmy = d => `${String(d.getDate()).padStart(2, '0')}-${MON[d.getMonth()]}-${d.getFullYear()}`;
const clean = t => String(t || '').replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();
/* a cell's text: as shown — or, for rows not drawn yet (off screen in the app), from the page itself */
const textOf = el => clean(el.innerText) || clean([...el.childNodes].map(n => n.textContent).join('\n'));

/* the page's list: the biggest visible table with a header and rows — not a form, not a pop-up */
export function findListTable(root = document.querySelector('.bx-body') || document.body) {
  let best = null, bestRows = 0;
  root.querySelectorAll('table').forEach(t => {
    if (t.closest('.sf, .so, .cpv, .cpv-ov, [role="dialog"], form') || !t.tHead || !t.getClientRects().length) return;
    const head = t.tHead.rows[t.tHead.rows.length - 1];
    if (!head || head.cells.length < 3) return;
    const rows = [...t.tBodies].reduce((s, b) => s + b.rows.length, 0);
    if (rows > bestRows) { best = t; bestRows = rows; }
  });
  return best;
}

/* the page's name: the open tab, else its heading */
function pageTitle() {
  const tab = document.querySelector('.bx-body [role="tab"][aria-selected="true"], .bx-body .sb-tab.on, .bx-body [class$="-tab"].on');
  const h = document.querySelector('.bx-body h1');
  const nav = document.querySelector('.bx-side .bx-i.cur') || document.querySelector('.bx-side .bx-g.on');
  return clean((tab && tab.textContent.replace(/\d+\s*$/, '')) || (h && h.textContent) || (nav && nav.textContent) || 'List');
}

export function printList({ company, user } = {}) {
  const t = findListTable();
  if (!t) return false;
  const head = t.tHead.rows[t.tHead.rows.length - 1];
  const heads = [];
  [...head.cells].forEach(c => { for (let i = 0; i < (c.colSpan || 1); i++) heads.push(textOf(c)); });
  // rows as shown (one record may be several rows — kept together); empty / tick-box columns are dropped
  const rows = [];
  [...t.tBodies].forEach(b => [...b.rows].forEach(r => {
    if (!r.getClientRects().length) return;
    const cells = []; let col = 0;
    [...r.cells].forEach(c => { cells.push({ col, span: c.colSpan || 1, text: textOf(c), num: /(^|\s)(r|num|amt)(\s|$)/.test(c.className) || getComputedStyle(c).textAlign === 'right' }); col += c.colSpan || 1; });
    const note = cells.length === 1 && cells[0].span >= 3;   // "Nothing matches…" / "No … yet" — not a record
    if (!note && cells.some(c => c.text)) rows.push({ cells, gone: /\bgone\b|\bcx\b/.test(b.className + ' ' + r.className) });
  }));
  if (!rows.length) return false;
  const used = heads.map((h, i) => !!h || rows.some(r => r.cells.some(c => c.col === i && c.text)));
  const keep = heads.map((_, i) => i).filter(i => used[i]);
  const filter = [...document.querySelectorAll('.bx-body .sb-search, .bx-body input[type="search"], .bx-body input[placeholder^="Search"]')].map(i => i.value).filter(Boolean).join(' · ');
  const title = pageTitle();
  const coName = company?.companyName || company?.name || '';
  const by = user?.name || user?.username || '';
  const now = new Date();
  const body = rows.map(r => `<tr${r.gone ? ' class="gone"' : ''}>${r.cells.filter(c => keep.includes(c.col)).map(c => {
    const span = keep.filter(i => i >= c.col && i < c.col + c.span).length;
    return `<td${span > 1 ? ` colspan="${span}"` : ''}${c.num ? ' class="r"' : ''}>${esc(c.text).replace(/\n/g, '<br>')}</td>`;
  }).join('')}</tr>`).join('');
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(title)} — list</title><style>
* { margin:0; padding:0; box-sizing:border-box; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
body { font-family:Arial, Helvetica, sans-serif; font-size:8pt; color:#000; background:#fff; padding:6mm; }
.hd { display:flex; justify-content:space-between; align-items:flex-end; border:1px solid #000; padding:5px 8px; margin-bottom:-1px; }
.hd b { font-size:12pt; } .hd .t { font-size:11pt; font-weight:bold; letter-spacing:1px; text-transform:uppercase; } .hd small { display:block; font-size:7.6pt; }
table { width:100%; border-collapse:collapse; table-layout:auto; }
th, td { border:1px solid #000; padding:3px 4px; vertical-align:top; text-align:left; overflow-wrap:anywhere; word-break:break-word; }
th { font-weight:bold; font-size:7.8pt; }
td.r { text-align:right; }
tr { break-inside:avoid; } thead { display:table-header-group; }
tr.gone td { text-decoration:line-through; color:#555; }
.ft { display:flex; justify-content:space-between; margin-top:4px; font-size:7.4pt; font-weight:bold; }
@media print { @page { size:A4 ${keep.length > 7 ? 'landscape' : 'portrait'}; margin:8mm; } body { padding:0; } }
</style></head><body>
<div class="hd"><div><b>${esc(coName)}</b><small>${filter ? `Filter: ${esc(filter)}` : 'All records shown on the page'}</small></div>
<div style="text-align:right"><div class="t">${esc(title)}</div><small>${rows.length} row${rows.length === 1 ? '' : 's'} · ${dmy(now)}</small></div></div>
<table><thead><tr>${keep.map(i => `<th>${esc(heads[i])}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table>
<div class="ft"><span>Printed by Super ERP System${by ? ` | Printed by : ${esc(by)}` : ''}</span><span>${esc(now.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }))}</span></div>
</body></html>`;
  previewHtml(html, `${title} — list`);
  return true;
}
