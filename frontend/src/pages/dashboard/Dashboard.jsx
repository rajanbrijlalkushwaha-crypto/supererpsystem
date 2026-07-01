import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useCompany } from '../../context/CompanyContext';
import { useAuth } from '../../context/AuthContext';
import PageLoader from '../../components/PageLoader';

const F = "'Inter', -apple-system, BlinkMacSystemFont, sans-serif";
const P = '#104f4f';
const MONTHS = ['Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec','Jan','Feb','Mar'];
const MONTH_NUM = [4,5,6,7,8,9,10,11,12,1,2,3];

const today = new Date();
const todayISO = today.toISOString().slice(0,10);
const dateStr = today.toLocaleDateString('en-IN',{ weekday:'long', day:'2-digit', month:'long', year:'numeric' });

const fyOf = ds => {
  if (!ds) return null;
  const d = new Date(ds); if (isNaN(d)) return null;
  const m = d.getMonth()+1, y = d.getFullYear(), s = m>=4?y:y-1;
  return `${String(s).slice(2)}-${String(s+1).slice(2)}`;
};
const currentFY = fyOf(todayISO);

const fmt2  = n => (parseFloat(n)||0).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2});
const fmtINR = n => {
  const v = parseFloat(n)||0;
  if(v>=10000000) return `₹${(v/10000000).toFixed(2)} Cr`;
  if(v>=100000)   return `₹${(v/100000).toFixed(2)} L`;
  if(v>=1000)     return `₹${(v/1000).toFixed(1)} K`;
  return `₹${v.toFixed(0)}`;
};
const fmtD = ds => {
  if(!ds) return '—';
  const d=new Date(ds); if(isNaN(d)) return ds;
  return `${String(d.getDate()).padStart(2,'0')}-${String(d.getMonth()+1).padStart(2,'0')}-${d.getFullYear()}`;
};
const slotOf = ds => {
  if(!ds) return -1;
  const d=new Date(ds); if(isNaN(d)) return -1;
  const m=d.getMonth()+1;
  return m>=4?m-4:m+8;
};
const isSameDateStr = (ds, sel) => ds && ds.slice(0,10)===sel;

/* ── Print: Monthly Report ── */
function printMonthlyReport(title, fy, rows, months) {
  const today2 = new Date().toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'});
  const colH = [...months,'Total'].map(m=>`<th>${m}</th>`).join('');
  const bodyH = rows.map(r=>{
    const cells = [...months.map((_,mi)=>`<td class="r">${r.vals[mi]>0?'₹'+fmt2(r.vals[mi]):''}</td>`),
      `<td class="r b">₹${fmt2(r.vals.reduce((s,v)=>s+v,0))}</td>`].join('');
    return `<tr><td class="lbl">${r.label}</td>${cells}</tr>`;
  }).join('');
  const html=`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title>
<style>*{margin:0;padding:0;box-sizing:border-box;}body{font-family:Arial,sans-serif;font-size:8.5pt;}
.pg{padding:8mm 10mm;}h1{font-size:13pt;font-weight:bold;text-align:center;margin-bottom:2px;}
.sub{font-size:9pt;text-align:center;color:#444;margin-bottom:8px;padding-bottom:4px;border-bottom:2px solid #1a2a3a;}
table{width:100%;border-collapse:collapse;border:2px solid #000;}
th{background:#1a2a3a;color:#fff;padding:5px 6px;font-size:8pt;font-weight:bold;text-align:right;border:1px solid #000;white-space:nowrap;}
th:first-child{text-align:left;}
td{padding:4px 6px;font-size:8.5pt;border:1px solid #000;vertical-align:middle;}
td.lbl{font-weight:700;background:#eef3fb;white-space:nowrap;}
td.r{text-align:right;}td.b{font-weight:700;}
tr:nth-child(odd) td:not(.lbl){background:#fff;}tr:nth-child(even) td:not(.lbl){background:#f7f9fc;}
.foot{margin-top:5px;font-size:7.5pt;color:#555;text-align:right;}
@media print{@page{margin:7mm;size:A3 landscape;}.pg{padding:0;}}</style>
</head><body><div class="pg">
<h1>${title}</h1><div class="sub">FY ${fy} &nbsp;·&nbsp; Generated: ${today2}</div>
<table><thead><tr><th>Metric</th>${colH}</tr></thead><tbody>${bodyH}</tbody></table>
<div class="foot">Printed: ${today2}</div>
</div><script>window.onload=()=>setTimeout(()=>window.print(),400);<\/script></body></html>`;
  const w=window.open('','_blank','width=1400,height=900');
  if(!w){alert('Allow pop-ups to print.');return;}
  w.document.write(html); w.document.close();
}

/* ── Print: Day Book ── */
function printDayBook(dateLabel, sections, companyName) {
  const today2 = new Date().toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'});
  let body='';
  sections.forEach(sec=>{
    if(!sec.rows.length) return;
    body+=`<h3 style="margin:10px 0 4px;font-size:10pt;color:#1a2a3a;border-bottom:1px solid #ccc;padding-bottom:3px;">${sec.title} (${sec.rows.length})</h3>`;
    body+=`<table><thead><tr>${sec.cols.map(c=>`<th>${c}</th>`).join('')}</tr></thead><tbody>`;
    body+=sec.rows.map((r,i)=>`<tr class="${i%2===0?'':'alt'}">${r.map((c,ci)=>`<td${ci>=sec.rightFrom?' class="r"':''}>${c??'—'}</td>`).join('')}</tr>`).join('');
    body+=`</tbody></table>`;
  });
  const html=`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Day Book</title>
<style>*{margin:0;padding:0;box-sizing:border-box;}body{font-family:Arial,sans-serif;font-size:8.5pt;}
.pg{padding:8mm 10mm;}
.co{font-size:14pt;font-weight:bold;text-align:center;margin-bottom:2px;}
.date{font-size:11pt;font-weight:bold;text-align:center;color:#1a2a3a;margin-bottom:8px;padding-bottom:4px;border-bottom:2px solid #1a2a3a;}
table{width:100%;border-collapse:collapse;border:1.5px solid #000;margin-bottom:6px;}
th{background:#1a2a3a;color:#fff;padding:4px 6px;font-size:8pt;font-weight:bold;text-align:left;border:1px solid #000;white-space:nowrap;}
td{padding:3px 6px;font-size:8pt;border:1px solid #000;}
tr.alt td{background:#f0f4fb;}
.r{text-align:right;}
.sign{display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:14px;margin-top:22px;}
.sign-box{border-top:1.5px solid #000;padding-top:6px;text-align:center;font-size:8.5pt;font-weight:600;color:#333;}
.foot{margin-top:8px;font-size:7.5pt;color:#666;text-align:right;}
@media print{@page{margin:8mm;size:A4;}.pg{padding:0;}}</style>
</head><body><div class="pg">
<div class="co">${companyName}</div>
<div class="date">Day Book — ${dateLabel}</div>
${body}
<div class="sign">
  <div class="sign-box">Jr. Accountant</div>
  <div class="sign-box">Sr. Accountant</div>
  <div class="sign-box">Manager 1</div>
  <div class="sign-box">Manager 2</div>
</div>
<div class="foot">Printed: ${today2}</div>
</div><script>window.onload=()=>setTimeout(()=>window.print(),400);<\/script></body></html>`;
  const w=window.open('','_blank','width=1000,height=850');
  if(!w){alert('Allow pop-ups to print.');return;}
  w.document.write(html); w.document.close();
}

/* ══════════════════════════ MONTH DETAIL MODAL ══════════════════════════ */
function MonthDetailModal({ slot, fy, sos, pos, bills, pbills, payments, onClose }) {
  const BD2 = '#E5EAF2';
  const rcpts     = payments.filter(p => p.type === 'receipt');
  const pymts     = payments.filter(p => p.type === 'payment');
  const rcptsConf = rcpts.filter(p => p.status === 'confirmed');
  const pymtsConf = pymts.filter(p => p.status === 'confirmed');

  const soValue    = sos.reduce((s,o)=>s+(parseFloat(o.grandTotal)||0),0);
  const salesBillV = bills.reduce((s,b)=>s+(parseFloat(b.grandTotal)||0),0);
  const poValue    = pos.reduce((s,o)=>s+(parseFloat(o.grandTotal)||0),0);
  const purchBillV = pbills.reduce((s,b)=>s+(parseFloat(b.grandTotal)||0),0);

  // Per-order grouping for accurate dues
  const rcptByOrd = {}; rcptsConf.forEach(p=>{ const k=String(p.orderId||''); if(k) rcptByOrd[k]=(rcptByOrd[k]||0)+(parseFloat(p.amount)||0); });
  const pymtByOrd = {}; pymtsConf.forEach(p=>{ const k=String(p.orderId||''); if(k) pymtByOrd[k]=(pymtByOrd[k]||0)+(parseFloat(p.amount)||0); });

  const soOrderDues = sos.reduce((s,o)=>s+Math.max(0,(parseFloat(o.grandTotal)||0)-(rcptByOrd[String(o.orderId)]||0)),0);
  const poOrderDues = pos.reduce((s,o)=>s+Math.max(0,(parseFloat(o.grandTotal)||0)-(pymtByOrd[String(o.orderId)]||0)),0);

  const billByOrd = {}; bills.forEach(b=>{ const k=String(b.orderId||''); if(k) billByOrd[k]=(billByOrd[k]||0)+(parseFloat(b.grandTotal)||0); });
  const billedIds = Object.keys(billByOrd);
  const rcptForBilledV = billedIds.reduce((s,k)=>s+Math.min(rcptByOrd[k]||0,billByOrd[k]),0);
  const soBillDues     = billedIds.reduce((s,k)=>s+Math.max(0,billByOrd[k]-(rcptByOrd[k]||0)),0);

  const pbillByOrd = {}; pbills.forEach(b=>{ const k=String(b.orderId||b.poId||''); if(k) pbillByOrd[k]=(pbillByOrd[k]||0)+(parseFloat(b.grandTotal)||0); });
  const pbilledIds = Object.keys(pbillByOrd);
  const pymtForBilledV = pbilledIds.reduce((s,k)=>s+Math.min(pymtByOrd[k]||0,pbillByOrd[k]),0);
  const poBillDues     = pbilledIds.reduce((s,k)=>s+Math.max(0,pbillByOrd[k]-(pymtByOrd[k]||0)),0);

  const SRow = ({ icon, label, sub, c1, c1s, c2, c2s, c3, c3c }) => (
    <div style={{ display:'grid', gridTemplateColumns:'1.6fr 1fr 1fr 1fr', padding:'10px 18px', borderBottom:`1px solid ${BD2}`, gap:6, alignItems:'center' }}>
      <div>
        <div style={{ fontSize:12, fontWeight:700, color:'#111' }}>{icon} {label}</div>
        <div style={{ fontSize:9.5, color:'#9ca3af', marginTop:1 }}>{sub}</div>
      </div>
      <div style={{ textAlign:'right' }}>
        <div style={{ fontSize:15, fontWeight:800, color:'#1d4ed8' }}>{fmtINR(c1)}</div>
        <div style={{ fontSize:9, color:'#9ca3af' }}>{c1s}</div>
      </div>
      <div style={{ textAlign:'right' }}>
        <div style={{ fontSize:15, fontWeight:800, color:'#7c3aed' }}>{fmtINR(c2)}</div>
        <div style={{ fontSize:9, color:'#9ca3af' }}>{c2s}</div>
      </div>
      <div style={{ textAlign:'right' }}>
        <div style={{ fontSize:15, fontWeight:800, color:c3c }}>{fmtINR(c3)}</div>
        <div style={{ fontSize:9, color:'#9ca3af' }}>Dues / Balance</div>
      </div>
    </div>
  );

  const MiniTable = ({ title, color, cols, rows }) => (
    <div style={{ border:`1px solid ${BD2}`, borderRadius:8, overflow:'hidden', marginBottom:10 }}>
      <div style={{ background:color, padding:'6px 12px', display:'flex', justifyContent:'space-between' }}>
        <span style={{ fontSize:11.5, fontWeight:700, color:'#fff' }}>{title}</span>
        <span style={{ fontSize:10, color:'rgba(255,255,255,0.65)' }}>{rows.length} record{rows.length!==1?'s':''}</span>
      </div>
      {rows.length === 0
        ? <div style={{ padding:'8px 12px', color:'#9ca3af', fontSize:11, fontStyle:'italic' }}>No entries this month</div>
        : <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
              <thead><tr>{cols.map((c,i)=><th key={i} style={{ padding:'5px 10px', background:'#f8faff', color:'#374151', fontWeight:700, textAlign:i===cols.length-1?'right':'left', border:`1px solid ${BD2}`, whiteSpace:'nowrap' }}>{c}</th>)}</tr></thead>
              <tbody>{rows.map((r,ri)=>(
                <tr key={ri} style={{ background:ri%2===0?'#fff':'#f8faff' }}>
                  {r.map((cell,ci)=><td key={ci} style={{ padding:'5px 10px', border:`1px solid ${BD2}`, textAlign:ci===r.length-1?'right':'left', color:ci===0?'#104f4f':'#374151', fontWeight:ci===0?600:400 }}>{cell??'—'}</td>)}
                </tr>
              ))}</tbody>
            </table>
          </div>
      }
    </div>
  );

  return (
    <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', zIndex:9000, display:'flex', alignItems:'center', justifyContent:'center', padding:12, fontFamily:F }}>
      <div onClick={e=>e.stopPropagation()} style={{ background:'#f0f4fb', borderRadius:14, width:'min(1120px,98vw)', maxHeight:'95vh', display:'flex', flexDirection:'column', overflow:'hidden', boxShadow:'0 24px 80px rgba(0,0,0,0.3)' }}>

        {/* Header */}
        <div style={{ background:'linear-gradient(135deg,#0b3d3d,#104f4f)', padding:'14px 20px', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
          <div>
            <div style={{ fontSize:17, fontWeight:800, color:'#fff' }}>📆 {MONTHS[slot]} — Monthly Report &nbsp;<span style={{ fontSize:12, fontWeight:500, opacity:.7 }}>FY {fy}</span></div>
            <div style={{ fontSize:10.5, color:'rgba(255,255,255,0.6)', marginTop:3 }}>
              {sos.length} SO · {pos.length} PO · {bills.length} Sales Bills · {pbills.length} Purch Bills · {rcpts.length} Receipts · {pymts.length} Payments
            </div>
          </div>
          <button onClick={onClose} style={{ background:'rgba(255,255,255,0.15)', border:'none', borderRadius:8, color:'#fff', fontSize:18, width:36, height:36, cursor:'pointer', lineHeight:'36px', textAlign:'center' }}>✕</button>
        </div>

        {/* Body */}
        <div style={{ flex:1, overflowY:'auto', padding:'12px 16px' }}>

          {/* Financial Summary Grid */}
          <div style={{ background:'#fff', border:`1px solid ${BD2}`, borderRadius:10, overflow:'hidden', marginBottom:14 }}>
            <div style={{ display:'grid', gridTemplateColumns:'1.6fr 1fr 1fr 1fr', background:'#f8faff', borderBottom:`2px solid ${BD2}`, padding:'8px 18px', gap:6 }}>
              <div style={{ fontSize:10, fontWeight:700, color:'#6b7280', textTransform:'uppercase', letterSpacing:.5 }}>Category</div>
              {['Order Value','Bills / Invoiced','Dues / Balance'].map(h=>(
                <div key={h} style={{ fontSize:10, fontWeight:700, color:'#6b7280', textTransform:'uppercase', letterSpacing:.4, textAlign:'right' }}>{h}</div>
              ))}
            </div>
            <SRow icon="📋" label="Sales Order" sub={`${sos.length} orders`}
              c1={soValue}    c1s="Total SO value"       c2={salesBillV}      c2s="Sales bills raised"       c3={soOrderDues}     c3c={soOrderDues>0?'#dc2626':'#16a34a'} />
            <SRow icon="🛒" label="Purchase Order" sub={`${pos.length} orders`}
              c1={poValue}    c1s="Total PO value"       c2={purchBillV}      c2s="Purchase bills recd"      c3={poOrderDues}     c3c={poOrderDues>0?'#dc2626':'#16a34a'} />
            <SRow icon="💰" label="Receivable from Client" sub="Bills raised vs receipts"
              c1={salesBillV} c1s="Sales billed"         c2={rcptForBilledV} c2s="Received (against bills)" c3={soBillDues}      c3c={soBillDues>0?'#ea580c':'#16a34a'} />
            <SRow icon="💸" label="Payable to Vendor" sub="Bills received vs payments"
              c1={purchBillV} c1s="Purchase billed"      c2={pymtForBilledV} c2s="Paid (against bills)"     c3={poBillDues}      c3c={poBillDues>0?'#7c3aed':'#16a34a'} />
          </div>

          {/* Detail Tables */}
          <MiniTable title="📋 Sales Orders" color="#104f4f"
            cols={['SO #','Order No','Client Name','Customer PO','Amount','Status']}
            rows={sos.map(o=>[o.orderId,o.orderNo||'—',o.customerName||o.clientName||'—',o.customerPO||'—',fmtINR(o.grandTotal||0),o.status||'—'])} />
          <MiniTable title="🛒 Purchase Orders" color="#7c2d12"
            cols={['PO #','PO No','Vendor Name','Linked SO','Amount','Status']}
            rows={pos.map(o=>[o.orderId,o.poNo||o.poNumber||'—',o.vendorName||'—',o.linkedSalesOrderId||'—',fmtINR(o.grandTotal||0),o.status||'—'])} />
          <MiniTable title="🧾 Sales Bills" color="#581c87"
            cols={['Bill No','Party','Bill Date','Amount','Status']}
            rows={bills.map(b=>[b.billNo||b.billId,b.partyName||'—',fmtD(b.billDate),fmtINR(b.grandTotal||0),b.status||'—'])} />
          <MiniTable title="🧾 Purchase Bills" color="#9a3412"
            cols={['Bill No','Vendor','Bill Date','Amount','Status']}
            rows={pbills.map(b=>[b.billNo||b.billId,b.partyName||b.vendorName||'—',fmtD(b.billDate),fmtINR(b.grandTotal||0),b.status||'—'])} />
          <MiniTable title="💰 Receipts from Clients" color="#065f46"
            cols={['ID','Party','Date','Mode','Amount','Status']}
            rows={rcpts.map(p=>[p.paymentId||'—',p.party||p.entityName||'—',fmtD(p.date),p.paymentMode||'—',fmtINR(p.amount||0),p.status||'—'])} />
          <MiniTable title="💸 Payments to Vendors" color="#7f1d1d"
            cols={['ID','Party','Date','Mode','Amount','Status']}
            rows={pymts.map(p=>[p.paymentId||'—',p.party||p.entityName||'—',fmtD(p.date),p.paymentMode||'—',fmtINR(p.amount||0),p.status||'—'])} />
        </div>

        <div style={{ padding:'12px 20px', background:'#fff', borderTop:`1px solid ${BD2}`, display:'flex', justifyContent:'flex-end' }}>
          <button onClick={onClose} style={{ padding:'8px 28px', background:'#104f4f', color:'#fff', border:'none', borderRadius:8, fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:F }}>Close</button>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════ MAIN ══════════════════════════════════ */
export default function Dashboard() {
  const { selectedCompany } = useCompany();
  const { user } = useAuth();
  const navigate = useNavigate();
  const cid = selectedCompany?.companyId;
  const prefs = user?.dashboardPrefs || {};

  const [tab,             setTab]             = useState('summary');
  const [selectedFY,      setSelectedFY]      = useState(currentFY);
  const [availFYs,        setAvailFYs]        = useState([]);
  const [dayDate,         setDayDate]         = useState(todayISO);
  const [monthFY,         setMonthFY]         = useState(currentFY);
  const [monthDetailOpen,  setMonthDetailOpen]  = useState(null); // popup — slot 0-11 or null
  const [selectedMonthSlot, setSelectedMonthSlot] = useState(null); // inline panel — slot 0-11 or null

  const [rawSOs,      setRawSOs]      = useState([]);
  const [rawPOs,      setRawPOs]      = useState([]);
  const [rawBills,    setRawBills]    = useState([]);
  const [rawPBills,   setRawPBills]   = useState([]);
  const [rawPayments, setRawPayments] = useState([]);
  const [rawStock,    setRawStock]    = useState([]);
  const [rawGRN,      setRawGRN]      = useState([]);
  const [baseCounts,  setBaseCounts]  = useState({ clients:0, vendors:0 });
  const [loading,     setLoading]     = useState(false);

  const load = useCallback(async () => {
    if (!cid) return;
    setLoading(true);
    try {
      const [cR,vR,soR,poR,sbR,pbR,pymtR,stR,grnR] = await Promise.all([
        axios.get(`/api/clients?companyId=${cid}`).catch(()=>({data:[]})),
        axios.get(`/api/vendors?companyId=${cid}`).catch(()=>({data:[]})),
        axios.get(`/api/sales-orders?companyId=${cid}`).catch(()=>({data:[]})),
        axios.get(`/api/purchase-orders?companyId=${cid}`).catch(()=>({data:[]})),
        axios.get(`/api/bills?companyId=${cid}&type=sales`).catch(()=>({data:[]})),
        axios.get(`/api/bills?companyId=${cid}&type=purchase`).catch(()=>({data:[]})),
        axios.get(`/api/accounts/payments?companyId=${cid}`).catch(()=>({data:[]})),
        axios.get(`/api/stock/levels?companyId=${cid}`).catch(()=>({data:[]})),
        axios.get(`/api/stock/grn?companyId=${cid}`).catch(()=>({data:[]})),
      ]);
      const sos = (soR.data||[]).filter(o=>!o.tallyImported&&!['draft','rejected'].includes(o.status));
      const pos = (poR.data||[]).filter(o=>!['draft','rejected'].includes(o.status));
      const fySet = new Set();
      sos.forEach(o=>{ const f=fyOf(o.orderDate||o.createdAt); if(f) fySet.add(f); });
      pos.forEach(o=>{ const f=fyOf(o.poDate||o.createdAt);    if(f) fySet.add(f); });
      const fys = [...fySet].sort().reverse();
      setAvailFYs(fys);
      if (!fys.includes(selectedFY) && fys.length) setSelectedFY(fys[0]);
      setRawSOs(sos); setRawPOs(pos);
      setRawBills(Array.isArray(sbR.data)?sbR.data:[]);
      setRawPBills(Array.isArray(pbR.data)?pbR.data:[]);
      setRawPayments(Array.isArray(pymtR.data)?pymtR.data:[]);
      setRawStock(Array.isArray(stR.data)?stR.data:[]);
      setRawGRN(Array.isArray(grnR.data)?grnR.data:[]);
      setBaseCounts({ clients:(cR.data||[]).length, vendors:(vR.data||[]).length });
    } catch(e){ console.error(e); }
    setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cid]);

  useEffect(()=>{ load(); },[load]);

  /* ── Computed: FY-filtered summary ── */
  const summary = useMemo(()=>{
    const filt = (list, df) => selectedFY==='all'?list:list.filter(o=>fyOf(o[df]||o.date||o.createdAt)===selectedFY);
    const sos    = filt(rawSOs,    'orderDate');
    const pos    = filt(rawPOs,    'poDate');
    const bills  = filt(rawBills,  'billDate');
    const pbills = filt(rawPBills, 'billDate');
    const rcpts  = filt(rawPayments.filter(p=>p.type==='receipt'&&p.status==='confirmed'), 'date');
    const pymts  = filt(rawPayments.filter(p=>p.type==='payment'&&p.status==='confirmed'), 'date');

    const soTaxable  = sos.reduce((s,o)=>s+(parseFloat(o.subTotal)||0),0);
    const soGST      = sos.reduce((s,o)=>s+(parseFloat(o.totalGST)||0),0);
    const soValue    = sos.reduce((s,o)=>s+(parseFloat(o.grandTotal)||0),0);
    const salesBillV = bills.reduce((s,b)=>s+(parseFloat(b.grandTotal)||0),0);
    const receiptV   = rcpts.reduce((s,p)=>s+(parseFloat(p.amount)||0),0);

    const poTaxable  = pos.reduce((s,o)=>s+(parseFloat(o.subTotal)||0),0);
    const poGST      = pos.reduce((s,o)=>s+(parseFloat(o.totalGST)||0),0);
    const poValue    = pos.reduce((s,o)=>s+(parseFloat(o.grandTotal)||0),0);
    const purchBillV = pbills.reduce((s,b)=>s+(parseFloat(b.grandTotal)||0),0);
    const paymentV   = pymts.reduce((s,p)=>s+(parseFloat(p.amount)||0),0);

    // Per-order grouping — excess payment/receipt on one order does NOT offset dues on another
    const rcptByOrd = {}; rcpts.forEach(p=>{ const k=String(p.orderId||''); if(k) rcptByOrd[k]=(rcptByOrd[k]||0)+(parseFloat(p.amount)||0); });
    const pymtByOrd = {}; pymts.forEach(p=>{ const k=String(p.orderId||''); if(k) pymtByOrd[k]=(pymtByOrd[k]||0)+(parseFloat(p.amount)||0); });

    // Row 1: per-SO dues (SO value minus receipts only for that SO)
    const soOrderDues = sos.reduce((s,o)=>s+Math.max(0,(parseFloat(o.grandTotal)||0)-(rcptByOrd[String(o.orderId)]||0)),0);
    // Row 2: per-PO dues (PO value minus payments only for that PO)
    const poOrderDues = pos.reduce((s,o)=>s+Math.max(0,(parseFloat(o.grandTotal)||0)-(pymtByOrd[String(o.orderId)]||0)),0);

    // Row 3: sales bills vs receipts matched per SO
    const billByOrd = {}; bills.forEach(b=>{ const k=String(b.orderId||''); if(k) billByOrd[k]=(billByOrd[k]||0)+(parseFloat(b.grandTotal)||0); });
    const billedIds = Object.keys(billByOrd);
    const rcptForBilledV = billedIds.reduce((s,k)=>s+Math.min(rcptByOrd[k]||0,billByOrd[k]),0);
    const soBillDues     = billedIds.reduce((s,k)=>s+Math.max(0,billByOrd[k]-(rcptByOrd[k]||0)),0);

    // Row 4: purchase bills vs payments matched per PO
    const pbillByOrd = {}; pbills.forEach(b=>{ const k=String(b.orderId||b.poId||''); if(k) pbillByOrd[k]=(pbillByOrd[k]||0)+(parseFloat(b.grandTotal)||0); });
    const pbilledIds = Object.keys(pbillByOrd);
    const pymtForBilledV = pbilledIds.reduce((s,k)=>s+Math.min(pymtByOrd[k]||0,pbillByOrd[k]),0);
    const poBillDues     = pbilledIds.reduce((s,k)=>s+Math.max(0,pbillByOrd[k]-(pymtByOrd[k]||0)),0);

    /* top lists */
    const clientMap={}, vendorMap={}, receiptMap={}, paymentMap={};
    sos.forEach(o=>{ const n=o.customerName||o.clientName||'?'; clientMap[n]=(clientMap[n]||0)+(parseFloat(o.grandTotal)||0); });
    pos.forEach(o=>{ const n=o.vendorName||'?'; vendorMap[n]=(vendorMap[n]||0)+(parseFloat(o.grandTotal)||0); });
    rcpts.forEach(p=>{ const n=p.entityName||'?'; receiptMap[n]=(receiptMap[n]||0)+(parseFloat(p.amount)||0); });
    pymts.forEach(p=>{ const n=p.entityName||'?'; paymentMap[n]=(paymentMap[n]||0)+(parseFloat(p.amount)||0); });
    const top = obj => Object.entries(obj).sort((a,b)=>b[1]-a[1]).slice(0,6);

    return {
      soCount:sos.length, soTaxable, soGST, soValue, salesBillV, receiptV, soOrderDues, soBillDues,
      poCount:pos.length, poTaxable, poGST, poValue, purchBillV, paymentV, poOrderDues, poBillDues,
      rcptForBilledV, pymtForBilledV,
      clients:baseCounts.clients, vendors:baseCounts.vendors,
      topClients:top(clientMap), topVendors:top(vendorMap), topReceipts:top(receiptMap), topPayments:top(paymentMap),
    };
  },[rawSOs,rawPOs,rawBills,rawPBills,rawPayments,baseCounts,selectedFY]);

  /* ── Computed: Monthly breakdown ── */
  const monthlyData = useMemo(()=>{
    const filt = (list, df) => monthFY==='all'?list:list.filter(o=>fyOf(o[df]||o.date||o.createdAt)===monthFY);
    const sos    = filt(rawSOs,'orderDate');
    const pos    = filt(rawPOs,'poDate');
    const bills  = filt(rawBills,'billDate');
    const pbills = filt(rawPBills,'billDate');
    const rcpts  = filt(rawPayments.filter(p=>p.type==='receipt'),'date');
    const pymts  = filt(rawPayments.filter(p=>p.type==='payment'),'date');

    const arr = Array.from({length:12},()=>({ so:0, po:0, sb:0, pb:0, rcpt:0, pymt:0 }));
    sos.forEach(o=>{    const i=slotOf(o.orderDate||o.createdAt);   if(i>=0) arr[i].so  +=(parseFloat(o.grandTotal)||0); });
    pos.forEach(o=>{    const i=slotOf(o.poDate||o.createdAt);       if(i>=0) arr[i].po  +=(parseFloat(o.grandTotal)||0); });
    bills.forEach(b=>{  const i=slotOf(b.billDate||b.createdAt);     if(i>=0) arr[i].sb  +=(parseFloat(b.grandTotal)||0); });
    pbills.forEach(b=>{ const i=slotOf(b.billDate||b.createdAt);     if(i>=0) arr[i].pb  +=(parseFloat(b.grandTotal)||0); });
    rcpts.forEach(p=>{  const i=slotOf(p.date||p.createdAt);         if(i>=0) arr[i].rcpt+=(parseFloat(p.amount)||0); });
    pymts.forEach(p=>{  const i=slotOf(p.date||p.createdAt);         if(i>=0) arr[i].pymt+=(parseFloat(p.amount)||0); });
    return arr;
  },[rawSOs,rawPOs,rawBills,rawPBills,rawPayments,monthFY]);

  /* ── Computed: Day book ── */
  const dayBook = useMemo(()=>{
    const ds = dayDate;
    return {
      sos:    rawSOs.filter(o=>isSameDateStr(o.orderDate||o.createdAt,ds)),
      pos:    rawPOs.filter(o=>isSameDateStr(o.poDate||o.createdAt,ds)),
      rcpts:  rawPayments.filter(p=>p.type==='receipt'&&isSameDateStr(p.date||p.createdAt,ds)),
      pymts:  rawPayments.filter(p=>p.type==='payment'&&isSameDateStr(p.date||p.createdAt,ds)),
      bills:  rawBills.filter(b=>isSameDateStr(b.billDate||b.createdAt,ds)),
      pbills: rawPBills.filter(b=>isSameDateStr(b.billDate||b.createdAt,ds)),
    };
  },[rawSOs,rawPOs,rawBills,rawPBills,rawPayments,dayDate]);

  /* ── Computed: Balance Sheet ── */
  const balanceSheet = useMemo(()=>{
    // Weighted average cost per item from GRN receipts
    const itemCost = {};
    rawGRN.forEach(grn=>{
      (grn.items||[]).forEach(it=>{
        const key = String(it.itemCode||it.itemName||'');
        if (!key) return;
        const qty  = parseFloat(it.qty)  || 0;
        const rate = parseFloat(it.rate) || 0;
        if (!itemCost[key]) itemCost[key] = { totalQty:0, totalValue:0 };
        itemCost[key].totalQty   += qty;
        itemCost[key].totalValue += qty * rate;
      });
    });
    let stockValue = 0, stockItems = 0, stockQtyTotal = 0;
    rawStock.forEach(item=>{
      const key  = String(item.itemCode||'');
      const cost = itemCost[key];
      const avgRate = cost && cost.totalQty>0 ? cost.totalValue/cost.totalQty : 0;
      const cur  = Math.max(0, parseFloat(item.currentStock)||0);
      if (cur>0) stockItems++;
      stockValue   += cur * avgRate;
      stockQtyTotal += cur;
    });

    const clientReceivables    = summary.soOrderDues;
    const advancePaidToVendors = Math.max(0, summary.paymentV - summary.purchBillV);
    const vendorPayables       = summary.poOrderDues;
    const advanceFromClients   = Math.max(0, summary.receiptV - summary.salesBillV);

    const totalAssets      = clientReceivables + advancePaidToVendors + stockValue;
    const totalLiabilities = vendorPayables + advanceFromClients;

    return {
      assets:      { clientReceivables, advancePaidToVendors, stockValue, stockItems, stockQtyTotal, total:totalAssets },
      liabilities: { vendorPayables, advanceFromClients, total:totalLiabilities },
      netWorth:    totalAssets - totalLiabilities,
    };
  },[rawStock, rawGRN, summary]);

  /* ── Helper: get all records for a given month slot (for detail popup) ── */
  const getMonthRecords = useCallback((slot) => {
    const actualMonth = MONTH_NUM[slot];
    const inFY   = (o, df) => selectedFY === 'all' ? true : fyOf(o[df]||o.date||o.createdAt) === selectedFY;
    const inMo   = (o, df) => { const d=new Date(o[df]||o.date||o.createdAt); return !isNaN(d)&&(d.getMonth()+1)===actualMonth; };
    return {
      sos:      rawSOs.filter(o=>inFY(o,'orderDate')&&inMo(o,'orderDate')),
      pos:      rawPOs.filter(o=>inFY(o,'poDate')&&inMo(o,'poDate')),
      bills:    rawBills.filter(b=>inFY(b,'billDate')&&inMo(b,'billDate')),
      pbills:   rawPBills.filter(b=>inFY(b,'billDate')&&inMo(b,'billDate')),
      payments: rawPayments.filter(p=>inFY(p,'date')&&inMo(p,'date')),
    };
  },[rawSOs,rawPOs,rawBills,rawPBills,rawPayments,selectedFY]);

  /* ── Helpers ── */
  const BD = '#E5EAF2';
  const SumBox = ({label,val,color='#374151',big})=>(
    <div style={{ padding:'7px 12px', borderRight:`1px solid ${BD}`, minWidth:big?120:100, flex:'1 1 100px' }}>
      <div style={{ fontSize:9, color:'#9ca3af', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.4px', marginBottom:2, whiteSpace:'nowrap' }}>{label}</div>
      <div style={{ fontSize:big?14:12, fontWeight:big?800:700, color, whiteSpace:'nowrap' }}>{val}</div>
    </div>
  );

  const TopList = ({title,items,color,emptyMsg})=>{
    const max = items[0]?.[1]||1;
    return (
      <div style={{ background:'#fff', border:`1px solid ${BD}`, borderRadius:10, overflow:'hidden', flex:1, minWidth:200 }}>
        <div style={{ background:P, padding:'8px 14px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <span style={{ fontSize:12, fontWeight:700, color:'#fff' }}>{title}</span>
        </div>
        <div style={{ padding:'10px 12px' }}>
          {items.length===0
            ? <div style={{ color:'#9ca3af', fontSize:11, textAlign:'center', padding:'12px 0', fontStyle:'italic' }}>{emptyMsg||'No data'}</div>
            : items.map(([name,val],i)=>(
                <div key={name} style={{ marginBottom:i<items.length-1?10:0 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:3 }}>
                    <span style={{ fontSize:11, color:'#374151', fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:'68%' }}>{name}</span>
                    <span style={{ fontSize:11, fontWeight:700, color }}>{fmtINR(val)}</span>
                  </div>
                  <div style={{ height:4, background:'#f1f5f9', borderRadius:3, overflow:'hidden' }}>
                    <div style={{ height:'100%', width:`${(val/max)*100}%`, background:color, borderRadius:3 }}/>
                  </div>
                </div>
              ))
          }
        </div>
      </div>
    );
  };

  const monthlyRows = [
    { label:'Sales Order',    key:'so',   color:'#3b82f6' },
    { label:'Purchase Order', key:'po',   color:'#f59e0b' },
    { label:'Sales Bill',     key:'sb',   color:'#7c3aed' },
    { label:'Purchase Bill',  key:'pb',   color:'#ea580c' },
    { label:'Receipt',        key:'rcpt', color:'#059669' },
    { label:'Payment',        key:'pymt', color:'#dc2626' },
  ];

  const doDayBookPrint = () => {
    const d = fmtD(dayDate);
    const co = selectedCompany?.companyName||'';
    const sections = [
      { title:'Sales Orders', rightFrom:4,
        cols:['SO #','Order No','Client Name','Cust PO No','Amount (₹)','Status'],
        rows: dayBook.sos.map(o=>[o.orderId,o.orderNo||'—',o.customerName||o.clientName||'—',o.customerPO||'—',fmt2(o.grandTotal||0),o.status||'—']) },
      { title:'Purchase Orders', rightFrom:4,
        cols:['PO #','PO No','Vendor Name','Linked SO','Amount (₹)','Status'],
        rows: dayBook.pos.map(o=>[o.orderId,o.poNo||o.poNumber||'—',o.vendorName||'—',o.linkedSalesOrderId||'—',fmt2(o.grandTotal||0),o.status||'—']) },
      { title:'Sales Bills', rightFrom:3,
        cols:['Bill No','Party','Bill Date','Amount (₹)','Status'],
        rows: dayBook.bills.map(b=>[b.billNo||b.billId,b.partyName||'—',fmtD(b.billDate),fmt2(b.grandTotal||0),b.status||'—']) },
      { title:'Purchase Bills', rightFrom:3,
        cols:['Bill No','Vendor','Bill Date','Amount (₹)','Status'],
        rows: dayBook.pbills.map(b=>[b.billNo||b.billId,b.partyName||b.vendorName||'—',fmtD(b.billDate),fmt2(b.grandTotal||0),b.status||'—']) },
      { title:'Receipts (from Clients)', rightFrom:2,
        cols:['Receipt #','Client Name','Mode','Amount (₹)','Status'],
        rows: dayBook.rcpts.map(p=>[p.paymentId||p.id||'—',p.entityName||'—',p.paymentMode||'—',fmt2(p.amount||0),p.status||'—']) },
      { title:'Payments (to Vendors)', rightFrom:2,
        cols:['Payment #','Vendor Name','Mode','Amount (₹)','Status'],
        rows: dayBook.pymts.map(p=>[p.paymentId||p.id||'—',p.entityName||'—',p.paymentMode||'—',fmt2(p.amount||0),p.status||'—']) },
    ];
    printDayBook(d, sections, co);
  };

  const doMonthlyPrint = () => {
    const rows = monthlyRows.map(r=>({
      label: r.label,
      vals:  monthlyData.map(m=>m[r.key]),
    }));
    printMonthlyReport('Monthly Financial Report', monthFY==='all'?'All Years':monthFY, rows, MONTHS);
  };

  const tabStyle = t => ({
    padding:'8px 20px', fontSize:12.5, fontWeight:tab===t?700:500, fontFamily:F, cursor:'pointer',
    background:tab===t?P:'transparent', color:tab===t?'#fff':'#6b7280',
    border:'none', borderRadius:'6px 6px 0 0', outline:'none',
  });

  return (
    <div style={{ fontFamily:F, background:'#f0f4fb', minHeight:'100vh', position:'relative' }}>

      {loading && <PageLoader text="Loading dashboard data…" />}

      {/* ── Header ── */}
      <div style={{ background:`linear-gradient(135deg,#0b3d3d 0%,#104f4f 100%)`, padding:'12px 20px' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:10 }}>
          <div>
            <div style={{ fontSize:10.5, color:'rgba(255,255,255,0.6)', marginBottom:1 }}>{dateStr}</div>
            <div style={{ fontSize:17, fontWeight:800, color:'#fff' }}>
              {today.getHours()<12?'Good Morning':today.getHours()<17?'Good Afternoon':'Good Evening'} — {selectedCompany?.companyName||'Dashboard'}
            </div>
          </div>
          <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
            <div style={{ display:'flex', alignItems:'center', gap:6, background:'rgba(255,255,255,0.14)', border:'1px solid rgba(255,255,255,0.28)', borderRadius:7, padding:'0 10px', height:32 }}>
              <span style={{ fontSize:10, color:'rgba(255,255,255,0.7)', fontWeight:600 }}>FY</span>
              <select value={selectedFY} onChange={e=>setSelectedFY(e.target.value)}
                style={{ background:'transparent', border:'none', outline:'none', color:'#fff', fontSize:12, fontWeight:700, fontFamily:F, cursor:'pointer' }}>
                <option value="all" style={{ background:P }}>All Years</option>
                {availFYs.map(f=><option key={f} value={f} style={{ background:P }}>{f}</option>)}
                {!availFYs.includes(currentFY)&&<option value={currentFY} style={{ background:P }}>{currentFY}</option>}
              </select>
            </div>
            <button onClick={load} style={{ height:32,padding:'0 14px',background:'rgba(255,255,255,0.14)',border:'1px solid rgba(255,255,255,0.28)',borderRadius:7,cursor:'pointer',color:'#fff',fontSize:12,fontWeight:600,fontFamily:F }}>↻ Refresh</button>
            <button onClick={()=>navigate('/sales-order/create')} style={{ height:32,padding:'0 16px',background:'#fff',border:'none',borderRadius:7,cursor:'pointer',color:P,fontSize:12,fontWeight:800,fontFamily:F }}>+ New Order</button>
          </div>
        </div>
      </div>

      {/* ── Tab Bar ── */}
      <div style={{ background:'#fff', borderBottom:`2px solid ${BD}`, padding:'0 20px', display:'flex', gap:4, alignItems:'flex-end' }}>
        {[['summary','📊 Summary'],['balance','⚖ï¸ Balance Sheet'],['daybook','📅 Day Book'],['monthly','📆 Monthly Report']].map(([k,l])=>(
          <button key={k} onClick={()=>setTab(k)} style={tabStyle(k)}>{l}</button>
        ))}
        <div style={{ flex:1 }}/>
        <span style={{ fontSize:10.5, color:'#9ca3af', padding:'8px 0' }}>
          {loading?'Loading…':`${summary.clients} clients · ${summary.vendors} vendors`}
        </span>
      </div>

      <div style={{ padding:'14px 16px' }}>

        {/* ══════════════ SUMMARY TAB ══════════════ */}
        {tab==='summary' && (
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>

            {/* ── Financial Summary Grid ── */}
            <div style={{ background:'#fff', border:`1px solid ${BD}`, borderRadius:10, overflow:'hidden', boxShadow:'0 1px 4px rgba(0,0,0,0.05)' }}>
              {/* Header row */}
              <div style={{ display:'grid', gridTemplateColumns:'1.7fr 1fr 1fr 1fr', background:'linear-gradient(135deg,#0b3d3d,#104f4f)', padding:'10px 18px', gap:6 }}>
                <div style={{ fontSize:12, fontWeight:700, color:'#fff' }}>
                  Financial Summary &nbsp;
                  <span style={{ fontSize:10, opacity:.65, fontWeight:500 }}>FY {selectedFY==='all'?'All Years':selectedFY}</span>
                </div>
                {['Order Value','Bills / Invoiced','Dues / Balance'].map(h=>(
                  <div key={h} style={{ fontSize:10, fontWeight:700, color:'rgba(255,255,255,0.75)', textAlign:'right', textTransform:'uppercase', letterSpacing:.4 }}>{h}</div>
                ))}
              </div>
              {/* Row 1 — Sales */}
              {[
                { prefKey:'showSalesOrders',    icon:'📋', label:'Total Sales Order Value',   sub:`${summary.soCount} orders`,
                  c1:summary.soValue,    c1s:'Total SO value',       c2:summary.salesBillV, c2s:'Sales bills raised',   c3:Math.max(0,summary.soValue-summary.receiptV),    c3c:summary.soValue-summary.receiptV>0?'#dc2626':'#16a34a',     c3l:'Dues for Sales' },
                { prefKey:'showPurchaseOrders', icon:'🛒', label:'Total Purchase Order Value', sub:`${summary.poCount} orders`,
                  c1:summary.poValue,    c1s:'Total PO value',       c2:summary.purchBillV, c2s:'Purchase bills recd',  c3:Math.max(0,summary.poValue-summary.paymentV),    c3c:summary.poValue-summary.paymentV>0?'#dc2626':'#16a34a',     c3l:'Dues for Purchase' },
                { prefKey:'showReceivable',     icon:'💰', label:'Receivable Amount from Client', sub:'Sales billed vs receipts',
                  c1:summary.salesBillV, c1s:'Sales billed amount',  c2:summary.rcptForBilledV, c2s:'Received (against bills)', c3:summary.soBillDues, c3c:summary.soBillDues>0?'#ea580c':'#16a34a',  c3l:'Dues from Client' },
                { prefKey:'showPayable',        icon:'💸', label:'Payable to Vendor',           sub:'Purchase billed vs payments',
                  c1:summary.purchBillV, c1s:'Purchase billed amt',  c2:summary.pymtForBilledV, c2s:'Paid (against bills)',    c3:summary.poBillDues, c3c:summary.poBillDues>0?'#7c3aed':'#16a34a',  c3l:'Due to Pay Vendor' },
              ].filter(r=>prefs[r.prefKey]!==false).map((r,ri,arr)=>(
                <div key={ri} style={{ display:'grid', gridTemplateColumns:'1.7fr 1fr 1fr 1fr', padding:'11px 18px', borderBottom:ri<arr.length-1?`1px solid ${BD}`:'none', gap:6, alignItems:'center',
                  background:ri%2===0?'#fff':'#fafbff' }}>
                  <div>
                    <div style={{ fontSize:12, fontWeight:700, color:'#111' }}>{r.icon} {r.label}</div>
                    <div style={{ fontSize:9.5, color:'#9ca3af', marginTop:1 }}>{r.sub}</div>
                  </div>
                  <div style={{ textAlign:'right' }}>
                    <div style={{ fontSize:15, fontWeight:800, color:'#1d4ed8' }}>{loading?'—':fmtINR(r.c1)}</div>
                    <div style={{ fontSize:9, color:'#9ca3af' }}>{r.c1s}</div>
                  </div>
                  <div style={{ textAlign:'right' }}>
                    <div style={{ fontSize:15, fontWeight:800, color:'#7c3aed' }}>{loading?'—':fmtINR(r.c2)}</div>
                    <div style={{ fontSize:9, color:'#9ca3af' }}>{r.c2s}</div>
                  </div>
                  <div style={{ textAlign:'right' }}>
                    <div style={{ fontSize:15, fontWeight:800, color:loading?'#d1d5db':r.c3c }}>{loading?'—':fmtINR(r.c3)}</div>
                    <div style={{ fontSize:9, color:'#9ca3af' }}>{r.c3l}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* ── Month Quick-View Buttons ── */}
            {prefs.showMonthly!==false && <div style={{ background:'#fff', border:`1px solid ${BD}`, borderRadius:10, padding:'10px 16px', display:'flex', gap:6, alignItems:'center', flexWrap:'wrap' }}>
              <span style={{ fontSize:11, fontWeight:700, color:'#374151', marginRight:6, whiteSpace:'nowrap' }}>Month Detail:</span>
              {MONTHS.map((m,mi)=>{
                const md = monthlyData[mi];
                const hasAny = md && (md.so>0||md.po>0||md.sb>0||md.pb>0||md.rcpt>0||md.pymt>0);
                const isActive = selectedMonthSlot === mi;
                return (
                  <button key={m} onClick={()=>setSelectedMonthSlot(isActive ? null : mi)}
                    style={{ padding:'5px 13px', borderRadius:7,
                      border:`1.5px solid ${isActive?'#f59e0b':hasAny?'#104f4f':BD}`,
                      background:isActive?'#f59e0b':hasAny?'#104f4f':'#f8faff',
                      color:isActive?'#1a1a1a':hasAny?'#fff':'#9ca3af',
                      fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:F, transition:'all .12s',
                      boxShadow:isActive?'0 2px 8px rgba(245,158,11,0.4)':hasAny?'0 1px 4px rgba(0,0,0,0.12)':'none' }}>
                    {m}
                  </button>
                );
              })}
              <span style={{ fontSize:10, color:'#9ca3af', marginLeft:4 }}>Click a month to see summary below</span>
            </div>}

            {/* ── Month Inline Summary Panel ── */}
            {prefs.showMonthly!==false && selectedMonthSlot !== null && (() => {
              const rec = getMonthRecords(selectedMonthSlot);
              const rcptsConf = rec.payments.filter(p=>p.type==='receipt'&&p.status==='confirmed');
              const pymtsConf = rec.payments.filter(p=>p.type==='payment'&&p.status==='confirmed');
              const soVal = rec.sos.reduce((s,o)=>s+(parseFloat(o.grandTotal)||0),0);
              const sbVal = rec.bills.reduce((s,b)=>s+(parseFloat(b.grandTotal)||0),0);
              const poVal = rec.pos.reduce((s,o)=>s+(parseFloat(o.grandTotal)||0),0);
              const pbVal = rec.pbills.reduce((s,b)=>s+(parseFloat(b.grandTotal)||0),0);
              const rByO = {}; rcptsConf.forEach(p=>{ const k=String(p.orderId||''); if(k) rByO[k]=(rByO[k]||0)+(parseFloat(p.amount)||0); });
              const pByO = {}; pymtsConf.forEach(p=>{ const k=String(p.orderId||''); if(k) pByO[k]=(pByO[k]||0)+(parseFloat(p.amount)||0); });
              const soD  = rec.sos.reduce((s,o)=>s+Math.max(0,(parseFloat(o.grandTotal)||0)-(rByO[String(o.orderId)]||0)),0);
              const poD  = rec.pos.reduce((s,o)=>s+Math.max(0,(parseFloat(o.grandTotal)||0)-(pByO[String(o.orderId)]||0)),0);
              const bOrd = {}; rec.bills.forEach(b=>{ const k=String(b.orderId||''); if(k) bOrd[k]=(bOrd[k]||0)+(parseFloat(b.grandTotal)||0); });
              const bIds = Object.keys(bOrd);
              const rcptBV = bIds.reduce((s,k)=>s+Math.min(rByO[k]||0,bOrd[k]),0);
              const sbD    = bIds.reduce((s,k)=>s+Math.max(0,bOrd[k]-(rByO[k]||0)),0);
              const pbOrd = {}; rec.pbills.forEach(b=>{ const k=String(b.orderId||b.poId||''); if(k) pbOrd[k]=(pbOrd[k]||0)+(parseFloat(b.grandTotal)||0); });
              const pbIds = Object.keys(pbOrd);
              const pymtBV = pbIds.reduce((s,k)=>s+Math.min(pByO[k]||0,pbOrd[k]),0);
              const pbD    = pbIds.reduce((s,k)=>s+Math.max(0,pbOrd[k]-(pByO[k]||0)),0);
              const mRows = [
                { icon:'📋', label:'Sales Order',           c1:soVal, c1s:`${rec.sos.length} orders`,   c2:sbVal,    c2s:'Bills raised',            c3:soD,  c3c:soD>0?'#dc2626':'#16a34a', c3l:'Dues for Sales'     },
                { icon:'🛒', label:'Purchase Order',        c1:poVal, c1s:`${rec.pos.length} orders`,   c2:pbVal,    c2s:'Bills received',           c3:poD,  c3c:poD>0?'#dc2626':'#16a34a', c3l:'Dues for Purchase'  },
                { icon:'💰', label:'Receivable from Client',c1:sbVal, c1s:'Sales billed',              c2:rcptBV,   c2s:'Received (against bills)', c3:sbD,  c3c:sbD>0?'#ea580c':'#16a34a', c3l:'Dues from Client'   },
                { icon:'💸', label:'Payable to Vendor',     c1:pbVal, c1s:'Purchase billed',           c2:pymtBV,   c2s:'Paid (against bills)',     c3:pbD,  c3c:pbD>0?'#7c3aed':'#16a34a', c3l:'Due to Vendor'      },
              ];
              return (
                <div style={{ background:'#fff', border:`2px solid #104f4f`, borderRadius:12, overflow:'hidden', boxShadow:'0 4px 20px rgba(0,0,0,0.1)' }}>
                  {/* Header */}
                  <div style={{ background:'linear-gradient(135deg,#0b3d3d,#104f4f)', padding:'10px 18px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                    <div>
                      <span style={{ fontSize:14, fontWeight:800, color:'#fff' }}>📆 {MONTHS[selectedMonthSlot]} — Monthly Summary</span>
                      <span style={{ fontSize:10, color:'rgba(255,255,255,0.6)', marginLeft:10 }}>FY {selectedFY==='all'?'All Years':selectedFY}</span>
                    </div>
                    <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                      <button onClick={()=>setMonthDetailOpen(selectedMonthSlot)}
                        style={{ padding:'5px 16px', background:'#f59e0b', border:'none', borderRadius:7, fontSize:11.5, fontWeight:700, color:'#1a1a1a', cursor:'pointer', fontFamily:F }}>
                        Full Report →
                      </button>
                      <button onClick={()=>setSelectedMonthSlot(null)}
                        style={{ background:'rgba(255,255,255,0.15)', border:'none', borderRadius:6, color:'#fff', fontSize:16, width:30, height:30, cursor:'pointer', lineHeight:'30px', textAlign:'center' }}>✕</button>
                    </div>
                  </div>
                  {/* Column headers */}
                  <div style={{ display:'grid', gridTemplateColumns:'1.7fr 1fr 1fr 1fr', background:'#f8faff', borderBottom:`1px solid ${BD}`, padding:'7px 18px', gap:6 }}>
                    <div style={{ fontSize:9.5, fontWeight:700, color:'#6b7280', textTransform:'uppercase', letterSpacing:.4 }}>Category</div>
                    {['Order Value','Bills / Invoiced','Dues / Balance'].map(h=>(
                      <div key={h} style={{ fontSize:9.5, fontWeight:700, color:'#6b7280', textTransform:'uppercase', letterSpacing:.4, textAlign:'right' }}>{h}</div>
                    ))}
                  </div>
                  {/* Data rows */}
                  {mRows.map((r,ri)=>(
                    <div key={ri} style={{ display:'grid', gridTemplateColumns:'1.7fr 1fr 1fr 1fr', padding:'10px 18px', borderBottom:ri<3?`1px solid ${BD}`:'none', gap:6, alignItems:'center', background:ri%2===0?'#fff':'#fafbff' }}>
                      <div>
                        <div style={{ fontSize:12, fontWeight:700, color:'#111' }}>{r.icon} {r.label}</div>
                        <div style={{ fontSize:9, color:'#9ca3af', marginTop:1 }}>{r.c1s}</div>
                      </div>
                      <div style={{ textAlign:'right' }}>
                        <div style={{ fontSize:14, fontWeight:800, color:'#1d4ed8' }}>{fmtINR(r.c1)}</div>
                      </div>
                      <div style={{ textAlign:'right' }}>
                        <div style={{ fontSize:14, fontWeight:800, color:'#7c3aed' }}>{fmtINR(r.c2)}</div>
                        <div style={{ fontSize:9, color:'#9ca3af' }}>{r.c2s}</div>
                      </div>
                      <div style={{ textAlign:'right' }}>
                        <div style={{ fontSize:14, fontWeight:800, color:r.c3c }}>{fmtINR(r.c3)}</div>
                        <div style={{ fontSize:9, color:'#9ca3af' }}>{r.c3l}</div>
                      </div>
                    </div>
                  ))}
                  {/* Footer record counts + Full Report link */}
                  <div style={{ padding:'8px 18px', background:'#f0f4fb', borderTop:`1px solid ${BD}`, display:'flex', gap:14, flexWrap:'wrap', alignItems:'center' }}>
                    {[
                      { label:'Sales Orders',    val:rec.sos.length,                                       color:'#2563eb' },
                      { label:'Purchase Orders', val:rec.pos.length,                                       color:'#ea580c' },
                      { label:'Sales Bills',     val:rec.bills.length,                                     color:'#7c3aed' },
                      { label:'Purchase Bills',  val:rec.pbills.length,                                    color:'#9a3412' },
                      { label:'Receipts',        val:rec.payments.filter(p=>p.type==='receipt').length,    color:'#059669' },
                      { label:'Payments',        val:rec.payments.filter(p=>p.type==='payment').length,    color:'#dc2626' },
                    ].map(c=>(
                      <div key={c.label} style={{ display:'flex', alignItems:'center', gap:5 }}>
                        <div style={{ width:7, height:7, borderRadius:'50%', background:c.color }}/>
                        <span style={{ fontSize:10.5, color:'#374151' }}><b style={{ color:c.color }}>{c.val}</b> {c.label}</span>
                      </div>
                    ))}
                    <div style={{ flex:1, textAlign:'right' }}>
                      <span onClick={()=>setMonthDetailOpen(selectedMonthSlot)}
                        style={{ fontSize:10.5, color:'#104f4f', fontWeight:700, cursor:'pointer', textDecoration:'underline' }}>
                        View full report with all records →
                      </span>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* ── KPI Cards ── */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(6,1fr)', gap:10 }}>
              {[
                { label:'Sales Orders',    val:loading?'—':String(summary.soCount),       sub:`FY ${selectedFY==='all'?'All':selectedFY}`,            accent:'#2563eb' },
                { label:'SO Value',        val:loading?'—':fmtINR(summary.soValue),        sub:'Taxable + GST',                                         accent:'#7c3aed' },
                { label:'Receivable',      val:loading?'—':fmtINR(summary.soOrderDues),    sub:'Due from clients',                                      accent:summary.soOrderDues>0?'#dc2626':'#16a34a' },
                { label:'Purchase Orders', val:loading?'—':String(summary.poCount),        sub:`FY ${selectedFY==='all'?'All':selectedFY}`,             accent:'#ea580c' },
                { label:'PO Value',        val:loading?'—':fmtINR(summary.poValue),        sub:'Taxable + GST',                                         accent:'#d97706' },
                { label:'Payable',         val:loading?'—':fmtINR(summary.poOrderDues),    sub:'Due to vendors',                                        accent:summary.poOrderDues>0?'#dc2626':'#16a34a' },
              ].map((k,i)=>(
                <div key={i} style={{ background:'#fff', border:`1px solid ${BD}`, borderRadius:10, padding:'16px 18px', borderTop:`3px solid ${k.accent}`, boxShadow:'0 1px 4px rgba(0,0,0,0.04)' }}>
                  <div style={{ fontSize:9, color:'#9ca3af', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.6px', marginBottom:8 }}>{k.label}</div>
                  <div style={{ fontSize:i===0||i===3?26:18, fontWeight:800, color:'#111', lineHeight:1, marginBottom:6 }}>{k.val}</div>
                  <div style={{ fontSize:10, color:'#b0b8c4' }}>{k.sub}</div>
                </div>
              ))}
            </div>

          </div>
        )}

        {/* ══════════════ BALANCE SHEET TAB ══════════════ */}
        {tab==='balance' && (
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>

            {/* Header card */}
            <div style={{ background:`linear-gradient(135deg,#0b3d3d 0%,#104f4f 100%)`, borderRadius:12, padding:'18px 24px', display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:12 }}>
              <div>
                <div style={{ fontSize:20, fontWeight:900, color:'#fff' }}>⚖ï¸ Balance Sheet</div>
                <div style={{ fontSize:11, color:'rgba(255,255,255,0.65)', marginTop:3 }}>
                  FY {selectedFY==='all'?'All Years':selectedFY} &nbsp;·&nbsp; As of {new Date().toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'})}
                </div>
              </div>
              <div style={{ display:'flex', gap:20 }}>
                <div style={{ textAlign:'center' }}>
                  <div style={{ fontSize:10, color:'rgba(255,255,255,0.6)', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.5px' }}>Total Assets</div>
                  <div style={{ fontSize:22, fontWeight:900, color:'#86efac' }}>{loading?'—':fmtINR(balanceSheet.assets.total)}</div>
                </div>
                <div style={{ textAlign:'center' }}>
                  <div style={{ fontSize:10, color:'rgba(255,255,255,0.6)', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.5px' }}>Total Liabilities</div>
                  <div style={{ fontSize:22, fontWeight:900, color:'#fca5a5' }}>{loading?'—':fmtINR(balanceSheet.liabilities.total)}</div>
                </div>
                <div style={{ textAlign:'center' }}>
                  <div style={{ fontSize:10, color:'rgba(255,255,255,0.6)', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.5px' }}>Net Position</div>
                  <div style={{ fontSize:22, fontWeight:900, color:balanceSheet.netWorth>=0?'#86efac':'#fca5a5' }}>{loading?'—':fmtINR(balanceSheet.netWorth)}</div>
                </div>
              </div>
            </div>

            {/* Two-column layout */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, alignItems:'start' }}>

              {/* LEFT: LIABILITIES */}
              <div style={{ background:'#fff', border:`1px solid ${BD}`, borderRadius:12, overflow:'hidden', boxShadow:'0 2px 10px rgba(0,0,0,0.06)' }}>
                <div style={{ background:'linear-gradient(135deg,#7f1d1d 0%,#dc2626 100%)', padding:'14px 20px', display:'flex', alignItems:'center', gap:10 }}>
                  <div style={{ width:36, height:36, borderRadius:8, background:'rgba(255,255,255,0.15)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, flexShrink:0 }}>📤</div>
                  <div>
                    <div style={{ fontSize:14, fontWeight:800, color:'#fff' }}>Liabilities</div>
                    <div style={{ fontSize:10, color:'rgba(255,255,255,0.65)', marginTop:1 }}>What we owe</div>
                  </div>
                </div>

                {/* Vendor Payables */}
                <div style={{ padding:'18px 20px', borderBottom:`1px solid ${BD}` }}>
                  <div style={{ display:'flex', alignItems:'flex-start', gap:14 }}>
                    <div style={{ width:42, height:42, borderRadius:10, background:'#fef2f2', border:'1px solid #fecaca', display:'flex', alignItems:'center', justifyContent:'center', fontSize:20, flexShrink:0 }}>🛒</div>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:13, fontWeight:700, color:'#111' }}>Vendor Payables</div>
                      <div style={{ fontSize:11, color:'#6b7280', marginTop:2 }}>Outstanding amounts due to vendors on purchase orders</div>
                      <div style={{ marginTop:10 }}>
                        <div style={{ fontSize:9, color:'#9ca3af', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.4px', marginBottom:3 }}>PO Value vs Payments Made</div>
                        <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, color:'#374151', marginBottom:2 }}>
                          <span>Total PO Value</span><span style={{ fontWeight:700 }}>{fmtINR(summary.poValue)}</span>
                        </div>
                        <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, color:'#374151', marginBottom:6 }}>
                          <span>Payments Made</span><span style={{ fontWeight:700 }}>−{fmtINR(summary.paymentV)}</span>
                        </div>
                        <div style={{ height:1, background:BD, marginBottom:6 }}/>
                      </div>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                        <span style={{ fontSize:11, fontWeight:600, color:'#dc2626' }}>Balance Due to Vendors</span>
                        <span style={{ fontSize:20, fontWeight:900, color:'#dc2626' }}>{loading?'—':fmtINR(balanceSheet.liabilities.vendorPayables)}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Advance Received from Clients */}
                <div style={{ padding:'18px 20px', borderBottom:`1px solid ${BD}` }}>
                  <div style={{ display:'flex', alignItems:'flex-start', gap:14 }}>
                    <div style={{ width:42, height:42, borderRadius:10, background:'#fff7ed', border:'1px solid #fed7aa', display:'flex', alignItems:'center', justifyContent:'center', fontSize:20, flexShrink:0 }}>💰</div>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:13, fontWeight:700, color:'#111' }}>Advance from Clients</div>
                      <div style={{ fontSize:11, color:'#6b7280', marginTop:2 }}>Client payments received in excess of sales bills raised</div>
                      <div style={{ marginTop:10 }}>
                        <div style={{ fontSize:9, color:'#9ca3af', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.4px', marginBottom:3 }}>Receipts vs Sales Billed</div>
                        <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, color:'#374151', marginBottom:2 }}>
                          <span>Total Receipts</span><span style={{ fontWeight:700 }}>{fmtINR(summary.receiptV)}</span>
                        </div>
                        <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, color:'#374151', marginBottom:6 }}>
                          <span>Sales Billed</span><span style={{ fontWeight:700 }}>{fmtINR(summary.salesBillV)}</span>
                        </div>
                        <div style={{ height:1, background:BD, marginBottom:6 }}/>
                      </div>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                        <span style={{ fontSize:11, fontWeight:600, color:'#ea580c' }}>Advance Liability</span>
                        <span style={{ fontSize:20, fontWeight:900, color:'#ea580c' }}>{loading?'—':fmtINR(balanceSheet.liabilities.advanceFromClients)}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Liabilities Total */}
                <div style={{ padding:'16px 20px', background:'#fef2f2' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                    <span style={{ fontSize:14, fontWeight:800, color:'#7f1d1d' }}>Total Liabilities</span>
                    <span style={{ fontSize:26, fontWeight:900, color:'#dc2626' }}>{loading?'—':fmtINR(balanceSheet.liabilities.total)}</span>
                  </div>
                </div>
              </div>

              {/* RIGHT: ASSETS */}
              <div style={{ background:'#fff', border:`1px solid ${BD}`, borderRadius:12, overflow:'hidden', boxShadow:'0 2px 10px rgba(0,0,0,0.06)' }}>
                <div style={{ background:'linear-gradient(135deg,#14532d 0%,#16a34a 100%)', padding:'14px 20px', display:'flex', alignItems:'center', gap:10 }}>
                  <div style={{ width:36, height:36, borderRadius:8, background:'rgba(255,255,255,0.15)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, flexShrink:0 }}>📥</div>
                  <div>
                    <div style={{ fontSize:14, fontWeight:800, color:'#fff' }}>Assets</div>
                    <div style={{ fontSize:10, color:'rgba(255,255,255,0.65)', marginTop:1 }}>What we own &amp; are owed</div>
                  </div>
                </div>

                {/* Client Receivables */}
                <div style={{ padding:'18px 20px', borderBottom:`1px solid ${BD}` }}>
                  <div style={{ display:'flex', alignItems:'flex-start', gap:14 }}>
                    <div style={{ width:42, height:42, borderRadius:10, background:'#eff6ff', border:'1px solid #bfdbfe', display:'flex', alignItems:'center', justifyContent:'center', fontSize:20, flexShrink:0 }}>📋</div>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:13, fontWeight:700, color:'#111' }}>Client Receivables</div>
                      <div style={{ fontSize:11, color:'#6b7280', marginTop:2 }}>Outstanding amounts due from clients on sales orders</div>
                      <div style={{ marginTop:10 }}>
                        <div style={{ fontSize:9, color:'#9ca3af', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.4px', marginBottom:3 }}>Sales Order Value vs Receipts</div>
                        <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, color:'#374151', marginBottom:2 }}>
                          <span>Total SO Value</span><span style={{ fontWeight:700 }}>{fmtINR(summary.soValue)}</span>
                        </div>
                        <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, color:'#374151', marginBottom:6 }}>
                          <span>Receipts Collected</span><span style={{ fontWeight:700 }}>−{fmtINR(summary.receiptV)}</span>
                        </div>
                        <div style={{ height:1, background:BD, marginBottom:6 }}/>
                      </div>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                        <span style={{ fontSize:11, fontWeight:600, color:'#104f4f' }}>Receivable from Clients</span>
                        <span style={{ fontSize:20, fontWeight:900, color:'#104f4f' }}>{loading?'—':fmtINR(balanceSheet.assets.clientReceivables)}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Advance Paid to Vendors */}
                <div style={{ padding:'18px 20px', borderBottom:`1px solid ${BD}` }}>
                  <div style={{ display:'flex', alignItems:'flex-start', gap:14 }}>
                    <div style={{ width:42, height:42, borderRadius:10, background:'#f0fdf4', border:'1px solid #bbf7d0', display:'flex', alignItems:'center', justifyContent:'center', fontSize:20, flexShrink:0 }}>💸</div>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:13, fontWeight:700, color:'#111' }}>Advance Paid to Vendors</div>
                      <div style={{ fontSize:11, color:'#6b7280', marginTop:2 }}>Payments made to vendors in excess of purchase bills received</div>
                      <div style={{ marginTop:10 }}>
                        <div style={{ fontSize:9, color:'#9ca3af', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.4px', marginBottom:3 }}>Payments vs Purchase Billed</div>
                        <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, color:'#374151', marginBottom:2 }}>
                          <span>Total Payments</span><span style={{ fontWeight:700 }}>{fmtINR(summary.paymentV)}</span>
                        </div>
                        <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, color:'#374151', marginBottom:6 }}>
                          <span>Purchase Billed</span><span style={{ fontWeight:700 }}>{fmtINR(summary.purchBillV)}</span>
                        </div>
                        <div style={{ height:1, background:BD, marginBottom:6 }}/>
                      </div>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                        <span style={{ fontSize:11, fontWeight:600, color:'#059669' }}>Advance Asset</span>
                        <span style={{ fontSize:20, fontWeight:900, color:'#059669' }}>{loading?'—':fmtINR(balanceSheet.assets.advancePaidToVendors)}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Stock */}
                <div style={{ padding:'18px 20px', borderBottom:`1px solid ${BD}` }}>
                  <div style={{ display:'flex', alignItems:'flex-start', gap:14 }}>
                    <div style={{ width:42, height:42, borderRadius:10, background:'#faf5ff', border:'1px solid #e9d5ff', display:'flex', alignItems:'center', justifyContent:'center', fontSize:20, flexShrink:0 }}>📦</div>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:13, fontWeight:700, color:'#111' }}>Stock / Inventory</div>
                      <div style={{ fontSize:11, color:'#6b7280', marginTop:2 }}>
                        {balanceSheet.assets.stockItems} item{balanceSheet.assets.stockItems!==1?'s':''} in stock
                        {balanceSheet.assets.stockQtyTotal>0 && ` · ${(balanceSheet.assets.stockQtyTotal).toLocaleString('en-IN')} units total`}
                      </div>
                      <div style={{ marginTop:10, display:'flex', gap:20, flexWrap:'wrap' }}>
                        <div>
                          <div style={{ fontSize:9, color:'#9ca3af', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.4px', marginBottom:2 }}>Items Tracked</div>
                          <div style={{ fontSize:16, fontWeight:800, color:'#7c3aed' }}>{balanceSheet.assets.stockItems}</div>
                        </div>
                        <div>
                          <div style={{ fontSize:9, color:'#9ca3af', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.4px', marginBottom:2 }}>Total Units</div>
                          <div style={{ fontSize:16, fontWeight:800, color:'#7c3aed' }}>{(balanceSheet.assets.stockQtyTotal||0).toLocaleString('en-IN')}</div>
                        </div>
                      </div>
                      <div style={{ marginTop:10, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                        <span style={{ fontSize:11, fontWeight:600, color:'#7c3aed' }}>
                          Stock Value {balanceSheet.assets.stockValue===0?'(add rates in GRN)':'(at avg. cost)'}
                        </span>
                        <span style={{ fontSize:20, fontWeight:900, color:'#7c3aed' }}>
                          {loading?'—':balanceSheet.assets.stockValue>0?fmtINR(balanceSheet.assets.stockValue):'₹0'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Assets Total */}
                <div style={{ padding:'16px 20px', background:'#f0fdf4' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                    <span style={{ fontSize:14, fontWeight:800, color:'#14532d' }}>Total Assets</span>
                    <span style={{ fontSize:26, fontWeight:900, color:'#16a34a' }}>{loading?'—':fmtINR(balanceSheet.assets.total)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Net Position Banner */}
            <div style={{ background:'#fff', border:`2px solid ${balanceSheet.netWorth>=0?'#bbf7d0':'#fecaca'}`, borderRadius:12, padding:'20px 24px', display:'flex', justifyContent:'space-between', alignItems:'center', boxShadow:'0 2px 10px rgba(0,0,0,0.06)' }}>
              <div>
                <div style={{ fontSize:13, fontWeight:700, color:'#374151' }}>Net Position (Assets − Liabilities)</div>
                <div style={{ fontSize:11, color:'#6b7280', marginTop:2 }}>
                  {balanceSheet.netWorth>=0
                    ? 'Assets exceed liabilities — positive financial position'
                    : 'Liabilities exceed assets — review outstanding dues'}
                </div>
              </div>
              <div style={{ textAlign:'right' }}>
                <div style={{ fontSize:9, color:'#9ca3af', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:2 }}>Net Worth</div>
                <div style={{ fontSize:32, fontWeight:900, color:balanceSheet.netWorth>=0?'#16a34a':'#dc2626' }}>
                  {loading?'—':(balanceSheet.netWorth>=0?'+':'')+fmtINR(Math.abs(balanceSheet.netWorth))}
                </div>
              </div>
            </div>

          </div>
        )}

        {/* ══════════════ DAY BOOK TAB ══════════════ */}
        {tab==='daybook' && (
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>

            {/* Controls */}
            <div style={{ background:'#fff', border:`1px solid ${BD}`, borderRadius:10, padding:'12px 16px', display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
              <span style={{ fontSize:13, fontWeight:700, color:'#111' }}>📅 Day Book</span>
              <input type="date" value={dayDate} onChange={e=>setDayDate(e.target.value)}
                style={{ height:32, padding:'0 10px', border:`1px solid ${BD}`, borderRadius:6, fontSize:12, fontFamily:F, outline:'none' }}/>
              <span style={{ fontSize:11, color:'#6b7280' }}>
                {fmtD(dayDate)} — {dayBook.sos.length} SO · {dayBook.pos.length} PO · {dayBook.bills.length} Sales Bills · {dayBook.pbills.length} Purch Bills · {dayBook.rcpts.length} Receipts · {dayBook.pymts.length} Payments
              </span>
              <div style={{ marginLeft:'auto' }}>
                <button onClick={doDayBookPrint}
                  style={{ height:32, padding:'0 16px', background:P, color:'#fff', border:'none', borderRadius:6, fontSize:12, fontFamily:F, fontWeight:700, cursor:'pointer' }}>
                  🖨 Print Day Book
                </button>
              </div>
            </div>

            {/* Section renderer */}
            {[
              { title:'📋 Sales Orders', color:'#104f4f',
                cols:['SO #','Order No','Client Name','Cust PO No','Amount (₹)','Status'],
                rows:dayBook.sos,
                render:o=>[o.orderId, o.orderNo||'—', o.customerName||o.clientName||'—', o.customerPO||'—', `₹${fmt2(o.grandTotal||0)}`, o.status||'—'],
              },
              { title:'🛒 Purchase Orders', color:'#7c2d12',
                cols:['PO #','PO No','Vendor Name','Linked SO','Amount (₹)','Status'],
                rows:dayBook.pos,
                render:o=>[o.orderId, o.poNo||o.poNumber||'—', o.vendorName||'—', o.linkedSalesOrderId||'—', `₹${fmt2(o.grandTotal||0)}`, o.status||'—'],
              },
              { title:'🧾 Sales Bills', color:'#581c87',
                cols:['Bill No','Party Name','Bill Date','Amount (₹)','Status'],
                rows:dayBook.bills,
                render:b=>[b.billNo||b.billId, b.partyName||'—', fmtD(b.billDate), `₹${fmt2(b.grandTotal||0)}`, b.status||'—'],
              },
              { title:'🧾 Purchase Bills', color:'#9a3412',
                cols:['Bill No','Vendor','Bill Date','Amount (₹)','Status'],
                rows:dayBook.pbills,
                render:b=>[b.billNo||b.billId, b.partyName||b.vendorName||'—', fmtD(b.billDate), `₹${fmt2(b.grandTotal||0)}`, b.status||'—'],
              },
              { title:'💰 Receipts (from Clients)', color:'#065f46',
                cols:['ID','Client Name','Payment Mode','Reference No','Amount (₹)','Status'],
                rows:dayBook.rcpts,
                render:p=>[p.paymentId||'—', p.entityName||'—', p.paymentMode||'—', p.referenceNo||'—', `₹${fmt2(p.amount||0)}`, p.status||'—'],
              },
              { title:'💸 Payments (to Vendors)', color:'#7f1d1d',
                cols:['ID','Vendor Name','Payment Mode','Reference No','Amount (₹)','Status'],
                rows:dayBook.pymts,
                render:p=>[p.paymentId||'—', p.entityName||'—', p.paymentMode||'—', p.referenceNo||'—', `₹${fmt2(p.amount||0)}`, p.status||'—'],
              },
            ].map(sec=>(
              <div key={sec.title} style={{ background:'#fff', border:`1px solid ${BD}`, borderRadius:10, overflow:'hidden' }}>
                <div style={{ background:sec.color, padding:'7px 14px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <span style={{ fontSize:12, fontWeight:700, color:'#fff' }}>{sec.title}</span>
                  <span style={{ fontSize:10.5, color:'rgba(255,255,255,0.65)' }}>{sec.rows.length} record{sec.rows.length!==1?'s':''}</span>
                </div>
                {sec.rows.length===0
                  ? <div style={{ padding:'14px 16px', color:'#9ca3af', fontSize:11, fontStyle:'italic' }}>No entries for {fmtD(dayDate)}</div>
                  : (
                      <div style={{ overflowX:'auto' }}>
                        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11, fontFamily:F }}>
                          <thead>
                            <tr>
                              {sec.cols.map((h,i)=>(
                                <th key={i} style={{ padding:'6px 10px', background:'#f8faff', color:'#374151', fontWeight:700, fontSize:10.5,
                                  textAlign:i>=sec.cols.length-2?'right':'left', border:`1px solid ${BD}`, whiteSpace:'nowrap' }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {sec.rows.map((row,ri)=>(
                              <tr key={ri} style={{ background:ri%2===0?'#fff':'#f8faff' }}>
                                {sec.render(row).map((cell,ci)=>(
                                  <td key={ci} style={{ padding:'6px 10px', border:`1px solid ${BD}`, textAlign:ci>=sec.cols.length-2?'right':'left',
                                    fontWeight:ci===0?700:400, color:ci===0?P:'#374151' }}>{cell}</td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr style={{ background:'#eef3fb' }}>
                              {sec.cols.map((h,i)=>{
                                if(i===sec.cols.length-2){
                                  const total=sec.rows.reduce((s,r)=>{
                                    const v=sec.render(r)[i]; return s+(parseFloat(String(v||0).replace(/[₹,]/g,''))||0);
                                  },0);
                                  return <td key={i} style={{ padding:'6px 10px', textAlign:'right', fontWeight:800, color:P, border:`1px solid ${BD}` }}>₹{fmt2(total)}</td>;
                                }
                                if(i===0) return <td key={i} style={{ padding:'6px 10px', fontWeight:700, color:'#374151', border:`1px solid ${BD}` }}>TOTAL</td>;
                                return <td key={i} style={{ border:`1px solid ${BD}` }}/>;
                              })}
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    )
                }
              </div>
            ))}
          </div>
        )}

        {/* ══════════════ MONTHLY REPORT TAB ══════════════ */}
        {tab==='monthly' && (
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>

            {/* Controls */}
            <div style={{ background:'#fff', border:`1px solid ${BD}`, borderRadius:10, padding:'12px 16px', display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
              <span style={{ fontSize:13, fontWeight:700, color:'#111' }}>📆 Monthly Report</span>
              <div style={{ display:'flex', alignItems:'center', gap:6, background:'#f8faff', border:`1px solid ${BD}`, borderRadius:6, padding:'0 10px', height:32 }}>
                <span style={{ fontSize:10.5, color:'#6b7280', fontWeight:600 }}>FY</span>
                <select value={monthFY} onChange={e=>setMonthFY(e.target.value)}
                  style={{ background:'transparent', border:'none', outline:'none', fontSize:12, fontWeight:700, fontFamily:F, cursor:'pointer', color:'#111' }}>
                  <option value="all">All Years</option>
                  {availFYs.map(f=><option key={f} value={f}>{f}</option>)}
                  {!availFYs.includes(currentFY)&&<option value={currentFY}>{currentFY}</option>}
                </select>
              </div>
              <div style={{ marginLeft:'auto' }}>
                <button onClick={doMonthlyPrint}
                  style={{ height:32, padding:'0 16px', background:P, color:'#fff', border:'none', borderRadius:6, fontSize:12, fontFamily:F, fontWeight:700, cursor:'pointer' }}>
                  🖨 Print Report
                </button>
              </div>
            </div>

            {/* Monthly Table */}
            <div style={{ background:'#fff', border:`1px solid ${BD}`, borderRadius:10, overflow:'hidden' }}>
              <div style={{ overflowX:'auto' }}>
                <table style={{ borderCollapse:'collapse', fontSize:11, fontFamily:F, minWidth:1100 }}>
                  <thead>
                    <tr>
                      <th style={{ padding:'8px 14px', background:P, color:'#fff', fontWeight:700, fontSize:11, textAlign:'left', border:'1px solid #1a3a9f', whiteSpace:'nowrap', minWidth:140, position:'sticky', left:0, zIndex:3 }}>Metric</th>
                      {MONTHS.map(m=>(
                        <th key={m} style={{ padding:'8px 10px', background:P, color:'#fff', fontWeight:700, fontSize:11, textAlign:'right', border:'1px solid #1a3a9f', whiteSpace:'nowrap', minWidth:80 }}>{m}</th>
                      ))}
                      <th style={{ padding:'8px 10px', background:'#0f2a5e', color:'#fff', fontWeight:800, fontSize:11, textAlign:'right', border:'1px solid #1a3a9f', whiteSpace:'nowrap', minWidth:90 }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthlyRows.map((r,ri)=>{
                      const total = monthlyData.reduce((s,m)=>s+m[r.key],0);
                      return (
                        <tr key={r.key} style={{ background:ri%2===0?'#fff':'#f8faff' }}>
                          <td style={{ padding:'8px 14px', fontWeight:700, color:r.color, border:`1px solid ${BD}`, whiteSpace:'nowrap', position:'sticky', left:0, background:ri%2===0?'#fff':'#f8faff', zIndex:1 }}>{r.label}</td>
                          {monthlyData.map((m,mi)=>(
                            <td key={mi} style={{ padding:'8px 10px', textAlign:'right', border:`1px solid ${BD}`, color:m[r.key]>0?'#111':'#d1d5db', fontWeight:m[r.key]>0?600:400 }}>
                              {m[r.key]>0?fmtINR(m[r.key]):'—'}
                            </td>
                          ))}
                          <td style={{ padding:'8px 10px', textAlign:'right', border:`1px solid ${BD}`, fontWeight:800, color:r.color, background:ri%2===0?'#f0f4ff':'#e8eeff' }}>
                            {total>0?fmtINR(total):'—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{ background:'#dde5f7' }}>
                      <td style={{ padding:'8px 14px', fontWeight:800, color:P, border:`1px solid ${BD}`, position:'sticky', left:0, background:'#dde5f7', zIndex:1 }}>Grand Total</td>
                      {monthlyData.map((m,mi)=>{
                        const colTotal = monthlyRows.reduce((s,r)=>s+m[r.key],0);
                        return (
                          <td key={mi} style={{ padding:'8px 10px', textAlign:'right', border:`1px solid ${BD}`, fontWeight:800, color:P }}>
                            {colTotal>0?fmtINR(colTotal):'—'}
                          </td>
                        );
                      })}
                      <td style={{ padding:'8px 10px', textAlign:'right', border:`1px solid ${BD}`, fontWeight:800, color:P, fontSize:12 }}>
                        {fmtINR(monthlyRows.reduce((s,r)=>s+monthlyData.reduce((ss,m)=>ss+m[r.key],0),0))}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* Monthly Bar Visual */}
            <div style={{ background:'#fff', border:`1px solid ${BD}`, borderRadius:10, padding:'14px 16px' }}>
              <div style={{ fontSize:12, fontWeight:700, color:'#111', marginBottom:12 }}>Month-wise Comparison</div>
              <div style={{ display:'flex', gap:6, alignItems:'flex-end', height:80, overflowX:'auto' }}>
                {MONTHS.map((m,mi)=>{
                  const soV = monthlyData[mi].so, poV = monthlyData[mi].po;
                  const maxAll = Math.max(...monthlyData.flatMap(x=>[x.so,x.po]),1);
                  const hSO = Math.round((soV/maxAll)*72), hPO = Math.round((poV/maxAll)*72);
                  return (
                    <div key={m} style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:2, minWidth:46, flex:'1 1 46px' }}>
                      <div style={{ display:'flex', gap:2, alignItems:'flex-end', height:72 }}>
                        <div style={{ width:16, height:hSO||2, background:'#3b82f6', borderRadius:'3px 3px 0 0', transition:'height 0.4s' }} title={`SO: ${fmtINR(soV)}`}/>
                        <div style={{ width:16, height:hPO||2, background:'#f59e0b', borderRadius:'3px 3px 0 0', transition:'height 0.4s' }} title={`PO: ${fmtINR(poV)}`}/>
                      </div>
                      <div style={{ fontSize:9.5, color:'#9ca3af', fontWeight:600 }}>{m}</div>
                    </div>
                  );
                })}
              </div>
              <div style={{ display:'flex', gap:16, marginTop:8, justifyContent:'center' }}>
                <div style={{ display:'flex', alignItems:'center', gap:5 }}><div style={{ width:12, height:10, background:'#3b82f6', borderRadius:2 }}/><span style={{ fontSize:10, color:'#6b7280' }}>Sales Order</span></div>
                <div style={{ display:'flex', alignItems:'center', gap:5 }}><div style={{ width:12, height:10, background:'#f59e0b', borderRadius:2 }}/><span style={{ fontSize:10, color:'#6b7280' }}>Purchase Order</span></div>
              </div>
            </div>

          </div>
        )}

      </div>

      {/* ── Month Detail Modal ── */}
      {monthDetailOpen !== null && (() => {
        const rec = getMonthRecords(monthDetailOpen);
        return (
          <MonthDetailModal
            slot={monthDetailOpen}
            fy={selectedFY === 'all' ? 'All Years' : selectedFY}
            sos={rec.sos} pos={rec.pos} bills={rec.bills} pbills={rec.pbills} payments={rec.payments}
            onClose={()=>setMonthDetailOpen(null)}
          />
        );
      })()}
    </div>
  );
}
