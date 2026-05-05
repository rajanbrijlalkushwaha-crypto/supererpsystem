import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useVendorAuth } from '../../context/VendorAuthContext';

const F  = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const P  = '#2563EB';
const PD = '#1D4ED8';

export default function Login() {
  const { login, user }                    = useAuth();
  const { vendorLogin, vendor }            = useVendorAuth();
  const navigate                           = useNavigate();

  const [mode, setMode]         = useState('company'); // 'company' | 'vendor'
  const [username, setUsername] = useState('');
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd]   = useState(false);
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [focusU, setFocusU]     = useState(false);
  const [focusP, setFocusP]     = useState(false);

  useEffect(() => { if (user)   navigate('/dashboard',     { replace: true }); }, [user,   navigate]);
  useEffect(() => { if (vendor) navigate('/vendor-portal', { replace: true }); }, [vendor, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      if (mode === 'company') {
        if (!username.trim() || !password) { setError('Please enter username and password.'); setLoading(false); return; }
        await login(username.trim(), password);
        navigate('/dashboard', { replace: true });
      } else {
        if (!email.trim() || !password) { setError('Please enter email and password.'); setLoading(false); return; }
        await vendorLogin(email.trim(), password);
        navigate('/vendor-portal', { replace: true });
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed. Please try again.');
    } finally { setLoading(false); }
  };

  const inp = (focused) => ({
    width:'100%', height:46, padding:'0 14px',
    border:`1.5px solid ${focused ? P : '#D1D5DB'}`, borderRadius:10,
    fontSize:14, fontFamily:F, background: focused?'#fff':'#F9FAFB',
    color:'#111827', outline:'none', boxSizing:'border-box',
    boxShadow: focused?`0 0 0 3px rgba(37,99,235,0.12)`:'none', transition:'all 0.18s',
  });

  const isVendor = mode === 'vendor';

  return (
    <div style={{ minHeight:'100vh', display:'flex', fontFamily:F, background:'linear-gradient(135deg,#0F172A 0%,#1E3A5F 50%,#1E293B 100%)' }}>

      {/* ── Left Panel ── */}
      <div style={{ flex:1, display:'flex', flexDirection:'column', justifyContent:'center', alignItems:'center', padding:'60px 40px',
        background:'linear-gradient(160deg,#1D4ED8 0%,#1E40AF 40%,#0F172A 100%)', position:'relative', overflow:'hidden' }}>
        {[{ w:320,h:320,top:-60,left:-80,op:0.06 },{ w:200,h:200,top:160,left:260,op:0.05 },{ w:260,h:260,bottom:-80,right:-60,op:0.06 }].map((c,i)=>(
          <div key={i} style={{ position:'absolute', width:c.w, height:c.h, top:c.top, left:c.left, bottom:c.bottom, right:c.right, borderRadius:'50%', background:'#fff', opacity:c.op }} />
        ))}
        <div style={{ position:'relative', zIndex:1, textAlign:'center', maxWidth:420 }}>
          <div style={{ width:72, height:72, borderRadius:20, margin:'0 auto 28px', background:'linear-gradient(135deg,#60A5FA,#2563EB)', display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 8px 32px rgba(37,99,235,0.4)' }}>
            <span style={{ fontSize:32, lineHeight:1 }}>⚡</span>
          </div>
          <div style={{ fontSize:32, fontWeight:800, color:'#fff', marginBottom:10, letterSpacing:'-0.5px' }}>Epsilon ERP</div>
          <div style={{ fontSize:15, color:'#93C5FD', marginBottom:48, lineHeight:1.6 }}>Integrated enterprise management platform for modern businesses</div>
          {[
            { icon:'🏢', title:'Multi-Company',     desc:'Manage multiple companies from one dashboard' },
            { icon:'📊', title:'Real-time Analytics',desc:'Live insights into sales, purchases & stock' },
            { icon:'🌐', title:'Vendor Portal',      desc:'Vendors can self-register and track their orders' },
            { icon:'🔒', title:'Role-Based Access',  desc:'Secure user management with permissions' },
          ].map(f => (
            <div key={f.title} style={{ display:'flex', alignItems:'flex-start', gap:14, marginBottom:20, textAlign:'left' }}>
              <div style={{ width:38, height:38, borderRadius:10, background:'rgba(255,255,255,0.1)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, flexShrink:0 }}>{f.icon}</div>
              <div>
                <div style={{ fontSize:13, fontWeight:700, color:'#fff', marginBottom:2 }}>{f.title}</div>
                <div style={{ fontSize:12, color:'#93C5FD', lineHeight:1.5 }}>{f.desc}</div>
              </div>
            </div>
          ))}
        </div>
        <div style={{ position:'relative', zIndex:1, marginTop:40, fontSize:11, color:'rgba(147,197,253,0.6)', textAlign:'center' }}>© 2024 Epsilon Enterprise · All rights reserved</div>
      </div>

      {/* ── Right Panel — Login Form ── */}
      <div style={{ width:480, display:'flex', flexDirection:'column', justifyContent:'center', alignItems:'center', padding:'48px 56px', background:'#fff', boxShadow:'-20px 0 60px rgba(0,0,0,0.25)' }}>
        <div style={{ width:'100%', maxWidth:360 }}>

          {/* ── Mode Toggle ── */}
          <div style={{ display:'flex', background:'#F1F5F9', borderRadius:12, padding:4, marginBottom:28, border:'1px solid #E5E7EB' }}>
            {[
              { id:'company', label:'🏢 Company Login'  },
              { id:'vendor',  label:'🌐 Vendor Login'   },
            ].map(m => (
              <button key={m.id} type="button" onClick={() => { setMode(m.id); setError(''); }} style={{
                flex:1, padding:'9px 0', borderRadius:9, border:'none', cursor:'pointer', fontFamily:F, fontSize:13, fontWeight: mode===m.id?700:500,
                background: mode===m.id?'#fff':'transparent',
                color: mode===m.id?P:'#64748b',
                boxShadow: mode===m.id?'0 1px 4px rgba(0,0,0,0.1)':'none',
                transition:'all 0.15s',
              }}>{m.label}</button>
            ))}
          </div>

          <div style={{ marginBottom:28 }}>
            <div style={{ fontSize:24, fontWeight:800, color:'#0F172A', letterSpacing:'-0.5px', marginBottom:5 }}>
              {isVendor ? 'Vendor Portal' : 'Welcome back'}
            </div>
            <div style={{ fontSize:13, color:'#6B7280' }}>
              {isVendor ? 'Sign in to your vendor account to view orders & payments' : 'Sign in to your Epsilon ERP account'}
            </div>
          </div>

          <form onSubmit={handleSubmit} autoComplete="off">

            {/* Company: username / Vendor: email */}
            <div style={{ marginBottom:16 }}>
              <label style={{ fontSize:13, fontWeight:600, color:'#374151', display:'block', marginBottom:6 }}>
                {isVendor ? 'Email Address' : 'Username or Email'}
              </label>
              {isVendor ? (
                <input type="email" value={email} autoFocus onChange={e=>{setEmail(e.target.value);setError('');}}
                  onFocus={()=>setFocusU(true)} onBlur={()=>setFocusU(false)} placeholder="vendor@company.com" style={inp(focusU)} />
              ) : (
                <input type="text" value={username} autoFocus onChange={e=>{setUsername(e.target.value);setError('');}}
                  onFocus={()=>setFocusU(true)} onBlur={()=>setFocusU(false)} placeholder="Enter your username" style={inp(focusU)} />
              )}
            </div>

            <div style={{ marginBottom:8 }}>
              <label style={{ fontSize:13, fontWeight:600, color:'#374151', display:'block', marginBottom:6 }}>Password</label>
              <div style={{ position:'relative' }}>
                <input type={showPwd?'text':'password'} value={password}
                  onChange={e=>{setPassword(e.target.value);setError('');}}
                  onFocus={()=>setFocusP(true)} onBlur={()=>setFocusP(false)}
                  placeholder="Enter your password" style={{ ...inp(focusP), paddingRight:44 }} />
                <button type="button" onClick={()=>setShowPwd(p=>!p)} style={{ position:'absolute', right:12, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', color:'#9CA3AF', fontSize:18, lineHeight:1, padding:2 }}>
                  {showPwd?'🙈':'👁️'}
                </button>
              </div>
            </div>

            {error && (
              <div style={{ marginBottom:14, padding:'10px 14px', borderRadius:8, background:'#FEF2F2', border:'1px solid #FECACA', borderLeft:'3px solid #EF4444', fontSize:13, color:'#DC2626', fontWeight:500, display:'flex', alignItems:'center', gap:8 }}>
                <span>⚠️</span>{error}
              </div>
            )}

            <button type="submit" disabled={loading} style={{ width:'100%', height:48, borderRadius:10, border:'none', cursor:loading?'not-allowed':'pointer',
              background:loading?'#93C5FD':`linear-gradient(135deg,${isVendor?'#059669,#047857':P+','+PD})`,
              color:'#fff', fontSize:15, fontWeight:700, fontFamily:F, marginTop:8,
              boxShadow:loading?'none':`0 4px 16px rgba(37,99,235,0.35)`, transition:'all 0.18s' }}>
              {loading ? '⏳ Signing in…' : isVendor ? '🌐 Vendor Sign In →' : 'Sign In →'}
            </button>
          </form>

          {/* Vendor register + forgot password links */}
          {isVendor && (
            <div style={{ marginTop:18, display:'flex', flexDirection:'column', gap:8, alignItems:'center' }}>
              <div style={{ fontSize:13, color:'#374151' }}>
                New vendor?{' '}
                <button type="button" onClick={()=>navigate('/vendor-register')} style={{ background:'none', border:'none', color:P, fontWeight:700, cursor:'pointer', fontSize:13, fontFamily:F, textDecoration:'underline' }}>
                  Register here
                </button>
              </div>
              <button type="button" onClick={()=>navigate('/vendor-forgot-password')} style={{ background:'none', border:'none', color:'#6B7280', fontWeight:500, cursor:'pointer', fontSize:12.5, fontFamily:F, textDecoration:'underline' }}>
                Forgot password?
              </button>
            </div>
          )}

          {/* Company credentials hint */}
          {!isVendor && (
            <div style={{ marginTop:24, padding:'12px 16px', borderRadius:10, background:'#F0FDF4', border:'1px solid #BBF7D0', fontSize:12, color:'#16A34A' }}>
              <div style={{ fontWeight:700, marginBottom:4 }}>Default credentials</div>
              <div>Username: <strong>admin</strong> &nbsp;·&nbsp; Password: <strong>admin123</strong></div>
            </div>
          )}

          <div style={{ marginTop:20, textAlign:'center', fontSize:12, color:'#9CA3AF' }}>
            {isVendor ? 'Having issues? Contact your procurement team' : 'Having trouble? Contact your system administrator'}
          </div>
        </div>
      </div>
    </div>
  );
}
