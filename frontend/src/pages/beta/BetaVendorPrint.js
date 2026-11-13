/* Vendor Registration print — one vendor's registration details in the Order Advice style:
 * stacked tables, thin black lines, no black fills; printed on the same page through a hidden frame.
 * The blank document row stretches so the form fills one A4 page. */
import { logoOf, ADV_CSS } from './BetaDuesPrint';
import { fillPage } from './BetaDCPrint';
import { brandLine } from '../../utils/printBranding';
import { previewFrame } from './printKit';

const esc = v => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const d = v => { const x = v ? new Date(v) : null; return x && !isNaN(x) ? `${String(x.getDate()).padStart(2, '0')}-${String(x.getMonth() + 1).padStart(2, '0')}-${x.getFullYear()}` : ''; };
const tidy = t => String(t || '').replace(/\s*[\r\n]+\s*/g, ', ').replace(/\s+,/g, ',').replace(/,(\s*,)+/g, ',').replace(/\s{2,}/g, ' ').replace(/,\s*$/, '').trim();
const now = () => new Date().toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const yes = x => x === true || x === 'true' || x === 'Yes';
const who = u => (u ? (typeof u === 'string' ? u : u.name || u.username || '') : '');
const STATUS = { approved: 'Approved', active: 'Approved', pending: 'Pending Approval', rejected: 'Rejected', draft: 'Draft', suspended: 'Suspended' };

const CSS = ADV_CSS + `
.doc > table > tbody > tr > td, .doc > table > thead > tr > th, .doc > table > thead > tr > td { border-width:.5px; }
.sec td { text-align:center; }
.ttl { font-size:12.5pt; letter-spacing:2px; white-space:nowrap; }
.grid td.k { width:17%; color:#333; white-space:nowrap; }
.grid td.v { width:33%; font-weight:bold; }
.ls tbody tr.pr td { border-top:0 !important; border-bottom:0 !important; }
.ls tbody tr.fill td { height:1mm; border-top:0 !important; border-bottom:0 !important; }
.sg td { height:24mm; vertical-align:top !important; }
.sg .box { height:100%; display:flex; flex-direction:column; justify-content:space-between; }
.sg .row3 { display:flex; align-items:flex-end; gap:6px; } .sg .row3 b { flex:1 1 0; text-align:center; } .sg .apv { font-size:7.6pt; text-align:right; }
.decl { font-size:8.2pt; }
.pby { color:#000; font-weight:bold; font-size:7.6pt; }
@media print { @page { margin:8mm; size:A4 portrait; } }
`;

export async function printVendor({ v, company, user }) {
  const co = company || {};
  const logo = await logoOf(co);
  const coAddr = tidy([co.address, co.city, [co.state, co.pincode].filter(Boolean).join(' - ')].filter(Boolean).join(', '));
  const billAddr = tidy([v.address || v.billingAddr, v.city, [v.state, v.pincode].filter(Boolean).join(' - '), v.country && v.country !== 'India' ? v.country : ''].filter(Boolean).join(', '));
  const df = v.dispatchFrom || {};
  const dispAddr = v.dispatchSame === false && (df.address || df.city)
    ? tidy([df.address, df.city, [df.state, df.pincode].filter(Boolean).join(' - ')].filter(Boolean).join(', ')) : 'Same as Bill From';
  const people = (v.contactPersons || []).filter(p => p && (p.name || p.mobileNumber || p.email))
    .map(p => ({ name: p.name, des: p.designation, mobile: p.mobileNumber || p.mobile, email: p.email }));
  if (!people.length && (v.contactPerson || v.mobile || v.email)) people.push({ name: v.contactPerson, des: '', mobile: v.mobile, email: v.email });
  const docs = (v.documents || []).filter(Boolean);
  const created = (v.audit || []).find(a => a && a.action === 'created');
  const approved = [...(v.audit || [])].reverse().find(a => a && /approv/i.test(a.action || ''));
  const row = (k1, v1, k2, v2) => `<tr><td class="k">${k1}</td><td class="v">${esc(v1) || '—'}</td><td class="k">${k2}</td><td class="v">${esc(v2) || '—'}</td></tr>`;

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Vendor ${esc(v.vendorId)} — ${esc(v.vendorName)}</title>
<style>${CSS}</style></head><body>
<div class="doc">
<table>
  <colgroup><col style="width:60%"><col></colgroup>
  <tbody>
    <tr><td rowspan="2" style="vertical-align:middle"><div class="co">${logo ? `<img src="${logo}" alt="">` : ''}<div>
        <div class="nm">${esc(co.companyName || co.name || '')}</div>
        ${coAddr ? `<div>${esc(coAddr)}</div>` : ''}
        <div>${[co.gstin && `GSTIN: <b>${esc(co.gstin)}</b>`, co.phone && `Ph: ${esc(co.phone)}`].filter(Boolean).join(' &nbsp;|&nbsp; ')}</div>
        ${co.email ? `<div>Email: ${esc(co.email)}</div>` : ''}
      </div></div></td>
      <td class="ttl">VENDOR REGISTRATION<small>Vendor master details as registered with us</small></td></tr>
    <tr><td><table class="kv">
      <tr><td>Vendor ID</td><td>:</td><td><b>${esc(v.vendorId)}</b></td></tr>
      <tr><td>Registered On</td><td>:</td><td><b>${d(v.createdAt) || '—'}</b></td></tr>
      <tr><td>Status</td><td>:</td><td><b>${esc(STATUS[v.status] || v.status || 'Draft')}</b></td></tr>
      <tr><td>Print Date</td><td>:</td><td><b>${d(new Date())}</b></td></tr>
    </table></td></tr>
  </tbody>
</table>
<table class="grid">
  <thead><tr class="sec"><td colspan="4">Vendor details</td></tr></thead>
  <tbody>
    <tr><td class="k">Vendor Name</td><td colspan="3" style="font-size:10.5pt"><b>${esc(v.vendorName)}</b>${v.alias ? ` &nbsp;(${esc(v.alias)})` : ''}</td></tr>
    ${row('Business Type', v.businessType, 'Industry', v.industryType)}
    ${row('GST Reg. Type', v.gstType, 'GSTIN', v.gstin || v.gst)}
    ${row('PAN', v.pan, 'MSME / Udyam No.', v.msme)}
    ${row('CIN', v.cin, 'TDS Applicable', yes(v.tdsApplicable) ? 'Yes' : 'No')}
    ${row('Payment Terms', v.paymentTerms, 'Credit Limit', v.creditLimit)}
    ${row('Payment Modes', Array.isArray(v.paymentModes) ? v.paymentModes.join(', ') : v.paymentModes, 'Category', v.category)}
  </tbody>
</table>
<table>
  <colgroup><col style="width:50%"><col></colgroup>
  <thead><tr class="sec"><td colspan="2">Address</td></tr></thead>
  <tbody><tr>
    <td><div class="lbl">Bill From</div>${esc(billAddr) || '—'}</td>
    <td><div class="lbl">Dispatch From</div>${esc(dispAddr)}</td>
  </tr></tbody>
</table>
<table>
  <colgroup><col style="width:26px"><col style="width:30%"><col style="width:20%"><col style="width:18%"><col></colgroup>
  <thead>
    <tr class="sec"><td colspan="5">Contact persons</td></tr>
    <tr class="hd"><th>Sl</th><th>Name</th><th>Designation</th><th>Mobile</th><th>Email</th></tr>
  </thead>
  <tbody>
    ${people.length ? people.map((p, i) => `<tr><td class="c">${i + 1}</td><td><b>${esc(p.name)}</b></td><td>${esc(p.des)}</td><td>${esc(p.mobile)}</td><td>${esc(p.email)}</td></tr>`).join('')
      : '<tr><td colspan="5" class="c">No contact person</td></tr>'}
    ${v.landline || v.altMobile || v.website ? `<tr><td colspan="5">${[v.landline && `Landline: <b>${esc(v.landline)}</b>`, v.altMobile && `Alt. Mobile: <b>${esc(v.altMobile)}</b>`, v.website && `Website: <b>${esc(v.website)}</b>`].filter(Boolean).join(' &nbsp;|&nbsp; ')}</td></tr>` : ''}
  </tbody>
</table>
<table class="grid">
  <thead><tr class="sec"><td colspan="4">Bank details</td></tr></thead>
  <tbody>
    ${row('Bank Name', v.bankName, 'Branch', v.branch)}
    ${row('A/c Holder', v.accountHolder, 'A/c No.', v.accountNo)}
    ${row('IFS Code', v.ifsc, 'UPI ID', v.upi)}
  </tbody>
</table>
<table class="ls">
  <colgroup><col style="width:26px"><col style="width:40%"><col></colgroup>
  <thead>
    <tr class="sec"><td colspan="3">Documents on file</td></tr>
    <tr class="hd"><th>Sl</th><th>Document</th><th>File</th></tr>
  </thead>
  <tbody>
    ${docs.length ? docs.map((x, i) => `<tr class="pr"><td class="c">${i + 1}</td><td>${esc(x.type || x.name || 'Document')}</td><td>${esc(x.originalName || x.fileName || '')}</td></tr>`).join('')
      : '<tr class="pr"><td colspan="3" class="c">No document uploaded</td></tr>'}
    <tr class="fill" id="fillrow">${docs.length ? '<td></td><td></td><td></td>' : '<td colspan="3"></td>'}</tr>
  </tbody>
</table>
<table>
  <tbody><tr><td class="decl"><b>Declaration:</b> We confirm that the details above are true and correct. We will inform ${esc(co.companyName || co.name || 'the company')} in writing of any change in these details, including our bank account.
    ${remarksLine(v)}</td></tr></tbody>
</table>
<table class="sg">
  <colgroup><col style="width:50%"><col></colgroup>
  <tbody><tr>
    <td><div class="box"><b>For ${esc(v.vendorName)}</b><b>Signature &amp; Seal</b></div></td>
    <td><div class="box"><b style="text-align:right">for ${esc(co.companyName || co.name || '')}</b>
      ${approved ? `<span class="apv">Approved by: ${esc(who(approved.by))}${approved.at ? ` on ${d(approved.at)}` : ''}</span>` : ''}
      <div class="row3"><b>Prepared By</b><b>Verified By</b><b>Authorised Signatory</b></div></div></td>
  </tr></tbody>
</table>
</div>
<div class="pby" style="display:flex;justify-content:space-between;margin-top:3px"><span>${brandLine(user)}${created ? ` &nbsp;|&nbsp; Created by: ${esc(who(created.by))}` : ''}</span><span>Printed: ${esc(now())}</span></div>
</body></html>`;

  document.getElementById('vd-print-frame')?.remove();
  const fr = document.createElement('iframe');
  fr.id = 'vd-print-frame'; fr.setAttribute('aria-hidden', 'true');
  fr.style.cssText = 'position:fixed;left:-10000px;top:0;width:194mm;height:281mm;border:0;visibility:hidden';
  document.body.appendChild(fr);
  const w = fr.contentWindow;
  w.document.open(); w.document.write(html); w.document.close();
  await new Promise(res => setTimeout(res, 400));
  fillPage(w.document);
  previewFrame(fr);   // opens the preview: Email · Save PDF · Print
}

const remarksLine = v => (v.remarks ? `<div style="margin-top:4px"><b>Remarks:</b> ${esc(v.remarks)}</div>` : '');
