/* Beta — Payment (money paid to a vendor against its purchase orders).
 * Flow: Date → Account (bank / cash it is paid from) → Vendor → the vendor's POs with what is paid and the balance
 * → type how much of this payment goes to each PO (one transfer can cover several POs) → mode, date, UTR / cheque
 * → Save as Draft or Send for Approval.
 * Saves exactly like the classic payment voucher: ONE record per payment in /api/accounts/payments with
 * type 'payment', entityType 'vendor', orderType 'purchase' and poAllocations (₹ per PO), so approvals, ledgers,
 * PO "paid" figures and the payment advice keep working. */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { useLocation, useNavigate } from 'react-router-dom';
import { useCompany } from '../../context/CompanyContext';
import { useAuth } from '../../context/AuthContext';
import { can } from '../../utils/permissions';
import { printPaymentAdvice } from './BetaPaymentPrint';
import { Svg } from '../../components/ui/Icon';
import { RC_CSS, STATUS, bankLabel } from './BetaReceipt';

const MODES = ['Bank Transfer', 'NEFT', 'RTGS', 'IMPS', 'Cheque', 'UPI', 'DD'];
const TABS = [{ key: 'create', label: 'Create Payment' }, { key: 'list', label: 'Payment List' }];
const n = v => parseFloat(v) || 0;
const r2 = v => Math.round((Number(v) || 0) * 100) / 100;
const AMT_FMT = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const amt = v => AMT_FMT.format(Number(v) || 0);
const DATE_FMT = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
const fdate = d => { if (!d) return '—'; const x = new Date(d); return isNaN(x) ? String(d) : DATE_FMT.format(x); };
const today = () => new Date().toISOString().slice(0, 10);
const dash = v => (v == null || String(v).trim() === '' ? '—' : v);
const norm = v => String(v || '').toLowerCase().trim();

/* what a payment paid towards one PO — its PO-wise split, or the whole amount for an old single-PO payment */
export const paidForPo = (p, oid) => (Array.isArray(p.poAllocations) && p.poAllocations.length
  ? p.poAllocations.filter(a => String(a.orderId) === String(oid)).reduce((s, a) => s + n(a.amount), 0)
  : String(p.orderId) === String(oid) ? n(p.amount) : 0);
/* payments that count as paid: approved and awaiting approval (not draft / rejected) */
export const countsPaid = p => p.type === 'payment' && (p.status === 'confirmed' || p.status === 'pending');
/* the PO lines of one payment: [{ orderId, poNo, amount }] */
export const allocsOf = p => (Array.isArray(p.poAllocations) && p.poAllocations.length ? p.poAllocations
  : p.orderId ? [{ orderId: p.orderId, poNo: p.poNo || '', amount: n(p.amount) }] : []);
/* does this PO belong to that vendor (id / code, else the name) */
export const poOfVendor = (p, v) => {
  const ids = [String(v.vendorId), String(v.vendorCode || '')].filter(Boolean);
  return ids.includes(String(p.vendorId || '')) || ids.includes(String(p.vendorCode || '')) || (!!norm(v.vendorName) && norm(p.vendorName) === norm(v.vendorName));
};

const PAY_CSS = `
.py-st { display:inline-block; padding:0 6px; border-radius:2px; font-size:10.5px; font-weight:700; text-transform:uppercase; }
.py-st.approved { background:#ECFDF3; color:#067647; } .py-st.pending { background:#FFFAEB; color:#B54708; } .py-st.draft { background:#F2F4F7; color:#475467; }
.rc-ask { display:flex; align-items:center; gap:8px; padding:9px 14px; background:#FEF3F2; border-bottom:1px solid #FECDCA; font-size:12.5px; color:#7A271A; }
.rc-ask span { flex:1; }
.rc-ask button { height:28px; padding:0 12px; border:1px solid #FECDCA; border-radius:2px; background:#fff; cursor:pointer; font-weight:600; font-family:inherit; }
.rc-ask button.danger { background:#B42318; border-color:#B42318; color:#fff; }
`;

/* preset = { poId } opens just the payment form in a pop-up for that PO's vendor (used from Dues) */
export default function BetaPayment({ preset = null, onClose, onSaved } = {}) {
  const { selectedCompany } = useCompany() || {};
  const companyId = selectedCompany?.companyId;
  const { user } = useAuth() || {};
  const navigate = useNavigate();
  const { search } = useLocation();
  const asked = new URLSearchParams(search).get('tab');
  const [editing, setEditing] = useState(null);   // payment record open in the form
  const tab = preset || editing ? 'create' : (TABS.some(t => t.key === asked) ? asked : 'create');

  const [banks, setBanks] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [pos, setPos] = useState([]);
  const [orders, setOrders] = useState([]);
  const [payments, setPayments] = useState([]);
  const [ready, setReady] = useState(false);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    if (!companyId) return;
    const get = u => axios.get(u, { params: { companyId } }).then(r => (Array.isArray(r.data) ? r.data : [])).catch(() => []);
    Promise.all([get('/api/accounts/banks'), get('/api/vendors'), get('/api/purchase-orders'), get('/api/sales-orders')]).then(([b, v, p, o]) => {
      setBanks(b.filter(x => x.status !== 'inactive')); setVendors(v); setPos(p); setOrders(o); setReady(true);
    });
  }, [companyId]);
  useEffect(() => {
    if (!companyId) return;
    axios.get('/api/accounts/payments', { params: { companyId } }).then(r => setPayments(Array.isArray(r.data) ? r.data : [])).catch(() => setPayments([]));
  }, [companyId, reload]);
  const soMap = useMemo(() => { const m = {}; orders.forEach(o => { m[String(o.orderId)] = o; }); return m; }, [orders]);
  const poMap = useMemo(() => { const m = {}; pos.forEach(p => { m[String(p.orderId)] = p; }); return m; }, [pos]);

  const [f, setF] = useState({ date: today(), account: '', mode: 'NEFT', txnDate: today(), refNo: '', notes: '' });
  const [vendor, setVendor] = useState(null);
  const [alloc, setAlloc] = useState({});   // PO id → amount typed
  const [picker, setPicker] = useState(false);
  const [errs, setErrs] = useState({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [listMsg, setListMsg] = useState(null);
  const topRef = useRef(null);
  const set = k => e => { const v = e.target.value; setF(o => ({ ...o, [k]: v })); setErrs(o => ({ ...o, [k]: undefined })); setMsg(null); };
  useEffect(() => { if (!f.account && banks.length === 1) setF(o => ({ ...o, account: String(banks[0].bankId) })); }, [banks, f.account]);
  const isCash = f.account === 'cash';
  const mode = isCash ? 'Cash' : f.mode;

  /* the vendor's POs with what is paid (approved + awaiting approval) and the balance */
  const rows = useMemo(() => {
    if (!vendor) return [];
    const ownId = editing ? String(editing.paymentId) : null;
    const ownPos = new Set(editing ? allocsOf(editing).map(a => String(a.orderId)) : []);
    return pos.filter(p => (!['rejected', 'cancelled'].includes(p.status) || ownPos.has(String(p.orderId))) && (poOfVendor(p, vendor) || ownPos.has(String(p.orderId))))
      .map(p => {
        const value = n(p.grandTotal);
        const paid = r2(payments.filter(x => countsPaid(x) && String(x.paymentId) !== ownId).reduce((s, x) => s + paidForPo(x, p.orderId), 0));
        return { id: String(p.orderId), p, so: soMap[String(p.linkedSalesOrderId)], value, paid, bal: r2(value - paid) };
      })
      .sort((a, b) => (b.bal > 0.5) - (a.bal > 0.5) || String(b.p.poDate || '').localeCompare(String(a.p.poDate || '')));
  }, [vendor, pos, payments, soMap, editing]);
  const used = rows.filter(r => n(alloc[r.id]) > 0);
  const total = r2(used.reduce((s, r) => s + n(alloc[r.id]), 0));

  /* pop-up from Dues: pick that PO's vendor once everything is loaded */
  const presetDone = useRef(false);
  useEffect(() => {
    if (!preset || presetDone.current || !ready) return;
    const p = poMap[String(preset.poId)];
    if (!p) return;
    presetDone.current = true;
    setVendor(vendors.find(v => poOfVendor(p, v)) || { vendorId: p.vendorId || p.vendorCode || '', vendorCode: p.vendorCode || '', vendorName: p.vendorName || '' });
  }, [preset, ready, poMap, vendors]);
  useEffect(() => {
    if (!preset) return undefined;
    const k = e => { if (e.key === 'Escape' && !picker && !busy) onClose?.(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [preset, picker, busy, onClose]);

  const chooseVendor = v => { setPicker(false); setVendor(v); setAlloc({}); setErrs(o => ({ ...o, vendor: undefined, alloc: undefined })); setMsg(null); };
  const setAmt = id => e => { const v = e.target.value.replace(/[^\d.]/g, ''); setAlloc(a => ({ ...a, [id]: v })); setErrs(o => ({ ...o, alloc: undefined })); setMsg(null); };
  const payBalance = r => { setAlloc(a => ({ ...a, [r.id]: r.bal > 0 ? String(r.bal) : '' })); setErrs(o => ({ ...o, alloc: undefined })); };

  const resetForm = () => { setEditing(null); setVendor(null); setAlloc({}); setErrs({}); setMsg(null); setF(o => ({ ...o, date: today(), txnDate: today(), refNo: '', notes: '' })); };
  const save = async status => {
    const e = {};
    if (!f.date) e.date = 'Enter the payment date';
    if (!f.account) e.account = 'Choose the account the money is paid from';
    if (!vendor) e.vendor = 'Choose the vendor';
    else if (!used.length) e.alloc = 'Enter the amount paid against at least one PO';
    if (status !== 'draft' && !isCash && !f.refNo.trim()) e.refNo = mode === 'Cheque' ? 'Enter the cheque no.' : 'Enter the UTR / transaction no.';
    setErrs(e);
    if (Object.keys(e).length) { setMsg({ ok: false, text: 'Please correct the fields marked in red.' }); return; }
    setBusy(true); setMsg(null);
    const name = vendor.vendorName || '';
    const poAllocations = used.map(r => ({ orderId: r.id, poNo: r.p.poNo || r.p.poNumber || '', amount: r2(n(alloc[r.id])) }));
    const body = {
      companyId, type: 'payment', status, entityType: 'vendor', entityId: vendor.vendorId, entityName: name, party: name,
      date: f.date, transactionDate: isCash ? f.date : f.txnDate, paymentMode: mode, bankId: isCash ? '' : f.account,
      referenceNo: isCash ? '' : f.refNo.trim(), notes: f.notes.trim(), amount: total.toFixed(2),
      orderId: poAllocations[0]?.orderId || '', orderType: 'purchase', poAllocations, linkedExpenses: [], purpose: '',
    };
    const what = status === 'draft' ? 'saved as draft' : 'sent for approval';
    const text = `Payment of ₹ ${amt(total)} to ${name} ${what} — ${poAllocations.map(a => `${a.poNo || a.orderId} ₹ ${amt(a.amount)}`).join(', ')}`;
    try {
      if (editing) {
        await axios.put(`/api/accounts/payments/${editing.paymentId}`, body, { params: { companyId } });
        resetForm(); setReload(x => x + 1); navigate('/beta/payment?tab=list');
        setListMsg({ ok: true, text: `Payment ${editing.paymentId} updated: ${text}.` });
      } else {
        const r = await axios.post('/api/accounts/payments', body, { params: { companyId } });
        const done = `${text} (No. ${r.data?.paymentId || ''}).`;
        if (preset) { onSaved?.(done); return; }
        setMsg({ ok: true, text: done });
        setVendor(null); setAlloc({}); setF(o => ({ ...o, refNo: '', notes: '' })); setReload(x => x + 1);
        topRef.current?.scrollIntoView({ behavior: 'smooth' });
      }
    } catch (err) {
      setMsg({ ok: false, text: err.response?.data?.error || 'Could not save the payment.' });
    } finally { setBusy(false); }
  };

  const startEdit = p => {
    setListMsg(null); setErrs({}); setMsg(null);
    setVendor(vendors.find(v => String(v.vendorId) === String(p.entityId)) || vendors.find(v => norm(v.vendorName) === norm(p.entityName || p.party))
      || { vendorId: p.entityId, vendorName: p.entityName || p.party || '' });
    const a = {}; allocsOf(p).forEach(x => { a[String(x.orderId)] = String(r2(n(x.amount))); }); setAlloc(a);
    setF({ date: (p.date || today()).slice(0, 10), account: p.bankId ? String(p.bankId) : 'cash', mode: MODES.includes(p.paymentMode) ? p.paymentMode : 'NEFT',
      txnDate: (p.transactionDate || p.date || today()).slice(0, 10), refNo: p.referenceNo || '', notes: p.notes || '' });
    setEditing(p);
  };

  const head = (icon, title, extra) => <div className="rc-ch"><span className="ico"><Svg name={icon} size={14} /></span><b>{title}</b>{extra}</div>;
  const bank = banks.find(b => String(b.bankId) === f.account);
  const vendorPays = useMemo(() => payments.filter(p => p.type === 'payment' && (p.entityType === 'vendor' || p.orderType === 'purchase' || (p.poAllocations || []).length)), [payments]);

  /* list */
  const [q, setQ] = useState('');
  const [selId, setSelId] = useState(null);
  const [askDel, setAskDel] = useState(null);
  const list = useMemo(() => {
    const w = q.toLowerCase().split(/\s+/).filter(Boolean);
    return vendorPays.filter(p => !w.length || w.every(x => `${p.paymentId} ${p.party || p.entityName} ${allocsOf(p).map(a => `${a.poNo || poMap[String(a.orderId)]?.poNo || ''} ${soMap[String(poMap[String(a.orderId)]?.linkedSalesOrderId)]?.orderNo || ''}`).join(' ')} ${p.notes || ''} ${p.referenceNo || ''} ${p.paymentMode} ${(STATUS[p.status] || [p.status])[0]} ${bankLabel(banks, p.bankId)}`.toLowerCase().includes(x)))
      .sort((a, b) => String(b.transactionDate || b.date || '').localeCompare(String(a.transactionDate || a.date || '')) || n(b.paymentId) - n(a.paymentId));
  }, [vendorPays, q, banks, poMap, soMap]);
  const sel = list.find(p => String(p.paymentId) === String(selId)) || null;
  const advice = p => printPaymentAdvice({ p, allocs: allocsOf(p), poMap, soMap, banks, user, company: selectedCompany,
    vendor: vendors.find(v => String(v.vendorId) === String(p.entityId)) || vendors.find(v => v.vendorName && v.vendorName === (p.party || p.entityName)) });
  useEffect(() => {
    if (!selId || tab !== 'list' || askDel) return undefined;
    const down = e => { if (!e.target.closest?.('.rc-list tbody tr, .rc-tools')) setSelId(null); };
    const key = e => { if (e.key === 'Escape') setSelId(null); };
    document.addEventListener('mousedown', down); document.addEventListener('keydown', key);
    return () => { document.removeEventListener('mousedown', down); document.removeEventListener('keydown', key); };
  }, [selId, tab, askDel]);
  /* Approve — button shown only to users with Payment approve rights; enabled for a pending payment */
  const canApprovePay = can(user, 'accPayment', 'approve');
  const doApprove = async p => {
    if (!window.confirm(`Approve payment ${p.paymentId} — ${p.party || p.entityName}, ₹ ${amt(p.amount)}?`)) return;
    setBusy(true);
    try {
      await axios.put(`/api/accounts/payments/${p.paymentId}`, { status: 'confirmed', approvedBy: user?.name || user?.username || 'Admin', approvedAt: new Date().toISOString() }, { params: { companyId } });
      setReload(x => x + 1); setListMsg({ ok: true, text: `Payment ${p.paymentId} (${p.party || p.entityName}, ₹ ${amt(p.amount)}) approved.` });
    } catch (e) { setListMsg({ ok: false, text: e.response?.data?.error || 'Could not approve the payment.' }); }
    finally { setBusy(false); }
  };
  const doDelete = async p => {
    setBusy(true);
    try { await axios.delete(`/api/accounts/payments/${p.paymentId}`, { params: { companyId } }); setAskDel(null); setSelId(null); setReload(x => x + 1); setListMsg({ ok: true, text: `Payment ${p.paymentId} (${p.party || p.entityName}, ₹ ${amt(p.amount)}) deleted.` }); }
    catch (e) { setListMsg({ ok: false, text: e.response?.data?.error || 'Could not delete the payment.' }); }
    finally { setBusy(false); }
  };

  const page = (
    <div className={`rc${preset ? ' rc-popbox' : ''}`} role={preset ? 'dialog' : undefined} aria-modal={preset ? 'true' : undefined} aria-label={preset ? 'Payment' : undefined}>
      <style>{RC_CSS + PAY_CSS}</style>
      {!preset && <div className="rc-tabs" role="tablist">
        {TABS.map((t, i) => (
          <React.Fragment key={t.key}>
            {i === 1 && <span className="rc-sep" />}
            <button type="button" role="tab" aria-selected={tab === t.key} className={`rc-tab${tab === t.key ? ' on' : ''}`} onClick={() => { if (editing) resetForm(); navigate(`/beta/payment?tab=${t.key}`); }}>
              {t.label}{t.key === 'list' && <span className="n">{vendorPays.length}</span>}
            </button>
          </React.Fragment>
        ))}
        {tab === 'list' && <input className="rc-search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search payment no., vendor, PO, order, UTR / cheque, status…" aria-label="Search payments" />}
        {tab === 'list' && (
          <div className="rc-tools">
            <span className="rc-picked">{sel ? <>Selected: <b>{sel.paymentId}</b></> : 'Click a payment to select it'}</span>
            {canApprovePay && <button type="button" className="rc-tbtn" disabled={!sel || busy || sel.status !== 'pending'} title={sel && sel.status !== 'pending' ? 'Only a pending payment can be approved' : 'Approve this payment'} onClick={() => doApprove(sel)} style={{ color: '#067647', borderColor: '#16A34A' }}><Svg name="check" size={13} />Approve</button>}
            <button type="button" className="rc-tbtn" disabled={!sel} onClick={() => startEdit(sel)}><Svg name="settings" size={13} />Edit</button>
            <button type="button" className="rc-tbtn" disabled={!sel} onClick={() => advice(sel)}><Svg name="file" size={13} />Payment Advice</button>
            <button type="button" className="rc-tbtn" disabled={!sel || busy || (sel.status === 'confirmed' && user?.role !== 'admin')} title={sel?.status === 'confirmed' ? (user?.role === 'admin' ? 'Delete this approved payment (Admin)' : 'An approved payment can be deleted only by an Admin (it is in the books)') : 'Delete this payment'} onClick={() => setAskDel(sel)} style={{ color: '#B42318', borderColor: '#B42318' }}><Svg name="x" size={13} />Delete</button>
          </div>
        )}
      </div>}
      {tab === 'list' && listMsg && <div className={`rc-msg ${listMsg.ok ? 'ok' : 'err'}`} style={{ margin: 0 }} role="status">{listMsg.text}</div>}
      {tab === 'list' && askDel && (
        <div className="rc-ask" role="alertdialog" aria-label="Confirm delete">
          <span><b>Delete payment {askDel.paymentId}</b> — {askDel.party || askDel.entityName}, ₹ {amt(askDel.amount)}? The POs show it as unpaid again.{askDel.status === 'confirmed' && <> <b style={{ color: '#B42318' }}>This payment is APPROVED</b> — the bank balance, vendor ledger and dues change too.</>} A backup copy is kept on the server.</span>
          <button type="button" onClick={() => setAskDel(null)} disabled={busy}>Keep</button>
          <button type="button" className="danger" onClick={() => doDelete(askDel)} disabled={busy}>{busy ? 'Deleting…' : 'Yes, delete'}</button>
        </div>
      )}
      {tab === 'list' ? <PaymentList list={list} all={vendorPays} banks={banks} poMap={poMap} soMap={soMap} q={q} selId={selId} onSelect={setSelId} onEdit={startEdit} /> : (
        <div className="rc-body">
          <div className="rc-hero" ref={topRef}>
            <span className="ic"><Svg name="wallet" size={16} /></span>
            <h1>{editing ? `Edit Payment ${editing.paymentId}` : preset ? `Payment — ${poMap[String(preset.poId)]?.poNo || preset.poId}` : 'Payment'}</h1><span className="grow" />
            <div className="rc-chip"><small>Total paid</small><b>₹ {amt(total)}</b></div>
            {preset && <button type="button" className="rc-x" onClick={onClose} disabled={busy} aria-label="Close">×</button>}
          </div>
          {msg && <div className={`rc-msg ${msg.ok ? 'ok' : 'err'}`} role="status">{msg.text}</div>}

          <div className="rc-card">
            {head('file', 'Payment Details')}
            <table className="rc-kv"><tbody>
              <tr>
                <th>Date <i>*</i></th>
                <td><input type="date" value={f.date} onChange={set('date')} disabled={busy} className={errs.date ? 'bad' : ''} />{errs.date && <span className="rc-err">{errs.date}</span>}</td>
                <th>Paid From <i>*</i></th>
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
                <th>Vendor <i>*</i></th>
                <td colSpan={3}>
                  <div className="rc-srch">
                    <input readOnly value={vendor ? `${vendor.vendorName} — ${vendor.vendorId}` : ''} placeholder="Click search to choose the vendor"
                      className={errs.vendor ? 'bad' : ''} onClick={() => !busy && !editing && !preset && setPicker(true)} />
                    <button type="button" className="rc-sbtn" onClick={() => setPicker(true)} disabled={busy || !!editing || !!preset} aria-label="Search vendor"><Svg name="search" size={15} /></button>
                  </div>
                  {errs.vendor && <span className="rc-err">{errs.vendor}</span>}
                  {vendor && <div className="rc-sub">{[vendor.gstin, vendor.city, vendor.state, vendor.bankName && `${vendor.bankName}${vendor.accountNo ? ` A/c ${vendor.accountNo}` : ''}${vendor.ifsc ? ` · ${vendor.ifsc}` : ''}`].filter(Boolean).join(' · ') || '—'}</div>}
                </td>
              </tr>
            </tbody></table>
          </div>

          <div className="rc-card">
            {head('cart', vendor ? `Purchase Orders of ${vendor.vendorName}` : 'Purchase Orders', <><span className="grow" /><small>{vendor ? `${rows.length} PO${rows.length === 1 ? '' : 's'} · type the amount paid against each PO` : ''}</small></>)}
            {!vendor ? <div className="rc-empty">Choose the vendor to see its purchase orders.</div> : !rows.length ? <div className="rc-empty">This vendor has no purchase orders.</div> : (
              <table className="rc-t">
                <thead><tr>
                  <th>PO No.</th><th>PO Date</th><th>Order No.</th><th>Client</th><th className="c">PO Status</th>
                  <th className="r">PO Value</th><th className="r">Paid</th><th className="r">Balance</th><th className="r">Amount Paid Now</th>
                </tr></thead>
                <tbody>{rows.map(r => {
                  const a = n(alloc[r.id]);
                  const st = STATUS[r.p.status === 'approved' ? 'confirmed' : r.p.status] || [r.p.status || '—', '?', '#98A2B3'];
                  return (
                    <tr key={r.id} className={`${a > 0 ? 'on' : ''}${preset && String(preset.poId) === r.id ? ' pre' : ''}`}>
                      <td className="no">{r.p.poNo || r.p.poNumber || r.id}</td><td>{fdate(r.p.poDate)}</td>
                      <td>{r.so ? r.so.orderNo : <span className="rc-mut">—</span>}</td><td>{dash(r.so?.customerName)}</td>
                      <td className="c"><span className="rc-badge" style={{ background: st[2] }} title={st[0]}>{st[1]}</span></td>
                      <td className="r">{amt(r.value)}</td>
                      <td className="r">{amt(r.paid)}</td>
                      <td className={`r${r.bal > 0.5 ? ' rc-due' : ''}`}>{amt(r.bal)}</td>
                      <td className="r">
                        <input className="rc-in" autoFocus={!!preset && String(preset.poId) === r.id} value={alloc[r.id] ?? ''} onChange={setAmt(r.id)} disabled={busy} inputMode="decimal" placeholder="0.00"
                          aria-label={`Amount for ${r.p.poNo || r.id}`} onDoubleClick={() => payBalance(r)} title="Double-click to pay the full balance" />
                        {a > r.bal + 0.5 && <span className="rc-warn">More than the PO balance</span>}
                      </td>
                    </tr>
                  );
                })}</tbody>
                <tfoot><tr>
                  <td colSpan={5}>Total</td><td className="r">{amt(rows.reduce((s, r) => s + r.value, 0))}</td>
                  <td className="r">{amt(rows.reduce((s, r) => s + r.paid, 0))}</td><td className="r">{amt(rows.reduce((s, r) => s + r.bal, 0))}</td>
                  <td className="r">₹ {amt(total)}</td>
                </tr></tfoot>
              </table>
            )}
            {errs.alloc && <div className="rc-msg err" style={{ margin: 8 }}>{errs.alloc}</div>}
          </div>

          <div className="rc-card">
            {head('wallet', 'Transaction', <><span className="grow" /><small>{isCash ? 'Cash' : bank ? `${bank.bankName}${bank.accountNumber ? ` · ${bank.accountNumber}` : ''}` : ''}</small></>)}
            <table className="rc-kv"><tbody>
              <tr>
                <th>Mode</th>
                <td>{isCash ? <input readOnly value="Cash" /> : <select value={f.mode} onChange={set('mode')} disabled={busy}>{MODES.map(m => <option key={m}>{m}</option>)}</select>}</td>
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
          </div>

          <div className="rc-bar">
            <span className="info">{vendor ? <>{vendor.vendorName} · {used.length} PO{used.length === 1 ? '' : 's'} · <b>₹ {amt(total)}</b>{editing && <> · was ₹ {amt(editing.amount)}</>}</> : 'Choose the vendor'}</span>
            {editing && <button type="button" className="rc-b ghost" disabled={busy} onClick={() => { resetForm(); navigate('/beta/payment?tab=list'); }}>Cancel</button>}
            <button type="button" className="rc-b ghost" disabled={busy} onClick={() => save('draft')}>Save as Draft</button>
            <button type="button" className="rc-b pri" disabled={busy} onClick={() => save('pending')}>{busy ? 'Saving…' : 'Send for Approval'}</button>
          </div>
        </div>
      )}
      {picker && <VendorPicker vendors={vendors.filter(v => v.status !== 'rejected')} pos={pos} payments={payments} onPick={chooseVendor} onClose={() => setPicker(false)} />}
    </div>
  );
  return preset
    ? <div className="rc-ov" onMouseDown={e => { if (e.target === e.currentTarget && !busy) onClose?.(); }}>{page}</div>
    : page;
}

/* ── Payment List: one block per payment; a payment split over several POs shows each PO on its own line ── */
function PaymentList({ list, all, banks, poMap, soMap, q, selId, onSelect, onEdit }) {
  const total = list.reduce((s, p) => s + n(p.amount), 0);
  const cnt = st => all.filter(p => p.status === st).length;
  return (
    <div className="rc-body">
      <div className="rc-hero">
        <span className="ic"><Svg name="ledger" size={16} /></span><h1>Payment List</h1><span className="grow" />
        {['draft', 'pending', 'confirmed', 'rejected'].map(st => <div key={st} className="rc-chip"><small>{STATUS[st][0]}</small><b>{cnt(st)}</b></div>)}
      </div>
      <table className="rc-t rc-list">
        <thead><tr>
          <th>Txn Date</th><th>Vendor</th><th>PO No.</th><th>Order No.</th><th>Client</th><th>Paid From</th><th>Mode / UTR</th><th className="r">Amount</th><th>Remarks</th><th className="c">Status</th>
        </tr></thead>
        <tbody>
          {!list.length ? <tr><td colSpan={10} className="rc-empty">{q ? `No payment matches “${q}”.` : 'No payments yet.'}</td></tr>
            : list.map(p => {
              const lines = allocsOf(p).length ? allocsOf(p) : [{ orderId: '', poNo: '', amount: n(p.amount) }];
              const span = lines.length, id = String(p.paymentId), st = STATUS[p.status] || [p.status || '—', '?', '#98A2B3'];
              const sel = String(selId) === id;
              const ev = { onClick: () => onSelect(id), onDoubleClick: () => { onSelect(id); onEdit(p); }, title: 'Click to select · double-click to edit' };
              return lines.map((a, i) => {
                const po = poMap[String(a.orderId)], so = po && soMap[String(po.linkedSalesOrderId)];
                return (
                  <tr key={`${id}-${i}`} className={`${i === 0 ? 'gs' : ''}${sel ? ' sel' : ''}`} {...ev} aria-selected={sel}>
                    {i === 0 && <><td rowSpan={span} className="lead">{fdate(p.transactionDate || p.date)}</td><td rowSpan={span}><b>{dash(p.party || p.entityName)}</b></td></>}
                    <td className="no">{dash(a.poNo || po?.poNo || a.orderId)}</td>
                    <td>{so ? so.orderNo : <span className="rc-mut">—</span>}</td>
                    <td>{dash(so?.customerName)}</td>
                    {i === 0 && <>
                      <td rowSpan={span}>{bankLabel(banks, p.bankId)}</td>
                      <td rowSpan={span}>{dash(p.paymentMode)}{p.referenceNo ? <div className="rc-mut" style={{ fontSize: 11 }}>{p.referenceNo}</div> : null}</td>
                    </>}
                    <td className="r"><b>{amt(a.amount)}</b></td>
                    {i === 0 && <>
                      <td rowSpan={span} className="rmk" title={p.notes || ''}>{dash(p.notes)}</td>
                      <td rowSpan={span} className="c"><span className="rc-badge" style={{ background: st[2] }} title={st[0]}>{st[1]}</span></td>
                    </>}
                  </tr>
                );
              });
            })}
        </tbody>
        {list.length > 0 && <tfoot><tr><td colSpan={7}>Total ({list.length} payment{list.length === 1 ? '' : 's'})</td><td className="r">₹ {amt(total)}</td><td colSpan={2} /></tr></tfoot>}
      </table>
    </div>
  );
}

/* vendor search pop-up: with each vendor's POs and balance to pay */
function VendorPicker({ vendors, pos, payments, onPick, onClose }) {
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const inRef = useRef(null), listRef = useRef(null);
  useEffect(() => { inRef.current?.focus(); }, []);
  const list = useMemo(() => {
    const w = q.toLowerCase().split(/\s+/).filter(Boolean);
    return [...vendors].sort((a, b) => String(a.vendorName || '').localeCompare(String(b.vendorName || '')))
      .filter(v => !w.length || w.every(x => `${v.vendorName} ${v.alias || ''} ${v.vendorId} ${v.gstin || ''} ${v.city || ''} ${v.state || ''}`.toLowerCase().includes(x)))
      .map(v => {
        const mine = pos.filter(p => !['rejected', 'cancelled', 'draft'].includes(p.status) && poOfVendor(p, v));
        const value = mine.reduce((s, p) => s + n(p.grandTotal), 0);
        const paid = mine.reduce((s, p) => s + payments.filter(countsPaid).reduce((t, x) => t + paidForPo(x, p.orderId), 0), 0);
        return { v, count: mine.length, bal: r2(value - paid) };
      })
      .sort((a, b) => (b.bal > 0.5) - (a.bal > 0.5)).slice(0, 300);
  }, [vendors, pos, payments, q]);
  useEffect(() => setSel(0), [q]);
  useEffect(() => { listRef.current?.querySelector('tr.sel')?.scrollIntoView({ block: 'nearest' }); }, [sel]);
  const key = e => {
    if (e.key === 'Escape') onClose();
    else if (e.key === 'ArrowDown') { e.preventDefault(); setSel(s => Math.min(s + 1, list.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel(s => Math.max(s - 1, 0)); }
    else if (e.key === 'Enter' && list[sel]) { e.preventDefault(); onPick(list[sel].v); }
  };
  return (
    <div className="rc-pkb" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="rc-pk" role="dialog" aria-modal="true" aria-label="Select vendor" onKeyDown={key}>
        <div className="rc-pkh"><b>Select Vendor</b><span className="grow" /><small>{list.length} found</small><button type="button" onClick={onClose} aria-label="Close">×</button></div>
        <div className="rc-pks"><input ref={inRef} value={q} onChange={e => setQ(e.target.value)} placeholder="Search by vendor name, ID, GSTIN or city…" aria-label="Search vendors" /></div>
        <div className="rc-pkl" ref={listRef}>
          <table className="rc-t">
            <thead><tr><th>Vendor ID</th><th>Vendor</th><th>GSTIN</th><th>City</th><th className="r">POs</th><th className="r">Balance to pay</th></tr></thead>
            <tbody>{list.length ? list.map((x, i) => (
              <tr key={x.v.vendorId} className={i === sel ? 'sel' : ''} onMouseEnter={() => setSel(i)} onClick={() => onPick(x.v)}>
                <td className="no">{x.v.vendorId}</td><td><b>{x.v.vendorName}</b></td><td>{dash(x.v.gstin)}</td><td>{dash(x.v.city)}</td>
                <td className="r">{x.count}</td><td className={`r${x.bal > 0.5 ? ' rc-due' : ''}`}>{amt(x.bal)}</td>
              </tr>
            )) : <tr><td colSpan={6} className="rc-empty">Nothing matches “{q}”.</td></tr>}</tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
