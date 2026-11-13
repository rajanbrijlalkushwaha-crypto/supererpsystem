/**
 * books.js — the company's books, built from the documents already in the ERP (like Tally does).
 * Every posted document becomes a balanced double-entry voucher:
 *   Sales bill       Dr client            Cr Sales + Output GST
 *   Purchase bill    Dr Purchase + Input GST   Cr vendor
 *   Receipt          Dr bank / cash       Cr client
 *   Payment          Dr vendor / ledger   Cr bank / cash
 *   Expense          Dr expense head + Input GST   Cr the party it is owed to
 *   Credit note      Dr Sales returns + Output GST  Cr client
 *   Debit note       Dr vendor            Cr Purchase returns + Input GST
 *   Journal / ledger voucher   as entered
 *   Security deposit Dr Security deposit with clients   Cr client
 *   Salary sheet     Dr Salary            Cr Salary payable + PF / ESI / PT / TDS payable + staff advance
 *   Fixed asset      Dr asset head        Cr paid from (bank / cash / vendor / capital); yearly depreciation; disposal
 * Only approved documents are in the books — pending / draft / rejected ones are counted, not posted.
 *
 * GET  /api/books?companyId=          → { groups, ledgers, postings, pending, brs, assets, banks }
 * POST /api/books/brs                 → { key, clearedOn } bank reconciliation date for one bank line ('' clears it)
 */
const express = require('express');
const path    = require('path');
const fs      = require('fs');
const { ROOT, saveJson } = require('./helpers');
const sqlite  = require('./sqlite');

const router = express.Router();
const cidOf  = req => String(req.query.companyId || req.body?.companyId || '');
const coDir  = (cid, mod) => path.join(ROOT, 'Database', 'Companies', cid, mod);
const flat   = (cid, mod) => { try { return sqlite.listFlatByDir(coDir(cid, mod)) || []; } catch { return []; } };
const deep   = (cid, mod) => { try { return sqlite.listShallowByDir(coDir(cid, mod)) || []; } catch { return []; } };
const any    = (cid, mod) => { try { return sqlite.listAnyByDirOrdered(coDir(cid, mod)) || []; } catch { return []; } };
const readJson = (f, d) => { try { return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf-8')) : d; } catch { return d; } };
const n  = v => parseFloat(v) || 0;
const r2 = v => Math.round(n(v) * 100) / 100;
const clean = s => String(s || '').replace(/\s+/g, ' ').trim();
const brsFile = cid => path.join(coDir(cid, 'Ledger'), 'brs.json');

/* primary groups — every group rolls up to one of these; `side` places it in the Balance sheet / P&L */
const BASE_GROUPS = [
  { id: 'capital',      name: 'Capital Account',              nature: 'Cr', parent: null,          side: 'L' },
  { id: 'reserves',     name: 'Reserves & Surplus',           nature: 'Cr', parent: 'capital' },
  { id: 'loans-liab',   name: 'Loans (Liability)',            nature: 'Cr', parent: null,          side: 'L' },
  { id: 'curr-liab',    name: 'Current Liabilities',          nature: 'Cr', parent: null,          side: 'L' },
  { id: 'sundry-cred',  name: 'Sundry Creditors',             nature: 'Cr', parent: 'curr-liab' },
  { id: 'employee-pay', name: 'Employee Payables',            nature: 'Cr', parent: 'curr-liab' },
  { id: 'duties-taxes', name: 'Duties & Taxes',               nature: 'Cr', parent: 'curr-liab' },
  { id: 'other-liab',   name: 'Other Current Liabilities',    nature: 'Cr', parent: 'curr-liab' },
  { id: 'fixed-assets', name: 'Fixed Assets',                 nature: 'Dr', parent: null,          side: 'A' },
  { id: 'curr-assets',  name: 'Current Assets',               nature: 'Dr', parent: null,          side: 'A' },
  { id: 'sundry-debt',  name: 'Sundry Debtors',               nature: 'Dr', parent: 'curr-assets' },
  { id: 'bank',         name: 'Bank Accounts',                nature: 'Dr', parent: 'curr-assets' },
  { id: 'cash',         name: 'Cash-in-Hand',                 nature: 'Dr', parent: 'curr-assets' },
  { id: 'deposits',     name: 'Deposits (Asset)',             nature: 'Dr', parent: 'curr-assets' },
  { id: 'loans-adv',    name: 'Loans & Advances (Asset)',     nature: 'Dr', parent: 'curr-assets' },
  { id: 'suspense',     name: 'Suspense A/c (no group yet)',  nature: 'Dr', parent: null,          side: 'X' },
  { id: 'direct-inc',   name: 'Sales Accounts',               nature: 'Cr', parent: null,          side: 'I' },
  { id: 'indirect-inc', name: 'Indirect Income',              nature: 'Cr', parent: null,          side: 'II' },
  { id: 'purchase',     name: 'Purchase Accounts',            nature: 'Dr', parent: null,          side: 'E' },
  { id: 'direct-exp',   name: 'Direct Expenses',              nature: 'Dr', parent: null,          side: 'E' },
  { id: 'indirect-exp', name: 'Indirect Expenses',            nature: 'Dr', parent: null,          side: 'IE' },
  { id: 'salary-exp',   name: 'Salary Expenses',              nature: 'Dr', parent: 'indirect-exp' },
];

function loadBooks(cid) {
  /* ── groups: the base list + the company's own groups (Ledger/groups.json) ── */
  const own = readJson(path.join(coDir(cid, 'Ledger'), 'groups.json'), []);
  const gmap = {};
  BASE_GROUPS.forEach(g => { gmap[g.id] = { ...g, isSystem: true }; });
  (Array.isArray(own) ? own : []).forEach(g => { if (g && g.id && !gmap[g.id]) gmap[g.id] = { id: g.id, name: g.name, nature: g.nature || 'Dr', parent: g.parent || null }; });
  if (gmap['direct-inc']) gmap['direct-inc'].name = 'Sales Accounts';
  const rootOf = id => { let g = gmap[id], k = 0; while (g && g.parent && gmap[g.parent] && k++ < 20) g = gmap[g.parent]; return g; };
  Object.values(gmap).forEach(g => { const r = rootOf(g.id); g.root = r ? r.id : g.id; g.side = (r && r.side) || (g.nature === 'Cr' ? 'L' : 'A'); });

  /* ── ledgers: one per name (case-insensitive) ── */
  const ledgers = {};
  const keyOf = name => clean(name).toUpperCase();
  const led = (name, groupId, extra) => {
    const nm = clean(name); if (!nm) return null;
    const k = keyOf(nm);
    if (!ledgers[k]) ledgers[k] = { name: nm, group: gmap[groupId] ? groupId : 'suspense', opening: 0, ...extra };
    else if (extra) Object.keys(extra).forEach(x => { if (ledgers[k][x] == null || ledgers[k][x] === '') ledgers[k][x] = extra[x]; });
    if (ledgers[k].group === 'suspense' && groupId && groupId !== 'suspense' && gmap[groupId]) ledgers[k].group = groupId;
    return ledgers[k].name;
  };

  // parties first so their names win
  const partyInfo = (o, kind, id) => {
    const cp = (o.contactPersons || []).find(p => p && (p.name || p.mobileNumber)) || {};
    return { kind, partyId: id, gstin: o.gstin || o.gst || '', state: o.state || '', city: o.city || '', pan: o.pan || o.panNo || '',
      phone: cp.mobileNumber || o.mobile || o.phone || '', email: cp.email || o.email || '', creditDays: n(o.creditDays || o.paymentTermsDays) || 0 };
  };
  deep(cid, 'Client').forEach(c => { if (c && c.clientId) led(c.clientName || c.companyName, 'sundry-debt', partyInfo(c, 'client', c.clientId)); });
  deep(cid, 'Vendor').forEach(v => { if (v && v.vendorId) led(v.vendorName || v.companyName, 'sundry-cred', partyInfo(v, 'vendor', v.vendorId)); });

  // ledger master (manual ledgers + opening balances)
  const master = readJson(path.join(coDir(cid, 'Ledger'), 'accounts.json'), []);
  const masterById = {};
  (Array.isArray(master) ? master : []).forEach(a => {
    if (!a || !a.name) return;
    masterById[a.id] = a;
    const nm = led(a.name, a.groupId, { masterId: a.id, kind: a.accountType || 'ledger' });
    const L = ledgers[keyOf(nm)];
    if (gmap[a.groupId]) L.group = a.groupId;   // the master's group is the user's choice — it wins
    L.masterId = a.id;
    const ob = n(a.openingBalance);
    if (ob) L.opening = r2(L.opening + ((a.openingBalanceNature || a.groupNature || 'Dr') === 'Cr' ? -ob : ob));
  });

  // banks + cash
  const banks = flat(cid, path.join('Accounts', 'Banks'));
  const bankName = {};
  banks.forEach(b => {
    const nm = `${clean(b.bankName) || 'Bank'}${b.accountNumber ? ` · ${String(b.accountNumber).slice(-4)}` : ''}`;
    bankName[String(b.bankId)] = led(nm, 'bank', { kind: 'bank', bankId: b.bankId, accountNumber: b.accountNumber || '', ifsc: b.ifscCode || '' });
    const ob = n(b.openingBalance);
    if (ob) { const L = ledgers[keyOf(nm)]; L.opening = r2(L.opening + ob); }
  });
  const CASH = led('Cash', 'cash', { kind: 'cash' });
  // cash mode → Cash; a bank mode saved without picking the bank → "Bank — not selected" (shows up to be fixed)
  const bankOf = p => (/cash/i.test(p.paymentMode || '') ? CASH
    : !p.bankId ? (p.paymentMode ? led('Bank — not selected', 'bank', { kind: 'bank' }) : CASH)
      : (bankName[String(p.bankId)] || led(`Bank ${p.bankId}`, 'bank', { kind: 'bank', bankId: p.bankId })));

  // fixed ledgers
  const SALES = led('Sales', 'direct-inc'), PURCH = led('Purchase', 'purchase');
  const SRET = led('Sales Returns & Discounts', 'direct-inc'), PRET = led('Purchase Returns', 'purchase');
  const OUT = { cgst: led('Output CGST', 'duties-taxes'), sgst: led('Output SGST', 'duties-taxes'), igst: led('Output IGST', 'duties-taxes') };
  const INP = { cgst: led('Input CGST', 'duties-taxes'), sgst: led('Input SGST', 'duties-taxes'), igst: led('Input IGST', 'duties-taxes') };
  const ROUND = led('Round Off', 'indirect-exp');

  /* a ledger used by a journal / payment by name only: find its group from the name */
  const guess = name => {
    const nm = clean(name); if (!nm) return null;
    if (ledgers[keyOf(nm)]) return ledgers[keyOf(nm)].name;
    if (/\btds\b|tax deducted/i.test(nm)) return led(nm, /payable|deducted by us/i.test(nm) ? 'duties-taxes' : 'loans-adv', { kind: 'tds' });
    if (/\b(gst|igst|cgst|sgst|tcs)\b/i.test(nm)) return led(nm, 'duties-taxes');
    if (/bank|a\/c no/i.test(nm)) return led(nm, 'bank', { kind: 'bank' });
    if (/^cash/i.test(nm)) return led(nm, 'cash', { kind: 'cash' });
    if (/salary|wages|bonus/i.test(nm)) return led(nm, 'salary-exp');
    if (/capital|drawings/i.test(nm)) return led(nm, 'capital');
    if (/loan/i.test(nm)) return led(nm, 'loans-liab');
    if (/discount|interest received|commission received|misc.* income/i.test(nm)) return led(nm, 'indirect-inc');
    if (/expense|exps|charges|rent|freight|transport|travel|fees|repair|electricity|telephone|printing|insurance/i.test(nm)) return led(nm, 'indirect-exp');
    return led(nm, 'suspense');
  };

  /* ── vouchers ── */
  const postings = [];
  const pending = {};
  const skip = (what) => { pending[what] = (pending[what] || 0) + 1; };
  const voucher = (v, lines) => {
    const ls = lines.filter(l => l && l.led && (r2(l.dr) || r2(l.cr))).map(l => ({ led: l.led, dr: r2(l.dr), cr: r2(l.cr) }));
    if (!ls.length) return;
    const diff = r2(ls.reduce((t, l) => t + l.dr - l.cr, 0));
    if (Math.abs(diff) >= 0.01) ls.push(diff > 0 ? { led: ROUND, dr: 0, cr: diff } : { led: ROUND, dr: -diff, cr: 0 });
    const date = String(v.date || v.fb || '').slice(0, 10);
    const { fb, ...vv } = v;
    ls.forEach((l, i) => postings.push({ ...vv, date, line: i, ...l, other: ls.filter(o => o.led !== l.led && (l.dr ? o.cr : o.dr)).map(o => o.led).slice(0, 3).join(', ') }));
  };
  const gstSplit = (b, out) => {
    const t = out ? OUT : INP;
    let c = n(b.totalCGST), s = n(b.totalSGST), ig = n(b.totalIGST);
    if (!c && !s && !ig && n(b.totalGST)) { if (b.gstType === 'intrastate') { c = s = n(b.totalGST) / 2; } else ig = n(b.totalGST); }
    return [[t.cgst, c], [t.sgst, s], [t.igst, ig]];
  };
  const dead = s => /cancel|reject|draft|void/i.test(String(s || ''));
  const okPay = s => /confirm|approv|posted|paid/i.test(String(s || ''));

  any(cid, 'SalesBills').forEach(b => {
    if (!b || b.type === 'purchase') return; if (dead(b.status)) return skip('Sales bills (draft / cancelled)');
    const party = led(b.partyName || b.billToName || 'Cash sales', 'sundry-debt', { kind: 'client', gstin: b.partyGstin || '', state: b.partyState || '' });
    voucher({ vt: 'Sales', no: b.billNo || b.billId, ref: b.orderNo || '', date: b.billDate, fb: b.createdAt, narr: `Sales bill ${b.billNo || b.billId}${b.orderNo ? ` · SO ${b.orderNo}` : ''}`, src: `sb:${b.billId}`, party },
      [{ led: party, dr: b.grandTotal }, { led: SALES, cr: b.subTotal }, ...gstSplit(b, true).map(([l, a]) => ({ led: l, cr: a }))]);
  });
  any(cid, 'PurchaseBills').forEach(b => {
    if (!b || b.type === 'sales') return; if (dead(b.status)) return skip('Purchase bills (draft / cancelled)');
    const party = led(b.partyName || 'Cash purchase', 'sundry-cred', { kind: 'vendor', gstin: b.partyGstin || '', state: b.partyState || '' });
    voucher({ vt: 'Purchase', no: b.vendorBillNo || b.billNo || b.billId, ref: b.orderNo || '', date: b.billDate, fb: b.createdAt, narr: `Purchase bill ${b.vendorBillNo || b.billNo || b.billId}${b.orderNo ? ` · PO ${b.orderNo}` : ''}`, src: `pb:${b.billId}`, party },
      [{ led: PURCH, dr: b.subTotal }, ...gstSplit(b, false).map(([l, a]) => ({ led: l, dr: a })), { led: party, cr: b.grandTotal }]);
  });

  flat(cid, 'Payments').forEach(p => {
    if (!p) return;
    const rec = p.type === 'receipt';
    if (!okPay(p.status)) return skip(rec ? 'Receipts (pending approval)' : 'Payments (pending approval)');
    const amt = n(p.amount); if (!amt) return;
    const pn = p.party || p.entityName || '';
    const party = p.entityType === 'client' ? led(pn, 'sundry-debt', { kind: 'client' })
      : p.entityType === 'vendor' ? led(pn, 'sundry-cred', { kind: 'vendor' })
        : p.entityType === 'ledger' && masterById[p.entityId] ? ledgers[keyOf(masterById[p.entityId].name)].name
          : (guess(pn) || led(rec ? 'Receipts — party not given' : 'Payments — party not given', 'suspense'));
    const bank = bankOf(p);
    const v = { vt: rec ? 'Receipt' : 'Payment', no: `${rec ? 'R' : 'P'}-${p.paymentId}`, ref: p.referenceNo || p.reference || '', date: p.date || p.transactionDate, fb: p.createdAt,
      narr: `${rec ? 'Received from' : 'Paid to'} ${pn}${p.paymentMode ? ` · ${p.paymentMode}` : ''}${p.orderNo ? ` · ${p.orderNo}` : ''}${p.notes ? ` · ${clean(p.notes)}` : ''}`,
      src: `pay:${p.paymentId}`, party, bankLine: `pay:${p.paymentId}`, mode: p.paymentMode || '' };
    voucher(v, rec ? [{ led: bank, dr: amt }, { led: party, cr: amt }] : [{ led: party, dr: amt }, { led: bank, cr: amt }]);
  });

  flat(cid, 'Expenses').forEach(e => {
    if (!e) return;
    if (!/approv|posted|confirm|paid/i.test(String(e.status || ''))) return skip('Expenses (pending approval)');
    const total = n(e.grandTotal || e.amount); if (!total) return;
    const base = n(e.amount) || total, gst = r2(total - base);
    const rcm = e.rcm ? r2(base * n(e.rcmRate) / 100) : 0;
    const head = led(e.expenseCategory || e.category || 'General Expenses', e.expenseType === 'order' ? 'direct-exp' : (/salary|wage/i.test(e.expenseCategory || '') ? 'salary-exp' : 'indirect-exp'));
    const mId = String(e.ledgerId || '').replace(/^L:/, '');
    const party = (masterById[mId] && ledgers[keyOf(masterById[mId].name)].name)
      || (e.vendorName ? led(e.vendorName, 'sundry-cred', { kind: 'vendor' }) : null)
      || (e.ledgerName ? guess(e.ledgerName) : null) || led('Expenses Payable', 'other-liab');
    voucher({ vt: 'Expense', no: `EXP-${e.expenseId}`, ref: e.invoiceNo || e.orderNo || '', date: e.date || e.expenseDate, fb: e.createdAt, narr: `${e.expenseCategory || 'Expense'}${e.description ? ` — ${clean(e.description)}` : ''}${e.orderNo ? ` · ${e.orderNo}` : ''}`, src: `exp:${e.expenseId}`, party, gstIn: gst },
      [{ led: head, dr: base }, gst > 0 ? { led: led('Input GST (expenses)', 'duties-taxes'), dr: gst } : null, { led: party, cr: total },
        // reverse charge: we owe the GST to the government and take the same as input credit
        ...(rcm > 0 ? [{ led: led('Input GST (RCM)', 'duties-taxes'), dr: rcm }, { led: led('GST Payable (RCM)', 'duties-taxes'), cr: rcm }] : [])]);
  });

  flat(cid, 'Journals').forEach(j => {
    if (!j) return; if (!/posted|approv/i.test(String(j.status || ''))) return skip('Journals (draft / not posted)');
    voucher({ vt: 'Journal', no: `J-${j.journalId}`, ref: j.refNo || j.orderNo || '', date: j.date, narr: clean(j.narration) || 'Journal', src: `jv:${j.journalId}` },
      (j.entries || []).map(x => ({ led: guess(x.ledger), dr: x.debit, cr: x.credit })));
  });

  const salesBills = {};
  any(cid, 'SalesBills').forEach(b => { if (b && b.billId) salesBills[b.billId] = b; });
  const noteGst = (note, out, billMap) => {
    const b = billMap[note.linkedBillId] || {};
    const t = out ? OUT : INP, g = n(note.totalGST);
    return b.gstType === 'intrastate' ? [[t.cgst, g / 2], [t.sgst, g / 2]] : [[t.igst, g]];
  };
  flat(cid, 'CreditNotes').forEach(c => {
    if (!c) return; if (!/approv|posted|confirm/i.test(String(c.status || ''))) return skip('Credit notes (draft / cancelled)');
    const party = led(c.clientName, 'sundry-debt', { kind: 'client' });
    voucher({ vt: 'Credit Note', no: c.cnNo || c.cnId, ref: c.billRef || '', date: c.date, narr: `${c.reason || 'Credit note'}${c.billRef ? ` · bill ${c.billRef}` : ''}`, src: `cn:${c.cnId}`, party },
      [{ led: SRET, dr: c.subTotal }, ...noteGst(c, true, salesBills).map(([l, a]) => ({ led: l, dr: a })), { led: party, cr: c.grandTotal }]);
  });
  const purBills = {};
  any(cid, 'PurchaseBills').forEach(b => { if (b && b.billId) purBills[b.billId] = b; });
  flat(cid, 'DebitNotes').forEach(d => {
    if (!d) return; if (!/approv|posted|confirm/i.test(String(d.status || ''))) return skip('Debit notes (draft / cancelled)');
    const party = led(d.vendorName, 'sundry-cred', { kind: 'vendor' });
    voucher({ vt: 'Debit Note', no: d.dnNo || d.dnId, ref: d.billRef || '', date: d.date, narr: `${d.reason || 'Debit note'}${d.billRef ? ` · bill ${d.billRef}` : ''}`, src: `dn:${d.dnId}`, party },
      [{ led: party, dr: d.grandTotal }, { led: PRET, cr: d.subTotal }, ...noteGst(d, false, purBills).map(([l, a]) => ({ led: l, cr: a }))]);
  });

  // double-entry vouchers made on the classic Ledger screen
  const vDir = path.join(coDir(cid, 'Ledger'), 'vouchers');
  const nameOfAcc = id => {
    if (masterById[id]) return ledgers[keyOf(masterById[id].name)].name;
    const m = /^(CL|VN)-(.+)$/.exec(id || '');
    if (m) { const L = Object.values(ledgers).find(l => String(l.partyId) === m[2] && l.kind === (m[1] === 'CL' ? 'client' : 'vendor')); if (L) return L.name; }
    return null;
  };
  if (fs.existsSync(vDir)) fs.readdirSync(vDir).filter(f => f.endsWith('.json')).forEach(f => {
    const v = readJson(path.join(vDir, f), null); if (!v) return;
    voucher({ vt: v.voucherType || 'Journal', no: v.id, ref: v.refNo || '', date: v.date, narr: clean(v.narration) || 'Ledger voucher', src: `lv:${v.id}` },
      (v.entries || []).map(x => ({ led: nameOfAcc(x.accountId) || guess(x.accountName || x.accountId), dr: x.dr, cr: x.cr })));
  });

  // security deposits kept back by clients (same as the classic ledger)
  deep(cid, 'Deposits').forEach(d => {
    if (!d || d.depositType !== 'Security' || !['active', 'released'].includes(d.status)) return;
    const party = led(d.customerName, 'sundry-debt', { kind: 'client' });
    voucher({ vt: 'Journal', no: d.depositId, ref: d.orderNo || '', date: d.startDate || d.createdAt, narr: `Security deposit kept by client${d.orderNo ? ` · ${d.orderNo}` : ''}`, src: `sd:${d.depositId}`, party },
      [{ led: led('Security Deposit with Clients', 'deposits'), dr: d.amount }, { led: party, cr: d.amount }]);
  });

  // salary sheets (HR → Payroll), booked on the last day of the month
  const salaryTds = [];
  const salDir = path.join(ROOT, 'Database', 'Companies', cid, 'HR', 'Salary');
  if (fs.existsSync(salDir)) fs.readdirSync(salDir).filter(f => /^\d{4}-\d{2}\.json$/.test(f)).forEach(f => {
    const sh = readJson(path.join(salDir, f), null); if (!sh || !(sh.rows || []).length) return;
    const [y, m] = sh.month.split('-').map(Number), end = `${sh.month}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;
    const sum = k => sh.rows.reduce((t, r) => t + n(r[k]), 0);
    voucher({ vt: 'Payroll', no: `SAL-${sh.month}`, ref: `${sh.rows.length} employees`, date: end, narr: `Salary for ${sh.month} — ${sh.rows.length} employee(s)`, src: `sal:${sh.month}` }, [
      { led: led('Salary & Wages', 'salary-exp'), dr: sum('gross') },
      { led: led('Salary Payable', 'employee-pay'), cr: sum('net') },
      { led: led('PF Payable', 'duties-taxes'), cr: sum('pf') }, { led: led('ESI Payable', 'duties-taxes'), cr: sum('esi') },
      { led: led('Professional Tax Payable', 'duties-taxes'), cr: sum('pt') },
      { led: led('TDS Payable on Salary (192)', 'duties-taxes', { kind: 'tds' }), cr: sum('tds') },
      { led: led('Staff Advances', 'loans-adv'), cr: sum('advance') }, { led: led('Other Salary Deductions', 'employee-pay'), cr: sum('otherDed') },
    ]);
    // salary TDS, one line per employee, for the TDS register
    sh.rows.filter(r => n(r.tds)).forEach(r => salaryTds.push({ date: end, section: '192', party: r.name, pan: r.pan || '', base: r2(r.gross), tds: r2(r.tds), month: sh.month }));
  });

  // fixed assets: purchase, depreciation each year to 31-Mar, disposal
  const assets = flat(cid, 'Assets').map(a => ({ ...a, schedule: depSchedule(a) }));
  assets.forEach(a => {
    const cost = n(a.purchaseAmount); if (!cost || !a.date) return;
    const head = led(a.category ? `${a.category} (Fixed Asset)` : 'Fixed Assets', 'fixed-assets', { kind: 'asset' });
    const from = a.paidFrom && a.paidFrom.startsWith('bank:') ? (bankName[a.paidFrom.slice(5)] || CASH)
      : a.paidFrom === 'cash' ? CASH : a.paidFrom === 'purchase' ? null
        : a.paidFrom && a.paidFrom.startsWith('vendor:') ? led(a.paidFrom.slice(7), 'sundry-cred', { kind: 'vendor' })
          : led('Capital Account', 'capital');
    // "already in a purchase bill" moves the cost from Purchase to the asset head instead of booking it twice
    voucher({ vt: 'Asset', no: `FA-${a.assetId}`, ref: a.assetName, date: a.date, narr: `Asset bought: ${a.assetName}${a.category ? ` (${a.category})` : ''}`, src: `fa:${a.assetId}` },
      [{ led: head, dr: cost }, { led: from || PURCH, cr: cost }]);
    a.schedule.forEach(y => {
      if (y.dep > 0) voucher({ vt: 'Depreciation', no: `DEP-${a.assetId}-${y.fy}`, ref: a.assetName, date: y.end, narr: `Depreciation ${y.fy} on ${a.assetName} @ ${a.depreciationRate || 0}% ${a.method === 'SLM' ? 'SLM' : 'WDV'}`, src: `fa:${a.assetId}` },
        [{ led: led('Depreciation', 'indirect-exp'), dr: y.dep }, { led: head, cr: y.dep }]);
    });
    const last = a.schedule[a.schedule.length - 1];
    if (a.status === 'disposed' && a.disposedOn && last && last.disposed) {
      const sale = n(a.saleAmount), wdv = last.disposedWdv, gain = r2(sale - wdv);
      const to = a.receivedIn && a.receivedIn.startsWith('bank:') ? (bankName[a.receivedIn.slice(5)] || CASH) : CASH;
      voucher({ vt: 'Asset', no: `FAS-${a.assetId}`, ref: a.assetName, date: a.disposedOn, narr: `Asset sold / disposed: ${a.assetName}`, src: `fa:${a.assetId}` },
        [{ led: to, dr: sale }, { led: head, cr: wdv }, gain >= 0 ? { led: led('Profit on Sale of Assets', 'indirect-inc'), cr: gain } : { led: led('Loss on Sale of Assets', 'indirect-exp'), dr: -gain }]);
    }
  });

  const brs = readJson(brsFile(cid), {});
  const groups = Object.values(gmap).map(({ id, name, nature, parent, root, side, isSystem }) => ({ id, name, nature, parent, root, side, isSystem: !!isSystem }));
  return {
    groups, ledgers: Object.values(ledgers), postings: postings.sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.no).localeCompare(String(b.no)) || a.line - b.line),
    pending, salaryTds, brs: brs && typeof brs === 'object' ? brs : {}, assets, banks: banks.map(b => ({ bankId: b.bankId, name: bankName[String(b.bankId)], openingBalance: n(b.openingBalance) })),
  };
}

/* depreciation per financial year (Apr–Mar) until the current year or the disposal.
   WDV: rate on the written-down value; SLM: rate on the cost. Half the rate in the year bought when used
   for less than 180 days in it (put to use after 3-Oct), as in the Income-tax rules. */
function depSchedule(a) {
  const cost = n(a.purchaseAmount), rate = n(a.depreciationRate) / 100;
  const start = String(a.useFrom || a.date || '').slice(0, 10);
  if (!cost || !start || !/^\d{4}-\d{2}-\d{2}$/.test(start)) return [];
  const fyStart = d => { const [y, m] = d.split('-').map(Number); return m >= 4 ? y : y - 1; };
  const today = new Date().toISOString().slice(0, 10);
  const stopAt = a.status === 'disposed' && a.disposedOn ? String(a.disposedOn).slice(0, 10) : '';
  const lastFy = fyStart(stopAt || today);
  const out = [];
  let wdv = cost;
  for (let y = fyStart(start); y <= lastFy && out.length < 60; y++) {
    const fy = `${y}-${String((y + 1) % 100).padStart(2, '0')}`, end = `${y + 1}-03-31`;
    const opening = r2(wdv), first = y === fyStart(start);
    const disposedHere = stopAt && fyStart(stopAt) === y;
    const half = first && start > `${y}-10-03`;
    let dep = 0;
    if (!disposedHere && rate > 0) dep = r2(Math.min(wdv, (a.method === 'SLM' ? cost : wdv) * rate * (half ? 0.5 : 1)));
    if (a.salvage) dep = r2(Math.max(0, Math.min(dep, wdv - n(a.salvage))));
    wdv = r2(wdv - dep);
    out.push({ fy, end, opening, addition: first ? cost : 0, dep, closing: disposedHere ? 0 : wdv, half, disposed: !!disposedHere, disposedWdv: disposedHere ? opening : 0 });
    if (first) out[out.length - 1].opening = 0;
  }
  return out;
}

router.get('/', (req, res) => {
  try {
    const cid = cidOf(req);
    if (!cid) return res.status(400).json({ error: 'companyId required' });
    res.json(loadBooks(cid));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/brs', (req, res) => {
  try {
    const cid = cidOf(req), { key, clearedOn } = req.body || {};
    if (!cid || !key) return res.status(400).json({ error: 'companyId and key required' });
    if (clearedOn && !/^\d{4}-\d{2}-\d{2}$/.test(clearedOn)) return res.status(400).json({ error: 'clearedOn must be yyyy-mm-dd' });
    const brs = readJson(brsFile(cid), {});
    if (clearedOn) brs[key] = clearedOn; else delete brs[key];
    fs.mkdirSync(path.dirname(brsFile(cid)), { recursive: true });
    saveJson(brsFile(cid), brs);
    res.json({ success: true, brs });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ledger master: add a ledger, or set the group / opening balance of any ledger (also an auto ledger like a
   client, a bank or an expense head — the master entry then decides its group in the books) */
router.post('/ledger', (req, res) => {
  try {
    const cid = cidOf(req);
    const name = clean(req.body?.name), groupId = String(req.body?.groupId || '');
    if (!cid || !name || !groupId) return res.status(400).json({ error: 'companyId, name and group are required' });
    const own = readJson(path.join(coDir(cid, 'Ledger'), 'groups.json'), []);
    const g = BASE_GROUPS.find(x => x.id === groupId) || (Array.isArray(own) ? own : []).find(x => x.id === groupId);
    if (!g) return res.status(400).json({ error: 'Unknown group' });
    const f = path.join(coDir(cid, 'Ledger'), 'accounts.json');
    const list = readJson(f, []);
    const now = new Date().toISOString();
    const ob = Math.abs(n(req.body.openingBalance)), obN = req.body.openingBalanceNature === 'Cr' ? 'Cr' : req.body.openingBalanceNature === 'Dr' ? 'Dr' : g.nature;
    let rec = list.find(a => clean(a.name).toUpperCase() === name.toUpperCase());
    if (rec) {
      if (req.body.onlyNew) return res.status(409).json({ error: 'A ledger with this name already exists' });
      Object.assign(rec, { groupId, groupName: g.name, groupNature: g.nature, updatedAt: now });
      if (req.body.openingBalance != null) Object.assign(rec, { openingBalance: ob, openingBalanceNature: obN });
    } else {
      const max = list.reduce((m, a) => Math.max(m, parseInt(String(a.id || '').replace(/\D/g, ''), 10) || 0), 0);
      rec = { id: `L${String(max + 1).padStart(4, '0')}`, name, groupId, groupName: g.name, groupNature: g.nature, openingBalance: ob, openingBalanceNature: obN,
        accountType: req.body.accountType || 'general', notes: req.body.notes || '', gstin: req.body.gstin || '', pan: req.body.pan || '', companyId: cid, createdAt: now, updatedAt: now };
      list.push(rec);
    }
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, JSON.stringify(list, null, 2));
    res.json({ success: true, account: rec });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
module.exports.loadBooks = loadBooks;
