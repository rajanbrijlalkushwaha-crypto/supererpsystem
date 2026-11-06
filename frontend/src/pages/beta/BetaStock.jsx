/* Beta — Stock: how much of my material is lying where, right now.
 * One list: place (my godown / factory, or a vendor's site) · product · order · qty there now.
 * Built from the documents, oldest first (nothing is saved here):
 *   + GRN received at my godown / factory            → at that place
 *   + GRN received at another vendor's factory       → at that vendor
 *   + client Return Note                             → at the place it came back to (godown or vendor)
 *   − DC sent to the client                          → taken from where that product of that order is lying
 *   − Return to Vendor                               → taken from the place it was sent from
 * Material the vendor sent straight to the client never becomes stock. Deleted documents do not count. */
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

const EXTRA_CSS = '.stk td { white-space:nowrap; overflow:hidden; text-overflow:ellipsis; } .stk .b { font-weight:700; }';
const STORE = 'My godown / factory';
export const VENDOR_PREFIX = 'Vendor: ';   // a Return Note received at a vendor's site saves the place as "Vendor: <name>"

export default function BetaStock() {
  const { selectedCompany } = useCompany() || {};
  const companyId = selectedCompany?.companyId;
  const { user } = useAuth() || {};
  const [data, setData] = useState(null);
  const [slot, setSlot] = useState(null);
  const [q, setQ] = useState('');

  useEffect(() => {
    if (!companyId) return;
    const get = (url, extra) => axios.get(url, { params: { companyId, ...extra } }).then(r => (Array.isArray(r.data) ? r.data : [])).catch(() => []);
    Promise.all([get('/api/sales-orders'), get('/api/purchase-orders'), loadGrns(companyId), get('/api/delivery-challans'), get('/api/returns'), get('/api/bills', { type: 'purchase' }), get('/api/vendors')])
      .then(([orders, pos, grns, dcs, rets, pbills, vendors]) => setData({ orders, pos, grns, dcs, rets, pbills, vendors }));
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
      return (at[k] = at[k] || { place, type, orderId, product: name, unit: unit || 'NOS', qty: 0, from: [], po: [], bills: [], docs: [], grnDates: [] });
    };
    /* take qty of a product of an order: first from the named place, then my godown, then any vendor holding it;
       material that was never recorded anywhere (e.g. sent straight by a vendor) is simply not in stock */
    const take = (orderId, name, qty, from, doc) => {
      let need = qty;
      const hs = Object.values(at).filter(s => s.orderId === orderId && key(s.product) === key(name) && s.qty > 1e-9);
      const rank = x => (from && (key(x.place).includes(key(from)) || key(from).includes(key(x.place))) ? 0 : x.type === 'store' ? 1 : 2);
      hs.sort((a, b) => rank(a) - rank(b));
      for (const h of hs) { if (need <= 1e-9) break; const t = Math.min(need, h.qty); h.qty = r3(h.qty - t); need = r3(need - t); }
    };

    const ev = [];
    data.grns.filter(g => g.status !== 'deleted' && (g.deliveryType || 'our-yard') !== 'direct-client' && poMap[String(g.poId)]?.poType !== 'Stock').forEach(g => {
      const orderId = String(g.soId || poMap[String(g.poId)]?.linkedSalesOrderId || '');
      const toVendor = g.deliveryType === 'to-vendor';
      const place = toVendor ? (g.toVendorName || 'Other vendor') : (g.deliveryLocation || g.receiveAt || myPlaces[0] || STORE);
      (g.items || []).filter(i => i && grnQtyOf(i) > 0).forEach(i => ev.push({ date: g.receiptDate, in: true, place, type: toVendor ? 'vendor' : 'store', orderId, name: i.itemName, unit: i.unit, qty: grnQtyOf(i),
        from: g.vendorName || poMap[String(g.poId)]?.vendorName || '', po: g.poNo || poMap[String(g.poId)]?.poNo || '', bills: billsFor(String(g.poId), i.itemName, grnQtyOf(i)), grnDate: g.receiptDate, doc: `GRN ${g.grnNo || ''} · ${fdate(g.receiptDate)}` }));
    });
    data.rets.forEach(r => {
      const orderId = String(r.orderId || '');
      if (r.kind === 'client') {
        const isVendor = String(r.location || '').startsWith(VENDOR_PREFIX);
        const place = isVendor ? r.location.slice(VENDOR_PREFIX.length) : (r.location || myPlaces[0] || STORE);
        (r.items || []).forEach(i => ev.push({ date: r.date, in: true, place, type: isVendor ? 'vendor' : 'store', orderId, name: i.itemName, unit: i.unit, qty: n(i.qty),
          from: `${r.customerName || 'Client'} (returned)`, po: '', bills: [], doc: `Return Note ${r.returnNo} · ${fdate(r.date)}` }));
      } else (r.items || []).forEach(i => ev.push({ date: r.date, in: false, from: r.location, orderId, name: i.itemName, qty: n(i.qty), doc: `Return to Vendor ${r.returnNo} · ${fdate(r.date)}` }));
    });
    /* a DC takes out its products and its add-ons (e.g. the AC sent with a cabin) — from the vendor / place it went from */
    data.dcs.filter(d => d.status !== 'deleted').forEach(d => [...(d.items || []), ...(d.addons || [])].filter(i => i && n(i.qty) > 0).forEach(i => ev.push({ date: d.dcDate, in: false,
      from: i.fromVendorName || d.dispatchFrom, orderId: String(d.linkedSalesOrderId || ''), name: i.description || i.itemName, qty: n(i.qty), doc: `DC ${d.dcNo} · ${fdate(d.dcDate)}` })));

    ev.sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')) || (b.in - a.in))   // same day: receipts before dispatches
      .forEach(e => {
        if (e.in) {
          const s = slotOf(e.place, e.type, e.orderId, e.name, e.unit); s.qty = r3(s.qty + e.qty);
          const add = (k, v) => [].concat(v).filter(Boolean).forEach(x => { if (!s[k].includes(x)) s[k].push(x); });
          add('from', e.from); add('po', e.po); add('docs', e.doc); add('grnDates', e.grnDate);
          (e.bills || []).forEach(b => { if (!s.bills.some(x => x.no === b.no)) s.bills.push(b); });
        }
        else take(e.orderId, e.name, e.qty, e.from, e.doc);
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
    return Object.values(at).filter(s => s.qty > 1e-9).map(s => ({ ...s, so: soMap[s.orderId], address: addressOf(s) }))
      .sort((a, b) => String(b.so?.orderNo || '').localeCompare(String(a.so?.orderNo || '')) || a.product.localeCompare(b.product));
  }, [data, selectedCompany]);

  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const shown = rows.filter(r => !words.length || words.every(x => `${r.place} ${r.product} ${r.so?.orderNo || ''} ${r.so?.customerName || ''} ${r.from.join(' ')} ${r.po.join(' ')} ${r.bills.map(b => b.no).join(' ')} ${r.docs.join(' ')} ${r.address}`.toLowerCase().includes(x)));
  const tot = shown.reduce((s, r) => s + r.qty, 0);
  const doPrint = () => printList({
    title: 'Stock Statement', company: selectedCompany, user,
    filter: [`As on ${fdate(new Date())}`, q.trim() && `Search: ${q.trim()}`].filter(Boolean).join('  |  '),
    cols: [['Order No.', '', '9%'], ['Client', '', '12%'], ['Vendor', '', '11%'], ['PO No.', '', '10%'], ['Bill Date', 'c', '8%'], ['Product', '', '14%'], ['Qty', 'r', '4%'], ['GRN Date', 'c', '8%'], ['Lying at', '', '10%'], ['Place', '', '14%']],
    rows: shown.map(r => [esc(r.so?.orderNo || '—'), esc(r.so?.customerName || '—'), esc(r.from.join(', ') || '—'), esc(r.po.join(', ') || '—'),
      r.bills.length ? esc([...new Set(r.bills.map(b => fdate(b.date)))].join(', ')) : 'Bill pending', `${esc(r.product)} ${esc(r.unit)}`, `<b>${num(r.qty)}</b>`,
      esc([...new Set(r.grnDates.map(d => fdate(d)))].join(', ') || '—'), `<b>${esc(r.place)}</b>`, esc(r.address || '—')]),
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
        <div className="sb-tools"><button type="button" className="sb-tbtn" disabled={!shown.length} onClick={doPrint}><Svg name="file" size={13} />Print</button></div>
      </>, slot)}

      {!data ? <div className="sb-empty">Loading…</div> : (
        <div className="sb-list">
          <table className="sb-t px stk">
            <colgroup><col style={{ width: '9%' }} /><col style={{ width: '12%' }} /><col style={{ width: '11%' }} /><col style={{ width: '10%' }} /><col style={{ width: '7%' }} /><col style={{ width: '14%' }} /><col style={{ width: '4%' }} /><col style={{ width: '7%' }} /><col style={{ width: '11%' }} /><col style={{ width: '15%' }} /></colgroup>
            <thead><tr><th>Order No.</th><th>Client</th><th>Vendor</th><th>PO No.</th><th>Bill Date</th><th>Product</th><th className="r">Qty</th><th>GRN Date</th><th>Lying at</th><th>Place</th></tr></thead>
            <tbody>
              {!shown.length && <tr><td colSpan={10} className="sb-empty">{q ? `Nothing matches “${q}”.` : 'No material is lying anywhere — everything received has gone out.'}</td></tr>}
              {shown.map((r, i) => (
                <tr key={i}>
                  <td className="b">{r.so?.orderNo || '—'}</td>
                  <td title={r.so?.customerName}>{r.so?.customerName || '—'}</td>
                  <td title={r.from.join(', ')}>{r.from.join(', ') || '—'}</td>
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
    </div>
  );
}
