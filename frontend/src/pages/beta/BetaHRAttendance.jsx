/* Beta — HR → Attendance (/api/hr/attendance). One register per month: employees × days.
 * Click a cell and TYPE the mark (P · A · L · H · W = weekly off · D = half day · U = leave without pay · Delete clears; arrows move),
 * or click to SELECT it from the list, or use the quick fills. Days before joining / after leaving / in the future cannot be marked
 * (the server refuses them too). Paid days = P + L + WO + H + ½ HD — Payroll takes them from here. */
import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { useCompany } from '../../context/CompanyContext';
import { useAuth } from '../../context/AuthContext';
import { Svg } from '../../components/ui/Icon';
import { CSS as SALES_CSS } from './BetaSales';
import { printDepList } from './BetaCertPrint';
import { ACC_CSS } from './BetaAccKit';
import { hrCan, MARKS, markOf, tally, thisMonth, daysIn, DOW, dowOf, onRolls, loadEmployees, loadSettings } from './BetaHRKit';
import { monthLabel } from './BetaHRPrint';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const CSS = `
.at-wrap { flex:1; min-height:0; overflow:auto; background:#fff; }
.at { border-collapse:separate; border-spacing:0; font-size:11.5px; }
.at th, .at td { border-right:1px solid #EDF2F3; border-bottom:1px solid #EDF2F3; padding:0; text-align:center; }
.at thead th { position:sticky; top:0; background:#D4EBEE; z-index:2; font-weight:700; padding:4px 0; font-size:10.5px; }
.at thead th.wk { background:#C3DEE2; } .at thead th.hol { background:#E9E3FF; color:#5925DC; cursor:pointer; }
.at thead th.dd { cursor:pointer; min-width:30px; } .at thead th.dd:hover { background:#B7D7DC; }
.at .nm { position:sticky; left:0; background:#fff; z-index:1; text-align:left; padding:4px 8px; min-width:200px; max-width:220px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; border-right:1px solid #C9DDE0; }
.at thead .nm { z-index:3; background:#D4EBEE; }
.at td.c { cursor:pointer; height:28px; font-weight:700; font-size:10.5px; user-select:none; }
.at td.c:hover, .at td.c:focus { outline:2px solid #03444f; outline-offset:-2px; }
.at td.blk { background:repeating-linear-gradient(45deg, #F2F4F7, #F2F4F7 4px, #E4E7EC 4px, #E4E7EC 6px); cursor:not-allowed; }
.at td.sum { padding:0 6px; font-weight:700; background:#F9FAFB; white-space:nowrap; }
.at td.paid { background:#ECFDF3; color:#067647; }
.at-legend { display:flex; gap:10px; flex-wrap:wrap; padding:6px 12px; background:#fff; border-bottom:1px solid #DCE6E8; font-size:11.5px; align-items:center; flex-shrink:0; }
.at-legend span { display:inline-flex; align-items:center; gap:4px; } .at-legend b { display:inline-block; min-width:26px; text-align:center; border-radius:4px; padding:1px 4px; font-size:10.5px; }
.at-pen { border:1px solid #C9D7DA; border-radius:6px; padding:2px; display:inline-flex; gap:2px; background:#fff; }
.at-pen button { border:0; border-radius:4px; padding:4px 8px; font:700 11px Inter, Arial, sans-serif; cursor:pointer; }
.at-pen button.on { outline:2px solid #03444f; }
.at-menu { position:fixed; z-index:200; background:#fff; border:1px solid #DCE6E8; border-radius:8px; box-shadow:0 10px 24px rgba(16,24,40,.18); padding:4px; display:grid; grid-template-columns:repeat(4, auto); gap:3px; }
.at-menu button { border:0; border-radius:5px; padding:6px 8px; font:700 11.5px Inter, Arial, sans-serif; cursor:pointer; }`;

export default function BetaHRAttendance() {
  const { selectedCompany } = useCompany() || {};
  const { user } = useAuth() || {};
  const companyId = selectedCompany?.companyId;
  const [month, setMonth] = useState(thisMonth());
  const [emps, setEmps] = useState(null);
  const [settings, setSettings] = useState({});
  const [marks, setMarks] = useState({});
  const [holidays, setHolidays] = useState([]);
  const [savedAt, setSavedAt] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [pen, setPen] = useState('');          // a mark to paint with by clicking cells, '' = choose per cell
  const [menu, setMenu] = useState(null);      // { emp, d, x, y }
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(null);
  const canEdit = hrCan(user, 'edit');
  const days = daysIn(month);
  useEffect(() => { if (companyId) { loadEmployees(companyId).then(setEmps).catch(() => setEmps([])); loadSettings(companyId).then(setSettings); } }, [companyId]);
  useEffect(() => {
    if (!companyId) return;
    axios.get('/api/hr/attendance', { params: { companyId, month } }).then(r => { setMarks(r.data?.marks || {}); setHolidays(r.data?.holidays || []); setSavedAt(r.data?.savedAt || null); setDirty(false); })
      .catch(() => { setMarks({}); setHolidays([]); setSavedAt(null); });
  }, [companyId, month]);
  useEffect(() => {
    if (!menu) return undefined;
    const close = () => setMenu(null);
    window.addEventListener('mousedown', close); window.addEventListener('scroll', close, true);
    return () => { window.removeEventListener('mousedown', close); window.removeEventListener('scroll', close, true); };
  }, [menu]);
  const list = useMemo(() => (emps || []).filter(e => onRolls(e, month) || marks[String(e.id)]), [emps, month, marks]);
  if (!hrCan(user, 'view')) return <div className="sb"><style>{SALES_CSS}</style><div className="sb-empty" style={{ padding: 30 }}>You are not authorized to see HR.</div></div>;

  /* a day the employee was not on the rolls (before joining / after leaving) cannot be marked */
  const now0 = new Date(), todayStr = `${now0.getFullYear()}-${String(now0.getMonth() + 1).padStart(2, '0')}-${String(now0.getDate()).padStart(2, '0')}`;   // local date
  const blockOf = (e, d) => { const ds = `${month}-${String(d).padStart(2, '0')}`; return ds > todayStr ? 'Future date — cannot be marked yet' : e.joiningDate && ds < e.joiningDate ? `Before joining (${e.joiningDate.split('-').reverse().join('-')})` : e.leavingDate && ds > e.leavingDate ? 'After leaving' : ''; };
  const outside = (e, d) => !!blockOf(e, d);
  /* keyboard: focus moves cell to cell */
  const focusCell = (ri, d) => { const el = document.querySelector(`.at td[data-r="${ri}"][data-d="${d}"]`); if (el) el.focus(); };
  const onKey = (ev, e, ri, d) => {
    const k = ev.key.toUpperCase(), id = String(e.id);
    const map = { P: 'P', A: 'A', L: 'L', H: 'H', W: 'WO', O: 'WO', D: 'HD', U: 'LWP', X: 'LWP' };
    if (ev.key === 'ArrowRight') { ev.preventDefault(); focusCell(ri, Math.min(days, d + 1)); return; }
    if (ev.key === 'ArrowLeft') { ev.preventDefault(); focusCell(ri, Math.max(1, d - 1)); return; }
    if (ev.key === 'ArrowDown') { ev.preventDefault(); focusCell(ri + 1, d); return; }
    if (ev.key === 'ArrowUp') { ev.preventDefault(); focusCell(ri - 1, d); return; }
    if (!canEdit) return;
    if (ev.key === 'Delete' || ev.key === 'Backspace') { ev.preventDefault(); setMark(id, d, ''); return; }
    if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); const rc = ev.currentTarget.getBoundingClientRect(); setMenu({ emp: id, d, x: Math.min(rc.left, window.innerWidth - 230), y: rc.bottom + 2 }); return; }
    if (map[k] && !ev.ctrlKey && !ev.metaKey && !ev.altKey) { ev.preventDefault(); setMark(id, d, map[k]); focusCell(ri, Math.min(days, d + 1)); }
  };
  const setMark = (empId, d, k) => { setMarks(m => { const r = { ...(m[empId] || {}) }; if (k) r[d] = k; else delete r[d]; return { ...m, [empId]: r }; }); setDirty(true); setNote(null); };
  /* the weekly-off days of the month for an employee: their weekly off (e.g. Sunday), plus 2nd & 4th Saturday when set */
  const weekOffDays = e => {
    const wo = String(e.weeklyOff || settings.weeklyOff || 'Sunday');
    const day = WEEKDAYS.findIndex(n => wo.startsWith(n));
    const out = []; let sat = 0;
    for (let d = 1; d <= days; d++) {
      const w = dowOf(month, d); if (w === 6) sat++;
      if (w === day) out.push(d); else if (wo.includes('2nd & 4th Saturday') && w === 6 && (sat === 2 || sat === 4)) out.push(d);
    }
    return out;
  };
  const fillWeekly = () => { setMarks(m => { const n = { ...m }; list.forEach(e => { const r = { ...(n[String(e.id)] || {}) }; weekOffDays(e).forEach(d => { if (!r[d] && !outside(e, d)) r[d] = 'WO'; }); holidays.forEach(d => { if (!r[d] && !outside(e, d)) r[d] = 'H'; }); n[String(e.id)] = r; }); return n; }); setDirty(true); };
  const fillPresent = () => {
    const upto = month === thisMonth() ? new Date().getDate() : days;
    setMarks(m => { const n = { ...m }; list.forEach(e => { const r = { ...(n[String(e.id)] || {}) }; const wo = new Set(weekOffDays(e));
      for (let d = 1; d <= upto; d++) if (!r[d] && !outside(e, d)) r[d] = holidays.includes(d) ? 'H' : wo.has(d) ? 'WO' : 'P'; n[String(e.id)] = r; }); return n; });
    setDirty(true); setNote({ ok: true, t: `Blank days up to ${upto} ${monthLabel(month).split(' ')[0]} filled as Present (weekly offs and holidays marked). Now mark absences and leave.` });
  };
  const toggleHoliday = d => {
    if (!canEdit) return;
    const on = !holidays.includes(d);
    setHolidays(h => (on ? [...h, d].sort((a, b) => a - b) : h.filter(x => x !== d)));
    setMarks(m => { const n = { ...m }; list.forEach(e => { if (outside(e, d)) return; const r = { ...(n[String(e.id)] || {}) }; if (on) r[d] = 'H'; else if (r[d] === 'H') delete r[d]; n[String(e.id)] = r; }); return n; });
    setDirty(true);
  };
  const save = async () => {
    setBusy(true);
    try { const r = await axios.post(`/api/hr/attendance/${month}`, { companyId, marks, holidays }, { params: { companyId } }); setSavedAt(r.data?.savedAt); setDirty(false); setNote({ ok: true, t: `Attendance for ${monthLabel(month)} saved. Payroll takes the paid days from here.` }); }
    catch (e) { setNote({ ok: false, t: e.response?.data?.error || 'Could not save the attendance.' }); }
    finally { setBusy(false); }
  };
  /* Excel: download the month's format (active employees × days, saved marks filled), fill it, upload it — the marks come
     into the grid as unsaved changes to check, then Save */
  const downloadXl = async () => {
    try {
      const r = await axios.get('/api/hr/attendance/template', { params: { companyId, month }, responseType: 'blob' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(r.data); a.download = `Attendance-${month}.xlsx`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      setNote({ ok: true, t: `Format for ${monthLabel(month)} downloaded — ${list.length} employee(s). Fill the marks (P, A, HD, L, LWP, WO, H) and upload it here.` });
    } catch { setNote({ ok: false, t: 'Could not download the format.' }); }
  };
  const uploadXl = async ev => {
    const file = ev.target.files?.[0]; ev.target.value = '';
    if (!file) return;
    setBusy(true);
    try {
      const fd = new FormData(); fd.append('file', file);
      const r = await axios.post(`/api/hr/attendance/${month}/parse`, fd, { params: { companyId } });
      const got = r.data?.marks || {};
      setMarks(m => { const n = { ...m }; Object.entries(got).forEach(([id, row]) => { n[id] = { ...(n[id] || {}), ...row }; }); return n; });
      if (r.data.cells) setDirty(true);
      const extra = [r.data.skipped ? `${r.data.skipped} locked day(s) skipped (before joining / future)` : '', ...(r.data.issues || []), r.data.moreIssues ? `…and ${r.data.moreIssues} more` : ''].filter(Boolean);
      setNote({ ok: !(r.data.issues || []).length, t: `${r.data.cells} mark(s) for ${r.data.employees} employee(s) loaded from ${file.name} — check them and click “Save attendance”.${extra.length ? ` ${extra.join(' · ')}` : ''}` });
    } catch (e) { setNote({ ok: false, t: e.response?.data?.error || 'Could not read the Excel file.' }); }
    finally { setBusy(false); }
  };
  const printReg = () => printDepList({ title: `ATTENDANCE REGISTER — ${monthLabel(month).toUpperCase()}`, company: selectedCompany, user, filter: `${list.length} employees`, total: 0,
    heads: ['Code', 'Name', ...Array.from({ length: days }, (_, i) => `${i + 1}`), 'P', 'A', 'L', 'LWP', 'Paid'],
    rows: list.map(e => { const r = marks[String(e.id)] || {}, t = tally(r, days); return [e.empCode, e.name, ...Array.from({ length: days }, (_, i) => r[i + 1] || ''), String(t.P + t.HD / 2), String(t.A), String(t.L), String(t.LWP), String(t.paid)]; }) });
  const cell = (e, d, ri) => {
    const k = (marks[String(e.id)] || {})[d], m = markOf(k), why = blockOf(e, d);
    if (why) return <td key={d} className="blk" title={why} />;
    return <td key={d} className="c" tabIndex={0} data-r={ri} data-d={d} style={m ? { background: m[3], color: m[4] } : undefined} title={`${d} — ${m ? m[1] : 'not marked'} · type P / A / L / H / W / D / U`}
      onKeyDown={ev => onKey(ev, e, ri, d)}
      onMouseDown={ev => { ev.stopPropagation(); ev.currentTarget.focus(); if (!canEdit) return; if (pen) { setMark(String(e.id), d, pen === 'clear' ? '' : pen); return; } const rc = ev.currentTarget.getBoundingClientRect(); setMenu({ emp: String(e.id), d, x: Math.min(rc.left, window.innerWidth - 230), y: rc.bottom + 2 }); }}>{k || ''}</td>;
  };
  return (
    <div className="sb">
      <style>{SALES_CSS + ACC_CSS + CSS}</style>
      <div className="sb-tabs" role="tablist">
        <button type="button" role="tab" aria-selected="true" className="sb-tab on">Attendance {list.length > 0 && <span className="n">{list.length}</span>}</button>
        <div className="sb-slot" style={{ display: 'flex', alignItems: 'stretch' }}>
          <input type="month" className="sb-search" value={month} onChange={e => { if (dirty && !window.confirm('Unsaved changes in this month will be lost. Continue?')) return; setMonth(e.target.value || thisMonth()); }} style={{ width: 150 }} aria-label="Month" />
          {canEdit && <button type="button" className="sb-tbtn" onClick={fillWeekly} title="Mark the weekly offs and holidays of every employee"><Svg name="clock" size={13} />Weekly offs</button>}
          {canEdit && <button type="button" className="sb-tbtn" onClick={fillPresent} title="Every blank day (till today) becomes Present"><Svg name="check" size={13} />All present</button>}
          <button type="button" className="sb-tbtn" onClick={printReg}><Svg name="file" size={13} />Print register</button>
          <button type="button" className="sb-tbtn" onClick={downloadXl} title="Excel format with this month's active employees and days"><Svg name="file" size={13} />Download Excel format</button>
          {canEdit && <label className="sb-tbtn" style={{ cursor: busy ? 'wait' : 'pointer' }} title="Upload the filled Excel — marks load into the grid to check, then Save"><Svg name="refresh" size={13} />{busy ? 'Reading…' : 'Upload Excel'}<input type="file" hidden accept=".xlsx,.xls,.csv" disabled={busy} onChange={uploadXl} /></label>}
          <div className="sb-tools">
            <span className="sb-picked">{dirty ? <b style={{ color: '#B54708' }}>Unsaved changes</b> : savedAt ? `Saved ${new Date(savedAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}` : 'Not saved yet'}</span>
            {canEdit && <button type="button" className="sb-tbtn" style={{ background: '#03444f', color: '#fff' }} disabled={busy || !dirty} onClick={save}>{busy ? 'Saving…' : 'Save attendance'}</button>}
          </div>
        </div>
      </div>
      <div className="at-legend">
        {MARKS.map(([k, l, p, bg, fg]) => <span key={k}><b style={{ background: bg, color: fg }}>{k}</b>{l}{p !== 1 ? ` (${p} day)` : ''} <kbd style={{ fontSize: 10, color: '#667085' }}>{{ WO: 'W', HD: 'D', LWP: 'U' }[k] || k}</kbd></span>)}
        <span style={{ color: '#667085' }}><b style={{ background: '#E4E7EC' }}>&nbsp;</b>before joining / future — locked</span>
        {canEdit && <span style={{ marginLeft: 'auto' }}>Paint: <span className="at-pen">{[['', 'Pick'], ...MARKS.map(m => [m[0], m[0]]), ['clear', '✕']].map(([k, l]) => { const m = markOf(k); return <button key={k || 'pick'} type="button" className={pen === k ? 'on' : ''} style={m ? { background: m[3], color: m[4] } : { background: '#F9FAFB' }} onClick={() => setPen(k)} title={k ? (m ? `Click cells to mark ${m[1]}` : 'Click cells to clear') : 'Click a cell to choose its mark'}>{l}</button>; })}</span></span>}
      </div>
      {note && <div className={`sf-msg ${note.ok ? 'ok' : 'err'}`} role="status" style={{ margin: 0, borderRadius: 0 }}>{note.t}</div>}
      <div className="at-wrap">
        {emps === null ? <div className="sb-empty">Loading…</div> : !list.length ? <div className="sb-empty">No employee on the rolls in {monthLabel(month)} — add employees in HR → Employees.</div> : (
          <table className="at">
            <thead><tr><th className="nm">Employee</th>
              {Array.from({ length: days }, (_, i) => { const d = i + 1, w = dowOf(month, d), hol = holidays.includes(d); return <th key={d} className={`dd${hol ? ' hol' : w === 0 ? ' wk' : ''}`} onClick={() => toggleHoliday(d)} title={canEdit ? (hol ? 'Holiday — click to remove' : 'Click to make this day a holiday for all') : ''}>{d}<div style={{ fontWeight: 500, fontSize: 9 }}>{DOW[w].slice(0, 2)}</div></th>; })}
              <th className="sum" style={{ background: '#D4EBEE' }}>P</th><th className="sum" style={{ background: '#D4EBEE' }}>A</th><th className="sum" style={{ background: '#D4EBEE' }}>L</th><th className="sum" style={{ background: '#D4EBEE' }}>LWP</th><th className="sum" style={{ background: '#D4EBEE' }} title="Days not marked">Blank</th><th className="sum" style={{ background: '#D4EBEE' }}>Paid days</th></tr></thead>
            <tbody>{list.map((e, ri) => { const t = tally(marks[String(e.id)], days); return (
              <tr key={e.id}><td className="nm"><b>{e.empCode}</b> {e.name}<div style={{ fontSize: 10, color: '#667085' }}>{e.designation || ''}</div></td>
                {Array.from({ length: days }, (_, i) => cell(e, i + 1, ri))}
                <td className="sum">{t.P + t.HD / 2}</td><td className="sum" style={{ color: t.A ? '#B42318' : undefined }}>{t.A}</td><td className="sum">{t.L}</td><td className="sum">{t.LWP}</td>
                <td className="sum" style={{ color: t.blank ? '#B54708' : '#98A2B3' }}>{t.blank}</td><td className="sum paid">{t.paid}</td></tr>); })}</tbody>
          </table>)}
      </div>
      {menu && (
        <div className="at-menu" style={{ left: menu.x, top: menu.y }} onMouseDown={e => e.stopPropagation()} role="menu">
          {MARKS.map(([k, l, , bg, fg]) => <button key={k} type="button" style={{ background: bg, color: fg }} title={l} onClick={() => { setMark(menu.emp, menu.d, k); setMenu(null); }}>{k}</button>)}
          <button type="button" style={{ background: '#F9FAFB' }} onClick={() => { setMark(menu.emp, menu.d, ''); setMenu(null); }} title="Clear">✕</button>
        </div>
      )}
    </div>
  );
}
