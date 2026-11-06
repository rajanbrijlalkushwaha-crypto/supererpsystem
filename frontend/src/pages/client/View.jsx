import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import { printClientDetails } from '../../utils/printClient';
import { useCompany } from '../../context/CompanyContext';
import { useAuth } from '../../context/AuthContext';
import { can } from '../../utils/permissions';
import ActivityDrawer from '../../components/ActivityDrawer';

const P  = '#3A6186';
const PD = '#2A4D6E';
const BG = '#F5F7FB';
const BD = '#000000';
const F  = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

const STATUS_MAP = {
  approved:  { dot:'#16a34a', letter:'A', label:'Approved'  },
  pending:   { dot:'#f59e0b', letter:'P', label:'Pending'   },
  draft:     { dot:'#94a3b8', letter:'D', label:'Draft'     },
  rejected:  { dot:'#ef4444', letter:'C', label:'Rejected'  },
  cancelled: { dot:'#ef4444', letter:'C', label:'Cancelled' },
};

const StatusBadge = ({ status }) => {
  const s = STATUS_MAP[status] || STATUS_MAP.draft;
  return (
    <span title={s.label} style={{ display:'inline-flex', alignItems:'center', justifyContent:'center',
      width:22, height:22, borderRadius:'50%', background:s.dot, color:'#fff',
      fontSize:11, fontWeight:800, flexShrink:0, lineHeight:1, fontFamily:F }}>
      {s.letter}
    </span>
  );
};

const ORDER_STATUS_MAP = {
  approved:   { bg:'#ECFDF5', color:'#059669', label:'Approved'   },
  pending:    { bg:'#FFFBEB', color:'#D97706', label:'Pending'    },
  draft:      { bg:'#EFF6FF', color:'#2563EB', label:'Draft'      },
  completed:  { bg:'#ECFDF5', color:'#15803D', label:'Completed'  },
  cancelled:  { bg:'#FEF2F2', color:'#DC2626', label:'Cancelled'  },
};
const fmtOrderD = v => {
  if (!v) return '—';
  const d = new Date(v);
  return isNaN(d) ? String(v) : d.toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' });
};
const fmtOrderAmt = n => `₹${Number(n||0).toLocaleString('en-IN', { minimumFractionDigits:2, maximumFractionDigits:2 })}`;

/* ── Detail Modal ── */
function ClientDetailModal({ client, onClose, onEdit, company }) {
  const { user } = useAuth();
  const [orders,        setOrders]        = useState([]);
  const [ordersLoading, setOrdersLoading]  = useState(false);

  useEffect(() => {
    if (!client?.clientId || !company?.companyId) { setOrders([]); return; }
    setOrdersLoading(true);
    axios.get(`/api/sales-orders?companyId=${company.companyId}`)
      .then(r => {
        const all = Array.isArray(r.data) ? r.data : [];
        setOrders(all.filter(o => String(o.customerCode) === String(client.clientId)));
      })
      .catch(() => setOrders([]))
      .finally(() => setOrdersLoading(false));
  }, [client?.clientId, company?.companyId]);

  if (!client) return null;
  const contact = client.contactPersons?.[0] || {};
  const orderTotal = orders.reduce((s, o) => s + (parseFloat(o.grandTotal) || 0), 0);
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
      <div style={{ background:'#fff', borderRadius:14, width:'95%', maxWidth:780,
        maxHeight:'88vh', display:'flex', flexDirection:'column',
        boxShadow:'0 24px 60px rgba(0,0,0,0.2)', overflow:'hidden' }}>
        <div style={{ background:`linear-gradient(135deg, ${P} 0%, ${PD} 100%)`,
          padding:'15px 20px', display:'flex', alignItems:'flex-start', justifyContent:'space-between' }}>
          <div>
            <div style={{ fontSize:10, color:'rgba(255,255,255,0.65)', fontWeight:500,
              textTransform:'uppercase', letterSpacing:'0.6px', marginBottom:3 }}>Client Details</div>
            <div style={{ fontSize:17, fontWeight:800, color:'#fff' }}>{client.companyName}</div>
            <div style={{ fontSize:11, color:'rgba(255,255,255,0.75)', marginTop:3, display:'flex', alignItems:'center', gap:8 }}>
              <span>ID: {client.clientId}</span>
              <StatusBadge status={client.status}/>
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
            <Field label="Credit Limit"   value={client.creditLimit ? `₹${Number(client.creditLimit).toFixed(2)}` : ''} />
          </div>

          {/* ── Sales Orders for this client ── */}
          <div style={{ marginTop:20 }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
              <div style={{ fontSize:10, color:'#9CA3AF', fontWeight:600, textTransform:'uppercase',
                letterSpacing:'0.5px', fontFamily:F }}>
                Sales Orders {orders.length > 0 && `(${orders.length})`}
              </div>
              {orders.length > 0 && (
                <div style={{ fontSize:11.5, fontWeight:700, color:'#111827', fontFamily:F }}>
                  Total: {fmtOrderAmt(orderTotal)}
                </div>
              )}
            </div>

            {ordersLoading ? (
              <div style={{ padding:'20px 0', textAlign:'center', color:'#9CA3AF', fontSize:12.5, fontFamily:F }}>
                Loading orders…
              </div>
            ) : orders.length === 0 ? (
              <div style={{ padding:'20px 0', textAlign:'center', color:'#9CA3AF', fontSize:12.5,
                fontStyle:'italic', fontFamily:F, border:`1px solid ${BD}`, borderRadius:8 }}>
                No sales orders for this client yet.
              </div>
            ) : (
              <div style={{ border:`1px solid ${BD}`, borderRadius:8, overflow:'hidden' }}>
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12, fontFamily:F }}>
                  <thead>
                    <tr style={{ background:BG }}>
                      {['Order No','Date','Status','Grand Total'].map(h => (
                        <th key={h} style={{ padding:'7px 10px', textAlign: h==='Grand Total' ? 'right' : 'left',
                          fontSize:10.5, fontWeight:700, color:'#6B7280', borderBottom:`1px solid ${BD}` }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {orders
                      .slice()
                      .sort((a,b) => new Date(b.orderDate||b.date||0) - new Date(a.orderDate||a.date||0))
                      .map(o => {
                        const os = ORDER_STATUS_MAP[o.status] || ORDER_STATUS_MAP.draft;
                        return (
                          <tr key={o.orderId} style={{ borderBottom:`1px solid ${BD}` }}>
                            <td style={{ padding:'7px 10px', fontWeight:700, color:'#111827' }}>{o.orderNo || o.orderId}</td>
                            <td style={{ padding:'7px 10px', color:'#111827' }}>{fmtOrderD(o.orderDate || o.date)}</td>
                            <td style={{ padding:'7px 10px' }}>
                              <span style={{ background:os.bg, color:os.color, padding:'2px 8px', borderRadius:20,
                                fontSize:10.5, fontWeight:700 }}>{os.label}</span>
                            </td>
                            <td style={{ padding:'7px 10px', textAlign:'right', fontWeight:700, color:'#111827' }}>
                              {fmtOrderAmt(o.grandTotal)}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
        <div style={{ padding:'10px 20px', borderTop:`1px solid ${BD}`,
          display:'flex', gap:8, justifyContent:'flex-end', background:BG }}>
          <button onClick={onClose} style={{ height:32, padding:'0 16px', fontSize:12, fontFamily:F,
            cursor:'pointer', background:'#fff', color:'#374151', border:`1px solid ${BD}`,
            borderRadius:7, fontWeight:600 }}>Close</button>
          <button onClick={() => printClientDetails(client, company, user)}
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
  const { user } = useAuth();
  const { pathname } = useLocation();
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

  /* Approve a pending client — shown only to users with Client approve rights */
  const handleApprove = async (client) => {
    if (!window.confirm(`Approve client ${client.companyName || client.clientId}?`)) return;
    try {
      const fd = new FormData();
      if (selectedCompany) fd.append('companyId', selectedCompany.companyId);
      fd.append('status', 'approved');
      await axios.put(`/api/clients/${client.clientId}`, fd, { headers:{ 'Content-Type':'multipart/form-data' } });
      setMessage(`Client ${client.clientId} approved.`);
      fetchClients();
    } catch (err) { setMessage('Error: ' + (err.response?.data?.error || err.message)); }
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
    { label:'Total',    value: clients.length,                                             color:'#fff',    fk:'all'      },
    { label:'Approved', value: clients.filter(c => c.status === 'approved').length,        color:'#4ade80', fk:'approved' },
    { label:'Pending',  value: clients.filter(c => c.status === 'pending').length,         color:'#fbbf24', fk:'pending'  },
    { label:'Draft',    value: clients.filter(c => !c.status||c.status==='draft').length,  color:'#a78bfa', fk:'draft'    },
  ];

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center',
      height:300, fontFamily:F, color:'#94A3B8', fontSize:14 }}>
      Loading clients…
    </div>
  );

  return (
    <div style={{ background:BG, fontFamily:F, display:'flex', flexDirection:'column', height:'100%' }}>
      <style>{`.cv-search::placeholder{color:rgba(255,255,255,0.45)}`}</style>

      {viewClient && (
        <ClientDetailModal
          client={viewClient} company={selectedCompany}
          onClose={() => setViewClient(null)}
          onEdit={id => navigate(`/client/edit/${id}`)}
        />
      )}

      {/* ══ Combined nav + toolbar — single row, matches main nav colour ══ */}
      <div style={{ flexShrink:0, height:40, background:P, borderBottom:`2px solid ${PD}`,
        display:'flex', alignItems:'stretch', overflow:'hidden', fontFamily:F }}>

        {/* Section label */}
        <div style={{ display:'flex', alignItems:'center', padding:'0 12px 0 10px',
          fontSize:11, fontWeight:800, color:'#fff', textTransform:'uppercase',
          letterSpacing:'0.8px', whiteSpace:'nowrap',
          borderRight:'2px solid rgba(255,255,255,0.18)', flexShrink:0 }}>
          CLIENTS
        </div>

        {/* + Create Client */}
        <button onClick={() => navigate('/client-sap')}
          style={{ display:'flex', alignItems:'center', padding:'0 14px', height:26, alignSelf:'center',
            fontSize:11.5, fontWeight:700, color:'#fff', background:'#059669',
            border:'1px solid rgba(255,255,255,0.3)', boxShadow:'0 2px 6px rgba(0,0,0,0.2)',
            cursor:'pointer', whiteSpace:'nowrap', flexShrink:0,
            margin:'0 6px', borderRadius:6 }}
          onMouseEnter={e => { e.currentTarget.style.background='#047857'; }}
          onMouseLeave={e => { e.currentTarget.style.background='#059669'; }}>
          + Create Client
        </button>

        {/* View Clients tab */}
        {[
          { label:'👥 View Clients', path:'/client/view' },
          { label:'⏳ Pending',      path:'/client/pending' },
          { label:'🧾 Tally',        path:'/client/tally' },
        ].map(tab => {
          const isAct = pathname === tab.path;
          return (
            <button key={tab.path} onClick={() => navigate(tab.path)}
              style={{ display:'flex', alignItems:'center', padding:'0 12px', height:26, alignSelf:'center',
                fontSize:11.5, fontWeight: isAct ? 700 : 600, cursor:'pointer',
                whiteSpace:'nowrap', flexShrink:0, fontFamily:F,
                color: isAct ? '#fff' : 'rgba(255,255,255,0.85)',
                background: isAct ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.07)',
                border:`1px solid ${isAct?'rgba(255,255,255,0.55)':'rgba(255,255,255,0.22)'}`,
                boxShadow: isAct?'0 2px 6px rgba(0,0,0,0.22)':'0 1px 2px rgba(0,0,0,0.12)',
                borderRadius:6, margin:'0 4px' }}
              onMouseEnter={e => { if (!isAct) { e.currentTarget.style.background='rgba(255,255,255,0.14)'; e.currentTarget.style.borderColor='rgba(255,255,255,0.55)'; } }}
              onMouseLeave={e => { if (!isAct) { e.currentTarget.style.background='rgba(255,255,255,0.07)'; e.currentTarget.style.borderColor='rgba(255,255,255,0.22)'; } }}>
              {tab.label}
            </button>
          );
        })}

        {/* Divider */}
        <div style={{ width:1, height:20, background:'rgba(255,255,255,0.2)', alignSelf:'center', flexShrink:0, margin:'0 6px' }} />

        {/* Count chips */}
        {kpis.map((k, i) => (
          <button key={i} onClick={() => setFilter(filter === k.fk ? 'all' : k.fk)}
            style={{ display:'inline-flex', alignItems:'center', gap:4, padding:'0 8px', height:24,
              alignSelf:'center', borderRadius:20, cursor:'pointer', fontFamily:F, flexShrink:0,
              transition:'all 0.12s', marginRight:3,
              border: filter === k.fk ? '1.5px solid rgba(255,255,255,0.85)' : '1.5px solid rgba(255,255,255,0.22)',
              background: filter === k.fk ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.07)' }}>
            <span style={{ fontSize:11.5, fontWeight:800, color:k.color, lineHeight:1 }}>{k.value}</span>
            <span style={{ fontSize:8.5, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.4px',
              color: filter === k.fk ? 'rgba(255,255,255,0.88)' : 'rgba(255,255,255,0.5)' }}>{k.label}</span>
          </button>
        ))}

        {/* Divider */}
        <div style={{ width:1, height:20, background:'rgba(255,255,255,0.2)', alignSelf:'center', flexShrink:0, margin:'0 6px' }} />

        {/* Search */}
        <div style={{ position:'relative', flex:1, minWidth:140, maxWidth:260, alignSelf:'center' }}>
          <span style={{ position:'absolute', left:7, top:'50%', transform:'translateY(-50%)',
            fontSize:11, color:'rgba(255,255,255,0.45)', pointerEvents:'none' }}>🔍</span>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search name, ID, GSTIN, city…"
            className="cv-search"
            style={{ width:'100%', height:26, paddingLeft:23, paddingRight: search ? 22 : 8,
              border:'1px solid rgba(255,255,255,0.22)', borderRadius:6, fontSize:11, fontFamily:F,
              outline:'none', background:'rgba(255,255,255,0.1)', color:'#fff', boxSizing:'border-box' }} />
          {search && (
            <button onClick={() => setSearch('')}
              style={{ position:'absolute', right:5, top:'50%', transform:'translateY(-50%)',
                background:'none', border:'none', cursor:'pointer', color:'rgba(255,255,255,0.55)',
                fontSize:12, padding:0, lineHeight:1 }}>✕</button>
          )}
        </div>

        {/* FY buttons */}
        {['all', ...fyList].map(f => (
          <button key={f} onClick={() => setFy(f)}
            style={{ height:24, padding:'0 9px', borderRadius:6, flexShrink:0, alignSelf:'center',
              marginLeft:4, cursor:'pointer', fontFamily:F, whiteSpace:'nowrap', fontSize:11, fontWeight:700,
              border: fy===f ? '1.5px solid rgba(255,255,255,0.88)' : '1px solid rgba(255,255,255,0.22)',
              background: fy===f ? 'rgba(255,255,255,0.88)' : 'rgba(255,255,255,0.07)',
              color: fy===f ? P : 'rgba(255,255,255,0.8)' }}>
            {f === 'all' ? 'All FY' : `FY ${f}`}
          </button>
        ))}

        {/* Count */}
        <span style={{ fontSize:10, color:'rgba(255,255,255,0.5)', alignSelf:'center',
          flexShrink:0, whiteSpace:'nowrap', margin:'0 8px' }}>
          {filtered.length}/{clients.length}
        </span>

        {/* Refresh */}
        <button onClick={fetchClients}
          style={{ display:'flex', alignItems:'center', gap:4, height:24, padding:'0 10px',
            alignSelf:'center', marginRight:8, flexShrink:0, cursor:'pointer', fontFamily:F,
            fontSize:11, fontWeight:700, borderRadius:6,
            background:'rgba(255,255,255,0.1)', color:'rgba(255,255,255,0.88)',
            border:'1px solid rgba(255,255,255,0.22)' }}>
          ↻ Refresh
        </button>
      </div>

      {message && (
        <div style={{ flexShrink:0, padding:'5px 12px', fontSize:12, fontFamily:F,
          borderBottom:`1px solid ${BD}`,
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
        <div style={{ flexShrink:0,
          background:`linear-gradient(90deg,${P},${PD})`,
          padding:'5px 12px', display:'flex', alignItems:'center', gap:8,
          boxShadow:'0 2px 6px rgba(0,0,0,0.18)' }}>
          <span style={{ fontSize:11, color:'rgba(255,255,255,0.8)' }}>▶</span>
          <span style={{ fontSize:12, fontWeight:700, color:'#fff', flex:1,
            overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
            {activeClient.clientId} · {activeClient.companyName}
          </span>
          {[
            { label:'👁 View',    action:() => setViewClient(activeClient) },
            ...(activeClient.status === 'pending' && can(user,'client','approve')
              ? [{ label:'✓ Approve', action:() => handleApprove(activeClient), ok:true }] : []),
            { label:'✏️ Edit',    action:() => navigate(`/client/edit/${activeClient.clientId}`) },
            { label:'🖨️ Print',  action:() => printClientDetails(activeClient, selectedCompany, user) },
            { label:'🗑️ Delete', action:() => handleDelete(activeClient.clientId), danger:true },
          ].map(btn => (
            <button key={btn.label} onClick={btn.action}
              style={{ height:26, padding:'0 11px', fontSize:11, cursor:'pointer', fontFamily:F,
                fontWeight:700, borderRadius:5, whiteSpace:'nowrap', border:'none',
                background: btn.danger ? 'rgba(220,38,38,0.35)' : btn.ok ? '#16A34A' : 'rgba(255,255,255,0.18)',
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
      <div style={{ flex:1, overflow:'auto' }}>
        {filtered.length === 0 ? (
          <div style={{ textAlign:'center', padding:'50px 20px', color:'#9CA3AF', fontSize:13,
            background:'#fff', border:`1px solid ${BD}` }}>
            {search ? `No clients match "${search}"` : 'No clients found. Click [+ Create Client] to add one.'}
          </div>
        ) : (
          <div style={{ background:'#fff' }}>
            <table style={{ width:'100%', minWidth:1150, borderCollapse:'collapse', fontSize:12, fontFamily:F }}>
                <thead>
                  <tr>
                    {['Client ID','Client Name','GSTIN','Address','City','State','Pincode','Mobile No','Email','Reg Date','Status'].map(h => (
                      <th key={h} style={{ padding:'7px 11px', background:P, color:'#fff',
                        fontSize:10, fontWeight:700, textAlign:'left', border:`1px solid ${PD}`,
                        fontFamily:F, letterSpacing:'0.3px', whiteSpace:'nowrap',
                        position:'sticky', top:0, zIndex:2 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((client) => {
                    const contact = client.contactPersons?.[0] || {};
                    const isSel   = selectedId === client.clientId;
                    const rowBg   = isSel ? '#EEF4FF' : '#fff'; // all rows white — no zebra striping
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
                          fontFamily:'monospace', fontSize:11, color:'#111827' }}>
                          {client.gstin || client.gst || '—'}
                        </td>
                        <td style={{ padding:'5px 11px', border:`1px solid ${BD}`, color:'#111827',
                          maxWidth:200, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}
                          title={client.address || ''}>
                          {client.address || '—'}
                        </td>
                        <td style={{ padding:'5px 11px', border:`1px solid ${BD}`, color:'#111827' }}>
                          {client.city || '—'}
                        </td>
                        <td style={{ padding:'5px 11px', border:`1px solid ${BD}`, color:'#111827' }}>
                          {client.state || '—'}
                        </td>
                        <td style={{ padding:'5px 11px', border:`1px solid ${BD}`,
                          color:'#111827', fontFamily:'monospace', fontSize:11.5 }}>
                          {client.pincode || '—'}
                        </td>
                        <td style={{ padding:'5px 11px', border:`1px solid ${BD}`,
                          color:'#111827', fontFamily:'monospace', fontSize:11.5 }}>
                          {contact.mobileNumber || '—'}
                        </td>
                        <td style={{ padding:'5px 11px', border:`1px solid ${BD}`, color:'#111827',
                          maxWidth:170, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}
                          title={contact.email || ''}>
                          {contact.email || '—'}
                        </td>
                        <td style={{ padding:'5px 11px', border:`1px solid ${BD}`, color:'#111827', fontSize:11, whiteSpace:'nowrap' }}>
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
