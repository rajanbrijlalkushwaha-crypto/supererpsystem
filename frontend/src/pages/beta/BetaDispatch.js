/* Dispatch tracking — how much of each order product has physically gone, and how that lines up with billing.
 *
 * Material leaves in one of three ways:
 *   with-bill  — goes with the tax invoice itself (e-invoice + e-way bill on the bill)
 *   after-dc   — went earlier on delivery challan(s) with e-way bill; the bill is only the e-invoice
 *   before-dc  — bill made first; material follows later on delivery challan(s)
 * Material counts as sent only on a delivery challan ("with-bill" bills create their own DC).
 * A bill (old or new) is never counted as sent — only a DC sends material.
 * Sent = qty on DCs, less what the client sent back on a Return Note (that qty is free to send again).
 * Billed = qty on all bills. */
import { billingOf, lineOwner, n, MODES, billMode } from './BetaSalesBill';

export { MODES, billMode };
const r3 = v => Math.round((Number(v) || 0) * 1000) / 1000;
const low = s => String(s == null ? '' : s).toLowerCase().trim();

/* one order + its DCs + its bills → per product sent / billed / to send, add-ons sent, and state */
export function dispatchOf(o, dcs = [], bills = [], skipDcId = null, rets = [], cns = []) {
  const bl = billingOf(o, bills, null, cns);
  const items = bl.lines.map(l => ({ it: l.it, idx: l.idx }));
  const viaDc = {}, viaBill = {};
  const myDcs = dcs.filter(d => String(d.dcId) !== String(skipDcId));
  myDcs.forEach(d => (d.items || []).forEach(li => { const x = lineOwner(li, items); if (x) viaDc[x.idx] = (viaDc[x.idx] || 0) + n(li.qty); }));
  // client Return Notes of this order: what came back is no longer "sent"
  const back = {};
  (rets || []).filter(r => r && r.kind === 'client' && r.status !== 'deleted' && String(r.orderId) === String(o.orderId))
    .forEach(r => (r.items || []).forEach(li => { const x = lineOwner({ itemIdx: li.itemIdx, itemCode: li.itemCode, description: li.itemName }, items); if (x) back[x.idx] = (back[x.idx] || 0) + n(li.qty); }));
  // a bill never counts as sent — material is sent only when its delivery challan is made
  const lines = bl.lines.map(l => {
    const dcQ = r3(viaDc[l.idx] || 0), billQ = r3(viaBill[l.idx] || 0), retQ = r3(Math.min(back[l.idx] || 0, dcQ)), sent = r3(dcQ + billQ - retQ);
    return {
      ...l, dcQ, billQ, retQ, sent, toSend: Math.max(0, r3(l.ordered - sent)),
      billedNotSent: Math.max(0, r3(l.billed - sent)), sentNotBilled: Math.max(0, r3(sent - l.billed)),
    };
  });
  // add-ons only travel on DCs (matched by their index, else by name)
  const addons = (Array.isArray(o.addons) ? o.addons : []).map((a, i) => ({ a, i })).filter(x => x.a && x.a.description).map(({ a, i }) => {
    let s = 0;
    myDcs.forEach(d => (d.addons || []).forEach(da => {
      if ((da.addonIdx != null && Number(da.addonIdx) === i) || (da.addonIdx == null && low(da.description) === low(a.description))) s += n(da.qty);
    }));
    const ordered = n(a.qty) || 1;
    return { i, a, ordered, sent: r3(s), toSend: Math.max(0, r3(ordered - s)) };
  });
  const sum = k => r3(lines.reduce((t, l) => t + l[k], 0));
  const orderQty = sum('ordered'), sentQty = sum('sent'), toSend = sum('toSend');
  return {
    o, bl, lines, addons, dcs: myDcs, bills,
    orderQty, sentQty, toSend, billedQty: sum('billed'), returnedQty: sum('retQ'),
    billedNotSent: sum('billedNotSent'), sentNotBilled: sum('sentNotBilled'),
    state: !lines.length ? 'none' : toSend <= 0 ? 'full' : sentQty > 0 ? 'part' : 'none',
  };
}
