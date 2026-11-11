/* Jobcode prints — Job Cost Sheet / Project Closure Report (A4, bordered like the Sales Order / Delivery Challan, fills the page). */
import { brandLine } from '../../utils/printBranding';
import { escHtml as esc, nlHtml as nl, inrText as inr, pageHtml as page, showPage as printPage, LETTER_CSS, logoOf, nowText, dmy } from './BetaCertPrint';

const CSS = LETTER_CSS + `
.doc > table > thead > tr > th { border:1px solid #000; background:#F5F5F5; font-weight:bold; font-size:7.6pt; text-align:center; padding:4px 3px; }
.c { text-align:center !important; } .r { text-align:right !important; white-space:nowrap; } tr.it td { border-top:0 !important; border-bottom:0 !important; font-size:8pt; }
tr.tt td { background:#F5F5F5; font-weight:bold; }
.ok { font-weight:bold; } .no { font-weight:bold; text-decoration:underline; }`;
const q = v => { const n = Number(v) || 0; return Number.isInteger(n) ? String(n) : String(Math.round(n * 1000) / 1000); };
const pct = (a, b) => (b ? `${(a / b * 100).toFixed(1)}%` : '—');

/* j = a jobcode row built by BetaJobcode (so, pos, exps, totals, close checks); closure = print as the closure report */
export async function printJobCost({ job: j, company, user, closure }) {
  const co = company || {}, logo = await logoOf(co), so = j.so;
  const coAddr = esc([co.address, co.city, [co.state, co.pincode].filter(Boolean).join(' - ')].filter(Boolean).join(', '));
  const kv = (k, v) => (v ? `<tr><td>${esc(k)}</td><td>:</td><td><b>${esc(v)}</b></td></tr>` : '');
  const items = so.items || [];
  const soRows = items.map((it, i) => { const qt = Number(it.qty || it.quantity) || 0, rt = Number(it.rate) || 0;
    return `<tr class="it"><td class="c">${i + 1}</td><td><b>${esc(it.description || it.itemName || it.name || '')}</b>${it.additionalDesc ? `<div style="font-size:7.4pt">${esc(it.additionalDesc)}</div>` : ''}</td><td class="c">${q(qt)} ${esc(it.unit || it.uom || '')}</td><td class="r">${inr(rt)}</td><td class="c">${q(it.gst || it.gstPercent)}%</td><td class="r">${inr(qt * rt)}</td></tr>`; }).join('');
  const poRows = j.poList.map((p, i) => `<tr class="it"><td class="c">${i + 1}</td><td><b>${esc(p.vendor)}</b><div style="font-size:7.4pt">${esc(p.items)}</div></td><td class="c">${esc(p.no)}<div style="font-size:7.4pt">${dmy(p.date)}</div></td><td class="c">${esc(p.billNo || '—')}</td><td class="r">${inr(p.taxable)}</td><td class="r">${inr(p.total)}</td><td class="r">${inr(p.paid)}</td><td class="r">${inr(p.due)}</td></tr>`).join('');
  const exRows = j.expList.map((e, i) => `<tr class="it"><td class="c">${i + 1}</td><td class="c">${dmy(e.date)}</td><td><b>${esc(e.category || 'Expense')}</b><div style="font-size:7.4pt">${esc(e.desc)}</div></td><td>${esc(e.party || '—')}</td><td class="r">${inr(e.base)}</td><td class="r">${inr(e.total)}</td><td class="r">${inr(e.paid)}</td></tr>`).join('');
  const chk = (ok, yes, noTxt) => (ok ? `<span class="ok">✔ ${yes}</span>` : `<span class="no">✘ ${noTxt}</span>`);
  const title = closure ? 'PROJECT CLOSURE REPORT' : 'JOB COST SHEET';
  printPage(page(`${closure ? 'Closure' : 'Cost Sheet'} ${so.orderNo || so.orderId}`, CSS, `<div class="doc">
<table><tbody><tr><td class="ttl">${title}<small>${closure ? 'SALES, PURCHASE, EXPENSES AND DUES AT CLOSING' : 'SALES vs PURCHASE vs EXPENSES FOR THE JOBCODE'}</small></td></tr></tbody></table>
<table><colgroup><col style="width:56%"><col></colgroup><tbody><tr>
  <td><div class="co">${logo ? `<img src="${logo}" alt="">` : ''}<div><div class="nm">${esc(co.companyName || co.name)}</div>${coAddr ? `<div>${coAddr}</div>` : ''}
    <div>${[co.gstin && `GSTIN: <b>${esc(co.gstin)}</b>`, co.phone && `Ph: ${esc(co.phone)}`].filter(Boolean).join(' &nbsp;|&nbsp; ')}</div></div></div></td>
  <td><table class="kv">${kv('Jobcode', so.orderNo || String(so.orderId))}${kv('Order date', dmy(so.orderDate || so.date))}${kv('Client PO', so.customerPO)}${kv('PO date', dmy(so.poDate))}${kv('Status', so.status === 'closed' ? 'CLOSED' : String(so.status || '').toUpperCase())}${kv('Payment terms', so.paymentTerms)}</table></td>
</tr></tbody></table>
<table><colgroup><col style="width:56%"><col></colgroup><tbody><tr>
  <td><div class="lbl">Client</div><div class="pn">${esc(so.customerName || so.clientName || '—')}</div>${so.customerGstin ? `<div>GSTIN: <b>${esc(so.customerGstin)}</b></div>` : ''}${so.shipToCity || so.customerCity ? `<div>Site: ${esc([so.shipToCity || so.customerCity, so.shipToState || so.customerState].filter(Boolean).join(', '))}</div>` : ''}</td>
  <td><div class="lbl">Margin on this job</div><div class="pn">₹ ${inr(j.margin)} &nbsp;(${pct(j.margin, j.soTaxable)})</div><div>Sales ₹ ${inr(j.soTaxable)} − Purchase ₹ ${inr(j.poTaxable)} − Expenses ₹ ${inr(j.expBase)}</div><div style="font-size:7.4pt">before GST</div></td>
</tr></tbody></table>
<table><colgroup><col style="width:26px"><col><col style="width:70px"><col style="width:80px"><col style="width:44px"><col style="width:90px"></colgroup>
<thead><tr><th>Sl</th><th>Sales order items</th><th>Qty</th><th>Rate</th><th>GST</th><th>Amount</th></tr></thead>
<tbody>${soRows || '<tr><td colspan="6" class="c">No items</td></tr>'}
<tr class="tt"><td colspan="5" class="r">Taxable ₹ ${inr(j.soTaxable)} &nbsp;+ GST ₹ ${inr(j.soValue - j.soTaxable)} &nbsp;= Order value</td><td class="r">${inr(j.soValue)}</td></tr></tbody></table>
<table><colgroup><col style="width:26px"><col><col style="width:96px"><col style="width:70px"><col style="width:76px"><col style="width:76px"><col style="width:72px"><col style="width:72px"></colgroup>
<thead><tr><th>Sl</th><th>Purchase orders (vendor / items)</th><th>PO no. / date</th><th>Bill no.</th><th>Taxable</th><th>PO value</th><th>Paid</th><th>Due</th></tr></thead>
<tbody>${poRows || '<tr><td colspan="8" class="c">No purchase order linked</td></tr>'}
<tr class="tt"><td colspan="4" class="r">Total purchase</td><td class="r">${inr(j.poTaxable)}</td><td class="r">${inr(j.poValue)}</td><td class="r">${inr(j.poPaid)}</td><td class="r">${inr(j.poDue)}</td></tr></tbody></table>
<table><colgroup><col style="width:26px"><col style="width:66px"><col><col style="width:120px"><col style="width:76px"><col style="width:76px"><col style="width:72px"></colgroup>
<thead><tr><th>Sl</th><th>Date</th><th>Expenses (category / details)</th><th>Paid to</th><th>Amount</th><th>With GST</th><th>Paid</th></tr></thead>
<tbody>${exRows || '<tr><td colspan="7" class="c">No expense booked on this jobcode</td></tr>'}
<tr class="tt"><td colspan="4" class="r">Total expenses</td><td class="r">${inr(j.expBase)}</td><td class="r">${inr(j.expTotal)}</td><td class="r">${inr(j.expPaid)}</td></tr></tbody></table>
<table><colgroup><col style="width:50%"><col></colgroup>
<thead><tr><th>Collection from client</th><th>${closure ? 'Closing checks' : 'Profit summary (before GST)'}</th></tr></thead><tbody><tr>
  <td><table class="kv">${kv('Order value', `₹ ${inr(j.soValue)}`)}${kv('Billed (sales bills)', `₹ ${inr(j.billed)}`)}${kv('Received', `₹ ${inr(j.received)}`)}${kv('Client dues', `₹ ${inr(j.clientDue)}`)}${kv('Vendor dues', `₹ ${inr(j.poDue)}`)}${kv('Expenses unpaid', `₹ ${inr(Math.max(0, j.expTotal - j.expPaid))}`)}</table></td>
  <td>${closure
    ? `<div style="line-height:1.9">${chk(j.clientOk, 'Client paid in full', `Client dues ₹ ${inr(j.clientDue)}`)}<br>${chk(j.vendorOk, 'All vendors paid', `Vendor dues ₹ ${inr(j.poDue)}`)}<br>${chk(j.expOk, 'All expenses paid', `${j.unpaidExp} expense(s) unpaid`)}<br><b>${so.status === 'closed' ? 'Project CLOSED' : j.canClose ? 'Ready to close' : 'Not ready to close'}</b></div>`
    : `<table class="kv">${kv('Sales (taxable)', `₹ ${inr(j.soTaxable)}`)}${kv('Purchase (taxable)', `₹ ${inr(j.poTaxable)} · ${pct(j.poTaxable, j.soTaxable)}`)}${kv('Expenses', `₹ ${inr(j.expBase)} · ${pct(j.expBase, j.soTaxable)}`)}${kv('Margin', `₹ ${inr(j.margin)} · ${pct(j.margin, j.soTaxable)}`)}</table>`}</td>
</tr></tbody></table>
<table><tbody><tr><td class="sec">Remarks</td></tr><tr><td class="txt" data-fill>${so.notes || so.internalNotes ? nl(so.notes || so.internalNotes) : ''}</td></tr></tbody></table>
<table><colgroup><col style="width:25%"><col style="width:25%"><col style="width:25%"><col></colgroup><tbody><tr>
  <td class="sg"><b>Prepared by</b><div class="sp" style="height:13mm"></div><div class="sl">Accounts</div></td>
  <td class="sg"><b>Checked by</b><div class="sp" style="height:13mm"></div><div class="sl">Purchase</div></td>
  <td class="sg"><b>Project manager</b><div class="sp" style="height:13mm"></div><div class="sl">Projects</div></td>
  <td class="sg"><b>Approved by</b><div class="sp" style="height:13mm"></div><div class="sl">Director</div></td>
</tr></tbody></table>
<div class="foot">SUBJECT TO ${esc(String(co.jurisdiction || 'Ahmedabad').trim().toUpperCase())} JURISDICTION</div>
</div>
<div class="pby"><span>${brandLine(user)}</span><span>${esc(nowText())}</span></div>`));
}
