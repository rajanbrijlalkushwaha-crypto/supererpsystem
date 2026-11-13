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
import { PRODUCT_NAME, PRODUCT_VERSION } from '../../utils/brand';

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
      kicker={vendorMode ? 'Supplier portal' : `${PRODUCT_NAME} · v${PRODUCT_VERSION}`}
      heading={vendorMode ? <>Work with us on <em>every order</em>, end to end.</> : <>One platform to run your <em>entire business</em>.</>}
      text={vendorMode
        ? 'Track purchase orders, share dispatch details and follow every payment — in one secure place.'
        : 'Sales, purchase, inventory, projects, accounts and HR on a single connected system, with Tally reconciliation built in.'}
      modules
      shakeKey={errN}
      top={<>{classic ? 'Classic look' : 'New look (beta)'}<span style={{ color: '#D0D5DD' }}>|</span><button type="button" className="as-link" onClick={switchLook}>{classic ? 'Try the new look' : 'Switch to classic'}</button></>}
      title="Sign in"
      subtitle={vendorMode ? 'Use the email address you registered with.' : 'Welcome back. Enter your credentials to continue.'}
    >
      <div className="as-tabs" role="tablist" aria-label="Account type">
        <button type="button" role="tab" aria-selected={!vendorMode} className={!vendorMode ? 'on' : ''} onClick={() => pick('company')}>
          <Svg name="biz" size={15} /> Employee
        </button>
        <button type="button" role="tab" aria-selected={vendorMode} className={vendorMode ? 'on' : ''} onClick={() => pick('vendor')}>
          <Svg name="store" size={15} /> Supplier
        </button>
      </div>

      <form onSubmit={submit} autoComplete="off" noValidate className="as-anim" key={mode}>
        <Alert msg={msg} />
        <Field id="bl-id" ref={idRef} label={vendorMode ? 'Email address' : 'User name'} icon={vendorMode ? 'mail' : 'user'}
          type={vendorMode ? 'email' : 'text'} placeholder={vendorMode ? 'name@company.com' : 'Enter your user name'}
          value={id} onChange={e => { setId(e.target.value); setMsg(null); }} />
        <Field id="bl-pwd" ref={pwdRef} label="Password" icon="lock" type="password" placeholder="Enter your password"
          value={password} onChange={e => { setPassword(e.target.value); setMsg(null); }} />

        <div className="as-row">
          <label className="as-check">
            <input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} />
            <i /> Remember me
          </label>
          <button type="button" className="as-link" onClick={() => navigate(vendorMode ? '/vendor-forgot-password' : '/forgot-password')}>Forgot password?</button>
        </div>

        <Btn type="submit" kind={phase === 'done' ? 'ok' : 'pri'} busy={phase === 'busy'} busyText="Signing in…" disabled={phase === 'done'}>
          {phase === 'done' ? <><Svg name="check" size={17} stroke={2.4} /> Signed in</> : <>Sign in <Svg name="arrow" size={17} /></>}
        </Btn>

        {vendorMode ? (
          <div className="as-foot">New supplier?<button type="button" className="as-link" onClick={() => navigate('/vendor-register')}>Register your business</button></div>
        ) : (
          <div className="as-foot">Supplier?<button type="button" className="as-link" onClick={() => pick('vendor')}>Sign in to the supplier portal</button></div>
        )}

        <div className="as-notice">
          <Svg name="shield" size={15} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>This system is for authorised users only. Keep your password private and sign out on shared computers.</span>
        </div>
      </form>
    </AuthShell>
  );
}
