import React, { useState, useEffect } from 'react';
import axios from 'axios';

const fmt = (n) => (parseFloat(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });

const ViewPayments = () => {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [message, setMessage] = useState('');

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const res = await axios.get('/api/accounts/payments');
      setRecords(res.data);
    } catch (e) { setMessage('Error: ' + e.message); }
    finally { setLoading(false); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this record?')) return;
    try { await axios.delete(`/api/accounts/payments/${id}`); fetchData(); }
    catch (e) { setMessage('Error: ' + e.message); }
  };

  const filtered = records.filter(r => {
    const q = search.toLowerCase();
    const matchSearch =
      String(r.paymentId).includes(q) ||
      (r.entityName || '').toLowerCase().includes(q) ||
      String(r.orderId || '').includes(q) ||
      (r.referenceNo || '').toLowerCase().includes(q);
    const matchFilter = filter === 'all' || r.type === filter;
    return matchSearch && matchFilter;
  });

  const totalIn = filtered.filter(r => r.type === 'receipt').reduce((s, r) => s + (r.amount || 0), 0);
  const totalOut = filtered.filter(r => r.type === 'payment').reduce((s, r) => s + (r.amount || 0), 0);

  if (loading) return <div className="loading">Loading transactions...</div>;

  return (
    <div className="client-list-page">
      <div className="client-list-header">
        <h2 className="form-title" style={{ margin: 0 }}>All Transactions</h2>
        <div className="client-list-actions" style={{ gap: 8 }}>
          <select value={filter} onChange={e => setFilter(e.target.value)} className="form-input" style={{ width: 150 }}>
            <option value="all">All</option>
            <option value="payment">Payments (Out)</option>
            <option value="receipt">Receipts (In)</option>
          </select>
          <div className="search-box">
            <span className="search-icon">🔍</span>
            <input type="text" placeholder="Search ID, party, order..." value={search} onChange={e => setSearch(e.target.value)} className="search-input" />
            {search && <button className="search-clear" onClick={() => setSearch('')}>✕</button>}
          </div>
        </div>
      </div>

      {message && <div className="error-message">{message}</div>}

      <div style={{ display: 'flex', gap: 16, marginBottom: 12 }}>
        <div style={{ background: '#e8f5e9', border: '1px solid #4caf50', borderRadius: 6, padding: '8px 20px', flex: 1, textAlign: 'center' }}>
          <div style={{ fontSize: 12, color: '#388e3c' }}>Total Receipts (In)</div>
          <div style={{ fontSize: 18, fontWeight: 'bold', color: '#2e7d32' }}>₹{fmt(totalIn)}</div>
        </div>
        <div style={{ background: '#fbe9e7', border: '1px solid #ef5350', borderRadius: 6, padding: '8px 20px', flex: 1, textAlign: 'center' }}>
          <div style={{ fontSize: 12, color: '#c62828' }}>Total Payments (Out)</div>
          <div style={{ fontSize: 18, fontWeight: 'bold', color: '#b71c1c' }}>₹{fmt(totalOut)}</div>
        </div>
        <div style={{ background: '#e3f2fd', border: '1px solid #1e88e5', borderRadius: 6, padding: '8px 20px', flex: 1, textAlign: 'center' }}>
          <div style={{ fontSize: 12, color: '#1565c0' }}>Net Balance</div>
          <div style={{ fontSize: 18, fontWeight: 'bold', color: totalIn - totalOut >= 0 ? '#1b5e20' : '#b71c1c' }}>₹{fmt(totalIn - totalOut)}</div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="loading">No transactions found.</div>
      ) : (
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Date</th>
                <th>Type</th>
                <th>Party</th>
                <th>Order ID</th>
                <th>Amount (₹)</th>
                <th>Mode</th>
                <th>Reference</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => (
                <tr key={r.paymentId}>
                  <td><strong>{r.paymentId}</strong></td>
                  <td>{r.date}</td>
                  <td>
                    <span style={{
                      background: r.type === 'receipt' ? '#e8f5e9' : '#fbe9e7',
                      color: r.type === 'receipt' ? '#2e7d32' : '#b71c1c',
                      padding: '2px 8px', borderRadius: 4, fontSize: 12, fontWeight: 600,
                    }}>
                      {r.type === 'receipt' ? '↑ Receipt' : '↓ Payment'}
                    </span>
                  </td>
                  <td>
                    <div>{r.entityName || '—'}</div>
                    <div style={{ fontSize: 11, color: '#888' }}>{r.entityType}</div>
                  </td>
                  <td>
                    {r.orderId ? (
                      <span style={{ fontFamily: 'monospace', fontWeight: 600, color: '#1a3c6e' }}>
                        {r.orderType === 'purchase' ? 'PO' : 'SO'} #{r.orderId}
                      </span>
                    ) : '—'}
                  </td>
                  <td><strong>₹{fmt(r.amount)}</strong></td>
                  <td>{r.paymentMode}</td>
                  <td>{r.referenceNo || '—'}</td>
                  <td>
                    <button className="delete-btn" onClick={() => handleDelete(r.paymentId)}>🗑️ Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="table-footer">{filtered.length} transactions</div>
        </div>
      )}
    </div>
  );
};

export default ViewPayments;
