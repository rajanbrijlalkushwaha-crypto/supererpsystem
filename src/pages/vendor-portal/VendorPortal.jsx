import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { useVendorAuth } from '../../context/VendorAuthContext';

const F  = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const P  = '#2563EB';
const BD = '#E5EAF2';
const BG = '#F5F7FB';
const R  = '#DC2626';
const G  = '#059669';

const STATUS_COLOR = {
  approved:  { bg:'#ECFDF5', color:'#059669' },
  pending:   { bg:'#FFFBEB', color:'#D97706' },
  draft:     { bg:'#EFF6FF', color:'#2563EB' },
  completed: { bg:'#F0FDF4', color:'#16A34A' },
  cancelled: { bg:'#FEF2F2', color:'#DC2626' },
};

const fmtAmt = n => `₹ ${Number(n||0).toLocaleString('en-IN', {minimumFractionDigits:2})}`;
const fmtDate = d => { if (!d) return '—'; const s = String(d).slice(0,10); if (!s) return '—'; const [y,m,dy]=s.split('-'); return `${dy}-${m}-${y}`; };
const fmtSize = b => b > 1024*1024 ? `${(b/1024/1024).toFixed(1)} MB` : `${Math.round(b/1024)} KB`;

function StatusBadge({ status }) {
  const s = STATUS_COLOR[status] || { bg:'#F1F5F9', color:'#64748b' };
  return <span style={{ padding:'2px 10px', borderRadius:20, fontSize:11, fontWeight:700, background:s.bg, color:s.color, fontFamily:F }}>{status || 'Unknown'}</span>;
}

const TH = ({ children, right }) => (
  <th style={{ padding:'8px 10px', background:P, color:'#fff', fontSize:11, fontWeight:700, textAlign:right?'right':'left', fontFamily:F, whiteSpace:'nowrap' }}>{children}</th>
);
const TD = ({ children, right, bold, color }) => (
  <td style={{ padding:'7px 10px', fontSize:12, fontFamily:F, borderBottom:`1px solid ${BD}`, verticalAlign:'middle', textAlign:right?'right':'left', fontWeight:bold?700:400, color:color||'#1E293B' }}>{children}</td>
);

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
            Welcome, <strong>{vendor?.name}</strong>! Your registration is being reviewed. You'll be notified once activated.
          </div>
          {vendor?.trackingNo && (
            <div style={{ background:'#EFF6FF', border:'2px dashed #93C5FD', borderRadius:10, padding:'16px 20px', marginBottom:24 }}>
              <div style={{ fontSize:11, color:'#2563EB', fontWeight:700, textTransform:'uppercase', letterSpacing:'2px', marginBottom:6 }}>Registration Tracking No.</div>
              <div style={{ fontSize:20, fontWeight:900, color:'#1D4ED8', letterSpacing:3 }}>{vendor.trackingNo}</div>
            </div>
          )}
          <button onClick={vendorLogout} style={{ width:'100%', padding:'10px 0', borderRadius:8, cursor:'pointer', background:'#fff', border:'1px solid #D1D5DB', color:'#374151', fontSize:13, fontWeight:600, fontFamily:F }}>Sign Out</button>
        </div>
      </div>
    </div>
  );
}

/* ── PO Detail Panel ── */
function PODetailPanel({ po, token, onClose, payments }) {
  const [billFile,   setBillFile]   = useState(null);
  const [uploading,  setUploading]  = useState(false);
  const [uploadMsg,  setUploadMsg]  = useState('');
  const [bills,      setBills]      = useState(po.vendorBills || []);
  const fileRef = useRef();

  const downloadUrl = (type, fileName) =>
    `/api/vendor-portal/purchase-orders/${po.orderId}/${type}/${encodeURIComponent(fileName)}?token=${token}`;

  const uploadBill = async () => {
    if (!billFile) return;
    setUploading(true); setUploadMsg('');
    try {
      const fd = new FormData();
      fd.append('bill', billFile);
      const r = await fetch(`/api/vendor-portal/purchase-orders/${po.orderId}/upload-bill`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      const data = await r.json();
      if (data.success) {
        setBills(prev => [...prev, data.bill]);
        setBillFile(null);
        if (fileRef.current) fileRef.current.value = '';
        setUploadMsg('Bill uploaded successfully.');
      } else {
        setUploadMsg(data.error || 'Upload failed.');
      }
    } catch { setUploadMsg('Upload failed. Please try again.'); }
    setUploading(false);
  };

  const poPayments = payments.filter(p =>
    String(p.poId || p.purchaseOrderId || p.orderId || '') === String(po.orderId) ||
    String(p.reference || '').includes(po.poNumber)
  );

  const calcRow = it => {
    const base = (it.qty || 0) * (it.rate || 0);
    const gst  = base * (it.gstPercent || 0) / 100;
    return { base, gst, total: base + gst };
  };

  const sec = { marginBottom:18 };
  const secHead = title => (
    <div style={{ fontSize:12, fontWeight:700, color:P, borderBottom:`2px solid ${P}`, paddingBottom:4, marginBottom:8, fontFamily:F }}>{title}</div>
  );

  return (
    <div style={{ position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.5)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
      <div style={{ background:'#fff', width:'100%', maxWidth:820, maxHeight:'92vh', display:'flex', flexDirection:'column', borderRadius:10, overflow:'hidden', boxShadow:'0 20px 60px rgba(0,0,0,0.3)', fontFamily:F }}>

        {/* Header */}
        <div style={{ background:'linear-gradient(135deg,#1E293B,#2563EB)', padding:'14px 20px', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
          <div>
            <div style={{ fontSize:15, fontWeight:800, color:'#fff' }}>📋 {po.poNumber}</div>
            <div style={{ fontSize:11, color:'rgba(255,255,255,0.7)', marginTop:2 }}>Purchase Order Details</div>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <StatusBadge status={po.status} />
            <button onClick={onClose} style={{ background:'rgba(255,255,255,0.15)', border:'1px solid rgba(255,255,255,0.3)', color:'#fff', width:28, height:28, borderRadius:6, cursor:'pointer', fontSize:16, display:'flex', alignItems:'center', justifyContent:'center' }}>✕</button>
          </div>
        </div>

        {/* Body */}
        <div style={{ flex:1, overflowY:'auto', padding:'16px 20px' }}>

          {/* PO Summary */}
          <div style={{ ...sec, display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10 }}>
            {[
              ['PO Date',       fmtDate(po.date)],
              ['Delivery Date', fmtDate(po.deliveryDate)],
              ['Payment Terms', po.paymentTerms || '—'],
            ].map(([l,v]) => (
              <div key={l} style={{ background:'#F8FAFC', border:`1px solid ${BD}`, borderRadius:6, padding:'8px 12px' }}>
                <div style={{ fontSize:10, color:'#6B7280', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:3 }}>{l}</div>
                <div style={{ fontSize:13, fontWeight:600, color:'#1E293B' }}>{v}</div>
              </div>
            ))}
          </div>

          {/* Items */}
          <div style={sec}>
            {secHead(`Items (${po.items.length})`)}
            {po.items.length === 0
              ? <div style={{ padding:12, color:'#94A3B8', fontSize:12, textAlign:'center' }}>No items in this PO.</div>
              : (
              <div style={{ overflowX:'auto', border:`1px solid ${BD}`, borderRadius:4 }}>
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
                  <thead>
                    <tr>
                      <TH>#</TH>
                      <TH>Item Name</TH>
                      <TH>HSN</TH>
                      <TH right>Qty</TH>
                      <TH>Unit</TH>
                      <TH right>Rate ₹</TH>
                      <TH right>GST%</TH>
                      <TH right>Amount ₹</TH>
                    </tr>
                  </thead>
                  <tbody>
                    {po.items.map((it, i) => {
                      const r = calcRow(it);
                      return (
                        <tr key={i} style={{ background: i%2===0?'#fff':'#F8FAFC' }}>
                          <TD>{i+1}</TD>
                          <TD bold>
                            {it.itemName}
                            {it.description && <div style={{ fontSize:10, color:'#6B7280', marginTop:2 }}>{it.description}</div>}
                          </TD>
                          <TD>{it.hsnCode || '—'}</TD>
                          <TD right>{it.qty}</TD>
                          <TD>{it.unit}</TD>
                          <TD right>{fmtAmt(it.rate)}</TD>
                          <TD right>{it.gstPercent}%</TD>
                          <TD right bold color={P}>{fmtAmt(r.total)}</TD>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{ background:'#EFF6FF' }}>
                      <td colSpan={7} style={{ padding:'6px 10px', fontSize:12, fontWeight:700, textAlign:'right', fontFamily:F }}>Grand Total</td>
                      <td style={{ padding:'6px 10px', fontSize:13, fontWeight:800, textAlign:'right', color:P, fontFamily:F }}>{fmtAmt(po.totalAmount)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>

          {/* PO Attachments */}
          <div style={sec}>
            {secHead(`PO Attachments (${po.attachments.length})`)}
            {po.attachments.length === 0
              ? <div style={{ padding:12, color:'#94A3B8', fontSize:12, textAlign:'center' }}>No attachments on this PO.</div>
              : (
              <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                {po.attachments.map((a, i) => (
                  <div key={i} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 12px', background:'#F8FAFC', border:`1px solid ${BD}`, borderRadius:6 }}>
                    <span style={{ fontSize:18 }}>📎</span>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:12, fontWeight:600, color:'#1E293B' }}>{a.name || a.fileName}</div>
                      {a.size > 0 && <div style={{ fontSize:10, color:'#6B7280' }}>{fmtSize(a.size)}</div>}
                    </div>
                    <a href={downloadUrl('attachment', a.fileName)} target="_blank" rel="noreferrer"
                      style={{ padding:'5px 12px', background:P, color:'#fff', borderRadius:5, fontSize:11, fontWeight:600, textDecoration:'none', fontFamily:F }}>
                      ⬇ Download
                    </a>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Advance Payments */}
          <div style={sec}>
            {secHead('Advance Payments')}
            {poPayments.length === 0
              ? <div style={{ padding:12, color:'#94A3B8', fontSize:12, textAlign:'center' }}>No advance payments recorded for this PO.</div>
              : (
              <table style={{ width:'100%', borderCollapse:'collapse', border:`1px solid ${BD}`, borderRadius:4, overflow:'hidden' }}>
                <thead>
                  <tr><TH>Date</TH><TH>Description</TH><TH>Mode</TH><TH right>Amount ₹</TH><TH>Status</TH></tr>
                </thead>
                <tbody>
                  {poPayments.map((p,i)=>(
                    <tr key={i} style={{ background:i%2===0?'#fff':'#F8FAFC' }}>
                      <TD>{fmtDate(p.date||p.createdAt)}</TD>
                      <TD>{p.description||p.narration||'—'}</TD>
                      <TD>{p.mode||p.paymentMode||'—'}</TD>
                      <TD right bold color={G}>{fmtAmt(p.amount)}</TD>
                      <TD><StatusBadge status={p.status}/></TD>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Upload Your Bill */}
          <div style={sec}>
            {secHead('Upload Your Invoice / Bill')}
            <div style={{ background:'#FFFBEB', border:'1px dashed #F59E0B', borderRadius:8, padding:'14px 16px', marginBottom:12 }}>
              <div style={{ fontSize:11, color:'#78350F', marginBottom:10, fontWeight:600 }}>Upload your invoice or bill for this PO. Accepted: PDF, JPG, PNG, Excel, Word</div>
              <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
                <input ref={fileRef} type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.xlsx,.xls,.doc,.docx"
                  onChange={e => setBillFile(e.target.files[0] || null)}
                  style={{ fontSize:12, fontFamily:F, flex:1, minWidth:0 }}
                />
                <button onClick={uploadBill} disabled={!billFile || uploading}
                  style={{ padding:'6px 18px', background:billFile&&!uploading?G:'#9CA3AF', color:'#fff', border:'none', borderRadius:6, cursor:billFile&&!uploading?'pointer':'default', fontSize:12, fontWeight:700, fontFamily:F, whiteSpace:'nowrap' }}>
                  {uploading ? 'Uploading…' : '⬆ Upload'}
                </button>
              </div>
              {uploadMsg && <div style={{ marginTop:8, fontSize:11, color: uploadMsg.includes('success') ? G : R, fontWeight:600 }}>{uploadMsg}</div>}
            </div>

            {/* Bills list */}
            {bills.length > 0 && (
              <div>
                <div style={{ fontSize:11, fontWeight:700, color:'#374151', marginBottom:6 }}>Your Uploaded Bills ({bills.length})</div>
                <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                  {bills.map((b, i) => (
                    <div key={i} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 12px', background:'#F0FDF4', border:`1px solid #A7F3D0`, borderRadius:6 }}>
                      <span style={{ fontSize:18 }}>🧾</span>
                      <div style={{ flex:1 }}>
                        <div style={{ fontSize:12, fontWeight:600, color:'#065F46' }}>{b.originalName}</div>
                        <div style={{ fontSize:10, color:'#6B7280' }}>{fmtSize(b.size)} · {fmtDate(b.uploadedAt?.slice(0,10))}</div>
                      </div>
                      <a href={downloadUrl('bills', b.fileName)} target="_blank" rel="noreferrer"
                        style={{ padding:'5px 12px', background:G, color:'#fff', borderRadius:5, fontSize:11, fontWeight:600, textDecoration:'none', fontFamily:F }}>
                        ⬇ Download
                      </a>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}

/* ════════════════════════ MAIN PORTAL ════════════════════════ */
export default function VendorPortal() {
  const { vendor, vendorLogout } = useVendorAuth();
  const [tab,      setTab]      = useState('pos');
  const [pos,      setPOs]      = useState([]);
  const [payments, setPayments] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [selectedPO, setSelectedPO] = useState(null);

  const token = localStorage.getItem('vendorToken') || '';

  useEffect(() => {
    const headers = { Authorization: `Bearer ${token}` };
    setLoading(true);
    Promise.all([
      axios.get('/api/vendor-portal/purchase-orders', { headers }),
      axios.get('/api/vendor-portal/payments',        { headers }),
    ])
      .then(([poRes, payRes]) => { setPOs(poRes.data || []); setPayments(payRes.data || []); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [token]);

  const kpis = {
    totalPOs:  pos.length,
    pending:   pos.filter(p => p.status === 'pending' || p.status === 'draft').length,
    completed: pos.filter(p => p.status === 'completed' || p.status === 'approved').length,
    totalPaid: payments.reduce((s, p) => s + (Number(p.amount) || 0), 0),
  };

  if (vendor?.pending) return <ActivationPending vendor={vendor} vendorLogout={vendorLogout} />;

  return (
    <div style={{ fontFamily:F, background:BG, minHeight:'100vh', display:'flex', flexDirection:'column' }}>

      {selectedPO && (
        <PODetailPanel
          po={selectedPO}
          token={token}
          payments={payments}
          onClose={() => setSelectedPO(null)}
        />
      )}

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
          { label:'Pending',        value:kpis.pending,   color:'#D97706', icon:'⏳' },
          { label:'Completed',      value:kpis.completed, color:G,         icon:'✅' },
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
                  <div style={{ padding:'10px 14px', background:'#F8FAFC', borderBottom:`1px solid ${BD}`, fontSize:11, color:'#6B7280', fontFamily:F }}>
                    Click <strong>View Details</strong> on any PO to see items, download spec attachments, and upload your invoice.
                  </div>
                  <table style={{ width:'100%', borderCollapse:'collapse' }}>
                    <thead>
                      <tr>
                        {['PO Number','Date','Total Amount','Status',''].map(h => (
                          <th key={h} style={{ padding:'9px 12px', background:P, color:'#fff', fontSize:11, fontWeight:700, textAlign: h==='Total Amount'?'right':'left', fontFamily:F }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {pos.map((po, i) => (
                        <tr key={i} style={{ background: i%2===0?'#fff':'#FAFBFC' }}
                          onMouseEnter={e => e.currentTarget.style.background='#EFF6FF'}
                          onMouseLeave={e => e.currentTarget.style.background=i%2===0?'#fff':'#FAFBFC'}>
                          <td style={{ padding:'10px 12px', fontSize:12, fontFamily:F, borderBottom:`1px solid ${BD}`, fontWeight:700, color:P }}>{po.poNumber}</td>
                          <td style={{ padding:'10px 12px', fontSize:12, fontFamily:F, borderBottom:`1px solid ${BD}` }}>{fmtDate(po.date)}</td>
                          <td style={{ padding:'10px 12px', fontSize:13, fontFamily:F, borderBottom:`1px solid ${BD}`, textAlign:'right', fontWeight:700, color:G }}>{fmtAmt(po.totalAmount)}</td>
                          <td style={{ padding:'10px 12px', fontSize:12, fontFamily:F, borderBottom:`1px solid ${BD}` }}><StatusBadge status={po.status} /></td>
                          <td style={{ padding:'10px 12px', fontSize:12, fontFamily:F, borderBottom:`1px solid ${BD}`, textAlign:'center' }}>
                            <button onClick={() => setSelectedPO(po)}
                              style={{ padding:'5px 14px', background:P, color:'#fff', border:'none', borderRadius:5, cursor:'pointer', fontSize:11, fontWeight:700, fontFamily:F }}>
                              View Details
                            </button>
                          </td>
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
                        {['Date','Description','Amount','Mode','Status'].map(h => (
                          <th key={h} style={{ padding:'9px 12px', background:P, color:'#fff', fontSize:11, fontWeight:700, textAlign:'left', fontFamily:F }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {payments.map((p, i) => (
                        <tr key={i} style={{ background: i%2===0?'#fff':'#FAFBFC' }}>
                          <td style={{ padding:'10px 12px', fontSize:12, fontFamily:F, borderBottom:`1px solid ${BD}` }}>{fmtDate(p.date || p.createdAt)}</td>
                          <td style={{ padding:'10px 12px', fontSize:12, fontFamily:F, borderBottom:`1px solid ${BD}` }}>{p.description || p.narration || '—'}</td>
                          <td style={{ padding:'10px 12px', fontSize:13, fontFamily:F, borderBottom:`1px solid ${BD}`, fontWeight:700, color:G }}>₹ {Number(p.amount || 0).toLocaleString('en-IN')}</td>
                          <td style={{ padding:'10px 12px', fontSize:12, fontFamily:F, borderBottom:`1px solid ${BD}` }}>{p.mode || p.paymentMode || '—'}</td>
                          <td style={{ padding:'10px 12px', fontSize:12, fontFamily:F, borderBottom:`1px solid ${BD}` }}><StatusBadge status={p.status} /></td>
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
                    ['Email',      vendor?.email],
                    ['Company ID', vendor?.companyId],
                    ['Vendor ID',  vendor?.vendorId],
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
