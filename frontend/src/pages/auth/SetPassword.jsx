import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';

const F = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const P = '#104f4f';

export default function SetPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const navigate = useNavigate();

  const [status,  setStatus]  = useState('verifying'); // verifying | valid | invalid | done
  const [info,    setInfo]     = useState(null);
  const [pwd,     setPwd]      = useState('');
  const [conf,    setConf]     = useState('');
  const [showPwd, setShowPwd]  = useState(false);
  const [saving,  setSaving]   = useState(false);
  const [err,     setErr]      = useState('');

  useEffect(() => {
    if (!token) { setStatus('invalid'); return; }
    axios.get(`/api/auth/verify-invite/${token}`)
      .then(r => { setInfo(r.data); setStatus('valid'); })
      .catch(() => setStatus('invalid'));
  }, [token]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (pwd.length < 6) { setErr('Password must be at least 6 characters.'); return; }
    if (pwd !== conf)   { setErr('Passwords do not match.'); return; }
    setErr('');
    setSaving(true);
    try {
      await axios.post('/api/auth/accept-invite', { token, password: pwd });
      setStatus('done');
    } catch(e) {
      setErr(e.response?.data?.error || e.message);
    } finally { setSaving(false); }
  };

  const cardStyle = {
    background: '#fff', borderRadius: 14, padding: '32px 36px',
    width: '100%', maxWidth: 420, boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
    fontFamily: F,
  };

  if (status === 'verifying') return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#f0f4fb' }}>
      <div style={cardStyle}>
        <div style={{ textAlign:'center', color:'#6b7280', fontSize:14 }}>Verifying invite link…</div>
      </div>
    </div>
  );

  if (status === 'invalid') return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#f0f4fb' }}>
      <div style={cardStyle}>
        <div style={{ textAlign:'center', marginBottom:20 }}>
          <div style={{ fontSize:36, marginBottom:8 }}>⚠️</div>
          <div style={{ fontSize:17, fontWeight:800, color:'#111827', marginBottom:6 }}>Link Invalid or Expired</div>
          <div style={{ fontSize:13, color:'#6b7280', lineHeight:1.6 }}>
            This invite link is invalid or has expired (links expire after 7 days).<br/>
            Please ask your administrator to resend the invitation.
          </div>
        </div>
        <button onClick={()=>navigate('/login')}
          style={{ width:'100%', height:40, background:P, border:'none', borderRadius:8, color:'#fff', fontSize:13.5, fontWeight:700, cursor:'pointer', fontFamily:F }}>
          Go to Login
        </button>
      </div>
    </div>
  );

  if (status === 'done') return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#f0f4fb' }}>
      <div style={cardStyle}>
        <div style={{ textAlign:'center', marginBottom:24 }}>
          <div style={{ fontSize:40, marginBottom:10 }}>✅</div>
          <div style={{ fontSize:18, fontWeight:800, color:'#15803d', marginBottom:6 }}>Account Activated!</div>
          <div style={{ fontSize:13, color:'#6b7280', lineHeight:1.6 }}>
            Your password has been set and your account is now active.<br/>
            You can log in with your username: <strong style={{ color:P }}>{info?.username}</strong>
          </div>
        </div>
        <button onClick={()=>navigate('/login')}
          style={{ width:'100%', height:40, background:P, border:'none', borderRadius:8, color:'#fff', fontSize:13.5, fontWeight:700, cursor:'pointer', fontFamily:F }}>
          Go to Login →
        </button>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#f0f4fb', padding:16 }}>
      <div style={cardStyle}>
        {/* Header */}
        <div style={{ textAlign:'center', marginBottom:26 }}>
          <div style={{ width:48, height:48, background:P, borderRadius:12, display:'inline-flex', alignItems:'center', justifyContent:'center', marginBottom:12 }}>
            <span style={{ fontSize:22 }}>⚡</span>
          </div>
          <div style={{ fontSize:18, fontWeight:800, color:'#111827', letterSpacing:'-0.3px' }}>Set Your Password</div>
          <div style={{ fontSize:12.5, color:'#6b7280', marginTop:4 }}>Welcome to Epsilon ERP, {info?.name?.split(' ')[0]}!</div>
        </div>

        {/* Account info */}
        <div style={{ background:'#f8faff', border:'1px solid #dbeafe', borderRadius:8, padding:'10px 14px', marginBottom:20, fontSize:12 }}>
          <div style={{ marginBottom:4 }}><span style={{ color:'#6b7280' }}>Username: </span><strong style={{ color:P }}>{info?.username}</strong></div>
          <div><span style={{ color:'#6b7280' }}>Email: </span><span style={{ color:'#374151' }}>{info?.email}</span></div>
        </div>

        <form onSubmit={handleSubmit} style={{ display:'flex', flexDirection:'column', gap:14 }}>
          <div>
            <label style={{ fontSize:12, fontWeight:600, color:'#374151', display:'block', marginBottom:5 }}>New Password</label>
            <div style={{ position:'relative' }}>
              <input type={showPwd?'text':'password'} value={pwd} onChange={e=>{setPwd(e.target.value);setErr('');}}
                placeholder="Minimum 6 characters" autoFocus
                style={{ width:'100%', height:40, padding:'0 38px 0 12px', fontSize:13, fontFamily:F, border:'1px solid #d1d5db', borderRadius:8, outline:'none', boxSizing:'border-box' }}/>
              <button type="button" onClick={()=>setShowPwd(s=>!s)}
                style={{ position:'absolute', right:10, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', fontSize:16 }}>
                {showPwd?'🙈':'👁️'}
              </button>
            </div>
          </div>
          <div>
            <label style={{ fontSize:12, fontWeight:600, color:'#374151', display:'block', marginBottom:5 }}>Confirm Password</label>
            <input type="password" value={conf} onChange={e=>{setConf(e.target.value);setErr('');}}
              placeholder="Re-enter password"
              style={{ width:'100%', height:40, padding:'0 12px', fontSize:13, fontFamily:F, border:'1px solid #d1d5db', borderRadius:8, outline:'none', boxSizing:'border-box' }}/>
          </div>

          {err && (
            <div style={{ background:'#fef2f2', border:'1px solid #fecaca', borderRadius:7, padding:'8px 12px', fontSize:12, color:'#dc2626' }}>{err}</div>
          )}

          <button type="submit" disabled={saving}
            style={{ height:42, background:P, border:'none', borderRadius:9, color:'#fff', fontSize:14, fontWeight:700, cursor:saving?'not-allowed':'pointer', fontFamily:F, marginTop:4 }}>
            {saving ? 'Activating…' : 'Activate Account →'}
          </button>
        </form>
      </div>
    </div>
  );
}
