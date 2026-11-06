/* Purchase Order → PO (beta): Create PO | PO List | Order Pending | Approval Pending | Reject.
 * Order Pending = sales orders that have no purchase order yet (a rejected PO does not count).
 * Approval Pending = POs sent for approval — approve or reject them here. */
import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Svg } from '../../components/ui/Icon';
import { useCompany } from '../../context/CompanyContext';
import { useAuth } from '../../context/AuthContext';
import { can } from '../../utils/permissions';
import { CSS as SALES_CSS, BIG, fyOf, FyFilter, fyCounts, useClearSel } from './BetaSales';
import { n, num, money, fdate, dash } from './BetaSalesBill';
import POForm, { poQtyOf, onSoLine, soItemName, soLines } from './BetaPOForm';
import { printPO } from './BetaPOPrint';

const TABS = [
  { key: 'create',   label: 'Create PO' },
  { key: 'list',     label: 'PO List' },
  { key: 'orders',   label: 'Order Pending' },
  { key: 'approval', label: 'Approval Pending' },
  { key: 'rejected', label: 'Reject' },
];
const SKIP_SO = ['cancelled', 'draft', 'rejected', 'closed'];
const ST = {
  draft:    ['D', '#667085', 'Draft'],
  pending:  ['P', '#F79009', 'Approval pending'],
  approved: ['A', '#16A34A', 'Approved'],
  rejected: ['R', '#D92D20', 'Rejected'],
};
const stOf = s => ST[s] || ST.draft;

const PO_LIST_CSS = `
/* thin black lines between columns; headings centred and wrapped */
.sb-t.pl th { white-space:normal; overflow:visible; text-overflow:clip; line-height:1.2; text-align:center; vertical-align:middle; border-right:1px solid #A9CDD2; }
.sb-t.pl td { border-right:1px solid #000; }
.sb-t.pl th:last-child { border-right:none; }
.sb-t.pl td.r { text-align:right; }
.sb-tbtn.ok { color:#067647; border-color:#067647; } .sb-tbtn.ok:hover:not(:disabled) { background:#067647; color:#fff; }
.sb-ask.ok { background:#ECFDF3; border-color:#ABEFC6; color:#054F31; }
.sb-ask input { height:28px; width:280px; padding:0 8px; border:1px solid #FECDCA; border-radius:2px; font:inherit; }
.po-items { color:#344054; }
.sb-t.pl td.bno { font-family:inherit; font-size:11.5px; letter-spacing:0; }
/* Order Pending: products of an order, each with the POs made for it */
.sb-t.op td { vertical-align:top; }
.sb-t.op td:first-child { padding-left:5px; }   /* PO lines under a product start at the vendor column */
.sb-t.op td.r { text-align:right; }
.sb-t.op td.ck { text-align:center; padding-left:4px; padding-right:4px; }
.sb-t.op td.ck input { width:15px; height:15px; margin:2px 0 0; accent-color:#03444f; cursor:pointer; }
.sb-t.op .blank { background:#FFFBF5 !important; }
.sb-t.op .dueq { display:block; margin-top:2px; font-size:10.5px; font-weight:700; color:#B42318; }
.sb-t.op .okq { display:block; margin-top:2px; font-size:10.5px; font-weight:700; color:#067647; }
.sb-t.op tbody.og.pick td { background:#E8F3F4; }
.sb-t.op tr.chosen td.pr { font-weight:700; color:#03444f; }
.po-ao { display:inline-block; margin-left:6px; padding:0 5px; border:1px solid #F79009; border-radius:3px; color:#B54708; font-size:9.5px; font-weight:700; line-height:15px; text-transform:uppercase; vertical-align:1px; }
.po-items .mut { color:#98A2B3; }
`;

export default function BetaPO() {
  const navigate = useNavigate();
  const { search } = useLocation();
  const asked = new URLSearchParams(search).get('tab');
  const urlTab = TABS.some(t => t.key === asked) ? asked : 'create';
  const { selectedCompany } = useCompany() || {};
  const companyId = selectedCompany?.companyId;
  const { user } = useAuth() || {};

  const [pos, setPos] = useState(null);
  const [orders, setOrders] = useState(null);
  const [vendors, setVendors] = useState(null);
  const [reload, setReload] = useState(0);
  const [editing, setEditing] = useState(null);
  const [createFor, setCreateFor] = useState(null);   // { orderId, k }
  const [formKey, setFormKey] = useState(1);
  const [note, setNote] = useState(null);
  const [slot, setSlot] = useState(null);

  useEffect(() => {
    if (!companyId) return;
    const p = { params: { companyId } };
    axios.get('/api/purchase-orders', p).then(r => setPos(Array.isArray(r.data) ? r.data : [])).catch(() => setPos([]));
    axios.get('/api/sales-orders', p).then(r => setOrders(Array.isArray(r.data) ? r.data : [])).catch(() => setOrders([]));
    axios.get('/api/vendors', p).then(r => setVendors(Array.isArray(r.data) ? r.data : [])).catch(() => setVendors([]));
  }, [companyId, reload]);

  const soMap = useMemo(() => { const m = {}; (orders || []).forEach(o => { m[String(o.orderId)] = o; }); return m; }, [orders]);
  const posByOrder = useMemo(() => {
    const m = {};
    (pos || []).forEach(p => { if (p.linkedSalesOrderId && p.status !== 'rejected') (m[String(p.linkedSalesOrderId)] = m[String(p.linkedSalesOrderId)] || []).push(p); });
    return m;
  }, [pos]);
  const groups = useMemo(() => {
    const all = [...(pos || [])].sort((a, b) => String(b.poDate || '').localeCompare(String(a.poDate || '')) || Number(b.orderId) - Number(a.orderId));
    return { list: all.filter(p => p.status !== 'rejected'), approval: all.filter(p => p.status === 'pending'), rejected: all.filter(p => p.status === 'rejected') };
  }, [pos]);
  /* every order with its products: SO qty, what is on POs (vendor, PO no., qty, rate …) and what is still due */
  const orderRows = useMemo(() => (orders || []).filter(o => !SKIP_SO.includes(o.status)).map(o => {
    const done = poQtyOf(o, pos, null);
    const mine = posByOrder[String(o.orderId)] || [];
    const items = soLines(o).map((it, i) => ({ it, i, done: done[i], due: Math.max(0, n(it.qty) - done[i]),
      lines: mine.flatMap(p => (p.items || []).filter(pl => onSoLine(pl, it, i)).map(pl => ({ p, pl }))) })).filter(x => soItemName(x.it));
    return { o, items, due: items.reduce((a, x) => a + x.due, 0) };
  }).sort((a, b) => String(b.o.orderDate || '').localeCompare(String(a.o.orderDate || ''))), [orders, pos, posByOrder]);
  const pendingOrders = useMemo(() => orderRows.filter(r => r.due > 0), [orderRows]);

  const loading = pos === null || orders === null || vendors === null;
  const tab = editing ? 'create' : urlTab;
  const go = k => { setEditing(null); navigate(`/beta/po?tab=${k}`); };
  const canApprove = can(user, 'purchaseOrder', 'approve');

  /* approve / reject: only the status changes, everything else on the PO stays */
  const setStatus = async (p, status) => {
    await axios.put(`/api/purchase-orders/${p.orderId}`, { companyId, status }, { params: { companyId } });
    setReload(x => x + 1);
  };

  return (
    <div className="sb">
      <style>{SALES_CSS + PO_LIST_CSS}</style>
      <div className="sb-tabs" role="tablist">
        {TABS.map(t => (
          <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} className={`sb-tab${tab === t.key ? ' on' : ''}`} onClick={() => go(t.key)}>
            {t.label}
            {!loading && t.key === 'list' && <span className="n">{groups.list.length}</span>}
            {!loading && t.key === 'orders' && <span className="n">{pendingOrders.length}</span>}
            {!loading && t.key === 'approval' && <span className="n" style={groups.approval.length && tab !== 'approval' ? { background: '#F79009', color: '#fff' } : undefined}>{groups.approval.length}</span>}
            {!loading && t.key === 'rejected' && <span className="n">{groups.rejected.length}</span>}
          </button>
        ))}
        <div className="sb-slot" ref={setSlot} />
      </div>
      {note && <div className="sb-note" role="status">{note}<button type="button" onClick={() => setNote(null)} aria-label="Dismiss">×</button></div>}

      {tab === 'create' && (
        <div className="sb-body" style={{ display: 'flex', flexDirection: 'column' }}>
          {loading ? <div className="sb-empty">Loading vendors, orders and POs…</div>
            : editing
              ? <POForm key={`edit-${editing.orderId}`} companyId={companyId} company={selectedCompany} vendors={vendors} orders={orders} pos={pos} editPo={editing}
                onClose={() => { setEditing(null); navigate('/beta/po?tab=list'); }}
                onSaved={(p, text) => { setEditing(null); setReload(x => x + 1); setNote(text); navigate('/beta/po?tab=list'); }} />
              : <POForm key={createFor ? `for-${createFor.orderId}-${createFor.k}` : `new-${formKey}`} companyId={companyId} company={selectedCompany} vendors={vendors} orders={orders} pos={pos}
                presetOrderId={createFor?.orderId} presetItems={createFor?.items}
                onClose={() => { setCreateFor(null); setFormKey(k => k + 1); }}
                onSaved={(p, text) => { setCreateFor(null); setFormKey(k => k + 1); setReload(x => x + 1); setNote(text); }} />}
        </div>
      )}
      {(tab === 'list' || tab === 'approval' || tab === 'rejected') && (
        <POList key={tab} kind={tab} list={groups[tab]} loading={loading} soMap={soMap} slot={slot} companyId={companyId} canApprove={canApprove}
          onPrint={async p => {
            setNote(`Preparing the print of PO ${p.poNo || p.orderId}…`);
            const r = await printPO({ po: p, company: selectedCompany, companyId, order: soMap[String(p.linkedSalesOrderId)], user });
            setNote(r?.error ? r.error : r?.notPrinted?.length ? `PO ${p.poNo || p.orderId} printed with its files. Not printed (open them separately): ${r.notPrinted.join(', ')}.` : r?.files ? `PO ${p.poNo || p.orderId} printed with its ${r.files} spec / attachment file(s).` : null);
          }}
          onEdit={p => { setNote(null); setEditing(p); }} setNote={setNote}
          onStatus={async (p, s) => {
            try { await setStatus(p, s); setNote(`PO ${p.poNo || p.orderId} ${s === 'approved' ? 'approved' : s === 'rejected' ? 'rejected' : 'updated'}.`); return true; }
            catch (e) { setNote(e.response?.data?.error || 'Could not change the PO status.'); return false; }
          }}
          onDeleted={p => { setReload(x => x + 1); setNote(`Deleted PO ${p.poNo || p.orderId} (${p.vendorName || '—'}).`); }} />
      )}
      {tab === 'orders' && (
        <OrderPending rows={orderRows} loading={loading} slot={slot}
          onPo={(o, items) => { setNote(null); setCreateFor({ orderId: o.orderId, items, k: Date.now() }); navigate('/beta/po?tab=create'); }} />
      )}
    </div>
  );
}

/* ── PO List / Approval Pending / Reject ── */
/* one line per PO item (like Order Pending); PO columns span its items */
const PCOLS = [['Order No. / File No.', '8.2%'], ['Client', '10%'], ['Vendor', '10.5%'], ['PO Date', '6.2%'], ['PO No.', '8.6%'], ['Product', '13.5%'],
  ['Order Qty', '5%', 'c'], ['PO Qty', '4.6%', 'c'], ['Rate', '6.2%', 'r'], ['Taxable', '7%', 'r'], ['GST', '6%', 'r'], ['Amount', '7%', 'r'], ['Delivery', '6.2%'], ['St.', '3%', 'c']];
/* taxable / GST / total of one PO line */
const lineVal = pl => {
  const gross = n(pl.qty) * n(pl.rate), taxable = gross - gross * Math.min(100, n(pl.discount)) / 100, gst = taxable * n(pl.gstPercent ?? pl.gst) / 100;
  return { taxable, gst, total: taxable + gst };
};

function POList({ kind, list, loading, soMap, slot, companyId, canApprove, onEdit, onStatus, onDeleted, setNote, onPrint }) {
  const [fySel, setFySel] = useState(() => (kind === 'list' ? [fyOf(new Date())] : []));   // current FY by default on the PO list
  const [q, setQ] = useState('');
  const [selId, setSelId] = useState(null);
  const [ask, setAsk] = useState(null);   // { kind: 'delete' | 'reject' | 'approve', p }
  const [busy, setBusy] = useState(false);
  useClearSel(ask ? null : selId, setSelId, '.sb-t tbody.og, .sb-tools, .sb-ask');
  const all = useMemo(() => list || [], [list]);
  const fyList = useMemo(() => fyCounts(all, p => p.poDate), [all]);
  const shown = useMemo(() => {
    const w = q.toLowerCase().split(/\s+/).filter(Boolean);
    return all.filter(p => (!fySel.length || fySel.includes(fyOf(p.poDate)))
      && (!w.length || w.every(x => `${p.poNo || ''} ${p.orderId} ${p.vendorName || ''} ${p.vendorGstin || ''} ${soMap[String(p.linkedSalesOrderId)]?.orderNo || ''} ${soMap[String(p.linkedSalesOrderId)]?.customerName || ''} ${(p.items || []).map(i => i.itemName).join(' ')}`.toLowerCase().includes(x))));
  }, [all, fySel, q, soMap]);
  const sel = shown.find(p => String(p.orderId) === String(selId)) || null;
  const sum = k => shown.reduce((s, p) => s + n(p[k]), 0);

  const doDelete = async p => {
    setBusy(true);
    try { await axios.delete(`/api/purchase-orders/${p.orderId}`, { params: { companyId } }); setAsk(null); setSelId(null); onDeleted(p); }
    catch (e) { setNote(e.response?.data?.error || 'Could not delete the PO.'); }
    finally { setBusy(false); }
  };
  const doStatus = async (p, s) => { setBusy(true); const ok = await onStatus(p, s); setBusy(false); if (ok) { setAsk(null); setSelId(null); } };

  return (
    <>
      {slot && createPortal(<>
        <FyFilter list={fyList} total={all.length} sel={fySel} setSel={setFySel} />
        <input className="sb-search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search PO no., vendor, order, client, item…" aria-label="Search POs" />
        <div className="sb-tools">
          <span className="sb-picked">{sel ? <>Selected: <b>{sel.poNo || sel.orderId}</b></> : 'Click a PO to select'}</span>
          {kind === 'approval' && <>
            <button type="button" className="sb-tbtn ok" disabled={!sel || !canApprove || busy} title={canApprove ? 'Approve this PO' : 'You do not have the right to approve POs'} onClick={() => setAsk({ kind: 'approve', p: sel })}><Svg name="check" size={13} />Approve</button>
            <button type="button" className="sb-tbtn del" disabled={!sel || !canApprove || busy} title={canApprove ? 'Reject this PO' : 'You do not have the right to approve POs'} onClick={() => setAsk({ kind: 'reject', p: sel })}><Svg name="x" size={13} />Reject</button>
          </>}
          <button type="button" className="sb-tbtn" disabled={!sel} onClick={() => onPrint(sel)}><Svg name="file" size={13} />Print</button>
          <button type="button" className="sb-tbtn" disabled={!sel} onClick={() => onEdit(sel)}><Svg name="settings" size={13} />Edit</button>
          <button type="button" className="sb-tbtn del" disabled={!sel || busy} onClick={() => setAsk({ kind: 'delete', p: sel })}><Svg name="x" size={13} />Delete</button>
        </div>
      </>, slot)}
      {ask && (
        <div className={`sb-ask${ask.kind === 'approve' ? ' ok' : ''}`} role="alertdialog" aria-label="Confirm">
          <span>{ask.kind === 'delete' ? <><b>Delete PO {ask.p.poNo || ask.p.orderId}</b> ({ask.p.vendorName || '—'}, ₹ {money(ask.p.grandTotal)})? This cannot be undone.</>
            : ask.kind === 'approve' ? <><b>Approve PO {ask.p.poNo || ask.p.orderId}</b> — {ask.p.vendorName || '—'}, ₹ {money(ask.p.grandTotal)}?</>
              : <><b>Reject PO {ask.p.poNo || ask.p.orderId}</b> — {ask.p.vendorName || '—'}? It moves to Reject; it can be edited and sent again.</>}</span>
          <button type="button" className="sb-abtn" onClick={() => setAsk(null)} disabled={busy}>Cancel</button>
          {ask.kind === 'delete' && <button type="button" className="sb-abtn danger" onClick={() => doDelete(ask.p)} disabled={busy}>{busy ? 'Deleting…' : 'Yes, delete'}</button>}
          {ask.kind === 'approve' && <button type="button" className="sb-abtn" style={{ background: '#067647', borderColor: '#067647', color: '#fff' }} onClick={() => doStatus(ask.p, 'approved')} disabled={busy}>{busy ? 'Approving…' : 'Yes, approve'}</button>}
          {ask.kind === 'reject' && <button type="button" className="sb-abtn danger" onClick={() => doStatus(ask.p, 'rejected')} disabled={busy}>{busy ? 'Rejecting…' : 'Yes, reject'}</button>}
        </div>
      )}
      <div className="sb-kpi">
        <div className="sb-k"><small>POs</small><b>{shown.length}</b></div>
        <div className="sb-k"><small>Taxable</small><b>₹ {BIG.format(sum('subTotal'))}</b></div>
        <div className="sb-k"><small>GST</small><b>₹ {BIG.format(sum('totalGST'))}</b></div>
        <div className="sb-k ok"><small>PO Amount</small><b>₹ {BIG.format(sum('grandTotal'))}</b></div>
      </div>
      <div className="sb-list">
        <table className="sb-t pl op">
          <colgroup>{PCOLS.map(([h, w]) => <col key={h} style={{ width: w }} />)}</colgroup>
          <thead><tr>{PCOLS.map(([h]) => <th key={h}>{h}</th>)}</tr></thead>
          {loading ? <tbody><tr><td colSpan={PCOLS.length} className="sb-empty">Loading…</td></tr></tbody>
            : !shown.length ? <tbody><tr><td colSpan={PCOLS.length} className="sb-empty">{q ? `No PO matches “${q}”.` : kind === 'approval' ? 'No PO is waiting for approval.' : kind === 'rejected' ? 'No rejected PO.' : 'No purchase orders.'}</td></tr></tbody>
              : shown.map(p => {
                const so = soMap[String(p.linkedSalesOrderId)];
                const st = stOf(p.status);
                const id = String(p.orderId);
                const items = (p.items || []).filter(i => i && (i.itemName || i.description));
                const rowsOf = items.length ? items : [null];
                const span = rowsOf.length;
                /* the order line of this product (its SO qty) */
                const soQty = pl => { const it = so && soLines(so).find((x, i) => onSoLine(pl, x, i)); return it ? `${num(n(it.qty))} ${it.unit || ''}` : null; };
                return (
                  <tbody key={id} className={`og${selId === id ? ' sel' : ''}`} onClick={() => setSelId(id)} onDoubleClick={() => { setSelId(id); onEdit(p); }}
                    title="Click to select · double-click to edit" aria-selected={selId === id}>
                    {rowsOf.map((pl, i) => {
                      const v = pl ? lineVal(pl) : null, oq = pl ? soQty(pl) : null;
                      return (
                        <tr key={i}>
                          {i === 0 && <>
                            <td rowSpan={span} className="no">{so ? so.orderNo : p.linkedSalesOrderId ? <span className="mut">{p.linkedSalesOrderId}</span> : <span className="mut">—</span>}</td>
                            <td rowSpan={span}>{dash(so?.customerName)}</td>
                            <td rowSpan={span} className="cl">{dash(p.vendorName)}</td>
                            <td rowSpan={span} className="nw">{fdate(p.poDate)}</td>
                            <td rowSpan={span} className="bno">{p.poNo || p.poNumber || p.orderId}</td>
                          </>}
                          {pl ? <>
                            <td>{pl.itemName || pl.description}</td>
                            <td className="c">{oq || <span className="mut">—</span>}</td>
                            <td className="c">{num(n(pl.qty))} {pl.unit || ''}</td>
                            <td className="r">{money(pl.rate)}</td>
                            <td className="r">{money(v.taxable)}</td>
                            <td className="r">{money(v.gst)}</td>
                            <td className="r"><b>{money(v.total)}</b></td>
                          </> : <td colSpan={7} className="mut">No items</td>}
                          {i === 0 && <>
                            <td rowSpan={span} className="nw">{p.deliveryDate ? fdate(p.deliveryDate) : <span className="mut">—</span>}</td>
                            <td rowSpan={span} className="c"><span className="sb-dot" style={{ background: st[1] }} title={st[2]}>{st[0]}</span></td>
                          </>}
                        </tr>
                      );
                    })}
                  </tbody>
                );
              })}
          {!loading && shown.length > 0 && <tfoot><tr>
            <td colSpan={9}>Total ({shown.length} POs — PO amounts incl. freight / round off)</td><td className="r">{money(sum('subTotal'))}</td><td className="r">{money(sum('totalGST'))}</td><td className="r">{money(sum('grandTotal'))}</td><td colSpan={2} />
          </tr></tfoot>}
        </table>
      </div>
    </>
  );
}

/* ── Order Pending: each order's products — SO qty, the POs made for it (vendor, PO no., qty, rate, value),
   blank where no PO is made yet. Tick products of one order → Create PO. ── */
const OCOLS = [['', '2.6%'], ['Order ID', '8.4%'], ['Client', '11.5%'], ['Product', '15.5%'], ['SO Qty', '5%', 'c'], ['Vendor', '11%'], ['PO No.', '9.4%'], ['PO Date', '6.6%'],
  ['Qty', '4.4%', 'c'], ['Rate', '6%', 'r'], ['Taxable', '6.8%', 'r'], ['GST', '5.8%', 'r'], ['PO Value', '7%', 'r']];

function OrderPending({ rows, loading, slot, onPo }) {
  const [fySel, setFySel] = useState(() => [fyOf(new Date())]);
  const [q, setQ] = useState('');
  const [onlyDue, setOnlyDue] = useState(false);   // only orders that still have qty without a PO (all are shown by default)
  const [pick, setPick] = useState(null);          // { orderId, items: [item positions] }
  useClearSel(pick, setPick, '.sb-t tbody.og, .sb-tools');
  const base = useMemo(() => rows.filter(r => !onlyDue || r.due > 0), [rows, onlyDue]);
  const fyList = useMemo(() => fyCounts(base, r => r.o.orderDate), [base]);
  const shown = useMemo(() => {
    const w = q.toLowerCase().split(/\s+/).filter(Boolean);
    return base.filter(r => (!fySel.length || fySel.includes(fyOf(r.o.orderDate)))
      && (!w.length || w.every(x => `${r.o.orderNo} ${r.o.customerName || ''} ${r.o.customerPO || ''} ${r.items.map(i => soItemName(i.it) + ' ' + i.lines.map(l => `${l.p.vendorName} ${l.p.poNo}`).join(' ')).join(' ')}`.toLowerCase().includes(x))));
  }, [base, fySel, q]);
  const picked = pick ? rows.find(r => String(r.o.orderId) === String(pick.orderId)) : null;
  const toggle = (r, i) => setPick(p => {
    if (!p || String(p.orderId) !== String(r.o.orderId)) return { orderId: r.o.orderId, items: [i] };   // another order: start again
    const items = p.items.includes(i) ? p.items.filter(x => x !== i) : [...p.items, i];
    return items.length ? { ...p, items } : null;
  });
  const products = shown.reduce((s2, r) => s2 + r.items.filter(i => i.due > 0).length, 0);

  return (
    <>
      {slot && createPortal(<>
        <FyFilter list={fyList} total={base.length} sel={fySel} setSel={setFySel} />
        <input className="sb-search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search order, client, product, vendor, PO…" aria-label="Search orders" />
        <label className={`sb-chk${onlyDue ? ' on' : ''}`}><input type="checkbox" checked={onlyDue} onChange={e => setOnlyDue(e.target.checked)} />Only pending</label>
        <div className="sb-tools">
          <span className="sb-picked">{picked ? <>Selected: <b>{picked.o.orderNo}</b> · {pick.items.length} product(s)</> : 'Tick products, or double-click an order'}</span>
          <button type="button" className="sb-tbtn" disabled={!picked} onClick={() => onPo(picked.o, pick.items)}><Svg name="cart" size={13} />Create PO</button>
        </div>
      </>, slot)}
      <div className="sb-kpi" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
        <div className="sb-k due"><small>Orders with qty left for PO</small><b>{shown.filter(r => r.due > 0).length}</b></div>
        <div className="sb-k due"><small>Products left for PO</small><b>{products}</b></div>
      </div>
      <div className="sb-list">
        <table className="sb-t pl op">
          <colgroup>{OCOLS.map(([h, w], i) => <col key={i} style={{ width: w }} />)}</colgroup>
          <thead><tr>{OCOLS.map(([h], i) => <th key={i}>{h}</th>)}</tr></thead>
          {loading ? <tbody><tr><td colSpan={OCOLS.length} className="sb-empty">Loading…</td></tr></tbody>
            : !shown.length ? <tbody><tr><td colSpan={OCOLS.length} className="sb-empty">{q ? `No order matches “${q}”.` : 'Every product of every order is on a purchase order.'}</td></tr></tbody>
              : shown.map(r => {
                const id = String(r.o.orderId);
                const mine = pick && String(pick.orderId) === id;
                const span = r.items.reduce((s2, x) => s2 + Math.max(1, x.lines.length), 0) || 1;
                let first = true;
                return (
                  <tbody key={id} className={`og${mine ? ' pick' : ''}`} onDoubleClick={() => onPo(r.o, mine ? pick.items : null)} title="Tick products and press Create PO · double-click to make the PO for this order">
                    {(r.items.length ? r.items : [null]).map((x, xi) => {
                      if (!x) return <tr key="none"><td /><td className="no">{r.o.orderNo}</td><td className="cl">{r.o.customerName || '—'}</td><td colSpan={10} className="mut">No products</td></tr>;
                      const sub = x.lines.length ? x.lines : [null];
                      const chosen = mine && pick.items.includes(x.i);
                      return sub.map((l, li) => {
                        const head = first; first = false;
                        const v = l ? lineVal(l.pl) : null;
                        return (
                          <tr key={`${xi}-${li}`} className={chosen ? 'chosen' : ''}>
                            {li === 0 && <td rowSpan={sub.length} className="ck" onClick={e => e.stopPropagation()} onDoubleClick={e => e.stopPropagation()}>
                              <input type="checkbox" checked={!!chosen} onChange={() => toggle(r, x.i)} aria-label={`Take ${soItemName(x.it)} of ${r.o.orderNo}`} /></td>}
                            {head && <>
                              <td rowSpan={span} className="no">{r.o.orderNo || r.o.orderId}<small style={{ display: 'block', fontWeight: 500, color: '#667085' }}>{fdate(r.o.orderDate)}</small></td>
                              <td rowSpan={span} className="cl">{r.o.customerName || r.o.party || '—'}</td>
                            </>}
                            {li === 0 && <>
                              <td rowSpan={sub.length} className="pr">{soItemName(x.it)}{x.it.addon ? <span className="po-ao">Add-on</span> : null}</td>
                              <td rowSpan={sub.length} className="c">{num(n(x.it.qty))} {x.it.unit || ''}
                                {x.due > 0 ? <span className="dueq">Due {num(x.due)}</span> : <span className="okq">✓ on PO</span>}</td>
                            </>}
                            {l ? <>
                              <td className="cl">{l.p.vendorName || '—'}</td>
                              <td className="bno">{l.p.poNo || l.p.poNumber || l.p.orderId}</td>
                              <td className="nw">{fdate(l.p.poDate)}</td>
                              <td className="c">{num(n(l.pl.qty))}</td>
                              <td className="r">{money(l.pl.rate)}</td>
                              <td className="r">{money(v.taxable)}</td>
                              <td className="r">{money(v.gst)}</td>
                              <td className="r"><b>{money(v.total)}</b></td>
                            </> : <>
                              <td className="blank" /><td className="blank" /><td className="blank" /><td className="blank" /><td className="blank" /><td className="blank" /><td className="blank" /><td className="blank" />
                            </>}
                          </tr>
                        );
                      });
                    })}
                  </tbody>
                );
              })}
        </table>
      </div>
    </>
  );
}
