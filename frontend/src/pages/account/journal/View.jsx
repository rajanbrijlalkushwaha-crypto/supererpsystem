import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { useCompany } from '../../../context/CompanyContext';
import { orderIndex, orderDetails } from './orderInfo';
import { OrderCard } from './Create';

const F = "'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif";
const P = '#104f4f'; const BD = '#E5EAF2';
const fmt = n => (parseFloat(n) || 0).toFixed(2);
const fmtD = ds => { if (!ds) return '—'; const d = new Date(ds); return isNaN(d) ? ds : `${String(d.getDate()).padStart(2,'0')}-${String(d.getMonth()+1).padStart(2,'0')}-${d.getFullYear()}`; };

const STATUS_COLORS = {
  draft:  { bg: '#fef9c3', color: '#92400e', border: '#fde68a' },
  posted: { bg: '#eff6ff', color: '#1e40af', border: '#bfdbfe' },
  approved:{ bg: '#dcfce7', color: '#15803d', border: '#86efac' },
};

export default function ViewJournals() {
  const { selectedCompany } = useCompany();
  const cid = selectedCompany?.companyId;
  const navigate = useNavigate();

  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [expanded, setExpanded] = useState(null);
  const [msg, setMsg] = useState('');
  const [orders, setOrders] = useState({ so: [], po: [] });   // for the linked order's vendor / client details

  const load = useCallback(async () => {
    if (!cid) return;
    setLoading(true);
    try {
      const { data } = await axios.get(`/api/accounts/journals?companyId=${cid}`);
      setRecords(Array.isArray(data) ? data : []);
      const [so, po] = await Promise.all([axios.get(`/api/sales-orders?companyId=${cid}`).catch(() => ({ data: [] })), axios.get(`/api/purchase-orders?companyId=${cid}`).catch(() => ({ data: [] }))]);
      setOrders({ so: Array.isArray(so.data) ? so.data : [], po: Array.isArray(po.data) ? po.data : [] });
    } catch (e) { setMsg('Error: ' + e.message); }
    finally { setLoading(false); }
  }, [cid]);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this journal entry?')) return;
    try { await axios.delete(`/api/accounts/journals/${id}?companyId=${cid}`); load(); }
    catch (e) { setMsg('Error: ' + e.message); }
  };

  const idx = React.useMemo(() => orderIndex(orders.so, orders.po), [orders]);
  const detailOf = r => (r.type === 'order' && r.orderId ? orderDetails(idx, r.orderLinkType || 'PO', r.orderId) : null);
  let rows = records;
  if (statusFilter !== 'all') rows = rows.filter(r => r.status === statusFilter);
  if (search) {
    const q = search.toLowerCase();
    rows = rows.filter(r => { const d = detailOf(r); return [r.journalId, r.narration, r.refNo, r.type, d?.no, d?.fileNo, d?.vendor, d?.client, d?.clientPO, d?.material].join(' ').toLowerCase().includes(q); });
  }

  return (
    <div style={{ fontFamily: F, background: '#f0f4fb', minHeight: '100vh', padding: '14px 16px' }}>
      {/* Header */}
      <div style={{ background: '#fff', border: `1px solid ${BD}`, borderRadius: 10, padding: '12px 16px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 10.5, color: '#6b7280', marginBottom: 1 }}>Account</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#111827' }}>Journal Entries</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {['all', 'draft', 'posted'].map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              style={{ height: 30, padding: '0 12px', borderRadius: 6, border: `1px solid ${statusFilter === s ? P : BD}`, background: statusFilter === s ? P : '#fff', color: statusFilter === s ? '#fff' : '#374151', fontSize: 11.5, fontWeight: 600, cursor: 'pointer', fontFamily: F }}>
              {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
          <div style={{ position: 'relative' }}>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search journals…"
              style={{ height: 30, padding: '0 10px 0 28px', border: `1px solid ${BD}`, borderRadius: 6, fontSize: 12, fontFamily: F, outline: 'none', width: 200 }} />
            <span style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af', fontSize: 13 }}>🔍</span>
          </div>
          <button onClick={() => navigate('/account/journal/create')}
            style={{ height: 30, padding: '0 14px', background: P, border: 'none', borderRadius: 6, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: F }}>
            + Create Journal
          </button>
        </div>
      </div>

      {msg && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '8px 14px', marginBottom: 12, fontSize: 12, color: '#dc2626' }}>{msg}</div>}

      <div style={{ background: '#fff', border: `1px solid ${BD}`, borderRadius: 10, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>Loading…</div>
        ) : rows.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>
            No journal entries found.{' '}
            <span onClick={() => navigate('/account/journal/create')} style={{ color: P, cursor: 'pointer', fontWeight: 600 }}>Create one →</span>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, fontFamily: F }}>
              <thead>
                <tr style={{ background: '#f8faff' }}>
                  {['#', 'Type', 'Date', 'Ref No.', 'Narration', 'Linked Order', 'Total Debit (₹)', 'Total Credit (₹)', 'Status', 'Actions'].map((h, i) => (
                    <th key={i} style={{ padding: '8px 10px', border: `1px solid ${BD}`, fontWeight: 700, color: '#374151', textAlign: i >= 6 ? 'right' : 'left', whiteSpace: 'nowrap', fontSize: 11 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, ri) => {
                  const sc = STATUS_COLORS[r.status] || STATUS_COLORS.draft;
                  const isOpen = expanded === r.journalId;
                  const debit  = r.totalDebit  || (r.entries||[]).filter(e => parseFloat(e.debit) > 0).reduce((s, e) => s + (parseFloat(e.debit)||0), 0);
                  const credit = r.totalCredit || (r.entries||[]).filter(e => parseFloat(e.credit) > 0).reduce((s, e) => s + (parseFloat(e.credit)||0), 0);
                  return (
                    <React.Fragment key={r.journalId}>
                      <tr style={{ background: ri % 2 === 0 ? '#fff' : '#f8faff' }}>
                        <td style={{ padding: '8px 10px', border: `1px solid ${BD}`, fontWeight: 700, color: P }}>#{r.journalId}</td>
                        <td style={{ padding: '8px 10px', border: `1px solid ${BD}` }}>
                          <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4,
                            background: r.type==='order'?'#fef3c7':r.type==='manufacturing'?'#ede9fe':'#f0fdf4',
                            color: r.type==='order'?'#92400e':r.type==='manufacturing'?'#5b21b6':'#15803d' }}>
                            {r.type==='order'?'📦 Order':r.type==='manufacturing'?'🏭 Mfg':'🏢 Office'}
                          </span>
                        </td>
                        <td style={{ padding: '8px 10px', border: `1px solid ${BD}` }}>{fmtD(r.date)}</td>
                        <td style={{ padding: '8px 10px', border: `1px solid ${BD}`, color: '#6b7280' }}>{r.refNo || '—'}</td>
                        <td style={{ padding: '8px 10px', border: `1px solid ${BD}` }}>{r.narration}</td>
                        <td style={{ padding: '8px 10px', border: `1px solid ${BD}`, color: '#6b7280', fontSize: 11, maxWidth: 320 }}>
                          {r.type === 'order' && r.orderId ? (() => { const d = detailOf(r); return d ? (
                            <div style={{ lineHeight: 1.45 }}>
                              <div><span style={{ color: P, fontWeight: 700 }}>[{d.type}] {d.no}</span>{d.type === 'PO' && d.fileNo ? <span style={{ color: '#475467' }}> · File {d.fileNo}</span> : ''}</div>
                              {d.vendor && <div style={{ color: '#374151' }}>Vendor: <b>{d.vendor}</b></div>}
                              {d.client && <div style={{ color: '#374151' }}>Client: <b>{d.client}</b>{d.clientPO ? <span style={{ color: '#6b7280' }}> · PO {d.clientPO}</span> : ''}</div>}
                            </div>
                          ) : <span style={{ color: P, fontWeight: 600 }}>[{r.orderLinkType||'PO'}] #{r.orderId}</span>; })() : '—'}
                        </td>
                        <td style={{ padding: '8px 10px', border: `1px solid ${BD}`, textAlign: 'right', fontWeight: 600, color: '#1e40af' }}>₹{fmt(debit)}</td>
                        <td style={{ padding: '8px 10px', border: `1px solid ${BD}`, textAlign: 'right', fontWeight: 600, color: '#7c3aed' }}>₹{fmt(credit)}</td>
                        <td style={{ padding: '8px 10px', border: `1px solid ${BD}`, textAlign: 'right' }}>
                          <span style={{ background: sc.bg, color: sc.color, border: `1px solid ${sc.border}`, borderRadius: 5, padding: '2px 8px', fontSize: 10.5, fontWeight: 700 }}>
                            {(r.status || 'draft').toUpperCase()}
                          </span>
                        </td>
                        <td style={{ padding: '8px 10px', border: `1px solid ${BD}`, textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <button onClick={() => setExpanded(isOpen ? null : r.journalId)} style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 5, color: P, padding: '3px 8px', fontSize: 11, cursor: 'pointer', marginRight: 4, fontFamily: F }}>
                            {isOpen ? '▲ Hide' : '▼ Details'}
                          </button>
                          <button onClick={() => navigate(`/account/journal/create?edit=${r.journalId}`)} style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 5, color: '#15803d', padding: '3px 8px', fontSize: 11, cursor: 'pointer', marginRight: 4, fontFamily: F }}>✏ Edit</button>
                          <button onClick={() => handleDelete(r.journalId)} style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 5, color: '#dc2626', padding: '3px 8px', fontSize: 11, cursor: 'pointer', fontFamily: F }}>🗑</button>
                        </td>
                      </tr>
                      {isOpen && (
                        <tr>
                          <td colSpan={10} style={{ padding: 0, border: `1px solid ${BD}` }}>
                            <div style={{ background: '#f0f4fb', padding: '12px 14px' }}>
                              {detailOf(r) && <div style={{ marginBottom: 10 }}><OrderCard d={detailOf(r)} /></div>}
                              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5 }}>
                                <thead>
                                  <tr style={{ background: P }}>
                                    {['Ledger / Account', 'Debit (₹)', 'Credit (₹)'].map((h, i) => (
                                      <th key={i} style={{ padding: '6px 10px', color: '#fff', fontWeight: 700, textAlign: i === 0 ? 'left' : 'right', border: '1px solid rgba(255,255,255,0.2)' }}>{h}</th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {(r.entries || []).map((e, ii) => (
                                    <tr key={ii} style={{ background: ii % 2 === 0 ? '#fff' : '#f0f4fb' }}>
                                      <td style={{ padding: '5px 10px', border: `1px solid ${BD}`, fontWeight: 500 }}>{e.ledger}</td>
                                      <td style={{ padding: '5px 10px', border: `1px solid ${BD}`, textAlign: 'right', color: '#1e40af', fontWeight: parseFloat(e.debit) > 0 ? 600 : 400 }}>
                                        {parseFloat(e.debit) > 0 ? `₹${fmt(e.debit)}` : '—'}
                                      </td>
                                      <td style={{ padding: '5px 10px', border: `1px solid ${BD}`, textAlign: 'right', color: '#7c3aed', fontWeight: parseFloat(e.credit) > 0 ? 600 : 400 }}>
                                        {parseFloat(e.credit) > 0 ? `₹${fmt(e.credit)}` : '—'}
                                      </td>
                                    </tr>
                                  ))}
                                  <tr style={{ background: '#e0e7ff', fontWeight: 700 }}>
                                    <td style={{ padding: '6px 10px', border: `1px solid ${BD}` }}>Total</td>
                                    <td style={{ padding: '6px 10px', border: `1px solid ${BD}`, textAlign: 'right', color: '#1e40af' }}>₹{fmt(debit)}</td>
                                    <td style={{ padding: '6px 10px', border: `1px solid ${BD}`, textAlign: 'right', color: '#7c3aed' }}>₹{fmt(credit)}</td>
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
              {rows.length} journal entr{rows.length !== 1 ? 'ies' : 'y'}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
