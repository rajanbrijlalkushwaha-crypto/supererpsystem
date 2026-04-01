import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { printPurchaseOrder } from '../../utils/printPurchaseOrder';
import { useCompany } from '../../context/CompanyContext';

const VendorPurchaseOrder = () => {
  const [orders, setOrders]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [search, setSearch]   = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
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

  const handleDelete = async (orderId) => {
    if (!window.confirm('Delete this purchase order?')) return;
    try {
      await axios.delete(`/api/purchase-orders/${orderId}`);
      setMessage('Purchase order deleted');
      fetchOrders();
    } catch (err) { setMessage('Error: ' + err.message); }
  };

  const grandTotal = (order) =>
    (order.items || []).reduce((s, it) => {
      const amt = (parseFloat(it.quantity) || 0) * (parseFloat(it.rate) || 0);
      return s + amt + amt * (parseFloat(it.gstPercent) || 0) / 100;
    }, 0);

  const statusClass = (s) =>
    ({ draft: 'status-draft', pending: 'status-pending', approved: 'status-approved' }[s] || 'status-draft');

  const filtered = orders.filter(o => {
    const q = search.toLowerCase();
    const matchSearch =
      String(o.orderId).includes(q) ||
      (o.vendorName || '').toLowerCase().includes(q) ||
      (o.vendorId || '').toString().includes(q) ||
      (o.linkedSalesOrderId || '').toString().includes(q) ||
      (o.orderDate || '').includes(q);
    const matchStatus = statusFilter === 'all' || o.status === statusFilter;
    return matchSearch && matchStatus;
  });

  // Summary counts
  const counts = orders.reduce((acc, o) => {
    acc[o.status || 'draft'] = (acc[o.status || 'draft'] || 0) + 1;
    return acc;
  }, {});

  if (loading) return <div className="loading">Loading purchase orders…</div>;

  return (
    <div className="client-list-page">
      <div className="client-list-header">
        <h2 className="form-title" style={{ margin: 0 }}>
          Vendor Purchase Orders
          <span className="count-badge">{orders.length}</span>
        </h2>
        <div className="client-list-actions">
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            style={{ padding: '4px 8px', border: '1px solid #888', borderRadius: '2px', fontFamily: 'Times New Roman, serif', fontSize: '12px', background: 'white' }}
          >
            <option value="all">All Status ({orders.length})</option>
            <option value="draft">Draft ({counts.draft || 0})</option>
            <option value="pending">Pending ({counts.pending || 0})</option>
            <option value="approved">Approved ({counts.approved || 0})</option>
          </select>
          <div className="search-box">
            <span className="search-icon">🔍</span>
            <input
              type="text"
              placeholder="Search PO, vendor, SO…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="search-input"
            />
            {search && <button className="search-clear" onClick={() => setSearch('')}>✕</button>}
          </div>
          <button className="add-button" style={{ marginTop: 0 }} onClick={() => navigate('/purchase-order/create')}>
            + New PO
          </button>
        </div>
      </div>

      {message && (
        <div className={message.includes('Error') ? 'error-message' : 'success-message'} style={{ margin: '0 0 10px' }}>
          {message}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="loading">{search ? 'No orders match.' : 'No purchase orders found.'}</div>
      ) : (
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>PO ID</th>
                <th>Vendor</th>
                <th>Linked SO</th>
                <th>Order Date</th>
                <th>Delivery Date</th>
                <th>Items</th>
                <th>Grand Total</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(order => (
                <tr key={order.orderId}>
                  <td><strong>{order.orderId}</strong></td>
                  <td>
                    <strong>{order.vendorName || '—'}</strong>
                    {order.vendorId && <div style={{ fontSize: '11px', color: '#666' }}>ID: {order.vendorId}</div>}
                  </td>
                  <td>
                    {order.linkedSalesOrderId
                      ? <span className="po-so-ref-badge">SO #{order.linkedSalesOrderId}</span>
                      : <span style={{ color: '#aaa' }}>—</span>}
                  </td>
                  <td>{order.orderDate || '—'}</td>
                  <td>{order.deliveryDate || '—'}</td>
                  <td style={{ textAlign: 'center' }}>{(order.items || []).length}</td>
                  <td><strong>₹{grandTotal(order).toFixed(2)}</strong></td>
                  <td>
                    <span className={`status-badge ${statusClass(order.status)}`}>
                      {order.status ? order.status.charAt(0).toUpperCase() + order.status.slice(1) : 'Draft'}
                    </span>
                  </td>
                  <td>
                    <div className="action-buttons">
                      <button className="edit-btn" onClick={() => navigate(`/purchase-order/edit/${order.orderId}`)}>✏️ Edit</button>
                      <button className="print-btn" onClick={() => printPurchaseOrder(order, selectedCompany)}>🖨️ Print</button>
                      <button className="delete-btn" onClick={() => handleDelete(order.orderId)}>🗑️ Del</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="table-footer">
            Showing {filtered.length} of {orders.length} purchase orders
            &nbsp;|&nbsp;
            Total Value: ₹{filtered.reduce((s, o) => s + grandTotal(o), 0).toFixed(2)}
          </div>
        </div>
      )}
    </div>
  );
};

export default VendorPurchaseOrder;
