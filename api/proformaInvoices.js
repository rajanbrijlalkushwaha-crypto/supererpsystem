/**
 * proformaInvoices.js — milestone Proforma Invoices generated against a Sales Order.
 *
 * A Proforma Invoice here is a standalone tracked document, not a tax invoice:
 * it creates no ledger/accounting entry and does not touch Dues. Its only
 * purpose is to remember how much of an order's value has already been
 * proforma-invoiced, so the next one against the same order can be offered
 * against the correct remaining balance. Multiple PIs may exist per order
 * (e.g. 50% Advance, then 50% Before Dispatch).
 *
 * Storage: Database/Companies/{companyId}/ProformaInvoices/{piId}/{piId}.json
 */
const express = require('express');
const path    = require('path');
const fs      = require('fs');
const { ROOT, auditEntry, pushAudit } = require('./helpers');
const jstore  = require('./json-store');

const router = express.Router();

const cid = req => req.query.companyId || req.body?.companyId;
const piDir = (companyId) => path.join(ROOT, 'Database', 'Companies', companyId, 'ProformaInvoices');
const readAll = (dir) => require('./sqlite').listAnyByDirOrdered(dir);

const round2 = n => Math.round((Number(n) || 0) * 100) / 100;
/* A draft PI (status 'draft') is not issued yet: it has no PI number and does not use up the order's value.
   PIs saved before drafts existed have no status — they count as issued. */
const isDraft = p => p && p.status === 'draft';
const num = v => parseFloat(v) || 0;

/* An order's value split the way PIs are raised against it (computed from the saved order, never from the browser). */
const orderParts = order => {
  const items = Array.isArray(order.items) ? order.items : [];
  const charges = Array.isArray(order.charges) ? order.charges : [];
  const iNet = items.reduce((s, it) => s + num(it.qty) * num(it.rate), 0);
  const iGst = items.reduce((s, it) => s + num(it.qty) * num(it.rate) * num(it.gstPercent ?? it.gst) / 100, 0);
  const withGst = charges.filter(c => !c.withoutGst);
  const cNet = withGst.reduce((s, c) => s + num(c.amount), 0);
  const cGst = withGst.reduce((s, c) => s + num(c.amount) * num(c.gst) / 100, 0);
  const pNet = charges.filter(c => c.withoutGst).reduce((s, c) => s + num(c.amount), 0);
  return {
    basic: round2(iNet), basicGst: round2(iGst), charges: round2(cNet), chargesGst: round2(cGst), chargesNoGst: round2(pNet),
    gst: round2(iGst + cGst), grandTotal: round2(order.grandTotal),
  };
};

/* What a PI can be calculated on → { base, taxable, gst } of the full basis */
const BASES = {
  basic:              { label: 'Basic',                      parts: p => ({ taxable: p.basic, gst: 0, other: 0 }) },
  basic_gst:          { label: 'Basic + GST',                parts: p => ({ taxable: p.basic, gst: p.basicGst, other: 0 }) },
  basic_charges:      { label: 'Basic + Charges',            parts: p => ({ taxable: p.basic + p.charges, gst: 0, other: p.chargesNoGst }) },
  full:               { label: 'Full value (with GST)',      parts: p => ({ taxable: p.basic + p.charges, gst: p.gst, other: p.chargesNoGst }) },
  gst:                { label: 'GST only',                   parts: p => ({ taxable: 0, gst: p.gst, other: 0 }) },
};

/* Company code for PI numbers = the letters before "SO" in the order no. (EPSSO2627090 → EPS); else the company's initials */
const companyCode = (order, companyId) => {
  const m = String(order.orderNo || '').toUpperCase().match(/^([A-Z]{1,6})SO\d/);
  if (m) return m[1];
  const co = jstore.readOneCompany ? jstore.readOneCompany(companyId) : null;
  const name = String(co?.companyName || '').replace(/^M\/s\.?\s*/i, '');
  return name.split(/\s+/).filter(w => /^[A-Za-z]/.test(w)).map(w => w[0].toUpperCase()).join('').slice(0, 4) || 'CO';
};
/* Money received against an order (receipts linked to it; same rule as the Dues screen: not rejected) */
const orderReceipts = (companyId, orderId) => {
  const dir = path.join(ROOT, 'Database', 'Companies', companyId, 'Payments');
  const list = require('./sqlite').listFlatByDir(dir)
    .filter(p => p && p.type === 'receipt' && p.status !== 'rejected' && String(p.orderId) === String(orderId))
    .map(p => ({ paymentId: p.paymentId, date: p.date || p.createdAt || '', amount: round2(p.amount), mode: p.paymentMode || '', ref: p.referenceNo || p.reference || '', status: p.status || '' }))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  return { list, total: round2(list.reduce((sum, p) => sum + p.amount, 0)) };
};
/* Payment position after a PI: billed so far (earlier PIs + this one) minus money received */
const paymentPosition = (previouslyInvoiced, amount, received) => ({
  billedToDate: round2(previouslyInvoiced + amount),
  received: round2(received),
  netPayable: round2(Math.max(0, previouslyInvoiced + amount - received)),
});

/* Indian financial year of a date → "2627" for FY 2026-27 */
const fyCode = d => {
  const x = new Date(d || Date.now());
  const y = isNaN(x) ? new Date().getFullYear() : (x.getMonth() >= 3 ? x.getFullYear() : x.getFullYear() - 1);
  return String(y).slice(2) + String(y + 1).slice(2);
};
/* Next PI no. for code+FY, read from disk (the read index lags writes) */
const nextPiNo = (dir, prefix) => {
  let max = 0;
  if (fs.existsSync(dir)) {
    for (const d of fs.readdirSync(dir)) {
      try {
        const p = JSON.parse(fs.readFileSync(path.join(dir, d, `${d}.json`), 'utf-8'));
        if (String(p.piNo || '').startsWith(prefix)) max = Math.max(max, parseInt(String(p.piNo).slice(prefix.length), 10) || 0);
      } catch { /* not a PI folder */ }
    }
  }
  return prefix + String(max + 1).padStart(3, '0');
};

// GET /api/proforma-invoices?companyId=&orderId= — list, optionally filtered to one order
router.get('/', (req, res) => {
  try {
    const dir = piDir(cid(req));
    let list = readAll(dir);
    if (req.query.orderId) list = list.filter(p => String(p.orderId) === String(req.query.orderId));
    res.json(list);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/proforma-invoices/balance/:orderId?companyId= — order total, already-invoiced, remaining
router.get('/balance/:orderId', (req, res) => {
  try {
    const companyId = cid(req);
    const order = jstore.readOne('SalesOrder', companyId, req.params.orderId);
    if (!order) return res.status(404).json({ error: 'Sales order not found' });

    const existing = readAll(piDir(companyId)).filter(p => String(p.orderId) === String(req.params.orderId) && !isDraft(p));
    const orderGrandTotal = round2(order.grandTotal);
    const previouslyInvoiced = round2(existing.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0));

    const parts = orderParts(order);
    const rc = orderReceipts(companyId, req.params.orderId);
    res.json({
      orderId: req.params.orderId,
      receipts: rc.list, received: rc.total,
      parts,
      bases: Object.fromEntries(Object.entries(BASES).map(([k, b]) => [k, { label: b.label, ...b.parts(parts) }])),
      nextPiNo: nextPiNo(piDir(companyId), `${companyCode(order, companyId)}PI${fyCode(req.query.piDate)}`),
      orderGrandTotal,
      previouslyInvoiced,
      remaining: round2(orderGrandTotal - previouslyInvoiced),
      priorInvoices: existing,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET single PI
router.get('/:piId', (req, res) => {
  try {
    const file = path.join(piDir(cid(req)), req.params.piId, `${req.params.piId}.json`);
    if (!fs.existsSync(file)) return res.status(404).json({ error: 'Not found' });
    res.json(JSON.parse(fs.readFileSync(file, 'utf-8')));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST create a Proforma Invoice for an order
// body: { companyId, orderId, splitType: 'percent'|'amount', splitValue, milestone? }
router.post('/', (req, res) => {
  try {
    const companyId = cid(req);
    const { orderId, splitType, milestone = '', basis = '', piDate = '', remarks = '' } = req.body;
    const draft = req.body.status === 'draft';
    const splitValue = parseFloat(req.body.splitValue);

    if (!companyId) return res.status(400).json({ error: 'companyId required' });
    if (!orderId)   return res.status(400).json({ error: 'orderId required' });
    if (!['percent', 'amount'].includes(splitType)) return res.status(400).json({ error: "splitType must be 'percent' or 'amount'" });
    if (!(splitValue > 0)) return res.status(400).json({ error: 'splitValue must be a positive number' });
    if (splitType === 'percent' && splitValue > 100) return res.status(400).json({ error: 'Percentage cannot exceed 100' });

    // Authoritative order data — never trust order totals supplied by the client for a financial document.
    const order = jstore.readOne('SalesOrder', companyId, orderId);
    if (!order) return res.status(404).json({ error: 'Sales order not found' });

    const dir = piDir(companyId);
    const existing = readAll(dir).filter(p => String(p.orderId) === String(orderId) && !isDraft(p));
    const orderGrandTotal = round2(order.grandTotal);
    const previouslyInvoiced = round2(existing.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0));

    if (order.status === 'cancelled') return res.status(400).json({ error: 'This sales order is cancelled — a proforma invoice cannot be raised.' });

    // Basis (new screens): the % applies to the chosen part of the order value. No basis = old behaviour (whole grand total).
    const parts = orderParts(order);
    const B = basis ? BASES[basis] : null;
    if (basis && !B) return res.status(400).json({ error: 'Unknown basis' });
    const full = B ? B.parts(parts) : { taxable: 0, gst: 0, other: 0 };
    const baseValue = B ? round2(full.taxable + full.gst + full.other) : orderGrandTotal;
    const amount = round2(splitType === 'percent' ? baseValue * (splitValue / 100) : splitValue);
    // split the PI amount into taxable / GST / other in the same ratio as its basis
    const ratio = baseValue > 0 ? amount / baseValue : 0;
    const breakup = B ? { taxable: round2(full.taxable * ratio), gst: round2(full.gst * ratio), other: round2(full.other * ratio) } : null;
    if (!(amount > 0)) return res.status(400).json({ error: 'Computed amount must be greater than zero' });

    // Small epsilon for floating-point rounding — not a loophole for real over-invoicing.
    const remaining = round2(orderGrandTotal - previouslyInvoiced);
    if (amount > remaining + 0.5) {
      return res.status(400).json({
        error: `This would exceed the order value. Already invoiced: ₹${previouslyInvoiced.toFixed(2)}, remaining balance: ₹${remaining.toFixed(2)}.`,
        orderGrandTotal, previouslyInvoiced, remaining,
      });
    }

    // Derive the next id from disk, not the read index — the index lags a write
    // by the watcher debounce, and a stale max here would overwrite a PI.
    const existingNums = fs.existsSync(dir)
      ? fs.readdirSync(dir).map(n => parseInt(n.replace(/\D/g, ''), 10) || 0)
      : [];
    const lastNum = existingNums.length ? Math.max(...existingNums) : 0;
    const piId = `PI${String(lastNum + 1).padStart(6, '0')}`;
    const rcp = orderReceipts(companyId, orderId);
    const pos = paymentPosition(previouslyInvoiced, amount, rcp.total);
    // a draft gets its PI number only when it is issued
    const piNo = draft ? '' : basis ? nextPiNo(dir, `${companyCode(order, companyId)}PI${fyCode(piDate)}`) : piId;

    const pi = {
      piId, piNo, status: draft ? 'draft' : 'issued', companyId, piDate: piDate || new Date().toISOString().slice(0, 10),
      orderId: order.orderId, orderNo: order.orderNo,
      customerName: order.customerName || order.party || '',
      customerCode: order.customerCode || '', customerPO: order.customerPO || '',
      milestone: String(milestone || '').trim(),
      remarks: String(remarks || '').trim(),
      basis: basis || 'grand_total', basisLabel: B ? B.label : 'Grand total', baseValue,
      splitType, splitValue,
      amount, breakup,
      receipts: rcp.list, ...pos,
      orderGrandTotal,
      previouslyInvoiced,
      balanceAfter: round2(remaining - amount),
      createdAt: new Date().toISOString(),
      audit: [auditEntry(req, draft ? 'draft_saved' : 'created')],
    };

    const pDir = path.join(dir, piId);
    fs.mkdirSync(pDir, { recursive: true });
    const pFile = path.join(pDir, `${piId}.json`);
    fs.writeFileSync(pFile, JSON.stringify(pi, null, 2));
    require('./sqlite').indexFile(pFile);

    res.json(pi);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT edit a Proforma Invoice — date, milestone, remarks, basis, % / amount. The PI number stays the same.
// Amounts are recomputed from the saved order; the limit is the order value minus all OTHER PIs of the order.
router.put('/:piId', (req, res) => {
  try {
    const companyId = cid(req);
    const file = path.join(piDir(companyId), req.params.piId, `${req.params.piId}.json`);
    if (!fs.existsSync(file)) return res.status(404).json({ error: 'Proforma invoice not found' });
    const pi = JSON.parse(fs.readFileSync(file, 'utf-8'));

    const order = jstore.readOne('SalesOrder', companyId, pi.orderId);
    if (!order) return res.status(404).json({ error: 'Sales order not found' });

    const b = req.body || {};
    const splitType = b.splitType || pi.splitType;
    const splitValue = b.splitValue != null ? parseFloat(b.splitValue) : parseFloat(pi.splitValue);
    const basis = b.basis != null ? b.basis : (pi.basis && pi.basis !== 'grand_total' ? pi.basis : '');
    if (!['percent', 'amount'].includes(splitType)) return res.status(400).json({ error: "splitType must be 'percent' or 'amount'" });
    if (!(splitValue > 0)) return res.status(400).json({ error: 'splitValue must be a positive number' });
    if (splitType === 'percent' && splitValue > 100) return res.status(400).json({ error: 'Percentage cannot exceed 100' });

    const parts = orderParts(order);
    const B = basis ? BASES[basis] : null;
    if (basis && !B) return res.status(400).json({ error: 'Unknown basis' });
    const orderGrandTotal = round2(order.grandTotal);
    const full = B ? B.parts(parts) : { taxable: 0, gst: 0, other: 0 };
    const baseValue = B ? round2(full.taxable + full.gst + full.other) : orderGrandTotal;
    const amount = round2(splitType === 'percent' ? baseValue * (splitValue / 100) : splitValue);
    if (!(amount > 0)) return res.status(400).json({ error: 'Computed amount must be greater than zero' });

    const others = readAll(piDir(companyId)).filter(p => String(p.orderId) === String(pi.orderId) && p.piId !== pi.piId && !isDraft(p));
    const issueNow = isDraft(pi) && b.status === 'issued';   // a draft can be issued; an issued PI never goes back to draft
    const previouslyInvoiced = round2(others.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0));
    const remaining = round2(orderGrandTotal - previouslyInvoiced);
    if (amount > remaining + 0.5) {
      return res.status(400).json({ error: `This would exceed the order value. Other PIs: ₹${previouslyInvoiced.toFixed(2)}, available for this PI: ₹${remaining.toFixed(2)}.` });
    }
    const ratio = baseValue > 0 ? amount / baseValue : 0;
    const rcp = orderReceipts(companyId, pi.orderId);

    const updated = {
      ...pi,
      piDate: b.piDate || pi.piDate,
      milestone: b.milestone != null ? String(b.milestone).trim() : pi.milestone,
      remarks: b.remarks != null ? String(b.remarks).trim() : (pi.remarks || ''),
      basis: basis || 'grand_total', basisLabel: B ? B.label : 'Grand total', baseValue,
      splitType, splitValue, amount,
      breakup: B ? { taxable: round2(full.taxable * ratio), gst: round2(full.gst * ratio), other: round2(full.other * ratio) } : (pi.breakup || null),
      orderGrandTotal, previouslyInvoiced, balanceAfter: round2(remaining - amount),
      receipts: rcp.list, ...paymentPosition(previouslyInvoiced, amount, rcp.total),
      updatedAt: new Date().toISOString(),
    };
    if (issueNow) {
      updated.status = 'issued';
      updated.piNo = basis ? nextPiNo(piDir(companyId), `${companyCode(order, companyId)}PI${fyCode(updated.piDate)}`) : pi.piId;
      updated.issuedAt = updated.updatedAt;
    }
    updated.audit = pushAudit(pi, req, issueNow ? 'issued' : 'edited', { from: { amount: pi.amount, milestone: pi.milestone }, to: { amount, milestone: updated.milestone } });
    fs.writeFileSync(file, JSON.stringify(updated, null, 2));
    require('./sqlite').indexFile(file);
    res.json(updated);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE a Proforma Invoice (frees up its amount for the order's remaining balance)
router.delete('/:piId', (req, res) => {
  try {
    const dir = path.join(piDir(cid(req)), req.params.piId);
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
