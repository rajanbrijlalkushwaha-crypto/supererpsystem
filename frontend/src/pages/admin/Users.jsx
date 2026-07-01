import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';
import { MODULES, GROUP_ORDER } from '../../utils/permissions';

const F  = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const P  = '#133d80';
const BD = '#E5EAF2';

const inp = (err=false) => ({
  width:'100%', height:36, padding:'0 10px', fontSize:12.5, fontFamily:F,
  border:`1px solid ${err?'#ef4444':BD}`, borderRadius:6,
  outline:'none', boxSizing:'border-box', background:err?'#fff5f5':'#fff',
});

const ROLES = ['user','manager','accountant','sales','purchase','viewer'];
const ALL_ACTIONS = ['view','create','edit','delete','approve'];

/* ── Permission Matrix ── */
function PermMatrix({ perms, onChange }) {
  const toggle = (mk, action) => {
    const next = { ...perms, [mk]: { ...(perms[mk]||{}), [action]: !(perms[mk]?.[action]) } };
    onChange(next);
  };
  const toggleRow = (mk, actions) => {
    const allOn = actions.every(a => perms[mk]?.[a]);
    const next  = { ...perms, [mk]: {} };
    actions.forEach(a => next[mk][a] = !allOn);
    onChange(next);
  };
  const toggleAll = () => {
    const allOn = MODULES.every(m => m.actions.every(a => perms[m.key]?.[a]));
    const next  = {};
    MODULES.forEach(m => { next[m.key] = {}; m.actions.forEach(a => next[m.key][a] = !allOn); });
    onChange(next);
  };
  const allGranted = MODULES.every(m => m.actions.every(a => perms[m.key]?.[a]));

  const grouped = GROUP_ORDER.map(g => ({
    group: g, mods: MODULES.filter(m => m.group === g),
  })).filter(g => g.mods.length > 0);

  return (
    <div style={{ overflowX:'auto' }}>
      <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11.5, fontFamily:F }}>
        <thead>
          <tr style={{ background:'#f1f5f9' }}>
            <th style={{ padding:'8px 12px', textAlign:'left', border:`1px solid ${BD}`, fontSize:11, fontWeight:700, color:'#374151' }}>Module</th>
            <th style={{ padding:'8px', textAlign:'center', border:`1px solid ${BD}`, width:50, fontSize:11 }}>
              <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:2 }}>
                <span style={{ fontSize:10, color:'#6b7280' }}>All</span>
                <input type="checkbox" checked={allGranted} onChange={toggleAll} style={{ cursor:'pointer', width:14, height:14 }}/>
              </div>
            </th>
            {ALL_ACTIONS.map(a => (
              <th key={a} style={{ padding:'8px', textAlign:'center', border:`1px solid ${BD}`, width:70, fontSize:11, fontWeight:700, color:'#374151', textTransform:'capitalize' }}>{a}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {grouped.map(({ group, mods }) => (
            <React.Fragment key={group}>
              <tr>
                <td colSpan={2 + ALL_ACTIONS.length} style={{ padding:'6px 12px', background:'#f0f4fb', borderBottom:`1px solid ${BD}`, borderTop:`1px solid ${BD}`, fontSize:10.5, fontWeight:800, color:P, letterSpacing:0.5, textTransform:'uppercase' }}>
                  {group}
                </td>
              </tr>
              {mods.map((mod, i) => {
                const rowPerms = perms[mod.key] || {};
                const allOn    = mod.actions.every(a => rowPerms[a]);
                return (
                  <tr key={mod.key} style={{ background: i%2===0?'#fff':'#fafbff' }}
                    onMouseEnter={e=>e.currentTarget.style.background='#eff6ff'}
                    onMouseLeave={e=>e.currentTarget.style.background=i%2===0?'#fff':'#fafbff'}>
                    <td style={{ padding:'7px 12px', border:`1px solid ${BD}`, fontWeight:500, color:'#1f2937', fontSize:12, paddingLeft:20 }}>{mod.label}</td>
                    <td style={{ padding:'7px', textAlign:'center', border:`1px solid ${BD}` }}>
                      <input type="checkbox" checked={allOn} onChange={()=>toggleRow(mod.key, mod.actions)} style={{ cursor:'pointer', width:14, height:14 }}/>
                    </td>
                    {ALL_ACTIONS.map(action => (
                      <td key={action} style={{ padding:'7px', textAlign:'center', border:`1px solid ${BD}` }}>
                        {mod.actions.includes(action) ? (
                          <input type="checkbox" checked={!!rowPerms[action]} onChange={()=>toggle(mod.key, action)}
                            style={{ cursor:'pointer', width:14, height:14, accentColor:P }}/>
                        ) : (
                          <span style={{ color:'#d1d5db', fontSize:11 }}>—</span>
                        )}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </React.Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ── Invite Link Modal ── */
function InviteModal({ data, onClose }) {
  const [copied, setCopied] = useState(false);
  const copy = () => { navigator.clipboard.writeText(data.inviteUrl); setCopied(true); setTimeout(()=>setCopied(false),2000); };
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
      <div style={{ background:'#fff', borderRadius:14, width:'100%', maxWidth:500, overflow:'hidden', boxShadow:'0 20px 60px rgba(0,0,0,0.25)', fontFamily:F }}>
        <div style={{ background:data.emailSent?'#f0fdf4':'#fffbeb', padding:'16px 20px', borderBottom:`1px solid ${BD}`, display:'flex', gap:10, alignItems:'center' }}>
          <span style={{ fontSize:22 }}>{data.emailSent?'✅':'⚠️'}</span>
          <div>
            <div style={{ fontWeight:800, fontSize:14, color:data.emailSent?'#15803d':'#92400e' }}>
              {data.emailSent ? 'Invite Email Sent!' : 'User Created — Email Not Sent'}
            </div>
            <div style={{ fontSize:12, color:'#6b7280', marginTop:1 }}>
              {data.emailSent ? `Invitation sent to ${data.user.email}` : 'Email not configured. Share this link manually.'}
            </div>
          </div>
        </div>
        <div style={{ padding:20 }}>
          <div style={{ marginBottom:14, background:'#f8faff', border:`1px solid ${BD}`, borderRadius:8, padding:'12px 14px', fontSize:12.5 }}>
            <div style={{ marginBottom:4 }}><strong>Username:</strong> <span style={{ fontFamily:'monospace', color:P }}>{data.username}</span></div>
            <div><strong>Email:</strong> {data.user.email}</div>
          </div>
          <div style={{ marginBottom:6, fontSize:11.5, fontWeight:600, color:'#374151' }}>Invite Link (expires in 7 days):</div>
          <div style={{ display:'flex', gap:8 }}>
            <input readOnly value={data.inviteUrl} style={{ ...inp(), fontFamily:'monospace', fontSize:10.5, color:'#374151', flex:1 }}/>
            <button onClick={copy} style={{ padding:'0 14px', background:copied?'#f0fdf4':P, border:'none', borderRadius:6, color:copied?'#15803d':'#fff', fontSize:11.5, fontWeight:700, cursor:'pointer', whiteSpace:'nowrap', fontFamily:F }}>
              {copied?'Copied!':'Copy'}
            </button>
          </div>
          {data.emailError && (
            <div style={{ marginTop:10, fontSize:11, color:'#dc2626', background:'#fef2f2', border:'1px solid #fecaca', borderRadius:6, padding:'8px 10px' }}>
              Email error: {data.emailError}
            </div>
          )}
          <div style={{ display:'flex', justifyContent:'flex-end', marginTop:16 }}>
            <button onClick={onClose} style={{ height:34, padding:'0 20px', background:P, border:'none', borderRadius:7, color:'#fff', fontSize:12.5, fontWeight:700, cursor:'pointer', fontFamily:F }}>Done</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════ */
export default function AdminUsers() {
  const { user: me } = useAuth();

  const [users,   setUsers]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg,     setMsg]     = useState({ text:'', ok:true });
  const [search,  setSearch]  = useState('');
  const [showForm,setShowForm]= useState(false);
  const [editUser,setEditUser]= useState(null);     // null=create, obj=edit
  const [saving,  setSaving]  = useState(false);
  const [delConf, setDelConf] = useState(null);
  const [inviteResult, setInviteResult] = useState(null);

  /* Form state */
  const [firstName,  setFirstName]  = useState('');
  const [middleName, setMiddleName] = useState('');
  const [lastName,   setLastName]   = useState('');
  const [email,      setEmail]      = useState('');
  const [phone,      setPhone]      = useState('');
  const [role,       setRole]       = useState('user');
  const [designation,setDesignation]= useState('');
  const [department, setDepartment] = useState('');
  const [active,     setActive]     = useState(true);
  const [perms,      setPerms]      = useState({});

  /* Pwd form (change password) */
  const [showPwdForm,setShowPwdForm]= useState(false);
  const [pwdUserId,  setPwdUserId]  = useState(null);
  const [newPwd,     setNewPwd]     = useState('');
  const [confPwd,    setConfPwd]    = useState('');

  const fetchUsers = useCallback(() => {
    setLoading(true);
    axios.get('/api/auth/users').then(r => setUsers(r.data||[])).catch(()=>{}).finally(()=>setLoading(false));
  }, []);

  useEffect(()=>{ fetchUsers(); }, [fetchUsers]);

  const showMsg = (text, ok=true) => { setMsg({text,ok}); setTimeout(()=>setMsg({text:'',ok:true}), 4000); };

  const openCreate = () => {
    setEditUser(null);
    setFirstName(''); setMiddleName(''); setLastName('');
    setEmail(''); setPhone(''); setRole('user');
    setDesignation(''); setDepartment(''); setActive(true); setPerms({});
    setShowForm(true);
  };

  const openEdit = (u) => {
    setEditUser(u);
    setFirstName(u.firstName||''); setMiddleName(u.middleName||'');
    setLastName(u.lastName||''); setEmail(u.email||''); setPhone(u.phone||'');
    setRole(u.role||'user'); setDesignation(u.designation||'');
    setDepartment(u.department||''); setActive(u.active!==false);
    setPerms(u.permissions||{});
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!firstName.trim() || !lastName.trim()) { showMsg('First and last name are required.', false); return; }
    if (!editUser && !email.trim()) { showMsg('Email is required to send invite.', false); return; }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showMsg('Invalid email address.', false); return; }

    setSaving(true);
    try {
      if (editUser) {
        await axios.put(`/api/auth/users/${editUser.id}`, {
          firstName: firstName.trim(), middleName: middleName.trim(), lastName: lastName.trim(),
          email: email.trim(), phone: phone.trim(), role, designation, department, active, permissions: perms,
        });
        showMsg(`User "${firstName} ${lastName}" updated.`, true);
        fetchUsers();
        setShowForm(false);
      } else {
        const r = await axios.post('/api/auth/users/invite', {
          firstName: firstName.trim(), middleName: middleName.trim(), lastName: lastName.trim(),
          email: email.trim(), phone: phone.trim(), role, designation, department, permissions: perms,
        });
        fetchUsers();
        setShowForm(false);
        setInviteResult(r.data);
      }
    } catch(e) {
      showMsg(e.response?.data?.error || e.message, false);
    } finally { setSaving(false); }
  };

  const handleDelete = async (userId) => {
    try {
      await axios.delete(`/api/auth/users/${userId}`);
      showMsg('User deleted.', true); fetchUsers();
    } catch(e) { showMsg(e.response?.data?.error || e.message, false); }
    finally { setDelConf(null); }
  };

  const handleChangePwd = async () => {
    if (newPwd.length < 6) { showMsg('Password must be at least 6 characters.', false); return; }
    if (newPwd !== confPwd) { showMsg('Passwords do not match.', false); return; }
    try {
      await axios.put(`/api/auth/users/${pwdUserId}/password`, { password: newPwd });
      showMsg('Password changed.', true); setShowPwdForm(false); setNewPwd(''); setConfPwd('');
    } catch(e) { showMsg(e.response?.data?.error || e.message, false); }
  };

  const resendInvite = async (u) => {
    try {
      const r = await axios.post(`/api/auth/users/${u.id}/resend-invite`);
      setInviteResult(r.data);
    } catch(e) { showMsg(e.response?.data?.error || e.message, false); }
  };

  const filtered = users.filter(u => {
    const q = search.toLowerCase();
    return !q || (u.name||'').toLowerCase().includes(q) || (u.username||'').toLowerCase().includes(q)
      || (u.email||'').toLowerCase().includes(q) || (u.role||'').toLowerCase().includes(q);
  });

  const statusBadge = (u) => {
    if (u.status==='pending' || u.active===false) return { label:'Pending', bg:'#fef3c7', color:'#92400e', border:'#fde68a' };
    return { label:'Active', bg:'#dcfce7', color:'#15803d', border:'#bbf7d0' };
  };

  const roleBadge = (role) => {
    const map = {
      admin: '#1d4ed8', manager: '#7c3aed', accountant: '#b45309',
      sales: '#0891b2', purchase: '#ea580c', user: '#374151', viewer: '#6b7280',
    };
    return map[role] || '#374151';
  };

  const grantedCount = (u) => {
    if (!u.permissions || u.permissions == null) return 'Full';
    return Object.values(u.permissions).reduce((s, p) => s + Object.values(p).filter(Boolean).length, 0);
  };

  return (
    <div style={{ fontFamily:F, padding:'0 0 40px' }}>

      {/* Flash message */}
      {msg.text && (
        <div style={{ background:msg.ok?'#f0fdf4':'#fef2f2', border:`1px solid ${msg.ok?'#bbf7d0':'#fecaca'}`,
          borderLeft:`4px solid ${msg.ok?'#16a34a':'#dc2626'}`, borderRadius:8, padding:'10px 14px',
          marginBottom:14, fontSize:12.5, color:msg.ok?'#15803d':'#dc2626', fontFamily:F }}>
          {msg.text}
        </div>
      )}

      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
        <div>
          <div style={{ fontSize:17, fontWeight:800, color:'#111827' }}>User Management</div>
          <div style={{ fontSize:12, color:'#6b7280', marginTop:2 }}>Create users and set their menu access permissions</div>
        </div>
        <button onClick={openCreate}
          style={{ height:36, padding:'0 18px', background:P, border:'none', borderRadius:7, color:'#fff', fontSize:12.5, fontWeight:700, cursor:'pointer', fontFamily:F }}>
          + Invite User
        </button>
      </div>

      {/* Stats */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10, marginBottom:14 }}>
        {[
          ['Total',    users.length,                           '#dbeafe','#1d4ed8'],
          ['Active',   users.filter(u=>u.active!==false&&u.status!=='pending').length, '#dcfce7','#15803d'],
          ['Pending',  users.filter(u=>u.status==='pending'||u.active===false).length,'#fef3c7','#92400e'],
          ['Admins',   users.filter(u=>u.role==='admin').length, '#f3e8ff','#7c3aed'],
        ].map(([l,v,bg,c]) => (
          <div key={l} style={{ background:bg, border:`1px solid ${c}22`, borderRadius:8, padding:'10px 14px' }}>
            <div style={{ fontSize:10, fontWeight:700, color:c, textTransform:'uppercase', letterSpacing:0.5 }}>{l}</div>
            <div style={{ fontSize:22, fontWeight:900, color:c, lineHeight:1.3 }}>{v}</div>
          </div>
        ))}
      </div>

      {/* Search */}
      <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search name, username, email…"
        style={{ ...inp(), height:34, marginBottom:12, width:'100%', boxSizing:'border-box' }}/>

      {/* Table */}
      <div style={{ background:'#fff', border:`1px solid ${BD}`, borderRadius:10, overflow:'hidden' }}>
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11.5, fontFamily:F }}>
          <thead>
            <tr style={{ background:'#f8faff', borderBottom:`2px solid ${BD}` }}>
              {['#','Name','Username','Email / Phone','Role','Status','Permissions',''].map((h,i)=>(
                <th key={i} style={{ padding:'9px 10px', textAlign:'left', fontSize:10.5, fontWeight:700, color:'#374151', borderBottom:`1px solid ${BD}` }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} style={{ padding:32, textAlign:'center', color:'#9ca3af' }}>Loading…</td></tr>
            ) : filtered.length===0 ? (
              <tr><td colSpan={8} style={{ padding:32, textAlign:'center', color:'#9ca3af' }}>No users found.</td></tr>
            ) : filtered.map((u,i) => {
              const st = statusBadge(u);
              const rc = roleBadge(u.role);
              return (
                <tr key={u.id} style={{ borderBottom:`1px solid ${BD}`, background:i%2===0?'#fff':'#fafbff' }}>
                  <td style={{ padding:'8px 10px', color:'#9ca3af', fontSize:11 }}>{i+1}</td>
                  <td style={{ padding:'8px 10px' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <div style={{ width:30, height:30, borderRadius:'50%', background:`linear-gradient(135deg,${P},#2563eb)`,
                        display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontSize:11, fontWeight:700, flexShrink:0 }}>
                        {((u.firstName||u.name||'U')[0]).toUpperCase()}
                      </div>
                      <div>
                        <div style={{ fontWeight:700, color:'#111827', fontSize:12 }}>{u.name}</div>
                        {u.designation && <div style={{ fontSize:10.5, color:'#9ca3af' }}>{u.designation}</div>}
                        {u.id===me?.id && <span style={{ fontSize:9.5, background:'#dbeafe', color:'#1d4ed8', borderRadius:4, padding:'0 5px', fontWeight:700 }}>YOU</span>}
                      </div>
                    </div>
                  </td>
                  <td style={{ padding:'8px 10px', fontFamily:'monospace', fontSize:11.5, color:'#374151' }}>@{u.username}</td>
                  <td style={{ padding:'8px 10px', color:'#374151', fontSize:11.5 }}>
                    <div>{u.email||'—'}</div>
                    {u.phone && <div style={{ fontSize:10.5, color:'#9ca3af' }}>{u.phone}</div>}
                  </td>
                  <td style={{ padding:'8px 10px' }}>
                    <span style={{ background:`${rc}15`, color:rc, border:`1px solid ${rc}33`,
                      borderRadius:5, padding:'2px 8px', fontSize:10.5, fontWeight:700, textTransform:'capitalize' }}>{u.role}</span>
                  </td>
                  <td style={{ padding:'8px 10px' }}>
                    <span style={{ background:st.bg, color:st.color, border:`1px solid ${st.border}`,
                      borderRadius:5, padding:'2px 8px', fontSize:10.5, fontWeight:700 }}>{st.label}</span>
                  </td>
                  <td style={{ padding:'8px 10px', color:'#6b7280', fontSize:11 }}>
                    {u.role==='admin' ? (
                      <span style={{ color:'#15803d', fontWeight:600 }}>Full Access</span>
                    ) : (
                      <span>{grantedCount(u)} {typeof grantedCount(u)==='number' ? 'granted' : ''}</span>
                    )}
                  </td>
                  <td style={{ padding:'8px 10px' }}>
                    <div style={{ display:'flex', gap:5, flexWrap:'wrap' }}>
                      <button onClick={()=>openEdit(u)}
                        style={{ padding:'3px 10px', background:'#eff6ff', border:`1px solid #bfdbfe`, borderRadius:5, color:P, fontSize:11, fontWeight:600, cursor:'pointer', fontFamily:F }}>
                        Edit
                      </button>
                      {(u.status==='pending'||u.active===false) && u.email && (
                        <button onClick={()=>resendInvite(u)}
                          style={{ padding:'3px 10px', background:'#fef3c7', border:'1px solid #fde68a', borderRadius:5, color:'#92400e', fontSize:11, fontWeight:600, cursor:'pointer', fontFamily:F }}>
                          Resend
                        </button>
                      )}
                      {u.active!==false && u.status!=='pending' && (
                        <button onClick={()=>{ setPwdUserId(u.id); setNewPwd(''); setConfPwd(''); setShowPwdForm(true); }}
                          style={{ padding:'3px 10px', background:'#f3e8ff', border:'1px solid #ddd6fe', borderRadius:5, color:'#7c3aed', fontSize:11, fontWeight:600, cursor:'pointer', fontFamily:F }}>
                          Pwd
                        </button>
                      )}
                      {me?.role==='admin' && u.id!==me?.id && (
                        delConf===u.id ? (
                          <div style={{ display:'flex', gap:4 }}>
                            <button onClick={()=>handleDelete(u.id)} style={{ padding:'3px 8px', background:'#fef2f2', border:'1px solid #fecaca', borderRadius:5, color:'#dc2626', fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:F }}>✓</button>
                            <button onClick={()=>setDelConf(null)} style={{ padding:'3px 8px', background:'#f9fafb', border:`1px solid ${BD}`, borderRadius:5, color:'#6b7280', fontSize:11, cursor:'pointer', fontFamily:F }}>✕</button>
                          </div>
                        ) : (
                          <button onClick={()=>setDelConf(u.id)} style={{ padding:'3px 10px', background:'#fef2f2', border:'1px solid #fecaca', borderRadius:5, color:'#dc2626', fontSize:11, fontWeight:600, cursor:'pointer', fontFamily:F }}>Del</button>
                        )
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ══ Create / Edit User Modal ══ */}
      {showForm && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', zIndex:1000, display:'flex', alignItems:'flex-start', justifyContent:'center', padding:'16px', overflowY:'auto' }}>
          <div style={{ background:'#fff', borderRadius:14, width:'100%', maxWidth:860, boxShadow:'0 20px 60px rgba(0,0,0,0.25)', fontFamily:F, marginTop:10, marginBottom:10 }}>

            {/* Modal header */}
            <div style={{ background:P, padding:'14px 20px', borderRadius:'14px 14px 0 0', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div>
                <div style={{ fontSize:15, fontWeight:800, color:'#fff' }}>{editUser ? 'Edit User' : 'Invite New User'}</div>
                <div style={{ fontSize:11, color:'rgba(255,255,255,0.7)', marginTop:1 }}>
                  {editUser ? `Editing: ${editUser.name}` : 'Fill in details and set permissions — an invite link will be sent by email'}
                </div>
              </div>
              <button onClick={()=>setShowForm(false)}
                style={{ background:'rgba(255,255,255,0.15)', border:'none', borderRadius:7, color:'#fff', width:28, height:28, cursor:'pointer', fontSize:16 }}>✕</button>
            </div>

            <div style={{ padding:20 }}>

              {/* Basic info section */}
              <div style={{ marginBottom:16 }}>
                <div style={{ fontSize:11, fontWeight:700, color:P, textTransform:'uppercase', letterSpacing:0.6, marginBottom:10, paddingBottom:6, borderBottom:`1px solid ${BD}` }}>
                  Basic Information
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10, marginBottom:10 }}>
                  <div>
                    <label style={{ fontSize:11, fontWeight:600, color:'#374151', display:'block', marginBottom:4 }}>First Name *</label>
                    <input value={firstName} onChange={e=>setFirstName(e.target.value)} placeholder="First" style={inp(!firstName.trim()&&saving)}/>
                  </div>
                  <div>
                    <label style={{ fontSize:11, fontWeight:600, color:'#374151', display:'block', marginBottom:4 }}>Middle Name</label>
                    <input value={middleName} onChange={e=>setMiddleName(e.target.value)} placeholder="Middle (optional)" style={inp()}/>
                  </div>
                  <div>
                    <label style={{ fontSize:11, fontWeight:600, color:'#374151', display:'block', marginBottom:4 }}>Last Name *</label>
                    <input value={lastName} onChange={e=>setLastName(e.target.value)} placeholder="Last" style={inp(!lastName.trim()&&saving)}/>
                  </div>
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr', gap:10 }}>
                  <div style={{ gridColumn:'span 2' }}>
                    <label style={{ fontSize:11, fontWeight:600, color:'#374151', display:'block', marginBottom:4 }}>Email Address {!editUser&&'*'}</label>
                    <input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="user@company.com"
                      style={inp()} disabled={!!editUser} title={editUser?'Email cannot be changed after creation':''}/>
                    {editUser && <div style={{ fontSize:10, color:'#9ca3af', marginTop:2 }}>Email cannot be changed</div>}
                  </div>
                  <div>
                    <label style={{ fontSize:11, fontWeight:600, color:'#374151', display:'block', marginBottom:4 }}>Phone</label>
                    <input value={phone} onChange={e=>setPhone(e.target.value.replace(/\D/g,''))} placeholder="Mobile no." maxLength={10} style={inp()}/>
                  </div>
                  <div>
                    <label style={{ fontSize:11, fontWeight:600, color:'#374151', display:'block', marginBottom:4 }}>Role</label>
                    <select value={role} onChange={e=>setRole(e.target.value)} style={{ ...inp(), cursor:'pointer' }}>
                      {ROLES.map(r=><option key={r} value={r}>{r.charAt(0).toUpperCase()+r.slice(1)}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize:11, fontWeight:600, color:'#374151', display:'block', marginBottom:4 }}>Designation</label>
                    <input value={designation} onChange={e=>setDesignation(e.target.value)} placeholder="e.g. Sr. Accountant" style={inp()}/>
                  </div>
                  <div>
                    <label style={{ fontSize:11, fontWeight:600, color:'#374151', display:'block', marginBottom:4 }}>Department</label>
                    <input value={department} onChange={e=>setDepartment(e.target.value)} placeholder="e.g. Finance" style={inp()}/>
                  </div>
                  {editUser && (
                    <div style={{ display:'flex', alignItems:'center', gap:8, paddingTop:18 }}>
                      <input type="checkbox" id="actv" checked={active} onChange={e=>setActive(e.target.checked)} style={{ width:14, height:14, cursor:'pointer' }}/>
                      <label htmlFor="actv" style={{ fontSize:12, color:'#374151', cursor:'pointer', userSelect:'none' }}>Active</label>
                    </div>
                  )}
                </div>
              </div>

              {/* Permission matrix */}
              <div>
                <div style={{ fontSize:11, fontWeight:700, color:P, textTransform:'uppercase', letterSpacing:0.6, marginBottom:8, paddingBottom:6, borderBottom:`1px solid ${BD}`, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <span>Menu Access Permissions</span>
                  <div style={{ display:'flex', gap:8 }}>
                    <button onClick={()=>{ const n={}; MODULES.forEach(m=>{n[m.key]={};m.actions.forEach(a=>n[m.key][a]=true);}); setPerms(n); }}
                      style={{ padding:'2px 10px', background:'#f0fdf4', border:'1px solid #bbf7d0', borderRadius:5, color:'#15803d', fontSize:11, fontWeight:600, cursor:'pointer', fontFamily:F }}>
                      Grant All
                    </button>
                    <button onClick={()=>setPerms({})}
                      style={{ padding:'2px 10px', background:'#fef2f2', border:'1px solid #fecaca', borderRadius:5, color:'#dc2626', fontSize:11, fontWeight:600, cursor:'pointer', fontFamily:F }}>
                      Clear All
                    </button>
                  </div>
                </div>
                {role==='admin' ? (
                  <div style={{ background:'#eff6ff', border:'1px solid #bfdbfe', borderRadius:8, padding:'12px 16px', fontSize:12.5, color:'#1d4ed8', display:'flex', gap:10, alignItems:'center' }}>
                    <span style={{ fontSize:18 }}>ℹ️</span>
                    Admin role always has full access to all menus — permission matrix is not applied.
                  </div>
                ) : (
                  <PermMatrix perms={perms} onChange={setPerms}/>
                )}
              </div>

              {/* Footer */}
              <div style={{ display:'flex', gap:10, justifyContent:'flex-end', marginTop:18, paddingTop:16, borderTop:`1px solid ${BD}` }}>
                <button onClick={()=>setShowForm(false)}
                  style={{ height:34, padding:'0 18px', background:'#fff', border:`1px solid ${BD}`, borderRadius:7, fontSize:12.5, cursor:'pointer', fontFamily:F }}>Cancel</button>
                <button onClick={handleSave} disabled={saving}
                  style={{ height:34, padding:'0 24px', background:P, border:'none', borderRadius:7, color:'#fff', fontSize:12.5, fontWeight:700, cursor:saving?'not-allowed':'pointer', fontFamily:F }}>
                  {saving ? 'Saving…' : editUser ? 'Save Changes' : 'Send Invite'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══ Change Password Modal ══ */}
      {showPwdForm && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
          <div style={{ background:'#fff', borderRadius:12, width:380, boxShadow:'0 20px 60px rgba(0,0,0,0.25)', fontFamily:F, overflow:'hidden' }}>
            <div style={{ background:P, padding:'12px 18px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div style={{ fontSize:14, fontWeight:800, color:'#fff' }}>Change Password</div>
              <button onClick={()=>setShowPwdForm(false)} style={{ background:'rgba(255,255,255,0.15)', border:'none', borderRadius:6, color:'#fff', width:26, height:26, cursor:'pointer', fontSize:16 }}>✕</button>
            </div>
            <div style={{ padding:18, display:'flex', flexDirection:'column', gap:12 }}>
              <div>
                <label style={{ fontSize:11, fontWeight:600, color:'#374151', display:'block', marginBottom:4 }}>New Password</label>
                <input type="password" value={newPwd} onChange={e=>setNewPwd(e.target.value)} placeholder="Min. 6 characters" style={inp()}/>
              </div>
              <div>
                <label style={{ fontSize:11, fontWeight:600, color:'#374151', display:'block', marginBottom:4 }}>Confirm Password</label>
                <input type="password" value={confPwd} onChange={e=>setConfPwd(e.target.value)} placeholder="Re-enter password" style={inp()}/>
              </div>
              <div style={{ display:'flex', gap:8, justifyContent:'flex-end', paddingTop:4 }}>
                <button onClick={()=>setShowPwdForm(false)} style={{ height:32, padding:'0 14px', background:'#fff', border:`1px solid ${BD}`, borderRadius:6, fontSize:12, cursor:'pointer', fontFamily:F }}>Cancel</button>
                <button onClick={handleChangePwd} style={{ height:32, padding:'0 18px', background:P, border:'none', borderRadius:6, color:'#fff', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:F }}>Update</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══ Invite result modal ══ */}
      {inviteResult && <InviteModal data={inviteResult} onClose={()=>setInviteResult(null)}/>}
    </div>
  );
}
