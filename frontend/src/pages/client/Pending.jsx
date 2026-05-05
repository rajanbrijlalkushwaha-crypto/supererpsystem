import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useCompany } from '../../context/CompanyContext';

const F = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

function DetailModal({ client, onClose }) {
  const fields = [
    { section: '🏢 Identity', rows: [
      ['Client ID',      client.clientId],
      ['Company Name',   client.companyName || client.clientName],
      ['Business Type',  client.businessType],
      ['Industry',       client.industryType],
      ['Category',       client.category],
      ['Import Source',  client.importSource || '—'],
    ]},
    { section: '📋 Tax & Compliance', rows: [
      ['GST Number',     client.gstin || client.gst],
      ['GST Type',       client.gstType],
      ['PAN Number',     client.pan],
      ['CIN',            client.cin],
      ['MSME No.',       client.msme],
      ['TDS Applicable', client.tdsApplicable ? 'Yes' : 'No'],
    ]},
    { section: '📞 Contact', rows: [
      ['Contact Person', (client.contactPersons?.[0]?.name) || client.contactPerson],
      ['Mobile',         (client.contactPersons?.[0]?.mobileNumber) || client.mobile],
      ['Alt Mobile',     client.altMobile],
      ['Email',          (client.contactPersons?.[0]?.email) || client.email],
      ['Website',        client.website],
      ['Landline',       client.landline],
    ]},
    { section: '📍 Address', rows: [
      ['Billing Address', client.address || client.billingAddr],
      ['Shipping Address',client.shippingAddr],
      ['City',           client.city],
      ['State',          client.state],
      ['Pincode',        client.pincode],
      ['Country',        client.country],
    ]},
    { section: '🏦 Banking', rows: [
      ['Bank Name',      client.bankName],
      ['Account Holder', client.accountHolder],
      ['Account No.',    client.accountNo],
      ['IFSC Code',      client.ifsc],
      ['Branch',         client.branch],
      ['UPI ID',         client.upi],
    ]},
    { section: '💳 Payment Terms', rows: [
      ['Payment Terms',  client.paymentTerms],
      ['Credit Limit',   client.creditLimit ? `₹ ${Number(client.creditLimit).toLocaleString('en-IN')}` : ''],
      ['Currency',       client.currency],
      ['Payment Modes',  Array.isArray(client.paymentModes) ? client.paymentModes.join(', ') : client.paymentModes],
      ['Sales Person',   client.salesPerson],
    ]},
  ];

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center', fontFamily:F }}>
      <div style={{ background:'#fff', borderRadius:12, width:'min(820px,94vw)', maxHeight:'90vh', overflow:'hidden', display:'flex', flexDirection:'column', boxShadow:'0 20px 60px rgba(0,0,0,0.3)' }}>
        {/* Header */}
        <div style={{ background:'#1E293B', color:'#fff', padding:'14px 20px', display:'flex', alignItems:'center', justifyContent:'space-between', borderRadius:'12px 12px 0 0' }}>
          <div>
            <div style={{ fontWeight:700, fontSize:15 }}>{client.companyName || client.clientName}</div>
            <div style={{ fontSize:11, color:'#94A3B8', marginTop:2 }}>Client ID: {client.clientId} &nbsp;·&nbsp; Status: Pending Approval</div>
          </div>
          <button onClick={onClose} style={{ background:'rgba(255,255,255,0.1)', border:'1px solid rgba(255,255,255,0.2)', color:'#fff', borderRadius:6, width:30, height:30, fontSize:18, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>×</button>
        </div>
        {/* Body */}
        <div style={{ overflowY:'auto', padding:'16px 20px' }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
            {fields.map(({ section, rows }) => (
              <div key={section} style={{ border:'1px solid #E5E7EB', borderRadius:8, overflow:'hidden' }}>
                <div style={{ background:'#F1F5F9', padding:'6px 12px', fontSize:12, fontWeight:700, color:'#1E293B', borderBottom:'1px solid #E5E7EB' }}>{section}</div>
                {rows.map(([label, value]) => (
                  <div key={label} style={{ display:'flex', borderBottom:'1px solid #F1F5F9', padding:'4px 10px' }}>
                    <span style={{ fontSize:11.5, color:'#64748b', fontWeight:600, minWidth:120, flexShrink:0 }}>{label}</span>
                    <span style={{ fontSize:11.5, color:'#1E293B', wordBreak:'break-all' }}>{value || '—'}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
          {client.remarks && (
            <div style={{ marginTop:14, padding:'10px 14px', background:'#FEF9C3', border:'1px solid #FDE68A', borderRadius:8, fontSize:12, color:'#713F12' }}>
              <strong>Remarks:</strong> {client.remarks}
            </div>
          )}
        </div>
        <div style={{ padding:'12px 20px', borderTop:'1px solid #E5E7EB', display:'flex', justifyContent:'flex-end' }}>
          <button onClick={onClose} style={{ padding:'7px 20px', background:'#2563EB', color:'#fff', border:'none', borderRadius:6, cursor:'pointer', fontSize:13, fontWeight:600, fontFamily:F }}>Close</button>
        </div>
      </div>
    </div>
  );
}

const PendingClients = () => {
  const [clients, setClients]     = useState([]);
  const [loading, setLoading]     = useState(true);
  const [message, setMessage]     = useState('');
  const [search, setSearch]       = useState('');
  const [selected, setSelected]   = useState(null);
  const [rejectTarget, setRejectTarget] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const navigate = useNavigate();
  const { selectedCompany } = useCompany();

  useEffect(() => { fetchClients(); }, [selectedCompany]);

  const fetchClients = async () => {
    try {
      setLoading(true);
      const params = selectedCompany ? { companyId: selectedCompany.companyId } : {};
      const response = await axios.get('/api/clients', { params });
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
      const fd = new FormData();
      if (selectedCompany) fd.append('companyId', selectedCompany.companyId);
      fd.append('status', 'approved');
      await axios.put(`/api/clients/${clientId}`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setMessage(`Client ${clientId} approved successfully`);
      setSelected(null);
      fetchClients();
    } catch (error) {
      setMessage('Error approving client: ' + error.message);
    }
  };

  const handleReject = async () => {
    if (!rejectTarget) return;
    try {
      const fd = new FormData();
      if (selectedCompany) fd.append('companyId', selectedCompany.companyId);
      fd.append('status', 'rejected');
      if (rejectReason.trim()) fd.append('remarks', rejectReason.trim());
      await axios.put(`/api/clients/${rejectTarget.clientId}`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setMessage(`Client ${rejectTarget.clientId} rejected`);
      setRejectTarget(null);
      setRejectReason('');
      setSelected(null);
      fetchClients();
    } catch (error) {
      setMessage('Error rejecting client: ' + error.message);
    }
  };

  const filtered = clients.filter(c => {
    const q = search.toLowerCase();
    return (
      String(c.clientId).includes(q) ||
      (c.companyName || c.clientName || '').toLowerCase().includes(q) ||
      (c.city || '').toLowerCase().includes(q) ||
      (c.contactPersons?.[0]?.name || c.contactPerson || '').toLowerCase().includes(q)
    );
  });

  if (loading) return <div className="loading">Loading pending clients...</div>;

  return (
    <div className="client-list-page">
      {selected && <DetailModal client={selected} onClose={() => setSelected(null)} />}

      {/* ── Reject Reason Modal ── */}
      {rejectTarget && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center', fontFamily:F }}>
          <div style={{ background:'#fff', borderRadius:10, padding:24, maxWidth:440, width:'90%', boxShadow:'0 16px 48px rgba(0,0,0,0.25)' }}>
            <h3 style={{ margin:'0 0 6px', fontSize:15, color:'#1E293B' }}>Reject Client</h3>
            <p style={{ margin:'0 0 14px', fontSize:12.5, color:'#64748b' }}>
              Rejecting <strong>{rejectTarget.companyName || rejectTarget.clientName}</strong> ({rejectTarget.clientId}). This client will be marked as rejected and removed from the pending queue.
            </p>
            <label style={{ fontSize:12, fontWeight:600, color:'#374151', display:'block', marginBottom:5 }}>Reason (optional)</label>
            <textarea
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              rows={3}
              placeholder="Enter reason for rejection…"
              style={{ width:'100%', padding:'7px 10px', border:'1px solid #D1D5DB', borderRadius:6, fontSize:12, fontFamily:F, resize:'vertical', boxSizing:'border-box', outline:'none' }}
            />
            <div style={{ display:'flex', justifyContent:'flex-end', gap:8, marginTop:14 }}>
              <button onClick={() => { setRejectTarget(null); setRejectReason(''); }} style={{ padding:'7px 18px', background:'#fff', border:'1px solid #D1D5DB', borderRadius:6, cursor:'pointer', fontSize:12.5, fontWeight:600, fontFamily:F, color:'#374151' }}>Cancel</button>
              <button onClick={handleReject} style={{ padding:'7px 18px', background:'#DC2626', border:'none', borderRadius:6, cursor:'pointer', fontSize:12.5, fontWeight:700, fontFamily:F, color:'#fff' }}>✕ Reject Client</button>
            </div>
          </div>
        </div>
      )}

      <div className="client-list-header">
        <div>
          <h2 className="form-title" style={{ margin: 0 }}>
            Client Approval Queue
            {clients.length > 0 && <span className="count-badge">{clients.length} pending</span>}
          </h2>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.55)', marginTop: 1 }}>Review and approve client registrations</div>
        </div>
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
          <button className="cancel-btn" onClick={() => navigate('/client-sap')} style={{ background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.25)', color: '#fff' }}>← All Clients</button>
        </div>
      </div>

      {message && (
        <div className={message.includes('Error') ? 'error-message' : 'success-message'} style={{ margin: '8px 10px 0' }}>
          {message}
        </div>
      )}

      <div style={{ flex: 1, overflowY: 'auto', padding: '10px' }}>
        {filtered.length === 0 ? (
          <div className="loading">{search ? `No clients match "${search}"` : 'No pending clients at the moment.'}</div>
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
                  <th style={{ textAlign: 'center' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(client => {
                  const contact = client.contactPersons?.[0] || {};
                  const date = client.updatedAt ? new Date(client.updatedAt).toLocaleDateString('en-IN') : '—';
                  return (
                    <tr key={client.clientId}>
                      <td><strong style={{ color: 'var(--primary)' }}>{client.clientId}</strong></td>
                      <td style={{ fontWeight: 600 }}>{client.companyName || client.clientName}</td>
                      <td>{[client.city, client.state].filter(Boolean).join(', ') || '—'}</td>
                      <td>{contact.name || client.contactPerson || '—'}</td>
                      <td>{contact.mobileNumber || client.mobile || '—'}</td>
                      <td style={{ fontFamily: 'monospace', fontSize: 11 }}>{client.gstin || client.gst || '—'}</td>
                      <td>{date}</td>
                      <td style={{ textAlign: 'center' }}>
                        <div className="action-buttons">
                          <button className="approve-btn" onClick={() => handleApprove(client.clientId)}>✓ Approve</button>
                          <button className="edit-btn" onClick={() => setSelected(client)}>👁 View</button>
                          <button className="edit-btn" onClick={() => navigate(`/client/edit/${client.clientId}`)}>✏ Edit</button>
                          <button className="delete-btn" onClick={() => { setRejectTarget(client); setRejectReason(''); }}>✕ Reject</button>
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
    </div>
  );
};

export default PendingClients;
