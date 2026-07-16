import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

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
@keyframes spin360  { to{transform:rotate(360deg)} }
@keyframes slideIn  { from{opacity:0;transform:translateX(30px)} to{opacity:1;transform:translateX(0)} }

.rp-wrapper { height:100vh; overflow-y:auto; }
.rp-left    { width:60%; flex-shrink:0; }
.rp-right   { width:40%; flex-shrink:0; }

@media (max-width: 860px) {
  .rp-wrapper { height:auto; min-height:100vh; }
  .rp-left    { display:none !important; }
  .rp-right   { width:100% !important; min-width:0 !important; }
}
@media (max-width: 480px) {
  .rp-right .fin-content { padding:20px 24px 16px !important; }
}

.rp-field {
  width:100%; height:30px; padding:0 10px;
  border:1.5px solid #AAAAAA;
  font-size:13.5px; font-family:${F};
  background:#FFFFFF; color:#111; outline:none;
  border-radius:2px;
  transition:border-color 0.15s, box-shadow 0.15s;
}
.rp-field:focus {
  border-color:#3A6186;
  box-shadow:0 0 0 3px rgba(58,97,134,0.15);
}
.rp-field.err { border-color:#DC2626 !important; }
.rp-btn {
  height:30px; padding:0 22px;
  background:linear-gradient(180deg,#4A7FAA 0%,#2D5F8A 100%);
  border:1px solid #1E4A70;
  font-size:13px; font-family:${F}; font-weight:700;
  cursor:pointer; color:#fff; border-radius:3px;
  letter-spacing:0.3px; transition:all 0.15s;
  box-shadow:0 2px 4px rgba(0,0,0,0.25);
}
.rp-btn:hover:not(:disabled) { background:linear-gradient(180deg,#5A8FBA 0%,#3D6F9A 100%); }
.rp-btn:disabled { opacity:0.6; cursor:not-allowed; }
.rp-link {
  background:none; border:none; cursor:pointer; color:#3A6186;
  font-size:12px; text-decoration:underline; font-family:${F}; padding:0;
}
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
            position:'absolute', left:x, top:y, width:iconSize, height:iconSize,
            animation:`${reverse?'counterOut':'counterIn'} ${duration}s linear infinite`,
          }}>
            <div style={{
              width:'100%', height:'100%', borderRadius:16,
              background:m.bg, display:'flex', flexDirection:'column',
              alignItems:'center', justifyContent:'center',
              boxShadow:'0 4px 14px rgba(0,0,0,0.1)', border:`1.5px solid ${m.fg}22`,
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

export default function ResetPassword() {
  const navigate          = useNavigate();
  const [params]          = useSearchParams();
  const token             = params.get('token') || '';

  const [status, setStatus]   = useState('verifying');
  const [email, setEmail]     = useState('');
  const [pwd, setPwd]         = useState('');
  const [confPwd, setConfPwd] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg]         = useState(null);

  useEffect(() => {
    if (!token) { setStatus('invalid'); return; }
    fetch(`/api/auth/verify-reset-token/${token}`)
      .then(r => r.json())
      .then(d => { if (d.valid) { setEmail(d.email); setStatus('valid'); } else setStatus('invalid'); })
      .catch(() => setStatus('invalid'));
  }, [token]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!pwd || pwd.length < 6) { setMsg('Password must be at least 6 characters.'); return; }
    if (pwd !== confPwd) { setMsg('Passwords do not match.'); return; }
    setLoading(true); setMsg(null);
    try {
      const res  = await fetch('/api/auth/reset-password', {
        method:'POST', headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify({ token, password: pwd }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Reset failed');
      setStatus('done');
    } catch (err) { setMsg(err.message); }
    finally { setLoading(false); }
  };

  return (
    <>
      <style>{CSS}</style>
      <div className="rp-wrapper" style={{ display:'flex', fontFamily:F, background:'#fff' }}>

        {/* ══ LEFT — same orbit panel as login ══ */}
        <div className="rp-left" style={{
          position:'relative', display:'flex', flexDirection:'column',
          alignItems:'center', justifyContent:'center',
          background:'#EDEAE4', overflow:'hidden', minHeight:'100vh',
        }}>
          <div style={{ position:'absolute', top:'-8%', left:'-6%', width:300, height:300, borderRadius:'50%', background:'radial-gradient(circle,rgba(13,92,92,0.06),transparent 70%)', pointerEvents:'none' }}/>
          <div style={{ position:'absolute', bottom:'-8%', right:'-5%', width:340, height:340, borderRadius:'50%', background:'radial-gradient(circle,rgba(20,131,126,0.05),transparent 70%)', pointerEvents:'none' }}/>

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

        {/* ══ RIGHT — Finacle-style panel ══ */}
        <div className="rp-right" style={{
          position:'relative', minHeight:'100vh',
          display:'flex', flexDirection:'column',
          background:'#ffffff', boxShadow:'-8px 0 40px rgba(0,0,0,0.22)',
          overflow:'hidden', animation:'slideIn 0.5s ease both',
        }}>

          {/* Red triangle — bottom-left (identical to login) */}
          <svg style={{ position:'absolute', bottom:0, left:0, display:'block', zIndex:1 }}
            width="160" height="240" viewBox="0 0 160 240">
            <polygon points="0,240 160,240 0,0" fill="#CC0000"/>
          </svg>

          {/* 4px top accent bar */}
          <div style={{ height:4, background:'linear-gradient(90deg,#CC0000,#3A6186)', position:'relative', zIndex:3 }}/>

          {/* Top-right brand badge */}
          <div style={{ padding:'20px 28px 0', textAlign:'right', position:'relative', zIndex:3 }}>
            <div style={{ display:'inline-flex', alignItems:'center', gap:10 }}>
              <div>
                <div style={{ display:'flex', alignItems:'center', gap:8, justifyContent:'flex-end' }}>
                  <div style={{ width:36, height:36, background:'#CC0000', borderRadius:4, display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 3px 10px rgba(204,0,0,0.35)' }}>
                    <span style={{ fontSize:18, color:'#fff', fontWeight:900, lineHeight:1 }}>⚡</span>
                  </div>
                  <div style={{ textAlign:'right' }}>
                    <div style={{ fontSize:19, fontWeight:900, color:'#CC0000', letterSpacing:'-0.3px', lineHeight:1 }}>Finacle ERP</div>
                    <div style={{ fontSize:9, color:'#888', letterSpacing:'1px', marginTop:2, fontStyle:'italic' }}>Transforming Business</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Main content */}
          <div className="fin-content" style={{ flex:1, display:'flex', flexDirection:'column', justifyContent:'center', padding:'24px 52px 20px 52px', position:'relative', zIndex:3 }}>

            {/* Title — same weight mix as login */}
            <div style={{ marginBottom:32 }}>
              <h1 style={{ fontSize:28, color:'#111', lineHeight:1.25, margin:0, letterSpacing:'-0.5px' }}>
                <span style={{ fontWeight:300 }}>Reset </span>
                <span style={{ fontWeight:900 }}>Password</span>
              </h1>
              <div style={{ fontSize:13, color:'#777', marginTop:5 }}>
                Core ERP Solution — Account Recovery
              </div>
              <div style={{ width:'100%', height:1, background:'linear-gradient(90deg,transparent,#AAAAAA,transparent)', marginTop:14 }}/>
            </div>

            {/* ── VERIFYING ── */}
            {status === 'verifying' && (
              <div style={{ textAlign:'center', padding:'24px 0' }}>
                <div style={{ width:36, height:36, border:'3px solid #E5E7EB', borderTopColor:'#3A6186', borderRadius:'50%', animation:'spin360 0.8s linear infinite', margin:'0 auto 14px' }}/>
                <div style={{ fontSize:13.5, color:'#6B7280' }}>Verifying reset link…</div>
              </div>
            )}

            {/* ── INVALID ── */}
            {status === 'invalid' && (
              <div>
                <div style={{ padding:'10px 14px', background:'#FEF2F2', border:'1px solid #FCA5A5', borderLeft:'3px solid #DC2626', fontSize:13, color:'#DC2626', marginBottom:20, borderRadius:2 }}>
                  ⚠ This password reset link is <strong>invalid or has expired</strong>. Reset links are valid for 1 hour.
                </div>
                <table style={{ borderCollapse:'collapse', width:'100%' }}>
                  <tbody>
                    <tr>
                      <td style={{ padding:'9px 0' }}>
                        <button className="rp-btn" onClick={() => navigate('/forgot-password')}>
                          Request New Reset Link →
                        </button>
                      </td>
                    </tr>
                  </tbody>
                </table>
                <div style={{ marginTop:16 }}>
                  <button className="rp-link" onClick={() => navigate('/login')}>← Back to Login</button>
                </div>
              </div>
            )}

            {/* ── DONE ── */}
            {status === 'done' && (
              <div>
                <div style={{ padding:'10px 14px', background:'#F0FDF4', border:'1px solid #86EFAC', borderLeft:'3px solid #16a34a', fontSize:13, color:'#15803d', marginBottom:20, borderRadius:2 }}>
                  ✅ <strong>Password reset successfully!</strong> You can now sign in with your new password.
                </div>
                <table style={{ borderCollapse:'collapse', width:'100%' }}>
                  <tbody>
                    <tr>
                      <td style={{ padding:'9px 0' }}>
                        <button className="rp-btn" onClick={() => navigate('/login')}>
                          ← Sign In
                        </button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}

            {/* ── FORM ── */}
            {status === 'valid' && (
              <form onSubmit={handleSubmit} autoComplete="off">
                {msg && (
                  <div style={{ padding:'8px 12px', background:'#FEE2E2', border:'1px solid #FCA5A5', borderLeft:'3px solid #DC2626', fontSize:12.5, color:'#DC2626', borderRadius:2, marginBottom:14, display:'flex', alignItems:'center', gap:6 }}>
                    <span>⚠</span> {msg}
                  </div>
                )}

                <table style={{ borderCollapse:'collapse', width:'100%' }}>
                  <tbody>
                    <tr>
                      <td style={{ padding:'9px 0', paddingRight:18, fontSize:13.5, fontWeight:600, color:'#2C2C2C', whiteSpace:'nowrap', verticalAlign:'middle', width:130 }}>
                        Account:
                      </td>
                      <td style={{ padding:'9px 0', verticalAlign:'middle' }}>
                        <div style={{ fontSize:13, color:'#3A6186', fontWeight:600 }}>{email}</div>
                      </td>
                    </tr>
                    <tr>
                      <td style={{ padding:'9px 0', paddingRight:18, fontSize:13.5, fontWeight:600, color:'#2C2C2C', verticalAlign:'middle' }}>
                        New Password:
                      </td>
                      <td style={{ padding:'9px 0', verticalAlign:'middle' }}>
                        <div style={{ position:'relative' }}>
                          <input type={showPwd ? 'text' : 'password'} value={pwd} autoFocus
                            className={`rp-field${msg&&msg.includes('6')?' err':''}`}
                            onChange={e => { setPwd(e.target.value); setMsg(null); }}
                            placeholder="Min 6 characters" style={{ paddingRight:36 }} />
                          <button type="button" onClick={() => setShowPwd(v=>!v)}
                            style={{ position:'absolute', right:8, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', fontSize:13, color:'#888', padding:0, lineHeight:1 }}>
                            {showPwd ? '🙈' : '👁️'}
                          </button>
                        </div>
                      </td>
                    </tr>
                    <tr>
                      <td style={{ padding:'9px 0', paddingRight:18, fontSize:13.5, fontWeight:600, color:'#2C2C2C', verticalAlign:'middle' }}>
                        Confirm:
                      </td>
                      <td style={{ padding:'9px 0', verticalAlign:'middle' }}>
                        <div style={{ position:'relative' }}>
                          <input type={showPwd ? 'text' : 'password'} value={confPwd}
                            className={`rp-field${confPwd && pwd !== confPwd ? ' err' : ''}`}
                            onChange={e => { setConfPwd(e.target.value); setMsg(null); }}
                            placeholder="Re-enter password" style={{ paddingRight:36 }} />
                        </div>
                        {confPwd && pwd !== confPwd && (
                          <div style={{ fontSize:11, color:'#DC2626', marginTop:3 }}>Passwords do not match</div>
                        )}
                      </td>
                    </tr>
                    <tr>
                      <td style={{ padding:'9px 0', paddingRight:18, verticalAlign:'middle' }}/>
                      <td style={{ padding:'9px 0', verticalAlign:'middle' }}>
                        <button type="submit" disabled={loading} className="rp-btn">
                          {loading ? (
                            <span style={{ display:'inline-flex', alignItems:'center', gap:6 }}>
                              <span style={{ width:12, height:12, border:'2px solid rgba(255,255,255,0.4)', borderTopColor:'#fff', borderRadius:'50%', display:'inline-block', animation:'spin360 0.6s linear infinite' }}/>
                              Wait…
                            </span>
                          ) : '🔒 Reset Password'}
                        </button>
                      </td>
                    </tr>
                  </tbody>
                </table>

                <div style={{ marginTop:16 }}>
                  <button type="button" className="rp-link" onClick={() => navigate('/login')}>
                    Forgot Password?
                  </button>
                </div>
              </form>
            )}
          </div>

          {/* Epsilongroup brand — bottom right (identical to login) */}
          <div style={{ textAlign:'right', padding:'0 28px 10px', position:'relative', zIndex:3 }}>
            <div style={{ fontSize:28, fontWeight:900, color:'#003580', fontStyle:'italic', letterSpacing:'-0.5px', lineHeight:1, textShadow:'0 1px 2px rgba(0,53,128,0.15)' }}>
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
