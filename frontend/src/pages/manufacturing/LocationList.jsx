import { useState, useEffect } from 'react';
import { useCompany } from '../../context/CompanyContext';

const F = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const N = '#104f4f';

const TYPES = ['Factory', 'Workshop', 'Warehouse', 'Assembly Unit', 'Others'];

const EMPTY_FORM = {
  name: '', type: 'Factory', city: '', address: '', capacity: '', notes: '',
};

function StatusBadge({ status }) {
  const isActive = status === 'active';
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: 3,
      fontSize: 11, fontWeight: 700, fontFamily: F,
      background: isActive ? '#d4edda' : '#e9ecef',
      color: isActive ? '#155724' : '#6c757d',
      border: `1px solid ${isActive ? '#c3e6cb' : '#dee2e6'}`,
    }}>
      {isActive ? 'Active' : 'Inactive'}
    </span>
  );
}

export default function LocationList() {
  const { selectedCompany } = useCompany();
  const companyId = selectedCompany?.companyId;

  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const load = () => {
    if (!companyId) return;
    setLoading(true);
    fetch(`/api/manufacturing/locations?companyId=${companyId}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) { setError(data.error); setLocations([]); }
        else setLocations(Array.isArray(data) ? data : []);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [companyId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleFormChange = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const handleAdd = async () => {
    setFormError('');
    if (!form.name.trim()) { setFormError('Name is required'); return; }
    setSaving(true);
    try {
      const r = await fetch(`/api/manufacturing/locations?companyId=${companyId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, companyId }),
      });
      const data = await r.json();
      if (data.success) {
        setForm({ ...EMPTY_FORM });
        load();
      } else {
        setFormError(data.error || 'Save failed');
      }
    } catch (e) {
      setFormError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Delete location "${name}"?`)) return;
    try {
      const r = await fetch(`/api/manufacturing/locations/${id}?companyId=${companyId}`, { method: 'DELETE' });
      const data = await r.json();
      if (data.success) setLocations(prev => prev.filter(l => l.id !== id));
      else alert(data.error || 'Delete failed');
    } catch (e) {
      alert(e.message);
    }
  };

  const handleToggleStatus = async (loc) => {
    const newStatus = loc.status === 'active' ? 'inactive' : 'active';
    try {
      const r = await fetch(`/api/manufacturing/locations/${loc.id}?companyId=${companyId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...loc, status: newStatus, companyId }),
      });
      const data = await r.json();
      if (data.success) {
        setLocations(prev => prev.map(l => l.id === loc.id ? { ...l, status: newStatus } : l));
      } else {
        alert(data.error || 'Update failed');
      }
    } catch (e) {
      alert(e.message);
    }
  };

  const inputStyle = {
    fontFamily: F, fontSize: 12, padding: '4px 8px',
    border: '1px solid #b0b8c1', borderRadius: 3,
    outline: 'none', color: '#222', background: '#fff',
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
    <div style={{ fontFamily: F, padding: '16px 20px', maxWidth: 1000 }}>

      {/* Add Location Form */}
      <div style={{
        background: N, color: '#fff', padding: '7px 14px',
        borderRadius: '4px 4px 0 0', fontSize: 13, fontWeight: 700,
      }}>
        Add Manufacturing Location
      </div>
      <div style={{ border: `1px solid ${N}`, borderTop: 'none', padding: '12px 16px', marginBottom: 16 }}>
        {formError && (
          <div style={{ background: '#f8d7da', border: '1px solid #f5c6cb', color: '#721c24', padding: '5px 10px', borderRadius: 3, marginBottom: 8, fontSize: 12 }}>
            {formError}
          </div>
        )}

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 8 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <label style={{ fontSize: 11, color: '#555', fontFamily: F }}>Name *</label>
            <input
              value={form.name}
              onChange={e => handleFormChange('name', e.target.value)}
              style={{ ...inputStyle, width: 200 }}
              placeholder="Location name"
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <label style={{ fontSize: 11, color: '#555', fontFamily: F }}>Type</label>
            <select
              value={form.type}
              onChange={e => handleFormChange('type', e.target.value)}
              style={{ ...inputStyle, width: 140 }}
            >
              {TYPES.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <label style={{ fontSize: 11, color: '#555', fontFamily: F }}>City</label>
            <input
              value={form.city}
              onChange={e => handleFormChange('city', e.target.value)}
              style={{ ...inputStyle, width: 140 }}
              placeholder="City"
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <label style={{ fontSize: 11, color: '#555', fontFamily: F }}>Capacity</label>
            <input
              value={form.capacity}
              onChange={e => handleFormChange('capacity', e.target.value)}
              style={{ ...inputStyle, width: 120 }}
              placeholder="e.g. 100 units/day"
            />
          </div>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 10 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <label style={{ fontSize: 11, color: '#555', fontFamily: F }}>Address</label>
            <input
              value={form.address}
              onChange={e => handleFormChange('address', e.target.value)}
              style={{ ...inputStyle, width: 280 }}
              placeholder="Address"
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <label style={{ fontSize: 11, color: '#555', fontFamily: F }}>Notes</label>
            <input
              value={form.notes}
              onChange={e => handleFormChange('notes', e.target.value)}
              style={{ ...inputStyle, width: 220 }}
              placeholder="Notes"
            />
          </div>
        </div>

        <button
          onClick={handleAdd}
          disabled={saving}
          style={{
            background: saving ? '#888' : N, color: '#fff', border: 'none',
            borderRadius: 3, padding: '5px 18px', fontSize: 12,
            cursor: saving ? 'not-allowed' : 'pointer', fontFamily: F, fontWeight: 700,
          }}
        >
          {saving ? 'Saving...' : 'Save Location'}
        </button>
      </div>

      {/* Locations Table */}
      <div style={{ background: N, color: '#fff', padding: '7px 14px', borderRadius: '4px 4px 0 0', fontSize: 13, fontWeight: 700 }}>
        Manufacturing Locations
        <span style={{ fontWeight: 400, fontSize: 11, marginLeft: 8 }}>({locations.length} total)</span>
      </div>
      <div style={{ border: `1px solid ${N}`, borderTop: 'none', overflowX: 'auto' }}>
        {loading ? (
          <div style={{ padding: 16, textAlign: 'center', color: '#666', fontFamily: F, fontSize: 13 }}>Loading...</div>
        ) : error ? (
          <div style={{ padding: 12, color: '#c00', fontFamily: F, fontSize: 13 }}>{error}</div>
        ) : locations.length === 0 ? (
          <div style={{ padding: 20, textAlign: 'center', color: '#888', fontFamily: F, fontSize: 13 }}>
            No locations found. Add one using the form above.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ ...thStyle, width: 40, textAlign: 'center' }}>#</th>
                <th style={thStyle}>Name</th>
                <th style={thStyle}>Type</th>
                <th style={thStyle}>City</th>
                <th style={thStyle}>Capacity</th>
                <th style={thStyle}>Status</th>
                <th style={{ ...thStyle, textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {locations.map((loc, idx) => (
                <tr key={loc.id} style={{ background: idx % 2 === 0 ? '#fff' : '#f9fafb' }}>
                  <td style={{ ...tdStyle, textAlign: 'center', color: '#888' }}>{idx + 1}</td>
                  <td style={{ ...tdStyle, fontWeight: 600 }}>{loc.name}</td>
                  <td style={tdStyle}>{loc.type}</td>
                  <td style={tdStyle}>{loc.city || '-'}</td>
                  <td style={tdStyle}>{loc.capacity || '-'}</td>
                  <td style={tdStyle}><StatusBadge status={loc.status} /></td>
                  <td style={{ ...tdStyle, textAlign: 'center' }}>
                    <button
                      onClick={() => handleToggleStatus(loc)}
                      style={{
                        marginRight: 4, padding: '2px 8px', fontSize: 11, fontFamily: F,
                        background: loc.status === 'active' ? '#6c757d' : '#28a745',
                        color: '#fff', border: 'none', borderRadius: 3, cursor: 'pointer',
                      }}
                    >
                      {loc.status === 'active' ? 'Deactivate' : 'Activate'}
                    </button>
                    <button
                      onClick={() => handleDelete(loc.id, loc.name)}
                      style={{
                        padding: '2px 8px', fontSize: 11, fontFamily: F,
                        background: '#dc3545', color: '#fff', border: 'none', borderRadius: 3, cursor: 'pointer',
                      }}
                    >
                      Delete
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
