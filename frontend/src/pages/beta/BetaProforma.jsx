/* Beta — Proforma Invoice. Tabs: Create PI | PI List.
 * A PI is raised against a sales order as per its payment terms (e.g. 30% advance, 40% before dispatch,
 * 30% after installation, GST after 3B). The % applies to a chosen basis of the order value:
 * Basic · Basic + GST · Basic + Charges · Full value · GST only. Server: /api/proforma-invoices
 * (it computes all amounts from the saved order and numbers PIs as <company code>PI<FY>001). */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useCompany } from '../../context/CompanyContext';
import { withLatestClient } from '../../utils/latestClient';
import { useAuth } from '../../context/AuthContext';
import { brandLine } from '../../utils/printBranding';
import { fillBody } from './BetaDCPrint';
import { Svg } from '../../components/ui/Icon';
import { previewFrame, prodText } from './printKit';

const TEAL = '#03444f';
const F = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
const HEAD = 'linear-gradient(90deg, #1B7682 0%, #3C9AA4 100%)';
const TABS = [{ key: 'list', label: 'PI List' }, { key: 'create', label: 'Create PI' }];
const BASIS_ORDER = ['basic', 'basic_gst', 'basic_charges', 'full', 'gst'];
const BASIS_HINT = {
  basic: 'Products only — no GST, no charges',
  basic_gst: 'Products + GST on products',
  basic_charges: 'Products + transport / additional charges, no GST',
  full: 'Whole order value with GST (= grand total)',
  gst: 'Only the GST amount of the order',
};
const MILESTONES = [
  { label: 'Advance' }, { label: 'Before Dispatch' }, { label: 'After Delivery' }, { label: 'After Installation' },
  { label: 'GST amount after 3B', basis: 'gst', pct: '100' },
];

const n = v => parseFloat(v) || 0;
const r2 = v => Math.round(v * 100) / 100;
const AMT_FMT = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });   // built once, not per call
const amt = v => AMT_FMT.format(Number(v) || 0);
const today = () => new Date().toISOString().slice(0, 10);
const DATE_FMT = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
const fdate = d => { if (!d) return '—'; const x = new Date(d); return isNaN(x) ? String(d) : DATE_FMT.format(x); };
const dash = v => (v == null || String(v).trim() === '' ? '—' : v);

const CSS = `
.pi { display:flex; flex-direction:column; height:100%; min-height:0; font-family:${F}; }
.pi-tabs { display:flex; align-items:center; gap:6px; height:40px; padding:0 6px; flex-shrink:0; background:#E3EEEF; border-bottom:1px solid #C9DCDE; }
.pi-tab { height:29px; padding:0 14px; white-space:nowrap; flex-shrink:0; border:1px solid #B9D0D3; border-radius:6px; background:#fff; cursor:pointer; box-shadow:0 1px 2px rgba(16,24,40,.08);
  display:flex; align-items:center; gap:6px; font:600 12.5px ${F}; color:${TEAL}; }
.pi-tab:hover { background:#F0F7F7; border-color:${TEAL}; }
.pi-tab.on { background:${TEAL}; border-color:${TEAL}; color:#fff; }
.pi-tab .n { min-width:18px; height:17px; padding:0 5px; border-radius:99px; font-size:10.5px; line-height:17px; text-align:center; background:rgba(3,68,79,.12); }
.pi-tab.on .n { background:rgba(255,255,255,.22); }
.pi-sep { width:1px; height:18px; background:#C9DCDE; margin:0 4px; }
.pi .pi-search { margin-left:8px; width:300px; flex:0 0 300px; height:29px; padding:0 9px; border:1px solid #B9D0D3; border-radius:6px; outline:none; font:400 12.5px ${F}; }
.pi-search:focus { border-color:${TEAL}; box-shadow:0 0 0 2px rgba(3,68,79,.15); }
.pi-body { flex:1; min-height:0; overflow-y:auto; background:#EEF4F4; }

.pi-hero { display:flex; align-items:center; gap:10px; padding:8px 14px; background:${HEAD}; color:#fff; }
.pi-hero .ic { width:28px; height:28px; display:grid; place-items:center; background:rgba(255,255,255,.14); border:1px solid rgba(255,255,255,.22); border-radius:2px; }
.pi-hero h1 { margin:0; font-size:15px; } .pi-hero .grow { flex:1; }
.pi-chip { display:flex; align-items:center; gap:8px; padding:3px 10px; background:rgba(255,255,255,.12); border:1px solid rgba(255,255,255,.22); border-radius:2px; }
.pi-chip small { font-size:10.5px; text-transform:uppercase; letter-spacing:.6px; opacity:.75; } .pi-chip b { font-family:ui-monospace, Consolas, monospace; font-size:13.5px; }
.pi-2 { display:grid; grid-template-columns:1fr 1fr; margin-bottom:10px; }
.pi-2 > .pi-card { margin:0; } .pi-2 > .pi-card + .pi-card { border-left:1px solid #B9CED1; }
.pi-card { background:#fff; border-top:1px solid #B9CED1; border-bottom:1px solid #B9CED1; margin-bottom:10px; }
.pi-ch { display:flex; align-items:center; gap:9px; padding:6px 10px; background:${HEAD}; color:#fff; }
.pi-ch .ico { width:22px; height:22px; display:grid; place-items:center; background:rgba(255,255,255,.16); border-radius:2px; }
.pi-ch b { font-size:13px; } .pi-ch small { font-size:11.5px; opacity:.85; } .pi-ch .grow { flex:1; }
.pi-kv { width:100%; border-collapse:collapse; table-layout:fixed; font-size:12.5px; }
.pi-kv th { width:140px; padding:7px 10px; background:#F4F8F8; border:1px solid #DCE6E8; text-align:left; font-weight:600; color:#344054; vertical-align:middle; }
.pi-kv th i { color:#D92D20; font-style:normal; }
.pi-kv td { padding:5px 8px; border:1px solid #DCE6E8; color:#101828; vertical-align:middle; }
.pi-kv tr:first-child > * { border-top:none; } .pi-kv tr > :first-child { border-left:none; } .pi-kv tr > :last-child { border-right:none; } .pi-kv tr:last-child > * { border-bottom:none; }
.pi-kv td.r, .pi-t .r { text-align:right; font-variant-numeric:tabular-nums; white-space:nowrap; }
.pi-kv tr.tot td, .pi-kv tr.tot th { font-weight:700; background:#E3EEEF; }
.pi-kv tr.rem td, .pi-kv tr.rem th { font-weight:700; color:${TEAL}; background:#E1EFF0; font-size:13.5px; }
.pi input, .pi select, .pi textarea { height:30px; padding:0 9px; border:1px solid #C9D7DA; border-radius:2px; background:#fff; outline:none; font:400 12.5px ${F}; color:#101828; width:100%; box-sizing:border-box; }
.pi textarea { height:auto; min-height:44px; padding:6px 9px; resize:vertical; }
.pi input:focus, .pi select:focus, .pi textarea:focus { border-color:${TEAL}; box-shadow:0 0 0 3px rgba(3,68,79,.12); }
.pi input[readonly] { background:#F2F6F6; color:#475467; }
.pi .bad { border-color:#D92D20 !important; background:#FFFBFA; }
.pi-err { display:block; font-size:10.5px; color:#D92D20; margin-top:2px; }
.pi-srch { display:flex; } .pi-srch input { cursor:pointer; }
.pi-sbtn { width:34px; height:30px; flex-shrink:0; border:1px solid ${TEAL}; border-radius:0 2px 2px 0; background:${TEAL}; color:#fff; cursor:pointer; display:grid; place-items:center; }
.pi-chips { display:flex; flex-wrap:wrap; gap:5px; margin-top:6px; }
.pi-chips button { height:24px; padding:0 9px; border:1px solid #B9D0D3; border-radius:2px; background:#fff; color:${TEAL}; cursor:pointer; font:600 11.5px ${F}; }
.pi-chips button:hover { border-color:${TEAL}; background:#F0F7F7; }
.pi-seg { display:flex; height:30px; border:1px solid #C9D7DA; border-radius:2px; overflow:hidden; width:180px; flex-shrink:0; }
.pi-seg button { flex:1; border:0; background:#fff; cursor:pointer; font:600 12px ${F}; color:#475467; }
.pi-seg button + button { border-left:1px solid #C9D7DA; } .pi-seg button.on { background:${TEAL}; color:#fff; }
.pi-row { display:flex; gap:8px; align-items:center; }
.pi-pct { display:flex; width:160px; } .pi-pct input { text-align:right; border-radius:2px 0 0 2px; }
.pi-pct span { width:34px; flex-shrink:0; display:grid; place-items:center; border:1px solid #C9D7DA; border-left:0; background:#F4F8F8; font-weight:600; font-size:12px; color:#475467; }
.pi-hint { font-size:11px; color:#667085; }
.pi-live { margin-left:4px; font-size:15px; font-weight:700; color:${TEAL}; white-space:nowrap; font-variant-numeric:tabular-nums; }
.pi-live small { font-size:11.5px; font-weight:500; color:#667085; }
.pi-live.bad { color:#D92D20; }
.pi-pbtn { height:26px; padding:0 10px; border:1px solid ${TEAL}; border-radius:2px; background:#fff; color:${TEAL}; cursor:pointer; font:600 11.5px ${F}; }
.pi-pbtn:hover { background:${TEAL}; color:#fff; }
.pi-pbtn.del { border-color:#F5C2C0; color:#B42318; } .pi-pbtn.del:hover { background:#B42318; border-color:#B42318; color:#fff; }
.pi-tools { display:flex; align-items:center; gap:6px; margin-left:auto; padding-left:10px; flex-shrink:0; }
.pi-picked { font-size:12px; color:#667085; white-space:nowrap; margin-right:4px; } .pi-picked b { color:${TEAL}; font-family:ui-monospace, Consolas, monospace; }
.pi-tbtn { height:29px; padding:0 12px; display:inline-flex; align-items:center; gap:5px; border:1px solid ${TEAL}; border-radius:6px; background:#fff; color:${TEAL}; cursor:pointer; font:600 12.5px ${F}; white-space:nowrap; }
.pi-tbtn:hover:not(:disabled) { background:${TEAL}; color:#fff; }
.pi-tbtn.del { border-color:#F5C2C0; color:#B42318; } .pi-tbtn.del:hover:not(:disabled) { background:#B42318; border-color:#B42318; color:#fff; }
.pi-tbtn:disabled { opacity:.45; cursor:default; }
.pi-t tr.pick { cursor:pointer; } .pi-t tr.pick:hover td { background:#EAF4F5; }
.pi-t tr.pick.sel td { background:#D4EBEE !important; box-shadow:inset 0 1px 0 #A9CDD2, inset 0 -1px 0 #A9CDD2; }
.pi-t tr.pick.sel td:first-child { box-shadow:inset 3px 0 0 ${TEAL}, inset 0 1px 0 #A9CDD2, inset 0 -1px 0 #A9CDD2; }
.pi-t tr.chg td { color:#475467; background:#FAFCFC; }
.pi-ask { display:flex; align-items:center; gap:8px; padding:9px 14px; background:#FEF3F2; border-bottom:1px solid #FECDCA; font-size:12.5px; color:#7A271A; flex-shrink:0; }
.pi-ask span { flex:1; }
.pi-abtn { height:28px; padding:0 12px; border:1px solid #FECDCA; border-radius:2px; background:#fff; color:#344054; cursor:pointer; font:600 12px ${F}; }
.pi-abtn.danger { background:#B42318; border-color:#B42318; color:#fff; }
.pi-ed { width:100%; max-width:900px; max-height:90vh; display:flex; flex-direction:column; background:#fff; border:1px solid #9DBDC1; box-shadow:0 20px 60px rgba(0,0,0,.35); }
.pi-ed .pi-body2 { overflow-y:auto; }
.pi-ed .pi-foot { display:flex; justify-content:flex-end; gap:8px; padding:10px 14px; border-top:1px solid #DCE6E8; background:#F7FAFA; }
.pi-t { width:100%; border-collapse:collapse; font-size:12.5px; }
.pi-t th { background:#D4EBEE; color:#000; font-weight:700; font-size:11.5px; text-align:left; padding:7px 8px; border-bottom:1px solid #A9CDD2; white-space:nowrap; position:sticky; top:0; }
.pi-t td { padding:7px 8px; border-bottom:1px solid #EDF2F3; color:#101828; }
/* thin black lines between columns */
.pi-t th { border-right:1px solid #A9CDD2; }
.pi-t td { border-right:1px solid #000; }
.pi-t tbody tr:nth-child(even) td { background:#FAFCFC; }
.pi-t tfoot td { font-weight:700; background:#E3EEEF; border-top:1px solid #C9DCDE; }
.pi-t .no { font-weight:600; color:${TEAL}; font-family:ui-monospace, Consolas, monospace; font-size:12px; }
.pi-empty { padding:16px; text-align:center; color:#98A2B3; font-size:12.5px; }
.pi-prev { padding:12px 16px; font-variant-numeric:tabular-nums; }
.pi-prev .row { display:flex; justify-content:space-between; padding:3px 0; font-size:12.5px; color:#475467; } .pi-prev .row b { color:#101828; }
.pi-prev .row.pay { background:#E1EFF0; margin:4px -16px 2px; padding:8px 16px; border-top:none; }
.pi-prev .big { margin-top:6px; padding-top:8px; border-top:1px dashed #C9D7DA; font-size:16px; color:${TEAL}; } .pi-prev .big b { color:${TEAL}; }
.pi-warn { margin-top:8px; padding:7px 10px; background:#FEF3F2; color:#B42318; font-size:12px; font-weight:500; }
.pi-msg { margin:8px 10px; padding:9px 12px; font-size:12.5px; font-weight:500; }
.pi-msg.ok { background:#E6F4EA; color:#1E7B34; border:1px solid #B7E1C1; } .pi-msg.err { background:#FDECEC; color:#B42318; border:1px solid #F5C2C0; }
.pi-bar { position:sticky; bottom:0; display:flex; align-items:center; gap:8px; padding:10px 16px; background:rgba(255,255,255,.97); border-top:1px solid #D7E3E5; box-shadow:0 -4px 14px rgba(16,24,40,.06); }
.pi-bar .info { flex:1; font-size:12.5px; color:#667085; } .pi-bar .info b { color:${TEAL}; font-size:14px; }
.pi-b { height:36px; padding:0 18px; border-radius:2px; cursor:pointer; font:600 13px ${F}; border:1px solid transparent; }
.pi-b.ghost { background:#fff; border-color:#C9D7DA; color:#344054; } .pi-b.pri { background:${TEAL}; color:#fff; } .pi-b:disabled { opacity:.55; cursor:default; }
.pi-b.draft { background:#fff; border-color:#F79009; color:#B54708; } .pi-b.draft:hover:not(:disabled) { background:#FFFAEB; }
.pi-dr { display:inline-block; padding:1px 7px; border-radius:2px; background:#FEF0C7; color:#B54708; font:700 10.5px ui-monospace, Consolas, monospace; letter-spacing:.5px; }

.pi-pkb { position:fixed; inset:0; z-index:1600; background:rgba(2,24,28,.45); display:flex; align-items:flex-start; justify-content:center; padding:8vh 16px; font-family:${F}; }
.pi-pk { width:100%; max-width:980px; max-height:78vh; display:flex; flex-direction:column; background:#fff; border:1px solid #9DBDC1; box-shadow:0 20px 60px rgba(0,0,0,.35); }
.pi-pkh { display:flex; align-items:center; gap:10px; padding:9px 12px; background:${HEAD}; color:#fff; } .pi-pkh .grow { flex:1; }
.pi-pkh button { width:26px; height:26px; border:1px solid rgba(255,255,255,.35); background:rgba(255,255,255,.1); color:#fff; cursor:pointer; font-size:16px; }
.pi-pks { padding:9px 12px; border-bottom:1px solid #DCE6E8; } .pi-pks input { height:32px; }
.pi-pkl { overflow-y:auto; } .pi-pkl td { cursor:pointer; } .pi-pkl tr.sel td { background:#E1EFF0 !important; }
@media (max-width: 1100px) { .pi-2 { grid-template-columns:1fr; } .pi-2 > .pi-card + .pi-card { border-left:none; } }
`;

export default function BetaProforma() {
  const { selectedCompany } = useCompany() || {};
  const companyId = selectedCompany?.companyId;
  const navigate = useNavigate();
  const { user } = useAuth() || {};
  const doPrint = p => printPI(p, selectedCompany, companyId, user);
  const [editing, setEditing] = useState(null);   // PI open in the create form for editing
  const [selId, setSelId] = useState(null);       // PI picked in the list
  const [askDel, setAskDel] = useState(null);     // PI waiting for delete confirmation
  // Clicking outside the list/toolbar or pressing Esc clears the selection.
  useEffect(() => {
    if (!selId || editing || askDel) return;
    const down = e => { if (!e.target.closest?.('tr.pick, .pi-tools, .pi-ask')) setSelId(null); };
    const key = e => { if (e.key === 'Escape') setSelId(null); };
    document.addEventListener('mousedown', down);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('mousedown', down); document.removeEventListener('keydown', key); };
  }, [selId, editing, askDel]);
  const [busyDel, setBusyDel] = useState(false);
  const [note, setNote] = useState(null);
  const doDelete = async p => {
    setBusyDel(true);
    try {
      await axios.delete(`/api/proforma-invoices/${p.piId}`, { params: { companyId } });
      setNote({ ok: true, text: `PI ${p.piNo || p.piId} deleted — its amount is free again for order ${p.orderNo}.` });
      setAskDel(null); setSelId(null); setReload(x => x + 1);
    } catch (e) { setNote({ ok: false, text: e.response?.data?.error || 'Could not delete the PI.' }); }
    finally { setBusyDel(false); }
  };
  const { search } = useLocation();
  const asked = new URLSearchParams(search).get('tab');
  const urlTab = TABS.some(t => t.key === asked) ? asked : 'list';

  const [orders, setOrders] = useState([]);
  const [pis, setPis] = useState(null);
  const [reload, setReload] = useState(0);
  const [q, setQ] = useState('');

  useEffect(() => {
    if (!companyId) return;
    axios.get('/api/sales-orders', { params: { companyId } }).then(r => setOrders(Array.isArray(r.data) ? r.data : [])).catch(() => setOrders([]));
  }, [companyId]);
  useEffect(() => {
    if (!companyId) return;
    axios.get('/api/proforma-invoices', { params: { companyId } }).then(r => setPis(Array.isArray(r.data) ? r.data : [])).catch(() => setPis([]));
  }, [companyId, reload]);

  const tab = editing ? 'create' : urlTab;

  const list = useMemo(() => {
    const w = q.toLowerCase().split(/\s+/).filter(Boolean);
    return [...(pis || [])]
      .filter(p => !w.length || w.every(x => `${p.piNo} ${p.orderNo} ${p.customerName} ${p.milestone} ${p.basisLabel || ''} ${p.customerPO || ''}`.toLowerCase().includes(x)))
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  }, [pis, q]);

  return (
    <div className="pi">
      <style>{CSS}</style>
      <div className="pi-tabs" role="tablist">
        {TABS.map((t, i) => (
          <React.Fragment key={t.key}>
            {i === 1 && <span className="pi-sep" />}
            <button type="button" role="tab" aria-selected={tab === t.key} className={`pi-tab${tab === t.key ? ' on' : ''}`} onClick={() => { setEditing(null); navigate(`/beta/proforma?tab=${t.key}`); }}>
              {t.label}{t.key === 'list' && pis && <span className="n">{pis.length}</span>}
            </button>
          </React.Fragment>
        ))}
        {tab === 'list' && <input className="pi-search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search PI no., order no., client, milestone…" aria-label="Search PIs" />}
        {tab === 'list' && (() => {
          const sp = (pis || []).find(x => x.piId === selId);
          return (
            <div className="pi-tools">
              <span className="pi-picked">{sp ? <>Selected: <b>{sp.status === 'draft' ? `Draft (${sp.orderNo})` : (sp.piNo || sp.piId)}</b></> : 'Click a PI to select it'}</span>
              <button type="button" className="pi-tbtn" disabled={!sp || sp.status === 'draft'} title={sp?.status === 'draft' ? 'A draft PI has no number yet — issue it first' : 'Print this PI'} onClick={() => doPrint(sp)}><Svg name="file" size={13} />Print</button>
              <button type="button" className="pi-tbtn" disabled={!sp} onClick={() => { setNote(null); setEditing(sp); }}><Svg name="settings" size={13} />Edit</button>
              <button type="button" className="pi-tbtn del" disabled={!sp} onClick={() => { setNote(null); setAskDel(sp); }}><Svg name="x" size={13} />Delete</button>
            </div>
          );
        })()}
      </div>

      {tab === 'list' && askDel && (
        <div className="pi-ask" role="alertdialog" aria-label="Confirm delete">
          <span><b>Delete PI {askDel.piNo || askDel.piId}</b> ({askDel.milestone || 'PI'}, ₹ {amt(askDel.amount)}) of order {askDel.orderNo}? Its amount becomes available again for a new PI.</span>
          <button type="button" className="pi-abtn" onClick={() => setAskDel(null)} disabled={busyDel}>Keep</button>
          <button type="button" className="pi-abtn danger" onClick={() => doDelete(askDel)} disabled={busyDel}>{busyDel ? 'Deleting…' : 'Yes, delete'}</button>
        </div>
      )}
      {tab === 'list' && note && <div className={`pi-msg ${note.ok ? 'ok' : 'err'}`} style={{ margin: 0 }} role="status">{note.text}</div>}

      <div className="pi-body">
        {tab === 'create'
          ? (editing
            ? <CreatePI key={editing.piId} companyId={companyId} orders={orders} onPrint={doPrint} editPi={editing} onCancelEdit={() => setEditing(null)}
              onSaved={upd => { setEditing(null); setReload(x => x + 1); setNote({ ok: true, text: upd.status === 'draft' ? `Draft PI for order ${upd.orderNo} saved — ₹ ${amt(upd.amount)}.` : editing.status === 'draft' ? `PI ${upd.piNo} issued — ₹ ${amt(upd.amount)}.` : `PI ${upd.piNo || upd.piId} updated — ₹ ${amt(upd.amount)}.` }); }} />
            : <CreatePI key="new" companyId={companyId} orders={orders} onSaved={() => setReload(x => x + 1)} onPrint={doPrint} />)
          : (
            <table className="pi-t">
              <thead><tr><th>PI No.</th><th>PI Date</th><th>Order No.</th><th>Client</th><th>Milestone</th><th>Basis</th><th className="r">% / Amount</th><th className="r">PI Amount</th><th className="r">Balance after</th></tr></thead>
              <tbody>
                {pis === null ? <tr><td colSpan={9} className="pi-empty">Loading…</td></tr>
                  : !list.length ? <tr><td colSpan={9} className="pi-empty">{q ? `No PI matches “${q}”.` : 'No proforma invoices yet.'}</td></tr>
                    : list.map(p => (
                      <tr key={p.piId} className={`pick${selId === p.piId ? ' sel' : ''}`} onClick={() => setSelId(p.piId)}
                        onDoubleClick={() => { setSelId(p.piId); setNote(null); setEditing(p); }} title="Click to select · double-click to edit" aria-selected={selId === p.piId}>
                        <td className="no">{p.status === 'draft' ? <span className="pi-dr" title="Saved as draft — not issued, no PI number yet">DRAFT</span> : (p.piNo || p.piId)}</td><td>{fdate(p.piDate || p.createdAt)}</td><td>{dash(p.orderNo)}</td><td>{dash(p.customerName)}</td>
                        <td>{dash(p.milestone)}</td><td>{p.basisLabel || 'Grand total'}</td>
                        <td className="r">{p.splitType === 'percent' ? `${n(p.splitValue)}%` : amt(p.splitValue)}</td>
                        <td className="r"><b>{amt(p.amount)}</b></td><td className="r">{p.status === 'draft' ? '—' : amt(p.balanceAfter)}</td>
                      </tr>
                    ))}
              </tbody>
              {list.length > 0 && (() => { const iss = list.filter(p => p.status !== 'draft'), dr = list.length - iss.length;
                return <tfoot><tr><td colSpan={7}>Total ({iss.length} PIs{dr ? ` · ${dr} draft${dr === 1 ? '' : 's'} not counted` : ''})</td><td className="r">{amt(iss.reduce((s, p) => s + n(p.amount), 0))}</td><td /></tr></tfoot>; })()}
            </table>
          )}
      </div>

    </div>
  );
}

// editPi set → the same form edits that PI (order and PI number stay fixed).
function CreatePI({ companyId, orders, onSaved, onPrint, editPi, onCancelEdit }) {
  const [lastPi, setLastPi] = useState(null);   // the PI just created — offered for printing
  const [order, setOrder] = useState(() => editPi
    ? (orders.find(o => o.orderId === editPi.orderId) || { orderId: editPi.orderId, orderNo: editPi.orderNo, customerName: editPi.customerName, items: [] })
    : null);
  const [bal, setBal] = useState(null);       // balance + parts + bases + nextPiNo from the server
  const [picker, setPicker] = useState(false);
  const [f, setF] = useState(() => editPi ? {
    piDate: (editPi.piDate || editPi.createdAt || today()).slice(0, 10), milestone: editPi.milestone || '', remarks: editPi.remarks || '',
    basis: editPi.basis && editPi.basis !== 'grand_total' ? editPi.basis : 'full', mode: editPi.splitType === 'amount' ? 'amount' : 'percent', value: String(editPi.splitValue ?? ''),
  } : { piDate: today(), milestone: '', basis: 'basic', mode: 'percent', value: '', remarks: '' });
  const [errs, setErrs] = useState({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const topRef = useRef(null);

  // While editing, the PI being edited is left out of "already given" so its own amount is free again.
  const loadBal = (o, piDate) => axios.get(`/api/proforma-invoices/balance/${o.orderId}`, { params: { companyId, piDate } })
    .then(r => {
      const d = r.data;
      if (editPi && d && (d.priorInvoices || []).some(x => x.piId === editPi.piId)) {
        const own = n(editPi.amount);
        setBal({ ...d, priorInvoices: d.priorInvoices.filter(x => x.piId !== editPi.piId), previouslyInvoiced: r2(d.previouslyInvoiced - own), remaining: r2(d.remaining + own) });
      } else setBal(d);
    }).catch(() => { setBal(null); setMsg({ ok: false, text: 'Could not load this order’s value.' }); });
  useEffect(() => { if (order) loadBal(order, f.piDate); }, [f.piDate]);   // eslint-disable-line react-hooks/exhaustive-deps
  // Full order (products, charges) for the PI being edited.
  useEffect(() => {
    if (!editPi) return;
    axios.get(`/api/sales-orders/${editPi.orderId}`, { params: { companyId } }).then(r => { if (r.data) setOrder(o => ({ ...o, ...r.data })); }).catch(() => {});
  }, [editPi, companyId]);

  const choose = o => { setPicker(false); setOrder(o); setBal(null); setMsg(null); setErrs({}); loadBal(o, f.piDate); };
  const set = k => e => { const val = e.target.value; setF(o => ({ ...o, [k]: val })); setErrs(o => ({ ...o, [k]: undefined })); setMsg(null); };

  const base = bal?.bases?.[f.basis];
  const baseValue = base ? r2(base.taxable + base.gst + base.other) : 0;
  const piAmount = r2(f.mode === 'percent' ? baseValue * n(f.value) / 100 : n(f.value));
  const ratio = baseValue > 0 ? piAmount / baseValue : 0;
  const over = bal ? piAmount > bal.remaining + 0.5 : false;

  const check = () => {
    const e = {};
    if (!order) e.order = 'Choose the sales order';
    if (!f.piDate) e.piDate = 'Enter the PI date';
    if (!f.milestone.trim()) e.milestone = 'Enter the milestone, e.g. 30% Advance';
    if (!(n(f.value) > 0)) e.value = f.mode === 'percent' ? 'Enter the %' : 'Enter the amount';
    else if (f.mode === 'percent' && n(f.value) > 100) e.value = 'Max 100%';
    if (over) e.value = 'More than the remaining balance';
    setErrs(e);
    return !Object.keys(e).length;
  };

  /* mode: 'draft' → save as draft (no PI number, does not use up the order value) · 'issue' → issue a draft */
  const save = async mode => {
    if (!check()) { setMsg({ ok: false, text: 'Please correct the fields marked in red.' }); return; }
    setBusy(true); setMsg(null);
    if (editPi) {
      try {
        const r = await axios.put(`/api/proforma-invoices/${editPi.piId}`, {
          companyId, piDate: f.piDate, milestone: f.milestone.trim(), remarks: f.remarks.trim(), basis: f.basis, splitType: f.mode, splitValue: n(f.value),
          ...(mode === 'issue' ? { status: 'issued' } : {}),
        }, { params: { companyId } });
        onSaved(r.data || editPi);
      } catch (e) { setMsg({ ok: false, text: e.response?.data?.error || 'Could not save the PI. Try again.' }); }
      finally { setBusy(false); }
      return;
    }
    try {
      const r = await axios.post('/api/proforma-invoices', {
        companyId, orderId: order.orderId, piDate: f.piDate, milestone: f.milestone.trim(), remarks: f.remarks.trim(),
        basis: f.basis, splitType: f.mode, splitValue: n(f.value), ...(mode === 'draft' ? { status: 'draft' } : {}),
      }, { params: { companyId } });
      const isDr = r.data?.status === 'draft';
      setLastPi(r.data && r.data.piId && !isDr ? r.data : null);
      setMsg({ ok: true, text: isDr
        ? `Draft PI saved for ₹ ${amt(r.data?.amount ?? piAmount)} (${f.milestone.trim()}) — open it from the PI list to issue it.`
        : `Proforma Invoice ${r.data?.piNo || ''} created for ₹ ${amt(r.data?.amount ?? piAmount)} (${f.milestone.trim()}).` });
      setF(o => ({ ...o, milestone: '', value: '', remarks: '' }));
      loadBal(order, f.piDate); onSaved();
      topRef.current?.scrollIntoView({ behavior: 'smooth' });
    } catch (e) {
      setMsg({ ok: false, text: e.response?.data?.error || 'Could not create the PI. Try again.' });
    } finally { setBusy(false); }
  };

  const head = (icon, title, extra) => <div className="pi-ch"><span className="ico"><Svg name={icon} size={14} /></span><b>{title}</b>{extra}</div>;
  const prior = bal?.priorInvoices || [];
  const p = bal?.parts;

  return (
    <>
      <div className="pi-hero" ref={topRef}>
        <span className="ic"><Svg name="file" size={16} /></span><h1>{editPi ? (editPi.status === 'draft' ? 'Edit Draft Proforma Invoice' : `Edit Proforma Invoice ${editPi.piNo || editPi.piId}`) : 'Create Proforma Invoice'}</h1><span className="grow" />
        <div className="pi-chip"><small>PI No.</small><b>{editPi ? (editPi.status === 'draft' ? 'Draft' : (editPi.piNo || editPi.piId)) : (bal?.nextPiNo || 'Auto')}</b></div>
      </div>
      {msg && <div className={`pi-msg ${msg.ok ? 'ok' : 'err'}`} role="status">{msg.text}
        {msg.ok && lastPi && <button type="button" className="pi-pbtn" style={{ marginLeft: 10 }} onClick={() => onPrint(lastPi)}>Print this PI</button>}</div>}

      <div className="pi-2">
        <div className="pi-card">
          {head('file', 'Sales Order')}
          <table className="pi-kv"><tbody>
            <tr><th>Sales Order <i>*</i></th><td colSpan={3}>
              <div className="pi-srch">
                <input readOnly value={order ? `${order.orderNo || order.orderId} — ${order.customerName || order.party || ''}` : ''} placeholder="Click search to choose the order"
                  className={errs.order ? 'bad' : ''} onClick={() => !busy && !editPi && setPicker(true)} />
                <button type="button" className="pi-sbtn" onClick={() => setPicker(true)} disabled={busy || !!editPi} aria-label="Search sales order"><Svg name="search" size={15} /></button>
              </div>
              {errs.order && <span className="pi-err">{errs.order}</span>}
            </td></tr>
            <tr><th>Order Date</th><td>{fdate(order?.orderDate)}</td><th>Client PO</th><td>{dash(order?.customerPO)}</td></tr>
            <tr><th>Client</th><td colSpan={3}>{dash(order?.customerName || order?.party)}</td></tr>
            <tr><th>Payment Terms</th><td colSpan={3}><b>{dash(order?.paymentTerms)}</b></td></tr>
          </tbody></table>
        </div>
        <div className="pi-card">
          {head('wallet', 'Order Value')}
          <table className="pi-kv"><tbody>
            <tr><th>Basic (products)</th><td className="r">{p ? amt(p.basic) : '—'}</td><th>GST</th><td className="r">{p ? amt(p.gst) : '—'}</td></tr>
            <tr><th>Additional charges</th><td className="r">{p ? amt(p.charges) : '—'}</td><th>Charges w/o GST</th><td className="r">{p ? amt(p.chargesNoGst) : '—'}</td></tr>
            <tr className="tot"><th>Grand total</th><td className="r">{bal ? amt(bal.orderGrandTotal) : '—'}</td><th>PI already given</th><td className="r">{bal ? amt(bal.previouslyInvoiced) : '—'}</td></tr>
            <tr className="rem"><th>Remaining to invoice</th><td className="r" colSpan={3}>₹ {bal ? amt(bal.remaining) : '—'}</td></tr>
          </tbody></table>
        </div>
      </div>

      <div className="pi-card">
        {head('box', 'Product Details', <><span className="grow" /><small>{order ? `${(order.items || []).length} product${(order.items || []).length === 1 ? '' : 's'}` : ''}</small></>)}
        {!order ? <div className="pi-empty">Choose a sales order to see its products.</div> : (() => {
          const its = (order.items || []).filter(it => it && (it.description || it.material || it.itemName));
          const ch = (order.charges || []).filter(Boolean);
          if (!its.length && !ch.length) return <div className="pi-empty">This order has no products.</div>;
          let tTax = 0, tGst = 0;
          return (
            <table className="pi-t">
              <thead><tr><th>#</th><th>Product</th><th>HSN</th><th>Due Date</th><th className="r">Qty</th><th>Unit</th><th className="r">Rate</th><th className="r">Taxable</th><th className="r">GST %</th><th className="r">GST</th><th className="r">Total</th></tr></thead>
              <tbody>
                {its.map((it, i) => {
                  const tx = n(it.qty) * n(it.rate), g = n(it.gstPercent ?? it.gst), ga = tx * g / 100;
                  tTax += tx; tGst += ga;
                  return (
                    <tr key={it._id || i}>
                      <td>{i + 1}</td><td><b>{it.description || it.material || it.itemName}</b></td><td>{dash(it.hsnCode)}</td><td>{it.dueDate ? fdate(it.dueDate) : '—'}</td>
                      <td className="r">{n(it.qty)}</td><td>{dash(it.unit)}</td><td className="r">{amt(it.rate)}</td><td className="r">{amt(tx)}</td>
                      <td className="r">{g}%</td><td className="r">{amt(ga)}</td><td className="r"><b>{amt(tx + ga)}</b></td>
                    </tr>
                  );
                })}
                {ch.map((c, i) => {
                  const tx = n(c.amount), g = c.withoutGst ? 0 : n(c.gst), ga = tx * g / 100;
                  tTax += tx; tGst += ga;
                  return (
                    <tr key={`c${i}`} className="chg">
                      <td /><td>{c.chargeType || 'Charge'}{c.description ? ` — ${c.description}` : ''}{c.withoutGst ? ' (no GST)' : ''}</td><td /><td /><td /><td /><td />
                      <td className="r">{amt(tx)}</td><td className="r">{g}%</td><td className="r">{amt(ga)}</td><td className="r"><b>{amt(tx + ga)}</b></td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot><tr><td colSpan={7}>Order total</td><td className="r">{amt(tTax)}</td><td /><td className="r">{amt(tGst)}</td><td className="r">{amt(tTax + tGst)}</td></tr></tfoot>
            </table>
          );
        })()}
      </div>

      <div className="pi-card">
        {head('ledger', 'PIs already given for this order', <><span className="grow" /><small>{order ? `${prior.length} PI${prior.length === 1 ? '' : 's'}` : ''}</small></>)}
        {!order ? <div className="pi-empty">Choose a sales order to see its PIs.</div> : prior.length ? (
          <table className="pi-t">
            <thead><tr><th>PI No.</th><th>PI Date</th><th>Milestone</th><th>Basis</th><th className="r">% / Amount</th><th className="r">Taxable</th><th className="r">GST</th><th className="r">PI Amount</th><th className="r">Balance after</th></tr></thead>
            <tbody>{prior.map(x => (
              <tr key={x.piId}>
                <td className="no">{x.piNo || x.piId}</td><td>{fdate(x.piDate || x.createdAt)}</td><td>{dash(x.milestone)}</td><td>{x.basisLabel || 'Grand total'}</td>
                <td className="r">{x.splitType === 'percent' ? `${n(x.splitValue)}%` : amt(x.splitValue)}</td>
                <td className="r">{x.breakup ? amt(x.breakup.taxable + x.breakup.other) : '—'}</td><td className="r">{x.breakup ? amt(x.breakup.gst) : '—'}</td>
                <td className="r"><b>{amt(x.amount)}</b></td><td className="r">{amt(x.balanceAfter)}</td>
              </tr>
            ))}</tbody>
            <tfoot><tr><td colSpan={7}>Total given</td><td className="r">{amt(bal.previouslyInvoiced)}</td><td className="r">{amt(bal.remaining)}</td></tr></tfoot>
          </table>
        ) : <div className="pi-empty">No PI given yet for this order.</div>}
      </div>

      <div className="pi-card">
        {head('wallet', 'Payments received for this order', <><span className="grow" /><small>{order && bal ? `₹ ${amt(bal.received)} received` : ''}</small></>)}
        {!order ? <div className="pi-empty">Choose a sales order to see payments received.</div> : (bal?.receipts || []).length ? (
          <table className="pi-t">
            <thead><tr><th>#</th><th>Date</th><th>Receipt No.</th><th>Mode</th><th>Reference</th><th>Status</th><th className="r">Amount</th></tr></thead>
            <tbody>{bal.receipts.map((r, i) => (
              <tr key={r.paymentId || i}><td>{i + 1}</td><td>{fdate(r.date)}</td><td>{dash(r.paymentId)}</td><td>{dash(r.mode)}</td><td>{dash(r.ref)}</td>
                <td style={{ textTransform: 'capitalize' }}>{dash(r.status)}</td><td className="r"><b>{amt(r.amount)}</b></td></tr>
            ))}</tbody>
            <tfoot><tr><td colSpan={6}>Total received</td><td className="r">{amt(bal.received)}</td></tr></tfoot>
          </table>
        ) : <div className="pi-empty">No payment received yet for this order.</div>}
      </div>

      <div className="pi-2">
        <div className="pi-card">
          {head(editPi ? 'settings' : 'plus', editPi ? 'Edit Proforma Invoice' : 'New Proforma Invoice')}
          <table className="pi-kv"><tbody>
            <tr><th>PI No.</th><td><input readOnly value={editPi ? (editPi.status === 'draft' ? '' : (editPi.piNo || editPi.piId)) : (bal?.nextPiNo || '')} placeholder={editPi?.status === 'draft' ? 'Given when issued' : 'Given on save'} /></td><th>PI Date <i>*</i></th><td>
              <input type="date" value={f.piDate} onChange={set('piDate')} disabled={busy} className={errs.piDate ? 'bad' : ''} />
            </td></tr>
            <tr><th>Milestone <i>*</i></th><td colSpan={3}>
              <input value={f.milestone} onChange={set('milestone')} disabled={busy} placeholder="e.g. 30% Advance, 40% Before Dispatch" className={errs.milestone ? 'bad' : ''} />
              {errs.milestone && <span className="pi-err">{errs.milestone}</span>}
              <div className="pi-chips">{MILESTONES.map(m => (
                <button key={m.label} type="button" disabled={busy} onClick={() => {
                  setF(o => ({ ...o, milestone: m.pct || !n(o.value) ? m.label : `${n(o.value)}${o.mode === 'percent' ? '%' : ''} ${m.label}`, ...(m.basis ? { basis: m.basis } : {}), ...(m.pct ? { mode: 'percent', value: m.pct } : {}) }));
                  setErrs(o => ({ ...o, milestone: undefined }));
                }}>{m.label}</button>
              ))}</div>
            </td></tr>
            <tr><th>Calculate on</th><td colSpan={3}>
              <select value={f.basis} onChange={set('basis')} disabled={busy}>
                {BASIS_ORDER.map(k => <option key={k} value={k}>{bal?.bases?.[k]?.label || k}{bal?.bases?.[k] ? ` — ₹ ${amt(bal.bases[k].taxable + bal.bases[k].gst + bal.bases[k].other)}` : ''}</option>)}
              </select>
              <span className="pi-hint">{BASIS_HINT[f.basis]}</span>
            </td></tr>
            <tr><th>{f.mode === 'percent' ? 'Percentage' : 'Amount'} <i>*</i></th><td colSpan={3}>
              <div className="pi-row">
                <div className="pi-seg" role="radiogroup" aria-label="Percent or amount">
                  <button type="button" role="radio" aria-checked={f.mode === 'percent'} className={f.mode === 'percent' ? 'on' : ''} disabled={busy} onClick={() => setF(o => ({ ...o, mode: 'percent' }))}>% of basis</button>
                  <button type="button" role="radio" aria-checked={f.mode === 'amount'} className={f.mode === 'amount' ? 'on' : ''} disabled={busy} onClick={() => setF(o => ({ ...o, mode: 'amount' }))}>Amount</button>
                </div>
                {f.mode === 'percent'
                  ? <div className="pi-pct"><input value={f.value} onChange={e => { const v = e.target.value.replace(/[^\d.]/g, ''); setF(o => ({ ...o, value: v })); setErrs(o => ({ ...o, value: undefined })); }} disabled={busy} inputMode="decimal" placeholder="30" className={errs.value ? 'bad' : ''} aria-label="Percentage" /><span>%</span></div>
                  : <input style={{ width: 180, textAlign: 'right' }} value={f.value} onChange={e => { const v = e.target.value.replace(/[^\d.]/g, ''); setF(o => ({ ...o, value: v })); setErrs(o => ({ ...o, value: undefined })); }} disabled={busy} inputMode="decimal" placeholder="0.00" className={errs.value ? 'bad' : ''} aria-label="Amount" />}
                <span className={`pi-live${over ? ' bad' : ''}`} aria-live="polite">
                  = ₹ {amt(piAmount)}{f.mode === 'amount' && baseValue > 0 && n(f.value) > 0 ? <small> ({r2(piAmount / baseValue * 100)}% of {base?.label})</small> : null}
                </span>
              </div>
              {errs.value && <span className="pi-err">{errs.value}</span>}
            </td></tr>
            <tr><th>Remarks</th><td colSpan={3}><textarea value={f.remarks} onChange={set('remarks')} disabled={busy} rows={2} placeholder="Optional" /></td></tr>
          </tbody></table>
        </div>
        <div className="pi-card">
          {head('chart', 'This PI')}
          <div className="pi-prev" aria-label="PI preview">
            <div className="row"><span>Calculated on</span><b>{base ? base.label : '—'}</b></div>
            <div className="row"><span>Basis value</span><b>{amt(baseValue)}</b></div>
            <div className="row"><span>{f.mode === 'percent' ? `${n(f.value)}% of basis` : 'Fixed amount'}</span><b>{amt(piAmount)}</b></div>
            <div className="row" style={{ marginTop: 6 }}><span>Taxable</span><b>{base ? amt(r2((base.taxable + base.other) * ratio)) : '—'}</b></div>
            <div className="row"><span>GST</span><b>{base ? amt(r2(base.gst * ratio)) : '—'}</b></div>
            <div className="row big"><span>This PI amount</span><b>₹ {amt(piAmount)}</b></div>
            <div className="row" style={{ marginTop: 8 }}><span>Add: PIs given earlier</span><b>{bal ? amt(bal.previouslyInvoiced) : '—'}</b></div>
            <div className="row"><span>Total PI amount till now</span><b>{bal ? amt(bal.previouslyInvoiced + piAmount) : '—'}</b></div>
            <div className="row"><span>Less: payments received</span><b>{bal ? `− ${amt(bal.received)}` : '—'}</b></div>
            <div className="row big pay"><span>Net payable now</span><b>₹ {bal ? amt(Math.max(0, bal.previouslyInvoiced + piAmount - bal.received)) : '—'}</b></div>
            <div className="row"><span>Order balance after this PI</span><b>{bal ? amt(bal.remaining - piAmount) : '—'}</b></div>
            {over && <div className="pi-warn">This is more than the remaining ₹ {amt(bal.remaining)} of the order.</div>}
          </div>
        </div>
      </div>

      <div className="pi-bar">
        <span className="info">{order ? <>{order.orderNo} · {f.milestone || 'New PI'} · <b>₹ {amt(piAmount)}</b>{editPi && <> · was ₹ {amt(editPi.amount)}</>}</> : 'Choose a sales order'}</span>
        {editPi
          ? <button type="button" className="pi-b ghost" disabled={busy} onClick={onCancelEdit}>Cancel</button>
          : <button type="button" className="pi-b ghost" disabled={busy} onClick={() => { setF(o => ({ ...o, milestone: '', value: '', remarks: '' })); setErrs({}); setMsg(null); }}>Clear</button>}
        {(!editPi || editPi.status === 'draft') && <button type="button" className="pi-b draft" disabled={busy || !order || (editPi && !bal)} onClick={() => save('draft')}>{busy ? 'Saving…' : editPi ? 'Save Draft' : 'Save as Draft'}</button>}
        {editPi && editPi.status === 'draft'
          ? <button type="button" className="pi-b pri" disabled={busy || !bal} onClick={() => save('issue')}>{busy ? 'Issuing…' : 'Issue PI'}</button>
          : <button type="button" className="pi-b pri" disabled={busy || !order || (editPi && !bal)} onClick={() => save()}>{editPi ? (busy ? 'Saving…' : 'Save Changes') : (busy ? 'Creating…' : 'Create PI')}</button>}
      </div>

      {picker && <OrderPicker orders={orders.filter(o => o.status !== 'cancelled')} onPick={choose} onClose={() => setPicker(false)} />}
    </>
  );
}

function OrderPicker({ orders, onPick, onClose }) {
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const inRef = useRef(null), listRef = useRef(null);
  useEffect(() => { inRef.current?.focus(); }, []);

  const list = useMemo(() => {
    const w = q.toLowerCase().split(/\s+/).filter(Boolean);
    return [...orders].sort((a, b) => String(b.orderDate || '').localeCompare(String(a.orderDate || '')))
      .filter(o => !w.length || w.every(x => `${o.orderNo} ${o.orderId} ${o.customerName || o.party} ${o.customerPO}`.toLowerCase().includes(x))).slice(0, 200);
  }, [orders, q]);
  useEffect(() => setSel(0), [q]);
  useEffect(() => { listRef.current?.querySelector('tr.sel')?.scrollIntoView({ block: 'nearest' }); }, [sel]);
  const key = e => {
    if (e.key === 'Escape') onClose();
    else if (e.key === 'ArrowDown') { e.preventDefault(); setSel(s => Math.min(s + 1, list.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel(s => Math.max(s - 1, 0)); }
    else if (e.key === 'Enter' && list[sel]) { e.preventDefault(); onPick(list[sel]); }
  };
  return (
    <div className="pi-pkb" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="pi-pk" role="dialog" aria-modal="true" aria-label="Select sales order" onKeyDown={key}>
        <div className="pi-pkh"><b>Select Sales Order</b><span className="grow" /><small>{list.length} found</small><button type="button" onClick={onClose} aria-label="Close">×</button></div>
        <div className="pi-pks"><input ref={inRef} value={q} onChange={e => setQ(e.target.value)} placeholder="Search by order no., client or client PO…" aria-label="Search orders" /></div>
        <div className="pi-pkl" ref={listRef}>
          <table className="pi-t">
            <thead><tr><th>Order No.</th><th>Date</th><th>Client</th><th>Client PO</th><th>Payment Terms</th><th className="r">Grand Total</th></tr></thead>
            <tbody>{list.length ? list.map((o, i) => (
              <tr key={o.orderId} className={i === sel ? 'sel' : ''} onMouseEnter={() => setSel(i)} onClick={() => onPick(o)}>
                <td className="no">{o.orderNo || o.orderId}</td><td>{fdate(o.orderDate)}</td><td>{dash(o.customerName || o.party)}</td>
                <td>{dash(o.customerPO)}</td><td>{dash(o.paymentTerms)}</td><td className="r">{amt(o.grandTotal)}</td>
              </tr>
            )) : <tr><td colSpan={6} className="pi-empty">Nothing matches “{q}”.</td></tr>}</tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ── Print a PI (Sales Order print style: company header centred, thin black lines, Times New Roman),
   from a hidden frame on this page ── */
const esc = v => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
const two = x => (x < 20 ? ONES[x] : `${TENS[Math.floor(x / 10)]}${x % 10 ? ' ' + ONES[x % 10] : ''}`);
const three = x => (x >= 100 ? `${ONES[Math.floor(x / 100)]} Hundred${x % 100 ? ' ' + two(x % 100) : ''}` : two(x));
/* Indian numbering: 15,04,500.50 → Fifteen Lakh Four Thousand Five Hundred Rupees and Fifty Paise Only */
export const inWords = v => {
  const rupees = Math.floor(Math.abs(v)), paise = Math.round((Math.abs(v) - rupees) * 100);
  const parts = [];
  let r = rupees;
  const cr = Math.floor(r / 10000000); r %= 10000000;
  const lk = Math.floor(r / 100000); r %= 100000;
  const th = Math.floor(r / 1000); r %= 1000;
  if (cr) parts.push(`${three(cr)} Crore`);
  if (lk) parts.push(`${two(lk)} Lakh`);
  if (th) parts.push(`${two(th)} Thousand`);
  if (r) parts.push(three(r));
  return `${parts.join(' ') || 'Zero'} Rupees${paise ? ` and ${two(paise)} Paise` : ''} Only`;
};

export async function printPI(pi, company, companyId, user) {
  const co = company || {};
  let o = {};
  try { o = (await axios.get(`/api/sales-orders/${pi.orderId}`, { params: { companyId } })).data || {}; } catch { o = {}; }
  o = await withLatestClient(o, companyId);   // buyer / consignee from the client master (latest), not the order's old copy
  let logo = '';
  if (co.logoFileName) {
    try {
      const b = (await axios.get(`/api/companies/logo/${encodeURIComponent(co.logoFileName)}`, { params: { companyId }, responseType: 'blob' })).data;
      logo = await new Promise(res => { const rd = new FileReader(); rd.onload = () => res(rd.result); rd.readAsDataURL(b); });
    } catch { logo = ''; }
  }

  // PI split: saved breakup, or (older PIs on the grand total) the order's own taxable : GST ratio
  let bk = pi.breakup;
  if (!bk) {
    const items = o.items || [], ch = o.charges || [];
    const tx = items.reduce((s, it) => s + n(it.qty) * n(it.rate), 0) + ch.reduce((s, c) => s + n(c.amount), 0);
    const g = n(o.totalGST) || items.reduce((s, it) => s + n(it.qty) * n(it.rate) * n(it.gstPercent ?? it.gst) / 100, 0);
    const k = tx + g > 0 ? n(pi.amount) / (tx + g) : 0;
    bk = { taxable: r2(tx * k), gst: r2(g * k), other: 0 };
  }
  const coState = String(co.state || '').trim().toLowerCase(), custState = String(o.customerState || '').trim().toLowerCase();
  const intra = !coState || !custState || coState === custState;
  const taxable = r2(n(bk.taxable) + n(bk.other));
  const gst = r2(n(bk.gst));
  const total = r2(n(pi.amount));
  const items = (o.items || []).filter(it => it && (it.description || it.material || it.itemName));
  const rateList = [...new Set(items.map(it => n(it.gstPercent ?? it.gst)).filter(Boolean))];
  const gstRate = rateList.length === 1 ? rateList[0] : null;
  const pct = pi.splitType === 'percent' ? `${n(pi.splitValue)}% of ${pi.basisLabel || 'order value'}` : `Fixed amount on ${pi.basisLabel || 'order value'}`;
  const d = v => { const x = v ? new Date(v) : null; return x && !isNaN(x) ? `${String(x.getDate()).padStart(2, '0')}-${String(x.getMonth() + 1).padStart(2, '0')}-${x.getFullYear()}` : ''; };


  const stateCode = g => (/^\d{2}/.test(String(g || '')) ? String(g).slice(0, 2) : '');
  const chargesAll = (o.charges || []).filter(Boolean);

  // earlier PIs of this order + money received (saved on the PI; for older PIs read live)
  let earlier = [];
  try {
    const all = (await axios.get('/api/proforma-invoices', { params: { companyId, orderId: pi.orderId } })).data || [];
    earlier = all.filter(x => x.piId !== pi.piId && x.status !== 'draft' && String(x.createdAt || '') < String(pi.createdAt || '9999'))
      .sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
  } catch { earlier = []; }
  let receipts = pi.receipts;
  if (!Array.isArray(receipts)) {
    try { receipts = (await axios.get(`/api/proforma-invoices/balance/${pi.orderId}`, { params: { companyId } })).data?.receipts || []; } catch { receipts = []; }
  }
  const orderValue = n(o.grandTotal || pi.orderGrandTotal);
  const earlierTotal = r2(earlier.reduce((s, x) => s + n(x.amount), 0));
  const received = r2(receipts.reduce((s, x) => s + n(x.amount), 0));
  const piToDate = r2(earlierTotal + total);
  const netPayable = r2(Math.max(0, piToDate - received));
  const orderBalance = r2(orderValue - piToDate);

  // order lines (products only) + value summary: Product Value → Additional Charges → Total Taxable → GST → Order Value
  const prodValue = items.reduce((s2, it) => s2 + n(it.qty) * n(it.rate), 0);
  const prodGst = items.reduce((s2, it) => s2 + n(it.qty) * n(it.rate) * n(it.gstPercent ?? it.gst) / 100, 0);
  const chGst = chargesAll.filter(c => !c.withoutGst);
  const chNoGst = chargesAll.filter(c => c.withoutGst);
  const chValue = chGst.reduce((s2, c) => s2 + n(c.amount), 0);
  const chGstAmt = chGst.reduce((s2, c) => s2 + n(c.amount) * n(c.gst) / 100, 0);
  const totalTaxable = prodValue + chValue;
  const totalGst = prodGst + chGstAmt;
  // a charge as % of the product value: the % typed on the order, else worked out from its amount (e.g. 20,500 on 20,50,000 = 1%)
  const chPct = c => {
    const p = c.mode === 'pct' && n(c.pct) > 0 ? n(c.pct) : (prodValue > 0 ? n(c.amount) / prodValue * 100 : 0);
    return p > 0 ? String(Math.round(p * 100) / 100) : '';
  };

  /* ── ERP document layout: stacked tables with real borders (no gaps / missing lines) ── */
  const tidy = t => String(t || '').replace(/\s+,/g, ',').replace(/,(\s*,)+/g, ',').replace(/\s{2,}/g, ' ').replace(/,\s*$/, '').trim();
  const baseVal = n(pi.baseValue) || (pi.splitType === 'percent' && n(pi.splitValue) > 0 ? r2(total / (n(pi.splitValue) / 100)) : 0);
  const NCOL = 9;   // Sl | Description | HSN | Due Date | Qty | Unit | Rate | GST | Amount
  const itemRows = items.map((it, i) => `<tr>
      <td class="c">${i + 1}</td><td><b>${esc(it.description || it.material || it.itemName)}</b>${it.itemCode ? `<div class="mut">Code: ${esc(it.itemCode)}</div>` : ''}</td>
      <td class="c">${esc(it.hsnCode || '')}</td><td class="c">${d(it.dueDate)}</td><td class="r">${esc(n(it.qty))}</td><td class="c">${esc(it.unit || '')}</td>
      <td class="r">${amt(it.rate)}</td><td class="c">${n(it.gstPercent ?? it.gst)}%</td><td class="r">${amt(n(it.qty) * n(it.rate))}</td></tr>`).join('');
  const sumLine = (label, value, cls = '') => `<tr class="${cls}"><td colspan="${NCOL - 1}" class="r">${label}</td><td class="r">${value}</td></tr>`;
  const party = (title, name, addr, place, gstin, state, contact) => `<div class="lbl">${title}</div>
    <div class="pn">${esc(name)}</div><div>${esc(addr || '')}</div>${place ? `<div>${esc(place)}</div>` : ''}
    <table class="kv"><tr><td>GSTIN/UIN</td><td>:</td><td><b>${esc(gstin || '—')}</b></td></tr>
      <tr><td>State</td><td>:</td><td><b>${esc(state || '—')}${stateCode(gstin) ? `, Code ${stateCode(gstin)}` : ''}</b></td></tr>
      ${contact ? `<tr><td>Contact</td><td>:</td><td>${esc(contact)}</td></tr>` : ''}</table>`;
  const histRows = Math.max(earlier.length, receipts.length, 1);
  const hist = Array.from({ length: histRows }, (_, i) => {
    const p = earlier[i], r = receipts[i];
    return `<tr>
      <td>${p ? esc(p.piNo || p.piId) : (i === 0 ? '<span class="mut">No earlier PI</span>' : '')}</td><td class="c">${p ? d(p.piDate || p.createdAt) : ''}</td><td>${p ? esc(p.milestone || '') : ''}</td><td class="r">${p ? amt(p.amount) : ''}</td>
      <td class="c">${r ? d(r.date) : (i === 0 ? '<span class="mut">No payment yet</span>' : '')}</td><td>${r ? esc(r.mode || '') : ''}</td><td>${r ? esc(r.ref || '') : ''}</td><td class="r">${r ? amt(r.amount) : ''}</td></tr>`;
  }).join('');

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Proforma Invoice ${esc(pi.piNo || pi.piId)}</title>
<style>
* { margin:0; padding:0; box-sizing:border-box; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
body { font-family:Arial, Helvetica, sans-serif; font-size:8.6pt; color:#000; background:#fff; line-height:1.3; }
table { width:100%; border-collapse:collapse; font-size:inherit; }
.doc > table { margin-top:-1px; }                     /* stacked tables share one line */
.doc > table:first-child { margin-top:0; }
.doc > table > tbody > tr > td, .doc > table > tbody > tr > th, .doc > table > thead > tr > th, .doc > table > thead > tr > td { border:1px solid #000; padding:3px 6px; vertical-align:top; }
.c { text-align:center; } .r { text-align:right; white-space:nowrap; }
.lbl { font-size:7pt; color:#333; text-transform:uppercase; letter-spacing:.4px; margin-bottom:1px; }
.val { font-size:10pt; font-weight:bold; }
.mut { font-size:7.6pt; color:#444; }
.pn { font-size:10pt; font-weight:bold; margin-bottom:1px; }
.kv td { border:0 !important; padding:0 4px 0 0 !important; vertical-align:top; }
.kv td:first-child { width:72px; color:#333; white-space:nowrap; } .kv td:nth-child(2) { width:8px; }
.co { display:flex; gap:9px; align-items:center; }
.co img { width:58px; height:58px; object-fit:contain; flex-shrink:0; }
.co .adr { margin:1px 0 2px; max-width:330px; }
.co .nm { font-size:13.5pt; font-weight:bold; }
.ttl { text-align:center; font-size:14pt; font-weight:bold; letter-spacing:3px; padding:6px 4px !important; }
.ttl small { display:block; font-size:7pt; font-weight:normal; letter-spacing:.5px; color:#333; }
.sec td { background:#EDEDED; font-weight:bold; font-size:8.4pt; letter-spacing:.4px; text-transform:uppercase; padding:3px 6px !important; }
.hd th { background:#F5F5F5; font-weight:bold; font-size:8pt; text-align:center; }
tr.fill td { height:3mm; border-top:0 !important; border-bottom:0 !important; }
.items tbody tr.it td { border-top:0 !important; border-bottom:0 !important; }
.items tbody tr.sum td { border-top:0 !important; border-bottom:0 !important; }
.items tbody tr.sum td:first-child { border-right:0 !important; }
tr.st td { font-weight:bold; }
.cur tbody tr.it td { padding-top:4px !important; padding-bottom:4px !important; }
.cur tr.tot td { font-weight:bold; font-size:9.6pt; background:#F7F7F7; }
tr.gt td { font-weight:bold; font-size:10pt; border-top:1px solid #000 !important; }
tr.net td { font-weight:bold; font-size:12pt; padding:6px 6px !important; background:#F2F2F2; }
.words { font-size:9pt; }
.sig { height:20mm; text-align:right; vertical-align:bottom !important; }
.jur { text-align:center; font-size:7.6pt; margin-top:3px; }
.pby { display:flex; justify-content:space-between; font-size:7pt; color:#555; margin-top:2px; }
@media print { @page { margin:7mm 8mm; size:A4 portrait; } tr { break-inside:avoid; } }
</style></head><body><div class="doc">

<!-- header -->
<table>
  <colgroup><col style="width:56%"><col style="width:22%"><col style="width:22%"></colgroup>
  <tbody>
    <tr><td rowspan="4" style="vertical-align:middle"><div class="co">${logo ? `<img src="${logo}" alt="">` : ''}<div>
        <div class="nm">${esc(co.companyName)}</div>
        <div class="adr">${esc(tidy([co.address, co.city].filter(Boolean).join(', ')))}${co.state || co.pincode ? `, ${esc([co.state, co.pincode].filter(Boolean).join(' - '))}` : ''}</div>
        <div>GSTIN/UIN: <b>${esc(co.gstin || '—')}</b>${stateCode(co.gstin) ? ` &nbsp;·&nbsp; State Code: <b>${stateCode(co.gstin)}</b>` : ''}</div>
        <div>PAN: <b>${esc(co.pan || '—')}</b></div>
        <div>${esc([co.phone && 'Ph: ' + co.phone, co.email && 'E-mail: ' + co.email].filter(Boolean).join('  |  '))}</div></div></div></td>
      <td colspan="2" class="ttl">PROFORMA INVOICE<small>(Not a Tax Invoice)</small></td></tr>
    <tr><td><div class="lbl">PI No.</div><div class="val">${esc(pi.piNo || pi.piId)}</div></td><td><div class="lbl">PI Date</div><div class="val">${d(pi.piDate || pi.createdAt)}</div></td></tr>
    <tr><td><div class="lbl">Sales Order No.</div><b>${esc(o.orderNo || pi.orderNo || '—')}</b></td><td><div class="lbl">SO Date</div><b>${d(o.orderDate) || '—'}</b></td></tr>
    <tr><td><div class="lbl">Buyer's PO No.</div><b>${esc(o.customerPO || '—')}</b></td><td><div class="lbl">PO Date</div><b>${d(o.poDate) || '—'}</b></td></tr>
  </tbody>
</table>

<!-- parties -->
<table>
  <colgroup><col style="width:36%"><col style="width:36%"><col style="width:28%"></colgroup>
  <tbody><tr>
    <td>${party('Buyer (Bill To)', o.customerName || pi.customerName, o.address, [o.customerCity, o.customerPincode].filter(Boolean).join(' - '), o.customerGstin, o.customerState, [o.billToContact || o.contactPerson, o.billToMobile || o.mobile].filter(Boolean).join(', '))}</td>
    <td>${party('Consignee (Ship To)', o.shipToName || o.customerName || '', o.shipToAddress || o.address, [o.shipToCity, o.shipToPincode].filter(Boolean).join(' - '), o.shipToGstin || o.customerGstin, o.shipToState || o.customerState, [o.shipToContact, o.shipToMobile].filter(Boolean).join(', '))}</td>
    <td><div class="lbl">Milestone</div><div class="val">${esc(pi.milestone || '—')}</div>
      <div class="lbl" style="margin-top:5px">Payment Terms</div><div><b>${esc(o.paymentTerms || '—')}</b></div></td>
  </tr></tbody>
</table>

<!-- order items + order value -->
<table class="items">
  <colgroup><col style="width:24px"><col><col style="width:58px"><col style="width:64px"><col style="width:42px"><col style="width:38px"><col style="width:82px"><col style="width:38px"><col style="width:92px"></colgroup>
  <thead class="hd"><tr><th>Sl</th><th>Description of Goods</th><th>HSN/SAC</th><th>Due Date</th><th>Qty</th><th>Unit</th><th>Rate</th><th>GST</th><th>Amount (₹)</th></tr></thead>
  <tbody>
    ${itemRows.replace(/<tr>/g, '<tr class="it">') || `<tr class="it"><td colspan="${NCOL}" class="c mut">No products</td></tr>`}
    <tr class="fill" id="fillrow"><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
    <tr class="gt"><td colspan="${NCOL - 1}" class="r">Product Value</td><td class="r">${amt(prodValue)}</td></tr>
    ${chGst.map(c => sumLine(`Add: ${esc(c.chargeType || 'Charges')}${c.description && !/% of taxable$/.test(c.description) ? ` — ${esc(c.description)}` : ''}${chPct(c) ? ` <span class="mut">(${chPct(c)}% of product value)</span>` : ''}`, amt(c.amount), 'sum')).join('')}
    ${sumLine('Total Taxable Value', amt(totalTaxable), 'sum st')}
    ${sumLine(`Add: GST ${intra ? '(CGST + SGST)' : '(IGST)'}`, amt(totalGst), 'sum')}
    ${chNoGst.map(c => sumLine(`Add: ${esc(c.description || c.chargeType || 'Charges')} <span class="mut">(no GST)</span>`, amt(c.amount), 'sum')).join('')}
    <tr class="gt"><td colspan="${NCOL - 1}" class="r">ORDER VALUE</td><td class="r">₹ ${amt(orderValue)}</td></tr>
  </tbody>
</table>

<!-- history: earlier PIs | payments received -->
<table>
  <colgroup><col style="width:15%"><col style="width:11%"><col style="width:14%"><col style="width:10%"><col style="width:11%"><col style="width:12%"><col style="width:15%"><col style="width:12%"></colgroup>
  <tbody>
    <tr class="sec"><td colspan="4">Proforma Invoices raised earlier</td><td colspan="4">Payments received till date</td></tr>
    <tr class="hd"><th>PI No.</th><th>Date</th><th>Milestone</th><th>Amount</th><th>Date</th><th>Mode</th><th>Reference</th><th>Amount</th></tr>
    ${hist}
    <tr class="st"><td colspan="3" class="r">Total</td><td class="r">${amt(earlierTotal)}</td><td colspan="3" class="r">Total</td><td class="r">${amt(received)}</td></tr>
  </tbody>
</table>

<!-- this PI -->
<table class="cur">
  <colgroup><col style="width:24px"><col><col style="width:92px"><col style="width:48px"><col style="width:92px"><col style="width:112px"><col style="width:100px"></colgroup>
  <thead>
    <tr class="sec"><td colspan="7">Current Proforma Invoice — ${esc(pi.milestone || 'Payment')}</td></tr>
    <tr class="hd"><th>Sl</th><th>Particulars</th><th>Basis Value</th><th>%</th><th>Taxable Value</th><th>${intra ? 'CGST + SGST' : 'IGST'}</th><th>Amount (₹)</th></tr>
  </thead>
  <tbody>
    <tr class="it">
      <td class="c">1</td>
      <td><b>${esc(pi.milestone || 'Payment')}</b> against Sales Order ${esc(o.orderNo || pi.orderNo || '')}
        <div class="mut">Calculated on ${esc(pi.basisLabel || 'order value')}${pi.splitType === 'percent' ? '' : ' (fixed amount)'}</div></td>
      <td class="r">${baseVal ? amt(baseVal) : '—'}</td>
      <td class="c">${pi.splitType === 'percent' ? `${n(pi.splitValue)}%` : (baseVal ? `${r2(total / baseVal * 100)}%` : '—')}</td>
      <td class="r">${amt(taxable)}</td>
      <td class="r">${gst > 0 ? (intra
        ? `<div><span class="mut">CGST${gstRate ? ` ${gstRate / 2}%` : ''}</span> ${amt(gst / 2)}</div><div><span class="mut">SGST${gstRate ? ` ${gstRate / 2}%` : ''}</span> ${amt(gst / 2)}</div>`
        : `${amt(gst)}`) : '—'}</td>
      <td class="r"><b>${amt(total)}</b></td>
    </tr>
    <tr class="tot"><td colspan="4" class="r">Total</td><td class="r">${amt(taxable)}</td><td class="r">${amt(gst)}</td><td class="r">₹ ${amt(total)}</td></tr>
  </tbody>
</table>

<!-- amount payable -->
<table>
  <colgroup><col style="width:26px"><col><col style="width:150px"></colgroup>
  <tbody>
    <tr class="sec"><td colspan="3">Amount Payable</td></tr>
    <tr><td class="c">A</td><td>Order Value (incl. GST)</td><td class="r">${amt(orderValue)}</td></tr>
    <tr><td class="c">B</td><td>Proforma Invoices raised earlier</td><td class="r">${amt(earlierTotal)}</td></tr>
    <tr><td class="c">C</td><td>This Proforma Invoice (${esc(pi.milestone || '')})</td><td class="r">${amt(total)}</td></tr>
    <tr class="st"><td class="c">D</td><td>Total PI amount till now (B + C)</td><td class="r">${amt(piToDate)}</td></tr>
    <tr><td class="c">E</td><td>Less: Payments received till date</td><td class="r">(−) ${amt(received)}</td></tr>
    <tr class="net"><td></td><td>NET AMOUNT PAYABLE NOW (D − E)</td><td class="r">₹ ${amt(netPayable)}</td></tr>
    <tr><td></td><td class="mut">Order balance for future PIs (A − D)</td><td class="r mut">${amt(orderBalance)}</td></tr>
    <tr><td colspan="3" class="words">Amount payable (in words): <b>INR ${esc(inWords(netPayable).replace(' Rupees', ''))}</b></td></tr>
  </tbody>
</table>

<!-- bank | signature -->
<table>
  <colgroup><col style="width:56%"><col></colgroup>
  <tbody><tr>
    <td><div class="lbl">Company's Bank Details</div>
      <table class="kv"><tr><td>Bank Name</td><td>:</td><td><b>${esc(co.bankName || '—')}</b></td></tr>
        <tr><td>A/c No.</td><td>:</td><td><b>${esc(co.bankAccount || co.accountNo || '—')}</b></td></tr>
        <tr><td>IFS Code</td><td>:</td><td><b>${esc(co.bankIfsc || co.ifsc || '—')}</b></td></tr>
        <tr><td>A/c Name</td><td>:</td><td><b>${esc(co.companyName || '')}</b></td></tr></table>
      ${pi.remarks ? `<div style="margin-top:4px"><span class="lbl">Remarks:</span> ${esc(pi.remarks)}</div>` : ''}
      <div class="lbl" style="margin-top:5px">Declaration</div>
      <div class="mut">This Proforma Invoice is issued for payment as per the agreed terms; it is not a tax invoice. Please quote PI No. ${esc(pi.piNo || pi.piId)} with your payment.</div></td>
    <td class="sig"><div style="height:100%; display:flex; flex-direction:column; justify-content:space-between;"><b>for ${esc(co.companyName)}</b><span>Authorised Signatory</span></div></td>
  </tr></tbody>
</table>
</div>
<div class="jur"><b>SUBJECT TO AHMEDABAD JURISDICTION</b> &nbsp;·&nbsp; This is a Computer Generated Document</div>
<div class="pby"><span>${brandLine(user)}</span><span>Printed: ${esc(new Date().toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }))}</span></div>
</body></html>`;

  document.getElementById('pi-print-frame')?.remove();
  const fr = document.createElement('iframe');
  fr.id = 'pi-print-frame';
  // laid out at the A4 printable width (210 − 2×8 mm) so its height can be measured
  fr.style.cssText = 'position:fixed;left:-10000px;top:0;width:194mm;height:283mm;border:0;visibility:hidden';
  document.body.appendChild(fr);
  const w = fr.contentWindow;
  w.document.open(); w.document.write(html); w.document.close();
  setTimeout(() => {
    /* one page when it nearly fits: shrink up to 25% to keep it on a single A4 sheet (a PI with a few products);
       a long product list still runs on to a second page instead of becoming unreadably small */
    try {
      const doc = w.document, probe = doc.createElement('div');
      probe.style.cssText = 'position:absolute;visibility:hidden;height:281mm;width:1px';
      doc.body.appendChild(probe);
      const pageH = probe.getBoundingClientRect().height; probe.remove();
      const h = doc.body.scrollHeight;
      if (pageH > 0 && h > pageH && pageH / h >= 0.75) doc.body.style.zoom = String(Math.floor(pageH / h * 1000) / 1000);
      else if (h <= pageH) fillBody(doc, 283);   // shorter than a page → the blank row grows so it fills the A4 sheet
    } catch { /* print as is */ }
    const poRef = [o.customerPO, o.poDate && `dt. ${d(o.poDate)}`].filter(Boolean).join(' ');
    previewFrame(fr, undefined, {   // the preview: Sign · Email · Save PDF · Print
      sign: pi.piId ? { type: 'proforma', id: pi.piId, perm: 'salesBill' } : null,
      reprint: () => printPI(pi, company, companyId, user),
      to: o.billToEmail || o.email || undefined,
      mail: {
        subject: `Proforma Invoice ${pi.piNo || pi.piId} for payment${o.customerPO ? ` – your PO ${poRef}` : ''} – ${prodText(items.map(it => it.description || it.material || it.itemName))}`,
        message: `Dear ${o.billToContact || o.contactPerson || 'Sir / Madam'},\n\nPlease find attached our Proforma Invoice ${pi.piNo || pi.piId} for ₹ ${amt(total)} (${pct})${o.customerPO ? ` against your purchase order ${poRef}` : ''}.\n\nKindly release the payment and share the transaction details so that we can proceed further.`,
        summary: [['Proforma invoice', `${pi.piNo || pi.piId}  ·  ${d(pi.piDate || pi.createdAt)}`], ['Your PO', poRef], ['Our sales order', o.orderNo || ''], ['For', pct], ['Amount payable', `₹ ${amt(total)}`]],
      },
    });
  }, 400);
}
