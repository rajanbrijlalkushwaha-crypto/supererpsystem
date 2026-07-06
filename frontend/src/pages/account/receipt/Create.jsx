import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { useCompany } from '../../../context/CompanyContext';

const PAYMENT_MODES = ['Bank Transfer','NEFT','RTGS','Cheque','UPI','Cash'];
const BANK_MODES    = ['Bank Transfer','Cheque','NEFT','RTGS'];
const P   = '#104f4f';
const PD  = '#0b3d3d';
const BD  = '#E5EAF2';
const F   = "'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif";
const fmt = n => (parseFloat(n)||0).toLocaleString('en-IN', { minimumFractionDigits: 2 });

const getOrderTotal = (o) => {
  if (!o) return 0;
  if (o.grandTotal) return parseFloat(o.grandTotal)||0;
  const items = (o.items||[]).reduce((s,it) => {
    const base = (parseFloat(it.qty||it.quantity)||0)*(parseFloat(it.rate)||0);
    const disc = it.discountType==='%' ? base*(parseFloat(it.discount)||0)/100 : (parseFloat(it.discount)||0);
    const tax  = (base-disc)*(parseFloat(it.gstPercent||it.gst||0))/100;
    return s + base - disc + tax;
  }, 0);
  const chg = (o.charges||[]).reduce((s,c)=>{ const a=parseFloat(c.amount)||0; return s+a+a*(parseFloat(c.gst)||0)/100; },0);
  const freight = parseFloat(o.freightCharges)||0;
  const packing = parseFloat(o.packingCharges)||0;
  const disc    = parseFloat(o.overallDiscount)||0;
  const round   = parseFloat(o.roundOff)||0;
  const sub = items+chg+freight+packing;
  return +(sub - sub*disc/100 + round).toFixed(2);
};

const inp = (ro=false,ex={}) => ({
  width:'100%', height:34, padding:'0 10px', border:`1px solid ${BD}`, borderRadius:6,
  fontSize:13, fontFamily:F, outline:'none', boxSizing:'border-box',
  background: ro ? '#f9fafb' : '#fff', color: ro ? '#6b7280' : '#111827', ...ex,
});
const lbl = { fontSize:11, fontWeight:700, color:'#374151', marginBottom:4, display:'block' };
const card = (mb=14) => ({ background:'#fff', border:`1px solid ${BD}`, borderRadius:10, overflow:'hidden', boxShadow:'0 1px 3px rgba(0,0,0,0.06)', marginBottom:mb });
const SH   = (col=P) => ({ background:col, padding:'9px 16px', fontSize:11, fontWeight:800, color:'#fff', textTransform:'uppercase', letterSpacing:'0.8px' });

/* ── Client search popup ── */
function ClientPopup({ clients, onSelect, onClose }) {
  const [q, setQ] = useState('');
  const ref = useRef(); useEffect(() => ref.current?.focus(), []);
  const list = q.trim() ? clients.filter(c =>
    `${c.clientName||''} ${c.companyName||''} ${c.city||''} ${c.gstin||''}`.toLowerCase().includes(q.toLowerCase())
  ) : clients;
  return (
    <div onClick={e=>e.target===e.currentTarget&&onClose()} style={{ position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',backdropFilter:'blur(2px)',zIndex:9000,display:'flex',alignItems:'center',justifyContent:'center',padding:16 }}>
      <div style={{ background:'#fff',borderRadius:12,width:'100%',maxWidth:660,maxHeight:'80vh',display:'flex',flexDirection:'column',boxShadow:'0 20px 60px rgba(0,0,0,0.25)' }}>
        <div style={{ background:P,color:'#fff',padding:'13px 18px',borderRadius:'12px 12px 0 0',display:'flex',justifyContent:'space-between',alignItems:'center',flexShrink:0 }}>
          <span style={{ fontSize:14,fontWeight:800,fontFamily:F }}>Select Client</span>
          <button onClick={onClose} style={{ background:'rgba(255,255,255,0.15)',border:'1px solid rgba(255,255,255,0.3)',borderRadius:6,color:'#fff',width:28,height:28,cursor:'pointer',fontSize:16 }}>✕</button>
        </div>
        <div style={{ padding:'10px 14px',borderBottom:`1px solid ${BD}`,flexShrink:0 }}>
          <input ref={ref} value={q} onChange={e=>setQ(e.target.value)} placeholder="Search client name, city, GST…" style={inp()} />
        </div>
        <div style={{ flex:1,overflowY:'auto' }}>
          {list.map((c,i) => (
            <div key={c.clientId||i} onClick={()=>{onSelect(c);onClose();}}
              style={{ padding:'10px 16px',borderBottom:`1px solid ${BD}`,cursor:'pointer',fontFamily:F }}
              onMouseEnter={e=>e.currentTarget.style.background='#eff6ff'}
              onMouseLeave={e=>e.currentTarget.style.background='#fff'}>
              <div style={{ fontSize:13,fontWeight:700,color:P }}>{c.clientName||c.companyName}</div>
              <div style={{ fontSize:11,color:'#6b7280',marginTop:2,display:'flex',gap:12 }}>
                {c.city&&<span>📍 {c.city}</span>}
                {c.gstin&&<span>GST: {c.gstin}</span>}
                {c.state&&<span>{c.state}</span>}
              </div>
            </div>
          ))}
          {list.length===0&&<div style={{ padding:32,textAlign:'center',color:'#9ca3af',fontFamily:F }}>No clients found</div>}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════ MAIN ═══════════════════════════ */
export default function CreateReceipt() {
  const { selectedCompany } = useCompany();
  const cid = selectedCompany?.companyId;

  const [clients,     setClients]     = useState([]);
  const [banks,       setBanks]       = useState([]);
  const [allPayments, setAllPayments] = useState([]);
  const [clientOrders,setClientOrders]= useState([]);

  const [selClient,   setSelClient]   = useState(null);
  const [showSearch,  setShowSearch]  = useState(false);

  /* per-order rows: { orderId, order, checked, amount, prevReceived, orderTotal, due } */
  const [orderRows,   setOrderRows]   = useState([]);

  /* common receipt fields */
  const [date,    setDate]    = useState(new Date().toISOString().slice(0,10));
  const [mode,    setMode]    = useState('Bank Transfer');
  const [bankId,  setBankId]  = useState('');
  const [refNo,   setRefNo]   = useState('');
  const [notes,   setNotes]   = useState('');

  const [saving,  setSaving]  = useState(false);
  const [msg,     setMsg]     = useState({ text:'', ok:true });

  useEffect(() => {
    if (!cid) return;
    axios.get(`/api/clients?companyId=${cid}`).then(r=>setClients(r.data||[])).catch(()=>{});
    axios.get(`/api/accounts/banks?companyId=${cid}`).then(r=>setBanks((r.data||[]).filter(b=>b.status==='active'))).catch(()=>{});
    axios.get(`/api/accounts/payments?companyId=${cid}`).then(r=>setAllPayments(r.data||[])).catch(()=>{});
  }, [cid]);

  /* when client selected — load their orders and build rows */
  const selectClient = async (client) => {
    setSelClient(client);
    setOrderRows([]);
    setMsg({ text:'', ok:true });
    try {
      const res = await axios.get(`/api/sales-orders?companyId=${cid}`);
      const all  = Array.isArray(res.data) ? res.data : (res.data?.orders||[]);
      const mine = all.filter(o =>
        String(o.clientId)===String(client.clientId) ||
        (o.customerName||'').toLowerCase()===(client.clientName||client.companyName||'').toLowerCase()
      ).filter(o => o.status !== 'cancelled');
      setClientOrders(mine);
      const rows = mine.map(o => {
        const orderTotal = getOrderTotal(o);
        const prevReceived = allPayments
          .filter(p => p.type==='receipt' && String(p.orderId)===String(o.orderId) && p.status==='confirmed')
          .reduce((s,p)=>s+(parseFloat(p.amount)||0), 0);
        const due = Math.max(0, orderTotal - prevReceived);
        return { orderId: String(o.orderId), order:o, checked:false, amount:'', prevReceived, orderTotal, due };
      });
      setOrderRows(rows);
    } catch {}
  };

  const toggleRow = (orderId) => {
    setOrderRows(prev => prev.map(r => {
      if (r.orderId !== orderId) return r;
      const checked = !r.checked;
      return { ...r, checked, amount: checked && r.due > 0 ? r.due.toFixed(2) : (checked ? r.orderTotal.toFixed(2) : '') };
    }));
  };

  const setRowAmount = (orderId, val) => {
    setOrderRows(prev => prev.map(r => r.orderId===orderId ? { ...r, amount:val } : r));
  };

  const checkedRows  = orderRows.filter(r => r.checked);
  const totalAmount  = checkedRows.reduce((s,r) => s+(parseFloat(r.amount)||0), 0);

  const reset = () => {
    setSelClient(null); setOrderRows([]); setClientOrders([]);
    setDate(new Date().toISOString().slice(0,10)); setMode('Bank Transfer');
    setBankId(''); setRefNo(''); setNotes('');
    setMsg({ text:'', ok:true });
  };

  const handleSubmit = async () => {
    if (!selClient)           { setMsg({ text:'Please select a client.', ok:false }); return; }
    if (checkedRows.length===0){ setMsg({ text:'Please select at least one sales order.', ok:false }); return; }
    if (checkedRows.some(r=>!parseFloat(r.amount)||parseFloat(r.amount)<=0)) {
      setMsg({ text:'Please enter a valid amount for each selected order.', ok:false }); return;
    }
    if (BANK_MODES.includes(mode) && !bankId) {
      setMsg({ text:'Please select a bank account.', ok:false }); return;
    }
    setSaving(true); setMsg({ text:'', ok:true });
    try {
      /* save one payment record per order */
      const results = [];
      for (const row of checkedRows) {
        const res = await axios.post(`/api/accounts/payments?companyId=${cid}`, {
          companyId: cid, type:'receipt', entityType:'client',
          entityId:   selClient.clientId,
          party:      selClient.clientName || selClient.companyName,
          entityName: selClient.clientName || selClient.companyName,
          orderId:    row.orderId,
          orderNo:    row.order.orderNo || '',
          date, amount: parseFloat(row.amount).toFixed(2),
          paymentMode: mode, bankId, referenceNo: refNo, notes,
          orderType: 'sales', status: 'confirmed',
        });
        results.push(res.data.paymentId);
      }
      setMsg({ text:`✓ ${results.length} receipt(s) recorded successfully! IDs: ${results.join(', ')}`, ok:true });
      reset();
    } catch (e) {
      setMsg({ text:'Error: '+(e.response?.data?.error||e.message), ok:false });
    }
    setSaving(false);
  };

  return (
    <div style={{ background:'#f0f4fb', minHeight:'100%', fontFamily:F, paddingBottom:32 }}>

      {/* Header */}
      <div style={{ background:P, padding:'0 20px', display:'flex', alignItems:'center', justifyContent:'space-between', height:52 }}>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <span style={{ fontSize:22 }}>💰</span>
          <div>
            <div style={{ fontSize:9, color:'rgba(255,255,255,0.55)', textTransform:'uppercase', letterSpacing:'1px' }}>Finance → Receipts</div>
            <div style={{ fontSize:15, fontWeight:800, color:'#fff' }}>Record Client Receipt</div>
          </div>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={reset} style={{ height:32, padding:'0 14px', background:'rgba(255,255,255,0.12)', border:'1px solid rgba(255,255,255,0.25)', borderRadius:6, color:'#fff', fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:F }}>
            ↺ Reset
          </button>
          <button onClick={handleSubmit} disabled={saving||checkedRows.length===0}
            style={{ height:32, padding:'0 18px', background: (saving||checkedRows.length===0)?'#6b7280':'#12B76A', border:'none', borderRadius:6, color:'#fff', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:F }}>
            {saving ? 'Saving…' : `💰 Record Receipt${checkedRows.length>1?' ('+checkedRows.length+' Orders)':''}`}
          </button>
        </div>
      </div>

      <div style={{ padding:'16px 20px 0' }}>

        {/* Message */}
        {msg.text && (
          <div style={{ background:msg.ok?'#ecfdf5':'#fef2f2', border:`1px solid ${msg.ok?'#a7f3d0':'#fecaca'}`, borderRadius:8, padding:'10px 14px', marginBottom:14, fontSize:13, color:msg.ok?'#059669':'#dc2626', fontWeight:600, display:'flex', gap:8, alignItems:'center' }}>
            <span>{msg.ok?'✓':'⚠'}</span> {msg.text}
          </div>
        )}

        {/* ── Step 1: Client ── */}
        <div style={card()}>
          <div style={SH()}>Step 1 — Select Client</div>
          <div style={{ padding:14, display:'flex', gap:10, alignItems:'flex-end' }}>
            <div style={{ flex:1 }}>
              <label style={lbl}>Client <span style={{ color:'#ef4444' }}>*</span></label>
              <input readOnly value={selClient ? `${selClient.clientName||selClient.companyName}` : ''} placeholder="Click Search to pick client…" style={inp(true)} />
            </div>
            <button onClick={() => setShowSearch(true)}
              style={{ height:34, padding:'0 16px', background:P, color:'#fff', border:'none', borderRadius:6, cursor:'pointer', fontSize:12, fontWeight:700, fontFamily:F, whiteSpace:'nowrap' }}>
              🔍 Search Client
            </button>
            {selClient && (
              <button onClick={reset} style={{ height:34, padding:'0 12px', background:'#fef2f2', color:'#dc2626', border:'1px solid #fecaca', borderRadius:6, cursor:'pointer', fontSize:12, fontFamily:F }}>
                ✕ Clear
              </button>
            )}
          </div>
          {selClient && (
            <div style={{ margin:'0 14px 14px', padding:'8px 12px', background:'#f0f4ff', borderRadius:7, fontSize:12, color:'#374151', display:'flex', gap:16, flexWrap:'wrap' }}>
              {selClient.gstin && <span>GST: <strong>{selClient.gstin}</strong></span>}
              {selClient.city  && <span>City: <strong>{selClient.city}</strong></span>}
              {selClient.state && <span>State: <strong>{selClient.state}</strong></span>}
              <span style={{ color:P, fontWeight:700 }}>{clientOrders.length} order(s) found</span>
            </div>
          )}
        </div>

        {/* ── Step 2: Order selection ── */}
        {selClient && orderRows.length > 0 && (
          <div style={card()}>
            <div style={{ background:P, padding:'9px 16px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <span style={{ fontSize:11, fontWeight:800, color:'#fff', textTransform:'uppercase', letterSpacing:'0.8px' }}>
                Step 2 — Select Orders & Enter Amount
              </span>
              <span style={{ fontSize:11, color:'rgba(255,255,255,0.7)' }}>
                {checkedRows.length} selected — Total: ₹{fmt(totalAmount)}
              </span>
            </div>
            {/* Pending summary banner */}
            {(() => {
              const totalPending = orderRows.reduce((s,r) => s + r.due, 0);
              const pendingCount = orderRows.filter(r => r.due > 0).length;
              if (totalPending <= 0) return null;
              return (
                <div style={{ background:'#fef3c7', borderBottom:'1px solid #fbbf24', padding:'8px 16px', display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
                  <span style={{ background:'#b45309', color:'#fff', borderRadius:5, padding:'2px 10px', fontSize:11, fontWeight:800, letterSpacing:'0.5px' }}>PENDING</span>
                  <span style={{ fontSize:12, color:'#92400e', fontWeight:700 }}>
                    {pendingCount} order{pendingCount>1?'s':''} with outstanding dues —
                    Total Pending: <span style={{ color:'#dc2626', fontSize:13, fontWeight:800 }}>₹{fmt(totalPending)}</span>
                  </span>
                </div>
              );
            })()}
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontFamily:F, fontSize:12 }}>
                <thead>
                  <tr style={{ background:'#1e3a5f' }}>
                    <th style={{ padding:'9px 12px', color:'#fff', fontWeight:700, width:40, textAlign:'center', borderRight:'1px solid rgba(255,255,255,0.1)' }}>
                      <input type="checkbox"
                        checked={checkedRows.length===orderRows.length && orderRows.length>0}
                        onChange={e => setOrderRows(prev => prev.map(r => ({ ...r, checked:e.target.checked, amount: e.target.checked&&r.due>0?r.due.toFixed(2):(e.target.checked?r.orderTotal.toFixed(2):'') })))}
                        style={{ width:14, height:14, cursor:'pointer' }}
                      />
                    </th>
                    {['Order ID','Order No','Client PO No','Order Date','Order Value (₹)','Prev. Received (₹)','Outstanding Due (₹)','Amount to Receive (₹)'].map((h,i) => (
                      <th key={i} style={{ padding:'9px 12px', color:'#fff', fontWeight:700, textAlign: i>=4?'right':'left', borderRight:'1px solid rgba(255,255,255,0.1)', whiteSpace:'nowrap', fontSize:11 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {orderRows.map((r, i) => {
                    const bg = r.checked ? '#f0fdf4' : i%2===0 ? '#fff' : '#fafbff';
                    const dueColor = r.due <= 0 ? '#059669' : '#dc2626';
                    return (
                      <tr key={r.orderId} style={{ background:bg, cursor:'pointer' }}
                        onClick={() => toggleRow(r.orderId)}>
                        <td style={{ padding:'9px 12px', textAlign:'center', borderBottom:`1px solid ${BD}`, borderRight:`1px solid ${BD}` }}
                          onClick={e => { e.stopPropagation(); toggleRow(r.orderId); }}>
                          <input type="checkbox" checked={r.checked} onChange={() => toggleRow(r.orderId)}
                            style={{ width:14, height:14, cursor:'pointer', accentColor:P }} />
                        </td>
                        <td style={{ padding:'9px 12px', borderBottom:`1px solid ${BD}`, borderRight:`1px solid ${BD}`, fontWeight:700, color:P }}>{r.order.orderId}</td>
                        <td style={{ padding:'9px 12px', borderBottom:`1px solid ${BD}`, borderRight:`1px solid ${BD}`, fontWeight:600 }}>{r.order.orderNo||'—'}</td>
                        <td style={{ padding:'9px 12px', borderBottom:`1px solid ${BD}`, borderRight:`1px solid ${BD}`, color:'#6b7280' }}>{r.order.customerPO||r.order.reference||'—'}</td>
                        <td style={{ padding:'9px 12px', borderBottom:`1px solid ${BD}`, borderRight:`1px solid ${BD}`, color:'#6b7280' }}>{r.order.orderDate||'—'}</td>
                        <td style={{ padding:'9px 12px', borderBottom:`1px solid ${BD}`, borderRight:`1px solid ${BD}`, textAlign:'right', fontWeight:600 }}>₹{fmt(r.orderTotal)}</td>
                        <td style={{ padding:'9px 12px', borderBottom:`1px solid ${BD}`, borderRight:`1px solid ${BD}`, textAlign:'right', color:'#059669', fontWeight:600 }}>₹{fmt(r.prevReceived)}</td>
                        <td style={{ padding:'9px 12px', borderBottom:`1px solid ${BD}`, borderRight:`1px solid ${BD}`, textAlign:'right', fontWeight:700, color:dueColor }}>
                          {r.due <= 0 ? (
                            <span style={{ color:'#059669' }}>✓ Cleared</span>
                          ) : (
                            <span style={{ display:'flex', alignItems:'center', justifyContent:'flex-end', gap:6 }}>
                              <span style={{ background:'#dc2626', color:'#fff', borderRadius:4, padding:'2px 8px', fontSize:10, fontWeight:800, letterSpacing:'0.4px', flexShrink:0 }}>PENDING</span>
                              <span style={{ color:'#dc2626', fontWeight:800 }}>₹{fmt(r.due)}</span>
                            </span>
                          )}
                        </td>
                        <td style={{ padding:'6px 10px', borderBottom:`1px solid ${BD}` }}
                          onClick={e => e.stopPropagation()}>
                          <input
                            type="number" min="0" step="0.01"
                            value={r.amount}
                            onChange={e => setRowAmount(r.orderId, e.target.value)}
                            disabled={!r.checked}
                            placeholder={r.checked ? '0.00' : '—'}
                            style={{
                              ...inp(false, { textAlign:'right', fontWeight:700, fontSize:13,
                                background: r.checked ? '#fff' : '#f9fafb',
                                color: r.checked ? '#15803d' : '#9ca3af',
                                border: r.checked ? '1.5px solid #16a34a' : `1px solid ${BD}`,
                                width:130,
                              })
                            }}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                {/* Total row */}
                {checkedRows.length > 0 && (
                  <tfoot>
                    <tr style={{ background:'#1e3a5f' }}>
                      <td colSpan={7} style={{ padding:'10px 14px', textAlign:'right', color:'#fff', fontWeight:700, fontSize:12 }}>
                        Total Receipt Amount ({checkedRows.length} order{checkedRows.length>1?'s':''})
                      </td>
                      <td style={{ padding:'10px 14px', textAlign:'right', color:'#86efac', fontWeight:800, fontSize:15 }}>
                        ₹{fmt(totalAmount)}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
            {orderRows.length === 0 && (
              <div style={{ padding:32, textAlign:'center', color:'#9ca3af', fontSize:13 }}>No active orders found for this client</div>
            )}
          </div>
        )}

        {selClient && orderRows.length === 0 && (
          <div style={{ ...card(), padding:24, textAlign:'center', color:'#9ca3af', fontSize:13 }}>
            No active sales orders found for <strong>{selClient.clientName||selClient.companyName}</strong>
          </div>
        )}

        {/* ── Step 3: Payment Details ── */}
        {selClient && (
          <div style={card()}>
            <div style={SH()}>Step 3 — Payment Details</div>
            <div style={{ padding:14, display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:14 }}>
              <div>
                <label style={lbl}>Receipt Date <span style={{ color:'#ef4444' }}>*</span></label>
                <input type="date" value={date} onChange={e=>setDate(e.target.value)} style={inp()} />
              </div>
              <div>
                <label style={lbl}>Payment Mode</label>
                <select value={mode} onChange={e=>setMode(e.target.value)} style={{ ...inp(), cursor:'pointer' }}>
                  {PAYMENT_MODES.map(m=><option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              {BANK_MODES.includes(mode) ? (
                <div>
                  <label style={lbl}>Bank Account <span style={{ color:'#ef4444' }}>*</span></label>
                  <select value={bankId} onChange={e=>setBankId(e.target.value)} style={{ ...inp(), cursor:'pointer' }}>
                    <option value="">— Select Bank —</option>
                    {banks.map(b=><option key={b.bankId} value={b.bankId}>{b.bankName} — {b.accountNumber}</option>)}
                  </select>
                </div>
              ) : <div/>}
              <div>
                <label style={lbl}>Reference / Cheque / UTR No.</label>
                <input value={refNo} onChange={e=>setRefNo(e.target.value)} placeholder="e.g. TXN-123456" style={inp()} />
              </div>
              <div style={{ gridColumn:'span 2' }}>
                <label style={lbl}>Notes / Remarks</label>
                <input value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Optional notes…" style={inp()} />
              </div>
            </div>
          </div>
        )}

        {/* ── Summary + Submit ── */}
        {checkedRows.length > 0 && (
          <div style={{ background:'#fff', border:`1px solid ${BD}`, borderRadius:10, padding:'14px 16px', marginBottom:14, boxShadow:'0 1px 3px rgba(0,0,0,0.06)' }}>
            <div style={{ fontSize:11, fontWeight:800, color:P, textTransform:'uppercase', letterSpacing:'0.8px', marginBottom:10 }}>Receipt Summary</div>
            <table style={{ width:'100%', borderCollapse:'collapse', fontFamily:F, fontSize:12 }}>
              <thead>
                <tr style={{ background:'#f8faff' }}>
                  {['Order ID','Order No','Order Value','Previously Received','Amount This Receipt'].map((h,i)=>(
                    <th key={i} style={{ padding:'7px 12px', fontWeight:700, color:'#374151', textAlign:i>=2?'right':'left', borderBottom:`1px solid ${BD}`, fontSize:11 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {checkedRows.map((r,i)=>(
                  <tr key={r.orderId} style={{ background:i%2===0?'#fff':'#fafbff' }}>
                    <td style={{ padding:'7px 12px', borderBottom:`1px solid ${BD}`, fontWeight:700, color:P }}>{r.order.orderId}</td>
                    <td style={{ padding:'7px 12px', borderBottom:`1px solid ${BD}` }}>{r.order.orderNo||'—'}</td>
                    <td style={{ padding:'7px 12px', borderBottom:`1px solid ${BD}`, textAlign:'right' }}>₹{fmt(r.orderTotal)}</td>
                    <td style={{ padding:'7px 12px', borderBottom:`1px solid ${BD}`, textAlign:'right', color:'#059669' }}>₹{fmt(r.prevReceived)}</td>
                    <td style={{ padding:'7px 12px', borderBottom:`1px solid ${BD}`, textAlign:'right', fontWeight:800, color:'#15803d', fontSize:13 }}>₹{fmt(r.amount)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background:'#f0fdf4' }}>
                  <td colSpan={4} style={{ padding:'9px 12px', fontWeight:800, color:'#374151', textAlign:'right', borderTop:`2px solid ${BD}` }}>
                    TOTAL RECEIPT AMOUNT
                  </td>
                  <td style={{ padding:'9px 12px', fontWeight:800, fontSize:15, color:'#15803d', textAlign:'right', borderTop:`2px solid ${BD}` }}>
                    ₹{fmt(totalAmount)}
                  </td>
                </tr>
              </tfoot>
            </table>
            <div style={{ marginTop:12, fontSize:11, color:'#6b7280' }}>
              This will create <strong>{checkedRows.length}</strong> separate receipt record(s) in the ledger — one per order.
            </div>
          </div>
        )}

        <div style={{ display:'flex', gap:10, justifyContent:'flex-end', paddingTop:4 }}>
          <button onClick={reset} style={{ height:40, padding:'0 20px', background:'#fff', border:`1px solid ${BD}`, borderRadius:7, fontSize:13, cursor:'pointer', fontFamily:F, fontWeight:600, color:'#374151' }}>
            ↺ Reset
          </button>
          <button onClick={handleSubmit} disabled={saving||checkedRows.length===0}
            style={{ height:40, padding:'0 28px', background:(saving||checkedRows.length===0)?'#94a3b8':'#12B76A', border:'none', borderRadius:7, fontSize:14, fontWeight:800, color:'#fff', cursor:(saving||checkedRows.length===0)?'not-allowed':'pointer', fontFamily:F, boxShadow:(saving||checkedRows.length===0)?'none':'0 2px 8px rgba(18,183,106,0.4)' }}>
            {saving ? 'Saving…' : checkedRows.length===0 ? 'Select Orders First' : `💰 Record ₹${fmt(totalAmount)} Receipt`}
          </button>
        </div>
      </div>

      {showSearch && (
        <ClientPopup clients={clients} onSelect={selectClient} onClose={()=>setShowSearch(false)} />
      )}
    </div>
  );
}
