import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { useCompany } from '../../../context/CompanyContext';

const PAYMENT_MODES = ['Cash', 'Bank Transfer', 'Cheque', 'UPI', 'NEFT', 'RTGS'];
const BANK_MODES    = ['Bank Transfer', 'Cheque', 'NEFT', 'RTGS'];
const P  = '#2F6FED';
const PD = '#1A56D6';
const BG = '#F5F7FB';
const BD = '#E5EAF2';
const F  = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

const fmt = n => (parseFloat(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });
const calcOrderTotal = (items = []) =>
  items.reduce((s, it) => {
    const base = (parseFloat(it.qty || it.quantity) || 0) * (parseFloat(it.rate) || 0);
    const disc = it.discountType === '%' ? base * (parseFloat(it.discount) || 0) / 100 : (parseFloat(it.discount) || 0);
    const taxable = base - disc;
    return s + taxable + taxable * (parseFloat(it.gstPercent) || 0) / 100;
  }, 0);

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

/* ── Search Popup ── */
function SearchPopup({ title, items, columns, onSelect, onClose }) {
  const [q, setQ] = useState('');
  const ref = useRef(null);
  useEffect(() => { ref.current?.focus(); }, []);

  const filtered = q.trim()
    ? items.filter(row => columns.some(col => String(row[col.key] || '').toLowerCase().includes(q.toLowerCase())))
    : items;

  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)',
        backdropFilter:'blur(2px)', zIndex:9000,
        display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
      <div style={{ background:'#fff', borderRadius:12, width:'100%', maxWidth:680,
        maxHeight:'80vh', display:'flex', flexDirection:'column',
        boxShadow:'0 20px 60px rgba(0,0,0,0.25)', border:`1px solid ${BD}` }}>

        {/* header */}
        <div style={{ background:P, color:'#fff', padding:'14px 18px',
          borderRadius:'12px 12px 0 0',
          display:'flex', justifyContent:'space-between', alignItems:'center', flexShrink:0 }}>
          <span style={{ fontSize:13, fontWeight:700, fontFamily:F }}>{title}</span>
          <button onClick={onClose} style={{ background:'rgba(255,255,255,0.15)', border:'1px solid rgba(255,255,255,0.25)',
            borderRadius:6, color:'#fff', width:28, height:28, cursor:'pointer', fontSize:16, display:'flex',
            alignItems:'center', justifyContent:'center' }}>✕</button>
        </div>

        {/* search */}
        <div style={{ padding:'10px 14px', borderBottom:`1px solid ${BD}`, flexShrink:0 }}>
          <input ref={ref} value={q} onChange={e => setQ(e.target.value)}
            placeholder="Type to search by name, ID, city, GST…"
            style={{ ...inp(), width:'100%' }}
          />
        </div>

        {/* results */}
        <div style={{ flex:1, overflowY:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12, fontFamily:F }}>
            <thead style={{ position:'sticky', top:0 }}>
              <tr style={{ background:P }}>
                {columns.map(c => (
                  <th key={c.key} style={{ padding:'8px 12px', color:'#fff', fontWeight:700,
                    textAlign:'left', border:`1px solid ${PD}`, whiteSpace:'nowrap', fontSize:11 }}>
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={columns.length} style={{ padding:24, textAlign:'center', color:'#9CA3AF', fontSize:13 }}>
                  No results found
                </td></tr>
              )}
              {filtered.map((row, i) => (
                <tr key={i} onClick={() => { onSelect(row); onClose(); }}
                  style={{ background: i % 2 === 0 ? '#fff' : '#FAFBFC', cursor:'pointer', transition:'background 0.12s' }}
                  onMouseEnter={e => e.currentTarget.style.background='#EEF4FF'}
                  onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? '#fff' : '#FAFBFC'}>
                  {columns.map(c => (
                    <td key={c.key} style={{ padding:'8px 12px', border:`1px solid ${BD}`, color:'#374151' }}>
                      {row[c.key] || '—'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ padding:'8px 14px', borderTop:`1px solid ${BD}`, fontSize:11,
          color:'#9CA3AF', fontFamily:F, flexShrink:0, background:'#FAFBFC', borderRadius:'0 0 12px 12px' }}>
          {filtered.length} result{filtered.length !== 1 ? 's' : ''} — click a row to select
        </div>
      </div>
    </div>
  );
}

/* ── Field Row ── */
function FR({ label, children, cols }) {
  return (
    <div style={{ gridColumn: cols || 'span 1' }}>
      <label style={lbl}>{label}</label>
      {children}
    </div>
  );
}

/* ══════════════════════════════════════════
   MAIN
══════════════════════════════════════════ */
const CreatePayment = () => {
  const { selectedCompany } = useCompany();
  const cid = selectedCompany?.companyId;

  const [vendors,       setVendors]       = useState([]);
  const [banks,         setBanks]         = useState([]);
  const [orders,        setOrders]        = useState([]);
  const [allPayments,   setAllPayments]   = useState([]);
  const [selectedVendor, setSelectedVendor] = useState(null);
  const [selectedOrder,  setSelectedOrder]  = useState(null);
  const [previouslyPaid, setPreviouslyPaid] = useState(0);
  const [showVendorSearch, setShowVendorSearch] = useState(false);
  const [showOrderSearch,  setShowOrderSearch]  = useState(false);
  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    amount: '', paymentMode: 'Bank Transfer', bankId: '', referenceNo: '', notes: '',
  });
  const [message, setMessage] = useState({ text: '', ok: true });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!cid) return;
    axios.get(`/api/vendors?companyId=${cid}`).then(r => setVendors(r.data)).catch(() => {});
    axios.get(`/api/accounts/banks?companyId=${cid}`).then(r => setBanks(r.data.filter(b => b.status === 'active'))).catch(() => {});
    axios.get(`/api/accounts/payments?companyId=${cid}`).then(r => setAllPayments(r.data)).catch(() => {});
  }, [cid]);

  const selectVendor = async (vendor) => {
    setSelectedVendor(vendor);
    setSelectedOrder(null); setOrders([]);
    try {
      const res = await axios.get(`/api/purchase-orders?companyId=${cid}`);
      const filt = res.data.filter(o =>
        String(o.vendorId) === String(vendor.vendorId) ||
        (o.vendorName || '').toLowerCase() === (vendor.vendorName || vendor.companyName || '').toLowerCase()
      );
      setOrders(filt);
    } catch {}
  };

  const selectOrder = (order) => {
    setSelectedOrder(order);
    const total = calcOrderTotal(order.items);
    const prevPaid = allPayments
      .filter(p => p.type === 'payment' && String(p.orderId) === String(order.orderId) && p.status === 'confirmed')
      .reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
    setPreviouslyPaid(prevPaid);
    const remaining = Math.max(0, total - prevPaid);
    setForm(p => ({ ...p, amount: remaining > 0 ? remaining.toFixed(2) : total > 0 ? total.toFixed(2) : '' }));
  };

  const handleReset = () => {
    setSelectedVendor(null); setSelectedOrder(null); setOrders([]);
    setForm({ date: new Date().toISOString().slice(0, 10), amount: '', paymentMode: 'Bank Transfer', bankId: '', referenceNo: '', notes: '' });
    setMessage({ text: '', ok: true });
  };

  const handleSubmit = async () => {
    if (!selectedVendor) { setMessage({ text: 'Please select a vendor.', ok: false }); return; }
    if (!form.amount)    { setMessage({ text: 'Please enter the payment amount.', ok: false }); return; }
    if (BANK_MODES.includes(form.paymentMode) && !form.bankId) {
      setMessage({ text: 'Please select a bank account for this payment mode.', ok: false }); return;
    }
    try {
      setLoading(true);
      setMessage({ text: '', ok: true });
      const res = await axios.post(`/api/accounts/payments?companyId=${cid}`, {
        ...form, type: 'payment', entityType: 'vendor',
        entityId: selectedVendor.vendorId,
        entityName: selectedVendor.vendorName || selectedVendor.companyName,
        orderId: selectedOrder?.orderId || '',
        orderType: 'purchase', status: 'pending', companyId: cid,
      });
      setMessage({ text: `✓ Payment recorded successfully! ID: ${res.data.paymentId}`, ok: true });
      handleReset();
    } catch (e) {
      setMessage({ text: 'Error: ' + (e.response?.data?.error || e.message), ok: false });
    } finally { setLoading(false); }
  };

  const vendorCols = [
    { key:'vendorId',   label:'ID' },
    { key:'vendorName', label:'Vendor Name' },
    { key:'vendorCode', label:'Code' },
    { key:'city',       label:'City' },
    { key:'gstin',      label:'GST' },
    { key:'status',     label:'Status' },
  ];
  const orderCols = [
    { key:'orderId',  label:'PO No.' },
    { key:'poDate',   label:'Date' },
    { key:'poType',   label:'Type' },
    { key:'status',   label:'Status' },
  ];

  const orderTotal = selectedOrder ? calcOrderTotal(selectedOrder.items) : 0;
  const remaining  = Math.max(0, orderTotal - previouslyPaid);

  return (
    <div style={{ background: BG, minHeight:'100%', fontFamily: F }}>

      {/* Header */}
      <div style={{ background: P, padding:'14px 20px',
        display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div>
          <div style={{ fontSize:11, color:'rgba(255,255,255,0.6)', fontWeight:500, textTransform:'uppercase', letterSpacing:'0.6px' }}>
            Finance — Payments
          </div>
          <div style={{ fontSize:15, fontWeight:800, color:'#fff', letterSpacing:'-0.2px' }}>
            Record Vendor Payment
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
            {loading ? 'Saving…' : '💾 Record Payment'}
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

        {/* Vendor Selection */}
        <div style={card}>
          <div style={SH}>Vendor</div>
          <div style={{ padding:16 }}>
            <div style={{ display:'flex', gap:10, alignItems:'flex-end' }}>
              <div style={{ flex:1 }}>
                <label style={lbl}>Vendor <span style={{ color:'#EF4444' }}>*</span></label>
                <input readOnly
                  value={selectedVendor ? `${selectedVendor.vendorName || selectedVendor.companyName} (ID: ${selectedVendor.vendorId})` : ''}
                  placeholder="Click Search to pick vendor…"
                  style={inp(true)} />
              </div>
              <button onClick={() => setShowVendorSearch(true)}
                style={{ height:36, padding:'0 16px', background:P, color:'#fff', border:'none',
                  borderRadius:6, cursor:'pointer', fontSize:12.5, fontFamily:F, fontWeight:700,
                  whiteSpace:'nowrap', flexShrink:0 }}>
                🔍 Search Vendor
              </button>
              {selectedVendor && (
                <button onClick={() => { setSelectedVendor(null); setSelectedOrder(null); setOrders([]); }}
                  style={{ height:36, padding:'0 12px', background:'#FEF2F2', color:'#DC2626',
                    border:'1px solid #FECACA', borderRadius:6, cursor:'pointer', fontSize:12.5, fontFamily:F }}>
                  ✕ Clear
                </button>
              )}
            </div>
            {selectedVendor && (
              <div style={{ display:'flex', gap:16, marginTop:10, padding:'8px 12px',
                background:'#F0F4FF', borderRadius:7, fontSize:12, color:'#374151', flexWrap:'wrap' }}>
                {selectedVendor.gstin  && <span>GST: <strong>{selectedVendor.gstin}</strong></span>}
                {selectedVendor.city   && <span>City: <strong>{selectedVendor.city}</strong></span>}
                {selectedVendor.state  && <span>State: <strong>{selectedVendor.state}</strong></span>}
                {selectedVendor.mobile && <span>Mobile: <strong>{selectedVendor.mobile}</strong></span>}
              </div>
            )}
          </div>
        </div>

        {/* PO Selection */}
        <div style={card}>
          <div style={SH}>Purchase Order (Optional)</div>
          <div style={{ padding:16 }}>
            <div style={{ display:'flex', gap:10, alignItems:'flex-end' }}>
              <div style={{ flex:1 }}>
                <label style={lbl}>Link Purchase Order</label>
                <input readOnly
                  value={selectedOrder ? `PO #${selectedOrder.orderId}  ${selectedOrder.poDate || ''}  ₹${fmt(orderTotal)}` : ''}
                  placeholder={selectedVendor ? 'Click Search to pick PO…' : 'Select vendor first'}
                  style={inp(true)} />
              </div>
              <button onClick={() => { if (selectedVendor) setShowOrderSearch(true); }}
                disabled={!selectedVendor}
                style={{ height:36, padding:'0 16px',
                  background: selectedVendor ? '#F0F4FF' : '#F9FAFB',
                  color: selectedVendor ? P : '#9CA3AF',
                  border:`1px solid ${selectedVendor ? P+'40' : BD}`,
                  borderRadius:6, cursor: selectedVendor ? 'pointer' : 'not-allowed',
                  fontSize:12.5, fontFamily:F, fontWeight:700, whiteSpace:'nowrap', flexShrink:0 }}>
                🔍 Search PO
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
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12, fontFamily:F }}>
                  <thead>
                    <tr style={{ background:P }}>
                      {['Item / Description','Qty','Rate','GST%','Amount'].map((h,i) => (
                        <th key={i} style={{ padding:'7px 10px', color:'#fff', fontWeight:700,
                          textAlign: i===0?'left':'right', border:`1px solid ${PD}`, fontSize:11 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(selectedOrder.items || []).map((it, i) => {
                      const base = (parseFloat(it.qty||it.quantity)||0) * (parseFloat(it.rate)||0);
                      const disc = it.discountType==='%' ? base*(parseFloat(it.discount)||0)/100 : (parseFloat(it.discount)||0);
                      const taxable = base - disc;
                      const gst = taxable * (parseFloat(it.gstPercent)||0) / 100;
                      return (
                        <tr key={i} style={{ background: i%2===0?'#fff':'#FAFBFC' }}>
                          <td style={{ padding:'7px 10px', border:`1px solid ${BD}` }}>{it.itemName||it.description}</td>
                          <td style={{ padding:'7px 10px', textAlign:'right', border:`1px solid ${BD}` }}>{it.qty||it.quantity} {it.unit}</td>
                          <td style={{ padding:'7px 10px', textAlign:'right', border:`1px solid ${BD}` }}>₹{fmt(it.rate)}</td>
                          <td style={{ padding:'7px 10px', textAlign:'right', border:`1px solid ${BD}`, color:'#6B7280' }}>{it.gstPercent||0}%</td>
                          <td style={{ padding:'7px 10px', textAlign:'right', border:`1px solid ${BD}`, fontWeight:700, color:P }}>₹{fmt(taxable+gst)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{ background:'#F0F4FF' }}>
                      <td colSpan={4} style={{ padding:'7px 10px', textAlign:'right', fontWeight:700, color:'#374151', border:`1px solid ${BD}` }}>PO Total:</td>
                      <td style={{ padding:'7px 10px', textAlign:'right', fontWeight:800, color:P, border:`1px solid ${BD}` }}>₹{fmt(orderTotal)}</td>
                    </tr>
                    <tr style={{ background:'#ECFDF5' }}>
                      <td colSpan={4} style={{ padding:'7px 10px', textAlign:'right', color:'#059669', border:`1px solid ${BD}` }}>Previously Paid (confirmed):</td>
                      <td style={{ padding:'7px 10px', textAlign:'right', fontWeight:700, color:'#059669', border:`1px solid ${BD}` }}>₹{fmt(previouslyPaid)}</td>
                    </tr>
                    <tr style={{ background: remaining <= 0 ? '#ECFDF5' : '#FEF2F2' }}>
                      <td colSpan={4} style={{ padding:'7px 10px', textAlign:'right', fontWeight:700,
                        color: remaining<=0?'#059669':'#DC2626', border:`1px solid ${BD}` }}>Remaining Due:</td>
                      <td style={{ padding:'7px 10px', textAlign:'right', fontWeight:800,
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

        {/* Payment Details */}
        <div style={card}>
          <div style={SH}>Payment Details</div>
          <div style={{ padding:16, display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
            <FR label="Payment Date *">
              <input type="date" value={form.date}
                onChange={e => setForm(p => ({ ...p, date: e.target.value }))}
                style={inp()} />
            </FR>
            <FR label="Amount (₹) *">
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
                rows={2} placeholder="Optional notes about this payment…"
                style={{ ...inp(), height:'auto', padding:'8px 10px', resize:'vertical' }} />
            </FR>
          </div>
        </div>

        {/* Footer actions */}
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
            {loading ? 'Saving…' : '💾 Record Payment'}
          </button>
        </div>
      </div>

      {/* Popups */}
      {showVendorSearch && (
        <SearchPopup title="Search & Select Vendor"
          items={vendors} columns={vendorCols}
          onSelect={selectVendor}
          onClose={() => setShowVendorSearch(false)} />
      )}
      {showOrderSearch && (
        <SearchPopup title={`Purchase Orders — ${selectedVendor?.vendorName || selectedVendor?.companyName}`}
          items={orders} columns={orderCols}
          onSelect={selectOrder}
          onClose={() => setShowOrderSearch(false)} />
      )}
    </div>
  );
};

export default CreatePayment;
