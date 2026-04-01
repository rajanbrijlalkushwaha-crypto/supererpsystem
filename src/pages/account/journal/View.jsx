import React, { useState, useEffect } from 'react';
import axios from 'axios';

const ViewJournals = () => {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [message, setMessage] = useState('');

  useEffect(() => { fetchData(); }, []);
  const fetchData = async () => {
    try { setLoading(true); const res = await axios.get('/api/accounts/journals'); setRecords(res.data); }
    catch (e) { setMessage('Error: ' + e.message); } finally { setLoading(false); }
  };
  const handleDelete = async (id) => {
    if (!window.confirm('Delete this journal entry?')) return;
    try { await axios.delete(`/api/accounts/journals/${id}`); fetchData(); }
    catch (e) { setMessage('Error: ' + e.message); }
  };

  const filtered = records.filter(r => {
    const q = search.toLowerCase();
    return String(r.journalId).includes(q) || (r.narration||'').toLowerCase().includes(q);
  });

  if (loading) return <div className="loading">Loading journal entries...</div>;

  return (
    <div className="client-list-page">
      <div className="client-list-header">
        <h2 className="form-title" style={{margin:0}}>Journal Entries</h2>
        <div className="client-list-actions">
          <div className="search-box">
            <span className="search-icon">🔍</span>
            <input type="text" placeholder="Search journals..." value={search} onChange={e => setSearch(e.target.value)} className="search-input" />
            {search && <button className="search-clear" onClick={() => setSearch('')}>✕</button>}
          </div>
        </div>
      </div>
      {message && <div className="error-message">{message}</div>}
      {filtered.length === 0 ? <div className="loading">No journal entries found.</div> : (
        <div className="table-container">
          <table>
            <thead><tr><th>ID</th><th>Date</th><th>Narration</th><th>Total Debit (₹)</th><th>Total Credit (₹)</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {filtered.map(r => (
                <React.Fragment key={r.journalId}>
                  <tr>
                    <td><strong>{r.journalId}</strong></td>
                    <td>{r.date}</td>
                    <td>{r.narration}</td>
                    <td>₹{(r.totalDebit||0).toLocaleString('en-IN',{minimumFractionDigits:2})}</td>
                    <td>₹{(r.totalCredit||0).toLocaleString('en-IN',{minimumFractionDigits:2})}</td>
                    <td><span className={`status-badge status-${r.status}`}>{r.status}</span></td>
                    <td>
                      <div className="action-buttons">
                        <button className="edit-btn" onClick={() => setExpanded(expanded === r.journalId ? null : r.journalId)}>
                          {expanded === r.journalId ? '▲ Hide' : '▼ Details'}
                        </button>
                        <button className="delete-btn" onClick={() => handleDelete(r.journalId)}>🗑️ Delete</button>
                      </div>
                    </td>
                  </tr>
                  {expanded === r.journalId && (
                    <tr>
                      <td colSpan={7} style={{background:'#f9f9f9', padding:12}}>
                        <table style={{width:'100%', borderCollapse:'collapse'}}>
                          <thead><tr style={{background:'#e9ecef'}}><th style={{padding:'4px 8px',textAlign:'left'}}>Ledger</th><th style={{padding:'4px 8px',textAlign:'right'}}>Debit (₹)</th><th style={{padding:'4px 8px',textAlign:'right'}}>Credit (₹)</th></tr></thead>
                          <tbody>
                            {(r.entries||[]).map((e, i) => (
                              <tr key={i}><td style={{padding:'4px 8px'}}>{e.ledger}</td><td style={{padding:'4px 8px',textAlign:'right'}}>{e.debit ? `₹${parseFloat(e.debit).toFixed(2)}` : '—'}</td><td style={{padding:'4px 8px',textAlign:'right'}}>{e.credit ? `₹${parseFloat(e.credit).toFixed(2)}` : '—'}</td></tr>
                            ))}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
          <div className="table-footer">{filtered.length} journal entries</div>
        </div>
      )}
    </div>
  );
};

export default ViewJournals;
