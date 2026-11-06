/* Beta dashboard — the home page of the new look.
 * Reads existing APIs only (sales orders, purchase orders, dues, approvals); nothing is written.
 * Figures follow the Indian financial year (April–March). */
import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';
import { useCompany } from '../../context/CompanyContext';
import { Svg } from '../../components/ui/Icon';

const F = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
const SALES = '#2a78d6', PURCH = '#eb6834';   // categorical slots 1–2 (validated pair)
const MONTHS = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'];
const EXCLUDE = ['rejected', 'cancelled', 'draft'];

/* ── helpers ── */
const num = v => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
const inr = n => '₹' + Math.round(n).toLocaleString('en-IN');
const short = n => {
  const a = Math.abs(n), s = n < 0 ? '−' : '';
  if (a >= 1e7) return `${s}₹${(a / 1e7).toFixed(a >= 1e8 ? 1 : 2)} Cr`;
  if (a >= 1e5) return `${s}₹${(a / 1e5).toFixed(a >= 1e6 ? 1 : 2)} L`;
  if (a >= 1e3) return `${s}₹${(a / 1e3).toFixed(1)} K`;
  return `${s}₹${Math.round(a)}`;
};
const fyOf = d => { const t = new Date(d); if (isNaN(t)) return null; const y = t.getFullYear(), m = t.getMonth(); return m >= 3 ? y : y - 1; };
const fyLabel = y => `FY ${String(y).slice(2)}-${String(y + 1).slice(2)}`;
const monthIdx = d => { const m = new Date(d).getMonth(); return (m + 9) % 12; };   // Apr = 0
const fmtDate = d => { const t = new Date(d); return isNaN(t) ? '—' : t.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }); };
const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; };
const niceMax = v => { if (v <= 0) return 1; const p = 10 ** Math.floor(Math.log10(v)); const f = v / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p; };

const soDate = o => o.orderDate || o.date || o.createdAt;
const poDate = o => o.poDate || o.orderDate || o.date || o.createdAt;
const statusOf = o => String(o.status || '').toLowerCase();

const STATUS_STYLE = {
  approved: ['#ECFDF3', '#067647'], active: ['#ECFDF3', '#067647'], confirmed: ['#ECFDF3', '#067647'], completed: ['#F0F9FF', '#026AA2'],
  'in-progress': ['#EFF4FF', '#1E429F'], pending: ['#FFFAEB', '#B54708'], submitted: ['#FFFAEB', '#B54708'],
  draft: ['#F2F4F7', '#475467'], rejected: ['#FEF3F2', '#B42318'], cancelled: ['#FEF3F2', '#B42318'],
};
const Status = ({ s }) => {
  const k = String(s || 'unknown').toLowerCase(); const [bg, fg] = STATUS_STYLE[k] || ['#F2F4F7', '#475467'];
  return <span className="bd-st" style={{ background: bg, color: fg }}><i style={{ background: fg }} />{k.replace(/-/g, ' ')}</span>;
};

const CSS = `
.bd { min-height:100%; padding:24px 28px 36px; font-family:${F}; color:#101828; background:#F5F7FA; }
.bd * { box-sizing:border-box; }
@keyframes bd-in { from { opacity:0; transform:translateY(6px) } to { opacity:1; transform:none } }
@keyframes bd-sh { 0% { background-position:-300px 0 } 100% { background-position:300px 0 } }
.bd-head { display:flex; align-items:flex-end; justify-content:space-between; gap:16px; flex-wrap:wrap; margin-bottom:20px; }
.bd-head h1 { margin:0; font-size:24px; font-weight:700; letter-spacing:-.4px; }
.bd-head p { margin:4px 0 0; font-size:13.5px; color:#667085; }
.bd-tools { display:flex; gap:8px; align-items:center; }
.bd-sel, .bd-btn { height:36px; border:1px solid #D0D5DD; border-radius:8px; background:#fff; font:500 13px ${F}; color:#344054; box-shadow:0 1px 2px rgba(16,24,40,.05); }
.bd-sel { padding:0 30px 0 12px; cursor:pointer; appearance:none; -webkit-appearance:none;
  background:#fff url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='6'><path d='M1 1l4 4 4-4' fill='none' stroke='%23667085' stroke-width='1.6' stroke-linecap='round'/></svg>") no-repeat right 11px center; }
.bd-btn { display:flex; align-items:center; gap:7px; padding:0 12px; cursor:pointer; }
.bd-btn:hover { background:#F9FAFB; }
.bd-btn.spin svg { animation:bd-spin .8s linear infinite; }
@keyframes bd-spin { to { transform:rotate(360deg) } }

.bd-kpis { display:grid; grid-template-columns:repeat(4, minmax(0,1fr)); gap:16px; margin-bottom:16px; }
.bd-card { background:#fff; border:1px solid #EAECF0; border-radius:12px; box-shadow:0 1px 2px rgba(16,24,40,.04); animation:bd-in .3s ease both; }
.bd-kpi { padding:18px 18px 16px; text-decoration:none; color:inherit; display:block; transition:border-color .15s, box-shadow .15s; }
.bd-kpi:hover { border-color:#C7D7FE; box-shadow:0 4px 12px rgba(16,24,40,.06); }
.bd-kpi .t { display:flex; align-items:center; gap:10px; font-size:13px; font-weight:500; color:#475467; }
.bd-kpi .t .ic { width:32px; height:32px; border-radius:8px; display:grid; place-items:center; }
.bd-kpi .v { margin-top:14px; font-size:26px; font-weight:700; letter-spacing:-.6px; font-variant-numeric:tabular-nums; }
.bd-kpi .s { margin-top:6px; display:flex; align-items:center; gap:6px; font-size:12.5px; color:#667085; flex-wrap:wrap; }
.bd-delta { display:inline-flex; align-items:center; gap:3px; padding:1px 7px 1px 5px; border-radius:99px; font-weight:600; font-size:12px; }
.bd-delta.up { background:#ECFDF3; color:#067647; }
.bd-delta.down { background:#FEF3F2; color:#B42318; }

.bd-row { display:grid; gap:16px; margin-bottom:16px; }
.bd-row.r1 { grid-template-columns:minmax(0, 2fr) minmax(0, 1fr); }
.bd-row.r2 { grid-template-columns:minmax(0, 1.6fr) minmax(0, 1fr); }
.bd-ph { display:flex; align-items:center; justify-content:space-between; gap:10px; padding:16px 18px 0; }
.bd-ph h2 { margin:0; font-size:15px; font-weight:600; }
.bd-ph small { display:block; font-size:12.5px; color:#667085; margin-top:2px; font-weight:400; }
.bd-ph a { font-size:13px; font-weight:600; color:#1A56DB; text-decoration:none; white-space:nowrap; }
.bd-ph a:hover { text-decoration:underline; }
.bd-pb { padding:14px 18px 18px; }

.bd-legend { display:flex; gap:16px; font-size:12.5px; color:#475467; }
.bd-legend span { display:inline-flex; align-items:center; gap:6px; }
.bd-legend i { width:10px; height:10px; border-radius:3px; }
.bd-chart { position:relative; }
.bd-chart svg { display:block; width:100%; height:auto; overflow:visible; }
.bd-tip { position:absolute; pointer-events:none; z-index:5; min-width:170px; padding:10px 12px; border-radius:8px; background:#101828; color:#fff; font-size:12.5px;
  box-shadow:0 8px 24px rgba(16,24,40,.25); transform:translate(-50%, calc(-100% - 10px)); white-space:nowrap; }
.bd-tip b { display:block; margin-bottom:6px; font-size:12.5px; }
.bd-tip div { display:flex; align-items:center; gap:7px; margin-top:3px; color:#D0D5DD; }
.bd-tip div i { width:8px; height:8px; border-radius:2px; }
.bd-tip div span { margin-left:auto; padding-left:12px; color:#fff; font-variant-numeric:tabular-nums; }
.bd-tbtn { border:none; background:none; color:#667085; font:500 12.5px ${F}; cursor:pointer; padding:4px 6px; border-radius:6px; }
.bd-tbtn:hover { background:#F2F4F7; color:#101828; }

.bd-list { list-style:none; margin:0; padding:0; }
.bd-li { display:flex; align-items:center; gap:12px; padding:10px 0; border-top:1px solid #F2F4F7; font-size:13.5px; }
.bd-li:first-child { border-top:none; padding-top:2px; }
.bd-li .n { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:#344054; }
.bd-li .a { font-weight:600; font-variant-numeric:tabular-nums; white-space:nowrap; }
.bd-bar { height:6px; border-radius:99px; background:#EFF4FF; margin-top:6px; overflow:hidden; }
.bd-bar i { display:block; height:100%; border-radius:99px; background:${SALES}; }
.bd-rank { width:22px; height:22px; flex-shrink:0; border-radius:6px; display:grid; place-items:center; font-size:11.5px; font-weight:600; color:#475467; background:#F2F4F7; }

.bd-table { width:100%; border-collapse:collapse; font-size:13.5px; }
.bd-table th { text-align:left; padding:10px 18px; font-size:12px; font-weight:500; color:#667085; background:#F9FAFB; border-top:1px solid #EAECF0; border-bottom:1px solid #EAECF0; white-space:nowrap; }
.bd-table td { padding:11px 18px; border-bottom:1px solid #F2F4F7; color:#344054; white-space:nowrap; }
/* thin black lines between columns */
.bd-table th { border-right:1px solid #EAECF0; }
.bd-table td { border-right:1px solid #000; }
.bd-table tr:last-child td { border-bottom:none; }
.bd-table tbody tr:hover td { background:#FAFBFC; }
.bd-table td.num, .bd-table th.num { text-align:right; font-variant-numeric:tabular-nums; }
.bd-table td b { color:#101828; font-weight:600; }
.bd-table .cl { max-width:240px; overflow:hidden; text-overflow:ellipsis; }
.bd-st { display:inline-flex; align-items:center; gap:6px; padding:2px 9px 2px 7px; border-radius:99px; font-size:12px; font-weight:500; text-transform:capitalize; }
.bd-st i { width:6px; height:6px; border-radius:50%; }

.bd-appr { display:flex; align-items:center; gap:12px; padding:10px 12px; margin-bottom:8px; border-radius:8px; border:1px solid #EAECF0; text-decoration:none; color:#344054; font-size:13.5px; }
.bd-appr:hover { background:#F9FAFB; border-color:#D0D5DD; }
.bd-appr b { margin-left:auto; min-width:28px; height:24px; padding:0 8px; border-radius:99px; display:grid; place-items:center; font-size:12.5px; background:#FFFAEB; color:#B54708; }
.bd-empty { padding:24px 6px; text-align:center; font-size:13px; color:#667085; }
.bd-sk { border-radius:6px; background:linear-gradient(90deg, #F2F4F7 0, #E9ECF1 50%, #F2F4F7 100%); background-size:600px 100%; animation:bd-sh 1.2s linear infinite; }
.bd-err { display:flex; gap:10px; align-items:center; padding:12px 14px; margin-bottom:16px; border-radius:8px; background:#FFFAEB; border:1px solid #FEDF89; color:#B54708; font-size:13.5px; }

@media (max-width: 1200px) { .bd-kpis { grid-template-columns:repeat(2, minmax(0,1fr)); } }
@media (max-width: 1000px) { .bd-row.r1, .bd-row.r2 { grid-template-columns:1fr; } }
@media (max-width: 560px) { .bd { padding:16px 14px 28px; } .bd-kpis { grid-template-columns:1fr; } .bd-head h1 { font-size:20px; } }
`;

/* ── monthly sales vs purchase (grouped bars) ── */
function MonthlyChart({ sales, purch, fy, showTable }) {
  const [hover, setHover] = useState(null);
  const W = 720, H = 260, L = 56, R = 8, T = 12, B = 28;
  const max = niceMax(Math.max(...sales, ...purch, 0));
  const iw = W - L - R, ih = H - T - B, band = iw / 12, bw = Math.min(16, (band - 14) / 2);
  const y = v => T + ih - (v / max) * ih;
  const ticks = [0, .25, .5, .75, 1].map(f => f * max);
  const bar = (v, x, color) => {
    if (v <= 0) return null;
    const top = y(v), h = T + ih - top, r = Math.min(4, h);
    return <path d={`M${x},${T + ih} V${top + r} Q${x},${top} ${x + r},${top} H${x + bw - r} Q${x + bw},${top} ${x + bw},${top + r} V${T + ih} Z`} fill={color} />;
  };
  if (showTable) {
    return (
      <table className="bd-table" style={{ marginTop: 4 }}>
        <thead><tr><th>Month</th><th className="num">Sales orders</th><th className="num">Purchase orders</th></tr></thead>
        <tbody>{MONTHS.map((m, i) => <tr key={m}><td>{m} {i < 9 ? fy : fy + 1}</td><td className="num">{inr(sales[i])}</td><td className="num">{inr(purch[i])}</td></tr>)}</tbody>
      </table>
    );
  }
  return (
    <div className="bd-chart" onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Monthly sales and purchase order value, ${fyLabel(fy)}`}>
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke={i === 0 ? '#D0D5DD' : '#F2F4F7'} strokeWidth="1" />
            <text x={L - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill="#667085" fontFamily={F}>{short(t).replace('₹', '')}</text>
          </g>
        ))}
        {MONTHS.map((m, i) => {
          const cx = L + band * i + band / 2;
          return (
            <g key={m}>
              {hover === i && <rect x={L + band * i + 2} y={T} width={band - 4} height={ih} rx="6" fill="#F2F6FF" />}
              {bar(sales[i], cx - bw - 1, SALES)}
              {bar(purch[i], cx + 1, PURCH)}
              <text x={cx} y={H - 8} textAnchor="middle" fontSize="11.5" fill={hover === i ? '#101828' : '#667085'} fontFamily={F}>{m}</text>
              <rect x={L + band * i} y={T} width={band} height={ih + B} fill="transparent" onMouseEnter={() => setHover(i)} />
            </g>
          );
        })}
      </svg>
      {hover != null && (
        <div className="bd-tip" style={{ left: `${((L + band * hover + band / 2) / W) * 100}%`, top: `${(Math.min(y(Math.max(sales[hover], purch[hover])), T + ih - 20) / H) * 100}%` }}>
          <b>{MONTHS[hover]} {hover < 9 ? fy : fy + 1}</b>
          <div><i style={{ background: SALES }} />Sales orders<span>{inr(sales[hover])}</span></div>
          <div><i style={{ background: PURCH }} />Purchase orders<span>{inr(purch[hover])}</span></div>
        </div>
      )}
    </div>
  );
}

const Sk = ({ w = '100%', h = 14, style }) => <div className="bd-sk" style={{ width: w, height: h, ...style }} />;

export default function BetaDashboard() {
  const { user } = useAuth();
  const { selectedCompany } = useCompany() || {};
  const [data, setData] = useState(null);       // { so, po, dues, appr }
  const [failed, setFailed] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fy, setFy] = useState(fyOf(new Date()));
  const [table, setTable] = useState(false);

  const load = () => {
    setLoading(true);
    const get = (url, fb) => axios.get(url).then(r => ({ ok: true, d: r.data })).catch(() => ({ ok: false, d: fb }));
    Promise.all([
      get('/api/sales-orders', []), get('/api/purchase-orders', []), get('/api/accounts/dues', { clientDues: [], vendorDues: [] }), get('/api/approvals/stats', {}),
    ]).then(([so, po, dues, appr]) => {
      setFailed([['sales orders', so], ['purchase orders', po], ['outstanding balances', dues], ['approvals', appr]].filter(([, r]) => !r.ok).map(([n]) => n));
      setData({ so: Array.isArray(so.d) ? so.d : [], po: Array.isArray(po.d) ? po.d : [], dues: dues.d || {}, appr: appr.d || {} });
      setLoading(false);
    });
  };
  useEffect(load, [selectedCompany?.companyId]);   // eslint-disable-line react-hooks/exhaustive-deps

  const m = useMemo(() => {
    if (!data) return null;
    const live = arr => arr.filter(o => !EXCLUDE.includes(statusOf(o)));
    const so = live(data.so), po = live(data.po);
    const inFy = (arr, dateOf, y) => arr.filter(o => fyOf(dateOf(o)) === y);
    const sum = arr => arr.reduce((s, o) => s + num(o.grandTotal || o.amount), 0);
    const soFy = inFy(so, soDate, fy), poFy = inFy(po, poDate, fy);
    const soPrev = inFy(so, soDate, fy - 1), poPrev = inFy(po, poDate, fy - 1);
    const sales = Array(12).fill(0), purch = Array(12).fill(0);
    soFy.forEach(o => { sales[monthIdx(soDate(o))] += num(o.grandTotal || o.amount); });
    poFy.forEach(o => { purch[monthIdx(poDate(o))] += num(o.grandTotal || o.amount); });

    const recv = (data.dues.clientDues || []).filter(d => num(d.due) > 0.5);
    const pay = (data.dues.vendorDues || []).filter(d => num(d.due) > 0.5);
    const byParty = list => {
      const mp = {}; list.forEach(d => { const k = d.entityName || '—'; mp[k] = (mp[k] || 0) + num(d.due); });
      return Object.entries(mp).sort((a, b) => b[1] - a[1]);
    };
    const clientsMap = {};
    soFy.forEach(o => { const k = o.customerName || o.clientName || o.party || '—'; clientsMap[k] = (clientsMap[k] || 0) + num(o.grandTotal || o.amount); });
    const topClients = Object.entries(clientsMap).sort((a, b) => b[1] - a[1]).slice(0, 5);

    const years = new Set([fyOf(new Date())]);
    [...so.map(soDate), ...po.map(poDate)].forEach(d => { const y = fyOf(d); if (y) years.add(y); });

    const approvals = Object.entries(data.appr).map(([k, v]) => ({ key: k, label: v?.label || k, pending: num(v?.pending) })).filter(a => a.pending > 0).sort((a, b) => b.pending - a.pending);

    return {
      soVal: sum(soFy), soCnt: soFy.length, soPrevVal: sum(soPrev),
      poVal: sum(poFy), poCnt: poFy.length, poPrevVal: sum(poPrev),
      recvVal: recv.reduce((s, d) => s + num(d.due), 0), recvCnt: recv.length, topRecv: byParty(recv).slice(0, 5),
      payVal: pay.reduce((s, d) => s + num(d.due), 0), payCnt: pay.length,
      sales, purch, topClients,
      recent: [...data.so].sort((a, b) => new Date(soDate(b)) - new Date(soDate(a))).slice(0, 7),
      years: [...years].sort((a, b) => b - a),
      approvals, apprTotal: approvals.reduce((s, a) => s + a.pending, 0),
    };
  }, [data, fy]);

  const delta = (cur, prev) => {
    if (!prev) return null;
    const p = ((cur - prev) / prev) * 100; const up = p >= 0;
    return <span className={`bd-delta ${up ? 'up' : 'down'}`}><Svg name={up ? 'trendUp' : 'trendDown'} size={13} stroke={2.2} />{Math.abs(p).toFixed(0)}%</span>;
  };

  const first = (user?.name || user?.username || '').split(' ')[0];
  const today = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  const kpis = m ? [
    { label: 'Sales orders', icon: 'file', tint: ['#EFF4FF', '#1A56DB'], value: short(m.soVal), title: inr(m.soVal), to: '/sales-order/view',
      sub: <>{delta(m.soVal, m.soPrevVal)}{m.soCnt} orders in {fyLabel(fy)}</> },
    { label: 'Purchase orders', icon: 'cart', tint: ['#FEF6EE', '#C4320A'], value: short(m.poVal), title: inr(m.poVal), to: '/purchase-order/tracking',
      sub: <>{delta(m.poVal, m.poPrevVal)}{m.poCnt} POs in {fyLabel(fy)}</> },
    { label: 'Receivable from clients', icon: 'wallet', tint: ['#ECFDF3', '#067647'], value: short(m.recvVal), title: inr(m.recvVal), to: '/account/dues?tab=client',
      sub: <>{m.recvCnt} orders outstanding · all years</> },
    { label: 'Payable to vendors', icon: 'ledger', tint: ['#FEF3F2', '#B42318'], value: short(m.payVal), title: inr(m.payVal), to: '/account/dues?tab=vendor',
      sub: <>{m.payCnt} bills / POs outstanding · all years</> },
  ] : [];

  return (
    <div className="bd">
      <style>{CSS}</style>

      <div className="bd-head">
        <div>
          <h1>{greeting()}{first ? `, ${first}` : ''}</h1>
          <p>{selectedCompany?.companyName ? `${selectedCompany.companyName} · ` : ''}{today}</p>
        </div>
        <div className="bd-tools">
          <select className="bd-sel" value={fy} onChange={e => setFy(Number(e.target.value))} aria-label="Financial year">
            {(m?.years || [fy]).map(y => <option key={y} value={y}>{fyLabel(y)}</option>)}
          </select>
          <button type="button" className={`bd-btn${loading ? ' spin' : ''}`} onClick={load} disabled={loading}><Svg name="refresh" size={15} />Refresh</button>
        </div>
      </div>

      {failed.length > 0 && !loading && (
        <div className="bd-err" role="alert"><Svg name="alert" size={17} />Could not load {failed.join(', ')}. Figures that depend on them may be incomplete.</div>
      )}

      {/* KPI cards */}
      <div className="bd-kpis">
        {loading || !m ? [0, 1, 2, 3].map(i => (
          <div key={i} className="bd-card bd-kpi"><Sk w="55%" /><Sk w="70%" h={28} style={{ marginTop: 16 }} /><Sk w="45%" h={12} style={{ marginTop: 10 }} /></div>
        )) : kpis.map((k, i) => (
          <Link key={k.label} to={k.to} className="bd-card bd-kpi" style={{ animationDelay: `${i * 40}ms` }}>
            <div className="t"><span className="ic" style={{ background: k.tint[0], color: k.tint[1] }}><Svg name={k.icon} size={17} /></span>{k.label}</div>
            <div className="v" title={k.title}>{k.value}</div>
            <div className="s">{k.sub}</div>
          </Link>
        ))}
      </div>

      {/* chart + approvals */}
      <div className="bd-row r1">
        <div className="bd-card">
          <div className="bd-ph">
            <div><h2>Sales vs purchase orders</h2><small>Order value by month · {fyLabel(fy)}</small></div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div className="bd-legend"><span><i style={{ background: SALES }} />Sales</span><span><i style={{ background: PURCH }} />Purchase</span></div>
              <button type="button" className="bd-tbtn" onClick={() => setTable(t => !t)}>{table ? 'Chart' : 'Table'}</button>
            </div>
          </div>
          <div className="bd-pb">
            {loading || !m ? <Sk h={240} /> : <MonthlyChart sales={m.sales} purch={m.purch} fy={fy} showTable={table} />}
          </div>
        </div>

        <div className="bd-card">
          <div className="bd-ph">
            <div><h2>Pending approvals</h2><small>{m ? `${m.apprTotal} waiting for action` : 'Loading…'}</small></div>
            <Link to="/approval">Open</Link>
          </div>
          <div className="bd-pb">
            {loading || !m ? [0, 1, 2, 3].map(i => <Sk key={i} h={40} style={{ marginBottom: 8 }} />)
              : m.approvals.length ? m.approvals.slice(0, 6).map(a => (
                <Link key={a.key} to="/approval" className="bd-appr"><Svg name="clock" size={16} style={{ color: '#98A2B3' }} />{a.label}<b>{a.pending}</b></Link>
              )) : <div className="bd-empty"><Svg name="okCircle" size={22} style={{ color: '#079455' }} /><div style={{ marginTop: 6 }}>Nothing waiting — all caught up.</div></div>}
          </div>
        </div>
      </div>

      {/* recent orders + top clients / receivables */}
      <div className="bd-row r2">
        <div className="bd-card" style={{ overflow: 'hidden' }}>
          <div className="bd-ph" style={{ paddingBottom: 14 }}>
            <div><h2>Recent sales orders</h2><small>Latest orders across all years</small></div>
            <Link to="/sales-order/view">View all</Link>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="bd-table">
              <thead><tr><th>Order no.</th><th>Client</th><th>Date</th><th className="num">Value</th><th>Status</th></tr></thead>
              <tbody>
                {loading || !m ? [0, 1, 2, 3, 4].map(i => <tr key={i}><td colSpan={5}><Sk h={16} /></td></tr>)
                  : m.recent.length ? m.recent.map(o => (
                    <tr key={o.orderId || o.id || o.orderNo}>
                      <td><b>{o.orderNo || o.voucherNumber || o.orderId}</b></td>
                      <td className="cl" title={o.customerName}>{o.customerName || o.clientName || o.party || '—'}</td>
                      <td>{fmtDate(soDate(o))}</td>
                      <td className="num">{inr(num(o.grandTotal || o.amount))}</td>
                      <td><Status s={o.status} /></td>
                    </tr>
                  )) : <tr><td colSpan={5}><div className="bd-empty">No sales orders yet.</div></td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        <div style={{ display: 'grid', gap: 16, alignContent: 'start' }}>
          <div className="bd-card">
            <div className="bd-ph"><div><h2>Top clients</h2><small>By order value · {fyLabel(fy)}</small></div></div>
            <div className="bd-pb">
              {loading || !m ? [0, 1, 2].map(i => <Sk key={i} h={30} style={{ marginBottom: 10 }} />)
                : m.topClients.length ? (
                  <ul className="bd-list">
                    {m.topClients.map(([n, v], i) => (
                      <li key={n} className="bd-li" style={{ display: 'block' }}>
                        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                          <span className="bd-rank">{i + 1}</span><span className="n" title={n}>{n}</span><span className="a">{short(v)}</span>
                        </div>
                        <div className="bd-bar" style={{ marginLeft: 32 }}><i style={{ width: `${(v / m.topClients[0][1]) * 100}%` }} /></div>
                      </li>
                    ))}
                  </ul>
                ) : <div className="bd-empty">No orders in {fyLabel(fy)}.</div>}
            </div>
          </div>

          <div className="bd-card">
            <div className="bd-ph"><div><h2>Largest receivables</h2><small>Amount due by client</small></div><Link to="/account/dues?tab=client">Details</Link></div>
            <div className="bd-pb">
              {loading || !m ? [0, 1, 2].map(i => <Sk key={i} h={20} style={{ marginBottom: 10 }} />)
                : m.topRecv.length ? (
                  <ul className="bd-list">
                    {m.topRecv.map(([n, v]) => <li key={n} className="bd-li"><span className="n" title={n}>{n}</span><span className="a">{inr(v)}</span></li>)}
                  </ul>
                ) : <div className="bd-empty">No amounts due from clients.</div>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
