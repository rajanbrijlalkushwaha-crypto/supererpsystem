import React, { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { useCompany } from '../../../context/CompanyContext';
import { withPrintFont } from '../../../utils/printFont';
import FyDropdown from '../../../components/FyDropdown';
import { useNavTheme } from '../../../utils/navTheme';

const F   = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const P   = '#3A6186';
const PD  = '#2A4D6E';
const BD  = '#E5EAF2';
const fmt = n => (parseFloat(n)||0).toFixed(2);
const fmtD = d => { if (!d) return '—'; const dt = new Date(d); return isNaN(dt) ? d : `${String(dt.getDate()).padStart(2,'0')}-${String(dt.getMonth()+1).padStart(2,'0')}-${dt.getFullYear()}`; };

const STATUS_COLOR = {
  approved:         { bg:'#d8f0d8', color:'#005500', border:'#a5d6a7' },
  pending:          { bg:'#fff3e0', color:'#b06000', border:'#ffcc80' },
  pending_approval: { bg:'#fff3e0', color:'#b06000', border:'#ffcc80' },
  rejected:         { bg:'#fbe9e7', color:'#b71c1c', border:'#ef9a9a' },
  draft:            { bg:'#f0f0f0', color:'#555',    border:'#ccc'    },
};

const getVendorDisplay = e => e.vendorName || e.vendor || e.ledgerName || '—';
/* financial year (Apr–Mar) of an ISO date, e.g. '2026-07-15' → '26-27'; no date → current FY */
const fyOf = d => {
  const t = d ? new Date(d) : new Date();
  if (isNaN(t)) return '';
  const y = t.getMonth() >= 3 ? t.getFullYear() : t.getFullYear() - 1;
  return `${String(y).slice(2)}-${String(y + 1).slice(2)}`;
};
/* material names of the sales order an expense is booked against */
const soMaterials = so => (so?.items || []).map(it => it.description || it.itemName || it.name).filter(Boolean);
const getOrderDisplay  = e => e.orderNo ? (e.clientName ? `${e.orderNo} — ${e.clientName}` : e.orderNo) : null;
const getStatusLabel   = s => s === 'pending_approval' ? 'Pending Approval' : (s || 'draft');

/* ── Print Expense Voucher ── */
function printExpenseVoucher(exp, company) {
  const sc = STATUS_COLOR[exp.status] || STATUS_COLOR.draft;
  const items = exp.items || [];
  const grandTotal = parseFloat(exp.grandTotal || exp.totalAmount || 0);
  const base = parseFloat(exp.amount || 0);
  const gstPct = parseFloat(exp.taxRate || 0);
  const gstAmt = grandTotal - base;
  const coName = company?.companyName || 'Epsilon Enterprise';
  const coAddr = [company?.address, company?.city, company?.state, company?.pincode].filter(Boolean).join(', ');

  const itemsHtml = items.map((it, i) => {
    const lb = (parseFloat(it.qty)||0) * (parseFloat(it.rate)||0);
    const lt = lb * (parseFloat(it.gstPercent)||0) / 100;
    return `<tr><td class="c">${i+1}</td><td>${it.productName||it.itemName||'—'}</td><td>${it.description||'—'}</td><td class="r">${it.qty||0}</td><td class="r">₹${(parseFloat(it.rate)||0).toFixed(2)}</td><td class="r">${it.gstPercent||0}%</td><td class="r fw">₹${(lb+lt).toFixed(2)}</td></tr>`;
  }).join('');

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>Expense Voucher — EXP-${exp.expenseId}</title>
<style>
@page{size:A4;margin:10mm 14mm;}*{box-sizing:border-box;margin:0;padding:0;}
body{font-family:'Calibri','Segoe UI',Arial,sans-serif;font-size:11pt;color:#000;}
.co-hdr{text-align:center;border-bottom:2.5px solid #3A6186;padding-bottom:8px;margin-bottom:10px;}
.co-name{font-size:18pt;font-weight:900;color:#3A6186;letter-spacing:0.3pt;}
.co-addr{font-size:9pt;color:#555;margin-top:3px;}
.doc-title{text-align:center;font-size:14pt;font-weight:900;letter-spacing:3px;text-transform:uppercase;border:1.5px solid #3A6186;padding:6px 10px;margin:0 0 10px;color:#3A6186;background:#f0f4ff;}
.info-grid{width:100%;border-collapse:collapse;margin-bottom:10px;font-size:10pt;}
.info-grid td{padding:4px 8px;border:1px solid #ddd;vertical-align:top;}
.info-grid .lbl{font-weight:700;color:#3A6186;width:120px;background:#f8faff;}
.sect-hd{font-size:10pt;font-weight:800;color:#fff;background:#3A6186;padding:4px 10px;margin:8px 0 0;text-transform:uppercase;letter-spacing:0.5px;}
.item-tbl{width:100%;border-collapse:collapse;font-size:10pt;margin-bottom:8px;}
.item-tbl thead tr{background:#3A6186;}
.item-tbl th{padding:5px 8px;color:#fff;font-weight:700;font-size:9.5pt;text-align:left;border:1px solid #2A4D6E;}
.item-tbl th.r,.item-tbl td.r{text-align:right;}.item-tbl th.c,.item-tbl td.c{text-align:center;}
.item-tbl td{padding:4px 8px;border:1px solid #ddd;}
.item-tbl tbody tr:nth-child(even) td{background:#f8faff;}
.total-row td{background:#eef4ff;font-weight:700;font-size:12pt;padding:7px 8px;border-top:2px solid #3A6186;border-bottom:2px solid #3A6186;}
.amt-box{display:flex;justify-content:flex-end;gap:36px;padding:12px 16px;border:1px solid #ddd;background:#f8faff;margin-bottom:8px;font-size:11pt;}
.sig-footer{display:flex;justify-content:space-between;margin-top:30px;padding-top:10px;border-top:2px solid #000;}
.sig-col{text-align:center;flex:1;padding:0 12px;}
.sig-name{font-size:10pt;font-weight:700;color:#3A6186;font-style:italic;min-height:16px;margin-bottom:24px;}
.sig-line{border-top:1.5px solid #000;padding-top:4px;}
.sig-label{font-size:12pt;font-weight:800;}
.sig-date{font-size:8.5pt;color:#666;margin-top:3px;}
.fw{font-weight:700;}@media print{body{margin:0;}}
</style></head><body>
<div class="co-hdr">
  <div class="co-name">${coName}</div>
  <div class="co-addr">${coAddr}</div>
  ${company?.gstin ? `<div class="co-addr">GSTIN: ${company.gstin}${company?.phone ? ' &nbsp;|&nbsp; Ph: '+company.phone : ''}</div>` : ''}
</div>
<div class="doc-title">EXPENSE VOUCHER</div>
<table class="info-grid">
  <tr>
    <td class="lbl">Voucher No.</td><td><strong>EXP-${exp.expenseId}</strong></td>
    <td class="lbl">Date</td><td>${fmtD(exp.date)}</td>
  </tr>
  <tr>
    <td class="lbl">Expense Type</td><td style="text-transform:capitalize">${exp.expenseType || '—'}</td>
    <td class="lbl">Category</td><td>${exp.expenseCategory || exp.category || '—'}</td>
  </tr>
  <tr>
    <td class="lbl">Vendor / Paid By</td><td>${getVendorDisplay(exp)}</td>
    <td class="lbl">Invoice No.</td><td>${exp.invoiceNo || '—'}</td>
  </tr>
  <tr>
    <td class="lbl">Linked Order</td><td>${getOrderDisplay(exp) || '—'}</td>
    <td class="lbl">Status</td>
    <td><span style="background:${sc.bg};color:${sc.color};padding:2px 8px;border-radius:4px;font-weight:700;font-size:9pt;border:1px solid ${sc.border}">${getStatusLabel(exp.status)}</span></td>
  </tr>
  ${exp.description ? `<tr><td class="lbl">Description</td><td colspan="3">${exp.description}</td></tr>` : ''}
  ${exp.notes ? `<tr><td class="lbl">Notes</td><td colspan="3">${exp.notes}</td></tr>` : ''}
</table>
${items.length > 0 ? `
<div class="sect-hd">Line Items</div>
<table class="item-tbl">
  <thead><tr>
    <th class="c" style="width:30px">#</th><th>Product / Item</th><th>Description</th>
    <th class="r" style="width:50px">Qty</th><th class="r" style="width:80px">Rate (₹)</th>
    <th class="r" style="width:55px">GST %</th><th class="r" style="width:90px">Amount (₹)</th>
  </tr></thead>
  <tbody>${itemsHtml}</tbody>
  <tfoot><tr class="total-row">
    <td colspan="6" style="text-align:right">GRAND TOTAL</td>
    <td style="text-align:right;color:#3A6186">₹${grandTotal.toFixed(2)}</td>
  </tr></tfoot>
</table>` : `
<div class="amt-box">
  <span>Base Amount: <strong>₹${base.toFixed(2)}</strong></span>
  ${gstAmt > 0 ? `<span>GST (${gstPct}%): <strong>₹${gstAmt.toFixed(2)}</strong></span>` : ''}
  <span style="color:#3A6186;font-weight:900;font-size:14pt">Grand Total: ₹${grandTotal.toFixed(2)}</span>
</div>`}
<div class="sig-footer">
  <div class="sig-col"><div class="sig-name">&nbsp;</div><div class="sig-line"></div><div class="sig-label">Prepared By</div><div class="sig-date">Date: ___________</div></div>
  <div class="sig-col"><div class="sig-name">&nbsp;</div><div class="sig-line"></div><div class="sig-label">Verified By</div><div class="sig-date">Date: ___________</div></div>
  <div class="sig-col"><div class="sig-name">&nbsp;</div><div class="sig-line"></div><div class="sig-label">Authorised / Manager</div><div class="sig-date">Date: ___________</div></div>
</div>
<script>window.onload = () => setTimeout(() => window.print(), 400);<\/script>
</body></html>`;

  const w = window.open('', '_blank');
  if (!w) { alert('Allow pop-ups to print the voucher.'); return; }
  w.document.write(withPrintFont(html));
  w.document.close();
}

/* ── Expanded detail row ── */
const DetailRow = ({ exp }) => {
  const items = exp.items || [];
  return (
    <tr>
      <td colSpan={12} style={{ background:'#F7FAFF', borderBottom:`1px solid ${BD}`, padding:0 }}>
        <div style={{ padding:'10px 24px 12px' }}>
          <div style={{ display:'flex', gap:20, marginBottom:8, fontSize:11, color:'#555', flexWrap:'wrap' }}>
            {getOrderDisplay(exp)   && <span><b>Order:</b> {getOrderDisplay(exp)}</span>}
            {getVendorDisplay(exp) !== '—' && <span><b>Vendor / By:</b> {getVendorDisplay(exp)}</span>}
            {exp.invoiceNo  && <span><b>Invoice No:</b> {exp.invoiceNo}</span>}
            {exp.voucherNo  && <span><b>Voucher No:</b> {exp.voucherNo}</span>}
            {exp.description && <span><b>Description:</b> {exp.description}</span>}
            {exp.notes      && <span><b>Notes:</b> {exp.notes}</span>}
          </div>
          {items.length > 0 && (
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
              <thead>
                <tr style={{ background:'#E3EAFF' }}>
                  {['#','Product','Description','Qty','Rate (₹)','GST %','Amount (₹)'].map((h,i) => (
                    <th key={i} style={{ padding:'4px 8px', textAlign:i>=3?'right':'left', fontWeight:700, fontSize:10, color:P }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((it,i) => {
                  const base = (parseFloat(it.qty)||0)*(parseFloat(it.rate)||0);
                  const tax  = base*(parseFloat(it.gstPercent)||0)/100;
                  return (
                    <tr key={i} style={{ background:i%2===0?'#fff':'#f5f8ff' }}>
                      <td style={{ padding:'3px 8px', color:'#aaa' }}>{i+1}</td>
                      <td style={{ padding:'3px 8px', fontWeight:600 }}>{it.productName||it.itemName||'—'}</td>
                      <td style={{ padding:'3px 8px', color:'#555' }}>{it.description||'—'}</td>
                      <td style={{ padding:'3px 8px', textAlign:'right' }}>{it.qty||0}</td>
                      <td style={{ padding:'3px 8px', textAlign:'right' }}>₹{fmt(it.rate)}</td>
                      <td style={{ padding:'3px 8px', textAlign:'right' }}>{it.gstPercent||0}%</td>
                      <td style={{ padding:'3px 8px', textAlign:'right', fontWeight:600, color:P }}>₹{fmt(base+tax)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={{ background:'#E3EAFF', fontWeight:700 }}>
                  <td colSpan={6} style={{ padding:'4px 8px', textAlign:'right', fontSize:11 }}>Grand Total:</td>
                  <td style={{ padding:'4px 8px', textAlign:'right', color:P, fontSize:12 }}>
                    ₹{fmt(exp.grandTotal || items.reduce((s,it)=>{ const b=(parseFloat(it.qty)||0)*(parseFloat(it.rate)||0); return s+b+b*(parseFloat(it.gstPercent)||0)/100; },0))}
                  </td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </td>
    </tr>
  );
};

export default function ViewExpenses() {
  const { selectedCompany } = useCompany();
  const cid      = selectedCompany?.companyId;
  const navigate = useNavigate();

  const [expenses,   setExpenses]   = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [msg,        setMsg]        = useState('');
  const [activeTab,  setActiveTab]  = useState('all');
  const [search,     setSearch]     = useState('');
  const [expanded,   setExpanded]   = useState(null);
  const [selExp,     setSelExp]     = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [fy,         setFy]         = useState(() => fyOf(null));
  const [sos,        setSos]        = useState([]);
  const neu = useNavTheme()[0] === 'neu';

  const load = useCallback(async () => {
    if (!cid) return;
    setLoading(true);
    try {
      const [{ data }, soRes] = await Promise.all([
        axios.get(`/api/accounts/expenses?companyId=${cid}`),
        axios.get(`/api/sales-orders?companyId=${cid}`).catch(() => ({ data: [] })),
      ]);
      setExpenses(data);
      setSos(Array.isArray(soRes.data) ? soRes.data : []);
    } catch (e) { setMsg('Error: ' + e.message); }
    setLoading(false);
  }, [cid]);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (exp) => {
    if (!window.confirm(`Delete Expense EXP-${exp.expenseId}?\nThis cannot be undone.`)) return;
    setDeletingId(exp.expenseId);
    try {
      await axios.delete(`/api/accounts/expenses/${exp.expenseId}?companyId=${cid}`);
      setMsg('Expense deleted.');
      if (selExp?.expenseId === exp.expenseId) setSelExp(null);
      load();
    } catch (e) { setMsg('Error: ' + (e.response?.data?.error || e.message)); }
    setDeletingId(null);
    setTimeout(() => setMsg(''), 3000);
  };

  const handleApprove = async (exp) => {
    try {
      await axios.put(`/api/accounts/expenses/${exp.expenseId}?companyId=${cid}`, { ...exp, status:'approved' });
      setMsg('Approved.'); load();
    } catch (e) { setMsg('Error: ' + e.message); }
    setTimeout(() => setMsg(''), 3000);
  };

  const soById = useMemo(() => {
    const m = {};
    sos.forEach(so => { if (so.orderId != null) m['id:' + so.orderId] = so; if (so.orderNo) m['no:' + so.orderNo] = so; });
    return m;
  }, [sos]);
  const materialsOf = e => soMaterials(soById['id:' + e.soId] || soById['no:' + e.orderNo]);
  const fyList = useMemo(() => {
    const set = new Set(expenses.map(e => fyOf(e.date)).filter(Boolean));
    set.add(fyOf(null));
    return ['all', ...[...set].sort().reverse()];
  }, [expenses]);
  const fyRows = fy === 'all' ? expenses : expenses.filter(e => fyOf(e.date) === fy);

  const filtered = fyRows.filter(e => {
    if (activeTab !== 'all' && e.status !== activeTab && !(activeTab === 'pending' && e.status === 'pending_approval')) return false;
    if (search) {
      const q = search.toLowerCase();
      return (e.orderNo||'').toLowerCase().includes(q)
          || (e.clientName||'').toLowerCase().includes(q)
          || (e.vendorName||'').toLowerCase().includes(q)
          || (e.vendor||'').toLowerCase().includes(q)
          || (e.ledgerName||'').toLowerCase().includes(q)
          || (e.invoiceNo||'').toLowerCase().includes(q)
          || (e.description||'').toLowerCase().includes(q)
          || materialsOf(e).some(m => m.toLowerCase().includes(q))
          || (e.expenseCategory||e.category||'').toLowerCase().includes(q)
          || String(e.expenseId).includes(q);
    }
    return true;
  });

  const totalAmt = filtered.reduce((s,e)=>s+(parseFloat(e.grandTotal||e.totalAmount)||0),0);
  const isPend = e => e.status === 'pending' || e.status === 'pending_approval';
  const cnt = {
    all:      fyRows.length,
    pending:  fyRows.filter(isPend).length,
    approved: fyRows.filter(e=>e.status==='approved').length,
  };

  const navTab = (key, icon, label) => {
    const isAct = activeTab === key;
    return (
      <button key={key} onClick={() => setActiveTab(key)}
        style={{ height:26, alignSelf:'center', padding:'0 12px', flexShrink:0,
          cursor:'pointer', fontFamily:F, fontSize:11.5, fontWeight: isAct ? 700 : 600,
          background: isAct ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.07)',
          border:`1px solid ${isAct?'rgba(255,255,255,0.55)':'rgba(255,255,255,0.22)'}`,
          boxShadow: isAct?'0 2px 6px rgba(0,0,0,0.22)':'0 1px 2px rgba(0,0,0,0.12)',
          borderRadius:6, margin:'0 4px',
          color: isAct ? '#fff' : 'rgba(255,255,255,0.85)', whiteSpace:'nowrap' }}
        onMouseEnter={e=>{if(!isAct){e.currentTarget.style.background='rgba(255,255,255,0.14)';e.currentTarget.style.borderColor='rgba(255,255,255,0.55)';}}}
        onMouseLeave={e=>{if(!isAct){e.currentTarget.style.background='rgba(255,255,255,0.07)';e.currentTarget.style.borderColor='rgba(255,255,255,0.22)';}}}>
        {icon} {label} ({cnt[key]||0})
      </button>
    );
  };

  const th = { padding:'5px 8px', background:P, color:'#fff', fontWeight:700, fontSize:10,
    textAlign:'left', whiteSpace:'nowrap', borderRight:'1px solid rgba(255,255,255,0.15)',
    position:'sticky', top:0, zIndex:2 };

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', fontFamily:F, fontSize:12 }}>

      {/* ══ Single Nav Bar ══ */}
      <div style={{ flexShrink:0, minHeight:40, background:P, borderBottom:`2px solid ${PD}`,
        display:'flex', alignItems:'stretch', flexWrap:'wrap', rowGap:6, padding:'6px 0' }}>
        <style>{`.exp-srch::placeholder{color:rgba(255,255,255,0.45)}`}</style>

        <div style={{ display:'flex', alignItems:'center', padding:'0 10px 0 12px',
          fontSize:11, fontWeight:800, color:'#fff', textTransform:'uppercase', letterSpacing:'0.8px',
          borderRight:'2px solid rgba(255,255,255,0.18)', flexShrink:0, whiteSpace:'nowrap' }}>
          🧾 Expenses
        </div>

        {navTab('all',   '📋', 'All')}
        {navTab('pending','⏳','Pending')}
        {navTab('approved','✅','Approved')}

        <div style={{ alignSelf:'center', display:'flex', alignItems:'center', flexShrink:0 }}>
          <FyDropdown value={fy} options={fyList} onChange={setFy} neu={neu} current={fyOf(null)} />
        </div>

        <div style={{ width:1, height:20, background:'rgba(255,255,255,0.2)', alignSelf:'center', margin:'0 4px', flexShrink:0 }} />

        <div style={{ position:'relative', minWidth:160, maxWidth:220, alignSelf:'center', margin:'0 6px' }}>
          <input value={search} onChange={e=>setSearch(e.target.value)}
            placeholder="Search order, vendor, invoice…" className="exp-srch"
            style={{ width:'100%', height:26, padding:'0 10px',
              border:'1px solid rgba(255,255,255,0.25)', borderRadius:5, fontSize:11, fontFamily:F,
              outline:'none', background:'rgba(255,255,255,0.12)', color:'#fff', boxSizing:'border-box' }} />
        </div>

        <span style={{ fontSize:10.5, color:'rgba(255,255,255,0.7)', alignSelf:'center', flexShrink:0, whiteSpace:'nowrap', margin:'0 6px' }}>
          {loading ? '…' : `${filtered.length} entries`}
          {!loading && <span style={{ color:'#fde68a', fontWeight:700 }}>&nbsp;₹{fmt(totalAmt)}</span>}
        </span>

        {selExp && (
          <div style={{ padding:'0 9px', height:26, alignSelf:'center', background:'#EEF4FF', border:`1px solid ${BD}`, borderRadius:5, fontSize:10.5, color:P, fontWeight:600,
            display:'flex', alignItems:'center', gap:6, flexShrink:0, marginLeft:6, whiteSpace:'nowrap' }}>
            <span>Selected: EXP-{selExp.expenseId}</span>
            <button onClick={() => { setSelExp(null); setExpanded(null); }}
              style={{ border:'none', background:'none', color:'#dc2626', cursor:'pointer', fontSize:12, fontWeight:700, padding:0 }}>✕</button>
          </div>
        )}

        {selExp && (
          <button onClick={() => printExpenseVoucher(selExp, selectedCompany)}
            style={{ height:26, padding:'0 12px', alignSelf:'center', flexShrink:0, marginLeft:4,
              cursor:'pointer', fontFamily:F, fontSize:11, fontWeight:700, borderRadius:5,
              background:'rgba(255,255,255,0.2)', color:'#fff', border:'1px solid rgba(255,255,255,0.4)', whiteSpace:'nowrap' }}>
            🖨 Print Voucher
          </button>
        )}

        <button onClick={() => navigate('/account/expense/create')}
          style={{ height:26, padding:'0 14px', alignSelf:'center', marginLeft:'auto', marginRight:8, flexShrink:0,
            cursor:'pointer', fontFamily:F, fontSize:11, fontWeight:700, borderRadius:5,
            background:'#059669', color:'#fff', border:'none', whiteSpace:'nowrap' }}>
          + New Expense
        </button>
        <button onClick={load}
          style={{ height:26, padding:'0 10px', alignSelf:'center', marginRight:8, flexShrink:0,
            cursor:'pointer', fontFamily:F, fontSize:11, fontWeight:700, borderRadius:5,
            background:'rgba(255,255,255,0.12)', color:'rgba(255,255,255,0.88)', border:'1px solid rgba(255,255,255,0.22)' }}>
          ↻
        </button>
      </div>

      {msg && (
        <div style={{ flexShrink:0, padding:'5px 10px', fontSize:11,
          background:msg.startsWith('Error')?'#ffe0e0':'#e8f5e9',
          border:`1px solid ${msg.startsWith('Error')?'#cc4444':'#66bb6a'}`,
          color:msg.startsWith('Error')?'#880000':'#1b5e20' }}>{msg}
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div style={{ flex:1, padding:40, textAlign:'center', color:'#888' }}>Loading expenses…</div>
      ) : (
        <div style={{ flex:1, overflow:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11, fontFamily:F }}>
            <thead>
              <tr>
                {['#','ID','Date','Order ID','Client Name','Material','Description','Vendor / By','Category','Amount (₹)','Status','Actions'].map((h,i) => (
                  <th key={i} style={{ ...th, textAlign: i===9 ? 'right' : 'left' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={12} style={{ padding:30, textAlign:'center', color:'#888', fontStyle:'italic' }}>No expenses found</td></tr>
              )}
              {filtered.map((e, i) => {
                const sc   = STATUS_COLOR[e.status] || STATUS_COLOR.draft;
                const isExp = expanded === e.expenseId;
                const isSel = selExp?.expenseId === e.expenseId;
                const rowBg = isSel ? '#EEF4FF' : i%2===0 ? '#fff' : '#f9fbff';
                const orderDisp = getOrderDisplay(e);
                const mats = materialsOf(e);
                return (
                  <React.Fragment key={e.expenseId}>
                    <tr
                      style={{ background:rowBg, cursor:'pointer',
                        outline: isSel ? `2px solid ${P}` : 'none', outlineOffset:-1 }}
                      onMouseEnter={ev => { if (!isSel) ev.currentTarget.style.background='#EEF4FF'; }}
                      onMouseLeave={ev => { if (!isSel) ev.currentTarget.style.background=rowBg; }}
                      onClick={() => {
                        const nowSel = !isSel;
                        setSelExp(nowSel ? e : null);
                        setExpanded(isExp && !nowSel ? null : e.expenseId);
                      }}>
                      <td style={{ padding:'4px 8px', color:'#aaa', borderBottom:'1px solid #eee' }}>
                        <span style={{ fontSize:9, marginRight:3 }}>{isExp?'▼':'▶'}</span>{i+1}
                      </td>
                      <td style={{ padding:'4px 8px', borderBottom:'1px solid #eee', fontFamily:'monospace', fontSize:10, color:'#555', whiteSpace:'nowrap' }}>EXP-{e.expenseId}</td>
                      <td style={{ padding:'4px 8px', borderBottom:'1px solid #eee', fontWeight:600, whiteSpace:'nowrap' }}>{fmtD(e.date)}</td>
                      <td style={{ padding:'4px 8px', borderBottom:'1px solid #eee', whiteSpace:'nowrap' }}>
                        {orderDisp
                          ? <span style={{ fontWeight:700, color:P, fontSize:11 }}>{e.orderNo}</span>
                          : <span style={{ color:'#bbb', fontStyle:'italic', fontSize:10 }}>{e.expenseType||'—'}</span>}
                      </td>
                      <td style={{ padding:'4px 8px', borderBottom:'1px solid #eee', fontSize:10.5, color:'#333' }}>{e.clientName||'—'}</td>
                      <td style={{ padding:'4px 8px', borderBottom:'1px solid #eee', fontSize:10.5, color:'#333' }} title={mats.join('\n')}>
                        {mats.length ? mats.map((m, k) => <div key={k}>{m}</div>) : <span style={{ color:'#bbb' }}>—</span>}
                      </td>
                      <td style={{ padding:'4px 8px', borderBottom:'1px solid #eee', fontSize:10.5, color:'#555' }}>{e.description||'—'}</td>
                      <td style={{ padding:'4px 8px', borderBottom:'1px solid #eee', fontWeight:600 }}>{getVendorDisplay(e)}</td>
                      <td style={{ padding:'4px 8px', borderBottom:'1px solid #eee', color:'#555', fontSize:10.5 }}>{e.expenseCategory||e.category||'—'}</td>
                      <td style={{ padding:'4px 8px', borderBottom:'1px solid #eee', textAlign:'right', fontWeight:700, color:P, fontSize:12 }}>
                        ₹{fmt(e.grandTotal||e.totalAmount||0)}
                      </td>
                      <td style={{ padding:'4px 8px', borderBottom:'1px solid #eee' }}>
                        <span style={{ fontSize:9, fontWeight:700, padding:'2px 6px', borderRadius:4, whiteSpace:'nowrap',
                          background:sc.bg, color:sc.color, border:`1px solid ${sc.border}` }}>
                          {getStatusLabel(e.status)}
                        </span>
                      </td>
                      <td style={{ padding:'4px 8px', borderBottom:'1px solid #eee' }} onClick={ev=>ev.stopPropagation()}>
                        <div style={{ display:'flex', gap:4 }}>
                          <button onClick={() => navigate(`/account/expense/edit/${e.expenseId}`)}
                            style={{ height:24, padding:'0 8px', fontSize:10, fontWeight:700, cursor:'pointer',
                              background:'#EEF4FF', border:`1px solid ${BD}`, color:P, borderRadius:4, fontFamily:F }}>✏️</button>
                          {isPend(e) && (
                            <button onClick={() => handleApprove(e)}
                              style={{ height:24, padding:'0 8px', fontSize:10, fontWeight:700, cursor:'pointer',
                                background:'#e8f5e9', border:'1px solid #a5d6a7', color:'#1b5e20', borderRadius:4, fontFamily:F }}>✅</button>
                          )}
                          <button onClick={() => handleDelete(e)} disabled={deletingId===e.expenseId}
                            style={{ height:24, padding:'0 8px', fontSize:10, fontWeight:700, cursor:'pointer',
                              background:'#fff3f3', border:'1px solid #ffb3b3', color:'#cc0000', borderRadius:4, fontFamily:F,
                              opacity:deletingId===e.expenseId?0.5:1 }}>
                            {deletingId===e.expenseId?'…':'🗑'}
                          </button>
                        </div>
                      </td>
                    </tr>
                    {isExp && <DetailRow exp={e} />}
                  </React.Fragment>
                );
              })}
            </tbody>
            <tfoot>
              <tr style={{ background:'#F0F4FF', fontWeight:700 }}>
                <td colSpan={9} style={{ padding:'5px 8px', textAlign:'right', fontSize:11 }}>Total ({filtered.length}):</td>
                <td style={{ padding:'5px 8px', textAlign:'right', color:P, fontSize:13 }}>₹{fmt(totalAmt)}</td>
                <td colSpan={2}></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
