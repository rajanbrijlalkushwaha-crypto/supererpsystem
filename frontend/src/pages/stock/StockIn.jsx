/**
 * GRN — Goods Receipt Note
 */
import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { useCompany } from '../../context/CompanyContext';

const P  = '#2F6FED';
const PD = '#1A56D6';
const BG = '#F5F7FB';
const BD = '#E5EAF2';
const F  = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const GREEN = '#059669';

const fmt  = n => (parseFloat(n)||0).toLocaleString('en-IN', { maximumFractionDigits:3 });
const fmtD = d => { if (!d) return '—'; const dt=new Date(d); return isNaN(dt)?d:`${String(dt.getDate()).padStart(2,'0')}-${String(dt.getMonth()+1).padStart(2,'0')}-${dt.getFullYear()}`; };

const inp = (readOnly=false, extraStyle={}) => ({
  width:'100%', height:32, padding:'0 8px',
  border:`1px solid ${BD}`, borderRadius:6,
  fontSize:12, fontFamily:F, outline:'none',
  background: readOnly ? '#F9FAFB' : '#fff',
  color: readOnly ? '#6B7280' : '#111827',
  boxSizing:'border-box', transition:'border-color 0.15s',
  ...extraStyle,
});
const sel = { ...inp(), cursor:'pointer' };
const lbl = { fontSize:11.5, fontWeight:600, color:'#374151', marginBottom:4, display:'block', fontFamily:F };

const SH = ({ color=P, children, right }) => (
  <div style={{ background:color, padding:'8px 14px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
    <span style={{ fontSize:11, fontWeight:800, color:'#fff', textTransform:'uppercase', letterSpacing:'0.7px' }}>{children}</span>
    {right}
  </div>
);

const FR = ({ label, required, children, cols }) => (
  <div style={{ gridColumn:cols||'span 1' }}>
    <label style={lbl}>{label}{required && <span style={{ color:'#EF4444' }}> *</span>}</label>
    {children}
  </div>
);

/* ── Item search popup ── */
function ItemPopup({ allItems, onSelect, onClose }) {
  const [q, setQ] = useState('');
  const ref = useRef(null);
  useEffect(() => { ref.current?.focus(); }, []);
  const fil = q.trim()
    ? allItems.filter(it => String(it.itemCode).includes(q) || (it.itemName||'').toLowerCase().includes(q.toLowerCase()))
    : allItems;

  return (
    <div onClick={e => e.target===e.currentTarget && onClose()}
      style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', backdropFilter:'blur(2px)',
        zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
      <div style={{ background:'#fff', borderRadius:12, width:'100%', maxWidth:560,
        maxHeight:'72vh', display:'flex', flexDirection:'column',
        boxShadow:'0 20px 60px rgba(0,0,0,0.25)', border:`1px solid ${BD}` }}>
        <div style={{ background:P, color:'#fff', padding:'12px 16px', borderRadius:'12px 12px 0 0',
          display:'flex', justifyContent:'space-between', alignItems:'center', flexShrink:0 }}>
          <span style={{ fontSize:13, fontWeight:700, fontFamily:F }}>Select Item</span>
          <button onClick={onClose}
            style={{ background:'rgba(255,255,255,0.15)', border:'1px solid rgba(255,255,255,0.25)',
              borderRadius:6, color:'#fff', width:28, height:28, cursor:'pointer', fontSize:16 }}>✕</button>
        </div>
        <div style={{ padding:'10px 14px', borderBottom:`1px solid ${BD}`, flexShrink:0 }}>
          <input ref={ref} value={q} onChange={e => setQ(e.target.value)}
            placeholder="Search code / name…" style={{ ...inp(), width:'100%' }} />
        </div>
        <div style={{ flex:1, overflowY:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12, fontFamily:F }}>
            <thead style={{ position:'sticky', top:0 }}>
              <tr style={{ background:P }}>
                {['Code','Name','UOM','Type'].map(h => (
                  <th key={h} style={{ padding:'7px 10px', color:'#fff', fontWeight:700,
                    textAlign:'left', border:`1px solid ${PD}`, fontSize:11 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {fil.length===0 && <tr><td colSpan={4} style={{ padding:20, textAlign:'center', color:'#9CA3AF' }}>No items found</td></tr>}
              {fil.map((it,i) => (
                <tr key={it.itemCode} onClick={() => { onSelect(it); onClose(); }}
                  style={{ background:i%2===0?'#fff':'#FAFBFC', cursor:'pointer', transition:'background 0.12s' }}
                  onMouseEnter={e => e.currentTarget.style.background='#EEF4FF'}
                  onMouseLeave={e => e.currentTarget.style.background = i%2===0?'#fff':'#FAFBFC'}>
                  <td style={{ padding:'7px 10px', fontFamily:'monospace', fontWeight:700, color:P, border:`1px solid ${BD}` }}>{it.itemCode}</td>
                  <td style={{ padding:'7px 10px', fontWeight:600, color:'#111827', border:`1px solid ${BD}` }}>{it.itemName}</td>
                  <td style={{ padding:'7px 10px', color:'#6B7280', border:`1px solid ${BD}` }}>{it.uom||'—'}</td>
                  <td style={{ padding:'7px 10px', color:'#6B7280', border:`1px solid ${BD}` }}>{it.itemType||'—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ padding:'8px 14px', borderTop:`1px solid ${BD}`, fontSize:11, color:'#9CA3AF',
          fontFamily:F, flexShrink:0, background:'#FAFBFC', borderRadius:'0 0 12px 12px' }}>
          {fil.length} items — click to select
        </div>
      </div>
    </div>
  );
}

const FROM_TYPES = [
  { value:'vendor',  label:'Vendor (Purchase)' },
  { value:'client',  label:'Client (Material Supplied)' },
  { value:'factory', label:'Factory / Job-Work Party' },
  { value:'store',   label:'Internal Store / Transfer' },
  { value:'other',   label:'Other' },
];
const STORES = ['Warehouse A','Warehouse B','Raw Material Store','Finished Goods Store','Production Floor','Quality Hold','Default'];

function emptyRow() {
  return { itemCode:'', itemName:'', hsnCode:'', qty:'', unit:'', rate:'', remarks:'' };
}

/* ════════════════════════════════════════ MAIN ════════════════════════════════════════ */
export default function StockIn() {
  const { selectedCompany } = useCompany();
  const cid = selectedCompany?.companyId;

  const [allItems,   setAllItems]   = useState([]);
  const [vendors,    setVendors]    = useState([]);
  const [clients,    setClients]    = useState([]);
  const [recentGRNs, setRecentGRNs] = useState([]);
  const [popupRow,   setPopupRow]   = useState(null);
  const [from, setFrom] = useState({ fromType:'vendor', partyId:'', partyName:'', poRef:'', refDate:'', dcNo:'', vehicleNo:'' });
  const [to,   setTo]   = useState({ receiveAt:'Warehouse A', receivedBy:'', notes:'' });
  const [rows,  setRows]  = useState([emptyRow()]);
  const [date,  setDate]  = useState(new Date().toISOString().slice(0,10));
  const [msg,   setMsg]   = useState({ text:'', ok:true });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!cid) return;
    axios.get(`/api/items?companyId=${cid}`).then(r => setAllItems(r.data||[])).catch(()=>{});
    axios.get(`/api/vendors?companyId=${cid}`).then(r => setVendors(r.data||[])).catch(()=>{});
    axios.get(`/api/clients?companyId=${cid}`).then(r => setClients(r.data||[])).catch(()=>{});
    loadRecent();
  }, [cid]);

  const loadRecent = () => {
    if (!cid) return;
    axios.get(`/api/stock/grn?companyId=${cid}`).then(r => setRecentGRNs(r.data.slice(0,8))).catch(()=>{});
  };

  const setF   = (k,v) => setFrom(p=>({...p,[k]:v}));
  const setT   = (k,v) => setTo(p=>({...p,[k]:v}));
  const setRow = (i,k,v) => setRows(rs => rs.map((r,idx) => idx===i?{...r,[k]:v}:r));

  const changeFromType = (val) => setFrom(p=>({...p, fromType:val, partyId:'', partyName:''}));
  const changeParty    = (id)  => {
    const list = from.fromType==='vendor' ? vendors : clients;
    const key  = from.fromType==='vendor' ? 'vendorId' : 'clientId';
    const nkey = from.fromType==='vendor' ? 'vendorName' : 'clientName';
    const p = list.find(x => String(x[key])===id);
    setFrom(prev=>({...prev, partyId:id, partyName: p?(p[nkey]||p.companyName||''):''}));
  };

  const selectItem = (item) => {
    if (popupRow===null) return;
    setRow(popupRow,'itemCode', item.itemCode);
    setRow(popupRow,'itemName', item.itemName);
    setRow(popupRow,'hsnCode',  item.hsnCode||'');
    setRow(popupRow,'unit',     item.uom||'');
  };

  const addRow    = () => setRows(rs=>[...rs, emptyRow()]);
  const removeRow = (i) => { if (rows.length>1) setRows(rs=>rs.filter((_,idx)=>idx!==i)); };

  const handleSave = async () => {
    const valid = rows.filter(r => r.itemCode && parseFloat(r.qty)>0);
    if (!valid.length) { setMsg({ text:'Add at least one item with qty > 0.', ok:false }); return; }
    try {
      setSaving(true); setMsg({ text:'', ok:true });
      const body = {
        date, sourceType:from.fromType, partyType:from.fromType,
        partyId:from.partyId, partyName:from.partyName,
        poRef:from.poRef, refDate:from.refDate, dcNo:from.dcNo, vehicleNo:from.vehicleNo,
        receiveAt:to.receiveAt, receivedBy:to.receivedBy, notes:to.notes,
        items: valid.map(r=>({ itemCode:r.itemCode, itemName:r.itemName, hsnCode:r.hsnCode,
          qty:parseFloat(r.qty), unit:r.unit, location:to.receiveAt,
          rate:parseFloat(r.rate)||0, remarks:r.remarks })),
        companyId:cid,
      };
      const res = await axios.post(`/api/stock/grn?companyId=${cid}`, body);
      setMsg({ text:`✓ ${res.data.message}`, ok:true });
      setRows([emptyRow()]);
      setFrom(p=>({...p, partyId:'', partyName:'', poRef:'', refDate:'', dcNo:'', vehicleNo:''}));
      setTo(p=>({...p, receivedBy:'', notes:''}));
      loadRecent();
    } catch(e) {
      setMsg({ text:'Error: '+(e.response?.data?.error||e.message), ok:false });
    } finally { setSaving(false); }
  };

  const partyList  = from.fromType==='vendor' ? vendors : from.fromType==='client' ? clients : [];
  const partyIdKey = from.fromType==='vendor' ? 'vendorId' : 'clientId';
  const partyNKey  = from.fromType==='vendor' ? 'vendorName' : 'clientName';
  const totalValue = rows.reduce((s,r)=>s+(parseFloat(r.qty)||0)*(parseFloat(r.rate)||0),0);

  const card = { background:'#fff', border:`1px solid ${BD}`, borderRadius:10,
    overflow:'hidden', boxShadow:'0 1px 3px rgba(0,0,0,0.06)', marginBottom:12 };

  return (
    <div style={{ background:BG, minHeight:'100%', fontFamily:F }}>

      {/* Page header */}
      <div style={{ background:P, padding:'14px 20px',
        display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div>
          <div style={{ fontSize:11, color:'rgba(255,255,255,0.6)', fontWeight:500, textTransform:'uppercase', letterSpacing:'0.6px' }}>
            Stock
          </div>
          <div style={{ fontSize:15, fontWeight:800, color:'#fff', letterSpacing:'-0.2px' }}>
            GRN — Goods Receipt Note
          </div>
        </div>
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          <span style={{ fontSize:12, color:'rgba(255,255,255,0.7)', fontWeight:500 }}>Date:</span>
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            style={{ height:32, padding:'0 8px', border:'1px solid rgba(255,255,255,0.3)', borderRadius:6,
              fontSize:12, fontFamily:F, background:'rgba(255,255,255,0.12)', color:'#fff',
              outline:'none', cursor:'pointer' }} />
          <button onClick={handleSave} disabled={saving}
            style={{ height:32, padding:'0 18px', fontSize:12, fontFamily:F, cursor:'pointer',
              background:'#12B76A', color:'#fff', border:'none', borderRadius:6, fontWeight:700,
              opacity:saving?0.7:1, boxShadow:'0 2px 6px rgba(18,183,106,0.4)' }}>
            {saving ? 'Saving…' : '📥 Save GRN'}
          </button>
        </div>
      </div>

      {/* Message */}
      {msg.text && (
        <div style={{ margin:'10px 16px 0', padding:'10px 14px', fontSize:12.5, fontFamily:F,
          background: msg.ok ? '#ECFDF5' : '#FEF2F2',
          color: msg.ok ? '#059669' : '#DC2626',
          border:`1px solid ${msg.ok ? '#A7F3D0' : '#FECACA'}`, borderRadius:8 }}>
          {msg.text}
        </div>
      )}

      <div style={{ padding:'12px 16px' }}>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:0 }}>

          {/* FROM */}
          <div style={card}>
            <SH color='#166534'>FROM — Material Received From</SH>
            <div style={{ padding:14, display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              <FR label="Source Type" required cols="span 2">
                <select value={from.fromType} onChange={e => changeFromType(e.target.value)}
                  style={{ ...inp(), cursor:'pointer' }}>
                  {FROM_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </FR>

              {(from.fromType==='vendor'||from.fromType==='client') ? (
                <FR label={from.fromType==='vendor' ? 'Vendor' : 'Client'} cols="span 2">
                  <select value={from.partyId} onChange={e => changeParty(e.target.value)}
                    style={{ ...inp(), cursor:'pointer' }}>
                    <option value="">— Select —</option>
                    {partyList.map(p => (
                      <option key={p[partyIdKey]} value={p[partyIdKey]}>{p[partyNKey]||p.companyName}</option>
                    ))}
                  </select>
                </FR>
              ) : (
                <FR label={from.fromType==='store' ? 'From Store' : 'From / Source'} cols="span 2">
                  <input value={from.partyName} onChange={e => setF('partyName',e.target.value)}
                    placeholder="Name / Location" style={inp()} />
                </FR>
              )}

              <FR label="PO No. / Ref No.">
                <input value={from.poRef} onChange={e => setF('poRef',e.target.value)}
                  placeholder="e.g. PO-400001" style={inp()} />
              </FR>
              <FR label="Ref Date">
                <input type="date" value={from.refDate} onChange={e => setF('refDate',e.target.value)} style={inp()} />
              </FR>
              <FR label="DC / Challan No.">
                <input value={from.dcNo} onChange={e => setF('dcNo',e.target.value)}
                  placeholder="Delivery Challan No." style={inp()} />
              </FR>
              <FR label="Vehicle No.">
                <input value={from.vehicleNo} onChange={e => setF('vehicleNo',e.target.value)}
                  placeholder="e.g. MH12AB1234" style={inp()} />
              </FR>
            </div>
          </div>

          {/* TO */}
          <div style={card}>
            <SH color='#1E40AF'>TO — Material Received At</SH>
            <div style={{ padding:14, display:'grid', gridTemplateColumns:'1fr', gap:10 }}>
              <FR label="Receive At (Store)" required>
                <select value={to.receiveAt} onChange={e => setT('receiveAt',e.target.value)}
                  style={{ ...inp(), cursor:'pointer' }}>
                  {STORES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </FR>
              <FR label="Received By">
                <input value={to.receivedBy} onChange={e => setT('receivedBy',e.target.value)}
                  placeholder="Person who received" style={inp()} />
              </FR>
              <FR label="Inspection / Notes">
                <textarea value={to.notes} onChange={e => setT('notes',e.target.value)} rows={4}
                  placeholder="Inspection remarks, condition of goods…"
                  style={{ ...inp(), height:'auto', padding:'8px', resize:'vertical' }} />
              </FR>
            </div>
          </div>
        </div>

        {/* Items */}
        <div style={card}>
          <SH color='#166534'>
            Items Received
            <button onClick={addRow}
              style={{ padding:'3px 12px', background:'rgba(255,255,255,0.15)', border:'1px solid rgba(255,255,255,0.35)',
                borderRadius:5, color:'#fff', cursor:'pointer', fontSize:11, fontFamily:F, fontWeight:600 }}>
              + Add Row
            </button>
          </SH>
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12, fontFamily:F, minWidth:800 }}>
              <thead>
                <tr style={{ background:'#ECFDF5' }}>
                  {['#','Item Code','Item Name','HSN','Qty *','Unit','Rate (₹)','Remarks',''].map((h,i) => (
                    <th key={i} style={{ padding:'8px 10px', fontWeight:700, textAlign: i>=4&&i<=6?'right':'left',
                      border:`1px solid #A7F3D0`, whiteSpace:'nowrap', fontSize:11, color:'#065F46' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row,i) => (
                  <tr key={i} style={{ background:i%2===0?'#fff':'#F9FFF9' }}>
                    <td style={{ padding:'6px 8px', textAlign:'center', color:'#9CA3AF', border:`1px solid ${BD}`, width:28 }}>{i+1}</td>

                    <td style={{ padding:'4px 6px', border:`1px solid ${BD}`, width:120 }}>
                      <div style={{ display:'flex', gap:4 }}>
                        <input readOnly value={row.itemCode}
                          style={{ ...inp(true,{ width:62, fontFamily:'monospace', fontWeight:700, fontSize:11, color:P }) }} />
                        <button onClick={() => setPopupRow(i)}
                          style={{ height:32, padding:'0 8px', background:'#EEF4FF', color:P,
                            border:`1px solid ${P}40`, borderRadius:5, cursor:'pointer', fontSize:13, flexShrink:0 }}>🔍</button>
                      </div>
                    </td>

                    <td style={{ padding:'4px 6px', border:`1px solid ${BD}`, minWidth:130 }}>
                      <input readOnly value={row.itemName} style={inp(true)} />
                    </td>
                    <td style={{ padding:'4px 6px', border:`1px solid ${BD}`, width:80 }}>
                      <input readOnly value={row.hsnCode} style={inp(true,{ fontSize:11 })} />
                    </td>
                    <td style={{ padding:'4px 6px', border:`1px solid ${BD}`, width:80 }}>
                      <input type="number" min="0" step="any" value={row.qty}
                        onChange={e => setRow(i,'qty',e.target.value)}
                        style={{ ...inp(false,{ textAlign:'right', fontWeight:700, color:'#111827' }) }} />
                    </td>
                    <td style={{ padding:'4px 6px', border:`1px solid ${BD}`, width:60 }}>
                      <input value={row.unit} onChange={e => setRow(i,'unit',e.target.value)} style={inp()} />
                    </td>
                    <td style={{ padding:'4px 6px', border:`1px solid ${BD}`, width:90 }}>
                      <input type="number" min="0" step="any" value={row.rate}
                        onChange={e => setRow(i,'rate',e.target.value)}
                        placeholder="0.00" style={{ ...inp(false,{ textAlign:'right' }) }} />
                    </td>
                    <td style={{ padding:'4px 6px', border:`1px solid ${BD}`, minWidth:110 }}>
                      <input value={row.remarks} onChange={e => setRow(i,'remarks',e.target.value)}
                        placeholder="Remarks" style={inp()} />
                    </td>
                    <td style={{ padding:'4px 6px', border:`1px solid ${BD}`, width:28, textAlign:'center' }}>
                      <button onClick={() => removeRow(i)}
                        style={{ background:'none', border:'none', color:'#DC2626', fontSize:16, cursor:'pointer', padding:0 }}>✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
              {totalValue > 0 && (
                <tfoot>
                  <tr style={{ background:'#F0F4FF' }}>
                    <td colSpan={6} style={{ padding:'8px 10px', textAlign:'right', fontWeight:700,
                      color:'#374151', border:`1px solid ${BD}`, fontSize:12 }}>Total Value:</td>
                    <td style={{ padding:'8px 10px', textAlign:'right', fontWeight:800, fontSize:13,
                      color:GREEN, border:`1px solid ${BD}` }}>
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
          <button onClick={() => {
            setRows([emptyRow()]);
            setFrom(p=>({...p, partyId:'', partyName:'', poRef:'', refDate:'', dcNo:'', vehicleNo:''}));
            setTo({ receiveAt:'Warehouse A', receivedBy:'', notes:'' });
            setMsg({ text:'', ok:true });
          }}
            style={{ height:36, padding:'0 20px', fontSize:13, fontFamily:F, cursor:'pointer',
              background:'#fff', color:'#374151', border:`1px solid ${BD}`, borderRadius:7, fontWeight:600 }}>
            ↺ Clear Form
          </button>
          <button onClick={handleSave} disabled={saving}
            style={{ height:36, padding:'0 24px', fontSize:13, fontFamily:F, cursor:'pointer',
              background:saving?'#9CA3AF':'#12B76A', color:'#fff', border:'none',
              borderRadius:7, fontWeight:700, boxShadow:saving?'none':'0 2px 6px rgba(18,183,106,0.35)' }}>
            {saving ? 'Saving…' : '📥 Save GRN'}
          </button>
        </div>

        {/* Recent GRNs */}
        {recentGRNs.length > 0 && (
          <div style={{ background:'#fff', border:`1px solid ${BD}`, borderRadius:10,
            overflow:'hidden', boxShadow:'0 1px 3px rgba(0,0,0,0.06)' }}>
            <div style={{ background:'#166534', padding:'8px 14px', fontSize:11, fontWeight:800,
              color:'#fff', textTransform:'uppercase', letterSpacing:'0.7px' }}>
              Recent GRNs
            </div>
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11, fontFamily:F }}>
                <thead>
                  <tr style={{ background:'#ECFDF5' }}>
                    {['GRN No.','Date','From','Party','PO Ref','DC No.','Received At','Vehicle','Items'].map(h => (
                      <th key={h} style={{ padding:'7px 10px', fontWeight:700, fontSize:10,
                        textAlign:'left', border:`1px solid #A7F3D0`, whiteSpace:'nowrap', color:'#065F46' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {recentGRNs.map((g,i) => (
                    <tr key={g.txnId} style={{ background:i%2===0?'#fff':'#F9FFF9', transition:'background 0.12s' }}
                      onMouseEnter={e => e.currentTarget.style.background='#ECFDF5'}
                      onMouseLeave={e => e.currentTarget.style.background = i%2===0?'#fff':'#F9FFF9'}>
                      <td style={{ padding:'7px 10px', border:`1px solid ${BD}`, fontFamily:'monospace', fontWeight:800, color:GREEN }}>{g.grnNo}</td>
                      <td style={{ padding:'7px 10px', border:`1px solid ${BD}`, whiteSpace:'nowrap' }}>{fmtD(g.date)}</td>
                      <td style={{ padding:'7px 10px', border:`1px solid ${BD}`, fontSize:10, color:'#6B7280' }}>{FROM_TYPES.find(t=>t.value===g.sourceType)?.label||g.sourceType}</td>
                      <td style={{ padding:'7px 10px', border:`1px solid ${BD}`, fontWeight:600 }}>{g.partyName||'—'}</td>
                      <td style={{ padding:'7px 10px', border:`1px solid ${BD}`, color:'#6B7280' }}>{g.poRef||'—'}</td>
                      <td style={{ padding:'7px 10px', border:`1px solid ${BD}`, color:'#6B7280' }}>{g.dcNo||'—'}</td>
                      <td style={{ padding:'7px 10px', border:`1px solid ${BD}`, color:'#374151' }}>{g.receiveAt||'—'}</td>
                      <td style={{ padding:'7px 10px', border:`1px solid ${BD}`, color:'#6B7280' }}>{g.vehicleNo||'—'}</td>
                      <td style={{ padding:'7px 10px', border:`1px solid ${BD}`, textAlign:'center', fontWeight:800, color:GREEN }}>
                        {(g.items||[]).length}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {popupRow !== null && (
        <ItemPopup allItems={allItems}
          onSelect={it => { selectItem(it); setPopupRow(null); }}
          onClose={() => setPopupRow(null)} />
      )}
    </div>
  );
}
