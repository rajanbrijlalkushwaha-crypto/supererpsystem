/* Beta — HR → Employees. Same records as the classic HR page (/api/hr/employees).
 * Form: personal, job & joining terms (probation, notice, hours, weekly off), statutory & bank, salary structure, documents.
 * List: search + status, Print list; selected: Employment agreement (Permanent / Temporary / Trainee…), Agreement signed, Asset agreement,
 * Full report (joining till date, attendance + salary month-wise), Full & Final settlement (two copies), Edit, Delete. */
import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useCompany } from '../../context/CompanyContext';
import { useAuth } from '../../context/AuthContext';
import { Svg } from '../../components/ui/Icon';
import { CSS as SALES_CSS, useClearSel } from './BetaSales';
import { PX_CSS } from './BetaPurchaseParts';
import { printDepList, dmy } from './BetaCertPrint';
import { ACC_CSS, amt, today, words, hit } from './BetaAccKit';
import { hrCan, EMP_STATUS, DEPARTMENTS, STATUS_PILL, grossOf, salaryFor, loadEmployees, loadSettings, viewHrFile, toForm } from './BetaHRKit';
import { printEmploymentAgreement, printAssetAgreement, printEmployeeReport, printFnf, fnfCalc, kindOf, printRevisionLetter, monthLabel, printJoiningForm, printAssetIssueForm, printIdCards, photoFileOf } from './BetaHRPrint';

const BLANK = { empCode: '', name: '', fatherName: '', dob: '', gender: '', maritalStatus: '', bloodGroup: '', mobile: '', altMobile: '', email: '', currentAddress: '', permanentAddress: '',
  emergencyName: '', emergencyMobile: '', department: '', designation: '', joiningDate: today(), employmentType: 'Permanent', reportingTo: '', workLocation: '',
  status: 'Active', leavingDate: '', leavingReason: '', pan: '', aadhaar: '', uan: '', pfNo: '', esicNo: '', bankName: '', bankAccount: '', ifsc: '', accountHolder: '',
  qualification: '', experience: '', remarks: '', probationMonths: '6', noticeDays: '30', workHours: '9:30 AM – 6:30 PM', weeklyOff: 'Sunday', shift: '', termsAcceptedOn: '', termsNote: '', contractEndDate: '', stipend: '' };
const BLANK_SAL = { basic: '', hra: '', conveyance: '', special: '', other: '', pfApplicable: false, esiApplicable: false, ptApplicable: true, tds: '' };
const WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday + 2nd & 4th Saturday'];
const TYPES = ['Permanent', 'Probation', 'Temporary', 'Contract', 'Trainee', 'Intern', 'Consultant'];
const FIXED = ['Temporary', 'Contract', 'Trainee', 'Intern', 'Consultant'];

export default function BetaHREmployees() {
  const navigate = useNavigate();
  const { search } = useLocation();
  const tab = new URLSearchParams(search).get('tab') === 'create' ? 'create' : 'list';
  const { selectedCompany } = useCompany() || {};
  const { user } = useAuth() || {};
  const companyId = selectedCompany?.companyId;
  const [emps, setEmps] = useState(null);
  const [assets, setAssets] = useState([]);
  const [settings, setSettings] = useState({});
  const [reload, setReload] = useState(0);
  const [editing, setEditing] = useState(null);
  const [note, setNote] = useState(null);
  const [slot, setSlot] = useState(null);
  const canAdd = hrCan(user, 'create');
  useEffect(() => {
    if (!companyId) return;
    loadEmployees(companyId).then(setEmps).catch(() => setEmps([]));
    axios.get('/api/hr/assets', { params: { companyId } }).then(r => setAssets(Array.isArray(r.data) ? r.data : [])).catch(() => setAssets([]));
    loadSettings(companyId).then(setSettings);
  }, [companyId, reload]);
  if (!hrCan(user, 'view')) return <div className="sb"><style>{SALES_CSS}</style><div className="sb-empty" style={{ padding: 30 }}>You are not authorized to see HR. Ask the admin for the HR &amp; Payroll permission.</div></div>;
  const cur = editing ? 'create' : (tab === 'create' && canAdd ? 'create' : 'list');
  const go = k => { setEditing(null); navigate(`/beta/hr/employees?tab=${k}`); };
  return (
    <div className="sb">
      <style>{SALES_CSS + PX_CSS + ACC_CSS + '.hr-chk { display:flex; gap:14px; flex-wrap:wrap; } .hr-chk label { display:flex; gap:5px; align-items:center; font-size:12.5px; } .hr-chk input { width:15px !important; height:15px !important; accent-color:#03444f; }' + EMP_PM_CSS}</style>
      <div className="sb-tabs" role="tablist">
        {[['list', 'Employees'], ...(canAdd || editing ? [['create', editing ? `${editing.fnf ? 'Full & Final — ' : editing.rev ? 'Salary revision — ' : 'Edit '}${editing.rec.empCode || editing.rec.name}` : 'Add Employee (Joining)']] : [])].map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={cur === k} className={`sb-tab${cur === k ? ' on' : ''}`} onClick={() => go(k)}>{l}{k === 'list' && emps && <span className="n">{emps.length}</span>}</button>
        ))}
        <div className="sb-slot" ref={setSlot} />
      </div>
      {note && <div className="sb-note" role="status">{note}<button type="button" onClick={() => setNote(null)} aria-label="Dismiss">×</button></div>}
      {cur === 'create'
        ? <div className="sb-body">{editing?.rev
            ? <RevisionForm key={`r${editing.rec.id}`} companyId={companyId} emp={editing.rec} company={selectedCompany} user={user} onCancel={() => go('list')} onSaved={t => { setReload(x => x + 1); setNote(t); go('list'); }} />
            : editing?.fnf
            ? <FnfForm key={`f${editing.rec.id}`} companyId={companyId} emp={editing.rec} assets={assets.filter(a => String(a.employeeId) === String(editing.rec.id))} company={selectedCompany} user={user} onCancel={() => go('list')} onSaved={t => { setReload(x => x + 1); setNote(t); go('list'); }} />
            : <EmpForm key={editing ? editing.rec.id : 'new'} companyId={companyId} edit={editing?.rec} settings={settings} onCancel={() => go('list')} onSaved={t => { setReload(x => x + 1); setNote(t); go('list'); }} />}</div>
        : <EmpList emps={emps} assets={assets} settings={settings} company={selectedCompany} user={user} slot={slot} companyId={companyId} onEdit={e => { setNote(null); setEditing({ rec: e }); }} onFnf={e => { setNote(null); setEditing({ rec: e, fnf: true }); }} onRevise={e => { setNote(null); setEditing({ rec: e, rev: true }); }} onChanged={t => { setReload(x => x + 1); setNote(t); }} />}
    </div>
  );
}

function EmpList({ emps, assets, settings, company, user, slot, companyId, onEdit, onFnf, onRevise, onChanged }) {
  const [q, setQ] = useState('');
  const [st, setSt] = useState('Active');
  const [selId, setSelId] = useState(null);
  const [ask, setAsk] = useState(null);
  const [busy, setBusy] = useState(false);
  useClearSel(ask ? null : selId, setSelId, '.sb-t tbody tr, .sb-tools, .sb-ask, .cpv-ov');
  const w = words(q);
  const all = emps || [];
  const list = useMemo(() => all.filter(e => (!st || e.status === st) && hit(`${e.empCode} ${e.name} ${e.designation} ${e.department} ${e.mobile} ${e.email} ${e.workLocation}`, w)), [all, st, w.join(' ')]);   // eslint-disable-line react-hooks/exhaustive-deps
  const sel = list.find(e => e.id === selId) || null;
  const canEdit = hrCan(user, 'edit'), canDel = hrCan(user, 'delete');
  const assetsOf = e => assets.filter(a => String(a.employeeId) === String(e.id) && a.status === 'issued');
  const act = async (e, what) => {
    setBusy(true);
    try {
      if (what === 'delete') await axios.delete(`/api/hr/employees/${e.id}`, { params: { companyId } });
      else await axios.put(`/api/hr/employees/${e.id}`, toForm({ companyId, termsAcceptedOn: today() }), { params: { companyId } });
      setAsk(null); setSelId(null); onChanged(what === 'delete' ? `Deleted ${e.name}.` : `${e.name} — employment agreement marked signed today.`);
    } catch (er) { onChanged(er.response?.data?.error || 'Could not do that.'); } finally { setBusy(false); }
  };
  /* the signed joining form (filled by hand by the employee) — kept with the employee's documents */
  /* signed copies (filled / signed by hand by the employee) — kept with the employee's documents
     joining: the joining form · agreement: the employment agreement (also marks it signed today, if not marked yet) */
  const uploadSigned = (what) => async ev => {
    const fl = [...(ev.target.files || [])]; ev.target.value = '';
    if (!fl.length || !sel) return;
    setUm(false); setBusy(true);
    if (what === 'photo' && !/^image\//.test(fl[0].type)) { onChanged('Choose a photo (JPG / PNG) for the ID card.'); return; }
    const doc = what === 'agreement' ? 'Signed employment agreement' : what === 'photo' ? 'Photo' : 'Signed joining form';
    const fields = what === 'agreement' ? { termsAcceptedOn: sel.termsAcceptedOn || today() } : what === 'photo' ? {} : { joiningFormOn: sel.joiningFormOn || today() };
    try { await axios.put(`/api/hr/employees/${sel.id}`, toForm({ companyId, ...fields }, fl, fl.map(f => `${doc} — ${f.name}`)), { params: { companyId } }); onChanged(`${doc} uploaded for ${sel.name}.`); }
    catch (er) { onChanged(er.response?.data?.error || 'Could not upload the file.'); } finally { setBusy(false); }
  };
  const [pm, setPm] = useState(false), [am, setAm] = useState(false), [um, setUm] = useState(false);   // the Print, Actions and Upload menus
  useEffect(() => { if (!pm && !am && !um) return undefined; const c = e => { if (!e.target.closest('.emp-pm')) { setPm(false); setAm(false); setUm(false); } }; document.addEventListener('mousedown', c); return () => document.removeEventListener('mousedown', c); }, [pm, am, um]);
  const report = async () => {
    setBusy(true);
    try { const r = await axios.get(`/api/hr/employees/${sel.id}/history`, { params: { companyId } }); await printEmployeeReport({ emp: r.data.employee || sel, history: r.data, company, user }); }
    catch (er) { onChanged(er.response?.data?.error || 'Could not load the employee history.'); } finally { setBusy(false); }
  };
  return (
    <>
      {slot && createPortal(<>
        <input className="sb-search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search code, name, designation…" aria-label="Search employees" style={{ width: 190 }} />
        <select className="sb-search" style={{ width: 120 }} value={st} onChange={e => setSt(e.target.value)} aria-label="Status"><option value="">All</option>{EMP_STATUS.map(s => <option key={s}>{s}</option>)}</select>
        <button type="button" className="sb-tbtn" onClick={() => printDepList({ title: 'EMPLOYEE LIST', company, user, filter: st || 'All', total: list.reduce((t, e) => t + grossOf(e.salary), 0),
          heads: ['Code', 'Name', 'Designation', 'Department', 'Mobile', 'Joining', 'Type', 'Gross / month ₹', 'PAN', 'UAN', 'Terms accepted', 'Status'],
          rows: list.map(e => [e.empCode, e.name, e.designation, e.department, e.mobile, dmy(e.joiningDate), e.employmentType, amt(grossOf(e.salary)), e.pan, e.uan, dmy(e.termsAcceptedOn), e.status]) })}><Svg name="file" size={13} />Print list</button>
        <div className="sb-tools">
          <span className="sb-picked">{sel ? <b>{sel.empCode || sel.name}</b> : 'Select an employee'}</span>
          <div className="emp-pm">
            <button type="button" className="sb-tbtn" onClick={() => { setAm(false); setUm(false); setPm(v => !v); }} aria-expanded={pm} aria-haspopup="menu"><Svg name="file" size={13} />Print<Svg name="chevDown" size={12} /></button>
            {pm && <div className="emp-pmm" role="menu" onClick={() => setPm(false)}>
              <button type="button" role="menuitem" onClick={() => printJoiningForm({ emp: sel, company, user })}><b>{sel ? 'Joining form' : 'Blank joining form'}</b><small>{sel ? `Filled from ${sel.name}'s record — to check & sign` : 'Give to the new employee to fill by hand'}</small></button>
              <button type="button" role="menuitem" onClick={() => printAssetIssueForm({ emp: sel, settings, company, user })}><b>Asset issue form</b><small>Fill by hand when giving assets</small></button>
              <button type="button" role="menuitem" disabled={!sel} onClick={() => printEmploymentAgreement({ emp: sel, settings, company, user })}><b>Employment agreement</b><small>Permanent / temporary / trainee terms</small></button>
              <button type="button" role="menuitem" disabled={!sel || !assetsOf(sel).length} onClick={() => printAssetAgreement({ assets: assetsOf(sel), emp: sel, settings, company, user })}><b>Asset agreement</b><small>All company assets with this employee</small></button>
              <button type="button" role="menuitem" onClick={() => printIdCards({ emps: sel ? [sel] : all.filter(x => x.status === 'Active'), company, user })}><b>{sel ? 'ID card' : 'ID cards — all active employees'}</b><small>{sel ? `${photoFileOf(sel) ? 'With photo' : 'No photo yet — Upload ▸ Photo for ID card'} · front & back` : `${all.filter(x => x.status === 'Active').length} cards, 3 per A4 page`}</small></button>
              {sel && <button type="button" role="menuitem" onClick={() => printIdCards({ emps: all.filter(x => x.status === 'Active'), company, user })}><b>ID cards — all active employees</b><small>{all.filter(x => x.status === 'Active').length} cards, 3 per A4 page</small></button>}
              <button type="button" role="menuitem" disabled={!sel || busy} onClick={report}><b>Full report</b><small>Joining till date, attendance &amp; salary</small></button>
            </div>}
          </div>
          {canEdit && <div className="emp-pm">
            <button type="button" className="sb-tbtn" disabled={!sel || busy} onClick={() => { setPm(false); setAm(false); setUm(v => !v); }} aria-expanded={um} aria-haspopup="menu" title="Upload a signed copy (PDF / photo) or the photo for the ID card"><Svg name="file" size={13} />Upload<Svg name="chevDown" size={12} /></button>
            {um && sel && <div className="emp-pmm" role="menu">
              <label role="menuitem" className="emp-up"><b>Joining form</b><small>{sel.joiningFormOn ? `Uploaded ${dmy(sel.joiningFormOn)} — add another file` : 'The form filled & signed by the employee'}</small><input type="file" hidden multiple accept=".pdf,image/*" onChange={uploadSigned('joining')} /></label>
              <label role="menuitem" className="emp-up"><b>Employment agreement</b><small>{hasDoc(sel, 'Signed employment agreement') ? 'Uploaded — add another file' : 'Signed by the employee — also marks the agreement signed'}</small><input type="file" hidden multiple accept=".pdf,image/*" onChange={uploadSigned('agreement')} /></label>
              <label role="menuitem" className="emp-up"><b>Photo for ID card</b><small>{photoFileOf(sel) ? 'Photo on file — choose to replace it' : 'Passport-size photo (JPG / PNG)'}</small><input type="file" hidden accept="image/*" onChange={uploadSigned('photo')} /></label>
            </div>}
          </div>}
          {canEdit && <div className="emp-pm">
            <button type="button" className="sb-tbtn" disabled={!sel} onClick={() => { setPm(false); setUm(false); setAm(v => !v); }} aria-expanded={am} aria-haspopup="menu"><Svg name="settings" size={13} />Actions<Svg name="chevDown" size={12} /></button>
            {am && sel && <div className="emp-pmm" role="menu" onClick={() => setAm(false)}>
              <button type="button" role="menuitem" disabled={sel.status === 'Left'} onClick={() => onRevise(sel)}><b>Salary revision</b><small>Increase / change the salary from a month</small></button>
              <button type="button" role="menuitem" onClick={() => onFnf(sel)}><b>Full &amp; final settlement</b><small>When the employee resigns / leaves</small></button>
              <button type="button" role="menuitem" disabled={!!sel.termsAcceptedOn || busy} onClick={() => act(sel, 'accept')}><b>Agreement signed</b><small>{sel.termsAcceptedOn ? 'Already marked signed' : 'The employee signed the employment agreement'}</small></button>
            </div>}
          </div>}
          {canEdit && <button type="button" className="sb-tbtn" disabled={!sel} onClick={() => onEdit(sel)}><Svg name="settings" size={13} />Edit</button>}
          {canDel && <button type="button" className="sb-tbtn del" disabled={!sel} onClick={() => setAsk(sel)}><Svg name="x" size={13} />Delete</button>}
        </div>
      </>, slot)}
      {ask && <div className="sb-ask" role="alertdialog" aria-label="Confirm delete"><span><b>Delete {ask.name}</b> ({ask.empCode})? If salary was paid, set the status to “Left” instead.</span>
        <button type="button" className="sb-abtn" onClick={() => setAsk(null)} disabled={busy}>Keep</button><button type="button" className="sb-abtn danger" onClick={() => act(ask, 'delete')} disabled={busy}>{busy ? 'Deleting…' : 'Yes, delete'}</button></div>}
      <div className="ac-sum">
        <div>Active employees<b>{all.filter(e => e.status === 'Active').length}</b></div>
        <div>On notice<b style={{ color: '#B54708' }}>{all.filter(e => e.status === 'On notice').length}</b></div>
        <div>Monthly gross (active)<b>₹ {amt(all.filter(e => e.status === 'Active').reduce((t, e) => t + grossOf(e.salary), 0))}</b></div>
        <div>Terms not accepted<b style={{ color: '#B42318' }}>{all.filter(e => e.status === 'Active' && !e.termsAcceptedOn).length}</b></div>
        <div>Assets with staff<b>{assets.filter(a => a.status === 'issued').length}</b></div>
      </div>
      <div className="sb-list">
        <table className="sb-t px acx">
          <colgroup>{[3, 7, 15, 12, 10, 9, 8, 9, 9, 10, 8].map((x, i) => <col key={i} style={{ width: `${x}%` }} />)}</colgroup>
          <thead><tr><th className="r">Sr</th><th>Code</th><th>Name</th><th>Designation</th><th>Department</th><th>Mobile</th><th>Joining</th><th className="r">Gross / month ₹</th><th>Agreement</th><th>Company assets</th><th>Status</th></tr></thead>
          <tbody>
            {emps === null ? <tr><td colSpan={11} className="sb-empty">Loading…</td></tr>
              : !list.length ? <tr><td colSpan={11} className="sb-empty">{q || st ? 'Nothing matches.' : 'No employee yet — click “Add Employee (Joining)”.'}</td></tr>
                : list.map((e, i) => { const [bg, fg] = STATUS_PILL[e.status] || STATUS_PILL.Active, as = assetsOf(e); return (
                  <tr key={e.id} className={selId === e.id ? 'sel' : ''} onClick={() => setSelId(e.id)} onDoubleClick={() => canEdit && onEdit(e)} style={{ cursor: 'pointer' }}>
                    <td className="r">{i + 1}</td><td className="mono b">{e.empCode}</td>
                    <td className="b">{e.name}{e.fatherName && <span className="sm">S/o {e.fatherName}</span>}{e.joiningFormOn && <span className="sm" style={{ color: '#067647' }}>✓ joining form signed</span>}</td>
                    <td>{e.designation || '—'}<span className="sm" style={{ fontWeight: 700, color: FIXED.includes(kindOf(e)) ? '#B54708' : '#067647' }}>{kindOf(e)}{e.contractEndDate && FIXED.includes(kindOf(e)) ? ` till ${dmy(e.contractEndDate)}` : ''}</span></td><td>{e.department || '—'}</td>
                    <td className="d">{e.mobile || '—'}</td><td className="d">{dmy(e.joiningDate)}</td><td className="r b d">{amt(grossOf(e.salary))}{(e.salaryHistory || []).length > 0 && <span className="sm">from {monthLabel(e.salaryHistory[e.salaryHistory.length - 1].effectiveFrom)}</span>}</td>
                    <td>{e.termsAcceptedOn ? <span className="ac-pill" style={{ background: '#ECFDF3', color: '#067647' }}>✓ {dmy(e.termsAcceptedOn)}</span> : <span className="ac-pill" style={{ background: '#FEF3F2', color: '#B42318' }}>Pending</span>}
                      {e.termsAcceptedOn && <span className="sm" style={{ color: hasDoc(e, 'Signed employment agreement') ? '#067647' : '#B54708' }}>{hasDoc(e, 'Signed employment agreement') ? '✓ signed copy on file' : 'signed copy not uploaded'}</span>}</td>
                    <td>{as.length ? as.map(a => a.assetType || a.assetName).join(', ') : '—'}</td>
                    <td><span className="ac-pill" style={{ background: bg, color: fg }}>{e.status}</span>{e.fnf && <span className="sm">F&amp;F {e.fnf.paidOn ? 'paid' : 'prepared'}{e.fnf.returnCopyOn ? ' · copy back' : ''}</span>}</td>
                  </tr>); })}
          </tbody>
        </table>
      </div>
    </>
  );
}

function EmpForm({ companyId, edit, settings, onSaved, onCancel }) {
  const [f, setF] = useState(() => ({ ...BLANK, weeklyOff: settings.weeklyOff || 'Sunday', ...(edit || {}) }));
  const [sal, setSal] = useState(() => { const s = { ...BLANK_SAL, ...(edit?.salary || {}) }; ['pfApplicable', 'esiApplicable', 'ptApplicable'].forEach(k => { s[k] = s[k] === true || s[k] === 'true'; }); return s; });
  const [keep, setKeep] = useState(() => (edit?.files || []).map(x => x.fileName));
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  useEffect(() => { if (!edit && companyId) axios.get('/api/hr/employees/next-code', { params: { companyId } }).then(r => setF(p => (p.empCode ? p : { ...p, empCode: r.data?.empCode || '' }))).catch(() => {}); }, [edit, companyId]);
  const set = k => e => { const x = e.target.value; setF(p => ({ ...p, [k]: x })); setMsg(null); };
  const setS = k => e => { const x = e.target.type === 'checkbox' ? e.target.checked : e.target.value.replace(/[^\d.]/g, ''); setSal(p => ({ ...p, [k]: x })); };
  const gross = grossOf(sal);
  const save = async () => {
    if (!f.name.trim()) return setMsg({ k: 'err', t: 'Enter the employee name.' });
    if (!f.joiningDate) return setMsg({ k: 'err', t: 'Enter the joining date.' });
    if (f.pan && !/^[A-Z]{5}\d{4}[A-Z]$/i.test(f.pan.trim())) return setMsg({ k: 'err', t: 'PAN should look like ABCDE1234F.' });
    if (f.ifsc && !/^[A-Z]{4}0[A-Z0-9]{6}$/i.test(f.ifsc.trim())) return setMsg({ k: 'err', t: 'IFSC should look like SBIN0005743.' });
    if (f.aadhaar && !/^\d{12}$/.test(f.aadhaar.replace(/\s/g, ''))) return setMsg({ k: 'err', t: 'Aadhaar should be 12 digits.' });
    if (f.mobile && !/^[\d+\-\s]{10,15}$/.test(f.mobile.trim())) return setMsg({ k: 'err', t: 'Check the mobile number.' });
    if (f.status === 'Left' && !f.leavingDate) return setMsg({ k: 'err', t: 'Enter the leaving date for an employee who has left.' });
    if (FIXED.includes(f.employmentType) && !f.contractEndDate) return setMsg({ k: 'err', t: `Enter the end date of the ${f.employmentType.toLowerCase()} period.` });
    if (f.contractEndDate && f.contractEndDate < f.joiningDate) return setMsg({ k: 'err', t: 'The end date is before the joining date.' });
    setBusy(true);
    const { id, files: _f, audit, createdAt, updatedAt, salary, fnf, ...body } = f;
    const fd = toForm({ ...body, pan: String(body.pan || '').toUpperCase(), ifsc: String(body.ifsc || '').toUpperCase(), aadhaar: String(body.aadhaar || '').replace(/\s/g, ''), companyId, salary: sal, ...(edit ? { keepFiles: keep } : {}) }, files, files.map(x => x.name));
    try {
      if (edit) await axios.put(`/api/hr/employees/${edit.id}`, fd, { params: { companyId } }); else await axios.post('/api/hr/employees', fd, { params: { companyId } });
      onSaved(`${edit ? 'Updated' : 'Added'} ${f.name}${edit ? '' : ` (${f.empCode})`}. Print the employment agreement from the list for signature.`);
    } catch (e) { setMsg({ k: 'err', t: e.response?.data?.error || 'Could not save the employee.' }); }
    finally { setBusy(false); }
  };
  const I = (k, ph, extra = {}) => <input value={f[k] || ''} onChange={set(k)} placeholder={ph} {...extra} />;
  const S = (k, opts, extra = {}) => <select value={f[k] || ''} onChange={set(k)} {...extra}><option value="">—</option>{[...new Set([...opts, ...(f[k] ? [f[k]] : [])])].map(o => <option key={o}>{o}</option>)}</select>;
  const N = k => <input className="num" inputMode="decimal" value={sal[k]} onChange={setS(k)} placeholder="0" />;
  return (
    <div className="sf">
      <div className="sf-hero"><span className="ic"><Svg name="user" size={15} /></span><h1>{edit ? `Edit ${edit.name}` : 'Add Employee — Joining'}</h1><span className="grow" /></div>
      <div className="sf-2" style={{ marginTop: 10 }}>
        <div className="sf-card"><div className="sf-ch"><span className="ico"><Svg name="user" size={13} /></span><b>Personal</b></div>
          <table className="sf-kv"><tbody>
            <tr><th>Employee code</th><td>{I('empCode', 'EMP001', { className: 'mono' })}</td></tr>
            <tr><th>Full name <i>*</i></th><td>{I('name', 'As per Aadhaar', { autoFocus: !edit })}</td></tr>
            <tr><th>Father / spouse name</th><td>{I('fatherName')}</td></tr>
            <tr><th>Date of birth</th><td><input type="date" value={f.dob || ''} onChange={set('dob')} /></td></tr>
            <tr><th>Gender / marital</th><td style={{ display: 'flex', gap: 6 }}>{S('gender', ['Male', 'Female', 'Other'])}{S('maritalStatus', ['Single', 'Married'])}{S('bloodGroup', ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'])}</td></tr>
            <tr><th>Mobile / alternate</th><td style={{ display: 'flex', gap: 6 }}>{I('mobile', 'Mobile', { inputMode: 'tel' })}{I('altMobile', 'Alternate', { inputMode: 'tel' })}</td></tr>
            <tr><th>Email</th><td>{I('email', '', { type: 'email' })}</td></tr>
            <tr><th>Current address</th><td><textarea className="ac-ta" value={f.currentAddress || ''} onChange={set('currentAddress')} /></td></tr>
            <tr><th>Permanent address</th><td><textarea className="ac-ta" value={f.permanentAddress || ''} onChange={set('permanentAddress')} placeholder="Leave empty if same as current" /></td></tr>
            <tr><th>Emergency contact</th><td style={{ display: 'flex', gap: 6 }}>{I('emergencyName', 'Name & relation')}{I('emergencyMobile', 'Mobile', { inputMode: 'tel' })}</td></tr>
            <tr><th>Qualification / experience</th><td style={{ display: 'flex', gap: 6 }}>{I('qualification', 'e.g. B.E. Civil')}{I('experience', 'e.g. 3 years')}</td></tr>
          </tbody></table></div>
        <div className="sf-card"><div className="sf-ch"><span className="ico"><Svg name="badge" size={13} /></span><b>Job &amp; joining terms</b></div>
          <table className="sf-kv"><tbody>
            <tr><th>Joining date <i>*</i></th><td><input type="date" value={f.joiningDate || ''} onChange={set('joiningDate')} /></td></tr>
            <tr><th>Designation</th><td>{I('designation', 'e.g. Site Engineer')}</td></tr>
            <tr><th>Department</th><td>{S('department', DEPARTMENTS)}</td></tr>
            <tr><th>Nature of employment</th><td>{S('employmentType', TYPES)}<div style={{ fontSize: 11, color: '#667085', marginTop: 3 }}>Printed clearly on the employment agreement — Permanent / Temporary / Trainee…</div></td></tr>
            {FIXED.includes(f.employmentType) && <tr><th>{['Trainee', 'Intern'].includes(f.employmentType) ? 'Training ends on' : 'Contract ends on'} <i>*</i></th><td><input type="date" value={f.contractEndDate || ''} onChange={set('contractEndDate')} /></td></tr>}
            {['Trainee', 'Intern'].includes(f.employmentType) && <tr><th>Stipend note</th><td>{I('stipend', 'e.g. ₹ 10,000 per month, no other benefits')}</td></tr>}
            <tr><th>Reporting to</th><td>{I('reportingTo', 'Manager name')}</td></tr>
            <tr><th>Work location</th><td>{I('workLocation', 'Office / factory / site')}</td></tr>
            <tr><th>Probation / notice</th><td style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input className="num" value={f.probationMonths || ''} onChange={set('probationMonths')} style={{ maxWidth: 70 }} aria-label="Probation months" /> months &nbsp; <input className="num" value={f.noticeDays || ''} onChange={set('noticeDays')} style={{ maxWidth: 70 }} aria-label="Notice days" /> days notice</td></tr>
            <tr><th>Working hours / shift</th><td style={{ display: 'flex', gap: 6 }}>{I('workHours', '9:30 AM – 6:30 PM')}{I('shift', 'Shift (optional)')}</td></tr>
            <tr><th>Weekly off</th><td>{S('weeklyOff', WEEK)}</td></tr>
            <tr><th>Agreement signed on</th><td><input type="date" value={f.termsAcceptedOn || ''} onChange={set('termsAcceptedOn')} /><div style={{ fontSize: 11, color: '#667085', marginTop: 3 }}>The date the employee signed the employment agreement.</div></td></tr>
            <tr><th>Status</th><td style={{ display: 'flex', gap: 6 }}>{S('status', EMP_STATUS)}{f.status !== 'Active' && <input type="date" value={f.leavingDate || ''} onChange={set('leavingDate')} aria-label="Leaving date" title="Leaving / last working date" />}</td></tr>
            {f.status !== 'Active' && <tr><th>Leaving reason</th><td>{I('leavingReason')}</td></tr>}
          </tbody></table></div>
      </div>
      <div className="sf-2">
        <div className="sf-card"><div className="sf-ch"><span className="ico"><Svg name="wallet" size={13} /></span><b>Salary structure (per month)</b><span className="grow" /><span style={{ fontSize: 12, color: '#fff' }}>Gross ₹ {amt(gross)} · CTC ₹ {amt(gross * 12)} / year</span></div>
          <table className="sf-kv"><tbody>
            <tr><th>Basic ₹</th><td>{N('basic')}</td></tr><tr><th>HRA ₹</th><td>{N('hra')}</td></tr><tr><th>Conveyance ₹</th><td>{N('conveyance')}</td></tr>
            <tr><th>Special allowance ₹</th><td>{N('special')}</td></tr><tr><th>Other allowance ₹</th><td>{N('other')}</td></tr>
            <tr><th>TDS / month ₹</th><td>{N('tds')}</td></tr>
            <tr><th>Deductions</th><td className="hr-chk">{[['pfApplicable', 'PF (12% of basic)'], ['esiApplicable', 'ESI (gross ≤ ₹21,000)'], ['ptApplicable', 'Professional Tax']].map(([k, l]) => <label key={k}><input type="checkbox" checked={!!sal[k]} onChange={setS(k)} />{l}</label>)}</td></tr>
          </tbody></table></div>
        <div className="sf-card"><div className="sf-ch"><span className="ico"><Svg name="shield" size={13} /></span><b>Statutory &amp; bank</b></div>
          <table className="sf-kv"><tbody>
            <tr><th>PAN</th><td>{I('pan', 'ABCDE1234F', { className: 'mono' })}</td></tr>
            <tr><th>Aadhaar</th><td>{I('aadhaar', '12 digits', { className: 'mono', inputMode: 'numeric' })}</td></tr>
            <tr><th>UAN / PF No.</th><td style={{ display: 'flex', gap: 6 }}>{I('uan', 'UAN', { className: 'mono' })}{I('pfNo', 'PF No.', { className: 'mono' })}</td></tr>
            <tr><th>ESIC No.</th><td>{I('esicNo', '', { className: 'mono' })}</td></tr>
            <tr><th>Bank</th><td>{I('bankName', 'Bank name')}</td></tr>
            <tr><th>A/c No. / IFSC</th><td style={{ display: 'flex', gap: 6 }}>{I('bankAccount', 'Account no.', { className: 'mono' })}{I('ifsc', 'IFSC', { className: 'mono' })}</td></tr>
            <tr><th>Account holder</th><td>{I('accountHolder', 'If different from the employee')}</td></tr>
            <tr><th>Remarks</th><td>{I('remarks')}</td></tr>
          </tbody></table></div>
      </div>
      <div className="sf-card"><div className="sf-ch"><span className="ico"><Svg name="file" size={13} /></span><b>Documents (Aadhaar, PAN, photo, certificates, signed joining letter…)</b><span className="grow" />
        <label className="sf-lnk" style={{ cursor: 'pointer' }}>+ Attach file<input type="file" multiple hidden accept=".pdf,image/*" onChange={e => { const l = [...(e.target.files || [])]; e.target.value = ''; setFiles(x => [...x, ...l]); }} /></label></div>
        {!(edit?.files || []).length && !files.length ? <div className="sf-empty">No document yet. Files upload when you save.</div> : (
          <table className="ac-docs"><tbody>
            {(edit?.files || []).map(x => <tr key={x.fileName} style={{ opacity: keep.includes(x.fileName) ? 1 : 0.45 }}><td>{x.name || x.fileName}</td>
              <td style={{ width: 170, textAlign: 'right' }}><button type="button" className="sf-lnk" onClick={() => viewHrFile('employees', edit.id, x, companyId).catch(() => setMsg({ k: 'err', t: 'Could not open the file.' }))}>View</button> <button type="button" className="sf-lnk" onClick={() => setKeep(k => (k.includes(x.fileName) ? k.filter(y => y !== x.fileName) : [...k, x.fileName]))}>{keep.includes(x.fileName) ? 'Remove' : 'Keep'}</button></td></tr>)}
            {files.map((x, i) => <tr key={`n${i}`}><td>{x.name} <span style={{ color: '#B54708' }}>· uploads on save</span></td><td style={{ textAlign: 'right' }}><button type="button" className="sf-lnk" onClick={() => setFiles(l => l.filter((_, j) => j !== i))}>Remove</button></td></tr>)}
          </tbody></table>)}
      </div>
      {msg && <div className={`sf-msg ${msg.k}`} role="status">{msg.t}</div>}
      <div className="sf-bar">
        <div className="info">{f.name || 'New employee'} · {f.designation || '—'} · joining {dmy(f.joiningDate) || '—'} · gross ₹ {amt(gross)} / month</div>
        <button type="button" className="sf-b ghost" onClick={onCancel} disabled={busy}>Cancel</button>
        <button type="button" className="sf-b pri" onClick={save} disabled={busy}>{busy ? 'Saving…' : edit ? 'Update' : 'Save employee'}</button>
      </div>
    </div>
  );
}

/* Full & final settlement — when the employee leaves. Saved on the employee (fnf); printed as Office copy + Employee copy. */
function FnfForm({ companyId, emp, assets, company, user, onSaved, onCancel }) {
  const f0 = emp.fnf || {};
  const lwd0 = f0.lastWorkingDay || emp.leavingDate || today();
  const open = assets.filter(a => ['issued', 'lost', 'damaged'].includes(a.status));
  const [v, setV] = useState(() => ({ settlementDate: f0.settlementDate || today(), resignationDate: f0.resignationDate || '', lastWorkingDay: lwd0,
    noticeServedDays: f0.noticeServedDays ?? '', salaryDays: f0.salaryDays ?? String(Number(lwd0.slice(8, 10)) || ''), leaveDays: f0.leaveDays ?? '',
    bonus: f0.bonus ?? '', gratuity: f0.gratuity ?? '', otherEarning: f0.otherEarning ?? '', otherEarningNote: f0.otherEarningNote || '',
    noticeShortDays: f0.noticeShortDays ?? '', advance: f0.advance ?? '', assetRecovery: f0.assetRecovery ?? String(open.reduce((t, a) => t + (Number(a.value) || 0), 0) || ''),
    tds: f0.tds ?? '', otherDeduction: f0.otherDeduction ?? '', otherDeductionNote: f0.otherDeductionNote || '',
    paidOn: f0.paidOn || '', paidVia: f0.paidVia || '', paidRef: f0.paidRef || '', notes: f0.notes || '', returnCopyOn: f0.returnCopyOn || '' }));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const set = k => e => { const x = e.target.value; setV(o => ({ ...o, [k]: x })); setMsg(null); };
  const num = k => e => { const x = e.target.value.replace(/[^\d.]/g, ''); setV(o => ({ ...o, [k]: x })); setMsg(null); };
  // notice served → shortfall (only while the shortfall was not typed)
  const served = Number(v.noticeServedDays), need = Number(emp.noticeDays) || 0;
  const c = fnfCalc(emp, v, assets);
  const years = emp.joiningDate ? (new Date(v.lastWorkingDay) - new Date(emp.joiningDate)) / (365.25 * 864e5) : 0;
  const gratuityHint = years >= 5 ? `Eligible (${years.toFixed(1)} yrs): basic ₹ ${amt(emp.salary?.basic)} × 15/26 × ${Math.floor(years)} = ₹ ${amt((Number(emp.salary?.basic) || 0) * 15 / 26 * Math.floor(years))}` : `Not eligible — ${years.toFixed(1)} years of service (5 needed)`;
  const N = (k, ph) => <input className="num" inputMode="decimal" value={v[k]} onChange={num(k)} placeholder={ph || '0'} />;
  const save = async (thenPrint) => {
    if (!v.lastWorkingDay) return setMsg({ k: 'err', t: 'Enter the last working day.' });
    if (emp.joiningDate && v.lastWorkingDay < emp.joiningDate) return setMsg({ k: 'err', t: 'The last working day is before the joining date.' });
    setBusy(true);
    try {
      const body = { companyId, fnf: v, status: emp.status === 'Active' ? 'On notice' : emp.status, leavingDate: emp.leavingDate || v.lastWorkingDay };
      if (v.paidOn) body.status = 'Left';
      await axios.put(`/api/hr/employees/${emp.id}`, toForm(body), { params: { companyId } });
      if (thenPrint) await printFnf({ emp: { ...emp, leavingDate: body.leavingDate }, fnf: v, assets, company, user });
      onSaved(`Full & final settlement of ${emp.name} saved — net ${c.net >= 0 ? 'payable' : 'recoverable'} ₹ ${amt(Math.abs(c.net))}.${v.paidOn ? ' Status set to Left.' : ''}`);
    } catch (e) { setMsg({ k: 'err', t: e.response?.data?.error || 'Could not save the settlement.' }); }
    finally { setBusy(false); }
  };
  return (
    <div className="sf">
      <div className="sf-hero"><span className="ic"><Svg name="wallet" size={15} /></span><h1>Full &amp; Final Settlement — {emp.name} ({emp.empCode})</h1><span className="grow" /></div>
      {emp.status === 'Active' && <div className="sf-msg ok" style={{ marginTop: 10 }}>{emp.name} is Active. Saving this settlement marks the employee <b>On notice</b> with the last working day below; when you enter the paid date, the status becomes <b>Left</b>.</div>}
      <div className="sf-2" style={{ marginTop: 10 }}>
        <div className="sf-card"><div className="sf-ch"><span className="ico"><Svg name="clock" size={13} /></span><b>Leaving</b><span className="grow" /><span style={{ fontSize: 12, color: '#fff' }}>Gross ₹ {amt(c.g)} · per day ₹ {amt(c.perDay)} (÷ {c.mDays} days)</span></div>
          <table className="sf-kv"><tbody>
            <tr><th>Resignation / notice date</th><td><input type="date" value={v.resignationDate} onChange={set('resignationDate')} /></td></tr>
            <tr><th>Last working day <i>*</i></th><td><input type="date" value={v.lastWorkingDay} onChange={set('lastWorkingDay')} /></td></tr>
            <tr><th>Notice served (days)</th><td style={{ display: 'flex', gap: 6, alignItems: 'center' }}>{N('noticeServedDays')}<span style={{ fontSize: 12, color: '#667085', whiteSpace: 'nowrap' }}>of {need || '—'} days{need && v.noticeServedDays !== '' && served < need ? <> · <button type="button" className="sf-lnk" onClick={() => setV(o => ({ ...o, noticeShortDays: String(need - served) }))}>short {need - served} → recover</button></> : ''}</span></td></tr>
            <tr><th>Settlement date</th><td><input type="date" value={v.settlementDate} onChange={set('settlementDate')} /></td></tr>
            <tr><th>Paid on / via / ref</th><td style={{ display: 'flex', gap: 6 }}><input type="date" value={v.paidOn} onChange={set('paidOn')} style={{ maxWidth: 150 }} /><select value={v.paidVia} onChange={set('paidVia')} style={{ maxWidth: 110 }}><option value="">—</option>{['NEFT', 'RTGS', 'IMPS', 'Cheque', 'Cash', 'UPI'].map(m => <option key={m}>{m}</option>)}</select><input value={v.paidRef} onChange={set('paidRef')} placeholder="UTR / cheque" /></td></tr>
            <tr><th>Signed copy received back</th><td><input type="date" value={v.returnCopyOn} onChange={set('returnCopyOn')} /><div style={{ fontSize: 11, color: '#667085', marginTop: 3 }}>The date the employee returned the signed OFFICE COPY.</div></td></tr>
            <tr><th>Notes</th><td><input value={v.notes} onChange={set('notes')} placeholder="Optional — printed" /></td></tr>
          </tbody></table></div>
        <div className="sf-card"><div className="sf-ch"><span className="ico"><Svg name="box" size={13} /></span><b>Company assets</b></div>
          {!assets.length ? <div className="sf-empty">No company asset was given to {emp.name}.</div> : (
            <table className="ac-docs"><tbody>{assets.map(a => <tr key={a.id}><td><b>{a.assetName}</b> <span style={{ color: '#667085' }}>{a.assetType}</span></td><td>{Number(a.value) ? `₹ ${amt(a.value)}` : ''}</td>
              <td style={{ textAlign: 'right' }}>{a.status === 'returned' ? <span className="ac-pill" style={{ background: '#ECFDF3', color: '#067647' }}>Returned {dmy(a.returnedOn)}</span> : <span className="ac-pill" style={{ background: '#FEF3F2', color: '#B42318' }}>{a.status === 'issued' ? 'Not returned' : a.status}</span>}</td></tr>)}</tbody></table>)}
          {open.length > 0 && <div className="sf-msg err" style={{ margin: 8 }}>{open.length} asset(s) not returned — return them in HR → Company Assets, or recover the value below.</div>}
        </div>
      </div>
      <div className="sf-2">
        <div className="sf-card"><div className="sf-ch"><span className="ico"><Svg name="wallet" size={13} /></span><b>Payable to the employee</b><span className="grow" /><b style={{ color: '#fff' }}>₹ {amt(c.te)}</b></div>
          <table className="sf-kv"><tbody>
            <tr><th>Salary — days worked (not yet paid)</th><td>{N('salaryDays', 'days')}<div style={{ fontSize: 11, color: '#667085', marginTop: 3 }}>= ₹ {amt((Number(v.salaryDays) || 0) * c.g / c.mDays)}</div></td></tr>
            <tr><th>Leave encashment (days)</th><td>{N('leaveDays', 'days')}<div style={{ fontSize: 11, color: '#667085', marginTop: 3 }}>= ₹ {amt((Number(v.leaveDays) || 0) * c.g / c.mDays)}</div></td></tr>
            <tr><th>Bonus ₹</th><td>{N('bonus')}</td></tr>
            <tr><th>Gratuity ₹</th><td>{N('gratuity')}<div style={{ fontSize: 11, color: years >= 5 ? '#067647' : '#667085', marginTop: 3 }}>{gratuityHint}</div></td></tr>
            <tr><th>Other ₹ / what</th><td style={{ display: 'flex', gap: 6 }}>{N('otherEarning')}<input value={v.otherEarningNote} onChange={set('otherEarningNote')} placeholder="e.g. Reimbursement" /></td></tr>
          </tbody></table></div>
        <div className="sf-card"><div className="sf-ch"><span className="ico"><Svg name="x" size={13} /></span><b>Deductions / recoverable</b><span className="grow" /><b style={{ color: '#fff' }}>₹ {amt(c.td)}</b></div>
          <table className="sf-kv"><tbody>
            <tr><th>Notice shortfall (days)</th><td>{N('noticeShortDays', 'days')}<div style={{ fontSize: 11, color: '#667085', marginTop: 3 }}>= ₹ {amt((Number(v.noticeShortDays) || 0) * c.g / c.mDays)}</div></td></tr>
            <tr><th>Advance / loan ₹</th><td>{N('advance')}</td></tr>
            <tr><th>Assets not returned ₹</th><td>{N('assetRecovery')}</td></tr>
            <tr><th>TDS ₹</th><td>{N('tds')}</td></tr>
            <tr><th>Other ₹ / what</th><td style={{ display: 'flex', gap: 6 }}>{N('otherDeduction')}<input value={v.otherDeductionNote} onChange={set('otherDeductionNote')} placeholder="e.g. Mobile bill" /></td></tr>
          </tbody></table></div>
      </div>
      {msg && <div className={`sf-msg ${msg.k}`} role="status">{msg.t}</div>}
      <div className="sf-bar">
        <div className="info" style={{ fontSize: 13 }}>Net {c.net >= 0 ? 'payable to' : 'recoverable from'} {emp.name}: <b style={{ color: c.net >= 0 ? '#067647' : '#B42318' }}>₹ {amt(Math.abs(c.net))}</b></div>
        <button type="button" className="sf-b ghost" onClick={onCancel} disabled={busy}>Cancel</button>
        <button type="button" className="sf-b ghost" onClick={() => save(false)} disabled={busy}>Save</button>
        <button type="button" className="sf-b pri" onClick={() => save(true)} disabled={busy}>{busy ? 'Saving…' : 'Save & print (2 copies)'}</button>
      </div>
    </div>
  );
}

/* Salary revision — "from Nov 2026 the salary is ₹40,000": months before keep the old salary, payroll uses the new one from that month */
function RevisionForm({ companyId, emp, company, user, onSaved, onCancel }) {
  const now = new Date(), nextM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const [eff, setEff] = useState(nextM);
  const base = salaryFor(emp, eff);
  const [sal, setSal] = useState(() => ({ ...base }));
  const [note, setNote] = useState('');
  const [pct, setPct] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const hist = (emp.salaryHistory || []).slice().sort((a, b) => String(b.effectiveFrom).localeCompare(String(a.effectiveFrom)));
  const a = grossOf(base), b = grossOf(sal), K = [['basic', 'Basic'], ['hra', 'HRA'], ['conveyance', 'Conveyance'], ['special', 'Special allowance'], ['other', 'Other allowance']];
  const setK = k => e => { const x = e.target.value.replace(/[^\d.]/g, ''); setSal(o => ({ ...o, [k]: x })); setMsg(null); };
  const applyPct = () => { const p = Number(pct) || 0; setSal(o => ({ ...o, ...Object.fromEntries(K.map(([k]) => [k, String(Math.round((Number(base[k]) || 0) * (1 + p / 100)))])) })); };
  const toTotal = t => { const target = Number(t) || 0; if (!a) return; const f = target / a; setSal(o => ({ ...o, ...Object.fromEntries(K.map(([k]) => [k, String(Math.round((Number(base[k]) || 0) * f))])) })); };
  const save = async print => {
    if (!/^\d{4}-\d{2}$/.test(eff)) return setMsg({ k: 'err', t: 'Pick the month the new salary starts from.' });
    if (Math.abs(b - a) < 0.5 && K.every(([k]) => Number(sal[k] || 0) === Number(base[k] || 0))) return setMsg({ k: 'err', t: 'The new salary is the same as now.' });
    setBusy(true);
    try {
      const r = await axios.post(`/api/hr/employees/${emp.id}/revise`, { companyId, effectiveFrom: eff, salary: sal, note }, { params: { companyId } });
      const rev = (r.data.employee.salaryHistory || []).find(h => h.effectiveFrom === eff);
      if (print && rev) await printRevisionLetter({ emp: r.data.employee, rev, company, user });
      const paid = r.data.paidMonths || [];
      onSaved(`${emp.name}: salary ₹ ${amt(a)} → ₹ ${amt(b)} from ${monthLabel(eff)}. Payroll uses the new salary from that month.${paid.length ? ` Note: salary for ${paid.map(monthLabel).join(', ')} was already paid at the old figure — open Payroll for those months and Save again to re-work them (arrears).` : ''}`);
    } catch (e) { setMsg({ k: 'err', t: e.response?.data?.error || 'Could not save the revision.' }); }
    finally { setBusy(false); }
  };
  const remove = async h => {
    if (!window.confirm(`Remove the revision from ${monthLabel(h.effectiveFrom)}? Payroll goes back to the earlier salary for those months.`)) return;
    try { await axios.delete(`/api/hr/employees/${emp.id}/revise/${h.id}`, { params: { companyId } }); onSaved(`Removed the salary revision from ${monthLabel(h.effectiveFrom)} for ${emp.name}.`); }
    catch (e) { setMsg({ k: 'err', t: e.response?.data?.error || 'Could not remove.' }); }
  };
  return (
    <div className="sf">
      <div className="sf-hero"><span className="ic"><Svg name="trendUp" size={15} /></span><h1>Salary revision — {emp.name} ({emp.empCode})</h1><span className="grow" /></div>
      <div className="sf-2" style={{ marginTop: 10 }}>
        <div className="sf-card"><div className="sf-ch"><span className="ico"><Svg name="clock" size={13} /></span><b>New salary</b><span className="grow" /><span style={{ fontSize: 12, color: '#fff' }}>Now ₹ {amt(a)} → <b>₹ {amt(b)}</b>{a ? ` (${b >= a ? '+' : ''}${Math.round((b - a) / a * 1000) / 10}%)` : ''}</span></div>
          <table className="sf-kv"><tbody>
            <tr><th>Effective from (month) <i>*</i></th><td><input type="month" value={eff} onChange={e => { const m = e.target.value; setEff(m); setSal({ ...salaryFor(emp, m) }); setMsg(null); }} style={{ maxWidth: 180 }} />
              <div style={{ fontSize: 11, color: '#667085', marginTop: 3 }}>Payroll uses the old salary before this month and the new one from this month.</div></td></tr>
            <tr><th>Quick: increase by %</th><td style={{ display: 'flex', gap: 6 }}><input className="num" inputMode="decimal" value={pct} onChange={e => setPct(e.target.value.replace(/[^\d.-]/g, ''))} placeholder="e.g. 5" style={{ maxWidth: 90 }} /><button type="button" className="sf-lnk" onClick={applyPct}>Apply</button>
              <span style={{ fontSize: 12, color: '#667085', alignSelf: 'center' }}>or new gross</span><input className="num" inputMode="decimal" placeholder="e.g. 40000" style={{ maxWidth: 110 }} onKeyDown={e => { if (e.key === 'Enter') toTotal(e.currentTarget.value); }} onBlur={e => e.currentTarget.value && toTotal(e.currentTarget.value)} aria-label="New gross" /></td></tr>
            {K.map(([k, l]) => <tr key={k}><th>{l} ₹</th><td style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input className="num" inputMode="decimal" value={sal[k] ?? ''} onChange={setK(k)} style={{ maxWidth: 140 }} /><span style={{ fontSize: 11.5, color: '#667085' }}>was ₹ {amt(base[k])}</span></td></tr>)}
            <tr><th>Reason / note</th><td><input value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. Annual increment 2026 — printed on the letter" /></td></tr>
          </tbody></table></div>
        <div className="sf-card"><div className="sf-ch"><span className="ico"><Svg name="chart" size={13} /></span><b>Salary history</b></div>
          {!hist.length ? <div className="sf-empty">No revision yet — current gross ₹ {amt(grossOf(emp.salary))} since joining {dmy(emp.joiningDate)}.</div> : (
            <table className="ac-docs"><tbody>{hist.map(h => { const x = grossOf(h.from), y = grossOf(h.to); return (
              <tr key={h.id}><td><b>From {monthLabel(h.effectiveFrom)}</b><div style={{ fontSize: 11, color: '#667085' }}>{h.note || ''}{h.by ? ` · by ${h.by} on ${dmy(h.revisedOn)}` : ''}</div></td>
                <td style={{ whiteSpace: 'nowrap' }}>₹ {amt(x)} → <b>₹ {amt(y)}</b>{x ? <span style={{ color: y >= x ? '#067647' : '#B42318' }}> ({y >= x ? '+' : ''}{Math.round((y - x) / x * 1000) / 10}%)</span> : ''}</td>
                <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}><button type="button" className="sf-lnk" onClick={() => printRevisionLetter({ emp, rev: h, company, user })}>Letter</button> <button type="button" className="sf-lnk" style={{ color: '#B42318' }} onClick={() => remove(h)}>Remove</button></td></tr>); })}
              <tr><td colSpan={3} style={{ fontSize: 11.5, color: '#667085' }}>Joined {dmy(emp.joiningDate)} at ₹ {amt(grossOf(hist[hist.length - 1].from))}</td></tr></tbody></table>)}
        </div>
      </div>
      {msg && <div className={`sf-msg ${msg.k}`} role="status">{msg.t}</div>}
      <div className="sf-bar">
        <div className="info">{emp.name}: ₹ {amt(a)} → <b>₹ {amt(b)}</b> per month from {/^\d{4}-\d{2}$/.test(eff) ? monthLabel(eff) : '—'}</div>
        <button type="button" className="sf-b ghost" onClick={onCancel} disabled={busy}>Cancel</button>
        <button type="button" className="sf-b ghost" onClick={() => save(false)} disabled={busy}>Save</button>
        <button type="button" className="sf-b pri" onClick={() => save(true)} disabled={busy}>{busy ? 'Saving…' : 'Save & print letter'}</button>
      </div>
    </div>
  );
}

/* the Print menu on the employee toolbar (keeps the toolbar short enough to fit) */
/* is a signed copy of this document among the employee's files? */
const hasDoc = (e, doc) => (e?.files || []).some(f => String(f.name || '').startsWith(doc));

export const EMP_PM_CSS = `
.emp-pm { position:relative; display:flex; align-items:stretch; }
.emp-pm > .sb-tbtn { gap:5px; }
.emp-pmm { position:absolute; right:0; top:100%; z-index:60; width:280px; background:#fff; border:1px solid #CFDCDE; border-radius:8px; box-shadow:0 12px 30px rgba(16,24,40,.18); padding:5px; }
.emp-pmm button { display:block; width:100%; text-align:left; border:0; background:none; padding:7px 10px; border-radius:6px; cursor:pointer; font:13px Inter, Arial, sans-serif; color:#101828; }
.emp-pmm button:hover:not(:disabled) { background:#EEF6F7; } .emp-pmm button:disabled { opacity:.45; cursor:default; }
.emp-pmm .emp-up { display:block; padding:7px 10px; border-radius:6px; cursor:pointer; font:13px Inter, Arial, sans-serif; color:#101828; } .emp-pmm .emp-up:hover { background:#EEF6F7; }
.emp-pmm b { display:block; font-weight:600; } .emp-pmm small { display:block; font-size:11.5px; color:#667085; margin-top:1px; }`;
