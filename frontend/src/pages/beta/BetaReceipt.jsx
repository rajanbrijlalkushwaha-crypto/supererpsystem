/* Beta — Receipt (money received from a client).
 * Flow: Date → Account (bank / cash it came into) → Client → the client's sales orders, each with
 * the PIs raised on it → type how much of this receipt goes to each order (one cheque / transfer
 * can cover several orders) → mode, transaction / cheque date and number → Draft, Save or Send for Approval.
 * Saves the same records as the classic receipt: one `receipt` per order in /api/accounts/payments,
 * so order dues, ledgers and the PI "payments received" keep working. Rows of one receipt share a receiptGroup. */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { useLocation, useNavigate } from 'react-router-dom';
import { useCompany } from '../../context/CompanyContext';
import { useAuth } from '../../context/AuthContext';
import { can } from '../../utils/permissions';
import { Svg } from '../../components/ui/Icon';
import { printReceiptList, printReceiptAdvice } from './BetaReceiptPrint';

const TEAL = '#03444f';
const F = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
const HEAD = 'linear-gradient(90deg, #1B7682 0%, #3C9AA4 100%)';
const MODES = ['Bank Transfer', 'NEFT', 'RTGS', 'Cheque', 'UPI', 'DD'];
const TABS = [{ key: 'create', label: 'Create Receipt' }, { key: 'list', label: 'Receipt List' }];

const n = v => parseFloat(v) || 0;
const r2 = v => Math.round(v * 100) / 100;
const AMT_FMT = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const amt = v => AMT_FMT.format(Number(v) || 0);
const DATE_FMT = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
const fdate = d => { if (!d) return '—'; const x = new Date(d); return isNaN(x) ? String(d) : DATE_FMT.format(x); };
const today = () => new Date().toISOString().slice(0, 10);
const dash = v => (v == null || String(v).trim() === '' ? '—' : v);
const norm = v => String(v || '').toLowerCase().trim();
const clientName = c => c.companyName || c.clientName || '';

/* order value — the saved grand total, else rebuilt from items + charges (same as the classic receipt) */
const orderValue = o => {
  const gt = n(o.grandTotal);
  if (gt > 0) return gt;
  const items = (o.items || []).reduce((s, it) => s + n(it.qty || it.quantity) * n(it.rate) * (1 + n(it.gstPercent ?? it.gst) / 100), 0);
  const chg = (o.charges || []).reduce((s, c) => s + n(c.amount) * (1 + (c.withoutGst ? 0 : n(c.gst)) / 100), 0);
  return r2(items + chg);
};
const counts = p => p.type === 'receipt' && !['rejected', 'draft'].includes(p.status);   // money that is in (or awaiting approval)

const CSS = `
.rc { display:flex; flex-direction:column; height:100%; min-height:0; font-family:${F}; }
.rc-tabs { display:flex; align-items:center; gap:6px; height:40px; padding:0 6px; flex-shrink:0; background:#E3EEEF; border-bottom:1px solid #C9DCDE; }
.rc-tab { height:29px; padding:0 14px; white-space:nowrap; flex-shrink:0; border:1px solid #B9D0D3; border-radius:6px; background:#fff; cursor:pointer; box-shadow:0 1px 2px rgba(16,24,40,.08);
  display:flex; align-items:center; gap:6px; font:600 12.5px ${F}; color:${TEAL}; }
.rc-tab:hover { background:#F0F7F7; border-color:${TEAL}; }
.rc-tab.on { background:${TEAL}; border-color:${TEAL}; color:#fff; }
.rc-tab .n { min-width:18px; height:17px; padding:0 5px; border-radius:99px; font-size:10.5px; line-height:17px; text-align:center; background:rgba(3,68,79,.12); }
.rc-tab.on .n { background:rgba(255,255,255,.22); }
.rc-sep { width:1px; height:18px; background:#C9DCDE; margin:0 4px; }
.rc .rc-search { margin-left:8px; width:320px; flex:0 0 320px; height:29px; padding:0 9px; border:1px solid #B9D0D3; border-radius:6px; }
.rc-list th { position:sticky; top:0; z-index:1; }
.rc-list tbody td { border-bottom:1px solid #E4ECEE; background:#fff; white-space:nowrap; }
.rc-list tbody tr.gs td { border-top:1px solid #C9DCDE; }
.rc-list tbody tr { cursor:pointer; } .rc-list tbody tr:hover td { background:#EAF4F5; }
.rc-list tbody tr.sel td { background:#D4EBEE !important; }
.rc-list tbody tr.sel td.lead { box-shadow:inset 3px 0 0 ${TEAL}; }
.rc-tools { display:flex; align-items:center; gap:6px; margin-left:auto; padding-left:10px; flex-shrink:0; }
.rc-picked { font-size:12px; color:#667085; white-space:nowrap; margin-right:4px; } .rc-picked b { color:${TEAL}; font-family:ui-monospace, Consolas, monospace; }
.rc-tbtn { height:29px; padding:0 12px; display:inline-flex; align-items:center; gap:5px; border:1px solid ${TEAL}; border-radius:6px; background:#fff; color:${TEAL}; cursor:pointer; font:600 12.5px ${F}; white-space:nowrap; }
.rc-tbtn:hover:not(:disabled) { background:${TEAL}; color:#fff; } .rc-tbtn:disabled { opacity:.45; cursor:default; }
.rc-badge { display:inline-grid; place-items:center; width:20px; height:20px; border-radius:50%; color:#fff; font-size:11px; font-weight:700; }
.rc-t .c { text-align:center; }
.rc-list td.rmk { white-space:normal; max-width:260px; color:#475467; }
.rc-ov { position:fixed; inset:0; z-index:1500; background:rgba(2,24,28,.45); display:flex; align-items:center; justify-content:center; padding:2vh 16px; }
.rc.rc-popbox { width:100%; max-width:1240px; height:auto; max-height:96vh; background:#EEF4F4; border:1px solid #9DBDC1; box-shadow:0 20px 60px rgba(0,0,0,.35); overflow:hidden; }
.rc-x { width:28px; height:28px; border:1px solid rgba(255,255,255,.35); background:rgba(255,255,255,.1); color:#fff; cursor:pointer; font-size:18px; line-height:1; border-radius:2px; }
.rc-x:hover { background:rgba(255,255,255,.22); }
.rc-t tbody tr.pre td { background:#FFFBEB; } .rc-t tbody tr.pre td:first-child { box-shadow:inset 3px 0 0 #F79009; }
.rc-mode { display:flex; height:24px; margin-left:10px; border:1px solid rgba(255,255,255,.4); border-radius:4px; overflow:hidden; }
.rc-mode button { border:0; padding:0 10px; background:rgba(255,255,255,.08); color:#fff; cursor:pointer; font:600 11.5px ${F}; white-space:nowrap; }
.rc-mode button + button { border-left:1px solid rgba(255,255,255,.4); } .rc-mode button.on { background:#fff; color:${TEAL}; }
.rc-lines td { padding:4px 5px; vertical-align:top; } .rc-lines th { padding:7px 5px; }
.rc-lines input, .rc-lines select { height:28px; }
.rc-lines .rc-in.wide { width:100% !important; }
.rc-lines tr.bad-row td { background:#FFFBFA; }
.rc-lines tfoot td { vertical-align:middle; }
.rc-del { width:24px; height:24px; border:1px solid #F5C2C0; border-radius:4px; background:#fff; color:#B42318; cursor:pointer; font-size:15px; line-height:1; margin-top:2px; }
.rc-del:hover:not(:disabled) { background:#B42318; color:#fff; } .rc-del:disabled { opacity:.35; cursor:default; }
.rc-add { height:28px; padding:0 12px; border:1px dashed ${TEAL}; border-radius:4px; background:#fff; color:${TEAL}; cursor:pointer; font:600 12px ${F}; }
.rc-add:hover { background:#E8F3F4; }
.rc-hint { margin-left:10px; font-size:11px; font-weight:500; color:#667085; }
.rc-ls { color:${TEAL}; }
.rc-body { flex:1; min-height:0; overflow-y:auto; background:#EEF4F4; }
.rc-hero { display:flex; align-items:center; gap:10px; padding:8px 14px; background:${HEAD}; color:#fff; }
.rc-hero .ic { width:28px; height:28px; display:grid; place-items:center; background:rgba(255,255,255,.14); border:1px solid rgba(255,255,255,.22); border-radius:2px; }
.rc-hero h1 { margin:0; font-size:15px; } .rc-hero .grow { flex:1; }
.rc-chip { display:flex; align-items:center; gap:8px; padding:3px 10px; background:rgba(255,255,255,.12); border:1px solid rgba(255,255,255,.22); border-radius:2px; }
.rc-chip small { font-size:10.5px; text-transform:uppercase; letter-spacing:.6px; opacity:.75; } .rc-chip b { font-size:13.5px; font-variant-numeric:tabular-nums; }
.rc-card { background:#fff; border-top:1px solid #B9CED1; border-bottom:1px solid #B9CED1; margin-bottom:10px; }
.rc-ch { display:flex; align-items:center; gap:9px; padding:6px 10px; background:${HEAD}; color:#fff; }
.rc-ch .ico { width:22px; height:22px; display:grid; place-items:center; background:rgba(255,255,255,.16); border-radius:2px; }
.rc-ch b { font-size:13px; } .rc-ch small { font-size:11.5px; opacity:.9; } .rc-ch .grow { flex:1; }
.rc-kv { width:100%; border-collapse:collapse; table-layout:fixed; font-size:12.5px; }
.rc-kv th { width:150px; padding:7px 10px; background:#F4F8F8; border:1px solid #DCE6E8; text-align:left; font-weight:600; color:#344054; vertical-align:middle; }
.rc-kv th i { color:#D92D20; font-style:normal; }
.rc-kv td { padding:5px 8px; border:1px solid #DCE6E8; color:#101828; vertical-align:middle; }
.rc-kv tr:first-child > * { border-top:none; } .rc-kv tr > :first-child { border-left:none; } .rc-kv tr > :last-child { border-right:none; } .rc-kv tr:last-child > * { border-bottom:none; }
.rc input, .rc select, .rc textarea { height:30px; padding:0 9px; border:1px solid #C9D7DA; border-radius:2px; background:#fff; outline:none; font:400 12.5px ${F}; color:#101828; width:100%; box-sizing:border-box; }
.rc textarea { height:auto; min-height:44px; padding:6px 9px; resize:vertical; }
.rc input:focus, .rc select:focus, .rc textarea:focus { border-color:${TEAL}; box-shadow:0 0 0 3px rgba(3,68,79,.12); }
.rc input[readonly] { background:#F2F6F6; color:#475467; }
.rc .bad { border-color:#D92D20 !important; background:#FFFBFA; }
.rc-err { display:block; font-size:10.5px; color:#D92D20; margin-top:2px; }
.rc-srch { display:flex; } .rc-srch input { cursor:pointer; }
.rc-sbtn { width:34px; height:30px; flex-shrink:0; border:1px solid ${TEAL}; border-radius:0 2px 2px 0; background:${TEAL}; color:#fff; cursor:pointer; display:grid; place-items:center; }
.rc-sub { font-size:11.5px; color:#667085; margin-top:3px; }
.rc-t { width:100%; border-collapse:collapse; font-size:12.5px; }
.rc-t th { background:#D4EBEE; color:#000; font-weight:700; font-size:11.5px; text-align:left; padding:7px 8px; border-bottom:1px solid #A9CDD2; white-space:nowrap; }
.rc-t td { padding:6px 8px; border-bottom:1px solid #EDF2F3; color:#101828; vertical-align:middle; }
/* thin black lines between columns */
.rc-t th { border-right:1px solid #A9CDD2; }
.rc-t td { border-right:1px solid #000; }
.rc-t .r { text-align:right; font-variant-numeric:tabular-nums; white-space:nowrap; }
.rc-t tbody tr.on td { background:#F0F8F8; }
.rc-t tfoot td { font-weight:700; background:#E3EEEF; border-top:1px solid #C9DCDE; }
.rc-t .no { font-weight:600; color:${TEAL}; font-family:ui-monospace, Consolas, monospace; font-size:12px; }
.rc-pis { display:flex; flex-direction:column; gap:1px; font-size:11.5px; }
.rc-pis span { white-space:nowrap; } .rc-pis b { font-family:ui-monospace, Consolas, monospace; font-weight:600; color:${TEAL}; }
.rc-mut { color:#98A2B3; }
.rc-due { color:#B54708; font-weight:600; }
.rc-in { width:130px !important; text-align:right; font-variant-numeric:tabular-nums; font-weight:600 !important; }
.rc-warn { display:block; font-size:10.5px; color:#B54708; margin-top:2px; white-space:nowrap; }
.rc-empty { padding:16px; text-align:center; color:#98A2B3; font-size:12.5px; }
.rc-msg { margin:8px 10px; padding:9px 12px; font-size:12.5px; font-weight:500; }
.rc-msg.ok { background:#E6F4EA; color:#1E7B34; border:1px solid #B7E1C1; } .rc-msg.err { background:#FDECEC; color:#B42318; border:1px solid #F5C2C0; }
.rc-bar { position:sticky; bottom:0; display:flex; align-items:center; gap:8px; padding:10px 16px; background:rgba(255,255,255,.97); border-top:1px solid #D7E3E5; box-shadow:0 -4px 14px rgba(16,24,40,.06); }
.rc-bar .info { flex:1; font-size:12.5px; color:#667085; } .rc-bar .info b { color:${TEAL}; font-size:15px; }
.rc-b { height:36px; padding:0 18px; border-radius:2px; cursor:pointer; font:600 13px ${F}; border:1px solid transparent; }
.rc-b.ghost { background:#fff; border-color:#C9D7DA; color:#344054; } .rc-b.mid { background:#fff; border-color:${TEAL}; color:${TEAL}; }
.rc-b.pri { background:${TEAL}; color:#fff; } .rc-b:disabled { opacity:.55; cursor:default; }
.rc-pkb { position:fixed; inset:0; z-index:1600; background:rgba(2,24,28,.45); display:flex; align-items:flex-start; justify-content:center; padding:8vh 16px; font-family:${F}; }
.rc-pk { width:100%; max-width:980px; max-height:78vh; display:flex; flex-direction:column; background:#fff; border:1px solid #9DBDC1; box-shadow:0 20px 60px rgba(0,0,0,.35); }
.rc-pkh { display:flex; align-items:center; gap:10px; padding:9px 12px; background:${HEAD}; color:#fff; } .rc-pkh .grow { flex:1; }
.rc-pkh button { width:26px; height:26px; border:1px solid rgba(255,255,255,.35); background:rgba(255,255,255,.1); color:#fff; cursor:pointer; font-size:16px; }
.rc-pks { padding:9px 12px; border-bottom:1px solid #DCE6E8; } .rc-pks input { height:32px; }
.rc-pkl { overflow-y:auto; } .rc-pkl td { cursor:pointer; } .rc-pkl tr.sel td { background:#E1EFF0 !important; }
`;

/* preset = { orderId } opens just the receipt form in a pop-up for that order's client (used from Dues);
   onSaved(text) runs after it is saved, onClose closes the pop-up. */
export default function BetaReceipt({ preset = null, onClose, onSaved } = {}) {
  const { selectedCompany } = useCompany() || {};
  const companyId = selectedCompany?.companyId;
  const navigate = useNavigate();
  const { search } = useLocation();
  const asked = new URLSearchParams(search).get('tab');
  const [editing, setEditing] = useState(null);   // receipt (its records) open in the form for editing
  const tab = preset || editing ? 'create' : (TABS.some(t => t.key === asked) ? asked : 'create');
  const [q, setQ] = useState('');
  const [selKey, setSelKey] = useState(null);      // receipt picked in the list
  const { user } = useAuth() || {};

  const [banks, setBanks] = useState([]);
  const [clients, setClients] = useState([]);
  const [clientsReady, setClientsReady] = useState(false);
  const [orders, setOrders] = useState([]);
  const [pis, setPis] = useState([]);
  const [payments, setPayments] = useState([]);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!companyId) return;
    const get = u => axios.get(u, { params: { companyId } }).then(r => (Array.isArray(r.data) ? r.data : [])).catch(() => []);
    get('/api/accounts/banks').then(b => setBanks(b.filter(x => x.status !== 'inactive')));
    get('/api/clients').then(c => { setClients(c); setClientsReady(true); });
    get('/api/sales-orders').then(setOrders);
    get('/api/proforma-invoices').then(setPis);
  }, [companyId]);
  useEffect(() => {
    if (!companyId) return;
    axios.get('/api/accounts/payments', { params: { companyId } }).then(r => setPayments(Array.isArray(r.data) ? r.data : [])).catch(() => setPayments([]));
  }, [companyId, reload]);

  const [f, setF] = useState({ date: today(), account: '', mode: 'Bank Transfer', txnDate: today(), refNo: '', notes: '' });
  const [client, setClient] = useState(null);
  const [alloc, setAlloc] = useState({});          // orderId → amount typed
  const [picker, setPicker] = useState(false);
  const [errs, setErrs] = useState({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const topRef = useRef(null);
  const set = k => e => { const v = e.target.value; setF(o => ({ ...o, [k]: v })); setErrs(o => ({ ...o, [k]: undefined })); setMsg(null); };

  // one bank → pick it by default
  useEffect(() => { if (!f.account && banks.length === 1) setF(o => ({ ...o, account: String(banks[0].bankId) })); }, [banks, f.account]);
  const isCash = f.account === 'cash';
  const mode = isCash ? 'Cash' : f.mode;

  /* the chosen client's sales orders with PIs, received and balance */
  const rows = useMemo(() => {
    if (!client) return [];
    const cn = norm(clientName(client));
    // while editing, the receipt's own records are not "received already", and its orders show even if cancelled since
    const own = new Set((editing || []).map(p => String(p.paymentId)));
    const ownOrders = new Set((editing || []).map(p => String(p.orderId)));
    return orders
      .filter(o => (o.status !== 'cancelled' || ownOrders.has(String(o.orderId))) && (String(o.clientId || o.customerCode || '') === String(client.clientId) || norm(o.customerName) === cn || ownOrders.has(String(o.orderId))))
      .map(o => {
        const value = orderValue(o);
        const myPis = pis.filter(p => String(p.orderId) === String(o.orderId) && p.status !== 'draft').sort((a, b) => String(a.piDate || a.createdAt || '').localeCompare(String(b.piDate || b.createdAt || '')));
        const piTotal = r2(myPis.reduce((s, p) => s + n(p.amount), 0));
        const received = r2(payments.filter(p => counts(p) && !own.has(String(p.paymentId)) && String(p.orderId) === String(o.orderId)).reduce((s, p) => s + n(p.amount), 0));
        return { id: String(o.orderId), o, value, pis: myPis, piTotal, received, piDue: r2(Math.max(0, piTotal - received)), bal: r2(value - received) };
      })
      .sort((a, b) => String(b.o.orderDate || '').localeCompare(String(a.o.orderDate || '')));
  }, [client, orders, pis, payments, editing]);

  /* Multiple payments: one line per bank entry (own date, mode, UTR / cheque, amount, order) — each line saves as its own receipt */
  const [multi, setMulti] = useState(false);
  const [lines, setLines] = useState([]);
  const newLine = (orderId = '') => ({ k: `${Date.now()}-${Math.random()}`, orderId: String(orderId || ''), date: today(), mode: 'Bank Transfer', ref: '', amount: '', notes: '' });
  const filled = lines.filter(l => n(l.amount) > 0);
  const lineSum = useMemo(() => { const m = {}; lines.forEach(l => { if (n(l.amount) > 0 && l.orderId) m[l.orderId] = (m[l.orderId] || 0) + n(l.amount); }); return m; }, [lines]);
  const defaultOrder = () => String(preset?.orderId || rows.find(r => n(alloc[r.id]) > 0)?.id || (rows.length === 1 ? rows[0].id : '') || '');
  const setMultiMode = on => {
    setMulti(on); setErrs({}); setMsg(null);
    if (on && !lines.length) { const d = defaultOrder(); setLines([newLine(d), newLine(d), newLine(d)]); }
  };
  const setLine = (k, key) => e => {
    const v = key === 'amount' ? e.target.value.replace(/[^\d.]/g, '') : e.target.value;
    setLines(ls => ls.map(l => (l.k === k ? { ...l, [key]: v } : l)));
    setErrs(o => ({ ...o, lines: undefined, alloc: undefined })); setMsg(null);
  };
  const addLine = (focus = true) => {
    const last = lines[lines.length - 1];
    const l = { ...newLine(last?.orderId || defaultOrder()), date: last?.date || today(), mode: last?.mode || 'Bank Transfer' };
    setLines(ls => [...ls, l]);
    if (focus) setTimeout(() => document.querySelector(`[data-line="${l.k}"] input[type="date"]`)?.focus(), 30);
  };
  const removeLine = k => setLines(ls => (ls.length > 1 ? ls.filter(l => l.k !== k) : ls));

  const total = multi ? r2(filled.reduce((s, l) => s + n(l.amount), 0)) : r2(rows.reduce((s, r) => s + n(alloc[r.id]), 0));
  const used = multi ? rows.filter(r => lineSum[r.id] > 0) : rows.filter(r => n(alloc[r.id]) > 0);

  /* pop-up from Dues: pick the order's client once orders and clients are in */
  const presetDone = useRef(false);
  useEffect(() => {
    if (!preset || presetDone.current || !clientsReady || !orders.length) return;
    const o = orders.find(x => String(x.orderId) === String(preset.orderId));
    if (!o) return;
    presetDone.current = true;
    const code = String(o.clientId || o.customerCode || '');
    setClient(clients.find(c => code && String(c.clientId) === code) || clients.find(c => norm(clientName(c)) === norm(o.customerName))
      || { clientId: code, companyName: o.customerName || o.party || '' });
  }, [preset, clientsReady, orders, clients]);
  useEffect(() => {
    if (!preset) return;
    const k = e => { if (e.key === 'Escape' && !picker && !busy) onClose?.(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [preset, picker, busy, onClose]);

  const chooseClient = c => { setPicker(false); setClient(c); setAlloc({}); if (multi) setLines([newLine(), newLine(), newLine()]); setErrs(o => ({ ...o, client: undefined, alloc: undefined })); setMsg(null); };
  const setAmt = id => e => { const v = e.target.value.replace(/[^\d.]/g, ''); setAlloc(a => ({ ...a, [id]: v })); setErrs(o => ({ ...o, alloc: undefined })); setMsg(null); };

  const saveMulti = async status => {
    const e = {}, bad = {};
    if (!f.account) e.account = 'Choose the account the money came into';
    if (!client) e.client = 'Choose the client';
    else if (!filled.length) e.alloc = 'Enter at least one payment line with an amount';
    filled.forEach(l => {
      if (!l.orderId) bad[l.k] = 'Choose the order';
      else if (!l.date) bad[l.k] = 'Enter the date';
      else if (status !== 'draft' && !isCash && !l.ref.trim()) bad[l.k] = l.mode === 'Cheque' ? 'Enter the cheque no.' : 'Enter the UTR / transaction no.';
    });
    if (Object.keys(bad).length) e.lines = bad;
    setErrs(e);
    if (Object.keys(e).length) { setMsg({ ok: false, text: 'Please correct the fields marked in red.' }); return; }

    setBusy(true); setMsg(null);
    const name = clientName(client), ids = [], stamp = Date.now();
    try {
      for (let i = 0; i < filled.length; i++) {
        const l = filled[i], o = rows.find(r => r.id === l.orderId)?.o || {};
        const res = await axios.post('/api/accounts/payments', {
          companyId, type: 'receipt', entityType: 'client', entityId: client.clientId, party: name, entityName: name,
          date: l.date, transactionDate: l.date, paymentMode: isCash ? 'Cash' : l.mode, bankId: isCash ? '' : f.account,
          referenceNo: isCash ? '' : l.ref.trim(), notes: (l.notes || f.notes).trim(), orderType: 'sales', status,
          orderId: l.orderId, orderNo: o.orderNo || '', amount: n(l.amount).toFixed(2),
          receiptGroup: `RG${stamp}-${i + 1}`, receiptTotal: n(l.amount).toFixed(2),
        }, { params: { companyId } });
        ids.push(res.data?.paymentId);
      }
      const what = status === 'draft' ? 'saved as draft' : status === 'pending' ? 'sent for approval' : 'saved';
      const text = `${filled.length} receipt${filled.length === 1 ? '' : 's'} of ₹ ${amt(total)} from ${name} ${what} (No. ${ids.join(', ')}).`;
      if (preset) { onSaved?.(text); return; }
      setMsg({ ok: true, text });
      const d = defaultOrder(); setLines([newLine(d), newLine(d), newLine(d)]); setReload(x => x + 1);
      topRef.current?.scrollIntoView({ behavior: 'smooth' });
    } catch (err) {
      setMsg({ ok: false, text: `${err.response?.data?.error || 'Could not save the receipts.'}${ids.length ? ` ${ids.length} line(s) were already saved (No. ${ids.join(', ')}) — remove them before saving again.` : ''}` });
      if (ids.length) { setLines(ls => ls.filter(l => !filled.slice(0, ids.length).some(x => x.k === l.k))); setReload(x => x + 1); }
    } finally { setBusy(false); }
  };

  const save = async status => {
    if (multi && !editing) return saveMulti(status);
    const e = {};
    if (!f.date) e.date = 'Enter the receipt date';
    if (!f.account) e.account = 'Choose the account the money came into';
    if (!client) e.client = 'Choose the client';
    else if (!used.length) e.alloc = 'Enter the amount received against at least one order';
    if (status !== 'draft' && !isCash && !f.refNo.trim()) e.refNo = mode === 'Cheque' ? 'Enter the cheque no.' : 'Enter the UTR / transaction no.';
    setErrs(e);
    if (Object.keys(e).length) { setMsg({ ok: false, text: 'Please correct the fields marked in red.' }); return; }

    setBusy(true); setMsg(null);
    const group = editing ? (editing[0].receiptGroup || `RG${editing[0].paymentId}`) : `RG${Date.now()}`;
    const name = clientName(client);
    const common = {
      companyId, type: 'receipt', entityType: 'client', entityId: client.clientId, party: name, entityName: name,
      date: f.date, paymentMode: mode, bankId: isCash ? '' : f.account, referenceNo: isCash ? '' : f.refNo.trim(),
      transactionDate: isCash ? f.date : f.txnDate, notes: f.notes.trim(), orderType: 'sales', status,
      receiptGroup: group, receiptTotal: total.toFixed(2),
    };
    const ids = [];
    if (editing) {
      // same receipt: update the orders it already had, add new ones, remove orders whose amount was cleared
      const had = {}; editing.forEach(p => { had[String(p.orderId)] = p; });
      try {
        for (const r of used) {
          const body = { ...common, orderId: r.id, orderNo: r.o.orderNo || '', amount: n(alloc[r.id]).toFixed(2) };
          if (had[r.id]) { await axios.put(`/api/accounts/payments/${had[r.id].paymentId}`, body, { params: { companyId } }); ids.push(had[r.id].paymentId); }
          else { const res = await axios.post('/api/accounts/payments', body, { params: { companyId } }); ids.push(res.data?.paymentId); }
        }
        for (const p of editing) if (!used.some(r => r.id === String(p.orderId))) await axios.delete(`/api/accounts/payments/${p.paymentId}`, { params: { companyId } });
        const what = status === 'draft' ? 'saved as draft' : status === 'pending' ? 'sent for approval' : 'saved';
        resetForm(); setReload(x => x + 1); navigate('/beta/receipt?tab=list');
        setListMsg({ ok: true, text: `Receipt ${ids.join(', ')} updated and ${what} — ₹ ${amt(total)} from ${name}.` });
      } catch (err) {
        setMsg({ ok: false, text: `${err.response?.data?.error || 'Could not save the changes.'} Some orders may already be updated — check the list before saving again.` });
        setReload(x => x + 1);
      } finally { setBusy(false); }
      return;
    }
    try {
      for (const r of used) {
        const res = await axios.post('/api/accounts/payments', { ...common, orderId: r.id, orderNo: r.o.orderNo || '', amount: n(alloc[r.id]).toFixed(2) }, { params: { companyId } });
        ids.push(res.data?.paymentId);
      }
      const what = status === 'draft' ? 'saved as draft' : status === 'pending' ? 'sent for approval' : 'saved';
      const text = `Receipt of ₹ ${amt(total)} from ${name} ${what} — ${used.map(r => `${r.o.orderNo || r.id} ₹ ${amt(alloc[r.id])}`).join(', ')} (No. ${ids.join(', ')}).`;
      if (preset) { onSaved?.(text); return; }
      setMsg({ ok: true, text });
      setClient(null); setAlloc({}); setF(o => ({ ...o, refNo: '', notes: '' })); setReload(x => x + 1);
      topRef.current?.scrollIntoView({ behavior: 'smooth' });
    } catch (err) {
      setMsg({ ok: false, text: `${err.response?.data?.error || 'Could not save the receipt.'}${ids.length ? ` ${ids.length} order(s) were already saved (No. ${ids.join(', ')}) — check before saving again.` : ''}` });
    } finally { setBusy(false); }
  };

  const head = (icon, title, extra) => <div className="rc-ch"><span className="ico"><Svg name={icon} size={14} /></span><b>{title}</b>{extra}</div>;
  const bank = banks.find(b => String(b.bankId) === f.account);
  const receipts = useMemo(() => payments.filter(p => p.type === 'receipt'), [payments]);
  const [listMsg, setListMsg] = useState(null);

  /* Approve — button shown only to users with Receipt approve rights; approves every pending
     entry of the selected receipt (one receipt can cover several orders) */
  const canApproveRcpt = can(user, 'accReceipt', 'approve');
  const doApprove = async rs => {
    const pend = (rs || []).filter(p => p.status === 'pending');
    if (!pend.length) return;
    const total = pend.reduce((s, p) => s + n(p.amount), 0);
    if (!window.confirm(`Approve receipt ${pend.map(p => p.paymentId).join(', ')} — ${pend[0].party || pend[0].entityName || ''}, ₹ ${amt(total)}?`)) return;
    setBusy(true);
    try {
      const by = user?.name || user?.username || 'Admin', at = new Date().toISOString();
      for (const p of pend) await axios.put(`/api/accounts/payments/${p.paymentId}`, { status: 'confirmed', approvedBy: by, approvedAt: at }, { params: { companyId } });
      setReload(x => x + 1); setListMsg({ ok: true, text: `Receipt ${pend.map(p => p.paymentId).join(', ')} approved — ₹ ${amt(total)}.` });
    } catch (e) { setListMsg({ ok: false, text: e.response?.data?.error || 'Could not approve the receipt.' }); setReload(x => x + 1); }
    finally { setBusy(false); }
  };

  /* list: receipts grouped (one receipt can cover several orders), searched, newest first */
  const soMap = useMemo(() => { const m = {}; orders.forEach(o => { m[String(o.orderId)] = o; }); return m; }, [orders]);
  const groups = useMemo(() => {
    const w = q.toLowerCase().split(/\s+/).filter(Boolean);
    const m = new Map();
    receipts.forEach(p => { const k = gKey(p); if (!m.has(k)) m.set(k, []); m.get(k).push(p); });
    return [...m.values()]
      .map(rs => rs.sort((a, b) => n(a.paymentId) - n(b.paymentId)))
      .filter(rs => !w.length || w.every(x => rs.some(p => `${p.paymentId} ${p.party || p.entityName} ${orderNoOf(p, soMap)} ${soMap[String(p.orderId)]?.customerPO || ''} ${p.notes || ''} ${p.referenceNo || ''} ${p.paymentMode} ${(STATUS[p.status] || [p.status])[0]} ${bankLabel(banks, p.bankId)}`.toLowerCase().includes(x))))
      .sort((a, b) => String(b[0].transactionDate || b[0].date || '').localeCompare(String(a[0].transactionDate || a[0].date || '')) || n(b[0].paymentId) - n(a[0].paymentId));
  }, [receipts, q, banks, soMap]);
  const selGroup = groups.find(rs => gKey(rs[0]) === selKey) || null;

  const resetForm = () => { setMulti(false); setLines([]); setEditing(null); setClient(null); setAlloc({}); setErrs({}); setMsg(null); setF(o => ({ ...o, date: today(), txnDate: today(), refNo: '', notes: '' })); };
  const startEdit = rs => {
    const h = rs[0];
    setListMsg(null); setErrs({}); setMsg(null);
    setClient(clients.find(c => String(c.clientId) === String(h.entityId)) || { clientId: h.entityId, companyName: h.party || h.entityName });
    const a = {}; rs.forEach(p => { a[String(p.orderId)] = String(n(p.amount)); }); setAlloc(a);
    setF({ date: (h.date || today()).slice(0, 10), account: h.bankId ? String(h.bankId) : 'cash', mode: MODES.includes(h.paymentMode) ? h.paymentMode : 'Bank Transfer',
      txnDate: (h.transactionDate || h.date || today()).slice(0, 10), refNo: h.referenceNo || h.reference || '', notes: h.notes || '' });
    setMulti(false); setEditing(rs);
  };
  const cancelEdit = () => { resetForm(); navigate('/beta/receipt?tab=list'); };
  const advice = rs => printReceiptAdvice({ rs, company: selectedCompany, user, banks, soMap, client: clients.find(c => String(c.clientId) === String(rs[0].entityId)) });

  // list: Esc or a click outside the list / toolbar clears the selection
  useEffect(() => {
    if (!selKey || tab !== 'list') return;
    const down = e => { if (!e.target.closest?.('.rc-list tbody tr, .rc-tools')) setSelKey(null); };
    const key = e => { if (e.key === 'Escape') setSelKey(null); };
    document.addEventListener('mousedown', down); document.addEventListener('keydown', key);
    return () => { document.removeEventListener('mousedown', down); document.removeEventListener('keydown', key); };
  }, [selKey, tab]);

  const page = (
    <div className={`rc${preset ? ' rc-popbox' : ''}`} role={preset ? 'dialog' : undefined} aria-modal={preset ? 'true' : undefined} aria-label={preset ? 'Receipt' : undefined}>
      <style>{CSS}</style>
      {!preset && <div className="rc-tabs" role="tablist">
        {TABS.map((t, i) => (
          <React.Fragment key={t.key}>
            {i === 1 && <span className="rc-sep" />}
            <button type="button" role="tab" aria-selected={tab === t.key} className={`rc-tab${tab === t.key ? ' on' : ''}`} onClick={() => { if (editing) resetForm(); navigate(`/beta/receipt?tab=${t.key}`); }}>
              {t.label}{t.key === 'list' && <span className="n">{receipts.length}</span>}
            </button>
          </React.Fragment>
        ))}
        {tab === 'list' && <input className="rc-search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search receipt no., client, order, UTR / cheque, status…" aria-label="Search receipts" />}
        {tab === 'list' && (
          <div className="rc-tools">
            <span className="rc-picked">{selGroup ? <>Selected: <b>{selGroup.map(p => p.paymentId).join(', ')}</b></> : 'Click a receipt to select it'}</span>
            {canApproveRcpt && <button type="button" className="rc-tbtn" disabled={!selGroup || busy || !selGroup.some(p => p.status === 'pending')} title={selGroup && !selGroup.some(p => p.status === 'pending') ? 'Only a pending receipt can be approved' : 'Approve this receipt'} onClick={() => doApprove(selGroup)} style={{ color: '#067647', borderColor: '#16A34A' }}><Svg name="check" size={13} />Approve</button>}
            <button type="button" className="rc-tbtn" disabled={!selGroup} onClick={() => startEdit(selGroup)}><Svg name="settings" size={13} />Edit</button>
            <button type="button" className="rc-tbtn" disabled={!selGroup} onClick={() => advice(selGroup)}><Svg name="file" size={13} />Receipt Advice</button>
            <span className="rc-sep" />
            <button type="button" className="rc-tbtn" disabled={!groups.length} onClick={() => printReceiptList({ groups, company: selectedCompany, user, banks, soMap, filter: q ? `Search: ${q}` : 'All receipts' })}><Svg name="file" size={13} />Print List</button>
          </div>
        )}
      </div>}
      {tab === 'list' && listMsg && <div className={`rc-msg ${listMsg.ok ? 'ok' : 'err'}`} style={{ margin: 0 }} role="status">{listMsg.text}</div>}
      {tab === 'list' ? <ReceiptList groups={groups} receipts={receipts} banks={banks} soMap={soMap} q={q} selKey={selKey} onSelect={setSelKey} onEdit={startEdit} /> : (
      <div className="rc-body">
        <div className="rc-hero" ref={topRef}>
          <span className="ic"><Svg name="wallet" size={16} /></span><h1>{editing ? `Edit Receipt ${editing.map(p => p.paymentId).join(', ')}` : preset ? `Receipt — ${soMap[String(preset.orderId)]?.orderNo || preset.orderId}` : 'Receipt'}</h1><span className="grow" />
          <div className="rc-chip"><small>Total received</small><b>₹ {amt(total)}</b></div>
          {preset && <button type="button" className="rc-x" onClick={onClose} disabled={busy} aria-label="Close">×</button>}
        </div>
        {msg && <div className={`rc-msg ${msg.ok ? 'ok' : 'err'}`} role="status">{msg.text}</div>}

        <div className="rc-card">
          {head('file', 'Receipt Details')}
          <table className="rc-kv"><tbody>
            <tr>
              <th>Date <i>*</i></th>
              <td>{multi && !editing ? <span className="rc-mut">Each payment line below has its own date</span> : <>
                <input type="date" value={f.date} onChange={set('date')} disabled={busy} className={errs.date ? 'bad' : ''} />{errs.date && <span className="rc-err">{errs.date}</span>}</>}</td>
              <th>Account <i>*</i></th>
              <td>
                <select value={f.account} onChange={set('account')} disabled={busy} className={errs.account ? 'bad' : ''}>
                  <option value="">— Select account —</option>
                  {banks.map(b => <option key={b.bankId} value={String(b.bankId)}>{b.bankName}{b.accountNumber ? ` — A/c ${b.accountNumber}` : ''}</option>)}
                  <option value="cash">Cash</option>
                </select>
                {errs.account && <span className="rc-err">{errs.account}</span>}
              </td>
            </tr>
            <tr>
              <th>Client <i>*</i></th>
              <td colSpan={3}>
                <div className="rc-srch">
                  <input readOnly value={client ? `${clientName(client)} — ${client.clientId}` : ''} placeholder="Click search to choose the client"
                    className={errs.client ? 'bad' : ''} onClick={() => !busy && !editing && !preset && setPicker(true)} />
                  <button type="button" className="rc-sbtn" onClick={() => setPicker(true)} disabled={busy || !!editing || !!preset} aria-label="Search client"><Svg name="search" size={15} /></button>
                </div>
                {errs.client && <span className="rc-err">{errs.client}</span>}
                {client && <div className="rc-sub">{[client.gstin, client.city, client.state].filter(Boolean).join(' · ') || '—'}</div>}
              </td>
            </tr>
          </tbody></table>
        </div>

        <div className="rc-card">
          {head('box', client ? `Orders of ${clientName(client)}` : 'Orders', <><span className="grow" /><small>{client ? `${rows.length} order${rows.length === 1 ? '' : 's'} · type the amount against each order it pays` : ''}</small></>)}
          {!client ? <div className="rc-empty">Choose the client to see its orders.</div> : !rows.length ? <div className="rc-empty">This client has no sales orders.</div> : (
            <table className="rc-t">
              <thead><tr>
                <th>Order No.</th><th>Order Date</th><th>Client PO</th><th className="r">Order Value</th><th>PIs given</th><th className="r">PI Total</th>
                <th className="r">Received</th><th className="r">PI Due</th><th className="r">Order Balance</th><th className="r">Amount Received Now</th>
              </tr></thead>
              <tbody>{rows.map(r => {
                const a = n(alloc[r.id]);
                return (
                  <tr key={r.id} className={`${a > 0 ? 'on' : ''}${preset && String(preset.orderId) === r.id ? ' pre' : ''}`}>
                    <td className="no">{r.o.orderNo || r.id}</td><td>{fdate(r.o.orderDate)}</td><td>{dash(r.o.customerPO)}</td>
                    <td className="r">{amt(r.value)}</td>
                    <td>{r.pis.length ? <div className="rc-pis">{r.pis.map(p => <span key={p.piId}><b>{p.piNo || p.piId}</b> · {dash(p.milestone)} · {amt(p.amount)}</span>)}</div> : <span className="rc-mut">No PI</span>}</td>
                    <td className="r">{r.pis.length ? amt(r.piTotal) : '—'}</td>
                    <td className="r">{amt(r.received)}</td>
                    <td className={`r${r.piDue > 0 ? ' rc-due' : ''}`}>{r.pis.length ? amt(r.piDue) : '—'}</td>
                    <td className="r">{amt(r.bal)}</td>
                    <td className="r">
                      {multi ? <b className={lineSum[r.id] ? 'rc-ls' : 'rc-mut'}>{lineSum[r.id] ? amt(lineSum[r.id]) : '—'}</b> : <>
                      <input className="rc-in" autoFocus={!!preset && String(preset.orderId) === r.id} value={alloc[r.id] ?? ''} onChange={setAmt(r.id)} disabled={busy} inputMode="decimal" placeholder="0.00" aria-label={`Amount for ${r.o.orderNo || r.id}`} />
                      </>}
                      {(multi ? n(lineSum[r.id]) : a) > r.bal + 0.5 && <span className="rc-warn">More than the order balance</span>}
                    </td>
                  </tr>
                );
              })}</tbody>
              <tfoot><tr>
                <td colSpan={3}>Total</td><td className="r">{amt(rows.reduce((s, r) => s + r.value, 0))}</td><td />
                <td className="r">{amt(rows.reduce((s, r) => s + r.piTotal, 0))}</td><td className="r">{amt(rows.reduce((s, r) => s + r.received, 0))}</td>
                <td className="r">{amt(rows.reduce((s, r) => s + r.piDue, 0))}</td><td className="r">{amt(rows.reduce((s, r) => s + r.bal, 0))}</td>
                <td className="r">₹ {amt(total)}</td>
              </tr></tfoot>
            </table>
          )}
          {errs.alloc && <div className="rc-msg err" style={{ margin: 8 }}>{errs.alloc}</div>}
        </div>

        <div className="rc-card">
          {head('wallet', 'Payment Details', <>
            {!editing && (
              <div className="rc-mode" role="radiogroup" aria-label="Single or multiple payments">
                <button type="button" role="radio" aria-checked={!multi} className={!multi ? 'on' : ''} disabled={busy} onClick={() => setMultiMode(false)}>Single payment</button>
                <button type="button" role="radio" aria-checked={multi} className={multi ? 'on' : ''} disabled={busy} onClick={() => setMultiMode(true)}>Multiple payments</button>
              </div>
            )}
            <span className="grow" /><small>{isCash ? 'Cash' : bank ? `${bank.bankName}${bank.accountNumber ? ` · ${bank.accountNumber}` : ''}` : ''}</small></>)}
          {multi && !editing ? (
            <>
              <table className="rc-t rc-lines">
                <colgroup><col style={{ width: 34 }} /><col style={{ width: 150 }} /><col style={{ width: 190 }} /><col style={{ width: 150 }} /><col /><col style={{ width: 150 }} /><col style={{ width: '22%' }} /><col style={{ width: 34 }} /></colgroup>
                <thead><tr><th>#</th><th>Date</th><th>Order No.</th><th>Mode</th><th>UTR / Cheque No.</th><th className="r">Amount</th><th>Narration</th><th /></tr></thead>
                <tbody>{lines.map((l, i) => {
                  const err = errs.lines?.[l.k];
                  return (
                    <tr key={l.k} data-line={l.k} className={err ? 'bad-row' : ''}>
                      <td className="c rc-mut">{i + 1}</td>
                      <td><input type="date" value={l.date} onChange={setLine(l.k, 'date')} disabled={busy} /></td>
                      <td><select value={l.orderId} onChange={setLine(l.k, 'orderId')} disabled={busy} className={err && !l.orderId ? 'bad' : ''}>
                        <option value="">— Order —</option>
                        {rows.map(r => <option key={r.id} value={r.id}>{r.o.orderNo || r.id}</option>)}
                      </select></td>
                      <td>{isCash ? <input readOnly value="Cash" /> : <select value={l.mode} onChange={setLine(l.k, 'mode')} disabled={busy}>{MODES.map(m => <option key={m}>{m}</option>)}</select>}</td>
                      <td><input value={isCash ? '' : l.ref} onChange={setLine(l.k, 'ref')} disabled={busy || isCash} placeholder={isCash ? 'Not needed for cash' : l.mode === 'Cheque' ? 'Cheque no.' : 'UTR / transaction no.'}
                        className={err && l.orderId && l.date ? 'bad' : ''} />{err && <span className="rc-err">{err}</span>}</td>
                      <td><input className="rc-in wide" value={l.amount} onChange={setLine(l.k, 'amount')} disabled={busy} inputMode="decimal" placeholder="0.00" aria-label={`Amount, line ${i + 1}`}
                        onKeyDown={e => { if (e.key === 'Enter' && i === lines.length - 1) { e.preventDefault(); addLine(); } }} /></td>
                      <td><input value={l.notes} onChange={setLine(l.k, 'notes')} disabled={busy} placeholder="Optional" /></td>
                      <td className="c"><button type="button" className="rc-del" onClick={() => removeLine(l.k)} disabled={busy || lines.length === 1} aria-label={`Remove line ${i + 1}`} title="Remove line">×</button></td>
                    </tr>
                  );
                })}</tbody>
                <tfoot><tr>
                  <td colSpan={5}><button type="button" className="rc-add" onClick={() => addLine()} disabled={busy}>+ Add line</button><span className="rc-hint">Enter on the last amount adds a line · each line is saved as its own receipt</span></td>
                  <td className="r">₹ {amt(total)}</td><td colSpan={2} className="rc-mut">{filled.length} payment{filled.length === 1 ? '' : 's'}</td>
                </tr></tfoot>
              </table>
              {errs.alloc && <div className="rc-msg err" style={{ margin: 8 }}>{errs.alloc}</div>}
            </>
          ) : (
          <table className="rc-kv"><tbody>
            <tr>
              <th>Mode</th>
              <td>{isCash ? <input readOnly value="Cash" /> : (
                <select value={f.mode} onChange={set('mode')} disabled={busy}>{MODES.map(m => <option key={m}>{m}</option>)}</select>
              )}</td>
              <th>{mode === 'Cheque' || mode === 'DD' ? `${mode} Date` : 'Transaction Date'}</th>
              <td><input type="date" value={isCash ? f.date : f.txnDate} onChange={set('txnDate')} disabled={busy || isCash} /></td>
            </tr>
            <tr>
              <th>{mode === 'Cheque' ? 'Cheque No.' : mode === 'DD' ? 'DD No.' : 'UTR / Transaction No.'}{!isCash && <i> *</i>}</th>
              <td><input value={isCash ? '' : f.refNo} onChange={set('refNo')} disabled={busy || isCash} placeholder={isCash ? 'Not needed for cash' : ''} className={errs.refNo ? 'bad' : ''} />{errs.refNo && <span className="rc-err">{errs.refNo}</span>}</td>
              <th>Amount</th>
              <td><b>₹ {amt(total)}</b></td>
            </tr>
            <tr><th>Narration</th><td colSpan={3}><textarea value={f.notes} onChange={set('notes')} disabled={busy} rows={2} placeholder="Optional" /></td></tr>
          </tbody></table>
          )}
        </div>

        <div className="rc-bar">
          <span className="info">{client ? <>{clientName(client)} · {used.length} order{used.length === 1 ? '' : 's'} · <b>₹ {amt(total)}</b>{editing && <> · was ₹ {amt(editing.reduce((s, p) => s + n(p.amount), 0))}</>}</> : 'Choose the client'}</span>
          {editing && <button type="button" className="rc-b ghost" disabled={busy} onClick={cancelEdit}>Cancel</button>}
          <button type="button" className="rc-b ghost" disabled={busy} onClick={() => save('draft')}>Save as Draft</button>
          <button type="button" className="rc-b mid" disabled={busy} onClick={() => save('confirmed')}>Save</button>
          <button type="button" className="rc-b pri" disabled={busy} onClick={() => save('pending')}>{busy ? 'Saving…' : 'Send for Approval'}</button>
        </div>
      </div>
      )}

      {picker && <ClientPicker clients={clients.filter(c => c.status !== 'rejected')} onPick={chooseClient} onClose={() => setPicker(false)} />}
    </div>
  );
  return preset
    ? <div className="rc-ov" onMouseDown={e => { if (e.target === e.currentTarget && !busy) onClose?.(); }}>{page}</div>
    : page;
}

/* ── Receipt List: one line per receipt; a receipt split over several orders shows its orders inside one block.
   Click selects (toolbar: Edit · Receipt Advice), double-click opens it for editing ── */
// [label, letter, fill] — same round badges as the client list
export const STATUS = { draft: ['Draft', 'D', '#667085'], pending: ['Pending', 'P', '#F79009'], confirmed: ['Approved', 'A', '#16A34A'], rejected: ['Rejected', 'R', '#D92D20'] };
export const gKey = p => p.receiptGroup || `P${p.paymentId}`;
export const orderNoOf = (p, soMap) => p.orderNo || soMap[String(p.orderId)]?.orderNo || p.orderId;
export const bankLabel = (banks, id) => { if (!id) return 'Cash'; const b = banks.find(x => String(x.bankId) === String(id)); return b ? b.bankName : `Bank ${id}`; };

function ReceiptList({ groups, receipts, banks, soMap, q, selKey, onSelect, onEdit }) {
  const total = groups.reduce((s, rs) => s + rs.reduce((t, p) => t + n(p.amount), 0), 0);
  const cnt = st => receipts.filter(p => p.status === st).length;

  return (
    <div className="rc-body">
      <div className="rc-hero">
        <span className="ic"><Svg name="ledger" size={16} /></span><h1>Receipt List</h1><span className="grow" />
        {['draft', 'pending', 'confirmed', 'rejected'].map(st => <div key={st} className="rc-chip"><small>{STATUS[st][0]}</small><b>{cnt(st)}</b></div>)}
      </div>
      <table className="rc-t rc-list">
        <thead><tr>
          <th>Txn Date</th><th>Client Name</th><th>Order No.</th><th>Client PO No.</th><th>Account</th><th className="r">Receipt Amount</th><th>Remarks</th><th className="c">Status</th>
        </tr></thead>
        <tbody>
          {!groups.length ? <tr><td colSpan={8} className="rc-empty">{q ? `No receipt matches “${q}”.` : 'No receipts yet.'}</td></tr>
            : groups.map(rs => {
              const h = rs[0], k = gKey(h), span = rs.length, st = STATUS[h.status] || [h.status || '—', '?', '#98A2B3'];
              const sel = selKey === k;
              const ev = { onClick: () => onSelect(k), onDoubleClick: () => { onSelect(k); onEdit(rs); }, title: 'Click to select · double-click to edit' };
              return rs.map((p, i) => (
                <tr key={p.paymentId} className={`${i === 0 ? 'gs' : ''}${sel ? ' sel' : ''}${i === 0 && sel ? ' first' : ''}`} {...ev} aria-selected={sel}>
                  {i === 0 && <><td rowSpan={span} className="lead">{fdate(h.transactionDate || h.date)}</td><td rowSpan={span}><b>{dash(h.party || h.entityName)}</b></td></>}
                  <td className="no">{dash(orderNoOf(p, soMap))}</td><td>{dash(soMap[String(p.orderId)]?.customerPO)}</td>
                  {i === 0 && <td rowSpan={span}>{bankLabel(banks, h.bankId)}</td>}
                  <td className="r"><b>{amt(p.amount)}</b></td>
                  {i === 0 && <>
                    <td rowSpan={span} className="rmk" title={h.notes || ''}>{dash(h.notes)}</td>
                    <td rowSpan={span} className="c"><span className="rc-badge" style={{ background: st[2] }} title={st[0]}>{st[1]}</span></td>
                  </>}
                </tr>
              ));
            })}
        </tbody>
        {groups.length > 0 && <tfoot><tr><td colSpan={5}>Total ({groups.length} receipt{groups.length === 1 ? '' : 's'})</td><td className="r">₹ {amt(total)}</td><td colSpan={2} /></tr></tfoot>}
      </table>
    </div>
  );
}

function ClientPicker({ clients, onPick, onClose }) {
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const inRef = useRef(null), listRef = useRef(null);
  useEffect(() => { inRef.current?.focus(); }, []);
  const list = useMemo(() => {
    const w = q.toLowerCase().split(/\s+/).filter(Boolean);
    return [...clients].sort((a, b) => clientName(a).localeCompare(clientName(b)))
      .filter(c => !w.length || w.every(x => `${clientName(c)} ${c.clientId} ${c.gstin || ''} ${c.city || ''} ${c.state || ''}`.toLowerCase().includes(x))).slice(0, 200);
  }, [clients, q]);
  useEffect(() => setSel(0), [q]);
  useEffect(() => { listRef.current?.querySelector('tr.sel')?.scrollIntoView({ block: 'nearest' }); }, [sel]);
  const key = e => {
    if (e.key === 'Escape') onClose();
    else if (e.key === 'ArrowDown') { e.preventDefault(); setSel(s => Math.min(s + 1, list.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel(s => Math.max(s - 1, 0)); }
    else if (e.key === 'Enter' && list[sel]) { e.preventDefault(); onPick(list[sel]); }
  };
  return (
    <div className="rc-pkb" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="rc-pk" role="dialog" aria-modal="true" aria-label="Select client" onKeyDown={key}>
        <div className="rc-pkh"><b>Select Client</b><span className="grow" /><small>{list.length} found</small><button type="button" onClick={onClose} aria-label="Close">×</button></div>
        <div className="rc-pks"><input ref={inRef} value={q} onChange={e => setQ(e.target.value)} placeholder="Search by client name, ID, GSTIN or city…" aria-label="Search clients" /></div>
        <div className="rc-pkl" ref={listRef}>
          <table className="rc-t">
            <thead><tr><th>Client ID</th><th>Client</th><th>GSTIN</th><th>City</th><th>State</th></tr></thead>
            <tbody>{list.length ? list.map((c, i) => (
              <tr key={c.clientId} className={i === sel ? 'sel' : ''} onMouseEnter={() => setSel(i)} onClick={() => onPick(c)}>
                <td className="no">{c.clientId}</td><td><b>{clientName(c)}</b></td><td>{dash(c.gstin)}</td><td>{dash(c.city)}</td><td>{dash(c.state)}</td>
              </tr>
            )) : <tr><td colSpan={5} className="rc-empty">Nothing matches “{q}”.</td></tr>}</tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export { CSS as RC_CSS };   // shared with the Purchase Payment page
