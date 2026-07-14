import { useState, useEffect } from 'react';
import axios from 'axios';
import { useCompany } from '../../context/CompanyContext';
import FinancialDocs from '../account/financialdocs/FinancialDocs';

const F  = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const P  = '#3A6186';
const PD = '#2A4D6E';

const TABS = [
  { key: 'profile',  label: '🏢 Company Profile'   },
  { key: 'findocs',  label: '📑 Financial Docs'     },
];

function Field({ label, value, icon }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
      <span style={{ fontSize:10, fontWeight:700, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'0.8px' }}>
        {icon} {label}
      </span>
      <span style={{ fontSize:13.5, fontWeight:600, color: value ? '#1E293B' : '#CBD5E1' }}>
        {value || '—'}
      </span>
    </div>
  );
}

function Section({ title, color, children }) {
  return (
    <div style={{ background:'#fff', borderRadius:10, border:'1px solid #E8ECF2',
      boxShadow:'0 1px 4px rgba(0,0,0,0.06)', overflow:'hidden' }}>
      <div style={{ padding:'10px 18px', background:`${color}10`,
        borderBottom:`2px solid ${color}`, display:'flex', alignItems:'center', gap:8 }}>
        <div style={{ width:4, height:16, borderRadius:2, background:color }} />
        <span style={{ fontSize:11.5, fontWeight:800, color, textTransform:'uppercase', letterSpacing:'0.6px' }}>
          {title}
        </span>
      </div>
      <div style={{ padding:'18px', display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(200px, 1fr))', gap:'18px 28px' }}>
        {children}
      </div>
    </div>
  );
}

function CompanyProfile() {
  const { selectedCompany } = useCompany();
  const [co, setCo]  = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!selectedCompany?.companyId) return;
    axios.get('/api/companies')
      .then(r => {
        const list = Array.isArray(r.data) ? r.data : [];
        const found = list.find(c => c.companyId === selectedCompany.companyId);
        setCo(found || selectedCompany);
      })
      .catch(() => setCo(selectedCompany));
  }, [selectedCompany]);

  if (!selectedCompany) return (
    <div style={{ padding:48, textAlign:'center', color:'#94A3B8', fontFamily:F }}>
      Please select a company first.
    </div>
  );

  const d = co || selectedCompany;

  return (
    <div style={{ padding:'20px 24px', display:'flex', flexDirection:'column', gap:16, fontFamily:F }}>

      {/* Header card */}
      <div style={{ background:`linear-gradient(135deg,${P},${PD})`, borderRadius:12,
        padding:'20px 24px', display:'flex', alignItems:'center', gap:18,
        boxShadow:'0 4px 16px rgba(58,97,134,0.25)' }}>
        <div style={{ width:64, height:64, borderRadius:14, background:'rgba(255,255,255,0.18)',
          display:'flex', alignItems:'center', justifyContent:'center',
          border:'2px solid rgba(255,255,255,0.3)', fontSize:32, flexShrink:0 }}>
          🏛️
        </div>
        <div>
          <div style={{ fontSize:22, fontWeight:800, color:'#fff', marginBottom:4 }}>
            {d.companyName || '—'}
          </div>
          <div style={{ display:'flex', flexWrap:'wrap', gap:'6px 16px' }}>
            {d.gstin && <span style={{ fontSize:11.5, color:'rgba(255,255,255,0.8)', fontWeight:600 }}>GST: {d.gstin}</span>}
            {d.pan   && <span style={{ fontSize:11.5, color:'rgba(255,255,255,0.8)', fontWeight:600 }}>PAN: {d.pan}</span>}
            {d.city  && <span style={{ fontSize:11.5, color:'rgba(255,255,255,0.7)' }}>📍 {d.city}{d.state ? `, ${d.state}` : ''}</span>}
          </div>
          {d.isDefault && (
            <span style={{ display:'inline-block', marginTop:6, fontSize:10, fontWeight:800,
              background:'rgba(255,255,255,0.2)', color:'#fff', padding:'2px 10px',
              borderRadius:20, letterSpacing:'0.5px' }}>DEFAULT COMPANY</span>
          )}
        </div>
      </div>

      {/* Details sections */}
      <Section title="Basic Information" color={P}>
        <Field icon="🏢" label="Company Name"  value={d.companyName} />
        <Field icon="📍" label="City"          value={d.city}        />
        <Field icon="🗺️" label="State"         value={d.state}       />
        <Field icon="📮" label="Pincode"       value={d.pincode}     />
        <Field icon="🏠" label="Address"       value={d.address}     />
        <Field icon="🌐" label="Website"       value={d.website}     />
      </Section>

      <Section title="Tax & Compliance" color="#7C3AED">
        <Field icon="🏷️" label="GSTIN"         value={d.gstin}       />
        <Field icon="📄" label="PAN"           value={d.pan}         />
      </Section>

      <Section title="Contact Details" color="#059669">
        <Field icon="📧" label="Email"         value={d.email}       />
        <Field icon="📞" label="Phone"         value={d.phone}       />
      </Section>

      <Section title="Bank Details" color="#EA580C">
        <Field icon="🏦" label="Bank Name"     value={d.bankName}    />
        <Field icon="💳" label="Account No."   value={d.bankAccount} />
        <Field icon="🔑" label="IFSC Code"     value={d.bankIfsc}    />
      </Section>
    </div>
  );
}

export default function CompanyInfo() {
  const [tab, setTab] = useState('profile');

  return (
    <div style={{ height:'100%', display:'flex', flexDirection:'column', fontFamily:F, background:'#F1F4F9' }}>

      {/* Top nav bar */}
      <div style={{ flexShrink:0, background:P, borderBottom:`2px solid ${PD}`,
        display:'flex', alignItems:'center', height:40, padding:'0 16px', gap:4 }}>
        <span style={{ fontSize:13, fontWeight:700, color:'rgba(255,255,255,0.7)',
          marginRight:8, letterSpacing:'0.3px' }}>🏛️ COMPANY INFO</span>
        <div style={{ width:1, height:18, background:'rgba(255,255,255,0.25)', margin:'0 6px' }} />
        {TABS.map(t => {
          const active = tab === t.key;
          return (
            <button key={t.key} onClick={() => setTab(t.key)} style={{
              height:28, padding:'0 14px', background: active ? 'rgba(255,255,255,0.22)' : 'transparent',
              border:`1px solid ${active ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.3)'}`,
              borderRadius:4, cursor:'pointer', fontFamily:F, fontSize:12,
              fontWeight: active ? 700 : 400, color:'#fff', whiteSpace:'nowrap',
            }}>
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div style={{ flex:1, overflow:'auto' }}>
        {tab === 'profile' && <CompanyProfile />}
        {tab === 'findocs' && <FinancialDocs />}
      </div>
    </div>
  );
}
