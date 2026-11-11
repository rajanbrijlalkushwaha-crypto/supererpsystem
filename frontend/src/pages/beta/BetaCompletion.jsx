/* Beta — Completion Certificates (Sales Order → Completion Certificate), /api/completion-certs.
 * Create: pick the sales order → client, site, products, order value and the invoice / DC fill in; enter the work
 * done, start and completion dates and the performance. List: search, Print list, Print certificate, Edit, Delete. */
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
import { soItems } from './BetaClients';
import { printCompletion, printCompletionList, dmy, PERFORMANCE } from './BetaCertPrint';

const amt = v => (Number(v) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const today = () => new Date().toISOString().slice(0, 10);
const EXTRA_CSS = `
.ccx td { white-space:normal; overflow-wrap:anywhere; line-height:1.35; } .ccx td.d { white-space:nowrap; } .ccx .b { font-weight:700; } .ccx .sm { display:block; font-size:11px; color:#667085; }
.ccx tbody tr:hover td { background:#F0F7F8; }
.ccx tbody tr.sel td { background:#D4EBEE !important; } .ccx tbody tr.sel td:first-child { box-shadow:inset 3px 0 0 #03444f; }
.cc-it { width:100%; border-collapse:collapse; font-size:12.5px; }
.cc-it th { background:#F4F8F8; border:1px solid #DCE6E8; padding:6px 8px; text-align:left; font-weight:600; color:#344054; }
.cc-it td { border:1px solid #DCE6E8; padding:4px 6px; vertical-align:middle; }
.cc-it td.ck { width:34px; text-align:center; } .cc-it input[type=checkbox] { width:15px; height:15px; accent-color:#03444f; }
.cc-it tr.off td { color:#98A2B3; }
.cc-ta { width:100%; min-height:82px; padding:7px 9px; border:1px solid #C9D7DA; border-radius:4px; font:12.5px inherit; font-family:inherit; resize:vertical; }
`;

export default function BetaCompletion() {
  const navigate = useNavigate();
  const { search } = useLocation();
  const tab = new URLSearchParams(search).get('tab') === 'create' ? 'create' : 'list';
  const { selectedCompany } = useCompany() || {};
  const { user } = useAuth() || {};
  const companyId = selectedCompany?.companyId;
  const [certs, setCerts] = useState(null);
  const [orders, setOrders] = useState([]);
  const [bills, setBills] = useState([]);
  const [dcs, setDcs] = useState([]);
  const [reload, setReload] = useState(0);
  const [editing, setEditing] = useState(null);
  const [note, setNote] = useState(null);
  const [slot, setSlot] = useState(null);
  const canAdd = can(user, 'salesOrder', 'create');

  useEffect(() => {
    if (!companyId) return;
    axios.get('/api/completion-certs', { params: { companyId } }).then(r => setCerts(Array.isArray(r.data) ? r.data : [])).catch(() => setCerts([]));
  }, [companyId, reload]);
  useEffect(() => {
    if (!companyId) return;
    axios.get('/api/sales-orders', { params: { companyId } }).then(r => setOrders(Array.isArray(r.data) ? r.data : [])).catch(() => setOrders([]));
    axios.get('/api/bills', { params: { companyId, type: 'sales' } }).then(r => setBills(Array.isArray(r.data) ? r.data.filter(b => b && b.type !== 'purchase' && b.status !== 'deleted') : [])).catch(() => setBills([]));
    axios.get('/api/delivery-challans', { params: { companyId } }).then(r => setDcs(Array.isArray(r.data) ? r.data.filter(d => d && d.status !== 'deleted') : [])).catch(() => setDcs([]));
  }, [companyId]);

  const cur = editing ? 'create' : (tab === 'create' && canAdd ? 'create' : 'list');
  const go = k => { setEditing(null); navigate(`/beta/completion?tab=${k}`); };
  const tabs = [['list', 'Completion Certificates'], ...(canAdd || editing ? [['create', editing ? `Edit ${editing.certNo}` : 'Create Certificate']] : [])];

  return (
    <div className="sb">
      <style>{SALES_CSS + PX_CSS + EXTRA_CSS}</style>
      <div className="sb-tabs" role="tablist">
        {tabs.map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={cur === k} className={`sb-tab${cur === k ? ' on' : ''}`} onClick={() => go(k)}>
            {label}{k === 'list' && certs && <span className="n">{certs.length}</span>}
          </button>
        ))}
        <div className="sb-slot" ref={setSlot} />
      </div>
      {note && <div className="sb-note" role="status">{note.text}
        {note.cert && <button type="button" className="sb-abtn" style={{ marginLeft: 10 }} onClick={() => printCompletion({ cert: note.cert, company: selectedCompany, user })}>Print certificate</button>}
        <button type="button" onClick={() => setNote(null)} aria-label="Dismiss">×</button></div>}
      {cur === 'create'
        ? <div className="sb-body"><CertForm key={editing ? editing.certId : 'new'} companyId={companyId} edit={editing} orders={orders} bills={bills} dcs={dcs}
            onCancel={() => go('list')} onSaved={(text, cert) => { setReload(x => x + 1); setNote({ text, cert }); go('list'); }} /></div>
        : <CertList certs={certs} company={selectedCompany} user={user} slot={slot} companyId={companyId} setNote={setNote}
            onEdit={c => { setNote(null); setEditing(c); }} onChanged={() => setReload(x => x + 1)} />}
    </div>
  );
}

function CertList({ certs, company, user, slot, companyId, setNote, onEdit, onChanged }) {
  const [q, setQ] = useState('');
  const [selId, setSelId] = useState(null);
  const [askDel, setAskDel] = useState(null);
  const [busy, setBusy] = useState(false);
  useClearSel(askDel ? null : selId, setSelId, '.sb-t tbody tr, .sb-tools, .sb-ask, .cpv-ov');
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const list = useMemo(() => (certs || []).filter(c => !words.length
    || words.every(w => `${c.certNo} ${c.clientName} ${c.orderNo} ${c.clientPO} ${c.workTitle} ${c.invoiceNo} ${(c.items || []).map(i => i.description).join(' ')}`.toLowerCase().includes(w))),
  [certs, words.join(' ')]);   // eslint-disable-line react-hooks/exhaustive-deps
  const sel = list.find(c => c.certId === selId) || null;
  const canEdit = can(user, 'salesOrder', 'edit'), canDel = can(user, 'salesOrder', 'delete');
  const doDelete = async c => {
    setBusy(true);
    try { await axios.delete(`/api/completion-certs/${c.certId}`, { params: { companyId } }); setAskDel(null); setSelId(null); setNote({ text: `Deleted certificate ${c.certNo}.` }); onChanged(); }
    catch (e) { setNote({ text: e.response?.data?.error || 'Could not delete.' }); }
    finally { setBusy(false); }
  };
  return (
    <>
      {slot && createPortal(<>
        <input className="sb-search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search cert no, client, order, PO, work…" aria-label="Search certificates" />
        <button type="button" className="sb-tbtn" onClick={() => printCompletionList({ rows: list, company, user, filter: q ? `Search: ${q}` : 'All' })}><Svg name="file" size={13} />Print list</button>
        <div className="sb-tools">
          <span className="sb-picked">{sel ? <>Selected: <b>{sel.certNo}</b></> : 'Click a certificate to select'}</span>
          <button type="button" className="sb-tbtn" disabled={!sel} onClick={() => printCompletion({ cert: sel, company, user })}><Svg name="file" size={13} />Print</button>
          {canEdit && <button type="button" className="sb-tbtn" disabled={!sel} onClick={() => onEdit(sel)}><Svg name="settings" size={13} />Edit</button>}
          {canDel && <button type="button" className="sb-tbtn del" disabled={!sel} onClick={() => setAskDel(sel)}><Svg name="x" size={13} />Delete</button>}
        </div>
      </>, slot)}
      {askDel && (
        <div className="sb-ask" role="alertdialog" aria-label="Confirm delete">
          <span><b>Delete certificate {askDel.certNo}</b> ({askDel.clientName})? Its number is not given again.</span>
          <button type="button" className="sb-abtn" onClick={() => setAskDel(null)} disabled={busy}>Keep</button>
          <button type="button" className="sb-abtn danger" onClick={() => doDelete(askDel)} disabled={busy}>{busy ? 'Deleting…' : 'Yes, delete'}</button>
        </div>
      )}
      <div className="sb-list">
        <table className="sb-t px ccx">
          <colgroup>{[3, 11, 17, 10, 10, 20, 7, 7, 8, 7].map((w, i) => <col key={i} style={{ width: `${w}%` }} />)}</colgroup>
          <thead><tr><th className="r">Sr</th><th>Cert No. / Date</th><th>Client Name</th><th>Order ID</th><th>PO No.</th><th>Work / Supply</th><th>Started</th><th>Completed</th><th className="r">Order Value ₹</th><th>Performance</th></tr></thead>
          <tbody>
            {certs === null ? <tr><td colSpan={10} className="sb-empty">Loading…</td></tr>
              : !list.length ? <tr><td colSpan={10} className="sb-empty">{q ? 'Nothing matches.' : 'No completion certificate yet — click “Create Certificate”.'}</td></tr>
                : list.map((c, i) => (
                  <tr key={c.certId} className={selId === c.certId ? 'sel' : ''} onClick={() => setSelId(c.certId)} onDoubleClick={() => canEdit && onEdit(c)} style={{ cursor: 'pointer' }}>
                    <td className="r">{i + 1}</td>
                    <td><b className="mono">{c.certNo}</b><span className="sm">{dmy(c.certDate)}</span></td>
                    <td className="b">{c.clientName}</td>
                    <td className="mono">{String(c.orderNo || '').trim() || '—'}</td>
                    <td className="mono">{c.clientPO || '—'}</td>
                    <td>{c.workTitle || '—'}</td>
                    <td className="d">{dmy(c.startDate) || '—'}</td>
                    <td className="d">{dmy(c.completionDate) || '—'}</td>
                    <td className="r b d">{c.orderValue ? amt(c.orderValue) : '—'}</td>
                    <td>{c.performance || '—'}</td>
                  </tr>
                ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function CertForm({ companyId, edit, orders, bills, dcs, onSaved, onCancel }) {
  const e0 = edit || {};
  const [v, setV] = useState(() => ({
    certDate: e0.certDate || today(), orderId: e0.orderId ? String(e0.orderId) : '', clientAddress: e0.clientAddress || '',
    invoiceKey: e0.invoiceNo || '', dcKey: e0.dcNo || '', workTitle: e0.workTitle || '', workDetails: e0.workDetails || '',
    orderValue: e0.orderValue ? String(e0.orderValue) : '', startDate: e0.startDate || '', completionDate: e0.completionDate || today(),
    performance: e0.performance || 'Satisfactory', remarks: e0.remarks || '',
  }));
  const [lines, setLines] = useState(() => (e0.items || []).map(i => ({ on: true, description: i.description, qty: String(i.qty), unit: i.unit })));
  const [nextNo, setNextNo] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const so = orders.find(o => String(o.orderId) === v.orderId) || null;
  const soBills = bills.filter(b => so && String(b.orderId) === String(so.orderId));
  const soDcs = dcs.filter(d => so && String(d.linkedSalesOrderId) === String(so.orderId));
  const set = k => e => { const x = e.target.value; setV(o => ({ ...o, [k]: x })); setMsg(null); };

  useEffect(() => {
    if (edit || !companyId) return;
    axios.get('/api/completion-certs/next-no', { params: { companyId, date: v.certDate } }).then(r => setNextNo(r.data?.certNo || '')).catch(() => setNextNo(''));
  }, [edit, companyId, v.certDate]);

  const pickOrder = id => {
    const o = orders.find(x => String(x.orderId) === id);
    setV(p => {
      if (!o) return { ...p, orderId: id };
      const oDcs = dcs.filter(d => String(d.linkedSalesOrderId) === String(o.orderId)).sort((a, b) => String(b.dcDate || '').localeCompare(String(a.dcDate || '')));
      const bl = bills.filter(b => String(b.orderId) === String(o.orderId)).sort((a, b) => String(b.billDate || '').localeCompare(String(a.billDate || '')))[0];
      const first = soItems(o)[0];
      return { ...p, orderId: id,
        clientAddress: [o.shipToAddress || o.address, o.shipToCity || o.customerCity, o.shipToState || o.customerState, o.shipToPincode || o.customerPincode].filter(Boolean).join(', '),
        orderValue: o.subTotal ? String(Math.round(Number(o.subTotal) * 100) / 100) : '',
        workTitle: p.workTitle || (first ? `Supply${soItems(o).length > 1 ? ' and installation' : ''} of ${first.name}${soItems(o).length > 1 ? ' and other items' : ''}` : 'Supply of material'),
        startDate: o.orderDate || p.startDate, completionDate: oDcs[0]?.dcDate || bl?.billDate || p.completionDate,
        dcKey: oDcs[0] ? (oDcs[0].dcNo || oDcs[0].dcId) : '', invoiceKey: bl ? (bl.billNo || bl.billId) : '' };
    });
    setLines(o ? soItems(o).map(it => ({ on: true, description: it.name, qty: String(it.qty), unit: it.unit || 'NOS' })) : []);
    setMsg(null);
  };
  const setLine = (i, k, x) => setLines(ls => ls.map((l, j) => (j === i ? { ...l, [k]: x } : l)));
  const openOrders = useMemo(() => orders.filter(o => !['cancelled', 'rejected', 'draft'].includes(o.status) || String(o.orderId) === v.orderId)
    .sort((a, b) => String(b.orderDate || '').localeCompare(String(a.orderDate || ''))), [orders, v.orderId]);

  const save = async () => {
    if (!so && !edit) return setMsg({ k: 'err', t: 'Pick the sales order.' });
    if (!v.workTitle.trim()) return setMsg({ k: 'err', t: 'Enter the work / supply completed.' });
    if (!v.completionDate) return setMsg({ k: 'err', t: 'Enter the completion date.' });
    if (v.startDate && v.completionDate < v.startDate) return setMsg({ k: 'err', t: 'The completion date is before the start date.' });
    const items = lines.filter(l => l.on && l.description.trim()).map(l => ({ description: l.description.trim(), qty: l.qty, unit: l.unit }));
    const bl = soBills.find(b => (b.billNo || b.billId) === v.invoiceKey), dc = soDcs.find(d => (d.dcNo || d.dcId) === v.dcKey);
    setBusy(true);
    const payload = {
      companyId, certDate: v.certDate,
      orderId: so ? so.orderId : e0.orderId, orderNo: so ? String(so.orderNo || '').trim() : e0.orderNo, orderDate: so ? so.orderDate : e0.orderDate,
      clientPO: so ? so.customerPO : e0.clientPO, clientPoDate: so ? so.poDate : e0.clientPoDate, clientId: so ? (so.customerCode || so.clientId) : e0.clientId,
      clientName: so ? (so.customerName || so.party) : e0.clientName, clientAddress: v.clientAddress,
      workTitle: v.workTitle.trim(), workDetails: v.workDetails, orderValue: v.orderValue,
      invoiceNo: v.invoiceKey, invoiceDate: bl ? bl.billDate : (v.invoiceKey === e0.invoiceNo ? e0.invoiceDate : ''),
      dcNo: v.dcKey, dcDate: dc ? dc.dcDate : (v.dcKey === e0.dcNo ? e0.dcDate : ''),
      startDate: v.startDate, completionDate: v.completionDate, performance: v.performance, items, remarks: v.remarks,
    };
    try {
      const r = edit ? await axios.put(`/api/completion-certs/${edit.certId}`, payload, { params: { companyId } }) : await axios.post('/api/completion-certs', payload, { params: { companyId } });
      onSaved(`${edit ? 'Updated' : 'Saved'} completion certificate ${r.data?.certNo || ''} for ${payload.clientName}.`, r.data);
    } catch (e) { setMsg({ k: 'err', t: e.response?.data?.error || 'Could not save the certificate.' }); }
    finally { setBusy(false); }
  };

  return (
    <div className="sf">
      <div className="sf-hero"><span className="ic"><Svg name="okCircle" size={15} /></span><h1>{edit ? `Edit completion certificate ${edit.certNo}` : 'Create Completion Certificate'}</h1><span className="grow" /></div>
      <div className="sf-2" style={{ marginTop: 10 }}>
        <div className="sf-card">
          <div className="sf-ch"><span className="ico"><Svg name="file" size={13} /></span><b>Order &amp; client</b></div>
          <table className="sf-kv"><tbody>
            <tr><th>Certificate No.</th><td><input value={edit ? edit.certNo : (nextNo || 'Given on save')} readOnly className="mono" /></td></tr>
            <tr><th>Date <i>*</i></th><td><input type="date" value={v.certDate} onChange={set('certDate')} /></td></tr>
            <tr><th>Sales Order <i>*</i></th><td><select value={v.orderId} onChange={e => pickOrder(e.target.value)} autoFocus={!edit}>
              <option value="">{edit && !so ? `${e0.orderNo || ''} · ${e0.clientName}` : 'Choose the order…'}</option>
              {openOrders.map(o => <option key={o.orderId} value={String(o.orderId)}>{String(o.orderNo || '').trim()} · {o.customerName || o.party}{o.customerPO ? ` · PO ${o.customerPO}` : ''}</option>)}
            </select></td></tr>
            <tr><th>Client</th><td>{so ? <b>{so.customerName || so.party}</b> : edit ? <b>{e0.clientName}</b> : '—'}</td></tr>
            <tr><th>Client PO</th><td>{so ? (so.customerPO || '—') : (e0.clientPO || '—')}</td></tr>
            <tr><th>Site / address</th><td><input value={v.clientAddress} onChange={set('clientAddress')} placeholder="Where the work was done / material delivered" /></td></tr>
            <tr><th>Tax invoice</th><td><select value={v.invoiceKey} onChange={set('invoiceKey')}>
              <option value="">— none —</option>
              {[...new Set([...soBills.map(b => b.billNo || b.billId), ...(e0.invoiceNo ? [e0.invoiceNo] : [])])].map(k => <option key={k} value={k}>{k}</option>)}
            </select></td></tr>
            <tr><th>Delivery challan</th><td><select value={v.dcKey} onChange={set('dcKey')}>
              <option value="">— none —</option>
              {[...new Set([...soDcs.map(d => d.dcNo || d.dcId), ...(e0.dcNo ? [e0.dcNo] : [])])].map(k => <option key={k} value={k}>{k}</option>)}
            </select></td></tr>
          </tbody></table>
        </div>
        <div className="sf-card">
          <div className="sf-ch"><span className="ico"><Svg name="okCircle" size={13} /></span><b>Work completed</b></div>
          <table className="sf-kv"><tbody>
            <tr><th>Work / supply <i>*</i></th><td><input value={v.workTitle} onChange={set('workTitle')} placeholder="e.g. Supply and installation of 2 nos. portable cabins" /></td></tr>
            <tr><th>Work started</th><td><input type="date" value={v.startDate} onChange={set('startDate')} /></td></tr>
            <tr><th>Completed on <i>*</i></th><td><input type="date" value={v.completionDate} onChange={set('completionDate')} /></td></tr>
            <tr><th>Performance</th><td><select value={v.performance} onChange={set('performance')}>{PERFORMANCE.map(p => <option key={p} value={p}>{p}</option>)}</select></td></tr>
            <tr><th>Order value ₹</th><td><input value={v.orderValue} onChange={e => { const x = e.target.value.replace(/[^\d.]/g, ''); setV(o => ({ ...o, orderValue: x })); }} className="num" inputMode="decimal" placeholder="Before GST" /></td></tr>
            <tr><th>Remarks</th><td><input value={v.remarks} onChange={set('remarks')} placeholder="Optional — printed on the certificate" /></td></tr>
          </tbody></table>
        </div>
      </div>
      <div className="sf-card">
        <div className="sf-ch"><span className="ico"><Svg name="box" size={13} /></span><b>Work / material completed</b><span className="grow" />
          <button type="button" className="sf-lnk" onClick={() => setLines(ls => [...ls, { on: true, description: '', qty: '1', unit: 'NOS' }])}>+ Add line</button></div>
        {!lines.length ? <div className="sf-empty">{so || edit ? 'No lines — add a line, or leave it empty.' : 'Pick the sales order to see its products.'}</div> : (
          <table className="cc-it"><thead><tr><th /><th>Description</th><th style={{ width: 110 }}>Qty</th><th style={{ width: 110 }}>Unit</th></tr></thead>
            <tbody>{lines.map((l, i) => (
              <tr key={i} className={l.on ? '' : 'off'}>
                <td className="ck"><input type="checkbox" checked={l.on} onChange={e => setLine(i, 'on', e.target.checked)} aria-label={`Include ${l.description}`} /></td>
                <td><input value={l.description} onChange={e => setLine(i, 'description', e.target.value)} disabled={!l.on} aria-label="Description" /></td>
                <td><input value={l.qty} onChange={e => setLine(i, 'qty', e.target.value.replace(/[^\d.]/g, ''))} disabled={!l.on} className="num" inputMode="decimal" aria-label="Qty" /></td>
                <td><input value={l.unit} onChange={e => setLine(i, 'unit', e.target.value)} disabled={!l.on} aria-label="Unit" /></td>
              </tr>
            ))}</tbody></table>
        )}
      </div>
      <div className="sf-card"><div className="sf-ch"><b>More details (optional — printed on the certificate)</b></div>
        <div style={{ padding: 8 }}><textarea className="cc-ta" value={v.workDetails} onChange={set('workDetails')} rows={4} placeholder="e.g. The cabins were installed at site, tested and handed over in good condition." aria-label="More details" /></div></div>
      {msg && <div className={`sf-msg ${msg.k}`} role="status">{msg.t}</div>}
      <div className="sf-bar">
        <div className="info">{lines.filter(l => l.on).length} line(s) · completed {dmy(v.completionDate) || '—'} · {v.performance}</div>
        <button type="button" className="sf-b ghost" onClick={onCancel} disabled={busy}>Cancel</button>
        <button type="button" className="sf-b pri" onClick={save} disabled={busy}>{busy ? 'Saving…' : edit ? 'Update' : 'Save'}</button>
      </div>
    </div>
  );
}
