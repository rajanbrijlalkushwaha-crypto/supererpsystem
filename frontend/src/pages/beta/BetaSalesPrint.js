/* Sales bill print in our own format (Tax Invoice), A4 portrait, from a hidden frame on the same page.
 * Thin black lines, no black fills. Reads only the saved bill (+ its order for PO / payment terms). */
import axios from 'axios';
import { brandLine } from '../../utils/printBranding';
import { inWords } from './BetaProforma';
import { fillPage } from './BetaDCPrint';
import { previewFrame, prodText } from './printKit';

const n = v => parseFloat(v) || 0;
const AMT = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const amt = v => AMT.format(Number(v) || 0);
const QTY = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 3 });
const esc = v => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const d = v => { const x = v ? new Date(v) : null; return x && !isNaN(x) ? `${String(x.getDate()).padStart(2, '0')}-${MON[x.getMonth()]}-${x.getFullYear()}` : (v ? esc(v) : ''); };
const tidy = t => String(t || '').replace(/\r?\n/g, ', ').replace(/\s+,/g, ',').replace(/,(\s*,)+/g, ',').replace(/\s{2,}/g, ' ').replace(/,\s*$/, '').trim();
const now = () => new Date().toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

async function logoOf(co) {
  if (!co?.logoFileName) return '';
  try {
    const b = (await axios.get(`/api/companies/logo/${encodeURIComponent(co.logoFileName)}`, { params: { companyId: co.companyId }, responseType: 'blob' })).data;
    return await new Promise(res => { const rd = new FileReader(); rd.onload = () => res(rd.result); rd.readAsDataURL(b); });
  } catch { return ''; }
}

/* laid out at the printable A4 size so the blank item row can stretch the invoice to the bottom of the page */
function printHtml(html, id, collect, meta) {
  document.getElementById(id)?.remove();
  const fr = document.createElement('iframe');
  fr.id = id;
  fr.setAttribute('aria-hidden', 'true');
  fr.style.cssText = 'position:fixed;left:-10000px;top:0;width:194mm;height:281mm;border:0;visibility:hidden';
  document.body.appendChild(fr);
  const w = fr.contentWindow;
  w.document.open(); w.document.write(html); w.document.close();
  // collect: give back the laid-out page (for one PDF with other documents) instead of printing it
  return new Promise(res => setTimeout(() => {
    fillPage(w.document);
    if (collect) { const page = '<!DOCTYPE html>' + w.document.documentElement.outerHTML; fr.remove(); res({ page, meta: meta || {} }); return; }   // for one PDF with other documents
    previewFrame(fr, undefined, meta); res();
  }, 400));
}

export async function printSalesBill({ b: bill, order, company, user, collect }) {
  const co = company || {}, o = order || {};
  const b = { ...bill };
  // older bills have no QR saved — read them (and e-way / transport details) from the attached PDF; nothing is saved
  const hasPdf = (bill.attachments || []).some(a => /\.pdf$/i.test(a.fileName || ''));
  if (hasPdf && (!b.einvoiceQr || (b.ewayBillNo && !b.ewayQr) || !b.ewayFromName)) {
    try {
      const e = (await axios.get(`/api/bills/${bill.billId}/pdf-details`, { params: { companyId: co.companyId, type: 'sales' } })).data || {};
      Object.keys(e).forEach(k => { if ((b[k] == null || b[k] === '') && e[k] && typeof e[k] === 'string') b[k] = e[k]; });
    } catch { /* print without them */ }
  }
  const logo = await logoOf(co);
  const intra = b.gstType === 'intrastate' || (!b.gstType && n(b.totalCGST) > 0);
  const items = b.items || [];
  const coAddr = tidy([co.address, co.city, [co.state, co.pincode].filter(Boolean).join(' - ')].filter(Boolean).join(', '));
  const billAddr = tidy([b.billToAddress, b.billToCity, [b.billToState, b.billToPincode].filter(Boolean).join(' - ')].filter(Boolean).join(', '));
  const shipName = b.ewayToName || b.shipToName || b.partyName;
  const shipAddr = tidy(b.ewayShipTo || [b.shipToAddress, b.shipToCity, [b.shipToState, b.shipToPincode].filter(Boolean).join(' - ')].filter(Boolean).join(', '));
  const qtyTot = items.filter(li => li.unit !== 'LOT' || li.itemIdx != null).reduce((s, li) => s + n(li.qty), 0);
  const roundOff = Math.round(n(b.grandTotal)) - n(b.grandTotal);
  const payable = n(b.grandTotal) + roundOff;
  const kv = (k, v) => (v ? `<tr><td>${k}</td><td>:</td><td><b>${v}</b></td></tr>` : '');
  const taxCols = intra ? '<th>CGST</th><th>SGST</th>' : '<th>IGST</th>';
  const cols = intra ? 11 : 10;

  const rows = items.map((li, i) => {
    const g = n(li.gstAmt ?? (n(li.cgst) + n(li.sgst) + n(li.igst)));
    const charge = li.unit === 'LOT' && li.itemIdx == null;
    return `<tr class="it">
      <td class="c">${i + 1}</td>
      <td><b>${esc(li.description)}</b>${li.chargePct ? ` <span class="mut">(${QTY.format(li.chargePct)}% of taxable)</span>` : ''}</td>
      <td class="c">${esc(String(li.hsnCode || '').trim())}</td>
      <td class="r">${charge ? '' : QTY.format(n(li.qty))}</td><td class="c">${charge ? '' : esc(li.unit || '')}</td>
      <td class="r">${charge ? '' : amt(li.rate)}</td><td class="r">${amt(li.taxable)}</td><td class="c">${QTY.format(n(li.gstPct))}%</td>
      ${intra ? `<td class="r">${amt(li.cgst ?? g / 2)}</td><td class="r">${amt(li.sgst ?? g / 2)}</td>` : `<td class="r">${amt(li.igst ?? g)}</td>`}
      <td class="r">${amt(n(li.taxable) + g)}</td></tr>`;
  }).join('');

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Tax Invoice ${esc(b.billNo || b.billId)}</title>
<style>
* { margin:0; padding:0; box-sizing:border-box; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
body { font-family:Arial, Helvetica, sans-serif; font-size:8.6pt; color:#000; background:#fff; line-height:1.35; }
table { width:100%; border-collapse:collapse; font-size:inherit; }
.doc > table { margin-top:-1px; } .doc > table:first-child { margin-top:0; }
.doc > table > tbody > tr > td, .doc > table > thead > tr > th { border:1px solid #000; padding:4px 6px; vertical-align:top; }
.c { text-align:center; } .r { text-align:right; white-space:nowrap; }
.lbl { font-size:7.2pt; color:#333; text-transform:uppercase; letter-spacing:.4px; margin-bottom:2px; }
.pn { font-size:10pt; font-weight:bold; margin-bottom:1px; }
.mut { color:#333; font-size:7.8pt; }
.kv td { border:0 !important; padding:1px 4px 1px 0 !important; vertical-align:top; }
.kv td:first-child { width:96px; color:#333; white-space:nowrap; } .kv td:nth-child(2) { width:8px; }
.co { display:flex; gap:10px; align-items:center; }
.co img { width:56px; height:56px; object-fit:contain; flex-shrink:0; }
.co .nm { font-size:13pt; font-weight:bold; }
.ttl { text-align:center; font-size:13pt; font-weight:bold; letter-spacing:3px; padding:2px 0; }
.irn { margin-top:3px; } .irn b { font-family:Consolas, monospace; font-size:7.8pt; word-break:break-all; }
.qr { text-align:center; vertical-align:middle !important; font-size:7pt; }
.qr img { width:27mm; height:27mm; image-rendering:pixelated; display:block; margin:0 auto 2px; }
.sec { font-weight:bold; font-size:8.4pt; background:#F5F5F5; padding:3px 6px !important; }
.kv.ew td:first-child { width:84px; }
.hd th { background:#F5F5F5; font-weight:bold; font-size:7.8pt; text-align:center; padding:4px 3px !important; }
tr.it td { border-top:0 !important; border-bottom:0 !important; }
tr.fill td { height:10mm; border-top:0 !important; }
tr.tot td { font-weight:bold; background:#F2F2F2; }
.sum td { border:0 !important; padding:2px 0 !important; } .sum td:last-child { text-align:right; white-space:nowrap; }
.sum tr.gt td { font-weight:bold; font-size:10pt; border-top:1px solid #000 !important; padding-top:4px !important; }
.sig { height:22mm; text-align:right; vertical-align:bottom !important; }
.sig.cust { text-align:left; } .sig.cust span { font-size:7.6pt; color:#333; }
.foot { display:flex; flex-direction:column; align-items:center; gap:1px; padding:4px 0 0; font-size:8pt; }
.foot span { font-size:7.6pt; color:#333; }
.pby { display:flex; justify-content:space-between; font-size:7pt; color:#555; margin-top:3px; }
@media print { @page { margin:8mm; size:A4 portrait; } tr { break-inside:avoid; } }
</style></head><body>
<div class="doc">
<table>
  <colgroup><col>${b.einvoiceQr ? '<col style="width:33mm">' : ''}</colgroup>
  <tbody><tr>
    <td style="vertical-align:middle"><div class="ttl">TAX INVOICE</div>
      ${b.irnNo || b.acknNo ? `<table class="kv irn">
        ${kv('IRN', esc(b.irnNo || ''))}${kv('Ack No.', esc(b.acknNo || ''))}${kv('Ack Date', d(b.acknDate))}
      </table>` : ''}</td>
    ${b.einvoiceQr ? `<td class="qr"><img src="${b.einvoiceQr}" alt=""><div>e-Invoice QR</div></td>` : ''}
  </tr></tbody>
</table>
<table>
  <colgroup><col style="width:52%"><col></colgroup>
  <tbody><tr>
    <td><div class="co">${logo ? `<img src="${logo}" alt="">` : ''}<div>
      <div class="nm">${esc(co.companyName || co.name || '')}</div>
      ${coAddr ? `<div>${esc(coAddr)}</div>` : ''}
      <div>${[co.gstin && `GSTIN: <b>${esc(co.gstin)}</b>`, co.state && `State: ${esc(co.state)}`].filter(Boolean).join(' &nbsp;|&nbsp; ')}</div>
      <div>${[co.phone && `Ph: ${esc(co.phone)}`, co.email && `Email: ${esc(co.email)}`].filter(Boolean).join(' &nbsp;|&nbsp; ')}</div>
    </div></div></td>
    <td><table class="kv">
      ${kv('Invoice No.', esc(b.billNo || b.billId))}
      ${kv('Invoice Date', d(b.billDate))}
      ${kv('Sales Order', esc(b.orderNo || ''))}
      ${kv("Buyer's Order No.", esc(o.customerPO || '') + (o.poDate ? ` <span class="mut">dt. ${d(o.poDate)}</span>` : ''))}
      ${kv('Payment Terms', esc(o.paymentTerms || ''))}
    </table></td>
  </tr></tbody>
</table>
<table>
  <colgroup><col style="width:50%"><col></colgroup>
  <tbody><tr>
    <td><div class="lbl">Buyer (Bill to)</div>
      <div class="pn">${esc(b.billToName || b.partyName || '')}</div>
      ${billAddr ? `<div>${esc(billAddr)}</div>` : ''}
      <div>${[b.partyGstin && `GSTIN: <b>${esc(b.partyGstin)}</b>`, b.partyState && `State: ${esc(b.partyState)}`].filter(Boolean).join(' &nbsp;|&nbsp; ')}</div></td>
    <td><div class="lbl">Consignee (Ship to)</div>
      <div class="pn">${esc(shipName || '')}</div>
      ${shipAddr ? `<div>${esc(shipAddr)}</div>` : ''}
      ${(b.ewayToGstin || b.ewayToState) ? `<div>${[b.ewayToGstin && `GSTIN: <b>${esc(b.ewayToGstin)}</b>`, b.ewayToState && `State: ${esc(b.ewayToState)}`].filter(Boolean).join(' &nbsp;|&nbsp; ')}</div>` : ''}</td>
  </tr>
  ${b.dispatchFrom ? `<tr><td colspan="2"><span class="lbl">Dispatch From:</span> ${esc(tidy(b.dispatchFrom))}</td></tr>` : ''}
  </tbody>
</table>
${b.ewayBillNo ? `<table>
  <colgroup><col><col><col>${b.ewayQr ? '<col style="width:30mm">' : ''}</colgroup>
  <tbody>
    <tr><td colspan="3" class="sec">E-Way Bill Details</td>${b.ewayQr ? `<td rowspan="2" class="qr"><img src="${b.ewayQr}" alt=""><div>E-Way Bill QR</div></td>` : ''}</tr>
    <tr>
      <td><table class="kv ew">${kv('E-Way Bill No.', esc(b.ewayBillNo))}${kv('Generated On', esc(b.ewayGenDate || ''))}${kv('Valid Upto', esc(b.ewayValidUpto || ''))}${kv('Generated By', esc(b.ewayGeneratedBy || ''))}${kv('Mode', esc(b.ewayMode || ''))}${kv('Distance', b.approxDistanceKm ? esc(b.approxDistanceKm) + ' KM' : '')}</table></td>
      <td><table class="kv ew">${kv('Supply Type', esc(b.supplyType || ''))}${kv('Transaction', esc(b.transactionType || ''))}${kv('Transporter ID', esc(b.transporterId || '') || '—')}${kv('Transporter', esc(b.transporterName || '') || '—')}${kv('Doc No.', esc(b.transDocNo || '') || '—')}${kv('Doc Date', esc(b.transDocDate || '') || '—')}</table></td>
      <td><table class="kv ew">${kv('Vehicle No.', esc(b.vehicleNo || ''))}${kv('Vehicle From', esc(b.vehicleFromCity || ''))}${kv('CEWB No.', esc(b.cewbNo || '') || '—')}</table></td>
    </tr>
  </tbody>
</table>` : ''}
<table>
  <colgroup><col style="width:24px"><col><col style="width:58px"><col style="width:44px"><col style="width:34px"><col style="width:72px"><col style="width:78px"><col style="width:36px">${intra ? '<col style="width:64px"><col style="width:64px">' : '<col style="width:70px">'}<col style="width:82px"></colgroup>
  <thead><tr class="hd"><th>Sl</th><th>Description of Goods / Services</th><th>HSN/SAC</th><th>Qty</th><th>Unit</th><th>Rate</th><th>Taxable</th><th>GST</th>${taxCols}<th>Amount (₹)</th></tr></thead>
  <tbody>
    ${rows}
    <tr class="fill" id="fillrow">${'<td></td>'.repeat(cols)}</tr>
    <tr class="tot"><td></td><td class="r">Total</td><td></td><td class="r">${QTY.format(qtyTot)}</td><td></td><td></td><td class="r">${amt(b.subTotal)}</td><td></td>
      ${intra ? `<td class="r">${amt(b.totalCGST)}</td><td class="r">${amt(b.totalSGST)}</td>` : `<td class="r">${amt(b.totalIGST)}</td>`}<td class="r">${amt(b.grandTotal)}</td></tr>
  </tbody>
</table>
<table>
  <colgroup><col style="width:60%"><col></colgroup>
  <tbody><tr>
    <td><div class="lbl">Amount chargeable (in words)</div><b>${esc(inWords(payable))}</b></td>
    <td><table class="sum">
      <tr><td>Taxable value</td><td>${amt(b.subTotal)}</td></tr>
      ${intra ? `<tr><td>CGST</td><td>${amt(b.totalCGST)}</td></tr><tr><td>SGST</td><td>${amt(b.totalSGST)}</td></tr>` : `<tr><td>IGST</td><td>${amt(b.totalIGST)}</td></tr>`}
      ${Math.abs(roundOff) >= 0.005 ? `<tr><td>Round off</td><td>${roundOff > 0 ? '+' : '−'} ${amt(Math.abs(roundOff))}</td></tr>` : ''}
      <tr class="gt"><td>Invoice Total</td><td>₹ ${amt(payable)}</td></tr>
    </table></td>
  </tr></tbody>
</table>
<table>
  <colgroup><col style="width:46%"><col style="width:27%"><col></colgroup>
  <tbody><tr>
    <td>${co.bankName || co.bankAccount ? `<div class="lbl">Company's bank details</div>
      <table class="kv">${kv('Bank', esc(co.bankName || ''))}${kv('A/c No.', esc(co.bankAccount || ''))}${kv('Branch &amp; IFSC', esc([co.bankBranch, co.bankIfsc].filter(Boolean).join(' & ')))}</table>` : ''}
      ${co.pan ? `<div style="margin-top:3px">Company's PAN: <b>${esc(co.pan)}</b></div>` : ''}
      <div class="lbl" style="margin-top:5px">Declaration</div>
      <div class="mut">We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.</div></td>
    <td class="sig cust"><div style="height:100%; display:flex; flex-direction:column; justify-content:space-between;"><b>Customer's Seal &amp; Signature</b><span></span></div></td>
    <td class="sig"><div style="height:100%; display:flex; flex-direction:column; justify-content:space-between;"><b>for ${esc(co.companyName || co.name || '')}</b><span>Authorised Signatory</span></div></td>
  </tr></tbody>
</table>
<div class="foot">${co.city ? `<b>SUBJECT TO ${esc(String(co.city).toUpperCase())} JURISDICTION</b>` : ''}<span>This is a Computer Generated Invoice</span></div>
</div>
<div class="pby"><span>${brandLine(user)}</span><span>Printed: ${esc(now())}</span></div>
</body></html>`;
  // e-mail and e-signatures
  const goods = items.filter(li => !(li.unit === 'LOT' && li.itemIdx == null));
  const poRef = [o.customerPO, o.poDate && `dt. ${d(o.poDate)}`].filter(Boolean).join(' ');
  const meta = {
    sign: bill.billId ? { type: 'salesBill', id: bill.billId, perm: 'salesBill' } : null,
    reprint: () => printSalesBill({ b: bill, order, company, user }),
    to: o.billToEmail || o.email || undefined,
    mail: {
      subject: `Tax Invoice ${b.billNo || b.billId}${o.customerPO ? ` against your PO ${poRef}` : ''} – ${prodText(goods.map(li => li.description))}`,
      message: `Dear ${o.billToContact || o.contactPerson || 'Sir / Madam'},\n\nPlease find attached our Tax Invoice ${b.billNo || b.billId}${b.billDate ? ` dated ${d(b.billDate)}` : ''}${o.customerPO ? ` against your purchase order ${poRef}` : ''}.\n\nKindly arrange the payment of ₹ ${amt(payable)} as per the agreed terms and share the payment details with us.`,
      summary: [['Invoice', `${b.billNo || b.billId}${b.billDate ? `  ·  ${d(b.billDate)}` : ''}`], ['Your PO', poRef], ['Our sales order', o.orderNo || ''],
        ['Products', goods.map(li => `${li.description} — ${n(li.qty)} ${li.unit || ''}`.trim()).join('\n')], ['Invoice amount', `₹ ${amt(payable)}`], ['E-way bill', b.ewayBillNo || ''], ['Payment terms', o.paymentTerms || '']],
    },
  };
  return printHtml(html, `sb-bill-frame${collect ? '-c' : ''}`, collect, meta);
}
