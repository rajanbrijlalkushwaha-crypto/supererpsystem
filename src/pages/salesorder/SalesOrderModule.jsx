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
const N  = '#2563EB';
const ND = '#1D4ED8';
const W  = '#ffffff';
const B  = '#E2E8F0';
const R  = '#DC2626';
const F  = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

/* ── helpers ── */
const api  = (url, cfg={}) => axios({url, ...cfg});
const fmt  = n => `₹${(n||0).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
const today= () => new Date().toISOString().slice(0,10);
const uid  = () => Date.now() + Math.random();

/* ═══════════════════════ PRIMITIVES ═══════════════════════ */

const BD = '#D1D5DB';
function Btn({ children, onClick, v='def', disabled, type, title, small }) {
  const s = {
    def: { bg:'#F9FAFB', color:'#374151', border:BD },
    pri: { bg:'#EEF4FF', color:N,         border:'#BFDBFE' },
    dan: { bg:'#FEF2F2', color:'#DC2626', border:'#FECACA' },
    suc: { bg:'#ECFDF5', color:'#059669', border:'#A7F3D0' },
  }[v] || { bg:'#F9FAFB', color:'#374151', border:BD };
  return (
    <button type={type||'button'} onClick={onClick} disabled={disabled} title={title}
      style={{
        background: disabled ? '#F9FAFB' : s.bg,
        border: `1px solid ${disabled ? BD : s.border}`,
        color: disabled ? '#9CA3AF' : s.color,
        padding: small ? '0 8px' : '0 12px',
        height: small ? 24 : 28,
        fontSize: small ? 11 : 12, fontFamily: F, fontWeight: 600,
        cursor: disabled ? 'default' : 'pointer', borderRadius: 5,
        whiteSpace: 'nowrap', opacity: disabled ? 0.7 : 1,
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
        height:28, padding:'0 8px', border:`1px solid #9CA3AF`, borderRadius:4,
        fontSize:12, fontFamily:F, color:'#111827',
        background: readOnly?'#F9FAFB': disabled?'#F3F4F6': W,
        outline:'none', width:'100%', boxSizing:'border-box', ...style,
      }}
      onFocus={e=>{ if(!readOnly&&!disabled) { e.target.style.borderColor=N; e.target.style.boxShadow=`0 0 0 2px rgba(37,99,235,0.15)`; } }}
      onBlur={e=>{ e.target.style.borderColor='#D1D5DB'; e.target.style.boxShadow='none'; }}
    />
  );
}

function Sel({ value, onChange, options=[], disabled, style }) {
  return (
    <select value={value} onChange={onChange} disabled={disabled}
      style={{
        height:28, padding:'0 8px', border:`1px solid #9CA3AF`, borderRadius:4,
        fontSize:12, fontFamily:F, color:'#111827',
        background:disabled?'#F3F4F6':W,
        outline:'none', width:'100%', boxSizing:'border-box',
        cursor:'pointer', ...style,
      }}
      onFocus={e=>{ e.target.style.borderColor=N; e.target.style.boxShadow=`0 0 0 2px rgba(37,99,235,0.15)`; }}
      onBlur={e=>{ e.target.style.borderColor='#D1D5DB'; e.target.style.boxShadow='none'; }}
    >
      {options.map((o,i)=><option key={i} value={o.value??o}>{o.label??o}</option>)}
    </select>
  );
}

function Txt({ value, onChange, placeholder, rows=3 }) {
  return (
    <textarea value={value??''} onChange={onChange} placeholder={placeholder} rows={rows}
      style={{
        width:'100%', padding:'5px 8px', border:'1px solid #D1D5DB', borderRadius:5,
        fontSize:12, fontFamily:F, color:'#111827', background:W,
        resize:'vertical', outline:'none', boxSizing:'border-box', lineHeight:1.5,
      }}
      onFocus={e=>{ e.target.style.borderColor=N; e.target.style.boxShadow=`0 0 0 2px rgba(37,99,235,0.15)`; }}
      onBlur={e=>{ e.target.style.borderColor='#D1D5DB'; e.target.style.boxShadow='none'; }}
    />
  );
}

/* label + field row */
function FR({ label, children, w=130, req }) {
  return (
    <div style={{display:'flex',alignItems:'center',minHeight:30,borderBottom:'1px solid #CBD5E1',padding:'2px 6px',background:'#fff'}}>
      <label style={{fontSize:11.5,fontWeight:700,color:'#000000',minWidth:w,maxWidth:w,
        padding:'0 8px 0 0',textAlign:'left',flexShrink:0}}>
        {label}{req&&<span style={{color:R,marginLeft:2}}>*</span>}
      </label>
      <div style={{flex:1,display:'flex',gap:4,alignItems:'center'}}>{children}</div>
    </div>
  );
}

/* section panel header */
function PH({ title }) {
  return (
    <div style={{background:'#F1F5F9',color:'#1E293B',fontSize:12,fontWeight:700,
      padding:'6px 12px',letterSpacing:0.2,borderBottom:`1px solid ${BD}`}}>
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
  { id:'order-details',  label:'Order Details',   icon:'📋' },
  { id:'item-details',   label:'Item Details',    icon:'📦' },
  { id:'addon-items',    label:'Add-on Items',    icon:'➕' },
  { id:'charges',        label:'Addl. Charges',   icon:'💰' },
  { id:'bank-guarantee', label:'Bank Guarantee',  icon:'🏦' },
  { id:'scope',          label:'Scope of Work',   icon:'📝' },
  { id:'warranty',       label:'Warranty',        icon:'🛡️' },
  { id:'activities',     label:'Activities',      icon:'⚡' },
  { id:'attachments',    label:'Attachments',     icon:'📎' },
  { id:'specs',          label:'Specifications',  icon:'📐' },
];

function SectionTabBar({ active, onChange }) {
  return (
    <div style={{
      background:'#F8FAFC',
      borderBottom:`2px solid #D1D5DB`,
      display:'flex', flexWrap:'nowrap', overflowX:'hidden',
      padding:'0 2px', gap:0, flexShrink:0,
    }}>
      {INNER_TABS.map((t, idx) => {
        const isAct = active === t.id;
        return (
          <button key={t.id} onClick={() => onChange(t.id)}
            style={{
              fontFamily:F, fontSize:11, fontWeight:isAct?700:500,
              color: isAct ? N : '#111827',
              background: isAct ? '#DBEAFE' : 'transparent',
              border: 'none',
              borderBottom: isAct ? `2px solid ${N}` : '2px solid transparent',
              marginBottom: -2,
              padding:'0 8px',
              height: 32,
              cursor:'pointer', whiteSpace:'nowrap',
              flexShrink:1, flex:1,
              display:'flex', alignItems:'center', justifyContent:'center', gap:3,
              transition:'all 0.12s',
            }}
            onMouseEnter={e=>{ if(!isAct){ e.currentTarget.style.background='#EFF6FF'; e.currentTarget.style.color='#1D4ED8'; }}}
            onMouseLeave={e=>{ if(!isAct){ e.currentTarget.style.background='transparent'; e.currentTarget.style.color='#111827'; }}}>
            <span style={{fontSize:12, lineHeight:1}}>{t.icon}</span>
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
      <div style={{background:W,border:`2px solid ${N}`,width:500,maxHeight:420,display:'flex',flexDirection:'column',borderRadius:10,overflow:'hidden'}}>
        <div style={{background:`linear-gradient(135deg, ${N}, ${ND})`,color:W,padding:'5px 10px',fontSize:12,fontWeight:700,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
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
            <thead style={{background:`linear-gradient(90deg,#eef2ff,#f0f4ff)`,position:'sticky',top:0}}>
              <tr>
                {['Client ID','Name','City','GSTIN'].map((h,i)=>(
                  <th key={i} style={{padding:'4px 8px',color:N,fontWeight:700,textAlign:'left',borderRight:`1px solid rgba(99,102,241,0.15)`}}>{h}</th>
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
    <div style={{padding:'10px 12px',display:'flex',flexDirection:'column',gap:10}}>

      {/* ── Row 1: Customer Details + Reference Numbers ── */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>

        {/* LEFT: Bill To — Customer Details */}
        <div style={{border:`1px solid #E2E8F0`,background:W,borderRadius:8,overflow:'hidden',boxShadow:'0 1px 3px rgba(0,0,0,0.04)'}}>
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
                  style={{background:'#EFF6FF',color:N,border:`1px solid #BFDBFE`,
                    padding:'0 10px',fontSize:14,cursor:'pointer',height:28,fontFamily:F,fontWeight:700,flexShrink:0,borderRadius:5}}>
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
        <div style={{border:`1px solid #E2E8F0`,background:W,borderRadius:8,overflow:'hidden',boxShadow:'0 1px 3px rgba(0,0,0,0.04)'}}>
          <PH title="Reference Numbers & Terms" />
          <div style={{padding:'0 6px 6px'}}>
            <FR label="ERP Order ID" w={130} req>
              <Inp value={form.nextId||''} readOnly style={{width:130,background:'#F0FDF4',fontWeight:700,color:'#166534',border:'1px solid #BBF7D0'}}/>
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
      <div style={{border:`1px solid #E2E8F0`,background:W,borderRadius:8,overflow:'hidden',boxShadow:'0 1px 3px rgba(0,0,0,0.04)'}}>
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

function newItem() { return {_id:uid(),type:'Manufactured',itemCode:'',description:'',additionalDesc:'',hsnCode:'',qty:1,unit:'NOS',rate:0,gst:18,bom:[]}; }
function newBomLine() { return {_id:uid(),itemCode:'',itemName:'',qty:1,unit:'NOS'}; }

/* ── Item Picker Modal ── */
function ItemPickerModal({ companyId, onSelect, onClose }) {
  const [items, setItems]   = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    axios.get(`/api/items?companyId=${companyId}`)
      .then(r => setItems(r.data || []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [companyId]);

  const filtered = items.filter(it => {
    const q = search.toLowerCase();
    return !q || String(it.itemCode).includes(q) ||
      (it.itemName || '').toLowerCase().includes(q) ||
      (it.hsnCode  || '').toLowerCase().includes(q);
  });

  return (
    <div style={{ position:'fixed',top:0,left:0,right:0,bottom:0,background:'rgba(0,0,0,0.45)',zIndex:9000,display:'flex',alignItems:'center',justifyContent:'center' }}>
      <div style={{ background:'#fff',width:620,maxHeight:'80vh',display:'flex',flexDirection:'column',border:'2px solid '+N,fontFamily:F }}>
        {/* Header */}
        <div style={{ background:N,color:W,padding:'6px 12px',display:'flex',alignItems:'center',justifyContent:'space-between',flexShrink:0 }}>
          <span style={{ fontWeight:700,fontSize:13 }}>📦 Select Item</span>
          <button onClick={onClose} style={{ background:'transparent',border:'none',color:W,fontSize:16,cursor:'pointer',lineHeight:1 }}>✕</button>
        </div>
        {/* Search */}
        <div style={{ padding:'6px 10px',borderBottom:'1px solid #ddd',flexShrink:0 }}>
          <input autoFocus value={search} onChange={e=>setSearch(e.target.value)}
            placeholder="Search by code, name or HSN…"
            style={{ width:'100%',height:24,padding:'0 8px',border:'1px solid #aaa',fontSize:12,fontFamily:F,outline:'none',boxSizing:'border-box' }} />
        </div>
        {/* List */}
        <div style={{ overflowY:'auto',flex:1 }}>
          <table style={{ width:'100%',borderCollapse:'collapse',fontSize:11,fontFamily:F }}>
            <thead style={{ position:'sticky',top:0,zIndex:1 }}>
              <tr>
                {['Code','Item Name','UOM','HSN','Type'].map(h => (
                  <th key={h} style={{ padding:'4px 8px',background:N,color:W,fontWeight:700,textAlign:'left',borderRight:'1px solid #2a5a8a',whiteSpace:'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={5} style={{ padding:16,textAlign:'center',color:'#888' }}>Loading…</td></tr>}
              {!loading && filtered.length===0 && (
                <tr><td colSpan={5} style={{ padding:16,textAlign:'center',color:'#888' }}>
                  No items found. <a href="/items/create" target="_blank" style={{ color:N }}>Create item →</a>
                </td></tr>
              )}
              {filtered.map((it,i) => (
                <tr key={it.itemCode}
                  onClick={() => onSelect(it)}
                  style={{ background:i%2===0?'#fff':'#f5f8fc',cursor:'pointer' }}
                  onMouseEnter={e=>e.currentTarget.style.background='#dbeafe'}
                  onMouseLeave={e=>e.currentTarget.style.background=i%2===0?'#fff':'#f5f8fc'}
                >
                  <td style={{ padding:'4px 8px',borderBottom:'1px solid #eee',fontWeight:700,color:'#1a4a7a' }}>{it.itemCode}</td>
                  <td style={{ padding:'4px 8px',borderBottom:'1px solid #eee' }}>{it.itemName}</td>
                  <td style={{ padding:'4px 8px',borderBottom:'1px solid #eee',textAlign:'center' }}>{it.uom||'—'}</td>
                  <td style={{ padding:'4px 8px',borderBottom:'1px solid #eee',textAlign:'center',fontFamily:'monospace' }}>{it.hsnCode||'—'}</td>
                  <td style={{ padding:'4px 8px',borderBottom:'1px solid #eee' }}>
                    <span style={{ fontSize:10,padding:'1px 6px',borderRadius:2,fontWeight:700,
                      background: it.itemType==='Ready Product'?'#e8f5e9':'#fff3e0',
                      color:      it.itemType==='Ready Product'?'#2e7d32':'#e65100',
                      border:     it.itemType==='Ready Product'?'1px solid #a5d6a7':'1px solid #ffcc80',
                    }}>{it.itemType}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* Footer */}
        <div style={{ padding:'5px 10px',borderTop:'1px solid #ddd',fontSize:10,color:'#666',flexShrink:0 }}>
          {filtered.length} item{filtered.length!==1?'s':''} · Click row to select
        </div>
      </div>
    </div>
  );
}

function TabItemDetails({ items, setItems }) {
  const { selectedCompany } = useCompany();
  const [bomOpen, setBomOpen]       = useState(null);
  const [pickerFor, setPickerFor]   = useState(null); // _id of row opening picker

  const add    = () => setItems(p=>[...p,newItem()]);
  const upd    = (id,k,v) => setItems(p=>p.map(r=>r._id===id?{...r,[k]:v}:r));
  const del    = (id) => setItems(p=>p.filter(r=>r._id!==id));
  const addBom = (id) => setItems(p=>p.map(r=>r._id===id?{...r,bom:[...(r.bom||[]),newBomLine()]}:r));
  const updBom = (iid,bid,k,v) => setItems(p=>p.map(r=>r._id===iid?{...r,bom:r.bom.map(b=>b._id===bid?{...b,[k]:v}:b)}:r));
  const delBom = (iid,bid) => setItems(p=>p.map(r=>r._id===iid?{...r,bom:r.bom.filter(b=>b._id!==bid)}:r));

  const handleItemSelect = (masterItem) => {
    setItems(p => p.map(r => r._id === pickerFor ? {
      ...r,
      itemCode:    masterItem.itemCode,
      description: masterItem.itemName,
      unit:        masterItem.uom || r.unit,
      hsnCode:     masterItem.hsnCode || '',
    } : r));
    setPickerFor(null);
  };

  const th = (w,right) => ({padding:'3px 5px',background:N,color:W,fontWeight:700,fontSize:10,textAlign:right?'right':'left',
    border:'1px solid #2a5a8a',whiteSpace:'nowrap',position:'sticky',top:0,zIndex:2,width:w});
  const td = (w,right) => ({padding:'2px 4px',border:'1px solid #d0d0d0',width:w,textAlign:right?'right':'left'});

  const total = items.reduce((s,it)=>{const sub=(parseFloat(it.qty)||0)*(parseFloat(it.rate)||0);return s+sub+sub*(parseFloat(it.gst)||0)/100;},0);

  return (
    <div style={{padding:'8px 10px'}}>
      {pickerFor && (
        <ItemPickerModal
          companyId={selectedCompany?.companyId}
          onSelect={handleItemSelect}
          onClose={() => setPickerFor(null)}
        />
      )}
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:6}}>
        <span style={{fontSize:12,fontWeight:700,color:N}}>Line Items — Manufactured / Bought Out</span>
        <Btn v="suc" onClick={add}>+ Add Item</Btn>
      </div>
      <div style={{overflowX:'auto',border:`1px solid ${B}`}}>
        <table style={{width:'100%',borderCollapse:'collapse',fontSize:11,fontFamily:F,minWidth:1050}}>
          <thead>
            <tr>
              {[['#',28],['Type',100],['Item Code',80],['Item Name',0],['Additional Description',0],['HSN Code',80],['Qty',55],['Unit',55],
                ['Rate ₹',80],['GST %',55],['Amount ₹',90],['',68]].map(([h,w],i)=>(
                <th key={i} style={th(w||undefined, i>=8&&i<=9)}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.length===0 && (
              <tr><td colSpan={12} style={{padding:'14px',textAlign:'center',color:'#888',fontSize:11,background:'#fafafa'}}>
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
                    <td style={{...td(28),textAlign:'center',color:'#888'}}>{idx+1}</td>
                    <td style={td(100)}><Sel value={it.type} onChange={e=>upd(it._id,'type',e.target.value)} options={ITEM_TYPES}/></td>
                    <td style={{...td(80),textAlign:'center'}}>
                      <div style={{display:'flex',alignItems:'center',gap:3,justifyContent:'center'}}>
                        <button onClick={()=>setPickerFor(it._id)} title="Search from Item Master"
                          style={{background:'#e8f0ff',color:'#1a4a7a',border:'1px solid #aac',padding:'0 5px',fontSize:10,cursor:'pointer',height:18,fontFamily:F,whiteSpace:'nowrap',flexShrink:0,fontWeight:700}}>
                          📋
                        </button>
                        <span style={{fontSize:10,color:'#1a4a7a',fontWeight:700}}>
                          {it.itemCode||'—'}
                        </span>
                      </div>
                    </td>
                    <td style={td()}>
                      <Inp value={it.description} readOnly placeholder="Select item via 📋"/>
                    </td>
                    <td style={td()}>
                      <Inp value={it.additionalDesc||''} onChange={e=>upd(it._id,'additionalDesc',e.target.value)} placeholder="Additional description…"/>
                    </td>
                    <td style={td(80)}><Inp value={it.hsnCode||''} onChange={e=>upd(it._id,'hsnCode',e.target.value)} placeholder="HSN Code"/></td>
                    <td style={td(55)}><Inp type="number" value={it.qty} onChange={e=>upd(it._id,'qty',e.target.value)} min="0"/></td>
                    <td style={td(55)}><Sel value={it.unit} onChange={e=>upd(it._id,'unit',e.target.value)} options={UNITS}/></td>
                    <td style={td(80)}><Inp type="number" value={it.rate} onChange={e=>upd(it._id,'rate',e.target.value)} min="0"/></td>
                    <td style={td(55)}><Sel value={it.gst} onChange={e=>upd(it._id,'gst',e.target.value)} options={GST_RATES.map(r=>({value:r,label:`${r}%`}))}/></td>
                    <td style={{...td(90),textAlign:'right',fontWeight:700,color:'#005500'}}>{fmt(sub+tax)}</td>
                    <td style={{...td(68),textAlign:'center'}}>
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
                      <td colSpan={12} style={{padding:0,background:'#f0f7ff',borderLeft:'3px solid #4488cc',borderBottom:'2px solid #88aacc'}}>
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
                <td colSpan={9} style={{padding:'4px 8px',textAlign:'right',fontWeight:700,fontSize:11,color:N}}>Items Total (incl. GST)</td>
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

/* ═══════════════════════ RICH TEXT EDITOR ═══════════════════════ */
function RichEditor({ value, onChange }) {
  const ref      = useRef(null);
  const colorRef = useRef(null);
  const hlRef    = useRef(null);
  const [tableOpen, setTableOpen] = useState(false);
  const [tRows,     setTRows]     = useState(3);
  const [tCols,     setTCols]     = useState(4);

  /* set HTML only on mount / external change (not while typing) */
  useEffect(() => {
    if (ref.current) ref.current.innerHTML = value || '';
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* when loadEdit fires, specSheet changes from outside → sync to DOM */
  const lastExternal = useRef(value);
  useEffect(() => {
    if (value !== lastExternal.current && ref.current && document.activeElement !== ref.current) {
      ref.current.innerHTML = value || '';
      lastExternal.current = value;
    }
  }, [value]);

  const exec = useCallback((cmd, val = null) => {
    ref.current?.focus();
    document.execCommand(cmd, false, val);
  }, []);

  const onInput = () => {
    lastExternal.current = ref.current.innerHTML;
    onChange(ref.current.innerHTML);
  };

  /* Paste handler — preserve WordPad / Word formatting, strip junk */
  const onPaste = useCallback((e) => {
    e.preventDefault();
    const html = e.clipboardData.getData('text/html');
    const text = e.clipboardData.getData('text/plain');

    if (html) {
      /* Strip MS Office / WordPad noise while keeping structure */
      let clean = html
        .replace(/<!--[\s\S]*?-->/g, '')                    // HTML comments
        .replace(/<o:p[^>]*>[\s\S]*?<\/o:p>/gi, '')         // Word <o:p>
        .replace(/<\/?(?:xml|w:|m:|v:|o:)[^>]*>/gi, '')     // Word XML tags
        .replace(/\s+mso-[^;:"'}\s]+\s*:[^;}"']+;?/gi, '')  // mso-* CSS props
        .replace(/\s+panose-[^;:"'}\s]+\s*:[^;}"']+;?/gi, '') // panose-*
        .replace(/\s+font-family:\s*['"][^'"]*Wingdings[^'"]*['"]\s*;?/gi, '') // Wingdings
        .replace(/style="\s*"/gi, '')                        // empty style attrs
        .replace(/<span[^>]*>\s*<\/span>/gi, '')             // empty spans
        .replace(/<p[^>]*>\s*(&nbsp;)?\s*<\/p>/gi, '<br>')  // empty paragraphs
        .replace(/<font[^>]*face="Symbol"[^>]*>[\s\S]*?<\/font>/gi, ''); // Symbol font

      /* Insert the cleaned HTML at cursor */
      ref.current?.focus();
      document.execCommand('insertHTML', false, clean);
    } else if (text) {
      /* Plain text — preserve line breaks */
      const safe = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\n/g, '<br>');
      ref.current?.focus();
      document.execCommand('insertHTML', false, safe);
    }

    onInput();
  }, []);

  const insertTable = () => {
    let html = '<table style="border-collapse:collapse;width:100%;margin:8px 0">';
    for (let r = 0; r < tRows; r++) {
      html += '<tr>';
      for (let c = 0; c < tCols; c++) {
        if (r === 0) {
          html += '<th style="border:1px solid #aaa;padding:6px 10px;background:#1a3c6e;color:#fff;font-weight:700;min-width:70px">&nbsp;</th>';
        } else {
          html += '<td style="border:1px solid #aaa;padding:5px 10px;min-width:70px">&nbsp;</td>';
        }
      }
      html += '</tr>';
    }
    html += '</table><br>';
    ref.current?.focus();
    document.execCommand('insertHTML', false, html);
    onInput();
    setTableOpen(false);
  };

  const TB = { /* toolbar button base */
    padding:'2px 7px', fontSize:12, fontFamily:'Arial,sans-serif',
    border:'1px solid #CBD5E1', borderRadius:3, cursor:'pointer',
    background:'#fff', color:'#1e293b', height:24, lineHeight:'20px',
    display:'inline-flex', alignItems:'center', gap:2, whiteSpace:'nowrap',
    userSelect:'none',
  };
  const SEL = { ...TB, padding:'1px 4px' };
  const SEP = <span style={{width:1,height:18,background:'#CBD5E1',margin:'0 2px',display:'inline-block',flexShrink:0}}/>;

  return (
    <div style={{border:'1px solid #D1D5DB',borderRadius:5,overflow:'visible',
      background:'#fff',display:'flex',flexDirection:'column',position:'relative'}}>

      {/* ── Toolbar ── */}
      <div style={{background:'#F8FAFC',borderBottom:'1px solid #D1D5DB',
        padding:'5px 8px',display:'flex',flexWrap:'wrap',gap:3,alignItems:'center',flexShrink:0}}>

        {/* Heading */}
        <select onChange={e=>exec('formatBlock',e.target.value)} style={SEL}>
          <option value="p">Normal</option>
          <option value="h1">Heading 1</option>
          <option value="h2">Heading 2</option>
          <option value="h3">Heading 3</option>
          <option value="h4">Heading 4</option>
          <option value="pre">Code</option>
        </select>

        {/* Font family */}
        <select onChange={e=>exec('fontName',e.target.value)} style={{...SEL,minWidth:96}}>
          <option value="Arial">Arial</option>
          <option value="Times New Roman">Times New Roman</option>
          <option value="Courier New">Courier New</option>
          <option value="Georgia">Georgia</option>
          <option value="Verdana">Verdana</option>
          <option value="Tahoma">Tahoma</option>
        </select>

        {/* Font size */}
        <select onChange={e=>exec('fontSize',e.target.value)} defaultValue="3" style={{...SEL,width:52}}>
          <option value="1">8</option>
          <option value="2">10</option>
          <option value="3">12</option>
          <option value="4">14</option>
          <option value="5">18</option>
          <option value="6">24</option>
          <option value="7">36</option>
        </select>

        {SEP}

        {/* Bold / Italic / Underline / Strike */}
        <button onMouseDown={e=>{e.preventDefault();exec('bold');}}       style={TB} title="Bold (Ctrl+B)"><b>B</b></button>
        <button onMouseDown={e=>{e.preventDefault();exec('italic');}}     style={TB} title="Italic (Ctrl+I)"><i>I</i></button>
        <button onMouseDown={e=>{e.preventDefault();exec('underline');}}  style={TB} title="Underline (Ctrl+U)"><u>U</u></button>
        <button onMouseDown={e=>{e.preventDefault();exec('strikeThrough');}} style={TB} title="Strikethrough"><s>S</s></button>

        {SEP}

        {/* Text colour */}
        <button onMouseDown={e=>e.preventDefault()} onClick={()=>colorRef.current?.click()}
          style={{...TB}} title="Text Color">
          A <span style={{width:12,height:3,background:'#e00',borderRadius:1,display:'inline-block'}}/>
        </button>
        <input ref={colorRef} type="color" defaultValue="#000000"
          onChange={e=>exec('foreColor',e.target.value)}
          style={{width:0,height:0,opacity:0,position:'absolute',pointerEvents:'none'}}/>

        {/* Highlight */}
        <button onMouseDown={e=>e.preventDefault()} onClick={()=>hlRef.current?.click()}
          style={{...TB}} title="Highlight Color">
          H <span style={{width:12,height:3,background:'#ff0',borderRadius:1,display:'inline-block'}}/>
        </button>
        <input ref={hlRef} type="color" defaultValue="#ffff00"
          onChange={e=>exec('hiliteColor',e.target.value)}
          style={{width:0,height:0,opacity:0,position:'absolute',pointerEvents:'none'}}/>

        {SEP}

        {/* Alignment */}
        <button onMouseDown={e=>{e.preventDefault();exec('justifyLeft');}}   style={TB} title="Align Left">≡L</button>
        <button onMouseDown={e=>{e.preventDefault();exec('justifyCenter');}} style={TB} title="Center">≡C</button>
        <button onMouseDown={e=>{e.preventDefault();exec('justifyRight');}}  style={TB} title="Align Right">≡R</button>
        <button onMouseDown={e=>{e.preventDefault();exec('justifyFull');}}   style={TB} title="Justify">≡J</button>

        {SEP}

        {/* Lists */}
        <button onMouseDown={e=>{e.preventDefault();exec('insertUnorderedList');}} style={TB} title="Bullet List">• List</button>
        <button onMouseDown={e=>{e.preventDefault();exec('insertOrderedList');}}   style={TB} title="Numbered List">1. List</button>

        {/* Indent */}
        <button onMouseDown={e=>{e.preventDefault();exec('indent');}}   style={TB} title="Indent">→</button>
        <button onMouseDown={e=>{e.preventDefault();exec('outdent');}}  style={TB} title="Outdent">←</button>

        {SEP}

        {/* Table */}
        <button onMouseDown={e=>e.preventDefault()} onClick={()=>setTableOpen(o=>!o)}
          style={{...TB,color:'#1a3c6e',fontWeight:700}} title="Insert Table">⊞ Table</button>

        {SEP}

        {/* HR + clear */}
        <button onMouseDown={e=>{e.preventDefault();exec('insertHorizontalRule');}} style={TB} title="Horizontal Rule">― HR</button>
        <button onMouseDown={e=>{e.preventDefault();exec('removeFormat');}}         style={TB} title="Clear Formatting">✕ Format</button>
      </div>

      {/* ── Table size picker (popover) ── */}
      {tableOpen && (
        <div style={{position:'absolute',top:42,left:0,zIndex:200,background:'#fff',
          border:'1px solid #D1D5DB',borderRadius:6,boxShadow:'0 6px 20px rgba(0,0,0,0.15)',
          padding:'14px 18px',display:'flex',flexDirection:'column',gap:10,minWidth:230}}>
          <div style={{fontWeight:700,fontSize:13,color:'#1a3c6e'}}>⊞ Insert Table</div>
          <div style={{display:'flex',gap:10,alignItems:'center',fontSize:12}}>
            <span>Rows:</span>
            <input type="number" min={1} max={30} value={tRows} onChange={e=>setTRows(+e.target.value)}
              style={{width:52,padding:'3px 6px',border:'1px solid #D1D5DB',borderRadius:4,fontSize:12,fontFamily:F}}/>
            <span>Cols:</span>
            <input type="number" min={1} max={15} value={tCols} onChange={e=>setTCols(+e.target.value)}
              style={{width:52,padding:'3px 6px',border:'1px solid #D1D5DB',borderRadius:4,fontSize:12,fontFamily:F}}/>
          </div>
          <div style={{display:'flex',gap:8}}>
            <button onClick={insertTable}
              style={{background:'#1a3c6e',color:'#fff',border:'none',padding:'5px 16px',
                borderRadius:4,fontSize:12,cursor:'pointer',fontWeight:700,fontFamily:F}}>Insert</button>
            <button onClick={()=>setTableOpen(false)}
              style={{background:'#F3F4F6',border:'1px solid #D1D5DB',padding:'5px 14px',
                borderRadius:4,fontSize:12,cursor:'pointer',fontFamily:F}}>Cancel</button>
          </div>
        </div>
      )}

      {/* ── Editable area ── */}
      <style>{`
        .spec-editor:empty:before {
          content: attr(data-ph);
          color: #9CA3AF;
          pointer-events: none;
        }
        .spec-editor table { border-collapse: collapse; width: 100%; margin: 8px 0; }
        .spec-editor td, .spec-editor th { border: 1px solid #aaa; padding: 5px 10px; min-width: 60px; }
        .spec-editor th { background: #1a3c6e; color: #fff; font-weight: 700; }
        .spec-editor h1 { font-size: 1.8em; margin: 8px 0 4px; }
        .spec-editor h2 { font-size: 1.4em; margin: 6px 0 3px; }
        .spec-editor h3 { font-size: 1.15em; margin: 5px 0 2px; }
        .spec-editor h4 { font-size: 1em; margin: 4px 0 2px; }
        .spec-editor pre { background: #f3f4f6; padding: 8px 12px; border-radius: 4px; font-size: 12px; }
        .spec-editor ul, .spec-editor ol { padding-left: 24px; }
        .spec-editor hr { border: none; border-top: 2px solid #e5e7eb; margin: 10px 0; }
      `}</style>
      <div
        ref={ref}
        className="spec-editor"
        contentEditable
        suppressContentEditableWarning
        data-ph="Start typing your specifications here…  Use the toolbar above to format text, insert tables, bullet lists, headings, and more."
        onInput={onInput}
        onPaste={onPaste}
        style={{
          minHeight: 440, padding: '14px 18px', outline: 'none',
          fontSize: 13, fontFamily: 'Arial, sans-serif', lineHeight: 1.75,
          background: '#fff', overflowY: 'auto', color: '#111',
          flex: 1,
        }}
      />
    </div>
  );
}

/* ═══════════════════════ SPECIFICATIONS TAB ═══════════════════════ */
/* ─── Structured specs builder ─── */
function StructuredSpecs({ items, groups, setGroups }) {
  const newRow    = () => ({ _id:uid(), srNo:'', description:'', qty:'', remarks:'' });
  const newSub    = () => ({ _id:uid(), title:'', text:'', rows:[newRow()] });
  const newHdr    = () => ({ _id:uid(), title:'', subHeaders:[newSub()] });
  const newGroup  = () => ({ _id:uid(), itemId:'', itemName:'', headers:[newHdr()] });

  const addGroup  = () => setGroups(p=>[...p,newGroup()]);
  const delGroup  = (gid) => setGroups(p=>p.filter(g=>g._id!==gid));
  const setGItem  = (gid,iid,iname) => setGroups(p=>p.map(g=>g._id===gid?{...g,itemId:iid,itemName:iname}:g));

  const addHdr  = (gid) => setGroups(p=>p.map(g=>g._id===gid?{...g,headers:[...g.headers,newHdr()]}:g));
  const delHdr  = (gid,hid) => setGroups(p=>p.map(g=>g._id===gid?{...g,headers:g.headers.filter(h=>h._id!==hid)}:g));
  const setHdrT = (gid,hid,t) => setGroups(p=>p.map(g=>g._id===gid?{...g,headers:g.headers.map(h=>h._id===hid?{...h,title:t}:h)}:g));

  const addSub  = (gid,hid) => setGroups(p=>p.map(g=>g._id===gid?{...g,headers:g.headers.map(h=>h._id===hid?{...h,subHeaders:[...h.subHeaders,newSub()]}:h)}:g));
  const delSub  = (gid,hid,sid) => setGroups(p=>p.map(g=>g._id===gid?{...g,headers:g.headers.map(h=>h._id===hid?{...h,subHeaders:h.subHeaders.filter(s=>s._id!==sid)}:h)}:g));
  const setSubF = (gid,hid,sid,k,v) => setGroups(p=>p.map(g=>g._id===gid?{...g,headers:g.headers.map(h=>h._id===hid?{...h,subHeaders:h.subHeaders.map(s=>s._id===sid?{...s,[k]:v}:s)}:h)}:g));

  const addRow  = (gid,hid,sid) => setGroups(p=>p.map(g=>g._id===gid?{...g,headers:g.headers.map(h=>h._id===hid?{...h,subHeaders:h.subHeaders.map(s=>s._id===sid?{...s,rows:[...s.rows,newRow()]}:s)}:h)}:g));
  const delRow  = (gid,hid,sid,rid) => setGroups(p=>p.map(g=>g._id===gid?{...g,headers:g.headers.map(h=>h._id===hid?{...h,subHeaders:h.subHeaders.map(s=>s._id===sid?{...s,rows:s.rows.filter(r=>r._id!==rid)}:s)}:h)}:g));
  const updRow  = (gid,hid,sid,rid,k,v) => setGroups(p=>p.map(g=>g._id===gid?{...g,headers:g.headers.map(h=>h._id===hid?{...h,subHeaders:h.subHeaders.map(s=>s._id===sid?{...s,rows:s.rows.map(r=>r._id===rid?{...r,[k]:v}:r)}:s)}:h)}:g));

  return (
    <div style={{overflowY:'auto',flex:1,paddingBottom:8}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
        <span style={{fontSize:11,color:'#6B7280'}}>Organise specs by item → header → sub-header → rows</span>
        <Btn v="suc" onClick={addGroup}>+ Add Item Group</Btn>
      </div>
      {groups.length===0 && (
        <div style={{padding:'28px',textAlign:'center',color:'#888',background:'#fafafa',border:`1px dashed ${B}`,borderRadius:6,fontSize:12}}>
          Click [+ Add Item Group] to begin
        </div>
      )}
      {groups.map(group=>(
        <div key={group._id} style={{marginBottom:14,border:`1px solid ${B}`,borderRadius:6,overflow:'hidden'}}>
          {/* Group: item selector */}
          <div style={{background:N,padding:'6px 10px',display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
            <span style={{color:W,fontWeight:700,fontSize:11}}>Item:</span>
            <select value={group.itemId}
              onChange={e=>{const s=items.find(it=>it._id===e.target.value);setGItem(group._id,e.target.value,s?(s.description||s.itemCode||''):'');}}
              style={{fontSize:11,fontFamily:F,padding:'2px 5px',border:'none',borderRadius:3,minWidth:200}}>
              <option value="">— Select from order items —</option>
              {items.map(it=><option key={it._id} value={it._id}>{it.description||it.itemCode}</option>)}
            </select>
            <input value={group.itemName} onChange={e=>setGItem(group._id,'',e.target.value)}
              placeholder={group.itemId?'':'Or type custom item name…'} disabled={!!group.itemId}
              style={{fontSize:11,fontFamily:F,padding:'2px 6px',border:'1px solid rgba(255,255,255,0.4)',
                borderRadius:3,minWidth:160,background:group.itemId?'rgba(255,255,255,0.15)':'#fff',
                color:group.itemId?'rgba(255,255,255,0.6)':'#111'}}/>
            <div style={{flex:1}}/>
            <Btn v="suc" onClick={()=>addHdr(group._id)} style={{fontSize:10}}>+ Header</Btn>
            <button onClick={()=>delGroup(group._id)}
              style={{background:'#ffe0e0',color:R,border:'1px solid #cc8888',padding:'0 7px',fontSize:11,cursor:'pointer',height:24,borderRadius:3,fontWeight:700}}>✕ Remove</button>
          </div>
          {/* Headers */}
          {group.headers.map(hdr=>(
            <div key={hdr._id} style={{borderTop:`1px solid ${B}`}}>
              <div style={{background:'#EFF6FF',padding:'4px 10px',display:'flex',alignItems:'center',gap:6}}>
                <span style={{fontSize:11,color:N,fontWeight:700,whiteSpace:'nowrap'}}>Header:</span>
                <Inp value={hdr.title} onChange={e=>setHdrT(group._id,hdr._id,e.target.value)}
                  placeholder="e.g. Technical Specifications, Mechanical Properties…" style={{flex:1}}/>
                <Btn v="suc" onClick={()=>addSub(group._id,hdr._id)} style={{fontSize:10}}>+ Sub-Header</Btn>
                <button onClick={()=>delHdr(group._id,hdr._id)}
                  style={{background:'#ffe0e0',color:R,border:'1px solid #cc8888',padding:'0 6px',fontSize:11,cursor:'pointer',height:22,borderRadius:3}}>✕</button>
              </div>
              {hdr.subHeaders.map(sub=>(
                <div key={sub._id} style={{marginLeft:20,borderTop:'1px solid #E5E7EB'}}>
                  <div style={{background:'#F8FAFC',padding:'3px 10px',display:'flex',alignItems:'center',gap:6}}>
                    <span style={{fontSize:10,color:'#64748B',fontWeight:700,whiteSpace:'nowrap'}}>Sub-Header:</span>
                    <Inp value={sub.title} onChange={e=>setSubF(group._id,hdr._id,sub._id,'title',e.target.value)}
                      placeholder="e.g. Dimensions, Material Grade…" style={{flex:1}}/>
                    <Btn v="suc" onClick={()=>addRow(group._id,hdr._id,sub._id)} style={{fontSize:10}}>+ Row</Btn>
                    <button onClick={()=>delSub(group._id,hdr._id,sub._id)}
                      style={{background:'#ffe0e0',color:R,border:'1px solid #cc8888',padding:'0 6px',fontSize:10,cursor:'pointer',height:20,borderRadius:3}}>✕</button>
                  </div>
                  <div style={{padding:'3px 10px 4px',background:'#FAFBFC'}}>
                    <textarea value={sub.text||''} onChange={e=>setSubF(group._id,hdr._id,sub._id,'text',e.target.value)}
                      placeholder="Optional notes / description for this sub-header…" rows={2}
                      style={{width:'100%',fontSize:11,fontFamily:F,padding:'3px 6px',border:'1px solid #E5E7EB',
                        borderRadius:3,resize:'vertical',boxSizing:'border-box'}}/>
                  </div>
                  <div style={{padding:'0 10px 8px'}}>
                    <table style={{width:'100%',borderCollapse:'collapse',fontSize:11,fontFamily:F}}>
                      <thead>
                        <tr style={{background:N}}>
                          {['Sr No','Description','Qty','Remarks',''].map((h,i)=>(
                            <th key={i} style={{padding:'3px 5px',color:W,fontWeight:700,fontSize:10,textAlign:'left',border:'1px solid #2a5a8a',whiteSpace:'nowrap'}}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {sub.rows.length===0&&<tr><td colSpan={5} style={{padding:'8px',textAlign:'center',color:'#888',fontSize:11}}>Click [+ Row] to add rows</td></tr>}
                        {sub.rows.map((row,ri)=>(
                          <tr key={row._id} style={{background:ri%2===0?W:'#f5f8fc'}}>
                            <td style={{border:'1px solid #e0e0e0',width:52,padding:'2px 4px'}}><Inp value={row.srNo} onChange={e=>updRow(group._id,hdr._id,sub._id,row._id,'srNo',e.target.value)} placeholder={String(ri+1)}/></td>
                            <td style={{border:'1px solid #e0e0e0',padding:'2px 4px'}}><Inp value={row.description} onChange={e=>updRow(group._id,hdr._id,sub._id,row._id,'description',e.target.value)} placeholder="Description…"/></td>
                            <td style={{border:'1px solid #e0e0e0',width:70,padding:'2px 4px'}}><Inp value={row.qty} onChange={e=>updRow(group._id,hdr._id,sub._id,row._id,'qty',e.target.value)} placeholder="—"/></td>
                            <td style={{border:'1px solid #e0e0e0',padding:'2px 4px'}}><Inp value={row.remarks} onChange={e=>updRow(group._id,hdr._id,sub._id,row._id,'remarks',e.target.value)} placeholder="Remarks…"/></td>
                            <td style={{border:'1px solid #e0e0e0',width:30,textAlign:'center',padding:'2px 4px'}}>
                              <button onClick={()=>delRow(group._id,hdr._id,sub._id,row._id)}
                                style={{background:'#ffe0e0',color:R,border:'1px solid #cc8888',padding:'0 4px',fontSize:10,cursor:'pointer',height:18}}>✕</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/* ─── Spec file uploader ─── */
function SpecFileUpload({ files, setFiles }) {
  const add = (e) => {
    const newFs = Array.from(e.target.files).map(f=>({
      _id:uid(), name:f.name.replace(/\.[^.]+$/,''),
      fileName:f.name, fileType:f.name.split('.').pop().toLowerCase(), file:f,
    }));
    setFiles(p=>[...p,...newFs]);
    e.target.value='';
  };
  const del = (id) => setFiles(p=>p.filter(f=>f._id!==id));
  const upd = (id,k,v) => setFiles(p=>p.map(f=>f._id===id?{...f,[k]:v}:f));
  const ico = t => ({'pdf':'📄','doc':'📝','docx':'📝','xls':'📊','xlsx':'📊','txt':'📃'}[t]||'📎');

  return (
    <div style={{overflowY:'auto',flex:1}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
        <span style={{fontSize:11,color:'#6B7280'}}>Attach Excel, Word, PDF or TXT files as specification documents</span>
        <label style={{background:'#16A34A',color:'#fff',border:'none',padding:'4px 14px',fontSize:11,
          cursor:'pointer',fontFamily:F,fontWeight:700,borderRadius:4,display:'inline-flex',alignItems:'center',gap:4}}>
          + Upload File
          <input type="file" multiple accept=".pdf,.doc,.docx,.xls,.xlsx,.txt" onChange={add} style={{display:'none'}}/>
        </label>
      </div>
      {files.length===0 && (
        <div style={{padding:'28px',textAlign:'center',color:'#888',background:'#fafafa',border:`1px dashed ${B}`,borderRadius:6,fontSize:12}}>
          No spec files — click [+ Upload File] to attach PDF, Word, Excel or TXT
        </div>
      )}
      {files.length>0 && (
        <table style={{width:'100%',borderCollapse:'collapse',fontSize:11,fontFamily:F}}>
          <thead>
            <tr style={{background:N}}>
              {['#','','Label / Description','File Name',''].map((h,i)=>(
                <th key={i} style={{padding:'4px 6px',color:W,fontWeight:700,fontSize:10,textAlign:'left',border:'1px solid #2a5a8a'}}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {files.map((f,i)=>(
              <tr key={f._id} style={{background:i%2===0?W:'#f5f8fc'}}>
                <td style={{border:'1px solid #e0e0e0',width:28,textAlign:'center',padding:'2px 4px',color:'#888'}}>{i+1}</td>
                <td style={{border:'1px solid #e0e0e0',width:30,textAlign:'center',padding:'2px 4px',fontSize:16}}>{ico(f.fileType)}</td>
                <td style={{border:'1px solid #e0e0e0',padding:'2px 4px'}}>
                  <Inp value={f.name} onChange={e=>upd(f._id,'name',e.target.value)} placeholder="Label for this file…"/>
                </td>
                <td style={{border:'1px solid #e0e0e0',padding:'3px 6px',color:f.file?'#005500':'#555',fontWeight:f.file?700:400}}>
                  {f.file?`✔ ${f.file.name}`:(f.fileName||'—')}
                </td>
                <td style={{border:'1px solid #e0e0e0',width:30,textAlign:'center',padding:'2px 4px'}}>
                  <button onClick={()=>del(f._id)}
                    style={{background:'#ffe0e0',color:R,border:'1px solid #cc8888',padding:'0 4px',fontSize:10,cursor:'pointer',height:18}}>✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/* ─── Tab wrapper with mode toggle ─── */
function TabSpecifications({ items, specMode, setSpecMode, specHtml, setSpecHtml, specGroups, setSpecGroups, specFileList, setSpecFileList }) {
  const modes = [
    { id:'freewrite',  label:'✍ Free Write' },
    { id:'structured', label:'📋 Structured' },
    { id:'upload',     label:'📎 Upload File' },
  ];
  return (
    <div style={{padding:'10px 12px',display:'flex',flexDirection:'column',gap:8,height:'100%',boxSizing:'border-box'}}>
      {/* Mode toggle */}
      <div style={{display:'flex',gap:4,flexShrink:0,flexWrap:'wrap',alignItems:'center'}}>
        <span style={{fontSize:11,fontWeight:700,color:N,marginRight:4}}>📐 Specifications — Mode:</span>
        {modes.map(m=>(
          <button key={m.id} onClick={()=>setSpecMode(m.id)}
            style={{padding:'4px 14px',fontSize:11,fontWeight:specMode===m.id?700:500,
              background:specMode===m.id?N:'#F3F4F6',color:specMode===m.id?W:'#374151',
              border:`1px solid ${specMode===m.id?N:'#D1D5DB'}`,borderRadius:4,cursor:'pointer',fontFamily:F}}>
            {m.label}
          </button>
        ))}
      </div>
      {/* Content */}
      <div style={{flex:1,display:'flex',flexDirection:'column',minHeight:0}}>
        {specMode==='freewrite'  && <RichEditor value={specHtml} onChange={setSpecHtml}/>}
        {specMode==='structured' && <StructuredSpecs items={items} groups={specGroups} setGroups={setSpecGroups}/>}
        {specMode==='upload'     && <SpecFileUpload files={specFileList} setFiles={setSpecFileList}/>}
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
    <div style={{display:'flex',alignItems:'center',gap:16,padding:'5px 14px',
      background:'#1E293B',borderTop:`1px solid #334155`,flexShrink:0,flexWrap:'wrap'}}>
      <span style={{fontSize:11,color:'#94A3B8',fontFamily:F}}>
        Items: <strong style={{color:'#F1F5F9'}}>{fmt(itemsNet+itemsGst)}</strong>
      </span>
      <span style={{color:'#334155',fontSize:10}}>|</span>
      <span style={{fontSize:11,color:'#94A3B8',fontFamily:F}}>
        Charges: <strong style={{color:'#F1F5F9'}}>{fmt(chgNet+chgGst)}</strong>
      </span>
      <span style={{color:'#334155',fontSize:10}}>|</span>
      <span style={{fontSize:12,color:'#38BDF8',fontFamily:F,fontWeight:700}}>
        Grand Total: <strong style={{color:'#fff',fontSize:13}}>{fmt(grand)}</strong>
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
  const SH = {background:'linear-gradient(90deg,#eef2ff 0%,#f8fafc 100%)',color:N,padding:'5px 10px',fontSize:10,fontWeight:700,textTransform:'uppercase',letterSpacing:'.7px',fontFamily:F,borderBottom:`1px solid rgba(99,102,241,0.15)`};
  const CELL_L = {fontSize:10,fontWeight:700,color:'#445',minWidth:110,padding:'3px 8px',borderRight:'1px solid #e8ecf4',background:'#f6f8fc',flexShrink:0,whiteSpace:'nowrap'};
  const CELL_V = {fontSize:11,color:'#111',padding:'3px 8px',fontFamily:F};
  const ROW    = {display:'flex',minHeight:24,borderBottom:'1px solid #eef1f8',alignItems:'center'};
  const SecHead = ({title,count})=>(
    <div style={{...SH,marginTop:14,display:'flex',alignItems:'center',gap:8,borderLeft:`4px solid ${N}`}}>
      {title}
      {count!=null&&<span style={{background:N,color:'#fff',borderRadius:10,padding:'0 7px',fontSize:9,fontWeight:800}}>{count}</span>}
    </div>
  );

  /* table helpers */
  const TH = (props) => <th style={{padding:'5px 8px',background:'#eef2ff',color:N,fontSize:10,fontWeight:700,textAlign:props.r?'right':props.c?'center':'left',border:`1px solid rgba(99,102,241,0.15)`,whiteSpace:'nowrap',...props.style}}>{props.children}</th>;
  const TD = (props) => <td style={{padding:'4px 8px',border:'1px solid #dde4f0',fontSize:11,verticalAlign:'top',textAlign:props.r?'right':props.c?'center':'left',fontWeight:props.bold?700:400,...props.style}}>{props.children}</td>;

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.6)',zIndex:9999,display:'flex',alignItems:'center',justifyContent:'center',padding:10}}
      onClick={onClose}>
      <div style={{background:'#f4f6fa',width:'100%',maxWidth:1080,maxHeight:'96vh',display:'flex',flexDirection:'column',boxShadow:'0 6px 48px rgba(0,0,0,0.4)',border:'1px solid #c0c8da'}}
        onClick={e=>e.stopPropagation()}>

        {/* ══ STICKY HEADER ══ */}
        <div style={{background:`linear-gradient(135deg, ${N}, ${ND})`,color:'#fff',padding:'10px 16px',flexShrink:0,borderBottom:`3px solid rgba(255,255,255,0.2)`,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
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
              <div style={{display:'flex',justifyContent:'space-between',padding:'7px 12px',fontSize:13,fontFamily:F,fontWeight:800,color:'#fff',background:`linear-gradient(135deg,${N},${ND})`}}>
                <span>GRAND TOTAL</span>
                <span style={{color:'#fff'}}>{fmt(grandTotal)}</span>
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

          {/* ── ATTACHMENTS ── */}
          {attachments.length>0&&<>
            <SecHead title="Attachments" count={attachments.length}/>
            <div style={{display:'flex',flexDirection:'column',gap:6}}>
              {attachments.map((a,i)=>{
                const fileName = a.fileName||a.name||'';
                const isPdf    = fileName.toLowerCase().endsWith('.pdf');
                const isImg    = /\.(png|jpg|jpeg|gif|bmp|webp)$/i.test(fileName);
                const dlUrl    = companyId&&o.orderId&&fileName
                  ? `/api/sales-orders/${o.orderId}/download/${encodeURIComponent(fileName)}?companyId=${companyId}`
                  : null;
                const viewUrl  = dlUrl ? dlUrl + '&inline=1' : null;
                return (
                  <div key={i} style={{display:'flex',alignItems:'center',gap:10,padding:'8px 12px',background:'#f6f8fc',border:'1px solid #dde4f0',borderLeft:`4px solid ${N}`,borderRadius:4}}>
                    <span style={{background:N,color:'#fff',borderRadius:'50%',width:22,height:22,display:'flex',alignItems:'center',justifyContent:'center',fontSize:10,fontWeight:700,flexShrink:0}}>{i+1}</span>
                    <span style={{fontSize:16,flexShrink:0}}>{isPdf?'📄':isImg?'🖼️':'📎'}</span>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:12,fontWeight:700,color:'#1a3a6b',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{a.name||fileName||`Document ${i+1}`}</div>
                      <div style={{fontSize:10,color:'#888',marginTop:1}}>{isPdf?'PDF Document':isImg?'Image':'File'}</div>
                    </div>
                    <div style={{display:'flex',gap:6,flexShrink:0}}>
                      {viewUrl&&<a href={viewUrl} target="_blank" rel="noopener noreferrer"
                        style={{background:'#EEF4FF',color:N,padding:'4px 10px',fontSize:10,fontWeight:700,textDecoration:'none',borderRadius:4,border:`1px solid ${N}30`}}>
                        👁 View
                      </a>}
                      {dlUrl&&<a href={dlUrl} download target="_blank" rel="noopener noreferrer"
                        style={{background:N,color:'#fff',padding:'4px 10px',fontSize:10,fontWeight:700,textDecoration:'none',borderRadius:4}}>
                        ⬇ Download
                      </a>}
                    </div>
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
              <tr style={{background:'#eef2ff'}}>
                {['Order ID','Order No.','Date','Customer','Client PO','Status','Total ₹','Actions'].map((h,i)=>(
                  <th key={i} style={{padding:'4px 8px',color:N,fontWeight:700,fontSize:10,textAlign:'left',borderRight:`1px solid #D1D5DB`,whiteSpace:'nowrap',borderBottom:`2px solid #D1D5DB`}}>{h}</th>
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
  const [attachments,  setAttachments]  = useState([]);
  const [specMode,     setSpecMode]     = useState('freewrite');
  const [specHtml,     setSpecHtml]     = useState('');
  const [specGroups,   setSpecGroups]   = useState([]);
  const [specFileList, setSpecFileList] = useState([]);

  /* clients */
  const [clients,    setClients]    = useState([]);
  const [showSearch, setShowSearch] = useState(false);

  /* ui state */
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');
  const [ok,     setOk]     = useState('');

  /* totals */
  const itemsNet     = items.reduce((s,it)=>(parseFloat(it.qty)||0)*(parseFloat(it.rate)||0)+s, 0);
  const itemsGst     = items.reduce((s,it)=>{const sub=(parseFloat(it.qty)||0)*(parseFloat(it.rate)||0);return s+sub*(parseFloat(it.gst)||0)/100;},0);
  const chargesNet   = charges.reduce((s,ch)=>s+(parseFloat(ch.amount)||0),0);
  const chargesGst   = charges.reduce((s,ch)=>{const a=parseFloat(ch.amount)||0;return s+a*(parseFloat(ch.gst)||0)/100;},0);
  const itemsGrand   = itemsNet + itemsGst;
  const chargesGrand = chargesNet + chargesGst;
  const totalGST     = itemsGst + chargesGst;
  const cgstVal      = totalGST / 2;
  const sgstVal      = totalGST / 2;
  const orderValue   = itemsGrand + chargesGrand;

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
    setSpecMode('freewrite'); setSpecHtml(''); setSpecGroups([]); setSpecFileList([]);
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
    const specRaw = o.specSheet||'';
    let specParsed = { mode:'freewrite', html:'', groups:[] };
    try { const p = JSON.parse(specRaw); if (p && p.mode) specParsed = p; else specParsed.html = specRaw; }
    catch { specParsed.html = specRaw; }
    setSpecMode(specParsed.mode||'freewrite');
    setSpecHtml(specParsed.html||'');
    setSpecGroups((specParsed.groups||[]).map(g=>({...g,_id:g._id||uid(),
      headers:(g.headers||[]).map(h=>({...h,_id:h._id||uid(),
        subHeaders:(h.subHeaders||[]).map(s=>({...s,_id:s._id||uid(),
          rows:(s.rows||[]).map(r=>({...r,_id:r._id||uid()})),
        })),
      })),
    })));
    setSpecFileList((o.specFiles||[]).map(f=>({...f,_id:f._id||uid()})));
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
      fd.append('subTotal',      itemsNet + chargesNet);
      fd.append('totalGST',      totalGST);
      fd.append('cgst',          cgstVal);
      fd.append('sgst',          sgstVal);
      fd.append('grandTotal',    orderValue);
      fd.append('items',         JSON.stringify(items.map(({_id,...r})=>r)));
      fd.append('addons',        JSON.stringify(addons.map(({_id,...r})=>r)));
      fd.append('charges',       JSON.stringify(charges.map(({_id,...r})=>r)));
      fd.append('scopeItems',    JSON.stringify(scopes.map(({_id,...r})=>r)));
      fd.append('tasks',         JSON.stringify(activities.map(({_id,...r})=>r)));
      fd.append('bankGuarantee', JSON.stringify(bg));
      fd.append('warranty',      JSON.stringify(warranty));
      fd.append('specSheet', JSON.stringify({
        mode: specMode, html: specHtml,
        groups: specGroups.map(({_id,...g})=>({...g,
          headers:(g.headers||[]).map(({_id,...h})=>({...h,
            subHeaders:(h.subHeaders||[]).map(({_id,...s})=>({...s,
              rows:(s.rows||[]).map(({_id,...r})=>r),
            })),
          })),
        })),
      }));
      specFileList.forEach(f=>{ if(f.file) fd.append('specUploadFiles',f.file); });
      fd.append('specFiles', JSON.stringify(specFileList.map(({_id,file,...r})=>({...r,fileName:file?.name||r.fileName||''}))));
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
          <div style={{flex:1,overflowY:'auto',background:'#F5F7FA'}}>

            {secTab==='order-details'   && <TabOrderDetails   form={form} setF={setF} showSearch={showSearch} setShowSearch={setShowSearch}/>}
            {secTab==='item-details'    && <TabItemDetails    items={items} setItems={setItems}/>}
            {secTab==='addon-items'     && <TabAddonItems     addons={addons} setAddons={setAddons}/>}
            {secTab==='charges'         && <TabCharges        charges={charges} setCharges={setCharges}/>}
            {secTab==='bank-guarantee'  && <TabBankGuarantee  orderValue={orderValue} bg={bg} setBg={setBg}/>}
            {secTab==='scope'           && <TabScope          scopes={scopes} setScopes={setScopes}/>}
            {secTab==='warranty'        && <TabWarranty       warranty={warranty} setWarranty={setWarranty}/>}
            {secTab==='activities'      && <TabActivities     activities={activities} setActivities={setActivities}/>}
            {secTab==='attachments'     && <TabAttachments    attachments={attachments} setAttachments={setAttachments}/>}
            {secTab==='specs'           && <TabSpecifications items={items} specMode={specMode} setSpecMode={setSpecMode} specHtml={specHtml} setSpecHtml={setSpecHtml} specGroups={specGroups} setSpecGroups={setSpecGroups} specFileList={specFileList} setSpecFileList={setSpecFileList}/>}

          </div>

          {/* Order Value Strip */}
          <OrderSummaryStrip items={items} charges={charges}/>

          {/* Bottom Action Bar */}
          <div style={{background:'#FFFFFF',borderTop:`1px solid #E5E7EB`,padding:'6px 12px',
            display:'flex',alignItems:'center',gap:6,flexShrink:0}}>

            {/* Prev / Next */}
            <button onClick={goPrev} disabled={isFirst}
              style={{background:isFirst?'#F9FAFB':`#EFF6FF`,color:isFirst?'#9CA3AF':N,
                border:`1px solid ${isFirst?'#E5E7EB':'#BFDBFE'}`,padding:'0 14px',fontSize:11.5,
                cursor:isFirst?'default':'pointer',fontFamily:F,fontWeight:600,height:28,borderRadius:5}}>
              ← Prev
            </button>
            <span style={{fontSize:11,color:'#6B7280',minWidth:110,textAlign:'center',
              background:'#F9FAFB',border:'1px solid #E5E7EB',borderRadius:5,padding:'3px 10px',whiteSpace:'nowrap'}}>
              {secIdx+1} / {INNER_TABS.length} · {INNER_TABS[secIdx].label}
            </span>
            <button onClick={goNext} disabled={isLast}
              style={{background:isLast?'#F9FAFB':`#EFF6FF`,color:isLast?'#9CA3AF':N,
                border:`1px solid ${isLast?'#E5E7EB':'#BFDBFE'}`,padding:'0 14px',fontSize:11.5,
                cursor:isLast?'default':'pointer',fontFamily:F,fontWeight:600,height:28,borderRadius:5}}>
              Next →
            </button>

            <div style={{flex:1}}/>

            {/* Save Actions */}
            <button onClick={()=>submit('draft')} disabled={saving}
              style={{background:saving?'#F9FAFB':'#F59E0B',color:saving?'#9CA3AF':'#fff',border:'none',
                padding:'0 16px',fontSize:12,cursor:saving?'default':'pointer',
                fontFamily:F,fontWeight:700,height:30,borderRadius:5}}>
              💾 Save Draft
            </button>
            <button onClick={()=>submit('pending')} disabled={saving}
              style={{background:saving?'#F9FAFB':'#2563EB',color:saving?'#9CA3AF':'#fff',border:'none',
                padding:'0 16px',fontSize:12,cursor:saving?'default':'pointer',
                fontFamily:F,fontWeight:700,height:30,borderRadius:5}}>
              📤 Submit for Approval
            </button>
            <button onClick={()=>submit('approved')} disabled={saving}
              style={{background:'#16A34A',color:'#fff',border:'none',
                padding:'0 18px',fontSize:12,cursor:saving?'default':'pointer',
                fontFamily:F,fontWeight:700,height:30,borderRadius:5,
                boxShadow:'0 2px 6px rgba(22,163,74,0.3)'}}>
              {saving?'Saving…':'✓ Save & Approve'}
            </button>
            <Sep/>
            <button onClick={resetForm} disabled={saving}
              style={{background:saving?'#F9FAFB':'#DC2626',color:saving?'#9CA3AF':'#fff',border:'none',
                padding:'0 12px',fontSize:12,cursor:saving?'default':'pointer',
                fontFamily:F,fontWeight:700,height:30,borderRadius:5}}>
              🗑 Clear
            </button>
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
