import { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { useCompany } from '../../context/CompanyContext';

const F = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const P = '#104f4f';

const CATEGORIES = ['Banking', 'Government', 'Vendor Portal', 'Email', 'ERP / Software', 'Social Media', 'Other'];
const CAT_COLOR  = {
  'Banking':        '#1565C0',
  'Government':     '#2E7D32',
  'Vendor Portal':  '#6A1B9A',
  'Email':          '#E65100',
  'ERP / Software': '#00838F',
  'Social Media':   '#AD1457',
  'Other':          '#546E7A',
};

const BROWSERS = [
  { id: 'same',    label: 'This Browser', icon: '🌐' },
  { id: 'chrome',  label: 'Chrome',       icon: '🟡' },
  { id: 'edge',    label: 'Edge',         icon: '🔵' },
  { id: 'firefox', label: 'Firefox',      icon: '🟠' },
];

const Lbl = ({ children }) => (
  <div style={{ fontSize:10.5, fontWeight:600, color:'#374151', marginBottom:3, fontFamily:F }}>{children}</div>
);
const Inp = ({ style, ...p }) => (
  <input style={{ width:'100%', height:32, padding:'0 9px', border:'1px solid #d1d5db',
    borderRadius:5, fontSize:12, fontFamily:F, outline:'none', boxSizing:'border-box', ...style }} {...p} />
);

export default function PasswordManager() {
  const { selectedCompany } = useCompany();
  const cid = selectedCompany?.companyId;

  const [entries,   setEntries]   = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [search,    setSearch]    = useState('');
  const [modal,     setModal]     = useState(null);
  const [showPwd,   setShowPwd]   = useState({});
  const [copied,    setCopied]    = useState({});
  const [launching, setLaunching] = useState({});
  const [launchMsg, setLaunchMsg] = useState({});
  const [quickFill, setQuickFill] = useState(null);
  const [saving,    setSaving]    = useState(false);
  const [form,      setForm]      = useState(blank());

  /* browser preference — persisted to localStorage */
  const [browser, setBrowser] = useState(() => localStorage.getItem('pm_browser') || 'same');
  const selectBrowser = (b) => { setBrowser(b); localStorage.setItem('pm_browser', b); };

  const countdownRef = useRef(null);

  function blank() {
    return { siteName:'', url:'', username:'', password:'', category:'Other', notes:'' };
  }
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const load = useCallback(async () => {
    if (!cid) return;
    setLoading(true);
    try { setEntries((await axios.get(`/api/passwords?companyId=${cid}`)).data || []); }
    catch { setEntries([]); }
    setLoading(false);
  }, [cid]);

  useEffect(() => { load(); }, [load]);

  /* clear countdown on unmount */
  useEffect(() => () => { if (countdownRef.current) clearInterval(countdownRef.current); }, []);

  const copy = async (text, key) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(c => ({ ...c, [key]: true }));
      setTimeout(() => setCopied(c => ({ ...c, [key]: false })), 2000);
    } catch {}
  };

  const openAdd  = () => { setForm(blank()); setModal({ mode:'add' }); };
  const openEdit = e  => {
    setForm({ siteName:e.siteName||'', url:e.url||'', username:e.username||'',
              password:e.password||'', category:e.category||'Other', notes:e.notes||'' });
    setModal({ mode:'edit', entry:e });
  };

  const save = async () => {
    if (!form.siteName || !form.username || !form.password) return;
    setSaving(true);
    try {
      if (modal.mode === 'add')
        await axios.post(`/api/passwords?companyId=${cid}`, form);
      else
        await axios.put(`/api/passwords/${modal.entry.id}?companyId=${cid}`, form);
      setModal(null); load();
    } catch {}
    setSaving(false);
  };

  const del = async (id) => {
    if (!window.confirm('Delete this saved login?')) return;
    await axios.delete(`/api/passwords/${id}?companyId=${cid}`);
    load();
  };

  /* ── Auto-launch with browser selection + auto-copy sequence ── */
  const handleLaunch = async (e) => {
    if (!e.url) {
      alert('No login URL saved for this entry. Please edit and add the URL first.');
      return;
    }
    if (countdownRef.current) clearInterval(countdownRef.current);

    setLaunching(s => ({ ...s, [e.id]: 'launching' }));
    setLaunchMsg(s => ({ ...s, [e.id]: 'Opening…' }));
    try {
      const r = await axios.get(`/api/passwords/${e.id}/credentials?companyId=${cid}`);
      const { url, username, password, siteName } = r.data;

      /* open in chosen browser */
      if (browser === 'same') {
        window.open(url, '_blank', 'noopener');
      } else {
        await axios.post('/api/passwords/launch-browser', { url, browser });
      }

      /* Step 1 — copy username immediately */
      try { await navigator.clipboard.writeText(username); } catch {}

      const DELAY = 6; // seconds before auto-copying password
      setQuickFill({ siteName, url, username, password, step: 1, countdown: DELAY });
      setLaunching(s => ({ ...s, [e.id]: 'done' }));
      setLaunchMsg(s => ({ ...s, [e.id]: '✅ Opened — username copied, paste it now!' }));
      setTimeout(() => setLaunching(s => ({ ...s, [e.id]: 'idle' })), 5000);

      /* Countdown then auto-copy password */
      let count = DELAY;
      countdownRef.current = setInterval(async () => {
        count--;
        setQuickFill(qf => qf ? { ...qf, countdown: count } : null);
        if (count <= 0) {
          clearInterval(countdownRef.current);
          try { await navigator.clipboard.writeText(password); } catch {}
          setQuickFill(qf => qf ? { ...qf, step: 2, countdown: 0 } : null);
        }
      }, 1000);

    } catch (err) {
      setLaunching(s => ({ ...s, [e.id]: 'error' }));
      setLaunchMsg(s => ({ ...s, [e.id]: err.response?.data?.error || err.message }));
      setTimeout(() => setLaunching(s => ({ ...s, [e.id]: 'idle' })), 6000);
    }
  };

  const filtered = entries.filter(e => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (e.siteName||'').toLowerCase().includes(q) ||
           (e.username||'').toLowerCase().includes(q) ||
           (e.url||'').toLowerCase().includes(q) ||
           (e.category||'').toLowerCase().includes(q);
  });

  if (!cid) return null;

  const td = (al='left', ex={}) => ({
    padding:'10px 12px', fontSize:11, fontFamily:F,
    borderBottom:'1px solid #e5e7eb', textAlign:al,
    verticalAlign:'middle', ...ex,
  });

  const launchBtnStyle = (id) => {
    const state = launching[id] || 'idle';
    const bg = state==='launching' ? '#6b7280'
             : state==='done'      ? '#16a34a'
             : state==='error'     ? '#dc2626'
             : P;
    return {
      height:28, padding:'0 14px', background:bg, border:'none',
      color:'#fff', borderRadius:5, cursor: state==='launching'?'not-allowed':'pointer',
      fontSize:11, fontWeight:700, fontFamily:F,
      boxShadow:'0 1px 4px rgba(0,0,0,0.2)', whiteSpace:'nowrap',
    };
  };

  const launchBtnLabel = (id) => {
    const state = launching[id] || 'idle';
    if (state === 'launching') return '⏳ Opening…';
    if (state === 'done')      return '✅ Opened';
    if (state === 'error')     return '❌ Error';
    return '🚀 Auto Login';
  };

  return (
    <div style={{ fontFamily:F, padding:10, fontSize:12, maxWidth:1200, margin:'0 auto' }}>

      {/* ── Quick Fill floating card ── */}
      {quickFill && (
        <div style={{
          position:'fixed', bottom:24, right:24, zIndex:9999,
          background:'#1E293B', borderRadius:10, padding:'14px 18px',
          boxShadow:'0 8px 32px rgba(0,0,0,0.45)',
          minWidth:300, maxWidth:360, fontFamily:F,
          border:'2px solid #2563EB',
        }}>
          {/* Header */}
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}}>
            <span style={{fontSize:13,fontWeight:700,color:'#fff'}}>🔑 Quick Fill — {quickFill.siteName}</span>
            <button onClick={()=>{ if (countdownRef.current) clearInterval(countdownRef.current); setQuickFill(null); }}
              style={{background:'none',border:'none',color:'#94A3B8',fontSize:16,cursor:'pointer',lineHeight:1,padding:0}}>✕</button>
          </div>

          {/* Step indicator */}
          <div style={{display:'flex',gap:6,marginBottom:12}}>
            {[
              { n:1, label:'Paste Username', done: quickFill.step >= 1 },
              { n:2, label:'Paste Password', done: quickFill.step >= 2 },
            ].map(s => (
              <div key={s.n} style={{flex:1,padding:'6px 8px',borderRadius:6,textAlign:'center',
                background: s.done ? '#104f4f' : '#334155',
                border: `1px solid ${s.done ? '#22c55e' : '#475569'}`,
                fontSize:10,fontWeight:700,color: s.done ? '#86efac' : '#94A3B8',
                display:'flex',alignItems:'center',justifyContent:'center',gap:4}}>
                {s.done ? '✓' : s.n}  {s.label}
              </div>
            ))}
          </div>

          {/* Current instruction */}
          {quickFill.step === 1 && (
            <div style={{background:'#0F172A',borderRadius:6,padding:'8px 12px',marginBottom:10}}>
              <div style={{fontSize:11,fontWeight:700,color:'#38BDF8',marginBottom:4}}>
                Step 1: Username copied to clipboard
              </div>
              <div style={{fontSize:11,color:'#E2E8F0'}}>
                Switch to the new tab → click the Username field → press <kbd style={{background:'#1E293B',color:'#93C5FD',padding:'1px 5px',borderRadius:3,fontFamily:'monospace',border:'1px solid #475569'}}>Ctrl+V</kbd>
              </div>
              {quickFill.countdown > 0 && (
                <div style={{marginTop:6,fontSize:10,color:'#94A3B8'}}>
                  Password auto-copies in <span style={{color:'#FCD34D',fontWeight:700}}>{quickFill.countdown}s</span>…
                </div>
              )}
            </div>
          )}
          {quickFill.step === 2 && (
            <div style={{background:'#0F172A',borderRadius:6,padding:'8px 12px',marginBottom:10}}>
              <div style={{fontSize:11,fontWeight:700,color:'#4ADE80',marginBottom:4}}>
                Step 2: Password copied to clipboard!
              </div>
              <div style={{fontSize:11,color:'#E2E8F0'}}>
                Click the Password field → press <kbd style={{background:'#1E293B',color:'#93C5FD',padding:'1px 5px',borderRadius:3,fontFamily:'monospace',border:'1px solid #475569'}}>Ctrl+V</kbd> → Submit
              </div>
            </div>
          )}

          {/* Manual copy buttons */}
          {[
            {label:'Username', value:quickFill.username, key:'qf-user'},
            {label:'Password', value:quickFill.password, key:'qf-pass', secret:true},
          ].map(({label,value,key,secret})=>(
            <div key={key} style={{marginBottom:6}}>
              <div style={{fontSize:9.5,color:'#64748B',marginBottom:3}}>{label}</div>
              <div style={{display:'flex',gap:6,alignItems:'center'}}>
                <div style={{flex:1,background:'#0F172A',border:'1px solid #334155',borderRadius:5,
                  padding:'4px 8px',fontSize:11.5,color:'#E2E8F0',fontFamily:'monospace',
                  overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',
                  letterSpacing:secret&&!showPwd[key]?'0.2em':'normal'}}>
                  {secret&&!showPwd[key]?'••••••••':value}
                </div>
                {secret&&(
                  <button onClick={()=>setShowPwd(s=>({...s,[key]:!s[key]}))}
                    style={{background:'#334155',border:'none',color:'#94A3B8',borderRadius:4,
                      padding:'4px 7px',cursor:'pointer',fontSize:11}}>
                    {showPwd[key]?'🙈':'👁'}
                  </button>
                )}
                <button onClick={()=>copy(value,key)}
                  style={{background:copied[key]?'#16A34A':'#2563EB',border:'none',color:'#fff',
                    borderRadius:4,padding:'4px 10px',cursor:'pointer',fontSize:11,fontWeight:700,
                    whiteSpace:'nowrap'}}>
                  {copied[key]?'✓':'Copy'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Header */}
      <div style={{ background:'linear-gradient(135deg,#104f4f,#2563eb)', color:'#fff',
        padding:'10px 16px', borderRadius:'8px 8px 0 0',
        display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:8 }}>
        <div>
          <div style={{ fontSize:9, color:'rgba(255,255,255,0.55)', textTransform:'uppercase', letterSpacing:'1px' }}>
            Auto-copies credentials · Step-by-step fill guide
          </div>
          <div style={{ fontSize:16, fontWeight:800, marginTop:1 }}>🔐 Password Manager</div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
          {/* Browser selector */}
          <div style={{ display:'flex', alignItems:'center', gap:4, background:'rgba(0,0,0,0.2)',
            borderRadius:6, padding:'3px 4px' }}>
            <span style={{ fontSize:9, color:'rgba(255,255,255,0.6)', marginRight:2, whiteSpace:'nowrap' }}>Open in:</span>
            {BROWSERS.map(b => (
              <button key={b.id} onClick={() => selectBrowser(b.id)}
                title={b.label}
                style={{
                  height:24, padding:'0 8px', borderRadius:4, border:'none', cursor:'pointer',
                  fontSize:10, fontWeight:700, fontFamily:F, whiteSpace:'nowrap',
                  background: browser === b.id ? '#fff' : 'transparent',
                  color: browser === b.id ? '#104f4f' : 'rgba(255,255,255,0.75)',
                  transition:'all 0.15s',
                }}>
                {b.icon} {b.label}
              </button>
            ))}
          </div>
          <button onClick={openAdd}
            style={{ height:30, padding:'0 14px', background:'rgba(255,255,255,0.18)',
              border:'1px solid rgba(255,255,255,0.4)', color:'#fff', borderRadius:6,
              cursor:'pointer', fontSize:12, fontWeight:700, fontFamily:F }}>
            + Add Login
          </button>
        </div>
      </div>

      {/* How it works strip */}
      <div style={{ background:'#f0fdf4', border:'1px solid #bbf7d0', borderTop:'none',
        padding:'8px 16px', display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
        <span style={{ fontSize:11, color:'#14532d', fontWeight:700, whiteSpace:'nowrap' }}>⚡ How it works:</span>
        <span style={{ fontSize:10.5, color:'#104f4f', lineHeight:1.6 }}>
          Click <strong>🚀 Auto Login</strong> → browser opens &amp; <strong>username is auto-copied</strong>.
          Switch to the tab → paste (<kbd style={{fontFamily:'monospace',background:'#bbf7d0',padding:'0 3px',borderRadius:2}}>Ctrl+V</kbd>) in Username field.
          &nbsp;After <strong>6 seconds</strong>, password is <strong>auto-copied</strong> — paste it in the Password field &amp; login.
        </span>
      </div>

      {/* Search / toolbar */}
      <div style={{ background:'#fff', border:'1px solid #e5e7eb', borderTop:'none',
        padding:'8px 12px', display:'flex', gap:8, alignItems:'center' }}>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search site, username, URL, category…"
          style={{ height:28, padding:'0 8px', border:'1px solid #d1d5db', borderRadius:5,
            fontSize:11, fontFamily:F, outline:'none', width:280 }} />
        {search && (
          <button onClick={() => setSearch('')}
            style={{ height:28, padding:'0 8px', background:'#f5f5f5', border:'1px solid #d1d5db',
              borderRadius:5, cursor:'pointer', fontSize:11 }}>✕</button>
        )}
        <span style={{ fontSize:10, color:'#6b7280' }}>
          {filtered.length} saved login{filtered.length !== 1 ? 's' : ''}
        </span>
        <span style={{ marginLeft:'auto', fontSize:9.5, color:'#d97706', fontWeight:600 }}>
          ⚠️ Passwords stored unencrypted — keep this device secured
        </span>
      </div>

      {/* Table */}
      <div style={{ border:'1px solid #e5e7eb', borderTop:'none', borderRadius:'0 0 8px 8px', overflow:'auto' }}>
        {loading ? (
          <div style={{ padding:40, textAlign:'center', color:'#888' }}>Loading…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding:50, textAlign:'center', color:'#aaa', fontStyle:'italic' }}>
            {entries.length === 0
              ? 'No saved logins yet — click "+ Add Login" to get started.'
              : 'No results for your search.'}
          </div>
        ) : (
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
            <thead>
              <tr style={{ background:'#f0f4fb' }}>
                {['#', 'Site / URL', 'Username', 'Password', 'Category', 'Notes', 'Actions'].map((h, i) => (
                  <th key={h} style={{ padding:'6px 12px', textAlign: i===0?'center':'left', fontSize:9,
                    fontWeight:700, color:'#374151', borderBottom:'1px solid #d1d5db',
                    textTransform:'uppercase', letterSpacing:'0.4px', whiteSpace:'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((e, i) => {
                const catCol  = CAT_COLOR[e.category] || '#546E7A';
                const rowBg   = i % 2 === 0 ? '#fff' : '#f9fbff';
                const state   = launching[e.id] || 'idle';

                return (
                  <tr key={e.id} style={{ background:rowBg }}>
                    <td style={{ ...td('center'), width:32, color:'#aaa' }}>{i+1}</td>

                    {/* Site + URL */}
                    <td style={td()}>
                      <div style={{ fontWeight:700, color:'#1f2937', fontSize:12 }}>{e.siteName || '—'}</div>
                      {e.url && (
                        <div style={{ fontSize:9.5, color:'#6b7280', marginTop:1,
                          maxWidth:220, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                          🔗 {e.url}
                        </div>
                      )}
                    </td>

                    {/* Username */}
                    <td style={td()}>
                      <div style={{ display:'flex', alignItems:'center', gap:5 }}>
                        <span style={{ fontFamily:'monospace', fontSize:11 }}>{e.username || '—'}</span>
                        <button onClick={() => copy(e.username, `u${e.id}`)}
                          style={{ height:20, padding:'0 6px', fontSize:9, fontWeight:700,
                            background:copied[`u${e.id}`]?'#16a34a':'#f0f4ff',
                            border:`1px solid ${copied[`u${e.id}`]?'#16a34a':'#c8d8f0'}`,
                            color:copied[`u${e.id}`]?'#fff':P,
                            borderRadius:3, cursor:'pointer', fontFamily:F, whiteSpace:'nowrap' }}>
                          {copied[`u${e.id}`] ? '✓' : 'Copy'}
                        </button>
                      </div>
                    </td>

                    {/* Password */}
                    <td style={td()}>
                      <div style={{ display:'flex', alignItems:'center', gap:5 }}>
                        <span style={{ fontFamily:'monospace', fontSize:11,
                          letterSpacing: showPwd[e.id] ? '0.04em' : '3px',
                          minWidth:70, display:'inline-block' }}>
                          {showPwd[e.id] ? e.password : '••••••••'}
                        </span>
                        <button onClick={() => setShowPwd(s => ({ ...s, [e.id]: !s[e.id] }))}
                          style={{ height:20, padding:'0 5px', fontSize:10, background:'#f0f4ff',
                            border:'1px solid #c8d8f0', color:'#555', borderRadius:3,
                            cursor:'pointer', fontFamily:F }}>
                          {showPwd[e.id] ? '🙈' : '👁'}
                        </button>
                        <button onClick={() => copy(e.password, `p${e.id}`)}
                          style={{ height:20, padding:'0 6px', fontSize:9, fontWeight:700,
                            background:copied[`p${e.id}`]?'#16a34a':'#f0f4ff',
                            border:`1px solid ${copied[`p${e.id}`]?'#16a34a':'#c8d8f0'}`,
                            color:copied[`p${e.id}`]?'#fff':P,
                            borderRadius:3, cursor:'pointer', fontFamily:F, whiteSpace:'nowrap' }}>
                          {copied[`p${e.id}`] ? '✓' : 'Copy'}
                        </button>
                      </div>
                    </td>

                    {/* Category */}
                    <td style={td()}>
                      {e.category && (
                        <span style={{ fontSize:9.5, fontWeight:700, padding:'2px 8px', borderRadius:10,
                          background:`${catCol}18`, color:catCol, whiteSpace:'nowrap' }}>
                          {e.category}
                        </span>
                      )}
                    </td>

                    {/* Notes */}
                    <td style={{ ...td(), color:'#6b7280', maxWidth:160,
                      overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                      {e.notes || '—'}
                    </td>

                    {/* Actions */}
                    <td style={{ ...td(), whiteSpace:'nowrap' }}>
                      <div style={{ display:'flex', gap:5, alignItems:'center', flexWrap:'wrap' }}>
                        <div>
                          <button onClick={() => handleLaunch(e)}
                            disabled={state === 'launching'}
                            style={launchBtnStyle(e.id)}>
                            {launchBtnLabel(e.id)}
                          </button>
                          {state !== 'idle' && launchMsg[e.id] && (
                            <div style={{ fontSize:9, marginTop:2,
                              color: state==='error' ? '#dc2626' : state==='done' ? '#16a34a' : '#6b7280',
                              maxWidth:160, whiteSpace:'normal', lineHeight:1.3 }}>
                              {launchMsg[e.id]}
                            </div>
                          )}
                        </div>
                        <button onClick={() => openEdit(e)}
                          style={{ height:28, padding:'0 9px', background:'#f9fafb',
                            border:'1px solid #d1d5db', color:'#374151', borderRadius:5,
                            cursor:'pointer', fontSize:11, fontFamily:F }}>✎</button>
                        <button onClick={() => del(e.id)}
                          style={{ height:28, padding:'0 9px', background:'#fff3f3',
                            border:'1px solid #ffb3b3', color:'#cc0000', borderRadius:5,
                            cursor:'pointer', fontSize:11, fontFamily:F }}>🗑</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Add / Edit Modal */}
      {modal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', zIndex:1000,
          display:'flex', alignItems:'center', justifyContent:'center', padding:12 }}
          onClick={e => { if (e.target === e.currentTarget) setModal(null); }}>
          <div style={{ background:'#fff', borderRadius:10, width:500, maxWidth:'96vw',
            fontFamily:F, boxShadow:'0 24px 80px rgba(0,0,0,0.3)', overflow:'hidden' }}>

            <div style={{ background:'linear-gradient(135deg,#104f4f,#2563eb)', color:'#fff',
              padding:'11px 16px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div style={{ fontWeight:800, fontSize:13 }}>
                {modal.mode === 'add' ? '+ Add New Login' : '✎ Edit Saved Login'}
              </div>
              <button onClick={() => setModal(null)}
                style={{ background:'rgba(255,255,255,0.15)', border:'none', color:'#fff',
                  fontSize:16, cursor:'pointer', width:28, height:28, borderRadius:5,
                  display:'flex', alignItems:'center', justifyContent:'center' }}>✕</button>
            </div>

            <div style={{ padding:'18px 20px' }}>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12 }}>
                <div>
                  <Lbl>Site / App Name *</Lbl>
                  <Inp value={form.siteName} onChange={e=>set('siteName',e.target.value)}
                    placeholder="e.g. GST Portal, Bank Login" />
                </div>
                <div>
                  <Lbl>Category</Lbl>
                  <select value={form.category} onChange={e=>set('category',e.target.value)}
                    style={{ width:'100%', height:32, padding:'0 8px', border:'1px solid #d1d5db',
                      borderRadius:5, fontSize:11, fontFamily:F, outline:'none', background:'#fff' }}>
                    {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ marginBottom:12 }}>
                <Lbl>Login URL</Lbl>
                <Inp value={form.url} onChange={e=>set('url',e.target.value)}
                  placeholder="e.g. https://gst.gov.in/login" />
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12 }}>
                <div>
                  <Lbl>Username / Mobile / Email *</Lbl>
                  <Inp value={form.username} onChange={e=>set('username',e.target.value)}
                    placeholder="username or email" autoComplete="off" />
                </div>
                <div>
                  <Lbl>Password *</Lbl>
                  <Inp value={form.password} onChange={e=>set('password',e.target.value)}
                    placeholder="password" autoComplete="off" type="text"
                    style={{ fontFamily:'monospace' }} />
                </div>
              </div>
              <div style={{ marginBottom:16 }}>
                <Lbl>Notes (optional)</Lbl>
                <Inp value={form.notes} onChange={e=>set('notes',e.target.value)}
                  placeholder="e.g. admin account, shared, 2FA enabled" />
              </div>

              <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
                <button onClick={() => setModal(null)}
                  style={{ height:30, padding:'0 16px', background:'#f5f5f5', border:'1px solid #d1d5db',
                    color:'#374151', borderRadius:5, cursor:'pointer', fontSize:11, fontWeight:600, fontFamily:F }}>
                  Cancel
                </button>
                <button onClick={save}
                  disabled={saving || !form.siteName || !form.username || !form.password}
                  style={{ height:30, padding:'0 20px', border:'none', borderRadius:5,
                    background: saving||!form.siteName||!form.username||!form.password ? '#9ca3af' : P,
                    color:'#fff', cursor: saving||!form.siteName||!form.username||!form.password ? 'not-allowed' : 'pointer',
                    fontSize:11, fontWeight:700, fontFamily:F }}>
                  {saving ? 'Saving…' : modal.mode === 'add' ? '✔ Save Login' : '✔ Update'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
