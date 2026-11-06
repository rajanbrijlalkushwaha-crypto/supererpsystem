/* Beta — Password Manager. Logins the company uses (e-way bill portal, GST, banks…), stored encrypted on the server.
 * The list never carries passwords: a password is fetched only to show (hides again after 20 s) or copy it.
 * Who can see / add / edit / delete follows the "Password Manager" permission. */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import { useCompany } from '../../context/CompanyContext';
import { useAuth } from '../../context/AuthContext';
import { can } from '../../utils/permissions';
import { Svg } from '../../components/ui/Icon';
import { CSS as SALES_CSS, useClearSel } from './BetaSales';

const TEAL = '#03444f';
const F = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
const CATEGORIES = ['Government', 'Banking', 'Vendor Portal', 'Email', 'ERP / Software', 'Social Media', 'Other'];
const MON3 = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const sdate = d => { if (!d) return '—'; const x = new Date(d); return isNaN(x) ? '—' : `${String(x.getDate()).padStart(2, '0')} ${MON3[x.getMonth()]} ${String(x.getFullYear()).slice(2)}`; };
const dash = v => (v == null || String(v).trim() === '' ? '—' : v);
const hrefOf = u => (!u ? '' : /^https?:\/\//i.test(u) ? u : `https://${u}`);
/* copy that also works on plain http (LAN), where navigator.clipboard is not available */
async function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) { try { await navigator.clipboard.writeText(text); return; } catch { /* fall back */ } }
  const ta = document.createElement('textarea');
  ta.value = text; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
  document.body.appendChild(ta); ta.select();
  const ok = document.execCommand('copy');
  ta.remove();
  if (!ok) throw new Error('copy blocked');
}
const blank = () => ({ siteName: '', url: '', username: '', password: '', category: 'Government', notes: '' });

const COLS = [['Site', '17%'], ['Login URL', '19%'], ['Username', '15%'], ['Password', '15%'], ['Category', '10%'], ['Notes', '14%'], ['Updated', '10%']];

const PM_CSS = `
.pm-cat { display:inline-block; padding:1px 8px; border-radius:99px; font-size:10.5px; font-weight:700; background:#E1EFF0; color:${TEAL}; white-space:nowrap; }
.pm-pw { display:flex; align-items:center; gap:4px; font-family:ui-monospace, Consolas, monospace; font-size:12px; }
.pm-pw span { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.pm-ib { width:24px; height:22px; flex-shrink:0; display:inline-grid; place-items:center; border:1px solid #C9D7DA; border-radius:3px; background:#fff; color:${TEAL}; cursor:pointer; padding:0; }
.pm-ib:hover:not(:disabled) { border-color:${TEAL}; background:${TEAL}; color:#fff; } .pm-ib:disabled { opacity:.4; cursor:default; }
.pm-ok { font-size:10.5px; color:#067647; font-weight:700; font-family:${F}; }
.pm-url { color:${TEAL}; text-decoration:none; } .pm-url:hover { text-decoration:underline; }
.pm-bad { color:#B42318; font-size:11px; font-weight:600; }
.pm-ttl { display:flex; align-items:center; gap:7px; padding:0 14px; border-right:1px solid #B9D0D3; background:#fff; font:700 12.5px ${F}; color:${TEAL}; white-space:nowrap; flex-shrink:0; }
.pm-ttl .ic { width:22px; height:22px; display:grid; place-items:center; background:${TEAL}; color:#fff; border-radius:4px; }
.pm-tbtn.add { background:${TEAL}; color:#fff; } .pm-tbtn.add:hover:not(:disabled) { background:#022f37; }
.pm-note { padding:7px 14px; font-size:11.5px; color:#475467; background:#F7FAFA; border-bottom:1px solid #DCE6E8; flex-shrink:0; }
/* add / edit pop-up */
.pm-back { position:fixed; inset:0; z-index:1600; background:rgba(2,24,28,.45); display:flex; align-items:flex-start; justify-content:center; padding:9vh 16px; font-family:${F}; }
.pm-box { width:100%; max-width:560px; background:#fff; border:1px solid #9DBDC1; box-shadow:0 20px 60px rgba(0,0,0,.35); }
.pm-hd { display:flex; align-items:center; gap:10px; padding:10px 14px; background:linear-gradient(90deg, #1B7682 0%, #3C9AA4 100%); color:#fff; } .pm-hd b { flex:1; font-size:14px; }
.pm-hd button { width:28px; height:28px; border:1px solid rgba(255,255,255,.35); background:rgba(255,255,255,.1); color:#fff; cursor:pointer; font-size:17px; }
.pm-bd { padding:14px; display:grid; grid-template-columns:1fr 1fr; gap:10px 12px; }
.pm-bd label { display:block; font-size:11.5px; font-weight:600; color:#344054; } .pm-bd label i { color:#D92D20; font-style:normal; }
.pm-bd .w2 { grid-column:span 2; }
.pm-bd input, .pm-bd select, .pm-bd textarea { display:block; width:100%; margin-top:4px; height:32px; padding:0 9px; border:1px solid #C9D7DA; border-radius:2px; background:#fff; outline:none; font:400 12.5px ${F}; color:#101828; box-sizing:border-box; }
.pm-bd textarea { height:auto; min-height:60px; padding:6px 9px; resize:vertical; }
.pm-bd input:focus, .pm-bd select:focus, .pm-bd textarea:focus { border-color:${TEAL}; box-shadow:0 0 0 3px rgba(3,68,79,.12); }
.pm-bd .bad { border-color:#D92D20; }
.pm-pwf { display:flex; margin-top:4px; } .pm-pwf input { margin-top:0; border-radius:2px 0 0 2px; font-family:ui-monospace, Consolas, monospace; }
.pm-pwf button { height:32px; padding:0 10px; border:1px solid #C9D7DA; border-left:0; background:#F4F8F8; color:${TEAL}; cursor:pointer; font:600 11.5px ${F}; white-space:nowrap; }
.pm-pwf button:hover { background:#E1EFF0; }
.pm-hint { display:block; margin-top:3px; font-size:10.5px; font-weight:400; color:#667085; }
.pm-ft { display:flex; align-items:center; gap:8px; padding:10px 14px; border-top:1px solid #DCE6E8; background:#F7FAFA; } .pm-ft .msg { flex:1; font-size:12px; color:#B42318; }
.pm-b { height:34px; padding:0 18px; border-radius:2px; cursor:pointer; font:600 12.5px ${F}; border:1px solid #C9D7DA; background:#fff; color:#344054; }
.pm-b.pri { background:${TEAL}; border-color:${TEAL}; color:#fff; } .pm-b:disabled { opacity:.55; cursor:default; }
`;

export default function BetaPasswords() {
  const { selectedCompany } = useCompany() || {};
  const companyId = selectedCompany?.companyId;
  const { user } = useAuth() || {};
  const may = a => can(user, 'passwords', a);

  const [list, setList] = useState(null);
  const [err, setErr] = useState('');
  const [reload, setReload] = useState(0);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [selId, setSelId] = useState(null);
  const [shown, setShown] = useState({});      // id → password being shown
  const [copied, setCopied] = useState(null);  // `${id}:u` | `${id}:p`
  const [form, setForm] = useState(null);      // { entry|null }
  const [askDel, setAskDel] = useState(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(null);
  const [slot, setSlot] = useState(null);
  const timers = useRef({});
  useClearSel(askDel || form ? null : selId, setSelId, '.sb-t tbody.og, .sb-tools, .sb-ask, .pm-back');

  useEffect(() => {
    if (!companyId) return;
    setErr('');
    axios.get('/api/passwords', { params: { companyId, masked: 1 } })
      .then(r => setList(Array.isArray(r.data) ? r.data : []))
      .catch(e => { setList([]); setErr(e.response?.data?.error || 'Could not load the saved logins.'); });
  }, [companyId, reload]);
  useEffect(() => () => Object.values(timers.current).forEach(clearTimeout), []);

  const cats = useMemo(() => [...new Set([...CATEGORIES, ...(list || []).map(e => e.category).filter(Boolean)])], [list]);
  const rows = useMemo(() => {
    const w = q.toLowerCase().split(/\s+/).filter(Boolean);
    return [...(list || [])].filter(e => (!cat || e.category === cat) && (!w.length || w.every(x => `${e.siteName} ${e.url} ${e.username} ${e.category} ${e.notes}`.toLowerCase().includes(x))))
      .sort((a, b) => String(a.siteName || '').localeCompare(String(b.siteName || '')));
  }, [list, q, cat]);
  const sel = rows.find(e => e.id === selId) || null;

  const secret = async e => {
    const r = await axios.get(`/api/passwords/${e.id}/credentials`, { params: { companyId, any: 1 } });
    return r.data?.password || '';
  };
  const toggleShow = async e => {
    if (shown[e.id] != null) { setShown(s => { const n = { ...s }; delete n[e.id]; return n; }); return; }
    try {
      const pw = await secret(e);
      setShown(s => ({ ...s, [e.id]: pw }));
      clearTimeout(timers.current[e.id]);
      timers.current[e.id] = setTimeout(() => setShown(s => { const n = { ...s }; delete n[e.id]; return n; }), 20000);
    } catch (x) { setNote({ ok: false, text: x.response?.data?.error || 'Could not read the password.' }); }
  };
  const copy = async (e, what) => {
    try {
      const text = what === 'u' ? e.username || '' : await secret(e);
      await copyText(text);
      setCopied(`${e.id}:${what}`); setTimeout(() => setCopied(c => (c === `${e.id}:${what}` ? null : c)), 1500);
    } catch (x) { setNote({ ok: false, text: x.response?.data?.error || 'Could not copy — the browser blocked the clipboard.' }); }
  };
  const doDelete = async e => {
    setBusy(true);
    try { await axios.delete(`/api/passwords/${e.id}`, { params: { companyId } }); setAskDel(null); setSelId(null); setNote({ ok: true, text: `Deleted the login for ${e.siteName}.` }); setReload(x => x + 1); }
    catch (x) { setNote({ ok: false, text: x.response?.data?.error || 'Could not delete.' }); }
    finally { setBusy(false); }
  };

  return (
    <div className="sb">
      <style>{SALES_CSS + PM_CSS}</style>
      <div className="sb-tabs">
        <span className="pm-ttl"><span className="ic"><Svg name="lock" size={13} /></span>Password Manager</span>
        <div className="sb-slot" ref={setSlot} />
      </div>
      {slot && createPortal(<>
        <select className="sb-search" style={{ width: 160, cursor: 'pointer' }} value={cat} onChange={e => setCat(e.target.value)} aria-label="Category">
          <option value="">All categories</option>{cats.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <input className="sb-search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search site, URL, username…" aria-label="Search logins" />
        <div className="sb-tools">
          <span className="sb-picked">{sel ? <>Selected: <b>{sel.siteName}</b></> : 'Click a login to select'}</span>
          <button type="button" className="sb-tbtn" disabled={!sel || !sel.url} onClick={() => window.open(hrefOf(sel.url), '_blank', 'noopener')}><Svg name="globe" size={13} />Open site</button>
          <button type="button" className="sb-tbtn" disabled={!sel || !may('edit')} onClick={() => setForm({ entry: sel })}><Svg name="settings" size={13} />Edit</button>
          <button type="button" className="sb-tbtn del" disabled={!sel || !may('delete')} onClick={() => setAskDel(sel)}><Svg name="x" size={13} />Delete</button>
          <button type="button" className="sb-tbtn pm-tbtn add" disabled={!may('create')} onClick={() => setForm({ entry: null })}><Svg name="plus" size={13} />Add login</button>
        </div>
      </>, slot)}

      <div className="pm-note">Passwords are stored encrypted on the server. They are fetched only when you show or copy one, and hide again after 20 seconds.</div>
      {askDel && (
        <div className="sb-ask" role="alertdialog" aria-label="Confirm delete">
          <span><b>Delete the login for {askDel.siteName}</b> ({askDel.username})? This cannot be undone.</span>
          <button type="button" className="sb-abtn" onClick={() => setAskDel(null)} disabled={busy}>Keep</button>
          <button type="button" className="sb-abtn danger" onClick={() => doDelete(askDel)} disabled={busy}>{busy ? 'Deleting…' : 'Yes, delete'}</button>
        </div>
      )}
      {note && <div className="sb-note" role="status" style={note.ok ? undefined : { background: '#FDECEC', color: '#B42318', borderColor: '#F5C2C0' }}>{note.text}<button type="button" onClick={() => setNote(null)} aria-label="Dismiss" style={note.ok ? undefined : { color: '#B42318' }}>×</button></div>}
      {err && <div className="sb-note" style={{ background: '#FDECEC', color: '#B42318', borderColor: '#F5C2C0' }}>{err}</div>}

      <div className="sb-list">
        <table className="sb-t">
          <colgroup>{COLS.map(([h, w]) => <col key={h} style={{ width: w }} />)}</colgroup>
          <thead><tr>{COLS.map(([h]) => <th key={h}>{h}</th>)}</tr></thead>
          {list === null ? <tbody><tr><td colSpan={7} className="sb-empty">Loading…</td></tr></tbody>
            : !rows.length ? <tbody><tr><td colSpan={7} className="sb-empty">{q || cat ? 'No login matches.' : 'No logins saved yet — click “Add login”.'}</td></tr></tbody>
              : rows.map(e => (
                <tbody key={e.id} className={`og${selId === e.id ? ' sel' : ''}`} onClick={() => setSelId(e.id)} onDoubleClick={() => { if (may('edit')) setForm({ entry: e }); }}
                  title="Click to select · double-click to edit" aria-selected={selId === e.id}>
                  <tr>
                    <td className="cl">{e.siteName}</td>
                    <td>{e.url ? <a className="pm-url" href={hrefOf(e.url)} target="_blank" rel="noopener noreferrer" onClick={x => x.stopPropagation()}>{e.url}</a> : <span className="mut">—</span>}</td>
                    <td><div className="pm-pw"><span>{dash(e.username)}</span>
                      {e.username && <button type="button" className="pm-ib" title="Copy username" aria-label={`Copy username for ${e.siteName}`} onClick={x => { x.stopPropagation(); copy(e, 'u'); }}>{copied === `${e.id}:u` ? <span className="pm-ok">✓</span> : <Svg name="file" size={11} />}</button>}</div></td>
                    <td>{e.unreadable ? <span className="pm-bad">Cannot be read — key changed</span> : (
                      <div className="pm-pw"><span>{shown[e.id] != null ? shown[e.id] : e.hasPassword ? '••••••••' : '—'}</span>
                        <button type="button" className="pm-ib" disabled={!e.hasPassword} title={shown[e.id] != null ? 'Hide' : 'Show for 20 seconds'} aria-label={`${shown[e.id] != null ? 'Hide' : 'Show'} password for ${e.siteName}`} onClick={x => { x.stopPropagation(); toggleShow(e); }}><Svg name={shown[e.id] != null ? 'eyeOff' : 'eye'} size={12} /></button>
                        <button type="button" className="pm-ib" disabled={!e.hasPassword} title="Copy password" aria-label={`Copy password for ${e.siteName}`} onClick={x => { x.stopPropagation(); copy(e, 'p'); }}>{copied === `${e.id}:p` ? <span className="pm-ok">✓</span> : <Svg name="file" size={11} />}</button>
                      </div>)}</td>
                    <td>{e.category ? <span className="pm-cat">{e.category}</span> : <span className="mut">—</span>}</td>
                    <td>{dash(e.notes)}</td>
                    <td className="nw" title={e.updatedBy?.name ? `by ${e.updatedBy.name}` : e.createdBy?.name ? `by ${e.createdBy.name}` : ''}>{sdate(e.updatedAt || e.createdAt)}</td>
                  </tr>
                </tbody>
              ))}
        </table>
      </div>

      {form && <LoginForm entry={form.entry} companyId={companyId} cats={cats} onClose={() => setForm(null)}
        onSaved={(e, isNew) => { setForm(null); setReload(x => x + 1); setSelId(e.id); setNote({ ok: true, text: `${isNew ? 'Saved' : 'Updated'} the login for ${e.siteName}.` }); }} />}
    </div>
  );
}

function LoginForm({ entry, companyId, cats, onClose, onSaved }) {
  const [v, setV] = useState(() => (entry ? { ...blank(), ...entry, password: '' } : blank()));
  const [see, setSee] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [tried, setTried] = useState(false);
  const first = useRef(null);
  useEffect(() => { first.current?.focus(); }, []);
  const set = k => e => setV(x => ({ ...x, [k]: e.target.value }));
  const needPw = !entry || !entry.hasPassword;
  const gen = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789@#$%&*';
    const a = new Uint32Array(14); window.crypto.getRandomValues(a);
    setV(x => ({ ...x, password: [...a].map(n => chars[n % chars.length]).join('') })); setSee(true);
  };
  const save = async () => {
    setTried(true); setMsg('');
    if (!v.siteName.trim() || !v.username.trim() || (needPw && !v.password)) { setMsg('Fill the fields marked *.'); return; }
    setBusy(true);
    try {
      const body = { siteName: v.siteName.trim(), url: v.url.trim(), username: v.username.trim(), category: v.category, notes: v.notes.trim(), companyId };
      if (v.password) body.password = v.password;   // blank on edit = keep the saved password
      const r = entry
        ? await axios.put(`/api/passwords/${entry.id}`, body, { params: { companyId } })
        : await axios.post('/api/passwords', body, { params: { companyId } });
      onSaved(r.data || { ...body, id: entry?.id }, !entry);
    } catch (x) { setMsg(x.response?.data?.error || 'Could not save.'); }
    finally { setBusy(false); }
  };
  return (
    <div className="pm-back" onMouseDown={e => { if (e.target === e.currentTarget && !busy) onClose(); }} onKeyDown={e => { if (e.key === 'Escape' && !busy) onClose(); }}>
      <div className="pm-box" role="dialog" aria-modal="true" aria-label={entry ? 'Edit login' : 'Add login'}>
        <div className="pm-hd"><Svg name="lock" size={15} /><b>{entry ? `Edit login — ${entry.siteName}` : 'Add login'}</b><button type="button" onClick={onClose} aria-label="Close" disabled={busy}>×</button></div>
        <div className="pm-bd">
          <label>Site / service <i>*</i><input ref={first} value={v.siteName} onChange={set('siteName')} placeholder="e.g. E-Way Bill Portal" className={tried && !v.siteName.trim() ? 'bad' : ''} /></label>
          <label>Category<select value={v.category} onChange={set('category')}>{cats.map(c => <option key={c} value={c}>{c}</option>)}</select></label>
          <label className="w2">Login URL<input value={v.url} onChange={set('url')} placeholder="e.g. https://ewaybillgst.gov.in" /></label>
          <label>Username <i>*</i><input value={v.username} onChange={set('username')} autoComplete="off" className={tried && !v.username.trim() ? 'bad' : ''} /></label>
          <label>Password {needPw && <i>*</i>}
            <div className="pm-pwf">
              <input type={see ? 'text' : 'password'} value={v.password} onChange={set('password')} autoComplete="new-password" placeholder={needPw ? '' : 'Leave blank to keep the saved one'} className={tried && needPw && !v.password ? 'bad' : ''} />
              <button type="button" onClick={() => setSee(s => !s)}>{see ? 'Hide' : 'Show'}</button>
              <button type="button" onClick={gen} title="Make a strong random password">Generate</button>
            </div>
            {!needPw && <span className="pm-hint">The saved password stays unless you type a new one.</span>}
          </label>
          <label className="w2">Notes<textarea value={v.notes} onChange={set('notes')} placeholder="Optional — e.g. which GSTIN, who uses it" /></label>
        </div>
        <div className="pm-ft"><span className="msg">{msg}</span>
          <button type="button" className="pm-b" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="button" className="pm-b pri" onClick={save} disabled={busy}>{busy ? 'Saving…' : entry ? 'Update' : 'Save'}</button>
        </div>
      </div>
    </div>
  );
}
