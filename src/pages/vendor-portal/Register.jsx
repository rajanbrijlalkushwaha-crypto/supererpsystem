import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

const F  = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const P  = '#2563EB';

const STATES = [
  'Andhra Pradesh','Arunachal Pradesh','Assam','Bihar','Chhattisgarh','Goa','Gujarat',
  'Haryana','Himachal Pradesh','Jharkhand','Karnataka','Kerala','Madhya Pradesh',
  'Maharashtra','Manipur','Meghalaya','Mizoram','Nagaland','Odisha','Punjab','Rajasthan',
  'Sikkim','Tamil Nadu','Telangana','Tripura','Uttar Pradesh','Uttarakhand','West Bengal',
  'Delhi','Chandigarh','Puducherry','Jammu and Kashmir','Ladakh','Goa',
];

const inp = (err) => ({
  width:'100%', height:36, padding:'0 10px', fontSize:12.5, fontFamily:F,
  border:`1px solid ${err?'#EF4444':'#D1D5DB'}`, borderRadius:6,
  background:'#fff', outline:'none', boxSizing:'border-box',
});

const STEPS = ['Basic Info', 'Contact & Address', 'Banking', 'OTP Verify'];

const Row = ({ label, req, children }) => (
  <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
    <label style={{ fontSize:11.5, fontWeight:600, color:'#374151', fontFamily:F }}>
      {label}{req && <span style={{ color:'#EF4444' }}> *</span>}
    </label>
    {children}
  </div>
);

export default function VendorRegister() {
  const navigate = useNavigate();
  const [step, setStep]       = useState(0);
  const [otpSent, setOtpSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg]         = useState(null);
  const [submitted, setSubmitted] = useState(null); // { trackingNo }
  const [form, setForm]       = useState({
    vendorName:'', businessType:'', industryType:'', gst:'', pan:'', cin:'', msme:'',
    contactPerson:'', mobile:'', email:'', website:'',
    address:'', city:'', state:'', pincode:'', country:'India',
    bankName:'', accountHolder:'', accountNo:'', ifsc:'', branch:'',
    password:'', confirmPassword:'', otp:'',
  });

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const err = (cond, msg) => cond ? msg : '';

  const sendOTP = async () => {
    if (!form.email) { setMsg({ type:'error', text:'Enter your email first.' }); return; }
    if (!form.password || form.password.length < 6) { setMsg({ type:'error', text:'Set a password (min 6 chars) before sending OTP.' }); return; }
    if (form.password !== form.confirmPassword) { setMsg({ type:'error', text:'Passwords do not match.' }); return; }
    setSending(true); setMsg(null);
    try {
      const res = await axios.post('/api/vendor-portal/send-otp', { email: form.email });
      setOtpSent(true);
      const txt = res.data.message || `OTP sent to ${form.email}. Check your inbox.`;
      setMsg({ type:'success', text: txt });
      if (res.data.devOtp) setMsg({ type:'success', text: `OTP: ${res.data.devOtp} (email delivery failed — use this OTP)` });
    } catch (e) {
      setMsg({ type:'error', text: e.response?.data?.error || e.message });
    } finally { setSending(false); }
  };

  const handleSubmit = async () => {
    if (!form.otp) { setMsg({ type:'error', text:'Enter the OTP.' }); return; }
    setSubmitting(true); setMsg(null);
    try {
      const res = await axios.post('/api/vendor-portal/register', form);
      setSubmitted({ trackingNo: res.data.trackingNo });
    } catch (e) {
      setMsg({ type:'error', text: e.response?.data?.error || e.message });
    } finally { setSubmitting(false); }
  };

  if (submitted) return (
    <div style={{ minHeight:'100vh', background:'linear-gradient(135deg,#1E293B 0%,#2563EB 100%)', display:'flex', alignItems:'center', justifyContent:'center', padding:'20px', fontFamily:F }}>
      <div style={{ background:'#fff', borderRadius:14, boxShadow:'0 24px 60px rgba(0,0,0,0.25)', width:'100%', maxWidth:480, overflow:'hidden' }}>
        <div style={{ background:'linear-gradient(135deg,#1E293B,#2563EB)', padding:'24px 28px' }}>
          <div style={{ fontSize:11, color:'rgba(255,255,255,0.6)', fontWeight:500, textTransform:'uppercase', letterSpacing:'0.8px', marginBottom:6 }}>Epsilon Enterprise</div>
          <div style={{ fontSize:20, fontWeight:800, color:'#fff' }}>Registration Submitted!</div>
        </div>
        <div style={{ padding:'32px 28px', textAlign:'center' }}>
          <div style={{ fontSize:56, marginBottom:16 }}>🎉</div>
          <div style={{ fontSize:16, fontWeight:700, color:'#1E293B', marginBottom:8 }}>Thank you for registering!</div>
          <div style={{ fontSize:13, color:'#64748b', lineHeight:1.7, marginBottom:24 }}>
            Your vendor registration has been submitted for review. You will be notified by email once approved.
          </div>
          <div style={{ background:'#EFF6FF', border:'2px dashed #93C5FD', borderRadius:10, padding:'18px 20px', marginBottom:24 }}>
            <div style={{ fontSize:11, color:'#2563EB', fontWeight:700, textTransform:'uppercase', letterSpacing:'2px', marginBottom:8 }}>Your Tracking Number</div>
            <div style={{ fontSize:24, fontWeight:900, color:'#1D4ED8', letterSpacing:4 }}>{submitted.trackingNo}</div>
            <div style={{ fontSize:11.5, color:'#64748B', marginTop:8 }}>Keep this number to track your registration status</div>
          </div>
          <div style={{ background:'#FFFBEB', border:'1px solid #FDE68A', borderRadius:8, padding:'10px 14px', marginBottom:24, fontSize:12, color:'#92400E', textAlign:'left' }}>
            <strong>Next steps:</strong>
            <ol style={{ margin:'6px 0 0', paddingLeft:18, lineHeight:1.8 }}>
              <li>Our team will review your application</li>
              <li>You'll receive an email once approved</li>
              <li>After approval, log in using your email &amp; password</li>
            </ol>
          </div>
          <button onClick={() => navigate('/login')} style={{ width:'100%', padding:'10px 0', borderRadius:8, cursor:'pointer', background:P, border:'none', color:'#fff', fontSize:14, fontWeight:700, fontFamily:F }}>
            Go to Login →
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight:'100vh', background:'linear-gradient(135deg,#1E293B 0%,#2563EB 100%)', display:'flex', alignItems:'center', justifyContent:'center', padding:'20px', fontFamily:F }}>
      <div style={{ background:'#fff', borderRadius:14, boxShadow:'0 24px 60px rgba(0,0,0,0.25)', width:'100%', maxWidth:620, overflow:'hidden' }}>

        {/* Header */}
        <div style={{ background:'linear-gradient(135deg,#1E293B,#2563EB)', padding:'24px 28px' }}>
          <div style={{ fontSize:11, color:'rgba(255,255,255,0.6)', fontWeight:500, textTransform:'uppercase', letterSpacing:'0.8px', marginBottom:6 }}>Epsilon Enterprise</div>
          <div style={{ fontSize:20, fontWeight:800, color:'#fff' }}>Vendor Self-Registration</div>
          <div style={{ fontSize:12, color:'rgba(255,255,255,0.65)', marginTop:4 }}>Fill the form below and verify your email to register</div>
        </div>

        {/* Step indicator */}
        <div style={{ display:'flex', padding:'14px 28px 0', gap:0 }}>
          {STEPS.map((s, i) => (
            <div key={s} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
              <div style={{ width:'100%', display:'flex', alignItems:'center' }}>
                {i > 0 && <div style={{ flex:1, height:2, background: i<=step?P:'#E5E7EB' }} />}
                <div style={{ width:24, height:24, borderRadius:'50%', flexShrink:0,
                  background: i<step?P: i===step?P:'#E5E7EB',
                  color: i<=step?'#fff':'#9CA3AF', fontSize:11, fontWeight:700,
                  display:'flex', alignItems:'center', justifyContent:'center' }}>
                  {i < step ? '✓' : i + 1}
                </div>
                {i < STEPS.length-1 && <div style={{ flex:1, height:2, background: i<step?P:'#E5E7EB' }} />}
              </div>
              <div style={{ fontSize:10, color: i===step?P:'#9CA3AF', fontWeight: i===step?700:400, textAlign:'center' }}>{s}</div>
            </div>
          ))}
        </div>

        {/* Body */}
        <div style={{ padding:'20px 28px' }}>
          {msg && (
            <div style={{ padding:'10px 14px', borderRadius:6, fontSize:12, fontWeight:600, marginBottom:14,
              background: msg.type==='success'?'#ECFDF5':'#FEF2F2',
              color: msg.type==='success'?'#065F46':'#991B1B',
              border:`1px solid ${msg.type==='success'?'#A7F3D0':'#FECACA'}` }}>
              {msg.text}
            </div>
          )}

          {/* Step 0: Basic Info */}
          {step === 0 && (
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
              <div style={{ gridColumn:'1/-1' }}>
                <Row label="Company / Vendor Name" req>
                  <input style={inp(!form.vendorName)} value={form.vendorName} onChange={e=>set('vendorName',e.target.value)} placeholder="Full legal name" />
                </Row>
              </div>
              <Row label="Business Type" req>
                <select style={inp(!form.businessType)} value={form.businessType} onChange={e=>set('businessType',e.target.value)}>
                  <option value="">— Select —</option>
                  {['Proprietorship','Partnership','Private Limited','Public Limited','LLP','Government','Individual','Trust / NGO','HUF'].map(o=><option key={o} value={o}>{o}</option>)}
                </select>
              </Row>
              <Row label="Industry Type">
                <select style={inp()} value={form.industryType} onChange={e=>set('industryType',e.target.value)}>
                  <option value="">— Select —</option>
                  {['Manufacturing','Trading','Services','Construction','Consulting','Logistics','Others'].map(o=><option key={o} value={o}>{o}</option>)}
                </select>
              </Row>
              <Row label="GST Number">
                <input style={inp()} value={form.gst} maxLength={15} onChange={e=>set('gst',e.target.value.toUpperCase())} placeholder="22AAAAA0000A1Z5" />
              </Row>
              <Row label="PAN Number">
                <input style={inp()} value={form.pan} maxLength={10} onChange={e=>set('pan',e.target.value.toUpperCase())} placeholder="ABCDE1234F" />
              </Row>
              <Row label="CIN Number">
                <input style={inp()} value={form.cin} onChange={e=>set('cin',e.target.value.toUpperCase())} placeholder="Optional" />
              </Row>
              <Row label="MSME / Udyam No.">
                <input style={inp()} value={form.msme} onChange={e=>set('msme',e.target.value.toUpperCase())} placeholder="Optional" />
              </Row>
            </div>
          )}

          {/* Step 1: Contact & Address */}
          {step === 1 && (
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
              <Row label="Contact Person" req>
                <input style={inp(!form.contactPerson)} value={form.contactPerson} onChange={e=>set('contactPerson',e.target.value)} placeholder="Full name" />
              </Row>
              <Row label="Mobile Number" req>
                <input style={inp(!form.mobile)} value={form.mobile} maxLength={10} onChange={e=>set('mobile',e.target.value.replace(/\D/g,''))} placeholder="10-digit" />
              </Row>
              <Row label="Email Address" req>
                <input style={inp(!form.email)} value={form.email} type="email" onChange={e=>set('email',e.target.value)} placeholder="vendor@company.com" />
              </Row>
              <Row label="Website">
                <input style={inp()} value={form.website} onChange={e=>set('website',e.target.value)} placeholder="https://..." />
              </Row>
              <div style={{ gridColumn:'1/-1' }}>
                <Row label="Address" req>
                  <textarea value={form.address} onChange={e=>set('address',e.target.value)} rows={2}
                    placeholder="Full address" style={{ ...inp(!form.address), height:'auto', padding:'8px 10px', resize:'vertical' }} />
                </Row>
              </div>
              <Row label="City" req>
                <input style={inp(!form.city)} value={form.city} onChange={e=>set('city',e.target.value)} placeholder="City" />
              </Row>
              <Row label="State" req>
                <select style={inp(!form.state)} value={form.state} onChange={e=>set('state',e.target.value)}>
                  <option value="">— Select —</option>
                  {STATES.map(s=><option key={s} value={s}>{s}</option>)}
                </select>
              </Row>
              <Row label="Pincode">
                <input style={inp()} value={form.pincode} maxLength={6} onChange={e=>set('pincode',e.target.value.replace(/\D/g,''))} placeholder="6-digit" />
              </Row>
              <Row label="Country">
                <input style={inp()} value={form.country} onChange={e=>set('country',e.target.value)} />
              </Row>
            </div>
          )}

          {/* Step 2: Banking */}
          {step === 2 && (
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
              <Row label="Bank Name">
                <input style={inp()} value={form.bankName} onChange={e=>set('bankName',e.target.value)} placeholder="e.g. State Bank of India" />
              </Row>
              <Row label="Account Holder Name">
                <input style={inp()} value={form.accountHolder} onChange={e=>set('accountHolder',e.target.value)} placeholder="Name on account" />
              </Row>
              <Row label="Account Number">
                <input style={inp()} value={form.accountNo} onChange={e=>set('accountNo',e.target.value)} placeholder="Bank account number" />
              </Row>
              <Row label="IFSC Code">
                <input style={inp()} value={form.ifsc} maxLength={11} onChange={e=>set('ifsc',e.target.value.toUpperCase())} placeholder="SBIN0001234" />
              </Row>
              <Row label="Branch">
                <input style={inp()} value={form.branch} onChange={e=>set('branch',e.target.value)} placeholder="Branch city/name" />
              </Row>
              <div />
              <Row label="Set Password" req>
                <input style={inp(!form.password)} type="password" value={form.password} onChange={e=>set('password',e.target.value)} placeholder="Min 6 characters" />
              </Row>
              <Row label="Confirm Password" req>
                <input style={inp(form.confirmPassword && form.password !== form.confirmPassword)} type="password" value={form.confirmPassword} onChange={e=>set('confirmPassword',e.target.value)} placeholder="Re-enter password" />
                {form.confirmPassword && form.password !== form.confirmPassword && (
                  <div style={{ fontSize:11, color:'#EF4444' }}>Passwords do not match</div>
                )}
              </Row>
            </div>
          )}

          {/* Step 3: OTP Verify */}
          {step === 3 && (
            <div style={{ maxWidth:380, margin:'0 auto', display:'flex', flexDirection:'column', gap:14 }}>
              <div style={{ textAlign:'center', padding:'8px 0' }}>
                <div style={{ fontSize:36, marginBottom:8 }}>📧</div>
                <div style={{ fontSize:14, fontWeight:700, color:'#1E293B' }}>Verify your Email</div>
                <div style={{ fontSize:12, color:'#64748b', marginTop:4 }}>We'll send a 6-digit OTP to <strong>{form.email}</strong></div>
              </div>
              <button type="button" onClick={sendOTP} disabled={sending} style={{
                padding:'9px 0', borderRadius:7, cursor: sending?'not-allowed':'pointer',
                background: otpSent?'#ECFDF5':'#2563EB', border: otpSent?'1px solid #A7F3D0':'none',
                color: otpSent?'#065F46':'#fff', fontSize:13, fontWeight:700, fontFamily:F,
                opacity: sending?0.7:1,
              }}>
                {sending ? '⏳ Sending…' : otpSent ? '✅ OTP Sent — Resend' : '📤 Send OTP'}
              </button>
              {otpSent && (
                <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                  <label style={{ fontSize:12, fontWeight:600, color:'#374151' }}>Enter OTP</label>
                  <input value={form.otp} onChange={e=>set('otp',e.target.value)} maxLength={6} placeholder="6-digit OTP"
                    style={{ ...inp(!form.otp), textAlign:'center', fontSize:20, fontWeight:700, letterSpacing:8 }} />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding:'14px 28px 20px', display:'flex', justifyContent:'space-between', alignItems:'center', borderTop:'1px solid #F1F5F9' }}>
          <div style={{ display:'flex', gap:8 }}>
            {step > 0 && (
              <button onClick={() => setStep(s=>s-1)} style={{ padding:'8px 18px', borderRadius:7, cursor:'pointer', background:'#fff', border:'1px solid #D1D5DB', color:'#374151', fontSize:12.5, fontWeight:600, fontFamily:F }}>◀ Back</button>
            )}
            <button onClick={() => navigate('/login')} style={{ padding:'8px 18px', borderRadius:7, cursor:'pointer', background:'#fff', border:'1px solid #D1D5DB', color:'#6B7280', fontSize:12.5, fontWeight:600, fontFamily:F }}>Already registered? Login</button>
          </div>
          {step < 3 ? (
            <button onClick={() => setStep(s=>s+1)} style={{ padding:'8px 22px', borderRadius:7, cursor:'pointer', background:P, border:'none', color:'#fff', fontSize:12.5, fontWeight:700, fontFamily:F }}>Next ▶</button>
          ) : (
            <button onClick={handleSubmit} disabled={submitting||!form.otp} style={{ padding:'8px 22px', borderRadius:7, cursor:submitting?'not-allowed':'pointer', background:'#059669', border:'none', color:'#fff', fontSize:12.5, fontWeight:700, fontFamily:F, opacity:submitting?0.7:1 }}>
              {submitting ? '⏳ Submitting…' : '✅ Complete Registration'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
