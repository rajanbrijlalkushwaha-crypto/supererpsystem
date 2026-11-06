/* Receipt prints, opened from a hidden frame on the same page (no new tab):
 *   printReceiptAdvice — one receipt (all orders it covers) as a Receipt Advice for the client, A4 portrait
 *   printReceiptList   — the receipt list as shown (search applied), A4 landscape
 * Thin black lines, no black fills. */
import axios from 'axios';
import { brandLine } from '../../utils/printBranding';
import { inWords } from './BetaProforma';
import { STATUS, orderNoOf, bankLabel } from './BetaReceipt';

const n = v => parseFloat(v) || 0;
const AMT = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const amt = v => AMT.format(Number(v) || 0);
const esc = v => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const d = v => { const x = v ? new Date(v) : null; return x && !isNaN(x) ? `${String(x.getDate()).padStart(2, '0')}-${String(x.getMonth() + 1).padStart(2, '0')}-${x.getFullYear()}` : ''; };
const tidy = t => String(t || '').replace(/\s+,/g, ',').replace(/,(\s*,)+/g, ',').replace(/\s{2,}/g, ' ').replace(/,\s*$/, '').trim();
const now = () => new Date().toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

async function logoOf(co) {
  if (!co?.logoFileName) return '';
  try {
    const b = (await axios.get(`/api/companies/logo/${encodeURIComponent(co.logoFileName)}`, { params: { companyId: co.companyId }, responseType: 'blob' })).data;
    return await new Promise(res => { const rd = new FileReader(); rd.onload = () => res(rd.result); rd.readAsDataURL(b); });
  } catch { return ''; }
}

function printHtml(html, id) {
  document.getElementById(id)?.remove();
  const fr = document.createElement('iframe');
  fr.id = id;
  fr.setAttribute('aria-hidden', 'true');
  fr.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
  document.body.appendChild(fr);
  const w = fr.contentWindow;
  w.document.open(); w.document.write(html); w.document.close();
  setTimeout(() => { w.focus(); w.print(); window.focus(); setTimeout(() => fr.remove(), 1000); }, 400);
}

/* ── Receipt Advice ── */
export async function printReceiptAdvice({ rs, company, user, banks, soMap, client }) {
  const co = company || {}, h = rs[0], c = client || {};
  const logo = await logoOf(co);
  const total = rs.reduce((s, p) => s + n(p.amount), 0);
  const bank = banks.find(b => String(b.bankId) === String(h.bankId));
  const mode = h.paymentMode || (h.bankId ? 'Bank Transfer' : 'Cash');
  const refLabel = mode === 'Cheque' ? 'Cheque No.' : mode === 'DD' ? 'DD No.' : 'UTR / Txn No.';
  const dateLabel = mode === 'Cheque' ? 'Cheque Date' : mode === 'DD' ? 'DD Date' : 'Transaction Date';
  const st = STATUS[h.status];
  const stNote = h.status === 'confirmed' ? '' : `<small>${esc(st ? st[0] : h.status)}${h.status === 'pending' ? ' — awaiting approval' : ''}</small>`;
  const coAddr = tidy([co.address, co.city, [co.state, co.pincode].filter(Boolean).join(' - ')].filter(Boolean).join(', '));
  const clAddr = tidy([c.address, c.city, [c.state, c.pincode].filter(Boolean).join(' - ')].filter(Boolean).join(', '));

  const lines = rs.map((p, i) => {
    const o = soMap[String(p.orderId)] || {};
    return `<tr><td class="c">${i + 1}</td><td><b>${esc(orderNoOf(p, soMap))}</b></td><td class="c">${d(o.orderDate)}</td><td>${esc(o.customerPO || '')}</td><td class="c">${d(o.poDate)}</td><td class="r">${amt(p.amount)}</td></tr>`;
  }).join('');

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Receipt Advice ${esc(rs.map(p => p.paymentId).join('-'))}</title>
<style>
* { margin:0; padding:0; box-sizing:border-box; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
body { font-family:Arial, Helvetica, sans-serif; font-size:9pt; color:#000; background:#fff; line-height:1.35; }
table { width:100%; border-collapse:collapse; font-size:inherit; }
.doc > table { margin-top:-1px; } .doc > table:first-child { margin-top:0; }
.doc > table > tbody > tr > td, .doc > table > thead > tr > th { border:1px solid #000; padding:4px 7px; vertical-align:top; }
.c { text-align:center; } .r { text-align:right; white-space:nowrap; }
.lbl { font-size:7.4pt; color:#333; text-transform:uppercase; letter-spacing:.4px; margin-bottom:2px; }
.pn { font-size:10.5pt; font-weight:bold; margin-bottom:1px; }
.mut { color:#333; }
.kv td { border:0 !important; padding:1px 4px 1px 0 !important; }
.kv td:first-child { width:96px; color:#333; white-space:nowrap; } .kv td:nth-child(2) { width:8px; }
.co { display:flex; gap:10px; align-items:center; }
.co img { width:58px; height:58px; object-fit:contain; flex-shrink:0; }
.co .nm { font-size:13.5pt; font-weight:bold; }
.ttl { text-align:center; font-size:14pt; font-weight:bold; letter-spacing:3px; vertical-align:middle !important; }
.ttl small { display:block; margin-top:3px; font-size:8pt; font-weight:normal; letter-spacing:.4px; }
.hd th { background:#F5F5F5; font-weight:bold; font-size:8.4pt; text-align:center; }
tr.it td { border-top:0 !important; border-bottom:0 !important; }
tr.fill td { height:8mm; border-top:0 !important; }
tr.tot td { font-weight:bold; font-size:10.5pt; background:#F2F2F2; }
.ack { font-size:9.5pt; line-height:1.5; }
.sig { width:38%; height:24mm; text-align:right; vertical-align:bottom !important; }
.pby { display:flex; justify-content:space-between; font-size:7pt; color:#555; margin-top:3px; }
@media print { @page { margin:9mm; size:A4 portrait; } tr { break-inside:avoid; } }
</style></head><body>
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
      <td class="ttl">RECEIPT ADVICE${stNote}</td></tr>
    <tr><td><table class="kv"><tr><td>Receipt No.</td><td>:</td><td><b>${esc(rs.map(p => p.paymentId).join(', '))}</b></td></tr>
      <tr><td>Receipt Date</td><td>:</td><td><b>${d(h.date)}</b></td></tr></table></td></tr>
  </tbody>
</table>
<table>
  <colgroup><col style="width:55%"><col></colgroup>
  <tbody><tr>
    <td><div class="lbl">Received from</div>
      <div class="pn">${esc(c.companyName || c.clientName || h.party || h.entityName || '')}</div>
      ${clAddr ? `<div>${esc(clAddr)}</div>` : ''}
      ${c.gstin ? `<div>GSTIN: <b>${esc(c.gstin)}</b></div>` : ''}
      ${h.entityId ? `<div class="mut">Client ID: ${esc(h.entityId)}</div>` : ''}</td>
    <td><div class="lbl">Payment details</div>
      <table class="kv">
        <tr><td>Mode</td><td>:</td><td><b>${esc(mode)}</b></td></tr>
        ${h.bankId ? `<tr><td>${refLabel}</td><td>:</td><td><b>${esc(h.referenceNo || h.reference || '—')}</b></td></tr>
        <tr><td>${dateLabel}</td><td>:</td><td><b>${d(h.transactionDate || h.date)}</b></td></tr>
        <tr><td>Credited to</td><td>:</td><td>${esc(bank ? bank.bankName : bankLabel(banks, h.bankId))}${bank?.accountNumber ? ` — A/c ${esc(bank.accountNumber)}` : ''}</td></tr>` : `<tr><td>Received in</td><td>:</td><td>Cash</td></tr>`}
      </table></td>
  </tr></tbody>
</table>
<table>
  <colgroup><col style="width:30px"><col><col style="width:78px"><col><col style="width:78px"><col style="width:120px"></colgroup>
  <thead><tr class="hd"><th>Sl</th><th>Sales Order No.</th><th>Order Date</th><th>Client PO No.</th><th>PO Date</th><th>Amount (₹)</th></tr></thead>
  <tbody>
    ${lines.replace(/<tr>/g, '<tr class="it">')}
    <tr class="fill"><td></td><td></td><td></td><td></td><td></td><td></td></tr>
    <tr class="tot"><td colspan="5" class="r">Total Received</td><td class="r">₹ ${amt(total)}</td></tr>
    <tr><td colspan="6"><span class="lbl">Amount in words:</span> <b>${esc(inWords(total))}</b></td></tr>
    ${h.notes ? `<tr><td colspan="6"><span class="lbl">Remarks:</span> ${esc(h.notes)}</td></tr>` : ''}
  </tbody>
</table>
<table>
  <tbody><tr>
    <td class="ack">We acknowledge with thanks the receipt of <b>₹ ${amt(total)}</b> (${esc(inWords(total))}) from
      <b>${esc(c.companyName || c.clientName || h.party || h.entityName || '')}</b> by ${esc(mode)}${h.bankId && (h.referenceNo || h.reference) ? ` (${refLabel} ${esc(h.referenceNo || h.reference)} dated ${d(h.transactionDate || h.date)})` : ''},
      towards the sales order${rs.length > 1 ? 's' : ''} listed above.</td>
    <td class="sig"><div style="height:100%; display:flex; flex-direction:column; justify-content:space-between;"><b>for ${esc(co.companyName || co.name || '')}</b><span>Authorised Signatory</span></div></td>
  </tr></tbody>
</table>
</div>
<div class="pby"><span>${brandLine(user)}</span><span>Printed: ${esc(now())}</span></div>
</body></html>`;
  printHtml(html, 'rc-advice-frame');
}

/* ── Receipt List ── */
export async function printReceiptList({ groups, company, user, banks, soMap, filter }) {
  const co = company || {};
  const logo = await logoOf(co);
  const coAddr = tidy([co.address, co.city, co.state, co.pincode].filter(Boolean).join(', '));
  const total = groups.reduce((s, rs) => s + rs.reduce((t, p) => t + n(p.amount), 0), 0);

  const body = groups.map((rs, i) => {
    const h = rs[0], span = rs.length, st = STATUS[h.status];
    return rs.map((p, j) => '<tr>'
      + (j === 0 ? `<td rowspan="${span}" class="c">${i + 1}</td><td rowspan="${span}" class="c nw">${d(h.transactionDate || h.date)}</td><td rowspan="${span}">${esc(h.party || h.entityName)}</td>` : '')
      + `<td class="nw">${esc(orderNoOf(p, soMap))}</td><td>${esc(soMap[String(p.orderId)]?.customerPO || '')}</td>`
      + (j === 0 ? `<td rowspan="${span}" class="nw">${esc(bankLabel(banks, h.bankId))}</td>` : '')
      + `<td class="r">${amt(p.amount)}</td>`
      + (j === 0 ? `<td rowspan="${span}">${esc(h.notes || '')}</td><td rowspan="${span}" class="c nw">${esc(st ? st[0] : h.status || '')}</td>` : '')
      + '</tr>').join('');
  }).join('');

  // hairlines: 0.4pt black stripes (a CSS border prints at 0.75pt minimum) — same as the order list print
  const L = 'linear-gradient(#000,#000)', HW = '0.4pt';
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Receipt List</title>
<style>
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
.lst td { padding:2px 4px; vertical-align:middle;
  background-image:${L},${L},${L}; background-size:100% ${HW},${HW} 100%,${HW} 100%; background-position:0 100%,100% 0,0 0; }
.lst th { padding:4px 4px; font-weight:bold; text-align:center; white-space:nowrap;
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
  <div class="title">Receipt List</div>
  <div class="meta"><span>${esc(filter || '')}</span><span>${groups.length} receipts</span></div>
  <table class="lst">
    <thead>
      <tr class="gap"><th colspan="9"></th></tr>
      <tr><th style="width:24px">Sr</th><th>Txn Date</th><th>Client Name</th><th>Order No</th><th>Client PO No</th><th>Account</th><th>Receipt Amount</th><th>Remarks</th><th>Status</th></tr>
    </thead>
    <tfoot><tr class="gap"><td colspan="9"></td></tr></tfoot>
    <tbody>
      ${body}
      <tr class="tot"><td colspan="6">Total (${groups.length} receipts)</td><td class="r">${amt(total)}</td><td></td><td></td></tr>
    </tbody>
  </table>
  <div class="foot"><span>${brandLine(user)}</span><span>Printed: ${esc(now())}</span></div>
</div>
</body></html>`;
  printHtml(html, 'rc-list-frame');
}
