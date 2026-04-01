import React, { useState, useEffect } from 'react';
import axios from 'axios';

const PAYMENT_MODES = ['Cash', 'Bank Transfer', 'Cheque', 'UPI', 'NEFT', 'RTGS'];

const fmt = (n) => (parseFloat(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });

const calcOrderTotal = (items = []) =>
  items.reduce((s, it) => {
    const amt = (parseFloat(it.quantity) || 0) * (parseFloat(it.rate) || 0);
    return s + amt + amt * (parseFloat(it.gstPercent) || 0) / 100;
  }, 0);

const CreateReceipt = () => {
  const [clients, setClients] = useState([]);
  const [orders, setOrders] = useState([]);
  const [selectedClient, setSelectedClient] = useState(null);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    amount: '',
    paymentMode: 'Bank Transfer',
    referenceNo: '',
    notes: '',
  });
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    axios.get('/api/clients').then(r => setClients(r.data.filter(c => c.status === 'approved'))).catch(() => {});
  }, []);

  const handleClientChange = async (e) => {
    const clientId = e.target.value;
    const client = clients.find(c => String(c.clientId) === clientId);
    setSelectedClient(client || null);
    setSelectedOrder(null);
    setOrders([]);
    if (!clientId) return;
    try {
      const res = await axios.get('/api/sales-orders');
      const filtered = res.data.filter(o => String(o.clientId) === clientId);
      setOrders(filtered);
    } catch {}
  };

  const handleOrderChange = (e) => {
    const orderId = e.target.value;
    const order = orders.find(o => String(o.orderId) === orderId);
    setSelectedOrder(order || null);
    if (order) {
      const total = calcOrderTotal(order.items);
      setForm(p => ({ ...p, amount: total.toFixed(2) }));
    }
  };

  const handleChange = e => setForm(p => ({ ...p, [e.target.name]: e.target.value }));

  const handleSubmit = async () => {
    if (!selectedClient || !selectedOrder || !form.amount) {
      setMessage('Please select client, sales order, and enter amount.');
      return;
    }
    try {
      setLoading(true);
      setMessage('');
      const res = await axios.post('/api/accounts/payments', {
        ...form,
        type: 'receipt',
        entityType: 'client',
        entityId: selectedClient.clientId,
        entityName: selectedClient.companyName,
        orderId: selectedOrder.orderId,
        orderType: 'sales',
        status: 'confirmed',
      });
      setMessage(`Receipt recorded! ID: ${res.data.paymentId}`);
      setSelectedClient(null);
      setSelectedOrder(null);
      setOrders([]);
      setForm({ date: new Date().toISOString().slice(0, 10), amount: '', paymentMode: 'Bank Transfer', referenceNo: '', notes: '' });
    } catch (e) {
      setMessage('Error: ' + (e.response?.data?.error || e.message));
    } finally { setLoading(false); }
  };

  const orderTotal = selectedOrder ? calcOrderTotal(selectedOrder.items) : 0;

  return (
    <div className="client-form-page">
      <h2 className="form-title">Record Client Receipt</h2>
      {message && <div className={message.startsWith('Error') ? 'error-message' : 'success-message'}>{message}</div>}

      <div className="form-section">
        <div className="form-section-title">Select Client & Sales Order</div>
        <div className="form-grid">
          <div className="form-group">
            <label>Client *</label>
            <select onChange={handleClientChange} value={selectedClient?.clientId || ''} className="form-input">
              <option value="">-- Select Client --</option>
              {clients.map(c => (
                <option key={c.clientId} value={c.clientId}>{c.companyName} ({c.clientId})</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Sales Order *</label>
            <select onChange={handleOrderChange} value={selectedOrder?.orderId || ''} className="form-input" disabled={!selectedClient}>
              <option value="">-- Select Sales Order --</option>
              {orders.map(o => (
                <option key={o.orderId} value={o.orderId}>
                  SO #{o.orderId} — {o.orderDate} — ₹{fmt(calcOrderTotal(o.items))}
                </option>
              ))}
            </select>
          </div>
        </div>

        {selectedOrder && (
          <div style={{ background: '#f0fff4', border: '1px solid #a7f3c9', borderRadius: 8, padding: '12px 16px', marginTop: 8 }}>
            <div style={{ fontWeight: 600, marginBottom: 8, color: '#1a6e3c' }}>SO #{selectedOrder.orderId} Details</div>
            <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#c7f3db' }}>
                  <th style={{ padding: '4px 8px', textAlign: 'left' }}>Product / Description</th>
                  <th style={{ padding: '4px 8px', textAlign: 'right' }}>Qty</th>
                  <th style={{ padding: '4px 8px', textAlign: 'right' }}>Rate</th>
                  <th style={{ padding: '4px 8px', textAlign: 'right' }}>GST%</th>
                  <th style={{ padding: '4px 8px', textAlign: 'right' }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {(selectedOrder.items || []).map((it, i) => {
                  const base = (parseFloat(it.quantity) || 0) * (parseFloat(it.rate) || 0);
                  const gst = base * (parseFloat(it.gstPercent) || 0) / 100;
                  return (
                    <tr key={i} style={{ borderBottom: '1px solid #c7f3db' }}>
                      <td style={{ padding: '4px 8px' }}>{it.description}</td>
                      <td style={{ padding: '4px 8px', textAlign: 'right' }}>{it.quantity} {it.unit}</td>
                      <td style={{ padding: '4px 8px', textAlign: 'right' }}>₹{fmt(it.rate)}</td>
                      <td style={{ padding: '4px 8px', textAlign: 'right' }}>{it.gstPercent}%</td>
                      <td style={{ padding: '4px 8px', textAlign: 'right' }}>₹{fmt(base + gst)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={{ fontWeight: 700, background: '#c7f3db' }}>
                  <td colSpan={4} style={{ padding: '6px 8px', textAlign: 'right' }}>Total Order Value:</td>
                  <td style={{ padding: '6px 8px', textAlign: 'right', color: '#1a6e3c' }}>₹{fmt(orderTotal)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      <div className="form-section">
        <div className="form-section-title">Receipt Details</div>
        <div className="form-grid">
          <div className="form-group">
            <label>Receipt Date *</label>
            <input type="date" name="date" value={form.date} onChange={handleChange} className="form-input" />
          </div>
          <div className="form-group">
            <label>Amount Received (₹) *</label>
            <input type="number" name="amount" value={form.amount} onChange={handleChange} placeholder="0.00" className="form-input" min="0" step="0.01" />
          </div>
          <div className="form-group">
            <label>Payment Mode</label>
            <select name="paymentMode" value={form.paymentMode} onChange={handleChange} className="form-input">
              {PAYMENT_MODES.map(m => <option key={m}>{m}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Reference / Cheque No.</label>
            <input type="text" name="referenceNo" value={form.referenceNo} onChange={handleChange} placeholder="e.g. TXN-123" className="form-input" />
          </div>
        </div>
        <div className="form-group" style={{ marginTop: 8 }}>
          <label>Notes</label>
          <textarea name="notes" value={form.notes} onChange={handleChange} className="form-input" rows={2} />
        </div>
      </div>

      <div className="form-actions">
        <button className="btn-submit" onClick={handleSubmit} disabled={loading}>
          {loading ? 'Saving...' : 'Record Receipt'}
        </button>
      </div>
    </div>
  );
};

export default CreateReceipt;
