import { useState, useEffect, useRef, useMemo } from 'react';
import axios from 'axios';
import { useCompany } from '../../context/CompanyContext';

const P     = '#3A6186';
const PD    = '#2A4D6E';
const BG    = '#F5F7FB';
const BD    = '#E5EAF2';
const F     = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const GREEN = '#059669';

const fmt  = n => (parseFloat(n) || 0).toFixed(2);
const fmtD = d => {
  if (!d) return '—';
  const dt = new Date(d);
  return isNaN(dt) ? d : `${String(dt.getDate()).padStart(2,'0')}-${String(dt.getMonth()+1).padStart(2,'0')}-${dt.getFullYear()}`;
};

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
  useEffect(() => { ref.current?.focus(); }, []);
  const fil = q.trim()
    ? allItems.filter(it => String(it.itemCode).includes(q)||(it.itemName||'').toLowerCase().includes(q.toLowerCase()))
    : allItems;
  return (
    <div onClick={e => e.target===e.currentTarget&&onClose()}
      style={{ position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',backdropFilter:'blur(2px)',zIndex:9999,
        display:'flex',alignItems:'center',justifyContent:'center',padding:16 }}>
      <div style={{ background:'#fff',borderRadius:12,width:'100%',maxWidth:560,maxHeight:'72vh',
        display:'flex',flexDirection:'column',boxShadow:'0 20px 60px rgba(0,0,0,0.25)',border:`1px solid ${BD}` }}>
        <div style={{ background:P,color:'#fff',padding:'12px 16px',borderRadius:'12px 12px 0 0',
          display:'flex',justifyContent:'space-between',alignItems:'center',flexShrink:0 }}>
          <span style={{ fontSize:13,fontWeight:700,fontFamily:F }}>Select Item from Master</span>
          <button onClick={onClose} style={{ background:'rgba(255,255,255,0.15)',border:'1px solid rgba(255,255,255,0.25)',
            borderRadius:6,color:'#fff',width:28,height:28,cursor:'pointer',fontSize:16 }}>✕</button>
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
        <div style={{ padding:'8px 14px',borderTop:`1px solid ${BD}`,fontSize:11,color:'#9CA3AF',fontFamily:F,
          flexShrink:0,background:'#FAFBFC',borderRadius:'0 0 12px 12px' }}>
          {fil.length} items — click to select
        </div>
      </div>
    </div>
  );
}

export default function StockIn() {
  const { selectedCompany } = useCompany();
  const cid = selectedCompany?.companyId;

  /* page */
  const [pageTab, setPageTab] = useState('pending');

  /* data */
  const [allItems,       setAllItems]       = useState([]);
  const [clients,        setClients]        = useState([]);
  const [vendors,        setVendors]        = useState([]);
  const [allSOs,         setAllSOs]         = useState([]);
  const [allPOs,         setAllPOs]         = useState([]);
  const [recentGRNs,     setRecentGRNs]     = useState([]);
  const [purchaseBills,  setPurchaseBills]  = useState([]);

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
  const selectedClient = useMemo(() => clients.find(c=>String(c.clientId)===selClientId), [clients, selClientId]);
  const clientSOs = useMemo(() => {
    if (!selClientId || !selectedClient) return allSOs;
    const name = (selectedClient.clientName||selectedClient.companyName||'').toLowerCase().trim();
    if (!name) return allSOs;
    return allSOs.filter(so => {
      const soParty = (so.party||so.customerName||so.clientName||'').toLowerCase().trim();
      return soParty === name;
    });
  }, [allSOs, selClientId, selectedClient]);
  const filteredPOs = useMemo(() => {
    let pos = allPOs;
    if (selSOId)
      pos = pos.filter(po => String(po.linkedSalesOrderId)===selSOId);
    if (selVendorId) {
      const selV = vendors.find(v=>String(v.vendorId||v.vendorCode)===selVendorId);
      pos = pos.filter(po =>
        String(po.vendorId||po.vendorCode)===selVendorId ||
        (selV && po.vendorName===selV.vendorName)
      );
    }
    return pos;
  }, [allPOs, selSOId, selVendorId, vendors]);
  const selectedSO = useMemo(() => allSOs.find(so=>String(so.orderId)===selSOId), [allSOs, selSOId]);
  const selectedPO = useMemo(() => allPOs.find(po=>String(po.orderId)===selPOId), [allPOs, selPOId]);

  /* Pending bills: purchase bills without a GRN for their orderId */
  const pendingBills = useMemo(() => {
    return purchaseBills.filter(bill => {
      const billOrderId = String(bill.orderId || '');
      const billId      = String(bill.billId || '');
      if (!billOrderId && !billId) return false;
      return !recentGRNs.some(grn =>
        (billOrderId && String(grn.poId || '') === billOrderId) ||
        (billId      && String(grn.billId || grn.billRef || '') === billId)
      );
    });
  }, [purchaseBills, recentGRNs]);

  const loadRecent = () => {
    if (!cid) return;
    axios.get(`/api/stock/grn?companyId=${cid}`).then(r => setRecentGRNs(r.data||[])).catch(()=>{});
  };

  useEffect(() => {
    if (!cid) return;
    axios.get(`/api/items?companyId=${cid}`).then(r=>setAllItems(r.data||[])).catch(()=>{});
    axios.get(`/api/clients?companyId=${cid}`).then(r=>setClients(r.data||[])).catch(()=>{});
    axios.get(`/api/vendors?companyId=${cid}`).then(r=>setVendors(r.data||[])).catch(()=>{});
    axios.get(`/api/sales-orders?companyId=${cid}`).then(r=>setAllSOs(r.data||[])).catch(()=>{});
    axios.get(`/api/purchase-orders?companyId=${cid}`).then(r=>setAllPOs(r.data||[])).catch(()=>{});
    axios.get(`/api/bills?companyId=${cid}&type=purchase`).then(r=>setPurchaseBills(r.data||[])).catch(()=>{});
    loadRecent();
  }, [cid]);

  /* when PO selected → auto-fill vendor + items */
  useEffect(() => {
    if (!selectedPO) return;
    setVendor({ vendorId:selectedPO.vendorId||selectedPO.vendorCode||'', vendorName:selectedPO.vendorName||'' });
    const poRows = (selectedPO.items||[]).map(it => {
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
  }, [selectedPO]);

  useEffect(() => { if (withoutPO) { setSelPOId(''); } }, [withoutPO]);

  /* Pre-fill GRN from a pending purchase bill */
  const loadBillForGRN = (bill) => {
    clearForm();
    setVendor({ vendorId: String(bill.vendorId||''), vendorName: bill.vendorName||bill.partyName||'' });
    setSelVendorId(String(bill.vendorId||''));
    setNotes(`GRN for Purchase Bill: ${bill.billNo || bill.billId}`);
    if (bill.vendorBillNo || bill.vendorInvoiceNo) {
      setDocRef(p => ({ ...p, invoiceNo: bill.vendorBillNo || bill.vendorInvoiceNo || '' }));
    }
    const billItems = (bill.items||[]).map(it => ({
      itemCode:  it.itemCode || '',
      itemName:  it.itemName || it.description || '',
      hsnCode:   it.hsnCode || '',
      qty:       String(parseFloat(it.qty||it.quantity)||''),
      unit:      it.unit||it.uom||'',
      rate:      String(parseFloat(it.rate)||''),
      remarks:   '',
    })).filter(r => parseFloat(r.qty) > 0);
    setRows(billItems.length > 0 ? billItems : [emptyRow()]);
    setMsg({ text: `✓ ${billItems.length} item${billItems.length!==1?'s':''} loaded from Purchase Bill ${bill.billNo||''} — ${bill.vendorName||bill.partyName||''}`, ok: true });
    setPageTab('create');
  };

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
        companyId: cid, date,
        clientId:   selClientId,
        clientName: selectedClient?.clientName||selectedClient?.companyName||'',
        soId:       selSOId,
        soNo:       so?.orderNo||(selSOId?`SO-${selSOId}`:''),
        poId:       selPOId,
        poNo:       po?.poNo||po?.poNumber||(selPOId?`PO-${selPOId}`:''),
        withoutPO,
        vendorId:   vendor.vendorId,
        vendorName: vendor.vendorName,
        vendorInvoiceNo:   docRef.invoiceNo,
        vendorInvoiceDate: docRef.invoiceDate,
        dcNo:       docRef.dcNo,
        vehicleNo:  docRef.vehicleNo,
        poRef:      po?.poNo||po?.poNumber||'',
        receiveLocationType: loc.type,
        receiveLocationId:   loc.id,
        receiveAt,
        receiveDetails: loc.details,
        receivedBy,
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
      setPageTab('history');
    } catch(e) {
      setMsg({ text:'Error: '+(e.response?.data?.error||e.message), ok:false });
    } finally { setSaving(false); }
  };

  const card = { background:'#fff', border:`1px solid ${BD}`, borderRadius:10,
    overflow:'hidden', boxShadow:'0 1px 3px rgba(0,0,0,0.06)', marginBottom:12 };

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', fontFamily:F }}>
      {popupRow!==null && (
        <ItemPopup allItems={allItems}
          onSelect={it=>{ selectItem(it); setPopupRow(null); }}
          onClose={()=>setPopupRow(null)} />
      )}

      {/* ═══ NAV BAR ═══ */}
      <div style={{ flexShrink:0, height:40, background:P, borderBottom:`2px solid ${PD}`,
        display:'flex', alignItems:'stretch', overflow:'hidden', fontFamily:F }}>

        <div style={{ display:'flex', alignItems:'center', padding:'0 14px',
          borderRight:`1px solid rgba(255,255,255,0.18)`, flexShrink:0 }}>
          <span style={{ fontSize:12, fontWeight:800, color:'#fff', letterSpacing:'0.2px', whiteSpace:'nowrap' }}>
            GRN
          </span>
        </div>

        {[
          { k:'pending', l:`Pending Receipt${pendingBills.length ? ` (${pendingBills.length})` : ''}` },
          { k:'create',  l:'+ Create GRN' },
          { k:'history', l:`History (${recentGRNs.length})` },
        ].map(({ k, l }) => {
          const a = pageTab === k;
          return (
            <button key={k} onClick={() => setPageTab(k)}
              style={{ display:'flex', alignItems:'center', padding:'0 13px', height:26, alignSelf:'center',
                fontSize:11.5, fontWeight:a?700:600, cursor:'pointer',
                whiteSpace:'nowrap', fontFamily:F,
                color:a?'#fff':'rgba(255,255,255,0.85)',
                background:a?'rgba(255,255,255,0.22)':'rgba(255,255,255,0.07)',
                border:`1px solid ${a?'rgba(255,255,255,0.55)':'rgba(255,255,255,0.22)'}`,
                boxShadow:a?'0 2px 6px rgba(0,0,0,0.22)':'0 1px 2px rgba(0,0,0,0.12)',
                borderRadius:6, margin:'0 4px' }}
              onMouseEnter={e=>{if(!a){e.currentTarget.style.background='rgba(255,255,255,0.14)';e.currentTarget.style.borderColor='rgba(255,255,255,0.55)';}}}
              onMouseLeave={e=>{if(!a){e.currentTarget.style.background='rgba(255,255,255,0.07)';e.currentTarget.style.borderColor='rgba(255,255,255,0.22)';}}}>
              {l}
            </button>
          );
        })}

        {pageTab === 'create' && (
          <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:6, paddingRight:10 }}>
            <input type="date" value={date} onChange={e=>setDate(e.target.value)}
              style={{ height:26, padding:'0 8px', border:'1px solid rgba(255,255,255,0.3)', borderRadius:5,
                fontSize:11, fontFamily:F, background:'rgba(255,255,255,0.12)', color:'#fff', outline:'none' }} />
            <button onClick={clearForm}
              style={{ height:26, padding:'0 10px', fontSize:11, fontFamily:F, cursor:'pointer',
                background:'rgba(255,255,255,0.12)', color:'#fff',
                border:'1px solid rgba(255,255,255,0.22)', borderRadius:5, fontWeight:600 }}>
              ↺ Clear
            </button>
            <button onClick={handleSave} disabled={saving}
              style={{ height:26, padding:'0 14px', fontSize:11, fontFamily:F, cursor:'pointer',
                background:saving?'#9CA3AF':'#12B76A', color:'#fff',
                border:'none', borderRadius:5, fontWeight:700 }}>
              {saving?'Saving…':'📥 Save GRN'}
            </button>
          </div>
        )}
      </div>

      {/* Message */}
      {msg.text && (
        <div style={{ flexShrink:0, margin:'8px 14px 0', padding:'8px 14px', fontSize:12.5, fontFamily:F,
          background:msg.ok?'#ECFDF5':'#FEF2F2', color:msg.ok?'#059669':'#DC2626',
          border:`1px solid ${msg.ok?'#A7F3D0':'#FECACA'}`, borderRadius:7,
          display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <span>{msg.text}</span>
          <button onClick={()=>setMsg({ text:'', ok:true })}
            style={{ background:'none', border:'none', cursor:'pointer', fontSize:16, color:msg.ok?'#059669':'#DC2626' }}>✕</button>
        </div>
      )}

      {/* ══ PENDING RECEIPT TAB ══ */}
      {pageTab === 'pending' && (
        <div style={{ flex:1, overflow:'auto', padding:'12px 16px' }}>
          {pendingBills.length === 0 ? (
            <div style={{ textAlign:'center', padding:'60px 20px', fontFamily:F }}>
              <div style={{ fontSize:40, marginBottom:12 }}>✅</div>
              <div style={{ fontSize:16, fontWeight:700, color:'#374151', marginBottom:6 }}>No Pending Receipt</div>
              <div style={{ fontSize:13, color:'#6B7280', marginBottom:20 }}>
                All purchase bills have been received, or no purchase bills found.
              </div>
              <button onClick={() => setPageTab('create')}
                style={{ height:34, padding:'0 20px', fontSize:12, fontFamily:F, cursor:'pointer',
                  background:P, color:'#fff', border:'none', borderRadius:6, fontWeight:700 }}>
                + Create Manual GRN
              </button>
            </div>
          ) : (
            <div style={card}>
              <SH color={P}
                right={
                  <button onClick={() => setPageTab('create')}
                    style={{ height:24, padding:'0 12px', fontSize:11, cursor:'pointer',
                      background:'rgba(255,255,255,0.15)', color:'#fff',
                      border:'1px solid rgba(255,255,255,0.3)', borderRadius:5, fontWeight:600 }}>
                    + Manual GRN
                  </button>
                }>
                Pending Receipt — {pendingBills.length} Purchase Bill{pendingBills.length!==1?'s':''} Awaiting
              </SH>
              <div style={{ overflowX:'auto' }}>
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12, fontFamily:F }}>
                  <thead style={{ position:'sticky', top:0, zIndex:2 }}>
                    <tr style={{ background:'#F0FDF4' }}>
                      {['Bill No','Bill Date','Vendor / Party','PO Ref','Items','Bill Amount','Status','Action'].map(h => (
                        <th key={h} style={{ padding:'8px 10px', fontWeight:700, fontSize:11,
                          textAlign:['Items','Bill Amount'].includes(h)?'right':'left',
                          borderBottom:'2px solid #A7F3D0', borderRight:`1px solid ${BD}`,
                          whiteSpace:'nowrap', color:'#065F46', background:'#F0FDF4' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pendingBills.map((bill, i) => (
                      <tr key={bill.billId || i}
                        style={{ background:i%2===0?'#fff':'#F9FFF9', borderBottom:`1px solid ${BD}`,
                          transition:'background 0.1s' }}
                        onMouseEnter={e => e.currentTarget.style.background='#F0FDF4'}
                        onMouseLeave={e => e.currentTarget.style.background=i%2===0?'#fff':'#F9FFF9'}>
                        <td style={{ padding:'8px 10px', fontFamily:'monospace', fontWeight:700, color:P }}>
                          {bill.billNo || `BILL-${bill.billId}`}
                        </td>
                        <td style={{ padding:'8px 10px', whiteSpace:'nowrap', color:'#374151' }}>
                          {fmtD(bill.billDate || bill.date)}
                        </td>
                        <td style={{ padding:'8px 10px', fontWeight:600, color:'#111827' }}>
                          {bill.vendorName || bill.partyName || '—'}
                        </td>
                        <td style={{ padding:'8px 10px', fontFamily:'monospace', fontSize:11, color:'#6B7280' }}>
                          {bill.poNo || bill.poRef || (bill.orderId ? `PO-${bill.orderId}` : '—')}
                        </td>
                        <td style={{ padding:'8px 10px', textAlign:'right' }}>
                          <span style={{ fontWeight:700, color:GREEN, background:'#ECFDF5',
                            padding:'2px 8px', borderRadius:12, border:'1px solid #A7F3D0', fontSize:11 }}>
                            {(bill.items||[]).length}
                          </span>
                        </td>
                        <td style={{ padding:'8px 10px', textAlign:'right', fontWeight:700, color:'#059669' }}>
                          ₹{(parseFloat(bill.grandTotal||bill.totalAmount||0)).toFixed(2)}
                        </td>
                        <td style={{ padding:'8px 10px' }}>
                          <span style={{ background:'#FEF9C3', color:'#92400E',
                            border:'1px solid #FDE68A', padding:'2px 9px',
                            borderRadius:4, fontSize:10, fontWeight:700, whiteSpace:'nowrap' }}>
                            ⏳ PENDING RECEIPT
                          </span>
                        </td>
                        <td style={{ padding:'6px 10px' }}>
                          <button onClick={() => loadBillForGRN(bill)}
                            style={{ padding:'4px 14px', fontSize:11, fontFamily:F, fontWeight:700,
                              background:GREEN, color:'#fff', border:'none', borderRadius:5, cursor:'pointer',
                              whiteSpace:'nowrap' }}>
                            📥 Receive
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
      )}

      {/* ══ CREATE GRN TAB ══ */}
      {pageTab === 'create' && (
        <div style={{ flex:1, overflow:'auto', background:BG }}>
          <div style={{ padding:'12px 16px' }}>

            {/* Step 1 — Source & Reference */}
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

                <FR label={`Sales Order${selClientId ? ` (${clientSOs.length})` : ''}`}>
                  <select value={selSOId}
                    onChange={e=>{ setSelSOId(e.target.value); setSelPOId(''); setRows([emptyRow()]); setSelVendorId(''); setVendor({ vendorId:'',vendorName:'' }); }}
                    style={{ ...inp(), cursor:'pointer' }}>
                    <option value="">— {selClientId ? 'Select SO' : 'Select client first'} —</option>
                    {clientSOs.map(so=>(
                      <option key={so.orderId} value={String(so.orderId)}>
                        {so.orderNo||`SO-${so.orderId}`}
                        {so.customerPO||so.clientOrderNo ? ` | PO: ${so.customerPO||so.clientOrderNo}` : ''}
                        {!selClientId ? ` — ${so.party||so.customerName||''}` : ''}
                      </option>
                    ))}
                  </select>
                </FR>

                <FR label="Vendor">
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

                <FR label={`Purchase Order${selSOId ? ` (${filteredPOs.length})` : ''}`}>
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

              {(selectedSO||selectedPO||withoutPO) && (
                <div style={{ margin:'0 14px 14px', padding:'10px 12px', background:'#EFF6FF', border:'1px solid #BFDBFE', borderRadius:8, display:'flex', gap:20, flexWrap:'wrap', fontSize:11.5, alignItems:'center' }}>
                  {selectedSO ? <>
                    <span><b>SO:</b> {selectedSO.orderNo||`SO-${selectedSO.orderId}`}</span>
                    <span><b>Client:</b> {selectedSO.clientName}</span>
                    <span><b>Date:</b> {fmtD(selectedSO.orderDate||selectedSO.date)}</span>
                  </> : <span style={{ color:'#6B7280' }}>No SO selected</span>}
                  {selectedPO ? <>
                    <span style={{ borderLeft:'1px solid #93C5FD', paddingLeft:20 }}><b>PO:</b> {selectedPO.poNo||selectedPO.poNumber}</span>
                    <span><b>Vendor:</b> {selectedPO.vendorName}</span>
                    <span><b>Value:</b> ₹{fmt(selectedPO.grandTotal)}</span>
                  </> : withoutPO ? (
                    <span style={{ borderLeft:'1px solid #93C5FD', paddingLeft:20, color:'#92400E', fontWeight:600 }}>⚠ Without PO</span>
                  ) : null}
                </div>
              )}
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>

              {/* Step 2 — Vendor Documents */}
              <div style={card}>
                <SH color='#065F46'>Step 2 — Vendor Details &amp; Documents</SH>
                <div style={{ padding:14, display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                  <FR label="Vendor Name" cols="span 2">
                    <input value={vendor.vendorName} onChange={e=>setVendor(p=>({...p,vendorName:e.target.value}))}
                      placeholder="Vendor name" style={inp(!!vendor.vendorName&&!!selVendorId)} />
                  </FR>
                  <FR label="Vendor Invoice No.">
                    <input value={docRef.invoiceNo} onChange={e=>setDoc('invoiceNo',e.target.value)}
                      placeholder="e.g. INV-2025-001" style={inp()} />
                  </FR>
                  <FR label="Invoice Date">
                    <input type="date" value={docRef.invoiceDate} onChange={e=>setDoc('invoiceDate',e.target.value)} style={inp()} />
                  </FR>
                  <FR label="DC / Challan No.">
                    <input value={docRef.dcNo} onChange={e=>setDoc('dcNo',e.target.value)}
                      placeholder="Vendor's DC No." style={inp()} />
                  </FR>
                  <FR label="Vehicle / Transport No.">
                    <input value={docRef.vehicleNo} onChange={e=>setDoc('vehicleNo',e.target.value)}
                      placeholder="e.g. MH12AB1234" style={inp()} />
                  </FR>
                </div>
              </div>

              {/* Step 3 — Received At */}
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

                  {loc.type==='warehouse' && (
                    <FR label="Warehouse / Store" required cols="span 2">
                      <select value={loc.name} onChange={e=>setLoc(p=>({...p,name:e.target.value}))}
                        style={{ ...inp(), cursor:'pointer' }}>
                        {OUR_STORES.map(s=><option key={s} value={s}>{s}</option>)}
                      </select>
                    </FR>
                  )}

                  {loc.type==='client_site' && (<>
                    <FR label="Select Client" required cols="span 2">
                      <select value={loc.id}
                        onChange={e=>{
                          const c=clients.find(x=>String(x.clientId)===e.target.value);
                          setLoc(p=>({ ...p, id:e.target.value, name:c?.clientName||c?.companyName||'', details:c?.address||'' }));
                        }}
                        style={{ ...inp(), cursor:'pointer' }}>
                        <option value="">— Select Client —</option>
                        {clients.map(c=>(<option key={c.clientId} value={String(c.clientId)}>{c.clientName||c.companyName}</option>))}
                      </select>
                    </FR>
                    <FR label="Client Name">
                      <input value={loc.name} onChange={e=>setLoc(p=>({...p,name:e.target.value}))} style={inp()} />
                    </FR>
                    <FR label="Delivery Address">
                      <input value={loc.details} onChange={e=>setLoc(p=>({...p,details:e.target.value}))}
                        placeholder="Site / delivery address" style={inp()} />
                    </FR>
                  </>)}

                  {(loc.type==='vendor_site'||loc.type==='factory'||loc.type==='other') && (<>
                    <FR label={loc.type==='vendor_site'?'Vendor Name':loc.type==='factory'?'Factory Name':'Location Name'} required cols="span 2">
                      <input value={loc.name} onChange={e=>setLoc(p=>({...p,name:e.target.value}))}
                        placeholder="Name / description" style={inp()} />
                    </FR>
                    <FR label="Address / Details" cols="span 2">
                      <input value={loc.details} onChange={e=>setLoc(p=>({...p,details:e.target.value}))}
                        placeholder="Address (optional)" style={inp()} />
                    </FR>
                  </>)}

                  <FR label="Received By">
                    <input value={receivedBy} onChange={e=>setReceivedBy(e.target.value)}
                      placeholder="Person who received" style={inp()} />
                  </FR>
                  <FR label="Notes">
                    <input value={notes} onChange={e=>setNotes(e.target.value)}
                      placeholder="Remarks…" style={inp()} />
                  </FR>
                </div>
              </div>
            </div>

            {/* Items */}
            <div style={card}>
              <SH color={P}
                right={
                  <button onClick={addRow}
                    style={{ padding:'3px 12px', background:'rgba(255,255,255,0.15)', border:'1px solid rgba(255,255,255,0.35)', borderRadius:5, color:'#fff', cursor:'pointer', fontSize:11, fontFamily:F, fontWeight:600 }}>
                    + Add Row
                  </button>
                }>
                Items Received
                {selectedPO&&<span style={{ fontWeight:400,fontSize:10,marginLeft:8,opacity:0.8 }}>(auto-filled from PO)</span>}
              </SH>
              <div style={{ overflowX:'auto' }}>
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12, fontFamily:F, minWidth:800 }}>
                  <thead>
                    <tr style={{ background:'#ECFDF5' }}>
                      {['#','Item Code','Item Name','HSN','Qty *','Unit','Rate (₹)','Remarks',''].map((h,i)=>(
                        <th key={i} style={{ padding:'8px 10px', fontWeight:700,
                          textAlign:i>=4&&i<=6?'right':'left', border:'1px solid #A7F3D0',
                          whiteSpace:'nowrap', fontSize:11, color:'#065F46' }}>{h}</th>
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
                            style={{ ...inp(false,{ textAlign:'right',fontWeight:700 }) }} />
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
                          ₹{totalValue.toFixed(2)}
                        </td>
                        <td colSpan={2} style={{ border:`1px solid ${BD}` }} />
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* ══ HISTORY TAB ══ */}
      {pageTab === 'history' && (
        <div style={{ flex:1, overflow:'auto', padding:'12px 16px' }}>
          {recentGRNs.length === 0 ? (
            <div style={{ padding:40, textAlign:'center', color:'#9CA3AF', fontSize:13, fontFamily:F }}>No GRN records yet.</div>
          ) : (
            <div style={card}>
              <SH color={P}>GRN History — {recentGRNs.length} entries</SH>
              <div style={{ overflowX:'auto' }}>
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11, fontFamily:F }}>
                  <thead style={{ position:'sticky', top:0, zIndex:2 }}>
                    <tr style={{ background:'#ECFDF5' }}>
                      {['GRN No.','Date','Vendor','Invoice No.','DC No.','SO Ref','PO Ref','Received At','Vehicle','Items',''].map(h=>(
                        <th key={h} style={{ padding:'7px 10px',fontWeight:700,fontSize:10,textAlign:'left',
                          border:'1px solid #A7F3D0',whiteSpace:'nowrap',color:'#065F46',background:'#ECFDF5' }}>{h}</th>
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
                        <td style={{ padding:'7px 10px',border:`1px solid ${BD}` }}>{g.vendorInvoiceNo||'—'}</td>
                        <td style={{ padding:'7px 10px',border:`1px solid ${BD}`,color:'#6B7280' }}>{g.dcNo||'—'}</td>
                        <td style={{ padding:'7px 10px',border:`1px solid ${BD}`,color:'#374151',fontWeight:600 }}>{g.soNo||(g.soId?`SO-${g.soId}`:'')||'—'}</td>
                        <td style={{ padding:'7px 10px',border:`1px solid ${BD}`,color:'#6B7280' }}>{g.poNo||g.poRef||'—'}</td>
                        <td style={{ padding:'7px 10px',border:`1px solid ${BD}` }}>{g.receiveAt||'—'}</td>
                        <td style={{ padding:'7px 10px',border:`1px solid ${BD}`,color:'#6B7280' }}>{g.vehicleNo||'—'}</td>
                        <td style={{ padding:'7px 10px',border:`1px solid ${BD}`,textAlign:'center',fontWeight:800,color:GREEN }}>
                          {(g.items||[]).length}
                        </td>
                        <td style={{ padding:'5px 8px',border:`1px solid ${BD}` }}>
                          <button onClick={()=>handleDeleteGRN(g)}
                            style={{ padding:'2px 9px',fontSize:10,cursor:'pointer',background:'#FEF2F2',color:'#DC2626',
                              border:'1px solid #FECACA',borderRadius:4,fontFamily:F,fontWeight:700,whiteSpace:'nowrap' }}>
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
      )}
    </div>
  );
}
