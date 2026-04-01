import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { printPurchaseOrder } from '../../utils/printPurchaseOrder';
import { useCompany } from '../../context/CompanyContext';
import AttachmentPreviewModal from '../../components/AttachmentPreviewModal';

const ACC  = '#0070F2';
const SHELL = '#354A5E';

/* ── Full-detail popup ── */
const POViewModal = ({ order, onClose, onEdit, onPrint, onDelete, selectedCompany }) => {
  const [previewAtt, setPreviewAtt] = useState(null);
  const items = order.items || [];
  const allDocs = order.attachments || order.documents || [];
  const attUrl = (a) => `/api/purchase-orders/${order.orderId}/download/${encodeURIComponent(a.fileName)}?companyId=${order.companyId || ''}`;

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

  const gt  = getGrandTotal();
  const fmt = n => '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });
  const fmtDate = d => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
  const rawDate = order.poDate || order.orderDate || order.date;

  const section = (title, children) => (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#fff', background: SHELL, padding: '4px 12px', borderRadius: 4, marginBottom: 8, letterSpacing: 1 }}>{title}</div>
      {children}
    </div>
  );

  const row = (label, value) => (
    <div style={{ display: 'flex', gap: 8, marginBottom: 4, fontSize: 13 }}>
      <span style={{ color: '#6A6D70', minWidth: 150 }}>{label}</span>
      <span style={{ fontWeight: 600, color: '#1D2D3E' }}>{value || '—'}</span>
    </div>
  );

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 10, width: '100%', maxWidth: 860, maxHeight: '92vh', display: 'flex', flexDirection: 'column', boxShadow: '0 8px 40px rgba(0,0,0,0.28)' }}>

        {/* Header */}
        <div style={{ background: SHELL, color: '#fff', padding: '14px 20px', borderRadius: '10px 10px 0 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700 }}>Purchase Order — {order.poNo || order.orderId}</div>
            <div style={{ fontSize: 12, opacity: 0.75, marginTop: 2 }}>{order.vendorName || 'No Vendor'} · {fmtDate(rawDate)}</div>
          </div>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 6, color: '#fff', width: 32, height: 32, cursor: 'pointer', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
        </div>

        {/* Grand total banner */}
        <div style={{ background: '#F0F4FF', borderBottom: '1px solid #DDE3EC', padding: '10px 20px', display: 'flex', gap: 24, alignItems: 'center' }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: ACC }}>{fmt(gt)}</div>
          <div style={{ fontSize: 12, color: '#6A6D70' }}>{items.length} item{items.length !== 1 ? 's' : ''}</div>
          {allDocs.length > 0 && <div style={{ fontSize: 12, color: '#6A6D70' }}>📎 {allDocs.length} attachment{allDocs.length !== 1 ? 's' : ''}</div>}
          <span style={{ marginLeft: 'auto', padding: '3px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600, background: order.status === 'approved' ? '#E8F5E9' : order.status === 'pending' ? '#FFF3E0' : '#E8F3FF', color: order.status === 'approved' ? '#2E7D32' : order.status === 'pending' ? '#E65100' : ACC }}>
            {(order.status || 'draft').toUpperCase()}
          </span>
        </div>

        {/* Scrollable body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 18 }}>
            <div>
              {section('Order Details',
                <>
                  {row('PO Number', order.poNo || order.orderId)}
                  {row('PO Type', order.poType || 'Standard')}
                  {row('PO Date', fmtDate(rawDate))}
                  {row('Linked SO', order.linkedSalesOrderId ? `SO #${order.linkedSalesOrderId}` : null)}
                  {row('Purchase Person', order.purchasePerson)}
                  {row('Enquiry Ref', order.enquiryRef)}
                </>
              )}
            </div>
            <div>
              {section('Vendor Information',
                <>
                  {row('Vendor Name', order.vendorName)}
                  {row('Vendor Code', order.vendorCode)}
                  {row('GSTIN', order.vendorGstin)}
                  {row('State', order.vendorState)}
                  {row('Contact', order.contactPerson)}
                  {row('Mobile', order.mobile)}
                </>
              )}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 18 }}>
            <div>
              {section('Delivery',
                <>
                  {row('Delivery Date', fmtDate(order.deliveryDate))}
                  {row('Delivery Address', order.deliveryAddr || order.deliveryAddress)}
                  {row('Dispatch Mode', order.dispatchMode)}
                  {row('Incoterms', order.incoterms)}
                </>
              )}
            </div>
            <div>
              {section('Payment',
                <>
                  {row('Payment Terms', order.paymentTerms)}
                  {row('Advance %', order.advancePercent ? order.advancePercent + '%' : null)}
                  {row('Vendor Ref', order.vendorRef)}
                  {row('Quotation Ref', order.quotationRef)}
                </>
              )}
            </div>
          </div>

          {/* Items table */}
          {section('Items',
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: '#F5F6F7' }}>
                    {['#', 'Item', 'HSN', 'Qty', 'Unit', 'Rate', 'Disc', 'GST%', 'Amount'].map(h => (
                      <th key={h} style={{ padding: '6px 8px', textAlign: h === '#' ? 'center' : 'left', border: '1px solid #DDE3EC', fontWeight: 600, color: '#1D2D3E', fontSize: 11 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, i) => {
                    const qty  = parseFloat(it.qty || it.quantity) || 0;
                    const rate = parseFloat(it.rate) || 0;
                    const base = qty * rate;
                    const disc = it.discountType === '%' ? base * (parseFloat(it.discount) || 0) / 100 : (parseFloat(it.discount) || 0);
                    const taxable = base - disc;
                    const gst = taxable * (parseFloat(it.gstPercent) || 0) / 100;
                    const amt = taxable + gst;
                    return (
                      <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#FAFBFC' }}>
                        <td style={{ padding: '5px 8px', textAlign: 'center', border: '1px solid #EEE' }}>{i + 1}</td>
                        <td style={{ padding: '5px 8px', border: '1px solid #EEE' }}>
                          <div style={{ fontWeight: 600 }}>{it.itemName || it.description || '—'}</div>
                          {it.description && it.itemName && it.description !== it.itemName && <div style={{ fontSize: 10, color: '#888' }}>{it.description}</div>}
                        </td>
                        <td style={{ padding: '5px 8px', border: '1px solid #EEE', fontSize: 11 }}>{it.hsnCode || '—'}</td>
                        <td style={{ padding: '5px 8px', border: '1px solid #EEE', textAlign: 'right' }}>{qty}</td>
                        <td style={{ padding: '5px 8px', border: '1px solid #EEE' }}>{it.unit || 'NOS'}</td>
                        <td style={{ padding: '5px 8px', border: '1px solid #EEE', textAlign: 'right' }}>{fmt(rate)}</td>
                        <td style={{ padding: '5px 8px', border: '1px solid #EEE', textAlign: 'right' }}>{it.discount ? it.discount + (it.discountType || '%') : '—'}</td>
                        <td style={{ padding: '5px 8px', border: '1px solid #EEE', textAlign: 'right' }}>{it.gstPercent || 0}%</td>
                        <td style={{ padding: '5px 8px', border: '1px solid #EEE', textAlign: 'right', fontWeight: 600 }}>{fmt(amt)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: ACC }}>Grand Total: {fmt(gt)}</div>
              </div>
            </div>
          )}

          {(order.notes || order.termsConditions) && section('Notes & Terms',
            <>
              {order.notes && <div style={{ fontSize: 13, marginBottom: 6 }}><b>Notes:</b> {order.notes}</div>}
              {order.termsConditions && <div style={{ fontSize: 13 }}><b>Terms:</b> {order.termsConditions}</div>}
            </>
          )}

          {allDocs.length > 0 && section('Attachments',
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {allDocs.map((a, i) => {
                const isImg = /\.(jpg|jpeg|png|gif|bmp|webp)$/i.test(a.fileName || '');
                const isPdf = /\.pdf$/i.test(a.fileName || '');
                const icon  = isImg ? '🖼️' : isPdf ? '📄' : '📎';
                return (
                  <div key={i}
                    onClick={() => a.fileName && setPreviewAtt(a)}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: '#F0F9FF', border: `1px solid ${ACC}30`, borderRadius: 6, cursor: a.fileName ? 'pointer' : 'default', transition: 'background 0.15s' }}
                    onMouseEnter={e => { if (a.fileName) e.currentTarget.style.background = '#DBEEFF'; }}
                    onMouseLeave={e => e.currentTarget.style.background = '#F0F9FF'}
                  >
                    <span style={{ fontSize: 20 }}>{icon}</span>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#1D2D3E' }}>{a.name || a.fileName || `File ${i + 1}`}</div>
                      {a.fileName && <div style={{ fontSize: 10, color: ACC }}>Click to preview</div>}
                    </div>
                  </div>
                );
              })}
            </div>
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
        <div style={{ padding: '12px 20px', borderTop: '1px solid #DDE3EC', display: 'flex', gap: 10, justifyContent: 'flex-end', background: '#FAFBFC', borderRadius: '0 0 10px 10px' }}>
          <button onClick={onClose} style={{ padding: '8px 18px', border: '1px solid #DDE3EC', borderRadius: 6, background: '#fff', cursor: 'pointer', fontSize: 13 }}>✕ Close</button>
          <button onClick={onPrint} style={{ padding: '8px 18px', border: `1px solid ${ACC}`, borderRadius: 6, background: '#E8F3FF', color: ACC, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>🖨️ Print</button>
          <button onClick={onEdit} style={{ padding: '8px 18px', border: 'none', borderRadius: 6, background: ACC, color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>✏️ Edit</button>
        </div>
      </div>
    </div>
  );
};

/* ── Main view page ── */
const ViewPurchaseOrders = () => {
  const [orders, setOrders]           = useState([]);
  const [loading, setLoading]         = useState(true);
  const [message, setMessage]         = useState('');
  const [search, setSearch]           = useState('');
  const [selectedOrder, setSelectedOrder] = useState(null);
  const navigate = useNavigate();
  const { selectedCompany } = useCompany();

  useEffect(() => { fetchOrders(); }, []);

  const fetchOrders = async () => {
    try {
      setLoading(true);
      const res = await axios.get('/api/purchase-orders');
      setOrders(res.data);
    } catch (err) { setMessage('Error: ' + err.message); }
    finally { setLoading(false); }
  };

  const handleDelete = async (orderId, e) => {
    e.stopPropagation();
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

  const fmt = n => '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const filtered = orders.filter(o => {
    const q = search.toLowerCase();
    return String(o.orderId).includes(q) ||
      (o.poNo||'').toLowerCase().includes(q) ||
      (o.vendorName||'').toLowerCase().includes(q) ||
      (o.linkedSalesOrderId||'').toString().includes(q) ||
      (o.poDate||o.orderDate||'').includes(q);
  });

  const statusClass = (s) => ({ draft: 'status-draft', pending: 'status-pending', approved: 'status-approved' }[s] || '');

  if (loading) return <div className="loading">Loading purchase orders…</div>;

  return (
    <div className="client-list-page">
      {selectedOrder && (
        <POViewModal
          order={selectedOrder}
          selectedCompany={selectedCompany}
          onClose={() => setSelectedOrder(null)}
          onEdit={() => { setSelectedOrder(null); navigate(`/purchase-order/edit/${selectedOrder.orderId}`); }}
          onPrint={() => printPurchaseOrder(selectedOrder, selectedCompany)}
        />
      )}

      <div className="client-list-header">
        <h2 className="form-title" style={{ margin: 0 }}>All Purchase Orders</h2>
        <div className="client-list-actions">
          <div className="search-box">
            <span className="search-icon">🔍</span>
            <input type="text" placeholder="Search by ID, vendor, SO…" value={search} onChange={e => setSearch(e.target.value)} className="search-input" />
            {search && <button className="search-clear" onClick={() => setSearch('')}>✕</button>}
          </div>
        </div>
      </div>

      {message && <div className={message.includes('Error') ? 'error-message' : 'success-message'} style={{ margin: '0 0 12px' }}>{message}</div>}

      {filtered.length === 0 ? (
        <div className="loading">{search ? 'No orders match.' : 'No purchase orders yet.'}</div>
      ) : (
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>PO No.</th>
                <th>PO Type</th>
                <th>Vendor</th>
                <th>Linked SO</th>
                <th>PO Date</th>
                <th>Delivery Date</th>
                <th>Items</th>
                <th>Grand Total</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(order => (
                <tr key={order.orderId}
                  onClick={() => setSelectedOrder(order)}
                  style={{ cursor: 'pointer' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#F0F4FF'}
                  onMouseLeave={e => e.currentTarget.style.background = ''}>
                  <td>
                    <strong style={{ color: ACC }}>{order.poNo || order.orderId}</strong>
                    {order.poNo && order.poNo !== String(order.orderId) && (
                      <div style={{ fontSize: 10, color: '#6A6D70' }}>ID: {order.orderId}</div>
                    )}
                  </td>
                  <td>
                    <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 4, background: '#E8F3FF', color: ACC, fontWeight: 600 }}>
                      {order.poType || 'Standard'}
                    </span>
                  </td>
                  <td>
                    <div style={{ fontWeight: 600 }}>{order.vendorName || '—'}</div>
                    {order.vendorCode && <div style={{ fontSize: 10, color: '#6A6D70' }}>{order.vendorCode}</div>}
                  </td>
                  <td>
                    {order.linkedSalesOrderId
                      ? <span className="po-so-ref-badge">SO #{order.linkedSalesOrderId}</span>
                      : <span style={{ color: '#aaa' }}>—</span>}
                  </td>
                  <td>{order.poDate || order.orderDate || '—'}</td>
                  <td>{order.deliveryDate || '—'}</td>
                  <td style={{ textAlign: 'center' }}>{(order.items || []).length}</td>
                  <td><strong style={{ color: ACC }}>{fmt(grandTotal(order))}</strong></td>
                  <td><span className={`status-badge ${statusClass(order.status)}`}>{order.status ? order.status.charAt(0).toUpperCase() + order.status.slice(1) : 'Draft'}</span></td>
                  <td onClick={e => e.stopPropagation()}>
                    <div className="action-buttons">
                      <button className="edit-btn" onClick={() => navigate(`/purchase-order/edit/${order.orderId}`)}>✏️ Edit</button>
                      <button className="print-btn" onClick={() => printPurchaseOrder(order, selectedCompany)}>🖨️ Print</button>
                      <button className="delete-btn" onClick={(e) => handleDelete(order.orderId, e)}>🗑️ Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="table-footer">Showing {filtered.length} of {orders.length} purchase orders</div>
        </div>
      )}
    </div>
  );
};

export default ViewPurchaseOrders;
