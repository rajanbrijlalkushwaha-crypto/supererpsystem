import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useCompany } from '../../context/CompanyContext';

/* ═══════════════════════════════════════════════════
   INDIAN STATES
═══════════════════════════════════════════════════ */
const STATES = [
  'Andhra Pradesh','Arunachal Pradesh','Assam','Bihar','Chhattisgarh',
  'Goa','Gujarat','Haryana','Himachal Pradesh','Jharkhand','Karnataka',
  'Kerala','Madhya Pradesh','Maharashtra','Manipur','Meghalaya','Mizoram',
  'Nagaland','Odisha','Punjab','Rajasthan','Sikkim','Tamil Nadu','Telangana',
  'Tripura','Uttar Pradesh','Uttarakhand','West Bengal',
  'Andaman and Nicobar Islands','Chandigarh','Dadra and Nagar Haveli and Daman and Diu',
  'Delhi','Jammu and Kashmir','Ladakh','Lakshadweep','Puducherry',
];

const INDUSTRY_TYPES = [
  'Agriculture','Automobile','Banking & Finance','Construction','Consulting',
  'Defense','Education','Energy & Power','FMCG','Healthcare','Hospitality',
  'Information Technology','Infrastructure','Insurance','Logistics',
  'Manufacturing','Media & Entertainment','Mining','Pharmaceuticals',
  'Real Estate','Retail','Telecom','Textile','Trading','Others',
];

const SALES_PERSONS = ['Rajesh Kumar','Priya Sharma','Amit Singh','Sunita Verma','Mohit Gupta'];

/* ═══════════════════════════════════════════════════
   ICONS
═══════════════════════════════════════════════════ */
const I = {
  Basic: () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>,
  Contact: () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 1.27h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.91a16 16 0 0 0 6 6l.91-.91a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 21.73 16.92z"/></svg>,
  Address: () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>,
  Tax: () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>,
  Bank: () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>,
  Payment: () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>,
  Extra: () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
  Save: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>,
  Check: () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>,
  Alert: () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
  Upload: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/></svg>,
};

const TABS = [
  { id: 'basic',    label: 'Basic Information',  icon: <I.Basic /> },
  { id: 'contact',  label: 'Contact Details',    icon: <I.Contact /> },
  { id: 'address',  label: 'Address Details',    icon: <I.Address /> },
  { id: 'tax',      label: 'Tax & Compliance',   icon: <I.Tax /> },
  { id: 'bank',     label: 'Banking Details',    icon: <I.Bank /> },
  { id: 'payment',  label: 'Payment & Terms',    icon: <I.Payment /> },
  { id: 'extra',    label: 'Additional Details', icon: <I.Extra /> },
];

/* ═══════════════════════════════════════════════════
   VALIDATION HELPERS
═══════════════════════════════════════════════════ */
const validate = {
  pan:    v => /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(v.toUpperCase()),
  gst:    v => /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(v.toUpperCase()),
  mobile: v => /^[6-9]\d{9}$/.test(v),
  email:  v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
  pin:    v => /^[1-9][0-9]{5}$/.test(v),
  ifsc:   v => /^[A-Z]{4}0[A-Z0-9]{6}$/.test(v.toUpperCase()),
};


/* ═══════════════════════════════════════════════════
   REUSABLE UI ATOMS
═══════════════════════════════════════════════════ */
const s = {
  card: { background: '#fff', border: '1px solid #E5E5E5', borderRadius: '6px', padding: '20px 22px', marginBottom: '16px' },
  sectionHead: { fontSize: '11px', fontWeight: 700, color: '#354A5E', textTransform: 'uppercase', letterSpacing: '0.7px', borderBottom: '2px solid #0070F2', paddingBottom: '5px', marginBottom: '16px' },
  label: { fontSize: '12px', fontWeight: 600, color: '#32363A', marginBottom: '4px', display: 'block' },
  req: { color: '#BB0000', marginLeft: '2px' },
  input: (err, focused) => ({
    width: '100%', padding: '7px 10px', border: `1px solid ${err ? '#BB0000' : focused ? '#0070F2' : '#BBBCBD'}`,
    borderRadius: '4px', fontSize: '13px', fontFamily: 'inherit', background: focused ? '#fff' : '#FAFAFA',
    color: '#32363A', outline: 'none',
    boxShadow: err ? '0 0 0 2px rgba(187,0,0,0.08)' : focused ? '0 0 0 2px rgba(0,112,242,0.12)' : 'none',
    transition: 'all 0.15s',
  }),
  select: (err) => ({
    width: '100%', padding: '7px 10px', border: `1px solid ${err ? '#BB0000' : '#BBBCBD'}`,
    borderRadius: '4px', fontSize: '13px', fontFamily: 'inherit', background: '#FAFAFA',
    color: '#32363A', outline: 'none', cursor: 'pointer',
  }),
  err: { fontSize: '11px', color: '#BB0000', marginTop: '3px', fontWeight: 600 },
  hint: { fontSize: '11px', color: '#6A6D70', marginTop: '3px' },
  grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px 22px' },
  grid3: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '14px 22px' },
};

function FInput({ label, req, value, onChange, placeholder, err, hint, type = 'text', maxLength, style, upper }) {
  const [foc, setFoc] = useState(false);
  return (
    <div style={style}>
      <label style={s.label}>{label}{req && <span style={s.req}>*</span>}</label>
      <input
        type={type} value={value} maxLength={maxLength}
        placeholder={placeholder}
        onChange={e => onChange(upper ? e.target.value.toUpperCase() : e.target.value)}
        onFocus={() => setFoc(true)} onBlur={() => setFoc(false)}
        style={s.input(err, foc)}
      />
      {err  && <div style={s.err}>{err}</div>}
      {!err && hint && <div style={s.hint}>{hint}</div>}
    </div>
  );
}

function FSelect({ label, req, value, onChange, options, err, placeholder = '— Select —' }) {
  return (
    <div>
      <label style={s.label}>{label}{req && <span style={s.req}>*</span>}</label>
      <select value={value} onChange={e => onChange(e.target.value)} style={s.select(err)}>
        <option value="">{placeholder}</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
      {err && <div style={s.err}>{err}</div>}
    </div>
  );
}

function FTextarea({ label, req, value, onChange, placeholder, rows = 4, err }) {
  const [foc, setFoc] = useState(false);
  return (
    <div>
      <label style={s.label}>{label}{req && <span style={s.req}>*</span>}</label>
      <textarea
        value={value} rows={rows} placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
        onFocus={() => setFoc(true)} onBlur={() => setFoc(false)}
        style={{ ...s.input(err, foc), resize: 'vertical', minHeight: rows * 22 + 'px' }}
      />
      {err && <div style={s.err}>{err}</div>}
    </div>
  );
}

function Toggle({ id, checked, onChange, label }) {
  return (
    <label htmlFor={id} style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
      <div style={{ position: 'relative', width: '42px', height: '22px', background: checked ? '#0070F2' : '#BBBCBD', borderRadius: '11px', transition: 'background 0.2s', flexShrink: 0 }}>
        <input id={id} type="checkbox" checked={checked} onChange={onChange} style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }} />
        <div style={{ position: 'absolute', top: '3px', left: checked ? '22px' : '3px', width: '16px', height: '16px', background: 'white', borderRadius: '50%', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
      </div>
      {label && <span style={{ fontSize: '13px', color: checked ? '#0070F2' : '#6A6D70', fontWeight: checked ? 600 : 400 }}>{label}</span>}
    </label>
  );
}

function FileUpload({ label, hint }) {
  const [file, setFile] = useState(null);
  return (
    <div>
      <label style={s.label}>{label}</label>
      <label style={{
        display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer',
        border: '1px dashed #BBBCBD', borderRadius: '4px', padding: '10px 14px',
        background: '#FAFAFA', transition: 'border-color 0.15s',
      }}
        onMouseEnter={e => e.currentTarget.style.borderColor = '#0070F2'}
        onMouseLeave={e => e.currentTarget.style.borderColor = '#BBBCBD'}
      >
        <span style={{ color: '#0070F2' }}><I.Upload /></span>
        <div>
          <div style={{ fontSize: '13px', color: '#32363A', fontWeight: 500 }}>{file ? file.name : 'Click to upload'}</div>
          {hint && !file && <div style={{ fontSize: '11px', color: '#6A6D70' }}>{hint}</div>}
        </div>
        <input type="file" onChange={e => setFile(e.target.files[0])} style={{ display: 'none' }} />
      </label>
      {file && <div style={{ fontSize: '11px', color: '#188918', marginTop: '4px', fontWeight: 600 }}>✓ {file.name} attached</div>}
    </div>
  );
}

function MultiCheck({ options, selected, onChange }) {
  const toggle = (opt) => {
    const next = selected.includes(opt) ? selected.filter(x => x !== opt) : [...selected, opt];
    onChange(next);
  };
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
      {options.map(opt => {
        const on = selected.includes(opt);
        return (
          <button key={opt} type="button" onClick={() => toggle(opt)} style={{
            padding: '5px 14px', borderRadius: '16px', border: `1px solid ${on ? '#0070F2' : '#D9D9D9'}`,
            background: on ? '#EAF1FB' : '#FAFAFA', color: on ? '#0070F2' : '#6A6D70',
            fontSize: '12px', fontWeight: on ? 600 : 400, cursor: 'pointer',
            fontFamily: 'inherit', transition: 'all 0.12s',
          }}>{opt}</button>
        );
      })}
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   TOAST
═══════════════════════════════════════════════════ */
function Toast({ type, msg, onClose }) {
  useEffect(() => { const t = setTimeout(onClose, 4000); return () => clearTimeout(t); }, [onClose]);
  const isOk = type === 'success';
  return (
    <div style={{
      position: 'fixed', top: '20px', right: '24px', zIndex: 9999,
      background: isOk ? '#E8F5E9' : '#FFEBEB',
      border: `1px solid ${isOk ? '#82C98A' : '#F5B8B8'}`,
      borderLeft: `4px solid ${isOk ? '#188918' : '#BB0000'}`,
      borderRadius: '6px', padding: '12px 18px', minWidth: '300px',
      display: 'flex', alignItems: 'center', gap: '10px',
      boxShadow: '0 4px 16px rgba(0,0,0,0.12)', animation: 'slideIn 0.2s ease',
    }}>
      <span style={{ color: isOk ? '#188918' : '#BB0000', flexShrink: 0 }}>
        {isOk ? <I.Check /> : <I.Alert />}
      </span>
      <span style={{ fontSize: '13px', color: isOk ? '#0A6640' : '#BB0000', fontWeight: 600, flex: 1 }}>{msg}</span>
      <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6A6D70', fontSize: '16px', lineHeight: 1 }}>×</button>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   INIT STATE
═══════════════════════════════════════════════════ */
const INIT = {
  // Basic
  clientName: '', clientCode: '',
  businessType: '', industryType: '', pan: '', gst: '', cin: '', msme: '',
  // Contact
  contactPerson: '', mobile: '', altMobile: '', email: '', website: '', landline: '',
  // Address
  billingAddr: '', shippingAddr: '', state: '', city: '', pincode: '', country: 'India',
  // Tax
  gstRegistered: true, gstType: 'Regular', tdsApplicable: false,
  // Bank
  bankName: '', accountHolder: '', accountNo: '', ifsc: '', branch: '', upi: '',
  // Payment
  paymentTerms: '30 Days', creditLimit: '', paymentModes: [], currency: 'INR',
  // Extra
  category: 'Regular', salesPerson: '', remarks: '',
};

/* ═══════════════════════════════════════════════════
   MAIN DASHBOARD
═══════════════════════════════════════════════════ */
export default function ClientMasterDashboard() {
  const { selectedCompany } = useCompany();
  const [tab, setTab]         = useState('basic');
  const [form, setForm]       = useState(INIT);
  const [errs, setErrs]       = useState({});
  const [toast, setToast]     = useState(null);
  const [gstWarn, setGstWarn] = useState('');
  const [idLoading, setIdLoading] = useState(false);

  const fetchNextId = useCallback(async () => {
    if (!selectedCompany) return;
    setIdLoading(true);
    try {
      const res = await axios.get(`/api/clients/next-id?companyId=${selectedCompany.companyId}`);
      setForm(f => ({ ...f, clientCode: String(res.data.nextId) }));
    } catch {
      setForm(f => ({ ...f, clientCode: '100001' }));
    } finally {
      setIdLoading(false);
    }
  }, [selectedCompany]);

  useEffect(() => { fetchNextId(); }, [fetchNextId]);

  const set = (k, v) => {
    setForm(f => ({ ...f, [k]: v }));
    setErrs(e => ({ ...e, [k]: '' }));
    if (k === 'gst' && v.length === 15) {
      // autofill state from GST code
      const code = parseInt(v.slice(0, 2), 10);
      const stateMap = {
        1:'Jammu and Kashmir',2:'Himachal Pradesh',3:'Punjab',4:'Chandigarh',
        5:'Uttarakhand',6:'Haryana',7:'Delhi',8:'Rajasthan',9:'Uttar Pradesh',
        10:'Bihar',11:'Sikkim',12:'Arunachal Pradesh',13:'Nagaland',14:'Manipur',
        15:'Mizoram',16:'Tripura',17:'Meghalaya',18:'Assam',19:'West Bengal',
        20:'Jharkhand',21:'Odisha',22:'Chhattisgarh',23:'Madhya Pradesh',
        24:'Gujarat',26:'Dadra and Nagar Haveli and Daman and Diu',27:'Maharashtra',
        28:'Andhra Pradesh',29:'Karnataka',30:'Goa',31:'Lakshadweep',32:'Kerala',
        33:'Tamil Nadu',34:'Puducherry',35:'Andaman and Nicobar Islands',
        36:'Telangana',37:'Andhra Pradesh (new)',38:'Ladakh',
      };
      if (stateMap[code]) {
        setForm(f => ({ ...f, state: stateMap[code], gst: v }));
        setGstWarn(`State auto-filled: ${stateMap[code]}`);
        setTimeout(() => setGstWarn(''), 3000);
      }
    }
  };

  const validateAll = () => {
    const e = {};
    if (!form.clientName.trim())  e.clientName = 'Client Name is required';
    if (!form.businessType)       e.businessType = 'Business Type is required';
    if (form.pan && !validate.pan(form.pan))   e.pan = 'Invalid PAN (e.g. ABCDE1234F)';
    if (form.gst && !validate.gst(form.gst))   e.gst = 'Invalid GST (15-char format)';
    if (!form.contactPerson.trim()) e.contactPerson = 'Contact Person is required';
    if (!form.mobile)              e.mobile = 'Mobile is required';
    else if (!validate.mobile(form.mobile)) e.mobile = 'Invalid mobile number';
    if (form.email && !validate.email(form.email)) e.email = 'Invalid email address';
    if (form.altMobile && !validate.mobile(form.altMobile)) e.altMobile = 'Invalid mobile number';
    if (!form.billingAddr.trim()) e.billingAddr = 'Billing Address is required';
    if (!form.state)              e.state = 'State is required';
    if (!form.city.trim())        e.city = 'City is required';
    if (form.pincode && !validate.pin(form.pincode)) e.pincode = 'Invalid pincode';
    if (form.ifsc && !validate.ifsc(form.ifsc)) e.ifsc = 'Invalid IFSC code (e.g. SBIN0001234)';
    if (form.paymentModes.length === 0) e.paymentModes = 'Select at least one payment mode';
    setErrs(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = () => {
    if (!validateAll()) {
      // jump to first tab with error
      const tabFields = {
        basic:   ['clientName','businessType','pan','gst'],
        contact: ['contactPerson','mobile','email','altMobile'],
        address: ['billingAddr','state','city','pincode'],
        bank:    ['ifsc'],
        payment: ['paymentModes'],
      };
      for (const [t, fields] of Object.entries(tabFields)) {
        if (fields.some(f => errs[f])) { setTab(t); break; }
      }
      setToast({ type: 'error', msg: 'Please fix the highlighted errors before saving.' });
      return;
    }
    setToast({ type: 'success', msg: `Client "${form.clientName}" (${form.clientCode}) created successfully!` });
  };

  const handleReset = () => { setForm({ ...INIT }); setErrs({}); fetchNextId(); };

  /* ── render ──────────────────────────────────────────── */
  return (
    <div style={{ fontFamily: "'72', 'Inter', Arial, Helvetica, sans-serif", color: '#32363A' }}>
      <style>{`@keyframes slideIn { from { transform: translateX(40px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }`}</style>

      {toast && <Toast type={toast.type} msg={toast.msg} onClose={() => setToast(null)} />}

      {/* ── Page Header ── */}
      <div style={{ background: '#354A5E', borderRadius: '6px 6px 0 0', padding: '10px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: '11px', color: '#A8C4E0', letterSpacing: '0.6px', marginBottom: '2px' }}>CLIENT MASTER MANAGEMENT</div>
          <div style={{ fontSize: '16px', fontWeight: 700, color: '#fff' }}>New Client Registration</div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={handleReset} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.35)', color: 'white', padding: '7px 18px', borderRadius: '4px', cursor: 'pointer', fontSize: '13px', fontWeight: 600, fontFamily: 'inherit' }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>Cancel</button>
          <button onClick={handleSave} style={{ background: '#0070F2', border: 'none', color: 'white', padding: '7px 20px', borderRadius: '4px', cursor: 'pointer', fontSize: '13px', fontWeight: 600, fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '6px' }}
            onMouseEnter={e => e.currentTarget.style.background = '#0064DB'}
            onMouseLeave={e => e.currentTarget.style.background = '#0070F2'}><I.Save /> Save Client</button>
        </div>
      </div>

      {/* ── Tab Bar ── */}
      <div style={{ background: '#fff', borderLeft: '1px solid #E5E5E5', borderRight: '1px solid #E5E5E5', display: 'flex', overflowX: 'auto', borderBottom: '2px solid #E5E5E5' }}>
        {TABS.map(t => {
          const active = tab === t.id;
          const hasErr = {
            basic:   ['clientName','businessType','pan','gst'].some(f => errs[f]),
            contact: ['contactPerson','mobile','email','altMobile'].some(f => errs[f]),
            address: ['billingAddr','state','city','pincode'].some(f => errs[f]),
            bank:    ['ifsc'].some(f => errs[f]),
            payment: ['paymentModes'].some(f => errs[f]),
          }[t.id];
          return (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              display: 'flex', alignItems: 'center', gap: '7px', padding: '10px 18px',
              cursor: 'pointer', background: active ? '#fff' : '#F5F6F7',
              border: 'none', borderBottom: active ? '3px solid #0070F2' : '3px solid transparent',
              borderRight: '1px solid #E5E5E5',
              color: hasErr ? '#BB0000' : active ? '#0070F2' : '#6A6D70',
              fontSize: '13px', fontWeight: active ? 600 : 400, fontFamily: 'inherit',
              whiteSpace: 'nowrap', marginBottom: '-2px', transition: 'color 0.1s',
              position: 'relative',
            }}>
              <span style={{ opacity: active ? 1 : 0.6 }}>{t.icon}</span>
              {t.label}
              {hasErr && <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#BB0000', position: 'absolute', top: '8px', right: '8px' }} />}
            </button>
          );
        })}
      </div>

      {/* ── Tab Content ── */}
      <div style={{ background: '#F5F6F7', border: '1px solid #E5E5E5', borderTop: 'none', borderRadius: '0 0 6px 6px', padding: '20px', minHeight: '460px' }}>

        {/* ── TAB 1: Basic Information ── */}
        {tab === 'basic' && (
          <>
            <div style={s.card}>
              <div style={s.sectionHead}>Client Identity</div>
              <div style={s.grid2}>
                <FInput label="Client Name" req value={form.clientName} onChange={v => set('clientName', v)} placeholder="e.g. ABC Pvt Ltd" err={errs.clientName} />
                <div>
                  <label style={s.label}>Client ID <span style={s.req}>*</span></label>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <input
                      value={idLoading ? 'Loading…' : form.clientCode}
                      readOnly
                      style={{ ...s.input(false, false), flex: 1, fontFamily: 'monospace', letterSpacing: '2px', fontWeight: 700, fontSize: '15px', background: '#F0F4F8', color: '#0070F2', cursor: 'default' }}
                    />
                    <button onClick={fetchNextId} title="Refresh ID" style={{ padding: '7px 12px', background: '#EAF1FB', border: '1px solid #A9CBF4', color: '#0070F2', borderRadius: '4px', cursor: 'pointer', fontSize: '13px', fontWeight: 600, fontFamily: 'inherit', whiteSpace: 'nowrap' }}>↻</button>
                  </div>
                  <div style={s.hint}>Auto-assigned by system · starts at 100001</div>
                </div>
                <FSelect label="Business Type" req value={form.businessType} onChange={v => set('businessType', v)}
                  options={['Proprietorship','Partnership','Private Limited','Public Limited','LLP','Government','Individual','Trust / NGO','HUF']} err={errs.businessType} />
                <FSelect label="Industry Type" value={form.industryType} onChange={v => set('industryType', v)} options={INDUSTRY_TYPES} />
              </div>
            </div>

            <div style={s.card}>
              <div style={s.sectionHead}>Tax Identity</div>
              <div style={s.grid2}>
                <FInput label="PAN Number" value={form.pan} onChange={v => set('pan', v)} placeholder="ABCDE1234F"
                  err={errs.pan} hint="Format: 5 letters, 4 digits, 1 letter" maxLength={10} upper />
                <div>
                  <FInput label="GST Number" value={form.gst} onChange={v => set('gst', v)} placeholder="22AAAAA0000A1Z5"
                    err={errs.gst} hint="15-character GST Identification Number" maxLength={15} upper />
                  {gstWarn && <div style={{ fontSize: '11px', color: '#188918', marginTop: '3px', fontWeight: 600 }}>✓ {gstWarn}</div>}
                </div>
                <FInput label="CIN Number" value={form.cin} onChange={v => set('cin', v)} placeholder="U74999MH2020PTC123456" hint="Corporate Identity Number (optional)" upper />
                <FInput label="MSME Number" value={form.msme} onChange={v => set('msme', v)} placeholder="UDYAM-XX-00-0000000" hint="Optional – for MSME-registered businesses" />
              </div>
            </div>
          </>
        )}

        {/* ── TAB 2: Contact Details ── */}
        {tab === 'contact' && (
          <div style={s.card}>
            <div style={s.sectionHead}>Contact Information</div>
            <div style={s.grid2}>
              <FInput label="Contact Person Name" req value={form.contactPerson} onChange={v => set('contactPerson', v)} placeholder="Full name" err={errs.contactPerson} />
              <FInput label="Mobile Number" req value={form.mobile} onChange={v => set('mobile', v.replace(/\D/, ''))} placeholder="10-digit mobile" maxLength={10} err={errs.mobile} hint="Indian mobile: starts with 6-9" />
              <FInput label="Alternate Mobile" value={form.altMobile} onChange={v => set('altMobile', v.replace(/\D/, ''))} placeholder="Alternate number" maxLength={10} err={errs.altMobile} />
              <FInput label="Email ID" type="email" value={form.email} onChange={v => set('email', v)} placeholder="example@company.com" err={errs.email} />
              <FInput label="Landline Number" value={form.landline} onChange={v => set('landline', v)} placeholder="STD + Number (e.g. 0222-1234567)" />
              <FInput label="Website" value={form.website} onChange={v => set('website', v)} placeholder="https://www.company.com" />
            </div>
          </div>
        )}

        {/* ── TAB 3: Address Details ── */}
        {tab === 'address' && (
          <>
            <div style={s.card}>
              <div style={s.sectionHead}>Billing Address</div>
              <FTextarea label="Billing Address" req value={form.billingAddr} onChange={v => set('billingAddr', v)} placeholder="Door no, Street, Area..." err={errs.billingAddr} />
              <div style={{ height: '14px' }} />
              <div style={s.grid3}>
                <FSelect label="State" req value={form.state} onChange={v => set('state', v)} options={STATES} err={errs.state} />
                <FInput label="City" req value={form.city} onChange={v => set('city', v)} placeholder="City" err={errs.city} />
                <FInput label="Pincode" value={form.pincode} onChange={v => set('pincode', v.replace(/\D/, ''))} placeholder="6-digit" maxLength={6} err={errs.pincode} />
              </div>
              <div style={{ marginTop: '14px' }}>
                <FInput label="Country" value={form.country} onChange={v => set('country', v)} />
              </div>
            </div>
            <div style={s.card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <div style={s.sectionHead}>Shipping Address</div>
                <button onClick={() => set('shippingAddr', form.billingAddr)} style={{ fontSize: '12px', color: '#0070F2', background: '#EAF1FB', border: '1px solid #A9CBF4', borderRadius: '4px', padding: '4px 12px', cursor: 'pointer', fontWeight: 600, fontFamily: 'inherit' }}>
                  Copy from Billing
                </button>
              </div>
              <FTextarea label="Shipping Address" value={form.shippingAddr} onChange={v => set('shippingAddr', v)} placeholder="Door no, Street, Area... (leave blank if same as billing)" />
            </div>
          </>
        )}

        {/* ── TAB 4: Tax & Compliance ── */}
        {tab === 'tax' && (
          <div style={s.card}>
            <div style={s.sectionHead}>GST & Tax Settings</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '600px' }}>
              <div style={{ padding: '14px 16px', background: '#F5F8FC', border: '1px solid #CBE0F5', borderLeft: '3px solid #0070F2', borderRadius: '4px' }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#354A5E', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>GST Registration</div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '13px', color: '#32363A' }}>GST Registered</span>
                  <Toggle id="gstReg" checked={form.gstRegistered} onChange={e => set('gstRegistered', e.target.checked)} />
                </div>
                {form.gstRegistered && (
                  <div style={{ marginTop: '12px' }}>
                    <label style={s.label}>GST Type</label>
                    <div style={{ display: 'flex', gap: '10px' }}>
                      {['Regular', 'Composition', 'Unregistered', 'Consumer', 'SEZ'].map(t => (
                        <label key={t} style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '13px' }}>
                          <input type="radio" name="gstType" value={t} checked={form.gstType === t} onChange={() => set('gstType', t)} style={{ accentColor: '#0070F2' }} />
                          {t}
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div style={{ padding: '14px 16px', background: '#F5F8FC', border: '1px solid #CBE0F5', borderLeft: '3px solid #E9730C', borderRadius: '4px' }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#354A5E', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>TDS Applicability</div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '13px', color: '#32363A' }}>TDS Applicable</span>
                  <Toggle id="tds" checked={form.tdsApplicable} onChange={e => set('tdsApplicable', e.target.checked)} />
                </div>
              </div>

              <div style={s.grid2}>
                <FileUpload label="PAN Card Upload" hint="PDF, JPG, PNG – max 2MB" />
                <FileUpload label="GST Certificate Upload" hint="PDF, JPG, PNG – max 2MB" />
              </div>
            </div>
          </div>
        )}

        {/* ── TAB 5: Banking Details ── */}
        {tab === 'bank' && (
          <div style={s.card}>
            <div style={s.sectionHead}>Bank Account Information</div>
            <div style={s.grid2}>
              <FSelect label="Bank Name" value={form.bankName} onChange={v => set('bankName', v)}
                options={['State Bank of India','HDFC Bank','ICICI Bank','Axis Bank','Punjab National Bank','Bank of Baroda','Canara Bank','Union Bank of India','Kotak Mahindra Bank','IndusInd Bank','Yes Bank','IDBI Bank','Federal Bank','South Indian Bank','Other']} />
              <FInput label="Account Holder Name" value={form.accountHolder} onChange={v => set('accountHolder', v)} placeholder="As per bank records" />
              <FInput label="Account Number" value={form.accountNo} onChange={v => set('accountNo', v.replace(/\D/, ''))} placeholder="Account number" />
              <div>
                <FInput label="IFSC Code" value={form.ifsc} onChange={v => set('ifsc', v)} placeholder="e.g. SBIN0001234" maxLength={11} err={errs.ifsc} upper hint="11-character code" />
                {form.ifsc.length === 11 && validate.ifsc(form.ifsc) && (
                  <div style={{ fontSize: '11px', color: '#188918', marginTop: '3px', fontWeight: 600 }}>✓ Valid IFSC format</div>
                )}
              </div>
              <FInput label="Branch Name" value={form.branch} onChange={v => set('branch', v)} placeholder="Branch name and city" />
              <FInput label="UPI ID" value={form.upi} onChange={v => set('upi', v)} placeholder="name@bank (optional)" hint="Optional — for UPI-based payments" />
            </div>
            <div style={{ marginTop: '16px', padding: '10px 14px', background: '#FEF3CD', border: '1px solid #F6C244', borderLeft: '3px solid #F6C244', borderRadius: '4px', fontSize: '12px', color: '#7A4F01', display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
              <I.Alert />
              <span>Bank account details will be used for payment processing. Please verify all information carefully before saving.</span>
            </div>
          </div>
        )}

        {/* ── TAB 6: Payment & Terms ── */}
        {tab === 'payment' && (
          <div style={s.card}>
            <div style={s.sectionHead}>Payment Configuration</div>
            <div style={s.grid2}>
              <FSelect label="Payment Terms" req value={form.paymentTerms} onChange={v => set('paymentTerms', v)}
                options={['Advance','7 Days','15 Days','30 Days','45 Days','60 Days','90 Days','On Delivery']} />
              <div>
                <label style={s.label}>Currency</label>
                <select value={form.currency} onChange={e => set('currency', e.target.value)} style={s.select(false)}>
                  <option value="INR">INR — Indian Rupee ₹</option>
                  <option value="USD">USD — US Dollar $</option>
                  <option value="EUR">EUR — Euro €</option>
                  <option value="GBP">GBP — British Pound £</option>
                  <option value="AED">AED — UAE Dirham</option>
                </select>
              </div>
              <div>
                <label style={s.label}>Credit Limit ({form.currency})</label>
                <div style={{ display: 'flex', alignItems: 'center', border: '1px solid #BBBCBD', borderRadius: '4px', overflow: 'hidden', background: '#FAFAFA' }}>
                  <span style={{ padding: '7px 10px', background: '#EEF3F8', borderRight: '1px solid #E5E5E5', fontSize: '13px', color: '#354A5E', fontWeight: 600 }}>₹</span>
                  <input value={form.creditLimit} onChange={e => set('creditLimit', e.target.value.replace(/\D/, ''))}
                    placeholder="0" style={{ flex: 1, padding: '7px 10px', border: 'none', outline: 'none', background: 'transparent', fontSize: '13px', fontFamily: 'inherit' }} />
                </div>
              </div>
            </div>

            <div style={{ marginTop: '18px' }}>
              <label style={s.label}>Payment Modes <span style={s.req}>*</span></label>
              <MultiCheck
                options={['NEFT','RTGS','IMPS','Cheque','Cash','UPI','DD','Credit Card']}
                selected={form.paymentModes}
                onChange={v => set('paymentModes', v)}
              />
              {errs.paymentModes && <div style={s.err}>{errs.paymentModes}</div>}
            </div>

            {/* Summary card */}
            {(form.paymentTerms || form.creditLimit) && (
              <div style={{ marginTop: '20px', padding: '14px', background: '#EAF1FB', border: '1px solid #A9CBF4', borderRadius: '4px' }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#354A5E', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Payment Summary</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                  <SummaryCell label="Terms" value={form.paymentTerms} />
                  <SummaryCell label="Credit Limit" value={form.creditLimit ? `₹ ${Number(form.creditLimit).toLocaleString('en-IN')}` : '—'} />
                  <SummaryCell label="Currency" value={form.currency} />
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── TAB 7: Additional Details ── */}
        {tab === 'extra' && (
          <div style={s.card}>
            <div style={s.sectionHead}>Classification & Assignment</div>
            <div style={s.grid2}>
              <div>
                <label style={s.label}>Client Category</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {[
                    { val: 'Regular',    color: '#0070F2', bg: '#EAF1FB', border: '#A9CBF4' },
                    { val: 'VIP',        color: '#E9730C', bg: '#FEF3E2', border: '#F6C244' },
                    { val: 'Blacklisted',color: '#BB0000', bg: '#FFEBEB', border: '#F5B8B8' },
                  ].map(opt => (
                    <button key={opt.val} onClick={() => set('category', opt.val)} style={{
                      flex: 1, padding: '8px', borderRadius: '4px', cursor: 'pointer', fontFamily: 'inherit',
                      border: `1px solid ${form.category === opt.val ? opt.color : '#E5E5E5'}`,
                      background: form.category === opt.val ? opt.bg : '#FAFAFA',
                      color: form.category === opt.val ? opt.color : '#6A6D70',
                      fontSize: '12px', fontWeight: form.category === opt.val ? 700 : 400,
                      transition: 'all 0.12s',
                    }}>{opt.val}</button>
                  ))}
                </div>
                {form.category === 'Blacklisted' && (
                  <div style={{ fontSize: '11px', color: '#BB0000', marginTop: '6px', fontWeight: 600, display: 'flex', gap: '5px', alignItems: 'center' }}>
                    <I.Alert /> This client is blacklisted — transactions will be blocked.
                  </div>
                )}
              </div>
              <FSelect label="Sales Person Assigned" value={form.salesPerson} onChange={v => set('salesPerson', v)} options={SALES_PERSONS} placeholder="— Assign Sales Person —" />
            </div>

            <div style={{ marginTop: '16px' }}>
              <FTextarea label="Remarks" value={form.remarks} onChange={v => set('remarks', v)} placeholder="Internal notes about this client..." rows={4} />
            </div>

            <div style={{ marginTop: '16px' }}>
              <FileUpload label="Attachments (Documents, Agreements, etc.)" hint="PDF, DOCX, JPG — max 10MB each" />
            </div>

            {/* Review card */}
            <div style={{ marginTop: '20px', padding: '14px', background: '#F5F8FC', border: '1px solid #CBE0F5', borderRadius: '4px' }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#354A5E', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Quick Review</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                <SummaryCell label="Client Name"  value={form.clientName  || '—'} />
                <SummaryCell label="Client Code"  value={form.clientCode  || '—'} />
                <SummaryCell label="Business"     value={form.businessType || '—'} />
                <SummaryCell label="Mobile"       value={form.mobile      || '—'} />
                <SummaryCell label="GST"          value={form.gst         || '—'} />
                <SummaryCell label="State"        value={form.state       || '—'} />
                <SummaryCell label="Pay Terms"    value={form.paymentTerms|| '—'} />
                <SummaryCell label="Category"     value={form.category    || '—'} />
                <SummaryCell label="Sales Person" value={form.salesPerson || '—'} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Footer ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 20px', background: '#F5F6F7', border: '1px solid #E5E5E5', borderTop: 'none', borderRadius: '0 0 6px 6px' }}>
        <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} title={t.label} style={{
              width: '28px', height: '5px', borderRadius: '3px', border: 'none', cursor: 'pointer',
              background: tab === t.id ? '#0070F2' : '#D9D9D9', transition: 'background 0.15s',
            }} />
          ))}
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <span style={{ fontSize: '12px', color: '#6A6D70' }}>
            Tab {TABS.findIndex(t => t.id === tab) + 1} of {TABS.length} — {TABS.find(t => t.id === tab)?.label}
          </span>
          {TABS.findIndex(t => t.id === tab) > 0 && (
            <button onClick={() => setTab(TABS[TABS.findIndex(t => t.id === tab) - 1].id)} style={{ padding: '7px 14px', background: '#fff', border: '1px solid #D9D9D9', color: '#32363A', borderRadius: '4px', cursor: 'pointer', fontSize: '13px', fontWeight: 600, fontFamily: 'inherit' }}>← Prev</button>
          )}
          {TABS.findIndex(t => t.id === tab) < TABS.length - 1 ? (
            <button onClick={() => setTab(TABS[TABS.findIndex(t => t.id === tab) + 1].id)} style={{ padding: '7px 14px', background: '#0070F2', border: 'none', color: 'white', borderRadius: '4px', cursor: 'pointer', fontSize: '13px', fontWeight: 600, fontFamily: 'inherit' }}>Next →</button>
          ) : (
            <button onClick={handleSave} style={{ padding: '7px 20px', background: '#0070F2', border: 'none', color: 'white', borderRadius: '4px', cursor: 'pointer', fontSize: '13px', fontWeight: 600, fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <I.Save /> Save Client
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Helpers ─────────────────────────────────────── */
function SummaryCell({ label, value }) {
  return (
    <div style={{ padding: '8px 10px', background: '#fff', borderRadius: '4px', border: '1px solid #E5E5E5' }}>
      <div style={{ fontSize: '10px', fontWeight: 700, color: '#6A6D70', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '3px' }}>{label}</div>
      <div style={{ fontSize: '13px', color: '#32363A', fontWeight: 500, wordBreak: 'break-all' }}>{value}</div>
    </div>
  );
}
