import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useCompany } from '../../context/CompanyContext';

const F      = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const HDR    = '#133d80';
const BD     = '#E5EAF2';
const TAB_BG = '#F5F7FB';

const STATUS_STYLE = {
  approved: { background: '#D1FAE5', color: '#065F46', border: '1px solid #6EE7B7' },
  pending:  { background: '#FEF3C7', color: '#92400E', border: '1px solid #FCD34D' },
  draft:    { background: '#F1F5F9', color: '#475569', border: '1px solid #CBD5E1' },
};

const VendorPurchaseOrder = () => {
  const [orders,       setOrders]       = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [message,      setMessage]      = useState('');
  const [search,       setSearch]       = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const navigate = useNavigate();
  const { selectedCompany } = useCompany();

  useEffect(() => { fetchOrders(); }, [selectedCompany]);

  const fetchOrders = async () => {
    try {
      setLoading(true);
      const companyId = selectedCompany?.companyId || '';
      const res = await axios.get(`/api/purchase-orders?companyId=${companyId}`);
      setOrders(res.data);
    } catch (err) { setMessage('Error: ' + err.message); }
    finally { setLoading(false); }
  };

  const handleDelete = async (orderId) => {
    if (!window.confirm('Delete this purchase order? This cannot be undone.')) return;
    try {
      await axios.delete(`/api/purchase-orders/${orderId}`);
      setMessage('Purchase order deleted.');
      fetchOrders();
    } catch (err) { setMessage('Error: ' + err.message); }
  };

  const grandTotal = (order) =>
    (order.items || []).reduce((s, it) => {
      const amt = (parseFloat(it.quantity) || 0) * (parseFloat(it.rate) || 0);
      return s + amt + amt * (parseFloat(it.gstPercent) || 0) / 100;
    }, 0);

  const counts = orders.reduce((acc, o) => {
    acc[o.status || 'draft'] = (acc[o.status || 'draft'] || 0) + 1;
    return acc;
  }, {});

  const filtered = orders.filter(o => {
    const q = search.toLowerCase();
    const matchSearch =
      String(o.orderId).includes(q) ||
      (o.vendorName || '').toLowerCase().includes(q) ||
      (o.vendorId || '').toString().includes(q) ||
      (o.linkedSalesOrderId || '').toString().includes(q) ||
      (o.orderDate || '').includes(q);
    const matchStatus = statusFilter === 'all' || (o.status || 'draft') === statusFilter;
    return matchSearch && matchStatus;
  });

  const totalValue = filtered.reduce((s, o) => s + grandTotal(o), 0);

  return (
    <div style={{ fontFamily: F, display: 'flex', flexDirection: 'column', height: '100%', background: '#EBF0F5' }}>

      {/* ── Page Header ── */}
      <div style={{
        background: HDR, padding: '8px 16px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        borderBottom: `2px solid ${BD}`, flexShrink: 0,
      }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
            Purchase Orders
          </div>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.55)', marginTop: 1 }}>
            {orders.length} order{orders.length !== 1 ? 's' : ''} total
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {/* Status filter */}
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{
            height: 28, padding: '0 8px', background: 'rgba(255,255,255,0.12)',
            border: `1px solid rgba(255,255,255,0.25)`, borderRadius: 2,
            color: '#fff', fontSize: 12, fontFamily: F, outline: 'none', cursor: 'pointer',
          }}>
            <option value="all" style={{ color: '#000' }}>All ({orders.length})</option>
            <option value="draft"    style={{ color: '#000' }}>Draft ({counts.draft || 0})</option>
            <option value="pending"  style={{ color: '#000' }}>Pending ({counts.pending || 0})</option>
            <option value="approved" style={{ color: '#000' }}>Approved ({counts.approved || 0})</option>
          </select>
          {/* Search */}
          <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>🔍</span>
            <input
              type="text" value={search} placeholder="Search PO, vendor, SO…"
              onChange={e => setSearch(e.target.value)}
              style={{
                height: 28, padding: '0 28px 0 28px', background: 'rgba(255,255,255,0.12)',
                border: `1px solid rgba(255,255,255,0.25)`, borderRadius: 2,
                color: '#fff', fontSize: 12, fontFamily: F, outline: 'none', width: 200,
              }}
            />
            {search && (
              <button onClick={() => setSearch('')} style={{
                position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
                background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)',
                cursor: 'pointer', fontSize: 13, padding: 0, lineHeight: 1,
              }}>✕</button>
            )}
          </div>
          <button onClick={() => navigate('/purchase-order/create')} style={{
            height: 28, padding: '0 14px', background: '#1E6FB5', border: '1px solid #1557A0',
            color: '#fff', borderRadius: 2, cursor: 'pointer', fontSize: 12, fontFamily: F, fontWeight: 700,
          }}>+ New PO</button>
          <button onClick={fetchOrders} title="Refresh" style={{
            height: 28, width: 28, background: 'rgba(255,255,255,0.12)', border: `1px solid rgba(255,255,255,0.25)`,
            color: '#fff', borderRadius: 2, cursor: 'pointer', fontSize: 14,
          }}>↻</button>
        </div>
      </div>

      {/* ── Message ── */}
      {message && (
        <div style={{
          margin: '8px 10px 0', padding: '6px 12px', borderRadius: 2, fontSize: 12, fontFamily: F,
          background: message.includes('Error') ? '#FEE2E2' : '#D1FAE5',
          border: `1px solid ${message.includes('Error') ? '#FCA5A5' : '#6EE7B7'}`,
          color: message.includes('Error') ? '#991B1B' : '#065F46',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span>{message}</span>
          <button onClick={() => setMessage('')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}>✕</button>
        </div>
      )}

      {/* ── Content ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '10px' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#64748B', fontSize: 13, fontFamily: F }}>Loading purchase orders…</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#64748B', fontSize: 13, fontFamily: F }}>
            {search || statusFilter !== 'all' ? 'No orders match your filters.' : 'No purchase orders found. Create your first PO.'}
          </div>
        ) : (
          <div style={{ background: '#fff', border: `1px solid ${BD}`, borderRadius: 8, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, fontFamily: F }}>
              <thead>
                <tr>
                  {['PO ID','Vendor','Linked SO','Order Date','Delivery Date','Items','Grand Total','Status','Actions'].map((h, i) => (
                    <th key={h} style={{
                      padding: '7px 10px', fontSize: 11, fontWeight: 700, color: '#fff',
                      background: HDR, textAlign: h === 'Actions' || h === 'Items' ? 'center' : 'left',
                      borderRight: `1px solid rgba(255,255,255,0.12)`, fontFamily: F,
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((order, i) => {
                  const st    = order.status || 'draft';
                  const badge = STATUS_STYLE[st] || STATUS_STYLE.draft;
                  const total = grandTotal(order);
                  return (
                    <tr key={order.orderId}
                      style={{ background: i % 2 === 0 ? '#fff' : '#F8FAFC', borderBottom: `1px solid #EEF0F2` }}
                      onMouseEnter={e => e.currentTarget.style.background = '#EBF0F5'}
                      onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? '#fff' : '#F8FAFC'}
                    >
                      <td style={{ padding: '6px 10px', fontWeight: 700, color: HDR, whiteSpace: 'nowrap' }}>{order.orderId}</td>
                      <td style={{ padding: '6px 10px' }}>
                        <div style={{ fontWeight: 600, color: '#1E293B' }}>{order.vendorName || '—'}</div>
                        {order.vendorId && <div style={{ fontSize: 10, color: '#94A3B8' }}>ID: {order.vendorId}</div>}
                      </td>
                      <td style={{ padding: '6px 10px', color: '#475569' }}>
                        {order.linkedSalesOrderId
                          ? <span style={{ padding: '2px 8px', background: '#EDE9FE', border: '1px solid #C4B5FD', color: '#5B21B6', borderRadius: 10, fontSize: 11, fontWeight: 700, fontFamily: F, whiteSpace: 'nowrap' }}>SO #{order.linkedSalesOrderId}</span>
                          : <span style={{ color: '#CBD5E1' }}>—</span>}
                      </td>
                      <td style={{ padding: '6px 10px', color: '#475569', whiteSpace: 'nowrap' }}>{order.orderDate || '—'}</td>
                      <td style={{ padding: '6px 10px', color: '#475569', whiteSpace: 'nowrap' }}>{order.deliveryDate || '—'}</td>
                      <td style={{ padding: '6px 10px', textAlign: 'center', color: '#475569', fontWeight: 600 }}>{(order.items || []).length}</td>
                      <td style={{ padding: '6px 10px', fontWeight: 700, color: '#1E293B', whiteSpace: 'nowrap' }}>
                        ₹{total.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td style={{ padding: '6px 10px' }}>
                        <span style={{ ...badge, fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10, whiteSpace: 'nowrap', textTransform: 'capitalize' }}>
                          {st}
                        </span>
                      </td>
                      <td style={{ padding: '6px 10px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'inline-flex', gap: 4 }}>
                          <button onClick={() => navigate(`/purchase-order/edit/${order.orderId}`)} style={{
                            padding: '2px 10px', fontSize: 11, fontFamily: F, fontWeight: 600,
                            background: '#EBF0F5', border: `1px solid ${BD}`, color: HDR,
                            borderRadius: 2, cursor: 'pointer',
                          }}>✏ Edit</button>
                          <button onClick={() => handleDelete(order.orderId)} style={{
                            padding: '2px 10px', fontSize: 11, fontFamily: F, fontWeight: 600,
                            background: '#FEE2E2', border: '1px solid #FCA5A5', color: '#991B1B',
                            borderRadius: 2, cursor: 'pointer',
                          }}>🗑 Del</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div style={{
              padding: '6px 12px', background: TAB_BG, borderTop: `1px solid ${BD}`,
              fontSize: 11, color: '#5A6475', fontFamily: F,
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <span>Showing {filtered.length} of {orders.length} purchase orders</span>
              <span style={{ fontWeight: 700, color: HDR }}>
                Total Value: ₹{totalValue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default VendorPurchaseOrder;
