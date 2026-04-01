import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useCompany } from '../../context/CompanyContext';

/* ═══════════════════════════════════════════════════
   HELPERS
═══════════════════════════════════════════════════ */
const MONTHS = ['Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec','Jan','Feb','Mar'];

const fmtINR = n =>
  n >= 10000000 ? `₹${(n/10000000).toFixed(1)}Cr`
  : n >= 100000 ? `₹${(n/100000).toFixed(1)}L`
  : n >= 1000   ? `₹${(n/1000).toFixed(1)}K`
  : `₹${n}`;

const today   = new Date();
const dateStr = today.toLocaleDateString('en-IN',{ weekday:'long', day:'2-digit', month:'long', year:'numeric' });

const seed = (s) => { let x = Math.sin(s)*10000; return x-Math.floor(x); };
const SALES_DATA = MONTHS.map((_,i) => Math.round(seed(i+1)*14+4)*100000);
const PURCH_DATA = MONTHS.map((_,i) => Math.round(seed(i+20)*10+2)*100000);

const FY = today.getMonth() >= 3
  ? `${today.getFullYear()}-${(today.getFullYear()+1).toString().slice(2)}`
  : `${today.getFullYear()-1}-${today.getFullYear().toString().slice(2)}`;

/* ═══════════════════════════════════════════════════
   STYLE CONSTANTS (classic ERP colors)
═══════════════════════════════════════════════════ */
const S = {
  font:    'Arial, Tahoma, sans-serif',
  bg:      '#D4D0C8',
  panel:   '#FFFFFF',
  border:  '1px solid #888888',
  blue:    '#003875',
  blue2:   '#0055A5',
  blue3:   '#316AC5',
  green:   '#005500',
  red:     '#880000',
  orange:  '#664400',
  grey:    '#555555',
  hdrBg:   '#003875',
  hdrTxt:  '#FFFFFF',
  altRow:  '#EEF3F9',
  hov:     '#C8DCEF',
};

/* ═══════════════════════════════════════════════════
   PANEL wrapper
═══════════════════════════════════════════════════ */
function Panel({ title, children, style, rightContent }) {
  return (
    <div style={{ border: S.border, background: S.panel, ...style }}>
      <div style={{
        background: S.hdrBg, color: S.hdrTxt,
        padding: '3px 8px',
        display: 'flex', justifyContent:'space-between', alignItems:'center',
        fontFamily: S.font, fontSize: 12, fontWeight: 700,
        textTransform: 'uppercase', letterSpacing: '0.3px',
        borderBottom: '1px solid #002255',
      }}>
        <span>{title}</span>
        {rightContent}
      </div>
      <div>{children}</div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   KPI ROW (classic ERP stat boxes)
═══════════════════════════════════════════════════ */
function KpiBox({ label, value, color, onClick }) {
  const [hov, setHov] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        flex: 1,
        padding: '8px 12px',
        border: `1px solid ${color}`,
        background: hov ? color : '#FFFFFF',
        cursor: 'pointer',
        textAlign: 'center',
        fontFamily: S.font,
      }}
    >
      <div style={{ fontSize: 22, fontWeight: 700, color: hov ? '#FFFFFF' : color, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 11, fontWeight: 700, color: hov ? 'rgba(255,255,255,0.85)' : S.grey, marginTop: 3, textTransform:'uppercase', letterSpacing:'0.3px' }}>{label}</div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   BAR CHART (SVG — classic ERP minimal style)
═══════════════════════════════════════════════════ */
function BarChart({ salesData, purchData }) {
  const W=540, H=140, PAD={l:52, r:8, t:10, b:28};
  const maxV = Math.max(...salesData, ...purchData);
  const chartH = H - PAD.t - PAD.b;
  const chartW = W - PAD.l - PAD.r;
  const barW   = chartW / salesData.length * 0.30;
  const gap    = chartW / salesData.length;

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ overflow:'visible', display:'block' }}>
      {/* Grid */}
      {[0,0.25,0.5,0.75,1].map((t,i) => {
        const y = PAD.t + chartH * (1-t);
        return (
          <g key={i}>
            <line x1={PAD.l} y1={y} x2={W-PAD.r} y2={y} stroke="#DDDDDD" strokeWidth="1" />
            <text x={PAD.l-4} y={y+3} textAnchor="end" fontSize="9" fill="#888" fontFamily="Arial,sans-serif">{fmtINR(maxV*t)}</text>
          </g>
        );
      })}
      {/* Baseline */}
      <line x1={PAD.l} y1={PAD.t+chartH} x2={W-PAD.r} y2={PAD.t+chartH} stroke="#888" strokeWidth="1"/>
      {/* Bars */}
      {salesData.map((sv, i) => {
        const pv = purchData[i];
        const x  = PAD.l + gap*i + gap*0.08;
        const sh = (sv/maxV)*chartH;
        const ph = (pv/maxV)*chartH;
        return (
          <g key={i}>
            <rect x={x} y={PAD.t+chartH-sh} width={barW} height={sh} fill="#0055A5">
              <title>Sales {MONTHS[i]}: {fmtINR(sv)}</title>
            </rect>
            <rect x={x+barW+2} y={PAD.t+chartH-ph} width={barW} height={ph} fill="#CC6600">
              <title>Purchase {MONTHS[i]}: {fmtINR(pv)}</title>
            </rect>
            <text x={x+barW} y={H-PAD.b+11} textAnchor="middle" fontSize="8" fill="#666" fontFamily="Arial,sans-serif">{MONTHS[i]}</text>
          </g>
        );
      })}
    </svg>
  );
}

/* ═══════════════════════════════════════════════════
   RECENT ACTIVITY
═══════════════════════════════════════════════════ */
const ACTIVITIES = [
  { type:'Sales Order',    ref:'SO-2526-001', party:'Border Road Organisation',    amt:'₹11,17,700', status:'Approved',  time:'2h ago'  },
  { type:'Purchase Order', ref:'PO-2526-003', party:'Steel Authority of India',     amt:'₹5,40,000',  status:'Pending',   time:'4h ago'  },
  { type:'Payment',        ref:'PAY-0042',    party:'HDFC Bank — NEFT',            amt:'₹2,25,000',  status:'Completed', time:'6h ago'  },
  { type:'New Client',     ref:'CL-00108',    party:'Tata Projects Ltd',           amt:'—',          status:'Active',    time:'1d ago'  },
  { type:'Sales Order',    ref:'SO-2526-002', party:'NTPC Ltd',                    amt:'₹8,72,400',  status:'Draft',     time:'1d ago'  },
];

const STATUS_COLOR = {
  Approved:  { color:'#005500', bg:'#D8F0D8', border:'#44AA44' },
  Pending:   { color:'#664400', bg:'#FFF0CC', border:'#DDAA00' },
  Completed: { color:'#003875', bg:'#D8ECFF', border:'#88AACC' },
  Active:    { color:'#005500', bg:'#D8F0D8', border:'#44AA44' },
  Draft:     { color:'#555555', bg:'#F0F0F0', border:'#AAAAAA' },
};

/* ═══════════════════════════════════════════════════
   QUICK ACTIONS
═══════════════════════════════════════════════════ */
const QUICK = [
  { label:'Create Sales Order',    path:'/sales-order/create',    color: S.blue2 },
  { label:'Create Purchase Order', path:'/purchase-order/create', color: '#664400' },
  { label:'Create Client',         path:'/client/create',         color: S.blue3 },
  { label:'Create Vendor',         path:'/vendor/create',         color: '#005500' },
  { label:'Payment Entry',         path:'/account/payment/create',color: S.blue2 },
  { label:'Receipt Entry',         path:'/account/receipt/create',color: S.green },
  { label:'Company Management',    path:'/admin/companies',        color: '#880000' },
  { label:'Tally Import',          path:'/tally/pending',          color: '#444444' },
];

/* ═══════════════════════════════════════════════════
   MAIN DASHBOARD
═══════════════════════════════════════════════════ */
const Dashboard = () => {
  const { selectedCompany } = useCompany();
  const navigate = useNavigate();
  const [stats,   setStats]   = useState({ clients:0, vendors:0, salesOrders:0, purchaseOrders:0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!selectedCompany) return;
    (async () => {
      setLoading(true);
      try {
        const [c,v,so,po] = await Promise.all([
          axios.get('/api/clients'),
          axios.get('/api/vendors'),
          axios.get('/api/sales-orders'),
          axios.get('/api/purchase-orders'),
        ]);
        setStats({
          clients:        Array.isArray(c.data)  ? c.data.length  : 0,
          vendors:        Array.isArray(v.data)  ? v.data.length  : 0,
          salesOrders:    Array.isArray(so.data) ? so.data.length : 0,
          purchaseOrders: Array.isArray(po.data) ? po.data.length : 0,
        });
      } catch {}
      setLoading(false);
    })();
  }, [selectedCompany]);

  const estSales = SALES_DATA.reduce((a,b)=>a+b,0);
  const estPurch = PURCH_DATA.reduce((a,b)=>a+b,0);
  const estPend  = Math.round(estSales * 0.18);

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:6, fontFamily:S.font, color:'#1A1A1A' }}>

      {/* ── Title Bar ── */}
      <div style={{
        background: S.hdrBg,
        color: '#FFFFFF',
        padding: '5px 10px',
        border: '1px solid #002255',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        fontFamily: S.font,
      }}>
        <div>
          <div style={{ fontSize:14, fontWeight:700 }}>ε Epsilon Enterprise ERP — Dashboard</div>
          {selectedCompany && (
            <div style={{ fontSize:11, color:'#A8C4E0', marginTop:1 }}>
              Company: {selectedCompany.companyName}
              {selectedCompany.gstin && ` | GST: ${selectedCompany.gstin}`}
              {selectedCompany.city  && ` | ${selectedCompany.city}`}
            </div>
          )}
        </div>
        <div style={{ textAlign:'right', fontSize:11, color:'#A8C4E0', lineHeight:1.6 }}>
          <div style={{ fontWeight:700, color:'#FFFFFF', fontSize:12 }}>{dateStr}</div>
          <div>Financial Year: {FY}</div>
        </div>
      </div>

      {/* ── KPI Row ── */}
      <div style={{ display:'flex', gap:0, border: S.border }}>
        <KpiBox label="Total Clients"      value={loading ? '…' : stats.clients}        color={S.blue3}   onClick={() => navigate('/client/view')} />
        <div style={{ width:1, background:'#888' }} />
        <KpiBox label="Total Vendors"      value={loading ? '…' : stats.vendors}        color='#664400'   onClick={() => navigate('/vendor/view')} />
        <div style={{ width:1, background:'#888' }} />
        <KpiBox label="Sales Orders"       value={loading ? '…' : stats.salesOrders}    color={S.green}   onClick={() => navigate('/sales-order/view')} />
        <div style={{ width:1, background:'#888' }} />
        <KpiBox label="Purchase Orders"    value={loading ? '…' : stats.purchaseOrders} color={S.blue2}   onClick={() => navigate('/purchase-order/view')} />
        <div style={{ width:1, background:'#888' }} />
        <KpiBox label="Gross Sales"        value={fmtINR(estSales)}                     color={S.blue2}   onClick={() => navigate('/sales-order/view')} />
        <div style={{ width:1, background:'#888' }} />
        <KpiBox label="Total Purchase"     value={fmtINR(estPurch)}                     color='#664400'   onClick={() => navigate('/purchase-order/view')} />
        <div style={{ width:1, background:'#888' }} />
        <KpiBox label="Pending Dues"       value={fmtINR(estPend)}                      color={S.red}     onClick={() => navigate('/account/dues')} />
      </div>

      {/* ── Main Row: Chart + Quick Actions ── */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 230px', gap:6 }}>

        {/* Bar Chart */}
        <Panel
          title={`Sales vs Purchase — FY ${FY}`}
          rightContent={
            <div style={{ display:'flex', gap:12, fontSize:11, color:'#A8C4E0' }}>
              <span>■ <span style={{ color:'#88AAFF' }}>Sales</span></span>
              <span>■ <span style={{ color:'#FFAA66' }}>Purchase</span></span>
            </div>
          }
        >
          <div style={{ padding:'8px 10px 4px' }}>
            <BarChart salesData={SALES_DATA} purchData={PURCH_DATA} />
            <div style={{ display:'flex', justifyContent:'space-between', padding:'2px 0 0', fontSize:11, color:S.grey, borderTop:'1px solid #E0E0E0', marginTop:4 }}>
              <span>Total Sales: <strong style={{ color:S.blue2 }}>{fmtINR(estSales)}</strong></span>
              <span>Total Purchase: <strong style={{ color:'#CC6600' }}>{fmtINR(estPurch)}</strong></span>
              <span>Gross Margin: <strong style={{ color:S.green }}>{fmtINR(estSales - estPurch)}</strong></span>
            </div>
          </div>
        </Panel>

        {/* Quick Actions */}
        <Panel title="Quick Actions">
          <table style={{ width:'100%', borderCollapse:'collapse', fontFamily:S.font, fontSize:12 }}>
            <tbody>
              {QUICK.map((q, i) => (
                <tr key={q.label}
                  style={{ background: i%2===0 ? '#FFFFFF' : '#F5F3EC', cursor:'pointer', borderBottom:'1px solid #E0DCD0' }}
                  onClick={() => navigate(q.path)}
                  onMouseEnter={e => e.currentTarget.style.background = '#C8DCEF'}
                  onMouseLeave={e => e.currentTarget.style.background = i%2===0 ? '#FFFFFF' : '#F5F3EC'}
                >
                  <td style={{ padding:'5px 10px', color:q.color, fontWeight:600 }}>
                    {q.label}
                  </td>
                  <td style={{ padding:'5px 8px', textAlign:'right', color:'#AAA', fontSize:11, width:20 }}>›</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </div>

      {/* ── Bottom Row: Activity + Company Info + FY Summary ── */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 220px', gap:6 }}>

        {/* Recent Activity */}
        <Panel title="Recent Activity">
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12, fontFamily:S.font }}>
            <thead>
              <tr style={{ background:'#315FA8', color:'#FFFFFF' }}>
                {['Type','Reference','Party','Amount','Status','Time'].map(h => (
                  <th key={h} style={{ padding:'4px 8px', textAlign:'left', fontWeight:700, fontSize:11, textTransform:'uppercase', letterSpacing:'0.3px', borderRight:'1px solid #2050A0', whiteSpace:'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ACTIVITIES.map((a, i) => {
                const st = STATUS_COLOR[a.status] || STATUS_COLOR.Draft;
                return (
                  <tr key={i}
                    style={{ background: i%2===0 ? '#FFFFFF' : '#F0F4F8', borderBottom:'1px solid #D0D0D0', cursor:'pointer' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#C8DCEF'}
                    onMouseLeave={e => e.currentTarget.style.background = i%2===0 ? '#FFFFFF' : '#F0F4F8'}
                  >
                    <td style={{ padding:'4px 8px', borderRight:'1px solid #E0E0E0', fontWeight:700, color:S.blue2, whiteSpace:'nowrap' }}>{a.type}</td>
                    <td style={{ padding:'4px 8px', borderRight:'1px solid #E0E0E0', fontFamily:'monospace', color:'#333', fontSize:11, whiteSpace:'nowrap' }}>{a.ref}</td>
                    <td style={{ padding:'4px 8px', borderRight:'1px solid #E0E0E0', maxWidth:180, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{a.party}</td>
                    <td style={{ padding:'4px 8px', borderRight:'1px solid #E0E0E0', fontWeight:700, textAlign:'right', whiteSpace:'nowrap', fontVariantNumeric:'tabular-nums' }}>{a.amt}</td>
                    <td style={{ padding:'4px 8px', borderRight:'1px solid #E0E0E0', whiteSpace:'nowrap' }}>
                      <span style={{ ...st, fontSize:10, fontWeight:700, padding:'1px 6px', border:`1px solid ${st.border}`, fontFamily:S.font, textTransform:'uppercase' }}>{a.status}</span>
                    </td>
                    <td style={{ padding:'4px 8px', color:'#888', fontSize:11, whiteSpace:'nowrap' }}>{a.time}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Panel>

        {/* Company Info + FY Summary */}
        <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
          <Panel title="Company Info">
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12, fontFamily:S.font }}>
              <tbody>
                {[
                  { k:'Company',   v: selectedCompany?.companyName  || '—' },
                  { k:'Type',      v: selectedCompany?.companyType  || '—' },
                  { k:'GSTIN',     v: selectedCompany?.gstin        || '—' },
                  { k:'City',      v: selectedCompany?.city         || '—' },
                  { k:'FY',        v: FY },
                  { k:'System',    v: 'Epsilon ERP v2.0' },
                ].map((r, i) => (
                  <tr key={r.k} style={{ background: i%2===0 ? '#FFFFFF' : '#F5F3EC' }}>
                    <td style={{ padding:'4px 8px', fontWeight:700, color:S.grey, width:'40%', borderBottom:'1px solid #E8E8E8', fontSize:11, textTransform:'uppercase', borderRight:'1px solid #E0E0E0' }}>{r.k}</td>
                    <td style={{ padding:'4px 8px', color:'#1A1A1A', borderBottom:'1px solid #E8E8E8', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:130, fontSize:11 }} title={r.v}>{r.v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>

          <Panel title={`FY ${FY} Summary`}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12, fontFamily:S.font }}>
              <tbody>
                {[
                  { k:'Gross Sales',   v: fmtINR(estSales), color: S.blue2 },
                  { k:'Total Purchase',v: fmtINR(estPurch),  color: '#664400' },
                  { k:'Gross Margin',  v: fmtINR(estSales-estPurch), color: S.green },
                  { k:'Outstanding',   v: fmtINR(estPend),  color: S.red },
                ].map((r, i) => (
                  <tr key={r.k} style={{ background: i%2===0 ? '#FFFFFF' : '#F5F3EC', borderBottom:'1px solid #E8E8E8' }}>
                    <td style={{ padding:'4px 8px', fontWeight:700, color:S.grey, fontSize:11, textTransform:'uppercase', borderRight:'1px solid #E0E0E0', width:'55%' }}>{r.k}</td>
                    <td style={{ padding:'4px 8px', fontWeight:700, color:r.color, fontSize:13, textAlign:'right', fontVariantNumeric:'tabular-nums' }}>{r.v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        </div>
      </div>

    </div>
  );
};

export default Dashboard;
