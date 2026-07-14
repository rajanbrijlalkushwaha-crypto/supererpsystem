import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCompany } from '../../context/CompanyContext';

const F = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const N = '#104f4f';

const fmt = n => (parseFloat(n) || 0).toFixed(2);

const STATUS_CFG = {
  completed:   { bg: '#d4edda', color: '#155724', border: '#c3e6cb', label: 'Completed' },
  'in-progress':{ bg: '#cce5ff', color: '#004085', border: '#b8daff', label: 'In Progress' },
  approved:    { bg: '#d1ecf1', color: '#0c5460', border: '#bee5eb', label: 'Approved' },
  submitted:   { bg: '#fff3cd', color: '#856404', border: '#ffc107', label: 'Submitted' },
  pending:     { bg: '#f8f9fa', color: '#495057', border: '#dee2e6', label: 'Pending' },
  rejected:    { bg: '#f8d7da', color: '#721c24', border: '#f5c6cb', label: 'Rejected' },
  cancelled:   { bg: '#e2e3e5', color: '#383d41', border: '#d6d8db', label: 'Cancelled' },
};

function StatusBadge({ status }) {
  const c = STATUS_CFG[status] || STATUS_CFG.pending;
  return (
    <span style={{
      display: 'inline-block', padding: '2px 9px', borderRadius: 3,
      fontSize: 11, fontWeight: 700, fontFamily: F, whiteSpace: 'nowrap',
      background: c.bg, color: c.color, border: `1px solid ${c.border}`,
    }}>
      {c.label}
    </span>
  );
}

export default function ManufacturingOrders() {
  const { selectedCompany } = useCompany();
  const navigate = useNavigate();
  const cid = selectedCompany?.companyId;

  const [orders, setOrders]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState('');
  const [expanded, setExpanded] = useState({});

  useEffect(() => {
    if (!cid) return;
    setLoading(true);
    fetch(`/api/manufacturing/manufacturing-orders?companyId=${cid}`)
      .then(r => r.json())
      .then(d => setOrders(Array.isArray(d) ? d : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [cid]);

  const toggle = (soId) => setExpanded(p => ({ ...p, [soId]: !p[soId] }));

  const filtered = orders.filter(o =>
    !search ||
    (o.soNumber || '').toLowerCase().includes(search.toLowerCase()) ||
    (o.customerName || '').toLowerCase().includes(search.toLowerCase())
  );

  const stats = {
    total: orders.length,
    pending: orders.filter(o => o.overallStatus === 'pending').length,
    inProgress: orders.filter(o => o.overallStatus === 'in-progress').length,
    completed: orders.filter(o => o.overallStatus === 'completed').length,
  };

  return (
    <div style={{ fontFamily: F, padding: '14px 16px' }}>

      {/* Header */}
      <div style={{ background: N, color: '#fff', padding: '8px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 0 }}>
        <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: 0.3 }}>Manufacturing Orders</span>
        <button
          onClick={() => navigate('/manufacturing/job-sheets/create')}
          style={{ background: '#fff', color: N, border: 'none', borderRadius: 4, padding: '4px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
          + New Job Sheet
        </button>
      </div>

      {/* Stats strip */}
      <div style={{ display: 'flex', gap: 10, padding: '10px 0', flexWrap: 'wrap' }}>
        {[
          { label: 'Total Orders', value: stats.total, color: N, bg: '#eef2ff' },
          { label: 'Pending', value: stats.pending, color: '#856404', bg: '#fff3cd' },
          { label: 'In Progress', value: stats.inProgress, color: '#004085', bg: '#cce5ff' },
          { label: 'Completed', value: stats.completed, color: '#155724', bg: '#d4edda' },
        ].map(s => (
          <div key={s.label} style={{ background: s.bg, border: `1px solid ${s.color}33`, borderRadius: 6,
            padding: '10px 18px', minWidth: 120, textAlign: 'center' }}>
            <div style={{ fontSize: 24, fontWeight: 700, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 11, color: '#555', marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Search */}
      <div style={{ marginBottom: 10 }}>
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search by SO number or customer…"
          style={{ fontFamily: F, fontSize: 12, padding: '5px 10px', border: '1px solid #b0b8c1',
            borderRadius: 4, width: 300, outline: 'none' }}
        />
      </div>

      {loading ? (
        <div style={{ padding: 30, textAlign: 'center', color: '#888', fontSize: 13 }}>Loading manufacturing orders…</div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: 30, textAlign: 'center', color: '#aaa', fontSize: 13 }}>
          {orders.length === 0
            ? 'No manufacturing orders yet. Create job sheets from Sales Orders to see them here.'
            : 'No orders match your search.'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map(order => (
            <div key={order.soId} style={{
              border: '1px solid #c8d0db', borderRadius: 6, background: '#fff',
              boxShadow: '0 1px 3px rgba(0,0,0,0.06)', overflow: 'hidden',
            }}>
              {/* Order header row */}
              <div
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
                  background: expanded[order.soId] ? '#f0f5ff' : '#fafbfc', cursor: 'pointer',
                  borderBottom: expanded[order.soId] ? '1px solid #d0d8e8' : 'none' }}
                onClick={() => toggle(order.soId)}
              >
                <span style={{ fontSize: 12, color: '#888', width: 14 }}>
                  {expanded[order.soId] ? '▼' : '▶'}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 800, fontSize: 13, color: N }}>{order.soNumber || 'SO #'+order.soId}</span>
                    <span style={{ fontSize: 12, color: '#555' }}>{order.customerName}</span>
                  </div>
                  <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>
                    {order.jobCount} job sheet{order.jobCount !== 1 ? 's' : ''} &nbsp;·&nbsp;
                    {order.items.length} item type{order.items.length !== 1 ? 's' : ''} &nbsp;·&nbsp;
                    Total mfg qty: {fmt(order.items.reduce((s, it) => s + (it.mfgQty || 0), 0))}
                  </div>
                </div>
                <StatusBadge status={order.overallStatus} />
              </div>

              {/* Expanded detail */}
              {expanded[order.soId] && (
                <div style={{ padding: '10px 16px', background: '#fff' }}>

                  {/* Items manufactured */}
                  {order.items.length > 0 && (
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: N, marginBottom: 5 }}>
                        Items Issued for Manufacturing
                      </div>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                        <thead>
                          <tr style={{ background: '#e8eef8' }}>
                            <th style={{ padding: '4px 8px', fontWeight: 700, textAlign: 'left', border: '1px solid #ccd', fontSize: 11 }}>Item Name</th>
                            <th style={{ padding: '4px 8px', fontWeight: 700, textAlign: 'left', border: '1px solid #ccd', fontSize: 11 }}>Item Code</th>
                            <th style={{ padding: '4px 8px', fontWeight: 700, textAlign: 'right', border: '1px solid #ccd', fontSize: 11 }}>Mfg Qty</th>
                            <th style={{ padding: '4px 8px', fontWeight: 700, textAlign: 'left', border: '1px solid #ccd', fontSize: 11 }}>UOM</th>
                          </tr>
                        </thead>
                        <tbody>
                          {order.items.map((it, i) => (
                            <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#f9fafb' }}>
                              <td style={{ padding: '3px 8px', border: '1px solid #e0e4ec' }}>{it.itemName || '—'}</td>
                              <td style={{ padding: '3px 8px', border: '1px solid #e0e4ec', fontSize: 11, color: '#666' }}>{it.itemCode || '—'}</td>
                              <td style={{ padding: '3px 8px', border: '1px solid #e0e4ec', textAlign: 'right', fontWeight: 700 }}>{fmt(it.mfgQty)}</td>
                              <td style={{ padding: '3px 8px', border: '1px solid #e0e4ec' }}>{it.uom || '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Job sheets list */}
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: N, marginBottom: 5 }}>
                      Job Sheets
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {order.jobSheets.map(js => (
                        <div key={js.id}
                          onClick={() => navigate(`/manufacturing/job-sheets/edit/${js.id}`)}
                          style={{
                            border: '1px solid #c8d0db', borderRadius: 4, padding: '6px 12px',
                            cursor: 'pointer', background: '#f4f7fb', display: 'inline-flex',
                            flexDirection: 'column', gap: 3, minWidth: 140,
                          }}>
                          <div style={{ fontWeight: 700, fontSize: 12, color: N }}>{js.jobNo}</div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <StatusBadge status={js.status} />
                          </div>
                          {js.locationName && (
                            <div style={{ fontSize: 10, color: '#666' }}>📍 {js.locationName}</div>
                          )}
                          {js.dueDate && (
                            <div style={{ fontSize: 10, color: '#888' }}>
                              Due: {new Date(js.dueDate).toLocaleDateString('en-IN')}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
                    <button
                      onClick={() => navigate('/manufacturing/job-sheets/create')}
                      style={{ fontSize: 11, padding: '4px 12px', border: `1px solid ${N}`,
                        borderRadius: 4, background: '#fff', color: N, cursor: 'pointer', fontFamily: F, fontWeight: 600 }}>
                      + Add Job Sheet for this SO
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
