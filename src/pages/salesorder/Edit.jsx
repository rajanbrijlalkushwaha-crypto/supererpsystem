import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useCompany } from '../../context/CompanyContext';

/* ═══════════════════════════════════════════════════
   CONSTANTS
═══════════════════════════════════════════════════ */
const UNITS     = ['NOS','Kg','Ltr','Mtr','Box','Pcs','Set','Hr','Sqft','MT','Roll','Pair','Bag'];
const GST_RATES = [0, 5, 12, 18, 28];
const SALES_PERSONS = ['Rajesh Kumar','Priya Sharma','Amit Singh','Sunita Verma','Mohit Gupta'];

const TABS = [
  { id:'general',  label:'General',     icon:'📋' },
  { id:'items',    label:'Items',       icon:'📦' },
  { id:'pricing',  label:'Pricing',     icon:'💰' },
  { id:'delivery', label:'Delivery',    icon:'🚚' },
  { id:'payment',  label:'Payment',     icon:'💳' },
  { id:'specs',    label:'Specs',       icon:'📐' },
  { id:'matplan',  label:'Material Plan',icon:'🏗️' },
  { id:'scope',    label:'Scope',       icon:'🎯' },
  { id:'bom',      label:'BOM',         icon:'🔧' },
  { id:'tasks',    label:'Tasks',       icon:'📌' },
  { id:'attach',   label:'Attachments', icon:'📎' },
  { id:'notes',    label:'Notes',       icon:'📝' },
];

const SCOPE_TYPES      = ['Supply','Add-on Material','Installation','Transportation','Civil Work','Other'];
const TASK_STATUS      = ['Pending','In Progress','Completed'];
const PRIORITY         = ['Low','Medium','High','Critical'];
const SCOPE_WAREHOUSES = ['Main Store','Site Store','Raw Material','Finished Goods'];
const AUTO_TASKS       = { 'Supply':'Material Procurement & Delivery','Add-on Material':'Add-on Material Sourcing','Installation':'Site Installation','Transportation':'Dispatch & Transportation','Civil Work':'Civil Work Preparation','Other':'General Execution Task' };
const MAT_TYPES        = ['Purchase','Manufactured'];

const newScopeItem = () => ({ _id: Date.now()+Math.random(), scopeType:'Supply', description:'', qty:1, unit:'NOS', remarks:'' });
const newBOMItem   = () => ({ _id: Date.now()+Math.random(), itemCode:'', itemName:'', qty:1, unit:'NOS', warehouse:'Main Store', linkedScope:'' });
const newTask      = () => ({ _id: Date.now()+Math.random(), taskName:'', linkedScope:'', assignedTo:'', startDate:'', endDate:'', status:'Pending', priority:'Medium', remarks:'' });
const newMatItem   = () => ({ _id: Date.now()+Math.random(), unitGroup:'Cabin 1', itemName:'', itemType:'Purchase', requiredQty:1, unit:'NOS', bomRef:'', bomLines:[], remarks:'' });
const newBOMLine   = () => ({ _id: Date.now()+Math.random(), rawMaterial:'', qty:1, unit:'NOS' });

const newItem = () => ({
  _id: Date.now() + Math.random(),
  itemCode:'', itemName:'', description:'', hsnCode:'',
  qty:1, unit:'NOS', rate:'', discount:0, discountType:'%', gstPercent:18, amount:0
});

/* ═══════════════════════════════════════════════════
   DESIGN TOKENS — matches Create.jsx
═══════════════════════════════════════════════════ */
const P   = '#1B56B0';
const SEC = '#EAF0FA';
const BG  = '#EFF3F8';
const BD  = '#C9D6E8';

/* ═══════════════════════════════════════════════════
   STYLES
═══════════════════════════════════════════════════ */
const S = {
  page:  { fontFamily:"'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", color:'#1E293B', background:BG, minHeight:'100vh' },
  hdr:   { background:'linear-gradient(90deg,#122B54 0%,#1B3D72 100%)', padding:'0 24px', height:52, display:'flex', justifyContent:'space-between', alignItems:'center', position:'sticky', top:0, zIndex:100, boxShadow:'0 2px 10px rgba(0,0,0,0.22)' },
  card:  { background:'#fff', border:`1px solid ${BD}`, borderRadius:'10px', padding:0, marginBottom:'14px', boxShadow:'0 1px 4px rgba(18,43,84,0.07)', overflow:'hidden' },
  sec:   { fontSize:'13px', fontWeight:700, color:'#1a2d4a', background:SEC, padding:'10px 18px', borderBottom:`1px solid ${BD}`, margin:0, letterSpacing:'0.1px' },
  body:  { padding:'16px 18px' },
  lbl:   { fontSize:'12px', fontWeight:700, color:'#1E293B', marginBottom:'5px', display:'block', letterSpacing:'0.1px' },
  req:   { color:'#DC2626', marginLeft:'2px' },
  err:   { fontSize:'11px', color:'#DC2626', marginTop:'3px', fontWeight:600 },
  hint:  { fontSize:'11px', color:'#64748B', marginTop:'3px' },
  g2:    { display:'grid', gridTemplateColumns:'1fr 1fr', gap:'14px 22px' },
  g3:    { display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'14px 22px' },
  g4:    { display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr', gap:'14px 22px' },
  tbl:   { width:'100%', borderCollapse:'collapse', fontSize:'12px' },
  th:    { background:'#1B3D72', color:'#fff', padding:'9px 10px', textAlign:'left', fontWeight:600, fontSize:'11px', whiteSpace:'nowrap', borderRight:'1px solid rgba(255,255,255,0.15)' },
  td:    { padding:'7px 9px', border:`1px solid ${BD}`, background:'#fff', verticalAlign:'middle' },
  tdAlt: { padding:'7px 9px', border:`1px solid ${BD}`, background:'#F8FAFD', verticalAlign:'middle' },
};

function inp(err, sm) {
  return {
    width:'100%', padding: sm ? '5px 8px' : '8px 11px',
    border:`1px solid ${err?'#DC2626':BD}`,
    borderRadius: sm ? '5px' : '6px', fontSize: sm ? '12px' : '13px', fontFamily:'inherit',
    background:'#FAFCFF', color:'#1E293B', outline:'none', boxSizing:'border-box',
    transition:'border-color 0.15s, box-shadow 0.15s',
  };
}
function selStyle(sm) {
  return { width:'100%', padding: sm?'5px 8px':'8px 11px', border:`1px solid ${BD}`, borderRadius: sm?'5px':'6px', fontSize: sm?'12px':'13px', fontFamily:'inherit', background:'#FAFCFF', color:'#1E293B', outline:'none', cursor:'pointer', boxSizing:'border-box', transition:'border-color 0.15s' };
}

function F({ label, req, children, err, hint }) {
  return (
    <div>
      {label && <label style={S.lbl}>{label}{req && <span style={S.req}>*</span>}</label>}
      {children}
      {err && <div style={S.err}>{err}</div>}
      {!err && hint && <div style={S.hint}>{hint}</div>}
    </div>
  );
}
function FIn({ label, req, value, onChange, placeholder, err, hint, type='text', maxLength, upper, readOnly, sm }) {
  return (
    <F label={label} req={req} err={err} hint={hint}>
      <input type={type} value={value} maxLength={maxLength} placeholder={placeholder} readOnly={readOnly}
        onChange={e => onChange && onChange(upper ? e.target.value.toUpperCase() : e.target.value)}
        style={{ ...inp(err, sm), ...(readOnly ? { background:'#F0F4F8', cursor:'default' } : {}) }}
      />
    </F>
  );
}
function FSel({ label, req, value, onChange, options, err, placeholder='— Select —', sm }) {
  return (
    <F label={label} req={req} err={err}>
      <select value={value} onChange={e => onChange(e.target.value)} style={selStyle(sm)}>
        <option value="">{placeholder}</option>
        {options.map(o => typeof o === 'string'
          ? <option key={o} value={o}>{o}</option>
          : <option key={o.v} value={o.v}>{o.l}</option>
        )}
      </select>
    </F>
  );
}
function FTA({ label, req, value, onChange, placeholder, rows=3, err }) {
  return (
    <F label={label} req={req} err={err}>
      <textarea value={value} rows={rows} placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
        style={{ ...inp(err), resize:'vertical', minHeight: rows*22+'px' }}
      />
    </F>
  );
}

function Toast({ type, msg, onClose }) {
  useEffect(() => { const t = setTimeout(onClose, 5000); return () => clearTimeout(t); }, [onClose]);
  const ok = type === 'success';
  return (
    <div style={{
      position:'fixed', top:'20px', right:'24px', zIndex:9999,
      background: ok?'#E8F5E9':'#FFEBEB',
      border:`1px solid ${ok?'#82C98A':'#F5B8B8'}`,
      borderLeft:`4px solid ${ok?'#188918':'#BB0000'}`,
      borderRadius:'6px', padding:'13px 18px', minWidth:'300px',
      display:'flex', alignItems:'center', gap:'10px',
      boxShadow:'0 4px 20px rgba(0,0,0,0.14)',
    }}>
      <span style={{ fontSize:'17px' }}>{ok?'✅':'❌'}</span>
      <span style={{ fontSize:'12px', color: ok?'#0A6640':'#BB0000', fontWeight:600, flex:1 }}>{msg}</span>
      <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:'#6A6D70', fontSize:'17px' }}>×</button>
    </div>
  );
}

/* row calculation */
function calcRowAmt(it) {
  const base    = (parseFloat(it.qty)||0) * (parseFloat(it.rate)||0);
  const disc    = it.discountType === '%' ? base * (parseFloat(it.discount)||0)/100 : (parseFloat(it.discount)||0);
  const taxable = base - disc;
  const gst     = taxable * (parseFloat(it.gstPercent)||0)/100;
  return { base, disc, taxable, gst, total: taxable + gst };
}

/* ═══════════════════════════════════════════════════
   MAIN COMPONENT
═══════════════════════════════════════════════════ */
const EditSalesOrder = () => {
  const { orderId }         = useParams();
  const navigate            = useNavigate();
  const { selectedCompany } = useCompany();

  const [activeTab, setActiveTab] = useState('general');
  const [loading,   setLoading]   = useState(true);
  const [saving,    setSaving]    = useState(false);
  const [toast,     setToast]     = useState(null);
  const [errs,      setErrs]      = useState({});
  const [clients,   setClients]   = useState([]);
  const [showCustDD, setShowCustDD] = useState(false);
  const [custSearch, setCustSearch] = useState('');
  const custRef = useRef(null);

  /* ── Form state ── */
  const [hdr, setHdr] = useState({
    orderNo:'', orderDate:'', orderType:'Domestic', salesPerson:'',
    customerName:'', customerCode:'', customerGstin:'',
    contactPerson:'', mobile:'', email:'', customerState:'',
  });
  const [gen, setGen]         = useState({ customerPO:'', poDate:'', enquiryRef:'', quotationRef:'', deliveryDate:'', incoterms:'' });
  const [items, setItems]     = useState([newItem()]);
  const [pricing, setPricing] = useState({ overallDiscount:0, freightCharges:0, packingCharges:0, roundOff:0 });
  const [del, setDel]         = useState({ deliveryAddr:'', shippingAddr:'', dispatchMode:'Road', transporterName:'', vehicleNumber:'', deliveryInstructions:'' });
  const [pay, setPay]         = useState({ paymentTerms:'30 Days', paymentMode:'NEFT', billingTerms:'', creditLimit:'', dueDate:'' });
  const [specs, setSpecs]     = useState({ productSpecs:'', technicalDetails:'', drawingNumber:'', version:'', customFields:[] });

  /* ── Specification Sheet ── */
  const uid = () => Date.now() + Math.random();
  const newSpecRow     = ()       => ({ _id: uid(), description:'', qty:'', remarks:'' });
  const newSpecSubHead = ()       => ({ _id: uid(), title:'', rows:[newSpecRow()] });
  const newSpecHeader  = ()       => ({ _id: uid(), title:'', subHeaders:[newSpecSubHead()] });
  const newSpecGroup   = (item={})=> ({ _id: uid(), itemId: item._id||'', itemName: item.itemName||item.material||'', headers:[newSpecHeader()] });
  const [specSheet, setSpecSheet] = useState([]);

  const ssAddGroup = (item)           => setSpecSheet(s => [...s, newSpecGroup(item)]);
  const ssDelGroup = (gid)            => setSpecSheet(s => s.filter(g => g._id !== gid));
  const ssAddHdr   = (gid)            => setSpecSheet(s => s.map(g => g._id===gid ? {...g, headers:[...g.headers, newSpecHeader()]} : g));
  const ssDelHdr   = (gid,hid)        => setSpecSheet(s => s.map(g => g._id===gid ? {...g, headers:g.headers.filter(h=>h._id!==hid)} : g));
  const ssSetHdrT  = (gid,hid,v)      => setSpecSheet(s => s.map(g => g._id===gid ? {...g, headers:g.headers.map(h=>h._id===hid?{...h,title:v}:h)} : g));
  const ssAddSub   = (gid,hid)        => setSpecSheet(s => s.map(g => g._id===gid ? {...g, headers:g.headers.map(h=>h._id===hid?{...h,subHeaders:[...h.subHeaders,newSpecSubHead()]}:h)} : g));
  const ssDelSub   = (gid,hid,sid)    => setSpecSheet(s => s.map(g => g._id===gid ? {...g, headers:g.headers.map(h=>h._id===hid?{...h,subHeaders:h.subHeaders.filter(sh=>sh._id!==sid)}:h)} : g));
  const ssSetSubT  = (gid,hid,sid,v)  => setSpecSheet(s => s.map(g => g._id===gid ? {...g, headers:g.headers.map(h=>h._id===hid?{...h,subHeaders:h.subHeaders.map(sh=>sh._id===sid?{...sh,title:v}:sh)}:h)} : g));
  const ssAddRow   = (gid,hid,sid)    => setSpecSheet(s => s.map(g => g._id===gid ? {...g, headers:g.headers.map(h=>h._id===hid?{...h,subHeaders:h.subHeaders.map(sh=>sh._id===sid?{...sh,rows:[...sh.rows,newSpecRow()]}:sh)}:h)} : g));
  const ssDelRow   = (gid,hid,sid,rid)=> setSpecSheet(s => s.map(g => g._id===gid ? {...g, headers:g.headers.map(h=>h._id===hid?{...h,subHeaders:h.subHeaders.map(sh=>sh._id===sid?{...sh,rows:sh.rows.filter(r=>r._id!==rid)}:sh)}:h)} : g));
  const ssUpdRow   = (gid,hid,sid,rid,field,val)=> setSpecSheet(s => s.map(g => g._id===gid ? {...g, headers:g.headers.map(h=>h._id===hid?{...h,subHeaders:h.subHeaders.map(sh=>sh._id===sid?{...sh,rows:sh.rows.map(r=>r._id===rid?{...r,[field]:val}:r)}:sh)}:h)} : g));

  const loadSpecSheet = (saved) => {
    if (!Array.isArray(saved) || !saved.length) return;
    setSpecSheet(saved.map(g => ({
      _id: uid(), itemId: g.itemId||'', itemName: g.itemName||'',
      headers: (g.headers||[]).map(h => ({
        _id: uid(), title: h.title||'',
        subHeaders: (h.subHeaders||[]).map(sh => ({
          _id: uid(), title: sh.title||'',
          rows: (sh.rows||[]).map(r => ({ _id: uid(), description: r.description||'', qty: r.qty||'', remarks: r.remarks||'' })),
        })),
      })),
    })));
  };

  const [attachments, setAttachments] = useState([]);   // existing saved files
  const [newFiles,    setNewFiles]    = useState([]);   // new file objects to upload
  const [notes, setNotes]     = useState({ termsConditions:'', internalNotes:'', customerNotes:'' });
  const [scopeItems, setScopeItems] = useState([]);
  const [bomItems,   setBOMItems]   = useState([]);
  const [tasks,      setTasks]      = useState([]);
  const [matPlan,    setMatPlan]    = useState([]);

  /* ── Load order data ── */
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await axios.get(`/api/sales-orders/${orderId}`);
        const o   = res.data;

        setHdr({
          orderNo:       o.orderNo       || o.voucherNumber || String(o.orderId || orderId),
          orderDate:     o.orderDate     || o.date          || '',
          orderType:     o.orderType     || 'Domestic',
          salesPerson:   o.salesPerson   || '',
          customerName:  o.customerName  || o.party         || '',
          customerCode:  o.customerCode  || '',
          customerGstin: o.customerGstin || o.partyGstin    || '',
          contactPerson: o.contactPerson || '',
          mobile:        o.mobile        || '',
          email:         o.email         || '',
          customerState: o.customerState || o.stateName     || '',
        });
        setGen({
          customerPO:   o.customerPO   || o.reference   || '',
          poDate:       o.poDate       || '',
          enquiryRef:   o.enquiryRef   || '',
          quotationRef: o.quotationRef || o.orderRef     || '',
          deliveryDate: o.deliveryDate || '',
          incoterms:    o.incoterms    || '',
        });
        // Normalize items: support both old (quantity) and new (qty) field
        const loadedItems = (o.items || []).length > 0
          ? o.items.map(it => ({
              _id:          Date.now() + Math.random(),
              itemCode:     it.itemCode     || '',
              itemName:     it.itemName     || '',
              description:  it.description  || '',
              hsnCode:      it.hsnCode      || '',
              qty:          it.qty          || it.quantity || 1,
              unit:         it.unit         || 'NOS',
              rate:         it.rate         || '',
              discount:     it.discount     || 0,
              discountType: it.discountType || '%',
              gstPercent:   it.gstPercent   || it.gstPercent === 0 ? (it.gstPercent || 0) : 18,
              amount:       it.amount       || 0,
            }))
          : [newItem()];
        setItems(loadedItems);
        setPricing({
          overallDiscount: o.overallDiscount || 0,
          freightCharges:  o.freightCharges  || 0,
          packingCharges:  o.packingCharges  || 0,
          roundOff:        o.roundOff        || 0,
        });
        setDel({
          deliveryAddr:         o.deliveryAddr         || o.destination    || '',
          shippingAddr:         o.shippingAddr         || '',
          dispatchMode:         o.dispatchMode         || o.shippedBy      || 'Road',
          transporterName:      o.transporterName      || '',
          vehicleNumber:        o.vehicleNumber        || '',
          deliveryInstructions: o.deliveryInstructions || '',
        });
        setPay({
          paymentTerms: o.paymentTerms || '30 Days',
          paymentMode:  o.paymentMode  || 'NEFT',
          billingTerms: o.billingTerms || '',
          creditLimit:  o.creditLimit  || '',
          dueDate:      o.dueDate      || '',
        });
        setSpecs({
          productSpecs:     o.productSpecs     || '',
          technicalDetails: o.technicalDetails || '',
          drawingNumber:    o.drawingNumber    || '',
          version:          o.version          || '',
          customFields:     o.customFields     || [],
        });
        // Existing attachments
        const existingAtt = o.attachments || o.documents || [];
        setAttachments(existingAtt.map(a => ({
          name:        a.name || '',
          fileName:    a.fileName || null,
          replaceMode: false,
          replaceFile: null,
        })));
        setNotes({
          termsConditions: o.termsConditions || '',
          internalNotes:   o.internalNotes   || o.narration || '',
          customerNotes:   o.customerNotes   || '',
        });
        loadSpecSheet(o.specSheet || []);
        setScopeItems(o.scopeItems || []);
        setBOMItems(o.bomItems     || []);
        setTasks(o.tasks           || []);
        setMatPlan(o.materialPlanningItems || []);
      } catch (err) {
        setToast({ type:'error', msg:'Error loading order: ' + err.message });
      } finally {
        setLoading(false);
      }
    })();
  }, [orderId]);

  /* ── Load clients list ── */
  useEffect(() => {
    const cid = selectedCompany?.companyId;
    if (cid) axios.get('/api/clients', { params:{ companyId: cid } }).then(r => setClients(r.data||[])).catch(()=>{});
  }, [selectedCompany]);

  /* ── Auto due date ── */
  useEffect(() => {
    if (!hdr.orderDate || !pay.paymentTerms) return;
    const days = parseInt(pay.paymentTerms) || 0;
    if (days > 0) {
      const d = new Date(hdr.orderDate);
      d.setDate(d.getDate() + days);
      setPay(p => ({ ...p, dueDate: d.toISOString().split('T')[0] }));
    }
  }, [hdr.orderDate, pay.paymentTerms]);

  /* ── Close dropdown outside click ── */
  useEffect(() => {
    const fn = e => { if (custRef.current && !custRef.current.contains(e.target)) setShowCustDD(false); };
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, []);

  const setH = (k, v) => setHdr(h => ({ ...h, [k]: v }));

  const selectCustomer = useCallback(c => {
    const cp0 = (c.contactPersons||[])[0]||{};
    setHdr(h => ({
      ...h,
      customerName:  c.companyName||c.clientName||'',
      customerCode:  String(c.clientId||''),
      customerGstin: c.gstin||c.gst||'',
      contactPerson: cp0.name||'',
      mobile:        cp0.mobileNumber||'',
      email:         cp0.email||'',
      customerState: c.state||'',
    }));
    setDel(d => ({ ...d, deliveryAddr: c.address||'', shippingAddr: c.shippingAddr||c.address||'' }));
    setShowCustDD(false); setCustSearch('');
  }, []);

  /* ── Item helpers ── */
  const updItem = (id, k, v) => setItems(p => p.map(it => it._id===id ? { ...it, [k]:v } : it));
  const addRow  = () => setItems(p => [...p, newItem()]);
  const delRow  = id => setItems(p => p.length > 1 ? p.filter(it => it._id!==id) : p);
  const dupWarn = name => name && items.filter(it => it.itemName===name).length > 1;

  /* ── Calculations ── */
  const rows       = items.map(it => ({ ...it, calc: calcRowAmt(it) }));
  const subTotal   = rows.reduce((s,r) => s + r.calc.taxable, 0);
  const totalGST   = rows.reduce((s,r) => s + r.calc.gst, 0);
  const isIntra    = hdr.customerState && selectedCompany?.state && hdr.customerState === selectedCompany.state;
  const cgst       = isIntra ? totalGST/2 : 0;
  const sgst       = isIntra ? totalGST/2 : 0;
  const igst       = !isIntra ? totalGST : 0;
  const overDisc   = parseFloat(pricing.overallDiscount)||0;
  const freight    = parseFloat(pricing.freightCharges)||0;
  const packing    = parseFloat(pricing.packingCharges)||0;
  const roundOff   = parseFloat(pricing.roundOff)||0;
  const grandTotal = subTotal - overDisc + totalGST + freight + packing + roundOff;

  /* ── New file attachments ── */
  const handleNewFiles = e => {
    const files = Array.from(e.target.files);
    setNewFiles(p => [...p, ...files.map(f => ({ file:f, name:f.name, size:f.size }))]);
    e.target.value = '';
  };
  const removeNewFile = i => setNewFiles(p => p.filter((_,j) => j!==i));

  /* ── Existing attachment actions ── */
  const startReplace  = i => setAttachments(p => p.map((a,j) => j===i ? {...a,replaceMode:true,replaceFile:null} : a));
  const cancelReplace = i => setAttachments(p => p.map((a,j) => j===i ? {...a,replaceMode:false,replaceFile:null} : a));
  const setReplFile   = (i, f) => setAttachments(p => p.map((a,j) => j===i ? {...a,replaceFile:f} : a));
  const removeAtt     = i => setAttachments(p => p.filter((_,j) => j!==i));

  /* ── Spec custom fields ── */
  const addCF = () => setSpecs(s => ({ ...s, customFields:[...s.customFields, { key:'', value:'' }] }));
  const updCF = (i,k,v) => setSpecs(s => ({ ...s, customFields: s.customFields.map((f,j) => j===i ? {...f,[k]:v} : f) }));
  const delCF = i => setSpecs(s => ({ ...s, customFields: s.customFields.filter((_,j) => j!==i) }));

  /* ── Material Plan helpers ── */
  const updMat     = (id,k,v)     => setMatPlan(p=>p.map(m=>m._id===id?{...m,[k]:v}:m));
  const delMat     = id           => setMatPlan(p=>p.length>1?p.filter(m=>m._id!==id):p);
  const updBOMLine = (mid,lid,k,v)=> setMatPlan(p=>p.map(m=>m._id===mid?{...m,bomLines:m.bomLines.map(bl=>bl._id===lid?{...bl,[k]:v}:bl)}:m));
  const addBOMLine = mid          => setMatPlan(p=>p.map(m=>m._id===mid?{...m,bomLines:[...m.bomLines,newBOMLine()]}:m));
  const delBOMLine = (mid,lid)    => setMatPlan(p=>p.map(m=>m._id===mid?{...m,bomLines:m.bomLines.filter(bl=>bl._id!==lid)}:m));

  /* ── Scope / BOM / Task helpers ── */
  const updScope = (id,k,v) => setScopeItems(p => p.map(s => s._id===id ? {...s,[k]:v} : s));
  const delScope = id => setScopeItems(p => p.length > 1 ? p.filter(s => s._id!==id) : p);
  const updBOM   = (id,k,v) => setBOMItems(p => p.map(b => b._id===id ? {...b,[k]:v} : b));
  const delBOM   = id => setBOMItems(p => p.filter(b => b._id!==id));
  const updTask  = (id,k,v) => setTasks(p => p.map(t => t._id===id ? {...t,[k]:v} : t));
  const delTask  = id => setTasks(p => p.filter(t => t._id!==id));
  const autoGenBOM = () => {
    const g = scopeItems.filter(s=>s.description.trim()).map(s=>({...newBOMItem(),itemName:s.description,qty:s.qty,unit:s.unit,linkedScope:s.scopeType}));
    if (g.length) setBOMItems(g);
  };
  const autoGenTasks = () => {
    const g = scopeItems.map(s=>({...newTask(),taskName:AUTO_TASKS[s.scopeType]||'General Task',linkedScope:s.scopeType,endDate:gen.deliveryDate||''}));
    if (g.length) setTasks(g);
  };

  /* ── Validate ── */
  const validate = () => {
    const e = {};
    if (!hdr.customerName.trim()) e.customerName = 'Customer is required';
    if (!hdr.orderDate)           e.orderDate    = 'Order date is required';
    if (items.every(it => !it.itemName.trim())) e.items = 'At least one item is required';
    setErrs(e);
    return e;
  };

  /* ── Submit ── */
  const handleSave = async (status) => {
    const e = validate();
    if (Object.keys(e).length > 0) {
      if (e.customerName || e.orderDate) setActiveTab('general');
      else if (e.items) setActiveTab('items');
      setToast({ type:'error', msg:'Please fix the errors before saving.' });
      return;
    }
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append('companyId', selectedCompany?.companyId || '');
      fd.append('status',    status);

      Object.entries(hdr).forEach(([k,v]) => fd.append(k, v));
      Object.entries(gen).forEach(([k,v]) => fd.append(k, v));
      Object.entries(pricing).forEach(([k,v]) => fd.append(k, v));
      Object.entries(del).forEach(([k,v]) => fd.append(k, v));
      Object.entries(pay).forEach(([k,v]) => fd.append(k, v));
      fd.append('productSpecs',     specs.productSpecs);
      fd.append('technicalDetails', specs.technicalDetails);
      fd.append('drawingNumber',    specs.drawingNumber);
      fd.append('version',          specs.version);
      fd.append('customFields',     JSON.stringify(specs.customFields));
      Object.entries(notes).forEach(([k,v]) => fd.append(k, v));
      fd.append('subTotal',   subTotal.toFixed(2));
      fd.append('totalGST',   totalGST.toFixed(2));
      fd.append('grandTotal', grandTotal.toFixed(2));
      fd.append('cgst',       cgst.toFixed(2));
      fd.append('sgst',       sgst.toFixed(2));
      fd.append('igst',       igst.toFixed(2));

      fd.append('items', JSON.stringify(rows.map(r => ({
        itemCode: r.itemCode, itemName: r.itemName, description: r.description,
        hsnCode: r.hsnCode, qty: r.qty, unit: r.unit, rate: r.rate,
        discount: r.discount, discountType: r.discountType, gstPercent: r.gstPercent,
        amount: r.calc.total.toFixed(2),
      }))));

      // Keep existing attachments (minus replaced/removed ones)
      const keepAtt = attachments.filter(a => !a.replaceFile).map(a => ({ name: a.name, ...(a.fileName ? { fileName: a.fileName } : {}) }));
      fd.append('attachments', JSON.stringify(keepAtt));

      // Upload: new files + replacement files
      const toUpload = [
        ...newFiles,
        ...attachments.filter(a => a.replaceFile).map(a => ({ file: a.replaceFile, name: a.name })),
      ];
      toUpload.forEach(a => fd.append('attachmentFiles', a.file));
      fd.append('specSheet',  JSON.stringify(specSheet.map(({ _id, ...g }) => ({
        ...g,
        headers: (g.headers||[]).map(({ _id:_hid, ...h }) => ({
          ...h,
          subHeaders: (h.subHeaders||[]).map(({ _id:_sid, ...sh }) => ({
            ...sh,
            rows: (sh.rows||[]).map(({ _id:_rid, ...r }) => r),
          })),
        })),
      }))));
      fd.append('scopeItems', JSON.stringify(scopeItems.map(({ _id, ...s }) => s)));
      fd.append('bomItems',   JSON.stringify(bomItems.map(({ _id, ...b }) => b)));
      fd.append('tasks',      JSON.stringify(tasks.map(({ _id, ...t }) => t)));
      fd.append('materialPlanningItems', JSON.stringify(matPlan.map(({ _id, ...m }) => ({
        ...m, bomLines: (m.bomLines||[]).map(({ _id:_bid, ...bl }) => bl)
      }))));

      await axios.put(`/api/sales-orders/${orderId}`, fd, { headers:{ 'Content-Type':'multipart/form-data' } });
      setToast({ type:'success', msg:`Sales Order ${hdr.orderNo} updated successfully!` });
      setTimeout(() => navigate('/sales-order/view'), 2000);
    } catch (err) {
      setToast({ type:'error', msg:'Error: ' + (err.response?.data?.error || err.message) });
    } finally {
      setSaving(false);
    }
  };

  const tabIdx = TABS.findIndex(t => t.id === activeTab);
  const filteredClients = clients.filter(c =>
    (c.companyName||c.clientName||'').toLowerCase().includes(custSearch.toLowerCase()) ||
    String(c.clientId||'').includes(custSearch)
  );

  /* ── Loading state ── */
  if (loading) {
    return (
      <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'350px', flexDirection:'column', gap:'12px', fontFamily:'inherit' }}>
        <div style={{ width:'36px', height:'36px', border:`3px solid ${BD}`, borderTopColor:P, borderRadius:'50%', animation:'spin 0.8s linear infinite' }} />
        <div style={{ fontSize:'13px', color:'#6A6D70' }}>Loading sales order…</div>
        <style>{`@keyframes spin { to { transform:rotate(360deg); } }`}</style>
      </div>
    );
  }

  /* ════════════════════════════════════════════════
     RENDER
  ════════════════════════════════════════════════ */
  return (
    <div style={S.page}>
      {toast && <Toast type={toast.type} msg={toast.msg} onClose={() => setToast(null)} />}

      {/* ── Sticky Header ── */}
      <div style={S.hdr}>
        <div>
          <div style={{ fontSize:'10px', color:'#A8C4E0', letterSpacing:'0.6px', marginBottom:'1px' }}>SALES ORDER MANAGEMENT — VA02</div>
          <div style={{ fontSize:'15px', fontWeight:700, color:'#fff' }}>
            Edit Sales Order&nbsp;&nbsp;
            <span style={{ fontFamily:'monospace', color:'#90CAF9', fontSize:'13px' }}>#{hdr.orderNo || orderId}</span>
          </div>
        </div>
        <div style={{ display:'flex', gap:'8px' }}>
          <button onClick={() => navigate('/sales-order/view')}
            style={{ background:'transparent', border:'1.5px solid rgba(255,255,255,0.4)', color:'rgba(255,255,255,0.85)', padding:'7px 14px', borderRadius:'6px', cursor:'pointer', fontSize:'12px', fontWeight:500, fontFamily:'inherit' }}
            onMouseEnter={e=>{e.currentTarget.style.background='rgba(255,255,255,0.1)';e.currentTarget.style.color='#fff';}}
            onMouseLeave={e=>{e.currentTarget.style.background='transparent';e.currentTarget.style.color='rgba(255,255,255,0.85)';}}>
            ← Cancel
          </button>
          <button onClick={() => handleSave('draft')} disabled={saving}
            style={{ background:'rgba(255,255,255,0.12)', border:'1.5px solid rgba(255,255,255,0.5)', color:'#fff', padding:'7px 16px', borderRadius:'6px', cursor:'pointer', fontSize:'12px', fontWeight:600, fontFamily:'inherit' }}
            onMouseEnter={e=>{e.currentTarget.style.background='rgba(255,255,255,0.2)';}}
            onMouseLeave={e=>{e.currentTarget.style.background='rgba(255,255,255,0.12)';}}>
            {saving ? '…' : 'Save Draft'}
          </button>
          <button onClick={() => handleSave('pending')} disabled={saving}
            style={{ background:'#fff', border:'2px solid #fff', color:P, padding:'7px 20px', borderRadius:'6px', cursor:saving?'default':'pointer', fontSize:'12px', fontWeight:700, fontFamily:'inherit', opacity:saving?0.7:1 }}
            onMouseEnter={e=>{ if(!saving) e.currentTarget.style.background='#EAF0FA'; }}
            onMouseLeave={e=>{ e.currentTarget.style.background='#fff'; }}>
            {saving ? 'Saving…' : '✓ Update Order'}
          </button>
        </div>
      </div>

      <div style={{ padding:'16px 20px' }}>

        {/* ── Order Header Card ── */}
        <div style={{ ...S.card, marginBottom:'12px' }}>
          <div style={S.sec}>Order Header</div>
          <div style={S.body}>
          <div style={S.g4}>
            <FIn label="Sales Order No" value={hdr.orderNo} readOnly hint="System ID — read only" />
            <div>
              <label style={S.lbl}>Order Date <span style={S.req}>*</span></label>
              <input type="date" value={hdr.orderDate} onChange={e => setH('orderDate',e.target.value)} style={inp(errs.orderDate)} />
              {errs.orderDate && <div style={S.err}>{errs.orderDate}</div>}
            </div>
            <FSel label="Order Type" value={hdr.orderType} onChange={v => setH('orderType',v)} options={['Domestic','Export','Project','Service']} />
            <FSel label="Sales Person" value={hdr.salesPerson} onChange={v => setH('salesPerson',v)} options={SALES_PERSONS} placeholder="— Assign —" />
          </div>

          {/* Customer row */}
          <div style={{ marginTop:'10px', display:'grid', gridTemplateColumns:'2fr 1fr 1fr 1fr 1fr', gap:'10px 18px', alignItems:'end' }}>
            <div ref={custRef} style={{ position:'relative' }}>
              <label style={S.lbl}>Customer Name <span style={S.req}>*</span></label>
              <input
                value={showCustDD ? custSearch : hdr.customerName}
                onChange={e => { setCustSearch(e.target.value); setH('customerName',''); setShowCustDD(true); }}
                onFocus={() => setShowCustDD(true)}
                placeholder="Search or type customer…"
                style={{ ...inp(errs.customerName), width:'100%' }}
              />
              {errs.customerName && <div style={S.err}>{errs.customerName}</div>}
              {showCustDD && filteredClients.length > 0 && (
                <div style={{ position:'absolute', top:'100%', left:0, right:0, background:'#fff', border:'1px solid #D9D9D9', borderRadius:'4px', boxShadow:'0 4px 16px rgba(0,0,0,0.12)', zIndex:200, maxHeight:'180px', overflowY:'auto' }}>
                  {filteredClients.slice(0,20).map(c => (
                    <div key={c.clientId} onClick={() => selectCustomer(c)}
                      style={{ padding:'7px 12px', cursor:'pointer', borderBottom:'1px solid #F0F0F0', fontSize:'12px' }}
                      onMouseEnter={e => e.currentTarget.style.background=SEC}
                      onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                      <span style={{ fontWeight:600 }}>{c.companyName||c.clientName}</span>
                      <span style={{ color:'#6A6D70', marginLeft:'8px', fontSize:'11px' }}>#{c.clientId}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <FIn label="Customer Code" value={hdr.customerCode} onChange={v => setH('customerCode',v)} readOnly={!!hdr.customerCode} />
            <FIn label="Contact Person" value={hdr.contactPerson} onChange={v => setH('contactPerson',v)} />
            <FIn label="Mobile" value={hdr.mobile} onChange={v => setH('mobile',v)} />
            <FIn label="Email" value={hdr.email} onChange={v => setH('email',v)} />
          </div>
          </div>{/* end S.body */}
        </div>

        {/* ── Tab Bar ── */}
        <div style={{ background:'#fff', border:`1px solid ${BD}`, display:'flex', overflowX:'auto', borderBottom:`1px solid ${BD}`, borderRadius:'10px 10px 0 0', padding:'0 8px', boxShadow:`0 1px 0 ${BD}` }}>
          {TABS.map(t => {
            const active  = activeTab === t.id;
            const hasErr  = (t.id==='general' && (errs.customerName||errs.orderDate)) || (t.id==='items' && errs.items);
            return (
              <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
                display:'flex', alignItems:'center', gap:'5px', padding:'11px 14px',
                cursor:'pointer', background:'transparent',
                border:'none', borderBottom: active?`2.5px solid ${P}`:'2.5px solid transparent',
                color: hasErr?'#EF4444': active?P:'#6B7280',
                fontSize:'12px', fontWeight: active?600:400, fontFamily:'inherit',
                whiteSpace:'nowrap', position:'relative', transition:'color 0.15s',
              }}>
                <span style={{ fontSize:'13px' }}>{t.icon}</span>
                {t.label}
                {hasErr && <span style={{ width:'6px', height:'6px', borderRadius:'50%', background:'#EF4444', position:'absolute', top:'8px', right:'3px' }} />}
              </button>
            );
          })}
        </div>

        {/* ── Tab Content ── */}
        <div style={{ background:BG, border:`1px solid ${BD}`, borderTop:'none', borderRadius:'0 0 10px 10px', padding:'16px', minHeight:'400px' }}>

          {/* ══ TAB 1: General ══ */}
          {activeTab === 'general' && (
            <div style={S.card}>
              <div style={S.sec}>Order References & Dates</div>
              <div style={S.body}>
              <div style={S.g3}>
                <FIn label="Customer PO Number" value={gen.customerPO} onChange={v => setGen(g=>({...g,customerPO:v}))} placeholder="PO-XXXX" />
                <div>
                  <label style={S.lbl}>PO Date</label>
                  <input type="date" value={gen.poDate} onChange={e => setGen(g=>({...g,poDate:e.target.value}))} style={inp()} />
                </div>
                <FIn label="Enquiry Reference" value={gen.enquiryRef} onChange={v => setGen(g=>({...g,enquiryRef:v}))} placeholder="ENQ-XXXX" />
                <FIn label="Quotation Reference" value={gen.quotationRef} onChange={v => setGen(g=>({...g,quotationRef:v}))} placeholder="QT-XXXX" />
                <div>
                  <label style={S.lbl}>Requested Delivery Date</label>
                  <input type="date" value={gen.deliveryDate} onChange={e => setGen(g=>({...g,deliveryDate:e.target.value}))} style={inp()} />
                </div>
                <FSel label="Incoterms" value={gen.incoterms} onChange={v => setGen(g=>({...g,incoterms:v}))}
                  options={['EXW','FCA','FAS','FOB','CFR','CIF','CPT','CIP','DPU','DAP','DDP']} placeholder="— Select —" />
              </div>
            </div>{/* end S.body */}
            </div>
          )}

          {/* ══ TAB 2: Items ══ */}
          {activeTab === 'items' && (
            <div style={S.card}>
              <div style={{ ...S.sec, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <span>Item Details</span>
                <button type="button" onClick={addRow} style={{ padding:'5px 14px', background:P, border:'none', color:'#fff', borderRadius:'4px', cursor:'pointer', fontSize:'12px', fontWeight:600, fontFamily:'inherit' }}>+ Add Row</button>
              </div>
              <div style={S.body}>
              {errs.items && <div style={{ ...S.err, marginBottom:'8px' }}>{errs.items}</div>}
              <div style={{ overflowX:'auto' }}>
                <table style={S.tbl}>
                  <thead>
                    <tr>
                      <th style={{ ...S.th, width:'32px' }}>#</th>
                      <th style={{ ...S.th, width:'90px' }}>Item Code</th>
                      <th style={{ ...S.th, minWidth:'140px' }}>Item Name *</th>
                      <th style={{ ...S.th, minWidth:'120px' }}>Description</th>
                      <th style={{ ...S.th, width:'75px' }}>HSN/SAC</th>
                      <th style={{ ...S.th, width:'58px' }}>Qty</th>
                      <th style={{ ...S.th, width:'65px' }}>Unit</th>
                      <th style={{ ...S.th, width:'85px' }}>Rate (₹)</th>
                      <th style={{ ...S.th, width:'85px' }}>Disc (%/₹)</th>
                      <th style={{ ...S.th, width:'65px' }}>GST %</th>
                      <th style={{ ...S.th, width:'95px' }}>Amount (₹)</th>
                      <th style={{ ...S.th, width:'36px' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((it, idx) => {
                      const bg  = idx%2===0 ? S.td : S.tdAlt;
                      const dup = dupWarn(it.itemName);
                      return (
                        <tr key={it._id}>
                          <td style={{ ...bg, textAlign:'center', fontWeight:600, color:'#6A6D70', fontSize:'11px' }}>{idx+1}</td>
                          <td style={bg}><input value={it.itemCode} onChange={e => updItem(it._id,'itemCode',e.target.value)} style={{ ...inp(false,true), minWidth:'80px' }} placeholder="CODE" /></td>
                          <td style={{ ...bg, ...(dup?{background:'#FFF9E6'}:{}) }}>
                            <input value={it.itemName} onChange={e => updItem(it._id,'itemName',e.target.value)} style={{ ...inp(dup,true), minWidth:'130px' }} placeholder="Item name" />
                            {dup && <div style={{ fontSize:'10px', color:'#E9730C', marginTop:'1px' }}>⚠ Duplicate</div>}
                          </td>
                          <td style={bg}><input value={it.description} onChange={e => updItem(it._id,'description',e.target.value)} style={{ ...inp(false,true), minWidth:'110px' }} placeholder="Description" /></td>
                          <td style={bg}><input value={it.hsnCode} onChange={e => updItem(it._id,'hsnCode',e.target.value)} style={{ ...inp(false,true), minWidth:'65px' }} placeholder="HSN" /></td>
                          <td style={bg}><input type="number" value={it.qty} min="0" onChange={e => updItem(it._id,'qty',e.target.value)} style={{ ...inp(false,true), minWidth:'48px', textAlign:'right' }} /></td>
                          <td style={bg}><select value={it.unit} onChange={e => updItem(it._id,'unit',e.target.value)} style={{ ...selStyle(true), minWidth:'55px' }}>{UNITS.map(u=><option key={u}>{u}</option>)}</select></td>
                          <td style={bg}><input type="number" value={it.rate} min="0" onChange={e => updItem(it._id,'rate',e.target.value)} style={{ ...inp(false,true), minWidth:'75px', textAlign:'right' }} placeholder="0.00" /></td>
                          <td style={bg}>
                            <div style={{ display:'flex', gap:'2px' }}>
                              <input type="number" value={it.discount} min="0" onChange={e => updItem(it._id,'discount',e.target.value)} style={{ ...inp(false,true), flex:1, minWidth:'44px', textAlign:'right' }} />
                              <select value={it.discountType} onChange={e => updItem(it._id,'discountType',e.target.value)} style={{ width:'36px', padding:'5px 2px', border:'1px solid #BBBCBD', borderRadius:'4px', fontSize:'11px', background:'#F0F0F0' }}>
                                <option value="%">%</option><option value="₹">₹</option>
                              </select>
                            </div>
                          </td>
                          <td style={bg}><select value={it.gstPercent} onChange={e => updItem(it._id,'gstPercent',e.target.value)} style={{ ...selStyle(true), minWidth:'55px' }}>{GST_RATES.map(r=><option key={r} value={r}>{r}%</option>)}</select></td>
                          <td style={{ ...bg, textAlign:'right', fontWeight:600, color:P, paddingRight:'8px' }}>₹{it.calc.total.toFixed(2)}</td>
                          <td style={{ ...bg, textAlign:'center' }}>
                            <button type="button" onClick={() => delRow(it._id)} style={{ background:'#FFEBEB', border:'1px solid #F5B8B8', color:'#BB0000', borderRadius:'3px', padding:'3px 7px', cursor:'pointer', fontSize:'11px', fontWeight:700 }}>✕</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div style={{ display:'flex', justifyContent:'flex-end', marginTop:'10px' }}>
                <div style={{ minWidth:'240px', background:BG, border:`1px solid ${BD}`, borderRadius:'4px', padding:'10px 14px' }}>
                  {[['Subtotal (Taxable)', `₹${subTotal.toFixed(2)}`], ['Total GST', `₹${totalGST.toFixed(2)}`]].map(([k,v]) => (
                    <div key={k} style={{ display:'flex', justifyContent:'space-between', fontSize:'12px', marginBottom:'5px' }}>
                      <span style={{ color:'#6A6D70' }}>{k}</span><span style={{ fontWeight:600 }}>{v}</span>
                    </div>
                  ))}
                  <div style={{ display:'flex', justifyContent:'space-between', fontSize:'13px', fontWeight:700, color:P, borderTop:`1px solid ${BD}`, paddingTop:'6px', marginTop:'4px' }}>
                    <span>Line Total</span><span>₹{(subTotal+totalGST).toFixed(2)}</span>
                  </div>
                </div>
              </div>
            </div>{/* end S.body */}
            </div>
          )}

          {/* ══ TAB 3: Pricing ══ */}
          {activeTab === 'pricing' && (
            <div style={S.card}>
              <div style={S.sec}>Pricing & Tax Summary</div>
              <div style={S.body}>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'14px' }}>
                <div style={{ background:BG, border:`1px solid ${BD}`, borderRadius:'4px', padding:'12px' }}>
                  <div style={{ fontSize:'11px', fontWeight:700, color:'#1a2d4a', marginBottom:'10px', textTransform:'uppercase', letterSpacing:'0.4px' }}>Adjustments</div>
                  {[
                    ['Overall Discount (₹)', 'overallDiscount'],
                    ['Freight Charges (₹)', 'freightCharges'],
                    ['Packing Charges (₹)', 'packingCharges'],
                    ['Round Off (₹)',        'roundOff'],
                  ].map(([lbl, key]) => (
                    <div key={key} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:'12px', marginBottom:'8px' }}>
                      <label style={{ ...S.lbl, margin:0, minWidth:'150px' }}>{lbl}</label>
                      <input type="number" value={pricing[key]} onChange={e => setPricing(p=>({...p,[key]:e.target.value}))} style={{ ...inp(false,true), width:'100px', textAlign:'right' }} />
                    </div>
                  ))}
                </div>
                <div style={{ background:BG, border:`1px solid ${BD}`, borderRadius:'4px', padding:'12px' }}>
                  <div style={{ fontSize:'11px', fontWeight:700, color:'#1a2d4a', marginBottom:'10px', textTransform:'uppercase', letterSpacing:'0.4px' }}>
                    Tax — {isIntra ? 'Intrastate (CGST+SGST)' : 'Interstate (IGST)'}
                  </div>
                  {[
                    ['Subtotal',        `₹${subTotal.toFixed(2)}`],
                    ['Discount',        `-₹${overDisc.toFixed(2)}`],
                    isIntra ? ['CGST', `₹${cgst.toFixed(2)}`] : ['IGST', `₹${igst.toFixed(2)}`],
                    ...(isIntra ? [['SGST', `₹${sgst.toFixed(2)}`]] : []),
                    ['Freight',  `+₹${freight.toFixed(2)}`],
                    ['Packing',  `+₹${packing.toFixed(2)}`],
                    ['Round Off',`${roundOff>=0?'+':''}₹${roundOff.toFixed(2)}`],
                  ].map(([k,v]) => (
                    <div key={k} style={{ display:'flex', justifyContent:'space-between', fontSize:'12px', marginBottom:'6px' }}>
                      <span style={{ color:'#6A6D70' }}>{k}</span><span style={{ fontFamily:'monospace' }}>{v}</span>
                    </div>
                  ))}
                  <div style={{ borderTop:`2px solid ${P}`, paddingTop:'8px', marginTop:'6px', display:'flex', justifyContent:'space-between', fontSize:'15px', fontWeight:700, color:P }}>
                    <span>Grand Total</span><span>₹{grandTotal.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            </div>{/* end S.body */}
            </div>
          )}

          {/* ══ TAB 4: Delivery ══ */}
          {activeTab === 'delivery' && (
            <div style={S.card}>
              <div style={S.sec}>Delivery & Dispatch Details</div>
              <div style={S.body}>
              <div style={S.g2}>
                <FTA label="Delivery Address" req value={del.deliveryAddr} onChange={v => setDel(d=>({...d,deliveryAddr:v}))} placeholder="Full delivery address…" rows={3} />
                <div>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'3px' }}>
                    <label style={S.lbl}>Shipping Address</label>
                    <button type="button" onClick={() => setDel(d=>({...d,shippingAddr:d.deliveryAddr}))} style={{ fontSize:'10px', color:P, background:SEC, border:`1px solid ${BD}`, borderRadius:'3px', padding:'2px 8px', cursor:'pointer' }}>Copy from Delivery</button>
                  </div>
                  <textarea value={del.shippingAddr} rows={3} onChange={e => setDel(d=>({...d,shippingAddr:e.target.value}))}
                    placeholder="Leave blank if same…" style={{ ...inp(false), resize:'vertical', minHeight:'66px' }} />
                </div>
              </div>
              <div style={{ ...S.g3, marginTop:'10px' }}>
                <FSel label="Dispatch Mode" value={del.dispatchMode} onChange={v => setDel(d=>({...d,dispatchMode:v}))} options={['Road','Rail','Air','Sea','Courier','Hand Delivery']} />
                <FIn label="Transporter Name" value={del.transporterName} onChange={v => setDel(d=>({...d,transporterName:v}))} placeholder="Transporter / Courier name" />
                <FIn label="Vehicle Number" value={del.vehicleNumber} onChange={v => setDel(d=>({...d,vehicleNumber:v.toUpperCase()}))} placeholder="MH12AB1234" />
              </div>
              <div style={{ marginTop:'10px' }}>
                <FTA label="Delivery Instructions" value={del.deliveryInstructions} onChange={v => setDel(d=>({...d,deliveryInstructions:v}))} placeholder="Special delivery instructions…" rows={2} />
              </div>
              </div>{/* end S.body */}
            </div>
          )}

          {/* ══ TAB 5: Payment ══ */}
          {activeTab === 'payment' && (
            <div style={S.card}>
              <div style={S.sec}>Payment Configuration</div>
              <div style={S.body}>
              <div style={S.g3}>
                <FSel label="Payment Terms" value={pay.paymentTerms} onChange={v => setPay(p=>({...p,paymentTerms:v}))} options={['Advance','7 Days','15 Days','30 Days','45 Days','60 Days','90 Days','On Delivery','LC']} />
                <FSel label="Payment Mode" value={pay.paymentMode} onChange={v => setPay(p=>({...p,paymentMode:v}))} options={['NEFT','RTGS','IMPS','Cheque','Cash','UPI','DD','LC','Credit Card']} />
                <div>
                  <label style={S.lbl}>Due Date</label>
                  <input type="date" value={pay.dueDate} onChange={e => setPay(p=>({...p,dueDate:e.target.value}))} style={inp(false)} />
                </div>
              </div>
              <div style={{ ...S.g2, marginTop:'10px' }}>
                <div>
                  <label style={S.lbl}>Credit Limit (₹)</label>
                  <div style={{ display:'flex', alignItems:'center', border:'1px solid #BBBCBD', borderRadius:'4px', overflow:'hidden', background:'#FAFAFA' }}>
                    <span style={{ padding:'6px 9px', background:SEC, borderRight:`1px solid ${BD}`, fontSize:'12px', color:'#1a2d4a', fontWeight:600 }}>₹</span>
                    <input type="number" value={pay.creditLimit} onChange={e => setPay(p=>({...p,creditLimit:e.target.value}))} placeholder="0" style={{ flex:1, padding:'6px 9px', border:'none', outline:'none', background:'transparent', fontSize:'12px', fontFamily:'inherit' }} />
                  </div>
                </div>
                <FTA label="Billing Terms" value={pay.billingTerms} onChange={v => setPay(p=>({...p,billingTerms:v}))} placeholder="Special billing terms…" rows={3} />
              </div>
              <div style={{ marginTop:'14px', padding:'10px 14px', background:SEC, border:`1px solid ${BD}`, borderLeft:`4px solid ${P}`, borderRadius:'4px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <span style={{ fontSize:'12px', color:'#1a2d4a', fontWeight:600 }}>Order Grand Total</span>
                <span style={{ fontSize:'16px', fontWeight:700, color:P, fontFamily:'monospace' }}>₹{grandTotal.toFixed(2)}</span>
              </div>
              </div>{/* end S.body */}
            </div>
          )}

          {/* ══ TAB 6: Specs ══ */}
          {activeTab === 'specs' && (
            <div>
              {/* Toolbar */}
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
                <div style={{ fontSize:13, fontWeight:700, color:'#1a2d4a' }}>Specification Sheet</div>
                <select
                  defaultValue=""
                  onChange={e => {
                    const val = e.target.value;
                    if (!val) return;
                    if (val === '__general__') { ssAddGroup({}); }
                    else {
                      const it = items.find(i => (i._id||i.itemCode||i.itemName) === val);
                      if (it) ssAddGroup(it);
                    }
                    e.target.value='';
                  }}
                  style={{ ...selStyle(true), width:240 }}
                >
                  <option value="">＋ Add Spec Group (select item)…</option>
                  {items.filter(it=>it.itemName||it.material).map((it,i)=>(
                    <option key={i} value={it._id||it.itemCode||it.itemName}>{it.itemName||it.material}</option>
                  ))}
                  <option value="__general__">General / No specific item</option>
                </select>
              </div>

              {specSheet.length === 0 && (
                <div style={{ textAlign:'center', padding:'40px 20px', color:'#94A3B8', fontSize:13, background:'#fff', border:`1px dashed ${BD}`, borderRadius:8 }}>
                  No specifications yet. Select an item above to create a spec group.
                </div>
              )}

              {specSheet.map((grp) => (
                <div key={grp._id} style={{ ...S.card, marginBottom:14 }}>
                  <div style={{ background:'#1a3c6e', padding:'8px 14px', display:'flex', alignItems:'center', gap:10, borderRadius:'8px 8px 0 0' }}>
                    <span style={{ fontSize:16 }}>📦</span>
                    <span style={{ flex:1, fontWeight:700, color:'#fff', fontSize:13 }}>{grp.itemName || 'General Specifications'}</span>
                    <button type="button" onClick={() => ssAddHdr(grp._id)}
                      style={{ padding:'3px 10px', fontSize:11, background:'rgba(255,255,255,0.18)', border:'1px solid rgba(255,255,255,0.35)', color:'#fff', borderRadius:4, cursor:'pointer', fontWeight:600 }}>
                      + Add Header
                    </button>
                    <button type="button" onClick={() => ssDelGroup(grp._id)}
                      style={{ background:'rgba(239,68,68,0.25)', border:'1px solid rgba(239,68,68,0.5)', color:'#fca5a5', borderRadius:4, padding:'3px 8px', cursor:'pointer', fontSize:12 }}>✕</button>
                  </div>
                  <div style={{ padding:'10px 14px' }}>
                    {grp.headers.map((hdr) => (
                      <div key={hdr._id} style={{ marginBottom:12, border:`1px solid ${BD}`, borderRadius:6, overflow:'hidden' }}>
                        <div style={{ background:'#EEF4FF', borderBottom:`1px solid ${BD}`, padding:'6px 10px', display:'flex', alignItems:'center', gap:8 }}>
                          <span style={{ fontSize:11, fontWeight:700, color:P, textTransform:'uppercase', letterSpacing:'0.5px', flexShrink:0 }}>▌ HEADER</span>
                          <input value={hdr.title} onChange={e => ssSetHdrT(grp._id, hdr._id, e.target.value)}
                            placeholder="e.g. Civil Work, Electrical, Structural…"
                            style={{ ...inp(false,true), flex:1, fontWeight:700, fontSize:12 }} />
                          <button type="button" onClick={() => ssAddSub(grp._id, hdr._id)}
                            style={{ padding:'3px 10px', fontSize:11, background:SEC, border:`1px solid ${BD}`, color:P, borderRadius:4, cursor:'pointer', fontWeight:600, flexShrink:0 }}>
                            + Sub Header
                          </button>
                          <button type="button" onClick={() => ssDelHdr(grp._id, hdr._id)}
                            style={{ background:'#FEE2E2', border:'1px solid #FCA5A5', color:'#DC2626', borderRadius:4, padding:'3px 7px', cursor:'pointer', fontSize:12, flexShrink:0 }}>✕</button>
                        </div>
                        <div style={{ padding:'8px 10px', display:'flex', flexDirection:'column', gap:10 }}>
                          {hdr.subHeaders.map((sub) => {
                            let srCounter = 0;
                            return (
                              <div key={sub._id} style={{ border:'1px solid #dde4f0', borderRadius:5, overflow:'hidden' }}>
                                <div style={{ background:'#F0F6FF', borderBottom:'1px solid #dde4f0', padding:'5px 10px', display:'flex', alignItems:'center', gap:8 }}>
                                  <span style={{ fontSize:11, fontWeight:600, color:'#3b5ea6', flexShrink:0 }}>▶ SUB HEADER</span>
                                  <input value={sub.title} onChange={e => ssSetSubT(grp._id, hdr._id, sub._id, e.target.value)}
                                    placeholder="e.g. Foundation, Wiring, Painting…"
                                    style={{ ...inp(false,true), flex:1, fontSize:12 }} />
                                  <button type="button" onClick={() => ssDelSub(grp._id, hdr._id, sub._id)}
                                    style={{ background:'#FEE2E2', border:'1px solid #FCA5A5', color:'#DC2626', borderRadius:4, padding:'2px 7px', cursor:'pointer', fontSize:12, flexShrink:0 }}>✕</button>
                                </div>
                                <div style={{ overflowX:'auto' }}>
                                  <table style={{ ...S.tbl, minWidth:600 }}>
                                    <thead>
                                      <tr>
                                        <th style={{ ...S.th, width:44, textAlign:'center' }}>Sr No</th>
                                        <th style={{ ...S.th }}>Description</th>
                                        <th style={{ ...S.th, width:90, textAlign:'center' }}>Qty</th>
                                        <th style={{ ...S.th }}>Remarks</th>
                                        <th style={{ ...S.th, width:36 }}></th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {sub.rows.map((row, ri) => {
                                        srCounter++;
                                        return (
                                          <tr key={row._id} style={{ background: ri%2===0 ? '#fff' : '#F9FAFB' }}>
                                            <td style={{ ...S.td, textAlign:'center', color:'#6B7280', fontWeight:600, fontSize:11 }}>{srCounter}</td>
                                            <td style={S.td}>
                                              <input value={row.description} onChange={e => ssUpdRow(grp._id,hdr._id,sub._id,row._id,'description',e.target.value)}
                                                placeholder="Description…" style={{ ...inp(false,true), width:'100%' }} />
                                            </td>
                                            <td style={S.td}>
                                              <input value={row.qty} onChange={e => ssUpdRow(grp._id,hdr._id,sub._id,row._id,'qty',e.target.value)}
                                                placeholder="Qty" style={{ ...inp(false,true), width:'100%', textAlign:'center' }} />
                                            </td>
                                            <td style={S.td}>
                                              <input value={row.remarks} onChange={e => ssUpdRow(grp._id,hdr._id,sub._id,row._id,'remarks',e.target.value)}
                                                placeholder="Remarks…" style={{ ...inp(false,true), width:'100%' }} />
                                            </td>
                                            <td style={{ ...S.td, textAlign:'center' }}>
                                              <button type="button" onClick={() => ssDelRow(grp._id,hdr._id,sub._id,row._id)}
                                                style={{ background:'#FEE2E2', border:'1px solid #FCA5A5', color:'#DC2626', borderRadius:3, padding:'2px 6px', cursor:'pointer', fontSize:11, fontWeight:700 }}>✕</button>
                                            </td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                                <div style={{ padding:'6px 10px', background:'#FAFBFC', borderTop:'1px solid #eef1f8' }}>
                                  <button type="button" onClick={() => ssAddRow(grp._id, hdr._id, sub._id)}
                                    style={{ padding:'3px 12px', fontSize:11, background:SEC, border:`1px solid ${BD}`, color:P, borderRadius:4, cursor:'pointer', fontWeight:600 }}>
                                    + Add Row
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ══ Material Planning ══ */}
          {activeTab === 'matplan' && (() => {
            const groups = [...new Set(matPlan.map(m=>m.unitGroup||'Default'))];
            return (
              <div>
                <div style={{ display:'flex', gap:10, marginBottom:12, flexWrap:'wrap' }}>
                  {[{label:'Total Items',val:matPlan.length,color:'#1a2d4a'},{label:'Purchase',val:matPlan.filter(m=>m.itemType==='Purchase').length,color:P},{label:'Manufactured',val:matPlan.filter(m=>m.itemType==='Manufactured').length,color:'#188918'},{label:'Units/Cabins',val:groups.length,color:'#E9730C'}].map(p=>(
                    <div key={p.label} style={{ padding:'6px 14px',background:'#fff',border:`1px solid ${p.color}30`,borderLeft:`3px solid ${p.color}`,borderRadius:4 }}>
                      <div style={{ fontSize:18,fontWeight:700,color:p.color }}>{p.val}</div>
                      <div style={{ fontSize:10,color:'#6A6D70',textTransform:'uppercase',letterSpacing:'0.5px' }}>{p.label}</div>
                    </div>
                  ))}
                  <div style={{ marginLeft:'auto',display:'flex',alignItems:'center' }}>
                    <button type="button" onClick={()=>setMatPlan(p=>[...p,newMatItem()])} style={{ padding:'6px 14px',background:P,border:'none',color:'#fff',borderRadius:4,cursor:'pointer',fontSize:12,fontWeight:600,fontFamily:'inherit' }}>+ Add Item</button>
                  </div>
                </div>
                {groups.map(grp=>{
                  const grpItems=matPlan.filter(m=>(m.unitGroup||'Default')===grp);
                  return (
                    <div key={grp} style={{ ...S.card,marginBottom:12 }}>
                      <div style={{ display:'flex',alignItems:'center',gap:10,marginBottom:10 }}>
                        <div style={{ fontSize:13,fontWeight:700,color:'#1a2d4a' }}>🏗️ {grp}</div>
                        <span style={{ fontSize:11,color:'#6A6D70' }}>{grpItems.length} item(s)</span>
                      </div>
                      {grpItems.map((m,idx)=>(
                        <div key={m._id||idx} style={{ marginBottom:8,border:`1px solid ${BD}`,borderRadius:6,overflow:'hidden' }}>
                          <div style={{ display:'grid',gridTemplateColumns:'28px 130px 1fr 110px 60px 70px 1fr 32px',gap:6,padding:'6px 8px',background:m.itemType==='Manufactured'?'#F0FFF4':'#F0F9FF',alignItems:'center' }}>
                            <div style={{ textAlign:'center',fontSize:11,fontWeight:700,color:'#6A6D70' }}>{idx+1}</div>
                            <input value={m.unitGroup} onChange={e=>updMat(m._id,'unitGroup',e.target.value)} placeholder="Cabin / Unit" style={inp(false,true)} />
                            <input value={m.itemName} onChange={e=>updMat(m._id,'itemName',e.target.value)} placeholder="Item name (e.g. AC, Steel Sheet)" style={inp(false,true)} />
                            <select value={m.itemType} onChange={e=>updMat(m._id,'itemType',e.target.value)} style={{ ...selStyle(true),fontWeight:600,color:m.itemType==='Manufactured'?'#188918':P,background:m.itemType==='Manufactured'?'#F0FFF4':'#EFF6FF' }}>
                              {MAT_TYPES.map(t=><option key={t} value={t}>{t}</option>)}
                            </select>
                            <input type="number" value={m.requiredQty} min="0" onChange={e=>updMat(m._id,'requiredQty',e.target.value)} style={{ ...inp(false,true),textAlign:'right' }} />
                            <select value={m.unit} onChange={e=>updMat(m._id,'unit',e.target.value)} style={selStyle(true)}>{UNITS.map(u=><option key={u} value={u}>{u}</option>)}</select>
                            <input value={m.remarks} onChange={e=>updMat(m._id,'remarks',e.target.value)} placeholder="Remarks…" style={inp(false,true)} />
                            <button type="button" onClick={()=>delMat(m._id)} style={{ background:'#FFEBEB',border:'1px solid #F5B8B8',color:'#BB0000',borderRadius:3,padding:'3px 7px',cursor:'pointer',fontSize:11,fontWeight:700,width:'100%' }}>✕</button>
                          </div>
                          {m.itemType==='Manufactured' && (
                            <div style={{ padding:'6px 10px 8px 36px',background:'#FAFFFE',borderTop:'1px solid #BBF7D0' }}>
                              <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6 }}>
                                <div style={{ fontSize:10,fontWeight:700,color:'#188918',textTransform:'uppercase',letterSpacing:'0.5px' }}>📋 Raw Materials BOM for "{m.itemName||'this item'}"</div>
                                <button type="button" onClick={()=>addBOMLine(m._id)} style={{ padding:'2px 10px',background:'#188918',border:'none',color:'#fff',borderRadius:3,cursor:'pointer',fontSize:11,fontWeight:600,fontFamily:'inherit' }}>+ Add Raw Material</button>
                              </div>
                              {(m.bomLines||[]).length===0 ? (
                                <div style={{ fontSize:11,color:'#94A3B8',padding:'4px 0' }}>No raw materials. Click "+ Add Raw Material".</div>
                              ) : (
                                <table style={{ ...S.tbl,fontSize:11 }}>
                                  <thead><tr>
                                    <th style={{ ...S.th,background:'#16A34A',width:28,fontSize:10 }}>#</th>
                                    <th style={{ ...S.th,background:'#16A34A',minWidth:160,fontSize:10 }}>Raw Material</th>
                                    <th style={{ ...S.th,background:'#16A34A',width:70,fontSize:10 }}>Qty</th>
                                    <th style={{ ...S.th,background:'#16A34A',width:70,fontSize:10 }}>Unit</th>
                                    <th style={{ ...S.th,background:'#16A34A',width:32,fontSize:10 }}></th>
                                  </tr></thead>
                                  <tbody>
                                    {(m.bomLines||[]).map((bl,bi)=>(
                                      <tr key={bl._id||bi}>
                                        <td style={{ ...S.td,textAlign:'center',color:'#6A6D70' }}>{bi+1}</td>
                                        <td style={S.td}><input value={bl.rawMaterial} onChange={e=>updBOMLine(m._id,bl._id,'rawMaterial',e.target.value)} placeholder="e.g. Steel Sheet…" style={inp(false,true)} /></td>
                                        <td style={S.td}><input type="number" value={bl.qty} min="0" onChange={e=>updBOMLine(m._id,bl._id,'qty',e.target.value)} style={{ ...inp(false,true),textAlign:'right' }} /></td>
                                        <td style={S.td}><select value={bl.unit} onChange={e=>updBOMLine(m._id,bl._id,'unit',e.target.value)} style={selStyle(true)}>{UNITS.map(u=><option key={u} value={u}>{u}</option>)}</select></td>
                                        <td style={{ ...S.td,textAlign:'center' }}><button type="button" onClick={()=>delBOMLine(m._id,bl._id)} style={{ background:'#FFEBEB',border:'1px solid #F5B8B8',color:'#BB0000',borderRadius:3,padding:'2px 6px',cursor:'pointer',fontSize:10,fontWeight:700 }}>✕</button></td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              )}
                              <div style={{ marginTop:4 }}><input value={m.bomRef} onChange={e=>updMat(m._id,'bomRef',e.target.value)} placeholder="BOM Reference No. (optional)" style={{ ...inp(false,true),width:220,fontSize:11 }} /></div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  );
                })}
                {matPlan.length===0 && <div style={{ textAlign:'center',padding:'32px 0',color:'#94A3B8',fontSize:13 }}><div style={{ fontSize:36,marginBottom:8 }}>🏗️</div>No material planning items. Click "+ Add Item".</div>}
              </div>
            );
          })()}

          {/* ══ Scope of Work ══ */}
          {activeTab === 'scope' && (
            <div style={S.card}>
              <div style={{ ...S.sec, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <span>Scope of Work / Supply</span>
                <button type="button" onClick={() => setScopeItems(p=>[...p,newScopeItem()])} style={{ padding:'5px 14px', background:P, border:'none', color:'#fff', borderRadius:4, cursor:'pointer', fontSize:12, fontWeight:600, fontFamily:'inherit' }}>+ Add Scope</button>
              </div>
              <div style={S.body}>
              <div style={{ overflowX:'auto' }}>
                <table style={S.tbl}>
                  <thead><tr>
                    <th style={{ ...S.th, width:32 }}>#</th>
                    <th style={{ ...S.th, width:160 }}>Scope Type</th>
                    <th style={{ ...S.th, minWidth:200 }}>Description</th>
                    <th style={{ ...S.th, width:70 }}>Qty</th>
                    <th style={{ ...S.th, width:80 }}>Unit</th>
                    <th style={{ ...S.th, minWidth:160 }}>Remarks</th>
                    <th style={{ ...S.th, width:36 }}></th>
                  </tr></thead>
                  <tbody>
                    {scopeItems.map((sc, idx) => {
                      const bg = idx%2===0 ? S.td : S.tdAlt;
                      return (
                        <tr key={sc._id||idx}>
                          <td style={{ ...bg, textAlign:'center', color:'#6A6D70', fontWeight:600, fontSize:11 }}>{idx+1}</td>
                          <td style={bg}><select value={sc.scopeType} onChange={e=>updScope(sc._id,'scopeType',e.target.value)} style={selStyle(true)}>{SCOPE_TYPES.map(t=><option key={t} value={t}>{t}</option>)}</select></td>
                          <td style={bg}><input value={sc.description} onChange={e=>updScope(sc._id,'description',e.target.value)} placeholder="Describe scope…" style={{ ...inp(false,true), minWidth:190 }} /></td>
                          <td style={bg}><input type="number" value={sc.qty} min="0" onChange={e=>updScope(sc._id,'qty',e.target.value)} style={{ ...inp(false,true), textAlign:'right' }} /></td>
                          <td style={bg}><select value={sc.unit} onChange={e=>updScope(sc._id,'unit',e.target.value)} style={selStyle(true)}>{UNITS.map(u=><option key={u} value={u}>{u}</option>)}</select></td>
                          <td style={bg}><input value={sc.remarks} onChange={e=>updScope(sc._id,'remarks',e.target.value)} placeholder="Remarks…" style={{ ...inp(false,true), minWidth:150 }} /></td>
                          <td style={{ ...bg, textAlign:'center' }}><button type="button" onClick={()=>delScope(sc._id)} style={{ background:'#FFEBEB', border:'1px solid #F5B8B8', color:'#BB0000', borderRadius:3, padding:'3px 7px', cursor:'pointer', fontSize:11, fontWeight:700 }}>✕</button></td>
                        </tr>
                      );
                    })}
                    {scopeItems.length===0 && <tr><td colSpan={7} style={{ ...S.td, textAlign:'center', color:'#94A3B8', padding:16 }}>No scope items. Click "+ Add Scope".</td></tr>}
                  </tbody>
                </table>
              </div>
              </div>{/* end S.body */}
            </div>
          )}

          {/* ══ BOM ══ */}
          {activeTab === 'bom' && (
            <div style={S.card}>
              <div style={{ ...S.sec, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <span>BOM — Bill of Materials</span>
                <div style={{ display:'flex', gap:8 }}>
                  <button type="button" onClick={autoGenBOM} style={{ padding:'5px 12px', background:'#188918', border:'none', color:'#fff', borderRadius:4, cursor:'pointer', fontSize:12, fontWeight:600, fontFamily:'inherit' }}>⚡ Auto-Generate from Scope</button>
                  <button type="button" onClick={()=>setBOMItems(p=>[...p,newBOMItem()])} style={{ padding:'5px 14px', background:P, border:'none', color:'#fff', borderRadius:4, cursor:'pointer', fontSize:12, fontWeight:600, fontFamily:'inherit' }}>+ Add Row</button>
                </div>
              </div>
              <div style={S.body}>
              {bomItems.length===0 ? (
                <div style={{ textAlign:'center', padding:'32px 0', color:'#94A3B8', fontSize:13 }}><div style={{ fontSize:36, marginBottom:8 }}>🔧</div>No BOM items. Click <b>"Auto-Generate from Scope"</b> or add rows manually.</div>
              ) : (
                <div style={{ overflowX:'auto' }}>
                  <table style={S.tbl}>
                    <thead><tr>
                      <th style={{ ...S.th, width:32 }}>#</th>
                      <th style={{ ...S.th, width:90 }}>Item Code</th>
                      <th style={{ ...S.th, minWidth:160 }}>Item Name</th>
                      <th style={{ ...S.th, width:70 }}>Qty</th>
                      <th style={{ ...S.th, width:75 }}>Unit</th>
                      <th style={{ ...S.th, width:140 }}>Warehouse</th>
                      <th style={{ ...S.th, width:140 }}>Linked Scope</th>
                      <th style={{ ...S.th, width:36 }}></th>
                    </tr></thead>
                    <tbody>
                      {bomItems.map((bm,idx)=>{
                        const bg=idx%2===0?S.td:S.tdAlt;
                        return (<tr key={bm._id||idx}>
                          <td style={{ ...bg, textAlign:'center', color:'#6A6D70', fontWeight:600, fontSize:11 }}>{idx+1}</td>
                          <td style={bg}><input value={bm.itemCode} onChange={e=>updBOM(bm._id,'itemCode',e.target.value)} placeholder="CODE" style={{ ...inp(false,true), minWidth:80 }} /></td>
                          <td style={bg}><input value={bm.itemName} onChange={e=>updBOM(bm._id,'itemName',e.target.value)} placeholder="Material name" style={{ ...inp(false,true), minWidth:150 }} /></td>
                          <td style={bg}><input type="number" value={bm.qty} min="0" onChange={e=>updBOM(bm._id,'qty',e.target.value)} style={{ ...inp(false,true), textAlign:'right' }} /></td>
                          <td style={bg}><select value={bm.unit} onChange={e=>updBOM(bm._id,'unit',e.target.value)} style={selStyle(true)}>{UNITS.map(u=><option key={u} value={u}>{u}</option>)}</select></td>
                          <td style={bg}><select value={bm.warehouse} onChange={e=>updBOM(bm._id,'warehouse',e.target.value)} style={selStyle(true)}>{SCOPE_WAREHOUSES.map(w=><option key={w} value={w}>{w}</option>)}</select></td>
                          <td style={bg}><select value={bm.linkedScope} onChange={e=>updBOM(bm._id,'linkedScope',e.target.value)} style={selStyle(true)}><option value="">— None —</option>{SCOPE_TYPES.map(t=><option key={t} value={t}>{t}</option>)}</select></td>
                          <td style={{ ...bg, textAlign:'center' }}><button type="button" onClick={()=>delBOM(bm._id)} style={{ background:'#FFEBEB', border:'1px solid #F5B8B8', color:'#BB0000', borderRadius:3, padding:'3px 7px', cursor:'pointer', fontSize:11, fontWeight:700 }}>✕</button></td>
                        </tr>);
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              </div>{/* end S.body */}
            </div>
          )}

          {/* ══ Tasks ══ */}
          {activeTab === 'tasks' && (
            <div style={S.card}>
              <div style={{ ...S.sec, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <span>Tasks / Project Plan</span>
                <div style={{ display:'flex', gap:8 }}>
                  <button type="button" onClick={autoGenTasks} style={{ padding:'5px 12px', background:'#188918', border:'none', color:'#fff', borderRadius:4, cursor:'pointer', fontSize:12, fontWeight:600, fontFamily:'inherit' }}>⚡ Auto-Create from Scope</button>
                  <button type="button" onClick={()=>setTasks(p=>[...p,newTask()])} style={{ padding:'5px 14px', background:P, border:'none', color:'#fff', borderRadius:4, cursor:'pointer', fontSize:12, fontWeight:600, fontFamily:'inherit' }}>+ Add Task</button>
                </div>
              </div>
              <div style={S.body}>
              {tasks.length===0 ? (
                <div style={{ textAlign:'center', padding:'32px 0', color:'#94A3B8', fontSize:13 }}><div style={{ fontSize:36, marginBottom:8 }}>📌</div>No tasks yet. Click <b>"Auto-Create from Scope"</b> or add tasks manually.</div>

              ) : (
                <>
                  {(() => {
                    const done=tasks.filter(t=>t.status==='Completed').length;
                    const pct=tasks.length?Math.round(done/tasks.length*100):0;
                    return (
                      <div style={{ marginBottom:12, padding:'8px 14px', background:'#F0F9FF', border:'1px solid #BAE0FF', borderRadius:6, display:'flex', alignItems:'center', gap:16 }}>
                        <div style={{ flex:1 }}>
                          <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, marginBottom:4, color:'#1a2d4a', fontWeight:600 }}><span>Project Progress</span><span>{pct}% ({done}/{tasks.length} tasks)</span></div>
                          <div style={{ height:8, background:'#DBEAFE', borderRadius:4, overflow:'hidden' }}><div style={{ height:'100%', width:`${pct}%`, background:pct===100?'#188918':P, borderRadius:4, transition:'width 0.3s' }} /></div>
                        </div>
                        <div style={{ fontSize:20, fontWeight:700, color:pct===100?'#188918':P }}>{pct}%</div>
                      </div>
                    );
                  })()}
                  <div style={{ overflowX:'auto' }}>
                    <table style={S.tbl}>
                      <thead><tr>
                        <th style={{ ...S.th, width:32 }}>#</th>
                        <th style={{ ...S.th, minWidth:160 }}>Task Name</th>
                        <th style={{ ...S.th, width:130 }}>Linked Scope</th>
                        <th style={{ ...S.th, width:110 }}>Assigned To</th>
                        <th style={{ ...S.th, width:100 }}>Start Date</th>
                        <th style={{ ...S.th, width:100 }}>End Date</th>
                        <th style={{ ...S.th, width:110 }}>Status</th>
                        <th style={{ ...S.th, width:90 }}>Priority</th>
                        <th style={{ ...S.th, minWidth:120 }}>Remarks</th>
                        <th style={{ ...S.th, width:36 }}></th>
                      </tr></thead>
                      <tbody>
                        {tasks.map((tk,idx)=>{
                          const bg=idx%2===0?S.td:S.tdAlt;
                          const priColor={Low:'#6A6D70',Medium:'#E9730C',High:'#BB0000',Critical:'#6D0000'}[tk.priority]||'#32363A';
                          return (<tr key={tk._id||idx}>
                            <td style={{ ...bg, textAlign:'center', color:'#6A6D70', fontWeight:600, fontSize:11 }}>{idx+1}</td>
                            <td style={bg}><input value={tk.taskName} onChange={e=>updTask(tk._id,'taskName',e.target.value)} placeholder="Task name…" style={{ ...inp(false,true), minWidth:150 }} /></td>
                            <td style={bg}><select value={tk.linkedScope} onChange={e=>updTask(tk._id,'linkedScope',e.target.value)} style={selStyle(true)}><option value="">— None —</option>{SCOPE_TYPES.map(t=><option key={t} value={t}>{t}</option>)}</select></td>
                            <td style={bg}><input value={tk.assignedTo} onChange={e=>updTask(tk._id,'assignedTo',e.target.value)} placeholder="Name" style={inp(false,true)} /></td>
                            <td style={bg}><input type="date" value={tk.startDate} onChange={e=>updTask(tk._id,'startDate',e.target.value)} style={inp(false,true)} /></td>
                            <td style={bg}><input type="date" value={tk.endDate} onChange={e=>updTask(tk._id,'endDate',e.target.value)} style={inp(false,true)} /></td>
                            <td style={bg}><select value={tk.status} onChange={e=>updTask(tk._id,'status',e.target.value)} style={{ ...selStyle(true), color:tk.status==='Completed'?'#188918':tk.status==='In Progress'?P:'#6A6D70', fontWeight:600 }}>{TASK_STATUS.map(s=><option key={s} value={s}>{s}</option>)}</select></td>
                            <td style={bg}><select value={tk.priority} onChange={e=>updTask(tk._id,'priority',e.target.value)} style={{ ...selStyle(true), color:priColor, fontWeight:600 }}>{PRIORITY.map(p=><option key={p} value={p}>{p}</option>)}</select></td>
                            <td style={bg}><input value={tk.remarks} onChange={e=>updTask(tk._id,'remarks',e.target.value)} placeholder="Remarks…" style={{ ...inp(false,true), minWidth:110 }} /></td>
                            <td style={{ ...bg, textAlign:'center' }}><button type="button" onClick={()=>delTask(tk._id)} style={{ background:'#FFEBEB', border:'1px solid #F5B8B8', color:'#BB0000', borderRadius:3, padding:'3px 7px', cursor:'pointer', fontSize:11, fontWeight:700 }}>✕</button></td>
                          </tr>);
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
              </div>{/* end S.body */}
            </div>
          )}

          {/* ══ TAB 7: Attachments ══ */}
          {activeTab === 'attach' && (
            <div style={S.card}>
              <div style={S.sec}>File Attachments</div>
              <div style={S.body}>
              {/* Existing files */}
              {attachments.length > 0 && (
                <>
                  <div style={{ fontSize:'11px', fontWeight:700, color:'#1a2d4a', textTransform:'uppercase', letterSpacing:'0.4px', marginBottom:'8px' }}>Existing Files</div>
                  <table style={{ ...S.tbl, marginBottom:'14px' }}>
                    <thead>
                      <tr>
                        <th style={S.th}>#</th>
                        <th style={S.th}>Name</th>
                        <th style={S.th}>File</th>
                        <th style={S.th}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {attachments.map((a, i) => (
                        <tr key={i}>
                          <td style={{ ...S.td, textAlign:'center', fontSize:'11px', color:'#6A6D70' }}>{i+1}</td>
                          <td style={S.td}><input value={a.name} onChange={e => setAttachments(p => p.map((x,j) => j===i ? {...x,name:e.target.value} : x))} style={{ ...inp(false,true) }} /></td>
                          <td style={S.td}>
                            {a.fileName && !a.replaceMode ? (
                              <div style={{ display:'flex', gap:'8px', alignItems:'center', flexWrap:'wrap' }}>
                                <span style={{ fontSize:'11px', color:'#188918', fontWeight:600 }}>📎 Attached</span>
                                <a href={`/api/sales-orders/${orderId}/download/${a.fileName}`} target="_blank" rel="noopener noreferrer" style={{ fontSize:'11px', color:P, textDecoration:'underline' }}>⬇️ Download</a>
                                <button type="button" onClick={() => startReplace(i)} style={{ fontSize:'11px', padding:'3px 8px', background:SEC, border:`1px solid ${BD}`, color:P, borderRadius:'3px', cursor:'pointer' }}>Replace</button>
                              </div>
                            ) : a.replaceMode ? (
                              <div style={{ display:'flex', gap:'8px', alignItems:'center', flexWrap:'wrap' }}>
                                <input type="file" accept=".pdf,.xlsx,.xls,.jpg,.jpeg,.png,.doc,.docx,.dwg" onChange={e => setReplFile(i, e.target.files[0])} style={{ fontSize:'12px' }} />
                                {a.replaceFile && <span style={{ fontSize:'11px', color:'#188918', fontWeight:600 }}>✓ {a.replaceFile.name}</span>}
                                <button type="button" onClick={() => cancelReplace(i)} style={{ fontSize:'11px', padding:'3px 8px', background:'#FFEBEB', border:'1px solid #F5B8B8', color:'#BB0000', borderRadius:'3px', cursor:'pointer' }}>Cancel</button>
                              </div>
                            ) : (
                              <input type="file" accept=".pdf,.xlsx,.xls,.jpg,.jpeg,.png,.doc,.docx" onChange={e => setReplFile(i, e.target.files[0])} style={{ fontSize:'12px' }} />
                            )}
                          </td>
                          <td style={{ ...S.td, textAlign:'center' }}>
                            <button type="button" onClick={() => removeAtt(i)} style={{ background:'#FFEBEB', border:'1px solid #F5B8B8', color:'#BB0000', borderRadius:'3px', padding:'3px 8px', cursor:'pointer', fontSize:'11px', fontWeight:600 }}>Remove</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}

              {/* Add new files */}
              <div style={{ border:`2px dashed ${BD}`, borderRadius:'6px', padding:'16px', textAlign:'center', background:BG, marginBottom:'14px' }}>
                <div style={{ fontSize:'12px', color:'#1a2d4a', fontWeight:600, marginBottom:'6px' }}>Add New Files</div>
                <label style={{ display:'inline-block', padding:'6px 20px', background:P, color:'#fff', borderRadius:'4px', cursor:'pointer', fontSize:'12px', fontWeight:600 }}>
                  📎 Choose Files
                  <input type="file" multiple accept=".pdf,.xlsx,.xls,.jpg,.jpeg,.png,.dwg,.doc,.docx" onChange={handleNewFiles} style={{ display:'none' }} />
                </label>
              </div>

              {newFiles.length > 0 && (
                <div>
                  <div style={{ fontSize:'11px', fontWeight:700, color:'#1a2d4a', textTransform:'uppercase', letterSpacing:'0.4px', marginBottom:'8px' }}>New Files to Upload</div>
                  {newFiles.map((a,i) => (
                    <div key={i} style={{ display:'flex', gap:'10px', alignItems:'center', padding:'6px 10px', background:BG, border:`1px solid ${BD}`, borderRadius:'4px', marginBottom:'5px' }}>
                      <span style={{ flex:1, fontSize:'12px' }}>📄 {a.name}</span>
                      <span style={{ fontSize:'11px', color:'#6A6D70' }}>{(a.size/1024).toFixed(1)} KB</span>
                      <button type="button" onClick={() => removeNewFile(i)} style={{ background:'#FFEBEB', border:'1px solid #F5B8B8', color:'#BB0000', borderRadius:'3px', padding:'3px 8px', cursor:'pointer', fontSize:'11px' }}>Remove</button>
                    </div>
                  ))}
                </div>
              )}
              </div>{/* end S.body */}
            </div>
          )}

          {/* ══ TAB 8: Notes ══ */}
          {activeTab === 'notes' && (
            <div style={S.card}>
              <div style={S.sec}>Notes & Terms</div>
              <div style={S.body}>
              <div style={{ display:'flex', flexDirection:'column', gap:'12px' }}>
                <FTA label="Terms & Conditions" value={notes.termsConditions} onChange={v => setNotes(n=>({...n,termsConditions:v}))} placeholder="1. Goods once sold will not be taken back…" rows={5} />
                <div style={S.g2}>
                  <FTA label="Internal Notes" value={notes.internalNotes} onChange={v => setNotes(n=>({...n,internalNotes:v}))} placeholder="Internal notes (not visible to customer)…" rows={4} />
                  <FTA label="Customer Notes" value={notes.customerNotes} onChange={v => setNotes(n=>({...n,customerNotes:v}))} placeholder="Notes to customer…" rows={4} />
                </div>
              </div>
              {/* Summary */}
              <div style={{ marginTop:'14px', padding:'12px 14px', background:BG, border:`1px solid ${BD}`, borderLeft:`4px solid ${P}`, borderRadius:'4px' }}>
                <div style={{ fontSize:'11px', fontWeight:700, color:'#1a2d4a', textTransform:'uppercase', letterSpacing:'0.4px', marginBottom:'10px' }}>Order Summary</div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr', gap:'8px' }}>
                  {[
                    ['Order No',   hdr.orderNo||orderId],
                    ['Customer',   hdr.customerName],
                    ['Order Date', hdr.orderDate],
                    ['Order Type', hdr.orderType],
                    ['Items',      rows.filter(r=>r.itemName).length + ' line(s)'],
                    ['Subtotal',   '₹'+subTotal.toFixed(2)],
                    ['Total GST',  '₹'+totalGST.toFixed(2)],
                    ['Grand Total','₹'+grandTotal.toFixed(2)],
                  ].map(([k,v]) => (
                    <div key={k} style={{ padding:'6px 8px', background:'#fff', borderRadius:'4px', border:`1px solid ${BD}` }}>
                      <div style={{ fontSize:'10px', fontWeight:700, color:'#6A6D70', textTransform:'uppercase', letterSpacing:'0.3px', marginBottom:'2px' }}>{k}</div>
                      <div style={{ fontSize:'12px', color:'#32363A', fontWeight:500 }}>{v||'—'}</div>
                    </div>
                  ))}
                </div>
              </div>
              </div>{/* end S.body */}
            </div>
          )}

        </div>{/* end tab content */}

        {/* ── Sticky Footer ── */}
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 14px', background:BG, border:`1px solid ${BD}`, borderTop:'none', borderRadius:'0 0 10px 10px', position:'sticky', bottom:0 }}>
          <div style={{ display:'flex', gap:'16px', alignItems:'center' }}>
            <div style={{ background:SEC, border:`1px solid ${BD}`, borderRadius:'20px', padding:'4px 14px', fontSize:'12px', fontWeight:700, color:P }}>
              Grand Total: ₹{grandTotal.toFixed(2)}
            </div>
            <div style={{ display:'flex', gap:'4px' }}>
              {TABS.map(t => (
                <button key={t.id} type="button" onClick={() => setActiveTab(t.id)} title={t.label} style={{ width:'22px', height:'4px', borderRadius:'2px', border:'none', cursor:'pointer', background: activeTab===t.id?P:'#D9D9D9' }} />
              ))}
            </div>
          </div>
          <div style={{ display:'flex', gap:'8px', alignItems:'center' }}>
            <span style={{ fontSize:'11px', color:'#6A6D70' }}>{tabIdx+1}/{TABS.length} — {TABS[tabIdx]?.label}</span>
            {tabIdx > 0 && (
              <button type="button" onClick={() => setActiveTab(TABS[tabIdx-1].id)} style={{ padding:'6px 12px', background:'#fff', border:`1px solid ${BD}`, color:'#32363A', borderRadius:'4px', cursor:'pointer', fontSize:'12px', fontWeight:600, fontFamily:'inherit' }}>← Prev</button>
            )}
            {tabIdx < TABS.length-1 ? (
              <button type="button" onClick={() => setActiveTab(TABS[tabIdx+1].id)} style={{ padding:'6px 12px', background:P, border:'none', color:'#fff', borderRadius:'4px', cursor:'pointer', fontSize:'12px', fontWeight:600, fontFamily:'inherit' }}>Next →</button>
            ) : (
              <button type="button" onClick={() => handleSave('pending')} disabled={saving} style={{ padding:'6px 18px', background:P, border:'none', color:'#fff', borderRadius:'4px', cursor:'pointer', fontSize:'12px', fontWeight:700, fontFamily:'inherit' }}>
                📤 Send for Approval
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};

export default EditSalesOrder;
