import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import axios from 'axios';
import { useNavigate, useLocation } from 'react-router-dom';
import { useCompany } from '../../context/CompanyContext';
import * as XLSX from 'xlsx';
import { withPrintFont } from '../../utils/printFont';
import FyDropdown from '../../components/FyDropdown';
import { useNavTheme, NEU } from '../../utils/navTheme';

const F   = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const P   = '#1a4a9a';
const PG  = '#2a6600';
const BD  = '#000000';

const getFY = d => { const dt=d?new Date(d):new Date(); const m=dt.getMonth()+1; const y=dt.getFullYear(); const s=m>=4?y:y-1; return `${String(s).slice(2)}-${String(s+1).slice(2)}`; };

const fmt   = n => (parseFloat(n)||0).toFixed(2);
const fmtI  = n => { const v=parseFloat(n)||0; return v===0?'0':String(Math.round(v*100)/100); };
const fmtD  = d => {
  if (!d) return '—';
  const dt = new Date(d);
  return isNaN(dt) ? d : `${String(dt.getDate()).padStart(2,'0')}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getFullYear()).slice(-2)}`;
};
const today = () => new Date().toISOString().split('T')[0];

const normSOItem = it => ({
  name: it.itemName || it.name || it.description || '—',
  desc: it.description && it.description !== it.itemName ? it.description : '',
  qty:  parseFloat(it.qty || it.quantity) || 0,
  rate: parseFloat(it.rate) || 0,
  gst:  parseFloat(it.gst  || it.gstPercent) || 0,
});
const normPOItem = it => ({
  name:         it.itemName || it.description || it.name || '—',
  desc:         it.description && it.description !== it.itemName ? it.description : '',
  qty:          parseFloat(it.qty || it.quantity) || 0,
  rate:         parseFloat(it.rate) || 0,
  gst:          parseFloat(it.gstPercent || it.gst) || 0,
  discount:     parseFloat(it.discount) || 0,
  discountType: it.discountType || '%',
});

/* ── Soft (neumorphic) look — used when the SOFT switch in the top bar is on ── */
const softBtn = (active = false, extra = {}) => ({
  height: 28, padding: '0 12px', fontSize: 11.5, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
  fontFamily: F, fontWeight: active ? 700 : 600, margin: '0 5px', borderRadius: 10, border: 'none',
  background: NEU.base, color: active ? NEU.accent : NEU.text,
  boxShadow: active ? NEU.inset : NEU.raisedSm, transition: 'box-shadow 0.15s',
  ...extra,
});
const NEU_LINE = '#C5CEDB';   // soft grid line
const NEU_ROW  = '#E9EDF3';   // data row surface (a touch lighter than the page)
const softPress = {
  onMouseDown:  e => { e.currentTarget.style.boxShadow = NEU.inset; },
  onMouseUp:    e => { e.currentTarget.style.boxShadow = NEU.raisedSm; },
  onMouseLeave: e => { e.currentTarget.style.boxShadow = NEU.raisedSm; },
};


/* ── Small helpers ── */
const Lbl = ({ children }) => (
  <div style={{ fontSize:10.5, fontWeight:600, color:'#374151', marginBottom:3, fontFamily:F }}>{children}</div>
);
const Inp = ({ style, ...props }) => (
  <input style={{ width:'100%', height:30, padding:'0 8px', border:'1px solid #d1d5db',
    borderRadius:5, fontSize:11, fontFamily:F, outline:'none', background:'#fff',
    boxSizing:'border-box', ...style }} {...props} />
);
const Sel = ({ children, style, ...props }) => (
  <select style={{ width:'100%', height:30, padding:'0 6px', border:'1px solid #d1d5db',
    borderRadius:5, fontSize:11, fontFamily:F, outline:'none', background:'#fff',
    boxSizing:'border-box', cursor:'pointer', ...style }} {...props}>
    {children}
  </select>
);
const StatusBadge = ({ s }) => {
  const map = { approved:'#005500', confirmed:'#005500', pending:'#7a4500', draft:'#555', rejected:'#9a0000' };
  return (
    <span style={{ fontSize:9, fontWeight:700, color:map[s]||'#333',
      background:'rgba(0,0,0,0.06)', padding:'1px 5px', borderRadius:3, whiteSpace:'nowrap' }}>
      {s||'—'}
    </span>
  );
};

/* ══════════════════════════════════════════════
   ROW DETAIL MODAL — tabbed: SO · PO · Expense
══════════════════════════════════════════════ */
function RowDetailModal({ so, pos, purchaseBills, vendorDues, soDue, cid, onClose }) {
  const [tab,        setTab]        = useState('so');
  const [expenses,   setExpenses]   = useState([]);
  const [expLoading, setExpLoading] = useState(false);
  const [expLoaded,  setExpLoaded]  = useState(false);

  useEffect(() => {
    if (tab !== 'expense' || expLoaded || !cid) return;
    setExpLoading(true);
    axios.get(`/api/accounts/expenses?companyId=${cid}`)
      .then(r => setExpenses((r.data||[]).filter(e => String(e.soId||e.orderId||'') === String(so?.orderId||''))))
      .catch(()=>setExpenses([]))
      .finally(()=>{ setExpLoading(false); setExpLoaded(true); });
  }, [tab, cid, expLoaded]);

  const getBill = po => po && (purchaseBills||[])
    .find(b => String(b.orderId)===String(po.orderId) || b.orderNo===po.poNo || b.orderNo===po.poNumber);
  const getDue  = po => po && (Array.isArray(vendorDues)?vendorDues:[])
    .find(d => String(d.orderId)===String(po.orderId) || d.orderNo===po.poNo);

  const soItems       = so?.items || [];
  const soPayments    = soDue?.linkedPayments || [];
  const soSecDeps     = soDue?.linkedSecurityDeposits || [];
  const soTotal       = parseFloat(so?.grandTotal||so?.amount)||0;
  const soPayReceived = soDue?.paymentsReceived ?? soPayments.reduce((s,p)=>s+(parseFloat(p.amount)||0),0);
  const soSecDepAmt   = soDue?.securityDepositAmt ?? soSecDeps.reduce((s,d)=>s+(parseFloat(d.amount)||0),0);
  const soReceived    = soDue?.received ?? (soPayReceived + soSecDepAmt);
  const soDueAmt      = soTotal - soReceived;

  const PB  = '#1a4a9a';
  const PG2 = '#1a6600';
  const PA  = '#7c3800';

  const soDocCount  = (so?.attachments||[]).length;
  const poDocCount  = (pos||[]).reduce((s,p)=>s+(p?.attachments||[]).length,0);
  const TABS = [
    { key:'so',      label:'📋 Sales Order',                                       color:PB        },
    { key:'po',      label:`🛒 Purchase Orders (${(pos||[]).length})`,              color:PG2       },
    { key:'expense', label:'💸 Expenses',                                           color:PA        },
    { key:'docs',    label:`📎 Docs${soDocCount+poDocCount>0?` (${soDocCount+poDocCount})`:''}`,  color:'#7c3aed' },
  ];

  const KV = ({ label, val, bold, color }) => (
    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline',
      padding:'5px 0', borderBottom:'1px solid #f1f5f9' }}>
      <span style={{ fontSize:10, color:'#6b7280', flexShrink:0 }}>{label}</span>
      <span style={{ fontSize:11, fontWeight:bold?700:500, color:color||'#1f2937',
        textAlign:'right', marginLeft:8 }}>{val||'—'}</span>
    </div>
  );

  /* ── Section heading ── */
  const SH = ({ color, children }) => (
    <div style={{ fontSize:9, fontWeight:800, color:color||'#333', textTransform:'uppercase',
      letterSpacing:'0.6px', marginTop:14, marginBottom:6, borderTop:`2px solid ${color||'#ccc'}`,
      paddingTop:6 }}>{children}</div>
  );

  /* ── SO tab ── */
  const renderSO = () => (
    <div style={{ padding:'16px 20px' }}>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0 32px', marginBottom:12 }}>
        <KV label="Order No"    val={so?.orderNo||'—'} />
        <KV label="Order Date"  val={fmtD(so?.orderDate||so?.date)} />
        <KV label="Client"      val={so?.customerName||so?.clientName} bold />
        <KV label="GSTIN"       val={so?.customerGstin||so?.partyGstin} />
        <KV label="State"       val={so?.customerState} />
        <KV label="Due Date"    val={fmtD(so?.dueDate||so?.deliveryDate)} />
        <KV label="Customer PO" val={so?.customerPO} />
        <KV label="Status"      val={so?.status} />
      </div>

      {/* Financial cards */}
      <div style={{ display:'flex', gap:10, marginBottom:16 }}>
        {[
          { label:'Order Value',     val:`₹${fmt(soTotal)}`,       color:PB,        bg:'#f0f5ff', bd:'#c8d8f0' },
          { label:'Receipts',        val:`₹${fmt(soPayReceived)}`, color:'#2e7d32', bg:'#f0fff4', bd:'#c8e6c9' },
          ...(soSecDepAmt>0 ? [{ label:'Security Held by Client', val:`₹${fmt(soSecDepAmt)}`, color:'#c2410c', bg:'#fff8f0', bd:'#f5c6a0' }] : []),
          { label:'Balance Due',     val:`₹${fmt(soDueAmt)}`,      color:soDueAmt>0?'#16a34a':'#6b7280', bg:soDueAmt>0?'#f0fdf4':'#f9fafb', bd:soDueAmt>0?'#86efac':'#d1d5db' },
        ].map(c=>(
          <div key={c.label} style={{ flex:1, background:c.bg, border:`1px solid ${c.bd}`,
            borderRadius:7, padding:'9px 14px', textAlign:'center' }}>
            <div style={{ fontSize:9, color:'#888', marginBottom:3 }}>{c.label}</div>
            <div style={{ fontSize:16, fontWeight:800, color:c.color }}>{c.val}</div>
          </div>
        ))}
      </div>

      {/* Line items */}
      {soItems.length>0 && (
        <>
          <SH color={PB}>Line Items ({soItems.length})</SH>
          <div style={{ overflowX:'auto', border:'1px solid #c8d8f0', borderRadius:6, marginBottom:16 }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:10.5, minWidth:540 }}>
              <thead>
                <tr style={{ background:'#eef4ff' }}>
                  {['#','Item / Description','HSN','Qty','Rate (₹)','GST%','Amount (₹)'].map((h,i)=>(
                    <th key={h} style={{ padding:'5px 8px', textAlign:i<3?'left':'right', fontSize:9,
                      fontWeight:700, color:PB, borderBottom:'1px solid #c8d8f0', whiteSpace:'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {soItems.map((it,i)=>{
                  const qty=parseFloat(it.qty||it.quantity)||0, rate=parseFloat(it.rate)||0;
                  const gst=parseFloat(it.gst||it.gstPercent)||0;
                  return (
                    <tr key={i} style={{ background:i%2===0?'#fff':'#f7faff' }}>
                      <td style={{ padding:'5px 8px', borderBottom:'1px solid #eee', color:'#aaa', width:28 }}>{i+1}</td>
                      <td style={{ padding:'5px 8px', borderBottom:'1px solid #eee', fontWeight:500 }}>
                        {it.description||it.itemName||it.name||'—'}
                      </td>
                      <td style={{ padding:'5px 8px', borderBottom:'1px solid #eee', fontFamily:'monospace', fontSize:9, color:'#555' }}>{it.hsnCode||'—'}</td>
                      <td style={{ padding:'5px 8px', borderBottom:'1px solid #eee', textAlign:'right', fontWeight:600 }}>{fmtI(qty)}</td>
                      <td style={{ padding:'5px 8px', borderBottom:'1px solid #eee', textAlign:'right' }}>{fmt(rate)}</td>
                      <td style={{ padding:'5px 8px', borderBottom:'1px solid #eee', textAlign:'right', color:'#555' }}>{gst}%</td>
                      <td style={{ padding:'5px 8px', borderBottom:'1px solid #eee', textAlign:'right', fontWeight:700, color:PB }}>
                        {fmt(qty*rate*(1+gst/100))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Receipt history */}
      <SH color='#2e7d32'>Receipt History ({soPayments.length})</SH>
      {soPayments.length===0 ? (
        <div style={{ padding:'6px 0', color:'#aaa', fontStyle:'italic', fontSize:11 }}>No receipts recorded yet.</div>
      ) : (
        <div style={{ border:'1px solid #c8e6c9', borderRadius:6, overflow:'hidden', marginBottom:8 }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:10.5 }}>
            <thead>
              <tr style={{ background:'#e8f5e9' }}>
                {['#','Date','Amount (₹)','Mode','Reference','Notes','Status'].map((h,i)=>(
                  <th key={h} style={{ padding:'5px 8px', textAlign:i===2?'right':'left', fontSize:9,
                    fontWeight:700, color:'#1b5e20', borderBottom:'1px solid #c8e6c9' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {soPayments.map((p,i)=>(
                <tr key={i} style={{ background:i%2===0?'#fff':'#f1f8e9' }}>
                  <td style={{ padding:'5px 8px', borderBottom:'1px solid #eee', color:'#aaa', width:28 }}>{i+1}</td>
                  <td style={{ padding:'5px 8px', borderBottom:'1px solid #eee', whiteSpace:'nowrap' }}>{fmtD(p.date||p.paymentDate)}</td>
                  <td style={{ padding:'5px 8px', borderBottom:'1px solid #eee', textAlign:'right', fontWeight:700, color:'#2e7d32', fontSize:12 }}>₹{fmt(p.amount)}</td>
                  <td style={{ padding:'5px 8px', borderBottom:'1px solid #eee' }}>{p.paymentMode||'—'}</td>
                  <td style={{ padding:'5px 8px', borderBottom:'1px solid #eee', fontFamily:'monospace', fontSize:9, color:'#555' }}>{p.reference||p.ref||'—'}</td>
                  <td style={{ padding:'5px 8px', borderBottom:'1px solid #eee', color:'#666' }}>{p.notes||'—'}</td>
                  <td style={{ padding:'5px 8px', borderBottom:'1px solid #eee' }}><StatusBadge s={p.status}/></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Security Deposit held by client */}
      {soSecDeps.length > 0 && (
        <>
          <SH color='#7b3f00'>Security Deposit (held by client — {soSecDeps.length})</SH>
          <div style={{ border:'1px solid #f5c6a0', borderRadius:6, overflow:'hidden', marginBottom:8 }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:10.5 }}>
              <thead>
                <tr style={{ background:'#fff3e0' }}>
                  {['#','Date','Amount (₹)','Mode','Ref / DD No','Bank','Status'].map((h,i)=>(
                    <th key={h} style={{ padding:'5px 8px', textAlign:i===2?'right':'left', fontSize:9,
                      fontWeight:700, color:'#7b3f00', borderBottom:'1px solid #f5c6a0' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {soSecDeps.map((d,i)=>(
                  <tr key={i} style={{ background:i%2===0?'#fff':'#fff8f0' }}>
                    <td style={{ padding:'5px 8px', borderBottom:'1px solid #f5e6d0', color:'#aaa', width:28 }}>{i+1}</td>
                    <td style={{ padding:'5px 8px', borderBottom:'1px solid #f5e6d0', whiteSpace:'nowrap' }}>{fmtD(d.startDate||d.createdAt)}</td>
                    <td style={{ padding:'5px 8px', borderBottom:'1px solid #f5e6d0', textAlign:'right', fontWeight:700, color:'#c2410c', fontSize:12 }}>₹{fmt(d.amount)}</td>
                    <td style={{ padding:'5px 8px', borderBottom:'1px solid #f5e6d0' }}>{d.paymentMode||'—'}</td>
                    <td style={{ padding:'5px 8px', borderBottom:'1px solid #f5e6d0', fontFamily:'monospace', fontSize:9, color:'#555' }}>{d.paymentRef||'—'}</td>
                    <td style={{ padding:'5px 8px', borderBottom:'1px solid #f5e6d0' }}>{d.paymentBank||'—'}</td>
                    <td style={{ padding:'5px 8px', borderBottom:'1px solid #f5e6d0' }}>
                      <span style={{ fontSize:9, fontWeight:700, padding:'1px 6px', borderRadius:3,
                        background:'#fef3c7', color:'#92400e' }}>Active</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Summary row */}
      <div style={{ display:'flex', gap:6, marginTop:4, padding:'8px 10px', background:'#f8faff', borderRadius:6, border:'1px solid #e5eaf2' }}>
        {soPayments.length > 0 && (
          <div style={{ flex:1, textAlign:'center' }}>
            <div style={{ fontSize:9, color:'#888' }}>Receipts</div>
            <div style={{ fontSize:13, fontWeight:700, color:'#2e7d32' }}>₹{fmt(soPayReceived)}</div>
          </div>
        )}
        {soSecDepAmt > 0 && (
          <div style={{ flex:1, textAlign:'center' }}>
            <div style={{ fontSize:9, color:'#888' }}>Security Held</div>
            <div style={{ fontSize:13, fontWeight:700, color:'#c2410c' }}>₹{fmt(soSecDepAmt)}</div>
          </div>
        )}
        <div style={{ flex:1, textAlign:'center' }}>
          <div style={{ fontSize:9, color:'#888' }}>Total Received</div>
          <div style={{ fontSize:13, fontWeight:700, color:'#2e7d32' }}>₹{fmt(soReceived)}</div>
        </div>
        <div style={{ flex:1, textAlign:'center' }}>
          <div style={{ fontSize:9, color:'#888' }}>Balance Due</div>
          <div style={{ fontSize:13, fontWeight:800, color:soDueAmt>0?'#16a34a':'#6b7280' }}>₹{fmt(soDueAmt)}</div>
        </div>
      </div>
    </div>
  );

  /* ── PO tab ── */
  const renderPO = () => {
    const poList = pos||[];
    if (poList.length===0) return (
      <div style={{ padding:50, textAlign:'center', color:'#aaa', fontStyle:'italic', fontSize:13 }}>
        No purchase orders linked to this sales order.
      </div>
    );
    return (
      <div style={{ padding:'16px 20px' }}>
        {poList.map((po, pi)=>{
          const poBill     = getBill(po);
          const poDue      = getDue(po);
          const poPayments = poDue?.linkedPayments||[];
          const poTotal    = parseFloat(po.grandTotal||po.amount)||0;
          const poPaid     = poPayments.reduce((s,p)=>s+(parseFloat(p.amount)||0),0);
          const poDueAmt   = poTotal-poPaid;
          const poItems    = po.items||[];
          return (
            <div key={po.orderId||pi} style={{ marginBottom: pi<poList.length-1?28:0 }}>
              {/* PO header */}
              <div style={{ background:PG2, color:'#fff', padding:'9px 14px',
                borderRadius:'7px 7px 0 0', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <div>
                  <div style={{ fontSize:9, color:'rgba(255,255,255,0.55)', textTransform:'uppercase', letterSpacing:'0.8px' }}>
                    Purchase Order {pi+1} of {poList.length}
                  </div>
                  <div style={{ fontSize:14, fontWeight:800, marginTop:2 }}>
                    {po.poNo||po.poNumber||`PO-${po.orderId}`}
                    <span style={{ fontSize:12, fontWeight:400, opacity:0.8, marginLeft:10 }}>{po.vendorName||'—'}</span>
                  </div>
                </div>
                <div style={{ textAlign:'right' }}>
                  <div style={{ fontSize:9, color:'rgba(255,255,255,0.55)' }}>Balance Due</div>
                  <div style={{ fontSize:16, fontWeight:800, color:poDueAmt>0?'#ffcccc':'#ccffcc' }}>₹{fmt(poDueAmt)}</div>
                </div>
              </div>

              <div style={{ border:'1px solid #b8d8b0', borderTop:'none', borderRadius:'0 0 7px 7px', padding:'14px 16px' }}>
                {/* Meta */}
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0 32px', marginBottom:12 }}>
                  <KV label="Vendor"   val={po.vendorName} bold />
                  <KV label="GSTIN"    val={po.vendorGstin} />
                  <KV label="State"    val={po.vendorState} />
                  <KV label="PO Date"  val={fmtD(po.poDate||po.date)} />
                  <KV label="Delivery" val={fmtD(po.deliveryDate||po.dueDate)} />
                  <KV label="Status"   val={po.status} />
                </div>

                {/* Financial cards */}
                <div style={{ display:'flex', gap:10, marginBottom:14 }}>
                  {[
                    { label:'Order Value', val:`₹${fmt(poTotal)}`,  color:PG2 },
                    { label:'Paid',        val:`₹${fmt(poPaid)}`,   color:'#2e7d32' },
                    { label:'Balance Due', val:`₹${fmt(poDueAmt)}`, color:poDueAmt>0?'#b71c1c':'#2e7d32' },
                  ].map(c=>(
                    <div key={c.label} style={{ flex:1, background:'#f0fff4', border:'1px solid #b8d8b0',
                      borderRadius:7, padding:'9px 14px', textAlign:'center' }}>
                      <div style={{ fontSize:9, color:'#888', marginBottom:3 }}>{c.label}</div>
                      <div style={{ fontSize:16, fontWeight:800, color:c.color }}>{c.val}</div>
                    </div>
                  ))}
                </div>

                {/* Purchase Bill */}
                {poBill ? (
                  <div style={{ marginBottom:14, padding:'10px 14px', background:'#f0fff4',
                    border:'1px solid #a7f3d0', borderRadius:7 }}>
                    <div style={{ fontSize:9, fontWeight:800, color:PG2, textTransform:'uppercase',
                      marginBottom:8, letterSpacing:'0.6px' }}>Purchase Bill</div>
                    <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'0 20px' }}>
                      <KV label="Bill No"   val={poBill.billNo} bold />
                      <KV label="Bill Date" val={fmtD(poBill.billDate)} />
                      <KV label="GST Type"  val={poBill.gstType==='intrastate'?'CGST+SGST':'IGST'} />
                      <KV label="Amount"    val={`₹${fmt(poBill.grandTotal)}`} bold color={PG2} />
                    </div>
                  </div>
                ) : (
                  <div style={{ marginBottom:14, padding:'8px 12px', background:'#fffbe8',
                    border:'1px solid #ffe08a', borderRadius:6, fontSize:10, color:'#a07000', fontStyle:'italic' }}>
                    No purchase bill recorded for this PO yet.
                  </div>
                )}

                {/* PO line items */}
                {poItems.length>0 && (
                  <>
                    <SH color={PG2}>Line Items ({poItems.length})</SH>
                    <div style={{ overflowX:'auto', border:'1px solid #b8d8b0', borderRadius:6, marginBottom:14 }}>
                      <table style={{ width:'100%', borderCollapse:'collapse', fontSize:10.5, minWidth:580 }}>
                        <thead>
                          <tr style={{ background:'#e8f5e9' }}>
                            {['#','Item / Description','Qty','Rate (₹)','Discount','Taxable (₹)','GST%','Amount (₹)'].map((h,i)=>(
                              <th key={h} style={{ padding:'5px 8px', textAlign:i<2?'left':'right', fontSize:9,
                                fontWeight:700, color:PG2, borderBottom:'1px solid #b8d8b0', whiteSpace:'nowrap' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {poItems.map((it,i)=>{
                            const qty=parseFloat(it.qty||it.quantity)||0, rate=parseFloat(it.rate)||0;
                            const gst=parseFloat(it.gstPercent||it.gst)||0;
                            const disc=it.discountType==='%'?qty*rate*(parseFloat(it.discount)||0)/100:parseFloat(it.discount)||0;
                            const tax=qty*rate-disc;
                            return (
                              <tr key={i} style={{ background:i%2===0?'#fff':'#f0fff4' }}>
                                <td style={{ padding:'5px 8px', borderBottom:'1px solid #eee', color:'#aaa', width:28 }}>{i+1}</td>
                                <td style={{ padding:'5px 8px', borderBottom:'1px solid #eee', fontWeight:500 }}>
                                  {it.itemName||it.description||it.name||'—'}
                                </td>
                                <td style={{ padding:'5px 8px', borderBottom:'1px solid #eee', textAlign:'right', fontWeight:600 }}>{fmtI(qty)}</td>
                                <td style={{ padding:'5px 8px', borderBottom:'1px solid #eee', textAlign:'right' }}>{fmt(rate)}</td>
                                <td style={{ padding:'5px 8px', borderBottom:'1px solid #eee', textAlign:'right', color:'#b06000' }}>
                                  {disc>0?(it.discountType==='%'?`${it.discount}%`:`₹${fmt(disc)}`):'—'}
                                </td>
                                <td style={{ padding:'5px 8px', borderBottom:'1px solid #eee', textAlign:'right' }}>{fmt(tax)}</td>
                                <td style={{ padding:'5px 8px', borderBottom:'1px solid #eee', textAlign:'right', color:'#555' }}>{gst}%</td>
                                <td style={{ padding:'5px 8px', borderBottom:'1px solid #eee', textAlign:'right', fontWeight:700, color:PG2 }}>
                                  {fmt(tax+tax*gst/100)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}

                {/* Payment history */}
                <SH color='#b71c1c'>Payment History ({poPayments.length})</SH>
                {poPayments.length===0 ? (
                  <div style={{ padding:'8px 0', color:'#aaa', fontStyle:'italic', fontSize:11 }}>No payments recorded yet.</div>
                ) : (
                  <div style={{ border:'1px solid #ffcdd2', borderRadius:6, overflow:'hidden' }}>
                    <table style={{ width:'100%', borderCollapse:'collapse', fontSize:10.5 }}>
                      <thead>
                        <tr style={{ background:'#ffebee' }}>
                          {['#','Date','Amount (₹)','Mode','Reference','Notes','Status'].map((h,i)=>(
                            <th key={h} style={{ padding:'5px 8px', textAlign:i===2?'right':'left', fontSize:9,
                              fontWeight:700, color:'#b71c1c', borderBottom:'1px solid #ffcdd2' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {poPayments.map((p,i)=>(
                          <tr key={i} style={{ background:i%2===0?'#fff':'#fff8f8' }}>
                            <td style={{ padding:'5px 8px', borderBottom:'1px solid #eee', color:'#aaa', width:28 }}>{i+1}</td>
                            <td style={{ padding:'5px 8px', borderBottom:'1px solid #eee', whiteSpace:'nowrap' }}>{fmtD(p.date||p.paymentDate)}</td>
                            <td style={{ padding:'5px 8px', borderBottom:'1px solid #eee', textAlign:'right', fontWeight:700, color:'#b71c1c', fontSize:12 }}>₹{fmt(p.amount)}</td>
                            <td style={{ padding:'5px 8px', borderBottom:'1px solid #eee' }}>{p.paymentMode||'—'}</td>
                            <td style={{ padding:'5px 8px', borderBottom:'1px solid #eee', fontFamily:'monospace', fontSize:9, color:'#555' }}>{p.reference||p.ref||'—'}</td>
                            <td style={{ padding:'5px 8px', borderBottom:'1px solid #eee', color:'#666' }}>{p.notes||'—'}</td>
                            <td style={{ padding:'5px 8px', borderBottom:'1px solid #eee' }}><StatusBadge s={p.status}/></td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr style={{ background:'#ffebee', fontWeight:700 }}>
                          <td colSpan={2} style={{ padding:'5px 8px', borderTop:'1px solid #ffcdd2', fontSize:10 }}>Total Paid</td>
                          <td style={{ padding:'5px 8px', borderTop:'1px solid #ffcdd2', textAlign:'right', color:'#b71c1c', fontSize:13 }}>₹{fmt(poPaid)}</td>
                          <td colSpan={4} style={{ padding:'5px 8px', borderTop:'1px solid #ffcdd2', textAlign:'right',
                            color:poDueAmt>0?'#b71c1c':'#2e7d32', fontSize:11 }}>Balance Due: ₹{fmt(poDueAmt)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  /* ── Expense tab ── */
  const renderExpense = () => {
    if (expLoading) return (
      <div style={{ padding:50, textAlign:'center', color:'#aaa', fontSize:13 }}>Loading expenses…</div>
    );
    const totalExp = expenses.reduce((s,e)=>s+(parseFloat(e.grandTotal||e.amount)||0),0);
    return (
      <div style={{ padding:'16px 20px' }}>
        <div style={{ display:'flex', gap:10, marginBottom:16 }}>
          {[
            { label:'Total Expenses', val:`₹${fmt(totalExp)}`, color:PA },
            { label:'Count',          val:expenses.length,     color:'#374151' },
          ].map(c=>(
            <div key={c.label} style={{ flex:1, background:'#fff8f0', border:'1px solid #f0c080',
              borderRadius:7, padding:'9px 14px', textAlign:'center' }}>
              <div style={{ fontSize:9, color:'#888', marginBottom:3 }}>{c.label}</div>
              <div style={{ fontSize:18, fontWeight:800, color:c.color }}>{c.val}</div>
            </div>
          ))}
        </div>

        {expenses.length===0 ? (
          <div style={{ padding:40, textAlign:'center', color:'#aaa', fontStyle:'italic', fontSize:13 }}>
            No expenses recorded yet.
          </div>
        ) : (
          <div style={{ border:'1px solid #f0c080', borderRadius:6, overflow:'hidden' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:10.5 }}>
              <thead>
                <tr style={{ background:'#fff3e0' }}>
                  {['#','Date','Category','Description','Vendor','Mode','Amount (₹)','Status'].map((h,i)=>(
                    <th key={h} style={{ padding:'5px 9px', textAlign:i===6?'right':'left', fontSize:9,
                      fontWeight:700, color:PA, borderBottom:'1px solid #f0c080', whiteSpace:'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {expenses.map((ex,i)=>(
                  <tr key={ex.expenseId||i} style={{ background:i%2===0?'#fff':'#fff8f0' }}>
                    <td style={{ padding:'5px 9px', borderBottom:'1px solid #f5e8d0', color:'#aaa', width:28 }}>{i+1}</td>
                    <td style={{ padding:'5px 9px', borderBottom:'1px solid #f5e8d0', whiteSpace:'nowrap' }}>
                      {fmtD(ex.date||ex.expenseDate||ex.createdAt)}
                    </td>
                    <td style={{ padding:'5px 9px', borderBottom:'1px solid #f5e8d0', fontWeight:600, color:PA }}>
                      {ex.expenseCategory||ex.category||'—'}
                    </td>
                    <td style={{ padding:'5px 9px', borderBottom:'1px solid #f5e8d0', color:'#555',
                      maxWidth:200, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                      {ex.description||'—'}
                    </td>
                    <td style={{ padding:'5px 9px', borderBottom:'1px solid #f5e8d0' }}>{ex.vendorName||ex.vendor||ex.ledgerName||'—'}</td>
                    <td style={{ padding:'5px 9px', borderBottom:'1px solid #f5e8d0' }}>{ex.paymentMode||'—'}</td>
                    <td style={{ padding:'5px 9px', borderBottom:'1px solid #f5e8d0', textAlign:'right',
                      fontWeight:700, color:PA, fontSize:12 }}>₹{fmt(ex.grandTotal||ex.amount||0)}</td>
                    <td style={{ padding:'5px 9px', borderBottom:'1px solid #f5e8d0' }}><StatusBadge s={ex.status}/></td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background:'#fff3e0', fontWeight:700 }}>
                  <td colSpan={6} style={{ padding:'5px 9px', borderTop:'1px solid #f0c080', fontSize:10 }}>
                    Total ({expenses.length} expense{expenses.length!==1?'s':''})
                  </td>
                  <td style={{ padding:'5px 9px', borderTop:'1px solid #f0c080', textAlign:'right', color:PA, fontSize:13 }}>
                    ₹{fmt(totalExp)}
                  </td>
                  <td style={{ padding:'5px 9px', borderTop:'1px solid #f0c080' }}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    );
  };

  /* ── Docs tab ── */
  const renderDocs = () => {
    const PV = '#7c3aed';
    const soAtts = so?.attachments || [];
    const poAtts = (pos||[]).flatMap(po =>
      (po?.attachments||[]).map(a => ({ ...a, _poNo:po.poNo||po.poNumber||po.orderId, _poId:po.orderId }))
    );
    const allDocs = [
      ...soAtts.map(a => ({ ...a, _source:`SO: ${so.orderNo||so.orderId}`, _orderId:so.orderId, _api:'sales-orders' })),
      ...poAtts.map(a => ({ ...a, _source:`PO: ${a._poNo}`, _orderId:a._poId, _api:'purchase-orders' })),
    ];
    if (allDocs.length === 0) return (
      <div style={{ padding:50, textAlign:'center', color:'#aaa', fontSize:13, fontStyle:'italic' }}>
        No documents attached to this order or its purchase orders.
      </div>
    );
    return (
      <div style={{ padding:'16px 20px' }}>
        <div style={{ fontSize:11, color:'#6b7280', marginBottom:12 }}>
          {soAtts.length} SO doc{soAtts.length!==1?'s':''} &nbsp;·&nbsp; {poAtts.length} PO doc{poAtts.length!==1?'s':''}
        </div>
        {allDocs.map((a, i) => {
          const fileName = a.fileName || a.name || '';
          const ext = (fileName.split('.').pop()||'').toLowerCase();
          const isPdf = ext==='pdf', isImg=/^(png|jpg|jpeg|gif|bmp|webp)$/.test(ext);
          const isWord = ext==='docx'||ext==='doc', isExcel=ext==='xlsx'||ext==='xls';
          const fileIcon = isPdf?'📄':isImg?'🖼️':isWord?'📝':isExcel?'📊':'📎';
          const fileType = isPdf?'PDF':isImg?'Image':isWord?'Word':isExcel?'Excel':'File';
          const dlUrl = cid && a._orderId && fileName
            ? `/api/${a._api}/${a._orderId}/download/${encodeURIComponent(fileName)}?companyId=${cid}`
            : null;
          return (
            <div key={i} style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 12px',
              background:'#f5f3ff', border:'1px solid #ddd6fe', borderLeft:`4px solid ${PV}`,
              borderRadius:5, marginBottom:8 }}>
              <span style={{ background:PV, color:'#fff', borderRadius:'50%', width:22, height:22,
                display:'flex', alignItems:'center', justifyContent:'center', fontSize:10,
                fontWeight:700, flexShrink:0 }}>{i+1}</span>
              <span style={{ fontSize:16, flexShrink:0 }}>{fileIcon}</span>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:12, fontWeight:700, color:'#4c1d95', overflow:'hidden',
                  textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                  {a.name||fileName||`Document ${i+1}`}
                </div>
                <div style={{ fontSize:10, color:'#888', marginTop:2 }}>{fileType} · {a._source}</div>
              </div>
              <div style={{ display:'flex', gap:6, flexShrink:0 }}>
                {dlUrl && (
                  <a href={`${dlUrl}&inline=1`} target="_blank" rel="noopener noreferrer"
                    style={{ background:PV, color:'#fff', padding:'4px 12px', fontSize:10,
                      fontWeight:700, textDecoration:'none', borderRadius:4 }}>
                    👁 View
                  </a>
                )}
                {dlUrl && (
                  <a href={dlUrl} download target="_blank" rel="noopener noreferrer"
                    style={{ background:'#f5f3ff', color:PV, padding:'4px 12px', fontSize:10,
                      fontWeight:700, textDecoration:'none', borderRadius:4, border:`1px solid ${PV}40` }}>
                    ⬇ Download
                  </a>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.65)', zIndex:1200,
      display:'flex', alignItems:'center', justifyContent:'center', padding:10 }}
      onClick={e=>{ if(e.target===e.currentTarget) onClose(); }}>
      <div style={{ background:'#f8fafc', borderRadius:10, width:'92vw', maxWidth:1100,
        maxHeight:'92vh', overflow:'hidden', display:'flex', flexDirection:'column',
        fontFamily:F, boxShadow:'0 28px 80px rgba(0,0,0,0.45)' }}>

        {/* Title bar */}
        <div style={{ background:'linear-gradient(90deg,#1a3a8a,#2a5ab0)', padding:'10px 18px',
          display:'flex', justifyContent:'space-between', alignItems:'center', flexShrink:0 }}>
          <div>
            <div style={{ fontSize:9, color:'rgba(255,255,255,0.55)', textTransform:'uppercase', letterSpacing:'1px' }}>
              Order Detail
            </div>
            <div style={{ fontSize:15, fontWeight:800, color:'#fff', marginTop:2 }}>
              SO #{so?.orderId}
              <span style={{ fontSize:12, fontWeight:400, opacity:0.75, marginLeft:10 }}>
                {so?.customerName||so?.clientName||'—'}
              </span>
            </div>
          </div>
          <button onClick={onClose}
            style={{ background:'rgba(255,255,255,0.15)', border:'1px solid rgba(255,255,255,0.3)',
              color:'#fff', fontSize:16, cursor:'pointer', width:30, height:30, borderRadius:6,
              display:'flex', alignItems:'center', justifyContent:'center' }}>✕</button>
        </div>

        {/* Tab bar */}
        <div style={{ display:'flex', background:'#fff', borderBottom:'2px solid #e5e7eb', flexShrink:0, padding:'0 4px' }}>
          {TABS.map(t=>{
            const isAct = t.key===tab;
            return (
              <button key={t.key} onClick={()=>setTab(t.key)}
                style={{ padding:'11px 26px', border:'none',
                  borderBottom:isAct?`3px solid ${t.color}`:'3px solid transparent',
                  background:isAct?`${t.color}12`:'transparent',
                  color:isAct?t.color:'#6b7280',
                  fontFamily:F, fontSize:12.5, fontWeight:isAct?700:500,
                  cursor:'pointer', outline:'none', transition:'all 0.15s',
                  marginBottom:-2, whiteSpace:'nowrap' }}>
                {t.label}
              </button>
            );
          })}
        </div>

        {/* Tab content */}
        <div style={{ flex:1, overflowY:'auto' }}>
          {tab==='so'      && renderSO()}
          {tab==='po'      && renderPO()}
          {tab==='expense' && renderExpense()}
          {tab==='docs'    && renderDocs()}
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════
   ORDER MODAL — full details + receipt/payment
══════════════════════════════════════════════ */
function OrderModal({ type, order, dueRecord, cid, onClose, onSaved }) {
  const isSO       = type === 'so';
  const AC         = isSO ? P : PG;
  const items      = order.items   || [];
  const charges    = order.charges || [];
  const payments   = dueRecord?.linkedPayments || [];
  const orderTotal = parseFloat(order.grandTotal || order.amount) || 0;
  const subTotal   = parseFloat(order.subTotal) || 0;
  const totalGST   = parseFloat(order.totalGST) || 0;
  const totalPaid  = payments.reduce((s,p) => s + (parseFloat(p.amount)||0), 0);
  const balance    = orderTotal - totalPaid;

  const [form, setForm]     = useState({ date:today(), amount:'', mode:'NEFT', ref:'', notes:'' });
  const [saving, setSaving] = useState(false);
  const [msg,    setMsg]    = useState('');
  const set = (k,v) => setForm(f => ({...f,[k]:v}));

  const savePayment = async () => {
    const amt = parseFloat(form.amount);
    if (!amt || amt <= 0) { setMsg('Enter a valid amount'); return; }
    setSaving(true); setMsg('');
    try {
      await axios.post(`/api/accounts/payments?companyId=${cid}`, {
        type:        isSO ? 'receipt' : 'payment',
        orderId:     order.orderId,
        party:       isSO ? (order.customerName||order.clientName||'') : (order.vendorName||''),
        amount:      amt,
        date:        form.date,
        paymentMode: form.mode,
        reference:   form.ref,
        notes:       form.notes,
        status:      'confirmed',
        companyId:   cid,
      });
      setMsg('Saved successfully!');
      setForm(f => ({...f, amount:'', ref:'', notes:''}));
      onSaved();
    } catch(e) {
      setMsg('Error: ' + (e.response?.data?.error || e.message));
    }
    setSaving(false);
  };

  /* Section heading */
  const SH = ({ children }) => (
    <div style={{ fontSize:10, fontWeight:800, color:AC, textTransform:'uppercase',
      letterSpacing:'0.8px', borderBottom:`2px solid ${AC}`, paddingBottom:3,
      marginBottom:8, marginTop:14 }}>{children}</div>
  );

  /* Info cell */
  const IC = ({ label, val }) => (
    <div style={{ marginBottom:6 }}>
      <div style={{ fontSize:9, color:'#999', textTransform:'uppercase', letterSpacing:'0.5px' }}>{label}</div>
      <div style={{ fontSize:11, fontWeight:600, color:'#1f2937', marginTop:1 }}>{val||'—'}</div>
    </div>
  );

  const thS = (al='left') => ({
    padding:'4px 7px', color:'#fff', fontWeight:700, fontSize:9, textAlign:al,
    borderRight:'1px solid rgba(255,255,255,0.15)', whiteSpace:'nowrap', background:AC,
  });
  const tdS = (al='left', ex={}) => ({
    padding:'3px 7px', border:'1px solid #e8eef8', fontSize:10,
    fontFamily:F, textAlign:al, verticalAlign:'middle', ...ex,
  });

  /* Per-item computation */
  const calcItem = it => {
    const qty     = parseFloat(it.qty||it.quantity)||0;
    const rate    = parseFloat(it.rate)||0;
    const gst     = parseFloat(it.gst||it.gstPercent)||0;
    const disc    = it.discountType==='%'
                      ? qty*rate*(parseFloat(it.discount)||0)/100
                      : parseFloat(it.discount)||0;
    const base    = qty*rate;
    const taxable = base-disc;
    const gstAmt  = taxable*gst/100;
    return { qty, rate, base, disc, taxable, gst, gstAmt, cgst:gstAmt/2, sgst:gstAmt/2, total:taxable+gstAmt };
  };

  const partyName  = isSO ? (order.customerName||order.clientName||'—') : (order.vendorName||'—');
  const partyGstin = isSO ? (order.customerGstin||order.partyGstin||'—') : (order.vendorGstin||'—');
  const partyAddr  = isSO
    ? [order.customerCity,order.customerState,order.customerPincode].filter(Boolean).join(', ')
    : [order.vendorCity,order.vendorState,order.vendorPincode].filter(Boolean).join(', ');
  const orderNo    = isSO ? (order.orderNo||`SO-${order.orderId}`) : (order.poNo||order.poNumber||`PO-${order.orderId}`);
  const orderDate  = isSO ? (order.orderDate||order.date) : (order.poDate||order.date);

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', zIndex:1100,
      display:'flex', alignItems:'center', justifyContent:'center', padding:12 }}
      onClick={e => { if(e.target===e.currentTarget) onClose(); }}>
      <div style={{ background:'#fff', borderRadius:10, width:1000, maxWidth:'98vw',
        maxHeight:'92vh', overflow:'hidden', display:'flex', flexDirection:'column',
        fontFamily:F, boxShadow:'0 24px 80px rgba(0,0,0,0.4)' }}>

        {/* Header bar */}
        <div style={{ background:AC, color:'#fff', padding:'10px 16px', flexShrink:0,
          display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div>
            <div style={{ fontSize:9, opacity:0.7, textTransform:'uppercase', letterSpacing:'1px' }}>
              {isSO ? 'Sales Order · Client Receipt' : 'Purchase Order · Vendor Payment'}
            </div>
            <div style={{ fontSize:15, fontWeight:800, marginTop:2 }}>
              {orderNo}
              <span style={{ fontSize:12, fontWeight:400, opacity:0.8, marginLeft:12 }}>{partyName}</span>
            </div>
          </div>
          <button onClick={onClose}
            style={{ background:'rgba(255,255,255,0.15)', border:'1px solid rgba(255,255,255,0.3)',
              color:'#fff', fontSize:15, cursor:'pointer', width:28, height:28, borderRadius:5,
              display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>✕</button>
        </div>

        {/* Scrollable body */}
        <div style={{ overflowY:'auto', flex:1, padding:'14px 16px' }}>

          {/* Party / order meta */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'0 24px',
            background:'#f8faff', border:'1px solid #e0e8f8', borderRadius:8,
            padding:'10px 14px', marginBottom:8 }}>
            <IC label={isSO?'Client':'Vendor'}       val={partyName} />
            <IC label="GSTIN"                         val={partyGstin} />
            <IC label="City / State"                  val={partyAddr} />
            <IC label={isSO?'Customer PO Ref':'Linked SO'}
               val={isSO ? order.customerPO : (order.linkedSalesOrderId?`SO #${order.linkedSalesOrderId}`:'—')} />
            <IC label={isSO?'Order Date':'PO Date'}   val={fmtD(orderDate)} />
            <IC label="Due / Delivery Date"           val={fmtD(order.dueDate||order.deliveryDate)} />
            <IC label="Payment Terms"                 val={order.paymentTerms} />
            <IC label="Status"                        val={<StatusBadge s={order.status}/>} />
          </div>

          {/* Financial summary cards */}
          <div style={{ display:'flex', gap:8, marginBottom:8 }}>
            {[
              { label:'Sub Total',              val:`₹${fmt(subTotal||orderTotal-totalGST)}`, color:'#374151' },
              { label:'Total GST',              val:`₹${fmt(totalGST)}`,                     color:'#7a4500' },
              { label:'Grand Total',            val:`₹${fmt(orderTotal)}`,                   color:AC        },
              { label:isSO?'Received':'Paid',   val:`₹${fmt(totalPaid)}`,                    color:'#2e7d32' },
              { label:'Balance Due',            val:`₹${fmt(balance)}`,                      color:balance>0?'#b71c1c':'#2e7d32' },
            ].map(c => (
              <div key={c.label} style={{ flex:1, background:'#f8faff', border:'1px solid #e0e8f8',
                borderRadius:7, padding:'7px 10px', textAlign:'center' }}>
                <div style={{ fontSize:9, color:'#888', marginBottom:2 }}>{c.label}</div>
                <div style={{ fontSize:13, fontWeight:800, color:c.color }}>{c.val}</div>
              </div>
            ))}
          </div>

          {/* Line items table */}
          <SH>Line Items</SH>
          <div style={{ overflowX:'auto', border:'1px solid #e0e8f8', borderRadius:6, marginBottom:8 }}>
            <table style={{ borderCollapse:'collapse', fontSize:10, fontFamily:F, minWidth:900 }}>
              <thead>
                <tr>
                  <th style={thS('center')}>#</th>
                  <th style={{ ...thS('left'), minWidth:200 }}>Description / Item</th>
                  <th style={thS('center')}>HSN/SAC</th>
                  <th style={thS('center')}>Unit</th>
                  <th style={thS('right')}>Qty</th>
                  <th style={thS('right')}>Rate (₹)</th>
                  <th style={thS('right')}>Discount</th>
                  <th style={thS('right')}>Taxable (₹)</th>
                  <th style={thS('center')}>GST%</th>
                  <th style={thS('right')}>CGST (₹)</th>
                  <th style={thS('right')}>SGST (₹)</th>
                  <th style={thS('right')}>Total (₹)</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it,i) => {
                  const c = calcItem(it);
                  const discStr = c.disc > 0
                    ? (it.discountType==='%' ? `${it.discount}%` : `₹${fmt(c.disc)}`)
                    : '—';
                  return (
                    <tr key={i} style={{ background:i%2===0?'#fff':'#f7faff' }}>
                      <td style={tdS('center',{color:'#aaa',width:28})}>{i+1}</td>
                      <td style={tdS('left',{fontWeight:500})}>
                        <div style={{ fontWeight:600 }}>{it.description||it.itemName||it.name||'—'}</div>
                        {it.additionalDesc && <div style={{ fontSize:9,color:'#888',marginTop:1 }}>{it.additionalDesc}</div>}
                      </td>
                      <td style={tdS('center',{fontFamily:'monospace',fontSize:9,color:'#555'})}>{it.hsnCode||'—'}</td>
                      <td style={tdS('center')}>{it.unit||it.uom||'—'}</td>
                      <td style={tdS('right',{fontWeight:700})}>{fmtI(c.qty)}</td>
                      <td style={tdS('right')}>{fmt(c.rate)}</td>
                      <td style={tdS('right',{color:'#b06000'})}>{discStr}</td>
                      <td style={tdS('right')}>{fmt(c.taxable)}</td>
                      <td style={tdS('center',{color:'#555'})}>{c.gst}%</td>
                      <td style={tdS('right',{color:'#555'})}>{fmt(c.cgst)}</td>
                      <td style={tdS('right',{color:'#555'})}>{fmt(c.sgst)}</td>
                      <td style={tdS('right',{fontWeight:700,color:AC,fontSize:11})}>{fmt(c.total)}</td>
                    </tr>
                  );
                })}
                {items.length===0 && (
                  <tr><td colSpan={12} style={tdS('center',{padding:16,color:'#aaa',fontStyle:'italic'})}>No line items</td></tr>
                )}
              </tbody>

              {charges.length > 0 && charges.map((ch,i) => {
                const amt  = parseFloat(ch.amount)||0;
                const gst  = parseFloat(ch.gst)||0;
                const gstA = amt*gst/100;
                return (
                  <tbody key={`ch${i}`}>
                    <tr style={{ background:'#f0fff4' }}>
                      <td style={tdS('center',{color:'#aaa',fontStyle:'italic'})}>{items.length+i+1}</td>
                      <td style={tdS('left',{fontStyle:'italic',color:'#2e7d32',fontWeight:500})}>
                        {ch.chargeType||ch.description||'Additional Charge'}
                        {ch.description && ch.chargeType &&
                          <span style={{ fontSize:9,color:'#888',marginLeft:6 }}>{ch.description}</span>}
                      </td>
                      <td style={tdS('center')}>—</td><td style={tdS('center')}>—</td>
                      <td style={tdS('right')}>1</td>
                      <td style={tdS('right')}>{fmt(amt)}</td>
                      <td style={tdS('right')}>—</td>
                      <td style={tdS('right')}>{fmt(amt)}</td>
                      <td style={tdS('center')}>{gst}%</td>
                      <td style={tdS('right')}>{fmt(gstA/2)}</td>
                      <td style={tdS('right')}>{fmt(gstA/2)}</td>
                      <td style={tdS('right',{fontWeight:700,color:'#2e7d32'})}>{fmt(amt+gstA)}</td>
                    </tr>
                  </tbody>
                );
              })}

              <tfoot>
                <tr style={{ background:isSO?'#e8efff':'#e8f5e9', fontWeight:700 }}>
                  <td colSpan={7} style={tdS('right',{fontWeight:800,fontSize:11,borderTop:'2px solid #ccc'})}>TOTAL</td>
                  <td style={tdS('right',{fontWeight:800,borderTop:'2px solid #ccc'})}>{fmt(subTotal||orderTotal-totalGST)}</td>
                  <td style={tdS('center',{borderTop:'2px solid #ccc'})}></td>
                  <td style={tdS('right',{borderTop:'2px solid #ccc'})}>{fmt(totalGST/2)}</td>
                  <td style={tdS('right',{borderTop:'2px solid #ccc'})}>{fmt(totalGST/2)}</td>
                  <td style={tdS('right',{fontWeight:800,color:AC,fontSize:12,borderTop:'2px solid #ccc'})}>₹{fmt(orderTotal)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* P&F / freight note */}
          {(parseFloat(order.packingCharges)||0)+(parseFloat(order.freightCharges)||0) > 0 && (
            <div style={{ fontSize:10,color:'#666',marginBottom:8,padding:'4px 8px',
              background:'#fffbe8',border:'1px solid #ffe080',borderRadius:4 }}>
              P&amp;F: ₹{fmt(order.packingCharges||0)} &nbsp;·&nbsp;
              Transport: ₹{fmt(order.freightCharges||0)} &nbsp;·&nbsp;
              <strong>Grand Total incl. charges: ₹{fmt(orderTotal)}</strong>
            </div>
          )}

          {/* Payment / receipt history */}
          <SH>{isSO ? 'Receipt History (from Client)' : 'Payment History (to Vendor)'}</SH>
          {payments.length === 0 ? (
            <div style={{ padding:'12px 14px', textAlign:'center', color:'#aaa', fontSize:11,
              fontStyle:'italic', border:'1px solid #eee', borderRadius:6, marginBottom:8 }}>
              No {isSO?'receipts':'payments'} recorded yet for this order.
            </div>
          ) : (
            <div style={{ border:'1px solid #e0e8f8', borderRadius:6, overflow:'hidden', marginBottom:8 }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
                <thead>
                  <tr style={{ background:isSO?'#dce8ff':'#d0e8d0' }}>
                    {['#','Date','Amount (₹)','Mode','UTR / Reference','Notes','Status'].map((h,i) => (
                      <th key={i} style={{ padding:'4px 8px', fontSize:9, fontWeight:700,
                        textAlign:i===2?'right':'left', border:'1px solid #ddd',
                        color:'#333', textTransform:'uppercase', letterSpacing:'0.4px' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p,i) => (
                    <tr key={i} style={{ background:i%2===0?'#fff':'#f8fbff' }}>
                      <td style={{ padding:'3px 8px', border:'1px solid #eee', color:'#999', fontSize:9 }}>{i+1}</td>
                      <td style={{ padding:'3px 8px', border:'1px solid #eee', whiteSpace:'nowrap' }}>
                        {fmtD(p.date||p.paymentDate||p.createdAt)}
                      </td>
                      <td style={{ padding:'3px 8px', border:'1px solid #eee', textAlign:'right',
                        fontWeight:700, color:'#2e7d32', fontSize:12 }}>₹{fmt(p.amount)}</td>
                      <td style={{ padding:'3px 8px', border:'1px solid #eee' }}>{p.paymentMode||'—'}</td>
                      <td style={{ padding:'3px 8px', border:'1px solid #eee', fontFamily:'monospace',
                        fontSize:9, color:'#555' }}>{p.reference||p.ref||'—'}</td>
                      <td style={{ padding:'3px 8px', border:'1px solid #eee', color:'#666', fontSize:10 }}>{p.notes||'—'}</td>
                      <td style={{ padding:'3px 8px', border:'1px solid #eee' }}><StatusBadge s={p.status}/></td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ background:isSO?'#e0ecff':'#d8eed8', fontWeight:700 }}>
                    <td colSpan={2} style={{ padding:'4px 8px', border:'1px solid #ddd', fontSize:10 }}>
                      Total {isSO?'Received':'Paid'} ({payments.length} txn{payments.length>1?'s':''})
                    </td>
                    <td style={{ padding:'4px 8px', border:'1px solid #ddd', textAlign:'right',
                      color:'#2e7d32', fontSize:12 }}>₹{fmt(totalPaid)}</td>
                    <td colSpan={4} style={{ padding:'4px 8px', border:'1px solid #ddd', textAlign:'right',
                      color:balance>0?'#b71c1c':'#2e7d32', fontSize:11 }}>
                      Balance Due: ₹{fmt(balance)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {/* Add payment form */}
          <SH>{isSO ? '+ Add Receipt from Client' : '+ Add Payment to Vendor'}</SH>
          <div style={{ background:isSO?'#f0f5ff':'#f0fff4',
            border:`1px solid ${isSO?'#c7d8ff':'#a7f3d0'}`, borderRadius:8, padding:14 }}>
            {msg && (
              <div style={{ padding:'6px 10px', marginBottom:10, borderRadius:5, fontSize:11,
                background:msg.startsWith('Error')?'#fee2e2':'#dcfce7',
                color:msg.startsWith('Error')?'#b91c1c':'#133d80',
                border:`1px solid ${msg.startsWith('Error')?'#fca5a5':'#86efac'}` }}>
                {msg}
              </div>
            )}
            <div style={{ display:'grid', gridTemplateColumns:'130px 160px 130px 1fr', gap:10, marginBottom:10 }}>
              <div><Lbl>Date *</Lbl><Inp type="date" value={form.date} onChange={e=>set('date',e.target.value)} /></div>
              <div>
                <Lbl>Amount (₹) *</Lbl>
                <Inp type="number" value={form.amount}
                  placeholder={balance>0?`e.g. ${Math.round(balance)}`:'0'}
                  onChange={e=>set('amount',e.target.value)} />
              </div>
              <div>
                <Lbl>Mode</Lbl>
                <Sel value={form.mode} onChange={e=>set('mode',e.target.value)}>
                  {['NEFT','RTGS','Cheque','Cash','UPI','Online','DD'].map(m=><option key={m}>{m}</option>)}
                </Sel>
              </div>
              <div><Lbl>UTR / Reference No.</Lbl><Inp value={form.ref} placeholder="UTR / Cheque No." onChange={e=>set('ref',e.target.value)} /></div>
            </div>
            <div style={{ display:'flex', gap:10, alignItems:'flex-end' }}>
              <div style={{ flex:1 }}><Lbl>Notes (optional)</Lbl>
                <Inp value={form.notes} placeholder="Remarks, bank name, etc." onChange={e=>set('notes',e.target.value)} />
              </div>
              <button onClick={savePayment} disabled={saving}
                style={{ height:30, padding:'0 24px', background:saving?'#9ca3af':AC,
                  color:'#fff', border:'none', borderRadius:6, fontWeight:700,
                  cursor:saving?'not-allowed':'pointer', fontSize:12, fontFamily:F,
                  flexShrink:0, boxShadow:saving?'none':'0 2px 8px rgba(0,0,0,0.2)' }}>
                {saving ? 'Saving…' : isSO ? '✔ Save Receipt' : '✔ Save Payment'}
              </button>
            </div>
          </div>

        </div>{/* end scrollable body */}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════
   MAIN COMPONENT
══════════════════════════════════════════════ */
export default function ProjectList() {
  const [navTheme] = useNavTheme();
  const neu = navTheme === 'neu';
  const { selectedCompany } = useCompany();
  const cid      = selectedCompany?.companyId;
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const [salesOrders,    setSalesOrders]    = useState([]);
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [expenses,       setExpenses]       = useState([]);
  const [purchaseBills,  setPurchaseBills]  = useState([]);
  const [salesBills,     setSalesBills]     = useState([]);
  const [clientDues,     setClientDues]     = useState([]);
  const [vendorDues,     setVendorDues]     = useState([]);
  const [projects,       setProjects]       = useState([]);
  const [loading,        setLoading]        = useState(true);
  const [error,          setError]          = useState('');
  const [search,         setSearch]         = useState('');
  const [fy,             setFy]             = useState(getFY());
  const [view,           setView]           = useState('orders');
  const [modal,          setModal]          = useState(null); // {type:'so'|'po', order}
  const [rowModal,       setRowModal]       = useState(null); // {so, po, poBill, soDue, poDue}
  const [editingId,      setEditingId]      = useState(null); // { soId, value } — inline order-no edit
  const tableRef   = useRef(null);
  const prefLoaded = useRef(false);
  const onRowEnter = useCallback((soId) => {
    if (!tableRef.current) return;
    const tds = tableRef.current.querySelectorAll(`tr[data-soid="${soId}"] td`);
    tds.forEach(td => td.classList.add('row-hov'));
  }, []);
  const onRowLeave = useCallback((soId) => {
    if (!tableRef.current) return;
    const tds = tableRef.current.querySelectorAll(`tr[data-soid="${soId}"] td`);
    tds.forEach(td => td.classList.remove('row-hov'));
  }, []);
  const DEFAULT_HIDDEN = new Set([
    'so_pnf','so_transport','so_billDate','so_orderDesc','so_itemDesc',
    'so_billAmt','so_duesBill',
    'po_otherChg','po_purchDate','po_purchNo','po_amount','po_gstStatus','po_poDesc','po_itemDesc',
    'po_billAmt','po_duesBill',
    'exp_mode','exp_gstPct','exp_gstAmt',
  ]);
  const [hiddenCols, setHiddenCols] = useState(DEFAULT_HIDDEN);
  const [colPanelOpen, setColPanelOpen] = useState(false);
  const [colPanelTab,  setColPanelTab]  = useState('so');
  const cv  = key => !hiddenCols.has(key);
  const tcv = key => setHiddenCols(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });

  const SO_BTNS = [
    { key:'so_orderDate', label:'Order Date' }, { key:'so_clientPO',  label:'Client PO' },
    { key:'so_dueDate',   label:'Due Date'   }, { key:'so_orderDesc', label:'Order Desc'},
    { key:'so_itemDesc',  label:'Prod Desc'  }, { key:'so_qty',       label:'Qty'       },
    { key:'so_rate',      label:'Rate'       }, { key:'so_total',     label:'Total'     },
    { key:'so_pnf',       label:'P&F'        }, { key:'so_transport', label:'Transport' },
    { key:'so_taxable',   label:'Taxable'    }, { key:'so_gstPct',    label:'GST%'      },
    { key:'so_gstAmt',    label:'GST Amt'    }, { key:'so_ov',        label:'Order Val' },
    { key:'so_receipt',   label:'Receipt'    }, { key:'so_dues',      label:'Dues'      },
    { key:'so_billAmt',   label:'Bill Amt'   }, { key:'so_duesBill', label:'Dues(Bill)'  },
    { key:'so_billDate',  label:'Bill Date'  }, { key:'so_billNo',    label:'Bill No'   },
    { key:'so_status',    label:'Status'     },
  ];
  const PO_BTNS = [
    { key:'po_vendor',    label:'Vendor'     }, { key:'po_date',      label:'PO Date'   },
    { key:'po_no',        label:'PO No'      }, { key:'po_poDesc',    label:'PO Desc'   },
    { key:'po_itemDesc',  label:'Prod Desc'  }, { key:'po_qty',       label:'Qty'       },
    { key:'po_rate',      label:'Rate'       }, { key:'po_total',     label:'Total'     },
    { key:'po_otherChg',  label:'Other Chg'  }, { key:'po_taxable',   label:'Taxable'   },
    { key:'po_gstPct',    label:'GST%'       }, { key:'po_gstAmt',    label:'GST Amt'   },
    { key:'po_ov',        label:'Order Val'  }, { key:'po_payment',   label:'Payment'   },
    { key:'po_dues',      label:'PO Dues'    }, { key:'po_billAmt',   label:'Bill Amt'   },
    { key:'po_duesBill', label:'Dues(Bill)'  }, { key:'po_purchDate', label:'Purch Date' },
    { key:'po_purchNo',   label:'Purch No'   }, { key:'po_amount',    label:'Amount'    },
    { key:'po_gstStatus', label:'GST Status' },
  ];
  const EXP_BTNS = [
    { key:'exp_date',   label:'Date'         },
    { key:'exp_desc',   label:'Description'  },
    { key:'exp_vendor', label:'Vendor / By'  },
    { key:'exp_mode',   label:'Pay Mode'     },
    { key:'exp_gstPct', label:'GST%'         },
    { key:'exp_gstAmt', label:'GST Amt'      },
  ];

  const load = useCallback(async () => {
    if (!cid) return;
    setLoading(true); setError('');
    try {
      const [soR, poR, duesR, prR, pbR, sbR, expR] = await Promise.all([
        axios.get(`/api/sales-orders?companyId=${cid}`).catch(()=>({data:[]})),
        axios.get(`/api/purchase-orders?companyId=${cid}`).catch(()=>({data:[]})),
        axios.get(`/api/accounts/dues?companyId=${cid}`).catch(()=>({data:{}})),
        axios.get(`/api/projects?companyId=${cid}`).catch(()=>({data:[]})),
        axios.get(`/api/bills?companyId=${cid}&type=purchase`).catch(()=>({data:[]})),
        axios.get(`/api/bills?companyId=${cid}&type=sales`).catch(()=>({data:[]})),
        axios.get(`/api/accounts/expenses?companyId=${cid}`).catch(()=>({data:[]})),
      ]);
      setSalesOrders((soR.data||[]).filter(o => !o.tallyImported && !['draft','rejected'].includes(o.status)));
      setPurchaseOrders(poR.data||[]);
      setPurchaseBills(pbR.data||[]);
      setSalesBills(sbR.data||[]);
      setExpenses(expR.data||[]);
      const { clientDues:cd=[], vendorDues:vd=[] } = duesR.data || {};
      setClientDues(Array.isArray(cd) ? cd : []);
      setVendorDues(Array.isArray(vd) ? vd : []);
      setProjects(prR.data||[]);
    } catch(e) { setError(e.message); }
    setLoading(false);
  }, [cid]);

  useEffect(() => { load(); }, [load]);

  /* ── Persist column/FY preferences per company ── */
  useEffect(() => {
    if (!cid || prefLoaded.current) return;
    prefLoaded.current = true;
    try {
      const saved = JSON.parse(localStorage.getItem(`ep_jobcode_${cid}`) || '{}');
      if (saved.fy) setFy(saved.fy);
      if (Array.isArray(saved.hiddenCols)) setHiddenCols(new Set(saved.hiddenCols));
    } catch {}
  }, [cid]);

  useEffect(() => {
    if (!cid || !prefLoaded.current) return;
    try {
      localStorage.setItem(`ep_jobcode_${cid}`, JSON.stringify({ fy, hiddenCols:[...hiddenCols] }));
    } catch {}
  }, [cid, fy, hiddenCols]);

  /* ── Save inline order-no edit ── */
  const saveOrderNo = async (so, newVal) => {
    setEditingId(null);
    const trimmed = (newVal||'').trim();
    if (!trimmed || trimmed === (so.orderNo||'')) return;
    try {
      await axios.put(`/api/sales-orders/${so.orderId}`, { ...so, orderNo: trimmed }, { params: { companyId: cid } });
      load();
    } catch(e) { alert('Save failed: ' + (e.response?.data?.error || e.message)); }
  };

  /* ── Lookup helpers ── */
  const linkedPOs = soId =>
    purchaseOrders.filter(p =>
      String(p.linkedSalesOrderId)===String(soId) ||
      String(p.salesOrderId)===String(soId) ||
      String(p.soRef)===String(soId)
    );

  const getSODue = so => (Array.isArray(clientDues)?clientDues:[])
    .find(d => String(d.orderId)===String(so.orderId) || d.orderNo===so.orderNo);

  const getPODue = po => po && (Array.isArray(vendorDues)?vendorDues:[])
    .find(d => String(d.orderId)===String(po.orderId) || d.orderNo===po.poNo);

  /* Find the purchase bill that references this PO */
  const getPOBill = po => po && purchaseBills
    .find(b => String(b.orderId)===String(po.orderId) || b.orderNo===po.poNo || b.orderNo===po.poNumber);

  /* Find the sales bill that references this SO */
  const getSalesBill = so => so && salesBills
    .find(b => String(b.orderId)===String(so.orderId));

  /* ── Modal lookup ── */
  const modalDue = modal
    ? (modal.type==='so' ? getSODue(modal.order) : getPODue(modal.order))
    : null;

  /* ── Filter ── */
  const fyList = useMemo(() => {
    const set = new Set(salesOrders.map(o => getFY(o.orderDate||o.date)));
    set.add(getFY());   // current FY is the default, so it is always in the list
    return ['all', ...[...set].sort().reverse()];
  }, [salesOrders]);

  const filteredSOs = useMemo(() => {
    let list = fy === 'all' ? salesOrders : salesOrders.filter(o => getFY(o.orderDate||o.date) === fy);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(o => {
        if ((o.customerName||o.clientName||'').toLowerCase().includes(q)) return true;
        if (String(o.orderId).includes(q) || (o.orderNo||'').toLowerCase().includes(q)) return true;
        if ((o.customerPO||'').toLowerCase().includes(q)) return true;
        if ((o.items||[]).some(i => (i.name||'').toLowerCase().includes(q) || (i.desc||i.description||'').toLowerCase().includes(q))) return true;
        const lpos = purchaseOrders.filter(p =>
          String(p.linkedSalesOrderId)===String(o.orderId) ||
          String(p.salesOrderId)===String(o.orderId) ||
          String(p.soRef)===String(o.orderId));
        for (const p of lpos) {
          if ((p.vendorName||'').toLowerCase().includes(q)) return true;
          if ((p.poNo||p.poNumber||'').toLowerCase().includes(q)) return true;
          if ((p.items||[]).some(i => (i.name||'').toLowerCase().includes(q))) return true;
        }
        return false;
      });
    }
    return [...list].sort((a, b) => {
      const da = new Date(a.orderDate||a.date||0).getTime();
      const db = new Date(b.orderDate||b.date||0).getTime();
      return db - da;
    });
  }, [salesOrders, purchaseOrders, fy, search]);

  /* ── Build flat rows ── */
  const expByOrderId = {};
  for (const ex of expenses) {
    const k = String(ex.soId || ex.orderId || '');
    if (!k) continue;
    if (!expByOrderId[k]) expByOrderId[k] = [];
    expByOrderId[k].push(ex);
  }

  const allRows = [];
  const GT = { soTotal:0, pnf:0, transport:0, soTaxable:0, soGst:0, soOV:0, receipt:0, dues:0,
               soGTtotal:0, soBillAmt:0,
               poTotal:0, otherC:0, poTaxable:0, poGst:0, poOV:0, payment:0, poDues:0,
               poGTtotal:0, poBillAmt:0,
               expTotal:0, expGst:0, expCount:0 };

  for (const so of filteredSOs) {
    const pos       = linkedPOs(so.orderId);
    const soItems   = (so.items||[]).map(normSOItem);
    const soExps2   = expByOrderId[String(so.orderId)] || [];
    const pnf       = parseFloat(so.packingCharges)||0;
    const transport = parseFloat(so.freightCharges)||0;
    const soDue     = getSODue(so);
    const salesBill = getSalesBill(so);
    const receipt   = soDue ? parseFloat(soDue.received||soDue.totalPaid)||0 : 0;
    const soBalance = soDue ? parseFloat(soDue.due||soDue.balance)||0 : 0;

    GT.soBillAmt += parseFloat(salesBill?.grandTotal||0);
    GT.soGTtotal += parseFloat(so.grandTotal||so.amount||0);

    // GT — SO level (once per SO)
    GT.pnf       += pnf;
    GT.transport += transport;
    GT.receipt   += receipt;
    GT.dues      += soBalance;
    GT.expTotal  += soExps2.reduce((s,e) => s+(parseFloat(e.grandTotal||e.amount)||0), 0);
    GT.expGst    += soExps2.reduce((s,e) => s+(parseFloat(e.amount)||0)*(parseFloat(e.taxRate)||0)/100, 0);
    GT.expCount  += soExps2.length;
    soItems.forEach((soIt, idx) => {
      const soBase = soIt.qty*soIt.rate;
      const soGst  = soBase*soIt.gst/100;
      GT.soTotal   += soBase; GT.soTaxable += soBase; GT.soGst += soGst;
      GT.soOV      += soBase+soGst+(idx===0?pnf+transport:0);
    });

    // one "PO block" per linked PO (or one empty block when no POs at all)
    const poList       = pos.length > 0 ? pos : [null];
    const poBlockSizes = poList.map(po => Math.max(po ? (po.items||[]).length : 0, 1));
    const totalPORows  = poBlockSizes.reduce((s,n) => s+n, 0);
    const soTotalRows  = Math.max(soItems.length, totalPORows, soExps2.length);

    // GT — PO level (once per PO)
    poList.forEach(po => {
      if (!po) return;
      const poDue   = getPODue(po);
      const poBill_ = getPOBill(po);
      const otherC  = (parseFloat(po.packingCharges)||0)+(parseFloat(po.freightCharges)||0);
      GT.poBillAmt += parseFloat(poBill_?.grandTotal||0);
      GT.poGTtotal += parseFloat(po.grandTotal||po.amount||0);
      GT.otherC  += otherC;
      GT.payment += poDue ? parseFloat(poDue.paid||poDue.totalPaid)||0 : 0;
      GT.poDues  += poDue ? parseFloat(poDue.due||poDue.balance)||0 : 0;
      let firstPI = true;
      (po.items||[]).map(normPOItem).forEach(poIt => {
        const poBase = poIt.qty*poIt.rate;
        const d      = poIt.discountType==='%' ? poBase*poIt.discount/100 : poIt.discount;
        const poTax  = poBase-d;
        const poGst  = poTax*poIt.gst/100;
        GT.poTotal   += poBase; GT.poTaxable += poTax; GT.poGst += poGst;
        GT.poOV      += poTax+poGst+(firstPI?otherC:0);
        firstPI = false;
      });
    });

    let absIdx = 0;
    for (let pb = 0; pb < poList.length; pb++) {
      const po          = poList[pb];
      const poItems     = po ? (po.items||[]).map(normPOItem) : [];
      const poBlockSize = poBlockSizes[pb];
      const poDue       = getPODue(po);
      const poBill      = getPOBill(po);
      const payment     = poDue ? parseFloat(poDue.paid||poDue.totalPaid)||0 : 0;
      const poBalance   = poDue ? parseFloat(poDue.due||poDue.balance)||0 : 0;
      const otherC      = po ? (parseFloat(po.packingCharges)||0)+(parseFloat(po.freightCharges)||0) : 0;

      for (let i = 0; i < poBlockSize; i++) {
        const soIt      = soItems[absIdx] || null;
        const poIt      = poItems[i]      || null;
        const isSOFirst = absIdx === 0;
        const isSOLast  = absIdx === soTotalRows - 1;
        const isPOFirst = i === 0;

        const soBase = soIt ? soIt.qty*soIt.rate : 0;
        const soGst  = soBase*(soIt?soIt.gst:0)/100;
        const soOV   = soBase+soGst+(isSOFirst?pnf+transport:0);

        let poBase=0, poTaxable=0, poGst=0, poOV=0;
        if (poIt) {
          poBase    = poIt.qty*poIt.rate;
          const d   = poIt.discountType==='%' ? poBase*poIt.discount/100 : poIt.discount;
          poTaxable = poBase-d;
          poGst     = poTaxable*poIt.gst/100;
          poOV      = poTaxable+poGst+(isPOFirst?otherC:0);
        }

        allRows.push({
          key:`${so.orderId}-${pb}-${i}`,
          isFirst:isSOFirst, isLast:isSOLast, rowCount:soTotalRows,
          isSOFirst, isSOLast, isPOFirst,
          soRowCount:soTotalRows, poBlockSize,
          so, soItem:soIt, soBase, soGst, soOV,
          pnf:isSOFirst?pnf:0, transport:isSOFirst?transport:0,
          po, poItem:poIt, poBase, poTaxable, poGst, poOV, otherC:isPOFirst?otherC:0,
          receipt, soBalance, payment, poBalance,
          soDue, poDue,
          poBill:    isPOFirst  ? poBill    : null,
          salesBill: isSOFirst  ? salesBill : null,
          expItem: soExps2[absIdx] || null,
        });
        absIdx++;
      }
    }

    /* ── Tail rows: when expenses or SO items exceed the total PO rows, generate
       extra rows so the rowSpan on SO-level cells matches the rows we actually
       produce. Without these, the rowSpan overflows into the next SO's rows and
       shifts its cells into the wrong columns. ── */
    while (absIdx < soTotalRows) {
      const soIt     = soItems[absIdx] || null;
      const isSOLast = absIdx === soTotalRows - 1;
      const soBase   = soIt ? soIt.qty*soIt.rate : 0;
      const soGst    = soBase*(soIt?soIt.gst:0)/100;
      allRows.push({
        key:`${so.orderId}-tail-${absIdx}`,
        isFirst:false, isLast:isSOLast, rowCount:soTotalRows,
        isSOFirst:false, isSOLast, isPOFirst:false,
        soRowCount:soTotalRows, poBlockSize:0,
        so, soItem:soIt, soBase, soGst, soOV:soBase+soGst,
        pnf:0, transport:0,
        po:null, poItem:null, poBase:0, poTaxable:0, poGst:0, poOV:0, otherC:0,
        receipt, soBalance, payment:0, poBalance:0,
        soDue, poDue:null,
        poBill:null, salesBill:null,
        expItem: soExps2[absIdx] || null,
      });
      absIdx++;
    }
  }

  /* ── Cell styles ── */
  /* Soft look: soft hairlines instead of black, header = surface colour with the
     section colour as text + underline (SO green, PO red, EXP orange). */
  const BDX    = neu ? NEU_LINE : BD;                       // grid line colour
  const LINE_B = `1px solid ${BDX}`;
  const softTh = (color) => ({ background:NEU.base, color, border:`1px solid ${NEU_LINE}`, borderBottom:`2px solid ${color}`, fontWeight:800 });
  const th  = (align='left',w,ex={}) => ({
    padding:'4px 6px', background:'#3d8b40', color:'#fff',
    fontSize:11, fontWeight:700, textAlign:align,
    border:'1px solid #2e7d32', whiteSpace:'nowrap',
    ...(neu ? softTh('#2E7D32') : {}),
    ...(w?{width:w,minWidth:w}:{}), ...ex,
  });
  const pth = (align='left',w,ex={}) => ({
    padding:'4px 6px', background:'#d32f2f', color:'#fff',
    fontSize:11, fontWeight:700, textAlign:align,
    border:'1px solid #b71c1c', whiteSpace:'nowrap',
    ...(neu ? softTh('#C62828') : {}),
    ...(w?{width:w,minWidth:w}:{}), ...ex,
  });
  const td  = (align='left',ex={}) => ({
    padding:'2px 5px', fontSize:10, fontFamily:F, border:`1px solid ${BDX}`,
    verticalAlign:'middle', textAlign:align, ...ex,
  });
  const ptd = (align='left',ex={}) => ({...td(align,ex)});
  const etd = (align='left',ex={}) => ({
    padding:'2px 5px', fontSize:10, fontFamily:F, border: neu ? `1px solid ${NEU_LINE}` : '1px solid #fed7aa',
    verticalAlign:'middle', textAlign:align, ...ex,
  });
  const eth = (align='left',w,ex={}) => ({
    padding:'4px 6px', background:'#f97316', color:'#fff',
    fontSize:11, fontWeight:700, textAlign:align,
    border:'1px solid #ea580c', whiteSpace:'nowrap',
    ...(neu ? softTh('#EA580C') : {}),
    ...(w?{width:w,minWidth:w}:{}), ...ex,
  });
  const SOBg = () => neu ? NEU_ROW : '#ffffff'; // all rows one colour — no zebra striping
  /* TOTAL row tints per section */
  const TOT_SO = neu ? '#D5DDEB' : '#dce6ff';
  const TOT_PO = neu ? '#D3E1D7' : '#d0ecd0';
  const TOT_EX = neu ? '#E8DCCF' : '#fff3e0';

  /* ── Projects view ── */
  const fmtDFull = d => {
    if(!d) return '—'; const dt=new Date(d);
    return isNaN(dt)?d:`${String(dt.getDate()).padStart(2,'0')}-${String(dt.getMonth()+1).padStart(2,'0')}-${dt.getFullYear()}`;
  };

  if (!cid) return null;

  const doExportOrders = () => {
    const co = selectedCompany?.companyName || '';
    const wb = XLSX.utils.book_new();
    const soHdr = ['Order ID','Client Name','Order Date','Client PO No','Due Date',
      'Product','Qty','Rate (₹)','Base Amt (₹)','P&F (₹)','Transport (₹)','Taxable (₹)',
      'GST %','GST Amt (₹)','Order Value (₹)','Receipt (₹)','Dues (₹)',
      'Sales Bill No','Sales Bill Date','SO Status'];
    const poHdr = ['Vendor','PO Date','PO No','PO Product','PO Qty','PO Rate (₹)',
      'PO Base (₹)','Other Charges (₹)','PO Taxable (₹)','PO GST %','PO GST Amt (₹)',
      'PO Order Value (₹)','Payment (₹)','PO Dues (₹)',
      'Bill No','Bill Date','Bill Amount (₹)','GST Type'];
    const dataRows = allRows.map(row => [
      row.so?.orderNo || `SO-${row.so?.orderId}` || '',
      row.so?.customerName || row.so?.clientName || '',
      row.so?.orderDate || row.so?.date || '',
      row.so?.customerPO || '',
      row.so?.dueDate || row.so?.deliveryDate || '',
      row.soItem?.name || '',
      row.soItem?.qty || '',
      row.soItem?.rate || '',
      parseFloat(row.soBase) || 0,
      row.pnf || 0,
      row.transport || 0,
      parseFloat(row.soBase) || 0,
      row.soItem?.gst || 0,
      parseFloat(row.soGst) || 0,
      parseFloat(row.soOV) || 0,
      parseFloat(row.receipt) || 0,
      parseFloat(row.soBalance) || 0,
      row.salesBill?.billNo || '',
      row.salesBill?.billDate || '',
      row.so?.status || '',
      row.po?.vendorName || '',
      row.po?.poDate || row.po?.date || '',
      row.po?.poNo || row.po?.poNumber || '',
      row.poItem?.name || '',
      row.poItem?.qty || '',
      row.poItem?.rate || '',
      parseFloat(row.poBase) || 0,
      parseFloat(row.otherC) || 0,
      parseFloat(row.poTaxable) || 0,
      row.poItem?.gst || 0,
      parseFloat(row.poGst) || 0,
      parseFloat(row.poOV) || 0,
      parseFloat(row.payment) || 0,
      parseFloat(row.poBalance) || 0,
      row.poBill?.billNo || '',
      row.poBill?.billDate || '',
      parseFloat(row.poBill?.grandTotal) || 0,
      row.poBill?.gstType || '',
    ]);
    const ws = XLSX.utils.aoa_to_sheet([[...soHdr, ...poHdr], ...dataRows]);
    ws['!cols'] = [...soHdr, ...poHdr].map((_,i) => ({ wch: i < 5 ? 18 : i === 5 || i === 23 ? 30 : 14 }));
    XLSX.utils.book_append_sheet(wb, ws, 'Orders');
    XLSX.writeFile(wb, `${co ? co+'_' : ''}Orders_${new Date().toISOString().slice(0,10)}.xlsx`);
  };

  const doExportProjects = () => {
    const co = selectedCompany?.companyName || '';
    const wb = XLSX.utils.book_new();
    const headers = ['ID','Project Name','Client','Start Date','End Date','Budget (₹)','Status'];
    const rows = projects.map(p => [
      p.projectId, p.projectName || '', p.clientName || '',
      p.startDate || '', p.endDate || '', parseFloat(p.budget) || 0, p.status || '',
    ]);
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    ws['!cols'] = [{ wch:10 },{ wch:30 },{ wch:25 },{ wch:14 },{ wch:14 },{ wch:16 },{ wch:14 }];
    XLSX.utils.book_append_sheet(wb, ws, 'Projects');
    XLSX.writeFile(wb, `${co ? co+'_' : ''}Projects_${new Date().toISOString().slice(0,10)}.xlsx`);
  };

  const doPrintOrders = () => {
    const co = selectedCompany?.companyName || '';
    const fyLabel = fy === 'all' ? 'All Financial Years' : `FY ${fy}`;
    const soCount = filteredSOs.length;
    const poCount = allRows.filter(r => r.isPOFirst && r.po).length;
    const rows = allRows.map((row, i) => {
      const expBase   = parseFloat(row.expItem?.amount) || 0;
      const expGstPct = parseFloat(row.expItem?.taxRate) || 0;
      const expTotal  = parseFloat(row.expItem?.grandTotal) || (expBase + expBase * expGstPct / 100);
      const bgSO = row.isFirst ? (filteredSOs.indexOf(row.so) % 2 === 0 ? '#EEF3FF' : '#F7F5FF') : 'transparent';
      return `<tr style="border-bottom:1px solid #e0e7ef">
        <td style="font-weight:700;color:#1a3a8a;background:${bgSO};padding:4px 6px;border-right:1px solid #000000;white-space:nowrap">${row.isFirst ? (row.so?.orderNo||row.so?.orderId||'') : ''}</td>
        <td style="font-weight:${row.isFirst?700:400};color:#1a3a8a;background:${bgSO};padding:4px 6px;border-right:1px solid #000000">${row.isFirst ? (row.so?.customerName||row.so?.clientName||'') : ''}</td>
        <td style="background:${bgSO};padding:4px 6px;border-right:1px solid #000000;white-space:nowrap">${row.isFirst ? fmtD(row.so?.orderDate||row.so?.date) : ''}</td>
        <td style="background:${bgSO};padding:4px 6px;border-right:1px solid #000000">${row.isFirst ? (row.so?.customerPO||'') : ''}</td>
        <td style="padding:4px 6px;border-right:1px solid #000000">${row.soItem?.name||''}</td>
        <td style="text-align:right;padding:4px 6px;border-right:1px solid #000000">${row.soItem?.qty||''}</td>
        <td style="text-align:right;padding:4px 6px;border-right:1px solid #000000;font-weight:700">${row.soOV ? '₹'+fmt(row.soOV) : ''}</td>
        <td style="text-align:right;padding:4px 6px;border-right:1px solid #000000;color:#15803d">${row.isFirst && row.receipt ? '₹'+fmt(row.receipt) : ''}</td>
        <td style="text-align:right;padding:4px 6px;border-right:2px solid #9ab0e0;color:#dc2626;font-weight:700">${row.isFirst ? '₹'+fmt(row.soBalance) : ''}</td>
        <td style="color:#1a5500;font-weight:${row.isPOFirst?700:400};padding:4px 6px;border-right:1px solid #c0e4c0">${row.isPOFirst ? (row.po?.vendorName||'') : ''}</td>
        <td style="padding:4px 6px;border-right:1px solid #c0e4c0;white-space:nowrap">${row.isPOFirst ? (row.po?.poNo||row.po?.poNumber||'') : ''}</td>
        <td style="padding:4px 6px;border-right:1px solid #c0e4c0">${row.poItem?.name||''}</td>
        <td style="text-align:right;padding:4px 6px;border-right:1px solid #c0e4c0;font-weight:700;color:#1a5500">${row.poOV ? '₹'+fmt(row.poOV) : ''}</td>
        <td style="text-align:right;padding:4px 6px;border-right:1px solid #c0e4c0;color:#15803d">${row.isPOFirst ? '₹'+fmt(row.payment||0) : ''}</td>
        <td style="text-align:right;padding:4px 6px;border-right:2px solid #aad4aa;color:#dc2626">${row.isPOFirst ? '₹'+fmt(row.poBalance||0) : ''}</td>
        <td style="padding:4px 6px;border-right:1px solid #fdd9aa;color:#7c3700;font-weight:600">${row.expItem ? (row.expItem.expenseCategory||row.expItem.category||'') : ''}</td>
        <td style="padding:4px 6px;border-right:1px solid #fdd9aa">${row.expItem ? (row.expItem.vendorName||row.expItem.vendor||row.expItem.ledgerName||'') : ''}</td>
        <td style="text-align:right;padding:4px 6px;color:#c2410c;font-weight:700">${row.expItem ? '₹'+fmt(expTotal) : ''}</td>
      </tr>`;
    }).join('');

    const soTotals = {
      ov: allRows.reduce((s,r) => s + (r.soOV||0), 0),
      receipt: filteredSOs.reduce((s,so) => {
        const due = (Array.isArray(clientDues)?clientDues:[]).find(d => String(d.orderId)===String(so.orderId)||d.orderNo===so.orderNo);
        return s + (parseFloat(due?.received||due?.totalPaid)||0);
      }, 0),
      dues: allRows.filter(r=>r.isFirst).reduce((s,r) => s+(r.soBalance||0), 0),
    };
    const poTotals = {
      ov: allRows.reduce((s,r) => s+(r.poOV||0), 0),
      paid: allRows.filter(r=>r.isPOFirst).reduce((s,r) => s+(r.payment||0), 0),
      dues: allRows.filter(r=>r.isPOFirst).reduce((s,r) => s+(r.poBalance||0), 0),
    };
    const expTotal2 = allRows.reduce((s,r) => {
      if (!r.expItem) return s;
      const b = parseFloat(r.expItem.amount)||0;
      const g = b*(parseFloat(r.expItem.taxRate)||0)/100;
      return s + (parseFloat(r.expItem.grandTotal)||(b+g));
    }, 0);

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Project Orders — ${co}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0;}
body{font-family:'Segoe UI',Arial,sans-serif;font-size:8.5pt;background:#fff;color:#1f2937;}
.hdr{background:linear-gradient(135deg,#1a3a8a 0%,#104f4f 100%);color:#fff;padding:12px 18px;display:flex;justify-content:space-between;align-items:center;}
.hdr h1{font-size:14pt;font-weight:900;letter-spacing:0.5px;}
.hdr .sub{font-size:8.5pt;opacity:0.85;margin-top:3px;}
.cards{display:flex;gap:10px;padding:10px 18px;background:#f0f4ff;border-bottom:1px solid #dde4f5;}
.card{background:#fff;border:1px solid #000000;border-radius:6px;padding:7px 14px;flex:1;text-align:center;}
.card .lbl{font-size:7.5pt;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;}
.card .val{font-size:12pt;font-weight:900;margin-top:2px;}
.card.so .val{color:#1a3a8a}.card.recv .val{color:#15803d}.card.dues .val{color:#dc2626}.card.exp .val{color:#c2410c}
table{width:100%;border-collapse:collapse;font-size:7.5pt;}
.grp-hdr{font-size:8.5pt;font-weight:800;text-transform:uppercase;letter-spacing:0.5px;padding:5px 8px 2px;color:#555;border-top:2px solid #dde;background:#fafbff;}
th{padding:5px 6px;text-align:left;border:1px solid #000000;font-size:7pt;font-weight:700;}
th.so-h{background:#1a3a8a;color:#fff;}
th.po-h{background:#2a6600;color:#fff;}
th.exp-h{background:#c2410c;color:#fff;}
th.ra{text-align:right;}
td{vertical-align:top;}
tfoot td{background:#eef2ff;font-weight:700;font-size:7.5pt;padding:4px 6px;border-top:2px solid #9ab0e0;}
tfoot td.po{background:#e8f5e9;}tfoot td.exp{background:#fff3e0;}
@media print{@page{size:A3 landscape;margin:6mm;}body{font-size:7.5pt;}}
</style></head><body>
<div class="hdr">
  <div><div class="sub" style="font-size:10pt;opacity:0.7;margin-bottom:2px">${co}</div><h1>PROJECT ORDERS REPORT</h1><div class="sub">${fyLabel} &nbsp;|&nbsp; ${soCount} Sales Orders &nbsp;|&nbsp; ${poCount} Purchase Orders</div></div>
  <div style="text-align:right;font-size:8pt;opacity:0.8">Printed: ${new Date().toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'})}</div>
</div>
<div class="cards">
  <div class="card so"><div class="lbl">SO Value</div><div class="val">₹${fmt(soTotals.ov)}</div></div>
  <div class="card recv"><div class="lbl">Received</div><div class="val">₹${fmt(soTotals.receipt)}</div></div>
  <div class="card dues"><div class="lbl">SO Dues</div><div class="val">₹${fmt(soTotals.dues)}</div></div>
  <div class="card so" style="border-color:#aad4aa"><div class="lbl">PO Value</div><div class="val" style="color:#1a5500">₹${fmt(poTotals.ov)}</div></div>
  <div class="card recv"><div class="lbl">PO Paid</div><div class="val">₹${fmt(poTotals.paid)}</div></div>
  <div class="card dues"><div class="lbl">PO Dues</div><div class="val">₹${fmt(poTotals.dues)}</div></div>
  <div class="card exp"><div class="lbl">Expenses</div><div class="val">₹${fmt(expTotal2)}</div></div>
</div>
<table>
<thead><tr>
  <th class="so-h" style="width:70px">Order No</th>
  <th class="so-h" style="width:110px">Client</th>
  <th class="so-h" style="width:55px">Date</th>
  <th class="so-h" style="width:70px">Client PO</th>
  <th class="so-h" style="width:100px">SO Product</th>
  <th class="so-h ra" style="width:35px">Qty</th>
  <th class="so-h ra" style="width:70px">SO Value</th>
  <th class="so-h ra" style="width:65px">Received</th>
  <th class="so-h ra" style="width:65px">SO Dues</th>
  <th class="po-h" style="width:90px">Vendor</th>
  <th class="po-h" style="width:70px">PO No</th>
  <th class="po-h" style="width:90px">PO Product</th>
  <th class="po-h ra" style="width:65px">PO Value</th>
  <th class="po-h ra" style="width:60px">Paid</th>
  <th class="po-h ra" style="width:60px">PO Dues</th>
  <th class="exp-h" style="width:70px">Exp Category</th>
  <th class="exp-h" style="width:80px">Exp Vendor</th>
  <th class="exp-h ra" style="width:60px">Exp Amt</th>
</tr></thead>
<tbody>${rows}</tbody>
<tfoot><tr>
  <td colspan="6" class="so" style="text-align:right">TOTAL</td>
  <td class="so" style="text-align:right">₹${fmt(soTotals.ov)}</td>
  <td class="so" style="text-align:right">₹${fmt(soTotals.receipt)}</td>
  <td class="so" style="text-align:right;color:#dc2626">₹${fmt(soTotals.dues)}</td>
  <td colspan="2" class="po"></td>
  <td class="po"></td>
  <td class="po" style="text-align:right">₹${fmt(poTotals.ov)}</td>
  <td class="po" style="text-align:right">₹${fmt(poTotals.paid)}</td>
  <td class="po" style="text-align:right;color:#dc2626">₹${fmt(poTotals.dues)}</td>
  <td colspan="2" class="exp"></td>
  <td class="exp" style="text-align:right;color:#c2410c">₹${fmt(expTotal2)}</td>
</tr></tfoot>
</table>
<script>window.onload=()=>setTimeout(()=>window.print(),500);<\/script>
</body></html>`;
    const w = window.open('', '_blank', 'width=1400,height=900');
    if (!w) { alert('Allow pop-ups to print.'); return; }
    w.document.write(withPrintFont(html)); w.document.close();
  };

  const doPrintProjects = () => {
    const rowsHtml = projects.map((p,i)=>`<tr style="background:${i%2===0?'#fff':'#f5f8ff'}">
      <td>${p.projectId}</td><td style="font-weight:700">${p.projectName||'—'}</td>
      <td>${p.clientName||'—'}</td><td>${fmtDFull(p.startDate)}</td>
      <td>${fmtDFull(p.endDate)}</td>
      <td style="text-align:right">${p.budget?'₹'+fmt(p.budget):'—'}</td>
      <td>${p.status||'—'}</td></tr>`).join('');
    const html=`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Projects</title>
<style>*{box-sizing:border-box;margin:0;padding:0;}body{font-family:Arial,sans-serif;font-size:9.5pt;}
.hdr{background:#1a4a9a;color:#fff;padding:10px 16px;display:flex;justify-content:space-between;align-items:center;}
table{width:100%;border-collapse:collapse;font-size:9pt;}
th{background:#1a4a9a;color:#fff;padding:6px 10px;text-align:left;border:1px solid #0d2d6b;}
td{padding:5px 10px;border:1px solid #000000;}
@media print{@page{size:A4 landscape;margin:8mm;}}</style></head><body>
<div class="hdr"><div><h1 style="font-size:14pt;font-weight:900">PROJECTS LIST</h1>
<div style="font-size:9pt;opacity:0.8;margin-top:2px">${selectedCompany?.companyName||''} &nbsp;|&nbsp; ${projects.length} projects</div></div>
<div style="font-size:9pt;opacity:0.8">Printed: ${new Date().toLocaleDateString('en-IN')}</div></div>
<table><thead><tr><th>ID</th><th>Project Name</th><th>Client</th><th>Start</th><th>End</th><th style="text-align:right">Budget</th><th>Status</th></tr></thead>
<tbody>${rowsHtml}</tbody></table>
<script>window.onload=()=>setTimeout(()=>window.print(),400);<\/script>
</body></html>`;
    const w=window.open('','_blank','width=1000,height=800');
    if(!w){alert('Allow pop-ups.');return;}
    w.document.write(withPrintFont(html));w.document.close();
  };

  return (
    <div className="neu-native" style={{ fontFamily:F, fontSize:11, display:'flex', flexDirection:'column', height:'100%', ...(neu ? { background:NEU.base } : {}) }}>
      <style>{`
        .proj-row td {
          transition: background-color 0.15s ease, box-shadow 0.15s ease;
        }
        ${neu ? `
        /* Soft look: the whole hovered jobcode looks like one pressed-in button —
           pressed surface + orange text, inner shadow on its top/left edge and a
           light edge at the bottom (no per-cell shadows, no bar on every line). */
        .proj-row td.row-hov { background-color: #D9DFE8 !important; color: #C2410C !important; }
        .proj-row td.row-hov * { color: #C2410C !important; }
        .proj-row.so-first td.row-hov { box-shadow: inset 0 5px 7px -4px #A3B1C6 !important; }
        .proj-row.so-last td.row-hov { box-shadow: inset 0 -5px 7px -4px #FFFFFF !important; }
        .proj-row.so-first.so-last td.row-hov { box-shadow: inset 0 5px 7px -4px #A3B1C6, inset 0 -5px 7px -4px #FFFFFF !important; }
        /* frozen Jobcode / Client cells keep their right-hand line; Jobcode also gets the left edge */
        .proj-row.so-first td.row-hov:first-child { box-shadow: inset 5px 5px 7px -4px #A3B1C6, inset -1px 0 0 ${NEU_LINE} !important; }
        .proj-row.so-first td.row-hov:nth-child(2) { box-shadow: inset 0 5px 7px -4px #A3B1C6, inset -1px 0 0 ${NEU_LINE} !important; }
        ` : `
        .proj-row td.row-hov {
          background-color: #EEF4FF !important;
          box-shadow: inset 0 1px 0 #c7d9ff, inset 0 -1px 0 #c7d9ff;
          color: #1a3a8a !important;
        }
        .proj-row td.row-hov:first-child {
          box-shadow: inset 4px 0 0 #3A6186, inset 0 1px 0 #c7d9ff, inset 0 -1px 0 #c7d9ff;
        }
        `}
        .proj-row:hover { z-index: 5; position: relative; }   /* below the pinned header (10) and TOTAL row (9) */
        /* Header row pinned to the top and TOTAL row pinned to the bottom while the
           table scrolls. Set on the cells (not on thead/tfoot) — that works the
           same in Chrome, Edge and Firefox. */
        .proj-tbl thead th { position: sticky; top: 0; z-index: 10; }
        .proj-tbl tfoot td { position: sticky; bottom: 0; z-index: 9; }
        /* Inside an order only the column lines show; one full-width line marks
           where each order starts (and so closes the one above). Cells spanning
           the whole order sit in its first row, so they get the same line. */
        .proj-tbl tbody tr { border-top: none !important; border-bottom: none !important; }
        .proj-tbl tbody td { border-top: none !important; border-bottom: none !important; }
        .proj-tbl tbody tr.so-first td { border-top: 1px solid ${neu ? NEU_LINE : BD} !important; }
      `}</style>

      {/* ── TOOLBAR — classic-button style, matching the sidebar/SubNav ── */}
      <div style={neu ? {
        background:NEU.base, padding:'9px 12px', display:'flex', alignItems:'center',
        flexWrap:'nowrap', overflowX:'auto', minHeight:48, gap:0, flexShrink:0,
        boxShadow:'0 4px 10px rgba(163,177,198,0.45)', position:'relative', zIndex:3,
      } : {
        background:'#3A6186', borderBottom:'2px solid #2A4D6E',
        padding:'3px 8px', display:'flex', alignItems:'center',
        flexWrap:'nowrap', overflowX:'auto', minHeight:36, gap:0, flexShrink:0,
      }}>
        {/* Page label */}
        <span style={{ fontWeight:800, fontSize:12, color: neu ? NEU.strong : '#fff', paddingRight:10,
          borderRight: neu ? '1px solid rgba(163,177,198,0.6)' : '2px solid rgba(255,255,255,0.18)', marginRight:6, whiteSpace:'nowrap', flexShrink:0,
          textTransform:'uppercase', letterSpacing:'0.8px' }}>
          PROJECT
        </span>

        {/* Tab: Jobcodes */}
        <button onClick={()=>navigate('/project/list')} style={neu ? softBtn(true) : {
          height:26, padding:'0 12px', fontSize:11.5, cursor:'pointer', whiteSpace:'nowrap', flexShrink:0,
          fontFamily:F, fontWeight:700, margin:'0 4px', borderRadius:6,
          background:'rgba(255,255,255,0.22)', border:'1px solid rgba(255,255,255,0.55)',
          boxShadow:'0 2px 6px rgba(0,0,0,0.22)', color:'#fff',
        }}>Jobcodes</button>

        {/* Tab: Report */}
        <button onClick={()=>navigate('/project/report')} {...(neu ? softPress : {})} style={neu ? softBtn(false) : {
          height:26, padding:'0 12px', fontSize:11.5, cursor:'pointer', whiteSpace:'nowrap', flexShrink:0,
          fontFamily:F, fontWeight:600, margin:'0 4px', borderRadius:6,
          background:'rgba(255,255,255,0.07)', border:'1px solid rgba(255,255,255,0.22)',
          boxShadow:'0 1px 2px rgba(0,0,0,0.12)', color:'rgba(255,255,255,0.85)',
        }}>Report</button>

        {/* Tab: Project Close */}
        <button onClick={()=>navigate('/project/close')} {...(neu ? softPress : {})} style={neu ? softBtn(false, { marginRight:10 }) : {
          height:26, padding:'0 12px', fontSize:11.5, cursor:'pointer', whiteSpace:'nowrap', flexShrink:0,
          fontFamily:F, fontWeight:600, margin:'0 4px 0', marginRight:8, borderRadius:6,
          background:'rgba(255,255,255,0.07)', border:'1px solid rgba(255,255,255,0.22)',
          boxShadow:'0 1px 2px rgba(0,0,0,0.12)', color:'rgba(255,255,255,0.85)',
        }}>Project Close</button>

        {/* Divider */}
        <div style={{ width:1, height:20, background: neu ? 'rgba(163,177,198,0.6)' : 'rgba(255,255,255,0.2)', margin:'0 8px', flexShrink:0 }}/>

        {/* FY filter — dropdown list (orders only); current FY is selected by default */}
        <FyDropdown value={fy} options={fyList} onChange={setFy} neu={neu} current={getFY()} />

        {/* Spacer */}
        <div style={{ flex:1 }}/>

        {/* Count */}
        <span style={{ fontSize:10, color: neu ? NEU.muted : 'rgba(255,255,255,0.75)', fontWeight: neu ? 600 : undefined, marginRight:8, flexShrink:0, whiteSpace:'nowrap' }}>
          {filteredSOs.length} SO{filteredSOs.length!==1?'s':''} · {purchaseOrders.length} PO{purchaseOrders.length!==1?'s':''}
        </span>

        {/* Search */}
        <input value={search} onChange={e=>setSearch(e.target.value)}
          placeholder="Search client, SO/PO no, vendor, product…"
          className={neu ? 'neu-field' : undefined}
          style={neu ? { height:30, padding:'0 12px', border:'none', borderRadius:11, boxShadow:NEU.inset,
            fontSize:11, fontFamily:F, outline:'none', width:220, background:NEU.base, color:NEU.strong,
            marginRight:6, flexShrink:0 } : { height:26, padding:'0 8px', border:'1px solid #000000', borderRadius:3,
            fontSize:11, fontFamily:F, outline:'none', width:180, background:'#fff',
            marginRight:3, flexShrink:0 }} />
        {search && (
          <button onClick={()=>setSearch('')}
            {...(neu ? softPress : {})}
            style={neu ? softBtn(false, { padding:'0 9px', margin:'0 6px 0 0' }) : { height:26, padding:'0 7px', background:'#f0f0f0', border:'1px solid #000000',
              borderRadius:3, cursor:'pointer', fontFamily:F, fontSize:11, marginRight:4, flexShrink:0 }}>✕</button>
        )}

        {/* Columns toggle button */}
        <button onClick={()=>setColPanelOpen(o=>!o)} style={neu ? softBtn(colPanelOpen, { display:'flex', alignItems:'center', gap:5, margin:'0 5px' }) : {
          height:26, padding:'0 10px', marginRight:3, flexShrink:0,
          background: colPanelOpen ? P : '#fff',
          border: `1px solid ${colPanelOpen ? P : '#000000'}`,
          borderRadius:3, color: colPanelOpen ? '#fff' : '#374151',
          fontSize:11, fontWeight:600, cursor:'pointer', fontFamily:F,
          display:'flex', alignItems:'center', gap:5,
        }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="16" y2="12"/><line x1="4" y1="18" x2="12" y2="18"/>
          </svg>
          Columns
        </button>

        {/* SO/PO/EXP quick tab buttons when col panel open */}
        {colPanelOpen && (
          <div style={{ display:'flex', gap:3, marginRight:6, flexShrink:0 }}>
            {[['so','SO','#1a4a9a'],['po','PO','#2a6600'],['exp','EXP','#c2410c']].map(([t,l,c])=>(
              <button key={t} onClick={()=>setColPanelTab(t)} style={neu ? softBtn(colPanelTab===t, { padding:'0 10px', margin:'0 3px', color: colPanelTab===t ? c : NEU.text }) : {
                padding:'0 9px', height:26, borderRadius:3, fontFamily:F,
                border: `1px solid ${colPanelTab===t?c:'#000000'}`,
                background: colPanelTab===t ? c : '#fff',
                color: colPanelTab===t ? '#fff' : '#6b7280',
                fontSize:11, fontWeight:600, cursor:'pointer',
              }}>{l}</button>
            ))}
          </div>
        )}

        {/* Print */}
        <button onClick={doPrintOrders} title="Print" {...(neu ? softPress : {})}
          style={neu ? softBtn(false, { padding:'0 10px', fontSize:12 }) : { height:26, padding:'0 8px', background:'#fff', marginRight:3,
            border:'1px solid #000000', borderRadius:3, cursor:'pointer', fontSize:12,
            fontFamily:F, fontWeight:600, flexShrink:0 }}>🖨</button>

        {/* Excel */}
        <button onClick={doExportOrders} title="Export to Excel" {...(neu ? softPress : {})}
          style={neu ? softBtn(false, { padding:'0 10px', fontSize:12 }) : { height:26, padding:'0 8px', background:'#fff', marginRight:3,
            border:'1px solid #000000', borderRadius:3, cursor:'pointer', fontSize:12,
            fontFamily:F, fontWeight:600, flexShrink:0 }}>📊</button>

        {/* Refresh */}
        <button onClick={load} title="Refresh" {...(neu ? softPress : {})}
          style={neu ? softBtn(false, { padding:'0 10px', fontSize:13, margin:'0 2px 0 5px' }) : { height:26, padding:'0 8px', background:'#fff', flexShrink:0,
            border:'1px solid #000000', borderRadius:3, cursor:'pointer', fontSize:13 }}>↻</button>
      </div>

      {/* Everything below the toolbar shares the remaining height exactly —
          no hardcoded pixel offset to keep in sync with the toolbar's own
          height, which drifts whenever its padding/border/shadow changes. */}
      <div style={{ flex:1, overflow:'hidden', display:'flex', flexDirection:'column', minHeight:0 }}>

      {error && <div style={{ padding:'4px 8px', borderRadius:4, background:'#ffe0e0',
        color:'#880000', border:'1px solid #cc4444', fontSize:11, flexShrink:0 }}>Error: {error}</div>}

      {loading ? (
        <div style={{ padding:50, textAlign:'center', color:'#888' }}>Loading…</div>
      ) : (
        /* ── Orders spreadsheet ── */
        <>
          {/* Column toggle panel */}
          {colPanelOpen && (
            <div style={neu
              ? { background:NEU.base, borderRadius:16, boxShadow:NEU.inset, margin:'14px 16px 0', padding:'10px 14px 12px', flexShrink:0 }
              : { background:'#f8faff', border:`1px solid ${P}`, borderTop:'none', padding:'6px 10px' }}>
              <div style={{ display:'flex', gap:0, borderBottom: neu ? '1px solid rgba(163,177,198,0.6)' : `1px solid ${BD}`, marginBottom:8 }}>
                {[['so','Sales Order (SO)','#1a4a9a'],['po','Purchase Order (PO)','#2a6600'],['exp','Expenses (EXP)','#c2410c']].map(([t,l,c])=>(
                  <button key={t} onClick={()=>setColPanelTab(t)}
                    style={{ padding:'5px 16px', fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:F,
                      border:'none', borderBottom: colPanelTab===t ? `2.5px solid ${c}` : '2.5px solid transparent',
                      background:'transparent', color: colPanelTab===t ? c : '#6b7280', marginBottom:-1 }}>
                    {l}
                  </button>
                ))}
                <div style={{ flex:1 }}/>
                <button onClick={()=>setColPanelOpen(false)}
                  style={{ padding:'2px 8px', border:'none', background:'transparent', cursor:'pointer', color:'#9ca3af', fontSize:16 }}>✕</button>
              </div>
              <div style={{ display:'flex', gap:5, flexWrap:'wrap', alignItems:'center' }}>
                {(colPanelTab==='so' ? SO_BTNS : colPanelTab==='po' ? PO_BTNS : EXP_BTNS).map(b => {
                  const ac = colPanelTab==='so' ? '#1a4a9a' : colPanelTab==='po' ? '#2a6600' : '#ea580c';
                  return (
                    <button key={b.key} onClick={()=>tcv(b.key)}
                      style={neu ? { padding:'4px 12px', fontSize:10.5, fontWeight:700, cursor:'pointer', fontFamily:F, borderRadius:9,
                          lineHeight:'18px', border:'none', background:NEU.base, margin:'3px 2px',
                          color: cv(b.key) ? ac : NEU.muted, boxShadow: cv(b.key) ? NEU.insetSm : NEU.raisedSm, transition:'box-shadow 0.15s' } : { padding:'3px 11px', fontSize:10.5, fontWeight:600, cursor:'pointer', fontFamily:F,
                        borderRadius:5, lineHeight:'18px',
                        border: cv(b.key) ? `1.5px solid ${ac}` : '1.5px solid #d1d5db',
                        background: cv(b.key) ? ac : '#fff',
                        color:      cv(b.key) ? '#fff' : '#9ca3af',
                        transition:'all 0.1s' }}>
                      {b.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {filteredSOs.length===0 ? (
            <div style={neu
              ? { padding:40, margin:16, textAlign:'center', color:NEU.muted, fontStyle:'italic', background:NEU.base, borderRadius:16, boxShadow:NEU.inset }
              : { padding:40, textAlign:'center', color:'#888', fontStyle:'italic',
              background:'#fafafa', borderRadius:8, border:`1px solid ${BD}` }}>
              No sales orders found.
            </div>
          ) : (
            <div style={{ position:'relative', flex:1, minHeight:0, display:'flex', flexDirection:'column' }}>
            {/* Soft look: the data area sits pressed-in behind the top bar and side menu
                (like a pressed button). The shadow is a click-through layer on top, so the
                table cells can't hide it and it stays put while the table scrolls. */}
            {neu && (
              <div aria-hidden="true" style={{ position:'absolute', inset:0, pointerEvents:'none', zIndex:30,
                boxShadow:'inset 8px 8px 14px -2px rgba(163,177,198,0.95), inset -6px -6px 12px -2px rgba(255,255,255,0.9)' }} />
            )}
            <div style={neu
              ? { overflow:'auto', flex:1, minHeight:0, background:NEU_ROW }   /* fills the area — no gap, square corners */
              : { overflow:'auto', flex:1, minHeight:0, border:`1px solid ${BD}`, borderRadius:6 }}>
              <table ref={tableRef} className="proj-tbl" style={{ borderCollapse:'collapse', fontSize:10, fontFamily:F, width:'100%' }}>
                <thead>
                  <tr>
                    <th style={{ ...th('left','90px'), position:'sticky', left:0, zIndex:12, boxShadow:'inset -1px 0 0 #2e7d32' }}>Jobcode</th>
                    <th style={{ ...th('left','160px'), whiteSpace:'normal', position:'sticky', left:92, zIndex:12, boxShadow:'inset -1px 0 0 #2e7d32' }}>Client Name</th>
                    {cv('so_orderDesc') && <th style={th('left','180px')}>Order Desc</th>}
                    {cv('so_orderDate') && <th style={th('center','60px')}>Order Date</th>}
                    {cv('so_clientPO')  && <th style={th('left','90px')}>Client PO No</th>}
                    {cv('so_dueDate')   && <th style={th('center','60px')}>Due Date</th>}
                    <th style={th('left','130px')}>Product</th>
                    {cv('so_itemDesc')  && <th style={th('left','160px')}>Prod Desc</th>}
                    {cv('so_qty')       && <th style={th('right','35px')}>Qty</th>}
                    {cv('so_rate')      && <th style={th('right','70px')}>Rate</th>}
                    {cv('so_total')     && <th style={th('right','80px')}>Total</th>}
                    {cv('so_pnf')       && <th style={th('right','45px')}>P&amp;F</th>}
                    {cv('so_transport') && <th style={th('right','55px')}>Transport</th>}
                    {cv('so_taxable')   && <th style={th('right','80px')}>Taxable</th>}
                    {cv('so_gstPct')    && <th style={th('center','38px')}>GST %</th>}
                    {cv('so_gstAmt')    && <th style={th('right','70px')}>GST Amt</th>}
                    {cv('so_ov')        && <th style={th('right','85px')}>Order Value</th>}
                    {cv('so_receipt')   && <th style={th('right','70px')}>Receipt</th>}
                    {cv('so_dues')      && <th style={th('right','70px')}>Dues</th>}
                    {cv('so_billAmt')   && <th style={th('right','80px')}>Bill Amt</th>}
                    {cv('so_duesBill')  && <th style={th('right','85px')}>Dues (Bill)</th>}
                    {cv('so_billDate')  && <th style={th('center','60px')}>Bill Date</th>}
                    {cv('so_billNo')    && <th style={th('left','70px')}>Bill No</th>}
                    {cv('so_status')    && <th style={{ ...th('center','60px'), borderRight:'2px solid #5a7abf' }}>Status</th>}
                    {cv('po_vendor')    && <th style={pth('left','100px')}>Vendor</th>}
                    {cv('po_date')      && <th style={pth('center','60px')}>PO Date</th>}
                    {cv('po_no')        && <th style={pth('left','90px')}>PO No</th>}
                    {cv('po_poDesc')    && <th style={pth('left','180px')}>PO Desc</th>}
                    <th style={pth('left','130px')}>Product</th>
                    {cv('po_itemDesc')  && <th style={pth('left','160px')}>Prod Desc</th>}
                    {cv('po_qty')       && <th style={pth('right','35px')}>Qty</th>}
                    {cv('po_rate')      && <th style={pth('right','70px')}>Rate</th>}
                    {cv('po_total')     && <th style={pth('right','80px')}>Total</th>}
                    {cv('po_otherChg')  && <th style={pth('right','70px')}>Other Chg</th>}
                    {cv('po_taxable')   && <th style={pth('right','80px')}>Taxable</th>}
                    {cv('po_gstPct')    && <th style={pth('center','38px')}>GST %</th>}
                    {cv('po_gstAmt')    && <th style={pth('right','70px')}>GST Amt</th>}
                    {cv('po_ov')        && <th style={pth('right','85px')}>Order Value</th>}
                    {cv('po_payment')   && <th style={pth('right','70px')}>Payment</th>}
                    {cv('po_dues')      && <th style={pth('right','70px')}>Dues</th>}
                    {cv('po_billAmt')   && <th style={pth('right','80px')}>Bill Amt</th>}
                    {cv('po_duesBill')  && <th style={pth('right','85px')}>Dues (Bill)</th>}
                    {cv('po_purchDate') && <th style={pth('center','60px')}>Purch. Date</th>}
                    {cv('po_purchNo')   && <th style={pth('left','90px')}>Purch. No</th>}
                    {cv('po_amount')    && <th style={pth('right','85px')}>Amount</th>}
                    {cv('po_gstStatus') && <th style={pth('center','65px')}>GST Status</th>}
                    {cv('exp_date')   && <th style={eth('center','65px')}>Date</th>}
                    <th style={eth('left','90px')}>Category</th>
                    {cv('exp_desc')   && <th style={eth('left','140px')}>Description</th>}
                    {cv('exp_vendor') && <th style={eth('left','100px')}>Vendor / By</th>}
                    {cv('exp_mode')   && <th style={eth('left','70px')}>Pay Mode</th>}
                    {cv('exp_gstPct') && <th style={eth('center','40px')}>GST%</th>}
                    {cv('exp_gstAmt') && <th style={eth('right','70px')}>GST Amt</th>}
                    <th style={eth('right','85px')}>Amount (₹)</th>
                  </tr>
                </thead>
                <tbody>
                  {allRows.map(row => {
                    const soIdx  = filteredSOs.indexOf(row.so);
                    const bg     = SOBg(soIdx);
                    const poBg   = bg;
                    const soId   = row.so.orderId || row.so._id;

                    return (
                      <tr key={row.key} className={`proj-row${row.isSOFirst ? ' so-first' : ''}${row.isSOLast ? ' so-last' : ''}`}
                        data-soid={soId}
                        onMouseEnter={() => onRowEnter(soId)}
                        onMouseLeave={() => onRowLeave(soId)}
                        style={{
                          background:bg,
                          borderTop:    row.isSOFirst ? LINE_B : row.isPOFirst ? LINE_B : undefined,
                          borderBottom: row.isSOLast  ? LINE_B : undefined,
                        }}>
                        {row.isFirst && (
                          <>
                            {/* ── Order ID — click to open detail, double-click to edit order no ── */}
                            <td rowSpan={row.rowCount}
                              style={{ ...td('left'), background:bg, borderBottom:LINE_B, padding:'2px 4px', borderLeft:LINE_B,
                                position:'sticky', left:0, zIndex:2,
                                boxShadow:`inset -1px 0 0 ${BDX}` }}>
                              {editingId?.soId === row.so.orderId ? (
                                <input
                                  autoFocus
                                  defaultValue={editingId.value}
                                  style={{ width:'100%', height:22, padding:'0 4px', fontSize:10,
                                    fontFamily:F, border:'1.5px solid #EA580C', borderRadius:3,
                                    outline:'none', boxSizing:'border-box' }}
                                  onKeyDown={e => {
                                    if (e.key==='Enter')  saveOrderNo(row.so, e.target.value);
                                    if (e.key==='Escape') setEditingId(null);
                                  }}
                                  onBlur={e => saveOrderNo(row.so, e.target.value)}
                                />
                              ) : (
                                <span
                                  onClick={() => setRowModal({ so:row.so, soDue:row.soDue })}
                                  onDoubleClick={() => setEditingId({ soId:row.so.orderId, value:row.so.orderNo||'' })}
                                  title="Click for order details · double-click to edit"
                                  style={{ fontWeight:700, color:'#1a3a8a', cursor:'pointer', fontSize:10 }}>
                                  {row.so.orderNo || row.so.orderId}
                                </span>
                              )}
                            </td>
                            {/* Client Name */}
                            <td rowSpan={row.rowCount}
                              onClick={() => setModal({ type:'so', order:row.so })}
                              title={row.so.customerName||row.so.clientName||''}
                              style={{ ...td('left'), fontWeight:700, color:'#1a3a8a', background:bg,
                                borderBottom:LINE_B, cursor:'pointer',
                                overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:160,
                                position:'sticky', left:92, zIndex:2,
                                /* sticky cells in a collapsed-border table can lose their shared
                                   border on the browser's sticky compositing layer — an inset
                                   box-shadow paints the right edge independently of that, so the
                                   line never disappears here regardless of scroll position. */
                                boxShadow:`inset -1px 0 0 ${BDX}` }}>
                              {row.so.customerName||row.so.clientName||'—'}
                            </td>
                            {cv('so_orderDesc') && <td rowSpan={row.rowCount} style={{ ...td('left'), background:bg, borderBottom:LINE_B,
                              maxWidth:200, overflow:'hidden', fontSize:10, color:'#374151',
                              wordBreak:'break-word', verticalAlign:'top', padding:'3px 6px' }}>
                              {row.so.termsConditions||row.so.customerNotes||(row.so.scopeItems||[]).map(s=>s.description).filter(Boolean).join(' | ')||<span style={{color:'#9ca3af',fontStyle:'italic'}}>—</span>}
                            </td>}
                            {cv('so_orderDate') && <td rowSpan={row.rowCount} style={{ ...td('center'), background:bg, borderBottom:LINE_B }}>
                              {fmtD(row.so.orderDate||row.so.date)}
                            </td>}
                            {cv('so_clientPO') && <td rowSpan={row.rowCount} style={{ ...td('left'), background:bg, borderBottom:LINE_B,
                              color: row.so.customerPO ? '#111' : '#9ca3af', fontStyle: row.so.customerPO ? 'normal' : 'italic' }}>
                              {row.so.customerPO || '—'}
                            </td>}
                            {cv('so_dueDate') && <td rowSpan={row.rowCount} style={{ ...td('center'), background:bg, borderBottom:LINE_B }}>
                              {fmtD(row.so.dueDate||row.so.deliveryDate)}
                            </td>}
                          </>
                        )}

                        {/* SO item cells */}
                        <td style={td('left',{maxWidth:180,overflow:'hidden',textOverflow:'ellipsis'})}>
                          {row.soItem ? row.soItem.name : '—'}
                        </td>
                        {cv('so_itemDesc')  && <td style={{ ...td('left'), maxWidth:180, overflow:'hidden', fontSize:10, color:'#555', wordBreak:'break-word', padding:'3px 6px' }}>
                          {row.soItem?.desc || <span style={{color:'#9ca3af',fontStyle:'italic'}}>—</span>}
                        </td>}
                        {cv('so_qty')       && <td style={td('right')}>{row.soItem ? fmtI(row.soItem.qty) : '—'}</td>}
                        {cv('so_rate')      && <td style={td('right')}>{row.soItem ? fmt(row.soItem.rate) : '—'}</td>}
                        {cv('so_total')     && <td style={td('right',{fontWeight:600})}>{row.soBase ? fmt(row.soBase) : '—'}</td>}
                        {cv('so_pnf')       && <td style={td('right')}>{row.pnf ? fmt(row.pnf) : '0'}</td>}
                        {cv('so_transport') && <td style={td('right')}>{row.transport ? fmt(row.transport) : '0'}</td>}
                        {cv('so_taxable')   && <td style={td('right')}>{row.soBase ? fmt(row.soBase) : '—'}</td>}
                        {cv('so_gstPct')    && <td style={td('center')}>{row.soItem ? row.soItem.gst+'%' : '—'}</td>}
                        {cv('so_gstAmt')    && <td style={td('right')}>{row.soGst ? fmt(row.soGst) : '—'}</td>}
                        {cv('so_ov')        && <td style={td('right',{fontWeight:700,color:'#111827'})}>{row.soOV ? fmt(row.soOV) : '—'}</td>}

                        {row.isFirst && (
                          <>
                            {cv('so_receipt')  && <td rowSpan={row.rowCount} style={{ ...td('right'), color:'#111827', fontWeight:600, background:bg, borderBottom:LINE_B }}>{row.receipt ? fmt(row.receipt) : '0'}</td>}
                            {cv('so_dues')     && <td rowSpan={row.rowCount} style={{ ...td('right'), fontWeight:700, color:'#16a34a', background:bg, borderBottom:LINE_B }}>{fmt(row.soBalance)}</td>}
                            {cv('so_billAmt')  && <td rowSpan={row.rowCount} style={{ ...td('right'), background:bg, borderBottom:LINE_B }}>
                              {row.salesBill ? fmt(parseFloat(row.salesBill.grandTotal)||0) : '—'}
                            </td>}
                            {cv('so_duesBill') && (() => {
                              const soGT   = parseFloat(row.so.grandTotal||row.so.amount||0);
                              const billed = parseFloat(row.salesBill?.grandTotal||0);
                              const db     = soGT - billed;
                              return (
                                <td rowSpan={row.rowCount} style={{ ...td('right'), fontWeight:700,
                                  color: db > 0 ? '#b71c1c' : '#16a34a', background:bg, borderBottom:LINE_B }}>
                                  {fmt(db)}
                                </td>
                              );
                            })()}
                            {cv('so_billDate') && <td rowSpan={row.rowCount} style={{ ...td('center'), background:bg, borderBottom:LINE_B }}>{row.salesBill ? fmtD(row.salesBill.billDate) : '—'}</td>}
                            {cv('so_billNo')   && <td rowSpan={row.rowCount} style={{ ...td('left'), background:bg, borderBottom:LINE_B,
                              color: row.salesBill ? '#111827' : '#9ca3af', fontWeight: row.salesBill ? 700 : 400 }}>{row.salesBill ? (row.salesBill.billNo || '—') : '—'}</td>}
                            {cv('so_status')   && <td rowSpan={row.rowCount} style={{ ...td('center'), borderRight:`1px solid ${BDX}`, background:bg, borderBottom:LINE_B }}><StatusBadge s={row.so.status}/></td>}
                          </>
                        )}

                        {row.isPOFirst && (
                          <>
                            {cv('po_vendor') && <td rowSpan={row.poBlockSize}
                              onClick={() => row.po && setModal({ type:'po', order:row.po })}
                              title={row.po?.vendorName||''}
                              style={{ ...ptd('left'), background:poBg, borderBottom:LINE_B, borderLeft:LINE_B,
                                overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:160,
                                ...(row.po ? { cursor:'pointer', fontWeight:700, color:'#1a5500' } : { color:'#9ca3af', fontStyle:'italic' }) }}>
                              {row.po ? (row.po.vendorName||'—') : 'no PO'}
                            </td>}
                            {cv('po_date') && <td rowSpan={row.poBlockSize} style={{ ...ptd('center'), background:poBg, borderBottom:LINE_B }}>
                              {fmtD(row.po?.poDate||row.po?.date)}
                            </td>}
                            {cv('po_no') && <td rowSpan={row.poBlockSize} style={{ ...ptd('left'), background:poBg, borderBottom:LINE_B }}>
                              {row.po?.poNo||row.po?.poNumber||'—'}
                            </td>}
                            {cv('po_poDesc') && <td rowSpan={row.poBlockSize} style={{ ...ptd('left'), background:poBg, borderBottom:LINE_B,
                              maxWidth:200, overflow:'hidden', fontSize:10, color:'#374151',
                              wordBreak:'break-word', verticalAlign:'top', padding:'3px 6px' }}>
                              {row.po?.termsConditions||row.po?.customerNotes||row.po?.remarks||<span style={{color:'#9ca3af',fontStyle:'italic'}}>—</span>}
                            </td>}
                          </>
                        )}

                        {/* PO item cells */}
                        <td style={ptd('left',{maxWidth:180,overflow:'hidden',textOverflow:'ellipsis'})}>
                          {row.poItem ? row.poItem.name : '—'}
                        </td>
                        {cv('po_itemDesc')  && <td style={{ ...ptd('left'), maxWidth:180, overflow:'hidden', fontSize:10, color:'#555', wordBreak:'break-word', padding:'3px 6px' }}>
                          {row.poItem?.desc || row.poItem?.description || <span style={{color:'#9ca3af',fontStyle:'italic'}}>—</span>}
                        </td>}
                        {cv('po_qty')       && <td style={ptd('right')}>{row.poItem ? fmtI(row.poItem.qty) : '—'}</td>}
                        {cv('po_rate')      && <td style={ptd('right')}>{row.poItem ? fmt(row.poItem.rate) : '—'}</td>}
                        {cv('po_total')     && <td style={ptd('right',{fontWeight:600})}>{row.poBase ? fmt(row.poBase) : '—'}</td>}
                        {cv('po_otherChg')  && <td style={ptd('right')}>{row.otherC ? fmt(row.otherC) : '0'}</td>}
                        {cv('po_taxable')   && <td style={ptd('right')}>{row.poTaxable ? fmt(row.poTaxable) : '—'}</td>}
                        {cv('po_gstPct')    && <td style={ptd('center')}>{row.poItem ? row.poItem.gst+'%' : '—'}</td>}
                        {cv('po_gstAmt')    && <td style={ptd('right')}>{row.poGst ? fmt(row.poGst) : '—'}</td>}
                        {cv('po_ov')        && <td style={ptd('right',{fontWeight:700,color:'#1a5500'})}>{row.poOV ? fmt(row.poOV) : '—'}</td>}

                        {row.isPOFirst && (
                          <>
                            {cv('po_payment')   && <td rowSpan={row.poBlockSize} style={{ ...ptd('right'), color:'#111827', fontWeight:600, background:poBg, borderBottom:LINE_B }}>{row.payment ? fmt(row.payment) : '0'}</td>}
                            {cv('po_dues')      && <td rowSpan={row.poBlockSize} style={{ ...ptd('right'), fontWeight:700, color:'#dc2626', background:poBg, borderBottom:LINE_B }}>{fmt(row.poBalance)}</td>}
                            {cv('po_billAmt')   && <td rowSpan={row.poBlockSize} style={{ ...ptd('right'), background:poBg, borderBottom:LINE_B }}>
                              {row.poBill ? fmt(parseFloat(row.poBill.grandTotal)||0) : '—'}
                            </td>}
                            {cv('po_duesBill')  && (() => {
                              const poGT   = parseFloat(row.po?.grandTotal||row.po?.amount||0);
                              const billed = parseFloat(row.poBill?.grandTotal||0);
                              const db     = poGT - billed;
                              return (
                                <td rowSpan={row.poBlockSize} style={{ ...ptd('right'), fontWeight:700,
                                  color: db > 0 ? '#b71c1c' : '#16a34a', background:poBg, borderBottom:LINE_B }}>
                                  {fmt(db)}
                                </td>
                              );
                            })()}
                            {cv('po_purchDate') && <td rowSpan={row.poBlockSize} style={{ ...ptd('center'), background:poBg, borderBottom:LINE_B }}>{row.poBill ? fmtD(row.poBill.billDate) : '—'}</td>}
                            {cv('po_purchNo')   && <td rowSpan={row.poBlockSize} style={{ ...ptd('left'), background:poBg, borderBottom:LINE_B }}>{row.poBill ? <span style={{ fontWeight:700, color:'#111827' }}>{row.poBill.billNo}</span> : <span style={{ color:'#9ca3af', fontStyle:'italic', fontSize:9 }}>no bill</span>}</td>}
                            {cv('po_amount')    && <td rowSpan={row.poBlockSize} style={{ ...ptd('right'), fontWeight:700, color:'#111827', background:poBg, borderBottom:LINE_B }}>{row.poBill ? fmt(row.poBill.grandTotal||0) : '—'}</td>}
                            {cv('po_gstStatus') && <td rowSpan={row.poBlockSize} style={{ ...ptd('center'), background:poBg, borderBottom:LINE_B, borderRight:LINE_B }}>{row.poBill ? <span style={{ fontSize:9, fontWeight:700, padding:'1px 6px', borderRadius:3, background:row.poBill.gstType==='intrastate'?'#dcfce7':'#eef2ff', color:row.poBill.gstType==='intrastate'?'#133d80':'#4338ca' }}>{row.poBill.gstType==='intrastate'?'CGST+SGST':'IGST'}</span> : '—'}</td>}
                          </>
                        )}

                        {/* EXP per-row cells */}
                        {(() => {
                          const ex = row.expItem;
                          const expBase   = parseFloat(ex?.amount) || 0;
                          const expGstPct = parseFloat(ex?.taxRate) || 0;
                          const expGstAmt = expBase * expGstPct / 100;
                          const expTotal  = parseFloat(ex?.grandTotal) || (expBase + expGstAmt) || 0;
                          const expBg     = ex ? '#fff8f0' : 'transparent';
                          const eb = (align, extra={}) => ({ ...etd(align, extra), ...(ex ? {} : { border:`1px solid ${BDX}`, background:'transparent' }) });
                          return (<>
                            {cv('exp_date')   && <td style={eb('center')}>{ex ? fmtD(ex.date||ex.expenseDate||ex.createdAt) : ''}</td>}
                            <td style={{ ...eb('left'), background:expBg, borderLeft:ex?'1px solid #fed7aa':`1px solid ${BDX}`, fontWeight: ex?600:400, color: ex?'#7c3700':'#ccc' }}>
                              {ex ? (ex.expenseCategory||ex.category||'—') : ''}
                            </td>
                            {cv('exp_desc')   && <td style={{ ...eb('left'), background:expBg, maxWidth:150, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{ex?.description||''}</td>}
                            {cv('exp_vendor') && <td style={{ ...eb('left'), background:expBg }}>{ex ? (ex.vendorName||ex.vendor||ex.ledgerName||'') : ''}</td>}
                            {cv('exp_mode')   && <td style={{ ...eb('left'), background:expBg }}>{ex?.paymentMode||''}</td>}
                            {cv('exp_gstPct') && <td style={{ ...eb('center'), background:expBg }}>{ex ? (expGstPct?expGstPct+'%':'No GST') : ''}</td>}
                            {cv('exp_gstAmt') && <td style={{ ...eb('right'), background:expBg }}>{ex && expGstAmt ? fmt(expGstAmt) : (ex?'—':'')}</td>}
                            <td style={{ ...eb('right'), background:expBg, fontWeight:700, color: ex?'#c2410c':'#ccc' }}>{ex ? fmt(expTotal) : ''}</td>
                          </>);
                        })()}
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ background:'#E8EFFF', fontWeight:700, fontSize:10 }}>
                    {/* SO fixed cols */}
                    <td colSpan={2} style={{ ...td('right'), background:TOT_SO, fontWeight:800, fontSize:11, borderTop:LINE_B }}>TOTAL</td>
                    {/* SO toggle order-level cols */}
                    {cv('so_orderDesc') && <td style={{ ...td(), background:TOT_SO, borderTop:LINE_B }}></td>}
                    {cv('so_orderDate') && <td style={{ ...td(), background:TOT_SO, borderTop:LINE_B }}></td>}
                    {cv('so_clientPO')  && <td style={{ ...td(), background:TOT_SO, borderTop:LINE_B }}></td>}
                    {cv('so_dueDate')   && <td style={{ ...td(), background:TOT_SO, borderTop:LINE_B }}></td>}
                    {/* SO fixed product col */}
                    <td style={{ ...td(), background:TOT_SO, borderTop:LINE_B }}></td>
                    {/* SO toggle item-level cols */}
                    {cv('so_itemDesc')  && <td style={{ ...td(), background:TOT_SO, borderTop:LINE_B }}></td>}
                    {cv('so_qty')       && <td style={{ ...td(), background:TOT_SO, borderTop:LINE_B }}></td>}
                    {cv('so_rate')      && <td style={{ ...td(), background:TOT_SO, borderTop:LINE_B }}></td>}
                    {cv('so_total')     && <td style={{ ...td('right'), background:TOT_SO, borderTop:LINE_B, fontWeight:700 }}>{fmt(GT.soTotal)}</td>}
                    {cv('so_pnf')       && <td style={{ ...td('right'), background:TOT_SO, borderTop:LINE_B }}>{fmt(GT.pnf)}</td>}
                    {cv('so_transport') && <td style={{ ...td('right'), background:TOT_SO, borderTop:LINE_B }}>{fmt(GT.transport)}</td>}
                    {cv('so_taxable')   && <td style={{ ...td('right'), background:TOT_SO, borderTop:LINE_B }}>{fmt(GT.soTaxable)}</td>}
                    {cv('so_gstPct')    && <td style={{ ...td(), background:TOT_SO, borderTop:LINE_B }}></td>}
                    {cv('so_gstAmt')    && <td style={{ ...td('right'), background:TOT_SO, borderTop:LINE_B }}>{fmt(GT.soGst)}</td>}
                    {cv('so_ov')        && <td style={{ ...td('right'), background:TOT_SO, borderTop:LINE_B, fontWeight:800, color:'#104f4f' }}>{fmt(GT.soOV)}</td>}
                    {cv('so_receipt')   && <td style={{ ...td('right'), background:TOT_SO, borderTop:LINE_B, color:'#2e7d32' }}>{fmt(GT.receipt)}</td>}
                    {cv('so_dues')      && <td style={{ ...td('right'), background:TOT_SO, borderTop:LINE_B, color:'#16a34a', fontWeight:800 }}>{fmt(GT.dues)}</td>}
                    {cv('so_billAmt')   && <td style={{ ...td('right'), background:TOT_SO, borderTop:LINE_B }}>{fmt(GT.soBillAmt)}</td>}
                    {cv('so_duesBill')  && <td style={{ ...td('right'), background:TOT_SO, borderTop:LINE_B, color:'#b71c1c', fontWeight:800 }}>{fmt(GT.soGTtotal - GT.soBillAmt)}</td>}
                    {cv('so_billDate')  && <td style={{ ...td(), background:TOT_SO, borderTop:LINE_B }}></td>}
                    {cv('so_billNo')    && <td style={{ ...td(), background:TOT_SO, borderTop:LINE_B }}></td>}
                    {cv('so_status')    && <td style={{ ...td(), background:TOT_SO, borderTop:LINE_B, borderRight:'2px solid #9ab0e0' }}></td>}
                    {/* PO toggle order-level cols */}
                    {cv('po_vendor')    && <td style={{ ...td(), background:TOT_PO, borderTop:LINE_B }}></td>}
                    {cv('po_date')      && <td style={{ ...td(), background:TOT_PO, borderTop:LINE_B }}></td>}
                    {cv('po_no')        && <td style={{ ...td(), background:TOT_PO, borderTop:LINE_B }}></td>}
                    {cv('po_poDesc')    && <td style={{ ...td(), background:TOT_PO, borderTop:LINE_B }}></td>}
                    {/* PO fixed product col */}
                    <td style={{ ...td(), background:TOT_PO, borderTop:LINE_B }}></td>
                    {/* PO toggle item-level cols */}
                    {cv('po_itemDesc')  && <td style={{ ...td(), background:TOT_PO, borderTop:LINE_B }}></td>}
                    {cv('po_qty')       && <td style={{ ...td(), background:TOT_PO, borderTop:LINE_B }}></td>}
                    {cv('po_rate')      && <td style={{ ...td(), background:TOT_PO, borderTop:LINE_B }}></td>}
                    {cv('po_total')     && <td style={{ ...td('right'), background:TOT_PO, borderTop:LINE_B, fontWeight:700 }}>{fmt(GT.poTotal)}</td>}
                    {cv('po_otherChg')  && <td style={{ ...td('right'), background:TOT_PO, borderTop:LINE_B }}>{fmt(GT.otherC)}</td>}
                    {cv('po_taxable')   && <td style={{ ...td('right'), background:TOT_PO, borderTop:LINE_B }}>{fmt(GT.poTaxable)}</td>}
                    {cv('po_gstPct')    && <td style={{ ...td(), background:TOT_PO, borderTop:LINE_B }}></td>}
                    {cv('po_gstAmt')    && <td style={{ ...td('right'), background:TOT_PO, borderTop:LINE_B }}>{fmt(GT.poGst)}</td>}
                    {cv('po_ov')        && <td style={{ ...td('right'), background:TOT_PO, borderTop:LINE_B, fontWeight:800, color:'#1a5500' }}>{fmt(GT.poOV)}</td>}
                    {cv('po_payment')   && <td style={{ ...td('right'), background:TOT_PO, borderTop:LINE_B, color:'#2e7d32' }}>{fmt(GT.payment)}</td>}
                    {cv('po_dues')      && <td style={{ ...td('right'), background:TOT_PO, borderTop:LINE_B, color:'#b71c1c' }}>{fmt(GT.poDues)}</td>}
                    {cv('po_billAmt')   && <td style={{ ...td('right'), background:TOT_PO, borderTop:LINE_B }}>{fmt(GT.poBillAmt)}</td>}
                    {cv('po_duesBill')  && <td style={{ ...td('right'), background:TOT_PO, borderTop:LINE_B, color:'#b71c1c', fontWeight:800 }}>{fmt(GT.poGTtotal - GT.poBillAmt)}</td>}
                    {cv('po_purchDate') && <td style={{ ...td(), background:TOT_PO, borderTop:LINE_B }}></td>}
                    {cv('po_purchNo')   && <td style={{ ...td(), background:TOT_PO, borderTop:LINE_B }}></td>}
                    {cv('po_amount')    && <td style={{ ...td(), background:TOT_PO, borderTop:LINE_B }}></td>}
                    {cv('po_gstStatus') && <td style={{ ...td(), background:TOT_PO, borderTop:LINE_B }}></td>}
                    {cv('exp_date')   && <td style={{ ...etd(), background:TOT_EX, borderTop:LINE_B }}></td>}
                    <td style={{ ...etd(), background:TOT_EX, borderTop:LINE_B }}></td>
                    {cv('exp_desc')   && <td style={{ ...etd(), background:TOT_EX, borderTop:LINE_B }}></td>}
                    {cv('exp_vendor') && <td style={{ ...etd(), background:TOT_EX, borderTop:LINE_B }}></td>}
                    {cv('exp_mode')   && <td style={{ ...etd(), background:TOT_EX, borderTop:LINE_B }}></td>}
                    {cv('exp_gstPct') && <td style={{ ...etd(), background:TOT_EX, borderTop:LINE_B }}></td>}
                    {cv('exp_gstAmt') && <td style={{ ...etd('right'), background:TOT_EX, borderTop:LINE_B, color:'#7c3700' }}>{GT.expGst?fmt(GT.expGst):'—'}</td>}
                    <td style={{ ...etd('right'), background:TOT_EX, borderTop:LINE_B, fontWeight:800, color:'#c2410c' }}>{GT.expTotal?fmt(GT.expTotal):'—'}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            </div>
          )}
        </>
      )}
      </div>

      {/* ── Modal ── */}
      {modal && (
        <OrderModal
          type={modal.type}
          order={modal.order}
          dueRecord={modalDue}
          cid={cid}
          onClose={() => setModal(null)}
          onSaved={load}
        />
      )}

      {/* ── Row Detail Modal (SO + PO + Expense) ── */}
      {rowModal && (
        <RowDetailModal
          so={rowModal.so}
          pos={linkedPOs(rowModal.so.orderId)}
          purchaseBills={purchaseBills}
          vendorDues={vendorDues}
          soDue={rowModal.soDue}
          cid={cid}
          onClose={() => setRowModal(null)}
        />
      )}
    </div>
  );
}
