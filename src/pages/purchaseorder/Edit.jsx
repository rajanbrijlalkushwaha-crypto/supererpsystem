import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useCompany } from '../../context/CompanyContext';

/* ═══════════════════════════════════════════════════
   CONSTANTS
═══════════════════════════════════════════════════ */
const UNITS          = ['NOS','Kg','Ltr','Mtr','Box','Pcs','Set','Hr','Sqft','MT','Roll','Pair','Bag'];
const GST_RATES      = [0, 5, 12, 18, 28];
const PURCHASE_PERSONS = ['Rajesh Kumar','Priya Sharma','Amit Singh','Sunita Verma','Mohit Gupta'];

const TABS = [
  { id:'general',  label:'General',     icon:'📋' },
  { id:'items',    label:'Items',       icon:'📦' },
  { id:'pricing',  label:'Pricing',     icon:'💰' },
  { id:'delivery', label:'Delivery',    icon:'🚚' },
  { id:'payment',  label:'Payment',     icon:'💳' },
  { id:'specs',    label:'Specs',       icon:'📐' },
  { id:'attach',   label:'Attachments', icon:'📎' },
  { id:'notes',    label:'Notes',       icon:'📝' },
];

const newItem = () => ({
  _id: Date.now() + Math.random(),
  itemCode:'', itemName:'', description:'', hsnCode:'',
  qty:1, unit:'NOS', rate:'', discount:0, discountType:'%', gstPercent:18, amount:0
});

/* ═══════════════════════════════════════════════════
   STYLE ATOMS
═══════════════════════════════════════════════════ */
const ACC = '#0070F2';
const S = {
  page:  { fontFamily:"'72','Inter',Arial,Helvetica,sans-serif", color:'#32363A', background:'#F5F6F7', minHeight:'100vh' },
  hdr:   { background:'#354A5E', padding:'10px 20px', display:'flex', justifyContent:'space-between', alignItems:'center', position:'sticky', top:0, zIndex:100, borderRadius:'6px 6px 0 0' },
  card:  { background:'#fff', border:'1px solid #E5E5E5', borderRadius:'6px', padding:'14px 16px', marginBottom:'12px', boxShadow:'0 1px 3px rgba(0,0,0,0.05)' },
  sec:   { fontSize:'10px', fontWeight:700, color:'#354A5E', textTransform:'uppercase', letterSpacing:'0.7px', borderBottom:`2px solid ${ACC}`, paddingBottom:'4px', marginBottom:'12px' },
  lbl:   { fontSize:'11px', fontWeight:600, color:'#32363A', marginBottom:'3px', display:'block' },
  req:   { color:'#BB0000', marginLeft:'2px' },
  err:   { fontSize:'10px', color:'#BB0000', marginTop:'2px', fontWeight:600 },
  hint:  { fontSize:'10px', color:'#6A6D70', marginTop:'2px' },
  g2:    { display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px 18px' },
  g3:    { display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'10px 18px' },
  g4:    { display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr', gap:'10px 18px' },
  tbl:   { width:'100%', borderCollapse:'collapse', fontSize:'12px' },
  th:    { background:'#354A5E', color:'#fff', padding:'7px 8px', textAlign:'left', fontWeight:600, fontSize:'11px', whiteSpace:'nowrap', borderRight:'1px solid #4A6075' },
  td:    { padding:'4px 5px', border:'1px solid #E5E5E5', background:'#fff', verticalAlign:'middle' },
  tdAlt: { padding:'4px 5px', border:'1px solid #E5E5E5', background:'#F9FAFB', verticalAlign:'middle' },
};

function inp(err, sm) {
  return { width:'100%', padding: sm ? '5px 7px' : '6px 9px', border:`1px solid ${err?'#BB0000':'#BBBCBD'}`, borderRadius:'4px', fontSize:'12px', fontFamily:'inherit', background:'#FAFAFA', color:'#32363A', outline:'none', boxSizing:'border-box' };
}
function selStyle(sm) {
  return { width:'100%', padding: sm ? '5px 7px' : '6px 9px', border:'1px solid #BBBCBD', borderRadius:'4px', fontSize:'12px', fontFamily:'inherit', background:'#FAFAFA', color:'#32363A', outline:'none', cursor:'pointer', boxSizing:'border-box' };
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
  useEffect(() => { const t = setTimeout(onClose, 4500); return () => clearTimeout(t); }, [onClose]);
  const ok = type === 'success';
  return (
    <div style={{ position:'fixed', top:'20px', right:'24px', zIndex:9999, background: ok?'#E8F5E9':'#FFEBEB', border:`1px solid ${ok?'#82C98A':'#F5B8B8'}`, borderLeft:`4px solid ${ok?'#188918':'#BB0000'}`, borderRadius:'6px', padding:'13px 18px', minWidth:'300px', display:'flex', alignItems:'center', gap:'10px', boxShadow:'0 4px 20px rgba(0,0,0,0.14)' }}>
      <span style={{ fontSize:'17px' }}>{ok ? '✅' : '❌'}</span>
      <span style={{ fontSize:'12px', color: ok?'#0A6640':'#BB0000', fontWeight:600, flex:1 }}>{msg}</span>
      <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:'#6A6D70', fontSize:'17px' }}>×</button>
    </div>
  );
}

function calcRowAmt(it) {
  const base    = (parseFloat(it.qty)||0) * (parseFloat(it.rate)||0);
  const disc    = it.discountType === '%' ? base * (parseFloat(it.discount)||0) / 100 : (parseFloat(it.discount)||0);
  const taxable = base - disc;
  const gst     = taxable * (parseFloat(it.gstPercent)||0) / 100;
  return { base, disc, taxable, gst, total: taxable + gst };
}

/* ═══════════════════════════════════════════════════
   MAIN COMPONENT
═══════════════════════════════════════════════════ */
const EditPurchaseOrder = () => {
  const { orderId }         = useParams();
  const navigate            = useNavigate();
  const { selectedCompany } = useCompany();

  const [activeTab,  setActiveTab]  = useState('general');
  const [loading,    setLoading]    = useState(true);
  const [saving,     setSaving]     = useState(false);
  const [toast,      setToast]      = useState(null);
  const [errs,       setErrs]       = useState({});
  const [vendors,    setVendors]    = useState([]);
  const [salesOrders, setSalesOrders] = useState([]);
  const [showVendorDD, setShowVendorDD] = useState(false);
  const [vendorSearch, setVendorSearch] = useState('');
  const vendorRef = useRef(null);

  // Fetch pending materials from linked SO
  const [fetchModal,     setFetchModal]     = useState(false);
  const [fetchLoading,   setFetchLoading]   = useState(false);
  const [fetchedBalance, setFetchedBalance] = useState(null);
  const [fetchSelected,  setFetchSelected]  = useState({});

  /* ── Header state ── */
  const [hdr, setHdr] = useState({
    poNo:'', poDate: new Date().toISOString().split('T')[0],
    poType:'Standard', purchasePerson:'',
    vendorName:'', vendorCode:'', vendorGstin:'',
    contactPerson:'', mobile:'', email:'', vendorState:'',
  });

  /* ── Tab states ── */
  const [gen, setGen] = useState({
    linkedSalesOrderId:'', vendorRef:'', enquiryRef:'', quotationRef:'',
    deliveryDate:'', incoterms:'',
  });
  const [items, setItems]   = useState([newItem()]);
  const [pricing, setPricing] = useState({ overallDiscount:0, freightCharges:0, packingCharges:0, roundOff:0 });
  const [del, setDel]       = useState({ deliveryAddr:'', shippingAddr:'', dispatchMode:'Road', transporterName:'', vehicleNumber:'', deliveryInstructions:'' });
  const [pay, setPay]       = useState({ paymentTerms:'30 Days', paymentMode:'NEFT', billingTerms:'', creditLimit:'', dueDate:'' });
  const [specs, setSpecs]   = useState({ productSpecs:'', technicalDetails:'', drawingNumber:'', version:'', customFields:[] });
  const [existingAttach, setExistingAttach] = useState([]);
  const [newAttachments, setNewAttachments] = useState([]);
  const [notes, setNotes]   = useState({ termsConditions:'', internalNotes:'', vendorNotes:'' });

  /* ── Load order + vendors + SOs ── */
  useEffect(() => {
    const cid = selectedCompany?.companyId;
    if (cid) {
      axios.get('/api/vendors', { params:{ companyId: cid } })
        .then(r => setVendors((r.data || []).filter(v => v.status === 'approved')))
        .catch(() => {});
      axios.get('/api/sales-orders', { params:{ companyId: cid } })
        .then(r => setSalesOrders(r.data || []))
        .catch(() => {});
    }
    fetchOrder();
  }, [orderId, selectedCompany]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchOrder = async () => {
    try {
      setLoading(true);
      const res = await axios.get(`/api/purchase-orders/${orderId}`);
      const o   = res.data;

      setHdr({
        poNo:           o.poNo || o.voucherNumber || String(o.orderId || orderId),
        poDate:         o.poDate || o.orderDate || o.date || new Date().toISOString().split('T')[0],
        poType:         o.poType || 'Standard',
        purchasePerson: o.purchasePerson || '',
        vendorName:     o.vendorName || o.party || '',
        vendorCode:     String(o.vendorCode || o.vendorId || ''),
        vendorGstin:    o.vendorGstin || o.partyGstin || '',
        vendorState:    o.vendorState || o.stateName || '',
        contactPerson:  o.contactPerson || '',
        mobile:         o.mobile || '',
        email:          o.email || '',
      });

      setGen({
        linkedSalesOrderId: o.linkedSalesOrderId || '',
        vendorRef:          o.vendorRef || o.reference || '',
        enquiryRef:         o.enquiryRef || '',
        quotationRef:       o.quotationRef || o.orderRef || '',
        deliveryDate:       o.deliveryDate || '',
        incoterms:          o.incoterms || '',
      });

      const mapped = (o.items || []).map(it => ({
        ...newItem(),
        itemCode:    it.itemCode || '',
        itemName:    it.itemName || it.description || '',
        description: it.description || '',
        hsnCode:     it.hsnCode || '',
        qty:         parseFloat(it.qty || it.quantity) || 1,
        unit:        it.unit || 'NOS',
        rate:        it.rate || '',
        discount:    it.discount || 0,
        discountType: it.discountType || '%',
        gstPercent:  it.gstPercent || 18,
      }));
      setItems(mapped.length ? mapped : [newItem()]);

      setPricing({
        overallDiscount: o.overallDiscount || 0,
        freightCharges:  o.freightCharges  || 0,
        packingCharges:  o.packingCharges  || 0,
        roundOff:        o.roundOff        || 0,
      });

      setDel({
        deliveryAddr:         o.deliveryAddr || o.deliveryAddress || o.vendorAddress || '',
        shippingAddr:         o.shippingAddr || o.destination || '',
        dispatchMode:         o.dispatchMode || o.dispatchedThrough || 'Road',
        transporterName:      o.transporterName || '',
        vehicleNumber:        o.vehicleNumber || '',
        deliveryInstructions: o.deliveryInstructions || '',
      });

      setPay({
        paymentTerms: o.paymentTerms || '30 Days',
        paymentMode:  o.paymentMode  || 'NEFT',
        billingTerms: o.billingTerms || o.termsOfDelivery || '',
        creditLimit:  String(o.creditLimit || ''),
        dueDate:      o.dueDate || '',
      });

      setSpecs({
        productSpecs:     o.productSpecs     || '',
        technicalDetails: o.technicalDetails || '',
        drawingNumber:    o.drawingNumber    || '',
        version:          o.version          || '',
        customFields:     Array.isArray(o.customFields) ? o.customFields : [],
      });

      const saved = (o.attachments || o.documents || []).filter(a => a.fileName || a.filePath);
      setExistingAttach(saved.map(a => ({ ...a, removed: false, replaced: false, newFile: null })));

      setNotes({
        termsConditions: o.termsConditions || o.termsOfDelivery || '',
        internalNotes:   o.internalNotes   || o.notes           || o.narration || '',
        vendorNotes:     o.vendorNotes      || '',
      });
    } catch (err) {
      setToast({ type:'error', msg:'Failed to load order: ' + err.message });
    } finally {
      setLoading(false);
    }
  };

  /* ── Auto-calc payment due date ── */
  useEffect(() => {
    if (!hdr.poDate || !pay.paymentTerms) return;
    const days = parseInt(pay.paymentTerms) || 0;
    const d = new Date(hdr.poDate);
    d.setDate(d.getDate() + days);
    setPay(p => ({ ...p, dueDate: days > 0 ? d.toISOString().split('T')[0] : p.dueDate }));
  }, [hdr.poDate, pay.paymentTerms]);

  /* ── Close vendor dropdown on outside click ── */
  useEffect(() => {
    const fn = e => { if (vendorRef.current && !vendorRef.current.contains(e.target)) setShowVendorDD(false); };
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, []);

  const setH = (k, v) => setHdr(h => ({ ...h, [k]: v }));

  /* ── Select vendor ── */
  const selectVendor = useCallback((v) => {
    const cp0 = (v.contactPersons || [])[0] || {};
    setHdr(h => ({
      ...h,
      vendorName:    v.vendorName || '',
      vendorCode:    String(v.vendorId || ''),
      vendorGstin:   v.gstin || v.gstNumber || '',
      vendorState:   v.state || '',
      contactPerson: cp0.name || '',
      mobile:        cp0.mobileNumber || '',
      email:         cp0.email || '',
    }));
    setDel(d => ({ ...d, deliveryAddr: [v.address, v.city, v.state, v.pincode].filter(Boolean).join(', ') }));
    setPay(p => ({ ...p, paymentTerms: v.paymentTerms || p.paymentTerms, creditLimit: String(v.creditLimit || '') }));
    setShowVendorDD(false);
    setVendorSearch('');
  }, []);

  /* ── Link to SO ── */
  const handleSOLink = useCallback((soId) => {
    setGen(g => ({ ...g, linkedSalesOrderId: soId }));
    if (!soId) return;
    const so = salesOrders.find(s => String(s.orderId) === String(soId));
    if (!so || !window.confirm(`Replace current items with items from SO #${soId}?`)) return;
    const soItems = (so.items || []).map(it => ({
      ...newItem(),
      itemCode: it.itemCode || '', itemName: it.itemName || '',
      description: it.description || '', hsnCode: it.hsnCode || '',
      qty: parseFloat(it.qty || it.quantity) || 1, unit: it.unit || 'NOS',
      rate: it.rate || '', discount: it.discount || 0,
      discountType: it.discountType || '%', gstPercent: it.gstPercent || 18,
    }));
    if (soItems.length) setItems(soItems);
  }, [salesOrders]);

  /* ── Fetch pending materials from linked SO ── */
  const openFetchModal = async () => {
    const soId = gen.linkedSalesOrderId;
    if (!soId) return;
    setFetchLoading(true);
    setFetchModal(true);
    setFetchedBalance(null);
    setFetchSelected({});
    try {
      const res = await axios.get(`/api/sales-orders/${soId}/material-balance`);
      setFetchedBalance(res.data);
      const sel = {};
      (res.data.items || []).forEach(it => { if (it.balanceQty > 0) sel[it.itemName] = it.balanceQty; });
      setFetchSelected(sel);
    } catch (err) {
      alert('Error fetching materials: ' + (err.response?.data?.error || err.message));
      setFetchModal(false);
    } finally {
      setFetchLoading(false);
    }
  };

  const applyFetchedItems = () => {
    if (!fetchedBalance) return;
    const toAdd = fetchedBalance.items
      .filter(it => fetchSelected[it.itemName] > 0)
      .map(it => ({
        ...newItem(),
        itemName:    it.itemName,
        qty:         parseFloat(fetchSelected[it.itemName]) || 0,
        unit:        it.unit || 'NOS',
        description: `From SO #${gen.linkedSalesOrderId} — ${it.itemType || 'Purchase'}`,
      }));
    if (toAdd.length > 0) {
      setItems(prev => {
        const cleaned = prev.filter(it => it.itemName.trim() || prev.length > 1);
        return [...(cleaned.length ? cleaned : []), ...toAdd];
      });
    }
    setFetchModal(false);
    setActiveTab('items');
  };

  /* ── Item helpers ── */
  const updateItem = (id, k, v) => setItems(p => p.map(it => it._id === id ? { ...it, [k]: v } : it));
  const removeItem = (id)       => setItems(p => p.filter(it => it._id !== id));
  const addItem    = ()          => setItems(p => [...p, newItem()]);

  /* ── Totals ── */
  const itemTotals = items.reduce((acc, it) => {
    const r = calcRowAmt(it);
    return { subTotal: acc.subTotal + r.taxable, totalGst: acc.totalGst + r.gst, grandTotal: acc.grandTotal + r.total };
  }, { subTotal:0, totalGst:0, grandTotal:0 });

  const od = parseFloat(pricing.overallDiscount)||0;
  const fc = parseFloat(pricing.freightCharges)||0;
  const pc = parseFloat(pricing.packingCharges)||0;
  const ro = parseFloat(pricing.roundOff)||0;
  const odAmt      = itemTotals.subTotal * od / 100;
  const finalTotal = itemTotals.grandTotal - odAmt + fc + pc + ro;

  const isIntra = hdr.vendorState && selectedCompany?.state && hdr.vendorState === selectedCompany.state;
  const gstRows = items.map(it => {
    const r = calcRowAmt(it);
    return { ...it, taxable: r.taxable, gstAmt: r.gst, cgst: isIntra ? r.gst/2 : 0, sgst: isIntra ? r.gst/2 : 0, igst: isIntra ? 0 : r.gst };
  }).filter(it => it.gstAmt > 0);

  /* ── File handling ── */
  const onDropNew = (e) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer?.files || e.target.files || []);
    setNewAttachments(p => [...p, ...files.map(f => ({ file:f, name:f.name, size:f.size, type:f.type }))]);
  };

  /* ── Validate ── */
  const validate = () => {
    const e = {};
    if (!hdr.vendorName.trim()) e.vendorName = 'Vendor is required';
    if (!items[0]?.itemName?.trim()) e.items = 'At least one item required';
    return e;
  };

  /* ── Submit ── */
  const handleSubmit = async (status) => {
    const e = validate();
    if (Object.keys(e).length) {
      setErrs(e);
      if (e.vendorName) setActiveTab('general');
      else if (e.items)  setActiveTab('items');
      setToast({ type:'error', msg:'Please fix the errors before saving.' });
      return;
    }
    setErrs({});
    setSaving(true);

    try {
      const fd = new FormData();
      fd.append('poNo',           hdr.poNo);
      fd.append('poDate',         hdr.poDate);
      fd.append('poType',         hdr.poType);
      fd.append('purchasePerson', hdr.purchasePerson);
      fd.append('vendorName',     hdr.vendorName);
      fd.append('vendorCode',     hdr.vendorCode);
      fd.append('vendorGstin',    hdr.vendorGstin);
      fd.append('vendorState',    hdr.vendorState);
      fd.append('contactPerson',  hdr.contactPerson);
      fd.append('mobile',         hdr.mobile);
      fd.append('email',          hdr.email);

      fd.append('linkedSalesOrderId', gen.linkedSalesOrderId);
      fd.append('vendorRef',          gen.vendorRef);
      fd.append('enquiryRef',         gen.enquiryRef);
      fd.append('quotationRef',       gen.quotationRef);
      fd.append('deliveryDate',       gen.deliveryDate);
      fd.append('incoterms',          gen.incoterms);

      fd.append('items', JSON.stringify(items.map(it => {
        const r = calcRowAmt(it);
        return { ...it, amount: r.total, taxableAmount: r.taxable, gstAmount: r.gst };
      })));

      fd.append('overallDiscount', pricing.overallDiscount);
      fd.append('freightCharges',  pricing.freightCharges);
      fd.append('packingCharges',  pricing.packingCharges);
      fd.append('roundOff',        pricing.roundOff);
      fd.append('subTotal',        itemTotals.subTotal.toFixed(2));
      fd.append('totalGst',        itemTotals.totalGst.toFixed(2));
      fd.append('grandTotal',      finalTotal.toFixed(2));

      fd.append('deliveryAddr',    del.deliveryAddr);
      fd.append('shippingAddr',    del.shippingAddr);
      fd.append('dispatchMode',    del.dispatchMode);
      fd.append('transporterName', del.transporterName);
      fd.append('vehicleNumber',   del.vehicleNumber);
      fd.append('deliveryInstructions', del.deliveryInstructions);

      fd.append('paymentTerms', pay.paymentTerms);
      fd.append('paymentMode',  pay.paymentMode);
      fd.append('creditLimit',  pay.creditLimit);
      fd.append('billingTerms', pay.billingTerms);
      fd.append('dueDate',      pay.dueDate);

      fd.append('productSpecs',     specs.productSpecs);
      fd.append('technicalDetails', specs.technicalDetails);
      fd.append('drawingNumber',    specs.drawingNumber);
      fd.append('version',          specs.version);
      fd.append('customFields',     JSON.stringify(specs.customFields));

      // keep existing attachments that are not removed
      const keepAttach = existingAttach.filter(a => !a.removed).map(a => ({ name: a.name, fileName: a.fileName, filePath: a.filePath }));
      fd.append('attachments', JSON.stringify(keepAttach));
      // new files
      newAttachments.forEach(a => { if (a.file) fd.append('attachmentFiles', a.file); });

      fd.append('termsConditions', notes.termsConditions);
      fd.append('internalNotes',   notes.internalNotes);
      fd.append('vendorNotes',     notes.vendorNotes);
      fd.append('status',          status);

      await axios.put(`/api/purchase-orders/${orderId}`, fd, { headers:{ 'Content-Type':'multipart/form-data' } });

      const dest = status === 'pending' ? '/purchase-order/pending' : '/purchase-order/view';
      const msg  = status === 'pending' ? `PO ${hdr.poNo} sent for approval!` : `PO ${hdr.poNo} saved as draft.`;
      setToast({ type:'success', msg });
      setTimeout(() => navigate(dest), 2000);
    } catch (err) {
      setToast({ type:'error', msg: 'Error: ' + (err.response?.data?.error || err.message) });
    } finally {
      setSaving(false);
    }
  };

  /* ── Helpers ── */
  const fmt = n => '₹' + Number(n||0).toLocaleString('en-IN', { minimumFractionDigits:2, maximumFractionDigits:2 });
  const tabIdx = TABS.findIndex(t => t.id === activeTab);
  const filteredVendors = vendors.filter(v =>
    v.vendorName?.toLowerCase().includes(vendorSearch.toLowerCase()) ||
    String(v.vendorId).includes(vendorSearch)
  );

  /* ═══════════════════════════════════════════════════
     LOADING
  ═══════════════════════════════════════════════════ */
  if (loading) {
    return (
      <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'300px', flexDirection:'column', gap:'12px', fontFamily:'inherit' }}>
        <div style={{ width:'36px', height:'36px', border:'3px solid #E5E5E5', borderTopColor:ACC, borderRadius:'50%', animation:'spin 0.8s linear infinite' }} />
        <div style={{ fontSize:'13px', color:'#6A6D70' }}>Loading purchase order…</div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  /* ═══════════════════════════════════════════════════
     RENDER
  ═══════════════════════════════════════════════════ */
  return (
    <div style={S.page}>

      {/* ══ Fetch Pending Materials Modal ══ */}
      {fetchModal && (
        <div onClick={e=>{if(e.target===e.currentTarget)setFetchModal(false)}} style={{ position:'fixed',inset:0,background:'rgba(0,0,0,0.6)',zIndex:9999,display:'flex',alignItems:'center',justifyContent:'center',padding:20 }}>
          <div style={{ background:'#fff',borderRadius:10,width:'100%',maxWidth:800,maxHeight:'85vh',display:'flex',flexDirection:'column',boxShadow:'0 16px 60px rgba(0,0,0,0.3)' }}>
            <div style={{ background:'#354A5E',color:'#fff',padding:'12px 18px',borderRadius:'10px 10px 0 0',display:'flex',justifyContent:'space-between',alignItems:'center',flexShrink:0 }}>
              <div>
                <div style={{ fontSize:10,color:'#A8C4E0',letterSpacing:'0.8px',textTransform:'uppercase' }}>Material Planning — Balance Qty</div>
                <div style={{ fontSize:15,fontWeight:700,marginTop:2 }}>
                  Fetch Pending Materials from SO #{gen.linkedSalesOrderId}
                  {fetchedBalance && <span style={{ fontSize:12,fontWeight:400,marginLeft:8,opacity:0.8 }}>| {fetchedBalance.customerName}</span>}
                </div>
              </div>
              <button onClick={()=>setFetchModal(false)} style={{ background:'rgba(255,255,255,0.15)',border:'none',color:'#fff',width:32,height:32,borderRadius:'50%',cursor:'pointer',fontSize:18,display:'flex',alignItems:'center',justifyContent:'center' }}>×</button>
            </div>
            <div style={{ flex:1,overflowY:'auto',padding:'16px 18px' }}>
              {fetchLoading ? (
                <div style={{ textAlign:'center',padding:'40px 0',color:'#6A6D70',fontSize:14 }}>⏳ Loading material balance…</div>
              ) : !fetchedBalance || fetchedBalance.items.length===0 ? (
                <div style={{ textAlign:'center',padding:'40px 0',color:'#94A3B8',fontSize:14 }}>
                  <div style={{ fontSize:36,marginBottom:8 }}>📦</div>
                  No material planning items found in this Sales Order.<br/>
                  <span style={{ fontSize:12 }}>Go to SO → Material Plan tab to define items first.</span>
                </div>
              ) : (
                <>
                  <div style={{ fontSize:12,color:'#354A5E',fontWeight:600,marginBottom:10 }}>Select items and adjust quantities to add to this PO.</div>
                  <table style={{ width:'100%',borderCollapse:'collapse',fontSize:12 }}>
                    <thead>
                      <tr>
                        <th style={{ ...S.th,width:36,textAlign:'center' }}>✓</th>
                        <th style={S.th}>Item Name</th>
                        <th style={{ ...S.th,width:90,textAlign:'center' }}>Type</th>
                        <th style={{ ...S.th,width:70,textAlign:'center' }}>Unit</th>
                        <th style={{ ...S.th,width:80,textAlign:'right' }}>Required</th>
                        <th style={{ ...S.th,width:80,textAlign:'right' }}>Purchased</th>
                        <th style={{ ...S.th,width:80,textAlign:'right' }}>Balance</th>
                        <th style={{ ...S.th,width:90,textAlign:'center' }}>Qty to PO</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fetchedBalance.items.map((it,i)=>{
                        const isSelected = (fetchSelected[it.itemName]||0) > 0;
                        const isFullyPurchased = it.balanceQty <= 0;
                        const isOverPurchased = it.overPurchased;
                        const bg = isFullyPurchased ? '#F9FAFB' : i%2===0 ? '#fff' : '#F9FAFB';
                        return (
                          <tr key={i} style={{ background:bg,opacity:isFullyPurchased?0.55:1 }}>
                            <td style={{ ...S.td,textAlign:'center' }}>
                              <input type="checkbox" checked={isSelected} disabled={isFullyPurchased}
                                onChange={e=>setFetchSelected(p=>({ ...p,[it.itemName]:e.target.checked?it.balanceQty:0 }))}
                                style={{ width:14,height:14 }} />
                            </td>
                            <td style={S.td}>
                              <div style={{ fontWeight:600 }}>{it.itemName}</div>
                              {it.unitGroup && <div style={{ fontSize:10,color:'#6A6D70' }}>📍 {it.unitGroup}</div>}
                            </td>
                            <td style={{ ...S.td,textAlign:'center' }}>
                              <span style={{ fontSize:10,padding:'2px 7px',borderRadius:4,background:it.itemType==='Manufactured'?'#DCFCE7':'#EFF6FF',color:it.itemType==='Manufactured'?'#15803D':'#1D4ED8',fontWeight:600 }}>
                                {it.itemType||'Purchase'}
                              </span>
                            </td>
                            <td style={{ ...S.td,textAlign:'center' }}>{it.unit||'NOS'}</td>
                            <td style={{ ...S.td,textAlign:'right',fontWeight:600 }}>{it.requiredQty}</td>
                            <td style={{ ...S.td,textAlign:'right',color:'#0070F2',fontWeight:600 }}>{it.purchasedQty}</td>
                            <td style={{ ...S.td,textAlign:'right' }}>
                              <span style={{ fontWeight:700,color:isFullyPurchased?'#188918':isOverPurchased?'#BB0000':'#E9730C' }}>
                                {isFullyPurchased ? '✓ Done' : isOverPurchased ? `⚠ -${Math.abs(it.balanceQty)}` : it.balanceQty}
                              </span>
                            </td>
                            <td style={{ ...S.td,textAlign:'center' }}>
                              <input type="number" min="0" max={it.requiredQty}
                                value={fetchSelected[it.itemName]||0}
                                disabled={!isSelected||isFullyPurchased}
                                onChange={e=>{
                                  const v=parseFloat(e.target.value)||0;
                                  if(v>it.requiredQty) alert(`Warning: ${it.itemName} required qty is ${it.requiredQty}.`);
                                  setFetchSelected(p=>({...p,[it.itemName]:v}));
                                }}
                                style={{ width:70,padding:'4px 6px',border:'1px solid #BBBCBD',borderRadius:4,fontSize:12,textAlign:'right',fontFamily:'inherit' }}
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </>
              )}
            </div>
            {fetchedBalance && fetchedBalance.items.length > 0 && (
              <div style={{ borderTop:'1px solid #E5E5E5',padding:'10px 18px',display:'flex',justifyContent:'space-between',alignItems:'center',background:'#F8FAFC',flexShrink:0,borderRadius:'0 0 10px 10px' }}>
                <div style={{ fontSize:12,color:'#6A6D70' }}>{Object.values(fetchSelected).filter(v=>v>0).length} item(s) selected</div>
                <div style={{ display:'flex',gap:8 }}>
                  <button onClick={()=>setFetchModal(false)} style={{ padding:'8px 18px',border:'1px solid #D9D9D9',borderRadius:4,background:'#fff',cursor:'pointer',fontSize:12,fontFamily:'inherit' }}>Cancel</button>
                  <button onClick={applyFetchedItems} style={{ padding:'8px 22px',background:'#0070F2',border:'none',color:'#fff',borderRadius:4,cursor:'pointer',fontSize:12,fontWeight:700,fontFamily:'inherit' }}>✓ Add Selected to PO Items</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {toast && <Toast type={toast.type} msg={toast.msg} onClose={() => setToast(null)} />}

      {/* ── Sticky Header ── */}
      <div style={S.hdr}>
        <div>
          <div style={{ fontSize:'10px', color:'#A8C4E0', letterSpacing:'0.8px', marginBottom:'2px', textTransform:'uppercase' }}>PURCHASE ORDER MANAGEMENT — ME22N</div>
          <div style={{ fontSize:'15px', fontWeight:700, color:'#fff', display:'flex', alignItems:'center', gap:'10px' }}>
            Edit Purchase Order
            {hdr.poNo && <span style={{ fontFamily:'monospace', fontSize:'13px', color:'#FFCC80' }}>#{hdr.poNo}</span>}
          </div>
        </div>
        <div style={{ display:'flex', gap:'8px', alignItems:'center' }}>
          <button onClick={() => navigate('/purchase-order/view')} style={{ background:'transparent', border:'1px solid rgba(255,255,255,0.3)', color:'#fff', padding:'7px 16px', borderRadius:'4px', cursor:'pointer', fontSize:'12px', fontWeight:600, fontFamily:'inherit' }}>✕ Cancel</button>
          <button onClick={() => handleSubmit('draft')} disabled={saving} style={{ background:'#6A6D70', border:'none', color:'#fff', padding:'7px 18px', borderRadius:'4px', cursor:'pointer', fontSize:'12px', fontWeight:600, fontFamily:'inherit' }}>
            {saving ? '...' : '💾 Save as Draft'}
          </button>
          <button onClick={() => handleSubmit('pending')} disabled={saving} style={{ background:ACC, border:'none', color:'#fff', padding:'7px 20px', borderRadius:'4px', cursor:'pointer', fontSize:'12px', fontWeight:700, fontFamily:'inherit' }}>
            {saving ? 'Submitting…' : '📤 Send for Approval'}
          </button>
        </div>
      </div>

      {/* ── Order Header Card ── */}
      <div style={{ background:'#fff', borderLeft:'1px solid #E5E5E5', borderRight:'1px solid #E5E5E5', borderBottom:'1px solid #E5E5E5', padding:'14px 16px' }}>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'10px 18px', marginBottom:'12px' }}>
          <FIn label="PO Number" value={hdr.poNo} readOnly hint="System-assigned" />
          <FIn label="PO Date" type="date" value={hdr.poDate} onChange={v => setH('poDate',v)} />
          <FSel label="PO Type" value={hdr.poType} onChange={v => setH('poType',v)}
            options={['Standard','Blanket','Contract','Subcontract','Emergency']} />
          <FSel label="Purchase Person" value={hdr.purchasePerson} onChange={v => setH('purchasePerson',v)}
            options={PURCHASE_PERSONS} />
        </div>

        {/* Vendor Search */}
        <div style={{ background:'#F0F9FF', border:`1px solid ${ACC}30`, borderRadius:'6px', padding:'12px 14px' }}>
          <div style={{ fontSize:'10px', fontWeight:700, color:ACC, textTransform:'uppercase', letterSpacing:'0.6px', marginBottom:'10px' }}>Vendor Information</div>
          <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr 1fr 1fr 1fr 1fr', gap:'10px 14px' }}>
            <div ref={vendorRef} style={{ position:'relative' }}>
              <label style={S.lbl}>Vendor Name <span style={S.req}>*</span></label>
              <input value={vendorSearch || hdr.vendorName}
                onChange={e => { setVendorSearch(e.target.value); setShowVendorDD(true); if (!e.target.value) setHdr(h => ({...h, vendorName:'', vendorCode:'', vendorGstin:'', vendorState:'', contactPerson:'', mobile:'', email:''})); }}
                onFocus={() => setShowVendorDD(true)}
                placeholder="Search vendor…"
                style={{ ...inp(errs.vendorName), paddingRight:'28px' }}
              />
              {errs.vendorName && <div style={S.err}>{errs.vendorName}</div>}
              {showVendorDD && filteredVendors.length > 0 && (
                <div style={{ position:'absolute', top:'100%', left:0, right:0, background:'#fff', border:'1px solid #D9D9D9', borderRadius:'4px', boxShadow:'0 6px 20px rgba(0,0,0,0.12)', zIndex:200, maxHeight:'200px', overflowY:'auto' }}>
                  {filteredVendors.map(v => (
                    <div key={v.vendorId} onClick={() => selectVendor(v)}
                      style={{ padding:'8px 12px', cursor:'pointer', borderBottom:'1px solid #F3F4F6', fontSize:'12px' }}
                      onMouseEnter={e => e.currentTarget.style.background='#EEF6FF'}
                      onMouseLeave={e => e.currentTarget.style.background='#fff'}>
                      <div style={{ fontWeight:600 }}>{v.vendorName}</div>
                      <div style={{ fontSize:'10px', color:'#6A6D70', fontFamily:'monospace' }}>{v.vendorId} · {v.gstin || '—'} · {v.state || ''}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <FIn label="Vendor Code" value={hdr.vendorCode} readOnly />
            <FIn label="GSTIN" value={hdr.vendorGstin} readOnly />
            <FIn label="Contact Person" value={hdr.contactPerson} onChange={v => setH('contactPerson',v)} />
            <FIn label="Mobile" value={hdr.mobile} onChange={v => setH('mobile',v)} />
            <FIn label="Email" value={hdr.email} onChange={v => setH('email',v)} />
          </div>
        </div>
      </div>

      {/* ── Tab Bar ── */}
      <div style={{ background:'#fff', borderLeft:'1px solid #E5E5E5', borderRight:'1px solid #E5E5E5', display:'flex', overflowX:'auto', borderBottom:'2px solid #E5E5E5' }}>
        {TABS.map(t => {
          const active = activeTab === t.id;
          return (
            <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
              display:'flex', alignItems:'center', gap:'6px', padding:'9px 16px',
              cursor:'pointer', background: active?'#fff':'#F5F6F7',
              border:'none', borderBottom: active?`3px solid ${ACC}`:'3px solid transparent',
              borderRight:'1px solid #E5E5E5',
              color: active?ACC:'#6A6D70',
              fontSize:'12px', fontWeight: active?700:400, fontFamily:'inherit',
              whiteSpace:'nowrap', marginBottom:'-2px',
            }}>
              <span style={{ fontSize:'13px' }}>{t.icon}</span>
              {t.label}
            </button>
          );
        })}
      </div>

      {/* ── Tab Content ── */}
      <div style={{ background:'#F5F6F7', border:'1px solid #E5E5E5', borderTop:'none', borderRadius:'0 0 6px 6px', padding:'16px', minHeight:'400px' }}>

        {/* TAB 1: General */}
        {activeTab === 'general' && (
          <div style={S.card}>
            <div style={S.sec}>General Details</div>
            <div style={S.g3}>
              <div>
                <label style={S.lbl}>Link to Sales Order</label>
                <select value={gen.linkedSalesOrderId} onChange={e => handleSOLink(e.target.value)} style={selStyle()}>
                  <option value="">— None (standalone PO) —</option>
                  {salesOrders.map(so => (
                    <option key={so.orderId} value={so.orderId}>
                      {so.orderNo || so.voucherNumber || so.orderId} — {so.customerName || so.party || ''}
                    </option>
                  ))}
                </select>
                {gen.linkedSalesOrderId && (
                  <div style={{ display:'flex', gap:8, marginTop:5, alignItems:'center' }}>
                    <div style={{ fontSize:'10px', color:'#0A6640', fontWeight:600 }}>✓ Linked to SO #{gen.linkedSalesOrderId}</div>
                    <button type="button" onClick={openFetchModal}
                      style={{ padding:'3px 12px', background:'#188918', border:'none', color:'#fff', borderRadius:4, cursor:'pointer', fontSize:11, fontWeight:700, fontFamily:'inherit' }}>
                      📦 Fetch Pending Materials
                    </button>
                  </div>
                )}
              </div>
              <FIn label="Vendor Reference No." value={gen.vendorRef} onChange={v => setGen(g => ({...g, vendorRef:v}))} placeholder="Vendor's internal ref" />
              <FIn label="Enquiry Reference" value={gen.enquiryRef} onChange={v => setGen(g => ({...g, enquiryRef:v}))} placeholder="Enquiry ref no." />
              <FIn label="Quotation Reference" value={gen.quotationRef} onChange={v => setGen(g => ({...g, quotationRef:v}))} placeholder="Quotation ref no." />
              <FIn label="Delivery Date" type="date" value={gen.deliveryDate} onChange={v => setGen(g => ({...g, deliveryDate:v}))} />
              <FSel label="Incoterms" value={gen.incoterms} onChange={v => setGen(g => ({...g, incoterms:v}))}
                options={['EXW','FCA','CPT','CIP','DAP','DPU','DDP','FAS','FOB','CFR','CIF','FOR']} />
            </div>
          </div>
        )}

        {/* TAB 2: Items */}
        {activeTab === 'items' && (
          <div style={S.card}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'10px' }}>
              <div style={S.sec}>Purchase Items</div>
              <button onClick={addItem} style={{ background:ACC, color:'#fff', border:'none', borderRadius:'4px', padding:'6px 14px', fontSize:'12px', cursor:'pointer', fontWeight:700, fontFamily:'inherit' }}>+ Add Item</button>
            </div>
            {errs.items && <div style={{ ...S.err, marginBottom:'8px' }}>{errs.items}</div>}
            <div style={{ overflowX:'auto' }}>
              <table style={S.tbl}>
                <thead>
                  <tr>
                    {['#','Item Code','Item Name','Description','HSN','Qty','Unit','Rate (₹)','Disc','Type','GST %','Amount (₹)',''].map((h,i) => (
                      <th key={i} style={S.th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, idx) => {
                    const r = calcRowAmt(it);
                    const td = idx%2===0 ? S.td : S.tdAlt;
                    return (
                      <tr key={it._id}>
                        <td style={{ ...td, textAlign:'center', fontWeight:700, color:'#6A6D70', minWidth:'28px' }}>{idx+1}</td>
                        <td style={{ ...td, minWidth:'90px' }}><input value={it.itemCode} onChange={e => updateItem(it._id,'itemCode',e.target.value)} style={inp(false,true)} placeholder="Code" /></td>
                        <td style={{ ...td, minWidth:'140px' }}><input value={it.itemName} onChange={e => updateItem(it._id,'itemName',e.target.value)} style={inp(false,true)} placeholder="Item name" /></td>
                        <td style={{ ...td, minWidth:'120px' }}><input value={it.description} onChange={e => updateItem(it._id,'description',e.target.value)} style={inp(false,true)} placeholder="Description" /></td>
                        <td style={{ ...td, minWidth:'70px' }}><input value={it.hsnCode} onChange={e => updateItem(it._id,'hsnCode',e.target.value)} style={inp(false,true)} placeholder="HSN" /></td>
                        <td style={{ ...td, minWidth:'60px' }}><input type="number" value={it.qty} min="0" onChange={e => updateItem(it._id,'qty',e.target.value)} style={{ ...inp(false,true), textAlign:'right' }} /></td>
                        <td style={{ ...td, minWidth:'65px' }}>
                          <select value={it.unit} onChange={e => updateItem(it._id,'unit',e.target.value)} style={selStyle(true)}>
                            {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                          </select>
                        </td>
                        <td style={{ ...td, minWidth:'80px' }}><input type="number" value={it.rate} min="0" onChange={e => updateItem(it._id,'rate',e.target.value)} style={{ ...inp(false,true), textAlign:'right' }} placeholder="0.00" /></td>
                        <td style={{ ...td, minWidth:'60px' }}><input type="number" value={it.discount} min="0" onChange={e => updateItem(it._id,'discount',e.target.value)} style={{ ...inp(false,true), textAlign:'right' }} /></td>
                        <td style={{ ...td, minWidth:'50px' }}>
                          <select value={it.discountType} onChange={e => updateItem(it._id,'discountType',e.target.value)} style={selStyle(true)}>
                            <option value="%">%</option><option value="₹">₹</option>
                          </select>
                        </td>
                        <td style={{ ...td, minWidth:'60px' }}>
                          <select value={it.gstPercent} onChange={e => updateItem(it._id,'gstPercent',Number(e.target.value))} style={selStyle(true)}>
                            {GST_RATES.map(r => <option key={r} value={r}>{r}%</option>)}
                          </select>
                        </td>
                        <td style={{ ...td, textAlign:'right', fontWeight:700, minWidth:'90px', color:ACC }}>{fmt(r.total)}</td>
                        <td style={{ ...td, textAlign:'center', minWidth:'30px' }}>
                          <button onClick={() => removeItem(it._id)} style={{ background:'#FFEBEB', border:'none', borderRadius:'3px', color:'#BB0000', cursor:'pointer', padding:'3px 7px', fontSize:'12px', fontWeight:700 }}>✕</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div style={{ marginTop:'12px', display:'flex', justifyContent:'flex-end', gap:'24px', padding:'10px 14px', background:'#F0F9FF', borderRadius:'6px', border:`1px solid ${ACC}20` }}>
              <div style={{ fontSize:'12px', color:'#6A6D70' }}>Taxable: <strong style={{ color:'#32363A' }}>{fmt(itemTotals.subTotal)}</strong></div>
              <div style={{ fontSize:'12px', color:'#6A6D70' }}>GST: <strong style={{ color:'#32363A' }}>{fmt(itemTotals.totalGst)}</strong></div>
              <div style={{ fontSize:'13px', fontWeight:700, color:ACC }}>Total: {fmt(itemTotals.grandTotal)}</div>
            </div>
          </div>
        )}

        {/* TAB 3: Pricing */}
        {activeTab === 'pricing' && (
          <>
            <div style={S.card}>
              <div style={S.sec}>Pricing Adjustments</div>
              <div style={S.g4}>
                <F label="Overall Discount (%)"><input type="number" value={pricing.overallDiscount} min="0" max="100" onChange={e => setPricing(p => ({...p, overallDiscount:e.target.value}))} style={{ ...inp(false), textAlign:'right' }} /></F>
                <F label="Freight Charges (₹)"><input type="number" value={pricing.freightCharges} min="0" onChange={e => setPricing(p => ({...p, freightCharges:e.target.value}))} style={{ ...inp(false), textAlign:'right' }} /></F>
                <F label="Packing Charges (₹)"><input type="number" value={pricing.packingCharges} min="0" onChange={e => setPricing(p => ({...p, packingCharges:e.target.value}))} style={{ ...inp(false), textAlign:'right' }} /></F>
                <F label="Round Off (₹)"><input type="number" value={pricing.roundOff} onChange={e => setPricing(p => ({...p, roundOff:e.target.value}))} style={{ ...inp(false), textAlign:'right' }} /></F>
              </div>
            </div>
            <div style={S.card}>
              <div style={S.sec}>Tax Summary ({isIntra ? 'Intrastate — CGST + SGST' : 'Interstate — IGST'})</div>
              <table style={{ ...S.tbl, marginBottom:'16px' }}>
                <thead>
                  <tr>
                    <th style={S.th}>Item</th><th style={S.th}>HSN</th>
                    <th style={{ ...S.th, textAlign:'right' }}>Taxable (₹)</th>
                    <th style={{ ...S.th, textAlign:'right' }}>GST %</th>
                    {isIntra ? (<><th style={{ ...S.th, textAlign:'right' }}>CGST (₹)</th><th style={{ ...S.th, textAlign:'right' }}>SGST (₹)</th></>) : (<th style={{ ...S.th, textAlign:'right' }}>IGST (₹)</th>)}
                    <th style={{ ...S.th, textAlign:'right' }}>Total (₹)</th>
                  </tr>
                </thead>
                <tbody>
                  {gstRows.map((it, i) => (
                    <tr key={it._id} style={{ background: i%2===0?'#fff':'#F9FAFB' }}>
                      <td style={S.td}>{it.itemName||'—'}</td>
                      <td style={{ ...S.td, fontFamily:'monospace', fontSize:'11px' }}>{it.hsnCode||'—'}</td>
                      <td style={{ ...S.td, textAlign:'right' }}>{fmt(it.taxable)}</td>
                      <td style={{ ...S.td, textAlign:'right' }}>{it.gstPercent}%</td>
                      {isIntra ? (<><td style={{ ...S.td, textAlign:'right' }}>{fmt(it.cgst)}</td><td style={{ ...S.td, textAlign:'right' }}>{fmt(it.sgst)}</td></>) : (<td style={{ ...S.td, textAlign:'right' }}>{fmt(it.igst)}</td>)}
                      <td style={{ ...S.td, textAlign:'right', fontWeight:700 }}>{fmt(it.taxable + it.gstAmt)}</td>
                    </tr>
                  ))}
                  {gstRows.length === 0 && <tr><td colSpan={isIntra?7:6} style={{ ...S.td, textAlign:'center', color:'#94A3B8', padding:'12px' }}>No taxable items</td></tr>}
                </tbody>
              </table>
              <div style={{ display:'flex', justifyContent:'flex-end' }}>
                <div style={{ background:'#F0F9FF', border:`1px solid ${ACC}30`, borderRadius:'8px', padding:'12px 20px', minWidth:'260px' }}>
                  {[
                    { l:'Subtotal', v: itemTotals.subTotal },
                    { l:'Total GST', v: itemTotals.totalGst },
                    { l:`Overall Discount (${od}%)`, v: -odAmt },
                    { l:'Freight', v: fc }, { l:'Packing', v: pc }, { l:'Round Off', v: ro },
                  ].map(row => (
                    <div key={row.l} style={{ display:'flex', justifyContent:'space-between', fontSize:'12px', marginBottom:'5px', color:'#6A6D70' }}>
                      <span>{row.l}</span><span style={{ fontFamily:'monospace' }}>{fmt(row.v)}</span>
                    </div>
                  ))}
                  <div style={{ borderTop:'2px solid #354A5E', marginTop:'8px', paddingTop:'8px', display:'flex', justifyContent:'space-between', fontWeight:700, fontSize:'15px', color:'#354A5E' }}>
                    <span>Grand Total</span><span style={{ color:ACC, fontFamily:'monospace' }}>{fmt(finalTotal)}</span>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {/* TAB 4: Delivery */}
        {activeTab === 'delivery' && (
          <>
            <div style={S.card}>
              <div style={S.sec}>Delivery Address</div>
              <FTA label="Delivery Address (Our Warehouse)" value={del.deliveryAddr} onChange={v => setDel(d => ({...d, deliveryAddr:v}))} placeholder="Delivery address…" rows={3} />
            </div>
            <div style={S.card}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'10px' }}>
                <div style={S.sec}>Shipping / Consignee Address</div>
                <button onClick={() => setDel(d => ({...d, shippingAddr:d.deliveryAddr}))} style={{ fontSize:'11px', color:ACC, background:'#E8F3FF', border:`1px solid ${ACC}50`, borderRadius:'4px', padding:'4px 10px', cursor:'pointer', fontWeight:600, fontFamily:'inherit' }}>📋 Copy from Delivery</button>
              </div>
              <FTA label="Shipping Address" value={del.shippingAddr} onChange={v => setDel(d => ({...d, shippingAddr:v}))} placeholder="Leave blank if same…" rows={3} />
            </div>
            <div style={S.card}>
              <div style={S.sec}>Dispatch Details</div>
              <div style={S.g3}>
                <FSel label="Dispatch Mode" value={del.dispatchMode} onChange={v => setDel(d => ({...d, dispatchMode:v}))} options={['Road','Rail','Air','Sea','Courier','Hand Delivery']} />
                <FIn label="Transporter Name" value={del.transporterName} onChange={v => setDel(d => ({...d, transporterName:v}))} placeholder="Transporter company" />
                <FIn label="Vehicle / LR Number" value={del.vehicleNumber} onChange={v => setDel(d => ({...d, vehicleNumber:v}))} placeholder="Vehicle no. or LR no." />
              </div>
              <div style={{ marginTop:'12px' }}>
                <FTA label="Delivery Instructions" value={del.deliveryInstructions} onChange={v => setDel(d => ({...d, deliveryInstructions:v}))} placeholder="Special instructions…" rows={2} />
              </div>
            </div>
          </>
        )}

        {/* TAB 5: Payment */}
        {activeTab === 'payment' && (
          <div style={S.card}>
            <div style={S.sec}>Payment Terms</div>
            <div style={S.g3}>
              <FSel label="Payment Terms" value={pay.paymentTerms} onChange={v => setPay(p => ({...p, paymentTerms:v}))} options={['Advance','7 Days','15 Days','30 Days','45 Days','60 Days','90 Days','On Delivery','LC (Letter of Credit)']} />
              <FSel label="Payment Mode" value={pay.paymentMode} onChange={v => setPay(p => ({...p, paymentMode:v}))} options={['NEFT','RTGS','IMPS','Cheque','Cash','UPI','DD','LC']} />
              <FIn label="Credit Limit (₹)" value={pay.creditLimit} onChange={v => setPay(p => ({...p, creditLimit:v}))} placeholder="0" />
              <FIn label="Billing Terms" value={pay.billingTerms} onChange={v => setPay(p => ({...p, billingTerms:v}))} placeholder="e.g. Net 30" />
              <FIn label="Due Date" type="date" value={pay.dueDate} onChange={v => setPay(p => ({...p, dueDate:v}))} hint="Auto-calculated from PO date + terms" />
            </div>
          </div>
        )}

        {/* TAB 6: Specs */}
        {activeTab === 'specs' && (
          <div style={S.card}>
            <div style={S.sec}>Technical Specifications</div>
            <div style={S.g2}>
              <FTA label="Product Specifications" value={specs.productSpecs} onChange={v => setSpecs(s => ({...s, productSpecs:v}))} placeholder="Material, grade, standards…" rows={3} />
              <FTA label="Technical Details" value={specs.technicalDetails} onChange={v => setSpecs(s => ({...s, technicalDetails:v}))} placeholder="Dimensions, tolerance…" rows={3} />
              <FIn label="Drawing Number" value={specs.drawingNumber} onChange={v => setSpecs(s => ({...s, drawingNumber:v}))} placeholder="Drawing or document no." />
              <FIn label="Revision / Version" value={specs.version} onChange={v => setSpecs(s => ({...s, version:v}))} placeholder="e.g. Rev A, v1.2" />
            </div>
            <div style={{ marginTop:'16px' }}>
              <div style={{ fontSize:'11px', fontWeight:700, color:'#354A5E', textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:'10px' }}>Custom Fields</div>
              {specs.customFields.map((cf, i) => (
                <div key={i} style={{ display:'flex', gap:'8px', marginBottom:'6px', alignItems:'flex-end' }}>
                  <div style={{ flex:1 }}><input value={cf.key} onChange={e => setSpecs(s => ({...s, customFields:s.customFields.map((x,j) => j===i ? {...x, key:e.target.value} : x)}))} placeholder="Field name" style={inp(false,true)} /></div>
                  <div style={{ flex:2 }}><input value={cf.value} onChange={e => setSpecs(s => ({...s, customFields:s.customFields.map((x,j) => j===i ? {...x, value:e.target.value} : x)}))} placeholder="Value" style={inp(false,true)} /></div>
                  <button onClick={() => setSpecs(s => ({...s, customFields:s.customFields.filter((_,j)=>j!==i)}))} style={{ padding:'5px 10px', background:'#FFEBEB', border:'1px solid #F5B8B8', color:'#BB0000', borderRadius:'4px', cursor:'pointer', fontSize:'12px', fontWeight:700 }}>✕</button>
                </div>
              ))}
              <button onClick={() => setSpecs(s => ({...s, customFields:[...s.customFields, {key:'', value:''}]}))} style={{ padding:'5px 12px', background:'#E8F3FF', border:`1px solid ${ACC}50`, color:ACC, borderRadius:'4px', cursor:'pointer', fontSize:'11px', fontWeight:700, fontFamily:'inherit' }}>+ Add Field</button>
            </div>
          </div>
        )}

        {/* TAB 7: Attachments */}
        {activeTab === 'attach' && (
          <div style={S.card}>
            <div style={S.sec}>Attachments</div>
            {/* Existing saved files */}
            {existingAttach.filter(a => !a.removed).length > 0 && (
              <div style={{ marginBottom:'16px' }}>
                <div style={{ fontSize:'11px', fontWeight:700, color:'#354A5E', textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:'8px' }}>Saved Files</div>
                {existingAttach.map((a, i) => a.removed ? null : (
                  <div key={i} style={{ display:'flex', alignItems:'center', gap:'10px', padding:'8px 12px', background:'#F0F9FF', border:`1px solid ${ACC}20`, borderRadius:'6px', marginBottom:'6px' }}>
                    <span style={{ fontSize:'20px' }}>📄</span>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:'12px', fontWeight:600 }}>{a.name || a.fileName}</div>
                      {a.fileName && <div style={{ fontSize:'10px', color:'#6A6D70' }}>{a.fileName}</div>}
                    </div>
                    <a href={`/api/purchase-orders/${orderId}/download/${encodeURIComponent(a.fileName)}?companyId=${selectedCompany?.companyId || ''}`} target="_blank" rel="noopener noreferrer"
                      style={{ fontSize:'11px', color:ACC, textDecoration:'underline', fontWeight:600 }}>⬇️ Open</a>
                    <button onClick={() => setExistingAttach(p => p.map((x,j) => j===i ? {...x, removed:true} : x))}
                      style={{ background:'#FFEBEB', border:'none', borderRadius:'4px', color:'#BB0000', cursor:'pointer', padding:'4px 8px', fontSize:'11px', fontWeight:700 }}>Remove</button>
                  </div>
                ))}
              </div>
            )}

            {/* New file drop zone */}
            <div
              onDrop={onDropNew} onDragOver={e => e.preventDefault()}
              onClick={() => document.getElementById('poEditFileInput').click()}
              style={{ border:'2px dashed #BBBCBD', borderRadius:'8px', padding:'24px', textAlign:'center', cursor:'pointer', background:'#FAFAFA', marginBottom:'12px' }}
              onMouseEnter={e => e.currentTarget.style.borderColor=ACC}
              onMouseLeave={e => e.currentTarget.style.borderColor='#BBBCBD'}
            >
              <div style={{ fontSize:'28px', marginBottom:'6px' }}>📎</div>
              <div style={{ fontSize:'12px', fontWeight:600, color:'#354A5E' }}>Drag & drop new files, or click to browse</div>
              <input id="poEditFileInput" type="file" multiple style={{ display:'none' }} onChange={onDropNew} />
            </div>
            {newAttachments.map((a, i) => (
              <div key={i} style={{ display:'flex', alignItems:'center', gap:'10px', padding:'7px 12px', background:'#F8FAFC', border:'1px solid #E2E8F0', borderRadius:'6px', marginBottom:'6px' }}>
                <span style={{ fontSize:'18px' }}>📎</span>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:'12px', fontWeight:600 }}>{a.name}</div>
                  <div style={{ fontSize:'10px', color:'#6A6D70' }}>{(a.size/1024).toFixed(1)} KB</div>
                </div>
                <button onClick={() => setNewAttachments(p => p.filter((_,j)=>j!==i))}
                  style={{ background:'#FFEBEB', border:'none', borderRadius:'4px', color:'#BB0000', cursor:'pointer', padding:'4px 8px', fontSize:'11px', fontWeight:700 }}>Remove</button>
              </div>
            ))}
          </div>
        )}

        {/* TAB 8: Notes */}
        {activeTab === 'notes' && (
          <>
            <div style={S.card}>
              <div style={S.sec}>Terms & Notes</div>
              <div style={S.g2}>
                <FTA label="Terms & Conditions" value={notes.termsConditions} onChange={v => setNotes(n => ({...n, termsConditions:v}))} placeholder="Standard purchase terms…" rows={5} />
                <FTA label="Internal Notes" value={notes.internalNotes} onChange={v => setNotes(n => ({...n, internalNotes:v}))} placeholder="For internal use only…" rows={5} />
              </div>
              <div style={{ marginTop:'12px' }}>
                <FTA label="Notes to Vendor" value={notes.vendorNotes} onChange={v => setNotes(n => ({...n, vendorNotes:v}))} placeholder="Instructions or messages to vendor…" rows={3} />
              </div>
            </div>
            <div style={S.card}>
              <div style={S.sec}>Order Summary</div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px' }}>
                <div style={{ background:'#F0F9FF', borderRadius:'6px', padding:'12px', border:`1px solid ${ACC}20` }}>
                  <div style={{ fontSize:'10px', fontWeight:700, color:ACC, textTransform:'uppercase', marginBottom:'8px' }}>Purchase Order</div>
                  {[['PO Number', hdr.poNo],['PO Date', hdr.poDate],['PO Type', hdr.poType],['Purchase Person', hdr.purchasePerson]].map(([l,v]) => (
                    <div key={l} style={{ display:'flex', justifyContent:'space-between', fontSize:'12px', marginBottom:'5px', borderBottom:'1px solid #E8F0FF', paddingBottom:'4px' }}>
                      <span style={{ color:'#6A6D70' }}>{l}</span><span style={{ fontWeight:600 }}>{v || '—'}</span>
                    </div>
                  ))}
                </div>
                <div style={{ background:'#F0F9FF', borderRadius:'6px', padding:'12px', border:`1px solid ${ACC}20` }}>
                  <div style={{ fontSize:'10px', fontWeight:700, color:ACC, textTransform:'uppercase', marginBottom:'8px' }}>Vendor</div>
                  {[['Vendor Name', hdr.vendorName],['Vendor Code', hdr.vendorCode],['GSTIN', hdr.vendorGstin],['State', hdr.vendorState]].map(([l,v]) => (
                    <div key={l} style={{ display:'flex', justifyContent:'space-between', fontSize:'12px', marginBottom:'5px', borderBottom:'1px solid #E8F0FF', paddingBottom:'4px' }}>
                      <span style={{ color:'#6A6D70' }}>{l}</span><span style={{ fontWeight:600 }}>{v || '—'}</span>
                    </div>
                  ))}
                </div>
                <div style={{ background:'#F0F9FF', borderRadius:'6px', padding:'12px', border:`1px solid ${ACC}20`, gridColumn:'1/-1' }}>
                  <div style={{ fontSize:'10px', fontWeight:700, color:ACC, textTransform:'uppercase', marginBottom:'8px' }}>Financials</div>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr', gap:'10px' }}>
                    {[{ l:'Items', v: items.length },{ l:'Subtotal', v: fmt(itemTotals.subTotal) },{ l:'Total GST', v: fmt(itemTotals.totalGst) },{ l:'Grand Total', v: fmt(finalTotal), bold:true }].map(c => (
                      <div key={c.l} style={{ textAlign:'center' }}>
                        <div style={{ fontSize:'18px', fontWeight:700, color: c.bold?ACC:'#354A5E' }}>{c.v}</div>
                        <div style={{ fontSize:'10px', color:'#6A6D70' }}>{c.l}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── Sticky Footer ── */}
      <div style={{ position:'sticky', bottom:0, background:'#fff', borderTop:'2px solid #E5E5E5', padding:'10px 16px', display:'flex', alignItems:'center', justifyContent:'space-between', zIndex:90, boxShadow:'0 -2px 12px rgba(0,0,0,0.07)' }}>
        <div style={{ background:'#354A5E', color:'#fff', borderRadius:'20px', padding:'6px 18px', fontSize:'13px', fontWeight:700, display:'flex', gap:'10px', alignItems:'center' }}>
          <span style={{ fontSize:'11px', color:'#A8C4E0' }}>Grand Total</span>
          <span style={{ color:'#FFCC80', fontFamily:'monospace', fontSize:'14px' }}>{fmt(finalTotal)}</span>
        </div>
        <div style={{ display:'flex', gap:'6px', alignItems:'center' }}>
          {TABS.map((t, i) => (
            <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
              width: i === tabIdx ? '22px' : '8px', height:'8px',
              borderRadius:'4px', border:'none', cursor:'pointer',
              background: i === tabIdx ? ACC : '#D1D5DB', transition:'all 0.2s',
            }} title={t.label} />
          ))}
        </div>
        <div style={{ display:'flex', gap:'8px' }}>
          {tabIdx > 0 && (
            <button onClick={() => setActiveTab(TABS[tabIdx-1].id)}
              style={{ background:'#F5F6F7', border:'1px solid #D9D9D9', color:'#32363A', padding:'7px 14px', borderRadius:'4px', cursor:'pointer', fontSize:'12px', fontWeight:600, fontFamily:'inherit' }}>← Prev</button>
          )}
          {tabIdx < TABS.length - 1 ? (
            <button onClick={() => setActiveTab(TABS[tabIdx+1].id)}
              style={{ background:ACC, color:'#fff', border:'none', padding:'7px 14px', borderRadius:'4px', cursor:'pointer', fontSize:'12px', fontWeight:600, fontFamily:'inherit' }}>Next →</button>
          ) : (
            <button onClick={() => handleSubmit('pending')} disabled={saving}
              style={{ background:ACC, color:'#fff', border:'none', padding:'7px 20px', borderRadius:'4px', cursor:'pointer', fontSize:'12px', fontWeight:700, fontFamily:'inherit' }}>
              {saving ? 'Submitting…' : '📤 Send for Approval'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default EditPurchaseOrder;
