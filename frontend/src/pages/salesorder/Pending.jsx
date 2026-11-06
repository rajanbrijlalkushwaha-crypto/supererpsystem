import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import axios from 'axios';
import { printSalesOrder } from '../../utils/printSalesOrder';
import { useCompany } from '../../context/CompanyContext';
import { useAuth } from '../../context/AuthContext';
import { can } from '../../utils/permissions';
import AuditTrail from '../../components/AuditTrail';

const F   = "'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif";
const P   = '#3A6186';
const PD  = '#2A4D6E';

const fmt  = (n) => `₹${(parseFloat(n) || 0).toFixed(2)}`;
const fmtD = (d) => { if (!d) return '—'; const dt = new Date(d); return isNaN(dt) ? d : dt.toLocaleDateString('en-IN'); };
const grand = (o) => {
  if (o.grandTotal) return parseFloat(o.grandTotal);
  return (o.items || []).reduce((s, it) => {
    const amt = (parseFloat(it.qty) || parseFloat(it.quantity) || 0) * (parseFloat(it.rate) || 0);
    return s + amt + amt * (parseFloat(it.gstPercent) || 0) / 100;
  }, 0);
};

/* ── Order Detail Modal ── */
export function OrderModal({ order, company, onClose, onApprove, onReject, readOnly }) {
  const { user } = useAuth();
  if (!order) return null;
  const items    = order.items && order.items.length ? order.items : [];
  const subTotal = items.reduce((s, it) =>
    s + (parseFloat(it.qty) || parseFloat(it.quantity) || 0) * (parseFloat(it.rate) || 0), 0);
  const gstTotal = items.reduce((s, it) => {
    const amt = (parseFloat(it.qty) || parseFloat(it.quantity) || 0) * (parseFloat(it.rate) || 0);
    return s + amt * (parseFloat(it.gstPercent) || 0) / 100;
  }, 0);
  const total = parseFloat(order.grandTotal) || subTotal + gstTotal;

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', zIndex:9999,
      display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}
      onClick={onClose}>
      <div style={{ background:'#fff', borderRadius:10, width:'100%', maxWidth:860,
        maxHeight:'90vh', overflowY:'auto', boxShadow:'0 8px 40px rgba(0,0,0,0.3)',
        display:'flex', flexDirection:'column' }}
        onClick={e => e.stopPropagation()}>

        <div style={{ background:`linear-gradient(135deg,${P},${PD})`, color:'#fff',
          padding:'16px 24px', borderRadius:'10px 10px 0 0',
          display:'flex', justifyContent:'space-between', alignItems:'center', flexShrink:0 }}>
          <div>
            <div style={{ fontSize:18, fontWeight:700, fontFamily:F }}>
              Sales Order — {order.orderNo || order.voucherNumber || order.orderId}
            </div>
            <div style={{ fontSize:13, opacity:0.85, marginTop:2, fontFamily:F }}>
              {order.customerName || order.clientName || order.party || '—'}
            </div>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <span style={{ background: order.status === 'approved' ? '#16a34a' : '#f59e0b',
              color:'#fff', padding:'3px 12px', borderRadius:20, fontSize:12, fontWeight:600, fontFamily:F }}>
              {(order.status || 'draft').toUpperCase()}
            </span>
            <button onClick={onClose} style={{ background:'rgba(255,255,255,0.2)', border:'none', color:'#fff',
              borderRadius:'50%', width:30, height:30, fontSize:16, cursor:'pointer',
              display:'flex', alignItems:'center', justifyContent:'center' }}>✕</button>
          </div>
        </div>

        <div style={{ padding:'20px 24px', flex:1 }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px 30px', marginBottom:20 }}>
            {[
              ['Order No',      order.orderNo || order.voucherNumber || '—'],
              ['Order Date',    fmtD(order.orderDate || order.date)],
              ['Delivery Date', fmtD(order.deliveryDate)],
              ['PO Number',     order.customerPO || order.reference || '—'],
              ['PO Date',       fmtD(order.poDate)],
              ['Payment Terms', order.paymentTerms || '—'],
              ['Order Type',    order.orderType || '—'],
              ['Sales Person',  order.salesPerson || '—'],
              ['Customer GSTIN',order.customerGstin || order.partyGstin || '—'],
              ['State',         order.customerState || order.stateName || '—'],
              ['Delivery Addr', order.deliveryAddr || order.destination || '—'],
              ['Incoterms',     order.incoterms || '—'],
            ].map(([label, val]) => (
              <div key={label} style={{ display:'flex', gap:6, fontSize:13, fontFamily:F }}>
                <span style={{ color:'#64748b', minWidth:110, flexShrink:0 }}>{label}:</span>
                <span style={{ fontWeight:500, color:'#1e293b' }}>{val}</span>
              </div>
            ))}
          </div>

          <div style={{ marginBottom:20 }}>
            <div style={{ fontWeight:700, fontSize:14, marginBottom:8, color:P, fontFamily:F }}>Line Items</div>
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13, fontFamily:F }}>
                <thead>
                  <tr>
                    {['#','Material / Description','Qty','Unit','Rate','Amount','GST%','Total'].map(h => (
                      <th key={h} style={{ padding:'7px 10px', textAlign: h==='#'?'center':'left',
                        background:P, color:'#fff', fontWeight:600, border:`1px solid ${PD}` }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {items.length === 0 ? (
                    <tr><td colSpan={8} style={{ textAlign:'center', padding:12, color:'#94a3b8', border:'1px solid #e2e8f0' }}>No items</td></tr>
                  ) : items.map((it, i) => {
                    const qty  = parseFloat(it.qty) || parseFloat(it.quantity) || 0;
                    const rate = parseFloat(it.rate) || 0;
                    const amt  = qty * rate;
                    const gst  = parseFloat(it.gstPercent) || 0;
                    const ttl  = amt + amt * gst / 100;
                    return (
                      <tr key={i} style={{ background: i%2 ? '#f8fafc' : '#fff' }}>
                        <td style={{ padding:'6px 10px', textAlign:'center', border:'1px solid #e2e8f0' }}>{i+1}</td>
                        <td style={{ padding:'6px 10px', border:'1px solid #e2e8f0' }}>
                          <div style={{ fontWeight:500 }}>{it.material || it.itemName || '—'}</div>
                          {it.description && <div style={{ color:'#64748b', fontSize:12 }}>{it.description}</div>}
                        </td>
                        <td style={{ padding:'6px 10px', border:'1px solid #e2e8f0' }}>{qty}</td>
                        <td style={{ padding:'6px 10px', border:'1px solid #e2e8f0' }}>{it.unit || '—'}</td>
                        <td style={{ padding:'6px 10px', border:'1px solid #e2e8f0' }}>{fmt(rate)}</td>
                        <td style={{ padding:'6px 10px', border:'1px solid #e2e8f0' }}>{fmt(amt)}</td>
                        <td style={{ padding:'6px 10px', border:'1px solid #e2e8f0' }}>{gst}%</td>
                        <td style={{ padding:'6px 10px', border:'1px solid #e2e8f0', fontWeight:600 }}>{fmt(ttl)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:20 }}>
            <div style={{ minWidth:280, background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:8, padding:'12px 16px' }}>
              {[['Sub Total', fmt(subTotal)], ['GST Total', fmt(gstTotal)]].map(([l,v]) => (
                <div key={l} style={{ display:'flex', justifyContent:'space-between', fontSize:13, marginBottom:6, color:'#475569', fontFamily:F }}>
                  <span>{l}</span><span>{v}</span>
                </div>
              ))}
              <div style={{ borderTop:`2px solid ${P}`, marginTop:8, paddingTop:8, display:'flex',
                justifyContent:'space-between', fontWeight:700, fontSize:15, color:P, fontFamily:F }}>
                <span>Grand Total</span><span>{fmt(total)}</span>
              </div>
            </div>
          </div>

          {(order.internalNotes || order.narration || order.customerNotes) && (
            <div style={{ background:'#fffbeb', border:'1px solid #fde68a', borderRadius:8, padding:'10px 14px', marginBottom:16, fontSize:13, fontFamily:F }}>
              <div style={{ fontWeight:600, marginBottom:4, color:'#92400e' }}>Notes</div>
              <div style={{ color:'#78350f' }}>{order.internalNotes || order.narration || order.customerNotes}</div>
            </div>
          )}
          {order.termsConditions && (
            <div style={{ background:'#f0fdf4', border:'1px solid #bbf7d0', borderRadius:8, padding:'10px 14px', fontSize:13, fontFamily:F }}>
              <div style={{ fontWeight:600, marginBottom:4, color:P }}>Terms & Conditions</div>
              <div style={{ color:'#15803d', whiteSpace:'pre-wrap' }}>{order.termsConditions}</div>
            </div>
          )}
          <div style={{ marginTop:16 }}>
            <AuditTrail audit={order.audit} title="Activity Log" />
          </div>
        </div>

        <div style={{ padding:'14px 24px', borderTop:'1px solid #e2e8f0', display:'flex',
          justifyContent:'flex-end', gap:10, background:'#f8fafc',
          borderRadius:'0 0 10px 10px', flexShrink:0 }}>
          <button onClick={() => printSalesOrder(order, company, user)}
            style={{ padding:'8px 18px', borderRadius:6, border:`1px solid ${P}`,
              background:'#fff', cursor:'pointer', fontSize:13, fontFamily:F }}>🖨️ Print</button>
          <button onClick={onClose}
            style={{ padding:'8px 18px', borderRadius:6, border:'1px solid #cbd5e1',
              background:'#fff', cursor:'pointer', fontSize:13, fontFamily:F }}>Close</button>
          {!readOnly && (
            <>
              <button onClick={() => onReject(order.orderId)}
                style={{ padding:'8px 22px', borderRadius:6, border:'none',
                  background:'#ef4444', color:'#fff', cursor:'pointer', fontWeight:700, fontSize:13, fontFamily:F }}>✕ Reject</button>
              <button onClick={() => onApprove(order.orderId)}
                style={{ padding:'8px 22px', borderRadius:6, border:'none',
                  background:'#16a34a', color:'#fff', cursor:'pointer', fontWeight:700, fontSize:13, fontFamily:F }}>✓ Approve</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Nav Tab helper ── */
const NavTab = ({ to, active, children, isCreate }) => {
  if (isCreate) return (
    <Link to={to} style={{ display:'flex', alignItems:'center', gap:4,
      padding:'0 14px', height:26, fontSize:11, fontWeight:700, color:'#fff',
      background: active ? '#047857' : '#059669', textDecoration:'none',
      borderRadius:5, margin:'0 6px', alignSelf:'center', whiteSpace:'nowrap',
      flexShrink:0, fontFamily:F }}>
      {children}
    </Link>
  );
  return (
    <Link to={to} style={{ display:'flex', alignItems:'center', gap:4,
      padding:'0 12px', height:'100%', fontSize:11, fontWeight: active ? 700 : 400,
      color: active ? '#fff' : 'rgba(255,255,255,0.65)',
      background: active ? 'rgba(255,255,255,0.12)' : 'transparent',
      textDecoration:'none', borderBottom: active ? '2px solid rgba(255,255,255,0.85)' : '2px solid transparent',
      marginBottom:-2, whiteSpace:'nowrap', flexShrink:0, fontFamily:F }}>
      {children}
    </Link>
  );
};

/* ── Status Badge ── */
const Badge = ({ s = 'pending' }) => {
  const map = {
    approved: { bg:'#dcfce7', color:'#16a34a', label:'APPROVED' },
    pending:  { bg:'#fef3c7', color:'#d97706', label:'PENDING'  },
    draft:    { bg:'#ede9fe', color:'#7c3aed', label:'DRAFT'    },
    rejected: { bg:'#fee2e2', color:'#dc2626', label:'REJECTED' },
  };
  const c = map[s?.toLowerCase()] || map.pending;
  return (
    <span style={{ background:c.bg, color:c.color, padding:'2px 8px', borderRadius:4,
      fontSize:10, fontWeight:700, fontFamily:F, letterSpacing:'0.5px' }}>
      {c.label}
    </span>
  );
};

/* ── TH helper ── */
const TH = ({ children, right, w }) => (
  <th style={{ padding:'6px 10px', background:P, color:'#fff', fontWeight:700,
    fontSize:10.5, textAlign: right ? 'right' : 'left', whiteSpace:'nowrap',
    borderRight:`1px solid ${PD}`, borderBottom:`2px solid ${PD}`,
    position:'sticky', top:0, zIndex:2, fontFamily:F, width: w||undefined }}>
    {children}
  </th>
);

/* ── Main Component ── */
const PendingSalesOrders = () => {
  const { user }            = useAuth();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [search, setSearch]   = useState('');
  const [selected, setSelected] = useState(null);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { selectedCompany } = useCompany();

  useEffect(() => { fetchOrders(); }, [selectedCompany]); // eslint-disable-line

  const fetchOrders = async () => {
    if (!selectedCompany?.companyId) { setLoading(false); return; }
    try {
      setLoading(true);
      const res = await axios.get('/api/sales-orders');
      setOrders(res.data.filter(o => ['pending','draft'].includes((o.status||'').toLowerCase())));
    } catch (err) { setMessage('Error: ' + err.message); }
    finally { setLoading(false); }
  };

  const doApprove = async (orderId) => {
    try {
      const res = await axios.get(`/api/sales-orders/${orderId}`);
      const o = res.data;
      const fd = new FormData();
      Object.entries(o).forEach(([k, v]) => {
        if (['items','attachments','documents','customFields'].includes(k)) return;
        if (v !== null && v !== undefined) fd.append(k, v);
      });
      fd.set('status', 'approved');
      fd.append('items',       JSON.stringify(o.items || []));
      fd.append('attachments', JSON.stringify(o.attachments || o.documents || []));
      await axios.put(`/api/sales-orders/${orderId}`, fd, { headers:{ 'Content-Type':'multipart/form-data' } });
      setMessage(`Order ${orderId} approved ✓`);
      setSelected(null);
      setTimeout(() => navigate('/sales-order/view'), 1200);
    } catch (err) { setMessage('Error: ' + err.message); }
  };

  const doReject = async (orderId) => {
    if (!window.confirm('Reject and move back to draft?')) return;
    try {
      const res = await axios.get(`/api/sales-orders/${orderId}`);
      const o = res.data;
      const fd = new FormData();
      Object.entries(o).forEach(([k, v]) => {
        if (['items','attachments','documents','customFields'].includes(k)) return;
        if (v !== null && v !== undefined) fd.append(k, v);
      });
      fd.set('status', 'draft');
      fd.append('items',       JSON.stringify(o.items || []));
      fd.append('attachments', JSON.stringify(o.attachments || o.documents || []));
      await axios.put(`/api/sales-orders/${orderId}`, fd, { headers:{ 'Content-Type':'multipart/form-data' } });
      setMessage(`Order ${orderId} rejected — moved to draft`);
      setSelected(null);
      fetchOrders();
    } catch (err) { setMessage('Error: ' + err.message); }
  };

  const filtered = orders.filter(o => {
    const q    = search.toLowerCase();
    const name = (o.customerName || o.clientName || o.party || '').toLowerCase();
    return String(o.orderId).includes(q) || name.includes(q) || (o.orderNo || '').toLowerCase().includes(q);
  });

  const NAV_TABS = [
    { label:'All Sales Orders', path:'/sales-order/view' },
    { label:'+ Create SO',      path:'/sales-order/create', isCreate:true },
    { label:'⏳ Pending',       path:'/sales-order/pending' },
    { label:'📋 Proforma Invoice', path:'/proforma-invoice/view' },
  ];

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', overflow:'hidden',
      background:'#f8fafc', fontFamily:F }}>

      {selected && (
        <OrderModal
          order={selected}
          company={selectedCompany}
          onClose={() => setSelected(null)}
          onApprove={can(user,'salesOrder','approve') ? doApprove : null}
          onReject={can(user,'salesOrder','approve')  ? doReject  : null}
          readOnly={!can(user,'salesOrder','approve')}
        />
      )}

      <style>{`.pso-search::placeholder{color:rgba(255,255,255,0.45)}`}</style>

      {/* ══ Combined Nav Bar ══ */}
      <div style={{ flexShrink:0, height:40, background:P, borderBottom:`2px solid ${PD}`,
        display:'flex', alignItems:'stretch', overflow:'hidden', fontFamily:F }}>

        {/* Section label */}
        <div style={{ display:'flex', alignItems:'center', padding:'0 12px 0 10px',
          fontSize:11, fontWeight:800, color:'#fff', textTransform:'uppercase',
          letterSpacing:'0.8px', whiteSpace:'nowrap',
          borderRight:'2px solid rgba(255,255,255,0.18)', flexShrink:0 }}>
          SALES ORDERS
        </div>

        {/* Tabs */}
        <div style={{ display:'flex', alignItems:'stretch', overflowX:'auto', flex:1,
          scrollbarWidth:'none', msOverflowStyle:'none' }}>
          {NAV_TABS.map(t => (
            <NavTab key={t.path} to={t.path}
              active={pathname === t.path || pathname.startsWith(t.path+'/')}
              isCreate={t.isCreate}>
              {t.label}
            </NavTab>
          ))}
        </div>

        {/* Count chip */}
        <div style={{ display:'flex', alignItems:'center', padding:'0 8px',
          borderLeft:'1px solid rgba(255,255,255,0.15)', flexShrink:0 }}>
          <span style={{ background:'rgba(255,255,255,0.18)', color:'#fff',
            fontSize:10.5, fontWeight:700, padding:'2px 10px', borderRadius:20,
            whiteSpace:'nowrap', fontFamily:F }}>
            {filtered.length} PENDING
          </span>
        </div>

        {/* Search */}
        <div style={{ display:'flex', alignItems:'center', padding:'0 6px',
          borderLeft:'1px solid rgba(255,255,255,0.15)', flexShrink:0 }}>
          <input className="pso-search" placeholder="🔍 Search order, client…"
            value={search} onChange={e => setSearch(e.target.value)}
            style={{ height:26, padding:'0 8px', background:'rgba(255,255,255,0.12)',
              border:'1px solid rgba(255,255,255,0.25)', borderRadius:0, color:'#fff',
              fontSize:11, outline:'none', fontFamily:F, width:180 }}/>
        </div>

        {/* Refresh */}
        <button onClick={fetchOrders}
          style={{ height:24, padding:'0 10px', alignSelf:'center', flexShrink:0,
            marginRight:8, cursor:'pointer', fontFamily:F, fontSize:11, fontWeight:700,
            borderRadius:0, background:'rgba(255,255,255,0.1)',
            color:'rgba(255,255,255,0.88)', border:'1px solid rgba(255,255,255,0.22)' }}>
          ↺ Refresh
        </button>
      </div>

      {/* Message */}
      {message && (
        <div style={{ flexShrink:0, padding:'6px 14px', fontSize:12, fontFamily:F,
          background: message.includes('Error') ? '#fee2e2' : '#dcfce7',
          color: message.includes('Error') ? '#dc2626' : '#16a34a',
          borderBottom:'1px solid #e5e7eb' }}>
          {message}
          <button onClick={() => setMessage('')}
            style={{ marginLeft:10, background:'none', border:'none', cursor:'pointer',
              fontSize:12, color:'inherit', fontFamily:F }}>✕</button>
        </div>
      )}

      {/* Table */}
      <div style={{ flex:1, minHeight:0, overflow:'auto',
        background:'#fff', border:'1px solid #d1d5db' }}>

        {loading ? (
          <div style={{ padding:40, textAlign:'center', color:'#6b7280', fontSize:13, fontFamily:F }}>
            Loading pending orders…
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding:40, textAlign:'center', color:'#9ca3af', fontSize:13, fontFamily:F }}>
            {search ? 'No orders match your search.' : 'No pending or draft orders.'}
          </div>
        ) : (
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11,
            fontFamily:F, tableLayout:'fixed' }}>
            <colgroup>
              <col style={{ width:'7%' }}/>
              <col style={{ width:'8%' }}/>
              <col style={{ width:'22%' }}/>
              <col style={{ width:'8%' }}/>
              <col style={{ width:'15%' }}/>
              <col style={{ width:'10%' }}/>
              <col style={{ width:'8%' }}/>
              <col style={{ width:'22%' }}/>
            </colgroup>
            <thead>
              <tr>
                <TH>Order ID</TH>
                <TH>Order No</TH>
                <TH>Client Name</TH>
                <TH>Date</TH>
                <TH>Client PO</TH>
                <TH right>Total (₹)</TH>
                <TH>Status</TH>
                <TH>Actions</TH>
              </tr>
            </thead>
            <tbody>
              {filtered.map((order, idx) => {
                const bg = idx % 2 === 0 ? '#fff' : '#f8fbff';
                const td = (content, right=false, extra={}) => (
                  <td style={{ padding:'6px 10px', borderRight:'1px solid #d1d5db',
                    borderBottom:'1px solid #e5e7eb', background:bg,
                    textAlign: right?'right':'left', verticalAlign:'middle',
                    overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
                    maxWidth:0, ...extra }}>
                    {content}
                  </td>
                );
                return (
                  <tr key={order.orderId}
                    style={{ cursor:'pointer', transition:'background 0.1s' }}
                    onClick={() => setSelected(order)}
                    onMouseEnter={e => [...e.currentTarget.cells].forEach(c=>c.style.background='#F0F4FF')}
                    onMouseLeave={e => [...e.currentTarget.cells].forEach(c=>c.style.background=bg)}>
                    {td(<span style={{ fontWeight:700, color:P }}>{order.orderId}</span>)}
                    {td(<span style={{ fontWeight:600, color:'#1e293b' }}>{order.orderNo || '—'}</span>)}
                    {td(<span style={{ fontWeight:600, color:'#111827' }}>{order.customerName || order.clientName || order.party || '—'}</span>)}
                    {td(<span style={{ color:'#6b7280' }}>{fmtD(order.orderDate || order.date)}</span>)}
                    {td(<span style={{ color:'#6b7280' }}>{order.customerPO || order.reference || '—'}</span>)}
                    {td(<strong style={{ color:'#1e293b' }}>{fmt(grand(order))}</strong>, true)}
                    <td style={{ padding:'6px 10px', borderRight:'1px solid #d1d5db',
                      borderBottom:'1px solid #e5e7eb', background:bg, verticalAlign:'middle' }}>
                      <Badge s={order.status} />
                    </td>
                    <td style={{ padding:'4px 8px', borderBottom:'1px solid #e5e7eb', background:bg,
                      verticalAlign:'middle' }}
                      onClick={e => e.stopPropagation()}>
                      <div style={{ display:'flex', gap:5, alignItems:'center' }}>
                        <button onClick={() => setSelected(order)}
                          style={{ padding:'3px 10px', fontSize:10.5, fontWeight:600, fontFamily:F,
                            cursor:'pointer', border:`1px solid ${P}`, borderRadius:4,
                            background:'#fff', color:P }}>
                          👁 View
                        </button>
                        {can(user,'salesOrder','approve') && (
                          <button onClick={() => doApprove(order.orderId)}
                            style={{ padding:'3px 10px', fontSize:10.5, fontWeight:600, fontFamily:F,
                              cursor:'pointer', border:'1px solid #16a34a', borderRadius:4,
                              background:'#fff', color:'#16a34a' }}>
                            ✓ Approve
                          </button>
                        )}
                        {can(user,'salesOrder','approve') && (
                          <button onClick={() => doReject(order.orderId)}
                            style={{ padding:'3px 10px', fontSize:10.5, fontWeight:600, fontFamily:F,
                              cursor:'pointer', border:'1px solid #ef4444', borderRadius:4,
                              background:'#fff', color:'#ef4444' }}>
                            ✕ Reject
                          </button>
                        )}
                        <button onClick={() => navigate(`/sales-order/edit/${order.orderId}`)}
                          style={{ padding:'3px 10px', fontSize:10.5, fontWeight:600, fontFamily:F,
                            cursor:'pointer', border:'1px solid #d97706', borderRadius:4,
                            background:'#fff', color:'#d97706' }}>
                          ✏️ Edit
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Footer count */}
      {!loading && (
        <div style={{ flexShrink:0, padding:'5px 12px', background:'#f1f5f9',
          borderTop:'1px solid #e2e8f0', fontSize:11, color:'#6b7280', fontFamily:F }}>
          Showing {filtered.length} of {orders.length} pending / draft orders
        </div>
      )}
    </div>
  );
};

export default PendingSalesOrders;
