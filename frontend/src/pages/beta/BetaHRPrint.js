/* HR prints — Joining / Appointment letter with terms & conditions, Company Asset Handover Agreement, Payslip.
 * Same bordered A4 look as the Sales Order / Delivery Challan; each fills the page (data-fill) and opens in the preview. */
import axios from 'axios';
import { brandLine } from '../../utils/printBranding';
import { salaryFor } from './BetaHRKit';
import { escHtml as esc, nlHtml as nl, inrText as inr, pageHtml as page, showPage as printPage, LETTER_CSS, logoOf, longDate, nowText, dmy, inWords } from './BetaCertPrint';

const CSS = LETTER_CSS + `
.doc > table > thead > tr > th { border:1px solid #000; background:#F5F5F5; font-weight:bold; font-size:7.8pt; text-align:center; padding:4px 3px; }
.c { text-align:center !important; } .r { text-align:right !important; white-space:nowrap; }
ol.tc { margin:1px 0 0 16px; } ol.tc li { margin:0 0 2px; text-align:justify; font-size:8.3pt; line-height:1.34; }
.two { display:flex; gap:0; } .two > div { flex:1; }
tr.tot td { font-weight:bold; background:#F2F2F2; }
.net { font-size:11pt; font-weight:bold; }`;
const gross = s => ['basic', 'hra', 'conveyance', 'special', 'other'].reduce((t, k) => t + (Number(s?.[k]) || 0), 0);
const jur = co => `<div class="foot">SUBJECT TO ${esc(String(co.jurisdiction || 'Ahmedabad').trim().toUpperCase())} JURISDICTION</div>`;
const terms = text => `<ol class="tc">${String(text || '').split(/\r?\n/).map(x => x.trim()).filter(Boolean).map(x => `<li>${esc(x)}</li>`).join('')}</ol>`;

async function head(co, title, sub, kv) {
  const logo = await logoOf(co);
  const coAddr = esc([co.address, co.city, [co.state, co.pincode].filter(Boolean).join(' - ')].filter(Boolean).join(', '));
  return `<table><tbody><tr><td class="ttl">${esc(title)}${sub ? `<small>${esc(sub)}</small>` : ''}</td></tr></tbody></table>
<table><colgroup><col style="width:56%"><col></colgroup><tbody><tr>
  <td><div class="co">${logo ? `<img src="${logo}" alt="">` : ''}<div>
    <div class="nm">${esc(co.companyName || co.name)}</div>${coAddr ? `<div>${coAddr}</div>` : ''}
    <div>${[co.gstin && `GSTIN: <b>${esc(co.gstin)}</b>`, co.pan && `PAN: ${esc(co.pan)}`].filter(Boolean).join(' &nbsp;|&nbsp; ')}</div>
    <div>${[co.phone && `Ph: ${esc(co.phone)}`, co.email && `Email: ${esc(co.email)}`].filter(Boolean).join(' &nbsp;|&nbsp; ')}</div></div></div></td>
  <td><table class="kv">${kv.filter(([, v]) => v).map(([k, v]) => `<tr><td>${esc(k)}</td><td>:</td><td><b>${esc(v)}</b></td></tr>`).join('')}</table></td>
</tr></tbody></table>`;
}
const empBlock = e => `<div class="lbl">Employee</div><div class="pn">${esc(e.name)}</div>
  ${e.fatherName ? `<div>S/o / D/o: ${esc(e.fatherName)}</div>` : ''}${e.currentAddress ? `<div>${nl(e.currentAddress)}</div>` : ''}
  <div>${[e.mobile && `Mobile: ${esc(e.mobile)}`, e.email && `Email: ${esc(e.email)}`].filter(Boolean).join(' &nbsp;|&nbsp; ')}</div>`;

/* nature of employment: the title on the agreement and the clause that says exactly what kind of employment it is */
export const EMP_KINDS = {
  Permanent: { title: 'PERMANENT EMPLOYMENT', clause: e => `This is a <b>PERMANENT</b> employment with effect from <b>${longDate(e.joiningDate) || '__________'}</b>${Number(e.probationMonths) ? `, subject to a probation of <b>${esc(e.probationMonths)} months</b>. On satisfactory completion of the probation your services will be confirmed in writing` : ''}. It continues until ended by either side as per the notice period below.` },
  Probation: { title: 'EMPLOYMENT ON PROBATION', clause: e => `You are appointed <b>ON PROBATION</b> for <b>${esc(e.probationMonths || '6')} months</b> from <b>${longDate(e.joiningDate) || '__________'}</b>. The probation may be extended. On satisfactory completion you will be made <b>PERMANENT</b> by a written letter; until then the employment may be ended by either side with 15 days' notice.` },
  Temporary: { title: 'TEMPORARY EMPLOYMENT', clause: e => `This is a <b>TEMPORARY</b> employment for a fixed period from <b>${longDate(e.joiningDate) || '__________'}</b> to <b>${longDate(e.contractEndDate) || '__________'}</b>. It ends automatically on that date unless extended in writing. Temporary employment gives no right or claim to permanent employment.` },
  Contract: { title: 'CONTRACT EMPLOYMENT', clause: e => `This is a <b>CONTRACT</b> employment for the period from <b>${longDate(e.joiningDate) || '__________'}</b> to <b>${longDate(e.contractEndDate) || '__________'}</b> (or completion of the assigned project, whichever is earlier). It ends on that date unless renewed in writing and gives no right to permanent employment.` },
  Trainee: { title: 'TRAINEE / TRAINING AGREEMENT', clause: e => `You are engaged as a <b>TRAINEE</b> for a training period from <b>${longDate(e.joiningDate) || '__________'}</b> to <b>${longDate(e.contractEndDate) || '__________'}</b>${e.stipend ? `, with a stipend of <b>${esc(e.stipend)}</b>` : ''}. This is training, not employment; on satisfactory completion the company may, at its option, offer you employment by a separate letter.` },
  Intern: { title: 'INTERNSHIP AGREEMENT', clause: e => `You are engaged as an <b>INTERN</b> from <b>${longDate(e.joiningDate) || '__________'}</b> to <b>${longDate(e.contractEndDate) || '__________'}</b>${e.stipend ? `, with a stipend of <b>${esc(e.stipend)}</b>` : ''}. The internship is for learning and gives no right to employment.` },
  Consultant: { title: 'CONSULTANCY AGREEMENT', clause: e => `You are engaged as a <b>CONSULTANT</b> (not an employee) from <b>${longDate(e.joiningDate) || '__________'}</b>${e.contractEndDate ? ` to <b>${longDate(e.contractEndDate)}</b>` : ''}. You will be paid the professional fee stated below, against your invoice, after TDS as applicable.` },
};
export const kindOf = e => EMP_KINDS[e?.employmentType] ? e.employmentType : 'Permanent';

/* ───────── Employment agreement (Permanent / Temporary / Trainee …) + terms & conditions + company policies + acceptance ───────── */
export async function printEmploymentAgreement({ emp: e, settings, company, user }) {
  const co = company || {}, s = e.salary || {}, g = gross(s), K = EMP_KINDS[kindOf(e)];
  const coName = esc(co.companyName || co.name);
  const rows = [['Basic', s.basic], ['HRA', s.hra], ['Conveyance', s.conveyance], ['Special allowance', s.special], ['Other allowance', s.other]].filter(([, v]) => Number(v) > 0);
  const stat = [s.pfApplicable && 'PF', s.esiApplicable && 'ESI', s.ptApplicable && 'Professional Tax', Number(s.tds) > 0 && `TDS ₹ ${inr(s.tds)}`].filter(Boolean).join(', ');
  const fixed = ['Temporary', 'Contract', 'Trainee', 'Intern', 'Consultant'].includes(kindOf(e));
  const pols = (settings?.policies || []).filter(p => p.inAgreement && p.title);
  printPage(page(`Employment Agreement ${e.empCode || ''} ${e.name || ''}`, CSS, `<div class="doc">
${await head(co, 'EMPLOYMENT AGREEMENT', K.title, [['Ref. No.', `HR/AGR/${e.empCode || e.id}`], ['Date', dmy(e.joiningDate || new Date())], ['Employee Code', e.empCode], ['Nature', kindOf(e).toUpperCase()]])}
<table><colgroup><col style="width:56%"><col></colgroup><tbody><tr>
  <td>${empBlock(e)}</td>
  <td><div class="lbl">Position</div><table class="kv">
    <tr><td>Designation</td><td>:</td><td><b>${esc(e.designation || '—')}</b></td></tr><tr><td>Department</td><td>:</td><td><b>${esc(e.department || '—')}</b></td></tr>
    <tr><td>Work location</td><td>:</td><td><b>${esc(e.workLocation || co.city || '—')}</b></td></tr>
    ${e.reportingTo ? `<tr><td>Reporting to</td><td>:</td><td><b>${esc(e.reportingTo)}</b></td></tr>` : ''}</table></td>
</tr></tbody></table>
<table><tbody><tr><td class="sec" style="text-align:center; font-size:10pt; letter-spacing:1px">NATURE OF EMPLOYMENT: ${esc(kindOf(e).toUpperCase())}</td></tr>
<tr><td class="txt"><p>This agreement is made between <b>${coName}</b> (“the Company”) and <b>${esc(e.name)}</b> (“the Employee”).</p><p>${K.clause(e)}</p></td></tr></tbody></table>
<table><colgroup><col style="width:22%"><col style="width:28%"><col style="width:22%"><col></colgroup><tbody>
  <tr><td colspan="4" class="sec">Terms of employment</td></tr>
  <tr><th>Date of joining</th><td><b>${dmy(e.joiningDate) || '—'}</b></td><th>${fixed ? 'End date' : 'Probation'}</th><td>${fixed ? `<b>${dmy(e.contractEndDate) || '—'}</b>` : (e.probationMonths ? `${esc(e.probationMonths)} months` : '—')}</td></tr>
  <tr><th>Working hours</th><td>${esc(e.workHours || '—')}${e.shift ? ` (${esc(e.shift)})` : ''}</td><th>Weekly off</th><td>${esc(e.weeklyOff || settings?.weeklyOff || 'Sunday')}</td></tr>
  <tr><th>Notice period</th><td>${e.noticeDays ? `${esc(e.noticeDays)} days` : '—'}</td><th>${kindOf(e) === 'Consultant' ? 'Fee / month' : ['Trainee', 'Intern'].includes(kindOf(e)) ? 'Stipend / month' : 'Gross salary / month'}</th><td><b>₹ ${inr(g)}</b>${e.stipend ? ` <span style="font-size:8pt">(${esc(e.stipend)})</span>` : ''}</td></tr>
  ${rows.length ? `<tr><th>Salary break-up</th><td colspan="3">${rows.map(([k, v]) => `${k} ₹ ${inr(v)}`).join(' &nbsp;·&nbsp; ')} &nbsp;·&nbsp; <b>CTC approx. ₹ ${inr(g * 12)} / year</b></td></tr>` : ''}
  <tr><th>Deductions</th><td colspan="3">${stat || 'As per law'}</td></tr>
</tbody></table>
<table><tbody><tr><td class="sec">Terms and conditions</td></tr><tr><td class="txt" data-fill>${terms(fixed ? String(settings?.joiningTerms || '').split(/\r?\n/).filter(l => !/^\s*probation\b/i.test(l)).join('\n') : settings?.joiningTerms)}
${pols.length ? `<p style="margin-top:5px"><b>Company policies forming part of this agreement:</b> ${pols.map(p => esc(p.title)).join(', ')} (attached).</p>` : ''}
<p style="margin-top:5px">Please sign the duplicate copy of this agreement as a token of your acceptance and return it to us.</p></td></tr></tbody></table>
<table><colgroup><col style="width:50%"><col></colgroup><tbody><tr>
  <td class="sg"><b>Accepted by the employee</b><div style="font-size:8pt; margin-top:3px">I have read and understood this ${esc(kindOf(e).toLowerCase())} employment agreement, the terms and the attached policies, and I accept them.</div><div class="sp" style="height:12mm"></div><div class="tri"><span>Signature</span><span>${esc(e.name)}</span><span>Date: ${e.termsAcceptedOn ? dmy(e.termsAcceptedOn) : '__________'}</span></div></td>
  <td class="sg"><b style="display:block; text-align:right">For ${coName}</b><div class="sp"></div><div class="tri"><span>HR</span><span></span><span>Authorised Signatory</span></div></td>
</tr></tbody></table>
${jur(co)}
</div>
<div class="pby"><span>${brandLine(user)}</span><span>${esc(nowText())}</span></div>
${pols.map(p => policyPage(co, p, e)).join('')}`));
}
const policyPage = (co, p, e) => `<div class="pb"></div><div class="doc">
<table><tbody><tr><td class="ttl">${esc(String(p.title).toUpperCase())}<small>${esc(co.companyName || co.name || '')}${e ? ` — ANNEXURE TO THE EMPLOYMENT AGREEMENT OF ${esc(String(e.name).toUpperCase())}` : ''}</small></td></tr></tbody></table>
<table><tbody><tr><td class="txt" data-fill>${terms(p.text)}</td></tr></tbody></table>
<table><colgroup><col style="width:50%"><col></colgroup><tbody><tr>
  <td class="sg"><b>${e ? `Read and accepted — ${esc(e.name)}` : 'Employee'}</b><div class="sp" style="height:12mm"></div><div class="tri"><span>Signature</span><span>Date: __________</span></div></td>
  <td class="sg"><b style="display:block; text-align:right">For ${esc(co.companyName || co.name || '')}</b><div class="sp" style="height:12mm"></div><div class="tri"><span>HR</span><span>Authorised Signatory</span></div></td>
</tr></tbody></table>
${jur(co)}
</div>`;
/* one company policy on its own */
export async function printPolicy({ policy, company, user }) {
  const co = company || {};
  printPage(page(`${policy.title}`, CSS, `${policyPage(co, policy, null).replace('<div class="pb"></div>', '')}
<div class="pby"><span>${brandLine(user)}</span><span>${esc(nowText())}</span></div>`));
}
/* the old name still works */
export const printJoiningLetter = printEmploymentAgreement;

/* ───────── Company asset handover agreement (one or more assets given to an employee) ───────── */
export async function printAssetAgreement({ assets, emp: e, settings, company, user }) {
  const co = company || {}, list = Array.isArray(assets) ? assets : [assets];
  const coName = esc(co.companyName || co.name);
  const total = list.reduce((t, a) => t + (Number(a.value) || 0), 0);
  const back = list.filter(a => a.returnedOn);
  printPage(page(`Asset Agreement ${e.empCode || ''} ${e.name || ''}`, CSS, `<div class="doc">
${await head(co, 'COMPANY ASSET HANDOVER AGREEMENT', 'ASSETS GIVEN TO THE EMPLOYEE FOR OFFICIAL USE', [['Ref. No.', `HR/AST/${list.map(a => a.id).join('-')}`], ['Date', dmy(list[0]?.issuedOn || new Date())], ['Employee Code', e.empCode], ['Designation', e.designation], ['Department', e.department]])}
<table><tbody><tr><td>${empBlock(e)}</td></tr></tbody></table>
<table><colgroup><col style="width:28px"><col style="width:14%"><col><col style="width:20%"><col style="width:12%"><col style="width:11%"><col style="width:12%"></colgroup>
<thead><tr><th>Sl</th><th>Type</th><th>Asset / Model &amp; accessories</th><th>Serial / IMEI / SIM / Reg. No.</th><th>Issued on</th><th>Condition</th><th>Value ₹</th></tr></thead>
<tbody>${list.map((a, i) => `<tr class="it"><td class="c">${i + 1}</td><td>${esc(a.assetType || '')}</td><td><b>${esc(a.assetName)}</b>${a.accessories ? `<div style="font-size:7.6pt">With: ${esc(a.accessories)}</div>` : ''}${a.mobileNo ? `<div style="font-size:7.6pt">Mobile no.: ${esc(a.mobileNo)}</div>` : ''}</td>
  <td>${esc([a.serialNo, a.simNo && `SIM ${a.simNo}`].filter(Boolean).join(' · ') || '—')}</td><td class="c">${dmy(a.issuedOn)}</td><td class="c">${esc(a.issueCondition || 'Good')}</td><td class="r">${Number(a.value) ? inr(a.value) : '—'}</td></tr>`).join('')}
<tr class="end"><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
<tr class="tot"><td colspan="6" class="r">Total value</td><td class="r">${inr(total)}</td></tr></tbody></table>
<table><tbody><tr><td class="sec">Terms of use</td></tr><tr><td class="txt" data-fill>${terms(settings?.assetTerms)}</td></tr></tbody></table>
<table><colgroup><col style="width:50%"><col></colgroup><tbody><tr>
  <td class="sg"><b>Received by the employee</b><div style="font-size:8pt; margin-top:3px">I have received the above asset(s) in the stated condition and agree to the terms of use.</div><div class="sp" style="height:12mm"></div><div class="tri"><span>Signature</span><span>${esc(e.name)}</span><span>Date: __________</span></div></td>
  <td class="sg"><b style="display:block; text-align:right">Issued by, for ${coName}</b><div class="sp"></div><div class="tri"><span>Store / Admin</span><span></span><span>Authorised Signatory</span></div></td>
</tr></tbody></table>
<table><tbody><tr><td class="sec">Return of assets (filled when returned)</td></tr>
<tr><td>${back.length ? back.map(a => `<div>${esc(a.assetName)} — returned on <b>${dmy(a.returnedOn)}</b>, condition: <b>${esc(a.returnCondition || '—')}</b></div>`).join('') : 'Returned on: ____________ &nbsp;&nbsp; Condition: ______________________ &nbsp;&nbsp; Received by (company): ______________________'}</td></tr></tbody></table>
${jur(co)}
</div>
<div class="pby"><span>${brandLine(user)}</span><span>${esc(nowText())}</span></div>`));
}

/* ───────── Payslip ───────── */
const monthLabel = m => { const [y, mo] = String(m).split('-'); return new Date(+y, +mo - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }); };
export async function printPayslip({ row: r, month, emp, company, user, att }) {
  const co = company || {}, e = emp || {};
  const earn = [['Basic', r.basic], ['HRA', r.hra], ['Conveyance', r.conveyance], ['Special allowance', r.special], ['Other allowance', r.other], ['Bonus / incentive', r.bonus]].filter(([, v]) => Number(v) > 0);
  const ded = [['Provident Fund (PF)', r.pf], ['ESI', r.esi], ['Professional Tax', r.pt], ['TDS', r.tds], ['Advance recovery', r.advance], ['Other deductions', r.otherDed]].filter(([, v]) => Number(v) > 0);
  const n = Math.max(earn.length, ded.length, 1);
  const line = i => `<tr class="it"><td>${earn[i] ? esc(earn[i][0]) : ''}</td><td class="r">${earn[i] ? inr(earn[i][1]) : ''}</td><td>${ded[i] ? esc(ded[i][0]) : ''}</td><td class="r">${ded[i] ? inr(ded[i][1]) : ''}</td></tr>`;
  printPage(page(`Payslip ${r.empCode || ''} ${monthLabel(month)}`, CSS, `<div class="doc">
${await head(co, 'SALARY SLIP', `FOR THE MONTH OF ${monthLabel(month).toUpperCase()}`, [['Employee Code', r.empCode], ['Month', monthLabel(month)], ['Paid on', r.paidOn ? dmy(r.paidOn) : ''], ['Paid via', [r.paidVia, r.paidRef].filter(Boolean).join(' · ')]])}
<table><colgroup><col style="width:22%"><col style="width:28%"><col style="width:22%"><col></colgroup><tbody>
  <tr><th>Name</th><td><b>${esc(r.name)}</b></td><th>Designation</th><td>${esc(r.designation || '—')}</td></tr>
  <tr><th>Department</th><td>${esc(r.department || '—')}</td><th>Date of joining</th><td>${dmy(e.joiningDate) || '—'}</td></tr>
  <tr><th>PAN</th><td>${esc(r.pan || '—')}</td><th>UAN / PF No.</th><td>${esc([r.uan, e.pfNo].filter(Boolean).join(' / ') || '—')}</td></tr>
  <tr><th>Bank</th><td>${esc(r.bankName || '—')}</td><th>A/c No. / IFSC</th><td>${esc([r.bankAccount, r.ifsc].filter(Boolean).join(' / ') || '—')}</td></tr>
  <tr><th>Days in month</th><td>${esc(r.days)} <span style="font-size:7.8pt">(salary ÷ ${esc(r.days)} × paid days)</span></td><th>Paid days</th><td><b>${esc(r.paidDays)}</b>${att ? ` <span style="font-size:7.8pt">(${esc(att)})</span>` : ''}</td></tr>
</tbody></table>
<table><colgroup><col><col style="width:22%"><col><col style="width:22%"></colgroup>
<thead><tr><th>Earnings</th><th>Amount ₹</th><th>Deductions</th><th>Amount ₹</th></tr></thead>
<tbody>${Array.from({ length: n }, (_, i) => line(i)).join('')}
<tr class="end" data-fill><td></td><td></td><td></td><td></td></tr>
<tr class="tot"><td>Gross earnings</td><td class="r">${inr(r.gross)}</td><td>Total deductions</td><td class="r">${inr(r.deductions)}</td></tr>
<tr><td colspan="3" class="r net">NET PAY</td><td class="r net">₹ ${inr(r.net)}</td></tr></tbody></table>
<table><tbody><tr><td><b>Net pay in words:</b> ${esc(inWords(Number(r.net) || 0))}</td></tr>${r.remark ? `<tr><td><b>Remark:</b> ${esc(r.remark)}</td></tr>` : ''}</tbody></table>
<table><colgroup><col style="width:50%"><col></colgroup><tbody><tr>
  <td class="sg"><b>Employee</b><div class="sp"></div><div class="sl">Signature</div></td>
  <td class="sg"><b style="display:block; text-align:right">For ${esc(co.companyName || co.name)}</b><div class="sp"></div><div class="tri"><span>Prepared By</span><span>Verified By</span><span>Authorised Signatory</span></div></td>
</tr></tbody></table>
<div class="foot">This is a computer generated salary slip &nbsp;|&nbsp; SUBJECT TO ${esc(String(co.jurisdiction || 'Ahmedabad').trim().toUpperCase())} JURISDICTION</div>
</div>
<div class="pby"><span>${brandLine(user)}</span><span>${esc(nowText())}</span></div>`));
}
export { monthLabel };

/* ───────── Employee report: all details, joining till date, assets, attendance and salary month-wise ───────── */
const MK = { P: 1, HD: 0.5, L: 1, WO: 1, H: 1, A: 0, LWP: 0 };
const count = (marks, days) => { const t = { P: 0, A: 0, HD: 0, L: 0, LWP: 0, WO: 0, H: 0, marked: 0, paid: 0 }; for (let d = 1; d <= days; d++) { const k = marks && marks[d]; if (!k) continue; t[k]++; t.marked++; t.paid += MK[k] || 0; } return t; };
const serviceText = (from, to) => { const a = new Date(from), b = new Date(to); if (isNaN(a) || isNaN(b) || b < a) return ''; let m = (b.getFullYear() - a.getFullYear()) * 12 + b.getMonth() - a.getMonth(); if (b.getDate() < a.getDate()) m--; const y = Math.floor(m / 12); m %= 12; return [y && `${y} year${y > 1 ? 's' : ''}`, `${m} month${m === 1 ? '' : 's'}`].filter(Boolean).join(' '); };
export async function printEmployeeReport({ emp: e, history, company, user }) {
  const co = company || {}, s = e.salary || {}, g = gross(s);
  const until = e.leavingDate && e.status === 'Left' ? e.leavingDate : new Date().toISOString().slice(0, 10);
  // every month from the joining month to now, even when nothing was recorded
  const ms = []; if (e.joiningDate) { const [y0, m0] = e.joiningDate.split('-').map(Number), [y1, m1] = until.split('-').map(Number); for (let y = y0, m = m0; y < y1 || (y === y1 && m <= m1); m === 12 ? (y++, m = 1) : m++) ms.push(`${y}-${String(m).padStart(2, '0')}`); }
  const byM = Object.fromEntries((history.months || []).map(x => [x.month, x]));
  (history.months || []).forEach(x => { if (!ms.includes(x.month)) ms.push(x.month); }); ms.sort();
  const T = { P: 0, A: 0, HD: 0, L: 0, LWP: 0, WOH: 0, paid: 0, gross: 0, ded: 0, net: 0, netPaid: 0 };
  const rows = ms.map(m => {
    const h = byM[m] || {}, days = h.days || new Date(+m.slice(0, 4), +m.slice(5, 7), 0).getDate(), t = count(h.marks, days), sr = h.salary;
    T.P += t.P; T.A += t.A; T.HD += t.HD; T.L += t.L; T.LWP += t.LWP; T.WOH += t.WO + t.H; T.paid += t.paid;
    if (sr) { T.gross += +sr.gross || 0; T.ded += +sr.deductions || 0; T.net += +sr.net || 0; if (sr.paidOn) T.netPaid += +sr.net || 0; }
    return `<tr><td>${monthLabel(m)}</td><td class="c">${days}</td><td class="c">${t.marked ? t.P : '—'}</td><td class="c">${t.marked ? t.A : '—'}</td><td class="c">${t.marked ? t.HD : '—'}</td><td class="c">${t.marked ? t.L : '—'}</td><td class="c">${t.marked ? t.LWP : '—'}</td><td class="c">${t.marked ? t.WO + t.H : '—'}</td>
      <td class="c"><b>${sr ? sr.paidDays : t.marked ? t.paid : '—'}</b></td><td class="r">${sr ? inr(sr.gross) : '—'}</td><td class="r">${sr ? inr(sr.deductions) : '—'}</td><td class="r"><b>${sr ? inr(sr.net) : '—'}</b></td>
      <td class="c">${sr && sr.paidOn ? dmy(sr.paidOn) : sr ? '<span style="color:#B42318">Not paid</span>' : '—'}</td><td>${sr ? esc([sr.paidVia, sr.paidRef].filter(Boolean).join(' ')) : ''}</td></tr>`;
  }).join('');
  const assets = history.assets || [];
  printPage(page(`Employee Report ${e.empCode || ''} ${e.name || ''}`, CSS + `
.sm2 td, .sm2 th { font-size:7.8pt !important; padding:3px 4px !important; } .kvt th { width:18%; } .kvt td { width:32%; }`, `<div class="doc">
${await head(co, 'EMPLOYEE REPORT', 'FROM JOINING TILL DATE', [['Employee Code', e.empCode], ['Name', e.name], ['Status', e.status], ['Report date', dmy(new Date())]])}
<table class="kvt"><tbody><tr><td colspan="4" class="sec">Personal</td></tr>
  <tr><th>Name</th><td><b>${esc(e.name)}</b></td><th>Father / spouse</th><td>${esc(e.fatherName || '—')}</td></tr>
  <tr><th>Date of birth</th><td>${dmy(e.dob) || '—'}</td><th>Gender / marital / blood</th><td>${esc([e.gender, e.maritalStatus, e.bloodGroup].filter(Boolean).join(' / ') || '—')}</td></tr>
  <tr><th>Mobile</th><td>${esc([e.mobile, e.altMobile].filter(Boolean).join(' / ') || '—')}</td><th>Email</th><td>${esc(e.email || '—')}</td></tr>
  <tr><th>Current address</th><td>${nl(e.currentAddress || '—')}</td><th>Permanent address</th><td>${nl(e.permanentAddress || e.currentAddress || '—')}</td></tr>
  <tr><th>Emergency contact</th><td>${esc([e.emergencyName, e.emergencyMobile].filter(Boolean).join(' — ') || '—')}</td><th>Qualification / experience</th><td>${esc([e.qualification, e.experience].filter(Boolean).join(' / ') || '—')}</td></tr>
<tr><td colspan="4" class="sec">Employment</td></tr>
  <tr><th>Nature of employment</th><td><b>${esc(kindOf(e))}</b></td><th>Designation / department</th><td>${esc([e.designation, e.department].filter(Boolean).join(' / ') || '—')}</td></tr>
  <tr><th>Date of joining</th><td><b>${dmy(e.joiningDate) || '—'}</b></td><th>Service till date</th><td><b>${esc(serviceText(e.joiningDate, until) || '—')}</b>${e.leavingDate ? ` (left ${dmy(e.leavingDate)})` : ''}</td></tr>
  <tr><th>Probation / end date</th><td>${esc([e.probationMonths && `${e.probationMonths} months probation`, e.contractEndDate && `ends ${dmy(e.contractEndDate)}`].filter(Boolean).join(' · ') || '—')}</td><th>Notice / hours / weekly off</th><td>${esc([e.noticeDays && `${e.noticeDays} days`, e.workHours, e.weeklyOff].filter(Boolean).join(' · ') || '—')}</td></tr>
  <tr><th>Reporting to / location</th><td>${esc([e.reportingTo, e.workLocation].filter(Boolean).join(' / ') || '—')}</td><th>Agreement accepted on</th><td>${dmy(e.termsAcceptedOn) || '<span style="color:#B42318">Not yet</span>'}</td></tr>
  ${e.leavingReason ? `<tr><th>Leaving reason</th><td colspan="3">${esc(e.leavingReason)}</td></tr>` : ''}
<tr><td colspan="4" class="sec">Statutory, bank &amp; salary structure</td></tr>
  <tr><th>PAN / Aadhaar</th><td>${esc([e.pan, e.aadhaar].filter(Boolean).join(' / ') || '—')}</td><th>UAN / PF / ESIC</th><td>${esc([e.uan, e.pfNo, e.esicNo].filter(Boolean).join(' / ') || '—')}</td></tr>
  <tr><th>Bank</th><td>${esc([e.bankName, e.bankAccount, e.ifsc].filter(Boolean).join(' · ') || '—')}</td><th>Gross / month</th><td><b>₹ ${inr(g)}</b> (Basic ${inr(s.basic)} · HRA ${inr(s.hra)} · Conv. ${inr(s.conveyance)} · Special ${inr(s.special)} · Other ${inr(s.other)})</td></tr>
  <tr><th>Deductions</th><td colspan="3">${[s.pfApplicable && 'PF', s.esiApplicable && 'ESI', s.ptApplicable && 'PT', Number(s.tds) > 0 && `TDS ₹ ${inr(s.tds)}`].filter(Boolean).join(', ') || 'None'}</td></tr>
</tbody></table>
<table class="sm2"><colgroup><col style="width:28px"><col style="width:14%"><col><col style="width:20%"><col style="width:11%"><col style="width:11%"><col style="width:12%"></colgroup>
<thead><tr><th>Sl</th><th>Type</th><th>Company asset</th><th>Serial / SIM / No.</th><th>Issued</th><th>Returned</th><th>Status</th></tr></thead>
<tbody>${assets.length ? assets.map((a, i) => `<tr><td class="c">${i + 1}</td><td>${esc(a.assetType)}</td><td>${esc(a.assetName)}</td><td>${esc([a.serialNo, a.simNo, a.mobileNo].filter(Boolean).join(' · ') || '—')}</td><td class="c">${dmy(a.issuedOn)}</td><td class="c">${dmy(a.returnedOn) || '—'}</td><td class="c">${esc(a.status === 'issued' ? 'With employee' : a.status)}</td></tr>`).join('') : '<tr><td colspan="7" class="c">No company asset given</td></tr>'}</tbody></table>
${(e.salaryHistory || []).length ? `<table class="sm2"><thead><tr><th>Salary revision from</th><th>Gross before ₹</th><th>Gross after ₹</th><th>Change</th><th>Note</th></tr></thead><tbody>${e.salaryHistory.map(h => { const a = gross(h.from), b = gross(h.to); return `<tr><td class="c">${monthLabel(h.effectiveFrom)}</td><td class="r">${inr(a)}</td><td class="r"><b>${inr(b)}</b></td><td class="c">${a ? `${b >= a ? '+' : ''}${(Math.round((b - a) / a * 1000) / 10)}%` : ''}</td><td>${esc(h.note || '')}</td></tr>`; }).join('')}</tbody></table>` : ''}
<table class="sm2"><colgroup><col style="width:13%"><col style="width:5%"><col style="width:5%"><col style="width:5%"><col style="width:5%"><col style="width:5%"><col style="width:5%"><col style="width:6%"><col style="width:6%"><col style="width:9%"><col style="width:8%"><col style="width:9%"><col style="width:8%"><col></colgroup>
<thead><tr><th>Month</th><th>Days</th><th>P</th><th>A</th><th>HD</th><th>L</th><th>LWP</th><th>WO/H</th><th>Paid days</th><th>Gross ₹</th><th>Deduct. ₹</th><th>Net ₹</th><th>Paid on</th><th>Mode / Ref</th></tr></thead>
<tbody>${rows || '<tr><td colspan="14" class="c">No attendance or salary recorded yet</td></tr>'}
<tr class="tot"><td>Total</td><td></td><td class="c">${T.P}</td><td class="c">${T.A}</td><td class="c">${T.HD}</td><td class="c">${T.L}</td><td class="c">${T.LWP}</td><td class="c">${T.WOH}</td><td class="c">${T.paid}</td><td class="r">${inr(T.gross)}</td><td class="r">${inr(T.ded)}</td><td class="r">${inr(T.net)}</td><td colspan="2">Paid ₹ ${inr(T.netPaid)}${T.net - T.netPaid > 0.5 ? ` · pending ₹ ${inr(T.net - T.netPaid)}` : ''}</td></tr></tbody></table>
${jur(co)}
</div>
<div class="pby"><span>${brandLine(user)}</span><span>${esc(nowText())}</span></div>`));
}

/* ───────── Full & final settlement — two copies: OFFICE COPY (employee signs and returns it) and EMPLOYEE COPY ───────── */
export const fnfCalc = (e, f, assets) => {
  // per day = monthly salary ÷ days in the month of the last working day (the same rule as the payroll)
  const lw = String(f.lastWorkingDay || e?.leavingDate || new Date().toISOString().slice(0, 10)), mDays = new Date(+lw.slice(0, 4), +lw.slice(5, 7), 0).getDate() || 30;
  const g = gross(salaryFor(e, lw.slice(0, 7))), perDay = Math.round(g / mDays * 100) / 100, n = v => Number(v) || 0;   // salary as on the last working day
  const open = (assets || []).filter(a => ['issued', 'lost', 'damaged'].includes(a.status));
  const day = g / mDays;   // exact — amounts are rounded once, at the end
  const earn = [['Salary for days worked', n(f.salaryDays), n(f.salaryDays) * day], ['Leave encashment', n(f.leaveDays), n(f.leaveDays) * day],
    ['Bonus', null, n(f.bonus)], ['Gratuity', null, n(f.gratuity)], [f.otherEarningNote || 'Other earnings', null, n(f.otherEarning)]].filter(x => x[2] > 0);
  const ded = [['Notice period shortfall', n(f.noticeShortDays), n(f.noticeShortDays) * day], ['Advance / loan outstanding', null, n(f.advance)],
    ['Company assets not returned / damaged', null, n(f.assetRecovery)], ['TDS', null, n(f.tds)], [f.otherDeductionNote || 'Other deductions', null, n(f.otherDeduction)]].filter(x => x[2] > 0);
  const r = v => Math.round(v * 100) / 100;
  const te = r(earn.reduce((t, x) => t + x[2], 0)), td = r(ded.reduce((t, x) => t + x[2], 0));
  return { g, perDay, mDays, earn: earn.map(x => [x[0], x[1], r(x[2])]), ded: ded.map(x => [x[0], x[1], r(x[2])]), te, td, net: r(te - td), open };
};
export async function printFnf({ emp: e, fnf: f, assets, company, user }) {
  const co = company || {}, c = fnfCalc(e, f, assets), coName = esc(co.companyName || co.name);
  const hd = await head(co, 'FULL AND FINAL SETTLEMENT', 'SETTLEMENT OF DUES ON LEAVING THE COMPANY', [['Ref. No.', `HR/FNF/${e.empCode || e.id}`], ['Date', dmy(f.settlementDate || new Date())], ['Employee Code', e.empCode], ['Nature', kindOf(e)]]);
  const n = Math.max(c.earn.length, c.ded.length, 1);
  const line = i => `<tr class="it"><td>${c.earn[i] ? `${esc(c.earn[i][0])}${c.earn[i][1] != null ? ` (${c.earn[i][1]} days)` : ''}` : ''}</td><td class="r">${c.earn[i] ? inr(c.earn[i][2]) : ''}</td>
    <td>${c.ded[i] ? `${esc(c.ded[i][0])}${c.ded[i][1] != null ? ` (${c.ded[i][1]} days)` : ''}` : ''}</td><td class="r">${c.ded[i] ? inr(c.ded[i][2]) : ''}</td></tr>`;
  const pay = c.net >= 0;
  const copy = label => `<div class="doc">
${hd}
<table><tbody><tr><td class="sec" style="text-align:center; letter-spacing:1px">${label}</td></tr></tbody></table>
<table><colgroup><col style="width:22%"><col style="width:28%"><col style="width:22%"><col></colgroup><tbody>
  <tr><th>Employee</th><td><b>${esc(e.name)}</b></td><th>Designation / dept.</th><td>${esc([e.designation, e.department].filter(Boolean).join(' / ') || '—')}</td></tr>
  <tr><th>Date of joining</th><td>${dmy(e.joiningDate) || '—'}</td><th>Resignation / notice date</th><td>${dmy(f.resignationDate) || '—'}</td></tr>
  <tr><th>Last working day</th><td><b>${dmy(f.lastWorkingDay || e.leavingDate) || '—'}</b></td><th>Notice served</th><td>${f.noticeServedDays !== undefined && f.noticeServedDays !== '' ? `${esc(f.noticeServedDays)} of ${esc(e.noticeDays || '—')} days` : '—'}</td></tr>
  <tr><th>Gross salary / month</th><td>₹ ${inr(c.g)}</td><th>Per day (gross ÷ ${c.mDays} days)</th><td>₹ ${inr(c.perDay)}</td></tr>
  <tr><th>Reason for leaving</th><td colspan="3">${esc(e.leavingReason || '—')}</td></tr>
</tbody></table>
<table><colgroup><col><col style="width:18%"><col><col style="width:18%"></colgroup>
<thead><tr><th>Earnings / payable</th><th>Amount ₹</th><th>Deductions / recoverable</th><th>Amount ₹</th></tr></thead>
<tbody>${Array.from({ length: n }, (_, i) => line(i)).join('')}
<tr class="end" data-fill><td></td><td></td><td></td><td></td></tr>
<tr class="tot"><td>Total payable</td><td class="r">${inr(c.te)}</td><td>Total deductions</td><td class="r">${inr(c.td)}</td></tr>
<tr><td colspan="3" class="r net">${pay ? 'NET AMOUNT PAYABLE TO THE EMPLOYEE' : 'NET AMOUNT RECOVERABLE FROM THE EMPLOYEE'}</td><td class="r net">₹ ${inr(Math.abs(c.net))}</td></tr></tbody></table>
<table><tbody><tr><td><b>In words:</b> ${esc(inWords(Math.abs(c.net)))}${f.paidOn ? ` &nbsp;·&nbsp; <b>Paid on</b> ${dmy(f.paidOn)} ${esc([f.paidVia, f.paidRef].filter(Boolean).join(' '))}` : ''}</td></tr>
<tr><td><b>Company assets:</b> ${c.open.length ? c.open.map(a => `${esc(a.assetName)} (${a.status === 'issued' ? 'not returned' : esc(a.status)})`).join(', ') : 'All company assets returned.'}${f.notes ? `<br><b>Notes:</b> ${nl(f.notes)}` : ''}</td></tr></tbody></table>
<table><tbody><tr><td class="txt" style="font-size:8.6pt"><b>Declaration by the employee:</b> I, <b>${esc(e.name)}</b>, have received ₹ ${inr(pay ? c.net : 0)} in full and final settlement of all my dues from ${coName} towards salary, leave, bonus and all other benefits up to my last working day. I have returned all company property, documents and assets given to me. I have no further claim of any kind against the company, and I will keep the company's information confidential.</td></tr></tbody></table>
<table><colgroup><col style="width:50%"><col></colgroup><tbody><tr>
  <td class="sg"><b>Received &amp; accepted by the employee</b><div class="sp" style="height:13mm"></div><div class="tri"><span>Signature</span><span>${esc(e.name)}</span><span>Date: __________</span></div></td>
  <td class="sg"><b style="display:block; text-align:right">For ${coName}</b><div class="sp" style="height:13mm"></div><div class="tri"><span>Prepared (HR)</span><span>Checked (Accounts)</span><span>Authorised Signatory</span></div></td>
</tr></tbody></table>
${jur(co)}
</div>
<div class="pby"><span>${brandLine(user)}</span><span>${esc(nowText())}</span></div>`;
  printPage(page(`Full and Final ${e.empCode || ''} ${e.name || ''}`, CSS, `${copy('OFFICE COPY — TO BE SIGNED BY THE EMPLOYEE AND RETURNED TO THE COMPANY')}
<div class="pb"></div>
${copy('EMPLOYEE COPY')}`));
}

/* ───────── Salary revision letter (increment) ───────── */
export async function printRevisionLetter({ emp: e, rev, company, user }) {
  const co = company || {}, coName = esc(co.companyName || co.name);
  const lines = [['Basic', 'basic'], ['HRA', 'hra'], ['Conveyance', 'conveyance'], ['Special allowance', 'special'], ['Other allowance', 'other']]
    .filter(([, k]) => Number(rev.from?.[k]) || Number(rev.to?.[k]));
  const a = gross(rev.from), b = gross(rev.to), pct = a ? Math.round((b - a) / a * 1000) / 10 : 0;
  printPage(page(`Salary Revision ${e.empCode || ''} ${monthLabel(rev.effectiveFrom)}`, CSS, `<div class="doc">
${await head(co, 'SALARY REVISION LETTER', b >= a ? 'INCREMENT IN SALARY' : 'CHANGE IN SALARY', [['Ref. No.', `HR/REV/${e.empCode || e.id}/${rev.effectiveFrom}`], ['Date', dmy(rev.revisedOn || new Date())], ['Employee Code', e.empCode], ['Effective from', monthLabel(rev.effectiveFrom)]])}
<table><tbody><tr><td>${empBlock(e)}<div>Designation: <b>${esc(e.designation || '—')}</b>${e.department ? ` · ${esc(e.department)}` : ''}</div></td></tr></tbody></table>
<table><tbody><tr><td class="txt"><p>Dear ${esc(e.name)},</p>
<p>We are pleased to inform you that, in recognition of your performance and contribution, your salary has been revised with effect from <b>1 ${monthLabel(rev.effectiveFrom)}</b>. Your monthly gross salary is revised from <b>₹ ${inr(a)}</b> to <b>₹ ${inr(b)}</b>${a ? ` (${pct >= 0 ? 'an increase of' : 'a change of'} <b>${Math.abs(pct)}%</b>)` : ''}, as detailed below.</p>
${rev.note ? `<p>${nl(rev.note)}</p>` : ''}</td></tr></tbody></table>
<table><colgroup><col><col style="width:22%"><col style="width:22%"><col style="width:16%"></colgroup>
<thead><tr><th>Component (per month)</th><th>Before ₹</th><th>Revised ₹</th><th>Change ₹</th></tr></thead>
<tbody>${lines.map(([l, k]) => `<tr class="it"><td>${l}</td><td class="r">${inr(rev.from?.[k])}</td><td class="r"><b>${inr(rev.to?.[k])}</b></td><td class="r">${inr((Number(rev.to?.[k]) || 0) - (Number(rev.from?.[k]) || 0))}</td></tr>`).join('')}
<tr class="end" data-fill><td></td><td></td><td></td><td></td></tr>
<tr class="tot"><td>Gross salary per month</td><td class="r">${inr(a)}</td><td class="r">${inr(b)}</td><td class="r">${inr(b - a)}</td></tr>
<tr><td>Annual (CTC, approx.)</td><td class="r">${inr(a * 12)}</td><td class="r"><b>${inr(b * 12)}</b></td><td class="r">${inr((b - a) * 12)}</td></tr></tbody></table>
<table><tbody><tr><td class="txt" style="font-size:8.6pt">All other terms and conditions of your employment remain the same. The revised salary is confidential and is paid after statutory deductions as applicable. We look forward to your continued contribution.</td></tr></tbody></table>
<table><colgroup><col style="width:50%"><col></colgroup><tbody><tr>
  <td class="sg"><b>Received by the employee</b><div class="sp" style="height:13mm"></div><div class="tri"><span>Signature</span><span>${esc(e.name)}</span><span>Date: __________</span></div></td>
  <td class="sg"><b style="display:block; text-align:right">For ${coName}</b><div class="sp" style="height:13mm"></div><div class="tri"><span>HR</span><span></span><span>Authorised Signatory</span></div></td>
</tr></tbody></table>
${jur(co)}
</div>
<div class="pby"><span>${brandLine(user)}</span><span>${esc(nowText())}</span></div>`));
}

/* ───────── Joining form (blank to hand to a new joiner, or filled from an employee's record) ─────────
   The employee fills / checks it by hand and signs; HR enters it in the system and uploads the signed copy. */
const FORM_CSS = `
.doc > table > thead > tr > td { border:1px solid #000; padding:3px 6px; }
.fm td.k { width:20%; color:#222; white-space:nowrap; } .fm td { height:7.5mm; vertical-align:middle !important; }
.fm td.v { font-weight:bold; } .fm .tall td { height:13mm; vertical-align:top !important; }
.grid th { font-size:7.6pt; } .grid td { height:7mm; }
.photo { width:30mm; height:36mm; border:1px dashed #000; display:flex; align-items:center; justify-content:center; text-align:center; font-size:7.4pt; color:#444; margin-left:auto; }
.chk { columns:2; font-size:8.4pt; line-height:1.9; } .chk span { display:block; } .chk i { display:inline-block; width:10px; height:10px; border:1px solid #000; margin-right:6px; vertical-align:-1px; }
.decl { font-size:8.4pt; line-height:1.5; text-align:justify; }
.sg3 td { height:30mm; vertical-align:top !important; }
.sg3 .box { height:100%; display:flex; flex-direction:column; justify-content:space-between; }
.sg3 .row3 { display:flex; align-items:flex-end; gap:6px; } .sg3 .row3 b { flex:1 1 0; text-align:center; }`;
const fv = v => (v == null || String(v).trim() === '' ? '' : esc(v));
const rowKV = (pairs) => `<tr>${pairs.map(([k, v, span]) => `<td class="k">${k}</td><td class="v"${span ? ` colspan="${span}"` : ''}>${v || ''}</td>`).join('')}</tr>`;
const blankRows = (n, cols) => Array.from({ length: n }, () => `<tr>${Array.from({ length: cols }, () => '<td></td>').join('')}</tr>`).join('');

export async function printJoiningForm({ emp, company, user }) {
  const co = company || {}, e = emp || {};
  const coName = esc(co.companyName || co.name);
  const title = e.name ? `Joining Form ${e.empCode || ''} ${e.name}` : 'Joining Form (blank)';
  printPage(page(title, CSS + FORM_CSS, `<div class="doc">
${await head(co, 'EMPLOYEE JOINING FORM', 'TO BE FILLED IN BY THE EMPLOYEE IN CAPITAL LETTERS', [['Employee code', e.empCode || ' '], ['Date of joining', dmy(e.joiningDate) || ' '], ['Form date', dmy(new Date())]])}
<table class="fm"><colgroup><col style="width:20%"><col><col style="width:34mm"></colgroup><tbody>
  <tr><td class="sec" colspan="3">1. Personal details</td></tr>
  <tr><td class="k">Full name</td><td class="v">${fv(e.name)}</td><td rowspan="5" style="vertical-align:middle !important"><div class="photo">Paste recent<br>passport-size<br>photograph</div></td></tr>
  <tr><td class="k">Father's / husband's name</td><td class="v">${fv(e.fatherName)}</td></tr>
  <tr><td class="k">Date of birth</td><td class="v">${dmy(e.dob) || ''}</td></tr>
  <tr><td class="k">Gender / marital status</td><td class="v">${[fv(e.gender), fv(e.maritalStatus)].filter(Boolean).join(' / ')}</td></tr>
  <tr><td class="k">Blood group / nationality</td><td class="v">${[fv(e.bloodGroup), fv(e.nationality)].filter(Boolean).join(' / ')}</td></tr>
</tbody></table>
<table class="fm"><colgroup><col style="width:20%"><col style="width:30%"><col style="width:20%"><col></colgroup><tbody>
  <tr><td class="sec" colspan="4">2. Contact</td></tr>
  ${rowKV([['Mobile', fv(e.mobile)], ['Alternate mobile', fv(e.altMobile)]])}
  ${rowKV([['Personal e-mail', fv(e.email), 3]])}
  <tr class="tall"><td class="k">Present address</td><td class="v" colspan="3">${nl(e.currentAddress || '')}</td></tr>
  <tr class="tall"><td class="k">Permanent address</td><td class="v" colspan="3">${nl(e.permanentAddress || '')}</td></tr>
  <tr><td class="sec" colspan="4">3. Job (filled by HR)</td></tr>
  ${rowKV([['Designation', fv(e.designation)], ['Department', fv(e.department)]])}
  ${rowKV([['Nature of employment', fv(e.employmentType)], ['Reporting to', fv(e.reportingTo)]])}
  ${rowKV([['Work location', fv(e.workLocation)], ['Salary (gross / month)', e.salary ? inr(gross(e.salary)) : '']])}
  <tr><td class="sec" colspan="4">4. Identity &amp; statutory</td></tr>
  ${rowKV([['PAN', fv(e.pan)], ['Aadhaar', fv(e.aadhaar)]])}
  ${rowKV([['UAN', fv(e.uan)], ['PF No.', fv(e.pfNo)]])}
  ${rowKV([['ESIC No.', fv(e.esicNo)], ['Driving licence No.', fv(e.drivingLicence)]])}
  <tr><td class="sec" colspan="4">5. Bank account (for salary)</td></tr>
  ${rowKV([['Bank name', fv(e.bankName)], ['Branch', fv(e.bankBranch)]])}
  ${rowKV([['Account No.', fv(e.bankAccount)], ['IFSC', fv(e.ifsc)]])}
  ${rowKV([['Account holder', fv(e.accountHolder || e.name), 3]])}
</tbody></table>
<table class="grid"><colgroup><col style="width:28px"><col style="width:26%"><col><col style="width:12%"><col style="width:13%"></colgroup>
  <thead><tr><td class="sec" colspan="5">6. Education</td></tr><tr><th>Sl</th><th>Qualification</th><th>School / college / university</th><th>Year</th><th>% / grade</th></tr></thead>
  <tbody>${e.qualification ? `<tr><td class="c">1</td><td class="v"><b>${esc(e.qualification)}</b></td><td></td><td></td><td></td></tr>${blankRows(3, 5)}` : blankRows(4, 5)}</tbody></table>
<table class="grid"><colgroup><col style="width:28px"><col style="width:26%"><col style="width:18%"><col style="width:11%"><col style="width:11%"><col style="width:12%"><col></colgroup>
  <thead><tr><td class="sec" colspan="7">7. Previous employment (latest first)</td></tr><tr><th>Sl</th><th>Company</th><th>Designation</th><th>From</th><th>To</th><th>Last salary</th><th>Reason for leaving</th></tr></thead>
  <tbody>${blankRows(3, 7)}</tbody></table>
<table class="grid"><colgroup><col style="width:28px"><col style="width:32%"><col style="width:16%"><col style="width:16%"><col></colgroup>
  <thead><tr><td class="sec" colspan="5">8. Family / emergency contact &amp; nominee</td></tr><tr><th>Sl</th><th>Name</th><th>Relation</th><th>Mobile</th><th>Nominee? (PF / gratuity share %)</th></tr></thead>
  <tbody>${e.emergencyName ? `<tr><td class="c">1</td><td><b>${esc(e.emergencyName)}</b></td><td></td><td><b>${esc(e.emergencyMobile || '')}</b></td><td></td></tr>${blankRows(2, 5)}` : blankRows(3, 5)}</tbody></table>
<table><tbody><tr><td class="sec">9. Documents attached (tick)</td></tr>
  <tr><td><div class="chk"><span><i></i>Aadhaar card copy</span><span><i></i>PAN card copy</span><span><i></i>2 passport-size photographs</span><span><i></i>Education certificates</span>
    <span><i></i>Experience / relieving letter</span><span><i></i>Last 3 salary slips</span><span><i></i>Cancelled cheque / bank passbook</span><span><i></i>Address proof</span></div></td></tr>
  <tr><td class="sec">10. Declaration</td></tr>
  <tr><td class="decl">I declare that the information given above is true and complete. I will inform ${coName} in writing of any change in it. I understand that any false information
    may lead to the cancellation of my appointment. I agree to follow the rules, policies and code of conduct of the company.</td></tr></tbody></table>
<table class="sg3"><colgroup><col style="width:40%"><col></colgroup><tbody><tr>
  <td><div class="box"><b>Employee</b><div style="font-size:8pt">Place: ____________________ &nbsp; Date: ______________</div><b>Signature of the employee</b></div></td>
  <td><div class="box"><b style="text-align:right">For office use — ${coName}</b><div style="font-size:8pt">Employee code: __________ &nbsp; Entered in the system on: ______________</div>
    <div class="row3"><b>Prepared By</b><b>Verified By</b><b>Authorised Signatory</b></div></div></td>
</tr></tbody></table>
${jur(co)}
</div>
<div class="pby"><span>${brandLine(user)}</span><span>${esc(nowText())}</span></div>`));
}

/* ───────── Asset issue form (blank, filled by hand when assets are given; entered in the system afterwards) ───────── */
export async function printAssetIssueForm({ emp, settings, company, user }) {
  const co = company || {}, e = emp || {};
  const coName = esc(co.companyName || co.name);
  printPage(page(e.name ? `Asset Issue Form ${e.empCode || ''} ${e.name}` : 'Asset Issue Form (blank)', CSS + FORM_CSS, `<div class="doc">
${await head(co, 'ASSET ISSUE FORM', 'COMPANY ASSETS GIVEN TO THE EMPLOYEE FOR OFFICIAL USE', [['Form No.', ' '], ['Date', e.name ? dmy(new Date()) : ' ']])}
<table class="fm"><colgroup><col style="width:20%"><col style="width:30%"><col style="width:20%"><col></colgroup><tbody>
  <tr><td class="sec" colspan="4">Employee</td></tr>
  ${rowKV([['Name', fv(e.name)], ['Employee code', fv(e.empCode)]])}
  ${rowKV([['Designation', fv(e.designation)], ['Department', fv(e.department)]])}
  ${rowKV([['Mobile', fv(e.mobile)], ['Purpose / site', '']])}
</tbody></table>
<table class="grid"><colgroup><col style="width:28px"><col style="width:13%"><col style="width:21%"><col style="width:20%"><col style="width:17%"><col style="width:10%"><col></colgroup>
  <thead><tr><td class="sec" colspan="7">Assets issued</td></tr><tr><th>Sl</th><th>Type</th><th>Asset / make &amp; model</th><th>Serial / IMEI / SIM / Reg. No.</th><th>Accessories</th><th>Condition</th><th>Value ₹</th></tr></thead>
  <tbody>${blankRows(7, 7)}<tr class="tot"><td colspan="6" class="r">Total value</td><td></td></tr></tbody></table>
<table><tbody><tr><td class="sec">Terms of use</td></tr><tr><td class="txt">${settings?.assetTerms ? terms(settings.assetTerms) : `<ol class="tc">
  <li>The asset(s) are company property and are given only for official work.</li><li>I will keep them safe and in good condition and will not lend them to anyone.</li>
  <li>Loss or damage due to negligence will be recovered from me at the value shown above.</li><li>I will return all asset(s) with accessories when asked, on transfer, or on leaving the company — before my full &amp; final settlement.</li></ol>`}</td></tr></tbody></table>
<table class="sg3"><colgroup><col style="width:40%"><col></colgroup><tbody><tr>
  <td><div class="box"><b>Received by the employee</b><div style="font-size:8pt">I have received the above asset(s) in the stated condition and agree to the terms of use.<br>Date: ______________</div><b>Signature of the employee</b></div></td>
  <td><div class="box"><b style="text-align:right">Issued by, for ${coName}</b><div style="font-size:8pt">Entered in the system on: ______________</div>
    <div class="row3"><b>Prepared By</b><b>Verified By</b><b>Authorised Signatory</b></div></div></td>
</tr></tbody></table>
<table class="grid"><colgroup><col style="width:28px"><col style="width:30%"><col style="width:15%"><col style="width:20%"><col></colgroup>
  <thead><tr><td class="sec" colspan="5">Return of assets (filled when returned)</td></tr><tr><th>Sl</th><th>Asset</th><th>Returned on</th><th>Condition</th><th>Received by (name &amp; signature)</th></tr></thead>
  <tbody>${blankRows(3, 5)}</tbody></table>
${jur(co)}
</div>
<div class="pby"><span>${brandLine(user)}</span><span>${esc(nowText())}</span></div>`));
}

/* ───────── Employee ID card: 54 × 86 mm (CR80, vertical), front + back side by side, cut along the dotted lines ───────── */
const ID_CSS = `
body { font-family:Arial, Helvetica, sans-serif; }
.idrow { display:flex; gap:10mm; justify-content:center; margin:0 0 8mm; break-inside:avoid; page-break-inside:avoid; }
.idc { width:54mm; height:85.6mm; border:0.3mm dashed #888; border-radius:3mm; overflow:hidden; position:relative; display:flex; flex-direction:column; background:#fff; color:#000; }
.idc .bar { height:2.4mm; background:#03444f; flex-shrink:0; } .idc .bar.b { margin-top:auto; }
.idc .top { display:flex; align-items:center; gap:2mm; padding:2mm 2.5mm 1.5mm; border-bottom:0.25mm solid #000; }
.idc .top img { width:9mm; height:9mm; object-fit:contain; flex-shrink:0; }
.idc .top .cn { font-size:7.6pt; font-weight:bold; line-height:1.15; }
.idc .tt { text-align:center; font-size:6.4pt; font-weight:bold; letter-spacing:1.4px; padding:1.2mm 0 0; }
.idc .ph { width:22mm; height:26mm; margin:1.6mm auto 1.4mm; border:0.3mm solid #000; display:flex; align-items:center; justify-content:center; font-size:6pt; color:#555; text-align:center; overflow:hidden; }
.idc .ph img { width:100%; height:100%; object-fit:cover; }
.idc .nm { text-align:center; font-size:9.6pt; font-weight:bold; line-height:1.1; padding:0 2mm; }
.idc .ds { text-align:center; font-size:7pt; margin-top:0.6mm; padding:0 2mm; }
.idc table.kv2 { width:calc(100% - 5mm); margin:1.6mm 2.5mm 0; border-collapse:collapse; font-size:6.6pt; }
.idc table.kv2 td { padding:0.35mm 0; vertical-align:top; border:0 !important; } .idc table.kv2 td:first-child { width:42%; color:#333; } .idc table.kv2 td:last-child { font-weight:bold; }
.idc .sg { margin-top:auto; padding:0 2.5mm 1.2mm; text-align:right; font-size:6.4pt; font-weight:bold; }
.idc .sg span { display:inline-block; text-align:center; min-width:22mm; }
.idc .sg .esig-i { height:7mm !important; margin:0 !important; } .idc .sg .esig-i img { max-height:7mm !important; }
.idc .sg .esig-n { font-size:5.6pt !important; min-height:0 !important; margin:0 !important; } .idc .sg .esig-d { display:none !important; }
.idc .bk { padding:2.5mm; font-size:6.6pt; line-height:1.35; display:flex; flex-direction:column; gap:1.6mm; flex:1; }
.idc .bk h4 { margin:0; font-size:6.4pt; letter-spacing:1px; border-bottom:0.25mm solid #000; padding-bottom:0.6mm; }
.idc .bk .qr { display:flex; justify-content:center; } .idc .bk .qr img { width:19mm; height:19mm; }
.idc .bk .ft { margin-top:auto; font-size:6pt; text-align:center; border-top:0.25mm solid #000; padding-top:1mm; }
.idhint { font-size:8pt; color:#444; text-align:center; margin-bottom:5mm; }
@media print { .idhint { display:none; } }`;

async function fileDataUrl(emp, f, companyId) {
  try {
    const b = (await axios.get(`/api/hr/employees/${emp.id}/file/${encodeURIComponent(f.fileName)}`, { params: { companyId }, responseType: 'blob' })).data;
    return await new Promise(res => { const rd = new FileReader(); rd.onload = () => res(rd.result); rd.onerror = () => res(''); rd.readAsDataURL(b); });
  } catch { return ''; }
}
/* the employee's photo: the latest file uploaded as "Photo — …" (an image) */
export const photoFileOf = e => [...(e?.files || [])].reverse().find(f => /^photo\b/i.test(String(f.name || '')) && /\.(jpe?g|png|webp|gif)$/i.test(String(f.fileName || f.name || '')));

export async function printIdCards({ emps, company, user }) {
  const co = company || {}, list = (Array.isArray(emps) ? emps : [emps]).filter(Boolean);
  const companyId = co.companyId;
  const logo = await logoOf(co);
  const QRCode = (await import('qrcode')).default;
  const issued = new Date(), valid = new Date(issued); valid.setFullYear(valid.getFullYear() + 1); valid.setDate(valid.getDate() - 1);
  const coAddr = esc([co.address, co.city, [co.state, co.pincode].filter(Boolean).join(' - ')].filter(Boolean).join(', '));
  const cards = await Promise.all(list.map(async e => {
    const pf = photoFileOf(e);
    const photo = pf ? await fileDataUrl(e, pf, companyId) : '';
    const qr = await QRCode.toDataURL(`${e.empCode || ''} | ${e.name || ''} | ${co.companyName || ''}`, { margin: 0, width: 220 }).catch(() => '');
    return `<div class="idrow">
  <div class="idc">
    <div class="bar"></div>
    <div class="top">${logo ? `<img src="${logo}" alt="">` : ''}<div class="cn">${esc(co.companyName || co.name || '')}</div></div>
    <div class="tt">EMPLOYEE ID CARD</div>
    <div class="ph">${photo ? `<img src="${photo}" alt="">` : 'Paste<br>photograph'}</div>
    <div class="nm">${esc(e.name || '')}</div>
    <div class="ds">${esc(e.designation || '')}</div>
    <table class="kv2">
      <tr><td>Employee code</td><td>${esc(e.empCode || '')}</td></tr>
      <tr><td>Department</td><td>${esc(e.department || '')}</td></tr>
      <tr><td>Blood group</td><td>${esc(e.bloodGroup || '')}</td></tr>
      <tr><td>Date of joining</td><td>${dmy(e.joiningDate)}</td></tr>
    </table>
    <div class="sg"><span>Authorised Signatory</span></div>
    <div class="bar b"></div>
  </div>
  <div class="idc">
    <div class="bar"></div>
    <div class="bk">
      <h4>EMERGENCY CONTACT</h4>
      <div><b>${esc(e.emergencyName || '________________')}</b><br>Ph: <b>${esc(e.emergencyMobile || '________________')}</b></div>
      <div>Employee mobile: <b>${esc(e.mobile || '')}</b></div>
      <div>Issued: <b>${dmy(issued)}</b> &nbsp; Valid till: <b>${dmy(valid)}</b></div>
      ${qr ? `<div class="qr"><img src="${qr}" alt=""></div>` : ''}
      <h4>IF FOUND, PLEASE RETURN TO</h4>
      <div><b>${esc(co.companyName || co.name || '')}</b><br>${coAddr}${co.phone ? `<br>Ph: ${esc(co.phone)}` : ''}</div>
      <div class="ft">This card is the property of the company and must be returned on leaving.</div>
    </div>
    <div class="bar b"></div>
  </div>
</div>`;
  }));
  const pages = [];
  for (let i = 0; i < cards.length; i += 3) pages.push(cards.slice(i, i + 3).join(''));
  printPage(page(list.length === 1 ? `ID Card ${list[0].empCode || ''} ${list[0].name || ''}` : `ID Cards (${list.length} employees)`, ID_CSS,
    `<div class="idhint">Front and back of each card side by side — print on card paper (or print, laminate), cut along the dotted lines and fold / stick back to back.</div>
${pages.join('<div class="pb"></div>')}`));
}
