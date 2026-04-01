import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { printVendorDetails } from '../../utils/printVendor';

const ViewVendors = () => {
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');
  const navigate = useNavigate();

  useEffect(() => { fetchVendors(); }, []);

  const fetchVendors = async () => {
    try {
      setLoading(true);
      const response = await axios.get('/api/vendors');
      setVendors(response.data);
    } catch (error) {
      setMessage('Error fetching vendors: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (vendorId) => {
    if (window.confirm('Are you sure you want to delete this vendor?')) {
      try {
        await axios.delete(`/api/vendors/${vendorId}`);
        setMessage('Vendor deleted successfully');
        fetchVendors();
      } catch (error) {
        setMessage('Error deleting vendor: ' + error.message);
      }
    }
  };

  const filtered = vendors.filter(v => {
    const q = search.toLowerCase();
    return (
      String(v.vendorId).includes(q) ||
      (v.vendorName || '').toLowerCase().includes(q) ||
      (v.city || '').toLowerCase().includes(q) ||
      (v.state || '').toLowerCase().includes(q) ||
      (v.contactPersons?.[0]?.name || '').toLowerCase().includes(q)
    );
  });

  const statusClass = (s) => ({ draft: 'status-draft', pending: 'status-pending', approved: 'status-approved' }[s] || '');

  if (loading) return <div className="loading">Loading vendors...</div>;

  return (
    <div className="client-list-page">
      <div className="client-list-header">
        <h2 className="form-title" style={{ margin: 0 }}>All Vendors</h2>
        <div className="client-list-actions">
          <div className="search-box">
            <span className="search-icon">🔍</span>
            <input
              type="text"
              placeholder="Search by name, ID, city..."
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
        <div className="loading">{search ? 'No vendors match your search.' : 'No vendors found. Create a new vendor to get started.'}</div>
      ) : (
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Vendor ID</th>
                <th>Vendor Name</th>
                <th>City / State</th>
                <th>Contact Person</th>
                <th>Mobile</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(vendor => {
                const contact = vendor.contactPersons?.[0] || {};
                return (
                  <tr key={vendor.vendorId}>
                    <td><strong>{vendor.vendorId}</strong></td>
                    <td>{vendor.vendorName}</td>
                    <td>{vendor.city}{vendor.state ? `, ${vendor.state}` : ''}</td>
                    <td>{contact.name || '—'}</td>
                    <td>{contact.mobileNumber || '—'}</td>
                    <td>
                      <span className={`status-badge ${statusClass(vendor.status)}`}>
                        {vendor.status ? vendor.status.charAt(0).toUpperCase() + vendor.status.slice(1) : 'Draft'}
                      </span>
                    </td>
                    <td>
                      <div className="action-buttons">
                        <button className="edit-btn" onClick={() => navigate(`/vendor/edit/${vendor.vendorId}`)}>✏️ Edit</button>
                        <button className="print-btn" onClick={() => printVendorDetails(vendor)}>🖨️ Print</button>
                        <button className="delete-btn" onClick={() => handleDelete(vendor.vendorId)}>🗑️ Delete</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="table-footer">Showing {filtered.length} of {vendors.length} vendors</div>
        </div>
      )}
    </div>
  );
};

export default ViewVendors;
