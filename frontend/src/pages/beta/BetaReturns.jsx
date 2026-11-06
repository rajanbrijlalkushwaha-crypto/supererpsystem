/* Beta — material that comes back / goes back. One screen, two kinds:
 *   kind 'client'  Return Note (Sales Order menu)        — the client sends material back against a sales order (stock IN)
 *   kind 'vendor'  Return to Vendor (Purchase Order menu) — we send material back to the vendor against a PO (stock OUT)
 * Tabs: Create | List (?tab=…). Saved to /api/returns. Every note keeps who made / edited / deleted it and when;
 * a delete only marks it deleted (struck through in the list, does not count in stock). */
import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useCompany } from '../../context/CompanyContext';
import { Svg } from '../../components/ui/Icon';
import { CSS as SALES_CSS, fyOf, FyFilter, fyCounts, useClearSel, fyLabel } from './BetaSales';
import { num, fdate, dash } from './BetaSalesBill';
import { n, r3, today, key, poLines, loadGrns, ownerIdx, grnQtyOf } from './BetaPurchaseLib';
import { ListPicker, PX_CSS } from './BetaPurchaseParts';
import { VENDOR_PREFIX } from './BetaStock';

const CFG = {
  client: { path: '/beta/return-note', title: 'Return Note', create: 'Create Return Note', list: 'Return Notes', party: 'Client', doc: 'Sales Order',
    reasons: ['Damaged in transit', 'Defective', 'Rejected by client', 'Excess supplied', 'Wrong item', 'Other'] },
  vendor: { path: '/beta/vendor-return', title: 'Return to Vendor', create: 'Create Return to Vendor', list: 'Returns to Vendor', party: 'Vendor', doc: 'Purchase Order',
    reasons: ['Defective / rejected', 'Excess received', 'Wrong item', 'For repair / rework', 'Other'] },
};
const EXTRA_CSS = '.gl { line-height:1.35; } .gl + .gl { margin-top:3px; } .sb-t tbody.og.gone td { color:#98A2B3; text-decoration:line-through; } .rt-who { font-size:11px; color:#667085; }';
const who = r => (r.createdBy && typeof r.createdBy === 'object' ? r.createdBy.name || r.createdBy.username : r.createdBy) || '';

export default function BetaReturns({ kind }) {
  const C = CFG[kind];
  const navigate = useNavigate();
  const { search } = useLocation();
  const urlTab = new URLSearchParams(search).get('tab') === 'create' ? 'create' : 'list';
  const { selectedCompany } = useCompany() || {};
  const companyId = selectedCompany?.companyId;

  const [orders, setOrders] = useState([]);
  const [pos, setPos] = useState([]);
  const [dcs, setDcs] = useState([]);
  const [grns, setGrns] = useState([]);
  const [rets, setRets] = useState(null);
  const [vendors, setVendors] = useState([]);
  const [reload, setReload] = useState(0);
  const [editing, setEditing] = useState(null);
  const [note, setNote] = useState(null);
  const [slot, setSlot] = useState(null);

  useEffect(() => {
    if (!companyId) return;
    const p = { params: { companyId } };
    const arr = r => (Array.isArray(r.data) ? r.data : []);
    axios.get('/api/sales-orders', p).then(r => setOrders(arr(r))).catch(() => setOrders([]));
    if (kind === 'client') axios.get('/api/delivery-challans', p).then(r => setDcs(arr(r))).catch(() => setDcs([]));
    else { axios.get('/api/purchase-orders', p).then(r => setPos(arr(r))).catch(() => setPos([])); loadGrns(companyId).then(setGrns); }
    axios.get('/api/vendors', p).then(r => setVendors(arr(r).filter(v => v.status !== 'rejected'))).catch(() => setVendors([]));
    axios.get('/api/returns', { params: { companyId, kind, withDeleted: 1 } }).then(r => setRets(arr(r))).catch(() => setRets([]));
  }, [companyId, kind, reload]);

  const live = useMemo(() => (rets || []).filter(r => r.status !== 'deleted'), [rets]);
  const tab = editing ? 'create' : urlTab;
  const go = k => { setEditing(null); navigate(`${C.path}?tab=${k}`); };

  return (
    <div className="sb">
      <style>{SALES_CSS + PX_CSS + EXTRA_CSS}</style>
      <div className="sb-tabs" role="tablist">
        {[['create', C.create], ['list', C.list]].map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={`sb-tab${tab === k ? ' on' : ''}`} onClick={() => go(k)}>
            {label}{k === 'list' && rets && <span className="n">{live.length}</span>}
          </button>
        ))}
        <div className="sb-slot" ref={setSlot} />
      </div>
      {note && <div className="sb-note" role="status">{note}<button type="button" onClick={() => setNote(null)} aria-label="Dismiss">×</button></div>}
      {tab === 'create' && (
        <div className="sb-body">
          {rets === null ? <div className="sb-empty">Loading…</div>
            : <ReturnForm key={editing ? `e-${editing.returnId}` : 'new'} kind={kind} C={C} companyId={companyId} company={selectedCompany}
              orders={orders} pos={pos} dcs={dcs} grns={grns} rets={live} vendors={vendors} edit={editing}
              onCancel={() => { setEditing(null); navigate(`${C.path}?tab=list`); }}
              onSaved={text => { setReload(x => x + 1); setNote(text); setEditing(null); navigate(`${C.path}?tab=list`); }} />}
        </div>
      )}
      {tab === 'list' && <ReturnList kind={kind} C={C} rets={rets} companyId={companyId} slot={slot} setNote={setNote}
        onEdit={r => { setNote(null); setEditing(r); }} onChanged={() => setReload(x => x + 1)} />}
    </div>
  );
}

/* per order / PO line: what went out (DC) or came in (GRN), what was returned before, what can be returned now */
function linesFor(kind, doc, dcs, grns, rets, editId) {
  if (!doc) return [];
  const prev = {};
  rets.filter(r => r.returnId !== editId && String(kind === 'client' ? r.orderId : r.poId) === String(kind === 'client' ? doc.orderId : doc.orderId))
    .forEach(r => (r.items || []).forEach(it => { const k = it.itemIdx != null ? `i${it.itemIdx}` : key(it.itemName); prev[k] = r3((prev[k] || 0) + n(it.qty)); }));
  if (kind === 'client') {
    const items = (doc.items || []).map((it, idx) => ({ idx, name: it.description || it.itemName || it.material || '', unit: it.unit || 'NOS', qty: n(it.qty) })).filter(l => l.name);
    const sent = {};
    dcs.filter(d => String(d.linkedSalesOrderId) === String(doc.orderId)).forEach(d => (d.items || []).forEach(it => {
      const l = it.itemIdx != null && items.some(x => x.idx === Number(it.itemIdx)) ? items.find(x => x.idx === Number(it.itemIdx)) : items.find(x => key(x.name) === key(it.description || it.itemName));
      if (l) sent[l.idx] = r3((sent[l.idx] || 0) + n(it.qty));
    }));
    return items.map(l => { const out = sent[l.idx] || 0, back = prev[`i${l.idx}`] || prev[key(l.name)] || 0; return { ...l, moved: out, back, max: Math.max(0, r3(out - back)) }; });
  }
  const lines = poLines(doc), got = {};
  grns.filter(g => String(g.poId) === String(doc.orderId) && g.status !== 'deleted' && g.deliveryType !== 'direct-client')
    .forEach(g => (g.items || []).forEach((li, j) => { const i = ownerIdx(li, j, lines); if (i != null) got[i] = r3((got[i] || 0) + grnQtyOf(li)); }));
  return lines.map(l => { const inn = got[l.idx] || 0, back = prev[`i${l.idx}`] || prev[key(l.name)] || 0; return { idx: l.idx, name: l.name, unit: l.unit, qty: l.qty, moved: inn, back, max: Math.max(0, r3(inn - back)) }; });
}

function ReturnForm({ kind, C, companyId, company, orders, pos, dcs, grns, rets, vendors, edit, onSaved, onCancel }) {
  const docs = kind === 'client' ? orders.filter(o => o.status !== 'cancelled') : pos.filter(p => !['draft', 'rejected', 'cancelled'].includes(p.status));
  const [docId, setDocId] = useState(edit ? String(kind === 'client' ? edit.orderId : edit.poId) : '');
  const doc = docs.find(d => String(d.orderId) === docId) || (kind === 'client' ? orders : pos).find(d => String(d.orderId) === docId) || null;
  const locations = Array.isArray(company?.locations) ? company.locations : [];
  const [head, setHead] = useState(() => ({ date: edit?.date || today(), dcId: edit?.dcId || '', reason: edit?.reason || '', location: edit?.location ?? (locations[0]?.name || 'My godown / factory'), vehicleNo: edit?.vehicleNo || '', remarks: edit?.remarks || '' }));
  const [qty, setQty] = useState(() => { const q = {}; (edit?.items || []).forEach(it => { if (it.itemIdx != null) q[it.itemIdx] = String(it.qty); }); return q; });
  const [rmk, setRmk] = useState(() => { const r = {}; (edit?.items || []).forEach(it => { if (it.itemIdx != null && it.remarks) r[it.itemIdx] = it.remarks; }); return r; });
  const [picker, setPicker] = useState(!edit);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const set = k => e => { const v = e.target.value; setHead(h => ({ ...h, [k]: v })); };

  const lines = useMemo(() => linesFor(kind, doc, dcs, grns, rets, edit?.returnId), [kind, doc, dcs, grns, rets, edit]);
  const errs = {};
  lines.forEach(l => { if (n(qty[l.idx]) > l.max + 1e-9) errs[l.idx] = `Only ${num(l.max)} can come back`; });
  const send = lines.filter(l => n(qty[l.idx]) > 0);
  const docDcs = kind === 'client' && doc ? dcs.filter(d => String(d.linkedSalesOrderId) === String(doc.orderId)) : [];

  const save = async () => {
    setMsg(null);
    if (!doc) return setMsg({ k: 'err', t: `Pick the ${C.doc.toLowerCase()} first.` });
    if (!head.date) return setMsg({ k: 'err', t: 'Enter the date.' });
    if (!head.reason) return setMsg({ k: 'err', t: 'Choose the reason for the return.' });
    if (Object.keys(errs).length) return setMsg({ k: 'err', t: 'Some quantities are more than what can come back — see the red boxes.' });
    if (!send.length) return setMsg({ k: 'err', t: 'Enter the return qty for at least one product.' });
    setBusy(true);
    const dc = docDcs.find(d => String(d.dcId) === String(head.dcId));
    const payload = {
      companyId, kind, date: head.date, reason: head.reason, location: head.location.trim(), vehicleNo: head.vehicleNo.trim(), remarks: head.remarks.trim(),
      items: send.map(l => ({ itemIdx: l.idx, itemName: l.name, unit: l.unit, qty: n(qty[l.idx]), remarks: (rmk[l.idx] || '').trim() })),
      ...(kind === 'client'
        ? { orderId: String(doc.orderId), orderNo: doc.orderNo || '', customerName: doc.customerName || doc.party || '', dcId: dc ? String(dc.dcId) : '', dcNo: dc ? dc.dcNo || '' : '' }
        : { poId: String(doc.orderId), poNo: doc.poNo || doc.poNumber || '', vendorId: String(doc.vendorId || ''), vendorName: doc.vendorName || '',
            orderId: String(doc.linkedSalesOrderId || ''), orderNo: orders.find(o => String(o.orderId) === String(doc.linkedSalesOrderId))?.orderNo || '' }),
    };
    try {
      const r = edit ? await axios.put(`/api/returns/${edit.returnId}`, payload, { params: { companyId } }) : await axios.post('/api/returns', payload, { params: { companyId } });
      const qtyTot = send.reduce((s, l) => s + n(qty[l.idx]), 0);
      onSaved(`${edit ? 'Updated' : 'Saved'} ${C.title} ${r.data?.returnNo || edit?.returnNo || ''} — ${num(qtyTot)} qty ${kind === 'client' ? `back from ${payload.customerName}` : `back to ${payload.vendorName}`}.`);
    } catch (e) { setMsg({ k: 'err', t: e.response?.data?.error || 'Could not save.' }); }
    finally { setBusy(false); }
  };

  const pickRows = docs.map(d => kind === 'client'
    ? { key: String(d.orderId), search: `${d.orderNo} ${d.customerName || ''} ${d.customerPO || ''}`, cells: [d.orderNo || d.orderId, fdate(d.orderDate), d.customerName || '—', d.customerPO || '—'] }
    : { key: String(d.orderId), search: `${d.poNo} ${d.vendorName || ''}`, cells: [d.poNo || d.orderId, fdate(d.poDate), d.vendorName || '—', orders.find(o => String(o.orderId) === String(d.linkedSalesOrderId))?.orderNo || '—'] });

  return (
    <div className="sf">
      <div className="sf-hero">
        <span className="ic"><Svg name="swap" size={15} /></span>
        <h1>{edit ? `Edit ${C.title} ${edit.returnNo}` : C.create}</h1><span className="grow" />
        {doc && <span className="sf-chip"><small>{kind === 'client' ? 'SO' : 'PO'}</small><b>{kind === 'client' ? doc.orderNo : doc.poNo || doc.orderId}</b></span>}
        <span className="sf-chip"><small>Returning</small><b>{num(send.reduce((s, l) => s + n(qty[l.idx]), 0))}</b></span>
      </div>

      <div className="sf-2" style={{ marginTop: 10 }}>
        <div className="sf-card">
          <div className="sf-ch"><span className="ico"><Svg name={kind === 'client' ? 'file' : 'cart'} size={13} /></span><b>{C.doc}</b></div>
          <table className="sf-kv"><tbody>
            <tr><th>{kind === 'client' ? 'Order No.' : 'PO No.'} <i>*</i></th><td>
              <div className="sf-srch">
                <input readOnly value={doc ? (kind === 'client' ? `${doc.orderNo} · ${doc.customerName || ''}` : `${doc.poNo || doc.orderId} · ${doc.vendorName || ''}`) : ''} placeholder={`Click to pick the ${C.doc.toLowerCase()}`} onClick={() => !edit && setPicker(true)} disabled={!!edit} />
                <button type="button" className="sf-sbtn" onClick={() => setPicker(true)} disabled={!!edit} aria-label={`Pick ${C.doc}`}><Svg name="search" size={14} /></button>
              </div>
            </td></tr>
            <tr><th>{C.party}</th><td>{doc ? <b>{kind === 'client' ? doc.customerName : doc.vendorName}</b> : '—'}</td></tr>
            {kind === 'client'
              ? <tr><th>Against DC</th><td><select value={head.dcId} onChange={set('dcId')} disabled={!doc}>
                  <option value="">{docDcs.length ? 'Optional — the DC the material went on' : 'No DC for this order'}</option>
                  {docDcs.map(d => <option key={d.dcId} value={String(d.dcId)}>{d.dcNo} · {fdate(d.dcDate)}</option>)}</select></td></tr>
              : <tr><th>Order</th><td>{doc ? dash(orders.find(o => String(o.orderId) === String(doc.linkedSalesOrderId))?.orderNo) : '—'}</td></tr>}
          </tbody></table>
        </div>
        <div className="sf-card">
          <div className="sf-ch"><span className="ico"><Svg name="file" size={13} /></span><b>Return Details</b></div>
          <table className="sf-kv"><tbody>
            <tr><th>Date <i>*</i></th><td><input type="date" value={head.date} onChange={set('date')} /></td></tr>
            <tr><th>Reason <i>*</i></th><td><select value={head.reason} onChange={set('reason')}><option value="">Choose…</option>{C.reasons.map(r => <option key={r}>{r}</option>)}</select></td></tr>
            <tr><th>{kind === 'client' ? 'Received at' : 'Sent from'}</th><td>
              <select value={head.location} onChange={set('location')}>
                <optgroup label="My godown / factory">
                  {locations.length ? locations.map(l => <option key={l.name} value={l.name}>{l.name} ({l.type})</option>) : <option value="My godown / factory">My godown / factory</option>}
                </optgroup>
                <optgroup label="At a vendor's site">
                  {[...vendors].sort((a, b) => String(a.vendorName).localeCompare(String(b.vendorName))).map(v => <option key={v.vendorId} value={VENDOR_PREFIX + v.vendorName}>{v.vendorName}{v.city ? ` · ${v.city}` : ''}</option>)}
                </optgroup>
                {head.location && !locations.some(l => l.name === head.location) && head.location !== 'My godown / factory' && !head.location.startsWith(VENDOR_PREFIX) && <option value={head.location}>{head.location}</option>}
              </select>
            </td></tr>
            <tr><th>Vehicle No.</th><td><input value={head.vehicleNo} onChange={set('vehicleNo')} placeholder="Optional" /></td></tr>
            <tr><th>Remarks</th><td><input value={head.remarks} onChange={set('remarks')} placeholder="Optional" /></td></tr>
          </tbody></table>
        </div>
      </div>

      <div className="sf-card">
        <div className="sf-ch"><span className="ico"><Svg name="box" size={13} /></span><b>Products {kind === 'client' ? 'coming back' : 'going back'}</b></div>
        {!doc ? <div className="sf-empty">Pick the {C.doc.toLowerCase()} to see its products.</div> : (
          <table className="sf-t sf-pt">
            <colgroup><col style={{ width: 34 }} /><col /><col style={{ width: 84 }} /><col style={{ width: 100 }} /><col style={{ width: 100 }} /><col style={{ width: 100 }} /><col style={{ width: 120 }} /><col style={{ width: 200 }} /></colgroup>
            <thead><tr><th>Sl</th><th>Product</th><th className="r">{kind === 'client' ? 'Ordered' : 'PO Qty'}</th><th className="r">{kind === 'client' ? 'Sent (DC)' : 'Received (GRN)'}</th>
              <th className="r">Returned before</th><th className="r">Can return</th><th className="r now first">Return now</th><th className="now">Remarks</th></tr></thead>
            <tbody>{lines.map((l, i) => {
              const q = n(qty[l.idx]);
              return (
                <tr key={l.idx} className={l.max <= 0 && !q ? 'off' : ''}>
                  <td>{i + 1}</td><td><div className="pn">{l.name}</div><div className="ps">{l.unit}</div></td>
                  <td className="r">{num(l.qty)}</td><td className="r">{l.moved ? num(l.moved) : <span className="mut">0</span>}</td>
                  <td className="r">{l.back ? num(l.back) : <span className="mut">0</span>}</td><td className="r">{num(l.max)}</td>
                  <td className="r now first">
                    <input className={`sf-q${errs[l.idx] ? ' bad' : ''}`} inputMode="decimal" value={qty[l.idx] ?? ''} placeholder="0" disabled={l.max <= 0 && !q}
                      onChange={e => { const v = e.target.value.replace(/[^\d.]/g, ''); setQty(x => ({ ...x, [l.idx]: v })); }} aria-label={`Return qty for ${l.name}`} />
                    {errs[l.idx] && <span className="sf-err">{errs[l.idx]}</span>}
                  </td>
                  <td className="now"><input value={rmk[l.idx] || ''} onChange={e => { const v = e.target.value; setRmk(x => ({ ...x, [l.idx]: v })); }} placeholder="Optional" disabled={!q} aria-label={`Remarks for ${l.name}`} /></td>
                </tr>
              );
            })}</tbody>
          </table>
        )}
      </div>

      {msg && <div className={`sf-msg ${msg.k}`} role="status">{msg.t}</div>}
      <div className="sf-bar">
        <div className="info">{doc ? <>Returning <b>{num(send.reduce((s, l) => s + n(qty[l.idx]), 0))}</b> qty of {send.length} product{send.length === 1 ? '' : 's'}</> : `Pick a ${C.doc.toLowerCase()} to start.`}</div>
        {edit && <button type="button" className="sf-b ghost" onClick={onCancel} disabled={busy}>Cancel</button>}
        <button type="button" className="sf-b pri" onClick={save} disabled={busy}>{busy ? 'Saving…' : edit ? 'Update' : 'Save'}</button>
      </div>

      {picker && <ListPicker title={`Select ${C.doc}`} placeholder={kind === 'client' ? 'Search order no., client, client PO…' : 'Search PO no., vendor…'}
        cols={kind === 'client' ? [['Order No.'], ['Date'], ['Client'], ['Client PO']] : [['PO No.'], ['PO Date'], ['Vendor'], ['Order No.']]}
        rows={pickRows} onClose={() => setPicker(false)} onPick={k => { setPicker(false); if (k !== docId) { setDocId(k); setQty({}); setRmk({}); setHead(h => ({ ...h, dcId: '' })); setMsg(null); } }} />}
    </div>
  );
}

const RCOLS = kind => [['Date', '7%'], ['No.', '9%'], [kind === 'client' ? 'Order No.' : 'PO No.', '10%'], [kind === 'client' ? 'Client' : 'Vendor', '14%'],
  [kind === 'client' ? 'DC No.' : 'Order No.', '9%'], ['Products', '21%'], ['Qty', '5%', 'r'], ['Reason', '10%'], [kind === 'client' ? 'Received at' : 'Sent from', '8%'], ['By', '7%']];

function ReturnList({ kind, C, rets, companyId, slot, setNote, onEdit, onChanged }) {
  const [fySel, setFySel] = useState(() => [fyOf(new Date())]);
  const [q, setQ] = useState('');
  const [selId, setSelId] = useState(null);
  const [askDel, setAskDel] = useState(null);
  const [why, setWhy] = useState('');
  const [busy, setBusy] = useState(false);
  useClearSel(askDel ? null : selId, setSelId, '.sb-t tbody.og, .sb-tools, .sb-ask');
  const gone = r => r.status === 'deleted';
  const all = useMemo(() => [...(rets || [])].sort((a, b) => (gone(a) - gone(b)) || String(b.date || '').localeCompare(String(a.date || '')) || b.returnId - a.returnId), [rets]);
  const fyList = useMemo(() => fyCounts(all, r => r.date), [all]);
  const list = useMemo(() => {
    const w = q.toLowerCase().split(/\s+/).filter(Boolean);
    return all.filter(r => (!fySel.length || fySel.includes(fyOf(r.date)))
      && (!w.length || w.every(x => `${r.returnNo} ${r.orderNo} ${r.poNo || ''} ${r.customerName || ''} ${r.vendorName || ''} ${r.dcNo || ''} ${r.reason} ${(r.items || []).map(i => i.itemName).join(' ')}`.toLowerCase().includes(x))));
  }, [all, fySel, q]);
  const sel = list.find(r => r.returnId === selId) || null;
  const doDelete = async r => {
    if (!why.trim()) return;
    setBusy(true);
    try { await axios.delete(`/api/returns/${r.returnId}`, { params: { companyId, reason: why.trim() } }); setAskDel(null); setWhy(''); setSelId(null); setNote(`Deleted ${C.title} ${r.returnNo} — kept in the list (struck through), it no longer counts in stock.`); onChanged(); }
    catch (e) { setNote(e.response?.data?.error || 'Could not delete.'); }
    finally { setBusy(false); }
  };
  const cols = RCOLS(kind);

  return (
    <>
      {slot && createPortal(<>
        <FyFilter list={fyList} total={all.length} sel={fySel} setSel={setFySel} />
        <input className="sb-search" value={q} onChange={e => setQ(e.target.value)} placeholder={`Search ${C.title.toLowerCase()}, order, ${C.party.toLowerCase()}, product…`} aria-label="Search" />
        <div className="sb-tools">
          <span className="sb-picked">{sel ? <>Selected: <b>{sel.returnNo}</b></> : 'Click a note to select'}</span>
          <button type="button" className="sb-tbtn" disabled={!sel || gone(sel)} onClick={() => onEdit(sel)}><Svg name="settings" size={13} />Edit</button>
          <button type="button" className="sb-tbtn del" disabled={!sel || gone(sel)} onClick={() => { setWhy(''); setAskDel(sel); }}><Svg name="x" size={13} />Delete</button>
        </div>
      </>, slot)}
      {askDel && (
        <div className="sb-ask" role="alertdialog" aria-label="Confirm delete">
          <span><b>Delete {C.title} {askDel.returnNo}</b>? It stays in the list with your name. Reason:</span>
          <input value={why} onChange={e => setWhy(e.target.value)} placeholder="Why is it deleted?" style={{ height: 28, padding: '0 8px', border: '1px solid #C9D7DA', minWidth: 220 }} autoFocus />
          <button type="button" className="sb-abtn" onClick={() => setAskDel(null)} disabled={busy}>Keep</button>
          <button type="button" className="sb-abtn danger" onClick={() => doDelete(askDel)} disabled={busy || !why.trim()}>{busy ? 'Deleting…' : 'Yes, delete'}</button>
        </div>
      )}
      <div className="sb-kpi">
        <div className="sb-k"><small>{C.list}</small><b>{list.filter(r => !gone(r)).length}{list.some(gone) ? <span style={{ fontSize: 11, color: '#B42318', fontWeight: 600 }}> + {list.filter(gone).length} deleted</span> : null}</b></div>
        <div className="sb-k"><small>Qty {kind === 'client' ? 'returned by clients' : 'sent back to vendors'}</small><b>{num(list.filter(r => !gone(r)).reduce((s, r) => s + (r.items || []).reduce((t, i) => t + n(i.qty), 0), 0))}</b></div>
        <div className="sb-k"><small>Year</small><b style={{ fontSize: 13 }}>{fySel.length ? [...fySel].sort().reverse().map(fyLabel).join(', ') : 'All years'}</b></div>
      </div>
      <div className="sb-list">
        <table className="sb-t px">
          <colgroup>{cols.map(([h, w]) => <col key={h} style={{ width: w }} />)}</colgroup>
          <thead><tr>{cols.map(([h, , a]) => <th key={h} className={a || ''}>{h}</th>)}</tr></thead>
          {rets === null ? <tbody><tr><td colSpan={cols.length} className="sb-empty">Loading…</td></tr></tbody>
            : !list.length ? <tbody><tr><td colSpan={cols.length} className="sb-empty">{q ? `Nothing matches “${q}”.` : `No ${C.list.toLowerCase()} in this year.`}</td></tr></tbody> : null}
          {rets !== null && list.map(r => (
            <tbody key={r.returnId} className={`og${selId === r.returnId ? ' sel' : ''}${gone(r) ? ' gone' : ''}`} onClick={() => setSelId(r.returnId)} onDoubleClick={() => { setSelId(r.returnId); if (!gone(r)) onEdit(r); }}
              title={gone(r) ? `Deleted by ${r.deletedBy || '—'} on ${fdate(r.deletedAt)}${r.deleteReason ? ` — ${r.deleteReason}` : ''}` : 'Click to select · double-click to edit'}>
              <tr>
                <td className="nw">{fdate(r.date)}</td><td className="bno">{r.returnNo}</td>
                <td className="no">{kind === 'client' ? dash(r.orderNo) : dash(r.poNo)}</td><td className="cl">{kind === 'client' ? dash(r.customerName) : dash(r.vendorName)}</td>
                <td className="no">{kind === 'client' ? dash(r.dcNo) : dash(r.orderNo)}</td>
                <td>{(r.items || []).map((i, k) => <div key={k} className="gl">{i.itemName}</div>)}</td>
                <td className="r">{(r.items || []).map((i, k) => <div key={k} className="gl">{num(i.qty)}{i.unit ? <span className="mut"> {i.unit}</span> : null}</div>)}</td>
                <td>{dash(r.reason)}</td><td>{dash(r.location)}</td>
                <td><div>{dash(who(r))}</div>{r.updatedBy && <div className="rt-who">edited: {r.updatedBy}</div>}{gone(r) && <div className="rt-who">deleted: {r.deletedBy || '—'}</div>}</td>
              </tr>
            </tbody>
          ))}
        </table>
      </div>
    </>
  );
}
