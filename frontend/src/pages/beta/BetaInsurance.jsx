/* Beta — Insurance (side nav: Insurance → Policies / Claims), /api/insurance.
 * Policies: register with type, insurer, what it covers, sum insured, premium, dates; expiry tracking
 * (expiring ≤ 30 days / expired / renewed), Renew, documents, Print list.
 * Claims: claims made on a policy — claimed / settled amounts and status. */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useCompany } from '../../context/CompanyContext';
import { useAuth } from '../../context/AuthContext';
import { can } from '../../utils/permissions';
import { Svg } from '../../components/ui/Icon';
import { CSS as SALES_CSS, useClearSel } from './BetaSales';
import { PX_CSS } from './BetaPurchaseParts';
import { printDepList, daysTo, dmy } from './BetaCertPrint';
import { openPreview } from './printKit';

const TYPES = ['Fire', 'Marine / Transit', 'Vehicle', 'Workmen Compensation', 'Group Health / Mediclaim', 'Group Personal Accident',
  "Contractor's All Risk", 'Public Liability', 'Stock / Burglary', 'Machinery Breakdown', 'Keyman', 'Office Package', 'Other'];
const CLAIM_ST = ['Filed', 'Survey', 'Approved', 'Settled', 'Rejected'];
const PAY_MODES = ['NEFT', 'RTGS', 'IMPS', 'Cheque', 'UPI', 'Cash', 'Auto debit'];
const amt = v => (Number(v) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const today = () => new Date().toISOString().slice(0, 10);
const ymd = x => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
/* one year cover: start → start + 1 year − 1 day */
const yearEnd = start => { const x = start ? new Date(start) : null; return x && !isNaN(x) ? ymd(new Date(x.getFullYear() + 1, x.getMonth(), x.getDate() - 1)) : ''; };
const addDays = (d, n) => { const x = d ? new Date(d) : null; return x && !isNaN(x) ? ymd(new Date(x.getFullYear(), x.getMonth(), x.getDate() + n)) : ''; };
/* financial year (Apr–Mar) of today */
const fyStart = () => { const t = new Date(); return ymd(new Date(t.getMonth() >= 3 ? t.getFullYear() : t.getFullYear() - 1, 3, 1)); };

/* state of a policy */
export const polState = p => {
  if (p.status === 'cancelled') return { k: 'cancelled', label: 'Cancelled' };
  if (p.renewedToId) return { k: 'renewed', label: `Renewed${p.renewedToNo ? ` → ${p.renewedToNo}` : ''}` };
  const dl = daysTo(p.endDate), ds = daysTo(p.startDate);
  if (dl != null && dl < 0) return { k: 'expired', label: 'Expired' };
  if (ds != null && ds > 0) return { k: 'pending', label: 'Starts later' };
  if (dl != null && dl <= 30) return { k: 'expiring', label: dl === 0 ? 'Expires today' : `Expires in ${dl} day${dl === 1 ? '' : 's'}` };
  return { k: 'active', label: 'Active' };
};
const PILL = { active: ['#ECFDF3', '#067647'], expiring: ['#FFFAEB', '#B54708'], expired: ['#FEF3F2', '#B42318'], pending: ['#EFF8FF', '#175CD3'],
  renewed: ['#F2F4F7', '#475467'], cancelled: ['#F2F4F7', '#98A2B3'],
  Filed: ['#EFF8FF', '#175CD3'], Survey: ['#FFFAEB', '#B54708'], Approved: ['#F0F9FF', '#026AA2'], Settled: ['#ECFDF3', '#067647'], Rejected: ['#FEF3F2', '#B42318'] };
const P_STATES = [['', 'All'], ['live', 'Live (active + expiring)'], ['expiring', 'Expiring ≤ 30 days'], ['expired', 'Expired (not renewed)'], ['renewed', 'Renewed'], ['cancelled', 'Cancelled']];

const EXTRA_CSS = `
.inx td { white-space:normal; overflow-wrap:anywhere; line-height:1.35; } .inx td.d { white-space:nowrap; } .inx th { font-size:10.5px; white-space:normal; }
.inx .b { font-weight:700; } .inx .sm { display:block; font-size:11px; color:#667085; }
.inx tbody tr:hover td { background:#F0F7F8; }
.inx tbody tr.sel td { background:#D4EBEE !important; } .inx tbody tr.sel td:first-child { box-shadow:inset 3px 0 0 #03444f; }
.in-pill { display:inline-block; padding:2px 8px; border-radius:99px; font-size:11px; font-weight:700; }
.in-sum { display:flex; flex-wrap:wrap; background:#fff; border-bottom:1px solid #DCE6E8; flex-shrink:0; }
.in-sum div { padding:7px 16px; border-right:1px solid #DCE6E8; font-size:11px; color:#667085; text-transform:uppercase; letter-spacing:.3px; }
.in-sum b { display:block; font-size:15px; color:#03444f; text-transform:none; letter-spacing:0; }
.in-pm { position:relative; display:flex; align-self:stretch; }
.in-pm-list { position:absolute; right:0; top:calc(100% + 4px); z-index:50; min-width:260px; max-height:320px; overflow:auto; background:#fff; border:1px solid #DCE6E8; border-radius:8px; box-shadow:0 10px 24px rgba(16,24,40,.16); padding:4px; }
.in-pm-list button { display:block; width:100%; text-align:left; border:0; background:none; padding:8px 10px; border-radius:6px; font:600 12.5px Inter, Arial, sans-serif; color:#03444f; cursor:pointer; }
.in-pm-list button:hover:not(:disabled) { background:#F0F7F8; } .in-pm-list button:disabled { color:#98A2B3; cursor:default; }
.in-pm-list button small { display:block; font-weight:400; font-size:11px; color:#667085; margin-top:1px; }
.in-pm-list hr { border:0; border-top:1px solid #EAECF0; margin:4px 0; }
.in-dsel { width:170px !important; flex:0 0 auto; height:26px !important; font-size:12px !important; margin-right:6px; border-radius:4px; border:1px solid #C9D7DA; padding:0 6px; }
.in-docs { width:100%; border-collapse:collapse; } .in-docs td { padding:6px 10px; font-size:12.5px; border-top:1px solid #EDF2F3; vertical-align:middle; }
.in-ta { width:100%; min-height:64px; padding:7px 9px; border:1px solid #C9D7DA; border-radius:4px; font:12.5px inherit; font-family:inherit; resize:vertical; }
`;
/* Insurance permission. Until an admin sets it for a user (User Management → Insurance), the user gets the
   same access as for Deposits (BG / FD) — the accounts people who already handle those. */
export const insCan = (user, action) => {
  if (!user) return false;
  if (user.role === 'admin' || user.permissions == null || user.permissions.insurance) return can(user, 'insurance', action);
  return can(user, 'accDeposit', action === 'delete' ? 'edit' : action);
};

export default function BetaInsurance({ view }) {
  const navigate = useNavigate();
  const { search } = useLocation();
  const qs = new URLSearchParams(search);
  const tab = qs.get('tab') === 'create' ? 'create' : 'list';
  const { selectedCompany } = useCompany() || {};
  const { user } = useAuth() || {};
  const companyId = selectedCompany?.companyId;
  const [policies, setPolicies] = useState(null);
  const [claims, setClaims] = useState(null);
  const [orders, setOrders] = useState([]);
  const [reload, setReload] = useState(0);
  const [editing, setEditing] = useState(null);   // { rec } or { renewOf }
  const [note, setNote] = useState(null);
  const [slot, setSlot] = useState(null);
  const canAdd = insCan(user, 'create');
  const base = `/beta/insurance/${view}`;

  useEffect(() => {
    if (!companyId) return;
    axios.get('/api/insurance/policies', { params: { companyId } }).then(r => setPolicies(Array.isArray(r.data) ? r.data : [])).catch(() => setPolicies([]));
    axios.get('/api/insurance/claims', { params: { companyId } }).then(r => setClaims(Array.isArray(r.data) ? r.data : [])).catch(() => setClaims([]));
  }, [companyId, reload]);
  useEffect(() => {
    if (!companyId || view !== 'policies') return;
    axios.get('/api/sales-orders', { params: { companyId } }).then(r => setOrders(Array.isArray(r.data) ? r.data : [])).catch(() => setOrders([]));
  }, [companyId, view]);
  useEffect(() => { setEditing(null); setNote(null); }, [view]);

  if (!insCan(user, 'view')) return <div className="sb"><style>{SALES_CSS}</style><div className="sb-empty" style={{ padding: 30 }}>You are not authorized to see Insurance. Ask the admin for the Insurance permission.</div></div>;
  const cur = editing ? 'create' : (tab === 'create' && canAdd ? 'create' : 'list');
  const go = k => { setEditing(null); navigate(`${base}?tab=${k}`); };
  const saved = text => { setReload(x => x + 1); setNote(text); go('list'); };
  const rows = view === 'claims' ? claims : policies;
  const editLabel = editing?.renewOf ? `Renew ${editing.renewOf.policyNo}` : editing ? `Edit ${editing.rec.policyNo || editing.rec.claimNo || ''}` : '';
  const tabs = view === 'claims'
    ? [['list', 'Claims'], ...(canAdd || editing ? [['create', editing ? editLabel : 'Add Claim']] : [])]
    : [['list', 'Insurance Policies'], ...(canAdd || editing ? [['create', editing ? editLabel : 'Add Policy']] : [])];

  return (
    <div className="sb">
      <style>{SALES_CSS + PX_CSS + EXTRA_CSS}</style>
      <div className="sb-tabs" role="tablist">
        {tabs.map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={cur === k} className={`sb-tab${cur === k ? ' on' : ''}`} onClick={() => go(k)}>
            {label}{k === 'list' && rows && <span className="n">{rows.length}</span>}
          </button>
        ))}
        <div className="sb-slot" ref={setSlot} />
      </div>
      {note && <div className="sb-note" role="status">{note}<button type="button" onClick={() => setNote(null)} aria-label="Dismiss">×</button></div>}
      {view === 'claims'
        ? (cur === 'create'
          ? <div className="sb-body"><ClaimForm key={editing ? editing.rec.claimId : 'new'} companyId={companyId} edit={editing?.rec} policies={policies || []} onCancel={() => go('list')} onSaved={saved} /></div>
          : <ClaimList claims={claims} policies={policies || []} company={selectedCompany} user={user} slot={slot} companyId={companyId}
              onEdit={c => { setNote(null); setEditing({ rec: c }); }} onChanged={t => { setReload(x => x + 1); setNote(t); }} />)
        : (cur === 'create'
          ? <div className="sb-body"><PolicyForm key={editing ? (editing.rec?.policyId || `r${editing.renewOf.policyId}`) : 'new'} companyId={companyId} edit={editing?.rec} renewOf={editing?.renewOf} orders={orders} onCancel={() => go('list')} onSaved={saved} /></div>
          : <PolicyList policies={policies} claims={claims || []} company={selectedCompany} user={user} slot={slot} companyId={companyId}
              onEdit={p => { setNote(null); setEditing({ rec: p }); }} onRenew={p => { setNote(null); setEditing({ renewOf: p }); }}
              onChanged={t => { setReload(x => x + 1); setNote(t); }} />)}
    </div>
  );
}

/* ── documents of a policy / claim: view each, upload a new one ── */
function DocsMenu({ kind, rec, companyId, canUpload, onUploaded }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState('');
  const [label, setLabel] = useState('');
  const ref = useRef(null), fileRef = useRef(null);
  useEffect(() => {
    if (!open) return;
    const down = e => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const key = e => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', down); document.addEventListener('keydown', key);
    return () => { document.removeEventListener('mousedown', down); document.removeEventListener('keydown', key); };
  }, [open]);
  const id = rec && (rec.policyId || rec.claimId);
  const docs = (rec && rec.docs) || [];
  const view = async d => {
    setOpen(false); setBusy('open');
    try {
      const r = await axios.get(`/api/insurance/${kind}/${id}/docs/${encodeURIComponent(d.file)}`, { params: { companyId }, responseType: 'blob' });
      const pdf = /\.pdf$/i.test(d.file);
      const url = URL.createObjectURL(new Blob([r.data], { type: pdf ? 'application/pdf' : (r.data.type || 'application/octet-stream') }));
      openPreview(`${d.label} — ${d.name}`, { pdfUrl: url, fileName: d.name });
    } catch { alert('Could not open the document.'); } finally { setBusy(''); }
  };
  const upload = async e => {
    const f = e.target.files?.[0]; e.target.value = '';
    if (!f || !id) return;
    setBusy('up');
    try {
      const fd = new FormData(); fd.append('label', label); fd.append('file', f);
      await axios.post(`/api/insurance/${kind}/${id}/upload`, fd, { params: { companyId } });
      onUploaded(`${label} uploaded.`);
    } catch { alert('Could not upload the file.'); } finally { setBusy(''); }
  };
  const pick = l => { setLabel(l); setOpen(false); setTimeout(() => fileRef.current?.click(), 0); };
  const LABELS = kind === 'claims' ? ['Claim form', 'Survey report', 'Settlement letter', 'Other document'] : ['Policy copy', 'Premium receipt', 'Endorsement', 'Other document'];
  return (
    <span className="in-pm" ref={ref}>
      <button type="button" className="sb-tbtn" disabled={!rec || !!busy} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(o => !o)}>
        <Svg name="file" size={13} />{busy ? (busy === 'up' ? 'Uploading…' : 'Opening…') : `Documents${docs.length ? ` (${docs.length})` : ''}`}<Svg name="chevDown" size={12} />
      </button>
      {open && rec && (
        <div className="in-pm-list" role="menu">
          {!docs.length && <button type="button" disabled>No document yet<small>Upload the {kind === 'claims' ? 'claim papers' : 'policy copy'} below</small></button>}
          {docs.map((d, i) => <button key={i} type="button" role="menuitem" onClick={() => view(d)}>{d.label}<small>{d.name} · {dmy(d.uploadedAt)}</small></button>)}
          {canUpload && <><hr />{LABELS.map(l => <button key={l} type="button" role="menuitem" onClick={() => pick(l)}>Upload {l.toLowerCase()}…</button>)}</>}
        </div>
      )}
      <input ref={fileRef} type="file" accept=".pdf,image/*" hidden onChange={upload} />
    </span>
  );
}

/* ── PDF / image attachments inside the Add / Edit form; uploaded when the record is saved ── */
const POLICY_DOCS = ['Policy copy', 'Premium receipt', 'Endorsement', 'Other document'];
const CLAIM_DOCS = ['Claim form', 'Survey report', 'Settlement letter', 'Other document'];
const MAX_MB = 20;
function FormDocs({ kind, rec, companyId, files, setFiles }) {
  const labels = kind === 'claims' ? CLAIM_DOCS : POLICY_DOCS;
  const [label, setLabel] = useState(labels[0]);
  const [err, setErr] = useState('');
  const inp = useRef(null);
  const add = e => {
    const list = [...(e.target.files || [])]; e.target.value = '';
    const bad = list.find(f => !/\.pdf$/i.test(f.name) && !/^image\//.test(f.type));
    const big = list.find(f => f.size > MAX_MB * 1024 * 1024);
    if (bad) return setErr(`${bad.name}: only PDF or image files.`);
    if (big) return setErr(`${big.name} is over ${MAX_MB} MB.`);
    setErr(''); setFiles(fs => [...fs, ...list.map(f => ({ label, file: f }))]);
  };
  const view = async d => {
    try {
      const r = await axios.get(`/api/insurance/${kind}/${rec.policyId || rec.claimId}/docs/${encodeURIComponent(d.file)}`, { params: { companyId }, responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([r.data], { type: /\.pdf$/i.test(d.file) ? 'application/pdf' : (r.data.type || 'application/octet-stream') }));
      openPreview(`${d.label} — ${d.name}`, { pdfUrl: url, fileName: d.name });
    } catch { setErr('Could not open the document.'); }
  };
  const saved = (rec && rec.docs) || [];
  const kb = n => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
  return (
    <div className="sf-card">
      <div className="sf-ch"><span className="ico"><Svg name="file" size={13} /></span><b style={{ whiteSpace: 'nowrap' }}>Documents (PDF)</b><span className="grow" />
        <select className="in-dsel" value={label} onChange={e => setLabel(e.target.value)} aria-label="Document type">{labels.map(l => <option key={l}>{l}</option>)}</select>
        <button type="button" className="sf-lnk" style={{ whiteSpace: 'nowrap' }} onClick={() => inp.current?.click()}>+ Attach PDF</button>
        <input ref={inp} type="file" accept=".pdf,image/*" multiple hidden onChange={add} /></div>
      {!saved.length && !files.length ? <div className="sf-empty">No document yet — pick the type, then “+ Attach PDF” (policy copy, premium receipt…). Files upload when you save.</div> : (
        <table className="in-docs"><tbody>
          {saved.map((d, i) => <tr key={`s${i}`}><td style={{ width: 160 }}><b>{d.label}</b></td><td>{d.name}</td><td style={{ width: 120, color: '#667085' }}>{dmy(d.uploadedAt)}</td>
            <td style={{ width: 70, textAlign: 'right' }}><button type="button" className="sf-lnk" onClick={() => view(d)}>View</button></td></tr>)}
          {files.map((d, i) => <tr key={`n${i}`}><td><b>{d.label}</b></td><td>{d.file.name} <span style={{ color: '#667085' }}>· {kb(d.file.size)}</span></td><td style={{ color: '#B54708' }}>Uploads on save</td>
            <td style={{ textAlign: 'right' }}><button type="button" className="sf-lnk" onClick={() => setFiles(fs => fs.filter((_, j) => j !== i))}>Remove</button></td></tr>)}
        </tbody></table>
      )}
      {err && <div className="sf-msg err" style={{ margin: 8 }}>{err}</div>}
    </div>
  );
}
/* upload the attached files to a saved record; gives back the names that failed */
async function uploadDocs(kind, id, files, companyId) {
  const failed = [];
  for (const d of files) {
    try { const fd = new FormData(); fd.append('label', d.label); fd.append('file', d.file); await axios.post(`/api/insurance/${kind}/${id}/upload`, fd, { params: { companyId } }); }
    catch { failed.push(d.file.name); }
  }
  return failed;
}
const doneText = (text, files, failed) => (failed.length ? `${text} Could not upload: ${failed.join(', ')} — try again from Documents.` : files.length ? `${text} ${files.length} document${files.length === 1 ? '' : 's'} uploaded.` : text);

/* ═════════ Policies ═════════ */
function PolicyList({ policies, claims, company, user, slot, companyId, onEdit, onRenew, onChanged }) {
  const [q, setQ] = useState('');
  const [st, setSt] = useState('live');
  const [ty, setTy] = useState('');
  const [selId, setSelId] = useState(null);
  const [ask, setAsk] = useState(null);   // { p, what: 'delete' | 'cancel' }
  const [busy, setBusy] = useState(false);
  useClearSel(ask ? null : selId, setSelId, '.sb-t tbody tr, .sb-tools, .sb-ask, .cpv-ov');
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const list = useMemo(() => (policies || []).filter(p => {
    const k = polState(p).k;
    if (st === 'live' ? !['active', 'expiring', 'pending'].includes(k) : st && k !== st) return false;
    if (ty && p.policyType !== ty) return false;
    return !words.length || words.every(w => `${p.policyNo} ${p.policyType} ${p.insurer} ${p.agentName} ${p.coverFor} ${p.coverDetails} ${p.orderNo} ${p.clientName} ${p.remarks}`.toLowerCase().includes(w));
  }).sort((a, b) => String(a.endDate || '9').localeCompare(String(b.endDate || '9'))), [policies, st, ty, words.join(' ')]);   // eslint-disable-line react-hooks/exhaustive-deps
  const sel = list.find(p => p.policyId === selId) || null;
  const canEdit = insCan(user, 'edit'), canDel = insCan(user, 'delete'), canAdd = insCan(user, 'create');
  const all = policies || [];
  const live = all.filter(p => ['active', 'expiring'].includes(polState(p).k));
  const fy = fyStart();
  const premFy = all.filter(p => p.status !== 'cancelled' && (p.paymentDate || p.startDate) >= fy).reduce((t, p) => t + (Number(p.totalPremium) || 0), 0);
  const nState = k => all.filter(p => polState(p).k === k).length;
  const openClaims = p => claims.filter(c => String(c.policyId) === String(p.policyId) && !['Settled', 'Rejected'].includes(c.claimStatus)).length;
  const act = async (p, what) => {
    setBusy(true);
    try {
      if (what === 'delete') await axios.delete(`/api/insurance/policies/${p.policyId}`, { params: { companyId } });
      else await axios.put(`/api/insurance/policies/${p.policyId}`, { setStatus: what === 'cancel' ? 'cancelled' : 'active' }, { params: { companyId } });
      setAsk(null); setSelId(null);
      onChanged(`${what === 'delete' ? 'Deleted' : what === 'cancel' ? 'Cancelled' : 'Re-activated'} policy ${p.policyNo}.`);
    } catch (e) { onChanged(e.response?.data?.error || 'Could not do that.'); } finally { setBusy(false); }
  };
  const printList = () => printDepList({
    title: 'INSURANCE POLICY LIST', company, user, filter: [(P_STATES.find(x => x[0] === st) || [])[1], ty].filter(Boolean).join(' · '),
    total: list.reduce((t, p) => t + (Number(p.totalPremium) || 0), 0),
    heads: ['Policy No.', 'Type', 'Insurer', 'Covers', 'Sum Insured ₹', 'Premium ₹', 'Start', 'Expiry', 'Agent', 'Status'],
    rows: list.map(p => [p.policyNo, p.policyType, p.insurer, [p.coverFor, p.orderNo && `SO ${p.orderNo}`].filter(Boolean).join(' · '), amt(p.sumInsured), amt(p.totalPremium),
      dmy(p.startDate), dmy(p.endDate), [p.agentName, p.agentPhone].filter(Boolean).join(' '), polState(p).label]),
  });
  return (
    <>
      {slot && createPortal(<>
        <input className="sb-search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search policy…" aria-label="Search policies" style={{ width: 150 }} />
        <select className="sb-search" style={{ width: 130 }} value={ty} onChange={e => setTy(e.target.value)} aria-label="Type"><option value="">All types</option>{TYPES.map(t => <option key={t}>{t}</option>)}</select>
        <select className="sb-search" style={{ width: 130 }} value={st} onChange={e => setSt(e.target.value)} aria-label="Status">{P_STATES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        <button type="button" className="sb-tbtn" onClick={printList}><Svg name="file" size={13} />Print list</button>
        <div className="sb-tools">
          <span className="sb-picked">{sel ? <b>{sel.policyNo}</b> : 'Select a policy'}</span>
          <DocsMenu kind="policies" rec={sel} companyId={companyId} canUpload={canEdit} onUploaded={onChanged} />
          {canAdd && <button type="button" className="sb-tbtn" disabled={!sel || !!sel.renewedToId || sel.status === 'cancelled'} onClick={() => onRenew(sel)} title="Make next year's policy from this one"><Svg name="refresh" size={13} />Renew</button>}
          {canEdit && <button type="button" className="sb-tbtn" disabled={!sel} onClick={() => onEdit(sel)}><Svg name="settings" size={13} />Edit</button>}
          {canEdit && <button type="button" className="sb-tbtn" disabled={!sel} onClick={() => (sel.status === 'cancelled' ? act(sel, 'activate') : setAsk({ p: sel, what: 'cancel' }))}>{sel && sel.status === 'cancelled' ? 'Re-activate' : 'Cancel'}</button>}
          {canDel && <button type="button" className="sb-tbtn del" disabled={!sel} onClick={() => setAsk({ p: sel, what: 'delete' })}><Svg name="x" size={13} />Delete</button>}
        </div>
      </>, slot)}
      {ask && (
        <div className="sb-ask" role="alertdialog" aria-label="Confirm">
          <span><b>{ask.what === 'delete' ? 'Delete' : 'Cancel'} policy {ask.p.policyNo}</b> ({ask.p.insurer})?{ask.what === 'cancel' ? ' It stays in the list as Cancelled.' : ''}</span>
          <button type="button" className="sb-abtn" onClick={() => setAsk(null)} disabled={busy}>Keep</button>
          <button type="button" className="sb-abtn danger" onClick={() => act(ask.p, ask.what)} disabled={busy}>{busy ? 'Working…' : `Yes, ${ask.what}`}</button>
        </div>
      )}
      <div className="in-sum">
        <div>Live policies<b>{live.length}</b></div>
        <div>Sum insured (live)<b>₹ {amt(live.reduce((t, p) => t + (Number(p.sumInsured) || 0), 0))}</b></div>
        <div>Premium this FY<b>₹ {amt(premFy)}</b></div>
        <div>Expiring ≤ 30 days<b style={{ color: '#B54708' }}>{nState('expiring')}</b></div>
        <div>Expired, not renewed<b style={{ color: '#B42318' }}>{nState('expired')}</b></div>
        <div>Open claims<b>{claims.filter(c => !['Settled', 'Rejected'].includes(c.claimStatus)).length}</b></div>
      </div>
      <div className="sb-list">
        <table className="sb-t px inx">
          <colgroup>{[3, 11, 10, 11, 17, 9, 8, 6.5, 6.5, 9, 9].map((w, i) => <col key={i} style={{ width: `${w}%` }} />)}</colgroup>
          <thead><tr><th className="r">Sr</th><th>Policy No.</th><th>Type</th><th>Insurer</th><th>Covers</th><th className="r">Sum Insured ₹</th><th className="r">Premium ₹</th><th>Start</th><th>Expiry</th><th>Agent</th><th>Status</th></tr></thead>
          <tbody>
            {policies === null ? <tr><td colSpan={11} className="sb-empty">Loading…</td></tr>
              : !list.length ? <tr><td colSpan={11} className="sb-empty">{q || ty || st ? 'Nothing matches — try “All” in the status filter.' : 'No policy yet — click “Add Policy”.'}</td></tr>
                : list.map((p, i) => {
                  const s = polState(p), [bg, fg] = PILL[s.k] || PILL.active, oc = openClaims(p);
                  return (
                    <tr key={p.policyId} className={selId === p.policyId ? 'sel' : ''} onClick={() => setSelId(p.policyId)} onDoubleClick={() => canEdit && onEdit(p)} style={{ cursor: 'pointer' }}>
                      <td className="r">{i + 1}</td>
                      <td><b className="mono">{p.policyNo}</b>{(p.docs || []).length > 0 && <span className="sm">{p.docs.length} document{p.docs.length === 1 ? '' : 's'}</span>}</td>
                      <td>{p.policyType}</td>
                      <td>{p.insurer}</td>
                      <td><b>{p.coverFor}</b>{(p.orderNo || p.clientName) && <span className="sm">{[p.orderNo && `SO ${String(p.orderNo).trim()}`, p.clientName].filter(Boolean).join(' · ')}</span>}</td>
                      <td className="r b d">{amt(p.sumInsured)}</td>
                      <td className="r d">{amt(p.totalPremium)}</td>
                      <td className="d">{dmy(p.startDate)}</td>
                      <td className="d b">{dmy(p.endDate)}</td>
                      <td>{p.agentName || '—'}{p.agentPhone && <span className="sm">{p.agentPhone}</span>}</td>
                      <td><span className="in-pill" style={{ background: bg, color: fg }}>{s.label}</span>{oc > 0 && <span className="sm">{oc} open claim{oc === 1 ? '' : 's'}</span>}</td>
                    </tr>
                  );
                })}
          </tbody>
        </table>
      </div>
    </>
  );
}

function PolicyForm({ companyId, edit, renewOf, orders, onSaved, onCancel }) {
  const src = edit || renewOf || {};
  const [files, setFiles] = useState([]);
  const [v, setV] = useState(() => {
    const start = renewOf ? addDays(renewOf.endDate, 1) || today() : (src.startDate || today());
    return {
      policyNo: edit ? src.policyNo || '' : '', policyType: src.policyType || 'Fire', insurer: src.insurer || '', agentName: src.agentName || '', agentPhone: src.agentPhone || '',
      coverFor: src.coverFor || '', coverDetails: src.coverDetails || '', orderId: src.orderId ? String(src.orderId) : '',
      sumInsured: src.sumInsured ? String(src.sumInsured) : '', premium: edit && src.premium ? String(src.premium) : (renewOf && src.premium ? String(src.premium) : ''),
      gstPct: src.gstPct != null && src.gstPct !== '' ? String(src.gstPct) : '18',
      paymentMode: edit ? src.paymentMode || '' : '', paymentRef: edit ? src.paymentRef || '' : '', paymentDate: edit ? src.paymentDate || '' : '',
      startDate: start, endDate: edit ? src.endDate || '' : yearEnd(start), endTyped: !!edit, remarks: edit ? src.remarks || '' : '',
    };
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const set = k => e => { const x = e.target.value; setV(o => ({ ...o, [k]: x })); setMsg(null); };
  const num = k => e => { const x = e.target.value.replace(/[^\d.]/g, ''); setV(o => ({ ...o, [k]: x })); setMsg(null); };
  useEffect(() => { if (!v.endTyped) setV(o => ({ ...o, endDate: yearEnd(o.startDate) })); }, [v.startDate, v.endTyped]);
  const so = orders.find(o => String(o.orderId) === v.orderId) || null;
  const gst = Math.round((Number(v.premium) || 0) * (Number(v.gstPct) || 0)) / 100;
  const total = (Number(v.premium) || 0) + gst;
  const openOrders = useMemo(() => orders.filter(o => !['cancelled', 'rejected'].includes(o.status) || String(o.orderId) === v.orderId)
    .sort((a, b) => String(b.orderDate || '').localeCompare(String(a.orderDate || ''))), [orders, v.orderId]);

  const save = async () => {
    if (!v.policyNo.trim()) return setMsg({ k: 'err', t: 'Enter the policy number.' });
    if (!v.insurer.trim()) return setMsg({ k: 'err', t: 'Enter the insurance company.' });
    if (!v.coverFor.trim()) return setMsg({ k: 'err', t: 'Enter what the policy covers.' });
    if (!v.startDate || !v.endDate) return setMsg({ k: 'err', t: 'Enter the start and expiry date.' });
    if (v.endDate < v.startDate) return setMsg({ k: 'err', t: 'The expiry date is before the start date.' });
    setBusy(true);
    const payload = {
      companyId, policyNo: v.policyNo.trim(), policyType: v.policyType, insurer: v.insurer.trim(), agentName: v.agentName.trim(), agentPhone: v.agentPhone.trim(),
      coverFor: v.coverFor.trim(), coverDetails: v.coverDetails.trim(),
      orderId: so ? so.orderId : (v.orderId ? src.orderId : ''), orderNo: so ? String(so.orderNo || '').trim() : (v.orderId ? src.orderNo : ''), clientName: so ? so.customerName || so.party || '' : (v.orderId ? src.clientName : ''),
      sumInsured: v.sumInsured, premium: v.premium, gstPct: v.gstPct, gst, paymentMode: v.paymentMode, paymentRef: v.paymentRef.trim(), paymentDate: v.paymentDate,
      startDate: v.startDate, endDate: v.endDate, remarks: v.remarks.trim(), renewedFromId: renewOf ? renewOf.policyId : undefined,
    };
    try {
      const r = edit ? await axios.put(`/api/insurance/policies/${edit.policyId}`, payload, { params: { companyId } }) : await axios.post('/api/insurance/policies', payload, { params: { companyId } });
      const failed = await uploadDocs('policies', r.data.policyId, files, companyId);
      onSaved(doneText(edit ? `Updated policy ${payload.policyNo}.` : renewOf ? `Renewed ${renewOf.policyNo} as ${payload.policyNo}.` : `Saved policy ${payload.policyNo}.`, files, failed));
    } catch (e) { setMsg({ k: 'err', t: e.response?.data?.error || 'Could not save the policy.' }); }
    finally { setBusy(false); }
  };
  const dl = daysTo(v.endDate);
  return (
    <div className="sf">
      <div className="sf-hero"><span className="ic"><Svg name="shield" size={15} /></span><h1>{edit ? `Edit policy ${edit.policyNo}` : renewOf ? `Renew policy ${renewOf.policyNo}` : 'Add Insurance Policy'}</h1><span className="grow" /></div>
      {renewOf && <div className="sf-msg ok" style={{ marginTop: 10 }}>Details are copied from {renewOf.policyNo}; the cover starts the day after it expires ({dmy(addDays(renewOf.endDate, 1))}). Enter the new policy number and premium.</div>}
      <div className="sf-2" style={{ marginTop: 10 }}>
        <div className="sf-card">
          <div className="sf-ch"><span className="ico"><Svg name="shield" size={13} /></span><b>Policy</b></div>
          <table className="sf-kv"><tbody>
            <tr><th>Policy No. <i>*</i></th><td><input value={v.policyNo} onChange={set('policyNo')} className="mono" placeholder="As on the policy" autoFocus /></td></tr>
            <tr><th>Type <i>*</i></th><td><select value={v.policyType} onChange={set('policyType')}>{TYPES.map(t => <option key={t}>{t}</option>)}</select></td></tr>
            <tr><th>Insurance company <i>*</i></th><td><input value={v.insurer} onChange={set('insurer')} placeholder="e.g. New India Assurance" /></td></tr>
            <tr><th>Agent / broker</th><td><input value={v.agentName} onChange={set('agentName')} placeholder="Optional" /></td></tr>
            <tr><th>Agent phone</th><td><input value={v.agentPhone} onChange={set('agentPhone')} inputMode="tel" placeholder="Optional" /></td></tr>
          </tbody></table>
        </div>
        <div className="sf-card">
          <div className="sf-ch"><span className="ico"><Svg name="box" size={13} /></span><b>What it covers</b></div>
          <table className="sf-kv"><tbody>
            <tr><th>Covers <i>*</i></th><td><input value={v.coverFor} onChange={set('coverFor')} placeholder="e.g. GJ01AB1234 / factory stock / 40 workers" /></td></tr>
            <tr><th>Details</th><td><textarea className="in-ta" value={v.coverDetails} onChange={set('coverDetails')} placeholder="Location, vehicle / machine details, people covered…" /></td></tr>
            <tr><th>For sales order</th><td><select value={v.orderId} onChange={set('orderId')}>
              <option value="">— not for an order (company policy) —</option>
              {src.orderId && !so && <option value={String(src.orderId)}>{src.orderNo} · {src.clientName}</option>}
              {openOrders.map(o => <option key={o.orderId} value={String(o.orderId)}>{String(o.orderNo || '').trim()} · {o.customerName || o.party}</option>)}
            </select><div style={{ fontSize: 11, color: '#667085', marginTop: 3 }}>For project insurance a client asks for (CAR, WC…)</div></td></tr>
          </tbody></table>
        </div>
      </div>
      <div className="sf-2">
        <div className="sf-card">
          <div className="sf-ch"><span className="ico"><Svg name="wallet" size={13} /></span><b>Amount &amp; payment</b></div>
          <table className="sf-kv"><tbody>
            <tr><th>Sum insured ₹</th><td><input value={v.sumInsured} onChange={num('sumInsured')} className="num" inputMode="decimal" placeholder="0.00" /></td></tr>
            <tr><th>Premium ₹</th><td><input value={v.premium} onChange={num('premium')} className="num" inputMode="decimal" placeholder="Before GST" /></td></tr>
            <tr><th>GST %</th><td><input value={v.gstPct} onChange={num('gstPct')} className="num" inputMode="decimal" />
              <div style={{ fontSize: 11, color: '#667085', marginTop: 3 }}>GST ₹ {amt(gst)} · <b>Total premium ₹ {amt(total)}</b></div></td></tr>
            <tr><th>Paid by</th><td><select value={v.paymentMode} onChange={set('paymentMode')}><option value="">—</option>{[...new Set([...PAY_MODES, ...(v.paymentMode ? [v.paymentMode] : [])])].map(m => <option key={m}>{m}</option>)}</select></td></tr>
            <tr><th>Payment ref / date</th><td style={{ display: 'flex', gap: 6 }}><input value={v.paymentRef} onChange={set('paymentRef')} placeholder="UTR / cheque no." /><input type="date" value={v.paymentDate} onChange={set('paymentDate')} style={{ maxWidth: 160 }} /></td></tr>
          </tbody></table>
        </div>
        <div className="sf-card">
          <div className="sf-ch"><span className="ico"><Svg name="clock" size={13} /></span><b>Period</b></div>
          <table className="sf-kv"><tbody>
            <tr><th>Start date <i>*</i></th><td><input type="date" value={v.startDate} onChange={e => { const x = e.target.value; setV(o => ({ ...o, startDate: x, endTyped: false })); setMsg(null); }} /></td></tr>
            <tr><th>Expiry date <i>*</i></th><td><input type="date" value={v.endDate} onChange={e => { const x = e.target.value; setV(o => ({ ...o, endDate: x, endTyped: true })); setMsg(null); }} />
              <div style={{ fontSize: 11, color: dl != null && dl < 0 ? '#B42318' : dl != null && dl <= 30 ? '#B54708' : '#667085', marginTop: 3 }}>
                {v.endTyped ? '' : 'One year from the start date · '}{dl == null ? '' : dl < 0 ? `expired ${-dl} days ago` : `${dl} days left`}</div></td></tr>
            <tr><th>Remarks</th><td><input value={v.remarks} onChange={set('remarks')} placeholder="Optional" /></td></tr>
          </tbody></table>
        </div>
      </div>
      <FormDocs kind="policies" rec={edit} companyId={companyId} files={files} setFiles={setFiles} />
      {msg && <div className={`sf-msg ${msg.k}`} role="status">{msg.t}</div>}
      <div className="sf-bar">
        <div className="info">{v.policyType} · ₹ {amt(Number(v.sumInsured) || 0)} insured · premium ₹ {amt(total)} · {dmy(v.startDate) || '—'} to {dmy(v.endDate) || '—'}</div>
        <button type="button" className="sf-b ghost" onClick={onCancel} disabled={busy}>Cancel</button>
        <button type="button" className="sf-b pri" onClick={save} disabled={busy}>{busy ? 'Saving…' : edit ? 'Update' : renewOf ? 'Save renewal' : 'Save'}</button>
      </div>
    </div>
  );
}

/* ═════════ Claims ═════════ */
function ClaimList({ claims, policies, company, user, slot, companyId, onEdit, onChanged }) {
  const [q, setQ] = useState('');
  const [st, setSt] = useState('');
  const [selId, setSelId] = useState(null);
  const [ask, setAsk] = useState(null);
  const [busy, setBusy] = useState(false);
  useClearSel(ask ? null : selId, setSelId, '.sb-t tbody tr, .sb-tools, .sb-ask, .cpv-ov');
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const list = useMemo(() => (claims || []).filter(c => (!st || (st === 'open' ? !['Settled', 'Rejected'].includes(c.claimStatus) : c.claimStatus === st))
    && (!words.length || words.every(w => `${c.claimNo} ${c.policyNo} ${c.policyType} ${c.insurer} ${c.reason} ${c.remarks}`.toLowerCase().includes(w))))
    .sort((a, b) => String(b.claimDate || '').localeCompare(String(a.claimDate || ''))), [claims, st, words.join(' ')]);   // eslint-disable-line react-hooks/exhaustive-deps
  const sel = list.find(c => c.claimId === selId) || null;
  const canEdit = insCan(user, 'edit'), canDel = insCan(user, 'delete');
  const all = claims || [];
  const open = all.filter(c => !['Settled', 'Rejected'].includes(c.claimStatus));
  const del = async c => {
    setBusy(true);
    try { await axios.delete(`/api/insurance/claims/${c.claimId}`, { params: { companyId } }); setAsk(null); setSelId(null); onChanged(`Deleted claim ${c.claimNo || c.claimId}.`); }
    catch (e) { onChanged(e.response?.data?.error || 'Could not delete.'); } finally { setBusy(false); }
  };
  return (
    <>
      {slot && createPortal(<>
        <input className="sb-search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search claim no, policy, insurer, reason…" aria-label="Search claims" />
        <select className="sb-search" style={{ width: 150 }} value={st} onChange={e => setSt(e.target.value)} aria-label="Status">
          <option value="">All</option><option value="open">Open</option>{CLAIM_ST.map(s => <option key={s}>{s}</option>)}</select>
        <button type="button" className="sb-tbtn" onClick={() => printDepList({
          title: 'INSURANCE CLAIM LIST', company, user, filter: st === 'open' ? 'Open' : st, total: list.reduce((t, c) => t + (Number(c.amountClaimed) || 0), 0),
          heads: ['Claim No.', 'Claim Date', 'Policy No.', 'Type', 'Insurer', 'Reason', 'Claimed ₹', 'Settled ₹', 'Settled On', 'Status'],
          rows: list.map(c => [c.claimNo, dmy(c.claimDate), c.policyNo, c.policyType, c.insurer, c.reason, amt(c.amountClaimed), amt(c.amountSettled), dmy(c.settledDate), c.claimStatus]),
        })}><Svg name="file" size={13} />Print list</button>
        <div className="sb-tools">
          <span className="sb-picked">{sel ? <>Selected: <b>{sel.claimNo || sel.claimId}</b></> : 'Click a claim to select'}</span>
          <DocsMenu kind="claims" rec={sel} companyId={companyId} canUpload={canEdit} onUploaded={onChanged} />
          {canEdit && <button type="button" className="sb-tbtn" disabled={!sel} onClick={() => onEdit(sel)}><Svg name="settings" size={13} />Edit</button>}
          {canDel && <button type="button" className="sb-tbtn del" disabled={!sel} onClick={() => setAsk(sel)}><Svg name="x" size={13} />Delete</button>}
        </div>
      </>, slot)}
      {ask && (
        <div className="sb-ask" role="alertdialog" aria-label="Confirm delete">
          <span><b>Delete claim {ask.claimNo || ask.claimId}</b> on policy {ask.policyNo}?</span>
          <button type="button" className="sb-abtn" onClick={() => setAsk(null)} disabled={busy}>Keep</button>
          <button type="button" className="sb-abtn danger" onClick={() => del(ask)} disabled={busy}>{busy ? 'Deleting…' : 'Yes, delete'}</button>
        </div>
      )}
      <div className="in-sum">
        <div>Open claims<b>{open.length}</b></div>
        <div>Claimed (open)<b>₹ {amt(open.reduce((t, c) => t + (Number(c.amountClaimed) || 0), 0))}</b></div>
        <div>Settled claims<b style={{ color: '#067647' }}>{all.filter(c => c.claimStatus === 'Settled').length}</b></div>
        <div>Amount received<b style={{ color: '#067647' }}>₹ {amt(all.reduce((t, c) => t + (Number(c.amountSettled) || 0), 0))}</b></div>
        <div>Rejected<b style={{ color: '#B42318' }}>{all.filter(c => c.claimStatus === 'Rejected').length}</b></div>
      </div>
      <div className="sb-list">
        <table className="sb-t px inx">
          <colgroup>{[3, 10, 7, 12, 12, 22, 9, 9, 7, 9].map((w, i) => <col key={i} style={{ width: `${w}%` }} />)}</colgroup>
          <thead><tr><th className="r">Sr</th><th>Claim No.</th><th>Claim Date</th><th>Policy</th><th>Insurer</th><th>Reason</th><th className="r">Claimed ₹</th><th className="r">Settled ₹</th><th>Settled On</th><th>Status</th></tr></thead>
          <tbody>
            {claims === null ? <tr><td colSpan={10} className="sb-empty">Loading…</td></tr>
              : !list.length ? <tr><td colSpan={10} className="sb-empty">{q || st ? 'Nothing matches.' : policies.length ? 'No claim yet — click “Add Claim”.' : 'Add a policy first (Insurance → Policies), then its claims here.'}</td></tr>
                : list.map((c, i) => {
                  const [bg, fg] = PILL[c.claimStatus] || PILL.Filed;
                  return (
                    <tr key={c.claimId} className={selId === c.claimId ? 'sel' : ''} onClick={() => setSelId(c.claimId)} onDoubleClick={() => canEdit && onEdit(c)} style={{ cursor: 'pointer' }}>
                      <td className="r">{i + 1}</td>
                      <td><b className="mono">{c.claimNo || '—'}</b>{(c.docs || []).length > 0 && <span className="sm">{c.docs.length} document{c.docs.length === 1 ? '' : 's'}</span>}</td>
                      <td className="d">{dmy(c.claimDate)}</td>
                      <td><b className="mono">{c.policyNo}</b><span className="sm">{c.policyType}</span></td>
                      <td>{c.insurer}</td>
                      <td>{c.reason || '—'}{c.incidentDate && <span className="sm">Incident {dmy(c.incidentDate)}</span>}</td>
                      <td className="r b d">{amt(c.amountClaimed)}</td>
                      <td className="r d">{c.amountSettled ? amt(c.amountSettled) : '—'}</td>
                      <td className="d">{dmy(c.settledDate) || '—'}</td>
                      <td><span className="in-pill" style={{ background: bg, color: fg }}>{c.claimStatus}</span></td>
                    </tr>
                  );
                })}
          </tbody>
        </table>
      </div>
    </>
  );
}

function ClaimForm({ companyId, edit, policies, onSaved, onCancel }) {
  const e0 = edit || {};
  const [files, setFiles] = useState([]);
  const [v, setV] = useState(() => ({
    policyId: e0.policyId ? String(e0.policyId) : '', claimNo: e0.claimNo || '', claimDate: e0.claimDate || today(), incidentDate: e0.incidentDate || '',
    reason: e0.reason || '', amountClaimed: e0.amountClaimed ? String(e0.amountClaimed) : '', amountSettled: e0.amountSettled ? String(e0.amountSettled) : '',
    settledDate: e0.settledDate || '', claimStatus: e0.claimStatus || 'Filed', remarks: e0.remarks || '',
  }));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const set = k => e => { const x = e.target.value; setV(o => ({ ...o, [k]: x })); setMsg(null); };
  const num = k => e => { const x = e.target.value.replace(/[^\d.]/g, ''); setV(o => ({ ...o, [k]: x })); setMsg(null); };
  const pol = policies.find(p => String(p.policyId) === v.policyId) || null;
  const choices = useMemo(() => [...policies].filter(p => p.status !== 'cancelled' || String(p.policyId) === v.policyId)
    .sort((a, b) => String(b.endDate || '').localeCompare(String(a.endDate || ''))), [policies, v.policyId]);
  const save = async () => {
    if (!pol && !edit) return setMsg({ k: 'err', t: 'Pick the policy.' });
    if (!v.claimDate) return setMsg({ k: 'err', t: 'Enter the claim date.' });
    if (!(Number(v.amountClaimed) > 0)) return setMsg({ k: 'err', t: 'Enter the amount claimed.' });
    if (Number(v.amountSettled) > Number(v.amountClaimed)) return setMsg({ k: 'err', t: 'The settled amount is more than the amount claimed.' });
    if (v.claimStatus === 'Settled' && !(Number(v.amountSettled) > 0)) return setMsg({ k: 'err', t: 'Enter the amount received for a settled claim.' });
    setBusy(true);
    const p = pol || {};
    const payload = {
      companyId, policyId: pol ? pol.policyId : e0.policyId, policyNo: pol ? p.policyNo : e0.policyNo, policyType: pol ? p.policyType : e0.policyType, insurer: pol ? p.insurer : e0.insurer,
      claimNo: v.claimNo.trim(), claimDate: v.claimDate, incidentDate: v.incidentDate, reason: v.reason.trim(), amountClaimed: v.amountClaimed,
      amountSettled: v.amountSettled, settledDate: v.settledDate, claimStatus: v.claimStatus, remarks: v.remarks.trim(),
    };
    try {
      const r = edit ? await axios.put(`/api/insurance/claims/${edit.claimId}`, payload, { params: { companyId } }) : await axios.post('/api/insurance/claims', payload, { params: { companyId } });
      const failed = await uploadDocs('claims', r.data.claimId, files, companyId);
      onSaved(doneText(edit ? `Updated claim ${payload.claimNo || edit.claimId}.` : `Saved claim${payload.claimNo ? ` ${payload.claimNo}` : ''} on policy ${payload.policyNo}.`, files, failed));
    } catch (e) { setMsg({ k: 'err', t: e.response?.data?.error || 'Could not save the claim.' }); }
    finally { setBusy(false); }
  };
  return (
    <div className="sf">
      <div className="sf-hero"><span className="ic"><Svg name="alert" size={15} /></span><h1>{edit ? `Edit claim ${edit.claimNo || edit.claimId}` : 'Add Insurance Claim'}</h1><span className="grow" /></div>
      <div className="sf-2" style={{ marginTop: 10 }}>
        <div className="sf-card">
          <div className="sf-ch"><span className="ico"><Svg name="shield" size={13} /></span><b>Policy &amp; incident</b></div>
          <table className="sf-kv"><tbody>
            <tr><th>Policy <i>*</i></th><td><select value={v.policyId} onChange={set('policyId')} autoFocus={!edit}>
              <option value="">{edit && !pol ? `${e0.policyNo} · ${e0.insurer}` : 'Choose the policy…'}</option>
              {choices.map(p => <option key={p.policyId} value={String(p.policyId)}>{p.policyNo} · {p.policyType} · {p.insurer} ({dmy(p.endDate)})</option>)}
            </select></td></tr>
            <tr><th>Covers</th><td>{pol ? <><b>{pol.coverFor}</b> · ₹ {amt(pol.sumInsured)} insured</> : '—'}</td></tr>
            <tr><th>Incident date</th><td><input type="date" value={v.incidentDate} onChange={set('incidentDate')} /></td></tr>
            <tr><th>Reason / loss</th><td><textarea className="in-ta" value={v.reason} onChange={set('reason')} placeholder="What happened, what was damaged / lost" /></td></tr>
          </tbody></table>
        </div>
        <div className="sf-card">
          <div className="sf-ch"><span className="ico"><Svg name="wallet" size={13} /></span><b>Claim</b></div>
          <table className="sf-kv"><tbody>
            <tr><th>Claim No.</th><td><input value={v.claimNo} onChange={set('claimNo')} className="mono" placeholder="Given by the insurer" /></td></tr>
            <tr><th>Claim date <i>*</i></th><td><input type="date" value={v.claimDate} onChange={set('claimDate')} /></td></tr>
            <tr><th>Amount claimed ₹ <i>*</i></th><td><input value={v.amountClaimed} onChange={num('amountClaimed')} className="num" inputMode="decimal" placeholder="0.00" /></td></tr>
            <tr><th>Status</th><td><select value={v.claimStatus} onChange={set('claimStatus')}>{CLAIM_ST.map(s => <option key={s}>{s}</option>)}</select></td></tr>
            <tr><th>Amount settled ₹</th><td><input value={v.amountSettled} onChange={num('amountSettled')} className="num" inputMode="decimal" placeholder="When the insurer pays" /></td></tr>
            <tr><th>Settled on</th><td><input type="date" value={v.settledDate} onChange={set('settledDate')} /></td></tr>
            <tr><th>Remarks</th><td><input value={v.remarks} onChange={set('remarks')} placeholder="Surveyor, follow-up…" /></td></tr>
          </tbody></table>
        </div>
      </div>
      <FormDocs kind="claims" rec={edit} companyId={companyId} files={files} setFiles={setFiles} />
      {msg && <div className={`sf-msg ${msg.k}`} role="status">{msg.t}</div>}
      <div className="sf-bar">
        <div className="info">{pol ? `${pol.policyNo} · ${pol.insurer}` : 'Pick the policy'} · claimed ₹ {amt(Number(v.amountClaimed) || 0)} · {v.claimStatus}</div>
        <button type="button" className="sf-b ghost" onClick={onCancel} disabled={busy}>Cancel</button>
        <button type="button" className="sf-b pri" onClick={save} disabled={busy}>{busy ? 'Saving…' : edit ? 'Update' : 'Save'}</button>
      </div>
    </div>
  );
}
