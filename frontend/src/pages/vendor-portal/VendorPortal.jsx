import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useVendorAuth } from '../../context/VendorAuthContext';

const F   = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const P   = '#2563EB';
const BD  = '#E5EAF2';
const BG  = '#F5F7FB';

const STATUS_COLOR = {
  approved:  { bg:'#ECFDF5', color:'#059669' },
  pending:   { bg:'#FFFBEB', color:'#D97706' },
  draft:     { bg:'#EFF6FF', color:'#2563EB' },
  completed: { bg:'#F0FDF4', color:'#16A34A' },
  cancelled: { bg:'#FEF2F2', color:'#DC2626' },
};

function StatusBadge({ status }) {
  const s = STATUS_COLOR[status] || { bg:'#F1F5F9', color:'#64748b' };
  return (
    <span style={{ padding:'2px 10px', borderRadius:20, fontSize:11, fontWeight:700, background:s.bg, color:s.color, fontFamily:F }}>
      {status || 'Unknown'}
    </span>
  );
}

const td = { padding:'10px 12px', fontSize:12, fontFamily:F, borderBottom:`1px solid ${BD}`, verticalAlign:'middle' };
const th = { padding:'9px 12px', background:P, color:'#fff', fontSize:11, fontWeight:700, textAlign:'left', fontFamily:F };

function ActivationPending({ vendor, vendorLogout }) {
  return (
    <div style={{ fontFamily:F, background:'linear-gradient(135deg,#1E293B 0%,#2563EB 100%)', minHeight:'100vh', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'24px' }}>
      <div style={{ background:'#fff', borderRadius:16, boxShadow:'0 24px 60px rgba(0,0,0,0.3)', width:'100%', maxWidth:500, overflow:'hidden' }}>
        <div style={{ background:'linear-gradient(135deg,#1E293B,#2563EB)', padding:'24px 28px' }}>
          <div style={{ fontSize:11, color:'rgba(255,255,255,0.6)', fontWeight:600, textTransform:'uppercase', letterSpacing:'1.5px', marginBottom:6 }}>Epsilon Enterprise</div>
          <div style={{ fontSize:20, fontWeight:800, color:'#fff' }}>Vendor Portal</div>
        </div>
        <div style={{ padding:'32px 28px', textAlign:'center' }}>
          <div style={{ width:72, height:72, borderRadius:'50%', background:'#FFF7ED', border:'3px solid #FED7AA', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 20px', fontSize:32 }}>⏳</div>
          <div style={{ fontSize:18, fontWeight:800, color:'#1E293B', marginBottom:8 }}>Activation In Progress</div>
          <div style={{ fontSize:13.5, color:'#64748b', lineHeight:1.7, marginBottom:24 }}>
            Welcome, <strong>{vendor?.name}</strong>! Your registration is currently being reviewed by our team.
            You'll receive an email notification once your account is activated.
          </div>
          {vendor?.trackingNo && (
            <div style={{ background:'#EFF6FF', border:'2px dashed #93C5FD', borderRadius:10, padding:'16px 20px', marginBottom:24 }}>
              <div style={{ fontSize:11, color:'#2563EB', fontWeight:700, textTransform:'uppercase', letterSpacing:'2px', marginBottom:6 }}>Registration Tracking No.</div>
              <div style={{ fontSize:20, fontWeight:900, color:'#1D4ED8', letterSpacing:3 }}>{vendor.trackingNo}</div>
            </div>
          )}
          <div style={{ background:'#F8FAFC', border:'1px solid #E5E7EB', borderRadius:8, padding:'14px 16px', marginBottom:24, textAlign:'left' }}>
            <div style={{ fontSize:12, fontWeight:700, color:'#374151', marginBottom:8 }}>What happens next?</div>
            {[
              'Our procurement team reviews your application',
              'You get an email once approved',
              'Log back in to access your purchase orders and payments',
            ].map((s, i) => (
              <div key={i} style={{ display:'flex', gap:8, fontSize:12.5, color:'#475569', marginBottom:6, alignItems:'flex-start' }}>
                <span style={{ width:18, height:18, borderRadius:'50%', background:'#2563EB', color:'#fff', fontSize:10, fontWeight:800, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, marginTop:1 }}>{i+1}</span>
                {s}
              </div>
            ))}
          </div>
          <button onClick={vendorLogout} style={{ width:'100%', padding:'10px 0', borderRadius:8, cursor:'pointer', background:'#fff', border:'1px solid #D1D5DB', color:'#374151', fontSize:13, fontWeight:600, fontFamily:F }}>
            Sign Out
          </button>
        </div>
      </div>
    </div>
  );
}

export default function VendorPortal() {
  const { vendor, vendorLogout } = useVendorAuth();
  const [tab, setTab]       = useState('pos');
  const [pos, setPOs]       = useState([]);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('vendorToken');
    const headers = { Authorization: `Bearer ${token}` };
    setLoading(true);
    Promise.all([
      axios.get('/api/vendor-portal/purchase-orders', { headers }),
      axios.get('/api/vendor-portal/payments', { headers }),
    ])
      .then(([poRes, payRes]) => { setPOs(poRes.data); setPayments(payRes.data); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const kpis = {
    totalPOs:  pos.length,
    pending:   pos.filter(p => p.status === 'pending' || p.status === 'draft').length,
    completed: pos.filter(p => p.status === 'completed' || p.status === 'approved').length,
    totalPaid: payments.reduce((s, p) => s + (Number(p.amount) || 0), 0),
  };

  if (vendor?.pending) return <ActivationPending vendor={vendor} vendorLogout={vendorLogout} />;

  return (
    <div style={{ fontFamily:F, background:BG, minHeight:'100vh', display:'flex', flexDirection:'column' }}>

      {/* Header */}
      <div style={{ background:'linear-gradient(135deg,#1E293B,#2563EB)', padding:'12px 24px', display:'flex', alignItems:'center', justifyContent:'space-between', boxShadow:'0 2px 8px rgba(0,0,0,0.2)' }}>
        <div style={{ display:'flex', alignItems:'center', gap:14 }}>
          <div style={{ background:'rgba(255,255,255,0.15)', borderRadius:8, padding:'6px 12px', fontSize:12, fontWeight:700, color:'#fff' }}>🏢 Epsilon Enterprise</div>
          <div style={{ height:20, width:1, background:'rgba(255,255,255,0.2)' }} />
          <div style={{ fontSize:13, color:'rgba(255,255,255,0.8)', fontWeight:500 }}>Vendor Portal</div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <div style={{ textAlign:'right' }}>
            <div style={{ fontSize:13, fontWeight:700, color:'#fff' }}>{vendor?.name}</div>
            <div style={{ fontSize:11, color:'rgba(255,255,255,0.6)' }}>Vendor ID: {vendor?.vendorId}</div>
          </div>
          <button onClick={vendorLogout} style={{ padding:'6px 14px', borderRadius:6, cursor:'pointer', background:'rgba(255,255,255,0.12)', border:'1px solid rgba(255,255,255,0.25)', color:'#fff', fontSize:12, fontWeight:600, fontFamily:F }}>Logout</button>
        </div>
      </div>

      {/* KPI strip */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', background:'#fff', borderBottom:`1px solid ${BD}` }}>
        {[
          { label:'My PO Orders',   value:kpis.totalPOs,  color:P,        icon:'📋' },
          { label:'Pending Orders', value:kpis.pending,   color:'#D97706', icon:'⏳' },
          { label:'Completed',      value:kpis.completed, color:'#059669', icon:'✅' },
          { label:'Total Received', value:`₹ ${kpis.totalPaid.toLocaleString('en-IN')}`, color:'#7C3AED', icon:'💰' },
        ].map((k, i) => (
          <div key={i} style={{ padding:'14px 20px', borderRight: i<3?`1px solid ${BD}`:'none' }}>
            <div style={{ fontSize:11, color:'#6B7280', fontWeight:600, marginBottom:4 }}>{k.icon} {k.label}</div>
            <div style={{ fontSize:22, fontWeight:800, color:k.color }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ background:'#fff', borderBottom:`1px solid ${BD}`, display:'flex', padding:'0 20px' }}>
        {[
          { id:'pos',      label:'📋 Purchase Orders' },
          { id:'payments', label:'💰 Payments' },
          { id:'profile',  label:'👤 My Profile' },
        ].map(t => (
          <button key={t.id} onClick={()=>setTab(t.id)} style={{
            padding:'10px 18px', cursor:'pointer', fontFamily:F, fontWeight: tab===t.id?700:500,
            fontSize:12.5, background:'transparent', border:'none',
            borderBottom: tab===t.id?`2px solid ${P}`:'2px solid transparent',
            color: tab===t.id?P:'#64748b', marginBottom:-1,
          }}>{t.label}</button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex:1, padding:'16px 20px' }}>
        {loading ? (
          <div style={{ textAlign:'center', padding:'60px', color:'#94A3B8', fontSize:14 }}>Loading your data…</div>
        ) : (

          <>
            {/* Purchase Orders */}
            {tab === 'pos' && (
              pos.length === 0 ? (
                <div style={{ textAlign:'center', padding:'60px', color:'#94A3B8', fontSize:13 }}>No purchase orders found for your account.</div>
              ) : (
                <div style={{ background:'#fff', borderRadius:8, border:`1px solid ${BD}`, overflow:'hidden', boxShadow:'0 1px 3px rgba(0,0,0,0.05)' }}>
                  <table style={{ width:'100%', borderCollapse:'collapse' }}>
                    <thead>
                      <tr>
                        {['PO Number','Date','Items','Total Amount','Status'].map(h => <th key={h} style={th}>{h}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {pos.map((po, i) => (
                        <tr key={i} style={{ background: i%2===0?'#fff':'#FAFBFC' }}>
                          <td style={{ ...td, fontWeight:700, color:P }}>{po.poNumber || po.orderId || po.id || '—'}</td>
                          <td style={td}>{po.date || po.createdAt?.slice(0,10) || '—'}</td>
                          <td style={td}>{(po.items || po.lineItems || []).length} items</td>
                          <td style={{ ...td, fontWeight:600 }}>₹ {Number(po.totalAmount || po.total || 0).toLocaleString('en-IN')}</td>
                          <td style={td}><StatusBadge status={po.status} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            )}

            {/* Payments */}
            {tab === 'payments' && (
              payments.length === 0 ? (
                <div style={{ textAlign:'center', padding:'60px', color:'#94A3B8', fontSize:13 }}>No payment records found.</div>
              ) : (
                <div style={{ background:'#fff', borderRadius:8, border:`1px solid ${BD}`, overflow:'hidden', boxShadow:'0 1px 3px rgba(0,0,0,0.05)' }}>
                  <table style={{ width:'100%', borderCollapse:'collapse' }}>
                    <thead>
                      <tr>
                        {['Date','Description','Amount','Mode','Status'].map(h => <th key={h} style={th}>{h}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {payments.map((p, i) => (
                        <tr key={i} style={{ background: i%2===0?'#fff':'#FAFBFC' }}>
                          <td style={td}>{p.date || p.createdAt?.slice(0,10) || '—'}</td>
                          <td style={td}>{p.description || p.narration || '—'}</td>
                          <td style={{ ...td, fontWeight:700, color:'#059669' }}>₹ {Number(p.amount || 0).toLocaleString('en-IN')}</td>
                          <td style={td}>{p.mode || p.paymentMode || '—'}</td>
                          <td style={td}><StatusBadge status={p.status} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            )}

            {/* Profile */}
            {tab === 'profile' && (
              <div style={{ maxWidth:500, background:'#fff', borderRadius:10, border:`1px solid ${BD}`, overflow:'hidden', boxShadow:'0 1px 4px rgba(0,0,0,0.06)' }}>
                <div style={{ background:P, padding:'14px 18px' }}>
                  <div style={{ fontSize:14, fontWeight:700, color:'#fff' }}>{vendor?.name}</div>
                  <div style={{ fontSize:11, color:'rgba(255,255,255,0.7)', marginTop:2 }}>Vendor ID: {vendor?.vendorId}</div>
                </div>
                <div style={{ padding:'14px 18px' }}>
                  {[
                    ['Email', vendor?.email],
                    ['Company ID', vendor?.companyId],
                    ['Vendor ID', vendor?.vendorId],
                  ].map(([label, value]) => (
                    <div key={label} style={{ display:'flex', padding:'8px 0', borderBottom:`1px solid #F1F5F9` }}>
                      <span style={{ fontSize:12, color:'#6B7280', fontWeight:600, minWidth:130 }}>{label}</span>
                      <span style={{ fontSize:12, color:'#1E293B', fontWeight:500 }}>{value || '—'}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
