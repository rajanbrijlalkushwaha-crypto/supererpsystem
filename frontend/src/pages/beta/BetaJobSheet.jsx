/* Beta — Manufacturing → Job Sheet. The same records as the classic Job Sheets (/api/manufacturing/job-sheets).
 * Create: pick the sales order → its products with SO qty / already planned / pending; tick what this job makes and how many;
 * BOM (materials, qty, in stock → short / OK), location, start & due date, specifications, work instructions, drawings.
 * Flow: Draft → Submitted → Approved → In progress (start) → Completed (production entered); Rejected / Cancelled.
 * List: search + status, Print list, Print job sheet (A4 bordered), Approve, Start, Production, Edit, Delete. */
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
import { printDepList, dmy } from './BetaCertPrint';
import { ACC_CSS, today, words, hit, Picker } from './BetaAccKit';
import { printJobSheet } from './BetaMfgPrint';
import { useMfg, rawStock, bomFor, bomNeed } from './BetaMfgLib';

const ST = [['pending', 'Draft', '#F2F4F7', '#475467'], ['submitted', 'Submitted', '#EFF8FF', '#175CD3'], ['approved', 'Approved', '#F0F9FF', '#026AA2'],
  ['in-progress', 'In progress', '#FFFAEB', '#B54708'], ['completed', 'Completed', '#ECFDF3', '#067647'], ['rejected', 'Rejected', '#FEF3F2', '#B42318'], ['cancelled', 'Cancelled', '#F2F4F7', '#98A2B3']];
export const stOf = k => ST.find(s => s[0] === k) || ST[0];
const q = v => { const n = Number(v) || 0; return Number.isInteger(n) ? String(n) : String(Math.round(n * 1000) / 1000); };
const num = v => String(v).replace(/[^\d.]/g, '');
const keyOf = it => String(it.itemCode || it.itemName || '').toLowerCase().trim();
const mfgQty = it => Number(it.mfgQty != null ? it.mfgQty : it.qty) || 0;
const required = js => { const o = js.outputItems || []; return o.length ? o.reduce((t, it) => t + mfgQty(it), 0) : Number(js.qtyRequired) || 0; };
const overdue = js => js.dueDate && js.dueDate < today() && !['completed', 'cancelled', 'rejected'].includes(js.status);
/* the full record as multipart — the server replaces every field on save, so a status change sends everything */
const toFd = (js, companyId, over = {}, files = [], names = []) => {
  const r = { ...js, ...over }, fd = new FormData();
  const put = (k, v) => fd.append(k, v == null ? '' : String(v));
  put('companyId', companyId);
  ['soId', 'soNumber', 'customerName', 'locationId', 'locationName', 'itemName', 'itemCode', 'qtyRequired', 'qtyProduced', 'uom', 'dueDate', 'startDate', 'endDate', 'status', 'notes', 'specifications', 'workInstructions'].forEach(k => put(k, r[k] ?? ''));
  fd.append('bom', JSON.stringify(r.bom || [])); fd.append('outputItems', JSON.stringify(r.outputItems || [])); fd.append('existingAttachments', JSON.stringify(r.attachments || []));
  files.forEach((f, i) => { fd.append('attachmentFiles', f); fd.append('attachmentNames', names[i] || f.name); });
  return fd;
};

export default function BetaJobSheet() {
  const navigate = useNavigate();
  const { search } = useLocation();
  const tab = new URLSearchParams(search).get('tab') === 'create' ? 'create' : 'list';
  const { selectedCompany } = useCompany() || {};
  const { user } = useAuth() || {};
  const companyId = selectedCompany?.companyId;
  const [rows, setRows] = useState(null);
  const [orders, setOrders] = useState([]);
  const [locations, setLocations] = useState([]);
  const [reload, setReload] = useState(0);
  const [editing, setEditing] = useState(null);
  const [note, setNote] = useState(null);
  const [slot, setSlot] = useState(null);
  const canAdd = can(user, 'jobSheets', 'create');
  const mfg = useMfg(companyId, reload);   // BOM master + raw material stock for the form
  useEffect(() => {
    if (!companyId) return;
    axios.get('/api/manufacturing/job-sheets', { params: { companyId } }).then(r => setRows(Array.isArray(r.data) ? r.data : [])).catch(() => setRows([]));
  }, [companyId, reload]);
  useEffect(() => {
    if (!companyId) return;
    axios.get('/api/sales-orders', { params: { companyId } }).then(r => setOrders(Array.isArray(r.data) ? r.data : [])).catch(() => setOrders([]));
    axios.get('/api/manufacturing/locations', { params: { companyId } }).then(r => setLocations(Array.isArray(r.data) ? r.data : [])).catch(() => setLocations([]));
  }, [companyId]);
  if (!can(user, 'jobSheets', 'view')) return <div className="sb"><style>{SALES_CSS}</style><div className="sb-empty" style={{ padding: 30 }}>You are not authorized to see Job Sheets.</div></div>;
  const cur = editing ? 'create' : (tab === 'create' && canAdd ? 'create' : 'list');
  const go = k => { setEditing(null); navigate(`/beta/mfg/job-sheet?tab=${k}`); };
  return (
    <div className="sb">
      <style>{SALES_CSS + PX_CSS + ACC_CSS + '.js-bar { height:6px; background:#EAECF0; border-radius:99px; overflow:hidden; margin-top:3px; } .js-bar i { display:block; height:100%; background:#067647; }'}</style>
      <div className="sb-tabs" role="tablist">
        {[['list', 'Job Sheets'], ...(canAdd || editing ? [['create', editing ? `Edit ${editing.jobNo}` : 'Create Job Sheet']] : [])].map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={cur === k} className={`sb-tab${cur === k ? ' on' : ''}`} onClick={() => go(k)}>{l}{k === 'list' && rows && <span className="n">{rows.length}</span>}</button>
        ))}
        <div className="sb-slot" ref={setSlot} />
      </div>
      {note && <div className="sb-note" role="status">{note}<button type="button" onClick={() => setNote(null)} aria-label="Dismiss">×</button></div>}
      {cur === 'create'
        ? <div className="sb-body"><JobForm key={editing ? editing.id : 'new'} companyId={companyId} edit={editing} orders={orders} locations={locations} jobs={rows || []} mfg={mfg} onCancel={() => go('list')} onSaved={t => { setReload(x => x + 1); setNote(t); go('list'); }} /></div>
        : <JobList rows={rows} company={selectedCompany} user={user} slot={slot} companyId={companyId} onEdit={j => { setNote(null); setEditing(j); }} onChanged={t => { setReload(x => x + 1); setNote(t); }} />}
    </div>
  );
}

function JobList({ rows, company, user, slot, companyId, onEdit, onChanged }) {
  const navigate = useNavigate();
  const [qs, setQ] = useState('');
  const [st, setSt] = useState('open');
  const [selId, setSelId] = useState(null);
  const [ask, setAsk] = useState(null);       // { j, what: 'delete' | 'produce' | 'reject' }
  const [prod, setProd] = useState('');
  const [busy, setBusy] = useState(false);
  useClearSel(ask ? null : selId, setSelId, '.sb-t tbody tr, .sb-tools, .sb-ask, .cpv-ov');
  const w = words(qs);
  const all = rows || [];
  const list = useMemo(() => all.filter(j => (st === 'open' ? !['completed', 'cancelled', 'rejected'].includes(j.status) : st === 'overdue' ? overdue(j) : !st || j.status === st)
    && hit(`${j.jobNo} ${j.soNumber} ${j.customerName} ${j.locationName} ${(j.outputItems || []).map(i => i.itemName).join(' ')} ${j.itemName} ${(j.bom || []).map(b => b.material).join(' ')} ${j.notes}`, w))
    .sort((a, b) => (b.id || 0) - (a.id || 0)), [all, st, w.join(' ')]);   // eslint-disable-line react-hooks/exhaustive-deps
  const sel = list.find(j => j.id === selId) || null;
  const canEdit = can(user, 'jobSheets', 'edit'), canDel = can(user, 'jobSheets', 'delete'), canAppr = can(user, 'mfgOrders', 'edit') || user?.role === 'admin';
  const update = async (j, over, text) => {
    setBusy(true);
    try { await axios.put(`/api/manufacturing/job-sheets/${j.id}`, toFd(j, companyId, over), { params: { companyId } }); setAsk(null); onChanged(text); }
    catch (e) { onChanged(e.response?.data?.error || 'Could not update.'); } finally { setBusy(false); }
  };
  const approve = async j => {
    setBusy(true);
    try { await axios.patch(`/api/manufacturing/job-sheets/${j.id}/approve`, { companyId, approvedBy: user?.name || user?.username || '' }, { params: { companyId } }); onChanged(`Job sheet ${j.jobNo} approved.`); }
    catch (e) { onChanged(e.response?.data?.error || 'Could not approve.'); } finally { setBusy(false); }
  };
  const del = async j => {
    setBusy(true);
    try { await axios.delete(`/api/manufacturing/job-sheets/${j.id}`, { params: { companyId } }); setAsk(null); setSelId(null); onChanged(`Deleted job sheet ${j.jobNo}.`); }
    catch (e) { onChanged(e.response?.data?.error || 'Could not delete.'); } finally { setBusy(false); }
  };
  const produce = j => {
    const done = Number(prod) || 0, need = required(j);
    if (done < 0) return;
    const complete = need && done >= need;
    update(j, { qtyProduced: done, status: complete ? 'completed' : 'in-progress', startDate: j.startDate || today(), endDate: complete ? today() : '' },
      `${j.jobNo}: ${q(done)} of ${q(need)} produced${complete ? ' — completed' : ''}.`);
  };
  const cnt = k => all.filter(j => j.status === k).length;
  return (
    <>
      {slot && createPortal(<>
        <input className="sb-search" value={qs} onChange={e => setQ(e.target.value)} placeholder="Search job no, order, client, product, material…" aria-label="Search job sheets" style={{ width: 200 }} />
        <select className="sb-search" style={{ width: 130 }} value={st} onChange={e => setSt(e.target.value)} aria-label="Status">
          <option value="open">Open</option><option value="overdue">Overdue</option><option value="">All</option>{ST.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        <button type="button" className="sb-tbtn" onClick={() => printDepList({ title: 'JOB SHEET LIST', company, user, filter: st || 'All', total: 0,
          heads: ['Job No.', 'Created', 'Sales Order', 'Client', 'Products', 'Required', 'Produced', 'Location', 'Start', 'Due', 'Status'],
          rows: list.map(j => [j.jobNo, dmy(j.createdAt), j.soNumber, j.customerName, (j.outputItems || []).map(i => `${i.itemName} × ${q(mfgQty(i))}`).join(', ') || j.itemName, q(required(j)), q(j.qtyProduced), j.locationName, dmy(j.startDate), dmy(j.dueDate), stOf(j.status)[1]]) })}><Svg name="file" size={13} />Print list</button>
        <div className="sb-tools">
          <span className="sb-picked">{sel ? <b>{sel.jobNo}</b> : 'Select a job sheet'}</span>
          <button type="button" className="sb-tbtn" disabled={!sel} onClick={() => printJobSheet({ js: sel, company, user })}><Svg name="file" size={13} />Print</button>
          {canEdit && sel?.status === 'pending' && <button type="button" className="sb-tbtn" disabled={busy} onClick={() => update(sel, { status: 'submitted' }, `${sel.jobNo} sent for approval.`)}><Svg name="arrow" size={13} />Submit</button>}
          {canAppr && <button type="button" className="sb-tbtn" disabled={!sel || !['pending', 'submitted'].includes(sel.status) || busy} onClick={() => approve(sel)}><Svg name="check" size={13} />Approve</button>}
          {canEdit && <button type="button" className="sb-tbtn" disabled={!sel || sel.status !== 'approved' || busy} onClick={() => update(sel, { status: 'in-progress', startDate: sel.startDate || today() }, `${sel.jobNo} started.`)} title="Production started"><Svg name="clock" size={13} />Start</button>}
          {canEdit && <button type="button" className="sb-tbtn" disabled={!sel || !['approved', 'in-progress'].includes(sel.status)} onClick={() => { setProd(q(sel.qtyProduced || required(sel))); setAsk({ j: sel, what: 'produce' }); }}><Svg name="box" size={13} />Production</button>}
          {canEdit && <button type="button" className="sb-tbtn" disabled={!sel || !['approved', 'in-progress'].includes(sel.status)} onClick={() => navigate(`/beta/mfg/issue?tab=create&job=${sel.id}`)} title="Issue raw material from store to this job"><Svg name="cart" size={13} />Issue</button>}
          {canEdit && <button type="button" className="sb-tbtn" disabled={!sel || !['approved', 'in-progress', 'completed'].includes(sel.status)} onClick={() => navigate(`/beta/mfg/qc?tab=create&job=${sel.id}`)} title="QC inspection of this job"><Svg name="check" size={13} />QC</button>}
          {canEdit && <button type="button" className="sb-tbtn" disabled={!sel} onClick={() => onEdit(sel)}><Svg name="settings" size={13} />Edit</button>}
          {canDel && <button type="button" className="sb-tbtn del" disabled={!sel} onClick={() => setAsk({ j: sel, what: 'delete' })}><Svg name="x" size={13} />Delete</button>}
        </div>
      </>, slot)}
      {ask?.what === 'delete' && <div className="sb-ask" role="alertdialog" aria-label="Confirm delete"><span><b>Delete job sheet {ask.j.jobNo}</b> ({ask.j.soNumber})? Its planned qty goes back to pending on the order.</span>
        <button type="button" className="sb-abtn" onClick={() => setAsk(null)} disabled={busy}>Keep</button><button type="button" className="sb-abtn danger" onClick={() => del(ask.j)} disabled={busy}>{busy ? 'Deleting…' : 'Yes, delete'}</button></div>}
      {ask?.what === 'produce' && <div className="sb-ask" role="dialog" aria-label="Production">
        <span><b>{ask.j.jobNo}</b> — qty produced so far (of {q(required(ask.j))}):</span>
        <input className="num" inputMode="decimal" value={prod} onChange={e => setProd(num(e.target.value))} autoFocus style={{ width: 90, height: 28, border: '1px solid #C9D7DA', borderRadius: 4, padding: '0 6px', textAlign: 'right' }} aria-label="Produced qty" />
        <span style={{ fontSize: 12, color: '#667085' }}>{Number(prod) >= required(ask.j) ? '→ marks it Completed' : '→ stays In progress'}</span>
        <button type="button" className="sb-abtn" onClick={() => setAsk(null)} disabled={busy}>Cancel</button><button type="button" className="sb-abtn" style={{ background: '#03444f', color: '#fff' }} onClick={() => produce(ask.j)} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button></div>}
      <div className="ac-sum">
        <div>Open jobs<b>{all.filter(j => !['completed', 'cancelled', 'rejected'].includes(j.status)).length}</b></div>
        <div>Awaiting approval<b style={{ color: '#175CD3' }}>{cnt('pending') + cnt('submitted')}</b></div>
        <div>In progress<b style={{ color: '#B54708' }}>{cnt('in-progress')}</b></div>
        <div>Overdue<b style={{ color: '#B42318' }}>{all.filter(overdue).length}</b></div>
        <div>Completed<b style={{ color: '#067647' }}>{cnt('completed')}</b></div>
      </div>
      <div className="sb-list">
        <table className="sb-t px acx">
          <colgroup>{[3, 9, 12, 14, 22, 10, 9, 8, 8, 5].map((x, i) => <col key={i} style={{ width: `${x}%` }} />)}</colgroup>
          <thead><tr><th className="r">Sr</th><th>Job No.</th><th>Sales Order</th><th>Client</th><th>Products to make</th><th>Progress</th><th>Location</th><th>Start</th><th>Due</th><th>Status</th></tr></thead>
          <tbody>
            {rows === null ? <tr><td colSpan={10} className="sb-empty">Loading…</td></tr>
              : !list.length ? <tr><td colSpan={10} className="sb-empty">{qs || st ? 'Nothing matches — try “All” in the status filter.' : 'No job sheet yet — click “Create Job Sheet”.'}</td></tr>
                : list.map((j, i) => { const [, l, bg, fg] = stOf(j.status), need = required(j), done = Number(j.qtyProduced) || 0; return (
                  <tr key={j.id} className={selId === j.id ? 'sel' : ''} onClick={() => setSelId(j.id)} onDoubleClick={() => canEdit && onEdit(j)} style={{ cursor: 'pointer' }}>
                    <td className="r">{i + 1}</td>
                    <td><b className="mono">{j.jobNo}</b><span className="sm">{dmy(j.createdAt)}</span></td>
                    <td className="mono">{j.soNumber || '—'}</td><td className="b">{j.customerName || '—'}</td>
                    <td>{(j.outputItems || []).length ? j.outputItems.map((it, k) => <span key={k} className="sm" style={{ color: '#101828' }}>{it.itemName} <b>× {q(mfgQty(it))} {it.uom || ''}</b></span>) : j.itemName}{(j.bom || []).length > 0 && <span className="sm">{j.bom.length} material(s)</span>}</td>
                    <td><b>{q(done)}</b> / {q(need)}<div className="js-bar"><i style={{ width: `${need ? Math.min(100, done / need * 100) : 0}%` }} /></div></td>
                    <td>{j.locationName || '—'}</td><td className="d">{dmy(j.startDate) || '—'}</td>
                    <td className="d" style={overdue(j) ? { color: '#B42318', fontWeight: 700 } : undefined}>{dmy(j.dueDate) || '—'}{overdue(j) && <span className="sm" style={{ color: '#B42318' }}>overdue</span>}</td>
                    <td><span className="ac-pill" style={{ background: bg, color: fg }}>{l}</span></td>
                  </tr>); })}
          </tbody>
        </table>
      </div>
    </>
  );
}

let bid = 1;
const blankBom = () => ({ k: bid++, material: '', qty: '', uom: '', hsn: '', availableQty: '' });
function JobForm({ companyId, edit, orders, locations, jobs, mfg, onSaved, onCancel }) {
  const e0 = edit || {};
  const [soId, setSoId] = useState(e0.soId ? String(e0.soId) : '');
  const [v, setV] = useState(() => ({ locationId: e0.locationId ? String(e0.locationId) : '', startDate: e0.startDate || '', dueDate: e0.dueDate || '', notes: e0.notes || '',
    specifications: e0.specifications || '', workInstructions: e0.workInstructions || '' }));
  const [picked, setPicked] = useState(() => Object.fromEntries((e0.outputItems || []).map(it => [keyOf(it), String(mfgQty(it))])));
  const [bom, setBom] = useState(() => ((e0.bom || []).length ? e0.bom.map(b => ({ k: bid++, ...b, qty: String(b.qty ?? ''), availableQty: String(b.availableQty ?? '') })) : [blankBom()]));
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const set = k => e => { const x = e.target.value; setV(o => ({ ...o, [k]: x })); setMsg(null); };
  const so = orders.find(o => String(o.orderId) === soId) || null;
  // planned on other job sheets of this order (not cancelled / rejected), per product
  const planned = useMemo(() => { const m = {}; jobs.filter(j => String(j.soId) === soId && String(j.id) !== String(e0.id || '') && !['cancelled', 'rejected'].includes(j.status))
    .forEach(j => (j.outputItems || []).forEach(it => { m[keyOf(it)] = (m[keyOf(it)] || 0) + mfgQty(it); })); return m; }, [jobs, soId, e0.id]);
  const items = useMemo(() => (so ? (so.items || []) : []).map(it => {
    const o = { itemName: it.description || it.itemName || it.material || '', itemCode: it.itemCode || it.item_code || '', soQty: Number(it.qty || it.quantity) || 0, uom: it.unit || it.uom || '', rate: Number(it.rate) || 0, type: it.type || '',
      bom: (it.bom || []).map(b => ({ material: b.itemName || b.material || b.name || '', qty: Number(b.qty) || 0, uom: b.unit || b.uom || '', hsn: b.hsnCode || b.hsn || '' })) };
    const done = planned[keyOf(o)] || 0; return { ...o, alreadyMfg: done, pendingQty: Math.max(0, o.soQty - done) };
  }).filter(it => it.itemName), [so, planned]);
  const orderGroups = useMemo(() => [{ group: 'Sales orders', items: orders.filter(o => !['cancelled', 'rejected', 'draft'].includes(o.status) || String(o.orderId) === soId)
    .sort((a, b) => String(b.orderDate || '').localeCompare(String(a.orderDate || '')))
    .map(o => ({ key: String(o.orderId), label: `${String(o.orderNo || o.orderId).trim()} — ${o.customerName || o.party || ''}`, sub: o.customerPO ? `PO ${o.customerPO}` : '' })) }], [orders, soId]);
  const pickOrder = id => {
    setSoId(id); setMsg(null);
    const o = orders.find(x => String(x.orderId) === id);
    if (!o) return;
    setV(x => ({ ...x, dueDate: x.dueDate || o.deliveryDate || '', specifications: x.specifications || [o.productSpecs, o.technicalDetails, o.drawingNumber && `Drawing: ${o.drawingNumber}${o.version ? ` rev ${o.version}` : ''}`].filter(Boolean).join('\n') }));
    setPicked({});
  };
  const toggle = it => {
    const k = keyOf(it);
    setPicked(p => { const n = { ...p }; if (n[k] !== undefined) delete n[k]; else n[k] = q(it.pendingQty || it.soQty); return n; });
    // bring the product's BOM in (once) when it is ticked
    const src = it.bom.length ? it.bom : masterRows([{ ...it, mfgQty: it.pendingQty || it.soQty }]);
    if (picked[k] === undefined && src.length) setBom(b => { const have = new Set(b.map(x => x.material.toLowerCase().trim())); const add = src.filter(x => x.material && !have.has(x.material.toLowerCase().trim())).map(x => ({ k: bid++, ...x, qty: String(x.qty), availableQty: '' })); const kept = b.filter(x => x.material.trim()); return [...kept, ...add, ...(kept.length + add.length ? [] : [blankBom()])]; });
  };
  const chosen = items.filter(it => picked[keyOf(it)] !== undefined);
  /* materials from the BOM master for the products × qty, with the raw material stock as "in stock" */
  const stock = useMemo(() => (mfg ? rawStock(mfg) : {}), [mfg]);
  const masterRows = list => {
    if (!mfg) return [];
    const m = new Map();
    list.forEach(it => { const bm = bomFor(mfg, it); if (!bm) return; bomNeed(bm, Number(it.mfgQty) || 0).forEach(x => {
      const rm = mfg.rms.find(r => r.rmId === x.rmId), kk = String(x.name).toLowerCase().trim(), o = m.get(kk);
      if (o) o.qty = Math.round((o.qty + x.qty) * 1000) / 1000;
      else m.set(kk, { material: x.name, qty: x.qty, uom: x.unit, hsn: rm?.hsnCode || '', availableQty: stock[x.rmId] ? stock[x.rmId].closing : '' });
    }); });
    return [...m.values()];
  };
  const withMaster = chosen.filter(it => mfg && bomFor(mfg, it));
  const fillFromMaster = () => {
    const add = masterRows(chosen.map(it => ({ ...it, mfgQty: Number(picked[keyOf(it)]) || 0 })));
    const names = new Set(add.map(x => x.material.toLowerCase().trim()));
    setBom(b => { const kept = b.filter(x => x.material.trim() && !names.has(x.material.toLowerCase().trim())); return [...kept, ...add.map(x => ({ k: bid++, ...x, qty: String(x.qty), availableQty: String(x.availableQty) }))]; });
    setMsg({ k: 'ok', t: `Materials filled from the BOM master for ${withMaster.map(it => it.itemName).join(', ')}, with today's stock.` });
  };
  const setB = (k, f, x) => setBom(b => b.map(r => (r.k === k ? { ...r, [f]: x } : r)));
  const save = async status => {
    if (!soId && !bom.some(b => b.material.trim())) return setMsg({ k: 'err', t: 'Pick the sales order (or add the materials for a stock job).' });
    if (soId && !chosen.length) return setMsg({ k: 'err', t: 'Tick at least one product to make.' });
    const over = chosen.find(it => (Number(picked[keyOf(it)]) || 0) > it.pendingQty + 0.0001);
    if (over) return setMsg({ k: 'err', t: `${over.itemName}: only ${q(over.pendingQty)} is pending on the order.` });
    if (chosen.some(it => !(Number(picked[keyOf(it)]) > 0))) return setMsg({ k: 'err', t: 'Every ticked product needs a qty.' });
    if (v.startDate && v.dueDate && v.dueDate < v.startDate) return setMsg({ k: 'err', t: 'The due date is before the start date.' });
    setBusy(true);
    const loc = locations.find(l => String(l.id) === v.locationId);
    const out = chosen.map(it => ({ ...it, qty: Number(picked[keyOf(it)]) || 0, mfgQty: Number(picked[keyOf(it)]) || 0 }));
    const first = out[0] || {};
    const rec = { ...e0, soId, soNumber: so ? String(so.orderNo || '').trim() : e0.soNumber || '', customerName: so ? so.customerName || so.party || '' : e0.customerName || '',
      locationId: v.locationId ? Number(v.locationId) : 0, locationName: loc ? loc.name : (v.locationId ? e0.locationName : ''),
      itemName: first.itemName || '', itemCode: first.itemCode || '', qtyRequired: first.mfgQty || 0, uom: first.uom || '', qtyProduced: e0.qtyProduced || 0, endDate: e0.endDate || '',
      dueDate: v.dueDate, startDate: v.startDate, status, notes: v.notes.trim(), specifications: v.specifications.trim(), workInstructions: v.workInstructions.trim(),
      bom: bom.filter(b => b.material.trim()).map(({ k, ...b }) => ({ ...b, material: b.material.trim(), qty: Number(b.qty) || 0, availableQty: b.availableQty === '' ? '' : Number(b.availableQty) || 0 })), outputItems: out, attachments: e0.attachments || [] };
    try {
      const fd = toFd(rec, companyId, {}, files, files.map(f => f.name));
      const r = edit ? await axios.put(`/api/manufacturing/job-sheets/${edit.id}`, fd, { params: { companyId } }) : await axios.post('/api/manufacturing/job-sheets', fd, { params: { companyId } });
      onSaved(`${edit ? 'Updated' : 'Created'} job sheet ${edit ? edit.jobNo : r.data?.jobNo || ''}${status === 'submitted' ? ' — sent for approval' : ''}.`);
    } catch (e) { setMsg({ k: 'err', t: e.response?.data?.error || 'Could not save the job sheet.' }); }
    finally { setBusy(false); }
  };
  const short = b => b.availableQty !== '' && b.availableQty != null && Number(b.qty) > Number(b.availableQty);
  return (
    <div className="sf">
      <div className="sf-hero"><span className="ic"><Svg name="factory" size={15} /></span><h1>{edit ? `Edit job sheet ${edit.jobNo}` : 'Create Job Sheet'}</h1><span className="grow" /></div>
      <div className="sf-2" style={{ marginTop: 10 }}>
        <div className="sf-card"><div className="sf-ch"><span className="ico"><Svg name="file" size={13} /></span><b>Order &amp; plan</b></div>
          <table className="sf-kv"><tbody>
            <tr><th>Sales order</th><td><Picker value={so ? `${String(so.orderNo || '').trim()} — ${so.customerName || so.party || ''}` : (e0.soNumber ? `${e0.soNumber} — ${e0.customerName || ''}` : '')} groups={orderGroups} placeholder="Type order no. or client…" ariaLabel="Sales order" autoFocus={!edit} onPick={o => pickOrder(o.key)} /></td></tr>
            <tr><th>Client</th><td>{so ? <b>{so.customerName || so.party}</b> : e0.customerName || '—'}{so?.customerPO && <span style={{ color: '#667085' }}> · PO {so.customerPO}</span>}</td></tr>
            <tr><th>Location</th><td><select value={v.locationId} onChange={set('locationId')}><option value="">— choose the workshop / factory —</option>{locations.filter(l => l.status !== 'inactive' || String(l.id) === v.locationId).map(l => <option key={l.id} value={String(l.id)}>{l.name}{l.city ? ` · ${l.city}` : ''}</option>)}</select></td></tr>
            <tr><th>Start / due date</th><td style={{ display: 'flex', gap: 6 }}><input type="date" value={v.startDate} onChange={set('startDate')} aria-label="Start date" /><input type="date" value={v.dueDate} onChange={set('dueDate')} aria-label="Due date" /></td></tr>
            <tr><th>Notes</th><td><input value={v.notes} onChange={set('notes')} placeholder="Optional" /></td></tr>
          </tbody></table></div>
        <div className="sf-card"><div className="sf-ch"><span className="ico"><Svg name="info" size={13} /></span><b>Specifications &amp; work instructions</b></div>
          <div style={{ padding: 8, display: 'grid', gap: 6 }}>
            <textarea className="ac-ta" value={v.specifications} onChange={set('specifications')} placeholder="Size, material grade, colour, drawing no. / revision…" aria-label="Specifications" />
            <textarea className="ac-ta" value={v.workInstructions} onChange={set('workInstructions')} placeholder="Steps for the shop floor: cutting, welding, painting, testing, packing…" aria-label="Work instructions" />
            <label className="sf-lnk" style={{ cursor: 'pointer' }}>+ Attach drawing / file<input type="file" multiple hidden onChange={e => { const l = [...(e.target.files || [])]; e.target.value = ''; setFiles(x => [...x, ...l]); }} /></label>
            {[...(e0.attachments || []).map(a => a.name || a.fileName), ...files.map(f => `${f.name} (on save)`)].map((n, i) => <div key={i} style={{ fontSize: 12, color: '#475467' }}>📎 {n}</div>)}
          </div></div>
      </div>
      <div className="sf-card"><div className="sf-ch"><span className="ico"><Svg name="box" size={13} /></span><b>Products to make</b><span className="grow" /><span style={{ fontSize: 12, color: '#fff' }}>{chosen.length} ticked</span></div>
        {!so ? <div className="sf-empty">{edit && e0.outputItems?.length ? `${e0.outputItems.map(i => `${i.itemName} × ${q(mfgQty(i))}`).join(', ')} — pick the order again to change the products.` : 'Pick the sales order to see its products.'}</div> : !items.length ? <div className="sf-empty">This order has no products.</div> : (
          <table className="ac-lines"><thead><tr><th style={{ width: 34 }} /><th>Product</th><th className="r">SO qty</th><th className="r">On other job sheets</th><th className="r">Pending</th><th className="r" style={{ width: 130 }}>Make in this job</th><th>Unit</th></tr></thead>
            <tbody>{items.map(it => { const k = keyOf(it), on = picked[k] !== undefined; return (
              <tr key={k} style={!it.pendingQty && !on ? { color: '#98A2B3' } : undefined}><td style={{ textAlign: 'center' }}><input type="checkbox" checked={on} disabled={!it.pendingQty && !on} onChange={() => toggle(it)} style={{ width: 15, height: 15, accentColor: '#03444f' }} aria-label={`Make ${it.itemName}`} /></td>
                <td><b>{it.itemName}</b>{it.bom.length > 0 && <span style={{ fontSize: 11, color: '#667085' }}> · BOM {it.bom.length}</span>}</td><td className="r">{q(it.soQty)}</td><td className="r">{q(it.alreadyMfg)}</td><td className="r"><b>{q(it.pendingQty)}</b>{!it.pendingQty && ' ✓'}</td>
                <td>{on ? <input className="num" inputMode="decimal" value={picked[k]} onChange={e => setPicked(p => ({ ...p, [k]: num(e.target.value) }))} aria-label={`Qty ${it.itemName}`} /> : ''}</td><td>{it.uom}</td></tr>); })}</tbody>
          </table>)}
      </div>
      <div className="sf-card"><div className="sf-ch"><span className="ico"><Svg name="box" size={13} /></span><b>Materials (BOM)</b><span className="grow" />
        <span style={{ fontSize: 12, color: '#fff', marginRight: 8 }}>{bom.filter(short).length ? `${bom.filter(short).length} short` : ''}</span>{withMaster.length > 0 && <button type="button" className="sf-lnk" style={{ marginRight: 10 }} onClick={fillFromMaster} title="Materials × qty from Manufacturing → BOM, with today's stock">↻ From BOM master</button>}<button type="button" className="sf-lnk" onClick={() => setBom(b => [...b, blankBom()])}>+ Add material</button></div>
        <table className="ac-lines"><thead><tr><th>Material</th><th className="r" style={{ width: 110 }}>Qty needed</th><th style={{ width: 80 }}>Unit</th><th style={{ width: 100 }}>HSN</th><th className="r" style={{ width: 110 }}>In stock</th><th style={{ width: 90 }}>Check</th><th style={{ width: 34 }} /></tr></thead>
          <tbody>{bom.map(b => (
            <tr key={b.k}><td><input value={b.material} onChange={e => setB(b.k, 'material', e.target.value)} placeholder="e.g. MS sheet 2 mm" aria-label="Material" /></td>
              <td><input className="num" inputMode="decimal" value={b.qty} onChange={e => setB(b.k, 'qty', num(e.target.value))} aria-label="Qty" /></td>
              <td><input value={b.uom} onChange={e => setB(b.k, 'uom', e.target.value)} aria-label="Unit" /></td><td><input value={b.hsn} onChange={e => setB(b.k, 'hsn', e.target.value)} aria-label="HSN" /></td>
              <td><input className="num" inputMode="decimal" value={b.availableQty} onChange={e => setB(b.k, 'availableQty', num(e.target.value))} placeholder="optional" aria-label="In stock" /></td>
              <td>{b.availableQty === '' ? <span style={{ color: '#98A2B3', fontSize: 12 }}>—</span> : short(b) ? <span className="ac-pill" style={{ background: '#FEF3F2', color: '#B42318' }}>Short {q(Number(b.qty) - Number(b.availableQty))}</span> : <span className="ac-pill" style={{ background: '#ECFDF3', color: '#067647' }}>OK</span>}</td>
              <td><button type="button" className="ac-x" disabled={bom.length <= 1} onClick={() => setBom(x => x.filter(y => y.k !== b.k))} aria-label="Remove material">×</button></td></tr>))}</tbody>
        </table></div>
      {msg && <div className={`sf-msg ${msg.k}`} role="status">{msg.t}</div>}
      <div className="sf-bar">
        <div className="info">{so ? `${String(so.orderNo || '').trim()} · ` : ''}{chosen.map(it => `${it.itemName} × ${picked[keyOf(it)] || 0}`).join(', ') || 'No product ticked'} · {bom.filter(b => b.material.trim()).length} material(s)</div>
        <button type="button" className="sf-b ghost" onClick={onCancel} disabled={busy}>Cancel</button>
        <button type="button" className="sf-b ghost" onClick={() => save(edit ? (e0.status || 'pending') : 'pending')} disabled={busy}>{edit ? 'Update' : 'Save draft'}</button>
        {(!edit || ['pending', 'rejected'].includes(e0.status)) && <button type="button" className="sf-b pri" onClick={() => save('submitted')} disabled={busy}>{busy ? 'Saving…' : 'Submit for approval'}</button>}
      </div>
    </div>
  );
}
