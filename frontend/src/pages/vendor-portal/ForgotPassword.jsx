import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

const F = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const P = '#2563EB';

const inp = (err) => ({
  width:'100%', height:40, padding:'0 12px', fontSize:13, fontFamily:F,
  border:`1px solid ${err?'#EF4444':'#D1D5DB'}`, borderRadius:7,
  background:'#fff', outline:'none', boxSizing:'border-box',
});

export default function ForgotPassword() {
  const navigate = useNavigate();
  const [step, setStep]       = useState(0); // 0: email, 1: otp+new password
  const [email, setEmail]     = useState('');
  const [otp, setOtp]         = useState('');
  const [newPwd, setNewPwd]   = useState('');
  const [confPwd, setConfPwd] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg]         = useState(null);
  const [done, setDone]       = useState(false);

  const sendOTP = async () => {
    if (!email.trim()) { setMsg({ type:'error', text:'Enter your registered email address.' }); return; }
    setLoading(true); setMsg(null);
    try {
      const res = await axios.post('/api/vendor-portal/forgot-password/send-otp', { email: email.trim() });
      setStep(1);
      const txt = res.data.message || `OTP sent to ${email}.`;
      setMsg({ type:'success', text: txt });
      if (res.data.devOtp) setMsg({ type:'success', text: `OTP: ${res.data.devOtp} (email delivery failed — use this OTP)` });
    } catch (e) {
      setMsg({ type:'error', text: e.response?.data?.error || e.message });
    } finally { setLoading(false); }
  };

  const resetPwd = async () => {
    if (!otp.trim()) { setMsg({ type:'error', text:'Enter the OTP.' }); return; }
    if (!newPwd || newPwd.length < 6) { setMsg({ type:'error', text:'Password must be at least 6 characters.' }); return; }
    if (newPwd !== confPwd) { setMsg({ type:'error', text:'Passwords do not match.' }); return; }
    setLoading(true); setMsg(null);
    try {
      await axios.post('/api/vendor-portal/forgot-password/reset', { email: email.trim(), otp: otp.trim(), newPassword: newPwd });
      setDone(true);
    } catch (e) {
      setMsg({ type:'error', text: e.response?.data?.error || e.message });
    } finally { setLoading(false); }
  };

  return (
    <div style={{ minHeight:'100vh', background:'linear-gradient(135deg,#1E293B 0%,#2563EB 100%)', display:'flex', alignItems:'center', justifyContent:'center', padding:'20px', fontFamily:F }}>
      <div style={{ background:'#fff', borderRadius:14, boxShadow:'0 24px 60px rgba(0,0,0,0.25)', width:'100%', maxWidth:420, overflow:'hidden' }}>

        {/* Header */}
        <div style={{ background:'linear-gradient(135deg,#1E293B,#2563EB)', padding:'22px 26px' }}>
          <div style={{ fontSize:11, color:'rgba(255,255,255,0.6)', fontWeight:500, textTransform:'uppercase', letterSpacing:'0.8px', marginBottom:5 }}>Epsilon Enterprise</div>
          <div style={{ fontSize:19, fontWeight:800, color:'#fff' }}>Reset Password</div>
          <div style={{ fontSize:12, color:'rgba(255,255,255,0.65)', marginTop:3 }}>Vendor Portal Account</div>
        </div>

        <div style={{ padding:'24px 26px' }}>
          {done ? (
            <div style={{ textAlign:'center', padding:'12px 0' }}>
              <div style={{ fontSize:48, marginBottom:12 }}>✅</div>
              <div style={{ fontSize:15, fontWeight:700, color:'#1E293B', marginBottom:8 }}>Password Reset Successful!</div>
              <div style={{ fontSize:13, color:'#64748b', marginBottom:24 }}>Your password has been updated. You can now log in with your new password.</div>
              <button onClick={() => navigate('/login')} style={{ width:'100%', padding:'10px 0', borderRadius:8, cursor:'pointer', background:P, border:'none', color:'#fff', fontSize:14, fontWeight:700, fontFamily:F }}>Go to Login →</button>
            </div>
          ) : (
            <>
              {msg && (
                <div style={{ padding:'9px 12px', borderRadius:6, fontSize:12, fontWeight:600, marginBottom:14,
                  background: msg.type==='success'?'#ECFDF5':'#FEF2F2',
                  color: msg.type==='success'?'#065F46':'#991B1B',
                  border:`1px solid ${msg.type==='success'?'#A7F3D0':'#FECACA'}` }}>
                  {msg.text}
                </div>
              )}

              {step === 0 && (
                <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
                  <div>
                    <div style={{ fontSize:13, color:'#374151', fontWeight:600, marginBottom:4 }}>Registered Email Address</div>
                    <input type="email" value={email} onChange={e=>{setEmail(e.target.value);setMsg(null);}} placeholder="vendor@company.com" style={inp(!email && msg?.type==='error')} autoFocus />
                  </div>
                  <button onClick={sendOTP} disabled={loading} style={{ padding:'10px 0', borderRadius:8, cursor:loading?'not-allowed':'pointer', background:P, border:'none', color:'#fff', fontSize:13, fontWeight:700, fontFamily:F, opacity:loading?0.7:1 }}>
                    {loading ? '⏳ Sending OTP…' : '📤 Send OTP'}
                  </button>
                </div>
              )}

              {step === 1 && (
                <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
                  <div style={{ textAlign:'center', padding:'8px 0' }}>
                    <div style={{ fontSize:32, marginBottom:6 }}>📧</div>
                    <div style={{ fontSize:13.5, fontWeight:700, color:'#1E293B' }}>Check your inbox</div>
                    <div style={{ fontSize:12, color:'#64748b', marginTop:3 }}>OTP sent to <strong>{email}</strong></div>
                  </div>
                  <div>
                    <div style={{ fontSize:12, fontWeight:600, color:'#374151', marginBottom:4 }}>Enter OTP</div>
                    <input value={otp} onChange={e=>{setOtp(e.target.value);setMsg(null);}} maxLength={6} placeholder="6-digit OTP"
                      style={{ ...inp(!otp && msg?.type==='error'), textAlign:'center', fontSize:22, fontWeight:800, letterSpacing:8 }} />
                  </div>
                  <div>
                    <div style={{ fontSize:12, fontWeight:600, color:'#374151', marginBottom:4 }}>New Password</div>
                    <input type="password" value={newPwd} onChange={e=>{setNewPwd(e.target.value);setMsg(null);}} placeholder="Min 6 characters" style={inp()} />
                  </div>
                  <div>
                    <div style={{ fontSize:12, fontWeight:600, color:'#374151', marginBottom:4 }}>Confirm New Password</div>
                    <input type="password" value={confPwd} onChange={e=>{setConfPwd(e.target.value);setMsg(null);}} placeholder="Re-enter password" style={inp(confPwd && newPwd !== confPwd)} />
                    {confPwd && newPwd !== confPwd && <div style={{ fontSize:11, color:'#EF4444', marginTop:3 }}>Passwords do not match</div>}
                  </div>
                  <button onClick={resetPwd} disabled={loading} style={{ padding:'10px 0', borderRadius:8, cursor:loading?'not-allowed':'pointer', background:'#059669', border:'none', color:'#fff', fontSize:13, fontWeight:700, fontFamily:F, opacity:loading?0.7:1 }}>
                    {loading ? '⏳ Resetting…' : '🔒 Reset Password'}
                  </button>
                  <button onClick={()=>{setStep(0);setMsg(null);}} style={{ padding:'7px 0', borderRadius:8, cursor:'pointer', background:'#fff', border:'1px solid #D1D5DB', color:'#6B7280', fontSize:12.5, fontWeight:600, fontFamily:F }}>
                    ← Change Email
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        <div style={{ padding:'12px 26px 18px', borderTop:'1px solid #F1F5F9', textAlign:'center' }}>
          <button onClick={() => navigate('/login')} style={{ background:'none', border:'none', color:P, fontSize:12.5, fontWeight:600, cursor:'pointer', fontFamily:F, textDecoration:'underline' }}>
            ← Back to Login
          </button>
        </div>
      </div>
    </div>
  );
}
