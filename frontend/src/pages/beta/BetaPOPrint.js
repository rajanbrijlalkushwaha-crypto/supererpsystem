/* Purchase Order print — same document layout as the Proforma Invoice / order prints:
 * stacked tables with thin black lines, no black fills; printed on the same page through a hidden frame. */
import axios from 'axios';
import { inWords } from './BetaProforma';
import { fillPage } from './BetaDCPrint';
import { previewFrame, previewPdf, withTeal, signHtml, prodText, finalPdf } from './printKit';

const n = v => parseFloat(v) || 0;
const r2 = v => Math.round((Number(v) || 0) * 100) / 100;
const AMT = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const amt = v => AMT.format(Number(v) || 0);
const esc = v => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const nl = v => esc(v).replace(/\n/g, '<br>');
const d = v => { const x = v ? new Date(v) : null; return x && !isNaN(x) ? `${String(x.getDate()).padStart(2, '0')}-${String(x.getMonth() + 1).padStart(2, '0')}-${x.getFullYear()}` : ''; };
const stateCode = g => (/^\d{2}/.test(String(g || '')) ? String(g).slice(0, 2) : '');
const tidy = t => String(t || '').replace(/\s+,/g, ',').replace(/,(\s*,)+/g, ',').replace(/\s{2,}/g, ' ').replace(/,\s*$/, '').trim();
const parseSpec = raw => { try { const p = typeof raw === 'string' ? JSON.parse(raw || '') : raw; return p && typeof p === 'object' ? p : {}; } catch { return {}; } };
const key = s => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
const who = u => (u ? (typeof u === 'string' ? u : u.name || u.username || '') : '');

/* taxable / GST of one PO line */
const lineOf = it => {
  const gross = n(it.qty) * n(it.rate);
  const taxable = r2(gross - gross * Math.min(100, n(it.discount)) / 100);
  return { taxable, gst: r2(taxable * n(it.gstPercent ?? it.gst) / 100) };
};
/* additional charges of a PO: { chargeType, amount, gstPercent } */
export const chargeOf = c => ({ label: c.chargeType || c.description || 'Charges', amount: r2(n(c.amount)), gst: r2(n(c.amount) * n(c.gstPercent ?? c.gst) / 100), rate: n(c.gstPercent ?? c.gst) });

export async function printPO({ po, company, companyId, order, user }) {
  const co = company || {};
  let logo = '';
  if (co.logoFileName) {
    try {
      const b = (await axios.get(`/api/companies/logo/${encodeURIComponent(co.logoFileName)}`, { params: { companyId }, responseType: 'blob' })).data;
      logo = await new Promise(res => { const rd = new FileReader(); rd.onload = () => res(rd.result); rd.readAsDataURL(b); });
    } catch { logo = ''; }
  }
  const o = order || {};
  const items = (po.items || []).filter(it => it && (it.itemName || it.description));
  const charges = (po.charges || []).filter(c => c && n(c.amount)).map(chargeOf);
  const intra = (() => {
    const a = key(co.state), b = key(po.vendorState);
    if (a && b) return a === b;
    const g1 = String(co.gstin || '').slice(0, 2), g2 = String(po.vendorGstin || '').slice(0, 2);
    return !!(g1 && g2 && g1 === g2);
  })();
  const prodValue = r2(items.reduce((s, it) => s + lineOf(it).taxable, 0));
  const prodGst = r2(items.reduce((s, it) => s + lineOf(it).gst, 0));
  const chValue = r2(charges.reduce((s, c) => s + c.amount, 0));
  const chGst = r2(charges.reduce((s, c) => s + c.gst, 0));
  const taxable = r2(prodValue + chValue);
  const gst = n(po.totalGST) || r2(prodGst + chGst);
  const plain = r2(n(po.freightCharges) + n(po.packingCharges));   // older POs: added as is
  const total = n(po.grandTotal) || Math.round(taxable + gst + plain);
  const roundOff = n(po.roundOff);
  const notes = parseSpec(po.specSheet).itemNotes || [];
  const noteOf = (it, i) => (notes.find(x => x && x.itemIdx === i && key(x.itemName) === key(it.itemName)) || notes.find(x => x && key(x.itemName) === key(it.itemName)) || {}).text || '';
  const encl = [...(po.specFiles || []), ...(po.attachments || [])].filter(f => f && (f.name || f.fileName));
  const createdBy = who(po.createdBy) || who((po.audit || [])[0]?.by) || who((po.audit || [])[0]?.user) || '—';

  const NCOL = 10;   // Sl | Description | HSN | Due Date | Qty | Unit | Rate | Disc | GST | Amount
  const itemRows = items.map((it, i) => {
    const sp = noteOf(it, i);
    return `<tr class="it">
      <td class="c">${i + 1}</td>
      <td><b>${esc(it.itemName || it.description)}</b>${it.itemName && it.description ? `<div class="mut">${nl(it.description)}</div>` : ''}${sp ? `<div class="spec">${nl(sp)}</div>` : ''}</td>
      <td class="c">${esc(it.hsnCode || '')}</td><td class="c" style="white-space:nowrap">${d(it.dueDate || po.deliveryDate) || ''}</td><td class="c">${esc(n(it.qty))}</td><td class="c">${esc(it.unit || '')}</td>
      <td class="r">${amt(it.rate)}</td><td class="c">${n(it.discount) ? `${n(it.discount)}%` : ''}</td><td class="c">${n(it.gstPercent ?? it.gst)}%</td>
      <td class="r">${amt(lineOf(it).taxable)}</td></tr>`;
  }).join('');
  const sumLine = (label, value, cls = '') => `<tr class="sum ${cls}"><td colspan="${NCOL - 1}" class="r">${label}</td><td class="r">${value}</td></tr>`;
  const party = (title, name, addr, place, gstin, state, contact) => `<div class="lbl">${title}</div>
    <div class="pn">${esc(name || '—')}</div><div>${esc(tidy(addr || ''))}</div>${place ? `<div>${esc(place)}</div>` : ''}
    ${gstin !== undefined ? `<table class="kv"><tr><td>GSTIN/UIN</td><td>:</td><td><b>${esc(gstin || '—')}</b></td></tr>
      <tr><td>State</td><td>:</td><td><b>${esc(state || '—')}${stateCode(gstin) ? `, Code ${stateCode(gstin)}` : ''}</b></td></tr>
      ${contact ? `<tr><td>Contact</td><td>:</td><td>${esc(contact)}</td></tr>` : ''}</table>` : ''}`;

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Purchase Order ${esc(po.poNo || po.orderId)}</title>
<style>
* { margin:0; padding:0; box-sizing:border-box; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
body { font-family:Arial, Helvetica, sans-serif; font-size:8.6pt; color:#000; background:#fff; line-height:1.3; }
table { width:100%; border-collapse:collapse; font-size:inherit; }
.doc > table { margin-top:-1px; }
.doc > table:first-child { margin-top:0; }
.doc > table > tbody > tr > td, .doc > table > tbody > tr > th, .doc > table > thead > tr > th, .doc > table > thead > tr > td { border:1px solid #000; padding:3px 6px; vertical-align:top; }
.c { text-align:center; } .r { text-align:right; white-space:nowrap; }
.lbl { font-size:7pt; color:#333; text-transform:uppercase; letter-spacing:.4px; margin-bottom:1px; }
.val { font-size:10pt; font-weight:bold; }
.mut { font-size:7.6pt; color:#444; }
.spec { margin-top:2px; font-size:7.8pt; color:#000; }
.pn { font-size:10pt; font-weight:bold; margin-bottom:1px; }
.kv td { border:0 !important; padding:0 4px 0 0 !important; vertical-align:top; }
.kv td:first-child { width:72px; color:#333; white-space:nowrap; } .kv td:nth-child(2) { width:8px; }
.co { display:flex; gap:9px; align-items:center; }
.co img { width:58px; height:58px; object-fit:contain; flex-shrink:0; }
.co .adr { margin:1px 0 2px; max-width:330px; }
.co .nm { font-size:13.5pt; font-weight:bold; }
.ttl { text-align:center; font-size:14pt; font-weight:bold; letter-spacing:3px; padding:6px 4px !important; vertical-align:middle !important; }
.sec td { background:#EDEDED; font-weight:bold; font-size:8.4pt; letter-spacing:.4px; text-transform:uppercase; padding:3px 6px !important; }
.hd th { background:#F5F5F5; font-weight:bold; font-size:8pt; text-align:center; }
.items tbody tr.it td { border-top:0 !important; border-bottom:0 !important; padding-top:4px !important; padding-bottom:4px !important; }
.items tbody tr.fill td { height:3mm; border-top:0 !important; border-bottom:0 !important; }
.items tbody tr.sum td { border-top:0 !important; border-bottom:0 !important; }
tr.st td { font-weight:bold; }
tr.gt td { font-weight:bold; font-size:10pt; border-top:1px solid #000 !important; }
.words { font-size:9pt; }
.pre { white-space:normal; }
.sig td { height:38mm; vertical-align:top !important; }
.sig .box { height:100%; display:flex; flex-direction:column; justify-content:space-between; }
/* three equal columns, labels on one line at the bottom, each signature right above its own label */
.sig .row3 { display:flex; align-items:flex-end; gap:6px; }
.sig .row3 b { flex:1 1 0; text-align:center; }
.sig .row3 b, .sig .rcv b { font-weight:bold; color:#000; }
.jur { text-align:center; font-size:7.8pt; margin-top:3px; font-weight:bold; color:#000; }
.pby { font-size:7.4pt; margin-top:3px; font-weight:bold; color:#000; text-align:center; }
.pby .pl { margin-top:2px; }
@media print { @page { margin:7mm 8mm; size:A4 portrait; } tr { break-inside:avoid; } }
</style></head><body><div class="doc">

<!-- header -->
<table>
  <colgroup><col style="width:56%"><col style="width:22%"><col style="width:22%"></colgroup>
  <tbody>
    <tr><td rowspan="4" style="vertical-align:middle"><div class="co">${logo ? `<img src="${logo}" alt="">` : ''}<div>
        <div class="nm">${esc(co.companyName)}</div>
        <div class="adr">${esc(tidy([co.address, co.city].filter(Boolean).join(', ')))}${co.state || co.pincode ? `, ${esc([co.state, co.pincode].filter(Boolean).join(' - '))}` : ''}</div>
        <div>GSTIN/UIN: <b>${esc(co.gstin || '—')}</b>${stateCode(co.gstin) ? ` &nbsp;·&nbsp; State Code: <b>${stateCode(co.gstin)}</b>` : ''}</div>
        <div>PAN: <b>${esc(co.pan || '—')}</b></div>
        <div>${esc([co.phone && 'Ph: ' + co.phone, co.email && 'E-mail: ' + co.email].filter(Boolean).join('  |  '))}</div></div></div></td>
      <td colspan="2" class="ttl">PURCHASE ORDER</td></tr>
    <tr><td><div class="lbl">PO No.</div><div class="val">${esc(po.poNo || po.poNumber || po.orderId)}</div></td><td><div class="lbl">PO Date</div><div class="val">${d(po.poDate) || '—'}</div></td></tr>
    <tr><td><div class="lbl">Delivery Date</div><b>${d(po.deliveryDate) || '—'}</b></td><td><div class="lbl">Your Quotation Ref.</div><b>${esc(po.quotationRef || '—')}</b></td></tr>
    <tr><td><div class="lbl">Our Order Ref.</div><b>${esc(o.orderNo || '—')}</b></td><td><div class="lbl">Payment Terms</div><b>${esc(po.paymentTerms || '—')}</b></td></tr>
  </tbody>
</table>

<!-- vendor | ship from | deliver to -->
<table>
  <colgroup><col style="width:36%"><col style="width:30%"><col style="width:34%"></colgroup>
  <tbody><tr>
    <td>${party('Supplier (Vendor)', po.vendorName, po.vendorAddress, [po.vendorCity, po.vendorPincode].filter(Boolean).join(' - '), po.vendorGstin, po.vendorState, [po.contactPerson, po.mobile, po.email].filter(Boolean).join(', '))}</td>
    <td><div class="lbl">Dispatch From (Vendor)</div>
      <div>${esc(tidy(po.shipFromAddress || po.vendorAddress || '—'))}</div>
      <div>${esc([po.shipFromCity || po.vendorCity, po.shipFromState || po.vendorState, po.shipFromPincode || po.vendorPincode].filter(Boolean).join(', '))}</div>
      <table class="kv" style="margin-top:4px"><tr><td>Dispatch Mode</td><td>:</td><td><b>${esc(po.dispatchMode || '—')}</b></td></tr>
        <tr><td>Freight</td><td>:</td><td><b>${esc(po.freightTerms || '—')}</b></td></tr>
        <tr><td>Payment Mode</td><td>:</td><td><b>${esc(po.paymentMode || '—')}</b></td></tr></table></td>
    <td><div class="lbl">Deliver To</div>
      <div class="pre">${nl(tidy(po.deliveryAddr || po.deliveryAddress || [co.companyName, co.address, co.city, co.state, co.pincode].filter(Boolean).join(', ')))}</div>
      <table class="kv" style="margin-top:4px"><tr><td>Bill To</td><td>:</td><td><b>${esc(co.companyName || '')}</b></td></tr>
        <tr><td>GSTIN</td><td>:</td><td><b>${esc(co.gstin || '—')}</b></td></tr></table></td>
  </tr></tbody>
</table>

<!-- items + value -->
<table class="items">
  <colgroup><col style="width:24px"><col><col style="width:60px"><col style="width:70px"><col style="width:36px"><col style="width:40px"><col style="width:80px"><col style="width:38px"><col style="width:38px"><col style="width:92px"></colgroup>
  <thead class="hd"><tr><th>Sl</th><th>Description of Goods / Specification</th><th>HSN/SAC</th><th>Due Date</th><th>Qty</th><th>Unit</th><th>Rate</th><th>Disc</th><th>GST</th><th>Amount (₹)</th></tr></thead>
  <tbody>
    ${itemRows || `<tr class="it"><td colspan="${NCOL}" class="c mut">No items</td></tr>`}
    <tr class="fill" id="fillrow"><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
    <tr class="gt"><td colspan="${NCOL - 1}" class="r">Product Value</td><td class="r">${amt(prodValue)}</td></tr>
    ${charges.map(c => sumLine(`Add: ${esc(c.label)} <span class="mut">(GST ${c.rate}%)</span>`, amt(c.amount))).join('')}
    ${sumLine('Total Taxable Value', amt(taxable), 'st')}
    ${intra
      ? sumLine('Add: CGST', amt(gst / 2)) + sumLine('Add: SGST', amt(gst - r2(gst / 2)))
      : sumLine('Add: IGST', amt(gst))}
    ${n(po.freightCharges) ? sumLine('Add: Freight', amt(po.freightCharges)) : ''}
    ${n(po.packingCharges) ? sumLine('Add: Packing', amt(po.packingCharges)) : ''}
    ${roundOff ? sumLine('Round Off', `${roundOff > 0 ? '+' : ''}${amt(roundOff)}`) : ''}
    <tr class="gt"><td colspan="${NCOL - 1}" class="r">PO VALUE</td><td class="r">₹ ${amt(total)}</td></tr>
    <tr><td colspan="${NCOL}" class="words">Amount (in words): <b>INR ${esc(inWords(total).replace(' Rupees', ''))}</b></td></tr>
  </tbody>
</table>

${encl.length ? `<!-- enclosures -->
<table><tbody>
  <tr class="sec"><td>Enclosures (drawings / specifications sent with this PO)</td></tr>
  <tr><td>${encl.map((f, i) => `${i + 1}. ${esc(f.name || f.fileName)}${f.itemName ? ` <span class="mut">(${esc(f.itemName)})</span>` : ''}`).join(' &nbsp;&nbsp; ')}</td></tr>
</tbody></table>` : ''}

<!-- terms -->
<table><tbody>
  <tr class="sec"><td>Terms &amp; Conditions</td></tr>
  <tr><td class="pre">${po.termsConditions ? nl(po.termsConditions) : `1. Please quote our PO No. ${esc(po.poNo || po.orderId)} on your invoice, delivery challan and all letters.<br>2. Material must be as per the specification / drawing above; rejected material will be returned at your cost.<br>3. Delivery on or before the delivery date mentioned above.`}</td></tr>
  ${po.vendorNotes ? `<tr><td><b>Note:</b> ${nl(po.vendorNotes)}</td></tr>` : ''}
</tbody></table>

<!-- signatures: vendor acceptance | company -->
<table class="sig">
  <colgroup><col style="width:45%"><col></colgroup>
  <tbody><tr>
    <td><div class="box rcv"><b>Accepted by Vendor: ${esc(po.vendorName || '')}</b><b>Signature &amp; Seal</b></div></td>
    <td><div class="box"><div style="text-align:right"><b>For ${esc(co.companyName || '')}</b></div>
      <div class="row3"><b>Prepared By</b><b>Verified By</b><b>Authorised Signatory</b></div></div></td>
  </tr></tbody>
</table>
</div>
<div class="pby"><div class="jur">SUBJECT TO AHMEDABAD JURISDICTION &nbsp;|&nbsp; This is a Computer Generated Purchase Order</div><div class="pl">Printed by Super ERP System &nbsp;|&nbsp; Created by : ${esc(createdBy)} &nbsp;|&nbsp; Printed by : ${esc(who(user) || '—')} &nbsp;|&nbsp; ${esc(new Date().toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }))}</div></div>
</body></html>`;

  // laid out at the printable A4 width so the blank row can fill the page to the bottom
  document.getElementById('po-print-frame')?.remove();
  const fr = document.createElement('iframe');
  fr.id = 'po-print-frame'; fr.setAttribute('aria-hidden', 'true');
  fr.style.cssText = 'position:fixed;left:-10000px;top:0;width:194mm;height:281mm;border:0;visibility:hidden';
  document.body.appendChild(fr);
  const w = fr.contentWindow;
  w.document.open(); w.document.write(html); w.document.close();
  await new Promise(r => setTimeout(r, 400));
  fillPage(w.document);

  // spec files / attachments: one PDF from the server — the PO first, then each file
  // e-mail to the vendor and e-signatures
  const poNo = po.poNo || po.poNumber || po.orderId;
  const names = items.map(it => it.itemName || it.description);
  const meta = {
    sign: po.orderId ? { type: 'purchaseOrder', id: po.orderId, perm: 'purchaseOrder' } : null,
    reprint: () => printPO({ po, company, companyId, order, user }),
    to: po.email || undefined,
    mail: {
      subject: `Purchase Order ${poNo}${po.quotationRef ? ` against your quotation ${po.quotationRef}` : ''} – ${prodText(names)}`,
      message: `Dear ${po.contactPerson || 'Sir / Madam'},\n\nPlease find attached our Purchase Order ${poNo}${po.poDate ? ` dated ${d(po.poDate)}` : ''}${po.quotationRef ? `, placed against your quotation ${po.quotationRef}` : ''}.\n\nKindly confirm acceptance of the order and the delivery date by reply e-mail, and quote our PO number on your invoice and delivery challan.`,
      summary: [['Purchase order', `${poNo}${po.poDate ? `  ·  ${d(po.poDate)}` : ''}`], ['Your quotation', po.quotationRef || ''], ['Products', items.map(it => `${it.itemName || it.description} — ${n(it.qty)} ${it.unit || ''}`.trim()).join('\n')],
        ['PO value', `₹ ${amt(total)} (incl. GST)`], ['Delivery by', d(po.deliveryDate)], ['Deliver to', po.deliveryAddress || po.deliverTo || ''], ['Payment terms', po.paymentTerms || '']],
    },
  };
  const files = [...(po.specFiles || []), ...(po.attachments || [])].filter(f => f && f.fileName);
  if (files.length && po.orderId) {
    try {
      // the order + its files as one PDF, with the signatures on the order and the page signatures on the files;
      // made again (in the open preview) after each signing
      const base = withTeal('<!DOCTYPE html>' + w.document.documentElement.outerHTML);
      const pack = async () => {
        const pg = await signHtml(base, meta.sign);
        const res = await axios.post(`/api/purchase-orders/${po.orderId}/print-pack`, { companyId, html: pg }, { params: { companyId }, responseType: 'blob' });
        return { r: res, page: pg, blob: await finalPdf(res.data, meta.sign) };
      };
      const { r, page, blob } = await pack();
      meta.rebuild = async () => (await pack()).blob;
      let notPrinted = [];
      try { notPrinted = JSON.parse(decodeURIComponent(r.headers['x-not-printed'] || '%5B%5D')); } catch { notPrinted = []; }
      const t = w.document.title; fr.remove();
      printPdf(blob, t, page, meta);
      return { files: files.length, notPrinted };
    } catch (e) {
      // the PO alone still prints
      previewFrame(fr, undefined, meta);   // opens the preview: Sign · Email · Save PDF · Print
      return { files: files.length, error: 'The attachments could not be added to the print — only the PO is printed.' };
    }
  }
  previewFrame(fr, undefined, meta);   // opens the preview: Sign · Email · Save PDF · Print
  return { files: 0, notPrinted: [] };
}

/* print a PDF (blob) from a hidden frame on this page */
function printPdf(blob, title, html, meta = {}) {
  previewPdf(blob, title || 'Document', undefined, { html, ...meta });   // html: to find the client's e-mail for the To box   // the preview: Email · Save PDF · Print
}
