import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { printClientDetails } from '../utils/printClient';

const ViewClients = () => {
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
      setClients(response.data);
    } catch (error) {
      setMessage('Error fetching clients: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (clientId) => {
    if (window.confirm('Are you sure you want to delete this client?')) {
      try {
        await axios.delete(`/api/clients/${clientId}`);
        setMessage('Client deleted successfully');
        fetchClients();
      } catch (error) {
        setMessage('Error deleting client: ' + error.message);
      }
    }
  };

  const filtered = clients.filter(c => {
    const q = search.toLowerCase();
    return (
      String(c.clientId).includes(q) ||
      (c.companyName || '').toLowerCase().includes(q) ||
      (c.city || '').toLowerCase().includes(q) ||
      (c.state || '').toLowerCase().includes(q) ||
      (c.gstin || '').toLowerCase().includes(q) ||
      (c.contactPersons || []).some(p =>
        (p.name || '').toLowerCase().includes(q) ||
        (p.mobileNumber || '').includes(q) ||
        (p.email || '').toLowerCase().includes(q)
      )
    );
  });

  const statusClass = (s) => ({ draft: 'status-draft', pending: 'status-pending', approved: 'status-approved' }[s] || '');

  if (loading) return <div className="loading">Loading clients...</div>;

  return (
    <div className="client-list-page">
      <div className="client-list-header">
        <h2 className="form-title" style={{ margin: 0 }}>All Clients</h2>
        <div className="client-list-actions">
          <div className="search-box">
            <span className="search-icon">🔍</span>
            <input
              type="text"
              placeholder="Search by name, ID, GSTIN, state, mobile..."
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
        <div className="loading">{search ? 'No clients match your search.' : 'No clients found. Create a new client to get started.'}</div>
      ) : (
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Client ID</th>
                <th>Company Name</th>
                <th>State</th>
                <th>GSTIN</th>
                <th>Mobile</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(client => {
                const contact = client.contactPersons?.[0] || {};
                return (
                  <tr key={client.clientId}>
                    <td><strong>{client.clientId}</strong></td>
                    <td>{client.companyName}</td>
                    <td>{client.state || '—'}</td>
                    <td style={{ fontSize: '0.85em' }}>{client.gstin || '—'}</td>
                    <td>{contact.mobileNumber || '—'}</td>
                    <td>
                      <span className={`status-badge ${statusClass(client.status)}`}>
                        {client.status ? client.status.charAt(0).toUpperCase() + client.status.slice(1) : 'Draft'}
                      </span>
                    </td>
                    <td>
                      <div className="action-buttons">
                        <button className="edit-btn" onClick={() => navigate(`/edit/${client.clientId}`)}>✏️ Edit</button>
                        <button className="print-btn" onClick={() => printClientDetails(client)}>🖨️ Print</button>
                        <button className="delete-btn" onClick={() => handleDelete(client.clientId)}>🗑️ Delete</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="table-footer">Showing {filtered.length} of {clients.length} clients</div>
        </div>
      )}
    </div>
  );
};

export default ViewClients;
