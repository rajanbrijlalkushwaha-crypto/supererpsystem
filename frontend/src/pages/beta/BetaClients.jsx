/* Beta — Client page. Top menu: Create Client | Client | Pending | Reject.
 * Lists come from GET /api/clients. "Epsilon Vendor Code" is typed in when the client is created. */
import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Svg } from '../../components/ui/Icon';
import { useCompany } from '../../context/CompanyContext';
import { useAuth } from '../../context/AuthContext';
import { can } from '../../utils/permissions';
import { legalNoteHtml } from '../../utils/printFont';
import { brandLine } from '../../utils/printBranding';
import GstFetch, { STATES } from './BetaGstFetch';
import { previewHtml } from './printKit';

export const TEAL = '#03444f';
export const F = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

const TABS = [
  { key: 'create',   label: 'Create Client' },
  { key: 'list',     label: 'Client' },
  { key: 'pending',  label: 'Pending' },
  { key: 'rejected', label: 'Reject' },
];

export const STATUS = {
  approved: { label: 'Approved', short: 'A', bg: '#16A34A' },
  active:   { label: 'Active',   short: 'A', bg: '#16A34A' },
  pending:  { label: 'Pending',  short: 'P', bg: '#F79009' },
  rejected: { label: 'Rejected', short: 'R', bg: '#D92D20' },
  draft:    { label: 'Draft',    short: 'D', bg: '#667085' },
  suspended: { label: 'Suspended', short: 'S', bg: '#7A5AF8' },
};

export const CSS = `
.bc { display:flex; flex-direction:column; height:100%; min-height:0; font-family:${F}; }
.bc-tabs { display:flex; align-items:stretch; gap:0; height:40px; padding:0; flex-shrink:0; background:#E3EEEF; border-bottom:1px solid #C9DCDE; }
.bc-tab { height:100%; padding:0 18px; border:0; border-right:1px solid #C9DCDE; border-radius:0; background:#fff; cursor:pointer; display:flex; align-items:center; gap:6px;
  font:600 13px ${F}; color:${TEAL}; white-space:nowrap; }
.bc-tab:hover { background:#F0F7F7; }
.bc-tab.on { background:${TEAL}; color:#fff; }
.bc-tabs .bc-search { align-self:center; }
.bc-tab .n { min-width:18px; height:17px; padding:0 5px; border-radius:99px; font-size:10.5px; line-height:17px; text-align:center; background:rgba(3,68,79,.12); }
.bc-tab.on .n { background:rgba(255,255,255,.22); }
.bc-tab .n.warn { background:#F79009; color:#fff; }
.bc-search { position:relative; margin-left:8px; width:300px; }
.bc-search input { width:100%; height:27px; padding:0 24px 0 9px; border:1px solid #B9D0D3; border-radius:5px; background:#fff; outline:none; font:400 12.5px ${F}; color:#101828; }
.bc-search input:focus { border-color:${TEAL}; box-shadow:0 0 0 2px rgba(3,68,79,.15); }
.bc-search button { position:absolute; right:3px; top:50%; transform:translateY(-50%); width:20px; height:20px; border:none; background:none; cursor:pointer; color:#667085; font-size:15px; line-height:1; }
.bc-sep { width:4px; background:#C9DCDE; }

.bc-wrap { flex:1; min-height:0; overflow-y:auto; overflow-x:hidden; padding:0; }
.bc-t { width:100%; table-layout:fixed; border-collapse:separate; border-spacing:0; background:#fff; font-size:12px; }
.bc-t th { position:sticky; top:0; z-index:1; background:${TEAL}; color:#fff; font-weight:600; text-align:left; padding:7px 6px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; border-right:1px solid rgba(255,255,255,.12); }
.bc-t th:last-child { border-right:none; }
.bc-t th { border-right-color:rgba(255,255,255,.25); }
.bc-t td { border-right:1px solid #000; }   /* thin black lines between columns */
.bc-t td:last-child { border-right:none; }
.bc-t th.ctr, .bc-t td.ctr { text-align:center; }
.bc-t th.wrap { white-space:normal; line-height:1.2; padding-top:4px; padding-bottom:4px; }
.bc-t td { padding:6px 6px; border-top:1px solid #EDF2F3; color:#1D2939; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; vertical-align:middle; }
.bc-t tbody tr:nth-child(even) td { background:#F7FAFA; }
.bc-t tbody tr:hover td { background:#EAF4F5; }
.bc-t td.mono { font-family:ui-monospace, Consolas, monospace; font-size:11px; }
.bc-t td.id { font-weight:600; color:${TEAL}; }
.bc-badge { display:inline-grid; place-items:center; width:20px; height:20px; border-radius:50%; color:#fff; font-size:11px; font-weight:700; }
.bc-vend { color:${TEAL}; font-weight:500; }
.bc-msg { padding:40px 10px; text-align:center; color:#667085; font-size:13px; }
.bc-err { margin:10px; padding:9px 12px; border-radius:6px; background:#FDECEC; color:#B42318; font-size:12.5px; }
`;

/* [header, width] — fixed widths so the whole list fits one screen */
const COLS = [
  ['Client ID', '5.5%'], ['Cust Name', '17%'], ['GSTIN', '10%'], ['Address', '13%'], ['City', '7%'], ['State', '7%'], ['Pincode', '5%'],
  ['Contact Name', '8.5%'], ['Number', '7%'], ['Email', '10%'], ['Epsilon Vendor Code', '6.5%'], ['Status', '3.5%'],
];

export const dash = v => (v == null || String(v).trim() === '' ? '—' : v);

export default function BetaClients() {
  const { selectedCompany } = useCompany() || {};
  const companyId = selectedCompany?.companyId;
  const navigate = useNavigate();
  const { search } = useLocation();
  const tab = TABS.some(t => t.key === new URLSearchParams(search).get('tab')) ? new URLSearchParams(search).get('tab') : 'list';

  const [clients, setClients] = useState(null);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [detail, setDetail] = useState(null);   // client shown in the pop-up
  const [editing, setEditing] = useState(null); // client open in the edit form

  const [reload, setReload] = useState(0);
  useEffect(() => {
    if (!companyId) return;
    setClients(null); setErr('');
    axios.get('/api/clients', { params: { companyId } })
      .then(r => setClients(Array.isArray(r.data) ? r.data : []))
      .catch(e => { setClients([]); setErr(e.response?.data?.error || 'Could not load clients.'); });
  }, [companyId, reload]);


  const groups = useMemo(() => {
    const all = clients || [];
    return {
      list:     all.filter(c => c.status !== 'rejected'),
      pending:  all.filter(c => c.status === 'pending'),
      rejected: all.filter(c => c.status === 'rejected'),
    };
  }, [clients]);

  const go = k => { setEditing(null); navigate(`/beta/client?tab=${k}`); };
  /* search across every field of the client (name, city, pincode, mobile, GSTIN, email, contact, vendor code…) */
  const rows = useMemo(() => {
    const list = groups[tab] || [];
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return list;
    return list.filter(c => {
      const hay = [
        c.clientId, c.companyName, c.clientName, c.gstin, c.address, c.city, c.state, c.pincode, c.contactPerson, c.mobile, c.email,
        ...(c.contactPersons || []).flatMap(p => [p.name, p.mobileNumber, p.email, p.designation]),
        c.epsilonVendorCode, (STATUS[c.status] || STATUS.draft).label,
      ].filter(x => x != null && x !== '').join(' ').toLowerCase();
      return words.every(w => hay.includes(w));
    });
  }, [groups, tab, q]);

  return (
    <div className="bc">
      <style>{CSS}</style>

      <div className="bc-tabs" role="tablist">
        {TABS.map((t, i) => (
          <React.Fragment key={t.key}>
            {i === 1 && <span className="bc-sep" />}
            <button type="button" role="tab" aria-selected={tab === t.key} className={`bc-tab${tab === t.key ? ' on' : ''}`} onClick={() => go(t.key)}>
              {t.label}
              {clients && t.key !== 'create' && (
                <span className={`n${t.key === 'pending' && groups.pending.length && tab !== 'pending' ? ' warn' : ''}`}>{groups[t.key].length}</span>
              )}
            </button>
          </React.Fragment>
        ))}
        {tab !== 'create' && (
          <div className="bc-search">
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search client, city, pincode, mobile, GSTIN…" aria-label="Search clients" />
            {q && <button type="button" onClick={() => setQ('')} aria-label="Clear search">×</button>}
          </div>
        )}
      </div>

      {err && <div className="bc-err">{err}</div>}

      {editing ? (
        <CreateClient key={`edit-${editing.clientId}`} companyId={companyId} editClient={editing}
          onSaved={() => setReload(n => n + 1)} onClose={() => setEditing(null)} />
      ) : tab === 'create' ? (
        <CreateClient companyId={companyId} onSaved={() => setReload(n => n + 1)} />
      ) : (
        <div className="bc-wrap">
          <table className="bc-t">
            <colgroup>{COLS.map(([label, w]) => <col key={label} style={{ width: w }} />)}</colgroup>
            <thead>
              <tr>{COLS.map(([label]) => <th key={label} title={label} className={label.length > 14 ? 'wrap' : label === 'Status' ? 'ctr' : undefined}>{label === 'Status' ? 'St.' : label}</th>)}</tr>
            </thead>
            <tbody>
              {clients === null ? (
                <tr><td colSpan={COLS.length} className="bc-msg">Loading…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={COLS.length} className="bc-msg">{q ? `No client matches “${q}”.` : <>No {tab === 'list' ? 'clients' : tab === 'pending' ? 'pending clients' : 'rejected clients'}.</>}</td></tr>
              ) : rows.map(c => {
                const ct = c.contactPersons?.[0] || {};
                const st = STATUS[c.status] || STATUS.draft;
                return (
                  <tr key={c.clientId} onDoubleClick={() => setDetail(c)} title="Double-click for full details">
                    <td className="id">{c.clientId}</td>
                    <td title={c.companyName || c.clientName || ''}>{dash(c.companyName || c.clientName)}</td>
                    <td className="mono">{dash(c.gstin)}</td>
                    <td title={c.address || ''}>{dash(c.address)}</td>
                    <td title={c.city || ''}>{dash(c.city)}</td>
                    <td title={c.state || ''}>{dash(c.state)}</td>
                    <td>{dash(c.pincode)}</td>
                    <td title={ct.name || c.contactPerson || ''}>{dash(ct.name || c.contactPerson)}</td>
                    <td>{dash(ct.mobileNumber || c.mobile)}</td>
                    <td title={ct.email || c.email || ''}>{dash(ct.email || c.email)}</td>
                    <td className="bc-vend" title={c.epsilonVendorCode || ''}>{dash(c.epsilonVendorCode)}</td>
                    <td className="ctr"><span className="bc-badge" style={{ background: st.bg }} title={st.label}>{st.short}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {detail && <ClientPopup client={detail} companyId={companyId} company={selectedCompany} onClose={() => setDetail(null)}
        onEdit={() => { setEditing(detail); setDetail(null); }}
        onChanged={upd => { setDetail(upd); setClients(cs => (cs || []).map(x => (x.clientId === upd.clientId ? upd : x))); }} />}
    </div>
  );
}

/* ── pop-up: every detail of one client + all its sales orders, printable ── */
// Formatters are built once — toLocaleString(…, options) builds a new one on every call, which made long lists slow.
const DATE_FMT = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
const MONEY_FMT = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const QTY_FMT = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 3 });
export const fmtDate = d => {
  if (!d) return '—';
  const x = new Date(d);
  return isNaN(x) ? String(d) : DATE_FMT.format(x);
};
export const money = n => '₹' + MONEY_FMT.format(Number(n) || 0);
/* products of a sales order — same fields the Sales Order print uses */
export const soItems = o => (Array.isArray(o.items) ? o.items : []).map(it => {
  const qty = parseFloat(it.qty) || 0, rate = parseFloat(it.rate) || 0;
  return { name: it.material || it.itemName || it.description || '', qty, unit: it.unit || '', rate, amount: qty * rate, gst: parseFloat(it.gstPercent || it.gst) || 0 };
}).filter(it => it.name || it.qty || it.rate);
/* order value = Σ qty × rate of its products (before GST) */
export const orderValue = o => soItems(o).reduce((s, it) => s + it.amount, 0);
export const fmtQty = n => (Number.isInteger(n) ? String(n) : QTY_FMT.format(n));
const esc = v => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const SO_STATUS = { approved: '#16A34A', completed: '#16A34A', 'in-progress': '#2563EB', pending: '#F79009', draft: '#667085', rejected: '#D92D20', cancelled: '#D92D20' };

const POP_CSS = `
.cp-back { position:fixed; inset:0; z-index:1500; background:rgba(2,24,28,.5); display:flex; align-items:center; justify-content:center; padding:2.5vh 2vw; font-family:${F}; }
.cp { width:100%; max-width:1600px; height:95vh; height:calc(95vh / var(--ui-zoom, 1)); max-height:calc(95vh / var(--ui-zoom, 1)); display:flex; flex-direction:column; background:#fff; border-radius:6px; overflow:hidden; box-shadow:0 20px 60px rgba(0,0,0,.35); }
.cp-hd { display:flex; align-items:center; gap:10px; padding:10px 14px; background:${TEAL}; color:#fff; flex-shrink:0; }
.cp-hd h2 { margin:0; font-size:15px; font-weight:700; flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.cp-hd small { font-size:11.5px; opacity:.75; font-weight:500; margin-left:8px; }
.cp-btn { height:28px; padding:0 12px; border:1px solid rgba(255,255,255,.35); border-radius:5px; background:rgba(255,255,255,.1); color:#fff; cursor:pointer; font:600 12px ${F}; }
.cp-btn:hover { background:rgba(255,255,255,.2); }
.cp-x { width:28px; padding:0; font-size:17px; line-height:1; }
.cp-btn.warn { background:#B42318; border-color:#B42318; }
.cp-btn.warn:hover { background:#912018; }
.cp-btn.ok { background:#16A34A; border-color:#16A34A; }
.cp-btn:disabled { opacity:.6; cursor:default; }
.cp-ask { display:flex; align-items:center; gap:8px; padding:9px 14px; background:#FEF3F2; border-bottom:1px solid #FECDCA; font-size:12.5px; color:#7A271A; }
.cp-ask span { flex:1; }
.cp-abtn { height:28px; padding:0 12px; border:1px solid #FECDCA; border-radius:5px; background:#fff; color:#344054; cursor:pointer; font:600 12px ${F}; }
.cp-abtn.danger { background:#B42318; border-color:#B42318; color:#fff; }
.cp-note { padding:8px 14px; font-size:12.5px; font-weight:500; }
.cp-note.ok { background:#E6F4EA; color:#1E7B34; } .cp-note.err { background:#FDECEC; color:#B42318; }
.cp-body { flex:1; min-height:0; overflow-y:auto; padding:12px 14px 16px; }
.cp-sec { margin:12px 0 6px; font-size:12px; font-weight:700; color:${TEAL}; text-transform:uppercase; letter-spacing:.6px; }
.cp-sec:first-child { margin-top:0; }
.cp-sec span { font-weight:600; color:#667085; text-transform:none; letter-spacing:0; }
.cp-grid { display:grid; grid-template-columns:repeat(4, 1fr); border:1px solid #D7E3E5; }
.cp-f { padding:6px 9px; border-right:1px solid #EDF2F3; border-bottom:1px solid #EDF2F3; min-width:0; }
.cp-f.w2 { grid-column:span 2; } .cp-f.w4 { grid-column:span 4; }
.cp-f label { display:block; font-size:10.5px; color:#667085; margin-bottom:1px; }
.cp-f div { font-size:12.5px; color:#101828; font-weight:500; word-break:break-word; }
.cp-t { width:100%; border-collapse:collapse; font-size:12px; }
.cp-t th { background:${TEAL}; color:#fff; font-weight:600; text-align:left; padding:6px 8px; white-space:nowrap; }
.cp-t td { padding:6px 8px; border-bottom:1px solid #EDF2F3; color:#1D2939; }
.cp-t th { border-right:1px solid rgba(255,255,255,.25); }   /* thin black lines between columns */
.cp-t td { border-right:1px solid #000; }
.cp-t tbody tr:nth-child(even) td { background:#F7FAFA; }
.cp-t .r { text-align:right; white-space:nowrap; }
.cp-t tfoot td { font-weight:700; background:#E3EEEF; border-top:1px solid #C9DCDE; }
/* orders: one line per product, order columns span its lines */
.cp-scroll { overflow-x:auto; border:1px solid #D7E3E5; }
.cp-ot { min-width:1100px; }
.cp-ot td { border-bottom:1px solid #EDF2F3; vertical-align:middle; }
.cp-ot tbody tr td { background:#fff; }
.cp-ot tbody.alt tr td { background:#F7FAFA; }
.cp-ot tbody tr:nth-child(even) td { background:inherit; }
.cp-ot tbody.alt tr:nth-child(even) td { background:#F7FAFA; }
.cp-ot tbody { border-top:2px solid #C9DCDE; }
.cp-ot td.og { white-space:nowrap; }
.cp-ot .it1 { border-left:1px solid #E3ECED; }
.cp-ot th.it1 { border-left:1px solid rgba(255,255,255,.18); }
.cp-ot .ov { border-left:1px solid #E3ECED; font-weight:600; }
.cp-ot th.ov { border-left:1px solid rgba(255,255,255,.18); }
.cp-st { display:inline-block; padding:1px 7px; border-radius:99px; color:#fff; font-size:10.5px; font-weight:600; text-transform:capitalize; }
.cp-dot { display:inline-grid; place-items:center; width:20px; height:20px; border-radius:50%; color:#fff; font-size:11px; font-weight:700; flex-shrink:0; }
.cp-msg { padding:14px 8px; text-align:center; color:#667085; font-size:12.5px; border:1px solid #EDF2F3; }
`;

function ClientPopup({ client: c, companyId, company, onClose, onEdit, onChanged }) {
  const { user } = useAuth();
  const [orders, setOrders] = useState(null);
  const [ask, setAsk] = useState(false);        // confirm before suspending
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(null);
  const suspended = c.status === 'suspended';

  /* Suspend / activate — only the status changes, every other field is kept by the server */
  const setStatus = async status => {
    setBusy(true); setNote(null);
    try {
      const fd = new FormData();
      fd.append('companyId', companyId);
      fd.append('status', status);
      fd.append('gstType', c.gstType || 'Regular');
      await axios.put(`/api/clients/${c.clientId}`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      onChanged({ ...c, status });
      setNote({ ok: true, text: status === 'suspended' ? 'Client suspended.' : c.status === 'pending' ? 'Client approved.' : 'Client is active again.' });
      setAsk(false);
    } catch (e) {
      setNote({ ok: false, text: e.response?.data?.error || 'Could not change the status. Try again.' });
    } finally { setBusy(false); }
  };

  useEffect(() => {
    axios.get('/api/sales-orders', { params: { companyId } })
      .then(r => setOrders((Array.isArray(r.data) ? r.data : [])
        .filter(o => String(o.customerCode) === String(c.clientId))
        .sort((a, b) => String(b.orderDate || '').localeCompare(String(a.orderDate || '')))))
      .catch(() => setOrders([]));
  }, [c.clientId, companyId]);

  useEffect(() => {
    const k = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);

  const st = STATUS[c.status] || STATUS.draft;
  const contacts = (c.contactPersons || []).filter(p => p && (p.name || p.mobileNumber || p.email));
  const total = (orders || []).reduce((sum, o) => sum + (Number(o.grandTotal) || 0), 0);
  const valueTotal = (orders || []).reduce((sum, o) => sum + orderValue(o), 0);

  /* Print in the Sales Order print format (boxed black grid, company header, "label : value" rows),
     Times New Roman. Printed from a hidden frame on this page — no new window. */
  const print = async () => {
    const co = company || {};
    let logo = '';
    if (co.logoFileName) {
      try {
        const b = await (await fetch(`/api/companies/logo/${encodeURIComponent(co.logoFileName)}?companyId=${companyId}`)).blob();
        logo = await new Promise(r => { const rd = new FileReader(); rd.onload = () => r(rd.result); rd.readAsDataURL(b); });
      } catch { logo = ''; }
    }
    const coAddr = [co.address, co.city, co.state, co.pincode].filter(Boolean).join(', ');
    const coLine = [co.gstin && 'GSTIN: ' + esc(co.gstin), co.phone && 'Ph: ' + esc(co.phone), co.email && 'Email: ' + esc(co.email)].filter(Boolean).join('&nbsp;&nbsp;|&nbsp;&nbsp;');
    const today = new Date().toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    const field = (lbl, v) => `<div class="fr"><span class="fl">${lbl}</span><span class="fc">:</span><span class="fv">${esc(v) || '&nbsp;'}</span></div>`;

    const contactRows = contacts.length
      ? contacts.map((p, i) => `<tr><td class="c">${i + 1}</td><td>${esc(p.name)}</td><td>${esc(p.designation)}</td><td>${esc(p.mobileNumber)}</td><td>${esc(p.email)}</td></tr>`).join('')
      : '<tr><td colspan="5" class="c">No contact person</td></tr>';
    const itemRows = o => {
      const its = soItems(o);
      if (!its.length) return '';
      return `<tr class="itr"><td></td><td colspan="7" style="padding:0;"><table class="sub"><thead><tr><th>Product</th><th style="width:60px">Qty</th><th style="width:50px">Unit</th><th style="width:90px">Rate</th><th style="width:100px">Amount</th></tr></thead><tbody>`
        + its.map(it => `<tr><td>${esc(it.name)}</td><td class="r">${esc(fmtQty(it.qty))}</td><td class="c">${esc(it.unit)}</td><td class="r">${money(it.rate)}</td><td class="r">${money(it.amount)}</td></tr>`).join('')
        + '</tbody></table></td></tr>';
    };
    const orderRows = (orders || []).length
      ? orders.map((o, i) => `<tr class="or"><td class="c">${i + 1}</td><td>${esc(o.orderNo)}</td><td class="c">${esc(fmtDate(o.orderDate))}</td><td>${esc(o.customerPO)}</td><td class="c">${o.poDate ? esc(fmtDate(o.poDate)) : ''}</td><td class="r">${money(orderValue(o))}</td><td class="r">${money(o.grandTotal)}</td><td class="c" style="text-transform:capitalize">${esc(o.status || 'draft')}</td></tr>` + itemRows(o)).join('')
        + `<tr class="tot"><td colspan="5">Total (${orders.length} orders)</td><td class="r">${money(valueTotal)}</td><td class="r">${money(total)}</td><td></td></tr>`
      : '<tr><td colspan="8" class="c">No sales orders for this client</td></tr>';

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>Client ${esc(c.clientId)} - ${esc(c.companyName || c.clientName)}</title>
<style>
table.sig { width:100%; border-collapse:collapse; } table.sig td { border:0; padding:4px 6px; }
.sig .box { height:100%; display:flex; flex-direction:column; justify-content:space-between; min-height:30mm; }
.sig .row3 { display:flex; align-items:flex-end; gap:6px; } .sig .row3 b { flex:1 1 0; text-align:center; }
* { margin:0; padding:0; box-sizing:border-box; }
body { font-family:'Times New Roman', Times, Georgia, serif; font-size:10.5pt; color:#000; background:#fff; }
.page { padding:12px; }
.outer { width:100%; border:0.5pt solid #000; border-collapse:collapse; }
.outer > tbody > tr > td { border:0.5pt solid #000; padding:3px 7px; vertical-align:top; }
.sh { text-align:center; font-weight:bold; font-size:11.5pt; padding:4px; }
.ch { font-weight:bold; text-decoration:underline; font-size:10.5pt; display:block; margin-bottom:2px; }
.fr { display:flex; gap:2px; margin-bottom:1px; font-size:10pt; }
.fl { min-width:120px; } .fc { margin:0 4px; } .fv { flex:1; }
.it { width:100%; border-collapse:collapse; font-size:9.5pt; }
.it th { border:0.5pt solid #000; padding:4px 5px; font-weight:bold; text-align:center; }
.it td { border:0.5pt solid #000; padding:3px 5px; vertical-align:middle; }
.it .c { text-align:center; } .it .r { text-align:right; white-space:nowrap; }
.it .tot td { font-weight:bold; }
.it tr.or td { font-weight:bold; }
.sub { width:100%; border-collapse:collapse; font-size:9pt; }
.sub th { border:0.5pt solid #000; border-top:0; padding:2px 5px; font-weight:bold; font-style:italic; text-align:center; }
.sub td { border:0.5pt solid #000; padding:2px 5px; }
.sub tr > :first-child { border-left:0; } .sub tr > :last-child { border-right:0; } .sub tbody tr:last-child td { border-bottom:0; }
.sub .r { text-align:right; white-space:nowrap; } .sub .c { text-align:center; }
.it thead tr:first-child th { border-top:0; }
.it tr > :first-child { border-left:0; }
.it tr > :last-child { border-right:0; }
.it tbody tr:last-child td { border-bottom:0; }
@media print { @page { margin:8mm; size:A4 portrait; } .page { padding:0; } tr { page-break-inside:avoid; break-inside:avoid; } }
</style></head><body><div class="page">
<table class="outer"><tbody>
  <tr><td colspan="2" style="padding:8px 10px; text-align:center;">
    <div style="display:flex; flex-direction:column; align-items:center; gap:4px; text-align:center;">
      ${logo ? `<img src="${logo}" style="height:48px; max-width:110px; object-fit:contain;">` : ''}
      <div>
        <div style="font-size:14pt; font-weight:bold;">${esc(co.companyName || co.name)}</div>
        ${coAddr ? `<div style="font-size:9pt;">${esc(coAddr)}</div>` : ''}
        ${coLine ? `<div style="font-size:9pt;">${coLine}</div>` : ''}
      </div>
    </div>
  </td></tr>
  <tr><td colspan="2" style="text-align:center; font-size:14pt; font-weight:bold; padding:6px;">Client Details</td></tr>

  <tr><td colspan="2" class="sh">Client Details &amp; Tax Identity</td></tr>
  <tr>
    <td style="width:50%"><span class="ch">Client Details</span>
      ${field('Client ID', c.clientId)}
      ${field('Client Name', c.companyName || c.clientName)}
      ${field('Status', st.label)}
      ${field('Created On', c.createdAt ? fmtDate(c.createdAt) : '')}
    </td>
    <td style="width:50%"><span class="ch">Tax Identity</span>
      ${field('GSTIN No', c.gstin)}
      ${field('GST Type', c.gstType)}
      ${field('Epsilon Vendor Code', c.epsilonVendorCode)}
    </td>
  </tr>

  <tr><td colspan="2" class="sh">Address</td></tr>
  <tr><td colspan="2">
    ${field('Address', c.address)}
    ${field('City', c.city)}
    ${field('State', c.state)}
    ${field('Pincode', c.pincode)}
  </td></tr>

  <tr><td colspan="2" class="sh">Contact Persons (${contacts.length})</td></tr>
  <tr><td colspan="2" style="padding:0;">
    <table class="it"><thead><tr><th style="width:34px">Sr No</th><th>Name</th><th>Designation</th><th>Number</th><th>Email</th></tr></thead>
    <tbody>${contactRows}</tbody></table>
  </td></tr>

  <tr><td colspan="2" class="sh">Sales Orders (${(orders || []).length})</td></tr>
  <tr><td colspan="2" style="padding:0;">
    <table class="it"><thead><tr><th style="width:34px">Sr No</th><th>Order No</th><th>Order Date</th><th>Customer PO</th><th>PO Date</th><th>Order Value</th><th>Grand Total</th><th>Status</th></tr></thead>
    <tbody>${orderRows}</tbody></table>
  </td></tr>

  <tr><td colspan="2" style="padding:0;">
    <table class="sig"><tr>
      <td style="width:40%; height:32mm; vertical-align:top; border-right:1px solid #000;"><div class="box"><b>For ${esc(c.companyName || c.clientName || '')}</b><b>Signature &amp; Seal</b></div></td>
      <td style="height:32mm; vertical-align:top;"><div class="box"><b style="text-align:right">For ${esc(co.companyName || '')}</b><div class="row3"><b>Prepared By</b><b>Verified By</b><b>Authorised Signatory</b></div></div></td>
    </tr></table>
  </td></tr>
  <tr><td colspan="2" style="font-size:8.5pt; color:#444;">
    <div style="display:flex; justify-content:space-between;"><span>${brandLine(user)}</span><span>Printed: ${esc(today)}</span></div>
  </td></tr>
</tbody></table>
${legalNoteHtml()}
</div></body></html>`;

    document.getElementById('cp-print-frame')?.remove();
    const fr = document.createElement('iframe');
    fr.id = 'cp-print-frame';
    fr.setAttribute('aria-hidden', 'true');
    fr.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
    document.body.appendChild(fr);
    const w = fr.contentWindow;
    w.document.open();
    w.document.write(html);
    w.document.close();
    fr.remove();
    previewHtml(html);   // the preview: Email · Save PDF · Print
  };

  const fld = (label, value, cls) => <div className={`cp-f${cls ? ' ' + cls : ''}`}><label>{label}</label><div>{dash(value)}</div></div>;

  return (
    <div className="cp-back" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <style>{POP_CSS}</style>
      <div className="cp" role="dialog" aria-modal="true" aria-label={`Client ${c.clientId}`}>
        <div className="cp-hd">
          <span className="cp-dot" style={{ background: st.bg }} title={st.label}>{st.short}</span>
          <h2>{c.companyName || c.clientName}<small>ID {c.clientId}</small></h2>
          {c.status === 'pending' && can(user, 'client', 'approve') && (
            <button type="button" className="cp-btn ok" onClick={() => { if (window.confirm(`Approve client ${c.companyName || c.clientName}?`)) setStatus('approved'); }} disabled={busy}>{busy ? 'Saving…' : '✓ Approve'}</button>
          )}
          <button type="button" className="cp-btn" onClick={onEdit} disabled={busy}>Edit</button>
          {suspended
            ? <button type="button" className="cp-btn ok" onClick={() => setStatus('approved')} disabled={busy}>{busy ? 'Saving…' : 'Activate'}</button>
            : <button type="button" className="cp-btn warn" onClick={() => setAsk(true)} disabled={busy}>Suspend</button>}
          <button type="button" className="cp-btn" onClick={print}>Print</button>
          <button type="button" className="cp-btn cp-x" onClick={onClose} aria-label="Close">×</button>
        </div>

        {ask && (
          <div className="cp-ask" role="alertdialog" aria-label="Confirm suspend">
            <span><b>Suspend {c.companyName || c.clientName}?</b> The client will be marked as suspended. You can activate it again any time.</span>
            <button type="button" className="cp-abtn" onClick={() => setAsk(false)} disabled={busy}>Cancel</button>
            <button type="button" className="cp-abtn danger" onClick={() => setStatus('suspended')} disabled={busy}>{busy ? 'Suspending…' : 'Yes, suspend'}</button>
          </div>
        )}
        {note && <div className={`cp-note ${note.ok ? 'ok' : 'err'}`} role="status">{note.text}</div>}

        <div className="cp-body">
          <div className="cp-sec">Client details</div>
          <div className="cp-grid">
            {fld('Client ID', c.clientId)}
            {fld('Cust Name', c.companyName || c.clientName, 'w2')}
            {fld('Status', st.label)}
            {fld('GSTIN', c.gstin)}
            {fld('GST Type', c.gstType)}
            {fld('Epsilon Vendor Code', c.epsilonVendorCode, 'w2')}
            {fld('Address', c.address, 'w4')}
            {fld('City', c.city)}
            {fld('State', c.state)}
            {fld('Pincode', c.pincode)}
            {fld('Created on', c.createdAt ? fmtDate(c.createdAt) : '')}
          </div>

          <div className="cp-sec">Contact persons <span>({contacts.length})</span></div>
          {contacts.length ? (
            <table className="cp-t">
              <thead><tr><th>#</th><th>Name</th><th>Designation</th><th>Number</th><th>Email</th></tr></thead>
              <tbody>{contacts.map((p, i) => (
                <tr key={i}><td>{i + 1}</td><td>{dash(p.name)}</td><td>{dash(p.designation)}</td><td>{dash(p.mobileNumber)}</td><td>{dash(p.email)}</td></tr>
              ))}</tbody>
            </table>
          ) : <div className="cp-msg">No contact person.</div>}

          <div className="cp-sec">Sales orders <span>({orders ? orders.length : '…'})</span></div>
          {orders === null ? <div className="cp-msg">Loading…</div> : orders.length ? (
            <div className="cp-scroll">
            <table className="cp-t cp-ot">
              <thead><tr>
                <th>#</th><th>Order No</th><th>Order Date</th><th>Customer PO</th><th>PO Date</th>
                <th className="it1">Product</th><th className="r">Qty</th><th>Unit</th><th className="r">Rate</th><th className="r">Amount</th>
                <th className="r ov">Order Value</th><th className="r">Grand Total</th><th>Status</th>
              </tr></thead>
              {/* one line per product; the order's own columns span all its product lines */}
              {orders.map((o, i) => {
                const its = soItems(o);
                const lines = its.length ? its : [null];
                const n = lines.length;
                return (
                  <tbody key={o.orderId || o.orderNo || i} className={i % 2 ? 'alt' : ''}>
                    {lines.map((it, j) => (
                      <tr key={j}>
                        {j === 0 && <>
                          <td rowSpan={n} className="og">{i + 1}</td>
                          <td rowSpan={n} className="og" style={{ fontWeight: 600, color: TEAL }}>{dash(o.orderNo)}</td>
                          <td rowSpan={n} className="og">{fmtDate(o.orderDate)}</td>
                          <td rowSpan={n} className="og">{dash(o.customerPO)}</td>
                          <td rowSpan={n} className="og">{o.poDate ? fmtDate(o.poDate) : '—'}</td>
                        </>}
                        {it ? <>
                          <td className="it1">{dash(it.name)}</td>
                          <td className="r">{fmtQty(it.qty)}</td>
                          <td>{dash(it.unit)}</td>
                          <td className="r">{money(it.rate)}</td>
                          <td className="r">{money(it.amount)}</td>
                        </> : <td colSpan={5} className="it1" style={{ color: '#98A2B3' }}>No products</td>}
                        {j === 0 && <>
                          <td rowSpan={n} className="og r ov">{money(orderValue(o))}</td>
                          <td rowSpan={n} className="og r">{money(o.grandTotal)}</td>
                          <td rowSpan={n} className="og"><span className="cp-st" style={{ background: SO_STATUS[o.status] || '#667085' }}>{o.status || 'draft'}</span></td>
                        </>}
                      </tr>
                    ))}
                  </tbody>
                );
              })}
              <tfoot><tr><td colSpan={10}>Total ({orders.length} orders)</td><td className="r">{money(valueTotal)}</td><td className="r">{money(total)}</td><td /></tr></tfoot>
            </table>
            </div>
          ) : <div className="cp-msg">No sales orders for this client.</div>}
        </div>
      </div>
    </div>
  );
}


/* ── Create Client: same fields as the client list + any number of contact persons
   and documents. Saves like the classic form (POST /api/clients) as a draft or for approval. ── */
export const DOC_TYPES = ['GST Certificate', 'PAN Card', 'Cancelled Cheque', 'MSME Certificate', 'Incorporation Certificate', 'Agreement', 'Other'];
export const MAX_MB = 10;
export const REG_TYPES = ['Regular', 'Composition', 'Consumer', 'Unregistered', 'Unknown'];
export const NO_GSTIN = ['Consumer', 'Unregistered', 'Unknown'];   // registration types that have no GSTIN (as in Tally)
const EMPTY = {
  clientName: '', alias: '', mailingName: '', vendorCode: '',
  regType: 'Regular', gstin: '', pan: '', tds: 'No',
  address: '', city: '', state: '', pincode: '', country: 'India',
  obAmount: '', obType: 'Dr',
};
export const blankContact = () => ({ key: Math.random().toString(36).slice(2), name: '', designation: '', mobile: '', email: '' });
export const fileSize = b => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

export const CF_CSS = `
.cf { flex:1; min-height:0; overflow-y:auto; background:#EEF4F4; display:flex; flex-direction:column; }
.cf-in { flex:1; padding:14px 16px 18px; }

/* hero */
.cf-hero { display:flex; align-items:center; gap:14px; padding:16px 20px; margin-bottom:14px; border-radius:10px; color:#fff;
  background:linear-gradient(120deg, ${TEAL} 0%, #05606F 60%, #0A7A86 100%); box-shadow:0 6px 18px rgba(3,68,79,.22); position:relative; overflow:hidden; }
.cf-hero::after { content:''; position:absolute; right:-60px; top:-80px; width:260px; height:260px; border-radius:50%; background:rgba(255,255,255,.06); }
.cf-hero::before { content:''; position:absolute; right:120px; bottom:-110px; width:200px; height:200px; border-radius:50%; background:rgba(255,255,255,.05); }
.cf-hero .ic { width:46px; height:46px; border-radius:12px; display:grid; place-items:center; background:rgba(255,255,255,.14); border:1px solid rgba(255,255,255,.22); flex-shrink:0; }
.cf-hero h1 { margin:0; font-size:19px; font-weight:700; letter-spacing:.2px; }
.cf-hero p { margin:3px 0 0; font-size:12.5px; color:rgba(255,255,255,.78); }
.cf-hero .grow { flex:1; }
.cf-chip { position:relative; z-index:1; display:flex; flex-direction:column; align-items:flex-end; padding:7px 14px; border-radius:8px; background:rgba(255,255,255,.12); border:1px solid rgba(255,255,255,.22); }
.cf-chip small { font-size:10.5px; color:rgba(255,255,255,.72); text-transform:uppercase; letter-spacing:.6px; }
.cf-chip b { font-size:17px; font-family:ui-monospace, Consolas, monospace; letter-spacing:.5px; }
.cf-pill { position:relative; z-index:1; padding:4px 10px; border-radius:99px; background:#FDE68A; color:#7A4B00; font-size:11px; font-weight:700; }

/* layout */
.cf-cols { display:grid; grid-template-columns:1.15fr 1fr; gap:14px; align-items:start; }
.cf-col { display:flex; flex-direction:column; gap:14px; min-width:0; }
.cf-full { margin-top:14px; }

.cf-card { background:#fff; border:1px solid #D7E3E5; border-radius:10px; overflow:hidden; box-shadow:0 1px 3px rgba(16,24,40,.05); }
.cf-ch { display:flex; align-items:center; gap:10px; padding:11px 14px; border-bottom:1px solid #EDF2F3; background:linear-gradient(180deg, #FBFDFD, #F5F9F9); }
.cf-ch .ico { width:30px; height:30px; border-radius:8px; display:grid; place-items:center; background:#E1EFF0; color:${TEAL}; flex-shrink:0; }
.cf-ch .t b { display:block; font-size:13.5px; color:#101828; }
.cf-ch .t small { display:block; font-size:11.5px; color:#667085; margin-top:1px; }
.cf-ch .cnt { padding:2px 8px; border-radius:99px; background:#E1EFF0; color:${TEAL}; font-size:11px; font-weight:700; }
.cf-ch .grow { flex:1; }
.cf-grid { display:grid; grid-template-columns:repeat(2, 1fr); gap:12px 14px; padding:14px; }
.cf-f { display:flex; flex-direction:column; gap:5px; min-width:0; }
.cf-f.w2 { grid-column:span 2; }
.cf-f label { font-size:11.5px; font-weight:600; color:#344054; }
.cf-f label i { color:#D92D20; font-style:normal; }
.cf-f .hint { font-size:10.5px; color:#98A2B3; }
.cf input, .cf select, .cf textarea { height:34px; padding:0 10px; border:1px solid #C9D7DA; border-radius:6px; background:#fff; outline:none;
  font:400 13px ${F}; color:#101828; width:100%; transition:border-color .15s, box-shadow .15s, background .15s; }
.cf input::placeholder, .cf textarea::placeholder { color:#A0AEB3; }
.cf textarea { height:auto; min-height:62px; padding:8px 10px; resize:vertical; line-height:1.45; }
.cf input:hover, .cf select:hover, .cf textarea:hover { border-color:#9DBDC1; }
.cf input:focus, .cf select:focus, .cf textarea:focus { border-color:${TEAL}; box-shadow:0 0 0 3px rgba(3,68,79,.12); }
.cf input:disabled, .cf select:disabled { background:#F2F6F6; color:#98A2B3; }
.cf .mono { font-family:ui-monospace, Consolas, monospace; letter-spacing:.4px; }
.cf .bad { border-color:#D92D20 !important; background:#FFFBFA; }
.cf-err { font-size:10.5px; color:#D92D20; }
.cf-amt { display:flex; }
.cf-amt input { border-radius:6px 0 0 6px; text-align:right; }
.cf-amt select { width:66px; flex-shrink:0; border-radius:0 6px 6px 0; border-left:0; background:#F5F9F9; font-weight:600; }

/* segmented Yes / No */
.cf-seg { display:inline-flex; height:34px; border:1px solid #C9D7DA; border-radius:6px; overflow:hidden; }
.cf-seg button { flex:1; min-width:58px; border:0; background:#fff; cursor:pointer; font:600 12.5px ${F}; color:#475467; }
.cf-seg button + button { border-left:1px solid #C9D7DA; }
.cf-seg button.on { background:${TEAL}; color:#fff; }

/* contacts */
.cf-ct { width:100%; border-collapse:collapse; }
.cf-ct th { text-align:left; font-size:11px; font-weight:700; color:#475467; text-transform:uppercase; letter-spacing:.4px; padding:9px 6px 7px; background:#F7FAFA; border-bottom:1px solid #EDF2F3; }
.cf-ct th:first-child, .cf-ct td:first-child { padding-left:14px; width:44px; }
.cf-ct td { padding:7px 6px; vertical-align:top; border-bottom:1px solid #F2F5F5; }
.cf-ct tbody tr:hover td { background:#FAFCFC; }
.cf-ct td:last-child, .cf-ct th:last-child { width:48px; padding-right:12px; text-align:center; }
.cf-av { width:26px; height:26px; margin-top:4px; border-radius:50%; display:grid; place-items:center; background:#E1EFF0; color:${TEAL}; font-size:11px; font-weight:700; }
.cf-rm { width:32px; height:32px; border:1px solid transparent; border-radius:6px; background:none; cursor:pointer; color:#98A2B3; font-size:18px; line-height:1; }
.cf-rm:hover { background:#FDECEC; border-color:#F5C2C0; color:#D92D20; }
.cf-add { display:inline-flex; align-items:center; gap:6px; height:30px; padding:0 13px; border:1px solid ${TEAL}; border-radius:6px; background:#fff; color:${TEAL}; cursor:pointer; font:600 12px ${F}; }
.cf-add:hover { background:${TEAL}; color:#fff; }

/* documents */
.cf-drop { margin:14px; padding:20px 14px; border:1.5px dashed #9DBDC1; border-radius:10px; background:#F7FBFB; text-align:center; cursor:pointer; transition:background .15s, border-color .15s; }
.cf-drop:hover, .cf-drop.over { background:#E8F3F4; border-color:${TEAL}; }
.cf-drop .ic { width:42px; height:42px; margin:0 auto 8px; border-radius:50%; display:grid; place-items:center; background:#fff; border:1px solid #D7E3E5; color:${TEAL}; box-shadow:0 2px 6px rgba(3,68,79,.1); }
.cf-drop b { display:block; font-size:13px; color:#101828; }
.cf-drop b u { color:${TEAL}; text-decoration:underline; text-underline-offset:2px; }
.cf-drop small { display:block; margin-top:3px; font-size:11.5px; color:#667085; }
.cf-files { padding:0 14px 14px; display:flex; flex-direction:column; gap:6px; }
.cf-file { display:grid; grid-template-columns:36px 1fr 170px 32px; align-items:center; gap:10px; padding:7px 8px; border:1px solid #E3ECED; border-radius:8px; background:#fff; }
.cf-file .ext { width:36px; height:36px; border-radius:6px; display:grid; place-items:center; background:${TEAL}; color:#fff; font-size:9.5px; font-weight:700; text-transform:uppercase; }
.cf-file .nm { min-width:0; }
.cf-file .nm b { display:block; font-size:12.5px; font-weight:500; color:#101828; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.cf-file .nm small { font-size:11px; color:#667085; }

/* bottom bar */
.cf-bar { position:sticky; bottom:0; display:flex; align-items:center; gap:8px; padding:10px 16px; background:rgba(255,255,255,.97); border-top:1px solid #D7E3E5; box-shadow:0 -4px 14px rgba(16,24,40,.06); }
.cf-bar .info { flex:1; font-size:12px; color:#667085; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.cf-b { height:36px; padding:0 18px; border-radius:6px; cursor:pointer; font:600 13px ${F}; border:1px solid transparent; white-space:nowrap; transition:background .15s; }
.cf-b.ghost { background:#fff; border-color:#C9D7DA; color:#344054; }
.cf-b.ghost:hover { background:#F7FAFA; }
.cf-b.draft { background:#fff; border-color:${TEAL}; color:${TEAL}; }
.cf-b.draft:hover { background:#F0F7F7; }
.cf-b.pri { background:${TEAL}; color:#fff; box-shadow:0 2px 6px rgba(3,68,79,.35); }
.cf-b.pri:hover { background:#025763; }
.cf-b:disabled { opacity:.6; cursor:default; }
.cf-msg { margin:0 0 14px; padding:10px 14px; border-radius:8px; font-size:12.5px; font-weight:500; }
.cf-msg.ok { background:#E6F4EA; color:#1E7B34; border:1px solid #B7E1C1; }
.cf-msg.err { background:#FDECEC; color:#B42318; border:1px solid #F5C2C0; }

@media (max-width: 1100px) { .cf-cols { grid-template-columns:1fr; } }
@media (max-width: 700px) {
  .cf-grid { grid-template-columns:1fr; } .cf-f.w2 { grid-column:auto; }
  .cf-hero { flex-wrap:wrap; } .cf-file { grid-template-columns:36px 1fr 32px; } .cf-file select { grid-column:2 / 3; }
  .cf-ct thead { display:none; } .cf-ct tr { display:grid; grid-template-columns:1fr 1fr; gap:6px; padding:8px 12px; border-bottom:1px solid #EDF2F3; }
  .cf-ct td { border:0; padding:0 !important; width:auto !important; } .cf-ct td:first-child { display:none; }
}
/* ── v2: same look as the Create Sales Order form — square boxes, light-teal header bars, label | value rows, no outer gap ── */
.cf-in { padding:0 0 14px; }
.cf-hero { padding:8px 14px; margin-bottom:0; gap:10px; border-radius:0; box-shadow:none; background:linear-gradient(90deg, #1B7682 0%, #3C9AA4 100%); }
.cf-hero::before, .cf-hero::after { display:none; }
.cf-hero .ic { width:28px; height:28px; border-radius:2px; }
.cf-hero h1 { margin:0; font-size:15px; }
.cf-chip { flex-direction:row; align-items:center; gap:8px; padding:3px 10px; border-radius:2px; }
.cf-chip b { font-size:13.5px; }
.cf-pill { border-radius:2px; padding:3px 8px; }
.cf-msg { margin:8px 10px; border-radius:0; }
.cf-2 { display:grid; grid-template-columns:1fr 1fr; gap:0; margin-bottom:10px; align-items:stretch; }
.cf-2 > .cf-card { margin:0; }
.cf-2 > .cf-card + .cf-card { border-left:1px solid #B9CED1; }
.cf-card { border-radius:0; box-shadow:none; border-color:#B9CED1; border-left:none; border-right:none; margin-bottom:10px; }
.cf-ch { padding:6px 10px; background:linear-gradient(90deg, #1B7682 0%, #3C9AA4 100%); border-bottom:none; }
.cf-ch .ico { width:22px; height:22px; border-radius:2px; background:rgba(255,255,255,.16); color:#fff; }
.cf-ch .t b { color:#fff; font-size:13px; }
.cf-ch .cnt { background:rgba(255,255,255,.2); color:#fff; border-radius:2px; }
.cf-ch .cf-add { background:#fff; border-color:#fff; color:${TEAL}; height:24px; border-radius:2px; }
.cf-ch .cf-add:hover { background:#E1EFF0; color:${TEAL}; }
.cf input, .cf select, .cf textarea, .cf-b, .cf-rm, .cf-seg, .cf-file, .cf-file .ext, .cf-drop { border-radius:2px; }
.cf-amt input { border-radius:2px 0 0 2px; } .cf-amt select { border-radius:0 2px 2px 0; }
.cf-kv { width:100%; border-collapse:collapse; table-layout:fixed; }
.cf-kv th { width:130px; padding:7px 10px; background:#F4F8F8; border:1px solid #DCE6E8; text-align:left; vertical-align:middle; font-size:12px; font-weight:600; color:#344054; }
.cf-kv th i { color:#D92D20; font-style:normal; }
.cf-kv td { padding:5px 7px; border:1px solid #DCE6E8; vertical-align:middle; }
.cf-kv tr:first-child th, .cf-kv tr:first-child td { border-top:none; }
.cf-kv tr > :first-child { border-left:none; } .cf-kv tr > :last-child { border-right:none; }
.cf-kv tr:last-child th, .cf-kv tr:last-child td { border-bottom:none; }
.cf-kv input, .cf-kv select, .cf-kv .cf-seg { height:30px; }
.cf-kv textarea { min-height:46px; }
.cf-kv td.cf-note { font-size:11px; color:#667085; background:#FAFCFC; padding:6px 10px; }
.cf-seg { display:flex; width:100%; }
.cf-drop { margin:10px; padding:14px 12px; }
.cf-drop b { display:inline-flex; align-items:center; gap:6px; }
.cf-files { padding:0 10px 10px; }
.cf-ct th { background:#D4EBEE; color:#000; font-size:11.5px; font-weight:700; border-bottom:1px solid #A9CDD2; padding:7px 6px; }
.cf-ct td.sn { padding-left:14px; padding-top:14px; font-size:12px; color:#667085; }
@media (max-width: 600px) { .gp-t th { width:120px; } }
@media (max-width: 1100px) { .cf-2 { grid-template-columns:1fr; } .cf-2 > .cf-card + .cf-card { border-left:none; border-top:1px solid #B9CED1; } }
`;


/* saved client record → form values (edit mode) */
const fromClient = c => ({
  clientName: c.companyName || c.clientName || '', alias: c.alias || '', mailingName: c.mailingName || '',
  vendorCode: c.epsilonVendorCode || '', regType: REG_TYPES.includes(c.gstType) ? c.gstType : 'Regular',
  gstin: c.gstin || c.gst || '', pan: c.pan || '', tds: c.tdsApplicable === true || c.tdsApplicable === 'true' ? 'Yes' : 'No',
  address: c.address || c.billingAddr || '', city: c.city || '', state: c.state || '', pincode: String(c.pincode || ''),
  country: c.country || 'India', obAmount: Number(c.openingBalance) ? String(c.openingBalance) : '', obType: c.openingBalanceType === 'Cr' ? 'Cr' : 'Dr',
});
const contactsFrom = c => {
  const list = (c.contactPersons || []).filter(p => p && (p.name || p.mobileNumber || p.email))
    .map(p => ({ ...blankContact(), name: p.name || '', designation: p.designation || '', mobile: p.mobileNumber || '', email: p.email || '' }));
  return list.length ? list : [blankContact()];
};

function CreateClient({ companyId, onSaved, editClient, onClose }) {
  const isEdit = !!editClient;
  const { user } = useAuth() || {};
  const canApprove = can(user, 'client', 'approve');   // "Save & Approve" only for users with Client approve rights
  const [v, setV] = useState(() => (isEdit ? fromClient(editClient) : EMPTY));
  const [contacts, setContacts] = useState(() => (isEdit ? contactsFrom(editClient) : [blankContact()]));
  const [files, setFiles] = useState([]);          // [{ key, file, type }] — new uploads
  const [oldDocs, setOldDocs] = useState(() => (isEdit ? (editClient.documents || []).filter(Boolean) : []));   // already saved
  const [nextId, setNextId] = useState('');
  const [errs, setErrs] = useState({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [over, setOver] = useState(false);
  const fileRef = React.useRef(null);
  /* Fetch from GST → Import: fills name, trade name, registration type, PAN and address */
  const gstImport = (g, a) => {
    setV(o => ({
      ...o, gstin: g.gstin, clientName: g.legalName || o.clientName,
      alias: g.tradeName && g.tradeName.toLowerCase() !== String(g.legalName || '').toLowerCase() ? g.tradeName : o.alias,
      regType: /composition/i.test(g.taxpayerType || '') ? 'Composition' : 'Regular',
      pan: g.gstin.slice(2, 12),
      address: a.address || o.address, city: a.city || o.city, state: a.state || o.state, pincode: a.pincode || o.pincode, country: 'India',
    }));
    setErrs({}); setMsg({ ok: true, text: `Details of ${g.gstin} imported from the GST portal — check them and save.` });
  };

  const loadNextId = () => axios.get('/api/clients/next-id', { params: { companyId } }).then(r => setNextId(r.data?.nextId || '')).catch(() => setNextId(''));
  useEffect(() => { if (!isEdit) loadNextId(); }, [companyId]);   // eslint-disable-line react-hooks/exhaustive-deps

  const clean = (k, val) => {
    if (k === 'gstin') return val.toUpperCase().replace(/\s/g, '').slice(0, 15);
    if (k === 'pan') return val.toUpperCase().replace(/\s/g, '').slice(0, 10);
    if (k === 'pincode') return val.replace(/\D/g, '').slice(0, 6);
    if (k === 'mobile') return val.replace(/[^\d+]/g, '').slice(0, 13);
    if (k === 'obAmount') return val.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1');
    return val;
  };
  const set = k => e => {
    const val = clean(k, e.target.value);
    setV(o => {
      const n = { ...o, [k]: val };
      // PAN sits inside the GSTIN (characters 3-12) — fill it while the PAN still follows the GSTIN
      if (k === 'gstin' && (!o.pan || o.pan === o.gstin.slice(2, 12))) n.pan = val.length >= 12 ? val.slice(2, 12) : '';
      if (k === 'regType' && NO_GSTIN.includes(val)) n.gstin = '';
      return n;
    });
    setErrs(o => ({ ...o, [k]: undefined })); setMsg(null);
  };
  const setC = (i, k) => e => {
    const val = clean(k, e.target.value);
    setContacts(cs => cs.map((c, j) => (j === i ? { ...c, [k]: val } : c)));
    setErrs(o => ({ ...o, [`c${i}${k}`]: undefined })); setMsg(null);
  };

  const addFiles = list => {
    const ok = [], tooBig = [];
    [...(list || [])].forEach(f => (f.size > MAX_MB * 1048576 ? tooBig.push(f.name) : ok.push({ key: Math.random().toString(36).slice(2), file: f, type: '' })));
    if (ok.length) setFiles(fs_ => [...fs_, ...ok]);
    setMsg(tooBig.length ? { ok: false, text: `Too large (over ${MAX_MB} MB): ${tooBig.join(', ')}` } : null);
  };

  const check = () => {
    const e = {};
    if (!v.clientName.trim()) e.clientName = 'Enter the customer name';
    if (v.gstin && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/.test(v.gstin)) e.gstin = '15 characters, e.g. 24AAAFE1234K1Z5';
    if (v.pan && !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(v.pan)) e.pan = '10 characters, e.g. AAAFE1234K';
    if (v.gstin && v.pan && v.gstin.length === 15 && v.gstin.slice(2, 12) !== v.pan) e.pan = 'PAN does not match the GSTIN';
    if (v.pincode && v.pincode.length !== 6) e.pincode = 'Pincode must be 6 digits';
    if (v.obAmount && isNaN(parseFloat(v.obAmount))) e.obAmount = 'Enter an amount';
    contacts.forEach((c, i) => {
      if (c.mobile && c.mobile.replace(/\D/g, '').length < 10) e[`c${i}mobile`] = 'Enter a 10-digit number';
      if (c.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email)) e[`c${i}email`] = 'Enter a valid email';
      if (!c.name.trim() && (c.designation || c.mobile || c.email)) e[`c${i}name`] = 'Enter the name';
    });
    files.forEach((f, i) => { if (!f.type) e[`f${i}`] = 'Choose document type'; });
    setErrs(e);
    return !Object.keys(e).length;
  };

  const reset = () => { setV(EMPTY); setContacts([blankContact()]); setFiles([]); setErrs({}); };

  const save = async status => {
    if (!check()) { setMsg({ ok: false, text: 'Please correct the fields marked in red.' }); return; }
    setBusy(true); setMsg(null);
    try {
      const fd = new FormData();
      fd.append('companyId', companyId);
      fd.append('clientName', v.clientName.trim());
      fd.append('alias', v.alias.trim());
      fd.append('mailingName', v.mailingName.trim() || v.clientName.trim());
      fd.append('epsilonVendorCode', v.vendorCode.trim());
      fd.append('gstType', v.regType);
      fd.append('gstin', v.gstin);
      fd.append('gstRegistered', NO_GSTIN.includes(v.regType) ? 'false' : 'true');
      fd.append('pan', v.pan);
      fd.append('tdsApplicable', v.tds === 'Yes' ? 'true' : 'false');
      fd.append('address', v.address.trim());
      fd.append('city', v.city.trim());
      fd.append('state', v.state);
      fd.append('pincode', v.pincode);
      fd.append('country', v.country.trim() || 'India');
      fd.append('openingBalance', v.obAmount || '0');
      fd.append('openingBalanceType', v.obType);
      if (status) fd.append('status', status);   // edit: not sent → the server keeps the current status
      fd.append('contactPersons', JSON.stringify(contacts.filter(c => c.name.trim())
        .map(c => ({ name: c.name.trim(), designation: c.designation.trim(), mobileNumber: c.mobile, email: c.email.trim() }))));
      if (isEdit) {
        fd.append('documentsJson', JSON.stringify(oldDocs));             // saved documents that were kept
        fd.append('fileNames', JSON.stringify(files.map(f => f.type)));  // names for the new uploads
        files.forEach(f => fd.append('newFiles', f.file));
        await axios.put(`/api/clients/${editClient.clientId}`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
        setFiles([]);
        setMsg({ ok: true, text: `Client ${editClient.clientId} updated.` });
        onSaved();
      } else {
        fd.append('documentsJson', JSON.stringify(files.map(f => ({ name: f.type, type: f.type, originalName: f.file.name }))));
        files.forEach(f => fd.append('documents', f.file));
        const r = await axios.post('/api/clients', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
        setMsg({ ok: true, text: `Client ${r.data?.clientId || ''} saved ${status === 'pending' ? 'and sent for approval' : status === 'approved' ? 'and approved' : 'as draft'}.` });
        reset();
        loadNextId();
        onSaved();
      }
    } catch (e) {
      setMsg({ ok: false, text: e.response?.data?.error || 'Could not save the client. Try again.' });
    } finally { setBusy(false); }
  };

  const inp = (k, { className = '', ...props } = {}) => <input id={`cf-${k}`} value={v[k]} onChange={set(k)} disabled={busy} {...props} className={`${className}${errs[k] ? ' bad' : ''}`} />;
  const err = k => errs[k] && <span className="cf-err">{errs[k]}</span>;
  const filled = contacts.filter(c => c.name.trim()).length;

  const head = (icon, title, sub, extra) => (
    <div className="cf-ch">
      <span className="ico"><Svg name={icon} size={16} /></span>
      <span className="t"><b>{title}</b>{sub && <small>{sub}</small>}</span>
      {extra}
    </div>
  );
  const noGst = NO_GSTIN.includes(v.regType);

  return (
    <div className="cf">
      <style>{CF_CSS}</style>
      <div className="cf-in">
        <div className="cf-hero">
          <span className="ic"><Svg name="users" size={16} /></span>
          <h1>{isEdit ? 'Edit Client' : 'Create Client'}</h1>
          <span className="grow" />
          {!noGst && <GstFetch companyId={companyId} gstin={v.gstin} disabled={busy} onImport={gstImport} title="Fill the client from the GST portal"
            fills="Import fills Cust Name, Alias (trade name), Registration Type, PAN, Address, City, State and Pincode. Nothing is saved until you save the client." />}
          <span className="cf-pill">{isEdit ? (STATUS[editClient.status] || STATUS.draft).label : 'New'}</span>
          <div className="cf-chip"><small>Client ID</small><b>{isEdit ? editClient.clientId : (nextId || 'Auto')}</b></div>
        </div>

        {msg && <div className={`cf-msg ${msg.ok ? 'ok' : 'err'}`} role="status">{msg.text}</div>}

        {/* client | tax  (label | value rows, like the Sales Order form) */}
        <div className="cf-2">
          <div className="cf-card">
            {head('user', 'Client Details')}
            <table className="cf-kv"><tbody>
              <tr><th>Cust Name <i>*</i></th><td colSpan={3}>{inp('clientName', { placeholder: 'Customer / company name', autoFocus: true })}{err('clientName')}</td></tr>
              <tr><th>Alias</th><td>{inp('alias')}</td><th>Mailing Name</th><td>{inp('mailingName', { placeholder: v.clientName.trim() || 'Printed on bills' })}</td></tr>
              <tr><th>Epsilon Vendor Code</th><td>{inp('vendorCode')}</td><th>Opening Balance</th><td>
                <div className="cf-amt">
                  {inp('obAmount', { inputMode: 'decimal', placeholder: '0.00' })}
                  <select aria-label="Debit or credit" value={v.obType} onChange={set('obType')} disabled={busy}><option value="Dr">Dr</option><option value="Cr">Cr</option></select>
                </div>
                {err('obAmount')}
              </td></tr>
            </tbody></table>
          </div>

          <div className="cf-card">
            {head('shield', 'Tax Registration')}
            <table className="cf-kv"><tbody>
              <tr><th>Registration Type</th><td>
                <select id="cf-regType" value={v.regType} onChange={set('regType')} disabled={busy}>{REG_TYPES.map(t => <option key={t} value={t}>{t}</option>)}</select>
              </td><th>Is TDS Deductable</th><td>
                <div className="cf-seg" role="radiogroup" aria-label="Is TDS deductable">
                  {['No', 'Yes'].map(o => (
                    <button key={o} type="button" role="radio" aria-checked={v.tds === o} className={v.tds === o ? 'on' : ''} disabled={busy}
                      onClick={() => set('tds')({ target: { value: o } })}>{o}</button>
                  ))}
                </div>
              </td></tr>
              <tr><th>GSTIN / UIN</th><td>{inp('gstin', { placeholder: noGst ? 'Not needed' : '24AAAFE1234K1Z5', className: 'mono', disabled: busy || noGst })}{err('gstin')}</td>
                <th>PAN / IT No.</th><td>{inp('pan', { placeholder: 'AAAFE1234K', className: 'mono' })}{err('pan')}</td></tr>
              <tr><td colSpan={4} className="cf-note">{noGst ? `GSTIN is not applicable for ${v.regType}.` : 'PAN fills in from the GSTIN (characters 3 – 12).'}</td></tr>
            </tbody></table>
          </div>
        </div>

        {/* address | documents */}
        <div className="cf-2">
          <div className="cf-card">
            {head('globe', 'Address')}
            <table className="cf-kv"><tbody>
              <tr><th>Address</th><td colSpan={3}><textarea id="cf-address" value={v.address} onChange={set('address')} disabled={busy} placeholder="Building, street, area" rows={2} /></td></tr>
              <tr><th>City</th><td>{inp('city')}</td><th>Pincode</th><td>{inp('pincode', { inputMode: 'numeric' })}{err('pincode')}</td></tr>
              <tr><th>State</th><td>
                <select id="cf-state" value={v.state} onChange={set('state')} disabled={busy}><option value="">Select state</option>{STATES.map(s => <option key={s} value={s}>{s}</option>)}</select>
              </td><th>Country</th><td>{inp('country')}</td></tr>
            </tbody></table>
          </div>

          <div className="cf-card">
            {head('file', 'Documents', null, files.length + oldDocs.length ? <><span className="grow" /><span className="cnt">{files.length + oldDocs.length} file{files.length + oldDocs.length > 1 ? 's' : ''}</span></> : null)}
            <div className={`cf-drop${over ? ' over' : ''}`} role="button" tabIndex={0}
              onClick={() => fileRef.current?.click()} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileRef.current?.click(); } }}
              onDragOver={e => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
              onDrop={e => { e.preventDefault(); setOver(false); addFiles(e.dataTransfer.files); }}>
              <b><Svg name="plus" size={14} stroke={2.2} /> Drag files here or <u>browse</u></b>
              <small>GST certificate, PAN, cancelled cheque… PDF, image, Word or Excel — up to {MAX_MB} MB each</small>
              <input ref={fileRef} type="file" multiple hidden accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx"
                onChange={e => { addFiles(e.target.files); e.target.value = ''; }} />
            </div>
            {(oldDocs.length > 0 || files.length > 0) && (
              <div className="cf-files">
                {oldDocs.map((d, i) => (
                  <div className="cf-file" key={(d.fileName || d.name || '') + i}>
                    <span className="ext" style={{ background: '#E1EFF0', color: TEAL }}>{String(d.fileName || d.name || 'file').split('.').pop().slice(0, 4)}</span>
                    <span className="nm"><b title={d.fileName || d.name}>{d.name || d.fileName || 'Document'}</b><small>Saved</small></span>
                    <span />
                    <button type="button" className="cf-rm" title="Remove from this client" aria-label={`Remove ${d.name || 'document'}`} onClick={() => setOldDocs(xs => xs.filter((_, j) => j !== i))}>×</button>
                  </div>
                ))}
                {files.map((f, i) => (
                  <div className="cf-file" key={f.key}>
                    <span className="ext">{(f.file.name.split('.').pop() || 'file').slice(0, 4)}</span>
                    <span className="nm"><b title={f.file.name}>{f.file.name}</b><small>{fileSize(f.file.size)}</small></span>
                    <span>
                      <select value={f.type} disabled={busy} className={errs[`f${i}`] ? 'bad' : ''} aria-label={`Type of ${f.file.name}`}
                        onChange={e => { const t = e.target.value; setFiles(xs => xs.map((x, j) => (j === i ? { ...x, type: t } : x))); setErrs(o => ({ ...o, [`f${i}`]: undefined })); }}>
                        <option value="">Document type…</option>
                        {DOC_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                      {err(`f${i}`)}
                    </span>
                    <button type="button" className="cf-rm" title="Remove file" aria-label={`Remove ${f.file.name}`} onClick={() => setFiles(xs => xs.filter((_, j) => j !== i))}>×</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* contacts — full width */}
        <div className="cf-card">
          {head('users', 'Contact Persons', null, <>
            {filled > 0 && <span className="cnt">{filled} added</span>}
            <span className="grow" />
            <button type="button" className="cf-add" disabled={busy} onClick={() => setContacts(cs => [...cs, blankContact()])}>+ Add contact</button>
          </>)}
          <table className="cf-ct">
            <thead><tr><th>#</th><th>Contact Name</th><th>Designation</th><th>Number</th><th>Email</th><th /></tr></thead>
            <tbody>
              {contacts.map((c, i) => (
                <tr key={c.key}>
                  <td className="sn">{i + 1}</td>
                  <td><input value={c.name} onChange={setC(i, 'name')} disabled={busy} placeholder="Full name" className={errs[`c${i}name`] ? 'bad' : ''} aria-label={`Contact ${i + 1} name`} />{err(`c${i}name`)}</td>
                  <td><input value={c.designation} onChange={setC(i, 'designation')} disabled={busy} placeholder="e.g. Purchase Manager" aria-label={`Contact ${i + 1} designation`} /></td>
                  <td><input value={c.mobile} onChange={setC(i, 'mobile')} disabled={busy} inputMode="tel" placeholder="10-digit mobile" className={errs[`c${i}mobile`] ? 'bad' : ''} aria-label={`Contact ${i + 1} number`} />{err(`c${i}mobile`)}</td>
                  <td><input value={c.email} onChange={setC(i, 'email')} disabled={busy} type="email" placeholder="name@company.com" className={errs[`c${i}email`] ? 'bad' : ''} aria-label={`Contact ${i + 1} email`} />{err(`c${i}email`)}</td>
                  <td>{contacts.length > 1 && <button type="button" className="cf-rm" title="Remove contact" aria-label={`Remove contact ${i + 1}`} onClick={() => setContacts(cs => cs.filter((_, j) => j !== i))}>×</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="cf-bar">
        <span className="info">{v.clientName.trim() ? <>New client: <b style={{ color: '#101828' }}>{v.clientName.trim()}</b>{v.gstin ? ` · ${v.gstin}` : ''}{v.city ? ` · ${v.city}` : ''}</> : 'Fill in the client details'}</span>
        {isEdit ? <>
          <button type="button" className="cf-b ghost" disabled={busy} onClick={onClose}>Back to list</button>
          <button type="button" className="cf-b pri" disabled={busy} onClick={() => save(null)}>{busy ? 'Saving…' : 'Save Changes'}</button>
          {canApprove && editClient.status === 'pending' && <button type="button" className="cf-b pri" style={{ background: '#16A34A' }} disabled={busy} onClick={() => save('approved')}>✓ Save &amp; Approve</button>}
        </> : <>
          <button type="button" className="cf-b ghost" disabled={busy} onClick={() => { reset(); setMsg(null); }}>Clear</button>
          <button type="button" className="cf-b draft" disabled={busy} onClick={() => save('draft')}>Save Draft</button>
          <button type="button" className="cf-b pri" disabled={busy} onClick={() => save('pending')}>{busy ? 'Saving…' : 'Submit for Approval'}</button>
          {canApprove && <button type="button" className="cf-b pri" style={{ background: '#16A34A' }} disabled={busy} onClick={() => save('approved')}>✓ Save &amp; Approve</button>}
        </>}
      </div>
    </div>
  );
}
