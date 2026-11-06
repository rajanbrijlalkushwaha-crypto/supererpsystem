import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useCompany } from '../../context/CompanyContext';
import { useAuth } from '../../context/AuthContext';
import { printProformaInvoice } from '../../utils/printProformaInvoice';

const F  = "'Adani','Segoe UI',Arial,sans-serif";
const P  = '#EA580C';
const BD = '#E5EAF2';
const TEXT      = '#111827';
const TEXT_MUTE = '#6B7280';
const NAV_P  = '#4A7BA6';
const NAV_PD = '#35597D';
const NAV_F  = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

const fmtD = v => {
  if (!v) return '—';
  const d = new Date(v);
  return isNaN(d) ? String(v) : d.toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' });
};
const fmtDT = v => {
  if (!v) return '—';
  const d = new Date(v);
  return isNaN(d) ? String(v) : d.toLocaleString('en-IN', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });
};
const fmtAmt = n => `₹${Number(n||0).toLocaleString('en-IN', { minimumFractionDigits:2, maximumFractionDigits:2 })}`;

export default function ProformaInvoice() {
  const navigate = useNavigate();
  const { selectedCompany } = useCompany();
  const { user } = useAuth();
  const cid = selectedCompany?.companyId;

  const [orders,   setOrders]   = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [search,   setSearch]   = useState('');
  const [selected, setSelected] = useState(null);

  const [balance,      setBalance]      = useState(null); // { orderGrandTotal, previouslyInvoiced, remaining, priorInvoices }
  const [balanceLoading, setBalanceLoading] = useState(false);

  const [splitType,  setSplitType]  = useState('percent'); // 'percent' | 'amount'
  const [splitValue, setSplitValue] = useState('');
  const [milestone,  setMilestone]  = useState('');
  const [saving,     setSaving]     = useState(false);
  const [formError,  setFormError]  = useState('');
  const [toast,      setToast]      = useState(null);
  const [busyPiId,   setBusyPiId]   = useState(null); // print/delete in-flight per row

  useEffect(() => {
    if (!cid) return;
    setLoading(true);
    axios.get(`/api/sales-orders?companyId=${cid}`)
      .then(r => setOrders(Array.isArray(r.data) ? r.data : []))
      .catch(() => setOrders([]))
      .finally(() => setLoading(false));
  }, [cid]);

  const loadBalance = useCallback((orderId) => {
    if (!cid || !orderId) return;
    setBalanceLoading(true);
    axios.get(`/api/proforma-invoices/balance/${orderId}?companyId=${cid}`)
      .then(r => setBalance(r.data))
      .catch(() => setBalance(null))
      .finally(() => setBalanceLoading(false));
  }, [cid]);

  useEffect(() => {
    if (!selected) { setBalance(null); return; }
    loadBalance(selected.orderId);
    setSplitType('percent'); setSplitValue(''); setMilestone(''); setFormError('');
  }, [selected, loadBalance]);

  const filtered = useMemo(() => {
    if (!search.trim()) return orders;
    const q = search.toLowerCase();
    return orders.filter(o =>
      String(o.orderNo||'').toLowerCase().includes(q) ||
      String(o.orderId||'').toLowerCase().includes(q) ||
      String(o.customerName||o.party||'').toLowerCase().includes(q)
    );
  }, [orders, search]);

  const showToast = (msg, ok=true) => { setToast({ msg, ok }); setTimeout(()=>setToast(null), 3200); };

  /* Live preview of what this PI would be worth, before saving */
  const previewAmount = useMemo(() => {
    if (!balance || !splitValue) return null;
    const v = parseFloat(splitValue);
    if (!(v > 0)) return null;
    const amt = splitType === 'percent' ? balance.orderGrandTotal * (v/100) : v;
    return Math.round(amt * 100) / 100;
  }, [balance, splitType, splitValue]);

  const previewBalanceAfter = previewAmount != null && balance ? balance.remaining - previewAmount : null;

  const handleCreate = async () => {
    if (!selected || !balance) return;
    const v = parseFloat(splitValue);
    if (!(v > 0)) { setFormError('Enter a percentage or amount greater than zero.'); return; }
    if (splitType === 'percent' && v > 100) { setFormError('Percentage cannot exceed 100.'); return; }

    setSaving(true); setFormError('');
    try {
      const { data: pi } = await axios.post(`/api/proforma-invoices?companyId=${cid}`, {
        orderId: selected.orderId, splitType, splitValue: v, milestone,
      });
      showToast(`${pi.piNo} created — ${fmtAmt(pi.amount)}`);
      setSplitValue(''); setMilestone('');
      loadBalance(selected.orderId);
      await printProformaInvoice(selected, selectedCompany || {}, pi, user);
    } catch (e) {
      setFormError(e.response?.data?.error || e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleReprint = async (pi) => {
    setBusyPiId(pi.piId);
    try { await printProformaInvoice(selected, selectedCompany || {}, pi, user); }
    finally { setBusyPiId(null); }
  };

  const handleDelete = async (pi) => {
    if (!window.confirm(`Delete ${pi.piNo} (${fmtAmt(pi.amount)})? This will free up its amount for future Proforma Invoices on this order.`)) return;
    setBusyPiId(pi.piId);
    try {
      await axios.delete(`/api/proforma-invoices/${pi.piId}?companyId=${cid}`);
      showToast(`${pi.piNo} deleted`);
      loadBalance(selected.orderId);
    } catch (e) {
      showToast('Error: ' + (e.response?.data?.error || e.message), false);
    } finally {
      setBusyPiId(null);
    }
  };

  const fullyInvoiced = balance && balance.remaining <= 0.5;

  return (
    <div style={{ fontFamily:F, background:'#F7F9FC', minHeight:'100%', display:'flex', flexDirection:'column' }}>

      {/* ══ Combined nav + toolbar bar — same bar as Sales Order, so this
           page never looks orphaned when reached via that tab ══ */}
      <div style={{ flexShrink:0, height:40, background:NAV_P, borderBottom:`2px solid ${NAV_PD}`,
        display:'flex', alignItems:'stretch', overflow:'hidden', fontFamily:NAV_F }}>
        <div style={{ display:'flex', alignItems:'center', padding:'0 12px 0 10px',
          fontSize:11, fontWeight:800, color:'#fff', textTransform:'uppercase',
          letterSpacing:'0.8px', whiteSpace:'nowrap',
          borderRight:'2px solid rgba(255,255,255,0.18)', flexShrink:0 }}>
          SALES ORDERS
        </div>
        {[
          { label:'All Sales Orders', path:'/sales-order/view' },
          { label:'+ Create SO',      path:'/sales-order/create', isCreate:true },
          { label:'⏳ Pending',       path:'/sales-order/pending' },
          { label:'📋 Proforma Invoice', path:'/proforma-invoice/view' },
        ].map(t => {
          const isAct = t.path === '/proforma-invoice/view';
          if (t.isCreate) return (
            <button key={t.path} onClick={() => navigate(t.path)}
              style={{ display:'flex', alignItems:'center', padding:'0 14px', height:26, alignSelf:'center',
                fontSize:11.5, fontWeight:700, color:'#fff', background:'#059669',
                border:'1px solid rgba(255,255,255,0.3)', boxShadow:'0 2px 6px rgba(0,0,0,0.2)',
                cursor:'pointer', whiteSpace:'nowrap', flexShrink:0,
                margin:'0 4px', borderRadius:6 }}
              onMouseEnter={e=>{e.currentTarget.style.background='#047857';}}
              onMouseLeave={e=>{e.currentTarget.style.background='#059669';}}>
              {t.label}
            </button>
          );
          return (
            <button key={t.path} onClick={() => navigate(t.path)}
              style={{ display:'flex', alignItems:'center', padding:'0 12px', height:26, alignSelf:'center',
                fontSize:11.5, fontWeight:isAct?700:600, cursor:'pointer',
                whiteSpace:'nowrap', flexShrink:0, fontFamily:NAV_F,
                color:isAct?'#fff':'rgba(255,255,255,0.85)',
                background:isAct?'rgba(255,255,255,0.22)':'rgba(255,255,255,0.07)',
                border:`1px solid ${isAct?'rgba(255,255,255,0.55)':'rgba(255,255,255,0.22)'}`,
                boxShadow:isAct?'0 2px 6px rgba(0,0,0,0.22)':'0 1px 2px rgba(0,0,0,0.12)',
                borderRadius:6, margin:'0 4px' }}
              onMouseEnter={e=>{if(!isAct){e.currentTarget.style.background='rgba(255,255,255,0.14)';e.currentTarget.style.borderColor='rgba(255,255,255,0.55)';}}}
              onMouseLeave={e=>{if(!isAct){e.currentTarget.style.background='rgba(255,255,255,0.07)';e.currentTarget.style.borderColor='rgba(255,255,255,0.22)';}}}>
              {t.label}
            </button>
          );
        })}
      </div>

      <div style={{ flex:1, overflow:'auto', padding:'16px 20px' }}>

      {toast && (
        <div style={{ position:'fixed', top:18, right:18, zIndex:99999, background:toast.ok?'#15803d':'#dc2626',
          color:'#fff', padding:'10px 22px', borderRadius:8, fontSize:13, fontWeight:600, boxShadow:'0 6px 24px rgba(0,0,0,0.2)', fontFamily:F }}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div style={{ marginBottom:14 }}>
        <div style={{ fontSize:11, color:TEXT_MUTE, marginBottom:2 }}>Sales → Proforma Invoice</div>
        <div style={{ fontSize:18, fontWeight:700, color:TEXT }}>Proforma Invoice</div>
        <div style={{ fontSize:12, color:TEXT_MUTE, marginTop:3 }}>
          Select a Sales Order, then raise a Proforma Invoice for a milestone of its value (e.g. 50% Advance, balance Before Dispatch). Each order can have multiple Proforma Invoices — the remaining balance always accounts for the ones already created.
        </div>
      </div>

      <div style={{ display:'flex', gap:16, alignItems:'flex-start' }}>

        {/* ── Left: order picker ── */}
        <div style={{ flex:'0 0 380px', background:'#fff', border:`1px solid ${BD}`, borderRadius:8, overflow:'hidden' }}>
          <div style={{ padding:'10px 12px', borderBottom:`1px solid ${BD}` }}>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search order no. or client name…"
              style={{ width:'100%', height:32, padding:'0 10px', fontSize:12.5, fontFamily:F,
                border:`1px solid ${BD}`, borderRadius:6, outline:'none', boxSizing:'border-box' }}
            />
          </div>

          <div style={{ maxHeight:600, overflowY:'auto' }}>
            {loading ? (
              <div style={{ padding:30, textAlign:'center', color:TEXT_MUTE, fontSize:12.5 }}>Loading sales orders…</div>
            ) : filtered.length === 0 ? (
              <div style={{ padding:30, textAlign:'center', color:TEXT_MUTE, fontSize:12.5 }}>
                {search ? `No orders match "${search}"` : 'No sales orders found.'}
              </div>
            ) : filtered.map((o, i) => {
              const isSel = selected?.orderId === o.orderId;
              return (
                <div key={o.orderId}
                  onClick={() => setSelected(o)}
                  style={{
                    padding:'10px 12px', cursor:'pointer',
                    background: isSel ? '#FFF3EA' : i % 2 === 0 ? '#fff' : '#FAFBFC',
                    borderLeft: isSel ? `3px solid ${P}` : '3px solid transparent',
                    borderBottom:`1px solid ${BD}`,
                  }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', gap:8 }}>
                    <span style={{ fontSize:12.5, fontWeight:700, color: isSel ? P : TEXT }}>{o.orderNo || o.orderId}</span>
                    <span style={{ fontSize:11, color:TEXT_MUTE, whiteSpace:'nowrap' }}>{fmtD(o.orderDate || o.date)}</span>
                  </div>
                  <div style={{ fontSize:12, color:'#374151', marginTop:2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                    {o.customerName || o.party || '—'}
                  </div>
                  <div style={{ fontSize:11.5, color:TEXT_MUTE, marginTop:2 }}>{fmtAmt(o.grandTotal)}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Right: balance, create form, history ── */}
        <div style={{ flex:1, display:'flex', flexDirection:'column', gap:14 }}>
          {!selected ? (
            <div style={{ background:'#fff', border:`1px solid ${BD}`, borderRadius:8, minHeight:300,
              display:'flex', alignItems:'center', justifyContent:'center',
              color:TEXT_MUTE, fontSize:13, textAlign:'center', flexDirection:'column', gap:6 }}>
              <div>Select a Sales Order on the left</div>
              <div style={{ fontSize:11.5 }}>Its Proforma Invoice history and balance will appear here</div>
            </div>
          ) : (
            <>
              {/* Order + balance summary */}
              <div style={{ background:'#fff', border:`1px solid ${BD}`, borderRadius:8, padding:18 }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:14 }}>
                  <div>
                    <div style={{ fontSize:16, fontWeight:700, color:TEXT }}>{selected.orderNo || selected.orderId}</div>
                    <div style={{ fontSize:12.5, color:'#374151', marginTop:2 }}>{selected.customerName || selected.party || '—'}</div>
                  </div>
                </div>

                {balanceLoading ? (
                  <div style={{ padding:'20px 0', textAlign:'center', color:TEXT_MUTE, fontSize:12.5 }}>Loading balance…</div>
                ) : balance ? (
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:14 }}>
                    {[
                      { label:'Order Value',        value: fmtAmt(balance.orderGrandTotal) },
                      { label:'Already Invoiced',   value: fmtAmt(balance.previouslyInvoiced) },
                      { label:'Remaining Balance',  value: fmtAmt(balance.remaining), accent:true },
                    ].map(s => (
                      <div key={s.label} style={{ border:`1px solid ${BD}`, borderRadius:7, padding:'10px 12px',
                        background: s.accent ? '#FFF3EA' : '#fff' }}>
                        <div style={{ fontSize:10.5, color:TEXT_MUTE, textTransform:'uppercase', letterSpacing:'0.4px' }}>{s.label}</div>
                        <div style={{ fontSize:16, fontWeight:700, color: s.accent ? P : TEXT, marginTop:3 }}>{s.value}</div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>

              {/* Create new PI */}
              <div style={{ background:'#fff', border:`1px solid ${BD}`, borderRadius:8, padding:18 }}>
                <div style={{ fontSize:13.5, fontWeight:700, color:TEXT, marginBottom:12 }}>Create a Proforma Invoice</div>

                {fullyInvoiced ? (
                  <div style={{ padding:'14px 16px', background:'#ECFDF5', border:'1px solid #A7F3D0', borderRadius:7,
                    color:'#15803d', fontSize:12.5, fontWeight:600 }}>
                    ✓ This order has been fully proforma-invoiced. Nothing remains to invoice.
                  </div>
                ) : (
                  <>
                    <div style={{ display:'flex', gap:12, marginBottom:12, flexWrap:'wrap' }}>
                      <div style={{ flex:'1 1 200px' }}>
                        <label style={{ display:'block', fontSize:11, color:TEXT_MUTE, marginBottom:4, fontWeight:600 }}>Milestone label (optional)</label>
                        <input value={milestone} onChange={e=>setMilestone(e.target.value)}
                          placeholder="e.g. 50% Advance, Before Dispatch"
                          style={{ width:'100%', height:34, padding:'0 10px', fontSize:12.5, fontFamily:F,
                            border:`1px solid ${BD}`, borderRadius:6, outline:'none', boxSizing:'border-box' }} />
                      </div>

                      <div style={{ flex:'0 0 160px' }}>
                        <label style={{ display:'block', fontSize:11, color:TEXT_MUTE, marginBottom:4, fontWeight:600 }}>Split by</label>
                        <div style={{ display:'flex', border:`1px solid ${BD}`, borderRadius:6, overflow:'hidden', height:34 }}>
                          {[['percent','%'],['amount','₹']].map(([val,lbl]) => (
                            <div key={val} onClick={()=>setSplitType(val)}
                              style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer',
                                background: splitType===val ? P : '#fff', color: splitType===val ? '#fff' : '#374151',
                                fontSize:12.5, fontWeight:700 }}>
                              {lbl}
                            </div>
                          ))}
                        </div>
                      </div>

                      <div style={{ flex:'0 0 160px' }}>
                        <label style={{ display:'block', fontSize:11, color:TEXT_MUTE, marginBottom:4, fontWeight:600 }}>
                          {splitType === 'percent' ? 'Percentage' : 'Amount (₹)'}
                        </label>
                        <input value={splitValue} onChange={e=>setSplitValue(e.target.value.replace(/[^0-9.]/g,''))}
                          placeholder={splitType === 'percent' ? 'e.g. 50' : `up to ${balance ? Math.round(balance.remaining) : ''}`}
                          style={{ width:'100%', height:34, padding:'0 10px', fontSize:12.5, fontFamily:F,
                            border:`1px solid ${BD}`, borderRadius:6, outline:'none', boxSizing:'border-box' }} />
                      </div>

                      <div style={{ flex:'0 0 auto', display:'flex', alignItems:'flex-end' }}>
                        <button onClick={handleCreate} disabled={saving || !splitValue}
                          style={{ height:34, padding:'0 18px', background: saving||!splitValue ? '#FCA57A' : P,
                            border:'none', borderRadius:6, color:'#fff', fontSize:12.5, fontWeight:700,
                            cursor: saving||!splitValue ? 'not-allowed' : 'pointer', fontFamily:F, whiteSpace:'nowrap' }}>
                          {saving ? 'Creating…' : 'Create & Print'}
                        </button>
                      </div>
                    </div>

                    {previewAmount != null && (
                      <div style={{ fontSize:12, color:'#374151', background:'#FAFBFC', border:`1px solid ${BD}`,
                        borderRadius:6, padding:'8px 12px', marginBottom: formError ? 8 : 0 }}>
                        This Proforma Invoice: <strong style={{ color:P }}>{fmtAmt(previewAmount)}</strong>
                        {'  ·  '}Balance after: <strong>{fmtAmt(previewBalanceAfter)}</strong>
                        {previewBalanceAfter < -0.5 && (
                          <span style={{ color:'#dc2626', fontWeight:600 }}> — exceeds remaining balance</span>
                        )}
                      </div>
                    )}

                    {formError && (
                      <div style={{ fontSize:12, color:'#dc2626', background:'#FEF2F2', border:'1px solid #FECACA',
                        borderRadius:6, padding:'8px 12px' }}>
                        {formError}
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* History */}
              <div style={{ background:'#fff', border:`1px solid ${BD}`, borderRadius:8, overflow:'hidden' }}>
                <div style={{ padding:'12px 16px', borderBottom:`1px solid ${BD}`, fontSize:13.5, fontWeight:700, color:TEXT }}>
                  Proforma Invoices for this Order {balance?.priorInvoices?.length ? `(${balance.priorInvoices.length})` : ''}
                </div>
                {!balance?.priorInvoices?.length ? (
                  <div style={{ padding:30, textAlign:'center', color:TEXT_MUTE, fontSize:12.5, fontStyle:'italic' }}>
                    No Proforma Invoices created yet for this order.
                  </div>
                ) : (
                  <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                    <thead>
                      <tr style={{ background:'#FAFBFC' }}>
                        {['PI No','Milestone','Amount','Created','',''].map(h => (
                          <th key={h} style={{ padding:'8px 10px', textAlign:'left', fontSize:10.5, fontWeight:700,
                            color:TEXT_MUTE, borderBottom:`1px solid ${BD}` }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {balance.priorInvoices.map(pi => (
                        <tr key={pi.piId} style={{ borderBottom:`1px solid ${BD}` }}>
                          <td style={{ padding:'8px 10px', fontWeight:700, color:P, fontFamily:'monospace' }}>{pi.piNo}</td>
                          <td style={{ padding:'8px 10px', color:'#374151' }}>{pi.milestone || '—'}</td>
                          <td style={{ padding:'8px 10px', fontWeight:600, color:TEXT }}>
                            {fmtAmt(pi.amount)}{pi.splitType==='percent' ? ` (${pi.splitValue}%)` : ''}
                          </td>
                          <td style={{ padding:'8px 10px', color:TEXT_MUTE, fontSize:11, whiteSpace:'nowrap' }}>{fmtDT(pi.createdAt)}</td>
                          <td style={{ padding:'8px 10px' }}>
                            <button onClick={()=>handleReprint(pi)} disabled={busyPiId===pi.piId}
                              style={{ padding:'4px 10px', background:'#EFF6FF', border:'1px solid #BFDBFE', borderRadius:5,
                                color:'#1D4ED8', fontSize:11, fontWeight:700, cursor: busyPiId===pi.piId?'wait':'pointer', fontFamily:F }}>
                              Print
                            </button>
                          </td>
                          <td style={{ padding:'8px 10px' }}>
                            <button onClick={()=>handleDelete(pi)} disabled={busyPiId===pi.piId}
                              style={{ padding:'4px 10px', background:'#FEF2F2', border:'1px solid #FECACA', borderRadius:5,
                                color:'#DC2626', fontSize:11, fontWeight:700, cursor: busyPiId===pi.piId?'wait':'pointer', fontFamily:F }}>
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          )}
        </div>
      </div>
      </div>
    </div>
  );
}
