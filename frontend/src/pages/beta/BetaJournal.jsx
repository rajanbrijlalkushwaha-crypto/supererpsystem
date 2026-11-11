/* Beta — Journal (Account → Journal), /api/accounts/journals — the same records as the classic Journal page.
 * Form: date, type (Office / Manufacturing / Order — an order journal is linked to a SO or PO), ref no, narration,
 * Dr / Cr lines over clients, vendors and ledger accounts (must balance), documents. Draft or Post.
 * List: search + status, Print list, Print voucher, Post a draft, Edit, Delete. */
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
import { ACC_CSS, amt, r2, today, words, hit, Pill, Picker, AttachBox, uploadAttach, loadLedgerGroups } from './BetaAccKit';

const TYPES = [['office', 'Office'], ['manufacturing', 'Manufacturing'], ['order', 'Order']];
const typeLabel = t => (TYPES.find(x => x[0] === t) || TYPES[0])[1];
let rid = 1;
const newRow = () => ({ k: rid++, ledger: '', dr: '', cr: '' });
const num = v => String(v).replace(/[^\d.]/g, '');

export default function BetaJournal() {
  const navigate = useNavigate();
  const { search } = useLocation();
  const tab = new URLSearchParams(search).get('tab') === 'create' ? 'create' : 'list';
  const { selectedCompany } = useCompany() || {};
  const { user } = useAuth() || {};
  const companyId = selectedCompany?.companyId;
  const [rows, setRows] = useState(null);
  const [reload, setReload] = useState(0);
  const [editing, setEditing] = useState(null);
  const [note, setNote] = useState(null);
  const [slot, setSlot] = useState(null);
  const canAdd = can(user, 'accJournal', 'create');
  useEffect(() => {
    if (!companyId) return;
    axios.get('/api/accounts/journals', { params: { companyId } }).then(r => setRows(Array.isArray(r.data) ? r.data : [])).catch(() => setRows([]));
  }, [companyId, reload]);
  const cur = editing ? 'create' : (tab === 'create' && canAdd ? 'create' : 'list');
  const go = k => { setEditing(null); navigate(`/beta/account/journal?tab=${k}`); };
  return (
    <div className="sb">
      <style>{SALES_CSS + PX_CSS + ACC_CSS}</style>
      <div className="sb-tabs" role="tablist">
        {[['list', 'Journals'], ...(canAdd || editing ? [['create', editing ? `Edit Journal #${editing.journalId}` : 'Add Journal']] : [])].map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={cur === k} className={`sb-tab${cur === k ? ' on' : ''}`} onClick={() => go(k)}>{l}{k === 'list' && rows && <span className="n">{rows.length}</span>}</button>
        ))}
        <div className="sb-slot" ref={setSlot} />
      </div>
      {note && <div className="sb-note" role="status">{note}<button type="button" onClick={() => setNote(null)} aria-label="Dismiss">×</button></div>}
      {cur === 'create'
        ? <div className="sb-body"><JournalForm key={editing ? editing.journalId : 'new'} companyId={companyId} edit={editing} onCancel={() => go('list')} onSaved={t => { setReload(x => x + 1); setNote(t); go('list'); }} /></div>
        : <JournalList rows={rows} company={selectedCompany} user={user} slot={slot} companyId={companyId} onEdit={j => { setNote(null); setEditing(j); }} onChanged={t => { setReload(x => x + 1); setNote(t); }} />}
    </div>
  );
}

const voucherOf = (j, company, user) => printVoucher({
  title: 'JOURNAL VOUCHER', sub: `${typeLabel(j.type)} journal`, company, user,
  kv: [['Journal No.', `#${j.journalId}`], ['Date', dmy(j.date)], ['Ref. No.', j.refNo], ['Order', j.orderNo ? `${j.orderLinkType || ''} ${j.orderNo}`.trim() : ''], ['Status', String(j.status || 'draft').toUpperCase()]],
  heads: [['Sl', '30px', 'c'], ['Particulars (Ledger)'], ['Debit ₹', '120px', 'r'], ['Credit ₹', '120px', 'r']],
  rows: (j.entries || []).map((e, i) => [String(i + 1), e.ledger, e.debit ? amt(e.debit) : '', e.credit ? amt(e.credit) : '']),
  totals: [['Total Debit', amt(j.totalDebit)], ['Total Credit', amt(j.totalCredit)]],
  words: inWords(Number(j.totalDebit) || 0), narration: j.narration, signs: ['Checked by (Accounts)', `For ${company?.companyName || ''}`],
});

function JournalList({ rows, company, user, slot, companyId, onEdit, onChanged }) {
  const [q, setQ] = useState('');
  const [st, setSt] = useState('');
  const [selId, setSelId] = useState(null);
  const [ask, setAsk] = useState(null);
  const [busy, setBusy] = useState(false);
  useClearSel(ask ? null : selId, setSelId, '.sb-t tbody tr, .sb-tools, .sb-ask, .cpv-ov');
  const w = words(q);
  const list = useMemo(() => (rows || []).filter(j => (!st || (j.status || 'draft') === st)
    && hit(`${j.journalId} ${j.narration} ${j.refNo} ${j.orderNo} ${typeLabel(j.type)} ${(j.entries || []).map(e => e.ledger).join(' ')}`, w))
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) || b.journalId - a.journalId), [rows, st, w.join(' ')]);   // eslint-disable-line react-hooks/exhaustive-deps
  const sel = list.find(j => j.journalId === selId) || null;
  const canEdit = can(user, 'accJournal', 'edit'), canDel = can(user, 'accJournal', 'delete');
  const all = rows || [];
  const act = async (j, what) => {
    setBusy(true);
    try {
      if (what === 'delete') await axios.delete(`/api/accounts/journals/${j.journalId}`, { params: { companyId } });
      else await axios.put(`/api/accounts/journals/${j.journalId}`, { status: 'posted' }, { params: { companyId } });
      setAsk(null); setSelId(null); onChanged(`${what === 'delete' ? 'Deleted' : 'Posted'} journal #${j.journalId}.`);
    } catch (e) { onChanged(e.response?.data?.error || 'Could not do that.'); } finally { setBusy(false); }
  };
  return (
    <>
      {slot && createPortal(<>
        <input className="sb-search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search no, narration, ledger, order…" aria-label="Search journals" />
        <select className="sb-search" style={{ width: 130 }} value={st} onChange={e => setSt(e.target.value)} aria-label="Status"><option value="">All</option><option value="draft">Draft</option><option value="posted">Posted</option><option value="pending">Pending</option></select>
        <button type="button" className="sb-tbtn" onClick={() => printDepList({ title: 'JOURNAL LIST', company, user, filter: st || 'All', total: list.reduce((t, j) => t + (Number(j.totalDebit) || 0), 0),
          heads: ['Journal No.', 'Date', 'Type', 'Narration', 'Debit Ledgers', 'Credit Ledgers', 'Ref No.', 'Order', 'Amount ₹', 'Status'],
          rows: list.map(j => [`#${j.journalId}`, dmy(j.date), typeLabel(j.type), j.narration, (j.entries || []).filter(e => e.debit).map(e => e.ledger).join(', '), (j.entries || []).filter(e => e.credit).map(e => e.ledger).join(', '), j.refNo, j.orderNo, amt(j.totalDebit), j.status || 'draft']) })}><Svg name="file" size={13} />Print list</button>
        <div className="sb-tools">
          <span className="sb-picked">{sel ? <b>#{sel.journalId}</b> : 'Select a journal'}</span>
          <button type="button" className="sb-tbtn" disabled={!sel} onClick={() => voucherOf(sel, company, user)}><Svg name="file" size={13} />Print</button>
          {canEdit && <button type="button" className="sb-tbtn" disabled={!sel || sel.status === 'posted'} onClick={() => act(sel, 'post')} title="Post a draft journal"><Svg name="check" size={13} />Post</button>}
          {canEdit && <button type="button" className="sb-tbtn" disabled={!sel} onClick={() => onEdit(sel)}><Svg name="settings" size={13} />Edit</button>}
          {canDel && <button type="button" className="sb-tbtn del" disabled={!sel} onClick={() => setAsk(sel)}><Svg name="x" size={13} />Delete</button>}
        </div>
      </>, slot)}
      {ask && <div className="sb-ask" role="alertdialog" aria-label="Confirm delete"><span><b>Delete journal #{ask.journalId}</b> ({ask.narration})? The ledger entries go too.</span>
        <button type="button" className="sb-abtn" onClick={() => setAsk(null)} disabled={busy}>Keep</button><button type="button" className="sb-abtn danger" onClick={() => act(ask, 'delete')} disabled={busy}>{busy ? 'Deleting…' : 'Yes, delete'}</button></div>}
      <div className="ac-sum">
        <div>Journals<b>{all.length}</b></div>
        <div>Posted<b style={{ color: '#067647' }}>{all.filter(j => j.status === 'posted').length}</b></div>
        <div>Draft<b>{all.filter(j => (j.status || 'draft') === 'draft').length}</b></div>
        <div>Total posted ₹<b>{amt(all.filter(j => j.status === 'posted').reduce((t, j) => t + (Number(j.totalDebit) || 0), 0))}</b></div>
      </div>
      <div className="sb-list">
        <table className="sb-t px acx">
          <colgroup>{[3, 8, 7, 8, 22, 15, 15, 8, 8, 6].map((x, i) => <col key={i} style={{ width: `${x}%` }} />)}</colgroup>
          <thead><tr><th className="r">Sr</th><th>Journal No.</th><th>Date</th><th>Type</th><th>Narration</th><th>Debit</th><th>Credit</th><th>Ref / Order</th><th className="r">Amount ₹</th><th>Status</th></tr></thead>
          <tbody>
            {rows === null ? <tr><td colSpan={10} className="sb-empty">Loading…</td></tr>
              : !list.length ? <tr><td colSpan={10} className="sb-empty">{q || st ? 'Nothing matches.' : 'No journal yet — click “Add Journal”.'}</td></tr>
                : list.map((j, i) => (
                  <tr key={j.journalId} className={selId === j.journalId ? 'sel' : ''} onClick={() => setSelId(j.journalId)} onDoubleClick={() => canEdit && onEdit(j)} style={{ cursor: 'pointer' }}>
                    <td className="r">{i + 1}</td>
                    <td><b className="mono">#{j.journalId}</b>{(j.attachments || []).length > 0 && <span className="sm">{j.attachments.length} file{j.attachments.length === 1 ? '' : 's'}</span>}</td>
                    <td className="d">{dmy(j.date)}</td>
                    <td>{typeLabel(j.type)}</td>
                    <td>{j.narration}</td>
                    <td>{(j.entries || []).filter(e => e.debit).map(e => <span key={e.ledger} className="sm" style={{ color: '#101828' }}>{e.ledger} <b>{amt(e.debit)}</b></span>)}</td>
                    <td>{(j.entries || []).filter(e => e.credit).map(e => <span key={e.ledger} className="sm" style={{ color: '#101828' }}>{e.ledger} <b>{amt(e.credit)}</b></span>)}</td>
                    <td>{j.refNo || ''}{j.orderNo && <span className="sm">{j.orderLinkType} {j.orderNo}</span>}</td>
                    <td className="r b d">{amt(j.totalDebit)}</td>
                    <td><Pill s={j.status || 'draft'} /></td>
                  </tr>
                ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function JournalForm({ companyId, edit, onSaved, onCancel }) {
  const e0 = edit || {};
  const [v, setV] = useState(() => ({ date: e0.date || today(), type: e0.type || 'office', refNo: e0.refNo || '', narration: e0.narration || '',
    orderKey: e0.orderId ? `${e0.orderLinkType || 'PO'}:${e0.orderId}` : '' }));
  const [lines, setLines] = useState(() => ((e0.entries || []).length >= 2 ? e0.entries.map(e => ({ k: rid++, ledger: e.ledger, dr: e.debit ? String(e.debit) : '', cr: e.credit ? String(e.credit) : '' })) : [newRow(), newRow(), newRow()]));
  const [groups, setGroups] = useState([]);
  const [orders, setOrders] = useState({ so: [], po: [] });
  const [files, setFiles] = useState([]);
  const [atts, setAtts] = useState(e0.attachments || []);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  useEffect(() => { if (companyId) loadLedgerGroups(companyId).then(r => setGroups(r.groups)); }, [companyId]);
  useEffect(() => {
    if (!companyId || v.type !== 'order' || orders.so.length || orders.po.length) return;
    Promise.all([axios.get('/api/sales-orders', { params: { companyId } }).catch(() => ({ data: [] })), axios.get('/api/purchase-orders', { params: { companyId } }).catch(() => ({ data: [] }))])
      .then(([s, p]) => setOrders({ so: Array.isArray(s.data) ? s.data : [], po: Array.isArray(p.data) ? p.data : [] }));
  }, [companyId, v.type, orders.so.length, orders.po.length]);
  const set = k => e => { const x = e.target.value; setV(o => ({ ...o, [k]: x })); setMsg(null); };
  const setLine = (k, f, x) => setLines(ls => ls.map(l => (l.k !== k ? l : f === 'dr' ? { ...l, dr: x, cr: x ? '' : l.cr } : f === 'cr' ? { ...l, cr: x, dr: x ? '' : l.dr } : { ...l, [f]: x })));
  const dr = r2(lines.reduce((t, l) => t + (Number(l.dr) || 0), 0)), cr = r2(lines.reduce((t, l) => t + (Number(l.cr) || 0), 0));
  const diff = r2(dr - cr), balanced = Math.abs(diff) < 0.01 && dr > 0;
  const orderGroups = useMemo(() => [
    { group: 'Purchase Orders', items: orders.po.map(o => ({ key: `PO:${o.orderId}`, label: o.poNo || o.poNumber || `PO ${o.orderId}`, sub: o.vendorName || '', no: o.poNo || o.poNumber || String(o.orderId) })) },
    { group: 'Sales Orders', items: orders.so.map(o => ({ key: `SO:${o.orderId}`, label: String(o.orderNo || '').trim() || `SO ${o.orderId}`, sub: o.customerName || '', no: String(o.orderNo || '').trim() || String(o.orderId) })) },
  ].filter(g => g.items.length), [orders]);
  const order = orderGroups.flatMap(g => g.items).find(o => o.key === v.orderKey) || (v.orderKey && e0.orderId ? { key: v.orderKey, label: e0.orderNo, no: e0.orderNo } : null);

  const save = async status => {
    if (!v.date || !v.narration.trim()) return setMsg({ k: 'err', t: 'Enter the date and the narration.' });
    if (v.type === 'order' && !order) return setMsg({ k: 'err', t: 'Link the sales order or purchase order for an Order journal.' });
    const filled = lines.filter(l => l.ledger.trim() && (Number(l.dr) || 0) + (Number(l.cr) || 0) > 0);
    if (filled.length < 2) return setMsg({ k: 'err', t: 'Fill at least 2 lines (a ledger with a debit or credit amount).' });
    if (lines.some(l => !l.ledger.trim() && (Number(l.dr) || Number(l.cr)))) return setMsg({ k: 'err', t: 'A line has an amount but no ledger.' });
    if (!balanced) return setMsg({ k: 'err', t: `Debit and credit do not match — difference ₹ ${amt(Math.abs(diff))}.` });
    setBusy(true);
    const [lt, oid] = order ? order.key.split(':') : ['', ''];
    const payload = { companyId, date: v.date, narration: v.narration.trim(), refNo: v.refNo.trim(), type: v.type, status,
      entries: filled.map(l => ({ ledger: l.ledger.trim(), debit: Number(l.dr) || 0, credit: Number(l.cr) || 0 })), totalDebit: dr, totalCredit: cr,
      ...(v.type === 'order' ? { orderId: oid, orderNo: order.no, orderLinkType: lt } : { orderId: '', orderNo: '', orderLinkType: '' }) };
    try {
      const r = edit ? await axios.put(`/api/accounts/journals/${edit.journalId}`, payload, { params: { companyId } }) : await axios.post('/api/accounts/journals', payload, { params: { companyId } });
      const id = edit ? edit.journalId : r.data.journalId;
      const up = await uploadAttach('journal', id, files, companyId);
      onSaved(`Journal #${id} ${edit ? 'updated' : status === 'posted' ? 'posted' : 'saved as draft'}.${up}`);
    } catch (e) { setMsg({ k: 'err', t: e.response?.data?.error || 'Could not save the journal.' }); }
    finally { setBusy(false); }
  };
  return (
    <div className="sf">
      <div className="sf-hero"><span className="ic"><Svg name="ledger" size={15} /></span><h1>{edit ? `Edit Journal #${edit.journalId}` : 'Add Journal'}</h1><span className="grow" /></div>
      <div className="sf-2" style={{ marginTop: 10 }}>
        <div className="sf-card"><div className="sf-ch"><span className="ico"><Svg name="file" size={13} /></span><b>Journal</b></div>
          <table className="sf-kv"><tbody>
            <tr><th>Date <i>*</i></th><td><input type="date" value={v.date} onChange={set('date')} /></td></tr>
            <tr><th>Type</th><td><select value={v.type} onChange={set('type')}>{TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></td></tr>
            {v.type === 'order' && <tr><th>Order <i>*</i></th><td><Picker value={order ? order.label : ''} groups={orderGroups} placeholder="Type PO / SO no. or party…" ariaLabel="Order" onPick={o => { setV(x => ({ ...x, orderKey: o.key })); setMsg(null); }} /></td></tr>}
            <tr><th>Ref. No.</th><td><input value={v.refNo} onChange={set('refNo')} placeholder="Optional" /></td></tr>
          </tbody></table></div>
        <div className="sf-card"><div className="sf-ch"><span className="ico"><Svg name="info" size={13} /></span><b>Narration <i style={{ color: '#fff' }}>*</i></b></div>
          <div style={{ padding: 8 }}><textarea className="ac-ta" style={{ minHeight: 96 }} value={v.narration} onChange={set('narration')} placeholder="e.g. Being TDS deducted on contractor bill…" autoFocus={!edit} /></div></div>
      </div>
      <div className="sf-card">
        <div className="sf-ch"><span className="ico"><Svg name="swap" size={13} /></span><b>Entries</b><span className="grow" />
          <span className="ac-bal" style={{ background: balanced ? '#ECFDF3' : '#FEF3F2', color: balanced ? '#067647' : '#B42318' }}>{balanced ? '✓ Balanced' : dr || cr ? `Difference ₹ ${amt(Math.abs(diff))}` : 'Not balanced'}</span>
          <button type="button" className="sf-lnk" style={{ marginLeft: 8 }} onClick={() => setLines(ls => [...ls, newRow()])}>+ Add line</button></div>
        <table className="ac-lines"><thead><tr><th style={{ width: 34 }}>#</th><th>Ledger (client / vendor / account)</th><th className="r" style={{ width: 150 }}>Debit ₹</th><th className="r" style={{ width: 150 }}>Credit ₹</th><th style={{ width: 34 }} /></tr></thead>
          <tbody>{lines.map((l, i) => (
            <tr key={l.k}><td style={{ textAlign: 'center', color: '#667085' }}>{i + 1}</td>
              <td><Picker value={l.ledger} groups={groups} placeholder="Type to search ledger…" ariaLabel={`Ledger ${i + 1}`} onPick={o => setLine(l.k, 'ledger', o.label)} /></td>
              <td><input className="num" inputMode="decimal" value={l.dr} onChange={e => setLine(l.k, 'dr', num(e.target.value))} aria-label={`Debit ${i + 1}`} /></td>
              <td><input className="num" inputMode="decimal" value={l.cr} onChange={e => setLine(l.k, 'cr', num(e.target.value))} aria-label={`Credit ${i + 1}`} /></td>
              <td><button type="button" className="ac-x" disabled={lines.length <= 2} onClick={() => setLines(ls => ls.filter(x => x.k !== l.k))} aria-label="Remove line">×</button></td></tr>
          ))}</tbody>
          <tfoot><tr><td /><td style={{ textAlign: 'right' }}>Total</td><td className="r">{amt(dr)}</td><td className="r">{amt(cr)}</td><td /></tr></tfoot>
        </table>
      </div>
      <AttachBox entity="journal" rec={edit ? { ...edit, attachments: atts } : null} idKey="journalId" companyId={companyId} files={files} setFiles={setFiles} onRemoved={setAtts} />
      {msg && <div className={`sf-msg ${msg.k}`} role="status">{msg.t}</div>}
      <div className="sf-bar">
        <div className="info">{typeLabel(v.type)} journal · Dr ₹ {amt(dr)} · Cr ₹ {amt(cr)}</div>
        <button type="button" className="sf-b ghost" onClick={onCancel} disabled={busy}>Cancel</button>
        <button type="button" className="sf-b ghost" onClick={() => save(edit ? (e0.status || 'draft') : 'draft')} disabled={busy}>{edit ? 'Update' : 'Save draft'}</button>
        <button type="button" className="sf-b pri" onClick={() => save('posted')} disabled={busy || !balanced}>{busy ? 'Saving…' : 'Post journal'}</button>
      </div>
    </div>
  );
}
