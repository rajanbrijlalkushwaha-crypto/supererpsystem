/* Beta — Sales: Create Sales Bill | Sales Bill | Sales Bill Pending. The tab is kept in the URL (?tab=…).
 *   Create Sales Bill  — bill against a sales order (BetaSalesBill form, PDF auto-fill)
 *   Sales Bill         — every sales bill made; double-click to edit
 *   Sales Bill Pending — each order: ordered / billed / pending qty, order value, billed, left to bill and
 *                        how many bills; fully billed orders hidden unless ticked. Double-click → bill it. */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useCompany } from '../../context/CompanyContext';
import { useAuth } from '../../context/AuthContext';
import { Svg } from '../../components/ui/Icon';
import { printSalesBill } from './BetaSalesPrint';
import { printDC, dcsOfBill, printMerged } from './BetaDCPrint';
import SalesBillForm, { SB_FORM_CSS, billingOf, n, num, money, fdate, dash, attachUrl } from './BetaSalesBill';

const TEAL = '#03444f';
const F = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
const TABS = [{ key: 'create', label: 'Create Sales Bill' }, { key: 'list', label: 'Sales Bill' }, { key: 'pending', label: 'Sales Bill Pending' }];
export const BIG = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
export const fyOf = d => { const x = d ? new Date(d) : null; if (!x || isNaN(x)) return ''; return String(x.getMonth() >= 3 ? x.getFullYear() : x.getFullYear() - 1); };
export const fyLabel = k => `FY ${String(k).slice(2)}-${String(+k + 1).slice(2)}`;
const STATE = { none: ['N', '#D92D20', 'Not billed yet'], part: ['P', '#F79009', 'Part billed'], full: ['B', '#16A34A', 'Fully billed'] };
const SKIP = ['cancelled', 'draft', 'rejected'];

const PCOLS = [['Order No.', '8.4%'], ['Order Date', '6%'], ['Client', '12.5%'], ['Client PO', '9%'], ['Product', '17%'], ['Order Qty', '5.6%', 'r'], ['Billed Qty', '5.6%', 'r'],
  ['Pending Qty', '6%', 'r'], ['Order Value', '7.4%', 'r'], ['Billed Amt', '7.4%', 'r'], ['To Bill', '7.4%', 'r'], ['Bills', '4.2%', 'c'], ['Status', '3.5%', 'c']];
const BCOLS = [['Bill Date', '6.4%'], ['Bill No.', '10.6%'], ['Client', '14%'], ['Order No.', '8.6%'], ['Client PO', '9%'], ['Products', '15.4%'], ['Taxable', '7.6%', 'r'],
  ['GST', '6.8%', 'r'], ['Bill Amount', '8%', 'r'], ['E-Way Bill', '7.8%'], ['IRN', '3%', 'c'], ['PDF', '2.8%', 'c']];

export const CSS = `
.sb { display:flex; flex-direction:column; height:100%; min-height:0; font-family:${F}; }
/* one line: tabs | FY | search | filters ……… selected · buttons — square boxes filling the bar height */
.sb-tabs { display:flex; align-items:stretch; height:40px; padding:0; flex-shrink:0; background:#E3EEEF; border-bottom:1px solid #B9D0D3; }
.sb-tab { padding:0 16px; white-space:nowrap; flex-shrink:0; border:0; border-right:1px solid #B9D0D3; border-radius:0; background:#fff; cursor:pointer;
  display:flex; align-items:center; gap:6px; font:600 12.5px ${F}; color:${TEAL}; }
.sb-tab:hover { background:#F0F7F7; }
.sb-tab.on { background:${TEAL}; color:#fff; }
.sb-slot { flex:1; min-width:0; display:flex; align-items:stretch; }
.sb-slot > * { flex-shrink:0; }
.sb-slot .sb-fy { display:flex; }
.sb-slot .sb-fyb { height:auto; border:0; border-right:1px solid #B9D0D3; border-radius:0; padding:0 12px; }
.sb-slot .sb-fyb.set { background:#E8F3F4; }
.sb-slot .sb-fyp { top:41px; }
.sb-slot .sb-search { height:auto; width:250px; flex-shrink:1; min-width:110px; border:0; border-right:1px solid #B9D0D3; border-radius:0; padding:0 12px; }
.sb-slot .sb-search:focus { box-shadow:inset 0 0 0 2px rgba(3,68,79,.35); }
.sb-slot .sb-chk { height:auto; border:0; border-right:1px solid #B9D0D3; border-radius:0; padding:0 12px; }
.sb-slot .sb-tools { margin-left:auto; gap:0; align-items:stretch; }
.sb-slot .sb-picked { display:flex; align-items:center; gap:5px; padding:0 12px; }
.sb-slot .sb-tbtn { height:auto; border:0; border-left:1px solid #B9D0D3; border-radius:0; padding:0 14px; }
.sb-tbtn.del { color:#B42318; } .sb-tbtn.del:hover:not(:disabled) { background:#B42318; color:#fff; }
.sb-ask { display:flex; align-items:center; gap:8px; padding:9px 14px; background:#FEF3F2; border-bottom:1px solid #FECDCA; font-size:12.5px; color:#7A271A; flex-shrink:0; }
.sb-ask span { flex:1; }
.sb-abtn { height:28px; padding:0 12px; border:1px solid #FECDCA; border-radius:2px; background:#fff; color:#344054; cursor:pointer; font:600 12px ${F}; }
.sb-abtn.danger { background:#B42318; border-color:#B42318; color:#fff; }
.sb-tab .n { min-width:18px; height:17px; padding:0 5px; border-radius:99px; font-size:10.5px; line-height:17px; text-align:center; background:rgba(3,68,79,.12); }
.sb-tab.on .n { background:rgba(255,255,255,.22); }
.sb-sep { width:1px; height:18px; background:#C9DCDE; margin:0 4px; }
.sb-body { flex:1; min-height:0; overflow-y:auto; background:#EEF4F4; }

.sb-bar { display:flex; align-items:center; gap:8px; height:38px; padding:0 8px; flex-shrink:0; background:#F4F8F8; border-bottom:1px solid #C9DCDE; }
.sb-search { width:270px; min-width:150px; flex-shrink:1; height:29px; padding:0 9px; border:1px solid #B9D0D3; border-radius:6px; outline:none; font:400 12.5px ${F}; background:#fff; }
.sb-search:focus { border-color:${TEAL}; box-shadow:0 0 0 2px rgba(3,68,79,.15); }
.sb-chk { display:flex; align-items:center; gap:7px; height:29px; padding:0 10px; border:1px solid #B9D0D3; border-radius:6px; background:#fff; cursor:pointer; font:600 12px ${F}; color:#475467; white-space:nowrap; user-select:none; }
.sb-chk:hover { border-color:${TEAL}; } .sb-chk.on { background:#E8F3F4; border-color:${TEAL}; color:${TEAL}; }
.sb-chk input { width:14px; height:14px; margin:0; accent-color:${TEAL}; cursor:pointer; } .sb-chk small { font-weight:500; color:#98A2B3; }
.sb-tools { display:flex; align-items:center; gap:6px; margin-left:auto; flex-shrink:0; }
.sb-picked { font-size:12px; color:#667085; white-space:nowrap; } .sb-picked b { color:${TEAL}; font-family:ui-monospace, Consolas, monospace; }
.sb-tbtn { height:29px; padding:0 11px; display:inline-flex; align-items:center; gap:5px; border:1px solid ${TEAL}; border-radius:6px; background:#fff; color:${TEAL}; cursor:pointer; font:600 12px ${F}; white-space:nowrap; }
.sb-tbtn:hover:not(:disabled) { background:${TEAL}; color:#fff; } .sb-tbtn:disabled { opacity:.45; cursor:default; }
.sb-fy { position:relative; }
.sb-fyb { height:29px; display:flex; align-items:center; gap:7px; padding:0 10px; border:1px solid #B9D0D3; border-radius:6px; background:#fff; cursor:pointer; font:500 12.5px ${F}; color:#344054; white-space:nowrap; }
.sb-fyb:hover, .sb-fyb[aria-expanded="true"] { border-color:${TEAL}; } .sb-fyb.set { background:#E8F3F4; border-color:${TEAL}; }
.sb-fyb .lb { font-size:11px; font-weight:700; color:#667085; } .sb-fyb b { font-weight:600; color:${TEAL}; } .sb-fyb .cv { color:#98A2B3; font-size:10px; }
.sb-fyp { position:absolute; left:0; top:34px; z-index:30; min-width:180px; max-height:320px; overflow-y:auto; padding:5px; border-radius:8px; background:#fff; border:1px solid #D0D5DD; box-shadow:0 10px 28px rgba(16,24,40,.16); }
.sb-fyi { display:flex; align-items:center; gap:9px; padding:7px 9px; border-radius:5px; cursor:pointer; font-size:12.5px; color:#344054; }
.sb-fyi:hover { background:#F0F7F7; } .sb-fyi.on { color:${TEAL}; font-weight:600; }
.sb-fyi input { width:15px; height:15px; margin:0; accent-color:${TEAL}; cursor:pointer; } .sb-fyi span { flex:1; } .sb-fyi small { font-size:11px; color:#98A2B3; font-weight:500; }
.sb-fysep { height:1px; background:#EDF2F3; margin:3px 0; }
.sb-kpi { display:grid; grid-template-columns:repeat(4, 1fr); gap:1px; background:#C9DCDE; border-bottom:1px solid #C9DCDE; flex-shrink:0; }
.sb-k { background:#fff; padding:3px 14px; display:flex; align-items:baseline; justify-content:space-between; gap:10px; }
.sb-k small { font-size:10px; font-weight:700; color:#667085; text-transform:uppercase; letter-spacing:.5px; white-space:nowrap; }
.sb-k b { font-size:13.5px; color:#101828; font-variant-numeric:tabular-nums; white-space:nowrap; }
.sb-k.ok b { color:#067647; } .sb-k.due b { color:#B54708; }
.sb-note { display:flex; align-items:center; gap:10px; padding:7px 12px; background:#E6F4EA; color:#1E7B34; border-bottom:1px solid #B7E1C1; font-size:12.5px; font-weight:500; flex-shrink:0; }
.sb-note button { margin-left:auto; border:0; background:none; color:#1E7B34; font-size:16px; cursor:pointer; }

.sb-list { flex:1; min-height:0; overflow-y:auto; overflow-x:hidden; background:#fff; }
.sb-t { width:100%; table-layout:fixed; border-collapse:collapse; font-size:11.5px; }
.sb-t th { position:sticky; top:0; z-index:2; background:#D4EBEE; color:#000; font-weight:700; font-size:11px; text-align:left; padding:7px 5px; border-bottom:1px solid #A9CDD2; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.sb-t th:first-child, .sb-t td:first-child { padding-left:10px; }
.sb-t td { padding:5px 5px; border-bottom:1px solid #EDF2F3; color:#101828; vertical-align:top; overflow-wrap:anywhere; background:#fff; transition:background .08s; }
/* thin black lines between columns */
.sb-t th { border-right:1px solid #A9CDD2; }
.sb-t td { border-right:1px solid #000; }
.sb-t tbody.og { cursor:pointer; }
.sb-t tbody.og tr:first-child td { border-top:1px solid #C9DCDE; }
.sb-t tbody.og:hover td { background:#EAF4F5; }
.sb-t tbody.og.sel td { background:#D4EBEE; }
.sb-t tbody.og.sel tr:first-child td:first-child { box-shadow:inset 3px 0 0 ${TEAL}; }
.sb-t .r { text-align:right; font-variant-numeric:tabular-nums; white-space:nowrap; overflow-wrap:normal; } .sb-t th.r { text-align:right; }
.sb-t .c, .sb-t th.c { text-align:center; }
.sb-t td.no { font-weight:700; color:${TEAL}; font-variant-numeric:tabular-nums; white-space:nowrap; overflow-wrap:normal; }
.sb-t td.bno { font-weight:700; color:${TEAL}; font-variant-numeric:tabular-nums; white-space:nowrap; overflow-wrap:normal; }
.sb-t .nw { white-space:nowrap; overflow-wrap:normal; } .sb-t .cl { font-weight:600; } .sb-t .mut { color:#98A2B3; }
.sb-t .pend { color:#B54708; font-weight:700; } .sb-t .done { color:#067647; font-weight:600; }
.sb-t tfoot td { position:sticky; bottom:0; z-index:2; font-weight:700; font-size:11px; background:#E3EEEF; border-top:1px solid #A9CDD2; }
.sb-dot { display:inline-grid; place-items:center; width:20px; height:20px; border-radius:50%; color:#fff; font-size:10.5px; font-weight:700; }
.sb-ok { display:inline-grid; place-items:center; width:18px; height:18px; border-radius:50%; background:#16A34A; color:#fff; font-size:11px; font-weight:700; }
.sb-cnt { min-width:26px; height:20px; padding:0 6px; border:1px solid #B9D0D3; border-radius:99px; background:#fff; color:${TEAL}; cursor:pointer; font:700 11px ${F}; font-variant-numeric:tabular-nums; }
.sb-cnt:hover { border-color:${TEAL}; background:${TEAL}; color:#fff; }
.sb-pdfb { width:22px; height:22px; display:inline-grid; place-items:center; border:1px solid #B9D0D3; border-radius:4px; background:#fff; color:${TEAL}; cursor:pointer; padding:0; }
.sb-pdfb:hover { border-color:${TEAL}; background:${TEAL}; color:#fff; }
.sb-empty { padding:22px; text-align:center; color:#98A2B3; font-size:12.5px; }

.sb-pv { position:fixed; inset:0; z-index:1700; background:rgba(2,24,28,.6); display:flex; flex-direction:column; padding:3vh 4vw; font-family:${F}; }
.sb-pvh { display:flex; align-items:center; gap:10px; padding:8px 12px; background:linear-gradient(90deg, #1B7682 0%, #3C9AA4 100%); color:#fff; font-size:13px; }
.sb-pvh .grow { flex:1; } .sb-pvh button { width:28px; height:28px; border:1px solid rgba(255,255,255,.35); background:rgba(255,255,255,.1); color:#fff; cursor:pointer; font-size:17px; }
.sb-pv iframe { flex:1; width:100%; border:0; background:#fff; }
${SB_FORM_CSS}
`;

/* FY multi-select (empty = all years) */
export function FyFilter({ list, total, sel, setSel }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const down = e => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const key = e => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', down); document.addEventListener('keydown', key);
    return () => { document.removeEventListener('mousedown', down); document.removeEventListener('keydown', key); };
  }, [open]);
  const text = !sel.length ? 'All' : sel.length <= 2 ? [...sel].sort().reverse().map(k => fyLabel(k).slice(3)).join(', ') : `${sel.length} years`;
  return (
    <div className="sb-fy" ref={ref}>
      <button type="button" className={`sb-fyb${sel.length ? ' set' : ''}`} onClick={() => setOpen(o => !o)} aria-haspopup="listbox" aria-expanded={open}>
        <span className="lb">FY</span><b>{text}</b><span className="cv">▾</span>
      </button>
      {open && (
        <div className="sb-fyp" role="listbox" aria-multiselectable="true" aria-label="Financial year">
          <label className={`sb-fyi${!sel.length ? ' on' : ''}`}><input type="checkbox" checked={!sel.length} onChange={() => setSel([])} /><span>All</span><small>{total}</small></label>
          <div className="sb-fysep" />
          {list.map(([k, c]) => (
            <label key={k} className={`sb-fyi${sel.includes(k) ? ' on' : ''}`}><input type="checkbox" checked={sel.includes(k)} onChange={() => setSel(s => (s.includes(k) ? s.filter(x => x !== k) : [...s, k]))} /><span>{fyLabel(k)}</span><small>{c}</small></label>
          ))}
        </div>
      )}
    </div>
  );
}
export const fyCounts = (arr, dateOf) => {
  const m = new Map();
  arr.forEach(x => { const k = fyOf(dateOf(x)); if (k) m.set(k, (m.get(k) || 0) + 1); });
  return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0]));
};
/* Esc or a click outside the rows / toolbar clears a selection */
export const useClearSel = (sel, setSel, keep) => useEffect(() => {
  if (!sel) return;
  const down = e => { if (!e.target.closest?.(keep)) setSel(null); };
  const key = e => { if (e.key === 'Escape') setSel(null); };
  document.addEventListener('mousedown', down); document.addEventListener('keydown', key);
  return () => { document.removeEventListener('mousedown', down); document.removeEventListener('keydown', key); };
}, [sel, setSel, keep]);

export default function BetaSales() {
  const navigate = useNavigate();
  const { search } = useLocation();
  const asked = new URLSearchParams(search).get('tab');
  const urlTab = TABS.some(t => t.key === asked) ? asked : 'create';
  const { selectedCompany } = useCompany() || {};
  const companyId = selectedCompany?.companyId;

  const [orders, setOrders] = useState(null);
  const [bills, setBills] = useState(null);
  const [dcs, setDcs] = useState([]);   // delivery challans — the bill form ties "DC first" material to its bill
  const dcsByOrder = useMemo(() => { const m = {}; dcs.forEach(d => { if (d.linkedSalesOrderId != null) (m[String(d.linkedSalesOrderId)] = m[String(d.linkedSalesOrderId)] || []).push(d); }); return m; }, [dcs]);
  const [reload, setReload] = useState(0);
  const [editing, setEditing] = useState(null);     // bill open in the form
  const [createFor, setCreateFor] = useState(null); // { orderId, k } → form opens with this order
  const [note, setNote] = useState(null);
  const [askPrint, setAskPrint] = useState(null);   // { b, ds } — bill to print and its delivery challans
  const [billQ, setBillQ] = useState('');
  const [viewPdf, setViewPdf] = useState(null);   // { url (blob), name }
  const [slot, setSlot] = useState(null);         // right part of the tab row — each list puts its tools there
  const { user } = useAuth() || {};
  const closePdf = () => { if (viewPdf?.url) URL.revokeObjectURL(viewPdf.url); setViewPdf(null); };

  useEffect(() => {
    if (!companyId) return;
    axios.get('/api/sales-orders', { params: { companyId } }).then(r => setOrders(Array.isArray(r.data) ? r.data : [])).catch(() => setOrders([]));
  }, [companyId, reload]);
  useEffect(() => {
    if (!companyId) return;
    axios.get('/api/bills', { params: { companyId, type: 'sales' } }).then(r => setBills(Array.isArray(r.data) ? r.data.filter(b => b && b.type !== 'purchase') : [])).catch(() => setBills([]));
    axios.get('/api/delivery-challans', { params: { companyId } }).then(r => setDcs(Array.isArray(r.data) ? r.data : [])).catch(() => setDcs([]));
  }, [companyId, reload]);

  const billsByOrder = useMemo(() => {
    const m = {};
    (bills || []).forEach(b => { if (b.orderId != null) (m[String(b.orderId)] = m[String(b.orderId)] || []).push(b); });
    return m;
  }, [bills]);
  const soMap = useMemo(() => { const m = {}; (orders || []).forEach(o => { m[String(o.orderId)] = o; }); return m; }, [orders]);
  /* billing of every order that can be billed, newest first */
  const rows = useMemo(() => (orders || []).filter(o => !SKIP.includes(o.status))
    .map(o => billingOf(o, billsByOrder[String(o.orderId)] || []))
    .sort((a, b) => String(b.o.orderDate || '').localeCompare(String(a.o.orderDate || ''))), [orders, billsByOrder]);
  const pendingCount = rows.filter(r => r.state !== 'full').length;

  const tab = editing ? 'create' : urlTab;
  const go = k => { setEditing(null); navigate(`/beta/sales?tab=${k}`); };
  /* bill only, or the bill and its delivery challans together as one PDF */
  const runPrint = async withDc => {
    const { b, ds } = askPrint; setAskPrint(null);
    try {
      const args = { b, order: soMap[String(b.orderId)], company: selectedCompany, user };
      if (!withDc) { await printSalesBill(args); return; }
      // bill + its DC(s) in one PDF
      setNote('Preparing one PDF — bill + delivery challan…');
      const pages = [await printSalesBill({ ...args, collect: true })];
      for (const dc of ds) pages.push(await printDC({ dc, company: selectedCompany, user, collect: true }));   // eslint-disable-line no-await-in-loop
      await printMerged(pages);
      setNote(null);
    } catch { setNote('Could not prepare the print (bill + DC). Restart the backend if this is the first time.'); }
  };
  const loading = orders === null || bills === null;

  return (
    <div className="sb">
      <style>{CSS}</style>
      <div className="sb-tabs" role="tablist">
        {TABS.map((t, i) => (
          <React.Fragment key={t.key}>
            <button type="button" role="tab" aria-selected={tab === t.key} className={`sb-tab${tab === t.key ? ' on' : ''}`} onClick={() => go(t.key)}>
              {t.label}
              {t.key === 'list' && bills && <span className="n">{bills.length}</span>}
              {t.key === 'pending' && !loading && <span className="n">{pendingCount}</span>}
            </button>
          </React.Fragment>
        ))}
        <div className="sb-slot" ref={setSlot} />
      </div>
      {note && <div className="sb-note" role="status">{note}<button type="button" onClick={() => setNote(null)} aria-label="Dismiss">×</button></div>}
      {askPrint && (
        <div className="sb-ask" role="alertdialog" aria-label="Print the delivery challan too?">
          <span>Print the delivery challan <b>{askPrint.ds.map(d => d.dcNo || d.dcId).join(', ')}</b> of bill <b>{askPrint.b.billNo || askPrint.b.billId}</b> too?</span>
          <button type="button" className="sb-abtn" onClick={() => setAskPrint(null)}>Cancel</button>
          <button type="button" className="sb-abtn" onClick={() => runPrint(false)}>Bill only</button>
          <button type="button" className="sb-abtn danger" style={{ background: '#03444F', borderColor: '#03444F' }} onClick={() => runPrint(true)} autoFocus>Bill + DC</button>
        </div>
      )}

      {tab === 'create' && (
        <div className="sb-body">
          {loading ? <div className="sb-empty">Loading orders and bills…</div>
            : editing
              ? <SalesBillForm key={`edit-${editing.billId}`} companyId={companyId} company={selectedCompany} rows={rows} billsByOrder={billsByOrder} allBills={bills} dcsByOrder={dcsByOrder} editBill={editing}
                onCancel={() => { setEditing(null); navigate('/beta/sales?tab=list'); }}
                onSaved={(b, text) => { setEditing(null); setReload(x => x + 1); setNote(text); navigate('/beta/sales?tab=list'); }} />
              : <SalesBillForm key={createFor ? `for-${createFor.orderId}-${createFor.k}` : 'new'} companyId={companyId} company={selectedCompany} rows={rows} billsByOrder={billsByOrder} allBills={bills} dcsByOrder={dcsByOrder}
                presetOrderId={createFor?.orderId} onSaved={() => { setReload(x => x + 1); setNote(null); }} />}
        </div>
      )}
      {tab === 'list' && <BillList bills={bills} soMap={soMap} companyId={companyId} q={billQ} setQ={setBillQ}
        slot={slot}
        onEdit={b => { setNote(null); setEditing(b); }} onPdf={setViewPdf} setNote={setNote}
        onPrint={b => { const ds = dcsOfBill(b, dcs); if (ds.length) setAskPrint({ b, ds }); else printSalesBill({ b, order: soMap[String(b.orderId)], company: selectedCompany, user }); }}
        onDeleted={b => { setReload(x => x + 1); setNote(`Deleted bill ${b.billNo || b.billId} of order ${b.orderNo || '—'} — its quantities are pending again.`); }} />}
      {tab === 'pending' && <PendingList rows={rows} loading={loading} slot={slot}
        onBill={r => { setNote(null); setCreateFor({ orderId: r.o.orderId, k: Date.now() }); navigate('/beta/sales?tab=create'); }}
        onBills={r => { setBillQ(r.o.orderNo || String(r.o.orderId)); navigate('/beta/sales?tab=list'); }} />}

      {viewPdf && (
        <div className="sb-pv" onMouseDown={e => { if (e.target === e.currentTarget) closePdf(); }} onKeyDown={e => { if (e.key === 'Escape') closePdf(); }}>
          <div className="sb-pvh"><Svg name="file" size={14} /><b>{viewPdf.name}</b><span className="grow" /><button type="button" autoFocus onClick={closePdf} aria-label="Close">×</button></div>
          <iframe title={viewPdf.name} src={viewPdf.url} />
        </div>
      )}
    </div>
  );
}

/* ── Sales Bill: every bill made ── */
function BillList({ bills, soMap, companyId, q, setQ, onEdit, onPdf, onPrint, onDeleted, setNote, slot }) {
  const [fySel, setFySel] = useState(() => [fyOf(new Date())]);   // current FY by default
  const [selId, setSelId] = useState(null);
  const [askDel, setAskDel] = useState(null);
  const [busy, setBusy] = useState('');
  useClearSel(askDel ? null : selId, setSelId, '.sb-t tbody.og, .sb-tools, .sb-ask');
  const all = useMemo(() => [...(bills || [])].sort((a, b) => String(b.billDate || '').localeCompare(String(a.billDate || '')) || String(b.billNo || '').localeCompare(String(a.billNo || ''), undefined, { numeric: true })), [bills]);
  const fyList = useMemo(() => fyCounts(all, b => b.billDate), [all]);
  const list = useMemo(() => {
    const w = q.toLowerCase().split(/\s+/).filter(Boolean);
    return all.filter(b => (!fySel.length || fySel.includes(fyOf(b.billDate)))
      && (!w.length || w.every(x => `${b.billNo} ${b.billId} ${b.partyName} ${b.orderNo} ${soMap[String(b.orderId)]?.customerPO || ''} ${b.ewayBillNo || ''} ${(b.items || []).map(i => i.description).join(' ')}`.toLowerCase().includes(x))));
  }, [all, fySel, q, soMap]);
  const sel = list.find(b => b.billId === selId) || null;
  const pdfOf = b => (b.attachments || []).find(a => /\.pdf$/i.test(a.fileName || a.name || ''));
  /* fetch the PDF as a file first — a frame pointed straight at /api/... gets the app page (dashboard) from the dev server */
  const openPdf = async b => {
    const a = pdfOf(b); if (!a) return;
    setBusy('pdf');
    try {
      const r = await axios.get(attachUrl(companyId, b, a), { responseType: 'blob' });
      if (!/pdf/i.test(r.data?.type || '')) throw new Error('not a pdf');
      onPdf({ url: URL.createObjectURL(new Blob([r.data], { type: 'application/pdf' })), name: a.name || a.fileName });
    } catch { setNote(`Could not open the PDF of bill ${b.billNo || b.billId} — the file is missing on the server.`); }
    finally { setBusy(''); }
  };
  const doDelete = async b => {
    setBusy('del');
    try {
      await axios.delete(`/api/bills/${b.billId}`, { params: { companyId, type: 'sales' } });
      setAskDel(null); setSelId(null); onDeleted(b);
    } catch (e) { setNote(e.response?.data?.error || 'Could not delete the bill.'); }
    finally { setBusy(''); }
  };
  const sum = k => list.reduce((s, b) => s + n(b[k]), 0);

  return (
    <>
      {slot && createPortal(<>
        <FyFilter list={fyList} total={all.length} sel={fySel} setSel={setFySel} />
        <input className="sb-search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search bill no., client, order, PO, e-way…" aria-label="Search bills" />
        <div className="sb-tools">
          <span className="sb-picked">{sel ? <>Selected: <b>{sel.billNo || sel.billId}</b></> : 'Click a bill to select'}</span>
          <button type="button" className="sb-tbtn" disabled={!sel} onClick={() => onPrint(sel)}><Svg name="file" size={13} />Print</button>
          <button type="button" className="sb-tbtn" disabled={!sel || !pdfOf(sel) || busy === 'pdf'} onClick={() => openPdf(sel)}><Svg name="eye" size={13} />{busy === 'pdf' ? 'Opening…' : 'View PDF'}</button>
          <button type="button" className="sb-tbtn" disabled={!sel} onClick={() => onEdit(sel)}><Svg name="settings" size={13} />Edit</button>
          <button type="button" className="sb-tbtn del" disabled={!sel} onClick={() => setAskDel(sel)}><Svg name="x" size={13} />Delete</button>
        </div>
      </>, slot)}
      {askDel && (
        <div className="sb-ask" role="alertdialog" aria-label="Confirm delete">
          <span><b>Delete bill {askDel.billNo || askDel.billId}</b> ({askDel.partyName || '—'}, ₹ {money(askDel.grandTotal)}) of order {askDel.orderNo || '—'}? Its quantities become pending again. This cannot be undone.</span>
          <button type="button" className="sb-abtn" onClick={() => setAskDel(null)} disabled={busy === 'del'}>Keep</button>
          <button type="button" className="sb-abtn danger" onClick={() => doDelete(askDel)} disabled={busy === 'del'}>{busy === 'del' ? 'Deleting…' : 'Yes, delete'}</button>
        </div>
      )}
      <div className="sb-kpi" aria-label="Totals of the bills shown">
        <div className="sb-k"><small>Bills</small><b>{list.length}</b></div>
        <div className="sb-k"><small>Taxable</small><b>₹ {BIG.format(sum('subTotal'))}</b></div>
        <div className="sb-k"><small>GST</small><b>₹ {BIG.format(sum('totalGST'))}</b></div>
        <div className="sb-k ok"><small>Bill Amount</small><b>₹ {BIG.format(sum('grandTotal'))}</b></div>
      </div>
      <div className="sb-list">
        <table className="sb-t">
          <colgroup>{BCOLS.map(([h, w]) => <col key={h} style={{ width: w }} />)}</colgroup>
          <thead><tr>{BCOLS.map(([h, , a]) => <th key={h} className={a || ''}>{h}</th>)}</tr></thead>
          {bills === null ? <tbody><tr><td colSpan={12} className="sb-empty">Loading…</td></tr></tbody>
            : !list.length ? <tbody><tr><td colSpan={12} className="sb-empty">{q ? `No bill matches “${q}”.` : 'No sales bills yet.'}</td></tr></tbody>
              : null}
          {bills !== null && list.map(b => {
            const so = soMap[String(b.orderId)], a = pdfOf(b);
            const prods = (b.items || []).filter(li => li.unit !== 'LOT' || li.itemIdx != null).map(li => `${li.description} × ${num(li.qty)}`).join('; ');
            return (
              <tbody key={b.billId} className={`og${selId === b.billId ? ' sel' : ''}`} onClick={() => setSelId(b.billId)} onDoubleClick={() => { setSelId(b.billId); onEdit(b); }}
                title="Click to select · double-click to edit" aria-selected={selId === b.billId}>
                <tr>
                  <td className="nw">{fdate(b.billDate)}</td><td className="bno">{b.billNo || b.billId}</td><td className="cl">{dash(b.partyName)}</td>
                  <td className="no">{dash(b.orderNo)}</td><td>{dash(so?.customerPO)}</td><td>{prods || <span className="mut">—</span>}</td>
                  <td className="r">{money(b.subTotal)}</td><td className="r">{money(b.totalGST)}</td><td className="r"><b>{money(b.grandTotal)}</b></td>
                  <td className="nw">{b.ewayBillNo ? b.ewayBillNo : <span className="mut">—</span>}</td>
                  <td className="c">{b.irnNo ? <span className="sb-ok" title={`IRN ${b.irnNo}`}>✓</span> : <span className="mut">—</span>}</td>
                  <td className="c">{a ? <button type="button" className="sb-pdfb" title={`View ${a.name || a.fileName}`} onClick={e => { e.stopPropagation(); openPdf(b); }} onDoubleClick={e => e.stopPropagation()}><Svg name="file" size={12} /></button> : <span className="mut">—</span>}</td>
                </tr>
              </tbody>
            );
          })}
          {list.length > 0 && <tfoot><tr>
            <td colSpan={6}>Total ({list.length} bills)</td><td className="r">{money(sum('subTotal'))}</td><td className="r">{money(sum('totalGST'))}</td><td className="r">{money(sum('grandTotal'))}</td><td colSpan={3} />
          </tr></tfoot>}
        </table>
      </div>
    </>
  );
}

/* ── Sales Bill Pending: what is billed and what is left, per order ── */
function PendingList({ rows, loading, onBill, onBills, slot }) {
  const [fySel, setFySel] = useState(() => [fyOf(new Date())]);   // current FY by default
  const [showFull, setShowFull] = useState(false);
  const [q, setQ] = useState('');
  const [selId, setSelId] = useState(null);
  useClearSel(selId, setSelId, '.sb-t tbody.og, .sb-tools');
  const fyList = useMemo(() => fyCounts(rows, r => r.o.orderDate), [rows]);
  const inFy = useMemo(() => rows.filter(r => !fySel.length || fySel.includes(fyOf(r.o.orderDate))), [rows, fySel]);
  const fullCount = inFy.filter(r => r.state === 'full').length;
  const list = useMemo(() => {
    const w = q.toLowerCase().split(/\s+/).filter(Boolean);
    return inFy.filter(r => (showFull || r.state !== 'full')
      && (!w.length || w.every(x => `${r.o.orderNo} ${r.o.customerName || r.o.party} ${r.o.customerPO} ${r.lines.map(l => l.name).join(' ')} ${STATE[r.state][2]}`.toLowerCase().includes(x))));
  }, [inFy, q, showFull]);
  const sel = list.find(r => String(r.o.orderId) === selId) || null;
  const sum = k => list.reduce((s, r) => s + r[k], 0);

  return (
    <>
      {slot && createPortal(<>
        <FyFilter list={fyList} total={rows.length} sel={fySel} setSel={setFySel} />
        <input className="sb-search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search order, client, PO, product…" aria-label="Search orders" />
        <label className={`sb-chk${showFull ? ' on' : ''}`} title="Show orders that are fully billed">
          <input type="checkbox" checked={showFull} onChange={e => setShowFull(e.target.checked)} />Show fully billed <small>{fullCount}</small>
        </label>
        <div className="sb-tools">
          <span className="sb-picked">{sel ? <>Selected: <b>{sel.o.orderNo || sel.o.orderId}</b></> : 'Double-click an order to bill it'}</span>
          <button type="button" className="sb-tbtn" disabled={!sel || sel.state === 'full'} onClick={() => onBill(sel)}><Svg name="file" size={13} />Create Bill</button>
        </div>
      </>, slot)}
      <div className="sb-kpi" aria-label="Totals of the orders shown">
        <div className="sb-k"><small>Orders</small><b>{list.length}</b></div>
        <div className="sb-k"><small>Order Value</small><b>₹ {BIG.format(sum('value'))}</b></div>
        <div className="sb-k ok"><small>Billed</small><b>₹ {BIG.format(sum('billedAmt'))}</b></div>
        <div className="sb-k due"><small>To Bill</small><b>₹ {BIG.format(sum('toBill'))}</b></div>
      </div>
      <div className="sb-list">
        <table className="sb-t">
          <colgroup>{PCOLS.map(([h, w]) => <col key={h} style={{ width: w }} />)}</colgroup>
          <thead><tr>{PCOLS.map(([h, , a]) => <th key={h} className={a || ''}>{h}</th>)}</tr></thead>
          {loading ? <tbody><tr><td colSpan={13} className="sb-empty">Loading…</td></tr></tbody>
            : !list.length ? <tbody><tr><td colSpan={13} className="sb-empty">{q ? `No order matches “${q}”.` : showFull ? 'No orders.' : 'Nothing pending — every order is fully billed. Tick “Show fully billed” to see them.'}</td></tr></tbody>
              : list.map(r => {
                const lines = r.lines.length ? r.lines : [null];
                const span = lines.length, id = String(r.o.orderId), st = STATE[r.state];
                return (
                  <tbody key={id} className={`og${selId === id ? ' sel' : ''}`} onClick={() => setSelId(id)}
                    onDoubleClick={() => { setSelId(id); if (r.state !== 'full') onBill(r); }}
                    title={r.state === 'full' ? 'Fully billed' : 'Click to select · double-click to make its bill'} aria-selected={selId === id}>
                    {lines.map((l, i) => (
                      <tr key={i}>
                        {i === 0 && <>
                          <td rowSpan={span} className="no">{r.o.orderNo || r.o.orderId}</td>
                          <td rowSpan={span} className="nw">{fdate(r.o.orderDate)}</td>
                          <td rowSpan={span} className="cl">{dash(r.o.customerName || r.o.party)}</td>
                          <td rowSpan={span}>{dash(r.o.customerPO)}</td>
                        </>}
                        {l ? <>
                          <td>{l.name}</td>
                          <td className="r">{num(l.ordered)}{l.unit ? <span className="mut"> {l.unit}</span> : ''}</td>
                          <td className="r">{l.billed ? num(l.billed) : <span className="mut">0</span>}</td>
                          <td className={`r ${l.pending > 0 ? 'pend' : 'done'}`}>{l.pending > 0 ? num(l.pending) : '✓'}</td>
                        </> : <td colSpan={4} className="c mut">—</td>}
                        {i === 0 && <>
                          <td rowSpan={span} className="r"><b>{money(r.value)}</b></td>
                          <td rowSpan={span} className="r">{r.billedAmt ? money(r.billedAmt) : <span className="mut">0</span>}</td>
                          <td rowSpan={span} className={`r ${r.toBill > 0.5 ? 'pend' : 'done'}`}>{money(r.toBill)}</td>
                          <td rowSpan={span} className="c">{r.bills.length
                            ? <button type="button" className="sb-cnt" title="Double-click to see these bills" aria-label={`${r.bills.length} bills — double-click to see them`}
                              onClick={e => e.stopPropagation()} onDoubleClick={e => { e.stopPropagation(); onBills(r); }}>{r.bills.length}</button>
                            : <span className="mut">0</span>}</td>
                          <td rowSpan={span} className="c"><span className="sb-dot" style={{ background: st[1] }} title={st[2]}>{st[0]}</span></td>
                        </>}
                      </tr>
                    ))}
                  </tbody>
                );
              })}
          {!loading && list.length > 0 && <tfoot><tr>
            <td colSpan={8}>Total ({list.length} orders)</td>
            <td className="r">{money(sum('value'))}</td><td className="r">{money(sum('billedAmt'))}</td><td className="r">{money(sum('toBill'))}</td>
            <td className="c">{list.reduce((s, r) => s + r.bills.length, 0)}</td><td />
          </tr></tfoot>}
        </table>
      </div>
    </>
  );
}
