/* Beta — Deposits: Bank Guarantee / Fixed Deposit / Security Deposit / EMD (Sales Order → BG / FD / SD).
 * The same Deposit records (/api/deposits) the classic Deposit page shows; a switch picks the type.
 * List with search + status filter, Print list, Print ▾ (BG letters, soft copy); Add / Edit. */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useCompany } from '../../context/CompanyContext';
import { useAuth } from '../../context/AuthContext';
import { can } from '../../utils/permissions';
import { Svg } from '../../components/ui/Icon';
import { CSS as SALES_CSS, useClearSel } from './BetaSales';
import { PX_CSS } from './BetaPurchaseParts';
import { printBgList, printDepList, printBgLetter, printBgRelease, openBgSoftCopy, bgState, bgExpiry, daysTo, dmy, BG_TYPES } from './BetaCertPrint';

/* deposit types: key (as saved), short name, full name */
const DTYPES = [['BG', 'BG', 'Bank Guarantee'], ['FD', 'FD', 'Fixed Deposit'], ['Security', 'SD', 'Security Deposit'], ['EMD', 'EMD', 'EMD']];
const PAY_MODES = ['Demand Draft (DD)', 'RTGS', 'NEFT', 'IMPS', 'Cheque', 'Cash'];
const typeOf = k => DTYPES.find(t => t[0] === k) || DTYPES[0];

const amt = v => (Number(v) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const STATES = [['', 'All'], ['live', 'Live (active + expiring)'], ['expiring', 'Expiring ≤ 30 days'], ['expired', 'Expired'], ['pending', 'Pending approval'], ['released', 'Released']];
const PILL = { active: ['#ECFDF3', '#067647'], expiring: ['#FFFAEB', '#B54708'], expired: ['#FEF3F2', '#B42318'], pending: ['#EFF8FF', '#175CD3'], released: ['#F2F4F7', '#475467'], claimed: ['#FEF3F2', '#B42318'] };
const EXTRA_CSS = `
.bgx td { white-space:normal; overflow-wrap:anywhere; line-height:1.35; } .bgx td.d { white-space:nowrap; } .bgx th { font-size:10.5px; white-space:normal; } .bgx .b { font-weight:700; } .bgx .sm { display:block; font-size:11px; color:#667085; }
.bgx tbody tr:hover td { background:#F0F7F8; }
.bgx tbody tr.sel td { background:#D4EBEE !important; } .bgx tbody tr.sel td:first-child { box-shadow:inset 3px 0 0 #03444f; }
.bg-pm { position:relative; display:flex; align-self:stretch; }
.bg-pm-list { position:absolute; right:0; top:calc(100% + 4px); z-index:50; min-width:250px; background:#fff; border:1px solid #DCE6E8; border-radius:8px; box-shadow:0 10px 24px rgba(16,24,40,.16); padding:4px; }
.bg-pm-list button { display:block; width:100%; text-align:left; border:0; background:none; padding:8px 10px; border-radius:6px; font:600 12.5px Inter, Arial, sans-serif; color:#03444f; cursor:pointer; }
.bg-pm-list button:hover:not(:disabled) { background:#F0F7F8; } .bg-pm-list button:disabled { color:#98A2B3; cursor:default; }
.bg-pm-list button small { display:block; font-weight:400; font-size:11px; color:#667085; margin-top:1px; }
.bg-pm-list hr { border:0; border-top:1px solid #EAECF0; margin:4px 0; }
.bg-ty { display:flex; gap:4px; padding:6px 10px; background:#fff; border-bottom:1px solid #DCE6E8; flex-shrink:0; }
.bg-ty button { border:1px solid #C9D7DA; background:#fff; color:#03444f; font:600 12.5px Inter, Arial, sans-serif; padding:5px 14px; border-radius:99px; cursor:pointer; }
.bg-ty button.on { background:#03444f; border-color:#03444f; color:#fff; } .bg-ty button span { opacity:.75; margin-left:5px; font-weight:500; }
.bg-pill { display:inline-block; padding:2px 8px; border-radius:99px; font-size:11px; font-weight:700; }
.bg-sum { display:flex; flex-wrap:wrap; gap:0; background:#fff; border-bottom:1px solid #DCE6E8; flex-shrink:0; }
.bg-sum div { padding:7px 16px; border-right:1px solid #DCE6E8; font-size:11px; color:#667085; text-transform:uppercase; letter-spacing:.3px; }
.bg-sum b { display:block; font-size:15px; color:#03444f; text-transform:none; letter-spacing:0; }
`;

export default function BetaBG() {
  const navigate = useNavigate();
  const { search } = useLocation();
  const qs = new URLSearchParams(search);
  const tab = qs.get('tab') === 'create' ? 'create' : 'list';
  const type = typeOf(qs.get('type'))[0];
  const [, short, full] = typeOf(type);
  const { selectedCompany } = useCompany() || {};
  const { user } = useAuth() || {};
  const companyId = selectedCompany?.companyId;
  const [deps, setDeps] = useState(null);
  const [orders, setOrders] = useState([]);
  const [reload, setReload] = useState(0);
  const [editing, setEditing] = useState(null);
  const [note, setNote] = useState(null);
  const [slot, setSlot] = useState(null);
  const canAdd = can(user, 'accDeposit', 'create');

  useEffect(() => {
    if (!companyId) return;
    axios.get('/api/deposits', { params: { companyId } })
      .then(r => setDeps((Array.isArray(r.data) ? r.data : []).filter(d => d.status !== 'deleted')))
      .catch(() => setDeps([]));
  }, [companyId, reload]);
  useEffect(() => {
    if (!companyId) return;
    axios.get('/api/sales-orders', { params: { companyId } }).then(r => setOrders(Array.isArray(r.data) ? r.data : [])).catch(() => setOrders([]));
  }, [companyId]);

  const rows = deps && deps.filter(d => (d.depositType || 'BG') === type);
  const count = k => (deps || []).filter(d => (d.depositType || 'BG') === k).length;
  const cur = editing ? 'create' : (tab === 'create' && canAdd ? 'create' : 'list');
  const go = (k, t = type) => { setEditing(null); navigate(`/beta/bank-guarantee?type=${t}&tab=${k}`); };
  const tabs = [['list', `${full}s`], ...(canAdd || editing ? [['create', editing ? `Edit ${editing.bgNo || editing.fdNo || editing.depositId}` : `Add ${short}`]] : [])];

  return (
    <div className="sb">
      <style>{SALES_CSS + PX_CSS + EXTRA_CSS}</style>
      <div className="sb-tabs" role="tablist">
        {tabs.map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={cur === k} className={`sb-tab${cur === k ? ' on' : ''}`} onClick={() => go(k)}>
            {label}{k === 'list' && rows && <span className="n">{rows.length}</span>}
          </button>
        ))}
        <div className="sb-slot" ref={setSlot} />
      </div>
      <div className="bg-ty" role="group" aria-label="Deposit type">
        {DTYPES.map(([k, sh, fl]) => (
          <button key={k} type="button" className={type === k ? 'on' : ''} aria-pressed={type === k} disabled={!!editing} onClick={() => go(cur === 'create' && !editing ? 'create' : 'list', k)}>
            {fl}{sh !== fl ? ` (${sh})` : ''}<span>{deps ? count(k) : ''}</span>
          </button>
        ))}
      </div>
      {note && <div className="sb-note" role="status">{note}<button type="button" onClick={() => setNote(null)} aria-label="Dismiss">×</button></div>}
      {cur === 'create'
        ? <div className="sb-body">{(editing ? (editing.depositType || 'BG') : type) === 'BG'
            ? <BgForm key={editing ? editing.depositId : 'new'} companyId={companyId} edit={editing} orders={orders}
                onCancel={() => go('list')} onSaved={text => { setReload(x => x + 1); setNote(text); go('list'); }} />
            : <DepForm key={editing ? editing.depositId : `new-${type}`} type={editing ? editing.depositType : type} companyId={companyId} edit={editing} orders={orders}
                onCancel={() => go('list')} onSaved={text => { setReload(x => x + 1); setNote(text); go('list'); }} />}</div>
        : <BgList key={type} type={type} bgs={rows} orders={orders} company={selectedCompany} user={user} slot={slot} companyId={companyId} onChanged={text => { setReload(x => x + 1); setNote(text); }}
            onEdit={b => { setNote(null); setEditing(b); }} />}
    </div>
  );
}

/* list columns of each type after Sr / Order ID / Client / PO Date / PO No.: [heading, width %, value(row), class] */
const COLS = {
  FD: [['FD Date', 7, b => dmy(b.startDate), 'd'], ['FD No.', 10, b => b.fdNo, 'b mono'], ['Amount ₹', 8, b => amt(b.amount), 'r b d'], ['Maturity Date', 7, b => dmy(b.endDate), 'd'],
    ['Interest %', 5, b => (b.interestRate ? `${b.interestRate}%` : ''), 'r d'], ['Bank', 10, b => b.paymentBank], ['Remarks', 14, b => b.remarks]],
  Security: [['SD Date', 7, b => dmy(b.startDate), 'd'], ['Ack / Advice No.', 10, b => b.ackmNo, 'mono'], ['Amount ₹', 8, b => amt(b.amount), 'r b d'], ['SD End Date', 7, b => dmy(b.endDate), 'd'],
    ['Mode', 7, b => b.paymentMode], ['Remarks', 22, b => b.remarks]],
  EMD: [['Submitted', 7, b => dmy(b.startDate), 'd'], ['DD / Ref No.', 10, b => b.paymentRef, 'mono'], ['Amount ₹', 8, b => amt(b.amount), 'r b d'], ['Return Date', 7, b => dmy(b.endDate), 'd'],
    ['Mode', 7, b => b.paymentMode], ['Bank', 9, b => b.paymentBank], ['Remarks', 13, b => b.remarks]],
};

function BgList({ type, bgs, orders, company, user, slot, companyId, onChanged, onEdit }) {
  const [, short, full] = typeOf(type);
  const cols = COLS[type];
  const [q, setQ] = useState('');
  const [st, setSt] = useState('');
  const [selId, setSelId] = useState(null);
  useClearSel(selId, setSelId, '.sb-t tbody tr, .sb-tools, .cpv-ov');
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const list = useMemo(() => (bgs || []).filter(b => {
    const k = bgState(b).k;
    if (st === 'live' ? !['active', 'expiring'].includes(k) : st && k !== st) return false;
    return !words.length || words.every(w => `${b.bgNo} ${b.fdNo} ${b.ackmNo} ${b.paymentRef} ${b.paymentBank} ${b.remarks} ${b.customerName} ${b.orderNo} ${b.customerPO} ${b.issuingBankName} ${b.issuedToBankName} ${b.issuedToBankIfsc} ${b.depositId}`.toLowerCase().includes(w));
  }).sort((a, b) => String(bgExpiry(a) || '9').localeCompare(String(bgExpiry(b) || '9'))), [bgs, st, words.join(' ')]);   // eslint-disable-line react-hooks/exhaustive-deps
  const sel = list.find(b => b.depositId === selId) || null;
  const canEdit = can(user, 'accDeposit', 'edit');
  const sum = k => (bgs || []).filter(b => (k === 'live' ? ['active', 'expiring'].includes(bgState(b).k) : bgState(b).k === k));
  const tot = arr => arr.reduce((t, b) => t + (Number(b.bgAmount || b.amount) || 0), 0);
  const orderOf = b => (b && orders.find(o => String(o.orderId) === String(b.soId))) || null;
  return (
    <>
      {slot && createPortal(<>
        <input className="sb-search" value={q} onChange={e => setQ(e.target.value)} placeholder={`Search ${short} no, client, order, bank…`} aria-label={`Search ${full}s`} />
        <select className="sb-search" style={{ width: 190 }} value={st} onChange={e => setSt(e.target.value)} aria-label="Status">{STATES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        <button type="button" className="sb-tbtn" onClick={() => {
          const filter = (STATES.find(x => x[0] === st) || [])[1];
          const withPo = list.map(b => ({ ...b, poDate: b.poDate || orderOf(b)?.poDate || '' }));
          if (!cols) return printBgList({ rows: withPo, company, user, filter });
          printDepList({ title: `${full.toUpperCase()} LIST`, filter, company, user, total: tot(list),
            heads: ['Order ID', 'Client Name', 'PO Date', 'PO No.', ...cols.map(c => c[0]), 'Status'],
            rows: withPo.map(b => [String(b.orderNo || '').trim(), b.customerName, dmy(b.poDate), b.customerPO, ...cols.map(c => c[2](b) || ''), bgState(b).label]) });
        }}><Svg name="file" size={13} />Print list</button>
        <div className="sb-tools">
          <span className="sb-picked">{sel ? <>Selected: <b>{sel.bgNo || sel.fdNo || sel.ackmNo || sel.paymentRef || sel.depositId}</b></> : `Click a ${short} to select`}</span>
          <PrintMenu type={type} bg={sel} order={orderOf(sel)} company={company} user={user} companyId={companyId} canUpload={canEdit} onUploaded={onChanged} />
          {canEdit && <button type="button" className="sb-tbtn" disabled={!sel} onClick={() => onEdit(sel)}><Svg name="settings" size={13} />Edit</button>}
        </div>
      </>, slot)}
      <div className="bg-sum">
        <div>Live {short}s<b>{sum('live').length} · ₹ {amt(tot(sum('live')))}</b></div>
        <div>{type === 'FD' ? 'Maturing' : 'Expiring'} ≤ 30 days<b style={{ color: '#B54708' }}>{sum('expiring').length}</b></div>
        <div>Expired (not released)<b style={{ color: '#B42318' }}>{sum('expired').length}</b></div>
        <div>Pending approval<b>{sum('pending').length}</b></div>
        <div>Released<b>{sum('released').length}</b></div>
      </div>
      <div className="sb-list">
        {cols ? (
        <table className="sb-t px bgx">
          <colgroup>{[3, 8, 12, 6, 10, ...cols.map(c => c[1]), 7].map((w, i) => <col key={i} style={{ width: `${w}%` }} />)}</colgroup>
          <thead><tr><th className="r">Sr</th><th>Order ID</th><th>Client Name</th><th>PO Date</th><th>PO No.</th>{cols.map(c => <th key={c[0]} className={c[0].includes('₹') || c[0].includes('%') ? 'r' : ''}>{c[0]}</th>)}<th>Status</th></tr></thead>
          <tbody>
            {bgs === null ? <tr><td colSpan={6 + cols.length} className="sb-empty">Loading…</td></tr>
              : !list.length ? <tr><td colSpan={6 + cols.length} className="sb-empty">{q || st ? 'Nothing matches.' : `No ${full.toLowerCase()} yet — click “Add ${short}”.`}</td></tr>
                : list.map((b, i) => {
                  const s = bgState(b), [bg, fg] = PILL[s.k] || PILL.active;
                  return (
                    <tr key={b.depositId} className={selId === b.depositId ? 'sel' : ''} onClick={() => setSelId(b.depositId)} onDoubleClick={() => canEdit && onEdit(b)} style={{ cursor: 'pointer' }}>
                      <td className="r">{i + 1}</td>
                      <td className="mono">{String(b.orderNo || '').trim() || '—'}</td>
                      <td className="b">{b.customerName || '—'}</td>
                      <td className="d">{dmy(b.poDate || orderOf(b)?.poDate) || '—'}</td>
                      <td className="mono">{b.customerPO || '—'}</td>
                      {cols.map(c => <td key={c[0]} className={c[3] || ''}>{c[2](b) || '—'}</td>)}
                      <td><span className="bg-pill" style={{ background: bg, color: fg }}>{s.label}</span></td>
                    </tr>
                  );
                })}
          </tbody>
        </table>
        ) : (
        <table className="sb-t px bgx">
          <colgroup>{[3, 7.5, 8.5, 5.5, 8.5, 5.5, 10, 6.5, 5.5, 5.5, 5.5, 6, 6, 6.5, 5].map((w, i) => <col key={i} style={{ width: `${w}%` }} />)}</colgroup>
          <thead><tr><th className="r">Sr</th><th>Order ID</th><th>Client Name</th><th>PO Date</th><th>PO No.</th><th>BG Date</th><th>BG No.</th><th className="r">Amount ₹</th><th>Expiry Date</th><th>Claim Exp.</th><th>Extended</th><th>Issuing Bank</th><th>Beneficiary Bank</th><th>IFSC Code</th><th>Status</th></tr></thead>
          <tbody>
            {bgs === null ? <tr><td colSpan={15} className="sb-empty">Loading…</td></tr>
              : !list.length ? <tr><td colSpan={15} className="sb-empty">{q || st ? 'Nothing matches.' : 'No bank guarantee yet — click “Add BG”.'}</td></tr>
                : list.map((b, i) => {
                  const s = bgState(b), [bg, fg] = PILL[s.k] || PILL.active;
                  const poDate = b.poDate || orderOf(b)?.poDate;
                  return (
                    <tr key={b.depositId} className={selId === b.depositId ? 'sel' : ''} onClick={() => setSelId(b.depositId)} onDoubleClick={() => canEdit && onEdit(b)} style={{ cursor: 'pointer' }}>
                      <td className="r">{i + 1}</td>
                      <td className="mono" title={b.orderNo}>{String(b.orderNo || '').trim() || '—'}</td>
                      <td className="b" title={b.customerName}>{b.customerName || '—'}</td>
                      <td className="d">{dmy(poDate) || '—'}</td>
                      <td className="mono" title={b.customerPO}>{b.customerPO || '—'}</td>
                      <td className="d">{dmy(b.startDate) || '—'}</td>
                      <td className="b mono" title={b.bgNo}>{b.bgNo || '—'}</td>
                      <td className="r b d">{amt(b.bgAmount || b.amount)}</td>
                      <td className="d">{dmy(b.expiryDate || b.endDate) || '—'}</td>
                      <td className="d">{dmy(b.claimExpiryDate) || '—'}</td>
                      <td className={b.extendedDate ? 'd b' : 'd'}>{dmy(b.extendedDate) || '—'}</td>
                      <td title={b.issuingBankName}>{b.issuingBankName || '—'}</td>
                      <td title={b.issuedToBankName}>{b.issuedToBankName || '—'}</td>
                      <td className="mono" title={b.issuedToBankIfsc}>{b.issuedToBankIfsc || '—'}</td>
                      <td><span className="bg-pill" style={{ background: bg, color: fg }}>{s.label}</span></td>
                    </tr>
                  );
                })}
          </tbody>
        </table>
        )}
      </div>
    </>
  );
}

/* Print ▾ — the documents of the selected BG; each opens in the preview (Save PDF / Print) */
function PrintMenu({ type, bg, order, company, user, companyId, canUpload, onUploaded }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState('');
  const ref = useRef(null), fileRef = useRef(null);
  useEffect(() => {
    if (!open) return;
    const down = e => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const key = e => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', down); document.addEventListener('keydown', key);
    return () => { document.removeEventListener('mousedown', down); document.removeEventListener('keydown', key); };
  }, [open]);
  const soft = bg?.pdfFiles?.length ? bg.pdfFiles[bg.pdfFiles.length - 1] : null;
  const run = async (k, fn) => { setOpen(false); setBusy(k); try { await fn(); } catch { alert('Could not open this document.'); } finally { setBusy(''); } };
  const upload = async e => {
    const file = e.target.files?.[0]; e.target.value = '';
    if (!file || !bg) return;
    setBusy('up');
    try {
      const fd = new FormData(); fd.append('file', file);
      await axios.post(`/api/deposits/${bg.depositId}/upload`, fd, { params: { companyId } });
      onUploaded(`Soft copy uploaded for ${typeOf(type)[1]} ${bg.bgNo || bg.fdNo || bg.depositId}.`);
    } catch { alert('Could not upload the file.'); } finally { setBusy(''); }
  };
  return (
    <span className="bg-pm" ref={ref}>
      <button type="button" className="sb-tbtn" disabled={!bg || !!busy} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(o => !o)}>
        <Svg name="file" size={13} />{busy ? (busy === 'up' ? 'Uploading…' : 'Opening…') : 'Print'}<Svg name="chevDown" size={12} />
      </button>
      {open && bg && (
        <div className="bg-pm-list" role="menu">
          {type === 'BG' && <>
          <button type="button" role="menuitem" onClick={() => run('cover', () => printBgLetter({ bg, order, company, user }))}>Cover letter<small>Submission of the BG to the client</small></button>
          <button type="button" role="menuitem" onClick={() => run('rel', () => printBgRelease({ bg, order, company, user }))}>Release letter<small>Request to the client + draft release letter to the bank</small></button>
          </>}
          <button type="button" role="menuitem" disabled={!soft} onClick={() => run('soft', () => openBgSoftCopy(bg, companyId))}>{typeOf(type)[1]} soft copy<small>{soft ? soft.name : 'No soft copy uploaded yet'}</small></button>
          {canUpload && <><hr /><button type="button" role="menuitem" onClick={() => { setOpen(false); fileRef.current?.click(); }}>{soft ? 'Replace soft copy…' : 'Upload soft copy…'}<small>PDF or image of the document</small></button></>}
        </div>
      )}
      <input ref={fileRef} type="file" accept=".pdf,image/*" hidden onChange={upload} />
    </span>
  );
}

function BgForm({ companyId, edit, orders, onSaved, onCancel }) {
  const e0 = edit || {};
  const [v, setV] = useState(() => ({
    soId: e0.soId ? String(e0.soId) : '', bgNo: e0.bgNo || '', bgType: e0.bgType || 'performance', bgAmount: e0.bgAmount || e0.amount || '', startDate: e0.startDate || '', expiryDate: e0.expiryDate || e0.endDate || '',
    claimExpiryDate: e0.claimExpiryDate || '', extendedDate: e0.extendedDate || '', pbgContactNo: e0.pbgContactNo || '', issuingBankId: e0.issuingBankId ? String(e0.issuingBankId) : '',
    issuedToBankName: e0.issuedToBankName || '', issuedToBankIfsc: e0.issuedToBankIfsc || '', remarks: e0.remarks || '',
  }));
  const [banks, setBanks] = useState([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  useEffect(() => {
    if (!companyId) return;
    axios.get('/api/accounts/banks', { params: { companyId } }).then(r => setBanks(Array.isArray(r.data) ? r.data : [])).catch(() => setBanks([]));
  }, [companyId]);
  const set = k => e => { const x = e.target.value; setV(o => ({ ...o, [k]: x })); setMsg(null); };
  const so = orders.find(o => String(o.orderId) === v.soId) || null;
  const bank = banks.find(b => String(b.bankId) === v.issuingBankId) || null;
  const ov = so ? Number(so.subTotal) || 0 : 0;
  const pct = ov && Number(v.bgAmount) ? (Number(v.bgAmount) * 100 / ov).toFixed(2) : '';
  const dl = daysTo(v.extendedDate > v.expiryDate ? v.extendedDate : v.expiryDate);
  const openOrders = useMemo(() => orders.filter(o => !['cancelled', 'rejected'].includes(o.status) || String(o.orderId) === v.soId)
    .sort((a, b) => String(b.orderDate || '').localeCompare(String(a.orderDate || ''))), [orders, v.soId]);

  const save = async () => {
    if (!so) return setMsg({ k: 'err', t: 'Pick the sales order this BG is for.' });
    if (!v.bgNo.trim()) return setMsg({ k: 'err', t: 'Enter the BG number.' });
    if (!(Number(v.bgAmount) > 0)) return setMsg({ k: 'err', t: 'Enter the BG amount.' });
    if (!v.startDate || !v.expiryDate) return setMsg({ k: 'err', t: 'Enter the issue date and the expiry date.' });
    if (v.expiryDate < v.startDate) return setMsg({ k: 'err', t: 'The expiry date is before the issue date.' });
    setBusy(true);
    const payload = {
      companyId, depositType: 'BG', soId: so.orderId, orderNo: so.orderNo || '', customerName: so.customerName || so.party || '', customerPO: so.customerPO || '', poDate: so.poDate || '', orderDate: so.orderDate || '',
      bgNo: v.bgNo.trim(), bgType: v.bgType, bgAmount: v.bgAmount, amount: v.bgAmount, startDate: v.startDate, expiryDate: v.expiryDate, endDate: v.expiryDate, claimExpiryDate: v.claimExpiryDate, extendedDate: v.extendedDate,
      pbgContactNo: v.pbgContactNo.trim(), issuingBankId: v.issuingBankId, issuingBankName: bank?.bankName || e0.issuingBankName || '', issuingBankAccNo: bank?.accountNumber || e0.issuingBankAccNo || '', issuingBankIfsc: bank?.ifscCode || e0.issuingBankIfsc || '',
      issuedToBankName: v.issuedToBankName.trim(), issuedToBankIfsc: v.issuedToBankIfsc.trim().toUpperCase(), remarks: v.remarks.trim(),
      status: edit ? e0.status : 'pending',   // a new BG goes for approval, the same as on the Deposit page
    };
    try {
      if (edit) { await axios.put(`/api/deposits/${edit.depositId}`, payload, { params: { companyId } }); onSaved(`Updated BG ${payload.bgNo}.`); }
      else { await axios.post('/api/deposits', payload, { params: { companyId } }); onSaved(`Saved BG ${payload.bgNo} — sent for approval.`); }
    } catch (e) { setMsg({ k: 'err', t: e.response?.data?.error || 'Could not save the BG.' }); }
    finally { setBusy(false); }
  };

  return (
    <div className="sf">
      <div className="sf-hero"><span className="ic"><Svg name="shield" size={15} /></span><h1>{edit ? `Edit BG ${edit.bgNo || edit.depositId}` : 'Add Bank Guarantee'}</h1><span className="grow" /></div>
      <div className="sf-2" style={{ marginTop: 10 }}>
        <div className="sf-card">
          <div className="sf-ch"><span className="ico"><Svg name="file" size={13} /></span><b>For order</b></div>
          <table className="sf-kv"><tbody>
            <tr><th>Sales Order <i>*</i></th><td><select value={v.soId} onChange={set('soId')} autoFocus={!edit}>
              <option value="">Choose the order…</option>
              {openOrders.map(o => <option key={o.orderId} value={String(o.orderId)}>{o.orderNo} · {o.customerName || o.party}{o.customerPO ? ` · PO ${o.customerPO}` : ''}</option>)}
            </select></td></tr>
            <tr><th>Client</th><td>{so ? <b>{so.customerName || so.party}</b> : '—'}</td></tr>
            <tr><th>Order value</th><td>{so ? `₹ ${amt(ov)} (before GST)` : '—'}</td></tr>
            <tr><th>Beneficiary bank</th><td><input value={v.issuedToBankName} onChange={set('issuedToBankName')} placeholder="Client's bank (optional)" /></td></tr>
            <tr><th>Beneficiary IFSC</th><td><input value={v.issuedToBankIfsc} onChange={set('issuedToBankIfsc')} className="mono" placeholder="Optional" /></td></tr>
          </tbody></table>
        </div>
        <div className="sf-card">
          <div className="sf-ch"><span className="ico"><Svg name="shield" size={13} /></span><b>Bank Guarantee</b></div>
          <table className="sf-kv"><tbody>
            <tr><th>BG No. <i>*</i></th><td><input value={v.bgNo} onChange={set('bgNo')} className="mono" placeholder="As on the bank's BG" /></td></tr>
            <tr><th>BG type</th><td><select value={v.bgType} onChange={set('bgType')}>{BG_TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></td></tr>
            <tr><th>Amount ₹ <i>*</i></th><td><input value={v.bgAmount} onChange={e => { const x = e.target.value.replace(/[^\d.]/g, ''); setV(o => ({ ...o, bgAmount: x })); setMsg(null); }} inputMode="decimal" className="num" placeholder="0.00" />
              {pct && <div style={{ fontSize: 11, color: '#667085', marginTop: 3 }}>{pct}% of the order value</div>}</td></tr>
            <tr><th>Issue date <i>*</i></th><td><input type="date" value={v.startDate} onChange={set('startDate')} /></td></tr>
            <tr><th>Expiry date <i>*</i></th><td><input type="date" value={v.expiryDate} onChange={set('expiryDate')} />
              {dl != null && <div style={{ fontSize: 11, color: dl < 0 ? '#B42318' : dl <= 30 ? '#B54708' : '#667085', marginTop: 3 }}>{dl < 0 ? `Expired ${-dl} days ago` : `${dl} days left`}</div>}</td></tr>
            <tr><th>Claim expiry</th><td><input type="date" value={v.claimExpiryDate} onChange={set('claimExpiryDate')} /></td></tr>
            <tr><th>Extended up to</th><td><input type="date" value={v.extendedDate} onChange={set('extendedDate')} />
              <div style={{ fontSize: 11, color: '#667085', marginTop: 3 }}>Only if the bank extended the BG — this becomes the new expiry.</div></td></tr>
            <tr><th>Issuing bank (ours)</th><td><select value={v.issuingBankId} onChange={set('issuingBankId')}>
              <option value="">{e0.issuingBankName && !bank ? e0.issuingBankName : 'Choose our bank account…'}</option>
              {banks.map(b => <option key={b.bankId} value={String(b.bankId)}>{b.bankName} — A/c {b.accountNumber}</option>)}
            </select></td></tr>
            <tr><th>Bank contact</th><td><input value={v.pbgContactNo} onChange={set('pbgContactNo')} placeholder="Bank person / phone (optional)" /></td></tr>
            <tr><th>Remarks</th><td><input value={v.remarks} onChange={set('remarks')} placeholder="Optional" /></td></tr>
          </tbody></table>
        </div>
      </div>
      {msg && <div className={`sf-msg ${msg.k}`} role="status">{msg.t}</div>}
      <div className="sf-bar">
        <div className="info">{edit ? <>Record <b>{edit.depositId}</b> · same BG as on the Deposit page</> : 'A new BG goes for approval, the same as on the Deposit page.'}</div>
        <button type="button" className="sf-b ghost" onClick={onCancel} disabled={busy}>Cancel</button>
        <button type="button" className="sf-b pri" onClick={save} disabled={busy}>{busy ? 'Saving…' : edit ? 'Update' : 'Save'}</button>
      </div>
    </div>
  );
}

/* FD / Security Deposit / EMD — the same fields as the classic Deposit page */
function DepForm({ type, companyId, edit, orders, onSaved, onCancel }) {
  const e0 = edit || {};
  const [, short, full] = typeOf(type);
  const [v, setV] = useState(() => ({
    soId: e0.soId ? String(e0.soId) : '', amount: e0.amount || '', startDate: e0.startDate || '', endDate: e0.endDate || '',
    fdNo: e0.fdNo || '', interestRate: e0.interestRate || '', paymentBank: e0.paymentBank || '', paymentMode: e0.paymentMode || '',
    paymentRef: e0.paymentRef || '', ackmNo: e0.ackmNo || '', remarks: e0.remarks || '',
  }));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const set = k => e => { const x = e.target.value; setV(o => ({ ...o, [k]: x })); setMsg(null); };
  const so = orders.find(o => String(o.orderId) === v.soId) || null;
  const ov = so ? Number(so.subTotal) || 0 : 0;
  const pct = ov && Number(v.amount) ? (Number(v.amount) * 100 / ov).toFixed(2) : '';
  const dl = daysTo(v.endDate);
  const openOrders = useMemo(() => orders.filter(o => !['cancelled', 'rejected'].includes(o.status) || String(o.orderId) === v.soId)
    .sort((a, b) => String(b.orderDate || '').localeCompare(String(a.orderDate || ''))), [orders, v.soId]);
  const L = { FD: ['FD date', 'Maturity date'], Security: ['SD start date', 'SD end date'], EMD: ['Submission date', 'Expected return date'] }[type];

  const save = async () => {
    if (!so && !edit) return setMsg({ k: 'err', t: 'Pick the sales order.' });
    if (!(Number(v.amount) > 0)) return setMsg({ k: 'err', t: 'Enter the amount.' });
    if (!v.startDate) return setMsg({ k: 'err', t: `Enter the ${L[0].toLowerCase()}.` });
    if (type === 'FD' && !v.endDate) return setMsg({ k: 'err', t: 'Enter the maturity date.' });
    if (type === 'FD' && !v.paymentBank.trim()) return setMsg({ k: 'err', t: 'Enter the bank where the FD is held.' });
    if (type === 'EMD' && !v.paymentMode) return setMsg({ k: 'err', t: 'Pick the payment mode.' });
    if (v.endDate && v.endDate < v.startDate) return setMsg({ k: 'err', t: `The ${L[1].toLowerCase()} is before the ${L[0].toLowerCase()}.` });
    setBusy(true);
    const o = so || {};
    const payload = {
      companyId, depositType: type,
      soId: so ? so.orderId : e0.soId, orderNo: so ? o.orderNo || '' : e0.orderNo, customerName: so ? o.customerName || o.party || '' : e0.customerName,
      customerPO: so ? o.customerPO || '' : e0.customerPO, poDate: so ? o.poDate || '' : e0.poDate, orderDate: so ? o.orderDate || '' : e0.orderDate,
      amount: v.amount, startDate: v.startDate, endDate: v.endDate, remarks: v.remarks.trim(),
      fdNo: v.fdNo.trim(), interestRate: v.interestRate, paymentBank: v.paymentBank.trim(), paymentMode: v.paymentMode, paymentRef: v.paymentRef.trim(), ackmNo: v.ackmNo.trim(),
      status: edit ? e0.status : 'pending',   // a new deposit goes for approval, the same as on the Deposit page
    };
    try {
      if (edit) { await axios.put(`/api/deposits/${edit.depositId}`, payload, { params: { companyId } }); onSaved(`Updated ${short} ${edit.depositId}.`); }
      else { const r = await axios.post('/api/deposits', payload, { params: { companyId } }); onSaved(`Saved ${short} ${r.data?.depositId || ''} — sent for approval.`); }
    } catch (e) { setMsg({ k: 'err', t: e.response?.data?.error || `Could not save the ${full.toLowerCase()}.` }); }
    finally { setBusy(false); }
  };

  const num = k => e => { const x = e.target.value.replace(/[^\d.]/g, ''); setV(o => ({ ...o, [k]: x })); setMsg(null); };
  return (
    <div className="sf">
      <div className="sf-hero"><span className="ic"><Svg name="wallet" size={15} /></span><h1>{edit ? `Edit ${full} ${edit.depositId}` : `Add ${full}`}</h1><span className="grow" /></div>
      <div className="sf-2" style={{ marginTop: 10 }}>
        <div className="sf-card">
          <div className="sf-ch"><span className="ico"><Svg name="file" size={13} /></span><b>For order</b></div>
          <table className="sf-kv"><tbody>
            <tr><th>Sales Order <i>*</i></th><td><select value={v.soId} onChange={set('soId')} autoFocus={!edit}>
              <option value="">{edit && !so ? `${e0.orderNo || ''} · ${e0.customerName || ''}` : 'Choose the order…'}</option>
              {openOrders.map(o => <option key={o.orderId} value={String(o.orderId)}>{String(o.orderNo || '').trim()} · {o.customerName || o.party}{o.customerPO ? ` · PO ${o.customerPO}` : ''}</option>)}
            </select></td></tr>
            <tr><th>Client</th><td>{so ? <b>{so.customerName || so.party}</b> : edit ? <b>{e0.customerName}</b> : '—'}</td></tr>
            <tr><th>Client PO</th><td>{so ? (so.customerPO || '—') : (e0.customerPO || '—')}</td></tr>
            <tr><th>Order value</th><td>{so ? `₹ ${amt(ov)} (before GST)` : '—'}</td></tr>
          </tbody></table>
        </div>
        <div className="sf-card">
          <div className="sf-ch"><span className="ico"><Svg name="wallet" size={13} /></span><b>{full}</b></div>
          <table className="sf-kv"><tbody>
            {type === 'FD' && <tr><th>FD No.</th><td><input value={v.fdNo} onChange={set('fdNo')} className="mono" placeholder="FD receipt / number" /></td></tr>}
            {type === 'Security' && <tr><th>Ack / Advice No.</th><td><input value={v.ackmNo} onChange={set('ackmNo')} className="mono" placeholder="Acknowledgement / advice number" /></td></tr>}
            <tr><th>Amount ₹ <i>*</i></th><td><input value={v.amount} onChange={num('amount')} inputMode="decimal" className="num" placeholder="0.00" />
              {pct && <div style={{ fontSize: 11, color: '#667085', marginTop: 3 }}>{pct}% of the order value</div>}</td></tr>
            {type !== 'FD' && <tr><th>Payment mode{type === 'EMD' && <i> *</i>}</th><td><select value={v.paymentMode} onChange={set('paymentMode')}>
              <option value="">Select…</option>{[...new Set([...PAY_MODES, ...(v.paymentMode ? [v.paymentMode] : [])])].map(m => <option key={m}>{m}</option>)}</select></td></tr>}
            {type === 'EMD' && <tr><th>DD / Ref No.</th><td><input value={v.paymentRef} onChange={set('paymentRef')} className="mono" placeholder="DD no. or UTR / ref no." /></td></tr>}
            {type !== 'Security' && <tr><th>Bank{type === 'FD' && <i> *</i>}</th><td><input value={v.paymentBank} onChange={set('paymentBank')} placeholder={type === 'FD' ? 'Bank where the FD is held' : 'Issuing bank'} /></td></tr>}
            {type === 'FD' && <tr><th>Interest rate %</th><td><input value={v.interestRate} onChange={num('interestRate')} inputMode="decimal" className="num" placeholder="e.g. 7.5" /></td></tr>}
            <tr><th>{L[0]} <i>*</i></th><td><input type="date" value={v.startDate} onChange={set('startDate')} /></td></tr>
            <tr><th>{L[1]}{type === 'FD' && <i> *</i>}</th><td><input type="date" value={v.endDate} onChange={set('endDate')} />
              {dl != null && <div style={{ fontSize: 11, color: dl < 0 ? '#B42318' : dl <= 30 ? '#B54708' : '#667085', marginTop: 3 }}>{dl < 0 ? `${-dl} days ago` : `${dl} days left`}</div>}</td></tr>
            <tr><th>Remarks</th><td><input value={v.remarks} onChange={set('remarks')} placeholder="Optional" /></td></tr>
          </tbody></table>
        </div>
      </div>
      {msg && <div className={`sf-msg ${msg.k}`} role="status">{msg.t}</div>}
      <div className="sf-bar">
        <div className="info">{edit ? <>Record <b>{edit.depositId}</b> · same record as on the Deposit page</> : `A new ${short} goes for approval, the same as on the Deposit page.`}</div>
        <button type="button" className="sf-b ghost" onClick={onCancel} disabled={busy}>Cancel</button>
        <button type="button" className="sf-b pri" onClick={save} disabled={busy}>{busy ? 'Saving…' : edit ? 'Update' : 'Save'}</button>
      </div>
    </div>
  );
}
