/* Beta — Sales Order pop-up (double-click an order in the list).
 * Shows every detail of the order incl. specs and attachments; Edit · Print · Cancel order. */
import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';
import { printSO } from './BetaSOPrint';
import { withLatestClient, latestClientPatch } from '../../utils/latestClient';
import { Svg } from '../../components/ui/Icon';

const TEAL = '#03444f';
const F = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
const HEAD = 'linear-gradient(90deg, #1B7682 0%, #3C9AA4 100%)';

const STATUS = {
  approved: ['Approved', '#16A34A'], completed: ['Completed', '#0E7490'], 'in-progress': ['In progress', '#2563EB'],
  pending: ['Pending', '#F79009'], draft: ['Draft', '#667085'], rejected: ['Rejected', '#D92D20'], cancelled: ['Cancelled', '#B42318'],
};

const n = v => parseFloat(v) || 0;
const amt = v => (Number(v) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dash = v => (v == null || String(v).trim() === '' ? '—' : v);
const fdate = d => {
  if (!d) return '—';
  const x = new Date(d);
  return isNaN(x) ? String(d) : x.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};
const parseSpec = raw => { try { const p = JSON.parse(raw || ''); return p && typeof p === 'object' ? p : {}; } catch { return {}; } };
const extOf = s => String(s || '').split('.').pop().slice(0, 4);

const CSS = `
.ov-back { position:fixed; inset:0; z-index:1500; background:rgba(2,24,28,.5); display:flex; align-items:center; justify-content:center; padding:2.5vh 2vw; font-family:${F}; }
.ov { width:100%; max-width:1500px; height:95vh; height:calc(95vh / var(--ui-zoom, 1)); display:flex; flex-direction:column; background:#fff; border:1px solid #9DBDC1; box-shadow:0 20px 60px rgba(0,0,0,.35); }
.ov-hd { display:flex; align-items:center; gap:10px; padding:9px 14px; background:${TEAL}; color:#fff; flex-shrink:0; }
.ov-hd h2 { margin:0; font-size:15px; font-weight:700; white-space:nowrap; }
.ov-hd .sub { font-size:12px; opacity:.8; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; flex:1; }
.ov-st { padding:3px 9px; border-radius:2px; font-size:11px; font-weight:700; color:#fff; white-space:nowrap; }
.ov-btn { height:30px; padding:0 13px; border:1px solid rgba(255,255,255,.4); border-radius:2px; background:rgba(255,255,255,.1); color:#fff; cursor:pointer;
  display:inline-flex; align-items:center; gap:6px; font:600 12.5px ${F}; white-space:nowrap; }
.ov-btn:hover { background:rgba(255,255,255,.22); }
.ov-btn.warn { background:#B42318; border-color:#B42318; }
.ov-btn.warn:hover { background:#912018; }
.ov-btn:disabled { opacity:.55; cursor:default; }
.ov-x { width:30px; padding:0; justify-content:center; font-size:18px; }
.ov-ask { display:flex; align-items:center; gap:8px; padding:9px 14px; background:#FEF3F2; border-bottom:1px solid #FECDCA; font-size:12.5px; color:#7A271A; flex-shrink:0; }
.ov-ask span { flex:1; }
.ov-abtn { height:28px; padding:0 12px; border:1px solid #FECDCA; border-radius:2px; background:#fff; color:#344054; cursor:pointer; font:600 12px ${F}; }
.ov-abtn.danger { background:#B42318; border-color:#B42318; color:#fff; }
.ov-note { padding:8px 14px; font-size:12.5px; font-weight:500; flex-shrink:0; }
.ov-note.ok { background:#E6F4EA; color:#1E7B34; } .ov-note.err { background:#FDECEC; color:#B42318; }
.ov-body { flex:1; min-height:0; overflow-y:auto; background:#EEF4F4; padding-bottom:12px; }

.ov-2 { display:grid; grid-template-columns:1fr 1fr; margin-bottom:10px; }
.ov-2 > .ov-card { margin:0; }
.ov-2 > .ov-card + .ov-card { border-left:1px solid #B9CED1; }
.ov-card { background:#fff; border-top:1px solid #B9CED1; border-bottom:1px solid #B9CED1; margin-bottom:10px; }
.ov-ch { display:flex; align-items:center; gap:9px; padding:6px 10px; background:${HEAD}; color:#fff; }
.ov-ch .ico { width:22px; height:22px; display:grid; place-items:center; background:rgba(255,255,255,.16); border-radius:2px; }
.ov-ch b { font-size:13px; } .ov-ch .grow { flex:1; } .ov-ch small { font-size:11.5px; opacity:.85; }
.ov-kv { width:100%; border-collapse:collapse; table-layout:fixed; font-size:12.5px; }
.ov-kv th { width:130px; padding:7px 10px; background:#F4F8F8; border:1px solid #DCE6E8; text-align:left; font-weight:600; color:#344054; vertical-align:top; }
.ov-kv td { padding:7px 10px; border:1px solid #DCE6E8; color:#101828; word-break:break-word; vertical-align:top; }
.ov-kv tr:first-child > * { border-top:none; } .ov-kv tr > :first-child { border-left:none; } .ov-kv tr > :last-child { border-right:none; } .ov-kv tr:last-child > * { border-bottom:none; }
.ov-kv .mono { font-family:ui-monospace, Consolas, monospace; font-size:12px; }
.ov-t { width:100%; border-collapse:collapse; font-size:12.5px; }
.ov-t th { background:#D4EBEE; color:#000; font-weight:700; font-size:11.5px; text-align:left; padding:7px 8px; border-bottom:1px solid #A9CDD2; white-space:nowrap; }
.ov-t td { padding:7px 8px; border-bottom:1px solid #EDF2F3; color:#101828; vertical-align:top; }
/* thin black lines between columns */
.ov-t th { border-right:1px solid #A9CDD2; }
.ov-t td { border-right:1px solid #000; }
.ov-t .r { text-align:right; white-space:nowrap; font-variant-numeric:tabular-nums; }
.ov-t td.sn { color:#667085; width:34px; }
.ov-t tbody tr:nth-child(even) td { background:#FAFCFC; }
.ov-empty { padding:14px; font-size:12.5px; color:#98A2B3; text-align:center; }
.ov-sum { display:grid; grid-template-columns:1fr 360px; gap:0; margin-bottom:10px; }
.ov-sum > .ov-card { margin:0; }
.ov-tot { background:#fff; border:1px solid #B9CED1; border-right:none; padding:10px 16px; }
.ov-tot .row { display:flex; justify-content:space-between; padding:3px 0; font-size:12.5px; color:#475467; font-variant-numeric:tabular-nums; }
.ov-tot .row b { color:#101828; font-weight:600; }
.ov-tot .gt { margin-top:6px; padding-top:8px; border-top:1px dashed #C9D7DA; font-size:15px; color:${TEAL}; }
.ov-tot .gt b { color:${TEAL}; font-weight:700; }
.ov-spec { display:grid; grid-template-columns:260px 1fr; border-bottom:1px solid #F0F4F4; font-size:12.5px; }
.ov-spec:last-child { border-bottom:none; }
.ov-spec .nm { padding:10px 14px; background:#FAFCFC; border-right:1px solid #F0F4F4; font-weight:600; color:#101828; }
.ov-spec .bd { padding:10px 14px; color:#344054; white-space:pre-wrap; }
.ov-files { display:flex; flex-wrap:wrap; gap:6px; margin-top:6px; }
.ov-file { display:grid; grid-template-columns:36px 1fr auto; gap:10px; align-items:center; padding:7px 10px; border-bottom:1px solid #F0F4F4; font-size:12.5px; }
.ov-file:last-child { border-bottom:none; }
.ov-file .ext, .ov-chip .ext { width:36px; height:30px; display:grid; place-items:center; background:${TEAL}; color:#fff; font-size:9.5px; font-weight:700; text-transform:uppercase; border-radius:2px; }
.ov-file b { display:block; color:#101828; font-weight:600; } .ov-file small { color:#667085; font-size:11px; }
.ov-file .acts { display:flex; gap:6px; }
.ov-link { display:inline-flex; align-items:center; gap:5px; height:28px; padding:0 11px; border:1px solid ${TEAL}; border-radius:2px; color:${TEAL}; background:#fff; text-decoration:none; font:600 12px ${F}; }
.ov-link:hover { background:${TEAL}; color:#fff; }
.ov-chip { display:inline-flex; align-items:center; gap:7px; padding:3px 9px 3px 3px; border:1px solid #DCE6E8; border-radius:2px; text-decoration:none; color:#101828; font-size:12px; }
.ov-chip .ext { width:30px; height:22px; font-size:8.5px; }
.ov-chip:hover { border-color:${TEAL}; background:#F0F7F7; }
button.ov-link { cursor:pointer; }
/* file preview */
.fv-back { position:fixed; inset:0; z-index:1700; background:rgba(2,24,28,.6); display:flex; align-items:center; justify-content:center; padding:2vh 2vw; }
.fv:focus { outline:none; }
.fv { width:100%; max-width:1200px; height:96vh; height:calc(96vh / var(--ui-zoom, 1)); display:flex; flex-direction:column; background:#fff; border:1px solid #9DBDC1; box-shadow:0 20px 60px rgba(0,0,0,.45); }
.fv-hd { display:flex; align-items:center; gap:10px; padding:8px 12px; background:${TEAL}; color:#fff; flex-shrink:0; }
.fv-hd .ext { padding:3px 7px; border-radius:2px; background:rgba(255,255,255,.18); font-size:10px; font-weight:700; text-transform:uppercase; }
.fv-hd b { font-size:14px; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.fv-hd .grow { flex:1; }
.fv-hd a.ov-btn { text-decoration:none; }
.fv-body { flex:1; min-height:0; background:#525659; }
.fv-body iframe { width:100%; height:100%; border:0; display:block; background:#525659; }
.fv-img { width:100%; height:100%; overflow:auto; display:flex; align-items:flex-start; justify-content:center; padding:16px; box-sizing:border-box; }
.fv-img img { max-width:100%; height:auto; box-shadow:0 4px 18px rgba(0,0,0,.4); background:#fff; }
.fv-none { height:100%; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:8px; background:#F7FAFA; color:#475467; font-size:13px; }
.fv-none b { color:#101828; font-size:14px; }
@media (max-width: 1000px) { .ov-2, .ov-sum { grid-template-columns:1fr; } .ov-2 > .ov-card + .ov-card { border-left:none; } .ov-spec { grid-template-columns:1fr; } }
`;

/* Sales Order print (Beta layout, same as PO / PI) on this page — no new window */
export async function printInPlace(order, company, user) {
  order = await withLatestClient(order, company?.companyId);   // buyer / ship-to from the client master (latest)
  return printSO({ order, company, user });
}

export default function OrderPopup({ order, companyId, company, onClose, onEdit, onChanged }) {
  const { user } = useAuth() || {};
  /* client details shown from the client master (latest), not the order's copy from the day it was saved */
  const [patch, setPatch] = useState(null);   // { id, fields }
  useEffect(() => { let on = true; latestClientPatch(order, companyId).then(fields => { if (on) setPatch({ id: String(order.orderId), fields }); }); return () => { on = false; }; }, [order, companyId]);
  const o = patch && patch.id === String(order.orderId) ? { ...order, ...patch.fields } : order;
  const [ask, setAsk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(null);
  const [printing, setPrinting] = useState(false);
  const [viewer, setViewer] = useState(null);   // { url, download, name, file } — file preview on this page

  useEffect(() => {
    const k = e => { if (e.key !== 'Escape') return; if (viewer) setViewer(null); else onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose, viewer]);

  const st = STATUS[o.status] || STATUS.draft;
  const cancelled = o.status === 'cancelled';
  const items = (o.items || []).filter(it => it && (it.description || it.material || it.itemName));
  const chargesGst = (o.charges || []).filter(c => c && !c.withoutGst);
  const chargesPlain = (o.charges || []).filter(c => c && c.withoutGst);
  const iNet = items.reduce((s, it) => s + n(it.qty) * n(it.rate), 0);
  const cNet = chargesGst.reduce((s, c) => s + n(c.amount), 0);
  const pNet = chargesPlain.reduce((s, c) => s + n(c.amount), 0);
  const igst = n(o.igst), cgst = n(o.cgst), sgst = n(o.sgst);
  const totalGst = n(o.totalGST) || igst + cgst + sgst;
  const notes = (parseSpec(o.specSheet).itemNotes || []).filter(x => x && (x.text || '').trim());
  const specFiles = (o.specFiles || []).filter(Boolean);
  const atts = (o.attachments || o.documents || []).filter(Boolean);
  const fileUrl = (name, inline) => `/api/sales-orders/${o.orderId}/download/${encodeURIComponent(name)}?companyId=${companyId}${inline ? '&inline=1' : ''}`;
  const specUrl = name => `/api/sales-orders/${o.orderId}/spec-file/${encodeURIComponent(name)}?companyId=${companyId}`;

  const cancelOrder = async () => {
    setBusy(true); setNote(null);
    try {
      const fd = new FormData();
      fd.append('companyId', companyId);
      fd.append('status', 'cancelled');
      await axios.put(`/api/sales-orders/${o.orderId}`, fd, { params: { companyId }, headers: { 'Content-Type': 'multipart/form-data' } });
      onChanged({ ...o, status: 'cancelled' });
      setNote({ ok: true, text: `Order ${o.orderNo || o.orderId} cancelled.` });
      setAsk(false);
    } catch (e) {
      setNote({ ok: false, text: e.response?.data?.error || 'Could not cancel the order. Try again.' });
    } finally { setBusy(false); }
  };

  const doPrint = async () => {
    setPrinting(true);
    try { await printInPlace(o, company || {}, user); } catch { setNote({ ok: false, text: 'Could not prepare the print.' }); }
    finally { setPrinting(false); }
  };

  const head = (icon, title, extra) => <div className="ov-ch"><span className="ico"><Svg name={icon} size={14} /></span><b>{title}</b>{extra}</div>;
  const itemName = it => it.description || it.material || it.itemName || '';

  return (
    <div className="ov-back" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <style>{CSS}</style>
      <div className="ov" role="dialog" aria-modal="true" aria-label={`Sales order ${o.orderNo || o.orderId}`}>
        <div className="ov-hd">
          <span className="ov-st" style={{ background: st[1] }}>{st[0]}</span>
          <h2>{o.orderNo || `SO ${o.orderId}`}</h2>
          <span className="sub">SO ID {o.orderId} · {o.customerName || o.party || '—'}</span>
          <button type="button" className="ov-btn" onClick={onEdit} disabled={busy || cancelled} title={cancelled ? 'A cancelled order cannot be edited' : 'Edit this order'}><Svg name="settings" size={14} />Edit</button>
          <button type="button" className="ov-btn" onClick={doPrint} disabled={printing}><Svg name="file" size={14} />{printing ? 'Preparing…' : 'Print'}</button>
          <button type="button" className="ov-btn warn" onClick={() => setAsk(true)} disabled={busy || cancelled}>{cancelled ? 'Cancelled' : 'Cancel Order'}</button>
          <button type="button" className="ov-btn ov-x" onClick={onClose} aria-label="Close">×</button>
        </div>
        {ask && (
          <div className="ov-ask" role="alertdialog" aria-label="Confirm cancel">
            <span><b>Cancel order {o.orderNo || o.orderId}?</b> It stays in the list marked as cancelled; nothing else is deleted.</span>
            <button type="button" className="ov-abtn" onClick={() => setAsk(false)} disabled={busy}>Keep order</button>
            <button type="button" className="ov-abtn danger" onClick={cancelOrder} disabled={busy}>{busy ? 'Cancelling…' : 'Yes, cancel order'}</button>
          </div>
        )}
        {note && <div className={`ov-note ${note.ok ? 'ok' : 'err'}`} role="status">{note.text}</div>}

        <div className="ov-body">
          <div className="ov-2">
            <div className="ov-card">
              {head('user', 'Client Details')}
              <table className="ov-kv"><tbody>
                <tr><th>Client</th><td colSpan={3}><b>{dash(o.customerName || o.party)}</b></td></tr>
                <tr><th>Client ID</th><td>{dash(o.customerCode)}</td><th>GSTIN</th><td className="mono">{dash(o.customerGstin)}</td></tr>
                <tr><th>Contact Person</th><td>{dash(o.contactPerson)}</td><th>Mobile</th><td>{dash(o.mobile)}</td></tr>
                <tr><th>Email</th><td colSpan={3}>{dash(o.email)}</td></tr>
              </tbody></table>
            </div>
            <div className="ov-card">
              {head('file', 'Order Details')}
              <table className="ov-kv"><tbody>
                <tr><th>Order / File No.</th><td className="mono">{dash(o.orderNo)}</td><th>Date</th><td>{fdate(o.orderDate)}</td></tr>
                <tr><th>Quote Ref. No.</th><td>{dash(o.quotationRef)}</td><th>Date</th><td>{fdate(o.quotationDate)}</td></tr>
                <tr><th>Client PO No.</th><td>{dash(o.customerPO)}</td><th>Date</th><td>{fdate(o.poDate)}</td></tr>
                <tr><th>Payment Terms</th><td colSpan={3}>{dash(o.paymentTerms)}</td></tr>
              </tbody></table>
            </div>
          </div>

          <div className="ov-2">
            <div className="ov-card">
              {head('biz', 'Bill To')}
              <table className="ov-kv"><tbody>
                <tr><th>Name</th><td colSpan={3}>{dash(o.customerName || o.party)}</td></tr>
                <tr><th>Address</th><td colSpan={3}>{dash(o.address)}</td></tr>
                <tr><th>City</th><td>{dash(o.customerCity)}</td><th>Pincode</th><td>{dash(o.customerPincode)}</td></tr>
                <tr><th>State</th><td>{dash(o.customerState)}</td><th>GSTIN</th><td className="mono">{dash(o.customerGstin)}</td></tr>
                <tr><th>Contact Person</th><td>{dash(o.billToContact || o.contactPerson)}</td><th>Mobile</th><td>{dash(o.billToMobile || o.mobile)}</td></tr>
              </tbody></table>
            </div>
            <div className="ov-card">
              {head('globe', 'Ship To')}
              <table className="ov-kv"><tbody>
                <tr><th>Name</th><td colSpan={3}>{dash(o.shipToName)}</td></tr>
                <tr><th>Address</th><td colSpan={3}>{dash(o.shipToAddress || o.deliveryAddr)}</td></tr>
                <tr><th>City</th><td>{dash(o.shipToCity)}</td><th>Pincode</th><td>{dash(o.shipToPincode)}</td></tr>
                <tr><th>State</th><td>{dash(o.shipToState)}</td><th>GSTIN</th><td className="mono">{dash(o.shipToGstin)}</td></tr>
                <tr><th>Contact Person</th><td>{dash(o.shipToContact)}</td><th>Mobile</th><td>{dash(o.shipToMobile)}</td></tr>
              </tbody></table>
            </div>
          </div>

          <div className="ov-card">
            {head('box', 'Product Details', <><span className="grow" /><small>{items.length} product{items.length === 1 ? '' : 's'}</small></>)}
            {items.length ? (
              <table className="ov-t">
                <thead><tr><th>#</th><th>Product</th><th>Item Code</th><th>HSN</th><th>Due Date</th><th className="r">Qty</th><th>Unit</th><th className="r">Rate</th><th className="r">GST %</th><th className="r">Amount</th><th className="r">Total</th></tr></thead>
                <tbody>{items.map((it, i) => {
                  const a = n(it.qty) * n(it.rate), g = n(it.gstPercent ?? it.gst);
                  return (
                    <tr key={it._id || i}>
                      <td className="sn">{i + 1}</td><td><b>{itemName(it)}</b></td><td>{dash(it.itemCode)}</td><td>{dash(it.hsnCode)}</td>
                      <td>{it.dueDate ? fdate(it.dueDate) : '—'}</td><td className="r">{n(it.qty)}</td><td>{dash(it.unit)}</td>
                      <td className="r">{amt(it.rate)}</td><td className="r">{g}%</td><td className="r">{amt(a)}</td><td className="r"><b>{amt(a * (1 + g / 100))}</b></td>
                    </tr>
                  );
                })}</tbody>
              </table>
            ) : <div className="ov-empty">No products.</div>}
          </div>

          {(o.addons || []).filter(a => a && a.description).length > 0 && (
            <div className="ov-card">
              {head('box', 'Add-on Items', <><span className="grow" /><small>supplied with the order</small></>)}
              <table className="ov-t">
                <thead><tr><th>#</th><th>Item</th><th>Category</th><th>Specification / remarks</th><th className="r">Qty</th><th>Unit</th><th>In price</th></tr></thead>
                <tbody>{o.addons.filter(a => a && a.description).map((a, i) => (
                  <tr key={i}><td className="sn">{i + 1}</td><td><b>{a.description}</b></td><td>{dash(a.category)}</td><td>{dash(a.remarks)}</td>
                    <td className="r">{n(a.qty)}</td><td>{dash(a.unit)}</td><td>{a.includedInPrice === false ? 'No' : 'Yes'}</td></tr>
                ))}</tbody>
              </table>
            </div>
          )}

          <div className="ov-card">
            {head('plus', 'Additional Charges')}
            {chargesGst.length ? (
              <table className="ov-t">
                <thead><tr><th>#</th><th>Charge</th><th>Description</th><th>Calculated as</th><th className="r">Amount</th><th className="r">GST %</th><th className="r">Total</th></tr></thead>
                <tbody>{chargesGst.map((c, i) => (
                  <tr key={i}>
                    <td className="sn">{i + 1}</td><td><b>{dash(c.chargeType)}</b></td><td>{dash(c.description)}</td>
                    <td>{c.mode === 'pct' ? `${n(c.pct)}% of taxable` : 'Amount'}</td>
                    <td className="r">{amt(c.amount)}</td><td className="r">{n(c.gst)}%</td><td className="r"><b>{amt(n(c.amount) * (1 + n(c.gst) / 100))}</b></td>
                  </tr>
                ))}</tbody>
              </table>
            ) : <div className="ov-empty">No additional charges.</div>}
          </div>

          <div className="ov-sum">
            <div className="ov-card">
              {head('wallet', 'Charges without GST')}
              {chargesPlain.length ? (
                <table className="ov-t">
                  <thead><tr><th>#</th><th>Description</th><th className="r">Amount</th></tr></thead>
                  <tbody>{chargesPlain.map((c, i) => <tr key={i}><td className="sn">{i + 1}</td><td>{dash(c.description)}</td><td className="r">{amt(c.amount)}</td></tr>)}</tbody>
                </table>
              ) : <div className="ov-empty">None.</div>}
            </div>
            <div className="ov-tot" aria-label="Order total">
              <div className="row"><span>Products (taxable)</span><b>{amt(iNet)}</b></div>
              <div className="row"><span>Additional charges</span><b>{amt(cNet)}</b></div>
              {igst > 0 ? <div className="row"><span>IGST</span><b>{amt(igst)}</b></div> : <>
                <div className="row"><span>CGST</span><b>{amt(cgst || totalGst / 2)}</b></div>
                <div className="row"><span>SGST</span><b>{amt(sgst || totalGst / 2)}</b></div>
              </>}
              <div className="row"><span>Charges without GST</span><b>{amt(pNet)}</b></div>
              <div className="row gt"><span>Grand total</span><b>₹ {amt(o.grandTotal)}</b></div>
            </div>
          </div>

          <div className="ov-card">
            {head('ledger', 'Specifications — item wise')}
            {notes.length || specFiles.length ? items.map((it, i) => {
              const nt = notes.find(x => String(x.itemId) === String(it._id));
              const fl = specFiles.filter(x => String(x.itemId) === String(it._id));
              if (!nt && !fl.length) return null;
              return (
                <div className="ov-spec" key={it._id || i}>
                  <div className="nm">{itemName(it)}</div>
                  <div className="bd">
                    {nt ? nt.text : <span style={{ color: '#98A2B3' }}>No written specification.</span>}
                    {fl.length > 0 && <div className="ov-files">{fl.map((x, j) => (
                      <a key={j} className="ov-chip" href={specUrl(x.fileName)} title={x.fileName}
                        onClick={e => { e.preventDefault(); setViewer({ url: specUrl(x.fileName), download: specUrl(x.fileName), name: x.name || x.fileName, file: x.fileName }); }}>
                        <span className="ext">{extOf(x.fileName)}</span>{x.name || x.fileName}
                      </a>
                    ))}</div>}
                  </div>
                </div>
              );
            }) : <div className="ov-empty">No specifications.</div>}
            {specFiles.filter(x => !items.some(it => String(it._id) === String(x.itemId))).length > 0 && (
              <div className="ov-spec"><div className="nm">Other spec files</div><div className="bd"><div className="ov-files" style={{ marginTop: 0 }}>
                {specFiles.filter(x => !items.some(it => String(it._id) === String(x.itemId))).map((x, j) => (
                  <a key={j} className="ov-chip" href={specUrl(x.fileName)} title={x.fileName}
                    onClick={e => { e.preventDefault(); setViewer({ url: specUrl(x.fileName), download: specUrl(x.fileName), name: x.name || x.fileName, file: x.fileName }); }}><span className="ext">{extOf(x.fileName)}</span>{x.name || x.fileName}</a>
                ))}
              </div></div></div>
            )}
          </div>

          <div className="ov-card">
            {head('folder', 'Attachments', <><span className="grow" /><small>{atts.length} file{atts.length === 1 ? '' : 's'}</small></>)}
            {atts.length ? atts.map((a, i) => (
              <div className="ov-file" key={i}>
                <span className="ext">{extOf(a.fileName || a.name)}</span>
                <span><b>{a.name || a.fileName}</b><small>{a.fileName}</small></span>
                {a.fileName ? (
                  <span className="acts">
                    <button type="button" className="ov-link" onClick={() => setViewer({ url: fileUrl(a.fileName, true), download: fileUrl(a.fileName), name: a.name || a.fileName, file: a.fileName })}>View</button>
                    <button type="button" className="ov-link" onClick={() => downloadFile(fileUrl(a.fileName), a.fileName).catch(() => setNote({ ok: false, text: `Could not download ${a.name || a.fileName}.` }))}>Download</button>
                  </span>
                ) : <small style={{ color: '#98A2B3' }}>No file</small>}
              </div>
            )) : <div className="ov-empty">No attachments.</div>}
          </div>
        </div>
      </div>

      {viewer && <FileViewer {...viewer} onClose={() => setViewer(null)} />}
    </div>
  );
}

/* file preview over the order pop-up: PDFs and images show right here; other files offer a download */
/* Files are fetched through axios (same route + login as every other API call) and shown from memory.
   A plain <iframe src="/api/..."> or link is a page request, which the dev server answers with the ERP
   page itself instead of passing it to the API — that is why the preview showed the ERP. */
const MIME = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp' };
const fetchBlobUrl = async (url, ext) => {
  const r = await axios.get(url, { responseType: 'blob' });
  const blob = MIME[ext] ? new Blob([r.data], { type: MIME[ext] }) : r.data;
  return URL.createObjectURL(blob);
};
export async function downloadFile(url, name) {
  const ext = String(name || '').split('.').pop().toLowerCase();
  const href = await fetchBlobUrl(url, ext);
  const a = document.createElement('a');
  a.href = href; a.download = name || 'file';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 30000);
}

function FileViewer({ url, download, name, file, onClose }) {
  const ext = String(file || name || '').split('.').pop().toLowerCase();
  const isImg = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'].includes(ext);
  const isPdf = ext === 'pdf';
  const boxRef = React.useRef(null);
  const [src, setSrc] = useState(null);
  const [state, setState] = useState(isPdf || isImg ? 'loading' : 'none');   // loading | ready | error | none

  // keep keys (Esc) on the preview so it can be closed with the keyboard
  useEffect(() => { boxRef.current?.focus(); }, []);
  useEffect(() => {
    if (!isPdf && !isImg) return undefined;
    let live = true, made = null;
    fetchBlobUrl(url, ext)
      .then(u => { made = u; if (live) { setSrc(u); setState('ready'); } else URL.revokeObjectURL(u); })
      .catch(() => { if (live) setState('error'); });
    return () => { live = false; if (made) URL.revokeObjectURL(made); };
  }, [url, ext, isPdf, isImg]);

  const save = () => downloadFile(download, file || name).catch(() => setState('error'));

  return (
    <div className="fv-back" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="fv" role="dialog" aria-modal="true" aria-label={`Preview ${name}`} tabIndex={-1} ref={boxRef}
        onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } }}>
        <div className="fv-hd">
          <span className="ext">{ext.slice(0, 4) || 'file'}</span>
          <b title={file}>{name}</b>
          <span className="grow" />
          <button type="button" className="ov-btn" onClick={save}><Svg name="arrow" size={14} />Download</button>
          <button type="button" className="ov-btn ov-x" onClick={onClose} aria-label="Close preview">×</button>
        </div>
        <div className="fv-body">
          {state === 'loading' && <div className="fv-none"><b>Opening {name}…</b></div>}
          {state === 'error' && <div className="fv-none"><b>Could not open this file</b><span>It may have been moved or deleted on the server.</span></div>}
          {state === 'none' && <div className="fv-none"><b>No preview for .{ext} files</b><span>Download the file to open it.</span><button type="button" className="ov-link" onClick={save}>Download</button></div>}
          {state === 'ready' && (isPdf
            ? <iframe title={name} src={`${src}#toolbar=1&view=FitH`} onLoad={() => setTimeout(() => boxRef.current?.focus(), 150)} />
            : <div className="fv-img"><img src={src} alt={name} /></div>)}
        </div>
      </div>
    </div>
  );
}
