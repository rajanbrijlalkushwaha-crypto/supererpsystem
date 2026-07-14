import React, { useState, useEffect } from 'react';
import axios from 'axios';

const ViewAssets = () => {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => { fetchData(); }, []);
  const fetchData = async () => {
    try { setLoading(true); const res = await axios.get('/api/accounts/assets'); setRecords(res.data); }
    catch (e) { setMessage('Error: ' + e.message); } finally { setLoading(false); }
  };
  const handleDelete = async (id) => {
    if (!window.confirm('Delete this asset?')) return;
    try { await axios.delete(`/api/accounts/assets/${id}`); fetchData(); }
    catch (e) { setMessage('Error: ' + e.message); }
  };

  const filtered = records.filter(r => {
    const q = search.toLowerCase();
    return String(r.assetId).includes(q) || (r.assetName||'').toLowerCase().includes(q) || (r.category||'').toLowerCase().includes(q);
  });

  const totalValue = filtered.reduce((s, r) => s + (r.currentValue || 0), 0);

  if (loading) return <div className="loading">Loading assets...</div>;

  return (
    <div className="client-list-page">
      <div className="client-list-header">
        <h2 className="form-title" style={{margin:0}}>Asset Ledger</h2>
        <div className="client-list-actions">
          <div className="search-box">
            <span className="search-icon">🔍</span>
            <input type="text" placeholder="Search assets..." value={search} onChange={e => setSearch(e.target.value)} className="search-input" />
            {search && <button className="search-clear" onClick={() => setSearch('')}>✕</button>}
          </div>
        </div>
      </div>
      {message && <div className="error-message">{message}</div>}
      {filtered.length === 0 ? <div className="loading">{search ? 'No assets match.' : 'No assets found.'}</div> : (
        <div className="table-container">
          <table>
            <thead><tr><th>ID</th><th>Date</th><th>Asset Name</th><th>Category</th><th>Purchase (₹)</th><th>Dep. Rate</th><th>Current Value (₹)</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {filtered.map(r => (
                <tr key={r.assetId}>
                  <td><strong>{r.assetId}</strong></td>
                  <td>{r.date}</td>
                  <td>{r.assetName}</td>
                  <td>{r.category}</td>
                  <td>₹{(r.purchaseAmount||0).toFixed(2)}</td>
                  <td>{r.depreciationRate || 0}%</td>
                  <td><strong>₹{(r.currentValue||0).toFixed(2)}</strong></td>
                  <td><span className={`status-badge status-${r.status}`}>{r.status}</span></td>
                  <td><button className="delete-btn" onClick={() => handleDelete(r.assetId)}>🗑️ Delete</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="table-footer">{filtered.length} assets &nbsp;|&nbsp; Total Value: <strong>₹{totalValue.toFixed(2)}</strong></div>
        </div>
      )}
    </div>
  );
};

export default ViewAssets;
