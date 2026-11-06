/* Beta — Order page. Top menu: Create SO | Order | Pending.
 * Order tab = every sales order (GET /api/sales-orders, read only), in the client-list format. */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useCompany } from '../../context/CompanyContext';
import { useAuth } from '../../context/AuthContext';
import { can } from '../../utils/permissions';
import { legalNoteHtml } from '../../utils/printFont';
import { brandLine } from '../../utils/printBranding';
import { dash, fmtDate, orderValue, soItems, fmtQty } from './BetaClients';
import BetaCreateSO from './BetaCreateSO';
import OrderPopup, { printInPlace } from './BetaOrderView';
import { Svg } from '../../components/ui/Icon';

/* plain amount: no ₹, no commas, no trailing .00 (paise shown only when there are any) */
const PLAIN_FMT = new Intl.NumberFormat('en-IN', { useGrouping: false, maximumFractionDigits: 2 });   // built once — see fmtDate
const money = n => PLAIN_FMT.format(Number(n) || 0);

const TEAL = '#03444f';
const F = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

const TABS = [
  { key: 'create',  label: 'Create SO' },
  { key: 'list',    label: 'Order' },
  { key: 'pending', label: 'Pending' },
];

/* status → one round letter, as in the client list */
const STATUS = {
  approved:      { label: 'Approved',    short: 'A', bg: '#16A34A' },
  completed:     { label: 'Completed',   short: 'C', bg: '#0E7490' },
  'in-progress': { label: 'In progress', short: 'I', bg: '#2563EB' },
  pending:       { label: 'Pending',     short: 'P', bg: '#F79009' },
  draft:         { label: 'Draft',       short: 'D', bg: '#667085' },
  rejected:      { label: 'Rejected',    short: 'R', bg: '#D92D20' },
  cancelled:     { label: 'Cancelled',   short: 'X', bg: '#B42318' },
};

/* [header, width] — fixed widths so the list fits one screen */
const COLS = [
  ['Order No', '8.5%'], ['Order Date', '5.5%'], ['Client Name', '15%'], ['Customer PO', '10.5%'], ['PO Date', '5.5%'], ['Due Date', '5.5%'],
  ['Product', '19%'], ['Qty', '3.5%'], ['Rate', '6%'], ['GST', '3.5%'], ['Order Value', '7%'], ['Grand Total', '7%'], ['Status', '3%'],
];
/* Indian financial year (April–March) of a date → '2026' for FY 26-27; '' when there is no valid date */
const fyOf = d => {
  const x = d ? new Date(d) : null;
  if (!x || isNaN(x)) return '';
  return String(x.getMonth() >= 3 ? x.getFullYear() : x.getFullYear() - 1);
};
const fyLabel = k => `FY ${String(k).slice(2)}-${String(+k + 1).slice(2)}`;
/* order number series: EPSSO + 2627 (FY) + 091 → { series:'EPSSO2627', fy:'2026', seq:91, width:3 } */
const SERIES_RE = /^([A-Za-z]+)(\d{2})(\d{2})(\d{3,4})$/;
const seriesOf = no => {
  const m = SERIES_RE.exec(String(no || '').trim());
  if (!m || +m[3] !== (+m[2] + 1) % 100) return null;
  return { series: m[1] + m[2] + m[3], fy: `20${m[2]}`, seq: +m[4], width: m[4].length };
};
/* every way a date may be typed in search: 2026-10-19, 19-10-2026, 19/10/2026, 19 Oct 2026 */
const dateForms = d => {
  const x = d ? new Date(d) : null;
  if (!x || isNaN(x)) return '';
  const dd = String(x.getDate()).padStart(2, '0'), mm = String(x.getMonth() + 1).padStart(2, '0'), yy = x.getFullYear();
  return `${String(d)} ${dd}-${mm}-${yy} ${dd}/${mm}/${yy} ${fmtDate(d)}`;
};
/* all searchable text of one order (lower case) */
const searchText = o => [
  o.orderId, o.orderNo, o.customerName, o.party, o.customerCode, o.customerPO, o.status,
  dateForms(o.orderDate), dateForms(o.poDate), dateForms(o.dueDate || o.deliveryDate),
  ...soItems(o).map(it => it.name), o.grandTotal,
].filter(x => x != null && x !== '').join(' ').toLowerCase();

const esc = v => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;');

/* Order list in the Sales Order print format (company header centred, thin black lines, Times New Roman),
   A4 landscape, printed from a hidden frame on this page */
async function printOrderList({ rows, company, user, totValue, totGrand, filter }) {
  const co = company || {};
  let logo = '';
  if (co.logoFileName) {
    try {
      const b = await (await fetch(`/api/companies/logo/${encodeURIComponent(co.logoFileName)}?companyId=${co.companyId}`)).blob();
      logo = await new Promise(r => { const rd = new FileReader(); rd.onload = () => r(rd.result); rd.readAsDataURL(b); });
    } catch { logo = ''; }
  }
  const coAddr = [co.address, co.city, co.state, co.pincode].filter(Boolean).join(', ');
  const coLine = [co.gstin && 'GSTIN: ' + esc(co.gstin), co.phone && 'Ph: ' + esc(co.phone), co.email && 'Email: ' + esc(co.email)].filter(Boolean).join('&nbsp;&nbsp;|&nbsp;&nbsp;');
  const today = new Date().toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  /* dd-mm-yyyy, never wraps */
  const d = v => { const x = v ? new Date(v) : null; return x && !isNaN(x) ? `${String(x.getDate()).padStart(2, '0')}-${String(x.getMonth() + 1).padStart(2, '0')}-${x.getFullYear()}` : ''; };

  const body = rows.map((o, i) => {
    const its = soItems(o);
    const lines = its.length ? its : [null];
    const n = lines.length;
    const st = (STATUS[o.status] || STATUS.draft).label;
    return lines.map((it, j) => '<tr>'
      + (j === 0 ? `<td rowspan="${n}" class="c">${i + 1}</td><td rowspan="${n}" class="nw"><b>${esc(o.orderNo)}</b></td><td rowspan="${n}" class="c nw">${d(o.orderDate)}</td>`
        + `<td rowspan="${n}">${esc(o.customerName || o.party)}</td><td rowspan="${n}">${esc(o.customerPO)}</td>`
        + `<td rowspan="${n}" class="c nw">${d(o.poDate)}</td><td rowspan="${n}" class="c nw">${d(o.dueDate || o.deliveryDate)}</td>` : '')
      + (it ? `<td>${esc(it.name)}</td><td class="r">${esc(fmtQty(it.qty))}${it.unit ? ' ' + esc(it.unit) : ''}</td><td class="r">${money(it.rate)}</td><td class="c">${it.gst ? it.gst + '%' : ''}</td>`
        : '<td colspan="4" class="c">—</td>')
      + (j === 0 ? `<td rowspan="${n}" class="r"><b>${money(orderValue(o))}</b></td><td rowspan="${n}" class="r">${money(o.grandTotal)}</td><td rowspan="${n}" class="c nw">${esc(st)}</td>` : '')
      + '</tr>').join('');
  }).join('');

  /* Every page gets the outer border (a fixed frame repeats on each printed page). The empty first header
     row and the empty footer row repeat on each page too, so the list never touches the frame. */
  const L = 'linear-gradient(#000,#000)', HW = '0.4pt';   // hairline: black, 0.4pt
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Sales Order List</title>
<style>
/* Hairlines: browsers print any CSS border at 1px (0.75pt) minimum, so every line here is a 0.4pt black
   background stripe instead (same weight as a Tally invoice). print-color-adjust makes them always print. */
* { margin:0; padding:0; box-sizing:border-box; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
body { font-family:'Times New Roman', Times, Georgia, serif; font-size:9.5pt; color:#000; background:#fff; }
.frame { position:fixed; top:0; left:0; right:0; bottom:0; pointer-events:none;
  background-image:${L},${L},${L},${L}; background-repeat:no-repeat;
  background-size:100% ${HW},100% ${HW},${HW} 100%,${HW} 100%; background-position:0 0,0 100%,0 0,100% 0; }
.wrap { padding:0 4mm; }
.head { text-align:center; padding:4mm 0 2mm; background:${L} 0 100% / 100% ${HW} no-repeat; }
.title { text-align:center; font-size:13pt; font-weight:bold; padding:4px 0; background:${L} 0 100% / 100% ${HW} no-repeat; }
.meta { display:flex; justify-content:space-between; font-size:9pt; padding:3px 0 5px; }
.lst { width:100%; border-collapse:collapse; font-size:9pt; }
.lst th, .lst td { background-repeat:no-repeat; }
/* every cell draws its right + bottom line; header cells also the top; the first cell of a row also the left */
.lst td { padding:2px 4px; vertical-align:middle;
  background-image:${L},${L}; background-size:100% ${HW},${HW} 100%; background-position:0 100%,100% 0; }
.lst td:first-child { background-image:${L},${L},${L}; background-size:100% ${HW},${HW} 100%,${HW} 100%; background-position:0 100%,100% 0,0 0; }
.lst th { padding:4px 4px; font-weight:bold; text-align:center; white-space:nowrap;
  background-image:${L},${L},${L}; background-size:100% ${HW},${HW} 100%,100% ${HW}; background-position:0 100%,100% 0,0 0; }
.lst th:first-child { background-image:${L},${L},${L},${L}; background-size:100% ${HW},${HW} 100%,100% ${HW},${HW} 100%; background-position:0 100%,100% 0,0 0,0 0; }
.lst tr.gap th, .lst tr.gap td { background:none; padding:0; height:4mm; }
.lst tr.tot td { font-weight:bold; }
.lst .c { text-align:center; } .lst .r { text-align:right; white-space:nowrap; } .lst .nw { white-space:nowrap; }
.foot { display:flex; justify-content:space-between; font-size:8.5pt; color:#444; padding:4px 0; }
@media print {
  @page { margin:8mm; size:A4 landscape; }
  thead { display:table-header-group; } tfoot { display:table-footer-group; }
  tr { page-break-inside:avoid; break-inside:avoid; }
}
</style></head><body>
<div class="frame"></div>
<div class="wrap">
  <div class="head">
    ${logo ? `<img src="${logo}" style="height:44px; max-width:110px; object-fit:contain; display:block; margin:0 auto 4px;">` : ''}
    <div style="font-size:14pt; font-weight:bold;">${esc(co.companyName || co.name)}</div>
    ${coAddr ? `<div style="font-size:9pt;">${esc(coAddr)}</div>` : ''}
    ${coLine ? `<div style="font-size:9pt;">${coLine}</div>` : ''}
  </div>
  <div class="title">Sales Order List</div>
  <div class="meta"><span>${esc(filter)}</span><span>${rows.length} orders</span></div>
  <table class="lst">
    <thead>
      <tr class="gap"><th colspan="14"></th></tr>
      <tr><th style="width:24px">Sr</th><th>Order No</th><th>Order Date</th><th>Client Name</th><th>Customer PO</th><th>PO Date</th><th>Due Date</th>
        <th>Product</th><th>Qty</th><th>Rate</th><th>GST</th><th>Order Value</th><th>Grand Total</th><th>Status</th></tr>
    </thead>
    <tfoot><tr class="gap"><td colspan="14"></td></tr></tfoot>
    <tbody>
      ${body}
      <tr class="tot"><td colspan="11">Total (${rows.length} orders)</td><td class="r">${money(totValue)}</td><td class="r">${money(totGrand)}</td><td></td></tr>
    </tbody>
  </table>
  <div class="foot"><span>${brandLine(user)}</span><span>Printed: ${esc(today)}</span></div>
  ${legalNoteHtml().replace('border-top:1px solid #000', `border-top:0; background:${L} 0 0 / 100% ${HW} no-repeat`)}
</div>
</body></html>`;

  document.getElementById('bo-print-frame')?.remove();
  const fr = document.createElement('iframe');
  fr.id = 'bo-print-frame';
  fr.setAttribute('aria-hidden', 'true');
  fr.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
  document.body.appendChild(fr);
  const w = fr.contentWindow;
  w.document.open(); w.document.write(html); w.document.close();
  setTimeout(() => {
    w.focus();
    w.print();            // waits here until the print dialog is closed
    window.focus();
    setTimeout(() => fr.remove(), 1000);
  }, 300);
}

const RIGHT = ['Qty', 'Rate', 'GST', 'Order Value', 'Grand Total'];
/* table dates are short (31 Jul 26) so they fit their column */
const MON3 = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];   // always 3 letters ("Sep", not "Sept")
const sdate = d => { if (!d) return '—'; const x = new Date(d); return isNaN(x) ? String(d) : `${String(x.getDate()).padStart(2, '0')} ${MON3[x.getMonth()]} ${String(x.getFullYear()).slice(2)}`; };

const CSS = `
.bo { display:flex; flex-direction:column; height:100%; min-height:0; font-family:${F}; }
/* one line: tabs | FY | search | print list | missing nos ……… selected · Edit · Print · Delete — square boxes, full bar height */
.bo-tabs { display:flex; align-items:stretch; height:40px; padding:0; flex-shrink:0; background:#E3EEEF; border-bottom:1px solid #B9D0D3; }
.bo-tab { padding:0 16px; border:0; border-right:1px solid #B9D0D3; border-radius:0; background:#fff; cursor:pointer; white-space:nowrap; flex-shrink:0;
  display:flex; align-items:center; gap:6px; font:600 12.5px ${F}; color:${TEAL}; }
.bo-tab:hover { background:#F0F7F7; }
.bo-tab.on { background:${TEAL}; color:#fff; }
.bo-tab .n { min-width:18px; height:17px; padding:0 5px; border-radius:99px; font-size:10.5px; line-height:17px; text-align:center; background:rgba(3,68,79,.12); }
.bo-tab.on .n { background:rgba(255,255,255,.22); }
.bo-sep { display:none; }

/* FY filter */
.bo-fy { position:relative; display:flex; flex-shrink:0; }
.bo-fyb { display:flex; align-items:center; gap:7px; padding:0 12px; border:0; border-right:1px solid #B9D0D3; border-radius:0; background:#fff; cursor:pointer;
  font:500 12.5px ${F}; color:#344054; white-space:nowrap; }
.bo-fyb:hover, .bo-fyb[aria-expanded="true"] { background:#F0F7F7; }
.bo-fyb .lb { font-size:11px; font-weight:700; color:#667085; }
.bo-fyb b { font-weight:600; color:${TEAL}; }
.bo-fyb.set { background:#E8F3F4; }
.bo-fyb .cv { color:#98A2B3; font-size:10px; }
.bo-fyp { position:absolute; left:0; top:41px; z-index:30; min-width:190px; max-height:320px; overflow-y:auto; padding:5px; border-radius:8px; background:#fff;
  border:1px solid #D0D5DD; box-shadow:0 10px 28px rgba(16,24,40,.16); }
.bo-fyi { display:flex; align-items:center; gap:9px; padding:7px 9px; border-radius:5px; cursor:pointer; font-size:12.5px; color:#344054; }
.bo-fyi:hover { background:#F0F7F7; }
.bo-fyi.on { color:${TEAL}; font-weight:600; }
.bo-fyi input { width:15px; height:15px; margin:0; accent-color:${TEAL}; cursor:pointer; }
.bo-fyi span { flex:1; }
.bo-fyi small { font-size:11px; color:#98A2B3; font-weight:500; }
.bo-fysep { height:1px; background:#EDF2F3; margin:3px 0; }
.bo-shown { display:flex; align-items:center; padding:0 10px; font-size:12px; color:#667085; white-space:nowrap; }
.bo-search { position:relative; width:210px; min-width:130px; flex-shrink:1; display:flex; border-right:1px solid #B9D0D3; }
.bo-search input { width:100%; height:100%; padding:0 24px 0 12px; border:0; border-radius:0; background:#fff; outline:none; font:400 12.5px ${F}; color:#101828; box-sizing:border-box; }
.bo-search input:focus { box-shadow:inset 0 0 0 2px rgba(3,68,79,.35); }
.bo-search button { position:absolute; right:3px; top:50%; transform:translateY(-50%); width:20px; height:20px; border:none; background:none; cursor:pointer; color:#667085; font-size:15px; line-height:1; }
.bo-print { padding:0 14px; border:0; border-right:1px solid #B9D0D3; border-radius:0; background:#fff; color:${TEAL}; cursor:pointer; white-space:nowrap; flex-shrink:0; font:600 12.5px ${F}; }
.bo-print:hover { background:${TEAL}; color:#fff; }
.bo-print:disabled { opacity:.5; cursor:default; background:#fff; color:${TEAL}; }

/* if the browser's own Print menu is used, print only the list */
@media print {
  .bx-side, .bx-top, .bo-tabs, .bo-err { display:none !important; }
  .bx, .bx-main, .bx-body, .bo, .bo-body { display:block !important; height:auto !important; overflow:visible !important; }
  .bo-t th { position:static; }
}
.bo-body { flex:1; min-height:0; overflow-y:auto; overflow-x:hidden; }

.bo-t { width:100%; table-layout:fixed; border-collapse:separate; border-spacing:0; background:#fff; font-size:12px; }
.bo-t th { position:sticky; top:0; z-index:1; background:${TEAL}; color:#fff; font-weight:600; text-align:left; padding:7px 6px; white-space:nowrap;
  overflow:hidden; text-overflow:ellipsis; border-right:1px solid rgba(255,255,255,.12); }
.bo-t th:last-child { border-right:none; }
.bo-t td { padding:6px 6px; border-right:1px solid #000; color:#1D2939; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; vertical-align:middle; }
.bo-t td.stc { border-right:none; }
.bo-t td.wr { white-space:normal; overflow-wrap:anywhere; text-overflow:clip; }   /* client / PO / product wrap instead of "…" */
/* one line per product; the order's own columns span its lines; orders alternate in colour */
.bo-t tbody td { background:#fff; }
.bo-t tbody.alt td { background:#F7FAFA; }
.bo-t tbody:hover td { background:#EAF4F5; }
.bo-t tbody { cursor:default; }
.bo-t tbody.sel td { background:#D4EBEE !important; }
.bo-t tbody.sel tr:first-child td:first-child { box-shadow:inset 3px 0 0 ${TEAL}; }
.bo-t .r { text-align:right; } .bo-t .ctr { text-align:center; }
.bo-t td.no { font-weight:600; color:${TEAL}; }
.bo-t tfoot td { position:sticky; bottom:0; font-weight:700; background:#E3EEEF; border-top:1px solid #C9DCDE; }
.bo-t tfoot td.r { overflow:visible; text-overflow:clip; }   /* totals are wider than one row value */
.bo-t tbody.gap td { background:#FFFBEB; color:#B54708; cursor:pointer; padding:4px 6px; }
.bo-t tbody.gap td.no { color:#B54708; font-weight:600; }
.bo-t tbody.gap .gapmsg { font-style:italic; font-size:11.5px; color:#B54708; }
.bo-t tbody.gap:hover td { background:#FEF0C7; }
.bo-t tbody.cx td { color:#98A2B3; } .bo-t tbody.cx td.no { color:#B42318; text-decoration:line-through; }
.bo-gapchk { display:flex; align-items:center; gap:6px; padding:0 12px; border:0; border-right:1px solid #B9D0D3; border-radius:0; background:#fff; cursor:pointer; flex-shrink:0;
  font:600 12px 'Inter', sans-serif; color:#475467; white-space:nowrap; user-select:none; }
.bo-gapchk.on { background:#FFFAEB; color:#B54708; } .bo-gapchk b { font-weight:700; }
.bo-gapchk input { width:14px; height:14px; margin:0; accent-color:#F79009; cursor:pointer; }
.bo-tools { display:flex; align-items:stretch; margin-left:auto; flex-shrink:0; }
.bo-picked { display:flex; align-items:center; gap:5px; padding:0 12px; font-size:12px; color:#667085; white-space:nowrap; } .bo-picked b { color:${TEAL}; }
.bo-tbtn { display:inline-flex; align-items:center; gap:5px; padding:0 14px; border:0; border-left:1px solid #B9D0D3; border-radius:0; background:#fff; color:${TEAL}; cursor:pointer; font:600 12px ${F}; white-space:nowrap; }
.bo-tbtn:hover:not(:disabled) { background:${TEAL}; color:#fff; } .bo-tbtn:disabled { opacity:.45; cursor:default; }
.bo-tbtn.del { color:#B42318; } .bo-tbtn.del:hover:not(:disabled) { background:#B42318; color:#fff; }
.bo-ask { display:flex; align-items:center; gap:8px; padding:9px 14px; background:#FEF3F2; border-bottom:1px solid #FECDCA; font-size:12.5px; color:#7A271A; flex-shrink:0; }
.bo-ask span { flex:1; }
.bo-abtn { height:28px; padding:0 12px; border:1px solid #FECDCA; border-radius:2px; background:#fff; color:#344054; cursor:pointer; font:600 12px ${F}; }
.bo-abtn.danger { background:#B42318; border-color:#B42318; color:#fff; }
.bo-note { display:flex; align-items:center; gap:10px; padding:7px 12px; font-size:12.5px; font-weight:500; flex-shrink:0; }
.bo-note.ok { background:#E6F4EA; color:#1E7B34; border-bottom:1px solid #B7E1C1; } .bo-note.err { background:#FDECEC; color:#B42318; border-bottom:1px solid #F5C2C0; }
.bo-note button { margin-left:auto; border:0; background:none; color:inherit; font-size:16px; cursor:pointer; }
.bo-badge { display:inline-grid; place-items:center; width:20px; height:20px; border-radius:50%; color:#fff; font-size:11px; font-weight:700; }
.bo-msg { padding:40px 10px; text-align:center; color:#667085; font-size:13px; }
.bo-err { margin:10px; padding:9px 12px; border-radius:6px; background:#FDECEC; color:#B42318; font-size:12.5px; }
`;

export default function BetaOrders() {
  const { selectedCompany } = useCompany() || {};
  const { user } = useAuth() || {};
  const companyId = selectedCompany?.companyId;
  const navigate = useNavigate();
  const { search } = useLocation();
  const asked = new URLSearchParams(search).get('tab');
  const tab = TABS.some(t => t.key === asked) ? asked : 'list';

  const [orders, setOrders] = useState(null);
  const [err, setErr] = useState('');
  const [reload, setReload] = useState(0);
  const [detail, setDetail] = useState(null);    // order shown in the pop-up
  const [selId, setSelId] = useState(null);      // order picked in the list (single click)
  const [askDel, setAskDel] = useState(null);    // order waiting for delete confirmation
  const [delBusy, setDelBusy] = useState(false);
  const [note, setNote] = useState(null);
  const { user: authUser } = useAuth() || {};
  const [editing, setEditing] = useState(null);  // order open in the edit form
  const [newNo, setNewNo] = useState('');        // missing order number being created
  const [showGaps, setShowGaps] = useState(true);

  useEffect(() => {
    if (!companyId) return;
    if (!reload) setOrders(null);
    setErr('');
    axios.get('/api/sales-orders', { params: { companyId } })
      .then(r => setOrders(Array.isArray(r.data) ? r.data : []))
      .catch(e => { setOrders([]); setErr(e.response?.data?.error || 'Could not load sales orders.'); });
  }, [companyId, reload]);

  /* FY filter — empty = All; otherwise the ticked FYs */
  const [fySel, setFySel] = useState(() => [fyOf(new Date())]);   // current FY by default
  const [fyOpen, setFyOpen] = useState(false);
  const fyRef = useRef(null);
  useEffect(() => {
    if (!fyOpen) return undefined;
    const down = e => { if (!fyRef.current?.contains(e.target)) setFyOpen(false); };
    const key = e => { if (e.key === 'Escape') setFyOpen(false); };
    document.addEventListener('mousedown', down); document.addEventListener('keydown', key);
    return () => { document.removeEventListener('mousedown', down); document.removeEventListener('keydown', key); };
  }, [fyOpen]);
  const fyList = useMemo(() => {
    const m = new Map();
    (orders || []).forEach(o => { const k = fyOf(o.orderDate); if (k) m.set(k, (m.get(k) || 0) + 1); });
    return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0]));   // newest FY first
  }, [orders]);
  const toggleFy = k => setFySel(s => (s.includes(k) ? s.filter(x => x !== k) : [...s, k]));
  const fyText = !fySel.length ? 'All' : fySel.length <= 2 ? [...fySel].sort().reverse().map(k => fyLabel(k).slice(3)).join(', ') : `${fySel.length} years`;

  /* search — order ID, order no, client, client PO, dates (any format shown), products, amounts, status */
  const [q, setQ] = useState('');

  /* newest first */
  const rows = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return (orders || [])
      .filter(o => !fySel.length || fySel.includes(fyOf(o.orderDate)))
      .filter(o => !words.length || words.every(w => searchText(o).includes(w)))
      .sort((a, b) =>
        String(b.orderDate || '').localeCompare(String(a.orderDate || '')) || String(b.orderNo || '').localeCompare(String(a.orderNo || '')));
  }, [orders, fySel, q]);
  /* Missing numbers: gaps inside each real series (5+ orders, so a mistyped one-off does not create dozens). Each gap is shown
     just below the next higher order of its series; double-click creates the order with that number. */
  const gaps = useMemo(() => {
    const by = {};
    (orders || []).forEach(o => { const s = seriesOf(o.orderNo); if (s) (by[s.series] = by[s.series] || { ...s, nums: new Set() }).nums.add(s.seq); });
    const out = {};   // orderNo of the order a gap sits under → gap numbers below it (desc)
    let count = 0;
    Object.values(by).forEach(g => {
      if (g.nums.size < 5) return;
      const nums = [...g.nums].sort((a, b) => a - b), pad = k => g.series + String(k).padStart(g.width, '0');
      for (let k = 1; k < nums[nums.length - 1]; k++) {
        if (g.nums.has(k)) continue;
        const above = nums.find(x => x > k);
        (out[pad(above)] = out[pad(above)] || []).push({ no: pad(k), fy: g.fy });
        count++;
      }
    });
    Object.values(out).forEach(l => l.sort((a, b) => b.no.localeCompare(a.no)));
    return { under: out, count };
  }, [orders]);
  const gapCount = useMemo(() => Object.values(gaps.under).flat().filter(g => !fySel.length || fySel.includes(g.fy)).length, [gaps, fySel]);
  const display = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    const gapOk = g => showGaps && (!fySel.length || fySel.includes(g.fy)) && (!words.length || words.every(w => (g.no + ' missing not entered').toLowerCase().includes(w)));
    const out = [];
    const seen = new Set();
    rows.forEach(o => { out.push({ o }); (gaps.under[String(o.orderNo || '').trim()] || []).filter(gapOk).forEach(g => { seen.add(g.no); out.push({ gap: g }); }); });
    // searching for a missing number: show it even when its neighbouring order is filtered out
    if (words.length) Object.values(gaps.under).flat().filter(g => !seen.has(g.no) && gapOk(g)).sort((a, b) => b.no.localeCompare(a.no)).forEach(g => out.push({ gap: g }));
    return out;
  }, [rows, gaps, showGaps, fySel, q]);
  const totValue = useMemo(() => rows.reduce((s, o) => s + orderValue(o), 0), [rows]);
  const totGrand = useMemo(() => rows.reduce((s, o) => s + (Number(o.grandTotal) || 0), 0), [rows]);
  const filtered = fySel.length > 0 || q.trim() !== '';

  /* Esc or a click outside the rows / toolbar clears the selection */
  useEffect(() => {
    if (!selId || askDel) return undefined;
    const down = e => { if (!e.target.closest?.('.bo-t tbody, .bo-tools, .bo-ask, .ov-back')) setSelId(null); };
    const key = e => { if (e.key === 'Escape' && !detail) setSelId(null); };
    document.addEventListener('mousedown', down); document.addEventListener('keydown', key);
    return () => { document.removeEventListener('mousedown', down); document.removeEventListener('keydown', key); };
  }, [selId, askDel, detail]);

  /* delete for good — refused when a sales bill, PI or receipt already points at the order */
  /* Approve — button shown only to users with Sales Order approve rights; enabled for a pending / draft order */
  const canApproveSO = can(user, 'salesOrder', 'approve');
  const [apprBusy, setApprBusy] = useState(false);
  const doApprove = async o => {
    if (!window.confirm(`Approve order ${o.orderNo || o.orderId} — ${o.customerName || o.party || ''}?`)) return;
    setApprBusy(true);
    try {
      const fd = new FormData(); fd.append('status', 'approved');
      await axios.put(`/api/sales-orders/${o.orderId}`, fd, { params: { companyId } });
      setNote({ ok: true, text: `Order ${o.orderNo || o.orderId} approved.` }); setReload(x => x + 1);
    } catch (e) { setNote({ ok: false, text: e.response?.data?.error || 'Could not approve the order.' }); }
    finally { setApprBusy(false); }
  };
  const doDelete = async o => {
    setDelBusy(true);
    try {
      const id = String(o.orderId), p = { params: { companyId } };
      const [b, pi, pay] = await Promise.all([
        axios.get('/api/bills', { params: { companyId, type: 'sales' } }).then(r => r.data).catch(() => null),
        axios.get('/api/proforma-invoices', p).then(r => r.data).catch(() => null),
        axios.get('/api/accounts/payments', p).then(r => r.data).catch(() => null),
      ]);
      if (b === null || pi === null || pay === null) { setNote({ ok: false, text: 'Could not check the order\'s bills / PIs / receipts — not deleted. Try again.' }); return; }
      const used = [
        (Array.isArray(b) ? b : []).filter(x => String(x.orderId) === id).length && 'sales bill',
        (Array.isArray(pi) ? pi : []).filter(x => String(x.orderId) === id).length && 'proforma invoice',
        (Array.isArray(pay) ? pay : []).filter(x => String(x.orderId) === id).length && 'receipt',
      ].filter(Boolean);
      if (used.length) { setNote({ ok: false, text: `Order ${o.orderNo || id} has a ${used.join(', ')} — it cannot be deleted. Open it and use Cancel Order instead.` }); setAskDel(null); return; }
      await axios.delete(`/api/sales-orders/${id}`, p);
      setOrders(os => (os || []).filter(x => String(x.orderId) !== id));
      setNote({ ok: true, text: `Order ${o.orderNo || id} deleted.` });
      setAskDel(null); setSelId(null);
    } catch (e) { setNote({ ok: false, text: e.response?.data?.error || 'Could not delete the order.' }); }
    finally { setDelBusy(false); }
  };

  /* Print the list (as filtered) in the Sales Order print format — from a hidden frame, so only the list prints */
  const print = () => printOrderList({
    rows, company: selectedCompany, user, totValue, totGrand,
    filter: [fySel.length ? [...fySel].sort().reverse().map(fyLabel).join(', ') : 'All FY', q.trim() && `Search: “${q.trim()}”`].filter(Boolean).join('   |   '),
  });
  const printRef = useRef(print);
  printRef.current = print;
  /* Ctrl+P on this list prints the list, not the whole ERP screen */
  useEffect(() => {
    if (tab !== 'list') return undefined;
    const k = e => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'p') { e.preventDefault(); printRef.current(); }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [tab]);

  return (
    <div className="bo">
      <style>{CSS}</style>
      <div className="bo-tabs" role="tablist">
        {TABS.map((t, i) => (
          <React.Fragment key={t.key}>
            {i === 1 && <span className="bo-sep" />}
            <button type="button" role="tab" aria-selected={tab === t.key} className={`bo-tab${tab === t.key ? ' on' : ''}`}
              onClick={() => { setEditing(null); setNewNo(''); navigate(`/beta/order?tab=${t.key}`); }}>
              {t.label}{t.key === 'list' && orders && <span className="n">{orders.length}</span>}
            </button>
          </React.Fragment>
        ))}
        {tab === 'list' && (
          <div className="bo-fy" ref={fyRef}>
            <button type="button" className={`bo-fyb${fySel.length ? ' set' : ''}`} onClick={() => setFyOpen(o => !o)} aria-haspopup="listbox" aria-expanded={fyOpen}>
              <span className="lb">FY</span><b>{fyText}</b><span className="cv">▾</span>
            </button>
            {fyOpen && (
              <div className="bo-fyp" role="listbox" aria-multiselectable="true" aria-label="Financial year">
                <label className={`bo-fyi all${!fySel.length ? ' on' : ''}`}>
                  <input type="checkbox" checked={!fySel.length} onChange={() => setFySel([])} />
                  <span>All</span><small>{(orders || []).length}</small>
                </label>
                <div className="bo-fysep" />
                {fyList.length ? fyList.map(([k, n]) => (
                  <label key={k} className={`bo-fyi${fySel.includes(k) ? ' on' : ''}`}>
                    <input type="checkbox" checked={fySel.includes(k)} onChange={() => toggleFy(k)} />
                    <span>{fyLabel(k)}</span><small>{n}</small>
                  </label>
                )) : <div className="bo-fyi" style={{ color: '#98A2B3' }}>No dated orders</div>}
              </div>
            )}
          </div>
        )}
        {tab === 'list' && (
          <div className="bo-search">
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search order, client, PO, product…" title="Search order no, ID, client, client PO, due date, product" aria-label="Search orders" />
            {q && <button type="button" onClick={() => setQ('')} aria-label="Clear search">×</button>}
          </div>
        )}
        {tab === 'list' && (
          <button type="button" className="bo-print" onClick={print} disabled={!orders || !rows.length} title="Print this list (Ctrl+P)">Print List</button>
        )}
        {tab === 'list' && gaps.count > 0 && (
          <label className={`bo-gapchk${showGaps ? ' on' : ''}`} title="Order numbers skipped in the series — double-click one to create it">
            <input type="checkbox" checked={showGaps} onChange={e => setShowGaps(e.target.checked)} />Missing nos. <b>{gapCount}</b>
          </label>
        )}
        {tab === 'list' && orders && filtered && <span className="bo-shown">{rows.length} of {orders.length} orders</span>}
        {tab === 'list' && !editing && (() => {
          const so = (orders || []).find(o => String(o.orderId) === selId);
          return (
            <div className="bo-tools">
              <span className="bo-picked">{so ? <>Selected: <b>{so.orderNo || so.orderId}</b></> : 'Click an order to select'}</span>
              {canApproveSO && <button type="button" className="bo-tbtn" disabled={!so || apprBusy || !['pending', 'draft'].includes(so.status)} title={so && !['pending', 'draft'].includes(so.status) ? 'Only a pending order can be approved' : 'Approve this order'} onClick={() => { setNote(null); doApprove(so); }} style={{ color: '#067647', borderColor: '#16A34A' }}><Svg name="check" size={13} />{apprBusy ? 'Approving…' : 'Approve'}</button>}
              <button type="button" className="bo-tbtn" disabled={!so || so.status === 'cancelled'} onClick={() => { setNote(null); setEditing(so); }} title={so?.status === 'cancelled' ? 'A cancelled order cannot be edited' : 'Edit this order'}><Svg name="settings" size={13} />Edit</button>
              <button type="button" className="bo-tbtn" disabled={!so} onClick={() => printInPlace(so, selectedCompany || {}, authUser).catch(() => setNote({ ok: false, text: 'Could not prepare the print.' }))}><Svg name="file" size={13} />Print</button>
              <button type="button" className="bo-tbtn del" disabled={!so} onClick={() => { setNote(null); setAskDel(so); }}><Svg name="x" size={13} />Delete</button>
            </div>
          );
        })()}
      </div>
      {tab === 'list' && askDel && (
        <div className="bo-ask" role="alertdialog" aria-label="Confirm delete">
          <span><b>Delete order {askDel.orderNo || askDel.orderId}</b> ({askDel.customerName || askDel.party || '—'}) permanently? Its files are removed too and this cannot be undone. Orders with a sales bill, PI or receipt cannot be deleted — cancel those instead.</span>
          <button type="button" className="bo-abtn" onClick={() => setAskDel(null)} disabled={delBusy}>Keep</button>
          <button type="button" className="bo-abtn danger" onClick={() => doDelete(askDel)} disabled={delBusy}>{delBusy ? 'Checking…' : 'Yes, delete'}</button>
        </div>
      )}
      {tab === 'list' && note && <div className={`bo-note ${note.ok ? 'ok' : 'err'}`} role="status">{note.text}<button type="button" onClick={() => setNote(null)} aria-label="Dismiss">×</button></div>}

      {err && <div className="bo-err">{err}</div>}

      {editing ? (
        <BetaCreateSO key={`edit-${editing.orderId}`} companyId={companyId} company={selectedCompany} orders={orders || []} editOrder={editing}
          onSaved={() => setReload(x => x + 1)} onClose={() => setEditing(null)} />
      ) : tab === 'create' && <BetaCreateSO key={newNo ? `new-${newNo}` : 'new'} presetNo={newNo || undefined} companyId={companyId} company={selectedCompany} orders={orders || []} onSaved={() => { setNewNo(''); setReload(x => x + 1); }} />}

      <div className="bo-body" style={tab === 'create' || editing ? { display: 'none' } : undefined}>
        {tab === 'list' && (
          <table className="bo-t">
            <colgroup>{COLS.map(([label, w]) => <col key={label} style={{ width: w }} />)}</colgroup>
            <thead>
              <tr>{COLS.map(([label]) => (
                <th key={label} title={label} className={RIGHT.includes(label) ? 'r' : label === 'Status' ? 'ctr' : undefined}>{label === 'Status' ? 'St.' : label}</th>
              ))}</tr>
            </thead>
            {orders === null ? (
              <tbody><tr><td colSpan={COLS.length} className="bo-msg">Loading…</td></tr></tbody>
            ) : display.length === 0 ? (
              <tbody><tr><td colSpan={COLS.length} className="bo-msg">{orders.length ? (q.trim() ? `No order matches “${q.trim()}”.` : "No orders in the chosen FY.") : "No sales orders."}</td></tr></tbody>
            ) : display.map((d, i) => {
              if (d.gap) return (
                <tbody key={`gap-${d.gap.no}`} className="gap" onClick={() => setSelId(null)} onDoubleClick={() => { setNewNo(d.gap.no); navigate('/beta/order?tab=create'); }} title="Not entered — double-click to create this order">
                  <tr>
                    <td className="no">{d.gap.no}</td>
                    {/* one cell per column so the column lines run through this row too */}
                    <td />
                    <td className="gapmsg wr" title={`Order not entered — double-click to create ${d.gap.no}`}>Not entered</td>
                    {COLS.slice(3, -1).map(([c]) => <td key={c} />)}
                    <td className="ctr stc"><span className="bo-badge" style={{ background: '#F79009' }} title="Missing">M</span></td>
                  </tr>
                </tbody>
              );
              const o = d.o;
              const st = STATUS[o.status] || STATUS.draft;
              const name = o.customerName || o.party;
              const due = o.dueDate || o.deliveryDate;
              const its = soItems(o);
              const lines = its.length ? its : [null];
              const n = lines.length;
              return (
                <tbody key={o.orderId || o.orderNo || i} className={[i % 2 ? 'alt' : '', o.status === 'cancelled' ? 'cx' : '', selId === String(o.orderId) ? 'sel' : ''].filter(Boolean).join(' ') || undefined} onClick={() => setSelId(String(o.orderId))} onDoubleClick={() => setDetail(o)} title="Click to select · double-click to open the order" aria-selected={selId === String(o.orderId)}>
                  {lines.map((it, j) => (
                    <tr key={j}>
                      {j === 0 && <>
                        <td rowSpan={n} className="no" title={o.orderNo || ''}>{dash(o.orderNo)}</td>
                        <td rowSpan={n}>{sdate(o.orderDate)}</td>
                        <td rowSpan={n} className="wr">{dash(name)}</td>
                        <td rowSpan={n} className="wr">{dash(o.customerPO)}</td>
                        <td rowSpan={n}>{sdate(o.poDate)}</td>
                        <td rowSpan={n}>{sdate(due)}</td>
                      </>}
                      {it ? <>
                        <td className="pl wr">{dash(it.name)}</td>
                        <td className="r" title={it.unit}>{fmtQty(it.qty)}</td>
                        <td className="r">{money(it.rate)}</td>
                        <td className="r">{it.gst ? `${it.gst}%` : '—'}</td>
                      </> : <td colSpan={4} className="pl" style={{ color: '#98A2B3' }}>No products</td>}
                      {j === 0 && <>
                        <td rowSpan={n} className="r pl" style={{ fontWeight: 600 }}>{money(orderValue(o))}</td>
                        <td rowSpan={n} className="r">{money(o.grandTotal)}</td>
                        <td rowSpan={n} className="ctr stc"><span className="bo-badge" style={{ background: st.bg }} title={st.label}>{st.short}</span></td>
                      </>}
                    </tr>
                  ))}
                </tbody>
              );
            })}
            {rows.length > 0 && (
              <tfoot><tr><td colSpan={10}>Total ({rows.length} orders)</td><td className="r">{money(totValue)}</td><td className="r">{money(totGrand)}</td><td /></tr></tfoot>
            )}
          </table>
        )}
      </div>

      {detail && <OrderPopup order={detail} companyId={companyId} company={selectedCompany} onClose={() => setDetail(null)}
        onEdit={() => { setEditing(detail); setDetail(null); }}
        onChanged={upd => { setDetail(upd); setOrders(os => (os || []).map(x => (x.orderId === upd.orderId ? upd : x))); }} />}
    </div>
  );
}
