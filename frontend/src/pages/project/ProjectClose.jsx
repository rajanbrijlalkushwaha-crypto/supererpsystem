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
const getFY = d => {
  const dt = d ? new Date(d) : new Date();
  const y = dt.getFullYear(), m = dt.getMonth();
  const start = m >= 3 ? y : y - 1;
  return `${String(start).slice(2)}-${String(start+1).slice(2)}`;
};
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
  const clientBal = Math.max(0, soTotal - received);
  const poTotal   = pos.reduce((s,p) => s + (parseFloat(p.grandTotal)||0), 0);
  const expTotal  = expenses.reduce((s,e) => s + (parseFloat(e.grandTotal||e.amount)||0), 0);
  const profit    = soTotal - poTotal - expTotal;
  const today     = new Date().toLocaleDateString('en-IN',{day:'2-digit',month:'long',year:'numeric'});

  const itemRows = (items=[]) => items.length === 0
    ? `<tr><td colspan="7" style="padding:8px;text-align:center;color:#9ca3af;font-style:italic;">No items</td></tr>`
    : items.map((it,i) => {
        const base = (parseFloat(it.qty||it.quantity)||0) * (parseFloat(it.rate)||0);
        const gst  = parseFloat(it.gst||it.gstPercent)||0;
        return `<tr style="background:${i%2===0?'#fff':'#f9fafb'}">
          <td style="padding:5px 8px;border:1px solid #e5e7eb;color:#6b7280">${i+1}</td>
          <td style="padding:5px 8px;border:1px solid #e5e7eb;font-weight:600">${it.itemName||it.description||it.name||'—'}</td>
          <td style="padding:5px 8px;border:1px solid #e5e7eb;text-align:right">${parseFloat(it.qty||it.quantity)||0}</td>
          <td style="padding:5px 8px;border:1px solid #e5e7eb">${it.unit||'NOS'}</td>
          <td style="padding:5px 8px;border:1px solid #e5e7eb;text-align:right">₹${fmt(parseFloat(it.rate)||0)}</td>
          <td style="padding:5px 8px;border:1px solid #e5e7eb;text-align:center">${gst}%</td>
          <td style="padding:5px 8px;border:1px solid #e5e7eb;text-align:right;font-weight:700">₹${fmt(base + base*gst/100)}</td>
        </tr>`;
      }).join('');

  const poSection = pos.map((p,pi) => {
    const due    = vendorDues.find(d => String(d.orderId)===String(p.orderId) || d.orderNo===p.poNo);
    const poBal  = parseFloat(due?.due||due?.balance)||0;
    const poPaid = parseFloat(due?.paid||due?.totalPaid)||0;
    return `<div style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin-bottom:12px;break-inside:avoid">
      <div style="background:#7c2d12;color:#fff;padding:8px 14px;display:flex;justify-content:space-between;align-items:center">
        <span style="font-weight:800;font-size:10pt">PO ${pi+1}: ${p.poNo||p.poNumber||`#${p.orderId}`}</span>
        <span style="font-size:9.5pt;opacity:0.9">${p.vendorName||'—'}</span>
        <span style="font-size:9pt;opacity:0.8">${fmtD(p.poDate||p.createdAt)}</span>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:9pt">
        <thead><tr style="background:#fff0ec">
          <th style="padding:5px 8px;border:1px solid #fecaca;text-align:left;font-weight:700;color:#7c2d12">#</th>
          <th style="padding:5px 8px;border:1px solid #fecaca;text-align:left;font-weight:700;color:#7c2d12">Description</th>
          <th style="padding:5px 8px;border:1px solid #fecaca;text-align:right;font-weight:700;color:#7c2d12">Qty</th>
          <th style="padding:5px 8px;border:1px solid #fecaca;text-align:left;font-weight:700;color:#7c2d12">Unit</th>
          <th style="padding:5px 8px;border:1px solid #fecaca;text-align:right;font-weight:700;color:#7c2d12">Rate</th>
          <th style="padding:5px 8px;border:1px solid #fecaca;text-align:center;font-weight:700;color:#7c2d12">GST</th>
          <th style="padding:5px 8px;border:1px solid #fecaca;text-align:right;font-weight:700;color:#7c2d12">Amount</th>
        </tr></thead>
        <tbody>${itemRows(p.items||[])}</tbody>
      </table>
      <div style="background:#fff8f4;padding:8px 14px;display:flex;gap:24px;border-top:1px solid #fecaca">
        <div><span style="color:#6b7280;font-size:8.5pt">PO Value: </span><span style="font-weight:800;color:#7c2d12;font-size:10pt">₹${fmt(p.grandTotal||0)}</span></div>
        <div><span style="color:#6b7280;font-size:8.5pt">Paid: </span><span style="font-weight:700;color:#15803d;font-size:10pt">₹${fmt(poPaid)}</span></div>
        <div><span style="color:#6b7280;font-size:8.5pt">Balance: </span><span style="font-weight:700;color:${poBal>0.5?'#dc2626':'#15803d'};font-size:10pt">${poBal>0.5?'₹'+fmt(poBal):'✓ Cleared'}</span></div>
      </div>
    </div>`;
  }).join('');

  const expRows = expenses.map((e,i) => {
    const total = parseFloat(e.grandTotal||e.amount)||0;
    return `<tr style="background:${i%2===0?'#fff':'#fffbeb'}">
      <td style="padding:5px 8px;border:1px solid #e5e7eb;color:#6b7280">${i+1}</td>
      <td style="padding:5px 8px;border:1px solid #e5e7eb;color:#6b7280;white-space:nowrap">${fmtD(e.date||e.expenseDate||e.createdAt)}</td>
      <td style="padding:5px 8px;border:1px solid #e5e7eb;font-weight:600;color:#92400e">${e.expenseCategory||e.category||'—'}</td>
      <td style="padding:5px 8px;border:1px solid #e5e7eb;color:#374151">${e.description||'—'}</td>
      <td style="padding:5px 8px;border:1px solid #e5e7eb;font-weight:600">${e.vendorName||e.vendor||e.ledgerName||'—'}</td>
      <td style="padding:5px 8px;border:1px solid #e5e7eb;text-align:right;font-weight:700">₹${fmt(total)}</td>
      <td style="padding:5px 8px;border:1px solid #e5e7eb">${e.paymentMode||e.mode||'—'}</td>
    </tr>`;
  }).join('');

  const html = `<!DOCTYPE html><html><head>
<meta charset="utf-8">
<title>Project Close Report — ${so.orderNo||so.orderId}</title>
<style>
*{box-sizing:border-box;font-family:'Segoe UI',Arial,sans-serif;margin:0;padding:0}
body{background:#fff;color:#1f2937;font-size:9.5pt;line-height:1.4;}
.page{max-width:210mm;margin:0 auto;padding:14px;}
.section{margin-bottom:20px;break-inside:avoid;}
.sec-title{font-size:10.5pt;font-weight:800;color:#fff;background:#104f4f;padding:6px 14px;border-radius:6px 6px 0 0;letter-spacing:0.3px;}
.sec-title.po{background:#7c2d12;}
.sec-title.exp{background:#92400e;}
.sec-title.pl{background:#1a3a8a;}
.sec-body{border:1px solid #d1d5db;border-top:none;border-radius:0 0 6px 6px;overflow:hidden;}
table{width:100%;border-collapse:collapse;font-size:9pt;}
th{padding:6px 8px;text-align:left;border:1px solid #d1d5db;font-size:8.5pt;font-weight:700;}
td{padding:5px 8px;border:1px solid #e5e7eb;}
.ra{text-align:right!important}.ca{text-align:center!important}
tfoot td{background:#f8faff;font-weight:700;border-top:2px solid #c0ccee;}
tfoot td.po{background:#fff8f4;}tfoot td.exp{background:#fffbeb;}
.sig-line{border-top:1.5px solid #374151;padding-top:5px;font-size:8pt;color:#6b7280;width:160px;margin-top:36px;text-align:center;}
@media print{
  @page{size:A4 portrait;margin:8mm;}
  body{font-size:8.5pt;}
  .page{padding:0;}
  .no-break{break-inside:avoid;}
}
</style>
</head><body>
<div class="page">

<!-- ══ LETTERHEAD ══ -->
<div style="background:linear-gradient(135deg,#104f4f 0%,#1a3a8a 100%);color:#fff;padding:16px 20px;border-radius:8px;margin-bottom:16px;display:flex;justify-content:space-between;align-items:flex-end;">
  <div>
    <div style="font-size:9pt;opacity:0.75;letter-spacing:1px;text-transform:uppercase;margin-bottom:2px">${companyName||'Company'}</div>
    <div style="font-size:17pt;font-weight:900;letter-spacing:0.5px;line-height:1">PROJECT CLOSE REPORT</div>
    <div style="font-size:9pt;opacity:0.8;margin-top:4px">Order: <b>${so.orderNo||so.orderId||'—'}</b> &nbsp;|&nbsp; Client: <b>${so.customerName||so.clientName||'—'}</b></div>
  </div>
  <div style="text-align:right;font-size:8.5pt;opacity:0.8;line-height:1.6">
    <div>Date of Report: ${today}</div>
    <div>Order Date: ${fmtD(so.orderDate||so.date)}</div>
    <div>Status: <b style="text-transform:uppercase">${so.status||'—'}</b></div>
  </div>
</div>

<!-- ══ FINANCIAL SUMMARY CARDS ══ -->
<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:16px;" class="no-break">
  ${[
    ['SO Value',         `₹${fmt(soTotal)}`,    '#1a3a8a','#eef2ff','#c7d2fe'],
    ['Received',         `₹${fmt(received)}`,   '#15803d','#f0fdf4','#86efac'],
    ['Client Balance',   clientBal>0.5 ? `₹${fmt(clientBal)}`:'✓ Cleared', clientBal>0.5?'#dc2626':'#15803d','#fff',clientBal>0.5?'#fecaca':'#86efac'],
    ['PO Total',         `₹${fmt(poTotal)}`,    '#7c2d12','#fff8f4','#fecaca'],
    ['Expenses',         `₹${fmt(expTotal)}`,   '#92400e','#fffbeb','#fcd34d'],
    ['Total Cost',       `₹${fmt(poTotal+expTotal)}`,'#374151','#f9fafb','#d1d5db'],
    ['Gross Profit',     `₹${fmt(soTotal-(poTotal+expTotal))}`, profit>=0?'#15803d':'#dc2626', profit>=0?'#f0fdf4':'#fef2f2', profit>=0?'#86efac':'#fecaca'],
    ['Margin',           soTotal>0?`${((profit/soTotal)*100).toFixed(1)}%`:'—', profit>=0?'#15803d':'#dc2626','#fff','#d1d5db'],
  ].map(([l,v,fc,bg,bc])=>`
    <div style="background:${bg};border:1.5px solid ${bc};border-radius:8px;padding:8px 12px;text-align:center;">
      <div style="font-size:7.5pt;color:#6b7280;text-transform:uppercase;letter-spacing:0.4px;font-weight:600">${l}</div>
      <div style="font-size:13pt;font-weight:900;color:${fc};margin-top:3px;line-height:1">${v}</div>
    </div>`).join('')}
</div>

<!-- ══ SALES ORDER ══ -->
<div class="section no-break">
  <div class="sec-title">Sales Order Details</div>
  <div class="sec-body" style="padding:12px;display:grid;grid-template-columns:1fr 1fr;gap:16px;">
    <div>
      <table style="width:100%;font-size:9pt;border-collapse:collapse;">
        <tbody>
          ${[
            ['Order Number',    so.orderNo||'—'],
            ['Customer Name',   so.customerName||so.clientName||'—'],
            ['Customer PO No',  so.customerPO||'—'],
            ['Order Date',      fmtD(so.orderDate||so.date)],
            ['Delivery Date',   fmtD(so.deliveryDate||so.dueDate||'')],
            ['Status',          so.status||'—'],
          ].map(([l,v])=>`<tr><td style="padding:4px 8px;border:1px solid #e5e7eb;width:38%;background:#f9fafb;font-weight:600;font-size:8.5pt;color:#374151">${l}</td><td style="padding:4px 8px;border:1px solid #e5e7eb;font-weight:700;color:#1f2937">${v}</td></tr>`).join('')}
        </tbody>
      </table>
    </div>
    <div>
      <table style="width:100%;font-size:9pt;border-collapse:collapse;">
        <tbody>
          ${[
            ['Sub Total',     `₹${fmt(so.subTotal||0)}`],
            ['GST Amount',    `₹${fmt(so.totalGST||so.gstAmount||0)}`],
            ['P&F Charges',   `₹${fmt(so.packingCharges||0)}`],
            ['Transport',     `₹${fmt(so.freightCharges||0)}`],
            ['Grand Total',   `₹${fmt(so.grandTotal||0)}`],
            ['Amount Received',`₹${fmt(received)}`],
            ['Balance Due',   clientBal>0.5?`₹${fmt(clientBal)}`:'✓ Fully Received'],
          ].map(([l,v],i)=>`<tr${i===4?` style="background:#e0f2fe;font-weight:800;"`:i===6?` style="background:${clientBal>0.5?'#fef2f2':'#f0fdf4'};font-weight:800;"`:''}>
            <td style="padding:4px 8px;border:1px solid #e5e7eb;width:38%;background:${i===4||i===6?'inherit':'#f9fafb'};font-weight:600;font-size:8.5pt;color:#374151">${l}</td>
            <td style="padding:4px 8px;border:1px solid #e5e7eb;font-weight:700;text-align:right;color:${i===6&&clientBal>0.5?'#dc2626':i===6?'#15803d':'#1f2937'}">${v}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>
  </div>
  ${so.items&&so.items.length>0?`
  <table style="width:100%;border-collapse:collapse;font-size:8.5pt;border-top:1px solid #d1d5db;">
    <thead><tr style="background:#104f4f;color:#fff">
      <th style="padding:5px 8px;border:1px solid #0d3a3a;width:28px">#</th>
      <th style="padding:5px 8px;border:1px solid #0d3a3a">Item / Description</th>
      <th style="padding:5px 8px;border:1px solid #0d3a3a;text-align:right;width:50px">Qty</th>
      <th style="padding:5px 8px;border:1px solid #0d3a3a;width:45px">Unit</th>
      <th style="padding:5px 8px;border:1px solid #0d3a3a;text-align:right;width:80px">Rate (₹)</th>
      <th style="padding:5px 8px;border:1px solid #0d3a3a;text-align:center;width:50px">GST%</th>
      <th style="padding:5px 8px;border:1px solid #0d3a3a;text-align:right;width:90px">Amount (₹)</th>
    </tr></thead>
    <tbody>${itemRows(so.items||[])}</tbody>
    <tfoot><tr style="background:#e0f2fe;font-weight:800;">
      <td colspan="6" style="padding:6px 8px;border:1px solid #d1d5db;font-weight:800">Grand Total</td>
      <td style="padding:6px 8px;border:1px solid #d1d5db;text-align:right">₹${fmt(so.grandTotal||0)}</td>
    </tr></tfoot>
  </table>`:''}
</div>

<!-- ══ PURCHASE ORDERS ══ -->
<div class="section">
  <div class="sec-title po">Purchase Orders (${pos.length})</div>
  <div class="sec-body" style="padding:${pos.length===0?'12px':'10px'};">
    ${pos.length===0
      ? '<div style="color:#9ca3af;font-style:italic;font-size:9.5pt;padding:8px 4px;">No linked purchase orders for this project.</div>'
      : poSection}
  </div>
</div>

<!-- ══ EXPENSES ══ -->
${expenses.length>0?`
<div class="section">
  <div class="sec-title exp">Expenses (${expenses.length})</div>
  <div class="sec-body">
    <table>
      <thead><tr style="background:#92400e;color:#fff">
        <th style="padding:5px 8px;border:1px solid #78350f;width:28px">#</th>
        <th style="padding:5px 8px;border:1px solid #78350f;width:65px">Date</th>
        <th style="padding:5px 8px;border:1px solid #78350f;width:90px">Category</th>
        <th style="padding:5px 8px;border:1px solid #78350f">Description</th>
        <th style="padding:5px 8px;border:1px solid #78350f;width:110px">Vendor / Party</th>
        <th style="padding:5px 8px;border:1px solid #78350f;text-align:right;width:85px">Amount (₹)</th>
        <th style="padding:5px 8px;border:1px solid #78350f;width:70px">Pay Mode</th>
      </tr></thead>
      <tbody>${expRows}</tbody>
      <tfoot><tr class="exp">
        <td colspan="5" style="padding:6px 8px;border:1px solid #e5e7eb;font-weight:800">Total Expenses</td>
        <td style="padding:6px 8px;border:1px solid #e5e7eb;text-align:right;font-weight:800;color:#92400e">₹${fmt(expTotal)}</td>
        <td style="padding:6px 8px;border:1px solid #e5e7eb"></td>
      </tr></tfoot>
    </table>
  </div>
</div>`:''}

<!-- ══ P&L SUMMARY ══ -->
<div class="section no-break" style="display:grid;grid-template-columns:1fr 1fr;gap:16px;align-items:start;">
  <div>
    <div class="sec-title pl">Profit &amp; Loss Summary</div>
    <div class="sec-body">
      <table>
        <tbody>
          ${[
            ['Revenue (SO Grand Total)',  `₹${fmt(soTotal)}`,         '#1a3a8a', ''],
            ['Purchase Cost (POs)',       `₹${fmt(poTotal)}`,         '#7c2d12', ''],
            ['Other Expenses',           `₹${fmt(expTotal)}`,         '#92400e', ''],
            ['Gross Profit / (Loss)',     `₹${fmt(profit)}`,           profit>=0?'#15803d':'#dc2626', 'border-top:2px solid #c7d2fe;font-weight:800;background:#f8faff;font-size:11pt;'],
            ['Margin %',                 soTotal>0?`${((profit/soTotal)*100).toFixed(2)}%`:'—', profit>=0?'#15803d':'#dc2626', ''],
          ].map(([l,v,c,extra])=>`<tr>
            <td style="padding:7px 12px;border:1px solid #e5e7eb;font-weight:600;${extra}font-size:9pt">${l}</td>
            <td style="padding:7px 12px;border:1px solid #e5e7eb;text-align:right;font-weight:800;color:${c};${extra}font-size:9pt">${v}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>
  </div>
  <div style="padding:12px 16px;background:#fffbeb;border:1.5px solid #fcd34d;border-radius:8px;">
    <div style="font-size:10pt;font-weight:800;color:#92400e;margin-bottom:8px">Payment Summary</div>
    ${[
      ['SO Value (Receivable)',    `₹${fmt(soTotal)}`,   '#1a3a8a'],
      ['Received from Client',     `₹${fmt(received)}`,  '#15803d'],
      ['Client Balance Due',       clientBal>0.5?`₹${fmt(clientBal)}`:'✓ Fully Cleared', clientBal>0.5?'#dc2626':'#15803d'],
      ['Total PO Payments Due',    `₹${fmt(poTotal)}`,   '#7c2d12'],
      ['Total Expenses Due',       `₹${fmt(expTotal)}`,  '#92400e'],
    ].map(([l,v,c])=>`<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid #fde68a;font-size:9pt;">
      <span style="color:#6b7280">${l}</span><span style="font-weight:700;color:${c}">${v}</span>
    </div>`).join('')}
  </div>
</div>

<!-- ══ SIGNATURES ══ -->
<div style="display:flex;justify-content:space-between;margin-top:50px;padding-top:14px;border-top:1px solid #d1d5db;">
  <div class="sig-line">Generated by</div>
  <div class="sig-line">Checked by</div>
  <div class="sig-line">Approved by</div>
  <div class="sig-line">Authorised Signatory</div>
</div>
<div style="margin-top:16px;text-align:center;font-size:7.5pt;color:#9ca3af;border-top:1px solid #f0f0f0;padding-top:8px;">
  This is a system-generated report. ${companyName||''} — Generated on ${today}
</div>

</div>
<script>window.onload=()=>setTimeout(()=>window.print(),500);<\/script>
</body></html>`;

  const w = window.open('', '_blank', 'width=1100,height=900');
  if (!w) { alert('Allow pop-ups to print the report.'); return; }
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
  const [payments,     setPayments]     = useState([]);
  const [loading,      setLoading]      = useState(false);
  const [search,       setSearch]       = useState('');
  const [filter,       setFilter]       = useState('all'); // all | open | closed
  const [fy,           setFy]           = useState(getFY());
  const [expanded,     setExpanded]     = useState({});
  const [saving,       setSaving]       = useState({});
  const [reporting,    setReporting]    = useState({});

  const load = useCallback(async () => {
    if (!cid) return;
    setLoading(true);
    try {
      const [soR, poR, duesR, expR, payR] = await Promise.all([
        axios.get(`/api/sales-orders?companyId=${cid}`).catch(()=>({data:[]})),
        axios.get(`/api/purchase-orders?companyId=${cid}`).catch(()=>({data:[]})),
        axios.get(`/api/accounts/dues?companyId=${cid}`).catch(()=>({data:{}})),
        axios.get(`/api/accounts/expenses?companyId=${cid}`).catch(()=>({data:[]})),
        axios.get(`/api/accounts/payments?companyId=${cid}`).catch(()=>({data:[]})),
      ]);
      setSalesOrders(Array.isArray(soR.data) ? soR.data : []);
      setPurchOrders(Array.isArray(poR.data) ? poR.data : []);
      const duesData = duesR.data || {};
      setClientDues(Array.isArray(duesData.clientDues) ? duesData.clientDues : (Array.isArray(duesData) ? duesData : []));
      setVendorDues(Array.isArray(duesData.vendorDues) ? duesData.vendorDues : []);
      setExpenses(Array.isArray(expR.data) ? expR.data : []);
      setPayments(Array.isArray(payR.data) ? payR.data : []);
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

  const expVendorName = e =>
    e.vendorName || e.vendor || e.ledgerName || '—';

  const expPaid = (e) => {
    const eid = String(e.expenseId);
    return payments
      .filter(p => p.type==='payment' && p.status!=='rejected' &&
        (String(p.expenseId)===eid || String(p.orderId)===eid))
      .reduce((s,p) => s+(parseFloat(p.amount)||0), 0);
  };

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
    const unpaidExps = exps.filter(e => {
      const paid = expPaid(e);
      const total = parseFloat(e.grandTotal||e.amount)||0;
      return total > 0 && paid < total - 0.5;
    });
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
  const fyList = useMemo(() => {
    const set = new Set(salesOrders.map(o => getFY(o.orderDate||o.date)));
    return ['all', ...[...set].sort().reverse()];
  }, [salesOrders]);

  const filtered = useMemo(() => {
    let list = fy === 'all' ? salesOrders : salesOrders.filter(o => getFY(o.orderDate||o.date) === fy);
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
  }, [salesOrders, search, filter, fy]);

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

        {/* Divider */}
        <div style={{ width:1, height:20, background:'#bbb', margin:'0 8px', flexShrink:0 }}/>

        {/* FY filter buttons */}
        {fyList.map(f => {
          const active = fy === f;
          return (
            <button key={f} onClick={() => setFy(f)} style={{
              height:24, padding:'0 8px', fontSize:11, cursor:'pointer',
              whiteSpace:'nowrap', flexShrink:0, fontFamily:F,
              fontWeight: active ? 700 : 400, marginRight:3, borderRadius:3,
              border:`1px solid ${active ? P : '#bbb'}`,
              background: active ? P : '#fff',
              color: active ? '#fff' : '#555',
            }}>
              {f === 'all' ? 'All' : `FY ${f}`}
            </button>
          );
        })}

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
                              {['Date','Category','Description','Vendor / Party','Amount (₹)','Paid (₹)','Balance (₹)','Status'].map((h,i)=>(
                                <th key={h} style={{ padding:'6px 10px', color:'#fff', fontWeight:700,
                                  textAlign:i>=4?'right':'left', whiteSpace:'nowrap' }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {conds.exps.map((e,ri)=>{
                              const paid  = expPaid(e);
                              const total = parseFloat(e.grandTotal||e.amount)||0;
                              const bal   = Math.max(0, total - paid);
                              return (
                              <tr key={e.expenseId||ri} style={{ background:ri%2===0?'#fff':'#fff8f0' }}>
                                <td style={{ padding:'5px 10px', border:`1px solid ${BD}`, color:'#6b7280', whiteSpace:'nowrap' }}>{fmtD(e.date||e.expenseDate||e.createdAt)}</td>
                                <td style={{ padding:'5px 10px', border:`1px solid ${BD}`, fontWeight:600, color:'#b45309' }}>{e.expenseCategory||e.category||'—'}</td>
                                <td style={{ padding:'5px 10px', border:`1px solid ${BD}`, color:'#555' }}>{e.description||'—'}</td>
                                <td style={{ padding:'5px 10px', border:`1px solid ${BD}`, fontWeight:600 }}>{expVendorName(e)}</td>
                                <td style={{ padding:'5px 10px', border:`1px solid ${BD}`, textAlign:'right', fontWeight:700 }}>₹{fmt(total)}</td>
                                <td style={{ padding:'5px 10px', border:`1px solid ${BD}`, textAlign:'right', color:'#15803d', fontWeight:paid>0?700:400 }}>
                                  {paid > 0 ? `₹${fmt(paid)}` : '—'}
                                </td>
                                <td style={{ padding:'5px 10px', border:`1px solid ${BD}`, textAlign:'right', fontWeight:700, color:bal>0.5?'#dc2626':'#15803d' }}>
                                  {bal <= 0.5 ? '✓ Paid' : `₹${fmt(bal)}`}
                                </td>
                                <td style={{ padding:'5px 10px', border:`1px solid ${BD}` }}>
                                  <span style={{ fontSize:9.5, fontWeight:700, padding:'1px 6px', borderRadius:3,
                                    background:bal<=0.5?'#dcfce7':'#fef9c3',
                                    color:bal<=0.5?'#15803d':'#854d0e' }}>
                                    {bal<=0.5?'Paid':e.status||'Pending'}
                                  </span>
                                </td>
                              </tr>
                              );
                            })}
                          </tbody>
                          <tfoot>
                            <tr style={{ background:'#fff8f0', fontWeight:800 }}>
                              <td colSpan={4} style={{ padding:'6px 10px', border:`1px solid ${BD}`, fontSize:11 }}>Total</td>
                              <td style={{ padding:'6px 10px', border:`1px solid ${BD}`, textAlign:'right', color:'#b45309' }}>₹{fmt(conds.exps.reduce((s,e)=>s+(parseFloat(e.grandTotal||e.amount)||0),0))}</td>
                              <td style={{ padding:'6px 10px', border:`1px solid ${BD}`, textAlign:'right', color:'#15803d' }}>₹{fmt(conds.exps.reduce((s,e)=>s+expPaid(e),0))}</td>
                              <td style={{ padding:'6px 10px', border:`1px solid ${BD}`, textAlign:'right', color:'#dc2626' }}>₹{fmt(conds.exps.reduce((s,e)=>s+Math.max(0,(parseFloat(e.grandTotal||e.amount)||0)-expPaid(e)),0))}</td>
                              <td style={{ border:`1px solid ${BD}` }}/>
                            </tr>
                          </tfoot>
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
