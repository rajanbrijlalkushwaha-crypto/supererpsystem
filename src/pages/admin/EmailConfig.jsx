import React, { useState, useEffect } from 'react';
import axios from 'axios';

const F  = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const P  = '#2563EB';
const BD = '#E5E7EB';

const Row = ({ label, hint, children }) => (
  <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
    <label style={{ fontSize:12, fontWeight:600, color:'#374151', fontFamily:F }}>{label}</label>
    {children}
    {hint && <div style={{ fontSize:11, color:'#9CA3AF' }}>{hint}</div>}
  </div>
);

const inp = (err) => ({
  width:'100%', height:36, padding:'0 10px', fontSize:13, fontFamily:F,
  border:`1px solid ${err?'#EF4444':BD}`, borderRadius:6, outline:'none',
  background:'#fff', boxSizing:'border-box',
});

const PROVIDERS = [
  { value:'gmail',   label:'Gmail (Google)', host:'smtp.gmail.com', port:587 },
  { value:'outlook', label:'Outlook / Hotmail', host:'smtp.office365.com', port:587 },
  { value:'yahoo',   label:'Yahoo Mail', host:'smtp.mail.yahoo.com', port:587 },
  { value:'custom',  label:'Custom SMTP', host:'', port:'' },
];

export default function EmailConfig() {
  const [form, setForm]     = useState({ service:'gmail', email:'', password:'', fromName:'Epsilon Enterprise', host:'', port:'', secure:false });
  const [hasPassword, setHasPassword] = useState(false);
  const [saving, setSaving]   = useState(false);
  const [testing, setTesting] = useState(false);
  const [msg, setMsg]         = useState(null);

  useEffect(() => {
    axios.get('/api/auth/email-config')
      .then(r => {
        setForm(f => ({ ...f, ...r.data }));
        setHasPassword(r.data.hasPassword || false);
      })
      .catch(() => {});
  }, []);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleProviderChange = (service) => {
    const p = PROVIDERS.find(p => p.value === service) || {};
    setForm(f => ({ ...f, service, host: p.host || '', port: p.port || '' }));
  };

  const handleSave = async () => {
    if (!form.email) { setMsg({ type:'error', text:'Email address is required.' }); return; }
    setSaving(true); setMsg(null);
    try {
      const payload = { ...form };
      if (!payload.password) delete payload.password; // don't overwrite with empty
      const res = await axios.post('/api/auth/email-config', payload);
      setHasPassword(res.data.config?.hasPassword || false);
      setForm(f => ({ ...f, password:'' })); // clear password field after save
      setMsg({ type:'success', text:'Email configuration saved successfully.' });
    } catch (e) {
      setMsg({ type:'error', text: e.response?.data?.error || e.message });
    } finally { setSaving(false); }
  };

  const handleTest = async () => {
    setTesting(true); setMsg(null);
    try {
      const res = await axios.post('/api/auth/email-config/test');
      setMsg({ type:'success', text: res.data.message });
    } catch (e) {
      setMsg({ type:'error', text: e.response?.data?.error || e.message });
    } finally { setTesting(false); }
  };

  return (
    <div style={{ fontFamily:F, maxWidth:600 }}>
      <div style={{ marginBottom:18 }}>
        <div style={{ fontSize:14, fontWeight:700, color:'#1E293B' }}>📧 Email Configuration</div>
        <div style={{ fontSize:12, color:'#64748b', marginTop:3 }}>
          Configure SMTP to send OTPs for vendor registration and password reset emails.
        </div>
      </div>

      {msg && (
        <div style={{ padding:'10px 14px', borderRadius:6, fontSize:12.5, fontWeight:600, marginBottom:16,
          background: msg.type==='success'?'#ECFDF5':'#FEF2F2',
          color: msg.type==='success'?'#065F46':'#991B1B',
          border:`1px solid ${msg.type==='success'?'#A7F3D0':'#FECACA'}` }}>
          {msg.type==='success'?'✅':'❌'} {msg.text}
          <button onClick={()=>setMsg(null)} style={{ float:'right', background:'none', border:'none', cursor:'pointer', fontSize:14, color:'inherit' }}>×</button>
        </div>
      )}

      <div style={{ background:'#fff', border:`1px solid ${BD}`, borderRadius:10, padding:22, display:'flex', flexDirection:'column', gap:14 }}>

        <Row label="Email Provider">
          <select style={inp()} value={form.service} onChange={e=>handleProviderChange(e.target.value)}>
            {PROVIDERS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </Row>

        {form.service === 'custom' && (
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <Row label="SMTP Host">
              <input style={inp()} value={form.host} onChange={e=>set('host',e.target.value)} placeholder="smtp.example.com" />
            </Row>
            <Row label="SMTP Port">
              <input style={inp()} value={form.port} onChange={e=>set('port',e.target.value)} placeholder="587" />
            </Row>
          </div>
        )}

        <Row label="From Email Address" hint={form.service==='gmail'?'Use a Gmail account. For Gmail, use App Password (not your regular password).':''}>
          <input style={inp(!form.email)} value={form.email} type="email" onChange={e=>set('email',e.target.value)} placeholder="your@email.com" />
        </Row>

        <Row label={hasPassword ? 'App Password (leave blank to keep existing)' : 'App Password'}
          hint={form.service==='gmail'?'Gmail → My Account → Security → 2-Step Verification → App Passwords':''}>
          <input style={inp()} value={form.password} type="password" onChange={e=>set('password',e.target.value)} placeholder={hasPassword?'••••••••••••• (saved)':'Enter app password'} />
        </Row>

        <Row label="Display Name (From Name)">
          <input style={inp()} value={form.fromName} onChange={e=>set('fromName',e.target.value)} placeholder="Epsilon Enterprise" />
        </Row>

        {/* Gmail guide */}
        {form.service === 'gmail' && (
          <div style={{ background:'#EFF6FF', border:'1px solid #BFDBFE', borderRadius:8, padding:'12px 14px', fontSize:11.5, color:'#1E40AF', lineHeight:1.7 }}>
            <strong>How to get a Gmail App Password:</strong><br/>
            1. Go to <strong>myaccount.google.com</strong> → Security<br/>
            2. Enable <strong>2-Step Verification</strong><br/>
            3. Search for <strong>App Passwords</strong><br/>
            4. Create an app password for "Mail" → Copy the 16-char password<br/>
            5. Paste it above (without spaces)
          </div>
        )}

        <div style={{ display:'flex', gap:10, paddingTop:4 }}>
          <button onClick={handleSave} disabled={saving} style={{ flex:1, padding:'9px 0', borderRadius:7, cursor:saving?'not-allowed':'pointer', background:saving?'#93C5FD':P, border:'none', color:'#fff', fontSize:13, fontWeight:700, fontFamily:F, opacity:saving?0.7:1 }}>
            {saving ? '⏳ Saving…' : '💾 Save Configuration'}
          </button>
          <button onClick={handleTest} disabled={testing||!hasPassword} title={!hasPassword?'Save config first':'Test connection'} style={{ padding:'9px 18px', borderRadius:7, cursor:testing||!hasPassword?'not-allowed':'pointer', background:'#fff', border:`1px solid ${BD}`, color: !hasPassword?'#9CA3AF':'#374151', fontSize:13, fontWeight:600, fontFamily:F, opacity:testing?0.7:1 }}>
            {testing ? '⏳ Testing…' : '🧪 Test Connection'}
          </button>
        </div>
      </div>

      <div style={{ marginTop:16, padding:'12px 14px', background:'#FFFBEB', border:'1px solid #FDE68A', borderRadius:8, fontSize:11.5, color:'#92400E' }}>
        <strong>⚠️ Note:</strong> Email credentials are stored on the server. Make sure to use App Passwords (not your account password) for Gmail. The password is never returned to the browser after saving.
      </div>
    </div>
  );
}
