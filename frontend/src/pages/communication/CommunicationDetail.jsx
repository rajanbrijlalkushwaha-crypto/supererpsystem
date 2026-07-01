import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useCompany } from '../../context/CompanyContext';
import { useAuth } from '../../context/AuthContext';
import PageLoader from '../../components/PageLoader';

const F  = "'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif";
const P  = '#104f4f';
const P2 = '#0284c7';

const STATUS_ST = {
  Completed: { bg:'#16a34a', color:'#fff', dot:'#16a34a' },
  Pending:   { bg:'#f59e0b', color:'#fff', dot:'#f59e0b' },
  Upcoming:  { bg:'#3b82f6', color:'#fff', dot:'#3b82f6' },
};

const STAGES = [
  'LOA Received','Order Received','Order Confirmation Sent','Quotation Sent',
  'Drawing Submitted','Drawing Approved','Material Procurement','Material Dispatched',
  'Invoice Raised','Invoice Sent by Courier','Payment Follow-up','Payment Received',
  'Advance Received','Sales Bill Created','Delivery Challan Issued',
  'Site Visit','Installation Completed','Project Closed',
];
const DEPTS = ['Sales','Design','Purchase','Stores','Accounts','Projects','Admin','Operations'];

const fmtDate = d => {
  if (!d) return '—';
  const s = String(d).split('T')[0];
  const [y,m,dd] = s.split('-');
  if (y && y.length===4 && m && dd) return `${dd}-${m}-${y}`;
  return s;
};
const todayISO      = () => new Date().toISOString().slice(0,10);
const isoToDDMMYYYY = iso => { if (!iso) return ''; const [y,m,d]=iso.split('-'); return `${d}-${m}-${y}`; };
const ddmmyyyyToISO = str => {
  if (!str||str.length<10) return null;
  const [dd,mm,yyyy]=str.split('-');
  if (!dd||!mm||!yyyy||yyyy.length!==4) return null;
  const iso=`${yyyy}-${mm}-${dd}`;
  return isNaN(new Date(iso).getTime())?null:iso;
};
const fmtDateTime = iso => {
  if (!iso) return '';
  try { return new Date(iso).toLocaleString('en-IN',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}); }
  catch { return ''; }
};
const fmtMoney = n => n!=null&&n!==''&&!isNaN(n) ? '₹ '+Number(n).toLocaleString('en-IN') : '—';

const EMPTY_FORM = {
  date:'', stage:'', description:'', department:'', referenceNo:'', by:'', status:'Completed', remarks:'',
};

export default function CommunicationDetail() {
  const { orderId } = useParams();
  const { selectedCompany } = useCompany();
  const { user }  = useAuth();
  const navigate  = useNavigate();
  const cid       = selectedCompany?.companyId;

  const [order,    setOrder]   = useState(null);
  const [logs,     setLogs]    = useState([]);
  const [loading,  setLoading] = useState(true);
  const [showForm, setShowForm]= useState(false);
  const [saving,   setSaving]  = useState(false);
  const [syncing,  setSyncing] = useState(false);
  const [error,    setError]   = useState('');
  const [form,     setForm]    = useState({ ...EMPTY_FORM, date:isoToDDMMYYYY(todayISO()), by:user?.name||'' });
  const [files,    setFiles]   = useState([]);
  const fileRef = useRef();

  const handleSync = async () => {
    setSyncing(true);
    try {
      const r = await fetch(`/api/communication/backfill?companyId=${cid}`, { method: 'POST' });
      const d = await r.json();
      await loadData();
      const parts = [];
      if (d.added > 0) parts.push(`${d.added} entries imported`);
      if (d.fixed > 0) parts.push(`${d.fixed} dates corrected`);
      if (parts.length > 0) alert(`Sync complete — ${parts.join(', ')}.`);
      else alert('Already up to date — no new entries found.');
    } catch { alert('Sync failed. Please restart the server and try again.'); }
    setSyncing(false);
  };

  /* ── data loading ── */
  const loadData = useCallback(async () => {
    if (!cid||!orderId) return;
    setLoading(true);

    /* Fetch SO details independently so a failed logs fetch never blocks order display */
    let soData = null;
    try {
      const r1 = await fetch(`/api/sales-orders/${orderId}?companyId=${cid}`);
      if (r1.ok) {
        const d = await r1.json();
        if (d && !d.error && (d.orderId!=null||d.customerName||d.orderNo)) soData = d;
      }
    } catch {}
    if (!soData) {
      try {
        const r2 = await fetch(`/api/sales-orders?companyId=${cid}`);
        if (r2.ok) {
          const all = await r2.json();
          soData = Array.isArray(all)
            ? (all.find(o=>String(o.orderId)===String(orderId)||String(o.id)===String(orderId))||null)
            : null;
        }
      } catch {}
    }
    setOrder(soData); // always set — even if logs fetch below fails

    /* Fetch communication logs separately */
    let allLogs = [];
    try {
      const lr = await fetch(`/api/communication/${orderId}?companyId=${cid}`);
      if (lr.ok) {
        const ld = await lr.json();
        if (Array.isArray(ld)) allLogs = ld;
      }
    } catch {}
    setLogs([...allLogs].sort((a,b)=>new Date(a.date||a.createdAt)-new Date(b.date||b.createdAt)));

    setLoading(false);
  }, [cid, orderId]);

  useEffect(()=>{ loadData(); },[loadData]);

  const setF = (k,v) => setForm(f=>({...f,[k]:v}));

  const handleDateKey = e => {
    const raw=e.target.value.replace(/\D/g,'');
    let out=raw;
    if (raw.length>2) out=raw.slice(0,2)+'-'+raw.slice(2);
    if (raw.length>4) out=raw.slice(0,2)+'-'+raw.slice(2,4)+'-'+raw.slice(4,8);
    setF('date',out);
  };

  const openForm = () => {
    setForm({ ...EMPTY_FORM, date:isoToDDMMYYYY(todayISO()), by:user?.name||user?.username||'' });
    setFiles([]); setError(''); setShowForm(true);
  };

  const handleSubmit = async e => {
    e.preventDefault(); setError('');
    const isoDate = ddmmyyyyToISO(form.date);
    if (!isoDate)           { setError('Enter valid date DD-MM-YYYY'); return; }
    if (!form.stage.trim()) { setError('Stage / Activity is required'); return; }

    setSaving(true);
    const fd = new FormData();
    fd.append('date',        isoDate);
    fd.append('stage',       form.stage);
    fd.append('type',        form.stage); // backward compat
    fd.append('details',     form.description);
    fd.append('description', form.description);
    fd.append('department',  form.department);
    fd.append('referenceNo', form.referenceNo);
    fd.append('referredBy',  form.by);
    fd.append('by',          form.by);
    fd.append('status',      form.status);
    fd.append('remarks',     form.remarks);
    fd.append('createdBy',   user?.name||user?.username||'');
    files.forEach(f=>fd.append('attachments',f));

    try {
      const r = await fetch(`/api/communication/${orderId}?companyId=${cid}`,{method:'POST',body:fd});
      if (!r.ok) throw new Error('Save failed');
      setShowForm(false);
      await loadData();
    } catch(ex) { setError(ex.message||'Error'); }
    setSaving(false);
  };

  const o = order;
  const items = Array.isArray(o?.items)?o.items:[];

  /* stats */
  const completed = logs.filter(l=>l.status==='Completed'||(!l.status&&!l.isSystem)).length;
  const pending   = logs.filter(l=>l.status==='Pending').length;
  const upcoming  = logs.filter(l=>l.status==='Upcoming').length;
  const total     = logs.length;
  const pct       = total>0?Math.round((completed/total)*100):0;

  /* all attachments across all logs */
  const allAttachments = logs.flatMap(l=>(l.attachments||[]).map(a=>({...a,logDate:l.date,logStage:l.stage||l.type})));

  return (
    <div className="comm-page-wrap" style={{display:'flex',flexDirection:'column',height:'100%',background:'#f1f5f9',fontFamily:F,overflow:'hidden'}}>
    <style>{`
      @media print {
        @page { size: A4 landscape; margin: 10mm 8mm; }

        /* ── Step 1: make everything invisible ── */
        body * { visibility: hidden !important; }

        /* ── Step 2: show only comm-page-wrap and its children ── */
        .comm-page-wrap, .comm-page-wrap * { visibility: visible !important; }

        /* ── Step 3: position comm-page-wrap to cover the page ── */
        .comm-page-wrap {
          position: absolute !important;
          top: 0 !important; left: 0 !important;
          width: 100% !important;
          height: auto !important;
          overflow: visible !important;
          background: #fff !important;
          display: block !important;
        }

        /* ── Step 4: hide buttons & side panels even though they're inside comm-page-wrap ── */
        .comm-topbar, .comm-topbar * { visibility: hidden !important; display:none !important; }
        .comm-modal, .comm-modal * { visibility: hidden !important; display:none !important; }
        .comm-right-panels, .comm-right-panels * { visibility: hidden !important; display:none !important; }

        /* ── Step 5: make scroll area flow naturally for multi-page ── */
        .comm-scroll-area { overflow: visible !important; height: auto !important; padding: 8px 0 !important; }
        .comm-main-layout { display: block !important; }

        /* ── Step 6: show print-only elements ── */
        .comm-print-header { display: block !important; visibility: visible !important; }
        .comm-print-status { display: flex !important; visibility: visible !important; }

        /* ── Step 7: clean up card styles for print ── */
        .comm-order-card  { border:1px solid #bbb !important; border-radius:3px !important; margin-bottom:8px; page-break-inside:avoid; }
        .comm-order-hdr   { -webkit-print-color-adjust:exact; print-color-adjust:exact; }
        .comm-timeline-card { border:1px solid #bbb !important; border-radius:3px !important; }
        .comm-timeline-hdr  { -webkit-print-color-adjust:exact; print-color-adjust:exact; }
        .comm-attach-section { page-break-inside:avoid; border:1px solid #bbb !important; }

        /* ── Step 8: table borders and font ── */
        .comm-table { border-collapse:collapse !important; }
        .comm-table th, .comm-table td {
          border: 1px solid #bbb !important;
          font-size: 9pt !important;
          padding: 4px 6px !important;
        }
        .comm-table thead tr { -webkit-print-color-adjust:exact; print-color-adjust:exact; }
      }
    `}</style>

      {/* ── Top bar ── */}
      <div className="comm-topbar" style={{background:'#fff',borderBottom:'1px solid #e2e8f0',padding:'10px 20px',
        display:'flex',alignItems:'center',gap:12,flexShrink:0}}>
        <button onClick={()=>navigate('/communication/logs')}
          style={{background:'none',border:'1px solid #e2e8f0',borderRadius:7,padding:'5px 12px',
            cursor:'pointer',fontSize:12,color:'#475569',fontFamily:F}}>
          ← Back
        </button>
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <div style={{width:32,height:32,borderRadius:8,background:`${P2}15`,border:`1.5px solid ${P2}44`,
            display:'flex',alignItems:'center',justifyContent:'center'}}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={P2} strokeWidth="2"
              strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/>
              <rect x="9" y="3" width="6" height="4" rx="1"/>
              <line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="13" y2="16"/>
            </svg>
          </div>
          <div>
            <div style={{fontSize:15,fontWeight:700,color:'#0f172a'}}>Project Communication Report</div>
            <div style={{fontSize:11,color:'#64748b'}}>
              {o ? [o.customerName||o.party, o.orderNo||o.soNumber].filter(Boolean).join(' • ') : `Order #${orderId}`}
            </div>
          </div>
        </div>
        <div style={{marginLeft:'auto',display:'flex',gap:8}}>
          <button onClick={handleSync} disabled={syncing}
            style={{height:32,padding:'0 14px',border:'1px solid #d1d5db',borderRadius:6,
              background:'#fff',fontSize:12,color:'#374151',cursor:syncing?'default':'pointer',fontFamily:F,opacity:syncing?0.6:1}}>
            {syncing ? '⟳ Syncing…' : '⟳ Sync History'}
          </button>
          <button onClick={()=>window.print()}
            style={{height:32,padding:'0 14px',border:'1px solid #d1d5db',borderRadius:6,
              background:'#fff',fontSize:12,color:'#374151',cursor:'pointer',fontFamily:F}}>
            🖨 Print
          </button>
          <button onClick={openForm}
            style={{height:32,padding:'0 14px',border:'none',borderRadius:6,
              background:P2,color:'#fff',fontSize:12,fontWeight:700,cursor:'pointer',fontFamily:F}}>
            + Add Log Entry
          </button>
        </div>
      </div>

      <div className="comm-scroll-area" style={{flex:1,overflow:'auto',padding:'14px 18px'}}>

        {/* ── Print-only report header (hidden on screen) ── */}
        <div className="comm-print-header" style={{display:'none',marginBottom:14,borderBottom:'2px solid #104f4f',paddingBottom:10,fontFamily:F}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
            <div>
              <div style={{fontSize:18,fontWeight:800,color:'#104f4f',letterSpacing:'0.5px'}}>EPSILON ENTERPRISE</div>
              <div style={{fontSize:13,color:'#475569',marginTop:2}}>Project Communication Report</div>
            </div>
            <div style={{textAlign:'right',fontSize:10,color:'#64748b'}}>
              <div>Printed: {new Date().toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'})}</div>
              <div>Order #{orderId}</div>
            </div>
          </div>
          {o&&(
            <div style={{marginTop:8,display:'flex',gap:30,fontSize:11,flexWrap:'wrap'}}>
              <div><span style={{color:'#94a3b8',fontWeight:600}}>CLIENT: </span>{o.customerName||o.party||'—'}</div>
              <div><span style={{color:'#94a3b8',fontWeight:600}}>ORDER NO: </span>{o.orderNo||'—'}</div>
              <div><span style={{color:'#94a3b8',fontWeight:600}}>CUSTOMER PO: </span>{o.customerPO||'—'}</div>
              <div><span style={{color:'#94a3b8',fontWeight:600}}>VALUE: </span>{fmtMoney(o.grandTotal)}</div>
              <div><span style={{color:'#94a3b8',fontWeight:600}}>DUE DATE: </span>{fmtDate(o.dueDate||o.deliveryDate)}</div>
              <div><span style={{color:'#94a3b8',fontWeight:600}}>STATUS: </span>{o.status||'—'}</div>
            </div>
          )}
        </div>

        {/* ── Order / Project Info Header ── */}
        <div className="comm-order-card" style={{background:'#fff',borderRadius:10,border:'1px solid #e2e8f0',marginBottom:14,overflow:'hidden'}}>
          {/* Title strip */}
          <div className="comm-order-hdr" style={{background:P,padding:'10px 18px',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
            <div style={{fontSize:14,fontWeight:700,color:'#fff'}}>Order #{orderId} Details</div>
            {o?.status && (
              <span style={{fontSize:11,fontWeight:700,padding:'3px 12px',borderRadius:20,
                background:'rgba(255,255,255,0.2)',color:'#fff',textTransform:'capitalize'}}>
                {o.status}
              </span>
            )}
          </div>

          {loading&&!o?(
            <div style={{padding:'20px 18px',textAlign:'center'}}><PageLoader overlay={false} text="Loading order details…"/></div>
          ):(
            <>
              {/* Row 1 */}
              <div style={{display:'grid',gridTemplateColumns:'repeat(6,1fr)',gap:0,borderBottom:'1px solid #f1f5f9'}}>
                {[
                  ['Order ID',         `#${orderId}`],
                  ['Order No / LOA',   o?.orderNo||o?.soNumber||o?.order_no||'—'],
                  ['Client Name',      o?.customerName||o?.party||'—'],
                  ['Customer PO',      o?.customerPO||o?.reference||'—'],
                  ['LOA / PO Date',    fmtDate(o?.poDate||o?.orderDate||o?.order_date)],
                  ['Order Value',      fmtMoney(o?.grandTotal)],
                ].map(([k,v],i)=>(
                  <div key={k} style={{padding:'10px 14px',borderRight:i<5?'1px solid #f1f5f9':'none'}}>
                    <div style={{fontSize:10,color:'#94a3b8',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.4px',marginBottom:3}}>{k}</div>
                    <div style={{fontSize:13,color:i===2?P2:'#1e293b',fontWeight:600}}>{v||'—'}</div>
                  </div>
                ))}
              </div>
              {/* Row 2 */}
              <div style={{display:'grid',gridTemplateColumns:'repeat(6,1fr)',gap:0}}>
                {[
                  ['Sales Person',      o?.salesPerson||'—'],
                  ['Contact Person',    o?.contactPerson||'—'],
                  ['Start Date',        fmtDate(o?.orderDate||o?.order_date)],
                  ['Due Date',          fmtDate(o?.dueDate||o?.deliveryDate)],
                  ['Payment Terms',     o?.paymentTerms||o?.billingTerms||'—'],
                  ['Overall Completion',`${pct}%`],
                ].map(([k,v],i)=>(
                  <div key={k} style={{padding:'10px 14px',borderRight:i<5?'1px solid #f1f5f9':'none',borderTop:'1px solid #f1f5f9'}}>
                    <div style={{fontSize:10,color:'#94a3b8',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.4px',marginBottom:3}}>{k}</div>
                    {i===5?(
                      <div style={{display:'flex',alignItems:'center',gap:8}}>
                        <div style={{flex:1,height:8,background:'#e2e8f0',borderRadius:4,overflow:'hidden'}}>
                          <div style={{height:'100%',width:`${pct}%`,background:'#16a34a',borderRadius:4,transition:'width 0.4s'}}/>
                        </div>
                        <span style={{fontSize:12,fontWeight:700,color:'#16a34a'}}>{pct}%</span>
                      </div>
                    ):(
                      <div style={{fontSize:13,color:'#1e293b',fontWeight:600}}>{v||'—'}</div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* ── Main 3-column layout ── */}
        <div className="comm-main-layout" style={{display:'flex',gap:12,alignItems:'flex-start'}}>

          {/* LEFT: Communication Timeline table */}
          <div className="comm-timeline-card" style={{flex:1,minWidth:0,background:'#fff',borderRadius:10,border:'1px solid #e2e8f0',overflow:'hidden'}}>
            <div className="comm-timeline-hdr" style={{background:'#1e293b',padding:'9px 14px',display:'flex',alignItems:'center',gap:8}}>
              <span style={{fontSize:12,fontWeight:700,color:'#fff'}}>≡ Communication Timeline / Register</span>
              <span style={{marginLeft:'auto',fontSize:11,color:'#94a3b8'}}>{total} entries</span>
            </div>

            {loading?(
              <div style={{padding:40}}><PageLoader overlay={false} text="Loading communication logs…"/></div>
            ):total===0?(
              <div style={{padding:'40px 20px',textAlign:'center',color:'#94a3b8',fontSize:13}}>
                No communication entries yet. Click <b>+ Add Log Entry</b> to start.
              </div>
            ):(
              <div style={{overflowX:'auto'}}>
                <table className="comm-table" style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
                  <thead>
                    <tr style={{background:'#104f4f'}}>
                      {['Sr.','Date','Stage / Activity','Description','Department','Ref. No.','By','Status','Remarks'].map(h=>(
                        <th key={h} style={{padding:'8px 10px',textAlign:'left',color:'#fff',fontWeight:600,
                          fontSize:11,whiteSpace:'nowrap',borderRight:'1px solid rgba(255,255,255,0.1)'}}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((log,idx)=>{
                      const st=STATUS_ST[log.status]||STATUS_ST.Completed;
                      const stage=log.stage||log.type||'';
                      const desc=log.description||log.details||'';
                      const by=log.by||log.referredBy||log.createdBy||'';
                      const ref=log.referenceNo||'';
                      const dept=log.department||'';
                      const remarks=log.remarks||'';
                      return (
                        <tr key={log.id||idx}
                          style={{borderBottom:'1px solid #f1f5f9',background:idx%2===0?'#fff':'#fafcff'}}>
                          <td style={{padding:'8px 10px',color:'#94a3b8',width:36,fontWeight:600}}>{idx+1}</td>
                          <td style={{padding:'8px 10px',whiteSpace:'nowrap',color:'#374151',fontWeight:500}}>{fmtDate(log.date)}</td>
                          <td style={{padding:'8px 10px',color:'#1e293b',fontWeight:600,minWidth:140}}>
                            {log.isSystem?(
                              <span style={{display:'flex',alignItems:'center',gap:4}}>
                                <span style={{fontSize:10,color:'#94a3b8',background:'#f1f5f9',
                                  border:'1px solid #e2e8f0',borderRadius:3,padding:'1px 5px'}}>auto</span>
                                {stage}
                              </span>
                            ):stage||'—'}
                          </td>
                          <td style={{padding:'8px 10px',color:'#475569',minWidth:160,maxWidth:280,
                            wordBreak:'break-word',lineHeight:'1.4'}}>{desc||'—'}</td>
                          <td style={{padding:'8px 10px',color:'#475569',whiteSpace:'nowrap'}}>{dept||'—'}</td>
                          <td style={{padding:'8px 10px',color:P2,whiteSpace:'nowrap',fontWeight:500}}>
                            {ref||'—'}
                            {log.attachments?.length>0&&(
                              <span title={`${log.attachments.length} attachment(s)`}
                                style={{marginLeft:4,fontSize:10}}>📎</span>
                            )}
                          </td>
                          <td style={{padding:'8px 10px',color:'#334155',whiteSpace:'nowrap'}}>{by||'—'}</td>
                          <td style={{padding:'8px 10px'}}>
                            <span style={{fontSize:11,fontWeight:700,padding:'2px 9px',borderRadius:20,
                              background:st.bg,color:st.color,whiteSpace:'nowrap'}}>
                              {log.status||'Completed'}
                            </span>
                          </td>
                          <td style={{padding:'8px 10px',color:'#64748b',minWidth:100,maxWidth:160,
                            wordBreak:'break-word',lineHeight:'1.4'}}>{remarks||'—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* RIGHT panels */}
          <div className="comm-right-panels" style={{width:220,flexShrink:0,display:'flex',flexDirection:'column',gap:12}}>

            {/* Timeline Visual */}
            <div style={{background:'#fff',borderRadius:10,border:'1px solid #e2e8f0',overflow:'hidden'}}>
              <div style={{background:'#1e293b',padding:'8px 12px'}}>
                <span style={{fontSize:11,fontWeight:700,color:'#fff'}}>Timeline Visual</span>
              </div>
              {logs.length===0?(
                <div style={{padding:'16px 12px',color:'#94a3b8',fontSize:11,textAlign:'center'}}>No entries yet</div>
              ):(
                <div style={{padding:'12px 14px',display:'flex',flexDirection:'column',gap:0}}>
                  {logs.map((log,idx)=>{
                    const st=STATUS_ST[log.status]||STATUS_ST.Completed;
                    const isLast=idx===logs.length-1;
                    const stage=log.stage||log.type||'';
                    return (
                      <div key={log.id||idx} style={{display:'flex',gap:10,position:'relative'}}>
                        {/* dot + line */}
                        <div style={{display:'flex',flexDirection:'column',alignItems:'center',width:14,flexShrink:0}}>
                          <div style={{width:10,height:10,borderRadius:'50%',background:st.dot,
                            border:`2px solid #fff`,boxShadow:`0 0 0 2px ${st.dot}44`,flexShrink:0,marginTop:3}}/>
                          {!isLast&&<div style={{width:2,flex:1,background:'#e2e8f0',minHeight:18}}/>}
                        </div>
                        {/* content */}
                        <div style={{paddingBottom:isLast?0:10,paddingTop:0}}>
                          <div style={{fontSize:10,color:'#94a3b8',marginBottom:1}}>{fmtDate(log.date)}</div>
                          <div style={{fontSize:11,color:'#1e293b',fontWeight:600,lineHeight:1.3}}>
                            {stage||'Entry'}
                            {log.status&&log.status!=='Completed'&&(
                              <span style={{fontSize:9,color:st.dot,marginLeft:4}}>({log.status})</span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Status Summary */}
            <div style={{background:'#fff',borderRadius:10,border:'1px solid #e2e8f0',overflow:'hidden'}}>
              <div style={{background:'#1e293b',padding:'8px 12px'}}>
                <span style={{fontSize:11,fontWeight:700,color:'#fff'}}>Status Summary</span>
              </div>
              <div style={{padding:'14px 14px'}}>
                {/* donut-style counts */}
                <div style={{textAlign:'center',marginBottom:12}}>
                  <div style={{fontSize:32,fontWeight:800,color:'#1e293b',lineHeight:1}}>{total}</div>
                  <div style={{fontSize:10,color:'#94a3b8',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.4px'}}>Total</div>
                </div>
                {[
                  ['Completed',completed,'#16a34a'],
                  ['Pending',  pending,  '#f59e0b'],
                  ['Upcoming', upcoming, '#3b82f6'],
                ].map(([lbl,cnt,clr])=>(
                  <div key={lbl} style={{display:'flex',alignItems:'center',gap:8,marginBottom:7}}>
                    <div style={{width:10,height:10,borderRadius:'50%',background:clr,flexShrink:0}}/>
                    <div style={{flex:1,fontSize:11,color:'#374151'}}>{lbl}</div>
                    <div style={{fontSize:12,fontWeight:700,color:clr}}>{cnt}</div>
                  </div>
                ))}
              </div>
              {/* Current status */}
              {logs.length>0&&(()=>{
                const last = [...logs].reverse().find(l=>l.status==='Completed'||l.isSystem)||logs[logs.length-1];
                const st=STATUS_ST[last?.status]||STATUS_ST.Completed;
                return (
                  <div style={{borderTop:'1px solid #f1f5f9',padding:'10px 14px'}}>
                    <div style={{fontSize:10,color:'#94a3b8',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.4px',marginBottom:4}}>Current Status</div>
                    <div style={{fontSize:12,fontWeight:700,color:P2}}>{last?.stage||last?.type||'—'}</div>
                  </div>
                );
              })()}
              {/* Next planned */}
              {(()=>{
                const next=logs.find(l=>l.status==='Upcoming');
                if (!next) return null;
                return (
                  <div style={{borderTop:'1px solid #f1f5f9',padding:'10px 14px'}}>
                    <div style={{fontSize:10,color:'#94a3b8',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.4px',marginBottom:4}}>Next Planned</div>
                    <div style={{fontSize:12,fontWeight:600,color:'#1e293b'}}>{next.stage||next.type||'—'}</div>
                    <div style={{fontSize:11,color:'#64748b'}}>{fmtDate(next.date)}</div>
                  </div>
                );
              })()}
              {/* Overdue */}
              {pending>0&&(
                <div style={{borderTop:'1px solid #f1f5f9',padding:'10px 14px'}}>
                  <div style={{fontSize:10,color:'#94a3b8',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.4px',marginBottom:4}}>
                    Overdue / Pending <span style={{color:'#dc2626'}}>{pending}</span>
                  </div>
                  {logs.filter(l=>l.status==='Pending').map((l,i)=>(
                    <div key={i} style={{fontSize:11,color:'#64748b',marginBottom:2}}>
                      • {l.stage||l.type} ({fmtDate(l.date)})
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Print-only status summary (hidden on screen) ── */}
        <div className="comm-print-status" style={{display:'none',gap:0,border:'1px solid #bbb',borderRadius:4,marginTop:10,overflow:'hidden',fontFamily:F}}>
          {[
            ['Total Entries', total, '#104f4f'],
            ['Completed',     completed, '#16a34a'],
            ['Pending',       pending,   '#f59e0b'],
            ['Upcoming',      upcoming,  '#3b82f6'],
            ['Completion',    `${pct}%`, '#0284c7'],
          ].map(([lbl,val,clr],i)=>(
            <div key={lbl} style={{flex:1,padding:'8px 12px',borderRight:i<4?'1px solid #ddd':'none',textAlign:'center'}}>
              <div style={{fontSize:9,color:'#94a3b8',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.5px'}}>{lbl}</div>
              <div style={{fontSize:16,fontWeight:800,color:clr,marginTop:2}}>{val}</div>
            </div>
          ))}
        </div>

        {/* ── Attachments section ── */}
        {allAttachments.length>0&&(
          <div className="comm-attach-section" style={{marginTop:12,background:'#fff',borderRadius:10,border:'1px solid #e2e8f0',overflow:'hidden'}}>
            <div style={{background:'#1e293b',padding:'8px 14px'}}>
              <span style={{fontSize:12,fontWeight:700,color:'#fff'}}>📎 Attachments / Documents</span>
            </div>
            <div style={{padding:'14px 16px',display:'flex',flexWrap:'wrap',gap:12}}>
              {allAttachments.map((a,i)=>{
                const ext=(a.name||'').split('.').pop().toUpperCase();
                const isPdf=ext==='PDF';
                return (
                  <a key={i}
                    href={`/api/communication/${orderId}/docs/${a.file}?companyId=${cid}`}
                    target="_blank" rel="noreferrer"
                    style={{display:'flex',flexDirection:'column',alignItems:'center',gap:4,
                      textDecoration:'none',width:90}}>
                    <div style={{width:48,height:56,borderRadius:6,border:'1px solid #e2e8f0',
                      background:isPdf?'#fef2f2':'#eff6ff',display:'flex',flexDirection:'column',
                      alignItems:'center',justifyContent:'center',gap:2}}>
                      <span style={{fontSize:18}}>{isPdf?'📄':'📁'}</span>
                      <span style={{fontSize:8,fontWeight:700,color:isPdf?'#dc2626':P2}}>{ext}</span>
                    </div>
                    <div style={{fontSize:10,color:'#334155',textAlign:'center',lineHeight:1.3,
                      overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',width:'100%'}}>
                      {a.name}
                    </div>
                    <div style={{fontSize:10,color:P2,fontWeight:600}}>View</div>
                  </a>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ── Add Entry Modal ── */}
      {showForm&&(
        <div className="comm-modal" style={{position:'fixed',inset:0,background:'rgba(15,23,42,0.5)',zIndex:1000,
          display:'flex',alignItems:'center',justifyContent:'center',padding:20}}>
          <div style={{background:'#fff',borderRadius:12,width:'100%',maxWidth:560,
            maxHeight:'90vh',overflow:'auto',boxShadow:'0 20px 60px rgba(0,0,0,0.25)'}}>
            {/* modal header */}
            <div style={{background:P,padding:'14px 18px',display:'flex',alignItems:'center',
              justifyContent:'space-between',borderRadius:'12px 12px 0 0'}}>
              <span style={{fontSize:14,fontWeight:700,color:'#fff'}}>Add Communication Log Entry</span>
              <button onClick={()=>setShowForm(false)}
                style={{background:'rgba(255,255,255,0.2)',border:'none',borderRadius:6,color:'#fff',
                  cursor:'pointer',fontSize:18,width:28,height:28,lineHeight:1}}>×</button>
            </div>

            <form onSubmit={handleSubmit} style={{padding:'18px 20px',display:'flex',flexDirection:'column',gap:13}}>

              {/* Date + Stage row */}
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                <div>
                  <label style={LB}>Date (DD-MM-YYYY)</label>
                  <input value={form.date} onChange={handleDateKey} placeholder="DD-MM-YYYY" maxLength={10}
                    style={INP}/>
                </div>
                <div>
                  <label style={LB}>Status</label>
                  <select value={form.status} onChange={e=>setF('status',e.target.value)} style={INP}>
                    <option>Completed</option>
                    <option>Pending</option>
                    <option>Upcoming</option>
                  </select>
                </div>
              </div>

              {/* Stage */}
              <div>
                <label style={LB}>Stage / Activity <span style={{color:'#dc2626'}}>*</span></label>
                <input value={form.stage} onChange={e=>setF('stage',e.target.value)}
                  placeholder="e.g. LOA Received, Order Confirmation Sent…"
                  list="stage-list" style={INP}/>
                <datalist id="stage-list">
                  {STAGES.map(s=><option key={s} value={s}/>)}
                </datalist>
              </div>

              {/* Description */}
              <div>
                <label style={LB}>Description</label>
                <textarea value={form.description} onChange={e=>setF('description',e.target.value)}
                  placeholder="Enter details about this communication…" rows={3}
                  style={{...INP,height:'auto',padding:'8px 10px',resize:'vertical'}}/>
              </div>

              {/* Dept + Ref row */}
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                <div>
                  <label style={LB}>Department</label>
                  <input value={form.department} onChange={e=>setF('department',e.target.value)}
                    placeholder="Sales, Design, Accounts…" list="dept-list" style={INP}/>
                  <datalist id="dept-list">{DEPTS.map(d=><option key={d} value={d}/>)}</datalist>
                </div>
                <div>
                  <label style={LB}>Reference No.</label>
                  <input value={form.referenceNo} onChange={e=>setF('referenceNo',e.target.value)}
                    placeholder="LOA-5623, MAIL-1001…" style={INP}/>
                </div>
              </div>

              {/* By + Remarks row */}
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                <div>
                  <label style={LB}>By (Person)</label>
                  <input value={form.by} onChange={e=>setF('by',e.target.value)}
                    placeholder="Name" style={INP}/>
                </div>
                <div>
                  <label style={LB}>Remarks</label>
                  <input value={form.remarks} onChange={e=>setF('remarks',e.target.value)}
                    placeholder="Additional notes" style={INP}/>
                </div>
              </div>

              {/* Attachment */}
              <div>
                <label style={LB}>Attachments</label>
                <input ref={fileRef} type="file" multiple
                  onChange={e=>setFiles(Array.from(e.target.files))}
                  style={{fontSize:12,fontFamily:F,cursor:'pointer',width:'100%'}}/>
                {files.length>0&&(
                  <div style={{fontSize:11,color:'#64748b',marginTop:3}}>{files.map(f=>f.name).join(', ')}</div>
                )}
              </div>

              {error&&(
                <div style={{fontSize:12,color:'#dc2626',background:'#fef2f2',
                  border:'1px solid #fecaca',borderRadius:5,padding:'7px 10px'}}>{error}</div>
              )}

              <div style={{display:'flex',gap:10,marginTop:2}}>
                <button type="button" onClick={()=>setShowForm(false)}
                  style={{flex:1,height:38,border:'1px solid #e2e8f0',borderRadius:7,
                    background:'#fff',fontSize:13,color:'#475569',cursor:'pointer',fontFamily:F}}>
                  Cancel
                </button>
                <button type="submit" disabled={saving}
                  style={{flex:2,height:38,background:saving?'#94a3b8':P2,color:'#fff',border:'none',
                    borderRadius:7,fontSize:13,fontWeight:700,cursor:saving?'default':'pointer',fontFamily:F}}>
                  {saving?'Saving…':'Save Log Entry'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

const LB = { fontSize:11,fontWeight:600,color:'#475569',display:'block',marginBottom:4 };
const INP = {
  width:'100%',height:34,padding:'0 10px',border:'1px solid #d1d5db',
  borderRadius:6,fontSize:12,fontFamily:"'Inter',sans-serif",outline:'none',
  boxSizing:'border-box',background:'#fff',
};
