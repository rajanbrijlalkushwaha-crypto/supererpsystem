import React, { useState } from 'react';
import axios from 'axios';

const F   = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const P   = '#2563EB';
const PD  = '#1D4ED8';
const BD  = '#D1D5DB';
const BG  = '#F5F7FA';

const STATES = [
  'Andhra Pradesh','Arunachal Pradesh','Assam','Bihar','Chhattisgarh','Goa','Gujarat',
  'Haryana','Himachal Pradesh','Jharkhand','Karnataka','Kerala','Madhya Pradesh',
  'Maharashtra','Manipur','Meghalaya','Mizoram','Nagaland','Odisha','Punjab',
  'Rajasthan','Sikkim','Tamil Nadu','Telangana','Tripura','Uttar Pradesh',
  'Uttarakhand','West Bengal','Delhi','Chandigarh','Puducherry','Ladakh',
];

const TABS = [
  { id: 'company',  label: 'Basic Information', icon: '👤' },
  { id: 'tax',      label: 'Tax & Compliance',  icon: '📋' },
  { id: 'contacts', label: 'Contact Details',   icon: '📞' },
  { id: 'docs',     label: 'Documents',         icon: '📎' },
];

/* ── Shared layout components — defined at module level so React never remounts them on re-render ── */
const FR = ({ label, children, req, w=140 }) => (
  <div style={{display:'flex',alignItems:'center',minHeight:30,borderBottom:'1px solid #CBD5E1',padding:'2px 6px',background:'#fff'}}>
    <label style={{fontSize:11.5,fontWeight:700,color:'#000',minWidth:w,maxWidth:w,padding:'0 8px 0 0',textAlign:'left',flexShrink:0}}>
      {label}{req&&<span style={{color:'#DC2626',marginLeft:2}}>*</span>}
    </label>
    <div style={{flex:1,display:'flex',gap:4,alignItems:'center'}}>{children}</div>
  </div>
);
const PH = ({ title }) => (
  <div style={{background:'#F1F5F9',color:'#1E293B',fontSize:12,fontWeight:700,padding:'6px 12px',letterSpacing:0.2,borderBottom:'1px solid #D1D5DB'}}>
    {title}
  </div>
);
const VCard = ({ children }) => (
  <div style={{border:'1px solid #D1D5DB',borderRadius:8,boxShadow:'0 1px 3px rgba(0,0,0,0.04)',overflow:'hidden',background:'#fff'}}>
    {children}
  </div>
);

const CreateClient = () => {
  const [tab, setTab]   = useState('company');
  const [formData, setFormData] = useState({
    companyName: '', address: '', city: '', state: '', pincode: '',
    businessType: '', industryType: '',
    pan: '', gstin: '', cin: '', msme: '', gstType: 'Regular',
    creditPeriod: '', paymentTerms: '',
  });
  const [clientId, setClientId] = useState(() => (100001 + Math.floor(Math.random() * 999)).toString());
  const [contactPersons, setContactPersons] = useState([
    { id: 1, name: '', mobileNumber: '', email: '', designation: '' },
  ]);
  const [documents, setDocuments] = useState([{ id: 1, name: '', file: null }]);
  const [message,  setMessage]    = useState('');
  const [loading,  setLoading]    = useState(false);
  const [errors,   setErrors]     = useState({});
  const [successModal, setSuccessModal] = useState({ show: false, clientId: null, status: '' });

  const set = (field, val) => { setFormData(p => ({ ...p, [field]: val })); setErrors(p => ({ ...p, [field]: false })); };

  const validate = () => {
    const e = {};
    if (!formData.companyName.trim()) e.companyName = true;
    if (!formData.address.trim())     e.address     = true;
    if (!formData.city.trim())        e.city        = true;
    if (!formData.state)              e.state       = true;
    if (!formData.pincode.trim())     e.pincode     = true;
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleContactChange = (id, field, value) =>
    setContactPersons(p => p.map(c => c.id === id ? { ...c, [field]: value } : c));
  const addContact = () => {
    const newId = Math.max(...contactPersons.map(c => c.id), 0) + 1;
    setContactPersons(p => [...p, { id: newId, name: '', mobileNumber: '', email: '', designation: '' }]);
  };
  const removeContact = (id) => {
    if (contactPersons.length === 1) { setMessage('At least one contact required'); return; }
    setContactPersons(p => p.filter(c => c.id !== id));
  };

  const handleDocChange = (id, field, value) =>
    setDocuments(p => p.map(d => d.id === id ? { ...d, [field]: value } : d));
  const addDoc = () => {
    const newId = Math.max(...documents.map(d => d.id), 0) + 1;
    setDocuments(p => [...p, { id: newId, name: '', file: null }]);
  };
  const removeDoc = (id) => setDocuments(p => p.filter(d => d.id !== id));

  const submitForm = async (status) => {
    if (!validate()) { setMessage('Please fill all required fields.'); setTab('company'); return; }
    try {
      setLoading(true); setMessage('');
      const fd = new FormData();
      Object.entries(formData).forEach(([k, v]) => fd.append(k, v));
      fd.append('status', status);
      fd.append('contactPersons', JSON.stringify(contactPersons.filter(c => c.name)));
      const docMeta = documents.filter(d => d.name).map(d => ({ name: d.name }));
      fd.append('documents', JSON.stringify(docMeta));
      documents.forEach(doc => { if (doc.file) fd.append('documents', doc.file); });
      const res = await axios.post('/api/clients', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setSuccessModal({ show: true, clientId: res.data.clientId, status });
    } catch (err) {
      setMessage('Error: ' + (err.response?.data?.error || err.message));
    } finally { setLoading(false); }
  };

  const resetForm = () => {
    setFormData({ companyName: '', address: '', city: '', state: '', pincode: '', businessType: '', industryType: '', pan: '', gstin: '', cin: '', msme: '', gstType: 'Regular', creditPeriod: '', paymentTerms: '' });
    setContactPersons([{ id: 1, name: '', mobileNumber: '', email: '', designation: '' }]);
    setDocuments([{ id: 1, name: '', file: null }]);
    setMessage(''); setErrors({});
    setSuccessModal({ show: false, clientId: null, status: '' });
    setTab('company');
    setClientId((100001 + Math.floor(Math.random() * 999)).toString());
  };

  const tabIdx  = TABS.findIndex(t => t.id === tab);
  const prevTab = tabIdx > 0 ? TABS[tabIdx - 1].id : null;
  const nextTab = tabIdx < TABS.length - 1 ? TABS[tabIdx + 1].id : null;

  /* ── SO-style row input / select ── */
  const ri = (err=false) => ({
    height:28, padding:'0 8px', border:`1px solid ${err?'#EF4444':'#9CA3AF'}`, borderRadius:4,
    fontSize:12, fontFamily:F, color:'#111827', background:err?'#FFF5F5':'#fff',
    outline:'none', width:'100%', boxSizing:'border-box',
  });
  const rs = (err=false) => ({
    height:28, padding:'0 8px', border:`1px solid ${err?'#EF4444':'#9CA3AF'}`, borderRadius:4,
    fontSize:12, fontFamily:F, color:'#111827', background:'#fff',
    outline:'none', cursor:'pointer', width:'100%', boxSizing:'border-box',
  });
  const onFocus = e => { e.target.style.borderColor = P; };
  const onBlur  = (err) => e => { e.target.style.borderColor = err ? '#EF4444' : '#9CA3AF'; };


  return (
    <div style={{ fontFamily: F, background: BG, minHeight: '100%', display: 'flex', flexDirection: 'column' }}>

      {/* ── Success Modal ── */}
      {successModal.show && (
        <div style={{ position:'fixed', inset:0, zIndex:1000, background:'rgba(15,23,42,0.5)', backdropFilter:'blur(4px)', display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div style={{ background:'#fff', borderRadius:16, padding:32, width:360, boxShadow:'0 20px 60px rgba(0,0,0,0.2)', textAlign:'center', fontFamily:F }}>
            <div style={{ width:56, height:56, borderRadius:'50%', background:'#D1FAE5', display:'flex', alignItems:'center', justifyContent:'center', fontSize:26, margin:'0 auto 14px' }}>✓</div>
            <div style={{ fontSize:18, fontWeight:800, color:'#111827', marginBottom:6 }}>Client Created!</div>
            <div style={{ fontSize:13, color:'#6B7280', marginBottom:16 }}>Client ID: <strong style={{ color:P }}>{successModal.clientId}</strong></div>
            <button onClick={resetForm} style={{ width:'100%', height:42, borderRadius:8, border:'none', cursor:'pointer', background:P, color:'#fff', fontSize:13, fontWeight:700, fontFamily:F }}>OK — Create Another</button>
          </div>
        </div>
      )}

      {/* ── Tab Bar — flat horizontal, same as Sales Order ── */}
      <div className="soft-tabs" style={{ flexShrink:0, background:'#F8FAFC', borderBottom:`2px solid ${BD}`, display:'flex', flexWrap:'nowrap', padding:'0 2px' }}>
        {TABS.map((t) => {
          const isActive = tab === t.id;
          return (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              display:'flex', alignItems:'center', justifyContent:'center', gap:5,
              flex:1, height:36, padding:'0 8px', cursor:'pointer',
              background: isActive ? '#DBEAFE' : 'transparent',
              border:'none', borderBottom: isActive ? `2px solid ${P}` : '2px solid transparent',
              color: isActive ? P : '#111827',
              fontSize:11.5, fontWeight: isActive ? 700 : 500, fontFamily:F,
              whiteSpace:'nowrap', transition:'all 0.12s', marginBottom:-2,
            }}
            onMouseEnter={e=>{ if(!isActive){e.currentTarget.style.background='#EFF6FF';e.currentTarget.style.color=PD;} }}
            onMouseLeave={e=>{ if(!isActive){e.currentTarget.style.background='transparent';e.currentTarget.style.color='#111827';} }}>
              <span style={{fontSize:14}}>{t.icon}</span>
              {t.label}
            </button>
          );
        })}
      </div>

      {/* ── Form Body ── */}
      <div style={{ flex:1, overflowY:'auto', padding:'12px 14px', background:'#F5F7FA' }}>

        {/* ── BASIC INFORMATION ── */}
        {tab === 'company' && (
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
            <VCard>
              <PH title="👤  Client Identity"/>
              <FR label="Client Name" req>
                <input style={ri(errors.companyName)} value={formData.companyName} onChange={e=>set('companyName',e.target.value)} placeholder="e.g. ABC Pvt Ltd" onFocus={onFocus} onBlur={onBlur(errors.companyName)}/>
                {errors.companyName&&<span style={{color:'#DC2626',fontSize:10,whiteSpace:'nowrap'}}>Required</span>}
              </FR>
              <FR label="Client ID">
                <input readOnly value={clientId} style={{...ri(),color:P,fontWeight:700,background:'#F8FAFF',width:120}}/>
                <button onClick={()=>setClientId((100001+Math.floor(Math.random()*999)).toString())} style={{height:24,width:24,borderRadius:4,border:'1px solid #D1D5DB',background:'#EFF6FF',color:P,cursor:'pointer',fontSize:13,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>↻</button>
              </FR>
              <FR label="Business Type">
                <select style={rs()} value={formData.businessType||''} onChange={e=>set('businessType',e.target.value)} onFocus={onFocus} onBlur={onBlur()}>
                  <option value="">— Select —</option>
                  {['Private Limited','Public Limited','Partnership','Proprietorship','LLP','Trust','NGO','Government'].map(t=><option key={t} value={t}>{t}</option>)}
                </select>
              </FR>
              <FR label="Industry Type">
                <select style={rs()} value={formData.industryType||''} onChange={e=>set('industryType',e.target.value)} onFocus={onFocus} onBlur={onBlur()}>
                  <option value="">— Select —</option>
                  {['Manufacturing','Trading','Services','Retail','Construction','IT/Software','Healthcare','Education','Agriculture','Other'].map(t=><option key={t} value={t}>{t}</option>)}
                </select>
              </FR>
            </VCard>

            <VCard>
              <PH title="📍  Address Details"/>
              <div style={{display:'flex',alignItems:'flex-start',borderBottom:'1px solid #CBD5E1',padding:'4px 6px',background:'#fff',minHeight:64}}>
                <label style={{fontSize:11.5,fontWeight:700,color:'#000',minWidth:140,maxWidth:140,padding:'2px 8px 0 0',textAlign:'left',flexShrink:0}}>Address <span style={{color:'#DC2626'}}>*</span></label>
                <textarea value={formData.address} onChange={e=>set('address',e.target.value)} rows={3} placeholder="Street / area / locality"
                  style={{flex:1,padding:'2px 6px',border:'none',outline:'none',fontSize:12,fontFamily:F,color:'#111827',resize:'vertical',background:'transparent',boxSizing:'border-box',minHeight:60}}/>
              </div>
              <FR label="City" req>
                <input style={ri(errors.city)} value={formData.city} onChange={e=>set('city',e.target.value)} placeholder="City" onFocus={onFocus} onBlur={onBlur(errors.city)}/>
              </FR>
              <FR label="State" req>
                <select style={rs(errors.state)} value={formData.state} onChange={e=>set('state',e.target.value)} onFocus={onFocus} onBlur={onBlur(errors.state)}>
                  <option value="">— Select State —</option>
                  {STATES.map(s=><option key={s} value={s}>{s}</option>)}
                </select>
              </FR>
              <FR label="Pincode" req>
                <input style={ri(errors.pincode)} value={formData.pincode} maxLength={6} onChange={e=>set('pincode',e.target.value.replace(/\D/,''))} placeholder="6-digit pincode" onFocus={onFocus} onBlur={onBlur(errors.pincode)}/>
              </FR>
            </VCard>
          </div>
        )}

        {/* ── TAX & COMPLIANCE ── */}
        {tab === 'tax' && (
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
            <VCard>
              <PH title="📋  Tax Identity"/>
              <FR label="PAN Number">
                <input style={ri()} value={formData.pan} maxLength={10} onChange={e=>set('pan',e.target.value.toUpperCase())} placeholder="ABCDE1234F" onFocus={onFocus} onBlur={onBlur()}/>
              </FR>
              <FR label="GST Number">
                <input style={ri()} value={formData.gstin} maxLength={15} onChange={e=>set('gstin',e.target.value.toUpperCase())} placeholder="22AAAAA0000A1Z5" onFocus={onFocus} onBlur={onBlur()}/>
              </FR>
              <FR label="CIN Number">
                <input style={ri()} value={formData.cin} onChange={e=>set('cin',e.target.value.toUpperCase())} placeholder="U74999MH2020PTC123456" onFocus={onFocus} onBlur={onBlur()}/>
              </FR>
              <FR label="MSME Number">
                <input style={ri()} value={formData.msme} onChange={e=>set('msme',e.target.value.toUpperCase())} placeholder="UDYAM-XX-00-0000000" onFocus={onFocus} onBlur={onBlur()}/>
              </FR>
              <FR label="GST Type">
                <div style={{display:'flex',gap:5,flexWrap:'wrap'}}>
                  {['Regular','Composition','Unregistered','SEZ','Export'].map(t=>(
                    <button key={t} type="button" onClick={()=>set('gstType',t)} style={{
                      padding:'2px 8px',borderRadius:4,border:`1px solid ${formData.gstType===t?P:'#D1D5DB'}`,
                      background:formData.gstType===t?'#DBEAFE':'#fff',color:formData.gstType===t?P:'#6B7280',
                      fontSize:11,fontWeight:formData.gstType===t?700:400,cursor:'pointer',fontFamily:F
                    }}>{t}</button>
                  ))}
                </div>
              </FR>
            </VCard>

            <VCard>
              <PH title="ℹ️  GST Type Guide"/>
              <div style={{padding:'8px 10px',display:'flex',flexDirection:'column',gap:6}}>
                {[
                  ['Regular',      'Standard GST — can claim ITC'],
                  ['Composition',  'Small business scheme — 1–6% flat rate'],
                  ['Unregistered', 'No GST — reverse charge applicable'],
                  ['SEZ',          'Special Economic Zone — zero-rated'],
                  ['Export',       'Export business — LUT/bond required'],
                ].map(([t,d])=>(
                  <div key={t} style={{padding:'6px 10px',borderRadius:6,background:formData.gstType===t?'#DBEAFE':'#F8FAFF',border:`1px solid ${formData.gstType===t?P:'#D1D5DB'}`}}>
                    <div style={{fontSize:11.5,fontWeight:700,color:formData.gstType===t?P:'#1E293B',fontFamily:F}}>{t}</div>
                    <div style={{fontSize:11,color:'#6B7280',fontFamily:F,marginTop:1}}>{d}</div>
                  </div>
                ))}
              </div>
            </VCard>
          </div>
        )}

        {/* ── CONTACTS ── */}
        {tab === 'contacts' && (
          <div style={{display:'flex',flexDirection:'column',gap:10}}>
            {contactPersons.map((c,idx)=>(
              <VCard key={c.id}>
                <div style={{background:'#F1F5F9',color:'#1E293B',fontSize:12,fontWeight:700,padding:'6px 12px',letterSpacing:0.2,borderBottom:'1px solid #D1D5DB',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                  <span>👤  Contact Person {idx+1}</span>
                  {contactPersons.length>1&&(
                    <button onClick={()=>removeContact(c.id)} style={{padding:'2px 10px',borderRadius:4,background:'#FEF2F2',border:'1px solid #FECACA',color:'#DC2626',cursor:'pointer',fontSize:11,fontWeight:600,fontFamily:F}}>✕ Remove</button>
                  )}
                </div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:0}}>
                  <FR label="Name">
                    <input style={ri()} value={c.name} onChange={e=>handleContactChange(c.id,'name',e.target.value)} placeholder="Full name" onFocus={onFocus} onBlur={onBlur()}/>
                  </FR>
                  <FR label="Designation">
                    <input style={ri()} value={c.designation} onChange={e=>handleContactChange(c.id,'designation',e.target.value)} placeholder="e.g. Purchase Manager" onFocus={onFocus} onBlur={onBlur()}/>
                  </FR>
                  <FR label="Mobile">
                    <input type="tel" style={ri()} value={c.mobileNumber} onChange={e=>handleContactChange(c.id,'mobileNumber',e.target.value)} placeholder="+91 XXXXX XXXXX" onFocus={onFocus} onBlur={onBlur()}/>
                  </FR>
                  <FR label="Email">
                    <input type="email" style={ri()} value={c.email} onChange={e=>handleContactChange(c.id,'email',e.target.value)} placeholder="email@company.com" onFocus={onFocus} onBlur={onBlur()}/>
                  </FR>
                </div>
              </VCard>
            ))}
            <button onClick={addContact} style={{padding:'8px',borderRadius:8,cursor:'pointer',background:'#F0F9FF',border:'2px dashed #93C5FD',color:'#2563EB',fontSize:12,fontWeight:600,fontFamily:F,display:'flex',alignItems:'center',justifyContent:'center',gap:6}}>
              + Add Another Contact
            </button>
          </div>
        )}

        {/* ── DOCUMENTS ── */}
        {tab === 'docs' && (
          <VCard>
            <PH title="📎  Attached Documents"/>
            <div style={{padding:'10px 12px',display:'flex',flexDirection:'column',gap:8}}>
              {documents.map((doc,idx)=>(
                <div key={doc.id} style={{display:'flex',alignItems:'center',gap:8,padding:'6px 10px',borderRadius:6,background:'#EFF6FF',border:'1px solid #D1D5DB'}}>
                  <span style={{fontSize:11,fontWeight:700,color:'#94a3b8',width:18}}>{idx+1}.</span>
                  <input style={{...ri(),flex:1,height:26}} value={doc.name} onChange={e=>handleDocChange(doc.id,'name',e.target.value)} placeholder="Document name (e.g. GST Certificate)" onFocus={onFocus} onBlur={onBlur()}/>
                  <input type="file" accept=".pdf,.doc,.docx,.jpg,.png" onChange={e=>handleDocChange(doc.id,'file',e.target.files[0])} style={{fontSize:10,fontFamily:F,flex:1}}/>
                  {documents.length>1&&(
                    <button onClick={()=>removeDoc(doc.id)} style={{padding:'2px 8px',borderRadius:4,cursor:'pointer',background:'#FEF2F2',border:'1px solid #FECACA',color:'#DC2626',fontSize:11,fontWeight:600,fontFamily:F}}>✕</button>
                  )}
                </div>
              ))}
              <button onClick={addDoc} style={{padding:'6px',borderRadius:6,cursor:'pointer',background:'#F5F3FF',border:'2px dashed #C4B5FD',color:'#7C3AED',fontSize:11,fontWeight:600,fontFamily:F,display:'flex',alignItems:'center',justifyContent:'center',gap:4}}>
                + Add Document
              </button>
            </div>
          </VCard>
        )}
      </div>

      {/* ── Footer (sticky, dark navy) ── */}
      <div style={{
        position:'sticky', bottom:0, zIndex:50,
        padding:'10px 20px', background:'#1E293B', borderTop:'1px solid #334155',
        display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0,
      }}>
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          <span style={{fontSize:11.5,color:'#94A3B8',fontFamily:F}}>
            Step {tabIdx+1} of {TABS.length} — <strong style={{color:'#E2E8F0'}}>{TABS[tabIdx].label}</strong>
          </span>
          {prevTab&&(
            <button onClick={()=>setTab(prevTab)} style={{height:30,padding:'0 12px',borderRadius:6,cursor:'pointer',background:'transparent',border:'1px solid #475569',color:'#CBD5E1',fontSize:11.5,fontWeight:600,fontFamily:F}}>◀ Back</button>
          )}
          {nextTab&&(
            <button onClick={()=>setTab(nextTab)} style={{height:30,padding:'0 14px',borderRadius:6,cursor:'pointer',background:'#2563EB',border:'none',color:'#fff',fontSize:11.5,fontWeight:600,fontFamily:F}}>Next ▶</button>
          )}
          {message&&<span style={{fontSize:11,color:'#FCA5A5',fontFamily:F,marginLeft:8}}>{message}</span>}
        </div>
        <div style={{display:'flex',gap:8}}>
          <button onClick={resetForm} style={{height:32,padding:'0 14px',borderRadius:6,cursor:'pointer',background:'transparent',border:'1px solid #475569',color:'#94A3B8',fontSize:11.5,fontWeight:600,fontFamily:F}}>Reset</button>
          <button onClick={()=>submitForm('draft')} disabled={loading} style={{height:32,padding:'0 16px',borderRadius:6,cursor:'pointer',background:'#F59E0B',border:'none',color:'#fff',fontSize:11.5,fontWeight:700,fontFamily:F}}>💾 Save Draft</button>
          <button onClick={()=>submitForm('pending')} disabled={loading} style={{height:32,padding:'0 18px',borderRadius:6,cursor:'pointer',background:'#2563EB',border:'none',color:'#fff',fontSize:11.5,fontWeight:700,fontFamily:F}}>📤 {loading?'Saving…':'Submit for Approval'}</button>
        </div>
      </div>
    </div>
  );
};

export default CreateClient;
