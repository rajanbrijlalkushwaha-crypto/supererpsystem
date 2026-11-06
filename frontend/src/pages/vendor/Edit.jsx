import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useCompany } from '../../context/CompanyContext';
import { useStaffNames } from '../../hooks/useStaffNames';

/* ═══════════════════════════════════════════════════
   CONSTANTS (identical to Create)
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
  { id: 'basic',   label: 'Basic Information' },
  { id: 'contact', label: 'Contact Details' },
  { id: 'address', label: 'Address Details' },
  { id: 'tax',     label: 'Tax & Compliance' },
  { id: 'bank',    label: 'Banking Details' },
  { id: 'payment', label: 'Payment & Terms' },
  { id: 'extra',   label: 'Additional Details' },
];

const validators = {
  pan:    v => /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(v),
  gst:    v => /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(v),
  mobile: v => /^[6-9]\d{9}$/.test(v),
  email:  v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
  pin:    v => /^[1-9][0-9]{5}$/.test(v),
  ifsc:   v => /^[A-Z]{4}0[A-Z0-9]{6}$/.test(v),
};

/* ═══════════════════════════════════════════════════
   STYLES (identical to Create)
═══════════════════════════════════════════════════ */
const F      = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const HDR    = '#133d80';
const BD     = '#E5EAF2';
const TAB_BG = '#F5F7FB';

const css = {
  card: {
    background: '#fff', border: `1px solid ${BD}`, borderRadius: 10,
    padding: 0, marginBottom: '10px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', overflow: 'hidden',
  },
  secHead: {
    fontSize: '11px', fontWeight: 700, color: '#fff', textTransform: 'uppercase',
    letterSpacing: '0.7px', background: HDR, padding: '6px 14px', margin: 0,
  },
  fr:  { display: 'flex', alignItems: 'center', minHeight: 28, borderBottom: `1px solid #EEF0F2`, padding: '3px 10px 3px 4px', gap: 0 },
  lbl: { fontSize: 12, fontWeight: 700, color: '#2D3748', fontFamily: F, minWidth: 150, maxWidth: 150, textAlign: 'right', paddingRight: 12, flexShrink: 0 },
  req: { color: '#C53030', marginLeft: 2 },
  err: { fontSize: 10, color: '#C53030', marginTop: 2, fontWeight: 600, fontFamily: F },
  hint:{ fontSize: 10, color: '#718096', marginTop: 2, fontFamily: F },
  g2:  { display: 'block' },
  g3:  { display: 'block' },
};

const inpStyle = (err) => ({
  height: 32, padding: '0 10px',
  border: `1px solid ${err ? '#EF4444' : BD}`,
  borderRadius: 6, fontSize: 12, fontFamily: F,
  color: '#111827', background: '#fff', outline: 'none',
  width: '100%', boxSizing: 'border-box', transition: 'border-color 0.15s',
});
const selStyle = (err) => ({
  height: 32, padding: '0 10px',
  border: `1px solid ${err ? '#EF4444' : BD}`,
  borderRadius: 6, fontSize: 12, fontFamily: F,
  color: '#111827', background: '#fff', outline: 'none',
  width: '100%', boxSizing: 'border-box', cursor: 'pointer', transition: 'border-color 0.15s',
});

/* ═══════════════════════════════════════════════════
   ATOMS (identical to Create)
═══════════════════════════════════════════════════ */
function FInput({ label, req, value, onChange, placeholder, err, hint, type='text', maxLength, upper, style, readOnly }) {
  return (
    <div style={{ ...css.fr, ...style }}>
      <label style={css.lbl}>{label}{req && <span style={css.req}>*</span>}</label>
      <div style={{ flex: 1 }}>
        <input type={type} value={value} maxLength={maxLength} placeholder={placeholder} readOnly={readOnly}
          onChange={e => onChange && onChange(upper ? e.target.value.toUpperCase() : e.target.value)}
          style={{ ...inpStyle(err), background: readOnly ? '#f0f0f0' : '#fff' }}
        />
        {err   && <div style={css.err}>{err}</div>}
        {!err && hint && <div style={css.hint}>{hint}</div>}
      </div>
    </div>
  );
}

function FSelect({ label, req, value, onChange, options, err, placeholder='— Select —', style }) {
  return (
    <div style={{ ...css.fr, ...style }}>
      <label style={css.lbl}>{label}{req && <span style={css.req}>*</span>}</label>
      <div style={{ flex: 1 }}>
        <select value={value} onChange={e => onChange(e.target.value)} style={selStyle(err)}>
          <option value="">{placeholder}</option>
          {options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
        {err && <div style={css.err}>{err}</div>}
      </div>
    </div>
  );
}

function FTextarea({ label, req, value, onChange, placeholder, rows=3, err }) {
  return (
    <div style={{ ...css.fr, alignItems: 'flex-start', padding: '4px' }}>
      <label style={{ ...css.lbl, paddingTop: 2 }}>{label}{req && <span style={css.req}>*</span>}</label>
      <div style={{ flex: 1 }}>
        <textarea value={value} rows={rows} placeholder={placeholder} onChange={e => onChange(e.target.value)}
          style={{ width: '100%', padding: '6px 10px', border: `1px solid ${err ? '#EF4444' : BD}`,
            borderRadius: 6, fontSize: 12, fontFamily: F, color: '#111827', background: '#fff',
            outline: 'none', resize: 'vertical', boxSizing: 'border-box' }}
        />
        {err && <div style={css.err}>{err}</div>}
      </div>
    </div>
  );
}

function Toggle({ id, checked, onChange }) {
  return (
    <label htmlFor={id} style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
      <div style={{ position: 'relative', width: '42px', height: '22px', background: checked ? '#0070F2' : '#BBBCBD', borderRadius: '11px', transition: 'background 0.2s', flexShrink: 0 }}>
        <input id={id} type="checkbox" checked={checked} onChange={onChange} style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }} />
        <div style={{ position: 'absolute', top: '3px', left: checked ? '22px' : '3px', width: '16px', height: '16px', background: 'white', borderRadius: '50%', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
      </div>
      <span style={{ fontSize: '13px', color: checked ? '#0070F2' : '#6A6D70', fontWeight: checked ? 600 : 400 }}>{checked ? 'Yes' : 'No'}</span>
    </label>
  );
}

function MultiCheck({ options, selected, onChange }) {
  const toggle = opt => onChange(selected.includes(opt) ? selected.filter(x => x !== opt) : [...selected, opt]);
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
      {options.map(opt => {
        const on = selected.includes(opt);
        return (
          <button key={opt} type="button" onClick={() => toggle(opt)} style={{
            padding: '5px 14px', borderRadius: '16px',
            border: `1px solid ${on ? '#0070F2' : '#D9D9D9'}`,
            background: on ? '#EAF1FB' : '#FAFAFA',
            color: on ? '#0070F2' : '#6A6D70',
            fontSize: '12px', fontWeight: on ? 600 : 400,
            cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.12s',
          }}>{opt}</button>
        );
      })}
    </div>
  );
}

function Toast({ type, msg, onClose }) {
  useEffect(() => { const t = setTimeout(onClose, 5000); return () => clearTimeout(t); }, [onClose]);
  const ok = type === 'success';
  return (
    <div style={{
      position: 'fixed', top: '20px', right: '24px', zIndex: 9999,
      background: ok ? '#E8F5E9' : '#FFEBEB',
      border: `1px solid ${ok ? '#82C98A' : '#F5B8B8'}`,
      borderLeft: `4px solid ${ok ? '#188918' : '#BB0000'}`,
      borderRadius: '6px', padding: '14px 18px', minWidth: '320px',
      display: 'flex', alignItems: 'center', gap: '10px',
      boxShadow: '0 4px 20px rgba(0,0,0,0.14)',
    }}>
      <span style={{ fontSize: '18px' }}>{ok ? '✅' : '❌'}</span>
      <span style={{ fontSize: '13px', color: ok ? '#0A6640' : '#BB0000', fontWeight: 600, flex: 1 }}>{msg}</span>
      <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6A6D70', fontSize: '18px' }}>×</button>
    </div>
  );
}

function SummaryCell({ label, value }) {
  return (
    <div style={{ padding: '8px 10px', background: '#fff', borderRadius: '4px', border: '1px solid #E5E5E5' }}>
      <div style={{ fontSize: '10px', fontWeight: 700, color: '#6A6D70', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '3px' }}>{label}</div>
      <div style={{ fontSize: '13px', color: '#32363A', fontWeight: 500, wordBreak: 'break-all' }}>{value || '—'}</div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   MAIN COMPONENT
═══════════════════════════════════════════════════ */
const EditVendor = () => {
  const { vendorId }        = useParams();
  const navigate            = useNavigate();
  const { selectedCompany } = useCompany();
  const PURCHASE_PERSONS = useStaffNames();

  const [activeTab, setActiveTab] = useState('basic');
  const [loading,   setLoading]   = useState(true);
  const [saving,    setSaving]    = useState(false);
  const [toast,     setToast]     = useState(null);
  const [errs,      setErrs]      = useState({});
  const [gstWarn,   setGstWarn]   = useState('');
  const [documents, setDocuments] = useState([]);

  const [form, setForm] = useState({
    vendorCode: '', vendorName: '', businessType: '', industryType: '',
    pan: '', gst: '', cin: '', msme: '',
    contactPerson: '', mobile: '', altMobile: '', email: '', website: '', landline: '',
    billingAddr: '', shippingAddr: '', state: '', city: '', pincode: '', country: 'India',
    gstRegistered: true, gstType: 'Regular', tdsApplicable: false,
    bankName: '', accountHolder: '', accountNo: '', ifsc: '', branch: '', upi: '',
    paymentTerms: '30 Days', creditLimit: '', paymentModes: [], currency: 'INR',
    category: 'Regular', purchasePerson: '', remarks: '', status: 'draft',
  });

  /* ── Load existing vendor data ── */
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const params = selectedCompany?.companyId ? { companyId: selectedCompany.companyId } : {};
        const res = await axios.get(`/api/vendors/${vendorId}`, { params });
        const v = res.data;
        const cp0 = (v.contactPersons || [])[0] || {};

        setForm({
          vendorCode:    String(v.vendorId || vendorId),
          vendorName:    v.vendorName    || '',
          businessType:  v.businessType  || '',
          industryType:  v.industryType  || '',
          pan:           v.pan           || '',
          gst:           v.gstin         || v.gst || '',
          cin:           v.cin           || '',
          msme:          v.msme          || '',
          contactPerson: cp0.name        || v.contactPerson || '',
          mobile:        cp0.mobileNumber|| v.mobile        || '',
          altMobile:     cp0.altMobile   || v.altMobile     || '',
          email:         cp0.email       || v.email         || '',
          website:       v.website       || '',
          landline:      cp0.landline    || v.landline       || '',
          billingAddr:   v.address       || v.billingAddr    || '',
          shippingAddr:  v.shippingAddr  || '',
          state:         v.state         || '',
          city:          v.city          || '',
          pincode:       v.pincode       || '',
          country:       v.country       || 'India',
          gstRegistered: v.gstRegistered !== undefined ? Boolean(v.gstRegistered) : true,
          gstType:       v.gstType       || v.gstin ? 'Regular' : 'Regular',
          tdsApplicable: Boolean(v.tdsApplicable || v.tcsApplicable),
          bankName:      v.bankName      || '',
          accountHolder: v.accountHolder || '',
          accountNo:     v.accountNo     || v.bankAccount || '',
          ifsc:          v.ifsc          || v.bankIfsc    || '',
          branch:        v.branch        || v.bankBranch  || '',
          upi:           v.upi           || '',
          paymentTerms:  v.paymentTerms  || '30 Days',
          creditLimit:   v.creditLimit   || '',
          paymentModes:  Array.isArray(v.paymentModes) ? v.paymentModes : [],
          currency:      v.currency      || 'INR',
          category:      v.category      || 'Regular',
          purchasePerson:v.purchasePerson|| '',
          remarks:       v.remarks       || '',
          status:        v.status        || 'draft',
        });

        setDocuments((v.documents || []).map((d, i) => ({
          id: i + 1, name: d.name || d.fileName || '', fileName: d.fileName || null, newFile: null,
        })));
      } catch (err) {
        setToast({ type: 'error', msg: 'Error loading vendor: ' + err.message });
      } finally {
        setLoading(false);
      }
    })();
  }, [vendorId, selectedCompany]);

  const set = useCallback((k, v) => {
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
  }, []);

  /* ── Validation ── */
  const runValidate = () => {
    const e = {};
    if (!form.vendorName.trim())  e.vendorName    = 'Vendor Name is required';
    if (!form.businessType)       e.businessType  = 'Business Type is required';
    if (form.pan && !validators.pan(form.pan))   e.pan = 'Invalid PAN (e.g. ABCDE1234F)';
    if (form.gst && !validators.gst(form.gst))   e.gst = 'Invalid GST (15-char format)';
    if (!form.contactPerson.trim()) e.contactPerson = 'Contact Person is required';
    if (!form.mobile)               e.mobile = 'Mobile is required';
    else if (!validators.mobile(form.mobile)) e.mobile = 'Invalid mobile (10 digits, starts 6-9)';
    if (form.altMobile && !validators.mobile(form.altMobile)) e.altMobile = 'Invalid mobile number';
    if (form.email && !validators.email(form.email))           e.email = 'Invalid email address';
    if (!form.billingAddr.trim()) e.billingAddr = 'Billing Address is required';
    if (!form.state)              e.state = 'State is required';
    if (!form.city.trim())        e.city  = 'City is required';
    if (form.pincode && !validators.pin(form.pincode)) e.pincode = 'Invalid pincode';
    if (form.ifsc && !validators.ifsc(form.ifsc))       e.ifsc = 'Invalid IFSC (e.g. SBIN0001234)';
    if (form.paymentModes.length === 0) e.paymentModes = 'Select at least one payment mode';
    setErrs(e);
    return e;
  };

  const tabHasErr = (id, e) => ({
    basic:   ['vendorName','businessType','pan','gst'],
    contact: ['contactPerson','mobile','altMobile','email'],
    address: ['billingAddr','state','city','pincode'],
    bank:    ['ifsc'],
    payment: ['paymentModes'],
  }[id]?.some(f => e[f]) || false);

  /* ── Submit ── */
  const submitForm = async (status) => {
    const e = runValidate();
    if (Object.keys(e).length > 0) {
      const errTab = TABS.find(t => tabHasErr(t.id, e));
      if (errTab) setActiveTab(errTab.id);
      setToast({ type: 'error', msg: 'Please fix the highlighted errors before saving.' });
      return;
    }
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append('companyId',     selectedCompany?.companyId || '');
      fd.append('vendorName',    form.vendorName);
      fd.append('vendorCode',    form.vendorCode);
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
      fd.append('tcsApplicable', form.tdsApplicable);
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
      fd.append('purchasePerson',form.purchasePerson);
      fd.append('remarks',       form.remarks);
      fd.append('website',       form.website);
      fd.append('landline',      form.landline);
      fd.append('status',        status);
      fd.append('contactPersons', JSON.stringify([{
        name: form.contactPerson, mobileNumber: form.mobile,
        altMobile: form.altMobile, email: form.email, landline: form.landline,
      }]));

      const keepDocs = documents.filter(d => !d.newFile).map(d => ({ name: d.name, ...(d.fileName ? { fileName: d.fileName } : {}) }));
      fd.append('documents', JSON.stringify(keepDocs));
      const uploadDocs = documents.filter(d => d.newFile);
      fd.append('fileNames', JSON.stringify(uploadDocs.map(d => d.name)));
      uploadDocs.forEach(d => fd.append('newFiles', d.newFile));

      await axios.put(`/api/vendors/${vendorId}`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });

      setToast({ type: 'success', msg: `Vendor "${form.vendorName}" ${status === 'pending' ? 'sent for approval!' : 'saved as draft.'}` });
      if (status === 'pending') setTimeout(() => navigate('/vendor/pending'), 1800);
    } catch (err) {
      setToast({ type: 'error', msg: 'Error: ' + (err.response?.data?.error || err.message) });
    } finally {
      setSaving(false);
    }
  };

  const tabIdx = TABS.findIndex(t => t.id === activeTab);

  if (loading) return <div style={{ padding: 20, fontFamily: F, color: '#64748B' }}>Loading vendor data…</div>;

  /* ════════════════════════════════════════════════
     RENDER
  ════════════════════════════════════════════════ */
  return (
    <div style={{ fontFamily: F, color: '#1A202C', display: 'flex', flexDirection: 'column', height: '100%', background: '#EBF0F5' }}>
      {toast && <Toast type={toast.type} msg={toast.msg} onClose={() => setToast(null)} />}

      {/* ── Page Header ── */}
      <div style={{
        background: HDR, padding: '7px 16px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        borderBottom: `2px solid ${BD}`, flexShrink: 0,
      }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', fontFamily: F, textTransform: 'uppercase', letterSpacing: '0.6px' }}>
          Edit Vendor — {vendorId}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" onClick={() => navigate('/vendor/view')}
            style={{ fontFamily: F, fontSize: 12, fontWeight: 600, height: 32, padding: '0 16px',
              background: 'rgba(255,255,255,0.12)', color: '#fff',
              border: '1px solid rgba(255,255,255,0.25)', borderRadius: 6, cursor: 'pointer' }}>
            Cancel
          </button>
          <button type="button" onClick={() => submitForm('pending')} disabled={saving}
            style={{ fontFamily: F, fontSize: 12, fontWeight: 700, height: 32, padding: '0 20px',
              background: '#12B76A', color: '#fff', border: 'none',
              borderRadius: 6, cursor: 'pointer', boxShadow: '0 2px 6px rgba(18,183,106,0.4)' }}>
            {saving ? 'Saving…' : '🖫 Save Vendor'}
          </button>
        </div>
      </div>

      {/* ── Tab Bar ── */}
      <div style={{
        background: TAB_BG, borderBottom: `1px solid ${BD}`,
        display: 'flex', flexWrap: 'nowrap', overflowX: 'auto',
        padding: '4px 8px 0', gap: 2, flexShrink: 0,
      }}>
        {TABS.map(t => {
          const active = activeTab === t.id;
          const hasErr = Object.keys(errs).length > 0 && tabHasErr(t.id, errs);
          return (
            <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
              fontFamily: F, fontSize: 12, fontWeight: active ? 700 : 400,
              color: hasErr ? '#C53030' : active ? HDR : '#4A5568',
              background: active ? '#fff' : 'transparent',
              border: active ? `1px solid ${BD}` : '1px solid transparent',
              borderBottom: active ? '1px solid #fff' : 'none',
              marginBottom: active ? -1 : 0, padding: '5px 14px',
              cursor: 'pointer', whiteSpace: 'nowrap',
              borderRadius: '7px 7px 0 0',
              position: 'relative', zIndex: active ? 1 : 0, flexShrink: 0,
              transition: 'color 0.12s',
            }}>
              {t.label}
              {hasErr && <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#C53030', position: 'absolute', top: 3, right: 3, display: 'inline-block' }} />}
            </button>
          );
        })}
      </div>

      {/* ── Content Area ── */}
      <div style={{ background: '#EBF0F5', border: `1px solid ${BD}`, borderTop: 'none', padding: '10px', flex: 1, overflowY: 'auto' }}>

        {/* ══ TAB 1: Basic Information ══ */}
        {activeTab === 'basic' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div style={css.card}>
              <div style={css.secHead}>Vendor Identity</div>
              <FInput label="Vendor Name" req value={form.vendorName}
                onChange={v => set('vendorName', v)} placeholder="e.g. ABC Supplies Pvt Ltd" err={errs.vendorName} />
              <div style={css.fr}>
                <label style={css.lbl}>Vendor ID</label>
                <div style={{ flex: 1 }}>
                  <input value={form.vendorCode} readOnly
                    style={{ ...inpStyle(false), width: 100, fontFamily: 'monospace', fontWeight: 700, background: '#ffffcc' }} />
                </div>
              </div>
              <FSelect label="Business Type" req value={form.businessType}
                onChange={v => set('businessType', v)} err={errs.businessType}
                options={['Proprietorship','Partnership','Private Limited','Public Limited','LLP','Government','Individual','Trust / NGO','HUF']} />
              <FSelect label="Industry Type" value={form.industryType}
                onChange={v => set('industryType', v)} options={INDUSTRY_TYPES} />
            </div>

            <div style={css.card}>
              <div style={css.secHead}>Tax Identity</div>
              <FInput label="PAN Number" value={form.pan} onChange={v => set('pan', v)}
                placeholder="ABCDE1234F" err={errs.pan} hint="e.g. ABCDE1234F" maxLength={10} upper />
              <div>
                <FInput label="GST Number" value={form.gst} onChange={v => set('gst', v)}
                  placeholder="22AAAAA0000A1Z5" err={errs.gst}
                  hint="15-char GSTIN — state auto-fills" maxLength={15} upper />
                {gstWarn && <div style={{ fontSize: 10, color: '#188918', padding: '1px 4px', fontFamily: F, fontWeight: 600 }}>✓ {gstWarn}</div>}
              </div>
              <FInput label="CIN Number" value={form.cin} onChange={v => set('cin', v)}
                placeholder="U74999MH2020PTC123456" hint="Optional" upper />
              <FInput label="MSME / Udyam" value={form.msme} onChange={v => set('msme', v)}
                placeholder="UDYAM-XX-00-0000000" hint="Optional" />
            </div>
          </div>
        )}

        {/* ══ TAB 2: Contact Details ══ */}
        {activeTab === 'contact' && (
          <div style={{ maxWidth: 620 }}>
          <div style={css.card}>
            <div style={css.secHead}>Contact Information</div>
            <div style={css.g2}>
              <FInput label="Contact Person Name" req value={form.contactPerson}
                onChange={v => set('contactPerson', v)} placeholder="Full name" err={errs.contactPerson} />
              <FInput label="Mobile Number" req value={form.mobile}
                onChange={v => set('mobile', v.replace(/\D/,''))} placeholder="10-digit mobile"
                maxLength={10} err={errs.mobile} hint="Starts with 6, 7, 8, or 9" />
              <FInput label="Alternate Mobile" value={form.altMobile}
                onChange={v => set('altMobile', v.replace(/\D/,''))} placeholder="Alternate number"
                maxLength={10} err={errs.altMobile} />
              <FInput label="Email ID" type="email" value={form.email}
                onChange={v => set('email', v)} placeholder="contact@company.com" err={errs.email} />
              <FInput label="Landline Number" value={form.landline}
                onChange={v => set('landline', v)} placeholder="STD + Number (e.g. 0222-1234567)" />
              <FInput label="Website" value={form.website}
                onChange={v => set('website', v)} placeholder="https://www.vendor.com" />
            </div>
          </div>
          </div>
        )}

        {/* ══ TAB 3: Address Details ══ */}
        {activeTab === 'address' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div style={css.card}>
              <div style={css.secHead}>Billing Address</div>
              <FTextarea label="Address" req value={form.billingAddr}
                onChange={v => set('billingAddr', v)} placeholder="Door no, Street, Area, District…" err={errs.billingAddr} />
              <FSelect label="State" req value={form.state}
                onChange={v => set('state', v)} options={STATES} err={errs.state} />
              <FInput label="City" req value={form.city}
                onChange={v => set('city', v)} placeholder="City" err={errs.city} />
              <FInput label="Pincode" value={form.pincode}
                onChange={v => set('pincode', v.replace(/\D/,''))} placeholder="6-digit" maxLength={6} err={errs.pincode} />
              <FInput label="Country" value={form.country} onChange={v => set('country', v)} />
            </div>
            <div style={css.card}>
              <div style={{ ...css.secHead, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Shipping / Delivery Address</span>
                <button type="button" onClick={() => set('shippingAddr', form.billingAddr)} style={{
                  fontSize: '11px', color: '#fff', background: 'rgba(255,255,255,0.15)',
                  border: '1px solid rgba(255,255,255,0.35)', borderRadius: 6, padding: '2px 10px',
                  cursor: 'pointer', fontWeight: 600, fontFamily: F,
                }}>📋 Copy from Billing</button>
              </div>
              <FTextarea label="Address" value={form.shippingAddr}
                onChange={v => set('shippingAddr', v)} placeholder="Leave blank if same as billing address…" />
            </div>
          </div>
        )}

        {/* ══ TAB 4: Tax & Compliance ══ */}
        {activeTab === 'tax' && (
          <div style={{ maxWidth: 640 }}>
            <div style={css.card}>
              <div style={css.secHead}>GST Registration</div>
              <div style={css.fr}>
                <label style={css.lbl}>GST Registered</label>
                <div style={{ flex: 1 }}>
                  <Toggle id="gstReg" checked={form.gstRegistered} onChange={e => set('gstRegistered', e.target.checked)} />
                </div>
              </div>
              {form.gstRegistered && (
                <div style={css.fr}>
                  <label style={css.lbl}>GST Type</label>
                  <div style={{ flex: 1, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {['Regular','Composition','Unregistered','Consumer','SEZ'].map(t => (
                      <label key={t} style={{
                        display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer',
                        fontSize: 12, padding: '3px 10px', fontFamily: F,
                        border: `1px solid ${form.gstType === t ? HDR : BD}`,
                        borderRadius: 6, background: form.gstType === t ? '#D6E4F0' : '#fff',
                        color: form.gstType === t ? HDR : '#4A5568',
                        fontWeight: form.gstType === t ? 700 : 400,
                      }}>
                        <input type="radio" name="gstType" value={t} checked={form.gstType === t} onChange={() => set('gstType', t)} style={{ accentColor: HDR }} />
                        {t}
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div style={css.card}>
              <div style={css.secHead}>TDS Applicability</div>
              <div style={css.fr}>
                <label style={css.lbl}>TDS Applicable</label>
                <div style={{ flex: 1 }}>
                  <Toggle id="tds" checked={form.tdsApplicable} onChange={e => set('tdsApplicable', e.target.checked)} />
                </div>
              </div>
            </div>

            <div style={css.card}>
              <div style={css.secHead}>Documents</div>
              <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {documents.map((doc, i) => (
                  <div key={doc.id || i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input value={doc.name} placeholder="Document name"
                      onChange={e => setDocuments(d => d.map((x, j) => j === i ? { ...x, name: e.target.value } : x))}
                      style={{ ...inpStyle(false), flex: 1 }} />
                    <span style={{ fontSize: 10, color: '#94A3B8', whiteSpace: 'nowrap', fontFamily: F }}>
                      {doc.fileName ? `📄 ${doc.fileName}` : 'No file'}
                    </span>
                    <input type="file"
                      onChange={e => setDocuments(d => d.map((x, j) => j === i ? { ...x, newFile: e.target.files[0] } : x))}
                      style={{ fontSize: 11, fontFamily: F, flex: 1 }}
                      accept=".pdf,.jpg,.png,.doc,.docx" />
                    {documents.length > 0 && (
                      <button type="button" onClick={() => setDocuments(d => d.filter((_, j) => j !== i))}
                        style={{ padding: '2px 8px', background: '#FEE2E2', border: `1px solid #FCA5A5`, color: '#991B1B', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontFamily: F }}>✕</button>
                    )}
                  </div>
                ))}
                <button type="button"
                  onClick={() => setDocuments(d => [...d, { id: Date.now(), name: '', newFile: null }])}
                  style={{ marginTop: 4, padding: '3px 12px', background: '#EBF0F5', border: `1px solid ${BD}`, color: HDR, borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: F, alignSelf: 'flex-start' }}>
                  + Add Document
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ══ TAB 5: Banking Details ══ */}
        {activeTab === 'bank' && (
          <div style={{ maxWidth: 620 }}><div style={css.card}>
            <div style={css.secHead}>Bank Account Information</div>
            <div style={css.g2}>
              <FSelect label="Bank Name" value={form.bankName} onChange={v => set('bankName', v)}
                options={['State Bank of India','HDFC Bank','ICICI Bank','Axis Bank','Punjab National Bank','Bank of Baroda','Canara Bank','Union Bank of India','Kotak Mahindra Bank','IndusInd Bank','Yes Bank','IDBI Bank','Federal Bank','South Indian Bank','UCO Bank','Indian Bank','Bank of India','Central Bank of India','Other']} />
              <FInput label="Account Holder Name" value={form.accountHolder}
                onChange={v => set('accountHolder', v)} placeholder="As per bank records" />
              <FInput label="Account Number" value={form.accountNo}
                onChange={v => set('accountNo', v.replace(/\D/,''))} placeholder="Account number" />
              <div>
                <FInput label="IFSC Code" value={form.ifsc} onChange={v => set('ifsc', v)}
                  placeholder="e.g. SBIN0001234" maxLength={11} err={errs.ifsc} upper
                  hint="11-character bank IFSC code" />
                {form.ifsc.length === 11 && validators.ifsc(form.ifsc) && (
                  <div style={{ fontSize: '11px', color: '#188918', marginTop: '3px', fontWeight: 600 }}>✓ Valid IFSC format</div>
                )}
              </div>
              <FInput label="Branch Name" value={form.branch}
                onChange={v => set('branch', v)} placeholder="Branch name and city" />
              <FInput label="UPI ID (Optional)" value={form.upi}
                onChange={v => set('upi', v)} placeholder="name@bank"
                hint="For UPI-based vendor payments" />
            </div>
            <div style={{ marginTop: '16px', padding: '10px 14px', background: '#FEF3CD', border: '1px solid #F6C244', borderLeft: '3px solid #F6C244', borderRadius: '4px', fontSize: '12px', color: '#7A4F01', display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
              <span>⚠️</span>
              <span>Bank details are used for vendor payments. Please verify all information carefully before saving.</span>
            </div>
          </div></div>
        )}

        {/* ══ TAB 6: Payment & Terms ══ */}
        {activeTab === 'payment' && (
          <div style={{ maxWidth: 640 }}>
            <div style={css.card}>
              <div style={css.secHead}>Payment Configuration</div>
              <FSelect label="Payment Terms" req value={form.paymentTerms}
                onChange={v => set('paymentTerms', v)}
                options={['Advance','7 Days','15 Days','30 Days','45 Days','60 Days','90 Days','On Delivery']} />
              <div style={css.fr}>
                <label style={css.lbl}>Currency</label>
                <div style={{ flex: 1 }}>
                  <select value={form.currency} onChange={e => set('currency', e.target.value)} style={selStyle(false)}>
                    <option value="INR">INR — Indian Rupee ₹</option>
                    <option value="USD">USD — US Dollar $</option>
                    <option value="EUR">EUR — Euro €</option>
                    <option value="GBP">GBP — British Pound £</option>
                    <option value="AED">AED — UAE Dirham</option>
                  </select>
                </div>
              </div>
              <div style={css.fr}>
                <label style={css.lbl}>Credit Limit ({form.currency})</label>
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 0 }}>
                  <span style={{ height: 24, padding: '0 8px', background: '#EBF0F5', border: `1px solid ${BD}`, borderRight: 'none', borderRadius: '2px 0 0 2px', fontSize: 12, color: HDR, fontWeight: 700, display: 'flex', alignItems: 'center', fontFamily: F }}>₹</span>
                  <input value={form.creditLimit} onChange={e => set('creditLimit', e.target.value.replace(/\D/,''))}
                    placeholder="0" style={{ ...inpStyle(false), borderRadius: '0 2px 2px 0', flex: 1 }} />
                </div>
              </div>
              <div style={{ ...css.fr, alignItems: 'flex-start', padding: '6px 10px 6px 4px' }}>
                <label style={{ ...css.lbl, paddingTop: 4 }}>Payment Modes <span style={css.req}>*</span></label>
                <div style={{ flex: 1 }}>
                  <MultiCheck
                    options={['NEFT','RTGS','IMPS','Cheque','Cash','UPI','DD','Credit Card']}
                    selected={form.paymentModes}
                    onChange={v => set('paymentModes', v)}
                  />
                  {errs.paymentModes && <div style={css.err}>{errs.paymentModes}</div>}
                </div>
              </div>
            </div>
            {(form.paymentTerms || form.creditLimit) && (
              <div style={{ ...css.card, marginTop: 0 }}>
                <div style={css.secHead}>Payment Summary</div>
                <div style={{ padding: '8px 10px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                  <SummaryCell label="Terms"        value={form.paymentTerms} />
                  <SummaryCell label="Credit Limit" value={form.creditLimit ? `₹ ${Number(form.creditLimit).toFixed(2)}` : '—'} />
                  <SummaryCell label="Currency"     value={form.currency} />
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══ TAB 7: Additional Details ══ */}
        {activeTab === 'extra' && (
          <div style={{ maxWidth: 640 }}>
            <div style={css.card}>
              <div style={css.secHead}>Classification & Assignment</div>
              <div style={{ ...css.fr, alignItems: 'flex-start', padding: '6px 10px 6px 4px' }}>
                <label style={{ ...css.lbl, paddingTop: 4 }}>Vendor Category</label>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {[
                      { val: 'Regular',     color: '#1B6FBD', bg: '#D6E8F5' },
                      { val: 'Preferred',   color: '#188918', bg: '#E8F5E9' },
                      { val: 'Blacklisted', color: '#BB0000', bg: '#FFEBEB' },
                    ].map(opt => (
                      <button key={opt.val} type="button" onClick={() => set('category', opt.val)} style={{
                        flex: 1, padding: '4px 0', borderRadius: 6, cursor: 'pointer', fontFamily: F,
                        border: `1px solid ${form.category === opt.val ? opt.color : BD}`,
                        background: form.category === opt.val ? opt.bg : '#fff',
                        color: form.category === opt.val ? opt.color : '#4A5568',
                        fontSize: 12, fontWeight: form.category === opt.val ? 700 : 400, transition: 'all 0.12s',
                      }}>{opt.val}</button>
                    ))}
                  </div>
                  {form.category === 'Blacklisted' && (
                    <div style={{ fontSize: 11, color: '#BB0000', marginTop: 4, fontWeight: 600, fontFamily: F }}>
                      ⚠️ Blacklisted vendors will be blocked from purchase transactions.
                    </div>
                  )}
                </div>
              </div>
              <FSelect label="Purchase Person" value={form.purchasePerson}
                onChange={v => set('purchasePerson', v)} options={PURCHASE_PERSONS}
                placeholder="— Assign Purchase Person —" />
              <FTextarea label="Remarks / Notes" value={form.remarks}
                onChange={v => set('remarks', v)} placeholder="Any internal notes about this vendor…" rows={3} />
            </div>
            <div style={css.card}>
              <div style={css.secHead}>Quick Review</div>
              <div style={{ padding: '8px 10px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                <SummaryCell label="Vendor Name"  value={form.vendorName} />
                <SummaryCell label="Vendor Code"  value={form.vendorCode} />
                <SummaryCell label="Business"     value={form.businessType} />
                <SummaryCell label="Mobile"       value={form.mobile} />
                <SummaryCell label="GST"          value={form.gst} />
                <SummaryCell label="State"        value={form.state} />
                <SummaryCell label="Pay Terms"    value={form.paymentTerms} />
                <SummaryCell label="Category"     value={form.category} />
                <SummaryCell label="GST Type"     value={form.gstType} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Footer Navigation ── */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '6px 12px', background: TAB_BG,
        borderTop: `1px solid ${BD}`, flexShrink: 0,
      }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: '#5A6475', fontFamily: F }}>
            Step {tabIdx + 1} of {TABS.length} — <strong>{TABS[tabIdx]?.label}</strong>
          </span>
          {tabIdx > 0 && (
            <button type="button" onClick={() => setActiveTab(TABS[tabIdx - 1].id)}
              style={{ padding: '3px 12px', background: '#fff', border: `1px solid ${BD}`, color: HDR, borderRadius: 6, cursor: 'pointer', fontSize: 12, fontFamily: F, fontWeight: 600 }}>
              ◀ Prev
            </button>
          )}
          {tabIdx < TABS.length - 1 && (
            <button type="button" onClick={() => setActiveTab(TABS[tabIdx + 1].id)}
              style={{ padding: '3px 12px', background: '#fff', border: `1px solid ${BD}`, color: HDR, borderRadius: 6, cursor: 'pointer', fontSize: 12, fontFamily: F, fontWeight: 600 }}>
              Next ▶
            </button>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button type="button" onClick={() => navigate('/vendor/view')} disabled={saving}
            style={{ padding: '3px 14px', background: '#fff', border: `1px solid ${BD}`, color: '#4A5568', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontFamily: F }}>
            ← Back to List
          </button>
          <button type="button" onClick={() => submitForm('draft')} disabled={saving}
            style={{ padding: '3px 14px', background: '#fff', border: `1px solid ${HDR}`, color: HDR, borderRadius: 6, cursor: 'pointer', fontSize: 12, fontFamily: F, fontWeight: 700 }}>
            {saving ? '...' : '💾 Save Draft'}
          </button>
          <button type="button" onClick={() => submitForm('pending')} disabled={saving}
            style={{ padding: '3px 16px', background: '#12B76A', border: 'none', color: '#fff', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontFamily: F, fontWeight: 700, boxShadow: '0 2px 6px rgba(18,183,106,0.35)' }}>
            {saving ? 'Saving…' : '✅ Submit for Approval'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default EditVendor;
