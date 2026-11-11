/* Beta — Jobcode. One sheet, same data as the classic Jobcode (/project/list): one jobcode = one sales order, and beside it
 * its linked purchase orders (bills / payments) and the expenses booked on it — one line per item, like the classic sheet.
 * Jobcode + client stay frozen on the left; Show: hides the Sales order / Purchase order / Expense block.
 * Select a jobcode → Print cost sheet, Rename jobcode no. Toolbar: search, FY, Print list, Excel (same layout). */
import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import * as XLSX from 'xlsx';
import { useCompany } from '../../context/CompanyContext';
import { useAuth } from '../../context/AuthContext';
import { can } from '../../utils/permissions';
import { Svg } from '../../components/ui/Icon';
import { CSS as SALES_CSS, useClearSel } from './BetaSales';
import { PX_CSS } from './BetaPurchaseParts';
import { printDepList, dmy } from './BetaCertPrint';
import { ACC_CSS, amt, words, hit } from './BetaAccKit';
import { printJobCost } from './BetaJobcodePrint';

const n = v => Number(v) || 0;
const r = v => Math.round((Number(v) || 0) * 100) / 100;
const fyOf = d => { const x = d ? new Date(d) : new Date(); if (isNaN(x)) return ''; const s = x.getMonth() >= 3 ? x.getFullYear() : x.getFullYear() - 1; return `${String(s).slice(2)}-${String(s + 1).slice(2)}`; };
const k0 = v => (v == null ? '' : String(v));
const short = v => { const a = Math.abs(v); return a >= 1e7 ? `${(v / 1e7).toFixed(2)} Cr` : a >= 1e5 ? `${(v / 1e5).toFixed(2)} L` : amt(v); };
const ST = { approved: ['Open', '#EFF8FF', '#175CD3'], 'in-progress': ['In progress', '#FFFAEB', '#B54708'], dispatched: ['Dispatched', '#F4F3FF', '#5925DC'],
  completed: ['Completed', '#ECFDF3', '#067647'], closed: ['Closed', '#F2F4F7', '#475467'], pending: ['Pending', '#FFFAEB', '#B54708'] };
const stOf = s => ST[s] || [s ? s[0].toUpperCase() + s.slice(1) : 'Open', '#EFF8FF', '#175CD3'];
const FILTERS = [['open', 'Open', j => !j.closed], ['dues', 'Client dues', j => j.clientDue > 0.5], ['closed', 'Closed', j => j.closed], ['all', 'All', () => true]];
const W1 = 124, W2 = 210;   // frozen columns: jobcode, client
const CSS = `
.jc-bar { display:flex; align-items:center; background:#fff; border-bottom:1px solid #DCE6E8; flex-shrink:0; overflow-x:auto; white-space:nowrap; }
.jc-bar .ac-seg, .jc-bar .ac-sum { border-bottom:0; flex-wrap:nowrap; flex-shrink:0; background:none; }
.jc-bar .ac-seg { padding:5px 8px; gap:3px; } .jc-bar .ac-seg button { padding:4px 10px; font-size:12px; }
.jc-bar .ac-sum { border-left:1px solid #DCE6E8; } .jc-bar .ac-sum div { padding:4px 11px; font-size:10px; } .jc-bar .ac-sum b { font-size:13px; white-space:nowrap; }
.jc-show { margin-left:auto; padding:0 12px; flex-shrink:0; display:flex; align-items:center; gap:10px; font:600 12px Inter, Arial, sans-serif; color:#667085; }
.jc-show label { display:flex; align-items:center; gap:4px; color:#03444f; cursor:pointer; } .jc-show input { accent-color:#03444f; }
.jw { border-collapse:separate; border-spacing:0; font-size:12px; min-width:100%; width:max-content; color:#101828; }
.jw th { position:sticky; top:0; z-index:2; background:#D4EBEE; color:#000; font-weight:700; font-size:11px; padding:0 9px; height:30px; white-space:nowrap; text-align:left;
  border-right:1px solid #B9D0D3; border-bottom:1px solid #A9CDD2; }
.jw thead tr:nth-child(2) th { top:30px; }
.jw th.g { text-align:center; letter-spacing:.6px; text-transform:uppercase; font-size:11px; font-weight:800; color:#03444f; background:#C3E1E5; }
.jw th.g.po, .jw th.g.ex, .jw th.g.st { background:#C3E1E5; }
.jw th.r, .jw td.r { text-align:right; }
.jw td { padding:0 9px; height:26px; vertical-align:middle; white-space:nowrap; background:#fff; border-right:1px solid #D5E3E5; }
.jw .s1 { border-left:1px solid #9FC3C8; }                  /* start of a block: Sales order | Purchase order | Expense | Status */
.jw td.top { vertical-align:top; padding-top:5px; }
.jw td.tx { max-width:230px; overflow:hidden; text-overflow:ellipsis; }
.jw td.b { font-weight:700; } .jw .mono { font-weight:700; color:#03444f; }
.jw td.nil { color:#98A2B3; font-style:italic; vertical-align:top; padding-top:5px; }
.jw tbody tr:last-child td { padding-bottom:4px; }
.jw tbody:nth-of-type(even) td { background:#FAFCFC; }
.jw tbody { cursor:pointer; }
.jw tbody:hover td { background:#F0F7F8; } .jw tbody.sel td { background:#D4EBEE !important; }
.jw .k1 { position:sticky; left:0; z-index:1; width:${W1}px; min-width:${W1}px; max-width:${W1}px; }
.jw .k2 { position:sticky; left:${W1}px; z-index:1; width:${W2}px; min-width:${W2}px; max-width:${W2}px; overflow:hidden; text-overflow:ellipsis; border-right:1px solid #9FC3C8; }
.jw th.k1, .jw th.k2 { z-index:3; } .jw tbody.sel td.k1 { box-shadow:inset 3px 0 0 #03444f; }
.jw tfoot td { position:sticky; bottom:0; height:30px; border-right:1px solid #B9D0D3; background:#E6F2F3 !important; font-weight:700; border-top:1px solid #A9CDD2; z-index:1; } .jw tfoot td.k1, .jw tfoot td.k2 { z-index:2; }`;

export default function BetaJobcode() {
  const { selectedCompany } = useCompany() || {};
  const { user } = useAuth() || {};
  const companyId = selectedCompany?.companyId;
  const [data, setData] = useState(null);
  const [reload, setReload] = useState(0);
  const [note, setNote] = useState(null);
  const [slot, setSlot] = useState(null);
  useEffect(() => {
    if (!companyId) return;
    const get = (u, d, extra) => axios.get(u, { params: { companyId, ...extra } }).then(x => x.data).catch(() => d);
    Promise.all([get('/api/sales-orders', []), get('/api/purchase-orders', []), get('/api/accounts/dues', {}), get('/api/accounts/expenses', []),
      get('/api/accounts/payments', []), get('/api/bills', [], { type: 'purchase' }), get('/api/bills', [], { type: 'sales' })])
      .then(([so, po, dues, ex, pay, pb, sb]) => setData({ so: arr(so), po: arr(po), cd: arr(dues?.clientDues), vd: arr(dues?.vendorDues), ex: arr(ex), pay: arr(pay), pb: arr(pb), sb: arr(sb) }));
  }, [companyId, reload]);
  const jobs = useMemo(() => (data ? buildJobs(data) : null), [data]);
  if (!can(user, 'project', 'view')) return <div className="sb"><style>{SALES_CSS}</style><div className="sb-empty" style={{ padding: 30 }}>You are not authorized to see Jobcodes.</div></div>;
  return (
    <div className="sb">
      <style>{SALES_CSS + PX_CSS + ACC_CSS + CSS}</style>
      <div className="sb-tabs" role="tablist">
        <button type="button" role="tab" aria-selected="true" className="sb-tab on">Jobcode{jobs && <span className="n">{jobs.length}</span>}</button>
        <div className="sb-slot" ref={setSlot} />
      </div>
      {note && <div className="sb-note" role="status">{note}<button type="button" onClick={() => setNote(null)} aria-label="Dismiss">×</button></div>}
      <JobSheet jobs={jobs} company={selectedCompany} user={user} slot={slot} companyId={companyId} onChanged={t => { setNote(t); setReload(x => x + 1); }} />
    </div>
  );
}

const arr = v => (Array.isArray(v) ? v : []);

/* one row per sales order, with everything linked to it */
function buildJobs({ so, po, cd, vd, ex, pay, pb, sb }) {
  const expPaid = e => pay.filter(p => p.type === 'payment' && p.status !== 'rejected' && (k0(p.expenseId) === k0(e.expenseId) || k0(p.orderId) === k0(e.expenseId)))
    .reduce((t, p) => t + n(p.amount), 0);
  return so.filter(o => !o.tallyImported && !['draft', 'rejected', 'cancelled'].includes(o.status)).map(o => {
    const id = k0(o.orderId);
    const due = cd.find(d => k0(d.orderId) === id || (o.orderNo && d.orderNo === o.orderNo));
    const pos = po.filter(p => [p.linkedSalesOrderId, p.salesOrderId, p.soRef].some(x => k0(x) === id) && !['draft', 'rejected', 'cancelled'].includes(p.status));
    const poList = pos.map(p => {
      const d = vd.find(x => k0(x.orderId) === k0(p.orderId) || (p.poNo && x.orderNo === p.poNo));
      const bill = pb.find(b => k0(b.orderId) === k0(p.orderId) || (b.orderNo && (b.orderNo === p.poNo || b.orderNo === p.poNumber)));
      const total = n(p.grandTotal || p.amount), paid = d ? n(d.paid || d.totalPaid) : 0;
      return { po: p, vendor: p.vendorName || '—', no: p.poNo || p.poNumber || `PO-${p.orderId}`, date: p.poDate || p.date, taxable: n(p.subTotal) || total - n(p.totalGST), total, paid,
        due: d ? Math.max(0, n(d.due ?? d.balance)) : Math.max(0, total - paid), billNo: bill?.billNo || '', billAmt: n(bill?.grandTotal),
        items: (p.items || []).map(i => `${i.itemName || i.description || i.name || ''} × ${n(i.qty || i.quantity)}`).join(', ') };
    });
    const expList = ex.filter(e => [e.soId, e.orderId, e.salesOrderId].some(x => k0(x) === id) && e.status !== 'rejected').map(e => {
      const base = n(e.amount), total = n(e.grandTotal) || base + base * n(e.taxRate) / 100;
      return { e, date: e.date, category: e.expenseCategory || e.category, desc: e.description || e.notes || '', party: e.vendorName || e.vendor || e.ledgerName || e.paidBy || '', base, total, paid: Math.min(total, expPaid(e)) };
    });
    const soValue = n(o.grandTotal || o.amount), soTaxable = n(o.subTotal) || soValue - n(o.totalGST);
    const received = due ? n(due.received ?? due.paymentsReceived ?? due.totalPaid) : 0;
    const clientDue = due ? Math.max(0, n(due.due ?? due.balance)) : Math.max(0, soValue - received);
    const poTaxable = poList.reduce((t, p) => t + p.taxable, 0), poValue = poList.reduce((t, p) => t + p.total, 0);
    const poPaid = poList.reduce((t, p) => t + p.paid, 0), poDue = poList.reduce((t, p) => t + p.due, 0);
    const expBase = expList.reduce((t, e) => t + e.base, 0), expTotal = expList.reduce((t, e) => t + e.total, 0), expPaidT = expList.reduce((t, e) => t + e.paid, 0);
    const billed = sb.filter(b => k0(b.orderId) === id && b.status !== 'cancelled').reduce((t, b) => t + n(b.grandTotal), 0);
    const unpaidExp = expList.filter(e => e.total > 0 && e.paid < e.total - 0.5).length;
    const clientOk = clientDue <= 0.5, vendorOk = poDue <= 0.5, expOk = unpaidExp === 0;
    const margin = soTaxable - poTaxable - expBase;
    return { id, so: o, no: o.orderNo || `SO-${o.orderId}`, client: o.customerName || o.clientName || '—', date: o.orderDate || o.date, fy: fyOf(o.orderDate || o.date),
      soValue, soTaxable, received, clientDue, billed, poList, poTaxable, poValue, poPaid, poDue, expList, expBase, expTotal, expPaid: expPaidT, unpaidExp,
      margin, marginPct: soTaxable ? margin / soTaxable * 100 : 0, clientOk, vendorOk, expOk, canClose: clientOk && vendorOk && expOk, closed: o.status === 'closed',
      text: `${o.orderNo} ${o.orderId} ${o.customerName} ${o.clientName} ${o.customerPO} ${(o.items || []).map(i => `${i.description} ${i.itemName}`).join(' ')} ${poList.map(p => `${p.vendor} ${p.no} ${p.items}`).join(' ')}` };
  }).sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) || n(b.so.orderId) - n(a.so.orderId));
}


function JobSheet({ jobs, company, user, slot, companyId, onChanged }) {
  const [qs, setQ] = useState('');
  const [fy, setFy] = useState(fyOf());
  const [st, setSt] = useState('open');
  const [selId, setSelId] = useState(null);
  const [ask, setAsk] = useState(null);          // rename: { j }
  const [newNo, setNewNo] = useState('');
  const [busy, setBusy] = useState(false);
  const [show, setShowS] = useState(() => { try { return { so: true, po: true, ex: true, ...JSON.parse(localStorage.getItem('bx-jc-show') || '{}') }; } catch { return { so: true, po: true, ex: true }; } });
  const setShow = f => setShowS(o => { const x = f(o); try { localStorage.setItem('bx-jc-show', JSON.stringify(x)); } catch { /* private mode */ } return x; });
  useClearSel(ask ? null : selId, setSelId, '.jw tbody, .sb-tools, .sb-ask, .cpv-ov, .jc-show');
  const canEdit = can(user, 'project', 'edit');
  const all = useMemo(() => jobs || [], [jobs]);
  const fys = useMemo(() => [...new Set([fyOf(), ...all.map(j => j.fy).filter(Boolean)])].sort().reverse(), [all]);
  const inFy = useMemo(() => (fy ? all.filter(j => j.fy === fy) : all), [all, fy]);
  const w = words(qs);
  const list = useMemo(() => { const f = (FILTERS.find(x => x[0] === st) || FILTERS[3])[2]; return inFy.filter(j => f(j) && hit(j.text, w)); }, [inFy, st, w.join(' ')]);   // eslint-disable-line react-hooks/exhaustive-deps
  const sel = list.find(j => j.id === selId) || null;
  const T = list.reduce((t, j) => { ['soValue', 'soTaxable', 'received', 'clientDue', 'poTaxable', 'poValue', 'poPaid', 'poDue', 'expTotal', 'expPaid'].forEach(k => { t[k] = (t[k] || 0) + j[k]; }); return t; }, {});
  const rename = async j => {
    const v = newNo.trim();
    if (!v || v === j.so.orderNo) { setAsk(null); return; }
    setBusy(true);
    try { await axios.put(`/api/sales-orders/${j.so.orderId}`, { ...j.so, orderNo: v }, { params: { companyId } }); setAsk(null); onChanged(`Jobcode ${j.no} renamed to ${v}.`); }
    catch (e) { onChanged(e.response?.data?.error || 'Could not rename.'); } finally { setBusy(false); }
  };
  const printList = () => printDepList({ title: 'JOBCODE LIST', company, user, filter: `${FILTERS.find(f => f[0] === st)?.[1] || 'All'} · FY ${fy || 'all'}`, total: T.soValue || 0,
    heads: ['Jobcode', 'Client', 'Order date', 'Order value', 'Received', 'Client dues', 'Purchase', 'Vendor dues', 'Expenses', 'Status'],
    rows: list.map(j => [j.no, j.client, dmy(j.date), amt(j.soValue), amt(j.received), amt(j.clientDue), amt(j.poValue), amt(j.poDue), amt(j.expTotal), stOf(j.so.status)[0]]) });
  return (
    <>
      {slot && createPortal(<>
        <input className="sb-search" value={qs} onChange={e => setQ(e.target.value)} placeholder="Search jobcode, client, PO, vendor, product…" aria-label="Search jobcodes" style={{ width: 210 }} />
        <select className="sb-search" style={{ width: 96 }} value={fy} onChange={e => setFy(e.target.value)} aria-label="Financial year">
          <option value="">All years</option>{fys.map(f => <option key={f} value={f}>FY {f}</option>)}</select>
        <button type="button" className="sb-tbtn" onClick={printList}><Svg name="file" size={13} />Print list</button>
        <button type="button" className="sb-tbtn" onClick={() => jobcodeExcel(list, fy)} disabled={!list.length}><Svg name="arrow" size={13} />Excel</button>
        <div className="sb-tools">
          <span className="sb-picked">{sel ? <b>{sel.no}</b> : 'Select a jobcode'}</span>
          <button type="button" className="sb-tbtn" disabled={!sel} onClick={() => printJobCost({ job: sel, company, user })}><Svg name="file" size={13} />Cost sheet</button>
          {canEdit && <button type="button" className="sb-tbtn" disabled={!sel} onClick={() => { setNewNo(sel.so.orderNo || ''); setAsk({ j: sel }); }}><Svg name="settings" size={13} />Rename</button>}
        </div>
      </>, slot)}
      {ask && <div className="sb-ask" role="dialog" aria-label="Rename jobcode" style={{ background: '#F0F7F8', borderColor: '#DCE6E8', color: '#03444f' }}>
        <span><b>Jobcode no.</b> for order {ask.j.so.orderId} ({ask.j.client}):</span>
        <input value={newNo} onChange={e => setNewNo(e.target.value)} onKeyDown={e => e.key === 'Enter' && rename(ask.j)} autoFocus style={{ width: 200, height: 28, border: '1px solid #C9D7DA', borderRadius: 4, padding: '0 8px' }} aria-label="New jobcode no." />
        <button type="button" className="sb-abtn" onClick={() => setAsk(null)} disabled={busy}>Cancel</button><button type="button" className="sb-abtn" style={{ background: '#03444f', color: '#fff' }} onClick={() => rename(ask.j)} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button></div>}
      <div className="jc-bar">
        <div className="ac-seg">
          {FILTERS.map(([k, l, f]) => <button key={k} type="button" className={st === k ? 'on' : ''} onClick={() => setSt(k)}>{l}<span>{inFy.filter(f).length}</span></button>)}
        </div>
        <div className="ac-sum">
          <div>Order value<b>₹ {short(T.soValue || 0)}</b></div>
          <div>Received<b style={{ color: '#067647' }}>₹ {short(T.received || 0)}</b></div>
          <div>Client dues<b style={{ color: '#B42318' }}>₹ {short(T.clientDue || 0)}</b></div>
          <div>Purchase<b>₹ {short(T.poValue || 0)}</b></div>
          <div>Vendor dues<b style={{ color: '#B54708' }}>₹ {short(T.poDue || 0)}</b></div>
          <div>Expenses<b>₹ {short(T.expTotal || 0)}</b></div>
        </div>
        <span className="jc-show">Show:{[['so', 'Sales order'], ['po', 'Purchase order'], ['ex', 'Expense']].map(([k, l]) => (
          <label key={k}><input type="checkbox" checked={show[k]} onChange={() => setShow(o => ({ ...o, [k]: !o[k] }))} />{l}</label>))}</span>
      </div>
      <WideTable list={list} loading={jobs === null} selId={selId} setSelId={setSelId} T={T} show={show}
        empty={qs || st !== 'all' || fy ? 'Nothing matches — try “All” or another year.' : 'No jobcode yet — every approved sales order is a jobcode.'} />
    </>
  );
}

function linesOf(j) {
  const so = j.so.items || [];
  const po = j.poList.flatMap(p => { const it = p.po.items || []; return (it.length ? it : [null]).map((x, k) => ({ p, it: x, first: k === 0, span: Math.max(1, it.length) })); });
  const N = Math.max(1, so.length, po.length, j.expList.length);
  return Array.from({ length: N }, (_, i) => ({ so: so[i] || null, po: po[i] || null, ex: j.expList[i] || null, poTail: i >= po.length }));
}
const soAmt = it => n(it.qty || it.quantity) * n(it.rate);
const poAmt = it => { const b = n(it.qty || it.quantity) * n(it.rate), d = it.discountType === '%' ? b * n(it.discount) / 100 : n(it.discount); return b - d; };
const nm = it => it.description || it.itemName || it.name || '';

/* Excel in the same layout — one line per item */

/* Excel in the same layout — one line per item */
export function jobcodeExcel(list, fy) {
  const head = ['Jobcode', 'Client', 'Order date', 'Client PO', 'SO product', 'SO qty', 'SO rate', 'SO amount', 'GST %', 'Order value', 'Received', 'Client dues',
    'Vendor', 'PO no.', 'PO date', 'PO product', 'PO qty', 'PO rate', 'PO amount', 'PO value', 'Paid', 'PO dues',
    'Exp. date', 'Expense', 'Paid to', 'Exp. amount', 'Exp. paid', 'Status'];
  const rows = [];
  list.forEach(j => linesOf(j).forEach((ln, i) => {
    const f = i === 0, p = ln.po;
    rows.push([f ? j.no : '', f ? j.client : '', f ? dmy(j.date) : '', f ? j.so.customerPO || '' : '',
      ln.so ? nm(ln.so) : '', ln.so ? n(ln.so.qty || ln.so.quantity) : '', ln.so ? n(ln.so.rate) : '', ln.so ? r(soAmt(ln.so)) : '', ln.so ? n(ln.so.gst || ln.so.gstPercent) : '',
      f ? r(j.soValue) : '', f ? r(j.received) : '', f ? r(j.clientDue) : '',
      p?.first ? p.p.vendor : '', p?.first ? p.p.no : '', p?.first ? dmy(p.p.date) : '', p?.it ? nm(p.it) : '', p?.it ? n(p.it.qty || p.it.quantity) : '', p?.it ? n(p.it.rate) : '', p?.it ? r(poAmt(p.it)) : '',
      p?.first ? r(p.p.total) : '', p?.first ? r(p.p.paid) : '', p?.first ? r(p.p.due) : '',
      ln.ex ? dmy(ln.ex.date) : '', ln.ex ? [ln.ex.category, ln.ex.desc].filter(Boolean).join(' — ') : '', ln.ex ? ln.ex.party : '', ln.ex ? r(ln.ex.total) : '', ln.ex ? r(ln.ex.paid) : '',
      f ? stOf(j.so.status)[0] : '']);
  }));
  const ws = XLSX.utils.aoa_to_sheet([head, ...rows]);
  ws['!cols'] = head.map(h => ({ wch: /product|Client$|Vendor|Expense$|Paid to/.test(h) ? 28 : 13 }));
  ws['!freeze'] = { xSplit: 2, ySplit: 1 };
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Jobcodes');
  XLSX.writeFile(wb, `Jobcodes_${fy || 'all'}_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

function WideTable({ list, loading, selId, setSelId, T, show, empty }) {
  const all = 2 + (show.so ? 10 : 0) + (show.po ? 10 : 0) + (show.ex ? 5 : 0) + 1;
  const blanks = (cnt, rs, text) => Array.from({ length: cnt }, (_, i) => <td key={i} rowSpan={rs} className={i ? 'nil' : 'nil s1'}>{i ? '' : text}</td>);
  const money = (v, c, extra = {}) => <td className="r top" {...extra} style={{ color: v > 0.5 ? c : '#98A2B3', fontWeight: v > 0.5 ? 600 : 400 }}>{amt(v)}</td>;
  return (
    <div className="sb-list" style={{ overflowX: 'auto' }}>
      <table className="jw">
        <thead>
          <tr>
            <th colSpan={show.so ? 12 : 2} className="g so">Sales order</th>
            {show.po && <th colSpan={10} className="g po s1">Purchase order</th>}
            {show.ex && <th colSpan={5} className="g ex s1">Expense</th>}
            <th rowSpan={2} className="g st s1">Status</th>
          </tr>
          <tr>
            <th className="k1">Order ID</th><th className="k2">Client name</th>
            {show.so && <><th className="so">Order date</th><th className="so">Client PO</th><th className="so">Product</th><th className="so r">Qty</th><th className="so r">Rate</th><th className="so r">Amount</th><th className="so r">GST</th><th className="so r">Order value</th><th className="so r">Received</th><th className="so r">Dues</th></>}
            {show.po && <><th className="po s1">Vendor</th><th className="po">PO no.</th><th className="po">PO date</th><th className="po">Product</th><th className="po r">Qty</th><th className="po r">Rate</th><th className="po r">Amount</th><th className="po r">PO value</th><th className="po r">Paid</th><th className="po r">Dues</th></>}
            {show.ex && <><th className="ex s1">Date</th><th className="ex">Expense</th><th className="ex">Paid to</th><th className="ex r">Amount</th><th className="ex r">Paid</th></>}
          </tr>
        </thead>
        {loading ? <tbody><tr><td colSpan={all} className="sb-empty">Loading…</td></tr></tbody>
          : !list.length ? <tbody><tr><td colSpan={all} className="sb-empty">{empty}</td></tr></tbody>
            : list.map(j => { const lines = linesOf(j), N = lines.length, [l, bg, fg] = stOf(j.so.status); return (
              <tbody key={j.id} className={selId === j.id ? 'sel' : ''} onClick={() => setSelId(j.id)}>
                {lines.map((ln, k) => (
                  <tr key={k}>
                    {k === 0 && <><td rowSpan={N} className="k1 top"><span className="mono">{j.no}</span></td><td rowSpan={N} className="k2 b top" title={j.client}>{j.client}</td></>}
                    {show.so && <>
                      {k === 0 && <><td rowSpan={N} className="top">{dmy(j.date)}</td><td rowSpan={N} className="top tx" style={{ maxWidth: 170 }} title={j.so.customerPO || ''}>{j.so.customerPO || '—'}</td></>}
                      {ln.so ? <><td className="tx" title={nm(ln.so)}>{nm(ln.so)}</td><td className="r">{n(ln.so.qty || ln.so.quantity)} {ln.so.unit || ''}</td><td className="r">{amt(ln.so.rate)}</td><td className="r">{amt(soAmt(ln.so))}</td><td className="r">{n(ln.so.gst || ln.so.gstPercent)}%</td></> : <><td /><td /><td /><td /><td /></>}
                      {k === 0 && <><td rowSpan={N} className="r top"><b>{amt(j.soValue)}</b></td>{money(j.received, '#067647', { rowSpan: N })}{money(j.clientDue, '#B42318', { rowSpan: N })}</>}
                    </>}
                    {show.po && (ln.poTail
                      ? (k === 0 || lines[k - 1].poTail === false ? blanks(10, N - k, j.poList.length ? '' : 'No PO linked') : null)
                      : <>
                        {ln.po.first && <><td rowSpan={ln.po.span} className="s1 tx b top" style={{ maxWidth: 200 }} title={ln.po.p.vendor}>{ln.po.p.vendor}</td><td rowSpan={ln.po.span} className="top">{ln.po.p.no}</td><td rowSpan={ln.po.span} className="top">{dmy(ln.po.p.date)}</td></>}
                        {ln.po.it ? <><td className="tx" title={nm(ln.po.it)}>{nm(ln.po.it)}</td><td className="r">{n(ln.po.it.qty || ln.po.it.quantity)} {ln.po.it.unit || ''}</td><td className="r">{amt(ln.po.it.rate)}</td><td className="r">{amt(poAmt(ln.po.it))}</td></> : <><td /><td /><td /><td /></>}
                        {ln.po.first && <><td rowSpan={ln.po.span} className="r top"><b>{amt(ln.po.p.total)}</b></td>{money(ln.po.p.paid, '#067647', { rowSpan: ln.po.span })}{money(ln.po.p.due, '#B54708', { rowSpan: ln.po.span })}</>}
                      </>)}
                    {show.ex && (ln.ex
                      ? <><td className="s1">{dmy(ln.ex.date)}</td><td className="tx" title={[ln.ex.category, ln.ex.desc].filter(Boolean).join(' — ')}>{[ln.ex.category, ln.ex.desc].filter(Boolean).join(' — ')}</td><td className="tx" style={{ maxWidth: 180 }} title={ln.ex.party || ''}>{ln.ex.party || '—'}</td><td className="r">{amt(ln.ex.total)}</td><td className="r" style={{ color: ln.ex.paid < ln.ex.total - 0.5 ? '#B42318' : '#067647' }}>{amt(ln.ex.paid)}</td></>
                      : (k === j.expList.length ? blanks(5, N - k, j.expList.length ? '' : 'No expense') : null))}
                    {k === 0 && <td rowSpan={N} className="s1 top"><span className="ac-pill" style={{ background: bg, color: fg }}>{l}</span></td>}
                  </tr>))}
              </tbody>); })}
        {list.length > 1 && <tfoot><tr>
          <td className="k1">Total</td><td className="k2">{list.length} jobcodes</td>
          {show.so && <><td /><td /><td /><td /><td /><td className="r">{amt(T.soTaxable)}</td><td /><td className="r">{amt(T.soValue)}</td><td className="r">{amt(T.received)}</td><td className="r">{amt(T.clientDue)}</td></>}
          {show.po && <><td className="s1" /><td /><td /><td /><td /><td /><td className="r">{amt(T.poTaxable)}</td><td className="r">{amt(T.poValue)}</td><td className="r">{amt(T.poPaid)}</td><td className="r">{amt(T.poDue)}</td></>}
          {show.ex && <><td className="s1" /><td /><td /><td className="r">{amt(T.expTotal)}</td><td className="r">{amt(T.expPaid)}</td></>}
          <td className="s1" />
        </tr></tfoot>}
      </table>
    </div>
  );
}
