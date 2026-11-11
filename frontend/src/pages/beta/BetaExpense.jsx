/* Beta — Expense entry (Account → Expense), /api/accounts/expenses — the same records as the classic Expense page.
 * Three kinds, as on the classic page: Office (no order), Manufacturing (vendor required, order optional) and
 * Order (against a sales order, "Expense by" ledger required — goes for approval). Amount + GST → total, bill no,
 * documents. List: kind switch, search + status, Print list, Print voucher, Approve, Edit, Delete. */
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

const GST_RATES = ['0', '5', '12', '18', '28'];
const KINDS = {
  office: { label: 'Office', note: 'Admin, rent, utilities, travel — no order link',
    cats: ['Rent', 'Utilities', 'Internet / Telephone', 'Office Supplies', 'Travel & Conveyance', 'Printing & Stationery', 'Meals & Entertainment', 'Salaries & Wages', 'Insurance', 'Maintenance & Repairs', 'Advertisement', 'Professional Fees', 'Miscellaneous'] },
  manufacturing: { label: 'Manufacturing', note: 'Production costs — vendor required, order optional',
    cats: ['Raw Material Handling', 'Labour', 'Machine Maintenance', 'Fuel & Power', 'Quality Control', 'Tooling & Consumables', 'Transport', 'Subcontracting', 'Factory Overheads', 'Testing', 'Miscellaneous'] },
  order: { label: 'Order', note: 'Against a sales order — goes for approval',
    cats: ['Site Visit', 'Installation', 'Labour', 'Transport & Freight', 'Packaging', 'Testing & Commissioning', 'Documentation', 'Tools & Consumables', 'Freight & Courier', 'Sub-Contractor', 'Miscellaneous'] },
};
const kindOf = e => KINDS[e.expenseType] ? e.expenseType : 'office';
const partyOf = e => (e.expenseType === 'order' ? e.ledgerName : e.expenseType === 'manufacturing' ? e.vendorName : e.vendor) || '';
const isPending = e => e.status === 'pending' || e.status === 'pending_approval';

export default function BetaExpense() {
  const navigate = useNavigate();
  const { search } = useLocation();
  const tab = new URLSearchParams(search).get('tab') === 'create' ? 'create' : 'list';
  const { selectedCompany } = useCompany() || {};
  const { user } = useAuth() || {};
  const companyId = selectedCompany?.companyId;
  const [rows, setRows] = useState(null);
  const [orders, setOrders] = useState([]);
  const [reload, setReload] = useState(0);
  const [editing, setEditing] = useState(null);
  const [note, setNote] = useState(null);
  const [slot, setSlot] = useState(null);
  const canAdd = can(user, 'accExpense', 'create');
  useEffect(() => {
    if (!companyId) return;
    axios.get('/api/accounts/expenses', { params: { companyId } }).then(r => setRows(Array.isArray(r.data) ? r.data.filter(e => e.status !== 'deleted') : [])).catch(() => setRows([]));
  }, [companyId, reload]);
  useEffect(() => {
    if (!companyId) return;
    axios.get('/api/sales-orders', { params: { companyId } }).then(r => setOrders(Array.isArray(r.data) ? r.data.filter(o => o.status !== 'cancelled') : [])).catch(() => setOrders([]));
  }, [companyId]);
  const cur = editing ? 'create' : (tab === 'create' && canAdd ? 'create' : 'list');
  const go = k => { setEditing(null); navigate(`/beta/account/expense?tab=${k}`); };
  return (
    <div className="sb">
      <style>{SALES_CSS + PX_CSS + ACC_CSS}</style>
      <div className="sb-tabs" role="tablist">
        {[['list', 'Expenses'], ...(canAdd || editing ? [['create', editing ? `Edit EXP-${editing.expenseId}` : 'Add Expense']] : [])].map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={cur === k} className={`sb-tab${cur === k ? ' on' : ''}`} onClick={() => go(k)}>{l}{k === 'list' && rows && <span className="n">{rows.length}</span>}</button>
        ))}
        <div className="sb-slot" ref={setSlot} />
      </div>
      {note && <div className="sb-note" role="status">{note}<button type="button" onClick={() => setNote(null)} aria-label="Dismiss">×</button></div>}
      {cur === 'create'
        ? <div className="sb-body"><ExpenseForm key={editing ? editing.expenseId : 'new'} companyId={companyId} edit={editing} orders={orders} onCancel={() => go('list')} onSaved={t => { setReload(x => x + 1); setNote(t); go('list'); }} /></div>
        : <ExpenseList rows={rows} company={selectedCompany} user={user} slot={slot} companyId={companyId} onEdit={e => { setNote(null); setEditing(e); }} onChanged={t => { setReload(x => x + 1); setNote(t); }} />}
    </div>
  );
}

const printExp = (e, company, user) => printVoucher({
  title: 'EXPENSE VOUCHER', sub: `${KINDS[kindOf(e)].label} expense — ${e.expenseCategory || e.category || ''}`, company, user,
  kv: [['Expense No.', `EXP-${e.expenseId}`], ['Date', dmy(e.date)], ['Bill / Invoice No.', e.invoiceNo], ['Sales Order', e.orderNo], ['Status', String(e.status || '').replace('_', ' ').toUpperCase()]],
  party: partyOf(e) ? { label: e.expenseType === 'order' ? 'Expense by' : 'Paid to', name: partyOf(e), lines: [e.clientName && `Client: ${e.clientName}`] } : null,
  heads: [['Sl', '30px', 'c'], ['Particulars'], ['Category', '160px'], ['Amount ₹', '110px', 'r'], ['GST %', '60px', 'c'], ['Total ₹', '110px', 'r']],
  rows: [['1', e.description || e.expenseCategory || '', e.expenseCategory || e.category || '', amt(e.amount), `${e.taxRate || 0}%`, amt(e.grandTotal || e.amount)]],
  totals: [['Total', amt(e.grandTotal || e.amount)]], words: inWords(Number(e.grandTotal || e.amount) || 0), narration: e.notes,
  signs: ['Received by', `For ${company?.companyName || ''}`],
});

function ExpenseList({ rows, company, user, slot, companyId, onEdit, onChanged }) {
  const [q, setQ] = useState('');
  const [st, setSt] = useState('');
  const [kind, setKind] = useState('');
  const [selId, setSelId] = useState(null);
  const [ask, setAsk] = useState(null);
  const [busy, setBusy] = useState(false);
  useClearSel(ask ? null : selId, setSelId, '.sb-t tbody tr, .sb-tools, .sb-ask, .cpv-ov, .ac-seg');
  const w = words(q);
  const all = rows || [];
  const list = useMemo(() => all.filter(e => (!kind || kindOf(e) === kind) && (!st || (st === 'pending' ? isPending(e) : e.status === st))
    && hit(`EXP-${e.expenseId} ${e.description} ${e.expenseCategory} ${e.category} ${partyOf(e)} ${e.orderNo} ${e.clientName} ${e.invoiceNo} ${e.notes}`, w))
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) || b.expenseId - a.expenseId), [all, kind, st, w.join(' ')]);   // eslint-disable-line react-hooks/exhaustive-deps
  const sel = list.find(e => e.expenseId === selId) || null;
  const canEdit = can(user, 'accExpense', 'edit'), canDel = can(user, 'accExpense', 'delete'), canAppr = can(user, 'accExpense', 'approve');
  const tot = arr => arr.reduce((t, e) => t + (Number(e.grandTotal || e.amount) || 0), 0);
  const act = async (e, what) => {
    setBusy(true);
    try {
      if (what === 'delete') await axios.delete(`/api/accounts/expenses/${e.expenseId}`, { params: { companyId } });
      else await axios.put(`/api/accounts/expenses/${e.expenseId}`, { ...e, status: 'approved', approvedBy: user?.name || user?.username || '', approvedAt: new Date().toISOString() }, { params: { companyId } });
      setAsk(null); setSelId(null); onChanged(`${what === 'delete' ? 'Deleted' : 'Approved'} expense EXP-${e.expenseId}.`);
    } catch (er) { onChanged(er.response?.data?.error || 'Could not do that.'); } finally { setBusy(false); }
  };
  return (
    <>
      {slot && createPortal(<>
        <input className="sb-search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search no, description, party, order, bill…" aria-label="Search expenses" />
        <select className="sb-search" style={{ width: 150 }} value={st} onChange={e => setSt(e.target.value)} aria-label="Status"><option value="">All</option><option value="approved">Approved</option><option value="pending">Pending approval</option><option value="rejected">Rejected</option><option value="draft">Draft</option></select>
        <button type="button" className="sb-tbtn" onClick={() => printDepList({ title: 'EXPENSE LIST', company, user, filter: [kind && KINDS[kind].label, st].filter(Boolean).join(' · ') || 'All', total: tot(list),
          heads: ['Exp No.', 'Date', 'Kind', 'Category', 'Description', 'Paid to / By', 'Order', 'Bill No.', 'Amount ₹', 'GST %', 'Total ₹', 'Status'],
          rows: list.map(e => [`EXP-${e.expenseId}`, dmy(e.date), KINDS[kindOf(e)].label, e.expenseCategory || e.category, e.description, partyOf(e), e.orderNo, e.invoiceNo, amt(e.amount), `${e.taxRate || 0}%`, amt(e.grandTotal || e.amount), String(e.status || '').replace('_', ' ')]) })}><Svg name="file" size={13} />Print list</button>
        <div className="sb-tools">
          <span className="sb-picked">{sel ? <b>EXP-{sel.expenseId}</b> : 'Select an expense'}</span>
          <button type="button" className="sb-tbtn" disabled={!sel} onClick={() => printExp(sel, company, user)}><Svg name="file" size={13} />Print</button>
          {canAppr && <button type="button" className="sb-tbtn" disabled={!sel || !isPending(sel)} onClick={() => act(sel, 'approve')}><Svg name="check" size={13} />Approve</button>}
          {canEdit && <button type="button" className="sb-tbtn" disabled={!sel} onClick={() => onEdit(sel)}><Svg name="settings" size={13} />Edit</button>}
          {canDel && <button type="button" className="sb-tbtn del" disabled={!sel} onClick={() => setAsk(sel)}><Svg name="x" size={13} />Delete</button>}
        </div>
      </>, slot)}
      {ask && <div className="sb-ask" role="alertdialog" aria-label="Confirm delete"><span><b>Delete expense EXP-{ask.expenseId}</b> ({ask.description || ask.expenseCategory}, ₹ {amt(ask.grandTotal || ask.amount)})?</span>
        <button type="button" className="sb-abtn" onClick={() => setAsk(null)} disabled={busy}>Keep</button><button type="button" className="sb-abtn danger" onClick={() => act(ask, 'delete')} disabled={busy}>{busy ? 'Deleting…' : 'Yes, delete'}</button></div>}
      <div className="ac-seg" role="group" aria-label="Kind">
        {[['', 'All'], ...Object.entries(KINDS).map(([k, x]) => [k, x.label])].map(([k, l]) => (
          <button key={k || 'all'} type="button" className={kind === k ? 'on' : ''} aria-pressed={kind === k} onClick={() => setKind(k)}>{l}<span>{k ? all.filter(e => kindOf(e) === k).length : all.length}</span></button>))}
      </div>
      <div className="ac-sum">
        <div>Expenses (shown)<b>{list.length} · ₹ {amt(tot(list))}</b></div>
        <div>Approved<b style={{ color: '#067647' }}>₹ {amt(tot(list.filter(e => e.status === 'approved')))}</b></div>
        <div>Pending approval<b style={{ color: '#B54708' }}>{list.filter(isPending).length} · ₹ {amt(tot(list.filter(isPending)))}</b></div>
      </div>
      <div className="sb-list">
        <table className="sb-t px acx">
          <colgroup>{[3, 8, 7, 8, 11, 17, 13, 9, 7, 8, 9].map((x, i) => <col key={i} style={{ width: `${x}%` }} />)}</colgroup>
          <thead><tr><th className="r">Sr</th><th>Exp No.</th><th>Date</th><th>Kind</th><th>Category</th><th>Description</th><th>Paid to / By</th><th>Order</th><th>Bill No.</th><th className="r">Total ₹</th><th>Status</th></tr></thead>
          <tbody>
            {rows === null ? <tr><td colSpan={11} className="sb-empty">Loading…</td></tr>
              : !list.length ? <tr><td colSpan={11} className="sb-empty">{q || st || kind ? 'Nothing matches.' : 'No expense yet — click “Add Expense”.'}</td></tr>
                : list.map((e, i) => (
                  <tr key={e.expenseId} className={selId === e.expenseId ? 'sel' : ''} onClick={() => setSelId(e.expenseId)} onDoubleClick={() => canEdit && onEdit(e)} style={{ cursor: 'pointer' }}>
                    <td className="r">{i + 1}</td>
                    <td><b className="mono">EXP-{e.expenseId}</b>{(e.attachments || []).length > 0 && <span className="sm">{e.attachments.length} file{e.attachments.length === 1 ? '' : 's'}</span>}</td>
                    <td className="d">{dmy(e.date)}</td><td>{KINDS[kindOf(e)].label}</td><td>{e.expenseCategory || e.category}</td>
                    <td>{e.description || '—'}{e.notes && <span className="sm">{e.notes}</span>}</td>
                    <td>{partyOf(e) || '—'}</td>
                    <td className="mono">{e.orderNo || '—'}{e.clientName && <span className="sm">{e.clientName}</span>}</td>
                    <td className="mono">{e.invoiceNo || '—'}</td>
                    <td className="r b d">{amt(e.grandTotal || e.amount)}{Number(e.taxRate) > 0 && <span className="sm">incl. {e.taxRate}% GST</span>}</td>
                    <td><Pill s={e.status} /></td>
                  </tr>
                ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function ExpenseForm({ companyId, edit, orders, onSaved, onCancel }) {
  const e0 = edit || {};
  const [v, setV] = useState(() => ({ kind: edit ? kindOf(e0) : 'office', date: e0.date || today(), category: e0.expenseCategory || e0.category || '', description: e0.description || '',
    amount: e0.amount ? String(e0.amount) : '', gst: String(e0.taxRate ?? '0'), invoiceNo: e0.invoiceNo || '', notes: e0.notes || '',
    paidTo: e0.vendor || '', vendorId: e0.vendorId ? String(e0.vendorId) : '', vendorName: e0.vendorName || '', soId: e0.soId ? String(e0.soId) : '',
    ledgerId: e0.ledgerId ? String(e0.ledgerId) : '', ledgerName: e0.ledgerName || '' }));
  const [lg, setLg] = useState({ groups: [], vendors: [] });
  const [files, setFiles] = useState([]);
  const [atts, setAtts] = useState(e0.attachments || []);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  useEffect(() => { if (companyId) loadLedgerGroups(companyId).then(setLg); }, [companyId]);
  const set = k => e => { const x = e.target.value; setV(o => ({ ...o, [k]: x })); setMsg(null); };
  const K = KINDS[v.kind];
  const base = Number(v.amount) || 0, gstAmt = r2(base * (Number(v.gst) || 0) / 100), total = r2(base + gstAmt);
  const so = orders.find(o => String(o.orderId) === v.soId) || null;
  const soGroups = useMemo(() => [{ group: 'Sales orders', items: [...orders].sort((a, b) => String(b.orderDate || '').localeCompare(String(a.orderDate || '')))
    .map(o => ({ key: String(o.orderId), label: `${String(o.orderNo || o.orderId).trim()} — ${o.customerName || o.clientName || ''}`, sub: o.customerPO ? `PO ${o.customerPO}` : '' })) }], [orders]);
  const vendorGroups = useMemo(() => [{ group: 'Vendors', items: lg.vendors.map(x => ({ key: String(x.vendorId), label: x.vendorName || x.companyName || '', sub: x.city || '' })).filter(x => x.label) }], [lg.vendors]);
  const soLabel = so ? `${String(so.orderNo || so.orderId).trim()} — ${so.customerName || so.clientName || ''}` : (v.soId && e0.orderNo ? `${e0.orderNo} — ${e0.clientName || ''}` : '');
  const switchKind = k => { setV(o => ({ ...o, kind: k, category: '' })); setMsg(null); };

  const save = async () => {
    if (!v.date) return setMsg({ k: 'err', t: 'Enter the date.' });
    if (!v.category) return setMsg({ k: 'err', t: 'Pick the category.' });
    if (!(base > 0)) return setMsg({ k: 'err', t: 'Enter the amount.' });
    if (v.kind === 'manufacturing' && !v.vendorName.trim()) return setMsg({ k: 'err', t: 'Pick the vendor / party for a manufacturing expense.' });
    if (v.kind === 'order' && !v.soId) return setMsg({ k: 'err', t: 'Pick the sales order.' });
    if (v.kind === 'order' && !v.ledgerName) return setMsg({ k: 'err', t: 'Pick “Expense by” (who spent it — ledger, vendor or client).' });
    setBusy(true);
    const status = v.kind === 'order' ? 'pending_approval' : 'approved';   // as on the classic page (an edited order expense goes for approval again)
    const payload = {
      companyId, expenseType: v.kind, expenseCategory: v.category, category: v.category, date: v.date, description: v.description.trim(), amount: v.amount,
      taxRate: v.gst, grandTotal: total, invoiceNo: v.invoiceNo.trim(), notes: v.notes.trim(), status,
      vendor: v.kind === 'office' ? v.paidTo.trim() : '',
      vendorId: v.kind === 'manufacturing' ? v.vendorId : '', vendorName: v.kind === 'manufacturing' ? v.vendorName.trim() : '',
      soId: v.kind === 'office' ? '' : v.soId, orderNo: v.kind === 'office' ? '' : (so ? String(so.orderNo || '').trim() : (v.soId ? e0.orderNo || '' : '')),
      clientName: v.kind === 'office' ? '' : (so ? so.customerName || so.clientName || '' : (v.soId ? e0.clientName || '' : '')),
      ledgerId: v.kind === 'order' ? v.ledgerId : '', ledgerName: v.kind === 'order' ? v.ledgerName : '',
    };
    try {
      const r = edit ? await axios.put(`/api/accounts/expenses/${edit.expenseId}`, payload, { params: { companyId } }) : await axios.post('/api/accounts/expenses', payload, { params: { companyId } });
      const id = edit ? edit.expenseId : r.data.expenseId;
      const up = await uploadAttach('expense', id, files, companyId);
      onSaved(`Expense EXP-${id} ${edit ? 'updated' : status === 'pending_approval' ? 'saved — sent for approval' : 'saved'}.${up}`);
    } catch (e) { setMsg({ k: 'err', t: e.response?.data?.error || 'Could not save the expense.' }); }
    finally { setBusy(false); }
  };
  return (
    <div className="sf">
      <div className="sf-hero"><span className="ic"><Svg name="wallet" size={15} /></span><h1>{edit ? `Edit expense EXP-${edit.expenseId}` : 'Add Expense'}</h1><span className="grow" /></div>
      <div className="ac-seg" style={{ marginTop: 10, border: '1px solid #DCE6E8' }} role="group" aria-label="Kind">
        {Object.entries(KINDS).map(([k, x]) => <button key={k} type="button" className={v.kind === k ? 'on' : ''} aria-pressed={v.kind === k} onClick={() => switchKind(k)} title={x.note}>{x.label} expense</button>)}
        <span style={{ alignSelf: 'center', fontSize: 12, color: '#667085', marginLeft: 8 }}>{K.note}</span>
      </div>
      <div className="sf-2" style={{ marginTop: 10 }}>
        <div className="sf-card"><div className="sf-ch"><span className="ico"><Svg name="file" size={13} /></span><b>Expense</b></div>
          <table className="sf-kv"><tbody>
            <tr><th>Date <i>*</i></th><td><input type="date" value={v.date} onChange={set('date')} /></td></tr>
            <tr><th>Category <i>*</i></th><td><select value={v.category} onChange={set('category')} autoFocus={!edit}><option value="">Choose…</option>{[...new Set([...K.cats, ...(v.category ? [v.category] : [])])].map(c => <option key={c}>{c}</option>)}</select></td></tr>
            <tr><th>Description</th><td><input value={v.description} onChange={set('description')} placeholder="What was it for" /></td></tr>
            <tr><th>Bill / invoice no.</th><td><input value={v.invoiceNo} onChange={set('invoiceNo')} placeholder="Optional" /></td></tr>
            <tr><th>Notes</th><td><input value={v.notes} onChange={set('notes')} placeholder="Optional" /></td></tr>
          </tbody></table></div>
        <div className="sf-card"><div className="sf-ch"><span className="ico"><Svg name="wallet" size={13} /></span><b>Amount &amp; party</b></div>
          <table className="sf-kv"><tbody>
            <tr><th>Amount ₹ <i>*</i></th><td><input className="num" inputMode="decimal" value={v.amount} onChange={e => setV(o => ({ ...o, amount: e.target.value.replace(/[^\d.]/g, '') }))} placeholder="Before GST" /></td></tr>
            <tr><th>GST %</th><td><select value={v.gst} onChange={set('gst')}>{[...new Set([...GST_RATES, v.gst])].map(g => <option key={g} value={g}>{g}%</option>)}</select>
              <div style={{ fontSize: 11, color: '#667085', marginTop: 3 }}>GST ₹ {amt(gstAmt)} · <b>Total ₹ {amt(total)}</b></div></td></tr>
            {v.kind === 'office' && <tr><th>Paid to</th><td><input value={v.paidTo} onChange={set('paidTo')} placeholder="Shop / person (optional)" /></td></tr>}
            {v.kind === 'manufacturing' && <tr><th>Vendor <i>*</i></th><td><Picker value={v.vendorName} groups={vendorGroups} placeholder="Type vendor name…" ariaLabel="Vendor" onPick={o => setV(x => ({ ...x, vendorId: o.key, vendorName: o.label }))} /></td></tr>}
            {v.kind !== 'office' && <tr><th>Sales order{v.kind === 'order' && <i> *</i>}</th><td><Picker value={soLabel} groups={soGroups} placeholder={v.kind === 'order' ? 'Type order no. or client…' : 'Optional'} ariaLabel="Sales order" onPick={o => setV(x => ({ ...x, soId: o.key }))} />
              {v.kind === 'manufacturing' && v.soId && <button type="button" className="sf-lnk" style={{ marginTop: 4 }} onClick={() => setV(x => ({ ...x, soId: '' }))}>Remove order</button>}</td></tr>}
            {v.kind === 'order' && <tr><th>Expense by <i>*</i></th><td><Picker value={v.ledgerName} groups={lg.groups} placeholder="Ledger, vendor or client who spent it…" ariaLabel="Expense by" onPick={o => setV(x => ({ ...x, ledgerId: String(o.raw?.id || o.raw?.vendorId || o.raw?.clientId || ''), ledgerName: o.label }))} /></td></tr>}
          </tbody></table></div>
      </div>
      <AttachBox entity="expense" rec={edit ? { ...edit, attachments: atts } : null} idKey="expenseId" companyId={companyId} files={files} setFiles={setFiles} onRemoved={setAtts} />
      {msg && <div className={`sf-msg ${msg.k}`} role="status">{msg.t}</div>}
      <div className="sf-bar">
        <div className="info">{K.label} expense · ₹ {amt(base)} + GST ₹ {amt(gstAmt)} = <b>₹ {amt(total)}</b>{v.kind === 'order' ? ' · goes for approval' : ''}</div>
        <button type="button" className="sf-b ghost" onClick={onCancel} disabled={busy}>Cancel</button>
        <button type="button" className="sf-b pri" onClick={save} disabled={busy}>{busy ? 'Saving…' : edit ? 'Update' : 'Save'}</button>
      </div>
    </div>
  );
}
