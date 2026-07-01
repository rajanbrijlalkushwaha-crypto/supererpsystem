import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCompany } from '../../context/CompanyContext';
import { printJobSheet } from '../../utils/printJobSheet';

const F = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const N = '#2F6FED';

const STATUS_COLORS = {
  pending:     { bg: '#fff3cd', color: '#856404', border: '#ffc107' },
  'in-progress': { bg: '#cce5ff', color: '#004085', border: '#b8daff' },
  completed:   { bg: '#d4edda', color: '#155724', border: '#c3e6cb' },
  cancelled:   { bg: '#f8d7da', color: '#721c24', border: '#f5c6cb' },
};

function StatusBadge({ status }) {
  const c = STATUS_COLORS[status] || { bg: '#e9ecef', color: '#495057', border: '#dee2e6' };
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 8px',
      borderRadius: 3,
      fontSize: 11,
      fontWeight: 700,
      fontFamily: F,
      background: c.bg,
      color: c.color,
      border: `1px solid ${c.border}`,
      textTransform: 'capitalize',
    }}>
      {status || 'pending'}
    </span>
  );
}

const FILTERS = ['All', 'Pending', 'In Progress', 'Completed'];

export default function JobSheetList() {
  const { selectedCompany } = useCompany();
  const navigate = useNavigate();
  const [jobSheets, setJobSheets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('All');

  const companyId = selectedCompany?.companyId;

  useEffect(() => {
    if (!companyId) return;
    setLoading(true);
    fetch(`/api/manufacturing/job-sheets?companyId=${companyId}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) { setError(data.error); setJobSheets([]); }
        else setJobSheets(Array.isArray(data) ? data : []);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [companyId]);

  const filtered = jobSheets.filter(js => {
    if (filter === 'All') return true;
    const statusMap = { 'Pending': 'pending', 'In Progress': 'in-progress', 'Completed': 'completed' };
    return js.status === statusMap[filter];
  });

  const handleDelete = async (id, jobNo) => {
    if (!window.confirm(`Delete Job Sheet ${jobNo}?`)) return;
    try {
      const r = await fetch(`/api/manufacturing/job-sheets/${id}?companyId=${companyId}`, { method: 'DELETE' });
      const data = await r.json();
      if (data.success) setJobSheets(prev => prev.filter(j => j.id !== id));
      else alert(data.error || 'Delete failed');
    } catch (e) {
      alert(e.message);
    }
  };

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
    <div style={{ fontFamily: F, padding: '16px 20px', maxWidth: 1200 }}>
      {/* Page header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: N, color: '#fff', padding: '8px 14px', borderRadius: '4px 4px 0 0',
        marginBottom: 0,
      }}>
        <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: 0.3 }}>
          Job Sheets
        </span>
        <button
          onClick={() => navigate('/manufacturing/job-sheets/create')}
          style={{
            background: '#fff', color: N, border: 'none',
            borderRadius: 3, padding: '4px 14px', fontSize: 12,
            fontWeight: 700, cursor: 'pointer', fontFamily: F,
          }}
        >
          + Create Job Sheet
        </button>
      </div>

      {/* Filter bar */}
      <div style={{
        background: '#f0f2f5', borderLeft: `1px solid ${N}`, borderRight: `1px solid ${N}`,
        padding: '6px 10px', display: 'flex', gap: 4,
      }}>
        {FILTERS.map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              padding: '3px 12px', fontSize: 11, fontFamily: F,
              borderRadius: 3, cursor: 'pointer', fontWeight: filter === f ? 700 : 400,
              background: filter === f ? N : '#fff',
              color: filter === f ? '#fff' : '#2F6FED',
              border: `1px solid ${N}`,
            }}
          >
            {f}
          </button>
        ))}
        <span style={{ marginLeft: 'auto', fontSize: 11, color: '#666', alignSelf: 'center' }}>
          {filtered.length} record{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Table */}
      <div style={{ border: `1px solid ${N}`, borderTop: 'none', overflowX: 'auto' }}>
        {loading ? (
          <div style={{ padding: 20, textAlign: 'center', color: '#666', fontFamily: F, fontSize: 13 }}>Loading...</div>
        ) : error ? (
          <div style={{ padding: 16, color: '#c00', fontFamily: F, fontSize: 13 }}>{error}</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: '#888', fontFamily: F, fontSize: 13 }}>
            No job sheets found.{' '}
            <span
              style={{ color: N, cursor: 'pointer', textDecoration: 'underline' }}
              onClick={() => navigate('/manufacturing/job-sheets/create')}
            >
              Create one
            </span>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={thStyle}>Job No</th>
                <th style={thStyle}>SO Number</th>
                <th style={thStyle}>Customer</th>
                <th style={thStyle}>Item</th>
                <th style={thStyle}>Qty / UOM</th>
                <th style={thStyle}>Location</th>
                <th style={thStyle}>Due Date</th>
                <th style={thStyle}>Status</th>
                <th style={{ ...thStyle, textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((js, idx) => (
                <tr
                  key={js.id}
                  style={{
                    background: idx % 2 === 0 ? '#fff' : '#f9fafb',
                    cursor: 'pointer',
                  }}
                  onClick={() => navigate(`/manufacturing/job-sheets/edit/${js.id}`)}
                >
                  <td style={{ ...tdStyle, fontWeight: 700, color: N }}>{js.jobNo || `JSM${String(js.id).padStart(6,'0')}`}</td>
                  <td style={tdStyle}>{js.soNumber || '-'}</td>
                  <td style={tdStyle}>{js.customerName || '-'}</td>
                  <td style={tdStyle}>{js.itemName || '-'}</td>
                  <td style={tdStyle}>{js.qtyRequired != null ? `${js.qtyRequired} ${js.uom || ''}`.trim() : '-'}</td>
                  <td style={tdStyle}>{js.locationName || '-'}</td>
                  <td style={tdStyle}>{js.dueDate ? new Date(js.dueDate).toLocaleDateString('en-IN') : '-'}</td>
                  <td style={tdStyle}><StatusBadge status={js.status} /></td>
                  <td style={{ ...tdStyle, textAlign: 'center', whiteSpace: 'nowrap' }} onClick={e => e.stopPropagation()}>
                    <button
                      onClick={() => navigate(`/manufacturing/job-sheets/edit/${js.id}`)}
                      style={{
                        marginRight: 4, padding: '2px 8px', fontSize: 11, fontFamily: F,
                        background: '#1a4a7a', color: '#fff', border: 'none', borderRadius: 3, cursor: 'pointer',
                      }}
                    >
                      ✏️ Edit
                    </button>
                    <button
                      onClick={() => printJobSheet(js, {})}
                      style={{
                        marginRight: 4, padding: '2px 8px', fontSize: 11, fontFamily: F,
                        background: '#2F6FED', color: '#fff', border: 'none', borderRadius: 3, cursor: 'pointer',
                      }}
                    >
                      🖨️ Print
                    </button>
                    <button
                      onClick={() => handleDelete(js.id, js.jobNo)}
                      style={{
                        padding: '2px 8px', fontSize: 11, fontFamily: F,
                        background: '#dc3545', color: '#fff', border: 'none', borderRadius: 3, cursor: 'pointer',
                      }}
                    >
                      🗑️
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
