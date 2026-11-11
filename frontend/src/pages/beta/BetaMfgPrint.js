/* Manufacturing prints — Job Sheet (A4, bordered like the Sales Order / Delivery Challan, fills the page). */
import { brandLine } from '../../utils/printBranding';
import { escHtml as esc, nlHtml as nl, pageHtml as page, showPage as printPage, LETTER_CSS, logoOf, nowText, dmy } from './BetaCertPrint';

const CSS = LETTER_CSS + `
.doc > table > thead > tr > th { border:1px solid #000; background:#F5F5F5; font-weight:bold; font-size:7.8pt; text-align:center; padding:4px 3px; }
.c { text-align:center !important; } .r { text-align:right !important; white-space:nowrap; } tr.it td { border-top:0 !important; border-bottom:0 !important; }
.chk { display:inline-block; width:11px; height:11px; border:1px solid #000; vertical-align:middle; margin-right:4px; }`;
const q = v => { const n = Number(v) || 0; return Number.isInteger(n) ? String(n) : String(Math.round(n * 1000) / 1000); };
const ST = { pending: 'DRAFT', submitted: 'SUBMITTED', approved: 'APPROVED', 'in-progress': 'IN PROGRESS', completed: 'COMPLETED', rejected: 'REJECTED', cancelled: 'CANCELLED' };

export async function printJobSheet({ js: j, company, user }) {
  const co = company || {}, logo = await logoOf(co);
  const coAddr = esc([co.address, co.city, [co.state, co.pincode].filter(Boolean).join(' - ')].filter(Boolean).join(', '));
  const out = (j.outputItems || []).length ? j.outputItems : [{ itemName: j.itemName, qty: j.qtyRequired, uom: j.uom }];
  const bom = j.bom || [];
  const kv = (k, v) => (v ? `<tr><td>${esc(k)}</td><td>:</td><td><b>${esc(v)}</b></td></tr>` : '');
  printPage(page(`Job Sheet ${j.jobNo || ''}`, CSS, `<div class="doc">
<table><tbody><tr><td class="ttl">JOB SHEET<small>PRODUCTION ORDER FOR THE SHOP FLOOR</small></td></tr></tbody></table>
<table><colgroup><col style="width:56%"><col></colgroup><tbody><tr>
  <td><div class="co">${logo ? `<img src="${logo}" alt="">` : ''}<div><div class="nm">${esc(co.companyName || co.name)}</div>${coAddr ? `<div>${coAddr}</div>` : ''}
    <div>${[co.gstin && `GSTIN: <b>${esc(co.gstin)}</b>`, co.phone && `Ph: ${esc(co.phone)}`].filter(Boolean).join(' &nbsp;|&nbsp; ')}</div></div></div></td>
  <td><table class="kv">${kv('Job No.', j.jobNo)}${kv('Date', dmy(j.createdAt))}${kv('Status', ST[j.status] || j.status)}${kv('Start date', dmy(j.startDate))}${kv('Due date', dmy(j.dueDate))}${kv('Approved by', j.approvedBy ? `${j.approvedBy}${j.approvedAt ? ` · ${dmy(j.approvedAt)}` : ''}` : '')}</table></td>
</tr></tbody></table>
<table><colgroup><col style="width:56%"><col></colgroup><tbody><tr>
  <td><div class="lbl">For sales order</div><div class="pn">${esc(j.soNumber || 'Stock / internal job')}</div>${j.customerName ? `<div>Client: <b>${esc(j.customerName)}</b></div>` : ''}</td>
  <td><div class="lbl">Location</div><div class="pn">${esc(j.locationName || '—')}</div>${Number(j.qtyProduced) ? `<div>Produced so far: <b>${q(j.qtyProduced)}</b></div>` : ''}${j.endDate ? `<div>Completed on: <b>${dmy(j.endDate)}</b></div>` : ''}</td>
</tr></tbody></table>
<table><colgroup><col style="width:28px"><col><col style="width:80px"><col style="width:60px"><col style="width:90px"><col style="width:90px"></colgroup>
<thead><tr><th>Sl</th><th>Product to make</th><th>Qty</th><th>Unit</th><th>Made (fill)</th><th>QC OK (fill)</th></tr></thead>
<tbody>${out.map((it, i) => `<tr class="it"><td class="c">${i + 1}</td><td><b>${esc(it.itemName)}</b>${it.itemCode ? `<div style="font-size:7.6pt">Code: ${esc(it.itemCode)}</div>` : ''}</td><td class="c"><b>${q(it.mfgQty != null ? it.mfgQty : it.qty)}</b></td><td class="c">${esc(it.uom || '')}</td><td></td><td></td></tr>`).join('')}</tbody></table>
<table><colgroup><col style="width:28px"><col><col style="width:80px"><col style="width:60px"><col style="width:80px"><col style="width:90px"><col style="width:90px"></colgroup>
<thead><tr><th>Sl</th><th>Material (BOM)</th><th>Qty needed</th><th>Unit</th><th>HSN</th><th>Issued (fill)</th><th>Returned (fill)</th></tr></thead>
<tbody>${bom.length ? bom.map((b, i) => `<tr class="it"><td class="c">${i + 1}</td><td>${esc(b.material)}</td><td class="c"><b>${q(b.qty)}</b></td><td class="c">${esc(b.uom || '')}</td><td class="c">${esc(b.hsn || '')}</td><td></td><td></td></tr>`).join('') : '<tr><td colspan="7" class="c">No material listed</td></tr>'}</tbody></table>
<table><tbody>
  ${j.specifications ? `<tr><td class="sec">Specifications</td></tr><tr><td class="txt">${nl(j.specifications)}</td></tr>` : ''}
  <tr><td class="sec">Work instructions</td></tr><tr><td class="txt" data-fill>${j.workInstructions ? nl(j.workInstructions) : ''}${(j.attachments || []).length ? `<p style="margin-top:6px"><b>Drawings / files:</b> ${j.attachments.map(a => esc(a.name || a.fileName)).join(', ')}</p>` : ''}${j.notes ? `<p><b>Notes:</b> ${nl(j.notes)}</p>` : ''}</td></tr>
  <tr><td><span class="chk"></span>Material issued &nbsp;&nbsp; <span class="chk"></span>Work done as per drawing &nbsp;&nbsp; <span class="chk"></span>QC checked &nbsp;&nbsp; <span class="chk"></span>Ready for dispatch &nbsp;&nbsp; Actual end date: __________</td></tr>
</tbody></table>
<table><colgroup><col style="width:25%"><col style="width:25%"><col style="width:25%"><col></colgroup><tbody><tr>
  <td class="sg"><b>Prepared by</b><div class="sp" style="height:13mm"></div><div class="sl">Planning</div></td>
  <td class="sg"><b>Approved by</b><div class="sp" style="height:13mm"></div><div class="sl">${esc(j.approvedBy || 'Production manager')}</div></td>
  <td class="sg"><b>Production in-charge</b><div class="sp" style="height:13mm"></div><div class="sl">Shop floor</div></td>
  <td class="sg"><b>Quality check</b><div class="sp" style="height:13mm"></div><div class="sl">QC</div></td>
</tr></tbody></table>
<div class="foot">SUBJECT TO ${esc(String(co.jurisdiction || 'Ahmedabad').trim().toUpperCase())} JURISDICTION</div>
</div>
<div class="pby"><span>${brandLine(user)}</span><span>${esc(nowText())}</span></div>`));
}
