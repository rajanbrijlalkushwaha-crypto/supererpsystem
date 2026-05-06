import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { useVendorAuth } from '../../context/VendorAuthContext';

const F  = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const P  = '#1D4ED8';
const BG = '#F1F5F9';
const BD = '#E2E8F0';
const G  = '#059669';
const R  = '#DC2626';
const O  = '#D97706';

const STATUS = {
  approved:  { bg:'#ECFDF5', color:'#059669', label:'Approved' },
  pending:   { bg:'#FFFBEB', color:'#D97706', label:'Pending' },
  draft:     { bg:'#EFF6FF', color:'#2563EB', label:'Draft' },
  completed: { bg:'#F0FDF4', color:'#16A34A', label:'Completed' },
  cancelled: { bg:'#FEF2F2', color:'#DC2626', label:'Cancelled' },
  submitted: { bg:'#F5F3FF', color:'#7C3AED', label:'Submitted' },
  paid:      { bg:'#ECFDF5', color:'#059669', label:'Paid' },
};
const Badge = ({ s }) => {
  const c = STATUS[s] || { bg:'#F1F5F9', color:'#64748B', label: s || 'Unknown' };
  return <span style={{ padding:'2px 9px', borderRadius:20, fontSize:10, fontWeight:700, background:c.bg, color:c.color, fontFamily:F, whiteSpace:'nowrap' }}>{c.label}</span>;
};

const fmt  = n => `₹ ${Number(n||0).toLocaleString('en-IN', { minimumFractionDigits:2 })}`;
const fmtD = d => { if (!d) return '—'; const s=String(d).slice(0,10); const [y,m,dy]=s.split('-'); return `${dy}-${m}-${y}`; };
const fmtSz= b => b>1048576?`${(b/1048576).toFixed(1)} MB`:`${Math.round(b/1024)} KB`;
const fileIcon = n => { const e=(n||'').split('.').pop().toLowerCase(); return e==='pdf'?'📄':['jpg','jpeg','png'].includes(e)?'🖼':['xlsx','xls'].includes(e)?'📊':['doc','docx'].includes(e)?'📝':'📎'; };

/* ─── Create Bill Modal ─── */
function CreateBillModal({ po, token, onClose, onCreated }) {
  const [form, setForm]   = useState({ invoiceNo:'', invoiceDate:'', description:'', netAmount:'', gstPercent: po.items[0]?.gstPercent ?? 18, notes:'' });
  const [file, setFile]   = useState(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr]     = useState('');
  const fileRef = useRef();

  const net   = parseFloat(form.netAmount) || 0;
  const gstP  = parseFloat(form.gstPercent) || 0;
  const gstA  = parseFloat((net * gstP / 100).toFixed(2));
  const total = parseFloat((net + gstA).toFixed(2));

  const setF = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const submit = async () => {
    if (!form.invoiceNo.trim())   { setErr('Invoice number is required.'); return; }
    if (!form.invoiceDate)        { setErr('Invoice date is required.'); return; }
    if (!net)                     { setErr('Net amount is required.'); return; }
    setSaving(true); setErr('');
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k,v]) => fd.append(k, v));
      fd.append('gstAmount', gstA);
      fd.append('totalAmount', total);
      if (file) fd.append('billFile', file);
      const r = await fetch(`/api/vendor-portal/purchase-orders/${po.orderId}/create-bill`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      const data = await r.json();
      if (data.success) { onCreated(data.bill); }
      else setErr(data.error || 'Failed to submit bill.');
    } catch { setErr('Network error. Please try again.'); }
    setSaving(false);
  };

  const inp = (k, type='text', placeholder='') => (
    <input type={type} value={form[k]} onChange={e=>setF(k,e.target.value)} placeholder={placeholder}
      style={{ width:'100%', height:32, padding:'0 10px', border:`1px solid ${BD}`, borderRadius:5, fontSize:12, fontFamily:F, boxSizing:'border-box', outline:'none' }}
      onFocus={e=>e.target.style.borderColor=P} onBlur={e=>e.target.style.borderColor=BD}
    />
  );
  const lbl = (t, req) => <div style={{ fontSize:11, fontWeight:600, color:'#374151', marginBottom:4 }}>{t}{req&&<span style={{color:R}}> *</span>}</div>;
  const row2 = (children) => <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>{children}</div>;

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', zIndex:2000, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
      <div style={{ background:'#fff', width:'100%', maxWidth:560, borderRadius:10, overflow:'hidden', boxShadow:'0 20px 60px rgba(0,0,0,0.35)', fontFamily:F }}>
        <div style={{ background:`linear-gradient(135deg,#1E293B,${P})`, padding:'14px 20px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div>
            <div style={{ fontSize:14, fontWeight:800, color:'#fff' }}>🧾 Create Bill / Invoice</div>
            <div style={{ fontSize:11, color:'rgba(255,255,255,0.7)', marginTop:2 }}>for {po.poNumber}</div>
          </div>
          <button onClick={onClose} style={{ background:'rgba(255,255,255,0.15)', border:'1px solid rgba(255,255,255,0.3)', color:'#fff', width:28, height:28, borderRadius:6, cursor:'pointer', fontSize:16 }}>✕</button>
        </div>

        <div style={{ padding:'18px 20px', display:'flex', flexDirection:'column', gap:12 }}>
          {row2(
            <>
              <div>{lbl('Invoice No.', true)}{inp('invoiceNo','text','e.g. INV-2026-001')}</div>
              <div>{lbl('Invoice Date', true)}{inp('invoiceDate','date')}</div>
            </>
          )}

          <div>{lbl('Description / Work Done', false)}
            <textarea value={form.description} onChange={e=>setF('description',e.target.value)} placeholder="Describe the goods / work supplied…" rows={2}
              style={{ width:'100%', padding:'6px 10px', border:`1px solid ${BD}`, borderRadius:5, fontSize:12, fontFamily:F, resize:'vertical', outline:'none', boxSizing:'border-box' }}
              onFocus={e=>e.target.style.borderColor=P} onBlur={e=>e.target.style.borderColor=BD}/>
          </div>

          {row2(
            <>
              <div>{lbl('Net / Taxable Amount (₹)', true)}{inp('netAmount','number','0.00')}</div>
              <div>
                {lbl('GST %', false)}
                <select value={form.gstPercent} onChange={e=>setF('gstPercent',e.target.value)}
                  style={{ width:'100%', height:32, padding:'0 8px', border:`1px solid ${BD}`, borderRadius:5, fontSize:12, fontFamily:F, outline:'none' }}>
                  {[0,5,12,18,28].map(g=><option key={g} value={g}>{g}%</option>)}
                </select>
              </div>
            </>
          )}

          {/* Calculated totals */}
          {net > 0 && (
            <div style={{ background:'#F8FAFC', border:`1px solid ${BD}`, borderRadius:6, padding:'10px 14px', display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8 }}>
              {[['Net Amount', fmt(net), '#1E293B'], ['GST ('+gstP+'%)', fmt(gstA), O], ['Total Amount', fmt(total), G]].map(([l,v,c])=>(
                <div key={l} style={{ textAlign:'center' }}>
                  <div style={{ fontSize:10, color:'#6B7280', fontWeight:600 }}>{l}</div>
                  <div style={{ fontSize:13, fontWeight:800, color:c, marginTop:2 }}>{v}</div>
                </div>
              ))}
            </div>
          )}

          <div>
            {lbl('Attach Invoice PDF / Image (optional)', false)}
            <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.xlsx,.xls,.doc,.docx"
              onChange={e=>setFile(e.target.files[0]||null)}
              style={{ fontSize:11, fontFamily:F, width:'100%' }}/>
            {file && <div style={{ fontSize:10, color:G, marginTop:4 }}>Selected: {file.name} ({fmtSz(file.size)})</div>}
          </div>

          <div>{lbl('Notes / Remarks', false)}
            <textarea value={form.notes} onChange={e=>setF('notes',e.target.value)} placeholder="Any remarks for this bill…" rows={2}
              style={{ width:'100%', padding:'6px 10px', border:`1px solid ${BD}`, borderRadius:5, fontSize:12, fontFamily:F, resize:'vertical', outline:'none', boxSizing:'border-box' }}
              onFocus={e=>e.target.style.borderColor=P} onBlur={e=>e.target.style.borderColor=BD}/>
          </div>

          {err && <div style={{ padding:'8px 12px', background:'#FEF2F2', border:`1px solid #FCA5A5`, borderRadius:5, fontSize:12, color:R, fontWeight:600 }}>{err}</div>}

          <div style={{ display:'flex', gap:10, justifyContent:'flex-end', paddingTop:4 }}>
            <button onClick={onClose} style={{ padding:'7px 18px', borderRadius:6, border:`1px solid ${BD}`, background:'#fff', fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:F }}>Cancel</button>
            <button onClick={submit} disabled={saving}
              style={{ padding:'7px 22px', borderRadius:6, border:'none', background:saving?'#9CA3AF':G, color:'#fff', fontSize:12, fontWeight:700, cursor:saving?'default':'pointer', fontFamily:F }}>
              {saving ? 'Submitting…' : '✓ Submit Bill'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── PO Card ─── */
function POCard({ po, token, payments }) {
  const [expanded, setExpanded]   = useState(false);
  const [showBill, setShowBill]   = useState(false);
  const [bills, setBills]         = useState(po.vendorBills || []);

  const dlUrl = (type, fn) => `/api/vendor-portal/purchase-orders/${po.orderId}/${type}/${encodeURIComponent(fn)}?token=${token}`;

  const siteLine = [po.siteName, po.siteCity].filter(Boolean).join(', ') || (po.linkedSO ? `Linked SO: ${po.linkedSO}` : '—');

  const poPayments = payments.filter(p =>
    String(p.poId || p.purchaseOrderId || p.orderId || '') === String(po.orderId) ||
    String(p.reference || '').includes(po.poNumber)
  );
  const paidTotal = poPayments.reduce((s,p)=>s+(Number(p.amount)||0),0);

  const calcAmt = it => {
    const base = (it.qty||0)*(it.rate||0);
    return base + base*(it.gstPercent||0)/100;
  };

  return (
    <div style={{ background:'#fff', border:`1px solid ${BD}`, borderRadius:10, overflow:'hidden', boxShadow:'0 1px 4px rgba(0,0,0,0.06)', marginBottom:14 }}>

      {/* Card Header */}
      <div style={{ padding:'12px 16px', background:'#F8FAFC', borderBottom:`1px solid ${BD}`, display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
            <span style={{ fontSize:15, fontWeight:800, color:P, fontFamily:F }}>📋 {po.poNumber}</span>
            <Badge s={po.status}/>
          </div>
          {/* Site Name — prominent */}
          <div style={{ display:'flex', alignItems:'center', gap:5, marginTop:5 }}>
            <span style={{ fontSize:12 }}>📍</span>
            <span style={{ fontSize:12, fontWeight:600, color:'#374151', fontFamily:F }}>{siteLine}</span>
          </div>
        </div>
        <div style={{ textAlign:'right', flexShrink:0 }}>
          <div style={{ fontSize:18, fontWeight:800, color:G, fontFamily:F }}>{fmt(po.totalAmount)}</div>
          <div style={{ fontSize:10, color:'#6B7280', fontFamily:F }}>Date: {fmtD(po.date)} {po.deliveryDate?`· Delivery: ${fmtD(po.deliveryDate)}`:''}</div>
        </div>
      </div>

      {/* Quick info row */}
      <div style={{ padding:'8px 16px', display:'flex', gap:20, flexWrap:'wrap', alignItems:'center', borderBottom:`1px solid ${BD}` }}>
        <div style={{ fontSize:11, color:'#6B7280', fontFamily:F }}>
          <span style={{ fontWeight:600, color:'#374151' }}>{po.items.length}</span> items
          {po.paymentTerms && <> · Terms: <span style={{ fontWeight:600, color:'#374151' }}>{po.paymentTerms}</span></>}
          {paidTotal > 0 && <> · Paid: <span style={{ fontWeight:600, color:G }}>{fmt(paidTotal)}</span></>}
        </div>
        <div style={{ marginLeft:'auto', display:'flex', gap:8, flexWrap:'wrap' }}>
          <button onClick={()=>setExpanded(e=>!e)}
            style={{ padding:'5px 12px', border:`1px solid ${BD}`, background:expanded?P:'#fff', color:expanded?'#fff':'#374151', borderRadius:5, cursor:'pointer', fontSize:11, fontWeight:600, fontFamily:F }}>
            {expanded ? '▲ Hide Details' : '▼ View Details'}
          </button>
          <button onClick={()=>setShowBill(true)}
            style={{ padding:'5px 14px', border:'none', background:G, color:'#fff', borderRadius:5, cursor:'pointer', fontSize:11, fontWeight:700, fontFamily:F }}>
            🧾 Create Bill
          </button>
        </div>
      </div>

      {/* Attachments — always visible */}
      {po.attachments.length > 0 && (
        <div style={{ padding:'8px 16px', borderBottom:`1px solid ${BD}`, display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', background:'#FAFAFA' }}>
          <span style={{ fontSize:11, fontWeight:700, color:'#374151', fontFamily:F, whiteSpace:'nowrap' }}>📎 Attachments:</span>
          {po.attachments.map((a,i)=>(
            <a key={i} href={dlUrl('attachment', a.fileName)} target="_blank" rel="noreferrer"
              style={{ display:'inline-flex', alignItems:'center', gap:4, padding:'3px 10px', background:'#EFF6FF', border:`1px solid #BFDBFE`, borderRadius:20, fontSize:11, color:P, textDecoration:'none', fontWeight:600, fontFamily:F }}>
              {fileIcon(a.fileName)} {a.name || a.fileName} {a.size?<span style={{color:'#93C5FD',fontSize:9}}>({fmtSz(a.size)})</span>:''}
            </a>
          ))}
        </div>
      )}

      {/* Expanded: items + bills */}
      {expanded && (
        <div style={{ padding:'14px 16px' }}>

          {/* Items */}
          <div style={{ marginBottom:14 }}>
            <div style={{ fontSize:11, fontWeight:700, color:P, fontFamily:F, marginBottom:6, borderBottom:`1px solid ${BD}`, paddingBottom:3 }}>Items</div>
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11, fontFamily:F }}>
                <thead>
                  <tr style={{ background:P }}>
                    {['#','Item','HSN','Qty','Unit','Rate','GST%','Amount'].map((h,i)=>(
                      <th key={i} style={{ padding:'5px 8px', color:'#fff', fontWeight:700, textAlign:i>=3?'right':'left', whiteSpace:'nowrap', borderRight:'1px solid #3B82F6' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {po.items.map((it,i)=>(
                    <tr key={i} style={{ background:i%2===0?'#fff':'#F8FAFC' }}>
                      <td style={{ padding:'5px 8px', border:`1px solid ${BD}`, color:'#9CA3AF' }}>{i+1}</td>
                      <td style={{ padding:'5px 8px', border:`1px solid ${BD}`, fontWeight:600, color:'#1E293B' }}>
                        {it.itemName}
                        {it.description&&<div style={{fontSize:9,color:'#6B7280'}}>{it.description}</div>}
                      </td>
                      <td style={{ padding:'5px 8px', border:`1px solid ${BD}`, color:'#6B7280' }}>{it.hsnCode||'—'}</td>
                      <td style={{ padding:'5px 8px', border:`1px solid ${BD}`, textAlign:'right' }}>{it.qty}</td>
                      <td style={{ padding:'5px 8px', border:`1px solid ${BD}` }}>{it.unit}</td>
                      <td style={{ padding:'5px 8px', border:`1px solid ${BD}`, textAlign:'right' }}>{fmt(it.rate)}</td>
                      <td style={{ padding:'5px 8px', border:`1px solid ${BD}`, textAlign:'right' }}>{it.gstPercent}%</td>
                      <td style={{ padding:'5px 8px', border:`1px solid ${BD}`, textAlign:'right', fontWeight:700, color:P }}>{fmt(calcAmt(it))}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ background:'#EFF6FF' }}>
                    <td colSpan={7} style={{ padding:'5px 8px', fontWeight:700, textAlign:'right', fontSize:12, fontFamily:F }}>Grand Total</td>
                    <td style={{ padding:'5px 8px', fontWeight:800, textAlign:'right', color:P, fontSize:13, fontFamily:F }}>{fmt(po.totalAmount)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Submitted Bills */}
          {bills.length > 0 && (
            <div>
              <div style={{ fontSize:11, fontWeight:700, color:P, fontFamily:F, marginBottom:6, borderBottom:`1px solid ${BD}`, paddingBottom:3 }}>Your Bills ({bills.length})</div>
              <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                {bills.map((b,i)=>(
                  <div key={i} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 12px', background:'#F0FDF4', border:`1px solid #A7F3D0`, borderRadius:6 }}>
                    <span style={{ fontSize:18 }}>🧾</span>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:12, fontWeight:700, color:'#065F46' }}>Invoice #{b.invoiceNo} — {fmtD(b.invoiceDate)}</div>
                      <div style={{ fontSize:11, color:'#374151', marginTop:2 }}>{b.description || '—'}</div>
                      <div style={{ fontSize:10, color:'#6B7280', marginTop:1 }}>
                        Net: {fmt(b.netAmount)} · GST {b.gstPercent}%: {fmt(b.gstAmount)} · <strong>Total: {fmt(b.totalAmount)}</strong>
                        {b.submittedAt && ` · Submitted: ${fmtD(b.submittedAt?.slice(0,10))}`}
                      </div>
                    </div>
                    <div style={{ display:'flex', gap:6, alignItems:'center', flexShrink:0 }}>
                      <Badge s={b.status||'submitted'}/>
                      {b.fileName && (
                        <a href={dlUrl('bills', b.fileName)} target="_blank" rel="noreferrer"
                          style={{ padding:'4px 10px', background:G, color:'#fff', borderRadius:4, fontSize:10, fontWeight:700, textDecoration:'none', fontFamily:F }}>
                          ⬇ PDF
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {showBill && (
        <CreateBillModal
          po={po}
          token={token}
          onClose={()=>setShowBill(false)}
          onCreated={bill=>{setBills(prev=>[...prev,bill]);setShowBill(false);setExpanded(true);}}
        />
      )}
    </div>
  );
}

/* ════════════════════════ ACTIVATION PENDING ════════════════════════ */
function ActivationPending({ vendor, vendorLogout }) {
  return (
    <div style={{ fontFamily:F, background:'linear-gradient(135deg,#1E293B,#2563EB)', minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}>
      <div style={{ background:'#fff', borderRadius:16, boxShadow:'0 24px 60px rgba(0,0,0,0.3)', width:'100%', maxWidth:480, overflow:'hidden' }}>
        <div style={{ background:'linear-gradient(135deg,#1E293B,#2563EB)', padding:'24px 28px' }}>
          <div style={{ fontSize:11, color:'rgba(255,255,255,0.6)', fontWeight:600, letterSpacing:'1.5px', textTransform:'uppercase', marginBottom:6 }}>Epsilon Enterprise</div>
          <div style={{ fontSize:20, fontWeight:800, color:'#fff' }}>Vendor Portal</div>
        </div>
        <div style={{ padding:'32px 28px', textAlign:'center' }}>
          <div style={{ fontSize:48, marginBottom:12 }}>⏳</div>
          <div style={{ fontSize:18, fontWeight:800, color:'#1E293B', marginBottom:8 }}>Activation In Progress</div>
          <div style={{ fontSize:13, color:'#64748B', lineHeight:1.7, marginBottom:20 }}>
            Welcome, <strong>{vendor?.name}</strong>! Your registration is under review. You'll be notified once activated.
          </div>
          {vendor?.trackingNo && (
            <div style={{ background:'#EFF6FF', border:'2px dashed #93C5FD', borderRadius:8, padding:'14px', marginBottom:20 }}>
              <div style={{ fontSize:10, color:P, fontWeight:700, letterSpacing:'2px', textTransform:'uppercase', marginBottom:4 }}>Tracking No.</div>
              <div style={{ fontSize:18, fontWeight:900, color:'#1D4ED8', letterSpacing:3 }}>{vendor.trackingNo}</div>
            </div>
          )}
          <button onClick={vendorLogout} style={{ width:'100%', padding:'10px 0', borderRadius:8, cursor:'pointer', background:'#fff', border:'1px solid #D1D5DB', color:'#374151', fontSize:13, fontWeight:600, fontFamily:F }}>Sign Out</button>
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
  const token = localStorage.getItem('vendorToken') || '';

  useEffect(() => {
    const headers = { Authorization: `Bearer ${token}` };
    setLoading(true);
    Promise.all([
      axios.get('/api/vendor-portal/purchase-orders', { headers }),
      axios.get('/api/vendor-portal/payments',        { headers }),
    ])
      .then(([r1,r2])=>{ setPOs(r1.data||[]); setPayments(r2.data||[]); })
      .catch(console.error)
      .finally(()=>setLoading(false));
  }, [token]);

  if (vendor?.pending) return <ActivationPending vendor={vendor} vendorLogout={vendorLogout}/>;

  const kpis = [
    { label:'My POs',       val: pos.length,                                        icon:'📋', color:P        },
    { label:'Pending',      val: pos.filter(p=>p.status==='pending'||p.status==='draft').length, icon:'⏳', color:O },
    { label:'Completed',    val: pos.filter(p=>p.status==='completed'||p.status==='approved').length, icon:'✅', color:G },
    { label:'Amt Received', val: `₹ ${payments.reduce((s,p)=>s+(Number(p.amount)||0),0).toLocaleString('en-IN')}`, icon:'💰', color:'#7C3AED' },
  ];

  return (
    <div style={{ fontFamily:F, background:BG, minHeight:'100vh', display:'flex', flexDirection:'column' }}>

      {/* Header */}
      <div style={{ background:'linear-gradient(135deg,#1E293B,#1D4ED8)', padding:'11px 24px', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <div style={{ fontSize:12, fontWeight:700, color:'#fff', background:'rgba(255,255,255,0.12)', padding:'5px 10px', borderRadius:6 }}>🏢 Epsilon Enterprise</div>
          <div style={{ fontSize:12, color:'rgba(255,255,255,0.7)' }}>Vendor Portal</div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ textAlign:'right' }}>
            <div style={{ fontSize:13, fontWeight:700, color:'#fff' }}>{vendor?.name}</div>
            <div style={{ fontSize:10, color:'rgba(255,255,255,0.6)' }}>ID: {vendor?.vendorId}</div>
          </div>
          <button onClick={vendorLogout} style={{ padding:'5px 12px', borderRadius:6, cursor:'pointer', background:'rgba(255,255,255,0.1)', border:'1px solid rgba(255,255,255,0.25)', color:'#fff', fontSize:12, fontFamily:F }}>Logout</button>
        </div>
      </div>

      {/* KPI */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', background:'#fff', borderBottom:`1px solid ${BD}`, flexShrink:0 }}>
        {kpis.map((k,i)=>(
          <div key={i} style={{ padding:'12px 18px', borderRight:i<3?`1px solid ${BD}`:'none' }}>
            <div style={{ fontSize:11, color:'#6B7280', fontWeight:600 }}>{k.icon} {k.label}</div>
            <div style={{ fontSize:20, fontWeight:800, color:k.color, marginTop:2 }}>{k.val}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ background:'#fff', borderBottom:`1px solid ${BD}`, display:'flex', padding:'0 20px', flexShrink:0 }}>
        {[{id:'pos',label:'📋 Purchase Orders'},{id:'payments',label:'💰 Payments'},{id:'profile',label:'👤 Profile'}].map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)} style={{ padding:'10px 16px', cursor:'pointer', fontFamily:F, fontWeight:tab===t.id?700:500, fontSize:12, background:'transparent', border:'none', borderBottom:tab===t.id?`2px solid ${P}`:'2px solid transparent', color:tab===t.id?P:'#64748B', marginBottom:-1 }}>{t.label}</button>
        ))}
      </div>

      {/* Body */}
      <div style={{ flex:1, padding:'16px 20px', overflowY:'auto' }}>
        {loading ? (
          <div style={{ textAlign:'center', padding:60, color:'#94A3B8', fontSize:14 }}>Loading…</div>
        ) : (
          <>
            {/* PO Cards */}
            {tab === 'pos' && (
              pos.length === 0
                ? <div style={{ textAlign:'center', padding:60, color:'#94A3B8', fontSize:13 }}>No purchase orders found for your account.</div>
                : pos.map(po => <POCard key={po.orderId} po={po} token={token} payments={payments}/>)
            )}

            {/* Payments */}
            {tab === 'payments' && (
              payments.length === 0
                ? <div style={{ textAlign:'center', padding:60, color:'#94A3B8', fontSize:13 }}>No payment records found.</div>
                : (
                <div style={{ background:'#fff', borderRadius:8, border:`1px solid ${BD}`, overflow:'hidden' }}>
                  <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                    <thead>
                      <tr>
                        {['Date','Description','Amount','Mode','Status'].map(h=>(
                          <th key={h} style={{ padding:'9px 12px', background:P, color:'#fff', fontSize:11, fontWeight:700, textAlign:'left', fontFamily:F }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {payments.map((p,i)=>(
                        <tr key={i} style={{ background:i%2===0?'#fff':'#F8FAFC' }}>
                          <td style={{ padding:'9px 12px', borderBottom:`1px solid ${BD}`, fontFamily:F }}>{fmtD(p.date||p.createdAt)}</td>
                          <td style={{ padding:'9px 12px', borderBottom:`1px solid ${BD}`, fontFamily:F }}>{p.description||p.narration||'—'}</td>
                          <td style={{ padding:'9px 12px', borderBottom:`1px solid ${BD}`, fontWeight:700, color:G, fontFamily:F }}>₹ {Number(p.amount||0).toLocaleString('en-IN')}</td>
                          <td style={{ padding:'9px 12px', borderBottom:`1px solid ${BD}`, fontFamily:F }}>{p.mode||p.paymentMode||'—'}</td>
                          <td style={{ padding:'9px 12px', borderBottom:`1px solid ${BD}`, fontFamily:F }}><Badge s={p.status}/></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            )}

            {/* Profile */}
            {tab === 'profile' && (
              <div style={{ maxWidth:480, background:'#fff', borderRadius:10, border:`1px solid ${BD}`, overflow:'hidden' }}>
                <div style={{ background:P, padding:'14px 18px' }}>
                  <div style={{ fontSize:14, fontWeight:700, color:'#fff' }}>{vendor?.name}</div>
                  <div style={{ fontSize:11, color:'rgba(255,255,255,0.7)', marginTop:2 }}>Vendor ID: {vendor?.vendorId}</div>
                </div>
                <div style={{ padding:'14px 18px' }}>
                  {[['Email',vendor?.email],['Company ID',vendor?.companyId],['Vendor ID',vendor?.vendorId]].map(([l,v])=>(
                    <div key={l} style={{ display:'flex', padding:'8px 0', borderBottom:`1px solid #F1F5F9` }}>
                      <span style={{ fontSize:12, color:'#6B7280', fontWeight:600, minWidth:130 }}>{l}</span>
                      <span style={{ fontSize:12, color:'#1E293B' }}>{v||'—'}</span>
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
