/* HR › Recruitment — every candidate with the CV. Status: New → Shortlisted → Interview → Selected → Joined
 * (or On hold / Rejected). A selected candidate becomes an employee from the Employee tab (or "Make employee" here). */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { useCompany } from '../../context/CompanyContext';
import { F, money, fmtD } from '../tallyrecon/reconUi';
import { openFile, toForm, CAND_STATUS, STATUS_COLOR, DEPARTMENTS } from './hrUtil';

const EMPTY = { name: '', mobile: '', email: '', position: '', department: '', experience: '', currentCtc: '', expectedCtc: '', noticePeriod: '', location: '',
  qualification: '', skills: '', source: '', referredBy: '', status: 'New', interviewDate: '', interviewer: '', rating: '', remarks: '', appliedOn: new Date().toISOString().slice(0, 10) };
const SOURCES = ['Naukri', 'Indeed', 'LinkedIn', 'Reference', 'Walk-in', 'Consultant', 'Company website', 'Other'];

function CandidateForm({ cand, cid, onClose, onSaved }) {
  const [f, setF] = useState(() => ({ ...EMPTY, ...(cand || {}) }));
  const [keep, setKeep] = useState(() => (cand?.files || []).map(x => x.fileName));
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const set = k => e => setF(p => ({ ...p, [k]: e.target.value }));
  const save = async () => {
    if (!f.name.trim()) { setErr('Enter the candidate name.'); return; }
    if (f.mobile && !/^\+?\d[\d\s-]{8,14}$/.test(f.mobile.trim())) { setErr('Check the mobile number.'); return; }
    setBusy(true); setErr('');
    const { id, files: _f, audit, createdAt, updatedAt, employeeId, ...body } = f;
    const fd = toForm({ ...body, companyId: cid, ...(cand ? { keepFiles: keep } : {}) }, files, files.map(x => (/cv|resume/i.test(x.name) || !keep.length ? 'CV' : x.name)));
    try {
      if (cand) await axios.put(`/api/hr/candidates/${cand.id}`, fd, { params: { companyId: cid } });
      else await axios.post('/api/hr/candidates', fd, { params: { companyId: cid } });
      onSaved();
    } catch (e) { setErr(e.response?.data?.error || e.message); setBusy(false); }
  };
  return (
    <div className="hr-modal" onClick={onClose}><div onClick={e => e.stopPropagation()}>
      <div className="hd">{cand ? `Edit candidate · ${cand.name}` : 'Add candidate'}</div>
      <div className="bd">
        <div className="hr-sec">Candidate</div>
        <div className="hr-grid">
          <label className="wide">Full name *<input value={f.name} onChange={set('name')} autoFocus /></label>
          <label>Status<select value={f.status} onChange={set('status')}>{CAND_STATUS.map(s => <option key={s}>{s}</option>)}</select></label>
          <label>Mobile<input value={f.mobile} onChange={set('mobile')} /></label>
          <label>Email<input type="email" value={f.email} onChange={set('email')} /></label>
          <label>Current location<input value={f.location} onChange={set('location')} /></label>
        </div>
        <div className="hr-sec">Job applied for</div>
        <div className="hr-grid">
          <label>Position<input value={f.position} onChange={set('position')} placeholder="e.g. Site Engineer" /></label>
          <label>Department<input list="hr-depts" value={f.department} onChange={set('department')} /></label>
          <label>Applied on<input type="date" value={f.appliedOn} onChange={set('appliedOn')} /></label>
          <label>Experience (years)<input value={f.experience} onChange={set('experience')} /></label>
          <label>Current CTC (₹ / year)<input value={f.currentCtc} onChange={set('currentCtc')} /></label>
          <label>Expected CTC (₹ / year)<input value={f.expectedCtc} onChange={set('expectedCtc')} /></label>
          <label>Notice period<input value={f.noticePeriod} onChange={set('noticePeriod')} placeholder="e.g. 30 days" /></label>
          <label>Qualification<input value={f.qualification} onChange={set('qualification')} /></label>
          <label>Source<select value={f.source} onChange={set('source')}><option value="">—</option>{SOURCES.map(s => <option key={s}>{s}</option>)}</select></label>
          <label className="full">Skills<input value={f.skills} onChange={set('skills')} placeholder="e.g. AutoCAD, site execution, billing" /></label>
          {f.source === 'Reference' && <label>Referred by<input value={f.referredBy} onChange={set('referredBy')} /></label>}
        </div>
        <div className="hr-sec">Interview</div>
        <div className="hr-grid">
          <label>Interview date<input type="date" value={f.interviewDate} onChange={set('interviewDate')} /></label>
          <label>Interviewer<input value={f.interviewer} onChange={set('interviewer')} /></label>
          <label>Rating (1–5)<select value={f.rating} onChange={set('rating')}><option value="">—</option>{[1, 2, 3, 4, 5].map(n => <option key={n}>{n}</option>)}</select></label>
          <label className="full">Remarks<textarea value={f.remarks} onChange={set('remarks')} /></label>
        </div>
        <div className="hr-sec">CV &amp; documents</div>
        <div>
          {(cand?.files || []).filter(x => keep.includes(x.fileName)).map(x => (
            <span key={x.fileName} className="hr-file">📄 <a href="#v" onClick={e => { e.preventDefault(); openFile('candidates', cand.id, x, cid); }}>{x.name || x.fileName}</a>
              <button title="Remove" onClick={() => setKeep(k => k.filter(n => n !== x.fileName))}>✕</button></span>
          ))}
          {files.map((x, i) => <span key={i} className="hr-file">＋ {x.name}<button title="Remove" onClick={() => setFiles(a => a.filter((_, j) => j !== i))}>✕</button></span>)}
          <div><label className="rc-btn" style={{ display: 'inline-flex', alignItems: 'center', cursor: 'pointer' }}>Upload CV / files
            <input type="file" multiple accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" style={{ display: 'none' }} onChange={e => { const picked = Array.from(e.target.files || []); setFiles(a => [...a, ...picked]); e.target.value = ''; }} /></label>
            <span style={{ fontSize: 11.5, color: '#98A2B3', marginLeft: 8 }}>PDF, Word or image</span></div>
        </div>
        <datalist id="hr-depts">{DEPARTMENTS.map(d => <option key={d} value={d} />)}</datalist>
      </div>
      <div className="ft">
        {err && <span style={{ color: '#B42318', fontSize: 12.5, marginRight: 'auto' }}>{err}</span>}
        <button className="rc-btn" onClick={onClose}>Cancel</button>
        <button className="rc-btn primary" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save candidate'}</button>
      </div>
    </div></div>
  );
}

export default function Recruitment() {
  const { selectedCompany } = useCompany();
  const cid = selectedCompany?.companyId;
  const navigate = useNavigate();
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState(null);   // null | {} (new) | candidate

  const load = useCallback(async () => {
    if (!cid) return;
    setLoading(true); setErr('');
    try { const r = await axios.get('/api/hr/candidates', { params: { companyId: cid } }); if (!Array.isArray(r.data)) throw new Error('The ERP server needs a restart (node server.js) for HR.'); setList(r.data); }
    catch (e) { setErr(e.response?.data?.error || e.message); }
    setLoading(false);
  }, [cid]);
  useEffect(() => { load(); }, [load]);

  const setStatusOf = async (c, s) => {
    try { await axios.put(`/api/hr/candidates/${c.id}`, toForm({ status: s, companyId: cid }), { params: { companyId: cid } }); load(); }
    catch (e) { setErr(e.response?.data?.error || e.message); }
  };
  const remove = async c => {
    if (!window.confirm(`Delete candidate ${c.name} and the CV?`)) return;
    try { await axios.delete(`/api/hr/candidates/${c.id}`, { params: { companyId: cid } }); load(); } catch (e) { setErr(e.response?.data?.error || e.message); }
  };

  const counts = useMemo(() => Object.fromEntries(CAND_STATUS.map(s => [s, list.filter(c => c.status === s).length])), [list]);
  const rows = list.filter(c => (!status || c.status === status) && (!q.trim() || [c.name, c.mobile, c.email, c.position, c.department, c.skills, c.source, c.location].join(' ').toLowerCase().includes(q.trim().toLowerCase())));

  return (
    <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10, height: '100%', boxSizing: 'border-box', fontFamily: F }}>
      <div className="rc-card" style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>Recruitment</div>
        <div style={{ display: 'flex', gap: 14, fontSize: 12, color: '#667085' }}>
          <span><b style={{ color: '#101828' }}>{list.length}</b> candidates</span>
          <span><b style={{ color: '#B54708' }}>{counts.Interview}</b> interview</span>
          <span><b style={{ color: '#067647' }}>{counts.Selected}</b> selected</span>
          <span><b style={{ color: '#05603A' }}>{counts.Joined}</b> joined</span>
        </div>
        <div style={{ flex: 1 }} />
        <button className="rc-btn primary" onClick={() => setEdit({})}>＋ Add candidate</button>
      </div>
      {err && <div style={{ background: '#FFFAEB', border: '1px solid #FEDF89', borderRadius: 10, padding: '8px 14px', fontSize: 13, color: '#B54708', fontWeight: 600 }}>{err}</div>}
      <div className="rc-card" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', padding: '10px 12px', borderBottom: '1px solid #EAECF0' }}>
          <div className="rc-seg">
            <button className={!status ? 'on' : ''} onClick={() => setStatus('')}>All ({list.length})</button>
            {CAND_STATUS.map(s => <button key={s} className={status === s ? 'on' : ''} onClick={() => setStatus(s)}>{s} ({counts[s]})</button>)}
          </div>
          <input className="rc-ctl" value={q} onChange={e => setQ(e.target.value)} placeholder="Search name, mobile, position, skills" style={{ width: 260 }} />
        </div>
        <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
          {loading ? <div style={{ padding: 40, textAlign: 'center', color: '#98A2B3' }}>Loading…</div>
          : list.length === 0 ? <div style={{ padding: 40, textAlign: 'center', color: '#475467' }}>No candidates yet. Click <b>＋ Add candidate</b> and upload the CV.</div>
          : (
            <table className="rc-tbl" style={{ minWidth: 1180 }}>
              <colgroup><col style={{ width: 60 }} /><col /><col style={{ width: 160 }} /><col style={{ width: 120 }} /><col style={{ width: 80 }} /><col style={{ width: 120 }} /><col style={{ width: 100 }} /><col style={{ width: 130 }} /><col style={{ width: 90 }} /><col style={{ width: 96 }} /><col style={{ width: 190 }} /></colgroup>
              <thead><tr><th>ID</th><th>Name</th><th>Position</th><th>Mobile</th><th className="n">Exp (yrs)</th><th className="n">Expected CTC</th><th>Source</th><th>Status</th><th>CV</th><th>Applied</th><th>Action</th></tr></thead>
              <tbody>
                {rows.map(c => {
                  const [bg, fg] = STATUS_COLOR[c.status] || STATUS_COLOR.New;
                  const cv = (c.files || [])[0];
                  return (
                    <tr key={c.id} className="row">
                      <td style={{ color: '#98A2B3' }}>{c.id}</td>
                      <td title={[c.name, c.email, c.location].filter(Boolean).join(' · ')}><span style={{ fontWeight: 600 }}>{c.name}</span>{c.email && <span style={{ color: '#98A2B3', marginLeft: 8, fontSize: 11.5 }}>{c.email}</span>}</td>
                      <td title={`${c.position || ''}${c.department ? ' · ' + c.department : ''}`}>{c.position || '—'}</td>
                      <td>{c.mobile || '—'}</td>
                      <td className="n">{c.experience || '—'}</td>
                      <td className="n">{c.expectedCtc ? money(c.expectedCtc).replace(/\.00$/, '') : '—'}</td>
                      <td>{c.source || '—'}</td>
                      <td>
                        <select className="rc-ctl" value={c.status} onChange={e => setStatusOf(c, e.target.value)} disabled={c.status === 'Joined'} style={{ height: 26, padding: '0 6px', color: fg, fontWeight: 700, fontSize: 12, width: '100%', borderColor: bg }}>
                          {CAND_STATUS.map(s => <option key={s}>{s}</option>)}
                        </select>
                      </td>
                      <td>{cv ? <a href="#cv" onClick={e => { e.preventDefault(); openFile('candidates', c.id, cv, cid); }} style={{ color: '#175CD3', fontWeight: 600 }}>View CV</a> : <span style={{ color: '#D0D5DD' }}>—</span>}
                        {(c.files || []).length > 1 && <span style={{ color: '#98A2B3', fontSize: 11 }}> +{c.files.length - 1}</span>}</td>
                      <td>{fmtD(c.appliedOn)}</td>
                      <td>
                        <button className="rc-btn sm" onClick={() => setEdit(c)}>Edit</button>
                        {c.status === 'Joined' ? <span style={{ fontSize: 11.5, color: '#067647', marginLeft: 6 }}>✓ employee</span>
                          : <button className="rc-btn sm" style={{ marginLeft: 6, color: '#067647' }} onClick={() => navigate(`/hr/employee?fromCandidate=${c.id}`)}>Make employee</button>}
                        {c.status !== 'Joined' && <button className="rc-btn sm" style={{ marginLeft: 6, color: '#B42318' }} onClick={() => remove(c)} title="Delete">✕</button>}
                      </td>
                    </tr>
                  );
                })}
                {rows.length === 0 && <tr><td colSpan={11} style={{ textAlign: 'center', color: '#98A2B3', padding: 30 }}>Nothing here.</td></tr>}
              </tbody>
            </table>
          )}
        </div>
      </div>
      {edit && <CandidateForm cand={edit.id ? edit : null} cid={cid} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); }} />}
    </div>
  );
}
