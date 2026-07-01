import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { useCompany } from '../../../context/CompanyContext';

const PAYMENT_MODES = ['Cash', 'Bank Transfer', 'Cheque', 'UPI', 'NEFT', 'RTGS'];
const BANK_MODES    = ['Bank Transfer', 'Cheque', 'NEFT', 'RTGS'];
const P  = '#104f4f';
const PD = '#0b3d3d';
const BG = '#F5F7FB';
const BD = '#E5EAF2';
const F  = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

const fmt = n => (parseFloat(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });
const calcItemsTotal = (items = []) =>
  items.reduce((s, it) => {
    const base = (parseFloat(it.qty || it.quantity) || 0) * (parseFloat(it.rate) || 0);
    const disc = it.discountType === '%' ? base * (parseFloat(it.discount) || 0) / 100 : (parseFloat(it.discount) || 0);
    const taxable = base - disc;
    return s + taxable + taxable * (parseFloat(it.gstPercent || it.gst || it.gstPct) || 0) / 100;
  }, 0);

const getOrderTotal = (order) => {
  if (!order) return 0;
  if (order.grandTotal) return parseFloat(order.grandTotal) || 0;
  const items = calcItemsTotal(order.items);
  const chgTotal = (order.charges || []).reduce((s, c) => {
    const a = parseFloat(c.amount) || 0;
    return s + a + a * (parseFloat(c.gst) || 0) / 100;
  }, 0);
  const freight  = parseFloat(order.freightCharges) || 0;
  const packing  = parseFloat(order.packingCharges) || 0;
  const roundOff = parseFloat(order.roundOff) || 0;
  const disc     = parseFloat(order.overallDiscount) || 0;
  const sub = items + chgTotal + freight + packing;
  return +(sub - (sub * disc / 100) + roundOff).toFixed(2);
};

const inp = (readOnly = false) => ({
  width: '100%', height: 36, padding: '0 10px',
  border: `1px solid ${BD}`, borderRadius: 6,
  fontSize: 13, fontFamily: F, outline: 'none',
  background: readOnly ? '#F9FAFB' : '#fff',
  color: readOnly ? '#6B7280' : '#111827',
  boxSizing: 'border-box', transition: 'border-color 0.15s',
});
const lbl = { fontSize: 12.5, fontWeight: 600, color: '#374151', marginBottom: 5, display: 'block', fontFamily: F };
const SH  = { background: P, padding: '8px 16px', fontSize: 11, fontWeight: 800,
  color: '#fff', textTransform: 'uppercase', letterSpacing: '0.8px' };
const card = { background: '#fff', border: `1px solid ${BD}`, borderRadius: 10,
  overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', marginBottom: 14 };

/* ── Generic Search Popup ── */
function SearchPopup({ title, items, columns, onSelect, onClose }) {
  const [q, setQ] = useState('');
  const ref = useRef(null);
  useEffect(() => { ref.current?.focus(); }, []);
  const filtered = q.trim()
    ? items.filter(row => columns.some(col => String(row[col.key]||'').toLowerCase().includes(q.toLowerCase())))
    : items;
  return (
    <div onClick={e => { if (e.target===e.currentTarget) onClose(); }}
      style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', backdropFilter:'blur(2px)',
        zIndex:9000, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
      <div style={{ background:'#fff', borderRadius:12, width:'100%', maxWidth:700,
        maxHeight:'80vh', display:'flex', flexDirection:'column',
        boxShadow:'0 20px 60px rgba(0,0,0,0.25)', border:`1px solid ${BD}` }}>
        <div style={{ background:P, color:'#fff', padding:'14px 18px', borderRadius:'12px 12px 0 0',
          display:'flex', justifyContent:'space-between', alignItems:'center', flexShrink:0 }}>
          <span style={{ fontSize:13, fontWeight:700, fontFamily:F }}>{title}</span>
          <button onClick={onClose} style={{ background:'rgba(255,255,255,0.15)', border:'1px solid rgba(255,255,255,0.25)',
            borderRadius:6, color:'#fff', width:28, height:28, cursor:'pointer', fontSize:16, display:'flex',
            alignItems:'center', justifyContent:'center' }}>✕</button>
        </div>
        <div style={{ padding:'10px 14px', borderBottom:`1px solid ${BD}`, flexShrink:0 }}>
          <input ref={ref} value={q} onChange={e => setQ(e.target.value)}
            placeholder="Type to search…" style={{ ...inp(), width:'100%' }} />
        </div>
        <div style={{ flex:1, overflowY:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12, fontFamily:F }}>
            <thead style={{ position:'sticky', top:0 }}>
              <tr style={{ background:P }}>
                {columns.map(c => (
                  <th key={c.key} style={{ padding:'8px 12px', color:'#fff', fontWeight:700,
                    textAlign:'left', border:`1px solid ${PD}`, whiteSpace:'nowrap', fontSize:11 }}>{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length===0 && (
                <tr><td colSpan={columns.length} style={{ padding:24, textAlign:'center', color:'#9CA3AF', fontSize:13 }}>No results found</td></tr>
              )}
              {filtered.map((row,i) => (
                <tr key={i} onClick={() => { onSelect(row); onClose(); }}
                  style={{ background:i%2===0?'#fff':'#FAFBFC', cursor:'pointer' }}
                  onMouseEnter={e => e.currentTarget.style.background='#EEF4FF'}
                  onMouseLeave={e => e.currentTarget.style.background=i%2===0?'#fff':'#FAFBFC'}>
                  {columns.map(c => (
                    <td key={c.key} style={{ padding:'8px 12px', border:`1px solid ${BD}`, color:'#374151' }}>{row[c.key]||'—'}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ padding:'8px 14px', borderTop:`1px solid ${BD}`, fontSize:11,
          color:'#9CA3AF', fontFamily:F, flexShrink:0, background:'#FAFBFC', borderRadius:'0 0 12px 12px' }}>
          {filtered.length} result{filtered.length!==1?'s':''} — click a row to select
        </div>
      </div>
    </div>
  );
}

/* ── SO Rich Search Popup ── */
function SOSearchPopup({ title, orders, onSelect, onClose }) {
  const [q, setQ] = useState('');
  const ref = useRef(null);
  useEffect(() => { ref.current?.focus(); }, []);

  const filtered = q.trim()
    ? orders.filter(o =>
        String(o.orderId).includes(q) ||
        (o.orderNo||'').toLowerCase().includes(q.toLowerCase()) ||
        (o.customerName||o.clientName||'').toLowerCase().includes(q.toLowerCase()) ||
        (o.customerPO||o.reference||'').toLowerCase().includes(q.toLowerCase()) ||
        (o.items||[]).some(it => (it.itemName||it.description||'').toLowerCase().includes(q.toLowerCase()))
      )
    : orders;

  const statusColor = s => s==='approved'||s==='confirmed'?{bg:'#d1fae5',color:'#065f46'}:s==='pending'?{bg:'#fef3c7',color:'#92400e'}:{bg:'#f3f4f6',color:'#374151'};

  return (
    <div onClick={e => { if (e.target===e.currentTarget) onClose(); }}
      style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', backdropFilter:'blur(2px)',
        zIndex:9000, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
      <div style={{ background:'#fff', borderRadius:12, width:'100%', maxWidth:900,
        maxHeight:'85vh', display:'flex', flexDirection:'column',
        boxShadow:'0 20px 60px rgba(0,0,0,0.3)', border:`1px solid ${BD}` }}>

        {/* Header */}
        <div style={{ background:P, color:'#fff', padding:'14px 18px', borderRadius:'12px 12px 0 0',
          display:'flex', justifyContent:'space-between', alignItems:'center', flexShrink:0 }}>
          <div>
            <div style={{ fontSize:14, fontWeight:700, fontFamily:F }}>{title}</div>
            <div style={{ fontSize:10.5, color:'rgba(255,255,255,0.65)', marginTop:1 }}>{filtered.length} order{filtered.length!==1?'s':''} — click to select</div>
          </div>
          <button onClick={onClose} style={{ background:'rgba(255,255,255,0.15)', border:'1px solid rgba(255,255,255,0.25)',
            borderRadius:6, color:'#fff', width:30, height:30, cursor:'pointer', fontSize:17, display:'flex',
            alignItems:'center', justifyContent:'center' }}>✕</button>
        </div>

        {/* Search */}
        <div style={{ padding:'10px 14px', borderBottom:`1px solid ${BD}`, flexShrink:0 }}>
          <input ref={ref} value={q} onChange={e => setQ(e.target.value)}
            placeholder="Search by SO #, Order No, Cust PO, material name…"
            style={{ ...inp(), width:'100%' }} />
        </div>

        {/* SO Cards */}
        <div style={{ flex:1, overflowY:'auto', padding:'8px 10px', display:'flex', flexDirection:'column', gap:6 }}>
          {filtered.length === 0 && (
            <div style={{ padding:40, textAlign:'center', color:'#9CA3AF', fontSize:13, fontStyle:'italic' }}>No orders found</div>
          )}
          {filtered.map((o, i) => {
            const sc = statusColor(o.status);
            const items = o.items || [];
            return (
              <div key={o.orderId||i} onClick={() => { onSelect(o); onClose(); }}
                style={{ border:`1.5px solid ${BD}`, borderRadius:9, overflow:'hidden',
                  cursor:'pointer', background:'#fff' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor=P; e.currentTarget.style.boxShadow=`0 2px 12px rgba(19,61,128,0.12)`; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor=BD; e.currentTarget.style.boxShadow='none'; }}>

                {/* SO header row */}
                <div style={{ display:'grid', gridTemplateColumns:'90px 1fr 1fr 1fr 1fr 1fr 1fr auto',
                  gap:0, background:'#f8faff', borderBottom:`1px solid ${BD}`, alignItems:'center' }}>
                  {[
                    { lbl:'SO #',        val: o.orderId, bold:true },
                    { lbl:'Order No',    val: o.orderNo||'—' },
                    { lbl:'Client Name', val: o.customerName||o.clientName||o.party||'—', bold:true },
                    { lbl:'Order Date',  val: o.orderDate||'—' },
                    { lbl:'Cust PO No',  val: o.customerPO||o.reference||'—' },
                    { lbl:'Due Date',    val: o.deliveryDate||o.dueDate||'—' },
                    { lbl:'SO Value',    val: o._total||'—', bold:true },
                  ].map((f,fi) => (
                    <div key={fi} style={{ padding:'8px 12px', borderRight:`1px solid ${BD}` }}>
                      <div style={{ fontSize:9.5, color:'#9ca3af', fontWeight:600, textTransform:'uppercase', marginBottom:1 }}>{f.lbl}</div>
                      <div style={{ fontSize:f.bold?13:12, fontWeight:f.bold?700:500, color:f.bold?P:'#374151' }}>{f.val}</div>
                    </div>
                  ))}
                  <div style={{ padding:'8px 12px' }}>
                    <span style={{ fontSize:10.5, fontWeight:700, padding:'3px 10px', borderRadius:20,
                      background:sc.bg, color:sc.color, whiteSpace:'nowrap' }}>{o.status||'—'}</span>
                  </div>
                </div>

                {/* Items list */}
                {items.length > 0 && (
                  <div style={{ padding:'7px 12px', display:'flex', flexWrap:'wrap', gap:'4px 8px', alignItems:'center' }}>
                    <span style={{ fontSize:10, color:'#9ca3af', fontWeight:600, textTransform:'uppercase', marginRight:2 }}>Products:</span>
                    {items.map((it, ii) => {
                      const qty = parseFloat(it.qty||it.quantity||0);
                      return (
                        <span key={ii} style={{ fontSize:11, background:'#eef2ff', color:'#3730a3',
                          padding:'2px 9px', borderRadius:12, border:'1px solid #c7d2fe', whiteSpace:'nowrap' }}>
                          {it.itemName||it.description||it.name||'Item'} — {qty.toFixed(2)} {it.unit||''}
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function FR({ label, children, cols }) {
  return (
    <div style={{ gridColumn: cols || 'span 1' }}>
      <label style={lbl}>{label}</label>
      {children}
    </div>
  );
}

/* ══════════════════════════════════════
   MAIN
══════════════════════════════════════ */
const CreateReceipt = () => {
  const { selectedCompany } = useCompany();
  const cid = selectedCompany?.companyId;

  const [clients,          setClients]          = useState([]);
  const [banks,            setBanks]            = useState([]);
  const [orders,           setOrders]           = useState([]);
  const [allPayments,      setAllPayments]      = useState([]);
  const [selectedClient,   setSelectedClient]   = useState(null);
  const [selectedOrder,    setSelectedOrder]    = useState(null);
  const [previouslyReceived, setPreviouslyReceived] = useState(0);
  const [showClientSearch, setShowClientSearch] = useState(false);
  const [showOrderSearch,  setShowOrderSearch]  = useState(false);
  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    amount: '', paymentMode: 'Bank Transfer', bankId: '', referenceNo: '', notes: '',
  });
  const [message, setMessage] = useState({ text: '', ok: true });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!cid) return;
    axios.get(`/api/clients?companyId=${cid}`).then(r => setClients(r.data)).catch(() => {});
    axios.get(`/api/accounts/banks?companyId=${cid}`).then(r => setBanks(r.data.filter(b => b.status === 'active'))).catch(() => {});
    axios.get(`/api/accounts/payments?companyId=${cid}`).then(r => setAllPayments(r.data)).catch(() => {});
  }, [cid]);

  const selectClient = async (client) => {
    setSelectedClient(client);
    setSelectedOrder(null); setOrders([]);
    try {
      const res = await axios.get(`/api/sales-orders?companyId=${cid}`);
      const filt = res.data.filter(o =>
        String(o.clientId) === String(client.clientId) ||
        (o.customerName || '').toLowerCase() === (client.clientName || client.companyName || '').toLowerCase()
      );
      setOrders(filt.map(o => ({ ...o, _total: `₹${fmt(getOrderTotal(o))}` })));
    } catch {}
  };

  const selectOrder = (order) => {
    setSelectedOrder(order);
    const total = getOrderTotal(order);
    const prevRec = allPayments
      .filter(p => p.type === 'receipt' && String(p.orderId) === String(order.orderId) && p.status === 'confirmed')
      .reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
    setPreviouslyReceived(prevRec);
    const remaining = Math.max(0, total - prevRec);
    setForm(p => ({ ...p, amount: remaining > 0 ? remaining.toFixed(2) : total > 0 ? total.toFixed(2) : '' }));
  };

  const handleReset = () => {
    setSelectedClient(null); setSelectedOrder(null); setOrders([]);
    setForm({ date: new Date().toISOString().slice(0, 10), amount: '', paymentMode: 'Bank Transfer', bankId: '', referenceNo: '', notes: '' });
    setMessage({ text: '', ok: true });
  };

  const handleSubmit = async () => {
    if (!selectedClient) { setMessage({ text: 'Please select a client.', ok: false }); return; }
    if (!form.amount)    { setMessage({ text: 'Please enter the receipt amount.', ok: false }); return; }
    if (BANK_MODES.includes(form.paymentMode) && !form.bankId) {
      setMessage({ text: 'Please select a bank account for this payment mode.', ok: false }); return;
    }
    try {
      setLoading(true);
      setMessage({ text: '', ok: true });
      const res = await axios.post(`/api/accounts/payments?companyId=${cid}`, {
        ...form, type: 'receipt', entityType: 'client',
        entityId: selectedClient.clientId,
        entityName: selectedClient.clientName || selectedClient.companyName,
        orderId: selectedOrder?.orderId || '',
        orderType: 'sales', status: 'pending', companyId: cid,
      });
      setMessage({ text: `✓ Receipt recorded successfully! ID: ${res.data.paymentId}`, ok: true });
      handleReset();
    } catch (e) {
      setMessage({ text: 'Error: ' + (e.response?.data?.error || e.message), ok: false });
    } finally { setLoading(false); }
  };

  const clientCols = [
    { key:'clientId',    label:'ID' },
    { key:'clientName',  label:'Client Name' },
    { key:'companyName', label:'Company' },
    { key:'city',        label:'City' },
    { key:'gstin',       label:'GST' },
    { key:'status',      label:'Status' },
  ];
  const orderCols = [
    { key:'orderId',    label:'SO #' },
    { key:'orderNo',    label:'Order No' },
    { key:'orderDate',  label:'Date' },
    { key:'customerPO', label:'Cust PO No' },
    { key:'deliveryDate', label:'Due Date' },
    { key:'_total',     label:'SO Value (₹)' },
    { key:'status',     label:'Status' },
  ];

  const orderTotal = getOrderTotal(selectedOrder);
  const remaining  = Math.max(0, orderTotal - previouslyReceived);

  return (
    <div style={{ background:BG, minHeight:'100%', fontFamily:F }}>

      {/* Header */}
      <div style={{ background:P, padding:'14px 20px',
        display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div>
          <div style={{ fontSize:11, color:'rgba(255,255,255,0.6)', fontWeight:500, textTransform:'uppercase', letterSpacing:'0.6px' }}>
            Finance — Receipts
          </div>
          <div style={{ fontSize:15, fontWeight:800, color:'#fff', letterSpacing:'-0.2px' }}>
            Record Client Receipt
          </div>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={handleReset}
            style={{ height:32, padding:'0 14px', fontSize:12, fontFamily:F, cursor:'pointer',
              background:'rgba(255,255,255,0.12)', color:'#fff',
              border:'1px solid rgba(255,255,255,0.25)', borderRadius:6, fontWeight:600 }}>
            ↺ Reset
          </button>
          <button onClick={handleSubmit} disabled={loading}
            style={{ height:32, padding:'0 18px', fontSize:12, fontFamily:F, cursor:'pointer',
              background:'#12B76A', color:'#fff', border:'none', borderRadius:6, fontWeight:700,
              opacity: loading ? 0.7 : 1, boxShadow:'0 2px 6px rgba(18,183,106,0.4)' }}>
            {loading ? 'Saving…' : '💰 Record Receipt'}
          </button>
        </div>
      </div>

      {/* Message */}
      {message.text && (
        <div style={{ margin:'10px 16px 0', padding:'10px 14px', fontSize:12.5, fontFamily:F,
          background: message.ok ? '#ECFDF5' : '#FEF2F2',
          color: message.ok ? '#059669' : '#DC2626',
          border:`1px solid ${message.ok ? '#A7F3D0' : '#FECACA'}`,
          borderRadius:8 }}>
          {message.text}
        </div>
      )}

      <div style={{ padding:'14px 16px' }}>

        {/* Client Selection */}
        <div style={card}>
          <div style={SH}>Client</div>
          <div style={{ padding:16 }}>
            <div style={{ display:'flex', gap:10, alignItems:'flex-end' }}>
              <div style={{ flex:1 }}>
                <label style={lbl}>Client <span style={{ color:'#EF4444' }}>*</span></label>
                <input readOnly
                  value={selectedClient ? `${selectedClient.clientName || selectedClient.companyName} (ID: ${selectedClient.clientId})` : ''}
                  placeholder="Click Search to pick client…"
                  style={inp(true)} />
              </div>
              <button onClick={() => setShowClientSearch(true)}
                style={{ height:36, padding:'0 16px', background:P, color:'#fff', border:'none',
                  borderRadius:6, cursor:'pointer', fontSize:12.5, fontFamily:F, fontWeight:700,
                  whiteSpace:'nowrap', flexShrink:0 }}>
                🔍 Search Client
              </button>
              {selectedClient && (
                <button onClick={() => { setSelectedClient(null); setSelectedOrder(null); setOrders([]); }}
                  style={{ height:36, padding:'0 12px', background:'#FEF2F2', color:'#DC2626',
                    border:'1px solid #FECACA', borderRadius:6, cursor:'pointer', fontSize:12.5, fontFamily:F }}>
                  ✕ Clear
                </button>
              )}
            </div>
            {selectedClient && (
              <div style={{ display:'flex', gap:16, marginTop:10, padding:'8px 12px',
                background:'#F0F4FF', borderRadius:7, fontSize:12, color:'#374151', flexWrap:'wrap' }}>
                {selectedClient.gstin  && <span>GST: <strong>{selectedClient.gstin}</strong></span>}
                {selectedClient.city   && <span>City: <strong>{selectedClient.city}</strong></span>}
                {selectedClient.state  && <span>State: <strong>{selectedClient.state}</strong></span>}
              </div>
            )}
          </div>
        </div>

        {/* SO Selection */}
        <div style={card}>
          <div style={SH}>Sales Order (Optional)</div>
          <div style={{ padding:16 }}>
            <div style={{ display:'flex', gap:10, alignItems:'flex-end' }}>
              <div style={{ flex:1 }}>
                <label style={lbl}>Link Sales Order</label>
                <input readOnly
                  value={selectedOrder ? `SO #${selectedOrder.orderId}  ${selectedOrder.orderDate || ''}  ₹${fmt(orderTotal)}` : ''}
                  placeholder={selectedClient ? 'Click Search to pick SO…' : 'Select client first'}
                  style={inp(true)} />
              </div>
              <button onClick={() => { if (selectedClient) setShowOrderSearch(true); }}
                disabled={!selectedClient}
                style={{ height:36, padding:'0 16px',
                  background: selectedClient ? '#F0F4FF' : '#F9FAFB',
                  color: selectedClient ? P : '#9CA3AF',
                  border:`1px solid ${selectedClient ? P+'40' : BD}`,
                  borderRadius:6, cursor: selectedClient ? 'pointer' : 'not-allowed',
                  fontSize:12.5, fontFamily:F, fontWeight:700, whiteSpace:'nowrap', flexShrink:0 }}>
                🔍 Search SO
              </button>
              {selectedOrder && (
                <button onClick={() => setSelectedOrder(null)}
                  style={{ height:36, padding:'0 12px', background:'#FEF2F2', color:'#DC2626',
                    border:'1px solid #FECACA', borderRadius:6, cursor:'pointer', fontSize:12.5, fontFamily:F }}>
                  ✕
                </button>
              )}
            </div>

            {selectedOrder && (
              <div style={{ marginTop:12, border:`1px solid ${BD}`, borderRadius:8, overflow:'hidden' }}>
                {/* Order header summary */}
                <div style={{ background:'#f0f4ff', borderBottom:`1px solid ${BD}`,
                  display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:0 }}>
                  {[
                    { label:'SO #',        val: selectedOrder.orderId },
                    { label:'Order No',    val: selectedOrder.orderNo || '—' },
                    { label:'Order Date',  val: selectedOrder.orderDate || '—' },
                    { label:'Cust PO No',  val: selectedOrder.customerPO || selectedOrder.reference || '—' },
                    { label:'Due Date',    val: selectedOrder.deliveryDate || selectedOrder.dueDate || '—' },
                  ].map((f,i) => (
                    <div key={i} style={{ padding:'8px 12px', borderRight: i<4?`1px solid ${BD}`:'none' }}>
                      <div style={{ fontSize:10, color:'#6B7280', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.4px', marginBottom:2 }}>{f.label}</div>
                      <div style={{ fontSize:13, fontWeight:700, color:P }}>{f.val}</div>
                    </div>
                  ))}
                </div>
                {/* Items table */}
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12, fontFamily:F }}>
                  <thead>
                    <tr style={{ background:P }}>
                      {['#','Item / Description','HSN','Qty','Rate (₹)','Disc','Taxable (₹)','GST%','Amount (₹)'].map((h,i) => (
                        <th key={i} style={{ padding:'7px 10px', color:'#fff', fontWeight:700,
                          textAlign: i===0||i===1||i===2?'left':'right', border:`1px solid ${PD}`, fontSize:11 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(selectedOrder.items || []).length === 0 && (
                      <tr><td colSpan={9} style={{ padding:16, textAlign:'center', color:'#9CA3AF', fontStyle:'italic' }}>No items on this order</td></tr>
                    )}
                    {(selectedOrder.items || []).map((it, i) => {
                      const qty = parseFloat(it.qty||it.quantity)||0;
                      const rate = parseFloat(it.rate)||0;
                      const base = qty * rate;
                      const disc = it.discountType==='%' ? base*(parseFloat(it.discount)||0)/100 : (parseFloat(it.discount)||0);
                      const taxable = base - disc;
                      const gstPct = parseFloat(it.gstPercent||it.gst||it.gstPct||0);
                      const gst = taxable * gstPct / 100;
                      return (
                        <tr key={i} style={{ background: i%2===0?'#fff':'#FAFBFC' }}>
                          <td style={{ padding:'7px 10px', border:`1px solid ${BD}`, color:'#9CA3AF', fontSize:11 }}>{i+1}</td>
                          <td style={{ padding:'7px 10px', border:`1px solid ${BD}`, fontWeight:600 }}>
                            <div>{it.itemName||it.description||it.name||'—'}</div>
                            {it.itemCode && <div style={{fontSize:10,color:'#9CA3AF'}}>Code: {it.itemCode}</div>}
                          </td>
                          <td style={{ padding:'7px 10px', border:`1px solid ${BD}`, color:'#6B7280', fontSize:11 }}>{it.hsnCode||'—'}</td>
                          <td style={{ padding:'7px 10px', textAlign:'right', border:`1px solid ${BD}` }}>{qty.toFixed(2)} {it.unit||''}</td>
                          <td style={{ padding:'7px 10px', textAlign:'right', border:`1px solid ${BD}` }}>₹{fmt(rate)}</td>
                          <td style={{ padding:'7px 10px', textAlign:'right', border:`1px solid ${BD}`, color:'#6B7280' }}>
                            {it.discount ? `${it.discount}${it.discountType==='%'?'%':'₹'}` : '—'}
                          </td>
                          <td style={{ padding:'7px 10px', textAlign:'right', border:`1px solid ${BD}` }}>₹{fmt(taxable)}</td>
                          <td style={{ padding:'7px 10px', textAlign:'right', border:`1px solid ${BD}`, color:'#6B7280' }}>{gstPct}%</td>
                          <td style={{ padding:'7px 10px', textAlign:'right', border:`1px solid ${BD}`, fontWeight:700, color:P }}>₹{fmt(taxable+gst)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    {/* Additional charges array (from SO module) */}
                    {(selectedOrder.charges || []).filter(c => parseFloat(c.amount) > 0).map((c, ci) => {
                      const amt = parseFloat(c.amount) || 0;
                      const gstAmt = amt * (parseFloat(c.gst) || 0) / 100;
                      return (
                        <tr key={ci} style={{ background:'#fffbeb' }}>
                          <td colSpan={8} style={{ padding:'6px 10px', textAlign:'right', color:'#92400e', border:`1px solid ${BD}` }}>
                            {c.chargeType || c.description || 'Additional Charge'}
                            {parseFloat(c.gst) > 0 && <span style={{ fontSize:10, color:'#b45309', marginLeft:6 }}>+ {c.gst}% GST</span>}:
                          </td>
                          <td style={{ padding:'6px 10px', textAlign:'right', color:'#92400e', fontWeight:600, border:`1px solid ${BD}` }}>
                            ₹{fmt(amt + gstAmt)}
                          </td>
                        </tr>
                      );
                    })}
                    {/* Legacy flat fields from simple SO form */}
                    {parseFloat(selectedOrder.freightCharges) > 0 && (
                      <tr style={{ background:'#fffbeb' }}>
                        <td colSpan={8} style={{ padding:'6px 10px', textAlign:'right', color:'#92400e', border:`1px solid ${BD}` }}>Freight / Transportation Charges:</td>
                        <td style={{ padding:'6px 10px', textAlign:'right', color:'#92400e', fontWeight:600, border:`1px solid ${BD}` }}>₹{fmt(selectedOrder.freightCharges)}</td>
                      </tr>
                    )}
                    {parseFloat(selectedOrder.packingCharges) > 0 && (
                      <tr style={{ background:'#fffbeb' }}>
                        <td colSpan={8} style={{ padding:'6px 10px', textAlign:'right', color:'#92400e', border:`1px solid ${BD}` }}>Packing / Forwarding Charges:</td>
                        <td style={{ padding:'6px 10px', textAlign:'right', color:'#92400e', fontWeight:600, border:`1px solid ${BD}` }}>₹{fmt(selectedOrder.packingCharges)}</td>
                      </tr>
                    )}
                    {parseFloat(selectedOrder.overallDiscount) > 0 && (
                      <tr style={{ background:'#fff1f2' }}>
                        <td colSpan={8} style={{ padding:'6px 10px', textAlign:'right', color:'#be123c', border:`1px solid ${BD}` }}>Overall Discount ({selectedOrder.overallDiscount}%):</td>
                        <td style={{ padding:'6px 10px', textAlign:'right', color:'#be123c', fontWeight:600, border:`1px solid ${BD}` }}>− ₹{fmt(calcItemsTotal(selectedOrder.items) * parseFloat(selectedOrder.overallDiscount) / 100)}</td>
                      </tr>
                    )}
                    {selectedOrder.roundOff && parseFloat(selectedOrder.roundOff) !== 0 && (
                      <tr style={{ background:'#f8faff' }}>
                        <td colSpan={8} style={{ padding:'6px 10px', textAlign:'right', color:'#374151', border:`1px solid ${BD}` }}>Round Off:</td>
                        <td style={{ padding:'6px 10px', textAlign:'right', color:'#374151', fontWeight:600, border:`1px solid ${BD}` }}>₹{fmt(selectedOrder.roundOff)}</td>
                      </tr>
                    )}
                    <tr style={{ background:'#F0F4FF' }}>
                      <td colSpan={8} style={{ padding:'7px 10px', textAlign:'right', fontWeight:700, color:'#374151', border:`1px solid ${BD}` }}>Grand Total:</td>
                      <td style={{ padding:'7px 10px', textAlign:'right', fontWeight:800, color:P, border:`1px solid ${BD}`, fontSize:13 }}>₹{fmt(orderTotal)}</td>
                    </tr>
                    <tr style={{ background:'#ECFDF5' }}>
                      <td colSpan={8} style={{ padding:'7px 10px', textAlign:'right', color:'#059669', border:`1px solid ${BD}` }}>Previously Received (confirmed):</td>
                      <td style={{ padding:'7px 10px', textAlign:'right', fontWeight:700, color:'#059669', border:`1px solid ${BD}` }}>₹{fmt(previouslyReceived)}</td>
                    </tr>
                    <tr style={{ background: remaining<=0 ? '#ECFDF5' : '#FEF2F2' }}>
                      <td colSpan={8} style={{ padding:'7px 10px', textAlign:'right', fontWeight:700,
                        color: remaining<=0?'#059669':'#DC2626', border:`1px solid ${BD}` }}>Remaining Due:</td>
                      <td style={{ padding:'7px 10px', textAlign:'right', fontWeight:800, fontSize:13,
                        color: remaining<=0?'#059669':'#DC2626', border:`1px solid ${BD}` }}>
                        {remaining <= 0 ? '✓ Cleared' : `₹${fmt(remaining)}`}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Receipt Details */}
        <div style={card}>
          <div style={SH}>Receipt Details</div>
          <div style={{ padding:16, display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
            <FR label="Receipt Date *">
              <input type="date" value={form.date}
                onChange={e => setForm(p => ({ ...p, date: e.target.value }))}
                style={inp()} />
            </FR>
            <FR label="Amount Received (₹) *">
              <input type="number" value={form.amount}
                onChange={e => setForm(p => ({ ...p, amount: e.target.value }))}
                placeholder="0.00" style={inp()} />
            </FR>
            <FR label="Payment Mode">
              <select value={form.paymentMode}
                onChange={e => setForm(p => ({ ...p, paymentMode: e.target.value }))}
                style={{ ...inp(), cursor:'pointer' }}>
                {PAYMENT_MODES.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </FR>
            {BANK_MODES.includes(form.paymentMode) && (
              <FR label="Bank Account *">
                <select value={form.bankId}
                  onChange={e => setForm(p => ({ ...p, bankId: e.target.value }))}
                  style={{ ...inp(), cursor:'pointer' }}>
                  <option value="">-- Select Bank Account --</option>
                  {banks.map(b => (
                    <option key={b.bankId} value={b.bankId}>
                      {b.bankName} — {b.accountNumber} ({b.accountType})
                    </option>
                  ))}
                </select>
              </FR>
            )}
            <FR label="Reference / Cheque No." cols={BANK_MODES.includes(form.paymentMode) ? 'span 2' : 'span 1'}>
              <input value={form.referenceNo}
                onChange={e => setForm(p => ({ ...p, referenceNo: e.target.value }))}
                placeholder="e.g. TXN-123456, CHQ-789" style={inp()} />
            </FR>
            <FR label="Notes / Remarks" cols="span 2">
              <textarea value={form.notes}
                onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                rows={2} placeholder="Optional notes about this receipt…"
                style={{ ...inp(), height:'auto', padding:'8px 10px', resize:'vertical' }} />
            </FR>
          </div>
        </div>

        {/* Footer */}
        <div style={{ display:'flex', gap:10, justifyContent:'flex-end', paddingTop:4 }}>
          <button onClick={handleReset}
            style={{ height:36, padding:'0 20px', fontSize:13, fontFamily:F, cursor:'pointer',
              background:'#fff', color:'#374151', border:`1px solid ${BD}`, borderRadius:7, fontWeight:600 }}>
            ↺ Reset Form
          </button>
          <button onClick={handleSubmit} disabled={loading}
            style={{ height:36, padding:'0 24px', fontSize:13, fontFamily:F, cursor:'pointer',
              background: loading ? '#9CA3AF' : '#12B76A', color:'#fff', border:'none',
              borderRadius:7, fontWeight:700, boxShadow: loading ? 'none' : '0 2px 6px rgba(18,183,106,0.35)' }}>
            {loading ? 'Saving…' : '💰 Record Receipt'}
          </button>
        </div>
      </div>

      {/* Popups */}
      {showClientSearch && (
        <SearchPopup title="Search & Select Client"
          items={clients} columns={clientCols}
          onSelect={selectClient}
          onClose={() => setShowClientSearch(false)} />
      )}
      {showOrderSearch && (
        <SOSearchPopup title={`Sales Orders — ${selectedClient?.clientName || selectedClient?.companyName}`}
          orders={orders}
          onSelect={selectOrder}
          onClose={() => setShowOrderSearch(false)} />
      )}
    </div>
  );
};

export default CreateReceipt;
