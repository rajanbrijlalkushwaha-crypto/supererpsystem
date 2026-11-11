import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useCompany } from '../../context/CompanyContext';

const emptyForm = () => ({
  companyName: '', address: '', city: '', state: 'Gujarat', pincode: '',
  gstin: '', pan: '', email: '', phone: '', website: '', jurisdiction: '',
  bankName: '', bankAccount: '', bankIfsc: '', bankBranch: '', isDefault: false
});

const Companies = () => {
  const [companies, setCompanies] = useState([]);
  const [form, setForm] = useState(emptyForm());
  const [editId, setEditId] = useState(null);
  const [logo, setLogo] = useState(null);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [locations, setLocations] = useState([]);   // stores / factories: [{ name, type: 'Store' | 'Factory', address }]
  const setLoc = (i, k, v) => setLocations(l => l.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  const { refreshCompanies, selectCompany } = useCompany();

  useEffect(() => { fetchCompanies(); }, []);

  const fetchCompanies = async () => {
    try {
      const res = await axios.get('/api/companies');
      setCompanies(res.data);
    } catch (err) { setMessage('Error: ' + err.message); }
  };

  const handleInput = (e) => {
    const { name, value, type, checked } = e.target;
    setForm(p => ({ ...p, [name]: type === 'checkbox' ? checked : value }));
  };

  const handleSubmit = async () => {
    if (!form.companyName) { setMessage('Company name is required.'); return; }
    try {
      setLoading(true);
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => fd.append(k, v));
      fd.append('locations', JSON.stringify(locations.filter(x => x.name.trim())));
      if (logo) fd.append('logo', logo);
      if (editId) {
        await axios.put(`/api/companies/${editId}`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
        setMessage('Company updated successfully.');
      } else {
        await axios.post('/api/companies', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
        setMessage('Company created successfully.');
      }
      setForm(emptyForm()); setEditId(null); setLogo(null); setShowForm(false); setLocations([]);
      fetchCompanies(); refreshCompanies();
    } catch (err) { setMessage('Error: ' + err.message); }
    finally { setLoading(false); }
  };

  const handleEdit = (co) => {
    setForm({ companyName: co.companyName || '', address: co.address || '', city: co.city || '', state: co.state || 'Gujarat', pincode: co.pincode || '', gstin: co.gstin || '', pan: co.pan || '', email: co.email || '', phone: co.phone || '', website: co.website || '', jurisdiction: co.jurisdiction || '', bankName: co.bankName || '', bankAccount: co.bankAccount || '', bankIfsc: co.bankIfsc || '', bankBranch: co.bankBranch || '', isDefault: co.isDefault || false });
    setLocations(Array.isArray(co.locations) ? co.locations.map(x => ({ name: x.name || '', type: x.type === 'Factory' ? 'Factory' : 'Store', address: x.address || '' })) : []);
    setEditId(co.companyId);
    setShowForm(true);
    setMessage('');
  };

  const handleDelete = async (companyId) => {
    if (!window.confirm('Delete this company?')) return;
    try {
      await axios.delete(`/api/companies/${companyId}`);
      setMessage('Company deleted.'); fetchCompanies(); refreshCompanies();
    } catch (err) { setMessage('Error: ' + err.message); }
  };

  const handleSelect = (co) => { selectCompany(co); setMessage(`Active company set to: ${co.companyName}`); };

  return (
    <div className="client-list-page">
      <div className="client-list-header">
        <h2 className="form-title" style={{ margin: 0 }}>
          Manage Companies
          <span className="count-badge">{companies.length}</span>
        </h2>
        <div className="client-list-actions">
          <button className="add-button" style={{ marginTop: 0 }} onClick={() => { setForm(emptyForm()); setEditId(null); setShowForm(true); setMessage(''); }}>
            + Add Company
          </button>
        </div>
      </div>

      {message && <div className={message.includes('Error') ? 'error-message' : 'success-message'} style={{ margin: '0 0 10px' }}>{message}</div>}

      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 800, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', overflowY: 'auto', padding: '20px 0' }}>
          <div className="form-container" style={{ width: '820px', maxWidth: '95vw', margin: 'auto' }}>
            <div className="form-title form-title-row">
              <span>{editId ? 'Edit Company' : 'Add New Company'}</span>
              <button className="cancel-btn" style={{ fontSize: '11px', padding: '3px 12px' }} onClick={() => { setShowForm(false); setMessage(''); }}>&#x2715; Cancel</button>
            </div>

            <div className="form-section">
              <h3 className="section-title">Company Details</h3>
              <div className="form-row">
                <div className="form-group">
                  <label>Company Name *</label>
                  <input type="text" name="companyName" value={form.companyName} onChange={handleInput} placeholder="e.g. Epsilon Enterprise" />
                </div>
                <div className="form-group">
                  <label>GSTIN</label>
                  <input type="text" name="gstin" value={form.gstin} onChange={handleInput} placeholder="e.g. 24BEZPS9549Q1ZW" />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>PAN</label>
                  <input type="text" name="pan" value={form.pan} onChange={handleInput} />
                </div>
                <div className="form-group">
                  <label>Email</label>
                  <input type="email" name="email" value={form.email} onChange={handleInput} />
                </div>
              </div>
              <div className="form-row three">
                <div className="form-group">
                  <label>Phone</label>
                  <input type="text" name="phone" value={form.phone} onChange={handleInput} />
                </div>
                <div className="form-group">
                  <label>Website</label>
                  <input type="text" name="website" value={form.website} onChange={handleInput} />
                </div>
                <div className="form-group">
                  <label>Jurisdiction (city / district)</label>
                  <input type="text" name="jurisdiction" value={form.jurisdiction} onChange={handleInput} placeholder="e.g. Ahmedabad" />
                </div>
                <div className="form-group">
                  <label>Company Logo</label>
                  <input type="file" accept="image/*" onChange={e => setLogo(e.target.files[0])} />
                </div>
              </div>
            </div>

            <div className="form-section">
              <h3 className="section-title">Address</h3>
              <div className="form-row full">
                <div className="form-group">
                  <label>Address (Street / Building / Area)</label>
                  <textarea name="address" value={form.address} onChange={handleInput} placeholder="e.g. 058, Gujarat Housing Board, Chandkhed" rows={3} style={{ resize: 'vertical' }} />
                </div>
              </div>
              <div className="form-row three">
                <div className="form-group">
                  <label>City</label>
                  <input type="text" name="city" value={form.city} onChange={handleInput} />
                </div>
                <div className="form-group">
                  <label>State</label>
                  <input type="text" name="state" value={form.state} onChange={handleInput} />
                </div>
                <div className="form-group">
                  <label>Pincode</label>
                  <input type="text" name="pincode" value={form.pincode} onChange={handleInput} />
                </div>
              </div>
            </div>

            <div className="form-section">
              <h3 className="section-title">Bank Details</h3>
              <div className="form-row three">
                <div className="form-group">
                  <label>Bank Name</label>
                  <input type="text" name="bankName" value={form.bankName} onChange={handleInput} />
                </div>
                <div className="form-group">
                  <label>Account Number</label>
                  <input type="text" name="bankAccount" value={form.bankAccount} onChange={handleInput} />
                </div>
                <div className="form-group">
                  <label>IFSC Code</label>
                  <input type="text" name="bankIfsc" value={form.bankIfsc} onChange={handleInput} />
                </div>
              </div>
              <div className="form-row three">
                <div className="form-group">
                  <label>Branch Name</label>
                  <input type="text" name="bankBranch" value={form.bankBranch} onChange={handleInput} />
                </div>
              </div>
              <div className="form-row full">
                <div className="form-group" style={{ flexDirection: 'row', alignItems: 'center', gap: '10px' }}>
                  <input type="checkbox" name="isDefault" checked={form.isDefault} onChange={handleInput} id="isDefault" style={{ width: 'auto' }} />
                  <label htmlFor="isDefault" style={{ marginBottom: 0, fontWeight: 'bold' }}>Set as Default Company</label>
                </div>
              </div>
            </div>

            <div className="form-section">
              <h3 className="section-title">Store &amp; Factory Locations</h3>
              <p style={{ margin: '0 0 8px', fontSize: 12, color: '#667085' }}>Places where material is kept or made. They are offered when material is received, returned or sent out.</p>
              {locations.map((l, i) => (
                <div className="form-row three" key={i} style={{ alignItems: 'flex-end' }}>
                  <div className="form-group">
                    <label>Name</label>
                    <input type="text" value={l.name} onChange={e => setLoc(i, 'name', e.target.value)} placeholder="e.g. Main Store, Changodar Factory" />
                  </div>
                  <div className="form-group" style={{ maxWidth: 160 }}>
                    <label>Type</label>
                    <select value={l.type} onChange={e => setLoc(i, 'type', e.target.value)}><option>Store</option><option>Factory</option></select>
                  </div>
                  <div className="form-group">
                    <label>Address</label>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <input type="text" value={l.address} onChange={e => setLoc(i, 'address', e.target.value)} style={{ flex: 1 }} />
                      <button type="button" className="cancel-btn" onClick={() => setLocations(x => x.filter((_, j) => j !== i))} aria-label={`Remove ${l.name || 'location'}`}>✕</button>
                    </div>
                  </div>
                </div>
              ))}
              <button type="button" className="cancel-btn" onClick={() => setLocations(x => [...x, { name: '', type: 'Store', address: '' }])}>+ Add store / factory</button>
            </div>

            <div className="form-actions">
              <button className="cancel-btn" onClick={() => { setShowForm(false); setMessage(''); }}>Cancel</button>
              <button className="submit-btn" onClick={handleSubmit} disabled={loading}>
                {loading ? 'Saving…' : (editId ? 'Update Company' : 'Create Company')}
              </button>
            </div>
          </div>
        </div>
      )}

      {companies.length === 0 ? (
        <div className="loading">No companies added yet. Click &quot;+ Add Company&quot; to get started.</div>
      ) : (
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Company ID</th>
                <th>Company Name</th>
                <th>GSTIN</th>
                <th>Address</th>
                <th>City / State / Pin</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Default</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {companies.map(co => (
                <tr key={co.companyId}>
                  <td><strong>{co.companyId}</strong></td>
                  <td><strong>{co.companyName}</strong></td>
                  <td>{co.gstin || '—'}</td>
                  <td style={{ maxWidth: '200px', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{co.address || '—'}</td>
                  <td>{[co.city, co.state, co.pincode].filter(Boolean).join(', ') || '—'}</td>
                  <td>{co.email || '—'}</td>
                  <td>{co.phone || '—'}</td>
                  <td style={{ textAlign: 'center' }}>
                    {co.isDefault ? <span className="status-badge status-approved">Default</span> : '—'}
                  </td>
                  <td>
                    <div className="action-buttons">
                      <button className="approve-btn" onClick={() => handleSelect(co)}>&#x2713; Use</button>
                      <button className="edit-btn" onClick={() => handleEdit(co)}>&#x270F;&#xFE0F; Edit</button>
                      <button className="delete-btn" onClick={() => handleDelete(co.companyId)}>&#x1F5D1;&#xFE0F; Del</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="table-footer">Total {companies.length} companies</div>
        </div>
      )}
    </div>
  );
};

export default Companies;
