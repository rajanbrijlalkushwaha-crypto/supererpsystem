/* Sales Order print — same document layout as the PO / Proforma Invoice prints:
 * stacked tables with thin black lines, no black fills; printed on this page through a hidden frame.
 * The order's drawings / specification files and attachments are added after it as one PDF (server side). */
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
const nameOf = it => it.description || it.material || it.itemName || '';

export async function printSO({ order, company, user }) {
  const o = order || {}, co = company || {};
  const companyId = co.companyId;
  let logo = '';
  if (co.logoFileName) {
    try {
      const b = (await axios.get(`/api/companies/logo/${encodeURIComponent(co.logoFileName)}`, { params: { companyId }, responseType: 'blob' })).data;
      logo = await new Promise(res => { const rd = new FileReader(); rd.onload = () => res(rd.result); rd.readAsDataURL(b); });
    } catch { logo = ''; }
  }
  const items = (o.items || []).filter(it => it && nameOf(it));
  const addons = (o.addons || []).filter(a => a && String(a.description || '').trim());
  const chAll = (o.charges || []).filter(c => c && n(c.amount));
  const chGst = chAll.filter(c => !c.withoutGst), chPlain = chAll.filter(c => c.withoutGst);
  const scope = (o.scopeItems || []).filter(s => s && (s.item || s.name || s.description));
  const bg = o.bankGuarantee || {}, wty = o.warranty || {};

  const prodValue = r2(items.reduce((s, it) => s + n(it.qty) * n(it.rate), 0));
  const prodGst = r2(items.reduce((s, it) => s + n(it.qty) * n(it.rate) * n(it.gst ?? it.gstPercent) / 100, 0));
  const chValue = r2(chGst.reduce((s, c) => s + n(c.amount), 0));
  const chGstAmt = r2(chGst.reduce((s, c) => s + n(c.amount) * n(c.gst ?? c.gstPercent) / 100, 0));
  const taxable = r2(prodValue + chValue);
  const gst = n(o.totalGST) || r2(prodGst + chGstAmt);
  const plain = r2(chPlain.reduce((s, c) => s + n(c.amount), 0));
  const total = n(o.grandTotal) || r2(taxable + gst + plain);
  const intra = n(o.cgst) || n(o.sgst) ? true : n(o.igst) ? false : (() => {
    const a = key(co.state), b = key(o.customerState);
    if (a && b) return a === b;
    const g1 = String(co.gstin || '').slice(0, 2), g2 = String(o.customerGstin || '').slice(0, 2);
    return !!(g1 && g2 && g1 === g2);
  })();
  // a charge as % of the product value: the % typed on the order, else worked out from its amount
  const chPct = c => {
    const p = c.mode === 'pct' && n(c.pct) > 0 ? n(c.pct) : (prodValue > 0 ? n(c.amount) / prodValue * 100 : 0);
    return p > 0 ? String(Math.round(p * 100) / 100) : '';
  };
  const notes = parseSpec(o.specSheet).itemNotes || [];
  const noteOf = it => (notes.find(x => x && it._id && x.itemId === it._id) || notes.find(x => x && key(x.itemName) === key(nameOf(it))) || {}).text || '';
  const encl = [...(o.specFiles || []), ...(o.attachments || o.documents || [])].filter(f => f && (f.name || f.fileName));
  const createdBy = who(o.createdBy) || who((o.audit || [])[0]?.by) || who((o.audit || [])[0]?.user) || '—';

  const NCOL = 9;   // Sl | Description | HSN | Due Date | Qty | Unit | Rate | GST | Amount
  const itemRows = items.map((it, i) => {
    const sp = noteOf(it);
    return `<tr class="it">
      <td class="c">${i + 1}</td>
      <td><b>${esc(nameOf(it))}</b>${it.itemCode ? `<div class="mut">Code: ${esc(it.itemCode)}</div>` : ''}${sp ? `<div class="spec">${nl(sp)}</div>` : ''}</td>
      <td class="c">${esc(it.hsnCode || '')}</td><td class="c" style="white-space:nowrap">${d(it.dueDate || o.dueDate) || ''}</td><td class="c">${esc(n(it.qty))}</td><td class="c">${esc(it.unit || '')}</td>
      <td class="r">${amt(it.rate)}</td><td class="c">${n(it.gst ?? it.gstPercent)}%</td><td class="r">${amt(n(it.qty) * n(it.rate))}</td></tr>`;
  }).join('');
  const sumLine = (label, value, cls = '') => `<tr class="sum ${cls}"><td colspan="${NCOL - 1}" class="r">${label}</td><td class="r">${value}</td></tr>`;
  const chLabel = c => `Add: ${esc(c.chargeType || 'Charges')}${c.description && !/% of taxable$/.test(c.description) ? ` — ${esc(c.description)}` : ''}${chPct(c) ? ` <span class="mut">(${chPct(c)}% of product value)</span>` : ''}`;
  const party = (title, name, addr, place, gstin, state, contact) => `<div class="lbl">${title}</div>
    <div class="pn">${esc(name || '—')}</div><div>${esc(tidy(addr || ''))}</div>${place ? `<div>${esc(place)}</div>` : ''}
    <table class="kv"><tr><td>GSTIN/UIN</td><td>:</td><td><b>${esc(gstin || '—')}</b></td></tr>
      <tr><td>State</td><td>:</td><td><b>${esc(state || '—')}${stateCode(gstin) ? `, Code ${stateCode(gstin)}` : ''}</b></td></tr>
      ${contact ? `<tr><td>Contact</td><td>:</td><td>${esc(contact)}</td></tr>` : ''}</table>`;
  const billContact = [o.billToContact || o.contactPerson, o.billToMobile || o.mobile, o.email].filter(Boolean).join(', ');
  const shipContact = [o.shipToContact || o.billToContact || o.contactPerson, o.shipToMobile || o.billToMobile || o.mobile].filter(Boolean).join(', ');
  const hasWty = wty.period || wty.type || wty.startDate || wty.endDate || wty.terms;

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Sales Order ${esc(o.orderNo || o.orderId)}</title>
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
.spec { margin-top:2px; font-size:7.8pt; color:#000; white-space:normal; }
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
      <td colspan="2" class="ttl">SALES ORDER</td></tr>
    <tr><td><div class="lbl">Order No.</div><div class="val">${esc(o.orderNo || o.orderId)}</div></td><td><div class="lbl">Order Date</div><div class="val">${d(o.orderDate) || '—'}</div></td></tr>
    <tr><td><div class="lbl">Client PO No.</div><b>${esc(o.customerPO || '—')}</b></td><td><div class="lbl">Client PO Date</div><b>${d(o.poDate) || '—'}</b></td></tr>
    <tr><td><div class="lbl">Quotation Ref.</div><b>${esc(o.quotationRef || '—')}</b>${o.quotationDate ? ` <span class="mut">dt. ${d(o.quotationDate)}</span>` : ''}</td><td><div class="lbl">Delivery Due</div><b>${d(o.dueDate || o.deliveryDate) || '—'}</b></td></tr>
  </tbody>
</table>

<!-- buyer | consignee -->
<table>
  <colgroup><col style="width:50%"><col style="width:50%"></colgroup>
  <tbody><tr>
    <td>${party(`Buyer (Bill To)${o.customerCode ? ` &nbsp;·&nbsp; Client ID ${esc(o.customerCode)}` : ''}`, o.customerName || o.party, o.address,
      [o.customerCity, o.customerPincode].filter(Boolean).join(' - '), o.customerGstin, o.customerState, billContact)}</td>
    <td>${party('Consignee (Ship To)', o.shipToName || o.customerName, o.shipToAddress || o.address,
      [o.shipToCity || o.customerCity, o.shipToPincode || o.customerPincode].filter(Boolean).join(' - '), o.shipToGstin || o.customerGstin, o.shipToState || o.customerState, shipContact)}</td>
  </tr>
  ${o.paymentTerms ? `<tr><td colspan="2"><b>Payment Terms:</b> ${esc(o.paymentTerms)}</td></tr>` : ''}
  </tbody>
</table>

<!-- items + value -->
<table class="items">
  <colgroup><col style="width:24px"><col><col style="width:60px"><col style="width:70px"><col style="width:40px"><col style="width:40px"><col style="width:84px"><col style="width:38px"><col style="width:96px"></colgroup>
  <thead class="hd"><tr><th>Sl</th><th>Description of Goods / Specification</th><th>HSN/SAC</th><th>Due Date</th><th>Qty</th><th>Unit</th><th>Rate</th><th>GST</th><th>Amount (₹)</th></tr></thead>
  <tbody>
    ${itemRows || `<tr class="it"><td colspan="${NCOL}" class="c mut">No items</td></tr>`}
    <tr class="fill" id="fillrow"><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
    <tr class="gt"><td colspan="${NCOL - 1}" class="r">Product Value</td><td class="r">${amt(prodValue)}</td></tr>
    ${chGst.map(c => sumLine(chLabel(c), amt(c.amount))).join('')}
    ${chGst.length ? sumLine('Total Taxable Value', amt(taxable), 'st') : ''}
    ${intra ? sumLine('Add: CGST', amt(n(o.cgst) || gst / 2)) + sumLine('Add: SGST', amt(n(o.sgst) || gst - r2(gst / 2))) : sumLine('Add: IGST', amt(n(o.igst) || gst))}
    ${chPlain.map(c => sumLine(`Add: ${esc(c.description || c.chargeType || 'Other')} <span class="mut">(without GST)</span>`, amt(c.amount))).join('')}
    <tr class="gt"><td colspan="${NCOL - 1}" class="r">ORDER VALUE</td><td class="r">₹ ${amt(total)}</td></tr>
    <tr><td colspan="${NCOL}" class="words">Amount (in words): <b>INR ${esc(inWords(total).replace(' Rupees', ''))}</b></td></tr>
  </tbody>
</table>

${addons.length ? `<!-- add-on items -->
<table>
  <colgroup><col style="width:24px"><col><col style="width:40%"><col style="width:50px"><col style="width:44px"></colgroup>
  <tbody>
    <tr class="sec"><td colspan="5">Add-on items (supplied with the order — price included in the product rate)</td></tr>
    <tr class="hd"><th>Sl</th><th>Item</th><th>Specification / Remarks</th><th>Qty</th><th>Unit</th></tr>
    ${addons.map((a, i) => `<tr><td class="c">${i + 1}</td><td>${esc(a.description)}${a.category ? ` <span class="mut">(${esc(a.category)})</span>` : ''}</td><td>${nl(a.remarks || '')}</td><td class="c">${esc(n(a.qty) || 1)}</td><td class="c">${esc(a.unit || 'NOS')}</td></tr>`).join('')}
  </tbody>
</table>` : ''}

${scope.length ? `<!-- scope -->
<table><tbody>
  <tr class="sec"><td colspan="5">Scope of Work</td></tr>
  <tr class="hd"><th style="width:24px">Sl</th><th>Scope Item</th><th style="width:70px">Client Scope</th><th style="width:70px">Our Scope</th><th>Remarks</th></tr>
  ${scope.map((s, i) => `<tr><td class="c">${i + 1}</td><td>${esc(s.item || s.name || s.description)}</td><td class="c">${s.clientScope ? '✓' : ''}</td><td class="c">${s.ourScope ? '✓' : ''}</td><td>${esc(s.remarks || '')}</td></tr>`).join('')}
</tbody></table>` : ''}

${hasWty || bg.applicable ? `<!-- warranty / bank guarantee -->
<table><tbody>
  ${hasWty ? `<tr class="sec"><td>Warranty</td></tr><tr><td>${esc([wty.type, wty.period && `Period: ${wty.period}`, wty.startDate && `From ${d(wty.startDate)}`, wty.endDate && `to ${d(wty.endDate)}`].filter(Boolean).join(' · '))}${wty.terms ? `<div class="pre">${nl(wty.terms)}</div>` : ''}</td></tr>` : ''}
  ${bg.applicable ? `<tr class="sec"><td>Bank Guarantee</td></tr><tr><td>${esc([bg.pct && `${bg.pct}% of order value (₹ ${amt(total * n(bg.pct) / 100)})`, bg.basis, bg.bankName && `Bank: ${bg.bankName}`, bg.bgNo && `BG No. ${bg.bgNo}`, bg.expiry && `Expiry ${d(bg.expiry)}`].filter(Boolean).join(' · '))}</td></tr>` : ''}
</tbody></table>` : ''}

${encl.length ? `<!-- enclosures -->
<table><tbody>
  <tr class="sec"><td>Enclosures (drawings / specifications / documents)</td></tr>
  <tr><td>${encl.map((f, i) => `${i + 1}. ${esc(f.name || f.fileName)}${f.itemName ? ` <span class="mut">(${esc(f.itemName)})</span>` : ''}`).join(' &nbsp;&nbsp; ')}</td></tr>
</tbody></table>` : ''}

${o.termsConditions || o.customerNotes ? `<!-- terms -->
<table><tbody>
  <tr class="sec"><td>Terms &amp; Conditions</td></tr>
  <tr><td class="pre">${nl(o.termsConditions || o.customerNotes)}</td></tr>
</tbody></table>` : ''}

<!-- signatures: client acceptance | company -->
<table class="sig">
  <colgroup><col style="width:45%"><col></colgroup>
  <tbody><tr>
    <td><div class="box rcv"><b>Accepted by Client: ${esc(o.customerName || '')}</b><b>Signature &amp; Seal</b></div></td>
    <td><div class="box"><div style="text-align:right"><b>For ${esc(co.companyName || '')}</b></div>
      <div class="row3"><b>Prepared By</b><b>Verified By</b><b>Authorised Signatory</b></div></div></td>
  </tr></tbody>
</table>
</div>
<div class="pby"><div class="jur">SUBJECT TO AHMEDABAD JURISDICTION &nbsp;|&nbsp; This is a Computer Generated Sales Order</div><div class="pl">Printed by Super ERP System &nbsp;|&nbsp; SO ID: ${esc(o.orderId || '—')} &nbsp;|&nbsp; Created by : ${esc(createdBy)} &nbsp;|&nbsp; Printed by : ${esc(who(user) || '—')} &nbsp;|&nbsp; ${esc(new Date().toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }))}</div></div>
</body></html>`;

  // laid out at the printable A4 width so the blank row can fill the page to the bottom
  document.getElementById('so-print-frame')?.remove();
  const fr = document.createElement('iframe');
  fr.id = 'so-print-frame'; fr.setAttribute('aria-hidden', 'true');
  fr.style.cssText = 'position:fixed;left:-10000px;top:0;width:194mm;height:281mm;border:0;visibility:hidden';
  document.body.appendChild(fr);
  const w = fr.contentWindow;
  w.document.open(); w.document.write(html); w.document.close();
  await new Promise(r => setTimeout(r, 400));
  fillPage(w.document);

  // e-mail (order acceptance) and e-signatures
  const names = items.map(nameOf);
  const contact = o.billToContact || o.contactPerson || '';
  const poRef = [o.customerPO, o.poDate && `dt. ${d(o.poDate)}`].filter(Boolean).join(' ');
  const meta = {
    sign: o.orderId ? { type: 'salesOrder', id: o.orderId, perm: 'salesOrder' } : null,
    reprint: () => printSO({ order, company, user }),
    mail: {
      subject: `Order Acceptance – ${o.customerPO ? `Your PO ${poRef}` : `Our SO ${o.orderNo || o.orderId}`} – ${prodText(names)}`,
      message: `Dear ${contact || 'Sir / Madam'},\n\nThank you for your purchase order${o.customerPO ? ` no. ${poRef}` : ''}. We are pleased to confirm that we have accepted it, and it is booked with us as Sales Order ${o.orderNo || o.orderId}.\n\nThe order acceptance is attached. Please check the items, quantities, prices and delivery date, and let us know within 2 days if anything needs to be corrected.`,
      summary: [['Our sales order', `${o.orderNo || o.orderId}${o.orderDate ? `  ·  ${d(o.orderDate)}` : ''}`], ['Your PO', poRef], ['Products', items.map(it => `${nameOf(it)} — ${n(it.qty)} ${it.unit || ''}`.trim()).join('\n')],
        ['Order value', `₹ ${amt(total)} (incl. GST)`], ['Delivery due', d(o.dueDate || o.deliveryDate)], ['Payment terms', o.paymentTerms || '']],
    },
  };

  // drawings / spec files / attachments: one PDF from the server — the order first, then each file
  const files = encl.filter(f => f.fileName);
  if (files.length && o.orderId && companyId) {
    try {
      // the order + its files as one PDF, with the signatures on the order and the page signatures on the files;
      // made again (in the open preview) after each signing
      const base = withTeal('<!DOCTYPE html>' + w.document.documentElement.outerHTML);
      const pack = async () => {
        const pg = await signHtml(base, meta.sign);
        const res = await axios.post(`/api/sales-orders/${o.orderId}/print-pack`, { companyId, html: pg }, { params: { companyId }, responseType: 'blob' });
        return { r: res, page: pg, blob: await finalPdf(res.data, meta.sign) };
      };
      const { r, page, blob } = await pack();
      meta.rebuild = async () => (await pack()).blob;
      let notPrinted = [];
      try { notPrinted = JSON.parse(decodeURIComponent(r.headers['x-not-printed'] || '%5B%5D')); } catch { notPrinted = []; }
      const t = w.document.title; fr.remove();
      printPdf(blob, t, page, meta);
      return { files: files.length, notPrinted };
    } catch {
      // the order alone still prints
      previewFrame(fr, undefined, meta);   // opens the preview: Sign · Email · Save PDF · Print
      return { files: files.length, error: 'The attached files could not be added to the print — only the order is printed.' };
    }
  }
  previewFrame(fr, undefined, meta);   // opens the preview: Sign · Email · Save PDF · Print
  return { files: 0, notPrinted: [] };
}

/* print a PDF (blob) from a hidden frame on this page */
function printPdf(blob, title, html, meta = {}) {
  previewPdf(blob, title || 'Document', undefined, { html, ...meta });   // html: to find the client's e-mail for the To box   // the preview: Email · Save PDF · Print
}
