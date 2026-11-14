/* Sign-in page — one design for both looks (layout in components/auth/AuthShell).
 *   <LoginScreen />          /beta/login  — signing in opens the new (beta) look
 *   <LoginScreen classic />  /login       — signing in opens the classic look
 * Employee (company user) or Supplier (vendor portal). */
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useVendorAuth } from '../../context/VendorAuthContext';
import AuthShell, { Field, Alert, Btn, Svg } from '../../components/auth/AuthShell';
import { setUiVersion } from '../../utils/uiVersion';

const REMEMBER_KEY = 'login-remember';   // { mode, id } — only the user name / email, never the password
const readRemember = () => { try { return JSON.parse(localStorage.getItem(REMEMBER_KEY)) || null; } catch { return null; } };

export default function BetaLogin() { return <LoginScreen />; }

export function LoginScreen({ classic = false }) {
  const { login, user }         = useAuth();
  const { vendorLogin, vendor } = useVendorAuth();
  const navigate = useNavigate();
  const idRef = useRef(null), pwdRef = useRef(null);

  const saved = readRemember();
  const [mode, setMode]         = useState(saved?.mode === 'vendor' ? 'vendor' : 'company');
  const [id, setId]             = useState(saved?.id || '');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(!!saved);
  const [msg, setMsg]           = useState(null);
  const [phase, setPhase]       = useState(null);   // null | 'busy' | 'done'
  const [errN, setErrN]         = useState(0);      // counts errors — shakes the form

  // this person chose the new UI — the forgot / reset pages bring them back here
  useEffect(() => { if (!classic) setUiVersion('beta'); }, [classic]);
  useEffect(() => { if (user && !phase) navigate('/dashboard', { replace: true }); }, [user, phase, navigate]);
  useEffect(() => { if (vendor && !phase) navigate('/vendor-portal', { replace: true }); }, [vendor, phase, navigate]);
  useEffect(() => { (saved?.id ? pwdRef : idRef).current?.focus(); }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  const vendorMode = mode === 'vendor';
  const pick = m => {
    if (m === mode) return;
    setMode(m); setId(saved?.mode === m ? saved.id : ''); setPassword(''); setMsg(null);
    setTimeout(() => idRef.current?.focus(), 0);
  };

  const submit = async e => {
    e.preventDefault();
    const v = id.trim();
    if (!v || !password) {
      setErrN(n => n + 1);
      setMsg({ text: vendorMode ? 'Enter your registered email and password.' : 'Enter your user name and password.' });
      return;
    }
    setMsg(null); setPhase('busy');
    try {
      if (vendorMode) await vendorLogin(v, password);
      else { await login(v, password); if (classic) setUiVersion('classic'); }
      try {
        if (remember) localStorage.setItem(REMEMBER_KEY, JSON.stringify({ mode, id: v }));
        else localStorage.removeItem(REMEMBER_KEY);
      } catch { /* storage blocked — not needed to sign in */ }
      setPhase('done');
      setTimeout(() => navigate(vendorMode ? '/vendor-portal' : '/dashboard', { replace: true }), 400);
    } catch (err) {
      setPhase(null); setErrN(n => n + 1);
      setMsg({ text: err.response?.data?.error || 'Sign-in failed. Check your details and try again.' });
    }
  };

  const switchLook = () => { if (classic) navigate('/beta/login'); else { setUiVersion('classic'); navigate('/login'); } };

  return (
    <AuthShell
      shakeKey={errN}
      top={<>{classic ? 'Classic look' : 'New look'}<span style={{ opacity: .4 }}>|</span><button type="button" className="as-link" onClick={switchLook}>{classic ? 'Try the new look' : 'Switch to classic'}</button></>}
      title="Welcome Back!"
      subtitle={vendorMode ? 'Sign in to the Super ERP supplier portal' : 'Sign in to your Super ERP account'}
      mode={vendorMode ? <><Svg name="store" size={13} /> Supplier login</> : null}
    >
      <form onSubmit={submit} autoComplete="off" noValidate className="as-anim" key={mode}>
        <Alert msg={msg} />
        <Field id="bl-id" ref={idRef} icon={vendorMode ? 'mail' : 'user'} aria-label={vendorMode ? 'Email address' : 'User name'}
          type={vendorMode ? 'email' : 'text'} placeholder={vendorMode ? 'Email Address' : 'User Name'}
          value={id} onChange={e => { setId(e.target.value); setMsg(null); }} />
        <Field id="bl-pwd" ref={pwdRef} icon="lock" type="password" placeholder="Password" aria-label="Password"
          value={password} onChange={e => { setPassword(e.target.value); setMsg(null); }} />

        <div className="as-row">
          <label className="as-check">
            <input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} />
            <i /> Remember Me
          </label>
          <button type="button" className="as-link" onClick={() => navigate(vendorMode ? '/vendor-forgot-password' : '/forgot-password')}>Forgot Password?</button>
        </div>

        <Btn type="submit" kind={phase === 'done' ? 'ok' : 'pri'} busy={phase === 'busy'} busyText="Signing in…" disabled={phase === 'done'}>
          {phase === 'done' ? <><Svg name="check" size={20} stroke={2.4} /> Signed in</> : <><LoginIcon /> Login</>}
        </Btn>

        <div className="as-or">or</div>
        <Btn type="button" kind="out" onClick={() => pick(vendorMode ? 'company' : 'vendor')}>
          <Svg name={vendorMode ? 'biz' : 'store'} size={20} /> {vendorMode ? 'Continue as Employee' : 'Continue as Supplier'}
        </Btn>

        {vendorMode
          ? <div className="as-foot">New supplier?<button type="button" className="as-link" onClick={() => navigate('/vendor-register')}>Sign Up</button></div>
          : <div className="as-foot">Supplier without an account?<button type="button" className="as-link" onClick={() => navigate('/vendor-register')}>Sign Up</button></div>}
      </form>
    </AuthShell>
  );
}

/* "sign in" arrow-into-door icon (as in the design) */
const LoginIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4" /><path d="M10 17l5-5-5-5" /><path d="M15 12H4" />
  </svg>
);
