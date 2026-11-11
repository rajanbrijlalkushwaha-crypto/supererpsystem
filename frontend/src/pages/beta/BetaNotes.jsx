/* Beta — Debit Note (to a vendor, on a purchase bill) and Credit Note (to a client, on a sales bill),
 * Account → Debit Note / Credit Note. Same records as the classic pages: /api/accounts/debit-notes | credit-notes.
 * Two kinds: Goods return (items from the bill, qty up to what was billed) or Discount / price correction (amount + GST).
 * Save as Draft or Approved; list with search + status, Print list, Print note, Approve, Edit (draft), Delete. */
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

const GST_RATES = ['0', '5', '12', '18', '28'];
const KIND = {
  debit: { api: 'debit-notes', id: 'dnId', no: 'dnNo', party: 'vendorName', partyLabel: 'Vendor', bills: 'purchase', perm: 'accDebitNote', title: 'Debit Note', path: '/beta/account/debit-note',
    returns: ['Goods Returned to Vendor', 'Damaged Goods Returned', 'Quality Rejection', 'Wrong Supply', 'Short Delivery', 'Overcharged by Vendor'],
    discounts: ['Discount Received', 'Price Correction', 'Rebate from Vendor', 'Purchase Allowance', 'Other'], discountItem: 'Discount Received' },
  credit: { api: 'credit-notes', id: 'cnId', no: 'cnNo', party: 'clientName', partyLabel: 'Client', bills: 'sales', perm: 'accCreditNote', title: 'Credit Note', path: '/beta/account/credit-note',
    returns: ['Goods Returned by Customer', 'Damaged Goods Returned', 'Quality Rejection', 'Short Delivery Billed', 'Sales Return'],
    discounts: ['Discount Allowed', 'Price Correction', 'Promotional Discount', 'Loyalty Discount', 'Other'], discountItem: 'Discount Allowed' },
};
const typeLabel = t => (t === 'discount' ? 'Discount / price' : 'Goods return');

export default function BetaNotes({ kind }) {
  const K = KIND[kind];
  const navigate = useNavigate();
  const { search } = useLocation();
  const tab = new URLSearchParams(search).get('tab') === 'create' ? 'create' : 'list';
  const { selectedCompany } = useCompany() || {};
  const { user } = useAuth() || {};
  const companyId = selectedCompany?.companyId;
  const [rows, setRows] = useState(null);
  const [bills, setBills] = useState([]);
  const [reload, setReload] = useState(0);
  const [editing, setEditing] = useState(null);
  const [note, setNote] = useState(null);
  const [slot, setSlot] = useState(null);
  const canAdd = can(user, K.perm, 'create');
  useEffect(() => {
    if (!companyId) return;
    axios.get(`/api/accounts/${K.api}`, { params: { companyId } }).then(r => setRows(Array.isArray(r.data) ? r.data : [])).catch(() => setRows([]));
  }, [companyId, reload, K.api]);
  useEffect(() => {
    if (!companyId) return;
    axios.get('/api/bills', { params: { companyId, type: K.bills } }).then(r => setBills((Array.isArray(r.data) ? r.data : []).filter(b => b && b.status !== 'deleted' && (b.type || K.bills) === K.bills))).catch(() => setBills([]));
  }, [companyId, K.bills]);
  const cur = editing ? 'create' : (tab === 'create' && canAdd ? 'create' : 'list');
  const go = k => { setEditing(null); navigate(`${K.path}?tab=${k}`); };
  return (
    <div className="sb">
      <style>{SALES_CSS + PX_CSS + ACC_CSS}</style>
      <div className="sb-tabs" role="tablist">
        {[['list', `${K.title}s`], ...(canAdd || editing ? [['create', editing ? `Edit ${editing[K.no]}` : `Add ${K.title}`]] : [])].map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={cur === k} className={`sb-tab${cur === k ? ' on' : ''}`} onClick={() => go(k)}>{l}{k === 'list' && rows && <span className="n">{rows.length}</span>}</button>
        ))}
        <div className="sb-slot" ref={setSlot} />
      </div>
      {note && <div className="sb-note" role="status">{note}<button type="button" onClick={() => setNote(null)} aria-label="Dismiss">×</button></div>}
      {cur === 'create'
        ? <div className="sb-body"><NoteForm key={editing ? editing[K.id] : 'new'} K={K} companyId={companyId} edit={editing} bills={bills} onCancel={() => go('list')} onSaved={t => { setReload(x => x + 1); setNote(t); go('list'); }} /></div>
        : <NoteList K={K} rows={rows} company={selectedCompany} user={user} slot={slot} companyId={companyId} onEdit={n => { setNote(null); setEditing(n); }} onChanged={t => { setReload(x => x + 1); setNote(t); }} />}
    </div>
  );
}

const printNote = (K, n, company, user) => printVoucher({
  title: K.title.toUpperCase(), sub: `${typeLabel(n.noteType)} — ${n.reason || ''}`, company, user,
  kv: [[`${K.title} No.`, n[K.no]], ['Date', dmy(n.date)], ['Against Bill', n.billRef], ['Status', String(n.status || 'draft').toUpperCase()]],
  party: { label: K.partyLabel, name: n[K.party] },
  heads: [['Sl', '30px', 'c'], ['Description'], ['Qty', '60px', 'c'], ['Unit', '50px', 'c'], ['Rate ₹', '90px', 'r'], ['GST %', '55px', 'c'], ['Taxable ₹', '95px', 'r'], ['Amount ₹', '100px', 'r']],
  rows: (n.items || []).map((it, i) => [String(i + 1), it.productName, String(it.qty), it.unit, amt(it.rate), `${it.gstPercent || 0}%`, amt(it.taxableAmt), amt(it.totalAmt)]),
  totals: [['Taxable', amt(n.subTotal)], ['GST', amt(n.totalGST)], ['Total', amt(n.grandTotal)]],
  words: inWords(Number(n.grandTotal) || 0), narration: n.narration, signs: [`Accepted by, ${n[K.party] || ''}`, `For ${company?.companyName || ''}`],
});

function NoteList({ K, rows, company, user, slot, companyId, onEdit, onChanged }) {
  const [q, setQ] = useState('');
  const [st, setSt] = useState('');
  const [selId, setSelId] = useState(null);
  const [ask, setAsk] = useState(null);
  const [busy, setBusy] = useState(false);
  useClearSel(ask ? null : selId, setSelId, '.sb-t tbody tr, .sb-tools, .sb-ask, .cpv-ov');
  const w = words(q);
  const list = useMemo(() => (rows || []).filter(n => (!st || (n.status || 'draft') === st) && hit(`${n[K.no]} ${n[K.party]} ${n.billRef} ${n.reason} ${n.narration} ${(n.items || []).map(i => i.productName).join(' ')}`, w))
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) || b[K.id] - a[K.id]), [rows, st, w.join(' '), K]);   // eslint-disable-line react-hooks/exhaustive-deps
  const sel = list.find(n => n[K.id] === selId) || null;
  const canEdit = can(user, K.perm, 'edit'), canDel = can(user, K.perm, 'delete');
  const all = rows || [];
  const act = async (n, what) => {
    setBusy(true);
    try {
      if (what === 'delete') await axios.delete(`/api/accounts/${K.api}/${n[K.id]}`, { params: { companyId } });
      else await axios.put(`/api/accounts/${K.api}/${n[K.id]}`, { ...n, status: 'approved', approvedBy: user?.name || user?.username || '', approvedAt: new Date().toISOString() }, { params: { companyId } });
      setAsk(null); setSelId(null); onChanged(`${what === 'delete' ? 'Deleted' : 'Approved'} ${K.title.toLowerCase()} ${n[K.no]}.`);
    } catch (e) { onChanged(e.response?.data?.error || 'Could not do that.'); } finally { setBusy(false); }
  };
  return (
    <>
      {slot && createPortal(<>
        <input className="sb-search" value={q} onChange={e => setQ(e.target.value)} placeholder={`Search no, ${K.partyLabel.toLowerCase()}, bill, reason…`} aria-label={`Search ${K.title}s`} />
        <select className="sb-search" style={{ width: 130 }} value={st} onChange={e => setSt(e.target.value)} aria-label="Status"><option value="">All</option><option value="draft">Draft</option><option value="approved">Approved</option><option value="pending">Pending</option></select>
        <button type="button" className="sb-tbtn" onClick={() => printDepList({ title: `${K.title.toUpperCase()} LIST`, company, user, filter: st || 'All', total: list.reduce((t, n) => t + (Number(n.grandTotal) || 0), 0),
          heads: [`${K.title} No.`, 'Date', K.partyLabel, 'Against Bill', 'Type', 'Reason', 'Taxable ₹', 'GST ₹', 'Total ₹', 'Status'],
          rows: list.map(n => [n[K.no], dmy(n.date), n[K.party], n.billRef, typeLabel(n.noteType), n.reason, amt(n.subTotal), amt(n.totalGST), amt(n.grandTotal), n.status || 'draft']) })}><Svg name="file" size={13} />Print list</button>
        <div className="sb-tools">
          <span className="sb-picked">{sel ? <b>{sel[K.no]}</b> : `Select a ${K.title.toLowerCase()}`}</span>
          <button type="button" className="sb-tbtn" disabled={!sel} onClick={() => printNote(K, sel, company, user)}><Svg name="file" size={13} />Print</button>
          {canEdit && <button type="button" className="sb-tbtn" disabled={!sel || sel.status === 'approved'} onClick={() => act(sel, 'approve')}><Svg name="check" size={13} />Approve</button>}
          {canEdit && <button type="button" className="sb-tbtn" disabled={!sel || sel.status === 'approved'} onClick={() => onEdit(sel)} title="Only a draft can be edited"><Svg name="settings" size={13} />Edit</button>}
          {canDel && <button type="button" className="sb-tbtn del" disabled={!sel} onClick={() => setAsk(sel)}><Svg name="x" size={13} />Delete</button>}
        </div>
      </>, slot)}
      {ask && <div className="sb-ask" role="alertdialog" aria-label="Confirm delete"><span><b>Delete {K.title.toLowerCase()} {ask[K.no]}</b> ({ask[K.party]}, ₹ {amt(ask.grandTotal)})? This cannot be undone.</span>
        <button type="button" className="sb-abtn" onClick={() => setAsk(null)} disabled={busy}>Keep</button><button type="button" className="sb-abtn danger" onClick={() => act(ask, 'delete')} disabled={busy}>{busy ? 'Deleting…' : 'Yes, delete'}</button></div>}
      <div className="ac-sum">
        <div>{K.title}s<b>{all.length}</b></div>
        <div>Approved<b style={{ color: '#067647' }}>{all.filter(n => n.status === 'approved').length}</b></div>
        <div>Draft<b>{all.filter(n => (n.status || 'draft') === 'draft').length}</b></div>
        <div>Approved value ₹<b>{amt(all.filter(n => n.status === 'approved').reduce((t, n) => t + (Number(n.grandTotal) || 0), 0))}</b></div>
      </div>
      <div className="sb-list">
        <table className="sb-t px acx">
          <colgroup>{[3, 12, 7, 17, 11, 9, 15, 8, 8, 10].map((x, i) => <col key={i} style={{ width: `${x}%` }} />)}</colgroup>
          <thead><tr><th className="r">Sr</th><th>{K.title} No.</th><th>Date</th><th>{K.partyLabel}</th><th>Against Bill</th><th>Type</th><th>Reason</th><th className="r">GST ₹</th><th className="r">Total ₹</th><th>Status</th></tr></thead>
          <tbody>
            {rows === null ? <tr><td colSpan={10} className="sb-empty">Loading…</td></tr>
              : !list.length ? <tr><td colSpan={10} className="sb-empty">{q || st ? 'Nothing matches.' : `No ${K.title.toLowerCase()} yet — click “Add ${K.title}”.`}</td></tr>
                : list.map((n, i) => (
                  <tr key={n[K.id]} className={selId === n[K.id] ? 'sel' : ''} onClick={() => setSelId(n[K.id])} onDoubleClick={() => canEdit && n.status !== 'approved' && onEdit(n)} style={{ cursor: 'pointer' }}>
                    <td className="r">{i + 1}</td><td><b className="mono">{n[K.no]}</b></td><td className="d">{dmy(n.date)}</td>
                    <td className="b">{n[K.party]}</td><td className="mono">{n.billRef || '—'}</td><td>{typeLabel(n.noteType)}</td>
                    <td>{n.reason}{n.narration && <span className="sm">{n.narration}</span>}</td>
                    <td className="r d">{amt(n.totalGST)}</td><td className="r b d">{amt(n.grandTotal)}</td><td><Pill s={n.status || 'draft'} /></td>
                  </tr>
                ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

let lid = 1;
const blank = () => ({ k: lid++, productName: '', qty: '1', unit: 'Nos', rate: '', gstPercent: '18', max: null });
function NoteForm({ K, companyId, edit, bills, onSaved, onCancel }) {
  const e0 = edit || {};
  const disc0 = e0.noteType === 'discount' ? (e0.items || [])[0] || {} : {};
  const [v, setV] = useState(() => ({ noteType: e0.noteType || 'goods-return', party: e0[K.party] || '', billId: e0.linkedBillId ? String(e0.linkedBillId) : '', billRef: e0.billRef || '',
    date: e0.date || today(), reason: e0.reason || '', narration: e0.narration || '', discAmt: disc0.rate ? String(disc0.rate) : '', discGst: disc0.gstPercent != null ? String(disc0.gstPercent) : '0' }));
  const [lines, setLines] = useState(() => (e0.noteType !== 'discount' && (e0.items || []).length ? e0.items.map(it => ({ k: lid++, productName: it.productName, qty: String(it.qty), unit: it.unit || 'Nos', rate: String(it.rate), gstPercent: String(it.gstPercent ?? '18'), max: null })) : [blank()]));
  const [parties, setParties] = useState([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const set = k => e => { const x = e.target.value; setV(o => ({ ...o, [k]: x })); setMsg(null); };
  useEffect(() => {
    if (!companyId) return;
    axios.get(K.bills === 'purchase' ? '/api/vendors' : '/api/clients', { params: { companyId } }).then(r => setParties(Array.isArray(r.data) ? r.data : [])).catch(() => setParties([]));
  }, [companyId, K.bills]);
  const partyGroups = useMemo(() => {
    const fromBills = [...new Set(bills.map(b => b.partyName || b.vendorName).filter(Boolean))];
    const master = parties.map(p => p.vendorName || p.clientName || p.companyName).filter(Boolean);
    const all = [...new Set([...fromBills, ...master])].sort((a, b) => a.localeCompare(b));
    const billed = new Set(fromBills);
    return [{ group: `${K.partyLabel}s with bills`, items: all.filter(n => billed.has(n)).map(n => ({ key: n, label: n })) },
      { group: `Other ${K.partyLabel.toLowerCase()}s`, items: all.filter(n => !billed.has(n)).map(n => ({ key: n, label: n })) }].filter(g => g.items.length);
  }, [bills, parties, K.partyLabel]);
  const partyBills = useMemo(() => bills.filter(b => (b.partyName || b.vendorName) === v.party).sort((a, b) => String(b.billDate || '').localeCompare(String(a.billDate || ''))), [bills, v.party]);
  const bill = partyBills.find(b => String(b.billId) === v.billId) || null;
  const pickBill = id => {
    const b = partyBills.find(x => String(x.billId) === id);
    setV(o => ({ ...o, billId: id, billRef: b ? (b.billNo || b.vendorBillNo || String(b.billId)) : '' }));
    if (b && v.noteType === 'goods-return') setLines((b.items || []).map(it => ({ k: lid++, productName: it.description || it.productName || '', qty: '', unit: it.unit || 'Nos', rate: String(it.rate || ''), gstPercent: String(it.gstPct ?? it.gstPercent ?? '18'), max: Number(it.qty) || null })));
    setMsg(null);
  };
  const switchType = t => { setV(o => ({ ...o, noteType: t, reason: '' })); if (t === 'goods-return' && !lines.length) setLines([blank()]); setMsg(null); };
  const setLine = (k, f, x) => setLines(ls => ls.map(l => { if (l.k !== k) return l; if (f === 'qty' && l.max && Number(x) > l.max) x = String(l.max); return { ...l, [f]: x }; }));
  const calc = v.noteType === 'discount'
    ? [{ t: Number(v.discAmt) || 0, g: (Number(v.discAmt) || 0) * (Number(v.discGst) || 0) / 100 }]
    : lines.map(l => { const t = (Number(l.qty) || 0) * (Number(l.rate) || 0); return { t, g: t * (Number(l.gstPercent) || 0) / 100 }; });
  const sub = r2(calc.reduce((s, c) => s + c.t, 0)), gst = r2(calc.reduce((s, c) => s + c.g, 0)), total = r2(sub + gst);
  const reasons = v.noteType === 'discount' ? K.discounts : K.returns;

  const save = async status => {
    if (!v.party.trim()) return setMsg({ k: 'err', t: `Pick the ${K.partyLabel.toLowerCase()}.` });
    if (!v.date) return setMsg({ k: 'err', t: 'Enter the date.' });
    if (!v.reason) return setMsg({ k: 'err', t: 'Pick the reason.' });
    let items;
    if (v.noteType === 'goods-return') {
      const ok = lines.filter(l => l.productName.trim() && Number(l.qty) > 0 && Number(l.rate) > 0);
      if (!ok.length) return setMsg({ k: 'err', t: 'Enter the qty (and rate) of at least one item returned.' });
      items = ok.map(l => ({ productName: l.productName.trim(), qty: l.qty, unit: l.unit, rate: l.rate, gstPercent: l.gstPercent }));
    } else {
      if (!(Number(v.discAmt) > 0)) return setMsg({ k: 'err', t: 'Enter the discount amount.' });
      items = [{ productName: K.discountItem, qty: '1', unit: 'Nos', rate: v.discAmt, gstPercent: v.discGst }];
    }
    setBusy(true);
    const payload = { companyId, date: v.date, [K.party]: v.party.trim(), party: v.party.trim(), billRef: v.billRef, noteType: v.noteType, reason: v.reason, narration: v.narration.trim(), status, items,
      linkedBillId: bill ? bill.billId : (v.billId || ''), subTotal: sub, totalGST: gst, grandTotal: total };
    try {
      if (edit) { await axios.put(`/api/accounts/${K.api}/${edit[K.id]}`, payload, { params: { companyId } }); onSaved(`Updated ${K.title.toLowerCase()} ${edit[K.no]}.`); }
      else { const r = await axios.post(`/api/accounts/${K.api}`, payload, { params: { companyId } }); onSaved(`Saved ${K.title.toLowerCase()} ${r.data?.[K.no] || ''}${status === 'approved' ? ' (approved)' : ' as draft'}.`); }
    } catch (e) { setMsg({ k: 'err', t: e.response?.data?.error || `Could not save the ${K.title.toLowerCase()}.` }); }
    finally { setBusy(false); }
  };
  return (
    <div className="sf">
      <div className="sf-hero"><span className="ic"><Svg name="swap" size={15} /></span><h1>{edit ? `Edit ${K.title} ${edit[K.no]}` : `Add ${K.title}`}</h1><span className="grow" /></div>
      <div className="ac-seg" style={{ marginTop: 10, border: '1px solid #DCE6E8' }} role="group" aria-label="Kind">
        {[['goods-return', `Goods return — ${K.bills === 'purchase' ? 'returned to the vendor' : 'returned by the client'}`], ['discount', 'Discount / price correction']].map(([k, l]) => (
          <button key={k} type="button" className={v.noteType === k ? 'on' : ''} aria-pressed={v.noteType === k} onClick={() => switchType(k)}>{l}</button>))}
      </div>
      <div className="sf-2" style={{ marginTop: 10 }}>
        <div className="sf-card"><div className="sf-ch"><span className="ico"><Svg name="user" size={13} /></span><b>{K.partyLabel} &amp; bill</b></div>
          <table className="sf-kv"><tbody>
            <tr><th>{K.partyLabel} <i>*</i></th><td><Picker value={v.party} groups={partyGroups} placeholder={`Type ${K.partyLabel.toLowerCase()} name…`} ariaLabel={K.partyLabel} autoFocus={!edit}
              onPick={o => { setV(x => ({ ...x, party: o.label, billId: '', billRef: '' })); if (v.noteType === 'goods-return') setLines([blank()]); setMsg(null); }} /></td></tr>
            <tr><th>Against bill</th><td><select value={v.billId} onChange={e => pickBill(e.target.value)} disabled={!v.party}>
              <option value="">{!v.party ? `Pick the ${K.partyLabel.toLowerCase()} first` : partyBills.length ? '— choose the bill —' : 'No bill for this party'}</option>
              {e0.linkedBillId && !partyBills.some(b => String(b.billId) === String(e0.linkedBillId)) && <option value={String(e0.linkedBillId)}>{e0.billRef}</option>}
              {partyBills.map(b => <option key={b.billId} value={String(b.billId)}>{b.billNo || b.vendorBillNo || b.billId} · {dmy(b.billDate)} · ₹ {amt(b.grandTotal)}</option>)}
            </select>{v.noteType === 'goods-return' && <div style={{ fontSize: 11, color: '#667085', marginTop: 3 }}>The bill's items fill in below — enter the qty returned.</div>}</td></tr>
            <tr><th>Bill ref</th><td><input value={v.billRef} onChange={set('billRef')} placeholder="Bill no. (filled from the bill)" /></td></tr>
          </tbody></table></div>
        <div className="sf-card"><div className="sf-ch"><span className="ico"><Svg name="file" size={13} /></span><b>{K.title}</b></div>
          <table className="sf-kv"><tbody>
            <tr><th>Date <i>*</i></th><td><input type="date" value={v.date} onChange={set('date')} /></td></tr>
            <tr><th>Reason <i>*</i></th><td><select value={v.reason} onChange={set('reason')}><option value="">Choose…</option>{[...new Set([...reasons, ...(v.reason ? [v.reason] : [])])].map(r => <option key={r}>{r}</option>)}</select></td></tr>
            <tr><th>Narration</th><td><textarea className="ac-ta" value={v.narration} onChange={set('narration')} placeholder="Optional — printed on the note" /></td></tr>
          </tbody></table></div>
      </div>
      {v.noteType === 'goods-return' ? (
        <div className="sf-card"><div className="sf-ch"><span className="ico"><Svg name="box" size={13} /></span><b>Items returned</b><span className="grow" />
          <button type="button" className="sf-lnk" onClick={() => setLines(ls => [...ls, blank()])}>+ Add line</button></div>
          <table className="ac-lines"><thead><tr><th>Description</th><th className="r" style={{ width: 100 }}>Qty</th><th style={{ width: 80 }}>Unit</th><th className="r" style={{ width: 120 }}>Rate ₹</th><th style={{ width: 80 }}>GST %</th><th className="r" style={{ width: 120 }}>Amount ₹</th><th style={{ width: 34 }} /></tr></thead>
            <tbody>{lines.map((l, i) => { const t = (Number(l.qty) || 0) * (Number(l.rate) || 0); return (
              <tr key={l.k}><td><input value={l.productName} onChange={e => setLine(l.k, 'productName', e.target.value)} aria-label={`Item ${i + 1}`} /></td>
                <td><input className="num" inputMode="decimal" value={l.qty} onChange={e => setLine(l.k, 'qty', e.target.value.replace(/[^\d.]/g, ''))} placeholder={l.max ? `max ${l.max}` : ''} aria-label="Qty" /></td>
                <td><input value={l.unit} onChange={e => setLine(l.k, 'unit', e.target.value)} aria-label="Unit" /></td>
                <td><input className="num" inputMode="decimal" value={l.rate} onChange={e => setLine(l.k, 'rate', e.target.value.replace(/[^\d.]/g, ''))} aria-label="Rate" /></td>
                <td><select value={l.gstPercent} onChange={e => setLine(l.k, 'gstPercent', e.target.value)} aria-label="GST">{[...new Set([...GST_RATES, l.gstPercent])].map(g => <option key={g} value={g}>{g}%</option>)}</select></td>
                <td className="r">{amt(t * (1 + (Number(l.gstPercent) || 0) / 100))}</td>
                <td><button type="button" className="ac-x" disabled={lines.length <= 1} onClick={() => setLines(ls => ls.filter(x => x.k !== l.k))} aria-label="Remove line">×</button></td></tr>); })}</tbody>
          </table></div>
      ) : (
        <div className="sf-card" style={{ maxWidth: 620 }}><div className="sf-ch"><span className="ico"><Svg name="wallet" size={13} /></span><b>Discount</b></div>
          <table className="sf-kv"><tbody>
            <tr><th>Amount ₹ <i>*</i></th><td><input className="num" inputMode="decimal" value={v.discAmt} onChange={e => setV(o => ({ ...o, discAmt: e.target.value.replace(/[^\d.]/g, '') }))} placeholder="Before GST" /></td></tr>
            <tr><th>GST %</th><td><select value={v.discGst} onChange={set('discGst')}>{GST_RATES.map(g => <option key={g} value={g}>{g}%</option>)}</select></td></tr>
          </tbody></table></div>
      )}
      {msg && <div className={`sf-msg ${msg.k}`} role="status">{msg.t}</div>}
      <div className="sf-bar">
        <div className="info">Taxable ₹ {amt(sub)} · GST ₹ {amt(gst)} · <b>Total ₹ {amt(total)}</b>{bill ? ` · bill ₹ ${amt(bill.grandTotal)}` : ''}</div>
        <button type="button" className="sf-b ghost" onClick={onCancel} disabled={busy}>Cancel</button>
        <button type="button" className="sf-b ghost" onClick={() => save('draft')} disabled={busy}>{edit ? 'Update draft' : 'Save draft'}</button>
        <button type="button" className="sf-b pri" onClick={() => save('approved')} disabled={busy}>{busy ? 'Saving…' : 'Save & approve'}</button>
      </div>
    </div>
  );
}
