import React, { useState, useEffect, useRef, useMemo } from 'react';
import axios from 'axios';
import { useCompany } from '../../../context/CompanyContext';

const PAYMENT_MODES = ['Cash', 'Bank Transfer', 'Cheque', 'UPI', 'NEFT', 'RTGS'];
const BANK_MODES    = ['Bank Transfer', 'Cheque', 'NEFT', 'RTGS'];
const P  = '#104f4f';
const PD = '#0b3d3d';
const BG = '#F5F7FB';
const BD = '#E5EAF2';
const F  = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

const fmt = n => (parseFloat(n) || 0).toFixed(2);
const fmtD = d => {
  if (!d) return '—';
  const dt = new Date(d);
  return isNaN(dt) ? d : `${String(dt.getDate()).padStart(2,'0')}-${String(dt.getMonth()+1).padStart(2,'0')}-${dt.getFullYear()}`;
};
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
  boxSizing: 'border-box',
});
const lbl  = { fontSize: 12.5, fontWeight: 600, color: '#374151', marginBottom: 5, display: 'block', fontFamily: F };
const SH   = { background: P, padding: '8px 16px', fontSize: 11, fontWeight: 800, color: '#fff', textTransform: 'uppercase', letterSpacing: '0.8px' };
const card = { background: '#fff', border: `1px solid ${BD}`, borderRadius: 10, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', marginBottom: 14 };

/* ── Generic search popup ── */
function SearchPopup({ title, items, columns, onSelect, onClose }) {
  const [q, setQ] = useState('');
  const ref = useRef(null);
  useEffect(() => { ref.current?.focus(); }, []);
  const filtered = q.trim()
    ? items.filter(row => columns.some(c => String(row[c.key] || '').toLowerCase().includes(q.toLowerCase())))
    : items;
  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', backdropFilter:'blur(2px)', zIndex:9000,
        display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
      <div style={{ background:'#fff', borderRadius:12, width:'100%', maxWidth:680, maxHeight:'80vh',
        display:'flex', flexDirection:'column', boxShadow:'0 20px 60px rgba(0,0,0,0.25)', border:`1px solid ${BD}` }}>
        <div style={{ background:P, color:'#fff', padding:'14px 18px', borderRadius:'12px 12px 0 0',
          display:'flex', justifyContent:'space-between', alignItems:'center', flexShrink:0 }}>
          <span style={{ fontSize:13, fontWeight:700, fontFamily:F }}>{title}</span>
          <button onClick={onClose} style={{ background:'rgba(255,255,255,0.15)', border:'1px solid rgba(255,255,255,0.25)',
            borderRadius:6, color:'#fff', width:28, height:28, cursor:'pointer', fontSize:16 }}>✕</button>
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
                  <th key={c.key} style={{ padding:'8px 12px', color:'#fff', fontWeight:700, textAlign:'left', border:`1px solid ${PD}`, whiteSpace:'nowrap', fontSize:11 }}>{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && <tr><td colSpan={columns.length} style={{ padding:24, textAlign:'center', color:'#9CA3AF', fontSize:13 }}>No results found</td></tr>}
              {filtered.map((row, i) => (
                <tr key={i} onClick={() => { onSelect(row); onClose(); }}
                  style={{ background: i%2===0?'#fff':'#FAFBFC', cursor:'pointer' }}
                  onMouseEnter={e => e.currentTarget.style.background='#EEF4FF'}
                  onMouseLeave={e => e.currentTarget.style.background = i%2===0?'#fff':'#FAFBFC'}>
                  {columns.map(c => <td key={c.key} style={{ padding:'8px 12px', border:`1px solid ${BD}`, color:'#374151' }}>{row[c.key] || '—'}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ padding:'8px 14px', borderTop:`1px solid ${BD}`, fontSize:11, color:'#9CA3AF', fontFamily:F, flexShrink:0, background:'#FAFBFC', borderRadius:'0 0 12px 12px' }}>
          {filtered.length} result{filtered.length !== 1 ? 's' : ''} — click a row to select
        </div>
      </div>
    </div>
  );
}

/* ── PO Search Popup ── */
function POSearchPopup({ title, orders, onSelect, onClose }) {
  const [q, setQ] = useState('');
  const ref = useRef(null);
  useEffect(() => { ref.current?.focus(); }, []);
  const filtered = q.trim()
    ? orders.filter(o =>
        String(o.orderId || '').includes(q) ||
        (o.poNo||o.poNumber||'').toLowerCase().includes(q.toLowerCase()) ||
        (o.vendorName||'').toLowerCase().includes(q.toLowerCase()) ||
        (o.items||[]).some(it => (it.itemName||it.description||'').toLowerCase().includes(q.toLowerCase()))
      )
    : orders;
  const sc = s => s==='approved'?{bg:'#d1fae5',color:'#065f46'}:s==='pending'?{bg:'#fef3c7',color:'#92400e'}:{bg:'#f3f4f6',color:'#374151'};
  return (
    <div onClick={e => { if (e.target===e.currentTarget) onClose(); }}
      style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', backdropFilter:'blur(2px)',
        zIndex:9000, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
      <div style={{ background:'#fff', borderRadius:12, width:'100%', maxWidth:900, maxHeight:'85vh',
        display:'flex', flexDirection:'column', boxShadow:'0 20px 60px rgba(0,0,0,0.3)', border:`1px solid ${BD}` }}>
        <div style={{ background:P, color:'#fff', padding:'14px 18px', borderRadius:'12px 12px 0 0',
          display:'flex', justifyContent:'space-between', alignItems:'center', flexShrink:0 }}>
          <div>
            <div style={{ fontSize:14, fontWeight:700, fontFamily:F }}>{title}</div>
            <div style={{ fontSize:10.5, color:'rgba(255,255,255,0.65)', marginTop:1 }}>{filtered.length} order{filtered.length!==1?'s':''} — click to select</div>
          </div>
          <button onClick={onClose} style={{ background:'rgba(255,255,255,0.15)', border:'1px solid rgba(255,255,255,0.25)',
            borderRadius:6, color:'#fff', width:30, height:30, cursor:'pointer', fontSize:17 }}>✕</button>
        </div>
        <div style={{ padding:'10px 14px', borderBottom:`1px solid ${BD}`, flexShrink:0 }}>
          <input ref={ref} value={q} onChange={e => setQ(e.target.value)}
            placeholder="Search by PO #, PO No, material…" style={{ ...inp(), width:'100%' }} />
        </div>
        <div style={{ flex:1, overflowY:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12, fontFamily:F }}>
            <thead style={{ position:'sticky', top:0, zIndex:2 }}>
              <tr style={{ background:P }}>
                {['PO #','PO No','Date','Vendor','PO Value','Status'].map((h,i) => (
                  <th key={i} style={{ padding:'8px 10px', color:'#fff', fontWeight:700, textAlign:'left', border:`1px solid rgba(255,255,255,0.2)`, whiteSpace:'nowrap', fontSize:11 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && <tr><td colSpan={6} style={{ padding:32, textAlign:'center', color:'#9CA3AF', fontSize:13, fontStyle:'italic' }}>No orders found</td></tr>}
              {filtered.map((o, i) => {
                const c = sc(o.status);
                return (
                  <tr key={String(o.orderId||i)} onClick={() => { onSelect(o); onClose(); }}
                    style={{ background: i%2===0?'#fff':'#F8FAFF', cursor:'pointer' }}
                    onMouseEnter={e => e.currentTarget.style.background='#EEF4FF'}
                    onMouseLeave={e => e.currentTarget.style.background = i%2===0?'#fff':'#F8FAFF'}>
                    <td style={{ padding:'8px 10px', border:`1px solid ${BD}`, fontWeight:700, color:P }}>{o.orderId}</td>
                    <td style={{ padding:'8px 10px', border:`1px solid ${BD}` }}>{o.poNo||o.poNumber||'—'}</td>
                    <td style={{ padding:'8px 10px', border:`1px solid ${BD}`, whiteSpace:'nowrap' }}>{o.poDate||'—'}</td>
                    <td style={{ padding:'8px 10px', border:`1px solid ${BD}` }}>{o.vendorName||'—'}</td>
                    <td style={{ padding:'8px 10px', border:`1px solid ${BD}`, fontWeight:700, color:P }}>{o._total||'—'}</td>
                    <td style={{ padding:'8px 10px', border:`1px solid ${BD}` }}>
                      <span style={{ fontSize:10.5, fontWeight:700, padding:'2px 8px', borderRadius:20, background:c.bg, color:c.color }}>{o.status||'—'}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
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

/* ══════════════════════════════════════════
   MAIN
══════════════════════════════════════════ */
const CreatePayment = () => {
  const { selectedCompany } = useCompany();
  const cid = selectedCompany?.companyId;

  /* party type: 'vendor' | 'ledger' */
  const [partyType, setPartyType] = useState('vendor');

  /* vendor flow */
  const [vendors,        setVendors]        = useState([]);
  const [orders,         setOrders]         = useState([]);
  const [allPayments,    setAllPayments]    = useState([]);
  const [selectedVendor, setSelectedVendor] = useState(null);
  const [selectedOrder,  setSelectedOrder]  = useState(null);
  const [previouslyPaid, setPreviouslyPaid] = useState(0);
  const [showVendorSearch, setShowVendorSearch] = useState(false);
  const [showOrderSearch,  setShowOrderSearch]  = useState(false);

  /* ledger flow */
  const [ledgers,         setLedgers]         = useState([]);
  const [selectedLedger,  setSelectedLedger]  = useState(null);
  const [ledgerExpenses,  setLedgerExpenses]  = useState([]);
  const [selectedExpIds,  setSelectedExpIds]  = useState(new Set());
  const [purpose,         setPurpose]         = useState('');
  const [showLedgerSearch, setShowLedgerSearch] = useState(false);

  /* common */
  const [banks,   setBanks]   = useState([]);
  const [form,    setForm]    = useState({
    date: new Date().toISOString().slice(0, 10),
    amount: '', paymentMode: 'Bank Transfer', bankId: '', referenceNo: '', notes: '',
  });
  const [message, setMessage] = useState({ text: '', ok: true });
  const [loading, setLoading] = useState(false);

  /* email advice modal */
  const [adviceModal,    setAdviceModal]    = useState(null); // { paymentId, partyName, amount, email }
  const [adviceEmail,    setAdviceEmail]    = useState('');
  const [sendingAdvice,  setSendingAdvice]  = useState(false);
  const [adviceMsg,      setAdviceMsg]      = useState('');

  useEffect(() => {
    if (!cid) return;
    axios.get(`/api/vendors?companyId=${cid}`).then(r => setVendors(r.data || [])).catch(() => {});
    axios.get(`/api/accounts/banks?companyId=${cid}`).then(r => setBanks((r.data || []).filter(b => b.status === 'active'))).catch(() => {});
    axios.get(`/api/accounts/payments?companyId=${cid}`).then(r => setAllPayments(r.data || [])).catch(() => {});
    axios.get(`/api/ledger/accounts?companyId=${cid}`).then(r => setLedgers(r.data || [])).catch(() => {});
  }, [cid]);

  /* ── vendor helpers ── */
  const selectVendor = async (vendor) => {
    setSelectedVendor(vendor); setSelectedOrder(null); setOrders([]);
    try {
      const res = await axios.get(`/api/purchase-orders?companyId=${cid}`);
      const vName = (vendor.vendorName || vendor.companyName || '').toLowerCase().trim();
      const vCode = String(vendor.vendorCode || vendor.vendorId || '');
      const filt  = res.data.filter(o => {
        const nm = vName && (o.vendorName || '').toLowerCase().trim() === vName;
        const cd = vCode && (String(o.vendorCode||'')===vCode || String(o.vendorId||'')===vCode);
        return cd || nm;
      });
      setOrders(filt.map(o => ({ ...o, _total: `₹${fmt(o.grandTotal || calcOrderTotal(o.items))}` })));
    } catch {}
  };

  const selectOrder = (order) => {
    setSelectedOrder(order);
    const total = calcOrderTotal(order.items);
    const prevPaid = allPayments
      .filter(p => p.type==='payment' && String(p.orderId)===String(order.orderId) && p.status==='confirmed')
      .reduce((s,p) => s+(parseFloat(p.amount)||0), 0);
    setPreviouslyPaid(prevPaid);
    const rem = Math.max(0, total - prevPaid);
    setForm(f => ({ ...f, amount: (rem > 0 ? rem : total > 0 ? total : 0).toFixed(2) }));
  };

  /* ── ledger helpers ── */
  const selectLedger = async (ledger) => {
    setSelectedLedger(ledger);
    setSelectedExpIds(new Set());
    setPurpose('');
    setForm(f => ({ ...f, amount: '' }));
    try {
      const res = await axios.get(`/api/accounts/expenses?companyId=${cid}`);
      const exps = (res.data || []).filter(e => {
        if (['rejected','draft'].includes(e.status)) return false;
        const lName = (e.ledgerName || '').toLowerCase().trim();
        const lId   = String(e.ledgerId || '');
        return lName === (ledger.name || '').toLowerCase().trim() || lId === String(ledger.id || '');
      });
      // attach already-paid amount for each expense
      const withPaid = exps.map(e => {
        const paid = allPayments
          .filter(p => p.type==='payment' && p.status!=='rejected' &&
            (String(p.expenseId)===String(e.expenseId) || String(p.orderId)===String(e.expenseId)))
          .reduce((s,p) => s+(parseFloat(p.amount)||0), 0);
        return { ...e, _paid: paid, _remaining: Math.max(0, (parseFloat(e.grandTotal)||0) - paid) };
      }).filter(e => e._remaining > 0);
      setLedgerExpenses(withPaid);
    } catch {}
  };

  const toggleExp = (expId, amt) => {
    setSelectedExpIds(prev => {
      const next = new Set(prev);
      next.has(expId) ? next.delete(expId) : next.add(expId);
      return next;
    });
  };

  /* auto-sum selected expense amounts into payment amount */
  const selectedExps = useMemo(() => ledgerExpenses.filter(e => selectedExpIds.has(e.expenseId)), [ledgerExpenses, selectedExpIds]);
  useEffect(() => {
    if (partyType !== 'ledger') return;
    const total = selectedExps.reduce((s,e) => s + e._remaining, 0);
    if (selectedExps.length > 0) setForm(f => ({ ...f, amount: total.toFixed(2) }));
  }, [selectedExps, partyType]);

  /* ── reset ── */
  const handleReset = () => {
    setSelectedVendor(null); setSelectedOrder(null); setOrders([]);
    setSelectedLedger(null); setLedgerExpenses([]); setSelectedExpIds(new Set()); setPurpose('');
    setForm({ date: new Date().toISOString().slice(0,10), amount:'', paymentMode:'Bank Transfer', bankId:'', referenceNo:'', notes:'' });
    setMessage({ text:'', ok:true });
  };

  /* ── submit ── */
  const handleSubmit = async () => {
    if (partyType === 'vendor') {
      if (!selectedVendor) { setMessage({ text:'Please select a vendor.', ok:false }); return; }
    } else {
      if (!selectedLedger) { setMessage({ text:'Please select a ledger account.', ok:false }); return; }
      if (ledgerExpenses.length > 0 && selectedExpIds.size === 0) {
        setMessage({ text:'Please select at least one expense bill to pay.', ok:false }); return;
      }
      if (ledgerExpenses.length === 0 && !purpose.trim()) {
        setMessage({ text:'Please enter the purpose of this payment.', ok:false }); return;
      }
    }
    if (!form.amount || parseFloat(form.amount) <= 0) { setMessage({ text:'Please enter a valid payment amount.', ok:false }); return; }
    if (BANK_MODES.includes(form.paymentMode) && !form.bankId) {
      setMessage({ text:'Please select a bank account for this payment mode.', ok:false }); return;
    }
    try {
      setLoading(true); setMessage({ text:'', ok:true });
      const payload = {
        ...form, type:'payment', status:'pending', companyId: cid,
        ...(partyType === 'vendor' ? {
          entityType: 'vendor',
          entityId:   selectedVendor.vendorId,
          entityName: selectedVendor.vendorName || selectedVendor.companyName,
          orderId:    selectedOrder?.orderId || '',
          orderType:  'purchase',
        } : {
          entityType:      'ledger',
          entityId:        selectedLedger.id,
          entityName:      selectedLedger.name,
          orderId:         selectedExps.length === 1 ? String(selectedExps[0].expenseId) : '',
          linkedExpenses:  selectedExps.map(e => ({ expenseId: e.expenseId, expNo: `EXP-${e.expenseId}`, amount: e._remaining })),
          purpose:         purpose || selectedExps.map(e => e.description || `EXP-${e.expenseId}`).join(', '),
        }),
      };
      const res = await axios.post(`/api/accounts/payments?companyId=${cid}`, payload);
      const savedId = res.data.paymentId;
      setMessage({ text:`✓ Payment recorded! ID: ${savedId}`, ok:true });

      /* determine email for advice */
      let partyEmail = '';
      let partyName  = '';
      if (partyType === 'vendor') {
        partyEmail = selectedVendor?.email || selectedVendor?.vendorEmail || '';
        partyName  = selectedVendor?.vendorName || selectedVendor?.companyName || '';
      } else {
        partyEmail = selectedLedger?.email || '';
        partyName  = selectedLedger?.name || '';
      }
      setAdviceEmail(partyEmail);
      setAdviceMsg('');
      setAdviceModal({ paymentId: savedId, partyName, amount: parseFloat(form.amount)||0, defaultEmail: partyEmail });
      handleReset();
    } catch (e) {
      setMessage({ text:'Error: '+(e.response?.data?.error||e.message), ok:false });
    } finally { setLoading(false); }
  };

  const orderTotal = selectedOrder ? calcOrderTotal(selectedOrder.items) : 0;
  const remaining  = Math.max(0, orderTotal - previouslyPaid);

  const vendorCols  = [
    { key:'vendorId', label:'ID' }, { key:'vendorName', label:'Vendor Name' },
    { key:'vendorCode', label:'Code' }, { key:'city', label:'City' }, { key:'gstin', label:'GST' },
  ];
  const ledgerCols  = [
    { key:'name', label:'Account Name' }, { key:'group', label:'Group' },
    { key:'code', label:'Code' }, { key:'openingBalance', label:'Opening Bal.' },
  ];

  return (
    <div style={{ background:BG, minHeight:'100%', fontFamily:F }}>

      {/* Header */}
      <div style={{ background:P, padding:'14px 20px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div>
          <div style={{ fontSize:11, color:'rgba(255,255,255,0.6)', fontWeight:500, textTransform:'uppercase', letterSpacing:'0.6px' }}>Finance — Payments</div>
          <div style={{ fontSize:15, fontWeight:800, color:'#fff', letterSpacing:'-0.2px' }}>Record Payment</div>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={handleReset}
            style={{ height:32, padding:'0 14px', fontSize:12, fontFamily:F, cursor:'pointer',
              background:'rgba(255,255,255,0.12)', color:'#fff', border:'1px solid rgba(255,255,255,0.25)', borderRadius:6, fontWeight:600 }}>
            ↺ Reset
          </button>
          <button onClick={handleSubmit} disabled={loading}
            style={{ height:32, padding:'0 18px', fontSize:12, fontFamily:F, cursor:'pointer',
              background:'#12B76A', color:'#fff', border:'none', borderRadius:6, fontWeight:700, opacity:loading?0.7:1 }}>
            {loading ? 'Saving…' : '💾 Record Payment'}
          </button>
        </div>
      </div>

      {message.text && (
        <div style={{ margin:'10px 16px 0', padding:'10px 14px', fontSize:12.5, fontFamily:F,
          background:message.ok?'#ECFDF5':'#FEF2F2', color:message.ok?'#059669':'#DC2626',
          border:`1px solid ${message.ok?'#A7F3D0':'#FECACA'}`, borderRadius:8 }}>
          {message.text}
        </div>
      )}

      <div style={{ padding:'14px 16px' }}>

        {/* ── Party Type Toggle ── */}
        <div style={card}>
          <div style={SH}>Payment Type</div>
          <div style={{ padding:'14px 16px', display:'flex', gap:10 }}>
            {[['vendor','🏢 Vendor / Supplier','Pay against a purchase order'],
              ['ledger','📒 Ledger Account','Pay an expense / party account']].map(([val, label, desc]) => (
              <button key={val} onClick={() => { setPartyType(val); handleReset(); }}
                style={{ flex:1, padding:'12px 16px', borderRadius:8, cursor:'pointer', fontFamily:F, textAlign:'left',
                  border:`2px solid ${partyType===val ? P : BD}`,
                  background: partyType===val ? '#f0fdf9' : '#fafbff',
                  transition:'all 0.12s' }}>
                <div style={{ fontSize:13, fontWeight:700, color: partyType===val ? P : '#374151' }}>{label}</div>
                <div style={{ fontSize:11, color:'#9ca3af', marginTop:3 }}>{desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* ══ VENDOR FLOW ══ */}
        {partyType === 'vendor' && (<>

          {/* Vendor Selection */}
          <div style={card}>
            <div style={SH}>Vendor</div>
            <div style={{ padding:16 }}>
              <div style={{ display:'flex', gap:10, alignItems:'flex-end' }}>
                <div style={{ flex:1 }}>
                  <label style={lbl}>Vendor <span style={{ color:'#EF4444' }}>*</span></label>
                  <input readOnly
                    value={selectedVendor ? `${selectedVendor.vendorName||selectedVendor.companyName} (ID: ${selectedVendor.vendorId})` : ''}
                    placeholder="Click Search to pick vendor…" style={inp(true)} />
                </div>
                <button onClick={() => setShowVendorSearch(true)}
                  style={{ height:36, padding:'0 16px', background:P, color:'#fff', border:'none',
                    borderRadius:6, cursor:'pointer', fontSize:12.5, fontFamily:F, fontWeight:700, whiteSpace:'nowrap', flexShrink:0 }}>
                  🔍 Search Vendor
                </button>
                {selectedVendor && (
                  <button onClick={() => { setSelectedVendor(null); setSelectedOrder(null); setOrders([]); }}
                    style={{ height:36, padding:'0 12px', background:'#FEF2F2', color:'#DC2626', border:'1px solid #FECACA', borderRadius:6, cursor:'pointer', fontSize:12.5, fontFamily:F }}>
                    ✕
                  </button>
                )}
              </div>
              {selectedVendor && (
                <div style={{ display:'flex', gap:16, marginTop:10, padding:'8px 12px', background:'#F0F4FF', borderRadius:7, fontSize:12, color:'#374151', flexWrap:'wrap' }}>
                  {selectedVendor.gstin  && <span>GST: <strong>{selectedVendor.gstin}</strong></span>}
                  {selectedVendor.city   && <span>City: <strong>{selectedVendor.city}</strong></span>}
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
                    value={selectedOrder ? `PO #${selectedOrder.orderId}  ${selectedOrder.poDate||''}  ₹${fmt(orderTotal)}` : ''}
                    placeholder={selectedVendor ? 'Click Search to pick PO…' : 'Select vendor first'}
                    style={inp(true)} />
                </div>
                <button onClick={() => { if (selectedVendor) setShowOrderSearch(true); }} disabled={!selectedVendor}
                  style={{ height:36, padding:'0 16px', background:selectedVendor?'#F0F4FF':'#F9FAFB',
                    color:selectedVendor?P:'#9CA3AF', border:`1px solid ${selectedVendor?P+'40':BD}`,
                    borderRadius:6, cursor:selectedVendor?'pointer':'not-allowed', fontSize:12.5, fontFamily:F, fontWeight:700, whiteSpace:'nowrap', flexShrink:0 }}>
                  🔍 Search PO
                </button>
                {selectedOrder && (
                  <button onClick={() => setSelectedOrder(null)}
                    style={{ height:36, padding:'0 12px', background:'#FEF2F2', color:'#DC2626', border:'1px solid #FECACA', borderRadius:6, cursor:'pointer', fontSize:12.5, fontFamily:F }}>✕</button>
                )}
              </div>

              {selectedOrder && (
                <div style={{ marginTop:12, border:`1px solid ${BD}`, borderRadius:8, overflow:'hidden' }}>
                  <div style={{ background:'#f0f4ff', borderBottom:`1px solid ${BD}`, display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:0 }}>
                    {[['PO #', selectedOrder.orderId],['PO Date', selectedOrder.poDate||'—'],['Linked SO', selectedOrder.linkedSO||'—'],['Status', selectedOrder.status||'—']].map(([l,v],i)=>(
                      <div key={i} style={{ padding:'8px 12px', borderRight:i<3?`1px solid ${BD}`:'none' }}>
                        <div style={{ fontSize:10, color:'#6B7280', fontWeight:600, textTransform:'uppercase', marginBottom:2 }}>{l}</div>
                        <div style={{ fontSize:13, fontWeight:700, color:P }}>{v}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ background:'#fafbfc', padding:'8px 14px', display:'flex', gap:24, fontSize:12 }}>
                    <span>PO Value: <strong style={{ color:P }}>₹{fmt(orderTotal)}</strong></span>
                    <span>Paid: <strong style={{ color:'#059669' }}>₹{fmt(previouslyPaid)}</strong></span>
                    <span>Remaining: <strong style={{ color: remaining<=0?'#059669':'#DC2626' }}>{remaining<=0?'✓ Cleared':`₹${fmt(remaining)}`}</strong></span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </>)}

        {/* ══ LEDGER FLOW ══ */}
        {partyType === 'ledger' && (<>

          {/* Ledger Selection */}
          <div style={card}>
            <div style={SH}>Ledger Account</div>
            <div style={{ padding:16 }}>
              <div style={{ display:'flex', gap:10, alignItems:'flex-end' }}>
                <div style={{ flex:1 }}>
                  <label style={lbl}>Ledger / Party Account <span style={{ color:'#EF4444' }}>*</span></label>
                  <input readOnly
                    value={selectedLedger ? `${selectedLedger.name}${selectedLedger.group?' — '+selectedLedger.group:''}` : ''}
                    placeholder="Click Search to pick ledger account…" style={inp(true)} />
                </div>
                <button onClick={() => setShowLedgerSearch(true)}
                  style={{ height:36, padding:'0 16px', background:P, color:'#fff', border:'none',
                    borderRadius:6, cursor:'pointer', fontSize:12.5, fontFamily:F, fontWeight:700, whiteSpace:'nowrap', flexShrink:0 }}>
                  🔍 Search Ledger
                </button>
                {selectedLedger && (
                  <button onClick={() => { setSelectedLedger(null); setLedgerExpenses([]); setSelectedExpIds(new Set()); setPurpose(''); setForm(f=>({...f,amount:''})); }}
                    style={{ height:36, padding:'0 12px', background:'#FEF2F2', color:'#DC2626', border:'1px solid #FECACA', borderRadius:6, cursor:'pointer', fontSize:12.5, fontFamily:F }}>✕</button>
                )}
              </div>
            </div>
          </div>

          {/* Expense Bills */}
          {selectedLedger && (
            <div style={card}>
              <div style={{ ...SH, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <span>Expense Bills{ledgerExpenses.length>0?` (${ledgerExpenses.length} pending)`:''}</span>
                {selectedExpIds.size>0 && (
                  <span style={{ fontSize:11, background:'rgba(255,255,255,0.2)', padding:'2px 10px', borderRadius:20 }}>
                    {selectedExpIds.size} selected · ₹{fmt(selectedExps.reduce((s,e)=>s+e._remaining,0))} total
                  </span>
                )}
              </div>
              <div style={{ padding:16 }}>
                {ledgerExpenses.length === 0 ? (
                  /* No bills — ask for purpose */
                  <div>
                    <div style={{ padding:'12px 16px', background:'#FFF7ED', border:'1px solid #FED7AA', borderRadius:8, marginBottom:14, fontSize:12.5, color:'#92400E' }}>
                      No pending expense bills found for <strong>{selectedLedger.name}</strong>. Please enter the payment purpose below.
                    </div>
                    <label style={lbl}>Payment Purpose <span style={{ color:'#EF4444' }}>*</span></label>
                    <textarea value={purpose} onChange={e => setPurpose(e.target.value)} rows={2}
                      placeholder="e.g. Freight charges, Labour payment, Professional fees…"
                      style={{ ...inp(), height:'auto', padding:'8px 10px', resize:'vertical', width:'100%' }} />
                  </div>
                ) : (
                  <div>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
                      <span style={{ fontSize:12, color:'#6B7280' }}>Select one or more bills for this payment:</span>
                      <div style={{ display:'flex', gap:8 }}>
                        <button onClick={() => setSelectedExpIds(new Set(ledgerExpenses.map(e=>e.expenseId)))}
                          style={{ height:26, padding:'0 10px', fontSize:11, fontFamily:F, cursor:'pointer', borderRadius:5, border:`1px solid ${P}`, background:'#f0fdf9', color:P, fontWeight:600 }}>
                          Select All
                        </button>
                        <button onClick={() => setSelectedExpIds(new Set())}
                          style={{ height:26, padding:'0 10px', fontSize:11, fontFamily:F, cursor:'pointer', borderRadius:5, border:`1px solid ${BD}`, background:'#fff', color:'#6B7280' }}>
                          Clear
                        </button>
                      </div>
                    </div>

                    <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12, fontFamily:F }}>
                      <thead>
                        <tr style={{ background:P }}>
                          <th style={{ width:36, padding:'7px 10px', color:'#fff', fontWeight:700, textAlign:'center', border:`1px solid ${PD}` }}>✓</th>
                          <th style={{ padding:'7px 10px', color:'#fff', fontWeight:700, textAlign:'left', border:`1px solid ${PD}` }}>Exp No</th>
                          <th style={{ padding:'7px 10px', color:'#fff', fontWeight:700, textAlign:'left', border:`1px solid ${PD}` }}>Date</th>
                          <th style={{ padding:'7px 10px', color:'#fff', fontWeight:700, textAlign:'left', border:`1px solid ${PD}` }}>Description</th>
                          <th style={{ padding:'7px 10px', color:'#fff', fontWeight:700, textAlign:'left', border:`1px solid ${PD}` }}>Category</th>
                          <th style={{ padding:'7px 10px', color:'#fff', fontWeight:700, textAlign:'right', border:`1px solid ${PD}` }}>Bill Amt (₹)</th>
                          <th style={{ padding:'7px 10px', color:'#fff', fontWeight:700, textAlign:'right', border:`1px solid ${PD}` }}>Paid (₹)</th>
                          <th style={{ padding:'7px 10px', color:'#fff', fontWeight:700, textAlign:'right', border:`1px solid ${PD}` }}>Remaining (₹)</th>
                          <th style={{ padding:'7px 10px', color:'#fff', fontWeight:700, textAlign:'left', border:`1px solid ${PD}` }}>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ledgerExpenses.map((e, i) => {
                          const sel = selectedExpIds.has(e.expenseId);
                          const bg = sel ? '#f0fdf9' : i%2===0?'#fff':'#fafbfc';
                          return (
                            <tr key={e.expenseId}
                              onClick={() => toggleExp(e.expenseId)}
                              style={{ background:bg, cursor:'pointer', transition:'background 0.1s', borderLeft: sel?`3px solid ${P}`:'3px solid transparent' }}
                              onMouseEnter={el => { if (!sel) el.currentTarget.style.background='#f0f4ff'; }}
                              onMouseLeave={el => { el.currentTarget.style.background = bg; }}>
                              <td style={{ padding:'8px 10px', border:`1px solid ${BD}`, textAlign:'center' }}>
                                <input type="checkbox" checked={sel} onChange={() => toggleExp(e.expenseId)}
                                  onClick={ev => ev.stopPropagation()}
                                  style={{ width:15, height:15, accentColor:P, cursor:'pointer' }} />
                              </td>
                              <td style={{ padding:'8px 10px', border:`1px solid ${BD}`, fontWeight:700, color:P, whiteSpace:'nowrap' }}>EXP-{e.expenseId}</td>
                              <td style={{ padding:'8px 10px', border:`1px solid ${BD}`, whiteSpace:'nowrap', color:'#6B7280' }}>{fmtD(e.date)}</td>
                              <td style={{ padding:'8px 10px', border:`1px solid ${BD}`, color:'#374151', maxWidth:200, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{e.description||'—'}</td>
                              <td style={{ padding:'8px 10px', border:`1px solid ${BD}`, color:'#6B7280', fontSize:11 }}>{e.expenseCategory||e.category||'—'}</td>
                              <td style={{ padding:'8px 10px', border:`1px solid ${BD}`, textAlign:'right', fontWeight:600 }}>₹{fmt(e.grandTotal)}</td>
                              <td style={{ padding:'8px 10px', border:`1px solid ${BD}`, textAlign:'right', color:'#059669' }}>₹{fmt(e._paid)}</td>
                              <td style={{ padding:'8px 10px', border:`1px solid ${BD}`, textAlign:'right', fontWeight:700, color:'#b71c1c' }}>₹{fmt(e._remaining)}</td>
                              <td style={{ padding:'8px 10px', border:`1px solid ${BD}` }}>
                                <span style={{ fontSize:10, fontWeight:700, padding:'2px 7px', borderRadius:20,
                                  background: e.status==='approved'?'#d1fae5':e.status==='pending_approval'?'#fef3c7':'#f3f4f6',
                                  color: e.status==='approved'?'#065f46':e.status==='pending_approval'?'#92400e':'#374151' }}>
                                  {e.status==='pending_approval'?'Pending Approval':e.status||'—'}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      {selectedExpIds.size > 0 && (
                        <tfoot>
                          <tr style={{ background:'#f0fdf9' }}>
                            <td colSpan={7} style={{ padding:'8px 10px', fontWeight:700, color:P, fontSize:12, border:`1px solid ${BD}`, textAlign:'right' }}>
                              Payment Total ({selectedExpIds.size} bill{selectedExpIds.size>1?'s':''}):
                            </td>
                            <td style={{ padding:'8px 10px', fontWeight:800, color:P, fontSize:13, border:`1px solid ${BD}`, textAlign:'right' }}>
                              ₹{fmt(selectedExps.reduce((s,e)=>s+e._remaining,0))}
                            </td>
                            <td style={{ border:`1px solid ${BD}` }}/>
                          </tr>
                        </tfoot>
                      )}
                    </table>

                    {/* Optional additional purpose */}
                    <div style={{ marginTop:12 }}>
                      <label style={lbl}>Additional Remarks (optional)</label>
                      <input value={purpose} onChange={e => setPurpose(e.target.value)}
                        placeholder="Any additional notes for this payment…" style={inp()} />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </>)}

        {/* ── Payment Details ── */}
        <div style={card}>
          <div style={SH}>Payment Details</div>
          <div style={{ padding:16, display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
            <FR label="Payment Date *">
              <input type="date" value={form.date}
                onChange={e => setForm(f => ({ ...f, date:e.target.value }))} style={inp()} />
            </FR>
            <FR label="Amount (₹) *">
              <input type="number" value={form.amount}
                onChange={e => setForm(f => ({ ...f, amount:e.target.value }))}
                placeholder="0.00" style={inp()} />
            </FR>
            <FR label="Payment Mode">
              <select value={form.paymentMode}
                onChange={e => setForm(f => ({ ...f, paymentMode:e.target.value }))}
                style={{ ...inp(), cursor:'pointer' }}>
                {PAYMENT_MODES.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </FR>
            {BANK_MODES.includes(form.paymentMode) && (
              <FR label="Bank Account *">
                <select value={form.bankId}
                  onChange={e => setForm(f => ({ ...f, bankId:e.target.value }))}
                  style={{ ...inp(), cursor:'pointer' }}>
                  <option value="">-- Select Bank Account --</option>
                  {banks.map(b => (
                    <option key={b.bankId} value={b.bankId}>{b.bankName} — {b.accountNumber} ({b.accountType})</option>
                  ))}
                </select>
              </FR>
            )}
            <FR label="Reference / Cheque No." cols={BANK_MODES.includes(form.paymentMode)?'span 2':'span 1'}>
              <input value={form.referenceNo}
                onChange={e => setForm(f => ({ ...f, referenceNo:e.target.value }))}
                placeholder="e.g. TXN-123456, CHQ-789" style={inp()} />
            </FR>
            <FR label="Notes / Remarks" cols="span 2">
              <textarea value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes:e.target.value }))}
                rows={2} placeholder="Optional notes about this payment…"
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
              background:loading?'#9CA3AF':'#12B76A', color:'#fff', border:'none',
              borderRadius:7, fontWeight:700, boxShadow:loading?'none':'0 2px 6px rgba(18,183,106,0.35)' }}>
            {loading ? 'Saving…' : '💾 Record Payment'}
          </button>
        </div>
      </div>

      {/* Popups */}
      {showVendorSearch && (
        <SearchPopup title="Search & Select Vendor" items={vendors} columns={vendorCols}
          onSelect={selectVendor} onClose={() => setShowVendorSearch(false)} />
      )}
      {showOrderSearch && (
        <POSearchPopup title={`Purchase Orders — ${selectedVendor?.vendorName||selectedVendor?.companyName}`}
          orders={orders} onSelect={selectOrder} onClose={() => setShowOrderSearch(false)} />
      )}
      {showLedgerSearch && (
        <SearchPopup title="Search & Select Ledger Account" items={ledgers} columns={ledgerCols}
          onSelect={selectLedger} onClose={() => setShowLedgerSearch(false)} />
      )}

      {/* ── Payment Advice Email Modal ── */}
      {adviceModal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', backdropFilter:'blur(3px)',
          zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
          <div style={{ background:'#fff', borderRadius:14, width:'100%', maxWidth:520,
            boxShadow:'0 20px 60px rgba(0,0,0,0.3)', overflow:'hidden' }}>
            {/* Header */}
            <div style={{ background: P, padding:'16px 20px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div>
                <div style={{ fontWeight:800, fontSize:15, color:'#fff' }}>Send Payment Advice</div>
                <div style={{ fontSize:11, color:'rgba(255,255,255,0.7)', marginTop:2 }}>Email payment details to the party</div>
              </div>
              <button onClick={() => setAdviceModal(null)}
                style={{ background:'rgba(255,255,255,0.15)', border:'1px solid rgba(255,255,255,0.3)',
                  borderRadius:6, color:'#fff', width:30, height:30, cursor:'pointer', fontSize:16 }}>✕</button>
            </div>

            {/* Payment Summary */}
            <div style={{ background:'#f0fdf9', padding:'12px 20px', borderBottom:`1px solid #d1fae5`,
              display:'flex', alignItems:'center', gap:14 }}>
              <div style={{ width:42, height:42, borderRadius:21, background:'#d1fae5',
                display:'flex', alignItems:'center', justifyContent:'center', fontSize:20, flexShrink:0 }}>✓</div>
              <div>
                <div style={{ fontSize:13, fontWeight:700, color:'#065f46' }}>
                  Payment PMT-{adviceModal.paymentId} recorded
                </div>
                <div style={{ fontSize:12, color:'#047857', marginTop:2 }}>
                  ₹{fmt(adviceModal.amount)} paid to <strong>{adviceModal.partyName}</strong>
                </div>
              </div>
            </div>

            {/* Email form */}
            <div style={{ padding:'20px 20px' }}>
              <div style={{ marginBottom:14 }}>
                <label style={lbl}>Send Advice To (Email) <span style={{ color:'#EF4444' }}>*</span></label>
                <input type="email" value={adviceEmail} onChange={e => setAdviceEmail(e.target.value)}
                  placeholder="party@example.com"
                  style={{ ...inp(), border:`1px solid ${BD}` }} />
                {!adviceModal.defaultEmail && (
                  <div style={{ fontSize:11, color:'#b45309', marginTop:4 }}>
                    No email on file for this party. Enter manually.
                  </div>
                )}
              </div>

              <div style={{ padding:'10px 14px', background:'#fffbeb', border:'1px solid #fde68a',
                borderRadius:8, fontSize:12, color:'#92400e', marginBottom:14 }}>
                The email will include payment amount, mode, reference number, and a list of all bills/expenses covered.
              </div>

              {adviceMsg && (
                <div style={{ padding:'8px 12px', borderRadius:6, fontSize:12, marginBottom:12,
                  background: adviceMsg.startsWith('✓') ? '#f0fdf4' : '#fef2f2',
                  color:      adviceMsg.startsWith('✓') ? '#15803d' : '#dc2626',
                  border:`1px solid ${adviceMsg.startsWith('✓') ? '#86efac' : '#fca5a5'}` }}>
                  {adviceMsg}
                </div>
              )}

              <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
                <button onClick={() => setAdviceModal(null)}
                  style={{ height:36, padding:'0 18px', fontSize:13, fontFamily:F, cursor:'pointer',
                    background:'#fff', color:'#374151', border:`1px solid ${BD}`, borderRadius:7, fontWeight:600 }}>
                  Skip
                </button>
                <button disabled={sendingAdvice || !adviceEmail.trim()}
                  onClick={async () => {
                    if (!adviceEmail.trim()) return;
                    setSendingAdvice(true); setAdviceMsg('');
                    try {
                      await axios.post(`/api/accounts/send-payment-advice?companyId=${cid}`, {
                        paymentId: adviceModal.paymentId,
                        toEmail:   adviceEmail.trim(),
                        companyId: cid,
                      });
                      setAdviceMsg('✓ Payment advice sent successfully!');
                      setTimeout(() => setAdviceModal(null), 2000);
                    } catch (e) {
                      setAdviceMsg('Error: ' + (e.response?.data?.error || e.message));
                    } finally { setSendingAdvice(false); }
                  }}
                  style={{ height:36, padding:'0 22px', fontSize:13, fontFamily:F, cursor:'pointer',
                    background: sendingAdvice||!adviceEmail.trim() ? '#9ca3af' : P,
                    color:'#fff', border:'none', borderRadius:7, fontWeight:700 }}>
                  {sendingAdvice ? 'Sending…' : '📧 Send Advice'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CreatePayment;
