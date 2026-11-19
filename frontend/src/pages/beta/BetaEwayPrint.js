/* E-Way Bill page in our own print, made from the e-way details already saved on the Delivery Challan or the Sales Bill.
 * Printed as a SEPARATE page after the DC / Tax Invoice (same PDF), or alone ("Only E-Way Bill").
 * Plain bordered black-and-white, laid out like the portal's e-way bill: Part A (supply) and Part B (transport).
 *   ewayOfDc(dc, co) / ewayOfBill(b, co) → the details · ewayPage(e) → { css, body } · withEwayPage(html, e) · printEwayOnly(e) */
import QRCode from 'qrcode';
import { ewayQrText } from './BetaEwayJson';
import { previewHtml, partyMeta } from './printKit';

const n = v => parseFloat(v) || 0;
const AMT = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const amt = v => AMT.format(Number(v) || 0);
const QTY = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 3 });
const esc = v => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const d = v => { const x = v ? new Date(v) : null; return x && !isNaN(x) ? `${String(x.getDate()).padStart(2, '0')}-${MON[x.getMonth()]}-${x.getFullYear()}` : (v ? String(v) : ''); };
const tidy = t => String(t || '').replace(/\r?\n/g, ', ').replace(/\s+,/g, ',').replace(/,(\s*,)+/g, ',').replace(/\s{2,}/g, ' ').replace(/,\s*$/, '').trim();
const addr = (...p) => tidy(p.filter(Boolean).join(', '));

/* ── the details, from a delivery challan ── */
export async function ewayOfDc(dc, co = {}) {
  if (!dc || !String(dc.ewayBillNo || '').trim()) return null;
  const cancelled = dc.ewayStatus === 'cancelled';
  let qr = '';
  try { const t = ewayQrText(dc, co); if (t && !cancelled) qr = await QRCode.toDataURL(t, { margin: 0, width: 220, errorCorrectionLevel: 'M' }); } catch { qr = ''; }
  const items = (dc.items || []).filter(it => n(it.qty) > 0).map(it => { const t = n(it.qty) * n(it.rate); return { name: it.description || it.itemName || '', hsn: it.hsnCode || '', qty: n(it.qty), unit: it.unit || '', taxable: t, gst: n(it.gst), tax: t * n(it.gst) / 100 }; });
  const billFirst = (dc.dcType === 'against-bill' || dc.dcType === 'with-bill') && dc.invoiceNo;
  return {
    no: String(dc.ewayBillNo).trim(), genDate: dc.ewayGenDate || '', validUpto: dc.ewayValidUpto || '', genBy: dc.ewayGeneratedBy || co.gstin || '',
    mode: dc.transportMode || 'Road', distance: dc.approxDistanceKm || '', supplyType: 'Outward - Supply', txnType: dc.ewayTxnType || '',
    docType: billFirst ? 'Tax Invoice' : 'Delivery Challan', docNo: billFirst ? dc.invoiceNo : (dc.dcNo || dc.dcId), docDate: billFirst ? d(dc.invoiceDate) : d(dc.dcDate),
    fromName: co.companyName || co.name || '', fromGstin: co.gstin || '',
    fromAddr: tidy(dc.dispatchFrom || addr(co.address, dc.dispatchPlace || co.city, [dc.dispatchState || co.state, dc.dispatchPincode || co.pincode].filter(Boolean).join(' - '))),
    toName: dc.shippingName || dc.customerName || '', toGstin: dc.shippingGstin || dc.billingGstin || dc.customerGstin || '',
    toAddr: addr(dc.shippingAddress, dc.shippingCity, [dc.shippingState, dc.shippingPincode].filter(Boolean).join(' - ')),
    billTo: dc.customerName || '', value: n(dc.grandTotal) || items.reduce((s, x) => s + x.taxable + x.tax, 0), items,
    transporterId: dc.transporterId || '', transporterName: dc.transporterName || '', transDoc: [dc.transDocNo, dc.transDocDate].filter(Boolean).join(' / '),
    vehicle: dc.vehicleNo || '', vehicleFrom: dc.dispatchPlace || co.city || '', cewb: dc.cewbNo || '', qr, cancelled,
    ref: `DC ${dc.dcNo || dc.dcId}${dc.invoiceNo ? ` · Invoice ${dc.invoiceNo}` : ''}`,
  };
}

/* ── the details, from a sales bill (read from its PDF when it was saved) ── */
export function ewayOfBill(b, co = {}) {
  if (!b || !String(b.ewayBillNo || '').trim()) return null;
  const items = (b.items || []).filter(li => !(li.unit === 'LOT' && li.itemIdx == null)).map(li => {
    const tax = n(li.gstAmt ?? (n(li.cgst) + n(li.sgst) + n(li.igst)));
    return { name: li.description || '', hsn: li.hsnCode || '', qty: n(li.qty), unit: li.unit || '', taxable: n(li.taxable), gst: n(li.gstPct), tax };
  });
  return {
    no: String(b.ewayBillNo).trim(), genDate: b.ewayGenDate || '', validUpto: b.ewayValidUpto || '', genBy: b.ewayGeneratedBy || co.gstin || '',
    mode: b.ewayMode || 'Road', distance: b.approxDistanceKm || '', supplyType: b.supplyType || 'Outward - Supply', txnType: b.transactionType || '',
    docType: 'Tax Invoice', docNo: b.billNo || b.billId, docDate: d(b.billDate),
    fromName: b.ewayFromName || co.companyName || co.name || '', fromGstin: b.ewayFromGstin || co.gstin || '',
    fromAddr: tidy(b.dispatchFrom || addr(co.address, co.city, [co.state, co.pincode].filter(Boolean).join(' - '))),
    toName: b.ewayToName || b.shipToName || b.partyName || '', toGstin: b.ewayToGstin || b.billToGstin || b.partyGstin || '',
    toAddr: tidy(b.ewayShipTo || addr(b.shipToAddress, b.shipToCity, [b.shipToState, b.shipToPincode].filter(Boolean).join(' - '))),
    billTo: b.partyName || b.billToName || '', value: n(b.grandTotal), items,
    transporterId: b.transporterId || '', transporterName: b.transporterName || '', transDoc: [b.transDocNo, b.transDocDate].filter(Boolean).join(' / '),
    vehicle: b.vehicleNo || '', vehicleFrom: b.vehicleFromCity || '', cewb: b.cewbNo || '', qr: b.ewayQr || '', cancelled: false,
    ref: `Tax Invoice ${b.billNo || b.billId}`,
  };
}

/* ── the page ── */
const CSS = `
.ewp { font-family:Arial, Helvetica, sans-serif; font-size:8.8pt; color:#000; line-height:1.35; }
.ewp table { width:100%; border-collapse:collapse; font-size:inherit; }
.ewp .bx { margin-top:-1px; } .ewp .bx:first-child { margin-top:0; }
.ewp .bx > tbody > tr > td, .ewp .bx > thead > tr > th { border:1px solid #000; padding:4px 7px; vertical-align:top; text-align:left; }
.ewp .hd td { vertical-align:middle !important; }
.ewp .ttl { font-size:15pt; font-weight:bold; letter-spacing:3px; text-align:center !important; }
.ewp .ttl small { display:block; font-size:7.8pt; font-weight:normal; letter-spacing:.6px; margin-top:2px; }
.ewp .qr { width:34mm; text-align:center !important; } .ewp .qr img { width:30mm; height:30mm; display:block; margin:0 auto; } .ewp .qr div { font-size:7pt; margin-top:2px; }
.ewp .sec { font-weight:bold; font-size:8.6pt; text-transform:uppercase; letter-spacing:.5px; }
.ewp .kv td { border:0 !important; padding:1.5px 4px 1.5px 0 !important; vertical-align:top; }
.ewp .kv td:first-child { width:118px; color:#333; white-space:nowrap; } .ewp .kv td:nth-child(2) { width:8px; }
.ewp .lbl { font-size:7.2pt; color:#333; text-transform:uppercase; letter-spacing:.4px; margin-bottom:2px; }
.ewp .pn { font-size:9.6pt; font-weight:bold; }
.ewp .gd th { font-size:7.8pt; text-align:center !important; font-weight:bold; }
.ewp .c { text-align:center !important; } .ewp .r { text-align:right !important; white-space:nowrap; }
.ewp .big { font-size:12pt; font-weight:bold; letter-spacing:1px; }
.ewp .cx { font-weight:bold; letter-spacing:1px; }
.ewp .nt { font-size:7.6pt; color:#333; padding-top:4px; display:flex; justify-content:space-between; }
.pb { break-before:page; page-break-before:always; }
@media screen { .pb { margin:8mm -8mm 0; border-top:10px solid #E4E7EC; padding:8mm 8mm 0; } }`;

export function ewayPage(e) {
  const kv = (k, v) => `<tr><td>${k}</td><td>:</td><td><b>${v ? esc(v) : '—'}</b></td></tr>`;
  const tot = e.items.reduce((s, x) => ({ taxable: s.taxable + x.taxable, tax: s.tax + x.tax }), { taxable: 0, tax: 0 });
  const body = `<div class="ewp">
<table class="bx hd"><colgroup><col>${e.qr ? '<col style="width:36mm">' : ''}</colgroup><tbody><tr>
  <td><div class="ttl">E-WAY BILL<small>${e.cancelled ? '<span class="cx">CANCELLED</span> · ' : ''}${esc(e.ref)}</small></div>
    <table class="kv" style="margin-top:6px"><tbody>
      <tr><td>E-Way Bill No.</td><td>:</td><td><span class="big">${esc(e.no)}</span></td></tr>
      ${kv('Generated Date', e.genDate)}${kv('Generated By', e.genBy)}${kv('Valid Upto', e.validUpto)}
      ${kv('Mode', e.mode)}${kv('Approx Distance', e.distance ? `${e.distance} KM` : '')}
    </tbody></table></td>
  ${e.qr ? `<td class="qr"><img src="${e.qr}" alt=""><div>E-Way Bill QR</div></td>` : ''}
</tr></tbody></table>
<table class="bx"><tbody><tr><td class="sec">Part - A</td></tr></tbody></table>
<table class="bx"><colgroup><col style="width:50%"><col></colgroup><tbody>
  <tr><td><div class="lbl">From (Supplier)</div><div class="pn">${esc(e.fromName)}</div><div>GSTIN: <b>${esc(e.fromGstin || '—')}</b></div>
      <div class="lbl" style="margin-top:4px">Place of Dispatch</div><div>${esc(e.fromAddr || '—')}</div></td>
    <td><div class="lbl">To (Recipient)</div><div class="pn">${esc(e.toName)}</div><div>GSTIN: <b>${esc(e.toGstin || 'URP')}</b></div>
      <div class="lbl" style="margin-top:4px">Place of Delivery</div><div>${esc(e.toAddr || '—')}</div></td></tr>
  <tr><td><table class="kv"><tbody>${kv('Document', e.docType)}${kv('Document No.', e.docNo)}${kv('Document Date', e.docDate)}</tbody></table></td>
    <td><table class="kv"><tbody>${kv('Supply Type', e.supplyType)}${kv('Transaction Type', e.txnType)}${kv('Value of Goods', `₹ ${amt(e.value)}`)}</tbody></table></td></tr>
</tbody></table>
<table class="bx gd"><colgroup><col style="width:24px"><col><col style="width:62px"><col style="width:70px"><col style="width:84px"><col style="width:46px"><col style="width:76px"></colgroup>
  <thead><tr><th>Sl</th><th>Product / Description</th><th>HSN</th><th>Qty</th><th>Taxable ₹</th><th>GST</th><th>Tax ₹</th></tr></thead>
  <tbody>${e.items.map((x, i) => `<tr><td class="c">${i + 1}</td><td><b>${esc(x.name)}</b></td><td class="c">${esc(String(x.hsn).trim())}</td><td class="c">${QTY.format(x.qty)} ${esc(x.unit)}</td><td class="r">${amt(x.taxable)}</td><td class="c">${QTY.format(x.gst)}%</td><td class="r">${amt(x.tax)}</td></tr>`).join('')}
    <tr><td></td><td class="r"><b>Total</b></td><td></td><td></td><td class="r"><b>${amt(tot.taxable)}</b></td><td></td><td class="r"><b>${amt(tot.tax)}</b></td></tr></tbody>
</table>
<table class="bx"><tbody><tr><td class="sec">Part - B</td></tr></tbody></table>
<table class="bx"><colgroup><col style="width:50%"><col></colgroup><tbody><tr>
  <td><table class="kv"><tbody>${kv('Mode', e.mode)}${kv('Vehicle No.', e.vehicle)}${kv('From', e.vehicleFrom)}${kv('CEWB No.', e.cewb)}</tbody></table></td>
  <td><table class="kv"><tbody>${kv('Transporter ID', e.transporterId)}${kv('Transporter', e.transporterName)}${kv('Trans. Doc No. / Date', e.transDoc)}</tbody></table></td>
</tr></tbody></table>
<div class="nt"><span>Printed from the e-way bill details saved in Super ERP System — the e-way bill itself is on the GST e-way bill portal.</span><span>${esc(e.no)}</span></div>
</div>`;
  return { css: CSS, body };
}

/* a document's page with the e-way bill as a separate page after it (same print / PDF) */
export function withEwayPage(html, e) {
  if (!e) return html;
  const { css, body } = ewayPage(e);
  return String(html).replace('</style>', `${css}\n</style>`).replace(/<\/body>\s*<\/html>\s*$/i, `<div class="pb">${body}</div>\n</body></html>`);
}

/* only the e-way bill page */
export function printEwayOnly(e, party) {
  const { css, body } = ewayPage(e);
  previewHtml(`<!DOCTYPE html><html><head><meta charset="utf-8">${partyMeta(party || e.billTo || e.toName)}<title>E-Way Bill ${esc(e.no)}</title><style>
* { margin:0; padding:0; box-sizing:border-box; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
body { background:#fff; } ${css}
@media print { @page { margin:8mm; size:A4 portrait; } }
</style></head><body>${body}</body></html>`);
}
