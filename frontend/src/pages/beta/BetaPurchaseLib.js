/* Purchase side shared helpers — what each PO line has received (GRN) and been billed (purchase bills).
 *   GRNs live in two stores: /api/grn (Goods Receipt — can go to our yard, straight to the client or to
 *   another vendor; never touches stock) and /api/stock/grn (the classic Stock In — our store only).
 *   Both are read; new GRNs from the beta screens are written to /api/grn.
 *   A purchase bill keeps the classic shape: one item per PO line in PO order (qty may be 0) + charges (unit LOT). */
import axios from 'axios';
/* kept here (not imported from the PO form) so the DC page and the prints do not pull the PO form in — that makes an import loop */
export const key = s => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
const soItemName = it => it.description || it.itemName || '';
/* is this PO line the same product as that order line? (item code first, else the name) */
export const sameItem = (pl, it) => (pl.itemCode && it.itemCode && String(pl.itemCode) === String(it.itemCode)) || (key(pl.itemName || pl.description) && key(pl.itemName || pl.description) === key(soItemName(it)));

export const n = v => parseFloat(v) || 0;
export const r2 = v => Math.round((Number(v) || 0) * 100) / 100;
export const r3 = v => Math.round((Number(v) || 0) * 1000) / 1000;
export const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
export const SKIP_PO = ['draft', 'rejected', 'cancelled'];
export const DELIVERY = { 'our-yard': 'Our factory / store', 'direct-client': 'Direct to client', 'to-vendor': 'To another vendor' };

/* the product lines of a PO (idx = position in po.items, the classic bill lines follow it) */
export const poLines = po => (po?.items || []).map((it, idx) => {
  if (!it) return null;
  const name = it.itemName || it.description || '';
  const gross = n(it.qty) * n(it.rate);
  const disc = it.discountType === '%' || it.discountType == null ? gross * Math.min(100, n(it.discount)) / 100 : n(it.discount);
  return { it, idx, name, code: it.itemCode || '', hsn: it.hsnCode || '', unit: it.unit || 'NOS', qty: n(it.qty), rate: n(it.rate),
    discPct: it.discountType === '%' || it.discountType == null ? n(it.discount) : 0, discFlat: it.discountType && it.discountType !== '%' ? n(it.discount) : 0,
    taxable: gross - disc, gstPct: n(it.gstPercent ?? it.gst ?? it.taxRate) };
}).filter(l => l && l.name);

/* which PO line a bill / GRN line belongs to: its saved line no., else the same position + name, else the name / item code */
export const ownerIdx = (li, j, lines) => {
  if (li.itemIdx != null && li.itemIdx !== '' && lines.some(l => l.idx === Number(li.itemIdx))) return Number(li.itemIdx);
  const nm = key(li.description || li.itemName);
  if (lines.some(l => l.idx === j && key(l.name) === nm)) return j;
  const m = lines.find(l => (li.itemCode && l.code && String(li.itemCode) === String(l.code)) || (nm && key(l.name) === nm));
  return m ? m.idx : null;
};

export const billCounts = b => !['rejected', 'cancelled', 'deleted'].includes(b?.status);
/* the lines of a bill that belong to one PO — a bill can cover several POs of one vendor (each line keeps its poId);
   a classic bill has no poId on its lines: all of them belong to its orderId (j = position, for the classic matching) */
export const billItemsFor = (b, poId) => (b.items || []).map((li, j) => ({ li, j }))
  .filter(({ li }) => (li.poId != null && li.poId !== '' ? String(li.poId) === String(poId) : String(b.orderId) === String(poId)));
/* every PO a bill covers */
export const billPoIds = b => [...new Set([String(b.orderId || ''), ...(b.items || []).map(li => (li.poId != null && li.poId !== '' ? String(li.poId) : '')), ...(b.poRefs || []).map(r => String(r.orderId))].filter(Boolean))];
export const grnQtyOf = li => n(li.receivedQty ?? li.qty);

/* per PO line: ordered · received · billed · left to receive · left to bill · bill pending (received, not billed) · material pending (billed, not received) */
export function poStatusOf(po, bills, grns, { skipBill = null, skipGrn = null } = {}) {
  const lines = poLines(po);
  const rec = {}, bil = {};
  (grns || []).filter(g => String(g.poId) === String(po.orderId) && g.status !== 'deleted' && String(g._id) !== String(skipGrn))
    .forEach(g => (g.items || []).forEach((li, j) => { const i = ownerIdx(li, j, lines); if (i != null) rec[i] = r3((rec[i] || 0) + grnQtyOf(li)); }));
  (bills || []).filter(b => billCounts(b) && String(b.billId) !== String(skipBill))
    .forEach(b => billItemsFor(b, po.orderId).forEach(({ li, j }) => { if (li.unit === 'LOT' && li.itemIdx == null) return; const i = ownerIdx(li, j, lines); if (i != null) bil[i] = r3((bil[i] || 0) + n(li.qty)); }));
  return lines.map(l => {
    const received = rec[l.idx] || 0, billed = bil[l.idx] || 0;
    return { ...l, received, billed, toReceive: Math.max(0, r3(l.qty - received)), toBill: Math.max(0, r3(l.qty - billed)),
      billPending: Math.max(0, r3(received - billed)), matPending: Math.max(0, r3(billed - received)) };
  });
}

/* every GRN from both stores, one shape: _id (store-unique), _src ('grn' | 'stock'), receiptDate, items[].receivedQty.
   Deleted GRNs (status 'deleted') come only with { withDeleted: true } — for the list; they never count as received. */
export async function loadGrns(companyId, { withDeleted = false } = {}) {
  const get = async (url, extra) => { try { const r = await axios.get(url, { params: { companyId, ...extra } }); return Array.isArray(r.data) ? r.data : []; } catch { return []; } };
  const [a, b] = await Promise.all([get('/api/grn', withDeleted ? { withDeleted: 1 } : {}), get('/api/stock/grn')]);
  return [
    ...a.map(g => ({ ...g, _id: `g${g.grnId}`, _src: 'grn', receiptDate: g.receiptDate || g.date || '' })),
    ...b.filter(g => g.type === 'grn' && g.poId).map(g => ({ ...g, _id: `s${g.txnId}`, _src: 'stock', receiptDate: g.receiptDate || g.date || '',
      items: (g.items || []).map(it => ({ ...it, receivedQty: it.receivedQty ?? it.qty })) })),
  ];
}

/* GRNs a DC made (material sent straight from the vendor to the client):
   DC saved again → removed for good (hard) and made afresh · DC deleted → marked deleted, still listed */
export async function dropDcGrns(companyId, dcId, { hard = false } = {}) {
  if (!dcId) return;
  let list = [];
  try { const r = await axios.get('/api/grn', { params: { companyId } }); list = Array.isArray(r.data) ? r.data : []; } catch { return; }
  await Promise.all(list.filter(g => g.source === 'dc' && String(g.dcId) === String(dcId) && g.status !== 'deleted')
    .map(g => axios.delete(`/api/grn/${g.grnId}`, { params: { companyId, ...(hard ? { hard: 1 } : {}) } }).catch(() => {})));
}

/* next internal purchase bill no. for the FY of the date: PB/2026-27/009 */
export function nextBillNo(bills, date) {
  const d = date ? new Date(date) : new Date();
  const y = isNaN(d) ? new Date().getFullYear() : (d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1);
  const prefix = `PB/${y}-${String(y + 1).slice(2)}/`;
  const max = (bills || []).reduce((m, b) => { const s = String(b.billNo || ''); return s.startsWith(prefix) ? Math.max(m, parseInt(s.slice(prefix.length), 10) || 0) : m; }, 0);
  return `${prefix}${String(max + 1).padStart(3, '0')}`;
}

/* same state → CGST + SGST, else IGST */
export const sameState = (a, b) => { const k = s => String(s || '').trim().toLowerCase(); return !!k(a) && k(a) === k(b); };

/* GRNs a purchase bill made ("material came with this bill"): bill saved again → removed for good and made afresh · bill deleted → marked deleted */
export async function dropBillGrns(companyId, billId, { hard = false } = {}) {
  if (!billId) return;
  let list = [];
  try { const r = await axios.get('/api/grn', { params: { companyId } }); list = Array.isArray(r.data) ? r.data : []; } catch { return; }
  await Promise.all(list.filter(g => g.source === 'bill' && String(g.billId) === String(billId) && g.status !== 'deleted')
    .map(g => axios.delete(`/api/grn/${g.grnId}`, { params: { companyId, ...(hard ? { hard: 1 } : {}) } }).catch(() => {})));
}
