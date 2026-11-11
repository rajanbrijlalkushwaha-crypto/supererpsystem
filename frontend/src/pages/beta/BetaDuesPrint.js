/* Dues prints, from a hidden frame on the same page (no new tab):
 *   printDuesList    — the dues list as shown (FY / search / cleared filter applied), A4 landscape, hairlines
 *   printOrderAdvice — one order: products, charges, order value, payments received, balance due, A4 portrait
 * Thin black lines, no black fills. */
import axios from 'axios';
import { brandLine } from '../../utils/printBranding';
import { inWords } from './BetaProforma';
import { fillPage, fitPage, fillBody } from './BetaDCPrint';
import { loadGrns, billItemsFor, billCounts, poStatusOf } from './BetaPurchaseLib';

const n = v => parseFloat(v) || 0;
const AMT = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const amt = v => AMT.format(Number(v) || 0);
const PLAIN = new Intl.NumberFormat('en-IN', { useGrouping: false, maximumFractionDigits: 2 });
const num = v => PLAIN.format(Number(v) || 0);
const esc = v => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const d = v => { const x = v ? new Date(v) : null; return x && !isNaN(x) ? `${String(x.getDate()).padStart(2, '0')}-${String(x.getMonth() + 1).padStart(2, '0')}-${x.getFullYear()}` : ''; };
const tidy = t => String(t || '').replace(/\s+,/g, ',').replace(/,(\s*,)+/g, ',').replace(/\s{2,}/g, ' ').replace(/,\s*$/, '').trim();
const now = () => new Date().toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const PAY = { paid: 'Cleared', part: 'Part Paid', unpaid: 'Unpaid' };

async function logoOf(co) {
  if (!co?.logoFileName) return '';
  try {
    const b = (await axios.get(`/api/companies/logo/${encodeURIComponent(co.logoFileName)}`, { params: { companyId: co.companyId }, responseType: 'blob' })).data;
    return await new Promise(res => { const rd = new FileReader(); rd.onload = () => res(rd.result); rd.readAsDataURL(b); });
  } catch { return ''; }
}

/* fillMm: for a one-page advice, the printable page height — the blank row grows so it fills the A4 page */
function printHtml(html, id, fillMm) {
  document.getElementById(id)?.remove();
  const fr = document.createElement('iframe');
  fr.id = id;
  fr.setAttribute('aria-hidden', 'true');
  // laid out at the printable A4 width (210 − 2×9 mm) so the blank row can be sized to the page
  fr.style.cssText = fillMm ? 'position:fixed;left:-10000px;top:0;width:192mm;height:279mm;border:0;visibility:hidden' : 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
  document.body.appendChild(fr);
  const w = fr.contentWindow;
  w.document.open(); w.document.write(html); w.document.close();
  setTimeout(() => { if (fillMm) fillBody(w.document, fillMm); w.focus(); w.print(); window.focus(); setTimeout(() => fr.remove(), 1000); }, 400);
}

/* ── Dues list ── */
export async function printDuesList({ rows, company, user, filter }) {
  const co = company || {};
  const logo = await logoOf(co);
  const coAddr = tidy([co.address, co.city, co.state, co.pincode].filter(Boolean).join(', '));
  const tot = k => rows.reduce((s, r) => s + r[k], 0);
  const totTaxable = rows.reduce((s, r) => s + r.items.reduce((t, it) => t + it.taxable, 0), 0);

  const body = rows.map((r, i) => {
    const lines = r.items.length ? r.items : [null], span = lines.length, o = r.o;
    return lines.map((it, j) => '<tr>'
      + (j === 0 ? `<td rowspan="${span}" class="c">${i + 1}</td><td rowspan="${span}" class="nw"><b>${esc(o.orderNo || o.orderId)}</b></td><td rowspan="${span}">${esc(o.customerName || o.party)}</td>`
        + `<td rowspan="${span}" class="c nw">${d(o.poDate)}</td><td rowspan="${span}">${esc(o.customerPO)}</td>` : '')
      + (it ? `<td>${esc(it.name)}</td><td class="r">${num(it.qty)}${it.unit ? ' ' + esc(it.unit) : ''}</td><td class="r">${num(it.rate)}</td><td class="r">${num(it.taxable)}</td>` : '<td colspan="4" class="c">—</td>')
      + (j === 0 ? `<td rowspan="${span}" class="r">${r.other ? num(r.other) : ''}</td><td rowspan="${span}" class="r">${num(r.gst)}</td><td rowspan="${span}" class="r"><b>${num(r.value)}</b></td>`
        + `<td rowspan="${span}" class="r">${num(r.received)}</td><td rowspan="${span}" class="r"><b>${num(r.dues)}</b></td><td rowspan="${span}" class="c nw">${PAY[r.pay]}</td>` : '')
      + '</tr>').join('');
  }).join('');

  const L = 'linear-gradient(#000,#000)', HW = '0.4pt';   // hairlines (a CSS border prints at 0.75pt minimum)
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Dues List</title>
<style>
* { margin:0; padding:0; box-sizing:border-box; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
body { font-family:'Times New Roman', Times, Georgia, serif; font-size:9pt; color:#000; background:#fff; }
.frame { position:fixed; top:0; left:0; right:0; bottom:0; pointer-events:none;
  background-image:${L},${L},${L},${L}; background-repeat:no-repeat;
  background-size:100% ${HW},100% ${HW},${HW} 100%,${HW} 100%; background-position:0 0,0 100%,0 0,100% 0; }
.wrap { padding:0 4mm; }
.head { text-align:center; padding:4mm 0 2mm; background:${L} 0 100% / 100% ${HW} no-repeat; }
.title { text-align:center; font-size:13pt; font-weight:bold; padding:4px 0; background:${L} 0 100% / 100% ${HW} no-repeat; }
.meta { display:flex; justify-content:space-between; font-size:9pt; padding:3px 0 5px; }
.lst { width:100%; border-collapse:collapse; font-size:8.6pt; }
.lst th, .lst td { background-repeat:no-repeat; }
.lst td { padding:2px 3px; vertical-align:middle;
  background-image:${L},${L},${L}; background-size:100% ${HW},${HW} 100%,${HW} 100%; background-position:0 100%,100% 0,0 0; }
.lst th { padding:4px 3px; font-weight:bold; text-align:center; white-space:nowrap;
  background-image:${L},${L},${L},${L}; background-size:100% ${HW},${HW} 100%,100% ${HW},${HW} 100%; background-position:0 100%,100% 0,0 0,0 0; }
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
    <div style="font-size:14pt; font-weight:bold;">${esc(co.companyName || co.name || '')}</div>
    ${coAddr ? `<div style="font-size:9pt;">${esc(coAddr)}</div>` : ''}
    ${co.gstin ? `<div style="font-size:9pt;">GSTIN: ${esc(co.gstin)}</div>` : ''}
  </div>
  <div class="title">Dues List</div>
  <div class="meta"><span>${esc(filter || '')}</span><span>${rows.length} orders</span></div>
  <table class="lst">
    <thead>
      <tr class="gap"><th colspan="15"></th></tr>
      <tr><th style="width:22px">Sr</th><th>Order No</th><th>Client</th><th>PO Date</th><th>PO No</th><th>Product</th><th>Qty</th><th>Rate</th><th>Taxable</th>
        <th>Other</th><th>GST</th><th>Order Value</th><th>Receipt</th><th>Dues</th><th>Status</th></tr>
    </thead>
    <tfoot><tr class="gap"><td colspan="15"></td></tr></tfoot>
    <tbody>
      ${body}
      <tr class="tot"><td colspan="8">Total (${rows.length} orders)</td><td class="r">${num(totTaxable)}</td><td class="r">${num(tot('other'))}</td><td class="r">${num(tot('gst'))}</td>
        <td class="r">${num(tot('value'))}</td><td class="r">${num(tot('received'))}</td><td class="r">${num(tot('dues'))}</td><td></td></tr>
    </tbody>
  </table>
  <div class="foot"><span>${brandLine(user)}</span><span>Printed: ${esc(now())}</span></div>
</div>
</body></html>`;
  printHtml(html, 'du-list-frame');
}

const ADV_CSS = `
* { margin:0; padding:0; box-sizing:border-box; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
body { font-family:Arial, Helvetica, sans-serif; font-size:8.8pt; color:#000; background:#fff; line-height:1.32; }
table { width:100%; border-collapse:collapse; font-size:inherit; }
.doc > table { margin-top:-1px; } .doc > table:first-child { margin-top:0; }
.doc > table > tbody > tr > td, .doc > table > thead > tr > th, .doc > table > thead > tr > td { border:1px solid #000; padding:3px 6px; vertical-align:top; }
.c { text-align:center; } .r { text-align:right; white-space:nowrap; }
.lbl { font-size:7.2pt; color:#333; text-transform:uppercase; letter-spacing:.4px; margin-bottom:2px; }
.pn { font-size:10.5pt; font-weight:bold; margin-bottom:1px; }
.kv td { border:0 !important; padding:1px 4px 1px 0 !important; }
.kv td:first-child { width:84px; color:#333; white-space:nowrap; } .kv td:nth-child(2) { width:8px; }
.co { display:flex; gap:10px; align-items:center; }
.co img { width:58px; height:58px; object-fit:contain; flex-shrink:0; }
.co .nm { font-size:13.5pt; font-weight:bold; }
.ttl { text-align:center; font-size:14pt; font-weight:bold; letter-spacing:3px; vertical-align:middle !important; }
.ttl small { display:block; margin-top:2px; font-size:7.6pt; font-weight:normal; letter-spacing:.4px; }
.sec td { background:#EDEDED; font-weight:bold; font-size:8.2pt; letter-spacing:.4px; text-transform:uppercase; }
.hd th { background:#F5F5F5; font-weight:bold; font-size:8pt; text-align:center; }
tr.it td { border-top:0 !important; border-bottom:0 !important; }
tr.fill td { height:4mm; border-top:0 !important; }
tr.st td { font-weight:bold; }
tr.due td { font-weight:bold; font-size:11.5pt; background:#F2F2F2; padding:5px 6px !important; }
.sig { width:36%; height:22mm; text-align:right; vertical-align:bottom !important; }
.pby { display:flex; justify-content:space-between; font-size:7pt; color:#555; margin-top:3px; }
@media print { @page { margin:9mm; size:A4 portrait; } tr { break-inside:avoid; } }
`;

/* ── Order Advice: what the order is worth, what came in, what is still due ── */
export async function printOrderAdvice({ r, receipts, company, user, banks }) {
  const co = company || {}, o = r.o;
  const logo = await logoOf(co);
  const coAddr = tidy([co.address, co.city, [co.state, co.pincode].filter(Boolean).join(' - ')].filter(Boolean).join(', '));
  const clAddr = tidy([o.address, o.customerCity, [o.customerState, o.customerPincode].filter(Boolean).join(' - ')].filter(Boolean).join(', '));
  const bankName = id => { if (!id) return 'Cash'; const b = (banks || []).find(x => String(x.bankId) === String(id)); return b ? b.bankName : ''; };
  const taxable = r.items.reduce((s, it) => s + it.taxable, 0);
  const charges = (o.charges || []).filter(Boolean);

  const items = r.items.map((it, i) => `<tr class="it"><td class="c">${i + 1}</td><td><b>${esc(it.name)}</b></td><td class="r">${num(it.qty)}</td><td class="c">${esc(it.unit)}</td>
    <td class="r">${amt(it.rate)}</td><td class="r">${amt(it.taxable)}</td><td class="c">${num(it.gstPct)}%</td><td class="r">${amt(it.gst)}</td><td class="r">${amt(it.taxable + it.gst)}</td></tr>`).join('');
  const chLines = charges.map(c => {
    const a = n(c.amount), g = c.withoutGst ? 0 : n(c.gst);
    return `<tr class="it"><td></td><td>${esc(c.chargeType || 'Charge')}${c.description ? ` — ${esc(c.description)}` : ''}${c.withoutGst ? ' (without GST)' : ''}</td><td></td><td></td><td></td>
      <td class="r">${amt(a)}</td><td class="c">${g ? num(g) + '%' : '—'}</td><td class="r">${amt(a * g / 100)}</td><td class="r">${amt(a + a * g / 100)}</td></tr>`;
  }).join('');
  const rc = receipts.map((p, i) => `<tr><td class="c">${i + 1}</td><td class="c">${d(p.transactionDate || p.date)}</td><td>${esc(p.paymentId)}</td><td>${esc(p.paymentMode || '')}</td>
    <td>${esc(p.referenceNo || p.reference || '')}</td><td>${esc(bankName(p.bankId))}</td><td class="r">${amt(p.amount)}</td></tr>`).join('');

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Order Advice ${esc(o.orderNo || o.orderId)}</title>
<style>${ADV_CSS}</style></head><body>
<div class="doc">
<table>
  <colgroup><col style="width:60%"><col></colgroup>
  <tbody>
    <tr><td rowspan="2" style="vertical-align:middle"><div class="co">${logo ? `<img src="${logo}" alt="">` : ''}<div>
        <div class="nm">${esc(co.companyName || co.name || '')}</div>
        ${coAddr ? `<div>${esc(coAddr)}</div>` : ''}
        <div>${[co.gstin && `GSTIN: <b>${esc(co.gstin)}</b>`, co.phone && `Ph: ${esc(co.phone)}`].filter(Boolean).join(' &nbsp;|&nbsp; ')}</div>
        ${co.email ? `<div>Email: ${esc(co.email)}</div>` : ''}
      </div></div></td>
      <td class="ttl">ORDER ADVICE<small>Statement of order value, payments received and balance due</small></td></tr>
    <tr><td><table class="kv">
      <tr><td>Advice Date</td><td>:</td><td><b>${d(new Date())}</b></td></tr>
      <tr><td>Order No.</td><td>:</td><td><b>${esc(o.orderNo || o.orderId)}</b> &nbsp; dt. ${d(o.orderDate)}</td></tr>
      <tr><td>Client PO No.</td><td>:</td><td><b>${esc(o.customerPO || '—')}</b>${o.poDate ? ` &nbsp; dt. ${d(o.poDate)}` : ''}</td></tr>
    </table></td></tr>
  </tbody>
</table>
<table>
  <colgroup><col style="width:60%"><col></colgroup>
  <tbody><tr>
    <td><div class="lbl">To</div>
      <div class="pn">${esc(o.customerName || o.party || '')}</div>
      ${clAddr ? `<div>${esc(clAddr)}</div>` : ''}
      ${o.customerGstin ? `<div>GSTIN: <b>${esc(o.customerGstin)}</b></div>` : ''}
      ${o.contactPerson || o.mobile ? `<div>Kind Attn: ${esc([o.contactPerson, o.mobile].filter(Boolean).join(', '))}</div>` : ''}</td>
    <td><div class="lbl">Order terms</div>
      <table class="kv">
        <tr><td>Payment Terms</td><td>:</td><td>${esc(o.paymentTerms || '—')}</td></tr>
        <tr><td>Due Date</td><td>:</td><td>${d(o.dueDate || o.deliveryDate) || '—'}</td></tr>
        <tr><td>Status</td><td>:</td><td><b>${PAY[r.pay]}</b></td></tr>
      </table></td>
  </tr></tbody>
</table>
<table>
  <colgroup><col style="width:26px"><col><col style="width:44px"><col style="width:40px"><col style="width:74px"><col style="width:80px"><col style="width:40px"><col style="width:70px"><col style="width:84px"></colgroup>
  <thead>
    <tr class="sec"><td colspan="9">Order details</td></tr>
    <tr class="hd"><th>Sl</th><th>Description</th><th>Qty</th><th>Unit</th><th>Rate</th><th>Taxable</th><th>GST</th><th>GST Amt</th><th>Amount (₹)</th></tr>
  </thead>
  <tbody>
    ${items}${chLines}
    <tr class="fill" id="fillrow"><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
    <tr class="st"><td colspan="5" class="r">Total</td><td class="r">${amt(taxable + r.other)}</td><td></td><td class="r">${amt(r.gst)}</td><td class="r">${amt(r.value)}</td></tr>
  </tbody>
</table>
<table>
  <colgroup><col style="width:26px"><col style="width:74px"><col style="width:84px"><col style="width:90px"><col><col style="width:110px"><col style="width:84px"></colgroup>
  <thead>
    <tr class="sec"><td colspan="7">Payments received</td></tr>
    <tr class="hd"><th>Sl</th><th>Date</th><th>Receipt No.</th><th>Mode</th><th>UTR / Cheque No.</th><th>Account</th><th>Amount (₹)</th></tr>
  </thead>
  <tbody>
    ${rc || '<tr><td colspan="7" class="c">No payment received yet</td></tr>'}
    <tr class="st"><td colspan="6" class="r">Total Received</td><td class="r">${amt(r.received)}</td></tr>
  </tbody>
</table>
<table>
  <colgroup><col><col style="width:150px"></colgroup>
  <tbody>
    <tr><td class="r">Order Value</td><td class="r">${amt(r.value)}</td></tr>
    <tr><td class="r">Less: Payments Received</td><td class="r">− ${amt(r.received)}</td></tr>
    <tr class="due"><td class="r">${r.dues >= 0 ? 'BALANCE DUE' : 'EXCESS RECEIVED'}</td><td class="r">₹ ${amt(Math.abs(r.dues))}</td></tr>
    <tr><td colspan="2"><span class="lbl">Amount in words:</span> <b>${esc(inWords(Math.abs(r.dues)))}</b></td></tr>
  </tbody>
</table>
<table>
  <tbody><tr>
    <td>${r.dues > 0.5 ? `Kindly arrange the balance payment of <b>₹ ${amt(r.dues)}</b> against the above order at the earliest. Please quote Order No. <b>${esc(o.orderNo || o.orderId)}</b> with your payment.` : 'Thank you — no amount is due against this order.'}
      <div class="lbl" style="margin-top:6px">Bank details for payment</div>
      <table class="kv">
        <tr><td>Bank</td><td>:</td><td><b>${esc(co.bankName || '—')}</b></td></tr>
        <tr><td>A/c No.</td><td>:</td><td><b>${esc(co.bankAccount || co.accountNo || '—')}</b></td></tr>
        <tr><td>IFS Code</td><td>:</td><td><b>${esc(co.bankIfsc || co.ifsc || '—')}</b></td></tr>
        <tr><td>A/c Name</td><td>:</td><td><b>${esc(co.companyName || '')}</b></td></tr>
      </table></td>
    <td class="sig"><div style="height:100%; display:flex; flex-direction:column; justify-content:space-between;"><b>for ${esc(co.companyName || co.name || '')}</b><span>Authorised Signatory</span></div></td>
  </tr></tbody>
</table>
</div>
<div class="pby"><span>${brandLine(user)}</span><span>Printed: ${esc(now())}</span></div>
</body></html>`;
  printHtml(html, 'du-advice-frame', 279);
}

const PO_ADV_CSS = ADV_CSS + `
.doc > table > tbody > tr > td, .doc > table > thead > tr > th, .doc > table > thead > tr > td { border-width:.5px; }
.sec td { text-align:center; }
.pay tbody tr.pr td { border-top:0 !important; border-bottom:0 !important; }
.doc > table:not(.pay) tr.fill td { height:2mm; }
.pay tbody tr.fill td { height:1mm; border-top:0 !important; border-bottom:0 !important; }
.pay tbody tr.st td { border-top:.5px solid #000 !important; }
.sg td { height:24mm; vertical-align:top !important; }
.sg .box { height:100%; display:flex; flex-direction:column; justify-content:space-between; }
.pby { color:#000; font-weight:bold; font-size:7.6pt; }
tr.pend td { background:#FFF7E6; }
@media print { @page { margin:8mm; size:A4 portrait; } }
`;

/* ── PO Advice (vendor side): what the PO is worth, what we paid against it, what is still payable ── */
export async function printPoAdvice({ r, so, payments, vendor, company, user, banks }) {
  const co = company || {}, p = r.p, v = vendor || {};
  const logo = await logoOf(co);
  const coAddr = tidy([co.address, co.city, [co.state, co.pincode].filter(Boolean).join(' - ')].filter(Boolean).join(', '));
  const vAddr = tidy([p.vendorAddress || v.address, p.vendorCity || v.city, [p.vendorState || v.state, p.vendorPincode || v.pincode].filter(Boolean).join(' - ')].filter(Boolean).join(', '));
  const bankName = id => { if (!id) return 'Cash'; const b = (banks || []).find(x => String(x.bankId) === String(id)); return b ? b.bankName : ''; };
  const taxable = r.items.reduce((s, it) => s + it.taxable, 0);
  const charges = (p.charges || []).filter(Boolean);
  const poNo = p.poNo || p.poNumber || p.orderId;
  // material receipts (GRN) and purchase bills booked against this PO
  const get = async (url, params) => { try { const x = (await axios.get(url, { params: { companyId: co.companyId, ...params } })).data; return Array.isArray(x) ? x : []; } catch { return []; } };
  const [allBills, allGrn] = await Promise.all([get('/api/bills', { type: 'purchase' }), loadGrns(co.companyId)]);
  const byDate = k => (a, b) => String(a[k] || '').localeCompare(String(b[k] || ''));
  // a bill can cover several POs — only this PO's part of it is shown
  const bills = allBills.filter(b => billCounts(b) && billItemsFor(b, p.orderId).some(({ li }) => n(li.qty) || n(li.taxable)))
    .map(b => { const its = billItemsFor(b, p.orderId).map(x => x.li); const part = its.length !== (b.items || []).length;
      return { ...b, subTotal: part ? its.reduce((a, li) => a + n(li.taxable), 0) : b.subTotal, totalGST: part ? its.reduce((a, li) => a + n(li.gstAmt), 0) : b.totalGST, grandTotal: part ? its.reduce((a, li) => a + n(li.total ?? n(li.taxable) + n(li.gstAmt)), 0) : b.grandTotal }; })
    .sort(byDate('billDate'));
  const grns = allGrn.filter(g => String(g.poId) === String(p.orderId)).sort(byDate('receiptDate'));
  const contact = [[p.contactPerson || v.contactPerson, p.mobile || v.mobile, p.email || v.email], [p.contactPerson2, p.mobile2, p.email2]]
    .map(c => c.filter(Boolean).join(', ')).filter(Boolean);
  const vPhone = [v.landline, v.altMobile].filter(Boolean).join(', ');
  const grnRows = grns.flatMap(g => { const its = (g.items || []).filter(it => it && it.itemName); const span = Math.max(1, its.length);
    const where = g.deliveryType === 'direct-client' ? 'Direct to client' : g.deliveryType === 'to-vendor' ? (g.toVendorName || 'Other vendor') : (g.deliveryLocation || g.receiveAt || 'Our store');
    return (its.length ? its : [null]).map((it, j) => '<tr class="pr">'
      + (j === 0 ? `<td rowspan="${span}" class="c" style="white-space:nowrap">${esc(g.grnNo || g.grnId)}</td><td rowspan="${span}" class="c" style="white-space:nowrap">${d(g.receiptDate)}</td>` : '')
      + (it ? `<td>${esc(it.itemName)}</td><td class="r"><b>${num(it.receivedQty)}</b></td><td class="c">${esc(it.unit || '')}</td>` : '<td colspan="3" class="c">—</td>')
      + (j === 0 ? `<td rowspan="${span}">${esc(where)}${g.remarks ? `<br><i>${esc(g.remarks)}</i>` : ''}</td>` : '') + '</tr>'); }).join('');
  // material of this PO on each bill (item × qty unit); our own bill no. is not shown — the vendor's invoice no. is what matters
  const billLines = b => billItemsFor(b, p.orderId).map(x => x.li).filter(li => n(li.qty) > 0 && !(li.unit === 'LOT' && li.itemIdx == null));
  const billMat = b => billLines(b).map(li => esc(li.description || li.itemName || '')).join('<br>');
  const billQty = b => billLines(b).map(li => `${num(li.qty)}${li.unit ? ' ' + esc(li.unit) : ''}`).join('<br>');
  const billQtyTot = bills.reduce((x, b) => x + billLines(b).reduce((y, li) => y + n(li.qty), 0), 0);
  const billRows = bills.map((b, i) => `<tr class="pr"><td class="c">${i + 1}</td><td>${esc(b.vendorBillNo || '—')}</td><td class="c">${d(b.billDate)}</td><td>${billMat(b) || '—'}</td><td class="r">${billQty(b) || '—'}</td>
    <td class="r">${amt(b.subTotal)}</td><td class="r">${amt(b.totalGST)}</td><td class="r">${amt(b.grandTotal)}</td></tr>`).join('');
  const grnQty = k => grns.reduce((x, g) => x + (g.items || []).reduce((y, it) => y + n(it && it[k]), 0), 0);
  const billTot = k => bills.reduce((x, b) => x + n(b[k]), 0);
  const poSt = poStatusOf(p, allBills, allGrn);
  const toRecv = poSt.filter(l => l.toReceive > 0), toBillQty = poSt.reduce((x, l) => x + l.toBill, 0);
  const pend = { taxable: Math.max(0, n(r.value) - n(r.gst) - billTot('subTotal')), gst: Math.max(0, n(r.gst) - billTot('totalGST')), amount: Math.max(0, n(r.value) - billTot('grandTotal')) };
  const recvPendRow = toRecv.length
    ? `<tr class="pr pend"><td colspan="2" class="r"><b>Pending to receive</b></td><td>${toRecv.map(l => esc(l.name)).join('<br>')}</td><td class="r"><b>${toRecv.map(l => num(l.toReceive)).join('<br>')}</b></td><td class="c">${toRecv.map(l => esc(l.unit || '')).join('<br>')}</td><td></td></tr>`
    : `<tr class="pr pend"><td colspan="6" class="c"><b>All material received</b></td></tr>`;
  const billPendRow = pend.amount > 0.5
    ? `<tr class="st pend"><td colspan="4" class="r">Balance to be billed <span style="font-weight:normal">(PO value ${amt(r.value)})</span></td><td class="r">${toBillQty ? num(toBillQty) : ''}</td><td class="r">${amt(pend.taxable)}</td><td class="r">${amt(pend.gst)}</td><td class="r">${amt(pend.amount)}</td></tr>`
    : `<tr class="st pend"><td colspan="8" class="c">Fully billed — nothing left to bill on this PO</td></tr>`;

  const items = r.items.map((it, i) => `<tr class="it"><td class="c">${i + 1}</td><td><b>${esc(it.name)}</b></td><td class="r">${num(it.qty)}</td><td class="c">${esc(it.unit)}</td>
    <td class="r">${amt(it.rate)}</td><td class="r">${amt(it.taxable)}</td><td class="c">${num(it.gstPct)}%</td><td class="r">${amt(it.gst)}</td><td class="r">${amt(it.taxable + it.gst)}</td></tr>`).join('');
  const chLines = charges.map(c => {
    const a = n(c.amount), g = n(c.gstPercent ?? c.gst);
    return `<tr class="it"><td></td><td>${esc(c.chargeType || 'Charge')}${c.description ? ` — ${esc(c.description)}` : ''}</td><td></td><td></td><td></td>
      <td class="r">${amt(a)}</td><td class="c">${g ? num(g) + '%' : '—'}</td><td class="r">${amt(a * g / 100)}</td><td class="r">${amt(a + a * g / 100)}</td></tr>`;
  }).join('');
  const pays = payments.map((x, i) => `<tr class="pr"><td class="c">${i + 1}</td><td class="c">${d(x.transactionDate || x.date)}</td><td>${esc(x.paymentId)}${x.status === 'pending' ? ' <i>(awaiting approval)</i>' : ''}</td><td>${esc(x.paymentMode || '')}</td>
    <td>${esc(x.referenceNo || x.reference || '')}</td><td>${esc(bankName(x.bankId))}</td><td class="r">${amt(x.forPo)}</td></tr>`).join('');
  const vName = p.vendorName || v.vendorName || '';

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>PO Advice ${esc(poNo)}</title>
<style>${PO_ADV_CSS}</style></head><body>
<div class="doc">
<table>
  <colgroup><col style="width:60%"><col></colgroup>
  <tbody>
    <tr><td rowspan="2" style="vertical-align:middle"><div class="co">${logo ? `<img src="${logo}" alt="">` : ''}<div>
        <div class="nm">${esc(co.companyName || co.name || '')}</div>
        ${coAddr ? `<div>${esc(coAddr)}</div>` : ''}
        <div>${[co.gstin && `GSTIN: <b>${esc(co.gstin)}</b>`, co.phone && `Ph: ${esc(co.phone)}`].filter(Boolean).join(' &nbsp;|&nbsp; ')}</div>
        ${co.email ? `<div>Email: ${esc(co.email)}</div>` : ''}
      </div></div></td>
      <td class="ttl">PO ADVICE<small>PO value, material received, bills, payments and balance payable</small></td></tr>
    <tr><td><table class="kv">
      <tr><td>Advice Date</td><td>:</td><td><b>${d(new Date())}</b></td></tr>
      <tr><td>PO Date</td><td>:</td><td><b>${d(p.poDate)}</b></td></tr>
      <tr><td>PO No.</td><td>:</td><td><b>${esc(poNo)}</b></td></tr>
      ${so ? `<tr><td>Order No.</td><td>:</td><td><b>${esc(so.orderNo || so.orderId)}</b></td></tr>` : ''}
    </table></td></tr>
  </tbody>
</table>
<table>
  <colgroup><col style="width:60%"><col></colgroup>
  <tbody><tr>
    <td><div class="lbl">To (Vendor)</div>
      <div class="pn">${esc(p.vendorName || v.vendorName || '')}</div>
      ${vAddr ? `<div>${esc(vAddr)}</div>` : ''}
      ${p.vendorGstin || v.gstin ? `<div>GSTIN: <b>${esc(p.vendorGstin || v.gstin)}</b></div>` : ''}
      ${contact.map((c, i) => `<div>${i ? 'Alt. Contact' : 'Contact'}: <b>${esc(c)}</b></div>`).join('')}
      ${vPhone ? `<div>Phone: ${esc(vPhone)}</div>` : ''}</td>
    <td><div class="lbl">PO terms</div>
      <table class="kv">
        <tr><td>Payment Terms</td><td>:</td><td>${esc(p.paymentTerms || '—')}</td></tr>
        <tr><td>Delivery Date</td><td>:</td><td>${d(p.deliveryDate || p.dueDate) || '—'}</td></tr>
        <tr><td>Status</td><td>:</td><td><b>${PAY[r.pay]}</b></td></tr>
      </table></td>
  </tr></tbody>
</table>
<table>
  <colgroup><col style="width:26px"><col><col style="width:44px"><col style="width:40px"><col style="width:74px"><col style="width:80px"><col style="width:40px"><col style="width:70px"><col style="width:84px"></colgroup>
  <thead>
    <tr class="sec"><td colspan="9">PO details</td></tr>
    <tr class="hd"><th>Sl</th><th>Description</th><th>Qty</th><th>Unit</th><th>Rate</th><th>Taxable</th><th>GST</th><th>GST Amt</th><th>Amount (₹)</th></tr>
  </thead>
  <tbody>
    ${items}${chLines}
    <tr class="fill"><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
    <tr class="st"><td colspan="5" class="r">Total</td><td class="r">${amt(taxable + r.other)}</td><td></td><td class="r">${amt(r.gst)}</td><td class="r">${amt(r.value)}</td></tr>
  </tbody>
</table>
<table class="pay">
  <colgroup><col style="width:108px"><col style="width:76px"><col><col style="width:60px"><col style="width:40px"><col style="width:150px"></colgroup>
  <thead>
    <tr class="sec"><td colspan="6">Material receipt (GRN)</td></tr>
    <tr class="hd"><th>GRN No.</th><th>Date</th><th>Item</th><th>Received</th><th>Unit</th><th>Received at / Remarks</th></tr>
  </thead>
  <tbody>
    ${grnRows || '<tr class="pr"><td colspan="6" class="c">No material received yet</td></tr>'}
    ${grns.length ? `<tr class="st"><td colspan="3" class="r">Total Received</td><td class="r">${num(grnQty('receivedQty'))}</td><td colspan="2"></td></tr>` : ''}
    ${recvPendRow}
  </tbody>
</table>
<table class="pay">
  <colgroup><col style="width:26px"><col style="width:120px"><col style="width:74px"><col><col style="width:64px"><col style="width:90px"><col style="width:80px"><col style="width:90px"></colgroup>
  <thead>
    <tr class="sec"><td colspan="8">Purchase bills</td></tr>
    <tr class="hd"><th>Sl</th><th>Vendor Invoice No.</th><th>Bill Date</th><th>Material</th><th>Qty</th><th>Taxable</th><th>GST</th><th>Amount (₹)</th></tr>
  </thead>
  <tbody>
    ${billRows || '<tr class="pr"><td colspan="8" class="c">No purchase bill booked yet</td></tr>'}
    <tr class="st"><td colspan="4" class="r">Total Billed</td><td class="r">${bills.length ? num(billQtyTot) : ''}</td><td class="r">${amt(billTot('subTotal'))}</td><td class="r">${amt(billTot('totalGST'))}</td><td class="r">${amt(billTot('grandTotal'))}</td></tr>
    ${billPendRow}
  </tbody>
</table>
<table class="pay">
  <colgroup><col style="width:26px"><col style="width:74px"><col style="width:110px"><col style="width:100px"><col><col style="width:110px"><col style="width:84px"></colgroup>
  <thead>
    <tr class="sec"><td colspan="7">Payments made</td></tr>
    <tr class="hd"><th>Sl</th><th>Date</th><th>Payment No.</th><th>Mode</th><th>UTR / Cheque No.</th><th>Paid From</th><th>Amount (₹)</th></tr>
  </thead>
  <tbody>
    ${pays || '<tr class="pr"><td colspan="7" class="c">No payment made yet</td></tr>'}
    <tr class="fill" id="fillrow">${payments.length ? '<td></td><td></td><td></td><td></td><td></td><td></td><td></td>' : '<td colspan="7"></td>'}</tr>
    <tr class="st"><td colspan="6" class="r">Total Paid</td><td class="r">${amt(r.paid)}</td></tr>
  </tbody>
</table>
<table>
  <colgroup><col><col style="width:150px"></colgroup>
  <tbody>
    <tr><td class="r">PO Value</td><td class="r">${amt(r.value)}</td></tr>
    <tr><td class="r">Less: Payments Made</td><td class="r">− ${amt(r.paid)}</td></tr>
    <tr class="due"><td class="r">${r.dues >= 0 ? 'BALANCE PAYABLE' : 'EXCESS PAID'}</td><td class="r">₹ ${amt(Math.abs(r.dues))}</td></tr>
    <tr><td colspan="2"><span class="lbl">Amount in words:</span> <b>${esc(inWords(Math.abs(r.dues)))}</b></td></tr>
  </tbody>
</table>
<table>
  <tbody><tr>
    <td>${r.dues > 0.5 ? `Balance of <b>₹ ${amt(r.dues)}</b> remains payable against PO No. <b>${esc(poNo)}</b> as per the agreed payment terms.` : 'No amount is payable against this PO.'}
      <div class="lbl" style="margin-top:6px">Vendor bank details</div>
      <table class="kv">
        <tr><td>Bank</td><td>:</td><td><b>${esc(v.bankName || '—')}</b>${v.branch ? `, ${esc(v.branch)}` : ''}</td></tr>
        <tr><td>A/c No.</td><td>:</td><td><b>${esc(v.accountNo || '—')}</b></td></tr>
        <tr><td>IFS Code</td><td>:</td><td><b>${esc(v.ifsc || '—')}</b></td></tr>
        <tr><td>A/c Name</td><td>:</td><td><b>${esc(v.accountHolder || vName)}</b></td></tr>
      </table></td>
  </tr></tbody>
</table>
<table class="sg">
  <colgroup><col style="width:50%"><col></colgroup>
  <tbody><tr>
    <td><div class="box"><b>Confirmed by Vendor: ${esc(vName)}</b><b>Signature &amp; Seal</b></div></td>
    <td><div class="box" style="text-align:right"><b>for ${esc(co.companyName || co.name || '')}</b><b>Authorised Signatory</b></div></td>
  </tr></tbody>
</table>
</div>
<div class="pby"><span>${brandLine(user)}</span><span>Printed: ${esc(now())}</span></div>
</body></html>`;
  document.getElementById('pd-advice-frame')?.remove();
  const fr = document.createElement('iframe');
  fr.id = 'pd-advice-frame'; fr.setAttribute('aria-hidden', 'true');
  fr.style.cssText = 'position:fixed;left:-10000px;top:0;width:194mm;height:281mm;border:0;visibility:hidden';
  document.body.appendChild(fr);
  const w = fr.contentWindow;
  w.document.open(); w.document.write(html); w.document.close();
  await new Promise(res => setTimeout(res, 400));
  fillPage(w.document);
  fitPage(w.document);   // a little over one page (e.g. only the footer spills) → shrink to fit one page
  w.focus(); w.print(); window.focus(); setTimeout(() => fr.remove(), 1000);
}

export { logoOf, ADV_CSS };
