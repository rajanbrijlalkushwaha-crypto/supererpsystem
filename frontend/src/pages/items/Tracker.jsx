import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useCompany } from '../../context/CompanyContext';

const F   = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const P   = '#2F6FED';
const BD  = '#E5EAF2';
const fmt = n => (parseFloat(n)||0).toLocaleString('en-IN', { minimumFractionDigits: 2 });
const fmtD = d => { if (!d) return '—'; const dt = new Date(d); return isNaN(dt) ? d : `${String(dt.getDate()).padStart(2,'0')}-${String(dt.getMonth()+1).padStart(2,'0')}-${dt.getFullYear()}`; };

const TYPE_META = {
  so:  { label:'Sales Order',    abbr:'SO',  color:'#1565c0', bg:'#e3f2fd', border:'#90caf9',  icon:'📦' },
  po:  { label:'Purchase Order', abbr:'PO',  color:'#2e7d32', bg:'#e8f5e9', border:'#a5d6a7',  icon:'🛒' },
  exp: { label:'Expense',        abbr:'EXP', color:'#b06000', bg:'#fff3e0', border:'#ffcc80',  icon:'🧾' },
};

const calcSOTotal = (o) => {
  if (o.grandTotal) return parseFloat(o.grandTotal)||0;
  return (o.items||[]).reduce((s,it) => {
    const base = (parseFloat(it.qty||it.quantity)||0)*(parseFloat(it.rate)||0);
    return s + base + base*(parseFloat(it.gstPercent)||0)/100;
  }, 0);
};

const ItemList = ({ items=[], type }) => {
  if (!items.length) return <span style={{ color:'#aaa', fontSize:10, fontStyle:'italic' }}>No items</span>;
  const nameKey = type==='exp' ? (it => it.productName||it.itemName||it.description||'—')
                               : (it => it.itemName||it.description||it.name||'—');
  return (
    <span style={{ fontSize:10, color:'#555' }}>
      {items.slice(0,3).map((it,i) => (
        <span key={i}>
          {i>0 && <span style={{ color:'#ccc', margin:'0 3px' }}>·</span>}
          <span style={{ fontWeight:600 }}>{nameKey(it)}</span>
          {(it.qty||it.quantity) && <span style={{ color:'#888' }}> ×{it.qty||it.quantity}</span>}
        </span>
      ))}
      {items.length > 3 && <span style={{ color:'#aaa' }}> +{items.length-3} more</span>}
    </span>
  );
};

const StatusBadge = ({ status }) => {
  const sc = status==='approved'||status==='confirmed' ? { bg:'#d8f0d8', color:'#005500', border:'#a5d6a7' }
           : status==='pending' ? { bg:'#fff3e0', color:'#b06000', border:'#ffcc80' }
           : status==='draft'   ? { bg:'#f0f0f0', color:'#666',    border:'#ccc' }
           : { bg:'#fbe9e7', color:'#b71c1c', border:'#ef9a9a' };
  return (
    <span style={{ fontSize:9, fontWeight:700, padding:'1px 5px', borderRadius:3,
      background:sc.bg, color:sc.color, border:`1px solid ${sc.border}`, whiteSpace:'nowrap' }}>
      {status||'—'}
    </span>
  );
};

const TypeBadge = ({ type }) => {
  const m = TYPE_META[type];
  return (
    <span style={{ fontSize:9, fontWeight:800, padding:'2px 6px', borderRadius:3,
      background:m.bg, color:m.color, border:`1px solid ${m.border}`, whiteSpace:'nowrap' }}>
      {m.icon} {m.abbr}
    </span>
  );
};

export default function OrderTracker() {
  const { selectedCompany } = useCompany();
  const cid = selectedCompany?.companyId;

  const [salesOrders,    setSalesOrders]    = useState([]);
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [expenses,       setExpenses]       = useState([]);
  const [loading,        setLoading]        = useState(true);
  const [error,          setError]          = useState('');

  const [showSO,  setShowSO]  = useState(true);
  const [showPO,  setShowPO]  = useState(true);
  const [showExp, setShowExp] = useState(true);
  const [search,  setSearch]  = useState('');
  const [dateFrom,setDateFrom]= useState('');
  const [dateTo,  setDateTo]  = useState('');

  const load = useCallback(async () => {
    if (!cid) return;
    setLoading(true); setError('');
    try {
      const [soRes, poRes, expRes] = await Promise.all([
        axios.get(`/api/sales-orders?companyId=${cid}`).catch(() => ({ data:[] })),
        axios.get(`/api/purchase-orders?companyId=${cid}`).catch(() => ({ data:[] })),
        axios.get(`/api/accounts/expenses?companyId=${cid}`).catch(() => ({ data:[] })),
      ]);
      setSalesOrders((soRes.data||[]).filter(o => !o.tallyImported && !['draft','rejected'].includes(o.status)));
      setPurchaseOrders((poRes.data||[]).filter(o => !o.tallyImported && !['draft','rejected'].includes(o.status)));
      setExpenses(expRes.data||[]);
    } catch (e) { setError(e.message); }
    setLoading(false);
  }, [cid]);

  useEffect(() => { load(); }, [load]);

  const filterText = (row) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (row.party||row.entityName||row.projectName||row.vendorName||row.customerName||row.clientName||'').toLowerCase().includes(q)
        || (row.ref||row.orderNo||row.soNo||row.poNo||row.invoiceNo||'').toLowerCase().includes(q);
  };
  const filterDate = (d) => {
    if (dateFrom && d && d < dateFrom) return false;
    if (dateTo   && d && d > dateTo)   return false;
    return true;
  };

  /* Build display rows: SOs + linked POs + linked Expenses in groups */
  const rows = [];

  const soList = salesOrders.filter(o => {
    const d = o.orderDate||o.date||o.createdAt||'';
    return filterDate(d) && filterText({
      party: o.customerName||o.clientName||o.party||'',
      ref: o.orderNo||o.soNo||o.voucherNumber||String(o.orderId||''),
    });
  });

  soList.forEach(so => {
    const soId   = so.orderId || so.id;
    const soDate = so.orderDate||so.date||so.createdAt||'';
    const soAmt  = calcSOTotal(so);
    const soRef  = so.orderNo||so.soNo||so.voucherNumber||`SO-${soId}`;
    const soParty= so.customerName||so.clientName||so.party||'—';

    if (showSO) rows.push({ type:'so', key:`so-${soId}`, id:soId, ref:soRef, date:soDate, party:soParty, items:so.items||[], amount:soAmt, status:so.status||'approved', raw:so, isSoHeader:true });

    if (showPO) {
      purchaseOrders
        .filter(po => {
          const d = po.poDate||po.date||po.createdAt||'';
          return filterDate(d) && filterText({ party: po.vendorName||po.party||'', ref: po.poNo||po.poNumber||String(po.orderId||'') });
        })
        .slice(0, 5)
        .forEach(po => {
          const poAmt = parseFloat(po.grandTotal)||calcSOTotal(po);
          rows.push({ type:'po', key:`po-${po.orderId||po.id}-under-${soId}`, id:po.orderId||po.id, ref:po.poNo||po.poNumber||`PO-${po.orderId||po.id}`, date:po.poDate||po.date||po.createdAt||'', party:po.vendorName||po.party||'—', items:po.items||[], amount:poAmt, status:po.status||'approved', raw:po, isChild:true });
        });
    }

    if (showExp) {
      expenses
        .filter(e => {
          const d = e.date||e.createdAt||'';
          return filterDate(d) && filterText({ party: e.vendorName||'', ref: e.invoiceNo||e.projectName||String(e.expenseId||'') });
        })
        .slice(0, 3)
        .forEach(e => {
          rows.push({ type:'exp', key:`exp-${e.expenseId}-under-${soId}`, id:e.expenseId, ref:`EXP-${e.expenseId}`, date:e.date||'', party:e.vendorName||'—', items:e.items||[], amount:parseFloat(e.grandTotal||e.totalAmount)||0, status:e.status||'draft', raw:e, isChild:true });
        });
    }

    rows.push({ type:'divider', key:`div-${soId}` });
  });

  /* If no SO filter, still show standalone POs and Expenses */
  if (!showSO) {
    if (showPO) {
      purchaseOrders
        .filter(po => { const d=po.poDate||po.date||po.createdAt||''; return filterDate(d) && filterText({ party:po.vendorName||po.party||'', ref:po.poNo||String(po.orderId||'') }); })
        .forEach(po => {
          const poAmt = parseFloat(po.grandTotal)||calcSOTotal(po);
          rows.push({ type:'po', key:`po-${po.orderId||po.id}`, id:po.orderId||po.id, ref:po.poNo||po.poNumber||`PO-${po.orderId}`, date:po.poDate||po.date||po.createdAt||'', party:po.vendorName||po.party||'—', items:po.items||[], amount:poAmt, status:po.status||'approved', raw:po });
          rows.push({ type:'divider', key:`div-po-${po.orderId||po.id}` });
        });
    }
    if (showExp) {
      expenses
        .filter(e => { const d=e.date||e.createdAt||''; return filterDate(d) && filterText({ party:e.vendorName||'', ref:e.invoiceNo||String(e.expenseId||'') }); })
        .forEach(e => {
          rows.push({ type:'exp', key:`exp-${e.expenseId}`, id:e.expenseId, ref:`EXP-${e.expenseId}`, date:e.date||'', party:e.vendorName||'—', items:e.items||[], amount:parseFloat(e.grandTotal||e.totalAmount)||0, status:e.status||'draft', raw:e });
          rows.push({ type:'divider', key:`div-exp-${e.expenseId}` });
        });
    }
  }

  const totals = {
    so:  salesOrders.reduce((s,o)=>s+calcSOTotal(o),0),
    po:  purchaseOrders.reduce((s,o)=>s+(parseFloat(o.grandTotal)||calcSOTotal(o)),0),
    exp: expenses.reduce((s,e)=>s+(parseFloat(e.grandTotal||e.totalAmount)||0),0),
  };

  const toggleBtn = (active, setActive, color, bg, border, label) => (
    <button onClick={() => setActive(a => !a)}
      style={{ height:32, padding:'0 14px', fontFamily:F, fontSize:12, fontWeight:700, cursor:'pointer', borderRadius:6,
        background: active ? bg : '#fff', color: active ? color : '#888',
        border: `2px solid ${active ? border : '#ddd'}`, transition:'all 0.15s' }}>
      {active ? '✓ ' : ''}{label}
    </button>
  );

  const inpStyle = { height:32, padding:'0 10px', border:`1px solid ${BD}`, borderRadius:6, fontSize:12, fontFamily:F, outline:'none', background:'#fff' };

  return (
    <div style={{ fontFamily:F, fontSize:12, padding:8 }}>
      {/* Header */}
      <div style={{ background:P, color:'#fff', padding:'6px 12px', borderRadius:'6px 6px 0 0',
        display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
        <span style={{ fontWeight:700, fontSize:14 }}>🔗 Order Tracker — Sales → Purchase → Expense</span>
        <button onClick={load}
          style={{ height:28, padding:'0 12px', background:'rgba(255,255,255,0.15)', border:'1px solid rgba(255,255,255,0.3)',
            color:'#fff', borderRadius:5, cursor:'pointer', fontSize:12 }}>↻ Refresh</button>
      </div>

      {error && <div style={{ padding:'6px 10px', marginBottom:6, borderRadius:5, background:'#ffe0e0', color:'#880000', border:'1px solid #cc4444', fontSize:11 }}>Error: {error}</div>}

      {/* Summary cards */}
      <div style={{ display:'flex', gap:8, marginBottom:8 }}>
        {[
          { label:'Sales Orders',    val:`${salesOrders.length} orders`,    amt:totals.so,  ...TYPE_META.so  },
          { label:'Purchase Orders', val:`${purchaseOrders.length} orders`,  amt:totals.po,  ...TYPE_META.po  },
          { label:'Expenses',        val:`${expenses.length} vouchers`,      amt:totals.exp, ...TYPE_META.exp },
        ].map(c => (
          <div key={c.label} style={{ flex:1, background:c.bg, border:`1px solid ${c.border}`, borderRadius:7, padding:'6px 12px' }}>
            <div style={{ fontSize:10, color:'#666', marginBottom:1 }}>{c.icon} {c.label}</div>
            <div style={{ fontSize:13, fontWeight:700, color:c.color }}>{c.val}</div>
            <div style={{ fontSize:11, color:c.color, fontWeight:600 }}>₹{fmt(c.amt)}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ background:'#fff', border:`1px solid ${BD}`, borderRadius:7, padding:'8px 12px',
        marginBottom:8, display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
        <span style={{ fontSize:11, fontWeight:700, color:'#444' }}>Show:</span>
        {toggleBtn(showSO,  setShowSO,  TYPE_META.so.color,  TYPE_META.so.bg,  TYPE_META.so.border,  '📦 Sales Orders')}
        {toggleBtn(showPO,  setShowPO,  TYPE_META.po.color,  TYPE_META.po.bg,  TYPE_META.po.border,  '🛒 Purchase Orders')}
        {toggleBtn(showExp, setShowExp, TYPE_META.exp.color, TYPE_META.exp.bg, TYPE_META.exp.border, '🧾 Expenses')}

        <div style={{ width:1, height:24, background:BD, margin:'0 4px' }} />
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search party, ref, project…" style={{ ...inpStyle, width:180 }} />
        <label style={{ fontSize:11 }}>From:</label>
        <input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)} style={{ ...inpStyle, width:115 }} />
        <label style={{ fontSize:11 }}>To:</label>
        <input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)} style={{ ...inpStyle, width:115 }} />
        <button onClick={() => { setSearch(''); setDateFrom(''); setDateTo(''); }}
          style={{ height:32, padding:'0 12px', background:'#fff3f3', border:'1px solid #ffb3b3', color:'#880000',
            borderRadius:5, cursor:'pointer', fontFamily:F, fontSize:11, fontWeight:600 }}>✕ Clear</button>
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ padding:50, textAlign:'center', color:'#888', fontSize:13 }}>Loading orders…</div>
      ) : rows.filter(r=>r.type!=='divider').length === 0 ? (
        <div style={{ padding:40, textAlign:'center', color:'#888', fontStyle:'italic', background:'#fafafa', borderRadius:8, border:`1px solid ${BD}` }}>
          No records found. Adjust filters above.
        </div>
      ) : (
        <div style={{ border:`1px solid ${BD}`, borderRadius:8, overflow:'hidden' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
            <thead>
              <tr style={{ background:P }}>
                {['Type','Reference / ID','Date','Party / Vendor / Project','Items','Amount (₹)','Status'].map((h,i) => (
                  <th key={i} style={{ padding:'5px 8px', color:'#fff', fontWeight:700, fontSize:10,
                    textAlign:[5].includes(i)?'right':'left', whiteSpace:'nowrap', borderRight:'1px solid rgba(255,255,255,0.15)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(row => {
                if (row.type === 'divider') {
                  return (
                    <tr key={row.key}>
                      <td colSpan={7} style={{ padding:0, height:6, background:'#fff', borderBottom:`2px solid #D0DCF7` }}></td>
                    </tr>
                  );
                }
                const m = TYPE_META[row.type];
                const indent = row.isChild ? 28 : 0;
                return (
                  <tr key={row.key}
                    style={{ background: row.isSoHeader ? '#F0F7FF' : row.isChild ? '#FAFCFF' : '#fff',
                      borderLeft: row.isChild ? `3px solid ${m.border}` : 'none' }}>
                    <td style={{ padding:`4px 8px 4px ${8+indent}px`, borderBottom:'1px solid #f0f0f0', whiteSpace:'nowrap' }}>
                      <TypeBadge type={row.type} />
                    </td>
                    <td style={{ padding:`4px 8px 4px ${8+indent}px`, borderBottom:'1px solid #f0f0f0', fontFamily:'monospace', fontSize:10, fontWeight: row.isSoHeader ? 700 : 600, color: m.color }}>
                      {row.ref}
                    </td>
                    <td style={{ padding:'4px 8px', borderBottom:'1px solid #f0f0f0', whiteSpace:'nowrap' }}>{fmtD(row.date)}</td>
                    <td style={{ padding:'4px 8px', borderBottom:'1px solid #f0f0f0', fontWeight: row.isSoHeader ? 700 : 400 }}>{row.party}</td>
                    <td style={{ padding:'4px 8px', borderBottom:'1px solid #f0f0f0', maxWidth:220 }}>
                      <ItemList items={row.items} type={row.type} />
                    </td>
                    <td style={{ padding:'4px 8px', borderBottom:'1px solid #f0f0f0', textAlign:'right', fontWeight:700, color: row.isSoHeader ? '#1565c0' : m.color, fontSize: row.isSoHeader ? 12 : 11 }}>
                      ₹{fmt(row.amount)}
                    </td>
                    <td style={{ padding:'4px 8px', borderBottom:'1px solid #f0f0f0' }}>
                      <StatusBadge status={row.status} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
