import React, { useState } from 'react';
import axios from 'axios';

const LEDGERS = ['Cash', 'Bank', 'Sales', 'Purchase', 'GST Input', 'GST Output', 'Accounts Receivable', 'Accounts Payable', 'Capital', 'Expenses', 'Revenue', 'Fixed Assets', 'Stock', 'Other'];

const CreateJournal = () => {
  const [form, setForm] = useState({ date: new Date().toISOString().slice(0,10), narration: '' });
  const [entries, setEntries] = useState([
    { id: 1, ledger: '', debit: '', credit: '' },
    { id: 2, ledger: '', debit: '', credit: '' },
  ]);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const totalDebit = entries.reduce((s, e) => s + (parseFloat(e.debit)||0), 0);
  const totalCredit = entries.reduce((s, e) => s + (parseFloat(e.credit)||0), 0);
  const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01;

  const addEntry = () => {
    const newId = Math.max(...entries.map(e => e.id), 0) + 1;
    setEntries(p => [...p, { id: newId, ledger: '', debit: '', credit: '' }]);
  };
  const removeEntry = (id) => { if (entries.length <= 2) return; setEntries(p => p.filter(e => e.id !== id)); };
  const updateEntry = (id, field, value) => setEntries(p => p.map(e => e.id === id ? { ...e, [field]: value } : e));

  const handleSubmit = async (status) => {
    if (!form.date || !form.narration) { setMessage('Date and Narration are required.'); return; }
    if (!isBalanced) { setMessage('Journal is not balanced. Total Debit must equal Total Credit.'); return; }
    if (entries.some(e => !e.ledger)) { setMessage('All ledger entries must have a ledger name.'); return; }
    try {
      setLoading(true);
      const res = await axios.post('/api/accounts/journals', { ...form, entries, status });
      setMessage(`Journal entry created! ID: ${res.data.journalId}`);
      setForm({ date: new Date().toISOString().slice(0,10), narration: '' });
      setEntries([{ id: 1, ledger: '', debit: '', credit: '' }, { id: 2, ledger: '', debit: '', credit: '' }]);
    } catch (e) { setMessage('Error: ' + (e.response?.data?.error || e.message)); }
    finally { setLoading(false); }
  };

  return (
    <div className="client-form-page">
      <h2 className="form-title">Create Journal Entry</h2>
      {message && <div className={message.startsWith('Error') || message.includes('not balanced') ? 'error-message' : 'success-message'}>{message}</div>}
      <div className="form-section">
        <div className="form-section-title">Journal Details</div>
        <div className="form-grid">
          <div className="form-group"><label>Date *</label><input type="date" name="date" value={form.date} onChange={e => setForm(p=>({...p, date:e.target.value}))} className="form-input" /></div>
          <div className="form-group"><label>Narration *</label><input type="text" name="narration" value={form.narration} onChange={e => setForm(p=>({...p, narration:e.target.value}))} placeholder="Purpose of this journal entry..." className="form-input" /></div>
        </div>
      </div>
      <div className="form-section">
        <div className="form-section-title" style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <span>Journal Entries (Double Entry)</span>
          <button type="button" className="btn-draft" onClick={addEntry} style={{padding:'4px 12px',fontSize:13}}>+ Add Row</button>
        </div>
        <div className="table-container" style={{marginTop:8}}>
          <table>
            <thead><tr><th style={{width:'40%'}}>Ledger / Account</th><th>Debit (₹)</th><th>Credit (₹)</th><th></th></tr></thead>
            <tbody>
              {entries.map(e => (
                <tr key={e.id}>
                  <td>
                    <select value={e.ledger} onChange={ev => updateEntry(e.id, 'ledger', ev.target.value)} className="form-input" style={{margin:0}}>
                      <option value="">Select Ledger</option>
                      {LEDGERS.map(l => <option key={l} value={l}>{l}</option>)}
                    </select>
                  </td>
                  <td><input type="number" value={e.debit} onChange={ev => updateEntry(e.id, 'debit', ev.target.value)} placeholder="0.00" className="form-input" style={{margin:0}} min="0" step="0.01" /></td>
                  <td><input type="number" value={e.credit} onChange={ev => updateEntry(e.id, 'credit', ev.target.value)} placeholder="0.00" className="form-input" style={{margin:0}} min="0" step="0.01" /></td>
                  <td><button type="button" onClick={() => removeEntry(e.id)} style={{background:'transparent',border:'none',cursor:'pointer',color:'#e53e3e',fontSize:16}}>✕</button></td>
                </tr>
              ))}
              <tr style={{fontWeight:'bold', background:'#f5f7fa'}}>
                <td>Total</td>
                <td style={{color: isBalanced ? '#2e7d32' : '#b71c1c'}}>₹{totalDebit.toFixed(2)}</td>
                <td style={{color: isBalanced ? '#2e7d32' : '#b71c1c'}}>₹{totalCredit.toFixed(2)}</td>
                <td><span style={{color: isBalanced ? '#2e7d32' : '#b71c1c', fontSize:13}}>{isBalanced ? '✓ Balanced' : '✗ Not Balanced'}</span></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <div className="form-actions">
        <button className="btn-draft" onClick={() => handleSubmit('draft')} disabled={loading}>Save Draft</button>
        <button className="btn-submit" onClick={() => handleSubmit('approved')} disabled={loading || !isBalanced}>Post Journal</button>
      </div>
    </div>
  );
};

export default CreateJournal;
