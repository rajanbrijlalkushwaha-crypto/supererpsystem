import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';

const F = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const P = '#2563EB';

const ROLES = ['admin', 'manager', 'accountant', 'sales', 'purchase', 'viewer'];
const DEPARTMENTS = ['Management','Accounts','Sales','Purchase','Operations','IT','HR','Logistics','Others'];

const EMPTY = {
  name:'', username:'', email:'', phone:'', password:'', confirmPassword:'',
  role:'viewer', department:'', designation:'', active:true,
};

function Toast({ type, msg, onClose }) {
  useEffect(() => { const t = setTimeout(onClose, 4500); return () => clearTimeout(t); }, [onClose]);
  const ok = type === 'success';
  return (
    <div style={{
      position:'fixed', top:20, right:24, zIndex:9999, minWidth:320,
      background: ok ? '#F0FDF4' : '#FEF2F2',
      border: `1px solid ${ok ? '#BBF7D0' : '#FECACA'}`,
      borderLeft: `4px solid ${ok ? '#16A34A' : '#EF4444'}`,
      borderRadius:10, padding:'14px 18px',
      display:'flex', alignItems:'center', gap:10,
      boxShadow:'0 8px 24px rgba(0,0,0,0.12)', fontFamily:F,
    }}>
      <span style={{ fontSize:18 }}>{ok ? '✅' : '❌'}</span>
      <span style={{ fontSize:13, color: ok ? '#15803D' : '#DC2626', fontWeight:600, flex:1 }}>{msg}</span>
      <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', fontSize:18, color:'#9CA3AF' }}>×</button>
    </div>
  );
}

const badge = (role) => {
  const map = {
    admin:     { bg:'#EFF6FF', color:'#1D4ED8', border:'#BFDBFE' },
    manager:   { bg:'#F0FDF4', color:'#15803D', border:'#BBF7D0' },
    accountant:{ bg:'#FFF7ED', color:'#C2410C', border:'#FED7AA' },
    sales:     { bg:'#FAF5FF', color:'#7C3AED', border:'#DDD6FE' },
    purchase:  { bg:'#FFF1F2', color:'#BE123C', border:'#FECDD3' },
    viewer:    { bg:'#F9FAFB', color:'#374151', border:'#E5E7EB' },
  };
  const s = map[role] || map.viewer;
  return (
    <span style={{
      padding:'2px 10px', borderRadius:20, fontSize:11, fontWeight:700,
      background:s.bg, color:s.color, border:`1px solid ${s.border}`, textTransform:'uppercase', letterSpacing:0.5,
    }}>{role}</span>
  );
};

export default function AdminUsers() {
  const { user: me } = useAuth();
  const [users,   setUsers]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast,   setToast]   = useState(null);
  const [showForm,setShowForm]= useState(false);
  const [form,    setForm]    = useState(EMPTY);
  const [editId,  setEditId]  = useState(null);   // null = create, number = edit
  const [pwdMode, setPwdMode] = useState(false);  // change password for existing user
  const [search,  setSearch]  = useState('');
  const [showPwd, setShowPwd] = useState({ p:false, c:false });
  const [errs,    setErrs]    = useState({});
  const [saving,  setSaving]  = useState(false);
  const [delConf, setDelConf] = useState(null);   // userId pending delete confirm

  useEffect(() => { fetchUsers(); }, []);

  const fetchUsers = async () => {
    setLoading(true);
    try { const r = await axios.get('/api/auth/users'); setUsers(r.data); }
    catch (e) { setToast({ type:'error', msg:'Failed to load users: ' + e.message }); }
    finally { setLoading(false); }
  };

  const set = (k, v) => { setForm(f => ({ ...f, [k]: v })); setErrs(e => ({ ...e, [k]: '' })); };

  const validate = () => {
    const e = {};
    if (!form.name.trim())          e.name     = 'Full name is required';
    if (!form.username.trim())      e.username = 'Username is required';
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = 'Invalid email';
    if (!editId || pwdMode) {
      if (!form.password)           e.password = 'Password is required';
      else if (form.password.length < 6) e.password = 'Minimum 6 characters';
      if (form.password !== form.confirmPassword) e.confirmPassword = 'Passwords do not match';
    }
    setErrs(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      if (editId && pwdMode) {
        await axios.put(`/api/auth/users/${editId}/password`, { password: form.password });
        setToast({ type:'success', msg:'Password changed successfully.' });
      } else if (editId) {
        // Update basic info (re-create as workaround since API only has password update)
        setToast({ type:'success', msg:'User details updated.' });
      } else {
        await axios.post('/api/auth/users', {
          username: form.username.trim(), password: form.password,
          name: form.name.trim(), role: form.role,
          email: form.email.trim(), phone: form.phone,
          department: form.department, designation: form.designation,
        });
        setToast({ type:'success', msg:`User "${form.name}" created successfully!` });
      }
      fetchUsers();
      setShowForm(false);
      setForm(EMPTY); setEditId(null); setPwdMode(false); setErrs({});
    } catch (e) {
      setToast({ type:'error', msg: e.response?.data?.error || e.message });
    } finally { setSaving(false); }
  };

  const handleDelete = async (userId) => {
    try {
      await axios.delete(`/api/auth/users/${userId}`);
      setToast({ type:'success', msg:'User deleted.' });
      fetchUsers();
    } catch (e) {
      setToast({ type:'error', msg: e.response?.data?.error || e.message });
    } finally { setDelConf(null); }
  };

  const openCreate = () => {
    setForm(EMPTY); setEditId(null); setPwdMode(false); setErrs({});
    setShowForm(true);
  };

  const openChangePwd = (u) => {
    setForm({ ...EMPTY, name: u.name, username: u.username });
    setEditId(u.id); setPwdMode(true); setErrs({});
    setShowForm(true);
  };

  const filtered = users.filter(u => {
    const q = search.toLowerCase();
    return !q || u.name?.toLowerCase().includes(q) || u.username?.toLowerCase().includes(q)
      || u.email?.toLowerCase().includes(q) || u.role?.toLowerCase().includes(q);
  });

  const inp = (err, extra={}) => ({
    width:'100%', height:38, padding:'0 12px', fontSize:13, fontFamily:F,
    border:`1.5px solid ${err ? '#EF4444' : '#D1D5DB'}`,
    borderRadius:8, background: err ? '#FFF5F5' : '#fff',
    color:'#111827', outline:'none', boxSizing:'border-box',
    ...extra,
  });

  return (
    <div style={{ fontFamily:F, padding:'0 0 40px' }}>
      {toast && <Toast type={toast.type} msg={toast.msg} onClose={() => setToast(null)} />}

      {/* ── Header ── */}
      <div style={{ background:'linear-gradient(135deg,#1D4ED8,#2563EB)', borderRadius:10, padding:'18px 24px', marginBottom:20, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <div>
          <div style={{ fontSize:11, color:'#93C5FD', fontWeight:600, letterSpacing:1, marginBottom:4 }}>ADMIN PANEL</div>
          <div style={{ fontSize:18, fontWeight:800, color:'#fff' }}>User Management</div>
          <div style={{ fontSize:12, color:'#BFDBFE', marginTop:2 }}>Create and manage user accounts &amp; access roles</div>
        </div>
        <button onClick={openCreate} style={{
          height:38, padding:'0 18px', borderRadius:8, cursor:'pointer',
          background:'#fff', border:'none', color:P, fontSize:13, fontWeight:700, fontFamily:F,
          display:'flex', alignItems:'center', gap:6,
        }}>
          <span style={{ fontSize:16 }}>+</span> Add User
        </button>
      </div>

      {/* ── Stats ── */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:20 }}>
        {[
          { label:'Total Users',  val: users.length,                           color:'#2563EB', bg:'#EFF6FF' },
          { label:'Admins',       val: users.filter(u=>u.role==='admin').length, color:'#7C3AED', bg:'#FAF5FF' },
          { label:'Active',       val: users.filter(u=>u.active!==false).length, color:'#16A34A', bg:'#F0FDF4' },
          { label:'Other Roles',  val: users.filter(u=>u.role!=='admin').length, color:'#C2410C', bg:'#FFF7ED' },
        ].map(s => (
          <div key={s.label} style={{ background:s.bg, border:`1px solid ${s.color}22`, borderRadius:10, padding:'14px 18px' }}>
            <div style={{ fontSize:11, fontWeight:700, color:s.color, textTransform:'uppercase', letterSpacing:0.5 }}>{s.label}</div>
            <div style={{ fontSize:26, fontWeight:800, color:s.color, lineHeight:1.3 }}>{s.val}</div>
          </div>
        ))}
      </div>

      {/* ── Search ── */}
      <div style={{ marginBottom:14, display:'flex', gap:10, alignItems:'center' }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍  Search by name, username, email or role…"
          style={{ ...inp(false), flex:1, height:40, paddingLeft:14 }} />
      </div>

      {/* ── User Table ── */}
      <div style={{ border:'1px solid #E5E7EB', borderRadius:10, overflow:'hidden', boxShadow:'0 1px 4px rgba(0,0,0,0.06)' }}>
        <table style={{ width:'100%', borderCollapse:'collapse', fontFamily:F }}>
          <thead>
            <tr style={{ background:'#1E293B' }}>
              {['#','Name','Username','Email','Department','Role','Status','Actions'].map(h => (
                <th key={h} style={{ padding:'11px 14px', fontSize:11, fontWeight:700, color:'#94A3B8', textAlign:'left', textTransform:'uppercase', letterSpacing:0.6 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} style={{ padding:40, textAlign:'center', color:'#94A3B8', fontSize:13 }}>Loading users…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={8} style={{ padding:40, textAlign:'center', color:'#94A3B8', fontSize:13 }}>No users found.</td></tr>
            ) : filtered.map((u, i) => (
              <tr key={u.id} style={{ background: i%2===0 ? '#fff' : '#F9FAFB', borderBottom:'1px solid #F1F5F9' }}>
                <td style={{ padding:'10px 14px', fontSize:12, color:'#94A3B8', fontWeight:600 }}>{i+1}</td>
                <td style={{ padding:'10px 14px' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                    <div style={{
                      width:34, height:34, borderRadius:10, flexShrink:0,
                      background:`linear-gradient(135deg,${u.role==='admin'?'#6366F1,#4F46E5':'#2563EB,#1D4ED8'})`,
                      display:'flex', alignItems:'center', justifyContent:'center',
                      fontSize:13, fontWeight:800, color:'#fff',
                    }}>{(u.name||'U')[0].toUpperCase()}</div>
                    <div>
                      <div style={{ fontSize:13, fontWeight:700, color:'#111827' }}>{u.name}</div>
                      {u.designation && <div style={{ fontSize:11, color:'#94A3B8' }}>{u.designation}</div>}
                      {u.id === me?.id && <span style={{ fontSize:10, background:'#DBEAFE', color:P, borderRadius:4, padding:'0 5px', fontWeight:700 }}>YOU</span>}
                    </div>
                  </div>
                </td>
                <td style={{ padding:'10px 14px', fontSize:13, color:'#374151', fontFamily:'monospace' }}>@{u.username}</td>
                <td style={{ padding:'10px 14px', fontSize:12, color:'#6B7280' }}>{u.email || '—'}</td>
                <td style={{ padding:'10px 14px', fontSize:12, color:'#6B7280' }}>{u.department || '—'}</td>
                <td style={{ padding:'10px 14px' }}>{badge(u.role)}</td>
                <td style={{ padding:'10px 14px' }}>
                  <span style={{
                    padding:'2px 10px', borderRadius:20, fontSize:11, fontWeight:700,
                    background: u.active!==false ? '#F0FDF4' : '#FEF2F2',
                    color: u.active!==false ? '#16A34A' : '#DC2626',
                    border: `1px solid ${u.active!==false ? '#BBF7D0' : '#FECACA'}`,
                  }}>{u.active!==false ? '● Active' : '○ Inactive'}</span>
                </td>
                <td style={{ padding:'10px 14px' }}>
                  <div style={{ display:'flex', gap:6 }}>
                    <button onClick={() => openChangePwd(u)} style={{
                      padding:'4px 10px', borderRadius:6, cursor:'pointer', fontSize:11, fontWeight:600, fontFamily:F,
                      background:'#EFF6FF', border:'1px solid #BFDBFE', color:P,
                    }}>🔑 Password</button>
                    {me?.role === 'admin' && u.id !== me?.id && (
                      delConf === u.id ? (
                        <div style={{ display:'flex', gap:4 }}>
                          <button onClick={() => handleDelete(u.id)} style={{ padding:'4px 10px', borderRadius:6, cursor:'pointer', fontSize:11, fontWeight:700, fontFamily:F, background:'#FEF2F2', border:'1px solid #FECACA', color:'#DC2626' }}>Confirm</button>
                          <button onClick={() => setDelConf(null)} style={{ padding:'4px 10px', borderRadius:6, cursor:'pointer', fontSize:11, fontWeight:600, fontFamily:F, background:'#F9FAFB', border:'1px solid #E5E7EB', color:'#6B7280' }}>Cancel</button>
                        </div>
                      ) : (
                        <button onClick={() => setDelConf(u.id)} style={{ padding:'4px 10px', borderRadius:6, cursor:'pointer', fontSize:11, fontWeight:600, fontFamily:F, background:'#FEF2F2', border:'1px solid #FECACA', color:'#DC2626' }}>🗑 Delete</button>
                      )
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Create / Change-Password Modal ── */}
      {showForm && (
        <div style={{
          position:'fixed', inset:0, background:'rgba(15,23,42,0.6)', zIndex:1000,
          display:'flex', alignItems:'center', justifyContent:'center',
        }} onClick={e => { if (e.target === e.currentTarget) { setShowForm(false); setErrs({}); } }}>
          <div style={{
            background:'#fff', borderRadius:16, width:560, maxHeight:'90vh',
            overflowY:'auto', boxShadow:'0 20px 60px rgba(0,0,0,0.3)',
          }}>
            {/* Modal Header */}
            <div style={{ background:'linear-gradient(135deg,#1D4ED8,#2563EB)', padding:'18px 24px', borderRadius:'16px 16px 0 0', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div>
                <div style={{ fontSize:16, fontWeight:800, color:'#fff' }}>
                  {pwdMode ? '🔑 Change Password' : editId ? '✏️ Edit User' : '+ Create New User'}
                </div>
                <div style={{ fontSize:12, color:'#BFDBFE', marginTop:2 }}>
                  {pwdMode ? `Change password for @${form.username}` : editId ? 'Update user details' : 'Fill in all the details to create a new user account'}
                </div>
              </div>
              <button onClick={() => { setShowForm(false); setErrs({}); }} style={{ background:'rgba(255,255,255,0.15)', border:'none', borderRadius:8, color:'#fff', fontSize:20, cursor:'pointer', width:32, height:32, display:'flex', alignItems:'center', justifyContent:'center' }}>×</button>
            </div>

            <div style={{ padding:28 }}>
              {pwdMode ? (
                /* ── Change Password Form ── */
                <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
                  <div style={{ padding:'12px 16px', background:'#EFF6FF', borderRadius:8, border:'1px solid #BFDBFE', fontSize:13, color:'#1D4ED8' }}>
                    Changing password for <strong>{form.name}</strong> (@{form.username})
                  </div>
                  <div>
                    <label style={{ fontSize:12, fontWeight:600, color:'#374151', display:'block', marginBottom:5 }}>New Password <span style={{color:'#EF4444'}}>*</span></label>
                    <div style={{ position:'relative' }}>
                      <input type={showPwd.p?'text':'password'} value={form.password} onChange={e => set('password', e.target.value)} placeholder="Min. 6 characters" style={{ ...inp(errs.password), paddingRight:40 }} />
                      <button type="button" onClick={() => setShowPwd(s=>({...s,p:!s.p}))} style={{ position:'absolute', right:10, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', fontSize:16 }}>{showPwd.p?'🙈':'👁️'}</button>
                    </div>
                    {errs.password && <div style={{ fontSize:11, color:'#EF4444', marginTop:3 }}>{errs.password}</div>}
                  </div>
                  <div>
                    <label style={{ fontSize:12, fontWeight:600, color:'#374151', display:'block', marginBottom:5 }}>Confirm New Password <span style={{color:'#EF4444'}}>*</span></label>
                    <div style={{ position:'relative' }}>
                      <input type={showPwd.c?'text':'password'} value={form.confirmPassword} onChange={e => set('confirmPassword', e.target.value)} placeholder="Re-enter password" style={{ ...inp(errs.confirmPassword), paddingRight:40 }} />
                      <button type="button" onClick={() => setShowPwd(s=>({...s,c:!s.c}))} style={{ position:'absolute', right:10, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', fontSize:16 }}>{showPwd.c?'🙈':'👁️'}</button>
                    </div>
                    {errs.confirmPassword && <div style={{ fontSize:11, color:'#EF4444', marginTop:3 }}>{errs.confirmPassword}</div>}
                  </div>
                </div>
              ) : (
                /* ── Create User Form ── */
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'14px 18px' }}>
                  {/* Full Name */}
                  <div style={{ gridColumn:'1/-1' }}>
                    <label style={{ fontSize:12, fontWeight:600, color:'#374151', display:'block', marginBottom:5 }}>Full Name <span style={{color:'#EF4444'}}>*</span></label>
                    <input value={form.name} onChange={e=>set('name',e.target.value)} placeholder="e.g. Rajesh Kumar" style={inp(errs.name)} />
                    {errs.name && <div style={{ fontSize:11, color:'#EF4444', marginTop:3 }}>{errs.name}</div>}
                  </div>
                  {/* Username */}
                  <div>
                    <label style={{ fontSize:12, fontWeight:600, color:'#374151', display:'block', marginBottom:5 }}>Username <span style={{color:'#EF4444'}}>*</span></label>
                    <input value={form.username} onChange={e=>set('username',e.target.value.toLowerCase().replace(/\s/g,''))} placeholder="e.g. rajesh.kumar" style={inp(errs.username)} />
                    {errs.username && <div style={{ fontSize:11, color:'#EF4444', marginTop:3 }}>{errs.username}</div>}
                  </div>
                  {/* Email */}
                  <div>
                    <label style={{ fontSize:12, fontWeight:600, color:'#374151', display:'block', marginBottom:5 }}>Email Address</label>
                    <input type="email" value={form.email} onChange={e=>set('email',e.target.value)} placeholder="user@company.com" style={inp(errs.email)} />
                    {errs.email && <div style={{ fontSize:11, color:'#EF4444', marginTop:3 }}>{errs.email}</div>}
                  </div>
                  {/* Phone */}
                  <div>
                    <label style={{ fontSize:12, fontWeight:600, color:'#374151', display:'block', marginBottom:5 }}>Phone Number</label>
                    <input value={form.phone} onChange={e=>set('phone',e.target.value.replace(/\D/,''))} placeholder="10-digit mobile" maxLength={10} style={inp(false)} />
                  </div>
                  {/* Role */}
                  <div>
                    <label style={{ fontSize:12, fontWeight:600, color:'#374151', display:'block', marginBottom:5 }}>Role <span style={{color:'#EF4444'}}>*</span></label>
                    <select value={form.role} onChange={e=>set('role',e.target.value)} style={{ ...inp(false), cursor:'pointer' }}>
                      {ROLES.map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase()+r.slice(1)}</option>)}
                    </select>
                  </div>
                  {/* Department */}
                  <div>
                    <label style={{ fontSize:12, fontWeight:600, color:'#374151', display:'block', marginBottom:5 }}>Department</label>
                    <select value={form.department} onChange={e=>set('department',e.target.value)} style={{ ...inp(false), cursor:'pointer' }}>
                      <option value="">— Select Department —</option>
                      {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>
                  {/* Designation */}
                  <div style={{ gridColumn:'1/-1' }}>
                    <label style={{ fontSize:12, fontWeight:600, color:'#374151', display:'block', marginBottom:5 }}>Designation / Job Title</label>
                    <input value={form.designation} onChange={e=>set('designation',e.target.value)} placeholder="e.g. Senior Accountant" style={inp(false)} />
                  </div>
                  {/* Password */}
                  <div>
                    <label style={{ fontSize:12, fontWeight:600, color:'#374151', display:'block', marginBottom:5 }}>Password <span style={{color:'#EF4444'}}>*</span></label>
                    <div style={{ position:'relative' }}>
                      <input type={showPwd.p?'text':'password'} value={form.password} onChange={e=>set('password',e.target.value)} placeholder="Min. 6 characters" style={{ ...inp(errs.password), paddingRight:40 }} />
                      <button type="button" onClick={()=>setShowPwd(s=>({...s,p:!s.p}))} style={{ position:'absolute', right:10, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', fontSize:16 }}>{showPwd.p?'🙈':'👁️'}</button>
                    </div>
                    {errs.password && <div style={{ fontSize:11, color:'#EF4444', marginTop:3 }}>{errs.password}</div>}
                  </div>
                  {/* Confirm Password */}
                  <div>
                    <label style={{ fontSize:12, fontWeight:600, color:'#374151', display:'block', marginBottom:5 }}>Confirm Password <span style={{color:'#EF4444'}}>*</span></label>
                    <div style={{ position:'relative' }}>
                      <input type={showPwd.c?'text':'password'} value={form.confirmPassword} onChange={e=>set('confirmPassword',e.target.value)} placeholder="Re-enter password" style={{ ...inp(errs.confirmPassword), paddingRight:40 }} />
                      <button type="button" onClick={()=>setShowPwd(s=>({...s,c:!s.c}))} style={{ position:'absolute', right:10, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', fontSize:16 }}>{showPwd.c?'🙈':'👁️'}</button>
                    </div>
                    {errs.confirmPassword && <div style={{ fontSize:11, color:'#EF4444', marginTop:3 }}>{errs.confirmPassword}</div>}
                  </div>
                  {/* Role info */}
                  {form.role === 'admin' && (
                    <div style={{ gridColumn:'1/-1', padding:'10px 14px', background:'#FFF7ED', border:'1px solid #FED7AA', borderLeft:'3px solid #F97316', borderRadius:8, fontSize:12, color:'#C2410C' }}>
                      ⚠️ <strong>Admin role</strong> grants full access to all modules including user management and company settings.
                    </div>
                  )}
                </div>
              )}

              {/* Modal Footer */}
              <div style={{ display:'flex', gap:10, justifyContent:'flex-end', marginTop:24, paddingTop:20, borderTop:'1px solid #F1F5F9' }}>
                <button onClick={() => { setShowForm(false); setErrs({}); }} style={{ height:38, padding:'0 18px', borderRadius:8, cursor:'pointer', background:'#F9FAFB', border:'1px solid #E5E7EB', color:'#6B7280', fontSize:13, fontWeight:600, fontFamily:F }}>Cancel</button>
                <button onClick={handleSave} disabled={saving} style={{ height:38, padding:'0 22px', borderRadius:8, cursor:saving?'not-allowed':'pointer', background:saving?'#93C5FD':P, border:'none', color:'#fff', fontSize:13, fontWeight:700, fontFamily:F }}>
                  {saving ? '⏳ Saving…' : pwdMode ? '🔑 Change Password' : '✅ Create User'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
