import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const F = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const P = '#104f4f';

export default function ForgotPasswordCompany() {
  const navigate        = useNavigate();
  const [email, setEmail]     = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg]         = useState(null);
  const [sent, setSent]       = useState(false);
  const [focusE, setFocusE]   = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim()) { setMsg({ type:'error', text:'Please enter your email address.' }); return; }
    setLoading(true); setMsg(null);
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Request failed');
      setSent(true);
    } catch (err) {
      setMsg({ type:'error', text: err.message });
    } finally { setLoading(false); }
  };

  const inp = (focused) => ({
    width:'100%', height:46, padding:'0 14px',
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
          <div style={{ width:48, height:48, borderRadius:14, background:'rgba(255,255,255,0.15)', display:'flex', alignItems:'center', justifyContent:'center', marginBottom:16, fontSize:24 }}>🔑</div>
          <div style={{ fontSize:20, fontWeight:800, color:'#fff', letterSpacing:'-0.3px' }}>Forgot Password</div>
          <div style={{ fontSize:13, color:'#93C5FD', marginTop:4 }}>Company Account — Epsilon ERP</div>
        </div>

        <div style={{ padding:'28px 32px' }}>
          {sent ? (
            <div style={{ textAlign:'center', padding:'8px 0' }}>
              <div style={{ fontSize:52, marginBottom:16 }}>📧</div>
              <div style={{ fontSize:17, fontWeight:800, color:'#0F172A', marginBottom:8 }}>Check Your Email</div>
              <div style={{ fontSize:13.5, color:'#374151', lineHeight:1.7, marginBottom:24 }}>
                If <strong>{email}</strong> is registered, we've sent a password reset link. Check your inbox and follow the instructions.
              </div>
              <div style={{ padding:'10px 14px', borderRadius:8, background:'#F0F9FF', border:'1px solid #BAE6FD', fontSize:12.5, color:'#0369A1', marginBottom:24, lineHeight:1.6 }}>
                The link expires in <strong>1 hour</strong>. Check your spam folder if you don't see the email.
              </div>
              <button onClick={() => navigate('/login')} style={{ width:'100%', height:46, borderRadius:10, border:'none', cursor:'pointer', background:`linear-gradient(135deg,#104f4f,#1D4ED8)`, color:'#fff', fontSize:14, fontWeight:700, fontFamily:F, boxShadow:'0 4px 16px rgba(19,61,128,0.3)' }}>
                Back to Login →
              </button>
            </div>
          ) : (
            <>
              <p style={{ fontSize:13.5, color:'#374151', lineHeight:1.7, margin:'0 0 24px' }}>
                Enter the email address associated with your account. We'll send you a link to reset your password.
              </p>

              {msg && (
                <div style={{ marginBottom:16, padding:'10px 14px', borderRadius:8,
                  background: msg.type==='error'?'#FEF2F2':'#F0FDF4',
                  border: `1px solid ${msg.type==='error'?'#FECACA':'#BBF7D0'}`,
                  borderLeft: `3px solid ${msg.type==='error'?'#EF4444':'#22C55E'}`,
                  fontSize:13, color: msg.type==='error'?'#DC2626':'#16A34A', fontWeight:500, display:'flex', alignItems:'center', gap:8 }}>
                  <span>{msg.type==='error'?'⚠️':'✅'}</span>{msg.text}
                </div>
              )}

              <form onSubmit={handleSubmit}>
                <div style={{ marginBottom:20 }}>
                  <label style={{ fontSize:13, fontWeight:600, color:'#374151', display:'block', marginBottom:6 }}>Email Address</label>
                  <input
                    type="email" value={email} autoFocus
                    onChange={e => { setEmail(e.target.value); setMsg(null); }}
                    onFocus={() => setFocusE(true)} onBlur={() => setFocusE(false)}
                    placeholder="your@email.com"
                    style={inp(focusE)}
                  />
                </div>

                <button type="submit" disabled={loading} style={{ width:'100%', height:46, borderRadius:10, border:'none', cursor:loading?'not-allowed':'pointer',
                  background:loading?'#93C5FD':`linear-gradient(135deg,#104f4f,#1D4ED8)`,
                  color:'#fff', fontSize:14, fontWeight:700, fontFamily:F,
                  boxShadow:loading?'none':'0 4px 16px rgba(19,61,128,0.3)', transition:'all 0.18s' }}>
                  {loading ? '⏳ Sending…' : '📤 Send Reset Link'}
                </button>
              </form>
            </>
          )}
        </div>

        <div style={{ padding:'14px 32px 20px', borderTop:'1px solid #F1F5F9', textAlign:'center' }}>
          <button onClick={() => navigate('/login')} style={{ background:'none', border:'none', color:P, fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:F, textDecoration:'underline' }}>
            ← Back to Login
          </button>
        </div>
      </div>
    </div>
  );
}
