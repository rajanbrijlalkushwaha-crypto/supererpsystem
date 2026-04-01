import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useCompany } from '../../context/CompanyContext';
import { useNavigate } from 'react-router-dom';

const Pending = () => {
  const { selectedCompany } = useCompany();
  const navigate = useNavigate();

  const [items, setItems]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [expandedId, setExpandedId]   = useState(null);
  const [filter, setFilter]       = useState('all');    // all | new | modified | client | vendor
  const [processing, setProcessing] = useState(false);
  const [msg, setMsg]             = useState({ text: '', type: '' });

  const load = useCallback(async () => {
    if (!selectedCompany) return;
    setLoading(true);
    try {
      const res = await axios.get('/api/tally/pending', { params: { companyId: selectedCompany.companyId } });
      setItems(res.data);
      setSelectedIds(new Set());
    } catch (err) {
      setMsg({ text: err.message, type: 'error' });
    } finally {
      setLoading(false);
    }
  }, [selectedCompany]);

  useEffect(() => { load(); }, [load]);

  const filtered = items.filter(i => {
    if (filter === 'new')      return i.changeType === 'new';
    if (filter === 'modified') return i.changeType === 'modified';
    if (filter === 'client')   return i.targetType === 'client';
    if (filter === 'vendor')   return i.targetType === 'vendor';
    return true;
  });

  const toggleSelect  = (id) => setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll     = () => selectedIds.size === filtered.length ? setSelectedIds(new Set()) : setSelectedIds(new Set(filtered.map(i => i.id)));

  const handleApprove = async (ids) => {
    if (!ids.length) { setMsg({ text: 'No items selected.', type: 'error' }); return; }
    if (!window.confirm(`Import ${ids.length} item(s) into ERP?`)) return;
    setProcessing(true);
    try {
      const res = await axios.post('/api/tally/approve', { ids, companyId: selectedCompany.companyId });
      const { imported } = res.data;
      setMsg({ text: `Imported: ${imported.clients} client(s), ${imported.vendors} vendor(s).`, type: 'success' });
      load();
    } catch (err) {
      setMsg({ text: err.response?.data?.error || err.message, type: 'error' });
    } finally {
      setProcessing(false);
    }
  };

  const handleReject = async (ids) => {
    if (!ids.length) return;
    if (!window.confirm(`Reject and discard ${ids.length} item(s)?`)) return;
    setProcessing(true);
    try {
      await axios.post('/api/tally/reject', { ids });
      setMsg({ text: `${ids.length} item(s) rejected and removed.`, type: 'success' });
      load();
    } catch (err) {
      setMsg({ text: err.response?.data?.error || err.message, type: 'error' });
    } finally {
      setProcessing(false);
    }
  };

  const newCount      = items.filter(i => i.changeType === 'new').length;
  const modifiedCount = items.filter(i => i.changeType === 'modified').length;
  const clientCount   = items.filter(i => i.targetType === 'client').length;
  const vendorCount   = items.filter(i => i.targetType === 'vendor').length;

  return (
    <div className="client-list-page">
      {/* Header */}
      <div className="client-list-header">
        <h2 className="form-title" style={{ margin: 0 }}>
          Tally Import — Pending Approval
          <span className="count-badge" style={{ background: items.length > 0 ? '#f59e0b' : '#94a3b8' }}>
            {items.length}
          </span>
        </h2>
        <div className="client-list-actions">
          <button className="add-button" style={{ marginTop: 0, background: '#0ea5e9' }} onClick={() => navigate('/tally/import')}>
            + New Import
          </button>
        </div>
      </div>

      {msg.text && (
        <div className={msg.type === 'success' ? 'success-message' : 'error-message'} style={{ marginBottom: 16 }}>
          {msg.text}
        </div>
      )}

      {/* Summary cards */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        {[
          { label: 'Total Pending', value: items.length,   color: '#f59e0b', bg: '#fffbeb', border: '#fde68a' },
          { label: 'New Entries',   value: newCount,        color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0' },
          { label: 'Modified',      value: modifiedCount,   color: '#ea580c', bg: '#fff7ed', border: '#fed7aa' },
          { label: 'Clients',       value: clientCount,     color: '#2563eb', bg: '#eff6ff', border: '#bfdbfe' },
          { label: 'Vendors',       value: vendorCount,     color: '#7c3aed', bg: '#f5f3ff', border: '#ddd6fe' },
        ].map(({ label, value, color, bg, border }) => (
          <div key={label} style={{ background: bg, border: `1px solid ${border}`, borderRadius: 10, padding: '12px 20px', minWidth: 120 }}>
            <div style={{ fontSize: 24, fontWeight: 800, color }}>{value}</div>
            <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Filter + bulk actions */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        {[
          { key: 'all',      label: 'All' },
          { key: 'new',      label: 'New' },
          { key: 'modified', label: 'Modified' },
          { key: 'client',   label: 'Clients' },
          { key: 'vendor',   label: 'Vendors' },
        ].map(({ key, label }) => (
          <button key={key} onClick={() => { setFilter(key); setSelectedIds(new Set()); }}
            style={{ padding: '5px 14px', borderRadius: 20, border: '1px solid', cursor: 'pointer', fontSize: 13,
              borderColor: filter === key ? '#1a3c6e' : '#e2e8f0',
              background: filter === key ? '#1a3c6e' : '#fff',
              color: filter === key ? '#fff' : '#374151', fontWeight: filter === key ? 600 : 400 }}>
            {label}
          </button>
        ))}

        {selectedIds.size > 0 && (
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <button className="approve-btn" onClick={() => handleApprove([...selectedIds])} disabled={processing}>
              {processing ? '…' : `✓ Approve ${selectedIds.size} Selected`}
            </button>
            <button className="delete-btn" onClick={() => handleReject([...selectedIds])} disabled={processing}>
              ✗ Reject {selectedIds.size} Selected
            </button>
          </div>
        )}
      </div>

      {loading ? (
        <div className="loading">Loading pending items…</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: '#94a3b8' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📋</div>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>
            {items.length === 0 ? 'No pending imports' : 'No items match this filter'}
          </div>
          <div style={{ fontSize: 13 }}>
            {items.length === 0 && (
              <button className="submit-btn" style={{ marginTop: 12 }} onClick={() => navigate('/tally/import')}>
                Start a New Import
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th style={{ width: 40 }}>
                  <input type="checkbox" checked={selectedIds.size === filtered.length && filtered.length > 0} onChange={toggleAll} />
                </th>
                <th>Change</th>
                <th>Name</th>
                <th>Type</th>
                <th>Tally Company</th>
                <th>GSTIN</th>
                <th>Phone / Email</th>
                <th>Fetched At</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(item => (
                <React.Fragment key={item.id}>
                  <tr style={{ background: selectedIds.has(item.id) ? '#f0f9ff' : '#fff', cursor: 'pointer' }}
                    onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}>
                    <td onClick={e => e.stopPropagation()}>
                      <input type="checkbox" checked={selectedIds.has(item.id)} onChange={() => toggleSelect(item.id)} />
                    </td>
                    <td>
                      <span className={`status-badge ${item.changeType === 'new' ? 'status-approved' : 'status-pending'}`}>
                        {item.changeType === 'new' ? '🆕 New' : '✏️ Modified'}
                      </span>
                    </td>
                    <td><strong>{item.data.companyName}</strong></td>
                    <td>
                      <span style={{ fontSize: 12, padding: '2px 8px', borderRadius: 4, fontWeight: 600,
                        background: item.targetType === 'client' ? '#dbeafe' : '#ede9fe',
                        color: item.targetType === 'client' ? '#1d4ed8' : '#7c3aed' }}>
                        {item.tallyType} → {item.targetType === 'client' ? 'Client' : 'Vendor'}
                      </span>
                    </td>
                    <td style={{ fontSize: 13 }}>{item.tallyCompany}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{item.data.gstin || '—'}</td>
                    <td style={{ fontSize: 12 }}>{item.data.phone || item.data.email || '—'}</td>
                    <td style={{ fontSize: 12, color: '#6b7280' }}>
                      {new Date(item.fetchedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </td>
                    <td onClick={e => e.stopPropagation()}>
                      <div className="action-buttons">
                        <button className="approve-btn" onClick={() => handleApprove([item.id])} disabled={processing}>
                          ✓ Import
                        </button>
                        <button className="delete-btn" onClick={() => handleReject([item.id])} disabled={processing}>
                          ✗
                        </button>
                      </div>
                    </td>
                  </tr>

                  {/* Expanded detail row */}
                  {expandedId === item.id && (
                    <tr>
                      <td colSpan={9} style={{ background: '#f8fafc', padding: 0 }}>
                        <div style={{ padding: '16px 24px', display: 'flex', gap: 32, flexWrap: 'wrap' }}>
                          <div>
                            <div style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>
                              Tally Data
                            </div>
                            {[
                              ['Company / Name', item.data.companyName],
                              ['Address', item.data.address],
                              ['State', item.data.state],
                              ['Pincode', item.data.pincode],
                              ['GSTIN', item.data.gstin],
                              ['Phone', item.data.phone],
                              ['Email', item.data.email],
                              ['Opening Balance', item.data.openingBalance],
                              ['Tally Group', item.data.tallyParent],
                            ].map(([k, v]) => v ? (
                              <div key={k} style={{ fontSize: 13, marginBottom: 4 }}>
                                <span style={{ color: '#6b7280', minWidth: 140, display: 'inline-block' }}>{k}:</span>
                                <span style={{ color: '#1e293b', fontWeight: 500 }}>{v}</span>
                              </div>
                            ) : null)}
                          </div>

                          {item.changeType === 'modified' && item.prevData && (
                            <div>
                              <div style={{ fontSize: 12, fontWeight: 700, color: '#f59e0b', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>
                                Previous (ERP) Data
                              </div>
                              {[
                                ['Company / Name', item.prevData.companyName],
                                ['Address', item.prevData.address],
                                ['State', item.prevData.state],
                                ['Pincode', item.prevData.pincode],
                                ['GSTIN', item.prevData.gstin],
                                ['Phone', item.prevData.phone],
                                ['Email', item.prevData.email],
                              ].map(([k, v]) => v ? (
                                <div key={k} style={{ fontSize: 13, marginBottom: 4 }}>
                                  <span style={{ color: '#6b7280', minWidth: 140, display: 'inline-block' }}>{k}:</span>
                                  <span style={{ color: '#dc2626', textDecoration: 'line-through' }}>{v}</span>
                                </div>
                              ) : null)}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
          <div className="table-footer">
            {filtered.length} item(s) pending — click a row to expand details
          </div>
        </div>
      )}
    </div>
  );
};

export default Pending;
