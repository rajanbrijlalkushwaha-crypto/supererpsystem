import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { useCompany } from '../../../context/CompanyContext';
import { useAuth } from '../../../context/AuthContext';
import { can } from '../../../utils/permissions';

const F  = "'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif";
const PU = '#6d28d9';
const BD = '#E5EAF2';
const GST_RATES = [0, 5, 12, 18, 28];
const UNITS     = ['Nos','Kg','L','M','Sqft','Box','Set','Pair','Pcs','MT'];

const RETURN_REASONS   = ['Goods Returned by Customer','Damaged Goods Returned','Quality Rejection','Short Delivery Billed','Sales Return'];
const DISCOUNT_REASONS = ['Discount Allowed','Price Correction','Promotional Discount','Loyalty Discount','Other'];

const inp = (ex={}) => ({ height:34, padding:'0 10px', border:`1px solid ${BD}`, borderRadius:6, fontSize:12, fontFamily:F, outline:'none', background:'#fff', width:'100%', boxSizing:'border-box', ...ex });
const lbl = { fontSize:11, fontWeight:600, color:'#374151', marginBottom:3, display:'block' };
const card = { background:'#fff', border:`1px solid ${BD}`, borderRadius:10, overflow:'hidden', boxShadow:'0 1px 4px rgba(0,0,0,0.05)', marginBottom:14 };
const SH = (color=PU) => ({ background:color, padding:'9px 14px', fontSize:11, fontWeight:700, color:'#fff', textTransform:'uppercase', letterSpacing:'0.6px', display:'flex', justifyContent:'space-between', alignItems:'center' });
const fmt = n => (parseFloat(n)||0).toFixed(2);
const newLine = () => ({ _id:Date.now()+Math.random(), productName:'', qty:'1', unit:'Nos', rate:'', gstPercent:'18', maxQty:null });

const stepBadge = (n, active) => ({
  width:24, height:24, borderRadius:'50%', display:'inline-flex', alignItems:'center', justifyContent:'center',
  fontSize:11, fontWeight:800, marginRight:8, flexShrink:0,
  background: active ? PU : '#e5e7eb', color: active ? '#fff' : '#6b7280',
});

/* ── Client Search Popup ── */
function ClientPopup({ clients, onSelect, onClose }) {
  const [q, setQ] = useState('');
  const ref = useRef();
  useEffect(() => { ref.current?.focus(); }, []);
  const list = clients.filter(n => !q || n.toLowerCase().includes(q.toLowerCase()));
  const exactMatch = list.find(n => n.toLowerCase() === q.toLowerCase());
  return (
    <div onClick={e => e.target===e.currentTarget && onClose()}
      style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:9000, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
      <div style={{ background:'#fff', borderRadius:12, width:'100%', maxWidth:500, maxHeight:'72vh', display:'flex', flexDirection:'column', boxShadow:'0 20px 60px rgba(0,0,0,0.25)' }}>
        <div style={{ background:PU, color:'#fff', padding:'12px 16px', borderRadius:'12px 12px 0 0', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <span style={{ fontWeight:700, fontFamily:F, fontSize:13 }}>Select Client</span>
          <button onClick={onClose} style={{ background:'rgba(255,255,255,0.15)', border:'none', borderRadius:6, color:'#fff', width:28, height:28, cursor:'pointer', fontSize:16 }}>✕</button>
        </div>
        <div style={{ padding:'10px 14px', borderBottom:`1px solid ${BD}` }}>
          <input ref={ref} value={q} onChange={e=>setQ(e.target.value)} placeholder="Search client name…" style={{ ...inp(), width:'100%' }}/>
        </div>
        <div style={{ flex:1, overflowY:'auto' }}>
          {/* Manual entry row when typed name not in list */}
          {q && !exactMatch && (
            <div onClick={()=>{ onSelect(q); onClose(); }}
              style={{ padding:'10px 16px', borderBottom:`1px solid ${BD}`, cursor:'pointer', background:'#fffbeb', fontFamily:F }}
              onMouseEnter={e=>e.currentTarget.style.background='#fef9c3'}
              onMouseLeave={e=>e.currentTarget.style.background='#fffbeb'}>
              <span style={{ fontWeight:700, color:'#92400e' }}>Use "{q}"</span>
              <span style={{ fontSize:11, color:'#6b7280', marginLeft:8 }}>enter manually</span>
            </div>
          )}
          {list.map((name,i) => (
            <div key={i} onClick={()=>{ onSelect(name); onClose(); }}
              style={{ padding:'11px 16px', borderBottom:`1px solid ${BD}`, cursor:'pointer', fontFamily:F }}
              onMouseEnter={e=>e.currentTarget.style.background='#f5f3ff'}
              onMouseLeave={e=>e.currentTarget.style.background='#fff'}>
              <span style={{ fontWeight:600, fontSize:13, color:'#111827' }}>{name}</span>
            </div>
          ))}
          {list.length===0 && !q && (
            <div style={{ padding:24, textAlign:'center', color:'#9ca3af', fontSize:12, fontFamily:F }}>
              No clients found from bills.<br/>Type a name above to enter manually.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Bill Search Popup ── */
function BillSearchPopup({ bills, title='Select Sales Bill', onSelect, onClose }) {
  const [q, setQ] = useState('');
  const ref = useRef();
  useEffect(() => { ref.current?.focus(); }, []);
  const list = bills.filter(b => {
    const s = (b.billNo||'')+(b.partyName||'')+(b.billId||'');
    return !q || s.toLowerCase().includes(q.toLowerCase());
  });
  return (
    <div onClick={e => e.target===e.currentTarget && onClose()}
      style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:9000, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
      <div style={{ background:'#fff', borderRadius:12, width:'100%', maxWidth:660, maxHeight:'80vh', display:'flex', flexDirection:'column', boxShadow:'0 20px 60px rgba(0,0,0,0.25)' }}>
        <div style={{ background:PU, color:'#fff', padding:'12px 16px', borderRadius:'12px 12px 0 0', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <span style={{ fontWeight:700, fontFamily:F, fontSize:13 }}>{title}</span>
          <button onClick={onClose} style={{ background:'rgba(255,255,255,0.15)', border:'none', borderRadius:6, color:'#fff', width:28, height:28, cursor:'pointer', fontSize:16 }}>✕</button>
        </div>
        <div style={{ padding:'10px 14px', borderBottom:`1px solid ${BD}` }}>
          <input ref={ref} value={q} onChange={e=>setQ(e.target.value)} placeholder="Search by bill no…" style={{ ...inp(), width:'100%' }}/>
        </div>
        <div style={{ flex:1, overflowY:'auto' }}>
          {list.length===0 && <div style={{ padding:24, textAlign:'center', color:'#9ca3af', fontFamily:F }}>No bills found</div>}
          {list.map((b,i) => (
            <div key={i} onClick={()=>{ onSelect(b); onClose(); }}
              style={{ padding:'10px 16px', borderBottom:`1px solid ${BD}`, cursor:'pointer', fontFamily:F }}
              onMouseEnter={e=>e.currentTarget.style.background='#f5f3ff'}
              onMouseLeave={e=>e.currentTarget.style.background='#fff'}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <div>
                  <span style={{ fontWeight:700, fontSize:13, color:PU }}>{b.billNo||b.billId}</span>
                  <span style={{ marginLeft:10, fontSize:12, color:'#374151' }}>{b.partyName}</span>
                </div>
                <div style={{ textAlign:'right' }}>
                  <div style={{ fontSize:12, fontWeight:600, color:'#111827' }}>₹{fmt(b.grandTotal)}</div>
                  <div style={{ fontSize:10, color:'#9ca3af' }}>{b.billDate}</div>
                </div>
              </div>
              <div style={{ fontSize:11, color:'#6b7280', marginTop:3 }}>{(b.items||[]).length} items</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════ */
export default function CreditNoteCreate() {
  const { selectedCompany } = useCompany();
  const { user } = useAuth();
  const cid = selectedCompany?.companyId;
  const navigate = useNavigate();

  const [noteType, setNoteType] = useState('goods-return');

  /* Bills list */
  const [bills, setBills] = useState([]);
  useEffect(() => {
    if (!cid) return;
    axios.get(`/api/bills?companyId=${cid}&type=sales`).then(r => setBills(r.data||[])).catch(()=>{});
  }, [cid]);

  /* Unique client names derived from bills */
  const clientNames = useMemo(() => {
    const seen = new Set();
    return bills.filter(b => b.partyName && !seen.has(b.partyName) && seen.add(b.partyName)).map(b => b.partyName);
  }, [bills]);

  /* Popup state */
  const [showClientPop, setShowClientPop] = useState(false);
  const [showBillPop,   setShowBillPop]   = useState(false);

  /* Selected bill (Goods Return) */
  const [selectedBill, setSelectedBill] = useState(null);

  /* Common fields */
  const [clientName, setClientName] = useState('');
  const [billRef,    setBillRef]    = useState('');
  const [date,       setDate]       = useState(new Date().toISOString().slice(0,10));
  const [reason,     setReason]     = useState('');
  const [narration,  setNarration]  = useState('');
  const [lines,      setLines]      = useState([newLine()]);

  /* Discount fields */
  const [discountAmt, setDiscountAmt] = useState('');
  const [discountGst, setDiscountGst] = useState('0');

  const [saving, setSaving] = useState(false);
  const [msg,    setMsg]    = useState({ text:'', ok:true });

  /* Bills filtered to the selected client (for Discount mode) */
  const clientBills = useMemo(() =>
    bills.filter(b => b.partyName === clientName),
  [bills, clientName]);

  /* Reset on type switch */
  const switchType = (t) => {
    setNoteType(t); setReason(''); setSelectedBill(null);
    setClientName(''); setBillRef(''); setLines([newLine()]);
    setDiscountAmt(''); setDiscountGst('0');
  };

  /* Pick a bill — client already selected; fill items only in goods-return mode */
  const pickBill = useCallback((bill) => {
    setSelectedBill(bill);
    setBillRef(bill.billNo || bill.billId || '');
    if (noteType === 'goods-return') {
      setLines((bill.items||[]).map(it => ({
        _id: Date.now()+Math.random(),
        productName: it.description || it.productName || '',
        qty: '',
        unit: it.unit || 'Nos',
        rate: String(it.rate || ''),
        gstPercent: String(it.gstPct || it.gstPercent || '18'),
        maxQty: parseFloat(it.qty) || null,
        originalQty: parseFloat(it.qty) || 0,
      })));
    }
  }, [noteType]);

  const updateLine = (id, field, val) => setLines(p => p.map(l => {
    if (l._id !== id) return l;
    if (field==='qty' && l.maxQty && parseFloat(val) > l.maxQty) val = String(l.maxQty);
    return { ...l, [field]: val };
  }));
  const removeLine = id => { if (lines.length>1) setLines(p=>p.filter(l=>l._id!==id)); };

  const calc = noteType==='goods-return'
    ? lines.map(l => { const t=(parseFloat(l.qty)||0)*(parseFloat(l.rate)||0); const g=t*(parseFloat(l.gstPercent)||0)/100; return {taxable:t,gst:g,total:t+g}; })
    : [{ taxable:parseFloat(discountAmt)||0, gst:(parseFloat(discountAmt)||0)*(parseFloat(discountGst)||0)/100, total:0 }];
  const subTotal   = calc.reduce((s,c)=>s+c.taxable,0);
  const totalGST   = calc.reduce((s,c)=>s+c.gst,0);
  const grandTotal = noteType==='discount' ? subTotal+totalGST : calc.reduce((s,c)=>s+c.total,0);

  const handleSubmit = async (status) => {
    if (!clientName) { setMsg({text:'Please select a client.',ok:false}); return; }
    if (!date)       { setMsg({text:'Date is required.',ok:false}); return; }
    if (!reason)     { setMsg({text:'Please select a reason.',ok:false}); return; }
    let items;
    if (noteType==='goods-return') {
      const valid = lines.filter(l=>l.productName&&parseFloat(l.qty)>0&&l.rate);
      if (!valid.length) { setMsg({text:'Add at least one item with qty and rate.',ok:false}); return; }
      items = valid.map(({_id,maxQty,originalQty,...r})=>r);
    } else {
      if (!discountAmt||parseFloat(discountAmt)<=0) { setMsg({text:'Enter discount amount.',ok:false}); return; }
      items = [{ productName:'Discount', qty:'1', unit:'Nos', rate:discountAmt, gstPercent:discountGst }];
    }
    try {
      setSaving(true);
      const res = await axios.post(`/api/accounts/credit-notes?companyId=${cid}`, {
        companyId:cid, date, clientName, billRef, noteType, reason, narration, status, items,
        linkedBillId: selectedBill?.billId || '', subTotal, totalGST, grandTotal,
      });
      setMsg({text:`Credit Note ${res.data.cnNo} created successfully!`,ok:true});
      setTimeout(()=>navigate('/account/credit-note/view'),1200);
    } catch(e) {
      setMsg({text:'Error: '+(e.response?.data?.error||e.message),ok:false});
    } finally { setSaving(false); }
  };

  const reasons = noteType==='goods-return' ? RETURN_REASONS : DISCOUNT_REASONS;

  return (
    <div style={{ fontFamily:F, background:'#f0f4fb', minHeight:'100vh', padding:'14px 16px' }}>

      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
        <div>
          <div style={{ fontSize:11, color:'#6b7280', marginBottom:2 }}>Account → Credit Note</div>
          <div style={{ fontSize:18, fontWeight:800, color:'#111827' }}>Create Credit Note</div>
        </div>
        <button onClick={()=>navigate('/account/credit-note/view')}
          style={{ height:34, padding:'0 16px', background:'#fff', border:`1px solid ${BD}`, borderRadius:7, fontSize:12, cursor:'pointer', fontFamily:F }}>← Back</button>
      </div>

      {msg.text && (
        <div style={{ background:msg.ok?'#f5f3ff':'#fef2f2', border:`1px solid ${msg.ok?'#ddd6fe':'#fecaca'}`,
          borderRadius:8, padding:'10px 14px', marginBottom:14, fontSize:12.5, color:msg.ok?PU:'#dc2626' }}>
          {msg.text}
        </div>
      )}

      {/* ── Type Toggle ── */}
      <div style={card}>
        <div style={{ padding:'12px 16px' }}>
          <label style={{ ...lbl, marginBottom:8 }}>Credit Note Type *</label>
          <div style={{ display:'flex', gap:10 }}>
            {[['goods-return','📦 Goods Return','Customer returning goods against a sales bill'],
              ['discount','💰 Discount / Price Correction','Issuing discount or price adjustment to client']
            ].map(([val,label,desc])=>(
              <button key={val} onClick={()=>switchType(val)}
                style={{ flex:1, padding:'12px 16px', border:`2px solid ${noteType===val?PU:BD}`, borderRadius:8,
                  background:noteType===val?'#f5f3ff':'#fff', cursor:'pointer', textAlign:'left', fontFamily:F }}>
                <div style={{ fontSize:13, fontWeight:800, color:noteType===val?PU:'#374151', marginBottom:4 }}>{label}</div>
                <div style={{ fontSize:11, color:'#6b7280' }}>{desc}</div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ══════════════ GOODS RETURN FLOW ══════════════ */}
      {noteType==='goods-return' && (
        <>
          <div style={card}>
            <div style={SH()}>Return Details</div>
            <div style={{ padding:'14px 16px' }}>

              {/* Step 1: Client */}
              <div style={{ marginBottom:18 }}>
                <div style={{ display:'flex', alignItems:'center', marginBottom:8 }}>
                  <div style={stepBadge(1, true)}>1</div>
                  <span style={{ fontSize:12, fontWeight:700, color:'#111827' }}>Select Client</span>
                </div>
                {clientName ? (
                  <div style={{ display:'flex', alignItems:'center', gap:12, background:'#f5f3ff', border:`1px solid #ddd6fe`, borderRadius:8, padding:'10px 14px' }}>
                    <div style={{ flex:1, fontWeight:800, fontSize:14, color:PU }}>👤 {clientName}</div>
                    <button onClick={()=>{ setClientName(''); setSelectedBill(null); setBillRef(''); setLines([newLine()]); }}
                      style={{ background:'#fee2e2', border:'1px solid #fca5a5', borderRadius:6, color:'#dc2626', padding:'5px 12px', cursor:'pointer', fontSize:12, fontWeight:700 }}>
                      ✕ Change
                    </button>
                  </div>
                ) : (
                  <button onClick={()=>setShowClientPop(true)}
                    style={{ height:38, padding:'0 20px', background:PU, border:'none', borderRadius:7, color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:F }}>
                    👤 Select Client
                  </button>
                )}
              </div>

              {/* Step 2: Sales Bill (unlocks after client) */}
              <div style={{ opacity:clientName?1:0.4, pointerEvents:clientName?'auto':'none' }}>
                <div style={{ display:'flex', alignItems:'center', marginBottom:8 }}>
                  <div style={stepBadge(2, !!clientName)}>2</div>
                  <span style={{ fontSize:12, fontWeight:700, color:'#111827' }}>Select Sales Bill *</span>
                </div>
                {selectedBill ? (
                  <div style={{ display:'flex', alignItems:'center', gap:12, background:'#f5f3ff', border:`1px solid #ddd6fe`, borderRadius:8, padding:'10px 14px' }}>
                    <div style={{ flex:1 }}>
                      <div style={{ fontWeight:800, fontSize:13.5, color:PU }}>{selectedBill.billNo||selectedBill.billId}</div>
                      <div style={{ fontSize:12, color:'#374151', marginTop:2 }}>{selectedBill.partyName} · {selectedBill.billDate}</div>
                      <div style={{ fontSize:11, color:'#6b7280', marginTop:2 }}>₹{fmt(selectedBill.grandTotal)} · {(selectedBill.items||[]).length} items</div>
                    </div>
                    <button onClick={()=>{ setSelectedBill(null); setBillRef(''); setLines([newLine()]); }}
                      style={{ background:'#fee2e2', border:'1px solid #fca5a5', borderRadius:6, color:'#dc2626', padding:'5px 12px', cursor:'pointer', fontSize:12, fontWeight:700 }}>
                      ✕ Change Bill
                    </button>
                  </div>
                ) : (
                  <div style={{ display:'flex', gap:10, alignItems:'center' }}>
                    <input value={billRef} onChange={e=>setBillRef(e.target.value)} placeholder="Type bill no. or browse client's bills…"
                      style={{ ...inp(), flex:1 }} disabled={!clientName}
                      onKeyDown={e=>{ if(e.key==='Enter'){ const b=clientBills.find(b=>b.billNo===billRef||b.billId===billRef); if(b) pickBill(b); }}}/>
                    <button onClick={()=>setShowBillPop(true)} disabled={!clientName}
                      style={{ height:34, padding:'0 16px', background:clientName?PU:'#d1d5db', border:'none', borderRadius:6, color:'#fff', fontSize:12, fontWeight:700, cursor:clientName?'pointer':'default', fontFamily:F, whiteSpace:'nowrap' }}>
                      🔍 Browse Bills
                    </button>
                  </div>
                )}
                {clientName && clientBills.length===0 && (
                  <div style={{ fontSize:11, color:'#f59e0b', marginTop:6 }}>No sales bills found for {clientName}.</div>
                )}
                {clientName && clientBills.length>0 && !selectedBill && (
                  <div style={{ fontSize:11, color:'#6b7280', marginTop:5 }}>{clientBills.length} bill{clientBills.length>1?'s':''} found for {clientName}</div>
                )}
              </div>

              {/* Date + Reason appear after bill is selected */}
              {selectedBill && (
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginTop:18 }}>
                  <div>
                    <label style={lbl}>Date *</label>
                    <input type="date" value={date} onChange={e=>setDate(e.target.value)} style={inp()}/>
                  </div>
                  <div>
                    <label style={lbl}>Reason *</label>
                    <select value={reason} onChange={e=>setReason(e.target.value)} style={inp()}>
                      <option value="">Select reason…</option>
                      {reasons.map(r=><option key={r} value={r}>{r}</option>)}
                    </select>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Items table — only after bill selected */}
          {selectedBill && (
            <div style={card}>
              <div style={SH()}>
                <span>Items to Return (from {selectedBill.billNo||selectedBill.billId})</span>
                <button onClick={()=>setLines(p=>[...p,newLine()])}
                  style={{ background:'rgba(255,255,255,0.15)', border:'1px solid rgba(255,255,255,0.35)', borderRadius:5, color:'#fff', padding:'3px 12px', fontSize:11, cursor:'pointer' }}>+ Add Row</button>
              </div>
              <div style={{ overflowX:'auto' }}>
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11.5, fontFamily:F }}>
                  <thead>
                    <tr style={{ background:'#f8faff' }}>
                      {['#','Product / Description','Return Qty','Max Qty','Unit','Rate (₹)','GST %','Taxable','GST Amt','Total (₹)',''].map((h,i)=>(
                        <th key={i} style={{ padding:'7px 8px', color:'#374151', fontWeight:700, border:`1px solid ${BD}`, textAlign:i>=7?'right':'left', whiteSpace:'nowrap', fontSize:10.5 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((l,idx)=>{
                      const c=calc[idx]||{taxable:0,gst:0,total:0};
                      return (
                        <tr key={l._id} style={{ background:idx%2===0?'#fff':'#faf5ff' }}>
                          <td style={{ padding:'4px 8px', border:`1px solid ${BD}`, textAlign:'center', color:'#6b7280' }}>{idx+1}</td>
                          <td style={{ padding:'4px 6px', border:`1px solid ${BD}`, minWidth:180 }}>
                            <input value={l.productName} readOnly style={{ ...inp(), height:28, background:'#f9fafb' }}/>
                          </td>
                          <td style={{ padding:'4px 6px', border:`1px solid ${BD}`, minWidth:80 }}>
                            <input type="number" value={l.qty} onChange={e=>updateLine(l._id,'qty',e.target.value)} min="0" step="0.01" placeholder="0"
                              style={{ ...inp(), height:28, textAlign:'right', borderColor:l.maxQty&&parseFloat(l.qty)>l.maxQty?'#dc2626':BD }}/>
                          </td>
                          <td style={{ padding:'4px 8px', border:`1px solid ${BD}`, textAlign:'center', color:'#9ca3af', fontSize:11 }}>{l.maxQty!=null?l.maxQty:'—'}</td>
                          <td style={{ padding:'4px 6px', border:`1px solid ${BD}`, minWidth:70 }}>
                            <select value={l.unit} onChange={e=>updateLine(l._id,'unit',e.target.value)} style={{ ...inp(), height:28 }}>
                              {UNITS.map(u=><option key={u}>{u}</option>)}
                            </select>
                          </td>
                          <td style={{ padding:'4px 6px', border:`1px solid ${BD}`, minWidth:90 }}>
                            <input type="number" value={l.rate} readOnly style={{ ...inp(), height:28, textAlign:'right', background:'#f9fafb' }}/>
                          </td>
                          <td style={{ padding:'4px 6px', border:`1px solid ${BD}`, minWidth:70 }}>
                            <select value={l.gstPercent} style={{ ...inp(), height:28 }} disabled>
                              {GST_RATES.map(r=><option key={r} value={r}>{r}%</option>)}
                            </select>
                          </td>
                          <td style={{ padding:'4px 8px', border:`1px solid ${BD}`, textAlign:'right' }}>₹{fmt(c.taxable)}</td>
                          <td style={{ padding:'4px 8px', border:`1px solid ${BD}`, textAlign:'right' }}>₹{fmt(c.gst)}</td>
                          <td style={{ padding:'4px 8px', border:`1px solid ${BD}`, textAlign:'right', fontWeight:700, color:PU }}>₹{fmt(c.total)}</td>
                          <td style={{ padding:'4px 6px', border:`1px solid ${BD}`, textAlign:'center' }}>
                            <button onClick={()=>removeLine(l._id)} style={{ background:'none', border:'none', cursor:'pointer', color:'#dc2626', fontSize:15 }}>✕</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {selectedBill && (
            <div style={card}>
              <div style={SH()}>Narration / Notes</div>
              <div style={{ padding:14 }}>
                <textarea value={narration} onChange={e=>setNarration(e.target.value)} placeholder="Additional notes…"
                  style={{ ...inp(), height:72, resize:'vertical', paddingTop:8 }}/>
              </div>
            </div>
          )}
        </>
      )}

      {/* ══════════════ DISCOUNT FLOW ══════════════ */}
      {noteType==='discount' && (
        <div style={card}>
          <div style={SH()}>Discount / Credit Details</div>
          <div style={{ padding:'14px 16px' }}>

            {/* ── Step 1: Client ── */}
            <div style={{ marginBottom:18 }}>
              <div style={{ display:'flex', alignItems:'center', marginBottom:8 }}>
                <div style={stepBadge(1, true)}>1</div>
                <span style={{ fontSize:12, fontWeight:700, color:'#111827' }}>Select Client</span>
              </div>
              {clientName ? (
                <div style={{ display:'flex', alignItems:'center', gap:12, background:'#f5f3ff', border:`1px solid #ddd6fe`, borderRadius:8, padding:'10px 14px' }}>
                  <div style={{ flex:1, fontWeight:800, fontSize:14, color:PU }}>👤 {clientName}</div>
                  <button onClick={()=>{ setClientName(''); setSelectedBill(null); setBillRef(''); }}
                    style={{ background:'#fee2e2', border:'1px solid #fca5a5', borderRadius:6, color:'#dc2626', padding:'5px 12px', cursor:'pointer', fontSize:12, fontWeight:700 }}>
                    ✕ Change
                  </button>
                </div>
              ) : (
                <button onClick={()=>setShowClientPop(true)}
                  style={{ height:38, padding:'0 20px', background:PU, border:'none', borderRadius:7, color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:F }}>
                  👤 Select Client
                </button>
              )}
            </div>

            {/* ── Step 2: Tax Invoice (unlocks after client) ── */}
            <div style={{ marginBottom:18, opacity:clientName?1:0.4, pointerEvents:clientName?'auto':'none' }}>
              <div style={{ display:'flex', alignItems:'center', marginBottom:8 }}>
                <div style={stepBadge(2, !!clientName)}>2</div>
                <span style={{ fontSize:12, fontWeight:700, color:'#111827' }}>Linked Tax Invoice
                  <span style={{ fontWeight:400, color:'#6b7280', marginLeft:4 }}>(optional)</span>
                </span>
              </div>
              {selectedBill ? (
                <div style={{ display:'flex', alignItems:'center', gap:12, background:'#f5f3ff', border:`1px solid #ddd6fe`, borderRadius:8, padding:'10px 14px' }}>
                  <div style={{ flex:1 }}>
                    <div style={{ fontWeight:800, fontSize:13.5, color:PU }}>{selectedBill.billNo||selectedBill.billId}</div>
                    <div style={{ fontSize:12, color:'#374151', marginTop:2 }}>{selectedBill.partyName} · {selectedBill.billDate}</div>
                    <div style={{ fontSize:11, color:'#6b7280', marginTop:2 }}>₹{fmt(selectedBill.grandTotal)} · {(selectedBill.items||[]).length} items</div>
                  </div>
                  <button onClick={()=>{ setSelectedBill(null); setBillRef(''); }}
                    style={{ background:'#fee2e2', border:'1px solid #fca5a5', borderRadius:6, color:'#dc2626', padding:'5px 12px', cursor:'pointer', fontSize:12, fontWeight:700 }}>
                    ✕ Remove
                  </button>
                </div>
              ) : (
                <div style={{ display:'flex', gap:10, alignItems:'center' }}>
                  <input value={billRef} onChange={e=>setBillRef(e.target.value)} placeholder="Type bill no. or browse client's bills…"
                    style={{ ...inp(), flex:1 }} disabled={!clientName}/>
                  <button onClick={()=>setShowBillPop(true)} disabled={!clientName}
                    style={{ height:34, padding:'0 16px', background:clientName?PU:'#d1d5db', border:'none', borderRadius:6, color:'#fff', fontSize:12, fontWeight:700, cursor:clientName?'pointer':'default', fontFamily:F, whiteSpace:'nowrap' }}>
                    🔍 Browse Bills
                  </button>
                </div>
              )}
              {clientName && clientBills.length===0 && (
                <div style={{ fontSize:11, color:'#f59e0b', marginTop:6 }}>No sales bills found for {clientName}. You can still enter a bill no. manually or skip.</div>
              )}
              {clientName && clientBills.length>0 && !selectedBill && (
                <div style={{ fontSize:11, color:'#6b7280', marginTop:5 }}>{clientBills.length} bill{clientBills.length>1?'s':''} found for {clientName}</div>
              )}
            </div>

            {/* ── Step 3: Discount details (unlocks after client) ── */}
            <div style={{ opacity:clientName?1:0.4, pointerEvents:clientName?'auto':'none' }}>
              <div style={{ display:'flex', alignItems:'center', marginBottom:10 }}>
                <div style={stepBadge(3, !!clientName)}>3</div>
                <span style={{ fontSize:12, fontWeight:700, color:'#111827' }}>Discount Details</span>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12 }}>
                <div>
                  <label style={lbl}>Date *</label>
                  <input type="date" value={date} onChange={e=>setDate(e.target.value)} style={inp()} disabled={!clientName}/>
                </div>
                <div>
                  <label style={lbl}>Reason *</label>
                  <select value={reason} onChange={e=>setReason(e.target.value)} style={inp()} disabled={!clientName}>
                    <option value="">Select reason…</option>
                    {reasons.map(r=><option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lbl}>Discount Amount (₹) *</label>
                  <input type="number" value={discountAmt} onChange={e=>setDiscountAmt(e.target.value)} placeholder="0.00" min="0" step="0.01"
                    style={{ ...inp(), textAlign:'right' }} disabled={!clientName}/>
                </div>
                <div>
                  <label style={lbl}>GST on Discount (%)</label>
                  <select value={discountGst} onChange={e=>setDiscountGst(e.target.value)} style={inp()} disabled={!clientName}>
                    {GST_RATES.map(r=><option key={r} value={r}>{r}%</option>)}
                  </select>
                </div>
                <div style={{ gridColumn:'span 4' }}>
                  <label style={lbl}>Narration</label>
                  <input value={narration} onChange={e=>setNarration(e.target.value)} placeholder="Notes…" style={inp()} disabled={!clientName}/>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Summary */}
      <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:14 }}>
        <div style={{ background:'#fff', border:`1px solid ${BD}`, borderRadius:10, padding:16, minWidth:300 }}>
          <div style={{ fontWeight:700, fontSize:11, color:PU, textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:10 }}>Credit Note Summary</div>
          {[['Taxable Amount',subTotal,'#374151'],['Total GST',totalGST,'#7c3aed'],['Grand Total (Credit)',grandTotal,PU]].map(([l,v,c],i)=>(
            <div key={i} style={{ display:'flex', justifyContent:'space-between', padding:'5px 0', borderBottom:i<2?`1px dashed ${BD}`:'none' }}>
              <span style={{ fontSize:12, color:'#6b7280' }}>{l}</span>
              <span style={{ fontSize:i===2?16:13, fontWeight:i===2?900:600, color:c }}>₹{fmt(v)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
        <button onClick={()=>navigate('/account/credit-note/view')}
          style={{ height:36, padding:'0 20px', background:'#fff', border:`1px solid ${BD}`, borderRadius:7, fontSize:12.5, cursor:'pointer', fontFamily:F }}>Cancel</button>
        <button onClick={()=>handleSubmit('draft')} disabled={saving}
          style={{ height:36, padding:'0 20px', background:'#f59e0b', border:'none', borderRadius:7, fontSize:12.5, fontWeight:700, color:'#fff', cursor:'pointer', fontFamily:F }}>
          {saving?'Saving…':'Save Draft'}
        </button>
        {can(user,'accCreditNote','approve') && (
        <button onClick={()=>handleSubmit('approved')} disabled={saving}
          style={{ height:36, padding:'0 24px', background:PU, border:'none', borderRadius:7, fontSize:12.5, fontWeight:700, color:'#fff', cursor:'pointer', fontFamily:F }}>
          {saving?'Saving…':'Approve & Save'}
        </button>
        )}
      </div>

      {showClientPop && (
        <ClientPopup clients={clientNames} onSelect={n=>setClientName(n)} onClose={()=>setShowClientPop(false)}/>
      )}
      {showBillPop && (
        <BillSearchPopup
          title={`Bills for ${clientName}`}
          bills={clientBills}
          onSelect={pickBill}
          onClose={()=>setShowBillPop(false)}/>
      )}
    </div>
  );
}
