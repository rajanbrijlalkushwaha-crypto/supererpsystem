import React, { useState } from 'react';
import axios from 'axios';

const ACCOUNT_TYPES = ['Current', 'Savings', 'Overdraft (OD)', 'Cash Credit (CC)'];

const CreateBank = () => {
  const [form, setForm] = useState({ bankName: '', accountHolder: '', accountNumber: '', ifscCode: '', accountType: 'Current', openingBalance: '0', notes: '', status: 'active' });
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = e => setForm(p => ({ ...p, [e.target.name]: e.target.value }));

  const handleSubmit = async () => {
    if (!form.bankName || !form.accountNumber) { setMessage('Bank Name and Account Number are required.'); return; }
    try {
      setLoading(true);
      const res = await axios.post('/api/accounts/banks', form);
      setMessage(`Bank account created! ID: ${res.data.bankId}`);
      setForm({ bankName: '', accountHolder: '', accountNumber: '', ifscCode: '', accountType: 'Current', openingBalance: '0', notes: '', status: 'active' });
    } catch (e) { setMessage('Error: ' + (e.response?.data?.error || e.message)); }
    finally { setLoading(false); }
  };

  return (
    <div className="client-form-page">
      <h2 className="form-title">Add Bank Account</h2>
      {message && <div className={message.startsWith('Error') ? 'error-message' : 'success-message'}>{message}</div>}
      <div className="form-section">
        <div className="form-section-title">Bank Account Details</div>
        <div className="form-grid">
          <div className="form-group"><label>Bank Name *</label><input type="text" name="bankName" value={form.bankName} onChange={handleChange} placeholder="e.g. HDFC Bank" className="form-input" /></div>
          <div className="form-group"><label>Account Holder Name</label><input type="text" name="accountHolder" value={form.accountHolder} onChange={handleChange} placeholder="Account holder" className="form-input" /></div>
          <div className="form-group"><label>Account Number *</label><input type="text" name="accountNumber" value={form.accountNumber} onChange={handleChange} placeholder="Account number" className="form-input" /></div>
          <div className="form-group"><label>IFSC Code</label><input type="text" name="ifscCode" value={form.ifscCode} onChange={handleChange} placeholder="e.g. HDFC0001234" className="form-input" style={{textTransform:'uppercase'}} /></div>
          <div className="form-group"><label>Account Type</label><select name="accountType" value={form.accountType} onChange={handleChange} className="form-input">{ACCOUNT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
          <div className="form-group"><label>Opening Balance (₹)</label><input type="number" name="openingBalance" value={form.openingBalance} onChange={handleChange} placeholder="0.00" className="form-input" min="0" step="0.01" /></div>
          <div className="form-group"><label>Status</label><select name="status" value={form.status} onChange={handleChange} className="form-input"><option value="active">Active</option><option value="inactive">Inactive</option></select></div>
        </div>
        <div className="form-group" style={{marginTop:12}}><label>Notes</label><textarea name="notes" value={form.notes} onChange={handleChange} className="form-input" rows={2} /></div>
      </div>
      <div className="form-actions">
        <button className="btn-submit" onClick={handleSubmit} disabled={loading}>Save Bank Account</button>
      </div>
    </div>
  );
};

export default CreateBank;
