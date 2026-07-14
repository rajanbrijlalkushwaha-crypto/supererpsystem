import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { printSalesOrder } from '../../utils/printSalesOrder';
import { useCompany } from '../../context/CompanyContext';
import { OrderModal } from './Pending';
import ActivityDrawer from '../../components/ActivityDrawer';

const P  = '#133d80';
const F  = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const BD = '#E5EAF2';

const getFY = d => {
  const dt = d ? new Date(d) : new Date();
  const m = dt.getMonth() + 1, y = dt.getFullYear(), s = m >= 4 ? y : y - 1;
  return `${String(s).slice(2)}-${String(s+1).slice(2)}`;
};
const fmt  = n => (parseFloat(n)||0).toFixed(2);
const fmtD = d => {
  if (!d) return '—';
  const dt = new Date(d);
  return isNaN(dt) ? d : `${String(dt.getDate()).padStart(2,'0')}-${String(dt.getMonth()+1).padStart(2,'0')}-${dt.getFullYear()}`;
};

const STATUS_COLOR = {
  approved:   { bg:'#ECFDF5', color:'#059669', border:'#A7F3D0' },
  confirmed:  { bg:'#ECFDF5', color:'#059669', border:'#A7F3D0' },
  pending:    { bg:'#FFFBEB', color:'#D97706', border:'#FDE68A' },
  draft:      { bg:'#EFF6FF', color:'#2563EB', border:'#BFDBFE' },
  rejected:   { bg:'#FEF2F2', color:'#DC2626', border:'#FECACA' },
  dispatched: { bg:'#F3E8FF', color:'#7C3AED', border:'#DDD6FE' },
  completed:  { bg:'#F0FFF4', color:'#065F46', border:'#6EE7B7' },
};
const StatusBadge = ({ status }) => {
  const s = STATUS_COLOR[status] || STATUS_COLOR.draft;
  return (
    <span style={{ display:'inline-block', padding:'2px 8px', borderRadius:10, fontSize:9.5,
      fontWeight:700, background:s.bg, color:s.color, border:`1px solid ${s.border}`, fontFamily:F }}>
      {status || 'draft'}
    </span>
  );
};

export default function ViewSalesOrders() {
  const [orders,   setOrders]   = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [message,  setMessage]  = useState('');
  const [search,   setSearch]   = useState('');
  const [fy,       setFy]       = useState(getFY());
  const [status,   setStatus]   = useState('all');
  const [modalOrder,  setModalOrder]  = useState(null);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [activityRec, setActivityRec] = useState(null);
  const [expandedCols, setExpandedCols] = useState(new Set());
  const toggleCol = name => setExpandedCols(prev => { const n = new Set(prev); n.has(name) ? n.delete(name) : n.add(name); return n; });
  const navigate = useNavigate();
  const { selectedCompany } = useCompany();
  const cid = selectedCompany?.companyId;

  useEffect(() => { fetchOrders(); }, [cid]); // eslint-disable-line

  const fetchOrders = async () => {
    if (!cid) { setLoading(false); return; }
    try {
      setLoading(true);
      const res = await axios.get(`/api/sales-orders?companyId=${cid}`);
      setOrders(res.data || []);
    } catch (err) { setMessage('Error: ' + err.message); }
    finally { setLoading(false); }
  };

  const handleDelete = async (orderId) => {
    if (!window.confirm('Delete this sales order?')) return;
    try {
      await axios.delete(`/api/sales-orders/${orderId}?companyId=${cid}`);
      setMessage('Order deleted');
      fetchOrders();
    } catch (err) { setMessage('Error: ' + err.message); }
  };

  /* ── FY list from order dates ── */
  const fyList = useMemo(() => {
    const s = new Set(orders.map(o => getFY(o.orderDate || o.date)));
    return ['all', ...[...s].sort().reverse()];
  }, [orders]);

  /* ── Status counts ── */
  const statusCounts = useMemo(() => {
    const base = { all:0, approved:0, pending:0, draft:0, dispatched:0, completed:0 };
    orders.forEach(o => {
      base.all++;
      const st = o.status || 'draft';
      if (base[st] !== undefined) base[st]++;
    });
    return base;
  }, [orders]);

  /* ── Filter orders ── */
  const filteredOrders = useMemo(() => {
    let list = fy === 'all' ? orders : orders.filter(o => getFY(o.orderDate||o.date) === fy);
    if (status !== 'all') list = list.filter(o => (o.status||'draft') === status);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(o =>
        String(o.orderId).includes(q) ||
        (o.orderNo||'').toLowerCase().includes(q) ||
        (o.customerName||o.clientName||'').toLowerCase().includes(q) ||
        (o.customerPO||'').toLowerCase().includes(q) ||
        (o.items||[]).some(it=>(it.itemName||it.description||'').toLowerCase().includes(q))
      );
    }
    return list;
  }, [orders, fy, status, search]);

  /* ── Build flat rows (one per item) ── */
  const allRows = useMemo(() => {
    const rows = [];
    filteredOrders.forEach(order => {
      const items = (order.items||[]).length > 0 ? order.items : [{}];
      /* order-level charges total */
      const pnf    = parseFloat(order.packingCharges) || 0;
      const frt    = parseFloat(order.freightCharges)  || 0;
      const custom = (order.charges||[]).reduce((s,c)=>s+(parseFloat(c.amount)||0),0);
      const otherCharges = pnf + frt + custom;
      const otherChargesLabel = [
        pnf>0 ? `P&F ₹${fmt(pnf)}` : '',
        frt>0 ? `Freight ₹${fmt(frt)}` : '',
        ...((order.charges||[]).filter(c=>parseFloat(c.amount)>0).map(c=>`${c.chargeType||'Charge'} ₹${fmt(c.amount)}`)),
      ].filter(Boolean).join(' · ');

      items.forEach((it, idx) => {
        const qty      = parseFloat(it.qty||it.quantity) || 0;
        const rate     = parseFloat(it.rate) || 0;
        const taxable  = qty * rate;
        const gstPct   = parseFloat(it.gst||it.gstPercent||it.taxRate) || 0;
        const gstAmt   = taxable * gstPct / 100;
        rows.push({
          key: `${order.orderId}-${idx}`,
          isFirst: idx === 0, isLast: idx === items.length - 1, rowCount: items.length,
          order,
          orderId:     order.orderId,
          orderNo:     order.orderNo || `SO-${order.orderId}`,
          clientName:  order.customerName || order.clientName || '—',
          orderDate:   order.orderDate || order.date,
          custPO:      order.customerPO || '—',
          dueDate:     order.dueDate || order.deliveryDate || '',
          product:     it.itemName || it.description || '—',
          orderDesc:   order.termsConditions || order.customerNotes || (order.scopeItems||[]).map(s=>s.description).filter(Boolean).join(' | ') || '',
          itemDesc:    it.description && it.description !== it.itemName ? it.description : '',
          qty, rate, taxable, gstPct, gstAmt,
          otherCharges, otherChargesLabel,
          orderValue:  parseFloat(order.grandTotal) || 0,
          status:      order.status || 'draft',
        });
      });
    });
    return rows;
  }, [filteredOrders]);

  /* ── Grand totals ── */
  const totals = useMemo(() => {
    const seen = new Set();
    let taxable=0, charges=0, orderValue=0;
    allRows.forEach(r => {
      taxable += r.taxable;
      if (!seen.has(r.orderId)) { seen.add(r.orderId); charges += r.otherCharges; orderValue += r.orderValue; }
    });
    return { taxable, charges, orderValue, orders: seen.size };
  }, [allRows]);

  const th = (align='left', w) => ({
    padding:'6px 8px', background:P, color:'#fff', fontSize:9.5, fontWeight:700,
    textAlign:align, border:`1px solid #1a3a9f`, whiteSpace:'nowrap', fontFamily:F,
    ...(w ? { width:w, minWidth:w } : {}),
  });
  const td = (align='left', ex={}) => ({
    padding:'4px 8px', fontSize:10.5, fontFamily:F, border:`1px solid ${BD}`,
    verticalAlign:'middle', textAlign:align, ...ex,
  });

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:300, fontFamily:F, color:'#94A3B8', fontSize:14 }}>
      Loading sales orders…
    </div>
  );

  return (
    <div style={{ fontFamily:F, fontSize:11, padding:8 }}>

      {modalOrder && <OrderModal order={modalOrder} company={selectedCompany} onClose={()=>setModalOrder(null)} readOnly />}
      <ActivityDrawer record={activityRec} recordType="so" onClose={()=>setActivityRec(null)} />

      {/* ── Header ── */}
      <div style={{ background:P, color:'#fff', padding:'8px 14px', borderRadius:'7px 7px 0 0',
        display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <div>
          <div style={{ fontSize:14, fontWeight:800 }}>📋 Sales Order Register</div>
          <div style={{ fontSize:10, opacity:0.7, marginTop:1 }}>{orders.length} orders · {fyList.filter(f=>f!=='all').length} financial year{fyList.length>2?'s':''}</div>
        </div>
        <div style={{ display:'flex', gap:6 }}>
          <button onClick={fetchOrders}
            style={{ height:28,padding:'0 12px',background:'rgba(255,255,255,0.15)',border:'1px solid rgba(255,255,255,0.3)',
              color:'#fff',borderRadius:5,cursor:'pointer',fontSize:11,fontWeight:600,fontFamily:F }}>
            ↻
          </button>
          <button onClick={()=>navigate('/sales-order/create')}
            style={{ height:28,padding:'0 14px',background:'#fff',border:'none',borderRadius:5,
              cursor:'pointer',color:P,fontSize:12,fontWeight:800,fontFamily:F }}>
            + New SO
          </button>
        </div>
      </div>

      {/* ── Filters bar ── */}
      <div style={{ background:'#f0f4fc', borderLeft:'1px solid #c8d4ee', borderRight:'1px solid #c8d4ee',
        padding:'8px 12px', display:'flex', gap:10, alignItems:'center', flexWrap:'wrap',
        borderBottom:'1px solid #c8d4ee' }}>

        {/* FY chips */}
        <div style={{ display:'flex', gap:4, alignItems:'center', flexWrap:'wrap' }}>
          <span style={{ fontSize:10, fontWeight:700, color:'#5a6a8a', marginRight:2 }}>FY:</span>
          {fyList.map(f => {
            const active = fy === f;
            return (
              <button key={f} onClick={()=>setFy(f)}
                style={{ height:24, padding:'0 10px', fontSize:10.5, fontWeight:active?700:500,
                  fontFamily:F, cursor:'pointer', borderRadius:12,
                  border:`1px solid ${active ? P : '#b8c8e8'}`,
                  background: active ? P : '#fff', color: active ? '#fff' : '#555',
                  transition:'all 0.12s' }}>
                {f === 'all' ? 'All Years' : `FY ${f}`}
              </button>
            );
          })}
        </div>

        <div style={{ width:1, height:20, background:'#c8d4ee', flexShrink:0 }}/>

        {/* Status chips */}
        <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
          {[
            { key:'all',       label:`All (${statusCounts.all})` },
            { key:'approved',  label:`Approved (${statusCounts.approved})` },
            { key:'pending',   label:`Pending (${statusCounts.pending})` },
            { key:'dispatched',label:`Dispatched (${statusCounts.dispatched||0})` },
            { key:'completed', label:`Completed (${statusCounts.completed||0})` },
            { key:'draft',     label:`Draft (${statusCounts.draft})` },
          ].map(s => {
            const active = status === s.key;
            return (
              <button key={s.key} onClick={()=>setStatus(s.key)}
                style={{ height:24, padding:'0 10px', fontSize:10.5, fontWeight:active?700:500,
                  fontFamily:F, cursor:'pointer', borderRadius:12,
                  border:`1px solid ${active ? '#5a6a8a' : '#b8c8e8'}`,
                  background: active ? '#5a6a8a' : '#fff', color: active ? '#fff' : '#555' }}>
                {s.label}
              </button>
            );
          })}
        </div>

        <div style={{ marginLeft:'auto', display:'flex', gap:6, alignItems:'center' }}>
          {/* Search */}
          <div style={{ position:'relative' }}>
            <span style={{ position:'absolute',left:8,top:'50%',transform:'translateY(-50%)',fontSize:12,color:'#9CA3AF' }}>🔍</span>
            <input value={search} onChange={e=>setSearch(e.target.value)}
              placeholder="Search order, client, product…"
              style={{ height:28, paddingLeft:26, paddingRight:search?26:8, border:'1px solid #b8c8e8',
                borderRadius:5, fontSize:11, fontFamily:F, outline:'none', background:'#fff',
                minWidth:220, color:'#1F2937' }}/>
            {search && (
              <button onClick={()=>setSearch('')}
                style={{ position:'absolute',right:6,top:'50%',transform:'translateY(-50%)',
                  background:'none',border:'none',cursor:'pointer',color:'#9CA3AF',fontSize:13,padding:0 }}>✕</button>
            )}
          </div>
          <span style={{ fontSize:10.5, color:'#6B7280', whiteSpace:'nowrap' }}>
            {totals.orders} order{totals.orders!==1?'s':''}
          </span>
        </div>
      </div>

      {message && (
        <div style={{ margin:'6px 0', padding:'8px 14px', fontSize:12, fontFamily:F, borderRadius:5,
          background: message.includes('Error') ? '#FEF2F2' : '#ECFDF5',
          color: message.includes('Error') ? '#DC2626' : '#059669',
          border: `1px solid ${message.includes('Error') ? '#FECACA' : '#A7F3D0'}` }}>
          {message}
        </div>
      )}

      {/* ── Contextual Action Bar ── */}
      {selectedOrder && (
        <div style={{ background:'linear-gradient(90deg,#1D4ED8,#2563EB)', padding:'5px 12px', display:'flex', alignItems:'center', gap:8 }}>
          <span style={{ fontSize:11, color:'rgba(255,255,255,0.8)', marginRight:2 }}>▶</span>
          <span style={{ fontSize:12, fontWeight:700, color:'#fff', flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
            {selectedOrder.orderNo || `SO-${selectedOrder.orderId}`} · {selectedOrder.customerName || selectedOrder.clientName || ''}
          </span>
          {[
            { label:'👁 View',       fn:()=>setModalOrder(selectedOrder) },
            { label:'📊 Dashboard',  fn:()=>navigate(`/sales-order/project/${selectedOrder.orderId}`) },
            { label:'✏️ Edit',       fn:()=>navigate(`/sales-order/edit/${selectedOrder.orderId}`) },
            { label:'🖨️ Print',      fn:()=>printSalesOrder(selectedOrder, selectedCompany) },
            { label:'🗑️ Delete',     fn:()=>handleDelete(selectedOrder.orderId), danger:true },
          ].map(btn => (
            <button key={btn.label} onClick={btn.fn}
              style={{ height:26, padding:'0 11px', fontSize:11, cursor:'pointer', fontFamily:F, fontWeight:700,
                borderRadius:5, whiteSpace:'nowrap', border:'none',
                background: btn.danger ? 'rgba(220,38,38,0.35)' : 'rgba(255,255,255,0.18)', color:'#fff' }}>
              {btn.label}
            </button>
          ))}
          <button onClick={()=>setSelectedOrder(null)}
            style={{ height:26, width:26, background:'rgba(255,255,255,0.15)', border:'none', color:'#fff', borderRadius:5, cursor:'pointer', fontSize:13 }}>✕</button>
        </div>
      )}

      {/* ── Table ── */}
      {allRows.length === 0 ? (
        <div style={{ textAlign:'center', padding:'50px 20px', color:'#9CA3AF', fontSize:13, background:'#fff',
          border:`1px solid ${BD}`, borderTop:'none', borderRadius:'0 0 7px 7px' }}>
          {search || status !== 'all' ? 'No orders match the current filters.' : 'No sales orders yet. Click + New SO to create one.'}
        </div>
      ) : (
        <div style={{ overflow:'auto', maxHeight:'calc(100vh - 220px)', border:`1px solid ${BD}`,
          borderTop:'none', borderRadius:'0 0 7px 7px' }}>
          <table style={{ borderCollapse:'collapse', fontSize:10.5, fontFamily:F, minWidth:1300 }}>
            <thead style={{ position:'sticky', top:0, zIndex:3 }}>
              <tr>
                <th style={th('center','38px')}>#</th>
                <th style={th('left','90px')}>Order ID</th>
                <th style={th('left','100px')}>Order No</th>
                <th style={th('left','140px')}>Client Name</th>
                <th onClick={()=>toggleCol('orderDesc')} title="Click to expand Order Description"
                  style={{ ...th('center'), width:expandedCols.has('orderDesc')?220:28, minWidth:expandedCols.has('orderDesc')?220:28, cursor:'pointer', userSelect:'none', padding:'2px', overflow:'hidden', transition:'width .2s' }}>
                  {expandedCols.has('orderDesc')
                    ? <span style={{fontSize:9,whiteSpace:'nowrap'}}>◀ Order Description</span>
                    : <div style={{writingMode:'vertical-rl',transform:'rotate(180deg)',whiteSpace:'nowrap',fontSize:9}}>Order Description</div>}
                </th>
                <th style={th('center','80px')}>Order Date</th>
                <th style={th('left','100px')}>Cust PO No</th>
                <th style={th('center','80px')}>Due Date</th>
                <th style={th('left','180px')}>Product / Description</th>
                <th onClick={()=>toggleCol('itemDesc')} title="Click to expand Product Description"
                  style={{ ...th('center'), width:expandedCols.has('itemDesc')?200:28, minWidth:expandedCols.has('itemDesc')?200:28, cursor:'pointer', userSelect:'none', padding:'2px', overflow:'hidden', transition:'width .2s' }}>
                  {expandedCols.has('itemDesc')
                    ? <span style={{fontSize:9,whiteSpace:'nowrap'}}>◀ Product Description</span>
                    : <div style={{writingMode:'vertical-rl',transform:'rotate(180deg)',whiteSpace:'nowrap',fontSize:9}}>Product Description</div>}
                </th>
                <th style={th('right','55px')}>Qty</th>
                <th style={th('right','80px')}>Rate (₹)</th>
                <th style={th('right','90px')}>Taxable (₹)</th>
                <th style={th('right','80px')}>GST%</th>
                <th style={th('right','120px')}>Other Charges (₹)</th>
                <th style={th('right','100px')}>Order Value (₹)</th>
                <th style={th('center','80px')}>Status</th>
              </tr>
            </thead>
            <tbody>
              {allRows.map((row, idx) => {
                const bg = row.order.orderId % 2 === 0 ? '#fff' : '#F9FAFB';
                return (
                  <tr key={row.key} style={{
                    background: bg,
                    borderTop: row.isFirst && idx > 0 ? '2px solid #c8d4e8' : undefined,
                  }}>
                    {row.isFirst && (
                      <td rowSpan={row.rowCount}
                        onClick={e=>{e.stopPropagation();setSelectedOrder(s=>s?.orderId===row.order.orderId?null:row.order);}}
                        style={{ ...td('center',{
                          color: selectedOrder?.orderId===row.orderId ? '#fff' : '#9CA3AF',
                          fontWeight:700,
                          background: selectedOrder?.orderId===row.orderId ? P : bg,
                          borderBottom:row.isLast?undefined:'2px solid #c8d4e8',
                          borderLeft:'2px solid #c8d4e8',fontSize:10, cursor:'pointer' }),
                          verticalAlign:'top', paddingTop:6 }}>
                        {selectedOrder?.orderId===row.orderId ? '✓' : filteredOrders.indexOf(row.order)+1}
                      </td>
                    )}
                    {row.isFirst && (
                      <td rowSpan={row.rowCount} style={{ ...td('left',{fontWeight:800,color:P,
                        background:bg,cursor:'pointer',borderBottom:row.isLast?undefined:'2px solid #c8d4e8'}),
                        verticalAlign:'top', paddingTop:6 }}
                        onClick={()=>setActivityRec(row.order)}>
                        {row.orderId}
                      </td>
                    )}
                    {row.isFirst && (
                      <td rowSpan={row.rowCount} style={{ ...td('left',{fontWeight:700,color:'#1a3a9a',
                        background:bg,borderBottom:row.isLast?undefined:'2px solid #c8d4e8'}),
                        verticalAlign:'top', paddingTop:6 }}>
                        {row.orderNo}
                      </td>
                    )}
                    {row.isFirst && (
                      <td rowSpan={row.rowCount} style={{ ...td('left',{fontWeight:600,
                        background:bg,borderBottom:row.isLast?undefined:'2px solid #c8d4e8',
                        maxWidth:140,wordBreak:'break-word'}), verticalAlign:'top', paddingTop:6 }}>
                        {row.clientName}
                      </td>
                    )}
                    {row.isFirst && (
                      <td rowSpan={row.rowCount} style={{ ...td('left',{
                        background:bg, borderBottom:row.isLast?undefined:'2px solid #c8d4e8',
                        width:expandedCols.has('orderDesc')?220:28, minWidth:expandedCols.has('orderDesc')?220:28,
                        maxWidth:expandedCols.has('orderDesc')?240:28, overflow:'hidden',
                        padding:expandedCols.has('orderDesc')?'4px 8px':'2px 1px',
                        fontSize:10.5, color:'#374151', wordBreak:'break-word', transition:'width .2s',
                      }), verticalAlign:'top', paddingTop:6 }}>
                        {expandedCols.has('orderDesc') ? (row.orderDesc || <span style={{color:'#9ca3af',fontStyle:'italic'}}>—</span>) : ''}
                      </td>
                    )}
                    {row.isFirst && (
                      <td rowSpan={row.rowCount} style={{ ...td('center',{color:'#4B5563',whiteSpace:'nowrap',
                        background:bg,borderBottom:row.isLast?undefined:'2px solid #c8d4e8'}),
                        verticalAlign:'top', paddingTop:6 }}>
                        {fmtD(row.orderDate)}
                      </td>
                    )}
                    {row.isFirst && (
                      <td rowSpan={row.rowCount} style={{ ...td('left',{color:'#555',
                        background:bg,borderBottom:row.isLast?undefined:'2px solid #c8d4e8'}),
                        verticalAlign:'top', paddingTop:6 }}>
                        {row.custPO}
                      </td>
                    )}
                    {row.isFirst && (
                      <td rowSpan={row.rowCount} style={{ ...td('center',{color:'#4B5563',whiteSpace:'nowrap',
                        background:bg,borderBottom:row.isLast?undefined:'2px solid #c8d4e8'}),
                        verticalAlign:'top', paddingTop:6 }}>
                        {fmtD(row.dueDate)||'—'}
                      </td>
                    )}

                    {/* Per-item columns */}
                    <td style={td('left',{maxWidth:180,wordBreak:'break-word',fontWeight:500,color:'#111827'})}>
                      {row.product}
                    </td>
                    <td style={td('left',{
                      width:expandedCols.has('itemDesc')?200:28, minWidth:expandedCols.has('itemDesc')?200:28,
                      maxWidth:expandedCols.has('itemDesc')?220:28, overflow:'hidden',
                      padding:expandedCols.has('itemDesc')?'4px 8px':'2px 1px',
                      fontSize:10.5, color:'#555', wordBreak:'break-word', transition:'width .2s',
                    })}>
                      {expandedCols.has('itemDesc') ? (row.itemDesc || <span style={{color:'#9ca3af',fontStyle:'italic'}}>—</span>) : ''}
                    </td>
                    <td style={td('right',{fontWeight:600,color:'#374151'})}>{row.qty||'—'}</td>
                    <td style={td('right',{color:'#374151'})}>{row.rate>0?fmt(row.rate):'—'}</td>
                    <td style={td('right',{fontWeight:600,color:row.taxable>0?P:'#9CA3AF'})}>
                      {row.taxable>0?fmt(row.taxable):'—'}
                    </td>
                    <td style={td('right',{color:'#555',fontSize:10})}>
                      {row.gstPct>0?`${row.gstPct}% = ₹${fmt(row.gstAmt)}`:'—'}
                    </td>

                    {/* Order-level — rowspan first item */}
                    {row.isFirst && (
                      <td rowSpan={row.rowCount} style={{ ...td('right',{fontWeight:600,color:'#7c3800',
                        background:bg,borderBottom:row.isLast?undefined:'2px solid #c8d4e8'}),
                        verticalAlign:'middle' }}>
                        {row.otherCharges > 0 ? (
                          <div>
                            <div style={{ fontWeight:700 }}>₹{fmt(row.otherCharges)}</div>
                            <div style={{ fontSize:9,color:'#a05000',marginTop:2,textAlign:'right',lineHeight:1.4 }}>
                              {row.otherChargesLabel}
                            </div>
                          </div>
                        ) : '—'}
                      </td>
                    )}
                    {row.isFirst && (
                      <td rowSpan={row.rowCount} style={{ ...td('right',{fontWeight:800,color:P,fontSize:12,
                        background:bg,borderBottom:row.isLast?undefined:'2px solid #c8d4e8'}),
                        verticalAlign:'middle' }}>
                        {row.orderValue>0?`₹${fmt(row.orderValue)}`:'—'}
                      </td>
                    )}
                    {row.isFirst && (
                      <td rowSpan={row.rowCount} style={{ ...td('center',{
                        background:bg,borderBottom:row.isLast?undefined:'2px solid #c8d4e8'}),
                        verticalAlign:'middle' }}>
                        <StatusBadge status={row.status}/>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>

            {/* Totals footer */}
            <tfoot style={{ position:'sticky', bottom:0, zIndex:2 }}>
              <tr style={{ background:'#dce8ff', fontWeight:700 }}>
                <td colSpan={12} style={{ padding:'6px 10px', border:'1px solid #b8c8e8', fontSize:11,
                  fontFamily:F, color:P, fontWeight:800 }}>
                  TOTALS — {totals.orders} order{totals.orders!==1?'s':''} · {allRows.length} item row{allRows.length!==1?'s':''}
                </td>
                <td style={{ padding:'6px 10px', border:'1px solid #b8c8e8', textAlign:'right', fontSize:11,
                  fontFamily:F, color:P, fontWeight:800 }}>₹{fmt(totals.taxable)}</td>
                <td style={{ padding:'6px 10px', border:'1px solid #b8c8e8', fontFamily:F }}></td>
                <td style={{ padding:'6px 10px', border:'1px solid #b8c8e8', textAlign:'right', fontSize:11,
                  fontFamily:F, color:'#7c3800', fontWeight:800 }}>₹{fmt(totals.charges)}</td>
                <td style={{ padding:'6px 10px', border:'1px solid #b8c8e8', textAlign:'right', fontSize:12,
                  fontFamily:F, color:P, fontWeight:800 }}>₹{fmt(totals.orderValue)}</td>
                <td style={{ padding:'6px 10px', border:'1px solid #b8c8e8', fontFamily:F }}></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
