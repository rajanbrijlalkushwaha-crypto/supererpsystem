import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useCompany } from '../../../context/CompanyContext';

const fmt  = n => (parseFloat(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });
const fmtD = d => { if (!d) return '—'; const dt = new Date(d); return isNaN(dt) ? d : `${String(dt.getDate()).padStart(2,'0')}-${String(dt.getMonth()+1).padStart(2,'0')}-${dt.getFullYear()}`; };
const F    = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const BD   = '#E5EAF2';
const P    = '#2F6FED';

const btnSm = (color = P) => ({
  background: '#EEF4FF', border: `1px solid ${BD}`, color, padding: '0 10px',
  height: 24, fontSize: 11, fontFamily: F, cursor: 'pointer', borderRadius: 5,
  whiteSpace: 'nowrap', fontWeight: 600,
});

/* ── Print Payment Advice ── */
function printPaymentAdvice(row, type, companyData) {
  const paidLabel = type === 'client' ? 'Received' : 'Paid';
  const totalPaid = (row.linkedPayments || []).reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
  const balance   = row.orderTotal - totalPaid;

  const itemRows = (row.items || []).map((it, i) => {
    const base    = (parseFloat(it.qty || it.quantity) || 0) * (parseFloat(it.rate) || 0);
    const disc    = it.discountType === '%' ? base * (parseFloat(it.discount) || 0) / 100 : (parseFloat(it.discount) || 0);
    const taxable = base - disc;
    const gst     = taxable * (parseFloat(it.gstPercent) || 0) / 100;
    return `<tr><td>${i+1}</td><td>${it.itemName||it.description||'—'}</td><td>${it.hsnCode||'—'}</td>
      <td class="r">${it.qty||it.quantity||0} ${it.unit||''}</td>
      <td class="r">₹${fmt(it.rate)}</td><td class="r">${it.gstPercent||0}%</td>
      <td class="r">₹${fmt(taxable+gst)}</td></tr>`;
  }).join('');

  const pmtRows = (row.linkedPayments || []).map((p, i) => `<tr>
    <td>${i+1}</td><td>${fmtD(p.date)}</td><td>${p.referenceNo||'—'}</td>
    <td>${p.paymentMode||'—'}</td>
    <td class="r" style="color:#1b5e20;font-weight:bold">₹${fmt(p.amount)}</td>
    <td>${p.notes||'—'}</td></tr>`).join('');

  const html = `<!DOCTYPE html><html><head><title>Payment Advice</title><style>
    body{font-family:Arial,sans-serif;font-size:11px;margin:24px;color:#000}
    .co{font-size:16px;font-weight:bold;color:#2F6FED}.co-sub{font-size:10px;color:#555;margin-bottom:10px}
    .title{font-size:13px;font-weight:bold;text-align:center;padding:5px;border:2px solid #2F6FED;margin:8px 0;color:#2F6FED;letter-spacing:1px}
    .sect{font-size:11px;font-weight:bold;background:#2F6FED;color:#fff;padding:3px 8px;margin:10px 0 4px}
    table{width:100%;border-collapse:collapse;font-size:10px;margin-bottom:8px}
    th{background:#2F6FED;color:#fff;padding:4px 6px;text-align:left}
    th.r,td.r{text-align:right}
    td{padding:3px 6px;border-bottom:1px solid #eee}tr:nth-child(even){background:#f9f9f9}
    tfoot td{font-weight:bold;background:#f0f0f0;border-top:2px solid #2F6FED}
    .balance{border:2px solid #2F6FED;padding:8px 14px;text-align:center;flex:1}
    .footer{margin-top:24px;display:flex;justify-content:space-between;font-size:10px;color:#666;border-top:1px solid #ccc;padding-top:8px}
    @media print{body{margin:10px}}
  </style></head><body>
  <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #2F6FED;padding-bottom:8px;margin-bottom:6px">
    <div><div class="co">${companyData?.companyName||'Epsilon Enterprise'}</div>
    <div class="co-sub">${companyData?.address||''} ${companyData?.city||''} ${companyData?.state||''}<br>
    GST: ${companyData?.gstin||'—'} | PAN: ${companyData?.pan||'—'}</div></div>
    <div style="text-align:right;font-size:10px">
      <div style="font-size:12px;font-weight:bold;color:#2F6FED">PAYMENT ADVICE</div>
      <div>Date: ${new Date().toLocaleDateString('en-IN')}</div>
      <div>Ref: ${row.orderNo||row.orderId}</div>
    </div>
  </div>
  <div class="sect">${type==='client'?'CLIENT':'VENDOR'} DETAILS</div>
  <table><thead><tr><th>Name</th><th>Order No.</th><th>Order Date</th><th>Status</th></tr></thead>
  <tbody><tr><td><strong>${row.entityName}</strong></td><td>${row.orderNo||row.orderId}</td>
  <td>${fmtD(row.orderDate)}</td><td>${row.status||'—'}</td></tr></tbody></table>
  <div class="sect">ORDER ITEMS</div>
  <table><thead><tr><th>#</th><th>Item/Description</th><th>HSN</th><th class="r">Qty</th>
  <th class="r">Rate</th><th class="r">GST%</th><th class="r">Amount</th></tr></thead>
  <tbody>${itemRows||'<tr><td colspan="7" style="text-align:center;color:#888">No items</td></tr>'}</tbody>
  <tfoot><tr><td colspan="6" class="r">Order Total:</td><td class="r">₹${fmt(row.orderTotal)}</td></tr></tfoot></table>
  <div class="sect">PAYMENT HISTORY</div>
  ${pmtRows?`<table><thead><tr><th>#</th><th>Date</th><th>Reference</th><th>Mode</th><th class="r">Amount</th><th>Notes</th></tr></thead>
  <tbody>${pmtRows}</tbody>
  <tfoot><tr><td colspan="4" class="r">Total ${paidLabel}:</td><td class="r" style="color:#1b5e20">₹${fmt(totalPaid)}</td><td></td></tr></tfoot></table>`
  :'<p style="color:#888;font-size:10px">No payments recorded.</p>'}
  <div style="display:flex;gap:16px;margin-top:10px">
    <div class="balance"><div style="font-size:10px;color:#1565c0">Order Value</div><div style="font-size:20px;font-weight:bold;color:#1565c0">₹${fmt(row.orderTotal)}</div></div>
    <div class="balance"><div style="font-size:10px;color:#2e7d32">${paidLabel}</div><div style="font-size:20px;font-weight:bold;color:#2e7d32">₹${fmt(totalPaid)}</div></div>
    <div class="balance" style="border-color:${balance>0?'#cc0000':'#2e7d32'}">
      <div style="font-size:10px;color:${balance>0?'#cc0000':'#2e7d32'}">Balance Due</div>
      <div style="font-size:20px;font-weight:bold;color:${balance>0?'#cc0000':'#2e7d32'}">${balance>0?'₹'+fmt(balance):'✓ Cleared'}</div>
    </div>
  </div>
  <div class="footer"><span>Epsilon ERP</span><span>Printed: ${new Date().toLocaleString('en-IN')}</span>
  <span style="border-top:1px solid #000;padding-top:4px;min-width:140px;text-align:center">Authorised Signatory</span></div>
  </body></html>`;
  const w = window.open('','_blank'); w.document.write(html); w.document.close(); w.onload = () => w.print();
}

/* ── Order Row with payment entries ── */
const OrderRow = ({ row, type, companyData, onDeletePayment }) => {
  const [expanded, setExpanded] = useState(false);
  const [deleting, setDeleting] = useState(null);

  const paid      = type === 'client' ? (row.received || 0) : (row.paid || 0);
  const paidLabel = type === 'client' ? 'Received' : 'Paid';
  const payments  = row.linkedPayments || [];

  const handleDelete = async (paymentId) => {
    if (!window.confirm('Delete this payment entry? This cannot be undone.')) return;
    setDeleting(paymentId);
    try {
      await axios.delete(`/api/accounts/payments/${paymentId}`);
      onDeletePayment();
    } catch (e) {
      alert('Error deleting: ' + e.message);
    }
    setDeleting(null);
  };

  return (
    <>
      <tr
        style={{ cursor: 'pointer', background: row.due <= 0 ? '#f2fff2' : undefined }}
        onClick={() => setExpanded(p => !p)}
      >
        <td style={{ padding: '4px 8px' }}>
          <span style={{ fontSize: 11, color: '#888', marginRight: 5 }}>{expanded ? '▼' : '▶'}</span>
          <strong style={{ color: '#1a3c6e', fontFamily: 'monospace', fontSize: 11 }}>
            {type === 'client' ? 'SO' : 'PO'} #{row.orderId}
          </strong>
          {row.orderNo && row.orderNo !== String(row.orderId) &&
            <span style={{ fontSize: 10, color: '#666', marginLeft: 6 }}>{row.orderNo}</span>}
        </td>
        <td style={{ padding: '4px 8px', fontWeight: 600 }}>{row.entityName || '—'}</td>
        <td style={{ padding: '4px 8px' }}>{fmtD(row.orderDate)}</td>
        <td style={{ padding: '4px 8px', textAlign: 'right', fontWeight: 600 }}>₹{fmt(row.orderTotal)}</td>
        <td style={{ padding: '4px 8px', textAlign: 'right', color: '#2e7d32', fontWeight: 600 }}>₹{fmt(paid)}</td>
        <td style={{ padding: '4px 8px', textAlign: 'right' }}>
          {row.due <= 0
            ? <span style={{ color: '#2e7d32', fontWeight: 700 }}>✓ Cleared</span>
            : <span style={{ color: '#b71c1c', fontWeight: 700 }}>₹{fmt(row.due)}</span>}
        </td>
        <td style={{ padding: '4px 8px' }}>
          <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 3,
            background: row.status === 'approved' ? '#d8f0d8' : '#fff3e0',
            color: row.status === 'approved' ? '#005500' : '#b06000',
            border: '1px solid #ccc' }}>{row.status}</span>
        </td>
        <td style={{ padding: '4px 6px' }}>
          <button onClick={e => { e.stopPropagation(); printPaymentAdvice(row, type, companyData); }}
            style={btnSm('#00008b')}>🖨 Advice</button>
        </td>
      </tr>

      {/* Expanded: payment entries with delete */}
      {expanded && (
        <tr>
          <td colSpan={8} style={{ padding: 0, background: '#F5F8FF' }}>
            <div style={{ padding: '8px 14px' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: P, marginBottom: 6 }}>
                Payment / Receipt Entries ({payments.length})
              </div>
              {payments.length === 0 ? (
                <div style={{ fontSize: 11, color: '#888', fontStyle: 'italic' }}>No entries linked.</div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                  <thead>
                    <tr style={{ background: '#1a3c6e' }}>
                      {['#', 'Date', 'Reference No.', 'Mode', 'Amount (₹)', 'Notes', 'Status', ''].map((h, i) => (
                        <th key={i} style={{ padding: '3px 8px', color: '#fff', fontWeight: 700, fontSize: 10,
                          textAlign: i >= 4 && i <= 5 ? (i === 4 ? 'right' : 'left') : 'left',
                          borderRight: '1px solid #2a5a8a', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((p, i) => (
                      <tr key={p.paymentId || i} style={{ background: i % 2 === 0 ? '#fff' : '#EEF4FF' }}>
                        <td style={{ padding: '3px 8px', color: '#888' }}>{i + 1}</td>
                        <td style={{ padding: '3px 8px' }}>{fmtD(p.date)}</td>
                        <td style={{ padding: '3px 8px', fontWeight: 600 }}>{p.referenceNo || '—'}</td>
                        <td style={{ padding: '3px 8px' }}>{p.paymentMode || '—'}</td>
                        <td style={{ padding: '3px 8px', textAlign: 'right', color: '#2e7d32', fontWeight: 700 }}>
                          ₹{fmt(p.amount)}
                        </td>
                        <td style={{ padding: '3px 8px', color: '#555' }}>{p.notes || '—'}</td>
                        <td style={{ padding: '3px 8px' }}>
                          <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3,
                            background: p.status === 'confirmed' ? '#d8f0d8' : '#fff3e0',
                            color: p.status === 'confirmed' ? '#005500' : '#b06000',
                            border: '1px solid #ccc', fontWeight: 700 }}>
                            {p.status || 'pending'}
                          </span>
                        </td>
                        <td style={{ padding: '3px 6px', textAlign: 'center' }}>
                          <button
                            onClick={() => handleDelete(p.paymentId)}
                            disabled={deleting === p.paymentId}
                            style={{ background: '#ffe0e0', color: '#b71c1c', border: '1px solid #cc8888',
                              padding: '0 8px', fontSize: 10, cursor: 'pointer', height: 20, borderRadius: 3,
                              fontWeight: 700, opacity: deleting === p.paymentId ? 0.5 : 1 }}>
                            {deleting === p.paymentId ? '…' : '✕ Delete'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: '#E8F0FE', fontWeight: 700 }}>
                      <td colSpan={4} style={{ padding: '4px 8px', textAlign: 'right', fontSize: 11 }}>
                        Total {paidLabel}:
                      </td>
                      <td style={{ padding: '4px 8px', textAlign: 'right', color: '#2e7d32' }}>
                        ₹{fmt(paid)}
                      </td>
                      <td colSpan={3} style={{ padding: '4px 8px', textAlign: 'right', color: row.due <= 0 ? '#2e7d32' : '#b71c1c', fontSize: 11 }}>
                        Balance Due: <strong>{row.due <= 0 ? '✓ Cleared' : `₹${fmt(row.due)}`}</strong>
                      </td>
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
};

/* ══════════════════════════════════════════════════════════ */
const ViewDues = () => {
  const { selectedCompany } = useCompany();
  const cid = selectedCompany?.companyId;

  const [activeTab,   setActiveTab]   = useState('client');
  const [data,        setData]        = useState({ clientDues: [], vendorDues: [] });
  const [loading,     setLoading]     = useState(true);
  const [message,     setMessage]     = useState('');
  const [showCleared, setShowCleared] = useState(false);

  const fetchAll = useCallback(async () => {
    if (!cid) return;
    setLoading(true); setMessage('');
    try {
      const res = await axios.get(`/api/accounts/dues?companyId=${cid}`);
      setData(res.data);
    } catch (e) { setMessage('Error: ' + e.message); }
    finally { setLoading(false); }
  }, [cid]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const rows     = activeTab === 'client' ? data.clientDues : data.vendorDues;
  const filtered = showCleared ? rows : rows.filter(r => r.due > 0);

  const totalOrderValue = filtered.reduce((s, r) => s + r.orderTotal, 0);
  const totalPaid       = filtered.reduce((s, r) => s + (activeTab === 'client' ? (r.received || 0) : (r.paid || 0)), 0);
  const totalDue        = filtered.reduce((s, r) => s + Math.max(0, r.due), 0);

  const tabBtn = (tab, label) => (
    <button onClick={() => setActiveTab(tab)} style={{
      padding: '8px 20px', fontWeight: tab === activeTab ? 700 : 500, fontSize: 12, fontFamily: F,
      background: activeTab === tab ? '#fff' : 'transparent',
      color: activeTab === tab ? P : '#6B7280',
      border: 'none', cursor: 'pointer',
      borderRadius: '7px 7px 0 0',
      borderBottom: activeTab === tab ? `2px solid ${P}` : '2px solid transparent',
      marginBottom: -2, position: 'relative', zIndex: activeTab === tab ? 1 : 0,
    }}>{label}</button>
  );

  if (loading) return (
    <div style={{ padding: 40, textAlign: 'center', fontFamily: F, color: '#666' }}>Loading…</div>
  );

  return (
    <div style={{ fontFamily: F, fontSize: 12, padding: 8 }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontWeight: 700, fontSize: 14, color: P }}>Outstanding Dues</span>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <label style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}>
            <input type="checkbox" checked={showCleared} onChange={e => setShowCleared(e.target.checked)} />
            Show cleared
          </label>
          <button style={{ ...btnSm(), background: P, color: '#fff', border: 'none' }} onClick={fetchAll}>
            ↻ Refresh
          </button>
        </div>
      </div>

      {message && (
        <div style={{ background: '#ffe0e0', border: '1px solid #cc4444', color: '#880000',
          padding: '4px 8px', marginBottom: 8, fontSize: 11 }}>{message}</div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: `2px solid ${BD}` }}>
        {tabBtn('client', `📥 Receivable (Client Dues) — ${data.clientDues.length}`)}
        {tabBtn('vendor', `📤 Payable (Vendor Dues) — ${data.vendorDues.length}`)}
      </div>

      {/* Table */}
      <div style={{ background: '#fff', border: `1px solid ${BD}`, borderTop: 'none',
        borderRadius: '0 0 8px 8px', overflowX: 'auto' }}>
        {filtered.length === 0 ? (
          <div style={{ padding: 30, textAlign: 'center', color: '#888', fontStyle: 'italic' }}>
            {showCleared ? 'No linked orders found.' : 'No outstanding dues with linked payments.'}
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr style={{ background: P }}>
                {['Order ID / No.', activeTab === 'client' ? 'Client' : 'Vendor',
                  'Date', 'Order Value (₹)',
                  activeTab === 'client' ? 'Received (₹)' : 'Paid (₹)',
                  'Due (₹)', 'Status', 'Print'
                ].map((h, i) => (
                  <th key={i} style={{ padding: '4px 8px', color: '#fff', fontWeight: 700, fontSize: 10,
                    textAlign: [3,4,5].includes(i) ? 'right' : 'left',
                    borderRight: '1px solid #4a6a7a' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(row => (
                <OrderRow
                  key={row.orderId}
                  row={row}
                  type={activeTab}
                  companyData={selectedCompany}
                  onDeletePayment={fetchAll}
                />
              ))}
            </tbody>
            <tfoot>
              <tr style={{ fontWeight: 700, background: '#F0F4FF' }}>
                <td colSpan={3} style={{ padding: '5px 8px', textAlign: 'right' }}>Totals:</td>
                <td style={{ padding: '5px 8px', textAlign: 'right' }}>₹{fmt(totalOrderValue)}</td>
                <td style={{ padding: '5px 8px', textAlign: 'right', color: '#2e7d32' }}>₹{fmt(totalPaid)}</td>
                <td style={{ padding: '5px 8px', textAlign: 'right', color: '#b71c1c' }}>₹{fmt(totalDue)}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        )}
      </div>

      {/* Summary cards */}
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        {[
          { label: 'Total Order Value', val: `₹${fmt(totalOrderValue)}`, color: '#1565c0', bg: '#e3f2fd', bd: '#1e88e5' },
          { label: activeTab === 'client' ? 'Total Received' : 'Total Paid', val: `₹${fmt(totalPaid)}`, color: '#2e7d32', bg: '#e8f5e9', bd: '#4caf50' },
          { label: 'Total Due', val: `₹${fmt(totalDue)}`, color: '#b71c1c', bg: '#fbe9e7', bd: '#ef5350' },
        ].map(c => (
          <div key={c.label} style={{ flex: 1, background: c.bg, border: `2px solid ${c.bd}`, padding: '6px 12px', textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: c.color }}>{c.label}</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: c.color }}>{c.val}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ViewDues;
