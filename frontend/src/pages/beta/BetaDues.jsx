/* Beta — Dues: sales orders (not cancelled) with what was received and what is still due.
 * One line per product; order-level columns span the order's lines. Fits the screen (no side scroll).
 *   Taxable = qty × rate · Other = additional charges · GST = GST on products + charges
 *   Order Value = grand total · Receipt = approved + pending-approval receipts (not draft / rejected) · Dues = Order Value − Receipt
 * Cleared (fully paid) orders are hidden unless "Show cleared" is ticked. FY filter on order date.
 * Click an order to select it → Order Advice print; Print List prints what is shown. */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { useCompany } from '../../context/CompanyContext';
import { useAuth } from '../../context/AuthContext';
import { Svg } from '../../components/ui/Icon';
import { printDuesList, printOrderAdvice } from './BetaDuesPrint';
import BetaReceipt from './BetaReceipt';

const TEAL = '#03444f';
const F = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

const n = v => parseFloat(v) || 0;
const r2 = v => Math.round(v * 100) / 100;
const PLAIN = new Intl.NumberFormat('en-IN', { useGrouping: false, maximumFractionDigits: 2 });   // plain numbers, as in the order list
const num = v => PLAIN.format(Number(v) || 0);
const BIG = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
const DATE_FMT = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: '2-digit' });
const fdate = d => { if (!d) return '—'; const x = new Date(d); return isNaN(x) ? String(d) : DATE_FMT.format(x); };
const dash = v => (v == null || String(v).trim() === '' ? '—' : v);
/* Indian FY (April–March) of a date → '2026' for FY 26-27 */
const fyOf = d => { const x = d ? new Date(d) : null; if (!x || isNaN(x)) return ''; return String(x.getMonth() >= 3 ? x.getFullYear() : x.getFullYear() - 1); };
const fyLabel = k => `FY ${String(k).slice(2)}-${String(+k + 1).slice(2)}`;

const PAY = { paid: ['Cleared', '#ECFDF3', '#067647'], part: ['Part Paid', '#FFFAEB', '#B54708'], unpaid: ['Unpaid', '#FEF3F2', '#B42318'] };

/* one order → its product lines and money columns */
const build = (o, received, pending = 0) => {
  const items = (o.items || []).filter(it => it && (it.material || it.itemName || it.description || n(it.qty) || n(it.rate))).map(it => {
    const taxable = n(it.qty) * n(it.rate), gstPct = n(it.gstPercent ?? it.gst);
    return { name: it.material || it.itemName || it.description || '', qty: n(it.qty), unit: it.unit || '', rate: n(it.rate), taxable, gstPct, gst: taxable * gstPct / 100 };
  });
  const charges = (o.charges || []).filter(Boolean);
  const other = charges.reduce((s, c) => s + n(c.amount), 0);
  const gst = items.reduce((s, it) => s + it.gst, 0) + charges.reduce((s, c) => s + (c.withoutGst ? 0 : n(c.amount) * n(c.gst) / 100), 0);
  const value = n(o.grandTotal) > 0 ? n(o.grandTotal) : items.reduce((s, it) => s + it.taxable, 0) + other + gst;
  const dues = r2(value - received);
  return { o, items, other: r2(other), gst: r2(gst), value: r2(value), received: r2(received), pending: r2(pending), dues, pay: received <= 0.005 ? 'unpaid' : dues <= 0.5 ? 'paid' : 'part' };
};

/* column widths — together they fill the screen, so there is no side scroll */
const COLS = [
  ['Order No.', '8.6%'], ['Client', '12%'], ['PO Date', '6%'], ['PO No.', '8.4%'], ['Product', '14.5%'], ['Qty', '4.6%', 'r'], ['Rate', '6%', 'r'],
  ['Taxable', '6.6%', 'r'], ['Other', '5%', 'r'], ['GST', '5.6%', 'r'], ['Order Value', '6.8%', 'r'], ['Receipt', '6.2%', 'r'], ['Dues', '6.6%', 'r'], ['Status', '3.1%', 'c'],
];

const CSS = `
.du { display:flex; flex-direction:column; height:100%; min-height:0; font-family:${F}; background:#EEF4F4; }
/* toolbar: every control fills the full bar height, split by thin lines (same as the DC list bar) */
.du-bar { display:flex; align-items:stretch; gap:0; height:40px; padding:0; flex-shrink:0; background:#E3EEEF; border-bottom:1px solid #C9DCDE; }
.du-ttl { display:flex; align-items:center; gap:7px; padding:0 14px 0 10px; font:700 13.5px ${F}; color:${TEAL}; white-space:nowrap; border-right:1px solid #C9DCDE; }
.du-ttl .ic { width:24px; height:24px; display:grid; place-items:center; background:${TEAL}; color:#fff; border-radius:5px; }
.du-sep { display:none; }
.du-search { width:300px; min-width:150px; flex-shrink:1; height:auto; padding:0 12px; border:0; border-right:1px solid #C9DCDE; border-radius:0; outline:none; font:400 12.5px ${F}; background:#fff; }
.du-search:focus { box-shadow:inset 0 -2px 0 ${TEAL}; }
.du-chk { display:flex; align-items:center; gap:7px; height:auto; padding:0 14px; border:0; border-right:1px solid #C9DCDE; border-radius:0; background:#fff; cursor:pointer;
  font:600 12px ${F}; color:#475467; white-space:nowrap; user-select:none; }
.du-chk:hover { background:#F0F7F7; }
.du-chk.on { background:#E8F3F4; color:${TEAL}; }
.du-chk input { width:14px; height:14px; margin:0; accent-color:${TEAL}; cursor:pointer; }
.du-chk small { font-weight:500; color:#98A2B3; }
.du-tools { display:flex; align-items:stretch; gap:0; margin-left:auto; flex-shrink:0; }
.du-picked { display:flex; align-items:center; padding:0 14px; font-size:12px; color:#667085; white-space:nowrap; } .du-picked b { color:${TEAL}; font-family:ui-monospace, Consolas, monospace; margin-left:4px; }
.du-tbtn { height:auto; padding:0 16px; display:inline-flex; align-items:center; gap:6px; border:0; border-left:1px solid #C9DCDE; border-radius:0; background:#fff; color:${TEAL};
  cursor:pointer; font:600 12px ${F}; white-space:nowrap; }
.du-tbtn:hover:not(:disabled) { background:${TEAL}; color:#fff; } .du-tbtn:disabled { opacity:.45; cursor:default; }

/* FY filter */
.du-fy { position:relative; display:flex; border-right:1px solid #C9DCDE; }
.du-fyb { height:auto; display:flex; align-items:center; gap:7px; padding:0 14px; border:0; border-radius:0; background:#fff; cursor:pointer; font:500 12.5px ${F}; color:#344054; white-space:nowrap; }
.du-fyb:hover, .du-fyb[aria-expanded="true"] { background:#F0F7F7; }
.du-fyb .lb { font-size:11px; font-weight:700; color:#667085; } .du-fyb b { font-weight:600; color:${TEAL}; } .du-fyb .cv { color:#98A2B3; font-size:10px; }
.du-fyb.set { background:#E8F3F4; }
.du-fyp { position:absolute; left:0; top:calc(100% + 2px); z-index:30; min-width:180px; max-height:320px; overflow-y:auto; padding:5px; border-radius:8px; background:#fff; border:1px solid #D0D5DD; box-shadow:0 10px 28px rgba(16,24,40,.16); }
.du-fyi { display:flex; align-items:center; gap:9px; padding:7px 9px; border-radius:5px; cursor:pointer; font-size:12.5px; color:#344054; }
.du-fyi:hover { background:#F0F7F7; } .du-fyi.on { color:${TEAL}; font-weight:600; }
.du-fyi input { width:15px; height:15px; margin:0; accent-color:${TEAL}; cursor:pointer; } .du-fyi span { flex:1; } .du-fyi small { font-size:11px; color:#98A2B3; font-weight:500; }
.du-fysep { height:1px; background:#EDF2F3; margin:3px 0; }
/* FY filter (shared from Sales) in the dues toolbar: full height, flat, like the other controls */
.du-bar .sb-fy { position:relative; display:flex; }
.du-bar .sb-fyb { height:auto !important; padding:0 12px !important; border:0 !important; border-right:1px solid #B9D0D3 !important; border-radius:0 !important; }

.du-bar .sb-fyb.set { background:#E8F3F4; }
.du-bar .sb-fyp { top:calc(100% + 2px); }

/* summary tiles */
.du-kpi { display:grid; grid-template-columns:repeat(4, 1fr); gap:1px; background:#C9DCDE; border-bottom:1px solid #C9DCDE; flex-shrink:0; }
.du-k { background:#fff; padding:3px 14px; display:flex; align-items:baseline; justify-content:space-between; gap:10px; }
.du-k small { font-size:10px; font-weight:700; color:#667085; text-transform:uppercase; letter-spacing:.5px; white-space:nowrap; }
.du-k b { font-size:13.5px; color:#101828; font-variant-numeric:tabular-nums; white-space:nowrap; }
.du-k.due b { color:#B42318; } .du-k.rec b { color:#067647; }

.du-body { flex:1; min-height:0; overflow-y:auto; overflow-x:hidden; background:#fff; }
.du-t { width:100%; table-layout:fixed; border-collapse:collapse; font-size:11.5px; }
.du-t th { position:sticky; top:0; z-index:2; background:#D4EBEE; color:#000; font-weight:700; font-size:11px; text-align:left; padding:7px 5px; border-bottom:1px solid #A9CDD2; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.du-t td { padding:5px 5px; border-bottom:1px solid #EDF2F3; color:#101828; vertical-align:top; overflow-wrap:anywhere; background:#fff; transition:background .08s; }
/* thin black lines between columns */
.du-t th { border-right:1px solid #A9CDD2; }
.du-t td { border-right:1px solid #000; }
.du-t tbody.og tr:first-child td { border-top:1px solid #C9DCDE; }
.du-t tbody.og { cursor:pointer; }
.du-t tbody.og:hover td { background:#EAF4F5; }
.du-t tbody.og.sel td { background:#D4EBEE; }
.du-t tbody.og.sel tr:first-child td:first-child { box-shadow:inset 3px 0 0 ${TEAL}; }
.du-t .r { text-align:right; font-variant-numeric:tabular-nums; white-space:nowrap; overflow-wrap:normal; }
.du-t th.r { text-align:right; } .du-t .c, .du-t th.c { text-align:center; }
.du-t td.no { padding-left:10px; font-weight:700; color:${TEAL}; font-size:11.5px; letter-spacing:.2px; font-variant-numeric:tabular-nums; overflow-wrap:normal; white-space:nowrap; }
.du-t th:first-child { padding-left:10px; }
/* order-level cells sit on the order's first product line */
.du-t td.top { vertical-align:top; }
.du-t .nw { white-space:nowrap; overflow-wrap:normal; }
.du-t .cl { font-weight:600; }
.du-t .mut { color:#98A2B3; }
.du-t .due { font-weight:700; color:#B42318; } .du-t .clear { color:#067647; font-weight:600; }
.du-t tfoot td { position:sticky; bottom:0; z-index:2; font-weight:700; font-size:11px; background:#E3EEEF; border-top:1px solid #A9CDD2; }
.du-dot { display:inline-grid; place-items:center; width:20px; height:20px; border-radius:50%; color:#fff; font-size:10.5px; font-weight:700; }
.du-rc { display:inline-flex; align-items:center; padding:1px 6px; border:1px solid transparent; border-radius:5px; background:none; cursor:pointer;
  font:inherit; color:#344054; font-variant-numeric:tabular-nums; }
.du-rc.pend { color:#B54708; font-weight:600; }
.du-rc:hover { border-color:${TEAL}; background:#fff; color:${TEAL}; }
.du-note { display:flex; align-items:center; gap:10px; padding:7px 12px; background:#E6F4EA; color:#1E7B34; border-bottom:1px solid #B7E1C1; font-size:12.5px; font-weight:500; flex-shrink:0; }
.du-note button { margin-left:auto; border:0; background:none; color:#1E7B34; font-size:16px; cursor:pointer; }
.du-empty { padding:22px; text-align:center; color:#98A2B3; font-size:12.5px; }
`;
const DOT = { paid: ['C', '#16A34A', 'Cleared'], part: ['P', '#F79009', 'Part Paid'], unpaid: ['U', '#D92D20', 'Unpaid'] };

export default function BetaDues() {
  const { selectedCompany } = useCompany() || {};
  const companyId = selectedCompany?.companyId;
  const { user } = useAuth() || {};
  const [orders, setOrders] = useState(null);
  const [payments, setPayments] = useState([]);
  const [banks, setBanks] = useState([]);
  const [q, setQ] = useState('');
  const [showCleared, setShowCleared] = useState(false);
  const [selId, setSelId] = useState(null);
  const [rcFor, setRcFor] = useState(null);     // order whose receipt pop-up is open
  const [note, setNote] = useState(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!companyId) return;
    axios.get('/api/sales-orders', { params: { companyId } }).then(r => setOrders(Array.isArray(r.data) ? r.data : [])).catch(() => setOrders([]));
    axios.get('/api/accounts/banks', { params: { companyId } }).then(r => setBanks(Array.isArray(r.data) ? r.data : [])).catch(() => setBanks([]));
  }, [companyId]);
  useEffect(() => {
    if (!companyId) return;
    axios.get('/api/accounts/payments', { params: { companyId } }).then(r => setPayments(Array.isArray(r.data) ? r.data : [])).catch(() => setPayments([]));
  }, [companyId, reload]);

  /* receipts that count: approved and awaiting-approval receipts against an order (drafts and rejected do not) */
  const recByOrder = useMemo(() => {
    const m = {};
    payments.forEach(p => { if (p.type === 'receipt' && (p.status === 'confirmed' || p.status === 'pending') && p.orderId) (m[String(p.orderId)] = m[String(p.orderId)] || []).push(p); });
    return m;
  }, [payments]);

  const all = useMemo(() => (orders || []).filter(o => o.status !== 'cancelled')
    .map(o => { const rs = recByOrder[String(o.orderId)] || []; return build(o, rs.reduce((s, p) => s + n(p.amount), 0), rs.filter(p => p.status === 'pending').reduce((s, p) => s + n(p.amount), 0)); })
    .sort((a, b) => String(b.o.orderDate || '').localeCompare(String(a.o.orderDate || ''))), [orders, recByOrder]);

  /* FY filter — empty = all years */
  const [fySel, setFySel] = useState(() => [fyOf(new Date())]);   // current FY by default
  const [fyOpen, setFyOpen] = useState(false);
  const fyRef = useRef(null);
  useEffect(() => {
    if (!fyOpen) return;
    const down = e => { if (!fyRef.current?.contains(e.target)) setFyOpen(false); };
    const key = e => { if (e.key === 'Escape') setFyOpen(false); };
    document.addEventListener('mousedown', down); document.addEventListener('keydown', key);
    return () => { document.removeEventListener('mousedown', down); document.removeEventListener('keydown', key); };
  }, [fyOpen]);
  const fyList = useMemo(() => {
    const m = new Map();
    all.forEach(r => { const k = fyOf(r.o.orderDate); if (k) m.set(k, (m.get(k) || 0) + 1); });
    return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [all]);
  const toggleFy = k => setFySel(s => (s.includes(k) ? s.filter(x => x !== k) : [...s, k]));
  const fyText = !fySel.length ? 'All' : fySel.length <= 2 ? [...fySel].sort().reverse().map(k => fyLabel(k).slice(3)).join(', ') : `${fySel.length} years`;

  const inFy = useMemo(() => all.filter(r => !fySel.length || fySel.includes(fyOf(r.o.orderDate))), [all, fySel]);
  const clearedCount = inFy.filter(r => r.dues <= 0.5).length;
  const rows = useMemo(() => {
    const w = q.toLowerCase().split(/\s+/).filter(Boolean);
    return inFy.filter(r => (showCleared || r.dues > 0.5)
      && (!w.length || w.every(x => `${r.o.orderNo} ${r.o.customerName || r.o.party} ${r.o.customerPO} ${fdate(r.o.poDate)} ${r.items.map(it => it.name).join(' ')} ${PAY[r.pay][0]}`.toLowerCase().includes(x))));
  }, [inFy, q, showCleared]);

  const sum = k => rows.reduce((s, r) => s + r[k], 0);
  const sel = rows.find(r => String(r.o.orderId) === selId) || null;

  // Esc or a click outside the list / toolbar clears the selection
  useEffect(() => {
    if (!selId) return;
    const down = e => { if (!e.target.closest?.('.du-t tbody.og, .du-tools')) setSelId(null); };
    const key = e => { if (e.key === 'Escape') setSelId(null); };
    document.addEventListener('mousedown', down); document.addEventListener('keydown', key);
    return () => { document.removeEventListener('mousedown', down); document.removeEventListener('keydown', key); };
  }, [selId]);

  const filterText = [fySel.length ? [...fySel].sort().reverse().map(fyLabel).join(', ') : 'All FY', showCleared ? 'incl. cleared' : 'with dues only', q.trim() && `Search: “${q.trim()}”`].filter(Boolean).join('   |   ');
  const advice = r => printOrderAdvice({ r, receipts: (recByOrder[String(r.o.orderId)] || []).slice().sort((a, b) => String(a.transactionDate || a.date || '').localeCompare(String(b.transactionDate || b.date || ''))), company: selectedCompany, user, banks });

  return (
    <div className="du">
      <style>{CSS}</style>
      <div className="du-bar">
        <span className="du-ttl"><span className="ic"><Svg name="wallet" size={14} /></span>Dues</span>
        <span className="du-sep" />
        <div className="du-fy" ref={fyRef}>
          <button type="button" className={`du-fyb${fySel.length ? ' set' : ''}`} onClick={() => setFyOpen(o => !o)} aria-haspopup="listbox" aria-expanded={fyOpen}>
            <span className="lb">FY</span><b>{fyText}</b><span className="cv">▾</span>
          </button>
          {fyOpen && (
            <div className="du-fyp" role="listbox" aria-multiselectable="true" aria-label="Financial year">
              <label className={`du-fyi${!fySel.length ? ' on' : ''}`}><input type="checkbox" checked={!fySel.length} onChange={() => setFySel([])} /><span>All</span><small>{all.length}</small></label>
              <div className="du-fysep" />
              {fyList.map(([k, c]) => (
                <label key={k} className={`du-fyi${fySel.includes(k) ? ' on' : ''}`}><input type="checkbox" checked={fySel.includes(k)} onChange={() => toggleFy(k)} /><span>{fyLabel(k)}</span><small>{c}</small></label>
              ))}
            </div>
          )}
        </div>
        <input className="du-search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search order, client, PO, product…" aria-label="Search dues" />
        <label className={`du-chk${showCleared ? ' on' : ''}`} title="Show orders that are fully paid">
          <input type="checkbox" checked={showCleared} onChange={e => setShowCleared(e.target.checked)} />Show cleared <small>{clearedCount}</small>
        </label>
        <div className="du-tools">
          <span className="du-picked">{sel ? <>Selected: <b>{sel.o.orderNo || sel.o.orderId}</b></> : 'Click an order to select'}</span>
          <button type="button" className="du-tbtn" disabled={!sel} onClick={() => advice(sel)}><Svg name="file" size={13} />Order Advice</button>
          <button type="button" className="du-tbtn" disabled={!rows.length} onClick={() => printDuesList({ rows, company: selectedCompany, user, filter: filterText })}><Svg name="file" size={13} />Print List</button>
        </div>
      </div>

      {note && <div className="du-note" role="status">{note}<button type="button" onClick={() => setNote(null)} aria-label="Dismiss">×</button></div>}
      <div className="du-kpi" aria-label="Totals of the orders shown">
        <div className="du-k"><small>Orders</small><b>{rows.length}</b></div>
        <div className="du-k"><small>Order Value</small><b>₹ {BIG.format(sum('value'))}</b></div>
        <div className="du-k rec"><small>Received</small><b>₹ {BIG.format(sum('received'))}</b></div>
        <div className="du-k due"><small>Dues</small><b>₹ {BIG.format(sum('dues'))}</b></div>
      </div>

      <div className="du-body">
        <table className="du-t">
          <colgroup>{COLS.map(([h, w]) => <col key={h} style={{ width: w }} />)}</colgroup>
          <thead><tr>{COLS.map(([h, , a]) => <th key={h} className={a || ''}>{h}</th>)}</tr></thead>
          {orders === null ? <tbody><tr><td colSpan={14} className="du-empty">Loading…</td></tr></tbody>
            : !rows.length ? <tbody><tr><td colSpan={14} className="du-empty">{q ? `No order matches “${q}”.` : showCleared ? 'No orders.' : 'No dues — every order is fully paid. Tick “Show cleared” to see them.'}</td></tr></tbody>
              : rows.map(r => {
                const lines = r.items.length ? r.items : [null];
                const span = lines.length, id = String(r.o.orderId), dot = DOT[r.pay];
                return (
                  <tbody key={id} className={`og${selId === id ? ' sel' : ''}`} onClick={() => setSelId(id)} onDoubleClick={() => { setSelId(id); advice(r); }}
                    title="Click to select · double-click for Order Advice" aria-selected={selId === id}>
                    {lines.map((it, i) => (
                      <tr key={i}>
                        {i === 0 && <>
                          <td rowSpan={span} className="top no" title={r.o.orderNo}>{r.o.orderNo || r.o.orderId}</td>
                          <td rowSpan={span} className="top cl">{dash(r.o.customerName || r.o.party)}</td>
                          <td rowSpan={span} className="top nw">{fdate(r.o.poDate)}</td>
                          <td rowSpan={span}>{dash(r.o.customerPO)}</td>
                        </>}
                        {it ? <>
                          <td>{it.name}</td><td className="r">{num(it.qty)}{it.unit ? <span className="mut"> {it.unit}</span> : ''}</td><td className="r">{num(it.rate)}</td><td className="r">{num(it.taxable)}</td>
                        </> : <td colSpan={4} className="c mut">—</td>}
                        {i === 0 && <>
                          <td rowSpan={span} className="top r">{r.other ? num(r.other) : <span className="mut">—</span>}</td>
                          <td rowSpan={span} className="top r">{num(r.gst)}</td>
                          <td rowSpan={span} className="top r"><b>{num(r.value)}</b></td>
                          <td rowSpan={span} className="top r">
                            <button type="button" className={`du-rc${r.pending > 0 ? " pend" : ""}`} title={r.pending > 0 ? `Includes ₹ ${num(r.pending)} awaiting approval · double-click for receipt entry` : "Double-click for receipt entry"} aria-label={`Double-click to enter a receipt for ${r.o.orderNo || r.o.orderId}`}
                              onDoubleClick={e => { e.stopPropagation(); setNote(null); setRcFor(r.o.orderId); }}
                              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); setNote(null); setRcFor(r.o.orderId); } }}>
                              {num(r.received)}
                            </button>
                          </td>
                          <td rowSpan={span} className={`r ${r.dues > 0.5 ? 'due' : 'clear'}`}>{num(r.dues)}</td>
                          <td rowSpan={span} className="top c"><span className="du-dot" style={{ background: dot[1] }} title={dot[2]}>{dot[0]}</span></td>
                        </>}
                      </tr>
                    ))}
                  </tbody>
                );
              })}
          {rows.length > 0 && <tfoot><tr>
            <td colSpan={7}>Total ({rows.length} orders)</td>
            <td className="r">{num(rows.reduce((s, r) => s + r.items.reduce((t, it) => t + it.taxable, 0), 0))}</td>
            <td className="r">{num(sum('other'))}</td><td className="r">{num(sum('gst'))}</td><td className="r">{num(sum('value'))}</td>
            <td className="r">{num(sum('received'))}</td><td className="r">{num(sum('dues'))}</td><td />
          </tr></tfoot>}
        </table>
      </div>
      {rcFor != null && <BetaReceipt preset={{ orderId: rcFor }} onClose={() => setRcFor(null)}
        onSaved={text => { setRcFor(null); setReload(x => x + 1); setNote(`${text}`); }} />}
    </div>
  );
}

export { CSS as DU_CSS };   // shared with the Purchase Dues page
