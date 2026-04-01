import React, { useState, useEffect } from 'react';
import axios from 'axios';

const fmt = (n) => (parseFloat(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });

const DuesBadge = ({ due }) => {
  if (due <= 0) return <span style={{ color: '#2e7d32', fontWeight: 700 }}>✓ Cleared</span>;
  return <span style={{ color: '#b71c1c', fontWeight: 700 }}>₹{fmt(due)}</span>;
};

const OrderRow = ({ row, type }) => {
  const [expanded, setExpanded] = useState(false);
  const totalQty = (row.items || []).reduce((s, it) => s + (parseFloat(it.quantity) || 0), 0);
  const paid = type === 'client' ? row.received : row.paid;
  const paidLabel = type === 'client' ? 'Received' : 'Paid';

  return (
    <>
      <tr style={{ cursor: 'pointer', background: row.due <= 0 ? '#f9fff9' : undefined }}
        onClick={() => setExpanded(p => !p)}>
        <td>
          <span style={{ fontSize: 12, color: '#888', marginRight: 6 }}>{expanded ? '▼' : '▶'}</span>
          <strong style={{ color: '#1a3c6e', fontFamily: 'monospace' }}>
            {type === 'client' ? 'SO' : 'PO'} #{row.orderId}
          </strong>
        </td>
        <td>{row.entityName || '—'}</td>
        <td>{row.orderDate || '—'}</td>
        <td style={{ textAlign: 'right' }}>{totalQty}</td>
        <td style={{ textAlign: 'right', fontWeight: 600 }}>₹{fmt(row.orderTotal)}</td>
        <td style={{ textAlign: 'right', color: '#2e7d32', fontWeight: 600 }}>₹{fmt(paid)}</td>
        <td style={{ textAlign: 'right' }}><DuesBadge due={row.due} /></td>
        <td>
          <span className={`status-badge status-${row.status || 'draft'}`}>{row.status || 'draft'}</span>
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={8} style={{ padding: 0, background: '#f5f8ff' }}>
            <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse', margin: 0 }}>
              <thead>
                <tr style={{ background: '#dbe8ff' }}>
                  <th style={{ padding: '4px 16px', textAlign: 'left' }}>Product / Description</th>
                  <th style={{ padding: '4px 8px', textAlign: 'right' }}>Qty</th>
                  <th style={{ padding: '4px 8px', textAlign: 'right' }}>Unit</th>
                  <th style={{ padding: '4px 8px', textAlign: 'right' }}>Rate (₹)</th>
                  <th style={{ padding: '4px 8px', textAlign: 'right' }}>GST%</th>
                  <th style={{ padding: '4px 8px', textAlign: 'right' }}>Amount (₹)</th>
                </tr>
              </thead>
              <tbody>
                {(row.items || []).map((it, i) => {
                  const base = (parseFloat(it.quantity) || 0) * (parseFloat(it.rate) || 0);
                  const gst = base * (parseFloat(it.gstPercent) || 0) / 100;
                  return (
                    <tr key={i} style={{ borderBottom: '1px solid #dbe8ff' }}>
                      <td style={{ padding: '4px 16px' }}>{it.description}</td>
                      <td style={{ padding: '4px 8px', textAlign: 'right' }}>{it.quantity}</td>
                      <td style={{ padding: '4px 8px', textAlign: 'right' }}>{it.unit}</td>
                      <td style={{ padding: '4px 8px', textAlign: 'right' }}>₹{fmt(it.rate)}</td>
                      <td style={{ padding: '4px 8px', textAlign: 'right' }}>{it.gstPercent}%</td>
                      <td style={{ padding: '4px 8px', textAlign: 'right' }}>₹{fmt(base + gst)}</td>
                    </tr>
                  );
                })}
                <tr style={{ fontWeight: 700, background: '#dbe8ff' }}>
                  <td colSpan={5} style={{ padding: '5px 16px', textAlign: 'right' }}>Order Total:</td>
                  <td style={{ padding: '5px 8px', textAlign: 'right' }}>₹{fmt(row.orderTotal)}</td>
                </tr>
                <tr style={{ background: '#e8f5e9' }}>
                  <td colSpan={5} style={{ padding: '5px 16px', textAlign: 'right', color: '#2e7d32', fontWeight: 600 }}>{paidLabel}:</td>
                  <td style={{ padding: '5px 8px', textAlign: 'right', color: '#2e7d32', fontWeight: 600 }}>₹{fmt(paid)}</td>
                </tr>
                <tr style={{ background: row.due <= 0 ? '#e8f5e9' : '#fbe9e7' }}>
                  <td colSpan={5} style={{ padding: '5px 16px', textAlign: 'right', fontWeight: 700, color: row.due <= 0 ? '#2e7d32' : '#b71c1c' }}>Due:</td>
                  <td style={{ padding: '5px 8px', textAlign: 'right', fontWeight: 700, color: row.due <= 0 ? '#2e7d32' : '#b71c1c' }}>
                    {row.due <= 0 ? '✓ Cleared' : `₹${fmt(row.due)}`}
                  </td>
                </tr>
              </tbody>
            </table>
          </td>
        </tr>
      )}
    </>
  );
};

const ViewDues = () => {
  const [activeTab, setActiveTab] = useState('client');
  const [data, setData] = useState({ clientDues: [], vendorDues: [] });
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [showCleared, setShowCleared] = useState(false);

  useEffect(() => {
    fetchDues();
  }, []);

  const fetchDues = async () => {
    try {
      setLoading(true);
      const res = await axios.get('/api/accounts/dues');
      setData(res.data);
    } catch (e) {
      setMessage('Error loading dues: ' + e.message);
    } finally { setLoading(false); }
  };

  const rows = activeTab === 'client' ? data.clientDues : data.vendorDues;
  const filtered = showCleared ? rows : rows.filter(r => r.due > 0);

  const totalOrderValue = filtered.reduce((s, r) => s + r.orderTotal, 0);
  const totalPaid = filtered.reduce((s, r) => s + (activeTab === 'client' ? r.received : r.paid), 0);
  const totalDue = filtered.reduce((s, r) => s + Math.max(0, r.due), 0);

  const tabStyle = (tab) => ({
    padding: '8px 24px',
    borderRadius: '6px 6px 0 0',
    border: 'none',
    cursor: 'pointer',
    fontWeight: 700,
    fontSize: 14,
    background: activeTab === tab ? '#1a3c6e' : '#dbe8ff',
    color: activeTab === tab ? '#fff' : '#1a3c6e',
    marginRight: 4,
  });

  if (loading) return <div className="loading">Loading dues...</div>;

  return (
    <div className="client-list-page">
      <div className="client-list-header">
        <h2 className="form-title" style={{ margin: 0 }}>Outstanding Dues</h2>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            <input type="checkbox" checked={showCleared} onChange={e => setShowCleared(e.target.checked)} />
            Show cleared orders
          </label>
          <button className="btn-submit" style={{ padding: '6px 16px', fontSize: 13 }} onClick={fetchDues}>Refresh</button>
        </div>
      </div>

      {message && <div className="error-message">{message}</div>}

      {/* Summary Cards */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
        <div style={{ background: '#e3f2fd', border: '1px solid #1e88e5', borderRadius: 6, padding: '8px 20px', flex: 1, textAlign: 'center' }}>
          <div style={{ fontSize: 12, color: '#1565c0' }}>Total Order Value</div>
          <div style={{ fontSize: 18, fontWeight: 'bold', color: '#1565c0' }}>₹{fmt(totalOrderValue)}</div>
        </div>
        <div style={{ background: '#e8f5e9', border: '1px solid #4caf50', borderRadius: 6, padding: '8px 20px', flex: 1, textAlign: 'center' }}>
          <div style={{ fontSize: 12, color: '#388e3c' }}>{activeTab === 'client' ? 'Total Received' : 'Total Paid'}</div>
          <div style={{ fontSize: 18, fontWeight: 'bold', color: '#2e7d32' }}>₹{fmt(totalPaid)}</div>
        </div>
        <div style={{ background: '#fbe9e7', border: '1px solid #ef5350', borderRadius: 6, padding: '8px 20px', flex: 1, textAlign: 'center' }}>
          <div style={{ fontSize: 12, color: '#c62828' }}>Total Due</div>
          <div style={{ fontSize: 18, fontWeight: 'bold', color: '#b71c1c' }}>₹{fmt(totalDue)}</div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ marginBottom: 0 }}>
        <button style={tabStyle('client')} onClick={() => setActiveTab('client')}>Client Dues (Receivable)</button>
        <button style={tabStyle('vendor')} onClick={() => setActiveTab('vendor')}>Vendor Dues (Payable)</button>
      </div>

      <div style={{ border: '2px solid #1a3c6e', borderRadius: '0 8px 8px 8px', overflow: 'hidden' }}>
        {filtered.length === 0 ? (
          <div className="loading" style={{ padding: 40 }}>
            {showCleared ? 'No orders found.' : 'No outstanding dues. All orders are cleared!'}
          </div>
        ) : (
          <div className="table-container" style={{ margin: 0, border: 'none' }}>
            <table>
              <thead>
                <tr>
                  <th>Order ID</th>
                  <th>{activeTab === 'client' ? 'Client' : 'Vendor'}</th>
                  <th>Order Date</th>
                  <th style={{ textAlign: 'right' }}>Total Qty</th>
                  <th style={{ textAlign: 'right' }}>Order Value (₹)</th>
                  <th style={{ textAlign: 'right' }}>{activeTab === 'client' ? 'Received (₹)' : 'Paid (₹)'}</th>
                  <th style={{ textAlign: 'right' }}>Due (₹)</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(row => (
                  <OrderRow key={row.orderId} row={row} type={activeTab} />
                ))}
              </tbody>
              <tfoot>
                <tr style={{ fontWeight: 700, background: '#f0f4ff' }}>
                  <td colSpan={4} style={{ padding: '8px 12px', textAlign: 'right' }}>Totals:</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right' }}>₹{fmt(totalOrderValue)}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', color: '#2e7d32' }}>₹{fmt(totalPaid)}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', color: '#b71c1c' }}>₹{fmt(totalDue)}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default ViewDues;
