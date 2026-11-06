/* HR › Employee — full employee details (personal, job, statutory & bank, salary structure, documents).
 * "From Recruitment" picks a selected candidate: their details and CV come across, and the candidate becomes Joined. */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import { useLocation, useNavigate } from 'react-router-dom';
import { useCompany } from '../../context/CompanyContext';
import { F, money, fmtD } from '../tallyrecon/reconUi';
import { openFile, toForm, STATUS_COLOR, DEPARTMENTS } from './hrUtil';

const EMPTY = { empCode: '', name: '', fatherName: '', dob: '', gender: '', maritalStatus: '', bloodGroup: '', mobile: '', altMobile: '', email: '', currentAddress: '', permanentAddress: '',
  emergencyName: '', emergencyMobile: '', department: '', designation: '', joiningDate: new Date().toISOString().slice(0, 10), employmentType: 'Permanent', reportingTo: '', workLocation: '',
  status: 'Active', leavingDate: '', leavingReason: '', pan: '', aadhaar: '', uan: '', pfNo: '', esicNo: '', bankName: '', bankAccount: '', ifsc: '', accountHolder: '',
  qualification: '', experience: '', remarks: '', candidateId: '' };
const EMPTY_SAL = { basic: '', hra: '', conveyance: '', special: '', other: '', pfApplicable: false, esiApplicable: false, ptApplicable: true, tds: '' };
const EMP_STATUS = ['Active', 'On notice', 'Left'];
const grossOf = s => ['basic', 'hra', 'conveyance', 'special', 'other'].reduce((t, k) => t + (parseFloat(s?.[k]) || 0), 0);

function EmployeeForm({ emp, cand, cid, onClose, onSaved }) {
  const [f, setF] = useState(() => ({ ...EMPTY, ...(emp || {}), ...(cand ? { name: cand.name || '', mobile: cand.mobile || '', email: cand.email || '', department: cand.department || '',
    designation: cand.position || '', qualification: cand.qualification || '', experience: cand.experience || '', currentAddress: cand.location || '', candidateId: String(cand.id) } : {}) }));
  const [sal, setSal] = useState(() => { const s = { ...EMPTY_SAL, ...(emp?.salary || {}) }; ['pfApplicable', 'esiApplicable', 'ptApplicable'].forEach(k => { s[k] = s[k] === true || s[k] === 'true'; }); return s; });
  const [keep, setKeep] = useState(() => (emp?.files || []).map(x => x.fileName));
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => { if (!emp) axios.get('/api/hr/employees/next-code', { params: { companyId: cid } }).then(r => setF(p => (p.empCode ? p : { ...p, empCode: r.data?.empCode || '' }))).catch(() => {}); }, [emp, cid]);
  const set = k => e => setF(p => ({ ...p, [k]: e.target.value }));
  const setS = k => e => setSal(p => ({ ...p, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const gross = grossOf(sal);
  const save = async () => {
    if (!f.name.trim()) { setErr('Enter the employee name.'); return; }
    if (f.pan && !/^[A-Z]{5}\d{4}[A-Z]$/i.test(f.pan.trim())) { setErr('PAN should look like ABCDE1234F.'); return; }
    if (f.ifsc && !/^[A-Z]{4}0[A-Z0-9]{6}$/i.test(f.ifsc.trim())) { setErr('IFSC should look like SBIN0005743.'); return; }
    if (f.aadhaar && !/^\d{12}$/.test(f.aadhaar.replace(/\s/g, ''))) { setErr('Aadhaar should be 12 digits.'); return; }
    setBusy(true); setErr('');
    const { id, files: _f, audit, createdAt, updatedAt, salary, ...body } = f;
    const fd = toForm({ ...body, pan: body.pan.toUpperCase(), ifsc: body.ifsc.toUpperCase(), companyId: cid, salary: sal, ...(emp ? { keepFiles: keep } : {}) }, files, files.map(x => x.name));
    try {
      if (emp) await axios.put(`/api/hr/employees/${emp.id}`, fd, { params: { companyId: cid } });
      else await axios.post('/api/hr/employees', fd, { params: { companyId: cid } });
      onSaved();
    } catch (e) { setErr(e.response?.data?.error || e.message); setBusy(false); }
  };
  return (
    <div className="hr-modal" onClick={onClose}><div onClick={e => e.stopPropagation()}>
      <div className="hd">{emp ? `Edit employee · ${emp.empCode} ${emp.name}` : cand ? `New employee from candidate · ${cand.name}` : 'Add employee'}</div>
      <div className="bd">
        {cand && <div style={{ marginTop: 10, background: '#ECFDF3', border: '1px solid #ABEFC6', borderRadius: 8, padding: '8px 12px', fontSize: 12.5, color: '#067647' }}>Details and CV come from candidate #{cand.id}. On save the candidate is marked <b>Joined</b>.</div>}
        <div className="hr-sec">Personal</div>
        <div className="hr-grid">
          <label>Employee code<input value={f.empCode} onChange={set('empCode')} /></label>
          <label className="wide">Full name *<input value={f.name} onChange={set('name')} autoFocus /></label>
          <label>Father's / husband's name<input value={f.fatherName} onChange={set('fatherName')} /></label>
          <label>Date of birth<input type="date" value={f.dob} onChange={set('dob')} /></label>
          <label>Gender<select value={f.gender} onChange={set('gender')}><option value="">—</option><option>Male</option><option>Female</option><option>Other</option></select></label>
          <label>Marital status<select value={f.maritalStatus} onChange={set('maritalStatus')}><option value="">—</option><option>Single</option><option>Married</option></select></label>
          <label>Blood group<input value={f.bloodGroup} onChange={set('bloodGroup')} /></label>
          <label>Qualification<input value={f.qualification} onChange={set('qualification')} /></label>
          <label>Mobile<input value={f.mobile} onChange={set('mobile')} /></label>
          <label>Alternate mobile<input value={f.altMobile} onChange={set('altMobile')} /></label>
          <label>Email<input type="email" value={f.email} onChange={set('email')} /></label>
          <label className="full">Current address<textarea value={f.currentAddress} onChange={set('currentAddress')} /></label>
          <label className="full">Permanent address<textarea value={f.permanentAddress} onChange={set('permanentAddress')} /></label>
          <label>Emergency contact name<input value={f.emergencyName} onChange={set('emergencyName')} /></label>
          <label>Emergency contact mobile<input value={f.emergencyMobile} onChange={set('emergencyMobile')} /></label>
        </div>
        <div className="hr-sec">Job</div>
        <div className="hr-grid">
          <label>Department<input list="hr-depts2" value={f.department} onChange={set('department')} /></label>
          <label>Designation<input value={f.designation} onChange={set('designation')} /></label>
          <label>Date of joining<input type="date" value={f.joiningDate} onChange={set('joiningDate')} /></label>
          <label>Employment type<select value={f.employmentType} onChange={set('employmentType')}>{['Permanent', 'Probation', 'Contract', 'Trainee', 'Consultant'].map(x => <option key={x}>{x}</option>)}</select></label>
          <label>Reporting to<input value={f.reportingTo} onChange={set('reportingTo')} /></label>
          <label>Work location<input value={f.workLocation} onChange={set('workLocation')} /></label>
          <label>Experience (years)<input value={f.experience} onChange={set('experience')} /></label>
          <label>Status<select value={f.status} onChange={set('status')}>{EMP_STATUS.map(x => <option key={x}>{x}</option>)}</select></label>
          {f.status === 'Left' && <><label>Leaving date<input type="date" value={f.leavingDate} onChange={set('leavingDate')} /></label>
            <label className="wide">Reason<input value={f.leavingReason} onChange={set('leavingReason')} /></label></>}
        </div>
        <div className="hr-sec">Statutory &amp; bank</div>
        <div className="hr-grid">
          <label>PAN<input value={f.pan} onChange={set('pan')} /></label>
          <label>Aadhaar<input value={f.aadhaar} onChange={set('aadhaar')} /></label>
          <label>UAN (PF)<input value={f.uan} onChange={set('uan')} /></label>
          <label>PF number<input value={f.pfNo} onChange={set('pfNo')} /></label>
          <label>ESIC number<input value={f.esicNo} onChange={set('esicNo')} /></label>
          <label>Bank name<input value={f.bankName} onChange={set('bankName')} /></label>
          <label>Account number<input value={f.bankAccount} onChange={set('bankAccount')} /></label>
          <label>IFSC<input value={f.ifsc} onChange={set('ifsc')} /></label>
          <label>Account holder<input value={f.accountHolder} onChange={set('accountHolder')} placeholder={f.name} /></label>
        </div>
        <div className="hr-sec">Salary structure (per month) <span style={{ fontWeight: 600, color: '#667085', marginLeft: 10 }}>Gross ₹{money(gross)} · CTC ₹{money(gross * 12)} / year</span></div>
        <div className="hr-grid">
          <label>Basic<input type="number" value={sal.basic} onChange={setS('basic')} /></label>
          <label>HRA<input type="number" value={sal.hra} onChange={setS('hra')} /></label>
          <label>Conveyance<input type="number" value={sal.conveyance} onChange={setS('conveyance')} /></label>
          <label>Special allowance<input type="number" value={sal.special} onChange={setS('special')} /></label>
          <label>Other allowance<input type="number" value={sal.other} onChange={setS('other')} /></label>
          <label>TDS per month<input type="number" value={sal.tds} onChange={setS('tds')} /></label>
          <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 22, fontSize: 13, color: '#344054' }}>
            <label style={{ flexDirection: 'row', alignItems: 'center', textTransform: 'none', fontSize: 13, fontWeight: 500 }}><input type="checkbox" checked={!!sal.pfApplicable} onChange={setS('pfApplicable')} style={{ height: 16 }} /> PF (12% of basic, up to ₹15,000)</label>
            <label style={{ flexDirection: 'row', alignItems: 'center', textTransform: 'none', fontSize: 13, fontWeight: 500 }}><input type="checkbox" checked={!!sal.esiApplicable} onChange={setS('esiApplicable')} style={{ height: 16 }} /> ESI (0.75%, gross up to ₹21,000)</label>
            <label style={{ flexDirection: 'row', alignItems: 'center', textTransform: 'none', fontSize: 13, fontWeight: 500 }}><input type="checkbox" checked={!!sal.ptApplicable} onChange={setS('ptApplicable')} style={{ height: 16 }} /> Professional tax (₹200)</label>
          </div>
        </div>
        <div className="hr-sec">Documents</div>
        <div>
          {(emp?.files || []).filter(x => keep.includes(x.fileName)).map(x => (
            <span key={x.fileName} className="hr-file">📄 <a href="#v" onClick={e => { e.preventDefault(); openFile('employees', emp.id, x, cid); }}>{x.name || x.fileName}</a>
              <button title="Remove" onClick={() => setKeep(k => k.filter(n => n !== x.fileName))}>✕</button></span>
          ))}
          {files.map((x, i) => <span key={i} className="hr-file">＋ {x.name}<button title="Remove" onClick={() => setFiles(a => a.filter((_, j) => j !== i))}>✕</button></span>)}
          <div><label className="rc-btn" style={{ display: 'inline-flex', alignItems: 'center', cursor: 'pointer' }}>Upload documents
            <input type="file" multiple accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" style={{ display: 'none' }} onChange={e => { const picked = Array.from(e.target.files || []); setFiles(a => [...a, ...picked]); e.target.value = ''; }} /></label>
            <span style={{ fontSize: 11.5, color: '#98A2B3', marginLeft: 8 }}>Aadhaar, PAN, offer letter, certificates…{cand ? ' (the CV comes from the candidate)' : ''}</span></div>
        </div>
        <label className="full" style={{ display: 'block', marginTop: 12 }}><span style={{ fontSize: 11, fontWeight: 700, color: '#475467', textTransform: 'uppercase' }}>Remarks</span>
          <textarea className="rc-ctl" value={f.remarks} onChange={set('remarks')} style={{ width: '100%', height: 56, padding: 8, boxSizing: 'border-box', marginTop: 4 }} /></label>
        <datalist id="hr-depts2">{DEPARTMENTS.map(d => <option key={d} value={d} />)}</datalist>
      </div>
      <div className="ft">
        {err && <span style={{ color: '#B42318', fontSize: 12.5, marginRight: 'auto' }}>{err}</span>}
        <button className="rc-btn" onClick={onClose}>Cancel</button>
        <button className="rc-btn primary" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save employee'}</button>
      </div>
    </div></div>
  );
}

/* pick a candidate from Recruitment (not yet joined) */
function CandidatePicker({ cands, onPick, onClose }) {
  const [q, setQ] = useState('');
  const order = ['Selected', 'Interview', 'Shortlisted', 'New', 'On hold'];
  const list = cands.filter(c => c.status !== 'Joined' && c.status !== 'Rejected' && (!q.trim() || [c.name, c.position, c.mobile].join(' ').toLowerCase().includes(q.trim().toLowerCase())))
    .sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status));
  return (
    <div className="hr-modal" onClick={onClose}><div onClick={e => e.stopPropagation()} style={{ width: 'min(640px, 96vw)' }}>
      <div className="hd">New employee from Recruitment</div>
      <div className="bd">
        <input className="rc-ctl" value={q} onChange={e => setQ(e.target.value)} placeholder="Search candidate" style={{ width: '100%', margin: '10px 0', boxSizing: 'border-box' }} autoFocus />
        {list.length === 0 ? <div style={{ padding: 20, textAlign: 'center', color: '#98A2B3' }}>No candidate waiting — mark one Selected in Recruitment.</div> : (
          <table className="rc-tbl"><tbody>{list.map(c => { const [bg, fg] = STATUS_COLOR[c.status] || STATUS_COLOR.New; return (
            <tr key={c.id} className="row" style={{ cursor: 'pointer' }} onClick={() => onPick(c)}>
              <td style={{ fontWeight: 600 }}>{c.name}</td><td>{c.position || '—'}</td><td>{c.mobile || ''}</td>
              <td style={{ width: 100 }}><span className="rc-tag" style={{ background: bg, color: fg }}>{c.status}</span></td>
            </tr>); })}</tbody></table>
        )}
      </div>
      <div className="ft"><button className="rc-btn" onClick={onClose}>Cancel</button></div>
    </div></div>
  );
}

export default function Employees() {
  const { selectedCompany } = useCompany();
  const cid = selectedCompany?.companyId;
  const { search } = useLocation();
  const navigate = useNavigate();
  const [list, setList] = useState([]);
  const [cands, setCands] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [status, setStatus] = useState('Active');
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState(null);        // { emp } | { cand } | {}
  const [picking, setPicking] = useState(false);

  const load = useCallback(async () => {
    if (!cid) return;
    setLoading(true); setErr('');
    try {
      const [e, c] = await Promise.all([axios.get('/api/hr/employees', { params: { companyId: cid } }), axios.get('/api/hr/candidates', { params: { companyId: cid } })]);
      if (!Array.isArray(e.data)) throw new Error('The ERP server needs a restart (node server.js) for HR.');
      setList(e.data); setCands(Array.isArray(c.data) ? c.data : []);
    } catch (x) { setErr(x.response?.data?.error || x.message); }
    setLoading(false);
  }, [cid]);
  useEffect(() => { load(); }, [load]);
  // "Make employee" from Recruitment opens the form for that candidate
  useEffect(() => {
    const id = new URLSearchParams(search).get('fromCandidate');
    if (!id || !cands.length) return;
    const c = cands.find(x => String(x.id) === id);
    if (c && c.status !== 'Joined') setEdit({ cand: c });
    navigate('/hr/employee', { replace: true });
  }, [search, cands, navigate]);

  const remove = async e => {
    if (!window.confirm(`Delete employee ${e.empCode} ${e.name}?`)) return;
    try { await axios.delete(`/api/hr/employees/${e.id}`, { params: { companyId: cid } }); load(); } catch (x) { setErr(x.response?.data?.error || x.message); }
  };
  const counts = useMemo(() => Object.fromEntries(EMP_STATUS.map(s => [s, list.filter(e => (e.status || 'Active') === s).length])), [list]);
  const rows = list.filter(e => (!status || (e.status || 'Active') === status) && (!q.trim() || [e.empCode, e.name, e.department, e.designation, e.mobile].join(' ').toLowerCase().includes(q.trim().toLowerCase())));
  const payroll = list.filter(e => (e.status || 'Active') !== 'Left').reduce((t, e) => t + grossOf(e.salary), 0);

  return (
    <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10, height: '100%', boxSizing: 'border-box', fontFamily: F }}>
      <div className="rc-card" style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>Employees</div>
        <div style={{ display: 'flex', gap: 14, fontSize: 12, color: '#667085' }}>
          <span><b style={{ color: '#067647' }}>{counts.Active}</b> active</span>
          <span><b style={{ color: '#B54708' }}>{counts['On notice']}</b> on notice</span>
          <span>Monthly gross <b style={{ color: '#101828' }}>₹{money(payroll)}</b></span>
        </div>
        <div style={{ flex: 1 }} />
        <button className="rc-btn" onClick={() => setPicking(true)}>＋ From Recruitment</button>
        <button className="rc-btn primary" onClick={() => setEdit({})}>＋ Add employee</button>
      </div>
      {err && <div style={{ background: '#FFFAEB', border: '1px solid #FEDF89', borderRadius: 10, padding: '8px 14px', fontSize: 13, color: '#B54708', fontWeight: 600 }}>{err}</div>}
      <div className="rc-card" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', padding: '10px 12px', borderBottom: '1px solid #EAECF0' }}>
          <div className="rc-seg">
            {EMP_STATUS.map(s => <button key={s} className={status === s ? 'on' : ''} onClick={() => setStatus(s)}>{s} ({counts[s]})</button>)}
            <button className={!status ? 'on' : ''} onClick={() => setStatus('')}>All ({list.length})</button>
          </div>
          <input className="rc-ctl" value={q} onChange={e => setQ(e.target.value)} placeholder="Search code, name, department" style={{ width: 260 }} />
        </div>
        <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
          {loading ? <div style={{ padding: 40, textAlign: 'center', color: '#98A2B3' }}>Loading…</div>
          : list.length === 0 ? <div style={{ padding: 40, textAlign: 'center', color: '#475467' }}>No employees yet. Use <b>＋ From Recruitment</b> or <b>＋ Add employee</b>.</div>
          : (
            <table className="rc-tbl" style={{ minWidth: 1100 }}>
              <colgroup><col style={{ width: 90 }} /><col /><col style={{ width: 130 }} /><col style={{ width: 150 }} /><col style={{ width: 120 }} /><col style={{ width: 100 }} /><col style={{ width: 120 }} /><col style={{ width: 96 }} /><col style={{ width: 80 }} /><col style={{ width: 120 }} /></colgroup>
              <thead><tr><th>Code</th><th>Name</th><th>Department</th><th>Designation</th><th>Mobile</th><th>Joined</th><th className="n">Monthly gross</th><th>Status</th><th>Docs</th><th>Action</th></tr></thead>
              <tbody>
                {rows.map(e => {
                  const [bg, fg] = STATUS_COLOR[e.status || 'Active'] || STATUS_COLOR.Active;
                  return (
                    <tr key={e.id} className="row">
                      <td style={{ fontWeight: 600 }}>{e.empCode}</td>
                      <td title={[e.name, e.email].filter(Boolean).join(' · ')} style={{ fontWeight: 600 }}>{e.name}{e.candidateId && <span style={{ color: '#98A2B3', fontSize: 11, fontWeight: 500, marginLeft: 8 }}>from recruitment</span>}</td>
                      <td>{e.department || '—'}</td>
                      <td>{e.designation || '—'}</td>
                      <td>{e.mobile || '—'}</td>
                      <td>{fmtD(e.joiningDate)}</td>
                      <td className="n">{grossOf(e.salary) ? money(grossOf(e.salary)) : '—'}</td>
                      <td><span className="rc-tag" style={{ background: bg, color: fg }}>{e.status || 'Active'}</span></td>
                      <td>{(e.files || []).length ? <a href="#d" onClick={x => { x.preventDefault(); openFile('employees', e.id, e.files[0], cid); }} style={{ color: '#175CD3' }} title={e.files.map(f => f.name).join(', ')}>📄 {e.files.length}</a> : <span style={{ color: '#D0D5DD' }}>—</span>}</td>
                      <td><button className="rc-btn sm" onClick={() => setEdit({ emp: e })}>Edit</button>
                        <button className="rc-btn sm" style={{ marginLeft: 6, color: '#B42318' }} onClick={() => remove(e)} title="Delete">✕</button></td>
                    </tr>
                  );
                })}
                {rows.length === 0 && <tr><td colSpan={10} style={{ textAlign: 'center', color: '#98A2B3', padding: 30 }}>Nothing here.</td></tr>}
              </tbody>
            </table>
          )}
        </div>
      </div>
      {picking && <CandidatePicker cands={cands} onClose={() => setPicking(false)} onPick={c => { setPicking(false); setEdit({ cand: c }); }} />}
      {edit && <EmployeeForm emp={edit.emp || null} cand={edit.cand || null} cid={cid} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); }} />}
    </div>
  );
}
