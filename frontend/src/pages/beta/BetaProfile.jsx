/* Beta — My profile (top bar → Profile settings), /beta/profile.
 * Tabs: Profile (photo, name, contact, designation) · Permissions (what this user may do) · Password · Screen lock PIN.
 * Same data and APIs as the classic profile page (/api/auth/profile…). */
import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';
import { useLock, hashPin, PIN_KEY } from '../../context/LockContext';
import { Svg } from '../../components/ui/Icon';
import { CSS as SALES_CSS } from './BetaSales';
import { MODULES, GROUP_ORDER, ALL_ACTIONS, can } from '../../utils/permissions';

const EXTRA_CSS = `
.pf-sig { display:grid; grid-template-columns:minmax(0, 300px) minmax(0, 1fr); gap:16px; margin-top:14px; }
.pf-sig .lb { font-size:11.5px; font-weight:700; color:#475467; margin-bottom:6px; text-transform:uppercase; letter-spacing:.4px; }
.pf-sig .box { height:110px; border:1px dashed #9FC3C9; border-radius:8px; display:grid; place-items:center; padding:8px;
  background:repeating-conic-gradient(#F5F8F9 0% 25%, #fff 0% 50%) 50% / 16px 16px; }
.pf-sig .box img { max-width:100%; max-height:94px; object-fit:contain; } .pf-sig .box span { color:#98A2B3; font-size:13px; }
.pf-sig-cur p { font-size:12px; color:#667085; line-height:1.5; margin:8px 0 0; }
.pf-sig-cur, .pf-sig-new { background:#fff; border:1px solid #DCE6E8; border-radius:10px; padding:14px; }
.pf-seg { display:inline-flex; border:1px solid #C9D7DA; border-radius:8px; overflow:hidden; margin-bottom:12px; }
.pf-seg button { border:0; background:#fff; padding:7px 14px; font:600 12.5px Inter, Arial, sans-serif; color:#344054; cursor:pointer; }
.pf-seg button + button { border-left:1px solid #C9D7DA; } .pf-seg button.on { background:#03444f; color:#fff; }
.pf-sig .up { border:2px dashed #9FC3C9; border-radius:10px; padding:26px 16px; text-align:center; cursor:pointer; background:#F7FBFB; }
.pf-sig .up:hover { border-color:#03444f; background:#EEF7F8; }
.pf-sig .up b { display:block; color:#03444f; font-size:14px; } .pf-sig .up span { display:block; margin-top:4px; font-size:12px; color:#667085; }
.pf-sig .pad canvas { width:100%; aspect-ratio:720 / 220; border:1px solid #C9D7DA; border-radius:8px; background:#fff; touch-action:none; cursor:crosshair;
  background-image:linear-gradient(transparent calc(100% - 46px), #E4ECEE calc(100% - 46px), #E4ECEE calc(100% - 45px), transparent calc(100% - 45px)); }
.pf-sig .pad .row { display:flex; align-items:center; gap:8px; margin-top:8px; } .pf-sig .pad .row span { flex:1; font-size:12px; color:#667085; }
.pf-sig .pv { margin-top:12px; display:grid; gap:8px; justify-items:start; } .pf-sig .pv .box { width:100%; }
@media (max-width:760px) { .pf-sig { grid-template-columns:1fr; } }

.pf-wrap { max-width:980px; }
.pf-head { display:flex; align-items:center; gap:16px; padding:14px 16px; background:#fff; border:1px solid #DCE6E8; border-radius:8px; margin-top:10px; }
.pf-av { position:relative; width:72px; height:72px; border-radius:50%; background:#03444f; color:#fff; display:flex; align-items:center; justify-content:center; font:700 24px Inter, Arial, sans-serif; overflow:hidden; flex-shrink:0; }
.pf-av img { width:100%; height:100%; object-fit:cover; }
.pf-head h2 { margin:0; font-size:18px; color:#101828; } .pf-head .sub { font-size:12.5px; color:#667085; margin-top:2px; }
.pf-role { display:inline-block; margin-left:8px; padding:2px 8px; border-radius:99px; background:#E6F0F1; color:#03444f; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.3px; vertical-align:middle; }
.pf-tabs { display:flex; gap:4px; margin:12px 0 0; }
.pf-tabs button { border:1px solid #C9D7DA; background:#fff; color:#03444f; font:600 12.5px Inter, Arial, sans-serif; padding:6px 16px; border-radius:99px; cursor:pointer; }
.pf-tabs button.on { background:#03444f; border-color:#03444f; color:#fff; }
.pf-ro td { color:#344054; } .pf-hint { font-size:11.5px; color:#667085; margin-top:3px; }
.pf-sum { display:flex; flex-wrap:wrap; align-items:center; gap:0; background:#fff; border:1px solid #DCE6E8; border-radius:8px; margin-top:10px; }
.pf-sum > div { padding:8px 16px; border-right:1px solid #DCE6E8; font-size:11px; color:#667085; text-transform:uppercase; letter-spacing:.3px; }
.pf-sum b { display:block; font-size:16px; color:#03444f; text-transform:none; letter-spacing:0; }
.pf-sum .grow { flex:1; border:0; }
.pf-sum select, .pf-sum input { height:30px !important; border:1px solid #C9D7DA; border-radius:6px; padding:0 8px; font:13px Inter, Arial, sans-serif; margin-right:10px; flex:0 0 auto; }
.pf-sum input { width:200px !important; } .pf-sum select { width:190px !important; }
.pf-pt { width:100%; border-collapse:collapse; background:#fff; font-size:12.5px; margin-top:10px; border:1px solid #DCE6E8; }
.pf-pt th { background:#D4EBEE; color:#000; font-weight:700; font-size:11.5px; text-align:center; padding:7px 6px; border-bottom:1px solid #A9CDD2; position:sticky; top:0; }
.pf-pt th:first-child { text-align:left; padding-left:12px; }
.pf-pt td { padding:6px; border-bottom:1px solid #EDF2F3; text-align:center; }
.pf-pt td:first-child { text-align:left; padding-left:12px; font-weight:600; color:#101828; }
.pf-pt tr.grp td { background:#F4F8F8; color:#03444f; font-weight:700; font-size:11.5px; text-transform:uppercase; letter-spacing:.4px; text-align:left; padding:6px 12px; }
.pf-ok { display:inline-block; padding:2px 9px; border-radius:99px; background:#ECFDF3; color:#067647; font-size:11px; font-weight:700; }
.pf-no { display:inline-block; padding:2px 9px; border-radius:99px; background:#FEF3F2; color:#B42318; font-size:11px; font-weight:700; }
.pf-na { color:#D0D5DD; }
.pf-pin { letter-spacing:6px; font-family:monospace; max-width:140px; }
`;
const initialsOf = n => String(n || 'U').split(/\s+/).filter(Boolean).map(w => w[0]).join('').toUpperCase().slice(0, 2) || 'U';

export default function BetaProfile() {
  const { user, refreshUser } = useAuth() || {};
  const navigate = useNavigate();
  const { search } = useLocation();
  const tab = ['permissions', 'password', 'lock', 'signature'].includes(new URLSearchParams(search).get('tab')) ? new URLSearchParams(search).get('tab') : 'profile';
  const [full, setFull] = useState(null);
  const [photo, setPhoto] = useState('');
  const [msg, setMsg] = useState(null);
  const fileRef = useRef(null);
  const userId = user?.id || user?.userId;

  useEffect(() => {
    if (!user) return;
    axios.get('/api/auth/users').then(r => {
      const u = (Array.isArray(r.data) ? r.data : []).find(x => x.id === userId || x.username === user.username) || {};
      setFull(u);
      if (u.photoExt) setPhoto(`/api/auth/profile/photo/${u.id}?t=${Date.now()}`);
    }).catch(() => setFull({}));
  }, [user, userId]);

  const upPhoto = async e => {
    const f = e.target.files?.[0]; e.target.value = '';
    if (!f) return;
    if (!/^image\//.test(f.type)) return setMsg({ k: 'err', t: 'Choose an image file (JPG / PNG).' });
    try {
      const fd = new FormData(); fd.append('photo', f);
      const r = await axios.post('/api/auth/profile/photo', fd);
      setPhoto(`${r.data.photoUrl}&v=${Date.now()}`);
      setMsg({ k: 'ok', t: 'Photo updated.' });
      refreshUser && refreshUser();
    } catch (err) { setMsg({ k: 'err', t: err.response?.data?.error || 'Could not upload the photo.' }); }
  };

  const name = (full && [full.firstName, full.middleName, full.lastName].filter(Boolean).join(' ')) || user?.name || user?.username || '';
  const go = t => { setMsg(null); navigate(`/beta/profile${t === 'profile' ? '' : `?tab=${t}`}`); };
  return (
    <div className="sb">
      <style>{SALES_CSS + EXTRA_CSS}</style>
      <div className="sb-tabs" role="tablist"><button type="button" role="tab" aria-selected="true" className="sb-tab on">My Profile</button><div className="sb-slot" /></div>
      <div className="sb-body"><div className="sf pf-wrap">
        <div className="pf-head">
          <div className="pf-av">{photo ? <img src={photo} alt="" onError={() => setPhoto('')} /> : initialsOf(name)}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2>{name}<span className="pf-role">{user?.role || 'user'}</span></h2>
            <div className="sub">{[full?.designation, full?.department, user?.username && `@${user.username}`].filter(Boolean).join(' · ')}</div>
          </div>
          <button type="button" className="sf-b ghost" onClick={() => fileRef.current?.click()}>{photo ? 'Change photo' : 'Add photo'}</button>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={upPhoto} />
        </div>
        <div className="pf-tabs" role="tablist">
          {[['profile', 'Profile'], ['signature', 'Signature'], ['permissions', 'Permissions'], ['password', 'Password'], ['lock', 'Screen lock']].map(([k, l]) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => go(k)}>{l}</button>
          ))}
        </div>
        {msg && <div className={`sf-msg ${msg.k}`} role="status" style={{ marginTop: 10 }}>{msg.t}</div>}
        {tab === 'profile' && (full ? <ProfileTab full={full} user={user} userId={userId} setMsg={setMsg} onSaved={u => { setFull(f => ({ ...f, ...u })); refreshUser && refreshUser(); }} /> : <div className="sf-empty">Loading…</div>)}
        {tab === 'permissions' && <PermissionsTab user={user} />}
        {tab === 'password' && <PasswordTab />}
        {tab === 'lock' && <LockTab />}
        {tab === 'signature' && <SignatureTab setMsg={setMsg} />}
      </div></div>
    </div>
  );
}

function ProfileTab({ full, user, userId, setMsg, onSaved }) {
  const [v, setV] = useState(() => ({
    firstName: full.firstName || '', middleName: full.middleName || '', lastName: full.lastName || '',
    email: full.email || '', phone: full.phone || '', designation: full.designation || '', department: full.department || '',
  }));
  const [busy, setBusy] = useState(false);
  const set = k => e => { const x = e.target.value; setV(o => ({ ...o, [k]: x })); setMsg(null); };
  const save = async () => {
    if (v.email && !/^\S+@\S+\.\S+$/.test(v.email.trim())) return setMsg({ k: 'err', t: 'Enter a valid email.' });
    setBusy(true);
    try {
      const body = Object.fromEntries(Object.entries(v).map(([k, x]) => [k, x.trim()]));
      await axios.put('/api/auth/profile', body);
      onSaved(body); setMsg({ k: 'ok', t: 'Profile saved.' });
    } catch (e) { setMsg({ k: 'err', t: e.response?.data?.error || 'Could not save the profile.' }); }
    finally { setBusy(false); }
  };
  return (
    <>
      <div className="sf-2" style={{ marginTop: 10 }}>
        <div className="sf-card">
          <div className="sf-ch"><span className="ico"><Svg name="user" size={13} /></span><b>Personal details</b></div>
          <table className="sf-kv"><tbody>
            <tr><th>First name</th><td><input value={v.firstName} onChange={set('firstName')} /></td></tr>
            <tr><th>Middle name</th><td><input value={v.middleName} onChange={set('middleName')} /></td></tr>
            <tr><th>Last name</th><td><input value={v.lastName} onChange={set('lastName')} />
              <div className="pf-hint">Your display name changes when both first and last name are filled.</div></td></tr>
            <tr><th>Email</th><td><input type="email" value={v.email} onChange={set('email')} /></td></tr>
            <tr><th>Phone</th><td><input value={v.phone} onChange={set('phone')} inputMode="tel" /></td></tr>
          </tbody></table>
        </div>
        <div className="sf-card">
          <div className="sf-ch"><span className="ico"><Svg name="badge" size={13} /></span><b>Work &amp; account</b></div>
          <table className="sf-kv pf-ro"><tbody>
            <tr><th>Designation</th><td><input value={v.designation} onChange={set('designation')} placeholder="e.g. Accounts Executive" /></td></tr>
            <tr><th>Department</th><td><input value={v.department} onChange={set('department')} placeholder="e.g. Accounts" /></td></tr>
            <tr><th>Username</th><td className="mono">{user?.username || '—'}</td></tr>
            <tr><th>Role</th><td>{String(user?.role || 'user').toUpperCase()}</td></tr>
            <tr><th>User ID</th><td className="mono">{userId || '—'}</td></tr>
            {full.validUntil && <tr><th>Access valid till</th><td>{new Date(full.validUntil).toLocaleDateString('en-IN')}</td></tr>}
          </tbody></table>
        </div>
      </div>
      <div className="sf-bar">
        <div className="info">Username and role are set by the admin.</div>
        <button type="button" className="sf-b pri" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save profile'}</button>
      </div>
    </>
  );
}

/* My signature: upload a picture of it (the white paper is made see-through and the edges trimmed) or draw it.
   It is put on documents you sign (Prepared / Reviewed / Approved) and under your name in e-mails. */
function SignatureTab({ setMsg }) {
  const [cur, setCur] = useState(null);
  const [mode, setMode] = useState('upload');
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const pad = useRef(null), drawing = useRef(false), drawn = useRef(false);
  const fileIn = useRef(null);
  useEffect(() => { axios.get('/api/sign/my').then(r => setCur(r.data)).catch(() => setCur({ has: false })); }, []);
  // a canvas → trimmed PNG with a transparent background
  const toPng = (cv, ink) => {
    const ctx = cv.getContext('2d'), { width: W, height: H } = cv, im = ctx.getImageData(0, 0, W, H), p = im.data;
    let x0 = W, y0 = H, x1 = -1, y1 = -1;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4, lum = (p[i] + p[i + 1] + p[i + 2]) / 3;
      if (p[i + 3] < 10 || lum > 205) { p[i + 3] = 0; continue; }   // paper / empty → see-through
      if (ink) { p[i] = 10; p[i + 1] = 30; p[i + 2] = 90; }          // a scanned signature in clear dark-blue ink
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    if (x1 < 0) return '';
    ctx.putImageData(im, 0, 0);
    const pd = 6, out = document.createElement('canvas');
    out.width = x1 - x0 + 1 + pd * 2; out.height = y1 - y0 + 1 + pd * 2;
    out.getContext('2d').drawImage(cv, x0, y0, x1 - x0 + 1, y1 - y0 + 1, pd, pd, x1 - x0 + 1, y1 - y0 + 1);
    return out.toDataURL('image/png');
  };
  const onFile = e => {
    const f = e.target.files?.[0]; e.target.value = '';
    if (!f) return;
    if (!/^image\//.test(f.type)) return setMsg({ k: 'err', t: 'Choose a photo / scan of your signature (JPG or PNG).' });
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, 900 / img.width, 400 / img.height), cv = document.createElement('canvas');
      cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
      const ctx = cv.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height); ctx.drawImage(img, 0, 0, cv.width, cv.height);
      const png = toPng(cv, true);
      if (!png) return setMsg({ k: 'err', t: 'No signature found in that picture — use a dark pen on white paper.' });
      setDraft(png); setMsg(null);
      URL.revokeObjectURL(img.src);
    };
    img.src = URL.createObjectURL(f);
  };
  const pos = e => { const r = pad.current.getBoundingClientRect(); return [(e.clientX - r.left) * (pad.current.width / r.width), (e.clientY - r.top) * (pad.current.height / r.height)]; };
  const down = e => { drawing.current = true; const c = pad.current.getContext('2d'); const [x, y] = pos(e); c.beginPath(); c.moveTo(x, y); pad.current.setPointerCapture(e.pointerId); };
  const move = e => { if (!drawing.current) return; const c = pad.current.getContext('2d'); c.lineWidth = 2.6; c.lineCap = 'round'; c.lineJoin = 'round'; c.strokeStyle = '#0A1E5A'; const [x, y] = pos(e); c.lineTo(x, y); c.stroke(); drawn.current = true; };
  const up = () => { drawing.current = false; };
  const clearPad = () => { const c = pad.current; c.getContext('2d').clearRect(0, 0, c.width, c.height); drawn.current = false; setDraft(''); };
  const usePad = () => { if (!drawn.current) return setMsg({ k: 'err', t: 'Sign in the box first.' }); const cv = document.createElement('canvas'); cv.width = pad.current.width; cv.height = pad.current.height; cv.getContext('2d').drawImage(pad.current, 0, 0); setDraft(toPng(cv, false)); setMsg(null); };
  const save = async () => {
    setBusy(true);
    try { const r = await axios.post('/api/sign/my', { dataUrl: draft }); setCur({ has: true, dataUrl: r.data.dataUrl }); setDraft(''); setMsg({ k: 'ok', t: 'Signature saved. You can now sign documents from their print preview (✍ Sign).' }); }
    catch (err) { setMsg({ k: 'err', t: err.response?.data?.error || 'Could not save the signature.' }); }
    finally { setBusy(false); }
  };
  const remove = async () => { await axios.delete('/api/sign/my').catch(() => {}); setCur({ has: false }); setMsg({ k: 'ok', t: 'Signature removed.' }); };
  return (
    <div className="pf-sig">
      <div className="pf-sig-cur">
        <div className="lb">Your signature</div>
        <div className="box">{cur?.has ? <img src={cur.dataUrl} alt="Your signature" /> : <span>{cur ? 'No signature yet' : 'Loading…'}</span>}</div>
        {cur?.has && <button type="button" className="sf-lnk" style={{ color: '#B42318' }} onClick={remove}>Remove</button>}
        <p>Used when you sign a document as <b>Prepared</b>, <b>Reviewed</b> or <b>Approved</b> (✍ Sign in the print preview), and under your name in e-mails.</p>
      </div>
      <div className="pf-sig-new">
        <div className="pf-seg" role="group" aria-label="How">
          <button type="button" className={mode === 'upload' ? 'on' : ''} onClick={() => { setMode('upload'); setDraft(''); }}>Upload a photo / scan</button>
          <button type="button" className={mode === 'draw' ? 'on' : ''} onClick={() => { setMode('draw'); setDraft(''); }}>Draw it</button>
        </div>
        {mode === 'upload' ? (
          <div className="up" role="button" tabIndex={0} onClick={() => fileIn.current?.click()} onKeyDown={e => e.key === 'Enter' && fileIn.current?.click()}>
            <b>Choose a picture of your signature</b><span>Sign with a dark pen on white paper and take a photo. The white paper is removed and the edges trimmed.</span>
            <input ref={fileIn} type="file" accept="image/*" hidden onChange={onFile} />
          </div>
        ) : (
          <div className="pad">
            <canvas ref={pad} width={720} height={220} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up} aria-label="Sign here" />
            <div className="row"><span>Sign above with the mouse, a pen or your finger.</span><button type="button" className="sf-b ghost" onClick={clearPad}>Clear</button><button type="button" className="sf-b ghost" onClick={usePad}>Use this</button></div>
          </div>
        )}
        {draft && (
          <div className="pv"><div className="lb">Preview</div><div className="box"><img src={draft} alt="New signature" /></div>
            <button type="button" className="sf-b pri" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save signature'}</button></div>
        )}
      </div>
    </div>
  );
}

function PasswordTab() {
  const [v, setV] = useState({ cur: '', neu: '', again: '' });
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const set = k => e => { const x = e.target.value; setV(o => ({ ...o, [k]: x })); setMsg(null); };
  const save = async () => {
    if (!v.cur || !v.neu) return setMsg({ k: 'err', t: 'Enter your current and new password.' });
    if (v.neu.length < 6) return setMsg({ k: 'err', t: 'The new password must be at least 6 characters.' });
    if (v.neu !== v.again) return setMsg({ k: 'err', t: 'The two new passwords do not match.' });
    setBusy(true);
    try { await axios.put('/api/auth/profile/password', { currentPassword: v.cur, newPassword: v.neu }); setV({ cur: '', neu: '', again: '' }); setMsg({ k: 'ok', t: 'Password changed. Use the new password next time you sign in.' }); }
    catch (e) { setMsg({ k: 'err', t: e.response?.data?.error || 'Could not change the password.' }); }
    finally { setBusy(false); }
  };
  const t = show ? 'text' : 'password';
  return (
    <>
      <div className="sf-card" style={{ marginTop: 10, maxWidth: 560 }}>
        <div className="sf-ch"><span className="ico"><Svg name="lock" size={13} /></span><b>Change password</b></div>
        <table className="sf-kv"><tbody>
          <tr><th>Current password</th><td><input type={t} value={v.cur} onChange={set('cur')} autoComplete="current-password" /></td></tr>
          <tr><th>New password</th><td><input type={t} value={v.neu} onChange={set('neu')} autoComplete="new-password" /><div className="pf-hint">At least 6 characters.</div></td></tr>
          <tr><th>Confirm new password</th><td><input type={t} value={v.again} onChange={set('again')} autoComplete="new-password" /></td></tr>
          <tr><th /><td><label style={{ fontSize: 12.5, display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={show} onChange={e => setShow(e.target.checked)} style={{ width: 'auto' }} />Show passwords</label></td></tr>
        </tbody></table>
      </div>
      {msg && <div className={`sf-msg ${msg.k}`} role="status">{msg.t}</div>}
      <div className="sf-bar" style={{ maxWidth: 560 }}>
        <div className="info" />
        <button type="button" className="sf-b pri" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Change password'}</button>
      </div>
    </>
  );
}

/* the 4-digit PIN that unlocks the screen lock (kept on this computer, as on the classic page) */
function LockTab() {
  const lock = useLock();
  const has = (() => { try { return lock?.hasPin ?? !!localStorage.getItem(PIN_KEY); } catch { return false; } })();
  const [mode, setMode] = useState('view');
  const [v, setV] = useState({ cur: '', p1: '', p2: '' });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const set = k => e => { const x = e.target.value.replace(/\D/g, '').slice(0, 4); setV(o => ({ ...o, [k]: x })); setMsg(null); };
  const reset = () => { setMode('view'); setV({ cur: '', p1: '', p2: '' }); };
  const curOk = async () => { let stored = ''; try { stored = localStorage.getItem(PIN_KEY) || ''; } catch { /* none */ } return (await hashPin(v.cur)) === stored; };
  const save = async () => {
    if (!lock) return setMsg({ k: 'err', t: 'Screen lock is not available here.' });
    if (mode !== 'set' && !(await curOk())) return setMsg({ k: 'err', t: 'The current PIN is not correct.' });
    if (mode === 'remove') { lock.removePin(); reset(); return setMsg({ k: 'ok', t: 'Screen lock PIN removed.' }); }
    if (!/^\d{4}$/.test(v.p1)) return setMsg({ k: 'err', t: 'The PIN must be exactly 4 digits.' });
    if (v.p1 !== v.p2) return setMsg({ k: 'err', t: 'The two PINs do not match.' });
    setBusy(true); await lock.savePin(v.p1); setBusy(false);
    reset(); setMsg({ k: 'ok', t: mode === 'set' ? 'Screen lock PIN set. Use the lock in the top bar to lock the screen.' : 'PIN changed.' });
  };
  const pin = (label, k) => <tr><th>{label}</th><td><input type="password" inputMode="numeric" value={v[k]} onChange={set(k)} className="pf-pin" placeholder="••••" autoComplete="off" /></td></tr>;
  return (
    <>
      <div className="sf-card" style={{ marginTop: 10, maxWidth: 560 }}>
        <div className="sf-ch"><span className="ico"><Svg name="lock" size={13} /></span><b>Screen lock PIN</b><span className="grow" />
          <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 99, background: '#fff', color: has ? '#067647' : '#475467' }}>{has ? 'ON' : 'OFF'}</span></div>
        {mode === 'view' ? (
          <div style={{ padding: 12, fontSize: 13, color: '#344054', lineHeight: 1.5 }}>
            {has ? 'A PIN is set. You can lock the screen from the top bar and unlock it with this PIN.' : 'No PIN yet. Set a 4-digit PIN to lock the screen when you step away.'}
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              {!has && <button type="button" className="sf-b pri" onClick={() => setMode('set')}>Set PIN</button>}
              {has && <button type="button" className="sf-b pri" onClick={() => setMode('change')}>Change PIN</button>}
              {has && <button type="button" className="sf-b ghost" onClick={() => setMode('remove')}>Remove PIN</button>}
            </div>
            <div className="pf-hint" style={{ marginTop: 10 }}>The PIN is saved on this computer only.</div>
          </div>
        ) : (
          <table className="sf-kv"><tbody>
            {mode !== 'set' && pin('Current PIN', 'cur')}
            {mode !== 'remove' && pin(mode === 'set' ? 'New PIN' : 'New PIN', 'p1')}
            {mode !== 'remove' && pin('Confirm PIN', 'p2')}
          </tbody></table>
        )}
      </div>
      {msg && <div className={`sf-msg ${msg.k}`} role="status">{msg.t}</div>}
      {mode !== 'view' && (
        <div className="sf-bar" style={{ maxWidth: 560 }}>
          <div className="info" />
          <button type="button" className="sf-b ghost" onClick={() => { reset(); setMsg(null); }} disabled={busy}>Cancel</button>
          <button type="button" className={`sf-b ${mode === 'remove' ? 'ghost' : 'pri'}`} onClick={save} disabled={busy}>{busy ? 'Saving…' : mode === 'set' ? 'Set PIN' : mode === 'change' ? 'Change PIN' : 'Remove PIN'}</button>
        </div>
      )}
    </>
  );
}

/* every permission in the system, with this user's access to each — the ones they do not have show "Not authorized" */
const ACT_LABEL = { view: 'View', create: 'Create', edit: 'Edit', delete: 'Delete', approve: 'Approve' };
function PermissionsTab({ user }) {
  const [show, setShow] = useState('');
  const [q, setQ] = useState('');
  const admin = user?.role === 'admin', open = user && user.permissions == null && !admin;
  const cells = MODULES.flatMap(m => m.actions.map(a => can(user, m.key, a)));
  const yes = cells.filter(Boolean).length;
  const rowOk = m => m.actions.some(a => can(user, m.key, a));
  const rowAll = m => m.actions.every(a => can(user, m.key, a));
  const mods = MODULES.filter(m => (!q || `${m.label} ${m.group}`.toLowerCase().includes(q.toLowerCase()))
    && (show === 'full' ? rowAll(m) : show === 'some' ? rowOk(m) : show === 'none' ? !rowOk(m) : true));
  const groups = [...GROUP_ORDER, ...new Set(MODULES.map(m => m.group).filter(g => !GROUP_ORDER.includes(g)))];
  return (
    <>
      <div className="pf-sum">
        <div>Permissions you have<b style={{ color: '#067647' }}>{yes} of {cells.length}</b></div>
        <div>Not authorized<b style={{ color: '#B42318' }}>{cells.length - yes}</b></div>
        <div>Modules with access<b>{MODULES.filter(rowOk).length} of {MODULES.length}</b></div>
        <div className="grow" />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search module…" aria-label="Search module" />
        <select value={show} onChange={e => setShow(e.target.value)} aria-label="Show">
          <option value="">All modules</option><option value="full">Full access</option><option value="some">Any access</option><option value="none">Not authorized at all</option>
        </select>
      </div>
      {(admin || open) && <div className="sf-msg ok" style={{ marginTop: 10 }}>{admin ? 'You are an Admin — every permission is allowed.' : 'No permission list is set for you, so everything except Approve is allowed.'}</div>}
      <table className="pf-pt">
        <thead><tr><th style={{ width: '34%' }}>Module</th>{ALL_ACTIONS.map(a => <th key={a}>{ACT_LABEL[a]}</th>)}</tr></thead>
        <tbody>
          {groups.map(g => {
            const ms = mods.filter(m => m.group === g);
            if (!ms.length) return null;
            return (
              <React.Fragment key={g}>
                <tr className="grp"><td colSpan={1 + ALL_ACTIONS.length}>{g}</td></tr>
                {ms.map(m => (
                  <tr key={m.key}>
                    <td>{m.label}</td>
                    {ALL_ACTIONS.map(a => <td key={a}>{!m.actions.includes(a) ? <span className="pf-na" title="Not used for this module">—</span>
                      : can(user, m.key, a) ? <span className="pf-ok">✓ Allowed</span> : <span className="pf-no">Not authorized</span>}</td>)}
                  </tr>
                ))}
              </React.Fragment>
            );
          })}
          {!mods.length && <tr><td colSpan={1 + ALL_ACTIONS.length} style={{ textAlign: 'center', color: '#667085' }}>Nothing matches.</td></tr>}
        </tbody>
      </table>
      <div className="pf-hint" style={{ margin: '8px 2px 16px' }}>Only an admin can change permissions (Admin → User Management). “—” means the action is not used for that module.</div>
    </>
  );
}
