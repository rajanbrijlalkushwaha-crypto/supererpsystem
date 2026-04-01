import React, { useState } from 'react';
import axios from 'axios';

const EXPENSE_CATEGORIES = ['Rent', 'Utilities', 'Salary', 'Travel', 'Materials', 'Office Supplies', 'Marketing', 'Maintenance', 'Insurance', 'Professional Fees', 'Other'];
const TAX_RATES = [0, 5, 12, 18, 28];
const PAYMENT_MODES = ['Cash', 'Bank Transfer', 'Cheque', 'UPI', 'Credit Card'];

const CreateExpense = () => {
  const [form, setForm] = useState({ date: new Date().toISOString().slice(0,10), category: '', description: '', amount: '', taxRate: '0', paymentMode: 'Cash', bankId: '', notes: '' });
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const taxAmount = parseFloat(((parseFloat(form.amount)||0) * (parseFloat(form.taxRate)/100)).toFixed(2));
  const totalAmount = (parseFloat(form.amount)||0) + taxAmount;

  const handleChange = e => setForm(p => ({ ...p, [e.target.name]: e.target.value }));

  const handleSubmit = async (status) => {
    if (!form.date || !form.category || !form.amount) { setMessage('Date, Category and Amount are required.'); return; }
    try {
      setLoading(true);
      const res = await axios.post('/api/accounts/expenses', { ...form, status });
      setMessage(`Expense created successfully! ID: ${res.data.expenseId}`);
      setForm({ date: new Date().toISOString().slice(0,10), category: '', description: '', amount: '', taxRate: '0', paymentMode: 'Cash', bankId: '', notes: '' });
    } catch (e) { setMessage('Error: ' + (e.response?.data?.error || e.message)); }
    finally { setLoading(false); }
  };

  return (
    <div className="client-form-page">
      <h2 className="form-title">Create Expense Entry</h2>
      {message && <div className={message.startsWith('Error') ? 'error-message' : 'success-message'}>{message}</div>}
      <div className="form-section">
        <div className="form-section-title">Expense Details</div>
        <div className="form-grid">
          <div className="form-group">
            <label>Date *</label>
            <input type="date" name="date" value={form.date} onChange={handleChange} className="form-input" />
          </div>
          <div className="form-group">
            <label>Category *</label>
            <select name="category" value={form.category} onChange={handleChange} className="form-input">
              <option value="">Select Category</option>
              {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Amount (₹) *</label>
            <input type="number" name="amount" value={form.amount} onChange={handleChange} placeholder="0.00" className="form-input" min="0" step="0.01" />
          </div>
          <div className="form-group">
            <label>GST Rate (%)</label>
            <select name="taxRate" value={form.taxRate} onChange={handleChange} className="form-input">
              {TAX_RATES.map(r => <option key={r} value={r}>{r}%</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Tax Amount (₹)</label>
            <input type="text" readOnly value={taxAmount.toFixed(2)} className="form-input" style={{ background: '#f5f5f5' }} />
          </div>
          <div className="form-group">
            <label>Total Amount (₹)</label>
            <input type="text" readOnly value={totalAmount.toFixed(2)} className="form-input" style={{ background: '#f5f5f5', fontWeight: 'bold' }} />
          </div>
          <div className="form-group">
            <label>Payment Mode</label>
            <select name="paymentMode" value={form.paymentMode} onChange={handleChange} className="form-input">
              {PAYMENT_MODES.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Reference / Voucher No.</label>
            <input type="text" name="bankId" value={form.bankId} onChange={handleChange} placeholder="e.g. CHQ-001" className="form-input" />
          </div>
        </div>
        <div className="form-group" style={{ marginTop: 12 }}>
          <label>Description</label>
          <textarea name="description" value={form.description} onChange={handleChange} placeholder="Expense description..." className="form-input" rows={2} />
        </div>
        <div className="form-group" style={{ marginTop: 12 }}>
          <label>Notes</label>
          <textarea name="notes" value={form.notes} onChange={handleChange} placeholder="Additional notes..." className="form-input" rows={2} />
        </div>
      </div>
      <div className="form-actions">
        <button className="btn-draft" onClick={() => handleSubmit('draft')} disabled={loading}>Save as Draft</button>
        <button className="btn-submit" onClick={() => handleSubmit('approved')} disabled={loading}>Approve & Save</button>
      </div>
    </div>
  );
};

export default CreateExpense;
