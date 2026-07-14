import React, { useState } from 'react';
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

const STATES = [
  'Andhra Pradesh','Arunachal Pradesh','Assam','Bihar','Chhattisgarh','Goa','Gujarat',
  'Haryana','Himachal Pradesh','Jharkhand','Karnataka','Kerala','Madhya Pradesh',
  'Maharashtra','Manipur','Meghalaya','Mizoram','Nagaland','Odisha','Punjab','Rajasthan',
  'Sikkim','Tamil Nadu','Telangana','Tripura','Uttar Pradesh','Uttarakhand','West Bengal',
  'Delhi','Chandigarh','Puducherry','Jammu and Kashmir','Ladakh',
];

const STEPS = ['Basic Info', 'Contact & Address', 'Banking & Password', 'OTP Verify'];

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

.vr-wrapper { height:100vh; overflow-y:auto; }
.vr-left  { width:60%; flex-shrink:0; }
.vr-right { width:40%; flex-shrink:0; overflow-y:auto; }

@media (max-width: 860px) {
  .vr-wrapper { height:auto; min-height:100vh; }
  .vr-left  { display:none !important; }
  .vr-right { width:100% !important; min-width:0 !important; }
}

.vr-field {
  width:100%; height:30px; padding:0 10px;
  border:1.5px solid #AAAAAA;
  font-size:12.5px; font-family:${F};
  background:#FFFFFF; color:#111; outline:none;
  border-radius:2px;
  transition:border-color 0.15s, box-shadow 0.15s;
}
.vr-field:focus { border-color:#3A6186; box-shadow:0 0 0 3px rgba(58,97,134,0.15); }
.vr-field.err   { border-color:#CC0000; }
.vr-select {
  height:30px; padding:0 8px;
  border:1.5px solid #AAAAAA; border-radius:2px;
  font-size:12.5px; font-family:${F};
  background:#FFFFFF; color:#111; cursor:pointer; outline:none;
  width:100%;
}
.vr-select.err { border-color:#CC0000; }
.vr-label {
  font-size:12px; font-weight:600; color:#2C2C2C;
  padding-right:14px; white-space:nowrap; vertical-align:middle;
  width:140px; padding-top:9px; padding-bottom:9px;
}
.vr-cell { padding:6px 0; vertical-align:middle; }
.vr-btn {
  height:30px; padding:0 20px;
  background:linear-gradient(180deg,#4A7FAA 0%,#2D5F8A 100%);
  border:1px solid #1E4A70;
  font-size:12.5px; font-family:${F}; font-weight:700;
  cursor:pointer; color:#fff; border-radius:3px;
  transition:all 0.15s; white-space:nowrap;
}
.vr-btn:hover:not(:disabled) { background:linear-gradient(180deg,#5A8FBA 0%,#3D6F9A 100%); }
.vr-btn:disabled { opacity:0.6; cursor:not-allowed; }
.vr-btn-back {
  background:none; border:none; cursor:pointer; color:#3A6186;
  font-size:12px; text-decoration:underline; font-family:${F}; padding:0;
}
.vr-btn-green {
  height:30px; padding:0 20px;
  background:linear-gradient(180deg,#27AE60 0%,#1E8449 100%);
  border:1px solid #1A7040;
  font-size:12.5px; font-family:${F}; font-weight:700;
  cursor:pointer; color:#fff; border-radius:3px; white-space:nowrap;
}
.vr-btn-green:disabled { opacity:0.6; cursor:not-allowed; }
`;

function OrbitRing({ radius, modules, duration, reverse, iconSize=42 }) {
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
          <div key={name} style={{ position:'absolute', left:x, top:y, width:iconSize, height:iconSize, animation:`${reverse?'counterOut':'counterIn'} ${duration}s linear infinite` }}>
            <div style={{ width:'100%', height:'100%', borderRadius:12, background:m.bg, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', boxShadow:'0 3px 10px rgba(0,0,0,0.1)', border:`1.5px solid ${m.fg}22` }}>
              <span style={{ fontSize:iconSize*0.36, lineHeight:1 }}>{m.symbol}</span>
              <span style={{ fontSize:8, fontWeight:700, color:m.fg, marginTop:2, letterSpacing:'0.02em' }}>{name.toUpperCase()}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

const FRow = ({ label, req, children }) => (
  <tr>
    <td className="vr-label">{label}{req && <span style={{ color:'#CC0000' }}> *</span>}</td>
    <td className="vr-cell">{children}</td>
  </tr>
);

export default function VendorRegister() {
  const navigate = useNavigate();
  const [step, setStep]         = useState(0);
  const [otpSent, setOtpSent]   = useState(false);
  const [sending, setSending]   = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg]           = useState(null);
  const [submitted, setSubmitted] = useState(null);
  const [form, setForm] = useState({
    vendorName:'', businessType:'', industryType:'', gst:'', pan:'', cin:'', msme:'',
    contactPerson:'', mobile:'', email:'', website:'',
    address:'', city:'', state:'', pincode:'', country:'India',
    bankName:'', accountHolder:'', accountNo:'', ifsc:'', branch:'',
    password:'', confirmPassword:'', otp:'',
  });

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const sendOTP = async () => {
    if (!form.email) { setMsg({ type:'error', text:'Enter your email first.' }); return; }
    if (!form.password || form.password.length < 6) { setMsg({ type:'error', text:'Set a password (min 6 chars) before sending OTP.' }); return; }
    if (form.password !== form.confirmPassword) { setMsg({ type:'error', text:'Passwords do not match.' }); return; }
    setSending(true); setMsg(null);
    try {
      const res = await axios.post('/api/vendor-portal/send-otp', { email: form.email });
      setOtpSent(true);
      const txt = res.data.message || `OTP sent to ${form.email}. Check your inbox.`;
      setMsg({ type:'success', text: res.data.devOtp ? `OTP: ${res.data.devOtp} (use this OTP)` : txt });
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

  /* ── Shared left panel ── */
  const LeftPanel = () => (
    <div className="vr-left" style={{ position:'relative', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', background:'#EDEAE4', overflow:'hidden', minHeight:'100vh' }}>
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

  /* ── Success screen ── */
  if (submitted) return (
    <>
      <style>{CSS}</style>
      <div className="vr-wrapper" style={{ display:'flex', fontFamily:F, background:'#fff' }}>
        <LeftPanel />
        <div className="vr-right" style={{ position:'relative', minHeight:'100vh', display:'flex', flexDirection:'column', background:'linear-gradient(160deg,#EDEAE4 0%,#EAE7E1 50%,#E3DFD8 100%)', boxShadow:'-6px 0 32px rgba(0,0,0,0.18)', overflow:'hidden', animation:'slideIn 0.5s ease both' }}>
          <svg style={{ position:'absolute', bottom:0, left:0, zIndex:1 }} width="160" height="240" viewBox="0 0 160 240"><polygon points="0,240 160,240 0,0" fill="#CC0000"/></svg>
          <div style={{ height:4, background:'linear-gradient(90deg,#CC0000,#3A6186)', zIndex:3, position:'relative' }} />
          <div style={{ padding:'20px 28px 0', textAlign:'right', position:'relative', zIndex:3 }}>
            <div style={{ display:'inline-flex', alignItems:'center', gap:8 }}>
              <div style={{ textAlign:'right' }}><div style={{ fontSize:19, fontWeight:900, color:'#CC0000' }}>Finacle ERP</div><div style={{ fontSize:9, color:'#888', letterSpacing:'1px', fontStyle:'italic' }}>Transforming Business</div></div>
              <div style={{ width:36, height:36, background:'#CC0000', borderRadius:4, display:'flex', alignItems:'center', justifyContent:'center' }}><span style={{ fontSize:18, color:'#fff', fontWeight:900 }}>⚡</span></div>
            </div>
          </div>
          <div style={{ flex:1, display:'flex', flexDirection:'column', justifyContent:'center', padding:'24px 48px 20px', position:'relative', zIndex:3, textAlign:'center' }}>
            <div style={{ fontSize:44, marginBottom:16 }}>🎉</div>
            <h1 style={{ fontSize:24, color:'#111', margin:'0 0 8px', letterSpacing:'-0.3px' }}><span style={{ fontWeight:300 }}>Registration </span><span style={{ fontWeight:900 }}>Submitted!</span></h1>
            <div style={{ width:'100%', height:1, background:'linear-gradient(90deg,transparent,#AAAAAA,transparent)', margin:'14px 0' }} />
            <div style={{ fontSize:13, color:'#555', lineHeight:1.7, marginBottom:20 }}>Your vendor registration has been submitted for review. You will be notified by email once approved.</div>
            <div style={{ background:'#EFF6FF', border:'1.5px solid #BAE6FD', borderRadius:3, padding:'16px', marginBottom:20 }}>
              <div style={{ fontSize:10, color:'#2563EB', fontWeight:700, textTransform:'uppercase', letterSpacing:'2px', marginBottom:8 }}>Your Tracking Number</div>
              <div style={{ fontSize:26, fontWeight:900, color:'#1D4ED8', letterSpacing:4 }}>{submitted.trackingNo}</div>
              <div style={{ fontSize:11, color:'#64748B', marginTop:6 }}>Keep this number to track your registration status</div>
            </div>
            <table style={{ borderCollapse:'collapse', width:'100%' }}>
              <tbody>
                <tr><td style={{ padding:'9px 0' }}><button className="vr-btn" onClick={() => navigate('/login')} style={{ width:'100%' }}>← Go to Login</button></td></tr>
              </tbody>
            </table>
          </div>
          <div style={{ textAlign:'right', padding:'0 28px 10px', position:'relative', zIndex:3 }}><div style={{ fontSize:28, fontWeight:900, color:'#003580', fontStyle:'italic', letterSpacing:'-0.5px' }}>Epsilongroup</div></div>
          <div style={{ textAlign:'center', fontSize:10, color:'#888', padding:'0 20px 14px', position:'relative', zIndex:3 }}>Copyright © 2024–2025 Epsilon Group Limited. All rights reserved. epsilonprefab.org</div>
        </div>
      </div>
    </>
  );

  return (
    <>
      <style>{CSS}</style>
      <div className="vr-wrapper" style={{ display:'flex', fontFamily:F, background:'#fff' }}>
        <LeftPanel />

        {/* ══ RIGHT — Finacle-style registration panel ══ */}
        <div className="vr-right" style={{ position:'relative', minHeight:'100vh', display:'flex', flexDirection:'column', background:'linear-gradient(160deg,#EDEAE4 0%,#EAE7E1 50%,#E3DFD8 100%)', boxShadow:'-6px 0 32px rgba(0,0,0,0.18)', animation:'slideIn 0.5s ease both' }}>
          <svg style={{ position:'absolute', bottom:0, left:0, zIndex:1 }} width="160" height="240" viewBox="0 0 160 240"><polygon points="0,240 160,240 0,0" fill="#CC0000"/></svg>
          <div style={{ height:4, background:'linear-gradient(90deg,#CC0000,#3A6186)', position:'relative', zIndex:3 }} />

          {/* Top-right brand */}
          <div style={{ padding:'16px 24px 0', textAlign:'right', position:'relative', zIndex:3 }}>
            <div style={{ display:'inline-flex', alignItems:'center', gap:8 }}>
              <div style={{ textAlign:'right' }}><div style={{ fontSize:19, fontWeight:900, color:'#CC0000' }}>Finacle ERP</div><div style={{ fontSize:9, color:'#888', letterSpacing:'1px', fontStyle:'italic' }}>Transforming Business</div></div>
              <div style={{ width:36, height:36, background:'#CC0000', borderRadius:4, display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 3px 10px rgba(204,0,0,0.35)' }}><span style={{ fontSize:18, color:'#fff', fontWeight:900 }}>⚡</span></div>
            </div>
          </div>

          {/* Title */}
          <div style={{ padding:'16px 40px 0', position:'relative', zIndex:3 }}>
            <h1 style={{ fontSize:24, color:'#111', margin:0, letterSpacing:'-0.4px' }}>
              <span style={{ fontWeight:300 }}>Vendor </span><span style={{ fontWeight:900 }}>Registration</span>
            </h1>
            <div style={{ fontSize:13, color:'#777', marginTop:4 }}>Universal Core ERP Solution — Vendor Portal</div>
            <div style={{ width:'100%', height:1, background:'linear-gradient(90deg,transparent,#AAAAAA,transparent)', marginTop:12 }} />
          </div>

          {/* Step indicator */}
          <div style={{ padding:'14px 40px 0', position:'relative', zIndex:3 }}>
            <div style={{ display:'flex', gap:0 }}>
              {STEPS.map((s, i) => (
                <div key={s} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:3 }}>
                  <div style={{ width:'100%', display:'flex', alignItems:'center' }}>
                    {i > 0 && <div style={{ flex:1, height:2, background: i<=step?'#3A6186':'#CCCCCC' }} />}
                    <div style={{ width:22, height:22, borderRadius:'50%', flexShrink:0, background: i<=step?'#3A6186':'#CCCCCC', color:'#fff', fontSize:10, fontWeight:700, display:'flex', alignItems:'center', justifyContent:'center' }}>
                      {i < step ? '✓' : i + 1}
                    </div>
                    {i < STEPS.length-1 && <div style={{ flex:1, height:2, background: i<step?'#3A6186':'#CCCCCC' }} />}
                  </div>
                  <div style={{ fontSize:9, color: i===step?'#3A6186':'#888', fontWeight: i===step?700:400, textAlign:'center' }}>{s}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Form body */}
          <div style={{ flex:1, padding:'12px 40px 16px', position:'relative', zIndex:3, overflowY:'auto' }}>

            {msg && (
              <div style={{ marginBottom:12, padding:'7px 10px', background: msg.type==='error'?'#FEE2E2':'#ECFDF5', border:`1px solid ${msg.type==='error'?'#FCA5A5':'#A7F3D0'}`, borderLeft:`3px solid ${msg.type==='error'?'#DC2626':'#059669'}`, fontSize:12, color: msg.type==='error'?'#DC2626':'#065F46', borderRadius:2, display:'flex', alignItems:'center', gap:6 }}>
                <span>{msg.type==='error'?'⚠':'✓'}</span> {msg.text}
              </div>
            )}

            {/* Step 0: Basic Info */}
            {step === 0 && (
              <table style={{ borderCollapse:'collapse', width:'100%' }}>
                <tbody>
                  <FRow label="Vendor Name" req><input className={`vr-field${!form.vendorName?'':''}`} value={form.vendorName} onChange={e=>set('vendorName',e.target.value)} placeholder="Full legal name" /></FRow>
                  <FRow label="Business Type" req>
                    <select className="vr-select" value={form.businessType} onChange={e=>set('businessType',e.target.value)}>
                      <option value="">— Select —</option>
                      {['Proprietorship','Partnership','Private Limited','Public Limited','LLP','Government','Individual','Trust / NGO','HUF'].map(o=><option key={o}>{o}</option>)}
                    </select>
                  </FRow>
                  <FRow label="Industry Type">
                    <select className="vr-select" value={form.industryType} onChange={e=>set('industryType',e.target.value)}>
                      <option value="">— Select —</option>
                      {['Manufacturing','Trading','Services','Construction','Consulting','Logistics','Others'].map(o=><option key={o}>{o}</option>)}
                    </select>
                  </FRow>
                  <FRow label="GST Number"><input className="vr-field" value={form.gst} maxLength={15} onChange={e=>set('gst',e.target.value.toUpperCase())} placeholder="22AAAAA0000A1Z5" /></FRow>
                  <FRow label="PAN Number"><input className="vr-field" value={form.pan} maxLength={10} onChange={e=>set('pan',e.target.value.toUpperCase())} placeholder="ABCDE1234F" /></FRow>
                  <FRow label="CIN Number"><input className="vr-field" value={form.cin} onChange={e=>set('cin',e.target.value.toUpperCase())} placeholder="Optional" /></FRow>
                  <FRow label="MSME / Udyam No."><input className="vr-field" value={form.msme} onChange={e=>set('msme',e.target.value.toUpperCase())} placeholder="Optional" /></FRow>
                </tbody>
              </table>
            )}

            {/* Step 1: Contact & Address */}
            {step === 1 && (
              <table style={{ borderCollapse:'collapse', width:'100%' }}>
                <tbody>
                  <FRow label="Contact Person" req><input className="vr-field" value={form.contactPerson} onChange={e=>set('contactPerson',e.target.value)} placeholder="Full name" /></FRow>
                  <FRow label="Mobile Number" req><input className="vr-field" value={form.mobile} maxLength={10} onChange={e=>set('mobile',e.target.value.replace(/\D/g,''))} placeholder="10-digit mobile" /></FRow>
                  <FRow label="Email Address" req><input className="vr-field" type="email" value={form.email} onChange={e=>set('email',e.target.value)} placeholder="vendor@company.com" /></FRow>
                  <FRow label="Website"><input className="vr-field" value={form.website} onChange={e=>set('website',e.target.value)} placeholder="https://..." /></FRow>
                  <FRow label="Address" req>
                    <textarea value={form.address} onChange={e=>set('address',e.target.value)} rows={2} placeholder="Full address"
                      style={{ width:'100%', padding:'6px 10px', border:'1.5px solid #AAAAAA', borderRadius:2, fontSize:12.5, fontFamily:F, resize:'vertical', outline:'none' }} />
                  </FRow>
                  <FRow label="City" req><input className="vr-field" value={form.city} onChange={e=>set('city',e.target.value)} placeholder="City" /></FRow>
                  <FRow label="State" req>
                    <select className="vr-select" value={form.state} onChange={e=>set('state',e.target.value)}>
                      <option value="">— Select —</option>
                      {STATES.map(s=><option key={s}>{s}</option>)}
                    </select>
                  </FRow>
                  <FRow label="Pincode"><input className="vr-field" value={form.pincode} maxLength={6} onChange={e=>set('pincode',e.target.value.replace(/\D/g,''))} placeholder="6-digit" /></FRow>
                  <FRow label="Country"><input className="vr-field" value={form.country} onChange={e=>set('country',e.target.value)} /></FRow>
                </tbody>
              </table>
            )}

            {/* Step 2: Banking & Password */}
            {step === 2 && (
              <table style={{ borderCollapse:'collapse', width:'100%' }}>
                <tbody>
                  <FRow label="Bank Name"><input className="vr-field" value={form.bankName} onChange={e=>set('bankName',e.target.value)} placeholder="e.g. State Bank of India" /></FRow>
                  <FRow label="Account Holder"><input className="vr-field" value={form.accountHolder} onChange={e=>set('accountHolder',e.target.value)} placeholder="Name on account" /></FRow>
                  <FRow label="Account Number"><input className="vr-field" value={form.accountNo} onChange={e=>set('accountNo',e.target.value)} placeholder="Bank account number" /></FRow>
                  <FRow label="IFSC Code"><input className="vr-field" value={form.ifsc} maxLength={11} onChange={e=>set('ifsc',e.target.value.toUpperCase())} placeholder="SBIN0001234" /></FRow>
                  <FRow label="Branch"><input className="vr-field" value={form.branch} onChange={e=>set('branch',e.target.value)} placeholder="Branch city/name" /></FRow>
                  <tr><td colSpan={2} style={{ padding:'10px 0 4px' }}><div style={{ width:'100%', height:1, background:'#CCCCCC' }} /></td></tr>
                  <FRow label="Set Password" req><input className="vr-field" type="password" value={form.password} onChange={e=>set('password',e.target.value)} placeholder="Min 6 characters" /></FRow>
                  <FRow label="Confirm Password" req>
                    <input className="vr-field" type="password" value={form.confirmPassword} onChange={e=>set('confirmPassword',e.target.value)} placeholder="Re-enter password" />
                    {form.confirmPassword && form.password !== form.confirmPassword && (
                      <div style={{ fontSize:11, color:'#DC2626', marginTop:3 }}>Passwords do not match</div>
                    )}
                  </FRow>
                </tbody>
              </table>
            )}

            {/* Step 3: OTP Verify */}
            {step === 3 && (
              <table style={{ borderCollapse:'collapse', width:'100%' }}>
                <tbody>
                  <tr><td colSpan={2} style={{ padding:'8px 0 16px', textAlign:'center' }}>
                    <div style={{ fontSize:36, marginBottom:8 }}>📧</div>
                    <div style={{ fontSize:13.5, fontWeight:700, color:'#111' }}>Verify your Email</div>
                    <div style={{ fontSize:12, color:'#64748b', marginTop:4 }}>We'll send a 6-digit OTP to <strong>{form.email}</strong></div>
                  </td></tr>
                  <tr><td colSpan={2} style={{ padding:'6px 0' }}>
                    <button type="button" onClick={sendOTP} disabled={sending} className={otpSent?'':'vr-btn'} style={otpSent?{ width:'100%', height:30, background:'#ECFDF5', border:'1.5px solid #A7F3D0', borderRadius:2, color:'#065F46', fontSize:12.5, fontFamily:F, fontWeight:700, cursor:'pointer' }:{ width:'100%' }}>
                      {sending ? '⏳ Sending…' : otpSent ? '✅ OTP Sent — Resend' : '📤 Send OTP to Email'}
                    </button>
                  </td></tr>
                  {otpSent && (
                    <FRow label="Enter OTP" req>
                      <input className="vr-field" value={form.otp} onChange={e=>set('otp',e.target.value)} maxLength={6} placeholder="6-digit OTP" style={{ textAlign:'center', fontSize:18, fontWeight:700, letterSpacing:6 }} />
                    </FRow>
                  )}
                </tbody>
              </table>
            )}
          </div>

          {/* Navigation buttons */}
          <div style={{ padding:'10px 40px 14px', position:'relative', zIndex:3, borderTop:'1px solid rgba(0,0,0,0.1)', background:'rgba(237,234,228,0.7)' }}>
            <table style={{ borderCollapse:'collapse', width:'100%' }}>
              <tbody>
                <tr>
                  <td style={{ padding:'4px 0', verticalAlign:'middle' }}>
                    <div style={{ display:'flex', gap:10, alignItems:'center' }}>
                      {step > 0 && <button className="vr-btn" onClick={() => { setStep(s=>s-1); setMsg(null); }} style={{ background:'linear-gradient(180deg,#888 0%,#666 100%)', borderColor:'#555' }}>◀ Back</button>}
                      <button type="button" className="vr-btn-back" onClick={() => navigate('/login')}>← Already registered? Login</button>
                    </div>
                  </td>
                  <td style={{ padding:'4px 0', verticalAlign:'middle', textAlign:'right' }}>
                    {step < 3 ? (
                      <button className="vr-btn" onClick={() => { setStep(s=>s+1); setMsg(null); }}>Next ▶</button>
                    ) : (
                      <button className="vr-btn-green" onClick={handleSubmit} disabled={submitting || !form.otp}>
                        {submitting ? '⏳ Submitting…' : '✅ Complete Registration'}
                      </button>
                    )}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Epsilongroup brand */}
          <div style={{ textAlign:'right', padding:'0 28px 8px', position:'relative', zIndex:3 }}>
            <div style={{ fontSize:26, fontWeight:900, color:'#003580', fontStyle:'italic', letterSpacing:'-0.5px' }}>Epsilongroup</div>
          </div>
          <div style={{ textAlign:'center', fontSize:10, color:'#888', padding:'0 20px 12px', position:'relative', zIndex:3 }}>
            Copyright © 2024–2025 Epsilon Group Limited. All rights reserved. epsilonprefab.org
          </div>
        </div>
      </div>
    </>
  );
}
