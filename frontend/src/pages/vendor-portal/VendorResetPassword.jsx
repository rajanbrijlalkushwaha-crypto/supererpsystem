import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

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
  0%,100%{box-shadow:0 0 0 0 rgba(13,92,92,0.25),0 8px 28px rgba(13,92,92,0.2);}
  50%{box-shadow:0 0 0 12px rgba(13,92,92,0),0 8px 28px rgba(13,92,92,0.25);}
}
@keyframes slideIn { from{opacity:0;transform:translateX(30px)} to{opacity:1;transform:translateX(0)} }

.vrp-wrapper { height:100vh; overflow-y:auto; }
.vrp-left  { width:60%; flex-shrink:0; }
.vrp-right { width:40%; flex-shrink:0; }

@media (max-width: 860px) {
  .vrp-wrapper { height:auto; min-height:100vh; }
  .vrp-left  { display:none !important; }
  .vrp-right { width:100% !important; min-width:0 !important; }
}

.vrp-field {
  width:100%; height:30px; padding:0 10px;
  border:1.5px solid #AAAAAA;
  font-size:13px; font-family:${F};
  background:#FFFFFF; color:#111; outline:none;
  border-radius:2px; transition:border-color 0.15s, box-shadow 0.15s;
}
.vrp-field:focus { border-color:#3A6186; box-shadow:0 0 0 3px rgba(58,97,134,0.15); }
.vrp-btn {
  height:30px; padding:0 22px;
  background:linear-gradient(180deg,#4A7FAA 0%,#2D5F8A 100%);
  border:1px solid #1E4A70;
  font-size:13px; font-family:${F}; font-weight:700;
  cursor:pointer; color:#fff; border-radius:3px;
  transition:all 0.15s; white-space:nowrap;
}
.vrp-btn:hover:not(:disabled) { background:linear-gradient(180deg,#5A8FBA 0%,#3D6F9A 100%); }
.vrp-btn:disabled { opacity:0.6; cursor:not-allowed; }
.vrp-btn-green {
  height:30px; padding:0 22px;
  background:linear-gradient(180deg,#27AE60 0%,#1E8449 100%);
  border:1px solid #1A7040;
  font-size:13px; font-family:${F}; font-weight:700;
  cursor:pointer; color:#fff; border-radius:3px; white-space:nowrap;
}
.vrp-btn-green:disabled { opacity:0.6; cursor:not-allowed; }
.vrp-link {
  background:none; border:none; cursor:pointer; color:#3A6186;
  font-size:12px; text-decoration:underline; font-family:${F}; padding:0;
}
`;

function OrbitRing({ radius, modules, duration, reverse, iconSize=42 }) {
  return (
    <div style={{ position:'absolute', width:radius*2, height:radius*2, top:'50%', left:'50%', marginTop:-radius, marginLeft:-radius, borderRadius:'50%', border:'1.5px dashed rgba(13,92,92,0.12)', animation:`${reverse?'orbitOuter':'orbitInner'} ${duration}s linear infinite` }}>
      {modules.map((name,i) => {
        const angle=(2*Math.PI*i)/modules.length;
        const x=radius+radius*Math.cos(angle)-iconSize/2;
        const y=radius+radius*Math.sin(angle)-iconSize/2;
        const m=ICONS[name];
        return (
          <div key={name} style={{ position:'absolute', left:x, top:y, width:iconSize, height:iconSize, animation:`${reverse?'counterOut':'counterIn'} ${duration}s linear infinite` }}>
            <div style={{ width:'100%', height:'100%', borderRadius:12, background:m.bg, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', boxShadow:'0 3px 10px rgba(0,0,0,0.1)', border:`1.5px solid ${m.fg}22` }}>
              <span style={{ fontSize:iconSize*0.36, lineHeight:1 }}>{m.symbol}</span>
              <span style={{ fontSize:8, fontWeight:700, color:m.fg, marginTop:2 }}>{name.toUpperCase()}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function VendorResetPassword() {
  const navigate = useNavigate();
  const token = new URLSearchParams(window.location.search).get('token') || '';

  // states: 'verifying' | 'invalid' | 'form' | 'done'
  const [phase,       setPhase]       = useState('verifying');
  const [nameHint,    setNameHint]    = useState('');
  const [confirmName, setConfirmName] = useState('');
  const [newPwd,      setNewPwd]      = useState('');
  const [confPwd,     setConfPwd]     = useState('');
  const [loading,     setLoading]     = useState(false);
  const [msg,         setMsg]         = useState(null);
  const [errText,     setErrText]     = useState('');

  useEffect(() => {
    if (!token) { setPhase('invalid'); setErrText('No reset token found. Please request a new password reset link.'); return; }
    axios.get(`/api/vendor-portal/verify-reset-token/${token}`)
      .then(r => { setNameHint(r.data.nameHint || ''); setPhase('form'); })
      .catch(e => { setErrText(e.response?.data?.error || 'Invalid or expired reset link.'); setPhase('invalid'); });
  }, [token]);

  const submit = async () => {
    if (!confirmName.trim()) { setMsg({ type:'error', text:'Please enter your registered business name.' }); return; }
    if (!newPwd || newPwd.length < 6) { setMsg({ type:'error', text:'Password must be at least 6 characters.' }); return; }
    if (newPwd !== confPwd) { setMsg({ type:'error', text:'Passwords do not match.' }); return; }
    setLoading(true); setMsg(null);
    try {
      await axios.post('/api/vendor-portal/forgot-password/reset-with-name', {
        token, confirmName: confirmName.trim(), newPassword: newPwd,
      });
      setPhase('done');
    } catch (e) {
      setMsg({ type:'error', text: e.response?.data?.error || e.message });
    } finally { setLoading(false); }
  };

  const LeftPanel = () => (
    <div className="vrp-left" style={{ position:'relative', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', background:'#EDEAE4', overflow:'hidden', minHeight:'100vh' }}>
      <div style={{ position:'absolute', top:'-8%', left:'-6%', width:300, height:300, borderRadius:'50%', background:'radial-gradient(circle,rgba(13,92,92,0.06),transparent 70%)', pointerEvents:'none' }} />
      <div style={{ position:'absolute', bottom:'-8%', right:'-5%', width:340, height:340, borderRadius:'50%', background:'radial-gradient(circle,rgba(20,131,126,0.05),transparent 70%)', pointerEvents:'none' }} />
      <div style={{ position:'relative', width:360, height:360 }}>
        <OrbitRing radius={160} modules={OUTER} duration={28} reverse iconSize={40} />
        <OrbitRing radius={102} modules={INNER} duration={18} reverse={false} iconSize={42} />
        <div style={{ position:'absolute', top:'50%', left:'50%', width:80, height:80, marginTop:-40, marginLeft:-40, borderRadius:20, background:`linear-gradient(135deg,${TEAL2},${TEAL})`, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', boxShadow:'0 8px 28px rgba(13,92,92,0.3)', animation:'centerPulse 3s ease-in-out infinite', zIndex:10 }}>
          <span style={{ fontSize:26, lineHeight:1 }}>⚡</span>
          <span style={{ fontSize:8, fontWeight:800, color:'#fff', marginTop:4, letterSpacing:'0.08em' }}>EPSILON</span>
        </div>
      </div>
      <div style={{ textAlign:'center', marginTop:20, position:'relative', zIndex:2 }}>
        <div style={{ fontSize:24, fontWeight:800, color:TEAL, letterSpacing:'-0.3px' }}>Universal Core ERP Solutions</div>
        <div style={{ fontSize:12.5, color:'#64748b', marginTop:6, fontWeight:500 }}>Enterprise Resource Planning · CRM · Production · Quality</div>
      </div>
      <div style={{ position:'absolute', bottom:14, fontSize:10.5, color:'#94a3b8' }}>© 2025 Epsilon Enterprise · epsilonprefab.org</div>
    </div>
  );

  return (
    <>
      <style>{CSS}</style>
      <div className="vrp-wrapper" style={{ display:'flex', fontFamily:F, background:'#fff' }}>
        <LeftPanel />

        {/* RIGHT */}
        <div className="vrp-right" style={{ position:'relative', minHeight:'100vh', display:'flex', flexDirection:'column', background:'linear-gradient(160deg,#EDEAE4 0%,#EAE7E1 50%,#E3DFD8 100%)', boxShadow:'-6px 0 32px rgba(0,0,0,0.18)', overflow:'hidden', animation:'slideIn 0.5s ease both' }}>
          <svg style={{ position:'absolute', bottom:0, left:0, zIndex:1 }} width="160" height="240" viewBox="0 0 160 240"><polygon points="0,240 160,240 0,0" fill="#CC0000"/></svg>
          <div style={{ height:4, background:'linear-gradient(90deg,#CC0000,#3A6186)', position:'relative', zIndex:3 }} />

          <div style={{ padding:'20px 28px 0', textAlign:'right', position:'relative', zIndex:3 }}>
            <div style={{ display:'inline-flex', alignItems:'center', gap:8 }}>
              <div style={{ textAlign:'right' }}>
                <div style={{ fontSize:19, fontWeight:900, color:'#CC0000' }}>Finacle ERP</div>
                <div style={{ fontSize:9, color:'#888', letterSpacing:'1px', fontStyle:'italic' }}>Transforming Business</div>
              </div>
              <div style={{ width:36, height:36, background:'#CC0000', borderRadius:4, display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 3px 10px rgba(204,0,0,0.35)' }}>
                <span style={{ fontSize:18, color:'#fff', fontWeight:900 }}>⚡</span>
              </div>
            </div>
          </div>

          <div style={{ flex:1, display:'flex', flexDirection:'column', justifyContent:'center', padding:'24px 52px 20px 52px', position:'relative', zIndex:3 }}>
            <div style={{ marginBottom:28 }}>
              <h1 style={{ fontSize:28, color:'#111', lineHeight:1.25, margin:0, letterSpacing:'-0.5px' }}>
                <span style={{ fontWeight:300 }}>Vendor </span><span style={{ fontWeight:900 }}>Password Reset</span>
              </h1>
              <div style={{ fontSize:13, color:'#777', marginTop:5 }}>Vendor Portal — Set New Password</div>
              <div style={{ width:'100%', height:1, background:'linear-gradient(90deg,transparent,#AAAAAA,transparent)', marginTop:14 }} />
            </div>

            {/* Verifying */}
            {phase === 'verifying' && (
              <div style={{ textAlign:'center', padding:'32px 0', color:'#555', fontSize:13 }}>
                <div style={{ fontSize:30, marginBottom:12 }}>⏳</div>
                Verifying reset link…
              </div>
            )}

            {/* Invalid */}
            {phase === 'invalid' && (
              <table style={{ borderCollapse:'collapse', width:'100%' }}>
                <tbody>
                  <tr><td colSpan={2} style={{ padding:'8px 0 20px', textAlign:'center' }}>
                    <div style={{ fontSize:40, marginBottom:10 }}>⚠️</div>
                    <div style={{ fontSize:14, fontWeight:700, color:'#DC2626', marginBottom:8 }}>Invalid or Expired Link</div>
                    <div style={{ fontSize:13, color:'#555', lineHeight:1.7 }}>{errText}</div>
                  </td></tr>
                  <tr><td style={{ padding:'9px 0' }}>
                    <div style={{ display:'flex', gap:10, justifyContent:'center' }}>
                      <button className="vrp-btn" onClick={() => navigate('/vendor-forgot-password')}>Request New Link</button>
                      <button className="vrp-link" onClick={() => navigate('/login')}>← Login</button>
                    </div>
                  </td></tr>
                </tbody>
              </table>
            )}

            {/* Form */}
            {phase === 'form' && (
              <>
                {/* Name hint info box */}
                <div style={{ marginBottom:18, padding:'9px 12px', background:'#EFF6FF', border:'1px solid #BFDBFE', borderLeft:'3px solid #3A6186', borderRadius:2, fontSize:12, color:'#1D4ED8', lineHeight:1.7 }}>
                  🔐 For security, please confirm your <strong>registered business name</strong> to proceed.<br/>
                  {nameHint && <span style={{ color:'#374151' }}>Hint: <strong style={{ letterSpacing:1 }}>{nameHint}</strong></span>}
                </div>

                {msg && (
                  <div style={{ marginBottom:14, padding:'7px 10px', background: msg.type==='error'?'#FEE2E2':'#ECFDF5', border:`1px solid ${msg.type==='error'?'#FCA5A5':'#A7F3D0'}`, borderLeft:`3px solid ${msg.type==='error'?'#DC2626':'#059669'}`, fontSize:12, color: msg.type==='error'?'#DC2626':'#065F46', borderRadius:2, display:'flex', gap:6, alignItems:'center' }}>
                    <span>{msg.type==='error'?'⚠':'✓'}</span> {msg.text}
                  </div>
                )}

                <table style={{ borderCollapse:'collapse', width:'100%' }}>
                  <tbody>
                    <tr>
                      <td style={{ padding:'9px 0', paddingRight:16, fontSize:13, fontWeight:600, color:'#2C2C2C', whiteSpace:'nowrap', verticalAlign:'middle', width:148 }}>Business Name:</td>
                      <td style={{ padding:'9px 0', verticalAlign:'middle' }}>
                        <input autoFocus className="vrp-field" value={confirmName}
                          onChange={e=>{setConfirmName(e.target.value);setMsg(null);}}
                          placeholder="Enter your exact registered name" />
                      </td>
                    </tr>
                    <tr>
                      <td style={{ padding:'9px 0', paddingRight:16, fontSize:13, fontWeight:600, color:'#2C2C2C', whiteSpace:'nowrap', verticalAlign:'middle' }}>New Password:</td>
                      <td style={{ padding:'9px 0', verticalAlign:'middle' }}>
                        <input type="password" className="vrp-field" value={newPwd}
                          onChange={e=>{setNewPwd(e.target.value);setMsg(null);}}
                          placeholder="Min 6 characters" />
                      </td>
                    </tr>
                    <tr>
                      <td style={{ padding:'9px 0', paddingRight:16, fontSize:13, fontWeight:600, color:'#2C2C2C', whiteSpace:'nowrap', verticalAlign:'middle' }}>Confirm Password:</td>
                      <td style={{ padding:'9px 0', verticalAlign:'middle' }}>
                        <input type="password" className="vrp-field" value={confPwd}
                          onChange={e=>{setConfPwd(e.target.value);setMsg(null);}}
                          placeholder="Re-enter password" />
                        {confPwd && newPwd !== confPwd && <div style={{ fontSize:11, color:'#DC2626', marginTop:3 }}>Passwords do not match</div>}
                      </td>
                    </tr>
                    <tr>
                      <td></td>
                      <td style={{ padding:'12px 0 9px', verticalAlign:'middle' }}>
                        <div style={{ display:'flex', gap:10, alignItems:'center' }}>
                          <button className="vrp-btn-green" onClick={submit} disabled={loading}>
                            {loading ? '⏳ Resetting…' : '🔒 Reset Password'}
                          </button>
                          <button className="vrp-link" onClick={() => navigate('/vendor-forgot-password')}>← Request new link</button>
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </>
            )}

            {/* Done */}
            {phase === 'done' && (
              <table style={{ borderCollapse:'collapse', width:'100%' }}>
                <tbody>
                  <tr><td colSpan={2} style={{ padding:'8px 0 20px', textAlign:'center' }}>
                    <div style={{ fontSize:44, marginBottom:10 }}>✅</div>
                    <div style={{ fontSize:15, fontWeight:700, color:'#111', marginBottom:6 }}>Password Reset Successful!</div>
                    <div style={{ fontSize:13, color:'#555', lineHeight:1.7 }}>Your Vendor Portal password has been updated.<br/>You can now log in with your new password.</div>
                  </td></tr>
                  <tr><td style={{ padding:'9px 0' }}>
                    <button className="vrp-btn" onClick={() => navigate('/login')} style={{ width:'100%' }}>← Go to Login</button>
                  </td></tr>
                </tbody>
              </table>
            )}
          </div>

          <div style={{ textAlign:'right', padding:'0 28px 10px', position:'relative', zIndex:3 }}>
            <div style={{ fontSize:28, fontWeight:900, color:'#003580', fontStyle:'italic', letterSpacing:'-0.5px' }}>Epsilongroup</div>
          </div>
          <div style={{ textAlign:'center', fontSize:10, color:'#888', padding:'0 20px 14px', position:'relative', zIndex:3 }}>
            Copyright © 2024–2025 Epsilon Group Limited. All rights reserved. epsilonprefab.org
          </div>
        </div>
      </div>
    </>
  );
}
