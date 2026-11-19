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
    transDocNo: dc.transDocNo || '', transDocDate: d(dc.transDocDate), irn: dc.irnNo || '', ackNo: dc.acknNo || '', ackDate: d(dc.acknDate),
    fromState: dc.dispatchState || co.state || '', toState: dc.shippingState || '',
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
    transDocNo: b.transDocNo || '', transDocDate: d(b.transDocDate), irn: b.irnNo || '', ackNo: b.acknNo || '', ackDate: d(b.acknDate),
    fromState: co.state || '', toState: b.shipToState || b.partyState || '',
    vehicle: b.vehicleNo || '', vehicleFrom: b.vehicleFromCity || '', cewb: b.cewbNo || '', qr: b.ewayQr || '', cancelled: false,
    ref: `Tax Invoice ${b.billNo || b.billId}`,
  };
}

/* ── the page: laid out like the e-way bill printed from the portal / Tally —
 *    header (document, IRN, QR) then 1. e-Way Bill Details · 2. Address · 3. Goods · 4. Transportation · 5. Vehicle,
 *    each a bordered section with its heading ── */
const CSS = `
.ewp { font-family:Arial, Helvetica, sans-serif; font-size:8.6pt; color:#000; line-height:1.35; border:1px solid #000; }
.ewp table { width:100%; border-collapse:collapse; font-size:inherit; }
.ewp td, .ewp th { padding:1.5px 4px; vertical-align:top; text-align:left; }
.ewp .top { display:flex; align-items:flex-start; gap:8px; padding:6px 8px 7px; }
.ewp .top .l { flex:1; min-width:0; }
.ewp .ttl { text-align:center; font-size:13pt; font-weight:bold; margin-bottom:6px; }
.ewp .ttl span { border-bottom:1.5px solid #000; padding:0 6px 1px; }
.ewp .qr { width:31mm; text-align:center; font-size:7.4pt; font-weight:bold; }
.ewp .qr img { width:29mm; height:29mm; display:block; margin:2px auto 0; }
.ewp .kv td:first-child { width:62px; white-space:nowrap; } .ewp .kv td:nth-child(2) { width:8px; padding:1.5px 2px; }
.ewp .kv b { word-break:break-all; }
.ewp .sec { border-top:1px solid #000; }
.ewp .sh { font-weight:bold; font-size:8.8pt; padding:3px 8px; border-bottom:1px solid #000; }
.ewp .sb { padding:4px 8px 5px; }
.ewp .g3 .k { white-space:nowrap; padding-right:2px; } .ewp .g3 .s { padding:1.5px 2px; }
.ewp .g3 .v { font-weight:bold; padding-right:10px; }
.ewp .two { display:flex; } .ewp .two > div { flex:1; padding:4px 8px 5px; min-width:0; } .ewp .two > div + div { border-left:1px solid #000; }
.ewp .two + .two { border-top:1px solid #000; }
.ewp .lb { font-weight:bold; margin-bottom:2px; }
.ewp .gd th { font-weight:bold; border-bottom:1px solid #000; padding:3px 6px; vertical-align:bottom; }
.ewp .gd td { padding:3px 6px; border-bottom:1px solid #999; }
.ewp .gd th + th, .ewp .gd td + td { border-left:1px solid #000; }
.ewp .gd tr:last-child td { border-bottom:0; }
.ewp .gd tr.fill td { border-bottom:0; padding:0; }
.ewp .tt table, .ewp .g3 { table-layout:fixed; }
.ewp .r { text-align:right !important; white-space:nowrap; } .ewp .c { text-align:center !important; }
.ewp .tt { border-top:1px solid #000; padding:4px 8px; }
.ewp .tt td { padding:1.5px 4px; } .ewp .tt .k { white-space:nowrap; } .ewp .tt .s { width:8px; } .ewp .tt .v { font-weight:bold; white-space:nowrap; }
.ewp .cx { font-weight:bold; letter-spacing:1px; border:1.5px solid #000; padding:0 6px; margin-left:6px; font-size:9pt; }
.ewp .nt { border-top:1px solid #000; font-size:7.2pt; padding:3px 8px; display:flex; justify-content:space-between; }
.pb { break-before:page; page-break-before:always; }
@media screen { .pb { margin:8mm -8mm 0; border-top:10px solid #E4E7EC; padding:8mm 8mm 0; } }`;

const MODES = { road: '1 - Road', rail: '2 - Rail', air: '3 - Air', ship: '4 - Ship' };
const modeOf = m => { const t = String(m || '').trim(); return MODES[t.toLowerCase()] || t; };

export function ewayPage(e) {
  const v = x => (x == null || x === '' ? '' : esc(x));
  const kv = (k, x) => `<tr><td>${k}</td><td>:</td><td><b>${v(x)}</b></td></tr>`;
  const cols = k => `<colgroup>${Array.from({ length: k }, () => '<col style="width:100px"><col style="width:12px"><col>').join('')}</colgroup>`;
  const g3 = rows => `<table class="g3">${cols(rows[0].length)}<tbody>${rows.map(r => `<tr>${r.map(([k, x]) => `<td class="k">${k}</td><td class="s">:</td><td class="v">${v(x)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  const tot = e.items.reduce((s, x) => ({ taxable: s.taxable + x.taxable, tax: s.tax + x.tax }), { taxable: 0, tax: 0 });
  const inter = e.fromGstin && e.toGstin && e.fromGstin.slice(0, 2) !== e.toGstin.slice(0, 2);
  const rate = g => (inter ? `${QTY.format(g)}` : `${QTY.format(g / 2)}+${QTY.format(g / 2)}`);
  const other = Math.round((n(e.value) - tot.taxable - tot.tax) * 100) / 100;
  const half = Math.round(tot.tax * 50) / 100;
  const t = (k, x) => `<td class="k">${k}</td><td class="s">:</td><td class="v">${x}</td>`;
  const body = `<div class="ewp">
<div class="top"><div class="l">
  <div class="ttl"><span>e-Way Bill</span>${e.cancelled ? '<span class="cx">CANCELLED</span>' : ''}</div>
  <table class="kv"><tbody>${kv('Doc No.', `${e.docType} - ${e.docNo || ''}`)}${kv('Date', e.docDate)}</tbody></table>
  ${e.irn || e.ackNo ? `<table class="kv" style="margin-top:5px"><tbody>${kv('IRN', e.irn)}${kv('Ack No.', e.ackNo)}${kv('Ack Date', e.ackDate)}</tbody></table>` : ''}
</div>${e.qr ? `<div class="qr">e-Way Bill<img src="${e.qr}" alt=""></div>` : ''}</div>

<div class="sec"><div class="sh">1. e-Way Bill Details</div><div class="sb">${g3([
    [['e-Way Bill No.', e.no], ['Mode', modeOf(e.mode)], ['Generated Date', e.genDate]],
    [['Generated By', e.genBy], ['Approx Distance', e.distance ? `${e.distance} KM` : ''], ['Valid Upto', e.validUpto]],
    [['Supply Type', e.supplyType], ['Transaction Type', e.txnType], ['', '']],
  ]).replace(/<td class="k"><\/td><td class="s">:<\/td>/, '<td class="k"></td><td class="s"></td>')}</div></div>

<div class="sec"><div class="sh">2. Address Details</div>
  <div class="two"><div><div class="lb">From</div><div>${v(e.fromName)}</div><div>GSTIN : ${v(e.fromGstin)}</div><div>${v(e.fromState)}</div></div>
    <div><div class="lb">To</div><div>${v(e.toName)}</div><div>GSTIN : ${v(e.toGstin || 'URP')}</div><div>${v(e.toState)}</div></div></div>
  <div class="two"><div><div class="lb">Dispatch From</div><div>${v(e.fromAddr)}</div></div>
    <div><div class="lb">Ship To</div><div>${v(e.toAddr)}</div></div></div>
</div>

<div class="sec"><div class="sh">3. Goods Details</div>
  <table class="gd"><colgroup><col style="width:62px"><col><col style="width:84px"><col style="width:96px"><col style="width:70px"></colgroup>
    <thead><tr><th>HSN Code</th><th>Product Name &amp; Desc</th><th class="r">Quantity</th><th class="r">Taxable Amt</th><th class="c">Tax Rate<br>(${inter ? 'I' : 'C+S'})</th></tr></thead>
    <tbody>${e.items.map(x => `<tr><td><b>${v(String(x.hsn).trim())}</b></td><td>${v(x.name)}</td><td class="r">${QTY.format(x.qty)} ${v(String(x.unit).toUpperCase())}</td><td class="r"><b>${amt(x.taxable)}</b></td><td class="c">${rate(x.gst)}</td></tr>`).join('')}<tr class="fill" style="height:${Math.max(0, 78 - e.items.length * 7)}mm"><td></td><td></td><td></td><td></td><td></td></tr></tbody>
  </table>
  <div class="tt"><table>${cols(3)}<tbody>
    <tr>${t('Tot. Taxable Amt', amt(tot.taxable))}${t('Other Amt', other ? amt(other) : '')}${t('Total Inv Amt', amt(e.value))}</tr>
    <tr>${inter ? `${t('IGST Amt', amt(tot.tax))}<td></td><td></td><td></td>` : `${t('CGST Amt', amt(half))}${t('SGST Amt', amt(tot.tax - half))}`}<td></td><td></td><td></td></tr>
  </tbody></table></div>
</div>

<div class="sec"><div class="sh">4. Transportation Details</div><div class="sb">${g3([
    [['Transporter ID', e.transporterId], ['Doc No.', e.transDocNo]],
    [['Name', e.transporterName], ['Date', e.transDocDate]],
  ])}</div></div>

<div class="sec"><div class="sh">5. Vehicle Details</div><div class="sb">${g3([
    [['Vehicle No.', e.vehicle], ['From', e.vehicleFrom], ['CEWB No.', e.cewb]],
  ])}</div></div>
<div class="nt"><span>${v(e.ref)}</span><span>e-Way Bill No. ${v(e.no)}</span></div>
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
