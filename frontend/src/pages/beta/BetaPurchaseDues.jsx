/* Beta — Purchase Dues: purchase orders (not draft / rejected) with what is paid to the vendor and what is still due.
 * One line per PO item; PO-level columns span the item lines.
 *   Taxable = qty × rate (less discount) · Other = additional charges · GST = GST on items + charges
 *   PO Value = PO total · Paid = approved + pending-approval payments for this PO · Dues = PO Value − Paid
 * Cleared POs are hidden unless "Show cleared" is ticked. FY filter on the PO date.
 * Double-click "Paid" → the payment pop-up for that PO's vendor. */
import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { useCompany } from '../../context/CompanyContext';
import { useAuth } from '../../context/AuthContext';
import { printPoAdvice } from './BetaDuesPrint';
import { Svg } from '../../components/ui/Icon';
import { DU_CSS } from './BetaDues';
import { FyFilter, fyOf, fyCounts } from './BetaSales';
import BetaPayment, { paidForPo, countsPaid } from './BetaPayment';

const n = v => parseFloat(v) || 0;
const r2 = v => Math.round((Number(v) || 0) * 100) / 100;
const PLAIN = new Intl.NumberFormat('en-IN', { useGrouping: false, maximumFractionDigits: 2 });
const num = v => PLAIN.format(Number(v) || 0);
const BIG = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
const DATE_FMT = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: '2-digit' });
const fdate = d => { if (!d) return '—'; const x = new Date(d); return isNaN(x) ? String(d) : DATE_FMT.format(x); };
const dash = v => (v == null || String(v).trim() === '' ? '—' : v);
const DOT = { paid: ['C', '#16A34A', 'Cleared'], part: ['P', '#F79009', 'Part Paid'], unpaid: ['U', '#D92D20', 'Unpaid'] };

/* one PO → its item lines and money columns */
const build = (p, paid, pending) => {
  const items = (p.items || []).filter(it => it && (it.itemName || it.description)).map(it => {
    const gross = n(it.qty) * n(it.rate), taxable = gross - gross * Math.min(100, n(it.discount)) / 100, g = n(it.gstPercent ?? it.gst);
    return { name: it.itemName || it.description, qty: n(it.qty), unit: it.unit || '', rate: n(it.rate), taxable, gstPct: g, gst: taxable * g / 100 };
  });
  const charges = (p.charges || []).filter(Boolean);
  const other = charges.reduce((s, c) => s + n(c.amount), 0) + n(p.freightCharges) + n(p.packingCharges);
  const gst = n(p.totalGST) || items.reduce((s, it) => s + it.gst, 0) + charges.reduce((s, c) => s + n(c.amount) * n(c.gstPercent ?? c.gst) / 100, 0);
  const value = n(p.grandTotal) > 0 ? n(p.grandTotal) : items.reduce((s, it) => s + it.taxable, 0) + other + gst;
  const dues = r2(value - paid);
  return { p, items, other: r2(other), gst: r2(gst), value: r2(value), paid: r2(paid), pending: r2(pending), dues, pay: paid <= 0.005 ? 'unpaid' : dues <= 0.5 ? 'paid' : 'part' };
};

const COLS = [
  ['Order No.', '8%'], ['Client', '10%'], ['Vendor', '10.5%'], ['PO Date', '5.6%'], ['PO No.', '8%'], ['Product', '13%'], ['Qty', '4.4%', 'r'], ['Rate', '5.6%', 'r'],
  ['Taxable', '6.4%', 'r'], ['Other', '4.6%', 'r'], ['GST', '5.4%', 'r'], ['PO Value', '6.4%', 'r'], ['Paid', '5.8%', 'r'], ['Dues', '6.2%', 'r'], ['St.', '2.9%', 'c'],
];
const PD_CSS = `
.du .sb-fyb { height:29px; } .du .sb-fyp { top:34px; }
.sb-fy { position:relative; }
.sb-fyb { display:flex; align-items:center; gap:7px; padding:0 10px; border:1px solid #B9D0D3; border-radius:6px; background:#fff; cursor:pointer; font:500 12.5px inherit; font-family:inherit; color:#344054; white-space:nowrap; }
.sb-fyb.set { background:#E8F3F4; border-color:#03444f; } .sb-fyb .lb { font-size:11px; font-weight:700; color:#667085; } .sb-fyb b { font-weight:600; color:#03444f; } .sb-fyb .cv { color:#98A2B3; font-size:10px; }
.sb-fyp { position:absolute; left:0; z-index:30; min-width:180px; max-height:320px; overflow-y:auto; padding:5px; border-radius:8px; background:#fff; border:1px solid #D0D5DD; box-shadow:0 10px 28px rgba(16,24,40,.16); }
.sb-fyi { display:flex; align-items:center; gap:9px; padding:7px 9px; border-radius:5px; cursor:pointer; font-size:12.5px; color:#344054; }
.sb-fyi:hover { background:#F0F7F7; } .sb-fyi.on { color:#03444f; font-weight:600; }
.sb-fyi input { width:15px; height:15px; margin:0; accent-color:#03444f; cursor:pointer; } .sb-fyi span { flex:1; } .sb-fyi small { font-size:11px; color:#98A2B3; font-weight:500; }
.sb-fysep { height:1px; background:#EDF2F3; margin:3px 0; }
`;

export default function BetaPurchaseDues() {
  const { selectedCompany } = useCompany() || {};
  const companyId = selectedCompany?.companyId;
  const { user } = useAuth() || {};
  const [banks, setBanks] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [pos, setPos] = useState(null);
  const [orders, setOrders] = useState([]);
  const [payments, setPayments] = useState([]);
  const [q, setQ] = useState('');
  const [showCleared, setShowCleared] = useState(false);
  const [selId, setSelId] = useState(null);
  const [payFor, setPayFor] = useState(null);   // PO whose payment pop-up is open
  const [note, setNote] = useState(null);
  const [reload, setReload] = useState(0);
  const [fySel, setFySel] = useState(() => [fyOf(new Date())]);   // current FY by default

  useEffect(() => {
    if (!companyId) return;
    axios.get('/api/purchase-orders', { params: { companyId } }).then(r => setPos(Array.isArray(r.data) ? r.data : [])).catch(() => setPos([]));
    axios.get('/api/sales-orders', { params: { companyId } }).then(r => setOrders(Array.isArray(r.data) ? r.data : [])).catch(() => setOrders([]));
  }, [companyId, reload]);
  useEffect(() => {
    if (!companyId) return;
    axios.get('/api/accounts/payments', { params: { companyId } }).then(r => setPayments(Array.isArray(r.data) ? r.data : [])).catch(() => setPayments([]));
  }, [companyId, reload]);
  useEffect(() => {
    if (!companyId) return;
    axios.get('/api/accounts/banks', { params: { companyId } }).then(r => setBanks(Array.isArray(r.data) ? r.data : [])).catch(() => setBanks([]));
    axios.get('/api/vendors', { params: { companyId } }).then(r => setVendors(Array.isArray(r.data) ? r.data : [])).catch(() => setVendors([]));
  }, [companyId]);
  const soMap = useMemo(() => { const m = {}; orders.forEach(o => { m[String(o.orderId)] = o; }); return m; }, [orders]);

  const all = useMemo(() => {
    const paysOk = payments.filter(countsPaid);
    return (pos || []).filter(p => !['draft', 'rejected', 'cancelled'].includes(p.status)).map(p => {
      const paid = paysOk.reduce((s, x) => s + paidForPo(x, p.orderId), 0);
      const pending = paysOk.filter(x => x.status === 'pending').reduce((s, x) => s + paidForPo(x, p.orderId), 0);
      return build(p, paid, pending);
    }).sort((a, b) => String(b.p.poDate || '').localeCompare(String(a.p.poDate || '')) || n(b.p.orderId) - n(a.p.orderId));
  }, [pos, payments]);
  const fyList = useMemo(() => fyCounts(all, r => r.p.poDate), [all]);
  const inFy = useMemo(() => all.filter(r => !fySel.length || fySel.includes(fyOf(r.p.poDate))), [all, fySel]);
  const clearedCount = inFy.filter(r => r.dues <= 0.5).length;
  const rows = useMemo(() => {
    const w = q.toLowerCase().split(/\s+/).filter(Boolean);
    return inFy.filter(r => (showCleared || r.dues > 0.5)
      && (!w.length || w.every(x => `${r.p.poNo || ''} ${r.p.vendorName || ''} ${soMap[String(r.p.linkedSalesOrderId)]?.orderNo || ''} ${soMap[String(r.p.linkedSalesOrderId)]?.customerName || ''} ${r.items.map(it => it.name).join(' ')} ${DOT[r.pay][2]}`.toLowerCase().includes(x))));
  }, [inFy, q, showCleared, soMap]);
  const sum = k => rows.reduce((s, r) => s + r[k], 0);
  const sel = rows.find(r => String(r.p.orderId) === selId) || null;

  useEffect(() => {
    if (!selId) return undefined;
    const down = e => { if (!e.target.closest?.('.du-t tbody.og, .du-tools')) setSelId(null); };
    const key = e => { if (e.key === 'Escape' && payFor == null) setSelId(null); };
    document.addEventListener('mousedown', down); document.addEventListener('keydown', key);
    return () => { document.removeEventListener('mousedown', down); document.removeEventListener('keydown', key); };
  }, [selId, payFor]);

  const openPay = id => { setNote(null); setPayFor(id); };
  // PO Advice: the PO, every payment counted against it (amount for this PO only), balance payable
  const advice = r => printPoAdvice({
    r, so: soMap[String(r.p.linkedSalesOrderId)],
    payments: payments.filter(countsPaid).map(x => ({ ...x, forPo: paidForPo(x, r.p.orderId) })).filter(x => x.forPo > 0.005)
      .sort((a, b) => String(a.transactionDate || a.date || '').localeCompare(String(b.transactionDate || b.date || ''))),
    vendor: vendors.find(v => String(v.vendorId) === String(r.p.vendorId)), company: selectedCompany, user, banks,
  });

  return (
    <div className="du">
      <style>{DU_CSS + PD_CSS}</style>
      <div className="du-bar">
        <span className="du-ttl"><span className="ic"><Svg name="wallet" size={14} /></span>Purchase Dues</span>
        <span className="du-sep" />
        <FyFilter list={fyList} total={all.length} sel={fySel} setSel={setFySel} />
        <input className="du-search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search PO, vendor, order, client, product…" aria-label="Search purchase dues" />
        <label className={`du-chk${showCleared ? ' on' : ''}`} title="Show POs that are fully paid">
          <input type="checkbox" checked={showCleared} onChange={e => setShowCleared(e.target.checked)} />Show cleared <small>{clearedCount}</small>
        </label>
        <div className="du-tools">
          <span className="du-picked">{sel ? <>Selected: <b>{sel.p.poNo || sel.p.orderId}</b></> : 'Click a PO to select'}</span>
          <button type="button" className="du-tbtn" disabled={!sel} onClick={() => openPay(sel.p.orderId)}><Svg name="wallet" size={13} />Make Payment</button>
          <button type="button" className="du-tbtn" disabled={!sel} onClick={() => advice(sel)}><Svg name="file" size={13} />PO Advice</button>
        </div>
      </div>

      {note && <div className="du-note" role="status">{note}<button type="button" onClick={() => setNote(null)} aria-label="Dismiss">×</button></div>}
      <div className="du-kpi" aria-label="Totals of the POs shown">
        <div className="du-k"><small>POs</small><b>{rows.length}</b></div>
        <div className="du-k"><small>PO Value</small><b>₹ {BIG.format(sum('value'))}</b></div>
        <div className="du-k rec"><small>Paid</small><b>₹ {BIG.format(sum('paid'))}</b></div>
        <div className="du-k due"><small>Dues</small><b>₹ {BIG.format(sum('dues'))}</b></div>
      </div>

      <div className="du-body">
        <table className="du-t">
          <colgroup>{COLS.map(([h, w]) => <col key={h} style={{ width: w }} />)}</colgroup>
          <thead><tr>{COLS.map(([h, , a]) => <th key={h} className={a || ''}>{h}</th>)}</tr></thead>
          {pos === null ? <tbody><tr><td colSpan={COLS.length} className="du-empty">Loading…</td></tr></tbody>
            : !rows.length ? <tbody><tr><td colSpan={COLS.length} className="du-empty">{q ? `No PO matches “${q}”.` : showCleared ? 'No purchase orders.' : 'No dues — every PO is fully paid. Tick “Show cleared” to see them.'}</td></tr></tbody>
              : rows.map(r => {
                const lines = r.items.length ? r.items : [null];
                const span = lines.length, id = String(r.p.orderId), dot = DOT[r.pay], so = soMap[String(r.p.linkedSalesOrderId)];
                return (
                  <tbody key={id} className={`og${selId === id ? ' sel' : ''}`} onClick={() => setSelId(id)} title="Click to select · double-click Paid to make a payment">
                    {lines.map((it, i) => (
                      <tr key={i}>
                        {i === 0 && <>
                          <td rowSpan={span} className="top no">{so ? so.orderNo : <span className="mut">—</span>}</td>
                          <td rowSpan={span} className="top">{dash(so?.customerName)}</td>
                          <td rowSpan={span} className="top cl">{dash(r.p.vendorName)}</td>
                          <td rowSpan={span} className="top nw">{fdate(r.p.poDate)}</td>
                          <td rowSpan={span} className="top" style={{ fontWeight: 700, color: '#03444f' }}>{r.p.poNo || r.p.poNumber || r.p.orderId}</td>
                        </>}
                        {it ? <>
                          <td>{it.name}</td><td className="r">{num(it.qty)}{it.unit ? <span className="mut"> {it.unit}</span> : ''}</td><td className="r">{num(it.rate)}</td><td className="r">{num(it.taxable)}</td>
                        </> : <td colSpan={4} className="c mut">—</td>}
                        {i === 0 && <>
                          <td rowSpan={span} className="top r">{r.other ? num(r.other) : <span className="mut">—</span>}</td>
                          <td rowSpan={span} className="top r">{num(r.gst)}</td>
                          <td rowSpan={span} className="top r"><b>{num(r.value)}</b></td>
                          <td rowSpan={span} className="top r">
                            <button type="button" className={`du-rc${r.pending > 0 ? ' pend' : ''}`} title={r.pending > 0 ? `Includes ₹ ${num(r.pending)} awaiting approval · double-click to make a payment` : 'Double-click to make a payment'}
                              aria-label={`Double-click to make a payment for ${r.p.poNo || id}`}
                              onDoubleClick={e => { e.stopPropagation(); openPay(r.p.orderId); }}
                              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); openPay(r.p.orderId); } }}>
                              {num(r.paid)}
                            </button>
                          </td>
                          <td rowSpan={span} className={`top r ${r.dues > 0.5 ? 'due' : 'clear'}`}>{num(r.dues)}</td>
                          <td rowSpan={span} className="top c"><span className="du-dot" style={{ background: dot[1] }} title={dot[2]}>{dot[0]}</span></td>
                        </>}
                      </tr>
                    ))}
                  </tbody>
                );
              })}
          {rows.length > 0 && <tfoot><tr>
            <td colSpan={8}>Total ({rows.length} POs)</td>
            <td className="r">{num(rows.reduce((s, r) => s + r.items.reduce((t, it) => t + it.taxable, 0), 0))}</td>
            <td className="r">{num(sum('other'))}</td><td className="r">{num(sum('gst'))}</td><td className="r">{num(sum('value'))}</td>
            <td className="r">{num(sum('paid'))}</td><td className="r">{num(sum('dues'))}</td><td />
          </tr></tfoot>}
        </table>
      </div>
      {payFor != null && <BetaPayment preset={{ poId: payFor }} onClose={() => setPayFor(null)}
        onSaved={text => { setPayFor(null); setReload(x => x + 1); setNote(text); }} />}
    </div>
  );
}
