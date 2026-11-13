/* Beta dashboard — the home page of the new look: the business at a glance.
 * Reads existing APIs only, nothing is written:
 *   bills (sales / purchase invoices), accounts/payments (receipts in, payments out), accounts/dues (what each
 *   client owes / we owe, per order), sales-orders, approvals/stats, gst-portal (download status).
 * Period switch: this month / this quarter / financial year to date — each compared with the period before it
 * (FY to date: the same months last year). Colours: teal = sales / money in, orange = purchases / money out
 * (validated pair); status colours only together with words. No bank balances on this page. */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';
import { useCompany } from '../../context/CompanyContext';
import { Svg } from '../../components/ui/Icon';
import { isAppMode } from '../../appBridge';

const F = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
const TEAL = '#03444f';
const C_IN = '#0F9AAE', C_OUT = '#eb6834';
const MONTHS = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'];
const AGE = [['0–30 days', 0, 30, '#FCD9C5'], ['31–60 days', 31, 60, '#F5A57A'], ['61–90 days', 61, 90, '#E1703C'], ['90+ days', 91, 1e9, '#A8431A']];

/* ── helpers ── */
const num = v => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
const inr = n => '₹' + Math.round(n).toLocaleString('en-IN');
const short = n => {
  const a = Math.abs(n), s = n < 0 ? '−' : '';
  if (a >= 1e7) return `${s}₹${(a / 1e7).toFixed(2)} Cr`;
  if (a >= 1e5) return `${s}₹${(a / 1e5).toFixed(2)} L`;
  if (a >= 1e3) return `${s}₹${(a / 1e3).toFixed(1)} K`;
  return `${s}₹${Math.round(a)}`;
};
const tick = n => short(n).replace('₹', '');
const ymd = d => { const t = new Date(d); return isNaN(t) ? '' : `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`; };
const fyOf = d => { const t = new Date(d); if (isNaN(t)) return null; return t.getMonth() >= 3 ? t.getFullYear() : t.getFullYear() - 1; };
const fyLabel = y => `FY ${String(y).slice(2)}-${String(y + 1).slice(2)}`;
const monthIdx = d => (new Date(d).getMonth() + 9) % 12;
const fmtDay = d => { const t = new Date(d); return isNaN(t) ? '—' : t.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }); };
const daysSince = d => { const t = new Date(d); return isNaN(t) ? 0 : Math.max(0, Math.floor((Date.now() - t) / 864e5)); };
const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; };
const niceMax = v => { if (v <= 0) return 1; const p = 10 ** Math.floor(Math.log10(v)); const f = v / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p; };
const dead = s => /cancel|reject|draft|void|deleted/i.test(String(s || ''));
const billTax = b => num(b.totalGST) || (num(b.totalIGST) + num(b.totalCGST) + num(b.totalSGST));
const sum = (arr, f) => arr.reduce((t, x) => t + num(f(x)), 0);
const initials = s => String(s || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();

/* the chosen period and the one before it, as [from, to] ISO days */
function periods(kind, fy) {
  const now = new Date(), curFy = fyOf(now);
  const d = (y, m, dd) => ymd(new Date(y, m, dd));
  if (kind === 'month' && fy === curFy) {
    const y = now.getFullYear(), m = now.getMonth();
    return { cur: [d(y, m, 1), d(y, m + 1, 0)], prev: [d(y, m - 1, 1), d(y, m, 0)], label: now.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }), vs: 'vs last month' };
  }
  if (kind === 'quarter' && fy === curFy) {
    const y = now.getFullYear(), q0 = Math.floor(now.getMonth() / 3) * 3;
    return { cur: [d(y, q0, 1), d(y, q0 + 3, 0)], prev: [d(y, q0 - 3, 1), d(y, q0, 0)], label: `${MONTHS[(q0 + 9) % 12]}–${MONTHS[(q0 + 11) % 12]} ${y}`, vs: 'vs last quarter' };
  }
  // financial year to date (a past year: the whole year), against the same months a year earlier
  const end = fy === curFy ? now : new Date(fy + 1, 2, 31);
  const prevEnd = new Date(end); prevEnd.setFullYear(end.getFullYear() - 1);
  return { cur: [d(fy, 3, 1), ymd(end)], prev: [d(fy - 1, 3, 1), ymd(prevEnd)], label: fy === curFy ? `${fyLabel(fy)} to date` : fyLabel(fy), vs: 'vs same period last year' };
}
const inR = (d, [a, b]) => { const s = String(d || '').slice(0, 10); return s >= a && s <= b; };

/* ── charts ── */
/* revenue vs purchases by month: two lines with a light area under each, crosshair + tooltip on hover */
function TrendChart({ a, b, la, lb, fy, cut }) {
  const [hov, setHov] = useState(null);
  const ref = useRef(null);
  const W = 760, H = 250, L = 46, R = 12, T = 12, B = 26;
  const max = niceMax(Math.max(1, ...a, ...b));
  const n = cut + 1;   // months to draw (the future ones stay empty)
  const xs = i => L + (i * (W - L - R)) / 11;
  const y = v => T + (H - T - B) * (1 - v / max);
  const path = v => v.slice(0, n).map((x, i) => `${i ? 'L' : 'M'}${xs(i).toFixed(1)},${y(x).toFixed(1)}`).join(' ');
  const area = v => `${path(v)} L${xs(n - 1).toFixed(1)},${H - B} L${xs(0).toFixed(1)},${H - B} Z`;
  const move = e => {
    const r = ref.current.getBoundingClientRect(), px = ((e.clientX - r.left) / r.width) * W;
    setHov(Math.max(0, Math.min(n - 1, Math.round(((px - L) / (W - L - R)) * 11))));
  };
  return (
    <div className="db-chart" onMouseLeave={() => setHov(null)}>
      <svg ref={ref} viewBox={`0 0 ${W} ${H}`} onMouseMove={move} role="img" aria-label={`${la} and ${lb} by month`}>
        <defs>
          <linearGradient id="g-in" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={C_IN} stopOpacity=".22" /><stop offset="1" stopColor={C_IN} stopOpacity="0" /></linearGradient>
          <linearGradient id="g-out" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={C_OUT} stopOpacity=".14" /><stop offset="1" stopColor={C_OUT} stopOpacity="0" /></linearGradient>
        </defs>
        {[0, 0.25, 0.5, 0.75, 1].map(f => <g key={f}><line x1={L} x2={W - R} y1={y(max * f)} y2={y(max * f)} stroke={f ? '#EEF2F4' : '#D9E2E5'} /><text x={L - 8} y={y(max * f) + 3.5} textAnchor="end" className="ax">{tick(max * f)}</text></g>)}
        {MONTHS.map((m, i) => <text key={m} x={xs(i)} y={H - 8} textAnchor="middle" className={`ax${i > cut ? ' fut' : ''}`}>{m}</text>)}
        <path d={area(b)} fill="url(#g-out)" /><path d={area(a)} fill="url(#g-in)" />
        <path d={path(b)} fill="none" stroke={C_OUT} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        <path d={path(a)} fill="none" stroke={C_IN} strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />
        {hov != null && <g>
          <line x1={xs(hov)} x2={xs(hov)} y1={T} y2={H - B} stroke="#98A2B3" strokeDasharray="3 3" />
          <circle cx={xs(hov)} cy={y(b[hov])} r="4.5" fill={C_OUT} stroke="#fff" strokeWidth="2" />
          <circle cx={xs(hov)} cy={y(a[hov])} r="4.5" fill={C_IN} stroke="#fff" strokeWidth="2" />
        </g>}
      </svg>
      {hov != null && (
        <div className="db-tip" style={{ left: `${(xs(hov) / W) * 100}%` }}>
          <b>{MONTHS[hov]} {hov >= 9 ? fy + 1 : fy}</b>
          <span><i style={{ background: C_IN }} />{la}<em>{inr(a[hov])}</em></span>
          <span><i style={{ background: C_OUT }} />{lb}<em>{inr(b[hov])}</em></span>
          <span className="net">Difference<em>{inr(a[hov] - b[hov])}</em></span>
        </div>)}
    </div>
  );
}
/* money in / out by month: slim paired bars */
function FlowBars({ a, b, fy, cut }) {
  const [hov, setHov] = useState(null);
  const W = 760, H = 200, L = 46, R = 12, T = 10, B = 24;
  const max = niceMax(Math.max(1, ...a, ...b));
  const cw = (W - L - R) / 12, bw = Math.min(11, (cw - 12) / 2);
  const y = v => T + (H - T - B) * (1 - v / max);
  const bar = (x, v, c) => { const h = H - B - y(v); if (h < 0.5) return null; const r = Math.min(3, h, bw / 2);
    return <path d={`M${x},${H - B} v${-(h - r)} q0,${-r} ${r},${-r} h${bw - 2 * r} q${r},0 ${r},${r} v${h - r} z`} fill={c} />; };
  return (
    <div className="db-chart" onMouseLeave={() => setHov(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Receipts in and payments out by month">
        {[0, 0.5, 1].map(f => <g key={f}><line x1={L} x2={W - R} y1={y(max * f)} y2={y(max * f)} stroke={f ? '#EEF2F4' : '#D9E2E5'} /><text x={L - 8} y={y(max * f) + 3.5} textAnchor="end" className="ax">{tick(max * f)}</text></g>)}
        {MONTHS.map((m, i) => { const x0 = L + i * cw + (cw - 2 * bw - 2) / 2; return (
          <g key={m}>
            {hov === i && <rect x={L + i * cw + 3} y={T} width={cw - 6} height={H - T - B} rx="5" fill="#F2F7F8" />}
            {bar(x0, a[i], C_IN)}{bar(x0 + bw + 2, b[i], C_OUT)}
            <text x={L + i * cw + cw / 2} y={H - 7} textAnchor="middle" className={`ax${i > cut ? ' fut' : ''}`}>{m}</text>
            <rect x={L + i * cw} y={T} width={cw} height={H - T} fill="transparent" onMouseEnter={() => setHov(i)} />
          </g>); })}
      </svg>
      {hov != null && (
        <div className="db-tip" style={{ left: `${((L + hov * cw + cw / 2) / W) * 100}%` }}>
          <b>{MONTHS[hov]} {hov >= 9 ? fy + 1 : fy}</b>
          <span><i style={{ background: C_IN }} />Received<em>{inr(a[hov])}</em></span>
          <span><i style={{ background: C_OUT }} />Paid<em>{inr(b[hov])}</em></span>
          <span className="net">Net<em>{inr(a[hov] - b[hov])}</em></span>
        </div>)}
    </div>
  );
}
function Spark({ v, c }) {
  if (v.length < 2) return null;
  const max = Math.max(1, ...v), W = 120, H = 28;
  const pts = v.map((x, i) => `${(i / (v.length - 1)) * W},${H - 2 - (x / max) * (H - 4)}`);
  return <svg className="db-spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
    <path d={`M${pts.join(' L')} L${W},${H} L0,${H} Z`} fill={c} opacity=".1" /><polyline points={pts.join(' ')} fill="none" stroke={c} strokeWidth="1.8" strokeLinejoin="round" vectorEffect="non-scaling-stroke" /></svg>;
}

export default function BetaDashboard() {
  const { user } = useAuth() || {};
  const { selectedCompany } = useCompany() || {};
  const companyId = selectedCompany?.companyId;
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fy, setFy] = useState(fyOf(new Date()));
  const [per, setPer] = useState('fy');
  const [menu, setMenu] = useState(false);

  const load = () => {
    if (!companyId) return;
    setLoading(true);
    const get = (url, params, fb) => axios.get(url, { params: { companyId, ...params } }).then(r => ({ ok: true, d: r.data ?? fb })).catch(() => ({ ok: false, d: fb }));
    Promise.all([
      get('/api/bills', { type: 'sales' }, []), get('/api/bills', { type: 'purchase' }, []), get('/api/accounts/payments', {}, []),
      get('/api/accounts/dues', {}, { clientDues: [], vendorDues: [] }), get('/api/sales-orders', {}, []),
      get('/api/approvals/stats', {}, {}), get('/api/gst-portal', {}, {}),
    ]).then(([sb, pb, pay, dues, so, appr, gst]) => {
      setFailed([['sales bills', sb], ['purchase bills', pb], ['receipts & payments', pay], ['dues', dues], ['sales orders', so], ['approvals', appr]].filter(([, r]) => !r.ok).map(([n]) => n));
      const arr = r => (Array.isArray(r.d) ? r.d : []);
      setData({ sb: arr(sb), pb: arr(pb), pay: arr(pay), dues: dues.d || {}, so: arr(so), appr: appr.d || {}, gst: gst.d || {} });
      setLoading(false);
    });
  };
  useEffect(load, [companyId]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!menu) return undefined; const c = () => setMenu(false); setTimeout(() => document.addEventListener('click', c), 0); return () => document.removeEventListener('click', c); }, [menu]);

  const curFy = fyOf(new Date());
  const P = useMemo(() => periods(fy === curFy ? per : 'fy', fy), [per, fy, curFy]);
  const m = useMemo(() => {
    if (!data) return null;
    const cut = fy === curFy ? monthIdx(new Date()) : 11;
    const sales = data.sb.filter(b => b.type !== 'purchase' && !dead(b.status)), purch = data.pb.filter(b => b.type !== 'sales' && !dead(b.status));
    const bd = b => b.billDate || b.createdAt;
    const pays = data.pay.filter(p => /confirm|approv|posted|paid/i.test(String(p.status || '')));
    const pd = p => p.date || p.transactionDate || p.createdAt;
    const rec = pays.filter(p => p.type === 'receipt'), out = pays.filter(p => p.type === 'payment');
    const soLive = data.so.filter(o => !dead(o.status));
    const od = o => o.orderDate || o.createdAt;
    const soVal = o => num(o.grandTotal || o.orderTotal);
    const monthly = (arr, dateOf, val) => { const o = Array(12).fill(0); arr.forEach(x => { if (fyOf(dateOf(x)) === fy) o[monthIdx(dateOf(x))] += num(val(x)); }); return o; };
    const within = (arr, dateOf, val, r) => sum(arr.filter(x => inR(dateOf(x), r)), val);
    const k = (arr, dateOf, val) => ({ cur: within(arr, dateOf, val, P.cur), prev: within(arr, dateOf, val, P.prev) });

    const salesM = monthly(sales, bd, b => b.grandTotal), purchM = monthly(purch, bd, b => b.grandTotal);
    const inM = monthly(rec, pd, p => p.amount), outM = monthly(out, pd, p => p.amount), soM = monthly(soLive, od, soVal);

    // receivables / payables (per order), ageing from the order date
    const recv = (data.dues.clientDues || []).filter(d => num(d.due) > 0.5 && !dead(d.status));
    const payb = (data.dues.vendorDues || []).filter(d => num(d.due) > 0.5 && !dead(d.status));
    const recvAmt = sum(recv, d => d.due);
    const ageing = AGE.map(([label, lo, hi, c]) => { const rows = recv.filter(d => { const n = daysSince(d.orderDate); return n >= lo && n <= hi; }); return { label, c, amt: sum(rows, d => d.due), n: rows.length }; });
    const overdue = sum(recv.filter(d => daysSince(d.orderDate) > 30), d => d.due);
    const followUp = recv.map(d => ({ ...d, days: daysSince(d.orderDate) })).filter(d => d.days > 30).sort((x, y) => num(y.due) - num(x.due)).slice(0, 6);
    const openOrders = (data.dues.clientDues || []).filter(d => !dead(d.status) && !/closed|complete/i.test(String(d.status || '')));
    const orderBook = sum(openOrders, d => num(d.orderTotal) - num(d.received));

    // order to cash in the period
    const booked = within(soLive, od, soVal, P.cur), invoiced = within(sales, bd, b => b.grandTotal, P.cur), collected = within(rec, pd, p => p.amount, P.cur);

    // top customers / products by invoiced value in the period
    const inPer = sales.filter(b => inR(bd(b), P.cur));
    const cm = {}; inPer.forEach(b => { const k2 = b.partyName || '—'; cm[k2] = (cm[k2] || 0) + num(b.grandTotal); });
    const topClients = Object.entries(cm).sort((x, y) => y[1] - x[1]).slice(0, 5);
    const pmap = {}; inPer.forEach(b => (b.items || []).forEach(it => {
      if (it.unit === 'LOT' && it.itemIdx == null) return;
      const k2 = String(it.description || it.itemName || '').trim(); if (!k2) return;
      const p = pmap[k2] = pmap[k2] || { v: 0, q: 0, u: it.unit || '' }; p.v += num(it.taxable) || num(it.qty) * num(it.rate); p.q += num(it.qty);
    }));
    const topProducts = Object.entries(pmap).sort((x, y) => y[1].v - x[1].v).slice(0, 5);

    // GST of last month from the books + portal status
    const lm = new Date(); lm.setDate(1); lm.setMonth(lm.getMonth() - 1);
    const lmKey = `${lm.getFullYear()}-${String(lm.getMonth() + 1).padStart(2, '0')}`;
    const inLm = b => String(bd(b) || '').slice(0, 7) === lmKey;
    const outTax = sum(sales.filter(inLm), billTax), itc = sum(purch.filter(inLm), billTax);
    const gi = data.gst[`${String(lm.getMonth() + 1).padStart(2, '0')}${lm.getFullYear()}`] || {};

    const recent = [
      ...sales.map(b => ({ k: 'Invoice', c: C_IN, no: b.billNo || b.billId, who: b.partyName, amt: num(b.grandTotal), d: bd(b), to: '/beta/sales' })),
      ...purch.map(b => ({ k: 'Purchase bill', c: C_OUT, no: b.vendorBillNo || b.billNo, who: b.partyName, amt: num(b.grandTotal), d: bd(b), to: '/beta/purchase-bill' })),
      ...rec.map(p => ({ k: 'Receipt', c: C_IN, no: p.referenceNo || `#${p.paymentId}`, who: p.entityName || p.party, amt: num(p.amount), d: pd(p), to: '/beta/account/receipt' })),
      ...out.map(p => ({ k: 'Payment', c: C_OUT, no: p.referenceNo || `#${p.paymentId}`, who: p.entityName || p.party, amt: num(p.amount), d: pd(p), to: '/beta/account/payment' })),
      ...soLive.map(o => ({ k: 'Sales order', c: TEAL, no: o.orderNo || o.orderId, who: o.customerName || o.clientName, amt: soVal(o), d: od(o), to: '/beta/order' })),
    ].filter(r => r.d && !isNaN(new Date(r.d))).sort((x, y) => String(y.d).localeCompare(String(x.d))).slice(0, 7);

    const years = new Set([curFy]); [...sales, ...purch].forEach(b => { const yy = fyOf(bd(b)); if (yy) years.add(yy); });
    const approvals = Object.entries(data.appr).map(([key, v]) => ({ key, label: v?.label || key, pending: num(v?.pending) })).filter(a => a.pending > 0).sort((a, b) => b.pending - a.pending);
    const spark = arr => arr.slice(0, cut + 1);
    return {
      cut, salesM, purchM, inM, outM,
      kpi: { rev: k(sales, bd, b => b.grandTotal), col: k(rec, pd, p => p.amount), pur: k(purch, bd, b => b.grandTotal), ord: k(soLive, od, soVal) },
      sparks: { rev: spark(salesM), col: spark(inM), pur: spark(purchM), ord: spark(soM) },
      recvAmt, recvN: recv.length, overdue, payAmt: sum(payb, d => d.due), payN: payb.length, orderBook,
      ageing, followUp, booked, invoiced, collected, topClients, topProducts, recent,
      gst: { label: lm.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }), outTax, itc, net: outTax - itc, r1: !!gi.r1, r2b: !!gi.r2b, r1Req: !!gi.r1Req && !gi.r1 },
      years: [...years].sort((a, b) => b - a), approvals, apprTotal: approvals.reduce((t, a) => t + a.pending, 0),
    };
  }, [data, fy, curFy, P]);

  const first = (user?.name || user?.username || '').split(' ')[0];
  const delta = (c, p, goodUp = true) => {
    if (!p) return <span className="db-dl n">— {P.vs}</span>;
    const pc = ((c - p) / p) * 100, up = pc >= 0, good = up === goodUp;
    return <span className={`db-dl ${good ? 'up' : 'down'}`}><Svg name={up ? 'trendUp' : 'trendDown'} size={12} stroke={2.2} />{Math.abs(pc) >= 1000 ? '>999' : Math.abs(pc).toFixed(0)}%<em>{P.vs}</em></span>;
  };
  const sk = <span className="db-sk" />;
  const KPIS = m ? [
    { t: 'Revenue', h: 'Sales invoiced (incl. GST)', v: m.kpi.rev.cur, d: delta(m.kpi.rev.cur, m.kpi.rev.prev), s: [m.sparks.rev, C_IN], to: '/beta/sales' },
    { t: 'Collections', h: 'Money received from clients', v: m.kpi.col.cur, d: delta(m.kpi.col.cur, m.kpi.col.prev), s: [m.sparks.col, C_IN], to: '/beta/account/receipt' },
    { t: 'Purchases', h: 'Purchase bills booked', v: m.kpi.pur.cur, d: delta(m.kpi.pur.cur, m.kpi.pur.prev, false), s: [m.sparks.pur, C_OUT], to: '/beta/purchase-bill' },
    { t: 'Orders booked', h: 'Sales orders received', v: m.kpi.ord.cur, d: delta(m.kpi.ord.cur, m.kpi.ord.prev), s: [m.sparks.ord, TEAL], to: '/beta/order' },
    { t: 'Receivables', h: 'Due from clients (all orders)', v: m.recvAmt, d: <span className="db-dl warn"><Svg name="alert" size={12} />{short(m.overdue)} overdue 30+ days</span>, to: '/beta/books/ageing' },
    { t: 'Payables', h: 'Due to vendors', v: m.payAmt, d: <span className="db-dl n">{m.payN} vendor orders open</span>, to: '/beta/purchase-dues' },
  ] : [];
  const o2c = m ? [['Orders booked', m.booked, TEAL], ['Invoiced', m.invoiced, C_IN], ['Collected', m.collected, '#0B7A5A']] : [];
  const o2cMax = m ? Math.max(1, m.booked, m.invoiced, m.collected) : 1;

  return (
    <div className="db">
      <style>{CSS}</style>
      <div className="db-head">
        <div className="db-title">
          <h1>{greeting()}{first ? `, ${first}` : ''}</h1>
          <p>{selectedCompany?.companyName || selectedCompany?.name || ''} <span>·</span> {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })} <span>·</span> {P.label}</p>
        </div>
        <div className="db-tools">
          {fy === curFy && <div className="db-seg" role="group" aria-label="Period">
            {[['month', 'This month'], ['quarter', 'This quarter'], ['fy', 'Year to date']].map(([k, l]) => <button key={k} type="button" className={per === k ? 'on' : ''} aria-pressed={per === k} onClick={() => setPer(k)}>{l}</button>)}
          </div>}
          <select className="db-sel" value={fy} onChange={e => setFy(+e.target.value)} aria-label="Financial year">{(m?.years || [fy]).map(y => <option key={y} value={y}>{fyLabel(y)}</option>)}</select>
          {!isAppMode() && <a className="db-app" href="/app/android/super-erp.apk" download="super-erp.apk" title="Install the Super ERP app on an Android phone (open this page on the phone, or send it the link)">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="6" y="2" width="12" height="20" rx="2.5" /><path d="M12 7v7M9 11l3 3 3-3M10.5 18.5h3" /></svg>
            Download Android App</a>}
          <button type="button" className={`db-ib${loading ? ' spin' : ''}`} onClick={load} aria-label="Refresh" title="Refresh"><Svg name="refresh" size={15} /></button>
          <div className="db-new">
            <button type="button" className="db-pri" onClick={() => setMenu(v => !v)} aria-expanded={menu}><Svg name="plus" size={14} />Create<Svg name="chevDown" size={13} /></button>
            {menu && <div className="db-menu" role="menu">
              {[['Sales order', '/beta/order?tab=create', 'ledger'], ['Sales invoice', '/beta/sales', 'file'], ['Receipt', '/beta/account/receipt', 'wallet'], ['Purchase order', '/beta/po', 'cart'], ['Payment', '/beta/account/payment', 'wallet'], ['Expense', '/beta/account/expense?tab=create', 'file']].map(([l, to, ic]) =>
                <Link key={l} to={to} role="menuitem"><Svg name={ic} size={14} />{l}</Link>)}
            </div>}
          </div>
        </div>
      </div>

      {failed.length > 0 && <div className="db-warn" role="status"><Svg name="alert" size={14} />Could not load: {failed.join(', ')}. The rest is shown.</div>}

      <section className="db-card db-kpis">
        {(m ? KPIS : Array(6).fill(null)).map((k, i) => k ? (
          <Link key={k.t} to={k.to} className="db-kpi" title={k.h}>
            <span className="t">{k.t}</span>
            <b className="v">{short(k.v)}</b>
            <span className="d">{k.d}</span>
            {k.s && <Spark v={k.s[0]} c={k.s[1]} />}
          </Link>) : <div key={i} className="db-kpi">{sk}{sk}</div>)}
      </section>

      <div className="db-grid g1">
        <section className="db-card">
          <div className="db-ch"><div><h2>Revenue vs purchases</h2><small>Invoiced value by month · {fyLabel(fy)}</small></div>
            <div className="db-leg"><span><i style={{ background: C_IN }} />Revenue {m && <b>{short(m.salesM.reduce((t, v) => t + v, 0))}</b>}</span><span><i style={{ background: C_OUT }} />Purchases {m && <b>{short(m.purchM.reduce((t, v) => t + v, 0))}</b>}</span></div></div>
          {m ? <TrendChart a={m.salesM} b={m.purchM} la="Revenue" lb="Purchases" fy={fy} cut={m.cut} /> : <div className="db-pad">{sk}{sk}{sk}</div>}
        </section>
        <section className="db-card">
          <div className="db-ch"><div><h2>Order to cash</h2><small>{P.label}</small></div></div>
          <div className="db-pad">
            {m ? <>
              {o2c.map(([l, v, c], i) => (
                <div key={l} className="db-o2c">
                  <div className="l"><span>{l}</span><b>{short(v)}</b></div>
                  <div className="bar"><i style={{ width: `${(v / o2cMax) * 100}%`, background: c }} /></div>
                  {i > 0 && <small>{o2c[i - 1][1] ? `${Math.round((v / o2c[i - 1][1]) * 100)}% of ${o2c[i - 1][0].toLowerCase()}` : '—'}</small>}
                </div>))}
              <div className="db-o2c-f">
                <div><span>Open order book</span><b>{short(m.orderBook)}</b></div>
                <div><span>Still to collect</span><b>{short(m.recvAmt)}</b></div>
              </div>
            </> : <>{sk}{sk}{sk}</>}
          </div>
        </section>
      </div>

      <div className="db-grid g1">
        <section className="db-card">
          <div className="db-ch"><div><h2>Cash flow</h2><small>Received vs paid by month · {fyLabel(fy)}</small></div>
            <div className="db-leg"><span><i style={{ background: C_IN }} />Received {m && <b>{short(m.inM.reduce((t, v) => t + v, 0))}</b>}</span><span><i style={{ background: C_OUT }} />Paid {m && <b>{short(m.outM.reduce((t, v) => t + v, 0))}</b>}</span></div></div>
          {m ? <FlowBars a={m.inM} b={m.outM} fy={fy} cut={m.cut} /> : <div className="db-pad">{sk}{sk}</div>}
        </section>
        <section className="db-card">
          <div className="db-ch"><div><h2>Receivables ageing</h2><small>{m ? `${short(m.recvAmt)} on ${m.recvN} orders · from order date` : 'Loading…'}</small></div><Link className="db-lnk" to="/beta/books/ageing">View all</Link></div>
          <div className="db-pad">
            {m ? <>
              <div className="db-stack" role="img" aria-label="Receivables by age">{m.ageing.map(a => a.amt > 0 && <i key={a.label} style={{ flex: a.amt, background: a.c }} title={`${a.label}: ${inr(a.amt)}`} />)}</div>
              <table className="db-at"><tbody>{m.ageing.map(a => (
                <tr key={a.label}><td><i style={{ background: a.c }} />{a.label}</td><td className="r mu">{a.n} orders</td><td className="r b">{short(a.amt)}</td><td className="r mu">{m.recvAmt ? Math.round((a.amt / m.recvAmt) * 100) : 0}%</td></tr>))}</tbody></table>
            </> : <>{sk}{sk}{sk}</>}
          </div>
        </section>
      </div>

      <div className="db-grid g3">
        <section className="db-card">
          <div className="db-ch"><div><h2>Top customers</h2><small>By invoiced value · {P.label}</small></div></div>
          <div className="db-list">
            {!m ? <div className="db-pad">{sk}{sk}</div> : !m.topClients.length ? <div className="db-empty">No invoices in this period.</div>
              : m.topClients.map(([nm, v], i) => (
                <div key={nm} className="db-row">
                  <span className="av" style={{ background: i === 0 ? '#E0F2F4' : '#F2F4F7', color: TEAL }}>{initials(nm)}</span>
                  <div className="tx"><b title={nm}>{nm}</b><div className="sh"><i style={{ width: `${(v / m.topClients[0][1]) * 100}%` }} /></div></div>
                  <span className="amt">{short(v)}</span>
                </div>))}
          </div>
        </section>
        <section className="db-card">
          <div className="db-ch"><div><h2>Top products</h2><small>By invoiced value (before GST) · {P.label}</small></div></div>
          <div className="db-list">
            {!m ? <div className="db-pad">{sk}{sk}</div> : !m.topProducts.length ? <div className="db-empty">No invoices in this period.</div>
              : m.topProducts.map(([nm, p], i) => (
                <div key={nm} className="db-row">
                  <span className="rk">{i + 1}</span>
                  <div className="tx"><b title={nm}>{nm}</b><small>{Math.round(p.q * 100) / 100} {p.u}</small></div>
                  <span className="amt">{short(p.v)}</span>
                </div>))}
          </div>
        </section>
        <section className="db-card">
          <div className="db-ch"><div><h2>Follow up</h2><small>Largest dues older than 30 days</small></div><Link className="db-lnk" to="/beta/books/ageing">All dues</Link></div>
          <div className="db-list">
            {!m ? <div className="db-pad">{sk}{sk}</div> : !m.followUp.length ? <div className="db-empty ok"><Svg name="okCircle" size={16} />Nothing overdue — well done.</div>
              : m.followUp.map(d => (
                <div key={d.orderId} className="db-row">
                  <span className={`db-days${d.days > 90 ? ' hi' : ''}`}>{d.days}d</span>
                  <div className="tx"><b title={d.entityName}>{d.entityName || '—'}</b><small>{d.orderNo}</small></div>
                  <span className="amt">{short(d.due)}</span>
                </div>))}
          </div>
        </section>
      </div>

      <div className="db-grid g2">
        <section className="db-card">
          <div className="db-ch"><div><h2>Recent activity</h2><small>Latest documents across the company</small></div></div>
          <div className="db-tl">
            {!m ? <div className="db-pad">{sk}{sk}</div> : m.recent.map((r, i) => (
              <Link key={i} to={r.to} className="db-tli">
                <span className="dot" style={{ borderColor: r.c }} />
                <div className="tx"><b title={r.who}>{r.who || '—'}</b><small>{r.k} · {r.no}</small></div>
                <span className="amt">{short(r.amt)}<small>{fmtDay(r.d)}</small></span>
              </Link>))}
          </div>
        </section>
        <div className="db-side">
          <section className="db-card">
            <div className="db-ch"><div><h2>Approvals</h2><small>{m ? (m.apprTotal ? `${m.apprTotal} waiting for action` : 'All clear') : 'Loading…'}</small></div><Link className="db-lnk" to="/beta/admin/approvals">Open</Link></div>
            <div className="db-pad">{m && (m.approvals.length ? <div className="db-ap">{m.approvals.slice(0, 6).map(a => <Link key={a.key} to="/beta/admin/approvals"><b>{a.pending}</b><span>{a.label}</span></Link>)}</div>
              : <div className="db-empty ok"><Svg name="okCircle" size={16} />Nothing waiting.</div>)}</div>
          </section>
          <section className="db-card">
            <div className="db-ch"><div><h2>GST · {m ? m.gst.label : ''}</h2><small>From the books: output tax − input credit</small></div><Link className="db-lnk" to="/beta/books/gst">Returns</Link></div>
            {m ? <div className="db-pad">
              <div className="db-kv"><span>Output tax</span><b>{inr(m.gst.outTax)}</b></div>
              <div className="db-kv"><span>Input tax credit</span><b>− {inr(m.gst.itc)}</b></div>
              <div className="db-kv tot"><span>{m.gst.net >= 0 ? 'Net payable' : 'Credit carried forward'}</span><b>{inr(Math.abs(m.gst.net))}</b></div>
              <Link to="/beta/books/gst-portal" className="db-chips">
                <span className={m.gst.r1 ? 'ok' : m.gst.r1Req ? 'wait' : ''}><Svg name={m.gst.r1 ? 'check' : m.gst.r1Req ? 'clock' : 'x'} size={11} />GSTR-1 {m.gst.r1 ? 'downloaded' : m.gst.r1Req ? 'in progress' : 'not downloaded'}</span>
                <span className={m.gst.r2b ? 'ok' : ''}><Svg name={m.gst.r2b ? 'check' : 'x'} size={11} />GSTR-2B {m.gst.r2b ? 'downloaded' : 'not downloaded'}</span>
              </Link>
            </div> : <div className="db-pad">{sk}{sk}</div>}
          </section>
        </div>
      </div>
    </div>
  );
}

const CSS = `
.db { flex:1; min-height:0; overflow-y:auto; padding:20px 24px 36px; font-family:${F}; color:#101828; background:#F4F6F8; }
.db * { box-sizing:border-box; }
@keyframes db-sh { 0% { background-position:-320px 0 } 100% { background-position:320px 0 } }
@keyframes db-spin { to { transform:rotate(360deg) } }
@keyframes db-in { from { opacity:0; transform:translateY(4px) } to { opacity:1; transform:none } }

.db-head { display:flex; align-items:flex-end; justify-content:space-between; gap:14px; flex-wrap:wrap; margin-bottom:16px; }
.db-title h1 { margin:0; font-size:22px; font-weight:700; letter-spacing:-.4px; color:#0B1F24; }
.db-title p { margin:4px 0 0; font-size:13px; color:#667085; } .db-title p span { color:#C0C8CC; margin:0 4px; }
.db-tools { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
.db-seg { display:inline-flex; background:#E9EEF0; border-radius:8px; padding:3px; }
.db-seg button { border:0; background:none; padding:6px 12px; border-radius:6px; font:500 12.5px ${F}; color:#475467; cursor:pointer; }
.db-seg button.on { background:#fff; color:${TEAL}; font-weight:600; box-shadow:0 1px 2px rgba(16,24,40,.1); }
.db-sel { height:34px; border:1px solid #D0D9DC; border-radius:8px; padding:0 28px 0 10px; font:500 12.5px ${F}; color:#344054; cursor:pointer; appearance:none; -webkit-appearance:none;
  background:#fff url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='6'><path d='M1 1l4 4 4-4' fill='none' stroke='%23667085' stroke-width='1.6' stroke-linecap='round'/></svg>") no-repeat right 10px center; }
.db-ib { width:34px; height:34px; border:1px solid #D0D9DC; border-radius:8px; background:#fff; color:#475467; display:grid; place-items:center; cursor:pointer; }
.db-app { height:34px; display:inline-flex; align-items:center; gap:6px; padding:0 12px; border:1px solid #9FD4C0; border-radius:8px; background:#EAF7F1; color:#0B6B47; font:600 12.5px ${F}; text-decoration:none; white-space:nowrap; }
.db-app:hover { background:#DDF2E8; }
.db-ib:hover { background:#F7FAFA; } .db-ib.spin svg { animation:db-spin .8s linear infinite; }
.db-new { position:relative; }
.db-pri { height:34px; display:inline-flex; align-items:center; gap:6px; padding:0 12px; border:0; border-radius:8px; background:${TEAL}; color:#fff; font:600 12.5px ${F}; cursor:pointer; box-shadow:0 1px 2px rgba(3,68,79,.3); }
.db-pri:hover { background:#025560; }
.db-menu { position:absolute; right:0; top:40px; z-index:20; width:200px; background:#fff; border:1px solid #E1E8EA; border-radius:10px; box-shadow:0 12px 32px rgba(16,24,40,.16); padding:6px; }
.db-menu a { display:flex; align-items:center; gap:9px; padding:8px 10px; border-radius:7px; color:#344054; text-decoration:none; font-size:13px; }
.db-menu a:hover { background:#EEF6F7; color:${TEAL}; }
.db-warn { display:flex; align-items:center; gap:8px; padding:9px 12px; margin-bottom:12px; border:1px solid #FEDF89; background:#FFFAEB; color:#B54708; border-radius:8px; font-size:12.5px; }

.db-card { background:#fff; border:1px solid #E3E9EB; border-radius:12px; box-shadow:0 1px 2px rgba(16,24,40,.03); min-width:0; animation:db-in .25s ease both; }
.db-kpis { display:grid; grid-template-columns:repeat(6, minmax(0, 1fr)); margin-bottom:14px; overflow:hidden; }
.db-kpi { position:relative; display:flex; flex-direction:column; gap:4px; padding:14px 16px 12px; text-decoration:none; color:inherit; border-right:1px solid #EEF2F4; min-height:112px; transition:background .15s; }
.db-kpi:last-child { border-right:0; } .db-kpi:hover { background:#F8FBFB; }
.db-kpi .t { font-size:12px; font-weight:600; color:#5B6B70; letter-spacing:.1px; }
.db-kpi .v { font-size:22px; font-weight:700; letter-spacing:-.6px; font-variant-numeric:tabular-nums; color:#0B1F24; }
.db-kpi .d { min-height:16px; }
.db-spark { width:100%; height:24px; margin-top:auto; }
.db-dl { display:inline-flex; align-items:center; gap:3px; font-size:11.5px; font-weight:600; flex-wrap:wrap; }
.db-dl em { font-style:normal; font-weight:400; color:#8A979B; margin-left:3px; }
.db-dl.up { color:#067647; } .db-dl.down { color:#B42318; } .db-dl.warn { color:#B54708; } .db-dl.n { color:#8A979B; font-weight:500; }

.db-grid { display:grid; gap:14px; margin-bottom:14px; }
.db-grid.g1 { grid-template-columns:minmax(0, 2fr) minmax(0, 1fr); }
.db-grid.g2 { grid-template-columns:minmax(0, 1.4fr) minmax(0, 1fr); }
.db-grid.g3 { grid-template-columns:repeat(3, minmax(0, 1fr)); }
.db-side { display:flex; flex-direction:column; gap:14px; min-width:0; }
.db-ch { display:flex; align-items:flex-start; justify-content:space-between; gap:10px; padding:14px 16px 4px; flex-wrap:wrap; }
.db-ch h2 { margin:0; font-size:14px; font-weight:650; color:#0B1F24; }
.db-ch small { display:block; margin-top:2px; font-size:11.5px; color:#8A979B; }
.db-lnk { font:600 12px ${F}; color:#0B7A89; text-decoration:none; } .db-lnk:hover { text-decoration:underline; }
.db-leg { display:flex; gap:14px; font-size:12px; color:#475467; flex-wrap:wrap; }
.db-leg span { display:inline-flex; align-items:center; gap:6px; } .db-leg b { color:#101828; font-weight:650; }
.db-leg i { width:10px; height:3px; border-radius:2px; display:inline-block; }
.db-pad { padding:10px 16px 16px; }

.db-chart { position:relative; padding:2px 8px 8px; }
.db-chart svg { width:100%; height:auto; display:block; }
.db-chart .ax { font-size:10.5px; fill:#8A979B; font-family:${F}; } .db-chart .ax.fut { fill:#C9D1D4; }
.db-tip { position:absolute; top:4px; transform:translateX(-50%); background:#0B1F24; color:#fff; border-radius:8px; padding:8px 10px; font-size:12px; pointer-events:none; min-width:180px; box-shadow:0 10px 24px rgba(16,24,40,.22); z-index:3; }
.db-tip b { display:block; margin-bottom:4px; }
.db-tip span { display:flex; align-items:center; gap:6px; color:#C8D3D6; padding:1px 0; } .db-tip span.net { border-top:1px solid rgba(255,255,255,.15); margin-top:3px; padding-top:4px; }
.db-tip i { width:8px; height:8px; border-radius:2px; } .db-tip em { margin-left:auto; font-style:normal; color:#fff; font-weight:600; padding-left:10px; }

.db-o2c { margin-bottom:12px; }
.db-o2c .l { display:flex; justify-content:space-between; font-size:12.5px; color:#475467; margin-bottom:5px; } .db-o2c .l b { color:#101828; font-variant-numeric:tabular-nums; }
.db-o2c .bar { height:10px; border-radius:99px; background:#EEF2F4; overflow:hidden; }
.db-o2c .bar i { display:block; height:100%; border-radius:99px; transition:width .5s; min-width:3px; }
.db-o2c small { display:block; margin-top:3px; font-size:11px; color:#8A979B; }
.db-o2c-f { display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:6px; padding-top:12px; border-top:1px solid #EEF2F4; }
.db-o2c-f div { background:#F6F9FA; border-radius:8px; padding:9px 10px; } .db-o2c-f span { display:block; font-size:11px; color:#667085; } .db-o2c-f b { font-size:15px; font-variant-numeric:tabular-nums; }

.db-stack { display:flex; gap:2px; height:14px; border-radius:99px; overflow:hidden; background:#EEF2F4; margin:4px 0 12px; }
.db-stack i { display:block; min-width:3px; }
.db-at { width:100%; border-collapse:collapse; font-size:12.5px; }
.db-at td { padding:7px 0; border-bottom:1px solid #F1F4F5; } .db-at tr:last-child td { border-bottom:0; }
.db-at td i { display:inline-block; width:9px; height:9px; border-radius:3px; margin-right:8px; vertical-align:-1px; }
.db-at .r { text-align:right; font-variant-numeric:tabular-nums; padding-left:8px; } .db-at .b { font-weight:650; } .db-at .mu { color:#8A979B; }

.db-list { padding:4px 8px 10px; }
.db-row { display:flex; align-items:center; gap:10px; padding:8px; border-radius:8px; }
.db-row .av { width:32px; height:32px; border-radius:9px; display:grid; place-items:center; flex-shrink:0; font-weight:700; font-size:11.5px; }
.db-row .rk { width:24px; height:24px; border-radius:7px; display:grid; place-items:center; flex-shrink:0; background:#F2F5F6; color:#475467; font-weight:700; font-size:11.5px; }
.db-row .tx { flex:1; min-width:0; } .db-row .tx b { display:block; font-size:13px; font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.db-row .tx small { display:block; font-size:11.5px; color:#8A979B; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.db-row .sh { height:4px; border-radius:99px; background:#EEF2F4; margin-top:5px; overflow:hidden; } .db-row .sh i { display:block; height:100%; background:${C_IN}; border-radius:99px; }
.db-row .amt { font-size:13px; font-weight:650; font-variant-numeric:tabular-nums; }
.db-days { min-width:40px; height:24px; padding:0 6px; border-radius:7px; display:grid; place-items:center; background:#FEF0C7; color:#B54708; font-size:11.5px; font-weight:700; }
.db-days.hi { background:#FEE4E2; color:#B42318; }
.db-empty { padding:16px; font-size:13px; color:#667085; display:flex; align-items:center; gap:8px; } .db-empty.ok { color:#067647; }

.db-tl { padding:4px 8px 10px; }
.db-tli { display:flex; align-items:center; gap:12px; padding:8px; border-radius:8px; text-decoration:none; color:inherit; }
.db-tli:hover { background:#F5F9FA; }
.db-tli .dot { width:12px; height:12px; border-radius:50%; border:3px solid; flex-shrink:0; background:#fff; }
.db-tli .tx { flex:1; min-width:0; } .db-tli .tx b { display:block; font-size:13px; font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.db-tli .tx small { display:block; font-size:11.5px; color:#8A979B; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.db-tli .amt { text-align:right; font-size:13px; font-weight:650; font-variant-numeric:tabular-nums; } .db-tli .amt small { display:block; font-size:11px; font-weight:400; color:#8A979B; }

.db-ap { display:grid; grid-template-columns:repeat(2, minmax(0,1fr)); gap:8px; }
.db-ap a { display:flex; align-items:center; gap:8px; padding:8px 10px; border:1px solid #E6ECEE; border-radius:8px; text-decoration:none; color:#344054; font-size:12.5px; text-transform:capitalize; min-width:0; }
.db-ap a:hover { border-color:#9FCFD6; background:#F7FBFB; }
.db-ap b { min-width:24px; height:22px; padding:0 6px; border-radius:6px; display:grid; place-items:center; background:#FEF0C7; color:#B54708; font-size:12px; }
.db-ap span { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.db-kv { display:flex; justify-content:space-between; font-size:13px; padding:5px 0; color:#475467; } .db-kv b { color:#101828; font-variant-numeric:tabular-nums; }
.db-kv.tot { border-top:1px solid #EEF2F4; margin-top:4px; padding-top:8px; font-weight:700; } .db-kv.tot span { color:#101828; }
.db-chips { display:flex; gap:6px; flex-wrap:wrap; margin-top:10px; text-decoration:none; }
.db-chips span { display:inline-flex; align-items:center; gap:4px; padding:3px 9px; border-radius:99px; font-size:11.5px; font-weight:600; background:#F2F4F7; color:#475467; }
.db-chips span.ok { background:#DCFAE6; color:#067647; } .db-chips span.wait { background:#FEF0C7; color:#B54708; }

.db-sk { display:block; height:14px; border-radius:6px; margin:8px 0; background:linear-gradient(90deg, #EEF3F4 0%, #F7FAFA 40%, #EEF3F4 80%); background-size:640px 100%; animation:db-sh 1.2s infinite linear; }

@media (max-width:1280px) { .db-kpis { grid-template-columns:repeat(3, minmax(0, 1fr)); } .db-kpi:nth-child(3) { border-right:0; } .db-kpi:nth-child(-n+3) { border-bottom:1px solid #EEF2F4; } .db-grid.g3 { grid-template-columns:repeat(2, minmax(0,1fr)); } }
@media (max-width:980px) { .db-grid.g1, .db-grid.g2, .db-grid.g3 { grid-template-columns:minmax(0,1fr); } }
@media (max-width:640px) { .db { padding:14px 12px 24px; } .db-kpis { grid-template-columns:repeat(2, minmax(0, 1fr)); } .db-kpi { border-bottom:1px solid #EEF2F4; } .db-kpi:nth-child(2n) { border-right:0; } .db-kpi:nth-child(3) { border-right:1px solid #EEF2F4; }
  .db-title h1 { font-size:19px; } .db-chart { overflow-x:auto; } .db-chart svg { min-width:560px; } .db-tip { display:none; } }
`;
