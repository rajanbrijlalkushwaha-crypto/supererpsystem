/* Prints for Bank Guarantees and Warranty Certificates — same look as the other Beta documents
 * (Arial, thin black lines, grey heads, company letterhead). Each prints from a hidden frame. */
import axios from 'axios';
import { openPreview, previewPdf, logoData, partyMeta } from './printKit';
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
/* the BG's real end date: the extended date when the bank extended it, else the expiry date */
export const bgExpiry = b => { const e = b.expiryDate || b.endDate || ''; return b.extendedDate && b.extendedDate > e ? b.extendedDate : e; };
/* state of a bank guarantee: released / pending approval / expired / expiring (≤ 30 days) / active */
export const bgState = b => {
  if (b.status === 'released') return { k: 'released', label: 'Released' };
  if (b.status === 'claimed') return { k: 'claimed', label: 'Claimed' };
  if (b.status === 'pending') return { k: 'pending', label: 'Pending approval' };
  const dl = daysTo(bgExpiry(b));
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

const logoOf = logoData;

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

function printPage(html) {
  const t = (html.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || 'Print';
  openPreview(t.replace(/&amp;/g, '&'), { html });
}
const page = (title, css, body, landscape, party) => `<!DOCTYPE html><html><head><meta charset="utf-8">${partyMeta(party)}<title>${esc(title)}</title><style>${BASE_CSS}${css || ''}
@media screen { html { background:#E4E7EC; } body { width:${landscape ? '297mm' : '210mm'}; min-height:${landscape ? '210mm' : '297mm'}; margin:14px auto; padding:8mm; background:#fff; box-shadow:0 2px 10px rgba(0,0,0,.25); }
  .pb { margin:8mm -8mm; border-top:10px solid #E4E7EC; padding-top:8mm; } }
.pb { break-before:page; page-break-before:always; }
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
    <td class="c">${i + 1}</td><td class="nw">${esc(String(b.orderNo || '').trim() || '—')}</td><td><b>${esc(b.customerName || '—')}</b></td>
    <td class="c nw">${dmy(b.poDate) || '—'}</td><td>${esc(b.customerPO || '—')}</td>
    <td class="c nw">${dmy(b.startDate) || '—'}</td><td class="nw"><b>${esc(b.bgNo || '—')}</b><div class="sm">₹ ${inr(b.bgAmount || b.amount)}</div></td>
    <td class="c nw">${dmy(b.expiryDate || b.endDate) || '—'}</td><td class="c nw">${dmy(b.claimExpiryDate) || '—'}</td><td class="c nw">${b.extendedDate ? `<b>${dmy(b.extendedDate)}</b>` : '—'}</td>
    <td>${esc(b.issuingBankName || '—')}</td><td>${esc(b.issuedToBankName || '—')}</td><td class="nw">${esc(b.issuedToBankIfsc || '—')}</td>
    <td class="c nw">${esc(bgState(b).label)}</td></tr>`).join('');
  printPage(page('Bank Guarantee List', '.lst td, .lst th { font-size:7.4pt; }', `
${header(co, logo, 'BANK GUARANTEE LIST', [['Showing', esc(filter || 'All')], ['BGs', rows.length], ['Printed', esc(nowText())]])}
<table class="lst"><thead><tr><th style="width:22px">Sr</th><th>Order ID</th><th>Client Name</th><th>PO Date</th><th>PO No.</th><th>BG Date</th><th>BG No. / Amount</th><th>Expiry Date</th><th>Claim Exp.</th><th>Extended</th><th>Issuing Bank</th><th>Beneficiary Bank</th><th>IFSC Code</th><th>Status</th></tr></thead>
<tbody>${body || '<tr><td colspan="14" class="c">No bank guarantees.</td></tr>'}
<tr class="tot"><td colspan="14">TOTAL — ${rows.length} BG${rows.length === 1 ? '' : 's'} &nbsp;·&nbsp; amount ₹ ${inr(tot)} &nbsp;·&nbsp; still live ${live.length} (₹ ${inr(liveAmt)})</td></tr></tbody></table>
<div class="foot"><span>${brandLine(user)}</span><span>Expiring = ends within 30 days (extended date counts as the expiry)</span></div>
${legalNoteHtml()}`, true), 'bg-list-frame');
}

/* ───────── FD / Security Deposit / EMD list (same look as the BG list) ───────── */
export async function printDepList({ title, heads, rows, total, filter, company, user }) {
  const co = company || {}, logo = await logoOf(co);
  const body = rows.map((r, i) => `<tr><td class="c">${i + 1}</td>${r.map(v => `<td>${esc(v || '—')}</td>`).join('')}</tr>`).join('');
  printPage(page(title, '.lst td, .lst th { font-size:7.6pt; }', `
${header(co, logo, esc(title), [['Showing', esc(filter || 'All')], ['Records', rows.length], ['Printed', esc(nowText())]])}
<table class="lst"><thead><tr><th style="width:22px">Sr</th>${heads.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead>
<tbody>${body || `<tr><td colspan="${heads.length + 1}" class="c">Nothing to show.</td></tr>`}
<tr class="tot"><td colspan="${heads.length + 1}">TOTAL — ${rows.length} record${rows.length === 1 ? '' : 's'} &nbsp;·&nbsp; amount ₹ ${inr(total)}</td></tr></tbody></table>
<div class="foot"><span>${brandLine(user)}</span><span></span></div>
${legalNoteHtml()}`, true), 'dep-list-frame');
}

/* ───────── PO → Order Pending: each order, its products, and how each is covered (vendor POs / our factory) ─────────
   orders: [{ no, date, client, items: [{ name, addon, qty, unit, due, status, lines: [{ vendor, poNo, poDate, qty, rate, taxable, gst, total } | { factory, jobs, note, qty }] }] }] */
export async function printOrderPending({ orders, company, user, filter, stats = [] }) {
  const co = company || {}, logo = await logoOf(co);
  const NC = 14;
  let grand = 0;
  const body = orders.map((o, oi) => {
    const span = o.items.reduce((t, x) => t + Math.max(1, x.lines.length), 0) || 1;
    let first = true;
    return (o.items.length ? o.items : [null]).map(x => {
      if (!x) { first = false; return `<tr class="og"><td class="c">${oi + 1}</td><td><b>${esc(o.no)}</b><div class="sm">${esc(o.date)}</div></td><td>${esc(o.client)}</td><td colspan="${NC - 3}" class="sm">No products</td></tr>`; }
      const sub = x.lines.length ? x.lines : [null];
      return sub.map((l, li) => {
        const head = first; first = false;
        if (l && !l.factory) grand += Number(l.total) || 0;
        const cells = !l ? '<td class="bl"></td>'.repeat(8)
          : l.factory ? `<td class="fac"><b>Our factory</b><div class="sm">made in-house</div></td><td class="fac" colspan="2"><b>${esc(l.jobs)}</b><div class="sm">${esc(l.note)}</div></td><td class="c fac">${esc(l.qty)}</td><td class="fac sm" colspan="4">Not bought — no PO needed</td>`
            : `<td>${esc(l.vendor)}${l.code ? `<div class="sm">Code ${esc(l.code)}</div>` : ''}</td><td class="nw"><b>${esc(l.poNo)}</b></td><td class="nw">${esc(l.poDate)}</td><td class="c">${esc(l.qty)}</td><td class="r">${inr(l.rate)}</td><td class="r">${inr(l.taxable)}</td><td class="r">${inr(l.gst)}</td><td class="r"><b>${inr(l.total)}</b></td>`;
        return `<tr${head ? ' class="og"' : ''}>${head ? `<td rowspan="${span}" class="c">${oi + 1}</td><td rowspan="${span}" class="nw"><b>${esc(o.no)}</b><div class="sm">${esc(o.date)}</div></td><td rowspan="${span}">${esc(o.client)}</td>` : ''}${li === 0
          ? `<td rowspan="${sub.length}">${esc(x.name)}${x.addon ? ' <span class="ao">ADD-ON</span>' : ''}</td><td rowspan="${sub.length}" class="c nw">${esc(x.qty)} ${esc(x.unit)}</td><td rowspan="${sub.length}" class="c nw st${x.due > 0 ? ' due' : ''}">${esc(x.status)}</td>` : ''}${cells}</tr>`;
      }).join('');
    }).join('');
  }).join('');
  const css = `
.lst { width:calc(100% - 1px); } .lst td { font-size:7.6pt; } .lst th { font-size:7.2pt; white-space:normal; }
.lst tr.og > td { border-top:1.3pt solid #000; }
.lst td.st { font-weight:bold; } .lst td.st.due { text-decoration:underline; }
.lst td.bl { background:none; } .lst td.fac { font-style:italic; }
.ao { font-size:6.4pt; font-weight:bold; border:0.6pt solid #000; padding:0 2px; vertical-align:1px; }
.sum { display:flex; margin-top:6px; border:0.6pt solid #000; } .sum div { flex:1; padding:4px 8px; border-left:0.6pt solid #000; font-size:8pt; }
.sum div:first-child { border-left:0; } .sum b { display:block; font-size:11pt; }`;
  printPage(page('Order Pending', css, `
${header(co, logo, 'ORDER PENDING', [['Showing', esc(filter || 'All orders')], ['Orders', orders.length], ['Printed', esc(nowText())]])}
${stats.length ? `<div class="sum">${stats.map(([k, v]) => `<div>${esc(k)}<b>${esc(v)}</b></div>`).join('')}</div>` : ''}
<table class="lst"><colgroup><col style="width:22px"><col style="width:8.5%"><col style="width:10%"><col><col style="width:5%"><col style="width:6%"><col style="width:9%"><col style="width:8%"><col style="width:5.6%"><col style="width:3.4%"><col style="width:6%"><col style="width:6.6%"><col style="width:5.6%"><col style="width:6.6%"></colgroup>
<thead><tr><th>Sr</th><th>Order No. / Date</th><th>Client</th><th>Product</th><th>SO Qty</th><th>Status</th><th>Vendor</th><th>PO No.</th><th>PO Date</th><th>Qty</th><th>Rate ₹</th><th>Taxable ₹</th><th>GST ₹</th><th>PO Value ₹</th></tr></thead>
<tbody>${body || `<tr><td colspan="${NC}" class="c">Nothing to show.</td></tr>`}
<tr class="tot"><td colspan="${NC - 1}" class="r">TOTAL PO VALUE (orders shown)</td><td class="r">${inr(grand)}</td></tr></tbody></table>
<div class="foot"><span>${brandLine(user)}</span><span></span></div>`, true), 'order-pending');
}

/* ───────── Dues — clients (Sales → Dues) and vendors (Purchase → Dues): the same layout as the other lists ─────────
   kind: 'client' | 'vendor'; rows: [{ no, date, party, ref, refSub, extra, items: [{ name, qty, rate, taxable }], other, gst, value, paid, dues, status }] */
export async function printDuesReport({ kind, rows, company, user, filter, stats = [] }) {
  const co = company || {}, logo = await logoOf(co);
  const V = kind === 'vendor';
  const H = V ? ['Sr', 'PO No. / Date', 'Vendor', 'Against Order', 'Product', 'Qty', 'Rate ₹', 'Taxable ₹', 'Other ₹', 'GST ₹', 'PO Value ₹', 'Paid ₹', 'Dues ₹', 'Status']
    : ['Sr', 'Order No. / Date', 'Client', 'Client PO', 'Product', 'Qty', 'Rate ₹', 'Taxable ₹', 'Other ₹', 'GST ₹', 'Order Value ₹', 'Received ₹', 'Dues ₹', 'Status'];
  const t = { taxable: 0, other: 0, gst: 0, value: 0, paid: 0, dues: 0 };
  const body = rows.map((r, i) => {
    const lines = r.items.length ? r.items : [null]; const span = lines.length;
    lines.forEach(it => { if (it) t.taxable += Number(it.taxable) || 0; });
    ['other', 'gst', 'value', 'paid', 'dues'].forEach(k => { t[k] += Number(r[k]) || 0; });
    return lines.map((it, j) => `<tr${j === 0 ? ' class="og"' : ''}>${j === 0 ? `<td rowspan="${span}" class="c">${i + 1}</td><td rowspan="${span}" class="nw"><b>${esc(r.no)}</b><div class="sm">${esc(r.date)}</div></td>
<td rowspan="${span}"><b>${esc(r.party)}</b>${r.code ? `<div class="sm">Code ${esc(r.code)}</div>` : ''}</td><td rowspan="${span}">${esc(r.ref || '—')}${r.refSub ? `<div class="sm">${esc(r.refSub)}</div>` : ''}</td>` : ''}${it
      ? `<td>${esc(it.name)}</td><td class="c nw">${esc(it.qty)}</td><td class="r">${inr(it.rate)}</td><td class="r">${inr(it.taxable)}</td>` : '<td colspan="4" class="c sm">—</td>'}${j === 0
      ? `<td rowspan="${span}" class="r">${r.other ? inr(r.other) : '—'}</td><td rowspan="${span}" class="r">${inr(r.gst)}</td><td rowspan="${span}" class="r"><b>${inr(r.value)}</b></td>
<td rowspan="${span}" class="r">${inr(r.paid)}</td><td rowspan="${span}" class="r${r.dues > 0.5 ? ' due' : ''}"><b>${inr(r.dues)}</b></td><td rowspan="${span}" class="c st">${esc(r.status)}</td>` : ''}</tr>`).join('');
  }).join('');
  const css = `
.lst { width:calc(100% - 1px); } .lst td { font-size:7.6pt; } .lst th { font-size:7.2pt; white-space:normal; }
.lst tr.og > td { border-top:1.3pt solid #000; } .lst td.due { text-decoration:underline; } .lst td.st { font-weight:bold; font-size:7.2pt; }
.sum { display:flex; margin-top:6px; border:0.6pt solid #000; } .sum div { flex:1; padding:4px 8px; border-left:0.6pt solid #000; font-size:8pt; }
.sum div:first-child { border-left:0; } .sum b { display:block; font-size:11pt; }`;
  const title = V ? 'VENDOR DUES' : 'CLIENT DUES';
  printPage(page(V ? 'Vendor Dues' : 'Client Dues', css, `
${header(co, logo, title, [['Showing', esc(filter || 'All')], [V ? 'POs' : 'Orders', rows.length], ['Printed', esc(nowText())]])}
${stats.length ? `<div class="sum">${stats.map(([k, v]) => `<div>${esc(k)}<b>${esc(v)}</b></div>`).join('')}</div>` : ''}
<table class="lst"><colgroup><col style="width:22px"><col style="width:9%"><col style="width:12%"><col style="width:9%"><col><col style="width:4.4%"><col style="width:6%"><col style="width:6.6%"><col style="width:5.4%"><col style="width:6%"><col style="width:7%"><col style="width:6.6%"><col style="width:6.6%"><col style="width:5.4%"></colgroup>
<thead><tr>${H.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead>
<tbody>${body || `<tr><td colspan="${H.length}" class="c">Nothing to show.</td></tr>`}
<tr class="tot"><td colspan="7" class="r">TOTAL (${rows.length} ${V ? 'POs' : 'orders'})</td><td class="r">${inr(t.taxable)}</td><td class="r">${inr(t.other)}</td><td class="r">${inr(t.gst)}</td><td class="r">${inr(t.value)}</td><td class="r">${inr(t.paid)}</td><td class="r">${inr(t.dues)}</td><td></td></tr></tbody></table>
<div class="foot"><span>${brandLine(user)}</span><span></span></div>`, true));
}

/* BG types — the name used in the letters, and what the BG is "towards" */
export const BG_TYPES = [
  ['performance', 'Performance Bank Guarantee', 'towards the due performance of the contract'],
  ['advance', 'Advance Payment Bank Guarantee', 'against the advance payment released to us'],
  ['security', 'Security Deposit Bank Guarantee', 'in lieu of the security deposit'],
  ['warranty', 'Warranty Bank Guarantee', 'towards our warranty obligations under the contract'],
  ['emd', 'Bid Security (EMD) Bank Guarantee', 'in lieu of the Earnest Money Deposit'],
];
export const bgTypeOf = b => BG_TYPES.find(t => t[0] === b?.bgType) || BG_TYPES[0];

/* ───────── BG letters: the same bordered format as the Sales Order / Delivery Challan ───────── */
/* the warranty and completion certificates: bordered, black and white (no grey fills) */
const CERT_CSS = `
.doc > table > thead > tr > th { border:1px solid #000; background:none; font-weight:bold; font-size:7.8pt; text-align:center; padding:4px 3px; }
.sec { background:none !important; }
.c { text-align:center !important; } tr.it td { border-top:0 !important; border-bottom:0 !important; } tr.end td { height:4mm; border-top:0 !important; }
.cert { font-size:9.6pt; line-height:1.55; }
.per td { text-align:center !important; padding:5px 4px !important; } .per b { font-size:10.5pt; }
.trm { font-size:8.4pt; line-height:1.5; } .trm > b { display:block; font-size:8.4pt; text-transform:uppercase; letter-spacing:.4px; margin-bottom:2px; }
.sg .pl { font-size:8.8pt; line-height:1.7; }
.foot { display:block !important; text-align:center; padding:4px 0 0; font-size:8.4pt; font-weight:bold; color:#000; }`;
const LETTER_CSS = `
body { font-size:8.8pt; line-height:1.4; }
.doc > table { margin-top:-1px; } .doc > table:first-child { margin-top:0; }
.doc > table > tbody > tr > td, .doc > table > tbody > tr > th { border:1px solid #000; padding:5px 7px; vertical-align:top; text-align:left; }
.ttl { text-align:center !important; font-size:13pt; font-weight:bold; letter-spacing:3px; padding:5px !important; }
.ttl small { display:block; margin-top:2px; font-size:7.6pt; font-weight:normal; letter-spacing:1.5px; }
.co { display:flex; gap:10px; align-items:center; } .co img { width:56px; height:56px; object-fit:contain; flex-shrink:0; }
.co .nm { font-size:13pt; font-weight:bold; }
.kv td { border:0 !important; padding:1px 4px 1px 0 !important; vertical-align:top; }
.kv td:first-child { width:96px; color:#333; white-space:nowrap; } .kv td:nth-child(2) { width:8px; }
.lbl { font-size:7.2pt; color:#333; text-transform:uppercase; letter-spacing:.4px; margin-bottom:2px; }
.pn { font-size:10pt; font-weight:bold; margin-bottom:1px; }
.sec { font-weight:bold; font-size:8.4pt; background:#F5F5F5; padding:3px 7px !important; }
.doc > table > tbody > tr > th { background:#F5F5F5; font-weight:bold; width:19%; white-space:nowrap; }
.txt p { margin:0 0 6px; text-align:justify; } .txt p:last-child { margin-bottom:0; }
.amt { font-size:10.5pt; font-weight:bold; } .w { font-style:italic; color:#333; font-size:8pt; }
.nb { white-space:nowrap; }
.sg { vertical-align:top !important; } .sg b { font-size:9pt; } .sg .sp { height:17mm; }
.sg .sl { font-size:8.4pt; font-weight:bold; }
.sg .tri { display:flex; justify-content:space-between; font-size:8.4pt; font-weight:bold; }
.ph { height:20mm; border:1px dashed #777; color:#777; display:flex; align-items:center; justify-content:center; font-size:8pt; letter-spacing:1px; }
.foot { text-align:center; padding:4px 0 0; font-size:8.4pt; font-weight:bold; }
.pby { display:flex; justify-content:space-between; font-size:7.6pt; font-weight:bold; margin-top:3px; }`;

async function bgFacts(b, order, company) {
  const co = company || {}, o = order || {}, logo = await logoOf(co);
  const [, typeName, towards] = bgTypeOf(b);
  const amtV = Number(b.bgAmount || b.amount) || 0, ov = Number(o.subTotal) || 0;
  const po = String(b.customerPO || o.customerPO || '').trim(), poDate = b.poDate || o.poDate;
  const orderNo = String(b.orderNo || o.orderNo || '').trim();
  const coName = esc(co.companyName || co.name);
  const coAddr = esc([co.address, co.city, [co.state, co.pincode].filter(Boolean).join(' - ')].filter(Boolean).join(', '));
  const client = esc(b.customerName || o.customerName || o.party);
  const addr = o.address ? nl(String(o.address).trim()) : esc([o.customerCity, o.customerState, o.customerPincode].filter(Boolean).join(', '));
  const attn = String(o.contactPerson || '').trim();
  const kv = (k, v) => (v ? `<tr><td>${k}</td><td>:</td><td><b>${v}</b></td></tr>` : '');
  return {
    coName, client, typeName, towards, amtV, ov, po, orderNo, exp: bgExpiry(b), kv,
    amt: `<span class="nb">₹ ${inr(amtV)}</span>`,
    pct: ov && amtV ? (amtV * 100 / ov).toFixed(2).replace(/\.00$/, '') : '',
    poText: po ? `${esc(po)}${poDate ? ` dt. ${dmy(poDate)}` : ''}` : '',
    company: `<div class="co">${logo ? `<img src="${logo}" alt="">` : ''}<div>
      <div class="nm">${coName}</div>${coAddr ? `<div>${coAddr}</div>` : ''}
      <div>${[co.gstin && `GSTIN: <b>${esc(co.gstin)}</b>`, co.pan && `PAN: ${esc(co.pan)}`].filter(Boolean).join(' &nbsp;|&nbsp; ')}</div>
      <div>${[co.phone && `Ph: ${esc(co.phone)}`, co.email && `Email: ${esc(co.email)}`].filter(Boolean).join(' &nbsp;|&nbsp; ')}</div></div></div>`,
    toClient: `<div class="lbl">To (Client)</div><div class="pn">${client}</div>${addr ? `<div>${addr}</div>` : ''}${attn ? `<div style="margin-top:3px">Kind Attn: <b>${esc(attn)}</b></div>` : ''}`,
    bank: `<div class="lbl">Issuing Bank</div><div class="pn">${esc(b.issuingBankName || '—')}</div>${b.issuingBankIfsc ? `<div>IFSC: <b>${esc(b.issuingBankIfsc)}</b></div>` : ''}${b.pbgContactNo ? `<div>Bank contact: ${esc(b.pbgContactNo)}</div>` : ''}`,
    foot: `<div class="foot">SUBJECT TO ${esc(String(co.jurisdiction || 'Ahmedabad').trim().toUpperCase())} JURISDICTION</div>`,
  };
}

/* BG details — rows of the bordered grid */
const bgTable = (b, f) => `<table><tbody>
  <tr><td colspan="4" class="sec">Bank Guarantee Details</td></tr>
  <tr><th>BG No.</th><td><b>${esc(b.bgNo || '')}</b></td><th>Type</th><td>${f.typeName}</td></tr>
  <tr><th>BG Amount</th><td colspan="3"><span class="amt">${f.amt}</span> &nbsp;<span class="w">(${esc(inWords(f.amtV))})</span></td></tr>
  <tr><th>Date of Issue</th><td>${dmy(b.startDate) || '—'}</td><th>Valid up to</th><td><b>${dmy(f.exp) || '—'}</b>${b.extendedDate ? ' (extended)' : ''}</td></tr>
  <tr><th>Claim Period up to</th><td>${dmy(b.claimExpiryDate) || '—'}</td><th>Order Value</th><td>${f.ov ? `₹ ${inr(f.ov)} (excl. GST)` : '—'}</td></tr>
  <tr><th>Issuing Bank</th><td>${esc(b.issuingBankName || '—')}${b.issuingBankIfsc ? ` (IFSC ${esc(b.issuingBankIfsc)})` : ''}</td><th>Beneficiary Bank</th><td>${esc(b.issuedToBankName || '—')}${b.issuedToBankIfsc ? ` (IFSC ${esc(b.issuedToBankIfsc)})` : ''}</td></tr>
</tbody></table>`;

const head = (f, b, title, sub, ref) => `<table><tbody><tr><td class="ttl">${title}<small>${sub}</small></td></tr></tbody></table>
<table><colgroup><col style="width:56%"><col></colgroup><tbody><tr>
  <td>${f.company}</td>
  <td><table class="kv">${f.kv('Ref. No.', esc(ref))}${f.kv('Date', dmy(new Date()))}${f.kv('Sales Order', esc(f.orderNo))}${f.kv('Client PO No.', f.poText)}${f.kv('BG No.', esc(b.bgNo || ''))}</table></td>
</tr></tbody></table>
<table><colgroup><col style="width:56%"><col></colgroup><tbody><tr><td>${f.toClient}</td><td>${f.bank}</td></tr></tbody></table>`;

/* ───────── Cover letter: submission of the BG to the client ───────── */
export async function printBgLetter({ bg: b, order, company, user }) {
  const f = await bgFacts(b, order, company);
  printPage(page(`BG ${b.bgNo || ''} - Cover Letter`, LETTER_CSS, `<div class="doc">
${head(f, b, 'BANK GUARANTEE — COVER LETTER', 'SUBMISSION OF BANK GUARANTEE', `${f.orderNo || b.depositId || ''}/BG`)}
<table><tbody><tr><td class="sec">Subject: Submission of ${f.typeName} No. ${esc(b.bgNo || '')}${f.po ? ` against PO / Contract No. ${esc(f.po)}` : ''}</td></tr>
<tr><td class="txt"><p>Dear Sir / Madam,</p>
<p>With reference to the above, we are pleased to submit herewith the original <b>${f.typeName}</b> for <b>${f.amt}</b>
  (${esc(inWords(f.amtV))})${f.pct ? `, being ${f.pct}% of the order value,` : ''} issued by <b>${esc(b.issuingBankName || '')}</b> in your favour
  ${f.towards}${f.po ? ` against your Purchase Order / Contract No. <b>${esc(f.po)}</b>` : ''}. The details are given below.</p></td></tr></tbody></table>
${bgTable(b, f)}
<table><tbody><tr><td class="txt" data-fill><p>Kindly acknowledge receipt of the above Bank Guarantee by signing below, and release / return the Bank Guarantee to us on completion of its validity period or of our obligations under the contract.</p>
<p>Thanking you,</p>
<p><b>Enclosure:</b> Original ${f.typeName} No. ${esc(b.bgNo || '')}${b.startDate ? ` dated ${dmy(b.startDate)}` : ''} for ${f.amt}.</p></td></tr></tbody></table>
<table><colgroup><col style="width:50%"><col></colgroup><tbody><tr>
  <td class="sg"><b>Received by, ${f.client}</b><div class="sp"></div><div class="sl">Receiver's Signature, Name &amp; Date</div></td>
  <td class="sg"><b style="display:block; text-align:right">For ${f.coName}</b><div class="sp"></div><div class="tri"><span>Prepared By</span><span>Verified By</span><span>Authorised Signatory</span></div></td>
</tr></tbody></table>
${f.foot}
</div>
<div class="pby"><span>${brandLine(user)}</span><span>${esc(nowText())}</span></div>`));
}

/* ───────── Release letter: page 1 asks the client to release the BG, page 2 is the release letter
   (to the issuing bank) for the client to issue on their letterhead ───────── */
export async function printBgRelease({ bg: b, order, company, user }) {
  const f = await bgFacts(b, order, company);
  const bgRef = `${f.typeName} No. <b>${esc(b.bgNo || '')}</b>${b.startDate ? ` dated ${dmy(b.startDate)}` : ''} for <b>${f.amt}</b> (${esc(inWords(f.amtV))})`;
  printPage(page(`BG ${b.bgNo || ''} - Release Letter`, LETTER_CSS, `<div class="doc">
${head(f, b, 'BANK GUARANTEE — RELEASE REQUEST', 'REQUEST FOR RELEASE OF BANK GUARANTEE', `${f.orderNo || b.depositId || ''}/BG-REL`)}
<table><tbody><tr><td class="sec">Subject: Request for release of ${f.typeName} No. ${esc(b.bgNo || '')}${f.po ? ` against PO / Contract No. ${esc(f.po)}` : ''}</td></tr>
<tr><td class="txt"><p>Dear Sir / Madam,</p>
<p>We had submitted the ${bgRef} issued by <b>${esc(b.issuingBankName || '')}</b> in your favour ${f.towards}${f.po ? ` against your Purchase Order / Contract No. <b>${esc(f.po)}</b>` : ''}. The details are given below.</p></td></tr></tbody></table>
${bgTable(b, f)}
<table><tbody><tr><td class="txt" data-fill><p>We have fulfilled our obligations under the above order. We therefore request you to kindly <b>release the above Bank Guarantee</b>
  by issuing a release / discharge letter to the issuing bank, and to return the <b>original Bank Guarantee</b> to us.</p>
<p>A draft of the release letter is attached for your convenience. You may issue it on your letterhead, duly signed and stamped.</p>
<p>Thanking you,</p>
<p><b>Enclosure:</b> Draft release letter addressed to ${esc(b.issuingBankName || 'the issuing bank')}.</p></td></tr></tbody></table>
<table><colgroup><col style="width:50%"><col></colgroup><tbody><tr>
  <td class="sg"><b>Received by, ${f.client}</b><div class="sp"></div><div class="sl">Receiver's Signature, Name &amp; Date</div></td>
  <td class="sg"><b style="display:block; text-align:right">For ${f.coName}</b><div class="sp"></div><div class="tri"><span>Prepared By</span><span>Verified By</span><span>Authorised Signatory</span></div></td>
</tr></tbody></table>
${f.foot}
</div>
<div class="pby"><span>${brandLine(user)}</span><span>${esc(nowText())}</span></div>
<div class="pb"></div>
<div class="doc">
<table><tbody><tr><td class="ttl">RELEASE LETTER (DRAFT)<small>TO BE ISSUED ON THE LETTERHEAD OF ${f.client.toUpperCase()}</small></td></tr></tbody></table>
<table><colgroup><col style="width:56%"><col></colgroup><tbody><tr>
  <td><div class="ph">CLIENT LETTERHEAD</div></td>
  <td><table class="kv">${f.kv('Ref. No.', '____________________')}${f.kv('Date', '____________________')}</table></td>
</tr><tr><td colspan="2"><div class="lbl">To</div><div class="pn">The Branch Manager</div><div>${esc(b.issuingBankName || '____________________')}${b.issuingBankIfsc ? ` &nbsp;|&nbsp; IFSC: <b>${esc(b.issuingBankIfsc)}</b>` : ''}</div><div>Branch address: ________________________________________</div></td></tr></tbody></table>
<table><tbody><tr><td class="sec">Subject: Release / discharge of ${f.typeName} No. ${esc(b.bgNo || '')}</td></tr>
<tr><td class="txt" data-fill><p>Dear Sir,</p>
<p>This is to inform you that we hereby <b>release and discharge</b> the ${bgRef}, issued by your bank on behalf of <b>${f.coName}</b>
  in our favour${f.po ? ` against our Purchase Order / Contract No. <b>${esc(f.po)}</b>` : ''}, valid up to <b>${dmy(f.exp) || '__________'}</b>.</p>
<p>${f.coName} has fulfilled its obligations under the said order. We have no claim of any nature under the above Bank Guarantee, and the bank is released
  from all its liabilities under it. You may cancel the Bank Guarantee and release the margin / security held against it to ${f.coName}.</p>
<p>The original Bank Guarantee is returned herewith / has been returned to ${f.coName}.</p>
<p>Copy to: <b>${f.coName}</b> — for information.</p></td></tr></tbody></table>
<table><tbody><tr>
  <td class="sg"><b>For ${f.client}</b><div class="sp"></div><div class="tri"><span>Name</span><span>Designation</span><span>Signature &amp; Seal</span><span>Date</span></div></td>
</tr></tbody></table>
</div>`));
}

/* ───────── BG soft copy: the scanned BG uploaded on the record, in the same preview ───────── */
export async function openBgSoftCopy(b, companyId) {
  const f = (b.pdfFiles || [])[(b.pdfFiles || []).length - 1];
  if (!f) return false;
  const r = await axios.get(`/api/deposits/${b.depositId}/docs/${encodeURIComponent(f.file)}`, { params: { companyId }, responseType: 'blob' });
  const isPdf = /\.pdf$/i.test(f.name || f.file);
  const blob = new Blob([r.data], { type: isPdf ? 'application/pdf' : (r.data.type || 'application/octet-stream') });
  openPreview(`BG ${b.bgNo || ''} - Soft Copy`, { pdfUrl: URL.createObjectURL(blob), fileName: f.name || f.file });
  return true;
}

/* ───────── Warranty Certificate (one, A4 portrait) ───────── */
/* the place printed under the signature: the company's district (from its pincode, India Post), else its jurisdiction / city */
const districts = {};
export async function placeOf(co) {
  const pin = String(co?.pincode || '').replace(/\D/g, '');
  if (/^\d{6}$/.test(pin)) {
    if (!(pin in districts)) districts[pin] = await axios.get(`/api/companies/district/${pin}`).then(r => r.data?.district || '').catch(() => '');
    if (districts[pin]) return districts[pin];
  }
  return String(co?.jurisdiction || co?.city || '').trim();
}

export async function printWarranty({ cert: c, company, user }) {
  const co = company || {}, logo = await logoOf(co), place = await placeOf(co);
  const period = c.months ? (c.months % 12 === 0 ? `${c.months / 12} Year${c.months / 12 === 1 ? '' : 's'}` : `${c.months} Month${c.months === 1 ? '' : 's'}`) : '';
  const coName = esc(co.companyName || co.name);
  const coAddr = esc([co.address, co.city, [co.state, co.pincode].filter(Boolean).join(' - ')].filter(Boolean).join(', '));
  const kv = (k, v) => (v ? `<tr><td>${k}</td><td>:</td><td><b>${v}</b></td></tr>` : '');
  const items = (c.items || []).map((it, i) => `<tr class="it"><td class="c">${i + 1}</td><td><b>${esc(it.description)}</b></td><td class="c">${esc(it.qty)}</td><td class="c">${esc(it.unit)}</td><td>${esc(it.serialNo) || '—'}</td></tr>`).join('');
  const css = LETTER_CSS + CERT_CSS;
  printPage(page(`Warranty Certificate ${c.certNo || ''}`, css, `<div class="doc">
<table><tbody><tr><td class="ttl">WARRANTY CERTIFICATE<small>${esc(c.certNo || '')}</small></td></tr></tbody></table>
<table><colgroup><col style="width:56%"><col></colgroup><tbody><tr>
  <td><div class="co">${logo ? `<img src="${logo}" alt="">` : ''}<div>
    <div class="nm">${coName}</div>${coAddr ? `<div>${coAddr}</div>` : ''}
    <div>${[co.gstin && `GSTIN: <b>${esc(co.gstin)}</b>`, co.pan && `PAN: ${esc(co.pan)}`].filter(Boolean).join(' &nbsp;|&nbsp; ')}</div>
    <div>${[co.phone && `Ph: ${esc(co.phone)}`, co.email && `Email: ${esc(co.email)}`].filter(Boolean).join(' &nbsp;|&nbsp; ')}</div></div></div></td>
  <td><table class="kv">${kv('Certificate No.', esc(c.certNo))}${kv('Date', dmy(c.certDate))}${kv('Sales Order', esc(c.orderNo))}${kv('Client PO No.', esc(c.clientPO))}${kv('PO Date', dmy(c.clientPoDate))}</table></td>
</tr></tbody></table>
<table><colgroup><col style="width:56%"><col></colgroup><tbody><tr>
  <td><div class="lbl">Customer</div><div class="pn">${esc(c.clientName)}</div>${c.clientAddress ? `<div>${nl(c.clientAddress)}</div>` : ''}</td>
  <td><table class="kv">${kv('Tax Invoice', c.invoiceNo ? `${esc(c.invoiceNo)}${c.invoiceDate ? ` dt. ${dmy(c.invoiceDate)}` : ''}` : '')}${kv('Delivery Challan', c.dcNo ? `${esc(c.dcNo)}${c.dcDate ? ` dt. ${dmy(c.dcDate)}` : ''}` : '')}${kv('Installed on', dmy(c.installDate))}</table></td>
</tr></tbody></table>
<table><tbody><tr><td class="txt cert"><p>This is to certify that the product(s) listed below, supplied by <b>${coName}</b> to <b>${esc(c.clientName)}</b>${c.clientPO ? ` against Purchase Order <b>${esc(c.clientPO)}</b>${c.clientPoDate ? ` dated <b>${dmy(c.clientPoDate)}</b>` : ''}` : ''}, are guaranteed against defects in material and workmanship for a period of <b>${esc(period || '—')}</b>, from <b>${longDate(c.startDate)}</b> to <b>${longDate(c.endDate)}</b>, on the terms given below.</p></td></tr></tbody></table>
<table><colgroup><col style="width:30px"><col><col style="width:62px"><col style="width:58px"><col style="width:30%"></colgroup>
<thead><tr><th>Sl</th><th>Product</th><th>Qty</th><th>Unit</th><th>Serial / Identification No.</th></tr></thead>
<tbody>${items}<tr class="end" data-fill><td></td><td></td><td></td><td></td><td></td></tr></tbody></table>
<table class="per"><colgroup><col style="width:34%"><col style="width:33%"><col></colgroup><tbody><tr>
  <td><div class="lbl">Warranty period</div><b>${esc(period || '—')}</b></td><td><div class="lbl">From</div><b>${dmy(c.startDate)}</b></td><td><div class="lbl">Valid up to</div><b>${dmy(c.endDate)}</b></td>
</tr></tbody></table>
<table><tbody>
  ${c.coverage ? `<tr><td class="trm"><b>Warranty covers</b><div>${nl(c.coverage)}</div></td></tr>` : ''}
  ${c.exclusions ? `<tr><td class="trm"><b>Not covered</b><div>${nl(c.exclusions)}</div></td></tr>` : ''}
  ${c.remarks ? `<tr><td class="trm"><b>Remarks</b><div>${nl(c.remarks)}</div></td></tr>` : ''}
</tbody></table>
<table><colgroup><col style="width:50%"><col></colgroup><tbody><tr>
  <td class="sg"><div class="pl">Place: <b>${esc(place || '—')}</b><br>Date: <b>${dmy(c.certDate)}</b></div></td>
  <td class="sg"><b style="display:block; text-align:right">For ${coName}</b><div class="sp"></div><div class="tri"><span>Prepared By</span><span>Verified By</span><span>Authorised Signatory</span></div></td>
</tr></tbody></table>
<div class="foot">SUBJECT TO ${esc(String(co.jurisdiction || place || 'Ahmedabad').trim().toUpperCase())} JURISDICTION</div>
</div>
<div class="pby"><span>${brandLine(user)}</span><span>${esc(nowText())}</span></div>`, false, c.clientName));
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

/* ───────── Completion Certificate (one, A4 portrait) — bordered, like the Sales Order / Delivery Challan ───────── */
export const PERFORMANCE = ['Excellent', 'Very Good', 'Good', 'Satisfactory'];
export async function printCompletion({ cert: c, company, user }) {
  const co = company || {}, logo = await logoOf(co), place = await placeOf(co);
  const coName = esc(co.companyName || co.name);
  const coAddr = esc([co.address, co.city, [co.state, co.pincode].filter(Boolean).join(' - ')].filter(Boolean).join(', '));
  const kv = (k, v) => (v ? `<tr><td>${k}</td><td>:</td><td><b>${v}</b></td></tr>` : '');
  const po = c.clientPO ? `${esc(c.clientPO)}${c.clientPoDate ? ` dated ${dmy(c.clientPoDate)}` : ''}` : '';
  const items = (c.items || []).map((it, i) => `<tr class="it"><td class="c">${i + 1}</td><td><b>${esc(it.description)}</b></td><td class="c">${esc(it.qty)}</td><td class="c">${esc(it.unit)}</td></tr>`).join('');
  const css = LETTER_CSS + CERT_CSS;
  printPage(page(`Completion Certificate ${c.certNo || ''}`, css, `<div class="doc">
<table><tbody><tr><td class="ttl">COMPLETION CERTIFICATE<small>${esc(c.certNo || '')}</small></td></tr></tbody></table>
<table><colgroup><col style="width:56%"><col></colgroup><tbody><tr>
  <td><div class="co">${logo ? `<img src="${logo}" alt="">` : ''}<div>
    <div class="nm">${coName}</div>${coAddr ? `<div>${coAddr}</div>` : ''}
    <div>${[co.gstin && `GSTIN: <b>${esc(co.gstin)}</b>`, co.pan && `PAN: ${esc(co.pan)}`].filter(Boolean).join(' &nbsp;|&nbsp; ')}</div>
    <div>${[co.phone && `Ph: ${esc(co.phone)}`, co.email && `Email: ${esc(co.email)}`].filter(Boolean).join(' &nbsp;|&nbsp; ')}</div></div></div></td>
  <td><table class="kv">${kv('Certificate No.', esc(c.certNo))}${kv('Date', dmy(c.certDate))}${kv('Sales Order', esc(c.orderNo))}${kv('Client PO No.', esc(c.clientPO))}${kv('PO Date', dmy(c.clientPoDate))}</table></td>
</tr></tbody></table>
<table><colgroup><col style="width:56%"><col></colgroup><tbody><tr>
  <td><div class="lbl">Client</div><div class="pn">${esc(c.clientName)}</div>${c.clientAddress ? `<div>${nl(c.clientAddress)}</div>` : ''}</td>
  <td><table class="kv">${kv('Tax Invoice', c.invoiceNo ? `${esc(c.invoiceNo)}${c.invoiceDate ? ` dt. ${dmy(c.invoiceDate)}` : ''}` : '')}${kv('Delivery Challan', c.dcNo ? `${esc(c.dcNo)}${c.dcDate ? ` dt. ${dmy(c.dcDate)}` : ''}` : '')}${kv('Work started', dmy(c.startDate))}${kv('Completed on', dmy(c.completionDate))}${c.orderValue ? kv('Order value', `₹ ${inr(c.orderValue)}`) : ''}</table></td>
</tr></tbody></table>
<table><tbody><tr><td class="sec">Work / Supply: ${esc(c.workTitle)}</td></tr>
<tr><td class="txt cert"${items ? '' : ' data-fill'}><p>This is to certify that <b>${coName}</b> has completed the <b>${esc(c.workTitle)}</b> for <b>${esc(c.clientName)}</b>${po ? ` against Purchase Order / Contract No. <b>${po}</b>` : ''}${c.startDate ? `. The work was started on <b>${dmy(c.startDate)}</b> and` : '. The work was'} completed on <b>${dmy(c.completionDate)}</b>, as per the terms and conditions of the order.</p>
<p>The work / material has been inspected and found in order, and the performance of ${coName} has been found <b>${esc(c.performance || 'Satisfactory')}</b>.</p>
${c.workDetails ? `<p>${nl(c.workDetails)}</p>` : ''}</td></tr></tbody></table>
${items ? `<table><colgroup><col style="width:30px"><col><col style="width:80px"><col style="width:70px"></colgroup>
<thead><tr><th>Sl</th><th>Description of Work / Material</th><th>Qty</th><th>Unit</th></tr></thead>
<tbody>${items}<tr class="end" data-fill><td></td><td></td><td></td><td></td></tr></tbody></table>` : ''}
${c.remarks ? `<table><tbody><tr><td><b>Remarks:</b> ${nl(c.remarks)}</td></tr></tbody></table>` : ''}
<table><colgroup><col style="width:50%"><col></colgroup><tbody><tr>
  <td class="sg"><b>Certified by, For ${esc(c.clientName)}</b><div class="sp"></div><div class="tri"><span>Name &amp; Designation</span><span>Signature &amp; Seal</span><span>Date</span></div></td>
  <td class="sg"><div style="display:flex; justify-content:space-between"><div class="pl">Place: <b>${esc(place || '—')}</b><br>Date: <b>${dmy(c.certDate)}</b></div><b>For ${coName}</b></div><div class="sp" style="height:9mm"></div><div class="tri"><span>Prepared By</span><span>Verified By</span><span>Authorised Signatory</span></div></td>
</tr></tbody></table>
<div class="foot">SUBJECT TO ${esc(String(co.jurisdiction || place || 'Ahmedabad').trim().toUpperCase())} JURISDICTION</div>
</div>
<div class="pby"><span>${brandLine(user)}</span><span>${esc(nowText())}</span></div>`, false, c.clientName));
}

/* ───────── Completion Certificate list ───────── */
export async function printCompletionList({ rows, company, user, filter }) {
  const co = company || {}, logo = await logoOf(co);
  const body = rows.map((c, i) => `<tr>
    <td class="c">${i + 1}</td><td class="nw"><b>${esc(c.certNo)}</b><div class="sm">${dmy(c.certDate)}</div></td>
    <td><b>${esc(c.clientName)}</b>${c.clientPO ? `<div class="sm">PO ${esc(c.clientPO)}</div>` : ''}</td>
    <td class="nw">${esc(c.orderNo || '—')}</td><td>${esc(c.workTitle || '—')}</td>
    <td class="c nw">${dmy(c.startDate) || '—'}</td><td class="c nw">${dmy(c.completionDate) || '—'}</td>
    <td class="r">${c.orderValue ? inr(c.orderValue) : '—'}</td><td class="c nw">${esc(c.performance || '')}</td></tr>`).join('');
  printPage(page('Completion Certificate List', '', `
${header(co, logo, 'COMPLETION CERTIFICATES', [['Showing', esc(filter || 'All')], ['Certificates', rows.length], ['Printed', esc(nowText())]])}
<table class="lst"><thead><tr><th style="width:24px">Sr</th><th>Cert No / Date</th><th>Client</th><th>Order No.</th><th>Work / Supply</th><th>Started</th><th>Completed</th><th>Order Value (₹)</th><th>Performance</th></tr></thead>
<tbody>${body || '<tr><td colspan="9" class="c">No certificates.</td></tr>'}</tbody></table>
<div class="foot"><span>${brandLine(user)}</span><span></span></div>
${legalNoteHtml()}`, true), 'cc-list-frame');
}

/* ───────── Account voucher (Journal / Debit Note / Credit Note / Expense / Payment) — bordered, like the Delivery Challan ─────────
   title: 'JOURNAL VOUCHER' … · kv: [[label, value]] (right of the company) · party: { label, name, lines[] } · heads: [[text, width?, align?]]
   rows: [[cell, …]] (strings, escaped) · totals: [[label, value]] · words: amount in words · narration · signs: [left, right] */
/* the voucher + its attached files (bill copies, PDFs, photos) as ONE PDF: the voucher first, then each picture, then each PDF.
   files: [{ name, fileName }], getFile(file) → Blob. Other kinds (Word, Excel…) cannot be printed — their names come back. */
const blobTo = (b, how) => new Promise((ok, bad) => { const rd = new FileReader(); rd.onload = () => ok(how === 'b64' ? String(rd.result).split(',')[1] : rd.result); rd.onerror = bad; rd.readAsDataURL(b); });
async function printWithFiles(html, title, files, getFile) {
  const pdfs = [], pics = [], skipped = [];
  for (const a of files) {
    const nm = a.name || a.fileName || 'file';
    try {
      const b = await getFile(a);   // eslint-disable-line no-await-in-loop
      const fn = String(a.fileName || nm);
      if (b.type === 'application/pdf' || /\.pdf$/i.test(fn)) pdfs.push(await blobTo(b, 'b64'));   // eslint-disable-line no-await-in-loop
      else if (/^image\//.test(b.type) || /\.(png|jpe?g|gif|webp|bmp)$/i.test(fn)) {
        pics.push(page(nm, '.att { font:9pt Arial, sans-serif; margin:0 0 4mm; } .att + img { display:block; max-width:100%; max-height:268mm; margin:0 auto; object-fit:contain; }',
          `<div class="att"><b>Attachment:</b> ${esc(nm)}</div><img src="${await blobTo(b)}" alt="">`));   // eslint-disable-line no-await-in-loop
      } else skipped.push(nm);
    } catch { skipped.push(nm); }
  }
  if (!pdfs.length && !pics.length) { printPage(html); return skipped; }
  try {
    const r = await axios.post('/api/print-merge', { htmls: [html, ...pics], pdfs }, { responseType: 'blob' });
    previewPdf(r.data, title, `${title}.pdf`, { html });
  } catch { printPage(html); return files.map(f => f.name || f.fileName); }
  return skipped;
}

export async function printVoucher({ title, sub, kv = [], party, party2, heads = [], rows = [], totals = [], words, narration, company, user, signs, files, getFile, partyName }) {
  const co = company || {}, logo = await logoOf(co);
  const coName = esc(co.companyName || co.name);
  const coAddr = esc([co.address, co.city, [co.state, co.pincode].filter(Boolean).join(' - ')].filter(Boolean).join(', '));
  const kvh = kv.filter(([, v]) => v).map(([k, v]) => `<tr><td>${esc(k)}</td><td>:</td><td><b>${esc(v)}</b></td></tr>`).join('');
  const al = a => (a === 'r' ? 'r' : a === 'c' ? 'c' : '');
  const css = LETTER_CSS + `
.doc > table > thead > tr > th { border:1px solid #000; background:#F5F5F5; font-weight:bold; font-size:7.8pt; text-align:center; padding:4px 3px; }
.c { text-align:center !important; } .r { text-align:right !important; white-space:nowrap; } tr.it td { border-top:0 !important; border-bottom:0 !important; }
tr.end td { height:5mm; border-top:0 !important; } tr.tot td { font-weight:bold; background:#F2F2F2; }`;
  const [sl, sr] = signs || ['Received / Accepted by', `For ${co.companyName || co.name || ''}`];
  const pBox = x => `<div class="lbl">${esc(x.label || 'Party')}</div><div class="pn">${esc(x.name)}</div>${(x.lines || []).filter(Boolean).map(l => `<div>${esc(l)}</div>`).join('')}`;
  const docTitle = `${title} ${kv[0] ? kv[0][1] : ''}`;
  const html = page(docTitle, css, `<div class="doc">
<table><tbody><tr><td class="ttl">${esc(title)}${sub ? `<small>${esc(sub)}</small>` : ''}</td></tr></tbody></table>
<table><colgroup><col style="width:56%"><col></colgroup><tbody><tr>
  <td><div class="co">${logo ? `<img src="${logo}" alt="">` : ''}<div>
    <div class="nm">${coName}</div>${coAddr ? `<div>${coAddr}</div>` : ''}
    <div>${[co.gstin && `GSTIN: <b>${esc(co.gstin)}</b>`, co.pan && `PAN: ${esc(co.pan)}`].filter(Boolean).join(' &nbsp;|&nbsp; ')}</div>
    <div>${[co.phone && `Ph: ${esc(co.phone)}`, co.email && `Email: ${esc(co.email)}`].filter(Boolean).join(' &nbsp;|&nbsp; ')}</div></div></div></td>
  <td><table class="kv">${kvh}</table></td>
</tr></tbody></table>
${party && party.name && party2 && party2.name ? `<table><colgroup><col style="width:50%"><col></colgroup><tbody><tr><td>${pBox(party)}</td><td>${pBox(party2)}</td></tr></tbody></table>`
  : (party && party.name) || (party2 && party2.name) ? `<table><tbody><tr><td>${pBox(party && party.name ? party : party2)}</td></tr></tbody></table>` : ''}
${heads.length ? `<table><colgroup>${heads.map(h => `<col${h[1] ? ` style="width:${h[1]}"` : ''}>`).join('')}</colgroup>
<thead><tr>${heads.map(h => `<th>${esc(h[0])}</th>`).join('')}</tr></thead>
<tbody>${rows.map(r => `<tr class="it">${r.map((v, i) => `<td class="${al(heads[i] && heads[i][2])}">${esc(v)}</td>`).join('')}</tr>`).join('')}
<tr class="end" data-fill>${heads.map(() => '<td></td>').join('')}</tr>
${totals.map(([k, v]) => `<tr class="tot"><td colspan="${heads.length - 1}" class="r">${esc(k)}</td><td class="r">${esc(v)}</td></tr>`).join('')}</tbody></table>` : ''}
${words ? `<table><tbody><tr><td><b>Amount in words:</b> ${esc(words)}</td></tr></tbody></table>` : ''}
${narration ? `<table><tbody><tr><td><b>Narration:</b> ${nl(narration)}</td></tr></tbody></table>` : ''}
<table><colgroup><col style="width:50%"><col></colgroup><tbody><tr>
  <td class="sg"><b>${esc(sl)}</b><div class="sp"></div><div class="sl">Signature</div></td>
  <td class="sg"><b style="display:block; text-align:right">${esc(sr)}</b><div class="sp"></div><div class="tri"><span>Prepared By</span><span>Verified By</span><span>Authorised Signatory</span></div></td>
</tr></tbody></table>
<div class="foot">SUBJECT TO ${esc(String(co.jurisdiction || 'Ahmedabad').trim().toUpperCase())} JURISDICTION</div>
</div>
<div class="pby"><span>${brandLine(user)}</span><span>${esc(nowText())}</span></div>`, false, partyName);
  if (files && files.length && getFile) return printWithFiles(html, docTitle, files, getFile);
  printPage(html);
  return [];
}
export { inWords };

/* shared with the HR prints */
export { esc as escHtml, nl as nlHtml, inr as inrText, page as pageHtml, printPage as showPage, LETTER_CSS, logoOf, longDate, nowText, header as headerHtml };
