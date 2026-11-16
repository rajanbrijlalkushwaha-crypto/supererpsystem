/* Beta — material that comes back / goes back. One screen, two kinds:
 *   kind 'client'  Return Note (Sales Order menu)        — the client sends material back against a sales order (stock IN)
 *   kind 'vendor'  Return to Vendor (Purchase Order menu) — we send material back to the vendor against a PO (stock OUT)
 * Tabs: Create | List (?tab=…). Saved to /api/returns. Every note keeps who made / edited / deleted it and when;
 * a delete only marks it deleted (struck through in the list, does not count in stock). */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useCompany } from '../../context/CompanyContext';
import { useAuth } from '../../context/AuthContext';
import { Svg } from '../../components/ui/Icon';
import { CSS as SALES_CSS, fyOf, FyFilter, fyCounts, useClearSel, fyLabel } from './BetaSales';
import { num, fdate, dash } from './BetaSalesBill';
import { n, r3, today, key, poLines, loadGrns, ownerIdx, grnQtyOf } from './BetaPurchaseLib';
import { ListPicker, PX_CSS } from './BetaPurchaseParts';
import { VENDOR_PREFIX } from './BetaStock';
import { DC_CSS, EwayProgress, EwayCaptcha, HelperBox, startHelperOnThisPC, waitHelperOnline } from './BetaDC';
import { ewayJsonOfReturns, downloadJson, RETURN_SUB_TYPES, returnSubOf, ewayActive } from './BetaEwayJson';
import { printReturn, printReturnPortal, printReturnWithPortal, uploadReturnPdf } from './ReturnPrint';

const CFG = {
  client: { path: '/beta/return-note', title: 'Return Note', create: 'Create Return Note', list: 'Return Notes', party: 'Client', doc: 'Sales Order',
    reasons: ['Damaged in transit', 'Defective', 'Rejected by client', 'Excess supplied', 'Wrong item', 'Other'] },
  vendor: { path: '/beta/vendor-return', title: 'Return to Vendor', create: 'Create Return to Vendor', list: 'Returns to Vendor', party: 'Vendor', doc: 'Purchase Order',
    reasons: ['Defective / rejected', 'Excess received', 'Wrong item', 'For repair / rework', 'Other'] },
};
const EXTRA_CSS = `.gl { line-height:1.35; } .gl + .gl { margin-top:3px; } .sb-t tbody.og.gone td { color:#98A2B3; text-decoration:line-through; } .rt-who { font-size:11px; color:#667085; }
.rt-pk { max-width:1180px !important; }
.rt-who-tabs { display:flex; gap:4px; margin-right:10px; } .rt-who-tabs button { height:30px; padding:0 12px; border:1px solid #B9D0D3; background:#fff; cursor:pointer; font:600 12px inherit; color:#344054; }
.rt-who-tabs button.on { background:#03444f; color:#fff; border-color:#03444f; }
.rt-pr { cursor:pointer; } .rt-pr:hover td { background:#F0F7F7 !important; } .rt-pr td { border-bottom:1px solid #EDF2F3; }
.rt-pr tr:first-child td { border-top:2px solid #D4E3E5; }
.rt-dcs { display:flex; flex-wrap:wrap; gap:8px; padding:10px; }
.rt-dc { display:flex; align-items:flex-start; gap:8px; padding:8px 10px; border:1px solid #C9D7DA; background:#fff; cursor:pointer; min-width:240px; max-width:420px; }
.rt-dc.on { border-color:#03444f; background:#F0F7F7; } .rt-dc input { margin-top:2px; } .rt-dc small { display:block; color:#667085; font-size:11.5px; margin-top:2px; }
.rt-direct { display:flex; align-items:flex-start; gap:10px; padding:10px 12px; cursor:pointer; } .rt-direct small { display:block; color:#667085; font-size:12px; }
.sf .rt-dc input[type=checkbox], .sf .rt-direct input[type=checkbox] { width:16px !important; height:16px !important; min-height:0 !important; flex:none; margin-top:2px; padding:0; box-shadow:none; accent-color:#03444f; }
.rt-dc > span, .rt-direct > span { flex:1; min-width:0; text-align:left; }
.sf-pt td.rt-pcell { vertical-align:top; background:#FAFCFC; }
.sf-pt tr.rt-pfirst > td { border-top:2px solid #C9D7DA; }`;
const who = r => (r.createdBy && typeof r.createdBy === 'object' ? r.createdBy.name || r.createdBy.username : r.createdBy) || '';

export default function BetaReturns({ kind }) {
  const C = CFG[kind];
  const navigate = useNavigate();
  const { search } = useLocation();
  const urlTab = new URLSearchParams(search).get('tab') === 'create' ? 'create' : 'list';
  const { selectedCompany } = useCompany() || {};
  const { user: me } = useAuth() || {};
  const companyId = selectedCompany?.companyId;

  const [orders, setOrders] = useState([]);
  const [pos, setPos] = useState([]);
  const [dcs, setDcs] = useState([]);
  const [grns, setGrns] = useState([]);
  const [bills, setBills] = useState([]);
  const [allRets, setAllRets] = useState(null);
  const [vendors, setVendors] = useState([]);
  const [reload, setReload] = useState(0);
  const [editing, setEditing] = useState(null);
  const [note, setNote] = useState(null);
  const [slot, setSlot] = useState(null);

  // both kinds are loaded: the search can pick a client's order (Return Note) or a vendor's PO (Return to Vendor)
  useEffect(() => {
    if (!companyId) return;
    const p = { params: { companyId } };
    const arr = r => (Array.isArray(r.data) ? r.data : []);
    axios.get('/api/sales-orders', p).then(r => setOrders(arr(r))).catch(() => setOrders([]));
    axios.get('/api/delivery-challans', p).then(r => setDcs(arr(r).filter(d => d.status !== 'deleted'))).catch(() => setDcs([]));
    axios.get('/api/bills', p).then(r => setBills(arr(r).filter(b => b.type === 'sales' && b.status !== 'deleted'))).catch(() => setBills([]));
    axios.get('/api/purchase-orders', p).then(r => setPos(arr(r))).catch(() => setPos([]));
    loadGrns(companyId).then(setGrns);
    axios.get('/api/vendors', p).then(r => setVendors(arr(r).filter(v => v.status !== 'rejected'))).catch(() => setVendors([]));
    axios.get('/api/returns', { params: { companyId, withDeleted: 1 } }).then(r => setAllRets(arr(r))).catch(() => setAllRets([]));
  }, [companyId, reload]);

  const rets = useMemo(() => (allRets === null ? null : allRets.filter(r => r.kind === kind)), [allRets, kind]);
  const live = useMemo(() => (rets || []).filter(r => r.status !== 'deleted'), [rets]);
  const liveAll = useMemo(() => (allRets || []).filter(r => r.status !== 'deleted'), [allRets]);
  const tab = editing ? 'create' : urlTab;
  const go = k => { setEditing(null); navigate(`${C.path}?tab=${k}`); };
  const ctx = useMemo(() => ({ orders, pos, dcs, vendors, company: selectedCompany }), [orders, pos, dcs, vendors, selectedCompany]);
  const [noteRn, setNoteRn] = useState(null);   // the note just saved: print / e-way from the message
  const say = (text, rn = null) => { setNote(text); setNoteRn(rn); };

  /* print: the note (with / without value), the portal e-way bill, or both in one PDF */
  const doPrint = async (r, how) => {
    try {
      const full = fillReturn(r, ctx);
      if (how === 'with' || how === 'without') await printReturn({ r: full, company: selectedCompany, user: me, withValue: how === 'with' });
      else if (how === 'portal') await printReturnPortal({ r, companyId });
      else { say('Preparing one PDF — note + portal e-way bill…'); await printReturnWithPortal({ r: full, company: selectedCompany, user: me, withValue: how === 'p-with', companyId }); say(null); }
    } catch (e) { say(e.response?.data?.error || e.message || 'Could not prepare the print.'); }
  };
  /* e-way bill through the E-Way Helper (same as for DCs): the note is the document, one e-way bill per note */
  const [job, setJob] = useState(null);
  const [helperBox, setHelperBox] = useState(false);
  useEffect(() => {
    if (!job || ['done', 'failed'].includes(job.status)) return undefined;
    const t = setInterval(() => {
      axios.get(`/api/eway-helper/jobs/${job.id}`).then(r => { setJob(r.data); if (r.data.status === 'done') setReload(x => x + 1); }).catch(() => {});
    }, job.status === 'captcha' ? 1000 : 700);
    return () => clearInterval(t);
  }, [job]);
  const ewayOf = list => {
    const { json, bad } = ewayJsonOfReturns(list.map(r => fillReturn(r, ctx)), selectedCompany);
    if (bad.length) { say(`E-way bill not made — fill these first (Edit the note; HSN and rate come from the ${kind === 'client' ? 'sales order' : 'PO'}, pincodes from the client / vendor / company): ${bad.map(x => `${x.r.returnNo}: ${x.miss.join(', ')}`).join(' · ')}`); return null; }
    return json;
  };
  const doGenerate = async list => {
    const json = ewayOf(list);
    if (!json) return false;
    const docs = list.map((r, i) => ({ returnId: r.returnId, dcNo: r.returnNo, docNo: json.billLists[i].docNo }));
    return sendJob({ companyId, json, docs });
  };
  /* read the e-way bill again from the portal: generated date, valid upto, distance, active / validity over / cancelled — and its portal PDF */
  const doCheck = r => sendJob({ companyId, kind: 'check', returnId: r.returnId, ewbNo: r.ewayBillNo });
  const sendJob = async body => {
    say(null);
    const send = () => axios.post('/api/eway-helper/jobs', body);
    try {
      const r = await send().catch(async e => {
        if (e.response?.status !== 409 || !/not running/i.test(e.response?.data?.error || '')) throw e;
        say('Starting the E-Way Helper on this PC…'); startHelperOnThisPC();
        if (!(await waitHelperOnline(15000))) throw e;
        say(null); return send();
      });
      setJob(r.data); return true;
    } catch (e) {
      say(e.response?.data?.error || 'Could not send to the E-Way Helper.');
      if (e.response?.status === 409 && /not running|pair/i.test(e.response?.data?.error || '')) setHelperBox(true);
      return false;
    }
  };
  const doJson = list => { const json = ewayOf(list); if (json) downloadJson(json, `EWB_${String(list[0].returnNo || list[0].returnId).replace(/[^A-Za-z0-9-]/g, '_')}.json`); };
  const doPortal = async (what, r, file) => {
    try {
      if (what === 'upload') { await uploadReturnPdf(r, file, companyId); setReload(x => x + 1); say(`Portal e-way bill PDF saved with ${r.returnNo}. Print it from Print ▾.`); }
      if (what === 'remove') { await axios.delete(`/api/returns/${r.returnId}/eway-pdf`, { params: { companyId } }); setReload(x => x + 1); say(`Portal e-way bill PDF removed from ${r.returnNo}.`); }
    } catch (e) { say(e.response?.data?.error || e.message || 'Could not do that.'); }
  };
  const ew = { doPrint, doGenerate, doCheck, doJson, doPortal, busyJob: !!job && !['done', 'failed'].includes(job.status), openHelper: () => setHelperBox(true) };

  return (
    <div className="sb">
      <style>{SALES_CSS + DC_CSS + PX_CSS + EXTRA_CSS}</style>
      <div className="sb-tabs" role="tablist">
        {[['create', C.create], ['list', C.list]].map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={`sb-tab${tab === k ? ' on' : ''}`} onClick={() => go(k)}>
            {label}{k === 'list' && rets && <span className="n">{live.length}</span>}
          </button>
        ))}
        <div className="sb-slot" ref={setSlot} />
      </div>
      {note && <div className="sb-note" role="status">{note}
        {noteRn && <>
          <button type="button" className="sb-abtn" style={{ marginLeft: 8 }} onClick={() => doPrint(noteRn, 'with')}>Print (with value)</button>
          <button type="button" className="sb-abtn" onClick={() => doPrint(noteRn, 'without')}>Print (without value)</button>
          {!noteRn.ewayBillNo && <button type="button" className="sb-abtn" onClick={() => doGenerate([noteRn])}>Generate E-Way</button>}
        </>}
        <button type="button" onClick={() => say(null)} aria-label="Dismiss">×</button></div>}
      {job && !['done', 'failed'].includes(job.status) && (
        <div className="hb-back" style={{ alignItems: 'center', padding: 16 }}>
          <div className="hb ewm" role="dialog" aria-modal="true" aria-labelledby="ewm-t">
            <div className="hb-hd"><b id="ewm-t">{job.kind === 'check' ? 'Refresh e-way bill' : 'Generate e-way bill'}</b><span className="ec-pc">{job.machine || ''}</span></div>
            <EwayProgress key={job.id} job={job} onCancel={() => axios.post(`/api/eway-helper/jobs/${job.id}/cancel`).finally(() => setJob(j => ({ ...j, status: 'failed', message: 'Cancelled.' })))} />
            {job.status === 'captcha' && job.captchaImg && <EwayCaptcha job={job} inline />}
          </div>
        </div>
      )}
      {job && ['done', 'failed'].includes(job.status) && (
        <div className={`ew-job ${job.status}`} role="status">
          <span className="dot" />
          <span className="t"><b>E-Way Helper{job.machine ? ` · ${job.machine}` : ''}:</b> {job.message}
            {job.status === 'done' && job.kind !== 'check' && job.results?.length > 0 && <> — {job.results.map(r => `${r.dcNo}: ${r.ewbNo}`).join(', ')}</>}</span>
          <button type="button" className="ew-x" onClick={() => setJob(null)} aria-label="Dismiss">×</button>
        </div>
      )}
      {helperBox && <HelperBox onClose={() => setHelperBox(false)} />}
      {tab === 'create' && (
        <div className="sb-body">
          {allRets === null ? <div className="sb-empty">Loading…</div>
            : <ReturnForm key={editing ? `e-${editing.returnId}` : 'new'} pageKind={kind} companyId={companyId} company={selectedCompany} me={me}
              orders={orders} pos={pos} dcs={dcs} grns={grns} bills={bills} rets={liveAll} vendors={vendors} edit={editing}
              onCancel={() => { setEditing(null); navigate(`${C.path}?tab=list`); }}
              onSaved={(text, savedKind, rn) => { setReload(x => x + 1); say(text, rn); setEditing(null); navigate(`${CFG[savedKind || kind].path}?tab=list`); }} />}
        </div>
      )}
      {tab === 'list' && <ReturnList kind={kind} C={C} rets={rets} companyId={companyId} slot={slot} setNote={t => say(t)} ew={ew}
        onEdit={r => { say(null); setEditing(r); }} onChanged={() => setReload(x => x + 1)} />}
    </div>
  );
}

/* who sends the material and where it goes, with addresses — and each product's rate, GST and HSN from its order / PO.
   Saved on the note; worked out again here for notes made before these were saved. */
const partyOfVendor = v => (v ? { name: v.vendorName || '', gstin: v.gstin || '', address: v.address || '', city: v.city || '', state: v.state || '', pincode: String(v.pincode || '') } : null);
function placeOf(loc, ctx) {
  const co = ctx.company || {};
  if (String(loc || '').startsWith(VENDOR_PREFIX)) {
    const nm = loc.slice(VENDOR_PREFIX.length);
    return partyOfVendor(ctx.vendors.find(v => v.vendorName === nm)) || { name: nm };
  }
  const l = (Array.isArray(co.locations) ? co.locations : []).find(x => x.name === loc);
  return { name: co.companyName || co.name || '', gstin: co.gstin || '', address: (l && l.address) || co.address || '', city: co.city || '', state: co.state || '', pincode: String(co.pincode || '') };
}
export function fillReturn(r, ctx) {
  const client = r.kind === 'client';
  const o = client ? ctx.orders.find(x => String(x.orderId) === String(r.orderId)) : null;
  const po = client ? null : ctx.pos.find(x => String(x.orderId) === String(r.poId));
  const lines = client ? orderItems(o).map(l => ({ ...l, hsn: l.hsn }))
    : poLines(po).map(l => ({ idx: l.idx, name: l.name, rate: l.qty ? l.taxable / l.qty : l.rate, gst: l.gstPct, hsn: l.hsn }));
  const items = (r.items || []).map(it => {
    const l = lineOf(lines, it);
    return l ? { ...it, hsnCode: it.hsnCode || l.hsn || '', rate: n(it.rate) || Math.round(n(l.rate) * 100) / 100, gst: n(it.rate) && it.gst != null && it.gst !== '' ? n(it.gst) : n(l.gst) } : it;
  });
  let from = r.fromParty, to = r.toParty;
  if (!from?.name) {
    if (client) {
      const dcId = (r.items || []).find(i => i.dcId)?.dcId || r.dcId;
      const dc = ctx.dcs.find(x => String(x.dcId) === String(dcId)) || {};
      const oo = o || {};
      from = { name: r.customerName || oo.customerName || '', gstin: dc.customerGstin || oo.customerGstin || oo.partyGstin || '',
        address: dc.shippingAddress || oo.shipToAddress || oo.address || '', city: dc.shippingCity || oo.shipToCity || oo.customerCity || '',
        state: dc.shippingState || oo.shipToState || oo.customerState || '', pincode: String(dc.shippingPincode || oo.shipToPincode || oo.customerPincode || '') };
    } else from = placeOf(r.location, ctx);
  }
  if (!to?.name) to = client ? placeOf(r.location, ctx) : partyOfVendor(ctx.vendors.find(v => String(v.vendorId) === String(r.vendorId))) || { name: r.vendorName || '' };
  return { ...r, items, fromParty: from, toParty: to, clientPO: r.clientPO || o?.customerPO || '' };
}

/* vendor POs: per PO line, what came in (GRN), what went back before, what can go back now */
function linesFor(kind, doc, dcs, grns, rets, editId) {
  if (!doc) return [];
  const prev = {};
  rets.filter(r => r.kind === kind && r.returnId !== editId && String(kind === 'client' ? r.orderId : r.poId) === String(doc.orderId))
    .forEach(r => (r.items || []).forEach(it => { const k = it.itemIdx != null ? `i${it.itemIdx}` : key(it.itemName); prev[k] = r3((prev[k] || 0) + n(it.qty)); }));
  const lines = poLines(doc), got = {};
  grns.filter(g => String(g.poId) === String(doc.orderId) && g.status !== 'deleted' && g.deliveryType !== 'direct-client')
    .forEach(g => (g.items || []).forEach((li, j) => { const i = ownerIdx(li, j, lines); if (i != null) got[i] = r3((got[i] || 0) + grnQtyOf(li)); }));
  return lines.map(l => { const inn = got[l.idx] || 0, back = prev[`i${l.idx}`] || prev[key(l.name)] || 0; return { idx: l.idx, name: l.name, unit: l.unit, qty: l.qty, moved: inn, back, max: Math.max(0, r3(inn - back)),
    hsn: l.hsn, rate: l.qty ? Math.round(l.taxable / l.qty * 100) / 100 : l.rate, gst: l.gstPct }; });
}

/* the products of a sales order */
const orderItems = o => (o?.items || []).map((it, idx) => ({ idx, name: it.description || it.itemName || it.material || '', unit: it.unit || 'NOS', qty: n(it.qty), rate: n(it.rate), gst: n(it.gst), hsn: it.hsnCode || '', code: it.itemCode || '' })).filter(l => l.name);
const lineOf = (items, it) => (it.itemIdx != null && it.itemIdx !== '' && items.some(x => x.idx === Number(it.itemIdx)) ? items.find(x => x.idx === Number(it.itemIdx)) : items.find(x => key(x.name) === key(it.description || it.itemName)));
/* a sales order, product by product: ordered, billed, sent on DCs */
function orderSummary(o, dcs, bills) {
  const items = orderItems(o);
  const sent = {}, billed = {};
  dcs.filter(d => String(d.linkedSalesOrderId) === String(o.orderId)).forEach(d => (d.items || []).forEach(it => { const l = lineOf(items, it); if (l) sent[l.idx] = r3((sent[l.idx] || 0) + n(it.qty)); }));
  bills.filter(b => String(b.orderId) === String(o.orderId)).forEach(b => (b.items || []).forEach(it => { const l = lineOf(items, it); if (l) billed[l.idx] = r3((billed[l.idx] || 0) + n(it.qty)); }));
  return items.map(l => ({ ...l, billed: billed[l.idx] || 0, sent: sent[l.idx] || 0 }));
}
/* a client return, DC by DC: what went on each DC, what came back from it before, what can come back now */
function dcLinesFor(order, dcs, rets, editId) {
  if (!order) return [];
  const items = orderItems(order);
  const prev = {};
  rets.filter(r => r.kind === 'client' && r.returnId !== editId && String(r.orderId) === String(order.orderId)).forEach(r => (r.items || []).forEach(it => {
    const d = String(it.dcId || r.dcId || ''), l = lineOf(items, it);
    if (d && l) prev[`${d}|${l.idx}`] = r3((prev[`${d}|${l.idx}`] || 0) + n(it.qty));
  }));
  return dcs.filter(d => String(d.linkedSalesOrderId) === String(order.orderId)).sort((a, b) => String(a.dcDate || '').localeCompare(String(b.dcDate || '')) || a.dcId - b.dcId).map(dc => {
    const sent = {};
    (dc.items || []).forEach(it => { const l = lineOf(items, it); if (l) sent[l.idx] = r3((sent[l.idx] || 0) + n(it.qty)); });
    const lines = items.filter(l => sent[l.idx]).map(l => { const back = prev[`${dc.dcId}|${l.idx}`] || 0; return { ...l, key: `${dc.dcId}|${l.idx}`, sent: sent[l.idx], back, max: Math.max(0, r3(sent[l.idx] - back)) }; });
    return { dc, lines };
  }).filter(g => g.lines.length);
}

/* the search: a client's sales order (Return Note) or a vendor's PO (Return to Vendor), with every product and its quantities */
function PartyPicker({ start, orders, pos, dcs, bills, grns, onPick, onClose }) {
  const [who, setWho] = useState(start);
  const [q, setQ] = useState('');
  const rows = useMemo(() => {
    const w = q.toLowerCase().split(/\s+/).filter(Boolean);
    const hit = t => !w.length || w.every(x => t.toLowerCase().includes(x));
    if (who === 'client') {
      return orders.filter(o => o.status !== 'cancelled').map(o => ({ id: String(o.orderId), no: o.orderNo || o.orderId, date: o.orderDate, party: o.customerName || o.party || '', ref: o.customerPO || '', lines: orderSummary(o, dcs, bills) }))
        .filter(r => r.lines.some(l => l.sent > 0)).filter(r => hit(`${r.no} ${r.party} ${r.ref} ${r.lines.map(l => l.name).join(' ')}`)).slice(0, 200);
    }
    return pos.filter(p => !['draft', 'rejected', 'cancelled'].includes(p.status)).map(p => {
      const ls = linesFor('vendor', p, [], grns, [], null);
      return { id: String(p.orderId), no: p.poNo || p.orderId, date: p.poDate, party: p.vendorName || '', ref: '', lines: ls.map(l => ({ name: l.name, unit: l.unit, qty: l.qty, billed: null, sent: l.moved })) };
    }).filter(r => r.lines.some(l => l.sent > 0)).filter(r => hit(`${r.no} ${r.party} ${r.lines.map(l => l.name).join(' ')}`)).slice(0, 200);
  }, [who, q, orders, pos, dcs, bills, grns]);
  return (
    <div className="sf-pkb" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sf-pk rt-pk" role="dialog" aria-modal="true" aria-label="Search client or vendor">
        <div className="sf-pkh"><b>Search — whose material?</b><span className="grow" /><small>{rows.length} found</small><button type="button" onClick={onClose} aria-label="Close">×</button></div>
        <div className="sf-pks">
          <div className="rt-who-tabs" role="tablist">
            <button type="button" className={who === 'client' ? 'on' : ''} onClick={() => setWho('client')}>Client (Return Note)</button>
            <button type="button" className={who === 'vendor' ? 'on' : ''} onClick={() => setWho('vendor')}>Vendor (Return to Vendor)</button>
          </div>
          <input type="text" autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder={who === 'client' ? 'Client, order no., client PO or product…' : 'Vendor, PO no. or product…'} aria-label="Search" />
        </div>
        <div className="sf-pkl">
          <table className="sf-t">
            <thead><tr><th>{who === 'client' ? 'Order No.' : 'PO No.'}</th><th>{who === 'client' ? 'Client · Client PO' : 'Vendor'}</th><th>Material</th>
              <th className="r">{who === 'client' ? 'Order Qty' : 'PO Qty'}</th>{who === 'client' && <th className="r">Billed</th>}<th className="r">{who === 'client' ? 'Sent (DC)' : 'Received (GRN)'}</th></tr></thead>
            {rows.map(r => (
              <tbody key={r.id} className="rt-pr" onClick={() => onPick(who, r.id)}>
                {r.lines.map((l, i) => (
                  <tr key={i}>
                    {i === 0 && <td rowSpan={r.lines.length} className="sf-no">{r.no}<div className="mut" style={{ fontWeight: 400 }}>{fdate(r.date)}</div></td>}
                    {i === 0 && <td rowSpan={r.lines.length}><b>{r.party || '—'}</b>{r.ref ? <div className="mut">PO: {r.ref}</div> : null}</td>}
                    <td>{l.name}</td>
                    <td className="r">{num(l.qty)} <span className="mut">{l.unit}</span></td>
                    {who === 'client' && <td className="r">{num(l.billed)}</td>}
                    <td className="r" style={{ fontWeight: 700 }}>{num(l.sent)}</td>
                  </tr>
                ))}
              </tbody>
            ))}
            {!rows.length && <tbody><tr><td colSpan={6} className="sf-empty">{q ? `Nothing matches “${q}”.` : who === 'client' ? 'No order has material sent on a DC yet.' : 'No PO has material received yet.'}</td></tr></tbody>}
          </table>
        </div>
      </div>
    </div>
  );
}

function ReturnForm({ pageKind, companyId, company, me, orders, pos, dcs, grns, bills, rets, vendors, edit, onSaved, onCancel }) {
  const [kind, setKind] = useState(edit?.kind || pageKind);   // client → Return Note, vendor → Return to Vendor
  const C = CFG[kind];
  const docs = kind === 'client' ? orders.filter(o => o.status !== 'cancelled') : pos.filter(p => !['draft', 'rejected', 'cancelled'].includes(p.status));
  const [docId, setDocId] = useState(edit ? String(kind === 'client' ? edit.orderId : edit.poId) : '');
  const doc = docs.find(d => String(d.orderId) === docId) || (kind === 'client' ? orders : pos).find(d => String(d.orderId) === docId) || null;
  const locations = Array.isArray(company?.locations) ? company.locations : [];
  const reasonOf = r => (r && !C.reasons.includes(r) ? 'Other' : r || '');
  const [head, setHead] = useState(() => ({ date: edit?.date || today(), reason: reasonOf(edit?.reason), reasonText: edit?.reasonText || (edit?.reason && !CFG[edit.kind || pageKind].reasons.includes(edit.reason) ? edit.reason : ''),
    location: edit?.location ?? (locations[0]?.name || 'My godown / factory'), vehicleNo: edit?.vehicleNo || '', remarks: edit?.remarks || '',
    transporterName: edit?.transporterName || '', transporterId: edit?.transporterId || '', approxDistanceKm: edit?.approxDistanceKm || '', transDocNo: edit?.transDocNo || '',
    ewaySubSupplyType: edit?.ewaySubSupplyType || '', ewayBillNo: edit?.ewayBillNo || '', ewayGenDate: edit?.ewayGenDate || '', ewayValidUpto: edit?.ewayValidUpto || '' }));
  // client: qty per DC line ("dcId|itemIdx"); vendor: qty per PO line (itemIdx)
  const [qty, setQty] = useState(() => {
    const q = {};
    (edit?.items || []).forEach(it => {
      if (it.itemIdx == null) return;
      if ((edit.kind || pageKind) === 'client') { const d = it.dcId || edit.dcId || ''; if (d) q[`${d}|${it.itemIdx}`] = String(r3(n(q[`${d}|${it.itemIdx}`]) + n(it.qty))); }
      else q[it.itemIdx] = String(it.qty);
    });
    return q;
  });
  const [rmk, setRmk] = useState(() => { const r = {}; (edit?.items || []).forEach(it => { if (it.itemIdx != null && it.remarks) r[(edit.kind || pageKind) === 'client' ? `${it.dcId || edit.dcId || ''}|${it.itemIdx}` : it.itemIdx] = it.remarks; }); return r; });
  const [locPick, setLocPick] = useState(false);
  const [picker, setPicker] = useState(!edit);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  // straight on to another client: this Return Note + a DC to that client's order
  const [direct, setDirect] = useState(false);
  const [toId, setToId] = useState('');
  const [toPick, setToPick] = useState(false);
  const [toMap, setToMap] = useState({});   // returning line key → product index of the new order
  const toOrder = orders.find(o => String(o.orderId) === toId) || null;
  const set = k => e => { const v = e.target.value; setHead(h => ({ ...h, [k]: v })); };
  const locLabel = v => (!v ? '' : v.startsWith(VENDOR_PREFIX) ? `${v.slice(VENDOR_PREFIX.length)} (vendor's site)` : (() => { const l = locations.find(x => x.name === v); return l ? `${l.name}${l.type ? ` (${l.type})` : ''}` : v; })());

  const groups = useMemo(() => (kind === 'client' ? dcLinesFor(doc, dcs, rets, edit?.returnId) : []), [kind, doc, dcs, rets, edit]);
  const vLines = useMemo(() => (kind === 'vendor' ? linesFor('vendor', doc, dcs, grns, rets, edit?.returnId) : []), [kind, doc, dcs, grns, rets, edit]);
  // client: every DC line, product by product (each DC its own row and qty); vendor: the PO lines
  const shown = kind === 'client'
    ? groups.flatMap(g => g.lines.map(l => ({ ...l, dc: g.dc }))).sort((a, b) => a.idx - b.idx)
    : vLines.map(l => ({ ...l, key: l.idx }));
  const firstOf = {}, countOf = {};
  shown.forEach((l, i) => { if (firstOf[l.idx] == null) firstOf[l.idx] = i; countOf[l.idx] = (countOf[l.idx] || 0) + 1; });
  const prodNo = {}; Object.keys(firstOf).sort((a, b) => firstOf[a] - firstOf[b]).forEach((k, i) => { prodNo[k] = i + 1; });
  const errs = {};
  shown.forEach(l => { if (n(qty[l.key]) > l.max + 1e-9) errs[l.key] = `Only ${num(l.max)} can come back`; });
  const send = shown.filter(l => n(qty[l.key]) > 0);
  const nProd = new Set(send.map(l => l.idx)).size;
  const qtyTot = send.reduce((s, l) => s + n(qty[l.key]), 0);
  const toItems = orderItems(toOrder);
  const mapOf = l => (toMap[l.key] != null ? toMap[l.key] : (toItems.find(x => key(x.name) === key(l.name)) || {}).idx);

  const pickDoc = (who, id) => {
    setPicker(false);
    if (who !== kind) { setKind(who); setHead(h => ({ ...h, reason: '', reasonText: '' })); setDirect(false); }
    if (id !== docId || who !== kind) { setDocId(id); setQty({}); setRmk({}); setMsg(null); setToId(''); setToMap({}); }
  };

  /* the DC to the other client (made right after the Return Note) */
  const makeDirectDc = async rn => {
    const o = toOrder;
    const lines = send.map(l => ({ l, t: toItems.find(x => x.idx === mapOf(l)) })).filter(x => x.t);
    const r2 = v => Math.round(v * 100) / 100;
    const coSt = String(company?.state || '').trim().toLowerCase(), toSt = String(o.customerState || '').trim().toLowerCase();
    const intra = !!(coSt && toSt && coSt === toSt);
    const value = lines.reduce((s, x) => s + n(qty[x.l.key]) * x.t.rate, 0), gstAmt = lines.reduce((s, x) => s + n(qty[x.l.key]) * x.t.rate * x.t.gst / 100, 0);
    const payload = {
      companyId, dcDate: head.date, dcType: 'before-bill', vehicleNo: head.vehicleNo.trim(),
      remarks: `Material returned by ${rn.customerName} on Return Note ${rn.returnNo}, sent straight to this client.`,
      createdBy: { id: me?.id, name: me?.name || me?.username || '', username: me?.username || '' },
      linkedSalesOrderId: o.orderId, orderNo: o.orderNo || '', orderDate: o.orderDate || '', clientOrderNo: o.customerPO || '', clientPoDate: o.poDate || '',
      customerName: o.customerName || o.party || '', customerGstin: o.customerGstin || o.partyGstin || '',
      billingName: o.contactPerson || '', billingMobile: o.mobile || '', billingEmail: o.email || '',
      billingAddress: o.address || '', billingCity: o.customerCity || '', billingState: o.customerState || '', billingPincode: o.customerPincode || '',
      shippingName: o.shipToName || o.customerName || '', shippingMobile: o.shipToMobile || o.mobile || '',
      shippingAddress: o.shipToAddress || o.deliveryAddr || o.address || '', shippingCity: o.shipToCity || o.customerCity || '', shippingState: o.shipToState || o.customerState || '', shippingPincode: o.shipToPincode || o.customerPincode || '',
      returnId: rn.returnId, returnNo: rn.returnNo,
      items: lines.map(x => ({ itemIdx: x.t.idx, itemCode: x.t.code, description: x.t.name, hsnCode: x.t.hsn, unit: x.t.unit, qty: n(qty[x.l.key]), rate: x.t.rate, gst: x.t.gst })),
      addons: [], totalValue: r2(value), totalGst: r2(gstAmt), grandTotal: r2(value + gstAmt), gstSplit: intra ? 'intra' : 'inter',
      cgst: intra ? r2(gstAmt / 2) : 0, sgst: intra ? r2(gstAmt / 2) : 0, igst: intra ? 0 : r2(gstAmt),
    };
    return (await axios.post('/api/delivery-challans', payload)).data;
  };

  const save = async () => {
    setMsg(null);
    if (!doc) return setMsg({ k: 'err', t: `Search and pick the ${kind === 'client' ? 'client order' : 'vendor PO'} first.` });
    if (!head.date) return setMsg({ k: 'err', t: 'Enter the date.' });
    if (!head.reason) return setMsg({ k: 'err', t: 'Choose the reason for the return.' });
    if (head.reason === 'Other' && !head.reasonText.trim()) return setMsg({ k: 'err', t: 'Write the reason (you chose Other).' });
    if (Object.keys(errs).length) return setMsg({ k: 'err', t: 'Some quantities are more than what can come back — see the red boxes.' });
    if (!send.length) return setMsg({ k: 'err', t: 'Enter the return qty for at least one product.' });
    if (direct) {
      if (!toOrder) return setMsg({ k: 'err', t: 'Pick the order of the client the material goes to.' });
      if (send.some(l => mapOf(l) == null)) return setMsg({ k: 'err', t: "Choose, for every product, which product of the new client's order it goes as." });
    }
    setBusy(true);
    const payload = {
      companyId, kind, date: head.date, reason: head.reason, reasonText: head.reason === 'Other' ? head.reasonText.trim() : '', location: head.location.trim(), vehicleNo: head.vehicleNo.trim(), remarks: head.remarks.trim(),
      items: send.map(l => ({ itemIdx: l.idx, itemName: l.name, unit: l.unit, qty: n(qty[l.key]), remarks: (rmk[l.key] || '').trim(), hsnCode: l.hsn || '', rate: l.rate || 0, gst: l.gst || 0,
        ...(l.dc ? { dcId: String(l.dc.dcId), dcNo: l.dc.dcNo || '' } : {}) })),
      transporterName: head.transporterName.trim(), transporterId: head.transporterId.trim(), approxDistanceKm: head.approxDistanceKm, transDocNo: head.transDocNo.trim(),
      ewaySubSupplyType: head.ewaySubSupplyType, ewayBillNo: head.ewayBillNo.trim(), ewayGenDate: head.ewayGenDate.trim(), ewayValidUpto: head.ewayValidUpto.trim(),
      ...(kind === 'client'
        ? { orderId: String(doc.orderId), orderNo: doc.orderNo || '', customerName: doc.customerName || doc.party || '',
            ...(direct ? { direct: { orderId: String(toOrder.orderId), orderNo: toOrder.orderNo || '', customerName: toOrder.customerName || toOrder.party || '' } } : {}) }
        : { poId: String(doc.orderId), poNo: doc.poNo || doc.poNumber || '', vendorId: String(doc.vendorId || ''), vendorName: doc.vendorName || '',
            orderId: String(doc.linkedSalesOrderId || ''), orderNo: orders.find(o => String(o.orderId) === String(doc.linkedSalesOrderId))?.orderNo || '' }),
    };
    // the addresses as on today (client site → our godown, our godown → vendor) and the products' rate / GST / HSN
    const full = fillReturn({ ...payload, fromParty: null, toParty: null }, { orders, pos, dcs, vendors, company });
    Object.assign(payload, { items: full.items, fromParty: full.fromParty, toParty: full.toParty, clientPO: full.clientPO });
    let rn = null;
    try {
      rn = (edit ? await axios.put(`/api/returns/${edit.returnId}`, payload, { params: { companyId } }) : await axios.post('/api/returns', payload, { params: { companyId } })).data;
    } catch (e) { setBusy(false); return setMsg({ k: 'err', t: e.response?.data?.error || 'Could not save.' }); }
    let extra = '';
    if (direct && !edit) {
      try {
        const dc = await makeDirectDc(rn);
        await axios.put(`/api/returns/${rn.returnId}`, { companyId, direct: { ...payload.direct, dcId: String(dc.dcId), dcNo: dc.dcNo || '' } }, { params: { companyId } });
        extra = ` DC ${dc.dcNo} made to ${toOrder.customerName || toOrder.party} (order ${toOrder.orderNo}) — print it from the Delivery Challan list.`;
      } catch (e) {
        setBusy(false);
        return setMsg({ k: 'err', t: `Return Note ${rn.returnNo} is saved, but the DC to ${toOrder.customerName || 'the new client'} could not be made: ${e.response?.data?.error || e.message}. Make that DC from the Delivery Challan page.` });
      }
    }
    setBusy(false);
    onSaved(`${edit ? 'Updated' : 'Saved'} ${C.title} ${rn?.returnNo || edit?.returnNo || ''} — ${num(qtyTot)} qty ${kind === 'client' ? `back from ${payload.customerName}` : `back to ${payload.vendorName}`}.${extra}`, kind, rn && rn.returnId ? rn : null);
  };

  const partyName = doc ? (kind === 'client' ? doc.customerName || doc.party : doc.vendorName) : '';
  return (
    <div className="sf">
      <div className="sf-hero">
        <span className="ic"><Svg name="swap" size={15} /></span>
        <h1>{edit ? `Edit ${C.title} ${edit.returnNo}` : C.create}</h1><span className="grow" />
        {doc && <span className="sf-chip"><small>{kind === 'client' ? 'SO' : 'PO'}</small><b>{kind === 'client' ? doc.orderNo : doc.poNo || doc.orderId}</b></span>}
        <span className="sf-chip"><small>Returning</small><b>{num(qtyTot)}</b></span>
      </div>

      <div className="sf-2" style={{ marginTop: 10 }}>
        <div className="sf-card">
          <div className="sf-ch"><span className="ico"><Svg name="search" size={13} /></span><b>Whose material</b></div>
          <table className="sf-kv"><tbody>
            <tr><th>Client / Vendor <i>*</i></th><td>
              <div className="sf-srch">
                <input readOnly value={doc ? `${partyName || ''} · ${kind === 'client' ? doc.orderNo : doc.poNo || doc.orderId}${kind === 'client' && doc.customerPO ? ` · PO ${doc.customerPO}` : ''}` : ''}
                  placeholder="Search a client or a vendor" onClick={() => !edit && setPicker(true)} disabled={!!edit} />
                <button type="button" className="sf-sbtn" onClick={() => setPicker(true)} disabled={!!edit} aria-label="Search client or vendor"><Svg name="search" size={14} /></button>
              </div>
            </td></tr>
            <tr><th>Type</th><td>{doc ? <b>{kind === 'client' ? 'Return Note — material back from a client' : 'Return to Vendor — material back to a vendor'}</b> : '—'}</td></tr>
            {kind === 'vendor' && <tr><th>Order</th><td>{doc ? dash(orders.find(o => String(o.orderId) === String(doc.linkedSalesOrderId))?.orderNo) : '—'}</td></tr>}
          </tbody></table>
        </div>
        <div className="sf-card">
          <div className="sf-ch"><span className="ico"><Svg name="file" size={13} /></span><b>Return Details</b></div>
          <table className="sf-kv"><tbody>
            <tr><th>Date <i>*</i></th><td><input type="date" value={head.date} onChange={set('date')} /></td></tr>
            <tr><th>Reason <i>*</i></th><td><select value={head.reason} onChange={set('reason')}><option value="">Choose…</option>{C.reasons.map(r => <option key={r}>{r}</option>)}</select>
              {head.reason === 'Other' && <input style={{ marginTop: 6 }} value={head.reasonText} onChange={set('reasonText')} placeholder="Write the reason" aria-label="Reason (other)" />}</td></tr>
            <tr><th>{kind === 'client' ? 'Received at' : 'Sent from'}</th><td>
              <div className="sf-srch">
                <input readOnly value={locLabel(head.location)} placeholder="Search a godown or a vendor's site" onClick={() => !direct && setLocPick(true)} disabled={direct} />
                <button type="button" className="sf-sbtn" onClick={() => setLocPick(true)} disabled={direct} aria-label="Search location"><Svg name="search" size={14} /></button>
              </div>
            </td></tr>
            <tr><th>Vehicle No.</th><td><input value={head.vehicleNo} onChange={set('vehicleNo')} placeholder="Optional" /></td></tr>
            <tr><th>Remarks</th><td><input value={head.remarks} onChange={set('remarks')} placeholder="Optional" /></td></tr>
          </tbody></table>
        </div>
      </div>

      <div className="sf-card">
        <div className="sf-ch"><span className="ico"><Svg name="box" size={13} /></span><b>Products {kind === 'client' ? 'coming back' : 'going back'}</b></div>
        {!doc ? <div className="sf-empty">Search and pick a client or vendor to see the products.</div>
          : kind === 'client' && !groups.length ? <div className="sf-empty">No DC of this order has material on it — nothing can come back.</div> : (
          <table className="sf-t sf-pt">
            <colgroup><col style={{ width: 34 }} /><col />{kind === 'client' && <col style={{ width: 190 }} />}<col style={{ width: 100 }} /><col style={{ width: 100 }} /><col style={{ width: 100 }} /><col style={{ width: 120 }} /><col style={{ width: 190 }} /></colgroup>
            <thead><tr><th>Sl</th><th>Product</th>{kind === 'client' && <th>DC</th>}<th className="r">{kind === 'client' ? 'Sent on this DC' : 'Received (GRN)'}</th>
              <th className="r">Returned before</th><th className="r">Can return</th><th className="r now first">Return now</th><th className="now">Remarks</th></tr></thead>
            <tbody>{shown.map((l, i) => {
              const q = n(qty[l.key]);
              const first = kind !== 'client' || firstOf[l.idx] === i, span = kind === 'client' ? countOf[l.idx] : 1;
              return (
                <tr key={l.key} className={`${l.max <= 0 && !q ? 'off' : ''}${first && i ? ' rt-pfirst' : ''}`}>
                  {first && <td rowSpan={span} style={{ verticalAlign: 'top' }}>{kind === 'client' ? prodNo[l.idx] : i + 1}</td>}
                  {first && <td rowSpan={span} className="rt-pcell"><div className="pn">{l.name}</div><div className="ps">{l.unit}{kind === 'client' && span > 1 ? ` · on ${span} DCs` : ''}</div></td>}
                  {kind === 'client' && <td className="sf-no">{l.dc.dcNo}<div className="mut" style={{ fontWeight: 400 }}>{fdate(l.dc.dcDate)}{l.dc.vehicleNo ? ` · ${l.dc.vehicleNo}` : ''}</div></td>}
                  <td className="r">{num(kind === 'client' ? l.sent : l.moved)}</td>
                  <td className="r">{l.back ? num(l.back) : <span className="mut">0</span>}</td><td className="r">{num(l.max)}</td>
                  <td className="r now first">
                    <input className={`sf-q${errs[l.key] ? ' bad' : ''}`} inputMode="decimal" value={qty[l.key] ?? ''} placeholder="0" disabled={l.max <= 0 && !q}
                      onChange={e => { const v = e.target.value.replace(/[^\d.]/g, ''); setQty(x => ({ ...x, [l.key]: v })); }} aria-label={`Return qty for ${l.name}${l.dc ? ` on ${l.dc.dcNo}` : ''}`} />
                    {errs[l.key] && <span className="sf-err">{errs[l.key]}</span>}
                  </td>
                  <td className="now"><input value={rmk[l.key] || ''} onChange={e => { const v = e.target.value; setRmk(x => ({ ...x, [l.key]: v })); }} placeholder="Optional" disabled={!q} aria-label={`Remarks for ${l.name}`} /></td>
                </tr>
              );
            })}</tbody>
          </table>
        )}
      </div>

      {doc && (
        <div className="sf-2">
          <div className="sf-card">
            <div className="sf-ch"><span className="ico"><Svg name="swap" size={13} /></span><b>Transport</b></div>
            <table className="sf-kv"><tbody>
              <tr><th>Transporter</th><td><input value={head.transporterName} onChange={set('transporterName')} placeholder="Optional" /></td></tr>
              <tr><th>Transporter ID</th><td><input value={head.transporterId} onChange={set('transporterId')} placeholder="GSTIN / TRANSIN — needed for an e-way bill without a vehicle no." /></td></tr>
              <tr><th>LR / Doc No.</th><td><input value={head.transDocNo} onChange={set('transDocNo')} placeholder="Optional" /></td></tr>
              <tr><th>Distance (km)</th><td><input inputMode="numeric" value={head.approxDistanceKm} onChange={e => { const v = e.target.value.replace(/\D/g, '').slice(0, 4); setHead(h => ({ ...h, approxDistanceKm: v })); }} placeholder="Blank — the portal works it out from the pincodes" /></td></tr>
            </tbody></table>
          </div>
          <div className="sf-card">
            <div className="sf-ch"><span className="ico"><Svg name="file" size={13} /></span><b>E-Way Bill</b><span className="grow" /><small className="mut">Generate it from the list after saving</small></div>
            <table className="sf-kv"><tbody>
              <tr><th>E-way type</th><td><select value={head.ewaySubSupplyType} onChange={set('ewaySubSupplyType')}>
                <option value="">Auto — {kind === 'client' ? 'Inward' : 'Outward'} · {(RETURN_SUB_TYPES[kind].find(([k]) => k === returnSubOf({ kind, reason: head.reason, reasonText: head.reasonText })) || [])[1]}</option>
                {RETURN_SUB_TYPES[kind].map(([k, l]) => <option key={k} value={String(k)}>{kind === 'client' ? 'Inward' : 'Outward'} · {l}</option>)}</select></td></tr>
              <tr><th>E-Way Bill No.</th><td><input inputMode="numeric" value={head.ewayBillNo} onChange={e => { const v = e.target.value.replace(/\D/g, '').slice(0, 12); setHead(h => ({ ...h, ewayBillNo: v })); }} placeholder="Filled by the E-Way Helper — or type it if made on the portal" /></td></tr>
              {head.ewayBillNo && <tr><th>Generated / Valid upto</th><td style={{ display: 'flex', gap: 6 }}><input value={head.ewayGenDate} onChange={set('ewayGenDate')} placeholder="Generated on" /><input value={head.ewayValidUpto} onChange={set('ewayValidUpto')} placeholder="Valid upto" /></td></tr>}
            </tbody></table>
          </div>
        </div>
      )}

      {kind === 'client' && doc && !edit && (
        <div className="sf-card">
          <label className="rt-direct"><input type="checkbox" checked={direct} onChange={e => setDirect(e.target.checked)} />
            <span><b>Send this material straight to another client</b><small>Rejected here and sent on from the site — this makes the Return Note and a DC to the other client's order together</small></span></label>
          {direct && (
            <table className="sf-kv" style={{ marginTop: 6 }}><tbody>
              <tr><th>To order <i>*</i></th><td>
                <div className="sf-srch">
                  <input readOnly value={toOrder ? `${toOrder.orderNo} · ${toOrder.customerName || toOrder.party || ''}` : ''} placeholder="Pick the other client's sales order" onClick={() => setToPick(true)} />
                  <button type="button" className="sf-sbtn" onClick={() => setToPick(true)} aria-label="Pick the order"><Svg name="search" size={14} /></button>
                </div>
              </td></tr>
              {toOrder && send.map(l => (
                <tr key={l.key}><th>{l.name} × {num(qty[l.key])}</th><td>
                  <select value={mapOf(l) ?? ''} onChange={e => { const v = e.target.value; setToMap(m => ({ ...m, [l.key]: v === '' ? null : Number(v) })); }}>
                    <option value="">Goes as which product of {toOrder.orderNo}?</option>
                    {toItems.map(t => <option key={t.idx} value={t.idx}>{t.name} — ordered {num(t.qty)} {t.unit}</option>)}
                  </select>
                </td></tr>
              ))}
              {toOrder && !send.length && <tr><th /><td className="mut">Enter the return qty above — then choose where each product goes.</td></tr>}
            </tbody></table>
          )}
        </div>
      )}

      {msg && <div className={`sf-msg ${msg.k}`} role="status">{msg.t}</div>}
      <div className="sf-bar">
        <div className="info">{doc ? <>Returning <b>{num(qtyTot)}</b> qty of {nProd} product{nProd === 1 ? '' : 's'}{kind === 'client' && send.length > nProd ? ` from ${send.length} DC lines` : ''}{direct && toOrder ? <> → DC to <b>{toOrder.customerName || toOrder.party}</b></> : null}</> : 'Search a client or vendor to start.'}</div>
        {edit && <button type="button" className="sf-b ghost" onClick={onCancel} disabled={busy}>Cancel</button>}
        <button type="button" className="sf-b pri" onClick={save} disabled={busy}>{busy ? 'Saving…' : edit ? 'Update' : direct ? 'Save Return Note + DC' : 'Save'}</button>
      </div>

      {picker && <PartyPicker start={kind} orders={orders} pos={pos} dcs={dcs} bills={bills} grns={grns} onClose={() => setPicker(false)} onPick={pickDoc} />}
      {locPick && <ListPicker title={kind === 'client' ? 'Received at — godown or vendor site' : 'Sent from — godown or vendor site'} placeholder="Search godown or vendor…"
        cols={[['Name'], ['Type'], ['City']]}
        rows={[...(locations.length ? locations.map(l => ({ key: l.name, search: `${l.name} ${l.type || ''} godown`, cells: [l.name, l.type || 'Godown', l.city || '—'] }))
          : [{ key: 'My godown / factory', search: 'my godown factory', cells: ['My godown / factory', 'Godown', '—'] }]),
          ...[...vendors].sort((a, b) => String(a.vendorName).localeCompare(String(b.vendorName))).map(v => ({ key: VENDOR_PREFIX + v.vendorName, search: `${v.vendorName} ${v.city || ''} vendor site`, cells: [v.vendorName, "Vendor's site", v.city || '—'] }))]}
        onClose={() => setLocPick(false)} onPick={k => { setLocPick(false); setHead(h => ({ ...h, location: k })); }} />}
      {toPick && <ListPicker title="Send to — pick the other client's order" placeholder="Search order no., client, client PO…"
        cols={[['Order No.'], ['Date'], ['Client'], ['Client PO']]}
        rows={orders.filter(o => o.status !== 'cancelled' && String(o.orderId) !== docId).map(o => ({ key: String(o.orderId), search: `${o.orderNo} ${o.customerName || ''} ${o.customerPO || ''}`, cells: [o.orderNo || o.orderId, fdate(o.orderDate), o.customerName || '—', o.customerPO || '—'] }))}
        onClose={() => setToPick(false)} onPick={k => { setToPick(false); setToId(k); setToMap({}); }} />}
    </div>
  );
}

const RCOLS = kind => [['Date', '7%'], ['No.', '9%'], [kind === 'client' ? 'Order No.' : 'PO No.', '9%'], [kind === 'client' ? 'Client' : 'Vendor', '12%'],
  [kind === 'client' ? 'DC No.' : 'Order No.', '9%'], ['Products', '16%'], ['Qty', '5%', 'r'], ['Reason', '9%'], [kind === 'client' ? 'Received at' : 'Sent from', '8%'], ['E-Way Bill', '9%'], ['By', '7%']];

function ReturnList({ kind, C, rets, companyId, slot, setNote, ew, onEdit, onChanged }) {
  const [printMenu, setPrintMenu] = useState(false);
  const [ewMenu, setEwMenu] = useState(false);
  const pdfIn = useRef(null);
  useEffect(() => {
    if (!printMenu && !ewMenu) return undefined;
    const off = e => { if (!e.target.closest('.pm-wrap')) { setPrintMenu(false); setEwMenu(false); } };
    document.addEventListener('mousedown', off);
    return () => document.removeEventListener('mousedown', off);
  }, [printMenu, ewMenu]);
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
      && (!w.length || w.every(x => `${r.returnNo} ${r.orderNo} ${r.poNo || ''} ${r.customerName || ''} ${r.vendorName || ''} ${r.dcNo || ''} ${r.reason} ${r.reasonText || ''} ${r.direct?.customerName || ''} ${(r.items || []).map(i => i.itemName).join(' ')}`.toLowerCase().includes(x))));
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
      <input ref={pdfIn} type="file" accept="application/pdf,.pdf" hidden onChange={e => { const f = e.target.files && e.target.files[0]; e.target.value = ''; if (f && sel) ew.doPortal('upload', sel, f); }} />
      {slot && createPortal(<>
        <FyFilter list={fyList} total={all.length} sel={fySel} setSel={setFySel} />
        <input className="sb-search" value={q} onChange={e => setQ(e.target.value)} placeholder={`Search ${C.title.toLowerCase()}, order, ${C.party.toLowerCase()}, product…`} aria-label="Search" />
        <div className="sb-tools">
          <span className="sb-picked">{sel ? <>Selected: <b>{sel.returnNo}</b></> : 'Click a note to select'}</span>
          {sel && !gone(sel) && ewayActive(sel)
            ? <button type="button" className="sb-tbtn gen" disabled={ew.busyJob} title="Read this e-way bill again from the portal (valid upto, distance, status) and save its portal PDF"
              onClick={() => ew.doCheck(sel)}><Svg name="refresh" size={13} />Refresh E-Way</button>
            : <button type="button" className="sb-tbtn gen" disabled={!sel || gone(sel) || !!sel.ewayBillNo || ew.busyJob} title={sel?.ewayBillNo ? `Has e-way bill ${sel.ewayBillNo}` : 'Open the e-way portal through the E-Way Helper and generate'}
              onClick={() => ew.doGenerate([sel])}><Svg name="spark" size={13} />Generate E-Way</button>}
          <span className="pm-wrap">
            <button type="button" className="sb-tbtn" aria-haspopup="menu" aria-expanded={ewMenu} onClick={() => { setPrintMenu(false); setEwMenu(m => !m); }}><Svg name="swap" size={13} />E-Way ▾</button>
            {ewMenu && (
              <span className="pm-menu" role="menu">
                <button type="button" role="menuitem" disabled={!sel || gone(sel)} onClick={() => { setEwMenu(false); ew.doJson([sel]); }}><b>E-Way JSON</b><small>Download the file to upload on the portal yourself</small></button>
                <button type="button" role="menuitem" disabled={!sel?.ewayBillNo || ew.busyJob} onClick={() => { setEwMenu(false); ew.doCheck(sel); }}>
                  <b>Check on portal</b><small>Active, validity over, or cancelled — read again from the portal, with its PDF</small></button>
                <button type="button" role="menuitem" disabled={!sel?.ewayBillNo} onClick={() => { setEwMenu(false); pdfIn.current?.click(); }}>
                  <b>{sel?.ewayPdf ? 'Replace portal e-way bill PDF' : 'Upload portal e-way bill PDF'}</b><small>{sel?.ewayPdf ? `Saved ${fdate(sel.ewayPdf.at)}${sel.ewayPdf.source === 'portal' ? ' by the E-Way Helper' : ''}` : sel?.ewayBillNo ? 'The PDF saved from the e-way portal' : 'Type the e-way bill no. in the note first (Edit)'}</small></button>
                {sel?.ewayPdf && <button type="button" role="menuitem" className="danger" onClick={() => { setEwMenu(false); ew.doPortal('remove', sel); }}><b>Remove portal PDF</b><small>The e-way bill itself stays</small></button>}
                <button type="button" role="menuitem" onClick={() => { setEwMenu(false); ew.openHelper(); }}><b>E-Way Helper</b><small>Start it / set up this PC</small></button>
              </span>
            )}
          </span>
          <span className="pm-wrap">
            <button type="button" className="sb-tbtn" disabled={!sel} aria-haspopup="menu" aria-expanded={printMenu} onClick={() => { setEwMenu(false); setPrintMenu(m => !m); }}><Svg name="file" size={13} />Print ▾</button>
            {printMenu && sel && (
              <span className="pm-menu" role="menu">
                <span className="pm-h">{sel.ewayBillNo ? `Only ${C.title} — e-way bill details printed in it` : C.title}</span>
                <button type="button" role="menuitem" onClick={() => { setPrintMenu(false); ew.doPrint(sel, 'with'); }}><b>With value</b><small>Rate, GST and amount</small></button>
                <button type="button" role="menuitem" onClick={() => { setPrintMenu(false); ew.doPrint(sel, 'without'); }}><b>Without value</b><small>Quantities only</small></button>
                {sel.ewayBillNo && <>
                  <span className="pm-h">{C.title} + portal e-way bill{sel.ewayPdf ? ' — one PDF' : ' — portal PDF not saved yet'}</span>
                  {sel.ewayPdf ? <>
                    <button type="button" role="menuitem" onClick={() => { setPrintMenu(false); ew.doPrint(sel, 'p-with'); }}><b>With value</b><small>The note (no e-way section), then the portal e-way bill</small></button>
                    <button type="button" role="menuitem" onClick={() => { setPrintMenu(false); ew.doPrint(sel, 'p-without'); }}><b>Without value</b><small>Quantities only, then the portal e-way bill</small></button>
                    <span className="pm-h">Only e-way bill</span>
                    <button type="button" role="menuitem" onClick={() => { setPrintMenu(false); ew.doPrint(sel, 'portal'); }}><b>Portal e-way bill</b><small>Exactly as the e-way portal prints it</small></button>
                  </> : <button type="button" role="menuitem" onClick={() => { setPrintMenu(false); pdfIn.current?.click(); }}><b>Upload portal e-way bill PDF…</b><small>Saved by the E-Way Helper when it generates — or upload it here</small></button>}
                </>}
              </span>
            )}
          </span>
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
                <td className="no">{kind === 'client' ? <>{dash(r.dcNo)}{r.direct?.orderNo ? <div className="rt-who">→ {r.direct.dcNo ? `DC ${r.direct.dcNo}` : 'DC'} to {r.direct.customerName} ({r.direct.orderNo})</div> : null}</> : dash(r.orderNo)}</td>
                <td>{(r.items || []).map((i, k) => <div key={k} className="gl">{i.itemName}</div>)}</td>
                <td className="r">{(r.items || []).map((i, k) => <div key={k} className="gl">{num(i.qty)}{i.unit ? <span className="mut"> {i.unit}</span> : null}</div>)}</td>
                <td>{r.reason === 'Other' && r.reasonText ? <>Other: {r.reasonText}</> : dash(r.reason)}</td><td>{dash(r.location)}</td>
                <td className="nw">{r.ewayBillNo ? <>{r.ewayStatus === 'cancelled' ? <><span className="ew-no-x">{r.ewayBillNo}</span><span className="ew-cx">✕ Cancelled</span></>
                  : r.ewayStatus === 'expired' ? <>{r.ewayBillNo}<span className="ew-cx ew-exp">Validity over</span></> : r.ewayBillNo}
                  {r.ewayValidUpto && r.ewayStatus !== 'cancelled' ? <div className="rt-who">valid upto {r.ewayValidUpto}</div> : null}
                  {r.ewayPdf ? <div className="rt-who">portal PDF saved</div> : null}</> : <span className="mut">—</span>}</td>
                <td><div>{dash(who(r))}</div>{r.updatedBy && <div className="rt-who">edited: {r.updatedBy}</div>}{gone(r) && <div className="rt-who">deleted: {r.deletedBy || '—'}</div>}</td>
              </tr>
            </tbody>
          ))}
        </table>
      </div>
    </>
  );
}
