import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { printSalesOrder } from '../../utils/printSalesOrder';
import { useCompany } from '../../context/CompanyContext';
import { OrderModal } from './Pending';

const P  = '#2F6FED';
const PD = '#1A56D6';
const BG = '#F5F7FB';
const BD = '#E5EAF2';
const F  = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

/* ── Status badge ── */
const STATUS_MAP = {
  approved: { bg: '#ECFDF5', color: '#059669', dot: '#059669', label: 'Approved' },
  pending:  { bg: '#FFFBEB', color: '#D97706', dot: '#D97706', label: 'Pending'  },
  draft:    { bg: '#EFF6FF', color: '#2563EB', dot: '#93C5FD', label: 'Draft'    },
};
const StatusBadge = ({ status }) => {
  const s = STATUS_MAP[status] || STATUS_MAP.draft;
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'3px 10px',
      borderRadius:20, fontSize:11, fontWeight:700, background:s.bg, color:s.color,
      border:`1px solid ${s.dot}30`, fontFamily:F }}>
      <span style={{ width:6, height:6, borderRadius:'50%', background:s.dot, flexShrink:0 }} />
      {s.label}
    </span>
  );
};

const ViewSalesOrders = () => {
  const [orders,   setOrders]   = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [message,  setMessage]  = useState('');
  const [search,   setSearch]   = useState('');
  const [selected, setSelected] = useState(null);
  const [filter,   setFilter]   = useState('all');
  const navigate = useNavigate();
  const { selectedCompany } = useCompany();

  useEffect(() => { fetchOrders(); }, [selectedCompany]); // eslint-disable-line

  const fetchOrders = async () => {
    if (!selectedCompany?.companyId) { setLoading(false); return; }
    try {
      setLoading(true);
      const res = await axios.get('/api/sales-orders');
      setOrders(res.data);
    } catch (err) { setMessage('Error fetching orders: ' + err.message); }
    finally { setLoading(false); }
  };

  const handleDelete = async (orderId) => {
    if (!window.confirm('Delete this sales order?')) return;
    try {
      await axios.delete(`/api/sales-orders/${orderId}`);
      setMessage('Order deleted successfully');
      fetchOrders();
    } catch (err) { setMessage('Error: ' + err.message); }
  };

  const fmtDate = (d) => {
    if (!d) return '—';
    const dt = new Date(d);
    if (isNaN(dt)) return d;
    return `${String(dt.getDate()).padStart(2,'0')}-${String(dt.getMonth()+1).padStart(2,'0')}-${dt.getFullYear()}`;
  };

  /* Build flat rows (one per item) */
  const allRows = [];
  let srNo = 0;
  orders.forEach(order => {
    const orderId   = order.orderId   || order.voucherNumber || '—';
    const orderRef  = order.quotationRef || order.orderRef || order.reference || '—';
    const partyName = order.customerName || order.party || order.clientName || '—';
    const orderDate = order.orderDate || order.date  || '—';
    const items     = order.items && order.items.length > 0 ? order.items : [{}];

    items.forEach((item, idx) => {
      srNo++;
      const qty    = parseFloat(item.qty) || parseFloat(item.quantity) || 0;
      const rate   = parseFloat(item.rate) || 0;
      const amount = parseFloat(item.amount) || (qty * rate);
      const gstPct = parseFloat(item.gstPercent) || 0;
      const gstAmt = amount * gstPct / 100;
      const total  = amount + gstAmt;

      allRows.push({
        srNo, orderId, internalId: order.orderId, orderRef, partyName, orderDate,
        status: order.status, order, isFirstItem: idx === 0, itemCount: items.length,
        dueDate: item.dueDate || '—',
        itemName: item.itemName || item.description || '—',
        description: item.description || '—',
        qty, unit: item.unit || '—', rate, amount, gstPct, gstAmt, total,
      });
    });
  });

  const q = search.toLowerCase();
  const filtered = allRows.filter(r => {
    const matchQ = !q ||
      String(r.orderId).toLowerCase().includes(q) ||
      String(r.internalId).toLowerCase().includes(q) ||
      r.orderRef.toLowerCase().includes(q) ||
      r.partyName.toLowerCase().includes(q) ||
      r.itemName.toLowerCase().includes(q) ||
      fmtDate(r.orderDate).includes(q);
    const matchF = filter === 'all' || r.status === filter;
    return matchQ && matchF;
  });

  const totalOrders  = orders.length;
  const uniqueOrders = new Set(filtered.map(r => r.internalId)).size;

  /* KPI counts */
  const kpis = {
    total:    orders.length,
    approved: orders.filter(o => o.status === 'approved').length,
    pending:  orders.filter(o => o.status === 'pending').length,
    draft:    orders.filter(o => !o.status || o.status === 'draft').length,
  };

  const th = {
    padding: '9px 10px', background: P, color: '#fff',
    fontSize: 11, fontWeight: 700, textAlign: 'left',
    whiteSpace: 'nowrap', border: `1px solid ${PD}`, fontFamily: F,
    letterSpacing: '0.3px',
  };
  const td = {
    padding: '7px 10px', fontSize: 11.5, fontFamily: F,
    border: `1px solid ${BD}`, verticalAlign: 'middle', color: '#374151',
  };

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:300, fontFamily:F, color:'#94A3B8', fontSize:14 }}>
      Loading sales orders…
    </div>
  );

  return (
    <div style={{ background: BG, minHeight: '100%', fontFamily: F }}>

      {selected && <OrderModal order={selected} company={selectedCompany} onClose={() => setSelected(null)} readOnly />}

      {/* Page Header */}
      <div style={{ background: P, padding: '14px 20px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div>
          <div style={{ fontSize:15, fontWeight:800, color:'#fff', letterSpacing:'-0.2px' }}>Sales Order Register</div>
          <div style={{ fontSize:11, color:'rgba(255,255,255,0.6)', marginTop:2, fontWeight:500 }}>
            {totalOrders} orders · {allRows.length} line items
          </div>
        </div>
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          <button onClick={fetchOrders}
            style={{ height:32, padding:'0 14px', fontSize:12, fontFamily:F, cursor:'pointer',
              background:'rgba(255,255,255,0.12)', color:'#fff', border:'1px solid rgba(255,255,255,0.25)',
              borderRadius:6, fontWeight:600 }}>
            ↻ Refresh
          </button>
          <button onClick={() => navigate('/sales-order/create')}
            style={{ height:32, padding:'0 16px', fontSize:12, fontFamily:F, cursor:'pointer',
              background:'#fff', color:P, border:'none', borderRadius:6, fontWeight:800 }}>
            + New SO
          </button>
        </div>
      </div>

      {/* KPI strip */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:0, borderBottom:`1px solid ${BD}`, background:'#fff' }}>
        {[
          { label:'Total Orders', value:kpis.total,    color:P,        icon:'📋' },
          { label:'Approved',     value:kpis.approved, color:'#059669', icon:'✅' },
          { label:'Pending',      value:kpis.pending,  color:'#D97706', icon:'⏳' },
          { label:'Draft',        value:kpis.draft,    color:'#6366F1', icon:'📝' },
        ].map((k,i) => (
          <div key={i} style={{ padding:'12px 20px', borderRight: i < 3 ? `1px solid ${BD}` : 'none',
            cursor:'pointer', transition:'background 0.15s',
            background: filter === (i===0?'all':i===1?'approved':i===2?'pending':'draft') ? '#F0F4FF' : '#fff' }}
            onClick={() => setFilter(i===0?'all':i===1?'approved':i===2?'pending':'draft')}
          >
            <div style={{ fontSize:11, color:'#6B7280', fontWeight:600, marginBottom:4 }}>{k.icon} {k.label}</div>
            <div style={{ fontSize:22, fontWeight:800, color:k.color }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div style={{ padding:'12px 16px', background:'#fff', borderBottom:`1px solid ${BD}`, display:'flex', gap:8, alignItems:'center' }}>
        <div style={{ position:'relative', flex:1, maxWidth:340 }}>
          <span style={{ position:'absolute', left:9, top:'50%', transform:'translateY(-50%)', fontSize:13, color:'#9CA3AF' }}>🔍</span>
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search order ID, ref, party, item…"
            style={{ width:'100%', height:32, paddingLeft:30, paddingRight:8, border:`1px solid ${BD}`,
              borderRadius:6, fontSize:12, fontFamily:F, outline:'none', background:'#F9FAFB', color:'#1F2937',
              boxSizing:'border-box' }}
          />
          {search && (
            <button onClick={() => setSearch('')}
              style={{ position:'absolute', right:6, top:'50%', transform:'translateY(-50%)',
                background:'none', border:'none', cursor:'pointer', color:'#9CA3AF', fontSize:14, padding:0 }}>✕</button>
          )}
        </div>
        <div style={{ marginLeft:'auto', fontSize:11, color:'#6B7280', fontWeight:500 }}>
          Showing {uniqueOrders} of {totalOrders} orders
        </div>
      </div>

      {message && (
        <div style={{ margin:'0 16px 0', padding:'8px 14px', fontSize:12, fontFamily:F,
          background: message.includes('Error') ? '#FEF2F2' : '#ECFDF5',
          color: message.includes('Error') ? '#DC2626' : '#059669',
          border: `1px solid ${message.includes('Error') ? '#FECACA' : '#A7F3D0'}`,
          borderRadius:6, marginTop:10 }}>
          {message}
        </div>
      )}

      {/* Table */}
      <div style={{ padding:'12px 16px' }}>
        {filtered.length === 0 ? (
          <div style={{ textAlign:'center', padding:'60px 20px', color:'#9CA3AF', fontSize:13, background:'#fff',
            borderRadius:8, border:`1px solid ${BD}` }}>
            {search ? 'No orders match your search.' : 'No sales orders yet. Click [+ New SO] to create one.'}
          </div>
        ) : (
          <div style={{ overflowX:'auto', background:'#fff', borderRadius:8, border:`1px solid ${BD}`,
            boxShadow:'0 1px 3px rgba(0,0,0,0.06)' }}>
            <table style={{ width:'100%', minWidth:1400, borderCollapse:'collapse', fontSize:11, fontFamily:F }}>
              <thead>
                <tr>
                  {[
                    { label:'#',         w:36,  align:'center' },
                    { label:'Order ID',  w:110 },
                    { label:'Quot. Ref', w:110 },
                    { label:'Party',     w:160 },
                    { label:'Date',      w:90,  align:'center' },
                    { label:'Due Date',  w:90,  align:'center' },
                    { label:'Item Name', w:140 },
                    { label:'Description', w:200 },
                    { label:'Qty',       w:55,  align:'right' },
                    { label:'Unit',      w:55,  align:'center' },
                    { label:'Rate',      w:80,  align:'right' },
                    { label:'Amount',    w:90,  align:'right' },
                    { label:'GST%',      w:55,  align:'center' },
                    { label:'GST Amt',   w:80,  align:'right' },
                    { label:'Total',     w:95,  align:'right' },
                    { label:'Status',    w:90,  align:'center' },
                    { label:'Actions',   w:180, align:'center' },
                  ].map(h => (
                    <th key={h.label} style={{ ...th, width:h.w, textAlign:h.align||'left' }}>{h.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((row, idx) => (
                  <tr key={`${row.internalId}-${idx}`}
                    style={{ background: row.isFirstItem && idx > 0 ? '#F8FAFF' : idx % 2 === 0 ? '#fff' : '#FAFBFC',
                      borderTop: row.isFirstItem && idx > 0 ? `2px solid ${BD}` : 'none' }}>
                    <td style={{ ...td, textAlign:'center', color:'#9CA3AF', fontWeight:500 }}>{row.srNo}</td>
                    <td style={td}>
                      <span style={{ fontWeight:800, color:P, fontSize:11.5 }}>{row.orderId}</span>
                    </td>
                    <td style={{ ...td, color:'#6B7280', fontSize:11 }}>{row.orderRef}</td>
                    <td style={{ ...td, fontWeight:600, maxWidth:160, wordBreak:'break-word' }}>{row.partyName}</td>
                    <td style={{ ...td, textAlign:'center', whiteSpace:'nowrap', color:'#4B5563' }}>{fmtDate(row.orderDate)}</td>
                    <td style={{ ...td, textAlign:'center', whiteSpace:'nowrap', color:'#4B5563' }}>{row.dueDate}</td>
                    <td style={{ ...td, fontWeight:600, color:'#111827' }}>{row.itemName}</td>
                    <td style={{ ...td, maxWidth:200, wordBreak:'break-word', color:'#6B7280', fontSize:11 }}>{row.description}</td>
                    <td style={{ ...td, textAlign:'right', fontWeight:600 }}>{row.qty || '—'}</td>
                    <td style={{ ...td, textAlign:'center', color:'#6B7280' }}>{row.unit}</td>
                    <td style={{ ...td, textAlign:'right' }}>{row.rate > 0 ? row.rate.toLocaleString('en-IN', { minimumFractionDigits:2 }) : '—'}</td>
                    <td style={{ ...td, textAlign:'right', fontWeight:600 }}>{row.amount > 0 ? row.amount.toLocaleString('en-IN', { minimumFractionDigits:2 }) : '—'}</td>
                    <td style={{ ...td, textAlign:'center', color:'#6B7280' }}>{row.gstPct > 0 ? `${row.gstPct}%` : '—'}</td>
                    <td style={{ ...td, textAlign:'right', color:'#6B7280' }}>{row.gstPct > 0 ? row.gstAmt.toLocaleString('en-IN', { minimumFractionDigits:2 }) : '—'}</td>
                    <td style={{ ...td, textAlign:'right', fontWeight:800, color:P }}>
                      {row.total > 0 ? '₹' + row.total.toLocaleString('en-IN', { minimumFractionDigits:2 }) : '—'}
                    </td>

                    {row.isFirstItem ? (
                      <>
                        <td rowSpan={row.itemCount} style={{ ...td, textAlign:'center', verticalAlign:'middle' }}>
                          <StatusBadge status={row.status} />
                        </td>
                        <td rowSpan={row.itemCount} style={{ ...td, textAlign:'center', verticalAlign:'middle' }}>
                          <div style={{ display:'flex', flexDirection:'column', gap:4, alignItems:'center' }}>
                            <button onClick={() => setSelected(row.order)}
                              style={{ width:130, padding:'4px 0', fontSize:11, cursor:'pointer', fontFamily:F, fontWeight:600,
                                background:'#F0F4FF', color:P, border:`1px solid ${P}30`, borderRadius:5 }}>
                              👁 View
                            </button>
                            <button onClick={() => navigate(`/sales-order/project/${row.internalId}`)}
                              style={{ width:130, padding:'4px 0', fontSize:11, cursor:'pointer', fontFamily:F, fontWeight:700,
                                background:P, color:'#fff', border:'none', borderRadius:5 }}>
                              📊 Dashboard
                            </button>
                            <button onClick={() => navigate(`/sales-order/edit/${row.internalId}`)}
                              style={{ width:130, padding:'4px 0', fontSize:11, cursor:'pointer', fontFamily:F, fontWeight:600,
                                background:'#F0FFF4', color:'#059669', border:'1px solid #059669aa', borderRadius:5 }}>
                              ✏️ Edit
                            </button>
                            <button onClick={() => printSalesOrder(row.order, selectedCompany)}
                              style={{ width:130, padding:'4px 0', fontSize:11, cursor:'pointer', fontFamily:F, fontWeight:600,
                                background:'#FFFBEB', color:'#D97706', border:'1px solid #D97706aa', borderRadius:5 }}>
                              🖨️ Print
                            </button>
                            <button onClick={() => handleDelete(row.internalId)}
                              style={{ width:130, padding:'4px 0', fontSize:11, cursor:'pointer', fontFamily:F, fontWeight:600,
                                background:'#FEF2F2', color:'#DC2626', border:'1px solid #DC2626aa', borderRadius:5 }}>
                              🗑️ Delete
                            </button>
                          </div>
                        </td>
                      </>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Table footer */}
            <div style={{ padding:'10px 16px', borderTop:`1px solid ${BD}`, fontSize:11, color:'#9CA3AF',
              fontFamily:F, display:'flex', justifyContent:'space-between', background:'#FAFBFC' }}>
              <span>Showing {filtered.length} item rows across {uniqueOrders} orders</span>
              <span>{allRows.length} total line items across {totalOrders} orders</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ViewSalesOrders;
