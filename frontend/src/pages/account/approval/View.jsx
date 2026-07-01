import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useCompany } from '../../../context/CompanyContext';

const P   = '#104f4f';
const BG  = '#F5F7FB';
const BD  = '#E5EAF2';
const F   = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const fmt = n => (parseFloat(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });
const fmtD = d => { if (!d) return '—'; const dt = new Date(d); return isNaN(dt) ? d : `${String(dt.getDate()).padStart(2,'0')}-${String(dt.getMonth()+1).padStart(2,'0')}-${dt.getFullYear()}`; };

const STATUS_MAP = {
  confirmed: { bg: '#ECFDF5', color: '#059669', dot: '#059669', border: '#A7F3D0', label: 'Confirmed' },
  rejected:  { bg: '#FEF2F2', color: '#DC2626', dot: '#DC2626', border: '#FECACA', label: 'Rejected'  },
  pending:   { bg: '#FFFBEB', color: '#D97706', dot: '#D97706', border: '#FDE68A', label: 'Pending'   },
  draft:     { bg: '#FFFBEB', color: '#D97706', dot: '#D97706', border: '#FDE68A', label: 'Draft'     },
};

export default function ApprovalView() {
  const { selectedCompany } = useCompany();
  const cid = selectedCompany?.companyId;

  const [payments,   setPayments]   = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState('');
  const [approving,  setApproving]  = useState({});
  const [filterType, setFilterType] = useState('all');

  const load = useCallback(async () => {
    if (!cid) return;
    setLoading(true); setError('');
    try {
      const r = await axios.get(`/api/accounts/payments?companyId=${cid}`);
      setPayments(r.data.filter(p => p.type === 'payment' || p.type === 'receipt'));
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [cid]);

  useEffect(() => { load(); }, [load]);

  const approve = async (p) => {
    setApproving(a => ({ ...a, [p.paymentId]: 'approving' }));
    try {
      await axios.put(`/api/accounts/payments/${p.paymentId}?companyId=${cid}`, { ...p, status: 'confirmed' });
      setPayments(ps => ps.map(x => x.paymentId === p.paymentId ? { ...x, status: 'confirmed' } : x));
    } catch (e) { setError('Approve failed: ' + e.message); }
    finally { setApproving(a => ({ ...a, [p.paymentId]: null })); }
  };

  const reject = async (p) => {
    setApproving(a => ({ ...a, [p.paymentId]: 'rejecting' }));
    try {
      await axios.put(`/api/accounts/payments/${p.paymentId}?companyId=${cid}`, { ...p, status: 'rejected' });
      setPayments(ps => ps.map(x => x.paymentId === p.paymentId ? { ...x, status: 'rejected' } : x));
    } catch (e) { setError('Reject failed: ' + e.message); }
    finally { setApproving(a => ({ ...a, [p.paymentId]: null })); }
  };

  const filtered = payments.filter(p => {
    if (filterType === 'pending')   return p.status === 'pending' || p.status === 'draft';
    if (filterType === 'confirmed') return p.status === 'confirmed';
    if (filterType === 'rejected')  return p.status === 'rejected';
    if (filterType === 'payment')   return p.type === 'payment';
    if (filterType === 'receipt')   return p.type === 'receipt';
    return true;
  });

  const pending   = payments.filter(p => p.status === 'pending' || p.status === 'draft').length;
  const confirmed = payments.filter(p => p.status === 'confirmed').length;
  const rejected  = payments.filter(p => p.status === 'rejected').length;

  const th = { padding: '8px 10px', color: '#fff', fontWeight: 700, fontSize: 11,
    textAlign: 'left', whiteSpace: 'nowrap', background: P, borderRight: 'none' };
  const td = { padding: '8px 10px', borderBottom: `1px solid ${BD}`, fontSize: 12, fontFamily: F };

  return (
    <div style={{ background: BG, minHeight: '100%', fontFamily: F }}>

      {/* Header */}
      <div style={{ background: P, padding: '14px 20px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', fontWeight: 500,
            textTransform: 'uppercase', letterSpacing: '0.6px' }}>Finance</div>
          <div style={{ fontSize: 15, fontWeight: 800, color: '#fff' }}>Payment & Receipt Approval</div>
        </div>
        <button onClick={load}
          style={{ height: 32, padding: '0 14px', fontSize: 12, fontFamily: F, cursor: 'pointer',
            background: 'rgba(255,255,255,0.12)', color: '#fff',
            border: '1px solid rgba(255,255,255,0.25)', borderRadius: 6, fontWeight: 600 }}>
          ↻ Refresh
        </button>
      </div>

      {error && (
        <div style={{ margin: '10px 16px 0', padding: '8px 14px', fontSize: 12, fontFamily: F,
          background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA', borderRadius: 6 }}>
          {error}
        </div>
      )}

      {/* KPI Strip */}
      <div style={{ background: '#fff', borderBottom: `1px solid ${BD}`, padding: '12px 20px',
        display: 'flex', gap: 16 }}>
        {[
          { label: 'Pending Approval', val: pending,          color: '#D97706', bg: '#FFFBEB', bd: '#FDE68A', fk: 'pending' },
          { label: 'Confirmed',        val: confirmed,         color: '#059669', bg: '#ECFDF5', bd: '#A7F3D0', fk: 'confirmed' },
          { label: 'Rejected',         val: rejected,          color: '#DC2626', bg: '#FEF2F2', bd: '#FECACA', fk: 'rejected' },
          { label: 'Total Entries',    val: payments.length,   color: P,         bg: '#EEF4FF', bd: '#BFDBFE', fk: 'all' },
          { label: 'Payments',         val: payments.filter(p=>p.type==='payment').length, color: '#DC2626', bg: '#FEF2F2', bd: '#FECACA', fk: 'payment' },
          { label: 'Receipts',         val: payments.filter(p=>p.type==='receipt').length, color: '#059669', bg: '#ECFDF5', bd: '#A7F3D0', fk: 'receipt' },
        ].map(c => (
          <div key={c.label} onClick={() => setFilterType(filterType === c.fk ? 'all' : c.fk)}
            style={{ background: filterType === c.fk ? c.bd : c.bg, border: `1px solid ${c.bd}`,
              borderRadius: 8, padding: '8px 14px', minWidth: 100, textAlign: 'center',
              cursor: 'pointer', transition: 'background 0.15s' }}>
            <div style={{ fontSize: 10, color: c.color, fontWeight: 600, marginBottom: 2,
              textTransform: 'uppercase', letterSpacing: '0.4px' }}>{c.label}</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: c.color }}>{c.val}</div>
          </div>
        ))}
      </div>

      <div style={{ padding: '12px 16px' }}>
        {/* Filter bar */}
        <div style={{ background: '#fff', border: `1px solid ${BD}`, borderRadius: 8, padding: '10px 14px',
          marginBottom: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>Filter:</span>
          <select value={filterType} onChange={e => setFilterType(e.target.value)}
            style={{ height: 32, padding: '0 10px', border: `1px solid ${BD}`, borderRadius: 6,
              fontSize: 12, fontFamily: F, outline: 'none', background: '#fff', cursor: 'pointer' }}>
            <option value="all">All</option>
            <option value="pending">Pending Approval</option>
            <option value="confirmed">Confirmed</option>
            <option value="rejected">Rejected</option>
            <option value="payment">Payments Only</option>
            <option value="receipt">Receipts Only</option>
          </select>
          <span style={{ marginLeft: 'auto', fontSize: 12, color: '#6B7280' }}>
            {filtered.length} entr{filtered.length !== 1 ? 'ies' : 'y'}
          </span>
        </div>

        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#9CA3AF', fontSize: 14 }}>Loading…</div>
        ) : (
          <div style={{ background: '#fff', border: `1px solid ${BD}`, borderRadius: 8,
            overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, fontFamily: F }}>
              <thead>
                <tr>
                  {['#', 'Date', 'Type', 'Party', 'Reference', 'Mode', 'Amount (₹)', 'Notes', 'Status', 'Actions'].map((h, i) => (
                    <th key={i} style={{ ...th, textAlign: i === 6 ? 'right' : 'left' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr><td colSpan={10}
                    style={{ padding: 30, textAlign: 'center', color: '#9CA3AF', fontSize: 13 }}>
                    No entries found
                  </td></tr>
                )}
                {filtered.map((p, i) => {
                  const isPending  = p.status === 'pending' || p.status === 'draft';
                  const isApproving = approving[p.paymentId];
                  const isReceipt  = p.type === 'receipt';
                  const st = STATUS_MAP[p.status] || STATUS_MAP.pending;
                  return (
                    <tr key={p.paymentId}
                      style={{ background: i % 2 === 0 ? '#fff' : '#FAFBFC' }}
                      onMouseEnter={e => e.currentTarget.style.background = '#EEF4FF'}
                      onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? '#fff' : '#FAFBFC'}>
                      <td style={{ ...td, color: '#9CA3AF', fontSize: 11 }}>{i + 1}</td>
                      <td style={{ ...td, whiteSpace: 'nowrap' }}>{fmtD(p.date)}</td>
                      <td style={td}>
                        <span style={{ fontWeight: 700, fontSize: 11,
                          color: isReceipt ? '#059669' : '#DC2626' }}>
                          {isReceipt ? '▲ Receipt' : '▼ Payment'}
                        </span>
                      </td>
                      <td style={{ ...td, fontWeight: 600, color: '#111827' }}>{p.entityName || '—'}</td>
                      <td style={{ ...td, fontFamily: 'monospace', fontSize: 11, color: '#6B7280' }}>{p.referenceNo || '—'}</td>
                      <td style={td}>{p.paymentMode || '—'}</td>
                      <td style={{ ...td, textAlign: 'right', fontWeight: 800, fontSize: 13,
                        color: isReceipt ? '#059669' : '#DC2626' }}>₹{fmt(p.amount)}</td>
                      <td style={{ ...td, color: '#6B7280', fontSize: 11, maxWidth: 160,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.notes || '—'}</td>
                      <td style={td}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5,
                          padding: '3px 9px', borderRadius: 20, fontSize: 11, fontWeight: 700,
                          background: st.bg, color: st.color, border: `1px solid ${st.border}` }}>
                          <span style={{ width: 5, height: 5, borderRadius: '50%', background: st.dot }} />
                          {st.label}
                        </span>
                      </td>
                      <td style={{ ...td, whiteSpace: 'nowrap' }}>
                        {isPending ? (
                          <div style={{ display: 'flex', gap: 5 }}>
                            <button onClick={() => approve(p)} disabled={!!isApproving}
                              style={{ height: 28, padding: '0 10px', fontSize: 11, cursor: 'pointer',
                                background: '#ECFDF5', color: '#059669', border: '1px solid #A7F3D0',
                                borderRadius: 5, fontWeight: 600, fontFamily: F,
                                opacity: !!isApproving ? 0.6 : 1 }}>
                              {isApproving === 'approving' ? '…' : '✓ Approve'}
                            </button>
                            <button onClick={() => reject(p)} disabled={!!isApproving}
                              style={{ height: 28, padding: '0 10px', fontSize: 11, cursor: 'pointer',
                                background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA',
                                borderRadius: 5, fontWeight: 600, fontFamily: F,
                                opacity: !!isApproving ? 0.6 : 1 }}>
                              {isApproving === 'rejecting' ? '…' : '✕ Reject'}
                            </button>
                          </div>
                        ) : (
                          <span style={{ fontSize: 11, color: '#9CA3AF', fontStyle: 'italic' }}>
                            {p.status === 'confirmed' ? '✓ Done' : '✕ Rejected'}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
