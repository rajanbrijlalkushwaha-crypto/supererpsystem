import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { printClientDetails } from '../../utils/printClient';
import { useCompany } from '../../context/CompanyContext';
import ActivityDrawer from '../../components/ActivityDrawer';

const P  = '#104f4f';
const PD = '#1A56D6';
const BG = '#F5F7FB';
const BD = '#E5EAF2';
const F  = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

const STATUS_MAP = {
  approved: { bg:'#ECFDF5', color:'#059669', dot:'#059669', label:'Approved' },
  pending:  { bg:'#FFFBEB', color:'#D97706', dot:'#D97706', label:'Pending'  },
  draft:    { bg:'#EFF6FF', color:'#104f4f', dot:'#93C5FD', label:'Draft'    },
};

const StatusBadge = ({ status }) => {
  const s = STATUS_MAP[status] || STATUS_MAP.draft;
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:4, padding:'2px 8px',
      borderRadius:20, fontSize:10.5, fontWeight:700, background:s.bg, color:s.color,
      border:`1px solid ${s.dot}40`, fontFamily:F }}>
      <span style={{ width:5, height:5, borderRadius:'50%', background:s.dot, flexShrink:0 }} />
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
    <div style={{ marginBottom:10 }}>
      <div style={{ fontSize:10, color:'#9CA3AF', fontWeight:600, textTransform:'uppercase',
        letterSpacing:'0.5px', marginBottom:2, fontFamily:F }}>{label}</div>
      <div style={{ fontSize:13, color:'#111827', fontWeight:500, fontFamily:F }}>{value || '—'}</div>
    </div>
  );
  return (
    <div onClick={e => e.target === e.currentTarget && onClose()}
      style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)',
        backdropFilter:'blur(2px)', zIndex:10000,
        display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ background:'#fff', borderRadius:14, width:'95%', maxWidth:620,
        maxHeight:'88vh', display:'flex', flexDirection:'column',
        boxShadow:'0 24px 60px rgba(0,0,0,0.2)', overflow:'hidden' }}>
        <div style={{ background:`linear-gradient(135deg, ${P} 0%, ${PD} 100%)`,
          padding:'15px 20px', display:'flex', alignItems:'flex-start', justifyContent:'space-between' }}>
          <div>
            <div style={{ fontSize:10, color:'rgba(255,255,255,0.65)', fontWeight:500,
              textTransform:'uppercase', letterSpacing:'0.6px', marginBottom:3 }}>Client Details</div>
            <div style={{ fontSize:17, fontWeight:800, color:'#fff' }}>{client.companyName}</div>
            <div style={{ fontSize:11, color:'rgba(255,255,255,0.75)', marginTop:3 }}>
              ID: {client.clientId}
              <span style={{ marginLeft:10, background:st.bg, color:st.color, padding:'1px 7px',
                borderRadius:20, fontSize:10, fontWeight:700 }}>{st.label}</span>
            </div>
          </div>
          <button onClick={onClose} style={{ background:'rgba(255,255,255,0.18)', border:'none',
            color:'#fff', width:28, height:28, borderRadius:7, cursor:'pointer', fontSize:15 }}>✕</button>
        </div>
        <div style={{ flex:1, overflowY:'auto', padding:'16px 20px' }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
            <Field label="Company Name"   value={client.companyName} />
            <Field label="Business Type"  value={client.businessType} />
            <Field label="Contact Person" value={contact.name || client.contactPerson} />
            <Field label="Mobile"         value={contact.mobileNumber || client.mobile} />
            <Field label="Email"          value={contact.email || client.email} />
            <Field label="GSTIN"          value={client.gstin || client.gst} />
            <Field label="PAN"            value={client.pan} />
            <Field label="City / State"   value={[client.city, client.state].filter(Boolean).join(', ')} />
            <Field label="Address"        value={client.address || client.billingAddr} />
            <Field label="Pincode"        value={client.pincode} />
            <Field label="Payment Terms"  value={client.paymentTerms} />
            <Field label="Credit Limit"   value={client.creditLimit ? `₹${Number(client.creditLimit).toLocaleString('en-IN')}` : ''} />
          </div>
        </div>
        <div style={{ padding:'10px 20px', borderTop:`1px solid ${BD}`,
          display:'flex', gap:8, justifyContent:'flex-end', background:BG }}>
          <button onClick={onClose} style={{ height:32, padding:'0 16px', fontSize:12, fontFamily:F,
            cursor:'pointer', background:'#fff', color:'#374151', border:`1px solid ${BD}`,
            borderRadius:7, fontWeight:600 }}>Close</button>
          <button onClick={() => printClientDetails(client, company)}
            style={{ height:32, padding:'0 16px', fontSize:12, fontFamily:F, cursor:'pointer',
              background:'#FFFBEB', color:'#D97706', border:'1px solid #FDE68A',
              borderRadius:7, fontWeight:700 }}>🖨️ Print</button>
          <button onClick={() => { onClose(); onEdit(client.clientId); }}
            style={{ height:32, padding:'0 18px', fontSize:12, fontFamily:F, cursor:'pointer',
              background:'#12B76A', color:'#fff', border:'none', borderRadius:7, fontWeight:700 }}>
            ✏️ Edit</button>
        </div>
      </div>
    </div>
  );
}

const getFY = d => { if(!d) return null; const dt=new Date(d); if(isNaN(dt)) return null; const y=dt.getFullYear(),m=dt.getMonth()+1,s=m>=4?y:y-1; return `${String(s).slice(2)}-${String(s+1).slice(2)}`; };
const fmtD2 = d => { if(!d) return '—'; const dt=new Date(d); return isNaN(dt)?d:`${String(dt.getDate()).padStart(2,'0')}-${String(dt.getMonth()+1).padStart(2,'0')}-${dt.getFullYear()}`; };

const ViewClients = () => {
  const [clients,    setClients]    = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [message,    setMessage]    = useState('');
  const [search,     setSearch]     = useState('');
  const [filter,     setFilter]     = useState('all');
  const [fy,         setFy]         = useState('all');
  const [selectedId,  setSelectedId]  = useState(null);
  const [viewClient,  setViewClient]  = useState(null);
  const [activityRec, setActivityRec] = useState(null);
  const navigate = useNavigate();
  const { selectedCompany } = useCompany();

  useEffect(() => { fetchClients(); }, [selectedCompany]);

  const fetchClients = async () => {
    try {
      setLoading(true);
      const params = selectedCompany ? { companyId: selectedCompany.companyId } : {};
      const res = await axios.get('/api/clients', { params });
      setClients(res.data.filter(c => c.status !== 'rejected'));
      setSelectedId(null);
    } catch (err) { setMessage('Error: ' + err.message); }
    finally { setLoading(false); }
  };

  const handleDelete = async (clientId) => {
    if (!window.confirm('Delete this client? Cannot be undone.')) return;
    try {
      await axios.delete(`/api/clients/${clientId}`);
      setSelectedId(null);
      fetchClients();
    } catch (err) { setMessage('Error: ' + err.message); }
  };

  const fyList = useMemo(() => {
    const set = new Set();
    clients.forEach(c => { const f = getFY(c.createdAt); if (f) set.add(f); });
    return Array.from(set).sort().reverse();
  }, [clients]);

  const filtered = clients.filter(c => {
    const q = search.toLowerCase();
    const matchQ = !q || (
      String(c.clientId).includes(q) ||
      (c.companyName || '').toLowerCase().includes(q) ||
      (c.city || '').toLowerCase().includes(q) ||
      (c.state || '').toLowerCase().includes(q) ||
      (c.gstin || c.gst || '').toLowerCase().includes(q) ||
      (c.contactPersons?.[0]?.name || '').toLowerCase().includes(q)
    );
    const matchF = filter === 'all' || (c.status || 'draft') === filter;
    const matchFY = fy === 'all' || getFY(c.createdAt) === fy;
    return matchQ && matchF && matchFY;
  });

  const activeClient = selectedId ? filtered.find(c => c.clientId === selectedId) : null;

  const kpis = [
    { label:'Total',    value: clients.length,                                          color:P,        fk:'all'      },
    { label:'Approved', value: clients.filter(c => c.status === 'approved').length,    color:'#059669', fk:'approved' },
    { label:'Pending',  value: clients.filter(c => c.status === 'pending').length,     color:'#D97706', fk:'pending'  },
    { label:'Draft',    value: clients.filter(c => !c.status||c.status==='draft').length, color:'#6366F1', fk:'draft' },
  ];

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center',
      height:300, fontFamily:F, color:'#94A3B8', fontSize:14 }}>
      Loading clients…
    </div>
  );

  return (
    <div style={{ background:BG, fontFamily:F, display:'flex', flexDirection:'column', height:'100%' }}>

      {viewClient && (
        <ClientDetailModal
          client={viewClient} company={selectedCompany}
          onClose={() => setViewClient(null)}
          onEdit={id => navigate(`/client/edit/${id}`)}
        />
      )}

      {/* ── KPI strip + Refresh (replaces the big header) ── */}
      <div style={{ flexShrink:0, background:'#fff', borderBottom:`2px solid ${BD}`,
        display:'flex', alignItems:'stretch' }}>
        {kpis.map((k, i) => (
          <div key={i} onClick={() => setFilter(filter === k.fk ? 'all' : k.fk)}
            style={{ flex:1, padding:'6px 14px', borderRight: i < 3 ? `1px solid ${BD}` : 'none',
              cursor:'pointer', transition:'background 0.12s',
              background: filter === k.fk ? '#EEF4FF' : '#fff',
              borderBottom: filter === k.fk ? `2px solid ${k.color}` : '2px solid transparent',
              display:'flex', alignItems:'center', gap:10 }}>
            <div style={{ fontSize:20, fontWeight:800, color:k.color, lineHeight:1 }}>{k.value}</div>
            <div style={{ fontSize:10, color: filter === k.fk ? k.color : '#6B7280',
              fontWeight:700, textTransform:'uppercase', letterSpacing:'0.3px' }}>{k.label}</div>
          </div>
        ))}
        {/* Refresh button pinned right */}
        <div style={{ display:'flex', alignItems:'center', padding:'0 12px', borderLeft:`1px solid ${BD}` }}>
          <button onClick={fetchClients}
            style={{ height:28, padding:'0 12px', fontSize:11, fontFamily:F, cursor:'pointer',
              background:'#EEF4FF', color:P, border:`1px solid #BFDBFE`,
              borderRadius:6, fontWeight:700 }}>↻ Refresh</button>
        </div>
      </div>

      {/* ── Toolbar ── */}
      <div style={{ flexShrink:0, padding:'7px 14px', background:'#fff',
        borderBottom:`1px solid ${BD}`, display:'flex', gap:8, alignItems:'center' }}>
        <div style={{ position:'relative', flex:1, maxWidth:320 }}>
          <span style={{ position:'absolute', left:8, top:'50%', transform:'translateY(-50%)',
            fontSize:12, color:'#9CA3AF' }}>🔍</span>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search name, ID, GSTIN, city…"
            style={{ width:'100%', height:30, paddingLeft:26, paddingRight:8,
              border:`1px solid ${BD}`, borderRadius:6, fontSize:12, fontFamily:F,
              outline:'none', background:'#F9FAFB', color:'#1F2937', boxSizing:'border-box' }} />
          {search && (
            <button onClick={() => setSearch('')}
              style={{ position:'absolute', right:6, top:'50%', transform:'translateY(-50%)',
                background:'none', border:'none', cursor:'pointer', color:'#9CA3AF', fontSize:13, padding:0 }}>✕</button>
          )}
        </div>
        {fyList.length > 0 && (
          <div style={{ display:'flex', gap:4, alignItems:'center', flexShrink:0 }}>
            {['all', ...fyList].map(f => (
              <button key={f} onClick={() => setFy(f)}
                style={{ height:28, padding:'0 10px', borderRadius:6, border:`1px solid ${fy===f ? P : BD}`, background: fy===f ? P : '#fff', color: fy===f ? '#fff' : '#374151', fontSize:11, fontWeight:600, cursor:'pointer', fontFamily:F, whiteSpace:'nowrap' }}>
                {f === 'all' ? 'All FY' : `FY ${f}`}
              </button>
            ))}
          </div>
        )}
        <button onClick={() => navigate('/client-sap')}
          style={{ height:30, padding:'0 14px', fontSize:12, fontFamily:F, cursor:'pointer',
            background:'#12B76A', color:'#fff', border:'none', borderRadius:6,
            fontWeight:700, flexShrink:0 }}>+ Create Client</button>
        <div style={{ marginLeft:'auto', fontSize:11, color:'#6B7280' }}>
          {filtered.length} / {clients.length}
        </div>
      </div>

      {message && (
        <div style={{ flexShrink:0, margin:'6px 14px 0', padding:'6px 12px', fontSize:12, fontFamily:F,
          background: message.includes('Error') ? '#FEF2F2' : '#ECFDF5',
          color: message.includes('Error') ? '#DC2626' : '#059669',
          border:`1px solid ${message.includes('Error') ? '#FECACA' : '#A7F3D0'}`,
          borderRadius:6, display:'flex', justifyContent:'space-between' }}>
          <span>{message}</span>
          <button onClick={() => setMessage('')}
            style={{ background:'none', border:'none', cursor:'pointer', fontSize:13, color:'inherit' }}>✕</button>
        </div>
      )}

      {/* ── Contextual Action Bar ── */}
      {activeClient && (
        <div style={{ flexShrink:0, margin:'6px 14px 0',
          background:'linear-gradient(90deg,#104f4f,#104f4f)', borderRadius:7,
          padding:'5px 12px', display:'flex', alignItems:'center', gap:8,
          boxShadow:'0 2px 8px rgba(37,99,235,0.25)' }}>
          <span style={{ fontSize:11, color:'rgba(255,255,255,0.8)' }}>▶</span>
          <span style={{ fontSize:12, fontWeight:700, color:'#fff', flex:1,
            overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
            {activeClient.clientId} · {activeClient.companyName}
          </span>
          {[
            { label:'👁 View',    action:() => setViewClient(activeClient) },
            { label:'✏️ Edit',    action:() => navigate(`/client/edit/${activeClient.clientId}`) },
            { label:'🖨️ Print',  action:() => printClientDetails(activeClient, selectedCompany) },
            { label:'🗑️ Delete', action:() => handleDelete(activeClient.clientId), danger:true },
          ].map(btn => (
            <button key={btn.label} onClick={btn.action}
              style={{ height:26, padding:'0 11px', fontSize:11, cursor:'pointer', fontFamily:F,
                fontWeight:700, borderRadius:5, whiteSpace:'nowrap', border:'none',
                background: btn.danger ? 'rgba(220,38,38,0.35)' : 'rgba(255,255,255,0.18)',
                color:'#fff' }}>
              {btn.label}
            </button>
          ))}
          <button onClick={() => setSelectedId(null)}
            style={{ height:26, width:26, background:'rgba(255,255,255,0.15)', border:'none',
              color:'#fff', borderRadius:5, cursor:'pointer', fontSize:13, flexShrink:0 }}>✕</button>
        </div>
      )}

      {/* ── Scrollable Table Area ── */}
      <div style={{ flex:1, overflow:'auto', padding:'8px 14px 14px' }}>
        {filtered.length === 0 ? (
          <div style={{ textAlign:'center', padding:'50px 20px', color:'#9CA3AF', fontSize:13,
            background:'#fff', borderRadius:8, border:`1px solid ${BD}` }}>
            {search ? `No clients match "${search}"` : 'No clients found. Click [+ Create Client] to add one.'}
          </div>
        ) : (
          <div style={{ background:'#fff', borderRadius:8, border:`1px solid ${BD}`,
            boxShadow:'0 1px 3px rgba(0,0,0,0.06)' }}>
            <table style={{ width:'100%', minWidth:750, borderCollapse:'collapse', fontSize:12, fontFamily:F }}>
                <thead>
                  <tr>
                    {['Client ID','Company Name','GSTIN','City / State','Contact','Mobile','Reg. Date','Status'].map(h => (
                      <th key={h} style={{ padding:'7px 11px', background:P, color:'#fff',
                        fontSize:10, fontWeight:700, textAlign:'left', border:`1px solid ${PD}`,
                        fontFamily:F, letterSpacing:'0.3px', whiteSpace:'nowrap',
                        position:'sticky', top:0, zIndex:2 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((client, i) => {
                    const contact = client.contactPersons?.[0] || {};
                    const isSel   = selectedId === client.clientId;
                    const rowBg   = isSel ? '#EEF4FF' : i % 2 === 0 ? '#fff' : '#FAFBFC';
                    return (
                      <tr key={client.clientId}
                        onClick={() => setSelectedId(isSel ? null : client.clientId)}
                        style={{ background:rowBg, transition:'background 0.1s', cursor:'pointer',
                          outline: isSel ? `2px solid ${P}` : 'none', outlineOffset:'-2px' }}
                        onMouseEnter={e => { if (!isSel) e.currentTarget.style.background='#F5F8FF'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = rowBg; }}>
                        <td style={{ padding:'5px 11px', border:`1px solid ${BD}` }}>
                          <span style={{ fontWeight:800, color:P, fontSize:12 }}>{client.clientId}</span>
                        </td>
                        <td style={{ padding:'5px 11px', border:`1px solid ${BD}`,
                          fontWeight:600, color:'#111827' }}>{client.companyName}</td>
                        <td style={{ padding:'5px 11px', border:`1px solid ${BD}`,
                          fontFamily:'monospace', fontSize:11, color:'#374151' }}>
                          {client.gstin || client.gst || '—'}
                        </td>
                        <td style={{ padding:'5px 11px', border:`1px solid ${BD}`, color:'#6B7280' }}>
                          {[client.city, client.state].filter(Boolean).join(', ') || '—'}
                        </td>
                        <td style={{ padding:'5px 11px', border:`1px solid ${BD}`, color:'#374151' }}>
                          {contact.name || '—'}
                        </td>
                        <td style={{ padding:'5px 11px', border:`1px solid ${BD}`,
                          color:'#374151', fontFamily:'monospace', fontSize:11.5 }}>
                          {contact.mobileNumber || '—'}
                        </td>
                        <td style={{ padding:'5px 11px', border:`1px solid ${BD}`, color:'#6B7280', fontSize:11, whiteSpace:'nowrap' }}>
                          {fmtD2(client.createdAt)}
                        </td>
                        <td style={{ padding:'5px 11px', border:`1px solid ${BD}` }}>
                          <StatusBadge status={client.status} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            <div style={{ padding:'5px 12px', background:BG, borderTop:`1px solid ${BD}`,
              fontSize:10.5, color:'#6B7280', fontFamily:F }}>
              {filtered.length} of {clients.length} clients · click a row to select
            </div>
          </div>
        )}
      </div>

      <ActivityDrawer record={activityRec} recordType="client" onClose={() => setActivityRec(null)} />
    </div>
  );
};

export default ViewClients;
