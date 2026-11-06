/* Beta — Create / edit Purchase Order.
 * Vendor | PO details → Ship From (vendor's dispatch) | Deliver To → Items (can be copied from the sales order)
 * → Totals → Terms & notes → Attachments.
 * Saves with the same field names as the classic PO form (POST / PUT /api/purchase-orders), so the classic
 * PO screens and approvals keep working on these POs. */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { Svg } from '../../components/ui/Icon';
import { CF_CSS, TEAL } from './BetaClients';
import { STATES } from './BetaGstFetch';
import { fyOf } from './BetaSales';

const GST_RATES = [0, 5, 12, 18, 28];
const CHARGE_TYPES = ['Freight', 'Packing & Forwarding', 'Loading / Unloading', 'Transport', 'Installation', 'Erection & Commissioning', 'Insurance', 'Other'];
const UNITS = ['NOS', 'SET', 'Kg', 'Ltr', 'Mtr', 'Box', 'Pcs', 'Sqft', 'Sqm', 'MT', 'LOT'];
const PAY_TERMS = ['Advance', '30% Advance, 70% before dispatch', '50% Advance, 50% before dispatch', '30% Advance, 70% after delivery', 'Against Delivery', '7 Days', '15 Days', '30 Days', '45 Days', '60 Days', '90 Days'];
const PAY_MODES = ['NEFT', 'RTGS', 'IMPS', 'Cheque', 'UPI', 'Cash', 'DD'];
const DISPATCH = ['Road', 'Rail', 'Air', 'Courier', 'By Hand', 'Sea'];
const FREIGHT = ['Freight paid by vendor', 'Freight to pay (by us)', 'Freight included in price', 'Ex-works'];
const MAX_MB = 20;

const uid = () => Math.random().toString(36).slice(2, 10);
const today = () => new Date().toISOString().slice(0, 10);
const n = v => parseFloat(v) || 0;
const r2 = v => Math.round((Number(v) || 0) * 100) / 100;
const amt = v => (Number(v) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fileSize = b => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const low = s => String(s || '').trim().toLowerCase();

/* next PO number in the series of the PO date's year, e.g. EPS/PO/26-27/053 */
export function nextPoNo(pos, date, skipId) {
  const fy = fyOf(date || today()) || fyOf(today());
  const yy = `${String(fy).slice(2)}-${String(+fy + 1).slice(2)}`;
  // the series used most this year (EPS/PO/ …), else the one used last; numbers count within that series only
  const RE = /^(.*\/)(\d{2})-(\d{2})\/(\d+)$/;
  const seen = [];
  [...(pos || [])].sort((a, b) => Number(a.orderId) - Number(b.orderId)).forEach(p => {
    if (skipId != null && String(p.orderId) === String(skipId)) return;
    const m = String(p.poNo || p.poNumber || '').trim().match(RE);
    if (m && m[4].length <= 4) seen.push({ prefix: m[1], yy: `${m[2]}-${m[3]}`, seq: parseInt(m[4], 10), width: m[4].length });
  });
  const thisYear = seen.filter(x => x.yy === yy);
  const count = {};
  thisYear.forEach(x => { count[x.prefix] = (count[x.prefix] || 0) + 1; });
  const prefix = Object.keys(count).sort((a, b) => count[b] - count[a])[0] || (seen.length ? seen[seen.length - 1].prefix : 'EPS/PO/');
  const mine = thisYear.filter(x => x.prefix === prefix);
  const max = mine.reduce((s, x) => Math.max(s, x.seq), 0);
  const width = Math.max(3, ...mine.map(x => x.width), ...(mine.length ? [] : seen.filter(x => x.prefix === prefix).map(x => x.width)));
  return `${prefix}${yy}/${String(max + 1).padStart(width, '0')}`;
}

/* vendor's Dispatch From (or its Bill From when the same) */
const shipFromOf = v => {
  if (!v) return { address: '', city: '', state: '', pincode: '' };
  const d = v.dispatchSame === false && v.dispatchFrom ? v.dispatchFrom : v;
  return { address: d.address || '', city: d.city || '', state: d.state || '', pincode: String(d.pincode || '') };
};
const siteOf = o => (o ? [o.shipToName, o.shipToAddress || o.deliveryAddr || o.shippingAddr, o.shipToCity, o.shipToState, o.shipToPincode].filter(Boolean).join(', ') : '');
const officeOf = c => (c ? [c.companyName, c.address, c.city, c.state, c.pincode].filter(Boolean).join(', ') : '');
const orderLabel = o => `${o.orderNo || o.orderId} · ${o.customerName || o.party || ''}`;

export const key = s => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
export const soItemName = it => it.description || it.itemName || '';
/* order lines that can go on a PO: the products, then the add-on items (AC, tank …) — they are bought too */
export const soLines = o => [
  ...(o.items || []),
  ...(o.addons || []).filter(a => a && String(a.description || '').trim() && n(a.qty) > 0)
    .map(a => ({ description: a.description, qty: a.qty, unit: a.unit || 'NOS', gst: 18, additionalDesc: a.remarks || '', addon: true })),
];
/* is this PO line the same product as that order line? (item code first, else the name) */
export const sameItem = (pl, it) => (pl.itemCode && it.itemCode && String(pl.itemCode) === String(it.itemCode)) || (key(pl.itemName || pl.description) && key(pl.itemName || pl.description) === key(soItemName(it)));
/* is this PO line for order line no. idx? A PO line imported from the order remembers its line (soLine) —
   needed when several order lines have the same name (Cabin, Cabin …). Older PO lines match by code / name. */
export const onSoLine = (pl, it, idx) => (Number.isInteger(pl.soLine) ? pl.soLine === idx : sameItem(pl, it));
/* per order line: qty already on other (not rejected) POs of this order */
export function poQtyOf(order, pos, skipId) {
  const mine = (pos || []).filter(p => String(p.linkedSalesOrderId) === String(order.orderId) && p.status !== 'rejected' && String(p.orderId) !== String(skipId));
  return soLines(order).map((it, idx) => mine.reduce((s, p) => s + (p.items || []).filter(pl => onSoLine(pl, it, idx)).reduce((a, pl) => a + n(pl.qty), 0), 0));
}

const parseSpec = raw => { try { const p = typeof raw === 'string' ? JSON.parse(raw || '') : raw; return p && typeof p === 'object' ? p : {}; } catch { return {}; } };
/* spec text + drawings written for one product on the sales order */
const soSpecOf = (o, it) => {
  const nm = key(soItemName(it));
  const note = (parseSpec(o.specSheet).itemNotes || []).find(x => x && ((it._id && x.itemId === it._id) || (nm && key(x.itemName) === nm)));
  const files = (o.specFiles || []).filter(f => f && f.fileName && ((it._id && f.itemId === it._id) || (nm && key(f.itemName) === nm)));
  return { text: (note?.text || '').trim(), files };
};
const extOf = nm => (String(nm || '').split('.').pop() || 'file').slice(0, 4).toLowerCase();

const blankLine = () => ({ key: uid(), itemCode: '', itemName: '', description: '', hsnCode: '', qty: '1', unit: 'NOS', rate: '', discount: '', gstPercent: 18, dueDate: '' });
const lineCalc = l => {
  const gross = n(l.qty) * n(l.rate);
  const taxable = r2(gross - gross * Math.min(100, n(l.discount)) / 100);
  const gst = r2(taxable * n(l.gstPercent) / 100);
  return { taxable, gst, total: r2(taxable + gst) };
};

const PO_CSS = `
.po-pick input { width:100%; }
.po-top > .cf-card { display:flex; flex-direction:column; }
.po-top > .cf-card > .cf-kv { flex:1; }
.cf-kv td.po-ro { font-size:12.5px; color:#101828; padding:6px 10px; background:#FAFCFC; }
.cf-kv td.po-ro .mut { color:#98A2B3; }
.po-srch { display:flex; }
.po-srch input { flex:1; min-width:0; cursor:pointer; border-radius:2px 0 0 2px; background:#fff; }
.po-for { display:flex; flex-wrap:wrap; gap:16px; font-size:12.5px; } .po-for label { display:inline-flex; align-items:center; gap:6px; cursor:pointer; }
.po-rmw { display:block; margin-top:2px; font-size:11px; color:#B54708; }
.po-clr { width:30px; flex-shrink:0; border:1px solid #C9D7DA; border-left:none; background:#fff; color:#98A2B3; cursor:pointer; font-size:16px; }
.po-clr:hover { color:#D92D20; }
.po-sbtn { width:34px; flex-shrink:0; border:1px solid ${TEAL}; border-radius:0 2px 2px 0; background:${TEAL}; color:#fff; cursor:pointer; display:grid; place-items:center; }
.po-sbtn:hover:not(:disabled) { background:#025763; }
.po-pkb { position:fixed; inset:0; z-index:1600; background:rgba(2,24,28,.45); display:flex; align-items:flex-start; justify-content:center; padding:7vh 16px; }
.po-pk { width:100%; max-width:980px; max-height:80vh; display:flex; flex-direction:column; background:#fff; border:1px solid #9DBDC1; box-shadow:0 20px 60px rgba(0,0,0,.35); font-size:12.5px; }
.po-pk.wide { max-width:900px; }
.po-pkh { display:flex; align-items:center; gap:10px; padding:9px 12px; background:linear-gradient(90deg, ${TEAL} 0%, #0A6E7A 100%); color:#fff; }
.po-pkh b { font-size:13.5px; } .po-pkh span { flex:1; opacity:.85; font-size:12px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.po-pkh button { margin-left:auto; width:28px; height:28px; border:1px solid rgba(255,255,255,.35); background:rgba(255,255,255,.1); color:#fff; cursor:pointer; font-size:17px; }
.po-pks { display:flex; align-items:center; gap:8px; padding:8px 12px; border-bottom:1px solid #DCE6E8; color:#98A2B3; }
.po-pks input { flex:1; height:32px; border:0; outline:none; font:inherit; font-size:13px; color:#101828; }
.po-pks label { display:inline-flex; align-items:center; gap:6px; color:#475467; font-size:12px; white-space:nowrap; cursor:pointer; }
.po-pkl { overflow-y:auto; flex:1; }
.po-ot, .po-it { width:100%; border-collapse:collapse; table-layout:fixed; }
.po-ao { display:inline-block; margin-left:6px; padding:0 5px; border:1px solid #F79009; border-radius:3px; color:#B54708; font-size:9.5px; font-weight:700; line-height:15px; text-transform:uppercase; vertical-align:1px; }
.po-ot th, .po-it th { position:sticky; top:0; z-index:1; background:#D4EBEE; color:#000; font-size:11px; font-weight:700; padding:6px 8px; text-align:center; border-bottom:1px solid #A9CDD2; border-right:1px solid #A9CDD2; }
.po-ot td, .po-it td { padding:6px 8px; border-bottom:1px solid #EDF2F3; border-right:1px solid #000; vertical-align:top; color:#101828; }
.po-ot th:last-child, .po-ot td:last-child, .po-it th:last-child, .po-it td:last-child { border-right:none; }
.po-ot tbody tr { cursor:pointer; }
.po-ot tbody tr:hover td, .po-ot tbody tr.hi td { background:#EAF4F5; }
.po-ot td.no { font-weight:700; color:${TEAL}; white-space:nowrap; }
.po-ot .c, .po-it .c { text-align:center; }
.po-ot .mut, .po-it .mut { color:#98A2B3; }
.po-ot .has { color:#B54708; font-weight:700; }
.po-it tr.on td { background:#F7FBFB; }
.po-it td b { display:block; font-weight:600; }
.po-it td small { display:block; color:#667085; font-size:11px; }
.po-it td.warn { color:#B54708; font-weight:700; } .po-it td.due { color:#B42318; font-weight:700; } .po-it td.ok { color:#067647; font-weight:700; }
.po-it td input[type=checkbox], .po-it th input[type=checkbox] { width:15px; height:15px; accent-color:${TEAL}; cursor:pointer; }
.po-it td input:not([type]) { width:100%; height:28px; text-align:center; }
.po-it .ovr { color:#B54708 !important; }
.po-pkf { display:flex; align-items:center; gap:8px; padding:10px 12px; border-top:1px solid #DCE6E8; background:#FAFCFC; }
.po-pkf span { flex:1; color:#667085; }
.po-pke { padding:22px; text-align:center; color:#98A2B3; }
.po-vend { padding:9px 12px; font-size:12px; color:#475467; line-height:1.55; background:#FAFCFC; border-top:1px solid #DCE6E8; }
.po-vend b { color:#101828; }
.po-vend .mut { color:#98A2B3; }
.po-qk { display:flex; gap:6px; margin-top:5px; flex-wrap:wrap; }
.po-qk button { height:24px; padding:0 9px; border:1px solid #B9D0D3; border-radius:2px; background:#fff; color:${TEAL}; cursor:pointer; font-size:11.5px; font-weight:600; font-family:inherit; }
.po-qk button:hover:not(:disabled) { background:${TEAL}; color:#fff; border-color:${TEAL}; }
.po-qk button:disabled { opacity:.45; cursor:default; }
.po-tw { overflow-x:auto; }
.po-t { width:100%; border-collapse:collapse; min-width:1200px; font-size:12px; }
.po-t th { background:#D4EBEE; color:#000; font-size:11px; font-weight:700; text-align:center; padding:6px 5px; border-bottom:1px solid #A9CDD2; border-right:1px solid #A9CDD2; white-space:nowrap; }
.po-t th:last-child, .po-t td:last-child { border-right:none; }
.po-t td { padding:4px 4px; border-bottom:1px solid #E3ECED; border-right:1px solid #E3ECED; vertical-align:top; }
.po-t td.sn { text-align:center; color:#667085; padding-top:10px; }
.po-t td.num { text-align:right; padding-top:10px; font-variant-numeric:tabular-nums; white-space:nowrap; }
.po-t input, .po-t select, .po-t textarea { height:30px; }
.po-t textarea { height:auto; min-height:30px; margin-top:3px; font-size:11.5px; }
.po-t .r input { text-align:right; }
.po-acts { display:flex; align-items:center; gap:8px; padding:8px 10px; border-top:1px solid #EDF2F3; background:#FAFCFC; flex-wrap:wrap; }
.po-acts .grow { flex:1; }
.po-acts small { color:#667085; }
.po-sum { display:grid; grid-template-columns:1fr 380px; gap:0; margin-bottom:10px; }
.po-sum > .cf-card { margin:0; }
.po-sum > .cf-card + .cf-card { border-left:1px solid #B9CED1; }
.po-tot { width:100%; border-collapse:collapse; font-size:12.5px; }
.po-tot th { text-align:left; font-weight:500; color:#475467; padding:6px 12px; border-bottom:1px solid #EDF2F3; }
.po-tot td { text-align:right; padding:6px 12px; border-bottom:1px solid #EDF2F3; font-variant-numeric:tabular-nums; }
.po-tot td input { width:120px; height:28px; text-align:right; }
.po-tot tr.gt th, .po-tot tr.gt td { font-size:14.5px; font-weight:800; color:#101828; background:#F0F7F7; border-bottom:none; }
.po-tot small { color:#98A2B3; font-size:10.5px; }
.po-att { display:flex; flex-wrap:wrap; gap:6px; padding:10px; }
.po-file { display:inline-flex; align-items:center; gap:7px; max-width:320px; height:30px; padding:0 4px 0 10px; border:1px solid #C9D7DA; border-radius:2px; background:#F7FAFA; font-size:12px; }
.po-file.new { background:#ECFDF3; border-color:#ABEFC6; }
.po-file b { font-weight:600; color:#101828; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.po-file small { color:#667085; font-size:11px; white-space:nowrap; }
.po-file button { width:24px; height:24px; border:0; background:none; cursor:pointer; color:#98A2B3; font-size:16px; }
.po-file button:hover { color:#D92D20; }
.po-spec { display:grid; grid-template-columns:260px 1fr; border-bottom:1px solid #EDF2F3; }
.po-spec:last-child { border-bottom:none; }
.po-spec .nm { padding:10px 12px; border-right:1px solid #EDF2F3; background:#FAFCFC; }
.po-spec .nm b { display:block; font-size:12.5px; color:#101828; }
.po-spec .nm small { display:block; margin-top:2px; font-size:11px; color:#667085; }
.po-spec .bd { padding:8px 10px; display:flex; flex-direction:column; gap:6px; }
.po-spec textarea { min-height:44px; }
.po-spec-empty { padding:14px; text-align:center; color:#98A2B3; font-size:12.5px; }
.po-att.in { padding:0; }
.po-file .ext { width:28px; height:20px; display:grid; place-items:center; border-radius:2px; background:#E1EFF0; color:#03444f; font-size:9px; font-weight:800; text-transform:uppercase; flex-shrink:0; }
.po-file .lk { width:auto; height:auto; padding:0; border:0; background:none; color:#101828; font-weight:600; font-size:12px; cursor:pointer; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:200px; font-family:inherit; }
.po-file .lk:hover { color:#03444f; text-decoration:underline; }
.po-file .so { color:#B54708; font-weight:600; }
@media (max-width: 800px) { .po-spec { grid-template-columns:1fr; } }
.po-up { display:inline-flex; align-items:center; gap:5px; height:30px; padding:0 12px; border:1px dashed #9DBDC1; border-radius:2px; background:#F7FBFB; color:${TEAL}; cursor:pointer; font-weight:600; font-size:12px; font-family:inherit; }
.cf-ch .t small { color:rgba(255,255,255,.78); }
@media (max-width: 1100px) { .po-sum { grid-template-columns:1fr; } .po-sum > .cf-card + .cf-card { border-left:none; } }
`;

export default function POForm({ companyId, company, vendors, orders, pos, editPo, presetOrderId, presetItems, onSaved, onClose }) {
  const isEdit = !!editPo;
  /* PO for: a sales order (as before) or Stock — raw material for the godown, items from the Raw Material master */
  const [forStock, setForStock] = useState(() => editPo?.poType === 'Stock');
  const [rms, setRms] = useState([]);
  useEffect(() => {
    if (!companyId) return;
    axios.get('/api/raw-materials', { params: { companyId } }).then(r => setRms(Array.isArray(r.data) ? r.data : [])).catch(() => setRms([]));
  }, [companyId]);
  const vendorsOk = useMemo(() => (vendors || []).filter(v => v.status !== 'rejected').sort((a, b) => String(a.vendorName || '').localeCompare(String(b.vendorName || ''))), [vendors]);
  const ordersOk = useMemo(() => (orders || []).filter(o => !['cancelled', 'draft', 'rejected'].includes(o.status))
    .sort((a, b) => String(b.orderDate || '').localeCompare(String(a.orderDate || ''))), [orders]);
  const soMap = useMemo(() => { const m = {}; (orders || []).forEach(o => { m[String(o.orderId)] = o; }); return m; }, [orders]);

  const init = () => {
    if (isEdit) {
      const p = editPo;
      return {
        vendorId: String(p.vendorId || p.vendorCode || ''), vendorText: p.vendorName || '',
        vendorName: p.vendorName || '', vendorGstin: p.vendorGstin || '', vendorCode: p.vendorCode || '', vendorState: p.vendorState || '',
        vendorAddress: p.vendorAddress || '', vendorCity: p.vendorCity || '', vendorPincode: String(p.vendorPincode || ''),
        contactPerson: p.contactPerson || '', mobile: p.mobile || '', email: p.email || '',
        poNo: p.poNo || p.poNumber || '', poDate: p.poDate || today(), deliveryDate: p.deliveryDate || '',
        orderId: p.linkedSalesOrderId ? String(p.linkedSalesOrderId) : '', orderText: p.linkedSalesOrderId && soMap[String(p.linkedSalesOrderId)] ? orderLabel(soMap[String(p.linkedSalesOrderId)]) : '',
        quotationRef: p.quotationRef || '', paymentTerms: p.paymentTerms || '', paymentMode: p.paymentMode || '', dispatchMode: p.dispatchMode || 'Road', freightTerms: p.freightTerms || '',
        shipFromAddress: p.shipFromAddress || '', shipFromCity: p.shipFromCity || '', shipFromState: p.shipFromState || '', shipFromPincode: String(p.shipFromPincode || ''),
        deliveryAddr: p.deliveryAddr || p.deliveryAddress || '',
        freightCharges: n(p.freightCharges) ? String(p.freightCharges) : '', packingCharges: n(p.packingCharges) ? String(p.packingCharges) : '',
        termsConditions: p.termsConditions || '', vendorNotes: p.vendorNotes || '', internalNotes: p.internalNotes || p.notes || '',
      };
    }
    const o = presetOrderId ? soMap[String(presetOrderId)] : null;
    return {
      vendorId: '', vendorText: '', vendorName: '', vendorGstin: '', vendorCode: '', vendorState: '', vendorAddress: '', vendorCity: '', vendorPincode: '',
      contactPerson: '', mobile: '', email: '',
      poNo: nextPoNo(pos, today()), poDate: today(), deliveryDate: '',
      orderId: o ? String(o.orderId) : '', orderText: o ? orderLabel(o) : '',
      quotationRef: '', paymentTerms: '', paymentMode: 'NEFT', dispatchMode: 'Road', freightTerms: '',
      shipFromAddress: '', shipFromCity: '', shipFromState: '', shipFromPincode: '',
      deliveryAddr: o ? siteOf(o) : '',
      freightCharges: '', packingCharges: '', termsConditions: '', vendorNotes: '', internalNotes: '',
    };
  };
  const [v, setV] = useState(init);
  /* first values of the items, their spec notes, spec files and the order's attachments */
  const [boot] = useState(() => {
    if (isEdit) {
      const ls = (editPo.items || []).map(it => ({ ...blankLine(), ...it, key: uid(), qty: String(it.qty ?? ''), rate: String(it.rate ?? ''), discount: n(it.discount) ? String(it.discount) : '', gstPercent: n(it.gstPercent ?? it.gst ?? 18) }));
      const nt = {};
      (parseSpec(editPo.specSheet).itemNotes || []).forEach(x => {
        const l = (Number.isInteger(x.itemIdx) && ls[x.itemIdx] && key(ls[x.itemIdx].itemName) === key(x.itemName) ? ls[x.itemIdx] : null) || ls.find(y => key(y.itemName) === key(x.itemName));
        if (l && x.text) nt[l.key] = x.text;
      });
      const sp = (editPo.specFiles || []).filter(f => f && f.fileName).map(f => ({ id: uid(), kind: 'saved', meta: f, lineKey: (ls.find(y => key(y.itemName) === key(f.itemName)) || {}).key || '' }));
      return { lines: ls.length ? ls : [blankLine()], notes: nt, specs: sp, soAtts: [] };
    }
    // from Order Pending: the items pop-up opens (all products and their qty; the chosen ones ticked)
    return { lines: [blankLine()], notes: {}, specs: [], soAtts: [] };
  });
  const [lines, setLines] = useState(boot.lines);
  const [notes, setNotes] = useState(boot.notes);     // { lineKey: spec text }
  const [specs, setSpecs] = useState(boot.specs);     // spec files: { id, lineKey, kind: saved | new | so, meta | file | so }
  const [soAtts, setSoAtts] = useState(boot.soAtts);  // attachments of the sales order to copy into this PO
  // additional charges — saved as { chargeType, amount, gstPercent } like the classic PO form
  const [charges, setCharges] = useState(() => (isEdit ? (editPo.charges || []).filter(Boolean).map(c => ({ key: uid(), chargeType: c.chargeType || c.description || '', amount: String(c.amount ?? ''), gstPercent: n(c.gstPercent ?? c.gst ?? 18) })) : []));
  const setCh = (i, k) => e => { const val = e.target.value; setCharges(cs => cs.map((c, j) => (j === i ? { ...c, [k]: k === 'gstPercent' ? n(val) : val } : c))); setErrs(o => ({ ...o, [`c${i}${k}`]: undefined })); setMsg(null); };
  const [files, setFiles] = useState([]);   // new uploads
  const [oldAtt, setOldAtt] = useState(() => (isEdit ? (editPo.attachments || editPo.documents || []).filter(Boolean) : []));
  const [errs, setErrs] = useState({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const fileRef = useRef(null);
  const [pickOpen, setPickOpen] = useState(false);   // order search pop-up
  const [vPick, setVPick] = useState(false);         // vendor search pop-up
  const [imp, setImp] = useState(null);               // items pop-up: { order, rows: [{ on, qty }] }

  /* spec notes + drawings of the imported products, and the order's attachments (not twice) */
  function fromOrderSpecs(o, pairs, nt0, sp0, at0) {
    const nt = { ...nt0 }, sp = [...sp0], at = [...at0];
    pairs.forEach(({ it, lineKey }) => {
      if (!lineKey) return;
      const s = soSpecOf(o, it);
      if (s.text && !(nt[lineKey] || '').trim()) nt[lineKey] = s.text;
      s.files.forEach(f => {
        if (sp.some(x => x.kind === 'so' && x.so.orderId === o.orderId && x.so.fileName === f.fileName && x.lineKey === lineKey)) return;
        sp.push({ id: uid(), kind: 'so', lineKey, so: { ...f, orderId: o.orderId, orderNo: o.orderNo } });
      });
    });
    // the order's attachments, and its spec files that belong to no product (general drawings / annexures)
    const general = (o.specFiles || []).filter(f => f && f.fileName && !f.itemId && !f.itemName).map(f => ({ ...f, name: f.name || f.fileName }));
    [...(o.attachments || []), ...general].filter(a => a && a.fileName).forEach(a => {
      if (!at.some(x => x.orderId === o.orderId && x.fileName === a.fileName)) at.push({ ...a, id: uid(), orderId: o.orderId, orderNo: o.orderNo });
    });
    return { notes: nt, specs: sp, soAtts: at };
  }


  useEffect(() => {
    if (!imp) return undefined;
    const k = e => { if (e.key === 'Escape') setImp(null); };
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [imp]);

  const vendor = vendorsOk.find(x => String(x.vendorId) === String(v.vendorId)) || null;
  const order = v.orderId ? soMap[String(v.orderId)] : null;
  const intra = (() => {
    const a = low(company?.state), b = low(v.vendorState);
    if (a && b) return a === b;
    const g1 = String(company?.gstin || '').slice(0, 2), g2 = String(v.vendorGstin || '').slice(0, 2);
    return !!(g1 && g2 && g1 === g2);
  })();

  const set = k => e => { const val = e.target.value; setV(o => ({ ...o, [k]: val })); setErrs(o => ({ ...o, [k]: undefined })); setMsg(null); };
  const pickVendor = x => {
    setVPick(false);
    const sf = shipFromOf(x);
    const ct = (x.contactPersons || [])[0] || {};
    setV(o => ({
      ...o, vendorText: x.vendorName, vendorId: String(x.vendorId), vendorName: x.vendorName || '', vendorGstin: x.gstin || '', vendorCode: x.vendorCode || String(x.vendorId),
      vendorState: x.state || '', vendorAddress: x.address || '', vendorCity: x.city || '', vendorPincode: String(x.pincode || ''),
      contactPerson: ct.name || x.contactPerson || '', mobile: ct.mobileNumber || x.mobile || '', email: ct.email || x.email || '',
      paymentTerms: o.paymentTerms || x.paymentTerms || '',
      shipFromAddress: sf.address, shipFromCity: sf.city, shipFromState: sf.state, shipFromPincode: sf.pincode,
    }));
    setErrs(o => ({ ...o, vendor: undefined })); setMsg(null);
  };
  /* items pop-up: order qty, already on other POs, due, and the qty for this PO */
  /* only: item positions chosen in Order Pending — those are ticked, the rest shown unticked */
  const openImport = (o, only) => {
    const done = poQtyOf(o, pos, editPo?.orderId);
    setImp({ order: o, done, rows: soLines(o).map((it, i) => {
      const due = Math.max(0, n(it.qty) - done[i]);
      return { on: only ? only.includes(i) : due > 0, qty: due > 0 ? String(due) : '0' };
    }) });
  };
  // came from Order Pending: open the items pop-up once
  const presetDone = useRef(false);
  useEffect(() => {
    if (presetDone.current || isEdit || !presetOrderId) return;
    presetDone.current = true;
    const o = soMap[String(presetOrderId)];
    if (o && soLines(o).length) openImport(o, presetItems && presetItems.length ? presetItems : null);
  });   // eslint-disable-line react-hooks/exhaustive-deps
  const pickOrder = o => {
    setPickOpen(false);
    setV(x => ({ ...x, orderText: orderLabel(o), orderId: String(o.orderId), deliveryAddr: x.deliveryAddr || siteOf(o) }));
    setErrs(e => ({ ...e, order: undefined })); setMsg(null);
    if (soLines(o).length) openImport(o);
  };
  const doImport = () => {
    const { order: o, rows } = imp;
    const picked = soLines(o).map((it, i) => ({ it, i, r: rows[i] })).filter(x => x.r.on && n(x.r.qty) > 0);
    const out = lines.filter(l => l.itemName.trim() || n(l.rate)).map(l => ({ ...l }));
    const pairs = [];
    const linked = String(v.orderId) === String(o.orderId);
    picked.forEach(({ it, i, r }) => {
      // the same order line already in the PO → update its qty; lines with the same name stay separate
      const at = out.findIndex(l => (Number.isInteger(l.soLine) ? l.soLine === i && linked : sameItem(l, it) && !out.some(y => y.soLine === i)));
      if (at >= 0) { out[at] = { ...out[at], qty: String(n(r.qty)), soLine: i }; pairs.push({ it, lineKey: out[at].key }); }
      else {
        const l = { ...blankLine(), itemCode: it.itemCode || '', itemName: soItemName(it), description: it.additionalDesc || '', hsnCode: it.hsnCode || '', qty: String(n(r.qty)), unit: it.unit || 'NOS', gstPercent: n(it.gst ?? it.gstPercent ?? 18), dueDate: it.dueDate || v.deliveryDate || '', soLine: i };
        out.push(l); pairs.push({ it, lineKey: l.key });
      }
    });
    setLines(out.length ? out : [blankLine()]);
    // the specs written on the order for these products, its drawings and its attachments come along
    const got = fromOrderSpecs(o, pairs, notes, specs, soAtts);
    // files already copied from this order on an earlier save are not copied again
    const copied = (list, nm) => list.some(x => String(x.usedFor || '').includes(String(o.orderNo || o.orderId)) && (x.name === nm));
    setNotes(got.notes);
    setSpecs(got.specs.filter(x => x.kind !== 'so' || !copied(specs.filter(y => y.kind === 'saved').map(y => y.meta), x.so.name || x.so.fileName)));
    setSoAtts(got.soAtts.filter(a => !copied(oldAtt, a.name || a.fileName)));
    setImp(null);
    setMsg({ ok: true, text: `${picked.length} item(s) of order ${o.orderNo} imported — fill the purchase rates.` });
  };
  /* open a file in a new tab: saved on this PO, on the sales order, or just chosen */
  const viewFile = async (x, label) => {
    try {
      let blob;
      if (x.file) blob = x.file;
      else {
        const url = x.orderId ? `/api/sales-orders/${x.orderId}/download/${encodeURIComponent(x.fileName)}` : `/api/purchase-orders/${editPo.orderId}/download/${encodeURIComponent(x.fileName)}`;
        blob = (await axios.get(url, { params: { companyId, inline: 1 }, responseType: 'blob' })).data;
      }
      const u = URL.createObjectURL(blob);
      window.open(u, '_blank', 'noopener');
      setTimeout(() => URL.revokeObjectURL(u), 60000);
    } catch { setMsg({ ok: false, text: `Could not open ${label} — the file is missing on the server.` }); }
  };
  const addSpecFiles = (lineKey, list) => {
    const ok = [], big = [];
    [...(list || [])].forEach(f => (f.size > MAX_MB * 1048576 ? big.push(f.name) : ok.push({ id: uid(), kind: 'new', lineKey, file: f })));
    setSpecs(xs => [...xs, ...ok]);
    if (big.length) setMsg({ ok: false, text: `Too large (over ${MAX_MB} MB): ${big.join(', ')}` });
  };
  const pickRm = i => e => {
    const val = e.target.value, rm = rms.find(r => r.name.trim().toLowerCase() === val.trim().toLowerCase());
    setLines(ls => ls.map((l, j) => (j !== i ? l : rm
      ? { ...l, itemName: rm.name, itemCode: rm.code, unit: rm.unit || l.unit, hsnCode: rm.hsnCode || l.hsnCode, gstPercent: rm.gstPercent ?? l.gstPercent }
      : { ...l, itemName: val, itemCode: '' })));
    setErrs(o => ({ ...o, [`l${i}itemName`]: undefined, items: undefined })); setMsg(null);
  };
  const setL = (i, k) => e => { const val = e.target.value; setLines(ls => ls.map((l, j) => (j === i ? { ...l, [k]: val } : l))); setErrs(o => ({ ...o, [`l${i}${k}`]: undefined, items: undefined })); setMsg(null); };

  /* totals: items + additional charges (each with its GST) */
  const calc = lines.map(lineCalc);
  const prodValue = r2(calc.reduce((s, c) => s + c.taxable, 0));
  const chCalc = charges.map(c => ({ amount: r2(n(c.amount)), gst: r2(n(c.amount) * n(c.gstPercent) / 100) }));
  const chValue = r2(chCalc.reduce((s, c) => s + c.amount, 0));
  const subTotal = r2(prodValue + chValue);
  const totalGST = r2(calc.reduce((s, c) => s + c.gst, 0) + chCalc.reduce((s, c) => s + c.gst, 0));
  const extra = r2(n(v.freightCharges) + n(v.packingCharges));   // older POs only (no box for it now)
  const raw = r2(subTotal + totalGST + extra);
  const grandTotal = Math.round(raw);
  const roundOff = r2(grandTotal - raw);
  const cgst = intra ? r2(totalGST / 2) : 0, sgst = intra ? r2(totalGST - r2(totalGST / 2)) : 0, igst = intra ? 0 : totalGST;

  const check = () => {
    const e = {};
    if (!v.vendorId && !v.vendorName) e.vendor = 'Choose the vendor from the list';
    if (!v.poNo.trim()) e.poNo = 'Enter the PO number';
    else if ((pos || []).some(p => String(p.orderId) !== String(editPo?.orderId) && low(p.poNo || p.poNumber) === low(v.poNo))) e.poNo = 'This PO number is already used';
    if (!v.poDate) e.poDate = 'Enter the PO date';
    if (v.deliveryDate && v.poDate && v.deliveryDate < v.poDate) e.deliveryDate = 'Before the PO date';
    const used = lines.filter(l => l.itemName.trim() || n(l.qty) || n(l.rate));
    if (!used.length) e.items = 'Add at least one item';
    lines.forEach((l, i) => {
      if (!(l.itemName.trim() || n(l.qty) || n(l.rate))) return;
      if (!l.itemName.trim()) e[`l${i}itemName`] = 'Item name';
      else if (forStock && !l.itemCode) e[`l${i}itemName`] = 'Pick from the Raw Material list';
      if (!(n(l.qty) > 0)) e[`l${i}qty`] = 'Qty';
      if (String(l.rate).trim() === '' || n(l.rate) < 0) e[`l${i}rate`] = 'Rate';
    });
    setErrs(e);
    return !Object.keys(e).length;
  };

  const save = async status => {
    if (!check()) { setMsg({ ok: false, text: 'Please correct the fields marked in red.' }); return; }
    setBusy(true); setMsg(null);
    try {
      const fd = new FormData();
      const add = (k, x) => fd.append(k, x == null ? '' : String(x));
      const items = lines.filter(l => l.itemName.trim()).map(l => ({
        itemCode: l.itemCode || '', itemName: l.itemName.trim(), description: (l.description || '').trim(), hsnCode: (l.hsnCode || '').trim(),
        qty: n(l.qty), unit: l.unit || 'NOS', rate: String(n(l.rate)), discount: n(l.discount), discountType: '%', gstPercent: n(l.gstPercent), dueDate: l.dueDate || '',
        ...(!forStock && Number.isInteger(l.soLine) ? { soLine: l.soLine } : {}),
      }));
      add('companyId', companyId);
      ['vendorId', 'vendorName', 'vendorGstin', 'vendorCode', 'vendorState', 'vendorAddress', 'vendorCity', 'vendorPincode', 'contactPerson', 'mobile', 'email',
        'poDate', 'deliveryDate', 'quotationRef', 'paymentTerms', 'paymentMode', 'dispatchMode', 'freightTerms',
        'shipFromAddress', 'shipFromCity', 'shipFromState', 'shipFromPincode', 'deliveryAddr', 'termsConditions', 'vendorNotes', 'internalNotes']
        .forEach(k => add(k, typeof v[k] === 'string' ? v[k].trim() : v[k]));
      add('poNo', v.poNo.trim());
      add('poType', forStock ? 'Stock' : (editPo?.poType && editPo.poType !== 'Stock' ? editPo.poType : 'Standard'));
      add('linkedSalesOrderId', forStock ? '' : v.orderId);
      add('items', JSON.stringify(items));
      add('subTotal', subTotal); add('totalGST', totalGST); add('grandTotal', grandTotal);
      add('cgst', cgst); add('sgst', sgst); add('igst', igst);
      add('freightCharges', n(v.freightCharges)); add('packingCharges', n(v.packingCharges)); add('roundOff', roundOff);
      add('charges', JSON.stringify(charges.filter(c => c.chargeType.trim() || n(c.amount)).map(c => ({ chargeType: c.chargeType.trim() || 'Charges', amount: String(n(c.amount)), gstPercent: n(c.gstPercent) }))));
      if (status) add('status', status);   // edit without a status: the server keeps the current one
      // item-wise specs: text per item, saved drawings, new uploads (in order), and the order's files to copy in
      const named = lines.filter(l => l.itemName.trim());
      const nameOf = lk => (named.find(l => l.key === lk) || {}).itemName?.trim() || '';
      const live = specs.filter(x => !x.lineKey || named.some(l => l.key === x.lineKey));
      add('specSheet', JSON.stringify({ mode: 'freewrite', itemNotes: named.map((l, i) => ({ itemIdx: i, itemName: l.itemName.trim(), text: (notes[l.key] || '').trim() })).filter(x => x.text) }));
      const newSpecs = live.filter(x => x.kind === 'new');
      add('specFiles', JSON.stringify([
        ...live.filter(x => x.kind === 'saved').map(x => ({ ...x.meta, itemName: nameOf(x.lineKey) || x.meta.itemName || '' })),
        ...newSpecs.map(x => ({ name: x.file.name, itemName: nameOf(x.lineKey), category: 'Specification' })),
      ]));
      newSpecs.forEach(x => fd.append('specUploadFiles', x.file));
      add('copySoFiles', JSON.stringify([
        ...live.filter(x => x.kind === 'so').map(x => ({ kind: 'spec', orderId: x.so.orderId, orderNo: x.so.orderNo, name: x.so.name || x.so.fileName, fileName: x.so.fileName, filePath: x.so.filePath, itemName: nameOf(x.lineKey) })),
        ...soAtts.map(a => ({ kind: 'att', orderId: a.orderId, orderNo: a.orderNo, name: a.name || a.fileName, fileName: a.fileName, filePath: a.filePath })),
      ]));
      const newMeta = files.map(f => ({ name: f.file.name, size: f.file.size }));
      if (isEdit) {
        // new files first: the server puts each upload into the attachment entry with the same position
        add('attachments', JSON.stringify([...newMeta, ...oldAtt]));
        files.forEach(f => fd.append('attachmentFiles', f.file));
        await axios.put(`/api/purchase-orders/${editPo.orderId}`, fd, { params: { companyId }, headers: { 'Content-Type': 'multipart/form-data' } });
        onSaved({ ...editPo, poNo: v.poNo }, `PO ${v.poNo} updated${status === 'pending' ? ' and sent for approval' : ''}.`);
      } else {
        add('attachments', JSON.stringify(newMeta));
        files.forEach(f => fd.append('attachmentFiles', f.file));
        const r = await axios.post('/api/purchase-orders', fd, { params: { companyId }, headers: { 'Content-Type': 'multipart/form-data' } });
        onSaved({ orderId: r.data?.orderId, poNo: v.poNo }, `PO ${v.poNo} ${status === 'pending' ? 'sent for approval' : 'saved as draft'} — ${v.vendorName}, ₹ ${amt(grandTotal)}.`);
      }
    } catch (e) {
      setMsg({ ok: false, text: e.response?.data?.error || 'Could not save the PO. Try again.' });
    } finally { setBusy(false); }
  };

  const err = k => errs[k] && <span className="cf-err">{errs[k]}</span>;
  const inp = (k, props = {}) => <input id={`po-${k}`} value={v[k]} onChange={set(k)} disabled={busy} {...props} className={`${props.className || ''}${errs[k] ? ' bad' : ''}`} />;
  const sel = (k, opts, ph) => (
    <select id={`po-${k}`} value={v[k]} onChange={set(k)} disabled={busy}>
      <option value="">{ph || 'Select'}</option>
      {opts.map(o => <option key={o} value={o}>{o}</option>)}
      {v[k] && !opts.includes(v[k]) && <option value={v[k]}>{v[k]}</option>}
    </select>
  );
  const head = (icon, title, sub, extraNode) => (
    <div className="cf-ch"><span className="ico"><Svg name={icon} size={16} /></span><span className="t"><b>{title}</b>{sub && <small>{sub}</small>}</span>{extraNode}</div>
  );
  const status = editPo?.status;

  return (
    <div className="cf">
      <style>{CF_CSS + PO_CSS}</style>
      {pickOpen && <OrderPicker orders={ordersOk} pos={pos} skipId={editPo?.orderId} onPick={pickOrder} onClose={() => setPickOpen(false)} />}
      {vPick && <VendorPicker vendors={vendorsOk} pos={pos} onPick={pickVendor} onClose={() => setVPick(false)} />}
      {imp && (
        <div className="po-pkb" onMouseDown={e => { if (e.target === e.currentTarget) setImp(null); }}>
          <div className="po-pk wide" role="dialog" aria-modal="true" aria-labelledby="po-imp-t">
            <div className="po-pkh"><b id="po-imp-t">Items of {imp.order.orderNo}</b><span>{imp.order.customerName}{imp.order.customerPO ? ` · PO ${imp.order.customerPO}` : ''}</span>
              <button type="button" onClick={() => setImp(null)} aria-label="Close">×</button></div>
            <div className="po-pkl">
              <table className="po-it">
                <thead><tr><th style={{ width: 34 }}><input type="checkbox" aria-label="All items" checked={imp.rows.every(r => r.on)} onChange={e => { const on = e.target.checked; setImp(x => ({ ...x, rows: x.rows.map(r => ({ ...r, on })) })); }} /></th>
                  <th>Item</th><th style={{ width: 80 }}>Unit</th><th style={{ width: 92 }}>Order Qty</th><th style={{ width: 100 }}>Already on PO</th><th style={{ width: 84 }}>Due</th><th style={{ width: 110 }}>This PO Qty</th></tr></thead>
                <tbody>
                  {soLines(imp.order).map((it, i) => {
                    const r = imp.rows[i], due = Math.max(0, n(it.qty) - imp.done[i]), over = n(r.qty) > due;
                    return (
                      <tr key={i} className={r.on ? 'on' : ''}>
                        <td className="c"><input type="checkbox" checked={r.on} aria-label={`Take ${soItemName(it)}`} onChange={e => { const on = e.target.checked; setImp(x => ({ ...x, rows: x.rows.map((y, j) => (j === i ? { ...y, on } : y)) })); }} /></td>
                        <td><b>{soItemName(it) || '—'}</b>{it.addon ? <span className="po-ao">Add-on</span> : null}{it.additionalDesc ? <small>{it.additionalDesc}</small> : null}</td>
                        <td className="c">{it.unit || 'NOS'}</td>
                        <td className="c">{n(it.qty)}</td>
                        <td className={`c${imp.done[i] ? ' warn' : ' mut'}`}>{imp.done[i] || 0}</td>
                        <td className={`c${due > 0 ? ' due' : ' ok'}`}>{due > 0 ? due : '✓'}</td>
                        <td><input value={r.qty} inputMode="decimal" disabled={!r.on} className={over ? 'bad' : ''} aria-label={`This PO qty of ${soItemName(it)}`}
                          onChange={e => { const q = e.target.value; setImp(x => ({ ...x, rows: x.rows.map((y, j) => (j === i ? { ...y, qty: q } : y)) })); }} />
                          {over && <small className="ovr">More than due</small>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="po-pkf">
              <span>{imp.rows.filter(r => r.on && n(r.qty) > 0).length} of {imp.rows.length} item(s) · rates are filled in the PO</span>
              <button type="button" className="cf-b ghost" onClick={() => setImp(null)}>Skip</button>
              <button type="button" className="cf-b pri" autoFocus disabled={!imp.rows.some(r => r.on && n(r.qty) > 0)} onClick={doImport}>Import</button>
            </div>
          </div>
        </div>
      )}
      <div className="cf-in">
        <div className="cf-hero">
          <span className="ic"><Svg name="cart" size={16} /></span>
          <h1>{isEdit ? 'Edit Purchase Order' : 'Create Purchase Order'}</h1>
          <span className="grow" />
          <span className="cf-pill">{isEdit ? (status === 'pending' ? 'Approval pending' : status === 'approved' ? 'Approved' : status === 'rejected' ? 'Rejected' : 'Draft') : 'New'}</span>
          <div className="cf-chip"><small>PO No.</small><b>{v.poNo || '—'}</b></div>
        </div>

        {msg && <div className={`cf-msg ${msg.ok ? 'ok' : 'err'}`} role="status">{msg.text}</div>}

        {/* vendor | PO details — same height */}
        <div className="cf-2 po-top">
          <div className="cf-card">
            {head('cart', 'Vendor')}
            <table className="cf-kv"><tbody>
              <tr><th>Vendor <i>*</i></th><td colSpan={3} className="po-pick">
                <div className="po-srch">
                  <input readOnly value={v.vendorText} placeholder="Click 🔍 to choose the vendor" aria-label="Vendor" className={errs.vendor ? 'bad' : ''} autoFocus={!isEdit}
                    onClick={() => !busy && setVPick(true)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ' || e.key === 'F2') { e.preventDefault(); setVPick(true); } }} />
                  <button type="button" className="po-sbtn" title="Search vendors" aria-label="Search vendors" disabled={busy} onClick={() => setVPick(true)}><Svg name="search" size={14} /></button>
                </div>
                {err('vendor')}
              </td></tr>
              <tr><th>Contact</th><td>{inp('contactPerson')}</td><th>Mobile</th><td>{inp('mobile', { inputMode: 'tel' })}</td></tr>
              <tr><th>Email</th><td>{inp('email', { type: 'email' })}</td><th>GSTIN</th><td className="po-ro mono">{v.vendorGstin || <span className="mut">—</span>}</td></tr>
              <tr><th>Bill From</th><td colSpan={3} className="po-ro">{[v.vendorAddress, v.vendorCity, v.vendorPincode].filter(Boolean).join(', ') || <span className="mut">Choose a vendor — its address, GSTIN, contact and dispatch address fill in.</span>}
                {vendor?.status && vendor.status !== 'approved' && <div style={{ color: '#B54708', fontWeight: 600 }}>This vendor is not approved yet ({vendor.status}).</div>}</td></tr>
              <tr><th>State</th><td className="po-ro">{v.vendorState || <span className="mut">—</span>}</td><th>Tax</th><td className="po-ro">{v.vendorState ? (intra ? 'CGST + SGST' : 'IGST') : <span className="mut">—</span>}</td></tr>
            </tbody></table>
          </div>

          <div className="cf-card">
            {head('file', 'PO Details')}
            <table className="cf-kv"><tbody>
              <tr><th>PO No. <i>*</i></th><td>{inp('poNo', { className: 'mono' })}{err('poNo')}</td>
                <th>PO Date <i>*</i></th><td>{inp('poDate', { type: 'date' })}{err('poDate')}</td></tr>
              <tr><th>PO for</th><td colSpan={3}>
                <div className="po-for" role="radiogroup" aria-label="PO for">
                  <label><input type="radio" checked={!forStock} onChange={() => setForStock(false)} disabled={busy} /> Sales order</label>
                  <label><input type="radio" checked={forStock} onChange={() => { setForStock(true); setV(x => ({ ...x, orderId: '', orderText: '' })); }} disabled={busy} /> Stock — raw material for the godown</label>
                </div>
              </td></tr>
              {!forStock && <tr><th>Against Order</th><td colSpan={3}>
                <div className="po-srch">
                  <input readOnly value={v.orderText} placeholder="Click 🔍 to choose the sales order (optional)" aria-label="Against sales order" onClick={() => !busy && setPickOpen(true)}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ' || e.key === 'F2') { e.preventDefault(); setPickOpen(true); } }} />
                  {v.orderId && <button type="button" className="po-clr" title="Not against an order" aria-label="Clear the order" disabled={busy}
                    onClick={() => setV(x => ({ ...x, orderId: '', orderText: '' }))}>×</button>}
                  <button type="button" className="po-sbtn" title="Search orders" aria-label="Search orders" disabled={busy} onClick={() => setPickOpen(true)}><Svg name="search" size={14} /></button>
                </div>
              </td></tr>}
              <tr><th>Delivery Date</th><td>{inp('deliveryDate', { type: 'date' })}{err('deliveryDate')}</td><th>Vendor Quote Ref.</th><td>{inp('quotationRef')}</td></tr>
              <tr><th>Payment Terms</th><td>{inp('paymentTerms', { list: 'po-pay-terms', placeholder: 'e.g. 30% advance, 70% before dispatch', autoComplete: 'off' })}<datalist id="po-pay-terms">{PAY_TERMS.map(t => <option key={t} value={t} />)}</datalist></td><th>Payment Mode</th><td>{sel('paymentMode', PAY_MODES)}</td></tr>
              <tr><th>Dispatch Mode</th><td>{sel('dispatchMode', DISPATCH)}</td><th>Freight</th><td>{sel('freightTerms', FREIGHT)}</td></tr>
            </tbody></table>
          </div>
        </div>

        {/* ship from | deliver to */}
        <div className="cf-2">
          <div className="cf-card">
            {head('box', 'Ship From', 'Where the vendor sends the goods from')}
            <table className="cf-kv"><tbody>
              <tr><th>Address</th><td colSpan={3}><textarea id="po-shipFromAddress" value={v.shipFromAddress} onChange={set('shipFromAddress')} disabled={busy} rows={2} placeholder="Fills from the vendor's Dispatch From" /></td></tr>
              <tr><th>City</th><td>{inp('shipFromCity')}</td><th>Pincode</th><td>{inp('shipFromPincode', { inputMode: 'numeric' })}</td></tr>
              <tr><th>State</th><td colSpan={3}>
                <select id="po-shipFromState" value={v.shipFromState} onChange={set('shipFromState')} disabled={busy}><option value="">Select state</option>{STATES.map(s => <option key={s} value={s}>{s}</option>)}</select>
              </td></tr>
            </tbody></table>
          </div>
          <div className="cf-card">
            {head('globe', 'Deliver To', 'Where the vendor must deliver')}
            <table className="cf-kv"><tbody>
              <tr><th>Address</th><td colSpan={3}>
                <textarea id="po-deliveryAddr" value={v.deliveryAddr} onChange={set('deliveryAddr')} disabled={busy} rows={3} placeholder="Site / godown / office address" />
                <div className="po-qk">
                  <button type="button" disabled={busy || !order} onClick={() => setV(o => ({ ...o, deliveryAddr: siteOf(order) }))} title={order ? siteOf(order) : 'Choose the order first'}>Order site</button>
                  <button type="button" disabled={busy || !company} onClick={() => setV(o => ({ ...o, deliveryAddr: officeOf(company) }))}>Our office</button>
                </div>
              </td></tr>
            </tbody></table>
          </div>
        </div>

        {/* items */}
        <div className="cf-card">
          {head('box', 'Items', intra ? 'Same state — CGST + SGST' : 'Other state — IGST', <>
            <span className="grow" />
            {order && <button type="button" className="cf-add" disabled={busy} onClick={() => openImport(order)}>Import items from order</button>}
          </>)}
          {forStock && <datalist id="po-rm-list">{rms.map(r => <option key={r.rmId} value={r.name}>{r.code} · {r.unit}</option>)}</datalist>}
          <div className="po-tw">
            <table className="po-t">
              <colgroup><col style={{ width: 34 }} /><col /><col style={{ width: 96 }} /><col style={{ width: 132 }} /><col style={{ width: 70 }} /><col style={{ width: 78 }} /><col style={{ width: 104 }} /><col style={{ width: 62 }} /><col style={{ width: 70 }} /><col style={{ width: 104 }} /><col style={{ width: 92 }} /><col style={{ width: 110 }} /><col style={{ width: 36 }} /></colgroup>
              <thead><tr><th>#</th><th>Item / Description</th><th>HSN</th><th>Due Date</th><th>Qty</th><th>Unit</th><th>Rate (₹)</th><th>Disc %</th><th>GST %</th><th>Taxable</th><th>GST</th><th>Total</th><th /></tr></thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={l.key}>
                    <td className="sn">{i + 1}</td>
                    <td>
                      <input value={l.itemName} onChange={forStock ? pickRm(i) : setL(i, 'itemName')} disabled={busy} placeholder={forStock ? 'Type to pick a raw material' : 'Item name'} list={forStock ? 'po-rm-list' : undefined} className={errs[`l${i}itemName`] ? 'bad' : ''} aria-label={`Item ${i + 1}`} />
                      {forStock && l.itemName.trim() && !l.itemCode && <span className="po-rmw">Not in the Raw Material list — add it there first</span>}
                      <textarea value={l.description} onChange={setL(i, 'description')} disabled={busy} rows={1} placeholder="Specification / description (optional)" aria-label={`Item ${i + 1} description`} />
                    </td>
                    <td><input value={l.hsnCode} onChange={setL(i, 'hsnCode')} disabled={busy} className="mono" aria-label={`Item ${i + 1} HSN`} /></td>
                    <td><input type="date" value={l.dueDate || ''} onChange={setL(i, 'dueDate')} disabled={busy} aria-label={`Item ${i + 1} due date`} title="When the vendor must deliver this item" /></td>
                    <td className="r"><input value={l.qty} onChange={setL(i, 'qty')} disabled={busy} inputMode="decimal" className={errs[`l${i}qty`] ? 'bad' : ''} aria-label={`Item ${i + 1} quantity`} /></td>
                    <td><select value={l.unit} onChange={setL(i, 'unit')} disabled={busy} aria-label={`Item ${i + 1} unit`}>{[...new Set([...UNITS, l.unit].filter(Boolean))].map(u => <option key={u} value={u}>{u}</option>)}</select></td>
                    <td className="r"><input value={l.rate} onChange={setL(i, 'rate')} disabled={busy} inputMode="decimal" placeholder="0.00" className={errs[`l${i}rate`] ? 'bad' : ''} aria-label={`Item ${i + 1} rate`} /></td>
                    <td className="r"><input value={l.discount} onChange={setL(i, 'discount')} disabled={busy} inputMode="decimal" placeholder="0" aria-label={`Item ${i + 1} discount`} /></td>
                    <td><select value={l.gstPercent} onChange={e => setL(i, 'gstPercent')({ target: { value: n(e.target.value) } })} disabled={busy} aria-label={`Item ${i + 1} GST`}>{[...new Set([...GST_RATES, n(l.gstPercent)])].map(g => <option key={g} value={g}>{g}%</option>)}</select></td>
                    <td className="num">{amt(calc[i].taxable)}</td>
                    <td className="num">{amt(calc[i].gst)}</td>
                    <td className="num"><b>{amt(calc[i].total)}</b></td>
                    <td>{lines.length > 1 && <button type="button" className="cf-rm" title="Remove item" aria-label={`Remove item ${i + 1}`} onClick={() => setLines(ls => ls.filter((_, j) => j !== i))}>×</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="po-acts">
            <button type="button" className="cf-add" disabled={busy} onClick={() => setLines(ls => [...ls, blankLine()])}>+ Add item</button>
            {err('items')}
            <span className="grow" />
            <small>{lines.filter(l => l.itemName.trim()).length} item(s) · Taxable ₹ {amt(subTotal)} · GST ₹ {amt(totalGST)}</small>
          </div>
        </div>

        {/* additional charges (with GST) */}
        <div className="cf-card">
          {head('wallet', 'Additional Charges', 'Freight, packing, loading, installation… with their GST', <>
            <span className="grow" />
            <button type="button" className="cf-add" disabled={busy} onClick={() => setCharges(cs => [...cs, { key: uid(), chargeType: '', amount: '', gstPercent: 18 }])}>+ Add charge</button>
          </>)}
          {charges.length ? (
            <div className="po-tw">
              <table className="po-t ch">
                <colgroup><col style={{ width: 34 }} /><col /><col style={{ width: 140 }} /><col style={{ width: 90 }} /><col style={{ width: 120 }} /><col style={{ width: 130 }} /><col style={{ width: 36 }} /></colgroup>
                <thead><tr><th>#</th><th>Charge</th><th>Amount (₹)</th><th>GST %</th><th>GST</th><th>Total</th><th /></tr></thead>
                <tbody>
                  {charges.map((c, i) => (
                    <tr key={c.key}>
                      <td className="sn">{i + 1}</td>
                      <td><input value={c.chargeType} onChange={setCh(i, 'chargeType')} disabled={busy} list="po-charge-types" placeholder="e.g. Freight / Packing & Forwarding" aria-label={`Charge ${i + 1}`} /></td>
                      <td className="r"><input value={c.amount} onChange={setCh(i, 'amount')} disabled={busy} inputMode="decimal" placeholder="0.00" aria-label={`Charge ${i + 1} amount`} /></td>
                      <td><select value={c.gstPercent} onChange={setCh(i, 'gstPercent')} disabled={busy} aria-label={`Charge ${i + 1} GST`}>{[...new Set([...GST_RATES, n(c.gstPercent)])].map(g => <option key={g} value={g}>{g}%</option>)}</select></td>
                      <td className="num">{amt(chCalc[i].gst)}</td>
                      <td className="num"><b>{amt(chCalc[i].amount + chCalc[i].gst)}</b></td>
                      <td><button type="button" className="cf-rm" title="Remove charge" aria-label={`Remove charge ${i + 1}`} onClick={() => setCharges(cs => cs.filter((_, j) => j !== i))}>×</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <datalist id="po-charge-types">{CHARGE_TYPES.map(t => <option key={t} value={t} />)}</datalist>
            </div>
          ) : <div className="po-spec-empty">No additional charges — press “+ Add charge” for freight, packing, loading…</div>}
        </div>

        {/* specs item-wise (like the sales order): text + drawings; the order's specs come in on import */}
        <div className="cf-card">
          {head('file', 'Specifications — item wise', 'Notes and drawings for each item — what the vendor must make')}
          {lines.some(l => l.itemName.trim()) ? lines.filter(l => l.itemName.trim()).map(l => {
            const fl = specs.filter(x => x.lineKey === l.key);
            return (
              <div className="po-spec" key={l.key}>
                <div className="nm"><b>{l.itemName}</b><small>{n(l.qty)} {l.unit}{l.hsnCode ? ` · HSN ${l.hsnCode}` : ''}</small></div>
                <div className="bd">
                  <textarea value={notes[l.key] || ''} onChange={e => { const t = e.target.value; setNotes(o => ({ ...o, [l.key]: t })); }} disabled={busy} rows={Math.min(8, Math.max(2, (notes[l.key] || "").split(String.fromCharCode(10)).length))}
                    placeholder="Size, material, finish, standards…" aria-label={`Specification for ${l.itemName}`} />
                  <div className="po-att in">
                    {fl.map(x => {
                      const f = x.kind === 'saved' ? x.meta : x.kind === 'so' ? x.so : null;
                      const nm = x.file ? x.file.name : (f.name || f.fileName);
                      return (
                        <span className={`po-file${x.kind === 'new' ? ' new' : ''}`} key={x.id}>
                          <span className="ext">{extOf(x.file ? x.file.name : f.fileName)}</span>
                          <button type="button" className="lk" title={`Open ${nm}`} onClick={() => viewFile(x.file ? x : (x.kind === 'so' ? x.so : f), nm)}>{nm}</button>
                          <small>{x.kind === 'new' ? fileSize(x.file.size) : x.kind === 'so' ? <span className="so">From {x.so.orderNo}</span> : (f.usedFor || 'Saved')}</small>
                          <button type="button" aria-label={`Remove ${nm}`} title="Remove from this PO" onClick={() => setSpecs(xs => xs.filter(y => y.id !== x.id))}>×</button>
                        </span>
                      );
                    })}
                    <label className="po-up"><Svg name="plus" size={13} stroke={2.2} />Drawing / file
                      <input type="file" multiple hidden onChange={e => { addSpecFiles(l.key, e.target.files); e.target.value = ''; }} /></label>
                  </div>
                </div>
              </div>
            );
          }) : <div className="po-spec-empty">Add an item above to write its specification.</div>}
        </div>

        {/* terms | totals */}
        <div className="po-sum">
          <div className="cf-card">
            {head('file', 'Terms & Notes')}
            <table className="cf-kv"><tbody>
              <tr><th>Terms & Conditions</th><td><textarea value={v.termsConditions} onChange={set('termsConditions')} disabled={busy} rows={4} placeholder="Delivery, warranty, inspection, penalty…" /></td></tr>
              <tr><th>Note to Vendor</th><td><textarea value={v.vendorNotes} onChange={set('vendorNotes')} disabled={busy} rows={2} /></td></tr>
              <tr><th>Internal Note</th><td><textarea value={v.internalNotes} onChange={set('internalNotes')} disabled={busy} rows={2} placeholder="Not printed on the PO" /></td></tr>
            </tbody></table>
          </div>
          <div className="cf-card">
            {head('wallet', 'Amount')}
            <table className="po-tot"><tbody>
              <tr><th>Product value</th><td>{amt(prodValue)}</td></tr>
              {chValue ? <tr><th>Additional charges</th><td>{amt(chValue)}</td></tr> : null}
              <tr><th>Taxable value</th><td>{amt(subTotal)}</td></tr>
              {intra ? <>
                <tr><th>CGST</th><td>{amt(cgst)}</td></tr>
                <tr><th>SGST</th><td>{amt(sgst)}</td></tr>
              </> : <tr><th>IGST</th><td>{amt(igst)}</td></tr>}
              {extra ? <tr><th>Freight / packing <small>(older PO, added as is)</small></th><td>{amt(extra)}</td></tr> : null}
              <tr><th>Round off</th><td>{roundOff > 0 ? '+' : ''}{amt(roundOff)}</td></tr>
              <tr className="gt"><th>PO Amount</th><td>₹ {amt(grandTotal)}</td></tr>
            </tbody></table>
          </div>
        </div>

        {/* attachments */}
        <div className="cf-card">
          {head('file', 'Attachments', 'Vendor quotation, drawing, specification…')}
          <div className="po-att">
            {oldAtt.map((a, i) => (
              <span className="po-file" key={(a.fileName || a.name || '') + i}><span className="ext">{extOf(a.fileName || a.name)}</span>
                <button type="button" className="lk" title={`Open ${a.name || a.fileName}`} onClick={() => viewFile(a, a.name || a.fileName)}>{a.name || a.fileName}</button><small>{a.usedFor || 'Saved'}</small>
                <button type="button" aria-label={`Remove ${a.name || 'attachment'}`} title="Remove" onClick={() => setOldAtt(xs => xs.filter((_, j) => j !== i))}>×</button></span>
            ))}
            {soAtts.map(a => (
              <span className="po-file" key={a.id}><span className="ext">{extOf(a.fileName)}</span>
                <button type="button" className="lk" title={`Open ${a.name || a.fileName}`} onClick={() => viewFile(a, a.name || a.fileName)}>{a.name || a.fileName}</button><small><span className="so">From {a.orderNo}</span></small>
                <button type="button" aria-label={`Remove ${a.name || 'attachment'}`} title="Do not attach to this PO" onClick={() => setSoAtts(xs => xs.filter(x => x.id !== a.id))}>×</button></span>
            ))}
            {files.map(f => (
              <span className="po-file new" key={f.key}><span className="ext">{extOf(f.file.name)}</span>
                <button type="button" className="lk" title={`Open ${f.file.name}`} onClick={() => viewFile(f, f.file.name)}>{f.file.name}</button><small>{fileSize(f.file.size)}</small>
                <button type="button" aria-label={`Remove ${f.file.name}`} title="Remove" onClick={() => setFiles(xs => xs.filter(x => x.key !== f.key))}>×</button></span>
            ))}
            <button type="button" className="po-up" disabled={busy} onClick={() => fileRef.current?.click()}><Svg name="plus" size={13} stroke={2.2} />Add files</button>
            <input ref={fileRef} type="file" multiple hidden onChange={e => {
              const ok = [], big = [];
              [...(e.target.files || [])].forEach(f => (f.size > MAX_MB * 1048576 ? big.push(f.name) : ok.push({ key: uid(), file: f })));
              setFiles(xs => [...xs, ...ok]); e.target.value = '';
              if (big.length) setMsg({ ok: false, text: `Too large (over ${MAX_MB} MB): ${big.join(', ')}` });
            }} />
          </div>
        </div>
      </div>

      <div className="cf-bar">
        <span className="info">{v.vendorName ? <><b style={{ color: '#101828' }}>{v.poNo}</b> · {v.vendorName}{order ? ` · for ${order.orderNo}` : ''} · ₹ {amt(grandTotal)}</> : 'Choose the vendor and fill the items'}</span>
        {isEdit ? <>
          <button type="button" className="cf-b ghost" disabled={busy} onClick={onClose}>Back to list</button>
          {['draft', 'rejected'].includes(status || 'draft') && <button type="button" className="cf-b draft" disabled={busy} onClick={() => save('pending')}>Submit for Approval</button>}
          <button type="button" className="cf-b pri" disabled={busy} onClick={() => save(null)}>{busy ? 'Saving…' : 'Save Changes'}</button>
        </> : <>
          <button type="button" className="cf-b ghost" disabled={busy} onClick={onClose}>Clear</button>
          <button type="button" className="cf-b draft" disabled={busy} onClick={() => save('draft')}>Save Draft</button>
          <button type="button" className="cf-b pri" disabled={busy} onClick={() => save('pending')}>{busy ? 'Saving…' : 'Submit for Approval'}</button>
        </>}
      </div>
    </div>
  );
}

/* ── order search pop-up: Order / File No., date, client, client PO, products, qty, POs made ── */
function OrderPicker({ orders, pos, skipId, onPick, onClose }) {
  const [q, setQ] = useState('');
  const [onlyOpen, setOnlyOpen] = useState(true);   // orders that still have qty without a PO
  const [hi, setHi] = useState(0);
  const rows = useMemo(() => orders.map(o => {
    const done = poQtyOf(o, pos, skipId);
    const qty = soLines(o).reduce((s, it) => s + n(it.qty), 0);
    const due = soLines(o).reduce((s, it, i) => s + Math.max(0, n(it.qty) - done[i]), 0);
    const poCount = (pos || []).filter(p => String(p.linkedSalesOrderId) === String(o.orderId) && p.status !== 'rejected' && String(p.orderId) !== String(skipId)).length;
    return { o, qty, due, poCount };
  }), [orders, pos, skipId]);
  const shown = useMemo(() => {
    const w = q.toLowerCase().split(/\s+/).filter(Boolean);
    return rows.filter(r => (!onlyOpen || r.due > 0)
      && (!w.length || w.every(x => `${r.o.orderNo} ${r.o.customerName || ''} ${r.o.customerPO || ''} ${soLines(r.o).map(i => i.description).join(' ')}`.toLowerCase().includes(x))));
  }, [rows, q, onlyOpen]);
  useEffect(() => { setHi(0); }, [q, onlyOpen]);
  useEffect(() => {
    const k = e => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [onClose]);
  const fd = d => { if (!d) return '—'; const x = new Date(d); return isNaN(x) ? d : x.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }); };
  return (
    <div className="po-pkb" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="po-pk" role="dialog" aria-modal="true" aria-labelledby="po-pk-t">
        <div className="po-pkh"><b id="po-pk-t">Choose the sales order</b><span>{shown.length} order(s)</span><button type="button" onClick={onClose} aria-label="Close">×</button></div>
        <div className="po-pks">
          <Svg name="search" size={15} />
          <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Order / file no., client, client PO, product…" aria-label="Search orders"
            onKeyDown={e => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setHi(h => Math.min(shown.length - 1, h + 1)); }
              if (e.key === 'ArrowUp') { e.preventDefault(); setHi(h => Math.max(0, h - 1)); }
              if (e.key === 'Enter' && shown[hi]) { e.preventDefault(); onPick(shown[hi].o); }
            }} />
          <label><input type="checkbox" checked={onlyOpen} onChange={e => setOnlyOpen(e.target.checked)} />Only orders with qty left for PO</label>
        </div>
        <div className="po-pkl">
          {!shown.length ? <div className="po-pke">{q ? `No order matches “${q}”.` : 'No order.'}</div> : (
            <table className="po-ot">
              <colgroup><col style={{ width: 120 }} /><col style={{ width: 82 }} /><col style={{ width: 190 }} /><col style={{ width: 140 }} /><col /><col style={{ width: 62 }} /><col style={{ width: 62 }} /><col style={{ width: 58 }} /></colgroup>
              <thead><tr><th>Order / File No.</th><th>Date</th><th>Client</th><th>Client PO</th><th>Products</th><th>Qty</th><th>Due for PO</th><th>POs made</th></tr></thead>
              <tbody>
                {shown.map((r, i) => (
                  <tr key={r.o.orderId} className={i === hi ? 'hi' : ''} onMouseEnter={() => setHi(i)} onClick={() => onPick(r.o)}>
                    <td className="no">{r.o.orderNo || r.o.orderId}</td>
                    <td className="c">{fd(r.o.orderDate)}</td>
                    <td>{r.o.customerName || r.o.party || '—'}</td>
                    <td>{r.o.customerPO || <span className="mut">—</span>}</td>
                    <td>{soLines(r.o).filter(it => soItemName(it)).map(it => `${soItemName(it)} × ${n(it.qty)}`).join('; ') || <span className="mut">—</span>}</td>
                    <td className="c">{r.qty}</td>
                    <td className={`c${r.due > 0 ? ' has' : ' mut'}`}>{r.due > 0 ? r.due : '✓'}</td>
                    <td className={`c${r.poCount ? '' : ' mut'}`}>{r.poCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── vendor search pop-up: id, name, GSTIN, city, state, contact, POs made ── */
function VendorPicker({ vendors, pos, onPick, onClose }) {
  const [q, setQ] = useState('');
  const [hi, setHi] = useState(0);
  /* POs made per vendor — matched by vendor id / code, or by name for older POs that have neither */
  const poCount = useMemo(() => {
    const m = {};
    vendors.forEach(v => {
      const ids = [String(v.vendorId), String(v.vendorCode || '')].filter(Boolean), nm = key(v.vendorName);
      m[String(v.vendorId)] = (pos || []).filter(p => p.status !== 'rejected'
        && (ids.includes(String(p.vendorId || '')) || ids.includes(String(p.vendorCode || '')) || (!p.vendorId && !p.vendorCode && nm && key(p.vendorName) === nm))).length;
    });
    return m;
  }, [vendors, pos]);
  const shown = useMemo(() => {
    const w = q.toLowerCase().split(' ').filter(Boolean);
    return vendors.filter(v => !w.length || w.every(x => `${v.vendorId} ${v.vendorName || ''} ${v.alias || ''} ${v.gstin || ''} ${v.city || ''} ${v.state || ''} ${v.contactPerson || ''} ${v.mobile || ''}`.toLowerCase().includes(x)));
  }, [vendors, q]);
  useEffect(() => { setHi(0); }, [q]);
  useEffect(() => {
    const k = e => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="po-pkb" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="po-pk" role="dialog" aria-modal="true" aria-labelledby="po-vk-t">
        <div className="po-pkh"><b id="po-vk-t">Choose the vendor</b><span>{shown.length} vendor(s)</span><button type="button" onClick={onClose} aria-label="Close">×</button></div>
        <div className="po-pks">
          <Svg name="search" size={15} />
          <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Vendor name, GSTIN, city, contact, mobile…" aria-label="Search vendors"
            onKeyDown={e => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setHi(h => Math.min(shown.length - 1, h + 1)); }
              if (e.key === 'ArrowUp') { e.preventDefault(); setHi(h => Math.max(0, h - 1)); }
              if (e.key === 'Enter' && shown[hi]) { e.preventDefault(); onPick(shown[hi]); }
            }} />
        </div>
        <div className="po-pkl">
          {!shown.length ? <div className="po-pke">{q ? `No vendor matches “${q}”.` : 'No vendor.'}</div> : (
            <table className="po-ot">
              <colgroup><col style={{ width: 74 }} /><col /><col style={{ width: 150 }} /><col style={{ width: 110 }} /><col style={{ width: 110 }} /><col style={{ width: 130 }} /><col style={{ width: 100 }} /><col style={{ width: 58 }} /><col style={{ width: 74 }} /></colgroup>
              <thead><tr><th>Vendor ID</th><th>Vendor Name</th><th>GSTIN</th><th>City</th><th>State</th><th>Contact</th><th>Mobile</th><th>POs made</th><th>Status</th></tr></thead>
              <tbody>
                {shown.map((v, i) => {
                  const ct = (v.contactPersons || [])[0] || {};
                  const pc = poCount[String(v.vendorId)] || 0;
                  return (
                    <tr key={v.vendorId} className={i === hi ? 'hi' : ''} onMouseEnter={() => setHi(i)} onClick={() => onPick(v)}>
                      <td className="no">{v.vendorId}</td>
                      <td><b>{v.vendorName}</b>{v.alias ? <small style={{ display: 'block', color: '#667085' }}>{v.alias}</small> : null}</td>
                      <td style={{ fontFamily: 'ui-monospace, Consolas, monospace', fontSize: 11.5 }}>{v.gstin || <span className="mut">—</span>}</td>
                      <td>{v.city || <span className="mut">—</span>}</td>
                      <td>{v.state || <span className="mut">—</span>}</td>
                      <td>{ct.name || v.contactPerson || <span className="mut">—</span>}</td>
                      <td>{ct.mobileNumber || v.mobile || <span className="mut">—</span>}</td>
                      <td className={`c${pc ? '' : ' mut'}`}>{pc}</td>
                      <td className="c" style={{ textTransform: 'capitalize', color: v.status === 'approved' ? '#067647' : '#B54708', fontWeight: 600 }}>{v.status || 'draft'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
