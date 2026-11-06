/* Purchase side prints, from a hidden frame on the same page (no new tab). Thin black lines, no black fills.
 *   printGrn  — one Goods Receipt Note, A4 portrait, fills the page
 *   printList — any purchase list as shown (GRN list, receipt / purchase pending, purchase bills), A4 landscape */
import { logoOf, ADV_CSS } from './BetaDuesPrint';
import { fillPage } from './BetaDCPrint';
import { brandLine } from '../../utils/printBranding';

const n = v => parseFloat(v) || 0;
const PLAIN = new Intl.NumberFormat('en-IN', { useGrouping: false, maximumFractionDigits: 3 });
const num = v => PLAIN.format(Number(v) || 0);
export const esc = v => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const d = v => { const x = v ? new Date(v) : null; return x && !isNaN(x) ? `${String(x.getDate()).padStart(2, '0')}-${String(x.getMonth() + 1).padStart(2, '0')}-${x.getFullYear()}` : ''; };
const tidy = t => String(t || '').replace(/\s*[\r\n]+\s*/g, ', ').replace(/\s+,/g, ',').replace(/,(\s*,)+/g, ',').replace(/\s{2,}/g, ' ').replace(/,\s*$/, '').trim();
const now = () => new Date().toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const WHERE = { 'direct-client': 'Direct to client', 'to-vendor': 'At another vendor', 'our-yard': 'Our factory / store' };

/* print through a frame laid out at the printable A4 size, so a #fillrow can stretch to the bottom */
function printFrame(html, id, landscape) {
  document.getElementById(id)?.remove();
  const fr = document.createElement('iframe');
  fr.id = id; fr.setAttribute('aria-hidden', 'true');
  fr.style.cssText = `position:fixed;left:-10000px;top:0;width:${landscape ? '281mm' : '194mm'};height:${landscape ? '194mm' : '281mm'};border:0;visibility:hidden`;
  document.body.appendChild(fr);
  const w = fr.contentWindow;
  w.document.open(); w.document.write(html); w.document.close();
  setTimeout(() => { if (!landscape) fillPage(w.document); w.focus(); w.print(); window.focus(); setTimeout(() => fr.remove(), 1000); }, 400);
}

const GRN_CSS = ADV_CSS + `
.doc > table > tbody > tr > td, .doc > table > thead > tr > th, .doc > table > thead > tr > td { border-width:.5px; }
.sec td { text-align:center; }
.ls tbody tr.pr td { border-top:0 !important; border-bottom:0 !important; }
.ls tbody tr.fill td { height:1mm; border-top:0 !important; border-bottom:0 !important; }
.ls tbody tr.st td { border-top:.5px solid #000 !important; font-weight:bold; }
.sg td { height:22mm; vertical-align:top !important; }
.sg .box { height:100%; display:flex; flex-direction:column; justify-content:space-between; }
.pby { color:#000; font-weight:bold; font-size:7.6pt; display:flex; justify-content:space-between; margin-top:3px; }
@media print { @page { margin:8mm; size:A4 portrait; } }
`;

export async function printGrn({ g, po, so, company, user }) {
  const co = company || {}, p = po || {};
  const logo = await logoOf(co);
  const coAddr = tidy([co.address, co.city, [co.state, co.pincode].filter(Boolean).join(' - ')].filter(Boolean).join(', '));
  const vAddr = tidy([p.vendorAddress, p.vendorCity, [p.vendorState, p.vendorPincode].filter(Boolean).join(' - ')].filter(Boolean).join(', '));
  const its = (g.items || []).filter(it => it && n(it.receivedQty ?? it.qty) > 0);
  const where = g.deliveryType === 'direct-client' ? `Direct to client — ${g.clientName || so?.customerName || ''}${g.deliveryLocation ? `, ${g.deliveryLocation}` : ''}`
    : g.deliveryType === 'to-vendor' ? `At vendor's factory — ${g.toVendorName || ''}${g.toPoNo ? ` (their PO ${g.toPoNo})` : ''}`
      : `Our factory / store${g.deliveryLocation || g.receiveAt ? ` — ${g.deliveryLocation || g.receiveAt}` : ''}`;
  const made = g.source === 'dc' ? `Made with DC ${g.dcNo || ''}` : g.source === 'bill' ? `Made with vendor invoice ${g.vendorDcNo || ''}` : '';
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>GRN ${esc(g.grnNo || '')}</title><style>${GRN_CSS}</style></head><body>
<div class="doc">
<table>
  <colgroup><col style="width:60%"><col></colgroup>
  <tbody>
    <tr><td rowspan="2" style="vertical-align:middle"><div class="co">${logo ? `<img src="${logo}" alt="">` : ''}<div>
        <div class="nm">${esc(co.companyName || co.name || '')}</div>
        ${coAddr ? `<div>${esc(coAddr)}</div>` : ''}
        <div>${[co.gstin && `GSTIN: <b>${esc(co.gstin)}</b>`, co.phone && `Ph: ${esc(co.phone)}`].filter(Boolean).join(' &nbsp;|&nbsp; ')}</div>
      </div></div></td>
      <td class="ttl" style="font-size:12.5pt;letter-spacing:2px">GOODS RECEIPT NOTE<small>Material received against the purchase order</small></td></tr>
    <tr><td><table class="kv">
      <tr><td>GRN No.</td><td>:</td><td><b>${esc(g.grnNo || '')}</b></td></tr>
      <tr><td>GRN Date</td><td>:</td><td><b>${d(g.receiptDate)}</b></td></tr>
      <tr><td>PO No.</td><td>:</td><td><b>${esc(g.poNo || p.poNo || '')}</b>${p.poDate ? ` &nbsp;dt. ${d(p.poDate)}` : ''}</td></tr>
      ${so || g.orderNo ? `<tr><td>Order No.</td><td>:</td><td><b>${esc(so?.orderNo || g.orderNo)}</b></td></tr>` : ''}
    </table></td></tr>
  </tbody>
</table>
<table>
  <colgroup><col style="width:55%"><col></colgroup>
  <tbody><tr>
    <td><div class="lbl">Vendor</div><div class="pn">${esc(g.vendorName || p.vendorName || '')}</div>${vAddr ? `<div>${esc(vAddr)}</div>` : ''}${p.vendorGstin ? `<div>GSTIN: <b>${esc(p.vendorGstin)}</b></div>` : ''}</td>
    <td><div class="lbl">Receipt</div><table class="kv">
      <tr><td>Received at</td><td>:</td><td><b>${esc(where)}</b></td></tr>
      ${g.vendorDcNo || g.vendorInvoiceNo ? `<tr><td>Vendor DC / Inv.</td><td>:</td><td>${esc(g.vendorDcNo || g.vendorInvoiceNo)}</td></tr>` : ''}
      ${g.vehicleNo ? `<tr><td>Vehicle No.</td><td>:</td><td>${esc(g.vehicleNo)}</td></tr>` : ''}
      ${g.receivedBy ? `<tr><td>Received by</td><td>:</td><td>${esc(g.receivedBy)}</td></tr>` : ''}
      ${made ? `<tr><td>Note</td><td>:</td><td>${esc(made)}</td></tr>` : ''}
    </table></td>
  </tr></tbody>
</table>
<table class="ls">
  <colgroup><col style="width:26px"><col><col style="width:44px"><col style="width:70px"><col style="width:76px"><col style="width:30%"></colgroup>
  <thead>
    <tr class="sec"><td colspan="6">Material received</td></tr>
    <tr class="hd"><th>Sl</th><th>Description of Goods</th><th>Unit</th><th>PO Qty</th><th>Received</th><th>Remarks</th></tr>
  </thead>
  <tbody>
    ${its.map((it, i) => `<tr class="pr"><td class="c">${i + 1}</td><td><b>${esc(it.itemName || '')}</b>${it.hsnCode ? `<div style="font-size:7.6pt">HSN ${esc(it.hsnCode)}</div>` : ''}</td><td class="c">${esc(it.unit || '')}</td>
      <td class="c">${it.orderedQty != null ? num(it.orderedQty) : ''}</td><td class="c"><b>${num(it.receivedQty ?? it.qty)}</b></td><td>${esc(it.remarks || '')}</td></tr>`).join('')}
    <tr class="fill" id="fillrow"><td></td><td></td><td></td><td></td><td></td><td></td></tr>
    <tr class="st"><td></td><td class="r">Total</td><td></td><td></td><td class="c">${num(its.reduce((s, it) => s + n(it.receivedQty ?? it.qty), 0))}</td><td></td></tr>
  </tbody>
</table>
${g.remarks ? `<table><tbody><tr><td><b>Remarks:</b> ${esc(g.remarks)}</td></tr></tbody></table>` : ''}
<table class="sg">
  <colgroup><col style="width:33.3%"><col style="width:33.3%"><col></colgroup>
  <tbody><tr>
    <td><div class="box"><b>Delivered by (Vendor)</b><b>Signature</b></div></td>
    <td><div class="box"><b>Received by</b><b>Signature</b></div></td>
    <td><div class="box" style="text-align:right"><b>for ${esc(co.companyName || co.name || '')}</b><b>Authorised Signatory</b></div></td>
  </tr></tbody>
</table>
</div>
<div class="pby"><span>${brandLine(user)}</span><span>Printed: ${esc(now())}</span></div>
</body></html>`;
  printFrame(html, 'grn-print-frame', false);
}

/* cols: [[label, align ('l'|'r'|'c'), width]] · rows: [[cell html …] | { span:[…] }] — cells are already escaped */
export async function printList({ title, filter, cols, rows, total, company, user }) {
  const co = company || {};
  const logo = await logoOf(co);
  const L = 'linear-gradient(#000,#000)', HW = '0.4pt';
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
* { margin:0; padding:0; box-sizing:border-box; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
body { font-family:Arial, Helvetica, sans-serif; font-size:8.4pt; color:#000; background:#fff; }
.head { display:flex; align-items:center; gap:10px; padding-bottom:4px; border-bottom:${HW} solid #000; }
.head img { height:36px; max-width:90px; object-fit:contain; }
.head .nm { font-size:12.5pt; font-weight:bold; } .head .t { margin-left:auto; text-align:right; font-size:12pt; font-weight:bold; letter-spacing:1px; } .head .t small { display:block; font-size:8pt; font-weight:normal; letter-spacing:0; }
table { width:100%; border-collapse:collapse; margin-top:6px; table-layout:fixed; }
th, td { padding:2px 4px; vertical-align:top; background-repeat:no-repeat; overflow-wrap:anywhere;
  background-image:${L},${L},${L},${L}; background-size:100% ${HW},${HW} 100%,100% ${HW},${HW} 100%; background-position:0 100%,100% 0,0 0,0 0; }
th { font-weight:bold; text-align:center; vertical-align:middle; background-color:#F2F2F2; }
td.r { text-align:right; white-space:nowrap; } td.c { text-align:center; }
tr.tot td { font-weight:bold; } tr.gone td { color:#B42318; text-decoration:line-through; }
.foot { display:flex; justify-content:space-between; font-size:7.6pt; font-weight:bold; margin-top:4px; }
@media print { @page { margin:8mm; size:A4 landscape; } thead { display:table-header-group; } tr { break-inside:avoid; } }
</style></head><body>
<div class="head">${logo ? `<img src="${logo}" alt="">` : ''}<div class="nm">${esc(co.companyName || co.name || '')}</div><div class="t">${esc(title)}<small>${esc(filter || '')}</small></div></div>
<table>
  <colgroup>${cols.map(c => `<col${c[2] ? ` style="width:${c[2]}"` : ''}>`).join('')}</colgroup>
  <thead><tr>${cols.map(c => `<th>${esc(c[0])}</th>`).join('')}</tr></thead>
  <tbody>
    ${rows.map(r => (Array.isArray(r) ? `<tr>${r.map((c, j) => `<td class="${cols[j]?.[1] || ''}">${c}</td>`).join('')}</tr>` : r.html)).join('')}
    ${total ? `<tr class="tot">${total.map((c, j) => `<td class="${cols[j]?.[1] || ''}">${c}</td>`).join('')}</tr>` : ''}
  </tbody>
</table>
<div class="foot"><span>${brandLine(user)}</span><span>Printed: ${esc(now())}</span></div>
</body></html>`;
  printFrame(html, 'pl-print-frame', true);
}

export const whereText = g => (g.deliveryType === 'direct-client' ? `Direct to client${g.clientName ? `: ${g.clientName}` : ''}` : g.deliveryType === 'to-vendor' ? `At vendor${g.toVendorName ? `: ${g.toVendorName}` : ''}` : (g.deliveryLocation || g.receiveAt || WHERE['our-yard']));
