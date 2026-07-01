import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { printClientDetails } from '../utils/printClient';

const PendingClients = () => {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');
  const navigate = useNavigate();

  useEffect(() => { fetchClients(); }, []);

  const fetchClients = async () => {
    try {
      setLoading(true);
      const response = await axios.get('/api/clients');
      setClients(response.data.filter(c => c.status === 'pending'));
    } catch (error) {
      setMessage('Error fetching clients: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (clientId) => {
    if (!window.confirm('Approve this client?')) return;
    try {
      const res = await axios.get(`/api/clients/${clientId}`);
      const client = res.data;
      const fd = new FormData();
      fd.append('companyName', client.companyName);
      fd.append('address', client.address);
      fd.append('city', client.city);
      fd.append('state', client.state);
      fd.append('pincode', client.pincode);
      fd.append('gstin', client.gstin || '');
      fd.append('gstType', client.gstType || 'Regular');
      fd.append('status', 'approved');
      fd.append('contactPersons', JSON.stringify(client.contactPersons || []));
      fd.append('documents', JSON.stringify(client.documents || []));
      await axios.put(`/api/clients/${clientId}`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setMessage(`Client ${clientId} approved successfully`);
      fetchClients();
    } catch (error) {
      setMessage('Error approving client: ' + error.message);
    }
  };

  const filtered = clients.filter(c => {
    const q = search.toLowerCase();
    return (
      String(c.clientId).includes(q) ||
      (c.companyName || '').toLowerCase().includes(q) ||
      (c.city || '').toLowerCase().includes(q) ||
      (c.contactPersons?.[0]?.name || '').toLowerCase().includes(q)
    );
  });

  if (loading) return <div className="loading">Loading pending clients...</div>;

  return (
    <div className="client-list-page">
      <div className="client-list-header">
        <h2 className="form-title" style={{ margin: 0 }}>
          Pending Clients
          <span className="count-badge">{clients.length}</span>
        </h2>
        <div className="client-list-actions">
          <div className="search-box">
            <span className="search-icon">🔍</span>
            <input
              type="text"
              placeholder="Search pending clients..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
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
        <div className="loading">{search ? 'No clients match your search.' : 'No pending clients at the moment.'}</div>
      ) : (
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Client ID</th>
                <th>Company Name</th>
                <th>City / State</th>
                <th>Contact Person</th>
                <th>Mobile</th>
                <th>GSTIN</th>
                <th>Submitted</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(client => {
                const contact = client.contactPersons?.[0] || {};
                const date = client.updatedAt ? new Date(client.updatedAt).toLocaleDateString('en-IN') : '—';
                return (
                  <tr key={client.clientId}>
                    <td><strong>{client.clientId}</strong></td>
                    <td>{client.companyName}</td>
                    <td>{client.city}{client.state ? `, ${client.state}` : ''}</td>
                    <td>{contact.name || '—'}</td>
                    <td>{contact.mobileNumber || '—'}</td>
                    <td>{client.gstin || '—'}</td>
                    <td>{date}</td>
                    <td>
                      <div className="action-buttons">
                        <button className="approve-btn" onClick={() => handleApprove(client.clientId)}>✓ Approve</button>
                        <button className="edit-btn" onClick={() => navigate(`/edit/${client.clientId}`)}>✏️ Edit</button>
                        <button className="print-btn" onClick={() => printClientDetails(client)}>🖨️ Print</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="table-footer">Showing {filtered.length} of {clients.length} pending clients</div>
        </div>
      )}
    </div>
  );
};

export default PendingClients;
