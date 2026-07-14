import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { useNavigate, useParams } from 'react-router-dom';
import { useCompany } from '../../../context/CompanyContext';

const F   = "'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif";
const BD  = '#d1d9e6';
const fmt = n => (parseFloat(n)||0).toFixed(2);
const today = () => new Date().toISOString().slice(0,10);
const GST_RATES = [0,5,12,18,28];

const inp = (ex={}) => ({
  height:36, padding:'0 10px', border:`1px solid ${BD}`, borderRadius:6,
  fontSize:13, fontFamily:F, boxSizing:'border-box', outline:'none',
  background:'#fff', width:'100%', ...ex,
});
const lbl = { fontSize:11, fontWeight:700, color:'#374151', marginBottom:5, display:'block' };

const OFFICE_CATS = ['Rent','Utilities','Internet / Telephone','Office Supplies','Travel & Conveyance',
  'Printing & Stationery','Meals & Entertainment','Salaries & Wages','Insurance',
  'Maintenance & Repairs','Advertisement','Professional Fees','Miscellaneous'];
const MFG_CATS = ['Raw Material Handling','Labour','Machine Maintenance','Fuel & Power',
  'Quality Control','Tooling & Consumables','Transport','Subcontracting',
  'Factory Overheads','Testing','Miscellaneous'];
const ORDER_CATS = ['Site Visit','Installation','Labour','Transport & Freight','Packaging',
  'Testing & Commissioning','Documentation','Tools & Consumables',
  'Freight & Courier','Sub-Contractor','Miscellaneous'];

const TYPE_CONFIG = {
  office:        { label:'Office Expenses',        icon:'🏢', color:'#1d4ed8', lightBg:'#eff6ff', borderCol:'#bfdbfe', desc:'Admin, rent, utilities, travel — no order link', cats:OFFICE_CATS },
  manufacturing: { label:'Manufacturing Expenses', icon:'🏭', color:'#15803d', lightBg:'#f0fdf4', borderCol:'#bbf7d0', desc:'Production costs — vendor required, order optional', cats:MFG_CATS   },
  order:         { label:'Order Expenses',         icon:'📋', color:'#b45309', lightBg:'#fffbeb', borderCol:'#fde68a', desc:'Against a specific sales order — goes for approval', cats:ORDER_CATS },
};

/* ─── Searchable dropdown — uses fixed positioning so it escapes overflow:hidden ─── */
function SearchDrop({ value, onSelect, options, placeholder }) {
  /* options = [{ key, label, sub }] */
  const [open, setOpen] = useState(false);
  const [q,    setQ]    = useState('');
  const ref             = useRef();
  const inputRef        = useRef();
  const [pos,  setPos]  = useState({ top:0, left:0, width:200 });

  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const openDrop = () => {
    if (inputRef.current) {
      const r = inputRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + window.scrollY + 2, left: r.left + window.scrollX, width: r.width });
    }
    setQ(''); setOpen(true);
  };

  const filtered = q.trim()
    ? options.filter(o => o.label.toLowerCase().includes(q.toLowerCase()) || (o.sub||'').toLowerCase().includes(q.toLowerCase()))
    : options;

  const chosen = options.find(o => o.key === value);

  return (
    <div ref={ref} style={{ position:'relative' }}>
      <input
        ref={inputRef}
        readOnly={!open}
        value={open ? q : (chosen?.label || '')}
        onChange={e => setQ(e.target.value)}
        onFocus={openDrop}
        onClick={openDrop}
        placeholder={placeholder}
        style={{ ...inp(), cursor:'pointer', paddingRight:30, color: chosen ? '#111' : '#9ca3af' }}
      />
      <span style={{ position:'absolute', right:10, top:'50%', transform:'translateY(-50%)', fontSize:9, color:'#9ca3af', pointerEvents:'none' }}>▼</span>

      {open && (
        <div style={{
          position:'fixed', top:pos.top, left:pos.left, width:pos.width,
          zIndex:99999, background:'#fff', border:`1px solid ${BD}`, borderRadius:8,
          maxHeight:260, overflowY:'auto', boxShadow:'0 8px 28px rgba(0,0,0,0.18)',
        }}>
          {/* live search input inside dropdown */}
          <div style={{ position:'sticky', top:0, background:'#f8faff', padding:'6px 8px', borderBottom:`1px solid ${BD}` }}>
            <input
              autoFocus
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Type to search…"
              style={{ ...inp({ height:28, fontSize:12 }) }}
            />
          </div>
          {filtered.length === 0
            ? <div style={{ padding:'12px', fontSize:12, color:'#9ca3af', textAlign:'center' }}>No results for "{q}"</div>
            : filtered.map(o => (
              <div key={o.key}
                onMouseDown={() => { onSelect(o); setOpen(false); setQ(''); }}
                style={{ padding:'8px 14px', cursor:'pointer', fontFamily:F,
                  background: o.key===value ? '#eff6ff' : '#fff',
                  color: o.key===value ? '#1d4ed8' : '#111827',
                  borderBottom:'1px solid #f1f5f9' }}
                onMouseEnter={e => { if (o.key!==value) e.currentTarget.style.background='#f8faff'; }}
                onMouseLeave={e => { if (o.key!==value) e.currentTarget.style.background='#fff'; }}>
                <div style={{ fontSize:13, fontWeight: o.key===value ? 700 : 500 }}>{o.label}</div>
                {o.sub && <div style={{ fontSize:11, color:'#6b7280', marginTop:1 }}>{o.sub}</div>}
              </div>
            ))
          }
        </div>
      )}
    </div>
  );
}

/* ─── Card section wrapper ─── */
function Section({ color, title, children }) {
  return (
    <div style={{ background:'#fff', border:`1px solid ${BD}`, borderRadius:10, marginBottom:14, boxShadow:'0 1px 4px rgba(0,0,0,0.05)' }}>
      <div style={{ background:'#f8faff', borderBottom:`2px solid ${color||'#133d80'}`, padding:'9px 16px', borderRadius:'10px 10px 0 0' }}>
        <span style={{ fontSize:11, fontWeight:800, color:color||'#133d80', textTransform:'uppercase', letterSpacing:'0.8px' }}>{title}</span>
      </div>
      <div style={{ padding:'16px' }}>{children}</div>
    </div>
  );
}

/* ─── Field wrapper ─── */
const Field = ({ label, required, children, span }) => (
  <div style={{ gridColumn: span ? `span ${span}` : undefined }}>
    <label style={lbl}>{label}{required && <span style={{ color:'#dc2626' }}> *</span>}</label>
    {children}
  </div>
);

/* ═══════════════════════════════════════════ MAIN ═══════════════════════════════ */
export default function CreateExpense() {
  const { selectedCompany } = useCompany();
  const cid      = selectedCompany?.companyId;
  const navigate = useNavigate();
  const { expenseId } = useParams();
  const isEdit   = !!expenseId;

  /* master data */
  const [salesOrders, setSalesOrders] = useState([]);
  const [vendors,     setVendors]     = useState([]);
  const [clients,     setClients]     = useState([]);
  const [ledgerAccs,  setLedgerAccs]  = useState([]);

  /* step */
  const [expType, setExpType] = useState('');

  /* common */
  const [date,        setDate]        = useState(today());
  const [category,    setCategory]    = useState('');
  const [description, setDescription] = useState('');
  const [amount,      setAmount]      = useState('');
  const [gstPct,      setGstPct]      = useState('0');
  const [invoiceNo,   setInvoiceNo]   = useState('');
  const [notes,       setNotes]       = useState('');

  /* office */
  const [officeVendor, setOfficeVendor] = useState('');

  /* manufacturing */
  const [mfgVendorId,   setMfgVendorId]   = useState('');
  const [mfgVendorName, setMfgVendorName] = useState('');
  const [mfgOrderId,    setMfgOrderId]    = useState('');
  const [mfgOrderLabel, setMfgOrderLabel] = useState('');

  /* order */
  const [soId,        setSoId]        = useState('');
  const [soLabel,     setSoLabel]     = useState('');
  const [ledgerId,    setLedgerId]    = useState('');
  const [ledgerLabel, setLedgerLabel] = useState('');

  const [saving, setSaving] = useState(false);
  const [msg,    setMsg]    = useState({ text:'', ok:true });

  const base       = parseFloat(amount) || 0;
  const gstAmt     = base * (parseFloat(gstPct) || 0) / 100;
  const grandTotal = +(base + gstAmt).toFixed(2);

  /* ── load master data ── */
  useEffect(() => {
    if (!cid) return;
    Promise.all([
      axios.get(`/api/sales-orders?companyId=${cid}`).catch(() => ({ data:[] })),
      axios.get(`/api/vendors?companyId=${cid}`).catch(() => ({ data:[] })),
      axios.get(`/api/clients?companyId=${cid}`).catch(() => ({ data:[] })),
      axios.get(`/api/ledger/accounts?companyId=${cid}`).catch(() => ({ data:[] })),
    ]).then(([so, v, cl, la]) => {
      const orders = Array.isArray(so.data) ? so.data : (so.data?.orders || []);
      setSalesOrders(orders.filter(o => o.status !== 'cancelled'));
      setVendors(v.data || []);
      setClients(cl.data || []);
      setLedgerAccs(la.data || []);
    });
  }, [cid]);

  /* ── load for edit ── */
  useEffect(() => {
    if (!isEdit || !cid) return;
    axios.get(`/api/accounts/expenses/${expenseId}?companyId=${cid}`).then(({ data:e }) => {
      setExpType(e.expenseType || 'office');
      setDate(e.date || today());
      setCategory(e.expenseCategory || e.category || '');
      setDescription(e.description || '');
      setAmount(String(e.amount || ''));
      setGstPct(String(e.taxRate || '0'));
      setInvoiceNo(e.invoiceNo || '');
      setNotes(e.notes || '');
      setOfficeVendor(e.vendor || '');
      setMfgVendorId(String(e.vendorId || ''));
      setMfgVendorName(e.vendorName || '');
      setMfgOrderId(String(e.soId || ''));
      setMfgOrderLabel(e.orderNo ? `${e.orderNo} — ${e.clientName||''}` : '');
      setSoId(String(e.soId || ''));
      setSoLabel(e.orderNo ? `${e.orderNo} — ${e.clientName||''}` : '');
      setLedgerId(String(e.ledgerId || ''));
      setLedgerLabel(e.ledgerName || '');
    }).catch(() => setMsg({ text:'Failed to load.', ok:false }));
  }, [isEdit, expenseId, cid]);

  const resetForm = () => {
    setDate(today()); setCategory(''); setDescription('');
    setAmount(''); setGstPct('0'); setInvoiceNo(''); setNotes('');
    setOfficeVendor('');
    setMfgVendorId(''); setMfgVendorName(''); setMfgOrderId(''); setMfgOrderLabel('');
    setSoId(''); setSoLabel(''); setLedgerId(''); setLedgerLabel('');
  };

  /* ── option lists for SearchDrop ── */
  const soOptions = salesOrders.map(o => ({
    key:   String(o.orderId),
    label: `${o.orderNo || o.orderId} — ${o.customerName || o.clientName || ''}`,
    sub:   o.orderDate ? `Date: ${o.orderDate}  |  ₹${fmt(o.grandTotal||0)}` : `₹${fmt(o.grandTotal||0)}`,
  }));

  const vendorOptions = vendors.map(v => ({
    key:   String(v.vendorId || v.id),
    label: v.vendorName || v.companyName || '',
    sub:   v.city || '',
  }));

  /* combined Expense By: vendors + clients + ledger accounts */
  const expByOptions = [
    ...vendors.map(v => ({
      key:   'V:'+String(v.vendorId||v.id),
      label: v.vendorName || v.companyName || '',
      sub:   'Vendor' + (v.city ? ' · '+v.city : ''),
    })),
    ...clients.map(c => ({
      key:   'C:'+String(c.clientId||c.id),
      label: c.clientName || c.companyName || '',
      sub:   'Client' + (c.city ? ' · '+c.city : ''),
    })),
    ...ledgerAccs.map(a => ({
      key:   'L:'+String(a.id||a.accountId||a.name),
      label: a.name || '',
      sub:   a.groupName || 'Ledger Account',
    })),
  ].filter(o => o.label);

  /* ── validate ── */
  const validate = () => {
    if (!date)   { setMsg({ text:'Date is required.', ok:false }); return false; }
    if (!category) { setMsg({ text:'Category is required.', ok:false }); return false; }
    if (!amount || parseFloat(amount) <= 0) { setMsg({ text:'Amount must be greater than 0.', ok:false }); return false; }
    if (expType === 'manufacturing' && !mfgVendorName.trim()) {
      setMsg({ text:'Vendor / Party name is required.', ok:false }); return false;
    }
    if (expType === 'order' && !soId) {
      setMsg({ text:'Please select a Sales Order.', ok:false }); return false;
    }
    if (expType === 'order' && !ledgerLabel) {
      setMsg({ text:'Please select Expense By account.', ok:false }); return false;
    }
    return true;
  };

  /* ── save ── */
  const save = async () => {
    if (!validate()) return;
    setSaving(true); setMsg({ text:'', ok:true });
    try {
      const status = expType === 'order' ? 'pending_approval' : 'approved';
      const soOrder = salesOrders.find(o => String(o.orderId)===soId || String(o.orderId)===mfgOrderId);
      const payload = {
        companyId: cid, expenseType: expType,
        expenseCategory: category, category,
        date, description, amount, taxRate: gstPct, grandTotal, invoiceNo, notes, status,
        vendor:     expType==='office'         ? officeVendor  : '',
        vendorId:   expType==='manufacturing'  ? mfgVendorId   : '',
        vendorName: expType==='manufacturing'  ? mfgVendorName : '',
        soId:       expType==='manufacturing'  ? mfgOrderId    : (expType==='order' ? soId : ''),
        orderNo:    expType==='manufacturing'  ? (salesOrders.find(o=>String(o.orderId)===mfgOrderId)?.orderNo||'') : (soOrder?.orderNo||''),
        clientName: expType==='manufacturing'  ? (salesOrders.find(o=>String(o.orderId)===mfgOrderId)?.customerName||salesOrders.find(o=>String(o.orderId)===mfgOrderId)?.clientName||'') : (soOrder?.customerName||soOrder?.clientName||''),
        ledgerId:   expType==='order' ? ledgerId    : '',
        ledgerName: expType==='order' ? ledgerLabel : '',
      };
      if (isEdit) {
        await axios.put(`/api/accounts/expenses/${expenseId}?companyId=${cid}`, payload);
        setMsg({ text:'Expense updated.', ok:true });
        setTimeout(() => navigate('/account/expense/view'), 1200);
      } else {
        const res = await axios.post(`/api/accounts/expenses?companyId=${cid}`, payload);
        setMsg({ text:`Expense #${res.data.expenseId} ${status==='pending_approval'?'submitted for approval':'saved'} ✓`, ok:true });
        resetForm();
      }
    } catch (e) {
      setMsg({ text:'Error: '+(e.response?.data?.error||e.message), ok:false });
    }
    setSaving(false);
  };

  const tc = expType ? TYPE_CONFIG[expType] : null;
  const cats = tc?.cats || [];

  return (
    <div style={{ fontFamily:F, background:'#f0f4fb', minHeight:'100%', paddingBottom:40 }}>

      {/* ── Header ── */}
      <div style={{ background:'#133d80', padding:'0 20px', display:'flex', alignItems:'center', justifyContent:'space-between', height:52 }}>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <span style={{ fontSize:20 }}>{tc?.icon || '🧾'}</span>
          <div>
            <div style={{ fontSize:9, color:'rgba(255,255,255,0.5)', textTransform:'uppercase', letterSpacing:'1px' }}>Accounts → Expenses</div>
            <div style={{ fontSize:15, fontWeight:800, color:'#fff' }}>{isEdit ? 'Edit Expense' : tc ? `New ${tc.label}` : 'New Expense'}</div>
          </div>
        </div>
        <button onClick={() => navigate('/account/expense/view')}
          style={{ height:32, padding:'0 14px', background:'rgba(255,255,255,0.12)', border:'1px solid rgba(255,255,255,0.3)', borderRadius:6, color:'#fff', fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:F }}>
          ← View All Expenses
        </button>
      </div>

      <div style={{ padding:'18px 20px 0' }}>

        {/* Message bar */}
        {msg.text && (
          <div style={{ background:msg.ok?'#f0fdf4':'#fef2f2', border:`1px solid ${msg.ok?'#bbf7d0':'#fecaca'}`, borderRadius:8, padding:'10px 16px', marginBottom:14, fontSize:13, color:msg.ok?'#15803d':'#dc2626', fontWeight:600, display:'flex', gap:8, alignItems:'center' }}>
            <span>{msg.ok?'✓':'⚠'}</span> {msg.text}
          </div>
        )}

        {/* ── STEP 1: Type selection ── */}
        {!isEdit && (
          <div style={{ background:'#fff', border:`1px solid ${BD}`, borderRadius:10, marginBottom:14, boxShadow:'0 1px 4px rgba(0,0,0,0.05)' }}>
            <div style={{ background:'#f8faff', borderBottom:'2px solid #133d80', padding:'9px 16px', borderRadius:'10px 10px 0 0' }}>
              <span style={{ fontSize:11, fontWeight:800, color:'#133d80', textTransform:'uppercase', letterSpacing:'0.8px' }}>Step 1 — Select Expense Type</span>
            </div>
            <div style={{ padding:'16px', display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12 }}>
              {Object.entries(TYPE_CONFIG).map(([key, cfg]) => {
                const sel = expType === key;
                return (
                  <button key={key} onClick={() => { setExpType(key); resetForm(); setMsg({ text:'', ok:true }); }}
                    style={{ padding:'18px 14px', borderRadius:10, cursor:'pointer', fontFamily:F, textAlign:'left',
                      border:`2px solid ${sel ? cfg.color : BD}`, background: sel ? cfg.lightBg : '#fafbff',
                      boxShadow: sel ? `0 0 0 3px ${cfg.color}22` : 'none', outline:'none', transition:'all 0.15s' }}>
                    <div style={{ fontSize:26, marginBottom:8 }}>{cfg.icon}</div>
                    <div style={{ fontSize:13, fontWeight:800, color: sel ? cfg.color : '#1f2937', marginBottom:4 }}>{cfg.label}</div>
                    <div style={{ fontSize:11, color:'#6b7280', lineHeight:1.4 }}>{cfg.desc}</div>
                    {sel && <div style={{ marginTop:10, display:'inline-flex', alignItems:'center', gap:4, background:cfg.color, color:'#fff', borderRadius:12, padding:'2px 10px', fontSize:11, fontWeight:700 }}>✓ Selected</div>}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ── STEP 2: Form ── */}
        {(expType || isEdit) && (
          <>
            {/* ════ EXPENSE DETAILS (all types) ════ */}
            <Section color={tc?.color} title={`${tc?.icon||''} Expense Details`}>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:14, marginBottom:14 }}>
                <Field label="Date" required>
                  <input type="date" value={date} onChange={e => setDate(e.target.value)} style={inp()} />
                </Field>
                <Field label="Category" required>
                  <select value={category} onChange={e => setCategory(e.target.value)} style={inp({ cursor:'pointer' })}>
                    <option value="">— Select Category —</option>
                    {cats.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </Field>
                <Field label="Invoice No.">
                  <input value={invoiceNo} onChange={e => setInvoiceNo(e.target.value)} placeholder="e.g. INV-2526-001" style={inp()} />
                </Field>
              </div>

              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 2fr', gap:14, marginBottom:14 }}>
                <Field label="Amount (₹)" required>
                  <input type="number" value={amount} onChange={e => setAmount(e.target.value)}
                    min="0" step="0.01" placeholder="0.00" style={inp({ textAlign:'right', fontWeight:600, fontSize:14 })} />
                </Field>
                <Field label="GST %">
                  <select value={gstPct} onChange={e => setGstPct(e.target.value)} style={inp({ cursor:'pointer' })}>
                    {GST_RATES.map(r => <option key={r} value={r}>{r===0?'No GST':r+'%'}</option>)}
                  </select>
                </Field>
                <Field label="Description">
                  <input value={description} onChange={e => setDescription(e.target.value)} placeholder="What was this expense for?" style={inp()} />
                </Field>
              </div>

              {/* Office-specific vendor */}
              {expType === 'office' && (
                <Field label="Vendor / Paid To">
                  <input value={officeVendor} onChange={e => setOfficeVendor(e.target.value)} placeholder="Name of vendor or payee" style={inp()} />
                </Field>
              )}

              {/* Mfg-specific vendor */}
              {expType === 'manufacturing' && (
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
                  <Field label="Vendor / Party Name" required>
                    <SearchDrop
                      value={mfgVendorId}
                      onSelect={o => { setMfgVendorId(o.key); setMfgVendorName(o.label); }}
                      options={vendorOptions}
                      placeholder="Search vendor…"
                    />
                    {!mfgVendorId && (
                      <input value={mfgVendorName} onChange={e => setMfgVendorName(e.target.value)}
                        placeholder="…or type name manually"
                        style={{ ...inp({ fontSize:12, marginTop:6, borderStyle:'dashed' }) }} />
                    )}
                    {mfgVendorName && (
                      <div style={{ marginTop:4, fontSize:11, color:'#15803d', fontWeight:700 }}>✓ {mfgVendorName}</div>
                    )}
                  </Field>
                  <Field label="Linked Sales Order (optional)">
                    <SearchDrop
                      value={mfgOrderId}
                      onSelect={o => { setMfgOrderId(o.key); setMfgOrderLabel(o.label); }}
                      options={soOptions}
                      placeholder="Search order no. or client…"
                    />
                    {mfgOrderId && (
                      <div style={{ marginTop:4, fontSize:11, color:'#6b7280', display:'flex', alignItems:'center', gap:6 }}>
                        <span style={{ color:'#15803d', fontWeight:700 }}>✓ {mfgOrderLabel}</span>
                        <button onClick={() => { setMfgOrderId(''); setMfgOrderLabel(''); }}
                          style={{ border:'none', background:'none', color:'#dc2626', cursor:'pointer', fontSize:12 }}>✕</button>
                      </div>
                    )}
                  </Field>
                </div>
              )}

              <div style={{ marginTop:14 }}>
                <Field label="Notes">
                  <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional notes…" style={inp()} />
                </Field>
              </div>
            </Section>

            {/* ════ ORDER EXPENSES — Sales Order ════ */}
            {expType === 'order' && (
              <Section color={tc?.color} title="📋 Select Sales Order (Required)">
                <Field label="Search & Select Sales Order" required>
                  <SearchDrop
                    value={soId}
                    onSelect={o => { setSoId(o.key); setSoLabel(o.label); }}
                    options={soOptions}
                    placeholder="Type order no. or client name to search…"
                  />
                </Field>
                {soId && (
                  <div style={{ marginTop:10, padding:'10px 14px', background:'#fffbeb', border:'1px solid #fde68a', borderRadius:8, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                    <div>
                      <span style={{ fontSize:11, color:'#92400e', fontWeight:700 }}>Selected: </span>
                      <span style={{ fontSize:13, fontWeight:800, color:'#1d4ed8' }}>{soLabel}</span>
                    </div>
                    <button onClick={() => { setSoId(''); setSoLabel(''); }}
                      style={{ border:'none', background:'none', color:'#dc2626', cursor:'pointer', fontSize:12, fontWeight:700 }}>✕ Clear</button>
                  </div>
                )}
              </Section>
            )}

            {/* ════ ORDER EXPENSES — Expense By ════ */}
            {expType === 'order' && (
              <Section color={tc?.color} title="👤 Expense By (Required)">
                <p style={{ fontSize:12, color:'#6b7280', margin:'0 0 12px' }}>
                  Select who incurred this expense — can be a vendor, client, or any ledger account.
                </p>
                <Field label="Expense By — Vendor / Ledger / Employee" required>
                  <SearchDrop
                    value={ledgerId}
                    onSelect={o => { setLedgerId(o.key); setLedgerLabel(o.label); }}
                    options={expByOptions}
                    placeholder="Search vendor, client, or ledger account…"
                  />
                </Field>
                {ledgerLabel && (
                  <div style={{ marginTop:8, display:'inline-flex', alignItems:'center', gap:8, background:'#eff6ff', border:'1px solid #bfdbfe', borderRadius:6, padding:'4px 12px' }}>
                    <span style={{ fontSize:12, fontWeight:800, color:'#1d4ed8' }}>✓ {ledgerLabel}</span>
                    <button onClick={() => { setLedgerId(''); setLedgerLabel(''); }}
                      style={{ border:'none', background:'none', color:'#dc2626', cursor:'pointer', fontSize:11 }}>✕</button>
                  </div>
                )}

                {/* Approval notice */}
                <div style={{ marginTop:16, background:'#fffbeb', border:'1px solid #fde68a', borderRadius:8, padding:'12px 14px', display:'flex', gap:10, alignItems:'flex-start' }}>
                  <span style={{ fontSize:18 }}>⏳</span>
                  <div>
                    <div style={{ fontSize:12, fontWeight:800, color:'#92400e' }}>This expense will go for Approval</div>
                    <div style={{ fontSize:11, color:'#78350f', marginTop:2 }}>
                      Order Expenses require manager approval before posting. Track status in the Expense list.
                    </div>
                  </div>
                </div>
              </Section>
            )}

            {/* ── Amount Summary ── */}
            {base > 0 && (
              <div style={{ background:'#fff', border:`1px solid ${BD}`, borderRadius:10, padding:'12px 20px', marginBottom:14, display:'flex', alignItems:'center', gap:28, flexWrap:'wrap', boxShadow:'0 1px 4px rgba(0,0,0,0.05)' }}>
                <div style={{ fontSize:12, color:'#6b7280' }}>Base: <strong style={{ color:'#111' }}>₹{fmt(base)}</strong></div>
                {gstAmt > 0 && <div style={{ fontSize:12, color:'#6b7280' }}>GST ({gstPct}%): <strong style={{ color:'#b45309' }}>₹{fmt(gstAmt)}</strong></div>}
                <div style={{ marginLeft:'auto', fontSize:16, fontWeight:800, color: tc?.color||'#133d80' }}>Grand Total: ₹{fmt(grandTotal)}</div>
              </div>
            )}

            {/* ── Action Buttons ── */}
            <div style={{ display:'flex', gap:12, justifyContent:'flex-end', padding:'4px 0 20px' }}>
              <button onClick={() => navigate('/account/expense/view')}
                style={{ height:42, padding:'0 22px', background:'#fff', border:`1px solid ${BD}`, borderRadius:7, fontSize:13, cursor:'pointer', fontFamily:F, fontWeight:600, color:'#374151' }}>
                Cancel
              </button>
              <button onClick={save} disabled={saving}
                style={{ height:42, padding:'0 32px', background: saving ? '#94a3b8' : (tc?.color||'#133d80'), border:'none', borderRadius:7, fontSize:14, fontWeight:800, color:'#fff', cursor: saving ? 'not-allowed' : 'pointer', fontFamily:F, letterSpacing:'0.3px', boxShadow:`0 2px 8px ${tc?.color||'#133d80'}44` }}>
                {saving ? 'Saving…' : expType==='order' ? '📤  Submit for Approval' : isEdit ? '💾  Save Changes' : '✅  Save Expense'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
