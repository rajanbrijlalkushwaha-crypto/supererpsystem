/* Beta — Goods Receipt: Create GRN | GRN List | Receipt Pending. The tab is kept in the URL (?tab=…).
 *   Create GRN      — material of a PO received: at our factory / store, straight at the client's site, or at another
 *                     vendor's factory (who works on it and sends it on); qty per PO product
 *   GRN List        — every receipt (also the ones a DC made when the vendor sent straight to the client, and the
 *                     classic Stock In ones); select → Edit / Delete
 *   Receipt Pending — per PO product: ordered · received · billed · left to receive
 * Saved to /api/grn (does not change stock). GRNs made by a DC are changed through that DC. */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useCompany } from '../../context/CompanyContext';
import { useAuth } from '../../context/AuthContext';
import { Svg } from '../../components/ui/Icon';
import { CSS as SALES_CSS, fyOf, FyFilter, fyCounts, useClearSel } from './BetaSales';
import { num, fdate, dash } from './BetaSalesBill';
import { n, r3, today, SKIP_PO, DELIVERY, poStatusOf, loadGrns, ownerIdx, poLines, grnQtyOf } from './BetaPurchaseLib';
import { POPicker, PX_CSS } from './BetaPurchaseParts';
import { lineTag } from './BetaPurchaseBill';
import { printGrn, printList, esc } from './BetaPurchasePrint';
import { fyLabel } from './BetaSales';

const TABS = [{ key: 'create', label: 'Create GRN' }, { key: 'list', label: 'GRN List' }, { key: 'pending', label: 'Receipt Pending' }];
const whereOf = g => (g.deliveryType === 'direct-client' ? `Direct to client${g.clientName ? `: ${g.clientName}` : ''}`
  : g.deliveryType === 'to-vendor' ? `At vendor${g.toVendorName ? `: ${g.toVendorName}` : ''}`
    : g.deliveryLocation || g.receiveAt || 'Our factory / store');

export default function BetaGRN() {
  const navigate = useNavigate();
  const { search } = useLocation();
  const params = new URLSearchParams(search);
  const urlTab = TABS.some(t => t.key === params.get('tab')) ? params.get('tab') : 'list';   // opens on the list; Create GRN is a click away
  const { selectedCompany } = useCompany() || {};
  const companyId = selectedCompany?.companyId;
  const { user } = useAuth() || {};

  const [pos, setPos] = useState(null);
  const [orders, setOrders] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [bills, setBills] = useState([]);
  const [grns, setGrns] = useState(null);
  const [reload, setReload] = useState(0);
  const [editing, setEditing] = useState(null);
  const [createFor, setCreateFor] = useState(() => (params.get('po') ? { poId: params.get('po'), k: 1 } : null));
  const [note, setNote] = useState(null);
  const [slot, setSlot] = useState(null);

  useEffect(() => {
    if (!companyId) return;
    const p = { params: { companyId } };
    axios.get('/api/purchase-orders', p).then(r => setPos(Array.isArray(r.data) ? r.data : [])).catch(() => setPos([]));
    axios.get('/api/sales-orders', p).then(r => setOrders(Array.isArray(r.data) ? r.data : [])).catch(() => setOrders([]));
    axios.get('/api/vendors', p).then(r => setVendors(Array.isArray(r.data) ? r.data : [])).catch(() => setVendors([]));
    axios.get('/api/bills', { params: { companyId, type: 'purchase' } }).then(r => setBills(Array.isArray(r.data) ? r.data.filter(b => b && b.type !== 'sales') : [])).catch(() => setBills([]));
    loadGrns(companyId, { withDeleted: true }).then(setGrns);   // the list shows deleted ones too
  }, [companyId, reload]);
  // a ?po= link (from Purchase Pending) opens the form for that PO
  useEffect(() => { const id = params.get('po'); if (id) setCreateFor({ poId: id, k: Date.now() }); }, [search]);   // eslint-disable-line react-hooks/exhaustive-deps

  const soMap = useMemo(() => { const m = {}; orders.forEach(o => { m[String(o.orderId)] = o; }); return m; }, [orders]);
  const poMap = useMemo(() => { const m = {}; (pos || []).forEach(p => { m[String(p.orderId)] = p; }); return m; }, [pos]);
  const livePos = useMemo(() => (pos || []).filter(p => !SKIP_PO.includes(p.status)), [pos]);
  const liveGrns = useMemo(() => (grns || []).filter(g => g.status !== 'deleted'), [grns]);
  const tab = editing ? 'create' : urlTab;
  const go = k => { setEditing(null); navigate(`/beta/grn?tab=${k}`); };
  const loading = pos === null || grns === null;

  return (
    <div className="sb">
      <style>{SALES_CSS + PX_CSS + '.gl { line-height:1.35; } .gl + .gl { margin-top:3px; }'}</style>
      <div className="sb-tabs" role="tablist">
        {TABS.map(t => (
          <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} className={`sb-tab${tab === t.key ? ' on' : ''}`} onClick={() => go(t.key)}>
            {t.label}{t.key === 'list' && grns && <span className="n">{liveGrns.length}</span>}
          </button>
        ))}
        <div className="sb-slot" ref={setSlot} />
      </div>
      {note && <div className="sb-note" role="status">{note}<button type="button" onClick={() => setNote(null)} aria-label="Dismiss">×</button></div>}

      {tab === 'create' && (
        <div className="sb-body">
          {loading ? <div className="sb-empty">Loading purchase orders and receipts…</div>
            : <GrnForm key={editing ? `e-${editing._id}` : createFor ? `p-${createFor.poId}-${createFor.k}` : 'new'}
              companyId={companyId} company={selectedCompany} pos={livePos} poMap={poMap} soMap={soMap} vendors={vendors} bills={bills} grns={liveGrns}
              editGrn={editing} presetPoId={createFor?.poId}
              onCancel={() => { setEditing(null); navigate('/beta/grn?tab=list'); }}
              onSaved={text => { setReload(x => x + 1); setNote(text); setCreateFor(null); if (editing) { setEditing(null); navigate('/beta/grn?tab=list'); } }} />}
        </div>
      )}
      {tab === 'list' && <GrnList grns={grns} poMap={poMap} soMap={soMap} companyId={companyId} company={selectedCompany} user={user} slot={slot} setNote={setNote}
        onEdit={g => { setNote(null); setEditing(g); }} onChanged={() => setReload(x => x + 1)} />}
      {tab === 'pending' && <ReceiptPending pos={livePos} soMap={soMap} bills={bills} grns={liveGrns} loading={loading} slot={slot} company={selectedCompany} user={user}
        onGrn={po => { setNote(null); setCreateFor({ poId: po.orderId, k: Date.now() }); navigate('/beta/grn?tab=create'); }}
        onBill={po => navigate(`/beta/purchase-bill?tab=create&po=${po.orderId}`)} />}
    </div>
  );
}

/* ── Create / edit a GRN ── */
function GrnForm({ companyId, company, pos, poMap, soMap, vendors, bills, grns, editGrn, presetPoId, onSaved, onCancel }) {
  const { user: me } = useAuth() || {};
  const [poId, setPoId] = useState(editGrn ? String(editGrn.poId || '') : presetPoId ? String(presetPoId) : '');
  const po = poMap[poId] || null;
  const so = po ? soMap[String(po.linkedSalesOrderId)] : null;
  const [head, setHead] = useState(() => ({
    receiptDate: editGrn?.receiptDate || today(), vendorDcNo: editGrn?.vendorDcNo || editGrn?.vendorInvoiceNo || '', vehicleNo: editGrn?.vehicleNo || '',
    receivedBy: editGrn?.receivedBy || '', remarks: editGrn?.remarks || '',
    deliveryType: editGrn?.deliveryType || 'our-yard', deliveryLocation: editGrn?.deliveryLocation || '',
    toVendorId: editGrn?.toVendorId ? String(editGrn.toVendorId) : '', toPoId: editGrn?.toPoId ? String(editGrn.toPoId) : '',
  }));
  const [qty, setQty] = useState({});
  const [rmk, setRmk] = useState({});
  const [picker, setPicker] = useState(!editGrn && !presetPoId);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [tried, setTried] = useState(false);

  const st = useMemo(() => (po ? poStatusOf(po, bills, grns, { skipGrn: editGrn?._id }) : []), [po, bills, grns, editGrn]);
  const initFor = useRef(null);
  useEffect(() => {
    if (!po || initFor.current === poId) return;
    initFor.current = poId;
    const q = {}, r = {};
    if (editGrn) {
      const lines = poLines(po);
      (editGrn.items || []).forEach((li, j) => { const i = ownerIdx(li, j, lines); if (i == null) return; q[i] = String(r3(n(q[i]) + grnQtyOf(li))); if (li.remarks) r[i] = li.remarks; });
    } else st.forEach(l => { if (l.toReceive > 0) q[l.idx] = String(l.toReceive); });
    setQty(q); setRmk(r);
  }, [po, poId, st, editGrn]);

  const set = k => e => { const v = e.target.value; setHead(h => ({ ...h, [k]: v })); };
  const errs = {};
  st.forEach(l => { if (n(qty[l.idx]) > l.toReceive + 1e-9) errs[l.idx] = `Only ${num(l.toReceive)} left on the PO`; });
  const send = st.filter(l => n(qty[l.idx]) > 0);
  const otherVendors = vendors.filter(v => String(v.vendorId) !== String(po?.vendorId)).sort((a, b) => String(a.vendorName).localeCompare(String(b.vendorName)));
  const toVendor = vendors.find(v => String(v.vendorId) === head.toVendorId) || null;
  const toVendorPos = po && toVendor ? pos.filter(p => String(p.vendorId) === head.toVendorId && String(p.linkedSalesOrderId) === String(po.linkedSalesOrderId)) : [];

  const save = async () => {
    setTried(true); setMsg(null);
    if (!po) return setMsg({ k: 'err', t: 'Pick the purchase order first.' });
    if (!head.receiptDate) return setMsg({ k: 'err', t: 'Enter the receipt date.' });
    if (head.deliveryType === 'to-vendor' && !toVendor) return setMsg({ k: 'err', t: 'Choose the vendor whose factory received the material.' });
    if (Object.keys(errs).length) return setMsg({ k: 'err', t: 'Some quantities are more than what is left on the PO — see the red boxes.' });
    if (!send.length) return setMsg({ k: 'err', t: 'Enter the received qty for at least one product.' });
    setBusy(true);
    try {
      const toPo = toVendorPos.find(p => String(p.orderId) === head.toPoId);
      const payload = {
        companyId, poId: String(po.orderId), poNo: po.poNo || po.poNumber || '', vendorId: po.vendorId || '', vendorName: po.vendorName || '',
        receiptDate: head.receiptDate, vendorDcNo: head.vendorDcNo.trim(), vehicleNo: head.vehicleNo.trim(), receivedBy: head.receivedBy.trim(), remarks: head.remarks.trim(),
        soId: po.linkedSalesOrderId || '', orderNo: so?.orderNo || '', clientId: so?.clientId || so?.customerCode || '', clientName: so?.customerName || '',
        deliveryType: head.deliveryType,
        deliveryLocation: head.deliveryType === 'our-yard' ? head.deliveryLocation.trim()
          : head.deliveryType === 'direct-client' ? [so?.shipToName, so?.shipToCity || so?.customerCity].filter(Boolean).join(', ') : '',
        toVendorId: head.deliveryType === 'to-vendor' ? toVendor.vendorId : '', toVendorName: head.deliveryType === 'to-vendor' ? toVendor.vendorName : '',
        toPoId: head.deliveryType === 'to-vendor' && toPo ? String(toPo.orderId) : '', toPoNo: head.deliveryType === 'to-vendor' && toPo ? toPo.poNo || '' : '',
        source: editGrn?.source || 'manual',
        items: send.map(l => ({ itemIdx: l.idx, itemCode: l.code, itemName: l.name, hsnCode: l.hsn, unit: l.unit, orderedQty: l.qty, rate: l.rate, receivedQty: n(qty[l.idx]), remarks: (rmk[l.idx] || '').trim() })),
        ...(editGrn ? {} : { createdBy: { id: me?.id, name: me?.name || me?.username || '', username: me?.username || '' } }),
      };
      const r = editGrn ? await axios.put(`/api/grn/${editGrn.grnId}`, payload) : await axios.post('/api/grn', payload);
      const no = editGrn?.grnNo || r.data?.grnNo || '';
      onSaved?.(`${editGrn ? 'Updated' : 'Saved'} GRN ${no} — ${send.length} product${send.length === 1 ? '' : 's'} of PO ${payload.poNo} received ${DELIVERY[head.deliveryType].toLowerCase()}${head.deliveryType === 'to-vendor' ? ` (${toVendor.vendorName})` : ''}.`);
    } catch (e) { setMsg({ k: 'err', t: e.response?.data?.error || 'Could not save the GRN.' }); }
    finally { setBusy(false); }
  };

  const pickRows = useMemo(() => pos.map(p => { const s = poStatusOf(p, bills, grns); return { po: p, so: soMap[String(p.linkedSalesOrderId)], qty: s.reduce((a, l) => a + l.qty, 0), left: s.reduce((a, l) => a + l.toReceive, 0) }; }), [pos, bills, grns, soMap]);
  const radio = (k, title, sub) => (
    <label className={head.deliveryType === k ? 'on' : ''}><input type="radio" checked={head.deliveryType === k} onChange={() => setHead(h => ({ ...h, deliveryType: k }))} />
      <span><b>{title}</b><small>{sub}</small></span></label>
  );

  return (
    <div className="sf">
      <div className="sf-hero">
        <span className="ic"><Svg name="box" size={15} /></span>
        <h1>{editGrn ? `Edit GRN ${editGrn.grnNo || ''}` : 'Create Goods Receipt (GRN)'}</h1>
        <span className="grow" />
        {po && <span className="sf-chip"><small>PO</small><b>{po.poNo || po.orderId}</b></span>}
        <span className="sf-chip"><small>Receiving</small><b>{num(send.reduce((s, l) => s + n(qty[l.idx]), 0))}</b></span>
      </div>

      <div className="sf-2" style={{ marginTop: 10 }}>
        <div className="sf-card">
          <div className="sf-ch"><span className="ico"><Svg name="cart" size={13} /></span><b>Purchase Order</b></div>
          <table className="sf-kv"><tbody>
            <tr><th>PO No. <i>*</i></th><td>
              <div className="sf-srch">
                <input readOnly value={po ? `${po.poNo || po.orderId} · ${po.vendorName || ''}` : ''} placeholder="Click to pick the purchase order" onClick={() => !editGrn && setPicker(true)} className={tried && !po ? 'bad' : ''} disabled={!!editGrn} />
                <button type="button" className="sf-sbtn" onClick={() => setPicker(true)} disabled={!!editGrn} aria-label="Pick purchase order"><Svg name="search" size={14} /></button>
              </div>
            </td></tr>
            <tr><th>Vendor</th><td>{po ? <b>{po.vendorName}</b> : '—'}</td></tr>
            <tr><th>PO Date</th><td>{po ? fdate(po.poDate) : '—'}</td></tr>
            <tr><th>Order / Client</th><td>{so ? `${so.orderNo} · ${so.customerName || ''}` : '—'}</td></tr>
          </tbody></table>
        </div>
        <div className="sf-card">
          <div className="sf-ch"><span className="ico"><Svg name="file" size={13} /></span><b>Receipt Details</b></div>
          <table className="sf-kv"><tbody>
            <tr><th>Receipt Date <i>*</i></th><td><input type="date" value={head.receiptDate} onChange={set('receiptDate')} className={tried && !head.receiptDate ? 'bad' : ''} /></td></tr>
            <tr><th>Vendor DC / Inv. No.</th><td><input value={head.vendorDcNo} onChange={set('vendorDcNo')} placeholder="The vendor's challan or invoice no." /></td></tr>
            <tr><th>Vehicle No.</th><td><input value={head.vehicleNo} onChange={set('vehicleNo')} placeholder="Optional" /></td></tr>
            <tr><th>Received By</th><td><input value={head.receivedBy} onChange={set('receivedBy')} placeholder="Optional" /></td></tr>
          </tbody></table>
        </div>
      </div>

      <div className="sf-card">
        <div className="sf-ch"><span className="ico"><Svg name="swap" size={13} /></span><b>Material received at</b></div>
        <div style={{ padding: 10 }}>
          <div className="px-rad" role="radiogroup" aria-label="Received at">
            {radio('our-yard', 'Our factory / store', 'The vendor delivered to us')}
            {radio('direct-client', 'Direct to client', so ? `Vendor sent it straight to ${so.customerName || 'the client'}` : 'Vendor sent it straight to the client')}
            {radio('to-vendor', 'Another vendor’s factory', 'Sent to another vendor, who sends it on to the client')}
          </div>
          <table className="sf-kv" style={{ marginTop: 10, border: '1px solid #DCE6E8' }}><tbody>
            {head.deliveryType === 'our-yard' && <tr><th>Location</th><td><input value={head.deliveryLocation} onChange={set('deliveryLocation')} placeholder={`e.g. Factory${company?.city ? `, ${company.city}` : ''}`} /></td></tr>}
            {head.deliveryType === 'direct-client' && <tr><th>Client site</th><td>{so ? <><b>{so.customerName}</b>{[so.shipToName, so.shipToCity || so.customerCity].filter(Boolean).length ? <span style={{ color: '#667085' }}> · {[so.shipToName, so.shipToCity || so.customerCity].filter(Boolean).join(', ')}</span> : ''}</> : <span style={{ color: '#98A2B3' }}>This PO has no sales order</span>}</td></tr>}
            {head.deliveryType === 'to-vendor' && <>
              <tr><th>Vendor <i>*</i></th><td><select value={head.toVendorId} onChange={e => setHead(h => ({ ...h, toVendorId: e.target.value, toPoId: '' }))} className={tried && !toVendor ? 'bad' : ''}>
                <option value="">Choose the vendor…</option>{otherVendors.map(v => <option key={v.vendorId} value={String(v.vendorId)}>{v.vendorName}{v.city ? ` · ${v.city}` : ''}</option>)}</select></td></tr>
              <tr><th>Their PO</th><td><select value={head.toPoId} onChange={set('toPoId')} disabled={!toVendor}>
                <option value="">{toVendor ? (toVendorPos.length ? 'Optional — the PO of this order given to them' : 'No PO of this order with them') : '—'}</option>
                {toVendorPos.map(p => <option key={p.orderId} value={String(p.orderId)}>{p.poNo} · {fdate(p.poDate)}</option>)}</select></td></tr>
            </>}
            <tr><th>Remarks</th><td><input value={head.remarks} onChange={set('remarks')} placeholder="Optional" /></td></tr>
          </tbody></table>
        </div>
      </div>

      <div className="sf-card">
        <div className="sf-ch"><span className="ico"><Svg name="box" size={13} /></span><b>Products received</b><span className="grow" />
          {po && <button type="button" className="sf-lnk" onClick={() => { const q = {}; st.forEach(l => { q[l.idx] = l.toReceive > 0 ? String(l.toReceive) : ''; }); setQty(q); }}>Fill all left to receive</button>}</div>
        {!po ? <div className="sf-empty">Pick the purchase order to see its products.</div> : (
          <table className="sf-t sf-pt">
            <colgroup><col style={{ width: 34 }} /><col /><col style={{ width: 80 }} /><col style={{ width: 84 }} /><col style={{ width: 74 }} /><col style={{ width: 92 }} /><col style={{ width: 120 }} /><col style={{ width: 220 }} /></colgroup>
            <thead>
              <tr className="grp"><th colSpan={2} /><th colSpan={4} className="c">On the PO</th><th colSpan={2} className="c now">This receipt</th></tr>
              <tr><th>Sl</th><th>Product</th><th className="r">PO Qty</th><th className="r">Received</th><th className="r">Billed</th><th className="r">Left to receive</th><th className="r now first">Received now</th><th className="now">Remarks</th></tr>
            </thead>
            <tbody>{st.map((l, i) => {
              const q = n(qty[l.idx]);
              return (
                <tr key={l.idx} className={l.toReceive <= 0 && !q ? 'off' : ''}>
                  <td>{i + 1}</td>
                  <td><div className="pn">{l.name}</div><div className="ps">{l.hsn ? `HSN ${l.hsn}` : 'No HSN'} · {l.unit}{l.matPending > 0 ? <> · <span className="px-tag mp">Billed, material pending {num(l.matPending)}</span></> : null}</div></td>
                  <td className="r">{num(l.qty)}</td><td className="r">{l.received ? num(l.received) : <span className="mut">0</span>}</td>
                  <td className="r">{l.billed ? num(l.billed) : <span className="mut">0</span>}</td>
                  <td className={`r ${l.toReceive > 0 ? 'pend' : 'done'}`}>{l.toReceive > 0 ? num(l.toReceive) : '✓ Received'}</td>
                  <td className="r now first">
                    <input className={`sf-q${errs[l.idx] ? ' bad' : ''}`} inputMode="decimal" value={qty[l.idx] ?? ''} placeholder="0" disabled={l.toReceive <= 0 && !q}
                      onChange={e => { const v = e.target.value.replace(/[^\d.]/g, ''); setQty(x => ({ ...x, [l.idx]: v })); }} aria-label={`Received qty for ${l.name}`} />
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
        <div className="info">{po ? <>Receiving <b>{num(send.reduce((s, l) => s + n(qty[l.idx]), 0))}</b> qty of {send.length} product{send.length === 1 ? '' : 's'} · {DELIVERY[head.deliveryType]}</> : 'Pick a purchase order to start.'}</div>
        {editGrn && <button type="button" className="sf-b ghost" onClick={onCancel} disabled={busy}>Cancel</button>}
        <button type="button" className="sf-b pri" onClick={save} disabled={busy}>{busy ? 'Saving…' : editGrn ? 'Update GRN' : 'Save GRN'}</button>
      </div>

      {picker && <POPicker rows={pickRows} title="Select Purchase Order" leftLabel="Left to receive" onClose={() => setPicker(false)}
        onPick={r => { setPicker(false); if (String(r.po.orderId) !== poId) { initFor.current = null; setPoId(String(r.po.orderId)); setMsg(null); } }} />}
    </div>
  );
}

/* ── GRN list ── */
const GCOLS = [['Date', '6.4%'], ['GRN No.', '8.4%'], ['Vendor', '11.6%'], ['PO No.', '9%'], ['Order No.', '8%'], ['Client', '11%'], ['Products', '19%'], ['Qty', '4.4%', 'r'],
  ['Received at', '12.6%'], ['Vendor DC / Inv.', '7.2%'], ['Made from', '6.4%', 'c']];
function GrnList({ grns, poMap, soMap, companyId, company, user, slot, setNote, onEdit, onChanged }) {
  const [fySel, setFySel] = useState(() => [fyOf(new Date())]);
  const [q, setQ] = useState('');
  const [selId, setSelId] = useState(null);
  const [askDel, setAskDel] = useState(null);
  const [busy, setBusy] = useState(false);
  useClearSel(askDel ? null : selId, setSelId, '.sb-t tbody.og, .sb-tools, .sb-ask');
  const gone = g => g.status === 'deleted';
  const all = useMemo(() => [...(grns || [])].sort((a, b) => (gone(a) - gone(b)) || String(b.receiptDate || '').localeCompare(String(a.receiptDate || '')) || String(b._id).localeCompare(String(a._id), undefined, { numeric: true })), [grns]);
  const fyList = useMemo(() => fyCounts(all, g => g.receiptDate), [all]);
  const soOf = g => soMap[String(g.soId || poMap[String(g.poId)]?.linkedSalesOrderId)];
  const list = useMemo(() => {
    const w = q.toLowerCase().split(/\s+/).filter(Boolean);
    return all.filter(g => (!fySel.length || fySel.includes(fyOf(g.receiptDate)))
      && (!w.length || w.every(x => `${g.grnNo || ''} ${g.vendorName || ''} ${g.poNo || ''} ${soOf(g)?.orderNo || g.orderNo || ''} ${g.clientName || soOf(g)?.customerName || ''} ${(g.items || []).map(i => i.itemName).join(' ')} ${whereOf(g)} ${g.dcNo || ''}`.toLowerCase().includes(x))));
  }, [all, fySel, q, soMap, poMap]);   // eslint-disable-line react-hooks/exhaustive-deps
  const sel = list.find(g => g._id === selId) || null;
  const fyText = fySel.length ? [...fySel].sort().reverse().map(fyLabel).join(', ') : 'All years';
  const printOne = g => printGrn({ g, po: poMap[String(g.poId)], so: soOf(g), company, user });
  const printAll = () => printList({
    title: 'GRN List', filter: [fyText, q.trim() && `Search: ${q.trim()}`].filter(Boolean).join('  |  '), company, user,
    cols: [['Date', 'c', '7%'], ['GRN No.', '', '9%'], ['Vendor', '', '12%'], ['PO No.', '', '10%'], ['Order No.', '', '8.5%'], ['Client', '', '12%'], ['Products', '', '20%'], ['Qty', 'r', '4.5%'], ['Received at', '', '11%'], ['Status', 'c', '6%']],
    rows: list.map(g => { const so = soOf(g), its = (g.items || []).filter(i => i && grnQtyOf(i) > 0);
      const cells = [fdate(g.receiptDate), esc(g.grnNo || g._id), esc(g.vendorName || ''), esc(g.poNo || ''), esc(so?.orderNo || g.orderNo || ''), esc(g.clientName || so?.customerName || ''),
        its.map(i => esc(i.itemName)).join('<br>'), its.map(i => num(grnQtyOf(i))).join('<br>'), esc(whereOf(g)), gone(g) ? 'Deleted' : g.source === 'dc' ? `DC ${esc(g.dcNo || '')}` : g._src === 'stock' ? 'Stock In' : 'GRN'];
      return gone(g) ? { html: `<tr class="gone">${cells.map(c => `<td>${c}</td>`).join('')}</tr>` } : cells; }),
  });
  const canChange = g => g && g._src === 'grn' && g.source !== 'dc' && !gone(g);
  const why = g => (!g ? '' : gone(g) ? `Deleted${g.deletedBy ? ` by ${g.deletedBy}` : ''}${g.deletedAt ? ` on ${fdate(g.deletedAt)}` : ''} — kept in the list, does not count` : g._src === 'stock' ? 'Made in the classic Stock In — change it there' : g.source === 'dc' ? `Made by DC ${g.dcNo || ''} — change that DC` : '');
  const doDelete = async g => {
    setBusy(true);
    try { await axios.delete(`/api/grn/${g.grnId}`, { params: { companyId } }); setAskDel(null); setSelId(null); setNote(`Deleted GRN ${g.grnNo} — it stays at the end of the list (struck through) and its quantities are pending to receive again.`); onChanged(); }
    catch (e) { setNote(e.response?.data?.error || 'Could not delete the GRN.'); }
    finally { setBusy(false); }
  };
  const made = g => (gone(g) ? <span className="px-tag del" title={why(g)}>Deleted</span> : g._src === 'stock' ? <span className="px-tag no">Stock In</span> : g.source === 'dc' ? <span className="px-tag dc" title={`Made when DC ${g.dcNo || ''} was saved`}>DC {g.dcNo || ''}</span> : <span className="px-tag no">GRN</span>);

  return (
    <>
      {slot && createPortal(<>
        <FyFilter list={fyList} total={all.length} sel={fySel} setSel={setFySel} />
        <input className="sb-search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search GRN, vendor, PO, order, client, product…" aria-label="Search GRNs" />
        <div className="sb-tools">
          <span className="sb-picked">{sel ? <>Selected: <b>{sel.grnNo || sel._id}</b></> : 'Click a GRN to select'}</span>
          <button type="button" className="sb-tbtn" disabled={!sel || gone(sel)} onClick={() => printOne(sel)}><Svg name="file" size={13} />Print GRN</button>
          <button type="button" className="sb-tbtn" disabled={!list.length} onClick={printAll}><Svg name="file" size={13} />Print List</button>
          <button type="button" className="sb-tbtn" disabled={!canChange(sel)} title={why(sel)} onClick={() => onEdit(sel)}><Svg name="settings" size={13} />Edit</button>
          <button type="button" className="sb-tbtn del" disabled={!canChange(sel)} title={why(sel)} onClick={() => setAskDel(sel)}><Svg name="x" size={13} />Delete</button>
        </div>
      </>, slot)}
      {askDel && (
        <div className="sb-ask" role="alertdialog" aria-label="Confirm delete">
          <span><b>Delete GRN {askDel.grnNo}</b> ({askDel.vendorName || '—'}, PO {askDel.poNo || '—'})? Its quantities become pending to receive again.</span>
          <button type="button" className="sb-abtn" onClick={() => setAskDel(null)} disabled={busy}>Keep</button>
          <button type="button" className="sb-abtn danger" onClick={() => doDelete(askDel)} disabled={busy}>{busy ? 'Deleting…' : 'Yes, delete'}</button>
        </div>
      )}
      <div className="sb-kpi">
        <div className="sb-k"><small>GRNs</small><b>{list.filter(g => !gone(g)).length}{list.some(gone) ? <span style={{ fontSize: 11, color: '#B42318', fontWeight: 600 }}> + {list.filter(gone).length} deleted</span> : null}</b></div>
        <div className="sb-k"><small>Our factory / store</small><b>{list.filter(g => !gone(g) && !['direct-client', 'to-vendor'].includes(g.deliveryType)).length}</b></div>
        <div className="sb-k"><small>Direct to client</small><b>{list.filter(g => !gone(g) && g.deliveryType === 'direct-client').length}</b></div>
        <div className="sb-k"><small>To another vendor</small><b>{list.filter(g => !gone(g) && g.deliveryType === 'to-vendor').length}</b></div>
      </div>
      <div className="sb-list">
        <table className="sb-t px">
          <colgroup>{GCOLS.map(([h, w]) => <col key={h} style={{ width: w }} />)}</colgroup>
          <thead><tr>{GCOLS.map(([h, , a]) => <th key={h} className={a || ''}>{h}</th>)}</tr></thead>
          {grns === null ? <tbody><tr><td colSpan={GCOLS.length} className="sb-empty">Loading…</td></tr></tbody>
            : !list.length ? <tbody><tr><td colSpan={GCOLS.length} className="sb-empty">{q ? `No GRN matches “${q}”.` : 'No goods receipts in this year.'}</td></tr></tbody> : null}
          {grns !== null && list.map(g => {
            const so = soOf(g), its = (g.items || []).filter(i => i && grnQtyOf(i) > 0);
            return (
              <tbody key={g._id} className={`og${selId === g._id ? ' sel' : ''}${gone(g) ? ' gone' : ''}`} onClick={() => setSelId(g._id)} onDoubleClick={() => { setSelId(g._id); if (canChange(g)) onEdit(g); }} title={why(g) || 'Click to select · double-click to edit'}>
                <tr>
                  <td className="nw">{fdate(g.receiptDate)}</td><td className="bno">{g.grnNo || g._id}</td><td className="cl">{dash(g.vendorName)}</td>
                  <td className="no">{dash(g.poNo)}</td><td className="no">{dash(so?.orderNo || g.orderNo)}</td><td>{dash(g.clientName || so?.customerName)}</td>
                  <td>{its.length ? its.map((i, k) => <div key={k} className="gl">{i.itemName}</div>) : <span className="mut">—</span>}</td>
                  <td className="r">{its.map((i, k) => <div key={k} className="gl">{num(grnQtyOf(i))}{i.unit ? <span className="mut"> {i.unit}</span> : null}</div>)}</td>
                  <td>{whereOf(g)}{g.toPoNo ? <span className="mut"> · PO {g.toPoNo}</span> : ''}</td>
                  <td className="nw">{dash(g.vendorDcNo || g.vendorInvoiceNo || (g._src === 'stock' ? g.dcNo : ''))}</td>
                  <td className="c keep">{made(g)}</td>
                </tr>
              </tbody>
            );
          })}
        </table>
      </div>
    </>
  );
}

/* ── Receipt Pending: per PO product — what is still to come ── */
const RCOLS = [['Order No.', '7.6%'], ['Client', '11%'], ['Vendor', '11%'], ['PO No.', '8.8%'], ['PO Date', '5.8%'], ['Due Date', '5.8%'], ['Product', '17.6%'], ['PO Qty', '5.2%', 'r'],
  ['Received', '5.4%', 'r'], ['Left to receive', '5.8%', 'r'], ['Billed', '5%', 'r'], ['Status', '11%', 'c']];
function ReceiptPending({ pos, soMap, bills, grns, loading, slot, company, user, onGrn, onBill }) {
  const [fySel, setFySel] = useState(() => [fyOf(new Date())]);
  const [all, setAll] = useState(false);
  const [q, setQ] = useState('');
  const [selId, setSelId] = useState(null);
  useClearSel(selId, setSelId, '.sb-t tbody.og, .sb-tools');
  const rowsAll = useMemo(() => pos.map(po => ({ po, so: soMap[String(po.linkedSalesOrderId)], lines: poStatusOf(po, bills, grns) }))
    .sort((a, b) => String(b.po.poDate || '').localeCompare(String(a.po.poDate || '')) || n(b.po.orderId) - n(a.po.orderId)), [pos, soMap, bills, grns]);
  const fyList = useMemo(() => fyCounts(rowsAll, r => r.po.poDate), [rowsAll]);
  const rows = useMemo(() => {
    const w = q.toLowerCase().split(/\s+/).filter(Boolean);
    return rowsAll.filter(r => (!fySel.length || fySel.includes(fyOf(r.po.poDate))) && (all || r.lines.some(l => l.toReceive > 0))
      && (!w.length || w.every(x => `${r.po.poNo || ''} ${r.po.vendorName || ''} ${r.so?.orderNo || ''} ${r.so?.customerName || ''} ${r.lines.map(l => l.name).join(' ')}`.toLowerCase().includes(x))));
  }, [rowsAll, fySel, all, q]);
  const sel = rows.find(r => String(r.po.orderId) === selId) || null;
  const left = rows.reduce((s, r) => s + r.lines.filter(l => l.toReceive > 0).length, 0);
  const printAll = () => printList({
    title: 'Receipt Pending', company, user,
    filter: [fySel.length ? [...fySel].sort().reverse().map(fyLabel).join(', ') : 'All years', all ? 'incl. fully received' : 'left to receive', q.trim() && `Search: ${q.trim()}`].filter(Boolean).join('  |  '),
    cols: [['Order No.', '', '8.5%'], ['Client', '', '12%'], ['Vendor', '', '12%'], ['PO No.', '', '10%'], ['PO Date', 'c', '6.5%'], ['Due Date', 'c', '6.5%'], ['Product', '', '19%'], ['PO Qty', 'r', '5.5%'], ['Received', 'r', '6%'], ['Left', 'r', '5.5%'], ['Billed', 'r', '5.5%']],
    rows: rows.flatMap(r => r.lines.filter(l => all || l.toReceive > 0).map((l, i) => [i ? '' : esc(r.so?.orderNo || ''), i ? '' : esc(r.so?.customerName || ''), i ? '' : esc(r.po.vendorName || ''), i ? '' : esc(r.po.poNo || ''), i ? '' : fdate(r.po.poDate),
      fdate(l.it?.dueDate || r.po.deliveryDate), esc(l.name), `${num(l.qty)} ${esc(l.unit)}`, num(l.received), `<b>${num(l.toReceive)}</b>`, num(l.billed)])),
  });

  return (
    <>
      {slot && createPortal(<>
        <FyFilter list={fyList} total={rowsAll.length} sel={fySel} setSel={setFySel} />
        <input className="sb-search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search PO, vendor, order, client, product…" aria-label="Search" />
        <label className={`sb-chk${all ? ' on' : ''}`}><input type="checkbox" checked={all} onChange={e => setAll(e.target.checked)} />Show fully received</label>
        <div className="sb-tools">
          <span className="sb-picked">{sel ? <>Selected: <b>{sel.po.poNo || sel.po.orderId}</b></> : 'Click a PO to select'}</span>
          <button type="button" className="sb-tbtn" disabled={!rows.length} onClick={printAll}><Svg name="file" size={13} />Print</button>
          <button type="button" className="sb-tbtn" disabled={!sel} onClick={() => onGrn(sel.po)}><Svg name="box" size={13} />Make GRN</button>
          <button type="button" className="sb-tbtn" disabled={!sel} onClick={() => onBill(sel.po)}><Svg name="file" size={13} />Make Bill</button>
        </div>
      </>, slot)}
      <div className="sb-kpi">
        <div className="sb-k"><small>POs</small><b>{rows.length}</b></div>
        <div className="sb-k"><small>Products left to receive</small><b style={{ color: '#B54708' }}>{left}</b></div>
        <div className="sb-k"><small>Billed — material pending</small><b style={{ color: '#3538CD' }}>{rows.reduce((s, r) => s + r.lines.filter(l => l.matPending > 0).length, 0)}</b></div>
        <div className="sb-k"><small>Qty left to receive</small><b>{num(rows.reduce((s, r) => s + r.lines.reduce((a, l) => a + l.toReceive, 0), 0))}</b></div>
      </div>
      <div className="sb-list">
        <table className="sb-t px">
          <colgroup>{RCOLS.map(([h, w]) => <col key={h} style={{ width: w }} />)}</colgroup>
          <thead><tr>{RCOLS.map(([h, , a]) => <th key={h} className={a || ''}>{h}</th>)}</tr></thead>
          {loading ? <tbody><tr><td colSpan={RCOLS.length} className="sb-empty">Loading…</td></tr></tbody>
            : !rows.length ? <tbody><tr><td colSpan={RCOLS.length} className="sb-empty">{q ? `Nothing matches “${q}”.` : 'All material of these POs is received.'}</td></tr></tbody> : null}
          {!loading && rows.map(r => {
            const id = String(r.po.orderId), lines = r.lines.length ? r.lines : [null], span = lines.length;
            return (
              <tbody key={id} className={`og${selId === id ? ' sel' : ''}`} onClick={() => setSelId(id)} onDoubleClick={() => onGrn(r.po)} title="Click to select · double-click to make the GRN">
                {lines.map((l, i) => (
                  <tr key={i}>
                    {i === 0 && <>
                      <td rowSpan={span} className="no">{dash(r.so?.orderNo)}</td><td rowSpan={span}>{dash(r.so?.customerName)}</td>
                      <td rowSpan={span} className="cl">{dash(r.po.vendorName)}</td><td rowSpan={span} className="no">{r.po.poNo || r.po.orderId}</td>
                      <td rowSpan={span} className="nw">{fdate(r.po.poDate)}</td>
                    </>}
                    {l ? <>
                      <td className="nw">{fdate(l.it?.dueDate || r.po.deliveryDate)}</td>
                      <td>{l.name}</td><td className="r">{num(l.qty)} <span className="mut">{l.unit}</span></td>
                      <td className="r">{l.received ? num(l.received) : <span className="mut">0</span>}</td>
                      <td className={`r ${l.toReceive > 0 ? 'pend' : 'done'}`}>{l.toReceive > 0 ? num(l.toReceive) : '✓'}</td>
                      <td className="r">{l.billed ? num(l.billed) : <span className="mut">0</span>}</td>
                      <td className="c">{lineTag(l)}</td>
                    </> : <td colSpan={7} className="c mut">No products on this PO</td>}
                  </tr>
                ))}
              </tbody>
            );
          })}
        </table>
      </div>
    </>
  );
}
