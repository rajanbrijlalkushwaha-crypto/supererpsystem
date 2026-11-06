/* HR › Salary — the monthly salary sheet. Earnings come from each employee's salary structure,
 * pro-rated by paid days; PF / ESI / PT are worked out; you enter paid days, bonus, TDS, advance,
 * other deductions and when it was paid. Save keeps the month; Payslip prints one employee's slip.
 * (The server works the figures out the same way on save — it is the one that is stored.) */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import { useCompany } from '../../context/CompanyContext';
import { F, money, fmtD } from '../tallyrecon/reconUi';

const thisMonth = new Date().toISOString().slice(0, 7);
const r2 = n => Math.round((parseFloat(n) || 0) * 100) / 100;
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const monthLabel = m => { const [y, mo] = m.split('-'); return new Date(+y, +mo - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }); };
const EDIT = ['paidDays', 'bonus', 'tds', 'advance', 'otherDed'];

/* the same working as the server: row from the saved figures + what you changed */
function recalc(row, base) {
  const days = row.days, paidDays = Math.max(0, Math.min(days, parseFloat(row.paidDays) || 0)), f = days ? paidDays / days : 0;
  const full = base[row.employeeId] || {};   // full-month earnings (from the first load)
  const e = k => r2((full[k] || 0) * f);
  const earn = { basic: e('basic'), hra: e('hra'), conveyance: e('conveyance'), special: e('special'), other: e('other') };
  const bonus = r2(row.bonus), gross = r2(Object.values(earn).reduce((t, v) => t + v, 0) + bonus);
  const pf = full.pfOn ? r2(Math.min(earn.basic, 15000 * f) * 0.12) : 0;
  const esi = full.esiOn && gross <= 21000 ? Math.ceil(gross * 0.0075) : 0;
  const pt = full.ptOn ? (gross >= 12000 ? 200 : 0) : 0;
  const deductions = r2(pf + esi + pt + r2(row.tds) + r2(row.advance) + r2(row.otherDed));
  return { ...row, ...earn, bonus, gross, pf, esi, pt, deductions, net: r2(gross - deductions) };
}

export default function Salary() {
  const { selectedCompany } = useCompany();
  const cid = selectedCompany?.companyId;
  const [month, setMonth] = useState(thisMonth);
  const [rows, setRows] = useState([]);
  const [base, setBase] = useState({});
  const [savedAt, setSavedAt] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    if (!cid) return;
    setLoading(true); setErr(''); setMsg('');
    try {
      const r = await axios.get('/api/hr/salary', { params: { companyId: cid, month } });
      if (!r.data || !Array.isArray(r.data.rows)) throw new Error('The ERP server needs a restart (node server.js) for HR.');
      // full-month figures per employee, so paid-day changes can be worked out on the page
      const emps = (await axios.get('/api/hr/employees', { params: { companyId: cid } })).data || [];
      const yes = v => v === true || v === 'true';
      setBase(Object.fromEntries(emps.map(e => [e.id, { basic: +e.salary?.basic || 0, hra: +e.salary?.hra || 0, conveyance: +e.salary?.conveyance || 0, special: +e.salary?.special || 0, other: +e.salary?.other || 0,
        pfOn: yes(e.salary?.pfApplicable), esiOn: yes(e.salary?.esiApplicable), ptOn: yes(e.salary?.ptApplicable) }])));
      setRows(r.data.rows); setSavedAt(r.data.savedAt); setDirty(false);
    } catch (e) { setErr(e.response?.data?.error || e.message); }
    setLoading(false);
  }, [cid, month]);
  useEffect(() => { load(); }, [load]);

  const change = (id, k, v) => { setRows(rs => rs.map(r => (r.employeeId === id ? (EDIT.includes(k) ? recalc({ ...r, [k]: v }, base) : { ...r, [k]: v }) : r))); setDirty(true); };
  const save = async () => {
    setBusy(true); setErr(''); setMsg('');
    try {
      const body = { rows: rows.map(r => ({ employeeId: r.employeeId, paidDays: r.paidDays, bonus: r.bonus, tds: r.tds, advance: r.advance, otherDed: r.otherDed, paidOn: r.paidOn, paidVia: r.paidVia, paidRef: r.paidRef, remark: r.remark })) };
      const r = await axios.post(`/api/hr/salary/${month}`, body, { params: { companyId: cid } });
      setRows(r.data.sheet.rows); setSavedAt(r.data.sheet.savedAt); setDirty(false); setMsg(`Salary sheet for ${monthLabel(month)} saved.`);
    } catch (e) { setErr(e.response?.data?.error || e.message); }
    setBusy(false);
  };
  const markAllPaid = () => { const d = new Date().toISOString().slice(0, 10); setRows(rs => rs.map(r => (r.paidOn ? r : { ...r, paidOn: d }))); setDirty(true); };

  const T = useMemo(() => ['gross', 'pf', 'esi', 'pt', 'tds', 'advance', 'otherDed', 'deductions', 'net'].reduce((o, k) => ({ ...o, [k]: r2(rows.reduce((t, r) => t + (parseFloat(r[k]) || 0), 0)) }), {}), [rows]);
  const company = selectedCompany?.companyName || '';

  const printSheet = () => {
    const w = window.open('', '_blank'); if (!w) return;
    w.document.write(`<html><head><title>Salary Sheet — ${monthLabel(month)}</title><style>body{font-family:Inter,Arial,sans-serif;font-size:10.5px;margin:16px} h2{margin:0;font-size:15px} .s{color:#667085;margin:2px 0 10px}
      table{width:100%;border-collapse:collapse} th,td{border:1px solid #D0D5DD;padding:4px 6px} th{background:#F2F4F7;font-size:9.5px;text-transform:uppercase;text-align:left} .n{text-align:right;white-space:nowrap} tr.t td{font-weight:700;background:#F9FAFB}
      .sig{display:flex;justify-content:space-between;margin-top:40px}</style></head><body>
      <h2>${esc(company)} — Salary Sheet</h2><div class="s">${monthLabel(month)} · ${rows.length} employees</div>
      <table><thead><tr><th>Code</th><th>Name</th><th>Designation</th><th class="n">Days</th><th class="n">Gross</th><th class="n">PF</th><th class="n">ESI</th><th class="n">PT</th><th class="n">TDS</th><th class="n">Advance</th><th class="n">Other</th><th class="n">Net pay</th><th>Bank A/c</th><th>Paid on</th></tr></thead><tbody>
      ${rows.map(r => `<tr><td>${esc(r.empCode)}</td><td>${esc(r.name)}</td><td>${esc(r.designation)}</td><td class="n">${r.paidDays}/${r.days}</td><td class="n">${money(r.gross)}</td><td class="n">${money(r.pf)}</td><td class="n">${money(r.esi)}</td><td class="n">${money(r.pt)}</td><td class="n">${money(r.tds)}</td><td class="n">${money(r.advance)}</td><td class="n">${money(r.otherDed)}</td><td class="n"><b>${money(r.net)}</b></td><td>${esc(r.bankAccount)} ${esc(r.ifsc)}</td><td>${fmtD(r.paidOn) === '—' ? '' : fmtD(r.paidOn)}</td></tr>`).join('')}
      <tr class="t"><td colspan="4">Total</td><td class="n">${money(T.gross)}</td><td class="n">${money(T.pf)}</td><td class="n">${money(T.esi)}</td><td class="n">${money(T.pt)}</td><td class="n">${money(T.tds)}</td><td class="n">${money(T.advance)}</td><td class="n">${money(T.otherDed)}</td><td class="n">${money(T.net)}</td><td colspan="2"></td></tr>
      </tbody></table><div class="sig"><span>Prepared by</span><span>Checked by</span><span>Approved by</span></div></body></html>`);
    w.document.close(); w.focus(); setTimeout(() => w.print(), 300);
  };
  const payslip = r => {
    const w = window.open('', '_blank'); if (!w) return;
    const line = (a, b) => `<tr><td>${a}</td><td class="n">${money(b)}</td></tr>`;
    w.document.write(`<html><head><title>Payslip — ${esc(r.name)} — ${monthLabel(month)}</title><style>body{font-family:Inter,Arial,sans-serif;font-size:12px;margin:24px;color:#101828} h2{margin:0;font-size:17px} .s{color:#667085;margin:2px 0 14px}
      .box{border:1px solid #D0D5DD;border-radius:6px;padding:10px 12px;margin-bottom:12px} .g{display:grid;grid-template-columns:1fr 1fr;gap:4px 24px} .g b{display:inline-block;min-width:110px;color:#475467;font-weight:600}
      table{width:100%;border-collapse:collapse} td,th{padding:5px 8px;border-bottom:1px solid #EAECF0} th{text-align:left;background:#F2F4F7} .n{text-align:right} .cols{display:grid;grid-template-columns:1fr 1fr;gap:14px} .net{font-size:15px;font-weight:700;margin-top:10px}</style></head><body>
      <h2>${esc(company)}</h2><div class="s">Payslip for ${monthLabel(month)}</div>
      <div class="box g"><div><b>Employee</b>${esc(r.name)}</div><div><b>Code</b>${esc(r.empCode)}</div><div><b>Designation</b>${esc(r.designation)}</div><div><b>Department</b>${esc(r.department)}</div>
        <div><b>Paid days</b>${r.paidDays} of ${r.days}</div><div><b>UAN</b>${esc(r.uan)}</div><div><b>PAN</b>${esc(r.pan)}</div><div><b>Bank</b>${esc(r.bankName)} ${esc(r.bankAccount)}</div></div>
      <div class="cols"><table><thead><tr><th>Earnings</th><th class="n">₹</th></tr></thead><tbody>${line('Basic', r.basic)}${line('HRA', r.hra)}${line('Conveyance', r.conveyance)}${line('Special allowance', r.special)}${r.other ? line('Other allowance', r.other) : ''}${r.bonus ? line('Bonus / incentive', r.bonus) : ''}<tr><th>Gross earnings</th><th class="n">${money(r.gross)}</th></tr></tbody></table>
      <table><thead><tr><th>Deductions</th><th class="n">₹</th></tr></thead><tbody>${line('Provident fund', r.pf)}${line('ESI', r.esi)}${line('Professional tax', r.pt)}${r.tds ? line('TDS', r.tds) : ''}${r.advance ? line('Advance', r.advance) : ''}${r.otherDed ? line('Other', r.otherDed) : ''}<tr><th>Total deductions</th><th class="n">${money(r.deductions)}</th></tr></tbody></table></div>
      <div class="net">Net pay: ₹${money(r.net)}</div>${r.paidOn ? `<div class="s">Paid on ${fmtD(r.paidOn)}${r.paidVia ? ' · ' + esc(r.paidVia) : ''}${r.paidRef ? ' · ' + esc(r.paidRef) : ''}</div>` : ''}
      <div class="s" style="margin-top:30px">This is a computer-generated payslip.</div></body></html>`);
    w.document.close(); w.focus(); setTimeout(() => w.print(), 300);
  };

  const num = (r, k, width = 70) => <input className="cell" type="number" value={r[k] ?? ''} onChange={e => change(r.employeeId, k, e.target.value)} style={{ width }} />;
  return (
    <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10, height: '100%', boxSizing: 'border-box', fontFamily: F }}>
      <div className="rc-card" style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>Salary</div>
        <input type="month" className="rc-ctl" value={month} onChange={e => { if (!dirty || window.confirm('Leave this month without saving the changes?')) setMonth(e.target.value); }} style={{ width: 160 }} />
        <span style={{ fontSize: 11.5, color: savedAt ? '#067647' : '#B54708' }}>{savedAt ? `Saved ${new Date(savedAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}` : 'Not saved yet'}{dirty ? ' · unsaved changes' : ''}</span>
        <div style={{ display: 'flex', gap: 16, fontSize: 12, color: '#667085', marginLeft: 8 }}>
          <span>Gross <b style={{ color: '#101828' }}>₹{money(T.gross)}</b></span>
          <span>Deductions <b style={{ color: '#B42318' }}>₹{money(T.deductions)}</b></span>
          <span>Net pay <b style={{ color: '#067647' }}>₹{money(T.net)}</b></span>
        </div>
        <div style={{ flex: 1 }} />
        <button className="rc-btn" onClick={markAllPaid} disabled={!rows.length}>Mark all paid today</button>
        <button className="rc-btn" onClick={printSheet} disabled={!rows.length}>Print sheet</button>
        <button className="rc-btn primary" onClick={save} disabled={busy || !rows.length}>{busy ? 'Saving…' : 'Save'}</button>
      </div>
      {err && <div style={{ background: '#FFFAEB', border: '1px solid #FEDF89', borderRadius: 10, padding: '8px 14px', fontSize: 13, color: '#B54708', fontWeight: 600 }}>{err}</div>}
      {msg && <div style={{ background: '#ECFDF3', border: '1px solid #ABEFC6', borderRadius: 10, padding: '7px 14px', fontSize: 12.5, color: '#067647', fontWeight: 600 }}>{msg}</div>}
      <div className="rc-card" style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
        {loading ? <div style={{ padding: 40, textAlign: 'center', color: '#98A2B3' }}>Loading…</div>
        : !rows.length ? <div style={{ padding: 40, textAlign: 'center', color: '#475467' }}>No employees on the rolls in {monthLabel(month)}. Add employees (with their salary structure) in the <b>Employee</b> tab.</div>
        : (
          <table className="rc-tbl" style={{ minWidth: 1560 }}>
            <colgroup><col style={{ width: 80 }} /><col style={{ width: 170 }} /><col style={{ width: 86 }} /><col style={{ width: 92 }} /><col style={{ width: 92 }} /><col style={{ width: 84 }} /><col style={{ width: 96 }} /><col style={{ width: 96 }} />
              <col style={{ width: 80 }} /><col style={{ width: 70 }} /><col style={{ width: 66 }} /><col style={{ width: 84 }} /><col style={{ width: 92 }} /><col style={{ width: 92 }} /><col style={{ width: 104 }} /><col style={{ width: 128 }} /><col style={{ width: 110 }} /><col style={{ width: 80 }} /></colgroup>
            <thead><tr>
              <th>Code</th><th>Name</th><th className="n">Paid days</th><th className="n">Basic</th><th className="n">HRA</th><th className="n">Other alw.</th><th className="n">Bonus</th><th className="n">Gross</th>
              <th className="n">PF</th><th className="n">ESI</th><th className="n">PT</th><th className="n">TDS</th><th className="n">Advance</th><th className="n">Other ded.</th><th className="n">Net pay</th><th>Paid on</th><th>Paid via</th><th></th>
            </tr></thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.employeeId} className="row">
                  <td style={{ fontWeight: 600 }}>{r.empCode}</td>
                  <td title={`${r.name} · ${r.designation || ''}`} style={{ fontWeight: 600 }}>{r.name}</td>
                  <td className="n"><span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>{num(r, 'paidDays', 44)}<span style={{ color: '#98A2B3', fontSize: 11 }}>/{r.days}</span></span></td>
                  <td className="n">{money(r.basic)}</td>
                  <td className="n">{money(r.hra)}</td>
                  <td className="n" title={`Conveyance ${money(r.conveyance)} · Special ${money(r.special)} · Other ${money(r.other)}`}>{money(r2(r.conveyance + r.special + r.other))}</td>
                  <td className="n">{num(r, 'bonus', 80)}</td>
                  <td className="n" style={{ fontWeight: 700 }}>{money(r.gross)}</td>
                  <td className="n">{money(r.pf)}</td>
                  <td className="n">{money(r.esi)}</td>
                  <td className="n">{money(r.pt)}</td>
                  <td className="n">{num(r, 'tds', 70)}</td>
                  <td className="n">{num(r, 'advance', 80)}</td>
                  <td className="n">{num(r, 'otherDed', 80)}</td>
                  <td className="n" style={{ fontWeight: 700, color: '#067647' }}>{money(r.net)}</td>
                  <td><input className="cell" type="date" value={r.paidOn || ''} onChange={e => change(r.employeeId, 'paidOn', e.target.value)} style={{ textAlign: 'left' }} /></td>
                  <td><input className="cell" value={r.paidVia || ''} onChange={e => change(r.employeeId, 'paidVia', e.target.value)} placeholder="e.g. SBI NEFT" style={{ textAlign: 'left' }} /></td>
                  <td><button className="rc-btn sm" onClick={() => payslip(r)} disabled={dirty} title={dirty ? 'Save first' : 'Print payslip'}>Payslip</button></td>
                </tr>
              ))}
              <tr><td colSpan={7} style={{ background: '#F2F4F7', fontWeight: 700 }}>Total · {rows.length} employees</td>
                <td className="n" style={{ background: '#F2F4F7', fontWeight: 700 }}>{money(T.gross)}</td><td className="n" style={{ background: '#F2F4F7' }}>{money(T.pf)}</td><td className="n" style={{ background: '#F2F4F7' }}>{money(T.esi)}</td>
                <td className="n" style={{ background: '#F2F4F7' }}>{money(T.pt)}</td><td className="n" style={{ background: '#F2F4F7' }}>{money(T.tds)}</td><td className="n" style={{ background: '#F2F4F7' }}>{money(T.advance)}</td>
                <td className="n" style={{ background: '#F2F4F7' }}>{money(T.otherDed)}</td><td className="n" style={{ background: '#F2F4F7', fontWeight: 700, color: '#067647' }}>{money(T.net)}</td><td colSpan={3} style={{ background: '#F2F4F7' }}></td></tr>
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
