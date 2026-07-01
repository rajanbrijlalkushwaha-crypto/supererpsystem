import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import axios from 'axios';
import { MODULES, GROUP_ORDER } from '../../utils/permissions';

const F = "'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif";
const TEAL = '#0d9488';
const TEAL2 = '#0f766e';

/* ── Dashboard preference definitions ─────────────── */
const DASH_PREFS = [
  { key: 'showSalesOrders',    label: 'Sales Orders',           desc: 'Total Sales Order Value row',  icon: '📋' },
  { key: 'showPurchaseOrders', label: 'Purchase Orders',        desc: 'Total Purchase Order Value row', icon: '🛒' },
  { key: 'showReceivable',     label: 'Receivable from Client', desc: 'Dues receivable from clients',   icon: '💰' },
  { key: 'showPayable',        label: 'Payable to Vendor',      desc: 'Dues payable to vendors',        icon: '💸' },
  { key: 'showMonthly',        label: 'Monthly Summary',        desc: 'Month-by-month breakdown',       icon: '📅' },
];

/* ── Permissions grouped display ─────────────────── */
function PermissionsPanel({ user }) {
  if (!user) return null;
  const isAdmin = user.role === 'admin';
  const perms = user.permissions ?? null;

  if (isAdmin) {
    return (
      <div style={{ textAlign: 'center', padding: 40 }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>🛡️</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#0f766e' }}>Full Administrator Access</div>
        <div style={{ fontSize: 13, color: '#64748b', marginTop: 6 }}>All modules and actions are permitted</div>
      </div>
    );
  }

  if (!perms) {
    return (
      <div style={{ textAlign: 'center', padding: 40 }}>
        <div style={{ fontSize: 13, color: '#64748b' }}>No permission record — legacy full access</div>
      </div>
    );
  }

  const groups = GROUP_ORDER.filter(g => MODULES.some(m => m.group === g));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {groups.map(group => {
        const mods = MODULES.filter(m => m.group === group);
        const hasAny = mods.some(m => Object.values(perms[m.key] || {}).some(Boolean));
        if (!hasAny) return null;
        return (
          <div key={group} style={{ border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
            <div style={{ background: '#f8fafc', padding: '8px 14px', borderBottom: '1px solid #e2e8f0' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: 0.5 }}>{group}</span>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#f1f5f9' }}>
                  <th style={{ padding: '6px 12px', textAlign: 'left', fontWeight: 600, color: '#64748b' }}>Module</th>
                  {['view','create','edit','delete','approve'].map(a => (
                    <th key={a} style={{ padding: '6px 10px', textAlign: 'center', fontWeight: 600, color: '#64748b', textTransform: 'capitalize' }}>{a}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {mods.map((m, i) => (
                  <tr key={m.key} style={{ borderTop: i > 0 ? '1px solid #f1f5f9' : 'none' }}>
                    <td style={{ padding: '7px 12px', color: '#374151', fontWeight: 500 }}>{m.label}</td>
                    {['view','create','edit','delete','approve'].map(a => {
                      const has = !!(perms[m.key]?.[a]);
                      const applies = m.actions.includes(a);
                      return (
                        <td key={a} style={{ padding: '7px 10px', textAlign: 'center' }}>
                          {applies ? (
                            <span style={{ fontSize: 14 }}>{has ? '✅' : '⬜'}</span>
                          ) : (
                            <span style={{ color: '#d1d5db', fontSize: 11 }}>—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}

/* ══════════════════════════════════════════════════
   MAIN
══════════════════════════════════════════════════ */
export default function UserProfile() {
  const { user, refreshUser } = useAuth();
  const [tab, setTab] = useState('info');
  const [photoUrl, setPhotoUrl] = useState(null);
  const [photoKey, setPhotoKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState({ text: '', ok: true });
  const fileRef = useRef();

  // Profile form
  const [form, setForm] = useState({
    firstName: '', middleName: '', lastName: '', email: '', phone: '', designation: '', department: '',
  });

  // Password form
  const [pwForm, setPwForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [pwMsg, setPwMsg] = useState({ text: '', ok: true });

  // Dashboard prefs
  const [prefs, setPrefs] = useState({
    showSalesOrders: true, showPurchaseOrders: true,
    showReceivable: true, showPayable: true, showMonthly: true,
  });

  const showMsg = (text, ok = true) => {
    setMsg({ text, ok });
    setTimeout(() => setMsg({ text: '', ok: true }), 3000);
  };

  useEffect(() => {
    if (!user) return;
    const fetchFull = async () => {
      try {
        const r = await axios.get('/api/auth/users');
        const full = r.data.find(u => u.id === user.id || u.id === user.userId || u.username === user.username);
        if (full) {
          setForm({
            firstName:   full.firstName   || '',
            middleName:  full.middleName  || '',
            lastName:    full.lastName    || '',
            email:       full.email       || '',
            phone:       full.phone       || '',
            designation: full.designation || '',
            department:  full.department  || '',
          });
          if (full.dashboardPrefs) setPrefs(p => ({ ...p, ...full.dashboardPrefs }));
          if (full.photoExt) setPhotoUrl(`/api/auth/profile/photo/${full.id}?t=${Date.now()}`);
        }
      } catch {}
    };
    fetchFull();
  }, [user]);

  const handlePhotoChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('photo', file);
    try {
      const r = await axios.post('/api/auth/profile/photo', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setPhotoUrl(r.data.photoUrl + '&t=' + Date.now());
      setPhotoKey(k => k + 1);
      showMsg('Photo updated');
      await refreshUser();
    } catch (err) {
      showMsg(err.response?.data?.error || 'Upload failed', false);
    }
  };

  const saveProfile = async () => {
    setSaving(true);
    try {
      await axios.put('/api/auth/profile', form);
      showMsg('Profile saved');
      await refreshUser();
    } catch (err) {
      showMsg(err.response?.data?.error || 'Save failed', false);
    } finally { setSaving(false); }
  };

  const changePassword = async () => {
    if (pwForm.newPassword !== pwForm.confirmPassword) {
      setPwMsg({ text: 'Passwords do not match', ok: false });
      return;
    }
    setSaving(true);
    try {
      await axios.put('/api/auth/profile/password', { currentPassword: pwForm.currentPassword, newPassword: pwForm.newPassword });
      setPwMsg({ text: 'Password changed', ok: true });
      setPwForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setTimeout(() => setPwMsg({ text: '', ok: true }), 3000);
    } catch (err) {
      setPwMsg({ text: err.response?.data?.error || 'Failed', ok: false });
    } finally { setSaving(false); }
  };

  const savePrefs = async () => {
    setSaving(true);
    try {
      await axios.put('/api/auth/profile', { dashboardPrefs: prefs });
      showMsg('Dashboard preferences saved');
      await refreshUser();
    } catch (err) {
      showMsg(err.response?.data?.error || 'Save failed', false);
    } finally { setSaving(false); }
  };

  const userId = user?.id || user?.userId;
  const initials = (user?.name || user?.username || 'U').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);

  return (
    <div style={{ padding: '24px', maxWidth: 960, margin: '0 auto', fontFamily: F }}>

      {/* ── Top card ── */}
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, overflow: 'hidden', marginBottom: 20 }}>
        <div style={{ background: `linear-gradient(135deg, #0b3d3d, ${TEAL})`, padding: '28px 28px 20px', display: 'flex', alignItems: 'center', gap: 20 }}>
          {/* Avatar */}
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <div style={{ width: 80, height: 80, borderRadius: '50%', overflow: 'hidden', border: '3px solid rgba(255,255,255,0.3)', cursor: 'pointer', flexShrink: 0 }}
              onClick={() => fileRef.current?.click()}>
              {photoUrl ? (
                <img key={photoKey} src={photoUrl} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg,#6366f1,#4f46e5)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, fontWeight: 800, color: '#fff' }}>
                  {initials}
                </div>
              )}
            </div>
            <div style={{ position: 'absolute', bottom: 2, right: 2, background: '#fff', borderRadius: '50%', width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.2)' }}
              onClick={() => fileRef.current?.click()} title="Change photo">✏️</div>
            <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handlePhotoChange} />
          </div>
          {/* Name + role */}
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#fff' }}>{user?.name || user?.username}</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)', marginTop: 3 }}>@{user?.username}</div>
            <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
              <span style={{ background: user?.role === 'admin' ? '#fbbf24' : 'rgba(255,255,255,0.2)', color: user?.role === 'admin' ? '#1a1a1a' : '#fff', borderRadius: 20, padding: '3px 12px', fontSize: 11, fontWeight: 700 }}>
                {(user?.role || 'user').toUpperCase()}
              </span>
            </div>
          </div>
          <div style={{ marginLeft: 'auto', fontSize: 11, color: 'rgba(255,255,255,0.6)', textAlign: 'right' }}>
            <div>Click photo to change</div>
            <div style={{ marginTop: 4 }}>Max 5 MB · JPG/PNG</div>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', padding: '0 20px', gap: 4 }}>
          {[['info','👤 Profile'], ['permissions','🔐 Permissions'], ['dashboard','📊 Dashboard']].map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)}
              style={{ padding: '10px 16px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, fontWeight: tab === k ? 700 : 500, color: tab === k ? TEAL2 : '#64748b', borderBottom: tab === k ? `2px solid ${TEAL}` : '2px solid transparent', marginBottom: -1, fontFamily: F }}>
              {l}
            </button>
          ))}
        </div>

        <div style={{ padding: '24px 24px' }}>

          {/* ── Tab: Profile Info ── */}
          {tab === 'info' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              {msg.text && (
                <div style={{ padding: '10px 14px', borderRadius: 8, background: msg.ok ? '#f0fdf4' : '#fef2f2', color: msg.ok ? '#15803d' : '#dc2626', border: `1px solid ${msg.ok ? '#bbf7d0' : '#fecaca'}`, fontSize: 13, fontWeight: 600 }}>{msg.text}</div>
              )}
              {/* Personal details */}
              <div>
                <h3 style={{ margin: '0 0 16px', fontSize: 14, fontWeight: 700, color: '#1e293b' }}>Personal Details</h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                  <Field label="First Name" value={form.firstName} onChange={v => setForm(f => ({ ...f, firstName: v }))} />
                  <Field label="Middle Name" value={form.middleName} onChange={v => setForm(f => ({ ...f, middleName: v }))} />
                  <Field label="Last Name" value={form.lastName} onChange={v => setForm(f => ({ ...f, lastName: v }))} />
                  <Field label="Email" value={form.email} onChange={v => setForm(f => ({ ...f, email: v }))} type="email" />
                  <Field label="Phone" value={form.phone} onChange={v => setForm(f => ({ ...f, phone: v }))} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
                  <Field label="Designation" value={form.designation} onChange={v => setForm(f => ({ ...f, designation: v }))} />
                  <Field label="Department" value={form.department} onChange={v => setForm(f => ({ ...f, department: v }))} />
                </div>
                <div style={{ marginTop: 14 }}>
                  <button disabled={saving} onClick={saveProfile}
                    style={{ background: TEAL, color: '#fff', border: 'none', borderRadius: 7, padding: '9px 22px', fontWeight: 700, fontSize: 13, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1, fontFamily: F }}>
                    {saving ? 'Saving…' : 'Save Profile'}
                  </button>
                </div>
              </div>

              {/* Read-only */}
              <div style={{ padding: 16, background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0' }}>
                <h3 style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 700, color: '#475569' }}>Account Info (read-only)</h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <Info label="Username" value={user?.username} />
                  <Info label="Role" value={(user?.role || 'user').toUpperCase()} />
                  <Info label="User ID" value={userId} />
                </div>
              </div>

              {/* Change Password */}
              <div>
                <h3 style={{ margin: '0 0 16px', fontSize: 14, fontWeight: 700, color: '#1e293b' }}>Change Password</h3>
                {pwMsg.text && (
                  <div style={{ padding: '8px 12px', borderRadius: 7, background: pwMsg.ok ? '#f0fdf4' : '#fef2f2', color: pwMsg.ok ? '#15803d' : '#dc2626', border: `1px solid ${pwMsg.ok ? '#bbf7d0' : '#fecaca'}`, fontSize: 12, marginBottom: 12 }}>{pwMsg.text}</div>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                  <Field label="Current Password" value={pwForm.currentPassword} onChange={v => setPwForm(f => ({ ...f, currentPassword: v }))} type="password" />
                  <Field label="New Password" value={pwForm.newPassword} onChange={v => setPwForm(f => ({ ...f, newPassword: v }))} type="password" />
                  <Field label="Confirm New Password" value={pwForm.confirmPassword} onChange={v => setPwForm(f => ({ ...f, confirmPassword: v }))} type="password" />
                </div>
                <div style={{ marginTop: 14 }}>
                  <button disabled={saving || !pwForm.currentPassword || !pwForm.newPassword} onClick={changePassword}
                    style={{ background: '#475569', color: '#fff', border: 'none', borderRadius: 7, padding: '9px 22px', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: F, opacity: saving ? 0.7 : 1 }}>
                    Change Password
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── Tab: Permissions ── */}
          {tab === 'permissions' && <PermissionsPanel user={user} />}

          {/* ── Tab: Dashboard Preferences ── */}
          {tab === 'dashboard' && (
            <div>
              {msg.text && (
                <div style={{ padding: '10px 14px', borderRadius: 8, background: msg.ok ? '#f0fdf4' : '#fef2f2', color: msg.ok ? '#15803d' : '#dc2626', border: `1px solid ${msg.ok ? '#bbf7d0' : '#fecaca'}`, fontSize: 13, fontWeight: 600, marginBottom: 16 }}>{msg.text}</div>
              )}
              <h3 style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 700, color: '#1e293b' }}>Dashboard Sections</h3>
              <p style={{ margin: '0 0 20px', fontSize: 13, color: '#64748b' }}>Choose which sections to display on your dashboard. Changes apply only to your account.</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
                {DASH_PREFS.map(p => (
                  <label key={p.key} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', background: prefs[p.key] !== false ? '#f0fdf9' : '#f8fafc', border: `1.5px solid ${prefs[p.key] !== false ? '#99f6e4' : '#e2e8f0'}`, borderRadius: 10, cursor: 'pointer', transition: 'all .12s' }}>
                    <input type="checkbox" checked={prefs[p.key] !== false} onChange={e => setPrefs(prev => ({ ...prev, [p.key]: e.target.checked }))}
                      style={{ width: 17, height: 17, accentColor: TEAL, cursor: 'pointer' }} />
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: '#1e293b' }}>{p.icon} {p.label}</div>
                      <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{p.desc}</div>
                    </div>
                  </label>
                ))}
              </div>
              <button disabled={saving} onClick={savePrefs}
                style={{ background: TEAL, color: '#fff', border: 'none', borderRadius: 7, padding: '9px 22px', fontWeight: 700, fontSize: 13, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1, fontFamily: F }}>
                {saving ? 'Saving…' : 'Save Preferences'}
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

/* ── Small helpers ─── */
function Field({ label, value, onChange, type = 'text' }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#374151', marginBottom: 4 }}>{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)}
        style={{ width: '100%', padding: '8px 10px', borderRadius: 7, border: '1px solid #e2e8f0', fontSize: 13, outline: 'none', boxSizing: 'border-box', fontFamily: F }}
        onFocus={e => e.target.style.borderColor = '#0d9488'}
        onBlur={e => e.target.style.borderColor = '#e2e8f0'}
      />
    </div>
  );
}

function Info({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>{value || '—'}</div>
    </div>
  );
}
