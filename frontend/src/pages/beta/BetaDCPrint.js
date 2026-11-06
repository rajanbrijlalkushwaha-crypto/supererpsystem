/* Delivery Challan print (our format), A4 portrait, from a hidden frame on the same page.
 * Thin black lines, no black fills. Shows products sent on this DC, the add-on items sent with them,
 * the e-way bill / transport details and the bill it relates to. */
import axios from 'axios';
import QRCode from 'qrcode';
import { ewayQrText } from './BetaEwayJson';

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
function printHtml(html, id, collect) {
  document.getElementById(id)?.remove();
  const fr = document.createElement('iframe');
  fr.id = id; fr.setAttribute('aria-hidden', 'true');
  // laid out at the printable A4 width (210 − 2×8 mm) so the measured heights match the printed page
  fr.style.cssText = 'position:fixed;left:-10000px;top:0;width:194mm;height:281mm;border:0;visibility:hidden';
  document.body.appendChild(fr);
  const w = fr.contentWindow;
  w.document.open(); w.document.write(html); w.document.close();
  // collect: give back the laid-out page (for one PDF with other documents) instead of printing it
  return new Promise(res => setTimeout(() => {
    fillPage(w.document);
    if (collect) { const page = '<!DOCTYPE html>' + w.document.documentElement.outerHTML; fr.remove(); res(page); return; }
    w.focus(); w.print(); window.focus(); setTimeout(() => fr.remove(), 1000); res();
  }, 400));
}

/* print several documents (each a laid-out page from collect: true) as ONE PDF — made on the server */
export async function printMerged(pages) {
  const r = await axios.post('/api/print-merge', { htmls: pages }, { responseType: 'blob' });
  const url = URL.createObjectURL(new Blob([r.data], { type: 'application/pdf' }));
  document.getElementById('merge-print-frame')?.remove();
  const fr = document.createElement('iframe');
  fr.id = 'merge-print-frame'; fr.setAttribute('aria-hidden', 'true');
  fr.style.cssText = 'position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0';
  fr.onload = () => setTimeout(() => { try { fr.contentWindow.focus(); fr.contentWindow.print(); } catch { window.open(url, '_blank'); } }, 300);
  fr.src = url;
  document.body.appendChild(fr);
  setTimeout(() => { fr.remove(); URL.revokeObjectURL(url); }, 10 * 60 * 1000);
}
/* grow the blank row under the goods so a one-page challan reaches the bottom of the A4 page */
/* the delivery challans of a sales bill: made against it, or made first and tied to it later */
export const dcsOfBill = (bill, dcs) => (dcs || []).filter(d => d && d.status !== 'deleted' && bill
  && (String(d.linkedBillId || '') === String(bill.billId) || String(d.linkedInvoiceId || '') === String(bill.billId)));
/* the sales bill of a delivery challan (if any) */
export const billOfDc = (dc, bills) => {
  const id = String((dc && (dc.linkedBillId || dc.linkedInvoiceId)) || '');
  return id ? (bills || []).find(b => b && String(b.billId) === id) || null : null;
};

export function fillPage(doc) {
  const fill = doc.getElementById('fillrow'), body = doc.querySelector('.doc'), foot = doc.querySelector('.pby');
  if (!fill || !body) return;
  const probe = doc.createElement('div'); probe.style.cssText = 'position:absolute;visibility:hidden;height:281mm;width:1px';
  doc.body.appendChild(probe);
  const page = probe.getBoundingClientRect().height; probe.remove();
  const used = body.getBoundingClientRect().height + (foot ? foot.getBoundingClientRect().height + 4 : 0);
  const spare = Math.floor(page - used - 6);
  if (spare <= 0 || used >= page) return;
  const h = fill.getBoundingClientRect().height + spare;   // measured once — growing one cell grows the whole row
  fill.querySelectorAll('td').forEach(td => { td.style.height = h + 'px'; });
}

/* one A4 page when it nearly fits: shrink the whole document (up to 25%) if it is a little taller than the page;
   a much longer document is left as it is and runs on to more pages instead of becoming unreadably small */
export function fitPage(doc, pageMm = 281) {
  try {
    const probe = doc.createElement('div'); probe.style.cssText = `position:absolute;visibility:hidden;height:${pageMm}mm;width:1px`;
    doc.body.appendChild(probe);
    const page = probe.getBoundingClientRect().height; probe.remove();
    const h = doc.body.scrollHeight;
    if (page > 0 && h > page && page / h >= 0.75) doc.body.style.zoom = String(Math.floor((page - 4) / h * 1000) / 1000);
  } catch { /* print as is */ }
}

/* withValue (chosen at print time): true → rate, taxable, GST and amount; false → quantities only */
export async function printDC({ dc, company, user, withValue: wv, collect }) {
  const co = company || {};
  const logo = await logoOf(co);
  const items = (dc.items || []).filter(it => n(it.qty) > 0);
  const addons = (dc.addons || []).filter(a => n(a.qty) > 0);
  const coAddr = tidy([co.address, co.city, [co.state, co.pincode].filter(Boolean).join(' - ')].filter(Boolean).join(', '));
  const billAddr = tidy([dc.billingAddress, dc.billingCity, [dc.billingState, dc.billingPincode].filter(Boolean).join(' - ')].filter(Boolean).join(', '));
  const shipAddr = tidy([dc.shippingAddress, dc.shippingCity, [dc.shippingState, dc.shippingPincode].filter(Boolean).join(' - ')].filter(Boolean).join(', '));
  const kv = (k, v) => (v ? `<tr><td>${k}</td><td>:</td><td><b>${v}</b></td></tr>` : '');
  const qtyTot = items.reduce((s, it) => s + n(it.qty), 0) + addons.reduce((s, a) => s + n(a.qty), 0);
  const withValue = wv == null ? dc.withValue !== false : !!wv;
  const coSt = String(co.state || '').trim().toLowerCase(), toSt = String(dc.billingState || '').trim().toLowerCase();
  const intra = dc.gstSplit ? dc.gstSplit === 'intra' : !!(coSt && toSt && coSt === toSt);
  const lines = items.map(it => { const t = n(it.qty) * n(it.rate), g = t * n(it.gst) / 100; return { it, t, g }; });
  const valTot = lines.reduce((s, l) => s + l.t, 0), gstTot = lines.reduce((s, l) => s + l.g, 0);
  const cancelled = dc.ewayStatus === 'cancelled';
  let qr = '';
  try { const txt = ewayQrText(dc, co); if (txt && !cancelled) qr = await QRCode.toDataURL(txt, { margin: 0, width: 220, errorCorrectionLevel: 'M' }); } catch { qr = ''; }
  // the tax invoice is shown only when it was made before / with this DC
  const billFirst = (dc.dcType === 'against-bill' || dc.dcType === 'with-bill') && dc.invoiceNo;
  const dispatchFrom = tidy(dc.dispatchFrom || [co.address, dc.dispatchPlace || co.city, [dc.dispatchState || co.state, dc.dispatchPincode || co.pincode].filter(Boolean).join(' - ')].filter(Boolean).join(', '));

  const who = u => (u ? (typeof u === 'string' ? u : u.name || u.username || '') : '');
  const createdBy = who(dc.createdBy) || who(dc.audit && dc.audit[0] && dc.audit[0].by) || '—';
  const printedBy = (user && (user.name || user.username)) || '—';
  const transportLine = [
    dc.transporterName && `Transporter: <b>${esc(dc.transporterName)}</b>`,
    dc.transporterId && `Transporter ID: <b>${esc(dc.transporterId)}</b>`, (dc.transDocNo || dc.transDocDate) && `LR / Doc No.: <b>${esc([dc.transDocNo, dc.transDocDate].filter(Boolean).join(' / '))}</b>`,
    dc.dispatchThrough && `Dispatched By: <b>${esc(dc.dispatchThrough)}</b>`,
  ].filter(Boolean).join(' &nbsp;|&nbsp; ');
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Delivery Challan ${esc(dc.dcNo || dc.dcId)}</title>
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
.kv td:first-child { width:92px; color:#333; white-space:nowrap; } .kv td:nth-child(2) { width:8px; }
.co { display:flex; gap:10px; align-items:center; } .co img { width:56px; height:56px; object-fit:contain; flex-shrink:0; }
.co .nm { font-size:13pt; font-weight:bold; }
.ttl { text-align:center; font-size:13pt; font-weight:bold; letter-spacing:3px; padding:5px !important; }
.sec { font-weight:bold; font-size:8.4pt; background:#F5F5F5; padding:3px 6px !important; }
.sec .cx { color:#000; font-weight:bold; letter-spacing:.5px; }
.ttl small { display:block; margin-top:2px; font-size:7.6pt; font-weight:normal; letter-spacing:1.5px; }
.qr { text-align:center; vertical-align:middle !important; font-size:7pt; }
.qr img { width:26mm; height:26mm; display:block; margin:0 auto 2px; }
.hd th { background:#F5F5F5; font-weight:bold; font-size:7.8pt; text-align:center; padding:4px 3px !important; }
tr.it td { border-top:0 !important; border-bottom:0 !important; }
tr.fill td { height:8mm; border-top:0 !important; }
tr.tot td { font-weight:bold; background:#F2F2F2; }
.notes { min-height:12mm; color:#000; font-weight:bold; font-size:8.4pt; }
.sg { vertical-align:top !important; } .sg b { font-size:9pt; } .sg .sp { height:16mm; }
.sg .sl { font-size:8.4pt; color:#000; font-weight:bold; }
.sg .tri { display:flex; justify-content:space-between; font-size:8.4pt; color:#000; font-weight:bold; }
.sec.c { text-align:center; }
.foot { text-align:center; padding:4px 0 0; font-size:8.4pt; color:#000; font-weight:bold; }
.pby { display:flex; justify-content:space-between; font-size:7.6pt; color:#000; font-weight:bold; margin-top:3px; }
.inc { font-style:italic; color:#333; } .ao { font-size:7.6pt; color:#444; font-weight:normal; }
@media print { @page { margin:8mm; size:A4 portrait; } tr { break-inside:avoid; } }
</style></head><body>
<div class="doc">
<table><tbody><tr><td class="ttl">DELIVERY CHALLAN</td></tr></tbody></table>
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
      ${kv('DC No.', esc(dc.dcNo || dc.dcId))}${kv('DC Date', d(dc.dcDate))}${kv('Sales Order', esc(dc.orderNo || ''))}
      ${kv("Buyer's Order No.", esc(dc.clientOrderNo || '') + (dc.clientPoDate ? ` <span class="mut">dt. ${d(dc.clientPoDate)}</span>` : ''))}${!dc.ewayBillNo ? kv('Vehicle No.', esc(dc.vehicleNo || '')) : ''}
      ${billFirst ? kv('Tax Invoice No.', esc(dc.invoiceNo)) + kv('Invoice Date', d(dc.invoiceDate)) : ''}

    </table></td>
  </tr>
  </tbody>
</table>
<table>
  <colgroup><col style="width:50%"><col></colgroup>
  <tbody><tr>
    <td><div class="lbl">Buyer (Bill to)</div><div class="pn">${esc(dc.customerName || '')}</div>${billAddr ? `<div>${esc(billAddr)}</div>` : ''}
      <div>${[dc.customerGstin && `GSTIN: <b>${esc(dc.customerGstin)}</b>`, dc.billingState && `State: ${esc(dc.billingState)}`].filter(Boolean).join(' &nbsp;|&nbsp; ')}</div></td>
    <td><div class="lbl">Consignee (Ship to)</div><div class="pn">${esc(dc.shippingName || dc.customerName || '')}</div>${shipAddr ? `<div>${esc(shipAddr)}</div>` : ''}
      ${dc.shippingMobile ? `<div>Contact: ${esc(dc.shippingMobile)}</div>` : ''}</td>
  </tr>
  ${dispatchFrom ? `<tr><td colspan="2"><span class="lbl">Dispatch From:</span> ${esc(dispatchFrom)}</td></tr>` : ''}</tbody>
</table>
${!dc.ewayBillNo && transportLine ? `<table><tbody><tr><td><span class="lbl">Transport Details:</span> ${transportLine}</td></tr></tbody></table>` : ''}
${dc.ewayBillNo ? `<table>
  <colgroup><col><col><col>${qr ? '<col style="width:30mm">' : ''}</colgroup>
  <tbody><tr><td colspan="3" class="sec c">E-Way Bill &amp; Transport${cancelled ? ` <span class="cx">— E-WAY BILL CANCELLED${dc.ewayCancelledAt ? ' on ' + esc(new Date(dc.ewayCancelledAt).toLocaleString('en-IN')) : ''}</span>` : ''}</td>${qr ? `<td rowspan="2" class="qr"><img src="${qr}" alt=""><div>E-Way Bill QR</div></td>` : ''}</tr>
  <tr>
    <td><table class="kv">${kv('E-Way Bill No.', esc(dc.ewayBillNo || '') || '—')}${kv('Generated On', esc(dc.ewayGenDate || '') || '—')}${kv('Valid Upto', esc(dc.ewayValidUpto || '') || '—')}${kv('Generated By', esc(dc.ewayGeneratedBy || (dc.ewayBillNo ? co.gstin : '') || '') || '—')}</table></td>
    <td><table class="kv">${kv('Transporter ID', esc(dc.transporterId || '') || '—')}${kv('Transporter', esc(dc.transporterName || '') || '—')}${kv('Doc No. / Date', esc([dc.transDocNo, dc.transDocDate].filter(Boolean).join(' / ')) || '—')}</table></td>
    <td><table class="kv">${kv('Vehicle No.', esc(dc.vehicleNo || '') || '—')}${kv('Distance', dc.approxDistanceKm ? esc(dc.approxDistanceKm) + ' KM' : '—')}${kv('Dispatched By', esc(dc.dispatchThrough || '') || '—')}</table></td>
  </tr></tbody>
</table>` : ''}
<table>
${withValue ? `<table>
  <colgroup><col style="width:24px"><col><col style="width:58px"><col style="width:44px"><col style="width:34px"><col style="width:72px"><col style="width:78px"><col style="width:36px">${intra ? '<col style="width:62px"><col style="width:62px">' : '<col style="width:70px">'}<col style="width:82px"></colgroup>
  <thead><tr class="hd"><th>Sl</th><th>Description of Goods</th><th>HSN/SAC</th><th>Qty</th><th>Unit</th><th>Rate</th><th>Taxable</th><th>GST</th>${intra ? '<th>CGST</th><th>SGST</th>' : '<th>IGST</th>'}<th>Amount (₹)</th></tr></thead>
  <tbody>
    ${lines.map(({ it, t, g }, i) => `<tr class="it"><td class="c">${i + 1}</td><td><b>${esc(it.description || it.itemName || '')}</b></td><td class="c">${esc(String(it.hsnCode || '').trim())}</td>
      <td class="c">${QTY.format(n(it.qty))}</td><td class="c">${esc(it.unit || '')}</td><td class="r">${amt(it.rate)}</td><td class="r">${amt(t)}</td><td class="c">${QTY.format(n(it.gst))}%</td>
      ${intra ? `<td class="r">${amt(g / 2)}</td><td class="r">${amt(g / 2)}</td>` : `<td class="r">${amt(g)}</td>`}<td class="r">${amt(t + g)}</td></tr>`).join('')}
    ${addons.map((a, i) => `<tr class="it"><td class="c">${lines.length + i + 1}</td><td><b>${esc(a.description)}</b>${a.remarks ? `<div class="ao">${esc(a.remarks)}</div>` : ''}</td><td></td>
      <td class="c">${QTY.format(n(a.qty))}</td><td class="c">${esc(a.unit || '')}</td><td colspan="${intra ? 6 : 5}" class="c inc">Included</td></tr>`).join('')}
    <tr class="fill" id="fillrow">${'<td></td>'.repeat(intra ? 11 : 10)}</tr>
    <tr class="tot"><td></td><td class="r">Total</td><td></td><td class="c">${QTY.format(qtyTot)}</td><td></td><td></td><td class="r">${amt(valTot)}</td><td></td>
      ${intra ? `<td class="r">${amt(gstTot / 2)}</td><td class="r">${amt(gstTot / 2)}</td>` : `<td class="r">${amt(gstTot)}</td>`}<td class="r">${amt(valTot + gstTot)}</td></tr>
  </tbody>
</table>` : `<table>
  <colgroup><col style="width:26px"><col><col style="width:70px"><col style="width:70px"><col style="width:52px"></colgroup>
  <thead><tr class="hd"><th>Sl</th><th>Description of Goods</th><th>HSN/SAC</th><th>Qty</th><th>Unit</th></tr></thead>
  <tbody>
    ${items.map((it, i) => `<tr class="it"><td class="c">${i + 1}</td><td><b>${esc(it.description || it.itemName || '')}</b></td><td class="c">${esc(String(it.hsnCode || '').trim())}</td><td class="c">${QTY.format(n(it.qty))}</td><td class="c">${esc(it.unit || '')}</td></tr>`).join('')}
    ${addons.map((a, i) => `<tr class="it"><td class="c">${items.length + i + 1}</td><td><b>${esc(a.description)}</b>${a.remarks ? `<div class="ao">${esc(a.remarks)}</div>` : ''}</td><td></td><td class="c">${QTY.format(n(a.qty))}</td><td class="c">${esc(a.unit || '')}</td></tr>`).join('')}
    <tr class="fill" id="fillrow"><td></td><td></td><td></td><td></td><td></td></tr>
    <tr class="tot"><td></td><td class="r">Total</td><td></td><td class="c">${QTY.format(qtyTot)}</td><td></td></tr>
  </tbody>
</table>`}
<table><tbody><tr><td class="notes"><b>Notes:</b> ${dc.remarks ? `${esc(dc.remarks)}<br>` : ''}Goods are sent for delivery as per the sales order above. Please check the material and sign this challan on receipt.</td></tr></tbody></table>
<table>
  <colgroup><col style="width:50%"><col></colgroup>
  <tbody><tr>
    <td class="sg"><b>For, ${esc(dc.customerName || '')}</b><div class="sp"></div><div class="sl">Receiver's Signature</div></td>
    <td class="sg"><b style="display:block; text-align:right">For ${esc(co.companyName || co.name || '')}</b><div class="sp"></div><div class="tri"><span>Prepared By</span><span>Verified By</span><span>Authorised Signatory</span></div></td>
  </tr></tbody>
</table>
<div class="foot">${[co.city ? `SUBJECT TO ${esc(String(co.city).toUpperCase())} JURISDICTION` : '', 'This is a Computer Generated Delivery Challan'].filter(Boolean).join(' &nbsp;|&nbsp; ')}</div>
</div>
<div class="pby"><span>Printed by Super ERP System &nbsp;|&nbsp; Created by : ${esc(createdBy)} &nbsp;|&nbsp; Printed by : ${esc(printedBy)}  &nbsp;|&nbsp; ${esc(now())}</span></div>
</body></html>`;
  return printHtml(html, `dc-print-frame${collect ? `-${dc.dcId}` : ''}`, collect);
}
