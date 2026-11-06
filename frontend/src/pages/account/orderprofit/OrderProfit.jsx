/* OrderProfit — Account › Order Profit: the clear picture.
 *
 * Orders: every Order ID with its client, client order no., value, what was invoiced and received,
 *   every PO under it (PO value, billed, paid — payment by payment) and the expenses spent on it → profit.
 * Vendors: PO-wise payments, payments without PO, bills in Tally, balance (advance / payable / closed).
 * Clients: order-wise receipts, receipts without an order, balance.
 * Overheads: salary, office, milk & tea … by head → orders' profit − overheads = profit or loss.
 * Built from the Tally bank entries + bills saved in the ERP and the ERP's orders / POs. Read-only.
 */
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { useCompany } from '../../../context/CompanyContext';
import FyDropdown from '../../../components/FyDropdown';

const F = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const BD = '#EAECF0', GRID = '#E4E7EC';
const money = n => (parseFloat(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const short = n => { const v = Math.abs(n || 0), s = n < 0 ? '−' : ''; return v >= 1e7 ? `${s}${(v / 1e7).toFixed(2)} Cr` : v >= 1e5 ? `${s}${(v / 1e5).toFixed(2)} L` : `${s}${money(v)}`; };
const fmtD = d => { if (!d) return '—'; const s = String(d).slice(0, 10).split('-'); return s.length === 3 ? `${s[2]}-${s[1]}-${s[0]}` : d; };
const curFy = (() => { const t = new Date(); const y = t.getMonth() >= 3 ? t.getFullYear() : t.getFullYear() - 1; return `${String(y).slice(2)}-${String(y + 1).slice(2)}`; })();
const FYS = (() => { const out = []; const y0 = 2000 + parseInt(curFy.slice(0, 2), 10); for (let y = y0; y >= 2022; y--) out.push(`${String(y).slice(2)}-${String(y + 1).slice(2)}`); return out; })();
const balTxt = v => v == null ? '—' : Math.abs(v) < 1 ? '0 · closed ✓' : `${money(Math.abs(v))} ${v > 0 ? 'Dr' : 'Cr'}`;   // party ledger: Dr = they owe us / advance paid, Cr = we owe them

const cell = { padding: '7px 9px', border: `1px solid ${GRID}`, fontSize: 12.5, verticalAlign: 'top', color: '#101828' };
const th = { ...cell, position: 'sticky', top: 0, zIndex: 2, background: '#F2F4F7', fontSize: 10.5, fontWeight: 800, color: '#344054', textTransform: 'uppercase', whiteSpace: 'nowrap', textAlign: 'left' };
const num = { textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' };
const Closed = ({ c }) => !c ? null : c === 'bill' ? <span title="Closed by a bill / journal of the same amount in Tally" style={{ fontSize: 10, fontWeight: 800, color: '#067647' }}>✓ bill</span>
  : c === 'balance0' ? <span title="The party's balance in Tally is 0" style={{ fontSize: 10, fontWeight: 800, color: '#067647' }}>✓ closed</span>
  : c === 'part' ? <span title="Settles part of a bill; the rest is an advance until the next bill" style={{ fontSize: 10, fontWeight: 800, color: '#B54708' }}>◐ part</span>
  : <span title="No bill / journal of this amount in Tally yet" style={{ fontSize: 10, fontWeight: 800, color: '#B54708' }}>⚠ bill / JV pending</span>;

function PayList({ items, title, empty }) {
  return (
    <div style={{ minWidth: 0 }}>
      {title && <div style={{ fontSize: 10.5, fontWeight: 800, color: '#475467', textTransform: 'uppercase', margin: '2px 0 4px' }}>{title}</div>}
      {!items?.length ? <div style={{ fontSize: 11.5, color: '#98A2B3' }}>{empty || 'none'}</div> : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <tbody>{items.map(p => (
            <tr key={p.key}>
              <td style={{ ...cell, padding: '4px 7px', fontSize: 11.5, whiteSpace: 'nowrap' }}>{fmtD(p.date)}</td>
              <td style={{ ...cell, padding: '4px 7px', fontSize: 11.5 }}>{p.head && p.head !== p.party ? <><b>{p.head}</b> · </> : ''}{p.party}<div style={{ fontSize: 10, color: '#98A2B3' }}>{p.bank} · {p.voucher}</div></td>
              <td style={{ ...cell, padding: '4px 7px', fontSize: 11.5, ...num, fontWeight: 700 }}>{money(p.amount)}{p.of ? <div style={{ fontSize: 9.5, fontWeight: 600, color: '#98A2B3' }}>of {money(p.of)}</div> : null}</td>
              <td style={{ ...cell, padding: '4px 7px', whiteSpace: 'nowrap' }}><Closed c={p.closed} /></td>
            </tr>
          ))}</tbody>
        </table>
      )}
    </div>
  );
}

export default function OrderProfit() {
  const { selectedCompany } = useCompany();
  const cid = selectedCompany?.companyId;
  const navigate = useNavigate();
  const [fy, setFy] = useState(curFy);
  const [tab, setTab] = useState('orders');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(null);
  const [job, setJob] = useState(null);
  const poll = useRef(null);

  const load = useCallback(async () => {
    if (!cid) return;
    setLoading(true); setErr('');
    try {
      const r = await axios.get('/api/tally-reports/orders/summary', { params: { companyId: cid, fy: fy === 'all' ? '' : fy } });
      if (!r.data || typeof r.data !== 'object' || !r.data.totals) throw new Error('The ERP server needs a restart (node server.js) — it is running an older version without this page.');
      setData(r.data);
    } catch (e) { setErr(e.response?.data?.error || e.message); }
    setLoading(false);
  }, [cid, fy]);
  useEffect(() => { load(); setOpen(null); }, [load]);

  const watch = useCallback(() => {
    clearInterval(poll.current);
    poll.current = setInterval(async () => {
      try { const j = (await axios.get(`/api/tally-reports/bank/fetch-status?companyId=${cid}`)).data?.job; setJob(j); if (!j || !j.running) { clearInterval(poll.current); if (j?.error) setErr(`Fetch stopped: ${j.error}`); load(); } } catch { /* keep polling */ }
    }, 3000);
  }, [cid, load]);
  useEffect(() => () => clearInterval(poll.current), []);
  useEffect(() => { if (cid) axios.get(`/api/tally-reports/bank/fetch-status?companyId=${cid}`).then(r => { if (r.data?.job?.running) { setJob(r.data.job); watch(); } }).catch(() => {}); }, [cid, watch]);
  const fetchAll = async () => {
    setErr('');
    try { const r = await axios.get(`/api/tally-reports/bank/fetch?companyId=${cid}&all=1&what=all`); setJob(r.data.job); watch(); }
    catch (e) { setErr(e.response?.data?.error || e.message); if (e.response?.data?.job) { setJob(e.response.data.job); watch(); } }
  };
  const running = !!job?.running;

  const t = q.trim().toLowerCase();
  const has = (...v) => !t || v.join(' ').toLowerCase().includes(t);
  const orders = useMemo(() => (data?.orders || []).filter(o => has(o.orderNo, o.client, o.customerPO, ...o.pos.map(p => `${p.poNumber} ${p.vendor}`))), [data, t]);   // eslint-disable-line react-hooks/exhaustive-deps
  const vendors = useMemo(() => (data?.vendors || []).filter(v => has(v.vendor, ...v.pos.map(p => `${p.poNumber} ${p.orderNo}`))), [data, t]);   // eslint-disable-line react-hooks/exhaustive-deps
  const clients = useMemo(() => (data?.clients || []).filter(c => has(c.client, ...c.orders.map(o => `${o.orderNo} ${o.customerPO}`))), [data, t]);   // eslint-disable-line react-hooks/exhaustive-deps
  const overheads = useMemo(() => (data?.overheads || []).filter(o => has(o.head, ...o.items.map(i => i.party))), [data, t]);   // eslint-disable-line react-hooks/exhaustive-deps
  const T = data?.totals || {};
  const toggle = k => setOpen(o => (o === k ? null : k));

  /* ── print: one order with every detail, or all the orders shown ── */
  const esc = v => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const company = selectedCompany?.companyName || '';
  const PRINT_CSS = `body{font-family:Inter,Arial,sans-serif;font-size:11px;color:#101828;margin:18px} h1{font-size:17px;margin:0} h2{font-size:12.5px;margin:16px 0 6px;padding-bottom:4px;border-bottom:1.5px solid #104f4f;color:#104f4f}
    .s{color:#667085;margin:2px 0 12px} table{width:100%;border-collapse:collapse;margin-bottom:6px} th,td{border:1px solid #D0D5DD;padding:4px 6px;vertical-align:top} th{background:#F2F4F7;text-align:left;font-size:9.5px;text-transform:uppercase}
    .n{text-align:right;white-space:nowrap} tr.t td{font-weight:700;background:#F9FAFB} .g{display:grid;grid-template-columns:repeat(3,1fr);gap:4px 18px;border:1px solid #D0D5DD;border-radius:6px;padding:8px 10px}
    .g b{display:block;font-size:9.5px;color:#667085;text-transform:uppercase;font-weight:600} .k{display:grid;grid-template-columns:repeat(5,1fr);gap:6px} .k div{border:1px solid #D0D5DD;border-radius:6px;padding:6px 8px} .k b{display:block;font-size:9.5px;color:#667085;text-transform:uppercase}
    .k span{font-size:13px;font-weight:700} .pos{color:#067647} .neg{color:#B42318} .sub td{background:#FCFCFD;font-size:10.5px} .sig{display:flex;justify-content:space-between;margin-top:44px} @media print{h2{break-after:avoid} tr{break-inside:avoid}}`;
  const openPrint = (title, body) => {
    const w = window.open('', '_blank'); if (!w) return;
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>${PRINT_CSS}</style></head><body>${body}<div class="s" style="margin-top:18px">Printed ${new Date().toLocaleString('en-IN')} · from Tally data saved in the ERP</div></body></html>`);
    w.document.close(); w.focus(); setTimeout(() => w.print(), 300);
  };
  const payRows = (items, empty) => !items?.length ? `<tr><td colspan="5" style="color:#98A2B3">${empty}</td></tr>`
    : items.map(p => `<tr><td>${fmtD(p.date)}</td><td>${esc(p.party)}${p.head && p.head !== p.party ? ' · ' + esc(p.head) : ''}</td><td>${esc(p.bank)}</td><td>${esc(p.voucher)}</td><td class="n">${money(p.amount)}${p.of ? ` <span style="color:#98A2B3">of ${money(p.of)}</span>` : ''}</td></tr>`).join('');
  const printOrder = o => {
    const toPay = p => (p.billed || p.valueGst) - p.paid;
    openPrint(`Order ${o.orderNo} — ${o.client}`, `
      <h1>${esc(company)} — Order Details</h1><div class="s">Order ${esc(o.orderNo)} · FY view ${fy === 'all' ? 'all years' : 'FY ' + fy}</div>
      <div class="g"><div><b>Order ID / SO file no</b>${esc(o.orderNo)}</div><div><b>Client</b>${esc(o.client)}</div><div><b>Client order no</b>${esc(o.customerPO) || '—'}</div>
        <div><b>Order date</b>${fmtD(o.orderDate)}</div><div><b>Status</b>${esc(o.status) || '—'}</div><div><b>Order value</b>₹${money(o.value)} ex-GST · ₹${money(o.valueGst)} incl. GST</div></div>
      <h2>Summary</h2>
      <div class="k"><div><b>Invoiced</b><span>₹${money(o.invoiced)}</span></div><div><b>Received</b><span class="pos">₹${money(o.received)}</span></div><div><b>To receive</b><span>₹${money(Math.max(0, o.toReceive))}</span></div>
        <div><b>PO value · paid</b><span>₹${money(o.poValue)} · ${money(o.poPaid + o.vendorPaidNoPo)}</span></div><div><b>Order expenses</b><span class="neg">₹${money(o.expTotal)}</span></div></div>
      <div class="k" style="margin-top:6px"><div style="grid-column:span 3"><b>Profit (ex-GST)</b><span class="${(o.profit || 0) >= 0 ? 'pos' : 'neg'}">${o.costLinked ? `₹${money(o.profit)}${o.margin != null ? ' · ' + o.margin + '%' : ''} = value ${money(o.value)} − PO value ${money(o.poValue)} − expenses ${money(o.expTotal)}` : 'cost not linked yet'}</span></div>
        <div style="grid-column:span 2"><b>Cash position (incl. GST)</b><span>₹${money(o.cash)} = received − paid</span></div></div>
      <h2>Sales invoices (Tally)</h2>
      <table><thead><tr><th>Date</th><th>Voucher</th><th>Invoice no</th><th class="n">Amount</th></tr></thead><tbody>
        ${o.invoices?.length ? o.invoices.map(i => `<tr><td>${fmtD(i.date)}</td><td>${esc(i.vt)}</td><td>${esc(i.no)}</td><td class="n">${money(i.amount)}</td></tr>`).join('') : '<tr><td colspan="4" style="color:#98A2B3">no invoice linked</td></tr>'}
        <tr class="t"><td colspan="3">Total invoiced</td><td class="n">${money(o.invoiced)}</td></tr></tbody></table>
      <h2>Receipts from client</h2>
      <table><thead><tr><th>Date</th><th>Party</th><th>Bank</th><th>Voucher</th><th class="n">Amount</th></tr></thead><tbody>${payRows(o.receipts, 'no receipt linked')}<tr class="t"><td colspan="4">Total received</td><td class="n">${money(o.received)}</td></tr></tbody></table>
      <h2>Purchase orders &amp; vendor payments</h2>
      ${!o.pos.length ? '<div class="s">No PO linked to this order.</div>' : o.pos.map(p => `
        <table><thead><tr><th>PO no</th><th>Vendor</th><th>PO date</th><th class="n">PO value (ex-GST)</th><th class="n">Incl. GST</th><th class="n">Billed</th><th class="n">Paid</th><th class="n">Balance</th></tr></thead><tbody>
          <tr><td><b>${esc(p.poNumber)}</b></td><td>${esc(p.vendor)}</td><td>${fmtD(p.poDate)}</td><td class="n">${money(p.value)}</td><td class="n">${money(p.valueGst)}</td><td class="n">${money(p.billed)}</td><td class="n">${money(p.paid)}</td><td class="n">${toPay(p) > 1 ? money(toPay(p)) : '✓ paid'}</td></tr>
          ${p.payments.length ? p.payments.map(x => `<tr class="sub"><td></td><td colspan="2">${fmtD(x.date)} · ${esc(x.bank)} · ${esc(x.voucher)}</td><td colspan="4">${esc(x.party)}</td><td class="n">${money(x.amount)}</td></tr>`).join('') : '<tr class="sub"><td></td><td colspan="7" style="color:#98A2B3">no payment linked</td></tr>'}
        </tbody></table>`).join('')}
      ${o.vendorPaidNoPo ? `<div class="s">Vendor payments for this order without a PO: ₹${money(o.vendorPaidNoPo)}</div>` : ''}
      <table><tbody><tr class="t"><td>Total POs · ${o.pos.length}</td><td class="n">PO value ${money(o.poValue)}</td><td class="n">Paid ${money(o.poPaid)}</td></tr></tbody></table>
      <h2>Expenses on this order</h2>
      <table><thead><tr><th>Date</th><th>Party / head</th><th>Bank</th><th>Voucher</th><th class="n">Amount</th></tr></thead><tbody>${payRows(o.expenses, 'no expense linked')}<tr class="t"><td colspan="4">Total expenses</td><td class="n">${money(o.expTotal)}</td></tr></tbody></table>
      <div class="sig"><span>Prepared by</span><span>Checked by</span><span>Approved by</span></div>`);
  };
  const printAllOrders = () => {
    const sum = k => orders.reduce((t, o) => t + (o[k] || 0), 0);
    openPrint(`Orders — ${fy === 'all' ? 'all years' : 'FY ' + fy}`, `
      <h1>${esc(company)} — Order-wise Summary</h1><div class="s">${fy === 'all' ? 'All years' : 'FY ' + fy} · ${orders.length} orders${q.trim() ? ' · filtered: ' + esc(q) : ''}</div>
      <table><thead><tr><th>Order ID</th><th>Date</th><th>Client</th><th>Client order no</th><th class="n">Value</th><th class="n">Invoiced</th><th class="n">Received</th><th class="n">To receive</th><th class="n">POs</th><th class="n">Paid to vendors</th><th class="n">Expenses</th><th class="n">Profit</th><th class="n">Margin</th></tr></thead><tbody>
        ${orders.map(o => `<tr><td><b>${esc(o.orderNo)}</b></td><td>${fmtD(o.orderDate)}</td><td>${esc(o.client)}</td><td>${esc(o.customerPO)}</td><td class="n">${money(o.value)}</td><td class="n">${o.invoiced ? money(o.invoiced) : ''}</td><td class="n">${o.received ? money(o.received) : ''}</td>
          <td class="n">${o.toReceive > 1 ? money(o.toReceive) : '✓'}</td><td class="n">${o.pos.length ? o.pos.length + ' · ' + money(o.poValue) : ''}</td><td class="n">${o.poPaid + o.vendorPaidNoPo ? money(o.poPaid + o.vendorPaidNoPo) : ''}</td><td class="n">${o.expTotal ? money(o.expTotal) : ''}</td>
          <td class="n ${(o.profit || 0) >= 0 ? 'pos' : 'neg'}">${o.costLinked ? money(o.profit) : '<span style="color:#98A2B3">not linked</span>'}</td><td class="n">${o.margin != null ? o.margin + '%' : ''}</td></tr>`).join('')}
        <tr class="t"><td colspan="4">Total · ${orders.length} orders</td><td class="n">${money(sum('value'))}</td><td class="n">${money(sum('invoiced'))}</td><td class="n">${money(sum('received'))}</td><td class="n"></td><td class="n">${money(sum('poValue'))}</td>
          <td class="n">${money(orders.reduce((t, o) => t + o.poPaid + o.vendorPaidNoPo, 0))}</td><td class="n">${money(sum('expTotal'))}</td><td class="n">${money(orders.filter(o => o.costLinked).reduce((t, o) => t + o.profit, 0))}</td><td></td></tr>
      </tbody></table>
      <div class="s">Values ex-GST from the ERP orders / POs; received and paid incl. GST from the Tally bank entries. Profit only for orders with a PO or expense linked${T.tallyNet != null ? ` · Company result (Tally P&amp;L): ₹${money(T.tallyNet)}` : ''}.</div>
      <div class="sig"><span>Prepared by</span><span>Checked by</span><span>Approved by</span></div>`);
  };

  const stat = (label, value, color, sub) => (
    <div style={{ flex: '1 1 140px', minWidth: 130, padding: '7px 12px', borderLeft: `1px solid ${BD}` }}>
      <div style={{ fontSize: 10.5, fontWeight: 800, color: '#667085', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 800, color, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      {sub && <div style={{ fontSize: 10.5, color: '#667085' }}>{sub}</div>}
    </div>
  );
  const tabBtn = (k, label, n) => (
    <button key={k} onClick={() => { setTab(k); setOpen(null); }} style={{ height: 32, padding: '0 14px', border: 'none', borderRadius: 7, cursor: 'pointer', fontFamily: F, fontSize: 12.5, fontWeight: 800,
      background: tab === k ? '#104f4f' : 'transparent', color: tab === k ? '#fff' : '#344054' }}>{label}{n != null ? <span style={{ opacity: 0.7 }}> {n}</span> : null}</button>
  );
  const exp = { background: '#F9FAFB' };

  if (!cid) return <div style={{ padding: 40, fontFamily: F, color: '#667085' }}>Select a company first.</div>;

  return (
    <div style={{ fontFamily: F, display: 'flex', flexDirection: 'column', gap: 8, height: '100%', minHeight: 0, padding: '12px 14px', boxSizing: 'border-box', background: '#F2F4F7' }}>
      <div style={{ background: '#fff', border: `1px solid ${BD}`, borderRadius: 12, padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 15, fontWeight: 800 }}>📊 Order Profit <span style={{ fontSize: 11.5, fontWeight: 700, color: '#667085' }}>· orders, POs, payments, expenses — from Tally + ERP</span></div>
          <FyDropdown value={fy} options={['all', ...FYS]} onChange={setFy} neu current={curFy} />
          <div style={{ flex: 1 }} />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="🔍 Order ID, PO no., client, vendor…" style={{ height: 32, padding: '0 11px', border: '1px solid #D0D5DD', borderRadius: 8, fontSize: 12.5, fontFamily: F, width: 250 }} />
          {tab === 'orders' && orders.length > 0 && <button onClick={printAllOrders} title="Print the order-wise summary of the orders shown" style={{ height: 32, padding: '0 12px', border: 'none', borderRadius: 8, background: '#104f4f', color: '#fff', cursor: 'pointer', fontFamily: F, fontWeight: 700, fontSize: 12 }}>🖨 Print orders</button>}
          <button onClick={() => navigate('/account/statement')} style={{ height: 32, padding: '0 12px', border: '1px solid #D0D5DD', borderRadius: 8, background: '#fff', color: '#175CD3', cursor: 'pointer', fontFamily: F, fontWeight: 700, fontSize: 12 }}>🏦 Bank Statement</button>
          <button onClick={fetchAll} disabled={running} style={{ height: 32, padding: '0 12px', border: '1px solid #D0D5DD', borderRadius: 8, background: '#fff', color: '#344054', cursor: running ? 'wait' : 'pointer', fontFamily: F, fontWeight: 700, fontSize: 12 }}>{running ? 'Fetching…' : '⟳ Fetch from Tally'}</button>
        </div>
        {data && (
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'stretch', marginLeft: -12 }}>
            {stat('Order value', '₹' + short(T.value), '#344054', `${T.orders} orders · ex-GST`)}
            {stat('Order cost', '₹' + short(T.cost), '#B42318', `POs + expenses · ${T.linkedOrders} orders with cost linked`)}
            {stat("Orders' profit", '₹' + short(T.ordersProfit), T.ordersProfit >= 0 ? '#067647' : '#B42318', T.noCostOrders ? `${T.noCostOrders} orders (₹${short(T.noCostValue)}) have no cost linked yet` : 'all orders have cost linked')}
            {stat('Overheads', '₹' + short(T.overheads), '#B42318', 'salary, office, milk & tea …')}
            {stat(T.tallyNet == null ? 'Tally P&L' : T.tallyNet >= 0 ? 'Net profit · Tally P&L' : 'Net loss · Tally P&L', T.tallyNet == null ? '—' : '₹' + short(T.tallyNet), T.tallyNet == null ? '#98A2B3' : T.tallyNet >= 0 ? '#067647' : '#B42318',
              T.tallyNet == null ? 'fetch the Balance Sheet & P&L for this FY' : `the company's real result · ${fy === 'all' ? 'all years' : 'FY ' + fy}`)}
            {stat('Not linked yet', '₹' + short((T.unassignedReceipts || 0) + (T.unassignedVendor || 0)), '#B54708', `receipts ₹${short(T.unassignedReceipts)} · vendor ₹${short(T.unassignedVendor)}`)}
          </div>
        )}
      </div>

      {running && <div style={{ background: '#F0F9FF', border: '1px solid #B9E6FE', borderRadius: 10, padding: '7px 14px', fontSize: 12.5, color: '#026AA2', fontWeight: 600 }}>⏳ Reading from Tally — {job.step || 'starting…'} · {job.done.length} of {job.fys.length} FY done. This page updates when it finishes.</div>}
      {err && <div style={{ background: '#FFFAEB', border: '1px solid #FEDF89', borderRadius: 10, padding: '8px 14px', fontSize: 13, color: '#B54708', fontWeight: 600 }}>⚠ {err}</div>}
      {data && !data.fysWithBills?.length && <div style={{ background: '#FFFAEB', border: '1px solid #FEDF89', borderRadius: 10, padding: '8px 14px', fontSize: 12.5, color: '#B54708', fontWeight: 600 }}>Tally bills are not read yet — "billed" and the "bill pending" check need them. Click ⟳ Fetch from Tally.</div>}

      {data && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', background: '#fff', border: `1px solid ${BD}`, borderRadius: 9, padding: 2 }}>
            {tabBtn('orders', 'Orders', orders.length)}{tabBtn('vendors', 'Vendors · PO-wise', vendors.length)}{tabBtn('clients', 'Clients · order-wise', clients.length)}{tabBtn('overheads', 'Overheads', overheads.length)}
          </div>
          <span style={{ fontSize: 11.5, color: '#667085' }}>Click a row for every PO, payment, receipt and expense. Payments are linked through the Tally bills they settle (oldest bill first); link the rest on the Bank Statement.</span>
        </div>
      )}

      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', background: '#fff', border: `1px solid ${GRID}`, borderRadius: 10 }}>
        {loading ? <div style={{ padding: 40, textAlign: 'center', color: '#98A2B3' }}>Working out the picture…</div>
        : !data ? null
        : tab === 'orders' ? (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              {['Order ID', 'Client', 'Client Order No'].map(h => <th key={h} style={th}>{h}</th>)}
              {['Order value', 'Invoiced', 'Received', 'To receive', 'POs', 'Paid to vendors', 'Order expenses', 'Profit', 'Margin'].map(h => <th key={h} style={{ ...th, ...num }}>{h}</th>)}
            </tr></thead>
            <tbody>
              {orders.map(o => (
                <React.Fragment key={o.orderId}>
                  <tr onClick={() => toggle(o.orderId)} style={{ cursor: 'pointer', background: open === o.orderId ? '#F5FAFF' : '#fff' }}>
                    <td style={cell}><b style={{ color: '#175CD3' }}>{open === o.orderId ? '▾' : '▸'} {o.orderNo}</b><div style={{ fontSize: 10.5, color: '#98A2B3' }}>{fmtD(o.orderDate)}{o.status ? ` · ${o.status}` : ''}</div></td>
                    <td style={cell}>{o.client}</td>
                    <td style={{ ...cell, fontSize: 11.5 }}>{o.customerPO || '—'}</td>
                    <td style={{ ...cell, ...num, fontWeight: 700 }}>{money(o.value)}</td>
                    <td style={{ ...cell, ...num }}>{o.invoiced ? money(o.invoiced) : '—'}</td>
                    <td style={{ ...cell, ...num, color: '#067647', fontWeight: 700 }}>{o.received ? money(o.received) : '—'}</td>
                    <td style={{ ...cell, ...num, color: o.toReceive > 1 ? '#B54708' : '#067647' }}>{o.toReceive > 1 ? money(o.toReceive) : '✓'}</td>
                    <td style={{ ...cell, ...num }}>{o.pos.length ? <>{o.pos.length} · {money(o.poValue)}</> : '—'}</td>
                    <td style={{ ...cell, ...num, color: '#B42318' }}>{o.poPaid + o.vendorPaidNoPo ? money(o.poPaid + o.vendorPaidNoPo) : '—'}</td>
                    <td style={{ ...cell, ...num, color: '#B42318' }}>{o.expTotal ? money(o.expTotal) : '—'}</td>
                    {o.costLinked ? <td style={{ ...cell, ...num, fontWeight: 800, color: o.profit >= 0 ? '#067647' : '#B42318' }}>{money(o.profit)}</td>
                      : <td style={{ ...cell, ...num, color: '#98A2B3', fontSize: 11 }} title="No PO or expense is linked to this order yet">cost not linked</td>}
                    <td style={{ ...cell, ...num, color: o.profit >= 0 ? '#067647' : '#B42318' }}>{o.margin != null ? `${o.margin}%` : '—'}</td>
                  </tr>
                  {open === o.orderId && (
                    <tr><td colSpan={12} style={{ ...cell, ...exp, padding: 10 }}>
                      <div style={{ fontSize: 10.5, fontWeight: 800, color: '#475467', textTransform: 'uppercase', marginBottom: 4 }}>POs under this order — PO-wise payments</div>
                      {!o.pos.length ? <div style={{ fontSize: 11.5, color: '#98A2B3', marginBottom: 8 }}>No PO linked to this order in the ERP.</div> : (
                        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 10, background: '#fff' }}>
                          <thead><tr>{['PO No', 'Vendor', 'PO value', 'Billed in Tally', 'Paid', 'Balance to pay', 'Payments'].map(h => <th key={h} style={{ ...th, position: 'static', ...(['PO value', 'Billed in Tally', 'Paid', 'Balance to pay'].includes(h) ? num : {}) }}>{h}</th>)}</tr></thead>
                          <tbody>{o.pos.map(p => (
                            <tr key={p.poId}>
                              <td style={cell}><b>{p.poNumber}</b><div style={{ fontSize: 10.5, color: '#98A2B3' }}>{fmtD(p.poDate)}</div></td>
                              <td style={cell}>{p.vendor}</td>
                              <td style={{ ...cell, ...num }}>{money(p.value)}<div style={{ fontSize: 10, color: '#98A2B3' }}>{money(p.valueGst)} incl. GST</div></td>
                              <td style={{ ...cell, ...num }}>{p.billed ? money(p.billed) : '—'}</td>
                              <td style={{ ...cell, ...num, color: '#B42318', fontWeight: 700 }}>{p.paid ? money(p.paid) : '—'}</td>
                              <td style={{ ...cell, ...num, color: (p.billed || p.valueGst) - p.paid > 1 ? '#B54708' : '#067647' }}>{(p.billed || p.valueGst) - p.paid > 1 ? money((p.billed || p.valueGst) - p.paid) : '✓ paid'}</td>
                              <td style={{ ...cell, width: '38%' }}><PayList items={p.payments} empty="no payment linked yet" /></td>
                            </tr>
                          ))}</tbody>
                        </table>
                      )}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 12 }}>
                        <PayList title={`Receipts from client · ₹${money(o.received)}`} items={o.receipts} empty="no receipt linked yet" />
                        <PayList title={`Expenses on this order · ₹${money(o.expTotal)}`} items={o.expenses} empty="no expense linked (link transport, labour … on the Bank Statement)" />
                      </div>
                      <div style={{ marginTop: 8, fontSize: 11.5, color: '#475467' }}>
                        <button onClick={() => printOrder(o)} style={{ float: 'right', height: 30, padding: '0 12px', border: 'none', borderRadius: 7, background: '#104f4f', color: '#fff', cursor: 'pointer', fontFamily: F, fontWeight: 700, fontSize: 12 }}>🖨 Print order details</button>
                        {o.costLinked ? <>Profit = order value {money(o.value)} − PO value {money(o.poValue)} − expenses {money(o.expTotal)} = <b style={{ color: o.profit >= 0 ? '#067647' : '#B42318' }}>{money(o.profit)}</b> (ex-GST)</> : <b style={{ color: '#B54708' }}>No PO or expense linked to this order yet — profit can't be worked out.</b>}
                        · Cash: received {money(o.received)} − paid {money(o.poPaid + o.vendorPaidNoPo + o.expTotal)} = <b>{money(o.cash)}</b>
                      </div>
                    </td></tr>
                  )}
                </React.Fragment>
              ))}
              {orders.length === 0 && <tr><td colSpan={12} style={{ padding: 30, textAlign: 'center', color: '#98A2B3' }}>No orders{fy !== 'all' ? ` dated in FY ${fy}` : ''}.</td></tr>}
            </tbody>
          </table>
        ) : tab === 'vendors' ? (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              <th style={th}>Vendor</th>
              {['POs', 'PO value', 'Paid against PO', 'Paid without PO', 'Billed in Tally'].map(h => <th key={h} style={{ ...th, ...num }}>{h}</th>)}
              <th style={{ ...th, ...num }}>Tally balance</th>
            </tr></thead>
            <tbody>
              {vendors.map(v => (
                <React.Fragment key={v.vendor}>
                  <tr onClick={() => toggle(v.vendor)} style={{ cursor: 'pointer', background: open === v.vendor ? '#F5FAFF' : '#fff' }}>
                    <td style={cell}><b>{open === v.vendor ? '▾' : '▸'} {v.vendor}</b>{v.kind && <div style={{ fontSize: 10.5, color: '#98A2B3' }}>{v.kind === 'material' ? 'material vendor' : v.kind}</div>}</td>
                    <td style={{ ...cell, ...num }}>{v.pos.length || '—'}</td>
                    <td style={{ ...cell, ...num }}>{v.pos.length ? money(v.pos.reduce((t, p) => t + p.value, 0)) : '—'}</td>
                    <td style={{ ...cell, ...num, color: '#B42318', fontWeight: 700 }}>{v.paidPo ? money(v.paidPo) : '—'}</td>
                    <td style={{ ...cell, ...num, color: v.paidNoPo ? '#B54708' : '#98A2B3' }}>{v.paidNoPo ? money(v.paidNoPo) : '—'}</td>
                    <td style={{ ...cell, ...num }}>{v.billed ? money(v.billed) : '—'}</td>
                    <td style={{ ...cell, ...num, fontWeight: 700, color: v.balance == null ? '#98A2B3' : Math.abs(v.balance) < 1 ? '#067647' : v.balance > 0 ? '#B54708' : '#344054' }}>
                      {balTxt(v.balance)}{v.balance != null && Math.abs(v.balance) >= 1 && <div style={{ fontSize: 10, fontWeight: 600, color: '#667085' }}>{v.balance > 0 ? 'advance paid — bill pending' : 'payable to vendor'}</div>}
                    </td>
                  </tr>
                  {open === v.vendor && (
                    <tr><td colSpan={7} style={{ ...cell, ...exp, padding: 10 }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff', marginBottom: 10 }}>
                        <thead><tr>{['PO No', 'Order ID', 'PO value', 'Paid', 'Payments against this PO'].map(h => <th key={h} style={{ ...th, position: 'static', ...(['PO value', 'Paid'].includes(h) ? num : {}) }}>{h}</th>)}</tr></thead>
                        <tbody>{v.pos.map(p => (
                          <tr key={p.poId}><td style={cell}><b>{p.poNumber}</b>{p.tallyOnly && <div style={{ fontSize: 10, fontWeight: 700, color: '#B54708' }}>Tally PO · not in ERP</div>}</td><td style={{ ...cell, color: '#175CD3' }}>{p.orderNo || '—'}</td>
                            <td style={{ ...cell, ...num }}>{p.tallyOnly ? '—' : money(p.value)}</td><td style={{ ...cell, ...num, color: '#B42318', fontWeight: 700 }}>{p.paid ? money(p.paid) : '—'}</td>
                            <td style={{ ...cell, width: '45%' }}><PayList items={p.payments} empty="no payment linked yet" /></td></tr>
                        ))}{!v.pos.length && <tr><td colSpan={5} style={{ ...cell, color: '#98A2B3' }}>No PO for this vendor in the ERP.</td></tr>}</tbody>
                      </table>
                      <PayList title={`Paid without PO · ₹${money(v.paidNoPo)}`} items={v.payments} empty="none" />
                    </td></tr>
                  )}
                </React.Fragment>
              ))}
              {vendors.length === 0 && <tr><td colSpan={7} style={{ padding: 30, textAlign: 'center', color: '#98A2B3' }}>No vendor payments.</td></tr>}
            </tbody>
          </table>
        ) : tab === 'clients' ? (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr><th style={th}>Client</th>{['Orders', 'Invoiced in Tally', 'Received', 'Received without order'].map(h => <th key={h} style={{ ...th, ...num }}>{h}</th>)}<th style={{ ...th, ...num }}>Tally balance</th></tr></thead>
            <tbody>
              {clients.map(c => (
                <React.Fragment key={c.client}>
                  <tr onClick={() => toggle(c.client)} style={{ cursor: 'pointer', background: open === c.client ? '#F5FAFF' : '#fff' }}>
                    <td style={cell}><b>{open === c.client ? '▾' : '▸'} {c.client}</b></td>
                    <td style={{ ...cell, ...num }}>{c.orders.length || '—'}</td>
                    <td style={{ ...cell, ...num }}>{c.invoiced ? money(c.invoiced) : '—'}</td>
                    <td style={{ ...cell, ...num, color: '#067647', fontWeight: 700 }}>{money(c.received)}</td>
                    <td style={{ ...cell, ...num, color: c.receivedNoOrder ? '#B54708' : '#98A2B3' }}>{c.receivedNoOrder ? money(c.receivedNoOrder) : '—'}</td>
                    <td style={{ ...cell, ...num, fontWeight: 700, color: c.balance == null ? '#98A2B3' : Math.abs(c.balance) < 1 ? '#067647' : c.balance > 0 ? '#B54708' : '#344054' }}>
                      {balTxt(c.balance)}{c.balance != null && Math.abs(c.balance) >= 1 && <div style={{ fontSize: 10, fontWeight: 600, color: '#667085' }}>{c.balance > 0 ? 'to receive' : 'advance from client'}</div>}
                    </td>
                  </tr>
                  {open === c.client && (
                    <tr><td colSpan={6} style={{ ...cell, ...exp, padding: 10 }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff', marginBottom: 10 }}>
                        <thead><tr>{['Order ID', 'Client Order No', 'Order value', 'Invoiced', 'Received', 'Receipts against this order'].map(h => <th key={h} style={{ ...th, position: 'static', ...(['Order value', 'Invoiced', 'Received'].includes(h) ? num : {}) }}>{h}</th>)}</tr></thead>
                        <tbody>{c.orders.map(o => (
                          <tr key={o.orderId}><td style={{ ...cell, color: '#175CD3', fontWeight: 800 }}>{o.orderNo}</td><td style={{ ...cell, fontSize: 11.5 }}>{o.customerPO || '—'}</td>
                            <td style={{ ...cell, ...num }}>{money(o.valueGst)}</td><td style={{ ...cell, ...num }}>{o.invoiced ? money(o.invoiced) : '—'}</td><td style={{ ...cell, ...num, color: '#067647', fontWeight: 700 }}>{money(o.received)}</td>
                            <td style={{ ...cell, width: '42%' }}><PayList items={o.receipts} /></td></tr>
                        ))}</tbody>
                      </table>
                      <PayList title={`Received without an order · ₹${money(c.receivedNoOrder)}`} items={c.receipts} empty="none" />
                    </td></tr>
                  )}
                </React.Fragment>
              ))}
              {clients.length === 0 && <tr><td colSpan={6} style={{ padding: 30, textAlign: 'center', color: '#98A2B3' }}>No client receipts.</td></tr>}
            </tbody>
          </table>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr><th style={th}>Expense head</th><th style={th}>Type</th><th style={{ ...th, ...num }}>Entries</th><th style={{ ...th, ...num }}>Amount</th></tr></thead>
            <tbody>
              {overheads.map(o => (
                <React.Fragment key={o.head}>
                  <tr onClick={() => toggle(o.head)} style={{ cursor: 'pointer', background: open === o.head ? '#F5FAFF' : '#fff' }}>
                    <td style={cell}><b>{open === o.head ? '▾' : '▸'} {o.head}</b></td><td style={{ ...cell, fontSize: 11.5 }}>{o.category}</td>
                    <td style={{ ...cell, ...num }}>{o.count}</td><td style={{ ...cell, ...num, fontWeight: 800, color: '#B42318' }}>{money(o.amount)}</td>
                  </tr>
                  {open === o.head && <tr><td colSpan={4} style={{ ...cell, ...exp, padding: 10 }}><PayList items={o.items} /></td></tr>}
                </React.Fragment>
              ))}
              <tr style={{ background: '#F2F4F7' }}><td style={{ ...cell, fontWeight: 800 }} colSpan={3}>Total overheads (not linked to an order){overheads.some(o => o.category === 'suspense') ? ' · suspense not counted' : ''}</td>
                <td style={{ ...cell, ...num, fontWeight: 800, color: '#B42318' }}>{money(T.overheads)}</td></tr>
              <tr><td style={{ ...cell, fontWeight: 800 }} colSpan={3}>Orders' profit − overheads = {T.net >= 0 ? 'net profit' : 'net loss'}</td>
                <td style={{ ...cell, ...num, fontWeight: 800, fontSize: 14, color: T.net >= 0 ? '#067647' : '#B42318' }}>{money(T.net)}</td></tr>
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
