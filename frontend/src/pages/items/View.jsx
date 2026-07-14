import { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { useCompany } from '../../context/CompanyContext';

const N  = '#3A6186';
const ND = '#2A4D6E';
const F  = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

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

  const th = { padding: '5px 8px', background: N, color: '#fff', fontSize: 10.5, fontWeight: 700, textAlign: 'left', whiteSpace: 'nowrap', border: `1px solid ${ND}`, position: 'sticky', top: 0, zIndex: 2 };
  const td = { padding: '5px 9px', fontSize: 11, fontFamily: F, border: '1px solid #e2e8f0', verticalAlign: 'middle' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', fontFamily: F }}>

      {/* ══ Single nav row ══ */}
      <div style={{ flexShrink: 0, height: 40, background: N, borderBottom: `2px solid ${ND}`,
        display: 'flex', alignItems: 'stretch', overflow: 'hidden', fontFamily: F }}>
        <style>{`.itm-srch::placeholder{color:rgba(255,255,255,0.45)}`}</style>

        {/* Search */}
        <div style={{ position: 'relative', minWidth: 180, maxWidth: 260, alignSelf: 'center', margin: '0 8px' }}>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search code / name / HSN…" className="itm-srch"
            style={{ width: '100%', height: 26, padding: '0 10px',
              border: '1px solid rgba(255,255,255,0.25)', borderRadius: 5, fontSize: 11, fontFamily: F,
              outline: 'none', background: 'rgba(255,255,255,0.12)', color: '#fff', boxSizing: 'border-box' }} />
        </div>

        {/* Filter chips */}
        {['All', 'Ready Product', 'Raw Material', 'Service'].map(f => {
          const isAct = filter === f;
          return (
            <button key={f} onClick={() => setFilter(f)}
              style={{ display: 'flex', alignItems: 'center', padding: '0 11px', height: '100%',
                fontSize: 11.5, fontWeight: isAct ? 700 : 400, border: 'none', cursor: 'pointer',
                whiteSpace: 'nowrap', flexShrink: 0, fontFamily: F,
                color: isAct ? '#fff' : 'rgba(255,255,255,0.65)',
                background: isAct ? 'rgba(255,255,255,0.15)' : 'transparent',
                borderBottom: isAct ? '2px solid rgba(255,255,255,0.85)' : '2px solid transparent',
                marginBottom: -2 }}>
              {f}
            </button>
          );
        })}

        {/* Refresh */}
        <button onClick={load}
          style={{ display: 'flex', alignItems: 'center', height: 26, padding: '0 10px', alignSelf: 'center',
            marginLeft: 6, flexShrink: 0, cursor: 'pointer', fontFamily: F, fontSize: 11, fontWeight: 700,
            borderRadius: 5, background: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.88)',
            border: '1px solid rgba(255,255,255,0.22)' }}>
          ↻ Refresh
        </button>

        {/* Count */}
        <span style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.55)', alignSelf: 'center',
          flexShrink: 0, whiteSpace: 'nowrap', margin: '0 8px' }}>
          {loading ? '…' : `${filtered.length} items`}
        </span>

        {/* + New Item */}
        <button onClick={() => navigate('/items/create')}
          style={{ height: 26, padding: '0 14px', alignSelf: 'center', marginRight: 8, flexShrink: 0,
            fontSize: 11, fontFamily: F, cursor: 'pointer', background: '#059669', color: '#fff',
            border: 'none', fontWeight: 700, borderRadius: 5, whiteSpace: 'nowrap', marginLeft: 'auto' }}>
          + New Item
        </button>
      </div>

      {/* Table */}
      <div style={{ flex: 1, overflow: 'auto' }}>
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
                  <td style={{ ...td, fontWeight: 700, color: '#0d2d6b' }}>{it.itemCode}</td>
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
                        style={{ padding: '1px 10px', fontSize: 10, cursor: 'pointer', background: '#e8f0ff', color: '#0d2d6b', border: '1px solid #aac', fontFamily: F, fontWeight: 600 }}>
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
