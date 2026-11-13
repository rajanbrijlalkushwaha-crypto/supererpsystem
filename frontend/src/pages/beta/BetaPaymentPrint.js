/* Payment Advice — one vendor payment (all POs it covers), like the Receipt Advice but for the vendor.
 * Thin black lines, no black fills; printed on the same page through a hidden frame; fills one A4 page. */
import { logoOf, ADV_CSS } from './BetaDuesPrint';
import { fillPage } from './BetaDCPrint';
import { brandLine } from '../../utils/printBranding';
import { inWords } from './BetaProforma';
import { previewFrame } from './printKit';

const n = v => parseFloat(v) || 0;
const AMT = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const amt = v => AMT.format(Number(v) || 0);
const PLAIN = new Intl.NumberFormat('en-IN', { useGrouping: false, maximumFractionDigits: 2 });
const num = v => PLAIN.format(Number(v) || 0);
const esc = v => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const d = v => { const x = v ? new Date(v) : null; return x && !isNaN(x) ? `${String(x.getDate()).padStart(2, '0')}-${String(x.getMonth() + 1).padStart(2, '0')}-${x.getFullYear()}` : ''; };
const tidy = t => String(t || '').replace(/\s*[\r\n]+\s*/g, ', ').replace(/\s+,/g, ',').replace(/,(\s*,)+/g, ',').replace(/\s{2,}/g, ' ').replace(/,\s*$/, '').trim();
const now = () => new Date().toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const STATUS = { draft: 'Draft', pending: 'Pending approval', rejected: 'Rejected' };

const CSS = ADV_CSS + `
.doc > table > tbody > tr > td, .doc > table > thead > tr > th, .doc > table > thead > tr > td { border-width:.5px; }
.sec td { text-align:center; }
.kv td:first-child { width:96px; }
.ls tbody tr.pr td { border-top:0 !important; border-bottom:0 !important; }
.ls tbody tr.fill td { height:1mm; border-top:0 !important; border-bottom:0 !important; }
.ls tbody tr.st td { border-top:.5px solid #000 !important; }
.ack { font-size:9.2pt; line-height:1.5; }
.sg td { height:24mm; vertical-align:top !important; }
.sg .box { height:100%; display:flex; flex-direction:column; justify-content:space-between; }
.pby { color:#000; font-weight:bold; font-size:7.6pt; }
@media print { @page { margin:8mm; size:A4 portrait; } }
`;

/* p: the payment · allocs: [{orderId, poNo, amount}] · poMap / soMap: by id · vendor: the vendor record */
export async function printPaymentAdvice({ p, allocs, poMap, soMap, vendor, company, user, banks }) {
  const co = company || {}, v = vendor || {};
  const logo = await logoOf(co);
  const total = n(p.amount);
  const bank = (banks || []).find(b => String(b.bankId) === String(p.bankId));
  const mode = p.paymentMode || (p.bankId ? 'Bank Transfer' : 'Cash');
  const refLabel = mode === 'Cheque' ? 'Cheque No.' : mode === 'DD' ? 'DD No.' : 'UTR / Txn No.';
  const dateLabel = mode === 'Cheque' ? 'Cheque Date' : mode === 'DD' ? 'DD Date' : 'Transaction Date';
  const ref = p.referenceNo || p.reference || '';
  const stNote = p.status && p.status !== 'confirmed' ? `<small>${esc(STATUS[p.status] || p.status)}</small>` : '';
  const vName = v.vendorName || p.party || p.entityName || '';
  const coAddr = tidy([co.address, co.city, [co.state, co.pincode].filter(Boolean).join(' - ')].filter(Boolean).join(', '));
  const vAddr = tidy([v.address, v.city, [v.state, v.pincode].filter(Boolean).join(' - ')].filter(Boolean).join(', '));
  const ct = (v.contactPersons || []).find(x => x && (x.name || x.mobileNumber)) || {};
  const contact = [ct.name || v.contactPerson, ct.mobileNumber || v.mobile, ct.email || v.email].filter(Boolean).join(', ');

  // one line per product of each PO; the PO columns span its product lines
  const lines = allocs.map((a, i) => {
    const po = poMap[String(a.orderId)] || {}, so = soMap[String(po.linkedSalesOrderId)] || {};
    const its = (po.items || []).filter(it => it && (it.itemName || it.description));
    const rows = its.length ? its : [null], span = rows.length;
    return rows.map((it, j) => '<tr class="pr">'
      + (j === 0 ? `<td rowspan="${span}" class="c">${i + 1}</td><td rowspan="${span}"><b>${esc(a.poNo || po.poNo || a.orderId || '—')}</b></td><td rowspan="${span}" class="c" style="white-space:nowrap">${d(po.poDate)}</td><td rowspan="${span}">${esc(so.orderNo || '')}</td>` : '')
      + (it ? `<td>${esc(it.itemName || it.description)}</td><td class="r" style="white-space:nowrap">${num(it.qty)} ${esc(it.unit || '')}</td>` : '<td></td><td></td>')
      + (j === 0 ? `<td rowspan="${span}" class="r">${po.grandTotal ? amt(po.grandTotal) : ''}</td><td rowspan="${span}" class="r">${amt(a.amount)}</td>` : '')
      + '</tr>').join('');
  }).join('');

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Payment Advice ${esc(p.paymentId)}</title>
<style>${CSS}</style></head><body>
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
      <td class="ttl">PAYMENT ADVICE${stNote}</td></tr>
    <tr><td><table class="kv">
      <tr><td>Advice Date</td><td>:</td><td><b>${d(new Date())}</b></td></tr>
      <tr><td>Payment No.</td><td>:</td><td><b>${esc(p.paymentId)}</b></td></tr>
      <tr><td>Payment Date</td><td>:</td><td><b>${d(p.transactionDate || p.date)}</b></td></tr>
    </table></td></tr>
  </tbody>
</table>
<table>
  <colgroup><col style="width:55%"><col></colgroup>
  <tbody><tr>
    <td><div class="lbl">Paid to (Vendor)</div>
      <div class="pn">${esc(vName)}</div>
      ${vAddr ? `<div>${esc(vAddr)}</div>` : ''}
      ${v.gstin ? `<div>GSTIN: <b>${esc(v.gstin)}</b></div>` : ''}
      ${contact ? `<div>Contact: <b>${esc(contact)}</b></div>` : ''}
      ${p.entityId ? `<div>Vendor ID: ${esc(p.entityId)}</div>` : ''}</td>
    <td><div class="lbl">Payment details</div>
      <table class="kv">
        <tr><td>Mode</td><td>:</td><td><b>${esc(mode)}</b></td></tr>
        ${p.bankId ? `<tr><td>${refLabel}</td><td>:</td><td><b>${esc(ref || '—')}</b></td></tr>
        <tr><td>${dateLabel}</td><td>:</td><td><b>${d(p.transactionDate || p.date)}</b></td></tr>
        <tr><td>Paid from</td><td>:</td><td>${esc(bank ? bank.bankName : 'Bank')}${bank?.accountNumber ? ` — A/c ${esc(bank.accountNumber)}` : ''}</td></tr>` : '<tr><td>Paid from</td><td>:</td><td>Cash</td></tr>'}
        ${v.accountNo ? `<tr><td>Credited to</td><td>:</td><td>${esc([v.bankName, v.accountNo && `A/c ${v.accountNo}`, v.ifsc && `IFSC ${v.ifsc}`].filter(Boolean).join(' — '))}</td></tr>` : ''}
      </table></td>
  </tr></tbody>
</table>
<table class="ls">
  <colgroup><col style="width:26px"><col style="width:17%"><col style="width:76px"><col style="width:14%"><col><col style="width:62px"><col style="width:90px"><col style="width:92px"></colgroup>
  <thead>
    <tr class="sec"><td colspan="8">Purchase orders paid</td></tr>
    <tr class="hd"><th>Sl</th><th>PO No.</th><th>PO Date</th><th>Sales Order No.</th><th>Product</th><th>Qty</th><th>PO Value</th><th>Amount (₹)</th></tr>
  </thead>
  <tbody>
    ${lines || `<tr class="pr"><td colspan="7">On account</td><td class="r">${amt(total)}</td></tr>`}
    <tr class="fill" id="fillrow"><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
    <tr class="st"><td colspan="7" class="r" style="font-size:10.5pt">Total Paid</td><td class="r" style="font-size:10.5pt">₹ ${amt(total)}</td></tr>
  </tbody>
</table>
<table>
  <tbody>
    <tr><td><span class="lbl">Amount in words:</span> <b>${esc(inWords(total))}</b></td></tr>
    ${p.notes ? `<tr><td><span class="lbl">Narration:</span> ${esc(p.notes)}</td></tr>` : ''}
    <tr><td class="ack">We have paid <b>₹ ${amt(total)}</b> (${esc(inWords(total))}) to <b>${esc(vName)}</b> by ${esc(mode)}${p.bankId && ref ? ` (${refLabel} ${esc(ref)} dated ${d(p.transactionDate || p.date)})` : ''},
      towards the purchase order${allocs.length > 1 ? 's' : ''} listed above. Kindly acknowledge the receipt.</td></tr>
  </tbody>
</table>
<table class="sg">
  <colgroup><col style="width:50%"><col></colgroup>
  <tbody><tr>
    <td><div class="box"><b>Received by: ${esc(vName)}</b><b>Signature &amp; Seal</b></div></td>
    <td><div class="box" style="text-align:right"><b>for ${esc(co.companyName || co.name || '')}</b><b>Authorised Signatory</b></div></td>
  </tr></tbody>
</table>
</div>
<div class="pby" style="display:flex;justify-content:space-between;margin-top:3px"><span>${brandLine(user)}</span><span>Printed: ${esc(now())}</span></div>
</body></html>`;

  document.getElementById('pa-print-frame')?.remove();
  const fr = document.createElement('iframe');
  fr.id = 'pa-print-frame'; fr.setAttribute('aria-hidden', 'true');
  fr.style.cssText = 'position:fixed;left:-10000px;top:0;width:194mm;height:281mm;border:0;visibility:hidden';
  document.body.appendChild(fr);
  const w = fr.contentWindow;
  w.document.open(); w.document.write(html); w.document.close();
  await new Promise(res => setTimeout(res, 400));
  fillPage(w.document);
  previewFrame(fr);   // opens the preview: Email · Save PDF · Print
}
