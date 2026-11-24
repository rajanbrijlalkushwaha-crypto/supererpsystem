/* Return Note / Return to Vendor print — A4 portrait, plain bordered black and white, like the delivery challan.
 * With value (rate, GST, amount) or quantities only; the e-way bill section when it has one; and the e-way bill PDF
 * from the portal (kept with the note) alone or after the note in one PDF. */
import axios from 'axios';
import QRCode from 'qrcode';
import { ewayQrText } from './BetaEwayJson';
import { previewPdf, prodText, partyMeta } from './printKit';
import { vendorCode } from './vendorCode';
import { logoOf, printHtml, printMerged, blobB64 } from './BetaDCPrint';

const n = v => parseFloat(v) || 0;
const AMT = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const amt = v => AMT.format(Number(v) || 0);
const QTY = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 3 });
const esc = v => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const d = v => { const x = v ? new Date(v) : null; return x && !isNaN(x) ? `${String(x.getDate()).padStart(2, '0')}-${MON[x.getMonth()]}-${x.getFullYear()}` : (v ? esc(v) : ''); };
const tidy = t => String(t || '').replace(/\r?\n/g, ', ').replace(/\s+,/g, ',').replace(/,(\s*,)+/g, ',').replace(/\s{2,}/g, ' ').replace(/,\s*$/, '').trim();
const now = () => new Date().toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const addrOf = p => tidy([p?.address, p?.city, [p?.state, p?.pincode].filter(Boolean).join(' - ')].filter(Boolean).join(', '));
const whoOf = u => (u ? (typeof u === 'string' ? u : u.name || u.username || '') : '');
const titleOf = r => (r.kind === 'vendor' ? 'Return to Vendor' : 'Return Note');

export async function printReturn({ r, company, user, withValue = true, collect, ewayBlock = true }) {
  const co = company || {};
  const client = r.kind === 'client';
  const logo = await logoOf(co);
  const items = (r.items || []).filter(it => n(it.qty) > 0);
  const from = r.fromParty || {}, to = r.toParty || {};
  const coAddr = tidy([co.address, co.city, [co.state, co.pincode].filter(Boolean).join(' - ')].filter(Boolean).join(', '));
  const kv = (k, v) => (v ? `<tr><td>${k}</td><td>:</td><td><b>${v}</b></td></tr>` : '');
  // tax between the two GST registrations: the client and us, or us and the vendor (not the godown / site the goods reach)
  const fromG = String((client ? from.gstin : co.gstin) || '').slice(0, 2), toG = String((client ? co.gstin : to.gstin) || '').slice(0, 2);
  const intra = fromG && toG ? fromG === toG : String((client ? from.state : co.state) || '').toLowerCase() === String((client ? co.state : to.state) || '').toLowerCase();
  const lines = items.map(it => { const t = n(it.qty) * n(it.rate), g = t * n(it.gst) / 100; return { it, t, g }; });
  const valTot = lines.reduce((s, l) => s + l.t, 0), gstTot = lines.reduce((s, l) => s + l.g, 0), qtyTot = items.reduce((s, it) => s + n(it.qty), 0);
  const cancelled = r.ewayStatus === 'cancelled';
  let qr = '';
  try { const txt = ewayQrText(r, co); if (txt && !cancelled) qr = await QRCode.toDataURL(txt, { margin: 0, width: 220, errorCorrectionLevel: 'M' }); } catch { qr = ''; }
  const showDc = client && items.some(it => it.dcNo);
  const reason = r.reason === 'Other' && r.reasonText ? `Other: ${r.reasonText}` : r.reason || '';
  const title = client ? 'RETURN NOTE' : 'RETURN TO VENDOR';
  const sub = client ? 'Material received back from the client' : 'Delivery challan — material sent back to the vendor';
  const transportLine = [r.transporterName && `Transporter: <b>${esc(r.transporterName)}</b>`, r.transporterId && `Transporter ID: <b>${esc(r.transporterId)}</b>`,
    r.transDocNo && `LR / Doc No.: <b>${esc(r.transDocNo)}</b>`].filter(Boolean).join(' &nbsp;|&nbsp; ');
  const party = (lbl, p) => `<div class="lbl">${lbl}</div><div class="pn">${esc(p.name || '')}</div>${addrOf(p) ? `<div>${esc(addrOf(p))}</div>` : ''}
    <div>${[p.gstin && `GSTIN: <b>${esc(p.gstin)}</b>`, p.state && `State: ${esc(p.state)}`].filter(Boolean).join(' &nbsp;|&nbsp; ')}</div>`;
  const cols = withValue ? (intra ? 11 : 10) + (showDc ? 1 : 0) : 6 + (showDc ? 1 : 0);
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">${partyMeta((client ? from : to).name)}<title>${titleOf(r)} ${esc(r.returnNo || r.returnId)}</title>
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
.ttl small { display:block; margin-top:2px; font-size:7.6pt; font-weight:normal; letter-spacing:1.5px; }
.sec { font-weight:bold; font-size:8.4pt; padding:3px 6px !important; } .sec.c { text-align:center; }
.qr { text-align:center; vertical-align:middle !important; font-size:7pt; }
.qr img { width:26mm; height:26mm; display:block; margin:0 auto 2px; }
.hd th { font-weight:bold; font-size:7.8pt; text-align:center; padding:4px 3px !important; }
tr.it td { border-top:0 !important; border-bottom:0 !important; }
tr.fill td { height:8mm; border-top:0 !important; }
tr.tot td { font-weight:bold; }
.rm { font-size:7.6pt; color:#333; }
.notes { min-height:12mm; font-size:8.4pt; }
.sg b { font-size:9pt; }
.sgt td.top { border-bottom:0 !important; padding-bottom:0 !important; }
.sgt td.bot { border-top:0 !important; height:30mm; vertical-align:bottom !important; padding-top:2px !important; }
.tri { display:flex; align-items:flex-end; gap:6px; font-size:8.4pt; font-weight:bold; }
.tri span { flex:1 1 0; text-align:center; white-space:nowrap; }
.foot { text-align:center; padding:4px 0 0; font-size:8.4pt; font-weight:bold; }
.pby { display:flex; justify-content:space-between; font-size:7.6pt; font-weight:bold; margin-top:3px; }
@media print { @page { margin:8mm; size:A4 portrait; } tr { break-inside:avoid; } }
</style></head><body>
<div class="doc">
<table><tbody><tr><td class="ttl">${title}<small>${sub}</small></td></tr></tbody></table>
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
      ${kv(client ? 'Return Note No.' : 'Return No.', esc(r.returnNo || r.returnId))}${kv('Date', d(r.date))}
      ${client ? kv('Sales Order', esc(r.orderNo || '')) + kv("Client's PO", esc(r.clientPO || '')) + kv('Against DC', esc(r.dcNo || '')) : kv('Purchase Order', esc(r.poNo || '')) + kv('Sales Order', esc(r.orderNo || ''))}
      ${kv('Reason', esc(reason))}${!r.ewayBillNo || !ewayBlock ? kv('Vehicle No.', esc(r.vehicleNo || '')) : ''}
    </table></td>
  </tr></tbody>
</table>
<table>
  <colgroup><col style="width:50%"><col></colgroup>
  <tbody><tr>
    <td>${party(client ? 'Returned by (From)' : 'Sent from', from)}</td>
    <td>${party(client ? 'Received at (To)' : `Sent to (Vendor)${vendorCode(r) ? ` &nbsp;·&nbsp; Vendor Code ${esc(vendorCode(r))}` : ''}`, to)}</td>
  </tr></tbody>
</table>
${!r.ewayBillNo && transportLine ? `<table><tbody><tr><td><span class="lbl">Transport Details:</span> ${transportLine}</td></tr></tbody></table>` : ''}
${r.ewayBillNo && ewayBlock ? `<table>
  <colgroup><col><col><col>${qr ? '<col style="width:30mm">' : ''}</colgroup>
  <tbody><tr><td colspan="3" class="sec c">E-Way Bill &amp; Transport${cancelled ? ' — E-WAY BILL CANCELLED' : ''}</td>${qr ? `<td rowspan="2" class="qr"><img src="${qr}" alt=""><div>E-Way Bill QR</div></td>` : ''}</tr>
  <tr>
    <td><table class="kv">${kv('E-Way Bill No.', esc(r.ewayBillNo))}${kv('Generated On', esc(r.ewayGenDate || '') || '—')}${kv('Valid Upto', esc(r.ewayValidUpto || '') || '—')}</table></td>
    <td><table class="kv">${kv('Transporter ID', esc(r.transporterId || '') || '—')}${kv('Transporter', esc(r.transporterName || '') || '—')}${kv('LR / Doc No.', esc(r.transDocNo || '') || '—')}</table></td>
    <td><table class="kv">${kv('Vehicle No.', esc(r.vehicleNo || '') || '—')}${kv('Distance', r.approxDistanceKm ? esc(r.approxDistanceKm) + ' KM' : '—')}</table></td>
  </tr></tbody>
</table>` : ''}
${withValue ? `<table>
  <colgroup><col style="width:24px"><col>${showDc ? '<col style="width:92px">' : ''}<col style="width:56px"><col style="width:42px"><col style="width:34px"><col style="width:68px"><col style="width:76px"><col style="width:34px">${intra ? '<col style="width:58px"><col style="width:58px">' : '<col style="width:66px">'}<col style="width:80px"></colgroup>
  <thead><tr class="hd"><th>Sl</th><th>Description of Goods</th>${showDc ? '<th>DC No.</th>' : ''}<th>HSN/SAC</th><th>Qty</th><th>Unit</th><th>Rate</th><th>Taxable</th><th>GST</th>${intra ? '<th>CGST</th><th>SGST</th>' : '<th>IGST</th>'}<th>Amount (₹)</th></tr></thead>
  <tbody>
    ${lines.map(({ it, t, g }, i) => `<tr class="it"><td class="c">${i + 1}</td><td><b>${esc(it.itemName)}</b>${it.remarks ? `<div class="rm">${esc(it.remarks)}</div>` : ''}</td>${showDc ? `<td class="c">${esc(it.dcNo || '')}</td>` : ''}<td class="c">${esc(it.hsnCode || '')}</td>
      <td class="c">${QTY.format(n(it.qty))}</td><td class="c">${esc(it.unit || '')}</td><td class="r">${amt(it.rate)}</td><td class="r">${amt(t)}</td><td class="c">${QTY.format(n(it.gst))}%</td>
      ${intra ? `<td class="r">${amt(g / 2)}</td><td class="r">${amt(g / 2)}</td>` : `<td class="r">${amt(g)}</td>`}<td class="r">${amt(t + g)}</td></tr>`).join('')}
    <tr class="fill" id="fillrow">${'<td></td>'.repeat(cols)}</tr>
    <tr class="tot"><td></td><td class="r">Total</td>${showDc ? '<td></td>' : ''}<td></td><td class="c">${QTY.format(qtyTot)}</td><td></td><td></td><td class="r">${amt(valTot)}</td><td></td>
      ${intra ? `<td class="r">${amt(gstTot / 2)}</td><td class="r">${amt(gstTot / 2)}</td>` : `<td class="r">${amt(gstTot)}</td>`}<td class="r">${amt(valTot + gstTot)}</td></tr>
  </tbody>
</table>` : `<table>
  <colgroup><col style="width:26px"><col>${showDc ? '<col style="width:100px">' : ''}<col style="width:66px"><col style="width:62px"><col style="width:48px"><col style="width:150px"></colgroup>
  <thead><tr class="hd"><th>Sl</th><th>Description of Goods</th>${showDc ? '<th>DC No.</th>' : ''}<th>HSN/SAC</th><th>Qty</th><th>Unit</th><th>Remarks</th></tr></thead>
  <tbody>
    ${items.map((it, i) => `<tr class="it"><td class="c">${i + 1}</td><td><b>${esc(it.itemName)}</b></td>${showDc ? `<td class="c">${esc(it.dcNo || '')}</td>` : ''}<td class="c">${esc(it.hsnCode || '')}</td><td class="c">${QTY.format(n(it.qty))}</td><td class="c">${esc(it.unit || '')}</td><td>${esc(it.remarks || '')}</td></tr>`).join('')}
    <tr class="fill" id="fillrow">${'<td></td>'.repeat(cols)}</tr>
    <tr class="tot"><td></td><td class="r">Total</td>${showDc ? '<td></td>' : ''}<td></td><td class="c">${QTY.format(qtyTot)}</td><td></td><td></td></tr>
  </tbody>
</table>`}
<table><tbody><tr><td class="notes"><b>Notes:</b> ${r.remarks ? `${esc(r.remarks)}<br>` : ''}${client
    ? 'The material above is received back from the client for the reason shown. It is subject to inspection at our end.'
    : 'The material above is sent back to the vendor for the reason shown. Please acknowledge receipt.'}
  ${r.direct?.dcNo ? `<br>Sent on to ${esc(r.direct.customerName)} (order ${esc(r.direct.orderNo)}) on DC ${esc(r.direct.dcNo)}.` : ''}</td></tr></tbody></table>
<table class="sgt">
  <colgroup><col style="width:50%"><col></colgroup>
  <tbody>
  <tr><td class="sg top"><b>For, ${esc((client ? from.name : to.name) || '')}</b></td><td class="sg top"><b style="display:block; text-align:right">For ${esc(co.companyName || co.name || '')}</b></td></tr>
  <tr><td class="sg bot"><div class="tri"><span>${client ? 'Handed over by' : "Receiver's Signature"}</span></div></td>
    <td class="sg bot"><div class="tri"><span>${client ? 'Received By' : 'Prepared By'}</span><span>Verified By</span><span>Authorised Signatory</span></div></td></tr>
  </tbody>
</table>
<div class="foot">${[co.city ? `SUBJECT TO ${esc(String(co.city).toUpperCase())} JURISDICTION` : '', `This is a Computer Generated ${titleOf(r)}`].filter(Boolean).join(' &nbsp;|&nbsp; ')}</div>
</div>
<div class="pby"><span>Printed by Super ERP System &nbsp;|&nbsp; Created by : ${esc(whoOf(r.createdBy) || '—')} &nbsp;|&nbsp; Printed by : ${esc(whoOf(user) || '—')} &nbsp;|&nbsp; ${esc(now())}</span></div>
</body></html>`;
  const meta = {
    reprint: () => printReturn({ r, company, user, withValue, ewayBlock }),
    mail: {
      subject: `${titleOf(r)} ${r.returnNo}${client && r.orderNo ? ` – order ${r.orderNo}` : !client && r.poNo ? ` – PO ${r.poNo}` : ''} – ${prodText(items.map(it => it.itemName))}`,
      message: client
        ? `Dear Sir / Madam,\n\nWe have received back the material listed in the attached Return Note ${r.returnNo}${r.date ? ` dated ${d(r.date)}` : ''}${reason ? ` (reason: ${reason})` : ''}.`
        : `Dear Sir / Madam,\n\nWe are sending back the material listed in the attached ${titleOf(r)} ${r.returnNo}${r.poNo ? ` against our PO ${r.poNo}` : ''}${reason ? ` (reason: ${reason})` : ''}${r.vehicleNo ? `, vehicle no. ${r.vehicleNo}` : ''}.`,
      summary: [[titleOf(r), `${r.returnNo}${r.date ? `  ·  ${d(r.date)}` : ''}`], ['Material', items.map(it => `${it.itemName} — ${QTY.format(n(it.qty))} ${it.unit || ''}`.trim()).join('\n')],
        ['Reason', reason], ['Vehicle', r.vehicleNo || ''], ['E-way bill', r.ewayBillNo || '']],
    },
  };
  return printHtml(html, `rn-print-frame${collect ? `-${r.returnId}` : ''}`, collect, meta);
}

/* ── the e-way bill PDF from the portal, kept with the note ── */
const portalPdf = async (r, companyId) => (await axios.get(`/api/returns/${r.returnId}/eway-pdf`, { params: { companyId }, responseType: 'blob' })).data;
export async function printReturnPortal({ r, companyId }) {
  previewPdf(await portalPdf(r, companyId), `E-Way Bill ${r.ewayBillNo || ''}`.trim(), `EwayBill-${r.ewayBillNo || r.returnId}`, {
    mail: { subject: `E-Way Bill ${r.ewayBillNo || ''} – ${titleOf(r)} ${r.returnNo}`, message: `Dear Sir / Madam,\n\nPlease find attached the e-way bill ${r.ewayBillNo || ''} for ${titleOf(r)} ${r.returnNo}.`,
      summary: [['E-way bill', r.ewayBillNo || ''], [titleOf(r), r.returnNo], ['Vehicle', r.vehicleNo || '']] },
  });
}
/* the note (without its own e-way section) and then the portal e-way bill — one PDF */
export async function printReturnWithPortal({ r, company, user, withValue, companyId }) {
  const [page, blob] = await Promise.all([printReturn({ r, company, user, withValue, collect: true, ewayBlock: false }), portalPdf(r, companyId)]);
  await printMerged([page], [await blobB64(blob)]);
}
export async function uploadReturnPdf(r, file, companyId) {
  if (!/pdf$/i.test(file.type) && !/\.pdf$/i.test(file.name)) throw new Error('Choose the PDF saved from the e-way portal.');
  return (await axios.post(`/api/returns/${r.returnId}/eway-pdf`, { companyId, data: await blobB64(file) })).data.ewayPdf;
}
