import React, { useState, useEffect } from 'react';
import axios from 'axios';

const ViewExpenses = () => {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const res = await axios.get('/api/accounts/expenses');
      setRecords(res.data);
    } catch (e) { setMessage('Error: ' + e.message); }
    finally { setLoading(false); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this expense?')) return;
    try { await axios.delete(`/api/accounts/expenses/${id}`); fetchData(); }
    catch (e) { setMessage('Error: ' + e.message); }
  };

  const handleApprove = async (rec) => {
    try { await axios.put(`/api/accounts/expenses/${rec.expenseId}`, { ...rec, status: 'approved' }); fetchData(); }
    catch (e) { setMessage('Error: ' + e.message); }
  };

  const filtered = records.filter(r => {
    const q = search.toLowerCase();
    return String(r.expenseId).includes(q) || (r.category||'').toLowerCase().includes(q) || (r.description||'').toLowerCase().includes(q) || (r.paymentMode||'').toLowerCase().includes(q);
  });

  const total = filtered.reduce((s, r) => s + (r.totalAmount || 0), 0);

  if (loading) return <div className="loading">Loading expenses...</div>;

  return (
    <div className="client-list-page">
      <div className="client-list-header">
        <h2 className="form-title" style={{ margin: 0 }}>Expense Ledger</h2>
        <div className="client-list-actions">
          <div className="search-box">
            <span className="search-icon">🔍</span>
            <input type="text" placeholder="Search expenses..." value={search} onChange={e => setSearch(e.target.value)} className="search-input" />
            {search && <button className="search-clear" onClick={() => setSearch('')}>✕</button>}
          </div>
        </div>
      </div>
      {message && <div className="error-message">{message}</div>}
      {filtered.length === 0 ? (
        <div className="loading">{search ? 'No expenses match.' : 'No expenses found.'}</div>
      ) : (
        <div className="table-container">
          <table>
            <thead><tr><th>ID</th><th>Date</th><th>Category</th><th>Description</th><th>Amount (₹)</th><th>GST (%)</th><th>Total (₹)</th><th>Payment Mode</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {filtered.map(r => (
                <tr key={r.expenseId}>
                  <td><strong>{r.expenseId}</strong></td>
                  <td>{r.date}</td>
                  <td>{r.category}</td>
                  <td>{r.description || '—'}</td>
                  <td>₹{(r.amount||0).toLocaleString('en-IN', {minimumFractionDigits:2})}</td>
                  <td>{r.taxRate || 0}%</td>
                  <td><strong>₹{(r.totalAmount||0).toLocaleString('en-IN', {minimumFractionDigits:2})}</strong></td>
                  <td>{r.paymentMode}</td>
                  <td><span className={`status-badge status-${r.status}`}>{r.status}</span></td>
                  <td>
                    <div className="action-buttons">
                      {r.status === 'draft' && <button className="edit-btn" onClick={() => handleApprove(r)}>✓ Approve</button>}
                      <button className="delete-btn" onClick={() => handleDelete(r.expenseId)}>🗑️ Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="table-footer">
            {filtered.length} records &nbsp;|&nbsp; Total: <strong>₹{total.toLocaleString('en-IN', {minimumFractionDigits:2})}</strong>
          </div>
        </div>
      )}
    </div>
  );
};

export default ViewExpenses;
