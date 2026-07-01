import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCompany } from '../../context/CompanyContext';

const F = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const N = '#133d80';

const STATUS_COLORS = {
  pending:       { bg: '#fff3cd', color: '#856404', border: '#ffc107' },
  'in-progress': { bg: '#cce5ff', color: '#004085', border: '#b8daff' },
  completed:     { bg: '#d4edda', color: '#155724', border: '#c3e6cb' },
  cancelled:     { bg: '#f8d7da', color: '#721c24', border: '#f5c6cb' },
};

function StatCard({ label, value, bg, color }) {
  return (
    <div style={{
      background: bg || '#fff', border: `1px solid ${color || '#dde'}`,
      borderRadius: 6, padding: '14px 20px', minWidth: 130, flex: 1,
      boxShadow: '0 1px 3px rgba(0,0,0,0.07)',
    }}>
      <div style={{ fontSize: 26, fontWeight: 700, color: color || N, fontFamily: F }}>
        {value}
      </div>
      <div style={{ fontSize: 12, color: '#555', fontFamily: F, marginTop: 2 }}>
        {label}
      </div>
    </div>
  );
}

function StatusBadge({ status }) {
  const c = STATUS_COLORS[status] || { bg: '#e9ecef', color: '#495057', border: '#dee2e6' };
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: 3,
      fontSize: 11, fontWeight: 700, fontFamily: F,
      background: c.bg, color: c.color, border: `1px solid ${c.border}`,
      textTransform: 'capitalize',
    }}>
      {status || 'pending'}
    </span>
  );
}

export default function ManufacturingDashboard() {
  const { selectedCompany } = useCompany();
  const navigate = useNavigate();
  const companyId = selectedCompany?.companyId;

  const [jobSheets, setJobSheets] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!companyId) return;
    setLoading(true);
    fetch(`/api/manufacturing/job-sheets?companyId=${companyId}`)
      .then(r => r.json())
      .then(data => setJobSheets(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [companyId]);

  const total = jobSheets.length;
  const pending = jobSheets.filter(j => j.status === 'pending').length;
  const inProgress = jobSheets.filter(j => j.status === 'in-progress').length;
  const completed = jobSheets.filter(j => j.status === 'completed').length;

  const recent = [...jobSheets].slice(0, 5);

  const thStyle = {
    background: N, color: '#fff', fontFamily: F, fontSize: 11,
    fontWeight: 600, padding: '6px 10px', textAlign: 'left',
    borderRight: '1px solid rgba(255,255,255,0.15)', whiteSpace: 'nowrap',
  };

  const tdStyle = {
    fontFamily: F, fontSize: 12, padding: '5px 10px',
    borderBottom: '1px solid #e8eaed', color: '#222',
    verticalAlign: 'middle',
  };

  return (
    <div style={{ fontFamily: F, padding: '16px 20px', maxWidth: 1000 }}>

      {/* Page header */}
      <div style={{
        background: N, color: '#fff', padding: '8px 14px',
        borderRadius: '4px 4px 0 0', marginBottom: 0,
        fontSize: 13, fontWeight: 700, letterSpacing: 0.3,
      }}>
        Manufacturing Dashboard
      </div>

      <div style={{ border: `1px solid ${N}`, borderTop: 'none', padding: '16px' }}>
        {/* Stats */}
        {loading ? (
          <div style={{ color: '#666', fontSize: 13, padding: 12 }}>Loading...</div>
        ) : (
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
            <StatCard label="Total Job Sheets" value={total} bg="#f0f4ff" color="#0d2d6b" />
            <StatCard label="Pending" value={pending} bg="#fff8e1" color="#c77700" />
            <StatCard label="In Progress" value={inProgress} bg="#e3f2fd" color="#1565c0" />
            <StatCard label="Completed" value={completed} bg="#e8f5e9" color="#2e7d32" />
          </div>
        )}

        {/* Quick links */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
          <button
            onClick={() => navigate('/manufacturing/job-sheets/create')}
            style={{
              background: N, color: '#fff', border: 'none',
              borderRadius: 3, padding: '6px 18px', fontSize: 12,
              cursor: 'pointer', fontFamily: F, fontWeight: 700,
            }}
          >
            + Create Job Sheet
          </button>
          <button
            onClick={() => navigate('/manufacturing/job-sheets')}
            style={{
              background: '#f0f2f5', color: N, border: `1px solid ${N}`,
              borderRadius: 3, padding: '6px 18px', fontSize: 12,
              cursor: 'pointer', fontFamily: F,
            }}
          >
            View All Job Sheets
          </button>
          <button
            onClick={() => navigate('/manufacturing/locations')}
            style={{
              background: '#f0f2f5', color: N, border: `1px solid ${N}`,
              borderRadius: 3, padding: '6px 18px', fontSize: 12,
              cursor: 'pointer', fontFamily: F,
            }}
          >
            Manage Locations
          </button>
        </div>

        {/* Recent job sheets */}
        <div style={{ fontSize: 12, fontWeight: 700, color: N, fontFamily: F, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4 }}>
          Recent Job Sheets
        </div>
        <div style={{ border: `1px solid #dde`, borderRadius: 3, overflow: 'hidden' }}>
          {loading ? (
            <div style={{ padding: 12, color: '#666', fontFamily: F, fontSize: 13 }}>Loading...</div>
          ) : recent.length === 0 ? (
            <div style={{ padding: 16, textAlign: 'center', color: '#888', fontFamily: F, fontSize: 13 }}>
              No job sheets yet.{' '}
              <span
                style={{ color: N, cursor: 'pointer', textDecoration: 'underline' }}
                onClick={() => navigate('/manufacturing/job-sheets/create')}
              >
                Create the first one
              </span>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={thStyle}>Job No</th>
                  <th style={thStyle}>Item</th>
                  <th style={thStyle}>Customer</th>
                  <th style={thStyle}>Qty</th>
                  <th style={thStyle}>Due Date</th>
                  <th style={thStyle}>Status</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((js, idx) => (
                  <tr
                    key={js.id}
                    style={{
                      background: idx % 2 === 0 ? '#fff' : '#f9fafb',
                      cursor: 'pointer',
                    }}
                    onClick={() => navigate(`/manufacturing/job-sheets/edit/${js.id}`)}
                  >
                    <td style={{ ...tdStyle, fontWeight: 700, color: N }}>
                      {js.jobNo || `JS-${String(js.id).padStart(6, '0')}`}
                    </td>
                    <td style={tdStyle}>{js.itemName || '-'}</td>
                    <td style={tdStyle}>{js.customerName || '-'}</td>
                    <td style={tdStyle}>{js.qtyRequired != null ? `${js.qtyRequired} ${js.uom || ''}`.trim() : '-'}</td>
                    <td style={tdStyle}>
                      {js.dueDate ? new Date(js.dueDate).toLocaleDateString('en-IN') : '-'}
                    </td>
                    <td style={tdStyle}><StatusBadge status={js.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {jobSheets.length > 5 && (
          <div style={{ textAlign: 'right', marginTop: 6 }}>
            <span
              style={{ fontSize: 11, color: N, cursor: 'pointer', textDecoration: 'underline', fontFamily: F }}
              onClick={() => navigate('/manufacturing/job-sheets')}
            >
              View all {jobSheets.length} job sheets
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
