import React, { useState, useEffect } from 'react';
import axios from 'axios';

const ViewBanks = () => {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  useEffect(() => { fetchData(); }, []);
  const fetchData = async () => {
    try { setLoading(true); const res = await axios.get('/api/accounts/banks'); setRecords(res.data); }
    catch (e) { setMessage('Error: ' + e.message); } finally { setLoading(false); }
  };
  const handleDelete = async (id) => {
    if (!window.confirm('Delete this bank account?')) return;
    try { await axios.delete(`/api/accounts/banks/${id}`); fetchData(); }
    catch (e) { setMessage('Error: ' + e.message); }
  };

  if (loading) return <div className="loading">Loading bank accounts...</div>;

  return (
    <div className="client-list-page">
      <h2 className="form-title">Bank Accounts</h2>
      {message && <div className="error-message">{message}</div>}
      {records.length === 0 ? <div className="loading">No bank accounts found.</div> : (
        <div className="table-container">
          <table>
            <thead><tr><th>ID</th><th>Bank Name</th><th>Account Holder</th><th>Account No.</th><th>IFSC</th><th>Type</th><th>Opening (₹)</th><th>Current Balance (₹)</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {records.map(r => (
                <tr key={r.bankId}>
                  <td><strong>{r.bankId}</strong></td>
                  <td>{r.bankName}</td>
                  <td>{r.accountHolder || '—'}</td>
                  <td>{r.accountNumber}</td>
                  <td>{r.ifscCode || '—'}</td>
                  <td>{r.accountType}</td>
                  <td>₹{(r.openingBalance||0).toLocaleString('en-IN',{minimumFractionDigits:2})}</td>
                  <td><strong>₹{(r.currentBalance||0).toLocaleString('en-IN',{minimumFractionDigits:2})}</strong></td>
                  <td><span className={`status-badge status-${r.status}`}>{r.status}</span></td>
                  <td><button className="delete-btn" onClick={() => handleDelete(r.bankId)}>🗑️ Delete</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="table-footer">{records.length} bank accounts</div>
        </div>
      )}
    </div>
  );
};

export default ViewBanks;
