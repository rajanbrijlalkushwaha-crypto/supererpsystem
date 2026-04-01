import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { printSalesOrder } from '../../utils/printSalesOrder';
import { useCompany } from '../../context/CompanyContext';
import { OrderModal } from './Pending';

const ViewSalesOrders = () => {
  const [orders,   setOrders]   = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [message,  setMessage]  = useState('');
  const [search,   setSearch]   = useState('');
  const [selected, setSelected] = useState(null);
  const navigate = useNavigate();
  const { selectedCompany } = useCompany();

  useEffect(() => { fetchOrders(); }, [selectedCompany]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchOrders = async () => {
    if (!selectedCompany?.companyId) { setLoading(false); return; }
    try {
      setLoading(true);
      const res = await axios.get('/api/sales-orders');
      setOrders(res.data);
    } catch (err) {
      setMessage('Error fetching orders: ' + err.message);
    } finally { setLoading(false); }
  };

  const handleDelete = async (orderId) => {
    if (!window.confirm('Delete this sales order?')) return;
    try {
      await axios.delete(`/api/sales-orders/${orderId}`);
      setMessage('Order deleted');
      fetchOrders();
    } catch (err) { setMessage('Error: ' + err.message); }
  };

  const fmtDate = (d) => {
    if (!d) return '—';
    const dt = new Date(d);
    if (isNaN(dt)) return d;
    return `${String(dt.getDate()).padStart(2,'0')}-${String(dt.getMonth()+1).padStart(2,'0')}-${dt.getFullYear()}`;
  };

  const statusClass = (s) => ({ draft: 'status-draft', pending: 'status-pending', approved: 'status-approved' }[s] || '');

  // Flatten orders → one row per item for display
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
      const rate   = parseFloat(item.rate)     || 0;
      const amount = parseFloat(item.amount)   || (qty * rate);
      const gstPct = parseFloat(item.gstPercent) || 0;
      const gstAmt = amount * gstPct / 100;
      const total  = amount + gstAmt;

      allRows.push({
        srNo,
        orderId,
        internalId: order.orderId,
        orderRef,
        partyName,
        orderDate,
        status: order.status,
        order,
        isFirstItem: idx === 0,
        itemCount: items.length,
        // item fields
        dueDate:     item.dueDate     || '—',
        itemName:    item.itemName    || item.description || '—',
        description: item.description || '—',
        qty,
        unit:        item.unit        || '—',
        rate,
        amount,
        gstPct,
        gstAmt,
        total,
      });
    });
  });

  // Filter rows by search
  const q = search.toLowerCase();
  const filtered = q
    ? allRows.filter(r =>
        String(r.orderId).toLowerCase().includes(q) ||
        String(r.internalId).toLowerCase().includes(q) ||
        r.orderRef.toLowerCase().includes(q) ||
        r.partyName.toLowerCase().includes(q) ||
        r.itemName.toLowerCase().includes(q) ||
        r.description.toLowerCase().includes(q) ||
        fmtDate(r.orderDate).includes(q)
      )
    : allRows;

  const totalOrders = orders.length;
  const totalItems  = allRows.length;

  if (loading) return <div className="loading">Loading sales orders…</div>;

  return (
    <div className="client-list-page">
      {selected && <OrderModal order={selected} onClose={() => setSelected(null)} readOnly />}
      {/* Header */}
      <div className="client-list-header">
        <h2 className="form-title" style={{ margin: 0 }}>
          All Sales Orders
          <span className="count-badge" style={{ marginLeft: 8, fontSize: '13px', fontWeight: 'normal', color: '#666' }}>
            {totalOrders} orders · {totalItems} items
          </span>
        </h2>
        <div className="client-list-actions">
          <button
            className="add-btn"
            onClick={() => navigate('/sales-order/create')}
            style={{ whiteSpace: 'nowrap' }}
          >
            + New Sales Order
          </button>
          <div className="search-box">
            <span className="search-icon">🔍</span>
            <input
              type="text"
              placeholder="Search by ID, ref, party, item…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="search-input"
            />
            {search && <button className="search-clear" onClick={() => setSearch('')}>✕</button>}
          </div>
        </div>
      </div>

      {message && (
        <div className={message.includes('Error') ? 'error-message' : 'success-message'} style={{ margin: '0 0 12px' }}>
          {message}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="loading">{search ? 'No orders match your search.' : 'No sales orders yet. Create one to get started.'}</div>
      ) : (
        <div className="table-container" style={{ overflowX: 'auto' }}>
          <table style={{ minWidth: '1400px', fontSize: '13px' }}>
            <thead>
              <tr>
                <th style={{ width: '45px', textAlign: 'center' }}>Sr No.</th>
                <th>Order ID</th>
                <th>Quotation Ref</th>
                <th>Party Name</th>
                <th>Date</th>
                <th>Due Date</th>
                <th>Item Name</th>
                <th style={{ minWidth: '220px' }}>Description</th>
                <th style={{ textAlign: 'center' }}>Qty</th>
                <th style={{ textAlign: 'center' }}>Unit</th>
                <th style={{ textAlign: 'right' }}>Rate</th>
                <th style={{ textAlign: 'right' }}>Amount<br /><small style={{ fontWeight: 'normal', fontSize: '10px' }}>(Qty × Rate)</small></th>
                <th style={{ textAlign: 'center' }}>GST%</th>
                <th style={{ textAlign: 'right' }}>GST Amt<br /><small style={{ fontWeight: 'normal', fontSize: '10px' }}>(Amt × GST%)</small></th>
                <th style={{ textAlign: 'right' }}>Total<br /><small style={{ fontWeight: 'normal', fontSize: '10px' }}>(Amt + GST)</small></th>
                <th style={{ textAlign: 'center' }}>Status</th>
                <th style={{ textAlign: 'center', minWidth: '180px' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row, idx) => (
                <tr
                  key={`${row.internalId}-${idx}`}
                  style={{
                    background: row.isFirstItem && idx > 0 ? '#f0f4ff' : undefined,
                    borderTop: row.isFirstItem && idx > 0 ? '2px solid #c5d0e6' : undefined,
                  }}
                >
                  <td style={{ textAlign: 'center', color: '#888' }}>{row.srNo}</td>
                  <td><strong style={{ color: '#1a3a6b' }}>{row.orderId}</strong></td>
                  <td>{row.orderRef}</td>
                  <td style={{ maxWidth: '180px', wordBreak: 'break-word' }}>{row.partyName}</td>
                  <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>{fmtDate(row.orderDate)}</td>
                  <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>{row.dueDate}</td>
                  <td style={{ fontWeight: '500' }}>{row.itemName}</td>
                  <td style={{ maxWidth: '220px', wordBreak: 'break-word', fontSize: '12px', color: '#444' }}>{row.description}</td>
                  <td style={{ textAlign: 'center' }}>{row.qty || '—'}</td>
                  <td style={{ textAlign: 'center' }}>{row.unit}</td>
                  <td style={{ textAlign: 'right' }}>{row.rate > 0 ? row.rate.toLocaleString('en-IN', { minimumFractionDigits: 2 }) : '—'}</td>
                  <td style={{ textAlign: 'right', fontWeight: '500' }}>{row.amount > 0 ? row.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 }) : '—'}</td>
                  <td style={{ textAlign: 'center' }}>{row.gstPct > 0 ? `${row.gstPct}%` : '—'}</td>
                  <td style={{ textAlign: 'right' }}>{row.gstPct > 0 ? row.gstAmt.toLocaleString('en-IN', { minimumFractionDigits: 2 }) : '—'}</td>
                  <td style={{ textAlign: 'right', fontWeight: 'bold', color: '#1a3a6b' }}>
                    {row.total > 0 ? '₹' + row.total.toLocaleString('en-IN', { minimumFractionDigits: 2 }) : '—'}
                  </td>
                  {/* Status & Actions only on first item row of each order */}
                  {row.isFirstItem ? (
                    <>
                      <td rowSpan={row.itemCount} style={{ textAlign: 'center', verticalAlign: 'middle' }}>
                        <span className={`status-badge ${statusClass(row.status)}`}>
                          {row.status ? row.status.charAt(0).toUpperCase() + row.status.slice(1) : 'Draft'}
                        </span>
                      </td>
                      <td rowSpan={row.itemCount} style={{ textAlign: 'center', verticalAlign: 'middle' }}>
                        <div className="action-buttons" style={{ flexDirection: 'column', gap: '4px' }}>
                          <button className="view-btn"  onClick={() => setSelected(row.order)}>👁️ View</button>
                          <button
                            onClick={() => navigate(`/sales-order/project/${row.internalId}`)}
                            style={{ padding:'4px 10px', background:'#354A5E', border:'none', color:'#fff', borderRadius:4, cursor:'pointer', fontSize:12, fontWeight:700, fontFamily:'inherit', whiteSpace:'nowrap' }}
                          >📊 Dashboard</button>
                          <button className="edit-btn"   onClick={() => navigate(`/sales-order/edit/${row.internalId}`)}>✏️ Edit</button>
                          <button className="print-btn"  onClick={() => printSalesOrder(row.order, selectedCompany)}>🖨️ Print</button>
                          <button className="delete-btn" onClick={() => handleDelete(row.internalId)}>🗑️ Delete</button>
                        </div>
                      </td>
                    </>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="table-footer">
            Showing {filtered.length} item rows across {new Set(filtered.map(r => r.internalId)).size} orders
          </div>
        </div>
      )}
    </div>
  );
};

export default ViewSalesOrders;
