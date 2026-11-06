import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useLock, hashPin, PIN_KEY } from '../../context/LockContext';
import axios from 'axios';
import { MODULES, GROUP_ORDER } from '../../utils/permissions';
import { useNavTheme, NEU } from '../../utils/navTheme';

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

/* ── Look of the page: classic (white + teal) or soft (neumorphism), following
   the SOFT switch in the top bar. Only colours/shadows change, never logic. ── */
const NEU_RAISED_LG = '10px 10px 22px #A3B1C6, -10px -10px 22px #FFFFFF';
const BTN_C = { primary: TEAL, dark: '#475569', blue: '#3A6186', danger: '#dc2626' };
const BTN_N = { primary: '#0F766E', dark: NEU.strong, blue: '#3A6186', danger: '#DC2626' };
const ps = (neu) => ({
  neu,
  heading: neu ? NEU.strong : '#1e293b',
  sub:     neu ? NEU.text   : '#64748b',
  label:   neu ? NEU.text   : '#374151',
  line:    neu ? 'rgba(163,177,198,0.45)' : '#f1f5f9',
  /* filled button (or raised soft button); press = inset */
  btn: (kind = 'primary', disabled = false) => {
    const base = { borderRadius: neu ? 12 : 7, padding: '9px 22px', fontWeight: 700, fontSize: 13, fontFamily: F,
      cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.7 : 1 };
    const style = neu
      ? { ...base, background: NEU.base, color: BTN_N[kind], border: 'none', boxShadow: NEU.raisedSm }
      : { ...base, background: BTN_C[kind], color: '#fff', border: 'none' };
    const press = neu ? {
      onMouseDown:  e => { e.currentTarget.style.boxShadow = NEU.inset; },
      onMouseUp:    e => { e.currentTarget.style.boxShadow = NEU.raisedSm; },
      onMouseLeave: e => { e.currentTarget.style.boxShadow = NEU.raisedSm; },
    } : {};
    return { style, ...press };
  },
  /* secondary buttons: Cancel / Remove PIN */
  btn2: (danger = false) => neu
    ? { background: NEU.base, color: danger ? '#DC2626' : NEU.text, border: 'none', boxShadow: NEU.raisedSm, borderRadius: 12,
        padding: '9px 18px', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: F }
    : danger
      ? { background: '#fff', color: '#dc2626', border: '1.5px solid #fca5a5', borderRadius: 8, padding: '9px 22px', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: F }
      : { background: '#f1f5f9', color: '#374151', border: '1px solid #e2e8f0', borderRadius: 8, padding: '9px 18px', fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: F },
  /* pressed-in panel */
  well: (extra = {}) => neu
    ? { background: NEU.base, borderRadius: 16, boxShadow: NEU.inset, ...extra }
    : { background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0', ...extra },
  msg: (ok, extra = {}) => neu
    ? { padding: '10px 14px', borderRadius: 12, background: NEU.base, boxShadow: NEU.insetSm, color: ok ? '#15803d' : '#dc2626', fontSize: 13, fontWeight: 700, ...extra }
    : { padding: '10px 14px', borderRadius: 8, background: ok ? '#f0fdf4' : '#fef2f2', color: ok ? '#15803d' : '#dc2626', border: `1px solid ${ok ? '#bbf7d0' : '#fecaca'}`, fontSize: 13, fontWeight: 600, ...extra },
  pill: (bg, color) => neu
    ? { background: NEU.base, boxShadow: NEU.insetSm, color, borderRadius: 20, padding: '4px 13px', fontSize: 12, fontWeight: 800 }
    : { background: bg, color, borderRadius: 20, padding: '3px 12px', fontSize: 12, fontWeight: 700 },
});
const useProfileStyle = () => { const [theme] = useNavTheme(); return ps(theme === 'neu'); };

/* ── Permissions grouped display ─────────────────── */
function PermissionsPanel({ user }) {
  const P = useProfileStyle();
  if (!user) return null;
  const isAdmin = user.role === 'admin';
  const perms = user.permissions ?? null;

  if (isAdmin) {
    return (
      <div style={{ textAlign: 'center', padding: 40 }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>🛡️</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#0f766e' }}>Full Administrator Access</div>
        <div style={{ fontSize: 13, color: P.sub, marginTop: 6 }}>All modules and actions are permitted</div>
      </div>
    );
  }

  if (!perms) {
    return (
      <div style={{ textAlign: 'center', padding: 40 }}>
        <div style={{ fontSize: 13, color: P.sub }}>No permission record — legacy full access</div>
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
          <div key={group} style={P.neu
            ? { background: NEU.base, borderRadius: 16, boxShadow: NEU.raisedSm, overflow: 'hidden', padding: '4px 6px 8px' }
            : { border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
            <div style={P.neu ? { padding: '10px 10px 6px' } : { background: '#f8fafc', padding: '8px 14px', borderBottom: '1px solid #e2e8f0' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: P.neu ? NEU.accent : '#374151', textTransform: 'uppercase', letterSpacing: 0.5 }}>{group}</span>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: P.neu ? 'transparent' : '#f1f5f9' }}>
                  <th style={{ padding: '6px 12px', textAlign: 'left', fontWeight: 600, color: P.neu ? NEU.muted : '#64748b' }}>Module</th>
                  {['view','create','edit','delete','approve'].map(a => (
                    <th key={a} style={{ padding: '6px 10px', textAlign: 'center', fontWeight: 600, color: P.neu ? NEU.muted : '#64748b', textTransform: 'capitalize' }}>{a}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {mods.map((m, i) => (
                  <tr key={m.key} style={{ borderTop: i > 0 ? `1px solid ${P.line}` : 'none' }}>
                    <td style={{ padding: '7px 12px', color: P.label, fontWeight: 500 }}>{m.label}</td>
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
  const P = useProfileStyle();
  const neu = P.neu;

  return (
    <div className="neu-native" style={neu ? { background: NEU.base, minHeight: '100%' } : undefined}>
    <div style={{ padding: '24px', maxWidth: 960, margin: '0 auto', fontFamily: F }}>

      {/* ── Top card ── */}
      <div style={neu
        ? { background: NEU.base, borderRadius: 22, boxShadow: NEU_RAISED_LG, marginBottom: 20 }
        : { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, overflow: 'hidden', marginBottom: 20 }}>
        <div style={neu
          ? { padding: '28px 28px 18px', display: 'flex', alignItems: 'center', gap: 22 }
          : { background: `linear-gradient(135deg, #0b3d3d, ${TEAL})`, padding: '28px 28px 20px', display: 'flex', alignItems: 'center', gap: 20 }}>
          {/* Avatar */}
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <div style={{ width: 80, height: 80, borderRadius: '50%', overflow: 'hidden', cursor: 'pointer', flexShrink: 0,
              ...(neu ? { border: '4px solid #E0E5EC', boxShadow: NEU.raised } : { border: '3px solid rgba(255,255,255,0.3)' }) }}
              onClick={() => fileRef.current?.click()}>
              {photoUrl ? (
                <img key={photoKey} src={photoUrl} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg,#6366f1,#4f46e5)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, fontWeight: 800, color: '#fff' }}>
                  {initials}
                </div>
              )}
            </div>
            <div style={{ position: 'absolute', bottom: 2, right: 2, background: neu ? NEU.base : '#fff', borderRadius: '50%', width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 12, boxShadow: neu ? NEU.raisedSm : '0 1px 4px rgba(0,0,0,0.2)' }}
              onClick={() => fileRef.current?.click()} title="Change photo">✏️</div>
            <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handlePhotoChange} />
          </div>
          {/* Name + role */}
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, color: neu ? NEU.strong : '#fff' }}>{user?.name || user?.username}</div>
            <div style={{ fontSize: 12, color: neu ? NEU.muted : 'rgba(255,255,255,0.75)', marginTop: 3 }}>@{user?.username}</div>
            <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
              <span style={neu
                ? { background: NEU.base, boxShadow: NEU.insetSm, color: user?.role === 'admin' ? '#B45309' : NEU.accent, borderRadius: 20, padding: '4px 14px', fontSize: 11, fontWeight: 800, letterSpacing: 0.4 }
                : { background: user?.role === 'admin' ? '#fbbf24' : 'rgba(255,255,255,0.2)', color: user?.role === 'admin' ? '#1a1a1a' : '#fff', borderRadius: 20, padding: '3px 12px', fontSize: 11, fontWeight: 700 }}>
                {(user?.role || 'user').toUpperCase()}
              </span>
            </div>
          </div>
          <div style={{ marginLeft: 'auto', fontSize: 11, color: neu ? NEU.muted : 'rgba(255,255,255,0.6)', textAlign: 'right' }}>
            <div>Click photo to change</div>
            <div style={{ marginTop: 4 }}>Max 5 MB · JPG/PNG</div>
          </div>
        </div>

        {/* Tabs */}
        <div style={neu
          ? { display: 'flex', padding: '6px 24px 6px', gap: 12, flexWrap: 'wrap' }
          : { display: 'flex', borderBottom: '1px solid #e2e8f0', padding: '0 20px', gap: 4 }}>
          {[['info','👤 Profile'], ['permissions','🔐 Permissions'], ['dashboard','📊 Dashboard'], ['security','🔒 Screen Lock']].map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)}
              style={neu
                ? { padding: '9px 18px', border: 'none', borderRadius: 12, background: NEU.base, cursor: 'pointer', fontSize: 13, fontFamily: F,
                    fontWeight: tab === k ? 700 : 600, color: tab === k ? NEU.accent : NEU.text, boxShadow: tab === k ? NEU.inset : NEU.raisedSm, transition: 'box-shadow 0.15s' }
                : { padding: '10px 16px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, fontWeight: tab === k ? 700 : 500, color: tab === k ? TEAL2 : '#64748b', borderBottom: tab === k ? `2px solid ${TEAL}` : '2px solid transparent', marginBottom: -1, fontFamily: F }}>
              {l}
            </button>
          ))}
        </div>

        <div style={{ padding: '24px 24px' }}>

          {/* ── Tab: Profile Info ── */}
          {tab === 'info' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              {msg.text && (
                <div style={P.msg(msg.ok)}>{msg.text}</div>
              )}
              {/* Personal details */}
              <div>
                <h3 style={{ margin: '0 0 16px', fontSize: 14, fontWeight: 700, color: P.heading }}>Personal Details</h3>
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
                  <button disabled={saving} onClick={saveProfile} {...P.btn('primary', saving)}>
                    {saving ? 'Saving…' : 'Save Profile'}
                  </button>
                </div>
              </div>

              {/* Read-only */}
              <div style={P.well({ padding: neu ? 18 : 16 })}>
                <h3 style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 700, color: neu ? NEU.text : '#475569' }}>Account Info (read-only)</h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <Info label="Username" value={user?.username} />
                  <Info label="Role" value={(user?.role || 'user').toUpperCase()} />
                  <Info label="User ID" value={userId} />
                </div>
              </div>

              {/* Change Password */}
              <div>
                <h3 style={{ margin: '0 0 16px', fontSize: 14, fontWeight: 700, color: P.heading }}>Change Password</h3>
                {pwMsg.text && (
                  <div style={P.msg(pwMsg.ok, { padding: '8px 12px', fontSize: 12, marginBottom: 12 })}>{pwMsg.text}</div>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                  <Field label="Current Password" value={pwForm.currentPassword} onChange={v => setPwForm(f => ({ ...f, currentPassword: v }))} type="password" />
                  <Field label="New Password" value={pwForm.newPassword} onChange={v => setPwForm(f => ({ ...f, newPassword: v }))} type="password" />
                  <Field label="Confirm New Password" value={pwForm.confirmPassword} onChange={v => setPwForm(f => ({ ...f, confirmPassword: v }))} type="password" />
                </div>
                <div style={{ marginTop: 14 }}>
                  <button disabled={saving || !pwForm.currentPassword || !pwForm.newPassword} onClick={changePassword} {...P.btn('dark', saving)}>
                    Change Password
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── Tab: Permissions ── */}
          {tab === 'permissions' && <PermissionsPanel user={user} />}

          {/* ── Tab: Screen Lock ── */}
          {tab === 'security' && <ScreenLockPanel />}

          {/* ── Tab: Dashboard Preferences ── */}
          {tab === 'dashboard' && (
            <div>
              {msg.text && (
                <div style={P.msg(msg.ok, { marginBottom: 16 })}>{msg.text}</div>
              )}
              <h3 style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 700, color: P.heading }}>Dashboard Sections</h3>
              <p style={{ margin: '0 0 20px', fontSize: 13, color: P.sub }}>Choose which sections to display on your dashboard. Changes apply only to your account.</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
                {DASH_PREFS.map(p => (
                  <label key={p.key} style={neu
                    ? { display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', background: NEU.base, borderRadius: 14, cursor: 'pointer', transition: 'box-shadow .15s',
                        boxShadow: prefs[p.key] !== false ? NEU.inset : NEU.raisedSm }
                    : { display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', background: prefs[p.key] !== false ? '#f0fdf9' : '#f8fafc', border: `1.5px solid ${prefs[p.key] !== false ? '#99f6e4' : '#e2e8f0'}`, borderRadius: 10, cursor: 'pointer', transition: 'all .12s' }}>
                    <input type="checkbox" checked={prefs[p.key] !== false} onChange={e => setPrefs(prev => ({ ...prev, [p.key]: e.target.checked }))}
                      style={{ width: 17, height: 17, accentColor: TEAL, cursor: 'pointer' }} />
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: neu && prefs[p.key] !== false ? '#0F766E' : P.heading }}>{p.icon} {p.label}</div>
                      <div style={{ fontSize: 11, color: P.sub, marginTop: 2 }}>{p.desc}</div>
                    </div>
                  </label>
                ))}
              </div>
              <button disabled={saving} onClick={savePrefs} {...P.btn('primary', saving)}>
                {saving ? 'Saving…' : 'Save Preferences'}
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
    </div>
  );
}

/* ── Screen Lock PIN Panel ─── */
function ScreenLockPanel() {
  const lock = useLock();
  const P = useProfileStyle();
  const [mode, setMode]       = useState('view'); // view | set | change | remove
  const [pin1, setPin1]       = useState('');
  const [pin2, setPin2]       = useState('');
  const [curPin, setCurPin]   = useState('');
  const [msg, setMsg]         = useState({ text: '', ok: true });
  const [busy, setBusy]       = useState(false);

  // lock context may be null on vendor portal / outside provider
  const hasPin = lock?.hasPin ?? !!localStorage.getItem(PIN_KEY);

  const showMsg = (text, ok = true) => {
    setMsg({ text, ok });
    setTimeout(() => setMsg({ text: '', ok: true }), 3500);
  };

  const reset = () => { setMode('view'); setPin1(''); setPin2(''); setCurPin(''); };

  const handleSetPin = async () => {
    if (!/^\d{4}$/.test(pin1)) { showMsg('PIN must be exactly 4 digits', false); return; }
    if (pin1 !== pin2)          { showMsg('PINs do not match', false); return; }
    setBusy(true);
    await lock.savePin(pin1);
    setBusy(false);
    showMsg('Screen lock PIN set! Lock icon will appear in the header.', true);
    reset();
  };

  const handleChangePin = async () => {
    if (!curPin)                { showMsg('Enter your current PIN', false); return; }
    if (!/^\d{4}$/.test(pin1)) { showMsg('New PIN must be exactly 4 digits', false); return; }
    if (pin1 !== pin2)          { showMsg('New PINs do not match', false); return; }
    setBusy(true);
    const stored = localStorage.getItem(PIN_KEY);
    const hash   = await hashPin(curPin);
    if (hash !== stored) { setBusy(false); showMsg('Current PIN is incorrect', false); return; }
    await lock.savePin(pin1);
    setBusy(false);
    showMsg('PIN changed successfully', true);
    reset();
  };

  const handleRemovePin = async () => {
    if (!curPin) { showMsg('Enter your current PIN to confirm removal', false); return; }
    setBusy(true);
    const stored = localStorage.getItem(PIN_KEY);
    const hash   = await hashPin(curPin);
    if (hash !== stored) { setBusy(false); showMsg('Incorrect PIN', false); return; }
    lock.removePin();
    setBusy(false);
    showMsg('Screen lock PIN removed', true);
    reset();
  };

  const pinInput = (label, val, set, ph = '••••') => (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: P.label, marginBottom: 5 }}>{label}</label>
      <input
        type="password" inputMode="numeric" maxLength={4}
        value={val} onChange={e => set(e.target.value.replace(/\D/g,'').slice(0,4))}
        placeholder={ph}
        style={P.neu
          ? { width: 120, padding: '9px 12px', border: 'none', borderRadius: 12, background: NEU.base, boxShadow: NEU.inset, color: NEU.strong, fontSize: 20, letterSpacing: 8, fontFamily: 'monospace', outline: 'none', textAlign: 'center' }
          : { width: 120, padding: '9px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 20, letterSpacing: 8, fontFamily: 'monospace', outline: 'none', textAlign: 'center' }}
        onFocus={e => { if (!P.neu) e.target.style.borderColor = '#3A6186'; }}
        onBlur={e => { if (!P.neu) e.target.style.borderColor = '#e2e8f0'; }}
      />
    </div>
  );

  return (
    <div>
      {/* Info banner */}
      <div style={P.neu
        ? { padding: '16px 18px', borderRadius: 16, background: NEU.base, boxShadow: NEU.inset, marginBottom: 20, display: 'flex', gap: 14, alignItems: 'flex-start' }
        : { padding: '14px 18px', borderRadius: 10, background: 'linear-gradient(135deg,#f0f4ff,#e8eeff)', border: '1px solid #c7d2fe', marginBottom: 20, display: 'flex', gap: 14, alignItems: 'flex-start' }}>
        <span style={{ fontSize: 28, lineHeight: 1 }}>🔒</span>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: P.heading, marginBottom: 4 }}>Screen Lock — Super ERP System</div>
          <div style={{ fontSize: 12.5, color: P.neu ? NEU.text : '#475569', lineHeight: 1.6 }}>
            Set a 4-digit PIN to automatically lock the screen after <strong>2 minutes of inactivity</strong>.<br />
            You can also lock instantly by clicking the 🔒 icon in the header.
          </div>
        </div>
      </div>

      {/* Status pill */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <span style={{ fontSize: 13, color: P.neu ? NEU.text : '#475569', fontWeight: 600 }}>Status:</span>
        {hasPin ? (
          <span style={P.pill('#dcfce7', '#15803d')}>✅ PIN Active</span>
        ) : (
          <span style={P.pill('#fef3c7', '#92400e')}>⚠ No PIN Set</span>
        )}
      </div>

      {msg.text && (
        <div style={P.msg(msg.ok, { marginBottom: 16 })}>{msg.text}</div>
      )}

      {/* Actions */}
      {mode === 'view' && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {!hasPin ? (
            <button onClick={() => setMode('set')}
              {...P.btn('blue')}>
              🔒 Set Screen Lock PIN
            </button>
          ) : (
            <>
              <button onClick={() => setMode('change')}
                {...P.btn('blue')}>
                🔑 Change PIN
              </button>
              <button onClick={() => setMode('remove')}
                style={P.btn2(true)}>
                🗑 Remove PIN
              </button>
            </>
          )}
        </div>
      )}

      {mode === 'set' && (
        <div style={{ maxWidth: 280 }}>
          <h4 style={{ margin: '0 0 16px', fontSize: 14, color: P.heading }}>Set New PIN</h4>
          {pinInput('New 4-digit PIN', pin1, setPin1)}
          {pinInput('Confirm PIN', pin2, setPin2)}
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={handleSetPin} disabled={busy}
              {...P.btn('blue')}>
              {busy ? 'Saving…' : 'Set PIN'}
            </button>
            <button onClick={reset} style={P.btn2(false)}>Cancel</button>
          </div>
        </div>
      )}

      {mode === 'change' && (
        <div style={{ maxWidth: 280 }}>
          <h4 style={{ margin: '0 0 16px', fontSize: 14, color: P.heading }}>Change PIN</h4>
          {pinInput('Current PIN', curPin, setCurPin)}
          {pinInput('New PIN', pin1, setPin1)}
          {pinInput('Confirm New PIN', pin2, setPin2)}
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={handleChangePin} disabled={busy}
              {...P.btn('blue')}>
              {busy ? 'Saving…' : 'Change PIN'}
            </button>
            <button onClick={reset} style={P.btn2(false)}>Cancel</button>
          </div>
        </div>
      )}

      {mode === 'remove' && (
        <div style={{ maxWidth: 280 }}>
          <h4 style={{ margin: '0 0 8px', fontSize: 14, color: '#dc2626' }}>Remove PIN</h4>
          <p style={{ margin: '0 0 14px', fontSize: 12.5, color: P.sub }}>Enter your current PIN to confirm removal. The screen lock will be disabled.</p>
          {pinInput('Current PIN', curPin, setCurPin)}
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={handleRemovePin} disabled={busy}
              {...P.btn('danger')}>
              {busy ? 'Removing…' : 'Remove PIN'}
            </button>
            <button onClick={reset} style={P.btn2(false)}>Cancel</button>
          </div>
        </div>
      )}

      <div style={P.well({ marginTop: 24, padding: '12px 16px', fontSize: 12, color: P.sub, lineHeight: 1.7 })}>
        <strong style={{ color: P.label }}>How it works:</strong><br />
        • PIN is stored locally on this device only (never sent to server)<br />
        • After 2 min of inactivity, screen locks automatically<br />
        • Click 🔒 in the header to lock instantly<br />
        • Clearing browser data will reset the PIN
      </div>
    </div>
  );
}

/* ── Small helpers ─── */
function Field({ label, value, onChange, type = 'text' }) {
  const P = useProfileStyle();
  const DEEP = 'inset 4px 4px 9px #A3B1C6, inset -4px -4px 9px #FFFFFF';
  return (
    <div>
      <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: P.label, marginBottom: P.neu ? 6 : 4 }}>{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)}
        style={P.neu
          ? { width: '100%', padding: '9px 12px', borderRadius: 11, border: 'none', background: NEU.base, boxShadow: NEU.inset, color: NEU.strong, fontSize: 13, outline: 'none', boxSizing: 'border-box', fontFamily: F }
          : { width: '100%', padding: '8px 10px', borderRadius: 7, border: '1px solid #e2e8f0', fontSize: 13, outline: 'none', boxSizing: 'border-box', fontFamily: F }}
        onFocus={e => { if (P.neu) e.target.style.boxShadow = DEEP; else e.target.style.borderColor = '#0d9488'; }}
        onBlur={e => { if (P.neu) e.target.style.boxShadow = NEU.inset; else e.target.style.borderColor = '#e2e8f0'; }}
      />
    </div>
  );
}

function Info({ label, value }) {
  const P = useProfileStyle();
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 600, color: P.neu ? NEU.muted : '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 600, color: P.neu ? NEU.strong : '#374151' }}>{value || '—'}</div>
    </div>
  );
}
