/* Beta — Bank Guarantees (Sales Order → Bank Guarantee).
 * The BGs are the Deposit records of type "BG" (/api/deposits), the same ones the classic Deposit page shows.
 * List with search + status filter, Print list, Print the cover page of one BG; Add / Edit a BG. */
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
import { printBgList, printBgCover, bgState, daysTo, dmy } from './BetaCertPrint';

const amt = v => (Number(v) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const STATES = [['', 'All'], ['live', 'Live (active + expiring)'], ['expiring', 'Expiring ≤ 30 days'], ['expired', 'Expired'], ['pending', 'Pending approval'], ['released', 'Released']];
const PILL = { active: ['#ECFDF3', '#067647'], expiring: ['#FFFAEB', '#B54708'], expired: ['#FEF3F2', '#B42318'], pending: ['#EFF8FF', '#175CD3'], released: ['#F2F4F7', '#475467'], claimed: ['#FEF3F2', '#B42318'] };
const EXTRA_CSS = `
.bgx td { white-space:nowrap; overflow:hidden; text-overflow:ellipsis; } .bgx .b { font-weight:700; } .bgx .sm { display:block; font-size:11px; color:#667085; }
.bg-pill { display:inline-block; padding:2px 8px; border-radius:99px; font-size:11px; font-weight:700; }
.bg-sum { display:flex; flex-wrap:wrap; gap:0; background:#fff; border-bottom:1px solid #DCE6E8; flex-shrink:0; }
.bg-sum div { padding:7px 16px; border-right:1px solid #DCE6E8; font-size:11px; color:#667085; text-transform:uppercase; letter-spacing:.3px; }
.bg-sum b { display:block; font-size:15px; color:#03444f; text-transform:none; letter-spacing:0; }
`;

export default function BetaBG() {
  const navigate = useNavigate();
  const { search } = useLocation();
  const tab = new URLSearchParams(search).get('tab') === 'create' ? 'create' : 'list';
  const { selectedCompany } = useCompany() || {};
  const { user } = useAuth() || {};
  const companyId = selectedCompany?.companyId;
  const [bgs, setBgs] = useState(null);
  const [orders, setOrders] = useState([]);
  const [reload, setReload] = useState(0);
  const [editing, setEditing] = useState(null);
  const [note, setNote] = useState(null);
  const [slot, setSlot] = useState(null);
  const canAdd = can(user, 'accDeposit', 'create');

  useEffect(() => {
    if (!companyId) return;
    axios.get('/api/deposits', { params: { companyId } })
      .then(r => setBgs((Array.isArray(r.data) ? r.data : []).filter(d => d.depositType === 'BG' && d.status !== 'deleted')))
      .catch(() => setBgs([]));
  }, [companyId, reload]);
  useEffect(() => {
    if (!companyId) return;
    axios.get('/api/sales-orders', { params: { companyId } }).then(r => setOrders(Array.isArray(r.data) ? r.data : [])).catch(() => setOrders([]));
  }, [companyId]);

  const cur = editing ? 'create' : (tab === 'create' && canAdd ? 'create' : 'list');
  const go = k => { setEditing(null); navigate(`/beta/bank-guarantee?tab=${k}`); };
  const tabs = [['list', 'Bank Guarantees'], ...(canAdd || editing ? [['create', editing ? `Edit ${editing.bgNo || editing.depositId}` : 'Add BG']] : [])];

  return (
    <div className="sb">
      <style>{SALES_CSS + PX_CSS + EXTRA_CSS}</style>
      <div className="sb-tabs" role="tablist">
        {tabs.map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={cur === k} className={`sb-tab${cur === k ? ' on' : ''}`} onClick={() => go(k)}>
            {label}{k === 'list' && bgs && <span className="n">{bgs.length}</span>}
          </button>
        ))}
        <div className="sb-slot" ref={setSlot} />
      </div>
      {note && <div className="sb-note" role="status">{note}<button type="button" onClick={() => setNote(null)} aria-label="Dismiss">×</button></div>}
      {cur === 'create'
        ? <div className="sb-body"><BgForm key={editing ? editing.depositId : 'new'} companyId={companyId} edit={editing} orders={orders}
            onCancel={() => go('list')} onSaved={text => { setReload(x => x + 1); setNote(text); go('list'); }} /></div>
        : <BgList bgs={bgs} orders={orders} company={selectedCompany} user={user} slot={slot}
            onEdit={b => { setNote(null); setEditing(b); }} />}
    </div>
  );
}

function BgList({ bgs, orders, company, user, slot, onEdit }) {
  const [q, setQ] = useState('');
  const [st, setSt] = useState('');
  const [selId, setSelId] = useState(null);
  useClearSel(selId, setSelId, '.sb-t tbody tr, .sb-tools');
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const list = useMemo(() => (bgs || []).filter(b => {
    const k = bgState(b).k;
    if (st === 'live' ? !['active', 'expiring'].includes(k) : st && k !== st) return false;
    return !words.length || words.every(w => `${b.bgNo} ${b.customerName} ${b.orderNo} ${b.customerPO} ${b.issuingBankName} ${b.issuedToBankName} ${b.depositId}`.toLowerCase().includes(w));
  }).sort((a, b) => String(a.expiryDate || a.endDate || '9').localeCompare(String(b.expiryDate || b.endDate || '9'))), [bgs, st, words.join(' ')]);   // eslint-disable-line react-hooks/exhaustive-deps
  const sel = list.find(b => b.depositId === selId) || null;
  const canEdit = can(user, 'accDeposit', 'edit');
  const sum = k => (bgs || []).filter(b => (k === 'live' ? ['active', 'expiring'].includes(bgState(b).k) : bgState(b).k === k));
  const tot = arr => arr.reduce((t, b) => t + (Number(b.bgAmount || b.amount) || 0), 0);
  const orderOf = b => orders.find(o => String(o.orderId) === String(b.soId)) || null;
  return (
    <>
      {slot && createPortal(<>
        <input className="sb-search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search BG no, client, order, bank…" aria-label="Search bank guarantees" />
        <select className="sb-search" style={{ width: 190 }} value={st} onChange={e => setSt(e.target.value)} aria-label="Status">{STATES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        <button type="button" className="sb-tbtn" onClick={() => printBgList({ rows: list, company, user, filter: (STATES.find(x => x[0] === st) || [])[1] })}><Svg name="file" size={13} />Print list</button>
        <div className="sb-tools">
          <span className="sb-picked">{sel ? <>Selected: <b>{sel.bgNo || sel.depositId}</b></> : 'Click a BG to select'}</span>
          <button type="button" className="sb-tbtn" disabled={!sel} onClick={() => printBgCover({ bg: sel, order: orderOf(sel), company, user })}><Svg name="file" size={13} />Cover page</button>
          {canEdit && <button type="button" className="sb-tbtn" disabled={!sel} onClick={() => onEdit(sel)}><Svg name="settings" size={13} />Edit</button>}
        </div>
      </>, slot)}
      <div className="bg-sum">
        <div>Live BGs<b>{sum('live').length} · ₹ {amt(tot(sum('live')))}</b></div>
        <div>Expiring ≤ 30 days<b style={{ color: '#B54708' }}>{sum('expiring').length}</b></div>
        <div>Expired (not released)<b style={{ color: '#B42318' }}>{sum('expired').length}</b></div>
        <div>Pending approval<b>{sum('pending').length}</b></div>
        <div>Released<b>{sum('released').length}</b></div>
      </div>
      <div className="sb-list">
        <table className="sb-t px bgx">
          <colgroup><col style={{ width: '4%' }} /><col style={{ width: '12%' }} /><col style={{ width: '22%' }} /><col style={{ width: '14%' }} /><col style={{ width: '12%' }} /><col style={{ width: '9%' }} /><col style={{ width: '9%' }} /><col style={{ width: '9%' }} /><col style={{ width: '9%' }} /></colgroup>
          <thead><tr><th className="r">#</th><th>BG No.</th><th>Client / Order</th><th>Issuing bank</th><th className="r">Amount ₹</th><th>Issue date</th><th>Expiry</th><th>Claim expiry</th><th>Status</th></tr></thead>
          <tbody>
            {bgs === null ? <tr><td colSpan={9} className="sb-empty">Loading…</td></tr>
              : !list.length ? <tr><td colSpan={9} className="sb-empty">{q || st ? 'Nothing matches.' : 'No bank guarantee yet — click “Add BG”.'}</td></tr>
                : list.map((b, i) => {
                  const s = bgState(b), [bg, fg] = PILL[s.k] || PILL.active;
                  return (
                    <tr key={b.depositId} className={selId === b.depositId ? 'sel' : ''} onClick={() => setSelId(b.depositId)} onDoubleClick={() => canEdit && onEdit(b)} style={{ cursor: 'pointer' }}>
                      <td className="r">{i + 1}</td><td className="b mono">{b.bgNo || '—'}</td>
                      <td title={b.customerName}><b>{b.customerName || '—'}</b><span className="sm">{b.orderNo || 'No order'}{b.customerPO ? ` · PO ${b.customerPO}` : ''}</span></td>
                      <td title={b.issuingBankName}>{b.issuingBankName || '—'}</td>
                      <td className="r b">{amt(b.bgAmount || b.amount)}</td>
                      <td>{dmy(b.startDate) || '—'}</td><td>{dmy(b.expiryDate || b.endDate) || '—'}</td><td>{dmy(b.claimExpiryDate) || '—'}</td>
                      <td><span className="bg-pill" style={{ background: bg, color: fg }}>{s.label}</span></td>
                    </tr>
                  );
                })}
          </tbody>
        </table>
      </div>
    </>
  );
}

function BgForm({ companyId, edit, orders, onSaved, onCancel }) {
  const e0 = edit || {};
  const [v, setV] = useState(() => ({
    soId: e0.soId ? String(e0.soId) : '', bgNo: e0.bgNo || '', bgAmount: e0.bgAmount || e0.amount || '', startDate: e0.startDate || '', expiryDate: e0.expiryDate || e0.endDate || '',
    claimExpiryDate: e0.claimExpiryDate || '', pbgContactNo: e0.pbgContactNo || '', issuingBankId: e0.issuingBankId ? String(e0.issuingBankId) : '',
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
  const dl = daysTo(v.expiryDate);
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
      bgNo: v.bgNo.trim(), bgAmount: v.bgAmount, amount: v.bgAmount, startDate: v.startDate, expiryDate: v.expiryDate, endDate: v.expiryDate, claimExpiryDate: v.claimExpiryDate,
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
            <tr><th>Amount ₹ <i>*</i></th><td><input value={v.bgAmount} onChange={e => { const x = e.target.value.replace(/[^\d.]/g, ''); setV(o => ({ ...o, bgAmount: x })); setMsg(null); }} inputMode="decimal" className="num" placeholder="0.00" />
              {pct && <div style={{ fontSize: 11, color: '#667085', marginTop: 3 }}>{pct}% of the order value</div>}</td></tr>
            <tr><th>Issue date <i>*</i></th><td><input type="date" value={v.startDate} onChange={set('startDate')} /></td></tr>
            <tr><th>Expiry date <i>*</i></th><td><input type="date" value={v.expiryDate} onChange={set('expiryDate')} />
              {dl != null && <div style={{ fontSize: 11, color: dl < 0 ? '#B42318' : dl <= 30 ? '#B54708' : '#667085', marginTop: 3 }}>{dl < 0 ? `Expired ${-dl} days ago` : `${dl} days left`}</div>}</td></tr>
            <tr><th>Claim expiry</th><td><input type="date" value={v.claimExpiryDate} onChange={set('claimExpiryDate')} /></td></tr>
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
