/* Beta — HR → Company Assets (/api/hr/assets): SIM, mobile, laptop, vehicle, ID card, tools… given to an employee.
 * Issue (with serial / IMEI / SIM no., value, condition, accessories), Return (date + condition), Lost / damaged,
 * Print the Asset Handover Agreement (terms of use + signatures), upload the signed copy. */
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
import { ACC_CSS, amt, today, words, hit, Picker } from './BetaAccKit';
import { hrCan, STATUS_PILL, loadEmployees, loadSettings, viewHrFile, toForm } from './BetaHRKit';
import { printAssetAgreement } from './BetaHRPrint';

const TYPES = ['SIM card', 'Mobile phone', 'Laptop', 'Desktop', 'Tablet', 'Data card / router', 'Vehicle', 'Two-wheeler', 'ID card', 'Access card / keys', 'Tools', 'Safety kit / PPE', 'Uniform', 'Fuel card', 'Credit card', 'Other'];
const CONDS = ['New', 'Good', 'Fair', 'Damaged'];
const ST_LABEL = { issued: 'With employee', returned: 'Returned', lost: 'Lost', damaged: 'Damaged' };

export default function BetaHRAssets() {
  const navigate = useNavigate();
  const { search } = useLocation();
  const tab = new URLSearchParams(search).get('tab') === 'create' ? 'create' : 'list';
  const { selectedCompany } = useCompany() || {};
  const { user } = useAuth() || {};
  const companyId = selectedCompany?.companyId;
  const [rows, setRows] = useState(null);
  const [emps, setEmps] = useState([]);
  const [settings, setSettings] = useState({});
  const [reload, setReload] = useState(0);
  const [editing, setEditing] = useState(null);   // { rec, returning }
  const [note, setNote] = useState(null);
  const [slot, setSlot] = useState(null);
  const canAdd = hrCan(user, 'create');
  useEffect(() => {
    if (!companyId) return;
    axios.get('/api/hr/assets', { params: { companyId } }).then(r => setRows(Array.isArray(r.data) ? r.data : [])).catch(() => setRows([]));
    loadEmployees(companyId).then(setEmps).catch(() => setEmps([]));
    loadSettings(companyId).then(setSettings);
  }, [companyId, reload]);
  if (!hrCan(user, 'view')) return <div className="sb"><style>{SALES_CSS}</style><div className="sb-empty" style={{ padding: 30 }}>You are not authorized to see HR.</div></div>;
  const cur = editing ? 'create' : (tab === 'create' && canAdd ? 'create' : 'list');
  const go = k => { setEditing(null); navigate(`/beta/hr/assets?tab=${k}`); };
  return (
    <div className="sb">
      <style>{SALES_CSS + PX_CSS + ACC_CSS}</style>
      <div className="sb-tabs" role="tablist">
        {[['list', 'Company Assets'], ...(canAdd || editing ? [['create', editing ? (editing.returning ? `Return ${editing.rec.assetName}` : `Edit ${editing.rec.assetName}`) : 'Issue Asset']] : [])].map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={cur === k} className={`sb-tab${cur === k ? ' on' : ''}`} onClick={() => go(k)}>{l}{k === 'list' && rows && <span className="n">{rows.length}</span>}</button>
        ))}
        <div className="sb-slot" ref={setSlot} />
      </div>
      {note && <div className="sb-note" role="status">{note}<button type="button" onClick={() => setNote(null)} aria-label="Dismiss">×</button></div>}
      {cur === 'create'
        ? <div className="sb-body"><AssetForm key={editing ? `${editing.rec.id}${editing.returning ? 'r' : ''}` : 'new'} companyId={companyId} edit={editing?.rec} returning={editing?.returning} emps={emps} onCancel={() => go('list')} onSaved={t => { setReload(x => x + 1); setNote(t); go('list'); }} /></div>
        : <AssetList rows={rows} emps={emps} settings={settings} company={selectedCompany} user={user} slot={slot} companyId={companyId}
            onEdit={a => { setNote(null); setEditing({ rec: a }); }} onReturn={a => { setNote(null); setEditing({ rec: a, returning: true }); }} onChanged={t => { setReload(x => x + 1); setNote(t); }} />}
    </div>
  );
}

function AssetList({ rows, emps, settings, company, user, slot, companyId, onEdit, onReturn, onChanged }) {
  const [q, setQ] = useState('');
  const [st, setSt] = useState('issued');
  const [ty, setTy] = useState('');
  const [selId, setSelId] = useState(null);
  const [ask, setAsk] = useState(null);
  const [busy, setBusy] = useState(false);
  useClearSel(ask ? null : selId, setSelId, '.sb-t tbody tr, .sb-tools, .sb-ask, .cpv-ov');
  const w = words(q);
  const all = rows || [];
  const list = useMemo(() => all.filter(a => (!st || a.status === st) && (!ty || a.assetType === ty) && hit(`${a.assetName} ${a.assetType} ${a.serialNo} ${a.simNo} ${a.mobileNo} ${a.empName} ${a.empCode} ${a.remarks}`, w)), [all, st, ty, w.join(' ')]);   // eslint-disable-line react-hooks/exhaustive-deps
  const sel = list.find(a => a.id === selId) || null;
  const canEdit = hrCan(user, 'edit'), canDel = hrCan(user, 'delete');
  const empOf = a => emps.find(e => String(e.id) === String(a.employeeId)) || { name: a.empName, empCode: a.empCode };
  const del = async a => {
    setBusy(true);
    try { await axios.delete(`/api/hr/assets/${a.id}`, { params: { companyId } }); setAsk(null); setSelId(null); onChanged(`Deleted ${a.assetName}.`); }
    catch (e) { onChanged(e.response?.data?.error || 'Could not delete.'); } finally { setBusy(false); }
  };
  const upload = async e => {
    const fl = [...(e.target.files || [])]; e.target.value = '';
    if (!fl.length || !sel) return;
    try { await axios.put(`/api/hr/assets/${sel.id}`, toForm({ companyId, agreementSignedOn: sel.agreementSignedOn || today() }, fl, fl.map(f => `Signed agreement — ${f.name}`)), { params: { companyId } }); onChanged(`Signed agreement uploaded for ${sel.assetName}.`); }
    catch { onChanged('Could not upload the file.'); }
  };
  return (
    <>
      {slot && createPortal(<>
        <input className="sb-search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search asset, serial, SIM, employee…" aria-label="Search assets" style={{ width: 190 }} />
        <select className="sb-search" style={{ width: 130 }} value={ty} onChange={e => setTy(e.target.value)} aria-label="Type"><option value="">All types</option>{TYPES.map(t => <option key={t}>{t}</option>)}</select>
        <select className="sb-search" style={{ width: 130 }} value={st} onChange={e => setSt(e.target.value)} aria-label="Status"><option value="">All</option>{Object.entries(ST_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        <button type="button" className="sb-tbtn" onClick={() => printDepList({ title: 'COMPANY ASSET REGISTER', company, user, filter: [ST_LABEL[st], ty].filter(Boolean).join(' · ') || 'All', total: list.reduce((t, a) => t + (Number(a.value) || 0), 0),
          heads: ['Type', 'Asset', 'Serial / IMEI / SIM', 'Employee', 'Issued on', 'Condition', 'Returned on', 'Return condition', 'Value ₹', 'Status'],
          rows: list.map(a => [a.assetType, a.assetName, [a.serialNo, a.simNo, a.mobileNo].filter(Boolean).join(' · '), `${a.empCode || ''} ${a.empName || ''}`.trim(), dmy(a.issuedOn), a.issueCondition, dmy(a.returnedOn), a.returnCondition, amt(a.value), ST_LABEL[a.status] || a.status]) })}><Svg name="file" size={13} />Print register</button>
        <div className="sb-tools">
          <span className="sb-picked">{sel ? <b>{sel.assetName}</b> : 'Select an asset'}</span>
          <button type="button" className="sb-tbtn" disabled={!sel} onClick={() => printAssetAgreement({ assets: [sel], emp: empOf(sel), settings, company, user })}><Svg name="file" size={13} />Agreement</button>
          {canEdit && <label className="sb-tbtn" style={{ cursor: sel ? 'pointer' : 'default', opacity: sel ? 1 : 0.5 }} title="Upload the signed agreement"><Svg name="file" size={13} />Upload signed<input type="file" hidden accept=".pdf,image/*" disabled={!sel} onChange={upload} /></label>}
          {canEdit && <button type="button" className="sb-tbtn" disabled={!sel || sel.status !== 'issued'} onClick={() => onReturn(sel)}><Svg name="refresh" size={13} />Return</button>}
          {canEdit && <button type="button" className="sb-tbtn" disabled={!sel} onClick={() => onEdit(sel)}><Svg name="settings" size={13} />Edit</button>}
          {canDel && <button type="button" className="sb-tbtn del" disabled={!sel} onClick={() => setAsk(sel)}><Svg name="x" size={13} />Delete</button>}
        </div>
      </>, slot)}
      {ask && <div className="sb-ask" role="alertdialog" aria-label="Confirm delete"><span><b>Delete {ask.assetName}</b> (with {ask.empName})? Use “Return” if it came back.</span>
        <button type="button" className="sb-abtn" onClick={() => setAsk(null)} disabled={busy}>Keep</button><button type="button" className="sb-abtn danger" onClick={() => del(ask)} disabled={busy}>{busy ? 'Deleting…' : 'Yes, delete'}</button></div>}
      <div className="ac-sum">
        <div>With employees<b>{all.filter(a => a.status === 'issued').length}</b></div>
        <div>Value with employees<b>₹ {amt(all.filter(a => a.status === 'issued').reduce((t, a) => t + (Number(a.value) || 0), 0))}</b></div>
        <div>SIM cards out<b>{all.filter(a => a.status === 'issued' && a.assetType === 'SIM card').length}</b></div>
        <div>Agreement not uploaded<b style={{ color: '#B42318' }}>{all.filter(a => a.status === 'issued' && !(a.files || []).length).length}</b></div>
        <div>Lost / damaged<b style={{ color: '#B42318' }}>{all.filter(a => ['lost', 'damaged'].includes(a.status)).length}</b></div>
      </div>
      <div className="sb-list">
        <table className="sb-t px acx">
          <colgroup>{[3, 10, 16, 14, 15, 8, 8, 8, 8, 10].map((x, i) => <col key={i} style={{ width: `${x}%` }} />)}</colgroup>
          <thead><tr><th className="r">Sr</th><th>Type</th><th>Asset</th><th>Serial / IMEI / SIM</th><th>Employee</th><th>Issued</th><th>Condition</th><th>Returned</th><th className="r">Value ₹</th><th>Status</th></tr></thead>
          <tbody>
            {rows === null ? <tr><td colSpan={10} className="sb-empty">Loading…</td></tr>
              : !list.length ? <tr><td colSpan={10} className="sb-empty">{q || st || ty ? 'Nothing matches — try “All” in the status filter.' : 'No asset yet — click “Issue Asset”.'}</td></tr>
                : list.map((a, i) => { const [bg, fg] = STATUS_PILL[a.status] || STATUS_PILL.issued; return (
                  <tr key={a.id} className={selId === a.id ? 'sel' : ''} onClick={() => setSelId(a.id)} onDoubleClick={() => canEdit && onEdit(a)} style={{ cursor: 'pointer' }}>
                    <td className="r">{i + 1}</td><td>{a.assetType}</td>
                    <td className="b">{a.assetName}{a.accessories && <span className="sm">With: {a.accessories}</span>}{(a.files || []).length > 0 && <span className="sm" style={{ color: '#067647' }}>✓ signed agreement</span>}</td>
                    <td className="mono">{[a.serialNo, a.simNo && `SIM ${a.simNo}`, a.mobileNo && `No. ${a.mobileNo}`].filter(Boolean).join(' · ') || '—'}</td>
                    <td><b>{a.empName}</b><span className="sm">{a.empCode}</span></td>
                    <td className="d">{dmy(a.issuedOn)}</td><td>{a.issueCondition || '—'}</td>
                    <td className="d">{dmy(a.returnedOn) || '—'}{a.returnCondition && <span className="sm">{a.returnCondition}</span>}</td>
                    <td className="r d">{Number(a.value) ? amt(a.value) : '—'}</td>
                    <td><span className="ac-pill" style={{ background: bg, color: fg }}>{ST_LABEL[a.status] || a.status}</span></td>
                  </tr>); })}
          </tbody>
        </table>
      </div>
    </>
  );
}

function AssetForm({ companyId, edit, returning, emps, onSaved, onCancel }) {
  const e0 = edit || {};
  const [v, setV] = useState(() => ({ assetType: e0.assetType || 'SIM card', assetName: e0.assetName || '', serialNo: e0.serialNo || '', simNo: e0.simNo || '', mobileNo: e0.mobileNo || '',
    value: e0.value ? String(e0.value) : '', accessories: e0.accessories || '', employeeId: e0.employeeId ? String(e0.employeeId) : '', issuedOn: e0.issuedOn || today(), issueCondition: e0.issueCondition || 'New',
    returnedOn: e0.returnedOn || (returning ? today() : ''), returnCondition: e0.returnCondition || (returning ? 'Good' : ''), status: returning ? 'returned' : (e0.status || 'issued'), remarks: e0.remarks || '' }));
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const set = k => e => { const x = e.target.value; setV(o => ({ ...o, [k]: x })); setMsg(null); };
  const empGroups = useMemo(() => [{ group: 'Employees', items: emps.filter(e => e.status !== 'Left' || String(e.id) === v.employeeId).map(e => ({ key: String(e.id), label: `${e.empCode} — ${e.name}`, sub: e.designation || '' })) }], [emps, v.employeeId]);
  const emp = emps.find(e => String(e.id) === v.employeeId);
  const sim = v.assetType === 'SIM card', phone = ['Mobile phone', 'Tablet', 'Data card / router'].includes(v.assetType);
  const save = async () => {
    if (!v.assetName.trim()) return setMsg({ k: 'err', t: 'Enter the asset, e.g. “Jio SIM”, “Dell Latitude 5420”.' });
    if (!v.employeeId) return setMsg({ k: 'err', t: 'Pick the employee.' });
    if (!v.issuedOn) return setMsg({ k: 'err', t: 'Enter the issue date.' });
    if (v.status === 'returned' && !v.returnedOn) return setMsg({ k: 'err', t: 'Enter the return date.' });
    if (v.returnedOn && v.returnedOn < v.issuedOn) return setMsg({ k: 'err', t: 'The return date is before the issue date.' });
    setBusy(true);
    const body = { ...v, companyId, returnedOn: v.status === 'issued' ? '' : v.returnedOn, returnCondition: v.status === 'issued' ? '' : v.returnCondition };
    try {
      const fd = toForm(body, files, files.map(f => f.name));
      if (edit) await axios.put(`/api/hr/assets/${edit.id}`, fd, { params: { companyId } }); else await axios.post('/api/hr/assets', fd, { params: { companyId } });
      onSaved(returning ? `${v.assetName} returned by ${emp?.name || ''}.` : `${edit ? 'Updated' : 'Issued'} ${v.assetName} to ${emp?.name || ''}.${edit ? '' : ' Print the agreement for signature.'}`);
    } catch (e) { setMsg({ k: 'err', t: e.response?.data?.error || 'Could not save.' }); }
    finally { setBusy(false); }
  };
  return (
    <div className="sf">
      <div className="sf-hero"><span className="ic"><Svg name="box" size={15} /></span><h1>{returning ? `Return — ${e0.assetName}` : edit ? `Edit ${e0.assetName}` : 'Issue Company Asset'}</h1><span className="grow" /></div>
      <div className="sf-2" style={{ marginTop: 10 }}>
        <div className="sf-card"><div className="sf-ch"><span className="ico"><Svg name="box" size={13} /></span><b>Asset</b></div>
          <table className="sf-kv"><tbody>
            <tr><th>Type</th><td><select value={v.assetType} onChange={set('assetType')} disabled={returning}>{TYPES.map(t => <option key={t}>{t}</option>)}</select></td></tr>
            <tr><th>Asset / model <i>*</i></th><td><input value={v.assetName} onChange={set('assetName')} placeholder={sim ? 'e.g. Jio postpaid SIM' : 'e.g. Dell Latitude 5420'} disabled={returning} autoFocus={!edit} /></td></tr>
            {sim && <tr><th>SIM no. (ICCID)</th><td><input className="mono" value={v.simNo} onChange={set('simNo')} disabled={returning} /></td></tr>}
            {(sim || phone) && <tr><th>Mobile no.</th><td><input className="mono" value={v.mobileNo} onChange={set('mobileNo')} inputMode="tel" disabled={returning} /></td></tr>}
            {!sim && <tr><th>{phone ? 'IMEI / serial no.' : v.assetType.includes('ehicle') || v.assetType === 'Two-wheeler' ? 'Registration no.' : 'Serial / asset tag'}</th><td><input className="mono" value={v.serialNo} onChange={set('serialNo')} disabled={returning} /></td></tr>}
            <tr><th>Accessories</th><td><input value={v.accessories} onChange={set('accessories')} placeholder="Charger, bag, cover, helmet…" disabled={returning} /></td></tr>
            <tr><th>Value ₹</th><td><input className="num" inputMode="decimal" value={v.value} onChange={e => setV(o => ({ ...o, value: e.target.value.replace(/[^\d.]/g, '') }))} placeholder="Approx. value" disabled={returning} /></td></tr>
          </tbody></table></div>
        <div className="sf-card"><div className="sf-ch"><span className="ico"><Svg name="user" size={13} /></span><b>{returning ? 'Return' : 'Given to'}</b></div>
          <table className="sf-kv"><tbody>
            <tr><th>Employee <i>*</i></th><td>{returning ? <b>{e0.empCode} — {e0.empName}</b> : <Picker value={emp ? `${emp.empCode} — ${emp.name}` : ''} groups={empGroups} placeholder="Type employee code or name…" ariaLabel="Employee" onPick={o => { setV(x => ({ ...x, employeeId: o.key })); setMsg(null); }} />}</td></tr>
            <tr><th>Issued on <i>*</i></th><td><input type="date" value={v.issuedOn} onChange={set('issuedOn')} disabled={returning} /></td></tr>
            <tr><th>Condition at issue</th><td><select value={v.issueCondition} onChange={set('issueCondition')} disabled={returning}>{CONDS.map(c => <option key={c}>{c}</option>)}</select></td></tr>
            {edit && !returning && <tr><th>Status</th><td><select value={v.status} onChange={set('status')}>{Object.entries(ST_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></td></tr>}
            {(returning || v.status !== 'issued') && <>
              <tr><th>{v.status === 'returned' ? 'Returned on' : 'Date'} <i>*</i></th><td><input type="date" value={v.returnedOn} onChange={set('returnedOn')} autoFocus={returning} /></td></tr>
              <tr><th>Condition at return</th><td><select value={v.returnCondition} onChange={set('returnCondition')}><option value="">—</option>{[...CONDS, 'Not working', 'Lost'].map(c => <option key={c}>{c}</option>)}</select></td></tr>
            </>}
            <tr><th>Remarks</th><td><input value={v.remarks} onChange={set('remarks')} placeholder="Plan, recovery, notes…" /></td></tr>
            {!returning && <tr><th>Signed agreement</th><td><label className="sf-lnk" style={{ cursor: 'pointer' }}>+ Attach<input type="file" hidden multiple accept=".pdf,image/*" onChange={e => { const l = [...(e.target.files || [])]; e.target.value = ''; setFiles(x => [...x, ...l]); }} /></label>
              {(e0.files || []).map(x => <div key={x.fileName} style={{ fontSize: 12 }}><button type="button" className="sf-lnk" onClick={() => viewHrFile('assets', e0.id, x, companyId)}>{x.name || x.fileName}</button></div>)}
              {files.map((x, i) => <div key={i} style={{ fontSize: 12, color: '#B54708' }}>{x.name} · uploads on save</div>)}</td></tr>}
          </tbody></table></div>
      </div>
      {msg && <div className={`sf-msg ${msg.k}`} role="status">{msg.t}</div>}
      <div className="sf-bar">
        <div className="info">{v.assetType} · {v.assetName || '—'} · {emp ? emp.name : 'pick the employee'}{Number(v.value) ? ` · ₹ ${amt(v.value)}` : ''}</div>
        <button type="button" className="sf-b ghost" onClick={onCancel} disabled={busy}>Cancel</button>
        <button type="button" className="sf-b pri" onClick={save} disabled={busy}>{busy ? 'Saving…' : returning ? 'Save return' : edit ? 'Update' : 'Issue asset'}</button>
      </div>
    </div>
  );
}
