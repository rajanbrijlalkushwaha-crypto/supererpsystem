import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useCompany } from '../../context/CompanyContext';
import { useStaffNames } from '../../hooks/useStaffNames';

/* ═══════════════════════════════════════════════════
   CONSTANTS
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

const STATE_GST_MAP = {
  1:'Jammu and Kashmir',2:'Himachal Pradesh',3:'Punjab',4:'Chandigarh',
  5:'Uttarakhand',6:'Haryana',7:'Delhi',8:'Rajasthan',9:'Uttar Pradesh',
  10:'Bihar',11:'Sikkim',12:'Arunachal Pradesh',13:'Nagaland',14:'Manipur',
  15:'Mizoram',16:'Tripura',17:'Meghalaya',18:'Assam',19:'West Bengal',
  20:'Jharkhand',21:'Odisha',22:'Chhattisgarh',23:'Madhya Pradesh',
  24:'Gujarat',27:'Maharashtra',28:'Andhra Pradesh',29:'Karnataka',
  30:'Goa',31:'Lakshadweep',32:'Kerala',33:'Tamil Nadu',34:'Puducherry',
  35:'Andaman and Nicobar Islands',36:'Telangana',38:'Ladakh',
};

const TABS = [
  { id: 'basic',   label: 'Basic Information',  icon: '🏢' },
  { id: 'contact', label: 'Contact Details',    icon: '📞' },
  { id: 'address', label: 'Address Details',    icon: '📍' },
  { id: 'tax',     label: 'Tax & Compliance',   icon: '📋' },
  { id: 'bank',    label: 'Banking Details',    icon: '🏦' },
  { id: 'payment', label: 'Payment & Terms',    icon: '💳' },
  { id: 'extra',   label: 'Additional Details', icon: '⚙️' },
];

/* ═══════════════════════════════════════════════════
   VALIDATORS
═══════════════════════════════════════════════════ */
const validators = {
  pan:    v => /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(v),
  gst:    v => /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(v),
  mobile: v => /^[6-9]\d{9}$/.test(v),
  email:  v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
  pin:    v => /^[1-9][0-9]{5}$/.test(v),
  ifsc:   v => /^[A-Z]{4}0[A-Z0-9]{6}$/.test(v),
};

/* ═══════════════════════════════════════════════════
   STYLE ATOMS
═══════════════════════════════════════════════════ */
const css = {
  card:    { background:'#fff', border:'1px solid #E5E5E5', borderRadius:'6px', padding:'20px 22px', marginBottom:'16px', boxShadow:'0 1px 4px rgba(0,0,0,0.06)' },
  secHead: { fontSize:'11px', fontWeight:700, color:'#104f4f', textTransform:'uppercase', letterSpacing:'0.7px', borderBottom:'2px solid #104f4f', paddingBottom:'5px', marginBottom:'16px' },
  lbl:     { fontSize:'12px', fontWeight:600, color:'#32363A', marginBottom:'4px', display:'block' },
  req:     { color:'#BB0000', marginLeft:'2px' },
  err:     { fontSize:'11px', color:'#BB0000', marginTop:'3px', fontWeight:600 },
  hint:    { fontSize:'11px', color:'#6A6D70', marginTop:'3px' },
  g2:      { display:'grid', gridTemplateColumns:'1fr 1fr', gap:'14px 22px' },
  g3:      { display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'14px 22px' },
};

function inp(err, foc) {
  return {
    width:'100%', padding:'7px 10px',
    border:`1px solid ${err?'#BB0000':foc?'#104f4f':'#BBBCBD'}`,
    borderRadius:'4px', fontSize:'13px', fontFamily:'inherit',
    background: foc?'#fff':'#FAFAFA', color:'#32363A', outline:'none',
    boxShadow: err?'0 0 0 2px rgba(187,0,0,0.08)':foc?'0 0 0 2px rgba(0,112,242,0.12)':'none',
    transition:'all 0.15s',
  };
}

function selStyle(err) {
  return { width:'100%', padding:'7px 10px', border:`1px solid ${err?'#BB0000':'#BBBCBD'}`, borderRadius:'4px', fontSize:'13px', fontFamily:'inherit', background:'#FAFAFA', color:'#32363A', outline:'none', cursor:'pointer' };
}

/* ── Atoms ──────────────────────────────────────── */
function FInput({ label, req, value, onChange, placeholder, err, hint, type='text', maxLength, upper, readOnly }) {
  const [foc, setFoc] = useState(false);
  return (
    <div>
      <label style={css.lbl}>{label}{req && <span style={css.req}>*</span>}</label>
      <input type={type} value={value} maxLength={maxLength} placeholder={placeholder} readOnly={readOnly}
        onChange={e => onChange && onChange(upper ? e.target.value.toUpperCase() : e.target.value)}
        onFocus={() => setFoc(true)} onBlur={() => setFoc(false)}
        style={{ ...inp(err, foc), ...(readOnly ? { background:'#F0F4F8', cursor:'default' } : {}) }}
      />
      {err   && <div style={css.err}>{err}</div>}
      {!err && hint && <div style={css.hint}>{hint}</div>}
    </div>
  );
}

function FSelect({ label, req, value, onChange, options, err, placeholder='— Select —' }) {
  return (
    <div>
      <label style={css.lbl}>{label}{req && <span style={css.req}>*</span>}</label>
      <select value={value} onChange={e => onChange(e.target.value)} style={selStyle(err)}>
        <option value="">{placeholder}</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
      {err && <div style={css.err}>{err}</div>}
    </div>
  );
}

function FTextarea({ label, req, value, onChange, placeholder, rows=4, err }) {
  const [foc, setFoc] = useState(false);
  return (
    <div>
      <label style={css.lbl}>{label}{req && <span style={css.req}>*</span>}</label>
      <textarea value={value} rows={rows} placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
        onFocus={() => setFoc(true)} onBlur={() => setFoc(false)}
        style={{ ...inp(err, foc), resize:'vertical', minHeight: rows*22+'px' }}
      />
      {err && <div style={css.err}>{err}</div>}
    </div>
  );
}

function Toggle({ id, checked, onChange }) {
  return (
    <label htmlFor={id} style={{ display:'inline-flex', alignItems:'center', gap:'10px', cursor:'pointer' }}>
      <div style={{ position:'relative', width:'42px', height:'22px', background: checked?'#104f4f':'#BBBCBD', borderRadius:'11px', transition:'background 0.2s', flexShrink:0 }}>
        <input id={id} type="checkbox" checked={checked} onChange={onChange} style={{ position:'absolute', opacity:0, width:0, height:0 }} />
        <div style={{ position:'absolute', top:'3px', left: checked?'22px':'3px', width:'16px', height:'16px', background:'white', borderRadius:'50%', transition:'left 0.2s', boxShadow:'0 1px 3px rgba(0,0,0,0.2)' }} />
      </div>
      <span style={{ fontSize:'13px', color: checked?'#104f4f':'#6A6D70', fontWeight: checked?600:400 }}>{checked?'Yes':'No'}</span>
    </label>
  );
}

function MultiCheck({ options, selected, onChange }) {
  const toggle = opt => onChange(selected.includes(opt) ? selected.filter(x=>x!==opt) : [...selected, opt]);
  return (
    <div style={{ display:'flex', flexWrap:'wrap', gap:'8px' }}>
      {options.map(opt => {
        const on = selected.includes(opt);
        return (
          <button key={opt} type="button" onClick={() => toggle(opt)} style={{
            padding:'5px 14px', borderRadius:'16px',
            border:`1px solid ${on?'#104f4f':'#D9D9D9'}`,
            background: on?'#EAF1FB':'#FAFAFA',
            color: on?'#104f4f':'#6A6D70',
            fontSize:'12px', fontWeight: on?600:400,
            cursor:'pointer', fontFamily:'inherit', transition:'all 0.12s',
          }}>{opt}</button>
        );
      })}
    </div>
  );
}

function Toast({ type, msg, onClose }) {
  useEffect(() => { const t = setTimeout(onClose, 4500); return () => clearTimeout(t); }, [onClose]);
  const ok = type === 'success';
  return (
    <div style={{
      position:'fixed', top:'20px', right:'24px', zIndex:9999,
      background: ok?'#E8F5E9':'#FFEBEB',
      border:`1px solid ${ok?'#82C98A':'#F5B8B8'}`,
      borderLeft:`4px solid ${ok?'#188918':'#BB0000'}`,
      borderRadius:'6px', padding:'14px 18px', minWidth:'320px',
      display:'flex', alignItems:'center', gap:'10px',
      boxShadow:'0 4px 20px rgba(0,0,0,0.14)',
    }}>
      <span style={{ fontSize:'18px' }}>{ok?'✅':'❌'}</span>
      <span style={{ fontSize:'13px', color: ok?'#0A6640':'#BB0000', fontWeight:600, flex:1 }}>{msg}</span>
      <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:'#6A6D70', fontSize:'18px' }}>×</button>
    </div>
  );
}

function SummaryCell({ label, value }) {
  return (
    <div style={{ padding:'8px 10px', background:'#fff', borderRadius:'4px', border:'1px solid #E5E5E5' }}>
      <div style={{ fontSize:'10px', fontWeight:700, color:'#6A6D70', textTransform:'uppercase', letterSpacing:'0.4px', marginBottom:'3px' }}>{label}</div>
      <div style={{ fontSize:'13px', color:'#32363A', fontWeight:500, wordBreak:'break-all' }}>{value||'—'}</div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   MAIN COMPONENT
═══════════════════════════════════════════════════ */
const EditClient = () => {
  const { clientId } = useParams();
  const navigate     = useNavigate();
  const { selectedCompany } = useCompany();
  const SALES_PERSONS = useStaffNames();

  const [activeTab, setActiveTab] = useState('basic');
  const [loading,   setLoading]   = useState(true);
  const [saving,    setSaving]    = useState(false);
  const [toast,     setToast]     = useState(null);
  const [errs,      setErrs]      = useState({});
  const [gstWarn,   setGstWarn]   = useState('');

  const [form, setForm] = useState({
    clientCode:'', clientName:'', businessType:'', industryType:'', pan:'', gst:'', cin:'', msme:'',
    contactPerson:'', mobile:'', altMobile:'', email:'', website:'', landline:'',
    billingAddr:'', shippingAddr:'', state:'', city:'', pincode:'', country:'India',
    gstRegistered:true, gstType:'Regular', tdsApplicable:false,
    bankName:'', accountHolder:'', accountNo:'', ifsc:'', branch:'', upi:'',
    paymentTerms:'30 Days', creditLimit:'', paymentModes:[], currency:'INR',
    category:'Regular', salesPerson:'', remarks:'',
    status:'draft',
  });

  /* existing documents (saved on server) */
  const [documents, setDocuments] = useState([]);

  /* ── Load existing client data ── */
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await axios.get(`/api/clients/${clientId}`);
        const c   = res.data;

        /* map old fields → new unified form */
        const cp0 = (c.contactPersons || [])[0] || {};
        setForm(f => ({
          ...f,
          clientCode:    String(c.clientId || clientId),
          clientName:    c.companyName || c.clientName || '',
          businessType:  c.businessType  || '',
          industryType:  c.industryType  || '',
          pan:           c.pan           || '',
          gst:           c.gstin         || c.gst || '',
          cin:           c.cin           || '',
          msme:          c.msme          || '',
          contactPerson: cp0.name        || c.contactPerson || '',
          mobile:        cp0.mobileNumber|| c.mobile       || '',
          altMobile:     cp0.altMobile   || c.altMobile    || '',
          email:         cp0.email       || c.email        || '',
          website:       c.website       || '',
          landline:      c.landline      || '',
          billingAddr:   c.address       || c.billingAddr  || '',
          shippingAddr:  c.shippingAddr  || '',
          state:         c.state         || '',
          city:          c.city          || '',
          pincode:       c.pincode       || '',
          country:       c.country       || 'India',
          gstRegistered: c.gstRegistered !== undefined ? c.gstRegistered : true,
          gstType:       c.gstType       || 'Regular',
          tdsApplicable: c.tdsApplicable || false,
          bankName:      c.bankName      || '',
          accountHolder: c.accountHolder || '',
          accountNo:     c.accountNo     || '',
          ifsc:          c.ifsc          || '',
          branch:        c.branch        || '',
          upi:           c.upi           || '',
          paymentTerms:  c.paymentTerms  || '30 Days',
          creditLimit:   c.creditLimit   || '',
          paymentModes:  c.paymentModes  || [],
          currency:      c.currency      || 'INR',
          category:      c.category      || 'Regular',
          salesPerson:   c.salesPerson   || '',
          remarks:       c.remarks       || '',
          status:        c.status        || 'draft',
        }));

        /* existing documents */
        setDocuments((c.documents || []).map(d => ({
          name: d.name || '', fileName: d.fileName || null,
          newFile: null, replaceMode: false,
        })));
      } catch (err) {
        setToast({ type:'error', msg:'Error loading client: ' + err.message });
      } finally {
        setLoading(false);
      }
    })();
  }, [clientId]);

  const set = (k, v) => {
    setForm(f => ({ ...f, [k]: v }));
    setErrs(e => ({ ...e, [k]: '' }));
    if (k === 'gst' && v.length === 15) {
      const code = parseInt(v.slice(0, 2), 10);
      if (STATE_GST_MAP[code]) {
        setForm(f => ({ ...f, gst: v, state: STATE_GST_MAP[code] }));
        setGstWarn(`State auto-filled: ${STATE_GST_MAP[code]}`);
        setTimeout(() => setGstWarn(''), 3500);
      }
    }
  };

  /* ── Validation ── */
  const runValidate = () => {
    const e = {};
    if (!form.clientName.trim())    e.clientName    = 'Client Name is required';
    if (!form.businessType)         e.businessType  = 'Business Type is required';
    if (form.pan && !validators.pan(form.pan))       e.pan    = 'Invalid PAN (e.g. ABCDE1234F)';
    if (form.gst && !validators.gst(form.gst))       e.gst    = 'Invalid GST (15-char format)';
    if (!form.contactPerson.trim()) e.contactPerson = 'Contact Person is required';
    if (!form.mobile)               e.mobile        = 'Mobile is required';
    else if (!validators.mobile(form.mobile))         e.mobile = 'Invalid mobile number';
    if (form.altMobile && !validators.mobile(form.altMobile)) e.altMobile = 'Invalid mobile number';
    if (form.email && !validators.email(form.email))           e.email     = 'Invalid email address';
    if (!form.billingAddr.trim())   e.billingAddr   = 'Billing Address is required';
    if (!form.state)                e.state         = 'State is required';
    if (!form.city.trim())          e.city          = 'City is required';
    if (form.pincode && !validators.pin(form.pincode))         e.pincode   = 'Invalid pincode';
    if (form.ifsc && !validators.ifsc(form.ifsc))              e.ifsc      = 'Invalid IFSC code';
    if (form.paymentModes.length === 0)               e.paymentModes = 'Select at least one payment mode';
    setErrs(e);
    return e;
  };

  const tabHasErr = (id, e) => ({
    basic:   ['clientName','businessType','pan','gst'],
    contact: ['contactPerson','mobile','altMobile','email'],
    address: ['billingAddr','state','city','pincode'],
    bank:    ['ifsc'],
    payment: ['paymentModes'],
  }[id]?.some(f => e[f]) || false);

  /* ── Submit ── */
  const handleSave = async (status) => {
    const e = runValidate();
    if (Object.keys(e).length > 0) {
      const errTab = TABS.find(t => tabHasErr(t.id, e));
      if (errTab) setActiveTab(errTab.id);
      setToast({ type:'error', msg:'Please fix the highlighted errors before updating.' });
      return;
    }

    setSaving(true);
    try {
      const fd = new FormData();
      fd.append('companyId',     selectedCompany?.companyId || '');
      fd.append('companyName',   form.clientName);
      fd.append('businessType',  form.businessType);
      fd.append('industryType',  form.industryType);
      fd.append('pan',           form.pan);
      fd.append('gstin',         form.gst);
      fd.append('gstType',       form.gstType);
      fd.append('cin',           form.cin);
      fd.append('msme',          form.msme);
      fd.append('address',       form.billingAddr);
      fd.append('shippingAddr',  form.shippingAddr);
      fd.append('city',          form.city);
      fd.append('state',         form.state);
      fd.append('pincode',       form.pincode);
      fd.append('country',       form.country);
      fd.append('gstRegistered', form.gstRegistered);
      fd.append('tdsApplicable', form.tdsApplicable);
      fd.append('bankName',      form.bankName);
      fd.append('accountHolder', form.accountHolder);
      fd.append('accountNo',     form.accountNo);
      fd.append('ifsc',          form.ifsc);
      fd.append('branch',        form.branch);
      fd.append('upi',           form.upi);
      fd.append('paymentTerms',  form.paymentTerms);
      fd.append('creditLimit',   form.creditLimit);
      fd.append('paymentModes',  JSON.stringify(form.paymentModes));
      fd.append('currency',      form.currency);
      fd.append('category',      form.category);
      fd.append('salesPerson',   form.salesPerson);
      fd.append('remarks',       form.remarks);
      fd.append('website',       form.website);
      fd.append('landline',      form.landline);
      fd.append('status',        status);

      /* contact persons array */
      fd.append('contactPersons', JSON.stringify([{
        name: form.contactPerson, mobileNumber: form.mobile,
        altMobile: form.altMobile, email: form.email,
        website: form.website, landline: form.landline,
      }]));

      /* documents — keep existing, upload new */
      const keepDocs  = documents.filter(d => !d.newFile).map(d => ({ name: d.name, ...(d.fileName ? { fileName: d.fileName } : {}) }));
      fd.append('documents', JSON.stringify(keepDocs));
      const uploadDocs = documents.filter(d => d.newFile);
      fd.append('fileNames', JSON.stringify(uploadDocs.map(d => d.name)));
      uploadDocs.forEach(d => fd.append('newFiles', d.newFile));

      await axios.put(`/api/clients/${clientId}`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });

      setToast({ type:'success', msg:`Client "${form.clientName}" (ID: ${clientId}) updated successfully!` });
      setTimeout(() => navigate('/client/view'), 2000);
    } catch (err) {
      setToast({ type:'error', msg:'Error: ' + (err.response?.data?.error || err.message) });
    } finally {
      setSaving(false);
    }
  };

  const tabIdx = TABS.findIndex(t => t.id === activeTab);

  if (loading) {
    return (
      <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'300px', flexDirection:'column', gap:'12px', fontFamily:'inherit' }}>
        <div style={{ width:'36px', height:'36px', border:'3px solid #E5E5E5', borderTopColor:'#104f4f', borderRadius:'50%', animation:'spin 0.8s linear infinite' }} />
        <div style={{ fontSize:'13px', color:'#6A6D70' }}>Loading client data…</div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  /* ════════════════════════════════════════════════
     RENDER
  ════════════════════════════════════════════════ */
  return (
    <div style={{ fontFamily:"'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", color:'#32363A' }}>
      {toast && <Toast type={toast.type} msg={toast.msg} onClose={() => setToast(null)} />}

      {/* ── Header ── */}
      <div style={{ background:'#104f4f', borderRadius:'6px 6px 0 0', padding:'10px 20px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <div>
          <div style={{ fontSize:'11px', color:'#A8C4E0', letterSpacing:'0.6px', marginBottom:'2px' }}>CLIENT MASTER MANAGEMENT</div>
          <div style={{ fontSize:'16px', fontWeight:700, color:'#fff' }}>
            Edit Client — <span style={{ color:'#90CAF9', fontFamily:'monospace' }}>{clientId}</span>
          </div>
        </div>
        <div style={{ display:'flex', gap:'8px' }}>
          <button onClick={() => navigate('/client/view')} style={{ background:'transparent', border:'1px solid rgba(255,255,255,0.35)', color:'white', padding:'7px 18px', borderRadius:'4px', cursor:'pointer', fontSize:'13px', fontWeight:600, fontFamily:'inherit' }}>
            ← Back to List
          </button>
          <button onClick={() => handleSave('draft')} disabled={saving} style={{ background:'#6A6D70', border:'none', color:'white', padding:'7px 18px', borderRadius:'4px', cursor:'pointer', fontSize:'13px', fontWeight:600, fontFamily:'inherit' }}>
            {saving ? '...' : '💾 Save Draft'}
          </button>
          <button onClick={() => handleSave('approved')} disabled={saving} style={{ background:'#104f4f', border:'none', color:'white', padding:'7px 20px', borderRadius:'4px', cursor:'pointer', fontSize:'13px', fontWeight:600, fontFamily:'inherit', display:'flex', alignItems:'center', gap:'6px' }}>
            {saving ? 'Updating…' : '✅ Update Client'}
          </button>
        </div>
      </div>

      {/* ── Tab Bar ── */}
      <div style={{ background:'#fff', borderLeft:'1px solid #E5E5E5', borderRight:'1px solid #E5E5E5', display:'flex', overflowX:'auto', borderBottom:'2px solid #E5E5E5' }}>
        {TABS.map(t => {
          const active  = activeTab === t.id;
          const hasErr  = Object.keys(errs).length > 0 && tabHasErr(t.id, errs);
          return (
            <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
              display:'flex', alignItems:'center', gap:'7px', padding:'10px 16px',
              cursor:'pointer', background: active?'#fff':'#F5F6F7',
              border:'none', borderBottom: active?'3px solid #104f4f':'3px solid transparent',
              borderRight:'1px solid #E5E5E5',
              color: hasErr?'#BB0000': active?'#104f4f':'#6A6D70',
              fontSize:'13px', fontWeight: active?600:400, fontFamily:'inherit',
              whiteSpace:'nowrap', marginBottom:'-2px', position:'relative',
            }}>
              <span style={{ fontSize:'14px' }}>{t.icon}</span>
              {t.label}
              {hasErr && <span style={{ width:'6px', height:'6px', borderRadius:'50%', background:'#BB0000', position:'absolute', top:'8px', right:'6px' }} />}
            </button>
          );
        })}
      </div>

      {/* ── Content ── */}
      <div style={{ background:'#F5F6F7', border:'1px solid #E5E5E5', borderTop:'none', borderRadius:'0 0 6px 6px', padding:'20px', minHeight:'460px' }}>

        {/* ══ TAB 1: Basic Information ══ */}
        {activeTab === 'basic' && (
          <>
            <div style={css.card}>
              <div style={css.secHead}>Client Identity</div>
              <div style={css.g2}>
                <FInput label="Client Name" req value={form.clientName} onChange={v => set('clientName',v)} placeholder="e.g. ABC Pvt Ltd" err={errs.clientName} />
                <div>
                  <label style={css.lbl}>Client ID</label>
                  <input value={form.clientCode} readOnly style={{ ...inp(false,false), fontFamily:'monospace', letterSpacing:'2px', fontWeight:700, fontSize:'15px', background:'#F0F4F8', color:'#104f4f', cursor:'default' }} />
                  <div style={css.hint}>System-assigned ID — cannot be changed</div>
                </div>
                <FSelect label="Business Type" req value={form.businessType} onChange={v => set('businessType',v)} err={errs.businessType}
                  options={['Proprietorship','Partnership','Private Limited','Public Limited','LLP','Government','Individual','Trust / NGO','HUF']} />
                <FSelect label="Industry Type" value={form.industryType} onChange={v => set('industryType',v)} options={INDUSTRY_TYPES} />
              </div>
            </div>
            <div style={css.card}>
              <div style={css.secHead}>Tax Identity</div>
              <div style={css.g2}>
                <FInput label="PAN Number" value={form.pan} onChange={v => set('pan',v)} placeholder="ABCDE1234F" err={errs.pan} hint="Format: 5 letters · 4 digits · 1 letter" maxLength={10} upper />
                <div>
                  <FInput label="GST Number" value={form.gst} onChange={v => set('gst',v)} placeholder="22AAAAA0000A1Z5" err={errs.gst} hint="15-character GSTIN" maxLength={15} upper />
                  {gstWarn && <div style={{ fontSize:'11px', color:'#188918', marginTop:'3px', fontWeight:600 }}>✓ {gstWarn}</div>}
                </div>
                <FInput label="CIN Number" value={form.cin} onChange={v => set('cin',v)} placeholder="U74999MH2020PTC123456" hint="Optional" upper />
                <FInput label="MSME Number" value={form.msme} onChange={v => set('msme',v)} placeholder="UDYAM-XX-00-0000000" hint="Optional" />
              </div>
            </div>
          </>
        )}

        {/* ══ TAB 2: Contact Details ══ */}
        {activeTab === 'contact' && (
          <div style={css.card}>
            <div style={css.secHead}>Contact Information</div>
            <div style={css.g2}>
              <FInput label="Contact Person Name" req value={form.contactPerson} onChange={v => set('contactPerson',v)} placeholder="Full name" err={errs.contactPerson} />
              <FInput label="Mobile Number" req value={form.mobile} onChange={v => set('mobile',v.replace(/\D/,''))} placeholder="10-digit mobile" maxLength={10} err={errs.mobile} hint="Starts with 6, 7, 8, or 9" />
              <FInput label="Alternate Mobile" value={form.altMobile} onChange={v => set('altMobile',v.replace(/\D/,''))} placeholder="Alternate number" maxLength={10} err={errs.altMobile} />
              <FInput label="Email ID" type="email" value={form.email} onChange={v => set('email',v)} placeholder="contact@company.com" err={errs.email} />
              <FInput label="Landline Number" value={form.landline} onChange={v => set('landline',v)} placeholder="STD + Number" />
              <FInput label="Website" value={form.website} onChange={v => set('website',v)} placeholder="https://www.company.com" />
            </div>
          </div>
        )}

        {/* ══ TAB 3: Address Details ══ */}
        {activeTab === 'address' && (
          <>
            <div style={css.card}>
              <div style={css.secHead}>Billing Address</div>
              <FTextarea label="Billing Address" req value={form.billingAddr} onChange={v => set('billingAddr',v)} placeholder="Door no, Street, Area…" err={errs.billingAddr} />
              <div style={{ height:'14px' }} />
              <div style={css.g3}>
                <FSelect label="State" req value={form.state} onChange={v => set('state',v)} options={STATES} err={errs.state} />
                <FInput label="City" req value={form.city} onChange={v => set('city',v)} placeholder="City" err={errs.city} />
                <FInput label="Pincode" value={form.pincode} onChange={v => set('pincode',v.replace(/\D/,''))} placeholder="6-digit" maxLength={6} err={errs.pincode} />
              </div>
              <div style={{ marginTop:'14px', maxWidth:'300px' }}>
                <FInput label="Country" value={form.country} onChange={v => set('country',v)} />
              </div>
            </div>
            <div style={css.card}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'14px' }}>
                <div style={css.secHead}>Shipping Address</div>
                <button type="button" onClick={() => set('shippingAddr', form.billingAddr)} style={{ fontSize:'12px', color:'#104f4f', background:'#EAF1FB', border:'1px solid #A9CBF4', borderRadius:'4px', padding:'4px 12px', cursor:'pointer', fontWeight:600, fontFamily:'inherit' }}>📋 Copy from Billing</button>
              </div>
              <FTextarea label="Shipping Address" value={form.shippingAddr} onChange={v => set('shippingAddr',v)} placeholder="Leave blank if same as billing…" />
            </div>
          </>
        )}

        {/* ══ TAB 4: Tax & Compliance ══ */}
        {activeTab === 'tax' && (
          <div style={css.card}>
            <div style={css.secHead}>GST & Compliance Settings</div>
            <div style={{ display:'flex', flexDirection:'column', gap:'18px', maxWidth:'620px' }}>
              <div style={{ padding:'14px 16px', background:'#F5F8FC', border:'1px solid #CBE0F5', borderLeft:'3px solid #104f4f', borderRadius:'4px' }}>
                <div style={{ fontSize:'12px', fontWeight:700, color:'#104f4f', marginBottom:'10px', textTransform:'uppercase', letterSpacing:'0.5px' }}>GST Registration</div>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'12px' }}>
                  <span style={{ fontSize:'13px' }}>GST Registered</span>
                  <Toggle id="gstReg" checked={form.gstRegistered} onChange={e => set('gstRegistered', e.target.checked)} />
                </div>
                {form.gstRegistered && (
                  <>
                    <label style={{ ...css.lbl, marginBottom:'8px' }}>GST Type</label>
                    <div style={{ display:'flex', flexWrap:'wrap', gap:'8px' }}>
                      {['Regular','Composition','Unregistered','Consumer','SEZ'].map(t => (
                        <label key={t} style={{ display:'flex', alignItems:'center', gap:'6px', cursor:'pointer', fontSize:'13px', padding:'5px 12px', border:`1px solid ${form.gstType===t?'#104f4f':'#D9D9D9'}`, borderRadius:'4px', background: form.gstType===t?'#EAF1FB':'#FAFAFA', color: form.gstType===t?'#104f4f':'#6A6D70', fontWeight: form.gstType===t?600:400 }}>
                          <input type="radio" name="gstType" value={t} checked={form.gstType===t} onChange={() => set('gstType',t)} style={{ accentColor:'#104f4f' }} />
                          {t}
                        </label>
                      ))}
                    </div>
                  </>
                )}
              </div>
              <div style={{ padding:'14px 16px', background:'#F5F8FC', border:'1px solid #CBE0F5', borderLeft:'3px solid #E9730C', borderRadius:'4px' }}>
                <div style={{ fontSize:'12px', fontWeight:700, color:'#104f4f', marginBottom:'10px', textTransform:'uppercase', letterSpacing:'0.5px' }}>TDS Applicability</div>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                  <span style={{ fontSize:'13px' }}>TDS Applicable</span>
                  <Toggle id="tds" checked={form.tdsApplicable} onChange={e => set('tdsApplicable', e.target.checked)} />
                </div>
              </div>

              {/* Existing documents */}
              <div>
                <div style={{ fontSize:'12px', fontWeight:700, color:'#104f4f', marginBottom:'10px', textTransform:'uppercase', letterSpacing:'0.5px' }}>Documents</div>
                {documents.length === 0 && <div style={{ fontSize:'12px', color:'#94A3B8', marginBottom:'10px' }}>No documents attached.</div>}
                {documents.map((doc, i) => (
                  <div key={i} style={{ display:'flex', gap:'10px', marginBottom:'8px', alignItems:'flex-end', flexWrap:'wrap', padding:'10px 12px', background:'#F5F8FC', border:'1px solid #CBE0F5', borderLeft:'3px solid #104f4f', borderRadius:'4px' }}>
                    <div style={{ flex:'0 0 180px' }}>
                      <label style={css.lbl}>Document Name</label>
                      <input value={doc.name} onChange={e => setDocuments(d => d.map((x,j)=>j===i?{...x,name:e.target.value}:x))} style={inp(false,false)} />
                    </div>
                    <div style={{ flex:1, minWidth:'160px' }}>
                      {doc.fileName && !doc.replaceMode ? (
                        <div style={{ display:'flex', gap:'8px', alignItems:'center', flexWrap:'wrap' }}>
                          <span style={{ fontSize:'12px', color:'#188918', fontWeight:600 }}>📎 File attached</span>
                          <a href={`/api/clients/${clientId}/download/${doc.fileName}`} target="_blank" rel="noopener noreferrer" style={{ fontSize:'11px', color:'#104f4f', textDecoration:'underline' }}>⬇️ Download</a>
                          <button type="button" onClick={() => setDocuments(d => d.map((x,j)=>j===i?{...x,replaceMode:true,newFile:null}:x))} style={{ fontSize:'11px', padding:'3px 8px', background:'#EAF1FB', border:'1px solid #A9CBF4', color:'#104f4f', borderRadius:'3px', cursor:'pointer' }}>Replace</button>
                        </div>
                      ) : doc.replaceMode ? (
                        <div style={{ display:'flex', gap:'8px', alignItems:'center', flexWrap:'wrap' }}>
                          <input type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" onChange={e => setDocuments(d => d.map((x,j)=>j===i?{...x,newFile:e.target.files[0]}:x))} style={{ fontSize:'12px' }} />
                          {doc.newFile && <span style={{ fontSize:'11px', color:'#188918', fontWeight:600 }}>✓ {doc.newFile.name}</span>}
                          <button type="button" onClick={() => setDocuments(d => d.map((x,j)=>j===i?{...x,replaceMode:false,newFile:null}:x))} style={{ fontSize:'11px', padding:'3px 8px', background:'#FFEBEB', border:'1px solid #F5B8B8', color:'#BB0000', borderRadius:'3px', cursor:'pointer' }}>Cancel</button>
                        </div>
                      ) : (
                        <input type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" onChange={e => setDocuments(d => d.map((x,j)=>j===i?{...x,newFile:e.target.files[0]}:x))} style={{ fontSize:'12px' }} />
                      )}
                    </div>
                    <button type="button" onClick={() => setDocuments(d => d.filter((_,j)=>j!==i))} style={{ padding:'6px 10px', background:'#FFEBEB', border:'1px solid #F5B8B8', color:'#BB0000', borderRadius:'4px', cursor:'pointer', fontSize:'12px', fontWeight:600 }}>Remove</button>
                  </div>
                ))}
                <button type="button" onClick={() => setDocuments(d => [...d, { name:'', fileName:null, newFile:null, replaceMode:false }])} style={{ padding:'6px 14px', background:'#EAF1FB', border:'1px solid #A9CBF4', color:'#104f4f', borderRadius:'4px', cursor:'pointer', fontSize:'12px', fontWeight:600, fontFamily:'inherit' }}>+ Add Document</button>
              </div>
            </div>
          </div>
        )}

        {/* ══ TAB 5: Banking Details ══ */}
        {activeTab === 'bank' && (
          <div style={css.card}>
            <div style={css.secHead}>Bank Account Information</div>
            <div style={css.g2}>
              <FSelect label="Bank Name" value={form.bankName} onChange={v => set('bankName',v)}
                options={['State Bank of India','HDFC Bank','ICICI Bank','Axis Bank','Punjab National Bank','Bank of Baroda','Canara Bank','Union Bank of India','Kotak Mahindra Bank','IndusInd Bank','Yes Bank','IDBI Bank','Federal Bank','South Indian Bank','UCO Bank','Other']} />
              <FInput label="Account Holder Name" value={form.accountHolder} onChange={v => set('accountHolder',v)} placeholder="As per bank records" />
              <FInput label="Account Number" value={form.accountNo} onChange={v => set('accountNo',v.replace(/\D/,''))} placeholder="Account number" />
              <div>
                <FInput label="IFSC Code" value={form.ifsc} onChange={v => set('ifsc',v)} placeholder="e.g. SBIN0001234" maxLength={11} err={errs.ifsc} upper hint="11-character bank IFSC" />
                {form.ifsc.length===11 && validators.ifsc(form.ifsc) && <div style={{ fontSize:'11px', color:'#188918', marginTop:'3px', fontWeight:600 }}>✓ Valid IFSC</div>}
              </div>
              <FInput label="Branch Name" value={form.branch} onChange={v => set('branch',v)} placeholder="Branch name and city" />
              <FInput label="UPI ID (Optional)" value={form.upi} onChange={v => set('upi',v)} placeholder="name@bank" hint="Optional — for UPI payments" />
            </div>
          </div>
        )}

        {/* ══ TAB 6: Payment & Terms ══ */}
        {activeTab === 'payment' && (
          <div style={css.card}>
            <div style={css.secHead}>Payment Configuration</div>
            <div style={css.g2}>
              <FSelect label="Payment Terms" req value={form.paymentTerms} onChange={v => set('paymentTerms',v)}
                options={['Advance','7 Days','15 Days','30 Days','45 Days','60 Days','90 Days','On Delivery']} />
              <div>
                <label style={css.lbl}>Currency</label>
                <select value={form.currency} onChange={e => set('currency',e.target.value)} style={selStyle(false)}>
                  <option value="INR">INR — Indian Rupee ₹</option>
                  <option value="USD">USD — US Dollar $</option>
                  <option value="EUR">EUR — Euro €</option>
                  <option value="GBP">GBP — British Pound £</option>
                  <option value="AED">AED — UAE Dirham</option>
                </select>
              </div>
              <div>
                <label style={css.lbl}>Credit Limit ({form.currency})</label>
                <div style={{ display:'flex', alignItems:'center', border:'1px solid #BBBCBD', borderRadius:'4px', overflow:'hidden', background:'#FAFAFA' }}>
                  <span style={{ padding:'7px 10px', background:'#EEF3F8', borderRight:'1px solid #E5E5E5', fontSize:'13px', color:'#104f4f', fontWeight:600 }}>₹</span>
                  <input value={form.creditLimit} onChange={e => set('creditLimit',e.target.value.replace(/\D/,''))} placeholder="0" style={{ flex:1, padding:'7px 10px', border:'none', outline:'none', background:'transparent', fontSize:'13px', fontFamily:'inherit' }} />
                </div>
              </div>
            </div>
            <div style={{ marginTop:'18px' }}>
              <label style={css.lbl}>Payment Modes <span style={css.req}>*</span></label>
              <MultiCheck options={['NEFT','RTGS','IMPS','Cheque','Cash','UPI','DD','Credit Card']} selected={form.paymentModes} onChange={v => set('paymentModes',v)} />
              {errs.paymentModes && <div style={css.err}>{errs.paymentModes}</div>}
            </div>
          </div>
        )}

        {/* ══ TAB 7: Additional Details ══ */}
        {activeTab === 'extra' && (
          <div style={css.card}>
            <div style={css.secHead}>Classification & Assignment</div>
            <div style={css.g2}>
              <div>
                <label style={css.lbl}>Client Category</label>
                <div style={{ display:'flex', gap:'8px' }}>
                  {[
                    { val:'Regular',     color:'#104f4f', bg:'#EAF1FB', border:'#A9CBF4' },
                    { val:'VIP',         color:'#E9730C', bg:'#FEF3E2', border:'#F6C244' },
                    { val:'Blacklisted', color:'#BB0000', bg:'#FFEBEB', border:'#F5B8B8' },
                  ].map(opt => (
                    <button key={opt.val} type="button" onClick={() => set('category',opt.val)} style={{ flex:1, padding:'8px', borderRadius:'4px', cursor:'pointer', fontFamily:'inherit', border:`1px solid ${form.category===opt.val?opt.color:'#E5E5E5'}`, background: form.category===opt.val?opt.bg:'#FAFAFA', color: form.category===opt.val?opt.color:'#6A6D70', fontSize:'12px', fontWeight: form.category===opt.val?700:400, transition:'all 0.12s' }}>{opt.val}</button>
                  ))}
                </div>
              </div>
              <FSelect label="Sales Person Assigned" value={form.salesPerson} onChange={v => set('salesPerson',v)} options={SALES_PERSONS} placeholder="— Assign Sales Person —" />
            </div>
            <div style={{ marginTop:'16px' }}>
              <FTextarea label="Remarks / Notes" value={form.remarks} onChange={v => set('remarks',v)} placeholder="Internal notes about this client…" rows={4} />
            </div>

            {/* Quick Review */}
            <div style={{ marginTop:'20px', padding:'14px', background:'#F5F8FC', border:'1px solid #CBE0F5', borderRadius:'4px' }}>
              <div style={{ fontSize:'11px', fontWeight:700, color:'#104f4f', textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:'12px' }}>Quick Review</div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'8px' }}>
                <SummaryCell label="Client Name"   value={form.clientName} />
                <SummaryCell label="Client ID"     value={form.clientCode} />
                <SummaryCell label="Business Type" value={form.businessType} />
                <SummaryCell label="Mobile"        value={form.mobile} />
                <SummaryCell label="GST"           value={form.gst} />
                <SummaryCell label="State"         value={form.state} />
                <SummaryCell label="Pay Terms"     value={form.paymentTerms} />
                <SummaryCell label="Category"      value={form.category} />
                <SummaryCell label="Status"        value={form.status} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Footer Navigation ── */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'12px 20px', background:'#F5F6F7', border:'1px solid #E5E5E5', borderTop:'none', borderRadius:'0 0 6px 6px' }}>
        <div style={{ display:'flex', gap:'5px', alignItems:'center' }}>
          {TABS.map(t => (
            <button key={t.id} type="button" onClick={() => setActiveTab(t.id)} title={t.label} style={{ width:'28px', height:'5px', borderRadius:'3px', border:'none', cursor:'pointer', background: activeTab===t.id?'#104f4f':'#D9D9D9', transition:'background 0.15s' }} />
          ))}
        </div>
        <div style={{ display:'flex', gap:'8px', alignItems:'center' }}>
          <span style={{ fontSize:'12px', color:'#6A6D70' }}>{tabIdx+1} / {TABS.length} — {TABS[tabIdx]?.label}</span>
          {tabIdx > 0 && (
            <button type="button" onClick={() => setActiveTab(TABS[tabIdx-1].id)} style={{ padding:'7px 14px', background:'#fff', border:'1px solid #D9D9D9', color:'#32363A', borderRadius:'4px', cursor:'pointer', fontSize:'13px', fontWeight:600, fontFamily:'inherit' }}>← Prev</button>
          )}
          {tabIdx < TABS.length-1 ? (
            <button type="button" onClick={() => setActiveTab(TABS[tabIdx+1].id)} style={{ padding:'7px 14px', background:'#104f4f', border:'none', color:'white', borderRadius:'4px', cursor:'pointer', fontSize:'13px', fontWeight:600, fontFamily:'inherit' }}>Next →</button>
          ) : (
            <button type="button" onClick={() => handleSave('approved')} disabled={saving} style={{ padding:'7px 20px', background:'#104f4f', border:'none', color:'white', borderRadius:'4px', cursor:'pointer', fontSize:'13px', fontWeight:600, fontFamily:'inherit' }}>
              ✅ Update Client
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default EditClient;
