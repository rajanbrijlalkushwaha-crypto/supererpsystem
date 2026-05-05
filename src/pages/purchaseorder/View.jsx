import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { printPurchaseOrder } from '../../utils/printPurchaseOrder';
import { useCompany } from '../../context/CompanyContext';
import AttachmentPreviewModal from '../../components/AttachmentPreviewModal';

const P   = '#2F6FED';
const PD  = '#1A56D6';
const BG  = '#F5F7FB';
const BD  = '#E5EAF2';
const F   = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

/* ── Status badge ── */
const STATUS_MAP = {
  approved: { bg:'#ECFDF5', color:'#059669', dot:'#059669', label:'Approved' },
  pending:  { bg:'#FFFBEB', color:'#D97706', dot:'#D97706', label:'Pending'  },
  draft:    { bg:'#EFF6FF', color:'#2563EB', dot:'#93C5FD', label:'Draft'    },
};
const StatusBadge = ({ status }) => {
  const s = STATUS_MAP[status] || STATUS_MAP.draft;
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'3px 10px',
      borderRadius:20, fontSize:11, fontWeight:700, background:s.bg, color:s.color,
      border:`1px solid ${s.dot}50`, fontFamily:F }}>
      <span style={{ width:6, height:6, borderRadius:'50%', background:s.dot, flexShrink:0 }} />
      {s.label}
    </span>
  );
};

/* ── Full-detail popup modal ── */
const POViewModal = ({ order, onClose, onEdit, onPrint, onDelete, selectedCompany }) => {
  const [previewAtt, setPreviewAtt] = useState(null);
  const items   = order.items || [];
  const allDocs = order.attachments || order.documents || [];
  const attUrl  = (a) => `/api/purchase-orders/${order.orderId}/download/${encodeURIComponent(a.fileName)}?companyId=${order.companyId || ''}`;

  const getGrandTotal = () => {
    if (order.grandTotal) return parseFloat(order.grandTotal);
    return items.reduce((s, it) => {
      const qty  = parseFloat(it.qty || it.quantity) || 0;
      const rate = parseFloat(it.rate) || 0;
      const base = qty * rate;
      const disc = it.discountType === '%' ? base * (parseFloat(it.discount) || 0) / 100 : (parseFloat(it.discount) || 0);
      const taxable = base - disc;
      return s + taxable + taxable * (parseFloat(it.gstPercent) || 0) / 100;
    }, 0);
  };

  const gt     = getGrandTotal();
  const fmt    = n => '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits:2 });
  const fmtD   = d => d ? new Date(d).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' }) : '—';
  const rawDate = order.poDate || order.orderDate || order.date;
  const status  = order.status || 'draft';

  const Section = ({ title, children }) => (
    <div style={{ marginBottom:18 }}>
      <div style={{ fontSize:10.5, fontWeight:800, color:'#fff', background:P,
        padding:'5px 12px', borderRadius:5, marginBottom:10, letterSpacing:'0.8px',
        textTransform:'uppercase', fontFamily:F }}>
        {title}
      </div>
      <div style={{ padding:'0 4px' }}>{children}</div>
    </div>
  );

  const Row = ({ label, value }) => value ? (
    <div style={{ display:'flex', gap:8, marginBottom:6, fontSize:13, fontFamily:F }}>
      <span style={{ color:'#6B7280', minWidth:148, fontSize:12, fontWeight:500 }}>{label}</span>
      <span style={{ fontWeight:600, color:'#111827', flex:1 }}>{value}</span>
    </div>
  ) : null;

  return (
    <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)',
      zIndex:9000, display:'flex', alignItems:'center', justifyContent:'center', padding:16,
      backdropFilter:'blur(2px)' }}>
      <div onClick={e => e.stopPropagation()} style={{ background:'#fff', borderRadius:12, width:'100%',
        maxWidth:900, maxHeight:'92vh', display:'flex', flexDirection:'column',
        boxShadow:'0 20px 60px rgba(0,0,0,0.25)', fontFamily:F }}>

        {/* Header */}
        <div style={{ background:`linear-gradient(135deg,${P} 0%,${PD} 100%)`, color:'#fff',
          padding:'16px 22px', borderRadius:'12px 12px 0 0',
          display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div>
            <div style={{ fontSize:17, fontWeight:800, letterSpacing:'-0.3px' }}>
              Purchase Order — {order.poNo || order.orderId}
            </div>
            <div style={{ fontSize:12, opacity:0.7, marginTop:3 }}>
              {order.vendorName || 'No Vendor'} · {fmtD(rawDate)}
            </div>
          </div>
          <button onClick={onClose}
            style={{ background:'rgba(255,255,255,0.15)', border:'1px solid rgba(255,255,255,0.2)',
              borderRadius:8, color:'#fff', width:34, height:34, cursor:'pointer', fontSize:18,
              display:'flex', alignItems:'center', justifyContent:'center' }}>✕</button>
        </div>

        {/* Grand total banner */}
        <div style={{ background:'#F8FAFF', borderBottom:`1px solid ${BD}`, padding:'12px 22px',
          display:'flex', gap:24, alignItems:'center' }}>
          <div style={{ fontSize:24, fontWeight:800, color:P }}>{fmt(gt)}</div>
          <div style={{ width:1, height:28, background:BD }} />
          <div style={{ fontSize:12, color:'#6B7280', fontWeight:500 }}>
            {items.length} item{items.length !== 1 ? 's' : ''}
          </div>
          {allDocs.length > 0 && (
            <div style={{ fontSize:12, color:'#6B7280', fontWeight:500 }}>
              📎 {allDocs.length} attachment{allDocs.length !== 1 ? 's' : ''}
            </div>
          )}
          <div style={{ marginLeft:'auto' }}><StatusBadge status={status} /></div>
        </div>

        {/* Body */}
        <div style={{ flex:1, overflowY:'auto', padding:'20px 22px' }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20, marginBottom:18 }}>
            <div>
              <Section title="Order Details">
                <Row label="PO Number"       value={order.poNo || order.orderId} />
                <Row label="PO Type"         value={order.poType || 'Standard'} />
                <Row label="PO Date"         value={fmtD(rawDate)} />
                <Row label="Linked SO"       value={order.linkedSalesOrderId ? `SO #${order.linkedSalesOrderId}` : null} />
                <Row label="Purchase Person" value={order.purchasePerson} />
                <Row label="Enquiry Ref"     value={order.enquiryRef} />
              </Section>
            </div>
            <div>
              <Section title="Vendor Information">
                <Row label="Vendor Name"  value={order.vendorName} />
                <Row label="Vendor Code"  value={order.vendorCode} />
                <Row label="GSTIN"        value={order.vendorGstin} />
                <Row label="State"        value={order.vendorState} />
                <Row label="Contact"      value={order.contactPerson} />
                <Row label="Mobile"       value={order.mobile} />
              </Section>
            </div>
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20, marginBottom:18 }}>
            <div>
              <Section title="Delivery">
                <Row label="Delivery Date"    value={fmtD(order.deliveryDate)} />
                <Row label="Delivery Address" value={order.deliveryAddr || order.deliveryAddress} />
                <Row label="Dispatch Mode"    value={order.dispatchMode} />
                <Row label="Incoterms"        value={order.incoterms} />
              </Section>
            </div>
            <div>
              <Section title="Payment">
                <Row label="Payment Terms" value={order.paymentTerms} />
                <Row label="Advance %"     value={order.advancePercent ? order.advancePercent + '%' : null} />
                <Row label="Vendor Ref"    value={order.vendorRef} />
                <Row label="Quotation Ref" value={order.quotationRef} />
              </Section>
            </div>
          </div>

          {/* Items table */}
          <Section title="Line Items">
            <div style={{ overflowX:'auto', border:`1px solid ${BD}`, borderRadius:8 }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12, fontFamily:F }}>
                <thead>
                  <tr style={{ background:P }}>
                    {['#','Item','HSN','Qty','Unit','Rate','Disc','GST%','Amount'].map(h => (
                      <th key={h} style={{ padding:'7px 10px',
                        textAlign: ['#','Qty','Rate','Disc','GST%','Amount'].includes(h) ? 'center' : 'left',
                        border:`1px solid ${PD}`, fontWeight:700, color:'#fff', fontSize:11 }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, i) => {
                    const qty     = parseFloat(it.qty || it.quantity) || 0;
                    const rate    = parseFloat(it.rate) || 0;
                    const base    = qty * rate;
                    const disc    = it.discountType === '%' ? base * (parseFloat(it.discount) || 0) / 100 : (parseFloat(it.discount) || 0);
                    const taxable = base - disc;
                    const gst     = taxable * (parseFloat(it.gstPercent) || 0) / 100;
                    const amt     = taxable + gst;
                    return (
                      <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#FAFBFC' }}>
                        <td style={{ padding:'6px 10px', textAlign:'center', border:`1px solid ${BD}`, color:'#6B7280' }}>{i+1}</td>
                        <td style={{ padding:'6px 10px', border:`1px solid ${BD}` }}>
                          <div style={{ fontWeight:600, color:'#111827' }}>{it.itemName || it.description || '—'}</div>
                          {it.description && it.itemName && it.description !== it.itemName && (
                            <div style={{ fontSize:10, color:'#9CA3AF' }}>{it.description}</div>
                          )}
                        </td>
                        <td style={{ padding:'6px 10px', border:`1px solid ${BD}`, fontSize:11, color:'#6B7280' }}>{it.hsnCode || '—'}</td>
                        <td style={{ padding:'6px 10px', border:`1px solid ${BD}`, textAlign:'right', fontWeight:600 }}>{qty}</td>
                        <td style={{ padding:'6px 10px', border:`1px solid ${BD}`, textAlign:'center', color:'#6B7280' }}>{it.unit || 'NOS'}</td>
                        <td style={{ padding:'6px 10px', border:`1px solid ${BD}`, textAlign:'right' }}>{fmt(rate)}</td>
                        <td style={{ padding:'6px 10px', border:`1px solid ${BD}`, textAlign:'right', color:'#6B7280' }}>{it.discount ? it.discount + (it.discountType || '%') : '—'}</td>
                        <td style={{ padding:'6px 10px', border:`1px solid ${BD}`, textAlign:'center', color:'#6B7280' }}>{it.gstPercent || 0}%</td>
                        <td style={{ padding:'6px 10px', border:`1px solid ${BD}`, textAlign:'right', fontWeight:700, color:P }}>{fmt(amt)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div style={{ display:'flex', justifyContent:'flex-end', marginTop:10 }}>
              <div style={{ background:P, color:'#fff', borderRadius:8, padding:'8px 18px',
                fontSize:15, fontWeight:800 }}>
                Grand Total: {fmt(gt)}
              </div>
            </div>
          </Section>

          {(order.notes || order.termsConditions) && (
            <Section title="Notes & Terms">
              {order.notes && <div style={{ fontSize:13, marginBottom:6, color:'#374151' }}><b>Notes:</b> {order.notes}</div>}
              {order.termsConditions && <div style={{ fontSize:13, color:'#374151' }}><b>Terms:</b> {order.termsConditions}</div>}
            </Section>
          )}

          {allDocs.length > 0 && (
            <Section title="Attachments">
              <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
                {allDocs.map((a, i) => {
                  const isImg = /\.(jpg|jpeg|png|gif|bmp|webp)$/i.test(a.fileName || '');
                  const isPdf = /\.pdf$/i.test(a.fileName || '');
                  const icon  = isImg ? '🖼️' : isPdf ? '📄' : '📎';
                  return (
                    <div key={i} onClick={() => a.fileName && setPreviewAtt(a)}
                      style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 12px',
                        background:'#F0F4FF', border:`1px solid ${P}30`, borderRadius:8,
                        cursor: a.fileName ? 'pointer' : 'default', transition:'background 0.15s' }}
                      onMouseEnter={e => { if (a.fileName) e.currentTarget.style.background='#DBEEFF'; }}
                      onMouseLeave={e => e.currentTarget.style.background='#F0F4FF'}>
                      <span style={{ fontSize:20 }}>{icon}</span>
                      <div>
                        <div style={{ fontSize:12, fontWeight:600, color:'#111827' }}>{a.name || a.fileName || `File ${i+1}`}</div>
                        {a.fileName && <div style={{ fontSize:10, color:P, fontWeight:500 }}>Click to preview</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Section>
          )}

          {previewAtt && (
            <AttachmentPreviewModal
              attachment={previewAtt}
              downloadUrl={attUrl(previewAtt)}
              onClose={() => setPreviewAtt(null)}
            />
          )}
        </div>

        {/* Footer actions */}
        <div style={{ padding:'12px 22px', borderTop:`1px solid ${BD}`, display:'flex', gap:8,
          justifyContent:'flex-end', background:'#FAFBFC', borderRadius:'0 0 12px 12px' }}>
          <button onClick={onClose}
            style={{ padding:'8px 20px', border:`1px solid ${BD}`, borderRadius:7, background:'#fff',
              cursor:'pointer', fontSize:13, fontFamily:F, fontWeight:600, color:'#374151' }}>
            ✕ Close
          </button>
          {onDelete && (
            <button onClick={onDelete}
              style={{ padding:'8px 20px', border:'1px solid #FECACA', borderRadius:7, background:'#FEF2F2',
                cursor:'pointer', fontSize:13, fontFamily:F, fontWeight:600, color:'#DC2626' }}>
              🗑️ Delete
            </button>
          )}
          <button onClick={onPrint}
            style={{ padding:'8px 20px', border:`1px solid ${P}40`, borderRadius:7, background:'#F0F4FF',
              color:P, cursor:'pointer', fontSize:13, fontFamily:F, fontWeight:700 }}>
            🖨️ Print
          </button>
          <button onClick={onEdit}
            style={{ padding:'8px 20px', border:'none', borderRadius:7, background:P, color:'#fff',
              cursor:'pointer', fontSize:13, fontFamily:F, fontWeight:700,
              boxShadow:`0 2px 6px ${P}50` }}>
            ✏️ Edit
          </button>
        </div>
      </div>
    </div>
  );
};

/* ── Main list page ── */
const ViewPurchaseOrders = () => {
  const [orders,        setOrders]        = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [message,       setMessage]       = useState('');
  const [search,        setSearch]        = useState('');
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [filter,        setFilter]        = useState('all');
  const navigate = useNavigate();
  const { selectedCompany } = useCompany();

  useEffect(() => { fetchOrders(); }, []); // eslint-disable-line

  const fetchOrders = async () => {
    try {
      setLoading(true);
      const res = await axios.get('/api/purchase-orders');
      setOrders(res.data);
    } catch (err) { setMessage('Error: ' + err.message); }
    finally { setLoading(false); }
  };

  const handleDelete = async (orderId, e) => {
    e?.stopPropagation();
    if (!window.confirm('Delete this purchase order?')) return;
    try {
      await axios.delete(`/api/purchase-orders/${orderId}`);
      setMessage('Purchase order deleted');
      if (selectedOrder?.orderId === orderId) setSelectedOrder(null);
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

  const fmt = n => '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits:2, maximumFractionDigits:2 });
  const fmtD = d => d ? new Date(d).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' }) : '—';

  const filtered = orders.filter(o => {
    const q = search.toLowerCase();
    const matchQ = !q ||
      String(o.orderId).includes(q) ||
      (o.poNo||'').toLowerCase().includes(q) ||
      (o.vendorName||'').toLowerCase().includes(q) ||
      (o.linkedSalesOrderId||'').toString().includes(q) ||
      (o.poDate||o.orderDate||'').includes(q);
    const matchF = filter === 'all' || (o.status || 'draft') === filter;
    return matchQ && matchF;
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

      {selectedOrder && (
        <POViewModal
          order={selectedOrder}
          selectedCompany={selectedCompany}
          onClose={() => setSelectedOrder(null)}
          onEdit={() => { setSelectedOrder(null); navigate(`/purchase-order/edit/${selectedOrder.orderId}`); }}
          onPrint={() => printPurchaseOrder(selectedOrder, selectedCompany)}
          onDelete={() => { handleDelete(selectedOrder.orderId); setSelectedOrder(null); }}
        />
      )}

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
      <div style={{ padding:'12px 16px', background:'#fff', borderBottom:`1px solid ${BD}`, display:'flex', gap:8, alignItems:'center' }}>
        <div style={{ position:'relative', flex:1, maxWidth:340 }}>
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
                  <th style={th}>PO No.</th>
                  <th style={th}>PO Type</th>
                  <th style={th}>Vendor</th>
                  <th style={th}>Linked SO</th>
                  <th style={{ ...th, textAlign:'center' }}>PO Date</th>
                  <th style={{ ...th, textAlign:'center' }}>Delivery</th>
                  <th style={{ ...th, textAlign:'center' }}>Items</th>
                  <th style={{ ...th, textAlign:'right' }}>Grand Total</th>
                  <th style={{ ...th, textAlign:'center' }}>Status</th>
                  <th style={{ ...th, textAlign:'center' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((order, i) => (
                  <tr key={order.orderId}
                    onClick={() => setSelectedOrder(order)}
                    style={{ cursor:'pointer', background: i % 2 === 0 ? '#fff' : '#FAFBFC',
                      transition:'background 0.12s' }}
                    onMouseEnter={e => e.currentTarget.style.background='#EEF4FF'}
                    onMouseLeave={e => e.currentTarget.style.background= i % 2 === 0 ? '#fff' : '#FAFBFC'}>

                    <td style={td}>
                      <div style={{ fontWeight:800, color:P, fontSize:12.5 }}>{order.poNo || order.orderId}</div>
                      {order.poNo && order.poNo !== String(order.orderId) && (
                        <div style={{ fontSize:10, color:'#9CA3AF' }}>ID: {order.orderId}</div>
                      )}
                    </td>
                    <td style={td}>
                      <span style={{ fontSize:11, padding:'2px 9px', borderRadius:20, background:'#EFF6FF',
                        color:'#2563EB', fontWeight:700, border:'1px solid #BFDBFE' }}>
                        {order.poType || 'Standard'}
                      </span>
                    </td>
                    <td style={td}>
                      <div style={{ fontWeight:600, color:'#111827' }}>{order.vendorName || '—'}</div>
                      {order.vendorCode && <div style={{ fontSize:10, color:'#9CA3AF' }}>{order.vendorCode}</div>}
                    </td>
                    <td style={{ ...td, textAlign:'center' }}>
                      {order.linkedSalesOrderId
                        ? <span style={{ fontSize:11, padding:'2px 9px', borderRadius:20, background:'#F0FFF4',
                            color:'#059669', fontWeight:700, border:'1px solid #A7F3D0' }}>
                            SO #{order.linkedSalesOrderId}
                          </span>
                        : <span style={{ color:'#D1D5DB' }}>—</span>}
                    </td>
                    <td style={{ ...td, textAlign:'center', color:'#4B5563', whiteSpace:'nowrap' }}>
                      {fmtD(order.poDate || order.orderDate)}
                    </td>
                    <td style={{ ...td, textAlign:'center', color:'#4B5563', whiteSpace:'nowrap' }}>
                      {fmtD(order.deliveryDate)}
                    </td>
                    <td style={{ ...td, textAlign:'center', fontWeight:700, color:'#374151' }}>
                      {(order.items || []).length}
                    </td>
                    <td style={{ ...td, textAlign:'right', fontWeight:800, color:P, fontSize:13 }}>
                      {fmt(grandTotal(order))}
                    </td>
                    <td style={{ ...td, textAlign:'center' }}>
                      <StatusBadge status={order.status} />
                    </td>
                    <td style={{ ...td, textAlign:'center' }} onClick={e => e.stopPropagation()}>
                      <div style={{ display:'flex', gap:4, justifyContent:'center' }}>
                        <button onClick={() => navigate(`/purchase-order/edit/${order.orderId}`)}
                          style={{ padding:'4px 10px', fontSize:11, cursor:'pointer', fontFamily:F, fontWeight:600,
                            background:'#F0FFF4', color:'#059669', border:'1px solid #A7F3D0', borderRadius:5 }}>
                          ✏️ Edit
                        </button>
                        <button onClick={() => printPurchaseOrder(order, selectedCompany)}
                          style={{ padding:'4px 10px', fontSize:11, cursor:'pointer', fontFamily:F, fontWeight:600,
                            background:'#FFFBEB', color:'#D97706', border:'1px solid #FDE68A', borderRadius:5 }}>
                          🖨️
                        </button>
                        <button onClick={(e) => handleDelete(order.orderId, e)}
                          style={{ padding:'4px 10px', fontSize:11, cursor:'pointer', fontFamily:F, fontWeight:600,
                            background:'#FEF2F2', color:'#DC2626', border:'1px solid #FECACA', borderRadius:5 }}>
                          🗑️
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div style={{ padding:'10px 16px', borderTop:`1px solid ${BD}`, fontSize:11, color:'#9CA3AF',
              fontFamily:F, display:'flex', justifyContent:'space-between', background:'#FAFBFC' }}>
              <span>Showing {filtered.length} of {orders.length} purchase orders</span>
              <span>Click any row to view full details</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ViewPurchaseOrders;
