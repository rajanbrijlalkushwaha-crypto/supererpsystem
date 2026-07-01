import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useCompany } from '../../context/CompanyContext';

const F = "'Inter', -apple-system, BlinkMacSystemFont, sans-serif";
const MONTHS = ['Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec','Jan','Feb','Mar'];

const today = new Date();
const FY = today.getMonth() >= 3
  ? `FY ${today.getFullYear()}–${(today.getFullYear()+1).toString().slice(2)}`
  : `FY ${today.getFullYear()-1}–${today.getFullYear().toString().slice(2)}`;

const dateStr = today.toLocaleDateString('en-IN',{ weekday:'long', day:'2-digit', month:'long', year:'numeric' });

const fmtINR = n => {
  const v = parseFloat(n) || 0;
  if (v >= 10000000) return `₹${(v/10000000).toFixed(2)} Cr`;
  if (v >= 100000)   return `₹${(v/100000).toFixed(2)} L`;
  if (v >= 1000)     return `₹${(v/1000).toFixed(1)} K`;
  return `₹${v.toFixed(0)}`;
};

const fmtFull = n => {
  const v = Math.abs(parseFloat(n) || 0);
  return v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

function monthIdx(ds) {
  if (!ds) return -1;
  const d = new Date(ds); if (isNaN(d)) return -1;
  const m = d.getMonth();
  return m >= 3 ? m - 3 : m + 9;
}

/* ── Bar Chart ── */
function BarChart({ salesData, purchData }) {
  const [tip, setTip] = useState(null);
  const W=620,H=170,PL=52,PR=12,PT=12,PB=28;
  const cH=H-PT-PB, cW=W-PL-PR;
  const maxV = Math.max(...salesData,...purchData,1);
  const bW=cW/salesData.length*0.2;
  const gap=cW/salesData.length;
  return (
    <div style={{ position:'relative' }}>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display:'block', overflow:'visible', fontFamily:F }}>
        <defs>
          <linearGradient id="gS" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#60A5FA"/><stop offset="100%" stopColor="#2563EB" stopOpacity="0.85"/>
          </linearGradient>
          <linearGradient id="gP" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#34D399"/><stop offset="100%" stopColor="#059669" stopOpacity="0.85"/>
          </linearGradient>
          <filter id="sh"><feDropShadow dx="0" dy="1" stdDeviation="1.5" floodOpacity="0.12"/></filter>
        </defs>
        {[0,0.25,0.5,0.75,1].map((t,i) => {
          const y=PT+cH*(1-t);
          return (
            <g key={i}>
              <line x1={PL} y1={y} x2={W-PR} y2={y} stroke="#F1F5F9" strokeWidth={t===0?1.5:0.8}/>
              {t>0 && <text x={PL-5} y={y+3.5} textAnchor="end" fontSize="8" fill="#94A3B8" fontFamily={F}>{fmtINR(maxV*t)}</text>}
            </g>
          );
        })}
        {salesData.map((sv,i) => {
          const pv=purchData[i];
          const x=PL+gap*i+gap*0.12;
          const sh=Math.max((sv/maxV)*cH,sv>0?2:0);
          const ph=Math.max((pv/maxV)*cH,pv>0?2:0);
          return (
            <g key={i}
              onMouseEnter={()=>setTip({i,sv,pv,x:x+bW,y:PT+cH-Math.max(sh,ph)-10})}
              onMouseLeave={()=>setTip(null)} style={{cursor:'default'}}>
              <rect x={x} y={PT+cH-sh} width={bW} height={Math.max(sh,0)} fill="url(#gS)" rx="2" filter="url(#sh)"/>
              <rect x={x+bW+2} y={PT+cH-ph} width={bW} height={Math.max(ph,0)} fill="url(#gP)" rx="2" filter="url(#sh)"/>
              <text x={x+bW} y={H-PB+12} textAnchor="middle" fontSize="7.5" fill="#9CA3AF" fontFamily={F}>{MONTHS[i]}</text>
            </g>
          );
        })}
        <line x1={PL} y1={PT+cH} x2={W-PR} y2={PT+cH} stroke="#E5EAF2" strokeWidth="1.5"/>
      </svg>
      {tip && (
        <div style={{ position:'absolute', top:tip.y, left:`${(tip.x/620)*100}%`, transform:'translateX(-50%)',
          background:'#1E293B', color:'#fff', borderRadius:7, padding:'7px 11px', fontSize:11,
          pointerEvents:'none', whiteSpace:'nowrap', boxShadow:'0 8px 24px rgba(0,0,0,0.25)', zIndex:10 }}>
          <div style={{ color:'#94A3B8', fontSize:9, fontWeight:700, marginBottom:3, textTransform:'uppercase' }}>{MONTHS[tip.i]}</div>
          <div style={{ display:'flex', gap:10 }}>
            <span>🔵 {fmtINR(tip.sv)}</span>
            <span>🟢 {fmtINR(tip.pv)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Quick action button ── */
function QB({ label, path: p, icon, color, bg }) {
  const navigate = useNavigate();
  return (
    <button onClick={() => navigate(p)}
      style={{ display:'flex', alignItems:'center', gap:9, padding:'9px 13px',
        background:'#fff', border:'1px solid #E5EAF2', borderRadius:9,
        cursor:'pointer', textAlign:'left', width:'100%', transition:'all 0.14s',
        boxShadow:'0 1px 2px rgba(16,24,40,0.04)' }}
      onMouseEnter={e=>{e.currentTarget.style.background=bg;e.currentTarget.style.borderColor=color+'55';}}
      onMouseLeave={e=>{e.currentTarget.style.background='#fff';e.currentTarget.style.borderColor='#E5EAF2';}}>
      <div style={{ width:30,height:30,borderRadius:7,background:bg,display:'flex',alignItems:'center',
        justifyContent:'center',fontSize:15,flexShrink:0 }}>{icon}</div>
      <span style={{ fontSize:12,fontWeight:600,color:'#374151',fontFamily:F }}>{label}</span>
      <span style={{ marginLeft:'auto',color:'#D1D5DB',fontSize:13 }}>›</span>
    </button>
  );
}

const STATUS_STYLE = {
  approved:  '#059669', confirmed:'#059669', pending:'#D97706',
  draft:'#6B7280', completed:'#2F6FED', rejected:'#DC2626',
};

/* ── MAIN ── */
export default function Dashboard() {
  const { selectedCompany } = useCompany();
  const navigate = useNavigate();
  const cid = selectedCompany?.companyId;

  const [fin,      setFin]      = useState(null);
  const [salesMo,  setSalesMo]  = useState(Array(12).fill(0));
  const [purchMo,  setPurchMo]  = useState(Array(12).fill(0));
  const [activity, setActivity] = useState([]);
  const [counts,   setCounts]   = useState({ clients:0,vendors:0,sos:0,pos:0 });
  const [loading,  setLoading]  = useState(false);

  const calcSubTotal = (items=[]) =>
    items.reduce((s,it) => {
      const base = (parseFloat(it.qty||it.quantity)||0)*(parseFloat(it.rate)||0);
      const disc = it.discountType==='%' ? base*(parseFloat(it.discount)||0)/100 : (parseFloat(it.discount)||0);
      return s + base - disc;
    }, 0);

  const load = useCallback(async () => {
    if (!cid) return;
    setLoading(true);
    try {
      const [cR,vR,soR,poR,duesR,sbR,pbR,pymtR] = await Promise.all([
        axios.get(`/api/clients?companyId=${cid}`).catch(()=>({data:[]})),
        axios.get(`/api/vendors?companyId=${cid}`).catch(()=>({data:[]})),
        axios.get(`/api/sales-orders?companyId=${cid}`).catch(()=>({data:[]})),
        axios.get(`/api/purchase-orders?companyId=${cid}`).catch(()=>({data:[]})),
        axios.get(`/api/accounts/dues?companyId=${cid}`).catch(()=>({data:{}})),
        axios.get(`/api/bills?companyId=${cid}&type=sales`).catch(()=>({data:[]})),
        axios.get(`/api/bills?companyId=${cid}&type=purchase`).catch(()=>({data:[]})),
        axios.get(`/api/accounts/payments?companyId=${cid}`).catch(()=>({data:[]})),
      ]);

      const sos     = (soR.data||[]).filter(o => !o.tallyImported && !['draft','rejected'].includes(o.status));
      const pos     = (poR.data||[]).filter(o => !['draft','rejected'].includes(o.status));
      const bills   = sbR.data || [];
      const pbills  = pbR.data || [];
      const { clientDues=[], vendorDues=[] } = duesR.data || {};
      const payments = pymtR.data || [];

      /* ── SO metrics ── */
      const soWithGST    = sos.reduce((s,o) => s+(parseFloat(o.grandTotal)||0), 0);
      const soWithoutGST = sos.reduce((s,o) => {
        const gt=parseFloat(o.grandTotal)||0;
        const st=parseFloat(o.subTotal)||0;
        const tg=parseFloat(o.totalGST)||0;
        return s+(st>0?st:tg>0?gt-tg:gt);
      }, 0);

      /* ── PO metrics ── */
      const poWithGST    = pos.reduce((s,o) => s+(parseFloat(o.grandTotal)||0), 0);
      const poWithoutGST = pos.reduce((s,o) => {
        const gt=parseFloat(o.grandTotal)||0;
        const st=parseFloat(o.subTotal)||0;
        const tg=parseFloat(o.totalGST)||0;
        if (st>0) return s+st;
        if (tg>0) return s+gt-tg;
        return s+calcSubTotal(o.items||[]);
      }, 0);

      /* ── Sales Bills metrics ── */
      const sbWithGST    = bills.reduce((s,b) => s+(parseFloat(b.grandTotal)||0), 0);
      const sbWithoutGST = bills.reduce((s,b) => s+(parseFloat(b.subTotal)||0), 0);

      /* ── Purchase Bills metrics ── */
      const pbWithGST    = pbills.reduce((s,b) => s+(parseFloat(b.grandTotal)||0), 0);
      const pbWithoutGST = pbills.reduce((s,b) => s+(parseFloat(b.subTotal)||0), 0);

      /* ── Receivable ── */
      const soMap = {};
      sos.forEach(o => { soMap[String(o.orderId)]=o; });
      const recWithGST    = Array.isArray(clientDues)?clientDues.reduce((s,d) => s+(parseFloat(d.due)||0), 0):0;
      const recWithoutGST = Array.isArray(clientDues)?clientDues.reduce((s,d) => {
        const so = soMap[String(d.orderId)];
        if (!so) return s+(parseFloat(d.due)||0);
        const gt=parseFloat(so.grandTotal)||1;
        const st=parseFloat(so.subTotal)||0;
        const tg=parseFloat(so.totalGST)||0;
        const base=st>0?st:(tg>0?gt-tg:gt);
        return s+(parseFloat(d.due)||0)*(gt>0?base/gt:1);
      }, 0):0;

      /* ── Payable ── */
      const poMap = {};
      pos.forEach(o => { poMap[String(o.orderId)]=o; });
      const payWithGST    = Array.isArray(vendorDues)?vendorDues.reduce((s,d) => s+(parseFloat(d.due)||0), 0):0;
      const payWithoutGST = Array.isArray(vendorDues)?vendorDues.reduce((s,d) => {
        const po = poMap[String(d.orderId)];
        if (!po) return s+(parseFloat(d.due)||0);
        const gt=parseFloat(po.grandTotal)||1;
        const st=parseFloat(po.subTotal)||0;
        const tg=parseFloat(po.totalGST)||0;
        const base=st>0?st:(tg>0?gt-tg:gt);
        return s+(parseFloat(d.due)||0)*(gt>0?base/gt:1);
      }, 0):0;

      setFin({
        soWithGST, soWithoutGST,
        sbWithGST, sbWithoutGST,
        poWithGST, poWithoutGST,
        pbWithGST, pbWithoutGST,
        recWithGST, recWithoutGST,
        payWithGST, payWithoutGST,
        netWithGST: recWithGST-payWithGST,
        netWithoutGST: recWithoutGST-payWithoutGST,
      });
      setCounts({ clients:(cR.data||[]).length, vendors:(vR.data||[]).length, sos:sos.length, pos:pos.length });

      /* ── Chart ── */
      const sArr=Array(12).fill(0), pArr=Array(12).fill(0);
      sos.forEach(o => {
        const i=monthIdx(o.orderDate||o.date||o.createdAt);
        if(i>=0) sArr[i]+=parseFloat(o.grandTotal||0)||0;
      });
      pos.forEach(o => {
        const i=monthIdx(o.poDate||o.date||o.createdAt);
        if(i>=0) pArr[i]+=parseFloat(o.grandTotal||0)||0;
      });
      setSalesMo(sArr); setPurchMo(pArr);

      /* ── Activity ── */
      const acts = [
        ...sos.slice(-5).map(o=>({ type:'Sales Order', ref:o.orderNo||`SO-${o.orderId}`, party:o.customerName||o.clientName||'—', amt:parseFloat(o.grandTotal||0), status:o.status||'draft', date:o.orderDate||o.createdAt||'' })),
        ...pos.slice(-4).map(o=>({ type:'Purchase',    ref:o.poNo||`PO-${o.orderId}`,   party:o.vendorName||'—',                  amt:parseFloat(o.grandTotal||0), status:o.status||'draft', date:o.poDate||o.createdAt||'' })),
        ...payments.slice(-4).map(p=>({ type:p.type==='receipt'?'Receipt':'Payment',    ref:p.referenceNo||`PMT-${p.paymentId||p.id}`, party:p.entityName||p.party||'—', amt:parseFloat(p.amount||0), status:p.status||'pending', date:p.date||p.createdAt||'' })),
        ...bills.slice(-3).map(b=>({ type:'Sales Bill', ref:b.billNo||b.billId, party:b.partyName||'—', amt:parseFloat(b.grandTotal||0), status:'confirmed', date:b.billDate||b.createdAt||'' })),
        ...pbills.slice(-3).map(b=>({ type:'Purch. Bill', ref:b.billNo||b.billId, party:b.partyName||'—', amt:parseFloat(b.grandTotal||0), status:'confirmed', date:b.billDate||b.createdAt||'' })),
      ].sort((a,b)=>new Date(b.date)-new Date(a.date)).slice(0,14);
      setActivity(acts);

    } catch(e){ console.error(e); }
    setLoading(false);
  }, [cid]);

  useEffect(() => { load(); }, [load]);

  const f = fin || {};
  const soGST  = (f.soWithGST||0)-(f.soWithoutGST||0);
  const sbGST  = (f.sbWithGST||0)-(f.sbWithoutGST||0);
  const poGST  = (f.poWithGST||0)-(f.poWithoutGST||0);
  const pbGST  = (f.pbWithGST||0)-(f.pbWithoutGST||0);
  const recGST = (f.recWithGST||0)-(f.recWithoutGST||0);
  const payGST = (f.payWithGST||0)-(f.payWithoutGST||0);
  const netGST = (f.netWithGST||0)-(f.netWithoutGST||0);
  const netSign = (f.netWithGST||0) >= 0;

  const fmtDate = d => {
    if (!d) return '—';
    const dt = new Date(d); if (isNaN(dt)) return d;
    return dt.toLocaleDateString('en-IN',{day:'2-digit',month:'short'});
  };

  const QUICK = [
    { label:'New Sales Order',     path:'/sales-order/create',             icon:'📋', color:'#2F6FED', bg:'#EEF4FF' },
    { label:'New Purchase Order',  path:'/purchase-order/create',          icon:'🛒', color:'#F59E0B', bg:'#FFFBEB' },
    { label:'Sales Bill Entry',    path:'/sales-bill',                     icon:'🧾', color:'#10B981', bg:'#ECFDF5' },
    { label:'Purchase Bill Entry', path:'/purchase-bill',                  icon:'📄', color:'#6366F1', bg:'#EEF2FF' },
    { label:'GRN — Stock In',      path:'/stock/in',                       icon:'📦', color:'#06B6D4', bg:'#ECFEFF' },
    { label:'GDN — Stock Out',     path:'/stock/out',                      icon:'🚚', color:'#EF4444', bg:'#FEF2F2' },
    { label:'Add Client',          path:'/client-sap',                     icon:'👤', color:'#10B981', bg:'#ECFDF5' },
    { label:'Add Vendor',          path:'/vendor/create',                  icon:'🏭', color:'#6366F1', bg:'#EEF2FF' },
    { label:'Payment Entry',       path:'/account/payment/create',         icon:'💸', color:'#D97706', bg:'#FFFBEB' },
    { label:'Receipt Entry',       path:'/account/receipt/create',         icon:'💰', color:'#059669', bg:'#ECFDF5' },
    { label:'Job Sheet',           path:'/manufacturing/job-sheets/create',icon:'🔧', color:'#F472B6', bg:'#FDF2F8' },
    { label:'Tally Import',        path:'/tally/import',                   icon:'📥', color:'#818CF8', bg:'#EEF2FF' },
  ];

  const ROWS = fin ? [
    { label:'Sales Order Value',     withG:f.soWithGST,  exG:f.soWithoutGST,  gstAmt:soGST,  color:'#2563EB', icon:'📋', nav:'/sales-order/view' },
    { label:'Sales Invoice Value',   withG:f.sbWithGST,  exG:f.sbWithoutGST,  gstAmt:sbGST,  color:'#7C3AED', icon:'🧾', nav:'/sales-bill' },
    null,
    { label:'PO Value',              withG:f.poWithGST,  exG:f.poWithoutGST,  gstAmt:poGST,  color:'#0369A1', icon:'🛒', nav:'/purchase-order/view' },
    { label:'Purchase Invoice Value',withG:f.pbWithGST,  exG:f.pbWithoutGST,  gstAmt:pbGST,  color:'#6366F1', icon:'📄', nav:'/purchase-bill' },
    null,
    { label:'Receivable (from Clients)',withG:f.recWithGST,exG:f.recWithoutGST,gstAmt:recGST, color:'#059669', icon:'💰', nav:'/account/dues' },
    { label:'Payable (to Vendors)',  withG:f.payWithGST, exG:f.payWithoutGST, gstAmt:payGST, color:'#DC2626', icon:'💸', nav:'/account/dues' },
    null,
    { label:'NET CLOSING',           withG:f.netWithGST, exG:f.netWithoutGST, gstAmt:netGST, color:netSign?'#059669':'#DC2626', icon:netSign?'📈':'📉', bold:true },
  ] : [];

  const typeIcon = { 'Sales Order':'📋','Purchase':'🛒','Receipt':'💰','Payment':'💸','Sales Bill':'🧾','Purch. Bill':'📄' };
  const typeClr  = { 'Sales Order':'#2F6FED','Purchase':'#F59E0B','Receipt':'#10B981','Payment':'#EF4444','Sales Bill':'#7C3AED','Purch. Bill':'#6366F1' };

  return (
    <div style={{ fontFamily:F, background:'#F0F4FB', minHeight:'100vh' }}>
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.45}} @keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}} .fa{animation:fadeUp 0.3s ease forwards}`}</style>

      {/* ── Header banner ── */}
      <div style={{ background:'linear-gradient(135deg,#1D4ED8 0%,#1e3a8a 100%)', padding:'16px 24px', position:'relative', overflow:'hidden' }}>
        <div style={{ position:'absolute',right:-20,top:-30,width:140,height:140,borderRadius:'50%',background:'rgba(255,255,255,0.06)' }}/>
        <div style={{ position:'absolute',right:70,bottom:-40,width:90,height:90,borderRadius:'50%',background:'rgba(255,255,255,0.08)' }}/>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', position:'relative' }}>
          <div>
            <div style={{ fontSize:11, color:'rgba(255,255,255,0.6)', marginBottom:2 }}>{dateStr}</div>
            <div style={{ fontSize:20, fontWeight:800, color:'#fff', letterSpacing:'-0.3px' }}>
              {today.getHours()<12?'Good Morning':today.getHours()<17?'Good Afternoon':'Good Evening'} 👋
            </div>
            <div style={{ fontSize:12, color:'rgba(255,255,255,0.6)', marginTop:2 }}>
              {selectedCompany?.companyName || 'No company'} · {FY}
            </div>
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={load}
              style={{ height:32,padding:'0 14px',background:'rgba(255,255,255,0.14)',border:'1px solid rgba(255,255,255,0.28)',
                borderRadius:7,cursor:'pointer',color:'#fff',fontSize:12,fontWeight:600,fontFamily:F,display:'flex',alignItems:'center',gap:6 }}>
              ↻ Refresh
            </button>
            <button onClick={()=>navigate('/sales-order/create')}
              style={{ height:32,padding:'0 16px',background:'#fff',border:'none',borderRadius:7,cursor:'pointer',
                color:'#1D4ED8',fontSize:12,fontWeight:800,fontFamily:F,display:'flex',alignItems:'center',gap:6,
                boxShadow:'0 2px 8px rgba(0,0,0,0.15)' }}>
              + New Order
            </button>
          </div>
        </div>

        {/* Count badges */}
        <div style={{ display:'flex', gap:10, marginTop:14, position:'relative' }}>
          {[
            { label:'Clients',   val:counts.clients, icon:'👥', nav:'/client/view' },
            { label:'Vendors',   val:counts.vendors,  icon:'🏭', nav:'/vendor/view' },
            { label:'Sales Orders', val:counts.sos, icon:'📋', nav:'/sales-order/view' },
            { label:'Purchase Orders', val:counts.pos, icon:'🛒', nav:'/purchase-order/view' },
          ].map(x => (
            <div key={x.label} onClick={()=>navigate(x.nav)}
              style={{ background:'rgba(255,255,255,0.13)', border:'1px solid rgba(255,255,255,0.18)',
                borderRadius:9, padding:'8px 16px', cursor:'pointer', transition:'all 0.15s' }}
              onMouseEnter={e=>e.currentTarget.style.background='rgba(255,255,255,0.2)'}
              onMouseLeave={e=>e.currentTarget.style.background='rgba(255,255,255,0.13)'}>
              <div style={{ fontSize:18, fontWeight:800, color:'#fff' }}>
                {loading ? '—' : x.val}
              </div>
              <div style={{ fontSize:10, color:'rgba(255,255,255,0.6)', marginTop:1 }}>{x.icon} {x.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Body ── */}
      <div style={{ padding:'16px 20px', display:'grid', gridTemplateColumns:'1fr 260px', gap:16 }}>

        {/* LEFT: Financial table + chart + activity */}
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>

          {/* ── Financial Summary Table ── */}
          <div className="fa" style={{ background:'#fff', border:'1px solid #E5EAF2', borderRadius:12,
            overflow:'hidden', boxShadow:'0 1px 4px rgba(16,24,40,0.06)' }}>
            <div style={{ background:'linear-gradient(90deg,#1D4ED8,#2563EB)', padding:'10px 16px',
              display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div>
                <div style={{ fontSize:13, fontWeight:800, color:'#fff' }}>📊 Financial Summary</div>
                <div style={{ fontSize:10, color:'rgba(255,255,255,0.65)', marginTop:1 }}>{FY} · All confirmed orders & bills</div>
              </div>
            </div>

            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12, fontFamily:F }}>
                <thead>
                  <tr style={{ background:'#F8FAFF' }}>
                    <th style={{ padding:'8px 14px', textAlign:'left', fontWeight:700, color:'#374151',
                      fontSize:10, textTransform:'uppercase', letterSpacing:'0.5px', borderBottom:'2px solid #E5EAF2', width:'38%' }}>
                      Metric
                    </th>
                    <th style={{ padding:'8px 14px', textAlign:'right', fontWeight:700, color:'#374151',
                      fontSize:10, textTransform:'uppercase', letterSpacing:'0.5px', borderBottom:'2px solid #E5EAF2', borderLeft:'1px solid #E5EAF2' }}>
                      Gross Value (₹)
                    </th>
                    <th style={{ padding:'8px 14px', textAlign:'right', fontWeight:700, color:'#7C3AED',
                      fontSize:10, textTransform:'uppercase', letterSpacing:'0.5px', borderBottom:'2px solid #E5EAF2', borderLeft:'1px solid #E5EAF2' }}>
                      GST Amount (₹)
                    </th>
                    <th style={{ padding:'8px 14px', textAlign:'right', fontWeight:700, color:'#1D4ED8',
                      fontSize:10, textTransform:'uppercase', letterSpacing:'0.5px', borderBottom:'2px solid #E5EAF2', borderLeft:'1px solid #E5EAF2' }}>
                      Total Value (₹)
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    Array(8).fill(0).map((_,i) => (
                      <tr key={i}>
                        {[38,30,20,12].map((w,j) => (
                          <td key={j} style={{ padding:'10px 14px', borderBottom:'1px solid #F1F5F9' }}>
                            <div style={{ height:14, width:`${w}%`, background:'#F1F5F9', borderRadius:4, animation:'pulse 1.5s infinite' }}/>
                          </td>
                        ))}
                      </tr>
                    ))
                  ) : ROWS.map((row, idx) => {
                    if (row === null) {
                      return (
                        <tr key={`sep-${idx}`}>
                          <td colSpan={4} style={{ padding:0, background:'#F8FAFF', borderBottom:'2px solid #E5EAF2', height:6 }}/>
                        </tr>
                      );
                    }
                    const netPos = row.withG >= 0;
                    const isBold = row.bold;
                    const clr = row.color;
                    return (
                      <tr key={row.label}
                        style={{ background: isBold ? '#F0F9FF' : 'transparent', cursor:row.nav?'pointer':'default' }}
                        onClick={() => row.nav && navigate(row.nav)}
                        onMouseEnter={e => { if(row.nav) e.currentTarget.style.background='#F8FAFF'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = isBold?'#F0F9FF':'transparent'; }}>
                        <td style={{ padding:'10px 14px', borderBottom:'1px solid #F1F5F9',
                          fontWeight: isBold?800:500, color:'#374151', display:'flex', alignItems:'center', gap:8 }}>
                          <span style={{ fontSize:14 }}>{row.icon}</span>
                          <span style={{ fontSize: isBold?13:12 }}>{row.label}</span>
                          {row.nav && <span style={{ marginLeft:'auto', color:'#D1D5DB', fontSize:11 }}>›</span>}
                        </td>
                        <td style={{ padding:'10px 14px', textAlign:'right', borderBottom:'1px solid #F1F5F9',
                          borderLeft:'1px solid #F1F5F9', fontWeight:isBold?700:400, color:'#374151', fontSize:isBold?13:12 }}>
                          {fmtFull(Math.abs(row.exG))}
                        </td>
                        <td style={{ padding:'10px 14px', textAlign:'right', borderBottom:'1px solid #F1F5F9',
                          borderLeft:'1px solid #F1F5F9', color:'#7C3AED', fontSize:11, fontWeight:isBold?700:400 }}>
                          {fmtFull(Math.abs(row.gstAmt))}
                        </td>
                        <td style={{ padding:'10px 14px', textAlign:'right', borderBottom:'1px solid #F1F5F9',
                          borderLeft:'1px solid #F1F5F9', fontWeight:isBold?800:700,
                          fontSize:isBold?14:12, color:isBold?clr:'#1D4ED8', fontFamily:F }}>
                          {row.label==='NET CLOSING' && !netPos && '('}
                          {fmtFull(Math.abs(row.withG))}
                          {row.label==='NET CLOSING' && !netPos && ')'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Chart ── */}
          <div className="fa" style={{ background:'#fff', border:'1px solid #E5EAF2', borderRadius:12,
            overflow:'hidden', boxShadow:'0 1px 4px rgba(16,24,40,0.06)' }}>
            <div style={{ padding:'12px 16px 0', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div>
                <div style={{ fontSize:13, fontWeight:700, color:'#111827' }}>Monthly Orders — {FY}</div>
                <div style={{ fontSize:10.5, color:'#9CA3AF', marginTop:1 }}>Hover bars for values</div>
              </div>
              <div style={{ display:'flex', gap:12, alignItems:'center' }}>
                <div style={{ display:'flex', alignItems:'center', gap:5, fontSize:11, color:'#6B7280' }}>
                  <div style={{ width:10,height:10,borderRadius:2,background:'#2563EB' }}/> Sales Orders
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:5, fontSize:11, color:'#6B7280' }}>
                  <div style={{ width:10,height:10,borderRadius:2,background:'#10B981' }}/> Purchase Orders
                </div>
              </div>
            </div>
            <div style={{ padding:'4px 10px 10px' }}>
              <BarChart salesData={salesMo} purchData={purchMo} />
            </div>
          </div>

          {/* ── Recent Activity ── */}
          <div className="fa" style={{ background:'#fff', border:'1px solid #E5EAF2', borderRadius:12,
            overflow:'hidden', boxShadow:'0 1px 4px rgba(16,24,40,0.06)' }}>
            <div style={{ padding:'12px 16px', borderBottom:'1px solid #F1F5F9',
              display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div style={{ fontSize:13, fontWeight:700, color:'#111827' }}>🕐 Recent Activity</div>
              <span style={{ fontSize:10, color:'#9CA3AF' }}>Last {activity.length} entries</span>
            </div>
            <div style={{ maxHeight:280, overflowY:'auto' }}>
              {loading ? Array(5).fill(0).map((_,i)=>(
                <div key={i} style={{ display:'flex',gap:10,padding:'10px 16px',borderBottom:'1px solid #F9FAFB',alignItems:'center' }}>
                  <div style={{ width:34,height:34,borderRadius:8,background:'#F1F5F9',flexShrink:0,animation:'pulse 1.5s infinite' }}/>
                  <div style={{ flex:1 }}>
                    <div style={{ height:11,width:'55%',background:'#F1F5F9',borderRadius:3,animation:'pulse 1.5s infinite',marginBottom:5 }}/>
                    <div style={{ height:9,width:'35%',background:'#F1F5F9',borderRadius:3,animation:'pulse 1.5s infinite' }}/>
                  </div>
                </div>
              )) : activity.length===0 ? (
                <div style={{ padding:'36px 20px', textAlign:'center', color:'#9CA3AF', fontSize:12 }}>
                  No transactions yet
                </div>
              ) : activity.map((a,i) => {
                const clr=typeClr[a.type]||'#6B7280';
                return (
                  <div key={i} style={{ display:'flex',gap:10,padding:'9px 16px',borderBottom:'1px solid #F9FAFB',alignItems:'center',transition:'background 0.1s' }}
                    onMouseEnter={e=>e.currentTarget.style.background='#F9FAFB'}
                    onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                    <div style={{ width:34,height:34,borderRadius:8,background:`${clr}14`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:15,flexShrink:0 }}>
                      {typeIcon[a.type]||'📄'}
                    </div>
                    <div style={{ flex:1,minWidth:0 }}>
                      <div style={{ display:'flex',alignItems:'center',gap:6,marginBottom:1 }}>
                        <span style={{ fontSize:10,color:clr,fontWeight:700,background:`${clr}12`,padding:'1px 6px',borderRadius:3 }}>{a.type}</span>
                        <span style={{ fontSize:12,fontWeight:600,color:'#111827',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{a.ref}</span>
                      </div>
                      <div style={{ fontSize:10.5,color:'#6B7280',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{a.party}</div>
                    </div>
                    <div style={{ textAlign:'right',flexShrink:0 }}>
                      <div style={{ fontSize:12,fontWeight:700,color:'#111827' }}>{a.amt>0?fmtINR(a.amt):'—'}</div>
                      <div style={{ fontSize:9,color:STATUS_STYLE[a.status]||'#9CA3AF',fontWeight:600,marginTop:2,textTransform:'capitalize' }}>●  {a.status}</div>
                    </div>
                    <div style={{ fontSize:9.5,color:'#9CA3AF',flexShrink:0,minWidth:32,textAlign:'right' }}>{fmtDate(a.date)}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* RIGHT: Quick actions */}
        <div style={{ background:'#fff', border:'1px solid #E5EAF2', borderRadius:12,
          overflow:'hidden', boxShadow:'0 1px 4px rgba(16,24,40,0.06)', display:'flex', flexDirection:'column',
          alignSelf:'start', position:'sticky', top:16 }}>
          <div style={{ background:'linear-gradient(90deg,#1D4ED8,#2563EB)', padding:'11px 14px' }}>
            <div style={{ fontSize:12, fontWeight:700, color:'#fff' }}>⚡ Quick Actions</div>
            <div style={{ fontSize:10, color:'rgba(255,255,255,0.6)', marginTop:1 }}>Jump to common tasks</div>
          </div>
          <div style={{ padding:'10px', overflowY:'auto' }}>
            <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
              {QUICK.map(q => <QB key={q.path} {...q} />)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
