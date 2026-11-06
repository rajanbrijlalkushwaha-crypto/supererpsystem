/* Beta — Warranty Certificates (Sales Order → Warranty Certificate), /api/warranty-certs.
 * Create: pick the sales order → client, products and the order's warranty period fill in; tick the products,
 * add serial nos, the invoice / DC it went on, and the period — the end date is worked out.
 * List: search + status, Print list, Print certificate, Edit, Delete. */
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
import { soItems, fmtQty } from './BetaClients';
import { printWarranty, printWarrantyList, wcState, dmy } from './BetaCertPrint';

const PERIODS = [6, 12, 18, 24, 36, 60];
const DEF_COVER = `• Manufacturing defects in material and workmanship are repaired or the part is replaced free of cost.
• Service is given at site within a reasonable time after the complaint is received in writing.
• Parts replaced under warranty carry warranty only for the rest of the original period.`;
const DEF_EXCL = `• Damage from misuse, accident, fire, flood, lightning, wrong electrical supply or wrong handling.
• Changes, repairs or shifting done by anyone other than our team.
• Normal wear and tear, paint / finish, glass, bulbs, consumables and bought-out items (covered by their makers' warranty).
• Loss due to stoppage of use; our liability is limited to the repair or replacement of the product.`;
const PILL = { active: ['#ECFDF3', '#067647'], expiring: ['#FFFAEB', '#B54708'], expired: ['#F2F4F7', '#475467'], pending: ['#EFF8FF', '#175CD3'] };
const STATES = [['', 'All'], ['active', 'In warranty'], ['expiring', 'Ending ≤ 30 days'], ['expired', 'Expired'], ['pending', 'Starts later']];
const EXTRA_CSS = `
.wcx td { white-space:nowrap; overflow:hidden; text-overflow:ellipsis; } .wcx .b { font-weight:700; } .wcx .sm { display:block; font-size:11px; color:#667085; }
.wc-pill { display:inline-block; padding:2px 8px; border-radius:99px; font-size:11px; font-weight:700; }
.wc-it { width:100%; border-collapse:collapse; font-size:12.5px; }
.wc-it th { background:#F4F8F8; border:1px solid #DCE6E8; padding:6px 8px; text-align:left; font-weight:600; color:#344054; }
.wc-it td { border:1px solid #DCE6E8; padding:4px 6px; vertical-align:middle; }
.wc-it td.ck { width:34px; text-align:center; } .wc-it input[type=checkbox] { width:15px; height:15px; accent-color:#03444f; }
.wc-it tr.off td { color:#98A2B3; }
.wc-ta { width:100%; min-height:82px; padding:7px 9px; border:1px solid #C9D7DA; border-radius:4px; font:12.5px inherit; font-family:inherit; resize:vertical; }
`;
/* end date = start + months − 1 day */
const endOf = (start, months) => {
  const x = start ? new Date(start) : null; if (!x || isNaN(x) || !months) return '';
  const e = new Date(x.getFullYear(), x.getMonth() + Number(months), x.getDate() - 1);
  return `${e.getFullYear()}-${String(e.getMonth() + 1).padStart(2, '0')}-${String(e.getDate()).padStart(2, '0')}`;
};
const today = () => new Date().toISOString().slice(0, 10);
/* "12 MONTH", "2 years" → months */
const monthsOf = t => { const m = String(t || '').match(/(\d+(?:\.\d+)?)\s*(y|year|yr)?/i); if (!m) return 0; return Math.round(Number(m[1]) * (m[2] ? 12 : 1)); };

export default function BetaWarranty() {
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
    axios.get('/api/warranty-certs', { params: { companyId } }).then(r => setCerts(Array.isArray(r.data) ? r.data : [])).catch(() => setCerts([]));
  }, [companyId, reload]);
  useEffect(() => {
    if (!companyId) return;
    axios.get('/api/sales-orders', { params: { companyId } }).then(r => setOrders(Array.isArray(r.data) ? r.data : [])).catch(() => setOrders([]));
    axios.get('/api/bills', { params: { companyId, type: 'sales' } }).then(r => setBills(Array.isArray(r.data) ? r.data.filter(b => b && b.type !== 'purchase' && b.status !== 'deleted') : [])).catch(() => setBills([]));
    axios.get('/api/delivery-challans', { params: { companyId } }).then(r => setDcs(Array.isArray(r.data) ? r.data.filter(d => d && d.status !== 'deleted') : [])).catch(() => setDcs([]));
  }, [companyId]);

  const cur = editing ? 'create' : (tab === 'create' && canAdd ? 'create' : 'list');
  const go = k => { setEditing(null); navigate(`/beta/warranty?tab=${k}`); };
  const tabs = [['list', 'Warranty Certificates'], ...(canAdd || editing ? [['create', editing ? `Edit ${editing.certNo}` : 'Create Certificate']] : [])];

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
        {note.cert && <button type="button" className="sb-abtn" style={{ marginLeft: 10 }} onClick={() => printWarranty({ cert: note.cert, company: selectedCompany, user })}>Print certificate</button>}
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
  const [st, setSt] = useState('');
  const [selId, setSelId] = useState(null);
  const [askDel, setAskDel] = useState(null);
  const [busy, setBusy] = useState(false);
  useClearSel(askDel ? null : selId, setSelId, '.sb-t tbody tr, .sb-tools, .sb-ask');
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const list = useMemo(() => (certs || []).filter(c => (!st || wcState(c).k === st)
    && (!words.length || words.every(w => `${c.certNo} ${c.clientName} ${c.orderNo} ${c.clientPO} ${c.invoiceNo} ${(c.items || []).map(i => `${i.description} ${i.serialNo}`).join(' ')}`.toLowerCase().includes(w)))),
  [certs, st, words.join(' ')]);   // eslint-disable-line react-hooks/exhaustive-deps
  const sel = list.find(c => c.certId === selId) || null;
  const canEdit = can(user, 'salesOrder', 'edit'), canDel = can(user, 'salesOrder', 'delete');
  const doDelete = async c => {
    setBusy(true);
    try { await axios.delete(`/api/warranty-certs/${c.certId}`, { params: { companyId } }); setAskDel(null); setSelId(null); setNote({ text: `Deleted certificate ${c.certNo}.` }); onChanged(); }
    catch (e) { setNote({ text: e.response?.data?.error || 'Could not delete.' }); }
    finally { setBusy(false); }
  };
  return (
    <>
      {slot && createPortal(<>
        <input className="sb-search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search cert no, client, order, product, serial…" aria-label="Search certificates" />
        <select className="sb-search" style={{ width: 160 }} value={st} onChange={e => setSt(e.target.value)} aria-label="Status">{STATES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        <button type="button" className="sb-tbtn" onClick={() => printWarrantyList({ rows: list, company, user, filter: (STATES.find(x => x[0] === st) || [])[1] })}><Svg name="file" size={13} />Print list</button>
        <div className="sb-tools">
          <span className="sb-picked">{sel ? <>Selected: <b>{sel.certNo}</b></> : 'Click a certificate to select'}</span>
          <button type="button" className="sb-tbtn" disabled={!sel} onClick={() => printWarranty({ cert: sel, company, user })}><Svg name="file" size={13} />Print</button>
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
        <table className="sb-t px wcx">
          <colgroup><col style={{ width: '4%' }} /><col style={{ width: '12%' }} /><col style={{ width: '20%' }} /><col style={{ width: '11%' }} /><col style={{ width: '23%' }} /><col style={{ width: '6%' }} /><col style={{ width: '8%' }} /><col style={{ width: '8%' }} /><col style={{ width: '8%' }} /></colgroup>
          <thead><tr><th className="r">#</th><th>Cert No. / Date</th><th>Client</th><th>Order No.</th><th>Products</th><th className="r">Months</th><th>From</th><th>Valid up to</th><th>Status</th></tr></thead>
          <tbody>
            {certs === null ? <tr><td colSpan={9} className="sb-empty">Loading…</td></tr>
              : !list.length ? <tr><td colSpan={9} className="sb-empty">{q || st ? 'Nothing matches.' : 'No warranty certificate yet — click “Create Certificate”.'}</td></tr>
                : list.map((c, i) => {
                  const s = wcState(c), [bg, fg] = PILL[s.k] || PILL.active;
                  const prods = (c.items || []).map(it => `${it.description} × ${fmtQty(Number(it.qty) || 0)}`).join(', ');
                  return (
                    <tr key={c.certId} className={selId === c.certId ? 'sel' : ''} onClick={() => setSelId(c.certId)} onDoubleClick={() => canEdit && onEdit(c)} style={{ cursor: 'pointer' }}>
                      <td className="r">{i + 1}</td>
                      <td><b className="mono">{c.certNo}</b><span className="sm">{dmy(c.certDate)}</span></td>
                      <td title={c.clientName}><b>{c.clientName}</b>{c.clientPO && <span className="sm">PO {c.clientPO}</span>}</td>
                      <td className="mono">{c.orderNo || '—'}</td>
                      <td title={prods}>{prods || '—'}</td>
                      <td className="r">{c.months || '—'}</td>
                      <td>{dmy(c.startDate)}</td><td>{dmy(c.endDate)}</td>
                      <td><span className="wc-pill" style={{ background: bg, color: fg }}>{s.label}</span></td>
                    </tr>
                  );
                })}
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
    invoiceKey: e0.invoiceNo || '', dcKey: e0.dcNo || '', installDate: e0.installDate || '',
    months: e0.months ? String(e0.months) : '12', startDate: e0.startDate || '', endDate: e0.endDate || '', endTyped: !!edit,
    coverage: edit ? (e0.coverage || '') : DEF_COVER, exclusions: edit ? (e0.exclusions || '') : DEF_EXCL, remarks: e0.remarks || '',
  }));
  // product lines: from the saved certificate, or the order's products (all ticked)
  const [lines, setLines] = useState(() => (e0.items || []).map(i => ({ on: true, description: i.description, qty: String(i.qty), unit: i.unit, serialNo: i.serialNo || '' })));
  const [nextNo, setNextNo] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const so = orders.find(o => String(o.orderId) === v.orderId) || null;
  const soBills = bills.filter(b => so && String(b.orderId) === String(so.orderId));
  const soDcs = dcs.filter(d => so && String(d.linkedSalesOrderId) === String(so.orderId));
  const set = k => e => { const x = e.target.value; setV(o => ({ ...o, [k]: x })); setMsg(null); };

  useEffect(() => {
    if (edit || !companyId) return;
    axios.get('/api/warranty-certs/next-no', { params: { companyId, date: v.certDate } }).then(r => setNextNo(r.data?.certNo || '')).catch(() => setNextNo(''));
  }, [edit, companyId, v.certDate]);
  // end date follows start + months until it is typed by hand
  useEffect(() => { if (!v.endTyped) setV(o => ({ ...o, endDate: endOf(o.startDate, o.months) })); }, [v.startDate, v.months, v.endTyped]);

  const pickOrder = id => {
    const o = orders.find(x => String(x.orderId) === id);
    setV(p => {
      if (!o) return { ...p, orderId: id };
      const w = o.warranty || {};
      const dc = dcs.filter(d => String(d.linkedSalesOrderId) === String(o.orderId)).sort((a, b) => String(b.dcDate || '').localeCompare(String(a.dcDate || '')))[0];
      const bl = bills.filter(b => String(b.orderId) === String(o.orderId)).sort((a, b) => String(b.billDate || '').localeCompare(String(a.billDate || '')))[0];
      const m = monthsOf(w.period) || Number(p.months) || 12;
      return { ...p, orderId: id, clientAddress: [o.shipToAddress || o.address, o.shipToCity || o.customerCity, o.shipToState || o.customerState, o.shipToPincode || o.customerPincode].filter(Boolean).join(', '),
        months: String(m), startDate: w.startDate || dc?.dcDate || bl?.billDate || today(), endTyped: false,
        dcKey: dc ? (dc.dcNo || dc.dcId) : '', invoiceKey: bl ? (bl.billNo || bl.billId) : '' };
    });
    setLines(o ? soItems(o).map(it => ({ on: true, description: it.name, qty: String(it.qty), unit: it.unit || 'NOS', serialNo: '' })) : []);
    setMsg(null);
  };
  const setLine = (i, k, x) => setLines(ls => ls.map((l, j) => (j === i ? { ...l, [k]: x } : l)));
  const openOrders = useMemo(() => orders.filter(o => !['cancelled', 'rejected', 'draft'].includes(o.status) || String(o.orderId) === v.orderId)
    .sort((a, b) => String(b.orderDate || '').localeCompare(String(a.orderDate || ''))), [orders, v.orderId]);

  const save = async () => {
    if (!so && !edit) return setMsg({ k: 'err', t: 'Pick the sales order.' });
    const items = lines.filter(l => l.on && l.description.trim()).map(l => ({ description: l.description.trim(), qty: l.qty, unit: l.unit, serialNo: l.serialNo }));
    if (!items.length) return setMsg({ k: 'err', t: 'Tick at least one product.' });
    if (!v.startDate || !v.endDate) return setMsg({ k: 'err', t: 'Enter the warranty start and end date.' });
    const bl = soBills.find(b => (b.billNo || b.billId) === v.invoiceKey), dc = soDcs.find(d => (d.dcNo || d.dcId) === v.dcKey);
    setBusy(true);
    const payload = {
      companyId, certDate: v.certDate,
      orderId: so ? so.orderId : e0.orderId, orderNo: so ? so.orderNo : e0.orderNo, orderDate: so ? so.orderDate : e0.orderDate,
      clientPO: so ? so.customerPO : e0.clientPO, clientPoDate: so ? so.poDate : e0.clientPoDate, clientId: so ? (so.customerCode || so.clientId) : e0.clientId,
      clientName: so ? (so.customerName || so.party) : e0.clientName, clientAddress: v.clientAddress,
      invoiceNo: v.invoiceKey, invoiceDate: bl ? bl.billDate : (v.invoiceKey === e0.invoiceNo ? e0.invoiceDate : ''),
      dcNo: v.dcKey, dcDate: dc ? dc.dcDate : (v.dcKey === e0.dcNo ? e0.dcDate : ''), installDate: v.installDate,
      items, months: v.months, startDate: v.startDate, endDate: v.endDate, coverage: v.coverage, exclusions: v.exclusions, remarks: v.remarks,
    };
    try {
      const r = edit ? await axios.put(`/api/warranty-certs/${edit.certId}`, payload, { params: { companyId } }) : await axios.post('/api/warranty-certs', payload, { params: { companyId } });
      onSaved(`${edit ? 'Updated' : 'Saved'} warranty certificate ${r.data?.certNo || ''} for ${payload.clientName}.`, r.data);
    } catch (e) { setMsg({ k: 'err', t: e.response?.data?.error || 'Could not save the certificate.' }); }
    finally { setBusy(false); }
  };

  return (
    <div className="sf">
      <div className="sf-hero"><span className="ic"><Svg name="badge" size={15} /></span><h1>{edit ? `Edit warranty certificate ${edit.certNo}` : 'Create Warranty Certificate'}</h1><span className="grow" /></div>
      <div className="sf-2" style={{ marginTop: 10 }}>
        <div className="sf-card">
          <div className="sf-ch"><span className="ico"><Svg name="file" size={13} /></span><b>Order &amp; client</b></div>
          <table className="sf-kv"><tbody>
            <tr><th>Certificate No.</th><td><input value={edit ? edit.certNo : (nextNo || 'Given on save')} readOnly className="mono" /></td></tr>
            <tr><th>Date <i>*</i></th><td><input type="date" value={v.certDate} onChange={set('certDate')} /></td></tr>
            <tr><th>Sales Order <i>*</i></th><td><select value={v.orderId} onChange={e => pickOrder(e.target.value)} autoFocus={!edit}>
              <option value="">{edit && !so ? `${e0.orderNo || ''} · ${e0.clientName}` : 'Choose the order…'}</option>
              {openOrders.map(o => <option key={o.orderId} value={String(o.orderId)}>{o.orderNo} · {o.customerName || o.party}{o.customerPO ? ` · PO ${o.customerPO}` : ''}</option>)}
            </select></td></tr>
            <tr><th>Client</th><td>{so ? <b>{so.customerName || so.party}</b> : edit ? <b>{e0.clientName}</b> : '—'}</td></tr>
            <tr><th>Site / address</th><td><input value={v.clientAddress} onChange={set('clientAddress')} placeholder="Where the product is installed" /></td></tr>
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
          <div className="sf-ch"><span className="ico"><Svg name="clock" size={13} /></span><b>Warranty period</b></div>
          <table className="sf-kv"><tbody>
            <tr><th>Installed on</th><td><input type="date" value={v.installDate} onChange={e => { const x = e.target.value; setV(o => ({ ...o, installDate: x, startDate: x || o.startDate })); }} />
              <div style={{ fontSize: 11, color: '#667085', marginTop: 3 }}>Optional — the warranty starts from this date</div></td></tr>
            <tr><th>Period <i>*</i></th><td><select value={v.months} onChange={e => setV(o => ({ ...o, months: e.target.value, endTyped: false }))}>
              {[...new Set([...PERIODS, Number(v.months) || 12])].sort((a, b) => a - b).map(m => <option key={m} value={String(m)}>{m % 12 === 0 ? `${m / 12} year${m / 12 === 1 ? '' : 's'}` : `${m} months`} ({m} months)</option>)}
            </select></td></tr>
            <tr><th>From <i>*</i></th><td><input type="date" value={v.startDate} onChange={e => { const x = e.target.value; setV(o => ({ ...o, startDate: x, endTyped: false })); }} /></td></tr>
            <tr><th>Valid up to <i>*</i></th><td><input type="date" value={v.endDate} onChange={e => { const x = e.target.value; setV(o => ({ ...o, endDate: x, endTyped: true })); }} />
              <div style={{ fontSize: 11, color: '#667085', marginTop: 3 }}>{v.endTyped ? 'Typed by hand' : 'Worked out from the start date and the period'}</div></td></tr>
            <tr><th>Remarks</th><td><input value={v.remarks} onChange={set('remarks')} placeholder="Optional — printed on the certificate" /></td></tr>
          </tbody></table>
        </div>
      </div>
      <div className="sf-card">
        <div className="sf-ch"><span className="ico"><Svg name="box" size={13} /></span><b>Products under warranty</b><span className="grow" />
          <button type="button" className="sf-lnk" onClick={() => setLines(ls => [...ls, { on: true, description: '', qty: '1', unit: 'NOS', serialNo: '' }])}>+ Add line</button></div>
        {!lines.length ? <div className="sf-empty">{so || edit ? 'This order has no products — add a line.' : 'Pick the sales order to see its products.'}</div> : (
          <table className="wc-it"><thead><tr><th /><th>Product</th><th style={{ width: 90 }}>Qty</th><th style={{ width: 90 }}>Unit</th><th style={{ width: '32%' }}>Serial / identification no.</th></tr></thead>
            <tbody>{lines.map((l, i) => (
              <tr key={i} className={l.on ? '' : 'off'}>
                <td className="ck"><input type="checkbox" checked={l.on} onChange={e => setLine(i, 'on', e.target.checked)} aria-label={`Include ${l.description}`} /></td>
                <td><input value={l.description} onChange={e => setLine(i, 'description', e.target.value)} disabled={!l.on} aria-label="Product" /></td>
                <td><input value={l.qty} onChange={e => setLine(i, 'qty', e.target.value.replace(/[^\d.]/g, ''))} disabled={!l.on} className="num" inputMode="decimal" aria-label="Qty" /></td>
                <td><input value={l.unit} onChange={e => setLine(i, 'unit', e.target.value)} disabled={!l.on} aria-label="Unit" /></td>
                <td><input value={l.serialNo} onChange={e => setLine(i, 'serialNo', e.target.value)} disabled={!l.on} placeholder="e.g. EPS-CAB-0412, 0413" aria-label="Serial no" /></td>
              </tr>
            ))}</tbody></table>
        )}
      </div>
      <div className="sf-2">
        <div className="sf-card"><div className="sf-ch"><b>Warranty covers</b></div><div style={{ padding: 8 }}><textarea className="wc-ta" value={v.coverage} onChange={set('coverage')} rows={5} aria-label="Warranty covers" /></div></div>
        <div className="sf-card"><div className="sf-ch"><b>Not covered</b></div><div style={{ padding: 8 }}><textarea className="wc-ta" value={v.exclusions} onChange={set('exclusions')} rows={5} aria-label="Not covered" /></div></div>
      </div>
      {msg && <div className={`sf-msg ${msg.k}`} role="status">{msg.t}</div>}
      <div className="sf-bar">
        <div className="info">{lines.filter(l => l.on).length} product line(s) · {v.months} months · {dmy(v.startDate) || '—'} to {dmy(v.endDate) || '—'}</div>
        <button type="button" className="sf-b ghost" onClick={onCancel} disabled={busy}>Cancel</button>
        <button type="button" className="sf-b pri" onClick={save} disabled={busy}>{busy ? 'Saving…' : edit ? 'Update' : 'Save'}</button>
      </div>
    </div>
  );
}
