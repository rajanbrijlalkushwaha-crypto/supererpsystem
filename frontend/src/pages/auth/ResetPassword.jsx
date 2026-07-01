import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

const F = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const P = '#104f4f';

export default function ResetPassword() {
  const navigate             = useNavigate();
  const [params]             = useSearchParams();
  const token                = params.get('token') || '';

  const [status, setStatus]   = useState('verifying'); // verifying | valid | invalid | done
  const [email, setEmail]     = useState('');
  const [pwd, setPwd]         = useState('');
  const [confPwd, setConfPwd] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg]         = useState(null);
  const [focusP, setFocusP]   = useState(false);
  const [focusC, setFocusC]   = useState(false);

  useEffect(() => {
    if (!token) { setStatus('invalid'); return; }
    fetch(`/api/auth/verify-reset-token/${token}`)
      .then(r => r.json())
      .then(d => {
        if (d.valid) { setEmail(d.email); setStatus('valid'); }
        else setStatus('invalid');
      })
      .catch(() => setStatus('invalid'));
  }, [token]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!pwd || pwd.length < 6) { setMsg('Password must be at least 6 characters.'); return; }
    if (pwd !== confPwd) { setMsg('Passwords do not match.'); return; }
    setLoading(true); setMsg(null);
    try {
      const res  = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password: pwd }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Reset failed');
      setStatus('done');
    } catch (err) {
      setMsg(err.message);
    } finally { setLoading(false); }
  };

  const inp = (focused) => ({
    width:'100%', height:46, padding:'0 44px 0 14px',
    border:`1.5px solid ${focused ? P : '#D1D5DB'}`, borderRadius:10,
    fontSize:14, fontFamily:F, background: focused?'#fff':'#F9FAFB',
    color:'#111827', outline:'none', boxSizing:'border-box',
    boxShadow: focused?`0 0 0 3px rgba(19,61,128,0.12)`:'none', transition:'all 0.18s',
  });

  return (
    <div style={{ minHeight:'100vh', display:'flex', fontFamily:F, background:'linear-gradient(135deg,#0F172A 0%,#1E3A5F 50%,#1E293B 100%)', alignItems:'center', justifyContent:'center', padding:20 }}>
      <div style={{ background:'#fff', borderRadius:16, boxShadow:'0 24px 60px rgba(0,0,0,0.3)', width:'100%', maxWidth:440, overflow:'hidden' }}>

        {/* Header */}
        <div style={{ background:'linear-gradient(160deg,#1D4ED8 0%,#104f4f 100%)', padding:'28px 32px' }}>
          <div style={{ width:48, height:48, borderRadius:14, background:'rgba(255,255,255,0.15)', display:'flex', alignItems:'center', justifyContent:'center', marginBottom:16, fontSize:24 }}>🔒</div>
          <div style={{ fontSize:20, fontWeight:800, color:'#fff', letterSpacing:'-0.3px' }}>Reset Password</div>
          <div style={{ fontSize:13, color:'#93C5FD', marginTop:4 }}>Company Account — Epsilon ERP</div>
        </div>

        <div style={{ padding:'28px 32px' }}>

          {/* Verifying */}
          {status === 'verifying' && (
            <div style={{ textAlign:'center', padding:'20px 0' }}>
              <div style={{ width:36, height:36, border:'3px solid #E5E7EB', borderTopColor:P, borderRadius:'50%', animation:'spin 0.8s linear infinite', margin:'0 auto 14px' }} />
              <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
              <div style={{ fontSize:14, color:'#6B7280' }}>Verifying reset link…</div>
            </div>
          )}

          {/* Invalid token */}
          {status === 'invalid' && (
            <div style={{ textAlign:'center', padding:'8px 0' }}>
              <div style={{ fontSize:52, marginBottom:16 }}>⚠️</div>
              <div style={{ fontSize:17, fontWeight:800, color:'#0F172A', marginBottom:8 }}>Link Invalid or Expired</div>
              <div style={{ fontSize:13.5, color:'#374151', lineHeight:1.7, marginBottom:24 }}>
                This password reset link is invalid or has expired. Reset links are valid for 1 hour.
              </div>
              <button onClick={() => navigate('/forgot-password')} style={{ width:'100%', height:46, borderRadius:10, border:'none', cursor:'pointer', background:`linear-gradient(135deg,#104f4f,#1D4ED8)`, color:'#fff', fontSize:14, fontWeight:700, fontFamily:F, boxShadow:'0 4px 16px rgba(19,61,128,0.3)', marginBottom:12 }}>
                Request New Reset Link →
              </button>
              <button onClick={() => navigate('/login')} style={{ width:'100%', height:40, borderRadius:10, border:'1px solid #D1D5DB', cursor:'pointer', background:'#fff', color:'#374151', fontSize:13, fontWeight:600, fontFamily:F }}>
                Back to Login
              </button>
            </div>
          )}

          {/* Success */}
          {status === 'done' && (
            <div style={{ textAlign:'center', padding:'8px 0' }}>
              <div style={{ fontSize:52, marginBottom:16 }}>✅</div>
              <div style={{ fontSize:17, fontWeight:800, color:'#0F172A', marginBottom:8 }}>Password Reset!</div>
              <div style={{ fontSize:13.5, color:'#374151', lineHeight:1.7, marginBottom:24 }}>
                Your password has been updated successfully. You can now sign in with your new password.
              </div>
              <button onClick={() => navigate('/login')} style={{ width:'100%', height:46, borderRadius:10, border:'none', cursor:'pointer', background:`linear-gradient(135deg,#104f4f,#1D4ED8)`, color:'#fff', fontSize:14, fontWeight:700, fontFamily:F, boxShadow:'0 4px 16px rgba(19,61,128,0.3)' }}>
                Sign In →
              </button>
            </div>
          )}

          {/* Reset form */}
          {status === 'valid' && (
            <>
              <p style={{ fontSize:13.5, color:'#374151', lineHeight:1.7, margin:'0 0 20px' }}>
                Setting new password for <strong>{email}</strong>
              </p>

              {msg && (
                <div style={{ marginBottom:16, padding:'10px 14px', borderRadius:8, background:'#FEF2F2', border:'1px solid #FECACA', borderLeft:'3px solid #EF4444', fontSize:13, color:'#DC2626', fontWeight:500, display:'flex', alignItems:'center', gap:8 }}>
                  <span>⚠️</span>{msg}
                </div>
              )}

              <form onSubmit={handleSubmit}>
                <div style={{ marginBottom:16 }}>
                  <label style={{ fontSize:13, fontWeight:600, color:'#374151', display:'block', marginBottom:6 }}>New Password</label>
                  <div style={{ position:'relative' }}>
                    <input type={showPwd?'text':'password'} value={pwd} autoFocus
                      onChange={e => { setPwd(e.target.value); setMsg(null); }}
                      onFocus={() => setFocusP(true)} onBlur={() => setFocusP(false)}
                      placeholder="Min 6 characters" style={inp(focusP)} />
                    <button type="button" onClick={() => setShowPwd(v => !v)} style={{ position:'absolute', right:12, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', color:'#9CA3AF', fontSize:18, lineHeight:1, padding:2 }}>
                      {showPwd ? '🙈' : '👁️'}
                    </button>
                  </div>
                </div>

                <div style={{ marginBottom:24 }}>
                  <label style={{ fontSize:13, fontWeight:600, color:'#374151', display:'block', marginBottom:6 }}>Confirm New Password</label>
                  <div style={{ position:'relative' }}>
                    <input type={showPwd?'text':'password'} value={confPwd}
                      onChange={e => { setConfPwd(e.target.value); setMsg(null); }}
                      onFocus={() => setFocusC(true)} onBlur={() => setFocusC(false)}
                      placeholder="Re-enter password"
                      style={{ ...inp(focusC), border:`1.5px solid ${confPwd && pwd !== confPwd ? '#EF4444' : focusC ? P : '#D1D5DB'}` }} />
                  </div>
                  {confPwd && pwd !== confPwd && (
                    <div style={{ fontSize:11.5, color:'#EF4444', marginTop:4 }}>Passwords do not match</div>
                  )}
                </div>

                <button type="submit" disabled={loading} style={{ width:'100%', height:46, borderRadius:10, border:'none', cursor:loading?'not-allowed':'pointer',
                  background:loading?'#93C5FD':`linear-gradient(135deg,#104f4f,#1D4ED8)`,
                  color:'#fff', fontSize:14, fontWeight:700, fontFamily:F,
                  boxShadow:loading?'none':'0 4px 16px rgba(19,61,128,0.3)', transition:'all 0.18s' }}>
                  {loading ? '⏳ Resetting…' : '🔒 Reset Password'}
                </button>
              </form>
            </>
          )}
        </div>

        {status !== 'verifying' && (
          <div style={{ padding:'14px 32px 20px', borderTop:'1px solid #F1F5F9', textAlign:'center' }}>
            <button onClick={() => navigate('/login')} style={{ background:'none', border:'none', color:P, fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:F, textDecoration:'underline' }}>
              ← Back to Login
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
