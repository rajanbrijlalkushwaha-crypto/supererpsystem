import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useCompany } from '../../context/CompanyContext';

/* ═══════════════════════════════════════════════════
   CONSTANTS
═══════════════════════════════════════════════════ */
const UNITS       = ['NOS','Kg','Ltr','Mtr','Box','Pcs','Set','Hr','Sqft','MT','Roll','Pair','Bag'];
const GST_RATES   = [0, 5, 12, 18, 28];
const SALES_PERSONS = ['Rajesh Kumar','Priya Sharma','Amit Singh','Sunita Verma','Mohit Gupta'];
const STATES = [
  'Andhra Pradesh','Arunachal Pradesh','Assam','Bihar','Chhattisgarh','Goa','Gujarat',
  'Haryana','Himachal Pradesh','Jharkhand','Karnataka','Kerala','Madhya Pradesh',
  'Maharashtra','Manipur','Meghalaya','Mizoram','Nagaland','Odisha','Punjab',
  'Rajasthan','Sikkim','Tamil Nadu','Telangana','Tripura','Uttar Pradesh',
  'Uttarakhand','West Bengal','Delhi','Chandigarh','Puducherry','Ladakh',
];

const TABS = [
  { id:'general',   label:'General',    icon:'📋' },
  { id:'items',     label:'Items',      icon:'📦' },
  { id:'pricing',   label:'Pricing',    icon:'💰' },
  { id:'delivery',  label:'Delivery',   icon:'🚚' },
  { id:'payment',   label:'Payment',    icon:'💳' },
  { id:'specs',     label:'Specs',      icon:'📐' },
  { id:'matplan',   label:'Material Plan',icon:'🏗️' },
  { id:'scope',     label:'Scope',      icon:'🎯' },
  { id:'bom',       label:'BOM',        icon:'🔧' },
  { id:'tasks',     label:'Tasks',      icon:'📌' },
  { id:'attach',    label:'Attachments',icon:'📎' },
  { id:'notes',     label:'Notes',      icon:'📝' },
];

const SCOPE_TYPES = ['Supply','Add-on Material','Installation','Transportation','Civil Work','Other'];

/* ── Material Planning ── */
const MAT_TYPES = ['Purchase','Manufactured'];
const newMatItem = () => ({ _id: Date.now()+Math.random(), unitGroup:'Cabin 1', itemName:'', itemType:'Purchase', requiredQty:1, unit:'NOS', bomRef:'', bomLines:[], remarks:'' });
const newBOMLine = () => ({ _id: Date.now()+Math.random(), rawMaterial:'', qty:1, unit:'NOS' });
const TASK_STATUS = ['Pending','In Progress','Completed'];
const PRIORITY    = ['Low','Medium','High','Critical'];

const SCOPE_WAREHOUSES = ['Main Store','Site Store','Raw Material','Finished Goods'];

const newScopeItem = () => ({ _id: Date.now()+Math.random(), scopeType:'Supply', description:'', qty:1, unit:'NOS', remarks:'' });
const newBOMItem   = () => ({ _id: Date.now()+Math.random(), itemCode:'', itemName:'', qty:1, unit:'NOS', warehouse:'Main Store', linkedScope:'' });
const newTask      = () => ({ _id: Date.now()+Math.random(), taskName:'', linkedScope:'', assignedTo:'', startDate:'', endDate:'', status:'Pending', priority:'Medium', remarks:'' });

/* Auto-generate tasks from scope items */
const AUTO_TASKS = {
  'Supply':           'Material Procurement & Delivery',
  'Add-on Material':  'Add-on Material Sourcing',
  'Installation':     'Site Installation',
  'Transportation':   'Dispatch & Transportation',
  'Civil Work':       'Civil Work Preparation',
  'Other':            'General Execution Task',
};

const newItem = () => ({
  _id: Date.now() + Math.random(),
  itemCode:'', itemName:'', description:'', hsnCode:'',
  qty:1, unit:'NOS', rate:'', discount:0, discountType:'%', gstPercent:18, amount:0
});

/* ═══════════════════════════════════════════════════
   STYLE ATOMS  — Modern SaaS / SAP Fiori theme
═══════════════════════════════════════════════════ */
/* ─── Design Tokens — aligned to App.css v5.0 ─── */
const P    = '#133d80';   /* primary blue        */
const SEC  = '#EEF4FF';   /* section header band */
const BG   = '#F5F7FB';   /* page background     */
const BD   = '#E5EAF2';   /* border colour       */
const TEAL = '#12B76A';   /* confirm/submit      */

const F = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const S = {
  page:  { fontFamily: F, color:'#111827', background:BG, minHeight:'100vh' },

  /* Top header bar */
  hdr:   {
    background: P,
    padding:'0 24px', height:50, display:'flex', justifyContent:'space-between', alignItems:'center',
    borderBottom:'2px solid #1A56D6', position:'sticky', top:0, zIndex:100,
    boxShadow:'0 2px 12px rgba(47,111,237,0.30)',
  },

  /* White card — soft shadow, rounded */
  card:  {
    background:'#fff', border:`1px solid ${BD}`, borderRadius:'12px',
    padding:0, marginBottom:'16px',
    boxShadow:'0 1px 3px rgba(16,24,40,0.10), 0 1px 2px rgba(16,24,40,0.06)',
    overflow:'hidden',
  },

  /* Section header BAND inside card */
  sec:   {
    fontSize:'11.5px', fontWeight:700, color:'#fff',
    background: P,
    padding:'8px 16px',
    borderBottom:`1px solid #1A56D6`,
    margin:0,
    letterSpacing:'0.6px',
    textTransform:'uppercase',
    display:'flex', alignItems:'center', gap:7,
  },

  /* Card body padding wrapper */
  body:  { padding:'16px 18px' },

  lbl:   { fontSize:'12.5px', fontWeight:600, color:'#4B5563', marginBottom:'5px', display:'block', letterSpacing:'0.1px' },
  req:   { color:'#EF4444', marginLeft:'2px' },
  err:   { fontSize:'11px', color:'#EF4444', marginTop:'4px', fontWeight:600 },
  hint:  { fontSize:'11px', color:'#9CA3AF', marginTop:'4px' },
  g2:    { display:'grid', gridTemplateColumns:'1fr 1fr', gap:'14px 20px' },
  g3:    { display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'14px 20px' },
  g4:    { display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr', gap:'12px 16px' },

  tbl:   { width:'100%', borderCollapse:'collapse', fontSize:'12.5px' },
  th:    { background:P, color:'#fff', padding:'9px 12px', textAlign:'left', fontWeight:700, fontSize:'11px', whiteSpace:'nowrap', borderRight:'1px solid rgba(255,255,255,0.10)', textTransform:'uppercase', letterSpacing:'0.4px' },
  td:    { padding:'8px 11px', border:`1px solid ${BD}`, background:'#fff', verticalAlign:'middle', fontSize:'12.5px' },
  tdAlt: { padding:'8px 11px', border:`1px solid ${BD}`, background:'#F9FAFB', verticalAlign:'middle', fontSize:'12.5px' },
};

function inp(err, sm) {
  return {
    width:'100%',
    padding: sm ? '5px 9px' : '7px 11px',
    border:`1px solid ${err ? '#EF4444' : BD}`,
    borderRadius: sm ? '6px' : '6px',
    fontSize: sm ? '12px' : '13px', fontFamily:'inherit',
    background:'#fff', color:'#111827', outline:'none',
    boxSizing:'border-box', transition:'border-color 0.15s, box-shadow 0.15s',
    boxShadow: err ? '0 0 0 3px rgba(239,68,68,0.12)' : 'none',
  };
}
function selStyle(sm) {
  return {
    width:'100%',
    padding: sm ? '5px 9px' : '7px 11px',
    border:`1px solid ${BD}`,
    borderRadius: sm ? '6px' : '6px',
    fontSize: sm ? '12px' : '13px', fontFamily:'inherit',
    background:'#fff', color:'#111827', outline:'none',
    cursor:'pointer', boxSizing:'border-box', transition:'border-color 0.15s',
  };
}

/* ── Compact field components ── */
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
  useEffect(() => { const t = setTimeout(onClose, 4500); return () => clearTimeout(t); }, [onClose]);
  const ok = type === 'success';
  return (
    <div style={{
      position:'fixed', top:'20px', right:'24px', zIndex:9999,
      background: ok ? '#F0FDF4' : '#FEF2F2',
      border:`1px solid ${ok?'#BBF7D0':'#FECACA'}`,
      borderLeft:`4px solid ${ok?'#22C55E':'#EF4444'}`,
      borderRadius:'12px', padding:'14px 18px', minWidth:'320px',
      display:'flex', alignItems:'center', gap:'12px',
      boxShadow:'0 8px 32px rgba(0,0,0,0.12)',
      fontFamily: F,
    }}>
      <span style={{ fontSize:'18px' }}>{ok ? '✅' : '❌'}</span>
      <span style={{ fontSize:'13px', color: ok?'#15803D':'#B91C1C', fontWeight:600, flex:1 }}>{msg}</span>
      <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:'#9CA3AF', fontSize:'18px', lineHeight:1 }}>×</button>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   ITEM ROW calculations
═══════════════════════════════════════════════════ */
function calcRowAmt(it) {
  const base   = (parseFloat(it.qty)||0) * (parseFloat(it.rate)||0);
  const disc   = it.discountType === '%'
    ? base * (parseFloat(it.discount)||0) / 100
    : (parseFloat(it.discount)||0);
  const taxable = base - disc;
  const gst    = taxable * (parseFloat(it.gstPercent)||0) / 100;
  return { base, disc, taxable, gst, total: taxable + gst };
}

/* ═══════════════════════════════════════════════════
   MAIN COMPONENT
═══════════════════════════════════════════════════ */
const CreateSalesOrder = () => {
  const navigate            = useNavigate();
  const { selectedCompany } = useCompany();

  const [activeTab, setActiveTab] = useState('general');
  const [saving,    setSaving]    = useState(false);
  const [toast,     setToast]     = useState(null);
  const [errs,      setErrs]      = useState({});
  const [clients,   setClients]   = useState([]);
  const [showCustDD, setShowCustDD] = useState(false);
  const [custSearch, setCustSearch] = useState('');
  const custRef = useRef(null);

  /* ── Header state ── */
  const [hdr, setHdr] = useState({
    orderNo:'', orderDate: new Date().toISOString().split('T')[0],
    orderType:'Domestic', salesPerson:'',
    customerName:'', customerCode:'', customerGstin:'',
    contactPerson:'', mobile:'', email:'', customerState:'',
    customerAddress:'', customerCity:'', customerPincode:'',
    sameAsBillTo: true,
    shipToName:'', shipToAddress:'', shipToCity:'', shipToState:'', shipToPincode:'',
    clientOrderNo:'', clientOrderDate:'',
    deliveryDate:'', paymentTerms:'Net 30', internalNotes:'',
  });

  /* ── Tab states ── */
  const [gen, setGen] = useState({
    customerPO:'', poDate:'', enquiryRef:'', quotationRef:'',
    deliveryDate:'', incoterms:'',
  });
  const [items, setItems] = useState([newItem()]);
  const [pricing, setPricing] = useState({
    overallDiscount:0, freightCharges:0, packingCharges:0, roundOff:0,
  });
  const [del, setDel] = useState({
    deliveryAddr:'', shippingAddr:'', dispatchMode:'Road',
    transporterName:'', vehicleNumber:'', deliveryInstructions:'',
  });
  const [pay, setPay] = useState({
    paymentTerms:'30 Days', paymentMode:'NEFT', billingTerms:'',
    creditLimit:'', dueDate:'',
  });
  const [specs, setSpecs] = useState({
    productSpecs:'', technicalDetails:'', drawingNumber:'', version:'',
    customFields:[],
  });

  /* ── Specification Sheet ── */
  const uid = () => Date.now() + Math.random();
  const newSpecRow      = ()       => ({ _id: uid(), description:'', qty:'', remarks:'' });
  const newSpecSubHead  = ()       => ({ _id: uid(), title:'', rows:[newSpecRow()] });
  const newSpecHeader   = ()       => ({ _id: uid(), title:'', subHeaders:[newSpecSubHead()] });
  const newSpecGroup    = (item={})=> ({ _id: uid(), itemId: item._id||'', itemName: item.itemName||item.material||'', headers:[newSpecHeader()] });
  const [specSheet, setSpecSheet] = useState([]);

  const ssAddGroup  = (item)      => setSpecSheet(s => [...s, newSpecGroup(item)]);
  const ssDelGroup  = (gid)       => setSpecSheet(s => s.filter(g => g._id !== gid));
  const ssSetItem   = (gid, item) => setSpecSheet(s => s.map(g => g._id===gid ? {...g, itemId:item._id||'', itemName:item.itemName||item.material||''} : g));
  const ssAddHdr    = (gid)       => setSpecSheet(s => s.map(g => g._id===gid ? {...g, headers:[...g.headers, newSpecHeader()]} : g));
  const ssDelHdr    = (gid,hid)   => setSpecSheet(s => s.map(g => g._id===gid ? {...g, headers:g.headers.filter(h=>h._id!==hid)} : g));
  const ssSetHdrT   = (gid,hid,v) => setSpecSheet(s => s.map(g => g._id===gid ? {...g, headers:g.headers.map(h=>h._id===hid?{...h,title:v}:h)} : g));
  const ssAddSub    = (gid,hid)   => setSpecSheet(s => s.map(g => g._id===gid ? {...g, headers:g.headers.map(h=>h._id===hid?{...h,subHeaders:[...h.subHeaders,newSpecSubHead()]}:h)} : g));
  const ssDelSub    = (gid,hid,sid)=> setSpecSheet(s => s.map(g => g._id===gid ? {...g, headers:g.headers.map(h=>h._id===hid?{...h,subHeaders:h.subHeaders.filter(sh=>sh._id!==sid)}:h)} : g));
  const ssSetSubT   = (gid,hid,sid,v)=> setSpecSheet(s => s.map(g => g._id===gid ? {...g, headers:g.headers.map(h=>h._id===hid?{...h,subHeaders:h.subHeaders.map(sh=>sh._id===sid?{...sh,title:v}:sh)}:h)} : g));
  const ssAddRow    = (gid,hid,sid)=> setSpecSheet(s => s.map(g => g._id===gid ? {...g, headers:g.headers.map(h=>h._id===hid?{...h,subHeaders:h.subHeaders.map(sh=>sh._id===sid?{...sh,rows:[...sh.rows,newSpecRow()]}:sh)}:h)} : g));
  const ssDelRow    = (gid,hid,sid,rid)=> setSpecSheet(s => s.map(g => g._id===gid ? {...g, headers:g.headers.map(h=>h._id===hid?{...h,subHeaders:h.subHeaders.map(sh=>sh._id===sid?{...sh,rows:sh.rows.filter(r=>r._id!==rid)}:sh)}:h)} : g));
  const ssUpdRow    = (gid,hid,sid,rid,field,val)=> setSpecSheet(s => s.map(g => g._id===gid ? {...g, headers:g.headers.map(h=>h._id===hid?{...h,subHeaders:h.subHeaders.map(sh=>sh._id===sid?{...sh,rows:sh.rows.map(r=>r._id===rid?{...r,[field]:val}:r)}:sh)}:h)} : g));

  const [attachments, setAttachments] = useState([]);
  const [notes, setNotes] = useState({
    termsConditions:'', internalNotes:'', customerNotes:'',
  });
  const [scopeItems, setScopeItems] = useState([newScopeItem()]);
  const [bomItems,   setBOMItems]   = useState([]);
  const [tasks,      setTasks]      = useState([]);
  const [matPlan,    setMatPlan]    = useState([newMatItem()]);

  /* ── Fetch next order ID + clients ── */
  useEffect(() => {
    const cid = selectedCompany?.companyId;
    axios.get('/api/sales-orders/next-id', { params:{ companyId: cid } })
      .then(r => setHdr(h => ({ ...h, orderNo: String(r.data.nextId) })))
      .catch(() => setHdr(h => ({ ...h, orderNo: 'SO-' + Date.now().toString().slice(-6) })));

    if (cid) {
      axios.get('/api/clients', { params:{ companyId: cid } })
        .then(r => setClients(r.data || []))
        .catch(() => {});
    }
  }, [selectedCompany]);

  /* ── Auto-calc payment due date ── */
  useEffect(() => {
    if (!hdr.orderDate || !pay.paymentTerms) return;
    const days = parseInt(pay.paymentTerms) || 0;
    const d = new Date(hdr.orderDate);
    d.setDate(d.getDate() + days);
    setPay(p => ({ ...p, dueDate: days > 0 ? d.toISOString().split('T')[0] : '' }));
  }, [hdr.orderDate, pay.paymentTerms]);

  /* ── Close customer dropdown on outside click ── */
  useEffect(() => {
    const fn = e => { if (custRef.current && !custRef.current.contains(e.target)) setShowCustDD(false); };
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, []);

  const setH = (k, v) => setHdr(h => ({ ...h, [k]: v }));

  /* ── Select customer from dropdown ── */
  const selectCustomer = useCallback((c) => {
    const cp0  = (c.contactPersons || [])[0] || {};
    setHdr(h => ({
      ...h,
      customerName:    c.companyName || c.clientName || '',
      customerCode:    String(c.clientId || ''),
      customerGstin:   c.gstin || c.gst || '',
      contactPerson:   cp0.name || '',
      mobile:          cp0.mobileNumber || '',
      email:           cp0.email || '',
      customerState:   c.state || '',
      customerAddress: c.address || '',
      customerCity:    c.city || '',
      customerPincode: c.pincode || '',
    }));
    setDel(d => ({
      ...d,
      deliveryAddr: c.address || '',
      shippingAddr: c.shippingAddr || c.address || '',
    }));
    setShowCustDD(false);
    setCustSearch('');
  }, []);

  /* ── Item helpers ── */
  const updItem = (id, k, v) => setItems(p => p.map(it => it._id === id ? { ...it, [k]: v } : it));
  const addRow  = () => setItems(p => [...p, newItem()]);
  const delRow  = id => setItems(p => p.length > 1 ? p.filter(it => it._id !== id) : p);
  const dupWarn = name => name && items.filter(it => it.itemName === name).length > 1;

  /* ── Pricing calculations ── */
  const rows        = items.map(it => ({ ...it, calc: calcRowAmt(it) }));
  const subTotal    = rows.reduce((s, r) => s + r.calc.taxable, 0);
  const totalGST    = rows.reduce((s, r) => s + r.calc.gst, 0);
  const isIntra     = hdr.customerState && selectedCompany?.state && hdr.customerState === selectedCompany.state;
  const cgst        = isIntra ? totalGST / 2 : 0;
  const sgst        = isIntra ? totalGST / 2 : 0;
  const igst        = !isIntra ? totalGST : 0;
  const overDisc    = parseFloat(pricing.overallDiscount) || 0;
  const freight     = parseFloat(pricing.freightCharges)  || 0;
  const packing     = parseFloat(pricing.packingCharges)  || 0;
  const roundOff    = parseFloat(pricing.roundOff)        || 0;
  const grandTotal  = subTotal - overDisc + totalGST + freight + packing + roundOff;

  /* ── File attachments ── */
  const handleFiles = e => {
    const files = Array.from(e.target.files);
    setAttachments(p => [...p, ...files.map(f => ({ file:f, name:f.name, size:f.size }))]);
    e.target.value = '';
  };
  const removeAttach = i => setAttachments(p => p.filter((_,j) => j !== i));

  /* ── Spec custom fields ── */
  const addCustomField = () => setSpecs(s => ({ ...s, customFields:[...s.customFields, { key:'', value:'' }] }));
  const updCustomField = (i, k, v) => setSpecs(s => ({ ...s, customFields: s.customFields.map((f,j) => j===i ? {...f,[k]:v} : f) }));
  const delCustomField = i => setSpecs(s => ({ ...s, customFields: s.customFields.filter((_,j)=>j!==i) }));

  /* ── Scope helpers ── */
  const updScope = (id, k, v) => setScopeItems(p => p.map(s => s._id === id ? { ...s, [k]: v } : s));
  const delScope = id => setScopeItems(p => p.length > 1 ? p.filter(s => s._id !== id) : p);

  /* ── BOM helpers ── */
  const updBOM = (id, k, v) => setBOMItems(p => p.map(b => b._id === id ? { ...b, [k]: v } : b));
  const delBOM = id => setBOMItems(p => p.filter(b => b._id !== id));

  /* Auto-generate BOM rows from scope items */
  const autoGenBOM = () => {
    const generated = scopeItems.filter(s => s.description.trim()).map(s => ({
      ...newBOMItem(),
      itemName: s.description,
      qty: s.qty,
      unit: s.unit,
      linkedScope: s.scopeType,
    }));
    if (generated.length) setBOMItems(generated);
  };

  /* ── Task helpers ── */
  const updTask = (id, k, v) => setTasks(p => p.map(t => t._id === id ? { ...t, [k]: v } : t));
  const delTask = id => setTasks(p => p.filter(t => t._id !== id));

  /* Auto-generate tasks from scope items */
  const autoGenTasks = () => {
    const generated = scopeItems.map(s => ({
      ...newTask(),
      taskName: AUTO_TASKS[s.scopeType] || 'General Task',
      linkedScope: s.scopeType,
      startDate: gen.deliveryDate ? '' : '',
      endDate: gen.deliveryDate || '',
    }));
    if (generated.length) setTasks(generated);
  };

  /* ── Material Plan helpers ── */
  const updMat = (id,k,v) => setMatPlan(p => p.map(m => m._id===id ? {...m,[k]:v} : m));
  const delMat = id => setMatPlan(p => p.length>1 ? p.filter(m=>m._id!==id) : p);
  const updBOMLine = (matId,lid,k,v) => setMatPlan(p => p.map(m => m._id===matId ? {...m, bomLines: m.bomLines.map(bl=>bl._id===lid?{...bl,[k]:v}:bl)} : m));
  const addBOMLine = matId => setMatPlan(p => p.map(m => m._id===matId ? {...m, bomLines:[...m.bomLines, newBOMLine()]} : m));
  const delBOMLine = (matId,lid) => setMatPlan(p => p.map(m => m._id===matId ? {...m, bomLines:m.bomLines.filter(bl=>bl._id!==lid)} : m));

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
      else if (e.items)                  setActiveTab('items');
      setToast({ type:'error', msg:'Please fix the errors before saving.' });
      return;
    }
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append('companyId',     selectedCompany?.companyId || '');
      fd.append('status',        status);
      // header
      Object.entries(hdr).forEach(([k,v]) => fd.append(k, v));
      // general
      Object.entries(gen).forEach(([k,v]) => fd.append(k, v));
      // pricing
      Object.entries(pricing).forEach(([k,v]) => fd.append(k, v));
      // delivery
      Object.entries(del).forEach(([k,v]) => fd.append(k, v));
      // payment
      Object.entries(pay).forEach(([k,v]) => fd.append(k, v));
      // specs
      fd.append('productSpecs',     specs.productSpecs);
      fd.append('technicalDetails', specs.technicalDetails);
      fd.append('drawingNumber',    specs.drawingNumber);
      fd.append('version',          specs.version);
      fd.append('customFields',     JSON.stringify(specs.customFields));
      // notes
      Object.entries(notes).forEach(([k,v]) => fd.append(k, v));
      // totals
      fd.append('subTotal',   subTotal.toFixed(2));
      fd.append('totalGST',   totalGST.toFixed(2));
      fd.append('grandTotal', grandTotal.toFixed(2));
      fd.append('cgst',       cgst.toFixed(2));
      fd.append('sgst',       sgst.toFixed(2));
      fd.append('igst',       igst.toFixed(2));
      // items
      fd.append('items', JSON.stringify(rows.map(r => ({
        itemCode: r.itemCode, itemName: r.itemName, description: r.description,
        hsnCode: r.hsnCode, qty: r.qty, unit: r.unit, rate: r.rate,
        discount: r.discount, discountType: r.discountType, gstPercent: r.gstPercent,
        amount: r.calc.total.toFixed(2),
      }))));
      // attachments: JSON metadata separately, files under a different field name
      fd.append('attachments', JSON.stringify(attachments.map(a => ({ name: a.name }))));
      attachments.forEach(a => fd.append('attachmentFiles', a.file));
      // project management
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

      const res = await axios.post('/api/sales-orders', fd, { headers:{ 'Content-Type':'multipart/form-data' } });
      setToast({ type:'success', msg:`Sales Order ${res.data.orderId} created successfully!` });
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

  /* ════════════════════════════════════════════════
     RENDER
  ════════════════════════════════════════════════ */
  return (
    <div style={S.page}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        input:focus, select:focus, textarea:focus {
          border-color: #1B64D0 !important;
          box-shadow: 0 0 0 2px rgba(27,100,208,0.12) !important;
        }
        input::placeholder, textarea::placeholder { color: #9CA3AF; }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: #F1F5F9; }
        ::-webkit-scrollbar-thumb { background: #CBD5E1; border-radius: 3px; }
      `}</style>
      {toast && <Toast type={toast.type} msg={toast.msg} onClose={() => setToast(null)} />}

      {/* ── Top Header Bar ── */}
      <div style={S.hdr}>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          {/* breadcrumb */}
          <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:12.5, color:'rgba(255,255,255,0.65)' }}>
            <span style={{ cursor:'pointer', color:'rgba(255,255,255,0.75)' }} onClick={() => navigate('/sales-order/view')}>Sales Orders</span>
            <span style={{ opacity:0.5 }}>›</span>
            <span style={{ color:'#fff', fontWeight:600 }}>Create New</span>
          </div>
        </div>
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          <button onClick={() => navigate('/sales-order/view')}
            style={{ height:32, padding:'0 16px', background:'rgba(255,255,255,0.08)', border:'1px solid rgba(255,255,255,0.22)', color:'rgba(255,255,255,0.85)', borderRadius:6, cursor:'pointer', fontSize:12.5, fontWeight:600, fontFamily:'inherit', display:'flex', alignItems:'center', gap:5, transition:'all 0.15s' }}>
            ✕ Cancel
          </button>
          <button onClick={() => handleSave('draft')} disabled={saving}
            style={{ height:32, padding:'0 18px', background:'rgba(255,255,255,0.14)', border:'1px solid rgba(255,255,255,0.30)', color:'#fff', borderRadius:6, cursor:saving?'default':'pointer', fontSize:12.5, fontWeight:600, fontFamily:'inherit', display:'flex', alignItems:'center', gap:6, opacity:saving?0.6:1 }}>
            💾 {saving ? 'Saving…' : 'Save Draft'}
          </button>
          <button onClick={() => handleSave('approved')} disabled={saving}
            style={{ height:32, padding:'0 18px', background:'#fff', border:'1px solid #E5EAF2', color:P, borderRadius:6, cursor:saving?'default':'pointer', fontSize:12.5, fontWeight:700, fontFamily:'inherit', display:'flex', alignItems:'center', gap:6, boxShadow:'0 1px 4px rgba(0,0,0,0.10)', opacity:saving?0.6:1 }}>
            ✓ {saving ? '…' : 'Save & Approve'}
          </button>
        </div>
      </div>


      <div style={{ padding:'12px 20px 20px' }}>

        {/* ── Two-column Header Layout ── */}
        <div style={{ display:'grid', gridTemplateColumns:'3fr 2fr', gap:'14px', marginBottom:'14px' }}>

          {/* LEFT: Customer Info */}
          <div>
            {/* Bill To */}
            <div style={S.card}>
              <div style={S.sec}>Bill To — Customer Details</div>
              <div style={S.body}>
                {/* Client Name search */}
                <div style={{ marginBottom:'10px' }}>
                  <label style={S.lbl}>Client Name <span style={S.req}>*</span></label>
                  <div ref={custRef} style={{ position:'relative', display:'flex', gap:'6px' }}>
                    <input value={hdr.customerName || custSearch}
                      onChange={e => { setCustSearch(e.target.value); setH('customerName',''); setShowCustDD(true); }}
                      onFocus={() => setShowCustDD(true)}
                      placeholder="Type or click 🔍 search..."
                      style={{ ...inp(errs.customerName), flex:1 }}
                    />
                    <button type="button" onClick={() => setShowCustDD(true)}
                      style={{ background:P, border:'none', color:'#fff', borderRadius:'5px', padding:'7px 12px', cursor:'pointer', fontSize:'14px' }}>🔍</button>
                    {showCustDD && filteredClients.length > 0 && (
                      <div style={{ position:'absolute', top:'calc(100% + 4px)', left:0, right:40, background:'#fff', border:`1px solid ${BD}`, borderRadius:'8px', boxShadow:'0 8px 24px rgba(0,0,0,0.1)', zIndex:200, maxHeight:'200px', overflowY:'auto' }}>
                        {filteredClients.slice(0,20).map(c => (
                          <div key={c.clientId} onClick={() => selectCustomer(c)}
                            style={{ padding:'8px 12px', cursor:'pointer', borderBottom:`1px solid ${BD}`, fontSize:'13px', display:'flex', justifyContent:'space-between', alignItems:'center' }}
                            onMouseEnter={e => e.currentTarget.style.background=SEC}
                            onMouseLeave={e => e.currentTarget.style.background='#fff'}>
                            <span style={{ fontWeight:600, color:'#1F2937' }}>{c.companyName||c.clientName}</span>
                            <span style={{ color:'#9CA3AF', fontSize:'11px', background:'#F3F4F6', padding:'1px 7px', borderRadius:'10px' }}>#{c.clientId}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  {errs.customerName && <div style={S.err}>{errs.customerName}</div>}
                </div>
                {/* Client ID */}
                <div style={{ marginBottom:'10px' }}>
                  <label style={S.lbl}>Client ID</label>
                  <input value={hdr.customerCode} readOnly placeholder="Auto filled"
                    style={{ ...inp(false), background:'#F3F4F6', color:'#6B7280', cursor:'default' }} />
                </div>
                {/* GSTIN */}
                <div style={{ marginBottom:'10px' }}>
                  <label style={S.lbl}>GSTIN</label>
                  <input value={hdr.customerGstin} onChange={e => setH('customerGstin', e.target.value)} style={inp(false)} />
                </div>
                {/* Address */}
                <div style={{ marginBottom:'10px' }}>
                  <label style={S.lbl}>Address</label>
                  <input value={hdr.customerAddress} onChange={e => setH('customerAddress', e.target.value)} style={inp(false)} />
                </div>
                {/* City / State */}
                <div style={{ display:'grid', gridTemplateColumns:'1fr auto 1fr', gap:'8px', marginBottom:'10px', alignItems:'end' }}>
                  <div>
                    <label style={S.lbl}>City</label>
                    <input value={hdr.customerCity} onChange={e => setH('customerCity', e.target.value)} style={inp(false)} />
                  </div>
                  <div>
                    <label style={S.lbl}>&nbsp;</label>
                    <select style={{ ...selStyle(), width:'70px' }}>
                      <option>—</option>
                    </select>
                  </div>
                  <div>
                    <label style={S.lbl}>State</label>
                    <select value={hdr.customerState} onChange={e => setH('customerState', e.target.value)} style={selStyle()}>
                      <option value="">State</option>
                      {STATES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                </div>
                {/* Pincode */}
                <div>
                  <label style={S.lbl}>Pincode</label>
                  <input value={hdr.customerPincode} onChange={e => setH('customerPincode', e.target.value)} style={{ ...inp(false), width:'140px' }} />
                </div>
                {/* Same as Bill To toggle */}
                <div style={{ display:'flex', alignItems:'center', gap:'8px', marginTop:'12px', padding:'8px 10px', background:SEC, borderRadius:'6px', border:`1px solid ${BD}` }}>
                  <input type="checkbox" id="sameAsBillTo" checked={hdr.sameAsBillTo}
                    onChange={e => setH('sameAsBillTo', e.target.checked)}
                    style={{ width:'15px', height:'15px', accentColor:P, cursor:'pointer' }} />
                  <label htmlFor="sameAsBillTo" style={{ fontSize:'13px', fontWeight:500, color:'#374151', cursor:'pointer' }}>Same as Bill To</label>
                </div>
              </div>
            </div>

            {/* Ship To */}
            <div style={S.card}>
              <div style={S.sec}>Ship To — Delivery / Site Address</div>
              <div style={S.body}>
                <div style={{ marginBottom:'10px' }}>
                  <label style={S.lbl}>Site / Location Name</label>
                  <input value={hdr.sameAsBillTo ? hdr.customerName : hdr.shipToName}
                    onChange={e => { if (!hdr.sameAsBillTo) setH('shipToName', e.target.value); }}
                    placeholder={hdr.sameAsBillTo ? 'Same as Bill To' : ''}
                    readOnly={hdr.sameAsBillTo}
                    style={{ ...inp(false), ...(hdr.sameAsBillTo ? { background:'#F3F4F6', color:'#6B7280' } : {}) }} />
                </div>
                <div style={{ marginBottom:'10px' }}>
                  <label style={S.lbl}>Address</label>
                  <input value={hdr.sameAsBillTo ? hdr.customerAddress : hdr.shipToAddress}
                    onChange={e => { if (!hdr.sameAsBillTo) setH('shipToAddress', e.target.value); }}
                    readOnly={hdr.sameAsBillTo}
                    style={{ ...inp(false), ...(hdr.sameAsBillTo ? { background:'#F3F4F6', color:'#6B7280' } : {}) }} />
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px', marginBottom:'10px' }}>
                  <div>
                    <label style={S.lbl}>City</label>
                    <input value={hdr.sameAsBillTo ? hdr.customerCity : hdr.shipToCity}
                      onChange={e => { if (!hdr.sameAsBillTo) setH('shipToCity', e.target.value); }}
                      readOnly={hdr.sameAsBillTo}
                      style={{ ...inp(false), ...(hdr.sameAsBillTo ? { background:'#F3F4F6', color:'#6B7280' } : {}) }} />
                  </div>
                  <div>
                    <label style={S.lbl}>State</label>
                    <select value={hdr.sameAsBillTo ? hdr.customerState : hdr.shipToState}
                      onChange={e => { if (!hdr.sameAsBillTo) setH('shipToState', e.target.value); }}
                      disabled={hdr.sameAsBillTo}
                      style={{ ...selStyle(), ...(hdr.sameAsBillTo ? { background:'#F3F4F6', color:'#6B7280' } : {}) }}>
                      <option value="">— Select —</option>
                      {STATES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label style={S.lbl}>Pincode</label>
                  <input value={hdr.sameAsBillTo ? hdr.customerPincode : hdr.shipToPincode}
                    onChange={e => { if (!hdr.sameAsBillTo) setH('shipToPincode', e.target.value); }}
                    readOnly={hdr.sameAsBillTo}
                    style={{ ...inp(false), width:'140px', ...(hdr.sameAsBillTo ? { background:'#F3F4F6', color:'#6B7280' } : {}) }} />
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT: Reference Numbers & Terms */}
          <div style={{ ...S.card, background:'#F6F8FB', display:'flex', flexDirection:'column' }}>
            <div style={S.sec}>Reference Numbers &amp; Terms</div>
            <div style={{ ...S.body, flex:1 }}>
              {/* ERP Order ID */}
              <div style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'10px' }}>
                <label style={{ ...S.lbl, marginBottom:0, minWidth:'130px', textAlign:'right' }}>ERP Order ID<span style={S.req}>*</span></label>
                <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
                  <span style={{ background:'#FFF3B0', border:'1px solid #F0CC3A', borderRadius:'4px', padding:'4px 12px', fontSize:'14px', fontWeight:700, color:'#92400E', fontFamily:'monospace' }}>{hdr.orderNo}</span>
                  <span style={{ fontSize:'11px', color:'#9CA3AF' }}>(auto-generated)</span>
                </div>
              </div>
              {/* Order No */}
              <div style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'10px' }}>
                <label style={{ ...S.lbl, marginBottom:0, minWidth:'130px', textAlign:'right' }}>Order No.</label>
                <input value={`SO-${hdr.orderNo}`} readOnly style={{ ...inp(false), flex:1, background:'#F3F4F6', color:'#374151', fontFamily:'monospace' }} />
              </div>
              {/* Order Date */}
              <div style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'10px' }}>
                <label style={{ ...S.lbl, marginBottom:0, minWidth:'130px', textAlign:'right' }}>Order Date</label>
                <input type="date" value={hdr.orderDate} onChange={e => setH('orderDate', e.target.value)}
                  style={{ ...inp(errs.orderDate), flex:1 }} />
              </div>
              {/* Client Order No */}
              <div style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'10px' }}>
                <label style={{ ...S.lbl, marginBottom:0, minWidth:'130px', textAlign:'right' }}>Client Order No.</label>
                <input value={hdr.clientOrderNo} onChange={e => setH('clientOrderNo', e.target.value)}
                  placeholder="Customer PO/Work Order No."
                  style={{ ...inp(false), flex:1 }} />
              </div>
              {/* Client Order Date */}
              <div style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'10px' }}>
                <label style={{ ...S.lbl, marginBottom:0, minWidth:'130px', textAlign:'right' }}>Client Order Date</label>
                <input type="date" value={hdr.clientOrderDate} onChange={e => setH('clientOrderDate', e.target.value)}
                  style={{ ...inp(false), flex:1 }} />
              </div>
              {/* Delivery Date */}
              <div style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'10px' }}>
                <label style={{ ...S.lbl, marginBottom:0, minWidth:'130px', textAlign:'right' }}>Delivery Date</label>
                <input type="date" value={hdr.deliveryDate} onChange={e => setH('deliveryDate', e.target.value)}
                  style={{ ...inp(false), flex:1 }} />
              </div>
              {/* Payment Terms */}
              <div style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'10px' }}>
                <label style={{ ...S.lbl, marginBottom:0, minWidth:'130px', textAlign:'right' }}>Payment Terms</label>
                <select value={hdr.paymentTerms} onChange={e => setH('paymentTerms', e.target.value)} style={{ ...selStyle(), flex:1 }}>
                  {['Net 30','Net 45','Net 60','Net 90','Advance','COD','LC'].map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
              {/* Sales Person */}
              <div style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'10px' }}>
                <label style={{ ...S.lbl, marginBottom:0, minWidth:'130px', textAlign:'right' }}>Sales Person</label>
                <select value={hdr.salesPerson} onChange={e => setH('salesPerson', e.target.value)} style={{ ...selStyle(), flex:1 }}>
                  <option value="">— Select —</option>
                  {SALES_PERSONS.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
              {/* Order Type */}
              <div style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'10px' }}>
                <label style={{ ...S.lbl, marginBottom:0, minWidth:'130px', textAlign:'right' }}>Order Type</label>
                <select value={hdr.orderType} onChange={e => setH('orderType', e.target.value)} style={{ ...selStyle(), flex:1 }}>
                  {['Domestic','Export','Project','Service'].map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
              {/* Internal Notes */}
              <div style={{ display:'flex', gap:'10px', marginBottom:'14px' }}>
                <label style={{ ...S.lbl, marginBottom:0, minWidth:'130px', textAlign:'right', paddingTop:'4px' }}>Internal Notes</label>
                <textarea value={hdr.internalNotes} onChange={e => setH('internalNotes', e.target.value)}
                  rows={3} placeholder=""
                  style={{ ...inp(false), flex:1, resize:'vertical' }} />
              </div>
              {/* Total Charges */}
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 12px', borderTop:`1px solid ${BD}`, marginTop:'4px' }}>
                <div style={{ fontSize:'14px', fontWeight:700, color:'#1E293B' }}>
                  Total Charges <span style={{ color:P, marginLeft:'6px' }}>₹{grandTotal.toFixed(2)}</span>
                </div>
                <div style={{ fontSize:'13px', color:'#6B7280' }}>
                  Charges: <strong style={{ color:'#1E293B' }}>₹{grandTotal.toFixed(2)}</strong>
                </div>
              </div>
              {/* Next buttons */}
              <div style={{ display:'flex', gap:'8px', justifyContent:'flex-end', marginTop:'10px' }}>
                <button type="button" onClick={() => setActiveTab(TABS[tabIdx+1]?.id || activeTab)}
                  style={{ background:'#fff', border:`1px solid ${BD}`, color:'#374151', padding:'7px 20px', borderRadius:'6px', cursor:'pointer', fontSize:'13px', fontWeight:500, fontFamily:'inherit' }}>
                  Next
                </button>
                <button type="button" onClick={() => setActiveTab(TABS[tabIdx+1]?.id || activeTab)}
                  style={{ background:P, border:'none', color:'#fff', padding:'7px 20px', borderRadius:'6px', cursor:'pointer', fontSize:'13px', fontWeight:600, fontFamily:'inherit', display:'flex', alignItems:'center', gap:'6px' }}>
                  Next <span>›</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ── Tab Bar ── */}
        <div style={{ background:'#fff', border:`1px solid ${BD}`, display:'flex', overflowX:'auto', borderBottom:`1px solid ${BD}`, borderRadius:'10px 10px 0 0', padding:'0 8px', boxShadow:`0 1px 0 ${BD}` }}>
          {TABS.map((t) => {
            const active = activeTab === t.id;
            const hasErr = (t.id === 'general' && (errs.customerName || errs.orderDate)) || (t.id === 'items' && errs.items);
            return (
              <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
                display:'flex', alignItems:'center', gap:'5px', padding:'11px 14px',
                cursor:'pointer', background:'transparent',
                border:'none', borderBottom: active?`2.5px solid ${P}`:'2.5px solid transparent',
                color: hasErr?'#EF4444': active?P:'#6B7280',
                fontSize:'12px', fontWeight: active?600:400, fontFamily:'inherit',
                whiteSpace:'nowrap', position:'relative',
                transition:'color 0.15s',
              }}>
                <span style={{ fontSize:'13px' }}>{t.icon}</span>
                {t.label}
                {hasErr && <span style={{ width:'6px', height:'6px', borderRadius:'50%', background:'#EF4444', position:'absolute', top:'8px', right:'3px' }} />}
              </button>
            );
          })}
        </div>

        {/* ── Tab Content ── */}
        <div style={{ background:BG, border:`1px solid ${BD}`, borderTop:'none', borderRadius:'0 0 10px 10px', padding:'16px', minHeight:'420px' }}>

          {/* ═══ TAB 1: General Information ═══ */}
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
                <FSel label="Incoterms (Optional)" value={gen.incoterms} onChange={v => setGen(g=>({...g,incoterms:v}))}
                  options={['EXW','FCA','FAS','FOB','CFR','CIF','CPT','CIP','DPU','DAP','DDP']} placeholder="— Select —" />
              </div>
              </div>{/* end S.body */}
            </div>
          )}

          {/* ═══ TAB 2: Item Details ═══ */}
          {activeTab === 'items' && (
            <div style={S.card}>
              <div style={{ ...S.sec, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <span>Item Details</span>
                <button type="button" onClick={addRow} style={{ padding:'4px 14px', background:P, border:'none', color:'#fff', borderRadius:'5px', cursor:'pointer', fontSize:'12px', fontWeight:600, fontFamily:'inherit', letterSpacing:'0.2px' }}>+ Add Row</button>
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
                      const bg = idx % 2 === 0 ? S.td : S.tdAlt;
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
                          <td style={bg}>
                            <select value={it.unit} onChange={e => updItem(it._id,'unit',e.target.value)} style={{ ...selStyle(true), minWidth:'55px' }}>
                              {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                            </select>
                          </td>
                          <td style={bg}><input type="number" value={it.rate} min="0" onChange={e => updItem(it._id,'rate',e.target.value)} style={{ ...inp(false,true), minWidth:'75px', textAlign:'right' }} placeholder="0.00" /></td>
                          <td style={bg}>
                            <div style={{ display:'flex', gap:'2px' }}>
                              <input type="number" value={it.discount} min="0" onChange={e => updItem(it._id,'discount',e.target.value)} style={{ ...inp(false,true), flex:1, minWidth:'44px', textAlign:'right' }} />
                              <select value={it.discountType} onChange={e => updItem(it._id,'discountType',e.target.value)} style={{ width:'36px', padding:'5px 2px', border:'1px solid #BBBCBD', borderRadius:'4px', fontSize:'11px', background:'#F0F0F0' }}>
                                <option value="%">%</option>
                                <option value="₹">₹</option>
                              </select>
                            </div>
                          </td>
                          <td style={bg}>
                            <select value={it.gstPercent} onChange={e => updItem(it._id,'gstPercent',e.target.value)} style={{ ...selStyle(true), minWidth:'55px' }}>
                              {GST_RATES.map(r => <option key={r} value={r}>{r}%</option>)}
                            </select>
                          </td>
                          <td style={{ ...bg, textAlign:'right', fontWeight:700, color:P, paddingRight:'10px' }}>
                            ₹{it.calc.total.toFixed(2)}
                          </td>
                          <td style={{ ...bg, textAlign:'center' }}>
                            <button type="button" onClick={() => delRow(it._id)} style={{ background:'#FEF2F2', border:'1px solid #FECACA', color:'#EF4444', borderRadius:'6px', padding:'3px 8px', cursor:'pointer', fontSize:'11px', fontWeight:700 }}>✕</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Item totals */}
              <div style={{ display:'flex', justifyContent:'flex-end', marginTop:'10px' }}>
                <div style={{ minWidth:'260px', background:SEC, border:`1px solid ${BD}`, borderRadius:'8px', padding:'12px 16px' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', fontSize:'12px', marginBottom:'5px' }}>
                    <span style={{ color:'#6A6D70' }}>Subtotal (Taxable)</span>
                    <span style={{ fontWeight:600 }}>₹{subTotal.toFixed(2)}</span>
                  </div>
                  <div style={{ display:'flex', justifyContent:'space-between', fontSize:'12px', marginBottom:'5px', color:'#6A6D70' }}>
                    <span>Total GST</span>
                    <span>₹{totalGST.toFixed(2)}</span>
                  </div>
                  <div style={{ display:'flex', justifyContent:'space-between', fontSize:'13px', fontWeight:700, color:P, borderTop:`1px solid ${BD}`, paddingTop:'6px', marginTop:'4px' }}>
                    <span>Line Total</span>
                    <span>₹{(subTotal + totalGST).toFixed(2)}</span>
                  </div>
                </div>
              </div>
              </div>{/* end S.body */}
            </div>
          )}

          {/* ═══ TAB 3: Pricing & Tax ═══ */}
          {activeTab === 'pricing' && (
            <div style={S.card}>
              <div style={S.sec}>Pricing & Tax Summary</div>
              <div style={S.body}>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'14px' }}>

                {/* Adjustments */}
                <div style={{ background:SEC, border:`1px solid ${BD}`, borderRadius:'6px', padding:'12px' }}>
                  <div style={{ fontSize:'11px', fontWeight:700, color:'#1a2d4a', marginBottom:'10px', textTransform:'uppercase', letterSpacing:'0.4px' }}>Adjustments</div>
                  <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:'12px' }}>
                      <label style={{ ...S.lbl, margin:0, minWidth:'130px' }}>Overall Discount (₹)</label>
                      <input type="number" value={pricing.overallDiscount} min="0" onChange={e => setPricing(p=>({...p,overallDiscount:e.target.value}))} style={{ ...inp(false,true), width:'100px', textAlign:'right' }} />
                    </div>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:'12px' }}>
                      <label style={{ ...S.lbl, margin:0, minWidth:'130px' }}>Freight Charges (₹)</label>
                      <input type="number" value={pricing.freightCharges} min="0" onChange={e => setPricing(p=>({...p,freightCharges:e.target.value}))} style={{ ...inp(false,true), width:'100px', textAlign:'right' }} />
                    </div>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:'12px' }}>
                      <label style={{ ...S.lbl, margin:0, minWidth:'130px' }}>Packing Charges (₹)</label>
                      <input type="number" value={pricing.packingCharges} min="0" onChange={e => setPricing(p=>({...p,packingCharges:e.target.value}))} style={{ ...inp(false,true), width:'100px', textAlign:'right' }} />
                    </div>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:'12px' }}>
                      <label style={{ ...S.lbl, margin:0, minWidth:'130px' }}>Round Off (₹)</label>
                      <input type="number" value={pricing.roundOff} onChange={e => setPricing(p=>({...p,roundOff:e.target.value}))} style={{ ...inp(false,true), width:'100px', textAlign:'right' }} placeholder="±0.00" />
                    </div>
                  </div>
                </div>

                {/* Tax Summary */}
                <div style={{ background:SEC, border:`1px solid ${BD}`, borderRadius:'6px', padding:'12px' }}>
                  <div style={{ fontSize:'11px', fontWeight:700, color:'#1a2d4a', marginBottom:'10px', textTransform:'uppercase', letterSpacing:'0.4px' }}>
                    Tax Summary — {isIntra ? 'Intrastate (CGST+SGST)' : 'Interstate (IGST)'}
                  </div>
                  {[
                    ['Subtotal (Taxable)',   `₹${subTotal.toFixed(2)}`],
                    ['Overall Discount',     `-₹${overDisc.toFixed(2)}`],
                    isIntra
                      ? ['CGST',             `₹${cgst.toFixed(2)}`]
                      : ['IGST',             `₹${igst.toFixed(2)}`],
                    ...(isIntra ? [['SGST',  `₹${sgst.toFixed(2)}`]] : []),
                    ['Freight',              `+₹${freight.toFixed(2)}`],
                    ['Packing',              `+₹${packing.toFixed(2)}`],
                    ['Round Off',            `${roundOff >= 0 ? '+' : ''}₹${roundOff.toFixed(2)}`],
                  ].map(([k,v]) => (
                    <div key={k} style={{ display:'flex', justifyContent:'space-between', fontSize:'12px', marginBottom:'6px', color:'#32363A' }}>
                      <span style={{ color:'#6A6D70' }}>{k}</span>
                      <span style={{ fontFamily:'monospace' }}>{v}</span>
                    </div>
                  ))}
                  <div style={{ borderTop:`2px solid ${P}`, paddingTop:'8px', marginTop:'6px', display:'flex', justifyContent:'space-between', fontSize:'15px', fontWeight:700, color:P }}>
                    <span>Grand Total</span>
                    <span>₹{grandTotal.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              {/* GST breakdown per item */}
              <div style={{ marginTop:'12px' }}>
                <div style={{ fontSize:'11px', fontWeight:700, color:'#1a2d4a', textTransform:'uppercase', marginBottom:'8px', letterSpacing:'0.4px' }}>Item-wise GST Breakdown</div>
                <table style={S.tbl}>
                  <thead>
                    <tr>
                      <th style={S.th}>Item Name</th>
                      <th style={S.th}>HSN</th>
                      <th style={{ ...S.th, textAlign:'right' }}>Taxable</th>
                      <th style={{ ...S.th, textAlign:'right' }}>GST %</th>
                      {isIntra ? <>
                        <th style={{ ...S.th, textAlign:'right' }}>CGST</th>
                        <th style={{ ...S.th, textAlign:'right' }}>SGST</th>
                      </> : <th style={{ ...S.th, textAlign:'right' }}>IGST</th>}
                      <th style={{ ...S.th, textAlign:'right' }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.filter(r => r.itemName).map((r, i) => (
                      <tr key={r._id}>
                        <td style={i%2===0?S.td:S.tdAlt}>{r.itemName}</td>
                        <td style={i%2===0?S.td:S.tdAlt}>{r.hsnCode||'—'}</td>
                        <td style={{ ...(i%2===0?S.td:S.tdAlt), textAlign:'right' }}>₹{r.calc.taxable.toFixed(2)}</td>
                        <td style={{ ...(i%2===0?S.td:S.tdAlt), textAlign:'right' }}>{r.gstPercent}%</td>
                        {isIntra ? <>
                          <td style={{ ...(i%2===0?S.td:S.tdAlt), textAlign:'right' }}>₹{(r.calc.gst/2).toFixed(2)}</td>
                          <td style={{ ...(i%2===0?S.td:S.tdAlt), textAlign:'right' }}>₹{(r.calc.gst/2).toFixed(2)}</td>
                        </> : <td style={{ ...(i%2===0?S.td:S.tdAlt), textAlign:'right' }}>₹{r.calc.gst.toFixed(2)}</td>}
                        <td style={{ ...(i%2===0?S.td:S.tdAlt), textAlign:'right', fontWeight:600 }}>₹{r.calc.total.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              </div>{/* end S.body */}
            </div>
          )}

          {/* ═══ TAB 4: Delivery & Shipping ═══ */}
          {activeTab === 'delivery' && (
            <div style={S.card}>
              <div style={S.sec}>Delivery & Dispatch Details</div>
              <div style={S.body}>
              <div style={S.g2}>
                <FTA label="Delivery Address" req value={del.deliveryAddr} onChange={v => setDel(d=>({...d,deliveryAddr:v}))} placeholder="Full delivery address…" rows={3} />
                <div>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'3px' }}>
                    <label style={S.lbl}>Shipping / Dispatch Address</label>
                    <button type="button" onClick={() => setDel(d=>({...d,shippingAddr:d.deliveryAddr}))} style={{ fontSize:'11px', color:P, background:SEC, border:`1px solid ${BD}`, borderRadius:'6px', padding:'3px 10px', cursor:'pointer', fontWeight:600 }}>⇩ Copy from Delivery</button>
                  </div>
                  <textarea value={del.shippingAddr} rows={3} onChange={e => setDel(d=>({...d,shippingAddr:e.target.value}))}
                    placeholder="Leave blank if same as delivery…"
                    style={{ ...inp(false), resize:'vertical', minHeight:'66px' }} />
                </div>
              </div>
              <div style={{ ...S.g3, marginTop:'10px' }}>
                <FSel label="Dispatch Mode" value={del.dispatchMode} onChange={v => setDel(d=>({...d,dispatchMode:v}))}
                  options={['Road','Rail','Air','Sea','Courier','Hand Delivery']} />
                <FIn label="Transporter Name" value={del.transporterName} onChange={v => setDel(d=>({...d,transporterName:v}))} placeholder="Transporter / Courier name" />
                <FIn label="Vehicle Number" value={del.vehicleNumber} onChange={v => setDel(d=>({...d,vehicleNumber:v.toUpperCase()}))} placeholder="MH12AB1234" upper />
              </div>
              <div style={{ marginTop:'10px' }}>
                <FTA label="Delivery Instructions" value={del.deliveryInstructions} onChange={v => setDel(d=>({...d,deliveryInstructions:v}))} placeholder="Special delivery instructions, handling notes…" rows={2} />
              </div>
              </div>{/* end S.body */}
            </div>
          )}

          {/* ═══ TAB 5: Payment Terms ═══ */}
          {activeTab === 'payment' && (
            <div style={S.card}>
              <div style={S.sec}>Payment Configuration</div>
              <div style={S.body}>
              <div style={S.g3}>
                <FSel label="Payment Terms" value={pay.paymentTerms} onChange={v => setPay(p=>({...p,paymentTerms:v}))}
                  options={['Advance','7 Days','15 Days','30 Days','45 Days','60 Days','90 Days','On Delivery','LC']} />
                <FSel label="Payment Mode" value={pay.paymentMode} onChange={v => setPay(p=>({...p,paymentMode:v}))}
                  options={['NEFT','RTGS','IMPS','Cheque','Cash','UPI','DD','LC','Credit Card']} />
                <div>
                  <label style={S.lbl}>Due Date (Auto)</label>
                  <input type="date" value={pay.dueDate} onChange={e => setPay(p=>({...p,dueDate:e.target.value}))} style={inp(false)} />
                  <div style={S.hint}>Auto-calculated from order date + terms</div>
                </div>
              </div>
              <div style={{ ...S.g2, marginTop:'10px' }}>
                <div>
                  <label style={S.lbl}>Credit Limit (₹)</label>
                  <div style={{ display:'flex', alignItems:'center', border:`1px solid ${BD}`, borderRadius:'6px', overflow:'hidden', background:'#FAFCFF' }}>
                    <span style={{ padding:'6px 9px', background:SEC, borderRight:`1px solid ${BD}`, fontSize:'12px', color:'#133d80', fontWeight:600 }}>₹</span>
                    <input type="number" value={pay.creditLimit} onChange={e => setPay(p=>({...p,creditLimit:e.target.value}))} placeholder="0" style={{ flex:1, padding:'6px 9px', border:'none', outline:'none', background:'transparent', fontSize:'12px', fontFamily:'inherit' }} />
                  </div>
                </div>
                <FTA label="Billing Terms" value={pay.billingTerms} onChange={v => setPay(p=>({...p,billingTerms:v}))} placeholder="Special billing terms or conditions…" rows={3} />
              </div>
              {/* Grand Total reminder */}
              <div style={{ marginTop:'14px', padding:'12px 16px', background:SEC, border:`1px solid ${BD}`, borderLeft:`4px solid ${P}`, borderRadius:'8px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <span style={{ fontSize:'12px', color:'#133d80', fontWeight:600 }}>Order Grand Total</span>
                <span style={{ fontSize:'16px', fontWeight:700, color:P, fontFamily:'monospace' }}>₹{grandTotal.toFixed(2)}</span>
              </div>
              </div>{/* end S.body */}
            </div>
          )}

          {/* ═══ TAB 6: Specifications ═══ */}
          {activeTab === 'specs' && (
            <div>
              {/* Toolbar */}
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
                <div style={{ fontSize:13, fontWeight:700, color:'#1a2d4a' }}>Specification Sheet</div>
                <div style={{ display:'flex', gap:8, alignItems:'center' }}>
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
                    style={{ ...selStyle(true), width:220 }}
                  >
                    <option value="">＋ Add Spec Group (select item)…</option>
                    {items.filter(it=>it.itemName||it.material).map((it,i)=>(
                      <option key={i} value={it._id||it.itemCode||it.itemName}>{it.itemName||it.material}</option>
                    ))}
                    <option value="__general__">General / No specific item</option>
                  </select>
                </div>
              </div>

              {specSheet.length === 0 && (
                <div style={{ textAlign:'center', padding:'40px 20px', color:'#94A3B8', fontSize:13, background:'#fff', border:`1px dashed ${BD}`, borderRadius:8 }}>
                  No specifications yet. Select an item above to create a spec group.
                </div>
              )}

              {specSheet.map((grp) => (
                <div key={grp._id} style={{ ...S.card, marginBottom:14 }}>
                  {/* Group header */}
                  <div style={{ background:'#104f4f', padding:'8px 14px', display:'flex', alignItems:'center', gap:10, borderRadius:'8px 8px 0 0' }}>
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
                        {/* Header row */}
                        <div style={{ background:'#EEF4FF', borderBottom:`1px solid ${BD}`, padding:'6px 10px', display:'flex', alignItems:'center', gap:8 }}>
                          <span style={{ fontSize:11, fontWeight:700, color:P, textTransform:'uppercase', letterSpacing:'0.5px', flexShrink:0 }}>▌ HEADER</span>
                          <input
                            value={hdr.title}
                            onChange={e => ssSetHdrT(grp._id, hdr._id, e.target.value)}
                            placeholder="e.g. Civil Work, Electrical, Structural…"
                            style={{ ...inp(false,true), flex:1, fontWeight:700, fontSize:12 }}
                          />
                          <button type="button" onClick={() => ssAddSub(grp._id, hdr._id)}
                            style={{ padding:'3px 10px', fontSize:11, background:SEC, border:`1px solid ${BD}`, color:P, borderRadius:4, cursor:'pointer', fontWeight:600, flexShrink:0 }}>
                            + Sub Header
                          </button>
                          <button type="button" onClick={() => ssDelHdr(grp._id, hdr._id)}
                            style={{ background:'#FEE2E2', border:'1px solid #FCA5A5', color:'#DC2626', borderRadius:4, padding:'3px 7px', cursor:'pointer', fontSize:12, flexShrink:0 }}>✕</button>
                        </div>

                        {/* Sub-headers */}
                        <div style={{ padding:'8px 10px', display:'flex', flexDirection:'column', gap:10 }}>
                          {hdr.subHeaders.map((sub) => {
                            let srCounter = 0;
                            return (
                              <div key={sub._id} style={{ border:`1px solid #dde4f0`, borderRadius:5, overflow:'hidden' }}>
                                {/* Sub-header title row */}
                                <div style={{ background:'#F0F6FF', borderBottom:'1px solid #dde4f0', padding:'5px 10px', display:'flex', alignItems:'center', gap:8 }}>
                                  <span style={{ fontSize:11, fontWeight:600, color:'#3b5ea6', flexShrink:0 }}>▶ SUB HEADER</span>
                                  <input
                                    value={sub.title}
                                    onChange={e => ssSetSubT(grp._id, hdr._id, sub._id, e.target.value)}
                                    placeholder="e.g. Foundation, Wiring, Painting…"
                                    style={{ ...inp(false,true), flex:1, fontSize:12 }}
                                  />
                                  <button type="button" onClick={() => ssDelSub(grp._id, hdr._id, sub._id)}
                                    style={{ background:'#FEE2E2', border:'1px solid #FCA5A5', color:'#DC2626', borderRadius:4, padding:'2px 7px', cursor:'pointer', fontSize:12, flexShrink:0 }}>✕</button>
                                </div>

                                {/* Rows table */}
                                <div style={{ overflowX:'auto' }}>
                                  <table style={{ ...S.tbl, minWidth:600 }}>
                                    <thead>
                                      <tr>
                                        <th style={{ ...S.th, width:44, textAlign:'center' }}>Sr No</th>
                                        <th style={{ ...S.th }}>Description</th>
                                        <th style={{ ...S.th, width:90, textAlign:'center' }}>Qty</th>
                                        <th style={{ ...S.th }}>Remarks</th>
                                        <th style={{ ...S.th, width:36, textAlign:'center' }}></th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {sub.rows.map((row, ri) => {
                                        srCounter++;
                                        const sr = srCounter;
                                        return (
                                          <tr key={row._id} style={{ background: ri%2===0 ? '#fff' : '#F9FAFB' }}>
                                            <td style={{ ...S.td, textAlign:'center', color:'#6B7280', fontWeight:600, fontSize:11 }}>{sr}</td>
                                            <td style={S.td}>
                                              <input
                                                value={row.description}
                                                onChange={e => ssUpdRow(grp._id,hdr._id,sub._id,row._id,'description',e.target.value)}
                                                placeholder="Description…"
                                                style={{ ...inp(false,true), width:'100%' }}
                                              />
                                            </td>
                                            <td style={S.td}>
                                              <input
                                                value={row.qty}
                                                onChange={e => ssUpdRow(grp._id,hdr._id,sub._id,row._id,'qty',e.target.value)}
                                                placeholder="Qty"
                                                style={{ ...inp(false,true), width:'100%', textAlign:'center' }}
                                              />
                                            </td>
                                            <td style={S.td}>
                                              <input
                                                value={row.remarks}
                                                onChange={e => ssUpdRow(grp._id,hdr._id,sub._id,row._id,'remarks',e.target.value)}
                                                placeholder="Remarks…"
                                                style={{ ...inp(false,true), width:'100%' }}
                                              />
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

          {/* ═══ TAB: Material Planning ═══ */}
          {activeTab === 'matplan' && (() => {
            const groups = [...new Set(matPlan.map(m => m.unitGroup || 'Default'))];
            const purchaseCount = matPlan.filter(m=>m.itemType==='Purchase').length;
            const mfgCount = matPlan.filter(m=>m.itemType==='Manufactured').length;
            return (
              <div>
                {/* Summary pills */}
                <div style={{ display:'flex', gap:10, marginBottom:12 }}>
                  {[
                    { label:'Total Items', val:matPlan.length, color:'#133d80' },
                    { label:'Purchase',    val:purchaseCount,  color:'#0070F2' },
                    { label:'Manufactured',val:mfgCount,       color:'#188918' },
                    { label:'Units/Cabins',val:groups.length,  color:'#E9730C' },
                  ].map(p=>(
                    <div key={p.label} style={{ padding:'6px 14px', background:'#fff', border:`1px solid ${p.color}30`, borderLeft:`3px solid ${p.color}`, borderRadius:4 }}>
                      <div style={{ fontSize:18, fontWeight:700, color:p.color }}>{p.val}</div>
                      <div style={{ fontSize:10, color:'#6A6D70', textTransform:'uppercase', letterSpacing:'0.5px' }}>{p.label}</div>
                    </div>
                  ))}
                  <div style={{ marginLeft:'auto', display:'flex', gap:8, alignItems:'center' }}>
                    <button type="button" onClick={() => setMatPlan(p=>[...p,newMatItem()])}
                      style={{ padding:'6px 16px', background:P, border:'none', color:'#fff', borderRadius:5, cursor:'pointer', fontSize:12, fontWeight:600, fontFamily:'inherit' }}>
                      + Add Item
                    </button>
                  </div>
                </div>

                {/* Group by cabin */}
                {groups.map(grp => {
                  const grpItems = matPlan.filter(m=>(m.unitGroup||'Default')===grp);
                  return (
                    <div key={grp} style={{ ...S.card, marginBottom:12 }}>
                      {/* Group header band */}
                      <div style={{ ...S.sec, display:'flex', alignItems:'center', gap:12 }}>
                        <span style={{ fontWeight:700, color:'#1a2d4a' }}>🏗️ {grp}</span>
                        <span style={{ fontSize:11, color:'#5a6e82' }}>{grpItems.length} item(s)</span>
                        <span style={{ fontSize:11, color:P }}>{grpItems.filter(i=>i.itemType==='Purchase').length} purchase</span>
                        <span style={{ fontSize:11, color:'#15803D' }}>{grpItems.filter(i=>i.itemType==='Manufactured').length} manufactured</span>
                      </div>
                      <div style={{ padding:'10px 14px' }}>

                      {grpItems.map((m, idx) => (
                        <div key={m._id} style={{ marginBottom:8, border:'1px solid #E5E5E5', borderRadius:6, overflow:'hidden' }}>
                          {/* Item row */}
                          <div style={{ display:'grid', gridTemplateColumns:'28px 130px 1fr 110px 60px 70px 1fr 32px', gap:6, padding:'6px 8px', background: m.itemType==='Manufactured' ? '#F0FFF4' : '#F0F9FF', alignItems:'center' }}>
                            <div style={{ textAlign:'center', fontSize:11, fontWeight:700, color:'#6A6D70' }}>{idx+1}</div>
                            {/* Unit group editable */}
                            <input value={m.unitGroup} onChange={e=>updMat(m._id,'unitGroup',e.target.value)} placeholder="Cabin / Unit" style={{ ...inp(false,true) }} />
                            <input value={m.itemName} onChange={e=>updMat(m._id,'itemName',e.target.value)} placeholder="Item name (e.g. AC, Steel Sheet)" style={{ ...inp(false,true) }} />
                            <select value={m.itemType} onChange={e=>updMat(m._id,'itemType',e.target.value)} style={{ ...selStyle(true), fontWeight:600, color:m.itemType==='Manufactured'?'#16A34A':P, background:m.itemType==='Manufactured'?'#F0FDF4':SEC }}>
                              {MAT_TYPES.map(t=><option key={t} value={t}>{t}</option>)}
                            </select>
                            <input type="number" value={m.requiredQty} min="0" onChange={e=>updMat(m._id,'requiredQty',e.target.value)} style={{ ...inp(false,true), textAlign:'right' }} />
                            <select value={m.unit} onChange={e=>updMat(m._id,'unit',e.target.value)} style={selStyle(true)}>
                              {UNITS.map(u=><option key={u} value={u}>{u}</option>)}
                            </select>
                            <input value={m.remarks} onChange={e=>updMat(m._id,'remarks',e.target.value)} placeholder="Remarks…" style={inp(false,true)} />
                            <button type="button" onClick={()=>delMat(m._id)} style={{ background:'#FFEBEB', border:'1px solid #F5B8B8', color:'#BB0000', borderRadius:3, padding:'3px 7px', cursor:'pointer', fontSize:11, fontWeight:700, width:'100%' }}>✕</button>
                          </div>

                          {/* BOM sub-table for Manufactured items */}
                          {m.itemType==='Manufactured' && (
                            <div style={{ padding:'6px 10px 8px 36px', background:'#FAFFFE', borderTop:'1px solid #BBF7D0' }}>
                              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
                                <div style={{ fontSize:10, fontWeight:700, color:'#188918', textTransform:'uppercase', letterSpacing:'0.5px' }}>
                                  📋 Raw Materials BOM for "{m.itemName||'this item'}"
                                </div>
                                <button type="button" onClick={()=>addBOMLine(m._id)} style={{ padding:'3px 10px', background:'#16A34A', border:'none', color:'#fff', borderRadius:4, cursor:'pointer', fontSize:11, fontWeight:600, fontFamily:'inherit' }}>+ Add Raw Material</button>
                              </div>
                              {m.bomLines.length===0 ? (
                                <div style={{ fontSize:11, color:'#94A3B8', padding:'4px 0' }}>No raw materials defined. Click "+ Add Raw Material".</div>
                              ) : (
                                <table style={{ ...S.tbl, fontSize:11 }}>
                                  <thead>
                                    <tr>
                                      <th style={{ ...S.th, background:'#16A34A', width:28, fontSize:10 }}>#</th>
                                      <th style={{ ...S.th, background:'#16A34A', minWidth:160, fontSize:10 }}>Raw Material</th>
                                      <th style={{ ...S.th, background:'#16A34A', width:70, fontSize:10 }}>Qty</th>
                                      <th style={{ ...S.th, background:'#16A34A', width:70, fontSize:10 }}>Unit</th>
                                      <th style={{ ...S.th, background:'#16A34A', width:32, fontSize:10 }}></th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {m.bomLines.map((bl,bi)=>(
                                      <tr key={bl._id}>
                                        <td style={{ ...S.td, textAlign:'center', color:'#6A6D70' }}>{bi+1}</td>
                                        <td style={S.td}><input value={bl.rawMaterial} onChange={e=>updBOMLine(m._id,bl._id,'rawMaterial',e.target.value)} placeholder="e.g. Steel Sheet, PUF Panel…" style={inp(false,true)} /></td>
                                        <td style={S.td}><input type="number" value={bl.qty} min="0" onChange={e=>updBOMLine(m._id,bl._id,'qty',e.target.value)} style={{ ...inp(false,true), textAlign:'right' }} /></td>
                                        <td style={S.td}><select value={bl.unit} onChange={e=>updBOMLine(m._id,bl._id,'unit',e.target.value)} style={selStyle(true)}>{UNITS.map(u=><option key={u} value={u}>{u}</option>)}</select></td>
                                        <td style={{ ...S.td, textAlign:'center' }}><button type="button" onClick={()=>delBOMLine(m._id,bl._id)} style={{ background:'#FFEBEB', border:'1px solid #F5B8B8', color:'#BB0000', borderRadius:3, padding:'2px 6px', cursor:'pointer', fontSize:10, fontWeight:700 }}>✕</button></td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              )}
                              {m.bomRef && <div style={{ fontSize:10, color:'#6A6D70', marginTop:4 }}>BOM Ref: <b>{m.bomRef}</b></div>}
                              <div style={{ marginTop:4 }}>
                                <input value={m.bomRef} onChange={e=>updMat(m._id,'bomRef',e.target.value)} placeholder="BOM Reference No. (optional)" style={{ ...inp(false,true), width:220, fontSize:11 }} />
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                      </div>{/* end group body padding */}
                    </div>
                  );
                })}

                <div style={{ padding:'10px 14px', background:SEC, borderRadius:8, border:`1px solid ${BD}`, fontSize:11, color:'#1e3a6e' }}>
                  💡 <b>Purchase items</b> go directly to Purchase Order. <b>Manufactured items</b> define BOM raw materials that also need purchasing. Use the PO screen to "Fetch Pending Materials" from this plan.
                </div>
              </div>
            );
          })()}

          {/* ═══ TAB: Scope of Work ═══ */}
          {activeTab === 'scope' && (
            <div style={S.card}>
              <div style={{ ...S.sec, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <span>Scope of Work / Supply</span>
                <button type="button" onClick={() => setScopeItems(p => [...p, newScopeItem()])}
                  style={{ padding:'4px 14px', background:P, border:'none', color:'#fff', borderRadius:'5px', cursor:'pointer', fontSize:'12px', fontWeight:600, fontFamily:'inherit' }}>
                  + Add Scope
                </button>
              </div>
              <div style={S.body}>
              <div style={{ overflowX:'auto' }}>
                <table style={S.tbl}>
                  <thead>
                    <tr>
                      <th style={{ ...S.th, width:32 }}>#</th>
                      <th style={{ ...S.th, width:160 }}>Scope Type</th>
                      <th style={{ ...S.th, minWidth:200 }}>Description</th>
                      <th style={{ ...S.th, width:70 }}>Qty</th>
                      <th style={{ ...S.th, width:80 }}>Unit</th>
                      <th style={{ ...S.th, minWidth:160 }}>Remarks</th>
                      <th style={{ ...S.th, width:36 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {scopeItems.map((sc, idx) => {
                      const bg = idx % 2 === 0 ? S.td : S.tdAlt;
                      return (
                        <tr key={sc._id}>
                          <td style={{ ...bg, textAlign:'center', color:'#6A6D70', fontWeight:600, fontSize:11 }}>{idx+1}</td>
                          <td style={bg}>
                            <select value={sc.scopeType} onChange={e => updScope(sc._id,'scopeType',e.target.value)} style={selStyle(true)}>
                              {SCOPE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                          </td>
                          <td style={bg}><input value={sc.description} onChange={e => updScope(sc._id,'description',e.target.value)} placeholder="Describe scope item…" style={{ ...inp(false,true), minWidth:190 }} /></td>
                          <td style={bg}><input type="number" value={sc.qty} min="0" onChange={e => updScope(sc._id,'qty',e.target.value)} style={{ ...inp(false,true), textAlign:'right' }} /></td>
                          <td style={bg}>
                            <select value={sc.unit} onChange={e => updScope(sc._id,'unit',e.target.value)} style={selStyle(true)}>
                              {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                            </select>
                          </td>
                          <td style={bg}><input value={sc.remarks} onChange={e => updScope(sc._id,'remarks',e.target.value)} placeholder="Remarks…" style={{ ...inp(false,true), minWidth:150 }} /></td>
                          <td style={{ ...bg, textAlign:'center' }}>
                            <button type="button" onClick={() => delScope(sc._id)} style={{ background:'#FFEBEB', border:'1px solid #F5B8B8', color:'#BB0000', borderRadius:'3px', padding:'3px 7px', cursor:'pointer', fontSize:11, fontWeight:700 }}>✕</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div style={{ marginTop:12, padding:'10px 14px', background:SEC, borderRadius:8, border:`1px solid ${BD}`, fontSize:11, color:'#1e3a6e' }}>
                💡 After defining scope, go to <b>BOM</b> tab to auto-generate materials, and <b>Tasks</b> tab to auto-create project tasks.
              </div>
              </div>{/* end S.body */}
            </div>
          )}

          {/* ═══ TAB: BOM — Material Planning ═══ */}
          {activeTab === 'bom' && (
            <div style={S.card}>
              <div style={{ ...S.sec, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <span>BOM — Bill of Materials</span>
                <div style={{ display:'flex', gap:6 }}>
                  <button type="button" onClick={autoGenBOM}
                    style={{ padding:'4px 12px', background:'#16A34A', border:'none', color:'#fff', borderRadius:5, cursor:'pointer', fontSize:11, fontWeight:600, fontFamily:'inherit' }}>
                    ⚡ Auto-Generate from Scope
                  </button>
                  <button type="button" onClick={() => setBOMItems(p => [...p, newBOMItem()])}
                    style={{ padding:'4px 14px', background:P, border:'none', color:'#fff', borderRadius:5, cursor:'pointer', fontSize:12, fontWeight:600, fontFamily:'inherit' }}>
                    + Add Row
                  </button>
                </div>
              </div>
              <div style={S.body}>
              {bomItems.length === 0 ? (
                <div style={{ textAlign:'center', padding:'32px 0', color:'#94A3B8', fontSize:13 }}>
                  <div style={{ fontSize:36, marginBottom:8 }}>🔧</div>
                  No BOM items. Click <b>"Auto-Generate from Scope"</b> or add rows manually.
                </div>
              ) : (
                <div style={{ overflowX:'auto' }}>
                  <table style={S.tbl}>
                    <thead>
                      <tr>
                        <th style={{ ...S.th, width:32 }}>#</th>
                        <th style={{ ...S.th, width:90 }}>Item Code</th>
                        <th style={{ ...S.th, minWidth:160 }}>Item Name</th>
                        <th style={{ ...S.th, width:70 }}>Qty</th>
                        <th style={{ ...S.th, width:75 }}>Unit</th>
                        <th style={{ ...S.th, width:140 }}>Warehouse</th>
                        <th style={{ ...S.th, width:140 }}>Linked Scope</th>
                        <th style={{ ...S.th, width:36 }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {bomItems.map((bm, idx) => {
                        const bg = idx % 2 === 0 ? S.td : S.tdAlt;
                        return (
                          <tr key={bm._id}>
                            <td style={{ ...bg, textAlign:'center', color:'#6A6D70', fontWeight:600, fontSize:11 }}>{idx+1}</td>
                            <td style={bg}><input value={bm.itemCode} onChange={e => updBOM(bm._id,'itemCode',e.target.value)} placeholder="CODE" style={{ ...inp(false,true), minWidth:80 }} /></td>
                            <td style={bg}><input value={bm.itemName} onChange={e => updBOM(bm._id,'itemName',e.target.value)} placeholder="Material / Item name" style={{ ...inp(false,true), minWidth:150 }} /></td>
                            <td style={bg}><input type="number" value={bm.qty} min="0" onChange={e => updBOM(bm._id,'qty',e.target.value)} style={{ ...inp(false,true), textAlign:'right' }} /></td>
                            <td style={bg}>
                              <select value={bm.unit} onChange={e => updBOM(bm._id,'unit',e.target.value)} style={selStyle(true)}>
                                {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                              </select>
                            </td>
                            <td style={bg}>
                              <select value={bm.warehouse} onChange={e => updBOM(bm._id,'warehouse',e.target.value)} style={selStyle(true)}>
                                {SCOPE_WAREHOUSES.map(w => <option key={w} value={w}>{w}</option>)}
                              </select>
                            </td>
                            <td style={bg}>
                              <select value={bm.linkedScope} onChange={e => updBOM(bm._id,'linkedScope',e.target.value)} style={selStyle(true)}>
                                <option value="">— None —</option>
                                {SCOPE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                              </select>
                            </td>
                            <td style={{ ...bg, textAlign:'center' }}>
                              <button type="button" onClick={() => delBOM(bm._id)} style={{ background:'#FFEBEB', border:'1px solid #F5B8B8', color:'#BB0000', borderRadius:3, padding:'3px 7px', cursor:'pointer', fontSize:11, fontWeight:700 }}>✕</button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <div style={{ display:'flex', justifyContent:'flex-end', marginTop:8, fontSize:12, color:'#133d80', fontWeight:600 }}>
                    Total: {bomItems.reduce((s,b)=>s+(parseFloat(b.qty)||0),0).toFixed(2)} units across {bomItems.length} material line(s)
                  </div>
                </div>
              )}
              </div>{/* end S.body */}
            </div>
          )}

          {/* ═══ TAB: Tasks / Project Plan ═══ */}
          {activeTab === 'tasks' && (
            <div style={S.card}>
              <div style={{ ...S.sec, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <span>Tasks / Project Plan</span>
                <div style={{ display:'flex', gap:6 }}>
                  <button type="button" onClick={autoGenTasks}
                    style={{ padding:'4px 12px', background:'#16A34A', border:'none', color:'#fff', borderRadius:5, cursor:'pointer', fontSize:11, fontWeight:600, fontFamily:'inherit' }}>
                    ⚡ Auto-Create from Scope
                  </button>
                  <button type="button" onClick={() => setTasks(p => [...p, newTask()])}
                    style={{ padding:'4px 14px', background:P, border:'none', color:'#fff', borderRadius:5, cursor:'pointer', fontSize:12, fontWeight:600, fontFamily:'inherit' }}>
                    + Add Task
                  </button>
                </div>
              </div>
              <div style={S.body}>
              {tasks.length === 0 ? (
                <div style={{ textAlign:'center', padding:'32px 0', color:'#94A3B8', fontSize:13 }}>
                  <div style={{ fontSize:36, marginBottom:8 }}>📌</div>
                  No tasks yet. Click <b>"Auto-Create from Scope"</b> or add tasks manually.
                </div>
              ) : (
                <>
                  {/* Progress summary */}
                  {(() => {
                    const done = tasks.filter(t => t.status === 'Completed').length;
                    const pct  = tasks.length ? Math.round(done / tasks.length * 100) : 0;
                    return (
                      <div style={{ marginBottom:12, padding:'8px 14px', background:SEC, border:`1px solid ${BD}`, borderRadius:6, display:'flex', alignItems:'center', gap:16 }}>
                        <div style={{ flex:1 }}>
                          <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, marginBottom:4, color:'#133d80', fontWeight:600 }}>
                            <span>Project Progress</span><span>{pct}% ({done}/{tasks.length} tasks)</span>
                          </div>
                          <div style={{ height:8, background:'#DBEAFE', borderRadius:4, overflow:'hidden' }}>
                            <div style={{ height:'100%', width:`${pct}%`, background: pct===100?'#16A34A':P, borderRadius:4, transition:'width 0.3s' }} />
                          </div>
                        </div>
                        <div style={{ fontSize:20, fontWeight:700, color: pct===100?'#16A34A':P }}>{pct}%</div>
                      </div>
                    );
                  })()}

                  <div style={{ overflowX:'auto' }}>
                    <table style={S.tbl}>
                      <thead>
                        <tr>
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
                        </tr>
                      </thead>
                      <tbody>
                        {tasks.map((tk, idx) => {
                          const bg = idx % 2 === 0 ? S.td : S.tdAlt;
                          const priColor = { Low:'#6A6D70', Medium:'#E9730C', High:'#BB0000', Critical:'#6D0000' }[tk.priority] || '#32363A';
                          return (
                            <tr key={tk._id}>
                              <td style={{ ...bg, textAlign:'center', color:'#6A6D70', fontWeight:600, fontSize:11 }}>{idx+1}</td>
                              <td style={bg}><input value={tk.taskName} onChange={e => updTask(tk._id,'taskName',e.target.value)} placeholder="Task name…" style={{ ...inp(false,true), minWidth:150 }} /></td>
                              <td style={bg}>
                                <select value={tk.linkedScope} onChange={e => updTask(tk._id,'linkedScope',e.target.value)} style={selStyle(true)}>
                                  <option value="">— None —</option>
                                  {SCOPE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                                </select>
                              </td>
                              <td style={bg}><input value={tk.assignedTo} onChange={e => updTask(tk._id,'assignedTo',e.target.value)} placeholder="Name" style={{ ...inp(false,true) }} /></td>
                              <td style={bg}><input type="date" value={tk.startDate} onChange={e => updTask(tk._id,'startDate',e.target.value)} style={inp(false,true)} /></td>
                              <td style={bg}><input type="date" value={tk.endDate} onChange={e => updTask(tk._id,'endDate',e.target.value)} style={inp(false,true)} /></td>
                              <td style={bg}>
                                <select value={tk.status} onChange={e => updTask(tk._id,'status',e.target.value)} style={{ ...selStyle(true), color: tk.status==='Completed'?'#16A34A': tk.status==='In Progress'?P:'#6A6D70', fontWeight:600 }}>
                                  {TASK_STATUS.map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                              </td>
                              <td style={bg}>
                                <select value={tk.priority} onChange={e => updTask(tk._id,'priority',e.target.value)} style={{ ...selStyle(true), color: priColor, fontWeight:600 }}>
                                  {PRIORITY.map(p => <option key={p} value={p}>{p}</option>)}
                                </select>
                              </td>
                              <td style={bg}><input value={tk.remarks} onChange={e => updTask(tk._id,'remarks',e.target.value)} placeholder="Remarks…" style={{ ...inp(false,true), minWidth:110 }} /></td>
                              <td style={{ ...bg, textAlign:'center' }}>
                                <button type="button" onClick={() => delTask(tk._id)} style={{ background:'#FFEBEB', border:'1px solid #F5B8B8', color:'#BB0000', borderRadius:3, padding:'3px 7px', cursor:'pointer', fontSize:11, fontWeight:700 }}>✕</button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
              </div>{/* end S.body */}
            </div>
          )}

          {/* ═══ TAB 7: Attachments ═══ */}
          {activeTab === 'attach' && (
            <div style={S.card}>
              <div style={S.sec}>File Attachments</div>
              <div style={S.body}>
              <div style={{ border:`2px dashed ${BD}`, borderRadius:'6px', padding:'20px', textAlign:'center', background:BG, marginBottom:'14px' }}>
                <div style={{ fontSize:'28px', marginBottom:'6px' }}>📁</div>
                <div style={{ fontSize:'13px', color:'#1a2d4a', fontWeight:700, marginBottom:'4px' }}>Drop files here or click to browse</div>
                <div style={{ fontSize:'11px', color:'#64748B', marginBottom:'10px' }}>PDF, Excel (.xlsx), Images (JPG, PNG), Drawings (DWG)</div>
                <label style={{ display:'inline-block', padding:'7px 22px', background:P, color:'#fff', borderRadius:'6px', cursor:'pointer', fontSize:'12px', fontWeight:600, letterSpacing:'0.2px' }}>
                  📎 Choose Files
                  <input type="file" multiple accept=".pdf,.xlsx,.xls,.jpg,.jpeg,.png,.dwg,.doc,.docx" onChange={handleFiles} style={{ display:'none' }} />
                </label>
              </div>

              {attachments.length === 0 && <div style={{ fontSize:'12px', color:'#94A3B8', textAlign:'center', padding:'10px' }}>No files attached yet.</div>}

              {attachments.length > 0 && (
                <table style={S.tbl}>
                  <thead>
                    <tr>
                      <th style={S.th}>#</th>
                      <th style={S.th}>File Name</th>
                      <th style={S.th}>Type</th>
                      <th style={{ ...S.th, textAlign:'right' }}>Size</th>
                      <th style={S.th}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {attachments.map((a, i) => {
                      const ext = a.name.split('.').pop().toUpperCase();
                      const sizeKB = (a.size/1024).toFixed(1);
                      const iconMap = { PDF:'🔴', XLSX:'🟢', XLS:'🟢', JPG:'🔵', JPEG:'🔵', PNG:'🔵', DWG:'🟡', DOC:'🔷', DOCX:'🔷' };
                      return (
                        <tr key={i}>
                          <td style={{ ...S.td, textAlign:'center', fontSize:'11px', color:'#6A6D70' }}>{i+1}</td>
                          <td style={S.td}>
                            <span style={{ marginRight:'6px' }}>{iconMap[ext]||'📄'}</span>
                            <span style={{ fontSize:'12px' }}>{a.name}</span>
                          </td>
                          <td style={{ ...S.td, fontSize:'11px', color:'#6A6D70' }}>{ext}</td>
                          <td style={{ ...S.td, textAlign:'right', fontSize:'11px', color:'#6A6D70' }}>{sizeKB} KB</td>
                          <td style={{ ...S.td, textAlign:'center' }}>
                            <button type="button" onClick={() => removeAttach(i)} style={{ background:'#FFEBEB', border:'1px solid #F5B8B8', color:'#BB0000', borderRadius:'3px', padding:'3px 8px', cursor:'pointer', fontSize:'11px', fontWeight:600 }}>Remove</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
              </div>{/* end S.body */}
            </div>
          )}

          {/* ═══ TAB 8: Notes & Terms ═══ */}
          {activeTab === 'notes' && (
            <div style={S.card}>
              <div style={S.sec}>Notes & Terms</div>
              <div style={S.body}>
              <div style={{ display:'flex', flexDirection:'column', gap:'12px' }}>
                <FTA label="Terms & Conditions" value={notes.termsConditions} onChange={v => setNotes(n=>({...n,termsConditions:v}))}
                  placeholder="1. Goods once sold will not be taken back&#10;2. Payment terms as agreed&#10;3. Disputes subject to Mumbai jurisdiction…"
                  rows={5} />
                <div style={S.g2}>
                  <FTA label="Internal Notes" value={notes.internalNotes} onChange={v => setNotes(n=>({...n,internalNotes:v}))} placeholder="Internal notes (not visible to customer)…" rows={4} />
                  <FTA label="Customer Notes" value={notes.customerNotes} onChange={v => setNotes(n=>({...n,customerNotes:v}))} placeholder="Notes to customer (visible on order document)…" rows={4} />
                </div>
              </div>

              {/* Order Summary */}
              <div style={{ marginTop:'14px', padding:'12px 14px', background:SEC, border:`1px solid ${BD}`, borderLeft:`4px solid ${P}`, borderRadius:'6px' }}>
                <div style={{ fontSize:'11px', fontWeight:700, color:'#1a2d4a', textTransform:'uppercase', marginBottom:'10px', letterSpacing:'0.4px' }}>Order Summary</div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr', gap:'8px' }}>
                  {[
                    ['Order No',    hdr.orderNo],
                    ['Customer',    hdr.customerName],
                    ['Order Date',  hdr.orderDate],
                    ['Order Type',  hdr.orderType],
                    ['Items',       rows.filter(r=>r.itemName).length + ' line(s)'],
                    ['Subtotal',    '₹'+subTotal.toFixed(2)],
                    ['Total GST',   '₹'+totalGST.toFixed(2)],
                    ['Grand Total', '₹'+grandTotal.toFixed(2)],
                  ].map(([k,v]) => (
                    <div key={k} style={{ padding:'8px 10px', background:'#fff', borderRadius:'6px', border:`1px solid ${BD}` }}>
                      <div style={{ fontSize:'10px', fontWeight:700, color:'#64748B', textTransform:'uppercase', letterSpacing:'0.4px', marginBottom:'3px' }}>{k}</div>
                      <div style={{ fontSize:'13px', color:'#1E293B', fontWeight:600 }}>{v||'—'}</div>
                    </div>
                  ))}
                </div>
              </div>
              </div>{/* end S.body */}
            </div>
          )}

        </div>{/* end tab content */}

        {/* ── Footer Navigation ── */}
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 20px', background:'#fff', borderTop:`1px solid ${BD}`, position:'sticky', bottom:0, boxShadow:'0 -4px 16px rgba(16,24,40,0.08)', zIndex:50, gap:8, flexShrink:0 }}>
          {/* Left: Prev + Save Draft */}
          <div style={{ display:'flex', gap:8, alignItems:'center' }}>
            {tabIdx > 0 && (
              <button type="button" onClick={() => setActiveTab(TABS[tabIdx-1].id)}
                style={{ height:36, padding:'0 16px', background:'#fff', border:`1px solid ${BD}`, color:'#4B5563', borderRadius:6, cursor:'pointer', fontSize:13, fontWeight:600, fontFamily:'inherit', display:'flex', alignItems:'center', gap:5, transition:'all 0.15s', boxShadow:'0 1px 2px rgba(16,24,40,0.05)' }}>
                ← Prev
              </button>
            )}
            <button type="button" onClick={() => handleSave('draft')} disabled={saving}
              style={{ height:36, padding:'0 18px', background:'#fff', border:`1px solid ${BD}`, color:'#4B5563', borderRadius:6, cursor:saving?'default':'pointer', fontSize:13, fontWeight:600, fontFamily:'inherit', display:'flex', alignItems:'center', gap:6, opacity:saving?0.6:1, boxShadow:'0 1px 2px rgba(16,24,40,0.05)', transition:'all 0.15s' }}>
              💾 Save Draft
            </button>
          </div>

          {/* Centre: step pill */}
          <div style={{ fontSize:12, color:'#9CA3AF', fontFamily:'inherit', textAlign:'center', whiteSpace:'nowrap', background:'#F5F7FB', border:`1px solid ${BD}`, borderRadius:20, padding:'4px 14px' }}>
            Step <strong style={{ color:'#4B5563' }}>{tabIdx+1}</strong> / {TABS.length} — <span style={{ color:P, fontWeight:600 }}>{TABS[tabIdx]?.label}</span>
          </div>

          {/* Right: action buttons + Next */}
          <div style={{ display:'flex', gap:8, alignItems:'center' }}>
            <button type="button" onClick={() => handleSave('pending')} disabled={saving}
              style={{ height:36, padding:'0 20px', background:'#EEF4FF', border:`1px solid #BFD4FB`, color:P, borderRadius:6, cursor:saving?'default':'pointer', fontSize:13, fontWeight:700, fontFamily:'inherit', display:'flex', alignItems:'center', gap:6, opacity:saving?0.6:1, transition:'all 0.15s' }}>
              ▶ Submit for Approval
            </button>
            <button type="button" onClick={() => handleSave('approved')} disabled={saving}
              style={{ height:36, padding:'0 20px', background:P, border:`1px solid #1A56D6`, color:'#fff', borderRadius:6, cursor:saving?'default':'pointer', fontSize:13, fontWeight:700, fontFamily:'inherit', display:'flex', alignItems:'center', gap:6, opacity:saving?0.6:1, boxShadow:'0 1px 4px rgba(47,111,237,0.35)', transition:'all 0.15s' }}>
              ✓ Save & Approve
            </button>
            {tabIdx < TABS.length-1 ? (
              <button type="button" onClick={() => setActiveTab(TABS[tabIdx+1].id)}
                style={{ height:36, padding:'0 20px', background:TEAL, border:`1px solid #0A8A4F`, color:'#fff', borderRadius:6, cursor:'pointer', fontSize:13, fontWeight:700, fontFamily:'inherit', display:'flex', alignItems:'center', gap:6, boxShadow:'0 1px 4px rgba(18,183,106,0.30)', transition:'all 0.15s' }}>
                Next →
              </button>
            ) : (
              <button type="button" onClick={() => handleSave('confirmed')} disabled={saving}
                style={{ height:36, padding:'0 22px', background:TEAL, border:`1px solid #0A8A4F`, color:'#fff', borderRadius:6, cursor:saving?'default':'pointer', fontSize:13, fontWeight:700, fontFamily:'inherit', display:'flex', alignItems:'center', gap:6, opacity:saving?0.6:1, boxShadow:'0 1px 4px rgba(18,183,106,0.30)', transition:'all 0.15s' }}>
                ✓ Confirm Order
              </button>
            )}
          </div>
        </div>

      </div>{/* end padding wrapper */}
    </div>
  );
};

export default CreateSalesOrder;
