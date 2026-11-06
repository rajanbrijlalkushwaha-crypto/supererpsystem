/* Beta — Sales Bill form (create / edit) + the billing helpers the Sales lists share.
 *
 * A sales bill is made against one sales order. For every product of the order we show
 * Order Qty · Already billed · Pending, and the bill qty starts at the pending qty.
 * Uploading the tax-invoice PDF (POST /api/bills/parse-pdf, nothing stored) fills the bill no.,
 * date, IRN / Ack, e-way details, finds the order (buyer's order no. → client PO / order no.,
 * then GSTIN, then client name), sets the bill qty from the PDF lines whose rate matches,
 * and compares the PDF total with this bill. The PDF is attached to the bill on save.
 * Saved with the same fields as the classic Sales Bill page, so both screens read the same bills. */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { Svg } from '../../components/ui/Icon';
import { useAuth } from '../../context/AuthContext';

const TEAL = '#03444f';
const F = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
const HEAD = 'linear-gradient(90deg, #1B7682 0%, #3C9AA4 100%)';

export const n = v => parseFloat(v) || 0;
export const r2 = v => Math.round((Number(v) || 0) * 100) / 100;
const r3 = v => Math.round((Number(v) || 0) * 1000) / 1000;
const AMT_FMT = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const amt = v => AMT_FMT.format(Number(v) || 0);
const PLAIN = new Intl.NumberFormat('en-IN', { useGrouping: false, maximumFractionDigits: 3 });
export const num = v => PLAIN.format(Number(v) || 0);
const MONEY = new Intl.NumberFormat('en-IN', { useGrouping: false, maximumFractionDigits: 2 });
export const money = v => MONEY.format(r2(v));   // rupees in lists: plain, at most 2 decimals
const DATE_FMT = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: '2-digit' });
export const fdate = d => { if (!d) return '—'; const x = new Date(d); return isNaN(x) ? String(d) : DATE_FMT.format(x); };
export const dash = v => (v == null || String(v).trim() === '' ? '—' : v);
const low = s => String(s == null ? '' : s).toLowerCase().trim();
const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const nameKey = s => low(s).replace(/\bm\/?s\.?\s*/g, '').replace(/\b(pvt|private|ltd|limited|llp|co|company|the)\b\.?/g, '').replace(/[^a-z0-9]/g, '');
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
export const attachUrl = (companyId, b, a) => `/api/bills/${b.billId}/download/${encodeURIComponent(a.fileName)}?companyId=${companyId}&type=sales`;

/* ── billing helpers ── */
const itemNames = it => [it.description, it.itemName, it.material].map(low).filter(Boolean);
/* how the material of a bill moves (see BetaDispatch). Material counts as sent only on a delivery challan:
   with-bill creates a DC together with the bill. Older bills without materialMode went with the bill (legacy). */
export const MODES = {
  'with-bill': { short: 'With bill', long: 'Material goes now — also create the Delivery Challan', sub: 'A DC is made with this bill (e-way details copied from the bill)' },
  'after-dc': { short: 'DC first', long: 'Material already sent on DC — this bill is e-invoice only', sub: 'The DC(s) sent earlier are tied to this bill' },
  'before-dc': { short: 'Bill first', long: 'Material not sent yet — DC will be made later', sub: 'The quantity shows as "billed, not sent" until its DC is made' },
};
export const billMode = b => (MODES[b?.materialMode] ? b.materialMode : 'with-bill');
export const isLegacyBill = b => !MODES[b?.materialMode];
export const itemLabel = it => it.description || it.itemName || it.material || '—';
const isLine = it => it && (it.material || it.itemName || it.description || n(it.qty) || n(it.rate));

/* the order's charges (new `charges` list + the old packing / freight fields) */
const orderCharges = o => {
  const out = [];
  (o.charges || []).forEach(c => {
    if (!c) return;
    const pct = c.mode === 'pct' ? n(c.pct) : 0;   // saved in the order as "% of products' taxable"
    if (n(c.amount) > 0 || pct > 0) out.push({ label: c.chargeType || c.description || 'Additional Charge', amount: n(c.amount), gst: c.withoutGst ? 0 : n(c.gst), mode: pct > 0 ? 'pct' : 'amount', pct });
  });
  if (n(o.packingCharges) > 0) out.push({ label: 'Packing & Forwarding', amount: n(o.packingCharges), gst: 0, mode: 'amount', pct: 0 });
  if (n(o.freightCharges) > 0) out.push({ label: 'Freight / Transport', amount: n(o.freightCharges), gst: 0, mode: 'amount', pct: 0 });
  return out;
};

/* one charge row of the bill form: % of this bill's product taxable, or a typed amount */
let chargeSeq = 0;
const chargeRow = c => ({
  key: `ch${++chargeSeq}`, label: c.label, gst: n(c.gst), mode: c.mode === 'pct' ? 'pct' : 'amount', pct: c.mode === 'pct' ? String(c.pct) : '',
  amountNow: c.mode === 'pct' ? '' : c.pending > 0 ? String(c.pending) : '', ord: c,
});

/* which order product a bill line belongs to — saved index first (if it still fits), then item code / name */
export const lineOwner = (li, items) => {
  const code = li.itemCode ?? li.code, d = low(li.description);
  const codeHit = x => code != null && code !== '' && String(x.it.itemCode ?? x.it.code ?? '') === String(code);
  const nameHit = x => d && itemNames(x.it).includes(d);
  if (li.itemIdx != null && li.itemIdx !== '') {
    const x = items.find(y => y.idx === Number(li.itemIdx));
    if (x && (codeHit(x) || nameHit(x))) return x;
  }
  const y = items.find(x => codeHit(x) || nameHit(x));
  if (y) return y;
  if (li.itemIdx != null && li.itemIdx !== '') return items.find(x => x.idx === Number(li.itemIdx)) || null;
  return null;
};

/* One order + its bills → per-product billed / pending qty, charges billed, amounts and state.
   skipId leaves one bill out (the bill being edited). */
export function billingOf(o, orderBills = [], skipId = null) {
  const items = (o.items || []).map((it, idx) => ({ it, idx })).filter(x => isLine(x.it));
  const bills = orderBills.filter(b => b.billId !== skipId);
  const billedQty = {}, chBilled = {};
  bills.forEach(b => (b.items || []).forEach(li => {
    const x = lineOwner(li, items);
    if (x) billedQty[x.idx] = (billedQty[x.idx] || 0) + n(li.qty);
    else { const k = low(li.description); chBilled[k] = (chBilled[k] || 0) + n(li.taxable ?? li.rate); }
  }));
  const lines = items.map(({ it, idx }) => {
    const ordered = n(it.qty), billed = r3(billedQty[idx] || 0);
    return {
      idx, it, name: itemLabel(it), code: it.itemCode ?? it.code ?? '', hsn: String(it.hsnCode || it.hsn || '').trim(), unit: it.unit || it.uom || 'NOS',
      rate: n(it.rate), gstPct: n(it.gstPercent ?? it.gst ?? it.taxRate), ordered, billed, pending: Math.max(0, r3(ordered - billed)),
    };
  });
  const left = { ...chBilled };
  const charges = orderCharges(o).map(c => {
    const k = low(c.label), used = Math.min(left[k] || 0, c.amount);
    left[k] = (left[k] || 0) - used;
    return { ...c, billed: r2(used), pending: Math.max(0, r2(c.amount - used)) };
  });
  const computed = lines.reduce((s, l) => s + l.ordered * l.rate * (1 + l.gstPct / 100), 0) + charges.reduce((s, c) => s + c.amount * (1 + c.gst / 100), 0);
  const value = r2(n(o.grandTotal) > 0 ? n(o.grandTotal) : computed);
  const billedAmt = r2(bills.reduce((s, b) => s + n(b.grandTotal), 0));
  const orderQty = r3(lines.reduce((s, l) => s + l.ordered, 0));
  const doneQty = r3(lines.reduce((s, l) => s + l.billed, 0));
  const pendingQty = r3(lines.reduce((s, l) => s + l.pending, 0));
  const pendingCh = charges.filter(c => c.mode !== 'pct').reduce((s, c) => s + c.pending, 0);   // a % charge follows the products
  const full = lines.length ? pendingQty <= 0 && pendingCh <= 0.5 : value - billedAmt <= 1;
  return {
    o, lines, charges, bills, value, billedAmt, toBill: Math.max(0, r2(value - billedAmt)),
    orderQty, doneQty, pendingQty, state: full ? 'full' : bills.length ? 'part' : 'none',
  };
}

/* same state → CGST + SGST, else IGST. State names first, then the GSTIN state codes. */
export const isIntra = (company, o) => {
  const a = low(company?.state), b = low(o?.customerState || o?.shipToState);
  if (a && b) return a === b;
  const g1 = String(company?.gstin || '').slice(0, 2), g2 = String(o?.customerGstin || o?.partyGstin || '').slice(0, 2);
  return !!(g1 && g2 && g1 === g2);
};

/* next bill number from the latest bill's series, e.g. EPS/TI/26-27/155 → EPS/TI/26-27/156 (FY part follows today) */
const suggestBillNo = bills => {
  const d = new Date(), y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  const fy = `${String(y).slice(2)}-${String(y + 1).slice(2)}`;
  const latest = [...bills].filter(b => /\d+$/.test(b.billNo || '')).sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))[0];
  if (!latest) return '';
  const prefix = latest.billNo.replace(/\d+$/, '').replace(/\d{2}-\d{2}/, fy);
  const width = (latest.billNo.match(/(\d+)$/) || ['', '001'])[1].length;
  let max = 0;
  bills.forEach(b => { const s = String(b.billNo || ''); if (s.startsWith(prefix)) max = Math.max(max, parseInt(s.slice(prefix.length), 10) || 0); });
  return prefix + String(max + 1).padStart(width, '0');
};

const EWAY_KEYS = ['ewayBillNo', 'ewayGenDate', 'ewayValidUpto', 'vehicleNo', 'approxDistanceKm', 'ewayMode', 'supplyType', 'transactionType', 'transporterName', 'transporterId', 'dispatchFrom'];
const PDF_FIELDS = [['billNo', 'Bill No.'], ['billDate', 'Bill Date'], ['irnNo', 'IRN'], ['acknNo', 'Ack No.'], ['acknDate', 'Ack Date'], ['ewayBillNo', 'E-Way Bill'], ['ewayGenDate', 'E-Way date'],
  ['ewayValidUpto', 'Valid Upto'], ['ewayGeneratedBy', 'Generated By'], ['approxDistanceKm', 'Distance'], ['ewayMode', 'Mode'], ['supplyType', 'Supply Type'], ['transactionType', 'Transaction Type'],
  ['ewayFromName', 'From'], ['ewayToName', 'To'], ['dispatchFrom', 'Dispatch From'], ['ewayShipTo', 'Ship To'],
  ['transporterId', 'Transporter ID'], ['transporterName', 'Transporter'], ['vehicleNo', 'Vehicle'], ['vehicleFromCity', 'Vehicle From'], ['cewbNo', 'CEWB No.'], ['transDocNo', 'Transport Doc No.'], ['transDocDate', 'Transport Doc Date'], ['einvoiceQr', 'e-Invoice QR'], ['ewayQr', 'E-Way Bill QR'],
  ['ewayFromGstin'], ['ewayFromState'], ['ewayToGstin'], ['ewayToState']];   // no label → filled, not listed as a separate chip
const blankHead = () => ({ billNo: '', billDate: today(), irnNo: '', acknNo: '', acknDate: '', ewayBillNo: '', ewayGenDate: '', ewayValidUpto: '', ewayGeneratedBy: '', vehicleNo: '', approxDistanceKm: '',
  ewayMode: '1 - Road', supplyType: 'Outward-Supply', transactionType: '', transporterName: '', transporterId: '', vehicleFromCity: '', cewbNo: '', transDocNo: '', transDocDate: '', einvoiceQr: '', ewayQr: '',
  ewayFromName: '', ewayFromGstin: '', ewayFromState: '', dispatchFrom: '', ewayToName: '', ewayToGstin: '', ewayToState: '', ewayShipTo: '' });

export const SB_FORM_CSS = `
.sf { padding-bottom:4px; }
.sf-hero { display:flex; align-items:center; gap:10px; padding:8px 14px; background:${HEAD}; color:#fff; }
.sf-hero .ic { width:28px; height:28px; display:grid; place-items:center; background:rgba(255,255,255,.14); border:1px solid rgba(255,255,255,.22); border-radius:2px; }
.sf-hero h1 { margin:0; font-size:15px; } .sf-hero .grow { flex:1; }
.sf-chip { display:flex; align-items:center; gap:8px; padding:3px 10px; background:rgba(255,255,255,.12); border:1px solid rgba(255,255,255,.22); border-radius:2px; }
.sf-chip small { font-size:10.5px; text-transform:uppercase; letter-spacing:.6px; opacity:.75; } .sf-chip b { font-family:ui-monospace, Consolas, monospace; font-size:13.5px; }

/* PDF drop zone / result */
.sf-drop { display:flex; align-items:center; gap:12px; margin:10px; padding:12px 14px; border:1.5px dashed #9DBDC1; border-radius:6px; background:#fff; cursor:pointer; transition:background .1s, border-color .1s; }
.sf-drop:hover, .sf-drop.over { border-color:${TEAL}; background:#F0F7F7; }
.sf-drop .pic { width:38px; height:38px; flex-shrink:0; display:grid; place-items:center; border-radius:6px; background:#E1EFF0; color:${TEAL}; }
.sf-drop b { display:block; font-size:13px; color:${TEAL}; } .sf-drop span { font-size:11.5px; color:#667085; }
.sf-drop .go { margin-left:auto; height:30px; padding:0 14px; display:inline-flex; align-items:center; border:1px solid ${TEAL}; border-radius:4px; background:${TEAL}; color:#fff; font:600 12px ${F}; white-space:nowrap; }
.sf-pdf { margin:10px; background:#fff; border:1px solid #B7E1C1; border-left:3px solid #16A34A; border-radius:4px; }
.sf-pdf .top { display:flex; align-items:center; gap:10px; padding:8px 12px; }
.sf-pdf .top .fn { font-weight:700; font-size:12.5px; color:#101828; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:420px; }
.sf-pdf .top small { color:#667085; font-size:11.5px; } .sf-pdf .top .grow { flex:1; }
.sf-pdf .got { display:flex; flex-wrap:wrap; gap:4px; padding:0 12px 8px; }
.sf-pdf .got span { padding:2px 7px; border-radius:99px; background:#ECFDF3; color:#067647; font-size:11px; font-weight:600; }
.sf-pdf .cmp { display:flex; flex-wrap:wrap; align-items:center; gap:6px 16px; padding:7px 12px; border-top:1px solid #EDF2F3; font-size:12px; color:#475467; font-variant-numeric:tabular-nums; }
.sf-pdf .cmp b { color:#101828; } .sf-pdf .cmp .ok { color:#067647; font-weight:700; } .sf-pdf .cmp .bad { color:#B54708; font-weight:700; }
.sf-pdf.busy { border-color:#C9DCDE; border-left-color:${TEAL}; }
.sf-lnk { height:26px; padding:0 10px; border:1px solid #C9D7DA; border-radius:4px; background:#fff; color:#344054; cursor:pointer; font:600 11.5px ${F}; }
.sf-lnk:hover { border-color:${TEAL}; color:${TEAL}; }

.sf-2 { display:grid; grid-template-columns:1fr 1fr; margin:0 0 10px; }
.sf-2 > .sf-card { margin:0; } .sf-2 > .sf-card + .sf-card { border-left:1px solid #B9CED1; }
.sf-card { background:#fff; border-top:1px solid #B9CED1; border-bottom:1px solid #B9CED1; margin-bottom:10px; }
.sf-ch { display:flex; align-items:center; gap:9px; padding:6px 10px; background:${HEAD}; color:#fff; }
.sf-ch .ico { width:22px; height:22px; display:grid; place-items:center; background:rgba(255,255,255,.16); border-radius:2px; }
.sf-ch b { font-size:13px; } .sf-ch small { font-size:11.5px; opacity:.85; } .sf-ch .grow { flex:1; }
.sf-kv { width:100%; border-collapse:collapse; table-layout:fixed; font-size:12.5px; }
.sf-kv th { width:132px; padding:7px 10px; background:#F4F8F8; border:1px solid #DCE6E8; text-align:left; font-weight:600; color:#344054; vertical-align:middle; }
.sf-kv th i { color:#D92D20; font-style:normal; }
.sf-kv td { padding:5px 8px; border:1px solid #DCE6E8; color:#101828; vertical-align:middle; }
.sf-kv tr:first-child > * { border-top:none; } .sf-kv tr > :first-child { border-left:none; } .sf-kv tr > :last-child { border-right:none; } .sf-kv tr:last-child > * { border-bottom:none; }
.sf-kv td.r { text-align:right; font-variant-numeric:tabular-nums; white-space:nowrap; }
.sf-kv .mono { font-family:ui-monospace, Consolas, monospace; font-size:12px; }
.sf input, .sf select, .sf textarea { height:30px; padding:0 9px; border:1px solid #C9D7DA; border-radius:2px; background:#fff; outline:none; font:400 12.5px ${F}; color:#101828; width:100%; box-sizing:border-box; }
.sf input:focus, .sf select:focus { border-color:${TEAL}; box-shadow:0 0 0 3px rgba(3,68,79,.12); }
.sf input.fx { background:#F0FBF4; border-color:#9BD8AE; }
.sf input:disabled { background:#F2F4F5; color:#98A2B3; }
.sf .bad { border-color:#D92D20 !important; background:#FFFBFA !important; }
.sf-err { display:block; font-size:10.5px; color:#D92D20; margin-top:2px; }
.sf-srch { display:flex; } .sf-srch input { cursor:pointer; }
.sf-sbtn { width:34px; height:30px; flex-shrink:0; border:1px solid ${TEAL}; border-radius:0 2px 2px 0; background:${TEAL}; color:#fff; cursor:pointer; display:grid; place-items:center; }
.sf-sbtn:disabled { opacity:.5; cursor:default; }
.sf-tag { display:inline-block; padding:1px 7px; border-radius:99px; font-size:11px; font-weight:700; }
.sf-tag.intra { background:#E1EFF0; color:${TEAL}; } .sf-tag.inter { background:#F4F0FF; color:#5925DC; }
.sf-eg { display:grid; grid-template-columns:repeat(4, 1fr); gap:8px 10px; padding:10px; }
.sf-eg label { display:block; font-size:11px; font-weight:600; color:#475467; } .sf-eg label span { display:block; margin-bottom:3px; }
.sf-eg .w2 { grid-column:span 2; }
.sf-eg input.mono, .sf-addr input.mono { font-family:ui-monospace, Consolas, monospace; font-size:12px; }
.sf textarea { height:auto; min-height:62px; padding:6px 9px; resize:vertical; line-height:1.45; }
.sf textarea.fx { background:#F0FBF4; border-color:#9BD8AE; }
.sf-mm { display:flex; flex-direction:column; gap:5px; }
.sf-mm label { display:flex; align-items:flex-start; gap:8px; padding:6px 9px; border:1px solid #C9D7DA; border-radius:4px; cursor:pointer; background:#fff; }
.sf-mm label.on { border-color:${TEAL}; background:#F0F7F7; }
.sf .sf-mm input { width:auto; height:auto; margin-top:2px; flex-shrink:0; accent-color:${TEAL}; box-shadow:none; }
.sf-mm b { display:block; font-size:12px; color:#101828; } .sf-mm small { display:block; font-size:11px; color:#667085; }
.sf-ewd { display:flex; align-items:flex-start; } .sf-ewd .sf-eg { flex:1; }
.sf-qrbox { width:130px; flex-shrink:0; margin:10px 10px 10px 0; padding:6px; border:1px solid #DCE6E8; border-radius:4px; background:#fff; text-align:center; }
.sf-qrbox > span { display:block; font-size:11px; font-weight:600; color:#475467; margin-bottom:4px; }
.sf-qrimg { width:96px; height:96px; image-rendering:pixelated; display:block; margin:0 auto; border:1px solid #EDF2F3; }
.sf-qrnone { font-size:11px; color:#98A2B3; }
.sf-es { padding:7px 10px 0; font-size:11.5px; font-weight:700; color:${TEAL}; letter-spacing:.2px; border-top:1px solid #EDF2F3; }
.sf-es:first-of-type { border-top:0; }
.sf-addr { display:grid; grid-template-columns:1fr 1fr; gap:10px; padding:8px 10px 10px; }
.sf-addr .box { border:1px solid #DCE6E8; border-radius:4px; padding:8px 10px 10px; background:#FBFDFD; }
.sf-addr h4 { margin:0 0 6px; font-size:12.5px; color:#101828; }
.sf-addr label { display:block; font-size:11px; font-weight:600; color:#475467; } .sf-addr label span { display:block; margin-bottom:3px; }
.sf-addr .g3 { display:grid; grid-template-columns:2fr 1.3fr 1fr; gap:8px; }

.sf-t { width:100%; border-collapse:collapse; font-size:12.5px; }
.sf-t th { background:#D4EBEE; color:#000; font-weight:700; font-size:11.5px; text-align:left; padding:7px 8px; border-bottom:1px solid #A9CDD2; white-space:nowrap; }
.sf-t td { padding:6px 8px; border-bottom:1px solid #EDF2F3; color:#101828; vertical-align:middle; }
.sf-t .r { text-align:right; font-variant-numeric:tabular-nums; white-space:nowrap; } .sf-t th.r { text-align:right; } .sf-t .c { text-align:center; }
.sf-t .mut { color:#98A2B3; } .sf-t .pend { color:#B54708; font-weight:700; } .sf-t .done { color:#067647; font-weight:600; }
.sf-t tr.off td { background:#FAFBFB; color:#98A2B3; }
.sf-t tr.chg td { background:#FAFCFC; color:#475467; }
.sf-t tr.sub td { background:#F4F8F8; font-size:11px; font-weight:700; color:#667085; text-transform:uppercase; letter-spacing:.4px; padding:5px 8px; }
.sf-t tfoot td { background:#E3EEEF; font-weight:700; border-top:1px solid #C9DCDE; }
.sf-t tfoot tr.gt td { background:#D4EBEE; color:${TEAL}; font-size:14px; }
.sf-q { width:96px !important; text-align:right; }
.sf-q.fx { background:#F0FBF4; border-color:#9BD8AE; }
.sf-max { margin-left:5px; height:22px; padding:0 6px; border:1px solid #C9D7DA; border-radius:3px; background:#fff; color:${TEAL}; cursor:pointer; font:600 10.5px ${F}; }
.sf-max:hover { border-color:${TEAL}; }
/* products: "in the order" vs "in this bill" column groups */
.sf-pt, .sf-ct { table-layout:fixed; }
.sf-pt tr.grp th { background:#EAF4F5; color:#475467; font-size:10.5px; text-transform:uppercase; letter-spacing:.6px; padding:4px 8px; border-bottom:1px solid #C9DCDE; }
.sf-pt tr.grp th.now { background:#03444f; color:#fff; }
.sf-pt th.now { background:#C3E1E5; }
.sf-pt td.now { background:#F5FAFA; }
.sf-pt .first { border-left:2px solid #7FB3BA; }
.sf-pt tr.off td.now { background:#F7F9F9; }
.sf-pt .pn { font-weight:600; color:#101828; } .sf-pt .ps { font-size:11px; color:#98A2B3; margin-top:1px; }
.sf-pt tfoot td.now { background:#D4EBEE; }
.sf-pt .sf-q { width:100% !important; }
/* additional charges */
.sf-ct .cl { color:#101828; } .sf-ct .ps2 { font-size:11.5px; color:#667085; }
.sf-cm { display:flex; gap:6px; align-items:center; }
.sf-seg { display:flex; height:30px; border:1px solid #C9D7DA; border-radius:3px; overflow:hidden; flex-shrink:0; }
.sf-seg button { width:32px; border:0; background:#fff; cursor:pointer; font:700 12px ${F}; color:#475467; }
.sf-seg button + button { border-left:1px solid #C9D7DA; } .sf-seg button.on { background:${TEAL}; color:#fff; }
.sf-unit { display:flex; flex:1; min-width:0; } .sf-unit input { text-align:right; border-radius:2px 0 0 2px; min-width:0; }
.sf-unit span { width:28px; flex-shrink:0; display:grid; place-items:center; border:1px solid #C9D7DA; border-left:0; background:#F4F8F8; font-weight:600; font-size:12px; color:#475467; }
.sf-unit.pre span { border-left:1px solid #C9D7DA; border-right:0; } .sf-unit.pre input { border-radius:0 2px 2px 0; }
.sf-x { width:26px; height:26px; border:1px solid #F5C2C0; border-radius:4px; background:#fff; color:#B42318; cursor:pointer; font-size:16px; line-height:1; }
.sf-x:hover { background:#B42318; border-color:#B42318; color:#fff; }
.sf-rm { display:flex; flex-wrap:wrap; align-items:center; gap:6px; padding:8px 10px; border-top:1px solid #EDF2F3; font-size:12px; color:#667085; }
.sf-rm button { height:26px; padding:0 10px; border:1px dashed #9DBDC1; border-radius:4px; background:#fff; color:#344054; cursor:pointer; font:500 12px ${F}; }
.sf-rm button b { color:${TEAL}; margin-left:4px; } .sf-rm button:hover { border-style:solid; border-color:${TEAL}; }
/* summary */
.sf-sumw { display:flex; justify-content:flex-end; margin-bottom:10px; }
.sf-sum { width:420px; margin:0; border:1px solid #B9CED1; font-variant-numeric:tabular-nums; }
.sf-sum .row { display:flex; justify-content:space-between; padding:6px 14px; font-size:12.5px; color:#475467; border-bottom:1px solid #EDF2F3; }
.sf-sum .row b { color:#101828; } .sf-sum .row.tx { background:#F4F8F8; font-weight:600; }
.sf-sum .row.gt { background:#D4EBEE; border-bottom:0; padding:9px 14px; font-size:15px; color:${TEAL}; font-weight:700; } .sf-sum .row.gt b { color:${TEAL}; }
.sf-empty { padding:16px; text-align:center; color:#98A2B3; font-size:12.5px; }
.sf-no { font-weight:600; color:${TEAL}; font-family:ui-monospace, Consolas, monospace; font-size:12px; }
.sf-msg { margin:10px; padding:9px 12px; font-size:12.5px; font-weight:500; }
.sf-msg.ok { background:#E6F4EA; color:#1E7B34; border:1px solid #B7E1C1; } .sf-msg.err { background:#FDECEC; color:#B42318; border:1px solid #F5C2C0; }
.sf-msg.warn { background:#FFFAEB; color:#93370D; border:1px solid #FEDF89; }
.sf-bar { position:sticky; bottom:0; z-index:3; display:flex; align-items:center; gap:8px; padding:10px 16px; background:rgba(255,255,255,.97); border-top:1px solid #D7E3E5; box-shadow:0 -4px 14px rgba(16,24,40,.06); }
.sf-bar .info { flex:1; font-size:12.5px; color:#667085; font-variant-numeric:tabular-nums; } .sf-bar .info b { color:${TEAL}; font-size:14px; }
.sf-b { height:36px; padding:0 18px; border-radius:2px; cursor:pointer; font:600 13px ${F}; border:1px solid transparent; }
.sf-b.ghost { background:#fff; border-color:#C9D7DA; color:#344054; } .sf-b.pri { background:${TEAL}; color:#fff; } .sf-b:disabled { opacity:.55; cursor:default; }

.sf-pkb { position:fixed; inset:0; z-index:1600; background:rgba(2,24,28,.45); display:flex; align-items:flex-start; justify-content:center; padding:8vh 16px; font-family:${F}; }
.sf-pk { width:100%; max-width:1100px; max-height:78vh; display:flex; flex-direction:column; background:#fff; border:1px solid #9DBDC1; box-shadow:0 20px 60px rgba(0,0,0,.35); }
.sf-pkh { display:flex; align-items:center; gap:10px; padding:9px 12px; background:${HEAD}; color:#fff; } .sf-pkh .grow { flex:1; }
.sf-pkh button { width:26px; height:26px; border:1px solid rgba(255,255,255,.35); background:rgba(255,255,255,.1); color:#fff; cursor:pointer; font-size:16px; }
.sf-pks { display:flex; align-items:center; gap:10px; padding:9px 12px; border-bottom:1px solid #DCE6E8; } .sf-pks input[type=text] { height:32px; flex:1; }
.sf-pks label { display:flex; align-items:center; gap:6px; font-size:12px; color:#475467; white-space:nowrap; cursor:pointer; } .sf-pks label input { width:14px; height:14px; accent-color:${TEAL}; }
.sf-pkl { overflow-y:auto; } .sf-pkl td { cursor:pointer; } .sf-pkl tr.sel td { background:#E1EFF0 !important; }
.sf-pkl th { position:sticky; top:0; }
@media (max-width: 1100px) { .sf-2 { grid-template-columns:1fr; } .sf-2 > .sf-card + .sf-card { border-left:none; } .sf-eg { grid-template-columns:repeat(2, 1fr); } }
`;

/* editBill set → the same form edits that bill (order stays fixed). presetOrderId → order picked on open. */
export default function SalesBillForm({ companyId, company, rows, billsByOrder, allBills, dcsByOrder = {}, presetOrderId, editBill, onSaved, onCancel }) {
  const { user: me } = useAuth() || {};
  const [mm, setMm] = useState(editBill ? billMode(editBill) : null);   // how the material moves; null = pick automatically
  const [orderId, setOrderId] = useState(editBill ? String(editBill.orderId) : presetOrderId ? String(presetOrderId) : '');
  const [order, setOrder] = useState(null);
  const [head, setHead] = useState(() => {
    if (!editBill) return { ...blankHead(), billNo: suggestBillNo(allBills) };
    const h = blankHead();
    Object.keys(h).forEach(k => { if (editBill[k] != null && editBill[k] !== '') h[k] = editBill[k]; });
    return h;
  });
  const [qty, setQty] = useState({});          // order item idx → bill qty (string)
  const [chg, setChg] = useState([]);          // charge rows in this bill (see chargeRow)
  const [removed, setRemoved] = useState([]);  // order charges taken out of this bill (can be added back)
  const [picker, setPicker] = useState(null);  // null | { q }
  const [pdf, setPdf] = useState(null);        // { file, busy, data, got:[], via, err }
  const [filled, setFilled] = useState({});    // field → true when it came from the PDF
  const [qtyFromPdf, setQtyFromPdf] = useState({});
  const [over, setOver] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);
  const [tried, setTried] = useState(false);
  const fileRef = useRef(null);
  const pendingPdfQty = useRef(null);          // PDF lines waiting for the order to load

  /* load the chosen order fresh (list copy as fallback) */
  useEffect(() => {
    if (!orderId) { setOrder(null); return; }
    let live = true;
    const fallback = rows.find(r => String(r.o.orderId) === orderId)?.o || null;
    axios.get(`/api/sales-orders/${orderId}`, { params: { companyId } })
      .then(r => { if (live) setOrder(r.data && r.data.orderId != null ? r.data : fallback); })
      .catch(() => { if (live) setOrder(fallback); });
    return () => { live = false; };
  }, [orderId, companyId]);   // eslint-disable-line react-hooks/exhaustive-deps

  const bl = useMemo(() => (order ? billingOf(order, billsByOrder[String(order.orderId)] || [], editBill?.billId) : null), [order, billsByOrder, editBill]);
  const intra = order ? isIntra(company, order) : false;

  /* starting quantities / charges whenever the order (or its billing) is ready */
  const initFor = useRef(null);
  useEffect(() => {
    if (!bl || initFor.current === String(bl.o.orderId)) return;
    initFor.current = String(bl.o.orderId);
    const q = {};
    if (editBill) {
      const items = bl.lines.map(l => ({ it: l.it, idx: l.idx }));
      const extra = [];
      (editBill.items || []).forEach(li => {
        const x = lineOwner(li, items);
        if (x) q[x.idx] = String(r3(n(q[x.idx]) + n(li.qty)));
        else extra.push(li);
      });
      // saved charge lines → rows; a % charge of the order stays % when the saved amount still equals it
      const prodTaxable = (editBill.items || []).filter(li => !extra.includes(li)).reduce((s, li) => s + n(li.taxable), 0);
      const rowsNow = [], gone = [];
      bl.charges.forEach(c => {
        const li = extra.find(e => low(e.description) === low(c.label));
        if (!li) { gone.push(chargeRow(c)); return; }
        const a = n(li.taxable ?? li.rate);
        const asPct = c.mode === 'pct' && Math.abs(r2(prodTaxable * c.pct / 100) - a) < 1;
        rowsNow.push({ ...chargeRow(c), mode: asPct ? 'pct' : 'amount', amountNow: asPct ? '' : String(a), gst: n(li.gstPct ?? c.gst) });
      });
      extra.filter(e => !bl.charges.some(c => low(c.label) === low(e.description)))
        .forEach(e => rowsNow.push({ ...chargeRow({ label: e.description || 'Additional Charge', gst: n(e.gstPct), amount: 0, mode: 'amount', pct: 0, billed: 0, pending: 0 }), amountNow: String(n(e.taxable ?? e.rate)) }));
      setChg(rowsNow); setRemoved(gone);
    } else {
      bl.lines.forEach(l => { q[l.idx] = l.pending > 0 ? String(l.pending) : ''; });
      // % charges start as % of this bill's product taxable; amount charges start at what is still unbilled
      const rowsNow = [], gone = [];
      bl.charges.forEach(c => (c.mode !== 'pct' && c.pending <= 0 ? gone : rowsNow).push(chargeRow(c)));
      setChg(rowsNow); setRemoved(gone);
    }
    setQty(q);
    setQtyFromPdf({});
    if (pendingPdfQty.current) { applyPdfQty(pendingPdfQty.current, bl); pendingPdfQty.current = null; }
  }, [bl, editBill]);   // eslint-disable-line react-hooks/exhaustive-deps

  /* PDF product lines → bill qty for order products with the same rate (other products set to 0) */
  const applyPdfQty = (items, b) => {
    if (!items?.length || !b) return;
    const used = new Set(), q = {}, from = {};
    items.forEach(pi => {
      const word = low(pi.description).split(/\s+/)[0];
      const same = b.lines.filter(l => !used.has(l.idx) && Math.abs(l.rate - pi.rate) < 0.5);
      const hit = same.find(l => word && low(l.name).startsWith(word)) || same[0];
      if (hit) { used.add(hit.idx); q[hit.idx] = String(r3(n(q[hit.idx]) + pi.qty)); from[hit.idx] = true; }
    });
    if (!used.size) return;
    const all = {};
    b.lines.forEach(l => { all[l.idx] = q[l.idx] || ''; });
    setQty(all); setQtyFromPdf(from);
  };

  /* totals of this bill */
  const calc = useMemo(() => {
    if (!bl) return { lines: [], sub: 0, cgst: 0, sgst: 0, igst: 0, gst: 0, total: 0, errs: {} };
    const errs = {}, lines = [];
    bl.lines.forEach(l => {
      const q = n(qty[l.idx]);
      if (q < 0) errs[l.idx] = 'Not below 0';
      else if (q > l.pending + 1e-9) errs[l.idx] = `Only ${num(l.pending)} pending`;
      if (q <= 0) return;
      const taxable = r2(q * l.rate), g = r2(taxable * l.gstPct / 100);
      lines.push({ itemCode: l.code, itemIdx: l.idx, description: l.name, hsnCode: l.hsn, unit: l.unit, qty: q, rate: l.rate, taxable, gstPct: l.gstPct, gstAmt: g,
        cgst: intra ? r2(g / 2) : 0, sgst: intra ? r2(g - r2(g / 2)) : 0, igst: intra ? 0 : g, total: r2(taxable + g) });
    });
    const prodSub = r2(lines.reduce((t, l) => t + l.taxable, 0));
    const prodGst = r2(lines.reduce((t, l) => t + l.gstAmt, 0));
    const chAmt = {};
    chg.forEach(c => {
      const a = c.mode === 'pct' ? r2(prodSub * n(c.pct) / 100) : r2(n(c.amountNow));
      chAmt[c.key] = a;
      if (a <= 0) return;
      const g = r2(a * n(c.gst) / 100);
      lines.push({ description: c.label, hsnCode: '', unit: 'LOT', qty: 1, rate: a, taxable: a, gstPct: n(c.gst), gstAmt: g,
        cgst: intra ? r2(g / 2) : 0, sgst: intra ? r2(g - r2(g / 2)) : 0, igst: intra ? 0 : g, total: r2(a + g), ...(c.mode === 'pct' ? { chargePct: n(c.pct) } : {}) });
    });
    const s = k => r2(lines.reduce((t, l) => t + l[k], 0));
    const sub = s('taxable'), cgst = s('cgst'), sgst = s('sgst'), igst = s('igst');
    return { lines, prodSub, prodGst, chSub: r2(sub - prodSub), chAmt, sub, cgst, sgst, igst, gst: r2(cgst + sgst + igst), total: r2(sub + cgst + sgst + igst), errs };
  }, [bl, qty, chg, intra]);

  /* automatic pick: e-way on this bill → goes with the bill; DCs already sent and not billed → DC first */
  const orderDcs = order ? (dcsByOrder[String(order.orderId)] || []) : [];
  const openDcs = orderDcs.filter(d => d.dcType === 'before-bill' && !d.linkedInvoiceNo && !d.linkedInvoiceId);
  const ownDc = editBill ? orderDcs.find(d => String(d.linkedBillId || '') === editBill.billId) : null;   // DC already made from this bill
  /* the DCs this bill really covers: every product on the DC is on this bill, within the billed qty (oldest DC first).
     A DC of another product of the same order (e.g. Cabin 6x4 when the bill is for Cabin 12x10) is not tied. */
  const tieDcs = useMemo(() => {
    const prods = (calc.lines || []).filter(li => li.itemIdx != null && n(li.qty) > 0);
    const left = {};
    prods.forEach(li => { left[li.itemIdx] = (left[li.itemIdx] || 0) + n(li.qty); });
    const nm = v => String(v || '').trim().toLowerCase().replace(/\s+/g, ' ');
    const idxOf = it => (it.itemIdx != null && left[it.itemIdx] != null ? it.itemIdx : (prods.find(li => nm(li.description) === nm(it.description)) || {}).itemIdx);
    return [...openDcs].sort((a, b) => String(a.dcDate || '').localeCompare(String(b.dcDate || '')) || String(a.dcId).localeCompare(String(b.dcId))).filter(d => {
      const ls = (d.items || []).filter(it => n(it.qty) > 0);
      if (!ls.length || !ls.every(it => idxOf(it) != null && left[idxOf(it)] >= n(it.qty) - 1e-9)) return false;
      ls.forEach(it => { left[idxOf(it)] -= n(it.qty); });
      return true;
    });
  }, [calc, openDcs]);
  const autoMode = head.ewayBillNo.trim() ? 'with-bill' : openDcs.length ? 'after-dc' : 'with-bill';
  const mode = mm || autoMode;
  const dupe = head.billNo.trim() && allBills.find(b => low(b.billNo) === low(head.billNo) && b.billId !== editBill?.billId);
  const set = k => e => { const v = e.target.value; setHead(h => ({ ...h, [k]: v })); setFilled(f => (f[k] ? { ...f, [k]: false } : f)); };

  /* ── PDF upload → parse → fill ── */
  const readPdf = async file => {
    if (!file) return;
    if (!/\.pdf$/i.test(file.name)) { setPdf({ file: null, err: 'Please choose a PDF file.' }); return; }
    setPdf({ file, busy: true }); setMsg(null);
    try {
      const fd = new FormData(); fd.append('file', file);
      const { data: d } = await axios.post('/api/bills/parse-pdf', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      const got = [], f = {}, h = {};
      PDF_FIELDS.forEach(([k, label]) => { if (d[k]) { h[k] = String(d[k]); f[k] = true; if (label) got.push(label); } });
      setHead(x => ({ ...x, ...h })); setFilled(f);
      /* find the order */
      let via = '', cands = [];
      if (!editBill && !orderId) {
        const po = norm(d.buyerOrderNo);
        if (po) { cands = rows.filter(r => norm(r.o.customerPO) === po || norm(r.o.orderNo) === po); via = `client PO ${d.buyerOrderNo}`; }
        if (cands.length > 1) { const open = cands.filter(r => r.state !== 'full'); if (open.length) cands = open; }
        if (!cands.length && d.buyerGstin) { cands = rows.filter(r => r.state !== 'full' && String(r.o.customerGstin || r.o.partyGstin || '').toUpperCase() === d.buyerGstin); via = `GSTIN ${d.buyerGstin}`; }
        if (!cands.length && d.partyName) { const k = nameKey(d.partyName); cands = k ? rows.filter(r => r.state !== 'full' && nameKey(r.o.customerName || r.o.party) === k) : []; via = 'client name'; }
        if (cands.length === 1) {
          const o = cands[0].o; got.push('Order');
          pendingPdfQty.current = d.pdfItems || null;
          initFor.current = null;
          setOrderId(String(o.orderId));
        } else if (cands.length > 1) {
          pendingPdfQty.current = d.pdfItems || null;
          setPicker({ q: d.buyerGstin || d.partyName || '', note: `${cands.length} open orders match this PDF (${via}) — pick the right one.` });
          via = '';
        } else via = '';
      } else if (bl) applyPdfQty(d.pdfItems, bl);
      setPdf({ file, data: d, got, via: cands.length === 1 ? via : '' });
    } catch (e) {
      setPdf({ file, err: e.response?.data?.error || 'Could not read this PDF. Fill the details by hand — the PDF will still be attached.' });
    }
  };
  const onDrop = e => { e.preventDefault(); setOver(false); readPdf(e.dataTransfer.files?.[0]); };

  const pick = r => {
    setPicker(null);
    if (String(r.o.orderId) === orderId) return;
    initFor.current = null;
    setOrderId(String(r.o.orderId)); setMsg(null);
  };

  /* PDF ↔ order checks */
  const warn = [];
  if (pdf?.data && order) {
    const d = pdf.data;
    const g1 = String(order.customerGstin || order.partyGstin || '').toUpperCase();
    if (d.buyerGstin && g1 && d.buyerGstin !== g1) warn.push(`PDF buyer GSTIN ${d.buyerGstin} differs from the order's ${g1}.`);
    else if (!d.buyerGstin && d.partyName && nameKey(d.partyName) !== nameKey(order.customerName || order.party)) warn.push(`PDF buyer “${d.partyName}” differs from the order's client “${order.customerName || order.party}”.`);
    if (d.pdfGst > 0 && ((d.pdfIgst > 0 && intra) || ((d.pdfCgst > 0 || d.pdfSgst > 0) && !intra))) warn.push(`PDF has ${d.pdfIgst > 0 ? 'IGST' : 'CGST + SGST'}, this bill works out ${intra ? 'CGST + SGST' : 'IGST'}.`);
  }
  const pdfDiff = pdf?.data?.pdfTotal ? r2(calc.total - pdf.data.pdfTotal) : null;

  const reset = () => {
    initFor.current = null;
    setOrderId(''); setOrder(null); setQty({}); setChg([]); setRemoved([]); setPdf(null); setFilled({}); setQtyFromPdf({}); setTried(false);
    setHead({ ...blankHead(), billNo: suggestBillNo(allBills) });
  };

  const save = async () => {
    setTried(true); setMsg(null);
    if (!order) return setMsg({ k: 'err', t: 'Pick the sales order first.' });
    if (!head.billNo.trim()) return setMsg({ k: 'err', t: 'Enter the bill number.' });
    if (dupe) return setMsg({ k: 'err', t: `Bill no. ${head.billNo} is already used (${dupe.billId}).` });
    if (!head.billDate) return setMsg({ k: 'err', t: 'Enter the bill date.' });
    if (Object.keys(calc.errs).length) return setMsg({ k: 'err', t: 'Some bill quantities are more than what is pending — see the red boxes.' });
    if (!calc.lines.length) return setMsg({ k: 'err', t: 'Enter a bill quantity for at least one product (or a charge amount).' });
    setSaving(true);
    try {
      const o = order;
      const payload = {
        type: 'sales', materialMode: mode, ...Object.fromEntries(Object.entries(head).map(([k, v]) => [k, typeof v === 'string' ? v.trim() : v])),
        orderId: String(o.orderId), orderNo: o.orderNo || `SO-${o.orderId}`,
        partyName: o.customerName || o.clientName || o.party || '—', partyGstin: o.customerGstin || o.partyGstin || '',
        partyState: o.customerState || o.shipToState || '', companyState: company?.state || '', gstType: intra ? 'intrastate' : 'interstate',
        items: calc.lines, subTotal: calc.sub, totalCGST: calc.cgst, totalSGST: calc.sgst, totalIGST: calc.igst, totalGST: calc.gst, grandTotal: calc.total,
        companyId,
        billToName: o.customerName || o.contactPerson || '', billToAddress: o.address || o.customerAddress || '',
        billToCity: o.customerCity || '', billToState: o.customerState || '', billToPincode: o.customerPincode || '',
        shipToName: o.shipToName || o.customerName || '', shipToAddress: o.shipToAddress || o.deliveryAddr || '',
        shipToCity: o.shipToCity || '', shipToState: o.shipToState || o.customerState || '', shipToPincode: o.shipToPincode || '',
      };
      const r = editBill
        ? await axios.put(`/api/bills/${editBill.billId}`, payload, { params: { companyId, type: 'sales' } })
        : await axios.post('/api/bills', payload, { params: { companyId } });
      let saved = r.data || {};
      const billId = editBill?.billId || saved.billId;
      let attachNote = '';
      // material went earlier on DC(s): tie those DCs to this bill
      if (mode === 'after-dc' && billId) {
        for (const d of tieDcs) {
          try { await axios.put(`/api/delivery-challans/${d.dcId}/link-invoice`, { companyId, invoiceId: billId, invoiceNo: payload.billNo }); } catch { /* the DC list will show it as bill pending */ }
        }
      }
      let dcNote = '';
      if (mode === 'with-bill' && billId && !ownDc) {
        try {
          const o = order, its = calc.lines.filter(li => li.itemIdx != null);
          // add-on items go too once this bill covers every product still pending
          const lastLot = bl && bl.lines.every(l => l.pending - n(qty[l.idx]) <= 1e-9);
          const sentA = {};
          orderDcs.forEach(d => (d.addons || []).forEach(a => { if (a.addonIdx != null) sentA[a.addonIdx] = (sentA[a.addonIdx] || 0) + n(a.qty); }));
          const addons = lastLot ? (Array.isArray(o.addons) ? o.addons : []).map((a, i) => ({ a, i, left: Math.max(0, (n(a.qty) || 1) - (sentA[i] || 0)) }))
            .filter(x => x.a && x.a.description && x.left > 0)
            .map(x => ({ addonIdx: x.i, description: x.a.description, category: x.a.category || '', remarks: x.a.remarks || '', unit: x.a.unit || 'NOS', qty: x.left })) : [];
          const dcR = await axios.post('/api/delivery-challans', {
            companyId, dcDate: payload.billDate, dcType: 'with-bill', linkedBillId: billId, invoiceNo: payload.billNo, invoiceDate: payload.billDate,
            createdBy: { id: me?.id, name: me?.name || me?.username || '', username: me?.username || '' },
            linkedSalesOrderId: o.orderId, orderNo: o.orderNo || '', orderDate: o.orderDate || '', clientOrderNo: o.customerPO || '', clientPoDate: o.poDate || '',
            customerName: o.customerName || o.party || '', customerGstin: o.customerGstin || o.partyGstin || '',
            billingName: o.contactPerson || '', billingMobile: o.mobile || '', billingEmail: o.email || '',
            billingAddress: o.address || '', billingCity: o.customerCity || '', billingState: o.customerState || '', billingPincode: o.customerPincode || '',
            shippingName: payload.ewayToName || o.shipToName || o.customerName || '', shippingMobile: o.shipToMobile || o.mobile || '',
            shippingAddress: payload.ewayShipTo || o.shipToAddress || o.deliveryAddr || o.address || '', shippingCity: o.shipToCity || o.customerCity || '',
            shippingState: o.shipToState || o.customerState || '', shippingPincode: o.shipToPincode || o.customerPincode || '',
            ewayBillNo: payload.ewayBillNo, ewayGenDate: payload.ewayGenDate, ewayValidUpto: payload.ewayValidUpto, vehicleNo: payload.vehicleNo,
            transporterName: payload.transporterName, transporterId: payload.transporterId, transDocNo: payload.transDocNo, transDocDate: payload.transDocDate,
            approxDistanceKm: payload.approxDistanceKm, dispatchFrom: payload.dispatchFrom, remarks: '',
            items: its.map(li => ({ itemIdx: li.itemIdx, itemCode: li.itemCode, description: li.description, hsnCode: li.hsnCode, unit: li.unit, qty: li.qty, rate: li.rate, gst: li.gstPct })),
            addons, totalValue: r2(its.reduce((s, li) => s + li.taxable, 0)),
          });
          dcNote = ` Delivery Challan ${dcR.data?.dcNo || ''} created with it.`;
        } catch { dcNote = ' The Delivery Challan could not be created — make it from the Delivery Challan page.'; }
      }
      if (pdf?.file && billId) {
        try {
          const fd = new FormData(); fd.append('file', pdf.file);
          const u = await axios.post(`/api/bills/${billId}/upload`, fd, { params: { companyId, type: 'sales' }, headers: { 'Content-Type': 'multipart/form-data' } });
          if (u.data?.billId) saved = u.data;
        } catch { attachNote = ' The PDF could not be attached — attach it again from the bill list.'; }
      }
      const text = `${editBill ? 'Updated' : 'Saved'} bill ${payload.billNo} (${billId}) for order ${payload.orderNo} — ₹ ${amt(calc.total)}.${dcNote}${attachNote}`;
      if (!editBill) reset();
      onSaved?.(saved, text);
      if (!editBill) setMsg({ k: 'ok', t: text });
    } catch (e) {
      setMsg({ k: 'err', t: e.response?.data?.error || 'Could not save the bill.' });
    } finally { setSaving(false); }
  };

  const left = bl ? Math.max(0, r2(bl.value - bl.billedAmt - calc.total)) : 0;
  const cls = k => (filled[k] ? 'fx' : '');
  const FIELD = (k, label, extra = {}) => (
    <label className={extra.w2 ? 'w2' : ''}><span>{label}</span>
      {extra.area ? <textarea rows={3} value={head[k]} onChange={set(k)} className={cls(k)} placeholder={extra.ph || ''} />
        : <input value={head[k]} onChange={set(k)} className={`${cls(k)}${extra.mono ? ' mono' : ''}`} placeholder={extra.ph || ''} />}
    </label>
  );

  return (
    <div className="sf">
      <div className="sf-hero">
        <span className="ic"><Svg name="file" size={15} /></span>
        <h1>{editBill ? `Edit Sales Bill ${editBill.billNo || editBill.billId}` : 'Create Sales Bill'}</h1>
        <span className="grow" />
        {order && <span className="sf-chip"><small>Order</small><b>{order.orderNo || order.orderId}</b></span>}
        <span className="sf-chip"><small>This bill</small><b>₹ {amt(calc.total)}</b></span>
      </div>

      <input ref={fileRef} type="file" accept="application/pdf,.pdf" hidden onChange={e => { readPdf(e.target.files?.[0]); e.target.value = ''; }} />
      {!pdf || pdf.err ? (
        <>
          <div className={`sf-drop${over ? ' over' : ''}`} role="button" tabIndex={0} onClick={() => fileRef.current?.click()}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileRef.current?.click(); } }}
            onDragOver={e => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={onDrop}>
            <span className="pic"><Svg name="file" size={19} /></span>
            <div><b>Upload the tax invoice PDF</b><span>Bill no., date, IRN, e-way bill, the order and the quantities are filled in for you. Drop the file here or click.</span></div>
            <span className="go">Choose PDF</span>
          </div>
          {pdf?.err && <div className="sf-msg err">{pdf.err}</div>}
        </>
      ) : (
        <div className={`sf-pdf${pdf.busy ? ' busy' : ''}`}>
          <div className="top">
            <Svg name={pdf.busy ? 'refresh' : 'okCircle'} size={16} />
            <span className="fn" title={pdf.file?.name}>{pdf.file?.name}</span>
            <small>{pdf.busy ? 'Reading the PDF…' : pdf.got?.length ? `${pdf.got.length} details filled — check them, then save. The PDF is attached on save.` : 'Nothing could be read from this PDF — fill the details by hand. It is attached on save.'}</small>
            <span className="grow" />
            {!pdf.busy && <button type="button" className="sf-lnk" onClick={() => fileRef.current?.click()}>Change PDF</button>}
            {!pdf.busy && <button type="button" className="sf-lnk" onClick={() => { setPdf(null); setFilled({}); setQtyFromPdf({}); }}>Remove</button>}
          </div>
          {!pdf.busy && pdf.got?.length > 0 && <div className="got">{pdf.got.map(g => <span key={g}>✓ {g}</span>)}{pdf.via && <span>Order found by {pdf.via}</span>}</div>}
          {!pdf.busy && pdf.data?.pdfTotal > 0 && (
            <div className="cmp">
              <span>PDF: taxable <b>{amt(pdf.data.pdfTaxable)}</b> · GST <b>{amt(pdf.data.pdfGst)}</b> · total <b>₹ {amt(pdf.data.pdfTotal)}</b></span>
              <span>This bill: <b>₹ {amt(calc.total)}</b></span>
              {order && (Math.abs(pdfDiff) <= 1 ? <span className="ok">✓ Matches the PDF</span> : <span className="bad">Differs by ₹ {amt(Math.abs(pdfDiff))} — check quantities / charges</span>)}
            </div>
          )}
        </div>
      )}
      {warn.map(w => <div key={w} className="sf-msg warn">{w}</div>)}

      <div className="sf-2">
        <div className="sf-card">
          <div className="sf-ch"><span className="ico"><Svg name="cart" size={13} /></span><b>Sales Order</b><span className="grow" />{bl && <small>{bl.bills.length} bill{bl.bills.length === 1 ? '' : 's'} made so far</small>}</div>
          <table className="sf-kv"><tbody>
            <tr><th>Order No. <i>*</i></th><td>
              <div className="sf-srch">
                <input readOnly value={order ? `${order.orderNo || order.orderId} · ${order.customerName || order.party || ''}` : orderId ? 'Loading…' : ''} placeholder="Click to pick the sales order"
                  onClick={() => !editBill && setPicker({ q: '' })} className={tried && !orderId ? 'bad' : ''} disabled={!!editBill} />
                <button type="button" className="sf-sbtn" onClick={() => setPicker({ q: '' })} disabled={!!editBill} aria-label="Pick sales order"><Svg name="search" size={14} /></button>
              </div>
            </td></tr>
            <tr><th>Client</th><td>{order ? dash(order.customerName || order.party) : '—'}</td></tr>
            <tr><th>Client PO</th><td>{order ? <>{dash(order.customerPO)}{order.poDate ? <span style={{ color: '#667085' }}> · {fdate(order.poDate)}</span> : ''}</> : '—'}</td></tr>
            <tr><th>GSTIN · Tax</th><td>{order ? <>{dash(order.customerGstin || order.partyGstin)} &nbsp;<span className={`sf-tag ${intra ? 'intra' : 'inter'}`}>{intra ? 'CGST + SGST' : 'IGST'}</span></> : '—'}</td></tr>
            <tr><th>Order Value</th><td className="r">{bl ? `₹ ${amt(bl.value)}` : '—'}</td></tr>
            <tr><th>Billed before</th><td className="r">{bl ? `₹ ${amt(bl.billedAmt)}` : '—'}</td></tr>
            <tr><th>Left to bill</th><td className="r" style={{ fontWeight: 700, color: TEAL }}>{bl ? `₹ ${amt(bl.toBill)}` : '—'}</td></tr>
          </tbody></table>
        </div>
        <div className="sf-card">
          <div className="sf-ch"><span className="ico"><Svg name="file" size={13} /></span><b>Invoice Details</b></div>
          <table className="sf-kv"><tbody>
            <tr><th>Bill No. <i>*</i></th><td>
              <input value={head.billNo} onChange={set('billNo')} className={`mono ${cls('billNo')} ${(tried && !head.billNo.trim()) || dupe ? 'bad' : ''}`} placeholder="e.g. EPS/TI/26-27/156" />
              {dupe && <span className="sf-err">Already used by {dupe.billId} ({dupe.partyName || '—'}, {fdate(dupe.billDate)})</span>}
            </td></tr>
            <tr><th>Bill Date <i>*</i></th><td><input type="date" value={head.billDate} onChange={set('billDate')} className={`${cls('billDate')} ${tried && !head.billDate ? 'bad' : ''}`} /></td></tr>
            <tr><th>IRN</th><td><input value={head.irnNo} onChange={set('irnNo')} className={`mono ${cls('irnNo')}`} placeholder="64-character IRN" /></td></tr>
            <tr><th>Ack No.</th><td><input value={head.acknNo} onChange={set('acknNo')} className={`mono ${cls('acknNo')}`} /></td></tr>
            <tr><th>Ack Date</th><td><input type="date" value={head.acknDate} onChange={set('acknDate')} className={cls('acknDate')} /></td></tr>
            <tr><th>Material</th><td>
              <div className="sf-mm" role="radiogroup" aria-label="How the material goes">
                {Object.entries(MODES).map(([k, m]) => (
                  <label key={k} className={mode === k ? 'on' : ''}><input type="radio" checked={mode === k} onChange={() => setMm(k)} />
                    <span><b>{m.long}</b><small>{k === 'after-dc' && openDcs.length ? (tieDcs.length ? `Ties DC ${tieDcs.map(d => d.dcNo || d.dcId).join(', ')} to this bill` : 'No sent DC has these products / qty — none will be tied') : k === 'with-bill' && ownDc ? `DC ${ownDc.dcNo || ownDc.dcId} was already made with this bill` : m.sub}</small></span></label>
                ))}
              </div>
              {!mm && <span style={{ display: 'block', fontSize: 11, color: '#98A2B3', marginTop: 2 }}>Picked automatically — change it if needed</span>}
            </td></tr>
            <tr><th>e-Invoice QR</th><td>{head.einvoiceQr ? <img className="sf-qrimg" src={head.einvoiceQr} alt="e-Invoice QR code" /> : <span className="sf-qrnone">Comes from the invoice PDF</span>}</td></tr>
          </tbody></table>
        </div>
      </div>

      <div className="sf-card">
        <div className="sf-ch"><span className="ico"><Svg name="swap" size={13} /></span><b>E-Way Bill</b><small>optional · same layout as the e-way bill page of the PDF</small></div>
        <div className="sf-es">1. E-Way Bill Details</div>
        <div className="sf-ewd"><div className="sf-eg">
          {FIELD('ewayBillNo', 'E-Way Bill No.', { mono: true })}{FIELD('ewayMode', 'Mode')}{FIELD('ewayGenDate', 'Generated Date', { ph: 'e.g. 26-Oct-26 11:42 AM' })}{FIELD('ewayGeneratedBy', 'Generated By (GSTIN)', { mono: true })}
          {FIELD('approxDistanceKm', 'Approx. Distance (KM)')}{FIELD('ewayValidUpto', 'Valid Upto', { ph: 'e.g. 29-Oct-26 11:59 PM' })}{FIELD('supplyType', 'Supply Type')}{FIELD('transactionType', 'Transaction Type')}
        </div>
          <div className="sf-qrbox"><span>E-Way Bill QR</span>{head.ewayQr ? <img className="sf-qrimg" src={head.ewayQr} alt="E-way bill QR code" /> : <span className="sf-qrnone">From the PDF</span>}</div>
        </div>
        <div className="sf-es">2. Address Details</div>
        <div className="sf-addr">
          <div className="box"><h4>From</h4>
            <div className="g3">{FIELD('ewayFromName', 'Name')}{FIELD('ewayFromGstin', 'GSTIN', { mono: true })}{FIELD('ewayFromState', 'State')}</div>
          </div>
          <div className="box"><h4>To</h4>
            <div className="g3">{FIELD('ewayToName', 'Name')}{FIELD('ewayToGstin', 'GSTIN', { mono: true })}{FIELD('ewayToState', 'State')}</div>
          </div>
          <div className="box"><h4>Dispatch From</h4>{FIELD('dispatchFrom', 'Address', { area: true, ph: 'Where the goods leave from' })}</div>
          <div className="box"><h4>Ship To</h4>{FIELD('ewayShipTo', 'Address', { area: true, ph: 'Where the goods are delivered' })}</div>
        </div>
        <div className="sf-es">3. Transportation &amp; Vehicle Details</div>
        <div className="sf-eg">
          {FIELD('transporterId', 'Transporter ID', { mono: true })}{FIELD('transporterName', 'Transporter Name')}{FIELD('vehicleNo', 'Vehicle No.', { mono: true })}{FIELD('vehicleFromCity', 'Vehicle From')}
          {FIELD('transDocNo', 'Transport Doc No.')}{FIELD('transDocDate', 'Transport Doc Date')}{FIELD('cewbNo', 'CEWB No.', { mono: true })}
        </div>
      </div>

      <div className="sf-card">
        <div className="sf-ch"><span className="ico"><Svg name="box" size={13} /></span><b>1 · Products</b><span className="grow" />{order && <small>Bill Qty starts at the pending qty — lower it for a part bill</small>}</div>
        {!bl ? <div className="sf-empty">{orderId ? 'Loading the order…' : 'Pick the sales order (or upload the invoice PDF) to see its products.'}</div> : (
          <table className="sf-t sf-pt">
            <colgroup><col style={{ width: 34 }} /><col /><col style={{ width: 82 }} /><col style={{ width: 70 }} /><col style={{ width: 74 }} /><col style={{ width: 112 }} /><col style={{ width: 104 }} /><col style={{ width: 112 }} /><col style={{ width: 60 }} /><col style={{ width: 96 }} /><col style={{ width: 116 }} /></colgroup>
            <thead>
              <tr className="grp"><th colSpan={2} /><th colSpan={3} className="c">In the order</th><th colSpan={6} className="c now">In this bill</th></tr>
              <tr><th>Sl</th><th>Product</th><th className="r">Order Qty</th><th className="r">Billed</th><th className="r">Pending</th>
                <th className="r now first">Bill Qty</th><th className="r now">Rate</th><th className="r now">Taxable</th><th className="r now">GST %</th><th className="r now">GST</th><th className="r now">Amount</th></tr>
            </thead>
            <tbody>
              {bl.lines.map((l, i) => {
                const q = n(qty[l.idx]), taxable = r2(q * l.rate), g = r2(taxable * l.gstPct / 100), err = calc.errs[l.idx];
                const off = l.pending <= 0 && !q;
                return (
                  <tr key={l.idx} className={off ? 'off' : ''}>
                    <td>{i + 1}</td>
                    <td><div className="pn">{l.name}</div><div className="ps">{l.hsn ? `HSN ${l.hsn}` : 'No HSN'} · {l.unit}</div></td>
                    <td className="r">{num(l.ordered)}</td>
                    <td className="r">{l.billed ? num(l.billed) : <span className="mut">0</span>}</td>
                    <td className={`r ${l.pending > 0 ? 'pend' : 'done'}`}>{l.pending > 0 ? num(l.pending) : '✓ Billed'}</td>
                    <td className="r now first">
                      <input className={`sf-q${qtyFromPdf[l.idx] ? ' fx' : ''}${err ? ' bad' : ''}`} inputMode="decimal" value={qty[l.idx] ?? ''} disabled={l.pending <= 0 && !q} placeholder="0"
                        onChange={e => { const v = e.target.value.replace(/[^\d.]/g, ''); setQty(x => ({ ...x, [l.idx]: v })); setQtyFromPdf(x => (x[l.idx] ? { ...x, [l.idx]: false } : x)); }}
                        aria-label={`Bill qty for ${l.name}`} title={err || (qtyFromPdf[l.idx] ? 'Taken from the PDF' : '')} />
                      {err && <span className="sf-err">{err}</span>}
                    </td>
                    <td className="r now">{amt(l.rate)}</td><td className="r now">{q ? amt(taxable) : <span className="mut">—</span>}</td>
                    <td className="r now">{num(l.gstPct)}%</td><td className="r now">{q ? amt(g) : <span className="mut">—</span>}</td><td className="r now"><b>{q ? amt(taxable + g) : '—'}</b></td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot><tr><td colSpan={5}>Product total</td><td className="now first" /><td className="now" /><td className="r now">{amt(calc.prodSub)}</td><td className="now" /><td className="r now">{amt(calc.prodGst)}</td><td className="r now">{amt(calc.prodSub + calc.prodGst)}</td></tr></tfoot>
          </table>
        )}
      </div>

      {bl && (
        <div className="sf-card">
          <div className="sf-ch"><span className="ico"><Svg name="plus" size={13} /></span><b>2 · Additional Charges</b><span className="grow" /><small>% charges are worked out on this bill's product taxable ({amt(calc.prodSub)})</small></div>
          {!chg.length ? <div className="sf-empty">No additional charges in this bill.</div> : (
            <table className="sf-t sf-ct">
              <colgroup><col /><col style={{ width: 210 }} /><col style={{ width: 230 }} /><col style={{ width: 130 }} /><col style={{ width: 70 }} /><col style={{ width: 110 }} /><col style={{ width: 120 }} /><col style={{ width: 46 }} /></colgroup>
              <thead><tr><th>Charge</th><th>In the order</th><th>Charge as</th><th className="r">Taxable</th><th className="r">GST %</th><th className="r">GST</th><th className="r">Amount</th><th /></tr></thead>
              <tbody>{chg.map(c => {
                const a = calc.chAmt[c.key] || 0, g = r2(a * n(c.gst) / 100), o = c.ord || {};
                const upd = patch => setChg(x => x.map(y => (y.key === c.key ? { ...y, ...patch } : y)));
                return (
                  <tr key={c.key}>
                    <td><b className="cl">{c.label}</b></td>
                    <td className="ps2">{o.mode === 'pct' ? `${num(o.pct)}% of taxable` : o.amount ? `₹ ${amt(o.amount)}${o.billed ? ` · billed ₹ ${amt(o.billed)}` : ''}` : 'Not in the order'}</td>
                    <td>
                      <div className="sf-cm">
                        <div className="sf-seg" role="radiogroup" aria-label={`${c.label} charged as`}>
                          <button type="button" role="radio" aria-checked={c.mode === 'pct'} className={c.mode === 'pct' ? 'on' : ''} onClick={() => upd({ mode: 'pct', pct: c.pct || (o.mode === 'pct' ? String(o.pct) : '') })}>%</button>
                          <button type="button" role="radio" aria-checked={c.mode !== 'pct'} className={c.mode !== 'pct' ? 'on' : ''} onClick={() => upd({ mode: 'amount', amountNow: c.amountNow || (a ? String(a) : '') })}>₹</button>
                        </div>
                        {c.mode === 'pct'
                          ? <div className="sf-unit"><input inputMode="decimal" value={c.pct} placeholder="0" onChange={e => upd({ pct: e.target.value.replace(/[^\d.]/g, '') })} aria-label={`${c.label} percent`} /><span>%</span></div>
                          : <div className="sf-unit pre"><span>₹</span><input inputMode="decimal" value={c.amountNow} placeholder="0" onChange={e => upd({ amountNow: e.target.value.replace(/[^\d.]/g, '') })} aria-label={`${c.label} amount`} /></div>}
                      </div>
                    </td>
                    <td className="r">{a ? amt(a) : <span className="mut">—</span>}</td><td className="r">{num(c.gst)}%</td>
                    <td className="r">{a ? amt(g) : <span className="mut">—</span>}</td><td className="r"><b>{a ? amt(a + g) : '—'}</b></td>
                    <td className="c"><button type="button" className="sf-x" title={`Remove ${c.label} from this bill`} aria-label={`Remove ${c.label}`}
                      onClick={() => { setChg(x => x.filter(y => y.key !== c.key)); setRemoved(x => [...x, c]); }}>×</button></td>
                  </tr>
                );
              })}</tbody>
              <tfoot><tr><td colSpan={3}>Charges total</td><td className="r">{amt(calc.chSub)}</td><td /><td className="r">{amt(calc.gst - calc.prodGst)}</td><td className="r">{amt(calc.chSub + calc.gst - calc.prodGst)}</td><td /></tr></tfoot>
            </table>
          )}
          {removed.length > 0 && (
            <div className="sf-rm"><span>Not in this bill:</span>{removed.map(c => (
              <button key={c.key} type="button" onClick={() => { setRemoved(x => x.filter(y => y.key !== c.key)); setChg(x => [...x, c]); }} title="Add this charge back">
                {c.label}{c.ord?.mode === 'pct' ? ` (${num(c.ord.pct)}%)` : c.ord?.amount ? ` (₹ ${amt(c.ord.amount)})` : ''} <b>+ Add</b>
              </button>
            ))}</div>
          )}
        </div>
      )}

      {bl && (
        <div className="sf-sumw">
          <div className="sf-card sf-sum">
            <div className="sf-ch"><span className="ico"><Svg name="wallet" size={13} /></span><b>3 · Bill Summary</b></div>
            <div className="row"><span>Product taxable</span><b>{amt(calc.prodSub)}</b></div>
            <div className="row"><span>Additional charges</span><b>{amt(calc.chSub)}</b></div>
            <div className="row tx"><span>Taxable value</span><b>{amt(calc.sub)}</b></div>
            {intra ? <>
              <div className="row"><span>CGST</span><b>{amt(calc.cgst)}</b></div>
              <div className="row"><span>SGST</span><b>{amt(calc.sgst)}</b></div>
            </> : <div className="row"><span>IGST</span><b>{amt(calc.igst)}</b></div>}
            <div className="row gt"><span>Bill Total</span><b>₹ {amt(calc.total)}</b></div>
          </div>
        </div>
      )}

      {bl && bl.bills.length > 0 && (
        <div className="sf-card">
          <div className="sf-ch"><span className="ico"><Svg name="ledger" size={13} /></span><b>Bills already made for this order</b><span className="grow" /><small>{bl.bills.length} bill{bl.bills.length === 1 ? '' : 's'} · ₹ {amt(bl.billedAmt)}</small></div>
          <table className="sf-t">
            <thead><tr><th>Bill No.</th><th>Bill Date</th><th>Products</th><th className="r">Taxable</th><th className="r">GST</th><th className="r">Amount</th></tr></thead>
            <tbody>{[...bl.bills].sort((a, b) => String(a.billDate || '').localeCompare(String(b.billDate || ''))).map(b => (
              <tr key={b.billId}>
                <td className="sf-no">{b.billNo || b.billId}</td><td>{fdate(b.billDate)}</td>
                <td>{(b.items || []).filter(li => li.unit !== 'LOT').map(li => `${li.description} × ${num(li.qty)}`).join('; ') || '—'}</td>
                <td className="r">{amt(b.subTotal)}</td><td className="r">{amt(b.totalGST)}</td><td className="r"><b>{amt(b.grandTotal)}</b></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}

      {msg && <div className={`sf-msg ${msg.k}`} role="status">{msg.t}</div>}
      <div className="sf-bar">
        <div className="info">{bl ? <>This bill <b>₹ {amt(calc.total)}</b> &nbsp;·&nbsp; left to bill on this order after it: ₹ {amt(left)}</> : 'Pick an order to start.'}</div>
        {editBill ? <button type="button" className="sf-b ghost" onClick={onCancel} disabled={saving}>Cancel</button>
          : <button type="button" className="sf-b ghost" onClick={() => { reset(); setMsg(null); }} disabled={saving}>Clear</button>}
        <button type="button" className="sf-b pri" onClick={save} disabled={saving || pdf?.busy}>{saving ? 'Saving…' : editBill ? 'Update Bill' : 'Save Bill'}</button>
      </div>

      {picker && <OrderPicker rows={rows} q0={picker.q} note={picker.note} onPick={pick} onClose={() => { setPicker(null); pendingPdfQty.current = null; }} />}
    </div>
  );
}

function OrderPicker({ rows, q0 = '', note, onPick, onClose }) {
  const [q, setQ] = useState(q0);
  const [all, setAll] = useState(false);
  const [sel, setSel] = useState(0);
  const inRef = useRef(null), listRef = useRef(null);
  useEffect(() => { inRef.current?.focus(); }, []);
  const list = useMemo(() => {
    const w = q.toLowerCase().split(/\s+/).filter(Boolean);
    return rows.filter(r => (all || r.state !== 'full')
      && (!w.length || w.every(x => `${r.o.orderNo} ${r.o.orderId} ${r.o.customerName || r.o.party} ${r.o.customerPO} ${r.o.customerGstin || ''}`.toLowerCase().includes(x)))).slice(0, 300);
  }, [rows, q, all]);
  useEffect(() => setSel(0), [q, all]);
  useEffect(() => { listRef.current?.querySelector('tr.sel')?.scrollIntoView({ block: 'nearest' }); }, [sel]);
  const key = e => {
    if (e.key === 'Escape') onClose();
    else if (e.key === 'ArrowDown') { e.preventDefault(); setSel(s => Math.min(s + 1, list.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel(s => Math.max(s - 1, 0)); }
    else if (e.key === 'Enter' && list[sel]) { e.preventDefault(); onPick(list[sel]); }
  };
  return (
    <div className="sf-pkb" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sf-pk" role="dialog" aria-modal="true" aria-label="Select sales order" onKeyDown={key}>
        <div className="sf-pkh"><b>Select Sales Order</b><span className="grow" /><small>{list.length} found</small><button type="button" onClick={onClose} aria-label="Close">×</button></div>
        {note && <div className="sf-msg warn" style={{ margin: 0 }}>{note}</div>}
        <div className="sf-pks">
          <input type="text" ref={inRef} value={q} onChange={e => setQ(e.target.value)} placeholder="Search by order no., client, client PO or GSTIN…" aria-label="Search orders" />
          <label><input type="checkbox" checked={all} onChange={e => setAll(e.target.checked)} />Include fully billed</label>
        </div>
        <div className="sf-pkl" ref={listRef}>
          <table className="sf-t">
            <thead><tr><th>Order No.</th><th>Date</th><th>Client</th><th>Client PO</th><th className="r">Order Value</th><th className="r">Billed</th><th className="r">To Bill</th><th className="c">Bills</th></tr></thead>
            <tbody>{list.length ? list.map((r, i) => (
              <tr key={r.o.orderId} className={i === sel ? 'sel' : ''} onMouseEnter={() => setSel(i)} onClick={() => onPick(r)}>
                <td className="sf-no">{r.o.orderNo || r.o.orderId}</td><td>{fdate(r.o.orderDate)}</td><td>{dash(r.o.customerName || r.o.party)}</td>
                <td>{dash(r.o.customerPO)}</td><td className="r">{amt(r.value)}</td><td className="r">{amt(r.billedAmt)}</td>
                <td className="r" style={{ fontWeight: 700, color: r.toBill > 0 ? '#B54708' : '#067647' }}>{amt(r.toBill)}</td><td className="c">{r.bills.length || '—'}</td>
              </tr>
            )) : <tr><td colSpan={8} className="sf-empty">{q ? `Nothing matches “${q}”.` : 'No orders left to bill.'}</td></tr>}</tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
