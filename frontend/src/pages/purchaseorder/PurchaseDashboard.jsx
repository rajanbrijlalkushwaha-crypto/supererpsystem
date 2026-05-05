import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCompany } from '../../context/CompanyContext';

const F = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const N = '#2F6FED';

const STATUS_COLORS = {
  draft:    { bg: '#e9ecef', color: '#495057', border: '#dee2e6' },
  pending:  { bg: '#fff3cd', color: '#856404', border: '#ffc107' },
  approved: { bg: '#d4edda', color: '#155724', border: '#c3e6cb' },
  rejected: { bg: '#f8d7da', color: '#721c24', border: '#f5c6cb' },
};

function Badge({ status }) {
  const c = STATUS_COLORS[status] || STATUS_COLORS.draft;
  return (
    <span style={{
      padding: '2px 8px', borderRadius: 3, fontSize: 11, fontWeight: 700,
      background: c.bg, color: c.color, border: `1px solid ${c.border}`,
      textTransform: 'capitalize', fontFamily: F,
    }}>
      {status || 'draft'}
    </span>
  );
}

export default function PurchaseDashboard() {
  const { selectedCompany } = useCompany();
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  const companyId = selectedCompany?.companyId;

  useEffect(() => {
    if (!companyId) { setLoading(false); return; }
    fetch(`/api/purchase-orders?companyId=${companyId}`)
      .then(r => r.json())
      .then(data => setOrders(Array.isArray(data) ? data : []))
      .catch(() => setOrders([]))
      .finally(() => setLoading(false));
  }, [companyId]);

  const total    = orders.length;
  const pending  = orders.filter(o => o.status === 'pending').length;
  const approved = orders.filter(o => o.status === 'approved').length;
  const draft    = orders.filter(o => o.status === 'draft').length;

  const thStyle = {
    background: N, color: '#fff', fontFamily: F, fontSize: 11,
    fontWeight: 600, padding: '6px 10px', textAlign: 'left',
    borderRight: '1px solid rgba(255,255,255,0.15)', whiteSpace: 'nowrap',
  };
  const tdStyle = {
    fontFamily: F, fontSize: 12, padding: '5px 10px',
    borderBottom: '1px solid #e8eaed', color: '#222', verticalAlign: 'middle',
  };

  return (
    <div style={{ fontFamily: F, padding: '16px 20px', maxWidth: 1200 }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: N, color: '#fff', padding: '8px 14px', borderRadius: '4px 4px 0 0',
      }}>
        <span style={{ fontSize: 13, fontWeight: 700 }}>Purchase — Overview</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => navigate('/purchase-order/tracking')}
            style={{
              background: '#e8f0fe', color: N, border: 'none',
              borderRadius: 3, padding: '4px 14px', fontSize: 12,
              fontWeight: 700, cursor: 'pointer', fontFamily: F,
            }}
          >
            PO Tracking
          </button>
          <button
            onClick={() => navigate('/purchase-order/create')}
            style={{
              background: '#fff', color: N, border: 'none',
              borderRadius: 3, padding: '4px 14px', fontSize: 12,
              fontWeight: 700, cursor: 'pointer', fontFamily: F,
            }}
          >
            + Create PO
          </button>
        </div>
      </div>

      {/* Stats */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12,
        border: `1px solid ${N}`, borderTop: 'none', padding: 16, background: '#f9fafb',
      }}>
        {[
          { label: 'Total POs',       value: total,    color: '#1a4a7a' },
          { label: 'Draft',           value: draft,    color: '#6c757d' },
          { label: 'Pending Approval',value: pending,  color: '#856404' },
          { label: 'Approved',        value: approved, color: '#155724' },
        ].map(s => (
          <div key={s.label} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 4, padding: '12px 16px' }}>
            <div style={{ fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>{s.label}</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Recent orders */}
      <div style={{ border: `1px solid ${N}`, borderTop: 'none' }}>
        <div style={{ background: '#f0f4f8', borderBottom: `1px solid ${N}`, padding: '5px 10px', fontSize: 11, fontWeight: 700, color: N }}>
          RECENT PURCHASE ORDERS
        </div>
        {loading ? (
          <div style={{ padding: 20, textAlign: 'center', color: '#888', fontSize: 13 }}>Loading...</div>
        ) : orders.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: '#888', fontSize: 13 }}>
            No purchase orders yet.{' '}
            <span style={{ color: N, cursor: 'pointer', textDecoration: 'underline' }} onClick={() => navigate('/purchase-order/create')}>
              Create one
            </span>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={thStyle}>PO No.</th>
                <th style={thStyle}>Vendor</th>
                <th style={thStyle}>Date</th>
                <th style={thStyle}>Amount</th>
                <th style={thStyle}>Status</th>
                <th style={{ ...thStyle, textAlign: 'center' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {orders.slice(0, 10).map((o, idx) => (
                <tr
                  key={o.orderId || idx}
                  style={{ background: idx % 2 === 0 ? '#fff' : '#f9fafb', cursor: 'pointer' }}
                  onClick={() => navigate(`/purchase-order/edit/${o.orderId}`)}
                >
                  <td style={{ ...tdStyle, fontWeight: 700, color: N }}>{o.poNumber || o.voucherNumber || `PO-${o.orderId}`}</td>
                  <td style={tdStyle}>{o.vendorName || '-'}</td>
                  <td style={tdStyle}>{o.poDate ? new Date(o.poDate).toLocaleDateString('en-IN') : '-'}</td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>
                    {o.grandTotal != null ? `₹ ${Number(o.grandTotal).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '-'}
                  </td>
                  <td style={tdStyle}><Badge status={o.status} /></td>
                  <td style={{ ...tdStyle, textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                    <button
                      onClick={() => navigate(`/purchase-order/edit/${o.orderId}`)}
                      style={{
                        padding: '2px 8px', fontSize: 11, fontFamily: F,
                        background: N, color: '#fff', border: 'none', borderRadius: 3, cursor: 'pointer',
                      }}
                    >
                      Open
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
