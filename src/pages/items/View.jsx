import { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { useCompany } from '../../context/CompanyContext';

const N = '#2F6FED';
const F = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

const TYPE_COLOR = {
  'Ready Product': { bg: '#e8f5e9', color: '#2e7d32', border: '#a5d6a7' },
  'Raw Material':  { bg: '#fff3e0', color: '#e65100', border: '#ffcc80' },
  'Service':       { bg: '#e3f2fd', color: '#1565c0', border: '#90caf9' },
};

export default function ViewItems() {
  const { selectedCompany } = useCompany();
  const navigate = useNavigate();
  const [items, setItems]     = useState([]);
  const [search, setSearch]   = useState('');
  const [loading, setLoading] = useState(false);
  const [filter, setFilter]   = useState('All');

  const cid = selectedCompany?.companyId;

  const load = () => {
    if (!cid) return;
    setLoading(true);
    axios.get(`/api/items?companyId=${cid}`)
      .then(r => setItems(r.data || []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  };

  useEffect(load, [cid]);

  const filtered = items.filter(it => {
    const q = search.toLowerCase();
    const matchQ = !q || String(it.itemCode).includes(q) ||
      (it.itemName || '').toLowerCase().includes(q) ||
      (it.hsnCode  || '').toLowerCase().includes(q) ||
      (it.uom      || '').toLowerCase().includes(q);
    const matchF = filter === 'All' || it.itemType === filter;
    return matchQ && matchF;
  });

  const handleDelete = async (itemCode) => {
    if (!window.confirm(`Delete item ${itemCode}?`)) return;
    try {
      await axios.delete(`/api/items/${itemCode}?companyId=${cid}`);
      setItems(p => p.filter(it => it.itemCode !== itemCode));
    } catch (e) {
      alert('Delete failed: ' + (e.response?.data?.error || e.message));
    }
  };

  const th = { padding: '5px 8px', background: N, color: '#fff', fontSize: 11, fontWeight: 700, textAlign: 'left', whiteSpace: 'nowrap', border: '1px solid #2a5a8a' };
  const td = { padding: '4px 8px', fontSize: 11, fontFamily: F, border: '1px solid #dde', verticalAlign: 'middle' };

  return (
    <div style={{ padding: 10, fontFamily: F }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
        <input
          style={{ height: 26, padding: '0 8px', border: '1px solid #b0b0b0', fontSize: 12, fontFamily: F, width: 220, outline: 'none' }}
          placeholder="Search code / name / HSN…"
          value={search} onChange={e => setSearch(e.target.value)}
        />
        {['All', 'Ready Product', 'Raw Material', 'Service'].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            style={{
              height: 26, padding: '0 12px', fontSize: 11, fontFamily: F, cursor: 'pointer',
              background: filter === f ? N : '#e8eaed',
              color: filter === f ? '#fff' : '#333',
              border: `1px solid ${filter === f ? N : '#bbb'}`,
              fontWeight: filter === f ? 700 : 400,
            }}>
            {f}
          </button>
        ))}
        <button onClick={load}
          style={{ height: 26, padding: '0 12px', fontSize: 11, fontFamily: F, cursor: 'pointer', background: '#e8eaed', border: '1px solid #bbb' }}>
          ↻ Refresh
        </button>
        <button onClick={() => navigate('/items/create')}
          style={{ height: 26, padding: '0 14px', fontSize: 11, fontFamily: F, cursor: 'pointer', background: N, color: '#fff', border: 'none', fontWeight: 700, marginLeft: 'auto' }}>
          + New Item
        </button>
      </div>

      {/* Count */}
      <div style={{ fontSize: 11, color: '#666', marginBottom: 6 }}>
        {loading ? 'Loading…' : `${filtered.length} item${filtered.length !== 1 ? 's' : ''} found`}
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto', border: '1px solid #ccc' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, fontFamily: F }}>
          <thead>
            <tr>
              {['Item Code', 'Item Name', 'UOM', 'HSN Code', 'Item Type', 'Actions'].map(h => (
                <th key={h} style={th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} style={{ ...td, textAlign: 'center', padding: 24, color: '#888' }}>
                  {loading ? 'Loading items…' : 'No items found — click [+ New Item] to add'}
                </td>
              </tr>
            )}
            {filtered.map((it, i) => {
              const tc = TYPE_COLOR[it.itemType] || TYPE_COLOR['Raw Material'];
              return (
                <tr key={it.itemCode} style={{ background: i % 2 === 0 ? '#fff' : '#f7f9fc' }}>
                  <td style={{ ...td, fontWeight: 700, color: '#1a4a7a' }}>{it.itemCode}</td>
                  <td style={{ ...td, fontWeight: 600 }}>{it.itemName}</td>
                  <td style={{ ...td, textAlign: 'center' }}>{it.uom || '—'}</td>
                  <td style={{ ...td, textAlign: 'center', fontFamily: 'monospace', letterSpacing: 0.5 }}>{it.hsnCode || '—'}</td>
                  <td style={td}>
                    <span style={{
                      background: tc.bg, color: tc.color, border: `1px solid ${tc.border}`,
                      padding: '1px 8px', fontSize: 10, fontWeight: 700, borderRadius: 2,
                    }}>
                      {it.itemType}
                    </span>
                  </td>
                  <td style={{ ...td, textAlign: 'center' }}>
                    <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                      <button onClick={() => navigate(`/items/edit/${it.itemCode}`)}
                        style={{ padding: '1px 10px', fontSize: 10, cursor: 'pointer', background: '#e8f0ff', color: '#1a4a7a', border: '1px solid #aac', fontFamily: F, fontWeight: 600 }}>
                        Edit
                      </button>
                      <button onClick={() => handleDelete(it.itemCode)}
                        style={{ padding: '1px 10px', fontSize: 10, cursor: 'pointer', background: '#ffe0e0', color: '#c00', border: '1px solid #eaa', fontFamily: F }}>
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
