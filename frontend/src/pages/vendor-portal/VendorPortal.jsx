import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { useVendorAuth } from '../../context/VendorAuthContext';

const F  = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const P  = '#1D4ED8';
const BG = '#F1F5F9';
const BD = '#E2E8F0';
const G  = '#059669';
const R  = '#DC2626';
const O  = '#D97706';

const STATUS = {
  approved:  { bg:'#ECFDF5', color:'#059669', label:'Approved' },
  pending:   { bg:'#FFFBEB', color:'#D97706', label:'Pending' },
  draft:     { bg:'#EFF6FF', color:'#2563EB', label:'Draft' },
  completed: { bg:'#F0FDF4', color:'#16A34A', label:'Completed' },
  cancelled: { bg:'#FEF2F2', color:'#DC2626', label:'Cancelled' },
  submitted: { bg:'#F5F3FF', color:'#7C3AED', label:'Submitted' },
  paid:      { bg:'#ECFDF5', color:'#059669', label:'Paid' },
};
const Badge = ({ s }) => {
  const c = STATUS[s] || { bg:'#F1F5F9', color:'#64748B', label: s || 'Unknown' };
  return <span style={{ padding:'2px 9px', borderRadius:20, fontSize:10, fontWeight:700, background:c.bg, color:c.color, fontFamily:F, whiteSpace:'nowrap' }}>{c.label}</span>;
};

const fmt  = n => `₹ ${Number(n||0).toFixed(2)}`;
const fmtD = d => { if (!d) return '—'; const s=String(d).slice(0,10); const [y,m,dy]=s.split('-'); return `${dy}-${m}-${y}`; };
const fmtSz= b => b>1048576?`${(b/1048576).toFixed(1)} MB`:`${Math.round(b/1024)} KB`;
const fileIcon = n => { const e=(n||'').split('.').pop().toLowerCase(); return e==='pdf'?'📄':['jpg','jpeg','png'].includes(e)?'🖼':['xlsx','xls'].includes(e)?'📊':['doc','docx'].includes(e)?'📝':'📎'; };

/* ─── Create Bill Modal ─── */
function CreateBillModal({ po, token, onClose, onCreated }) {
  // build already-billed qty map from existing bills
  const billedMap = {};
  (po.vendorBills || []).forEach(b => {
    (b.billItems || []).forEach(bi => {
      const k = (bi.itemName || '').toLowerCase().trim();
      billedMap[k] = (billedMap[k] || 0) + (parseFloat(bi.billedQty) || 0);
    });
  });

  // initialise rows — one per PO item, pre-filled with remaining qty
  const initRows = po.items.map(it => {
    const k = (it.itemName || '').toLowerCase().trim();
    const alreadyBilled = billedMap[k] || 0;
    const remaining = Math.max(0, (parseFloat(it.qty) || 0) - alreadyBilled);
    return { itemName: it.itemName, hsnCode: it.hsnCode || '', poQty: it.qty, unit: it.unit || 'NOS', rate: it.rate, gstPercent: it.gstPercent, alreadyBilled, billedQty: remaining };
  });

  const allCovered = po.items.length > 0 && po.items.every(it => {
    const k = (it.itemName || '').toLowerCase().trim();
    return (billedMap[k] || 0) >= (parseFloat(it.qty) || 0);
  });

  const [invoiceNo,   setInvoiceNo]   = useState('');
  const [invoiceDate, setInvoiceDate] = useState('');
  const [description, setDescription]= useState('');
  const [notes,       setNotes]       = useState('');
  const [rows,        setRows]        = useState(initRows);
  const [file,        setFile]        = useState(null);
  const [saving,      setSaving]      = useState(false);
  const [err,         setErr]         = useState('');
  const fileRef = useRef();

  const setQty = (i, v) => setRows(p => p.map((r,idx) => idx===i ? {...r, billedQty: v} : r));

  // calculate totals from rows
  const totals = rows.reduce((acc, r) => {
    const qty  = parseFloat(r.billedQty) || 0;
    const rate = parseFloat(r.rate)      || 0;
    const gstP = parseFloat(r.gstPercent)|| 0;
    const net  = qty * rate;
    const gst  = net * gstP / 100;
    acc.net  += net;
    acc.gst  += gst;
    acc.total+= net + gst;
    return acc;
  }, { net:0, gst:0, total:0 });

  const submit = async () => {
    if (!invoiceNo.trim()) { setErr('Invoice number is required.'); return; }
    if (!invoiceDate)      { setErr('Invoice date is required.'); return; }
    const hasQty = rows.some(r => parseFloat(r.billedQty) > 0);
    if (!hasQty) { setErr('Enter qty for at least one item.'); return; }
    // Validate no item exceeds remaining
    for (const r of rows) {
      const max = (parseFloat(r.poQty) || 0) - (r.alreadyBilled || 0);
      if ((parseFloat(r.billedQty) || 0) > max + 0.0001) {
        setErr(`Qty for "${r.itemName}" exceeds remaining balance (${max} ${r.unit}).`);
        return;
      }
    }
    setSaving(true); setErr('');
    try {
      const billItems = rows
        .filter(r => parseFloat(r.billedQty) > 0)
        .map(r => ({ itemName:r.itemName, hsnCode:r.hsnCode, billedQty:parseFloat(r.billedQty), unit:r.unit, rate:parseFloat(r.rate)||0, gstPercent:parseFloat(r.gstPercent)||0 }));
      const fd = new FormData();
      fd.append('invoiceNo',   invoiceNo);
      fd.append('invoiceDate', invoiceDate);
      fd.append('description', description);
      fd.append('notes',       notes);
      fd.append('billItems',   JSON.stringify(billItems));
      if (file) fd.append('billFile', file);
      const r = await fetch(`/api/vendor-portal/purchase-orders/${po.orderId}/create-bill`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      const data = await r.json();
      if (data.success) onCreated(data.bill);
      else setErr(data.error || 'Failed to submit bill.');
    } catch { setErr('Network error. Please try again.'); }
    setSaving(false);
  };

  const inpSt = { height:30, padding:'0 8px', border:`1px solid ${BD}`, borderRadius:4, fontSize:12, fontFamily:F, outline:'none', width:'100%', boxSizing:'border-box' };
  const lbl = (t, req) => <div style={{ fontSize:11, fontWeight:600, color:'#374151', marginBottom:3 }}>{t}{req&&<span style={{color:R}}> *</span>}</div>;

  if (allCovered) return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', zIndex:2000, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
      <div style={{ background:'#fff', width:'100%', maxWidth:440, borderRadius:10, overflow:'hidden', boxShadow:'0 20px 60px rgba(0,0,0,0.35)', fontFamily:F }}>
        <div style={{ background:`linear-gradient(135deg,#1E293B,${P})`, padding:'14px 20px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div style={{ fontSize:14, fontWeight:800, color:'#fff' }}>🧾 Create Bill</div>
          <button onClick={onClose} style={{ background:'rgba(255,255,255,0.15)', border:'1px solid rgba(255,255,255,0.3)', color:'#fff', width:28, height:28, borderRadius:6, cursor:'pointer', fontSize:16 }}>✕</button>
        </div>
        <div style={{ padding:'28px 24px', textAlign:'center' }}>
          <div style={{ fontSize:36, marginBottom:12 }}>✅</div>
          <div style={{ fontSize:14, fontWeight:700, color:'#065F46', marginBottom:8 }}>All Items Fully Billed</div>
          <div style={{ fontSize:12, color:'#374151', lineHeight:1.7 }}>All quantities for this PO have already been billed. No further bill can be submitted.</div>
          <button onClick={onClose} style={{ marginTop:18, padding:'8px 24px', background:P, color:'#fff', border:'none', borderRadius:6, cursor:'pointer', fontSize:12, fontWeight:700, fontFamily:F }}>Close</button>
        </div>
      </div>
    </div>
  );

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', zIndex:2000, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
      <div style={{ background:'#fff', width:'100%', maxWidth:680, maxHeight:'92vh', display:'flex', flexDirection:'column', borderRadius:10, overflow:'hidden', boxShadow:'0 20px 60px rgba(0,0,0,0.35)', fontFamily:F }}>
        <div style={{ background:`linear-gradient(135deg,#1E293B,${P})`, padding:'13px 20px', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
          <div>
            <div style={{ fontSize:14, fontWeight:800, color:'#fff' }}>🧾 Create Bill / Invoice</div>
            <div style={{ fontSize:11, color:'rgba(255,255,255,0.7)', marginTop:2 }}>for {po.poNumber}</div>
          </div>
          <button onClick={onClose} style={{ background:'rgba(255,255,255,0.15)', border:'1px solid rgba(255,255,255,0.3)', color:'#fff', width:28, height:28, borderRadius:6, cursor:'pointer', fontSize:16 }}>✕</button>
        </div>

        <div style={{ flex:1, overflowY:'auto', padding:'16px 20px', display:'flex', flexDirection:'column', gap:12 }}>
          {/* Invoice header */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <div>{lbl('Invoice No.',true)}<input value={invoiceNo} onChange={e=>setInvoiceNo(e.target.value)} placeholder="e.g. INV-2026-001" style={inpSt}/></div>
            <div>{lbl('Invoice Date',true)}<input type="date" value={invoiceDate} onChange={e=>setInvoiceDate(e.target.value)} style={inpSt}/></div>
          </div>

          {/* Item qty table */}
          <div>
            <div style={{ fontSize:11, fontWeight:700, color:P, marginBottom:6 }}>Item Quantities Being Billed <span style={{color:R}}>*</span></div>
            <div style={{ border:`1px solid ${BD}`, borderRadius:4, overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
                <thead>
                  <tr style={{ background:P }}>
                    {['Item','PO Qty','Already Billed','Remaining','Qty to Bill','Unit','Rate','GST%','Amount'].map(h=>(
                      <th key={h} style={{ padding:'5px 7px', color:'#fff', fontWeight:700, whiteSpace:'nowrap', textAlign:['PO Qty','Already Billed','Remaining','Qty to Bill','Rate','Amount'].includes(h)?'right':'left', borderRight:'1px solid #3B82F6' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r,i)=>{
                    const qty  = parseFloat(r.billedQty)||0;
                    const net  = qty*(parseFloat(r.rate)||0);
                    const gst  = net*(parseFloat(r.gstPercent)||0)/100;
                    const remaining = Math.max(0,(parseFloat(r.poQty)||0)-(r.alreadyBilled||0));
                    const overQty = qty > remaining + 0.0001;
                    return(
                      <tr key={i} style={{ background:i%2===0?'#fff':'#F8FAFC' }}>
                        <td style={{ padding:'4px 7px', border:`1px solid ${BD}`, fontWeight:600 }}>{r.itemName}</td>
                        <td style={{ padding:'4px 7px', border:`1px solid ${BD}`, textAlign:'right' }}>{r.poQty} {r.unit}</td>
                        <td style={{ padding:'4px 7px', border:`1px solid ${BD}`, textAlign:'right', color:r.alreadyBilled>0?O:'#9CA3AF' }}>{r.alreadyBilled}</td>
                        <td style={{ padding:'4px 7px', border:`1px solid ${BD}`, textAlign:'right', fontWeight:700, color:remaining>0?G:R }}>{remaining}</td>
                        <td style={{ padding:'4px 7px', border:`1px solid ${BD}`, width:80 }}>
                          <input type="number" min="0" max={remaining} step="any" value={r.billedQty}
                            onChange={e=>setQty(i,e.target.value)}
                            style={{ width:'100%', height:26, padding:'0 5px', border:`1px solid ${overQty?R:BD}`, borderRadius:3, fontSize:11, fontFamily:F, textAlign:'right', outline:'none', background:overQty?'#FEF2F2':'#fff' }}/>
                        </td>
                        <td style={{ padding:'4px 7px', border:`1px solid ${BD}`, color:'#6B7280' }}>{r.unit}</td>
                        <td style={{ padding:'4px 7px', border:`1px solid ${BD}`, textAlign:'right' }}>₹{Number(r.rate||0).toFixed(2)}</td>
                        <td style={{ padding:'4px 7px', border:`1px solid ${BD}`, textAlign:'right' }}>{r.gstPercent}%</td>
                        <td style={{ padding:'4px 7px', border:`1px solid ${BD}`, textAlign:'right', fontWeight:700, color:P }}>₹{(net+gst).toFixed(2)}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ background:'#EFF6FF' }}>
                    <td colSpan={8} style={{ padding:'5px 7px', fontWeight:700, textAlign:'right', fontFamily:F }}>Total</td>
                    <td style={{ padding:'5px 7px', fontWeight:800, textAlign:'right', color:P, fontFamily:F }}>₹{totals.total.toFixed(2)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            {/* Summary */}
            {totals.net > 0 && (
              <div style={{ display:'flex', gap:16, marginTop:6, fontSize:11, color:'#374151', fontFamily:F }}>
                <span>Net: <strong>₹{totals.net.toFixed(2)}</strong></span>
                <span>GST: <strong style={{color:O}}>₹{totals.gst.toFixed(2)}</strong></span>
                <span>Total: <strong style={{color:G}}>₹{totals.total.toFixed(2)}</strong></span>
              </div>
            )}
          </div>

          <div>{lbl('Description / Work Done',false)}
            <textarea value={description} onChange={e=>setDescription(e.target.value)} placeholder="Describe goods / work supplied…" rows={2}
              style={{ width:'100%', padding:'5px 8px', border:`1px solid ${BD}`, borderRadius:4, fontSize:12, fontFamily:F, resize:'vertical', outline:'none', boxSizing:'border-box' }}/>
          </div>

          <div>
            {lbl('Attach Invoice PDF / Image (optional)',false)}
            <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.xlsx,.xls,.doc,.docx"
              onChange={e=>setFile(e.target.files[0]||null)} style={{ fontSize:11, fontFamily:F, width:'100%' }}/>
            {file && <div style={{ fontSize:10, color:G, marginTop:3 }}>✓ {file.name} ({fmtSz(file.size)})</div>}
          </div>

          <div>{lbl('Notes / Remarks',false)}
            <textarea value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Any remarks…" rows={2}
              style={{ width:'100%', padding:'5px 8px', border:`1px solid ${BD}`, borderRadius:4, fontSize:12, fontFamily:F, resize:'vertical', outline:'none', boxSizing:'border-box' }}/>
          </div>

          {err && <div style={{ padding:'8px 12px', background:'#FEF2F2', border:`1px solid #FCA5A5`, borderRadius:5, fontSize:12, color:R, fontWeight:600 }}>{err}</div>}
        </div>

        <div style={{ padding:'10px 20px', borderTop:`1px solid ${BD}`, display:'flex', gap:10, justifyContent:'flex-end', flexShrink:0, background:'#F8FAFC' }}>
          <button onClick={onClose} style={{ padding:'7px 18px', borderRadius:6, border:`1px solid ${BD}`, background:'#fff', fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:F }}>Cancel</button>
          <button onClick={submit} disabled={saving}
            style={{ padding:'7px 22px', borderRadius:6, border:'none', background:saving?'#9CA3AF':G, color:'#fff', fontSize:12, fontWeight:700, cursor:saving?'default':'pointer', fontFamily:F }}>
            {saving?'Submitting…':'✓ Submit Bill'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── PO Card ─── */
function POCard({ po, token, payments }) {
  const [expanded, setExpanded]   = useState(false);
  const [showBill, setShowBill]   = useState(false);
  const [bills, setBills]         = useState(po.vendorBills || []);

  const dlUrl = (type, fn) => `/api/vendor-portal/purchase-orders/${po.orderId}/${type}/${encodeURIComponent(fn)}?token=${token}`;

  const siteLine = [po.siteName, po.siteCity].filter(Boolean).join(', ') || (po.linkedSO ? `Linked SO: ${po.linkedSO}` : '—');

  const poPayments = payments.filter(p =>
    String(p.poId || p.purchaseOrderId || p.orderId || '') === String(po.orderId) ||
    String(p.reference || '').includes(po.poNumber)
  );
  const paidTotal = poPayments.reduce((s,p)=>s+(Number(p.amount)||0),0);

  const calcAmt = it => {
    const base = (it.qty||0)*(it.rate||0);
    return base + base*(it.gstPercent||0)/100;
  };

  return (
    <div style={{ background:'#fff', border:`1px solid ${BD}`, borderRadius:10, overflow:'hidden', boxShadow:'0 1px 4px rgba(0,0,0,0.06)', marginBottom:14 }}>

      {/* Card Header */}
      <div style={{ padding:'12px 16px', background:'#F8FAFC', borderBottom:`1px solid ${BD}`, display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
            <span style={{ fontSize:15, fontWeight:800, color:P, fontFamily:F }}>📋 {po.poNumber}</span>
            <Badge s={po.status}/>
          </div>
          {/* Site Name — prominent */}
          <div style={{ display:'flex', alignItems:'center', gap:5, marginTop:5 }}>
            <span style={{ fontSize:12 }}>📍</span>
            <span style={{ fontSize:12, fontWeight:600, color:'#374151', fontFamily:F }}>{siteLine}</span>
          </div>
        </div>
        <div style={{ textAlign:'right', flexShrink:0 }}>
          <div style={{ fontSize:18, fontWeight:800, color:G, fontFamily:F }}>{fmt(po.totalAmount)}</div>
          <div style={{ fontSize:10, color:'#6B7280', fontFamily:F }}>Date: {fmtD(po.date)} {po.deliveryDate?`· Delivery: ${fmtD(po.deliveryDate)}`:''}</div>
        </div>
      </div>

      {/* Quick info row */}
      <div style={{ padding:'8px 16px', display:'flex', gap:20, flexWrap:'wrap', alignItems:'center', borderBottom:`1px solid ${BD}` }}>
        <div style={{ fontSize:11, color:'#6B7280', fontFamily:F }}>
          <span style={{ fontWeight:600, color:'#374151' }}>{po.items.length}</span> items
          {po.paymentTerms && <> · Terms: <span style={{ fontWeight:600, color:'#374151' }}>{po.paymentTerms}</span></>}
          {paidTotal > 0 && <> · Paid: <span style={{ fontWeight:600, color:G }}>{fmt(paidTotal)}</span></>}
        </div>
        <div style={{ marginLeft:'auto', display:'flex', gap:8, flexWrap:'wrap' }}>
          <button onClick={()=>setExpanded(e=>!e)}
            style={{ padding:'5px 12px', border:`1px solid ${BD}`, background:expanded?P:'#fff', color:expanded?'#fff':'#374151', borderRadius:5, cursor:'pointer', fontSize:11, fontWeight:600, fontFamily:F }}>
            {expanded ? '▲ Hide Details' : '▼ View Details'}
          </button>
          <button onClick={()=>setShowBill(true)}
            style={{ padding:'5px 14px', border:'none', background:G, color:'#fff', borderRadius:5, cursor:'pointer', fontSize:11, fontWeight:700, fontFamily:F }}>
            🧾 Create Bill
          </button>
        </div>
      </div>

      {/* Attachments — always visible */}
      {po.attachments.length > 0 && (
        <div style={{ padding:'8px 16px', borderBottom:`1px solid ${BD}`, display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', background:'#FAFAFA' }}>
          <span style={{ fontSize:11, fontWeight:700, color:'#374151', fontFamily:F, whiteSpace:'nowrap' }}>📎 Attachments:</span>
          {po.attachments.map((a,i)=>(
            <a key={i} href={dlUrl('attachment', a.fileName)} target="_blank" rel="noreferrer"
              style={{ display:'inline-flex', alignItems:'center', gap:4, padding:'3px 10px', background:'#EFF6FF', border:`1px solid #BFDBFE`, borderRadius:20, fontSize:11, color:P, textDecoration:'none', fontWeight:600, fontFamily:F }}>
              {fileIcon(a.fileName)} {a.name || a.fileName} {a.size?<span style={{color:'#93C5FD',fontSize:9}}>({fmtSz(a.size)})</span>:''}
            </a>
          ))}
        </div>
      )}

      {/* Expanded: items + bills */}
      {expanded && (
        <div style={{ padding:'14px 16px' }}>

          {/* Items */}
          <div style={{ marginBottom:14 }}>
            <div style={{ fontSize:11, fontWeight:700, color:P, fontFamily:F, marginBottom:6, borderBottom:`1px solid ${BD}`, paddingBottom:3 }}>Items</div>
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11, fontFamily:F }}>
                <thead>
                  <tr style={{ background:P }}>
                    {['#','Item','HSN','Qty','Unit','Rate','GST%','Amount'].map((h,i)=>(
                      <th key={i} style={{ padding:'5px 8px', color:'#fff', fontWeight:700, textAlign:i>=3?'right':'left', whiteSpace:'nowrap', borderRight:'1px solid #3B82F6' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {po.items.map((it,i)=>(
                    <tr key={i} style={{ background:i%2===0?'#fff':'#F8FAFC' }}>
                      <td style={{ padding:'5px 8px', border:`1px solid ${BD}`, color:'#9CA3AF' }}>{i+1}</td>
                      <td style={{ padding:'5px 8px', border:`1px solid ${BD}`, fontWeight:600, color:'#1E293B' }}>
                        {it.itemName}
                        {it.description&&<div style={{fontSize:9,color:'#6B7280'}}>{it.description}</div>}
                      </td>
                      <td style={{ padding:'5px 8px', border:`1px solid ${BD}`, color:'#6B7280' }}>{it.hsnCode||'—'}</td>
                      <td style={{ padding:'5px 8px', border:`1px solid ${BD}`, textAlign:'right' }}>{it.qty}</td>
                      <td style={{ padding:'5px 8px', border:`1px solid ${BD}` }}>{it.unit}</td>
                      <td style={{ padding:'5px 8px', border:`1px solid ${BD}`, textAlign:'right' }}>{fmt(it.rate)}</td>
                      <td style={{ padding:'5px 8px', border:`1px solid ${BD}`, textAlign:'right' }}>{it.gstPercent}%</td>
                      <td style={{ padding:'5px 8px', border:`1px solid ${BD}`, textAlign:'right', fontWeight:700, color:P }}>{fmt(calcAmt(it))}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ background:'#EFF6FF' }}>
                    <td colSpan={7} style={{ padding:'5px 8px', fontWeight:700, textAlign:'right', fontSize:12, fontFamily:F }}>Grand Total</td>
                    <td style={{ padding:'5px 8px', fontWeight:800, textAlign:'right', color:P, fontSize:13, fontFamily:F }}>{fmt(po.totalAmount)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Submitted Bills */}
          {bills.length > 0 && (
            <div>
              <div style={{ fontSize:11, fontWeight:700, color:P, fontFamily:F, marginBottom:6, borderBottom:`1px solid ${BD}`, paddingBottom:3 }}>Your Bills ({bills.length})</div>
              <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                {bills.map((b,i)=>(
                  <div key={i} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 12px', background:'#F0FDF4', border:`1px solid #A7F3D0`, borderRadius:6 }}>
                    <span style={{ fontSize:18 }}>🧾</span>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:12, fontWeight:700, color:'#065F46' }}>Invoice #{b.invoiceNo} — {fmtD(b.invoiceDate)}</div>
                      {b.description && <div style={{ fontSize:11, color:'#374151', marginTop:2 }}>📝 {b.description}</div>}
                      {b.notes && <div style={{ fontSize:11, color:'#374151', marginTop:2 }}>💬 {b.notes}</div>}
                      <div style={{ fontSize:10, color:'#6B7280', marginTop:1 }}>
                        Net: {fmt(b.netAmount)} · GST {b.gstPercent}%: {fmt(b.gstAmount)} · <strong>Total: {fmt(b.totalAmount)}</strong>
                        {b.submittedAt && ` · Submitted: ${fmtD(b.submittedAt?.slice(0,10))}`}
                      </div>
                    </div>
                    <div style={{ display:'flex', gap:6, alignItems:'center', flexShrink:0 }}>
                      <Badge s={b.status||'submitted'}/>
                      {b.fileName && (
                        <a href={dlUrl('bills', b.fileName)} target="_blank" rel="noreferrer"
                          style={{ padding:'4px 10px', background:G, color:'#fff', borderRadius:4, fontSize:10, fontWeight:700, textDecoration:'none', fontFamily:F }}>
                          ⬇ PDF
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {showBill && (
        <CreateBillModal
          po={po}
          token={token}
          onClose={()=>setShowBill(false)}
          onCreated={bill=>{setBills(prev=>[...prev,bill]);setShowBill(false);setExpanded(true);}}
        />
      )}
    </div>
  );
}

/* ════════════════════════ ACTIVATION PENDING ════════════════════════ */
function ActivationPending({ vendor, vendorLogout }) {
  return (
    <div style={{ fontFamily:F, background:'linear-gradient(135deg,#1E293B,#2563EB)', minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}>
      <div style={{ background:'#fff', borderRadius:16, boxShadow:'0 24px 60px rgba(0,0,0,0.3)', width:'100%', maxWidth:480, overflow:'hidden' }}>
        <div style={{ background:'linear-gradient(135deg,#1E293B,#2563EB)', padding:'24px 28px' }}>
          <div style={{ fontSize:11, color:'rgba(255,255,255,0.6)', fontWeight:600, letterSpacing:'1.5px', textTransform:'uppercase', marginBottom:6 }}>Epsilon Enterprise</div>
          <div style={{ fontSize:20, fontWeight:800, color:'#fff' }}>Vendor Portal</div>
        </div>
        <div style={{ padding:'32px 28px', textAlign:'center' }}>
          <div style={{ fontSize:48, marginBottom:12 }}>⏳</div>
          <div style={{ fontSize:18, fontWeight:800, color:'#1E293B', marginBottom:8 }}>Activation In Progress</div>
          <div style={{ fontSize:13, color:'#64748B', lineHeight:1.7, marginBottom:20 }}>
            Welcome, <strong>{vendor?.name}</strong>! Your registration is under review. You'll be notified once activated.
          </div>
          {vendor?.trackingNo && (
            <div style={{ background:'#EFF6FF', border:'2px dashed #93C5FD', borderRadius:8, padding:'14px', marginBottom:20 }}>
              <div style={{ fontSize:10, color:P, fontWeight:700, letterSpacing:'2px', textTransform:'uppercase', marginBottom:4 }}>Tracking No.</div>
              <div style={{ fontSize:18, fontWeight:900, color:'#1D4ED8', letterSpacing:3 }}>{vendor.trackingNo}</div>
            </div>
          )}
          <button onClick={vendorLogout} style={{ width:'100%', padding:'10px 0', borderRadius:8, cursor:'pointer', background:'#fff', border:'1px solid #D1D5DB', color:'#374151', fontSize:13, fontWeight:600, fontFamily:F }}>Sign Out</button>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════ DASHBOARD TAB ════════════════════════ */
function DashboardTab({ vendor, pos, payments }) {
  const totalPOVal    = pos.reduce((s,p)=>s+(Number(p.totalAmount)||0),0);
  const pendingCount  = pos.filter(p=>['pending','draft'].includes(p.status)).length;
  const completedCount= pos.filter(p=>['completed','approved'].includes(p.status)).length;
  const amtReceived   = payments.reduce((s,p)=>s+(Number(p.amount)||0),0);
  const outstanding   = Math.max(0, totalPOVal - amtReceived);

  const recentPOs  = [...pos].sort((a,b)=>new Date(b.date||0)-new Date(a.date||0)).slice(0,5);
  const recentPays = [...payments].sort((a,b)=>new Date(b.date||b.createdAt||0)-new Date(a.date||a.createdAt||0)).slice(0,5);

  const statCards = [
    { label:'Total POs',       val:pos.length,               icon:'📋', color:P,         sub:'purchase orders' },
    { label:'Pending',         val:pendingCount,             icon:'⏳', color:O,         sub:'awaiting completion' },
    { label:'Completed',       val:completedCount,           icon:'✅', color:G,         sub:'fulfilled orders' },
    { label:'Total PO Value',  val:`₹ ${totalPOVal.toFixed(2)}`,  icon:'🧾', color:'#7C3AED', sub:'gross value' },
    { label:'Amount Received', val:`₹ ${amtReceived.toFixed(2)}`, icon:'💰', color:G,         sub:'payments received' },
    { label:'Outstanding',     val:`₹ ${outstanding.toFixed(2)}`, icon:'⚠', color:outstanding>0?R:'#9CA3AF', sub:'amount pending' },
  ];

  return (
    <div style={{ padding:'20px', display:'flex', flexDirection:'column', gap:20 }}>

      {/* Welcome */}
      <div style={{ background:`linear-gradient(135deg,#1E293B,${P})`, borderRadius:10, padding:'18px 24px', display:'flex', alignItems:'center', gap:16 }}>
        <div style={{ width:52, height:52, borderRadius:14, background:'rgba(255,255,255,0.15)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:24, flexShrink:0 }}>🏢</div>
        <div>
          <div style={{ fontSize:18, fontWeight:800, color:'#fff' }}>Welcome back, {vendor?.name}!</div>
          <div style={{ fontSize:12, color:'rgba(255,255,255,0.65)', marginTop:3 }}>Vendor ID: {vendor?.vendorId} · {vendor?.email}</div>
        </div>
      </div>

      {/* Stat cards */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12 }}>
        {statCards.map((c,i)=>(
          <div key={i} style={{ background:'#fff', borderRadius:8, border:`1px solid ${BD}`, padding:'14px 18px', boxShadow:'0 1px 4px rgba(0,0,0,0.05)' }}>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
              <span style={{ fontSize:18 }}>{c.icon}</span>
              <span style={{ fontSize:11, fontWeight:600, color:'#6B7280', fontFamily:F }}>{c.label}</span>
            </div>
            <div style={{ fontSize:22, fontWeight:800, color:c.color, fontFamily:F }}>{c.val}</div>
            <div style={{ fontSize:10, color:'#9CA3AF', marginTop:3, fontFamily:F }}>{c.sub}</div>
          </div>
        ))}
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>

        {/* Recent POs */}
        <div style={{ background:'#fff', borderRadius:8, border:`1px solid ${BD}`, overflow:'hidden' }}>
          <div style={{ background:P, padding:'10px 14px', fontSize:12, fontWeight:700, color:'#fff' }}>📋 Recent Purchase Orders</div>
          {recentPOs.length === 0
            ? <div style={{ padding:'20px', textAlign:'center', fontSize:12, color:'#9CA3AF' }}>No purchase orders yet.</div>
            : <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
                <thead>
                  <tr style={{ background:'#F8FAFC' }}>
                    {['PO No.','Date','Amount','Status'].map(h=>(
                      <th key={h} style={{ padding:'6px 10px', fontWeight:600, color:'#374151', textAlign:'left', borderBottom:`1px solid ${BD}`, fontFamily:F }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {recentPOs.map((po,i)=>(
                    <tr key={i} style={{ background:i%2===0?'#fff':'#F8FAFC' }}>
                      <td style={{ padding:'7px 10px', borderBottom:`1px solid ${BD}`, fontWeight:600, color:P, fontFamily:F }}>{po.poNumber}</td>
                      <td style={{ padding:'7px 10px', borderBottom:`1px solid ${BD}`, color:'#6B7280', fontFamily:F }}>{fmtD(po.date)}</td>
                      <td style={{ padding:'7px 10px', borderBottom:`1px solid ${BD}`, fontWeight:700, color:G, fontFamily:F }}>{fmt(po.totalAmount)}</td>
                      <td style={{ padding:'7px 10px', borderBottom:`1px solid ${BD}`, fontFamily:F }}><Badge s={po.status}/></td>
                    </tr>
                  ))}
                </tbody>
              </table>
          }
        </div>

        {/* Recent Payments */}
        <div style={{ background:'#fff', borderRadius:8, border:`1px solid ${BD}`, overflow:'hidden' }}>
          <div style={{ background:'#065F46', padding:'10px 14px', fontSize:12, fontWeight:700, color:'#fff' }}>💰 Recent Payments</div>
          {recentPays.length === 0
            ? <div style={{ padding:'20px', textAlign:'center', fontSize:12, color:'#9CA3AF' }}>No payment records yet.</div>
            : <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
                <thead>
                  <tr style={{ background:'#F8FAFC' }}>
                    {['Date','Description','Amount','Mode'].map(h=>(
                      <th key={h} style={{ padding:'6px 10px', fontWeight:600, color:'#374151', textAlign:'left', borderBottom:`1px solid ${BD}`, fontFamily:F }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {recentPays.map((p,i)=>(
                    <tr key={i} style={{ background:i%2===0?'#fff':'#F8FAFC' }}>
                      <td style={{ padding:'7px 10px', borderBottom:`1px solid ${BD}`, color:'#6B7280', fontFamily:F }}>{fmtD(p.date||p.createdAt)}</td>
                      <td style={{ padding:'7px 10px', borderBottom:`1px solid ${BD}`, fontFamily:F, maxWidth:120, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{p.description||p.narration||'—'}</td>
                      <td style={{ padding:'7px 10px', borderBottom:`1px solid ${BD}`, fontWeight:700, color:G, fontFamily:F }}>₹ {Number(p.amount||0).toFixed(2)}</td>
                      <td style={{ padding:'7px 10px', borderBottom:`1px solid ${BD}`, color:'#6B7280', fontFamily:F }}>{p.mode||p.paymentMode||'—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
          }
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════ MAIN PORTAL ════════════════════════ */
export default function VendorPortal() {
  const { vendor, vendorLogout } = useVendorAuth();
  const [tab,      setTab]      = useState('dashboard');
  const [pos,      setPOs]      = useState([]);
  const [payments, setPayments] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const token = localStorage.getItem('vendorToken') || '';

  useEffect(() => {
    const headers = { Authorization: `Bearer ${token}` };
    setLoading(true);
    Promise.all([
      axios.get('/api/vendor-portal/purchase-orders', { headers }),
      axios.get('/api/vendor-portal/payments',        { headers }),
    ])
      .then(([r1,r2])=>{ setPOs(r1.data||[]); setPayments(r2.data||[]); })
      .catch(console.error)
      .finally(()=>setLoading(false));
  }, [token]);

  if (vendor?.pending) return <ActivationPending vendor={vendor} vendorLogout={vendorLogout}/>;

  const TABS = [
    { id:'dashboard', label:'🏠 Dashboard' },
    { id:'pos',       label:'📋 Purchase Orders' },
    { id:'payments',  label:'💰 Payments' },
    { id:'profile',   label:'👤 Profile' },
  ];

  return (
    <div style={{ fontFamily:F, background:BG, minHeight:'100vh', display:'flex', flexDirection:'column' }}>

      {/* Header */}
      <div style={{ background:'linear-gradient(135deg,#1E293B,#1D4ED8)', padding:'11px 24px', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <div style={{ fontSize:12, fontWeight:700, color:'#fff', background:'rgba(255,255,255,0.12)', padding:'5px 10px', borderRadius:6 }}>⚡ Super ERP System</div>
          <div style={{ fontSize:12, color:'rgba(255,255,255,0.7)' }}>Vendor Portal</div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ textAlign:'right' }}>
            <div style={{ fontSize:13, fontWeight:700, color:'#fff' }}>{vendor?.name}</div>
            <div style={{ fontSize:10, color:'rgba(255,255,255,0.6)' }}>ID: {vendor?.vendorId} · {vendor?.email}</div>
          </div>
          <button onClick={vendorLogout} style={{ padding:'5px 12px', borderRadius:6, cursor:'pointer', background:'rgba(255,255,255,0.1)', border:'1px solid rgba(255,255,255,0.25)', color:'#fff', fontSize:12, fontFamily:F }}>Logout</button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ background:'#fff', borderBottom:`1px solid ${BD}`, display:'flex', padding:'0 20px', flexShrink:0 }}>
        {TABS.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)} style={{ padding:'10px 16px', cursor:'pointer', fontFamily:F, fontWeight:tab===t.id?700:500, fontSize:12, background:'transparent', border:'none', borderBottom:tab===t.id?`2px solid ${P}`:'2px solid transparent', color:tab===t.id?P:'#64748B', marginBottom:-1 }}>{t.label}</button>
        ))}
      </div>

      {/* Body */}
      <div style={{ flex:1, overflowY:'auto' }}>
        {loading ? (
          <div style={{ textAlign:'center', padding:60, color:'#94A3B8', fontSize:14 }}>Loading your data…</div>
        ) : (
          <>
            {tab === 'dashboard' && <DashboardTab vendor={vendor} pos={pos} payments={payments}/>}

            {/* PO Cards */}
            {tab === 'pos' && (
              <div style={{ padding:'16px 20px' }}>
                {pos.length === 0
                  ? <div style={{ textAlign:'center', padding:60, color:'#94A3B8', fontSize:13 }}>No purchase orders found for your account.</div>
                  : pos.map(po => <POCard key={po.orderId} po={po} token={token} payments={payments}/>)
                }
              </div>
            )}

            {/* Payments */}
            {tab === 'payments' && (
              <div style={{ padding:'16px 20px' }}>
                {payments.length === 0
                  ? <div style={{ textAlign:'center', padding:60, color:'#94A3B8', fontSize:13 }}>No payment records found.</div>
                  : (
                  <div style={{ background:'#fff', borderRadius:8, border:`1px solid ${BD}`, overflow:'hidden' }}>
                    <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                      <thead>
                        <tr>
                          {['Date','Description','Amount','Mode','Status'].map(h=>(
                            <th key={h} style={{ padding:'9px 12px', background:P, color:'#fff', fontSize:11, fontWeight:700, textAlign:'left', fontFamily:F }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {payments.map((p,i)=>(
                          <tr key={i} style={{ background:i%2===0?'#fff':'#F8FAFC' }}>
                            <td style={{ padding:'9px 12px', borderBottom:`1px solid ${BD}`, fontFamily:F }}>{fmtD(p.date||p.createdAt)}</td>
                            <td style={{ padding:'9px 12px', borderBottom:`1px solid ${BD}`, fontFamily:F }}>{p.description||p.narration||'—'}</td>
                            <td style={{ padding:'9px 12px', borderBottom:`1px solid ${BD}`, fontWeight:700, color:G, fontFamily:F }}>₹ {Number(p.amount||0).toFixed(2)}</td>
                            <td style={{ padding:'9px 12px', borderBottom:`1px solid ${BD}`, fontFamily:F }}>{p.mode||p.paymentMode||'—'}</td>
                            <td style={{ padding:'9px 12px', borderBottom:`1px solid ${BD}`, fontFamily:F }}><Badge s={p.status}/></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* Profile */}
            {tab === 'profile' && (
              <div style={{ padding:'16px 20px' }}>
                <div style={{ maxWidth:480, background:'#fff', borderRadius:10, border:`1px solid ${BD}`, overflow:'hidden' }}>
                  <div style={{ background:`linear-gradient(135deg,#1E293B,${P})`, padding:'18px 20px', display:'flex', alignItems:'center', gap:14 }}>
                    <div style={{ width:48, height:48, borderRadius:12, background:'rgba(255,255,255,0.18)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:22, flexShrink:0 }}>🏢</div>
                    <div>
                      <div style={{ fontSize:15, fontWeight:700, color:'#fff' }}>{vendor?.name}</div>
                      <div style={{ fontSize:11, color:'rgba(255,255,255,0.65)', marginTop:2 }}>Vendor ID: {vendor?.vendorId}</div>
                    </div>
                  </div>
                  <div style={{ padding:'14px 18px' }}>
                    {[['Email', vendor?.email],['Company ID', vendor?.companyId],['Vendor ID', vendor?.vendorId],['Portal Access','Active']].map(([l,v])=>(
                      <div key={l} style={{ display:'flex', padding:'9px 0', borderBottom:`1px solid #F1F5F9` }}>
                        <span style={{ fontSize:12, color:'#6B7280', fontWeight:600, minWidth:140 }}>{l}</span>
                        <span style={{ fontSize:12, color:'#1E293B' }}>{v||'—'}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
