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

const fmtDate     = d => { if (!d) return '—'; const s=String(d).split('T')[0]; const [y,m,dd]=s.split('-'); return (y&&y.length===4&&m&&dd)?`${dd}-${m}-${y}`:s; };
const todayISO    = () => new Date().toISOString().slice(0,10);
const isoToDDMMYYYY = iso => { if (!iso) return ''; const [y,m,d]=iso.split('-'); return `${d}-${m}-${y}`; };
const ddmmyyyyToISO = str => {
  if (!str||str.length<10) return null;
  const [dd,mm,yyyy]=str.split('-');
  if (!dd||!mm||!yyyy||yyyy.length!==4) return null;
  const iso=`${yyyy}-${mm}-${dd}`;
  return isNaN(new Date(iso).getTime())?null:iso;
};
const fmtMoney = n => n!=null&&n!==''&&!isNaN(n)?'₹ '+Number(n).toLocaleString('en-IN'):'—';

const EMPTY_FORM = {
  date:'', stage:'', description:'', department:'', referenceNo:'', by:'', status:'Completed', remarks:'',
};

const EMPTY_LETTER = {
  date:'', refNo:'', deliveryMethod:'By Email/Post',
  toName:'', toAddress:'', orderRef:'', subject:'',
  body:'Dear Sir,\n\n',
  closing:'We look forward to your kind understanding and favorable action.\n\nThanking You,\nFor, Epsilon Enterprise',
  signatoryName:'', signatoryDesignation:'', signatoryMobile:'', signatoryEmail:'',
};

/* ── Letter HTML builder ── */
const buildLetterHTML = (letter, order, co, logoDataUrl) => {
  const companyName = co?.companyName || 'EPSILON ENTERPRISE';
  const companyPhone = co?.phone || '';
  const companyEmail = co?.email || '';
  const companyAddr  = [co?.address, co?.city, [co?.state, co?.pincode].filter(Boolean).join('-')].filter(Boolean).join(', ');

  const formatBody = text => {
    if (!text) return '';
    const lines = text.split('\n');
    let html = ''; let inList = false;
    for (const line of lines) {
      const t = line;
      const isBullet = /^[•\-\*] /.test(t.trim());
      if (isBullet) {
        if (!inList) { html += '<ul style="margin:6pt 0 6pt 18pt;padding:0;">'; inList = true; }
        html += `<li style="margin:3pt 0;">${t.trim().slice(2).replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')}</li>`;
      } else {
        if (inList) { html += '</ul>'; inList = false; }
        if (!t.trim()) html += '<p style="margin:5pt 0;">&nbsp;</p>';
        else html += `<p style="margin:7pt 0;text-align:justify;">${t.replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')}</p>`;
      }
    }
    if (inList) html += '</ul>';
    return html;
  };

  const closingHtml = (letter.closing||'').split('\n').map(l=>l.trim()?`<div>${l}</div>`:'<br>').join('');

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  body { margin:0; padding:0; font-family:'Times New Roman',Times,serif; font-size:11pt; color:#111; background:#fff; }
  .wrap { width:210mm; min-height:297mm; padding:10mm 20mm 35mm; position:relative; }
  .footer { border-top:2px solid #104f4f; padding:4mm 0 0; text-align:center; font-size:9pt; color:#333; margin-top:12mm; }
  @media print { .wrap { padding-bottom:0; } .footer { position:fixed; bottom:0; left:0; right:0; border-top:2px solid #104f4f; padding:3mm 20mm; background:#fff; } }
</style>
</head>
<body>
<div class="wrap">
  <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:3mm;">
    <div style="font-weight:bold;margin-top:14mm;">${letter.deliveryMethod||'By Email/Post'}</div>
    <div style="text-align:right;">
      ${logoDataUrl
        ? `<img src="${logoDataUrl}" style="height:55pt;max-width:180pt;object-fit:contain;" alt="${companyName}"/>`
        : `<div style="font-size:20pt;font-weight:900;color:#104f4f;letter-spacing:2pt;">${companyName}</div>`
      }
      <div style="margin-top:4pt;font-size:10pt;">Date:${letter.date||''}</div>
      <div style="font-size:10pt;">Ref No:${letter.refNo||''}</div>
    </div>
  </div>
  <div style="border-top:1px solid #104f4f;margin-bottom:7mm;"></div>

  <div style="margin-bottom:6mm;">
    <div>To,</div>
    ${letter.toName ? `<div>${letter.toName}</div>` : ''}
    <div style="white-space:pre-line;">${letter.toAddress||''}</div>
  </div>

  ${letter.orderRef ? `<div style="margin-bottom:5mm;"><strong>Order No. ${letter.orderRef}</strong></div>` : ''}
  ${letter.subject  ? `<div style="margin-bottom:7mm;font-weight:bold;text-decoration:underline;">Sub: ${letter.subject}</div>` : ''}

  <div style="line-height:1.55;">${formatBody(letter.body||'')}</div>

  ${letter.closing ? `<div style="margin-top:8mm;line-height:1.65;">${closingHtml}</div>` : ''}

  <div style="margin-top:28mm;">
    <div style="font-size:9pt;color:#444;">Authorized Signatory</div>
    ${letter.signatoryName ? `<div style="font-weight:600;margin-top:3pt;">${letter.signatoryName}${letter.signatoryDesignation?' | '+letter.signatoryDesignation:''}</div>` : ''}
    ${(letter.signatoryMobile||letter.signatoryEmail) ? `<div style="font-size:9.5pt;margin-top:2pt;">Mobile No:-${letter.signatoryMobile||''}${letter.signatoryEmail?' | Email: '+letter.signatoryEmail:''}</div>` : ''}
  </div>

  <div class="footer">
    ${companyAddr?`Add: ${companyAddr}<br>`:''}M: ${companyPhone}${companyEmail?' / Email: '+companyEmail:''}
  </div>
</div>
</body>
</html>`;
};

/* ══════════════════════════════════════════════ */
export default function CommunicationDetail() {
  const { orderId } = useParams();
  const { selectedCompany } = useCompany();
  const { user }  = useAuth();
  const navigate  = useNavigate();
  const cid       = selectedCompany?.companyId;

  /* ── Log state ── */
  const [order,    setOrder]   = useState(null);
  const [logs,     setLogs]    = useState([]);
  const [loading,  setLoading] = useState(true);
  const [showForm, setShowForm]= useState(false);
  const [saving,   setSaving]  = useState(false);
  const [syncing,  setSyncing] = useState(false);
  const [error,    setError]   = useState('');
  const [form,     setForm]    = useState({ ...EMPTY_FORM, date:isoToDDMMYYYY(todayISO()), by:user?.name||'' });
  const [files,    setFiles]   = useState([]);
  const [editLogId,setEditLogId]=useState(null);
  const fileRef = useRef();

  /* ── Letter state ── */
  const [letters,          setLetters]         = useState([]);
  const [showLetterComposer,setShowLetterComposer]=useState(false);
  const [editLetter,       setEditLetter]      = useState(null);
  const [letterForm,       setLetterForm]      = useState({ ...EMPTY_LETTER });
  const [letterTab,        setLetterTab]       = useState('compose');
  const [letterSaving,     setLetterSaving]    = useState(false);
  const [letterError,      setLetterError]     = useState('');

  const handleSync = async () => {
    setSyncing(true);
    try {
      const r = await fetch(`/api/communication/backfill?companyId=${cid}`, { method: 'POST' });
      const d = await r.json();
      await loadData();
      const parts = [];
      if (d.added > 0) parts.push(`${d.added} entries imported`);
      if (d.fixed > 0) parts.push(`${d.fixed} dates corrected`);
      alert(parts.length > 0 ? `Sync complete — ${parts.join(', ')}.` : 'Already up to date.');
    } catch { alert('Sync failed.'); }
    setSyncing(false);
  };

  /* ── Data loading ── */
  const loadData = useCallback(async () => {
    if (!cid||!orderId) return;
    setLoading(true);

    let soData = null;
    try {
      const r1 = await fetch(`/api/sales-orders/${orderId}?companyId=${cid}`);
      if (r1.ok) { const d=await r1.json(); if(d&&!d.error&&(d.orderId!=null||d.customerName||d.orderNo)) soData=d; }
    } catch {}
    if (!soData) {
      try {
        const r2 = await fetch(`/api/sales-orders?companyId=${cid}`);
        if (r2.ok) { const all=await r2.json(); soData=Array.isArray(all)?(all.find(o=>String(o.orderId)===String(orderId)||String(o.id)===String(orderId))||null):null; }
      } catch {}
    }
    setOrder(soData);

    let allLogs = [];
    try {
      const lr = await fetch(`/api/communication/${orderId}?companyId=${cid}`);
      if (lr.ok) { const ld=await lr.json(); if(Array.isArray(ld)) allLogs=ld; }
    } catch {}
    setLogs([...allLogs].sort((a,b)=>new Date(a.date||a.createdAt)-new Date(b.date||b.createdAt)));

    let allLetters = [];
    try {
      const lr2 = await fetch(`/api/communication/${orderId}/letters?companyId=${cid}`);
      if (lr2.ok) { const ld2=await lr2.json(); if(Array.isArray(ld2)) allLetters=ld2; }
    } catch {}
    setLetters(allLetters);

    setLoading(false);
  }, [cid, orderId]);

  useEffect(()=>{ loadData(); },[loadData]);

  /* ── Log form helpers ── */
  const setF = (k,v) => setForm(f=>({...f,[k]:v}));

  const handleDateKey = e => {
    const raw=e.target.value.replace(/\D/g,'');
    let out=raw;
    if (raw.length>2) out=raw.slice(0,2)+'-'+raw.slice(2);
    if (raw.length>4) out=raw.slice(0,2)+'-'+raw.slice(2,4)+'-'+raw.slice(4,8);
    setF('date',out);
  };

  const openForm = () => {
    setEditLogId(null);
    setForm({ ...EMPTY_FORM, date:isoToDDMMYYYY(todayISO()), by:user?.name||user?.username||'' });
    setFiles([]); setError(''); setShowForm(true);
  };

  const openEditLog = log => {
    setEditLogId(log.id);
    setForm({
      date:        isoToDDMMYYYY(log.date||''),
      stage:       log.stage||log.type||'',
      description: log.description||log.details||'',
      department:  log.department||'',
      referenceNo: log.referenceNo||'',
      by:          log.by||log.referredBy||'',
      status:      log.status||'Completed',
      remarks:     log.remarks||'',
    });
    setFiles([]); setError(''); setShowForm(true);
  };

  const handleDeleteLog = async logId => {
    if (!window.confirm('Delete this log entry? This cannot be undone.')) return;
    try {
      await fetch(`/api/communication/${orderId}/logs/${logId}?companyId=${cid}`, { method:'DELETE' });
      await loadData();
    } catch { alert('Delete failed.'); }
  };

  const handleSubmit = async e => {
    e.preventDefault(); setError('');
    const isoDate = ddmmyyyyToISO(form.date);
    if (!isoDate)           { setError('Enter valid date DD-MM-YYYY'); return; }
    if (!form.stage.trim()) { setError('Stage / Activity is required'); return; }
    setSaving(true);

    if (editLogId) {
      try {
        const r = await fetch(`/api/communication/${orderId}/logs/${editLogId}?companyId=${cid}`, {
          method:'PUT',
          headers:{'Content-Type':'application/json'},
          body: JSON.stringify({
            date:isoDate, stage:form.stage, description:form.description,
            department:form.department, referenceNo:form.referenceNo,
            by:form.by, status:form.status, remarks:form.remarks,
          }),
        });
        if (!r.ok) throw new Error('Update failed');
        setShowForm(false); setEditLogId(null);
        await loadData();
      } catch(ex) { setError(ex.message||'Error'); }
      setSaving(false); return;
    }

    const fd = new FormData();
    fd.append('date',        isoDate);
    fd.append('stage',       form.stage);
    fd.append('type',        form.stage);
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

  /* ── Letter helpers ── */
  const setLF = (k,v) => setLetterForm(f=>({...f,[k]:v}));

  const openLetterComposer = (letter=null) => {
    if (letter) {
      setEditLetter(letter);
      setLetterForm({ ...EMPTY_LETTER, ...letter });
    } else {
      setEditLetter(null);
      const o = order;
      const refParts = [o?.orderNo||o?.soNumber||'', o?.orderDate ? `dated: ${fmtDate(o.orderDate)}` : ''].filter(Boolean).join(' ');
      setLetterForm({
        ...EMPTY_LETTER,
        date: isoToDDMMYYYY(todayISO()),
        orderRef: refParts,
        toName: o?.customerName||o?.party||'',
      });
    }
    setLetterError(''); setLetterTab('compose'); setShowLetterComposer(true);
  };

  const handleSaveLetter = async () => {
    if (!letterForm.subject.trim()) { setLetterError('Subject is required'); return; }
    setLetterSaving(true);
    try {
      const url    = editLetter
        ? `/api/communication/${orderId}/letters/${editLetter.id}?companyId=${cid}`
        : `/api/communication/${orderId}/letters?companyId=${cid}`;
      const method = editLetter ? 'PUT' : 'POST';
      const r = await fetch(url, { method, headers:{'Content-Type':'application/json'}, body:JSON.stringify(letterForm) });
      if (!r.ok) throw new Error('Save failed');
      setShowLetterComposer(false);
      await loadData();
    } catch(ex) { setLetterError(ex.message||'Error'); }
    setLetterSaving(false);
  };

  const handleDeleteLetter = async letterId => {
    if (!window.confirm('Delete this letter?')) return;
    try {
      await fetch(`/api/communication/${orderId}/letters/${letterId}?companyId=${cid}`, { method:'DELETE' });
      await loadData();
    } catch { alert('Delete failed.'); }
  };

  const printLetter = async letter => {
    const co = selectedCompany;
    let logoDataUrl = '';
    if (co?.logoFileName) {
      try {
        const r = await fetch(`/api/companies/logo/${encodeURIComponent(co.logoFileName)}?companyId=${cid}`);
        if (r.ok) {
          const blob = await r.blob();
          logoDataUrl = await new Promise(resolve => {
            const fr = new FileReader(); fr.onload = e => resolve(e.target.result); fr.readAsDataURL(blob);
          });
        }
      } catch {}
    }
    const html = buildLetterHTML(letter, order, co, logoDataUrl);
    const win = window.open('', '_blank', 'width=900,height=1100');
    win.document.write(html);
    win.document.close();
    setTimeout(() => { win.focus(); win.print(); }, 600);
  };

  const downloadLetterAsWord = letter => {
    const html = buildLetterHTML(letter, order, selectedCompany, '');
    const blob = new Blob(['﻿', html], { type:'application/msword' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `Letter-${letter.refNo||letter.id||'draft'}.doc`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  };

  /* ── Derived stats ── */
  const o = order;
  const completed = logs.filter(l=>l.status==='Completed'||(!l.status&&!l.isSystem)).length;
  const pending   = logs.filter(l=>l.status==='Pending').length;
  const upcoming  = logs.filter(l=>l.status==='Upcoming').length;
  const total     = logs.length;
  const pct       = total>0?Math.round((completed/total)*100):0;
  const allAttachments = logs.flatMap(l=>(l.attachments||[]).map(a=>({...a,logDate:l.date,logStage:l.stage||l.type})));

  /* ══════════════════════════════════════════════ */
  return (
    <div className="comm-page-wrap" style={{display:'flex',flexDirection:'column',height:'100%',background:'#f1f5f9',fontFamily:F,overflow:'hidden'}}>
    <style>{`
      @media print {
        @page { size: A4 landscape; margin: 10mm 8mm; }
        body * { visibility: hidden !important; }
        .comm-page-wrap, .comm-page-wrap * { visibility: visible !important; }
        .comm-page-wrap { position:absolute !important; top:0 !important; left:0 !important; width:100% !important; height:auto !important; overflow:visible !important; background:#fff !important; display:block !important; }
        .comm-topbar,.comm-topbar * { visibility:hidden !important; display:none !important; }
        .comm-modal,.comm-modal * { visibility:hidden !important; display:none !important; }
        .comm-right-panels,.comm-right-panels * { visibility:hidden !important; display:none !important; }
        .comm-letters-section,.comm-letters-section * { visibility:hidden !important; display:none !important; }
        .comm-scroll-area { overflow:visible !important; height:auto !important; padding:8px 0 !important; }
        .comm-main-layout { display:block !important; }
        .comm-print-header { display:block !important; visibility:visible !important; }
        .comm-print-status { display:flex !important; visibility:visible !important; }
        .comm-order-card  { border:1px solid #bbb !important; border-radius:3px !important; margin-bottom:8px; page-break-inside:avoid; }
        .comm-order-hdr   { -webkit-print-color-adjust:exact; print-color-adjust:exact; }
        .comm-timeline-card { border:1px solid #bbb !important; border-radius:3px !important; }
        .comm-timeline-hdr  { -webkit-print-color-adjust:exact; print-color-adjust:exact; }
        .comm-attach-section { page-break-inside:avoid; border:1px solid #bbb !important; }
        .comm-table { border-collapse:collapse !important; }
        .comm-table th,.comm-table td { border:1px solid #bbb !important; font-size:9pt !important; padding:4px 6px !important; }
        .comm-table thead tr { -webkit-print-color-adjust:exact; print-color-adjust:exact; }
        .log-actions { display:none !important; }
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
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={P2} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/>
              <rect x="9" y="3" width="6" height="4" rx="1"/>
              <line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="13" y2="16"/>
            </svg>
          </div>
          <div>
            <div style={{fontSize:15,fontWeight:700,color:'#0f172a'}}>Project Communication Report</div>
            <div style={{fontSize:11,color:'#64748b'}}>
              {o?[o.customerName||o.party,o.orderNo||o.soNumber].filter(Boolean).join(' • '):`Order #${orderId}`}
            </div>
          </div>
        </div>
        <div style={{marginLeft:'auto',display:'flex',gap:8,flexWrap:'wrap'}}>
          <button onClick={handleSync} disabled={syncing}
            style={{height:32,padding:'0 14px',border:'1px solid #d1d5db',borderRadius:6,
              background:'#fff',fontSize:12,color:'#374151',cursor:syncing?'default':'pointer',fontFamily:F,opacity:syncing?0.6:1}}>
            {syncing?'⟳ Syncing…':'⟳ Sync History'}
          </button>
          <button onClick={()=>window.print()}
            style={{height:32,padding:'0 14px',border:'1px solid #d1d5db',borderRadius:6,
              background:'#fff',fontSize:12,color:'#374151',cursor:'pointer',fontFamily:F}}>
            🖨 Print
          </button>
          <button onClick={()=>openLetterComposer()}
            style={{height:32,padding:'0 14px',border:'none',borderRadius:6,
              background:'#0f172a',color:'#fff',fontSize:12,fontWeight:700,cursor:'pointer',fontFamily:F}}>
            📝 Generate Letter
          </button>
          <button onClick={openForm}
            style={{height:32,padding:'0 14px',border:'none',borderRadius:6,
              background:P2,color:'#fff',fontSize:12,fontWeight:700,cursor:'pointer',fontFamily:F}}>
            + Add Log Entry
          </button>
        </div>
      </div>

      <div className="comm-scroll-area" style={{flex:1,overflow:'auto',padding:'14px 18px'}}>

        {/* ── Print-only report header ── */}
        <div className="comm-print-header" style={{display:'none',marginBottom:14,borderBottom:'2px solid #104f4f',paddingBottom:10,fontFamily:F}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
            <div>
              <div style={{fontSize:18,fontWeight:800,color:'#104f4f',letterSpacing:'0.5px'}}>{selectedCompany?.companyName||'EPSILON ENTERPRISE'}</div>
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

        {/* ── Order info card ── */}
        <div className="comm-order-card" style={{background:'#fff',borderRadius:10,border:'1px solid #e2e8f0',marginBottom:14,overflow:'hidden'}}>
          <div className="comm-order-hdr" style={{background:P,padding:'10px 18px',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
            <div style={{fontSize:14,fontWeight:700,color:'#fff'}}>Order #{orderId} Details</div>
            {o?.status&&(
              <span style={{fontSize:11,fontWeight:700,padding:'3px 12px',borderRadius:20,
                background:'rgba(255,255,255,0.2)',color:'#fff',textTransform:'capitalize'}}>{o.status}</span>
            )}
          </div>
          {loading&&!o?(
            <div style={{padding:'20px 18px',textAlign:'center'}}><PageLoader overlay={false} text="Loading order details…"/></div>
          ):(
            <>
              <div style={{display:'grid',gridTemplateColumns:'repeat(6,1fr)',gap:0,borderBottom:'1px solid #f1f5f9'}}>
                {[
                  ['Order ID',`#${orderId}`],
                  ['Order No / LOA',o?.orderNo||o?.soNumber||o?.order_no||'—'],
                  ['Client Name',o?.customerName||o?.party||'—'],
                  ['Customer PO',o?.customerPO||o?.reference||'—'],
                  ['LOA / PO Date',fmtDate(o?.poDate||o?.orderDate||o?.order_date)],
                  ['Order Value',fmtMoney(o?.grandTotal)],
                ].map(([k,v],i)=>(
                  <div key={k} style={{padding:'10px 14px',borderRight:i<5?'1px solid #f1f5f9':'none'}}>
                    <div style={{fontSize:10,color:'#94a3b8',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.4px',marginBottom:3}}>{k}</div>
                    <div style={{fontSize:13,color:i===2?P2:'#1e293b',fontWeight:600}}>{v||'—'}</div>
                  </div>
                ))}
              </div>
              <div style={{display:'grid',gridTemplateColumns:'repeat(6,1fr)',gap:0}}>
                {[
                  ['Sales Person',o?.salesPerson||'—'],
                  ['Contact Person',o?.contactPerson||'—'],
                  ['Start Date',fmtDate(o?.orderDate||o?.order_date)],
                  ['Due Date',fmtDate(o?.dueDate||o?.deliveryDate)],
                  ['Payment Terms',o?.paymentTerms||o?.billingTerms||'—'],
                  ['Overall Completion',`${pct}%`],
                ].map(([k,v],i)=>(
                  <div key={k} style={{padding:'10px 14px',borderRight:i<5?'1px solid #f1f5f9':'none',borderTop:'1px solid #f1f5f9'}}>
                    <div style={{fontSize:10,color:'#94a3b8',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.4px',marginBottom:3}}>{k}</div>
                    {i===5?(
                      <div style={{display:'flex',alignItems:'center',gap:8}}>
                        <div style={{flex:1,height:8,background:'#e2e8f0',borderRadius:4,overflow:'hidden'}}>
                          <div style={{height:'100%',width:`${pct}%`,background:'#16a34a',borderRadius:4}}/>
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

        {/* ── Main layout ── */}
        <div className="comm-main-layout" style={{display:'flex',gap:12,alignItems:'flex-start'}}>

          {/* LEFT: Timeline table */}
          <div className="comm-timeline-card" style={{flex:1,minWidth:0,background:'#fff',borderRadius:10,border:'1px solid #e2e8f0',overflow:'hidden'}}>
            <div className="comm-timeline-hdr" style={{background:'#1e293b',padding:'9px 14px',display:'flex',alignItems:'center',gap:8}}>
              <span style={{fontSize:12,fontWeight:700,color:'#fff'}}>≡ Communication Timeline / Register</span>
              <span style={{marginLeft:'auto',fontSize:11,color:'#94a3b8'}}>{total} entries</span>
            </div>
            {loading?(
              <div style={{padding:40}}><PageLoader overlay={false} text="Loading communication logs…"/></div>
            ):total===0?(
              <div style={{padding:'40px 20px',textAlign:'center',color:'#94a3b8',fontSize:13}}>
                No entries yet. Click <b>+ Add Log Entry</b> to start.
              </div>
            ):(
              <div style={{overflowX:'auto'}}>
                <table className="comm-table" style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
                  <thead>
                    <tr style={{background:'#104f4f'}}>
                      {['Sr.','Date','Stage / Activity','Description','Department','Ref. No.','By','Status','Remarks','Actions'].map(h=>(
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
                      return (
                        <tr key={log.id||idx} style={{borderBottom:'1px solid #f1f5f9',background:idx%2===0?'#fff':'#fafcff'}}>
                          <td style={{padding:'8px 10px',color:'#94a3b8',width:36,fontWeight:600}}>{idx+1}</td>
                          <td style={{padding:'8px 10px',whiteSpace:'nowrap',color:'#374151',fontWeight:500}}>{fmtDate(log.date)}</td>
                          <td style={{padding:'8px 10px',color:'#1e293b',fontWeight:600,minWidth:140}}>
                            {log.isSystem?(
                              <span style={{display:'flex',alignItems:'center',gap:4}}>
                                <span style={{fontSize:10,color:'#94a3b8',background:'#f1f5f9',border:'1px solid #e2e8f0',borderRadius:3,padding:'1px 5px'}}>auto</span>
                                {stage}
                              </span>
                            ):stage||'—'}
                          </td>
                          <td style={{padding:'8px 10px',color:'#475569',minWidth:160,maxWidth:240,wordBreak:'break-word',lineHeight:'1.4'}}>{desc||'—'}</td>
                          <td style={{padding:'8px 10px',color:'#475569',whiteSpace:'nowrap'}}>{log.department||'—'}</td>
                          <td style={{padding:'8px 10px',color:P2,whiteSpace:'nowrap',fontWeight:500}}>
                            {log.referenceNo||'—'}
                            {log.attachments?.length>0&&<span title={`${log.attachments.length} attachment(s)`} style={{marginLeft:4,fontSize:10}}>📎</span>}
                          </td>
                          <td style={{padding:'8px 10px',color:'#334155',whiteSpace:'nowrap'}}>{by||'—'}</td>
                          <td style={{padding:'8px 10px'}}>
                            <span style={{fontSize:11,fontWeight:700,padding:'2px 9px',borderRadius:20,background:st.bg,color:st.color,whiteSpace:'nowrap'}}>
                              {log.status||'Completed'}
                            </span>
                          </td>
                          <td style={{padding:'8px 10px',color:'#64748b',minWidth:90,maxWidth:150,wordBreak:'break-word',lineHeight:'1.4'}}>{log.remarks||'—'}</td>
                          <td className="log-actions" style={{padding:'8px 10px',whiteSpace:'nowrap'}}>
                            {!log.isSystem&&(
                              <div style={{display:'flex',gap:4}}>
                                <button onClick={()=>openEditLog(log)}
                                  title="Edit"
                                  style={{padding:'3px 8px',border:'1px solid #d1d5db',borderRadius:4,background:'#fff',cursor:'pointer',fontSize:12,color:'#374151'}}>
                                  ✏
                                </button>
                                <button onClick={()=>handleDeleteLog(log.id)}
                                  title="Delete"
                                  style={{padding:'3px 8px',border:'1px solid #fecaca',borderRadius:4,background:'#fef2f2',cursor:'pointer',fontSize:12,color:'#dc2626'}}>
                                  🗑
                                </button>
                              </div>
                            )}
                          </td>
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
                        <div style={{display:'flex',flexDirection:'column',alignItems:'center',width:14,flexShrink:0}}>
                          <div style={{width:10,height:10,borderRadius:'50%',background:st.dot,border:`2px solid #fff`,boxShadow:`0 0 0 2px ${st.dot}44`,flexShrink:0,marginTop:3}}/>
                          {!isLast&&<div style={{width:2,flex:1,background:'#e2e8f0',minHeight:18}}/>}
                        </div>
                        <div style={{paddingBottom:isLast?0:10}}>
                          <div style={{fontSize:10,color:'#94a3b8',marginBottom:1}}>{fmtDate(log.date)}</div>
                          <div style={{fontSize:11,color:'#1e293b',fontWeight:600,lineHeight:1.3}}>
                            {stage||'Entry'}
                            {log.status&&log.status!=='Completed'&&<span style={{fontSize:9,color:st.dot,marginLeft:4}}>({log.status})</span>}
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
                <div style={{textAlign:'center',marginBottom:12}}>
                  <div style={{fontSize:32,fontWeight:800,color:'#1e293b',lineHeight:1}}>{total}</div>
                  <div style={{fontSize:10,color:'#94a3b8',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.4px'}}>Total</div>
                </div>
                {[['Completed',completed,'#16a34a'],['Pending',pending,'#f59e0b'],['Upcoming',upcoming,'#3b82f6']].map(([lbl,cnt,clr])=>(
                  <div key={lbl} style={{display:'flex',alignItems:'center',gap:8,marginBottom:7}}>
                    <div style={{width:10,height:10,borderRadius:'50%',background:clr,flexShrink:0}}/>
                    <div style={{flex:1,fontSize:11,color:'#374151'}}>{lbl}</div>
                    <div style={{fontSize:12,fontWeight:700,color:clr}}>{cnt}</div>
                  </div>
                ))}
              </div>
              {logs.length>0&&(()=>{
                const last=[...logs].reverse().find(l=>l.status==='Completed'||l.isSystem)||logs[logs.length-1];
                const st=STATUS_ST[last?.status]||STATUS_ST.Completed;
                return (
                  <div style={{borderTop:'1px solid #f1f5f9',padding:'10px 14px'}}>
                    <div style={{fontSize:10,color:'#94a3b8',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.4px',marginBottom:4}}>Current Status</div>
                    <div style={{fontSize:12,fontWeight:700,color:P2}}>{last?.stage||last?.type||'—'}</div>
                  </div>
                );
              })()}
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
              {pending>0&&(
                <div style={{borderTop:'1px solid #f1f5f9',padding:'10px 14px'}}>
                  <div style={{fontSize:10,color:'#94a3b8',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.4px',marginBottom:4}}>
                    Overdue / Pending <span style={{color:'#dc2626'}}>{pending}</span>
                  </div>
                  {logs.filter(l=>l.status==='Pending').map((l,i)=>(
                    <div key={i} style={{fontSize:11,color:'#64748b',marginBottom:2}}>• {l.stage||l.type} ({fmtDate(l.date)})</div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Print-only status summary ── */}
        <div className="comm-print-status" style={{display:'none',gap:0,border:'1px solid #bbb',borderRadius:4,marginTop:10,overflow:'hidden',fontFamily:F}}>
          {[['Total Entries',total,'#104f4f'],['Completed',completed,'#16a34a'],['Pending',pending,'#f59e0b'],['Upcoming',upcoming,'#3b82f6'],['Completion',`${pct}%`,'#0284c7']].map(([lbl,val,clr],i)=>(
            <div key={lbl} style={{flex:1,padding:'8px 12px',borderRight:i<4?'1px solid #ddd':'none',textAlign:'center'}}>
              <div style={{fontSize:9,color:'#94a3b8',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.5px'}}>{lbl}</div>
              <div style={{fontSize:16,fontWeight:800,color:clr,marginTop:2}}>{val}</div>
            </div>
          ))}
        </div>

        {/* ── Letters section ── */}
        <div className="comm-letters-section" style={{marginTop:12,background:'#fff',borderRadius:10,border:'1px solid #e2e8f0',overflow:'hidden'}}>
          <div style={{background:'#0f172a',padding:'9px 14px',display:'flex',alignItems:'center',gap:8}}>
            <span style={{fontSize:12,fontWeight:700,color:'#fff'}}>📝 Generated Letters</span>
            <span style={{marginLeft:'auto',fontSize:11,color:'#94a3b8'}}>{letters.length} letter{letters.length!==1?'s':''}</span>
            <button onClick={()=>openLetterComposer()}
              style={{marginLeft:8,padding:'4px 13px',background:'#104f4f',color:'#fff',border:'none',borderRadius:5,fontSize:11,fontWeight:700,cursor:'pointer',fontFamily:F}}>
              + New Letter
            </button>
          </div>
          {letters.length===0?(
            <div style={{padding:'20px',textAlign:'center',color:'#94a3b8',fontSize:12}}>
              No letters generated yet. Click <b>+ New Letter</b> or <b>📝 Generate Letter</b> in the top bar.
            </div>
          ):(
            <div style={{padding:'10px 14px',display:'flex',flexDirection:'column',gap:8}}>
              {letters.map(lt=>(
                <div key={lt.id} style={{border:'1px solid #e2e8f0',borderRadius:7,padding:'10px 14px',display:'flex',alignItems:'center',gap:12,background:'#fafcff'}}>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:12,fontWeight:700,color:'#1e293b',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                      {lt.subject||'(No Subject)'}
                    </div>
                    <div style={{fontSize:11,color:'#64748b',marginTop:2}}>
                      Ref: {lt.refNo||'—'} &nbsp;•&nbsp; Date: {lt.date||'—'} &nbsp;•&nbsp; To: {lt.toName||lt.toAddress?.split('\n')[0]||'—'}
                    </div>
                  </div>
                  <div style={{display:'flex',gap:6,flexShrink:0}}>
                    <button onClick={()=>openLetterComposer(lt)}
                      style={{padding:'5px 11px',border:'1px solid #d1d5db',borderRadius:5,background:'#fff',cursor:'pointer',fontSize:11,color:'#374151',fontFamily:F}}>
                      ✏ Edit
                    </button>
                    <button onClick={()=>printLetter(lt)}
                      style={{padding:'5px 11px',border:'none',borderRadius:5,background:'#104f4f',cursor:'pointer',fontSize:11,color:'#fff',fontWeight:700,fontFamily:F}}>
                      🖨 PDF
                    </button>
                    <button onClick={()=>downloadLetterAsWord(lt)}
                      style={{padding:'5px 11px',border:'none',borderRadius:5,background:'#1d4ed8',cursor:'pointer',fontSize:11,color:'#fff',fontWeight:700,fontFamily:F}}>
                      ⬇ Word
                    </button>
                    <button onClick={()=>handleDeleteLetter(lt.id)}
                      style={{padding:'5px 11px',border:'1px solid #fecaca',borderRadius:5,background:'#fef2f2',cursor:'pointer',fontSize:11,color:'#dc2626',fontFamily:F}}>
                      🗑
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
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
                  <a key={i} href={`/api/communication/${orderId}/docs/${a.file}?companyId=${cid}`}
                    target="_blank" rel="noreferrer"
                    style={{display:'flex',flexDirection:'column',alignItems:'center',gap:4,textDecoration:'none',width:90}}>
                    <div style={{width:48,height:56,borderRadius:6,border:'1px solid #e2e8f0',
                      background:isPdf?'#fef2f2':'#eff6ff',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:2}}>
                      <span style={{fontSize:18}}>{isPdf?'📄':'📁'}</span>
                      <span style={{fontSize:8,fontWeight:700,color:isPdf?'#dc2626':P2}}>{ext}</span>
                    </div>
                    <div style={{fontSize:10,color:'#334155',textAlign:'center',lineHeight:1.3,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',width:'100%'}}>{a.name}</div>
                    <div style={{fontSize:10,color:P2,fontWeight:600}}>View</div>
                  </a>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ══════════════ ADD / EDIT LOG MODAL ══════════════ */}
      {showForm&&(
        <div className="comm-modal" style={{position:'fixed',inset:0,background:'rgba(15,23,42,0.5)',zIndex:1000,
          display:'flex',alignItems:'center',justifyContent:'center',padding:20}}>
          <div style={{background:'#fff',borderRadius:12,width:'100%',maxWidth:560,
            maxHeight:'90vh',overflow:'auto',boxShadow:'0 20px 60px rgba(0,0,0,0.25)'}}>
            <div style={{background:P,padding:'14px 18px',display:'flex',alignItems:'center',
              justifyContent:'space-between',borderRadius:'12px 12px 0 0'}}>
              <span style={{fontSize:14,fontWeight:700,color:'#fff'}}>
                {editLogId ? 'Edit Communication Log Entry' : 'Add Communication Log Entry'}
              </span>
              <button onClick={()=>{setShowForm(false);setEditLogId(null);}}
                style={{background:'rgba(255,255,255,0.2)',border:'none',borderRadius:6,color:'#fff',
                  cursor:'pointer',fontSize:18,width:28,height:28,lineHeight:1}}>×</button>
            </div>

            <form onSubmit={handleSubmit} style={{padding:'18px 20px',display:'flex',flexDirection:'column',gap:13}}>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                <div>
                  <label style={LB}>Date (DD-MM-YYYY)</label>
                  <input value={form.date} onChange={handleDateKey} placeholder="DD-MM-YYYY" maxLength={10} style={INP}/>
                </div>
                <div>
                  <label style={LB}>Status</label>
                  <select value={form.status} onChange={e=>setF('status',e.target.value)} style={INP}>
                    <option>Completed</option><option>Pending</option><option>Upcoming</option>
                  </select>
                </div>
              </div>
              <div>
                <label style={LB}>Stage / Activity <span style={{color:'#dc2626'}}>*</span></label>
                <input value={form.stage} onChange={e=>setF('stage',e.target.value)}
                  placeholder="e.g. LOA Received, Order Confirmation Sent…" list="stage-list" style={INP}/>
                <datalist id="stage-list">{STAGES.map(s=><option key={s} value={s}/>)}</datalist>
              </div>
              <div>
                <label style={LB}>Description</label>
                <textarea value={form.description} onChange={e=>setF('description',e.target.value)}
                  placeholder="Enter details about this communication…" rows={3}
                  style={{...INP,height:'auto',padding:'8px 10px',resize:'vertical'}}/>
              </div>
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
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                <div>
                  <label style={LB}>By (Person)</label>
                  <input value={form.by} onChange={e=>setF('by',e.target.value)} placeholder="Name" style={INP}/>
                </div>
                <div>
                  <label style={LB}>Remarks</label>
                  <input value={form.remarks} onChange={e=>setF('remarks',e.target.value)} placeholder="Additional notes" style={INP}/>
                </div>
              </div>
              {!editLogId&&(
                <div>
                  <label style={LB}>Attachments</label>
                  <input ref={fileRef} type="file" multiple onChange={e=>setFiles(Array.from(e.target.files))}
                    style={{fontSize:12,fontFamily:F,cursor:'pointer',width:'100%'}}/>
                  {files.length>0&&<div style={{fontSize:11,color:'#64748b',marginTop:3}}>{files.map(f=>f.name).join(', ')}</div>}
                </div>
              )}
              {error&&<div style={{fontSize:12,color:'#dc2626',background:'#fef2f2',border:'1px solid #fecaca',borderRadius:5,padding:'7px 10px'}}>{error}</div>}
              <div style={{display:'flex',gap:10,marginTop:2}}>
                <button type="button" onClick={()=>{setShowForm(false);setEditLogId(null);}}
                  style={{flex:1,height:38,border:'1px solid #e2e8f0',borderRadius:7,background:'#fff',fontSize:13,color:'#475569',cursor:'pointer',fontFamily:F}}>
                  Cancel
                </button>
                <button type="submit" disabled={saving}
                  style={{flex:2,height:38,background:saving?'#94a3b8':P2,color:'#fff',border:'none',
                    borderRadius:7,fontSize:13,fontWeight:700,cursor:saving?'default':'pointer',fontFamily:F}}>
                  {saving?'Saving…':editLogId?'Update Entry':'Save Log Entry'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ══════════════ LETTER COMPOSER MODAL ══════════════ */}
      {showLetterComposer&&(
        <div className="comm-modal" style={{position:'fixed',inset:0,background:'rgba(15,23,42,0.65)',zIndex:1100,
          display:'flex',alignItems:'center',justifyContent:'center',padding:16}}>
          <div style={{background:'#fff',borderRadius:12,width:'100%',maxWidth:820,maxHeight:'96vh',
            overflow:'hidden',boxShadow:'0 24px 80px rgba(0,0,0,0.35)',display:'flex',flexDirection:'column'}}>

            {/* Modal header with tabs */}
            <div style={{background:'#0f172a',padding:'12px 18px',display:'flex',alignItems:'center',gap:10,flexShrink:0}}>
              <span style={{fontSize:14,fontWeight:700,color:'#fff',flex:1}}>
                {editLetter?'Edit Letter':'Compose Letter'}
              </span>
              <div style={{display:'flex',gap:4,background:'rgba(255,255,255,0.08)',borderRadius:7,padding:3}}>
                {[['compose','✏ Compose'],['preview','👁 Preview']].map(([t,lbl])=>(
                  <button key={t} onClick={()=>setLetterTab(t)}
                    style={{padding:'5px 14px',borderRadius:5,border:'none',cursor:'pointer',fontSize:12,fontWeight:600,
                      background:letterTab===t?'rgba(255,255,255,0.18)':'transparent',
                      color:letterTab===t?'#fff':'#94a3b8',transition:'all .1s'}}>
                    {lbl}
                  </button>
                ))}
              </div>
              <button onClick={()=>setShowLetterComposer(false)}
                style={{background:'rgba(255,255,255,0.15)',border:'none',borderRadius:6,color:'#fff',
                  cursor:'pointer',fontSize:18,width:28,height:28,lineHeight:1,marginLeft:8}}>×</button>
            </div>

            {/* Compose tab */}
            {letterTab==='compose'&&(
              <div style={{flex:1,overflow:'auto',padding:'18px 20px',display:'flex',flexDirection:'column',gap:13}}>

                {/* Row 1: Date, Ref No, Delivery Method */}
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:12}}>
                  <div>
                    <label style={LB}>Date</label>
                    <input value={letterForm.date} onChange={e=>setLF('date',e.target.value)} placeholder="DD-MM-YYYY" style={INP}/>
                  </div>
                  <div>
                    <label style={LB}>Ref No</label>
                    <input value={letterForm.refNo} onChange={e=>setLF('refNo',e.target.value)} placeholder="EE2526033/Letter-01" style={INP}/>
                  </div>
                  <div>
                    <label style={LB}>Delivery Method</label>
                    <select value={letterForm.deliveryMethod} onChange={e=>setLF('deliveryMethod',e.target.value)} style={INP}>
                      <option>By Email/Post</option>
                      <option>By Email</option>
                      <option>By Post</option>
                      <option>By Hand</option>
                      <option>By Courier</option>
                    </select>
                  </div>
                </div>

                {/* To name + address */}
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                  <div>
                    <label style={LB}>To: Organization / Name</label>
                    <input value={letterForm.toName} onChange={e=>setLF('toName',e.target.value)}
                      placeholder="Hindustan Aeronautics Limited" style={INP}/>
                  </div>
                  <div>
                    <label style={LB}>To: Address (multi-line)</label>
                    <textarea value={letterForm.toAddress} onChange={e=>setLF('toAddress',e.target.value)}
                      placeholder={"Rotary Wing Research & Design Center\nVibutipura Post Marathally\nBangalore"} rows={3}
                      style={{...INP,height:'auto',padding:'8px 10px',resize:'vertical'}}/>
                  </div>
                </div>

                {/* Order ref + Subject */}
                <div>
                  <label style={LB}>Order Reference (shown before subject)</label>
                  <input value={letterForm.orderRef} onChange={e=>setLF('orderRef',e.target.value)}
                    placeholder="GEMC-511687781751592 dated: 8-Jan-26" style={INP}/>
                </div>
                <div>
                  <label style={LB}>Subject <span style={{color:'#dc2626'}}>*</span></label>
                  <input value={letterForm.subject} onChange={e=>setLF('subject',e.target.value)}
                    placeholder="Request for Acceptance of Minor Deviation and Release of Long Overdue Payment" style={INP}/>
                </div>

                {/* Body */}
                <div>
                  <label style={LB}>
                    Letter Body
                    <span style={{fontSize:10,color:'#94a3b8',fontWeight:400,marginLeft:6}}>
                      Start line with "• " for bullet • wrap with **text** for bold
                    </span>
                  </label>
                  <textarea value={letterForm.body} onChange={e=>setLF('body',e.target.value)}
                    placeholder={"Dear Sir,\n\nWe refer to the supply of Porta Cabins...\n\nWe therefore request you to:\n• Kindly accept the supplied material.\n• Process and release the balance payment at the earliest."}
                    rows={12}
                    style={{...INP,height:'auto',padding:'10px 12px',resize:'vertical',lineHeight:'1.55',fontSize:12}}/>
                </div>

                {/* Closing */}
                <div>
                  <label style={LB}>Closing</label>
                  <textarea value={letterForm.closing} onChange={e=>setLF('closing',e.target.value)}
                    rows={4} style={{...INP,height:'auto',padding:'8px 10px',resize:'vertical'}}/>
                </div>

                {/* Signatory block */}
                <div style={{border:'1px solid #e2e8f0',borderRadius:8,padding:'12px 14px',background:'#fafcff'}}>
                  <div style={{fontSize:11,fontWeight:700,color:'#374151',marginBottom:10}}>Authorized Signatory</div>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                    <div>
                      <label style={LB}>Name</label>
                      <input value={letterForm.signatoryName} onChange={e=>setLF('signatoryName',e.target.value)}
                        placeholder="Rajan Kushwaha" style={INP}/>
                    </div>
                    <div>
                      <label style={LB}>Designation</label>
                      <input value={letterForm.signatoryDesignation} onChange={e=>setLF('signatoryDesignation',e.target.value)}
                        placeholder="Head Account & Finance Dept." style={INP}/>
                    </div>
                    <div>
                      <label style={LB}>Mobile</label>
                      <input value={letterForm.signatoryMobile} onChange={e=>setLF('signatoryMobile',e.target.value)}
                        placeholder="9328927043" style={INP}/>
                    </div>
                    <div>
                      <label style={LB}>Email</label>
                      <input value={letterForm.signatoryEmail} onChange={e=>setLF('signatoryEmail',e.target.value)}
                        placeholder="finacc@epsilonprefab.org" style={INP}/>
                    </div>
                  </div>
                </div>

                {letterError&&<div style={{fontSize:12,color:'#dc2626',background:'#fef2f2',border:'1px solid #fecaca',borderRadius:5,padding:'7px 10px'}}>{letterError}</div>}
              </div>
            )}

            {/* Preview tab */}
            {letterTab==='preview'&&(
              <div style={{flex:1,overflow:'auto',padding:'14px 16px',display:'flex',flexDirection:'column',gap:10}}>
                <div style={{background:'#eff6ff',borderRadius:7,padding:'8px 12px',fontSize:11,color:'#1d4ed8'}}>
                  This is a screen preview (without logo). Click <b>🖨 Print PDF</b> to get the full letter with company logo and page layout.
                </div>
                <div style={{flex:1,border:'1px solid #d1d5db',borderRadius:6,overflow:'hidden',background:'#fff'}}>
                  <iframe
                    srcDoc={buildLetterHTML(letterForm, order, selectedCompany, '')}
                    style={{width:'100%',height:580,border:'none'}}
                    title="Letter Preview"
                  />
                </div>
              </div>
            )}

            {/* Footer action bar */}
            <div style={{borderTop:'1px solid #e2e8f0',padding:'12px 20px',display:'flex',gap:10,flexShrink:0,flexWrap:'wrap',alignItems:'center'}}>
              <button onClick={()=>setShowLetterComposer(false)}
                style={{padding:'8px 18px',border:'1px solid #e2e8f0',borderRadius:7,background:'#fff',fontSize:13,color:'#475569',cursor:'pointer',fontFamily:F}}>
                Cancel
              </button>
              <button onClick={handleSaveLetter} disabled={letterSaving}
                style={{padding:'8px 20px',background:letterSaving?'#94a3b8':'#0f172a',color:'#fff',border:'none',
                  borderRadius:7,fontSize:13,fontWeight:700,cursor:letterSaving?'default':'pointer',fontFamily:F}}>
                {letterSaving?'Saving…':editLetter?'Update Letter':'Save Letter'}
              </button>
              <div style={{marginLeft:'auto',display:'flex',gap:8}}>
                <button onClick={()=>printLetter(letterForm)}
                  style={{padding:'8px 18px',background:'#104f4f',color:'#fff',border:'none',borderRadius:7,fontSize:13,fontWeight:700,cursor:'pointer',fontFamily:F}}>
                  🖨 Print PDF
                </button>
                <button onClick={()=>downloadLetterAsWord(letterForm)}
                  style={{padding:'8px 18px',background:'#1d4ed8',color:'#fff',border:'none',borderRadius:7,fontSize:13,fontWeight:700,cursor:'pointer',fontFamily:F}}>
                  ⬇ Download Word
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const LB  = { fontSize:11, fontWeight:600, color:'#475569', display:'block', marginBottom:4 };
const INP = {
  width:'100%', height:34, padding:'0 10px', border:'1px solid #d1d5db',
  borderRadius:6, fontSize:12, fontFamily:"'Inter',sans-serif", outline:'none',
  boxSizing:'border-box', background:'#fff',
};
