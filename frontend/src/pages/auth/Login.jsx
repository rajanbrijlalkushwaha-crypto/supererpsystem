import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useVendorAuth } from '../../context/VendorAuthContext';
import { setUiVersion } from '../../utils/uiVersion';

const F    = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const INK    = '#1F2A33';   // brand slate (logo colour)
const INK2   = '#33505F';
const ACCENT = '#EA580C';   // app accent orange

const MODULES = [
  { name:'CRM',        icon:'👥' }, { name:'Sales',      icon:'🧾' },
  { name:'Purchase',   icon:'🛒' }, { name:'Inventory',  icon:'📦' },
  { name:'Production', icon:'🏭' }, { name:'Projects',   icon:'📋' },
  { name:'Quality',    icon:'✅' }, { name:'Finance',    icon:'💰' },
  { name:'HR',         icon:'👤' }, { name:'Reports',    icon:'📊' },
];

const CSS = `
* { box-sizing:border-box; margin:0; padding:0; }
@keyframes spin360    { to{transform:rotate(360deg)} }
@keyframes riseIn     { from{opacity:0;transform:translateY(14px)} to{opacity:1;transform:none} }
@keyframes loginPop   { 0%{transform:scale(0.82);opacity:0} 100%{transform:scale(1);opacity:1} }
@keyframes loginFade  { 0%{opacity:0;transform:translateY(10px)} 100%{opacity:1;transform:none} }
@keyframes loginSpin  { to{transform:rotate(360deg)} }
@keyframes dot-bounce { 0%,80%,100%{transform:scale(0.6);opacity:0.4} 40%{transform:scale(1);opacity:1} }
@keyframes glow       { 0%,100%{opacity:0.55} 50%{opacity:0.9} }
.login-overlay-card { animation: loginPop 0.25s cubic-bezier(.34,1.56,.64,1) both; }
.login-step         { animation: loginFade 0.3s ease both; }
.login-spin-icon    { display:inline-block; animation: loginSpin 0.9s linear infinite; }

.lg-wrap  { min-height:100vh; min-height:calc(100vh / var(--ui-zoom, 1)); display:flex; font-family:${F}; background:#F3F5F8; }
.lg-brand { width:54%; flex-shrink:0; position:relative; overflow:hidden; color:#fff;
            background:linear-gradient(150deg, #17212A 0%, ${INK} 45%, ${INK2} 100%);
            display:flex; flex-direction:column; padding:44px 56px 28px; }
.lg-brand::before { content:''; position:absolute; inset:0; pointer-events:none;
            background-image:radial-gradient(rgba(255,255,255,0.07) 1px, transparent 1px);
            background-size:22px 22px; }
.lg-glow  { position:absolute; border-radius:50%; filter:blur(60px); pointer-events:none; animation:glow 6s ease-in-out infinite; }
.lg-mod   { display:flex; flex-direction:column; align-items:center; text-align:center; gap:7px; padding:14px 6px; border-radius:12px;
            background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.10);
            font-size:13px; font-weight:600; color:rgba(255,255,255,0.92);
            transition:background 0.2s, transform 0.2s; }
.lg-mod:hover { background:rgba(255,255,255,0.11); transform:translateY(-2px); }
.lg-mod-ic { width:30px; height:30px; border-radius:8px; background:rgba(255,255,255,0.10);
             display:flex; align-items:center; justify-content:center; font-size:15px; flex-shrink:0; }

.lg-side  { flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:32px 24px; }
.lg-card  { width:100%; max-width:410px; background:#fff; border-radius:18px; padding:34px 34px 26px;
            box-shadow:0 1px 2px rgba(16,24,40,0.04), 0 18px 48px rgba(16,24,40,0.10); animation:riseIn 0.45s ease both; }
.lg-seg   { display:flex; background:#EEF1F5; border-radius:10px; padding:4px; gap:4px; margin-bottom:22px; }
.lg-seg button { flex:1; height:34px; border:none; border-radius:8px; background:transparent; cursor:pointer;
            font-family:${F}; font-size:12.5px; font-weight:700; color:#5B6573; transition:all 0.15s; }
.lg-seg button.on { background:#fff; color:${INK}; box-shadow:0 1px 3px rgba(16,24,40,0.12); }
.lg-lbl   { display:block; font-size:12px; font-weight:700; color:#344054; margin-bottom:6px; }
.lg-field { position:relative; margin-bottom:16px; }
.lg-field .ic { position:absolute; left:12px; top:50%; transform:translateY(-50%); font-size:14px; color:#98A2B3; pointer-events:none; }
.lg-in    { width:100%; height:44px; padding:0 40px 0 38px; border:1.5px solid #D0D5DD; border-radius:10px;
            font-size:14px; font-family:${F}; color:#101828; background:#fff; outline:none;
            transition:border-color 0.15s, box-shadow 0.15s; }
.lg-in::placeholder { color:#98A2B3; }
.lg-in:focus { border-color:${INK2}; box-shadow:0 0 0 4px rgba(51,80,95,0.14); }
.lg-eye   { position:absolute; right:10px; top:50%; transform:translateY(-50%); background:none; border:none;
            cursor:pointer; font-size:12px; font-weight:700; color:#667085; font-family:${F}; padding:4px; }
.lg-btn   { width:100%; height:46px; border:none; border-radius:10px; cursor:pointer; margin-top:6px;
            background:linear-gradient(180deg, #F26B1D 0%, ${ACCENT} 100%); color:#fff;
            font-family:${F}; font-size:14.5px; font-weight:800; letter-spacing:0.2px;
            box-shadow:0 6px 16px rgba(234,88,12,0.32); transition:transform 0.12s, box-shadow 0.15s, opacity 0.15s; }
.lg-btn:hover:not(:disabled) { transform:translateY(-1px); box-shadow:0 10px 22px rgba(234,88,12,0.36); }
.lg-btn:disabled { opacity:0.65; cursor:not-allowed; }
.lg-link  { background:none; border:none; cursor:pointer; color:${INK2}; font-size:12.5px; font-weight:700; font-family:${F}; padding:0; }
.lg-link:hover { color:${ACCENT}; text-decoration:underline; }
.lg-beta  { width:100%; height:40px; margin-top:16px; border:1.5px dashed #C7D2FE; border-radius:10px; background:#F5F7FF; cursor:pointer;
            display:flex; align-items:center; justify-content:center; gap:8px; font-family:${F}; font-size:13px; font-weight:700; color:#4338CA;
            transition:all 0.15s; }
.lg-beta:hover { background:#EEF2FF; border-color:#818CF8; }
.lg-beta .tag { font-size:10px; font-weight:800; letter-spacing:0.6px; color:#fff; padding:2px 7px; border-radius:999px;
            background:linear-gradient(135deg,#4F46E5,#7C3AED); }

@media (max-width: 960px) {
  .lg-brand { display:none; }
}
@media (max-width: 460px) {
  .lg-card { padding:26px 20px 20px; border-radius:14px; }
}
`;

export default function Login() {
  const { login, user }         = useAuth();
  const { vendorLogin, vendor } = useVendorAuth();
  const navigate                = useNavigate();

  const [mode,       setMode]       = useState('company');
  const [username,   setUsername]   = useState('');
  const [email,      setEmail]      = useState('');
  const [password,   setPassword]   = useState('');
  const [showPwd,    setShowPwd]    = useState(false);
  const [error,      setError]      = useState('');
  const [loading,    setLoading]    = useState(false);
  const [loginPhase, setLoginPhase] = useState(null); // null | 'step1' | 'step2' | 'step3'
  const [destPath,   setDestPath]   = useState('/dashboard');

  // Only redirect if no animation is running
  useEffect(() => { if (user   && !loginPhase) navigate('/dashboard',     { replace:true }); }, [user,   navigate, loginPhase]);
  useEffect(() => { if (vendor && !loginPhase) navigate('/vendor-portal', { replace:true }); }, [vendor, navigate, loginPhase]);

  const runLoginAnimation = (dest) => {
    setDestPath(dest);
    setLoginPhase('step1');
    setTimeout(() => setLoginPhase('step2'), 1300);
    setTimeout(() => setLoginPhase('step3'), 2500);
    setTimeout(() => navigate(dest, { replace:true }), 3600);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      if (mode === 'company') {
        if (!username.trim() || !password) { setError('Please enter username and password.'); setLoading(false); return; }
        await login(username.trim(), password);
        setUiVersion('classic');   // signed in from the classic page → classic look
        setLoading(false);
        runLoginAnimation('/dashboard');
      } else {
        if (!email.trim() || !password) { setError('Please enter email and password.'); setLoading(false); return; }
        await vendorLogin(email.trim(), password);
        setLoading(false);
        runLoginAnimation('/vendor-portal');
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed. Please check your credentials.');
      setLoading(false);
    }
  };

  const LOGIN_STEPS = [
    { key:'step1', icon:'🔄', text:'Connecting to server...',        spin:true  },
    { key:'step2', icon:'🔐', text:'Authenticating credentials...',  spin:true  },
    { key:'step3', icon:'✅', text:'Successfully logged in!',        spin:false },
  ];
  const currentStep = LOGIN_STEPS.find(s => s.key === loginPhase);

  return (
    <>
      <style>{CSS}</style>

      {/* ── Login progress overlay ── */}
      {loginPhase && (
        <div style={{ position:'fixed', inset:0, zIndex:99999, display:'flex',
          alignItems:'center', justifyContent:'center',
          background:'rgba(10,20,40,0.65)', backdropFilter:'blur(8px)', fontFamily:F }}>
          <div className="login-overlay-card" style={{ background:'#fff', borderRadius:20,
            width:360, padding:'36px 32px', boxShadow:'0 28px 70px rgba(0,0,0,0.28)',
            display:'flex', flexDirection:'column', alignItems:'center', textAlign:'center' }}>

            {/* Animated icon */}
            <div style={{ width:72, height:72, borderRadius:18, marginBottom:20,
              background: loginPhase==='step3'
                ? 'linear-gradient(135deg,#16a34a,#15803d)'
                : loginPhase==='step2'
                ? 'linear-gradient(135deg,#7c3aed,#6d28d9)'
                : 'linear-gradient(135deg,#1e40af,#1d4ed8)',
              display:'flex', alignItems:'center', justifyContent:'center',
              boxShadow: loginPhase==='step3' ? '0 10px 28px rgba(22,163,74,0.4)'
                       : loginPhase==='step2' ? '0 10px 28px rgba(124,58,237,0.4)'
                       : '0 10px 28px rgba(30,64,175,0.4)',
              transition:'all 0.4s ease' }}>
              <span style={{ fontSize:32, lineHeight:1 }}
                className={currentStep?.spin ? 'login-spin-icon' : ''}>
                {currentStep?.icon}
              </span>
            </div>

            {/* Step text */}
            <div key={loginPhase} className="login-step">
              <div style={{ fontSize:16, fontWeight:800, color:'#0f172a', marginBottom:8 }}>
                {currentStep?.text}
              </div>
              {loginPhase !== 'step3' ? (
                <div style={{ display:'flex', justifyContent:'center', gap:6, marginTop:10 }}>
                  {[0,1,2].map(i => (
                    <div key={i} style={{ width:8, height:8, borderRadius:'50%',
                      background: loginPhase==='step2' ? '#7c3aed' : '#3b82f6',
                      animation:`dot-bounce 1.2s ease-in-out ${i*0.2}s infinite` }} />
                  ))}
                </div>
              ) : (
                <div style={{ fontSize:12.5, color:'#16a34a', fontWeight:600, marginTop:4 }}>
                  Redirecting you to the dashboard…
                </div>
              )}
            </div>

            {/* ERP name at bottom */}
            <div style={{ marginTop:24, fontSize:11, color:'#94a3b8', fontWeight:600,
              letterSpacing:'0.3px', borderTop:'1px solid #f1f5f9', paddingTop:14, width:'100%' }}>
              Super ERP System
            </div>
          </div>
        </div>
      )}

      <div className="lg-wrap">

        {/* ══════════ LEFT — brand panel ══════════ */}
        <div className="lg-brand">
          <div className="lg-glow" style={{ width:340, height:340, top:-90, right:-60, background:'rgba(234,88,12,0.30)' }} />
          <div className="lg-glow" style={{ width:380, height:380, bottom:-140, left:-100, background:'rgba(56,189,248,0.18)', animationDelay:'3s' }} />

          <div style={{ position:'relative', display:'flex', alignItems:'center', gap:12 }}>
            <div style={{ width:42, height:42, borderRadius:12, background:ACCENT, display:'flex', alignItems:'center', justifyContent:'center',
              fontSize:20, boxShadow:'0 8px 20px rgba(234,88,12,0.45)' }}>⚡</div>
            <div>
              <div style={{ fontSize:16, fontWeight:800, letterSpacing:'0.2px' }}>Super ERP System</div>
              <div style={{ fontSize:10.5, color:'rgba(255,255,255,0.6)', letterSpacing:'1.5px', textTransform:'uppercase' }}>Epsilon Group</div>
            </div>
          </div>

          <div style={{ position:'relative', flex:1, display:'flex', flexDirection:'column', justifyContent:'center', maxWidth:680 }}>
            <div style={{ display:'inline-flex', alignSelf:'flex-start', alignItems:'center', gap:8, padding:'5px 12px', borderRadius:20,
              background:'rgba(255,255,255,0.08)', border:'1px solid rgba(255,255,255,0.14)', fontSize:11.5, fontWeight:700,
              color:'rgba(255,255,255,0.85)', marginBottom:18 }}>
              <span style={{ width:7, height:7, borderRadius:'50%', background:'#22C55E', boxShadow:'0 0 0 3px rgba(34,197,94,0.25)' }} />
              Version 2.0.1
            </div>
            <h1 style={{ fontSize:40, lineHeight:1.12, fontWeight:800, letterSpacing:'-0.8px', margin:0 }}>
              Super ERP<br/>
              <span style={{ color:'#FDBA74' }}>System</span>
            </h1>
            <p style={{ fontSize:15, lineHeight:1.6, color:'rgba(255,255,255,0.72)', marginTop:14, maxWidth:470 }}>
              One place for sales, purchase, inventory, production, projects and accounts — from enquiry to final payment.
            </p>

            <div style={{ display:'grid', gridTemplateColumns:'repeat(5, minmax(0, 1fr))', gap:10, marginTop:30, maxWidth:680 }}>
              {MODULES.map(m => (
                <div key={m.name} className="lg-mod">
                  <span className="lg-mod-ic">{m.icon}</span>{m.name}
                </div>
              ))}
            </div>
          </div>

          <div style={{ position:'relative', fontSize:11, color:'rgba(255,255,255,0.5)', display:'flex', justifyContent:'space-between', gap:12 }}>
            <span>© {new Date().getFullYear()} Epsilon Group · epsilonprefab.org</span>
            <span>Secure sign-in</span>
          </div>
        </div>

        {/* ══════════ RIGHT — sign-in card ══════════ */}
        <div className="lg-side">
          <div className="lg-card">
            <div style={{ textAlign:'center', marginBottom:22 }}>
              <img src="/brand/client-logo.png" alt="Epsilon" style={{ height:38, maxWidth:'100%', objectFit:'contain' }} />
              <div style={{ fontSize:21, fontWeight:800, color:'#101828', marginTop:18, letterSpacing:'-0.3px' }}>Sign in</div>
              <div style={{ fontSize:13, color:'#667085', marginTop:4 }}>
                {mode === 'vendor' ? 'Vendor Portal — use your registered email' : 'Welcome back — sign in to continue'}
              </div>
            </div>

            {/* Company user / Vendor portal */}
            <div className="lg-seg" role="tablist">
              <button type="button" role="tab" aria-selected={mode==='company'} className={mode==='company' ? 'on' : ''}
                onClick={() => { setMode('company'); setError(''); }}>🏢 Company User</button>
              <button type="button" role="tab" aria-selected={mode==='vendor'} className={mode==='vendor' ? 'on' : ''}
                onClick={() => { setMode('vendor'); setError(''); }}>🤝 Vendor Portal</button>
            </div>

            <form onSubmit={handleSubmit} autoComplete="off">
              <label className="lg-lbl" htmlFor="lg-user">{mode === 'vendor' ? 'Email address' : 'User name'}</label>
              <div className="lg-field">
                <span className="ic">{mode === 'vendor' ? '✉' : '👤'}</span>
                {mode === 'vendor' ? (
                  <input id="lg-user" type="email" autoFocus value={email} className="lg-in" placeholder="name@company.com"
                    onChange={e => { setEmail(e.target.value); setError(''); }} />
                ) : (
                  <input id="lg-user" type="text" autoFocus value={username} className="lg-in" placeholder="Enter your user name"
                    onChange={e => { setUsername(e.target.value); setError(''); }} />
                )}
              </div>

              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline' }}>
                <label className="lg-lbl" htmlFor="lg-pwd">Password</label>
                <button type="button" className="lg-link" style={{ fontSize:12 }}
                  onClick={() => navigate(mode === 'vendor' ? '/vendor-forgot-password' : '/forgot-password')}>
                  Forgot password?
                </button>
              </div>
              <div className="lg-field">
                <span className="ic">🔒</span>
                <input id="lg-pwd" type={showPwd ? 'text' : 'password'} value={password} className="lg-in" placeholder="Enter your password"
                  onChange={e => { setPassword(e.target.value); setError(''); }} />
                <button type="button" className="lg-eye" onClick={() => setShowPwd(p => !p)} aria-label={showPwd ? 'Hide password' : 'Show password'}>
                  {showPwd ? 'HIDE' : 'SHOW'}
                </button>
              </div>

              {error && (
                <div role="alert" style={{ marginBottom:12, padding:'9px 12px', background:'#FEF3F2', border:'1px solid #FECDCA',
                  borderRadius:10, fontSize:12.5, color:'#B42318', display:'flex', alignItems:'center', gap:8 }}>
                  <span>⚠</span> {error}
                </div>
              )}

              <button type="submit" disabled={loading} className="lg-btn">
                {loading ? (
                  <span style={{ display:'inline-flex', alignItems:'center', gap:8 }}>
                    <span style={{ width:14, height:14, border:'2px solid rgba(255,255,255,0.45)', borderTopColor:'#fff', borderRadius:'50%',
                      display:'inline-block', animation:'spin360 0.6s linear infinite' }} />
                    Signing in…
                  </span>
                ) : (mode === 'vendor' ? 'Sign in to Vendor Portal' : 'Sign in')}
              </button>

              {mode === 'vendor' && (
                <div style={{ textAlign:'center', marginTop:16, fontSize:12.5, color:'#667085' }}>
                  New supplier?{' '}
                  <button type="button" className="lg-link" onClick={() => navigate('/vendor-register')}>Register as Vendor</button>
                </div>
              )}
            </form>

            <button type="button" className="lg-beta" onClick={() => navigate('/beta/login')} title="Try the new design (same login)">
              <span className="tag">BETA</span> Try the new UI <span aria-hidden="true">→</span>
            </button>

            <div style={{ borderTop:'1px solid #EAECF0', marginTop:18, paddingTop:14, textAlign:'center', fontSize:11, color:'#98A2B3' }}>
              Super ERP System · Version 2.0.1
            </div>
          </div>
          <div style={{ fontSize:11, color:'#98A2B3', marginTop:16, textAlign:'center' }}>
            © {new Date().getFullYear()} Epsilon Group Limited. All rights reserved.
          </div>
        </div>

      </div>
    </>
  );
}
