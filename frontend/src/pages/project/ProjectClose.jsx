import React, { useEffect, useState, useCallback, useMemo } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { useCompany } from '../../context/CompanyContext';

const F  = "'Inter', -apple-system, BlinkMacSystemFont, sans-serif";
const TC = '#104f4f';   // teal
const PC = '#4c1d95';   // purple
const AC = '#7c2d12';   // amber/brown for expenses
const BD = '#e2e8f0';

const fmt   = n => (parseFloat(n)||0).toFixed(2);
const fmtD  = d => {
  if (!d) return '—';
  const dt = new Date(d);
  return isNaN(dt) ? d : `${String(dt.getDate()).padStart(2,'0')}-${String(dt.getMonth()+1).padStart(2,'0')}-${dt.getFullYear()}`;
};

/* ── Pill badge ── */
const Pill = ({ ok, label, val, green = false }) => {
  /* green=true → receivable (client dues); false → payable (vendor dues) */
  const pendFg = green ? '#16a34a' : '#c2410c';
  const pendBg = green ? '#f0fdf4' : '#fff7ed';
  const pendBd = green ? '#86efac' : '#fed7aa';
  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:2,
      background: ok ? '#f0fdf4' : pendBg,
      border: `1px solid ${ok ? '#86efac' : pendBd}`,
      borderRadius:8, padding:'6px 12px', minWidth:110 }}>
      <span style={{ fontSize:9, fontWeight:700, color: ok ? '#15803d' : pendFg,
        textTransform:'uppercase', letterSpacing:'0.5px' }}>
        {label}
      </span>
      <span style={{ fontSize:12, fontWeight:800, color: ok ? '#15803d' : pendFg }}>
        {val}
      </span>
      <span style={{ fontSize:9, color: ok ? '#16a34a' : pendFg }}>
        {ok ? 'Cleared' : 'Pending'}
      </span>
    </div>
  );
};

/* ── Print report ── */
function printReport(so, pos, expenses, clientDue, vendorDues, companyName) {
  const soTotal   = parseFloat(so.grandTotal || 0);
  const received  = parseFloat(clientDue?.received || clientDue?.paymentsReceived || 0);
  const poTotal   = pos.reduce((s,p) => s + (parseFloat(p.grandTotal)||0), 0);
  const expTotal  = expenses.reduce((s,e) => s + (parseFloat(e.grandTotal||e.amount)||0), 0);
  const revenue   = soTotal;
  const cogs      = poTotal;
  const profit    = revenue - cogs - expTotal;

  const thS = `border:1px solid #ccc;padding:5px 8px;background:#104f4f;color:#fff;font-size:10px;font-weight:700;text-align:left;`;
  const tdS = `border:1px solid #ddd;padding:4px 8px;font-size:10px;`;
  const tdR = `border:1px solid #ddd;padding:4px 8px;font-size:10px;text-align:right;`;

  const itemRows = (items=[]) => items.map((it,i) => `
    <tr style="background:${i%2===0?'#fff':'#f8faff'}">
      <td style="${tdS}">${i+1}</td>
      <td style="${tdS}">${it.itemName||it.description||it.name||'—'}</td>
      <td style="${tdR}">${parseFloat(it.qty||it.quantity)||0}</td>
      <td style="${tdS}">${it.unit||'NOS'}</td>
      <td style="${tdR}">₹${fmt(parseFloat(it.rate)||0)}</td>
      <td style="${tdR}">${parseFloat(it.gst||it.gstPercent)||0}%</td>
      <td style="${tdR}">₹${fmt((parseFloat(it.qty||1))*(parseFloat(it.rate)||0))}</td>
    </tr>`).join('');

  const poSection = pos.map((p,pi) => {
    const due = vendorDues.find(d => String(d.orderId)===String(p.orderId) || d.orderNo===p.poNo);
    return `
    <h4 style="margin:14px 0 4px;color:#7c2d12;font-size:11px;">PO ${pi+1}: ${p.poNo||p.poNumber||`#${p.orderId}`} — ${p.vendorName||'—'}</h4>
    <table style="width:100%;border-collapse:collapse;margin-bottom:6px;">
      <thead><tr>
        <th style="${thS.replace('#104f4f','#7c2d12')}">#</th>
        <th style="${thS.replace('#104f4f','#7c2d12')}">Description</th>
        <th style="${thS.replace('#104f4f','#7c2d12')}">Qty</th>
        <th style="${thS.replace('#104f4f','#7c2d12')}">Unit</th>
        <th style="${thS.replace('#104f4f','#7c2d12')}">Rate</th>
        <th style="${thS.replace('#104f4f','#7c2d12')}">GST</th>
        <th style="${thS.replace('#104f4f','#7c2d12')}">Amount</th>
      </tr></thead>
      <tbody>${itemRows(p.items||[])}</tbody>
      <tfoot>
        <tr style="background:#fff8f0;font-weight:700;">
          <td colspan="6" style="${tdS}">PO Grand Total</td>
          <td style="${tdR};font-weight:800;">₹${fmt(p.grandTotal||0)}</td>
        </tr>
        <tr style="background:#fff8f0;">
          <td colspan="6" style="${tdS}">Paid to Vendor</td>
          <td style="${tdR};color:#15803d;">₹${fmt(due?.paid||due?.totalPaid||0)}</td>
        </tr>
      </tfoot>
    </table>`;
  }).join('');

  const expRows = expenses.map((e,i) => `
    <tr style="background:${i%2===0?'#fff':'#fff8f0'}">
      <td style="${tdS}">${i+1}</td>
      <td style="${tdS}">${fmtD(e.date||e.expenseDate||e.createdAt)}</td>
      <td style="${tdS}">${e.expenseCategory||e.category||'—'}</td>
      <td style="${tdS}">${e.description||'—'}</td>
      <td style="${tdS}">${e.vendor||'—'}</td>
      <td style="${tdR}">₹${fmt(e.grandTotal||e.amount||0)}</td>
      <td style="${tdS}">${e.status||'—'}</td>
    </tr>`).join('');

  const plRows = [
    ['Revenue (SO Value)',    `₹${fmt(revenue)}`,  '#1f2937'],
    ['Cost of Goods (POs)',   `₹${fmt(cogs)}`,     '#7c2d12'],
    ['Other Expenses',        `₹${fmt(expTotal)}`, '#b45309'],
    ['Net Profit / Loss',     `₹${fmt(profit)}`,   profit>=0?'#15803d':'#dc2626'],
  ].map(([l,v,c]) => `<tr>
    <td style="padding:6px 10px;border:1px solid #ddd;font-size:11px;font-weight:600;">${l}</td>
    <td style="padding:6px 10px;border:1px solid #ddd;font-size:12px;font-weight:800;text-align:right;color:${c};">${v}</td>
  </tr>`).join('');

  const html = `<!DOCTYPE html><html><head>
    <meta charset="utf-8">
    <title>Project Close Report — ${so.orderNo||so.orderId}</title>
    <style>
      *{box-sizing:border-box;font-family:'Inter',Arial,sans-serif;margin:0;padding:0}
      body{padding:20px;color:#1f2937;font-size:10px;background:#fff;}
      h3{font-size:13px;color:#104f4f;border-bottom:2px solid #104f4f;padding-bottom:4px;margin-bottom:10px;}
      h4{font-size:11px;margin-bottom:4px;}
      .sig{border-top:1px solid #666;width:180px;margin-top:30px;padding-top:4px;font-size:9px;color:#555;}
      @media print{body{padding:6px;} .noprint{display:none}}
    </style>
  </head><body>
    <div style="border-bottom:3px solid #104f4f;padding-bottom:8px;margin-bottom:14px;display:flex;justify-content:space-between;align-items:flex-end;">
      <div>
        <div style="font-size:16px;font-weight:800;color:#104f4f;">${companyName||'Company'}</div>
        <div style="font-size:11px;color:#6b7280;margin-top:2px;">Project Close Report</div>
      </div>
      <div style="text-align:right;font-size:10px;color:#6b7280;">
        Generated: ${fmtD(new Date().toISOString())}
      </div>
    </div>

    <!-- SO Overview -->
    <h3>Sales Order</h3>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:8px;margin-bottom:12px;">
      ${[
        ['Order No', so.orderNo||'—'],
        ['Client', so.customerName||so.clientName||'—'],
        ['Order Date', fmtD(so.orderDate)],
        ['Delivery Date', fmtD(so.deliveryDate||so.dueDate||'')],
        ['Grand Total', `₹${fmt(so.grandTotal||0)}`],
        ['Received', `₹${fmt(received)}`],
        ['Outstanding', `₹${fmt(Math.max(0,soTotal-received))}`],
        ['Status', so.status||'—'],
      ].map(([l,v])=>`<div style="background:#f0fdf4;border:1px solid #86efac;border-radius:5px;padding:6px 8px;">
        <div style="font-size:8px;color:#6b7280;text-transform:uppercase;">${l}</div>
        <div style="font-size:11px;font-weight:700;color:#104f4f;margin-top:1px;">${v}</div>
      </div>`).join('')}
    </div>

    <table style="width:100%;border-collapse:collapse;margin-bottom:14px;">
      <thead><tr>
        <th style="${thS}">#</th>
        <th style="${thS}">Description</th>
        <th style="${thS}">Qty</th>
        <th style="${thS}">Unit</th>
        <th style="${thS}">Rate</th>
        <th style="${thS}">GST</th>
        <th style="${thS}">Amount</th>
      </tr></thead>
      <tbody>${itemRows(so.items||[])}</tbody>
      <tfoot>
        <tr style="background:#e0f2fe;font-weight:800;">
          <td colspan="6" style="${tdS}">Grand Total</td>
          <td style="${tdR}">₹${fmt(so.grandTotal||0)}</td>
        </tr>
      </tfoot>
    </table>

    <!-- Purchase Orders -->
    <h3>Purchase Orders (${pos.length})</h3>
    ${pos.length===0 ? '<p style="color:#9ca3af;font-style:italic;margin-bottom:12px;">No linked purchase orders</p>' : poSection}

    <!-- Expenses -->
    <h3 style="margin-top:16px;">Expenses (${expenses.length})</h3>
    ${expenses.length===0
      ? '<p style="color:#9ca3af;font-style:italic;margin-bottom:12px;">No linked expenses</p>'
      : `<table style="width:100%;border-collapse:collapse;margin-bottom:14px;">
          <thead><tr>
            <th style="${thS.replace('#104f4f','#b45309')}">#</th>
            <th style="${thS.replace('#104f4f','#b45309')}">Date</th>
            <th style="${thS.replace('#104f4f','#b45309')}">Category</th>
            <th style="${thS.replace('#104f4f','#b45309')}">Description</th>
            <th style="${thS.replace('#104f4f','#b45309')}">Vendor</th>
            <th style="${thS.replace('#104f4f','#b45309')}">Amount</th>
            <th style="${thS.replace('#104f4f','#b45309')}">Status</th>
          </tr></thead>
          <tbody>${expRows}</tbody>
          <tfoot>
            <tr style="background:#fff8f0;font-weight:800;">
              <td colspan="5" style="${tdS}">Total Expenses</td>
              <td style="${tdR}">₹${fmt(expTotal)}</td>
              <td style="${tdS}"></td>
            </tr>
          </tfoot>
        </table>`}

    <!-- P&L -->
    <h3 style="margin-top:16px;">Profit &amp; Loss Summary</h3>
    <table style="width:320px;border-collapse:collapse;margin-bottom:20px;">
      <tbody>${plRows}</tbody>
    </table>

    <!-- Signatures -->
    <div style="display:flex;gap:60px;margin-top:40px;padding-top:10px;">
      <div><div class="sig">Generated by</div></div>
      <div><div class="sig">Checked by</div></div>
      <div><div class="sig">Authorised by</div></div>
    </div>

    <script>window.onload=()=>{ window.print(); }</script>
  </body></html>`;

  const w = window.open('', '_blank', 'width=1100,height=800');
  w.document.write(html);
  w.document.close();
}

/* ════════════════════════════════════════
   MAIN COMPONENT
════════════════════════════════════════ */
export default function ProjectClose() {
  const { selectedCompany } = useCompany();
  const cid = selectedCompany?.companyId;
  const navigate = useNavigate();
  const companyName = selectedCompany?.companyName || selectedCompany?.name || 'Company';

  const [salesOrders,  setSalesOrders]  = useState([]);
  const [purchOrders,  setPurchOrders]  = useState([]);
  const [clientDues,   setClientDues]   = useState([]);
  const [vendorDues,   setVendorDues]   = useState([]);
  const [expenses,     setExpenses]     = useState([]);
  const [loading,      setLoading]      = useState(false);
  const [search,       setSearch]       = useState('');
  const [filter,       setFilter]       = useState('all'); // all | open | closed
  const [expanded,     setExpanded]     = useState({});
  const [saving,       setSaving]       = useState({});
  const [reporting,    setReporting]    = useState({});

  const load = useCallback(async () => {
    if (!cid) return;
    setLoading(true);
    try {
      const [soR, poR, duesR, expR] = await Promise.all([
        axios.get(`/api/sales-orders?companyId=${cid}`).catch(()=>({data:[]})),
        axios.get(`/api/purchase-orders?companyId=${cid}`).catch(()=>({data:[]})),
        axios.get(`/api/accounts/dues?companyId=${cid}`).catch(()=>({data:{}})),
        axios.get(`/api/accounts/expenses?companyId=${cid}`).catch(()=>({data:[]})),
      ]);
      setSalesOrders(Array.isArray(soR.data) ? soR.data : []);
      setPurchOrders(Array.isArray(poR.data) ? poR.data : []);
      const duesData = duesR.data || {};
      setClientDues(Array.isArray(duesData.clientDues) ? duesData.clientDues : (Array.isArray(duesData) ? duesData : []));
      setVendorDues(Array.isArray(duesData.vendorDues) ? duesData.vendorDues : []);
      setExpenses(Array.isArray(expR.data) ? expR.data : []);
    } catch(e) { console.error(e); }
    setLoading(false);
  }, [cid]);

  useEffect(() => { load(); }, [load]);

  /* ── helpers ── */
  const linkedPOs = soId =>
    purchOrders.filter(p =>
      String(p.linkedSalesOrderId)===String(soId) ||
      String(p.salesOrderId)===String(soId) ||
      String(p.soRef)===String(soId)
    );

  const getSODue = so =>
    (Array.isArray(clientDues) ? clientDues : [])
      .find(d => String(d.orderId)===String(so.orderId) || d.orderNo===so.orderNo);

  const getPODue = po =>
    po && (Array.isArray(vendorDues) ? vendorDues : [])
      .find(d => String(d.orderId)===String(po.orderId) || d.orderNo===po.poNo);

  const soExpenses = soId =>
    expenses.filter(e =>
      String(e.orderId)===String(soId) ||
      String(e.salesOrderId)===String(soId) ||
      String(e.soId)===String(soId)
    );

  /* ── Close conditions per SO ── */
  const getConditions = so => {
    const soDue   = getSODue(so);
    const soTotal = parseFloat(so.grandTotal) || 0;
    const received = parseFloat(soDue?.received || soDue?.paymentsReceived || 0);
    const clientBal = soTotal > 0 ? Math.max(0, soTotal - received) : (parseFloat(soDue?.due || soDue?.balance) || 0);
    const clientOk = clientBal <= 0.5;

    const pos       = linkedPOs(so.orderId);
    const posDue    = pos.map(p => {
      const d = getPODue(p);
      return parseFloat(d?.due || d?.balance) || 0;
    });
    const vendorOk  = pos.length === 0 || posDue.every(b => b <= 0.5);
    const totalPODue = posDue.reduce((s,v)=>s+v, 0);

    const exps       = soExpenses(so.orderId);
    const unpaidExps = exps.filter(e => (e.status||'').toLowerCase() !== 'paid');
    const expOk      = unpaidExps.length === 0;

    return { clientOk, clientBal, vendorOk, totalPODue, expOk, unpaidExps: unpaidExps.length,
             canClose: clientOk && vendorOk && expOk, pos, exps, soDue, received };
  };

  /* ── Toggle close ── */
  const toggleClose = async (so, canClose) => {
    if (so.status !== 'closed' && !canClose) return;
    const newStatus = so.status === 'closed' ? 'approved' : 'closed';
    setSaving(s => ({ ...s, [so.orderId]: true }));
    try {
      await axios.put(`/api/sales-orders/${so.orderId}`, { ...so, status: newStatus }, { params: { companyId: cid } });
      setSalesOrders(ps => ps.map(o => o.orderId===so.orderId ? { ...o, status: newStatus } : o));
    } catch(e) {
      alert('Failed to update status: ' + (e.response?.data?.error || e.message));
    }
    setSaving(s => ({ ...s, [so.orderId]: false }));
  };

  /* ── Generate report ── */
  const generateReport = async (so, conds) => {
    setReporting(r => ({ ...r, [so.orderId]: true }));
    const pos = conds.pos;
    const exps = conds.exps;
    printReport(so, pos, exps, conds.soDue, vendorDues, companyName);
    setReporting(r => ({ ...r, [so.orderId]: false }));
  };

  /* ── Filtered list ── */
  const filtered = useMemo(() => {
    let list = salesOrders;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(o =>
        (o.customerName||o.clientName||'').toLowerCase().includes(q) ||
        (o.orderNo||'').toLowerCase().includes(q) ||
        String(o.orderId).includes(q)
      );
    }
    if (filter === 'open')   list = list.filter(o => o.status !== 'closed');
    if (filter === 'closed') list = list.filter(o => o.status === 'closed');
    return list;
  }, [salesOrders, search, filter]);

  const closedCount = salesOrders.filter(o=>o.status==='closed').length;
  const openCount   = salesOrders.length - closedCount;

  /* ── Section header renderer ── */
  const SH = ({ col, children }) => (
    <div style={{ fontSize:9.5, fontWeight:800, color:'#fff', textTransform:'uppercase',
      letterSpacing:'0.6px', background:col, borderRadius:4, padding:'2px 8px',
      display:'inline-block', marginBottom:6 }}>{children}</div>
  );

  const P = '#1a4a9a';
  return (
    <div style={{ fontFamily:F, background:'#f1f5f9', minHeight:'100vh' }}>

      {/* ── FINACLE-STYLE COMPACT TOOLBAR ── */}
      <div style={{
        background:'#f0f2f5', borderBottom:'1px solid #c0c4cc',
        padding:'3px 8px', display:'flex', alignItems:'center',
        flexWrap:'nowrap', overflowX:'auto', minHeight:36, gap:0,
      }}>
        <span style={{ fontWeight:800, fontSize:13, color:P, paddingRight:8,
          borderRight:'1px solid #bbb', marginRight:6, whiteSpace:'nowrap', flexShrink:0 }}>
          PROJECT
        </span>
        <button onClick={()=>navigate('/project/list')} style={{
          height:28, padding:'0 12px', fontSize:12, cursor:'pointer', whiteSpace:'nowrap', flexShrink:0,
          fontFamily:F, fontWeight:400, position:'relative',
          background:'#e4e8ed', border:'1px solid #c8c8c8',
          borderBottom:'1px solid #c8c8c8',
          color:'#555', zIndex:0, marginBottom:0, borderRadius:'3px 3px 0 0',
        }}>Jobcodes</button>
        <button onClick={()=>navigate('/project/close')} style={{
          height:28, padding:'0 12px', fontSize:12, cursor:'pointer', whiteSpace:'nowrap', flexShrink:0,
          fontFamily:F, fontWeight:700, position:'relative', marginRight:8,
          background:'#fff', border:'1px solid #aaa',
          borderBottom:'1px solid #f0f2f5',
          color:P, zIndex:1, marginBottom:-1, borderRadius:'3px 3px 0 0',
        }}>Project Close</button>
        <div style={{ flex:1 }}/>
        <input
          placeholder="Search by order no, client…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ height:26, padding:'0 8px', border:'1px solid #bbb', borderRadius:3,
            fontSize:11, fontFamily:F, outline:'none', width:220, background:'#fff',
            marginRight:4, flexShrink:0 }}
        />
        <button onClick={load}
          style={{ height:26, padding:'0 8px', background:'#fff', flexShrink:0,
            border:'1px solid #bbb', borderRadius:3, cursor:'pointer', fontSize:13 }}>↻</button>
      </div>

      {/* Controls — filter buttons only */}
      <div style={{ background:'#fff', borderBottom:`1px solid ${BD}`, padding:'6px 12px',
        display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
        {[
          ['all',    `All (${salesOrders.length})`],
          ['open',   `Open (${openCount})`],
          ['closed', `Closed (${closedCount})`],
        ].map(([f,l]) => (
          <button key={f} onClick={() => setFilter(f)}
            style={{ height:32, padding:'0 14px', borderRadius:6, border:`1px solid ${filter===f?TC:BD}`,
              background:filter===f?TC:'transparent', color:filter===f?'#fff':'#374151',
              fontSize:12, fontWeight:filter===f?700:400, cursor:'pointer', fontFamily:F }}>
            {l}
          </button>
        ))}
      </div>

      {/* Condition legend */}
      <div style={{ background:'#fffbeb', borderBottom:'1px solid #fcd34d', padding:'8px 18px',
        display:'flex', gap:20, alignItems:'center', flexWrap:'wrap' }}>
        <span style={{ fontSize:11, fontWeight:700, color:'#b45309' }}>Close requires:</span>
        {[
          ['Client Due = 0', 'All receipts received from client'],
          ['Vendor Paid', 'All PO payments made to vendors'],
          ['Expenses Paid', 'All linked expenses are paid'],
        ].map(([s,d]) => (
          <div key={s} style={{ display:'flex', alignItems:'center', gap:5 }}>
            <div style={{ width:7, height:7, borderRadius:'50%', background:'#059669' }}/>
            <span style={{ fontSize:10.5, color:'#374151' }}><b>{s}</b> — {d}</span>
          </div>
        ))}
      </div>

      <div style={{ padding:'14px 16px', display:'flex', flexDirection:'column', gap:10 }}>
        {filtered.length === 0 && !loading && (
          <div style={{ background:'#fff', border:`1px solid ${BD}`, borderRadius:10,
            padding:'40px', textAlign:'center', color:'#9ca3af', fontSize:13 }}>
            No jobcodes found.
          </div>
        )}

        {filtered.map(so => {
          const conds   = getConditions(so);
          const isOpen  = expanded[so.orderId];
          const isSaving = saving[so.orderId];
          const isRep   = reporting[so.orderId];
          const isClosed = so.status === 'closed';

          return (
            <div key={so.orderId}
              style={{ background:'#fff', border:`1px solid ${isClosed?'#d1d5db':BD}`,
                borderRadius:10, overflow:'hidden',
                boxShadow:'0 1px 4px rgba(0,0,0,0.05)', opacity:isClosed?0.85:1 }}>

              {/* Main row */}
              <div style={{ display:'flex', alignItems:'center', gap:12,
                padding:'12px 16px', background:isClosed?'#f9fafb':'#fff',
                borderLeft:`4px solid ${isClosed?'#6b7280':conds.canClose?'#059669':'#f59e0b'}` }}>

                {/* Status dot */}
                <div style={{ width:10, height:10, borderRadius:'50%', flexShrink:0,
                  background: isClosed ? '#6b7280' : conds.canClose ? '#059669' : '#f59e0b' }}/>

                {/* SO info */}
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:13, fontWeight:700, color:isClosed?'#6b7280':'#111',
                    display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                    {so.orderNo || `SO #${so.orderId}`}
                    <span style={{ fontSize:11, fontWeight:400, color:'#6b7280' }}>
                      {so.customerName || so.clientName || '—'}
                    </span>
                    {isClosed && (
                      <span style={{ fontSize:9.5, background:'#e5e7eb', color:'#6b7280',
                        padding:'1px 7px', borderRadius:4, fontWeight:700 }}>CLOSED</span>
                    )}
                    {!isClosed && conds.canClose && (
                      <span style={{ fontSize:9.5, background:'#dcfce7', color:'#15803d',
                        padding:'1px 7px', borderRadius:4, fontWeight:700 }}>READY TO CLOSE</span>
                    )}
                  </div>
                  <div style={{ fontSize:10.5, color:'#9ca3af', marginTop:2, display:'flex', gap:10, flexWrap:'wrap' }}>
                    <span>Date: {fmtD(so.orderDate)}</span>
                    <span>Value: ₹{fmt(so.grandTotal||0)}</span>
                    <span>{conds.pos.length} PO · {conds.exps.length} Expense{conds.exps.length!==1?'s':''}</span>
                  </div>
                </div>

                {/* Condition pills */}
                <div style={{ display:'flex', gap:6, flexShrink:0, flexWrap:'wrap' }}>
                  <Pill ok={conds.clientOk} label="Client Due" green
                    val={conds.clientOk ? '₹0' : `₹${fmt(conds.clientBal)}`} />
                  <Pill ok={conds.vendorOk} label="Vendor Paid"
                    val={conds.vendorOk ? 'All Clear' : `₹${fmt(conds.totalPODue)} due`} />
                  <Pill ok={conds.expOk}   label="Expenses"
                    val={conds.expOk ? 'All Paid' : `${conds.unpaidExps} unpaid`} />
                </div>

                {/* Buttons */}
                <div style={{ display:'flex', gap:6, flexShrink:0 }}>
                  <button
                    onClick={() => setExpanded(e => ({ ...e, [so.orderId]: !isOpen }))}
                    style={{ padding:'5px 12px', border:`1px solid ${BD}`, borderRadius:6,
                      background:'#f8faff', fontSize:11.5, cursor:'pointer', fontFamily:F, color:'#374151' }}>
                    {isOpen ? 'Hide ▲' : 'Details ▼'}
                  </button>
                  <button
                    disabled={isRep}
                    onClick={() => generateReport(so, conds)}
                    style={{ padding:'5px 12px', border:`1px solid #2563eb`, borderRadius:6,
                      background:'#eff6ff', fontSize:11.5, cursor:'pointer', fontFamily:F,
                      color:'#2563eb', fontWeight:600, opacity:isRep?0.6:1 }}>
                    {isRep ? '…' : 'Print Report'}
                  </button>
                  <button
                    disabled={isSaving || (!isClosed && !conds.canClose)}
                    onClick={() => toggleClose(so, conds.canClose)}
                    title={!isClosed && !conds.canClose ? 'Cannot close: pending dues/expenses' : ''}
                    style={{ padding:'5px 14px', border:'none', borderRadius:6,
                      background: isClosed ? '#059669' : conds.canClose ? '#dc2626' : '#e2e8f0',
                      color: isClosed ? '#fff' : conds.canClose ? '#fff' : '#9ca3af',
                      fontSize:11.5, fontWeight:700,
                      cursor: (isSaving || (!isClosed && !conds.canClose)) ? 'not-allowed' : 'pointer',
                      fontFamily:F, opacity:isSaving?0.6:1 }}>
                    {isSaving ? '…' : isClosed ? 'Re-open' : 'Close Project'}
                  </button>
                </div>
              </div>

              {/* Expanded detail */}
              {isOpen && (
                <div style={{ borderTop:`1px solid ${BD}`, padding:'14px 16px', background:'#fafbff' }}>

                  {/* Sales Order financial */}
                  <SH col={TC}>Sales Order Details</SH>
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:6, marginBottom:12 }}>
                    {[
                      ['Order No',   so.orderNo||'—',              '#104f4f'],
                      ['Client',     so.customerName||so.clientName||'—', '#104f4f'],
                      ['Order Date', fmtD(so.orderDate),            '#104f4f'],
                      ['Due Date',   fmtD(so.deliveryDate||so.dueDate), '#104f4f'],
                      ['Sub Total',  `₹${fmt(so.subTotal||0)}`,    '#104f4f'],
                      ['Total GST',  `₹${fmt(so.totalGST||0)}`,    '#104f4f'],
                      ['Grand Total',`₹${fmt(so.grandTotal||0)}`,  '#104f4f'],
                      ['Received',   `₹${fmt(conds.received)}`,    '#104f4f'],
                    ].map(([l,v,c])=>(
                      <div key={l} style={{ background:'#f0fdf4', border:'1px solid #86efac',
                        borderRadius:6, padding:'5px 9px' }}>
                        <div style={{ fontSize:8.5, color:'#6b7280', textTransform:'uppercase' }}>{l}</div>
                        <div style={{ fontSize:11, fontWeight:700, color:c, marginTop:1 }}>{v}</div>
                      </div>
                    ))}
                  {/* Client Balance Due — green bold (receivable) */}
                  <div style={{ background: conds.clientBal > 0 ? '#f0fdf4' : '#f9fafb',
                    border: `1px solid ${conds.clientBal > 0 ? '#16a34a' : '#d1d5db'}`,
                    borderRadius:6, padding:'5px 9px' }}>
                    <div style={{ fontSize:8.5, color:'#6b7280', textTransform:'uppercase' }}>Balance Due (Client)</div>
                    <div style={{ fontSize:13, fontWeight:800, color: conds.clientBal > 0 ? '#16a34a' : '#6b7280', marginTop:1 }}>
                      {conds.clientBal > 0 ? `₹${fmt(conds.clientBal)}` : '✓ Cleared'}
                    </div>
                  </div>
                  </div>

                  {/* Linked POs */}
                  <SH col={AC}>Purchase Orders ({conds.pos.length})</SH>
                  {conds.pos.length === 0
                    ? <div style={{ fontSize:11, color:'#9ca3af', fontStyle:'italic', marginBottom:12 }}>No linked POs</div>
                    : <div style={{ overflowX:'auto', marginBottom:12 }}>
                        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
                          <thead>
                            <tr style={{ background:'#7c2d12' }}>
                              {['PO No','Vendor','PO Date','Grand Total','Paid','Balance Due','Status'].map((h,i)=>(
                                <th key={h} style={{ padding:'6px 10px', color:'#fff', fontWeight:700,
                                  textAlign:i>=3?'right':'left', whiteSpace:'nowrap' }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {conds.pos.map((p,ri) => {
                              const d = getPODue(p);
                              const bal = parseFloat(d?.due||d?.balance)||0;
                              return (
                                <tr key={p.orderId||ri} style={{ background:ri%2===0?'#fff':'#fff8f0' }}>
                                  <td style={{ padding:'5px 10px', border:`1px solid ${BD}`, fontWeight:600 }}>
                                    {p.poNo||p.poNumber||`#${p.orderId}`}
                                  </td>
                                  <td style={{ padding:'5px 10px', border:`1px solid ${BD}` }}>{p.vendorName||'—'}</td>
                                  <td style={{ padding:'5px 10px', border:`1px solid ${BD}`, color:'#6b7280' }}>{fmtD(p.poDate||p.createdAt)}</td>
                                  <td style={{ padding:'5px 10px', border:`1px solid ${BD}`, textAlign:'right', fontWeight:700 }}>₹{fmt(p.grandTotal||0)}</td>
                                  <td style={{ padding:'5px 10px', border:`1px solid ${BD}`, textAlign:'right', color:'#15803d' }}>₹{fmt(d?.paid||d?.totalPaid||0)}</td>
                                  <td style={{ padding:'5px 10px', border:`1px solid ${BD}`, textAlign:'right',
                                    fontWeight:700, color:bal>0.5?'#dc2626':'#15803d' }}>₹{fmt(bal)}</td>
                                  <td style={{ padding:'5px 10px', border:`1px solid ${BD}` }}>
                                    <span style={{ fontSize:9.5, fontWeight:700, padding:'1px 6px', borderRadius:3,
                                      background:p.status==='approved'||p.status==='completed'?'#dcfce7':'#fef9c3',
                                      color:p.status==='approved'||p.status==='completed'?'#15803d':'#854d0e' }}>
                                      {p.status||'—'}
                                    </span>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                  }

                  {/* Expenses */}
                  <SH col='#b45309'>Expenses ({conds.exps.length})</SH>
                  {conds.exps.length === 0
                    ? <div style={{ fontSize:11, color:'#9ca3af', fontStyle:'italic', marginBottom:8 }}>No linked expenses</div>
                    : <div style={{ overflowX:'auto' }}>
                        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
                          <thead>
                            <tr style={{ background:'#b45309' }}>
                              {['Date','Category','Description','Vendor','Amount','Status'].map((h,i)=>(
                                <th key={h} style={{ padding:'6px 10px', color:'#fff', fontWeight:700,
                                  textAlign:i===4?'right':'left', whiteSpace:'nowrap' }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {conds.exps.map((e,ri)=>(
                              <tr key={e.expenseId||ri} style={{ background:ri%2===0?'#fff':'#fff8f0' }}>
                                <td style={{ padding:'5px 10px', border:`1px solid ${BD}`, color:'#6b7280' }}>{fmtD(e.date||e.expenseDate||e.createdAt)}</td>
                                <td style={{ padding:'5px 10px', border:`1px solid ${BD}`, fontWeight:600, color:'#b45309' }}>{e.expenseCategory||e.category||'—'}</td>
                                <td style={{ padding:'5px 10px', border:`1px solid ${BD}`, color:'#555' }}>{e.description||'—'}</td>
                                <td style={{ padding:'5px 10px', border:`1px solid ${BD}` }}>{e.vendor||'—'}</td>
                                <td style={{ padding:'5px 10px', border:`1px solid ${BD}`, textAlign:'right', fontWeight:700 }}>₹{fmt(e.grandTotal||e.amount||0)}</td>
                                <td style={{ padding:'5px 10px', border:`1px solid ${BD}` }}>
                                  <span style={{ fontSize:9.5, fontWeight:700, padding:'1px 6px', borderRadius:3,
                                    background:e.status?.toLowerCase()==='paid'?'#dcfce7':'#fef9c3',
                                    color:e.status?.toLowerCase()==='paid'?'#15803d':'#854d0e' }}>
                                    {e.status||'—'}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                  }
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
