/* Beta — HR → Policy (/api/hr/settings).
 *  • Company policies — as many as wanted (Leave, Travel, Code of conduct, Mobile & SIM, Safety…): title + points; each can be
 *    printed on its own and/or attached to every Employment agreement as an annexure.
 *  • The terms printed on the Employment agreement and on the Company-asset agreement; the default weekly off. */
import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useCompany } from '../../context/CompanyContext';
import { useAuth } from '../../context/AuthContext';
import { Svg } from '../../components/ui/Icon';
import { CSS as SALES_CSS } from './BetaSales';
import { ACC_CSS } from './BetaAccKit';
import { hrCan, loadSettings } from './BetaHRKit';
import { printPolicy } from './BetaHRPrint';

const WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday + 2nd & 4th Saturday'];
const SAMPLES = [
  ['Leave Policy', 'Casual leave: 7 days a year; sick leave: 7 days a year; earned leave: 15 days a year after one year of service.\nLeave must be applied for in advance and approved by the reporting manager (sick leave: inform on the same day).\nUnapproved absence is treated as leave without pay.\nUnused earned leave may be carried forward up to 30 days; casual and sick leave lapse at the end of the year.'],
  ['Attendance & Working Hours', 'Office hours are as per the employment agreement; a grace of 10 minutes is allowed three times a month.\nLate coming beyond the grace three times in a month counts as half a day.\nAttendance is marked daily; site staff report attendance to the site in-charge.'],
  ['Travel & Site Expense Policy', 'Travel for company work is reimbursed against bills, as approved before travel.\nSite allowance / daily allowance is paid as per the rates fixed by the management.\nClaims must be submitted with bills within 7 days of returning.'],
  ['Mobile, SIM & Laptop Policy', 'Company SIM, mobile and laptop are for official use; the monthly plan is paid by the company.\nPersonal usage above the plan, and loss or damage due to negligence, may be recovered.\nAll devices and data belong to the company and must be returned on leaving.'],
  ['Code of Conduct', 'Treat colleagues, clients and vendors with respect; harassment of any kind is not tolerated.\nDo not accept gifts or favours from vendors or clients.\nFollow safety rules at the factory and sites; wear the safety kit given.\nKeep company information, prices and drawings confidential.'],
];
let nid = 1;

export default function BetaHRPolicy() {
  const { selectedCompany } = useCompany() || {};
  const { user } = useAuth() || {};
  const companyId = selectedCompany?.companyId;
  const [v, setV] = useState(null);
  const [open, setOpen] = useState(null);   // policy id being edited
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [dirty, setDirty] = useState(false);
  const canEdit = hrCan(user, 'edit');
  useEffect(() => { if (companyId) loadSettings(companyId).then(s => setV({ joiningTerms: s.joiningTerms || '', assetTerms: s.assetTerms || '', weeklyOff: s.weeklyOff || 'Sunday', policies: (s.policies || []).map(p => ({ ...p })) })); }, [companyId]);
  if (!hrCan(user, 'view')) return <div className="sb"><style>{SALES_CSS}</style><div className="sb-empty" style={{ padding: 30 }}>You are not authorized to see HR.</div></div>;
  const set = k => e => { const x = e.target.value; setV(o => ({ ...o, [k]: x })); setMsg(null); setDirty(true); };
  const setP = (id, k, x) => { setV(o => ({ ...o, policies: o.policies.map(p => (p.id === id ? { ...p, [k]: x } : p)) })); setDirty(true); setMsg(null); };
  const addPolicy = (title = '', text = '') => { const id = `p${Date.now()}${nid++}`; setV(o => ({ ...o, policies: [...o.policies, { id, title, text, inAgreement: false }] })); setOpen(id); setDirty(true); };
  const remove = p => { if (!window.confirm(`Remove the policy “${p.title || 'untitled'}”?`)) return; setV(o => ({ ...o, policies: o.policies.filter(x => x.id !== p.id) })); setDirty(true); };
  const move = (i, d) => setV(o => { const l = [...o.policies]; const j = i + d; if (j < 0 || j >= l.length) return o; [l[i], l[j]] = [l[j], l[i]]; setDirty(true); return { ...o, policies: l }; });
  const save = async () => {
    if (!v.joiningTerms.trim()) return setMsg({ k: 'err', t: 'The employment agreement terms cannot be empty.' });
    const bad = v.policies.find(p => !p.title.trim() || !p.text.trim());
    if (bad) { setOpen(bad.id); return setMsg({ k: 'err', t: 'Every policy needs a title and at least one point — fill it or remove it.' }); }
    setBusy(true);
    try { await axios.put('/api/hr/settings', { ...v, companyId }, { params: { companyId } }); setDirty(false); setMsg({ k: 'ok', t: `HR policy saved — ${v.policies.length} polic${v.policies.length === 1 ? 'y' : 'ies'}; ${v.policies.filter(p => p.inAgreement).length} attached to every employment agreement.` }); }
    catch (e) { setMsg({ k: 'err', t: e.response?.data?.error || 'Could not save.' }); }
    finally { setBusy(false); }
  };
  const count = t => String(t || '').split(/\r?\n/).filter(x => x.trim()).length;
  const unused = v ? SAMPLES.filter(([t]) => !v.policies.some(p => p.title.toLowerCase() === t.toLowerCase())) : [];
  return (
    <div className="sb">
      <style>{SALES_CSS + ACC_CSS + `.pl-ta { width:100%; min-height:200px; padding:9px 11px; border:1px solid #C9D7DA; border-radius:4px; font:13px/1.55 Inter, Arial, sans-serif; resize:vertical; box-sizing:border-box; }
.pl-row { display:flex; align-items:center; gap:8px; padding:8px 12px; border-top:1px solid #EDF2F3; } .pl-row:first-child { border-top:0; } .pl-row b { flex:1; font-size:13px; }
.pl-row .tag { font-size:11px; font-weight:700; padding:2px 8px; border-radius:99px; } .pl-ed { padding:10px 12px; background:#F9FBFB; border-top:1px solid #EDF2F3; }
.pl-ed input.t { width:100%; height:32px; border:1px solid #C9D7DA; border-radius:4px; padding:0 9px; font:600 13px Inter, Arial, sans-serif; margin-bottom:6px; box-sizing:border-box; }`}</style>
      <div className="sb-tabs" role="tablist"><button type="button" role="tab" aria-selected="true" className="sb-tab on">HR Policy</button>
        <div className="sb-slot" style={{ display: 'flex', alignItems: 'stretch' }}><div className="sb-tools">
          <span className="sb-picked">{dirty ? <b style={{ color: '#B54708' }}>Unsaved changes</b> : 'Saved'}</span>
          {canEdit && <button type="button" className="sb-tbtn" style={{ background: '#03444f', color: '#fff' }} onClick={save} disabled={busy || !dirty || !v}>{busy ? 'Saving…' : 'Save policy'}</button>}
        </div></div></div>
      {msg && <div className={`sf-msg ${msg.k}`} role="status" style={{ margin: 0, borderRadius: 0 }}>{msg.t}</div>}
      <div className="sb-body"><div className="sf">
        {!v ? <div className="sf-empty">Loading…</div> : <>
          <div className="sf-card" style={{ marginTop: 10 }}>
            <div className="sf-ch"><span className="ico"><Svg name="file" size={13} /></span><b>Company policies ({v.policies.length})</b><span className="grow" />
              {canEdit && <button type="button" className="sf-lnk" onClick={() => addPolicy()}>+ Add policy</button>}</div>
            {!v.policies.length && <div className="sf-empty">No policy yet — “+ Add policy”, or start from a sample below.</div>}
            {v.policies.map((p, i) => (
              <React.Fragment key={p.id}>
                <div className="pl-row">
                  <b>{p.title || <i style={{ color: '#98A2B3' }}>Untitled policy</i>} <span style={{ fontWeight: 400, color: '#667085' }}>· {count(p.text)} points</span></b>
                  {canEdit && <label style={{ display: 'flex', gap: 5, alignItems: 'center', fontSize: 12 }} title="Printed as an annexure with every employment agreement"><input type="checkbox" checked={!!p.inAgreement} onChange={e => setP(p.id, 'inAgreement', e.target.checked)} style={{ accentColor: '#03444f' }} />Attach to agreement</label>}
                  {!canEdit && p.inAgreement && <span className="tag" style={{ background: '#ECFDF3', color: '#067647' }}>In agreement</span>}
                  <button type="button" className="sf-lnk" onClick={() => printPolicy({ policy: p, company: selectedCompany, user })} disabled={!p.title}>Print</button>
                  {canEdit && <><button type="button" className="sf-lnk" onClick={() => setOpen(open === p.id ? null : p.id)}>{open === p.id ? 'Close' : 'Edit'}</button>
                    <button type="button" className="sf-lnk" onClick={() => move(i, -1)} disabled={!i} aria-label="Move up">↑</button><button type="button" className="sf-lnk" onClick={() => move(i, 1)} disabled={i === v.policies.length - 1} aria-label="Move down">↓</button>
                    <button type="button" className="sf-lnk" style={{ color: '#B42318' }} onClick={() => remove(p)}>Remove</button></>}
                </div>
                {open === p.id && canEdit && <div className="pl-ed">
                  <input className="t" value={p.title} onChange={e => setP(p.id, 'title', e.target.value)} placeholder="Policy title, e.g. Leave Policy" autoFocus aria-label="Policy title" />
                  <textarea className="pl-ta" value={p.text} onChange={e => setP(p.id, 'text', e.target.value)} placeholder="One point per line" aria-label="Policy points" />
                  <div style={{ fontSize: 11, color: '#667085' }}>One point per line — each line prints as a numbered point.</div></div>}
              </React.Fragment>
            ))}
            {canEdit && unused.length > 0 && <div className="pl-row" style={{ flexWrap: 'wrap', background: '#F9FBFB' }}><span style={{ fontSize: 12, color: '#667085' }}>Start from a sample:</span>
              {unused.map(([t, x]) => <button key={t} type="button" className="sf-lnk" onClick={() => addPolicy(t, x)}>+ {t}</button>)}</div>}
          </div>
          <div className="sf-card"><div className="sf-ch"><span className="ico"><Svg name="clock" size={13} /></span><b>Default weekly off</b></div>
            <table className="sf-kv"><tbody><tr><th>Weekly off</th><td><select value={v.weeklyOff} onChange={set('weeklyOff')} disabled={!canEdit} style={{ maxWidth: 320 }}>{WEEK.map(w => <option key={w}>{w}</option>)}</select>
              <div style={{ fontSize: 11, color: '#667085', marginTop: 3 }}>New employees start with this; each employee can have their own on the Employee form.</div></td></tr></tbody></table></div>
          <div className="sf-2">
            <div className="sf-card"><div className="sf-ch"><span className="ico"><Svg name="user" size={13} /></span><b>Employment agreement — terms &amp; conditions ({count(v.joiningTerms)} points)</b></div>
              <div style={{ padding: 8 }}><textarea className="pl-ta" value={v.joiningTerms} onChange={set('joiningTerms')} disabled={!canEdit} aria-label="Agreement terms" />
                <div style={{ fontSize: 11, color: '#667085' }}>One point per line. Nature of employment, dates, probation / end date, notice, hours and salary come from the employee.</div></div></div>
            <div className="sf-card"><div className="sf-ch"><span className="ico"><Svg name="box" size={13} /></span><b>Company asset agreement — terms of use ({count(v.assetTerms)} points)</b></div>
              <div style={{ padding: 8 }}><textarea className="pl-ta" value={v.assetTerms} onChange={set('assetTerms')} disabled={!canEdit} aria-label="Asset terms" /></div></div>
          </div>
        </>}
      </div></div>
    </div>
  );
}
