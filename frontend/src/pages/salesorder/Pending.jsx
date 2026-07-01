import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { printSalesOrder } from '../../utils/printSalesOrder';
import { useCompany } from '../../context/CompanyContext';
import { useAuth } from '../../context/AuthContext';
import { can } from '../../utils/permissions';
import AuditTrail from '../../components/AuditTrail';

/* ── helpers ── */
const fmt   = (n) => `₹${(parseFloat(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
const fmtD  = (d) => { if (!d) return '—'; const dt = new Date(d); return isNaN(dt) ? d : dt.toLocaleDateString('en-IN'); };
const grand = (o) => {
  if (o.grandTotal) return parseFloat(o.grandTotal);
  return (o.items || []).reduce((s, it) => {
    const amt = (parseFloat(it.qty) || parseFloat(it.quantity) || 0) * (parseFloat(it.rate) || 0);
    return s + amt + amt * (parseFloat(it.gstPercent) || 0) / 100;
  }, 0);
};

/* ── Order Detail Modal ── */
export function OrderModal({ order, company, onClose, onApprove, onReject, readOnly }) {
  if (!order) return null;
  const items   = order.items && order.items.length ? order.items : [];
  const subTotal = items.reduce((s, it) => {
    return s + (parseFloat(it.qty) || parseFloat(it.quantity) || 0) * (parseFloat(it.rate) || 0);
  }, 0);
  const gstTotal = items.reduce((s, it) => {
    const amt = (parseFloat(it.qty) || parseFloat(it.quantity) || 0) * (parseFloat(it.rate) || 0);
    return s + amt * (parseFloat(it.gstPercent) || 0) / 100;
  }, 0);
  const total = parseFloat(order.grandTotal) || subTotal + gstTotal;

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
      zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '20px',
    }} onClick={onClose}>
      <div style={{
        background: '#fff', borderRadius: 10, width: '100%', maxWidth: 860,
        maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 8px 40px rgba(0,0,0,0.3)',
        display: 'flex', flexDirection: 'column',
      }} onClick={e => e.stopPropagation()}>

        {/* ── Header ── */}
        <div style={{
          background: 'linear-gradient(135deg,#104f4f,#2563eb)', color: '#fff',
          padding: '16px 24px', borderRadius: '10px 10px 0 0',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          flexShrink: 0,
        }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>Sales Order — {order.orderNo || order.voucherNumber || order.orderId}</div>
            <div style={{ fontSize: 13, opacity: 0.85, marginTop: 2 }}>
              {order.customerName || order.clientName || order.party || '—'}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{
              background: order.status === 'approved' ? '#16a34a' : '#f59e0b',
              color: '#fff', padding: '3px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600,
            }}>{(order.status || 'draft').toUpperCase()}</span>
            <button onClick={onClose} style={{
              background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff',
              borderRadius: '50%', width: 30, height: 30, fontSize: 16, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>✕</button>
          </div>
        </div>

        {/* ── Body ── */}
        <div style={{ padding: '20px 24px', flex: 1 }}>

          {/* Info Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 30px', marginBottom: 20 }}>
            {[
              ['Order No',       order.orderNo || order.voucherNumber || '—'],
              ['Order Date',     fmtD(order.orderDate || order.date)],
              ['Delivery Date',  fmtD(order.deliveryDate)],
              ['PO Number',      order.customerPO || order.reference || '—'],
              ['PO Date',        fmtD(order.poDate)],
              ['Payment Terms',  order.paymentTerms || '—'],
              ['Order Type',     order.orderType || '—'],
              ['Sales Person',   order.salesPerson || '—'],
              ['Customer GSTIN', order.customerGstin || order.partyGstin || '—'],
              ['State',          order.customerState || order.stateName || '—'],
              ['Delivery Addr',  order.deliveryAddr || order.destination || '—'],
              ['Incoterms',      order.incoterms || '—'],
            ].map(([label, val]) => (
              <div key={label} style={{ display: 'flex', gap: 6, fontSize: 13 }}>
                <span style={{ color: '#64748b', minWidth: 110, flexShrink: 0 }}>{label}:</span>
                <span style={{ fontWeight: 500, color: '#1e293b' }}>{val}</span>
              </div>
            ))}
          </div>

          {/* Items Table */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8, color: '#104f4f' }}>Line Items</div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#f1f5f9' }}>
                    {['#', 'Material / Description', 'Qty', 'Unit', 'Rate', 'Amount', 'GST%', 'Total'].map(h => (
                      <th key={h} style={{ padding: '7px 10px', textAlign: h === '#' ? 'center' : 'left', border: '1px solid #e2e8f0', fontWeight: 600, color: '#475569' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {items.length === 0 ? (
                    <tr><td colSpan={8} style={{ textAlign: 'center', padding: 12, color: '#94a3b8', border: '1px solid #e2e8f0' }}>No items</td></tr>
                  ) : items.map((it, i) => {
                    const qty  = parseFloat(it.qty) || parseFloat(it.quantity) || 0;
                    const rate = parseFloat(it.rate) || 0;
                    const amt  = qty * rate;
                    const gst  = parseFloat(it.gstPercent) || 0;
                    const ttl  = amt + amt * gst / 100;
                    return (
                      <tr key={i} style={{ background: i % 2 ? '#f8fafc' : '#fff' }}>
                        <td style={{ padding: '6px 10px', textAlign: 'center', border: '1px solid #e2e8f0' }}>{i + 1}</td>
                        <td style={{ padding: '6px 10px', border: '1px solid #e2e8f0' }}>
                          <div style={{ fontWeight: 500 }}>{it.material || it.itemName || '—'}</div>
                          {it.description && <div style={{ color: '#64748b', fontSize: 12 }}>{it.description}</div>}
                        </td>
                        <td style={{ padding: '6px 10px', border: '1px solid #e2e8f0' }}>{qty}</td>
                        <td style={{ padding: '6px 10px', border: '1px solid #e2e8f0' }}>{it.unit || '—'}</td>
                        <td style={{ padding: '6px 10px', border: '1px solid #e2e8f0' }}>{fmt(rate)}</td>
                        <td style={{ padding: '6px 10px', border: '1px solid #e2e8f0' }}>{fmt(amt)}</td>
                        <td style={{ padding: '6px 10px', border: '1px solid #e2e8f0' }}>{gst}%</td>
                        <td style={{ padding: '6px 10px', border: '1px solid #e2e8f0', fontWeight: 600 }}>{fmt(ttl)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Totals */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 20 }}>
            <div style={{ minWidth: 280, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '12px 16px' }}>
              {[
                ['Sub Total',   fmt(subTotal)],
                ['GST Total',   fmt(gstTotal)],
              ].map(([l, v]) => (
                <div key={l} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6, color: '#475569' }}>
                  <span>{l}</span><span>{v}</span>
                </div>
              ))}
              <div style={{ borderTop: '2px solid #cbd5e1', marginTop: 8, paddingTop: 8, display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 15, color: '#104f4f' }}>
                <span>Grand Total</span><span>{fmt(total)}</span>
              </div>
            </div>
          </div>

          {/* Notes */}
          {(order.internalNotes || order.narration || order.customerNotes) && (
            <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13 }}>
              <div style={{ fontWeight: 600, marginBottom: 4, color: '#92400e' }}>Notes</div>
              <div style={{ color: '#78350f' }}>{order.internalNotes || order.narration || order.customerNotes}</div>
            </div>
          )}

          {/* Terms */}
          {order.termsConditions && (
            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '10px 14px', fontSize: 13 }}>
              <div style={{ fontWeight: 600, marginBottom: 4, color: '#104f4f' }}>Terms & Conditions</div>
              <div style={{ color: '#15803d', whiteSpace: 'pre-wrap' }}>{order.termsConditions}</div>
            </div>
          )}

          {/* Audit Trail */}
          <div style={{ marginTop: 16 }}>
            <AuditTrail audit={order.audit} title="Activity Log" />
          </div>
        </div>

        {/* ── Footer ── */}
        <div style={{
          padding: '14px 24px', borderTop: '1px solid #e2e8f0',
          display: 'flex', justifyContent: 'flex-end', gap: 10,
          background: '#f8fafc', borderRadius: '0 0 10px 10px', flexShrink: 0,
        }}>
          <button onClick={() => printSalesOrder(order, company)} style={{
            padding: '8px 18px', borderRadius: 6, border: '1px solid #cbd5e1',
            background: '#fff', cursor: 'pointer', fontSize: 14,
          }}>🖨️ Print</button>
          <button onClick={onClose} style={{
            padding: '8px 18px', borderRadius: 6, border: '1px solid #cbd5e1',
            background: '#fff', cursor: 'pointer', fontSize: 14,
          }}>Close</button>
          {!readOnly && (
            <>
              <button onClick={() => onReject(order.orderId)} style={{
                padding: '8px 22px', borderRadius: 6, border: 'none',
                background: '#ef4444', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 14,
              }}>✕ Reject</button>
              <button onClick={() => onApprove(order.orderId)} style={{
                padding: '8px 22px', borderRadius: 6, border: 'none',
                background: '#16a34a', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 14,
              }}>✓ Approve</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Main Component ── */
const PendingSalesOrders = () => {
  const { user } = useAuth();
  const [orders,    setOrders]    = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [message,   setMessage]   = useState('');
  const [search,    setSearch]    = useState('');
  const [selected,  setSelected]  = useState(null);
  const navigate = useNavigate();
  const { selectedCompany } = useCompany();

  useEffect(() => { fetchOrders(); }, [selectedCompany]); // eslint-disable-line

  const fetchOrders = async () => {
    if (!selectedCompany?.companyId) { setLoading(false); return; }
    try {
      setLoading(true);
      const res = await axios.get('/api/sales-orders');
      setOrders(res.data.filter(o => o.status === 'pending'));
    } catch (err) { setMessage('Error: ' + err.message); }
    finally { setLoading(false); }
  };

  const doApprove = async (orderId) => {
    try {
      const res = await axios.get(`/api/sales-orders/${orderId}`);
      const o   = res.data;
      const fd  = new FormData();
      Object.entries(o).forEach(([k, v]) => {
        if (['items','attachments','documents','customFields'].includes(k)) return;
        if (v !== null && v !== undefined) fd.append(k, v);
      });
      fd.set('status', 'approved');
      fd.append('items',       JSON.stringify(o.items || []));
      fd.append('attachments', JSON.stringify(o.attachments || o.documents || []));
      await axios.put(`/api/sales-orders/${orderId}`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setMessage(`Order ${orderId} approved ✓`);
      setSelected(null);
      fetchOrders();
    } catch (err) { setMessage('Error: ' + err.message); }
  };

  const doReject = async (orderId) => {
    if (!window.confirm('Reject and move back to draft?')) return;
    try {
      const res = await axios.get(`/api/sales-orders/${orderId}`);
      const o   = res.data;
      const fd  = new FormData();
      Object.entries(o).forEach(([k, v]) => {
        if (['items','attachments','documents','customFields'].includes(k)) return;
        if (v !== null && v !== undefined) fd.append(k, v);
      });
      fd.set('status', 'draft');
      fd.append('items',       JSON.stringify(o.items || []));
      fd.append('attachments', JSON.stringify(o.attachments || o.documents || []));
      await axios.put(`/api/sales-orders/${orderId}`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
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

  if (loading) return <div className="loading">Loading pending orders…</div>;

  return (
    <div className="client-list-page">
      {selected && (
        <OrderModal
          order={selected}
          company={selectedCompany}
          onClose={() => setSelected(null)}
          onApprove={can(user,'salesOrder','approve') ? doApprove : null}
          onReject={can(user,'salesOrder','approve') ? doReject : null}
          readOnly={!can(user,'salesOrder','approve')}
        />
      )}

      <div className="client-list-header">
        <h2 className="form-title" style={{ margin: 0 }}>
          Pending Approval <span className="count-badge">{orders.length}</span>
        </h2>
        <div className="client-list-actions">
          <div className="search-box">
            <span className="search-icon">🔍</span>
            <input type="text" placeholder="Search orders…" value={search}
              onChange={e => setSearch(e.target.value)} className="search-input" />
            {search && <button className="search-clear" onClick={() => setSearch('')}>✕</button>}
          </div>
        </div>
      </div>

      {message && (
        <div className={message.includes('Error') ? 'error-message' : 'success-message'}
          style={{ margin: '0 0 12px' }}>{message}</div>
      )}

      {filtered.length === 0 ? (
        <div className="loading">{search ? 'No orders match.' : 'No pending orders.'}</div>
      ) : (
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Order ID</th>
                <th>Order No</th>
                <th>Client</th>
                <th>Order Date</th>
                <th>Delivery Date</th>
                <th>Items</th>
                <th>Grand Total</th>
                <th>Submitted</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(order => (
                <tr key={order.orderId} style={{ cursor: 'pointer' }}
                  onClick={() => setSelected(order)}>
                  <td><strong>{order.orderId}</strong></td>
                  <td>{order.orderNo || order.voucherNumber || '—'}</td>
                  <td>{order.customerName || order.clientName || order.party || '—'}</td>
                  <td>{fmtD(order.orderDate || order.date)}</td>
                  <td>{fmtD(order.deliveryDate)}</td>
                  <td style={{ textAlign: 'center' }}>{(order.items || []).length}</td>
                  <td><strong>{fmt(grand(order))}</strong></td>
                  <td>{fmtD(order.updatedAt)}</td>
                  <td onClick={e => e.stopPropagation()}>
                    <div className="action-buttons">
                      <button className="view-btn"   onClick={() => setSelected(order)}>👁️ View</button>
                      {can(user,'salesOrder','approve') && <button className="approve-btn" onClick={() => doApprove(order.orderId)}>✓ Approve</button>}
                      <button className="edit-btn"    onClick={() => navigate(`/sales-order/edit/${order.orderId}`)}>✏️ Edit</button>
                      <button className="print-btn"   onClick={() => printSalesOrder(order)}>🖨️ Print</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="table-footer">Showing {filtered.length} of {orders.length} pending orders</div>
        </div>
      )}
    </div>
  );
};

export default PendingSalesOrders;
