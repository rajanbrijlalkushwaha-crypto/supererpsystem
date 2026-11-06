import { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import { useCompany } from '../../context/CompanyContext';
import { useAuth } from '../../context/AuthContext';
import { can } from '../../utils/permissions';
import AuditTrail from '../../components/AuditTrail';
import ActivityDrawer from '../../components/ActivityDrawer';
import { withPrintFont } from '../../utils/printFont';

const F  = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const P  = '#133d80'; // matches Sales Order module's blue theme
const PL = '#e8eef8';
const GN = '#065f46';

const fmt  = n => (parseFloat(n)||0).toFixed(2);
const fmtD = d => { if(!d) return '—'; const dt=new Date(d); if(isNaN(dt)) return d; return `${String(dt.getDate()).padStart(2,'0')}-${String(dt.getMonth()+1).padStart(2,'0')}-${dt.getFullYear()}`; };
const getFY = d => { if(!d) return null; const dt=new Date(d); if(isNaN(dt)) return null; const y=dt.getFullYear(),m=dt.getMonth()+1,s=m>=4?y:y-1; return `${String(s).slice(2)}-${String(s+1).slice(2)}`; };
const today = () => new Date().toISOString().split('T')[0];

const billFileUrl = (billId, fileName, cid, dl=false) =>
  `/api/bills/${billId}/download/${encodeURIComponent(fileName)}?companyId=${cid}&type=purchase${dl?'&dl=1':''}`;
const isImage = n => /\.(jpg|jpeg|png|gif|bmp|webp)$/i.test(n||'');
const isPDF   = n => /\.pdf$/i.test(n||'');
const sameState = (a,b) => (!a||!b) ? false : a.trim().toLowerCase() === b.trim().toLowerCase();

const inp = { width:'100%', height:32, padding:'0 9px', border:'1px solid #D1D5DB', borderRadius:6, fontSize:12, fontFamily:F, outline:'none', background:'#fff', boxSizing:'border-box' };
const lbl = { fontSize:11, fontWeight:600, color:'#374151', marginBottom:4, display:'block' };

const TH = ({children, align='left', bg=P, style={}}) => (
  <th style={{ padding:'6px 8px', background:bg, color:'#fff', fontSize:10, fontWeight:700, textAlign:align, border:`1px solid ${bg==='#065f46'?'#047857':'#1a3a9f'}`, whiteSpace:'nowrap', ...style }}>{children}</th>
);
const TD = ({children, align='left', bold, color, style={}}) => (
  <td style={{ padding:'4px 8px', fontSize:11, border:'1px solid #000000', textAlign:align, fontWeight:bold?700:400, color:color||'#111827', verticalAlign:'middle', fontFamily:F, ...style }}>{children}</td>
);

/* badge — solid colour circle + single letter, same convention as Sales Order / Purchase Order */
const BC = {
  draft:    { bg:'#94a3b8', letter:'D', label:'Draft' },
  pending:  { bg:'#f59e0b', letter:'P', label:'Pending' },
  approved: { bg:'#16a34a', letter:'A', label:'Approved' },
  posted:   { bg:'#16a34a', letter:'A', label:'Approved' },
  rejected: { bg:'#ef4444', letter:'C', label:'Rejected' },
};
function Badge({ s }) {
  const c = BC[s?.toLowerCase()] || BC.draft;
  return (
    <span title={c.label} style={{ display:'inline-flex', alignItems:'center', justifyContent:'center',
      width:22, height:22, borderRadius:'50%', background:c.bg, color:'#fff',
      fontSize:11, fontWeight:800, flexShrink:0, lineHeight:1, fontFamily:F }}>{c.letter}</span>
  );
}

/* ── Fetch company logo as base64 for embedding in print windows ── */
const fetchLogoBase64 = async (logoFileName, companyId) => {
  if (!logoFileName) return null;
  try {
    const res = await fetch(`/api/companies/logo/${encodeURIComponent(logoFileName)}?companyId=${companyId}`);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise(r => {
      const rd = new FileReader(); rd.onload = () => r(rd.result); rd.readAsDataURL(blob);
    });
  } catch { return null; }
};

/* ── Purchase Bills list — A4 portrait, outlined borders, company header ── */
const printPurchaseBillsReport = (title, subtitle, rows, company = {}) => {
  const today = new Date().toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'});
  const cols = ['#','Order File No','Client','Vendor','PO No','Vendor Bill Date','Vendor Bill No','Material','Qty','Rate (₹)','Taxable (₹)','GST (₹)','Invoice Value (₹)','GST Type','Status'];
  const rHtml = rows.map((r,i) => `<tr class="${i%2===0?'':'alt'}">${r.map(c=>`<td>${c??'—'}</td>`).join('')}</tr>`).join('');
  const logoHtml = company.logoBase64
    ? `<img src="${company.logoBase64}" style="height:52px;max-width:150px;object-fit:contain;">`
    : '';
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title>
<style>*{margin:0;padding:0;box-sizing:border-box;}
body{font-family:Arial,Helvetica,sans-serif;font-size:7.5pt;color:#000;padding:10px;}
.outer{border:1.5px solid #000;width:100%;border-collapse:collapse;}
.outer td{border:1px solid #000;padding:3px 6px;vertical-align:top;}
h1{font-size:12.5pt;font-weight:bold;text-align:center;padding:6px;border-bottom:2px solid #000;}
.sub{font-size:8.5pt;text-align:center;color:#333;padding:3px 6px;}
table.data{width:100%;border-collapse:collapse;font-size:7.5pt;}
table.data th{border:1px solid #000;padding:4px 4px;font-weight:bold;text-align:left;background:#fff;white-space:nowrap;}
table.data td{border:1px solid #000;padding:3px 4px;vertical-align:middle;}
.alt td{background:#f7f7f7;}
.foot{margin-top:5px;font-size:7.5pt;color:#555;text-align:right;}
@media print{@page{margin:8mm;size:A4 portrait;}}</style>
</head><body>
<table class="outer" style="margin-bottom:0;">
  <tr>
    <td style="padding:8px 10px;">
      <div style="display:flex;align-items:center;gap:12px;">
        ${logoHtml}
        <div>
          <div style="font-size:13pt;font-weight:bold;">${company.companyName||company.name||''}</div>
          <div style="font-size:8.5pt;color:#333;">${[company.address,company.city,company.state,company.pincode].filter(Boolean).join(', ')}</div>
          <div style="font-size:8.5pt;color:#333;">GSTIN: ${company.gstin||company.gst||''} &nbsp;|&nbsp; PAN: ${company.pan||''}</div>
        </div>
      </div>
    </td>
  </tr>
  <tr><td><h1>${title}</h1></td></tr>
  <tr><td class="sub">${subtitle} &middot; ${rows.length} bills &middot; Printed: ${today}</td></tr>
  <tr><td style="padding:0;">
    <table class="data"><thead><tr>${cols.map(c=>`<th>${c}</th>`).join('')}</tr></thead>
    <tbody>${rHtml}</tbody></table>
  </td></tr>
</table>
<div class="foot">Generated: ${today}</div>
<script>window.onload=()=>setTimeout(()=>window.print(),400);<\/script></body></html>`;
  const w = window.open('','_blank','width=1100,height=900');
  if (!w) { alert('Allow pop-ups to print.'); return; }
  w.document.write(withPrintFont(html)); w.document.close();
};

export default function PurchaseBill() {
  const { selectedCompany } = useCompany();
  const cid = selectedCompany?.companyId;
  const { user } = useAuth();
  const companyState = selectedCompany?.state || '';

  const [tab,  setTab]  = useState('orders');
  const [view, setView] = useState('tab');

  const [purchaseOrders, setPOs]    = useState([]);
  const [salesOrders,    setSOs]    = useState([]);
  const [bills,          setBills]  = useState([]);
  const [clients,        setClients]= useState([]);
  const [vendors,        setVendors]= useState([]);
  const [loading,        setLoading]= useState(false);

  // Bill form
  const [editBill,     setEditBill]     = useState(null);
  const [selOrder,     setSelOrder]     = useState('');
  const [order,        setOrder]        = useState(null);
  const [billNo,       setBillNo]       = useState('');
  const [vendorBillNo, setVendorBillNo] = useState('');
  const [billDate,     setBillDate]     = useState(today());
  const [billFile,     setBillFile]     = useState(null);
  const [billQtys,     setBillQtys]     = useState([]);
  const [saving,       setSaving]       = useState(false);
  const [msg,          setMsg]          = useState('');

  // UI
  const [viewBill,     setViewBill]     = useState(null);
  const [selPBill,     setSelPBill]     = useState(null);
  const [pbFy,         setPbFy]         = useState('all');
  const [activityRec,  setActivityRec]  = useState(null);
  const [pdfViewer,    setPdfViewer]    = useState(null);
  const [ordSearch,  setOrdSearch] = useState('');
  const [pbSearch,   setPbSearch]  = useState('');
  const [poFy,       setPoFy]      = useState('all');

  const load = useCallback(async () => {
    if (!cid) return;
    setLoading(true);
    try {
      const [poR, soR, bR, clientR, vendorR] = await Promise.all([
        axios.get(`/api/purchase-orders?companyId=${cid}`).catch(()=>({data:[]})),
        axios.get(`/api/sales-orders?companyId=${cid}`).catch(()=>({data:[]})),
        axios.get(`/api/bills?companyId=${cid}&type=purchase`).catch(()=>({data:[]})),
        axios.get(`/api/clients?companyId=${cid}`).catch(()=>({data:[]})),
        axios.get(`/api/vendors?companyId=${cid}`).catch(()=>({data:[]})),
      ]);
      setPOs((poR.data||[]).filter(o => !['draft','rejected'].includes(o.status)));
      setSOs(soR.data||[]);
      setBills(bR.data||[]);
      setClients(clientR.data||[]);
      setVendors(vendorR.data||[]);
    } catch {}
    setLoading(false);
  }, [cid]);

  useEffect(() => { load(); }, [load]);

  const soMap = useMemo(() => {
    const m = {};
    salesOrders.forEach(s => { m[String(s.orderId)] = s; });
    return m;
  }, [salesOrders]);

  const billsByOrder = useMemo(() => {
    const m = {};
    bills.forEach(b => { const k=String(b.orderId); if(!m[k]) m[k]=[]; m[k].push(b); });
    return m;
  }, [bills]);

  const alreadyBilledQtys = useMemo(() => {
    if (!order || !selOrder) return [];
    const existing = (billsByOrder[String(selOrder)] || [])
      .filter(b => !editBill || String(b.billId) !== String(editBill.billId));
    return (order.items || []).map((_, i) =>
      existing.reduce((s, b) => s + (parseFloat((b.items || [])[i]?.qty) || 0), 0)
    );
  }, [order, selOrder, billsByOrder, editBill]);

  useEffect(() => {
    if (!order) { setBillQtys([]); return; }
    if (editBill) {
      setBillQtys((editBill.items || []).map(it => parseFloat(it.qty) || 0));
    } else {
      const existing = (billsByOrder[String(selOrder)] || []);
      const alreadyBilled = (order.items || []).map((_, i) =>
        existing.reduce((s, b) => s + (parseFloat((b.items || [])[i]?.qty) || 0), 0)
      );
      setBillQtys((order.items || []).map((it, i) =>
        Math.max(0, (parseFloat(it.qty || it.quantity) || 0) - alreadyBilled[i])
      ));
    }
  }, [order, selOrder, billsByOrder, editBill]);

  useEffect(() => {
    if (view==='create-bill' && !editBill) {
      const yr = new Date().getFullYear();
      setBillNo(`PB/${yr}-${String(yr+1).slice(2)}/${String(bills.length+1).padStart(3,'0')}`);
    }
  }, [view, editBill, bills.length]);

  useEffect(() => {
    if (!selOrder) { setOrder(null); return; }
    axios.get(`/api/purchase-orders/${selOrder}?companyId=${cid}`)
      .then(r => setOrder(r.data))
      .catch(() => setOrder(purchaseOrders.find(o=>String(o.orderId)===String(selOrder))||null));
  }, [selOrder, cid, purchaseOrders]);

  const calcLines = (ord = order, qtyOverrides = null) => {
    if (!ord) return { lines:[], subTotal:0, totalCGST:0, totalSGST:0, totalIGST:0, totalGST:0, grandTotal:0, intrastate:false };
    const partyState = ord.vendorState||ord.shipFromState||'';
    const intrastate = sameState(companyState, partyState);
    const lines = (ord.items||[]).map((it, i) => {
      const qty=qtyOverrides ? (parseFloat(qtyOverrides[i])||0) : (parseFloat(it.qty||it.quantity)||0), rate=parseFloat(it.rate)||0;
      const gstPct=parseFloat(it.gstPercent||it.gst||it.taxRate)||0;
      const base=qty*rate;
      const discPct=it.discountType==='%'?parseFloat(it.discount)||0:0;
      const discFlat=it.discountType!=='%'?parseFloat(it.discount)||0:0;
      const disc=discPct>0?base*discPct/100:discFlat;
      const taxable=base-disc, gstAmt=taxable*gstPct/100;
      const cgst=intrastate?gstAmt/2:0, sgst=intrastate?gstAmt/2:0, igst=intrastate?0:gstAmt;
      return { description:it.itemName||it.description||it.name||'—', hsnCode:it.hsnCode||it.hsn||'',
        unit:it.unit||it.uom||'NOS', qty, rate, disc, discStr:discPct>0?`${discPct}%`:discFlat>0?`₹${fmt(discFlat)}`:'—',
        taxable, gstPct, gstAmt, cgst, sgst, igst, total:taxable+gstAmt };
    });
    const pnf=parseFloat(ord.packingCharges)||0, frt=parseFloat(ord.freightCharges)||0;
    if(pnf>0) lines.push({description:'Packing & Forwarding',hsnCode:'',unit:'LOT',qty:1,rate:pnf,disc:0,discStr:'—',taxable:pnf,gstPct:0,gstAmt:0,cgst:0,sgst:0,igst:0,total:pnf});
    if(frt>0) lines.push({description:'Freight Charges',hsnCode:'',unit:'LOT',qty:1,rate:frt,disc:0,discStr:'—',taxable:frt,gstPct:0,gstAmt:0,cgst:0,sgst:0,igst:0,total:frt});
    (ord.charges||[]).forEach(ch=>{
      const amt=parseFloat(ch.amount)||0,gst=parseFloat(ch.gst)||0,gstA=amt*gst/100;
      lines.push({description:ch.chargeType||ch.description||'Charges',hsnCode:'',unit:'LOT',qty:1,rate:amt,disc:0,discStr:'—',taxable:amt,gstPct:gst,gstAmt:gstA,cgst:intrastate?gstA/2:0,sgst:intrastate?gstA/2:0,igst:intrastate?0:gstA,total:amt+gstA});
    });
    const subTotal=lines.reduce((s,l)=>s+l.taxable,0);
    const totalCGST=lines.reduce((s,l)=>s+l.cgst,0), totalSGST=lines.reduce((s,l)=>s+l.sgst,0);
    const totalIGST=lines.reduce((s,l)=>s+l.igst,0), totalGST=totalCGST+totalSGST+totalIGST;
    return { lines, subTotal, totalCGST, totalSGST, totalIGST, totalGST, grandTotal:subTotal+totalGST, intrastate };
  };

  const openCreateForOrder = (po) => {
    setEditBill(null); setSelOrder(String(po.orderId)); setOrder(po);
    setBillDate(today()); setVendorBillNo(''); setBillFile(null); setMsg('');
    const yr=new Date().getFullYear();
    setBillNo(`PB/${yr}-${String(yr+1).slice(2)}/${String(bills.length+1).padStart(3,'0')}`);
    setView('create-bill');
  };

  const openEditBill = (b) => {
    setEditBill(b); setSelOrder(String(b.orderId));
    setBillNo(b.billNo||''); setVendorBillNo(b.vendorBillNo||'');
    setBillDate(b.billDate||today()); setBillFile(null); setMsg('');
    setView('create-bill');
  };

  const resetBillFields = () => {
    setBillNo(''); setVendorBillNo(''); setBillDate(today()); setBillFile(null); setMsg(''); setEditBill(null);
    const yr=new Date().getFullYear();
    setBillNo(`PB/${yr}-${String(yr+1).slice(2)}/${String(bills.length+1).padStart(3,'0')}`);
  };

  const handleSave = async (stay=false) => {
    if (!selOrder) { setMsg('Select a Purchase Order'); return; }
    if (!billNo.trim()) { setMsg('Bill No is required'); return; }
    setSaving(true); setMsg('');
    try {
      const { lines:L, subTotal:st, totalCGST:cg, totalSGST:sg, totalIGST:ig, totalGST:tg, grandTotal:gt, intrastate:ist } = calcLines(order, billQtys);
      const partyState = order?.vendorState||order?.shipFromState||'';
      const payload = {
        type:'purchase', billNo:billNo.trim(), vendorBillNo:vendorBillNo.trim(), billDate,
        orderId:selOrder, orderNo:order?.poNo||order?.poNumber||`PO-${selOrder}`,
        partyName:order?.vendorName||'—', partyGstin:order?.vendorGstin||'',
        partyState, companyState, gstType:ist?'intrastate':'interstate',
        items:L, subTotal:st, totalCGST:ist?cg:0, totalSGST:ist?sg:0, totalIGST:ist?0:ig,
        totalGST:tg, grandTotal:gt, companyId:cid,
        // every new purchase bill goes straight into the approval queue;
        // on edit, omit status so the backend keeps whatever it already was
        ...(editBill ? {} : { status:'pending' }),
      };
      let savedBillId;
      if (editBill) {
        await axios.put(`/api/bills/${editBill.billId}?companyId=${cid}`, payload);
        savedBillId = editBill.billId;
      } else {
        const r = await axios.post(`/api/bills?companyId=${cid}`, payload);
        savedBillId = r.data?.billId;
      }
      if (billFile && savedBillId) {
        const fd = new FormData(); fd.append('file', billFile);
        await axios.post(`/api/bills/${savedBillId}/upload?companyId=${cid}&type=purchase`, fd).catch(()=>{});
      }
      setMsg(editBill?'Bill updated!':'Bill saved!');
      await load();
      if (stay && !editBill) { resetBillFields(); }
      else { setTimeout(()=>{ setView('tab'); setTab('bills'); setMsg(''); setSelOrder(''); setOrder(null); setEditBill(null); },900); }
    } catch(e) { setMsg('Error: '+(e.response?.data?.error||e.message)); }
    setSaving(false);
  };

  /* Approve — only for users with Purchase Bill approve rights, only while pending/draft.
     'posted' is the status the Approvals module uses for an approved purchase bill. */
  const canApproveBill = b => !!b && ['pending','draft'].includes(String(b.status||'').toLowerCase()) && can(user,'purchaseBill','approve');
  const handleApproveBill = async (b) => {
    if (!window.confirm(`Approve purchase bill ${b.billNo||b.billId}?`)) return;
    try {
      await axios.put(`/api/bills/${b.billId}?companyId=${cid}&type=purchase`,
        { type:'purchase', status:'posted', approvedBy:user?.name||user?.username||'Admin', approvedAt:new Date().toISOString() });
      setSelPBill(null); setViewBill(null);
      await load();
    } catch(e) { alert('Approve failed: '+(e.response?.data?.error||e.message)); }
  };

  const handleDeleteBill = async (billId) => {
    if (!window.confirm(`Delete bill ${billId}?`)) return;
    await axios.delete(`/api/bills/${billId}?companyId=${cid}&type=purchase`).catch(()=>{});
    load();
  };

  const doPrintBills = async () => {
    const list = [...filteredBills].sort((a,b)=>new Date(b.createdAt||0)-new Date(a.createdAt||0));
    const rows = list.map((b,i) => {
      const po = purchaseOrders.find(o=>String(o.orderId)===String(b.orderId));
      const so = soMap[String(po?.linkedSalesOrderId)];
      const items = b.items||[];
      const matQty = items.reduce((s,it)=>s+(parseFloat(it.qty)||0),0);
      const material = items.length
        ? (items[0].description||items[0].itemName||'—') + (items.length>1?` +${items.length-1} more`:'')
        : '—';
      const matRate = items.length ? (parseFloat(items[0].rate)||0) : null;
      return [
        i+1, so?.orderNo||'—', so?.customerName||so?.clientName||'—', b.partyName||'—',
        b.orderNo||'—', fmtD(b.billDate), b.vendorBillNo||'—', material, matQty||'—',
        matRate!==null?fmt(matRate):'—', fmt(b.subTotal), fmt(b.totalGST), fmt(b.grandTotal),
        b.gstType==='intrastate'?'CGST+SGST':'IGST',
        (BC[b.status?.toLowerCase()]||BC.draft).label,
      ];
    });
    const logoBase64 = await fetchLogoBase64(selectedCompany?.logoFileName, cid);
    const fyLabel = pbFy==='all' ? 'All Financial Years' : `FY ${pbFy}`;
    printPurchaseBillsReport('Purchase Bills Report', fyLabel, rows, { ...selectedCompany, logoBase64 });
  };

  const poOrderQty    = (po) => (po.items||[]).reduce((s,it)=>s+(parseFloat(it.qty||it.quantity)||0),0);
  const poBilledQty   = (po) => (billsByOrder[String(po.orderId)]||[]).reduce((s,b)=>s+(b.items||[]).reduce((ss,it)=>ss+(parseFloat(it.qty)||0),0),0);

  const isFullyBilled = (po) => {
    const poVal=parseFloat(po.grandTotal)||0; if(poVal<=0) return false;
    const billed=(billsByOrder[String(po.orderId)]||[]).reduce((s,b)=>s+(parseFloat(b.grandTotal)||0),0);
    return billed>=poVal;
  };

  const filteredPOs = useMemo(() => {
    let result = purchaseOrders;
    if (poFy !== 'all') result = result.filter(o => getFY(o.poDate||o.createdAt) === poFy);
    if (!ordSearch.trim()) return result;
    const q=ordSearch.toLowerCase();
    return result.filter(o=>{
      const so=soMap[String(o.linkedSalesOrderId)];
      return (o.poNo||'').toLowerCase().includes(q)||String(o.orderId).includes(q)||
             (o.vendorName||'').toLowerCase().includes(q)||(so?.customerName||'').toLowerCase().includes(q);
    });
  },[purchaseOrders,ordSearch,soMap,poFy]);

  const fyBillList = useMemo(()=>{ const s=new Set(); bills.forEach(b=>{const f=getFY(b.billDate);if(f)s.add(f);}); return Array.from(s).sort().reverse(); },[bills]);
  const fyPOList   = useMemo(()=>{ const s=new Set(); purchaseOrders.forEach(o=>{const f=getFY(o.poDate||o.createdAt);if(f)s.add(f);}); return Array.from(s).sort().reverse(); },[purchaseOrders]);

  const filteredBills = useMemo(()=>{
    let result = bills;
    if (pbFy !== 'all') result = result.filter(b => getFY(b.billDate) === pbFy);
    if (!pbSearch.trim()) return result;
    const q=pbSearch.toLowerCase();
    return result.filter(b=>(b.billNo||'').toLowerCase().includes(q)||(b.vendorBillNo||'').toLowerCase().includes(q)||
      (b.partyName||'').toLowerCase().includes(q)||(b.orderNo||'').toLowerCase().includes(q));
  },[bills,pbSearch,pbFy]);


  /* ══════ CREATE BILL VIEW ══════ */
  if (view==='create-bill') {
    return (
      <div style={{fontFamily:F,fontSize:12,padding:10}}>
        <div style={{background:P,color:'#fff',padding:'8px 14px',borderRadius:7,display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
          <div>
            <div style={{fontSize:14,fontWeight:800}}>{editBill?'✏ï¸ Edit Purchase Bill':'📄 New Purchase Bill'}</div>
            <div style={{fontSize:10,opacity:0.7,marginTop:1}}>{companyState?`Company State: ${companyState}`:'Set company state in Admin for GST'}</div>
          </div>
          <div style={{display:'flex',gap:8}}>
            <button onClick={()=>{setView('tab');setEditBill(null);setSelOrder('');setOrder(null);setMsg('');}}
              style={{height:30,padding:'0 14px',background:'rgba(255,255,255,0.15)',border:'1px solid rgba(255,255,255,0.3)',color:'#fff',borderRadius:6,cursor:'pointer',fontSize:12,fontWeight:600,fontFamily:F}}>
              ← Back
            </button>
            {!editBill&&(
              <button onClick={()=>handleSave(true)} disabled={saving}
                style={{height:30,padding:'0 14px',background:'rgba(255,255,255,0.18)',border:'1px solid rgba(255,255,255,0.4)',color:'#fff',borderRadius:6,cursor:saving?'not-allowed':'pointer',fontSize:12,fontWeight:700,fontFamily:F,opacity:saving?0.7:1}}>
                💾 Save & Add Another
              </button>
            )}
            <button onClick={()=>handleSave(false)} disabled={saving}
              style={{height:30,padding:'0 18px',background:'#F59E0B',border:'none',borderRadius:6,cursor:saving?'not-allowed':'pointer',color:'#fff',fontSize:12,fontWeight:800,fontFamily:F,opacity:saving?0.7:1}}>
              {saving?'Saving…':editBill?'✔ Update Bill':'✔ Save & Done'}
            </button>
          </div>
        </div>
        {msg&&<div style={{marginBottom:10,padding:'8px 12px',borderRadius:6,fontSize:12,background:msg.startsWith('Error')?'#FEF2F2':'#dcfce7',color:msg.startsWith('Error')?'#DC2626':'#166534',border:`1px solid ${msg.startsWith('Error')?'#FECACA':'#bbf7d0'}`}}>{msg}</div>}
        <div style={{background:'#fff',border:'1px solid #000000',borderRadius:8,padding:14,marginBottom:10}}>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 2fr',gap:14}}>
            <div><label style={lbl}>Internal Bill No *</label><input style={inp} value={billNo} onChange={e=>setBillNo(e.target.value)} placeholder="PB/2025-26/001"/></div>
            <div><label style={lbl}>Vendor Invoice No</label><input style={inp} value={vendorBillNo} onChange={e=>setVendorBillNo(e.target.value)} placeholder="Vendor's invoice no"/></div>
            <div><label style={lbl}>Bill Date *</label><input type="date" style={inp} value={billDate} onChange={e=>setBillDate(e.target.value)}/></div>
            <div>
              <label style={lbl}>Purchase Order *</label>
              <select style={{...inp,cursor:'pointer'}} value={selOrder} onChange={e=>setSelOrder(e.target.value)} disabled={!!editBill}>
                <option value="">— Select PO —</option>
                {purchaseOrders.map(o=><option key={o.orderId} value={o.orderId}>{o.poNo||o.poNumber||`PO-${o.orderId}`} · {o.vendorName||'—'}</option>)}
              </select>
            </div>
          </div>
          <div style={{marginTop:12}}>
            <label style={lbl}>Attach Bill Document (PDF/Image)</label>
            <input type="file" accept=".pdf,.png,.jpg,.jpeg" onChange={e=>setBillFile(e.target.files[0]||null)} style={{fontSize:11,fontFamily:F}}/>
          </div>
        </div>
        {order&&(()=>{
          const partyState=order.vendorState||order.shipFromState||'';
          const { lines:bLines, subTotal:bSub, totalCGST:bCGST, totalSGST:bSGST, totalIGST:bIGST, totalGST:bGST, grandTotal:bTotal, intrastate:ist } = calcLines(order, billQtys);
          const existingBills = (billsByOrder[String(selOrder)]||[]).filter(b=>!editBill||String(b.billId)!==String(editBill.billId));
          return (
          <>
            <div style={{display:'grid',gridTemplateColumns:'1fr auto',gap:10,marginBottom:10}}>
              <div style={{background:'#fff',border:'1px solid #000000',borderRadius:8,padding:12}}>
                <div style={{fontWeight:800,fontSize:12,color:'#1E293B',marginBottom:8}}>Vendor Details</div>
                <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:10}}>
                  {[{l:'Vendor',v:order.vendorName},{l:'GSTIN',v:order.vendorGstin},{l:'State',v:partyState},{l:'PO Ref',v:order.poNo||order.poNumber||`PO-${order.orderId}`}].map(x=>(
                    <div key={x.l}><div style={{fontSize:9,color:'#9CA3AF',textTransform:'uppercase',letterSpacing:'0.4px'}}>{x.l}</div>
                      <div style={{fontSize:12,fontWeight:600,color:'#1E293B',marginTop:2}}>{x.v||'—'}</div></div>
                  ))}
                </div>
              </div>
              <div style={{background:ist?'#e8eef8':'#EEF2FF',border:`2px solid ${ist?'#93c5fd':'#A5B4FC'}`,borderRadius:8,padding:'12px 20px',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',minWidth:150}}>
                <div style={{fontSize:22,marginBottom:4}}>{ist?'🏠':'✈ï¸'}</div>
                <div style={{fontSize:12,fontWeight:800,color:ist?'#059669':'#4338CA'}}>{ist?'INTRASTATE':'INTERSTATE'}</div>
                <div style={{fontSize:9,color:'#6B7280',marginTop:3,textAlign:'center'}}>{ist?'CGST + SGST':'IGST'}</div>
                <div style={{fontSize:9,color:'#9CA3AF',marginTop:3}}>{companyState||'?'} → {partyState||'?'}</div>
              </div>
            </div>

            {/* Qty-breakdown items table */}
            <div style={{background:'#fff',border:'1px solid #000000',borderRadius:8,overflow:'hidden',marginBottom:10}}>
              <div style={{background:P,padding:'7px 14px',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <span style={{fontSize:11,fontWeight:800,color:'#fff',textTransform:'uppercase',letterSpacing:'0.6px'}}>Line Items — Qty Breakdown</span>
                <span style={{fontSize:10,color:'rgba(255,255,255,0.75)'}}>Enter qty for this bill. Due = PO Qty − Already Billed.</span>
              </div>
              <div style={{overflowX:'auto'}}>
                <table style={{borderCollapse:'collapse',fontSize:11,fontFamily:F,minWidth:1000,width:'100%'}}>
                  <thead><tr>
                    <TH>#</TH>
                    <TH style={{minWidth:160}}>Item / Description</TH>
                    <TH align="center">HSN</TH>
                    <TH align="center">Unit</TH>
                    <TH align="right" style={{background:'#1e3a5f'}}>PO Qty</TH>
                    <TH align="right" style={{background:'#92400e'}}>Already Billed</TH>
                    <TH align="right" style={{background:'#064e3b'}}>Due Qty</TH>
                    <TH align="right" style={{background:'#133d80',minWidth:100}}>Current Bill Qty</TH>
                    <TH align="right">Rate (₹)</TH>
                    <TH align="right">Taxable (₹)</TH>
                    <TH align="center">GST%</TH>
                    {ist?(<><TH align="right">CGST (₹)</TH><TH align="right">SGST (₹)</TH></>):<TH align="right">IGST (₹)</TH>}
                    <TH align="right">Total (₹)</TH>
                  </tr></thead>
                  <tbody>
                    {(order.items||[]).map((it,i)=>{
                      const poQty=parseFloat(it.qty||it.quantity)||0;
                      const alreadyBilled=alreadyBilledQtys[i]||0;
                      const dueQty=Math.max(0,poQty-alreadyBilled);
                      const curQty=parseFloat(billQtys[i])||0;
                      const l=bLines[i]||{};
                      const overBill=curQty>dueQty&&dueQty>0;
                      return (
                        <tr key={i} style={{background:i%2===0?'#fff':'#f8fafc'}}>
                          <TD align="center" color="#9CA3AF">{i+1}</TD>
                          <TD bold>{it.itemName||it.description||it.name||'—'}</TD>
                          <TD align="center" style={{fontFamily:'monospace',fontSize:10,color:'#555'}}>{it.hsnCode||it.hsn||'—'}</TD>
                          <TD align="center">{it.unit||it.uom||'NOS'}</TD>
                          <TD align="right" bold color="#1e3a5f">{poQty}</TD>
                          <TD align="right" color={alreadyBilled>0?'#92400e':'#9CA3AF'}>{alreadyBilled>0?alreadyBilled:'—'}</TD>
                          <TD align="right" bold color={dueQty===0?'#DC2626':'#065f46'}>{dueQty}</TD>
                          <td style={{padding:'3px 6px',border:'1px solid #000000',textAlign:'right',background:overBill?'#FEF9C3':ist?'#EEF2FF':'#EFF6FF'}}>
                            <input type="number" min="0" step="0.01" value={billQtys[i]??''}
                              onChange={e=>setBillQtys(prev=>{const n=[...prev];n[i]=parseFloat(e.target.value)||0;return n;})}
                              style={{width:80,height:26,padding:'0 6px',border:`1px solid ${overBill?'#F59E0B':'#93C5FD'}`,borderRadius:4,fontSize:11,fontFamily:F,outline:'none',textAlign:'right',fontWeight:700,color:overBill?'#92400e':'#133d80',background:'transparent'}}/>
                            {overBill&&<div style={{fontSize:9,color:'#D97706',marginTop:1}}>Over due qty!</div>}
                          </td>
                          <TD align="right">{fmt(it.rate)}</TD>
                          <TD align="right">{fmt(l.taxable)}</TD>
                          <TD align="center">{l.gstPct}%</TD>
                          {ist?(<><TD align="right" color="#059669">{fmt(l.cgst)}</TD><TD align="right" color="#059669">{fmt(l.sgst)}</TD></>):<TD align="right" color="#4338CA">{fmt(l.igst)}</TD>}
                          <TD align="right" bold color={P}>{fmt(l.total)}</TD>
                        </tr>
                      );
                    })}
                    {(order.items||[]).length===0&&<tr><td colSpan={ist?14:13} style={{textAlign:'center',padding:20,color:'#9CA3AF',fontStyle:'italic'}}>No items in selected PO</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>

            <div style={{display:'flex',justifyContent:'space-between',gap:14,marginBottom:10,flexWrap:'wrap'}}>
              {existingBills.length>0&&(
                <div style={{flex:1,minWidth:280,background:'#fff',border:'1px solid #000000',borderRadius:8,overflow:'hidden'}}>
                  <div style={{background:'#374151',padding:'6px 14px',fontSize:11,fontWeight:800,color:'#fff'}}>
                    Previous Bills for this PO ({existingBills.length})
                  </div>
                  <table style={{borderCollapse:'collapse',fontSize:11,fontFamily:F,width:'100%'}}>
                    <thead><tr>{['Bill No','Vendor Bill No','Date','Total (₹)'].map(h=>(
                      <th key={h} style={{padding:'4px 8px',background:'#f1f5f9',color:'#374151',fontSize:10,fontWeight:700,border:'1px solid #000000'}}>{h}</th>
                    ))}</tr></thead>
                    <tbody>{existingBills.map((b,i)=>(
                      <tr key={b.billId} style={{background:i%2?'#f9fafb':'#fff'}}>
                        <td style={{padding:'4px 8px',border:'1px solid #000000',fontWeight:700,color:P}}>{b.billNo}</td>
                        <td style={{padding:'4px 8px',border:'1px solid #000000',color:'#555'}}>{b.vendorBillNo||'—'}</td>
                        <td style={{padding:'4px 8px',border:'1px solid #000000'}}>{fmtD(b.billDate)}</td>
                        <td style={{padding:'4px 8px',border:'1px solid #000000',textAlign:'right',fontWeight:700,color:P}}>₹{fmt(b.grandTotal)}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              )}
              <div style={{background:'#fff',border:'1px solid #000000',borderRadius:8,overflow:'hidden',minWidth:280}}>
                <div style={{background:P,padding:'6px 14px',fontSize:11,fontWeight:800,color:'#fff',textTransform:'uppercase'}}>This Bill Summary</div>
                <table style={{borderCollapse:'collapse',width:'100%',fontSize:12,fontFamily:F}}>
                  <tbody>
                    <tr><td style={{padding:'7px 14px',borderBottom:'1px solid #F1F5F9',color:'#374151'}}>Taxable</td>
                      <td style={{padding:'7px 14px',borderBottom:'1px solid #F1F5F9',textAlign:'right',fontWeight:600}}>₹{fmt(bSub)}</td></tr>
                    {ist?(<>
                      <tr><td style={{padding:'7px 14px',borderBottom:'1px solid #F1F5F9',color:'#059669'}}>CGST</td>
                        <td style={{padding:'7px 14px',borderBottom:'1px solid #F1F5F9',textAlign:'right',color:'#059669',fontWeight:600}}>₹{fmt(bCGST)}</td></tr>
                      <tr><td style={{padding:'7px 14px',borderBottom:'1px solid #F1F5F9',color:'#059669'}}>SGST</td>
                        <td style={{padding:'7px 14px',borderBottom:'1px solid #F1F5F9',textAlign:'right',color:'#059669',fontWeight:600}}>₹{fmt(bSGST)}</td></tr>
                    </>):(<tr><td style={{padding:'7px 14px',borderBottom:'1px solid #F1F5F9',color:'#4338CA'}}>IGST</td>
                      <td style={{padding:'7px 14px',borderBottom:'1px solid #F1F5F9',textAlign:'right',color:'#4338CA',fontWeight:600}}>₹{fmt(bIGST)}</td></tr>)}
                    <tr style={{background:PL}}><td style={{padding:'9px 14px',fontWeight:800,fontSize:13,color:'#1E293B'}}>Grand Total</td>
                      <td style={{padding:'9px 14px',textAlign:'right',fontWeight:800,fontSize:14,color:P}}>₹{fmt(bTotal)}</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          </>
          );
        })()}
      </div>
    );
  }

  /* ══════ TABS VIEW ══════ */
  return (
    <div style={{fontFamily:F,fontSize:12,padding:10,height:'100%',boxSizing:'border-box',display:'flex',flexDirection:'column'}}>

      {/* PDF Viewer */}
      {pdfViewer&&(
        <div style={{position:'fixed',top:0,left:0,right:0,bottom:0,background:'rgba(0,0,0,0.65)',zIndex:9999,display:'flex',alignItems:'center',justifyContent:'center'}} onClick={()=>setPdfViewer(null)}>
          <div style={{background:'#fff',borderRadius:10,overflow:'hidden',width:'88vw',maxWidth:900,height:'88vh',display:'flex',flexDirection:'column'}} onClick={e=>e.stopPropagation()}>
            <div style={{background:P,color:'#fff',padding:'8px 14px',display:'flex',justifyContent:'space-between',alignItems:'center',flexShrink:0}}>
              <span style={{fontSize:12,fontWeight:700}}>{pdfViewer.name}</span>
              <div style={{display:'flex',gap:8}}>
                <a href={pdfViewer.url+'&dl=1'} download style={{padding:'3px 10px',background:'rgba(255,255,255,0.2)',color:'#fff',borderRadius:4,fontSize:11,textDecoration:'none'}}>⬇ Download</a>
                <button onClick={()=>setPdfViewer(null)} style={{background:'rgba(255,255,255,0.2)',border:'none',color:'#fff',cursor:'pointer',fontSize:14,padding:'2px 8px',borderRadius:4}}>✕</button>
              </div>
            </div>
            <div style={{flex:1,overflow:'auto',display:'flex',alignItems:'center',justifyContent:'center',background:'#f1f5f9'}}>
              {isPDF(pdfViewer.name)?<iframe src={pdfViewer.url} style={{width:'100%',height:'100%',border:'none'}} title="PDF"/>
                :isImage(pdfViewer.name)?<img src={pdfViewer.url} alt="Bill" style={{maxWidth:'100%',maxHeight:'100%',objectFit:'contain'}}/>
                :<div style={{color:'#6B7280',fontSize:12}}>Preview not available. <a href={pdfViewer.url+'&dl=1'}>Download</a></div>}
            </div>
          </div>
        </div>
      )}

      {/* Bill detail modal */}
      {viewBill&&(
        <div style={{position:'fixed',top:0,left:0,right:0,bottom:0,background:'rgba(0,0,0,0.5)',zIndex:999,display:'flex',alignItems:'center',justifyContent:'center'}} onClick={()=>setViewBill(null)}>
          <div style={{background:'#fff',borderRadius:10,padding:20,width:'82vw',maxWidth:780,maxHeight:'85vh',overflowY:'auto'}} onClick={e=>e.stopPropagation()}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14}}>
              <div>
                <div style={{fontSize:16,fontWeight:800,color:P}}>{viewBill.billNo}</div>
                <div style={{fontSize:11,color:'#6B7280'}}>Vendor Invoice: {viewBill.vendorBillNo||'—'} · {fmtD(viewBill.billDate)}</div>
              </div>
              <div style={{display:'flex',gap:8}}>
                {canApproveBill(viewBill)&&(
                  <button onClick={()=>handleApproveBill(viewBill)}
                    style={{padding:'4px 12px',background:'#16A34A',color:'#fff',border:'1px solid #15803D',borderRadius:5,cursor:'pointer',fontSize:11,fontFamily:F,fontWeight:700}}>✓ Approve</button>
                )}
                <button onClick={()=>{setViewBill(null);openEditBill(viewBill);}}
                  style={{padding:'4px 12px',background:'#EEF2FF',color:'#4338CA',border:'1px solid #C7D2FE',borderRadius:5,cursor:'pointer',fontSize:11,fontFamily:F,fontWeight:600}}>✏ï¸ Edit</button>
                <button onClick={()=>setViewBill(null)}
                  style={{padding:'4px 12px',background:'#F1F5F9',color:'#374151',border:'1px solid #E2E8F0',borderRadius:5,cursor:'pointer',fontSize:11,fontFamily:F}}>Close</button>
              </div>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:10,marginBottom:14,background:'#f8fafc',borderRadius:8,padding:12}}>
              {[{l:'Vendor',v:viewBill.partyName},{l:'PO No',v:viewBill.orderNo},{l:'GST',v:viewBill.gstType==='intrastate'?'CGST+SGST':'IGST'}].map(x=>(
                <div key={x.l}><div style={{fontSize:9,color:'#9CA3AF',textTransform:'uppercase'}}>{x.l}</div>
                  <div style={{fontSize:12,fontWeight:600,color:'#1E293B',marginTop:2}}>{x.v||'—'}</div></div>
              ))}
            </div>
            <table style={{borderCollapse:'collapse',fontSize:11,fontFamily:F,width:'100%',marginBottom:12}}>
              <thead><tr>{['Item','Qty','Rate','Taxable','GST','Total'].map(h=>(
                <th key={h} style={{padding:'5px 8px',background:P,color:'#fff',fontSize:10,fontWeight:700,textAlign:h==='Item'?'left':'right',border:'1px solid #1a3a9f'}}>{h}</th>
              ))}</tr></thead>
              <tbody>{(viewBill.items||[]).map((l,i)=>(
                <tr key={i} style={{background:i%2?'#f9fafb':'#fff'}}>
                  <td style={{padding:'4px 8px',border:'1px solid #000000',fontWeight:600}}>{l.description||l.itemName||'—'}</td>
                  <td style={{padding:'4px 8px',border:'1px solid #000000',textAlign:'right'}}>{l.qty}</td>
                  <td style={{padding:'4px 8px',border:'1px solid #000000',textAlign:'right'}}>₹{fmt(l.rate)}</td>
                  <td style={{padding:'4px 8px',border:'1px solid #000000',textAlign:'right'}}>₹{fmt(l.taxable)}</td>
                  <td style={{padding:'4px 8px',border:'1px solid #000000',textAlign:'right',color:'#7C3AED'}}>₹{fmt(l.gstAmt)}</td>
                  <td style={{padding:'4px 8px',border:'1px solid #000000',textAlign:'right',fontWeight:700,color:P}}>₹{fmt(l.total)}</td>
                </tr>
              ))}</tbody>
              <tfoot><tr style={{background:'#e8eef8'}}>
                <td colSpan={3} style={{padding:'6px 8px',border:'1px solid #000000',fontWeight:700}}>Grand Total</td>
                <td style={{padding:'6px 8px',border:'1px solid #000000',textAlign:'right',fontWeight:700}}>₹{fmt(viewBill.subTotal)}</td>
                <td style={{padding:'6px 8px',border:'1px solid #000000',textAlign:'right',fontWeight:700,color:'#7C3AED'}}>₹{fmt(viewBill.totalGST)}</td>
                <td style={{padding:'6px 8px',border:'1px solid #000000',textAlign:'right',fontWeight:800,color:P}}>₹{fmt(viewBill.grandTotal)}</td>
              </tr></tfoot>
            </table>
            {(viewBill.attachments||[]).length>0&&(
              <div>
                <div style={{fontSize:11,fontWeight:700,color:'#374151',marginBottom:8}}>Attachments</div>
                <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                  {viewBill.attachments.map((att,i)=>{
                    const name=att.fileName||att;
                    return <button key={i} onClick={()=>setPdfViewer({url:billFileUrl(viewBill.billId,name,cid),name})}
                      style={{padding:'3px 10px',background:'#EEF2FF',color:'#4338CA',border:'1px solid #C7D2FE',borderRadius:4,cursor:'pointer',fontSize:11,fontFamily:F}}>
                      👁 {name}</button>;
                  })}
                </div>
              </div>
            )}
            <div style={{marginTop:14}}>
              <AuditTrail audit={viewBill.audit} title="Activity Log" compact />
            </div>
          </div>
        </div>
      )}

      {/* Header — title, tabs, search, FY filter and actions on ONE line */}
      <div style={{background:P,color:'#fff',padding:'6px 12px',borderRadius:'7px 7px 0 0',display:'flex',alignItems:'center',gap:10,flexShrink:0,flexWrap:'nowrap',overflowX:'auto'}}>
        <div style={{fontSize:14,fontWeight:800,whiteSpace:'nowrap',marginRight:4}}>🛒 Purchase Bills</div>
        {[{key:'orders',label:'📊 PO Dashboard',cnt:purchaseOrders.length},
          {key:'bills',label:'📄 Purchase Bills',cnt:bills.length},
        ].map(t=>(
          <button key={t.key} onClick={()=>setTab(t.key)}
            style={{height:28,padding:'0 12px',fontSize:11.5,fontWeight:tab===t.key?800:600,cursor:'pointer',fontFamily:F,whiteSpace:'nowrap',borderRadius:6,
              background:tab===t.key?'rgba(255,255,255,0.25)':'rgba(255,255,255,0.08)',border:`1px solid ${tab===t.key?'rgba(255,255,255,0.6)':'rgba(255,255,255,0.25)'}`,color:'#fff'}}>
            {t.label}
            <span style={{marginLeft:5,background:'rgba(255,255,255,0.2)',color:'#fff',borderRadius:10,padding:'1px 7px',fontSize:9,fontWeight:700}}>{t.cnt}</span>
          </button>
        ))}
        <div style={{width:1,height:20,background:'rgba(255,255,255,0.25)',flexShrink:0}}/>
        {/* search for the open tab */}
        <div style={{display:'flex',alignItems:'center',border:'1px solid #d1d5db',borderRadius:6,background:'#fff',height:28,padding:'0 8px',gap:6,flex:'1 1 220px',minWidth:180,maxWidth:340}}>
          <span style={{fontSize:12,color:'#9ca3af'}}>🔍</span>
          {tab==='orders' ? (
            <input value={ordSearch} onChange={e=>setOrdSearch(e.target.value)} placeholder="Search PO No, vendor, client, order ID…"
              style={{border:'none',outline:'none',fontSize:12,fontFamily:F,flex:1,minWidth:0,background:'transparent',color:'#374151'}}/>
          ) : (
            <input value={pbSearch} onChange={e=>setPbSearch(e.target.value)} placeholder="Search bills, vendor, PO…"
              style={{border:'none',outline:'none',fontSize:12,fontFamily:F,flex:1,minWidth:0,background:'transparent',color:'#374151'}}/>
          )}
          {(tab==='orders'?ordSearch:pbSearch)&&<button onClick={()=>tab==='orders'?setOrdSearch(''):setPbSearch('')} style={{background:'none',border:'none',cursor:'pointer',fontSize:13,color:'#9ca3af'}}>×</button>}
        </div>
        {/* FY filter for the open tab */}
        <div style={{display:'flex',gap:4,alignItems:'center',flexShrink:0}}>
          {['all',...(tab==='orders'?fyPOList:fyBillList)].map(f=>{
            const on = (tab==='orders'?poFy:pbFy)===f;
            return (
              <button key={f} onClick={()=>tab==='orders'?setPoFy(f):setPbFy(f)}
                style={{height:28,padding:'0 9px',borderRadius:6,border:`1px solid ${on?'rgba(255,255,255,0.6)':'rgba(255,255,255,0.25)'}`,background:on?'rgba(255,255,255,0.25)':'rgba(255,255,255,0.08)',color:'#fff',fontSize:11,fontWeight:on?800:600,cursor:'pointer',fontFamily:F,whiteSpace:'nowrap'}}>
                {f==='all'?'All FY':`FY ${f}`}
              </button>
            );
          })}
        </div>
        <div style={{flex:1}}/>
        {tab==='bills'&&(
          <button onClick={doPrintBills}
            style={{height:28,padding:'0 12px',background:'rgba(255,255,255,0.15)',border:'1px solid rgba(255,255,255,0.35)',borderRadius:6,cursor:'pointer',color:'#fff',fontSize:11,fontWeight:700,fontFamily:F,whiteSpace:'nowrap'}}>
            🖨 Print
          </button>
        )}
        <button onClick={()=>setView('create-bill')} style={{height:28,padding:'0 14px',background:'rgba(255,255,255,0.15)',border:'1px solid rgba(255,255,255,0.35)',color:'#fff',borderRadius:6,cursor:'pointer',fontSize:11,fontWeight:700,fontFamily:F,whiteSpace:'nowrap'}}>📄 New Bill</button>
      </div>

      {/* ── PO Dashboard ── */}
      {tab==='orders'&&(
        <div style={{background:'#fff',border:'1px solid #000000',borderTop:'none',borderRadius:'0 0 7px 7px',flex:1,minHeight:0,display:'flex',flexDirection:'column'}}>
          <div style={{overflow:'auto',flex:1,minHeight:0}}>
            <table style={{borderCollapse:'collapse',width:'100%',fontSize:11,fontFamily:F}}>
              <thead><tr>
                {['#','Order ID','Client','Vendor','PO Date','PO No','Order Qty','Billed Qty','PO Value (₹)','Bills','Actions'].map((h,i)=>(
                  <th key={h} style={{padding:'5px 8px',background:P,color:'#fff',fontSize:10,fontWeight:700,textAlign:i>=6&&i<=8?'right':'left',border:'1px solid #1a3a9f',whiteSpace:'nowrap',position:'sticky',top:0,zIndex:1}}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {loading?(<tr><td colSpan={11} style={{textAlign:'center',padding:30,color:'#9CA3AF',fontStyle:'italic'}}>Loading…</td></tr>)
                :filteredPOs.length===0?(<tr><td colSpan={11} style={{textAlign:'center',padding:36,color:'#9CA3AF',fontStyle:'italic'}}>No purchase orders found.</td></tr>)
                :filteredPOs.map((po,i)=>{
                  const so=soMap[String(po.linkedSalesOrderId)];
                  const clientName=so?.customerName||so?.clientName||'—';
                  const orderBills=billsByOrder[String(po.orderId)]||[];
                  const fullyBilled=isFullyBilled(po);
                  const oQty=poOrderQty(po), bQty=poBilledQty(po);
                  return (
                    <tr key={po.orderId} style={{background:'#fff',transition:'background 0.1s'}}
                      onMouseEnter={e=>e.currentTarget.style.background='#f5f5f5'}
                      onMouseLeave={e=>e.currentTarget.style.background='#fff'}>
                      <td style={{padding:'4px 8px',border:'1px solid #000000',color:'#000',textAlign:'center'}}>{i+1}</td>
                      <td style={{padding:'4px 8px',border:'1px solid #000000',fontWeight:700,color:'#000'}}>
                        {so?.orderNo || (po.linkedSalesOrderId?`SO#${po.linkedSalesOrderId}`:'—')}
                      </td>
                      <td style={{padding:'4px 8px',border:'1px solid #000000',fontWeight:600,color:'#000',maxWidth:220,wordBreak:'break-word'}}>{clientName}</td>
                      <td style={{padding:'4px 8px',border:'1px solid #000000',color:'#000',maxWidth:220,wordBreak:'break-word'}}>{po.vendorName||'—'}</td>
                      <td style={{padding:'4px 8px',border:'1px solid #000000',color:'#000',whiteSpace:'nowrap'}}>{fmtD(po.poDate)}</td>
                      <td style={{padding:'4px 8px',border:'1px solid #000000',fontWeight:600,color:'#000',whiteSpace:'nowrap'}}>{po.poNo||po.poNumber||`PO-${po.orderId}`}</td>
                      <td style={{padding:'4px 8px',border:'1px solid #000000',textAlign:'right',fontWeight:700,color:'#000'}}>{oQty.toFixed(2)}</td>
                      <td style={{padding:'4px 8px',border:'1px solid #000000',textAlign:'right',fontWeight:700,color:'#000'}}>
                        {bQty.toFixed(2)}
                      </td>
                      <td style={{padding:'4px 8px',border:'1px solid #000000',textAlign:'right',fontWeight:700,color:'#000'}}>₹{fmt(po.grandTotal||po.totalAmount||0)}</td>
                      <td style={{padding:'4px 8px',border:'1px solid #000000'}}>
                        {orderBills.length>0?(
                          <span style={{fontSize:10,background:'#EEF2FF',color:'#4338CA',padding:'1px 7px',borderRadius:10,fontWeight:700,cursor:'pointer',whiteSpace:'nowrap'}}
                            onClick={()=>{setPbSearch(po.poNo||po.poNumber||`PO-${po.orderId}`);setTab('bills');}}>
                            {orderBills.length} bill{orderBills.length>1?'s':''}
                          </span>
                        ):<span style={{fontSize:10,color:'#D1D5DB'}}>—</span>}
                      </td>
                      <td style={{padding:'4px 8px',border:'1px solid #000000'}} onClick={e=>e.stopPropagation()}>
                        <div style={{display:'flex',gap:5,flexWrap:'wrap'}}>
                          {fullyBilled?(
                            <span style={{padding:'2px 8px',background:'#DCFCE7',color:'#166534',borderRadius:10,fontSize:10,fontWeight:700,border:'1px solid #BBF7D0',whiteSpace:'nowrap'}}>✅ All Invoice Received</span>
                          ):(
                            <button onClick={()=>openCreateForOrder(po)}
                              style={{padding:'2px 8px',background:'#EEF2FF',color:'#4338CA',border:'1px solid #C7D2FE',borderRadius:4,cursor:'pointer',fontSize:10,fontWeight:700,fontFamily:F,whiteSpace:'nowrap'}}>
                              📄 Bill
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Purchase Bills Tab ── */}
      {tab==='bills'&&(
        <div style={{background:'#fff',border:'1px solid #000000',borderTop:'none',borderRadius:'0 0 7px 7px',flex:1,minHeight:0,display:'flex',flexDirection:'column'}}>
          {/* ── Action Bar ── */}
          {selPBill && (
            <div style={{background:'linear-gradient(90deg,#133d80,#133d80)',padding:'5px 12px',display:'flex',alignItems:'center',gap:8}}>
              <span style={{fontSize:11,color:'rgba(255,255,255,0.8)'}}>▶</span>
              <span style={{fontSize:12,fontWeight:700,color:'#fff',flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                {selPBill.billNo} · {selPBill.partyName||''}
              </span>
              {[
                {label:'👁 View',   fn:()=>setViewBill(selPBill)},
                ...(canApproveBill(selPBill)?[{label:'✓ Approve', fn:()=>handleApproveBill(selPBill), ok:true}]:[]),
                {label:'✏ï¸ Edit',   fn:()=>openEditBill(selPBill)},
                {label:'🗑 Delete', fn:()=>handleDeleteBill(selPBill.billId), danger:true},
              ].map(btn=>(
                <button key={btn.label} onClick={btn.fn}
                  style={{height:26,padding:'0 10px',fontSize:11,cursor:'pointer',fontFamily:F,fontWeight:700,borderRadius:5,whiteSpace:'nowrap',border:'none',background:btn.danger?'rgba(220,38,38,0.35)':btn.ok?'#16A34A':'rgba(255,255,255,0.18)',color:'#fff'}}>
                  {btn.label}
                </button>
              ))}
              <button onClick={()=>setSelPBill(null)}
                style={{height:26,width:26,background:'rgba(255,255,255,0.15)',border:'none',color:'#fff',borderRadius:5,cursor:'pointer',fontSize:13}}>✕</button>
            </div>
          )}
          <div style={{overflow:'auto',flex:1,minHeight:0}}>
            <table style={{borderCollapse:'collapse',width:'100%',fontSize:11,fontFamily:F}}>
              <thead style={{position:'sticky',top:0,zIndex:3}}><tr>
                {['#','Order File No','Client','Vendor','PO No','Vendor Bill Date','Vendor Bill No','Material','Qty','Rate (₹)','Taxable (₹)','GST (₹)','Invoice Value (₹)','GST Type','Status'].map((h,i)=>(
                  <th key={h} style={{padding:'7px 10px',background:P,color:'#fff',fontSize:10,fontWeight:700,
                    textAlign:i===8?'center':i>=9&&i<=12?'right':i===14?'center':(i===0?'center':'left'),
                    border:'1px solid #1a3a9f',whiteSpace:'nowrap',...(i===0?{width:36}:{})}}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {loading?(<tr><td colSpan={15} style={{textAlign:'center',padding:30,color:'#9CA3AF',fontStyle:'italic'}}>Loading…</td></tr>)
                :filteredBills.length===0?(<tr><td colSpan={15} style={{textAlign:'center',padding:36,color:'#9CA3AF',fontStyle:'italic'}}>No purchase bills yet. Click "New Bill" or use the PO Dashboard.</td></tr>)
                :[...filteredBills].sort((a,b)=>new Date(b.createdAt||0)-new Date(a.createdAt||0)).map((b,i)=>{
                  const isSel=selPBill?.billId===b.billId; const rowBg=isSel?'#EEF4FF':'#fff';
                  const po = purchaseOrders.find(o=>String(o.orderId)===String(b.orderId));
                  const so = soMap[String(po?.linkedSalesOrderId)];
                  const items = b.items||[];
                  const matQty = items.reduce((s,it)=>s+(parseFloat(it.qty)||0),0);
                  const material = items.length
                    ? (items[0].description||items[0].itemName||'—') + (items.length>1?` +${items.length-1} more`:'')
                    : '—';
                  const matRate = items.length ? (parseFloat(items[0].rate)||0) : null;
                  return (
                  <tr key={b.billId} style={{background:rowBg,cursor:'pointer',transition:'background 0.1s',outline:isSel?`2px solid ${P}`:'none',outlineOffset:'-2px'}}
                    onMouseEnter={e=>{if(!isSel)e.currentTarget.style.background='#f5f5f5';}}
                    onMouseLeave={e=>{e.currentTarget.style.background=rowBg;}}
                    onClick={()=>setActivityRec(b)}>
                    <td style={{padding:'3px 8px',border:'1px solid #000000',textAlign:'center',fontWeight:700,color:isSel?'#fff':'#000',background:isSel?P:'transparent',cursor:'pointer',fontSize:11}}
                      onClick={e=>{e.stopPropagation();setSelPBill(s=>s?.billId===b.billId?null:b);}}>
                      {isSel?'✓':i+1}
                    </td>
                    <td style={{padding:'3px 8px',border:'1px solid #000000',color:'#000'}}>{so?.orderNo||'—'}</td>
                    <td style={{padding:'3px 8px',border:'1px solid #000000',color:'#000',maxWidth:130,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{so?.customerName||so?.clientName||'—'}</td>
                    <td style={{padding:'3px 8px',border:'1px solid #000000',fontWeight:600,color:'#000',maxWidth:130,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{b.partyName}</td>
                    <td style={{padding:'3px 8px',border:'1px solid #000000',color:'#000'}}>{b.orderNo||'—'}</td>
                    <td style={{padding:'3px 8px',border:'1px solid #000000',color:'#000',whiteSpace:'nowrap'}}>{fmtD(b.billDate)}</td>
                    <td style={{padding:'3px 8px',border:'1px solid #000000',color:'#000'}}>{b.vendorBillNo||'—'}</td>
                    <td style={{padding:'3px 8px',border:'1px solid #000000',color:'#000',maxWidth:160,wordBreak:'break-word'}}>{material}</td>
                    <td style={{padding:'3px 8px',border:'1px solid #000000',textAlign:'center',fontWeight:700,color:'#000'}}>{matQty||'—'}</td>
                    <td style={{padding:'3px 8px',border:'1px solid #000000',textAlign:'right',color:'#000'}}>{matRate!==null?fmt(matRate):'—'}</td>
                    <td style={{padding:'3px 8px',border:'1px solid #000000',textAlign:'right',color:'#000'}}>{fmt(b.subTotal)}</td>
                    <td style={{padding:'3px 8px',border:'1px solid #000000',textAlign:'right',color:'#000'}}>{fmt(b.totalGST)}</td>
                    <td style={{padding:'3px 8px',border:'1px solid #000000',textAlign:'right',fontWeight:700,color:'#000'}}>{fmt(b.grandTotal)}</td>
                    <td style={{padding:'3px 8px',border:'1px solid #000000',color:'#000',whiteSpace:'nowrap'}}>
                      {b.gstType==='intrastate'?'CGST+SGST':'IGST'}
                    </td>
                    <td style={{padding:'3px 8px',border:'1px solid #000000',textAlign:'center'}}>
                      <Badge s={b.status}/>
                    </td>
                  </tr>
                );})}
              </tbody>
              {filteredBills.length>0&&(
                <tfoot style={{position:'sticky',bottom:0,zIndex:2}}><tr style={{background:'#f0f0f0',fontWeight:700}}>
                  <td colSpan={10} style={{padding:'4px 8px',border:'1px solid #000000',fontWeight:800,color:'#000'}}>TOTAL ({filteredBills.length} bills{pbFy!=='all'?` · FY ${pbFy}`:''})</td>
                  <td style={{padding:'4px 8px',border:'1px solid #000000',textAlign:'right',fontWeight:800,color:'#000'}}>{fmt(filteredBills.reduce((s,b)=>s+(parseFloat(b.subTotal)||0),0))}</td>
                  <td style={{padding:'4px 8px',border:'1px solid #000000',textAlign:'right',fontWeight:800,color:'#000'}}>{fmt(filteredBills.reduce((s,b)=>s+(parseFloat(b.totalGST)||0),0))}</td>
                  <td style={{padding:'4px 8px',border:'1px solid #000000',textAlign:'right',fontWeight:800,color:'#000'}}>{fmt(filteredBills.reduce((s,b)=>s+(parseFloat(b.grandTotal)||0),0))}</td>
                  <td colSpan={2} style={{padding:'4px 8px',border:'1px solid #000000'}}/>
                </tr></tfoot>
              )}
            </table>
          </div>
        </div>
      )}


      <ActivityDrawer record={activityRec} recordType="pb" onClose={()=>setActivityRec(null)} />
    </div>
  );
}
