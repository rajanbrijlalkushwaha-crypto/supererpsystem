import { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import { useCompany } from '../../context/CompanyContext';
import AuditTrail from '../../components/AuditTrail';
import ActivityDrawer from '../../components/ActivityDrawer';

const F  = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const P  = '#104f4f';
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
  <th style={{ padding:'6px 8px', background:bg, color:'#fff', fontSize:10, fontWeight:700, textAlign:align, border:`1px solid ${bg==='#065f46'?'#047857':'#0b3d3d'}`, whiteSpace:'nowrap', ...style }}>{children}</th>
);
const TD = ({children, align='left', bold, color, style={}}) => (
  <td style={{ padding:'4px 8px', fontSize:11, border:'1px solid #e2e8f0', textAlign:align, fontWeight:bold?700:400, color:color||'#111827', verticalAlign:'middle', fontFamily:F, ...style }}>{children}</td>
);

export default function PurchaseBill() {
  const { selectedCompany } = useCompany();
  const cid = selectedCompany?.companyId;
  const companyState = selectedCompany?.state || '';

  const [tab,  setTab]  = useState('orders');
  const [view, setView] = useState('tab');

  const [purchaseOrders, setPOs]    = useState([]);
  const [salesOrders,    setSOs]    = useState([]);
  const [bills,          setBills]  = useState([]);
  const [grns,           setGrns]   = useState([]);
  const [gdns,           setGdns]   = useState([]);
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

  // GRN form
  const [editGRN,        setEditGRN]       = useState(null);
  const [grnPO,          setGrnPO]         = useState('');
  const [grnPOData,      setGrnPOData]     = useState(null);
  const [grnDate,        setGrnDate]       = useState(today());
  const [grnReceivedBy,  setGrnReceivedBy] = useState('');
  const [grnRemarks,     setGrnRemarks]    = useState('');
  const [grnItems,       setGrnItems]      = useState([]);
  const [grnSaving,      setGrnSaving]     = useState(false);
  const [grnMsg,         setGrnMsg]        = useState('');
  const [grnDeliveryType,setGrnDeliveryType]=useState('our-yard'); // 'our-yard'|'direct-client'|'to-vendor'
  const [grnLocation,    setGrnLocation]   = useState('');
  const [grnClientId,    setGrnClientId]   = useState('');
  const [grnToVendorName,setGrnToVendorName]=useState('');

  // GDN form
  const [editGDN,        setEditGDN]       = useState(null);
  const [gdnDate,        setGdnDate]       = useState(today());
  const [gdnDispatchedBy,setGdnDispatchedBy]=useState('');
  const [gdnFromType,    setGdnFromType]   = useState('our-yard'); // 'our-yard'|'vendor'
  const [gdnFromName,    setGdnFromName]   = useState('');
  const [gdnFromPO,      setGdnFromPO]     = useState('');
  const [gdnToType,      setGdnToType]     = useState('client');   // 'client'|'vendor'|'other'
  const [gdnToClientId,  setGdnToClientId] = useState('');
  const [gdnToName,      setGdnToName]     = useState('');
  const [gdnVehicleNo,   setGdnVehicleNo]  = useState('');
  const [gdnLrNo,        setGdnLrNo]       = useState('');
  const [gdnTransporter, setGdnTransporter]= useState('');
  const [gdnRemarks,     setGdnRemarks]    = useState('');
  const [gdnItems,       setGdnItems]      = useState([{itemName:'',hsnCode:'',unit:'NOS',qty:1,rate:0,remarks:''}]);
  const [gdnSaving,      setGdnSaving]     = useState(false);
  const [gdnMsg,         setGdnMsg]        = useState('');

  // UI
  const [viewBill,     setViewBill]     = useState(null);
  const [selPBill,     setSelPBill]     = useState(null);
  const [pbFy,         setPbFy]         = useState('all');
  const [activityRec,  setActivityRec]  = useState(null);
  const [pdfViewer,    setPdfViewer]    = useState(null);
  const [ordSearch,  setOrdSearch] = useState('');
  const [pbSearch,   setPbSearch]  = useState('');
  const [grnSearch,  setGrnSearch] = useState('');
  const [gdnSearch,  setGdnSearch] = useState('');
  const [poFy,       setPoFy]      = useState('all');

  const load = useCallback(async () => {
    if (!cid) return;
    setLoading(true);
    try {
      const [poR, soR, bR, grnR, gdnR, clientR, vendorR] = await Promise.all([
        axios.get(`/api/purchase-orders?companyId=${cid}`).catch(()=>({data:[]})),
        axios.get(`/api/sales-orders?companyId=${cid}`).catch(()=>({data:[]})),
        axios.get(`/api/bills?companyId=${cid}&type=purchase`).catch(()=>({data:[]})),
        axios.get(`/api/grn?companyId=${cid}`).catch(()=>({data:[]})),
        axios.get(`/api/gdn?companyId=${cid}`).catch(()=>({data:[]})),
        axios.get(`/api/clients?companyId=${cid}`).catch(()=>({data:[]})),
        axios.get(`/api/vendors?companyId=${cid}`).catch(()=>({data:[]})),
      ]);
      setPOs((poR.data||[]).filter(o => !['draft','rejected'].includes(o.status)));
      setSOs(soR.data||[]);
      setBills(bR.data||[]);
      setGrns(grnR.data||[]);
      setGdns(gdnR.data||[]);
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

  const grnsByPO = useMemo(() => {
    const m = {};
    grns.forEach(g => { const k=String(g.poId); if(!m[k]) m[k]=[]; m[k].push(g); });
    return m;
  }, [grns]);

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

  useEffect(() => {
    if (!grnPO) { setGrnPOData(null); setGrnItems([]); return; }
    const mkItems = po => (po.items||[]).map(it => ({
      itemName:   it.itemName||it.description||it.name||'—',
      hsnCode:    it.hsnCode||it.hsn||'',
      unit:       it.unit||it.uom||'NOS',
      orderedQty: parseFloat(it.qty||it.quantity)||0,
      rate:       parseFloat(it.rate)||0,
      receivedQty:parseFloat(it.qty||it.quantity)||0,
      remarks:    '',
    }));
    axios.get(`/api/purchase-orders/${grnPO}?companyId=${cid}`)
      .then(r => { setGrnPOData(r.data); if (!editGRN) setGrnItems(mkItems(r.data)); })
      .catch(() => {
        const po = purchaseOrders.find(o=>String(o.orderId)===String(grnPO));
        setGrnPOData(po||null);
        if (po && !editGRN) setGrnItems(mkItems(po));
      });
  }, [grnPO, cid, purchaseOrders, editGRN]);

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

  const openCreateGRN = (po=null) => {
    setEditGRN(null); setGrnPO(po?String(po.orderId):'');
    setGrnDate(today()); setGrnReceivedBy(''); setGrnRemarks(''); setGrnMsg('');
    setGrnDeliveryType('our-yard'); setGrnLocation(''); setGrnClientId(''); setGrnToVendorName('');
    if (!po) setGrnItems([]);
    setView('create-grn');
  };

  const openEditGRN = (g) => {
    setEditGRN(g); setGrnPO(String(g.poId));
    setGrnDate(g.receiptDate||today()); setGrnReceivedBy(g.receivedBy||'');
    setGrnRemarks(g.remarks||''); setGrnItems(g.items||[]); setGrnMsg('');
    setGrnDeliveryType(g.deliveryType||'our-yard'); setGrnLocation(g.deliveryLocation||'');
    setGrnClientId(g.clientId||''); setGrnToVendorName(g.toVendorName||'');
    setView('create-grn');
  };

  const openCreateGDN = () => {
    setEditGDN(null); setGdnDate(today()); setGdnDispatchedBy('');
    setGdnFromType('our-yard'); setGdnFromName(''); setGdnFromPO('');
    setGdnToType('client'); setGdnToClientId(''); setGdnToName('');
    setGdnVehicleNo(''); setGdnLrNo(''); setGdnTransporter(''); setGdnRemarks('');
    setGdnItems([{itemName:'',hsnCode:'',unit:'NOS',qty:1,rate:0,remarks:''}]); setGdnMsg('');
    setView('create-gdn');
  };

  const openEditGDN = (g) => {
    setEditGDN(g); setGdnDate(g.date||today()); setGdnDispatchedBy(g.dispatchedBy||'');
    setGdnFromType(g.fromType||'our-yard'); setGdnFromName(g.fromName||''); setGdnFromPO(g.poRef||'');
    setGdnToType(g.toType||'client'); setGdnToClientId(g.toClientId||''); setGdnToName(g.toName||'');
    setGdnVehicleNo(g.vehicleNo||''); setGdnLrNo(g.lrNo||''); setGdnTransporter(g.transporter||'');
    setGdnRemarks(g.remarks||''); setGdnItems(g.items||[]); setGdnMsg('');
    setView('create-gdn');
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

  const handleSaveGRN = async () => {
    if (!grnPO) { setGrnMsg('Select a Purchase Order'); return; }
    setGrnSaving(true); setGrnMsg('');
    try {
      const po = grnPOData || purchaseOrders.find(o=>String(o.orderId)===String(grnPO));
      const clientObj = clients.find(c=>String(c.clientId||c._id||c.id)===String(grnClientId));
      const payload = {
        companyId:cid, poId:grnPO, poNo:po?.poNo||po?.poNumber||`PO-${grnPO}`,
        vendorName:po?.vendorName||'—', vendorId:po?.vendorId||'',
        receiptDate:grnDate, receivedBy:grnReceivedBy, remarks:grnRemarks, items:grnItems,
        deliveryType:grnDeliveryType, deliveryLocation:grnLocation,
        clientId:grnClientId, clientName:clientObj?.clientName||clientObj?.name||'',
        toVendorName:grnToVendorName,
      };
      if (editGRN) { await axios.put(`/api/grn/${editGRN.grnId}?companyId=${cid}`, payload); }
      else         { await axios.post(`/api/grn?companyId=${cid}`, payload); }
      setGrnMsg(editGRN?'GRN updated!':'GRN saved!');
      await load();
      setTimeout(()=>{ setView('tab'); setTab('grn'); setGrnMsg(''); setGrnPO(''); setEditGRN(null); },900);
    } catch(e) { setGrnMsg('Error: '+(e.response?.data?.error||e.message)); }
    setGrnSaving(false);
  };

  const handleSaveGDN = async () => {
    setGdnSaving(true); setGdnMsg('');
    try {
      const clientObj = clients.find(c=>String(c.clientId||c._id||c.id)===String(gdnToClientId));
      const payload = {
        companyId:cid, date:gdnDate, dispatchedBy:gdnDispatchedBy,
        fromType:gdnFromType, fromName:gdnFromName, poRef:gdnFromPO,
        toType:gdnToType, toClientId:gdnToClientId,
        toName:gdnToType==='client'?(clientObj?.clientName||clientObj?.name||gdnToName):gdnToName,
        vehicleNo:gdnVehicleNo, lrNo:gdnLrNo, transporter:gdnTransporter,
        remarks:gdnRemarks, items:gdnItems.filter(it=>it.itemName.trim()),
      };
      if (editGDN) { await axios.put(`/api/gdn/${editGDN.gdnId}?companyId=${cid}`, payload); }
      else         { await axios.post(`/api/gdn?companyId=${cid}`, payload); }
      setGdnMsg(editGDN?'GDN updated!':'GDN saved!');
      await load();
      setTimeout(()=>{ setView('tab'); setTab('gdn'); setGdnMsg(''); setEditGDN(null); },900);
    } catch(e) { setGdnMsg('Error: '+(e.response?.data?.error||e.message)); }
    setGdnSaving(false);
  };

  const handleDeleteGDN = async (gdnId) => {
    if (!window.confirm(`Delete GDN ${gdnId}?`)) return;
    await axios.delete(`/api/gdn/${gdnId}?companyId=${cid}`).catch(()=>{});
    load();
  };

  const handleDeleteBill = async (billId) => {
    if (!window.confirm(`Delete bill ${billId}?`)) return;
    await axios.delete(`/api/bills/${billId}?companyId=${cid}&type=purchase`).catch(()=>{});
    load();
  };

  const handleDeleteGRN = async (grnId) => {
    if (!window.confirm(`Delete GRN ${grnId}?`)) return;
    await axios.delete(`/api/grn/${grnId}?companyId=${cid}`).catch(()=>{});
    load();
  };

  const poOrderQty    = (po) => (po.items||[]).reduce((s,it)=>s+(parseFloat(it.qty||it.quantity)||0),0);
  const poBilledQty   = (po) => (billsByOrder[String(po.orderId)]||[]).reduce((s,b)=>s+(b.items||[]).reduce((ss,it)=>ss+(parseFloat(it.qty)||0),0),0);
  const poReceivedQty = (po) => (grnsByPO[String(po.orderId)]||[]).reduce((s,g)=>s+(g.items||[]).reduce((ss,it)=>ss+(parseFloat(it.receivedQty)||0),0),0);

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

  const filteredGRNs = useMemo(()=>{
    if (!grnSearch.trim()) return grns;
    const q=grnSearch.toLowerCase();
    return grns.filter(g=>(g.grnNo||'').toLowerCase().includes(q)||(g.vendorName||'').toLowerCase().includes(q)||
      (g.poNo||'').toLowerCase().includes(q));
  },[grns,grnSearch]);

  const filteredGDNs = useMemo(()=>{
    if (!gdnSearch.trim()) return gdns;
    const q=gdnSearch.toLowerCase();
    return gdns.filter(g=>(g.gdnNo||'').toLowerCase().includes(q)||(g.toName||'').toLowerCase().includes(q)||
      (g.fromName||'').toLowerCase().includes(q));
  },[gdns,gdnSearch]);

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
        <div style={{background:'#fff',border:'1px solid #e2e8f0',borderRadius:8,padding:14,marginBottom:10}}>
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
              <div style={{background:'#fff',border:'1px solid #e2e8f0',borderRadius:8,padding:12}}>
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
            <div style={{background:'#fff',border:'1px solid #e2e8f0',borderRadius:8,overflow:'hidden',marginBottom:10}}>
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
                    <TH align="right" style={{background:'#104f4f',minWidth:100}}>Current Bill Qty</TH>
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
                          <td style={{padding:'3px 6px',border:'1px solid #e2e8f0',textAlign:'right',background:overBill?'#FEF9C3':ist?'#EEF2FF':'#EFF6FF'}}>
                            <input type="number" min="0" step="0.01" value={billQtys[i]??''}
                              onChange={e=>setBillQtys(prev=>{const n=[...prev];n[i]=parseFloat(e.target.value)||0;return n;})}
                              style={{width:80,height:26,padding:'0 6px',border:`1px solid ${overBill?'#F59E0B':'#93C5FD'}`,borderRadius:4,fontSize:11,fontFamily:F,outline:'none',textAlign:'right',fontWeight:700,color:overBill?'#92400e':'#104f4f',background:'transparent'}}/>
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
                <div style={{flex:1,minWidth:280,background:'#fff',border:'1px solid #e2e8f0',borderRadius:8,overflow:'hidden'}}>
                  <div style={{background:'#374151',padding:'6px 14px',fontSize:11,fontWeight:800,color:'#fff'}}>
                    Previous Bills for this PO ({existingBills.length})
                  </div>
                  <table style={{borderCollapse:'collapse',fontSize:11,fontFamily:F,width:'100%'}}>
                    <thead><tr>{['Bill No','Vendor Bill No','Date','Total (₹)'].map(h=>(
                      <th key={h} style={{padding:'4px 8px',background:'#f1f5f9',color:'#374151',fontSize:10,fontWeight:700,border:'1px solid #e2e8f0'}}>{h}</th>
                    ))}</tr></thead>
                    <tbody>{existingBills.map((b,i)=>(
                      <tr key={b.billId} style={{background:i%2?'#f9fafb':'#fff'}}>
                        <td style={{padding:'4px 8px',border:'1px solid #e2e8f0',fontWeight:700,color:P}}>{b.billNo}</td>
                        <td style={{padding:'4px 8px',border:'1px solid #e2e8f0',color:'#555'}}>{b.vendorBillNo||'—'}</td>
                        <td style={{padding:'4px 8px',border:'1px solid #e2e8f0'}}>{fmtD(b.billDate)}</td>
                        <td style={{padding:'4px 8px',border:'1px solid #e2e8f0',textAlign:'right',fontWeight:700,color:P}}>₹{fmt(b.grandTotal)}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              )}
              <div style={{background:'#fff',border:'1px solid #e2e8f0',borderRadius:8,overflow:'hidden',minWidth:280}}>
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

  /* ══════ CREATE GRN VIEW ══════ */
  if (view==='create-grn') {
    const dtBg = {'our-yard':'#dcfce7','direct-client':'#dbeafe','to-vendor':'#fef9c3'};
    const dtColor = {'our-yard':GN,'direct-client':'#1d4ed8','to-vendor':'#92400e'};
    const dtLabel = {'our-yard':'🏭 Our Manufacturing Yard','direct-client':'🚛 Direct to Client','to-vendor':'🔄 To Another Vendor'};
    return (
      <div style={{fontFamily:F,fontSize:12,padding:10}}>
        <div style={{background:GN,color:'#fff',padding:'8px 14px',borderRadius:7,display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
          <div>
            <div style={{fontSize:14,fontWeight:800}}>{editGRN?'✏ï¸ Edit GRN':'📦 New Goods Receipt Note (GRN)'}</div>
            <div style={{fontSize:10,opacity:0.7,marginTop:1}}>Record material received from vendor — select where it is delivered</div>
          </div>
          <div style={{display:'flex',gap:8}}>
            <button onClick={()=>{setView('tab');setTab('grn');setEditGRN(null);setGrnPO('');setGrnMsg('');}}
              style={{height:30,padding:'0 14px',background:'rgba(255,255,255,0.15)',border:'1px solid rgba(255,255,255,0.3)',color:'#fff',borderRadius:6,cursor:'pointer',fontSize:12,fontWeight:600,fontFamily:F}}>← Back</button>
            <button onClick={handleSaveGRN} disabled={grnSaving}
              style={{height:30,padding:'0 18px',background:'#F59E0B',border:'none',borderRadius:6,cursor:grnSaving?'not-allowed':'pointer',color:'#fff',fontSize:12,fontWeight:800,fontFamily:F,opacity:grnSaving?0.7:1}}>
              {grnSaving?'Saving…':editGRN?'✔ Update GRN':'✔ Save GRN'}
            </button>
          </div>
        </div>
        {grnMsg&&<div style={{marginBottom:10,padding:'8px 12px',borderRadius:6,fontSize:12,background:grnMsg.startsWith('Error')?'#FEF2F2':'#dcfce7',color:grnMsg.startsWith('Error')?'#DC2626':'#166534',border:`1px solid ${grnMsg.startsWith('Error')?'#FECACA':'#bbf7d0'}`}}>{grnMsg}</div>}

        {/* Header fields */}
        <div style={{background:'#fff',border:'1px solid #e2e8f0',borderRadius:8,padding:14,marginBottom:10}}>
          <div style={{display:'grid',gridTemplateColumns:'2fr 1fr 1fr',gap:14,marginBottom:12}}>
            <div>
              <label style={lbl}>Purchase Order (Dispatch From Vendor) *</label>
              <select style={{...inp,cursor:'pointer'}} value={grnPO} onChange={e=>setGrnPO(e.target.value)} disabled={!!editGRN}>
                <option value="">— Select PO —</option>
                {purchaseOrders.map(o=><option key={o.orderId} value={o.orderId}>{o.poNo||o.poNumber||`PO-${o.orderId}`} · {o.vendorName||'—'}</option>)}
              </select>
              {grnPOData&&<div style={{fontSize:10,color:GN,marginTop:4,fontWeight:600}}>📦 Dispatch From: {grnPOData.vendorName||'—'}</div>}
            </div>
            <div><label style={lbl}>Receipt Date *</label><input type="date" style={inp} value={grnDate} onChange={e=>setGrnDate(e.target.value)}/></div>
            <div><label style={lbl}>Received By</label><input style={inp} value={grnReceivedBy} onChange={e=>setGrnReceivedBy(e.target.value)} placeholder="Name of receiver"/></div>
          </div>

          {/* Delivery To */}
          <div style={{marginBottom:12}}>
            <label style={lbl}>Delivery To *</label>
            <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
              {['our-yard','direct-client','to-vendor'].map(dt=>(
                <button key={dt} onClick={()=>setGrnDeliveryType(dt)}
                  style={{padding:'6px 14px',border:`2px solid ${grnDeliveryType===dt?dtColor[dt]:'#D1D5DB'}`,borderRadius:8,cursor:'pointer',fontFamily:F,fontSize:11,fontWeight:grnDeliveryType===dt?800:500,
                    background:grnDeliveryType===dt?dtBg[dt]:'#f9fafb',color:grnDeliveryType===dt?dtColor[dt]:'#6B7280'}}>
                  {dtLabel[dt]}
                </button>
              ))}
            </div>
          </div>
          {grnDeliveryType==='our-yard'&&(
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
              <div><label style={lbl}>Yard / Location</label><input style={inp} value={grnLocation} onChange={e=>setGrnLocation(e.target.value)} placeholder="e.g. Main Yard, Warehouse A"/></div>
              <div><label style={lbl}>Remarks</label><input style={inp} value={grnRemarks} onChange={e=>setGrnRemarks(e.target.value)} placeholder="Condition, note"/></div>
            </div>
          )}
          {grnDeliveryType==='direct-client'&&(
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
              <div>
                <label style={lbl}>Deliver to Client *</label>
                <select style={{...inp,cursor:'pointer'}} value={grnClientId} onChange={e=>setGrnClientId(e.target.value)}>
                  <option value="">— Select Client —</option>
                  {clients.map(c=><option key={c.clientId||c._id} value={c.clientId||c._id}>{c.clientName||c.name||'—'}</option>)}
                </select>
              </div>
              <div><label style={lbl}>Remarks</label><input style={inp} value={grnRemarks} onChange={e=>setGrnRemarks(e.target.value)} placeholder="Condition, note"/></div>
            </div>
          )}
          {grnDeliveryType==='to-vendor'&&(
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
              <div><label style={lbl}>Deliver to Vendor Name *</label><input style={inp} value={grnToVendorName} onChange={e=>setGrnToVendorName(e.target.value)} placeholder="Vendor name for processing"/></div>
              <div><label style={lbl}>Remarks</label><input style={inp} value={grnRemarks} onChange={e=>setGrnRemarks(e.target.value)} placeholder="Condition, note"/></div>
            </div>
          )}
        </div>

        {/* Items table */}
        {grnPOData&&(
          <div style={{background:'#fff',border:'1px solid #e2e8f0',borderRadius:8,overflow:'hidden',marginBottom:10}}>
            <div style={{background:GN,padding:'7px 14px',fontSize:11,fontWeight:800,color:'#fff',textTransform:'uppercase',letterSpacing:'0.6px'}}>
              Items — {grnPOData.vendorName||'Vendor'} → {grnDeliveryType==='our-yard'?(grnLocation||'Our Yard'):grnDeliveryType==='direct-client'?(clients.find(c=>String(c.clientId||c._id)===grnClientId)?.clientName||'Client'):(grnToVendorName||'Vendor')}
            </div>
            <div style={{overflowX:'auto'}}>
              <table style={{borderCollapse:'collapse',fontSize:11,fontFamily:F,width:'100%'}}>
                <thead><tr>
                  {['#','Item / Description','HSN','Unit','Ordered Qty','Received Qty','Rate (₹)','Remarks'].map((h,i)=>(
                    <th key={h} style={{padding:'6px 8px',background:'#064e3b',color:'#fff',fontSize:10,fontWeight:700,textAlign:i>=4&&i<=6?'right':'left',border:'1px solid #047857',whiteSpace:'nowrap'}}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {grnItems.map((it,i)=>(
                    <tr key={i} style={{background:i%2===0?'#fff':'#f0fdf4'}}>
                      <td style={{padding:'5px 8px',border:'1px solid #d1fae5',textAlign:'center',color:'#9CA3AF'}}>{i+1}</td>
                      <td style={{padding:'5px 8px',border:'1px solid #d1fae5',fontWeight:600}}>{it.itemName}</td>
                      <td style={{padding:'5px 8px',border:'1px solid #d1fae5',fontFamily:'monospace',fontSize:10,color:'#555'}}>{it.hsnCode||'—'}</td>
                      <td style={{padding:'5px 8px',border:'1px solid #d1fae5'}}>{it.unit}</td>
                      <td style={{padding:'5px 8px',border:'1px solid #d1fae5',textAlign:'right',fontWeight:700,color:P}}>{it.orderedQty}</td>
                      <td style={{padding:'5px 8px',border:'1px solid #d1fae5',textAlign:'right'}}>
                        <input type="number" min="0" step="0.01" value={it.receivedQty}
                          onChange={e=>setGrnItems(prev=>prev.map((x,j)=>j===i?{...x,receivedQty:parseFloat(e.target.value)||0}:x))}
                          style={{width:80,height:28,padding:'0 6px',border:'1px solid #D1D5DB',borderRadius:4,fontSize:11,fontFamily:F,outline:'none',textAlign:'right'}}/>
                      </td>
                      <td style={{padding:'5px 8px',border:'1px solid #d1fae5',textAlign:'right'}}>₹{fmt(it.rate)}</td>
                      <td style={{padding:'5px 8px',border:'1px solid #d1fae5'}}>
                        <input type="text" value={it.remarks||''} onChange={e=>setGrnItems(prev=>prev.map((x,j)=>j===i?{...x,remarks:e.target.value}:x))}
                          style={{width:'100%',height:28,padding:'0 6px',border:'1px solid #D1D5DB',borderRadius:4,fontSize:11,fontFamily:F,outline:'none'}} placeholder="Condition / note"/>
                      </td>
                    </tr>
                  ))}
                  {grnItems.length===0&&<tr><td colSpan={8} style={{textAlign:'center',padding:24,color:'#9CA3AF',fontStyle:'italic'}}>Select a PO to load items</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    );
  }

  /* ══════ CREATE GDN VIEW ══════ */
  if (view==='create-gdn') {
    const GDN_C = '#7c3aed';
    const fromLabel = gdnFromType==='our-yard'?'🏭 Our Yard':'🏢 From Vendor';
    const toLabel   = gdnToType==='client'?'👤 Client':gdnToType==='vendor'?'🏢 Another Vendor':'📍 Other';
    const addGdnItem = () => setGdnItems(p=>[...p,{itemName:'',hsnCode:'',unit:'NOS',qty:1,rate:0,remarks:''}]);
    const removeGdnItem = i => setGdnItems(p=>p.filter((_,j)=>j!==i));
    return (
      <div style={{fontFamily:F,fontSize:12,padding:10}}>
        <div style={{background:GDN_C,color:'#fff',padding:'8px 14px',borderRadius:7,display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
          <div>
            <div style={{fontSize:14,fontWeight:800}}>{editGDN?'✏ï¸ Edit GDN':'🚚 New Goods Delivery Note (GDN)'}</div>
            <div style={{fontSize:10,opacity:0.7,marginTop:1}}>Record material dispatched — from source to destination</div>
          </div>
          <div style={{display:'flex',gap:8}}>
            <button onClick={()=>{setView('tab');setTab('gdn');setEditGDN(null);setGdnMsg('');}}
              style={{height:30,padding:'0 14px',background:'rgba(255,255,255,0.15)',border:'1px solid rgba(255,255,255,0.3)',color:'#fff',borderRadius:6,cursor:'pointer',fontSize:12,fontWeight:600,fontFamily:F}}>← Back</button>
            <button onClick={handleSaveGDN} disabled={gdnSaving}
              style={{height:30,padding:'0 18px',background:'#F59E0B',border:'none',borderRadius:6,cursor:gdnSaving?'not-allowed':'pointer',color:'#fff',fontSize:12,fontWeight:800,fontFamily:F,opacity:gdnSaving?0.7:1}}>
              {gdnSaving?'Saving…':editGDN?'✔ Update GDN':'✔ Save GDN'}
            </button>
          </div>
        </div>
        {gdnMsg&&<div style={{marginBottom:10,padding:'8px 12px',borderRadius:6,fontSize:12,background:gdnMsg.startsWith('Error')?'#FEF2F2':'#ede9fe',color:gdnMsg.startsWith('Error')?'#DC2626':'#5b21b6',border:`1px solid ${gdnMsg.startsWith('Error')?'#FECACA':'#c4b5fd'}`}}>{gdnMsg}</div>}

        {/* Header row */}
        <div style={{background:'#fff',border:'1px solid #e2e8f0',borderRadius:8,padding:14,marginBottom:10}}>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:14,marginBottom:14}}>
            <div><label style={lbl}>GDN Date *</label><input type="date" style={inp} value={gdnDate} onChange={e=>setGdnDate(e.target.value)}/></div>
            <div><label style={lbl}>Dispatched By</label><input style={inp} value={gdnDispatchedBy} onChange={e=>setGdnDispatchedBy(e.target.value)} placeholder="Name"/></div>
            <div><label style={lbl}>PO Reference (optional)</label>
              <select style={{...inp,cursor:'pointer'}} value={gdnFromPO} onChange={e=>setGdnFromPO(e.target.value)}>
                <option value="">— None —</option>
                {purchaseOrders.map(o=><option key={o.orderId} value={o.poNo||o.poNumber||`PO-${o.orderId}`}>{o.poNo||o.poNumber||`PO-${o.orderId}`} · {o.vendorName||'—'}</option>)}
              </select>
            </div>
          </div>

          {/* FROM section */}
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14,marginBottom:14,padding:12,background:'#f8fafc',borderRadius:8,border:'1px solid #e2e8f0'}}>
            <div>
              <label style={lbl}>📤 Dispatch From</label>
              <div style={{display:'flex',gap:8,marginBottom:8}}>
                {[['our-yard','🏭 Our Yard'],['vendor','🏢 From Vendor']].map(([v,l])=>(
                  <button key={v} onClick={()=>setGdnFromType(v)}
                    style={{padding:'5px 12px',border:`2px solid ${gdnFromType===v?GDN_C:'#D1D5DB'}`,borderRadius:6,cursor:'pointer',fontFamily:F,fontSize:11,fontWeight:gdnFromType===v?800:500,
                      background:gdnFromType===v?'#ede9fe':'#f9fafb',color:gdnFromType===v?GDN_C:'#6B7280'}}>{l}</button>
                ))}
              </div>
              <input style={inp} value={gdnFromName} onChange={e=>setGdnFromName(e.target.value)}
                placeholder={gdnFromType==='our-yard'?'Yard / warehouse name':'Vendor name'}/>
            </div>
            <div>
              <label style={lbl}>📥 Deliver To</label>
              <div style={{display:'flex',gap:8,marginBottom:8,flexWrap:'wrap'}}>
                {[['client','👤 Client'],['vendor','🏢 Vendor'],['other','📍 Other']].map(([v,l])=>(
                  <button key={v} onClick={()=>setGdnToType(v)}
                    style={{padding:'5px 12px',border:`2px solid ${gdnToType===v?'#059669':'#D1D5DB'}`,borderRadius:6,cursor:'pointer',fontFamily:F,fontSize:11,fontWeight:gdnToType===v?800:500,
                      background:gdnToType===v?'#dcfce7':'#f9fafb',color:gdnToType===v?'#059669':'#6B7280'}}>{l}</button>
                ))}
              </div>
              {gdnToType==='client'?(
                <select style={{...inp,cursor:'pointer'}} value={gdnToClientId} onChange={e=>setGdnToClientId(e.target.value)}>
                  <option value="">— Select Client —</option>
                  {clients.map(c=><option key={c.clientId||c._id} value={c.clientId||c._id}>{c.clientName||c.name||'—'}</option>)}
                </select>
              ):(
                <input style={inp} value={gdnToName} onChange={e=>setGdnToName(e.target.value)}
                  placeholder={gdnToType==='vendor'?'Vendor name':'Address / location'}/>
              )}
            </div>
          </div>

          {/* Transport */}
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr',gap:14}}>
            <div><label style={lbl}>Vehicle No</label><input style={inp} value={gdnVehicleNo} onChange={e=>setGdnVehicleNo(e.target.value)} placeholder="MH01AB1234"/></div>
            <div><label style={lbl}>LR / Docket No</label><input style={inp} value={gdnLrNo} onChange={e=>setGdnLrNo(e.target.value)} placeholder="LR number"/></div>
            <div><label style={lbl}>Transporter</label><input style={inp} value={gdnTransporter} onChange={e=>setGdnTransporter(e.target.value)} placeholder="Transport company"/></div>
            <div><label style={lbl}>Remarks</label><input style={inp} value={gdnRemarks} onChange={e=>setGdnRemarks(e.target.value)} placeholder="Notes"/></div>
          </div>
        </div>

        {/* Items */}
        <div style={{background:'#fff',border:'1px solid #e2e8f0',borderRadius:8,overflow:'hidden',marginBottom:10}}>
          <div style={{background:GDN_C,padding:'7px 14px',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <span style={{fontSize:11,fontWeight:800,color:'#fff',textTransform:'uppercase',letterSpacing:'0.6px'}}>Items Dispatched — {fromLabel} → {toLabel}</span>
            <button onClick={addGdnItem} style={{padding:'3px 10px',background:'rgba(255,255,255,0.2)',border:'1px solid rgba(255,255,255,0.4)',color:'#fff',borderRadius:4,cursor:'pointer',fontSize:11,fontFamily:F}}>+ Add Item</button>
          </div>
          <div style={{overflowX:'auto'}}>
            <table style={{borderCollapse:'collapse',fontSize:11,fontFamily:F,width:'100%'}}>
              <thead><tr>
                {['#','Item / Description','HSN','Unit','Qty','Rate (₹)','Amount (₹)','Remarks',''].map((h,i)=>(
                  <th key={i} style={{padding:'6px 8px',background:'#4c1d95',color:'#fff',fontSize:10,fontWeight:700,textAlign:i>=4&&i<=6?'right':'left',border:'1px solid #6d28d9',whiteSpace:'nowrap'}}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {gdnItems.map((it,i)=>(
                  <tr key={i} style={{background:i%2===0?'#fff':'#faf5ff'}}>
                    <td style={{padding:'4px 8px',border:'1px solid #e2e8f0',textAlign:'center',color:'#9CA3AF'}}>{i+1}</td>
                    <td style={{padding:'3px 6px',border:'1px solid #e2e8f0'}}>
                      <input value={it.itemName} onChange={e=>setGdnItems(p=>p.map((x,j)=>j===i?{...x,itemName:e.target.value}:x))}
                        style={{width:'100%',height:28,padding:'0 6px',border:'1px solid #D1D5DB',borderRadius:4,fontSize:11,fontFamily:F,outline:'none'}} placeholder="Item name"/>
                    </td>
                    <td style={{padding:'3px 6px',border:'1px solid #e2e8f0'}}>
                      <input value={it.hsnCode||''} onChange={e=>setGdnItems(p=>p.map((x,j)=>j===i?{...x,hsnCode:e.target.value}:x))}
                        style={{width:70,height:28,padding:'0 6px',border:'1px solid #D1D5DB',borderRadius:4,fontSize:11,fontFamily:F,outline:'none'}} placeholder="HSN"/>
                    </td>
                    <td style={{padding:'3px 6px',border:'1px solid #e2e8f0'}}>
                      <input value={it.unit} onChange={e=>setGdnItems(p=>p.map((x,j)=>j===i?{...x,unit:e.target.value}:x))}
                        style={{width:60,height:28,padding:'0 6px',border:'1px solid #D1D5DB',borderRadius:4,fontSize:11,fontFamily:F,outline:'none'}}/>
                    </td>
                    <td style={{padding:'3px 6px',border:'1px solid #e2e8f0',textAlign:'right'}}>
                      <input type="number" min="0" step="0.01" value={it.qty} onChange={e=>setGdnItems(p=>p.map((x,j)=>j===i?{...x,qty:parseFloat(e.target.value)||0}:x))}
                        style={{width:70,height:28,padding:'0 6px',border:'1px solid #D1D5DB',borderRadius:4,fontSize:11,fontFamily:F,outline:'none',textAlign:'right'}}/>
                    </td>
                    <td style={{padding:'3px 6px',border:'1px solid #e2e8f0',textAlign:'right'}}>
                      <input type="number" min="0" step="0.01" value={it.rate||0} onChange={e=>setGdnItems(p=>p.map((x,j)=>j===i?{...x,rate:parseFloat(e.target.value)||0}:x))}
                        style={{width:80,height:28,padding:'0 6px',border:'1px solid #D1D5DB',borderRadius:4,fontSize:11,fontFamily:F,outline:'none',textAlign:'right'}}/>
                    </td>
                    <td style={{padding:'4px 8px',border:'1px solid #e2e8f0',textAlign:'right',fontWeight:700,color:GDN_C}}>₹{fmt((parseFloat(it.qty)||0)*(parseFloat(it.rate)||0))}</td>
                    <td style={{padding:'3px 6px',border:'1px solid #e2e8f0'}}>
                      <input value={it.remarks||''} onChange={e=>setGdnItems(p=>p.map((x,j)=>j===i?{...x,remarks:e.target.value}:x))}
                        style={{width:'100%',height:28,padding:'0 6px',border:'1px solid #D1D5DB',borderRadius:4,fontSize:11,fontFamily:F,outline:'none'}} placeholder="Note"/>
                    </td>
                    <td style={{padding:'4px 6px',border:'1px solid #e2e8f0',textAlign:'center'}}>
                      {gdnItems.length>1&&<button onClick={()=>removeGdnItem(i)} style={{background:'#FEF2F2',border:'1px solid #FECACA',color:'#DC2626',borderRadius:4,cursor:'pointer',fontSize:12,padding:'2px 7px',fontFamily:F}}>✕</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr style={{background:'#f5f3ff'}}>
                <td colSpan={6} style={{padding:'6px 8px',border:'1px solid #e2e8f0',fontWeight:800,fontSize:11}}>TOTAL</td>
                <td style={{padding:'6px 8px',border:'1px solid #e2e8f0',textAlign:'right',fontWeight:800,color:GDN_C}}>₹{fmt(gdnItems.reduce((s,it)=>s+(parseFloat(it.qty)||0)*(parseFloat(it.rate)||0),0))}</td>
                <td colSpan={2} style={{border:'1px solid #e2e8f0'}}/>
              </tr></tfoot>
            </table>
          </div>
        </div>
      </div>
    );
  }

  /* ══════ TABS VIEW ══════ */
  return (
    <div style={{fontFamily:F,fontSize:12,padding:10}}>

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
                <th key={h} style={{padding:'5px 8px',background:P,color:'#fff',fontSize:10,fontWeight:700,textAlign:h==='Item'?'left':'right',border:'1px solid #0b3d3d'}}>{h}</th>
              ))}</tr></thead>
              <tbody>{(viewBill.items||[]).map((l,i)=>(
                <tr key={i} style={{background:i%2?'#f9fafb':'#fff'}}>
                  <td style={{padding:'4px 8px',border:'1px solid #e2e8f0',fontWeight:600}}>{l.description||l.itemName||'—'}</td>
                  <td style={{padding:'4px 8px',border:'1px solid #e2e8f0',textAlign:'right'}}>{l.qty}</td>
                  <td style={{padding:'4px 8px',border:'1px solid #e2e8f0',textAlign:'right'}}>₹{fmt(l.rate)}</td>
                  <td style={{padding:'4px 8px',border:'1px solid #e2e8f0',textAlign:'right'}}>₹{fmt(l.taxable)}</td>
                  <td style={{padding:'4px 8px',border:'1px solid #e2e8f0',textAlign:'right',color:'#7C3AED'}}>₹{fmt(l.gstAmt)}</td>
                  <td style={{padding:'4px 8px',border:'1px solid #e2e8f0',textAlign:'right',fontWeight:700,color:P}}>₹{fmt(l.total)}</td>
                </tr>
              ))}</tbody>
              <tfoot><tr style={{background:'#e8eef8'}}>
                <td colSpan={3} style={{padding:'6px 8px',border:'1px solid #e2e8f0',fontWeight:700}}>Grand Total</td>
                <td style={{padding:'6px 8px',border:'1px solid #e2e8f0',textAlign:'right',fontWeight:700}}>₹{fmt(viewBill.subTotal)}</td>
                <td style={{padding:'6px 8px',border:'1px solid #e2e8f0',textAlign:'right',fontWeight:700,color:'#7C3AED'}}>₹{fmt(viewBill.totalGST)}</td>
                <td style={{padding:'6px 8px',border:'1px solid #e2e8f0',textAlign:'right',fontWeight:800,color:P}}>₹{fmt(viewBill.grandTotal)}</td>
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

      {/* Header */}
      <div style={{background:P,color:'#fff',padding:'8px 14px',borderRadius:'7px 7px 0 0',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <div>
          <div style={{fontSize:14,fontWeight:800}}>🛒 Purchase Bills</div>
          <div style={{fontSize:10,opacity:0.7,marginTop:1}}>PO Dashboard · Purchase Bills · GRN · GDN</div>
        </div>
        <div style={{display:'flex',gap:8}}>
          {tab==='grn'&&<button onClick={()=>openCreateGRN()} style={{height:30,padding:'0 14px',background:GN,border:'1px solid #047857',color:'#fff',borderRadius:6,cursor:'pointer',fontSize:11,fontWeight:700,fontFamily:F}}>📦 New GRN</button>}
          {tab==='gdn'&&<button onClick={openCreateGDN} style={{height:30,padding:'0 14px',background:'#7c3aed',border:'1px solid #6d28d9',color:'#fff',borderRadius:6,cursor:'pointer',fontSize:11,fontWeight:700,fontFamily:F}}>🚚 New GDN</button>}
          {(tab==='orders'||tab==='bills')&&<button onClick={()=>setView('create-bill')} style={{height:30,padding:'0 14px',background:'rgba(255,255,255,0.15)',border:'1px solid rgba(255,255,255,0.35)',color:'#fff',borderRadius:6,cursor:'pointer',fontSize:11,fontWeight:700,fontFamily:F}}>📄 New Bill</button>}
        </div>
      </div>

      {/* Tabs */}
      <div style={{display:'flex',background:'#f1f5f9',borderLeft:'1px solid #e2e8f0',borderRight:'1px solid #e2e8f0'}}>
        {[{key:'orders',label:'📊 PO Dashboard',cnt:purchaseOrders.length,bg:'#e8eef8',c:P},
          {key:'bills',label:'📄 Purchase Bills',cnt:bills.length,bg:'#dcfce7',c:'#166534'},
          {key:'grn',label:'📦 GRN',cnt:grns.length,bg:'#d1fae5',c:GN},
          {key:'gdn',label:'🚚 GDN',cnt:gdns.length,bg:'#ede9fe',c:'#7c3aed'},
        ].map(t=>(
          <button key={t.key} onClick={()=>setTab(t.key)}
            style={{padding:'9px 22px',fontSize:12,fontWeight:tab===t.key?800:500,background:tab===t.key?'#fff':'transparent',border:'none',
              borderBottom:tab===t.key?`2px solid ${t.c}`:'2px solid transparent',
              color:tab===t.key?t.c:'#6B7280',cursor:'pointer',fontFamily:F,whiteSpace:'nowrap'}}>
            {t.label}
            <span style={{marginLeft:5,background:t.bg,color:t.c,borderRadius:10,padding:'1px 7px',fontSize:9,fontWeight:700}}>{t.cnt}</span>
          </button>
        ))}
      </div>

      {/* ── PO Dashboard ── */}
      {tab==='orders'&&(
        <div style={{background:'#fff',border:'1px solid #e2e8f0',borderTop:'none',borderRadius:'0 0 7px 7px'}}>
          <div style={{padding:'10px 14px',borderBottom:'1px solid #f1f5f9',display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
            <div style={{display:'flex',alignItems:'center',border:'1px solid #d1d5db',borderRadius:6,background:'#f9fafb',height:32,padding:'0 10px',gap:6,flex:1,maxWidth:380}}>
              <span style={{fontSize:13,color:'#9ca3af'}}>🔍</span>
              <input value={ordSearch} onChange={e=>setOrdSearch(e.target.value)} placeholder="Search PO No, vendor, client, order ID…"
                style={{border:'none',outline:'none',fontSize:12,fontFamily:F,flex:1,background:'transparent',color:'#374151'}}/>
              {ordSearch&&<button onClick={()=>setOrdSearch('')} style={{background:'none',border:'none',cursor:'pointer',fontSize:13,color:'#9ca3af'}}>×</button>}
            </div>
            {fyPOList.length > 0 && (
              <div style={{display:'flex',gap:4,alignItems:'center',flexWrap:'wrap'}}>
                {['all',...fyPOList].map(f=>(
                  <button key={f} onClick={()=>setPoFy(f)}
                    style={{height:28,padding:'0 9px',borderRadius:6,border:`1px solid ${poFy===f?P:'#D1D5DB'}`,background:poFy===f?P:'#fff',color:poFy===f?'#fff':'#374151',fontSize:11,fontWeight:600,cursor:'pointer',fontFamily:F,whiteSpace:'nowrap'}}>
                    {f==='all'?'All FY':`FY ${f}`}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div style={{overflowX:'auto'}}>
            <table style={{borderCollapse:'collapse',width:'100%',fontSize:11,fontFamily:F}}>
              <thead><tr>
                {['#','Order ID','Client','Vendor','PO Date','PO No','Order Qty','Billed Qty','Received Qty','PO Value (₹)','Bills','GRN','Actions'].map((h,i)=>(
                  <th key={h} style={{padding:'7px 10px',background:P,color:'#fff',fontSize:10,fontWeight:700,textAlign:i>=6&&i<=9?'right':'left',border:'1px solid #0b3d3d',whiteSpace:'nowrap'}}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {loading?(<tr><td colSpan={13} style={{textAlign:'center',padding:30,color:'#9CA3AF',fontStyle:'italic'}}>Loading…</td></tr>)
                :filteredPOs.length===0?(<tr><td colSpan={13} style={{textAlign:'center',padding:36,color:'#9CA3AF',fontStyle:'italic'}}>No purchase orders found.</td></tr>)
                :filteredPOs.map((po,i)=>{
                  const so=soMap[String(po.linkedSalesOrderId)];
                  const clientName=so?.customerName||so?.clientName||'—';
                  const orderBills=billsByOrder[String(po.orderId)]||[];
                  const orderGRNs=grnsByPO[String(po.orderId)]||[];
                  const fullyBilled=isFullyBilled(po);
                  const oQty=poOrderQty(po), bQty=poBilledQty(po), rQty=poReceivedQty(po);
                  return (
                    <tr key={po.orderId} style={{background:i%2===0?'#fff':'#f8fafc',transition:'background 0.1s'}}
                      onMouseEnter={e=>e.currentTarget.style.background='#eff6ff'}
                      onMouseLeave={e=>e.currentTarget.style.background=i%2===0?'#fff':'#f8fafc'}>
                      <td style={{padding:'6px 10px',border:'1px solid #e2e8f0',color:'#9CA3AF',textAlign:'center'}}>{i+1}</td>
                      <td style={{padding:'6px 10px',border:'1px solid #e2e8f0',fontWeight:700,color:P}}>
                        {po.orderId}
                        {po.linkedSalesOrderId&&<div style={{fontSize:9,color:'#6B7280',marginTop:1}}>SO #{po.linkedSalesOrderId}</div>}
                      </td>
                      <td style={{padding:'6px 10px',border:'1px solid #e2e8f0',fontWeight:600,maxWidth:120,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{clientName}</td>
                      <td style={{padding:'6px 10px',border:'1px solid #e2e8f0',maxWidth:130,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{po.vendorName||'—'}</td>
                      <td style={{padding:'6px 10px',border:'1px solid #e2e8f0',whiteSpace:'nowrap'}}>{fmtD(po.poDate)}</td>
                      <td style={{padding:'6px 10px',border:'1px solid #e2e8f0',fontWeight:600,whiteSpace:'nowrap'}}>{po.poNo||po.poNumber||`PO-${po.orderId}`}</td>
                      <td style={{padding:'6px 10px',border:'1px solid #e2e8f0',textAlign:'right',fontWeight:700,color:'#1E293B'}}>{oQty.toFixed(2)}</td>
                      <td style={{padding:'6px 10px',border:'1px solid #e2e8f0',textAlign:'right',fontWeight:700,color:bQty>=oQty&&oQty>0?'#166534':'#4338CA'}}>
                        {bQty.toFixed(2)}
                        {oQty>0&&<div style={{fontSize:9,color:'#9CA3AF',marginTop:1}}>{Math.min(100,Math.round(bQty/oQty*100))}%</div>}
                      </td>
                      <td style={{padding:'6px 10px',border:'1px solid #e2e8f0',textAlign:'right',fontWeight:700,color:rQty>=oQty&&oQty>0?'#166534':'#065f46'}}>
                        {rQty.toFixed(2)}
                        {oQty>0&&<div style={{fontSize:9,color:'#9CA3AF',marginTop:1}}>{Math.min(100,Math.round(rQty/oQty*100))}%</div>}
                      </td>
                      <td style={{padding:'6px 10px',border:'1px solid #e2e8f0',textAlign:'right',fontWeight:700,color:P}}>₹{fmt(po.grandTotal||po.totalAmount||0)}</td>
                      <td style={{padding:'6px 10px',border:'1px solid #e2e8f0'}}>
                        {orderBills.length>0?(
                          <span style={{fontSize:10,background:'#EEF2FF',color:'#4338CA',padding:'1px 7px',borderRadius:10,fontWeight:700,cursor:'pointer',whiteSpace:'nowrap'}}
                            onClick={()=>{setPbSearch(po.poNo||po.poNumber||`PO-${po.orderId}`);setTab('bills');}}>
                            {orderBills.length} bill{orderBills.length>1?'s':''}
                          </span>
                        ):<span style={{fontSize:10,color:'#D1D5DB'}}>—</span>}
                      </td>
                      <td style={{padding:'6px 10px',border:'1px solid #e2e8f0'}}>
                        {orderGRNs.length>0?(
                          <span style={{fontSize:10,background:'#d1fae5',color:GN,padding:'1px 7px',borderRadius:10,fontWeight:700,cursor:'pointer',whiteSpace:'nowrap'}}
                            onClick={()=>{setGrnSearch(po.poNo||po.poNumber||`PO-${po.orderId}`);setTab('grn');}}>
                            {orderGRNs.length} GRN{orderGRNs.length>1?'s':''}
                          </span>
                        ):<span style={{fontSize:10,color:'#D1D5DB'}}>—</span>}
                      </td>
                      <td style={{padding:'6px 10px',border:'1px solid #e2e8f0'}} onClick={e=>e.stopPropagation()}>
                        <div style={{display:'flex',gap:5,flexWrap:'wrap'}}>
                          {fullyBilled?(
                            <span style={{padding:'2px 8px',background:'#DCFCE7',color:'#166534',borderRadius:10,fontSize:10,fontWeight:700,border:'1px solid #BBF7D0',whiteSpace:'nowrap'}}>✅ All Invoice Received</span>
                          ):(
                            <button onClick={()=>openCreateForOrder(po)}
                              style={{padding:'2px 8px',background:'#EEF2FF',color:'#4338CA',border:'1px solid #C7D2FE',borderRadius:4,cursor:'pointer',fontSize:10,fontWeight:700,fontFamily:F,whiteSpace:'nowrap'}}>
                              📄 Bill
                            </button>
                          )}
                          <button onClick={()=>openCreateGRN(po)}
                            style={{padding:'2px 8px',background:'#d1fae5',color:GN,border:'1px solid #a7f3d0',borderRadius:4,cursor:'pointer',fontSize:10,fontWeight:700,fontFamily:F,whiteSpace:'nowrap'}}>
                            📦 GRN
                          </button>
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
        <div style={{background:'#fff',border:'1px solid #e2e8f0',borderTop:'none',borderRadius:'0 0 7px 7px'}}>
          <div style={{padding:'10px 14px',borderBottom:'1px solid #f1f5f9',display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
            <div style={{display:'flex',alignItems:'center',border:'1px solid #d1d5db',borderRadius:6,background:'#f9fafb',height:32,padding:'0 10px',gap:6,flex:1,maxWidth:300}}>
              <span style={{fontSize:13,color:'#9ca3af'}}>🔍</span>
              <input value={pbSearch} onChange={e=>setPbSearch(e.target.value)} placeholder="Search bills, vendor, PO…"
                style={{border:'none',outline:'none',fontSize:12,fontFamily:F,flex:1,background:'transparent',color:'#374151'}}/>
              {pbSearch&&<button onClick={()=>setPbSearch('')} style={{background:'none',border:'none',cursor:'pointer',fontSize:13,color:'#9ca3af'}}>×</button>}
            </div>
            {fyBillList.length > 0 && (
              <div style={{display:'flex',gap:4,alignItems:'center',flexWrap:'wrap'}}>
                {['all',...fyBillList].map(f=>(
                  <button key={f} onClick={()=>setPbFy(f)}
                    style={{height:28,padding:'0 9px',borderRadius:6,border:`1px solid ${pbFy===f?P:'#D1D5DB'}`,background:pbFy===f?P:'#fff',color:pbFy===f?'#fff':'#374151',fontSize:11,fontWeight:600,cursor:'pointer',fontFamily:F,whiteSpace:'nowrap'}}>
                    {f==='all'?'All FY':`FY ${f}`}
                  </button>
                ))}
              </div>
            )}
            <button onClick={()=>setView('create-bill')}
              style={{height:30,padding:'0 14px',background:'#EEF2FF',border:'1px solid #C7D2FE',borderRadius:6,cursor:'pointer',color:'#4338CA',fontSize:11,fontWeight:700,fontFamily:F,whiteSpace:'nowrap'}}>
              + New Bill
            </button>
          </div>
          {/* ── Action Bar ── */}
          {selPBill && (
            <div style={{background:'linear-gradient(90deg,#104f4f,#104f4f)',padding:'5px 12px',display:'flex',alignItems:'center',gap:8}}>
              <span style={{fontSize:11,color:'rgba(255,255,255,0.8)'}}>▶</span>
              <span style={{fontSize:12,fontWeight:700,color:'#fff',flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                {selPBill.billNo} · {selPBill.partyName||''}
              </span>
              {[
                {label:'👁 View',   fn:()=>setViewBill(selPBill)},
                {label:'✏ï¸ Edit',   fn:()=>openEditBill(selPBill)},
                {label:'🗑 Delete', fn:()=>handleDeleteBill(selPBill.billId), danger:true},
              ].map(btn=>(
                <button key={btn.label} onClick={btn.fn}
                  style={{height:26,padding:'0 10px',fontSize:11,cursor:'pointer',fontFamily:F,fontWeight:700,borderRadius:5,whiteSpace:'nowrap',border:'none',background:btn.danger?'rgba(220,38,38,0.35)':'rgba(255,255,255,0.18)',color:'#fff'}}>
                  {btn.label}
                </button>
              ))}
              <button onClick={()=>setSelPBill(null)}
                style={{height:26,width:26,background:'rgba(255,255,255,0.15)',border:'none',color:'#fff',borderRadius:5,cursor:'pointer',fontSize:13}}>✕</button>
            </div>
          )}
          <div style={{overflowX:'auto',overflowY:'auto',maxHeight:'calc(100vh - 290px)'}}>
            <table style={{borderCollapse:'collapse',width:'100%',fontSize:11,fontFamily:F}}>
              <thead style={{position:'sticky',top:0,zIndex:3}}><tr>
                {['#','Bill No','Vendor Bill No','Date','PO No','Vendor','GST','Taxable (₹)','GST (₹)','Total (₹)'].map((h,i)=>(
                  <th key={h} style={{padding:'7px 10px',background:P,color:'#fff',fontSize:10,fontWeight:700,textAlign:i>=7&&i<=9?'right':(i===0?'center':'left'),border:'1px solid #0b3d3d',whiteSpace:'nowrap',...(i===0?{width:36}:{})}}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {loading?(<tr><td colSpan={11} style={{textAlign:'center',padding:30,color:'#9CA3AF',fontStyle:'italic'}}>Loading…</td></tr>)
                :filteredBills.length===0?(<tr><td colSpan={11} style={{textAlign:'center',padding:36,color:'#9CA3AF',fontStyle:'italic'}}>No purchase bills yet. Click "New Bill" or use the PO Dashboard.</td></tr>)
                :[...filteredBills].sort((a,b)=>new Date(b.createdAt||0)-new Date(a.createdAt||0)).map((b,i)=>{
                  const isSel=selPBill?.billId===b.billId; const rowBg=isSel?'#EEF4FF':i%2===0?'#fff':'#f8fafc';
                  return (
                  <tr key={b.billId} style={{background:rowBg,cursor:'pointer',transition:'background 0.1s',outline:isSel?`2px solid ${P}`:'none',outlineOffset:'-2px'}}
                    onMouseEnter={e=>{if(!isSel)e.currentTarget.style.background='#eff6ff';}}
                    onMouseLeave={e=>{e.currentTarget.style.background=rowBg;}}
                    onClick={()=>setActivityRec(b)}>
                    <td style={{padding:'5px 10px',border:'1px solid #e2e8f0',textAlign:'center',fontWeight:700,color:isSel?'#fff':'#9CA3AF',background:isSel?P:'transparent',cursor:'pointer',fontSize:11}}
                      onClick={e=>{e.stopPropagation();setSelPBill(s=>s?.billId===b.billId?null:b);}}>
                      {isSel?'✓':i+1}
                    </td>
                    <td style={{padding:'5px 10px',border:'1px solid #e2e8f0',fontWeight:700,color:P}}>{b.billNo}</td>
                    <td style={{padding:'5px 10px',border:'1px solid #e2e8f0',color:'#555'}}>{b.vendorBillNo||'—'}</td>
                    <td style={{padding:'5px 10px',border:'1px solid #e2e8f0',whiteSpace:'nowrap'}}>{fmtD(b.billDate)}</td>
                    <td style={{padding:'5px 10px',border:'1px solid #e2e8f0',color:'#555'}}>{b.orderNo||'—'}</td>
                    <td style={{padding:'5px 10px',border:'1px solid #e2e8f0',fontWeight:600,maxWidth:130,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{b.partyName}</td>
                    <td style={{padding:'5px 10px',border:'1px solid #e2e8f0'}}>
                      <span style={{padding:'1px 7px',borderRadius:4,fontSize:10,fontWeight:700,background:b.gstType==='intrastate'?'#DCFCE7':'#EEF2FF',color:b.gstType==='intrastate'?'#104f4f':'#4338CA'}}>
                        {b.gstType==='intrastate'?'C+S GST':'IGST'}
                      </span>
                    </td>
                    <td style={{padding:'5px 10px',border:'1px solid #e2e8f0',textAlign:'right'}}>{fmt(b.subTotal)}</td>
                    <td style={{padding:'5px 10px',border:'1px solid #e2e8f0',textAlign:'right',color:'#7C3AED'}}>{fmt(b.totalGST)}</td>
                    <td style={{padding:'5px 10px',border:'1px solid #e2e8f0',textAlign:'right',fontWeight:700,color:P}}>{fmt(b.grandTotal)}</td>
                  </tr>
                );})}
              </tbody>
              {filteredBills.length>0&&(
                <tfoot style={{position:'sticky',bottom:0,zIndex:2}}><tr style={{background:'#e8eef8',fontWeight:700}}>
                  <td colSpan={7} style={{padding:'6px 10px',border:'1px solid #e2e8f0',fontWeight:800}}>TOTAL ({filteredBills.length} bills{pbFy!=='all'?` · FY ${pbFy}`:''})</td>
                  <td style={{padding:'6px 10px',border:'1px solid #e2e8f0',textAlign:'right',fontWeight:800}}>{fmt(filteredBills.reduce((s,b)=>s+(parseFloat(b.subTotal)||0),0))}</td>
                  <td style={{padding:'6px 10px',border:'1px solid #e2e8f0',textAlign:'right',color:'#7C3AED',fontWeight:800}}>{fmt(filteredBills.reduce((s,b)=>s+(parseFloat(b.totalGST)||0),0))}</td>
                  <td style={{padding:'6px 10px',border:'1px solid #e2e8f0',textAlign:'right',color:P,fontWeight:800}}>{fmt(filteredBills.reduce((s,b)=>s+(parseFloat(b.grandTotal)||0),0))}</td>
                </tr></tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      {/* ── GRN Tab ── */}
      {tab==='grn'&&(
        <div style={{background:'#fff',border:'1px solid #e2e8f0',borderTop:'none',borderRadius:'0 0 7px 7px'}}>
          <div style={{padding:'10px 14px',borderBottom:'1px solid #f1f5f9',display:'flex',alignItems:'center',gap:10}}>
            <div style={{display:'flex',alignItems:'center',border:'1px solid #d1d5db',borderRadius:6,background:'#f9fafb',height:32,padding:'0 10px',gap:6,flex:1,maxWidth:360}}>
              <span style={{fontSize:13,color:'#9ca3af'}}>🔍</span>
              <input value={grnSearch} onChange={e=>setGrnSearch(e.target.value)} placeholder="Search GRN No, vendor, PO…"
                style={{border:'none',outline:'none',fontSize:12,fontFamily:F,flex:1,background:'transparent',color:'#374151'}}/>
              {grnSearch&&<button onClick={()=>setGrnSearch('')} style={{background:'none',border:'none',cursor:'pointer',fontSize:13,color:'#9ca3af'}}>×</button>}
            </div>
            <button onClick={()=>openCreateGRN()}
              style={{height:30,padding:'0 14px',background:GN,border:`1px solid #047857`,borderRadius:6,cursor:'pointer',color:'#fff',fontSize:11,fontWeight:700,fontFamily:F,whiteSpace:'nowrap'}}>
              📦 New GRN
            </button>
          </div>
          <div style={{overflowX:'auto'}}>
            <table style={{borderCollapse:'collapse',width:'100%',fontSize:11,fontFamily:F}}>
              <thead><tr>
                {['#','GRN No','Date','PO No','Dispatch From','Delivery To','Received By','Qty','Actions'].map((h,i)=>(
                  <th key={h} style={{padding:'7px 10px',background:GN,color:'#fff',fontSize:10,fontWeight:700,textAlign:'left',border:'1px solid #047857',whiteSpace:'nowrap'}}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {loading?(<tr><td colSpan={9} style={{textAlign:'center',padding:30,color:'#9CA3AF',fontStyle:'italic'}}>Loading…</td></tr>)
                :filteredGRNs.length===0?(<tr><td colSpan={9} style={{textAlign:'center',padding:36,color:'#9CA3AF',fontStyle:'italic'}}>No GRNs yet.</td></tr>)
                :[...filteredGRNs].sort((a,b)=>new Date(b.createdAt||0)-new Date(a.createdAt||0)).map((g,i)=>{
                  const totalQty=(g.items||[]).reduce((s,it)=>s+(parseFloat(it.receivedQty)||0),0);
                  const dtMap={'our-yard':['🏭','#dcfce7',GN],'direct-client':['🚛','#dbeafe','#1d4ed8'],'to-vendor':['🔄','#fef9c3','#92400e']};
                  const [dtIcon,dtBg,dtC]=dtMap[g.deliveryType||'our-yard']||dtMap['our-yard'];
                  const destLabel=g.deliveryType==='direct-client'?g.clientName||'Client':g.deliveryType==='to-vendor'?g.toVendorName||'Vendor':(g.deliveryLocation||'Our Yard');
                  return (
                    <tr key={g.grnId} style={{background:i%2===0?'#fff':'#f0fdf4',transition:'background 0.1s'}}
                      onMouseEnter={e=>e.currentTarget.style.background='#dcfce7'}
                      onMouseLeave={e=>e.currentTarget.style.background=i%2===0?'#fff':'#f0fdf4'}>
                      <td style={{padding:'6px 10px',border:'1px solid #d1fae5',color:'#9CA3AF',textAlign:'center'}}>{i+1}</td>
                      <td style={{padding:'6px 10px',border:'1px solid #d1fae5',fontWeight:700,color:GN}}>{g.grnNo}</td>
                      <td style={{padding:'6px 10px',border:'1px solid #d1fae5',whiteSpace:'nowrap'}}>{fmtD(g.receiptDate)}</td>
                      <td style={{padding:'6px 10px',border:'1px solid #d1fae5',fontWeight:600,color:P}}>{g.poNo||`PO-${g.poId}`}</td>
                      <td style={{padding:'6px 10px',border:'1px solid #d1fae5',maxWidth:120,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{g.vendorName||'—'}</td>
                      <td style={{padding:'6px 10px',border:'1px solid #d1fae5'}}>
                        <span style={{background:dtBg,color:dtC,padding:'2px 8px',borderRadius:4,fontSize:10,fontWeight:700,whiteSpace:'nowrap'}}>{dtIcon} {destLabel}</span>
                      </td>
                      <td style={{padding:'6px 10px',border:'1px solid #d1fae5'}}>{g.receivedBy||'—'}</td>
                      <td style={{padding:'6px 10px',border:'1px solid #d1fae5',fontWeight:700}}>{totalQty.toFixed(2)}</td>
                      <td style={{padding:'6px 10px',border:'1px solid #d1fae5'}}>
                        <div style={{display:'flex',gap:4}}>
                          <button onClick={()=>openEditGRN(g)} style={{padding:'2px 8px',fontSize:10,cursor:'pointer',background:'#d1fae5',color:GN,border:'1px solid #a7f3d0',borderRadius:4,fontFamily:F,fontWeight:600}}>✏ï¸</button>
                          <button onClick={()=>handleDeleteGRN(g.grnId)} style={{padding:'2px 8px',fontSize:10,cursor:'pointer',background:'#FEF2F2',color:'#DC2626',border:'1px solid #FECACA',borderRadius:4,fontFamily:F}}>🗑</button>
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

      {/* ── GDN Tab ── */}
      {tab==='gdn'&&(
        <div style={{background:'#fff',border:'1px solid #e2e8f0',borderTop:'none',borderRadius:'0 0 7px 7px'}}>
          <div style={{padding:'10px 14px',borderBottom:'1px solid #f1f5f9',display:'flex',alignItems:'center',gap:10}}>
            <div style={{display:'flex',alignItems:'center',border:'1px solid #d1d5db',borderRadius:6,background:'#f9fafb',height:32,padding:'0 10px',gap:6,flex:1,maxWidth:360}}>
              <span style={{fontSize:13,color:'#9ca3af'}}>🔍</span>
              <input value={gdnSearch} onChange={e=>setGdnSearch(e.target.value)} placeholder="Search GDN No, from, to…"
                style={{border:'none',outline:'none',fontSize:12,fontFamily:F,flex:1,background:'transparent',color:'#374151'}}/>
              {gdnSearch&&<button onClick={()=>setGdnSearch('')} style={{background:'none',border:'none',cursor:'pointer',fontSize:13,color:'#9ca3af'}}>×</button>}
            </div>
            <button onClick={openCreateGDN} style={{height:30,padding:'0 14px',background:'#7c3aed',border:'1px solid #6d28d9',borderRadius:6,cursor:'pointer',color:'#fff',fontSize:11,fontWeight:700,fontFamily:F,whiteSpace:'nowrap'}}>
              🚚 New GDN
            </button>
          </div>
          <div style={{overflowX:'auto'}}>
            <table style={{borderCollapse:'collapse',width:'100%',fontSize:11,fontFamily:F}}>
              <thead><tr>
                {['#','GDN No','Date','From','To','Vehicle No','LR No','Items','Dispatched By','Actions'].map(h=>(
                  <th key={h} style={{padding:'7px 10px',background:'#7c3aed',color:'#fff',fontSize:10,fontWeight:700,textAlign:'left',border:'1px solid #6d28d9',whiteSpace:'nowrap'}}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {loading?(<tr><td colSpan={10} style={{textAlign:'center',padding:30,color:'#9CA3AF',fontStyle:'italic'}}>Loading…</td></tr>)
                :filteredGDNs.length===0?(<tr><td colSpan={10} style={{textAlign:'center',padding:36,color:'#9CA3AF',fontStyle:'italic'}}>No GDNs yet. Click "+ New GDN" to record a dispatch.</td></tr>)
                :[...filteredGDNs].sort((a,b)=>new Date(b.createdAt||0)-new Date(a.createdAt||0)).map((g,i)=>{
                  const fromLabel=g.fromType==='vendor'?`🏢 ${g.fromName||'Vendor'}`:`🏭 ${g.fromName||'Our Yard'}`;
                  const toLabel=g.toType==='client'?`👤 ${g.toName||'Client'}`:g.toType==='vendor'?`🏢 ${g.toName||'Vendor'}`:`📍 ${g.toName||'Other'}`;
                  return (
                    <tr key={g.gdnId} style={{background:i%2===0?'#fff':'#faf5ff',transition:'background 0.1s'}}
                      onMouseEnter={e=>e.currentTarget.style.background='#ede9fe'}
                      onMouseLeave={e=>e.currentTarget.style.background=i%2===0?'#fff':'#faf5ff'}>
                      <td style={{padding:'6px 10px',border:'1px solid #e9d5ff',color:'#9CA3AF',textAlign:'center'}}>{i+1}</td>
                      <td style={{padding:'6px 10px',border:'1px solid #e9d5ff',fontWeight:700,color:'#7c3aed'}}>{g.gdnNo}</td>
                      <td style={{padding:'6px 10px',border:'1px solid #e9d5ff',whiteSpace:'nowrap'}}>{fmtD(g.date)}</td>
                      <td style={{padding:'6px 10px',border:'1px solid #e9d5ff',fontSize:11}}>{fromLabel}</td>
                      <td style={{padding:'6px 10px',border:'1px solid #e9d5ff',fontSize:11,fontWeight:600}}>{toLabel}</td>
                      <td style={{padding:'6px 10px',border:'1px solid #e9d5ff'}}>{g.vehicleNo||'—'}</td>
                      <td style={{padding:'6px 10px',border:'1px solid #e9d5ff'}}>{g.lrNo||'—'}</td>
                      <td style={{padding:'6px 10px',border:'1px solid #e9d5ff'}}>{(g.items||[]).length}</td>
                      <td style={{padding:'6px 10px',border:'1px solid #e9d5ff'}}>{g.dispatchedBy||'—'}</td>
                      <td style={{padding:'6px 10px',border:'1px solid #e9d5ff'}}>
                        <div style={{display:'flex',gap:4}}>
                          <button onClick={()=>openEditGDN(g)} style={{padding:'2px 8px',fontSize:10,cursor:'pointer',background:'#ede9fe',color:'#7c3aed',border:'1px solid #c4b5fd',borderRadius:4,fontFamily:F,fontWeight:600}}>✏ï¸</button>
                          <button onClick={()=>handleDeleteGDN(g.gdnId)} style={{padding:'2px 8px',fontSize:10,cursor:'pointer',background:'#FEF2F2',color:'#DC2626',border:'1px solid #FECACA',borderRadius:4,fontFamily:F}}>🗑</button>
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

      <ActivityDrawer record={activityRec} recordType="pb" onClose={()=>setActivityRec(null)} />
    </div>
  );
}
