/* Beta — Stock: how much of my material is lying where, right now.
 * One list: place (my godown / factory, or a vendor's site) · product · order · qty there now.
 * Built from the documents, oldest first (nothing is saved here):
 *   + GRN received at my godown / factory            → at that place
 *   + GRN received at another vendor's factory       → at that vendor
 *   + client Return Note                             → at the place it came back to (godown or vendor)
 *   + Job Sheet: what was made (qty produced)        → at the job's factory / workshop
 *   − DC sent to the client                          → taken from where that product of that order is lying
 *   − Return to Vendor                               → taken from the place it was sent from
 * Material the vendor sent straight to the client never becomes stock. Deleted documents do not count.
 * Each line keeps its statement — every receipt and dispatch with the running balance — also once it is down to 0. */
import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import { useCompany } from '../../context/CompanyContext';
import { useAuth } from '../../context/AuthContext';
import { Svg } from '../../components/ui/Icon';
import { printList, esc } from './BetaPurchasePrint';
import { CSS as SALES_CSS } from './BetaSales';
import { num, fdate } from './BetaSalesBill';
import { n, r3, key, loadGrns, grnQtyOf, billCounts } from './BetaPurchaseLib';
import { PX_CSS } from './BetaPurchaseParts';
import { vendorCode, withCode } from './vendorCode';

const EXTRA_CSS = `.stk td { white-space:nowrap; overflow:hidden; text-overflow:ellipsis; } .stk .b { font-weight:700; }
.stk tbody tr.rw { cursor:pointer; } .stk tbody tr.nil td { color:#98A2B3; }
.sb-chk { display:flex; align-items:center; gap:6px; font-size:12px; color:#344054; padding:0 10px; white-space:nowrap; cursor:pointer; }
.sb-chk input { accent-color:#03444f; }
.st-back { position:fixed; inset:0; background:rgba(16,24,40,.45); z-index:9000; display:flex; align-items:flex-start; justify-content:center; padding:40px 16px; overflow:auto; }
.st-box { background:#fff; width:min(980px, 100%); border:1px solid #9FB3B8; box-shadow:0 12px 40px rgba(0,0,0,.3); }
.st-hd { display:flex; align-items:center; gap:10px; padding:10px 14px; background:#03444f; color:#fff; }
.st-hd b { font-size:14px; } .st-hd small { opacity:.85; } .st-hd .grow { flex:1; }
.st-hd button { background:transparent; border:1px solid rgba(255,255,255,.5); color:#fff; padding:4px 10px; cursor:pointer; font:inherit; font-size:12px; }
.st-kv { display:flex; flex-wrap:wrap; gap:6px 22px; padding:10px 14px; border-bottom:1px solid #DCE6E8; font-size:12px; color:#475467; } .st-kv b { color:#101828; }
.st-t { width:100%; border-collapse:collapse; font-size:12.5px; }
.st-t th { background:#EAF2F3; text-align:left; padding:6px 10px; border-bottom:1px solid #C9D7DA; font-weight:700; }
.st-t td { padding:6px 10px; border-bottom:1px solid #EDF2F3; } .st-t .r { text-align:right; } .st-t .in { color:#067647; font-weight:600; } .st-t .out { color:#B42318; font-weight:600; }
.st-t tfoot td { font-weight:700; background:#F7FAFA; }`;
const STORE = 'My godown / factory';
export const VENDOR_PREFIX = 'Vendor: ';   // a Return Note received at a vendor's site saves the place as "Vendor: <name>"

export default function BetaStock() {
  const { selectedCompany } = useCompany() || {};
  const companyId = selectedCompany?.companyId;
  const { user } = useAuth() || {};
  const [data, setData] = useState(null);
  const [slot, setSlot] = useState(null);
  const [q, setQ] = useState('');
  const [nil, setNil] = useState(false);     // also the lines down to 0 (their statement stays)
  const [stmt, setStmt] = useState(null);    // the line whose statement is open

  useEffect(() => {
    if (!companyId) return;
    const get = (url, extra) => axios.get(url, { params: { companyId, ...extra } }).then(r => (Array.isArray(r.data) ? r.data : [])).catch(() => []);
    Promise.all([get('/api/sales-orders'), get('/api/purchase-orders'), loadGrns(companyId), get('/api/delivery-challans'), get('/api/returns'), get('/api/bills', { type: 'purchase' }), get('/api/vendors'), get('/api/manufacturing/job-sheets')])
      .then(([orders, pos, grns, dcs, rets, pbills, vendors, jobs]) => setData({ orders, pos, grns, dcs, rets, pbills, vendors, jobs }));
  }, [companyId]);

  const rows = useMemo(() => {
    if (!data) return [];
    const soMap = {}; data.orders.forEach(o => { soMap[String(o.orderId)] = o; });
    const poMap = {}; data.pos.forEach(p => { poMap[String(p.orderId)] = p; });
    const myPlaces = (selectedCompany?.locations || []).map(l => l.name);
    const billQ = {};
    [...data.pbills].filter(b => billCounts(b)).sort((a, b) => String(a.billDate || '').localeCompare(String(b.billDate || ''))).forEach(b => (b.items || []).forEach(it => {
      const po = it.poId != null && it.poId !== '' ? String(it.poId) : String(b.orderId || ''), nm = key(it.description || it.itemName);
      if (nm && n(it.qty) > 0) (billQ[`${po}|${nm}`] = billQ[`${po}|${nm}`] || []).push({ no: b.vendorBillNo || b.billNo, date: b.billDate, left: n(it.qty) });
    }));
    const billsFor = (poId, name, qty) => {
      const qu = billQ[`${poId}|${key(name)}`] || [], used = []; let need = qty;
      while (need > 1e-9 && qu.length) { const b = qu[0], t = Math.min(need, b.left); b.left -= t; need -= t; if (!used.some(x => x.no === b.no)) used.push({ no: b.no, date: b.date }); if (b.left <= 1e-9) qu.shift(); }
      return used;
    };
    /* what is lying where: keyed by place | order | product */
    const at = {};
    const slotOf = (place, type, orderId, name, unit) => {
      const k = `${key(place)}|${orderId}|${key(name)}`;
      return (at[k] = at[k] || { place, type, orderId, product: name, unit: unit || 'NOS', qty: 0, from: [], po: [], bills: [], docs: [], grnDates: [], log: [] });
    };
    /* take qty of a product of an order: first from the named place, then my godown, then any vendor holding it;
       material that was never recorded anywhere (e.g. sent straight by a vendor) is simply not in stock */
    const take = (orderId, name, qty, from, doc, date, to) => {
      let need = qty;
      const hs = Object.values(at).filter(s => s.orderId === orderId && key(s.product) === key(name) && s.qty > 1e-9);
      const rank = x => (from && (key(x.place).includes(key(from)) || key(from).includes(key(x.place))) ? 0 : x.type === 'store' ? 1 : 2);
      hs.sort((a, b) => rank(a) - rank(b));
      for (const h of hs) { if (need <= 1e-9) break; const t = Math.min(need, h.qty); h.qty = r3(h.qty - t); need = r3(need - t); h.log.push({ date, doc, party: to || '', out: t, bal: h.qty }); }
    };

    const ev = [];
    data.grns.filter(g => g.status !== 'deleted' && (g.deliveryType || 'our-yard') !== 'direct-client' && poMap[String(g.poId)]?.poType !== 'Stock').forEach(g => {
      const orderId = String(g.soId || poMap[String(g.poId)]?.linkedSalesOrderId || '');
      const toVendor = g.deliveryType === 'to-vendor';
      const place = toVendor ? (g.toVendorName || 'Other vendor') : (g.deliveryLocation || g.receiveAt || myPlaces[0] || STORE);
      (g.items || []).filter(i => i && grnQtyOf(i) > 0).forEach(i => ev.push({ date: g.receiptDate, in: true, place, type: toVendor ? 'vendor' : 'store', orderId, name: i.itemName, unit: i.unit, qty: grnQtyOf(i),
        place2: toVendor ? vendorCode({ vendorId: g.toVendorId, vendorName: g.toVendorName }) : '', code: vendorCode(g, poMap[String(g.poId)]),
        from: g.vendorName || poMap[String(g.poId)]?.vendorName || '', po: g.poNo || poMap[String(g.poId)]?.poNo || '', bills: billsFor(String(g.poId), i.itemName, grnQtyOf(i)), grnDate: g.receiptDate, doc: `GRN ${g.grnNo || ''}` }));
    });
    /* a job sheet: what was made is ready at its factory / workshop (qty produced; a completed job — all of it) */
    (data.jobs || []).filter(j => j && !['cancelled', 'rejected', 'deleted'].includes(j.status)).forEach(j => {
      const outs = (j.outputItems || []).length ? j.outputItems : (j.itemName ? [{ itemName: j.itemName, itemCode: j.itemCode, mfgQty: j.qtyRequired, uom: j.uom }] : []);
      const need = outs.reduce((t, it) => t + n(it.mfgQty ?? it.qty), 0);
      let made = j.status === 'completed' ? Math.max(n(j.qtyProduced), need) : n(j.qtyProduced);
      if (made <= 0) return;
      const place = j.locationName || myPlaces[0] || STORE;
      outs.forEach((it, k) => {
        const want = n(it.mfgQty ?? it.qty);
        const qn = k === outs.length - 1 ? made : Math.min(made, want);   // one item after the other; the last takes the rest
        made = r3(made - qn);
        if (qn > 0) ev.push({ date: j.endDate || j.startDate || String(j.updatedAt || j.createdAt || '').slice(0, 10), at: j.updatedAt || j.createdAt, in: true, place, type: 'store', orderId: String(j.soId || ''), name: it.itemName, unit: it.uom || it.unit,
          qty: r3(qn), from: `${place} (made here)`, po: '', bills: [], doc: `Job Sheet ${j.jobNo || j.id}${j.status === 'completed' ? ' (completed)' : ' (produced so far)'}` });
      });
    });
    /* a client return can only come back after the DC it went on: counted on the later of its own date and its DCs' dates
       (a note dated before its DC would otherwise be taken out again by that DC) */
    const dcDate = {}; data.dcs.forEach(d => { dcDate[String(d.dcId)] = { date: d.dcDate, at: d.createdAt }; });
    data.rets.filter(r => r.status !== 'deleted').forEach(r => {
      const orderId = String(r.orderId || '');
      if (r.kind === 'client') {
        const isVendor = String(r.location || '').startsWith(VENDOR_PREFIX);
        const place = isVendor ? r.location.slice(VENDOR_PREFIX.length) : (r.location || myPlaces[0] || STORE);
        const mine = [...new Set([r.dcId, ...(r.dcs || []).map(x => x.dcId), ...(r.items || []).map(i => i.dcId)].filter(Boolean).map(String))].map(id => dcDate[id]).filter(Boolean);
        const date = [r.date, ...mine.map(x => x.date)].filter(Boolean).sort().pop();
        const at = [r.createdAt, ...mine.map(x => x.at)].filter(Boolean).sort().pop();
        (r.items || []).forEach(i => ev.push({ date, at, ret: true, in: true, place, type: isVendor ? 'vendor' : 'store', orderId, name: i.itemName, unit: i.unit, qty: n(i.qty),
          from: `${r.customerName || 'Client'} (returned)`, po: '', bills: [], doc: `Return Note ${r.returnNo}` }));
      } else (r.items || []).forEach(i => ev.push({ date: r.date, at: r.createdAt, in: false, from: r.location, to: withCode(r.vendorName, vendorCode(r, poMap[String(r.poId)])), orderId, name: i.itemName, qty: n(i.qty), doc: `Return to Vendor ${r.returnNo}` }));
    });
    /* a DC takes out its products and its add-ons (e.g. the AC sent with a cabin) — from the vendor / place it went from */
    data.dcs.filter(d => d.status !== 'deleted').forEach(d => [...(d.items || []), ...(d.addons || [])].filter(i => i && n(i.qty) > 0).forEach(i => ev.push({ date: d.dcDate, in: false,
      from: i.fromVendorName || d.dispatchFrom, orderId: String(d.linkedSalesOrderId || ''), at: d.createdAt, to: d.customerName || d.shippingName || d.billingName, name: i.description || i.itemName, qty: n(i.qty), doc: `DC ${d.dcNo}` })));

    // same day: GRN receipts first, then dispatches and returns in the order they were made
    const rank = e => (e.in && !e.ret ? 0 : 1);
    ev.sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')) || rank(a) - rank(b) || String(a.at || '').localeCompare(String(b.at || '')))
      .forEach(e => {
        if (e.in) {
          const s = slotOf(e.place, e.type, e.orderId, e.name, e.unit); s.qty = r3(s.qty + e.qty);
          const add = (k, v) => [].concat(v).filter(Boolean).forEach(x => { if (!s[k].includes(x)) s[k].push(x); });
          // the codes of the vendors it came from / of the vendor it is lying at (shown; the names stay as they are for matching)
          if (e.code) s.codes = { ...(s.codes || {}), [e.from]: e.code };
          if (e.place2) s.placeCode = e.place2;
          add('from', e.from); add('po', e.po); add('docs', e.doc); add('grnDates', e.grnDate);
          (e.bills || []).forEach(b => { if (!s.bills.some(x => x.no === b.no)) s.bills.push(b); });
          s.log.push({ date: e.date, doc: e.doc, party: withCode([].concat(e.from).filter(Boolean).join(', '), e.code), in: e.qty, bal: s.qty });
        }
        else take(e.orderId, e.name, e.qty, e.from, e.doc, e.date, e.to);
      });

    const clean = t => String(t || '').replace(/\s*[\r\n]+\s*/g, ', ').replace(/,\s*,/g, ',').trim();
    const co = selectedCompany || {};
    const addressOf = sl => {
      if (sl.type === 'vendor') {
        const v = (data.vendors || []).find(x => key(x.vendorName) === key(sl.place));
        return v ? clean([v.address, v.city, [v.state, v.pincode].filter(Boolean).join(' - ')].filter(Boolean).join(', ')) : '';
      }
      const l = (co.locations || []).find(x => key(x.name) === key(sl.place));
      return clean(l?.address || [co.address, co.city, [co.state, co.pincode].filter(Boolean).join(' - ')].filter(Boolean).join(', '));
    };
    return Object.values(at).map(s => ({ ...s, so: soMap[s.orderId], address: addressOf(s) }))
      .sort((a, b) => String(b.so?.orderNo || '').localeCompare(String(a.so?.orderNo || '')) || a.product.localeCompare(b.product));
  }, [data, selectedCompany]);

  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const shown = rows.filter(r => (nil || r.qty > 1e-9)).filter(r => !words.length || words.every(x => `${r.place} ${r.product} ${r.so?.orderNo || ''} ${r.so?.customerName || ''} ${r.from.join(' ')} ${r.po.join(' ')} ${r.bills.map(b => b.no).join(' ')} ${r.docs.join(' ')} ${r.address}`.toLowerCase().includes(x)));
  const tot = shown.reduce((s, r) => s + r.qty, 0);
  const doPrint = () => printList({
    title: 'Stock Statement', company: selectedCompany, user,
    filter: [`As on ${fdate(new Date())}`, q.trim() && `Search: ${q.trim()}`].filter(Boolean).join('  |  '),
    cols: [['Order No.', '', '9%'], ['Client', '', '12%'], ['Vendor', '', '11%'], ['PO No.', '', '10%'], ['Bill Date', 'c', '8%'], ['Product', '', '14%'], ['Qty', 'r', '4%'], ['GRN Date', 'c', '8%'], ['Lying at', '', '10%'], ['Place', '', '14%']],
    rows: shown.map(r => [esc(r.so?.orderNo || '—'), esc(r.so?.customerName || '—'), esc(r.from.map(x => withCode(x, r.codes?.[x])).join(', ') || '—'), esc(r.po.join(', ') || '—'),
      r.bills.length ? esc([...new Set(r.bills.map(b => fdate(b.date)))].join(', ')) : 'Bill pending', `${esc(r.product)} ${esc(r.unit)}`, `<b>${num(r.qty)}</b>`,
      esc([...new Set(r.grnDates.map(d => fdate(d)))].join(', ') || '—'), `<b>${esc(withCode(r.place, r.placeCode))}</b>`, esc(r.address || '—')]),
    total: ['', '', '', '', '', 'Total', `<b>${num(tot)}</b>`, '', '', ''],
  });

  return (
    <div className="sb">
      <style>{SALES_CSS + PX_CSS + EXTRA_CSS}</style>
      <div className="sb-tabs" role="tablist">
        <button type="button" role="tab" aria-selected className="sb-tab on">Stock — where my material is lying</button>
        <div className="sb-slot" ref={setSlot} />
      </div>
      {slot && createPortal(<>
        <input className="sb-search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search place, product, order, client…" aria-label="Search stock" />
        <label className="sb-chk"><input type="checkbox" checked={nil} onChange={e => setNil(e.target.checked)} />Show nil (0) too</label>
        <div className="sb-tools"><span className="sb-picked">Click a line for its statement</span><button type="button" className="sb-tbtn" disabled={!shown.length} onClick={doPrint}><Svg name="file" size={13} />Print</button></div>
      </>, slot)}

      {!data ? <div className="sb-empty">Loading…</div> : (
        <div className="sb-list">
          <table className="sb-t px stk">
            <colgroup><col style={{ width: '9%' }} /><col style={{ width: '12%' }} /><col style={{ width: '11%' }} /><col style={{ width: '10%' }} /><col style={{ width: '7%' }} /><col style={{ width: '14%' }} /><col style={{ width: '4%' }} /><col style={{ width: '7%' }} /><col style={{ width: '11%' }} /><col style={{ width: '15%' }} /></colgroup>
            <thead><tr><th>Order No.</th><th>Client</th><th>Vendor</th><th>PO No.</th><th>Bill Date</th><th>Product</th><th className="r">Qty</th><th>GRN Date</th><th>Lying at</th><th>Place</th></tr></thead>
            <tbody>
              {!shown.length && <tr><td colSpan={10} className="sb-empty">{q ? `Nothing matches “${q}”.` : 'No material is lying anywhere — everything received has gone out.'}</td></tr>}
              {shown.map((r, i) => (
                <tr key={i} className={`rw${r.qty > 1e-9 ? '' : ' nil'}`} onClick={() => setStmt(r)} title="Click for the statement — where it came from and where it went">
                  <td className="b">{r.so?.orderNo || '—'}</td>
                  <td title={r.so?.customerName}>{r.so?.customerName || '—'}</td>
                  <td title={r.from.map(x => withCode(x, r.codes?.[x])).join(', ')}>{r.from.map(x => withCode(x, r.codes?.[x])).join(', ') || '—'}</td>
                  <td title={r.po.join(', ')}>{r.po.join(', ') || '—'}</td>
                  <td title={r.bills.map(b => `${b.no} · ${fdate(b.date)}`).join(', ')}>{r.bills.length ? [...new Set(r.bills.map(b => fdate(b.date)))].join(', ') : <span className="mut">Bill pending</span>}</td>
                  <td title={r.product}>{r.product} <span className="mut">{r.unit}</span></td>
                  <td className="r b">{num(r.qty)}</td>
                  <td>{r.grnDates.length ? [...new Set(r.grnDates.map(d => fdate(d)))].join(', ') : '—'}</td>
                  <td className="b" title={r.place}>{r.place}</td>
                  <td title={r.address}>{r.address || '—'}</td>
                </tr>
              ))}
              {shown.length > 0 && <tr><td colSpan={6} className="r b">Total</td><td className="r b">{num(tot)}</td><td colSpan={3} /></tr>}
            </tbody>
          </table>
        </div>
      )}
      {stmt && <Statement r={stmt} company={selectedCompany} user={user} onClose={() => setStmt(null)} />}
    </div>
  );
}

/* one line's statement: every receipt (from where) and dispatch (to whom), oldest first, with the balance after each */
function Statement({ r, company, user, onClose }) {
  useEffect(() => { const k = e => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);
  const tin = r.log.reduce((s, x) => s + n(x.in), 0), tout = r.log.reduce((s, x) => s + n(x.out), 0);
  const print = () => printList({
    title: 'Stock Item Statement', company, user,
    filter: [`${r.product} (${r.unit})`, `Order ${r.so?.orderNo || '—'}`, r.so?.customerName, `At ${r.place}`].filter(Boolean).join('  |  '),
    cols: [['Date', 'c', '10%'], ['Document', '', '30%'], ['From / To', '', '30%'], ['In', 'r', '10%'], ['Out', 'r', '10%'], ['Balance', 'r', '10%']],
    rows: r.log.map(x => [fdate(x.date), esc(x.doc), esc(x.party || '—'), x.in ? num(x.in) : '', x.out ? num(x.out) : '', `<b>${num(x.bal)}</b>`]),
    total: ['', '', 'Total', `<b>${num(tin)}</b>`, `<b>${num(tout)}</b>`, `<b>${num(r.qty)}</b>`],
  });
  return (
    <div className="st-back" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="st-box" role="dialog" aria-modal="true" aria-label={`Statement of ${r.product}`}>
        <div className="st-hd"><b>{r.product}</b><small>{r.unit} · at {r.place}</small><span className="grow" /><button type="button" onClick={print}>Print</button><button type="button" onClick={onClose} aria-label="Close">✕</button></div>
        <div className="st-kv"><span>Order <b>{r.so?.orderNo || '—'}</b></span><span>Client <b>{r.so?.customerName || '—'}</b></span><span>Lying at <b>{r.place}</b></span><span>Now <b>{num(r.qty)}</b></span></div>
        <table className="st-t">
          <thead><tr><th>Date</th><th>Document</th><th>From / To</th><th className="r">In</th><th className="r">Out</th><th className="r">Balance</th></tr></thead>
          <tbody>{r.log.map((x, i) => (
            <tr key={i}><td>{fdate(x.date)}</td><td>{x.doc}</td><td>{x.in ? <>from <b>{x.party || '—'}</b></> : <>to <b>{x.party || '—'}</b></>}</td>
              <td className="r in">{x.in ? num(x.in) : ''}</td><td className="r out">{x.out ? num(x.out) : ''}</td><td className="r"><b>{num(x.bal)}</b></td></tr>
          ))}</tbody>
          <tfoot><tr><td colSpan={3}>Total</td><td className="r">{num(tin)}</td><td className="r">{num(tout)}</td><td className="r">{num(r.qty)}</td></tr></tfoot>
        </table>
      </div>
    </div>
  );
}
