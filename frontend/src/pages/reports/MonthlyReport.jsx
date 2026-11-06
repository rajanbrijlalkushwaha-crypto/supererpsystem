import { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { useCompany } from '../../context/CompanyContext';
import { withPrintFont } from '../../utils/printFont';

const F  = "Arial, 'Helvetica Neue', Helvetica, sans-serif";
const TH = '#1a3a5c';

/* ── FY helpers ──────────────────────────────────────────────── */
const getFYOptions = () => {
  const cur  = new Date();
  const year = cur.getMonth() >= 3 ? cur.getFullYear() : cur.getFullYear() - 1;
  return Array.from({ length: 5 }, (_, i) => {
    const y = year - i;
    return { label: `FY ${String(y).slice(2)}-${String(y+1).slice(2)}`, startYear: y };
  });
};

const FY_MONTHS = ['Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec','Jan','Feb','Mar'];

const fyMonthIdx = (dateStr) => {
  if (!dateStr) return -1;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return -1;
  const m = d.getMonth();
  return m >= 3 ? m - 3 : m + 9;
};

const inFY = (dateStr, startYear) => {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return false;
  const y = d.getFullYear(), m = d.getMonth();
  return m >= 3 ? y === startYear : y === startYear + 1;
};

const getDate = (o) =>
  o.orderDate || o.billDate || o.invoiceDate || o.paymentDate ||
  o.date || o.createdAt || o.created_at || '';

const fmt = (n) => {
  const v = Math.abs(parseFloat(n) || 0);
  if (v === 0) return '—';
  if (v >= 1e7) return `₹${(v / 1e7).toFixed(2)} Cr`;
  if (v >= 1e5) return `₹${(v / 1e5).toFixed(2)} L`;
  if (v >= 1e3) return `₹${(v / 1e3).toFixed(1)}K`;
  return `₹${v.toFixed(0)}`;
};

const METRICS = [
  { key:'so',  label:'Sales Order',    color:'#2563eb', bg:'#eff6ff' },
  { key:'po',  label:'Purchase Order', color:'#d97706', bg:'#fffbeb' },
  { key:'sb',  label:'Sales Bill',     color:'#7c3aed', bg:'#f5f3ff' },
  { key:'pb',  label:'Purchase Bill',  color:'#ea580c', bg:'#fff7ed' },
  { key:'rec', label:'Receipt',        color:'#059669', bg:'#ecfdf5' },
  { key:'pay', label:'Payment',        color:'#dc2626', bg:'#fef2f2' },
];

/* ── SVG Bar Chart ───────────────────────────────────────────── */
function BarChart({ data, svgRef }) {
  const W = 860, H = 160, PAD = 30, BG = 2, GG = 8;
  const colW  = (W - PAD * 2) / 12;
  const bW    = (colW - GG) / 2 - BG;
  const maxVal = Math.max(1, ...data.so, ...data.po);
  const sc    = (v) => ((v || 0) / maxVal) * (H - 20);

  return (
    <svg ref={svgRef} width="100%" viewBox={`0 0 ${W} ${H + 36}`} style={{ display:'block' }}>
      {[0.25,0.5,0.75,1].map(r => {
        const y = H - sc(maxVal * r);
        return <line key={r} x1={PAD} x2={W-PAD} y1={y} y2={y} stroke="#e2e8f0" strokeWidth={1} strokeDasharray="4 3"/>;
      })}
      {FY_MONTHS.map((m, i) => {
        const gx = PAD + i * colW + GG / 2;
        const soH = sc(data.so[i]), poH = sc(data.po[i]);
        return (
          <g key={m}>
            {soH > 0 && <rect x={gx}        y={H-soH} width={bW} height={soH} fill="#2563eb" rx={2} opacity={0.8}/>}
            {poH > 0 && <rect x={gx+bW+BG}  y={H-poH} width={bW} height={poH} fill="#d97706" rx={2} opacity={0.8}/>}
            <text x={gx+colW/2-GG/2} y={H+14} textAnchor="middle" fontSize={9} fill="#64748b" fontFamily={F}>{m}</text>
          </g>
        );
      })}
      <rect x={PAD}     y={H+24} width={9} height={9} fill="#2563eb" rx={1}/>
      <text x={PAD+13}  y={H+32} fontSize={9} fill="#475569" fontFamily={F}>Sales Order</text>
      <rect x={PAD+90}  y={H+24} width={9} height={9} fill="#d97706" rx={1}/>
      <text x={PAD+103} y={H+32} fontSize={9} fill="#475569" fontFamily={F}>Purchase Order</text>
    </svg>
  );
}

export default function MonthlyReport() {
  const { selectedCompany } = useCompany();
  const cid                 = selectedCompany?.companyId;
  const FY_OPTIONS          = getFYOptions();
  const [fyOpt,   setFyOpt]   = useState(FY_OPTIONS[0]);
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(false);
  const [coData,  setCoData]  = useState(null);
  const svgRef                = useRef(null);

  useEffect(() => {
    if (!cid) return;
    axios.get('/api/companies')
      .then(r => {
        const list = Array.isArray(r.data) ? r.data : [];
        setCoData(list.find(c => c.companyId === cid) || selectedCompany);
      })
      .catch(() => setCoData(selectedCompany));
  }, [cid, selectedCompany]);

  const load = useCallback(async () => {
    if (!cid) return;
    setLoading(true);
    const q    = `?companyId=${cid}`;
    const safe = (url) => axios.get(url).then(r => Array.isArray(r.data) ? r.data : []).catch(() => []);
    const [sos, pos, bills, pbills, pmts] = await Promise.all([
      safe(`/api/sales-orders${q}`),
      safe(`/api/purchase-orders${q}`),
      safe(`/api/bills${q}&type=sales`),
      safe(`/api/purchase-bills${q}`),
      safe(`/api/accounts/payments${q}`),
    ]);

    const sy = fyOpt.startYear;
    const buckets = Object.fromEntries(METRICS.map(m => [m.key, Array(12).fill(0)]));
    const addTo = (key, items, field = 'grandTotal') =>
      items.filter(o => inFY(getDate(o), sy)).forEach(o => {
        const i = fyMonthIdx(getDate(o));
        if (i >= 0) buckets[key][i] += parseFloat(o[field]) || 0;
      });

    addTo('so', sos); addTo('po', pos);
    addTo('sb', bills); addTo('pb', pbills);
    pmts.filter(p => inFY(getDate(p), sy)).forEach(p => {
      const i = fyMonthIdx(getDate(p));
      if (i >= 0) buckets[p.type === 'receipt' ? 'rec' : 'pay'][i] += parseFloat(p.amount) || 0;
    });

    setData(buckets);
    setLoading(false);
  }, [cid, fyOpt]);

  useEffect(() => { load(); }, [load]);

  const totals       = data ? Object.fromEntries(METRICS.map(m => [m.key, data[m.key].reduce((a,b)=>a+b,0)])) : {};
  const grandByMonth = data ? FY_MONTHS.map((_, i) => METRICS.reduce((s, m) => s + (data[m.key][i]||0), 0)) : [];
  const grandTotal   = grandByMonth.reduce((a,b) => a+b, 0);

  /* ── Print ─────────────────────────────────────────────── */
  const handlePrint = () => {
    const co      = coData || selectedCompany || {};
    const svgHtml = svgRef.current ? svgRef.current.outerHTML : '';
    const today   = new Date().toLocaleDateString('en-IN', { day:'2-digit', month:'long', year:'numeric' });

    /* metric rows */
    const metricRows = METRICS.map(m => {
      const cells = (data?.[m.key] || Array(12).fill(0)).map((v, i) =>
        `<td class="num ${v>0?'has-val':''}" style="color:${v>0?m.color:'#aaa'}">${fmt(v)}</td>`
      ).join('');
      return `<tr>
        <td class="label" style="color:${m.color};font-weight:700">${m.label}</td>
        ${cells}
        <td class="num total-cell" style="color:${m.color};font-weight:800;background:#f8faff">${fmt(totals[m.key]||0)}</td>
      </tr>`;
    }).join('');

    const grandCells = grandByMonth.map(v =>
      `<td class="num" style="color:${v>0?'#22c55e':'#6b7280'};font-weight:${v>0?700:400}">${fmt(v)}</td>`
    ).join('');

    const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<title>Monthly Report – ${fyOpt.label} – ${co.companyName||''}</title>
<style>
  @page { size: A4 landscape; margin: 10mm 8mm; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
  * { box-sizing: border-box; margin:0; padding:0; }
  body { font-family: Arial, Helvetica, sans-serif; font-size:9pt; color:#1e293b; background:#fff; }

  /* ── Company block ── */
  .co-block { text-align:center; margin-bottom:10px; padding-bottom:8px;
    border-bottom: 2px solid #1a3a5c; }
  .co-name  { font-size:16pt; font-weight:900; color:#1a3a5c; letter-spacing:-0.3px; }
  .co-sub   { font-size:8.5pt; color:#475569; margin-top:3px; line-height:1.7; }
  .co-sub b { color:#1e293b; }

  /* ── Report header ── */
  .rpt-header { display:flex; justify-content:space-between; align-items:center;
    background:#1a3a5c; color:#fff; padding:6px 12px; margin-bottom:0;
    border-radius:4px 4px 0 0; }
  .rpt-header h2 { font-size:11pt; font-weight:800; }
  .rpt-header p  { font-size:8pt; opacity:0.8; }

  /* ── Table (Excel style) ── */
  table { width:100%; border-collapse:collapse; font-size:8.5pt; }
  th, td { border: 1px solid #b0bec5; padding: 4px 6px; }
  thead tr { background:#1a3a5c; color:#fff; }
  th { font-weight:700; text-align:right; white-space:nowrap; }
  th:first-child { text-align:left; min-width:100px; }
  th.total-h { color:#fbbf24; border-left:2px solid #fbbf24; }
  td { text-align:right; vertical-align:middle; }
  td.label { text-align:left; font-weight:700; white-space:nowrap; }
  td.num    { color:#aaaaaa; }
  td.has-val { color:#1e293b; font-weight:600; }
  td.total-cell { border-left:2px solid #c7d2fe; font-weight:800; }

  /* Alternating rows */
  tbody tr:nth-child(even) td { background:#f8fafc; }
  tbody tr:nth-child(odd)  td { background:#ffffff; }

  /* Grand total row */
  .grand-row td { background:#1a3a5c !important; color:#fff !important;
    font-weight:800; border-color:#2d5986; font-size:9pt; }
  .grand-row td.label { color:#fff !important; }

  /* ── Chart ── */
  .chart-box { margin-top:10px; border:1px solid #b0bec5; padding:8px 12px;
    border-radius:0 0 4px 4px; }
  .chart-title { font-size:9pt; font-weight:700; color:#1a3a5c; margin-bottom:6px; }
  svg { width:100%; }

  /* ── Footer ── */
  .footer { margin-top:8px; display:flex; justify-content:space-between;
    font-size:7.5pt; color:#94a3b8; border-top:1px solid #e2e8f0; padding-top:4px; }
</style>
</head><body>

<!-- COMPANY DETAILS (centred) -->
<div class="co-block">
  <div class="co-name">${co.companyName || 'Company Name'}</div>
  <div class="co-sub">
    ${co.address ? `${co.address}${co.city?', '+co.city:''}${co.state?', '+co.state:''}${co.pincode?' – '+co.pincode:''}` : ''}
    ${co.gstin   ? `&nbsp;&nbsp;|&nbsp;&nbsp;<b>GSTIN:</b> ${co.gstin}` : ''}
    ${co.pan     ? `&nbsp;&nbsp;|&nbsp;&nbsp;<b>PAN:</b> ${co.pan}` : ''}
    <br/>
    ${co.phone   ? `<b>Ph:</b> ${co.phone}` : ''}
    ${co.email   ? `&nbsp;&nbsp;|&nbsp;&nbsp;<b>Email:</b> ${co.email}` : ''}
    ${co.website ? `&nbsp;&nbsp;|&nbsp;&nbsp;${co.website}` : ''}
  </div>
</div>

<!-- REPORT HEADER -->
<div class="rpt-header">
  <h2>📅 Monthly Financial Summary &nbsp;–&nbsp; ${fyOpt.label}</h2>
  <p>Printed on: ${today}</p>
</div>

<!-- DATA TABLE (Excel style with borders) -->
<table>
  <thead>
    <tr>
      <th style="text-align:left">Metric</th>
      ${FY_MONTHS.map(m => `<th>${m}</th>`).join('')}
      <th class="total-h">Total</th>
    </tr>
  </thead>
  <tbody>
    ${metricRows}
    <tr class="grand-row">
      <td class="label">Grand Total</td>
      ${grandCells}
      <td class="num" style="color:#fbbf24 !important;font-weight:800 !important">${fmt(grandTotal)}</td>
    </tr>
  </tbody>
</table>

<!-- BAR CHART -->
<div class="chart-box">
  <div class="chart-title">Month-wise Comparison – Sales Order vs Purchase Order</div>
  ${svgHtml}
</div>

<!-- FOOTER -->
<div class="footer">
  <span>Super ERP System &nbsp;·&nbsp; Confidential</span>
  <span>${fyOpt.label} &nbsp;·&nbsp; Generated ${today}</span>
</div>

</body></html>`;

    const w = window.open('', '_blank');
    w.document.write(withPrintFont(html));
    w.document.close();
    setTimeout(() => { w.focus(); w.print(); }, 500);
  };

  /* ── Screen render ─────────────────────────────────────── */
  return (
    <div style={{ height:'100%', display:'flex', flexDirection:'column', fontFamily:F, background:'#f1f5f9' }}>

      {/* Header bar */}
      <div style={{ flexShrink:0, background:'#fff', borderBottom:'1px solid #e2e8f0',
        padding:'10px 20px', display:'flex', alignItems:'center', gap:12 }}>
        <span style={{ fontSize:16 }}>📅</span>
        <span style={{ fontSize:15, fontWeight:800, color:'#1e293b', fontFamily:F }}>Monthly Report</span>
        <div style={{ width:1, height:20, background:'#e2e8f0', margin:'0 4px' }} />
        <label style={{ fontSize:12, fontWeight:700, color:'#64748b', fontFamily:F }}>FY</label>
        <select value={fyOpt.label} onChange={e => setFyOpt(FY_OPTIONS.find(f => f.label === e.target.value))}
          style={{ height:30, padding:'0 10px', border:'1.5px solid #cbd5e1', borderRadius:5,
            fontSize:12, fontWeight:700, color:'#1e293b', background:'#f8fafc',
            cursor:'pointer', fontFamily:F }}>
          {FY_OPTIONS.map(f => <option key={f.label}>{f.label}</option>)}
        </select>
        <div style={{ flex:1 }} />
        <button onClick={handlePrint}
          style={{ display:'flex', alignItems:'center', gap:7, padding:'0 20px', height:34,
            background:'linear-gradient(135deg,#ea580c,#b91c1c)', color:'#fff', border:'none',
            borderRadius:6, fontSize:12, fontWeight:800, cursor:'pointer', fontFamily:F,
            boxShadow:'0 3px 12px rgba(220,38,38,0.35)', letterSpacing:'0.3px' }}>
          🖨️ Print Report
        </button>
      </div>

      {/* Content */}
      <div style={{ flex:1, overflow:'auto', padding:'16px 20px' }}>
        {loading ? (
          <div style={{ padding:48, textAlign:'center', color:'#94a3b8', fontSize:14, fontFamily:F }}>Loading…</div>
        ) : (
          <>
            {/* Screen table */}
            <div style={{ background:'#fff', borderRadius:10, border:'1px solid #e2e8f0',
              boxShadow:'0 2px 8px rgba(0,0,0,0.07)', overflow:'hidden', marginBottom:16 }}>
              <div style={{ overflowX:'auto' }}>
                <table style={{ width:'100%', borderCollapse:'collapse', minWidth:920, fontFamily:F }}>
                  <thead>
                    <tr style={{ background:TH }}>
                      <th style={{ padding:'11px 16px', textAlign:'left', fontSize:12, fontWeight:800,
                        color:'#fff', minWidth:140, letterSpacing:'0.3px' }}>Metric</th>
                      {FY_MONTHS.map(m => (
                        <th key={m} style={{ padding:'11px 8px', textAlign:'right', fontSize:11,
                          fontWeight:700, color:'#cbd5e1', minWidth:68 }}>{m}</th>
                      ))}
                      <th style={{ padding:'11px 14px', textAlign:'right', fontSize:12, fontWeight:800,
                        color:'#fbbf24', minWidth:82, borderLeft:'2px solid rgba(251,191,36,0.4)' }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {METRICS.map((m, ri) => (
                      <tr key={m.key} style={{ borderBottom:'1px solid #f1f5f9',
                        background: ri%2===0 ? '#fff' : '#f8fafc' }}>
                        <td style={{ padding:'10px 16px', fontSize:13, fontWeight:700,
                          color:m.color, fontFamily:F }}>{m.label}</td>
                        {(data?.[m.key]||Array(12).fill(0)).map((v, i) => (
                          <td key={i} style={{ padding:'10px 8px', textAlign:'right', fontSize:12,
                            color: v>0 ? '#1e293b' : '#cbd5e1', fontWeight: v>0 ? 600 : 400,
                            fontFamily:F }}>{fmt(v)}</td>
                        ))}
                        <td style={{ padding:'10px 14px', textAlign:'right', fontSize:13,
                          fontWeight:800, color:m.color, fontFamily:F,
                          borderLeft:'2px solid #e0e7ff', background:m.bg }}>{fmt(totals[m.key]||0)}</td>
                      </tr>
                    ))}
                    <tr style={{ background:'#1e293b' }}>
                      <td style={{ padding:'11px 16px', fontSize:13, fontWeight:800, color:'#fff', fontFamily:F }}>Grand Total</td>
                      {grandByMonth.map((v, i) => (
                        <td key={i} style={{ padding:'11px 8px', textAlign:'right', fontSize:12,
                          fontWeight: v>0?700:400, color: v>0?'#4ade80':'#475569', fontFamily:F }}>{fmt(v)}</td>
                      ))}
                      <td style={{ padding:'11px 14px', textAlign:'right', fontSize:13,
                        fontWeight:800, color:'#fbbf24', fontFamily:F,
                        borderLeft:'2px solid rgba(251,191,36,0.4)' }}>{fmt(grandTotal)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Bar chart */}
            <div style={{ background:'#fff', borderRadius:10, border:'1px solid #e2e8f0',
              boxShadow:'0 2px 8px rgba(0,0,0,0.07)', padding:'18px 20px' }}>
              <div style={{ fontSize:13, fontWeight:800, color:'#1e293b', marginBottom:14, fontFamily:F }}>
                Month-wise Comparison
              </div>
              {data && <BarChart data={data} svgRef={svgRef} />}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
