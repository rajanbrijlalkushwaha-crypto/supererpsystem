import React, { useState } from 'react';
import axios from 'axios';

const ASSET_CATEGORIES = ['Land', 'Building', 'Machinery', 'Vehicle', 'Furniture', 'Computer & Equipment', 'Tools', 'Other'];

const CreateAsset = () => {
  const [form, setForm] = useState({ date: new Date().toISOString().slice(0,10), assetName: '', category: '', description: '', purchaseAmount: '', depreciationRate: '0', notes: '', status: 'active' });
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = e => setForm(p => ({ ...p, [e.target.name]: e.target.value }));

  const handleSubmit = async () => {
    if (!form.assetName || !form.category || !form.purchaseAmount) { setMessage('Asset Name, Category and Purchase Amount are required.'); return; }
    try {
      setLoading(true);
      const res = await axios.post('/api/accounts/assets', form);
      setMessage(`Asset created! ID: ${res.data.assetId}`);
      setForm({ date: new Date().toISOString().slice(0,10), assetName: '', category: '', description: '', purchaseAmount: '', depreciationRate: '0', notes: '', status: 'active' });
    } catch (e) { setMessage('Error: ' + (e.response?.data?.error || e.message)); }
    finally { setLoading(false); }
  };

  return (
    <div className="client-form-page">
      <h2 className="form-title">Create Asset</h2>
      {message && <div className={message.startsWith('Error') ? 'error-message' : 'success-message'}>{message}</div>}
      <div className="form-section">
        <div className="form-section-title">Asset Details</div>
        <div className="form-grid">
          <div className="form-group"><label>Purchase Date *</label><input type="date" name="date" value={form.date} onChange={handleChange} className="form-input" /></div>
          <div className="form-group"><label>Asset Name *</label><input type="text" name="assetName" value={form.assetName} onChange={handleChange} placeholder="e.g. Dell Laptop" className="form-input" /></div>
          <div className="form-group"><label>Category *</label><select name="category" value={form.category} onChange={handleChange} className="form-input"><option value="">Select</option>{ASSET_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
          <div className="form-group"><label>Purchase Amount (₹) *</label><input type="number" name="purchaseAmount" value={form.purchaseAmount} onChange={handleChange} placeholder="0.00" className="form-input" min="0" step="0.01" /></div>
          <div className="form-group"><label>Depreciation Rate (% per year)</label><input type="number" name="depreciationRate" value={form.depreciationRate} onChange={handleChange} placeholder="0" className="form-input" min="0" max="100" step="0.01" /></div>
          <div className="form-group"><label>Status</label><select name="status" value={form.status} onChange={handleChange} className="form-input"><option value="active">Active</option><option value="disposed">Disposed</option></select></div>
        </div>
        <div className="form-group" style={{marginTop:12}}><label>Description</label><textarea name="description" value={form.description} onChange={handleChange} className="form-input" rows={2} /></div>
        <div className="form-group" style={{marginTop:12}}><label>Notes</label><textarea name="notes" value={form.notes} onChange={handleChange} className="form-input" rows={2} /></div>
      </div>
      <div className="form-actions">
        <button className="btn-submit" onClick={handleSubmit} disabled={loading}>Save Asset</button>
      </div>
    </div>
  );
};

export default CreateAsset;
