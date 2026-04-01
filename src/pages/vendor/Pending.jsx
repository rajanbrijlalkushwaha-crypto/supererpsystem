import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { printVendorDetails } from '../../utils/printVendor';

const PendingVendors = () => {
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');
  const navigate = useNavigate();

  useEffect(() => { fetchVendors(); }, []);

  const fetchVendors = async () => {
    try {
      setLoading(true);
      const res = await axios.get('/api/vendors');
      setVendors(res.data.filter(v => v.status === 'pending'));
    } catch (err) { setMessage('Error: ' + err.message); }
    finally { setLoading(false); }
  };

  const handleApprove = async (vendorId) => {
    if (!window.confirm('Approve this vendor?')) return;
    try {
      const res = await axios.get(`/api/vendors/${vendorId}`);
      const v = res.data;
      const fd = new FormData();
      // Re-send all scalar fields with correct names (matching PUT handler)
      const fields = ['vendorName','businessType','industryType','pan','gstin','gstType','cin','msme',
        'address','shippingAddr','city','state','pincode','country','gstRegistered','tcsApplicable',
        'bankName','accountHolder','accountNo','ifsc','branch','upi',
        'paymentTerms','creditLimit','currency','category','purchasePerson','remarks','website','landline'];
      fields.forEach(k => { if (v[k] !== undefined && v[k] !== null) fd.append(k, v[k]); });
      fd.append('status', 'approved');
      fd.append('contactPersons', JSON.stringify(v.contactPersons || []));
      fd.append('documents', JSON.stringify(v.documents || []));
      await axios.put(`/api/vendors/${vendorId}`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setMessage(`Vendor ${vendorId} approved successfully`);
      fetchVendors();
    } catch (err) { setMessage('Error: ' + err.message); }
  };

  const filtered = vendors.filter(v => {
    const q = search.toLowerCase();
    return String(v.vendorId).includes(q) ||
      (v.vendorName || '').toLowerCase().includes(q) ||
      (v.vendorType || '').toLowerCase().includes(q) ||
      (v.contactPerson || '').toLowerCase().includes(q);
  });

  if (loading) return <div className="loading">Loading pending vendors…</div>;

  return (
    <div className="client-list-page">
      <div className="client-list-header">
        <h2 className="form-title" style={{ margin: 0 }}>
          Pending Approval
          <span className="count-badge">{vendors.length}</span>
        </h2>
        <div className="client-list-actions">
          <div className="search-box">
            <span className="search-icon">🔍</span>
            <input
              type="text"
              placeholder="Search vendors…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="search-input"
            />
            {search && <button className="search-clear" onClick={() => setSearch('')}>✕</button>}
          </div>
        </div>
      </div>

      {message && (
        <div className={message.includes('Error') ? 'error-message' : 'success-message'} style={{ margin: '0 0 10px' }}>
          {message}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="loading">{search ? 'No vendors match.' : 'No pending vendors.'}</div>
      ) : (
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Vendor ID</th>
                <th>Vendor Name</th>
                <th>Type</th>
                <th>Contact Person</th>
                <th>Phone</th>
                <th>GST No.</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(vendor => (
                <tr key={vendor.vendorId}>
                  <td><strong>{vendor.vendorId}</strong></td>
                  <td>{vendor.vendorName || '—'}</td>
                  <td>{vendor.vendorType || '—'}</td>
                  <td>{vendor.contactPerson || '—'}</td>
                  <td>{vendor.phone || '—'}</td>
                  <td>{vendor.gstNumber || '—'}</td>
                  <td>
                    <div className="action-buttons">
                      <button className="approve-btn" onClick={() => handleApprove(vendor.vendorId)}>✓ Approve</button>
                      <button className="edit-btn" onClick={() => navigate(`/vendor/edit/${vendor.vendorId}`)}>✏️ Edit</button>
                      <button className="print-btn" onClick={() => printVendorDetails(vendor)}>🖨️ Print</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="table-footer">Showing {filtered.length} of {vendors.length} pending</div>
        </div>
      )}
    </div>
  );
};

export default PendingVendors;
