import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { useCompany } from '../../../context/CompanyContext';
import ActivityDrawer from '../../../components/ActivityDrawer';

const F = "'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif";
const P = '#104f4f'; const BD = '#E5EAF2';
const fmt = n => (parseFloat(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });
const fmtD = ds => { if (!ds) return '—'; const d = new Date(ds); return isNaN(d) ? ds : `${String(d.getDate()).padStart(2,'0')}-${String(d.getMonth()+1).padStart(2,'0')}-${d.getFullYear()}`; };

const STATUS_COLORS = {
  draft:    { bg: '#fef9c3', color: '#92400e', border: '#fde68a' },
  approved: { bg: '#dcfce7', color: '#15803d', border: '#86efac' },
  cancelled:{ bg: '#fee2e2', color: '#991b1b', border: '#fca5a5' },
};

export default function DebitNoteView() {
  const { selectedCompany } = useCompany();
  const cid = selectedCompany?.companyId;
  const navigate = useNavigate();

  const [records,      setRecords]      = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [search,       setSearch]       = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [expanded,     setExpanded]     = useState(null);
  const [msg,          setMsg]          = useState('');
  const [activityRec,  setActivityRec]  = useState(null);

  const load = useCallback(async () => {
    if (!cid) return;
    setLoading(true);
    try {
      const { data } = await axios.get(`/api/accounts/debit-notes?companyId=${cid}`);
      setRecords(Array.isArray(data) ? data : []);
    } catch (e) { setMsg('Error: ' + e.message); }
    finally { setLoading(false); }
  }, [cid]);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this Debit Note?')) return;
    try { await axios.delete(`/api/accounts/debit-notes/${id}?companyId=${cid}`); load(); }
    catch (e) { setMsg('Error: ' + e.message); }
  };

  const handleStatusChange = async (rec, status) => {
    try {
      await axios.put(`/api/accounts/debit-notes/${rec.dnId}?companyId=${cid}`, { ...rec, status });
      load();
    } catch (e) { setMsg('Error: ' + e.message); }
  };

  let rows = records;
  if (statusFilter !== 'all') rows = rows.filter(r => r.status === statusFilter);
  if (search) {
    const q = search.toLowerCase();
    rows = rows.filter(r => (r.dnNo || '').toLowerCase().includes(q) || (r.vendorName || '').toLowerCase().includes(q) || (r.reason || '').toLowerCase().includes(q));
  }

  return (
    <div style={{ fontFamily: F, background: '#f0f4fb', minHeight: '100vh', padding: '14px 16px' }}>
      {/* Header */}
      <div style={{ background: '#fff', border: `1px solid ${BD}`, borderRadius: 10, padding: '12px 16px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 10.5, color: '#6b7280', marginBottom: 1 }}>Account</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#111827' }}>Debit Notes</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {['all', 'draft', 'approved', 'cancelled'].map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              style={{ height: 30, padding: '0 12px', borderRadius: 6, border: `1px solid ${statusFilter === s ? P : BD}`, background: statusFilter === s ? P : '#fff', color: statusFilter === s ? '#fff' : '#374151', fontSize: 11.5, fontWeight: 600, cursor: 'pointer', textTransform: 'capitalize', fontFamily: F }}>
              {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
          <div style={{ position: 'relative' }}>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…"
              style={{ height: 30, padding: '0 10px 0 28px', border: `1px solid ${BD}`, borderRadius: 6, fontSize: 12, fontFamily: F, outline: 'none', width: 180 }} />
            <span style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af', fontSize: 13 }}>🔍</span>
          </div>
          <button onClick={() => navigate('/account/debit-note/create')}
            style={{ height: 30, padding: '0 14px', background: P, border: 'none', borderRadius: 6, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: F }}>
            + Create Debit Note
          </button>
        </div>
      </div>

      {msg && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '8px 14px', marginBottom: 12, fontSize: 12, color: '#dc2626' }}>{msg}</div>}

      {/* Table */}
      <div style={{ background: '#fff', border: `1px solid ${BD}`, borderRadius: 10, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af', fontFamily: F }}>Loading…</div>
        ) : rows.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af', fontFamily: F }}>
            No debit notes found.{' '}
            <span onClick={() => navigate('/account/debit-note/create')} style={{ color: P, cursor: 'pointer', fontWeight: 600 }}>Create one →</span>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, fontFamily: F }}>
              <thead>
                <tr style={{ background: '#f8faff' }}>
                  {['DN No.', 'Date', 'Vendor', 'Linked PO Ref', 'Reason', 'Amount (₹)', 'Status', 'Actions'].map((h, i) => (
                    <th key={i} style={{ padding: '8px 10px', border: `1px solid ${BD}`, fontWeight: 700, color: '#374151', textAlign: i >= 5 ? 'right' : 'left', whiteSpace: 'nowrap', fontSize: 11 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, ri) => {
                  const sc = STATUS_COLORS[r.status] || STATUS_COLORS.draft;
                  const isOpen = expanded === r.dnId;
                  return (
                    <React.Fragment key={r.dnId}>
                      <tr style={{ background: ri % 2 === 0 ? '#fff' : '#f8faff', cursor: 'pointer' }} onClick={() => setActivityRec(r)}>
                        <td style={{ padding: '8px 10px', border: `1px solid ${BD}`, fontWeight: 700, color: P }}>{r.dnNo || `DN-${r.dnId}`}</td>
                        <td style={{ padding: '8px 10px', border: `1px solid ${BD}` }}>{fmtD(r.date)}</td>
                        <td style={{ padding: '8px 10px', border: `1px solid ${BD}`, fontWeight: 600 }}>{r.vendorName || '—'}</td>
                        <td style={{ padding: '8px 10px', border: `1px solid ${BD}`, color: '#6b7280' }}>{r.billRef || r.linkedPORef || '—'}</td>
                        <td style={{ padding: '8px 10px', border: `1px solid ${BD}`, color: '#6b7280', maxWidth: 180 }}>{r.reason || '—'}</td>
                        <td style={{ padding: '8px 10px', border: `1px solid ${BD}`, textAlign: 'right', fontWeight: 700, color: '#1e40af' }}>₹{fmt(r.grandTotal)}</td>
                        <td style={{ padding: '8px 10px', border: `1px solid ${BD}`, textAlign: 'right' }}>
                          <span style={{ background: sc.bg, color: sc.color, border: `1px solid ${sc.border}`, borderRadius: 5, padding: '2px 8px', fontSize: 10.5, fontWeight: 700 }}>
                            {(r.status || 'draft').toUpperCase()}
                          </span>
                        </td>
                        <td style={{ padding: '8px 10px', border: `1px solid ${BD}`, textAlign: 'right', whiteSpace: 'nowrap' }} onClick={e => e.stopPropagation()}>
                          <button onClick={() => setExpanded(isOpen ? null : r.dnId)} style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 5, color: P, padding: '3px 8px', fontSize: 11, cursor: 'pointer', marginRight: 4, fontFamily: F }}>
                            {isOpen ? '▲ Hide' : '▼ View'}
                          </button>
                          {r.status === 'draft' && (
                            <button onClick={() => handleStatusChange(r, 'approved')} style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 5, color: '#15803d', padding: '3px 8px', fontSize: 11, cursor: 'pointer', marginRight: 4, fontFamily: F }}>✓ Approve</button>
                          )}
                          <button onClick={() => handleDelete(r.dnId)} style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 5, color: '#dc2626', padding: '3px 8px', fontSize: 11, cursor: 'pointer', fontFamily: F }}>🗑</button>
                        </td>
                      </tr>
                      {isOpen && (
                        <tr>
                          <td colSpan={8} style={{ padding: 0, border: `1px solid ${BD}` }}>
                            <div style={{ background: '#f8faff', padding: '12px 14px' }}>
                              {r.narration && <div style={{ fontSize: 11.5, color: '#6b7280', marginBottom: 8 }}><strong>Narration:</strong> {r.narration}</div>}
                              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5 }}>
                                <thead>
                                  <tr style={{ background: P }}>
                                    {['Product', 'Qty', 'Unit', 'Rate', 'GST%', 'Taxable', 'GST Amt', 'Total'].map((h, i) => (
                                      <th key={i} style={{ padding: '5px 8px', color: '#fff', fontWeight: 700, textAlign: i >= 5 ? 'right' : 'left', border: '1px solid rgba(255,255,255,0.2)' }}>{h}</th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {(r.items || []).map((it, ii) => (
                                    <tr key={ii} style={{ background: ii % 2 === 0 ? '#fff' : '#f0f4fb' }}>
                                      <td style={{ padding: '5px 8px', border: `1px solid ${BD}` }}>{it.productName}</td>
                                      <td style={{ padding: '5px 8px', border: `1px solid ${BD}` }}>{it.qty}</td>
                                      <td style={{ padding: '5px 8px', border: `1px solid ${BD}` }}>{it.unit}</td>
                                      <td style={{ padding: '5px 8px', border: `1px solid ${BD}`, textAlign: 'right' }}>₹{fmt(it.rate)}</td>
                                      <td style={{ padding: '5px 8px', border: `1px solid ${BD}` }}>{it.gstPercent}%</td>
                                      <td style={{ padding: '5px 8px', border: `1px solid ${BD}`, textAlign: 'right' }}>₹{fmt(it.taxableAmt)}</td>
                                      <td style={{ padding: '5px 8px', border: `1px solid ${BD}`, textAlign: 'right' }}>₹{fmt(it.gstAmt)}</td>
                                      <td style={{ padding: '5px 8px', border: `1px solid ${BD}`, textAlign: 'right', fontWeight: 700, color: '#1e40af' }}>₹{fmt(it.totalAmt)}</td>
                                    </tr>
                                  ))}
                                  <tr style={{ background: '#eef3fb', fontWeight: 700 }}>
                                    <td colSpan={5} style={{ padding: '6px 8px', border: `1px solid ${BD}`, textAlign: 'right' }}>Totals:</td>
                                    <td style={{ padding: '6px 8px', border: `1px solid ${BD}`, textAlign: 'right' }}>₹{fmt(r.subTotal)}</td>
                                    <td style={{ padding: '6px 8px', border: `1px solid ${BD}`, textAlign: 'right' }}>₹{fmt(r.totalGST)}</td>
                                    <td style={{ padding: '6px 8px', border: `1px solid ${BD}`, textAlign: 'right', color: '#1e40af', fontSize: 13 }}>₹{fmt(r.grandTotal)}</td>
                                  </tr>
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
            <div style={{ padding: '8px 14px', background: '#f8faff', borderTop: `1px solid ${BD}`, fontSize: 11, color: '#6b7280' }}>
              {rows.length} debit note{rows.length !== 1 ? 's' : ''} {statusFilter !== 'all' ? `(${statusFilter})` : ''}
            </div>
          </div>
        )}
      </div>
      <ActivityDrawer record={activityRec} recordType="dn" onClose={() => setActivityRec(null)} />
    </div>
  );
}
