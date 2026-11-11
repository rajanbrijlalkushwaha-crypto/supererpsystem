/* Beta — Account → Payment. Two kinds:
 *  • Vendor payments (against POs) — the Beta Payment page itself (/api/accounts/payments, entityType 'vendor').
 *  • Ledger / expense payments — money paid to a ledger account (rent, salary, electricity…), optionally settling its
 *    open expense bills. Same record as the classic payment voucher: type 'payment', entityType 'ledger',
 *    linkedExpenses [{ expenseId, expNo, amount }], status 'pending' (goes for approval). */
import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useCompany } from '../../context/CompanyContext';
import { useAuth } from '../../context/AuthContext';
import { can } from '../../utils/permissions';
import { Svg } from '../../components/ui/Icon';
import { CSS as SALES_CSS, useClearSel } from './BetaSales';
import { PX_CSS } from './BetaPurchaseParts';
import { printDepList, printVoucher, inWords, dmy } from './BetaCertPrint';
import { ACC_CSS, amt, r2, today, words, hit, Pill, Picker } from './BetaAccKit';
import BetaPayment from './BetaPayment';

const BASE = '/beta/account/payment';
const MODES = ['Bank Transfer', 'NEFT', 'RTGS', 'Cheque', 'UPI', 'Cash'];
const BANK_MODES = ['Bank Transfer', 'NEFT', 'RTGS', 'Cheque'];
const norm = v => String(v || '').toLowerCase().trim();
const bankName = (banks, id) => { const b = banks.find(x => String(x.bankId) === String(id)); return b ? `${b.bankName}${b.accountNumber ? ` · ${String(b.accountNumber).slice(-4)}` : ''}` : ''; };

export default function BetaAccPayment() {
  const { search } = useLocation();
  const navigate = useNavigate();
  const kind = new URLSearchParams(search).get('kind') === 'ledger' ? 'ledger' : 'vendor';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <style>{ACC_CSS}</style>
      <div className="ac-seg" role="group" aria-label="Payment kind">
        <button type="button" className={kind === 'vendor' ? 'on' : ''} aria-pressed={kind === 'vendor'} onClick={() => navigate(`${BASE}?tab=list`)}>Vendor payments (against PO)</button>
        <button type="button" className={kind === 'ledger' ? 'on' : ''} aria-pressed={kind === 'ledger'} onClick={() => navigate(`${BASE}?kind=ledger&tab=list`)}>Ledger / expense payments</button>
      </div>
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {kind === 'vendor' ? <BetaPayment base={BASE} /> : <LedgerPay />}
      </div>
    </div>
  );
}

function LedgerPay() {
  const navigate = useNavigate();
  const { search } = useLocation();
  const tab = new URLSearchParams(search).get('tab') === 'create' ? 'create' : 'list';
  const { selectedCompany } = useCompany() || {};
  const { user } = useAuth() || {};
  const companyId = selectedCompany?.companyId;
  const [pays, setPays] = useState(null);
  const [expenses, setExpenses] = useState([]);
  const [ledgers, setLedgers] = useState([]);
  const [banks, setBanks] = useState([]);
  const [reload, setReload] = useState(0);
  const [editing, setEditing] = useState(null);
  const [note, setNote] = useState(null);
  const [slot, setSlot] = useState(null);
  const canAdd = can(user, 'accPayment', 'create');
  useEffect(() => {
    if (!companyId) return;
    const get = u => axios.get(u, { params: { companyId } }).then(r => (Array.isArray(r.data) ? r.data : [])).catch(() => []);
    Promise.all([get('/api/accounts/payments'), get('/api/accounts/expenses'), get('/api/ledger/accounts'), get('/api/accounts/banks')]).then(([p, e, l, b]) => {
      setPays(p); setExpenses(e.filter(x => x.status !== 'deleted')); setLedgers(l); setBanks(b.filter(x => x.status !== 'inactive'));
    });
  }, [companyId, reload]);
  const rows = pays && pays.filter(p => p.type === 'payment' && p.entityType === 'ledger');
  const cur = editing ? 'create' : (tab === 'create' && canAdd ? 'create' : 'list');
  const go = k => { setEditing(null); navigate(`${BASE}?kind=ledger&tab=${k}`); };
  return (
    <div className="sb">
      <style>{SALES_CSS + PX_CSS + ACC_CSS}</style>
      <div className="sb-tabs" role="tablist">
        {[['list', 'Ledger payments'], ...(canAdd || editing ? [['create', editing ? `Edit Payment ${editing.paymentId}` : 'Add Ledger Payment']] : [])].map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={cur === k} className={`sb-tab${cur === k ? ' on' : ''}`} onClick={() => go(k)}>{l}{k === 'list' && rows && <span className="n">{rows.length}</span>}</button>
        ))}
        <div className="sb-slot" ref={setSlot} />
      </div>
      {note && <div className="sb-note" role="status">{note}<button type="button" onClick={() => setNote(null)} aria-label="Dismiss">×</button></div>}
      {cur === 'create'
        ? <div className="sb-body"><PayForm key={editing ? editing.paymentId : 'new'} companyId={companyId} edit={editing} pays={pays || []} expenses={expenses} ledgers={ledgers} banks={banks}
            onCancel={() => go('list')} onSaved={t => { setReload(x => x + 1); setNote(t); go('list'); }} /></div>
        : <PayList rows={rows} banks={banks} company={selectedCompany} user={user} slot={slot} companyId={companyId} onEdit={p => { setNote(null); setEditing(p); }} onChanged={t => { setReload(x => x + 1); setNote(t); }} />}
    </div>
  );
}

const expList = p => (p.linkedExpenses || []).map(x => x.expNo || `EXP-${x.expenseId}`).join(', ');
const printPay = (p, banks, company, user) => printVoucher({
  title: 'PAYMENT VOUCHER', sub: 'Ledger / expense payment', company, user,
  kv: [['Payment No.', String(p.paymentId)], ['Date', dmy(p.date)], ['Mode', p.paymentMode], ['Bank', bankName(banks, p.bankId)], ['Ref / UTR', p.referenceNo], ['Status', String(p.status || '').toUpperCase()]],
  party: { label: 'Paid to', name: p.entityName || p.party },
  heads: [['Sl', '30px', 'c'], ['Particulars'], ['Amount ₹', '130px', 'r']],
  rows: (p.linkedExpenses || []).length ? p.linkedExpenses.map((x, i) => [String(i + 1), `Against ${x.expNo || `EXP-${x.expenseId}`}`, amt(x.amount)]) : [['1', p.purpose || p.notes || 'On account', amt(p.amount)]],
  totals: [['Total paid', amt(p.amount)]], words: inWords(Number(p.amount) || 0), narration: p.notes || p.purpose,
  signs: ['Received by', `For ${company?.companyName || ''}`],
});

function PayList({ rows, banks, company, user, slot, companyId, onEdit, onChanged }) {
  const [q, setQ] = useState('');
  const [st, setSt] = useState('');
  const [selId, setSelId] = useState(null);
  const [ask, setAsk] = useState(null);
  const [busy, setBusy] = useState(false);
  useClearSel(ask ? null : selId, setSelId, '.sb-t tbody tr, .sb-tools, .sb-ask, .cpv-ov');
  const w = words(q);
  const list = useMemo(() => (rows || []).filter(p => (!st || p.status === st) && hit(`${p.paymentId} ${p.entityName} ${p.party} ${p.notes} ${p.purpose} ${p.referenceNo} ${p.paymentMode} ${expList(p)} ${bankName(banks, p.bankId)}`, w))
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) || b.paymentId - a.paymentId), [rows, st, w.join(' '), banks]);   // eslint-disable-line react-hooks/exhaustive-deps
  const sel = list.find(p => p.paymentId === selId) || null;
  const canEdit = can(user, 'accPayment', 'edit'), canDel = can(user, 'accPayment', 'delete'), canAppr = can(user, 'accPayment', 'approve');
  const all = rows || [];
  const act = async (p, what) => {
    setBusy(true);
    try {
      if (what === 'delete') await axios.delete(`/api/accounts/payments/${p.paymentId}`, { params: { companyId } });
      else await axios.put(`/api/accounts/payments/${p.paymentId}`, { status: 'confirmed', approvedBy: user?.name || user?.username || 'Admin', approvedAt: new Date().toISOString() }, { params: { companyId } });
      setAsk(null); setSelId(null); onChanged(`${what === 'delete' ? 'Deleted' : 'Approved'} payment ${p.paymentId}.`);
    } catch (e) { onChanged(e.response?.data?.error || 'Could not do that.'); } finally { setBusy(false); }
  };
  return (
    <>
      {slot && createPortal(<>
        <input className="sb-search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search no, ledger, expense, ref…" aria-label="Search payments" />
        <select className="sb-search" style={{ width: 150 }} value={st} onChange={e => setSt(e.target.value)} aria-label="Status"><option value="">All</option><option value="pending">Pending approval</option><option value="confirmed">Approved</option><option value="rejected">Rejected</option></select>
        <button type="button" className="sb-tbtn" onClick={() => printDepList({ title: 'LEDGER PAYMENT LIST', company, user, filter: st || 'All', total: list.reduce((t, p) => t + (Number(p.amount) || 0), 0),
          heads: ['Payment No.', 'Date', 'Paid to', 'Against expenses', 'Purpose', 'Mode', 'Bank', 'Ref / UTR', 'Amount ₹', 'Status'],
          rows: list.map(p => [String(p.paymentId), dmy(p.date), p.entityName || p.party, expList(p), p.purpose || p.notes, p.paymentMode, bankName(banks, p.bankId), p.referenceNo, amt(p.amount), p.status]) })}><Svg name="file" size={13} />Print list</button>
        <div className="sb-tools">
          <span className="sb-picked">{sel ? <b>{sel.paymentId}</b> : 'Select a payment'}</span>
          <button type="button" className="sb-tbtn" disabled={!sel} onClick={() => printPay(sel, banks, company, user)}><Svg name="file" size={13} />Print</button>
          {canAppr && <button type="button" className="sb-tbtn" disabled={!sel || sel.status !== 'pending'} onClick={() => act(sel, 'approve')}><Svg name="check" size={13} />Approve</button>}
          {canEdit && <button type="button" className="sb-tbtn" disabled={!sel} onClick={() => onEdit(sel)}><Svg name="settings" size={13} />Edit</button>}
          {canDel && <button type="button" className="sb-tbtn del" disabled={!sel} onClick={() => setAsk(sel)}><Svg name="x" size={13} />Delete</button>}
        </div>
      </>, slot)}
      {ask && <div className="sb-ask" role="alertdialog" aria-label="Confirm delete"><span><b>Delete payment {ask.paymentId}</b> — {ask.entityName}, ₹ {amt(ask.amount)}?{ask.status === 'confirmed' && <b style={{ color: '#B42318' }}> It is APPROVED — the bank balance and ledger change too.</b>}</span>
        <button type="button" className="sb-abtn" onClick={() => setAsk(null)} disabled={busy}>Keep</button><button type="button" className="sb-abtn danger" onClick={() => act(ask, 'delete')} disabled={busy}>{busy ? 'Deleting…' : 'Yes, delete'}</button></div>}
      <div className="ac-sum">
        <div>Ledger payments<b>{all.length}</b></div>
        <div>Approved ₹<b style={{ color: '#067647' }}>{amt(all.filter(p => p.status === 'confirmed').reduce((t, p) => t + (Number(p.amount) || 0), 0))}</b></div>
        <div>Pending approval<b style={{ color: '#B54708' }}>{all.filter(p => p.status === 'pending').length}</b></div>
      </div>
      <div className="sb-list">
        <table className="sb-t px acx">
          <colgroup>{[3, 8, 7, 16, 14, 17, 12, 9, 7].map((x, i) => <col key={i} style={{ width: `${x}%` }} />)}</colgroup>
          <thead><tr><th className="r">Sr</th><th>Payment No.</th><th>Date</th><th>Paid to (ledger)</th><th>Against expenses</th><th>Purpose / notes</th><th>Mode · Bank · Ref</th><th className="r">Amount ₹</th><th>Status</th></tr></thead>
          <tbody>
            {rows === null ? <tr><td colSpan={9} className="sb-empty">Loading…</td></tr>
              : !list.length ? <tr><td colSpan={9} className="sb-empty">{q || st ? 'Nothing matches.' : 'No ledger payment yet — click “Add Ledger Payment”.'}</td></tr>
                : list.map((p, i) => (
                  <tr key={p.paymentId} className={selId === p.paymentId ? 'sel' : ''} onClick={() => setSelId(p.paymentId)} onDoubleClick={() => canEdit && onEdit(p)} style={{ cursor: 'pointer' }}>
                    <td className="r">{i + 1}</td><td><b className="mono">{p.paymentId}</b></td><td className="d">{dmy(p.date)}</td>
                    <td className="b">{p.entityName || p.party}</td><td className="mono">{expList(p) || <span style={{ color: '#98A2B3' }}>On account</span>}</td>
                    <td>{p.purpose || p.notes || '—'}</td>
                    <td>{p.paymentMode}<span className="sm">{[bankName(banks, p.bankId), p.referenceNo].filter(Boolean).join(' · ')}</span></td>
                    <td className="r b d">{amt(p.amount)}</td><td><Pill s={p.status} /></td>
                  </tr>
                ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function PayForm({ companyId, edit, pays, expenses, ledgers, banks, onSaved, onCancel }) {
  const e0 = edit || {};
  const [v, setV] = useState(() => ({ date: (e0.date || '').slice(0, 10) || today(), mode: e0.paymentMode || 'Bank Transfer', bankId: e0.bankId ? String(e0.bankId) : '', ref: e0.referenceNo || '', notes: e0.notes || e0.purpose || '', onAcct: (e0.linkedExpenses || []).length ? '' : (e0.amount ? String(e0.amount) : '') }));
  const [led, setLed] = useState(() => (edit ? { id: e0.entityId, name: e0.entityName || e0.party } : null));
  const [picked, setPicked] = useState(() => Object.fromEntries((e0.linkedExpenses || []).map(x => [String(x.expenseId), String(x.amount)])));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const set = k => e => { const x = e.target.value; setV(o => ({ ...o, [k]: x })); setMsg(null); };
  useEffect(() => { if (!v.bankId && banks.length === 1) setV(o => ({ ...o, bankId: String(banks[0].bankId) })); }, [banks, v.bankId]);
  const ledGroups = useMemo(() => {
    const by = {};
    ledgers.forEach(l => { if (!l.name) return; const g = l.groupName || 'Ledger Accounts'; (by[g] = by[g] || []).push({ key: String(l.id || l.name), label: l.name, sub: l.code || '', raw: l }); });
    return Object.keys(by).sort().map(g => ({ group: g, items: by[g].sort((a, b) => a.label.localeCompare(b.label)) }));
  }, [ledgers]);
  const bills = useMemo(() => {
    if (!led) return [];
    return expenses.filter(e => !['rejected', 'draft'].includes(e.status) && (norm(e.ledgerName) === norm(led.name) || (led.id && String(e.ledgerId || '') === String(led.id))))
      .map(e => {
        const value = Number(e.grandTotal || e.amount) || 0;
        const done = pays.filter(p => p.type === 'payment' && p.status !== 'rejected' && String(p.paymentId) !== String(e0.paymentId || '')
          && (String(p.expenseId) === String(e.expenseId) || (p.linkedExpenses || []).some(x => String(x.expenseId) === String(e.expenseId))))
          .reduce((s, p) => { const l = (p.linkedExpenses || []).find(x => String(x.expenseId) === String(e.expenseId)); return s + (l ? Number(l.amount) || 0 : Number(p.amount) || 0); }, 0);
        return { id: String(e.expenseId), no: `EXP-${e.expenseId}`, date: e.date, desc: e.description || e.expenseCategory || '', order: e.orderNo || '', value, done, bal: Math.max(0, r2(value - done)) };
      }).filter(b => b.bal > 0.005 || picked[b.id] !== undefined).sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  }, [led, expenses, pays, picked, e0.paymentId]);
  const ticked = bills.filter(b => picked[b.id] !== undefined);
  const total = ticked.length ? r2(ticked.reduce((s, b) => s + (Number(picked[b.id]) || 0), 0)) : (Number(v.onAcct) || 0);
  const needsBank = BANK_MODES.includes(v.mode);
  const toggle = b => setPicked(p => { const n = { ...p }; if (n[b.id] !== undefined) delete n[b.id]; else n[b.id] = String(b.bal); return n; });

  const save = async () => {
    if (!led) return setMsg({ k: 'err', t: 'Pick the ledger the money is paid to.' });
    if (ticked.some(b => !(Number(picked[b.id]) > 0))) return setMsg({ k: 'err', t: 'Every ticked bill needs an amount.' });
    if (!(total > 0)) return setMsg({ k: 'err', t: 'Tick an expense bill, or enter the amount paid on account.' });
    if (!ticked.length && !v.notes.trim()) return setMsg({ k: 'err', t: 'Write the purpose in Notes for a payment without an expense bill.' });
    if (needsBank && !v.bankId) return setMsg({ k: 'err', t: 'Pick the bank account for this mode.' });
    setBusy(true);
    const body = { companyId, date: v.date, paymentMode: v.mode, bankId: v.mode === 'Cash' ? '' : v.bankId, referenceNo: v.ref.trim(), notes: v.notes.trim(),
      amount: total.toFixed(2), type: 'payment', status: 'pending', entityType: 'ledger', entityId: led.id, entityName: led.name, party: led.name,
      orderId: ticked.length === 1 ? ticked[0].id : '', orderType: '', linkedExpenses: ticked.map(b => ({ expenseId: b.id, expNo: b.no, amount: Number(picked[b.id]) || 0 })),
      purpose: v.notes.trim() || ticked.map(b => b.desc || b.no).join(', ') };
    try {
      if (edit) { await axios.put(`/api/accounts/payments/${edit.paymentId}`, body, { params: { companyId } }); onSaved(`Payment ${edit.paymentId} updated — sent for approval again.`); }
      else { const r = await axios.post('/api/accounts/payments', body, { params: { companyId } }); onSaved(`Payment ${r.data?.paymentId || ''} saved — ₹ ${amt(total)} to ${led.name}, sent for approval.`); }
    } catch (e) { setMsg({ k: 'err', t: e.response?.data?.error || 'Could not save the payment.' }); }
    finally { setBusy(false); }
  };
  return (
    <div className="sf">
      <div className="sf-hero"><span className="ic"><Svg name="wallet" size={15} /></span><h1>{edit ? `Edit payment ${edit.paymentId}` : 'Add Ledger / Expense Payment'}</h1><span className="grow" /></div>
      <div className="sf-2" style={{ marginTop: 10 }}>
        <div className="sf-card"><div className="sf-ch"><span className="ico"><Svg name="user" size={13} /></span><b>Paid to</b></div>
          <table className="sf-kv"><tbody>
            <tr><th>Date <i>*</i></th><td><input type="date" value={v.date} onChange={set('date')} /></td></tr>
            <tr><th>Ledger <i>*</i></th><td><Picker value={led ? led.name : ''} groups={ledGroups} placeholder="Type ledger — rent, salary, electricity…" ariaLabel="Ledger" autoFocus={!edit}
              onPick={o => { setLed({ id: o.raw?.id || o.key, name: o.label }); setPicked({}); setMsg(null); }} /></td></tr>
            <tr><th>Notes / purpose</th><td><input value={v.notes} onChange={set('notes')} placeholder={ticked.length ? 'Optional' : 'Needed when no bill is ticked'} /></td></tr>
          </tbody></table></div>
        <div className="sf-card"><div className="sf-ch"><span className="ico"><Svg name="wallet" size={13} /></span><b>Paid from</b></div>
          <table className="sf-kv"><tbody>
            <tr><th>Mode</th><td><select value={v.mode} onChange={set('mode')}>{[...new Set([...MODES, v.mode])].map(m => <option key={m}>{m}</option>)}</select></td></tr>
            {v.mode !== 'Cash' && <tr><th>Bank{needsBank && <i> *</i>}</th><td><select value={v.bankId} onChange={set('bankId')}><option value="">Choose the bank…</option>{banks.map(b => <option key={b.bankId} value={String(b.bankId)}>{b.bankName} — A/c {b.accountNumber}</option>)}</select></td></tr>}
            <tr><th>Ref / UTR / cheque</th><td><input value={v.ref} onChange={set('ref')} className="mono" placeholder="Optional" /></td></tr>
          </tbody></table></div>
      </div>
      <div className="sf-card"><div className="sf-ch"><span className="ico"><Svg name="file" size={13} /></span><b>Open expense bills of this ledger</b><span className="grow" /><span style={{ fontSize: 12, color: '#fff' }}>Tick the bills this payment settles</span></div>
        {!led ? <div className="sf-empty">Pick the ledger to see its open expense bills.</div> : !bills.length ? (
          <div style={{ padding: 10, fontSize: 13 }}>No open expense bill for {led.name}. Enter the amount paid on account:
            <input className="num" inputMode="decimal" value={v.onAcct} onChange={e => setV(o => ({ ...o, onAcct: e.target.value.replace(/[^\d.]/g, '') }))} placeholder="0.00" style={{ marginLeft: 8, width: 160, height: 30, border: '1px solid #C9D7DA', borderRadius: 4, padding: '0 8px', textAlign: 'right' }} aria-label="Amount on account" /></div>
        ) : (
          <table className="ac-lines"><thead><tr><th style={{ width: 34 }} /><th>Bill</th><th>Date</th><th>Description</th><th>Order</th><th className="r">Bill ₹</th><th className="r">Paid ₹</th><th className="r">Balance ₹</th><th className="r" style={{ width: 140 }}>Pay now ₹</th></tr></thead>
            <tbody>{bills.map(b => (
              <tr key={b.id}><td style={{ textAlign: 'center' }}><input type="checkbox" checked={picked[b.id] !== undefined} onChange={() => toggle(b)} style={{ width: 15, height: 15, accentColor: '#03444f' }} aria-label={`Pay ${b.no}`} /></td>
                <td className="mono"><b>{b.no}</b></td><td>{dmy(b.date)}</td><td>{b.desc}</td><td className="mono">{b.order}</td>
                <td className="r">{amt(b.value)}</td><td className="r">{amt(b.done)}</td><td className="r"><b>{amt(b.bal)}</b></td>
                <td>{picked[b.id] !== undefined ? <input className="num" inputMode="decimal" value={picked[b.id]} onChange={e => { const x = e.target.value.replace(/[^\d.]/g, ''); setPicked(p => ({ ...p, [b.id]: x })); }} aria-label={`Amount for ${b.no}`} /> : ''}</td></tr>
            ))}</tbody>
            <tfoot><tr><td colSpan={8} style={{ textAlign: 'right' }}>Total paid</td><td className="r">{amt(total)}</td></tr></tfoot>
          </table>
        )}
      </div>
      {msg && <div className={`sf-msg ${msg.k}`} role="status">{msg.t}</div>}
      <div className="sf-bar">
        <div className="info">{led ? led.name : 'Pick the ledger'} · ₹ {amt(total)} · {v.mode}{ticked.length ? ` · ${ticked.length} bill${ticked.length === 1 ? '' : 's'}` : ' · on account'} · goes for approval</div>
        <button type="button" className="sf-b ghost" onClick={onCancel} disabled={busy}>Cancel</button>
        <button type="button" className="sf-b pri" onClick={save} disabled={busy}>{busy ? 'Saving…' : edit ? 'Update' : 'Save payment'}</button>
      </div>
    </div>
  );
}
