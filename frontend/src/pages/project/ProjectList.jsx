import { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { useCompany } from '../../context/CompanyContext';
import * as XLSX from 'xlsx';

const F   = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const P   = '#1a4a9a';
const PG  = '#2a6600';
const BD  = '#c8d4e8';

const getFY = d => { const dt=d?new Date(d):new Date(); const m=dt.getMonth()+1; const y=dt.getFullYear(); const s=m>=4?y:y-1; return `${String(s).slice(2)}-${String(s+1).slice(2)}`; };

const fmt   = n => (parseFloat(n)||0).toLocaleString('en-IN', { minimumFractionDigits: 2 });
const fmtI  = n => { const v=parseFloat(n)||0; return v===0?'0':v.toLocaleString('en-IN'); };
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
      .then(r => setExpenses(r.data||[]))
      .catch(()=>setExpenses([]))
      .finally(()=>{ setExpLoading(false); setExpLoaded(true); });
  }, [tab, cid, expLoaded]);

  const getBill = po => po && (purchaseBills||[])
    .find(b => String(b.orderId)===String(po.orderId) || b.orderNo===po.poNo || b.orderNo===po.poNumber);
  const getDue  = po => po && (Array.isArray(vendorDues)?vendorDues:[])
    .find(d => String(d.orderId)===String(po.orderId) || d.orderNo===po.poNo);

  const soItems    = so?.items || [];
  const soPayments = soDue?.linkedPayments || [];
  const soTotal    = parseFloat(so?.grandTotal||so?.amount)||0;
  const soReceived = soPayments.reduce((s,p)=>s+(parseFloat(p.amount)||0),0);
  const soDueAmt   = soTotal - soReceived;

  const PB  = '#1a4a9a';
  const PG2 = '#1a6600';
  const PA  = '#7c3800';

  const TABS = [
    { key:'so',      label:'📋 Sales Order',               color:PB  },
    { key:'po',      label:`🛒 Purchase Orders (${(pos||[]).length})`, color:PG2 },
    { key:'expense', label:'💸 Expenses',                  color:PA  },
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
          { label:'Order Value',  val:`₹${fmt(soTotal)}`,    color:PB },
          { label:'Received',     val:`₹${fmt(soReceived)}`, color:'#2e7d32' },
          { label:'Balance Due',  val:`₹${fmt(soDueAmt)}`,   color:soDueAmt>0?'#b71c1c':'#2e7d32' },
        ].map(c=>(
          <div key={c.label} style={{ flex:1, background:'#f0f5ff', border:'1px solid #c8d8f0',
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
        <div style={{ padding:'10px 0', color:'#aaa', fontStyle:'italic', fontSize:11 }}>No receipts recorded yet.</div>
      ) : (
        <div style={{ border:'1px solid #c8e6c9', borderRadius:6, overflow:'hidden' }}>
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
            <tfoot>
              <tr style={{ background:'#e8f5e9', fontWeight:700 }}>
                <td colSpan={2} style={{ padding:'5px 8px', borderTop:'1px solid #c8e6c9', fontSize:10 }}>Total Received</td>
                <td style={{ padding:'5px 8px', borderTop:'1px solid #c8e6c9', textAlign:'right', color:'#2e7d32', fontSize:13 }}>₹{fmt(soReceived)}</td>
                <td colSpan={4} style={{ padding:'5px 8px', borderTop:'1px solid #c8e6c9', textAlign:'right',
                  color:soDueAmt>0?'#b71c1c':'#2e7d32', fontSize:11 }}>Balance Due: ₹{fmt(soDueAmt)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
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
                    <td style={{ padding:'5px 9px', borderBottom:'1px solid #f5e8d0' }}>{ex.vendor||'—'}</td>
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
  const { selectedCompany } = useCompany();
  const cid      = selectedCompany?.companyId;
  const navigate = useNavigate();

  const [salesOrders,    setSalesOrders]    = useState([]);
  const [purchaseOrders, setPurchaseOrders] = useState([]);
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
  const [expandedCols,   setExpandedCols]   = useState(new Set());
  const toggleCol = name => setExpandedCols(prev => { const n = new Set(prev); n.has(name) ? n.delete(name) : n.add(name); return n; });

  const load = useCallback(async () => {
    if (!cid) return;
    setLoading(true); setError('');
    try {
      const [soR, poR, duesR, prR, pbR, sbR] = await Promise.all([
        axios.get(`/api/sales-orders?companyId=${cid}`).catch(()=>({data:[]})),
        axios.get(`/api/purchase-orders?companyId=${cid}`).catch(()=>({data:[]})),
        axios.get(`/api/accounts/dues?companyId=${cid}`).catch(()=>({data:{}})),
        axios.get(`/api/projects?companyId=${cid}`).catch(()=>({data:[]})),
        axios.get(`/api/bills?companyId=${cid}&type=purchase`).catch(()=>({data:[]})),
        axios.get(`/api/bills?companyId=${cid}&type=sales`).catch(()=>({data:[]})),
      ]);
      setSalesOrders((soR.data||[]).filter(o => !o.tallyImported && !['draft','rejected'].includes(o.status)));
      setPurchaseOrders(poR.data||[]);
      setPurchaseBills(pbR.data||[]);
      setSalesBills(sbR.data||[]);
      const { clientDues:cd=[], vendorDues:vd=[] } = duesR.data || {};
      setClientDues(Array.isArray(cd) ? cd : []);
      setVendorDues(Array.isArray(vd) ? vd : []);
      setProjects(prR.data||[]);
    } catch(e) { setError(e.message); }
    setLoading(false);
  }, [cid]);

  useEffect(() => { load(); }, [load]);

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
    return ['all', ...[...set].sort().reverse()];
  }, [salesOrders]);

  const filteredSOs = useMemo(() => {
    let list = fy === 'all' ? salesOrders : salesOrders.filter(o => getFY(o.orderDate||o.date) === fy);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(o =>
        (o.customerName||o.clientName||'').toLowerCase().includes(q) ||
        String(o.orderId).includes(q) || (o.orderNo||'').toLowerCase().includes(q));
    }
    return list;
  }, [salesOrders, fy, search]);

  /* ── Build flat rows ── */
  const allRows = [];
  const GT = { soTotal:0, pnf:0, transport:0, soTaxable:0, soGst:0, soOV:0, receipt:0, dues:0,
               poTotal:0, otherC:0, poTaxable:0, poGst:0, poOV:0, payment:0, poDues:0 };

  for (const so of filteredSOs) {
    const pos       = linkedPOs(so.orderId);
    const firstPO   = pos[0] || null;
    const soItems   = (so.items||[]).map(normSOItem);
    const poItems   = firstPO ? (firstPO.items||[]).map(normPOItem) : [];
    const rowCount  = Math.max(soItems.length, 1);
    const pnf       = parseFloat(so.packingCharges)||0;
    const transport = parseFloat(so.freightCharges)||0;
    const otherC    = firstPO ? (parseFloat(firstPO.packingCharges)||0)+(parseFloat(firstPO.freightCharges)||0) : 0;
    const soDue     = getSODue(so);
    const poDue     = getPODue(firstPO);
    const poBill    = getPOBill(firstPO);
    const salesBill = getSalesBill(so);
    const receipt   = soDue ? parseFloat(soDue.received||soDue.totalPaid)||0 : 0;
    const soBalance = soDue ? parseFloat(soDue.due||soDue.balance)||0 : 0;
    const payment   = poDue ? parseFloat(poDue.paid||poDue.totalPaid)||0 : 0;
    const poBalance = poDue ? parseFloat(poDue.due||poDue.balance)||0 : 0;

    GT.pnf       += pnf;
    GT.transport += transport;
    GT.receipt   += receipt;
    GT.dues      += soBalance;
    GT.otherC    += otherC;
    GT.payment   += payment;
    GT.poDues    += poBalance;

    for (let i=0; i<rowCount; i++) {
      const soIt = soItems[i];
      const poIt = poItems[i] || null;

      const soBase = soIt ? soIt.qty*soIt.rate : 0;
      const soGst  = soBase*(soIt?soIt.gst:0)/100;
      const soOV   = soBase+soGst+(i===0?pnf+transport:0);

      let poBase=0, poTaxable=0, poGst=0, poOV=0;
      if (poIt) {
        poBase    = poIt.qty*poIt.rate;
        const d   = poIt.discountType==='%' ? poBase*poIt.discount/100 : poIt.discount;
        poTaxable = poBase-d;
        poGst     = poTaxable*poIt.gst/100;
        poOV      = poTaxable+poGst+(i===0?otherC:0);
      }

      GT.soTotal   += soBase; GT.soTaxable += soBase; GT.soGst += soGst; GT.soOV += soOV;
      GT.poTotal   += poBase; GT.poTaxable += poTaxable; GT.poGst += poGst; GT.poOV += poOV;

      allRows.push({
        key:`${so.orderId}-${i}`, isFirst:i===0, isLast:i===rowCount-1, rowCount,
        so, soItem:soIt, soBase, soGst, soOV,
        pnf:i===0?pnf:0, transport:i===0?transport:0,
        po:firstPO, poItem:poIt, poBase, poTaxable, poGst, poOV, otherC:i===0?otherC:0,
        receipt, soBalance, payment, poBalance,
        soDue, poDue, poBill: i===0 ? poBill : null,
        salesBill: i===0 ? salesBill : null,
      });
    }
  }

  /* ── Cell styles ── */
  const th  = (align='left',w,ex={}) => ({
    padding:'3px 5px', background:P, color:'#fff',
    fontSize:9, fontWeight:700, textAlign:align,
    border:'1px solid #3a6abf', whiteSpace:'nowrap',
    ...(w?{width:w,minWidth:w}:{}), ...ex,
  });
  const pth = (align='left',w,ex={}) => ({...th(align,w,ex), background:PG, border:'1px solid #4a8a1a'});
  const td  = (align='left',ex={}) => ({
    padding:'2px 5px', fontSize:10, fontFamily:F, border:`1px solid ${BD}`,
    verticalAlign:'middle', textAlign:align, whiteSpace:'nowrap', ...ex,
  });
  const ptd = (align='left',ex={}) => ({...td(align,ex)});
  const SOBg = idx => idx%2===0 ? '#ffffff' : '#f9f9f9';

  /* ── Projects view ── */
  const fmtDFull = d => {
    if(!d) return '—'; const dt=new Date(d);
    return isNaN(dt)?d:`${String(dt.getDate()).padStart(2,'0')}-${String(dt.getMonth()+1).padStart(2,'0')}-${dt.getFullYear()}`;
  };

  if (!cid) return null;

  return (
    <div style={{ fontFamily:F, fontSize:11, padding:8 }}>

      {/* ── Header ── */}
      <div style={{ background:P, color:'#fff', padding:'6px 12px',
        display:'flex', justifyContent:'space-between', alignItems:'center',
        marginBottom:6, borderRadius:'6px 6px 0 0' }}>
        <span style={{ fontWeight:800, fontSize:13 }}>
          {view==='orders' ? '📦 Sales Orders & Purchase Orders' : '📁 Projects'}
        </span>
        <div style={{ display:'flex', gap:6 }}>
          <button onClick={()=>setView(v=>v==='orders'?'projects':'orders')}
            style={{ height:26, padding:'0 10px', background:'rgba(255,255,255,0.15)',
              border:'1px solid rgba(255,255,255,0.3)', color:'#fff', borderRadius:4,
              cursor:'pointer', fontSize:11, fontWeight:600, fontFamily:F }}>
            {view==='orders' ? '📁 Projects' : '📦 Orders'}
          </button>
          {view==='orders' && (
            <button onClick={()=>{
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
              // Column widths
              ws['!cols'] = [...soHdr, ...poHdr].map((_,i) => ({ wch: i < 5 ? 18 : i === 5 || i === 23 ? 30 : 14 }));
              XLSX.utils.book_append_sheet(wb, ws, 'Orders');
              XLSX.writeFile(wb, `${co ? co+'_' : ''}Orders_${new Date().toISOString().slice(0,10)}.xlsx`);
            }} style={{ height:26, padding:'0 10px', background:'rgba(255,255,255,0.15)',
              border:'1px solid rgba(255,255,255,0.3)', color:'#fff', borderRadius:4,
              cursor:'pointer', fontSize:11, fontWeight:600, fontFamily:F }}>
              📊 Excel
            </button>
          )}
          {view==='projects' && (
            <>
              <button onClick={()=>{
                const co = selectedCompany?.companyName || '';
                const wb = XLSX.utils.book_new();
                const headers = ['ID','Project Name','Client','Start Date','End Date','Budget (₹)','Status'];
                const rows = projects.map(p => [
                  p.projectId,
                  p.projectName || '',
                  p.clientName || '',
                  p.startDate || '',
                  p.endDate || '',
                  parseFloat(p.budget) || 0,
                  p.status || '',
                ]);
                const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
                ws['!cols'] = [{ wch:10 },{ wch:30 },{ wch:25 },{ wch:14 },{ wch:14 },{ wch:16 },{ wch:14 }];
                XLSX.utils.book_append_sheet(wb, ws, 'Projects');
                XLSX.writeFile(wb, `${co ? co+'_' : ''}Projects_${new Date().toISOString().slice(0,10)}.xlsx`);
              }} style={{ height:26, padding:'0 10px', background:'rgba(255,255,255,0.15)',
                border:'1px solid rgba(255,255,255,0.3)', color:'#fff', borderRadius:4,
                cursor:'pointer', fontSize:11, fontWeight:600, fontFamily:F }}>
                📊 Excel
              </button>
              <button onClick={()=>{
                const rowsHtml = projects.map((p,i)=>`<tr style="background:${i%2===0?'#fff':'#f5f8ff'}">
                  <td>${p.projectId}</td>
                  <td style="font-weight:700">${p.projectName||'—'}</td>
                  <td>${p.clientName||'—'}</td>
                  <td>${fmtDFull(p.startDate)}</td>
                  <td>${fmtDFull(p.endDate)}</td>
                  <td style="text-align:right">${p.budget?'₹'+fmt(p.budget):'—'}</td>
                  <td>${p.status||'—'}</td>
                </tr>`).join('');
                const html=`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Projects</title>
<style>*{box-sizing:border-box;margin:0;padding:0;}body{font-family:Arial,sans-serif;font-size:9.5pt;}
.hdr{background:#1a4a9a;color:#fff;padding:10px 16px;display:flex;justify-content:space-between;align-items:center;}
table{width:100%;border-collapse:collapse;font-size:9pt;}
th{background:#1a4a9a;color:#fff;padding:6px 10px;text-align:left;border:1px solid #0d2d6b;}
td{padding:5px 10px;border:1px solid #d1d9ed;}
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
                w.document.write(html);w.document.close();
              }} style={{ height:26, padding:'0 10px', background:'rgba(255,255,255,0.15)',
                border:'1px solid rgba(255,255,255,0.3)', color:'#fff', borderRadius:4,
                cursor:'pointer', fontSize:11, fontWeight:600, fontFamily:F }}>
                🖨️ PDF
              </button>
              <button onClick={()=>navigate('/project/create')}
                style={{ height:26, padding:'0 10px', background:'rgba(255,255,255,0.15)',
                  border:'1px solid rgba(255,255,255,0.3)', color:'#fff', borderRadius:4,
                  cursor:'pointer', fontSize:11, fontWeight:700, fontFamily:F }}>
                + New Project
              </button>
            </>
          )}
          <button onClick={load}
            style={{ height:26, padding:'0 8px', background:'rgba(255,255,255,0.12)',
              border:'1px solid rgba(255,255,255,0.25)', color:'#fff', borderRadius:4,
              cursor:'pointer', fontSize:13 }}>↻</button>
        </div>
      </div>

      {error && <div style={{ padding:'4px 8px', marginBottom:6, borderRadius:4, background:'#ffe0e0',
        color:'#880000', border:'1px solid #cc4444', fontSize:11 }}>Error: {error}</div>}

      {loading ? (
        <div style={{ padding:50, textAlign:'center', color:'#888' }}>Loading…</div>
      ) : view==='projects' ? (
        /* ── Projects table ── */
        <div style={{ border:`1px solid ${BD}`, borderRadius:6, overflow:'hidden' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11, fontFamily:F }}>
            <thead>
              <tr style={{ background:P }}>
                {['ID','Project Name','Client','Start','End','Budget (₹)','Status','Actions'].map((h,i) => (
                  <th key={i} style={th(i>=5?'right':'left')}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {projects.length===0 && (
                <tr><td colSpan={8} style={{ ...td('center'), padding:30, color:'#888', fontStyle:'italic' }}>
                  No projects — click + New Project.
                </td></tr>
              )}
              {projects.map((p,i) => (
                <tr key={p.projectId} style={{ background:i%2===0?'#fff':'#f9fbff' }}>
                  <td style={td()}>{p.projectId}</td>
                  <td style={{ ...td(), fontWeight:700 }}>{p.projectName}</td>
                  <td style={td()}>{p.clientName||'—'}</td>
                  <td style={td()}>{fmtDFull(p.startDate)}</td>
                  <td style={td()}>{fmtDFull(p.endDate)}</td>
                  <td style={td('right',{fontWeight:600})}>{p.budget?`₹${fmt(p.budget)}`:'—'}</td>
                  <td style={td()}><StatusBadge s={p.status}/></td>
                  <td style={td()}>
                    <div style={{ display:'flex', gap:4 }}>
                      <button onClick={()=>navigate(`/project/create?edit=${p.projectId}`)}
                        style={{ height:20, padding:'0 7px', fontSize:9, fontWeight:700, cursor:'pointer',
                          background:'#EEF4FF', border:`1px solid ${BD}`, color:P, borderRadius:3, fontFamily:F }}>✎ Edit</button>
                      <button onClick={async()=>{
                        if(!window.confirm(`Delete "${p.projectName}"?`)) return;
                        await axios.delete(`/api/projects/${p.projectId}?companyId=${cid}`).catch(()=>{});
                        load();
                      }} style={{ height:20, padding:'0 7px', fontSize:9, fontWeight:700, cursor:'pointer',
                        background:'#fff3f3', border:'1px solid #ffb3b3', color:'#cc0000', borderRadius:3, fontFamily:F }}>🗑</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        /* ── Orders spreadsheet ── */
        <>
          <div style={{ marginBottom:6, display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
            {/* FY chips */}
            {fyList.map(f => {
              const active = fy === f;
              return (
                <button key={f} onClick={() => setFy(f)}
                  style={{
                    height:24, padding:'0 10px', fontSize:11, fontWeight: active ? 700 : 500,
                    fontFamily:F, cursor:'pointer', borderRadius:12, whiteSpace:'nowrap',
                    border:`1px solid ${active ? P : BD}`,
                    background: active ? P : '#fff',
                    color: active ? '#fff' : '#555',
                    transition:'all 0.12s',
                  }}>
                  {f === 'all' ? 'All' : `FY ${f}`}
                </button>
              );
            })}
            <div style={{ width:1, height:18, background:'#bbb', flexShrink:0 }}/>
            <input value={search} onChange={e=>setSearch(e.target.value)}
              placeholder="Search client / order no…"
              style={{ height:26, padding:'0 8px', border:`1px solid ${BD}`, borderRadius:4,
                fontSize:11, fontFamily:F, outline:'none', width:200 }} />
            {search && (
              <button onClick={()=>setSearch('')}
                style={{ height:26, padding:'0 8px', background:'#f5f5f5', border:`1px solid ${BD}`,
                  borderRadius:4, cursor:'pointer', fontFamily:F, fontSize:11 }}>✕</button>
            )}
            <span style={{ fontSize:10, color:'#666' }}>
              {filteredSOs.length} SO{filteredSOs.length!==1?'s':''} · {purchaseOrders.length} PO{purchaseOrders.length!==1?'s':''}
            </span>
            <span style={{ fontSize:10, color:'#888', marginLeft:4 }}>
              (Click order no for full detail · ✎ to edit order no · Click client name to add receipt · Click vendor name to add payment)
            </span>
          </div>

          {filteredSOs.length===0 ? (
            <div style={{ padding:40, textAlign:'center', color:'#888', fontStyle:'italic',
              background:'#fafafa', borderRadius:8, border:`1px solid ${BD}` }}>
              No sales orders found.
            </div>
          ) : (
            <div style={{ overflow:'auto', maxHeight:'calc(100vh - 200px)', border:`1px solid ${BD}`, borderRadius:6 }}>
              <table style={{ borderCollapse:'collapse', fontSize:10, fontFamily:F, minWidth:1400 }}>
                <thead style={{ position:'sticky', top:0, zIndex:10 }}>
                  <tr>
                    <th colSpan={23} style={{ ...th('center'), background:'#1a3a8a', fontSize:10, padding:'4px 8px', borderRight:'2px solid #fff' }}>
                      SALES ORDER
                    </th>
                    <th colSpan={20} style={{ ...th('center'), background:'#1a5500', fontSize:10, padding:'4px 8px' }}>
                      PURCHASE ORDER
                    </th>
                  </tr>
                  <tr>
                    <th style={th('left','80px')}>Order ID ✎</th>
                    <th style={th('left','110px')}>Client Name</th>
                    <th onClick={()=>toggleCol('soDesc')} title="Click to expand Order Description"
                      style={{ ...th('center'), width:expandedCols.has('soDesc')?200:28, minWidth:expandedCols.has('soDesc')?200:28, cursor:'pointer', userSelect:'none', padding:'2px', overflow:'hidden', transition:'width .2s' }}>
                      {expandedCols.has('soDesc')
                        ? <span style={{fontSize:9,whiteSpace:'nowrap'}}>◀ Order Desc</span>
                        : <div style={{writingMode:'vertical-rl',transform:'rotate(180deg)',whiteSpace:'nowrap',fontSize:9}}>Order Description</div>}
                    </th>
                    <th style={th('center','60px')}>Order Date</th>
                    <th style={th('left','90px')}>Client PO No</th>
                    <th style={th('center','60px')}>Due Date</th>
                    <th style={th('left','130px')}>Product</th>
                    <th onClick={()=>toggleCol('soItemDesc')} title="Click to expand Product Description"
                      style={{ ...th('center'), width:expandedCols.has('soItemDesc')?180:28, minWidth:expandedCols.has('soItemDesc')?180:28, cursor:'pointer', userSelect:'none', padding:'2px', overflow:'hidden', transition:'width .2s' }}>
                      {expandedCols.has('soItemDesc')
                        ? <span style={{fontSize:9,whiteSpace:'nowrap'}}>◀ Product Desc</span>
                        : <div style={{writingMode:'vertical-rl',transform:'rotate(180deg)',whiteSpace:'nowrap',fontSize:9}}>Product Description</div>}
                    </th>
                    <th style={th('right','35px')}>Qty</th>
                    <th style={th('right','70px')}>Rate</th>
                    <th style={th('right','80px')}>Total</th>
                    <th style={th('right','45px')}>P&amp;F</th>
                    <th style={th('right','45px')}>Insured</th>
                    <th style={th('right','55px')}>Transport</th>
                    <th style={th('right','80px')}>Taxable</th>
                    <th style={th('center','38px')}>GST %</th>
                    <th style={th('right','70px')}>GST Amt</th>
                    <th style={th('right','85px')}>Order Value</th>
                    <th style={th('right','70px')}>Receipt</th>
                    <th style={th('right','70px')}>Dues</th>
                    <th style={th('center','60px')}>Sales Date</th>
                    <th style={th('left','70px')}>Sales Bill</th>
                    <th style={{ ...th('center','60px'), borderRight:'2px solid #5a7abf' }}>Status</th>
                    <th style={pth('left','100px')}>Vendor</th>
                    <th style={pth('center','60px')}>PO Date</th>
                    <th style={pth('left','90px')}>PO No</th>
                    <th onClick={()=>toggleCol('poDesc')} title="Click to expand PO Description"
                      style={{ ...pth('center'), width:expandedCols.has('poDesc')?200:28, minWidth:expandedCols.has('poDesc')?200:28, cursor:'pointer', userSelect:'none', padding:'2px', overflow:'hidden', transition:'width .2s' }}>
                      {expandedCols.has('poDesc')
                        ? <span style={{fontSize:9,whiteSpace:'nowrap'}}>◀ PO Desc</span>
                        : <div style={{writingMode:'vertical-rl',transform:'rotate(180deg)',whiteSpace:'nowrap',fontSize:9}}>PO Description</div>}
                    </th>
                    <th style={pth('left','130px')}>Product</th>
                    <th onClick={()=>toggleCol('poItemDesc')} title="Click to expand PO Product Description"
                      style={{ ...pth('center'), width:expandedCols.has('poItemDesc')?180:28, minWidth:expandedCols.has('poItemDesc')?180:28, cursor:'pointer', userSelect:'none', padding:'2px', overflow:'hidden', transition:'width .2s' }}>
                      {expandedCols.has('poItemDesc')
                        ? <span style={{fontSize:9,whiteSpace:'nowrap'}}>◀ Product Desc</span>
                        : <div style={{writingMode:'vertical-rl',transform:'rotate(180deg)',whiteSpace:'nowrap',fontSize:9}}>Product Description</div>}
                    </th>
                    <th style={pth('right','35px')}>Qty</th>
                    <th style={pth('right','70px')}>Rate</th>
                    <th style={pth('right','80px')}>Total</th>
                    <th style={pth('right','70px')}>Other Chg</th>
                    <th style={pth('right','80px')}>Taxable</th>
                    <th style={pth('center','38px')}>GST %</th>
                    <th style={pth('right','70px')}>GST Amt</th>
                    <th style={pth('right','85px')}>Order Value</th>
                    <th style={pth('right','70px')}>Payment</th>
                    <th style={pth('right','70px')}>Dues</th>
                    <th style={pth('center','60px')}>Purch. Date</th>
                    <th style={pth('left','90px')}>Purch. No</th>
                    <th style={pth('right','85px')}>Amount</th>
                    <th style={pth('center','65px')}>GST Status</th>
                  </tr>
                </thead>
                <tbody>
                  {allRows.map(row => {
                    const soIdx = filteredSOs.indexOf(row.so);
                    const bg    = SOBg(soIdx);
                    const poBg  = bg;

                    return (
                      <tr key={row.key} style={{
                        background:bg,
                        borderTop:    row.isFirst ? '2px solid #1a1a1a' : undefined,
                        borderBottom: row.isLast  ? '2px solid #1a1a1a' : undefined,
                      }}>
                        {row.isFirst && (
                          <>
                            {/* ── Order ID — click to open detail, double-click to edit order no ── */}
                            <td rowSpan={row.rowCount}
                              style={{ ...td('left'), background:bg, borderBottom:'2px solid #1a1a1a', padding:'2px 4px', borderLeft:'2px solid #1a1a1a' }}>
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
                                <div style={{ display:'flex', alignItems:'center', gap:4 }}>
                                  <span
                                    onClick={() => setRowModal({ so:row.so, soDue:row.soDue })}
                                    style={{ fontWeight:700, color:'#111827', cursor:'pointer',
                                      textDecoration:'underline', textUnderlineOffset:2, fontSize:10 }}>
                                    {row.so.orderNo || row.so.orderId}
                                  </span>
                                  <button
                                    title="Edit order number"
                                    onClick={() => setEditingId({ soId:row.so.orderId, value:row.so.orderNo||'' })}
                                    style={{ flexShrink:0, background:'none', border:'none', cursor:'pointer',
                                      fontSize:9, color:'#EA580C', padding:'0 2px', lineHeight:1 }}>
                                    ✎
                                  </button>
                                </div>
                              )}
                            </td>
                            {/* ★ Clickable client name */}
                            <td rowSpan={row.rowCount}
                              onClick={() => setModal({ type:'so', order:row.so })}
                              style={{ ...td('left'), fontWeight:700, color:'#111827', background:bg,
                                borderBottom:'2px solid #1a1a1a', cursor:'pointer',
                                textDecoration:'underline', textUnderlineOffset:2 }}>
                              {row.so.customerName||row.so.clientName||'—'}
                            </td>
                            {/* SO Order Description (expandable) */}
                            <td rowSpan={row.rowCount} style={{ ...td('left'), background:bg, borderBottom:'2px solid #1a1a1a',
                              width:expandedCols.has('soDesc')?200:28, minWidth:expandedCols.has('soDesc')?200:28,
                              maxWidth:expandedCols.has('soDesc')?220:28, overflow:'hidden',
                              padding:expandedCols.has('soDesc')?'3px 6px':'1px',
                              fontSize:10, color:'#374151', wordBreak:'break-word', transition:'width .2s',
                              verticalAlign:'top' }}>
                              {expandedCols.has('soDesc') ? (row.so.termsConditions||row.so.customerNotes||(row.so.scopeItems||[]).map(s=>s.description).filter(Boolean).join(' | ')||<span style={{color:'#9ca3af',fontStyle:'italic'}}>—</span>) : ''}
                            </td>
                            <td rowSpan={row.rowCount} style={{ ...td('center'), background:bg, borderBottom:'2px solid #1a1a1a' }}>
                              {fmtD(row.so.orderDate||row.so.date)}
                            </td>
                            {/* Client PO No — replaces "Order No" */}
                            <td rowSpan={row.rowCount} style={{ ...td('left'), background:bg, borderBottom:'2px solid #1a1a1a',
                              color: row.so.customerPO ? '#111' : '#aaa', fontStyle: row.so.customerPO ? 'normal' : 'italic' }}>
                              {row.so.customerPO || '—'}
                            </td>
                            <td rowSpan={row.rowCount} style={{ ...td('center'), background:bg, borderBottom:'2px solid #1a1a1a' }}>
                              {fmtD(row.so.dueDate||row.so.deliveryDate)}
                            </td>
                          </>
                        )}

                        {/* SO item cells */}
                        <td style={td('left',{maxWidth:180,overflow:'hidden',textOverflow:'ellipsis'})}>
                          {row.soItem ? row.soItem.name : '—'}
                        </td>
                        {/* SO Item Description (expandable) */}
                        <td style={{ ...td('left'), width:expandedCols.has('soItemDesc')?180:28, minWidth:expandedCols.has('soItemDesc')?180:28,
                          maxWidth:expandedCols.has('soItemDesc')?200:28, overflow:'hidden',
                          padding:expandedCols.has('soItemDesc')?'3px 6px':'1px',
                          fontSize:10, color:'#555', wordBreak:'break-word', transition:'width .2s' }}>
                          {expandedCols.has('soItemDesc') ? (row.soItem?.desc || <span style={{color:'#9ca3af',fontStyle:'italic'}}>—</span>) : ''}
                        </td>
                        <td style={td('right')}>{row.soItem ? fmtI(row.soItem.qty) : '—'}</td>
                        <td style={td('right')}>{row.soItem ? fmt(row.soItem.rate) : '—'}</td>
                        <td style={td('right',{fontWeight:600})}>{row.soBase ? fmt(row.soBase) : '—'}</td>
                        <td style={td('right')}>{row.pnf ? fmt(row.pnf) : '0'}</td>
                        <td style={td('right')}>0</td>
                        <td style={td('right')}>{row.transport ? fmt(row.transport) : '0'}</td>
                        <td style={td('right')}>{row.soBase ? fmt(row.soBase) : '—'}</td>
                        <td style={td('center')}>{row.soItem ? row.soItem.gst+'%' : '—'}</td>
                        <td style={td('right')}>{row.soGst ? fmt(row.soGst) : '—'}</td>
                        <td style={td('right',{fontWeight:700,color:'#111827'})}>{row.soOV ? fmt(row.soOV) : '—'}</td>

                        {row.isFirst && (
                          <>
                            <td rowSpan={row.rowCount} style={{ ...td('right'), color:'#111827', fontWeight:600, background:bg, borderBottom:'2px solid #1a1a1a' }}>
                              {row.receipt ? fmt(row.receipt) : '0'}
                            </td>
                            <td rowSpan={row.rowCount} style={{ ...td('right'), fontWeight:600,
                              color:'#111827', background:bg, borderBottom:'2px solid #1a1a1a' }}>
                              {fmt(row.soBalance)}
                            </td>
                            <td rowSpan={row.rowCount} style={{ ...td('center'), background:bg, borderBottom:'2px solid #1a1a1a' }}>
                              {row.salesBill ? fmtD(row.salesBill.billDate) : '—'}
                            </td>
                            <td rowSpan={row.rowCount} style={{ ...td('left'), background:bg, borderBottom:'2px solid #1a1a1a',
                              color: row.salesBill ? '#111827' : '#aaa', fontWeight: row.salesBill ? 700 : 400 }}>
                              {row.salesBill ? (row.salesBill.billNo || '—') : '—'}
                            </td>
                            <td rowSpan={row.rowCount} style={{ ...td('center'), borderRight:`2px solid ${BD}`, background:bg, borderBottom:'2px solid #1a1a1a' }}>
                              <StatusBadge s={row.so.status}/>
                            </td>
                          </>
                        )}

                        {row.isFirst && (
                          <>
                            {/* ★ Clickable vendor name */}
                            <td rowSpan={row.rowCount}
                              onClick={() => row.po && setModal({ type:'po', order:row.po })}
                              style={{ ...ptd('left'), background:poBg, borderBottom:'2px solid #1a1a1a', borderLeft:'2px solid #1a1a1a',
                                ...(row.po ? { cursor:'pointer', fontWeight:700, color:'#111827', textDecoration:'underline', textUnderlineOffset:2 } : { color:'#aaa', fontStyle:'italic' }) }}>
                              {row.po ? (row.po.vendorName||'—') : 'no PO'}
                            </td>
                            <td rowSpan={row.rowCount} style={{ ...ptd('center'), background:poBg, borderBottom:'2px solid #1a1a1a' }}>
                              {fmtD(row.po?.poDate||row.po?.date)}
                            </td>
                            <td rowSpan={row.rowCount} style={{ ...ptd('left'), background:poBg, borderBottom:'2px solid #1a1a1a' }}>
                              {row.po?.poNo||row.po?.poNumber||'—'}
                            </td>
                            {/* PO Description (expandable) */}
                            <td rowSpan={row.rowCount} style={{ ...ptd('left'), background:poBg, borderBottom:'2px solid #1a1a1a',
                              width:expandedCols.has('poDesc')?200:28, minWidth:expandedCols.has('poDesc')?200:28,
                              maxWidth:expandedCols.has('poDesc')?220:28, overflow:'hidden',
                              padding:expandedCols.has('poDesc')?'3px 6px':'1px',
                              fontSize:10, color:'#374151', wordBreak:'break-word', transition:'width .2s',
                              verticalAlign:'top' }}>
                              {expandedCols.has('poDesc') ? (row.po?.termsConditions||row.po?.customerNotes||row.po?.remarks||<span style={{color:'#9ca3af',fontStyle:'italic'}}>—</span>) : ''}
                            </td>
                          </>
                        )}

                        {/* PO item cells */}
                        <td style={ptd('left',{maxWidth:180,overflow:'hidden',textOverflow:'ellipsis'})}>
                          {row.poItem ? row.poItem.name : '—'}
                        </td>
                        {/* PO Item Description (expandable) */}
                        <td style={{ ...ptd('left'), width:expandedCols.has('poItemDesc')?180:28, minWidth:expandedCols.has('poItemDesc')?180:28,
                          maxWidth:expandedCols.has('poItemDesc')?200:28, overflow:'hidden',
                          padding:expandedCols.has('poItemDesc')?'3px 6px':'1px',
                          fontSize:10, color:'#555', wordBreak:'break-word', transition:'width .2s' }}>
                          {expandedCols.has('poItemDesc') ? (row.poItem?.desc || row.poItem?.description || <span style={{color:'#9ca3af',fontStyle:'italic'}}>—</span>) : ''}
                        </td>
                        <td style={ptd('right')}>{row.poItem ? fmtI(row.poItem.qty) : '—'}</td>
                        <td style={ptd('right')}>{row.poItem ? fmt(row.poItem.rate) : '—'}</td>
                        <td style={ptd('right',{fontWeight:600})}>{row.poBase ? fmt(row.poBase) : '—'}</td>
                        <td style={ptd('right')}>{row.otherC ? fmt(row.otherC) : '0'}</td>
                        <td style={ptd('right')}>{row.poTaxable ? fmt(row.poTaxable) : '—'}</td>
                        <td style={ptd('center')}>{row.poItem ? row.poItem.gst+'%' : '—'}</td>
                        <td style={ptd('right')}>{row.poGst ? fmt(row.poGst) : '—'}</td>
                        <td style={ptd('right',{fontWeight:700,color:'#1a5500'})}>{row.poOV ? fmt(row.poOV) : '—'}</td>

                        {row.isFirst && (
                          <>
                            <td rowSpan={row.rowCount} style={{ ...ptd('right'), color:'#111827', fontWeight:600, background:poBg, borderBottom:'2px solid #1a1a1a' }}>
                              {row.payment ? fmt(row.payment) : '0'}
                            </td>
                            <td rowSpan={row.rowCount} style={{ ...ptd('right'), fontWeight:600,
                              color:'#111827', background:poBg, borderBottom:'2px solid #1a1a1a' }}>
                              {fmt(row.poBalance)}
                            </td>
                            <td rowSpan={row.rowCount} style={{ ...ptd('center'), background:poBg, borderBottom:'2px solid #1a1a1a' }}>
                              {row.poBill ? fmtD(row.poBill.billDate) : '—'}
                            </td>
                            <td rowSpan={row.rowCount} style={{ ...ptd('left'), background:poBg, borderBottom:'2px solid #1a1a1a' }}>
                              {row.poBill
                                ? <span style={{ fontWeight:700, color:'#111827' }}>{row.poBill.billNo}</span>
                                : <span style={{ color:'#aaa', fontStyle:'italic', fontSize:9 }}>no bill</span>}
                            </td>
                            <td rowSpan={row.rowCount} style={{ ...ptd('right'), fontWeight:700, color:'#111827', background:poBg, borderBottom:'2px solid #1a1a1a' }}>
                              {row.poBill ? fmt(row.poBill.grandTotal||0) : '—'}
                            </td>
                            <td rowSpan={row.rowCount} style={{ ...ptd('center'), background:poBg, borderBottom:'2px solid #1a1a1a', borderRight:'2px solid #1a1a1a' }}>
                              {row.poBill
                                ? <span style={{ fontSize:9, fontWeight:700, padding:'1px 6px', borderRadius:3,
                                    background:row.poBill.gstType==='intrastate'?'#dcfce7':'#eef2ff',
                                    color:row.poBill.gstType==='intrastate'?'#133d80':'#4338ca' }}>
                                    {row.poBill.gstType==='intrastate'?'CGST+SGST':'IGST'}
                                  </span>
                                : '—'}
                            </td>
                          </>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot style={{ position:'sticky', bottom:0, zIndex:10 }}>
                  <tr style={{ background:'#E8EFFF', fontWeight:700, fontSize:10 }}>
                    <td colSpan={5} style={{ ...td('right'), background:'#dce6ff', fontWeight:800, fontSize:11, borderTop:'2px solid #9ab0e0' }}>TOTAL</td>
                    <td colSpan={3} style={{ ...td(), background:'#dce6ff', borderTop:'2px solid #9ab0e0' }}></td>
                    <td style={{ ...td('right'), background:'#dce6ff', borderTop:'2px solid #9ab0e0', fontWeight:700 }}>{fmt(GT.soTotal)}</td>
                    <td style={{ ...td('right'), background:'#dce6ff', borderTop:'2px solid #9ab0e0' }}>{fmt(GT.pnf)}</td>
                    <td style={{ ...td('right'), background:'#dce6ff', borderTop:'2px solid #9ab0e0' }}>0</td>
                    <td style={{ ...td('right'), background:'#dce6ff', borderTop:'2px solid #9ab0e0' }}>{fmt(GT.transport)}</td>
                    <td style={{ ...td('right'), background:'#dce6ff', borderTop:'2px solid #9ab0e0' }}>{fmt(GT.soTaxable)}</td>
                    <td style={{ ...td('center'), background:'#dce6ff', borderTop:'2px solid #9ab0e0' }}></td>
                    <td style={{ ...td('right'), background:'#dce6ff', borderTop:'2px solid #9ab0e0' }}>{fmt(GT.soGst)}</td>
                    <td style={{ ...td('right'), background:'#dce6ff', borderTop:'2px solid #9ab0e0', fontWeight:800, color:'#104f4f' }}>{fmt(GT.soOV)}</td>
                    <td style={{ ...td('right'), background:'#dce6ff', borderTop:'2px solid #9ab0e0', color:'#2e7d32' }}>{fmt(GT.receipt)}</td>
                    <td style={{ ...td('right'), background:'#dce6ff', borderTop:'2px solid #9ab0e0', color:'#b71c1c' }}>{fmt(GT.dues)}</td>
                    <td colSpan={3} style={{ ...td(), background:'#dce6ff', borderTop:'2px solid #9ab0e0', borderRight:'2px solid #9ab0e0' }}></td>
                    <td colSpan={3} style={{ ...td(), background:'#d0ecd0', borderTop:'2px solid #7ab07a' }}></td>
                    <td colSpan={3} style={{ ...td(), background:'#d0ecd0', borderTop:'2px solid #7ab07a' }}></td>
                    <td style={{ ...td('right'), background:'#d0ecd0', borderTop:'2px solid #7ab07a', fontWeight:700 }}>{fmt(GT.poTotal)}</td>
                    <td style={{ ...td('right'), background:'#d0ecd0', borderTop:'2px solid #7ab07a' }}>{fmt(GT.otherC)}</td>
                    <td style={{ ...td('right'), background:'#d0ecd0', borderTop:'2px solid #7ab07a' }}>{fmt(GT.poTaxable)}</td>
                    <td style={{ ...td('center'), background:'#d0ecd0', borderTop:'2px solid #7ab07a' }}></td>
                    <td style={{ ...td('right'), background:'#d0ecd0', borderTop:'2px solid #7ab07a' }}>{fmt(GT.poGst)}</td>
                    <td style={{ ...td('right'), background:'#d0ecd0', borderTop:'2px solid #7ab07a', fontWeight:800, color:'#1a5500' }}>{fmt(GT.poOV)}</td>
                    <td style={{ ...td('right'), background:'#d0ecd0', borderTop:'2px solid #7ab07a', color:'#2e7d32' }}>{fmt(GT.payment)}</td>
                    <td style={{ ...td('right'), background:'#d0ecd0', borderTop:'2px solid #7ab07a', color:'#b71c1c' }}>{fmt(GT.poDues)}</td>
                    <td colSpan={4} style={{ ...td(), background:'#d0ecd0', borderTop:'2px solid #7ab07a' }}></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </>
      )}

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
