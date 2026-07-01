import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useCompany } from '../../context/CompanyContext';
import { useAuth } from '../../context/AuthContext';
import { can } from '../../utils/permissions';

const P  = '#104f4f';
const PD = '#104f4f';
const BG = '#F5F7FB';
const BD = '#E5EAF2';
const F  = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

/* ── Full Detail Modal ── */
function DetailModal({ client, onClose }) {
  const fields = [
    { section:'🏢 Identity', rows:[
      ['Client ID',     client.clientId],
      ['Company Name',  client.companyName || client.clientName],
      ['Business Type', client.businessType],
      ['Industry',      client.industryType],
      ['Category',      client.category],
    ]},
    { section:'📋 Tax & Compliance', rows:[
      ['GST Number',    client.gstin || client.gst],
      ['GST Type',      client.gstType],
      ['PAN Number',    client.pan],
      ['CIN',           client.cin],
      ['MSME No.',      client.msme],
      ['TDS Applicable',client.tdsApplicable ? 'Yes' : 'No'],
    ]},
    { section:'📞 Contact', rows:[
      ['Contact Person',(client.contactPersons?.[0]?.name) || client.contactPerson],
      ['Mobile',        (client.contactPersons?.[0]?.mobileNumber) || client.mobile],
      ['Email',         (client.contactPersons?.[0]?.email) || client.email],
      ['Website',       client.website],
    ]},
    { section:'📍 Address', rows:[
      ['Billing Address',client.address || client.billingAddr],
      ['City',          client.city],
      ['State',         client.state],
      ['Pincode',       client.pincode],
    ]},
    { section:'💳 Payment Terms', rows:[
      ['Payment Terms', client.paymentTerms],
      ['Credit Limit',  client.creditLimit ? `₹ ${Number(client.creditLimit).toLocaleString('en-IN')}` : ''],
      ['Currency',      client.currency],
    ]},
  ];
  return (
    <div onClick={e => e.target === e.currentTarget && onClose()}
      style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:9999,
        display:'flex', alignItems:'center', justifyContent:'center', fontFamily:F }}>
      <div style={{ background:'#fff', borderRadius:12, width:'min(820px,94vw)', maxHeight:'90vh',
        overflow:'hidden', display:'flex', flexDirection:'column',
        boxShadow:'0 20px 60px rgba(0,0,0,0.3)' }}>
        <div style={{ background:`linear-gradient(135deg,${P},${PD})`, color:'#fff',
          padding:'13px 20px', display:'flex', alignItems:'center',
          justifyContent:'space-between' }}>
          <div>
            <div style={{ fontWeight:700, fontSize:15 }}>{client.companyName || client.clientName}</div>
            <div style={{ fontSize:11, color:'rgba(255,255,255,0.7)', marginTop:2 }}>
              ID: {client.clientId} · Status: Pending Approval
            </div>
          </div>
          <button onClick={onClose}
            style={{ background:'rgba(255,255,255,0.15)', border:'1px solid rgba(255,255,255,0.2)',
              color:'#fff', borderRadius:6, width:28, height:28, fontSize:16, cursor:'pointer',
              display:'flex', alignItems:'center', justifyContent:'center' }}>×</button>
        </div>
        <div style={{ overflowY:'auto', padding:'14px 18px' }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            {fields.map(({ section, rows }) => (
              <div key={section} style={{ border:`1px solid ${BD}`, borderRadius:8, overflow:'hidden' }}>
                <div style={{ background:'#F1F5F9', padding:'5px 12px', fontSize:11,
                  fontWeight:700, color:'#1E293B', borderBottom:`1px solid ${BD}` }}>{section}</div>
                {rows.map(([label, value]) => (
                  <div key={label} style={{ display:'flex', borderBottom:`1px solid #F8FAFC`, padding:'4px 10px' }}>
                    <span style={{ fontSize:11, color:'#64748B', fontWeight:600, minWidth:120, flexShrink:0 }}>{label}</span>
                    <span style={{ fontSize:11, color:'#1E293B', wordBreak:'break-all' }}>{value || '—'}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
          {client.remarks && (
            <div style={{ marginTop:12, padding:'9px 14px', background:'#FEF9C3',
              border:'1px solid #FDE68A', borderRadius:8, fontSize:12, color:'#713F12' }}>
              <strong>Remarks:</strong> {client.remarks}
            </div>
          )}
        </div>
        <div style={{ padding:'10px 18px', borderTop:`1px solid ${BD}`,
          display:'flex', justifyContent:'flex-end', background:BG }}>
          <button onClick={onClose}
            style={{ padding:'6px 18px', background:P, color:'#fff', border:'none',
              borderRadius:6, cursor:'pointer', fontSize:12, fontWeight:700, fontFamily:F }}>Close</button>
        </div>
      </div>
    </div>
  );
}

/* ── Reject Modal ── */
function RejectModal({ client, onConfirm, onClose }) {
  const [reason, setReason] = useState('');
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', zIndex:10000,
      display:'flex', alignItems:'center', justifyContent:'center', fontFamily:F }}>
      <div style={{ background:'#fff', borderRadius:10, padding:22, maxWidth:440,
        width:'90%', boxShadow:'0 16px 48px rgba(0,0,0,0.25)' }}>
        <div style={{ fontWeight:700, fontSize:15, color:'#1E293B', marginBottom:6 }}>Reject Client</div>
        <p style={{ margin:'0 0 12px', fontSize:12.5, color:'#64748B' }}>
          Rejecting <strong>{client.companyName || client.clientName}</strong> ({client.clientId}).
        </p>
        <label style={{ fontSize:12, fontWeight:600, color:'#374151', display:'block', marginBottom:4 }}>
          Reason (optional)
        </label>
        <textarea value={reason} onChange={e => setReason(e.target.value)} rows={3}
          placeholder="Enter reason for rejection…"
          style={{ width:'100%', padding:'7px 10px', border:`1px solid ${BD}`, borderRadius:6,
            fontSize:12, fontFamily:F, resize:'vertical', boxSizing:'border-box', outline:'none' }} />
        <div style={{ display:'flex', justifyContent:'flex-end', gap:8, marginTop:12 }}>
          <button onClick={onClose}
            style={{ padding:'6px 16px', background:'#fff', border:`1px solid ${BD}`, borderRadius:6,
              cursor:'pointer', fontSize:12, fontWeight:600, fontFamily:F, color:'#374151' }}>Cancel</button>
          <button onClick={() => onConfirm(reason)}
            style={{ padding:'6px 16px', background:'#DC2626', border:'none', borderRadius:6,
              cursor:'pointer', fontSize:12, fontWeight:700, fontFamily:F, color:'#fff' }}>
            ✕ Reject Client
          </button>
        </div>
      </div>
    </div>
  );
}

const PendingClients = () => {
  const { user } = useAuth();
  const [clients,      setClients]      = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [message,      setMessage]      = useState('');
  const [search,       setSearch]       = useState('');
  const [selectedId,   setSelectedId]   = useState(null);   // single row click
  const [checked,      setChecked]      = useState(new Set()); // checkbox multi-select
  const [detailClient, setDetailClient] = useState(null);
  const [rejectTarget, setRejectTarget] = useState(null);
  const [working,      setWorking]      = useState(false);
  const navigate = useNavigate();
  const { selectedCompany } = useCompany();

  useEffect(() => { fetchClients(); }, [selectedCompany]);

  const fetchClients = async () => {
    try {
      setLoading(true);
      const params = selectedCompany ? { companyId: selectedCompany.companyId } : {};
      const res = await axios.get('/api/clients', { params });
      setClients(res.data.filter(c => c.status === 'pending'));
      setChecked(new Set()); setSelectedId(null);
    } catch (err) { setMessage('Error: ' + err.message); }
    finally { setLoading(false); }
  };

  const doApprove = async (clientId) => {
    const fd = new FormData();
    if (selectedCompany) fd.append('companyId', selectedCompany.companyId);
    fd.append('status', 'approved');
    await axios.put(`/api/clients/${clientId}`, fd, { headers:{ 'Content-Type':'multipart/form-data' } });
  };

  const handleApprove = async (clientId) => {
    if (!window.confirm('Approve this client?')) return;
    try { setWorking(true); await doApprove(clientId); setMessage(`Client approved.`); fetchClients(); }
    catch (err) { setMessage('Error: ' + err.message); }
    finally { setWorking(false); }
  };

  const handleApproveBulk = async () => {
    if (!window.confirm(`Approve ${checked.size} selected client${checked.size > 1 ? 's' : ''}?`)) return;
    setWorking(true);
    try {
      await Promise.all([...checked].map(id => doApprove(id)));
      setMessage(`${checked.size} client${checked.size > 1 ? 's' : ''} approved.`);
      fetchClients();
    } catch (err) { setMessage('Error: ' + err.message); }
    finally { setWorking(false); }
  };

  const handleRejectConfirm = async (reason) => {
    try {
      setWorking(true);
      const fd = new FormData();
      if (selectedCompany) fd.append('companyId', selectedCompany.companyId);
      fd.append('status', 'rejected');
      if (reason.trim()) fd.append('remarks', reason.trim());
      await axios.put(`/api/clients/${rejectTarget.clientId}`, fd, { headers:{ 'Content-Type':'multipart/form-data' } });
      setMessage(`Client ${rejectTarget.clientId} rejected.`);
      setRejectTarget(null); setSelectedId(null);
      fetchClients();
    } catch (err) { setMessage('Error: ' + err.message); }
    finally { setWorking(false); }
  };

  const handleRejectBulk = async () => {
    if (!window.confirm(`Reject ${checked.size} selected client${checked.size > 1 ? 's' : ''}?`)) return;
    setWorking(true);
    try {
      await Promise.all([...checked].map(async id => {
        const fd = new FormData();
        if (selectedCompany) fd.append('companyId', selectedCompany.companyId);
        fd.append('status', 'rejected');
        await axios.put(`/api/clients/${id}`, fd, { headers:{ 'Content-Type':'multipart/form-data' } });
      }));
      setMessage(`${checked.size} client${checked.size > 1 ? 's' : ''} rejected.`);
      fetchClients();
    } catch (err) { setMessage('Error: ' + err.message); }
    finally { setWorking(false); }
  };

  const toggleCheck = (id, e) => {
    e.stopPropagation();
    setChecked(prev => {
      const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next;
    });
  };

  const toggleAll = () => {
    if (checked.size === filtered.length) setChecked(new Set());
    else setChecked(new Set(filtered.map(c => c.clientId)));
  };

  const filtered = clients.filter(c => {
    const q = search.toLowerCase();
    return !q || (
      String(c.clientId).includes(q) ||
      (c.companyName || c.clientName || '').toLowerCase().includes(q) ||
      (c.city || '').toLowerCase().includes(q) ||
      (c.gstin || c.gst || '').toLowerCase().includes(q) ||
      (c.contactPersons?.[0]?.name || c.contactPerson || '').toLowerCase().includes(q)
    );
  });

  const singleActive = selectedId ? filtered.find(c => c.clientId === selectedId) : null;
  const multiActive  = checked.size > 0;

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center',
      height:300, fontFamily:F, color:'#94A3B8', fontSize:14 }}>
      Loading pending clients…
    </div>
  );

  return (
    <div style={{ background:BG, fontFamily:F, display:'flex', flexDirection:'column', height:'100%' }}>

      {detailClient && <DetailModal client={detailClient} onClose={() => setDetailClient(null)} />}
      {rejectTarget && <RejectModal client={rejectTarget} onConfirm={handleRejectConfirm} onClose={() => setRejectTarget(null)} />}

      {/* ── Header strip ── */}
      <div style={{ flexShrink:0, background:'#104f4f',
        padding:'9px 16px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div>
          <span style={{ fontSize:13, fontWeight:800, color:'#fff' }}>
            Client Approval Queue
          </span>
          <span style={{ marginLeft:10, background:'rgba(255,255,255,0.2)', color:'#fff',
            padding:'1px 10px', borderRadius:20, fontSize:11, fontWeight:700 }}>
            {clients.length} pending
          </span>
        </div>
        <button onClick={fetchClients}
          style={{ height:27, padding:'0 12px', fontSize:11, fontFamily:F, cursor:'pointer',
            background:'rgba(255,255,255,0.18)', color:'#fff',
            border:'1px solid rgba(255,255,255,0.3)', borderRadius:6, fontWeight:700 }}>
          ↻ Refresh
        </button>
      </div>

      {/* ── Toolbar ── */}
      <div style={{ flexShrink:0, padding:'7px 14px', background:'#fff',
        borderBottom:`1px solid ${BD}`, display:'flex', gap:8, alignItems:'center' }}>
        <div style={{ position:'relative', flex:1, maxWidth:320 }}>
          <span style={{ position:'absolute', left:8, top:'50%', transform:'translateY(-50%)',
            fontSize:12, color:'#9CA3AF' }}>🔍</span>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search name, ID, GSTIN…"
            style={{ width:'100%', height:30, paddingLeft:26, paddingRight:8,
              border:`1px solid ${BD}`, borderRadius:6, fontSize:12, fontFamily:F,
              outline:'none', background:'#F9FAFB', color:'#1F2937', boxSizing:'border-box' }} />
          {search && <button onClick={() => setSearch('')}
            style={{ position:'absolute', right:6, top:'50%', transform:'translateY(-50%)',
              background:'none', border:'none', cursor:'pointer', color:'#9CA3AF', fontSize:13, padding:0 }}>✕</button>}
        </div>
        <div style={{ marginLeft:'auto', fontSize:11, color:'#6B7280' }}>
          {filtered.length} pending
        </div>
      </div>

      {message && (
        <div style={{ flexShrink:0, margin:'6px 14px 0', padding:'6px 12px', fontSize:12,
          background: message.includes('Error') ? '#FEF2F2' : '#e8eef8',
          color: message.includes('Error') ? '#DC2626' : '#059669',
          border:`1px solid ${message.includes('Error') ? '#FECACA' : '#A7F3D0'}`,
          borderRadius:6, display:'flex', justifyContent:'space-between' }}>
          <span>{message}</span>
          <button onClick={() => setMessage('')}
            style={{ background:'none', border:'none', cursor:'pointer', fontSize:13, color:'inherit' }}>✕</button>
        </div>
      )}

      {/* ── Multi-select action bar ── */}
      {multiActive && (
        <div style={{ flexShrink:0, margin:'6px 14px 0',
          background:'#104f4f', borderRadius:7,
          padding:'5px 12px', display:'flex', alignItems:'center', gap:8,
          boxShadow:'0 2px 8px rgba(16,79,79,0.25)' }}>
          <span style={{ fontSize:12, fontWeight:700, color:'#fff', flex:1 }}>
            {checked.size} client{checked.size > 1 ? 's' : ''} selected
          </span>
          {can(user,'client','approve') && <button onClick={handleApproveBulk} disabled={working}
            style={{ height:26, padding:'0 14px', fontSize:11, cursor:'pointer', fontFamily:F,
              fontWeight:700, borderRadius:5, border:'none', whiteSpace:'nowrap',
              background:'rgba(16,185,129,0.85)', color:'#fff' }}>
            ✔ Approve {checked.size > 1 ? `All ${checked.size}` : ''}
          </button>}
          {can(user,'client','approve') && <button onClick={handleRejectBulk} disabled={working}
            style={{ height:26, padding:'0 14px', fontSize:11, cursor:'pointer', fontFamily:F,
              fontWeight:700, borderRadius:5, border:'none', whiteSpace:'nowrap',
              background:'rgba(220,38,38,0.8)', color:'#fff' }}>
            ✕ Reject {checked.size > 1 ? `All ${checked.size}` : ''}
          </button>}
          <button onClick={() => setChecked(new Set())}
            style={{ height:26, width:26, background:'rgba(255,255,255,0.15)', border:'none',
              color:'#fff', borderRadius:5, cursor:'pointer', fontSize:13, flexShrink:0 }}>✕</button>
        </div>
      )}

      {/* ── Single-row action bar ── */}
      {singleActive && !multiActive && (
        <div style={{ flexShrink:0, margin:'6px 14px 0',
          background:'linear-gradient(90deg,#104f4f,#104f4f)', borderRadius:7,
          padding:'5px 12px', display:'flex', alignItems:'center', gap:8,
          boxShadow:'0 2px 8px rgba(37,99,235,0.25)' }}>
          <span style={{ fontSize:12, fontWeight:700, color:'#fff', flex:1,
            overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
            ▶ {singleActive.clientId} · {singleActive.companyName || singleActive.clientName}
          </span>
          <button onClick={() => setDetailClient(singleActive)}
            style={{ height:26, padding:'0 11px', fontSize:11, cursor:'pointer', fontFamily:F,
              fontWeight:700, borderRadius:5, border:'none', whiteSpace:'nowrap',
              background:'rgba(255,255,255,0.18)', color:'#fff' }}>👁 View</button>
          <button onClick={() => navigate(`/client/edit/${singleActive.clientId}`)}
            style={{ height:26, padding:'0 11px', fontSize:11, cursor:'pointer', fontFamily:F,
              fontWeight:700, borderRadius:5, border:'none', whiteSpace:'nowrap',
              background:'rgba(255,255,255,0.18)', color:'#fff' }}>✏️ Edit</button>
          {can(user,'client','approve') && <button onClick={() => handleApprove(singleActive.clientId)} disabled={working}
            style={{ height:26, padding:'0 11px', fontSize:11, cursor:'pointer', fontFamily:F,
              fontWeight:700, borderRadius:5, border:'none', whiteSpace:'nowrap',
              background:'rgba(16,185,129,0.85)', color:'#fff' }}>✔ Approve</button>}
          {can(user,'client','approve') && <button onClick={() => { setRejectTarget(singleActive); }}
            style={{ height:26, padding:'0 11px', fontSize:11, cursor:'pointer', fontFamily:F,
              fontWeight:700, borderRadius:5, border:'none', whiteSpace:'nowrap',
              background:'rgba(220,38,38,0.45)', color:'#fff' }}>✕ Reject</button>}
          <button onClick={() => setSelectedId(null)}
            style={{ height:26, width:26, background:'rgba(255,255,255,0.15)', border:'none',
              color:'#fff', borderRadius:5, cursor:'pointer', fontSize:13, flexShrink:0 }}>✕</button>
        </div>
      )}

      {/* ── Scrollable Table ── */}
      <div style={{ flex:1, overflow:'auto', padding:'8px 14px 14px' }}>
        {filtered.length === 0 ? (
          <div style={{ textAlign:'center', padding:'50px 20px', color:'#9CA3AF', fontSize:13,
            background:'#fff', borderRadius:8, border:`1px solid ${BD}` }}>
            {search ? `No results for "${search}"` : 'No pending clients at the moment.'}
          </div>
        ) : (
          <div style={{ background:'#fff', borderRadius:8, border:`1px solid ${BD}`,
            boxShadow:'0 1px 3px rgba(0,0,0,0.06)' }}>
            <table style={{ width:'100%', minWidth:780, borderCollapse:'collapse', fontSize:12, fontFamily:F }}>
                <thead>
                  <tr>
                    <th style={{ padding:'7px 8px', background:'#104f4f', color:'#fff', fontSize:10,
                      fontWeight:700, border:'1px solid #0b3d3d', width:36, textAlign:'center',
                      position:'sticky', top:0, zIndex:2 }}>
                      <input type="checkbox"
                        checked={filtered.length > 0 && checked.size === filtered.length}
                        onChange={toggleAll}
                        style={{ cursor:'pointer', width:13, height:13, accentColor:'#fff' }} />
                    </th>
                    {['Client ID','Company Name','GSTIN','City / State','Contact','Mobile','Submitted'].map(h => (
                      <th key={h} style={{ padding:'7px 11px', background:'#104f4f', color:'#fff',
                        fontSize:10, fontWeight:700, textAlign:'left', border:'1px solid #0b3d3d',
                        whiteSpace:'nowrap', position:'sticky', top:0, zIndex:2 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((client, i) => {
                    const contact = client.contactPersons?.[0] || {};
                    const date    = client.updatedAt
                      ? new Date(client.updatedAt).toLocaleDateString('en-IN') : '—';
                    const isSel   = selectedId === client.clientId;
                    const isChk   = checked.has(client.clientId);
                    const rowBg   = isChk ? '#FFFBEB' : isSel ? '#e8eef8' : i % 2 === 0 ? '#fff' : '#FAFBFC';
                    return (
                      <tr key={client.clientId}
                        onClick={() => setSelectedId(isSel ? null : client.clientId)}
                        style={{ background:rowBg, transition:'background 0.1s', cursor:'pointer',
                          outline: isSel ? `2px solid ${P}` : 'none', outlineOffset:'-2px' }}
                        onMouseEnter={e => { if (!isSel && !isChk) e.currentTarget.style.background='#FFF7ED'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = rowBg; }}>
                        <td style={{ padding:'5px 8px', border:`1px solid ${BD}`, textAlign:'center' }}
                          onClick={e => toggleCheck(client.clientId, e)}>
                          <input type="checkbox" checked={isChk} readOnly
                            style={{ cursor:'pointer', width:13, height:13, accentColor:'#104f4f',
                              pointerEvents:'none' }} />
                        </td>
                        <td style={{ padding:'5px 11px', border:`1px solid ${BD}` }}>
                          <span style={{ fontWeight:800, color:'#104f4f', fontSize:12 }}>
                            {client.clientId}
                          </span>
                        </td>
                        <td style={{ padding:'5px 11px', border:`1px solid ${BD}`,
                          fontWeight:600, color:'#111827' }}>
                          {client.companyName || client.clientName}
                        </td>
                        <td style={{ padding:'5px 11px', border:`1px solid ${BD}`,
                          fontFamily:'monospace', fontSize:11, color:'#374151' }}>
                          {client.gstin || client.gst || '—'}
                        </td>
                        <td style={{ padding:'5px 11px', border:`1px solid ${BD}`, color:'#6B7280' }}>
                          {[client.city, client.state].filter(Boolean).join(', ') || '—'}
                        </td>
                        <td style={{ padding:'5px 11px', border:`1px solid ${BD}`, color:'#374151' }}>
                          {contact.name || client.contactPerson || '—'}
                        </td>
                        <td style={{ padding:'5px 11px', border:`1px solid ${BD}`,
                          fontFamily:'monospace', fontSize:11.5 }}>
                          {contact.mobileNumber || client.mobile || '—'}
                        </td>
                        <td style={{ padding:'5px 11px', border:`1px solid ${BD}`,
                          fontSize:11, color:'#6B7280' }}>{date}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            <div style={{ padding:'5px 12px', background:BG, borderTop:`1px solid ${BD}`,
              fontSize:10.5, color:'#6B7280', fontFamily:F }}>
              {filtered.length} pending · click row to select · use checkbox for bulk approve/reject
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PendingClients;
