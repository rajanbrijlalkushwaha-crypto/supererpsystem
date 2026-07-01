import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { printClientDetails } from '../../utils/printClient';
import { useCompany } from '../../context/CompanyContext';

const P  = '#2F6FED';
const PD = '#1A56D6';
const BG = '#F5F7FB';
const BD = '#E5EAF2';
const F  = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

const STATUS_MAP = {
  approved: { bg:'#ECFDF5', color:'#059669', dot:'#059669', label:'Approved' },
  pending:  { bg:'#FFFBEB', color:'#D97706', dot:'#D97706', label:'Pending'  },
  draft:    { bg:'#EFF6FF', color:'#2563EB', dot:'#93C5FD', label:'Draft'    },
};

const StatusBadge = ({ status }) => {
  const s = STATUS_MAP[status] || STATUS_MAP.draft;
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'3px 10px',
      borderRadius:20, fontSize:11, fontWeight:700, background:s.bg, color:s.color,
      border:`1px solid ${s.dot}40`, fontFamily:F }}>
      <span style={{ width:6, height:6, borderRadius:'50%', background:s.dot, flexShrink:0 }} />
      {s.label || status || 'Draft'}
    </span>
  );
};

/* ── Detail Modal ── */
function ClientDetailModal({ client, onClose, onEdit, company }) {
  if (!client) return null;
  const contact = client.contactPersons?.[0] || {};
  const st = STATUS_MAP[client.status] || STATUS_MAP.draft;
  const Field = ({ label, value }) => (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 10, color: '#9CA3AF', fontWeight: 600, textTransform: 'uppercase',
        letterSpacing: '0.5px', marginBottom: 2, fontFamily: F }}>{label}</div>
      <div style={{ fontSize: 13, color: '#111827', fontWeight: 500, fontFamily: F }}>{value || '—'}</div>
    </div>
  );
  return (
    <div onClick={e => e.target === e.currentTarget && onClose()}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
        backdropFilter: 'blur(2px)', zIndex: 10000,
        display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#fff', borderRadius: 14, width: '95%', maxWidth: 620,
        maxHeight: '88vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 24px 60px rgba(0,0,0,0.2)', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ background: `linear-gradient(135deg, ${P} 0%, ${PD} 100%)`,
          padding: '18px 20px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)', fontWeight: 500,
              textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 4 }}>Client Details</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#fff' }}>{client.companyName}</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)', marginTop: 4 }}>
              ID: {client.clientId}
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginLeft: 12,
                background: st.bg, color: st.color, padding: '2px 8px', borderRadius: 20,
                fontSize: 11, fontWeight: 700 }}>
                {st.label}
              </span>
            </div>
          </div>
          <button onClick={onClose}
            style={{ background: 'rgba(255,255,255,0.18)', border: 'none', color: '#fff',
              width: 30, height: 30, borderRadius: 8, cursor: 'pointer', fontSize: 16 }}>✕</button>
        </div>
        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '18px 20px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <Field label="Company Name" value={client.companyName} />
            <Field label="Business Type" value={client.businessType} />
            <Field label="Contact Person" value={contact.name || client.contactPerson} />
            <Field label="Mobile" value={contact.mobileNumber || client.mobile} />
            <Field label="Email" value={contact.email || client.email} />
            <Field label="GSTIN" value={client.gstin || client.gst} />
            <Field label="PAN" value={client.pan} />
            <Field label="City / State" value={[client.city, client.state].filter(Boolean).join(', ')} />
            <Field label="Address" value={client.address || client.billingAddr} />
            <Field label="Pincode" value={client.pincode} />
            <Field label="Payment Terms" value={client.paymentTerms} />
            <Field label="Credit Limit" value={client.creditLimit ? `₹${Number(client.creditLimit).toLocaleString('en-IN')}` : ''} />
          </div>
        </div>
        {/* Footer */}
        <div style={{ padding: '12px 20px', borderTop: `1px solid ${BD}`,
          display: 'flex', gap: 8, justifyContent: 'flex-end', background: BG }}>
          <button onClick={onClose}
            style={{ height: 34, padding: '0 18px', fontSize: 12, fontFamily: F, cursor: 'pointer',
              background: '#fff', color: '#374151', border: `1px solid ${BD}`, borderRadius: 7, fontWeight: 600 }}>
            Close
          </button>
          <button onClick={() => printClientDetails(client, company)}
            style={{ height: 34, padding: '0 18px', fontSize: 12, fontFamily: F, cursor: 'pointer',
              background: '#FFFBEB', color: '#D97706', border: '1px solid #FDE68A', borderRadius: 7, fontWeight: 700 }}>
            🖨️ Print
          </button>
          <button onClick={() => { onClose(); onEdit(client.clientId); }}
            style={{ height: 34, padding: '0 20px', fontSize: 12, fontFamily: F, cursor: 'pointer',
              background: '#12B76A', color: '#fff', border: 'none', borderRadius: 7, fontWeight: 700,
              boxShadow: '0 2px 6px rgba(18,183,106,0.35)' }}>
            ✏️ Edit Client
          </button>
        </div>
      </div>
    </div>
  );
}

const ViewClients = () => {
  const [clients,  setClients]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [message,  setMessage]  = useState('');
  const [search,   setSearch]   = useState('');
  const [filter,   setFilter]   = useState('all');
  const [selected, setSelected] = useState(new Set());
  const [viewClient, setViewClient] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const navigate = useNavigate();
  const { selectedCompany } = useCompany();

  useEffect(() => { fetchClients(); }, [selectedCompany]);

  const fetchClients = async () => {
    try {
      setLoading(true);
      const params = selectedCompany ? { companyId: selectedCompany.companyId } : {};
      const response = await axios.get('/api/clients', { params });
      setClients(response.data.filter(c => c.status !== 'rejected'));
      setSelected(new Set());
    } catch (error) {
      setMessage('Error fetching clients: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (clientId) => {
    if (!window.confirm('Delete this client? This cannot be undone.')) return;
    try {
      await axios.delete(`/api/clients/${clientId}`);
      setMessage('Client deleted successfully');
      fetchClients();
    } catch (error) {
      setMessage('Error deleting client: ' + error.message);
    }
  };

  const handleDeleteSelected = async () => {
    if (selected.size === 0) return;
    if (!window.confirm(`Delete ${selected.size} selected client${selected.size > 1 ? 's' : ''}? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      await Promise.all([...selected].map(id => axios.delete(`/api/clients/${id}`)));
      setMessage(`${selected.size} client${selected.size > 1 ? 's' : ''} deleted`);
      fetchClients();
    } catch (error) {
      setMessage('Error deleting clients: ' + error.message);
    } finally { setDeleting(false); }
  };

  const toggleSelect = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map(c => c.clientId)));
  };

  const filtered = clients.filter(c => {
    const q = search.toLowerCase();
    const matchQ = !q || (
      String(c.clientId).includes(q) ||
      (c.companyName || '').toLowerCase().includes(q) ||
      (c.city || '').toLowerCase().includes(q) ||
      (c.state || '').toLowerCase().includes(q) ||
      (c.contactPersons?.[0]?.name || '').toLowerCase().includes(q)
    );
    const matchF = filter === 'all' || (c.status || 'draft') === filter;
    return matchQ && matchF;
  });

  const kpis = {
    total:    clients.length,
    approved: clients.filter(c => c.status === 'approved').length,
    pending:  clients.filter(c => c.status === 'pending').length,
    draft:    clients.filter(c => !c.status || c.status === 'draft').length,
  };

  const th = {
    padding:'9px 12px', background:P, color:'#fff',
    fontSize:11, fontWeight:700, textAlign:'left',
    whiteSpace:'nowrap', border:`1px solid ${PD}`,
    fontFamily:F, letterSpacing:'0.3px',
  };
  const td = {
    padding:'10px 12px', fontSize:12, fontFamily:F,
    border:`1px solid ${BD}`, verticalAlign:'middle',
  };

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center',
      height:300, fontFamily:F, color:'#94A3B8', fontSize:14 }}>
      Loading clients…
    </div>
  );

  return (
    <div style={{ background:BG, minHeight:'100%', fontFamily:F }}>

      {viewClient && (
        <ClientDetailModal
          client={viewClient}
          company={selectedCompany}
          onClose={() => setViewClient(null)}
          onEdit={id => navigate(`/client/edit/${id}`)}
        />
      )}

      {/* Page Header */}
      <div style={{ background:P, padding:'14px 20px',
        display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div>
          <div style={{ fontSize:15, fontWeight:800, color:'#fff', letterSpacing:'-0.2px' }}>
            Client Master
          </div>
          <div style={{ fontSize:11, color:'rgba(255,255,255,0.6)', marginTop:2, fontWeight:500 }}>
            {clients.length} client{clients.length !== 1 ? 's' : ''} registered — double-click row to view details
          </div>
        </div>
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          <button onClick={fetchClients}
            style={{ height:32, padding:'0 14px', fontSize:12, fontFamily:F, cursor:'pointer',
              background:'rgba(255,255,255,0.12)', color:'#fff',
              border:'1px solid rgba(255,255,255,0.25)', borderRadius:6, fontWeight:600 }}>
            ↻ Refresh
          </button>
          <button onClick={() => navigate('/client/create')}
            style={{ height:32, padding:'0 16px', fontSize:12, fontFamily:F, cursor:'pointer',
              background:'#fff', color:P, border:'none', borderRadius:6, fontWeight:800 }}>
            + New Client
          </button>
        </div>
      </div>

      {/* KPI strip */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)',
        borderBottom:`1px solid ${BD}`, background:'#fff' }}>
        {[
          { label:'Total Clients', value:kpis.total,    color:P,        fk:'all'      },
          { label:'Approved',      value:kpis.approved, color:'#059669', fk:'approved' },
          { label:'Pending',       value:kpis.pending,  color:'#D97706', fk:'pending'  },
          { label:'Draft',         value:kpis.draft,    color:'#6366F1', fk:'draft'    },
        ].map((k,i) => (
          <div key={i} onClick={() => setFilter(k.fk)}
            style={{ padding:'12px 20px', borderRight: i < 3 ? `1px solid ${BD}` : 'none',
              cursor:'pointer', transition:'background 0.15s',
              background: filter === k.fk ? '#F0F4FF' : '#fff' }}>
            <div style={{ fontSize:11, color:'#6B7280', fontWeight:600, marginBottom:4 }}>{k.label}</div>
            <div style={{ fontSize:22, fontWeight:800, color:k.color }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div style={{ padding:'10px 16px', background:'#fff', borderBottom:`1px solid ${BD}`,
        display:'flex', gap:8, alignItems:'center' }}>
        <div style={{ position:'relative', flex:1, maxWidth:340 }}>
          <span style={{ position:'absolute', left:9, top:'50%', transform:'translateY(-50%)',
            fontSize:13, color:'#9CA3AF' }}>🔍</span>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, ID, city, contact…"
            style={{ width:'100%', height:32, paddingLeft:30, paddingRight:8,
              border:`1px solid ${BD}`, borderRadius:6, fontSize:12, fontFamily:F,
              outline:'none', background:'#F9FAFB', color:'#1F2937', boxSizing:'border-box' }} />
          {search && (
            <button onClick={() => setSearch('')}
              style={{ position:'absolute', right:6, top:'50%', transform:'translateY(-50%)',
                background:'none', border:'none', cursor:'pointer', color:'#9CA3AF', fontSize:14, padding:0 }}>✕</button>
          )}
        </div>

        {/* Selection action buttons */}
        {selected.size > 0 && (
          <div style={{ display:'flex', gap:6, alignItems:'center',
            background:'#EEF4FF', border:`1px solid #BFDBFE`, borderRadius:8,
            padding:'6px 12px' }}>
            <span style={{ fontSize:12, fontWeight:700, color:P }}>
              {selected.size} selected
            </span>
            <div style={{ width:1, height:18, background:'#BFDBFE' }} />
            {selected.size === 1 && (
              <button
                onClick={() => {
                  const id = [...selected][0];
                  navigate(`/client/edit/${id}`);
                }}
                style={{ height:28, padding:'0 12px', fontSize:11, cursor:'pointer',
                  background:'#ECFDF5', color:'#059669', border:'1px solid #A7F3D0',
                  borderRadius:6, fontWeight:700, fontFamily:F }}>
                ✏️ Edit
              </button>
            )}
            <button onClick={handleDeleteSelected} disabled={deleting}
              style={{ height:28, padding:'0 12px', fontSize:11, cursor:'pointer',
                background:'#FEF2F2', color:'#DC2626', border:'1px solid #FECACA',
                borderRadius:6, fontWeight:700, fontFamily:F,
                opacity: deleting ? 0.6 : 1 }}>
              🗑️ {deleting ? 'Deleting…' : `Delete ${selected.size > 1 ? selected.size + ' clients' : 'client'}`}
            </button>
            <button onClick={() => setSelected(new Set())}
              style={{ height:28, padding:'0 8px', fontSize:11, cursor:'pointer',
                background:'none', color:'#6B7280', border:'none', fontFamily:F }}>
              ✕
            </button>
          </div>
        )}

        <div style={{ marginLeft:'auto', fontSize:11, color:'#6B7280', fontWeight:500 }}>
          {filtered.length} of {clients.length} clients
        </div>
      </div>

      {message && (
        <div style={{ margin:'10px 16px 0', padding:'8px 14px', fontSize:12, fontFamily:F,
          background: message.includes('Error') ? '#FEF2F2' : '#ECFDF5',
          color: message.includes('Error') ? '#DC2626' : '#059669',
          border:`1px solid ${message.includes('Error') ? '#FECACA' : '#A7F3D0'}`,
          borderRadius:6 }}>
          {message}
          <button onClick={() => setMessage('')}
            style={{ float:'right', background:'none', border:'none', cursor:'pointer', fontSize:14, color:'inherit' }}>✕</button>
        </div>
      )}

      {/* Table */}
      <div style={{ padding:'12px 16px' }}>
        {filtered.length === 0 ? (
          <div style={{ textAlign:'center', padding:'60px 20px', color:'#9CA3AF', fontSize:13,
            background:'#fff', borderRadius:8, border:`1px solid ${BD}` }}>
            {search ? `No clients match "${search}"` : 'No clients found. Click [+ New Client] to add one.'}
          </div>
        ) : (
          <div style={{ background:'#fff', borderRadius:8, border:`1px solid ${BD}`,
            boxShadow:'0 1px 3px rgba(0,0,0,0.06)', overflow:'hidden' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12, fontFamily:F }}>
              <thead>
                <tr>
                  <th style={{ ...th, width:40, textAlign:'center', padding:'9px 8px' }}>
                    <input type="checkbox"
                      checked={filtered.length > 0 && selected.size === filtered.length}
                      onChange={toggleAll}
                      style={{ cursor:'pointer', width:14, height:14, accentColor:P }} />
                  </th>
                  <th style={th}>Client ID</th>
                  <th style={th}>Company Name</th>
                  <th style={th}>City / State</th>
                  <th style={th}>Contact Person</th>
                  <th style={th}>Mobile</th>
                  <th style={{ ...th, textAlign:'center' }}>Status</th>
                  <th style={{ ...th, textAlign:'center' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((client, i) => {
                  const contact = client.contactPersons?.[0] || {};
                  const isSel = selected.has(client.clientId);
                  return (
                    <tr key={client.clientId}
                      onDoubleClick={() => setViewClient(client)}
                      style={{ background: isSel ? '#EEF4FF' : i % 2 === 0 ? '#fff' : '#FAFBFC',
                        transition:'background 0.12s', cursor:'default',
                        outline: isSel ? `2px solid ${P}40` : 'none' }}
                      onMouseEnter={e => { if (!isSel) e.currentTarget.style.background='#F5F8FF'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = isSel ? '#EEF4FF' : i % 2 === 0 ? '#fff' : '#FAFBFC'; }}>
                      <td style={{ ...td, textAlign:'center', padding:'8px' }}>
                        <input type="checkbox" checked={isSel}
                          onChange={() => toggleSelect(client.clientId)}
                          onClick={e => e.stopPropagation()}
                          style={{ cursor:'pointer', width:14, height:14, accentColor:P }} />
                      </td>
                      <td style={td}>
                        <span style={{ fontWeight:800, color:P, fontSize:12.5 }}>{client.clientId}</span>
                      </td>
                      <td style={{ ...td, fontWeight:600, color:'#111827' }}>{client.companyName}</td>
                      <td style={{ ...td, color:'#6B7280' }}>
                        {[client.city, client.state].filter(Boolean).join(', ') || '—'}
                      </td>
                      <td style={{ ...td, color:'#374151' }}>{contact.name || '—'}</td>
                      <td style={{ ...td, color:'#374151', fontFamily:'monospace', fontSize:11.5 }}>
                        {contact.mobileNumber || '—'}
                      </td>
                      <td style={{ ...td, textAlign:'center' }}>
                        <StatusBadge status={client.status} />
                      </td>
                      <td style={{ ...td, textAlign:'center' }}>
                        <div style={{ display:'flex', gap:5, justifyContent:'center' }}>
                          <button onClick={e => { e.stopPropagation(); navigate(`/client/edit/${client.clientId}`); }}
                            style={{ padding:'4px 10px', fontSize:11, cursor:'pointer', fontFamily:F, fontWeight:600,
                              background:'#F0FFF4', color:'#059669', border:'1px solid #A7F3D0', borderRadius:5 }}>
                            ✏️ Edit
                          </button>
                          <button onClick={e => { e.stopPropagation(); setViewClient(client); }}
                            style={{ padding:'4px 10px', fontSize:11, cursor:'pointer', fontFamily:F, fontWeight:600,
                              background:'#EEF4FF', color:P, border:`1px solid #BFDBFE`, borderRadius:5 }}>
                            👁 View
                          </button>
                          <button onClick={e => { e.stopPropagation(); printClientDetails(client, selectedCompany); }}
                            style={{ padding:'4px 10px', fontSize:11, cursor:'pointer', fontFamily:F, fontWeight:600,
                              background:'#FFFBEB', color:'#D97706', border:'1px solid #FDE68A', borderRadius:5 }}>
                            🖨️
                          </button>
                          <button onClick={e => { e.stopPropagation(); handleDelete(client.clientId); }}
                            style={{ padding:'4px 10px', fontSize:11, cursor:'pointer', fontFamily:F, fontWeight:600,
                              background:'#FEF2F2', color:'#DC2626', border:'1px solid #FECACA', borderRadius:5 }}>
                            🗑️
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div style={{ padding:'8px 14px', background:BG, borderTop:`1px solid ${BD}`,
              fontSize:11, color:'#6B7280', fontFamily:F, display:'flex', justifyContent:'space-between' }}>
              <span>Showing {filtered.length} of {clients.length} clients</span>
              {selected.size > 0 && (
                <span style={{ color:P, fontWeight:600 }}>{selected.size} selected</span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ViewClients;
