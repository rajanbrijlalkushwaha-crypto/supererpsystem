import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useCompany } from '../../../context/CompanyContext';
import DocAttachments from '../../../components/DocAttachments';

const F   = "'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif";
const P   = '#133d80';
const BD  = '#d1d9e6';
const fmt = n => (parseFloat(n) || 0).toFixed(2);
let _rid  = 1;
const newRow = () => ({ _id: _rid++, ledger: '', dr: '', cr: '' });

const JOURNAL_TYPES = [
  { value: 'office',        label: '🏢 Office',        desc: 'General office expenses / adjustments' },
  { value: 'manufacturing', label: '🏭 Manufacturing',  desc: 'Production & factory related entries' },
  { value: 'order',         label: '📦 Order',          desc: 'Linked to a Sales Order or Purchase Order' },
];

/* ── Searchable ledger picker ── */
function LedgerPicker({ value, onChange, groups, placeholder = 'Select ledger account…' }) {
  const [open, setOpen] = useState(false);
  const [q, setQ]       = useState('');
  const wrapRef         = useRef();
  useEffect(() => {
    const close = e => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);
  const filtered = groups
    .map(g => ({ ...g, items: q.trim() ? g.items.filter(i => i.toLowerCase().includes(q.toLowerCase())) : g.items }))
    .filter(g => g.items.length > 0);
  return (
    <div ref={wrapRef} style={{ position: 'relative', width: '100%' }}>
      <input value={open ? q : value} onChange={e => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => { setQ(''); setOpen(true); }} placeholder={value || placeholder}
        style={{ width:'100%', height:30, padding:'0 28px 0 8px', border:`1px solid ${BD}`, borderRadius:5, fontSize:12,
          fontFamily:F, outline:'none', background:'#fff', boxSizing:'border-box',
          borderColor:open?P:BD, boxShadow:open?`0 0 0 2px ${P}22`:'none', cursor:'pointer' }} />
      <span style={{ position:'absolute', right:7, top:'50%', transform:'translateY(-50%)', fontSize:9, color:'#9ca3af', pointerEvents:'none' }}>▼</span>
      {open && (
        <div style={{ position:'absolute', top:'calc(100% + 2px)', left:0, right:0, zIndex:2000, background:'#fff',
          border:`1px solid ${BD}`, borderRadius:8, maxHeight:260, overflowY:'auto', boxShadow:'0 8px 28px rgba(0,0,0,0.16)' }}>
          {filtered.length === 0 ? (
            <div style={{ padding:'12px 14px', fontSize:12, color:'#9ca3af', textAlign:'center', fontFamily:F }}>No match for "{q}"</div>
          ) : filtered.map(g => (
            <div key={g.group}>
              <div style={{ padding:'4px 10px 2px', fontSize:9.5, fontWeight:800, color:'#94a3b8', background:'#f8faff',
                textTransform:'uppercase', letterSpacing:'0.6px', position:'sticky', top:0 }}>
                {g.group} ({g.items.length})
              </div>
              {g.items.map(item => (
                <div key={item} onMouseDown={() => { onChange(item); setOpen(false); setQ(''); }}
                  style={{ padding:'7px 14px', cursor:'pointer', fontSize:12.5, fontFamily:F,
                    color:item===value?P:'#111827', fontWeight:item===value?700:400,
                    background:item===value?'#eff6ff':'#fff' }}
                  onMouseEnter={e => { if (item!==value) e.currentTarget.style.background='#f0f4fb'; }}
                  onMouseLeave={e => { if (item!==value) e.currentTarget.style.background='#fff'; }}>
                  {item}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const AmtInput = ({ value, onChange, color, placeholder = '—' }) => (
  <input type="number" value={value} onChange={onChange} min="0" step="0.01" placeholder={placeholder}
    style={{ width:'100%', height:30, padding:'0 8px', border:`1px solid ${BD}`, borderRadius:5, fontSize:13,
      fontFamily:F, outline:'none', textAlign:'right', fontWeight:value?700:400, boxSizing:'border-box',
      background:value?(color==='dr'?'#eff6ff':'#faf5ff'):'#fff',
      color:value?(color==='dr'?'#1d4ed8':'#7c3aed'):'#9ca3af' }} />
);

/* ── Order search popup ── */
function OrderSearchPopup({ salesOrders, purchaseOrders, onSelect, onClose }) {
  const [tab, setTab] = useState('SO');
  const [q, setQ]     = useState('');
  const ref = useRef(null);
  useEffect(() => { ref.current?.focus(); }, []);
  const items = tab === 'SO' ? salesOrders : purchaseOrders;
  const filtered = q.trim()
    ? items.filter(o =>
        String(o.orderId||'').includes(q) ||
        (o.orderNo||o.poNo||'').toLowerCase().includes(q.toLowerCase()) ||
        (o.customerName||o.clientName||o.vendorName||'').toLowerCase().includes(q.toLowerCase())
      )
    : items;
  return (
    <div onClick={e => { if (e.target===e.currentTarget) onClose(); }}
      style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', backdropFilter:'blur(2px)', zIndex:9000,
        display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
      <div style={{ background:'#fff', borderRadius:12, width:'100%', maxWidth:700, maxHeight:'80vh',
        display:'flex', flexDirection:'column', boxShadow:'0 20px 60px rgba(0,0,0,0.25)' }}>
        <div style={{ background:P, color:'#fff', padding:'12px 16px', borderRadius:'12px 12px 0 0',
          display:'flex', justifyContent:'space-between', alignItems:'center', flexShrink:0 }}>
          <span style={{ fontSize:13, fontWeight:700, fontFamily:F }}>Link Order</span>
          <button onClick={onClose} style={{ background:'rgba(255,255,255,0.15)', border:'1px solid rgba(255,255,255,0.25)',
            borderRadius:6, color:'#fff', width:28, height:28, cursor:'pointer', fontSize:16, fontFamily:F }}>✕</button>
        </div>
        <div style={{ padding:'10px 14px', display:'flex', gap:8, borderBottom:`1px solid ${BD}`, flexShrink:0, alignItems:'center' }}>
          {['SO','PO'].map(t => (
            <button key={t} onClick={() => setTab(t)}
              style={{ height:28, padding:'0 14px', borderRadius:5, border:`1px solid ${tab===t?P:BD}`,
                background:tab===t?P:'#fff', color:tab===t?'#fff':'#374151', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:F }}>
              {t === 'SO' ? '📋 Sales Orders' : '🛒 Purchase Orders'}
            </button>
          ))}
          <input ref={ref} value={q} onChange={e => setQ(e.target.value)} placeholder="Search by ID, No, party…"
            style={{ marginLeft:'auto', height:28, padding:'0 10px', border:`1px solid ${BD}`, borderRadius:5,
              fontSize:12, fontFamily:F, outline:'none', width:220 }} />
        </div>
        <div style={{ flex:1, overflowY:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12, fontFamily:F }}>
            <thead style={{ position:'sticky', top:0 }}>
              <tr style={{ background:P }}>
                {['#','Order No','Party','Date','Amount'].map((h,i)=>(
                  <th key={i} style={{ padding:'7px 10px', color:'#fff', fontWeight:700, textAlign:i>=3?'right':'left', fontSize:11, border:'1px solid rgba(255,255,255,0.15)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length===0 && <tr><td colSpan={5} style={{ padding:24, textAlign:'center', color:'#9ca3af' }}>No {tab} records found</td></tr>}
              {filtered.map((o,i) => (
                <tr key={String(o.orderId||i)} onClick={() => { onSelect({ ...o, _orderType: tab }); onClose(); }}
                  style={{ background:i%2===0?'#fff':'#f8faff', cursor:'pointer' }}
                  onMouseEnter={e=>e.currentTarget.style.background='#eff6ff'}
                  onMouseLeave={e=>e.currentTarget.style.background=i%2===0?'#fff':'#f8faff'}>
                  <td style={{ padding:'7px 10px', border:`1px solid ${BD}`, fontWeight:700, color:P }}>{o.orderId}</td>
                  <td style={{ padding:'7px 10px', border:`1px solid ${BD}` }}>{o.orderNo||o.poNo||'—'}</td>
                  <td style={{ padding:'7px 10px', border:`1px solid ${BD}` }}>{o.customerName||o.clientName||o.vendorName||'—'}</td>
                  <td style={{ padding:'7px 10px', border:`1px solid ${BD}`, textAlign:'right', color:'#6b7280' }}>{o.orderDate||o.poDate||'—'}</td>
                  <td style={{ padding:'7px 10px', border:`1px solid ${BD}`, textAlign:'right', fontWeight:600 }}>₹{fmt(o.grandTotal||0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ padding:'8px 14px', borderTop:`1px solid ${BD}`, fontSize:11, color:'#9ca3af', background:'#fafbfc', borderRadius:'0 0 12px 12px', flexShrink:0 }}>
          {filtered.length} record{filtered.length!==1?'s':''} — click to link
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════ */
export default function CreateJournal() {
  const { selectedCompany } = useCompany();
  const cid      = selectedCompany?.companyId;
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const editId   = params.get('edit'); // present when editing

  const [ledgerGroups,  setLedgerGroups]  = useState([]);
  const [salesOrders,   setSalesOrders]   = useState([]);
  const [purchOrders,   setPurchOrders]   = useState([]);
  const [date,          setDate]          = useState(new Date().toISOString().slice(0, 10));
  const [narration,     setNarration]     = useState('');
  const [refNo,         setRefNo]         = useState('');
  const [journalType,   setJournalType]   = useState('office');
  const [linkedOrder,   setLinkedOrder]   = useState(null);
  const [rows,          setRows]          = useState([newRow(), newRow(), newRow()]);
  const [saving,        setSaving]        = useState(false);
  const [msg,           setMsg]           = useState({ text: '', ok: true });
  const [showOrderSearch, setShowOrderSearch] = useState(false);
  const [loadingEdit,   setLoadingEdit]   = useState(false);
  const [savedJournalId, setSavedJournalId] = useState(null);
  const [attachments,    setAttachments]    = useState([]);

  const loadLedgers = useCallback(async () => {
    if (!cid) return;
    try {
      const [{ data: accounts }, { data: clients }, { data: vendors }] = await Promise.all([
        axios.get(`/api/ledger/accounts?companyId=${cid}`),
        axios.get(`/api/clients?companyId=${cid}`),
        axios.get(`/api/vendors?companyId=${cid}`),
      ]);
      const groups = [];
      const clientNames = (clients || []).map(c => c.clientName || c.companyName).filter(Boolean).sort();
      if (clientNames.length) groups.push({ group: 'Clients', items: clientNames });
      const vendorNames = (vendors || []).map(v => v.vendorName).filter(Boolean).sort();
      if (vendorNames.length) groups.push({ group: 'Vendors', items: vendorNames });
      const ledgerMap = {};
      (accounts || []).forEach(a => {
        const g = a.groupName || 'Ledger Accounts';
        if (!ledgerMap[g]) ledgerMap[g] = [];
        ledgerMap[g].push(a.name);
      });
      Object.entries(ledgerMap).sort(([a],[b]) => a.localeCompare(b)).forEach(([group, items]) => {
        groups.push({ group, items: items.sort() });
      });
      setLedgerGroups(groups);
    } catch {}
  }, [cid]);

  const loadOrders = useCallback(async () => {
    if (!cid) return;
    try {
      const [soR, poR] = await Promise.all([
        axios.get(`/api/sales-orders?companyId=${cid}`).catch(() => ({ data: [] })),
        axios.get(`/api/purchase-orders?companyId=${cid}`).catch(() => ({ data: [] })),
      ]);
      setSalesOrders(Array.isArray(soR.data) ? soR.data : []);
      setPurchOrders(Array.isArray(poR.data) ? poR.data : []);
    } catch {}
  }, [cid]);

  /* Load existing journal for editing */
  const loadForEdit = useCallback(async () => {
    if (!cid || !editId) return;
    setLoadingEdit(true);
    try {
      const { data: j } = await axios.get(`/api/accounts/journals/${editId}?companyId=${cid}`);
      setDate(j.date || new Date().toISOString().slice(0,10));
      setNarration(j.narration || '');
      setRefNo(j.refNo || '');
      setJournalType(j.type || 'office');
      if (j.type === 'order' && j.orderId) {
        setLinkedOrder({ orderId: j.orderId, orderNo: j.orderNo || j.orderId, _orderType: j.orderLinkType || 'PO' });
      }
      if (j.entries && j.entries.length >= 2) {
        setRows(j.entries.map(e => ({ _id: _rid++, ledger: e.ledger, dr: e.debit || '', cr: e.credit || '' })));
      }
      setAttachments(j.attachments || []);
    } catch(e) {
      setMsg({ text: 'Error loading journal: ' + e.message, ok: false });
    }
    setLoadingEdit(false);
  }, [cid, editId]);

  useEffect(() => { loadLedgers(); }, [loadLedgers]);
  useEffect(() => { if (journalType === 'order') loadOrders(); }, [journalType, loadOrders]);
  useEffect(() => { loadForEdit(); }, [loadForEdit]);

  const updateRow = (id, field, val) => setRows(p => p.map(r => {
    if (r._id !== id) return r;
    if (field === 'dr') return { ...r, dr: val, cr: val ? '' : r.cr };
    if (field === 'cr') return { ...r, cr: val, dr: val ? '' : r.dr };
    return { ...r, [field]: val };
  }));
  const removeRow = id => { if (rows.length > 2) setRows(p => p.filter(r => r._id !== id)); };
  const addRow    = ()  => setRows(p => [...p, newRow()]);

  const totalDr  = rows.reduce((s, r) => s + (parseFloat(r.dr) || 0), 0);
  const totalCr  = rows.reduce((s, r) => s + (parseFloat(r.cr) || 0), 0);
  const diff     = Math.abs(totalDr - totalCr);
  const balanced = diff < 0.01 && totalDr > 0;

  const handleSubmit = async (status) => {
    if (!cid)              { setMsg({ text:'No company selected.', ok:false }); return; }
    if (!date||!narration) { setMsg({ text:'Date and Narration are required.', ok:false }); return; }
    if (journalType === 'order' && !linkedOrder) {
      setMsg({ text:'Please link a Sales Order or Purchase Order for an Order journal.', ok:false }); return;
    }
    const filled = rows.filter(r => r.ledger && (parseFloat(r.dr)||0) + (parseFloat(r.cr)||0) > 0);
    if (filled.length < 2) { setMsg({ text:'At least 2 entry rows required.', ok:false }); return; }
    if (!balanced) { setMsg({ text:`Journal not balanced — difference ₹${fmt(diff)}`, ok:false }); return; }
    try {
      setSaving(true);
      const entries = filled.map(r => ({ ledger:r.ledger, debit:parseFloat(r.dr)||0, credit:parseFloat(r.cr)||0 }));
      const payload = {
        companyId:cid, date, narration, refNo, entries,
        totalDebit:+totalDr.toFixed(2), totalCredit:+totalCr.toFixed(2), status,
        type: journalType,
        ...(journalType === 'order' && linkedOrder ? {
          orderId:       String(linkedOrder.orderId),
          orderNo:       linkedOrder.orderNo || String(linkedOrder.orderId),
          orderLinkType: linkedOrder._orderType || 'PO',
        } : {}),
      };
      if (editId) {
        await axios.put(`/api/accounts/journals/${editId}?companyId=${cid}`, payload);
        setMsg({ text:`Journal #${editId} updated successfully.`, ok:true });
      } else {
        const res = await axios.post(`/api/accounts/journals?companyId=${cid}`, payload);
        const newId = res.data.journalId;
        setSavedJournalId(newId);
        setMsg({ text:`Journal #${newId} ${status==='posted'?'posted':'saved as draft'} successfully. You can attach documents below.`, ok:true });
        setNarration(''); setRefNo(''); setLinkedOrder(null);
        setRows([newRow(), newRow(), newRow()]);
        setJournalType('office');
      }
    } catch (e) {
      setMsg({ text:'Error: '+(e.response?.data?.error||e.message), ok:false });
    } finally { setSaving(false); }
  };

  const drColor = '#1d4ed8';
  const crColor = '#7c3aed';

  if (loadingEdit) {
    return <div style={{ padding:40, textAlign:'center', fontFamily:F, color:'#9ca3af' }}>Loading journal…</div>;
  }

  return (
    <div style={{ fontFamily:F, background:'#f0f4fb', minHeight:'100%', padding:'0 0 32px 0', boxSizing:'border-box' }}>

      {/* ── Top header ── */}
      <div style={{ background:P, padding:'0 20px', display:'flex', alignItems:'center', justifyContent:'space-between', height:52 }}>
        <div style={{ display:'flex', alignItems:'center', gap:14 }}>
          <div style={{ width:36, height:36, background:'rgba(255,255,255,0.15)', borderRadius:8, display:'flex', alignItems:'center', justifyContent:'center', fontSize:18 }}>📒</div>
          <div>
            <div style={{ fontSize:9, color:'rgba(255,255,255,0.55)', textTransform:'uppercase', letterSpacing:'1px' }}>Accounts → Journal</div>
            <div style={{ fontSize:15, fontWeight:800, color:'#fff', letterSpacing:'0.3px' }}>
              {editId ? `Edit Journal #${editId}` : 'Journal Entry Voucher'}
            </div>
          </div>
        </div>
        <button onClick={() => navigate('/account/journal/view')}
          style={{ height:32, padding:'0 14px', background:'rgba(255,255,255,0.12)', border:'1px solid rgba(255,255,255,0.25)', borderRadius:6, color:'#fff', fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:F }}>
          ← View All Journals
        </button>
      </div>

      <div style={{ padding:'18px 20px 0' }}>

        {msg.text && (
          <div style={{ background:msg.ok?'#f0fdf4':'#fef2f2', border:`1px solid ${msg.ok?'#bbf7d0':'#fecaca'}`,
            borderRadius:8, padding:'10px 16px', marginBottom:14, fontSize:13,
            color:msg.ok?'#15803d':'#dc2626', fontWeight:600, display:'flex', alignItems:'center', gap:8 }}>
            <span style={{ fontSize:16 }}>{msg.ok ? '✓' : '⚠'}</span> {msg.text}
            {msg.ok && editId && (
              <button onClick={() => navigate('/account/journal/view')}
                style={{ marginLeft:'auto', height:26, padding:'0 12px', background:P, color:'#fff', border:'none', borderRadius:5, cursor:'pointer', fontSize:12, fontFamily:F }}>
                ← View All
              </button>
            )}
          </div>
        )}

        {/* ── Journal Type selector ── */}
        <div style={{ background:'#fff', border:`1px solid ${BD}`, borderRadius:10, overflow:'hidden', marginBottom:14, boxShadow:'0 1px 6px rgba(0,0,0,0.06)' }}>
          <div style={{ background:'#f8faff', borderBottom:`2px solid ${P}`, padding:'10px 16px' }}>
            <span style={{ fontSize:11, fontWeight:800, color:P, textTransform:'uppercase', letterSpacing:'0.8px' }}>Journal Type</span>
          </div>
          <div style={{ padding:'12px 16px', display:'flex', gap:10 }}>
            {JOURNAL_TYPES.map(t => (
              <button key={t.value} onClick={() => { setJournalType(t.value); if (t.value !== 'order') setLinkedOrder(null); }}
                style={{ flex:1, padding:'10px 14px', borderRadius:8, cursor:'pointer', fontFamily:F, textAlign:'left',
                  border:`2px solid ${journalType===t.value?P:BD}`,
                  background:journalType===t.value?'#eff6ff':'#fafbff' }}>
                <div style={{ fontSize:13, fontWeight:700, color:journalType===t.value?P:'#374151' }}>{t.label}</div>
                <div style={{ fontSize:11, color:'#9ca3af', marginTop:2 }}>{t.desc}</div>
              </button>
            ))}
          </div>

          {/* Order link section */}
          {journalType === 'order' && (
            <div style={{ padding:'0 16px 14px', borderTop:`1px solid ${BD}` }}>
              <div style={{ fontSize:11, fontWeight:700, color:'#374151', marginBottom:6, marginTop:10 }}>Linked Order <span style={{ color:'#dc2626' }}>*</span></div>
              <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                <div style={{ flex:1, height:36, padding:'0 12px', background:'#f8faff', border:`1px solid ${BD}`, borderRadius:6,
                  display:'flex', alignItems:'center', fontSize:12.5, color:linkedOrder?P:'#9ca3af' }}>
                  {linkedOrder
                    ? <span><strong>[{linkedOrder._orderType}]</strong> #{linkedOrder.orderId} — {linkedOrder.orderNo}</span>
                    : 'No order selected — click Search to link a SO or PO'
                  }
                </div>
                <button onClick={() => { loadOrders(); setShowOrderSearch(true); }}
                  style={{ height:36, padding:'0 14px', background:P, color:'#fff', border:'none', borderRadius:6,
                    cursor:'pointer', fontSize:12.5, fontFamily:F, fontWeight:700, whiteSpace:'nowrap' }}>
                  🔍 Search Order
                </button>
                {linkedOrder && (
                  <button onClick={() => setLinkedOrder(null)}
                    style={{ height:36, padding:'0 10px', background:'#fef2f2', color:'#dc2626', border:'1px solid #fecaca', borderRadius:6, cursor:'pointer', fontSize:13 }}>
                    ✕
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── Voucher details ── */}
        <div style={{ background:'#fff', border:`1px solid ${BD}`, borderRadius:10, overflow:'hidden', marginBottom:14, boxShadow:'0 1px 6px rgba(0,0,0,0.06)' }}>
          <div style={{ background:'#f8faff', borderBottom:`2px solid ${P}`, padding:'10px 16px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <span style={{ fontSize:11, fontWeight:800, color:P, textTransform:'uppercase', letterSpacing:'0.8px' }}>Voucher Details</span>
            <span style={{ fontSize:10.5, color:'#6b7280', fontWeight:600 }}>{selectedCompany?.companyName || ''}</span>
          </div>
          <div style={{ padding:'14px 16px', display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:14 }}>
            <div>
              <label style={{ fontSize:11, fontWeight:700, color:'#374151', marginBottom:4, display:'block' }}>Voucher Date <span style={{ color:'#dc2626' }}>*</span></label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)}
                style={{ width:'100%', height:34, padding:'0 10px', border:`1px solid ${BD}`, borderRadius:6, fontSize:13, fontFamily:F, outline:'none', background:'#fff', boxSizing:'border-box' }} />
            </div>
            <div>
              <label style={{ fontSize:11, fontWeight:700, color:'#374151', marginBottom:4, display:'block' }}>Reference No.</label>
              <input value={refNo} onChange={e => setRefNo(e.target.value)} placeholder="Voucher / Ref no."
                style={{ width:'100%', height:34, padding:'0 10px', border:`1px solid ${BD}`, borderRadius:6, fontSize:13, fontFamily:F, outline:'none', background:'#fff', boxSizing:'border-box' }} />
            </div>
            <div>
              <label style={{ fontSize:11, fontWeight:700, color:'#374151', marginBottom:4, display:'block' }}>Narration <span style={{ color:'#dc2626' }}>*</span></label>
              <input value={narration} onChange={e => setNarration(e.target.value)} placeholder="Purpose of this journal entry…"
                style={{ width:'100%', height:34, padding:'0 10px', border:`1px solid ${BD}`, borderRadius:6, fontSize:13, fontFamily:F, outline:'none', background:'#fff', boxSizing:'border-box' }} />
            </div>
          </div>
        </div>

        {/* ── Double-entry table ── */}
        <div style={{ background:'#fff', border:`1px solid ${BD}`, borderRadius:10, overflow:'hidden', marginBottom:14, boxShadow:'0 1px 6px rgba(0,0,0,0.06)' }}>
          <div style={{ background:'#f8faff', borderBottom:`2px solid ${P}`, padding:'10px 16px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <span style={{ fontSize:11, fontWeight:800, color:P, textTransform:'uppercase', letterSpacing:'0.8px' }}>Ledger Entries (Double Entry)</span>
            <button onClick={addRow}
              style={{ height:28, padding:'0 14px', background:P, border:'none', borderRadius:5, color:'#fff', fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:F }}>
              + Add Row
            </button>
          </div>

          <div style={{ padding:'8px 16px', borderBottom:`1px solid ${BD}`,
            background:balanced?'#f0fdf4':totalDr===0?'#f8faff':'#fefce8',
            display:'flex', alignItems:'center', gap:20, flexWrap:'wrap' }}>
            <div style={{ display:'flex', alignItems:'center', gap:6 }}>
              <div style={{ width:10, height:10, borderRadius:2, background:drColor }}/>
              <span style={{ fontSize:12, color:'#374151' }}>Total Debit:</span>
              <strong style={{ fontSize:13, color:drColor }}>₹{fmt(totalDr)}</strong>
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:6 }}>
              <div style={{ width:10, height:10, borderRadius:2, background:crColor }}/>
              <span style={{ fontSize:12, color:'#374151' }}>Total Credit:</span>
              <strong style={{ fontSize:13, color:crColor }}>₹{fmt(totalCr)}</strong>
            </div>
            {diff > 0.005 && (
              <div style={{ display:'flex', alignItems:'center', gap:4, color:'#dc2626' }}>
                <span style={{ fontSize:12 }}>Difference:</span>
                <strong style={{ fontSize:13 }}>₹{fmt(diff)}</strong>
              </div>
            )}
            <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:6,
              background:balanced?'#dcfce7':'#fef9c3', padding:'3px 12px', borderRadius:20,
              border:`1px solid ${balanced?'#86efac':'#fde047'}` }}>
              <span style={{ fontSize:13 }}>{balanced ? '✓' : '○'}</span>
              <span style={{ fontSize:11, fontWeight:800, color:balanced?'#15803d':'#92400e' }}>
                {balanced ? 'Balanced' : 'Not Balanced'}
              </span>
            </div>
          </div>

          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12.5, fontFamily:F }}>
              <thead>
                <tr>
                  <th style={{ padding:'9px 10px', background:'#1e3a5f', color:'#fff', fontSize:10, fontWeight:700, textAlign:'center', width:36, borderRight:'1px solid rgba(255,255,255,0.1)' }}>#</th>
                  <th style={{ padding:'9px 14px', background:'#1e3a5f', color:'#fff', fontSize:10, fontWeight:700, textAlign:'left', borderRight:'1px solid rgba(255,255,255,0.1)' }}>Particulars (Ledger Account)</th>
                  <th style={{ padding:'9px 14px', background:'#1d4ed8', color:'#fff', fontSize:10, fontWeight:700, textAlign:'right', width:160, borderRight:'1px solid rgba(255,255,255,0.15)' }}>Dr Amount (₹)</th>
                  <th style={{ padding:'9px 14px', background:'#6d28d9', color:'#fff', fontSize:10, fontWeight:700, textAlign:'right', width:160, borderRight:'1px solid rgba(255,255,255,0.1)' }}>Cr Amount (₹)</th>
                  <th style={{ padding:'9px 6px', background:'#1e3a5f', color:'#fff', fontSize:10, fontWeight:700, textAlign:'center', width:36 }}></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, idx) => {
                  const hasDr = parseFloat(r.dr) > 0;
                  const hasCr = parseFloat(r.cr) > 0;
                  const rowBg = idx%2===0?'#fff':'#fafbff';
                  return (
                    <tr key={r._id} style={{ background:rowBg }}>
                      <td style={{ padding:'6px 8px', borderBottom:`1px solid ${BD}`, borderRight:`1px solid ${BD}`, textAlign:'center', color:'#94a3b8', fontSize:11, fontWeight:600 }}>{idx+1}</td>
                      <td style={{ padding:'5px 8px', borderBottom:`1px solid ${BD}`, borderRight:`1px solid ${BD}` }}>
                        <LedgerPicker value={r.ledger} onChange={val => updateRow(r._id,'ledger',val)} groups={ledgerGroups} />
                      </td>
                      <td style={{ padding:'5px 8px', borderBottom:`1px solid ${BD}`, borderRight:`1px solid ${BD}`, background:hasDr?'#eff6ff':rowBg }}>
                        <AmtInput value={r.dr} color="dr" onChange={e => updateRow(r._id,'dr',e.target.value)} />
                      </td>
                      <td style={{ padding:'5px 8px', borderBottom:`1px solid ${BD}`, borderRight:`1px solid ${BD}`, background:hasCr?'#faf5ff':rowBg }}>
                        <AmtInput value={r.cr} color="cr" onChange={e => updateRow(r._id,'cr',e.target.value)} />
                      </td>
                      <td style={{ padding:'5px 8px', borderBottom:`1px solid ${BD}`, textAlign:'center' }}>
                        <button onClick={() => removeRow(r._id)} title="Remove row"
                          style={{ background:'none', border:'none', cursor:rows.length<=2?'not-allowed':'pointer',
                            color:rows.length<=2?'#e2e8f0':'#ef4444', fontSize:15, lineHeight:1, padding:'2px 4px', borderRadius:4 }}>✕</button>
                      </td>
                    </tr>
                  );
                })}
                <tr style={{ background:'#1e3a5f' }}>
                  <td colSpan={2} style={{ padding:'10px 16px', color:'#fff', fontSize:12, fontWeight:800, letterSpacing:'0.5px', textTransform:'uppercase' }}>Total</td>
                  <td style={{ padding:'10px 14px', textAlign:'right', borderLeft:'1px solid rgba(255,255,255,0.1)' }}>
                    <span style={{ fontSize:14, fontWeight:800, color:totalDr>0?'#93c5fd':'#475569' }}>
                      {totalDr > 0 ? `₹${fmt(totalDr)}` : '—'}
                    </span>
                  </td>
                  <td style={{ padding:'10px 14px', textAlign:'right', borderLeft:'1px solid rgba(255,255,255,0.1)' }}>
                    <span style={{ fontSize:14, fontWeight:800, color:totalCr>0?'#c4b5fd':'#475569' }}>
                      {totalCr > 0 ? `₹${fmt(totalCr)}` : '—'}
                    </span>
                  </td>
                  <td style={{ borderLeft:'1px solid rgba(255,255,255,0.1)' }}></td>
                </tr>
              </tbody>
            </table>
          </div>

          {!balanced && totalDr > 0 && diff > 0.005 && (
            <div style={{ padding:'9px 16px', background:'#fef2f2', borderTop:'1px solid #fecaca', fontSize:12, color:'#dc2626', fontWeight:600 }}>
              ⚠ Debit and Credit must be equal. Currently off by <strong>₹{fmt(diff)}</strong>. Journal cannot be posted until balanced.
            </div>
          )}
        </div>

        {/* ── Action buttons ── */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'4px 0' }}>
          <div style={{ fontSize:11, color:'#6b7280' }}>
            {rows.filter(r=>r.ledger).length} of {rows.length} rows filled
            {balanced && <span style={{ color:'#15803d', marginLeft:8, fontWeight:700 }}>— ready to post</span>}
          </div>
          <div style={{ display:'flex', gap:10 }}>
            <button onClick={() => navigate('/account/journal/view')}
              style={{ height:38, padding:'0 20px', background:'#fff', border:`1px solid ${BD}`, borderRadius:7, fontSize:13, cursor:'pointer', fontFamily:F, fontWeight:600, color:'#374151' }}>
              Cancel
            </button>
            <button onClick={() => handleSubmit('draft')} disabled={saving}
              style={{ height:38, padding:'0 22px', background:'#f59e0b', border:'none', borderRadius:7, fontSize:13, fontWeight:700, color:'#fff', cursor:'pointer', fontFamily:F }}>
              {saving ? 'Saving…' : '💾 Save Draft'}
            </button>
            <button onClick={() => handleSubmit('posted')} disabled={saving || !balanced}
              style={{ height:38, padding:'0 26px', background:balanced?P:'#94a3b8', border:'none', borderRadius:7,
                fontSize:13, fontWeight:700, color:'#fff', cursor:balanced?'pointer':'not-allowed', fontFamily:F, letterSpacing:'0.3px' }}>
              {saving ? 'Posting…' : editId ? '✓ Update Journal' : '✓ Post Journal'}
            </button>
          </div>
        </div>
      </div>

      {/* ── Doc Attachments ── */}
      {(editId || savedJournalId) && (
        <div style={{ padding:'0 20px 20px' }}>
          <DocAttachments
            entityType="journal"
            entityId={editId || savedJournalId}
            companyId={cid}
            attachments={attachments}
            onUpdate={setAttachments}
          />
        </div>
      )}

      {/* Order search popup */}
      {showOrderSearch && (
        <OrderSearchPopup
          salesOrders={salesOrders} purchaseOrders={purchOrders}
          onSelect={o => setLinkedOrder(o)}
          onClose={() => setShowOrderSearch(false)}
        />
      )}
    </div>
  );
}
