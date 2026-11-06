import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { printPurchaseOrder } from '../../utils/printPurchaseOrder';
import { useCompany } from '../../context/CompanyContext';
import { useAuth } from '../../context/AuthContext';
import ActivityDrawer from '../../components/ActivityDrawer';
import POViewModal, { StatusBadge } from '../../components/POViewModal';

const P   = '#133d80';
const PD  = '#1A56D6';
const BG  = '#F5F7FB';
const BD  = '#E5EAF2';
const F   = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

/* ── Main list page ── */
const ViewPurchaseOrders = () => {
  const [orders,      setOrders]      = useState([]);
  const [soClientMap, setSoClientMap] = useState({});
  const [loading,     setLoading]     = useState(true);
  const [message,     setMessage]     = useState('');
  const [search,      setSearch]      = useState('');
  const [poModal,     setPoModal]     = useState(null);
  const [selPO,       setSelPO]       = useState(null);
  const [activityRec, setActivityRec] = useState(null);
  const [expandedCols, setExpandedCols] = useState(new Set());
  const toggleCol = name => setExpandedCols(prev => { const n = new Set(prev); n.has(name) ? n.delete(name) : n.add(name); return n; });
  const [filter,      setFilter]      = useState('all');
  const [fy,          setFy]          = useState('all');
  const navigate = useNavigate();
  const { selectedCompany } = useCompany();
  const { user } = useAuth();

  useEffect(() => { fetchOrders(); }, [selectedCompany]); // eslint-disable-line

  const fetchOrders = async () => {
    try {
      setLoading(true);
      const cid = selectedCompany?.companyId || '';
      const [poRes, soRes] = await Promise.all([
        axios.get(`/api/purchase-orders${cid ? `?companyId=${cid}` : ''}`),
        axios.get(`/api/sales-orders?companyId=${cid}`).catch(() => ({ data: [] })),
      ]);
      setOrders(poRes.data);
      const map = {};
      (soRes.data || []).forEach(so => {
        map[String(so.orderId)] = so.customerName || so.clientName || '';
      });
      setSoClientMap(map);
    } catch (err) { setMessage('Error: ' + err.message); }
    finally { setLoading(false); }
  };

  const handleDelete = async (orderId, e) => {
    e?.stopPropagation();
    if (!window.confirm('Delete this purchase order?')) return;
    try {
      await axios.delete(`/api/purchase-orders/${orderId}`);
      setMessage('Purchase order deleted');
      if (selPO?.orderId === orderId) setSelPO(null);
      fetchOrders();
    } catch (err) { setMessage('Error: ' + err.message); }
  };

  const grandTotal = (order) => {
    if (order.grandTotal) return parseFloat(order.grandTotal);
    return (order.items || []).reduce((s, it) => {
      const qty  = parseFloat(it.qty || it.quantity) || 0;
      const rate = parseFloat(it.rate) || 0;
      const base = qty * rate;
      const disc = it.discountType === '%' ? base * (parseFloat(it.discount) || 0) / 100 : (parseFloat(it.discount) || 0);
      const taxable = base - disc;
      return s + taxable + taxable * (parseFloat(it.gstPercent) || 0) / 100;
    }, 0);
  };

  const fmt = n => '₹' + Number(n || 0).toFixed(2);
  const fmtD = d => d ? new Date(d).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' }) : '—';
  const getFY = d => { if(!d) return null; const dt=new Date(d); if(isNaN(dt)) return null; const y=dt.getFullYear(),m=dt.getMonth()+1,s=m>=4?y:y-1; return `${String(s).slice(2)}-${String(s+1).slice(2)}`; };

  const fyList = useMemo(() => {
    const set = new Set();
    orders.forEach(o => { const f = getFY(o.poDate||o.orderDate); if(f) set.add(f); });
    return Array.from(set).sort().reverse();
  }, [orders]);

  const filtered = orders.filter(o => {
    const q = search.toLowerCase();
    const clientName = soClientMap[String(o.linkedSalesOrderId)] || '';
    const matchQ = !q ||
      String(o.orderId).includes(q) ||
      (o.poNo||'').toLowerCase().includes(q) ||
      (o.vendorName||'').toLowerCase().includes(q) ||
      (o.linkedSalesOrderId||'').toString().includes(q) ||
      clientName.toLowerCase().includes(q) ||
      (o.poDate||o.orderDate||'').includes(q);
    const matchF = filter === 'all' || (o.status || 'draft') === filter;
    const matchFY = fy === 'all' || getFY(o.poDate||o.orderDate) === fy;
    return matchQ && matchF && matchFY;
  });

  const kpis = {
    total:    orders.length,
    approved: orders.filter(o => o.status === 'approved').length,
    pending:  orders.filter(o => o.status === 'pending').length,
    draft:    orders.filter(o => !o.status || o.status === 'draft').length,
  };

  const th = { padding:'9px 12px', background:P, color:'#fff', fontSize:11, fontWeight:700,
    textAlign:'left', whiteSpace:'nowrap', border:`1px solid ${PD}`, fontFamily:F, letterSpacing:'0.3px' };
  const td = { padding:'10px 12px', fontSize:12, fontFamily:F, border:`1px solid ${BD}`, verticalAlign:'middle' };

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:300, fontFamily:F, color:'#94A3B8', fontSize:14 }}>
      Loading purchase orders…
    </div>
  );

  return (
    <div style={{ background:BG, minHeight:'100%', fontFamily:F }}>

      {poModal && (
        <POViewModal
          order={poModal}
          selectedCompany={selectedCompany}
          onClose={() => setPoModal(null)}
          onEdit={() => { setPoModal(null); navigate(`/purchase-order/edit/${poModal.orderId}`); }}
          onPrint={() => printPurchaseOrder(poModal, selectedCompany, user)}
          onDelete={() => { handleDelete(poModal.orderId); setPoModal(null); }}
        />
      )}
      <ActivityDrawer record={activityRec} recordType="po" onClose={()=>setActivityRec(null)} />

      {/* Page Header */}
      <div style={{ background:P, padding:'14px 20px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div>
          <div style={{ fontSize:15, fontWeight:800, color:'#fff', letterSpacing:'-0.2px' }}>Purchase Orders</div>
          <div style={{ fontSize:11, color:'rgba(255,255,255,0.6)', marginTop:2, fontWeight:500 }}>
            {orders.length} purchase orders
          </div>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={fetchOrders}
            style={{ height:32, padding:'0 14px', fontSize:12, fontFamily:F, cursor:'pointer',
              background:'rgba(255,255,255,0.12)', color:'#fff', border:'1px solid rgba(255,255,255,0.25)',
              borderRadius:6, fontWeight:600 }}>
            ↻ Refresh
          </button>
          <button onClick={() => navigate('/purchase-order/create')}
            style={{ height:32, padding:'0 16px', fontSize:12, fontFamily:F, cursor:'pointer',
              background:'#fff', color:P, border:'none', borderRadius:6, fontWeight:800 }}>
            + New PO
          </button>
        </div>
      </div>

      {/* KPI strip */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', borderBottom:`1px solid ${BD}`, background:'#fff' }}>
        {[
          { label:'Total Orders', value:kpis.total,    color:P,        fk:'all'      },
          { label:'Approved',     value:kpis.approved, color:'#059669', fk:'approved' },
          { label:'Pending',      value:kpis.pending,  color:'#D97706', fk:'pending'  },
          { label:'Draft',        value:kpis.draft,    color:'#6366F1', fk:'draft'    },
        ].map((k,i) => (
          <div key={i} onClick={() => setFilter(k.fk)}
            style={{ padding:'12px 20px', borderRight: i < 3 ? `1px solid ${BD}` : 'none',
              cursor:'pointer', background: filter === k.fk ? '#F0F4FF' : '#fff', transition:'background 0.15s' }}>
            <div style={{ fontSize:11, color:'#6B7280', fontWeight:600, marginBottom:4 }}>{k.label}</div>
            <div style={{ fontSize:22, fontWeight:800, color:k.color }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div style={{ padding:'10px 16px', background:'#fff', borderBottom:`1px solid ${BD}`, display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
        <div style={{ position:'relative', flex:1, maxWidth:320 }}>
          <span style={{ position:'absolute', left:9, top:'50%', transform:'translateY(-50%)', fontSize:13, color:'#9CA3AF' }}>🔍</span>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search PO No., vendor, linked SO…"
            style={{ width:'100%', height:32, paddingLeft:30, paddingRight:8, border:`1px solid ${BD}`,
              borderRadius:6, fontSize:12, fontFamily:F, outline:'none', background:'#F9FAFB',
              boxSizing:'border-box' }} />
          {search && (
            <button onClick={() => setSearch('')}
              style={{ position:'absolute', right:6, top:'50%', transform:'translateY(-50%)',
                background:'none', border:'none', cursor:'pointer', color:'#9CA3AF', fontSize:14, padding:0 }}>✕</button>
          )}
        </div>
        {fyList.length > 0 && (
          <div style={{ display:'flex', gap:4, alignItems:'center', flexWrap:'wrap' }}>
            {['all', ...fyList].map(f => (
              <button key={f} onClick={() => setFy(f)}
                style={{ height:30, padding:'0 10px', borderRadius:6, border:`1px solid ${fy===f ? P : BD}`, background: fy===f ? P : '#fff', color: fy===f ? '#fff' : '#374151', fontSize:11, fontWeight:600, cursor:'pointer', fontFamily:F, whiteSpace:'nowrap' }}>
                {f === 'all' ? 'All FY' : `FY ${f}`}
              </button>
            ))}
          </div>
        )}
        <div style={{ marginLeft:'auto', fontSize:11, color:'#6B7280', fontWeight:500 }}>
          {filtered.length} of {orders.length} orders
        </div>
      </div>

      {message && (
        <div style={{ margin:'10px 16px 0', padding:'8px 14px', fontSize:12, fontFamily:F,
          background: message.includes('Error') ? '#FEF2F2' : '#ECFDF5',
          color: message.includes('Error') ? '#DC2626' : '#059669',
          border:`1px solid ${message.includes('Error') ? '#FECACA' : '#A7F3D0'}`,
          borderRadius:6 }}>
          {message}
        </div>
      )}

      {/* ── Contextual Action Bar ── */}
      {selPO && (
        <div style={{ margin:'8px 16px 0', background:'linear-gradient(90deg,#1D4ED8,#2563EB)', borderRadius:7, padding:'5px 12px', display:'flex', alignItems:'center', gap:8 }}>
          <span style={{ fontSize:11, color:'rgba(255,255,255,0.8)' }}>▶</span>
          <span style={{ fontSize:12, fontWeight:700, color:'#fff', flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
            {selPO.poNo || selPO.orderId} · {selPO.vendorName || ''}
          </span>
          {[
            { label:'👁 View',   fn:()=>setPoModal(selPO) },
            { label:'✏️ Edit',   fn:()=>navigate(`/purchase-order/edit/${selPO.orderId}`) },
            { label:'🖨️ Print',  fn:()=>printPurchaseOrder(selPO, selectedCompany, user) },
            { label:'🗑️ Delete', fn:()=>handleDelete(selPO.orderId), danger:true },
          ].map(btn => (
            <button key={btn.label} onClick={btn.fn}
              style={{ height:26, padding:'0 11px', fontSize:11, cursor:'pointer', fontFamily:F, fontWeight:700, borderRadius:5, whiteSpace:'nowrap', border:'none', background: btn.danger ? 'rgba(220,38,38,0.35)' : 'rgba(255,255,255,0.18)', color:'#fff' }}>
              {btn.label}
            </button>
          ))}
          <button onClick={()=>setSelPO(null)}
            style={{ height:26, width:26, background:'rgba(255,255,255,0.15)', border:'none', color:'#fff', borderRadius:5, cursor:'pointer', fontSize:13 }}>✕</button>
        </div>
      )}

      {/* Table */}
      <div style={{ padding:'12px 16px' }}>
        {filtered.length === 0 ? (
          <div style={{ textAlign:'center', padding:'60px 20px', color:'#9CA3AF', fontSize:13,
            background:'#fff', borderRadius:8, border:`1px solid ${BD}` }}>
            {search ? 'No orders match your search.' : 'No purchase orders yet. Click [+ New PO] to create one.'}
          </div>
        ) : (
          <div style={{ background:'#fff', borderRadius:8, border:`1px solid ${BD}`,
            boxShadow:'0 1px 3px rgba(0,0,0,0.06)', overflow:'hidden' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12, fontFamily:F }}>
              <thead>
                <tr>
                  <th style={{ ...th, textAlign:'center', width:36 }}>#</th>
                  <th style={th}>SO No.</th>
                  <th style={th}>Client Name</th>
                  <th style={th}>Vendor Name</th>
                  <th onClick={()=>toggleCol('poDesc')} title="Click to expand PO Description"
                    style={{ ...th, width:expandedCols.has('poDesc')?220:28, minWidth:expandedCols.has('poDesc')?220:28, cursor:'pointer', userSelect:'none', padding:'2px', overflow:'hidden', transition:'width .2s' }}>
                    {expandedCols.has('poDesc')
                      ? <span style={{fontSize:9,whiteSpace:'nowrap'}}>◀ PO Description</span>
                      : <div style={{writingMode:'vertical-rl',transform:'rotate(180deg)',whiteSpace:'nowrap',fontSize:9}}>PO Description</div>}
                  </th>
                  <th style={{ ...th, textAlign:'center' }}>PO Date</th>
                  <th style={th}>PO No.</th>
                  <th style={th}>Product / Qty</th>
                  <th onClick={()=>toggleCol('itemDesc')} title="Click to expand Product Description"
                    style={{ ...th, width:expandedCols.has('itemDesc')?200:28, minWidth:expandedCols.has('itemDesc')?200:28, cursor:'pointer', userSelect:'none', padding:'2px', overflow:'hidden', transition:'width .2s' }}>
                    {expandedCols.has('itemDesc')
                      ? <span style={{fontSize:9,whiteSpace:'nowrap'}}>◀ Product Description</span>
                      : <div style={{writingMode:'vertical-rl',transform:'rotate(180deg)',whiteSpace:'nowrap',fontSize:9}}>Product Description</div>}
                  </th>
                  <th style={{ ...th, textAlign:'right' }}>Total Amount</th>
                  <th style={{ ...th, textAlign:'center' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((order, i) => {
                  const isSel = selPO?.orderId === order.orderId;
                  const rowBg = isSel ? '#EEF4FF' : i % 2 === 0 ? '#fff' : '#FAFBFC';
                  return (
                  <tr key={order.orderId}
                    onClick={() => setActivityRec(order)}
                    style={{ cursor:'pointer', background: rowBg, transition:'background 0.12s', outline: isSel ? `2px solid ${P}` : 'none', outlineOffset:'-2px' }}
                    onMouseEnter={e => { if(!isSel) e.currentTarget.style.background='#EEF4FF'; }}
                    onMouseLeave={e => { e.currentTarget.style.background=rowBg; }}>

                    {/* # select */}
                    <td style={{ ...td, textAlign:'center', cursor:'pointer', fontWeight:700, color: isSel ? '#fff' : '#9CA3AF', background: isSel ? P : 'transparent', fontSize:11 }}
                      onClick={e => { e.stopPropagation(); setSelPO(s => s?.orderId===order.orderId ? null : order); }}>
                      {isSel ? '✓' : i+1}
                    </td>

                    {/* SO No */}
                    <td style={td}>
                      {order.linkedSalesOrderId
                        ? <span style={{ fontSize:11, padding:'2px 9px', borderRadius:20, background:'#F0FFF4',
                            color:'#059669', fontWeight:700, border:'1px solid #A7F3D0' }}>
                            {order.linkedSalesOrderId}
                          </span>
                        : <span style={{ color:'#D1D5DB' }}>—</span>}
                    </td>

                    {/* Client Name */}
                    <td style={td}>
                      <div style={{ fontWeight:600, color:'#111827' }}>
                        {soClientMap[String(order.linkedSalesOrderId)] || <span style={{ color:'#D1D5DB' }}>—</span>}
                      </div>
                    </td>

                    {/* Vendor Name */}
                    <td style={td}>
                      <div style={{ fontWeight:600, color:'#374151' }}>{order.vendorName || '—'}</div>
                      {order.vendorCode && <div style={{ fontSize:10, color:'#9CA3AF' }}>{order.vendorCode}</div>}
                    </td>

                    {/* PO Description (expandable) */}
                    <td style={{ ...td,
                      width:expandedCols.has('poDesc')?220:28, minWidth:expandedCols.has('poDesc')?220:28,
                      maxWidth:expandedCols.has('poDesc')?240:28, overflow:'hidden',
                      padding:expandedCols.has('poDesc')?'4px 8px':'2px 1px',
                      fontSize:11, color:'#374151', wordBreak:'break-word', transition:'width .2s',
                    }}>
                      {expandedCols.has('poDesc') ? (order.termsConditions || order.customerNotes || order.remarks || <span style={{color:'#9ca3af',fontStyle:'italic'}}>—</span>) : ''}
                    </td>

                    {/* PO Date */}
                    <td style={{ ...td, textAlign:'center', color:'#4B5563', whiteSpace:'nowrap' }}>
                      {fmtD(order.poDate || order.orderDate)}
                    </td>

                    {/* PO No */}
                    <td style={td}>
                      <div style={{ fontWeight:800, color:P, fontSize:12.5 }}>{order.poNo || order.orderId}</div>
                    </td>

                    {/* Product / Qty */}
                    <td style={{ ...td, maxWidth:220 }}>
                      {(order.items || []).length === 0
                        ? <span style={{ color:'#D1D5DB' }}>—</span>
                        : (order.items || []).map((it, idx) => (
                          <div key={idx} style={{ display:'flex', justifyContent:'space-between', gap:8,
                            fontSize:11, color:'#374151', borderBottom: idx < order.items.length-1 ? '1px solid #F3F4F6' : 'none',
                            padding:'1px 0' }}>
                            <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', flex:1 }}>
                              {it.itemName || it.description || '—'}
                            </span>
                            <span style={{ fontWeight:700, color:P, whiteSpace:'nowrap' }}>
                              {it.qty || it.quantity || '—'} {it.unit || ''}
                            </span>
                          </div>
                        ))
                      }
                    </td>

                    {/* Product Description (expandable) */}
                    <td style={{ ...td,
                      width:expandedCols.has('itemDesc')?200:28, minWidth:expandedCols.has('itemDesc')?200:28,
                      maxWidth:expandedCols.has('itemDesc')?220:28, overflow:'hidden',
                      padding:expandedCols.has('itemDesc')?'4px 8px':'2px 1px',
                      fontSize:11, color:'#555', wordBreak:'break-word', transition:'width .2s',
                      verticalAlign:'top',
                    }}>
                      {expandedCols.has('itemDesc') ? (
                        (order.items||[]).length === 0
                          ? <span style={{color:'#9ca3af',fontStyle:'italic'}}>—</span>
                          : (order.items||[]).map((it,idx) => it.description && it.description !== it.itemName
                              ? <div key={idx} style={{marginBottom:2,paddingBottom:2,borderBottom:idx<order.items.length-1?'1px solid #f3f4f6':'none'}}>{it.description}</div>
                              : null
                            ).filter(Boolean).length > 0
                              ? (order.items||[]).map((it,idx) => it.description && it.description !== it.itemName
                                  ? <div key={idx} style={{marginBottom:2,paddingBottom:2,borderBottom:idx<order.items.length-1?'1px solid #f3f4f6':'none'}}>{it.description}</div>
                                  : null
                                )
                              : <span style={{color:'#9ca3af',fontStyle:'italic'}}>—</span>
                      ) : ''}
                    </td>

                    {/* Total Amount */}
                    <td style={{ ...td, textAlign:'right', fontWeight:800, color:P, fontSize:13 }}>
                      {fmt(grandTotal(order))}
                    </td>

                    {/* Status */}
                    <td style={{ ...td, textAlign:'center' }}>
                      <StatusBadge status={order.status} />
                    </td>

                  </tr>
                );})}
              </tbody>
            </table>

            <div style={{ padding:'10px 16px', borderTop:`1px solid ${BD}`, fontSize:11, color:'#9CA3AF',
              fontFamily:F, display:'flex', justifyContent:'space-between', background:'#FAFBFC' }}>
              <span>Showing {filtered.length} of {orders.length} purchase orders</span>
              <span>Click # to select · Click row to view activity</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ViewPurchaseOrders;
