import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useCompany } from '../../context/CompanyContext';

const F  = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const P  = '#065F46'; // green for purchase
const PL = '#ECFDF5';

const fmt = n => (parseFloat(n)||0).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2});
const fmtD = d => {
  if(!d) return '—';
  const dt=new Date(d); if(isNaN(dt)) return d;
  return `${String(dt.getDate()).padStart(2,'0')}-${String(dt.getMonth()+1).padStart(2,'0')}-${dt.getFullYear()}`;
};
const today = () => new Date().toISOString().split('T')[0];

const sameState = (a, b) => {
  if(!a||!b) return false;
  return a.trim().toLowerCase() === b.trim().toLowerCase();
};

const inp = {
  width:'100%', height:32, padding:'0 9px', border:'1px solid #D1D5DB',
  borderRadius:6, fontSize:12, fontFamily:F, outline:'none', background:'#fff',
  boxSizing:'border-box',
};
const lbl = { fontSize:11, fontWeight:600, color:'#374151', marginBottom:4, display:'block' };

const TH = ({children, align='left', style={}}) => (
  <th style={{ padding:'6px 8px', background:P, color:'#fff', fontSize:10, fontWeight:700,
    textAlign:align, border:'1px solid #044333', whiteSpace:'nowrap', ...style }}>{children}</th>
);
const TD = ({children, align='left', bold, color, style={}}) => (
  <td style={{ padding:'4px 8px', fontSize:11, border:'1px solid #e2e8f0', textAlign:align,
    fontWeight:bold?700:400, color:color||'#111827', verticalAlign:'middle', fontFamily:F, ...style }}>{children}</td>
);

export default function PurchaseBill() {
  const { selectedCompany } = useCompany();
  const cid = selectedCompany?.companyId;
  const companyState = selectedCompany?.state || '';

  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [bills,          setBills]          = useState([]);
  const [view,           setView]           = useState('list');
  const [selOrder,       setSelOrder]       = useState('');
  const [order,          setOrder]          = useState(null);
  const [billNo,         setBillNo]         = useState('');
  const [vendorBillNo,   setVendorBillNo]   = useState('');
  const [billDate,       setBillDate]       = useState(today());
  const [loading,        setLoading]        = useState(false);
  const [saving,         setSaving]         = useState(false);
  const [msg,            setMsg]            = useState('');

  const load = useCallback(async () => {
    if (!cid) return;
    setLoading(true);
    try {
      const [poR, bR] = await Promise.all([
        axios.get(`/api/purchase-orders?companyId=${cid}`),
        axios.get(`/api/bills?companyId=${cid}&type=purchase`).catch(()=>({data:[]})),
      ]);
      setPurchaseOrders((poR.data||[]).filter(o => !['draft','rejected'].includes(o.status)));
      setBills(bR.data||[]);
    } catch {}
    setLoading(false);
  }, [cid]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (view==='create') {
      const yr = new Date().getFullYear();
      const next = bills.length+1;
      setBillNo(`PB/${yr}-${String(yr+1).slice(2)}/${String(next).padStart(3,'0')}`);
    }
  }, [view, bills.length]);

  useEffect(() => {
    if (!selOrder) { setOrder(null); return; }
    axios.get(`/api/purchase-orders/${selOrder}?companyId=${cid}`)
      .then(r => setOrder(r.data))
      .catch(()=>{
        axios.get(`/api/purchase-orders?companyId=${cid}`)
          .then(r2 => setOrder((r2.data||[]).find(o=>String(o.orderId)===String(selOrder))||null));
      });
  }, [selOrder, cid]);

  /* ── Calculate lines with GST split ── */
  const calcLines = () => {
    if (!order) return { lines:[], subTotal:0, totalCGST:0, totalSGST:0, totalIGST:0, totalGST:0, grandTotal:0, intrastate:false };
    const partyState = order.vendorState || order.shipFromState || '';
    const intrastate = sameState(companyState, partyState);

    const lines = (order.items||[]).map(it => {
      const qty      = parseFloat(it.qty||it.quantity)||0;
      const rate     = parseFloat(it.rate)||0;
      const gstPct   = parseFloat(it.gstPercent||it.gst||it.taxRate)||0;
      const base     = qty*rate;
      const discPct  = it.discountType==='%' ? parseFloat(it.discount)||0 : 0;
      const discFlat = it.discountType!=='%'  ? parseFloat(it.discount)||0 : 0;
      const disc     = discPct>0 ? base*discPct/100 : discFlat;
      const taxable  = base-disc;
      const gstAmt   = taxable*gstPct/100;
      const cgst     = intrastate ? gstAmt/2 : 0;
      const sgst     = intrastate ? gstAmt/2 : 0;
      const igst     = intrastate ? 0 : gstAmt;
      return {
        description: it.itemName||it.description||it.name||'—',
        hsnCode:     it.hsnCode||it.hsn||'',
        unit:        it.unit||it.uom||'NOS',
        qty, rate, disc, discStr:discPct>0?`${discPct}%`:discFlat>0?`₹${fmt(discFlat)}`:'—',
        taxable, gstPct, gstAmt, cgst, sgst, igst,
        total: taxable+gstAmt,
      };
    });

    /* Additional charges */
    const pnf = parseFloat(order.packingCharges)||0;
    const frt = parseFloat(order.freightCharges)||0;
    if (pnf>0) lines.push({ description:'Packing & Forwarding', hsnCode:'', unit:'LOT', qty:1, rate:pnf, disc:0, discStr:'—', taxable:pnf, gstPct:0, gstAmt:0, cgst:0, sgst:0, igst:0, total:pnf });
    if (frt>0) lines.push({ description:'Freight Charges', hsnCode:'', unit:'LOT', qty:1, rate:frt, disc:0, discStr:'—', taxable:frt, gstPct:0, gstAmt:0, cgst:0, sgst:0, igst:0, total:frt });

    (order.charges||[]).forEach(ch => {
      const amt=parseFloat(ch.amount)||0;
      const gst=parseFloat(ch.gst)||0;
      const gstA=amt*gst/100;
      const cgst=intrastate?gstA/2:0;
      const sgst=intrastate?gstA/2:0;
      const igst=intrastate?0:gstA;
      lines.push({ description:ch.chargeType||ch.description||'Charges', hsnCode:'', unit:'LOT',
        qty:1, rate:amt, disc:0, discStr:'—', taxable:amt, gstPct:gst, gstAmt:gstA, cgst, sgst, igst, total:amt+gstA });
    });

    const subTotal   = lines.reduce((s,l)=>s+l.taxable,0);
    const totalCGST  = lines.reduce((s,l)=>s+l.cgst,0);
    const totalSGST  = lines.reduce((s,l)=>s+l.sgst,0);
    const totalIGST  = lines.reduce((s,l)=>s+l.igst,0);
    const totalGST   = totalCGST+totalSGST+totalIGST;
    const grandTotal = subTotal+totalGST;
    return { lines, subTotal, totalCGST, totalSGST, totalIGST, totalGST, grandTotal, intrastate };
  };

  const { lines, subTotal, totalCGST, totalSGST, totalIGST, totalGST, grandTotal, intrastate } = calcLines();

  const handleSave = async () => {
    if (!selOrder) { setMsg('Select a Purchase Order'); return; }
    if (!billNo.trim()) { setMsg('Bill No is required'); return; }
    setSaving(true); setMsg('');
    try {
      const partyState = order?.vendorState||order?.shipFromState||'';
      await axios.post(`/api/bills?companyId=${cid}`, {
        type:         'purchase',
        billNo:       billNo.trim(),
        vendorBillNo: vendorBillNo.trim(),
        billDate,
        orderId:      selOrder,
        orderNo:      order?.poNo||order?.poNumber||`PO-${selOrder}`,
        partyName:    order?.vendorName||'—',
        partyGstin:   order?.vendorGstin||'',
        partyState,
        companyState,
        gstType:      intrastate?'intrastate':'interstate',
        items:        lines,
        subTotal,
        totalCGST:    intrastate?totalCGST:0,
        totalSGST:    intrastate?totalSGST:0,
        totalIGST:    intrastate?0:totalIGST,
        totalGST,
        grandTotal,
        companyId:    cid,
      });
      setMsg('Purchase bill saved successfully!');
      await load();
      setTimeout(()=>{ setView('list'); setMsg(''); setSelOrder(''); setOrder(null); }, 1200);
    } catch(e) { setMsg('Error: '+(e.response?.data?.error||e.message)); }
    setSaving(false);
  };

  const handleDelete = async (billId) => {
    if (!window.confirm(`Delete bill ${billId}?`)) return;
    await axios.delete(`/api/bills/${billId}?companyId=${cid}&type=purchase`).catch(()=>{});
    load();
  };

  /* ─────────── LIST VIEW ─────────── */
  if (view==='list') return (
    <div style={{ fontFamily:F, fontSize:12, padding:10 }}>
      <div style={{ background:P, color:'#fff', padding:'8px 14px', borderRadius:'7px 7px 0 0',
        display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
        <div>
          <div style={{ fontSize:14, fontWeight:800 }}>📄 Purchase Bills</div>
          <div style={{ fontSize:10, opacity:0.7, marginTop:1 }}>All received purchase invoices</div>
        </div>
        <button onClick={()=>setView('create')}
          style={{ height:30,padding:'0 16px',background:'#fff',border:'none',borderRadius:6,
            cursor:'pointer',color:P,fontSize:12,fontWeight:800,fontFamily:F }}>
          + New Bill
        </button>
      </div>

      <div style={{ border:'1px solid #D1FAE5', borderRadius:'0 0 7px 7px', overflow:'hidden' }}>
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11, fontFamily:F }}>
          <thead>
            <tr>
              {['Bill No','Vendor Bill No','Date','Purchase Order','Vendor','GST Type','Taxable (₹)','GST (₹)','Grand Total (₹)','Actions'].map((h,i) => (
                <th key={h} style={{ padding:'7px 10px', background:P, color:'#fff', fontSize:10,
                  fontWeight:700, textAlign:i>=6&&i<9?'right':'left', border:'1px solid #044333',
                  whiteSpace:'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={10} style={{ textAlign:'center',padding:30,color:'#9CA3AF',fontStyle:'italic' }}>Loading…</td></tr>
            ) : bills.length===0 ? (
              <tr><td colSpan={10} style={{ textAlign:'center',padding:36,color:'#9CA3AF',fontStyle:'italic' }}>
                No purchase bills yet — click [+ New Bill] to record one.
              </td></tr>
            ) : bills.sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)).map((b,i) => (
              <tr key={b.billId} style={{ background:i%2===0?'#fff':'#F0FDF4' }}>
                <td style={{ padding:'5px 10px',border:'1px solid #D1FAE5',fontWeight:700,color:P }}>{b.billNo}</td>
                <td style={{ padding:'5px 10px',border:'1px solid #D1FAE5',color:'#555' }}>{b.vendorBillNo||'—'}</td>
                <td style={{ padding:'5px 10px',border:'1px solid #D1FAE5' }}>{fmtD(b.billDate)}</td>
                <td style={{ padding:'5px 10px',border:'1px solid #D1FAE5',color:'#555' }}>{b.orderNo||'—'}</td>
                <td style={{ padding:'5px 10px',border:'1px solid #D1FAE5',fontWeight:600 }}>{b.partyName}</td>
                <td style={{ padding:'5px 10px',border:'1px solid #D1FAE5' }}>
                  <span style={{ padding:'1px 8px', borderRadius:4, fontSize:10, fontWeight:700,
                    background:b.gstType==='intrastate'?'#DCFCE7':'#EEF2FF',
                    color:b.gstType==='intrastate'?'#166534':'#4338CA' }}>
                    {b.gstType==='intrastate'?'CGST + SGST':'IGST'}
                  </span>
                </td>
                <td style={{ padding:'5px 10px',border:'1px solid #D1FAE5',textAlign:'right' }}>{fmt(b.subTotal)}</td>
                <td style={{ padding:'5px 10px',border:'1px solid #D1FAE5',textAlign:'right',color:'#7C3AED' }}>{fmt(b.totalGST)}</td>
                <td style={{ padding:'5px 10px',border:'1px solid #D1FAE5',textAlign:'right',fontWeight:700,color:P }}>{fmt(b.grandTotal)}</td>
                <td style={{ padding:'5px 10px',border:'1px solid #D1FAE5' }}>
                  <button onClick={()=>handleDelete(b.billId)}
                    style={{ padding:'2px 10px',fontSize:10,cursor:'pointer',background:'#FEF2F2',
                      color:'#DC2626',border:'1px solid #FECACA',borderRadius:4,fontFamily:F }}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
          {bills.length>0 && (
            <tfoot>
              <tr style={{ background:'#ECFDF5',fontWeight:700 }}>
                <td colSpan={6} style={{ padding:'6px 10px',border:'1px solid #D1FAE5',fontWeight:800 }}>TOTAL ({bills.length} bills)</td>
                <td style={{ padding:'6px 10px',border:'1px solid #D1FAE5',textAlign:'right',fontWeight:800 }}>
                  {fmt(bills.reduce((s,b)=>s+(parseFloat(b.subTotal)||0),0))}
                </td>
                <td style={{ padding:'6px 10px',border:'1px solid #D1FAE5',textAlign:'right',color:'#7C3AED',fontWeight:800 }}>
                  {fmt(bills.reduce((s,b)=>s+(parseFloat(b.totalGST)||0),0))}
                </td>
                <td style={{ padding:'6px 10px',border:'1px solid #D1FAE5',textAlign:'right',color:P,fontWeight:800 }}>
                  {fmt(bills.reduce((s,b)=>s+(parseFloat(b.grandTotal)||0),0))}
                </td>
                <td style={{ border:'1px solid #D1FAE5' }}/>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );

  /* ─────────── CREATE VIEW ─────────── */
  const partyState = order?.vendorState||order?.shipFromState||'';

  return (
    <div style={{ fontFamily:F, fontSize:12, padding:10 }}>
      <div style={{ background:P, color:'#fff', padding:'8px 14px', borderRadius:7,
        display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
        <div>
          <div style={{ fontSize:14, fontWeight:800 }}>📄 New Purchase Bill</div>
          <div style={{ fontSize:10, opacity:0.7, marginTop:1 }}>
            {companyState ? `Company State: ${companyState}` : 'Set company state in Admin for correct GST calculation'}
          </div>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={()=>{setView('list');setSelOrder('');setOrder(null);setMsg('');}}
            style={{ height:30,padding:'0 14px',background:'rgba(255,255,255,0.15)',border:'1px solid rgba(255,255,255,0.3)',
              color:'#fff',borderRadius:6,cursor:'pointer',fontSize:12,fontWeight:600,fontFamily:F }}>
            ← Back
          </button>
          <button onClick={handleSave} disabled={saving}
            style={{ height:30,padding:'0 18px',background:'#F59E0B',border:'none',borderRadius:6,
              cursor:saving?'not-allowed':'pointer',color:'#fff',fontSize:12,fontWeight:800,fontFamily:F,
              opacity:saving?0.7:1 }}>
            {saving?'Saving…':'✔ Save Bill'}
          </button>
        </div>
      </div>

      {msg && (
        <div style={{ marginBottom:10,padding:'8px 12px',borderRadius:6,fontSize:12,
          background:msg.startsWith('Error')?'#FEF2F2':'#ECFDF5',
          color:msg.startsWith('Error')?'#DC2626':'#059669',
          border:`1px solid ${msg.startsWith('Error')?'#FECACA':'#A7F3D0'}` }}>{msg}</div>
      )}

      {/* Bill meta */}
      <div style={{ background:'#fff',border:'1px solid #D1FAE5',borderRadius:8,padding:14,marginBottom:10 }}>
        <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr 1fr 2fr',gap:14 }}>
          <div>
            <label style={lbl}>Internal Bill No *</label>
            <input style={inp} value={billNo} onChange={e=>setBillNo(e.target.value)} placeholder="e.g. PB/2025-26/001"/>
          </div>
          <div>
            <label style={lbl}>Vendor Invoice No</label>
            <input style={inp} value={vendorBillNo} onChange={e=>setVendorBillNo(e.target.value)} placeholder="Vendor's invoice number"/>
          </div>
          <div>
            <label style={lbl}>Bill Date *</label>
            <input type="date" style={inp} value={billDate} onChange={e=>setBillDate(e.target.value)}/>
          </div>
          <div>
            <label style={lbl}>Select Purchase Order *</label>
            <select style={{ ...inp, cursor:'pointer' }} value={selOrder} onChange={e=>setSelOrder(e.target.value)}>
              <option value="">— Select Purchase Order —</option>
              {purchaseOrders.map(o => (
                <option key={o.orderId} value={o.orderId}>
                  {o.poNo||o.poNumber||`PO-${o.orderId}`} · {o.vendorName||'—'}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {order && (
        <>
          {/* Vendor info + GST type banner */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr auto', gap:10, marginBottom:10 }}>
            <div style={{ background:'#fff',border:'1px solid #D1FAE5',borderRadius:8,padding:12 }}>
              <div style={{ fontWeight:800,fontSize:12,color:'#1E293B',marginBottom:8 }}>Vendor Details</div>
              <div style={{ display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:10 }}>
                {[
                  { label:'Vendor Name',    val:order.vendorName||'—' },
                  { label:'GSTIN',          val:order.vendorGstin||'—' },
                  { label:'Vendor State',   val:partyState||'—' },
                  { label:'PO Reference',   val:order.poNo||order.poNumber||`PO-${order.orderId}` },
                ].map(x => (
                  <div key={x.label}>
                    <div style={{ fontSize:9,color:'#9CA3AF',textTransform:'uppercase',letterSpacing:'0.4px' }}>{x.label}</div>
                    <div style={{ fontSize:12,fontWeight:600,color:'#1E293B',marginTop:2 }}>{x.val}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* GST type badge */}
            <div style={{ background:intrastate?'#ECFDF5':'#EEF2FF', border:`2px solid ${intrastate?'#6EE7B7':'#A5B4FC'}`,
              borderRadius:8, padding:'12px 20px', display:'flex', flexDirection:'column',
              alignItems:'center', justifyContent:'center', minWidth:160 }}>
              <div style={{ fontSize:24, marginBottom:4 }}>{intrastate?'🏠':'✈️'}</div>
              <div style={{ fontSize:13,fontWeight:800,color:intrastate?'#059669':'#4338CA' }}>
                {intrastate?'INTRASTATE':'INTERSTATE'}
              </div>
              <div style={{ fontSize:10,color:'#6B7280',marginTop:3,textAlign:'center' }}>
                {intrastate?'CGST + SGST applies':'IGST applies'}
              </div>
              <div style={{ fontSize:9,color:'#9CA3AF',marginTop:4,textAlign:'center' }}>
                {companyState||'?'} → {partyState||'?'}
              </div>
            </div>
          </div>

          {/* Line items */}
          <div style={{ background:'#fff',border:'1px solid #D1FAE5',borderRadius:8,overflow:'hidden',marginBottom:10 }}>
            <div style={{ background:P,padding:'7px 14px',fontSize:11,fontWeight:800,color:'#fff',textTransform:'uppercase',letterSpacing:'0.6px' }}>
              Line Items
            </div>
            <div style={{ overflowX:'auto' }}>
              <table style={{ borderCollapse:'collapse',fontSize:11,fontFamily:F,minWidth:950,width:'100%' }}>
                <thead>
                  <tr>
                    <TH>#</TH>
                    <TH style={{ minWidth:200 }}>Item / Description</TH>
                    <TH align="center">HSN/SAC</TH>
                    <TH align="center">Unit</TH>
                    <TH align="right">Qty</TH>
                    <TH align="right">Rate (₹)</TH>
                    <TH align="right">Discount</TH>
                    <TH align="right">Taxable (₹)</TH>
                    <TH align="center">GST %</TH>
                    {intrastate ? (
                      <>
                        <TH align="right">CGST (₹)</TH>
                        <TH align="right">SGST (₹)</TH>
                      </>
                    ) : (
                      <TH align="right">IGST (₹)</TH>
                    )}
                    <TH align="right">Total (₹)</TH>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l,i) => (
                    <tr key={i} style={{ background:i%2===0?'#fff':'#F0FDF4' }}>
                      <TD align="center" color="#9CA3AF">{i+1}</TD>
                      <TD bold>{l.description}</TD>
                      <TD align="center" style={{ fontFamily:'monospace',fontSize:10,color:'#555' }}>{l.hsnCode||'—'}</TD>
                      <TD align="center">{l.unit}</TD>
                      <TD align="right" bold>{l.qty.toLocaleString('en-IN')}</TD>
                      <TD align="right">{fmt(l.rate)}</TD>
                      <TD align="right" color="#D97706">{l.discStr}</TD>
                      <TD align="right">{fmt(l.taxable)}</TD>
                      <TD align="center">{l.gstPct}%</TD>
                      {intrastate ? (
                        <>
                          <TD align="right" color="#059669">{fmt(l.cgst)}</TD>
                          <TD align="right" color="#059669">{fmt(l.sgst)}</TD>
                        </>
                      ) : (
                        <TD align="right" color="#4338CA">{fmt(l.igst)}</TD>
                      )}
                      <TD align="right" bold color={P}>{fmt(l.total)}</TD>
                    </tr>
                  ))}
                  {lines.length===0 && (
                    <tr><td colSpan={intrastate?12:11} style={{ textAlign:'center',padding:20,color:'#9CA3AF',fontStyle:'italic' }}>No line items in selected order</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Summary */}
          <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:10 }}>
            <div style={{ background:'#fff',border:'1px solid #D1FAE5',borderRadius:8,overflow:'hidden',minWidth:340 }}>
              <div style={{ background:P,padding:'6px 14px',fontSize:11,fontWeight:800,color:'#fff',textTransform:'uppercase',letterSpacing:'0.6px' }}>
                Bill Summary
              </div>
              <table style={{ borderCollapse:'collapse',width:'100%',fontSize:12,fontFamily:F }}>
                <tbody>
                  <tr>
                    <td style={{ padding:'7px 14px',borderBottom:'1px solid #F1F5F9',color:'#374151' }}>Taxable Amount</td>
                    <td style={{ padding:'7px 14px',borderBottom:'1px solid #F1F5F9',textAlign:'right',fontWeight:600 }}>₹{fmt(subTotal)}</td>
                  </tr>
                  {intrastate ? (
                    <>
                      <tr>
                        <td style={{ padding:'7px 14px',borderBottom:'1px solid #F1F5F9',color:'#059669' }}>CGST</td>
                        <td style={{ padding:'7px 14px',borderBottom:'1px solid #F1F5F9',textAlign:'right',color:'#059669',fontWeight:600 }}>₹{fmt(totalCGST)}</td>
                      </tr>
                      <tr>
                        <td style={{ padding:'7px 14px',borderBottom:'1px solid #F1F5F9',color:'#059669' }}>SGST</td>
                        <td style={{ padding:'7px 14px',borderBottom:'1px solid #F1F5F9',textAlign:'right',color:'#059669',fontWeight:600 }}>₹{fmt(totalSGST)}</td>
                      </tr>
                    </>
                  ) : (
                    <tr>
                      <td style={{ padding:'7px 14px',borderBottom:'1px solid #F1F5F9',color:'#4338CA' }}>IGST</td>
                      <td style={{ padding:'7px 14px',borderBottom:'1px solid #F1F5F9',textAlign:'right',color:'#4338CA',fontWeight:600 }}>₹{fmt(totalIGST)}</td>
                    </tr>
                  )}
                  <tr style={{ background:PL }}>
                    <td style={{ padding:'9px 14px',fontWeight:800,fontSize:13,color:'#1E293B' }}>Grand Total</td>
                    <td style={{ padding:'9px 14px',textAlign:'right',fontWeight:800,fontSize:14,color:P }}>₹{fmt(grandTotal)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
