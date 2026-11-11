/* Beta — HR → Payroll (/api/hr/salary, the same monthly sheet as the classic Salary page).
 * Salary = monthly salary ÷ days in the month × paid days (paid days from Attendance);
 * PF 12% of basic (capped ₹15,000), ESI 0.75% when gross ≤ ₹21,000, PT ₹200 when gross ≥ ₹12,000 — the server works it the same way on save.
 * Enter bonus, TDS, advance, other deductions and the payment; Save; Payslip, Salary register, Bank transfer list. */
import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { useCompany } from '../../context/CompanyContext';
import { useAuth } from '../../context/AuthContext';
import { Svg } from '../../components/ui/Icon';
import { CSS as SALES_CSS } from './BetaSales';
import { printDepList, dmy } from './BetaCertPrint';
import { ACC_CSS, amt, r2, today } from './BetaAccKit';
import { hrCan, tally, thisMonth, daysIn, loadEmployees, grossOf, salaryFor } from './BetaHRKit';
import { printPayslip, monthLabel } from './BetaHRPrint';

const yes = v => v === true || v === 'true' || v === 'Yes';
/* the same working as the server (api/hr.js calcRow) */
function calc(emp, row, days, month) {
  const s = salaryFor(emp, month),   // the structure that applies in this month (salary revisions)
    paidDays = Math.max(0, Math.min(days, parseFloat(row.paidDays) || 0)), f = days ? paidDays / days : 0;
  const e = k => r2((Number(s[k]) || 0) * f);
  const earn = { basic: e('basic'), hra: e('hra'), conveyance: e('conveyance'), special: e('special'), other: e('other') };
  const bonus = r2(row.bonus), gross = r2(Object.values(earn).reduce((t, v) => t + v, 0) + bonus);
  const pf = yes(s.pfApplicable) ? r2(Math.min(earn.basic, 15000 * f) * 0.12) : 0;
  const esi = yes(s.esiApplicable) && gross <= 21000 ? Math.ceil(gross * 0.0075) : 0;
  const pt = yes(s.ptApplicable) ? (gross >= 12000 ? 200 : 0) : 0;
  const deductions = r2(pf + esi + pt + r2(row.tds) + r2(row.advance) + r2(row.otherDed));
  return { ...row, ...earn, bonus, gross, pf, esi, pt, deductions, net: r2(gross - deductions) };
}
const CSS = `
.py-wrap { flex:1; min-height:0; overflow:auto; background:#fff; }
.py { border-collapse:collapse; font-size:11.5px; min-width:100%; }
.py th { position:sticky; top:0; z-index:2; background:#D4EBEE; font-size:10.5px; font-weight:700; padding:6px 5px; border-bottom:1px solid #A9CDD2; white-space:nowrap; text-align:right; }
.py th.l, .py td.l { text-align:left; } .py td { padding:3px 5px; border-bottom:1px solid #EDF2F3; text-align:right; white-space:nowrap; }
.py td input { width:72px; height:26px; border:1px solid #C9D7DA; border-radius:4px; padding:0 5px; font:12px Inter, Arial, sans-serif; text-align:right; box-sizing:border-box; background:#fff; }
.py td input[type=date] { width:118px; text-align:left; } .py td input.t { width:110px; text-align:left; }
.py td select { height:26px; border:1px solid #C9D7DA; border-radius:4px; font:12px Inter, Arial, sans-serif; }
.py tr.sel td { background:#D4EBEE !important; } .py tbody tr:hover td { background:#F0F7F8; }
.py tfoot td { position:sticky; bottom:0; background:#F4F8F8; font-weight:800; border-top:2px solid #A9CDD2; }
.py td.net { font-weight:800; color:#03444f; } .py td.att { color:#067647; font-size:10px; }`;

export default function BetaHRPayroll() {
  const { selectedCompany } = useCompany() || {};
  const { user } = useAuth() || {};
  const companyId = selectedCompany?.companyId;
  const [month, setMonth] = useState(thisMonth());
  const [emps, setEmps] = useState([]);
  const [rows, setRows] = useState(null);
  const [att, setAtt] = useState({});
  const [savedAt, setSavedAt] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [selId, setSelId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(null);
  const canEdit = hrCan(user, 'edit');
  const days = daysIn(month);
  useEffect(() => { if (companyId) loadEmployees(companyId).then(setEmps).catch(() => setEmps([])); }, [companyId]);
  useEffect(() => {
    if (!companyId) return;
    setRows(null);
    Promise.all([axios.get('/api/hr/salary', { params: { companyId, month } }), axios.get('/api/hr/attendance', { params: { companyId, month } }).catch(() => ({ data: {} }))]).then(([s, a]) => {
      const marks = a.data?.marks || {};
      const tallies = Object.fromEntries(Object.entries(marks).filter(([, r]) => Object.keys(r || {}).length).map(([id, r]) => [id, tally(r, days)]));
      setAtt(tallies);
      let list = (s.data?.rows || []).map(r => ({ ...r }));
      const fresh = !s.data?.savedAt;
      if (fresh) list = list.map(r => (tallies[String(r.employeeId)] ? { ...r, paidDays: tallies[String(r.employeeId)].paid } : r));   // a new month: paid days from attendance
      setRows(list); setSavedAt(s.data?.savedAt || null); setDirty(fresh && Object.keys(tallies).length > 0);
      setNote(fresh && Object.keys(tallies).length ? { ok: true, t: `Paid days are taken from the ${monthLabel(month)} attendance. Check, then Save.` } : null);
    }).catch(e => { setRows([]); setNote({ ok: false, t: e.response?.data?.error || 'Could not load the salary sheet.' }); });
  }, [companyId, month, days]);
  const empOf = r => emps.find(e => String(e.id) === String(r.employeeId));
  const view = useMemo(() => (rows || []).map(r => calc(empOf(r), r, days, month)), [rows, emps, days, month]);   // eslint-disable-line react-hooks/exhaustive-deps
  if (!hrCan(user, 'view')) return <div className="sb"><style>{SALES_CSS}</style><div className="sb-empty" style={{ padding: 30 }}>You are not authorized to see HR.</div></div>;
  const setCell = (id, k, x) => { setRows(rs => rs.map(r => (String(r.employeeId) === String(id) ? { ...r, [k]: x } : r))); setDirty(true); setNote(null); };
  const fromAtt = () => { setRows(rs => rs.map(r => (att[String(r.employeeId)] ? { ...r, paidDays: att[String(r.employeeId)].paid } : r))); setDirty(true); setNote({ ok: true, t: `Paid days updated from attendance for ${Object.keys(att).length} employee(s).` }); };
  const markPaid = () => { setRows(rs => rs.map(r => (r.paidOn ? r : { ...r, paidOn: today(), paidVia: r.paidVia || 'NEFT' }))); setDirty(true); };
  const tot = k => r2(view.reduce((t, r) => t + (Number(r[k]) || 0), 0));
  const save = async () => {
    setBusy(true);
    try {
      const body = { companyId, rows: (rows || []).map(r => ({ employeeId: r.employeeId, ...Object.fromEntries(['paidDays', 'bonus', 'tds', 'advance', 'otherDed', 'paidOn', 'paidVia', 'paidRef', 'remark'].map(k => [k, r[k] ?? ''])) })) };
      const r = await axios.post(`/api/hr/salary/${month}`, body, { params: { companyId } });
      setRows(r.data?.sheet?.rows || rows); setSavedAt(r.data?.sheet?.savedAt); setDirty(false); setNote({ ok: true, t: `Salary sheet for ${monthLabel(month)} saved — net ₹ ${amt(tot('net'))}.` });
    } catch (e) { setNote({ ok: false, t: e.response?.data?.error || 'Could not save the salary sheet.' }); }
    finally { setBusy(false); }
  };
  const sel = view.find(r => String(r.employeeId) === String(selId)) || null;
  const attText = r => { const t = att[String(r.employeeId)]; return t ? `P ${t.P + t.HD / 2} · A ${t.A} · L ${t.L} · LWP ${t.LWP} · WO/H ${t.WO + t.H}` : ''; };
  const register = () => printDepList({ title: `SALARY REGISTER — ${monthLabel(month).toUpperCase()}`, company: selectedCompany, user, filter: `${view.length} employees`, total: tot('net'),
    heads: ['Code', 'Name', 'Days', 'Paid', 'Basic', 'HRA', 'Conv.', 'Special', 'Other', 'Bonus', 'Gross', 'PF', 'ESI', 'PT', 'TDS', 'Advance', 'Other ded.', 'Net ₹', 'Paid on'],
    rows: [...view.map(r => [r.empCode, r.name, String(r.days || days), String(r.paidDays), amt(r.basic), amt(r.hra), amt(r.conveyance), amt(r.special), amt(r.other), amt(r.bonus), amt(r.gross), amt(r.pf), amt(r.esi), amt(r.pt), amt(r.tds), amt(r.advance), amt(r.otherDed), amt(r.net), dmy(r.paidOn)]),
      ['', 'TOTAL', '', '', amt(tot('basic')), amt(tot('hra')), amt(tot('conveyance')), amt(tot('special')), amt(tot('other')), amt(tot('bonus')), amt(tot('gross')), amt(tot('pf')), amt(tot('esi')), amt(tot('pt')), amt(tot('tds')), amt(tot('advance')), amt(tot('otherDed')), amt(tot('net')), '']] });
  const bankList = () => printDepList({ title: `SALARY BANK TRANSFER — ${monthLabel(month).toUpperCase()}`, company: selectedCompany, user, filter: 'Net pay', total: tot('net'),
    heads: ['Code', 'Employee', 'Bank', 'Account No.', 'IFSC', 'Net pay ₹', 'Paid on', 'Ref / UTR'],
    rows: view.filter(r => r.net > 0).map(r => [r.empCode, r.name, r.bankName, r.bankAccount, r.ifsc, amt(r.net), dmy(r.paidOn), r.paidRef]) });
  const n = k => (r => <input inputMode="decimal" value={r[k] ?? ''} onChange={e => setCell(r.employeeId, k, e.target.value.replace(/[^\d.]/g, ''))} disabled={!canEdit} aria-label={`${k} ${r.name}`} />);
  return (
    <div className="sb">
      <style>{SALES_CSS + ACC_CSS + CSS}</style>
      <div className="sb-tabs" role="tablist">
        <button type="button" role="tab" aria-selected="true" className="sb-tab on">Payroll {view.length > 0 && <span className="n">{view.length}</span>}</button>
        <div className="sb-slot" style={{ display: 'flex', alignItems: 'stretch' }}>
          <input type="month" className="sb-search" value={month} onChange={e => { if (dirty && !window.confirm('Unsaved changes will be lost. Continue?')) return; setMonth(e.target.value || thisMonth()); }} style={{ width: 150 }} aria-label="Month" />
          {canEdit && <button type="button" className="sb-tbtn" disabled={!Object.keys(att).length} onClick={fromAtt} title="Paid days from this month's attendance"><Svg name="clock" size={13} />Days from attendance</button>}
          {canEdit && <button type="button" className="sb-tbtn" onClick={markPaid} title="Paid on = today for rows not yet paid"><Svg name="check" size={13} />Mark paid today</button>}
          <button type="button" className="sb-tbtn" onClick={register}><Svg name="file" size={13} />Salary register</button>
          <button type="button" className="sb-tbtn" onClick={bankList}><Svg name="file" size={13} />Bank list</button>
          <div className="sb-tools">
            <span className="sb-picked">{sel ? <b>{sel.name}</b> : dirty ? <b style={{ color: '#B54708' }}>Unsaved changes</b> : savedAt ? `Saved ${new Date(savedAt).toLocaleDateString('en-IN')}` : 'Not saved yet'}</span>
            <button type="button" className="sb-tbtn" disabled={!sel} onClick={() => printPayslip({ row: sel, month, emp: empOf(sel), company: selectedCompany, user, att: attText(sel) })}><Svg name="file" size={13} />Payslip</button>
            {canEdit && <button type="button" className="sb-tbtn" style={{ background: '#03444f', color: '#fff' }} disabled={busy || !dirty} onClick={save}>{busy ? 'Saving…' : 'Save sheet'}</button>}
          </div>
        </div>
      </div>
      <div className="ac-sum">
        <div>Employees<b>{view.length}</b></div><div>Gross ₹<b>{amt(tot('gross'))}</b></div><div>Deductions ₹<b>{amt(tot('deductions'))}</b></div>
        <div>Net pay ₹<b>{amt(tot('net'))}</b></div><div>PF / ESI / PT ₹<b>{amt(tot('pf'))} / {amt(tot('esi'))} / {amt(tot('pt'))}</b></div>
        <div>Paid<b style={{ color: '#067647' }}>{view.filter(r => r.paidOn).length} of {view.length}</b></div>
      </div>
      {note && <div className={`sf-msg ${note.ok ? 'ok' : 'err'}`} role="status" style={{ margin: 0, borderRadius: 0 }}>{note.t}</div>}
      <div className="py-wrap">
        {rows === null ? <div className="sb-empty">Loading…</div> : !view.length ? <div className="sb-empty">No employee on the rolls in {monthLabel(month)}.</div> : (
          <table className="py">
            <thead><tr><th className="l">Code</th><th className="l">Employee</th><th>Days</th><th title="Monthly gross ÷ days in the month">Per day</th><th>Paid days</th><th>Basic</th><th>HRA</th><th>Conv.</th><th>Special</th><th>Other</th><th>Bonus</th><th>Gross</th>
              <th>PF</th><th>ESI</th><th>PT</th><th>TDS</th><th>Advance</th><th>Other ded.</th><th>Net pay</th><th className="l">Paid on</th><th className="l">Via</th><th className="l">Ref / UTR</th></tr></thead>
            <tbody>{view.map(r => (
              <tr key={r.employeeId} className={String(selId) === String(r.employeeId) ? 'sel' : ''} onClick={() => setSelId(r.employeeId)}>
                <td className="l mono"><b>{r.empCode}</b></td><td className="l"><b>{r.name}</b><div className="att">{attText(r) || <span style={{ color: '#98A2B3' }}>no attendance</span>}</div></td>
                <td>{r.days || days}</td><td>{amt(grossOf(salaryFor(empOf(r), month)) / (r.days || days))}{(empOf(r)?.salaryHistory || []).some(h => h.effectiveFrom === month) && <div style={{ fontSize: 9.5, color: '#067647', fontWeight: 700 }}>revised</div>}</td><td>{n('paidDays')(r)}</td>
                <td>{amt(r.basic)}</td><td>{amt(r.hra)}</td><td>{amt(r.conveyance)}</td><td>{amt(r.special)}</td><td>{amt(r.other)}</td><td>{n('bonus')(r)}</td><td><b>{amt(r.gross)}</b></td>
                <td>{amt(r.pf)}</td><td>{amt(r.esi)}</td><td>{amt(r.pt)}</td><td>{n('tds')(r)}</td><td>{n('advance')(r)}</td><td>{n('otherDed')(r)}</td><td className="net">{amt(r.net)}</td>
                <td className="l"><input type="date" value={r.paidOn || ''} onChange={e => setCell(r.employeeId, 'paidOn', e.target.value)} disabled={!canEdit} aria-label={`Paid on ${r.name}`} /></td>
                <td className="l"><select value={r.paidVia || ''} onChange={e => setCell(r.employeeId, 'paidVia', e.target.value)} disabled={!canEdit} aria-label={`Paid via ${r.name}`}><option value="">—</option>{['NEFT', 'RTGS', 'IMPS', 'Cheque', 'Cash', 'UPI'].map(m => <option key={m}>{m}</option>)}</select></td>
                <td className="l"><input className="t" value={r.paidRef || ''} onChange={e => setCell(r.employeeId, 'paidRef', e.target.value)} disabled={!canEdit} aria-label={`Reference ${r.name}`} /></td>
              </tr>))}</tbody>
            <tfoot><tr><td className="l" /><td className="l">Total</td><td /><td /><td /><td>{amt(tot('basic'))}</td><td>{amt(tot('hra'))}</td><td>{amt(tot('conveyance'))}</td><td>{amt(tot('special'))}</td><td>{amt(tot('other'))}</td><td>{amt(tot('bonus'))}</td><td>{amt(tot('gross'))}</td>
              <td>{amt(tot('pf'))}</td><td>{amt(tot('esi'))}</td><td>{amt(tot('pt'))}</td><td>{amt(tot('tds'))}</td><td>{amt(tot('advance'))}</td><td>{amt(tot('otherDed'))}</td><td className="net">{amt(tot('net'))}</td><td className="l" colSpan={3} /></tr></tfoot>
          </table>)}
      </div>
    </div>
  );
}
