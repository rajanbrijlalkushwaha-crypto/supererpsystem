/* Prints for Bank Guarantees and Warranty Certificates — same look as the other Beta documents
 * (Arial, thin black lines, grey heads, company letterhead). Each prints from a hidden frame. */
import { legalNoteHtml } from '../../utils/printFont';
import { brandLine } from '../../utils/printBranding';
import { inWords } from './BetaProforma';

const esc = v => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const nl = v => esc(v).replace(/\r?\n/g, '<br>');
const inr = v => (Number(v) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const dmy = v => { const x = v ? new Date(v) : null; return x && !isNaN(x) ? `${String(x.getDate()).padStart(2, '0')}-${String(x.getMonth() + 1).padStart(2, '0')}-${x.getFullYear()}` : ''; };
const longDate = v => { const x = v ? new Date(v) : null; return x && !isNaN(x) ? x.toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' }) : ''; };
const nowText = () => new Date().toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

/* days from today to a date (negative = past) */
export const daysTo = v => { const x = v ? new Date(v) : null; if (!x || isNaN(x)) return null; const t = new Date(); t.setHours(0, 0, 0, 0); x.setHours(0, 0, 0, 0); return Math.round((x - t) / 86400000); };
/* state of a bank guarantee: released / pending approval / expired / expiring (≤ 30 days) / active */
export const bgState = b => {
  if (b.status === 'released') return { k: 'released', label: 'Released' };
  if (b.status === 'claimed') return { k: 'claimed', label: 'Claimed' };
  if (b.status === 'pending') return { k: 'pending', label: 'Pending approval' };
  const dl = daysTo(b.expiryDate || b.endDate);
  if (dl != null && dl < 0) return { k: 'expired', label: 'Expired' };
  if (dl != null && dl <= 30) return { k: 'expiring', label: `Expires in ${dl} day${dl === 1 ? '' : 's'}` };
  return { k: 'active', label: 'Active' };
};
/* warranty: in force / expiring (≤ 30 days) / over */
export const wcState = c => {
  const dl = daysTo(c.endDate), ds = daysTo(c.startDate);
  if (dl != null && dl < 0) return { k: 'expired', label: 'Expired' };
  if (ds != null && ds > 0) return { k: 'pending', label: 'Starts later' };
  if (dl != null && dl <= 30) return { k: 'expiring', label: `Ends in ${dl} day${dl === 1 ? '' : 's'}` };
  return { k: 'active', label: 'In warranty' };
};

async function logoOf(co) {
  if (!co?.logoFileName) return '';
  try {
    const b = await (await fetch(`/api/companies/logo/${encodeURIComponent(co.logoFileName)}?companyId=${co.companyId}`)).blob();
    return await new Promise(r => { const rd = new FileReader(); rd.onload = () => r(rd.result); rd.readAsDataURL(b); });
  } catch { return ''; }
}

const BASE_CSS = `
* { margin:0; padding:0; box-sizing:border-box; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
body { font-family:Arial, Helvetica, sans-serif; font-size:8.8pt; color:#000; background:#fff; line-height:1.35; }
table { width:100%; border-collapse:collapse; }
.hdr td { border:0.6pt solid #000; padding:6px 8px; vertical-align:middle; }
.hdr .lg { width:120px; text-align:center; } .hdr .lg img { max-height:48px; max-width:110px; object-fit:contain; }
.hdr .co { text-align:center; } .hdr .co .nm { font-size:14pt; font-weight:bold; } .hdr .co .ad { font-size:8pt; margin-top:2px; }
.hdr .ttl { width:220px; padding:0; }
.hdr .ttl .t { background:#E9E9E9; border-bottom:0.6pt solid #000; text-align:center; font-size:11.5pt; font-weight:bold; padding:6px 4px; letter-spacing:.6px; }
.hdr .ttl .k { display:flex; justify-content:space-between; gap:8px; padding:3px 8px; font-size:8.2pt; }
.lst { margin-top:6px; }
.lst th { background:#E9E9E9; border:0.6pt solid #000; padding:4px; font-size:7.8pt; text-transform:uppercase; letter-spacing:.2px; white-space:nowrap; }
.lst td { border:0.6pt solid #000; padding:3px 4px; vertical-align:top; }
.lst tr.tot td { background:#E9E9E9; font-weight:bold; }
.c { text-align:center; } .r { text-align:right; white-space:nowrap; } .nw { white-space:nowrap; } .sm { font-size:7.5pt; color:#333; }
.kv td, .kv th { border:0.6pt solid #000; padding:5px 8px; vertical-align:top; text-align:left; }
.kv th { background:#F2F2F2; width:30%; font-weight:bold; }
.sec { background:#E9E9E9; border:0.6pt solid #000; border-bottom:0; padding:4px 8px; font-weight:bold; font-size:9pt; letter-spacing:.3px; text-transform:uppercase; margin-top:8px; }
.foot { display:flex; justify-content:space-between; font-size:7.6pt; color:#333; padding:5px 0 0; }
`;

const header = (co, logo, title, kvs) => {
  const addr = [co.address, co.city, co.state, co.pincode].filter(Boolean).join(', ');
  const line = [co.gstin && 'GSTIN: ' + esc(co.gstin), co.phone && 'Ph: ' + esc(co.phone), co.email && esc(co.email)].filter(Boolean).join('&nbsp; · &nbsp;');
  return `<table class="hdr"><tr>
  <td class="lg">${logo ? `<img src="${logo}">` : ''}</td>
  <td class="co"><div class="nm">${esc(co.companyName || co.name)}</div>${addr ? `<div class="ad">${esc(addr)}</div>` : ''}${line ? `<div class="ad">${line}</div>` : ''}</td>
  <td class="ttl"><div class="t">${title}</div>${kvs.map(([k, v]) => `<div class="k"><span>${k}</span><b>${v}</b></div>`).join('')}</td>
</tr></table>`;
};

function printPage(html, id) {
  document.getElementById(id)?.remove();
  const fr = document.createElement('iframe');
  fr.id = id; fr.setAttribute('aria-hidden', 'true');
  fr.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
  document.body.appendChild(fr);
  const w = fr.contentWindow;
  w.document.open(); w.document.write(html); w.document.close();
  setTimeout(() => { w.focus(); w.print(); window.focus(); setTimeout(() => fr.remove(), 1000); }, 400);
}
const page = (title, css, body, landscape) => `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>${BASE_CSS}${css || ''}
@media print { @page { margin:8mm 8mm 10mm; size:A4 ${landscape ? 'landscape' : 'portrait'}; @bottom-right { content:"Page " counter(page) " of " counter(pages); font:7.5pt Arial, sans-serif; color:#444; } }
  thead { display:table-header-group; } tr { break-inside:avoid; } }
</style></head><body>${body}</body></html>`;

/* ───────── Bank Guarantee list ───────── */
export async function printBgList({ rows, company, user, filter }) {
  const co = company || {}, logo = await logoOf(co);
  const tot = rows.reduce((t, b) => t + (Number(b.bgAmount || b.amount) || 0), 0);
  const live = rows.filter(b => ['active', 'expiring'].includes(bgState(b).k));
  const liveAmt = live.reduce((t, b) => t + (Number(b.bgAmount || b.amount) || 0), 0);
  const body = rows.map((b, i) => `<tr>
    <td class="c">${i + 1}</td><td class="nw"><b>${esc(b.bgNo || '—')}</b></td>
    <td><b>${esc(b.customerName)}</b>${b.orderNo ? `<div class="sm">Order ${esc(b.orderNo)}${b.customerPO ? ' · PO ' + esc(b.customerPO) : ''}</div>` : ''}</td>
    <td>${esc(b.issuingBankName || '—')}${b.issuingBankAccNo ? `<div class="sm">A/c ${esc(b.issuingBankAccNo)}</div>` : ''}</td>
    <td>${esc(b.issuedToBankName || '—')}</td>
    <td class="r"><b>${inr(b.bgAmount || b.amount)}</b></td>
    <td class="c nw">${dmy(b.startDate) || '—'}</td><td class="c nw">${dmy(b.expiryDate || b.endDate) || '—'}</td><td class="c nw">${dmy(b.claimExpiryDate) || '—'}</td>
    <td class="c nw">${esc(bgState(b).label)}</td></tr>`).join('');
  printPage(page('Bank Guarantee List', '', `
${header(co, logo, 'BANK GUARANTEE LIST', [['Showing', esc(filter || 'All')], ['BGs', rows.length], ['Printed', esc(nowText())]])}
<table class="lst"><thead><tr><th style="width:24px">Sr</th><th>BG No.</th><th>Client / Order</th><th>Issuing Bank (ours)</th><th>Beneficiary Bank</th><th>Amount (₹)</th><th>Issue Date</th><th>Expiry</th><th>Claim Expiry</th><th>Status</th></tr></thead>
<tbody>${body || '<tr><td colspan="10" class="c">No bank guarantees.</td></tr>'}
<tr class="tot"><td colspan="5" class="r">TOTAL — ${rows.length} BG${rows.length === 1 ? '' : 's'} &nbsp;·&nbsp; still live ${live.length} (₹ ${inr(liveAmt)})</td><td class="r">₹ ${inr(tot)}</td><td colspan="4"></td></tr></tbody></table>
<div class="foot"><span>${brandLine(user)}</span><span>Expiring = ends within 30 days</span></div>
${legalNoteHtml()}`, true), 'bg-list-frame');
}

/* ───────── Bank Guarantee cover page (one BG, A4 portrait — goes on top of the BG file) ───────── */
export async function printBgCover({ bg: b, order, company, user }) {
  const co = company || {}, logo = await logoOf(co);
  const amtV = Number(b.bgAmount || b.amount) || 0;
  const ov = order ? (Number(order.subTotal) || 0) : 0;
  const pct = ov && amtV ? ` (${(amtV * 100 / ov).toFixed(2).replace(/\.00$/, '')}% of order value ₹ ${inr(ov)})` : '';
  const exp = b.expiryDate || b.endDate, dl = daysTo(exp);
  const st = bgState(b);
  const row = (k, v) => `<tr><th>${k}</th><td>${v || '—'}</td></tr>`;
  const css = `
.big { margin-top:10px; border:1.2pt solid #000; text-align:center; padding:10px 8px; }
.big .l { font-size:9pt; letter-spacing:1px; text-transform:uppercase; }
.big .no { font-size:20pt; font-weight:bold; letter-spacing:.5px; margin:2px 0; }
.big .amt { font-size:15pt; font-weight:bold; } .big .w { font-size:8.6pt; margin-top:2px; }
.chk td { border:0.6pt solid #000; padding:6px 8px; } .chk .bx { width:22px; text-align:center; font-size:11pt; }
.sig { display:flex; gap:10px; margin-top:16px; } .sig div { flex:1; border:0.6pt solid #000; height:62px; padding:4px 8px; font-size:8pt; display:flex; align-items:flex-end; justify-content:center; }`;
  printPage(page(`BG ${b.bgNo || ''}`, css, `
${header(co, logo, 'BANK GUARANTEE', [['File', 'Cover page'], ['Status', esc(st.label)], ['Printed', esc(nowText())]])}
<div class="big"><div class="l">Bank Guarantee No.</div><div class="no">${esc(b.bgNo || '—')}</div>
  <div class="amt">₹ ${inr(amtV)}</div><div class="w">${esc(inWords(amtV))}${esc(pct)}</div></div>
<div class="sec">In favour of (client)</div>
<table class="kv"><tbody>
  ${row('Client', `<b>${esc(b.customerName)}</b>`)}
  ${row('Sales Order', b.orderNo ? `${esc(b.orderNo)}${b.orderDate ? ' · ' + dmy(b.orderDate) : ''}` : '')}
  ${row('Client PO', b.customerPO ? `${esc(b.customerPO)}${b.poDate ? ' · ' + dmy(b.poDate) : ''}` : '')}
  ${row('Beneficiary bank', [esc(b.issuedToBankName), b.issuedToBankIfsc && 'IFSC ' + esc(b.issuedToBankIfsc)].filter(Boolean).join(' · '))}
</tbody></table>
<div class="sec">Issued by (our bank)</div>
<table class="kv"><tbody>
  ${row('Bank', `<b>${esc(b.issuingBankName)}</b>`)}
  ${row('Account No.', esc(b.issuingBankAccNo))}
  ${row('IFSC', esc(b.issuingBankIfsc))}
  ${row('Bank contact (PBG)', esc(b.pbgContactNo))}
</tbody></table>
<div class="sec">Validity</div>
<table class="kv"><tbody>
  ${row('Issue date', longDate(b.startDate))}
  ${row('Expiry date', `<b>${longDate(exp)}</b>${dl != null ? ` &nbsp;(${dl < 0 ? `expired ${-dl} days ago` : `${dl} days left`})` : ''}`)}
  ${row('Claim expiry date', longDate(b.claimExpiryDate))}
  ${b.status === 'released' ? row('Released on', longDate(b.releasedAt)) : ''}
  ${row('Remarks', nl(b.remarks))}
</tbody></table>
<div class="sec">File checklist</div>
<table class="chk"><tbody>
  <tr><td class="bx">☐</td><td>Original BG received from the bank</td><td class="bx">☐</td><td>Copy given to the client</td></tr>
  <tr><td class="bx">☐</td><td>Margin money / FD with the bank recorded</td><td class="bx">☐</td><td>Extension asked before expiry</td></tr>
  <tr><td class="bx">☐</td><td>Release letter from the client received</td><td class="bx">☐</td><td>BG returned to the bank &amp; margin released</td></tr>
</tbody></table>
<div class="sig"><div>Prepared by</div><div>Checked by (Accounts)</div><div>Authorised signatory</div></div>
<div class="foot"><span>${brandLine(user)}</span><span>Record ${esc(b.depositId || '')}</span></div>
${legalNoteHtml()}`), 'bg-cover-frame');
}

/* ───────── Warranty Certificate (one, A4 portrait) ───────── */
export async function printWarranty({ cert: c, company, user }) {
  const co = company || {}, logo = await logoOf(co);
  const period = c.months ? (c.months % 12 === 0 ? `${c.months / 12} Year${c.months / 12 === 1 ? '' : 's'}` : `${c.months} Month${c.months === 1 ? '' : 's'}`) : '';
  const css = `
.cert { border:1.6pt double #000; padding:10px 14px 12px; margin-top:8px; }
.cert h2 { text-align:center; font-size:19pt; letter-spacing:3px; margin:4px 0 2px; font-family:Georgia, 'Times New Roman', serif; }
.cert .sub { text-align:center; font-size:8.6pt; letter-spacing:1px; text-transform:uppercase; margin-bottom:8px; }
.cert p.lead { font-size:9.6pt; line-height:1.55; margin:6px 0 8px; text-align:justify; }
.per { display:flex; border:0.8pt solid #000; margin:8px 0; } .per div { flex:1; text-align:center; padding:6px 4px; border-left:0.6pt solid #000; }
.per div:first-child { border-left:0; } .per .l { font-size:7.6pt; text-transform:uppercase; letter-spacing:.4px; } .per b { font-size:11pt; }
.terms { border:0.6pt solid #000; border-top:0; padding:6px 8px; font-size:8.4pt; line-height:1.5; }
.sig { display:flex; justify-content:space-between; align-items:flex-end; margin-top:22px; font-size:8.6pt; }
.sig .b { text-align:center; min-width:220px; border-top:0.6pt solid #000; padding-top:3px; }`;
  const items = (c.items || []).map((it, i) => `<tr><td class="c">${i + 1}</td><td><b>${esc(it.description)}</b></td><td class="r">${esc(it.qty)} ${esc(it.unit)}</td><td>${esc(it.serialNo) || '—'}</td></tr>`).join('');
  printPage(page(`Warranty ${c.certNo || ''}`, css, `
${header(co, logo, 'WARRANTY', [['Certificate No.', esc(c.certNo || '')], ['Date', dmy(c.certDate)], ['Order No.', esc(c.orderNo || '—')]])}
<div class="cert">
  <h2>WARRANTY CERTIFICATE</h2>
  <div class="sub">${esc(co.companyName || co.name)}</div>
  <p class="lead">This is to certify that the product(s) listed below, supplied by <b>${esc(co.companyName || co.name)}</b> to
    <b>${esc(c.clientName)}</b>${c.clientPO ? ` against your Purchase Order <b>${esc(c.clientPO)}</b>${c.clientPoDate ? ` dated ${dmy(c.clientPoDate)}` : ''}` : ''},
    are guaranteed against defects in material and workmanship for a period of <b>${esc(period || '—')}</b>,
    from <b>${longDate(c.startDate)}</b> to <b>${longDate(c.endDate)}</b>, on the terms given below.</p>
  <table class="kv"><tbody>
    <tr><th>Customer</th><td><b>${esc(c.clientName)}</b>${c.clientAddress ? `<div class="sm">${nl(c.clientAddress)}</div>` : ''}</td></tr>
    <tr><th>Sales Order</th><td>${esc(c.orderNo || '—')}${c.orderDate ? ' · ' + dmy(c.orderDate) : ''}</td></tr>
    ${c.invoiceNo ? `<tr><th>Tax Invoice</th><td>${esc(c.invoiceNo)}${c.invoiceDate ? ' · ' + dmy(c.invoiceDate) : ''}</td></tr>` : ''}
    ${c.dcNo ? `<tr><th>Delivery Challan</th><td>${esc(c.dcNo)}${c.dcDate ? ' · ' + dmy(c.dcDate) : ''}</td></tr>` : ''}
    ${c.installDate ? `<tr><th>Installed / handed over</th><td>${longDate(c.installDate)}</td></tr>` : ''}
  </tbody></table>
  <table class="lst"><thead><tr><th style="width:26px">Sr</th><th>Product</th><th style="width:80px">Qty</th><th style="width:30%">Serial / Identification No.</th></tr></thead><tbody>${items}</tbody></table>
  <div class="per"><div><div class="l">Warranty period</div><b>${esc(period || '—')}</b></div><div><div class="l">From</div><b>${dmy(c.startDate)}</b></div><div><div class="l">Valid up to</div><b>${dmy(c.endDate)}</b></div></div>
  ${c.coverage ? `<div class="sec">Warranty covers</div><div class="terms">${nl(c.coverage)}</div>` : ''}
  ${c.exclusions ? `<div class="sec">Not covered</div><div class="terms">${nl(c.exclusions)}</div>` : ''}
  ${c.remarks ? `<div class="sec">Remarks</div><div class="terms">${nl(c.remarks)}</div>` : ''}
  <div class="sig"><div>Place: ${esc(co.city || '')}<br>Date: ${dmy(c.certDate)}</div><div class="b">For <b>${esc(co.companyName || co.name)}</b><br><br><br>Authorised Signatory</div></div>
</div>
<div class="foot"><span>${brandLine(user)}</span><span>${esc(c.certNo || '')}</span></div>
${legalNoteHtml()}`), 'wc-print-frame');
}

/* ───────── Warranty Certificate list ───────── */
export async function printWarrantyList({ rows, company, user, filter }) {
  const co = company || {}, logo = await logoOf(co);
  const body = rows.map((c, i) => `<tr>
    <td class="c">${i + 1}</td><td class="nw"><b>${esc(c.certNo)}</b><div class="sm">${dmy(c.certDate)}</div></td>
    <td><b>${esc(c.clientName)}</b>${c.clientPO ? `<div class="sm">PO ${esc(c.clientPO)}</div>` : ''}</td>
    <td class="nw">${esc(c.orderNo || '—')}</td>
    <td>${(c.items || []).map(it => `${esc(it.description)} × ${esc(it.qty)}`).join('<br>')}</td>
    <td class="c nw">${c.months ? `${c.months} m` : '—'}</td><td class="c nw">${dmy(c.startDate)}</td><td class="c nw">${dmy(c.endDate)}</td><td class="c nw">${esc(wcState(c).label)}</td></tr>`).join('');
  printPage(page('Warranty Certificate List', '', `
${header(co, logo, 'WARRANTY CERTIFICATES', [['Showing', esc(filter || 'All')], ['Certificates', rows.length], ['Printed', esc(nowText())]])}
<table class="lst"><thead><tr><th style="width:24px">Sr</th><th>Cert No / Date</th><th>Client</th><th>Order No.</th><th>Products</th><th>Period</th><th>From</th><th>Valid up to</th><th>Status</th></tr></thead>
<tbody>${body || '<tr><td colspan="9" class="c">No certificates.</td></tr>'}</tbody></table>
<div class="foot"><span>${brandLine(user)}</span><span>Ending = within 30 days</span></div>
${legalNoteHtml()}`, true), 'wc-list-frame');
}
