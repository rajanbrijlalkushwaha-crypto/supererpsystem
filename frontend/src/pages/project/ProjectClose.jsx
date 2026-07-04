import React, { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { useCompany } from '../../context/CompanyContext';

const F = "'Inter', -apple-system, BlinkMacSystemFont, sans-serif";
const P = '#104f4f';
const BD = '#E5EAF2';

const fmtD = ds => {
  if (!ds) return '—';
  const d = new Date(ds); if (isNaN(d)) return ds;
  return `${String(d.getDate()).padStart(2,'0')}-${String(d.getMonth()+1).padStart(2,'0')}-${d.getFullYear()}`;
};
const fmtINR = n => {
  const v = parseFloat(n)||0;
  if(v>=10000000) return `₹${(v/10000000).toFixed(2)} Cr`;
  if(v>=100000)   return `₹${(v/100000).toFixed(2)} L`;
  if(v>=1000)     return `₹${(v/1000).toFixed(1)} K`;
  return `₹${v.toFixed(0)}`;
};

const STATUS_COLORS = {
  approved:  { bg:'#dcfce7', color:'#16a34a' },
  completed: { bg:'#d1fae5', color:'#059669' },
  pending:   { bg:'#fef3c7', color:'#b45309' },
  rejected:  { bg:'#fee2e2', color:'#dc2626' },
  closed:    { bg:'#e5e7eb', color:'#6b7280' },
  draft:     { bg:'#f3f4f6', color:'#9ca3af' },
};
const statusChip = s => {
  const sc = STATUS_COLORS[s?.toLowerCase()] || { bg:'#f3f4f6', color:'#374151' };
  return <span style={{ display:'inline-block', padding:'2px 8px', borderRadius:5, fontSize:10, fontWeight:700, background:sc.bg, color:sc.color }}>{s||'—'}</span>;
};

export default function ProjectClose() {
  const { selectedCompany } = useCompany();
  const cid = selectedCompany?.companyId;

  const [projects, setProjects] = useState([]);
  const [sos,      setSos]      = useState([]);
  const [pos,      setPos]      = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [search,   setSearch]   = useState('');
  const [filter,   setFilter]   = useState('all'); // all | open | closed
  const [saving,   setSaving]   = useState({});
  const [expanded, setExpanded] = useState({});

  const load = useCallback(async () => {
    if (!cid) return;
    setLoading(true);
    try {
      const [pR, soR, poR] = await Promise.all([
        axios.get(`/api/projects?companyId=${cid}`).catch(()=>({data:[]})),
        axios.get(`/api/sales-orders?companyId=${cid}`).catch(()=>({data:[]})),
        axios.get(`/api/purchase-orders?companyId=${cid}`).catch(()=>({data:[]})),
      ]);
      setProjects(Array.isArray(pR.data) ? pR.data : []);
      setSos(Array.isArray(soR.data) ? soR.data : []);
      setPos(Array.isArray(poR.data) ? poR.data : []);
    } catch(e){ console.error(e); }
    setLoading(false);
  }, [cid]);

  useEffect(() => { load(); }, [load]);

  const toggleClose = async (proj) => {
    const newStatus = proj.status === 'closed' ? 'active' : 'closed';
    setSaving(s => ({ ...s, [proj.projectId||proj.id]: true }));
    try {
      await axios.put(`/api/projects/${proj.projectId||proj.id}?companyId=${cid}`, { ...proj, status: newStatus });
      setProjects(ps => ps.map(p => (p.projectId||p.id)===(proj.projectId||proj.id) ? { ...p, status: newStatus } : p));
    } catch(e){
      alert('Failed to update project status. Please try again.');
    }
    setSaving(s => ({ ...s, [proj.projectId||proj.id]: false }));
  };

  const filteredProjects = projects.filter(p => {
    const q = search.toLowerCase();
    const matchQ = !q || (p.projectName||'').toLowerCase().includes(q) || (p.projectId||'').toString().includes(q);
    const matchF = filter === 'all' || (filter === 'closed' ? p.status === 'closed' : p.status !== 'closed');
    return matchQ && matchF;
  });

  return (
    <div style={{ fontFamily:F, background:'#f0f4fb', minHeight:'100vh' }}>

      {/* Header */}
      <div style={{ background:'linear-gradient(135deg,#0b3d3d,#104f4f)', padding:'14px 20px' }}>
        <div style={{ fontSize:18, fontWeight:800, color:'#fff' }}>Project Close / Status</div>
        <div style={{ fontSize:11, color:'rgba(255,255,255,0.6)', marginTop:2 }}>
          Track ongoing projects and mark them as closed when complete. See linked SO and PO status.
        </div>
      </div>

      {/* Controls */}
      <div style={{ background:'#fff', borderBottom:`1px solid ${BD}`, padding:'10px 16px', display:'flex', gap:10, alignItems:'center', flexWrap:'wrap' }}>
        <input
          placeholder="Search project name or ID…"
          value={search}
          onChange={e=>setSearch(e.target.value)}
          style={{ height:32, padding:'0 10px', border:`1px solid ${BD}`, borderRadius:6, fontSize:12, fontFamily:F, outline:'none', width:220 }}
        />
        {['all','open','closed'].map(f=>(
          <button key={f} onClick={()=>setFilter(f)}
            style={{ height:32, padding:'0 14px', borderRadius:6, border:`1px solid ${filter===f?P:BD}`, background:filter===f?P:'transparent', color:filter===f?'#fff':'#374151', fontSize:12, fontWeight:filter===f?700:400, cursor:'pointer', fontFamily:F, textTransform:'capitalize' }}>
            {f}
          </button>
        ))}
        <div style={{ marginLeft:'auto', fontSize:11, color:'#6b7280' }}>
          {filteredProjects.length} project{filteredProjects.length!==1?'s':''}
          {loading && ' · Loading…'}
        </div>
        <button onClick={load} style={{ height:32, padding:'0 14px', background:'#f8faff', border:`1px solid ${BD}`, borderRadius:6, fontSize:12, cursor:'pointer', fontFamily:F }}>↻ Refresh</button>
      </div>

      {/* Legend */}
      <div style={{ background:'#fffbeb', borderBottom:`1px solid #fcd34d`, padding:'8px 18px', display:'flex', gap:16, alignItems:'center', flexWrap:'wrap' }}>
        <span style={{ fontSize:11, fontWeight:700, color:'#b45309' }}>Status Guide:</span>
        {[['Open / Active','Projects currently in progress'],['Closed','Completed — no further SO/PO expected']].map(([s,d])=>(
          <div key={s} style={{ display:'flex', alignItems:'center', gap:6 }}>
            <div style={{ width:8, height:8, borderRadius:'50%', background:s.includes('Closed')?'#6b7280':'#059669' }}/>
            <span style={{ fontSize:10.5, color:'#374151' }}><b>{s}</b> — {d}</span>
          </div>
        ))}
      </div>

      <div style={{ padding:'14px 16px', display:'flex', flexDirection:'column', gap:10 }}>

        {filteredProjects.length === 0 && !loading && (
          <div style={{ background:'#fff', border:`1px solid ${BD}`, borderRadius:10, padding:'40px', textAlign:'center', color:'#9ca3af', fontSize:13 }}>
            No projects found.
          </div>
        )}

        {filteredProjects.map(proj => {
          const pid = proj.projectId || proj.id;
          const isOpen = expanded[pid];
          const isClosed = proj.status === 'closed';
          const isSaving = saving[pid];

          // linked SOs: by projectId or projectRef
          const linkedSOs = sos.filter(o =>
            String(o.projectId||o.projectRef||'') === String(pid) ||
            (proj.projectName && (o.projectName||'').toLowerCase() === proj.projectName.toLowerCase())
          );
          // linked POs: via linked SO ids
          const soIds = new Set(linkedSOs.map(o=>String(o.orderId)));
          const linkedPOs = pos.filter(p => soIds.has(String(p.linkedSalesOrderId)));

          const allSOsDone = linkedSOs.length > 0 && linkedSOs.every(o=>['completed','approved'].includes(o.status));
          const allPOsDone = linkedPOs.length === 0 || linkedPOs.every(p=>['completed','approved'].includes(p.status));

          return (
            <div key={pid} style={{ background:'#fff', border:`1px solid ${isClosed?'#d1d5db':BD}`, borderRadius:10, overflow:'hidden', boxShadow:'0 1px 4px rgba(0,0,0,0.05)', opacity:isClosed?0.8:1 }}>
              {/* Row */}
              <div style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 16px', background:isClosed?'#f9fafb':'#fff' }}>
                <div style={{ width:10, height:10, borderRadius:'50%', flexShrink:0, background:isClosed?'#6b7280':allSOsDone&&allPOsDone?'#059669':'#f59e0b' }}/>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:13, fontWeight:700, color:isClosed?'#6b7280':'#111', display:'flex', alignItems:'center', gap:8 }}>
                    {proj.projectName||`Project #${pid}`}
                    {isClosed && <span style={{ fontSize:10, background:'#e5e7eb', color:'#6b7280', padding:'1px 7px', borderRadius:4, fontWeight:700 }}>CLOSED</span>}
                  </div>
                  <div style={{ fontSize:10.5, color:'#9ca3af', marginTop:2 }}>
                    ID: {pid}
                    {proj.startDate && ` · Started: ${fmtD(proj.startDate)}`}
                    {proj.endDate && ` · Target: ${fmtD(proj.endDate)}`}
                    {` · ${linkedSOs.length} SO · ${linkedPOs.length} PO`}
                  </div>
                </div>
                <div style={{ display:'flex', gap:8, alignItems:'center', flexShrink:0 }}>
                  {statusChip(proj.status||'active')}
                  <button
                    onClick={() => setExpanded(e => ({ ...e, [pid]: !isOpen }))}
                    style={{ padding:'5px 12px', border:`1px solid ${BD}`, borderRadius:6, background:'#f8faff', fontSize:11.5, cursor:'pointer', fontFamily:F, color:'#374151' }}>
                    {isOpen ? 'Hide ▲' : 'Details ▼'}
                  </button>
                  <button
                    disabled={isSaving}
                    onClick={() => toggleClose(proj)}
                    style={{ padding:'5px 14px', border:'none', borderRadius:6, background:isClosed?'#059669':'#dc2626', color:'#fff', fontSize:11.5, fontWeight:700, cursor:isSaving?'not-allowed':'pointer', fontFamily:F, opacity:isSaving?0.6:1 }}>
                    {isSaving ? '…' : isClosed ? 'Re-open' : 'Close Project'}
                  </button>
                </div>
              </div>

              {/* Expanded details */}
              {isOpen && (
                <div style={{ borderTop:`1px solid ${BD}`, padding:'12px 16px', background:'#fafbff' }}>
                  {/* Linked SOs */}
                  <div style={{ marginBottom:10 }}>
                    <div style={{ fontSize:11, fontWeight:700, color:'#374151', marginBottom:6, textTransform:'uppercase', letterSpacing:'0.4px' }}>
                      Sales Orders ({linkedSOs.length})
                    </div>
                    {linkedSOs.length === 0
                      ? <div style={{ fontSize:11, color:'#9ca3af', fontStyle:'italic' }}>No linked sales orders found</div>
                      : <div style={{ overflowX:'auto' }}>
                          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
                            <thead>
                              <tr style={{ background:'#104f4f' }}>
                                {['SO #','Order No','Client','Order Date','Delivery Date','Value','Status'].map((h,i)=>(
                                  <th key={i} style={{ padding:'6px 10px', color:'#fff', fontWeight:700, textAlign:i>=5?'right':'left', border:'1px solid #0b3d3d', whiteSpace:'nowrap' }}>{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {linkedSOs.map((o,ri)=>(
                                <tr key={o.orderId} style={{ background:ri%2===0?'#fff':'#f8faff' }}>
                                  <td style={{ padding:'6px 10px', border:`1px solid ${BD}`, fontWeight:700, color:P }}>{o.orderId}</td>
                                  <td style={{ padding:'6px 10px', border:`1px solid ${BD}`, fontWeight:600 }}>{o.orderNo||'—'}</td>
                                  <td style={{ padding:'6px 10px', border:`1px solid ${BD}` }}>{o.customerName||o.clientName||'—'}</td>
                                  <td style={{ padding:'6px 10px', border:`1px solid ${BD}`, color:'#6b7280' }}>{fmtD(o.orderDate)}</td>
                                  <td style={{ padding:'6px 10px', border:`1px solid ${BD}`, color:'#b45309' }}>{fmtD(o.deliveryDate||o.dueDate||'')}</td>
                                  <td style={{ padding:'6px 10px', border:`1px solid ${BD}`, textAlign:'right', fontWeight:700 }}>{fmtINR(o.grandTotal||0)}</td>
                                  <td style={{ padding:'6px 10px', border:`1px solid ${BD}`, textAlign:'right' }}>{statusChip(o.status)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                    }
                  </div>

                  {/* Linked POs */}
                  <div>
                    <div style={{ fontSize:11, fontWeight:700, color:'#374151', marginBottom:6, textTransform:'uppercase', letterSpacing:'0.4px' }}>
                      Purchase Orders ({linkedPOs.length})
                    </div>
                    {linkedPOs.length === 0
                      ? <div style={{ fontSize:11, color:'#9ca3af', fontStyle:'italic' }}>No linked purchase orders found</div>
                      : <div style={{ overflowX:'auto' }}>
                          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
                            <thead>
                              <tr style={{ background:'#7c2d12' }}>
                                {['PO #','PO No','Vendor','PO Date','Value','Linked SO','Status'].map((h,i)=>(
                                  <th key={i} style={{ padding:'6px 10px', color:'#fff', fontWeight:700, textAlign:i>=4?'right':'left', border:'1px solid #6b2110', whiteSpace:'nowrap' }}>{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {linkedPOs.map((p,ri)=>(
                                <tr key={p.orderId||p.poId} style={{ background:ri%2===0?'#fff':'#f8faff' }}>
                                  <td style={{ padding:'6px 10px', border:`1px solid ${BD}`, fontWeight:700, color:'#7c2d12' }}>{p.orderId||p.poId||'—'}</td>
                                  <td style={{ padding:'6px 10px', border:`1px solid ${BD}`, fontWeight:600 }}>{p.poNo||p.poNumber||'—'}</td>
                                  <td style={{ padding:'6px 10px', border:`1px solid ${BD}` }}>{p.vendorName||'—'}</td>
                                  <td style={{ padding:'6px 10px', border:`1px solid ${BD}`, color:'#6b7280' }}>{fmtD(p.poDate||p.createdAt)}</td>
                                  <td style={{ padding:'6px 10px', border:`1px solid ${BD}`, textAlign:'right', fontWeight:700 }}>{fmtINR(p.grandTotal||0)}</td>
                                  <td style={{ padding:'6px 10px', border:`1px solid ${BD}`, textAlign:'right', color:'#6b7280' }}>{p.linkedSalesOrderId||'—'}</td>
                                  <td style={{ padding:'6px 10px', border:`1px solid ${BD}`, textAlign:'right' }}>{statusChip(p.status)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                    }
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
