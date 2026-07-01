/**
 * GRN — Goods Receipt Note
 * Flow: Select Client → Select SO → Select PO (optional) → Fill details → Save
 */
import { useState, useEffect, useRef, useMemo } from 'react';
import axios from 'axios';
import { useCompany } from '../../context/CompanyContext';

const P     = '#104f4f';
const BG    = '#F5F7FB';
const BD    = '#E5EAF2';
const F     = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const GREEN = '#059669';

const fmt  = n => (parseFloat(n)||0).toLocaleString('en-IN', { maximumFractionDigits:3 });
const fmtD = d => { if (!d) return '—'; const dt=new Date(d); return isNaN(dt)?d:`${String(dt.getDate()).padStart(2,'0')}-${String(dt.getMonth()+1).padStart(2,'0')}-${dt.getFullYear()}`; };

const LOC_TYPES = [
  { value:'warehouse',   label:'Our Warehouse / Store' },
  { value:'client_site', label:"At Client's Site" },
  { value:'vendor_site', label:'At Vendor / Supplier Site' },
  { value:'factory',     label:'At Manufacturing / Factory' },
  { value:'other',       label:'Other Location' },
];
const OUR_STORES = ['Warehouse A','Warehouse B','Raw Material Store','Finished Goods Store','Production Floor','Quality Hold'];

function emptyRow() {
  return { itemCode:'', itemName:'', hsnCode:'', qty:'', unit:'', rate:'', remarks:'' };
}

const inp = (readOnly=false, extra={}) => ({
  width:'100%', height:32, padding:'0 8px', border:`1px solid ${BD}`, borderRadius:6,
  fontSize:12, fontFamily:F, outline:'none', background:readOnly?'#F9FAFB':'#fff',
  color:readOnly?'#6B7280':'#111827', boxSizing:'border-box', ...extra,
});
const lbl = { fontSize:11.5, fontWeight:600, color:'#374151', marginBottom:3, display:'block', fontFamily:F };

function FR({ label, required, children, cols }) {
  return (
    <div style={{ gridColumn:cols||'span 1' }}>
      <label style={lbl}>{label}{required&&<span style={{ color:'#EF4444' }}> *</span>}</label>
      {children}
    </div>
  );
}

function SH({ color, children, right }) {
  return (
    <div style={{ background:color, padding:'8px 14px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
      <span style={{ fontSize:11, fontWeight:800, color:'#fff', textTransform:'uppercase', letterSpacing:'0.7px' }}>{children}</span>
      {right}
    </div>
  );
}

function ItemPopup({ allItems, onSelect, onClose }) {
  const [q, setQ] = useState('');
  const ref = useRef(null);
  useEffect(()=>{ ref.current?.focus(); },[]);
  const fil = q.trim()
    ? allItems.filter(it=>String(it.itemCode).includes(q)||(it.itemName||'').toLowerCase().includes(q.toLowerCase()))
    : allItems;
  return (
    <div onClick={e=>e.target===e.currentTarget&&onClose()}
      style={{ position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',backdropFilter:'blur(2px)',zIndex:9999,display:'flex',alignItems:'center',justifyContent:'center',padding:16 }}>
      <div style={{ background:'#fff',borderRadius:12,width:'100%',maxWidth:560,maxHeight:'72vh',display:'flex',flexDirection:'column',boxShadow:'0 20px 60px rgba(0,0,0,0.25)',border:`1px solid ${BD}` }}>
        <div style={{ background:P,color:'#fff',padding:'12px 16px',borderRadius:'12px 12px 0 0',display:'flex',justifyContent:'space-between',alignItems:'center',flexShrink:0 }}>
          <span style={{ fontSize:13,fontWeight:700,fontFamily:F }}>Select Item from Master</span>
          <button onClick={onClose} style={{ background:'rgba(255,255,255,0.15)',border:'1px solid rgba(255,255,255,0.25)',borderRadius:6,color:'#fff',width:28,height:28,cursor:'pointer',fontSize:16 }}>✕</button>
        </div>
        <div style={{ padding:'10px 14px',borderBottom:`1px solid ${BD}`,flexShrink:0 }}>
          <input ref={ref} value={q} onChange={e=>setQ(e.target.value)} placeholder="Search code / name…" style={{ ...inp(),width:'100%' }} />
        </div>
        <div style={{ flex:1,overflowY:'auto' }}>
          <table style={{ width:'100%',borderCollapse:'collapse',fontSize:12,fontFamily:F }}>
            <thead style={{ position:'sticky',top:0 }}>
              <tr style={{ background:P }}>
                {['Code','Name','UOM','Type'].map(h=>(
                  <th key={h} style={{ padding:'7px 10px',color:'#fff',fontWeight:700,textAlign:'left',border:'1px solid rgba(255,255,255,0.2)',fontSize:11 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {fil.length===0&&<tr><td colSpan={4} style={{ padding:20,textAlign:'center',color:'#9CA3AF' }}>No items found</td></tr>}
              {fil.map((it,i)=>(
                <tr key={it.itemCode} onClick={()=>{onSelect(it);onClose();}}
                  style={{ background:i%2===0?'#fff':'#FAFBFC',cursor:'pointer' }}
                  onMouseEnter={e=>e.currentTarget.style.background='#EEF4FF'}
                  onMouseLeave={e=>e.currentTarget.style.background=i%2===0?'#fff':'#FAFBFC'}>
                  <td style={{ padding:'7px 10px',fontFamily:'monospace',fontWeight:700,color:P,border:`1px solid ${BD}` }}>{it.itemCode}</td>
                  <td style={{ padding:'7px 10px',fontWeight:600,color:'#111827',border:`1px solid ${BD}` }}>{it.itemName}</td>
                  <td style={{ padding:'7px 10px',color:'#6B7280',border:`1px solid ${BD}` }}>{it.uom||'—'}</td>
                  <td style={{ padding:'7px 10px',color:'#6B7280',border:`1px solid ${BD}` }}>{it.itemType||'—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ padding:'8px 14px',borderTop:`1px solid ${BD}`,fontSize:11,color:'#9CA3AF',fontFamily:F,flexShrink:0,background:'#FAFBFC',borderRadius:'0 0 12px 12px' }}>
          {fil.length} items — click to select
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════ MAIN ════════════════════════════════════════ */
export default function StockIn() {
  const { selectedCompany } = useCompany();
  const cid = selectedCompany?.companyId;

  const [allItems,    setAllItems]    = useState([]);
  const [clients,     setClients]     = useState([]);
  const [vendors,     setVendors]     = useState([]);
  const [allSOs,      setAllSOs]      = useState([]);
  const [allPOs,      setAllPOs]      = useState([]);
  const [recentGRNs,  setRecentGRNs]  = useState([]);

  /* step selections */
  const [selClientId,  setSelClientId]  = useState('');
  const [clientSearch, setClientSearch] = useState('');
  const [showClientDD, setShowClientDD] = useState(false);
  const [selSOId,      setSelSOId]      = useState('');
  const [selVendorId,  setSelVendorId]  = useState('');
  const [selPOId,      setSelPOId]      = useState('');
  const [withoutPO,    setWithoutPO]    = useState(false);

  /* form */
  const [date,       setDate]       = useState(new Date().toISOString().slice(0,10));
  const [vendor,     setVendor]     = useState({ vendorId:'', vendorName:'' });
  const [docRef,     setDocRef]     = useState({ invoiceNo:'', invoiceDate:'', dcNo:'', vehicleNo:'' });
  const [loc,        setLoc]        = useState({ type:'warehouse', id:'', name:'Warehouse A', details:'' });
  const [receivedBy, setReceivedBy] = useState('');
  const [notes,      setNotes]      = useState('');
  const [rows,       setRows]       = useState([emptyRow()]);
  const [popupRow,   setPopupRow]   = useState(null);
  const [msg,        setMsg]        = useState({ text:'', ok:true });
  const [saving,     setSaving]     = useState(false);

  /* derived */
  const selectedClient = useMemo(()=>clients.find(c=>String(c.clientId)===selClientId),[clients,selClientId]);
  const clientSOs = useMemo(()=>{
    if (!selClientId || !selectedClient) return allSOs;
    const name = (selectedClient.clientName||selectedClient.companyName||'').toLowerCase().trim();
    if (!name) return allSOs;
    return allSOs.filter(so=>{
      const soParty = (so.party||so.customerName||so.clientName||'').toLowerCase().trim();
      return soParty === name;
    });
  },[allSOs,selClientId,selectedClient]);
  const filteredPOs = useMemo(()=>{
    let pos = allPOs;
    if (selSOId)
      pos = pos.filter(po=>String(po.linkedSalesOrderId)===selSOId||String(po.linkedSalesOrderId)===String(selSOId));
    if (selVendorId) {
      const selV = vendors.find(v=>String(v.vendorId||v.vendorCode)===selVendorId);
      pos = pos.filter(po=>
        String(po.vendorId||po.vendorCode)===selVendorId ||
        (selV && po.vendorName===selV.vendorName)
      );
    }
    return pos;
  },[allPOs,selSOId,selVendorId,vendors]);
  const selectedSO = useMemo(()=>allSOs.find(so=>String(so.orderId)===selSOId),[allSOs,selSOId]);
  const selectedPO = useMemo(()=>allPOs.find(po=>String(po.orderId)===selPOId),[allPOs,selPOId]);

  const loadRecent = () => {
    if (!cid) return;
    axios.get(`/api/stock/grn?companyId=${cid}`).then(r=>setRecentGRNs(r.data||[])).catch(()=>{});
  };

  useEffect(()=>{
    if (!cid) return;
    axios.get(`/api/items?companyId=${cid}`).then(r=>setAllItems(r.data||[])).catch(()=>{});
    axios.get(`/api/clients?companyId=${cid}`).then(r=>setClients(r.data||[])).catch(()=>{});
    axios.get(`/api/vendors?companyId=${cid}`).then(r=>setVendors(r.data||[])).catch(()=>{});
    axios.get(`/api/sales-orders?companyId=${cid}`).then(r=>setAllSOs(r.data||[])).catch(()=>{});
    axios.get(`/api/purchase-orders?companyId=${cid}`).then(r=>setAllPOs(r.data||[])).catch(()=>{});
    loadRecent();
  },[cid]);

  /* when PO selected → auto-fill vendor + items */
  useEffect(()=>{
    if (!selectedPO) return;
    setVendor({ vendorId:selectedPO.vendorId||selectedPO.vendorCode||'', vendorName:selectedPO.vendorName||'' });
    const poRows = (selectedPO.items||[]).map(it=>{
      const match = allItems.find(m=>(m.itemName||'').toLowerCase().trim()===(it.itemName||'').toLowerCase().trim());
      return {
        itemCode: match?.itemCode||'',
        itemName: it.itemName||'',
        hsnCode:  it.hsnCode||match?.hsnCode||'',
        qty:      String(it.qty||''),
        unit:     it.unit||match?.uom||'',
        rate:     String(it.rate||''),
        remarks:  '',
      };
    });
    if (poRows.length>0) setRows(poRows);
  },[selectedPO]);

  useEffect(()=>{ if (withoutPO) { setSelPOId(''); } },[withoutPO]);

  const setDoc = (k,v) => setDocRef(p=>({...p,[k]:v}));
  const setRow = (i,k,v) => setRows(rs=>rs.map((r,idx)=>idx===i?{...r,[k]:v}:r));

  const selectItem = (item) => {
    if (popupRow===null) return;
    setRow(popupRow,'itemCode',item.itemCode);
    setRow(popupRow,'itemName',item.itemName);
    setRow(popupRow,'hsnCode', item.hsnCode||'');
    setRow(popupRow,'unit',    item.uom||'');
  };

  const addRow    = () => setRows(rs=>[...rs,emptyRow()]);
  const removeRow = (i) => { if (rows.length>1) setRows(rs=>rs.filter((_,idx)=>idx!==i)); };

  const clearForm = () => {
    setSelClientId(''); setClientSearch(''); setSelSOId(''); setSelVendorId(''); setSelPOId(''); setWithoutPO(false);
    setVendor({ vendorId:'', vendorName:'' });
    setDocRef({ invoiceNo:'', invoiceDate:'', dcNo:'', vehicleNo:'' });
    setLoc({ type:'warehouse', id:'', name:'Warehouse A', details:'' });
    setReceivedBy(''); setNotes(''); setRows([emptyRow()]); setMsg({ text:'', ok:true });
  };

  const handleDeleteGRN = async (g) => {
    if (!window.confirm(`Delete GRN ${g.grnNo}?\nThis will reverse the stock entry.`)) return;
    await axios.delete(`/api/stock/transactions/${g.txnId}?companyId=${cid}`).catch(()=>{});
    loadRecent();
  };

  const totalValue = rows.reduce((s,r)=>s+(parseFloat(r.qty)||0)*(parseFloat(r.rate)||0),0);

  const handleSave = async () => {
    const valid = rows.filter(r=>r.itemName&&parseFloat(r.qty)>0);
    if (!valid.length) { setMsg({ text:'Add at least one item with qty > 0.', ok:false }); return; }
    try {
      setSaving(true); setMsg({ text:'', ok:true });
      const po = selectedPO;
      const so = selectedSO;
      const receiveAt = loc.type==='warehouse' ? loc.name : (loc.name||loc.details||loc.type);
      const body = {
        companyId:  cid,
        date,
        /* SO / PO reference */
        clientId:   selClientId,
        clientName: selectedClient?.clientName||selectedClient?.companyName||'',
        soId:       selSOId,
        soNo:       so?.orderNo||(selSOId?`SO-${selSOId}`:''),
        poId:       selPOId,
        poNo:       po?.poNo||po?.poNumber||(selPOId?`PO-${selPOId}`:''),
        withoutPO,
        /* vendor */
        vendorId:   vendor.vendorId,
        vendorName: vendor.vendorName,
        /* docs */
        vendorInvoiceNo:   docRef.invoiceNo,
        vendorInvoiceDate: docRef.invoiceDate,
        dcNo:       docRef.dcNo,
        vehicleNo:  docRef.vehicleNo,
        poRef:      po?.poNo||po?.poNumber||'',
        /* location */
        receiveLocationType: loc.type,
        receiveLocationId:   loc.id,
        receiveAt,
        receiveDetails: loc.details,
        receivedBy,
        /* legacy / API compat */
        sourceType: 'purchase',
        partyType:  'vendor',
        partyId:    vendor.vendorId,
        partyName:  vendor.vendorName,
        notes,
        items: valid.map(r=>({
          itemCode: r.itemCode,
          itemName: r.itemName,
          hsnCode:  r.hsnCode,
          qty:      parseFloat(r.qty),
          unit:     r.unit,
          location: receiveAt,
          rate:     parseFloat(r.rate)||0,
          remarks:  r.remarks,
        })),
      };
      const res = await axios.post(`/api/stock/grn?companyId=${cid}`, body);
      setMsg({ text:`✓ ${res.data.message||'GRN saved successfully'}`, ok:true });
      clearForm();
      loadRecent();
    } catch(e) {
      setMsg({ text:'Error: '+(e.response?.data?.error||e.message), ok:false });
    } finally { setSaving(false); }
  };

  const card = { background:'#fff', border:`1px solid ${BD}`, borderRadius:10, overflow:'hidden', boxShadow:'0 1px 3px rgba(0,0,0,0.06)', marginBottom:12 };

  return (
    <div style={{ background:BG, minHeight:'100%', fontFamily:F }}>
      {popupRow!==null && (
        <ItemPopup allItems={allItems}
          onSelect={it=>{ selectItem(it); setPopupRow(null); }}
          onClose={()=>setPopupRow(null)} />
      )}

      {/* Page header */}
      <div style={{ background:P, padding:'14px 20px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div>
          <div style={{ fontSize:11, color:'rgba(255,255,255,0.6)', fontWeight:500, textTransform:'uppercase', letterSpacing:'0.6px' }}>Stock</div>
          <div style={{ fontSize:15, fontWeight:800, color:'#fff', letterSpacing:'-0.2px' }}>GRN — Goods Receipt Note</div>
        </div>
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          <span style={{ fontSize:12, color:'rgba(255,255,255,0.7)', fontWeight:500 }}>Date:</span>
          <input type="date" value={date} onChange={e=>setDate(e.target.value)}
            style={{ height:32, padding:'0 8px', border:'1px solid rgba(255,255,255,0.3)', borderRadius:6, fontSize:12, fontFamily:F, background:'rgba(255,255,255,0.12)', color:'#fff', outline:'none', cursor:'pointer' }} />
          <button onClick={handleSave} disabled={saving}
            style={{ height:32, padding:'0 18px', fontSize:12, fontFamily:F, cursor:'pointer', background:'#12B76A', color:'#fff', border:'none', borderRadius:6, fontWeight:700, opacity:saving?0.7:1, boxShadow:'0 2px 6px rgba(18,183,106,0.4)' }}>
            {saving?'Saving…':'📥 Save GRN'}
          </button>
        </div>
      </div>

      {msg.text && (
        <div style={{ margin:'10px 16px 0', padding:'10px 14px', fontSize:12.5, fontFamily:F,
          background:msg.ok?'#ECFDF5':'#FEF2F2', color:msg.ok?'#059669':'#DC2626',
          border:`1px solid ${msg.ok?'#A7F3D0':'#FECACA'}`, borderRadius:8 }}>
          {msg.text}
        </div>
      )}

      <div style={{ padding:'12px 16px' }}>

        {/* ── STEP 1: Source & Reference ── */}
        <div style={card}>
          <SH color={P}>Step 1 — Source &amp; Reference</SH>
          <div style={{ padding:14, display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12 }}>

            <FR label="Client">
              <div style={{ position:'relative' }}>
                <input
                  value={selClientId ? (selectedClient?.clientName||selectedClient?.companyName||'') : clientSearch}
                  onChange={e=>{
                    if (selClientId) { setSelClientId(''); setSelSOId(''); setSelPOId(''); setRows([emptyRow()]); }
                    setClientSearch(e.target.value);
                    setShowClientDD(true);
                  }}
                  onFocus={()=>setShowClientDD(true)}
                  onBlur={()=>setTimeout(()=>setShowClientDD(false),180)}
                  placeholder="Search client name…"
                  style={{ ...inp(), paddingRight:28 }}
                />
                {selClientId && (
                  <button onClick={()=>{ setSelClientId(''); setClientSearch(''); setSelSOId(''); setSelPOId(''); setRows([emptyRow()]); }}
                    style={{ position:'absolute',right:6,top:'50%',transform:'translateY(-50%)',background:'none',border:'none',cursor:'pointer',color:'#9CA3AF',fontSize:14,padding:0 }}>✕</button>
                )}
                {showClientDD && !selClientId && (
                  <div style={{ position:'absolute',top:'100%',left:0,right:0,zIndex:200,background:'#fff',border:`1px solid ${BD}`,borderRadius:6,boxShadow:'0 4px 16px rgba(0,0,0,0.12)',maxHeight:220,overflowY:'auto',marginTop:2 }}>
                    {clients
                      .filter(c=>!clientSearch||(c.clientName||c.companyName||'').toLowerCase().includes(clientSearch.toLowerCase()))
                      .map(c=>(
                        <div key={c.clientId}
                          onMouseDown={()=>{ setSelClientId(String(c.clientId)); setClientSearch(''); setSelSOId(''); setSelPOId(''); setRows([emptyRow()]); setShowClientDD(false); }}
                          style={{ padding:'7px 10px',fontSize:12,cursor:'pointer',borderBottom:`1px solid ${BD}` }}
                          onMouseEnter={e=>e.currentTarget.style.background='#EEF4FF'}
                          onMouseLeave={e=>e.currentTarget.style.background='#fff'}>
                          {c.clientName||c.companyName}
                        </div>
                      ))
                    }
                    {clients.filter(c=>!clientSearch||(c.clientName||c.companyName||'').toLowerCase().includes(clientSearch.toLowerCase())).length===0 && (
                      <div style={{ padding:'10px',fontSize:12,color:'#9CA3AF',textAlign:'center' }}>No clients found</div>
                    )}
                  </div>
                )}
              </div>
            </FR>

            <FR label={`Sales Order${selClientId ? ` (${clientSOs.length} orders)` : ''}`}>
              <select value={selSOId}
                onChange={e=>{ setSelSOId(e.target.value); setSelPOId(''); setRows([emptyRow()]); setSelVendorId(''); setVendor({ vendorId:'',vendorName:'' }); }}
                style={{ ...inp(), cursor:'pointer' }}>
                <option value="">— {selClientId ? 'Select SO' : 'Select client first'} —</option>
                {clientSOs.map(so=>(
                  <option key={so.orderId} value={String(so.orderId)}>
                    {so.orderNo||`SO-${so.orderId}`}
                    {so.customerPO||so.clientOrderNo ? ` | Client PO: ${so.customerPO||so.clientOrderNo}` : ''}
                    {!selClientId ? ` — ${so.party||so.customerName||''}` : ''}
                  </option>
                ))}
              </select>
            </FR>

            <FR label="Vendor (filter)">
              <select value={selVendorId}
                onChange={e=>{
                  setSelVendorId(e.target.value);
                  setSelPOId('');
                  setRows([emptyRow()]);
                  const v = vendors.find(x=>String(x.vendorId||x.vendorCode)===e.target.value);
                  setVendor({ vendorId:e.target.value, vendorName:v?.vendorName||v?.companyName||'' });
                }}
                style={{ ...inp(), cursor:'pointer' }}>
                <option value="">— All Vendors —</option>
                {vendors.map(v=>(
                  <option key={v.vendorId||v.vendorCode} value={String(v.vendorId||v.vendorCode)}>
                    {v.vendorName||v.companyName}
                  </option>
                ))}
              </select>
            </FR>

            <FR label={`Purchase Order${selSOId ? ` (${filteredPOs.length} POs)` : ''}`}>
              <div style={{ display:'flex', gap:5, alignItems:'center' }}>
                <select value={selPOId}
                  onChange={e=>{ setSelPOId(e.target.value); if(e.target.value) setWithoutPO(false); }}
                  disabled={withoutPO}
                  style={{ ...inp(), cursor:withoutPO?'not-allowed':'pointer', opacity:withoutPO?0.5:1, flex:1 }}>
                  <option value="">— {selSOId ? 'Select PO' : 'Select SO first'} —</option>
                  {filteredPOs.map(po=>(
                    <option key={po.orderId} value={String(po.orderId)}>
                      {po.poNo||po.poNumber||`PO-${po.orderId}`} | {po.vendorName}
                    </option>
                  ))}
                </select>
                <label style={{ display:'flex', alignItems:'center', gap:4, fontSize:10.5, fontWeight:600, color:'#374151', cursor:'pointer', whiteSpace:'nowrap', userSelect:'none' }}>
                  <input type="checkbox" checked={withoutPO} onChange={e=>setWithoutPO(e.target.checked)} style={{ cursor:'pointer' }} />
                  No PO
                </label>
              </div>
            </FR>
          </div>

          {/* SO / PO summary badge */}
          {(selectedSO||selectedPO||withoutPO) && (
            <div style={{ margin:'0 14px 14px', padding:'10px 12px', background:'#EFF6FF', border:'1px solid #BFDBFE', borderRadius:8, display:'flex', gap:20, flexWrap:'wrap', fontSize:11.5, alignItems:'center' }}>
              {selectedSO ? <>
                <span><b>SO:</b> {selectedSO.orderNo||`SO-${selectedSO.orderId}`}</span>
                <span><b>Client:</b> {selectedSO.clientName}</span>
                {selectedSO.clientOrderNo&&<span><b>Client PO No:</b> {selectedSO.clientOrderNo}</span>}
                <span><b>Date:</b> {fmtD(selectedSO.orderDate||selectedSO.date)}</span>
              </> : <span style={{ color:'#6B7280' }}>No SO selected</span>}
              {selectedPO ? <>
                <span style={{ borderLeft:'1px solid #93C5FD', paddingLeft:20 }}><b>PO:</b> {selectedPO.poNo||selectedPO.poNumber}</span>
                <span><b>Vendor:</b> {selectedPO.vendorName}</span>
                <span><b>PO Date:</b> {fmtD(selectedPO.poDate)}</span>
                <span><b>PO Value:</b> ₹{fmt(selectedPO.grandTotal)}</span>
              </> : withoutPO ? (
                <span style={{ borderLeft:'1px solid #93C5FD', paddingLeft:20, color:'#92400E', fontWeight:600 }}>⚠ Without PO — manual entry</span>
              ) : null}
            </div>
          )}
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>

          {/* ── Vendor Documents ── */}
          <div style={card}>
            <SH color='#065F46'>Step 2 — Vendor Details &amp; Documents</SH>
            <div style={{ padding:14, display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>

              <FR label="Vendor Name" cols="span 2">
                <input value={vendor.vendorName} onChange={e=>setVendor(p=>({...p,vendorName:e.target.value}))}
                  placeholder={selVendorId ? vendor.vendorName : 'Auto-filled from PO / vendor selection above'}
                  style={inp(!!vendor.vendorName&&!!selVendorId)} />
              </FR>

              <FR label="Vendor Invoice No.">
                <input value={docRef.invoiceNo} onChange={e=>setDoc('invoiceNo',e.target.value)}
                  placeholder="e.g. INV-2025-001" style={inp()} />
              </FR>
              <FR label="Invoice Date">
                <input type="date" value={docRef.invoiceDate} onChange={e=>setDoc('invoiceDate',e.target.value)} style={inp()} />
              </FR>
              <FR label="DC / Delivery Challan No.">
                <input value={docRef.dcNo} onChange={e=>setDoc('dcNo',e.target.value)}
                  placeholder="Vendor's DC No." style={inp()} />
              </FR>
              <FR label="Vehicle / Transport No.">
                <input value={docRef.vehicleNo} onChange={e=>setDoc('vehicleNo',e.target.value)}
                  placeholder="e.g. MH12AB1234" style={inp()} />
              </FR>
            </div>
          </div>

          {/* ── Material Received At ── */}
          <div style={card}>
            <SH color='#92400E'>Step 3 — Material Received At</SH>
            <div style={{ padding:14, display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>

              <FR label="Delivery Location Type" required cols="span 2">
                <select value={loc.type}
                  onChange={e=>setLoc({ type:e.target.value, id:'', name:'', details:'' })}
                  style={{ ...inp(), cursor:'pointer' }}>
                  {LOC_TYPES.map(t=><option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </FR>

              {/* Our Warehouse */}
              {loc.type==='warehouse' && (
                <FR label="Warehouse / Store" required cols="span 2">
                  <select value={loc.name} onChange={e=>setLoc(p=>({...p,name:e.target.value}))}
                    style={{ ...inp(), cursor:'pointer' }}>
                    {OUR_STORES.map(s=><option key={s} value={s}>{s}</option>)}
                  </select>
                </FR>
              )}

              {/* Direct to Client */}
              {loc.type==='client_site' && (<>
                <FR label="Select Client" required cols="span 2">
                  <select value={loc.id}
                    onChange={e=>{
                      const c=clients.find(x=>String(x.clientId)===e.target.value);
                      setLoc(p=>({ ...p, id:e.target.value, name:c?.clientName||c?.companyName||'', details:c?.address||'' }));
                    }}
                    style={{ ...inp(), cursor:'pointer' }}>
                    <option value="">— Select Client —</option>
                    {clients.map(c=>(
                      <option key={c.clientId} value={String(c.clientId)}>{c.clientName||c.companyName}</option>
                    ))}
                  </select>
                </FR>
                <FR label="Client Name (confirm)">
                  <input value={loc.name} onChange={e=>setLoc(p=>({...p,name:e.target.value}))}
                    placeholder="Client name" style={inp()} />
                </FR>
                <FR label="Delivery Address">
                  <input value={loc.details} onChange={e=>setLoc(p=>({...p,details:e.target.value}))}
                    placeholder="Site / delivery address" style={inp()} />
                </FR>
              </>)}

              {/* At Vendor Location */}
              {loc.type==='vendor_site' && (<>
                <FR label="Select Vendor" required cols="span 2">
                  <select value={loc.id}
                    onChange={e=>{
                      const v=vendors.find(x=>String(x.vendorId)===e.target.value||String(x.vendorCode)===e.target.value);
                      setLoc(p=>({ ...p, id:e.target.value, name:v?.vendorName||v?.companyName||'', details:v?.address||'' }));
                    }}
                    style={{ ...inp(), cursor:'pointer' }}>
                    <option value="">— Select Vendor —</option>
                    {vendors.map(v=>(
                      <option key={v.vendorId||v.vendorCode} value={String(v.vendorId||v.vendorCode)}>
                        {v.vendorName||v.companyName}
                      </option>
                    ))}
                  </select>
                </FR>
                <FR label="Vendor Name (confirm)">
                  <input value={loc.name} onChange={e=>setLoc(p=>({...p,name:e.target.value}))}
                    placeholder="Vendor name" style={inp()} />
                </FR>
                <FR label="Vendor Address / Site">
                  <input value={loc.details} onChange={e=>setLoc(p=>({...p,details:e.target.value}))}
                    placeholder="Vendor's address / site details" style={inp()} />
                </FR>
              </>)}

              {/* Factory */}
              {loc.type==='factory' && (<>
                <FR label="Factory / Manufacturing Unit Name" required cols="span 2">
                  <input value={loc.name} onChange={e=>setLoc(p=>({...p,name:e.target.value}))}
                    placeholder="e.g. Factory Unit 1, Job-work Party" style={inp()} />
                </FR>
                <FR label="Address" cols="span 2">
                  <input value={loc.details} onChange={e=>setLoc(p=>({...p,details:e.target.value}))}
                    placeholder="Factory address (optional)" style={inp()} />
                </FR>
              </>)}

              {/* Other */}
              {loc.type==='other' && (<>
                <FR label="Location Name" required cols="span 2">
                  <input value={loc.name} onChange={e=>setLoc(p=>({...p,name:e.target.value}))}
                    placeholder="Describe the location" style={inp()} />
                </FR>
                <FR label="Address / Details" cols="span 2">
                  <input value={loc.details} onChange={e=>setLoc(p=>({...p,details:e.target.value}))}
                    placeholder="Address or details (optional)" style={inp()} />
                </FR>
              </>)}

              <FR label="Received By">
                <input value={receivedBy} onChange={e=>setReceivedBy(e.target.value)}
                  placeholder="Person who received" style={inp()} />
              </FR>

              <FR label="Notes / Inspection Remarks">
                <textarea value={notes} onChange={e=>setNotes(e.target.value)} rows={2}
                  placeholder="Condition of goods, inspection remarks…"
                  style={{ ...inp(), height:'auto', padding:'8px', resize:'vertical' }} />
              </FR>
            </div>
          </div>
        </div>

        {/* ── Items ── */}
        <div style={card}>
          <SH color={P}
            right={
              <button onClick={addRow}
                style={{ padding:'3px 12px', background:'rgba(255,255,255,0.15)', border:'1px solid rgba(255,255,255,0.35)', borderRadius:5, color:'#fff', cursor:'pointer', fontSize:11, fontFamily:F, fontWeight:600 }}>
                + Add Row
              </button>
            }>
            Items Received
            {selectedPO&&<span style={{ fontWeight:400,fontSize:10,marginLeft:8,opacity:0.8 }}>(auto-filled from PO — edit qty as needed)</span>}
          </SH>
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12, fontFamily:F, minWidth:800 }}>
              <thead>
                <tr style={{ background:'#ECFDF5' }}>
                  {['#','Item Code','Item Name','HSN','Qty *','Unit','Rate (₹)','Remarks',''].map((h,i)=>(
                    <th key={i} style={{ padding:'8px 10px', fontWeight:700, textAlign:i>=4&&i<=6?'right':'left', border:'1px solid #A7F3D0', whiteSpace:'nowrap', fontSize:11, color:'#065F46' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row,i)=>(
                  <tr key={i} style={{ background:i%2===0?'#fff':'#F9FFF9' }}>
                    <td style={{ padding:'6px 8px', textAlign:'center', color:'#9CA3AF', border:`1px solid ${BD}`, width:28 }}>{i+1}</td>
                    <td style={{ padding:'4px 6px', border:`1px solid ${BD}`, width:130 }}>
                      <div style={{ display:'flex', gap:4 }}>
                        <input readOnly value={row.itemCode}
                          style={{ ...inp(true,{ width:66,fontFamily:'monospace',fontWeight:700,fontSize:11,color:P }) }} />
                        <button onClick={()=>setPopupRow(i)}
                          style={{ height:32,padding:'0 8px',background:'#EEF4FF',color:P,border:`1px solid ${P}40`,borderRadius:5,cursor:'pointer',fontSize:13,flexShrink:0 }}>🔍</button>
                      </div>
                    </td>
                    <td style={{ padding:'4px 6px', border:`1px solid ${BD}`, minWidth:140 }}>
                      <input value={row.itemName} onChange={e=>setRow(i,'itemName',e.target.value)} style={inp()} placeholder="Item name" />
                    </td>
                    <td style={{ padding:'4px 6px', border:`1px solid ${BD}`, width:80 }}>
                      <input value={row.hsnCode} onChange={e=>setRow(i,'hsnCode',e.target.value)} style={{ ...inp(),fontSize:11 }} />
                    </td>
                    <td style={{ padding:'4px 6px', border:`1px solid ${BD}`, width:80 }}>
                      <input type="number" min="0" step="any" value={row.qty}
                        onChange={e=>setRow(i,'qty',e.target.value)}
                        style={{ ...inp(false,{ textAlign:'right',fontWeight:700,color:'#111827' }) }} />
                    </td>
                    <td style={{ padding:'4px 6px', border:`1px solid ${BD}`, width:60 }}>
                      <input value={row.unit} onChange={e=>setRow(i,'unit',e.target.value)} style={inp()} />
                    </td>
                    <td style={{ padding:'4px 6px', border:`1px solid ${BD}`, width:90 }}>
                      <input type="number" min="0" step="any" value={row.rate}
                        onChange={e=>setRow(i,'rate',e.target.value)}
                        placeholder="0.00" style={{ ...inp(false,{ textAlign:'right' }) }} />
                    </td>
                    <td style={{ padding:'4px 6px', border:`1px solid ${BD}`, minWidth:110 }}>
                      <input value={row.remarks} onChange={e=>setRow(i,'remarks',e.target.value)} placeholder="Remarks" style={inp()} />
                    </td>
                    <td style={{ padding:'4px 6px', border:`1px solid ${BD}`, width:28, textAlign:'center' }}>
                      <button onClick={()=>removeRow(i)}
                        style={{ background:'none',border:'none',color:'#DC2626',fontSize:16,cursor:'pointer',padding:0 }}>✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
              {totalValue>0&&(
                <tfoot>
                  <tr style={{ background:'#F0F4FF' }}>
                    <td colSpan={6} style={{ padding:'8px 10px',textAlign:'right',fontWeight:700,color:'#374151',border:`1px solid ${BD}`,fontSize:12 }}>Total Value:</td>
                    <td style={{ padding:'8px 10px',textAlign:'right',fontWeight:800,fontSize:13,color:GREEN,border:`1px solid ${BD}` }}>
                      ₹{totalValue.toLocaleString('en-IN',{ minimumFractionDigits:2 })}
                    </td>
                    <td colSpan={2} style={{ border:`1px solid ${BD}` }} />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>

        {/* Footer actions */}
        <div style={{ display:'flex', gap:10, justifyContent:'flex-end', marginBottom:16 }}>
          <button onClick={clearForm}
            style={{ height:36,padding:'0 20px',fontSize:13,fontFamily:F,cursor:'pointer',background:'#fff',color:'#374151',border:`1px solid ${BD}`,borderRadius:7,fontWeight:600 }}>
            ↺ Clear Form
          </button>
          <button onClick={handleSave} disabled={saving}
            style={{ height:36,padding:'0 24px',fontSize:13,fontFamily:F,cursor:'pointer',background:saving?'#9CA3AF':'#12B76A',color:'#fff',border:'none',borderRadius:7,fontWeight:700,boxShadow:saving?'none':'0 2px 6px rgba(18,183,106,0.35)' }}>
            {saving?'Saving…':'📥 Save GRN'}
          </button>
        </div>

        {/* Recent GRNs */}
        {recentGRNs.length>0&&(
          <div style={{ background:'#fff',border:`1px solid ${BD}`,borderRadius:10,overflow:'hidden',boxShadow:'0 1px 3px rgba(0,0,0,0.06)' }}>
            <div style={{ background:P,padding:'8px 14px',fontSize:11,fontWeight:800,color:'#fff',textTransform:'uppercase',letterSpacing:'0.7px' }}>
              Recent GRNs
            </div>
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%',borderCollapse:'collapse',fontSize:11,fontFamily:F }}>
                <thead>
                  <tr style={{ background:'#ECFDF5' }}>
                    {['GRN No.','Date','Vendor','Invoice No.','DC No.','SO Ref','PO Ref','Received At','Location Type','Vehicle','Items',''].map(h=>(
                      <th key={h} style={{ padding:'7px 10px',fontWeight:700,fontSize:10,textAlign:'left',border:'1px solid #A7F3D0',whiteSpace:'nowrap',color:'#065F46' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {recentGRNs.map((g,i)=>(
                    <tr key={g.txnId} style={{ background:i%2===0?'#fff':'#F9FFF9' }}
                      onMouseEnter={e=>e.currentTarget.style.background='#ECFDF5'}
                      onMouseLeave={e=>e.currentTarget.style.background=i%2===0?'#fff':'#F9FFF9'}>
                      <td style={{ padding:'7px 10px',border:`1px solid ${BD}`,fontFamily:'monospace',fontWeight:800,color:GREEN }}>{g.grnNo}</td>
                      <td style={{ padding:'7px 10px',border:`1px solid ${BD}`,whiteSpace:'nowrap' }}>{fmtD(g.date)}</td>
                      <td style={{ padding:'7px 10px',border:`1px solid ${BD}`,fontWeight:600 }}>{g.vendorName||g.partyName||'—'}</td>
                      <td style={{ padding:'7px 10px',border:`1px solid ${BD}`,color:'#374151' }}>{g.vendorInvoiceNo||'—'}</td>
                      <td style={{ padding:'7px 10px',border:`1px solid ${BD}`,color:'#6B7280' }}>{g.dcNo||'—'}</td>
                      <td style={{ padding:'7px 10px',border:`1px solid ${BD}`,color:'#374151',fontWeight:600 }}>{g.soNo||(g.soId?`SO-${g.soId}`:'')||'—'}</td>
                      <td style={{ padding:'7px 10px',border:`1px solid ${BD}`,color:'#6B7280' }}>{g.poNo||g.poRef||'—'}</td>
                      <td style={{ padding:'7px 10px',border:`1px solid ${BD}`,color:'#374151' }}>{g.receiveAt||'—'}</td>
                      <td style={{ padding:'7px 10px',border:`1px solid ${BD}`,color:'#6B7280',fontSize:10 }}>
                        {LOC_TYPES.find(t=>t.value===g.receiveLocationType)?.label||g.receiveLocationType||'—'}
                      </td>
                      <td style={{ padding:'7px 10px',border:`1px solid ${BD}`,color:'#6B7280' }}>{g.vehicleNo||'—'}</td>
                      <td style={{ padding:'7px 10px',border:`1px solid ${BD}`,textAlign:'center',fontWeight:800,color:GREEN }}>
                        {(g.items||[]).length}
                      </td>
                      <td style={{ padding:'5px 8px',border:`1px solid ${BD}` }}>
                        <button onClick={()=>handleDeleteGRN(g)}
                          style={{ padding:'2px 9px',fontSize:10,cursor:'pointer',background:'#FEF2F2',color:'#DC2626',border:'1px solid #FECACA',borderRadius:4,fontFamily:F,fontWeight:700,whiteSpace:'nowrap' }}>
                          🗑 Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
