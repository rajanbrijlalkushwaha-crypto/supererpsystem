/* Manufacturing — shared data + maths for BOM, Material Issue, Planning (MRP), QC and Production Cost.
 *   useMfg(companyId, reload)  loads everything once: raw materials, stock POs / GRNs / purchase bills, job sheets, sales orders,
 *                              BOMs, issue / return slips, QC reports and job costs
 *   rawStock(d)                per raw material: opening + received (GRN) − issued + returned = closing; average rate; value
 *   jobPlan(job, d)            per material of a job: needed (job BOM), issued, returned, net with the job, still to issue
 *   jobCost(job, d)            material (issued − returned at slip rate) + labour + overhead − scrap sale value; per unit; margin
 *   mrp(d)                     what open jobs + un-planned sales-order qty still need, against stock and open POs → shortage */
import { useEffect, useState } from 'react';
import axios from 'axios';
import { n, r2, r3, key, loadGrns, grnQtyOf, billCounts } from './BetaPurchaseLib';

export { n, r2, r3, key };
export const q = v => { const x = Number(v) || 0; return Number.isInteger(x) ? String(x) : String(Math.round(x * 1000) / 1000); };
export const money = v => `₹ ${(Number(v) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const OPEN_JOB = ['pending', 'submitted', 'approved', 'in-progress'];
export const LIVE_JOB = ['pending', 'submitted', 'approved', 'in-progress', 'completed'];
export const mfgQty = it => Number(it.mfgQty != null ? it.mfgQty : it.qty) || 0;
export const jobOut = j => ((j.outputItems || []).length ? j.outputItems : (j.itemName ? [{ itemName: j.itemName, itemCode: j.itemCode, qty: j.qtyRequired, uom: j.uom, rate: 0 }] : []));
export const jobNeed = j => jobOut(j).reduce((t, it) => t + mfgQty(it), 0) || Number(j.qtyRequired) || 0;
export const jobLabel = j => `${j.jobNo}${j.soNumber ? ` · ${String(j.soNumber).trim()}` : ''}${j.customerName ? ` · ${j.customerName}` : ''}`;

export function useMfg(companyId, reload) {
  const [d, setD] = useState(null);
  useEffect(() => {
    if (!companyId) return;
    let live = true;
    const get = (url, extra) => axios.get(url, { params: { companyId, ...extra } }).then(r => (Array.isArray(r.data) ? r.data : [])).catch(() => []);
    Promise.all([get('/api/raw-materials'), get('/api/purchase-orders'), loadGrns(companyId), get('/api/bills', { type: 'purchase' }),
      get('/api/manufacturing/job-sheets'), get('/api/sales-orders'), get('/api/production/boms'), get('/api/production/issues'),
      get('/api/production/qc'), get('/api/production/jobcost')])
      .then(([rms, pos, grns, pbills, jobs, orders, boms, issues, qc, costs]) => { if (live) setD({ rms, pos, grns, pbills, jobs, orders, boms, issues, qc, costs }); });
    return () => { live = false; };
  }, [companyId, reload]);
  return d;
}

/* raw material ↔ a free-text line (job BOM, PO, GRN, bill) */
export const rmMatch = (rm, it) => (it.rmId && Number(it.rmId) === rm.rmId) || (it.itemCode && String(it.itemCode) === rm.code) || (key(it.material || it.itemName || it.description || it.name) && key(it.material || it.itemName || it.description || it.name) === key(rm.name));
export const rmFor = (d, it) => d.rms.find(rm => rmMatch(rm, it)) || null;

export function rawStock(d) {
  const stockPo = new Set(d.pos.filter(p => p.poType === 'Stock').map(p => String(p.orderId)));
  const out = {};
  d.rms.forEach(rm => {
    const oq = n(rm.opening?.qty), orate = n(rm.opening?.rate);
    let rec = 0, bq = 0, bv = 0, lastGrn = '', ordered = 0, issued = 0, returned = 0;
    const grnByPo = {};
    d.grns.filter(g => g.status !== 'deleted' && stockPo.has(String(g.poId))).forEach(g => (g.items || []).forEach(it => {
      if (!rmMatch(rm, it)) return;
      rec += grnQtyOf(it); grnByPo[g.poId] = (grnByPo[g.poId] || 0) + grnQtyOf(it);
      if (String(g.receiptDate || '') > lastGrn) lastGrn = String(g.receiptDate || '');
    }));
    d.pbills.filter(billCounts).forEach(b => (b.items || []).forEach(li => {
      const po = li.poId != null && li.poId !== '' ? String(li.poId) : String(b.orderId || '');
      if (!(String(li.itemCode || '') === rm.code || (stockPo.has(po) && rmMatch(rm, li)))) return;
      bq += n(li.qty); bv += n(li.taxable) || n(li.qty) * n(li.rate);
    }));
    // still to come on open stock POs
    d.pos.filter(p => p.poType === 'Stock' && !['draft', 'rejected', 'cancelled', 'closed'].includes(p.status)).forEach(p => {
      const qty = (p.items || []).filter(it => rmMatch(rm, it)).reduce((t, it) => t + n(it.qty || it.quantity), 0);
      if (qty) ordered += Math.max(0, qty - n(grnByPo[p.orderId]));
    });
    d.issues.forEach(s => s.lines.forEach(l => { if (l.rmId === rm.rmId) { if (s.kind === 'return') returned += l.qty; else issued += l.qty; } }));
    const avg = oq + bq > 0 ? (oq * orate + bv) / (oq + bq) : orate;
    const closing = r3(oq + rec - issued + returned);
    out[rm.rmId] = { rm, opening: oq, rec: r3(rec), issued: r3(issued), returned: r3(returned), closing, ordered: r3(ordered), avg: r2(avg), value: r2(closing * avg),
      low: n(rm.minLevel) > 0 && closing < n(rm.minLevel), lastGrn };
  });
  return out;
}

/* BOM master of a product (by code, then name) */
export const bomFor = (d, it) => d.boms.find(b => (it.itemCode && b.itemCode && String(b.itemCode) === String(it.itemCode)) || key(b.itemName) === key(it.itemName || it.description)) || null;
/* materials of a BOM for a qty of product, scrap % added */
export const bomNeed = (bom, qty) => (bom?.materials || []).map(m => ({ ...m, qty: r3(m.qty / (n(bom.batchQty) || 1) * qty * (1 + n(m.scrapPct) / 100)) }));

/* per material of a job */
export function jobPlan(job, d) {
  const rows = [];
  const add = (rm, name, unit) => {
    let r = rows.find(x => (rm ? x.rmId === rm.rmId : !x.rmId && key(x.name) === key(name)));
    if (!r) { r = { rmId: rm?.rmId || 0, code: rm?.code || '', name: rm?.name || name, unit: rm?.unit || unit || '', need: 0, issued: 0, returned: 0, value: 0 }; rows.push(r); }
    return r;
  };
  (job.bom || []).forEach(b => { if (!String(b.material || '').trim()) return; const rm = rmFor(d, b); add(rm, b.material, b.uom).need += n(b.qty); });
  d.issues.filter(s => String(s.jobId) === String(job.id)).forEach(s => s.lines.forEach(l => {
    const rm = d.rms.find(x => x.rmId === l.rmId), r = add(rm, l.name, l.unit);
    if (s.kind === 'return') { r.returned += l.qty; r.value -= l.qty * l.rate; } else { r.issued += l.qty; r.value += l.qty * l.rate; }
  }));
  return rows.map(r => ({ ...r, need: r3(r.need), issued: r3(r.issued), returned: r3(r.returned), net: r3(r.issued - r.returned), toIssue: r3(Math.max(0, r.need - (r.issued - r.returned))), value: r2(r.value) }));
}

export function jobCost(job, d) {
  const plan = jobPlan(job, d);
  const jc = d.costs.find(c => String(c.jobId) === String(job.id)) || {};
  const material = r2(plan.reduce((t, r) => t + r.value, 0));
  const labour = r2((jc.labour || []).reduce((t, x) => t + n(x.amount), 0));
  const overhead = r2((jc.overhead || []).reduce((t, x) => t + n(x.amount), 0));
  const scrapQty = (jc.scrap || []).reduce((t, x) => t + n(x.qty), 0), scrapValue = r2((jc.scrap || []).reduce((t, x) => t + n(x.value), 0));
  const total = r2(material + labour + overhead - scrapValue);
  const out = jobOut(job), planned = jobNeed(job), produced = Number(job.qtyProduced) || 0;
  const qcs = d.qc.filter(x => String(x.jobId) === String(job.id));
  const passed = r3(qcs.reduce((t, x) => t + n(x.passed), 0)), rejected = r3(qcs.reduce((t, x) => t + n(x.rejected), 0)), rework = r3(qcs.reduce((t, x) => t + n(x.rework), 0));
  const base = produced || planned;
  const sale = r2(out.reduce((t, it) => t + mfgQty(it) * n(it.rate), 0) * (planned ? base / planned : 1));
  // standard cost from the BOM master, for the same qty
  const stock = d.__stock || (d.__stock = rawStock(d));
  let std = 0, stdOk = out.length > 0;
  out.forEach(it => {
    const bom = bomFor(d, it), qty = mfgQty(it) * (planned ? base / planned : 1);
    if (!bom) { stdOk = false; return; }
    std += bomNeed(bom, qty).reduce((t, m) => t + m.qty * n(stock[m.rmId]?.avg), 0) + qty * (n(bom.labourPerUnit) + n(bom.overheadPerUnit));
  });
  return { plan, jc, material, labour, overhead, scrapQty: r3(scrapQty), scrapValue, total, planned, produced, passed, rejected, rework,
    perUnit: base ? r2(total / base) : 0, sale, margin: r2(sale - total), marginPct: sale ? r2((sale - total) / sale * 100) : 0, std: stdOk ? r2(std) : null };
}

/* MRP — material still needed by open jobs and by sales-order qty not yet on any job sheet */
export function mrp(d) {
  const stock = rawStock(d);
  const need = {}, free = {};
  const put = (rm, name, unit, qty, src) => {
    if (qty <= 0) return;
    const bag = rm ? need : free, k = rm ? rm.rmId : key(name);
    if (!bag[k]) bag[k] = { rmId: rm?.rmId || 0, code: rm?.code || '', name: rm?.name || name, unit: rm?.unit || unit || '', jobs: 0, orders: 0, src: [] };
    bag[k][src.t] += qty; bag[k].src.push({ ...src, qty: r3(qty) });
  };
  d.jobs.filter(j => OPEN_JOB.includes(j.status)).forEach(j => jobPlan(j, d).forEach(r => {
    if (r.toIssue > 0) put(r.rmId ? d.rms.find(x => x.rmId === r.rmId) : null, r.name, r.unit, r.toIssue, { t: 'jobs', ref: j.jobNo, who: j.customerName || '', due: j.dueDate || '' });
  }));
  // planned qty on job sheets per order + product
  const planned = {};
  d.jobs.filter(j => !['cancelled', 'rejected'].includes(j.status)).forEach(j => jobOut(j).forEach(it => { const k = `${j.soId}|${key(it.itemCode || it.itemName)}`; planned[k] = (planned[k] || 0) + mfgQty(it); }));
  const unplanned = [];
  d.orders.filter(o => ['approved', 'in-progress', 'pending'].includes(o.status)).forEach(o => (o.items || []).forEach(it => {
    const it2 = { itemName: it.description || it.itemName || it.material || '', itemCode: it.itemCode || it.item_code || '' };
    const bom = bomFor(d, it2); if (!bom) return;
    const pend = Math.max(0, n(it.qty || it.quantity) - n(planned[`${o.orderId}|${key(it2.itemCode || it2.itemName)}`]));
    if (!pend) return;
    unplanned.push({ so: String(o.orderNo || o.orderId).trim(), client: o.customerName || o.party || '', item: it2.itemName, qty: r3(pend), uom: it.unit || it.uom || bom.uom, due: o.deliveryDate || '', bom: bom.code });
    bomNeed(bom, pend).forEach(m => put(d.rms.find(x => x.rmId === m.rmId) || null, m.name, m.unit, m.qty, { t: 'orders', ref: String(o.orderNo || o.orderId).trim(), who: o.customerName || o.party || '', due: o.deliveryDate || '' }));
  }));
  const rows = Object.values(need).map(r => {
    const st = stock[r.rmId] || {}, total = r3(r.jobs + r.orders);
    const shortNow = r3(Math.max(0, total - n(st.closing)));
    const toBuy = r3(Math.max(0, total - n(st.closing) - n(st.ordered) + (n(st.rm?.minLevel) && total ? n(st.rm.minLevel) : 0)));
    return { ...r, jobs: r3(r.jobs), orders: r3(r.orders), total, stock: n(st.closing), ordered: n(st.ordered), min: n(st.rm?.minLevel), shortNow, toBuy, avg: n(st.avg), buyValue: r2(toBuy * n(st.avg)) };
  }).sort((a, b) => b.toBuy - a.toBuy || a.name.localeCompare(b.name));
  // raw materials below the minimum level even with nothing planned
  Object.values(stock).filter(s => s.low && !need[s.rm.rmId]).forEach(s => rows.push({ rmId: s.rm.rmId, code: s.rm.code, name: s.rm.name, unit: s.rm.unit, jobs: 0, orders: 0, total: 0, src: [],
    stock: s.closing, ordered: s.ordered, min: n(s.rm.minLevel), shortNow: 0, toBuy: r3(Math.max(0, n(s.rm.minLevel) - s.closing - s.ordered)), avg: s.avg, buyValue: r2(Math.max(0, n(s.rm.minLevel) - s.closing - s.ordered) * s.avg), onlyMin: true }));
  return { rows, free: Object.values(free).map(r => ({ ...r, jobs: r3(r.jobs), orders: r3(r.orders), total: r3(r.jobs + r.orders) })), unplanned };
}

export const MFG_CSS = `
.mf-sub td { background:#FAFCFC; font-size:11.5px; color:#475467; }
.mf-ok { color:#067647; font-weight:700; } .mf-bad { color:#B42318; font-weight:700; } .mf-warn { color:#B54708; font-weight:700; }
.mf-box { margin:10px 12px 0; } .mf-box h3 { margin:0 0 6px; font-size:12px; text-transform:uppercase; letter-spacing:.4px; color:#03444f; }
.mf-kv { display:grid; grid-template-columns:repeat(4, minmax(0, 1fr)); gap:0; border:1px solid #DCE6E8; border-radius:6px; overflow:hidden; background:#fff; }
.mf-kv > div { padding:8px 12px; border-right:1px solid #DCE6E8; border-bottom:1px solid #DCE6E8; font-size:11px; color:#667085; text-transform:uppercase; letter-spacing:.3px; }
.mf-kv b { display:block; font-size:14px; color:#101828; text-transform:none; letter-spacing:0; margin-top:2px; }
@media (max-width:900px) { .mf-kv { grid-template-columns:1fr 1fr; } }
`;
