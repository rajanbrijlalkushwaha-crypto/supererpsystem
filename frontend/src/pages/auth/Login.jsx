import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useVendorAuth } from '../../context/VendorAuthContext';

const F    = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const TEAL = '#0d5c5c';
const TEAL2= '#14837e';

const ICONS = {
  CRM:        { bg:'#e0f2fe', fg:'#0369a1', symbol:'👥' },
  ERP:        { bg:'#ede9fe', fg:'#7c3aed', symbol:'⚡' },
  Projects:   { bg:'#fef3c7', fg:'#d97706', symbol:'📋' },
  Production: { bg:'#dcfce7', fg:'#16a34a', symbol:'🏭' },
  Quality:    { bg:'#fff1f2', fg:'#e11d48', symbol:'✅' },
  Testing:    { bg:'#f0fdf4', fg:'#15803d', symbol:'🧪' },
  Finance:    { bg:'#fdf4ff', fg:'#9333ea', symbol:'💰' },
  Inventory:  { bg:'#fff7ed', fg:'#ea580c', symbol:'📦' },
  HR:         { bg:'#fce7f3', fg:'#db2777', symbol:'👤' },
  Reports:    { bg:'#e0f7fa', fg:'#0097a7', symbol:'📊' },
};
const INNER = ['CRM','ERP','Projects','Production','Quality'];
const OUTER = ['Finance','Inventory','HR','Reports','Testing'];

const CSS = `
* { box-sizing:border-box; margin:0; padding:0; }
@keyframes orbitInner { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
@keyframes orbitOuter { from{transform:rotate(0deg)} to{transform:rotate(-360deg)} }
@keyframes counterIn  { from{transform:rotate(0deg)} to{transform:rotate(-360deg)} }
@keyframes counterOut { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
@keyframes centerPulse {
  0%,100%{box-shadow:0 0 0 0 rgba(13,92,92,0.25),0 12px 40px rgba(13,92,92,0.2);}
  50%{box-shadow:0 0 0 16px rgba(13,92,92,0),0 12px 40px rgba(13,92,92,0.25);}
}
@keyframes bgDrift {
  0%{background-position:0% 50%} 50%{background-position:100% 50%} 100%{background-position:0% 50%}
}
@keyframes spin360    { to{transform:rotate(360deg)} }
@keyframes slideIn    { from{opacity:0;transform:translateX(30px)} to{opacity:1;transform:translateX(0)} }
@keyframes loginPop   { 0%{transform:scale(0.82);opacity:0} 100%{transform:scale(1);opacity:1} }
@keyframes loginFade  { 0%{opacity:0;transform:translateY(10px)} 100%{opacity:1;transform:none} }
@keyframes loginSpin  { to{transform:rotate(360deg)} }
@keyframes dot-bounce { 0%,80%,100%{transform:scale(0.6);opacity:0.4} 40%{transform:scale(1);opacity:1} }
.login-overlay-card { animation: loginPop 0.25s cubic-bezier(.34,1.56,.64,1) both; }
.login-step         { animation: loginFade 0.3s ease both; }
.login-spin-icon    { display:inline-block; animation: loginSpin 0.9s linear infinite; }

.login-wrapper { height:100vh; overflow-y:auto; }
.login-left  { width:60%; flex-shrink:0; }
.login-right { width:40%; flex-shrink:0; }

@media (max-width: 860px) {
  .login-wrapper { height:auto; min-height:100vh; }
  .login-left  { display:none !important; }
  .login-right { width:100% !important; min-width:0 !important; }
}
@media (max-width: 480px) {
  .login-right .fin-content { padding:20px 24px 16px !important; }
}

.fin-field {
  width:100%; height:30px; padding:0 10px;
  border:1.5px solid #AAAAAA;
  font-size:13.5px; font-family:${F};
  background:#FFFFFF; color:#111; outline:none;
  border-radius:2px;
  transition:border-color 0.15s, box-shadow 0.15s;
}
.fin-field:focus {
  border-color:#3A6186;
  box-shadow:0 0 0 3px rgba(58,97,134,0.15);
}
.fin-select {
  height:30px; padding:0 8px;
  border:1.5px solid #AAAAAA; border-radius:2px;
  font-size:13px; font-family:${F};
  background:#FFFFFF; color:#111; cursor:pointer; outline:none;
  min-width:130px;
}
.fin-btn {
  height:30px; padding:0 22px;
  background:linear-gradient(180deg,#4A7FAA 0%,#2D5F8A 100%);
  border:1px solid #1E4A70;
  font-size:13px; font-family:${F}; font-weight:700;
  cursor:pointer; color:#fff; border-radius:3px;
  letter-spacing:0.3px;
  transition:all 0.15s;
  box-shadow:0 2px 4px rgba(0,0,0,0.25);
}
.fin-btn:hover:not(:disabled) {
  background:linear-gradient(180deg,#5A8FBA 0%,#3D6F9A 100%);
}
.fin-btn:disabled { opacity:0.6; cursor:not-allowed; }
`;

function OrbitRing({ radius, modules, duration, reverse, iconSize=52 }) {
  return (
    <div style={{
      position:'absolute', width:radius*2, height:radius*2,
      top:'50%', left:'50%', marginTop:-radius, marginLeft:-radius,
      borderRadius:'50%', border:'1.5px dashed rgba(13,92,92,0.12)',
      animation:`${reverse?'orbitOuter':'orbitInner'} ${duration}s linear infinite`,
    }}>
      {modules.map((name,i) => {
        const angle=(2*Math.PI*i)/modules.length;
        const x=radius+radius*Math.cos(angle)-iconSize/2;
        const y=radius+radius*Math.sin(angle)-iconSize/2;
        const m=ICONS[name];
        return (
          <div key={name} style={{
            position:'absolute', left:x, top:y,
            width:iconSize, height:iconSize,
            animation:`${reverse?'counterOut':'counterIn'} ${duration}s linear infinite`,
          }}>
            <div style={{
              width:'100%', height:'100%', borderRadius:16,
              background:m.bg, display:'flex', flexDirection:'column',
              alignItems:'center', justifyContent:'center',
              boxShadow:'0 4px 14px rgba(0,0,0,0.1)',
              border:`1.5px solid ${m.fg}22`,
            }}>
              <span style={{ fontSize:iconSize*0.36, lineHeight:1 }}>{m.symbol}</span>
              <span style={{ fontSize:9, fontWeight:700, color:m.fg, marginTop:3, letterSpacing:'0.02em' }}>
                {name.toUpperCase()}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

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
              Universal Core ERP Solutions
            </div>
          </div>
        </div>
      )}

      <div className="login-wrapper" style={{ display:'flex', fontFamily:F, background:'#fff' }}>

        {/* ══════════ LEFT — orbit animation ══════════ */}
        <div className="login-left" style={{
          position:'relative', display:'flex',
          flexDirection:'column', alignItems:'center', justifyContent:'center',
          background:'#EDEAE4',
          overflow:'hidden', minHeight:'100vh',
        }}>
          <div style={{ position:'absolute', top:'-8%', left:'-6%', width:300, height:300, borderRadius:'50%', background:'radial-gradient(circle,rgba(13,92,92,0.06),transparent 70%)', pointerEvents:'none' }} />
          <div style={{ position:'absolute', bottom:'-8%', right:'-5%', width:340, height:340, borderRadius:'50%', background:'radial-gradient(circle,rgba(20,131,126,0.05),transparent 70%)', pointerEvents:'none' }} />

          <div style={{ position:'relative', width:360, height:360 }}>
            <OrbitRing radius={160} modules={OUTER} duration={28} reverse iconSize={40} />
            <OrbitRing radius={102} modules={INNER} duration={18} reverse={false} iconSize={42} />
            <div style={{
              position:'absolute', top:'50%', left:'50%',
              width:80, height:80, marginTop:-40, marginLeft:-40,
              borderRadius:20, background:`linear-gradient(135deg,${TEAL2},${TEAL})`,
              display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
              boxShadow:'0 8px 28px rgba(13,92,92,0.3)',
              animation:'centerPulse 3s ease-in-out infinite', zIndex:10,
            }}>
              <span style={{ fontSize:26, lineHeight:1 }}>⚡</span>
              <span style={{ fontSize:8, fontWeight:800, color:'#fff', marginTop:4, letterSpacing:'0.08em' }}>EPSILON</span>
            </div>
          </div>

          <div style={{ textAlign:'center', marginTop:20, position:'relative', zIndex:2 }}>
            <div style={{ fontSize:24, fontWeight:800, color:TEAL, letterSpacing:'-0.3px' }}>Universal Core ERP Solutions</div>
            <div style={{ fontSize:12.5, color:'#64748b', marginTop:6, fontWeight:500 }}>
              Enterprise Resource Planning · CRM · Production · Quality
            </div>
          </div>
          <div style={{ position:'absolute', bottom:14, fontSize:10.5, color:'#94a3b8' }}>
            © 2025 Epsilon Enterprise · epsilonprefab.org
          </div>
        </div>

        {/* ══════════ RIGHT — Finacle-style login panel ══════════ */}
        <div className="login-right" style={{
          position:'relative', minHeight:'100vh',
          display:'flex', flexDirection:'column',
          background:'#ffffff',
          boxShadow:'-8px 0 40px rgba(0,0,0,0.22)',
          overflow:'hidden',
          animation:'slideIn 0.5s ease both',
        }}>

          {/* Red decorative triangle — exact Finacle signature shape */}
          <svg style={{ position:'absolute', bottom:0, left:0, display:'block', zIndex:1 }}
            width="160" height="240" viewBox="0 0 160 240">
            <polygon points="0,240 160,240 0,0" fill="#CC0000"/>
          </svg>

          {/* Subtle top border */}
          <div style={{ height:4, background:'linear-gradient(90deg,#CC0000,#3A6186)', position:'relative', zIndex:3 }} />

          {/* ── Top-right brand logo (like Finacle red logo) ── */}
          <div style={{ padding:'20px 28px 0', textAlign:'right', position:'relative', zIndex:3 }}>
            <div style={{ display:'inline-flex', alignItems:'center', gap:10 }}>
              <div>
                <div style={{ display:'flex', alignItems:'center', gap:8, justifyContent:'flex-end' }}>
                  {/* Red square logo */}
                  <div style={{
                    width:36, height:36, background:'#CC0000', borderRadius:4,
                    display:'flex', alignItems:'center', justifyContent:'center',
                    boxShadow:'0 3px 10px rgba(204,0,0,0.35)',
                  }}>
                    <span style={{ fontSize:18, color:'#fff', fontWeight:900, lineHeight:1 }}>⚡</span>
                  </div>
                  <div style={{ textAlign:'right' }}>
                    <div style={{ fontSize:19, fontWeight:900, color:'#CC0000', letterSpacing:'-0.3px', lineHeight:1 }}>
                      Finacle ERP
                    </div>
                    <div style={{ fontSize:9, color:'#888', letterSpacing:'1px', marginTop:2, fontStyle:'italic' }}>
                      Transforming Business
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ── Main content ── */}
          <div className="fin-content" style={{ flex:1, display:'flex', flexDirection:'column', justifyContent:'center',
            padding:'24px 52px 20px 52px', position:'relative', zIndex:3 }}>

            {/* Title — exact Finacle style */}
            <div style={{ marginBottom:40 }}>
              <h1 style={{ fontSize:28, color:'#111', lineHeight:1.25, margin:0, letterSpacing:'-0.5px' }}>
                <span style={{ fontWeight:300 }}>Universal Core </span>
                <span style={{ fontWeight:900 }}>ERP Solution</span>
              </h1>
              <div style={{ fontSize:14, color:'#777', textAlign:'right', marginTop:6, fontStyle:'italic' }}>
                Version 2.0.1
              </div>
              <div style={{ width:'100%', height:1, background:'linear-gradient(90deg,transparent,#AAAAAA,transparent)', marginTop:16 }} />
            </div>

            {/* ── Finacle-style classic form ── */}
            <form onSubmit={handleSubmit} autoComplete="off">
              <table style={{ borderCollapse:'collapse', width:'100%' }}>
                <tbody>

                  {/* User Name / Email */}
                  <tr>
                    <td style={{ padding:'9px 0', paddingRight:18, fontSize:13.5, fontWeight:600,
                      color:'#2C2C2C', whiteSpace:'nowrap', verticalAlign:'middle', width:110 }}>
                      {mode === 'vendor' ? 'Email:' : 'User Name:'}
                    </td>
                    <td style={{ padding:'9px 0', verticalAlign:'middle' }}>
                      {mode === 'vendor' ? (
                        <input type="email" autoFocus value={email} className="fin-field"
                          onChange={e => { setEmail(e.target.value); setError(''); }} />
                      ) : (
                        <input type="text" autoFocus value={username} className="fin-field"
                          onChange={e => { setUsername(e.target.value); setError(''); }} />
                      )}
                    </td>
                  </tr>

                  {/* Password */}
                  <tr>
                    <td style={{ padding:'9px 0', paddingRight:18, fontSize:13.5, fontWeight:600, color:'#2C2C2C', verticalAlign:'middle' }}>
                      Password:
                    </td>
                    <td style={{ padding:'9px 0', verticalAlign:'middle', position:'relative' }}>
                      <div style={{ position:'relative' }}>
                        <input type={showPwd ? 'text' : 'password'} value={password} className="fin-field"
                          onChange={e => { setPassword(e.target.value); setError(''); }}
                          style={{ paddingRight:36 }} />
                        <button type="button" onClick={() => setShowPwd(p=>!p)}
                          style={{ position:'absolute', right:8, top:'50%', transform:'translateY(-50%)',
                            background:'none', border:'none', cursor:'pointer', fontSize:13, color:'#888', padding:0, lineHeight:1 }}>
                          {showPwd ? '🙈' : '👁️'}
                        </button>
                      </div>
                    </td>
                  </tr>

                  {/* Login As + Login button (like Language + Login in Finacle) */}
                  <tr>
                    <td style={{ padding:'9px 0', paddingRight:18, fontSize:13.5, fontWeight:600, color:'#2C2C2C', verticalAlign:'middle' }}>
                      Login As:
                    </td>
                    <td style={{ padding:'9px 0', verticalAlign:'middle' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                        <select className="fin-select" value={mode} onChange={e => { setMode(e.target.value); setError(''); }}>
                          <option value="company">Company User</option>
                          <option value="vendor">Vendor Portal</option>
                        </select>
                        <button type="submit" disabled={loading} className="fin-btn">
                          {loading ? (
                            <span style={{ display:'inline-flex', alignItems:'center', gap:6 }}>
                              <span style={{ width:12, height:12, border:'2px solid rgba(255,255,255,0.4)', borderTopColor:'#fff', borderRadius:'50%', display:'inline-block', animation:'spin360 0.6s linear infinite' }} />
                              Wait…
                            </span>
                          ) : 'Login'}
                        </button>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>

              {/* Error message */}
              {error && (
                <div style={{ marginTop:14, padding:'8px 12px',
                  background:'#FEE2E2', border:'1px solid #FCA5A5', borderLeft:'3px solid #DC2626',
                  fontSize:12.5, color:'#DC2626', borderRadius:3, display:'flex', alignItems:'center', gap:6 }}>
                  <span>⚠</span> {error}
                </div>
              )}

              {/* Links */}
              <div style={{ marginTop:16, display:'flex', gap:16 }}>
                <button type="button"
                  onClick={() => navigate(mode === 'vendor' ? '/vendor-forgot-password' : '/forgot-password')}
                  style={{ background:'none', border:'none', cursor:'pointer', color:'#3A6186',
                    fontSize:12, textDecoration:'underline', fontFamily:F, padding:0 }}>
                  Forgot Password?
                </button>
                {mode === 'vendor' && (
                  <button type="button" onClick={() => navigate('/vendor-register')}
                    style={{ background:'none', border:'none', cursor:'pointer', color:'#3A6186',
                      fontSize:12, textDecoration:'underline', fontFamily:F, padding:0 }}>
                    Register as Vendor
                  </button>
                )}
              </div>
            </form>
          </div>

          {/* ── Bottom: Epsilongroup brand (like "Infosys" in Finacle) ── */}
          <div style={{ textAlign:'right', padding:'0 28px 10px', position:'relative', zIndex:3 }}>
            <div style={{
              fontSize:28, fontWeight:900, color:'#003580',
              fontStyle:'italic', letterSpacing:'-0.5px', lineHeight:1,
              textShadow:'0 1px 2px rgba(0,53,128,0.15)',
            }}>
              Epsilongroup
            </div>
          </div>

          {/* Copyright */}
          <div style={{ textAlign:'center', fontSize:10, color:'#888', padding:'0 20px 14px', position:'relative', zIndex:3, lineHeight:1.6 }}>
            Copyright © 2024–2025 Epsilon Group Limited. All rights reserved. epsilonprefab.org
          </div>
        </div>

      </div>
    </>
  );
}
