import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useCompany } from '../../context/CompanyContext';

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

const SALES_PERSONS = ['Rajesh Kumar','Priya Sharma','Amit Singh','Sunita Verma','Mohit Gupta'];

const STATE_GST_MAP = {
  1:'Jammu and Kashmir',2:'Himachal Pradesh',3:'Punjab',4:'Chandigarh',
  5:'Uttarakhand',6:'Haryana',7:'Delhi',8:'Rajasthan',9:'Uttar Pradesh',
  10:'Bihar',11:'Sikkim',12:'Arunachal Pradesh',13:'Nagaland',14:'Manipur',
  15:'Mizoram',16:'Tripura',17:'Meghalaya',18:'Assam',19:'West Bengal',
  20:'Jharkhand',21:'Odisha',22:'Chhattisgarh',23:'Madhya Pradesh',
  24:'Gujarat',26:'Dadra and Nagar Haveli and Daman and Diu',27:'Maharashtra',
  28:'Andhra Pradesh',29:'Karnataka',30:'Goa',31:'Lakshadweep',32:'Kerala',
  33:'Tamil Nadu',34:'Puducherry',35:'Andaman and Nicobar Islands',36:'Telangana',38:'Ladakh',
};

const TABS = [
  { id: 'basic',   label: 'Basic Information',  icon: '👤' },
  { id: 'contact', label: 'Contact Details',     icon: '📞' },
  { id: 'address', label: 'Address Details',     icon: '📍' },
  { id: 'tax',     label: 'Tax & Compliance',    icon: '📋' },
  { id: 'bank',    label: 'Banking Details',     icon: '🏦' },
  { id: 'payment', label: 'Payment & Terms',     icon: '💳' },
  { id: 'extra',   label: 'Additional Details',  icon: '⚙️' },
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
   DESIGN TOKENS
═══════════════════════════════════════════════════ */
const F  = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const P  = '#3A6186';
const PD = '#2A4D6E';
const BD = '#D1D5DB';
const BG = '#F0F2F5';

/* ═══════════════════════════════════════════════════
   INIT STATE
═══════════════════════════════════════════════════ */
const INIT = {
  clientName: '', clientCode: '',
  businessType: '', industryType: '', pan: '', gst: '', cin: '', msme: '',
  contactPerson: '', mobile: '', altMobile: '', email: '', website: '', landline: '',
  billingAddr: '', shippingAddr: '', state: '', city: '', pincode: '', country: 'India',
  gstRegistered: true, gstType: 'Regular', tdsApplicable: false,
  bankName: '', accountHolder: '', accountNo: '', ifsc: '', branch: '', upi: '',
  paymentTerms: '30 Days', creditLimit: '', paymentModes: [], currency: 'INR',
  category: 'Regular', salesPerson: '', remarks: '',
  status: 'pending',
};

/* ── Toast ── */
function Toast({ type, msg, onClose }) {
  React.useEffect(() => { const t = setTimeout(onClose, 5000); return () => clearTimeout(t); }, [onClose]);
  const ok = type === 'success';
  return (
    <div style={{
      position: 'fixed', top: 20, right: 24, zIndex: 9999,
      background: ok ? '#ecfdf5' : '#fef2f2',
      border: `1px solid ${ok ? '#a7f3d0' : '#fecaca'}`,
      borderLeft: `4px solid ${ok ? '#10b981' : '#ef4444'}`,
      borderRadius: 10, padding: '14px 18px', minWidth: 320,
      display: 'flex', alignItems: 'center', gap: 10,
      boxShadow: '0 8px 24px rgba(0,0,0,0.12)', fontFamily: F,
    }}>
      <span style={{ fontSize: 18 }}>{ok ? '✅' : '❌'}</span>
      <span style={{ fontSize: 13, color: ok ? '#065f46' : '#991b1b', fontWeight: 600, flex: 1 }}>{msg}</span>
      <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#94a3b8' }}>×</button>
    </div>
  );
}

/* ── Toggle ── */
function Toggle({ id, checked, onChange }) {
  return (
    <label htmlFor={id} style={{ display: 'inline-flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
      <div style={{ position: 'relative', width: 44, height: 24, background: checked ? P : '#CBD5E1', borderRadius: 12, transition: 'background 0.2s', flexShrink: 0 }}>
        <input id={id} type="checkbox" checked={checked} onChange={onChange} style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }} />
        <div style={{ position: 'absolute', top: 4, left: checked ? 24 : 4, width: 16, height: 16, background: '#fff', borderRadius: '50%', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
      </div>
      <span style={{ fontSize: 13, color: checked ? P : '#94a3b8', fontWeight: checked ? 600 : 400, fontFamily: F }}>{checked ? 'Yes' : 'No'}</span>
    </label>
  );
}

/* ── MultiCheck pills ── */
function MultiCheck({ options, selected, onChange, error }) {
  const toggle = opt => onChange(selected.includes(opt) ? selected.filter(x => x !== opt) : [...selected, opt]);
  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {options.map(opt => {
          const on = selected.includes(opt);
          return (
            <button key={opt} type="button" onClick={() => toggle(opt)} style={{
              padding: '4px 12px', borderRadius: 20, cursor: 'pointer', fontFamily: F,
              border: `1.5px solid ${on ? P : '#D1D5DB'}`,
              background: on ? '#EFF6FF' : '#fff',
              color: on ? P : '#64748b',
              fontSize: 12, fontWeight: on ? 700 : 500, transition: 'all 0.12s',
            }}>{opt}</button>
          );
        })}
      </div>
      {error && <div style={{ fontSize: 11, color: '#EF4444', fontFamily: F, marginTop: 5, fontWeight: 600 }}>{error}</div>}
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   MAIN COMPONENT
═══════════════════════════════════════════════════ */
/* ── Shared layout components — defined at module level so React never remounts them on re-render ── */
const FR = ({ label, children, req, w=150 }) => (
  <div style={{display:'flex',alignItems:'center',minHeight:32,borderBottom:'1px solid #E2E8EF',padding:'2px 0',background:'#fff'}}>
    <label style={{fontSize:11.5,fontWeight:600,color:'#374151',minWidth:w,maxWidth:w,padding:'0 10px',textAlign:'left',flexShrink:0,borderRight:'1px solid #E2E8EF',alignSelf:'stretch',display:'flex',alignItems:'center'}}>
      {label}{req&&<span style={{color:'#DC2626',marginLeft:2}}>*</span>}
    </label>
    <div style={{flex:1,display:'flex',gap:4,alignItems:'center',padding:'2px 8px'}}>{children}</div>
  </div>
);
const PH = ({ title }) => (
  <div style={{background:P,color:'#fff',fontSize:11.5,fontWeight:700,padding:'6px 10px',letterSpacing:0.3,borderBottom:`1px solid ${PD}`}}>
    {title}
  </div>
);
const VCard = ({ children }) => (
  <div style={{border:`1px solid ${BD}`,overflow:'hidden',background:'#fff',boxShadow:'0 1px 4px rgba(0,0,0,0.06)'}}>
    {children}
  </div>
);

export default function ClientMasterDashboard() {
  const { clientId } = useParams();
  const navigate      = useNavigate();
  const { pathname }  = useLocation();
  const isEdit        = !!clientId;

  const { selectedCompany } = useCompany();
  const [tab, setTab]         = useState('basic');
  const [form, setForm]       = useState(INIT);
  const [errs, setErrs]       = useState({});
  const [toast, setToast]     = useState(null);
  const [gstWarn, setGstWarn] = useState('');
  const [idLoading, setIdLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(isEdit);
  const [documents, setDocuments] = useState([{ id: 1, name: '', file: null }]);
  const [importing, setImporting]     = useState(false);
  const [importResult, setImportResult] = useState(null);
  const xlInputRef = useRef(null);

  const downloadSample = async () => {
    try {
      const res = await axios.get('/api/clients/sample-excel', {
        params: { companyId: selectedCompany?.companyId },
        responseType: 'blob',
      });
      const url = URL.createObjectURL(new Blob([res.data], { type: res.headers['content-type'] }));
      const a = document.createElement('a'); a.href = url;
      a.download = 'Client_Import_Template.xlsx';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setToast({ type: 'error', msg: 'Download failed: ' + err.message });
    }
  };

  const handleImportFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    if (!selectedCompany) { setToast({ type: 'error', msg: 'Select a company first.' }); return; }
    const fd = new FormData();
    fd.append('file', file);
    fd.append('companyId', selectedCompany.companyId);
    setImporting(true);
    try {
      const res = await axios.post('/api/clients/import-excel', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setImportResult(res.data);
    } catch (err) {
      setToast({ type: 'error', msg: 'Import failed: ' + (err.response?.data?.error || err.message) });
    } finally { setImporting(false); }
  };

  const fetchNextId = useCallback(async () => {
    if (!selectedCompany || isEdit) return;
    setIdLoading(true);
    try {
      const res = await axios.get(`/api/clients/next-id?companyId=${selectedCompany.companyId}`);
      setForm(f => ({ ...f, clientCode: String(res.data.nextId) }));
    } catch {
      setForm(f => ({ ...f, clientCode: '100001' }));
    } finally { setIdLoading(false); }
  }, [selectedCompany, isEdit]);

  useEffect(() => { fetchNextId(); }, [fetchNextId]);

  /* Load existing client data in edit mode */
  useEffect(() => {
    if (!isEdit) return;
    setLoadingData(true);
    axios.get(`/api/clients/${clientId}?companyId=${selectedCompany?.companyId || ''}`)
      .then(res => {
        const c   = res.data;
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
          status:        c.status        || 'approved',
        }));
        setDocuments(
          (c.documents || []).length > 0
            ? (c.documents).map(d => ({ id: Math.random(), name: d.name || '', file: null, fileName: d.fileName || null }))
            : [{ id: 1, name: '', file: null }]
        );
      })
      .catch(err => setToast({ type: 'error', msg: 'Failed to load client: ' + err.message }))
      .finally(() => setLoadingData(false));
  }, [clientId, isEdit, selectedCompany]);

  const set = (k, v) => {
    setForm(f => ({ ...f, [k]: v }));
    setErrs(e => ({ ...e, [k]: '' }));
    if (k === 'gst' && v.length === 15) {
      const code = parseInt(v.slice(0, 2), 10);
      const pan  = v.slice(2, 12);                      // chars 3-12 of GST = PAN
      const updates = { gst: v };
      if (STATE_GST_MAP[code]) updates.state = STATE_GST_MAP[code];
      if (pan) updates.pan = pan;
      setForm(f => ({ ...f, ...updates }));
      const msgs = [];
      if (STATE_GST_MAP[code]) msgs.push(`State: ${STATE_GST_MAP[code]}`);
      if (pan) msgs.push(`PAN: ${pan}`);
      if (msgs.length) {
        setGstWarn(`Auto-filled — ${msgs.join(', ')}`);
        setTimeout(() => setGstWarn(''), 4000);
      }
    }
  };

  const tabHasErr = (id, e) => ({
    basic:   ['clientName','businessType','pan','gst'],
    contact: ['contactPerson','mobile','altMobile','email'],
    address: ['billingAddr','state','city','pincode'],
    bank:    ['ifsc'],
    payment: ['paymentModes'],
  }[id]?.some(f => e[f]) || false);

  const validateAll = () => {
    const e = {};
    if (!form.clientName.trim())     e.clientName    = 'Client Name is required';
    if (!form.businessType)          e.businessType   = 'Business Type is required';
    if (form.pan && !validators.pan(form.pan))   e.pan  = 'Invalid PAN (e.g. ABCDE1234F)';
    if (form.gst && !validators.gst(form.gst))   e.gst  = 'Invalid GST (15-char format)';
    if (!form.contactPerson.trim())  e.contactPerson  = 'Contact Person is required';
    if (!form.mobile)                e.mobile         = 'Mobile is required';
    else if (!validators.mobile(form.mobile)) e.mobile = 'Invalid mobile (10 digits, starts 6-9)';
    if (form.altMobile && !validators.mobile(form.altMobile)) e.altMobile = 'Invalid mobile number';
    if (form.email && !validators.email(form.email)) e.email = 'Invalid email address';
    if (!form.billingAddr.trim())    e.billingAddr    = 'Billing Address is required';
    if (!form.state)                 e.state          = 'State is required';
    if (!form.city.trim())           e.city           = 'City is required';
    if (form.pincode && !validators.pin(form.pincode)) e.pincode = 'Invalid pincode';
    if (form.ifsc && !validators.ifsc(form.ifsc))    e.ifsc    = 'Invalid IFSC (e.g. SBIN0001234)';
    if (form.paymentModes.length === 0) e.paymentModes = 'Select at least one payment mode';
    setErrs(e);
    return Object.keys(e).length === 0;
  };

  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    const status = form.status || (isEdit ? 'approved' : 'pending');
    if (!validateAll()) {
      const errTab = TABS.find(t => tabHasErr(t.id, errs));
      if (errTab) setTab(errTab.id);
      setToast({ type: 'error', msg: 'Please fix the highlighted errors before saving.' });
      return;
    }
    if (!selectedCompany) {
      setToast({ type: 'error', msg: 'No company selected. Please select a company first.' });
      return;
    }
    setSaving(true);
    try {
      const fd = new FormData();
      const s = (v) => (v === undefined || v === null) ? '' : String(v);
      fd.append('companyId',      s(selectedCompany.companyId));
      fd.append('clientName',     s(form.clientName));
      fd.append('businessType',   s(form.businessType));
      fd.append('industryType',   s(form.industryType));
      fd.append('pan',            s(form.pan));
      fd.append('gst',            s(form.gst));
      fd.append('gstType',        s(form.gstType));
      fd.append('gstRegistered',  s(form.gstRegistered));
      fd.append('cin',            s(form.cin));
      fd.append('msme',           s(form.msme));
      fd.append('tdsApplicable',  s(form.tdsApplicable));
      fd.append('contactPerson',  s(form.contactPerson));
      fd.append('mobile',         s(form.mobile));
      fd.append('altMobile',      s(form.altMobile));
      fd.append('email',          s(form.email));
      fd.append('website',        s(form.website));
      fd.append('landline',       s(form.landline));
      fd.append('billingAddr',    s(form.billingAddr));
      fd.append('shippingAddr',   s(form.shippingAddr));
      fd.append('state',          s(form.state));
      fd.append('city',           s(form.city));
      fd.append('pincode',        s(form.pincode));
      fd.append('country',        s(form.country));
      fd.append('bankName',       s(form.bankName));
      fd.append('accountHolder',  s(form.accountHolder));
      fd.append('accountNo',      s(form.accountNo));
      fd.append('ifsc',           s(form.ifsc));
      fd.append('branch',         s(form.branch));
      fd.append('upi',            s(form.upi));
      fd.append('paymentTerms',   s(form.paymentTerms));
      fd.append('creditLimit',    s(form.creditLimit));
      fd.append('currency',       s(form.currency));
      fd.append('category',       s(form.category));
      fd.append('salesPerson',    s(form.salesPerson));
      fd.append('remarks',        s(form.remarks));
      fd.append('status',         status);
      fd.append('paymentModes',   JSON.stringify(form.paymentModes || []));

      // Document metadata + files
      const docMeta = documents.filter(d => d.name).map(d => ({ name: d.name }));
      fd.append('documentsJson', JSON.stringify(docMeta));
      documents.forEach(doc => { if (doc.file) fd.append('documents', doc.file); });

      if (isEdit) {
        await axios.put(`/api/clients/${clientId}`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
        setToast({ type: 'success', msg: `Client "${form.clientName}" (${clientId}) updated successfully!` });
        setTimeout(() => navigate('/client/view'), 1800);
      } else {
        const res = await axios.post('/api/clients', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
        setToast({ type: 'success', msg: `Client "${form.clientName}" (${res.data.clientId}) saved successfully!` });
        setTimeout(() => handleReset(), 1800);
      }
    } catch (err) {
      setToast({ type: 'error', msg: 'Save failed: ' + (err.response?.data?.error || err.message) });
    } finally { setSaving(false); }
  };

  const handleReset = () => { setForm({ ...INIT }); setErrs({}); setDocuments([{ id: 1, name: '', file: null }]); setTab('basic'); fetchNextId(); };

  const tabIdx = TABS.findIndex(t => t.id === tab);

  /* ── focus / blur helpers ── */
  const onFocus = e => { e.target.style.borderColor = P; };
  const onBlur  = (err) => e => { e.target.style.borderColor = err ? '#EF4444' : '#9CA3AF'; };

  /* ── SO-style input / select styles ── */
  const ri = (err=false) => ({
    height:26, padding:'0 7px', border:`1px solid ${err?'#EF4444':'#C9D0D8'}`, borderRadius:0,
    fontSize:12, fontFamily:F, color:'#111827', background:err?'#FFF5F5':'#fff',
    outline:'none', width:'100%', boxSizing:'border-box',
  });
  const rs = (err=false) => ({
    height:26, padding:'0 7px', border:`1px solid ${err?'#EF4444':'#C9D0D8'}`, borderRadius:0,
    fontSize:12, fontFamily:F, color:'#111827', background:'#fff',
    outline:'none', cursor:'pointer', width:'100%', boxSizing:'border-box',
  });


  if (loadingData) {
    return (
      <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:300, flexDirection:'column', gap:12, fontFamily:F }}>
        <div style={{ width:36, height:36, border:'3px solid #E5E5E5', borderTopColor:P, borderRadius:'50%', animation:'spin 0.8s linear infinite' }} />
        <div style={{ fontSize:13, color:'#64748b' }}>Loading client data…</div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div style={{ fontFamily:F, background:BG, height:'100%', display:'flex', flexDirection:'column', overflow:'hidden' }}>
      <style>{`.csap-input::placeholder{color:#9CA3AF}.csap-search::placeholder{color:rgba(255,255,255,0.45)}`}</style>
      {toast && <Toast type={toast.type} msg={toast.msg} onClose={() => setToast(null)} />}

      {/* ══ CLIENTS nav bar — same as client/view ══ */}
      <div style={{ flexShrink:0, height:40, background:P, borderBottom:`2px solid ${PD}`,
        display:'flex', alignItems:'stretch', overflow:'hidden', fontFamily:F }}>
        <div style={{ display:'flex', alignItems:'center', padding:'0 12px 0 10px',
          fontSize:11, fontWeight:800, color:'#fff', textTransform:'uppercase',
          letterSpacing:'0.8px', whiteSpace:'nowrap',
          borderRight:'2px solid rgba(255,255,255,0.18)', flexShrink:0 }}>
          CLIENTS
        </div>
        <button onClick={() => navigate('/client-sap')}
          style={{ display:'flex', alignItems:'center', padding:'0 14px', height:26, alignSelf:'center',
            fontSize:11.5, fontWeight:700, color:'#fff', background:'#059669',
            border:'none', cursor:'pointer', whiteSpace:'nowrap', flexShrink:0,
            margin:'0 6px', borderRadius:5 }}
          onMouseEnter={e => { e.currentTarget.style.background='#047857'; }}
          onMouseLeave={e => { e.currentTarget.style.background='#059669'; }}>
          + Create Client
        </button>
        {[
          { label:'👥 View Clients', path:'/client/view' },
          { label:'⏳ Pending',      path:'/client/pending' },
        ].map(tab => {
          const isAct = pathname === tab.path;
          return (
            <button key={tab.path} onClick={() => navigate(tab.path)}
              style={{ display:'flex', alignItems:'center', padding:'0 11px', height:'100%',
                fontSize:11.5, fontWeight: isAct ? 700 : 400, border:'none', cursor:'pointer',
                whiteSpace:'nowrap', flexShrink:0, fontFamily:F,
                color: isAct ? '#fff' : 'rgba(255,255,255,0.65)',
                background: isAct ? 'rgba(255,255,255,0.12)' : 'transparent',
                borderBottom: isAct ? '2px solid rgba(255,255,255,0.85)' : '2px solid transparent',
                marginBottom:-2 }}
              onMouseEnter={e => { if (!isAct) e.currentTarget.style.background='rgba(255,255,255,0.08)'; }}
              onMouseLeave={e => { if (!isAct) e.currentTarget.style.background='transparent'; }}>
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* ── Import Result Modal ── */}
      {importResult && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', zIndex:9998, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div style={{ background:'#fff', borderRadius:12, padding:28, maxWidth:560, width:'90%', maxHeight:'80vh', overflowY:'auto', boxShadow:'0 20px 60px rgba(0,0,0,0.25)', fontFamily:F }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
              <h3 style={{ margin:0, fontSize:16, color:'#1E293B' }}>Import Results</h3>
              <button onClick={() => setImportResult(null)} style={{ background:'none', border:'none', fontSize:20, cursor:'pointer', color:'#94a3b8' }}>×</button>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10, marginBottom:16 }}>
              {[
                { l:'Total Rows', v:importResult.total,    c:'#1E293B', bg:'#F1F5F9', bc:'#D1D5DB' },
                { l:'Imported',   v:importResult.imported, c:'#059669', bg:'#ECFDF5', bc:'#A7F3D0' },
                { l:'Failed',     v:importResult.failed,   c:'#DC2626', bg:'#FEF2F2', bc:'#FECACA' },
              ].map(s => (
                <div key={s.l} style={{ padding:'10px 14px', background:s.bg, borderRadius:8, border:`1px solid ${s.bc}`, textAlign:'center' }}>
                  <div style={{ fontSize:24, fontWeight:700, color:s.c }}>{s.v}</div>
                  <div style={{ fontSize:11, color:'#64748b', marginTop:2 }}>{s.l}</div>
                </div>
              ))}
            </div>
            {importResult.imported > 0 && (
              <div style={{ padding:'8px 12px', background:'#ECFDF5', borderRadius:6, marginBottom:12, fontSize:12, color:'#065f46', fontWeight:600 }}>
                ✅ {importResult.imported} client(s) created and sent for approval. Check the <strong>Pending</strong> tab to approve them.
              </div>
            )}
            {importResult.errors?.length > 0 && (
              <div>
                <div style={{ fontSize:12, fontWeight:700, color:'#DC2626', marginBottom:6 }}>Failed Rows:</div>
                <div style={{ maxHeight:200, overflowY:'auto', border:'1px solid #FECACA', borderRadius:6 }}>
                  {importResult.errors.map((e, i) => (
                    <div key={i} style={{ padding:'5px 10px', fontSize:11.5, borderBottom:'1px solid #FEE2E2', color:'#7F1D1D', background: i%2===0?'#FFF5F5':'#FEF2F2' }}>
                      <span style={{ fontWeight:700 }}>Row {e.row}:</span> {e.error}
                    </div>
                  ))}
                </div>
              </div>
            )}
            <button onClick={() => setImportResult(null)} style={{ marginTop:16, width:'100%', padding:'8px 0', background:'#2563EB', color:'#fff', border:'none', borderRadius:6, cursor:'pointer', fontSize:13, fontWeight:700, fontFamily:F }}>Close</button>
          </div>
        </div>
      )}

      {/* ── Excel Import Toolbar (create mode only) ── */}
      {!isEdit && (
        <div style={{ flexShrink:0, background:'#E8EDF4', borderBottom:`1px solid ${BD}`, padding:'4px 10px', display:'flex', alignItems:'center', gap:8 }}>
          <span style={{ fontSize:11, color:PD, fontFamily:F, fontWeight:500, flex:1 }}>
            📊 Bulk import clients from Excel — download the sample template, fill it in, then upload.
          </span>
          <button type="button" onClick={downloadSample} style={{ height:24, padding:'0 12px', borderRadius:0, cursor:'pointer', background:'#fff', border:`1px solid ${BD}`, color:P, fontSize:11, fontWeight:600, fontFamily:F, display:'flex', alignItems:'center', gap:4 }}>
            📥 Download Sample
          </button>
          <button type="button" onClick={() => xlInputRef.current?.click()} disabled={importing} style={{ height:24, padding:'0 12px', borderRadius:0, cursor:importing?'not-allowed':'pointer', background:importing?'#6B8FAF':P, border:'none', color:'#fff', fontSize:11, fontWeight:600, fontFamily:F, display:'flex', alignItems:'center', gap:4, opacity:importing?0.7:1 }}>
            {importing ? '⏳ Importing…' : '📤 Import Excel'}
          </button>
          <input type="file" ref={xlInputRef} accept=".xlsx,.xls" style={{ display:'none' }} onChange={handleImportFile} />
        </div>
      )}

      {/* ── Tab Bar ── */}
      <div style={{ flexShrink:0, background:'#EEF2F7', borderBottom:`2px solid ${BD}`, display:'flex', flexWrap:'nowrap' }}>
        {TABS.map(t => {
          const isActive = tab === t.id;
          const hasErr   = Object.keys(errs).length > 0 && tabHasErr(t.id, errs);
          return (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              display:'flex', alignItems:'center', justifyContent:'center', gap:5,
              flex:1, height:34, padding:'0 6px', cursor:'pointer',
              background: isActive ? '#fff' : 'transparent',
              border:'none', borderBottom: hasErr ? '2px solid #EF4444' : isActive ? `2px solid ${P}` : '2px solid transparent',
              color: hasErr ? '#DC2626' : isActive ? P : '#4B5563',
              fontSize:11, fontWeight: isActive ? 700 : 500, fontFamily:F,
              whiteSpace:'nowrap', transition:'all 0.12s', marginBottom:-2, position:'relative',
            }}
            onMouseEnter={e=>{ if(!isActive){e.currentTarget.style.background='rgba(255,255,255,0.6)';} }}
            onMouseLeave={e=>{ if(!isActive){e.currentTarget.style.background='transparent';} }}>
              {hasErr && <span style={{ position:'absolute', top:4, right:4, width:6, height:6, borderRadius:'50%', background:'#EF4444' }} />}
              <span style={{fontSize:13}}>{t.icon}</span>
              {t.label}
            </button>
          );
        })}
      </div>

      {/* ── Form Body ── */}
      <div style={{ flex:1, overflowY:'auto', padding:'8px', background:BG }}>

        {/* ══ TAB 1: Basic Information ══ */}
        {tab === 'basic' && (
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
            <VCard>
              <PH title="👤  Client Identity"/>
              <FR label="Client Name" req>
                <input style={ri(!!errs.clientName)} value={form.clientName} onChange={e=>set('clientName',e.target.value)} placeholder="e.g. ABC Pvt Ltd" onFocus={onFocus} onBlur={onBlur(errs.clientName)}/>
                {errs.clientName&&<span style={{color:'#DC2626',fontSize:10,whiteSpace:'nowrap'}}>Required</span>}
              </FR>
              <FR label="Client ID">
                <input readOnly value={idLoading?'Loading…':form.clientCode} style={{...ri(),color:P,fontWeight:700,background:'#F8FAFF',width:120}}/>
                <button type="button" onClick={fetchNextId} style={{height:24,width:24,borderRadius:4,border:'1px solid #D1D5DB',background:'#EFF6FF',color:P,cursor:'pointer',fontSize:13,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>↻</button>
              </FR>
              <FR label="Business Type" req>
                <select style={rs(!!errs.businessType)} value={form.businessType} onChange={e=>set('businessType',e.target.value)} onFocus={onFocus} onBlur={onBlur(errs.businessType)}>
                  <option value="">— Select —</option>
                  {['Proprietorship','Partnership','Private Limited','Public Limited','LLP','Government','Individual','Trust / NGO','HUF'].map(o=><option key={o} value={o}>{o}</option>)}
                </select>
              </FR>
              <FR label="Industry Type">
                <select style={rs()} value={form.industryType} onChange={e=>set('industryType',e.target.value)} onFocus={onFocus} onBlur={onBlur()}>
                  <option value="">— Select —</option>
                  {INDUSTRY_TYPES.map(o=><option key={o} value={o}>{o}</option>)}
                </select>
              </FR>
              <FR label="Sales Person">
                <select style={rs()} value={form.salesPerson} onChange={e=>set('salesPerson',e.target.value)} onFocus={onFocus} onBlur={onBlur()}>
                  <option value="">— Assign —</option>
                  {SALES_PERSONS.map(o=><option key={o} value={o}>{o}</option>)}
                </select>
              </FR>
              <FR label="Category">
                <div style={{display:'flex',gap:6}}>
                  {[{v:'Regular',c:'#2563EB',bg:'#EFF6FF'},{v:'VIP',c:'#D97706',bg:'#FEF3C7'},{v:'Blacklisted',c:'#DC2626',bg:'#FEF2F2'}].map(o=>(
                    <button key={o.v} type="button" onClick={()=>set('category',o.v)} style={{
                      padding:'2px 10px',borderRadius:4,border:`1px solid ${form.category===o.v?o.c:'#D1D5DB'}`,
                      background:form.category===o.v?o.bg:'#fff',color:form.category===o.v?o.c:'#6B7280',
                      fontSize:11,fontWeight:form.category===o.v?700:400,cursor:'pointer',fontFamily:F
                    }}>{o.v}</button>
                  ))}
                </div>
              </FR>
            </VCard>

            <VCard>
              <PH title="📋  Tax Identity"/>
              <FR label="PAN Number">
                <input style={ri(!!errs.pan)} value={form.pan} maxLength={10} onChange={e=>set('pan',e.target.value.toUpperCase())} placeholder="ABCDE1234F" onFocus={onFocus} onBlur={onBlur(errs.pan)}/>
              </FR>
              <FR label="GST Number">
                <div style={{flex:1}}>
                  <input style={ri(!!errs.gst)} value={form.gst} maxLength={15} onChange={e=>set('gst',e.target.value.toUpperCase())} placeholder="22AAAAA0000A1Z5" onFocus={onFocus} onBlur={onBlur(errs.gst)}/>
                  {gstWarn&&<div style={{fontSize:10,color:'#10b981',fontWeight:600,fontFamily:F,marginTop:2}}>✓ {gstWarn}</div>}
                </div>
              </FR>
              <FR label="CIN Number">
                <input style={ri()} value={form.cin} onChange={e=>set('cin',e.target.value.toUpperCase())} placeholder="U74999MH2020PTC123456" onFocus={onFocus} onBlur={onBlur()}/>
              </FR>
              <FR label="MSME / Udyam">
                <input style={ri()} value={form.msme} onChange={e=>set('msme',e.target.value.toUpperCase())} placeholder="UDYAM-XX-00-0000000" onFocus={onFocus} onBlur={onBlur()}/>
              </FR>
              <FR label="GST Type">
                <div style={{display:'flex',gap:5,flexWrap:'wrap'}}>
                  {['Regular','Composition','Unregistered','SEZ'].map(t=>(
                    <button key={t} type="button" onClick={()=>set('gstType',t)} style={{
                      padding:'2px 8px',borderRadius:4,border:`1px solid ${form.gstType===t?P:'#D1D5DB'}`,
                      background:form.gstType===t?'#DBEAFE':'#fff',color:form.gstType===t?P:'#6B7280',
                      fontSize:11,fontWeight:form.gstType===t?700:400,cursor:'pointer',fontFamily:F
                    }}>{t}</button>
                  ))}
                </div>
              </FR>
              <FR label="GST Registered">
                <Toggle id="gstReg" checked={form.gstRegistered} onChange={e=>set('gstRegistered',e.target.checked)}/>
              </FR>
              <FR label="TDS Applicable">
                <Toggle id="tds" checked={form.tdsApplicable} onChange={e=>set('tdsApplicable',e.target.checked)}/>
              </FR>
            </VCard>
          </div>
        )}

        {/* ══ TAB 2: Contact Details ══ */}
        {tab === 'contact' && (
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
            <VCard>
              <PH title="📞  Contact Person"/>
              <FR label="Contact Person" req>
                <input style={ri(!!errs.contactPerson)} value={form.contactPerson} onChange={e=>set('contactPerson',e.target.value)} placeholder="Full name" onFocus={onFocus} onBlur={onBlur(errs.contactPerson)}/>
                {errs.contactPerson&&<span style={{color:'#DC2626',fontSize:10,whiteSpace:'nowrap'}}>Required</span>}
              </FR>
              <FR label="Mobile Number" req>
                <input style={ri(!!errs.mobile)} value={form.mobile} maxLength={10} onChange={e=>set('mobile',e.target.value.replace(/\D/,''))} placeholder="10-digit mobile" onFocus={onFocus} onBlur={onBlur(errs.mobile)}/>
                {errs.mobile&&<span style={{color:'#DC2626',fontSize:10,whiteSpace:'nowrap'}}>Required</span>}
              </FR>
              <FR label="Alternate Mobile">
                <input style={ri(!!errs.altMobile)} value={form.altMobile} maxLength={10} onChange={e=>set('altMobile',e.target.value.replace(/\D/,''))} placeholder="Alternate number" onFocus={onFocus} onBlur={onBlur(errs.altMobile)}/>
              </FR>
            </VCard>
            <VCard>
              <PH title="📡  Communication"/>
              <FR label="Email ID">
                <input type="email" style={ri(!!errs.email)} value={form.email} onChange={e=>set('email',e.target.value)} placeholder="contact@company.com" onFocus={onFocus} onBlur={onBlur(errs.email)}/>
              </FR>
              <FR label="Landline Number">
                <input style={ri()} value={form.landline} onChange={e=>set('landline',e.target.value)} placeholder="STD + Number" onFocus={onFocus} onBlur={onBlur()}/>
              </FR>
              <FR label="Website">
                <input style={ri()} value={form.website} onChange={e=>set('website',e.target.value)} placeholder="https://www.company.com" onFocus={onFocus} onBlur={onBlur()}/>
              </FR>
            </VCard>
          </div>
        )}

        {/* ══ TAB 3: Address Details ══ */}
        {tab === 'address' && (
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
            <VCard>
              <PH title="🏠  Billing Address"/>
              <div style={{display:'flex',alignItems:'flex-start',borderBottom:'1px solid #CBD5E1',padding:'4px 6px',background:'#fff',minHeight:64}}>
                <label style={{fontSize:11.5,fontWeight:700,color:'#000',minWidth:140,maxWidth:140,padding:'2px 8px 0 0',textAlign:'left',flexShrink:0}}>Address <span style={{color:'#DC2626'}}>*</span></label>
                <textarea value={form.billingAddr} onChange={e=>set('billingAddr',e.target.value)} rows={3} placeholder="Door no, Street, Area, District…"
                  style={{flex:1,padding:'2px 6px',border:'none',outline:'none',fontSize:12,fontFamily:F,color:'#111827',resize:'vertical',background:'transparent',boxSizing:'border-box',minHeight:60}}/>
              </div>
              <FR label="State" req>
                <select style={rs(!!errs.state)} value={form.state} onChange={e=>set('state',e.target.value)} onFocus={onFocus} onBlur={onBlur(errs.state)}>
                  <option value="">— Select State —</option>
                  {STATES.map(s=><option key={s} value={s}>{s}</option>)}
                </select>
              </FR>
              <FR label="City" req>
                <input style={ri(!!errs.city)} value={form.city} onChange={e=>set('city',e.target.value)} placeholder="City" onFocus={onFocus} onBlur={onBlur(errs.city)}/>
              </FR>
              <FR label="Pincode">
                <input style={ri(!!errs.pincode)} value={form.pincode} maxLength={6} onChange={e=>set('pincode',e.target.value.replace(/\D/,''))} placeholder="6-digit pincode" onFocus={onFocus} onBlur={onBlur(errs.pincode)}/>
              </FR>
              <FR label="Country">
                <input style={ri()} value={form.country} onChange={e=>set('country',e.target.value)} onFocus={onFocus} onBlur={onBlur()}/>
              </FR>
            </VCard>
            <VCard>
              <div style={{background:'#F1F5F9',color:'#1E293B',fontSize:12,fontWeight:700,padding:'6px 12px',letterSpacing:0.2,borderBottom:'1px solid #D1D5DB',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                <span>🚚  Shipping Address</span>
                <button type="button" onClick={()=>set('shippingAddr',form.billingAddr)} style={{padding:'2px 10px',borderRadius:4,border:'1px solid #D1D5DB',background:'#EFF6FF',color:P,cursor:'pointer',fontSize:11,fontWeight:600,fontFamily:F}}>📋 Copy Billing</button>
              </div>
              <div style={{padding:'8px 6px',background:'#fff'}}>
                <textarea value={form.shippingAddr} onChange={e=>set('shippingAddr',e.target.value)} rows={8} placeholder="Leave blank if same as billing address…"
                  style={{width:'100%',padding:'6px 8px',border:'1px solid #9CA3AF',outline:'none',fontSize:12,fontFamily:F,color:'#111827',resize:'vertical',background:'#fff',boxSizing:'border-box',borderRadius:4,minHeight:160}}
                  onFocus={e=>e.target.style.borderColor=P} onBlur={e=>e.target.style.borderColor='#9CA3AF'}/>
              </div>
            </VCard>
          </div>
        )}

        {/* ══ TAB 4: Tax & Compliance ══ */}
        {tab === 'tax' && (
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
            <VCard>
              <PH title="📋  GST & Compliance"/>
              <FR label="GST Registered">
                <Toggle id="gstReg2" checked={form.gstRegistered} onChange={e=>set('gstRegistered',e.target.checked)}/>
              </FR>
              <FR label="GST Type">
                <div style={{display:'flex',gap:5,flexWrap:'wrap'}}>
                  {['Regular','Composition','Unregistered','Consumer','SEZ'].map(t=>(
                    <button key={t} type="button" onClick={()=>set('gstType',t)} style={{
                      padding:'2px 8px',borderRadius:4,border:`1px solid ${form.gstType===t?P:'#D1D5DB'}`,
                      background:form.gstType===t?'#DBEAFE':'#fff',color:form.gstType===t?P:'#6B7280',
                      fontSize:11,fontWeight:form.gstType===t?700:400,cursor:'pointer',fontFamily:F
                    }}>{t}</button>
                  ))}
                </div>
              </FR>
              <FR label="TDS Applicable">
                <Toggle id="tds2" checked={form.tdsApplicable} onChange={e=>set('tdsApplicable',e.target.checked)}/>
              </FR>
            </VCard>
            <VCard>
              <PH title="📎  Document Uploads"/>
              <div style={{padding:'8px 10px',display:'flex',flexDirection:'column',gap:8}}>
                {documents.map((doc,idx)=>(
                  <div key={doc.id} style={{display:'flex',alignItems:'center',gap:8,padding:'6px 10px',borderRadius:6,background:'#EFF6FF',border:'1px solid #D1D5DB'}}>
                    <span style={{fontSize:11,fontWeight:700,color:'#94a3b8',width:18}}>{idx+1}.</span>
                    <input value={doc.name} placeholder="Document name" onChange={e=>setDocuments(d=>d.map(x=>x.id===doc.id?{...x,name:e.target.value}:x))}
                      style={{...ri(),flex:1,height:26}}/>
                    <input type="file" onChange={e=>setDocuments(d=>d.map(x=>x.id===doc.id?{...x,file:e.target.files[0]}:x))}
                      style={{fontSize:10,fontFamily:F,flex:1}} accept=".pdf,.jpg,.png,.doc,.docx"/>
                    {documents.length>1&&(
                      <button type="button" onClick={()=>setDocuments(d=>d.filter(x=>x.id!==doc.id))}
                        style={{padding:'2px 8px',background:'#fef2f2',border:'1px solid #fecaca',color:'#dc2626',borderRadius:4,cursor:'pointer',fontSize:11,fontFamily:F}}>✕</button>
                    )}
                  </div>
                ))}
                <button type="button" onClick={()=>setDocuments(d=>[...d,{id:Math.max(...d.map(x=>x.id))+1,name:'',file:null}])}
                  style={{padding:'6px',borderRadius:6,cursor:'pointer',background:'#faf5ff',border:'2px dashed #ddd6fe',color:'#7c3aed',fontSize:11,fontWeight:600,fontFamily:F,display:'flex',alignItems:'center',justifyContent:'center',gap:4}}>+ Add Document</button>
              </div>
            </VCard>
          </div>
        )}

        {/* ══ TAB 5: Banking Details ══ */}
        {tab === 'bank' && (
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
            <VCard>
              <PH title="🏦  Bank Account"/>
              <FR label="Bank Name">
                <select style={rs()} value={form.bankName} onChange={e=>set('bankName',e.target.value)} onFocus={onFocus} onBlur={onBlur()}>
                  <option value="">— Select Bank —</option>
                  {['State Bank of India','HDFC Bank','ICICI Bank','Axis Bank','Punjab National Bank','Bank of Baroda','Canara Bank','Union Bank of India','Kotak Mahindra Bank','IndusInd Bank','Yes Bank','IDBI Bank','Federal Bank','South Indian Bank','Other'].map(o=><option key={o} value={o}>{o}</option>)}
                </select>
              </FR>
              <FR label="Account Holder">
                <input style={ri()} value={form.accountHolder} onChange={e=>set('accountHolder',e.target.value)} placeholder="As per bank records" onFocus={onFocus} onBlur={onBlur()}/>
              </FR>
              <FR label="Account Number">
                <input style={ri()} value={form.accountNo} onChange={e=>set('accountNo',e.target.value.replace(/\D/,''))} placeholder="Account number" onFocus={onFocus} onBlur={onBlur()}/>
              </FR>
              <FR label="IFSC Code">
                <div style={{flex:1}}>
                  <input style={ri(!!errs.ifsc)} value={form.ifsc} maxLength={11} onChange={e=>set('ifsc',e.target.value.toUpperCase())} placeholder="e.g. SBIN0001234" onFocus={onFocus} onBlur={onBlur(errs.ifsc)}/>
                  {form.ifsc.length===11&&validators.ifsc(form.ifsc)&&<div style={{fontSize:10,color:'#10b981',fontWeight:600,fontFamily:F,marginTop:2}}>✓ Valid IFSC</div>}
                </div>
              </FR>
            </VCard>
            <VCard>
              <PH title="📋  Branch & UPI"/>
              <FR label="Branch Name">
                <input style={ri()} value={form.branch} onChange={e=>set('branch',e.target.value)} placeholder="Branch name and city" onFocus={onFocus} onBlur={onBlur()}/>
              </FR>
              <FR label="UPI ID">
                <input style={ri()} value={form.upi} onChange={e=>set('upi',e.target.value)} placeholder="name@bank" onFocus={onFocus} onBlur={onBlur()}/>
              </FR>
              <div style={{margin:'8px 10px',padding:'8px 12px',background:'#fffbeb',border:'1px solid #fde68a',borderLeft:'4px solid #f59e0b',borderRadius:6,fontSize:11,color:'#92400e',display:'flex',gap:6,fontFamily:F}}>
                <span>⚠️</span><span>Verify all bank details carefully before saving. Errors may delay client payments.</span>
              </div>
            </VCard>
          </div>
        )}

        {/* ══ TAB 6: Payment & Terms ══ */}
        {tab === 'payment' && (
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
            <VCard>
              <PH title="💳  Payment Terms"/>
              <FR label="Payment Terms">
                <select style={rs()} value={form.paymentTerms} onChange={e=>set('paymentTerms',e.target.value)} onFocus={onFocus} onBlur={onBlur()}>
                  {['Advance','7 Days','15 Days','30 Days','45 Days','60 Days','90 Days','On Delivery'].map(o=><option key={o} value={o}>{o}</option>)}
                </select>
              </FR>
              <FR label="Currency">
                <select style={rs()} value={form.currency} onChange={e=>set('currency',e.target.value)} onFocus={onFocus} onBlur={onBlur()}>
                  {['INR','USD','EUR','GBP','AED'].map(o=><option key={o} value={o}>{o}</option>)}
                </select>
              </FR>
              <FR label={`Credit Limit (${form.currency})`}>
                <input style={ri()} value={form.creditLimit} onChange={e=>set('creditLimit',e.target.value.replace(/\D/,''))} placeholder="0" onFocus={onFocus} onBlur={onBlur()}/>
              </FR>
            </VCard>
            <VCard>
              <PH title="💰  Payment Modes"/>
              <div style={{padding:'8px 12px'}}>
                <MultiCheck options={['NEFT','RTGS','IMPS','Cheque','Cash','UPI','DD','Credit Card']} selected={form.paymentModes} onChange={v=>set('paymentModes',v)} error={errs.paymentModes}/>
              </div>
              {(form.paymentTerms||form.creditLimit)&&(
                <div style={{margin:'0 10px 10px',display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8}}>
                  {[{l:'Terms',v:form.paymentTerms},{l:'Credit Limit',v:form.creditLimit?`₹ ${Number(form.creditLimit).toFixed(2)}`:''},{l:'Currency',v:form.currency}].map(c=>(
                    <div key={c.l} style={{padding:'6px 10px',background:'#EFF6FF',borderRadius:6,border:'1px solid #D1D5DB'}}>
                      <div style={{fontSize:10,fontWeight:700,color:P,textTransform:'uppercase',letterSpacing:'0.5px',marginBottom:2,fontFamily:F}}>{c.l}</div>
                      <div style={{fontSize:12,color:'#1e293b',fontWeight:600,fontFamily:F}}>{c.v||'—'}</div>
                    </div>
                  ))}
                </div>
              )}
            </VCard>
          </div>
        )}

        {/* ══ TAB 7: Additional Details ══ */}
        {tab === 'extra' && (
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
            <VCard>
              <PH title="⚙️  Classification"/>
              <FR label="Client Category">
                <div style={{display:'flex',gap:6}}>
                  {[{v:'Regular',c:'#2563EB',bg:'#EFF6FF'},{v:'VIP',c:'#D97706',bg:'#FEF3C7'},{v:'Blacklisted',c:'#DC2626',bg:'#FEF2F2'}].map(o=>(
                    <button key={o.v} type="button" onClick={()=>set('category',o.v)} style={{
                      padding:'2px 10px',borderRadius:4,border:`1px solid ${form.category===o.v?o.c:'#D1D5DB'}`,
                      background:form.category===o.v?o.bg:'#fff',color:form.category===o.v?o.c:'#6B7280',
                      fontSize:11,fontWeight:form.category===o.v?700:400,cursor:'pointer',fontFamily:F
                    }}>{o.v}</button>
                  ))}
                </div>
              </FR>
              {form.category==='Blacklisted'&&<div style={{padding:'4px 12px',fontSize:11,color:'#dc2626',fontWeight:600,fontFamily:F,background:'#FEF2F2'}}>⚠️ Blacklisted clients will be blocked from sales transactions.</div>}
              <FR label="Sales Person">
                <select style={rs()} value={form.salesPerson} onChange={e=>set('salesPerson',e.target.value)} onFocus={onFocus} onBlur={onBlur()}>
                  <option value="">— Assign —</option>
                  {SALES_PERSONS.map(o=><option key={o} value={o}>{o}</option>)}
                </select>
              </FR>
              <div style={{display:'flex',alignItems:'flex-start',borderBottom:'1px solid #CBD5E1',padding:'4px 6px',background:'#fff',minHeight:64}}>
                <label style={{fontSize:11.5,fontWeight:700,color:'#000',minWidth:140,maxWidth:140,padding:'2px 8px 0 0',textAlign:'left',flexShrink:0}}>Remarks</label>
                <textarea value={form.remarks} onChange={e=>set('remarks',e.target.value)} rows={3} placeholder="Internal notes about this client…"
                  style={{flex:1,padding:'2px 6px',border:'none',outline:'none',fontSize:12,fontFamily:F,color:'#111827',resize:'vertical',background:'transparent',boxSizing:'border-box',minHeight:60}}/>
              </div>
            </VCard>
            <VCard>
              <PH title="👁️  Quick Review"/>
              <div style={{padding:'8px 10px',display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8}}>
                {[{l:'Client Name',v:form.clientName},{l:'Client Code',v:form.clientCode},{l:'Business',v:form.businessType},{l:'Mobile',v:form.mobile},{l:'GST',v:form.gst},{l:'State',v:form.state},{l:'Pay Terms',v:form.paymentTerms},{l:'Category',v:form.category},{l:'Sales Person',v:form.salesPerson}].map(c=>(
                  <div key={c.l} style={{padding:'6px 10px',background:'#EFF6FF',borderRadius:6,border:'1px solid #D1D5DB'}}>
                    <div style={{fontSize:10,fontWeight:700,color:P,textTransform:'uppercase',letterSpacing:'0.5px',marginBottom:2,fontFamily:F}}>{c.l}</div>
                    <div style={{fontSize:12,color:'#1e293b',fontWeight:600,fontFamily:F,wordBreak:'break-all'}}>{c.v||'—'}</div>
                  </div>
                ))}
              </div>
            </VCard>
          </div>
        )}
      </div>

      {/* ── Footer ── */}
      <div style={{
        flexShrink:0, padding:'7px 16px', background:PD, borderTop:`1px solid ${P}`,
        display:'flex', alignItems:'center', justifyContent:'space-between',
      }}>
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          <span style={{fontSize:11,color:'rgba(255,255,255,0.65)',fontFamily:F}}>
            Step {tabIdx+1} of {TABS.length} — <strong style={{color:'#fff'}}>{TABS[tabIdx]?.label}</strong>
          </span>
          {tabIdx>0&&(
            <button type="button" onClick={()=>setTab(TABS[tabIdx-1].id)} style={{height:28,padding:'0 12px',borderRadius:0,cursor:'pointer',background:'rgba(255,255,255,0.12)',border:'1px solid rgba(255,255,255,0.25)',color:'#fff',fontSize:11.5,fontWeight:600,fontFamily:F}}>◀ Back</button>
          )}
          {tabIdx<TABS.length-1&&(
            <button type="button" onClick={()=>setTab(TABS[tabIdx+1].id)} style={{height:28,padding:'0 14px',borderRadius:0,cursor:'pointer',background:'rgba(255,255,255,0.9)',border:'none',color:P,fontSize:11.5,fontWeight:700,fontFamily:F}}>Next ▶</button>
          )}
        </div>
        <div style={{display:'flex',gap:8}}>
          {isEdit
            ? <button type="button" onClick={() => navigate('/client/view')} style={{height:28,padding:'0 14px',borderRadius:0,cursor:'pointer',background:'rgba(255,255,255,0.1)',border:'1px solid rgba(255,255,255,0.25)',color:'rgba(255,255,255,0.8)',fontSize:11.5,fontWeight:600,fontFamily:F}}>← Back to List</button>
            : <button type="button" onClick={handleReset} style={{height:28,padding:'0 14px',borderRadius:0,cursor:'pointer',background:'rgba(255,255,255,0.1)',border:'1px solid rgba(255,255,255,0.25)',color:'rgba(255,255,255,0.8)',fontSize:11.5,fontWeight:600,fontFamily:F}}>Reset</button>
          }
          {!isEdit && <button type="button" onClick={()=>setToast({type:'success',msg:'Draft saved!'})} style={{height:28,padding:'0 16px',borderRadius:0,cursor:'pointer',background:'#F59E0B',border:'none',color:'#fff',fontSize:11.5,fontWeight:700,fontFamily:F}}>💾 Save Draft</button>}
          <button type="button" onClick={handleSave} disabled={saving} style={{height:28,padding:'0 18px',borderRadius:0,cursor:saving?'not-allowed':'pointer',background:saving?'rgba(255,255,255,0.4)':'rgba(255,255,255,0.95)',border:'none',color:saving?'#fff':P,fontSize:11.5,fontWeight:700,fontFamily:F,opacity:saving?0.7:1}}>{saving?'⏳ Saving…': isEdit ? '✅ Update Client' : '✅ Save Client'}</button>
        </div>
      </div>
    </div>
  );
}
