/**
 * Sales Order Module — Tab-by-Tab section navigation
 * Outer tabs : Create | View/Edit | Pending
 * Inner tabs  : Order Details → Item Details → Add-on Items →
 *               Additional Charges → Bank Guarantee → Scope of Work →
 *               Warranty → Activities → Attachments
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { useLocation, useNavigate } from 'react-router-dom';
import { useCompany } from '../../context/CompanyContext';
import { printSalesOrder } from '../../utils/printSalesOrder';

/* ── colours ── */
const N = '#1a4a7a';
const W = '#ffffff';
const B = '#b0b0b0';
const R = '#cc2200';
const F = "Arial,'Segoe UI',sans-serif";

/* ── helpers ── */
const api  = (url, cfg={}) => axios({url, ...cfg});
const fmt  = n => `₹${(n||0).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
const today= () => new Date().toISOString().slice(0,10);
const uid  = () => Date.now() + Math.random();

/* ═══════════════════════ PRIMITIVES ═══════════════════════ */

function Btn({ children, onClick, v='def', disabled, type, title, small }) {
  const s = {
    def: { bg:'#d8d8d8', border:'1px solid #888',   color:'#000' },
    pri: { bg:N,         border:`1px solid #0d2f50`, color:W, fw:700 },
    dan: { bg:R,         border:`1px solid #991100`, color:W, fw:700 },
    suc: { bg:'#006620', border:`1px solid #004410`, color:W, fw:700 },
  }[v] || {};
  return (
    <button type={type||'button'} onClick={onClick} disabled={disabled} title={title}
      style={{
        background:s.bg, border:s.border, color:s.color||'#000',
        padding: small ? '0 7px' : '1px 12px',
        height: small ? 20 : 22,
        fontSize:small?10:11, fontFamily:F, fontWeight:s.fw||400,
        cursor:disabled?'default':'pointer', borderRadius:0,
        whiteSpace:'nowrap', opacity:disabled?0.5:1,
      }}>
      {children}
    </button>
  );
}

function Sep() {
  return <div style={{width:1,height:16,background:'#aaa',margin:'0 2px',flexShrink:0,alignSelf:'center'}}/>;
}

function Inp({ value, onChange, type='text', placeholder, readOnly, disabled, style, min, max, onKeyDown }) {
  return (
    <input type={type} value={value??''} onChange={onChange}
      placeholder={placeholder} readOnly={readOnly} disabled={disabled}
      min={min} max={max} onKeyDown={onKeyDown}
      style={{
        height:20, padding:'0 4px', border:'1px solid #888', borderRadius:0,
        fontSize:12, fontFamily:F, color:'#000',
        background: readOnly?'#f0f0f0': disabled?'#e8e8e8': W,
        outline:'none', width:'100%', boxSizing:'border-box', ...style,
      }}
      onFocus={e=>{ if(!readOnly&&!disabled) e.target.style.borderColor=N; }}
      onBlur={e=>(e.target.style.borderColor='#888')}
    />
  );
}

function Sel({ value, onChange, options=[], disabled, style }) {
  return (
    <select value={value} onChange={onChange} disabled={disabled}
      style={{
        height:20, padding:'0 2px', border:'1px solid #888', borderRadius:0,
        fontSize:12, fontFamily:F, color:'#000',
        background:disabled?'#e8e8e8':W,
        outline:'none', width:'100%', boxSizing:'border-box',
        cursor:'pointer', ...style,
      }}
      onFocus={e=>(e.target.style.borderColor=N)}
      onBlur={e=>(e.target.style.borderColor='#888')}
    >
      {options.map((o,i)=><option key={i} value={o.value??o}>{o.label??o}</option>)}
    </select>
  );
}

function Txt({ value, onChange, placeholder, rows=3 }) {
  return (
    <textarea value={value??''} onChange={onChange} placeholder={placeholder} rows={rows}
      style={{
        width:'100%', padding:'2px 4px', border:'1px solid #888', borderRadius:0,
        fontSize:12, fontFamily:F, color:'#000', background:W,
        resize:'vertical', outline:'none', boxSizing:'border-box',
      }}
      onFocus={e=>(e.target.style.borderColor=N)}
      onBlur={e=>(e.target.style.borderColor='#888')}
    />
  );
}

/* label + field row */
function FR({ label, children, w=120, req }) {
  return (
    <div style={{display:'flex',alignItems:'center',minHeight:24,borderBottom:'1px solid #ebebeb',padding:'2px 4px'}}>
      <label style={{fontSize:11,fontWeight:700,color:'#333',minWidth:w,maxWidth:w,
        padding:'0 8px 0 0',textAlign:'right',flexShrink:0}}>
        {label}{req&&<span style={{color:R}}>*</span>}
      </label>
      <div style={{flex:1,display:'flex',gap:4,alignItems:'center'}}>{children}</div>
    </div>
  );
}

/* section panel header (non-collapsible, just a label bar) */
function PH({ title }) {
  return (
    <div style={{background:'#3a6a9a',color:W,fontSize:11,fontWeight:700,
      padding:'4px 10px',marginBottom:4,letterSpacing:0.3}}>
      {title}
    </div>
  );
}

/* badge */
const BADGE_COLORS = {
  draft:{bg:'#f0f0f0',color:'#444',bd:'#aaa'},
  pending:{bg:'#d8eeff',color:'#003875',bd:'#88aacc'},
  approved:{bg:'#d8f0d8',color:'#005500',bd:'#44aa44'},
  rejected:{bg:'#ffe0e0',color:'#880000',bd:'#cc4444'},
};
function Badge({ s }) {
  const c = BADGE_COLORS[s?.toLowerCase()] || BADGE_COLORS.draft;
  return (
    <span style={{display:'inline-block',padding:'0 5px',fontSize:10,fontWeight:700,
      fontFamily:F,border:`1px solid ${c.bd}`,background:c.bg,color:c.color,textTransform:'uppercase'}}>
      {s||'—'}
    </span>
  );
}

/* ═══════════════════════ INNER SECTION TABS ═══════════════════════ */
const INNER_TABS = [
  { id:'order-details',  label:'Order Details'     },
  { id:'item-details',   label:'Item Details'       },
  { id:'addon-items',    label:'Add-on Items'       },
  { id:'charges',        label:'Addl. Charges'      },
  { id:'bank-guarantee', label:'Bank Guarantee'     },
  { id:'scope',          label:'Scope of Work'      },
  { id:'warranty',       label:'Warranty'           },
  { id:'activities',     label:'Activities'         },
  { id:'attachments',    label:'Attachments'        },
];

function SectionTabBar({ active, onChange }) {
  return (
    <div style={{
      background:'#e4e8ed',
      borderBottom:`2px solid ${N}`,
      display:'flex', flexWrap:'nowrap', overflowX:'auto',
      padding:'4px 6px 0', gap:2, flexShrink:0,
    }}>
      {INNER_TABS.map((t, idx) => {
        const isAct = active === t.id;
        return (
          <button key={t.id} onClick={() => onChange(t.id)}
            style={{
              fontFamily:F, fontSize:11, fontWeight:isAct?700:400,
              color: isAct ? N : '#555',
              background: isAct ? W : '#d4d8de',
              border:`1px solid ${isAct ? B : '#bbb'}`,
              borderBottom: isAct ? `1px solid ${W}` : `1px solid ${B}`,
              marginBottom: isAct ? -2 : 0,
              padding:'3px 8px',
              cursor:'pointer', whiteSpace:'nowrap',
              position:'relative', zIndex: isAct ? 1 : 0,
              flexShrink:0,
              display:'flex', alignItems:'center', gap:4,
            }}>
            <span style={{
              display:'inline-flex', alignItems:'center', justifyContent:'center',
              background: isAct ? N : '#888',
              color:W, borderRadius:'50%',
              width:14, height:14,
              fontSize:9, fontWeight:700, flexShrink:0,
            }}>{idx+1}</span>
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

/* ═══════════════════════ CLIENT SEARCH POPUP ═══════════════════════ */
function ClientSearch({ clients, onSelect, onClose }) {
  const [q, setQ] = useState('');
  const ref = useRef(null);
  useEffect(() => { ref.current?.focus(); }, []);
  const name = c => c.companyName||c.clientName||c.name||'';
  const filtered = q
    ? clients.filter(c =>
        name(c).toLowerCase().includes(q.toLowerCase()) ||
        String(c.clientId||'').includes(q) ||
        (c.gstin||'').toLowerCase().includes(q.toLowerCase()) ||
        (c.city||'').toLowerCase().includes(q.toLowerCase()) ||
        (c.state||'').toLowerCase().includes(q.toLowerCase())
      )
    : clients;
  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.4)',zIndex:9999,display:'flex',alignItems:'center',justifyContent:'center'}}>
      <div style={{background:W,border:`2px solid ${N}`,width:500,maxHeight:420,display:'flex',flexDirection:'column'}}>
        <div style={{background:N,color:W,padding:'5px 10px',fontSize:12,fontWeight:700,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <span>🔍 Client Search</span>
          <button onClick={onClose} style={{background:'none',border:'none',color:W,cursor:'pointer',fontSize:16}}>✕</button>
        </div>
        <div style={{padding:'5px 8px',borderBottom:`1px solid ${B}`,background:'#f5f5f5'}}>
          <input ref={ref} value={q} onChange={e=>setQ(e.target.value)} placeholder="Search by client name…"
            style={{width:'100%',height:24,padding:'0 6px',border:'1px solid #888',borderRadius:0,fontSize:12,fontFamily:F,outline:'none'}}
            onKeyDown={e=>e.key==='Escape'&&onClose()}/>
        </div>
        <div style={{flex:1,overflowY:'auto'}}>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:11,fontFamily:F}}>
            <thead style={{background:N,position:'sticky',top:0}}>
              <tr>
                {['Client ID','Name','City','GSTIN'].map((h,i)=>(
                  <th key={i} style={{padding:'4px 8px',color:W,fontWeight:700,textAlign:'left',borderRight:'1px solid #2a5a8a'}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length===0
                ? <tr><td colSpan={4} style={{padding:'12px',textAlign:'center',color:'#666'}}>No clients found</td></tr>
                : filtered.map((c,i)=>(
                  <tr key={i} onClick={()=>onSelect(c)}
                    style={{background:i%2===0?W:'#f5f8fc',cursor:'pointer',borderBottom:'1px solid #e8e8e8'}}
                    onMouseEnter={e=>(e.currentTarget.style.background='#d0e4f8')}
                    onMouseLeave={e=>(e.currentTarget.style.background=i%2===0?W:'#f5f8fc')}>
                    <td style={{padding:'3px 8px',borderRight:'1px solid #ebebeb'}}>{c.clientId||'—'}</td>
                    <td style={{padding:'3px 8px',borderRight:'1px solid #ebebeb',fontWeight:700}}>{name(c)||'—'}</td>
                    <td style={{padding:'3px 8px',borderRight:'1px solid #ebebeb'}}>{c.city||'—'}</td>
                    <td style={{padding:'3px 8px'}}>{c.gstin||'—'}</td>
                  </tr>
                ))
              }
            </tbody>
          </table>
        </div>
        <div style={{padding:'3px 8px',background:'#f0f0f0',borderTop:`1px solid ${B}`,fontSize:10,color:'#666'}}>
          {filtered.length} record{filtered.length!==1?'s':''} — Click row to select · ESC to cancel
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════ TAB 1 — ORDER DETAILS ═══════════════════════ */
function TabOrderDetails({ form, setF, showSearch, setShowSearch }) {
  return (
    <div style={{padding:'8px 10px',display:'flex',flexDirection:'column',gap:10}}>

      {/* ── Row 1: Customer Details + Reference Numbers ── */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:0,columnGap:16}}>

        {/* LEFT: Bill To — Customer Details */}
        <div style={{border:`1px solid ${B}`,background:W}}>
          <PH title="Bill To — Customer Details" />
          <div style={{padding:'0 6px 6px'}}>
            <div style={{display:'flex',alignItems:'center',minHeight:24,borderBottom:'1px solid #ebebeb',padding:'2px 4px'}}>
              <label style={{fontSize:11,fontWeight:700,color:'#333',minWidth:120,padding:'0 8px 0 0',textAlign:'right',flexShrink:0}}>
                Client Name<span style={{color:R}}>*</span>
              </label>
              <div style={{flex:1,display:'flex',gap:4,alignItems:'center'}}>
                <Inp value={form.customerName} onChange={e=>setF('customerName',e.target.value)}
                  placeholder="Type or click 🔍 to search…" style={{flex:1}}/>
                <button onClick={()=>setShowSearch(true)} title="Search client"
                  style={{background:'#d8ecff',color:'#003875',border:'1px solid #88aacc',
                    padding:'0 8px',fontSize:15,cursor:'pointer',height:22,fontFamily:F,fontWeight:700,flexShrink:0}}>
                  🔍
                </button>
              </div>
            </div>
            <FR label="Client ID" w={120}><Inp value={form.clientId} readOnly style={{width:130}} placeholder="Auto-filled"/></FR>
            <FR label="GSTIN" w={120}><Inp value={form.customerGstin} onChange={e=>setF('customerGstin',e.target.value)} style={{width:210}}/></FR>
            <FR label="Address" w={120}><Txt value={form.address||''} onChange={e=>setF('address',e.target.value)} rows={2}/></FR>
            <FR label="City" w={120}><Inp value={form.customerCity||''} onChange={e=>setF('customerCity',e.target.value)} style={{width:160}}/></FR>
            <FR label="State" w={120}><Inp value={form.customerState||''} onChange={e=>setF('customerState',e.target.value)} style={{width:160}}/></FR>
            <FR label="Pincode" w={120}><Inp value={form.customerPincode||''} onChange={e=>setF('customerPincode',e.target.value)} style={{width:100}}/></FR>
            <FR label="Contact Person" w={120}><Inp value={form.contactPerson} onChange={e=>setF('contactPerson',e.target.value)}/></FR>
            <FR label="Mobile" w={120}><Inp value={form.mobile} onChange={e=>setF('mobile',e.target.value)} style={{width:160}}/></FR>
            <FR label="Email" w={120}><Inp value={form.email} onChange={e=>setF('email',e.target.value)}/></FR>
          </div>
        </div>

        {/* RIGHT: Reference Numbers & Terms */}
        <div style={{border:`1px solid ${B}`,background:W}}>
          <PH title="Reference Numbers & Terms" />
          <div style={{padding:'0 6px 6px'}}>
            <FR label="ERP Order ID" w={130} req>
              <Inp value={form.nextId||''} readOnly style={{width:120,background:'#ffffcc',fontWeight:700}}/>
              <span style={{fontSize:10,color:'#888',paddingLeft:4}}>(auto-generated)</span>
            </FR>
            <FR label="Order No." w={130}>
              <Inp value={form.orderNo} onChange={e=>setF('orderNo',e.target.value)}
                style={{width:190}} placeholder={`SO-${form.nextId||'XXXXX'}`}/>
            </FR>
            <FR label="Order Date" w={130}>
              <Inp type="date" value={form.companyRefDate} onChange={e=>setF('companyRefDate',e.target.value)} style={{width:150}}/>
            </FR>
            <FR label="Client Order No." w={130}>
              <Inp value={form.clientOrderNo} onChange={e=>setF('clientOrderNo',e.target.value)}
                style={{width:210}} placeholder="Customer PO / Work Order No."/>
            </FR>
            <FR label="Client Order Date" w={130}>
              <Inp type="date" value={form.clientOrderDate} onChange={e=>setF('clientOrderDate',e.target.value)} style={{width:150}}/>
            </FR>
            <FR label="Delivery Date" w={130}>
              <Inp type="date" value={form.deliveryDate} onChange={e=>setF('deliveryDate',e.target.value)} style={{width:150}}/>
            </FR>
            <FR label="Payment Terms" w={130}>
              <Sel value={form.paymentTerms} onChange={e=>setF('paymentTerms',e.target.value)}
                options={['Net 30','Net 45','Net 60','Advance','50% Advance','On Delivery','As per PO']} style={{width:190}}/>
            </FR>
            <FR label="Sales Person" w={130}><Inp value={form.salesPerson||''} onChange={e=>setF('salesPerson',e.target.value)}/></FR>
            <FR label="Order Type" w={130}>
              <Sel value={form.orderType||''} onChange={e=>setF('orderType',e.target.value)}
                options={['','Supply','Supply & Installation','Service','AMC','Rental']} style={{width:190}}/>
            </FR>
            <FR label="Internal Notes" w={130}>
              <Txt value={form.notes} onChange={e=>setF('notes',e.target.value)} rows={3}/>
            </FR>
          </div>
        </div>
      </div>

      {/* ── Row 2: Ship To ── */}
      <div style={{border:`1px solid ${B}`,background:W}}>
        <PH title="Ship To — Delivery / Site Address" />
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:0,columnGap:16,padding:'0 6px 6px'}}>
          <div>
            <FR label="Site / Location Name" w={150}>
              <Inp value={form.shipToName||''} onChange={e=>setF('shipToName',e.target.value)}
                placeholder="Same as Bill To if blank"/>
            </FR>
            <FR label="Address" w={150}>
              <Txt value={form.shipToAddress||''} onChange={e=>setF('shipToAddress',e.target.value)} rows={2}/>
            </FR>
            <FR label="City" w={150}>
              <Inp value={form.shipToCity||''} onChange={e=>setF('shipToCity',e.target.value)} style={{width:160}}/>
            </FR>
            <FR label="State" w={150}>
              <Inp value={form.shipToState||''} onChange={e=>setF('shipToState',e.target.value)} style={{width:160}}/>
            </FR>
            <FR label="Pincode" w={150}>
              <Inp value={form.shipToPincode||''} onChange={e=>setF('shipToPincode',e.target.value)} style={{width:100}}/>
            </FR>
          </div>
          <div>
            <FR label="Contact Person" w={150}>
              <Inp value={form.shipToContact||''} onChange={e=>setF('shipToContact',e.target.value)}/>
            </FR>
            <FR label="Mobile" w={150}>
              <Inp value={form.shipToMobile||''} onChange={e=>setF('shipToMobile',e.target.value)} style={{width:160}}/>
            </FR>
            <FR label="Email" w={150}>
              <Inp value={form.shipToEmail||''} onChange={e=>setF('shipToEmail',e.target.value)}/>
            </FR>
            <FR label="Dispatch Mode" w={150}>
              <Sel value={form.dispatchMode||''} onChange={e=>setF('dispatchMode',e.target.value)}
                options={['','Road','Rail','Air','Sea','Courier','Hand Delivery']} style={{width:190}}/>
            </FR>
            <FR label="Transporter" w={150}>
              <Inp value={form.transporterName||''} onChange={e=>setF('transporterName',e.target.value)}/>
            </FR>
            <FR label="Vehicle No." w={150}>
              <Inp value={form.vehicleNumber||''} onChange={e=>setF('vehicleNumber',e.target.value)} style={{width:150}}/>
            </FR>
          </div>
        </div>
      </div>

    </div>
  );
}

/* ═══════════════════════ TAB 2 — ITEM DETAILS ═══════════════════════ */
const ITEM_TYPES = ['Manufactured','Bought Out'];
const GST_RATES  = [0,5,12,18,28];
const UNITS      = ['NOS','Kg','Ltr','Mtr','Box','Pcs','Set','Sqft','MT'];

function newItem() { return {_id:uid(),type:'Manufactured',description:'',qty:1,unit:'NOS',rate:0,gst:18,bom:[]}; }
function newBomLine() { return {_id:uid(),itemName:'',qty:1,unit:'NOS'}; }

function TabItemDetails({ items, setItems }) {
  const [bomOpen, setBomOpen] = useState(null);

  const add    = () => setItems(p=>[...p,newItem()]);
  const upd    = (id,k,v) => setItems(p=>p.map(r=>r._id===id?{...r,[k]:v}:r));
  const del    = (id) => setItems(p=>p.filter(r=>r._id!==id));
  const addBom = (id) => setItems(p=>p.map(r=>r._id===id?{...r,bom:[...(r.bom||[]),newBomLine()]}:r));
  const updBom = (iid,bid,k,v) => setItems(p=>p.map(r=>r._id===iid?{...r,bom:r.bom.map(b=>b._id===bid?{...b,[k]:v}:b)}:r));
  const delBom = (iid,bid) => setItems(p=>p.map(r=>r._id===iid?{...r,bom:r.bom.filter(b=>b._id!==bid)}:r));

  const th = (w,right) => ({padding:'3px 5px',background:N,color:W,fontWeight:700,fontSize:10,textAlign:right?'right':'left',
    border:'1px solid #2a5a8a',whiteSpace:'nowrap',position:'sticky',top:0,zIndex:2,width:w});
  const td = (w,right) => ({padding:'2px 4px',border:'1px solid #d0d0d0',width:w,textAlign:right?'right':'left'});

  const total = items.reduce((s,it)=>{const sub=(parseFloat(it.qty)||0)*(parseFloat(it.rate)||0);return s+sub+sub*(parseFloat(it.gst)||0)/100;},0);

  return (
    <div style={{padding:'8px 10px'}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:6}}>
        <span style={{fontSize:12,fontWeight:700,color:N}}>Line Items — Manufactured / Bought Out</span>
        <Btn v="suc" onClick={add}>+ Add Item</Btn>
      </div>
      <div style={{overflowX:'auto',border:`1px solid ${B}`}}>
        <table style={{width:'100%',borderCollapse:'collapse',fontSize:11,fontFamily:F,minWidth:700}}>
          <thead>
            <tr>
              {[['#',30],['Type',110],['Description / Item Name',0],['Qty',60],['Unit',60],
                ['Rate ₹',85],['GST %',60],['Amount ₹',95],['',70]].map(([h,w],i)=>(
                <th key={i} style={th(w||undefined, i>=5&&i<=6)}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.length===0 && (
              <tr><td colSpan={9} style={{padding:'14px',textAlign:'center',color:'#888',fontSize:11,background:'#fafafa'}}>
                No items added — click [+ Add Item] to start
              </td></tr>
            )}
            {items.map((it,idx)=>{
              const sub = (parseFloat(it.qty)||0)*(parseFloat(it.rate)||0);
              const tax = sub*(parseFloat(it.gst)||0)/100;
              const isBomOpen = bomOpen===it._id;
              return (
                <>
                  <tr key={it._id} style={{background:idx%2===0?W:'#f5f8fc'}}>
                    <td style={{...td(30),textAlign:'center',color:'#888'}}>{idx+1}</td>
                    <td style={td(110)}><Sel value={it.type} onChange={e=>upd(it._id,'type',e.target.value)} options={ITEM_TYPES}/></td>
                    <td style={td()}><Inp value={it.description} onChange={e=>upd(it._id,'description',e.target.value)} placeholder="Item / product description"/></td>
                    <td style={td(60)}><Inp type="number" value={it.qty} onChange={e=>upd(it._id,'qty',e.target.value)} min="0"/></td>
                    <td style={td(60)}><Sel value={it.unit} onChange={e=>upd(it._id,'unit',e.target.value)} options={UNITS}/></td>
                    <td style={td(85)}><Inp type="number" value={it.rate} onChange={e=>upd(it._id,'rate',e.target.value)} min="0"/></td>
                    <td style={td(60)}><Sel value={it.gst} onChange={e=>upd(it._id,'gst',e.target.value)} options={GST_RATES.map(r=>({value:r,label:`${r}%`}))}/></td>
                    <td style={{...td(95),textAlign:'right',fontWeight:700,color:'#005500'}}>{fmt(sub+tax)}</td>
                    <td style={{...td(70),textAlign:'center'}}>
                      <div style={{display:'flex',gap:3,justifyContent:'center'}}>
                        {it.type==='Manufactured' && (
                          <button onClick={()=>setBomOpen(isBomOpen?null:it._id)}
                            title="Bill of Materials"
                            style={{background:isBomOpen?N:'#d8ecff',color:isBomOpen?W:'#003875',
                              border:'1px solid #88aacc',padding:'0 5px',fontSize:10,cursor:'pointer',height:18,fontFamily:F,fontWeight:700}}>
                            BOM
                          </button>
                        )}
                        <button onClick={()=>del(it._id)}
                          style={{background:'#ffe0e0',color:R,border:`1px solid #cc8888`,padding:'0 5px',fontSize:10,cursor:'pointer',height:18}}>✕</button>
                      </div>
                    </td>
                  </tr>
                  {it.type==='Manufactured' && isBomOpen && (
                    <tr key={`bom-${it._id}`}>
                      <td colSpan={9} style={{padding:0,background:'#f0f7ff',borderLeft:'3px solid #4488cc',borderBottom:'2px solid #88aacc'}}>
                        <div style={{padding:'6px 8px 6px 24px'}}>
                          <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:5}}>
                            <span style={{fontSize:11,fontWeight:700,color:N}}>
                              BOM — Bought-Out Components for: <em>{it.description||`Item ${idx+1}`}</em>
                            </span>
                            <Btn v="suc" small onClick={()=>addBom(it._id)}>+ Add Component</Btn>
                          </div>
                          <table style={{width:'100%',borderCollapse:'collapse',fontSize:11,fontFamily:F}}>
                            <thead>
                              <tr style={{background:'#c0d8f0'}}>
                                {['#','Bought-Out Item / Raw Material','Qty','Unit',''].map((h,i)=>(
                                  <th key={i} style={{padding:'3px 7px',textAlign:'left',color:N,fontWeight:700,fontSize:10,border:'1px solid #88aacc'}}>{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {(it.bom||[]).length===0 && (
                                <tr><td colSpan={5} style={{padding:'7px',textAlign:'center',color:'#888',fontSize:11}}>No BOM components — click [+ Add Component]</td></tr>
                              )}
                              {(it.bom||[]).map((b,bi)=>(
                                <tr key={b._id} style={{background:bi%2===0?W:'#eef5ff'}}>
                                  <td style={{padding:'2px 4px',border:'1px solid #c0d8f0',width:28,textAlign:'center',color:'#888'}}>{bi+1}</td>
                                  <td style={{padding:'2px 4px',border:'1px solid #c0d8f0'}}>
                                    <Inp value={b.itemName} onChange={e=>updBom(it._id,b._id,'itemName',e.target.value)} placeholder="e.g. MS Pipe 50mm, Panel Sheet…"/>
                                  </td>
                                  <td style={{padding:'2px 4px',border:'1px solid #c0d8f0',width:70}}>
                                    <Inp type="number" value={b.qty} onChange={e=>updBom(it._id,b._id,'qty',e.target.value)} min="0"/>
                                  </td>
                                  <td style={{padding:'2px 4px',border:'1px solid #c0d8f0',width:70}}>
                                    <Sel value={b.unit} onChange={e=>updBom(it._id,b._id,'unit',e.target.value)} options={UNITS}/>
                                  </td>
                                  <td style={{padding:'2px 4px',border:'1px solid #c0d8f0',width:32,textAlign:'center'}}>
                                    <button onClick={()=>delBom(it._id,b._id)}
                                      style={{background:'#ffe0e0',color:R,border:`1px solid #cc8888`,padding:'0 4px',fontSize:10,cursor:'pointer',height:18}}>✕</button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
          {items.length>0 && (
            <tfoot>
              <tr style={{background:'#e8f0f8',borderTop:'2px solid #888'}}>
                <td colSpan={7} style={{padding:'4px 8px',textAlign:'right',fontWeight:700,fontSize:11,color:N}}>Items Total (incl. GST)</td>
                <td style={{padding:'4px 8px',textAlign:'right',fontWeight:700,fontSize:12,color:'#005500'}}>{fmt(total)}</td>
                <td/>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

/* ═══════════════════════ TAB 3 — ADD-ON ITEMS ═══════════════════════ */
function newAddon() { return {_id:uid(),description:'',category:'Accessory',qty:1,unit:'NOS',includedInPrice:true,remarks:''}; }
const ADDON_CATS = ['Accessory','Spare Part','AMC','Free Item','Documentation','Training','Other'];

function TabAddonItems({ addons, setAddons }) {
  const add = () => setAddons(p=>[...p,newAddon()]);
  const upd = (id,k,v) => setAddons(p=>p.map(r=>r._id===id?{...r,[k]:v}:r));
  const del = (id) => setAddons(p=>p.filter(r=>r._id!==id));

  return (
    <div style={{padding:'8px 10px'}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:6}}>
        <span style={{fontSize:12,fontWeight:700,color:N}}>Add-on / Accessory Items (Complimentary or Included)</span>
        <Btn v="suc" onClick={add}>+ Add Item</Btn>
      </div>
      <div style={{border:`1px solid ${B}`,overflow:'auto'}}>
        <table style={{width:'100%',borderCollapse:'collapse',fontSize:11,fontFamily:F}}>
          <thead>
            <tr style={{background:N}}>
              {['#','Description / Item','Category','Qty','Unit','Included in Price','Remarks',''].map((h,i)=>(
                <th key={i} style={{padding:'4px 6px',color:W,fontWeight:700,fontSize:10,textAlign:'left',borderRight:'1px solid #2a5a8a',whiteSpace:'nowrap'}}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {addons.length===0 && (
              <tr><td colSpan={8} style={{padding:'16px',textAlign:'center',color:'#888',background:'#fafafa',fontSize:11}}>
                No add-on items — click [+ Add Item] to add accessories, spares, AMC or free items
              </td></tr>
            )}
            {addons.map((a,i)=>(
              <tr key={a._id} style={{background:i%2===0?W:'#f5f8fc'}}>
                <td style={{padding:'2px 4px',border:'1px solid #e0e0e0',width:28,textAlign:'center',color:'#888'}}>{i+1}</td>
                <td style={{padding:'2px 4px',border:'1px solid #e0e0e0',minWidth:200}}>
                  <Inp value={a.description} onChange={e=>upd(a._id,'description',e.target.value)} placeholder="e.g. Remote Control, Manual, Spares Kit…"/>
                </td>
                <td style={{padding:'2px 4px',border:'1px solid #e0e0e0',width:120}}>
                  <Sel value={a.category} onChange={e=>upd(a._id,'category',e.target.value)} options={ADDON_CATS}/>
                </td>
                <td style={{padding:'2px 4px',border:'1px solid #e0e0e0',width:65}}>
                  <Inp type="number" value={a.qty} onChange={e=>upd(a._id,'qty',e.target.value)} min="0"/>
                </td>
                <td style={{padding:'2px 4px',border:'1px solid #e0e0e0',width:65}}>
                  <Sel value={a.unit} onChange={e=>upd(a._id,'unit',e.target.value)} options={UNITS}/>
                </td>
                <td style={{padding:'2px 4px',border:'1px solid #e0e0e0',width:100,textAlign:'center'}}>
                  <label style={{display:'flex',alignItems:'center',justifyContent:'center',gap:4,cursor:'pointer',fontSize:11}}>
                    <input type="checkbox" checked={!!a.includedInPrice} onChange={e=>upd(a._id,'includedInPrice',e.target.checked)}/>
                    Yes
                  </label>
                </td>
                <td style={{padding:'2px 4px',border:'1px solid #e0e0e0'}}>
                  <Inp value={a.remarks} onChange={e=>upd(a._id,'remarks',e.target.value)} placeholder="Notes…"/>
                </td>
                <td style={{padding:'2px 4px',border:'1px solid #e0e0e0',width:30,textAlign:'center'}}>
                  <button onClick={()=>del(a._id)}
                    style={{background:'#ffe0e0',color:R,border:'1px solid #cc8888',padding:'0 4px',fontSize:10,cursor:'pointer',height:18}}>✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ═══════════════════════ TAB 4 — ADDITIONAL CHARGES ═══════════════════════ */
const CHARGE_TYPES = ['Packing & Forwarding','Freight / Courier','Insurance','Loading / Unloading',
  'Erection & Commissioning','Documentation','GST Adjustment','Other'];

function newCharge() { return {_id:uid(),chargeType:'Packing & Forwarding',description:'',amount:0,gst:18}; }

function TabCharges({ charges, setCharges }) {
  const add = () => setCharges(p=>[...p,newCharge()]);
  const upd = (id,k,v) => setCharges(p=>p.map(r=>r._id===id?{...r,[k]:v}:r));
  const del = (id) => setCharges(p=>p.filter(r=>r._id!==id));

  const total = charges.reduce((s,ch)=>(parseFloat(ch.amount)||0)*(1+(parseFloat(ch.gst)||0)/100)+s,0);

  return (
    <div style={{padding:'8px 10px'}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:6}}>
        <span style={{fontSize:12,fontWeight:700,color:N}}>Additional Charges — Packing, Freight, Insurance, GST etc.</span>
        <Btn v="suc" onClick={add}>+ Add Charge</Btn>
      </div>
      <div style={{border:`1px solid ${B}`,overflow:'auto'}}>
        <table style={{width:'100%',borderCollapse:'collapse',fontSize:11,fontFamily:F}}>
          <thead>
            <tr style={{background:N}}>
              {['#','Charge Type','Description','Amount ₹','GST %','Total ₹',''].map((h,i)=>(
                <th key={i} style={{padding:'4px 6px',color:W,fontWeight:700,fontSize:10,textAlign:'left',borderRight:'1px solid #2a5a8a',whiteSpace:'nowrap'}}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {charges.length===0 && (
              <tr><td colSpan={7} style={{padding:'16px',textAlign:'center',color:'#888',background:'#fafafa',fontSize:11}}>
                No additional charges — click [+ Add Charge] to add packing, freight, insurance etc.
              </td></tr>
            )}
            {charges.map((ch,i)=>{
              const tot = (parseFloat(ch.amount)||0)*(1+(parseFloat(ch.gst)||0)/100);
              return (
                <tr key={ch._id} style={{background:i%2===0?W:'#f5f8fc'}}>
                  <td style={{padding:'2px 4px',border:'1px solid #e0e0e0',width:28,textAlign:'center',color:'#888'}}>{i+1}</td>
                  <td style={{padding:'2px 4px',border:'1px solid #e0e0e0',width:185}}>
                    <Sel value={ch.chargeType} onChange={e=>upd(ch._id,'chargeType',e.target.value)} options={CHARGE_TYPES}/>
                  </td>
                  <td style={{padding:'2px 4px',border:'1px solid #e0e0e0'}}>
                    <Inp value={ch.description} onChange={e=>upd(ch._id,'description',e.target.value)} placeholder="Details / narration…"/>
                  </td>
                  <td style={{padding:'2px 4px',border:'1px solid #e0e0e0',width:105}}>
                    <Inp type="number" value={ch.amount} onChange={e=>upd(ch._id,'amount',e.target.value)} min="0"/>
                  </td>
                  <td style={{padding:'2px 4px',border:'1px solid #e0e0e0',width:75}}>
                    <Sel value={ch.gst} onChange={e=>upd(ch._id,'gst',e.target.value)} options={GST_RATES.map(r=>({value:r,label:`${r}%`}))}/>
                  </td>
                  <td style={{padding:'2px 4px',border:'1px solid #e0e0e0',width:95,textAlign:'right',fontWeight:700,color:'#005500'}}>{fmt(tot)}</td>
                  <td style={{padding:'2px 4px',border:'1px solid #e0e0e0',width:30,textAlign:'center'}}>
                    <button onClick={()=>del(ch._id)}
                      style={{background:'#ffe0e0',color:R,border:'1px solid #cc8888',padding:'0 4px',fontSize:10,cursor:'pointer',height:18}}>✕</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
          {charges.length>0 && (
            <tfoot>
              <tr style={{background:'#e8f0f8',borderTop:'2px solid #888'}}>
                <td colSpan={5} style={{padding:'4px 8px',textAlign:'right',fontWeight:700,fontSize:11,color:N}}>Charges Total (incl. GST)</td>
                <td style={{padding:'4px 8px',textAlign:'right',fontWeight:700,fontSize:12,color:'#005500'}}>{fmt(total)}</td>
                <td/>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

/* ═══════════════════════ TAB 5 — BANK GUARANTEE ═══════════════════════ */
function TabBankGuarantee({ orderValue, bg, setBg }) {
  const [docs, setDocs] = useState([]);
  const bgAmount = (() => {
    const base = bg.basis==='withGst' ? orderValue : orderValue/(1+(18/100));
    return base*(parseFloat(bg.pct)||0)/100;
  })();
  const addDoc = () => setDocs(p=>[...p,{_id:uid(),name:'',file:null}]);
  const updDoc = (id,k,v) => setDocs(p=>p.map(d=>d._id===id?{...d,[k]:v}:d));
  const delDoc = (id) => setDocs(p=>p.filter(d=>d._id!==id));

  return (
    <div style={{padding:'8px 10px'}}>
      <div style={{border:`1px solid ${B}`,background:W,maxWidth:680}}>
        <PH title="Bank Guarantee Details" />
        <div style={{padding:'4px 8px 8px'}}>
          <FR label="Applicable" w={130}>
            <label style={{display:'flex',alignItems:'center',gap:6,fontSize:12,cursor:'pointer',fontWeight:600}}>
              <input type="checkbox" checked={bg.applicable} onChange={e=>setBg(p=>({...p,applicable:e.target.checked}))}/>
              Bank Guarantee is applicable for this order
            </label>
          </FR>
          {bg.applicable && (
            <>
              <FR label="Order Value ₹" w={130}>
                <Inp value={fmt(orderValue)} readOnly style={{width:160}}/>
                <span style={{fontSize:10,color:'#666',paddingLeft:6}}>(auto from items + charges)</span>
              </FR>
              <FR label="BG Basis" w={130}>
                <label style={{display:'flex',alignItems:'center',gap:4,fontSize:12,cursor:'pointer',marginRight:16}}>
                  <input type="radio" name="bgbasis" value="basic" checked={bg.basis==='basic'} onChange={()=>setBg(p=>({...p,basis:'basic'}))}/>
                  On Basic Value (excl. GST)
                </label>
                <label style={{display:'flex',alignItems:'center',gap:4,fontSize:12,cursor:'pointer'}}>
                  <input type="radio" name="bgbasis" value="withGst" checked={bg.basis==='withGst'} onChange={()=>setBg(p=>({...p,basis:'withGst'}))}/>
                  On Total Value (incl. GST)
                </label>
              </FR>
              <FR label="BG %" w={130}>
                <Inp type="number" value={bg.pct} onChange={e=>setBg(p=>({...p,pct:e.target.value}))} style={{width:80}} min="0" max="100"/>
                <span style={{fontSize:12,color:N,fontWeight:700,paddingLeft:8}}>BG Amount: {fmt(bgAmount)}</span>
              </FR>
              <FR label="Bank Name" w={130}><Inp value={bg.bankName||''} onChange={e=>setBg(p=>({...p,bankName:e.target.value}))} style={{width:240}}/></FR>
              <FR label="BG No." w={130}><Inp value={bg.bgNo||''} onChange={e=>setBg(p=>({...p,bgNo:e.target.value}))} style={{width:180}}/></FR>
              <FR label="BG Expiry" w={130}><Inp type="date" value={bg.expiry||''} onChange={e=>setBg(p=>({...p,expiry:e.target.value}))} style={{width:150}}/></FR>
              <FR label="Remarks" w={130}><Txt value={bg.remarks||''} onChange={e=>setBg(p=>({...p,remarks:e.target.value}))} rows={2}/></FR>
            </>
          )}
        </div>
      </div>
      {bg.applicable && (
        <div style={{marginTop:10}}>
          <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:6}}>
            <span style={{fontSize:12,fontWeight:700,color:N}}>BG Document Attachments</span>
            <Btn v="suc" onClick={addDoc}>+ Add Document</Btn>
          </div>
          <div style={{border:`1px solid ${B}`}}>
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:11,fontFamily:F}}>
              <thead>
                <tr style={{background:N}}>
                  {['#','Document Name','File',''].map((h,i)=>(
                    <th key={i} style={{padding:'4px 6px',color:W,fontWeight:700,fontSize:10,textAlign:'left',borderRight:'1px solid #2a5a8a'}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {docs.length===0 && <tr><td colSpan={4} style={{padding:'10px',textAlign:'center',color:'#888'}}>No documents attached</td></tr>}
                {docs.map((d,i)=>(
                  <tr key={d._id} style={{background:i%2===0?W:'#f5f8fc'}}>
                    <td style={{padding:'2px 4px',border:'1px solid #e0e0e0',width:28,textAlign:'center',color:'#888'}}>{i+1}</td>
                    <td style={{padding:'2px 4px',border:'1px solid #e0e0e0',minWidth:220}}>
                      <Inp value={d.name} onChange={e=>updDoc(d._id,'name',e.target.value)} placeholder="e.g. BG Certificate, Stamp Paper…"/>
                    </td>
                    <td style={{padding:'2px 4px',border:'1px solid #e0e0e0'}}>
                      {d.file ? <span style={{fontSize:11,color:'#005500',fontWeight:700}}>✔ {d.file.name}</span>
                              : <input type="file" onChange={e=>updDoc(d._id,'file',e.target.files[0])} style={{fontSize:11}}/>}
                    </td>
                    <td style={{padding:'2px 4px',border:'1px solid #e0e0e0',width:30,textAlign:'center'}}>
                      <button onClick={()=>delDoc(d._id)} style={{background:'#ffe0e0',color:R,border:'1px solid #cc8888',padding:'0 4px',fontSize:10,cursor:'pointer',height:18}}>✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════ TAB 6 — SCOPE OF WORK ═══════════════════════ */
const SCOPE_DEFAULTS = ['Air Conditioning (AC)','Electrical Work','Civil Work','Transport / Logistics',
  'Installation & Commissioning','Loading / Unloading','Documentation','Procurement','Testing & Inspection','Training','Other'];

function newScope() { return {_id:uid(),item:'',clientScope:false,ourScope:true,remarks:''}; }

function TabScope({ scopes, setScopes }) {
  const add = () => setScopes(p=>[...p,newScope()]);
  const upd = (id,k,v) => setScopes(p=>p.map(r=>r._id===id?{...r,[k]:v}:r));
  const del = (id) => setScopes(p=>p.filter(r=>r._id!==id));
  const quick = s => setScopes(p=>[...p,{_id:uid(),item:s,clientScope:false,ourScope:true,remarks:''}]);

  return (
    <div style={{padding:'8px 10px'}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:6}}>
        <span style={{fontSize:12,fontWeight:700,color:N}}>Scope of Work — Client Scope vs Our Scope</span>
        <Btn v="suc" onClick={add}>+ Add Row</Btn>
      </div>
      <div style={{display:'flex',flexWrap:'wrap',gap:4,marginBottom:8,padding:'6px 8px',background:'#f0f7ff',border:'1px solid #cce'}}>
        <span style={{fontSize:10,color:'#555',alignSelf:'center',marginRight:2,fontWeight:700}}>Quick Add:</span>
        {SCOPE_DEFAULTS.map((s,i)=>(
          <button key={i} onClick={()=>quick(s)}
            style={{background:'#d8eeff',color:'#003875',border:'1px solid #88aacc',
              padding:'2px 8px',fontSize:10,cursor:'pointer',height:20,fontFamily:F}}>
            {s}
          </button>
        ))}
      </div>
      <div style={{border:`1px solid ${B}`}}>
        <table style={{width:'100%',borderCollapse:'collapse',fontSize:11,fontFamily:F}}>
          <thead>
            <tr style={{background:N}}>
              {['#','Scope Item / Activity','Client Scope','Our Scope','Remarks',''].map((h,i)=>(
                <th key={i} style={{padding:'4px 6px',color:W,fontWeight:700,fontSize:10,textAlign:i===2||i===3?'center':'left',borderRight:'1px solid #2a5a8a',whiteSpace:'nowrap'}}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {scopes.length===0 && (
              <tr><td colSpan={6} style={{padding:'16px',textAlign:'center',color:'#888',background:'#fafafa',fontSize:11}}>
                Use Quick Add above or [+ Add Row]
              </td></tr>
            )}
            {scopes.map((s,i)=>(
              <tr key={s._id} style={{background:i%2===0?W:'#f5f8fc'}}>
                <td style={{padding:'2px 4px',border:'1px solid #e0e0e0',width:28,textAlign:'center',color:'#888'}}>{i+1}</td>
                <td style={{padding:'2px 4px',border:'1px solid #e0e0e0'}}>
                  <Inp value={s.item} onChange={e=>upd(s._id,'item',e.target.value)} placeholder="e.g. AC, Transport, Installation…"/>
                </td>
                <td style={{padding:'2px 4px',border:'1px solid #e0e0e0',width:90,textAlign:'center'}}>
                  <input type="checkbox" checked={!!s.clientScope} onChange={e=>upd(s._id,'clientScope',e.target.checked)}/>
                </td>
                <td style={{padding:'2px 4px',border:'1px solid #e0e0e0',width:90,textAlign:'center'}}>
                  <input type="checkbox" checked={!!s.ourScope} onChange={e=>upd(s._id,'ourScope',e.target.checked)}/>
                </td>
                <td style={{padding:'2px 4px',border:'1px solid #e0e0e0'}}>
                  <Inp value={s.remarks} onChange={e=>upd(s._id,'remarks',e.target.value)} placeholder="Notes…"/>
                </td>
                <td style={{padding:'2px 4px',border:'1px solid #e0e0e0',width:30,textAlign:'center'}}>
                  <button onClick={()=>del(s._id)} style={{background:'#ffe0e0',color:R,border:'1px solid #cc8888',padding:'0 4px',fontSize:10,cursor:'pointer',height:18}}>✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ═══════════════════════ TAB 7 — WARRANTY ═══════════════════════ */
function TabWarranty({ warranty, setWarranty }) {
  const upd = (k,v) => setWarranty(p=>({...p,[k]:v}));
  return (
    <div style={{padding:'8px 10px'}}>
      <div style={{border:`1px solid ${B}`,background:W,maxWidth:800}}>
        <PH title="Warranty Certificate Details" />
        <div style={{padding:'4px 8px 10px'}}>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:0,columnGap:12}}>
            <FR label="Warranty Period" w={140}>
              <Inp value={warranty.period||''} onChange={e=>upd('period',e.target.value)} placeholder="e.g. 12 months, 2 years" style={{width:180}}/>
            </FR>
            <FR label="Warranty Type" w={140}>
              <Sel value={warranty.type||''} onChange={e=>upd('type',e.target.value)}
                options={['','Comprehensive','Limited','On-Site','Return to Base','Parts Only']} style={{width:200}}/>
            </FR>
            <FR label="Start Date" w={140}>
              <Inp type="date" value={warranty.startDate||''} onChange={e=>upd('startDate',e.target.value)} style={{width:150}}/>
            </FR>
            <FR label="End Date" w={140}>
              <Inp type="date" value={warranty.endDate||''} onChange={e=>upd('endDate',e.target.value)} style={{width:150}}/>
            </FR>
            <FR label="Certificate No." w={140}>
              <Inp value={warranty.certNo||''} onChange={e=>upd('certNo',e.target.value)} style={{width:200}}/>
            </FR>
            <FR label="Issued By" w={140}>
              <Inp value={warranty.issuedBy||''} onChange={e=>upd('issuedBy',e.target.value)} style={{width:200}}/>
            </FR>
          </div>
          <FR label="Warranty Terms" w={140}>
            <Txt value={warranty.terms||''} onChange={e=>upd('terms',e.target.value)} placeholder="Terms and conditions of warranty…" rows={4}/>
          </FR>
          <FR label="Exclusions" w={140}>
            <Txt value={warranty.exclusions||''} onChange={e=>upd('exclusions',e.target.value)} placeholder="What is NOT covered under this warranty…" rows={3}/>
          </FR>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════ TAB 8 — ACTIVITIES ═══════════════════════ */
function newActivity() { return {_id:uid(),task:'',assignedTo:'',startDate:'',endDate:'',status:'Pending',remarks:''}; }
const ACT_STATUS = ['Pending','In Progress','Completed','On Hold','Cancelled'];

function TabActivities({ activities, setActivities }) {
  const add = () => setActivities(p=>[...p,newActivity()]);
  const upd = (id,k,v) => setActivities(p=>p.map(r=>r._id===id?{...r,[k]:v}:r));
  const del = (id) => setActivities(p=>p.filter(r=>r._id!==id));

  return (
    <div style={{padding:'8px 10px'}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:6}}>
        <span style={{fontSize:12,fontWeight:700,color:N}}>Activities / Task List</span>
        <Btn v="suc" onClick={add}>+ Add Activity</Btn>
      </div>
      <div style={{border:`1px solid ${B}`,overflow:'auto'}}>
        <table style={{width:'100%',borderCollapse:'collapse',fontSize:11,fontFamily:F,minWidth:800}}>
          <thead>
            <tr style={{background:N}}>
              {['#','Task / Activity','Assigned To','Start Date','End Date','Status','Remarks',''].map((h,i)=>(
                <th key={i} style={{padding:'4px 6px',color:W,fontWeight:700,fontSize:10,textAlign:'left',borderRight:'1px solid #2a5a8a',whiteSpace:'nowrap'}}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {activities.length===0 && (
              <tr><td colSpan={8} style={{padding:'16px',textAlign:'center',color:'#888',background:'#fafafa',fontSize:11}}>No activities added</td></tr>
            )}
            {activities.map((a,i)=>(
              <tr key={a._id} style={{background:i%2===0?W:'#f5f8fc'}}>
                <td style={{padding:'2px 4px',border:'1px solid #e0e0e0',width:28,textAlign:'center',color:'#888'}}>{i+1}</td>
                <td style={{padding:'2px 4px',border:'1px solid #e0e0e0',minWidth:180}}>
                  <Inp value={a.task} onChange={e=>upd(a._id,'task',e.target.value)} placeholder="Activity description…"/>
                </td>
                <td style={{padding:'2px 4px',border:'1px solid #e0e0e0',width:130}}>
                  <Inp value={a.assignedTo} onChange={e=>upd(a._id,'assignedTo',e.target.value)} placeholder="Name / Team"/>
                </td>
                <td style={{padding:'2px 4px',border:'1px solid #e0e0e0',width:115}}>
                  <Inp type="date" value={a.startDate} onChange={e=>upd(a._id,'startDate',e.target.value)}/>
                </td>
                <td style={{padding:'2px 4px',border:'1px solid #e0e0e0',width:115}}>
                  <Inp type="date" value={a.endDate} onChange={e=>upd(a._id,'endDate',e.target.value)}/>
                </td>
                <td style={{padding:'2px 4px',border:'1px solid #e0e0e0',width:115}}>
                  <Sel value={a.status} onChange={e=>upd(a._id,'status',e.target.value)} options={ACT_STATUS}/>
                </td>
                <td style={{padding:'2px 4px',border:'1px solid #e0e0e0'}}>
                  <Inp value={a.remarks} onChange={e=>upd(a._id,'remarks',e.target.value)} placeholder="Notes…"/>
                </td>
                <td style={{padding:'2px 4px',border:'1px solid #e0e0e0',width:30,textAlign:'center'}}>
                  <button onClick={()=>del(a._id)} style={{background:'#ffe0e0',color:R,border:'1px solid #cc8888',padding:'0 4px',fontSize:10,cursor:'pointer',height:18}}>✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ═══════════════════════ TAB 9 — ATTACHMENTS ═══════════════════════ */
function newAttach() { return {_id:uid(),name:'',file:null}; }

function TabAttachments({ attachments, setAttachments }) {
  const add = () => setAttachments(p=>[...p,newAttach()]);
  const upd = (id,k,v) => setAttachments(p=>p.map(r=>r._id===id?{...r,[k]:v}:r));
  const del = (id) => setAttachments(p=>p.filter(r=>r._id!==id));

  return (
    <div style={{padding:'8px 10px'}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:6}}>
        <span style={{fontSize:12,fontWeight:700,color:N}}>Document Attachments</span>
        <Btn v="suc" onClick={add}>+ Add Document</Btn>
      </div>
      <div style={{border:`1px solid ${B}`}}>
        <table style={{width:'100%',borderCollapse:'collapse',fontSize:11,fontFamily:F}}>
          <thead>
            <tr style={{background:N}}>
              {['#','Document Name','File','Status',''].map((h,i)=>(
                <th key={i} style={{padding:'4px 6px',color:W,fontWeight:700,fontSize:10,textAlign:'left',borderRight:'1px solid #2a5a8a'}}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {attachments.length===0 && (
              <tr><td colSpan={5} style={{padding:'16px',textAlign:'center',color:'#888',background:'#fafafa',fontSize:11}}>
                No documents — click [+ Add Document] to attach PO copy, drawings, specs etc.
              </td></tr>
            )}
            {attachments.map((a,i)=>(
              <tr key={a._id} style={{background:i%2===0?W:'#f5f8fc'}}>
                <td style={{padding:'2px 4px',border:'1px solid #e0e0e0',width:28,textAlign:'center',color:'#888'}}>{i+1}</td>
                <td style={{padding:'2px 4px',border:'1px solid #e0e0e0',minWidth:220}}>
                  <Inp value={a.name} onChange={e=>upd(a._id,'name',e.target.value)} placeholder="e.g. PO Copy, Drawing, Spec Sheet, Quality Report…"/>
                </td>
                <td style={{padding:'2px 4px',border:'1px solid #e0e0e0'}}>
                  {a.file
                    ? <span style={{fontSize:11,color:'#005500',fontWeight:700}}>✔ {a.file.name}</span>
                    : <input type="file" onChange={e=>upd(a._id,'file',e.target.files[0])} style={{fontSize:11}}/>
                  }
                </td>
                <td style={{padding:'2px 4px',border:'1px solid #e0e0e0',width:80,textAlign:'center'}}>
                  {a.file
                    ? <span style={{color:'#005500',fontSize:10,fontWeight:700}}>ATTACHED</span>
                    : <span style={{color:'#888',fontSize:10}}>PENDING</span>
                  }
                </td>
                <td style={{padding:'2px 4px',border:'1px solid #e0e0e0',width:30,textAlign:'center'}}>
                  <button onClick={()=>del(a._id)} style={{background:'#ffe0e0',color:R,border:'1px solid #cc8888',padding:'0 4px',fontSize:10,cursor:'pointer',height:18}}>✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ═══════════════════════ ORDER SUMMARY STRIP ═══════════════════════ */
function OrderSummaryStrip({ items, charges }) {
  const itemsNet  = items.reduce((s,it)=>(parseFloat(it.qty)||0)*(parseFloat(it.rate)||0)+s, 0);
  const itemsGst  = items.reduce((s,it)=>{const sub=(parseFloat(it.qty)||0)*(parseFloat(it.rate)||0);return s+sub*(parseFloat(it.gst)||0)/100;},0);
  const chgNet    = charges.reduce((s,ch)=>s+(parseFloat(ch.amount)||0),0);
  const chgGst    = charges.reduce((s,ch)=>{const a=parseFloat(ch.amount)||0;return s+a*(parseFloat(ch.gst)||0)/100;},0);
  const grand     = itemsNet+itemsGst+chgNet+chgGst;
  return (
    <div style={{display:'flex',alignItems:'center',gap:12,padding:'2px 10px',
      background:'#1e3a5f',borderTop:'1px solid #0d2f50',flexShrink:0,flexWrap:'wrap'}}>
      <span style={{fontSize:10,color:'#aac0d8',fontFamily:F}}>
        Items: <strong style={{color:'#fff'}}>{fmt(itemsNet+itemsGst)}</strong>
      </span>
      <span style={{color:'#556677',fontSize:10}}>|</span>
      <span style={{fontSize:10,color:'#aac0d8',fontFamily:F}}>
        Charges: <strong style={{color:'#fff'}}>{fmt(chgNet+chgGst)}</strong>
      </span>
      <span style={{color:'#556677',fontSize:10}}>|</span>
      <span style={{fontSize:11,color:'#ffd700',fontFamily:F,fontWeight:700}}>
        Grand Total: {fmt(grand)}
      </span>
    </div>
  );
}

/* ═══════════════════════ VIEW LIST ═══════════════════════ */
/* ═══════════════════════ ORDER DETAIL MODAL ═══════════════════════ */
const MODAL_TABS = [
  { id:'order-details',  label:'Order Details',    icon:'📋' },
  { id:'item-details',   label:'Item Details',     icon:'📦' },
  { id:'addon-items',    label:'Add-on Items',     icon:'🎁' },
  { id:'charges',        label:'Charges & Total',  icon:'💰' },
  { id:'bank-guarantee', label:'Bank Guarantee',   icon:'🏦' },
  { id:'scope',          label:'Scope of Work',    icon:'🔧' },
  { id:'warranty',       label:'Warranty',         icon:'🛡️' },
  { id:'activities',     label:'Activities',       icon:'📅' },
  { id:'attachments',    label:'Attachments',      icon:'📎' },
];

function OrderModal({ order, companyId, onClose, onApprove, onReject }) {
  const { selectedCompany } = useCompany();
  if (!order) return null;
  const o          = order;
  const items      = Array.isArray(o.items)       ? o.items       : [];
  const charges    = Array.isArray(o.charges)      ? o.charges     : [];
  const addons     = Array.isArray(o.addons)       ? o.addons      : [];
  const scopes     = Array.isArray(o.scopeItems)   ? o.scopeItems  : [];
  const activities = Array.isArray(o.tasks)        ? o.tasks       :
                     Array.isArray(o.activities)   ? o.activities  : [];
  const attachments= Array.isArray(o.attachments)  ? o.attachments : [];
  const bg         = o.bankGuarantee || o.bg || {};
  const warranty   = o.warranty || {};

  const itemsNet  = items.reduce((s,it)=>(parseFloat(it.qty)||0)*(parseFloat(it.rate)||0)+s, 0);
  const itemsGst  = items.reduce((s,it)=>{ const a=(parseFloat(it.qty)||0)*(parseFloat(it.rate)||0); return s+a*(parseFloat(it.gstPercent||it.gst)||0)/100; }, 0);
  const chgNet    = charges.reduce((s,c)=>s+(parseFloat(c.amount)||0), 0);
  const chgGst    = charges.reduce((s,c)=>{ const a=parseFloat(c.amount)||0; return s+a*(parseFloat(c.gst)||0)/100; }, 0);
  const grandTotal = parseFloat(o.grandTotal)||(itemsNet+itemsGst+chgNet+chgGst);

  const fmtD = d => { if(!d) return '—'; const dt=new Date(d); return isNaN(dt)?d:dt.toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}); };
  const val  = v  => (v==null||v===''||v==='—') ? <span style={{color:'#bbb',fontStyle:'italic'}}>—</span> : v;

  /* ── shared inline styles ── */
  const SH = {background:'#1a3a6b',color:'#fff',padding:'5px 10px',fontSize:10,fontWeight:700,textTransform:'uppercase',letterSpacing:'.7px',fontFamily:F};
  const CELL_L = {fontSize:10,fontWeight:700,color:'#445',minWidth:110,padding:'3px 8px',borderRight:'1px solid #e8ecf4',background:'#f6f8fc',flexShrink:0,whiteSpace:'nowrap'};
  const CELL_V = {fontSize:11,color:'#111',padding:'3px 8px',fontFamily:F};
  const ROW    = {display:'flex',minHeight:24,borderBottom:'1px solid #eef1f8',alignItems:'center'};
  const SecHead = ({title,count})=>(
    <div style={{...SH,marginTop:14,display:'flex',alignItems:'center',gap:8,borderLeft:'4px solid #c8a000'}}>
      {title}
      {count!=null&&<span style={{background:'#fff',color:'#1a3a6b',borderRadius:10,padding:'0 7px',fontSize:9,fontWeight:800}}>{count}</span>}
    </div>
  );

  /* table helpers */
  const TH = (props) => <th style={{padding:'5px 8px',background:'#1a3a6b',color:'#fff',fontSize:10,fontWeight:700,textAlign:props.r?'right':props.c?'center':'left',border:'1px solid #2a4a8a',whiteSpace:'nowrap',...props.style}}>{props.children}</th>;
  const TD = (props) => <td style={{padding:'4px 8px',border:'1px solid #dde4f0',fontSize:11,verticalAlign:'top',textAlign:props.r?'right':props.c?'center':'left',fontWeight:props.bold?700:400,...props.style}}>{props.children}</td>;

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.6)',zIndex:9999,display:'flex',alignItems:'center',justifyContent:'center',padding:10}}
      onClick={onClose}>
      <div style={{background:'#f4f6fa',width:'100%',maxWidth:1080,maxHeight:'96vh',display:'flex',flexDirection:'column',boxShadow:'0 6px 48px rgba(0,0,0,0.4)',border:'1px solid #c0c8da'}}
        onClick={e=>e.stopPropagation()}>

        {/* ══ STICKY HEADER ══ */}
        <div style={{background:'#1a3a6b',color:'#fff',padding:'10px 16px',flexShrink:0,borderBottom:'3px solid #c8a000',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <div>
            <div style={{fontSize:10,opacity:.65,letterSpacing:.8,textTransform:'uppercase',fontFamily:F}}>Epsilon Enterprise · Sales Order</div>
            <div style={{fontSize:14,fontWeight:800,fontFamily:F,marginTop:2}}>
              {o.orderNo||o.voucherNumber||`#${o.orderId}`}
              <span style={{marginLeft:10,fontSize:11,fontWeight:400,opacity:.85}}>{o.customerName||o.party}</span>
            </div>
          </div>
          <div style={{display:'flex',gap:10,alignItems:'center'}}>
            <div style={{textAlign:'right'}}>
              <div style={{fontSize:9,opacity:.65,fontFamily:F}}>GRAND TOTAL</div>
              <div style={{fontSize:15,fontWeight:900,color:'#ffd700',fontFamily:F}}>{fmt(grandTotal)}</div>
            </div>
            <Badge s={o.status}/>
            <button onClick={onClose} style={{background:'rgba(255,255,255,0.1)',border:'1px solid rgba(255,255,255,0.3)',color:'#fff',width:26,height:26,cursor:'pointer',fontSize:14,borderRadius:2}}>✕</button>
          </div>
        </div>

        {/* ══ SCROLLABLE DOCUMENT BODY ══ */}
        <div style={{flex:1,overflowY:'auto',padding:'12px 16px',background:'#fff'}}>

          {/* ── BILL TO / SHIP TO ── */}
          <table style={{width:'100%',borderCollapse:'collapse',border:'1px solid #c8d4e8',marginBottom:0}}>
            <thead>
              <tr>
                <th style={{...SH,width:'50%',textAlign:'left',border:'1px solid #2a4a8a'}}>Bill To (Customer)</th>
                <th style={{...SH,width:'50%',textAlign:'left',border:'1px solid #2a4a8a'}}>Ship To / Delivery Address</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{padding:'8px 10px',border:'1px solid #dde4f0',verticalAlign:'top'}}>
                  <div style={{fontSize:13,fontWeight:800,color:'#1a3a6b',fontFamily:F}}>{val(o.customerName||o.party)}</div>
                  {o.customerGstin&&<div style={{fontSize:10,color:'#555',marginTop:2}}>GSTIN: {o.customerGstin}</div>}
                  {o.customerState&&<div style={{fontSize:10,color:'#555'}}>State: {o.customerState}</div>}
                  {o.contactPerson&&<div style={{fontSize:10,color:'#555',marginTop:3}}>Contact: {o.contactPerson}</div>}
                  {o.mobile&&<div style={{fontSize:10,color:'#555'}}>Mobile: {o.mobile}</div>}
                  {o.email&&<div style={{fontSize:10,color:'#555'}}>Email: {o.email}</div>}
                </td>
                <td style={{padding:'8px 10px',border:'1px solid #dde4f0',verticalAlign:'top'}}>
                  <div style={{fontSize:11,color:'#222',fontFamily:F,lineHeight:1.5}}>{val(o.deliveryAddr||o.destination||o.address)}</div>
                  {o.shippingAddr&&o.shippingAddr!==(o.deliveryAddr||o.destination)&&(
                    <div style={{fontSize:10,color:'#555',marginTop:4}}>Shipping: {o.shippingAddr}</div>
                  )}
                </td>
              </tr>
            </tbody>
          </table>

          {/* ── ORDER REFERENCE GRID ── */}
          <table style={{width:'100%',borderCollapse:'collapse',border:'1px solid #c8d4e8',borderTop:'none',marginBottom:12}}>
            <tbody>
              <tr style={{background:'#f6f8fc'}}>
                <td style={{...ROW,padding:'4px 10px',border:'1px solid #dde4f0',width:'25%'}}><span style={{...CELL_L,minWidth:0,background:'none',border:'none',padding:0}}>ERP Order ID</span></td>
                <td style={{...ROW,padding:'4px 10px',border:'1px solid #dde4f0',width:'25%',fontWeight:700,color:'#1a3a6b'}}>{o.orderId}</td>
                <td style={{...ROW,padding:'4px 10px',border:'1px solid #dde4f0',width:'25%'}}><span style={{...CELL_L,minWidth:0,background:'none',border:'none',padding:0}}>Order Dated</span></td>
                <td style={{...ROW,padding:'4px 10px',border:'1px solid #dde4f0',width:'25%'}}>{fmtD(o.orderDate||o.date)}</td>
              </tr>
              <tr>
                <td style={{padding:'4px 10px',border:'1px solid #dde4f0'}}><span style={{...CELL_L,minWidth:0,background:'none',border:'none',padding:0}}>Quote Ref No.</span></td>
                <td style={{padding:'4px 10px',border:'1px solid #dde4f0'}}>{val(o.quotationRef||o.orderRef)}</td>
                <td style={{padding:'4px 10px',border:'1px solid #dde4f0'}}><span style={{...CELL_L,minWidth:0,background:'none',border:'none',padding:0}}>Quote Ref Date</span></td>
                <td style={{padding:'4px 10px',border:'1px solid #dde4f0'}}>{fmtD(o.poDate)}</td>
              </tr>
              <tr style={{background:'#f6f8fc'}}>
                <td style={{padding:'4px 10px',border:'1px solid #dde4f0'}}><span style={{...CELL_L,minWidth:0,background:'none',border:'none',padding:0}}>Client Order No.</span></td>
                <td style={{padding:'4px 10px',border:'1px solid #dde4f0',fontWeight:700}}>{val(o.customerPO||o.reference)}</td>
                <td style={{padding:'4px 10px',border:'1px solid #dde4f0'}}><span style={{...CELL_L,minWidth:0,background:'none',border:'none',padding:0}}>Client Order Date</span></td>
                <td style={{padding:'4px 10px',border:'1px solid #dde4f0'}}>{fmtD(o.poDate)}</td>
              </tr>
              <tr>
                <td style={{padding:'4px 10px',border:'1px solid #dde4f0'}}><span style={{...CELL_L,minWidth:0,background:'none',border:'none',padding:0}}>Delivery Due Date</span></td>
                <td style={{padding:'4px 10px',border:'1px solid #dde4f0',fontWeight:700,color:'#b03000'}}>{fmtD(o.deliveryDate)}</td>
                <td style={{padding:'4px 10px',border:'1px solid #dde4f0'}}><span style={{...CELL_L,minWidth:0,background:'none',border:'none',padding:0}}>Payment Terms</span></td>
                <td style={{padding:'4px 10px',border:'1px solid #dde4f0'}}>{val(o.paymentTerms)}</td>
              </tr>
              <tr style={{background:'#f6f8fc'}}>
                <td style={{padding:'4px 10px',border:'1px solid #dde4f0'}}><span style={{...CELL_L,minWidth:0,background:'none',border:'none',padding:0}}>Order Type</span></td>
                <td style={{padding:'4px 10px',border:'1px solid #dde4f0'}}>{val(o.orderType)}</td>
                <td style={{padding:'4px 10px',border:'1px solid #dde4f0'}}><span style={{...CELL_L,minWidth:0,background:'none',border:'none',padding:0}}>Sales Person</span></td>
                <td style={{padding:'4px 10px',border:'1px solid #dde4f0'}}>{val(o.salesPerson)}</td>
              </tr>
              <tr>
                <td style={{padding:'4px 10px',border:'1px solid #dde4f0'}}><span style={{...CELL_L,minWidth:0,background:'none',border:'none',padding:0}}>Dispatch Mode</span></td>
                <td style={{padding:'4px 10px',border:'1px solid #dde4f0'}}>{val(o.dispatchMode||o.shippedBy)}</td>
                <td style={{padding:'4px 10px',border:'1px solid #dde4f0'}}><span style={{...CELL_L,minWidth:0,background:'none',border:'none',padding:0}}>Incoterms</span></td>
                <td style={{padding:'4px 10px',border:'1px solid #dde4f0'}}>{val(o.incoterms)}</td>
              </tr>
            </tbody>
          </table>

          {/* ── ITEM DETAILS ── */}
          <SecHead title="Item Details" count={items.length}/>
          <div style={{overflowX:'auto',border:'1px solid #c8d4e8'}}>
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:11,fontFamily:F,minWidth:700}}>
              <thead><tr>
                <TH style={{width:30,textAlign:'center'}}>#</TH>
                <TH style={{minWidth:130}}>Material / Item Name</TH>
                <TH style={{minWidth:140}}>Description</TH>
                <TH style={{width:50,textAlign:'center'}}>Type</TH>
                <TH style={{width:45,textAlign:'center'}}>Qty</TH>
                <TH style={{width:45,textAlign:'center'}}>Unit</TH>
                <TH style={{width:80,textAlign:'right'}}>Rate ₹</TH>
                <TH style={{width:85,textAlign:'right'}}>Amount ₹</TH>
                <TH style={{width:45,textAlign:'center'}}>GST%</TH>
                <TH style={{width:80,textAlign:'right'}}>GST ₹</TH>
                <TH style={{width:85,textAlign:'right'}}>Total ₹</TH>
              </tr></thead>
              <tbody>
                {items.length===0&&<tr><td colSpan={11} style={{padding:12,textAlign:'center',color:'#aaa',fontStyle:'italic',border:'1px solid #dde4f0'}}>No items</td></tr>}
                {items.map((it,i)=>{
                  const qty=parseFloat(it.qty)||0,rate=parseFloat(it.rate)||0;
                  const amt=qty*rate,gst=parseFloat(it.gstPercent||it.gst)||0,ttl=amt+amt*gst/100;
                  const typeC={'Manufactured':'#003875','Purchased':'#1a5c1a','Labour':'#5a3a00'}[it.type]||'#444';
                  return(<tr key={i} style={{background:i%2?'#f7f9fd':'#fff'}}>
                    <TD c style={{color:'#aaa'}}>{i+1}</TD>
                    <TD bold style={{color:'#1a3a6b'}}>{it.material||it.itemName||'—'}</TD>
                    <TD style={{fontSize:10,color:'#555'}}>{it.description||'—'}</TD>
                    <TD c>{it.type&&<span style={{background:typeC,color:'#fff',borderRadius:2,padding:'1px 5px',fontSize:9,fontWeight:700}}>{it.type}</span>}</TD>
                    <TD c>{qty||'—'}</TD>
                    <TD c>{it.unit||'—'}</TD>
                    <TD r>{fmt(rate)}</TD>
                    <TD r>{fmt(amt)}</TD>
                    <TD c>{gst?`${gst}%`:'—'}</TD>
                    <TD r>{gst?fmt(amt*gst/100):'—'}</TD>
                    <TD r bold style={{color:'#1a5c1a'}}>{fmt(ttl)}</TD>
                  </tr>);
                })}
              </tbody>
              {items.length>0&&<tfoot>
                <tr style={{background:'#eef3fa'}}>
                  <td colSpan={7} style={{padding:'5px 8px',textAlign:'right',fontWeight:700,fontSize:11,fontFamily:F,color:'#1a3a6b',border:'1px solid #c8d4e8',borderTop:'2px solid #1a3a6b'}}>Sub Total (excl. GST)</td>
                  <td style={{padding:'5px 8px',textAlign:'right',fontWeight:700,fontFamily:F,border:'1px solid #c8d4e8',borderTop:'2px solid #1a3a6b'}}>{fmt(itemsNet)}</td>
                  <td style={{border:'1px solid #c8d4e8',borderTop:'2px solid #1a3a6b'}}/>
                  <td style={{padding:'5px 8px',textAlign:'right',fontWeight:700,fontFamily:F,border:'1px solid #c8d4e8',borderTop:'2px solid #1a3a6b'}}>{fmt(itemsGst)}</td>
                  <td style={{padding:'5px 8px',textAlign:'right',fontWeight:800,fontSize:12,fontFamily:F,color:'#1a5c1a',border:'1px solid #c8d4e8',borderTop:'2px solid #1a3a6b'}}>{fmt(itemsNet+itemsGst)}</td>
                </tr>
              </tfoot>}
            </table>
          </div>

          {/* ── ADD-ON ITEMS ── */}
          {addons.length>0&&<>
            <SecHead title="Add-on / Accessory Items" count={addons.length}/>
            <div style={{overflowX:'auto',border:'1px solid #c8d4e8'}}>
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:11,fontFamily:F}}>
                <thead><tr>
                  <TH style={{width:30,textAlign:'center'}}>#</TH>
                  <TH>Description / Item</TH>
                  <TH>Category</TH>
                  <TH style={{width:50,textAlign:'center'}}>Qty</TH>
                  <TH style={{width:55,textAlign:'center'}}>Unit</TH>
                  <TH style={{textAlign:'center'}}>In Price</TH>
                  <TH>Remarks</TH>
                </tr></thead>
                <tbody>
                  {addons.map((a,i)=>(
                    <tr key={i} style={{background:i%2?'#f7f9fd':'#fff'}}>
                      <TD c style={{color:'#aaa'}}>{i+1}</TD>
                      <TD bold>{a.description||a.itemName||'—'}</TD>
                      <TD>{a.category||'—'}</TD>
                      <TD c>{a.qty||'—'}</TD>
                      <TD c>{a.unit||'—'}</TD>
                      <TD c>{a.includedInPrice
                        ?<span style={{background:'#d4edda',color:'#155724',borderRadius:10,padding:'1px 8px',fontSize:10,fontWeight:700}}>Yes</span>
                        :<span style={{background:'#fff3cd',color:'#856404',borderRadius:10,padding:'1px 8px',fontSize:10}}>Separate</span>}
                      </TD>
                      <TD style={{fontSize:10,color:'#555'}}>{a.remarks||'—'}</TD>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>}

          {/* ── ADDITIONAL CHARGES + FINANCIAL SUMMARY ── */}
          {charges.length>0&&<>
            <SecHead title="Additional Charges" count={charges.length}/>
            <div style={{overflowX:'auto',border:'1px solid #c8d4e8'}}>
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:11,fontFamily:F}}>
                <thead><tr>
                  <TH style={{width:30,textAlign:'center'}}>#</TH>
                  <TH style={{width:170}}>Charge Type</TH>
                  <TH>Description</TH>
                  <TH style={{width:90,textAlign:'right'}}>Amount ₹</TH>
                  <TH style={{width:55,textAlign:'center'}}>GST%</TH>
                  <TH style={{width:95,textAlign:'right'}}>Total ₹</TH>
                </tr></thead>
                <tbody>
                  {charges.map((c,i)=>{
                    const a=parseFloat(c.amount)||0,gst=parseFloat(c.gst)||0;
                    return(<tr key={i} style={{background:i%2?'#f7f9fd':'#fff'}}>
                      <TD c style={{color:'#aaa'}}>{i+1}</TD>
                      <TD bold>{c.chargeType||'—'}</TD>
                      <TD style={{fontSize:10,color:'#555'}}>{c.description||'—'}</TD>
                      <TD r>{fmt(a)}</TD>
                      <TD c>{gst?`${gst}%`:'—'}</TD>
                      <TD r bold style={{color:'#1a5c1a'}}>{fmt(a+a*gst/100)}</TD>
                    </tr>);
                  })}
                </tbody>
              </table>
            </div>
          </>}

          {/* ── FINANCIAL SUMMARY ── */}
          <SecHead title="Financial Summary"/>
          <div style={{display:'flex',gap:12,flexWrap:'wrap',alignItems:'flex-start',marginBottom:8}}>
            <div style={{minWidth:260,flex:1,border:'1px solid #c8d4e8'}}>
              {[
                ['Items Sub Total (excl. GST)', fmt(itemsNet)],
                ['GST on Items',                fmt(itemsGst)],
                ...(chgNet>0  ?[['Additional Charges (net)', fmt(chgNet)]]:[] ),
                ...(chgGst>0  ?[['GST on Charges',           fmt(chgGst)]]:[] ),
                ...(o.overallDiscount>0?[['Overall Discount',`− ${fmt(o.overallDiscount)}`]]:[]),
                ...(o.freightCharges>0 ?[['Freight Charges',  fmt(o.freightCharges)]]:[]),
                ...(o.packingCharges>0 ?[['Packing Charges',  fmt(o.packingCharges)]]:[]),
                ...(o.roundOff         ?[['Round Off',        fmt(o.roundOff)]]:[]),
              ].map(([l,v])=>(
                <div key={l} style={{display:'flex',justifyContent:'space-between',padding:'4px 12px',fontSize:11,fontFamily:F,borderBottom:'1px solid #eef1f8',color:'#444'}}>
                  <span>{l}</span><span>{v}</span>
                </div>
              ))}
              <div style={{display:'flex',justifyContent:'space-between',padding:'7px 12px',fontSize:13,fontFamily:F,fontWeight:800,color:'#fff',background:'#1a3a6b'}}>
                <span>GRAND TOTAL</span>
                <span style={{color:'#ffd700'}}>{fmt(grandTotal)}</span>
              </div>
            </div>
            {(o.cgst||o.sgst||o.igst)&&(
              <div style={{minWidth:180,border:'1px solid #c8d4e8'}}>
                <div style={{...SH,padding:'4px 10px',borderLeft:'none'}}>GST Breakup</div>
                {[['CGST',o.cgst],['SGST',o.sgst],['IGST',o.igst]].filter(([,v])=>v).map(([l,v])=>(
                  <div key={l} style={{display:'flex',justifyContent:'space-between',padding:'4px 12px',fontSize:11,fontFamily:F,borderBottom:'1px solid #eef1f8'}}>
                    <span style={{fontWeight:700}}>{l}</span><span>{fmt(v)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── BANK GUARANTEE ── */}
          {bg.applicable&&<>
            <SecHead title="Bank Guarantee Details"/>
            <div style={{border:'1px solid #c8d4e8',maxWidth:600}}>
              {[['Bank Name',bg.bankName],['BG No.',bg.bgNo],['BG %',bg.pct?`${bg.pct}%`:null],
                ['BG Expiry',fmtD(bg.expiry)],['BG Basis',bg.basis==='withGst'?'On Total (incl. GST)':'On Basic (excl. GST)'],
                ['Remarks',bg.remarks]].map(([l,v],i)=>v&&(
                <div key={l} style={{...ROW,background:i%2?'#f6f8fc':'#fff'}}>
                  <span style={{...CELL_L}}>{l}</span>
                  <span style={{...CELL_V,fontWeight:l==='Bank Name'?700:400}}>{v}</span>
                </div>
              ))}
            </div>
          </>}

          {/* ── WARRANTY ── */}
          {warranty.period&&<>
            <SecHead title="Warranty Terms & Details"/>
            <div style={{border:'1px solid #c8d4e8',maxWidth:700}}>
              {[['Warranty Period',warranty.period],['Warranty Type',warranty.type],
                ['Certificate No.',warranty.certNo],['Issued By',warranty.issuedBy],
                ['Start Date',fmtD(warranty.startDate)],['End Date',fmtD(warranty.endDate)]].map(([l,v],i)=>(
                <div key={l} style={{...ROW,background:i%2?'#f6f8fc':'#fff'}}>
                  <span style={{...CELL_L}}>{l}</span>
                  <span style={{...CELL_V,fontWeight:l==='Warranty Period'||l==='End Date'?700:400,color:l==='End Date'?'#b03000':'#111'}}>{val(v)}</span>
                </div>
              ))}
            </div>
            {warranty.terms&&<div style={{marginTop:5,padding:'6px 10px',background:'#fafcff',border:'1px solid #dde4f0',fontSize:11,fontFamily:F,whiteSpace:'pre-wrap',color:'#333'}}>{warranty.terms}</div>}
            {warranty.exclusions&&<div style={{marginTop:4,padding:'6px 10px',background:'#fff8f8',border:'1px solid #f0c0c0',fontSize:11,fontFamily:F,whiteSpace:'pre-wrap',color:'#5a0000'}}><strong>Exclusions:</strong> {warranty.exclusions}</div>}
          </>}

          {/* ── SCOPE OF WORK ── */}
          {scopes.length>0&&<>
            <SecHead title="List of Scope of Work" count={scopes.length}/>
            <div style={{overflowX:'auto',border:'1px solid #c8d4e8'}}>
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:11,fontFamily:F}}>
                <thead><tr>
                  <TH style={{width:30,textAlign:'center'}}>#</TH>
                  <TH>Scope Item / Activity</TH>
                  <TH style={{width:100,textAlign:'center'}}>Client Scope</TH>
                  <TH style={{width:100,textAlign:'center'}}>Our Scope</TH>
                  <TH>Remarks</TH>
                </tr></thead>
                <tbody>
                  {scopes.map((s,i)=>(
                    <tr key={i} style={{background:i%2?'#f7f9fd':'#fff'}}>
                      <TD c style={{color:'#aaa'}}>{i+1}</TD>
                      <TD bold>{s.item||s.scope||s.description||'—'}</TD>
                      <TD c>{s.clientScope?<span style={{color:'#1a5c1a',fontWeight:900,fontSize:14}}>✔</span>:<span style={{color:'#ccc'}}>—</span>}</TD>
                      <TD c>{s.ourScope!==false?<span style={{color:'#1a3a6b',fontWeight:900,fontSize:14}}>✔</span>:<span style={{color:'#ccc'}}>—</span>}</TD>
                      <TD style={{fontSize:10,color:'#555'}}>{s.remarks||'—'}</TD>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>}

          {/* ── ACTIVITIES ── */}
          {activities.length>0&&<>
            <SecHead title="Activities / Task List" count={activities.length}/>
            <div style={{overflowX:'auto',border:'1px solid #c8d4e8'}}>
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:11,fontFamily:F,minWidth:650}}>
                <thead><tr>
                  <TH style={{width:30,textAlign:'center'}}>#</TH>
                  <TH style={{minWidth:160}}>Task / Activity</TH>
                  <TH style={{width:120}}>Assigned To</TH>
                  <TH style={{width:85,textAlign:'center'}}>Start Date</TH>
                  <TH style={{width:85,textAlign:'center'}}>End Date</TH>
                  <TH style={{width:100,textAlign:'center'}}>Status</TH>
                  <TH>Remarks</TH>
                </tr></thead>
                <tbody>
                  {activities.map((a,i)=>{
                    const sc={'Pending':{bg:'#fff3cd',c:'#856404'},'In Progress':{bg:'#d1ecf1',c:'#0c5460'},'Completed':{bg:'#d4edda',c:'#155724'},'On Hold':{bg:'#e2e3e5',c:'#383d41'},'Cancelled':{bg:'#f8d7da',c:'#721c24'}}[a.status]||{bg:'#eee',c:'#333'};
                    return(<tr key={i} style={{background:i%2?'#f7f9fd':'#fff'}}>
                      <TD c style={{color:'#aaa'}}>{i+1}</TD>
                      <TD bold>{a.task||a.description||'—'}</TD>
                      <TD>{a.assignedTo||'—'}</TD>
                      <TD c style={{whiteSpace:'nowrap'}}>{fmtD(a.startDate)||'—'}</TD>
                      <TD c style={{whiteSpace:'nowrap'}}>{fmtD(a.endDate)||'—'}</TD>
                      <TD c><span style={{background:sc.bg,color:sc.c,borderRadius:10,padding:'2px 8px',fontSize:10,fontWeight:700}}>{a.status||'Pending'}</span></TD>
                      <TD style={{fontSize:10,color:'#555'}}>{a.remarks||'—'}</TD>
                    </tr>);
                  })}
                </tbody>
              </table>
            </div>
          </>}

          {/* ── TERMS & NOTES ── */}
          {(o.termsConditions||o.customerNotes||o.internalNotes||o.narration)&&<>
            <SecHead title="Terms, Notes & Conditions"/>
            {o.termsConditions&&<div style={{marginBottom:6}}>
              <div style={{fontSize:10,fontWeight:700,color:'#445',marginBottom:2}}>Terms & Conditions</div>
              <div style={{padding:'6px 10px',background:'#fafcff',border:'1px solid #dde4f0',fontSize:11,fontFamily:F,whiteSpace:'pre-wrap',color:'#333'}}>{o.termsConditions}</div>
            </div>}
            {o.customerNotes&&<div style={{marginBottom:6}}>
              <div style={{fontSize:10,fontWeight:700,color:'#445',marginBottom:2}}>Notes to Customer</div>
              <div style={{padding:'6px 10px',background:'#fafcff',border:'1px solid #dde4f0',fontSize:11,fontFamily:F,whiteSpace:'pre-wrap',color:'#333'}}>{o.customerNotes}</div>
            </div>}
            {(o.internalNotes||o.narration)&&<div style={{marginBottom:6}}>
              <div style={{fontSize:10,fontWeight:700,color:'#445',marginBottom:2}}>Internal Notes</div>
              <div style={{padding:'6px 10px',background:'#fffdf0',border:'1px solid #e8d880',fontSize:11,fontFamily:F,whiteSpace:'pre-wrap',color:'#555'}}>{o.internalNotes||o.narration}</div>
            </div>}
          </>}

          {/* ── ATTACHMENTS WITH INLINE PDF VIEWER ── */}
          {attachments.length>0&&<>
            <SecHead title="Attachments — Documents & PDFs" count={attachments.length}/>
            <div style={{display:'flex',flexDirection:'column',gap:10}}>
              {attachments.map((a,i)=>{
                const fileName = a.fileName||a.name||'';
                const isPdf    = fileName.toLowerCase().endsWith('.pdf');
                const isImg    = /\.(png|jpg|jpeg|gif|bmp|webp)$/i.test(fileName);
                const dlUrl    = companyId&&o.orderId&&fileName
                  ? `/api/sales-orders/${o.orderId}/download/${encodeURIComponent(fileName)}?companyId=${companyId}`
                  : null;
                const viewUrl  = dlUrl ? dlUrl + '&inline=1' : null;
                return (
                  <div key={i} style={{border:'1px solid #c8d4e8',borderLeft:'4px solid #1a3a6b'}}>
                    {/* header row */}
                    <div style={{display:'flex',alignItems:'center',gap:10,padding:'7px 12px',background:'#f6f8fc'}}>
                      <span style={{background:'#1a3a6b',color:'#fff',borderRadius:'50%',width:22,height:22,display:'flex',alignItems:'center',justifyContent:'center',fontSize:10,fontWeight:700,flexShrink:0}}>{i+1}</span>
                      <span style={{fontSize:16,flexShrink:0}}>{isPdf?'📄':isImg?'🖼️':'📎'}</span>
                      <div style={{flex:1}}>
                        <div style={{fontSize:12,fontWeight:700,color:'#1a3a6b'}}>{a.name||fileName||`Document ${i+1}`}</div>
                        {a.filePath&&<div style={{fontSize:9,color:'#888',marginTop:1}}>{a.filePath}</div>}
                      </div>
                      {dlUrl&&<a href={dlUrl} target="_blank" rel="noopener noreferrer"
                        style={{background:'#1a3a6b',color:'#fff',padding:'4px 12px',fontSize:10,fontWeight:700,textDecoration:'none',flexShrink:0}}>
                        ⬇ Download
                      </a>}
                    </div>
                    {/* inline PDF */}
                    {isPdf&&viewUrl&&(
                      <iframe src={viewUrl} title={fileName}
                        style={{width:'100%',height:600,border:'none',display:'block',background:'#f0f0f0'}}/>
                    )}
                    {/* inline image */}
                    {isImg&&viewUrl&&(
                      <div style={{padding:8,textAlign:'center',background:'#f0f4f8'}}>
                        <img src={viewUrl} alt={fileName} style={{maxWidth:'100%',maxHeight:400,border:'1px solid #ccd4e8'}}/>
                      </div>
                    )}
                    {!isPdf&&!isImg&&!dlUrl&&(
                      <div style={{padding:'6px 12px',fontSize:10,color:'#aaa',fontStyle:'italic'}}>File not available for preview.</div>
                    )}
                  </div>
                );
              })}
            </div>
          </>}

        </div>{/* end scroll body */}

        {/* ══ FOOTER ACTIONS ══ */}
        <div style={{padding:'7px 14px',borderTop:'2px solid #e0e8f0',display:'flex',justifyContent:'space-between',alignItems:'center',background:'#f4f6fa',flexShrink:0}}>
          <span style={{fontSize:10,color:'#888',fontFamily:F}}>Order #{o.orderId} · {o.customerName||o.party||'—'} · {fmt(grandTotal)}</span>
          <div style={{display:'flex',gap:8}}>
            <Btn onClick={()=>printSalesOrder(o, selectedCompany)}>🖨️ Print / PDF</Btn>
            <Btn onClick={onClose}>Close</Btn>
            {onReject  && <Btn v="dan" onClick={()=>onReject(o.orderId)}>✕ Reject</Btn>}
            {onApprove && <Btn v="suc" onClick={()=>onApprove(o.orderId)}>✔ Approve</Btn>}
          </div>
        </div>

      </div>
    </div>
  );
}

function ViewTab({ companyId, onEdit }) {
  const [orders,   setOrders]   = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [q,        setQ]        = useState('');
  const [selected, setSelected] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await api(`/api/sales-orders?companyId=${companyId}`);
          setOrders((r.data||[]).sort((a,b)=>b.orderId-a.orderId)); } catch{}
    setLoading(false);
  },[companyId]);

  const handleDelete = async (orderId) => {
    if (!window.confirm(`Delete order ${orderId}? This cannot be undone.`)) return;
    try {
      await api(`/api/sales-orders/${orderId}?companyId=${companyId}`, { method: 'DELETE' });
      load();
    } catch(e) { alert('Delete failed: ' + e.message); }
  };

  useEffect(()=>{ if(companyId) load(); },[load]);

  const filtered = q ? orders.filter(o=>
    (o.customerName||'').toLowerCase().includes(q.toLowerCase()) ||
    String(o.orderId).includes(q) || (o.orderNo||'').toLowerCase().includes(q.toLowerCase()))
    : orders;

  return (
    <div style={{display:'flex',flexDirection:'column',flex:1,overflow:'hidden'}}>
      {selected && <OrderModal order={selected} companyId={companyId} onClose={()=>setSelected(null)} />}
      <div style={{background:'#f0f0f0',borderBottom:`1px solid ${B}`,padding:'4px 8px',display:'flex',alignItems:'center',gap:6,flexShrink:0}}>
        <div style={{display:'flex',alignItems:'center',border:'1px solid #888',background:W,height:24,padding:'0 6px',gap:4}}>
          <span style={{fontSize:11,color:'#555'}}>🔍</span>
          <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search order / client…"
            style={{border:'none',outline:'none',fontSize:11,fontFamily:F,width:200,background:'transparent'}}/>
          {q&&<button onClick={()=>setQ('')} style={{background:'none',border:'none',cursor:'pointer',fontSize:12,color:'#888'}}>✕</button>}
        </div>
        <Btn onClick={load}>🔄 Refresh</Btn>
        <span style={{marginLeft:'auto',fontSize:10,color:'#555'}}>{filtered.length} order{filtered.length!==1?'s':''}</span>
      </div>
      <div style={{flex:1,overflow:'auto',background:W}}>
        {loading
          ? <div style={{padding:20,textAlign:'center',color:N,fontSize:12,fontFamily:F}}>Loading orders…</div>
          : (
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:11,fontFamily:F}}>
            <thead style={{position:'sticky',top:0,zIndex:2}}>
              <tr style={{background:N}}>
                {['Order ID','Order No.','Date','Customer','Client PO','Status','Total ₹','Actions'].map((h,i)=>(
                  <th key={i} style={{padding:'4px 8px',color:W,fontWeight:700,fontSize:10,textAlign:'left',borderRight:'1px solid #2a5a8a',whiteSpace:'nowrap'}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length===0 && (
                <tr><td colSpan={8} style={{padding:'18px',textAlign:'center',color:'#666',fontFamily:F}}>No orders found</td></tr>
              )}
              {filtered.map((o,i)=>(
                <tr key={o.orderId} style={{background:i%2===0?W:'#f5f8fc',cursor:'pointer'}}
                  onMouseEnter={e=>(e.currentTarget.style.background='#d0e4f8')}
                  onMouseLeave={e=>(e.currentTarget.style.background=i%2===0?W:'#f5f8fc')}>
                  <td style={{padding:'3px 8px',border:'1px solid #e0e0e0',fontWeight:700,color:N}}>{o.orderId}</td>
                  <td style={{padding:'3px 8px',border:'1px solid #e0e0e0'}}>{o.orderNo||'—'}</td>
                  <td style={{padding:'3px 8px',border:'1px solid #e0e0e0',whiteSpace:'nowrap'}}>{o.orderDate||o.date||'—'}</td>
                  <td style={{padding:'3px 8px',border:'1px solid #e0e0e0',fontWeight:700}}>{o.customerName||o.party||'—'}</td>
                  <td style={{padding:'3px 8px',border:'1px solid #e0e0e0'}}>{o.customerPO||o.reference||'—'}</td>
                  <td style={{padding:'3px 8px',border:'1px solid #e0e0e0'}}><Badge s={o.status}/></td>
                  <td style={{padding:'3px 8px',border:'1px solid #e0e0e0',textAlign:'right',fontWeight:700,color:'#005500'}}>{fmt(o.grandTotal)}</td>
                  <td style={{padding:'3px 8px',border:'1px solid #e0e0e0'}}>
                    <div style={{display:'flex',gap:4}}>
                      <Btn small onClick={()=>setSelected(o)}>👁 View</Btn>
                      <Btn small onClick={()=>onEdit(o)}>✏ Edit</Btn>
                      <Btn v="dan" small onClick={()=>handleDelete(o.orderId)}>🗑 Delete</Btn>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════ PENDING TAB ═══════════════════════ */
function PendingTab({ companyId }) {
  const [orders,   setOrders]   = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [msg,      setMsg]      = useState('');
  const [selected, setSelected] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await api(`/api/sales-orders?companyId=${companyId}`);
          setOrders((r.data||[]).filter(o=>o.status==='pending'||o.status==='draft').sort((a,b)=>b.orderId-a.orderId)); } catch{}
    setLoading(false);
  },[companyId]);

  useEffect(()=>{ if(companyId) load(); },[load]);

  const action = async(orderId, status) => {
    try {
      const fd = new FormData(); fd.append('status',status);
      await api(`/api/sales-orders/${orderId}?companyId=${companyId}`,{method:'PUT',data:fd});
      setMsg(`Order ${orderId} ${status}`); load();
    } catch(e) { setMsg('Error: '+e.message); }
  };

  const handleApprove = async (orderId) => {
    await action(orderId, 'approved');
    setSelected(null);
  };
  const handleReject = async (orderId) => {
    await action(orderId, 'rejected');
    setSelected(null);
  };

  return (
    <div style={{display:'flex',flexDirection:'column',flex:1,overflow:'hidden'}}>
      {selected && <OrderModal order={selected} companyId={companyId} onClose={()=>setSelected(null)} onApprove={handleApprove} onReject={handleReject} />}
      <div style={{background:'#f0f0f0',borderBottom:`1px solid ${B}`,padding:'4px 8px',display:'flex',alignItems:'center',gap:6,flexShrink:0}}>
        <span style={{fontSize:11,fontWeight:700,color:N,fontFamily:F}}>Pending / Draft Sales Orders — Approval Queue</span>
        <Btn onClick={load} style={{marginLeft:'auto'}}>🔄 Refresh</Btn>
      </div>
      {msg && <div style={{padding:'3px 8px',background:'#d8f0d8',borderBottom:'1px solid #44aa44',fontSize:11,color:'#005500',fontWeight:700,fontFamily:F}}>{msg}</div>}
      <div style={{flex:1,overflow:'auto',background:W}}>
        {loading ? <div style={{padding:20,textAlign:'center',color:N,fontSize:12,fontFamily:F}}>Loading…</div> : (
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:11,fontFamily:F}}>
            <thead style={{position:'sticky',top:0,zIndex:2}}>
              <tr style={{background:N}}>
                {['Order ID','Date','Customer','Client PO','Total ₹','Status','Actions'].map((h,i)=>(
                  <th key={i} style={{padding:'4px 8px',color:W,fontWeight:700,fontSize:10,textAlign:'left',borderRight:'1px solid #2a5a8a',whiteSpace:'nowrap'}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {orders.length===0 && <tr><td colSpan={7} style={{padding:'18px',textAlign:'center',color:'#666',fontFamily:F}}>No pending orders</td></tr>}
              {orders.map((o,i)=>(
                <tr key={o.orderId} style={{background:i%2===0?W:'#f5f8fc',cursor:'pointer'}}
                  onClick={()=>setSelected(o)}
                  onMouseEnter={e=>(e.currentTarget.style.background='#d0e4f8')}
                  onMouseLeave={e=>(e.currentTarget.style.background=i%2===0?W:'#f5f8fc')}>
                  <td style={{padding:'3px 8px',border:'1px solid #e0e0e0',fontWeight:700,color:N}}>{o.orderId}</td>
                  <td style={{padding:'3px 8px',border:'1px solid #e0e0e0',whiteSpace:'nowrap'}}>{o.orderDate||o.date||'—'}</td>
                  <td style={{padding:'3px 8px',border:'1px solid #e0e0e0',fontWeight:700}}>{o.customerName||o.party||'—'}</td>
                  <td style={{padding:'3px 8px',border:'1px solid #e0e0e0'}}>{o.customerPO||o.reference||'—'}</td>
                  <td style={{padding:'3px 8px',border:'1px solid #e0e0e0',textAlign:'right',fontWeight:700}}>{fmt(o.grandTotal)}</td>
                  <td style={{padding:'3px 8px',border:'1px solid #e0e0e0'}}><Badge s={o.status}/></td>
                  <td style={{padding:'3px 8px',border:'1px solid #e0e0e0'}} onClick={e=>e.stopPropagation()}>
                    <div style={{display:'flex',gap:4}}>
                      <Btn small onClick={()=>setSelected(o)}>👁 View</Btn>
                      <Btn v="suc" small onClick={()=>action(o.orderId,'approved')}>✔ Approve</Btn>
                      <Btn v="dan" small onClick={()=>action(o.orderId,'rejected')}>✕ Reject</Btn>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   MAIN MODULE
════════════════════════════════════════════════════════════ */
export default function SalesOrderModule() {
  const { selectedCompany } = useCompany();
  const cid = selectedCompany?.companyId || '';
  const { pathname } = useLocation();
  const navigate = useNavigate();

  /* derive tab from URL */
  const tab = pathname.includes('/view') ? 'view'
            : pathname.includes('/pending') ? 'pending'
            : 'create';

  const [editOrder, setEditOrder] = useState(null);

  /* inner section tab */
  const [secTab, setSecTab] = useState('order-details');

  /* form state */
  const blankForm = () => ({
    nextId:'', orderNo:'', companyRefDate:today(), clientOrderNo:'', clientOrderDate:'',
    clientId:'', customerName:'', customerGstin:'', contactPerson:'', mobile:'', email:'',
    address:'', customerCity:'', customerState:'', customerPincode:'',
    shipToName:'', shipToAddress:'', shipToCity:'', shipToState:'', shipToPincode:'',
    shipToContact:'', shipToMobile:'', shipToEmail:'',
    deliveryDate:'', paymentTerms:'Net 30', salesPerson:'', orderType:'',
    dispatchMode:'', transporterName:'', vehicleNumber:'', notes:'',
  });
  const [form,        setForm]        = useState(blankForm());
  const [items,       setItems]       = useState([]);
  const [addons,      setAddons]      = useState([]);
  const [charges,     setCharges]     = useState([]);
  const [bg,          setBg]          = useState({applicable:false,basis:'basic',pct:0,bankName:'',bgNo:'',expiry:'',remarks:''});
  const [scopes,      setScopes]      = useState([]);
  const [warranty,    setWarranty]    = useState({});
  const [activities,  setActivities]  = useState([]);
  const [attachments, setAttachments] = useState([]);

  /* clients */
  const [clients,    setClients]    = useState([]);
  const [showSearch, setShowSearch] = useState(false);

  /* ui state */
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');
  const [ok,     setOk]     = useState('');

  /* totals */
  const itemsGrand   = items.reduce((s,it)=>{const sub=(parseFloat(it.qty)||0)*(parseFloat(it.rate)||0);return s+sub+sub*(parseFloat(it.gst)||0)/100;},0);
  const chargesGrand = charges.reduce((s,ch)=>{const a=parseFloat(ch.amount)||0;return s+a+a*(parseFloat(ch.gst)||0)/100;},0);
  const orderValue   = itemsGrand+chargesGrand;

  const setF = (k,v) => setForm(p=>({...p,[k]:v}));

  /* load next ID + clients */
  useEffect(()=>{
    if (!cid) return;
    api(`/api/sales-orders/next-id?companyId=${cid}`).then(r=>setF('nextId',r.data.nextId)).catch(()=>{});
    api(`/api/clients?companyId=${cid}`).then(r=>setClients(r.data||[])).catch(()=>{});
  },[cid]);

  const resetForm = () => {
    setForm(blankForm()); setItems([]); setAddons([]); setCharges([]);
    setBg({applicable:false,basis:'basic',pct:0}); setScopes([]);
    setWarranty({}); setActivities([]); setAttachments([]);
    setError(''); setOk(''); setSecTab('order-details');
    api(`/api/sales-orders/next-id?companyId=${cid}`).then(r=>setF('nextId',r.data.nextId)).catch(()=>{});
  };

  const loadEdit = (o) => {
    setForm({
      nextId:o.orderId, orderNo:o.orderNo||'', companyRefDate:o.orderDate||today(),
      clientOrderNo:o.customerPO||'', clientOrderDate:o.poDate||'',
      clientId:o.customerCode||'', customerName:o.customerName||'',
      customerGstin:o.customerGstin||'', contactPerson:o.contactPerson||'',
      mobile:o.mobile||'', email:o.email||'', address:o.address||'',
      customerCity:o.customerCity||'', customerState:o.customerState||'', customerPincode:o.customerPincode||'',
      shipToName:o.shipToName||'', shipToAddress:o.shipToAddress||o.deliveryAddr||'',
      shipToCity:o.shipToCity||'', shipToState:o.shipToState||'', shipToPincode:o.shipToPincode||'',
      shipToContact:o.shipToContact||'', shipToMobile:o.shipToMobile||'', shipToEmail:o.shipToEmail||'',
      deliveryDate:o.deliveryDate||'', paymentTerms:o.paymentTerms||'Net 30',
      salesPerson:o.salesPerson||'', orderType:o.orderType||'',
      dispatchMode:o.dispatchMode||o.shippedBy||'',
      transporterName:o.transporterName||'', vehicleNumber:o.vehicleNumber||'',
      notes:o.internalNotes||'',
    });
    setItems((o.items||[]).map(it=>({...it,_id:it._id||uid()})));
    setAddons((o.addons||[]).map(a=>({...a,_id:a._id||uid()})));
    setCharges((o.charges||[]).map(c=>({...c,_id:c._id||uid()})));
    setScopes((o.scopeItems||[]).map(s=>({...s,_id:s._id||uid()})));
    setActivities((o.tasks||[]).map(a=>({...a,_id:a._id||uid()})));
    setAttachments((o.attachments||[]).map(a=>({...a,_id:a._id||uid()})));
    setEditOrder(o); setSecTab('order-details');
    setError(''); setOk('');
    navigate('/sales-order/create');
  };

  const handleClientSelect = (c) => {
    const cp = (c.contactPersons||[])[0] || {};
    setF('clientId',       c.clientId||'');
    setF('customerName',   c.companyName||c.clientName||c.name||'');
    setF('customerGstin',  c.gstin||c.gstNumber||'');
    setF('contactPerson',  c.contactPerson||cp.name||cp.contactName||'');
    setF('mobile',         c.mobile||c.phone||cp.mobile||cp.phone||'');
    setF('email',          c.email||cp.email||'');
    setF('address',        c.address||c.billingAddress||'');
    setF('customerCity',   c.city||c.billingCity||'');
    setF('customerState',  c.state||c.billingState||'');
    setF('customerPincode',c.pincode||c.billingPincode||'');
    /* Pre-fill Ship To from client billing if ship-to is empty */
    setF('shipToName',    c.companyName||c.clientName||c.name||'');
    setF('shipToAddress', c.address||'');
    setF('shipToCity',    c.city||'');
    setF('shipToState',   c.state||'');
    setF('shipToPincode', c.pincode||'');
    setF('shipToContact', c.contactPerson||cp.name||cp.contactName||'');
    setF('shipToMobile',  c.mobile||c.phone||cp.mobile||cp.phone||'');
    setF('shipToEmail',   c.email||cp.email||'');
    setShowSearch(false);
  };

  const submit = async (status) => {
    if (!form.customerName.trim()) { setError('Customer Name is required'); setSecTab('order-details'); return; }
    setSaving(true); setError(''); setOk('');
    try {
      const fd = new FormData();
      fd.append('orderNo',       form.orderNo||`SO-${form.nextId}`);
      fd.append('orderDate',     form.companyRefDate);
      fd.append('customerName',   form.customerName);
      fd.append('customerCode',   form.clientId);
      fd.append('customerGstin',  form.customerGstin);
      fd.append('contactPerson',  form.contactPerson);
      fd.append('mobile',         form.mobile);
      fd.append('email',          form.email);
      fd.append('address',        form.address||'');
      fd.append('customerCity',   form.customerCity||'');
      fd.append('customerState',  form.customerState||'');
      fd.append('customerPincode',form.customerPincode||'');
      fd.append('shipToName',     form.shipToName||'');
      fd.append('shipToAddress',  form.shipToAddress||'');
      fd.append('shipToCity',     form.shipToCity||'');
      fd.append('shipToState',    form.shipToState||'');
      fd.append('shipToPincode',  form.shipToPincode||'');
      fd.append('shipToContact',  form.shipToContact||'');
      fd.append('shipToMobile',   form.shipToMobile||'');
      fd.append('shipToEmail',    form.shipToEmail||'');
      fd.append('customerPO',     form.clientOrderNo);
      fd.append('poDate',         form.clientOrderDate);
      fd.append('deliveryDate',   form.deliveryDate);
      fd.append('paymentTerms',   form.paymentTerms);
      fd.append('salesPerson',    form.salesPerson||'');
      fd.append('orderType',      form.orderType||'');
      fd.append('dispatchMode',   form.dispatchMode||'');
      fd.append('transporterName',form.transporterName||'');
      fd.append('vehicleNumber',  form.vehicleNumber||'');
      fd.append('internalNotes',  form.notes);
      fd.append('status',        status);
      fd.append('grandTotal',    orderValue);
      fd.append('items',         JSON.stringify(items.map(({_id,...r})=>r)));
      fd.append('addons',        JSON.stringify(addons.map(({_id,...r})=>r)));
      fd.append('charges',       JSON.stringify(charges.map(({_id,...r})=>r)));
      fd.append('scopeItems',    JSON.stringify(scopes.map(({_id,...r})=>r)));
      fd.append('tasks',         JSON.stringify(activities.map(({_id,...r})=>r)));
      fd.append('bankGuarantee', JSON.stringify(bg));
      fd.append('warranty',      JSON.stringify(warranty));
      attachments.forEach(a=>{ if(a.file) fd.append('attachmentFiles',a.file); });
      fd.append('attachments',   JSON.stringify(attachments.map(({_id,file,...r})=>({...r,fileName:file?.name||r.fileName||''}))));

      if (editOrder) {
        await api(`/api/sales-orders/${editOrder.orderId}?companyId=${cid}`,{method:'PUT',data:fd});
        setOk(`Order ${editOrder.orderId} updated successfully`);
        setEditOrder(null);
      } else {
        const res = await api(`/api/sales-orders?companyId=${cid}`,{method:'POST',data:fd});
        setOk(`Sales Order ${res.data.orderId} created successfully`);
        resetForm();
      }
    } catch(e) { setError(e.response?.data?.error||e.message); }
    setSaving(false);
  };

  /* section nav helpers */
  const secIdx  = INNER_TABS.findIndex(t=>t.id===secTab);
  const goNext  = () => { if(secIdx < INNER_TABS.length-1) setSecTab(INNER_TABS[secIdx+1].id); };
  const goPrev  = () => { if(secIdx > 0) setSecTab(INNER_TABS[secIdx-1].id); };
  const isFirst = secIdx === 0;
  const isLast  = secIdx === INNER_TABS.length-1;

  /* ─── RENDER ─── */
  return (
    <div style={{display:'flex',flexDirection:'column',height:'100%',background:'#fff',fontFamily:F,overflow:'hidden'}}>


      {/* ══ CREATE / EDIT TAB ══ */}
      {tab==='create' && (
        <>
          {/* Inner Section Tab Bar */}
          <SectionTabBar active={secTab} onChange={setSecTab}/>

          {/* Messages */}
          {error && <div style={{padding:'3px 10px',background:'#ffe0e0',borderBottom:'1px solid #cc4444',
            fontSize:11,color:R,fontWeight:700,flexShrink:0}}>⊗ {error}</div>}
          {ok && <div style={{padding:'3px 10px',background:'#d8f0d8',borderBottom:'1px solid #44aa44',
            fontSize:11,color:'#005500',fontWeight:700,flexShrink:0}}>✔ {ok}</div>}

          {/* Section Content */}
          <div style={{flex:1,overflowY:'auto',background:'#f0f0f0'}}>

            {secTab==='order-details'   && <TabOrderDetails   form={form} setF={setF} showSearch={showSearch} setShowSearch={setShowSearch}/>}
            {secTab==='item-details'    && <TabItemDetails    items={items} setItems={setItems}/>}
            {secTab==='addon-items'     && <TabAddonItems     addons={addons} setAddons={setAddons}/>}
            {secTab==='charges'         && <TabCharges        charges={charges} setCharges={setCharges}/>}
            {secTab==='bank-guarantee'  && <TabBankGuarantee  orderValue={orderValue} bg={bg} setBg={setBg}/>}
            {secTab==='scope'           && <TabScope          scopes={scopes} setScopes={setScopes}/>}
            {secTab==='warranty'        && <TabWarranty       warranty={warranty} setWarranty={setWarranty}/>}
            {secTab==='activities'      && <TabActivities     activities={activities} setActivities={setActivities}/>}
            {secTab==='attachments'     && <TabAttachments    attachments={attachments} setAttachments={setAttachments}/>}

          </div>

          {/* Order Value Strip */}
          <OrderSummaryStrip items={items} charges={charges}/>

          {/* Bottom Action Bar */}
          <div style={{background:'#e8eaed',borderTop:`1px solid ${B}`,padding:'4px 8px',
            display:'flex',alignItems:'center',gap:4,flexShrink:0}}>

            {/* Prev / Next */}
            <button onClick={goPrev} disabled={isFirst}
              style={{background:isFirst?'#e0e0e0':'#c8d8ea',color:isFirst?'#aaa':N,
                border:`1px solid ${isFirst?'#ccc':N}`,padding:'1px 12px',fontSize:11,
                cursor:isFirst?'default':'pointer',fontFamily:F,fontWeight:700,height:22}}>
              ← Prev
            </button>
            <span style={{fontSize:10,color:'#666',minWidth:90,textAlign:'center'}}>
              {secIdx+1} / {INNER_TABS.length} — {INNER_TABS[secIdx].label}
            </span>
            <button onClick={goNext} disabled={isLast}
              style={{background:isLast?'#e0e0e0':'#c8d8ea',color:isLast?'#aaa':N,
                border:`1px solid ${isLast?'#ccc':N}`,padding:'1px 12px',fontSize:11,
                cursor:isLast?'default':'pointer',fontFamily:F,fontWeight:700,height:22}}>
              Next →
            </button>

            <Sep/>

            {/* Save Actions */}
            <Btn v="pri" onClick={()=>submit('approved')} disabled={saving}>
              {saving?'Saving…':'💾 Save & Approve'}
            </Btn>
            <Btn onClick={()=>submit('draft')} disabled={saving}>Save as Draft</Btn>
            <Btn onClick={()=>submit('pending')} disabled={saving}>Submit for Approval</Btn>

            <Sep/>
            <Btn onClick={resetForm} disabled={saving}>🗑 Clear</Btn>
          </div>
        </>
      )}

      {/* ══ VIEW/EDIT TAB ══ */}
      {tab==='view' && <ViewTab companyId={cid} onEdit={loadEdit}/>}

      {/* ══ PENDING TAB ══ */}
      {tab==='pending' && <PendingTab companyId={cid}/>}


      {/* Client Search Popup */}
      {showSearch && <ClientSearch clients={clients} onSelect={handleClientSelect} onClose={()=>setShowSearch(false)}/>}
    </div>
  );
}
