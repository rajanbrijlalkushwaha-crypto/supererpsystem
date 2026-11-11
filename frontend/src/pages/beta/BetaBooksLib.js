/* Books & Reports — shared data + maths for Ledger, Chart of accounts, Trial balance, P&L, Balance sheet,
 * Cash / bank book, Ageing, TDS, GST returns and Fixed assets. The books come from /api/books (every posted
 * bill, receipt, payment, expense, journal and note as double-entry lines). Prints use the bordered list look. */
import { useEffect, useState } from 'react';
import axios from 'axios';
import * as XLSX from 'xlsx';
import { escHtml as esc, pageHtml as page, showPage, logoOf, nowText, headerHtml, dmy } from './BetaCertPrint';
import { brandLine } from '../../utils/printBranding';

export const r2 = v => Math.round((Number(v) || 0) * 100) / 100;
export const amt = v => (Number(v) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const amtZ = v => (Math.abs(r2(v)) < 0.005 ? '' : amt(v));
export const dc = v => (Math.abs(r2(v)) < 0.005 ? '' : `${amt(Math.abs(v))} ${v > 0 ? 'Dr' : 'Cr'}`);
export const today = () => new Date().toISOString().slice(0, 10);
export { dmy };

/* financial years (Apr–Mar) */
export const fyStartYear = d => { const s = String(d || today()); const y = +s.slice(0, 4), m = +s.slice(5, 7); return m >= 4 ? y : y - 1; };
export const fyRange = y => ({ from: `${y}-04-01`, to: `${y + 1}-03-31` });
export const fyName = y => `FY ${String(y).slice(2)}-${String(y + 1).slice(2)}`;
export const fyStartOf = d => `${fyStartYear(d)}-04-01`;
export function fyList(books) {
  const ys = new Set([fyStartYear(today())]);
  (books?.postings || []).forEach(p => { if (p.date && p.date >= '2000') ys.add(fyStartYear(p.date)); });
  return [...ys].sort((a, b) => b - a);
}

export function useBooks(companyId, reload) {
  const [books, setBooks] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    if (!companyId) return undefined;
    let live = true;
    setErr('');
    axios.get('/api/books', { params: { companyId } })
      .then(r => { if (live) setBooks(index(r.data)); })
      .catch(e => { if (live) { setErr(e.response?.data?.error || 'Could not load the books.'); setBooks(index({ groups: [], ledgers: [], postings: [] })); } });
    return () => { live = false; };
  }, [companyId, reload]);
  return { books, err };
}

/* lookups: group by id, ledger by name, the group path of each ledger, lines per ledger */
const ORDER = ['capital', 'loans-liab', 'curr-liab', 'fixed-assets', 'curr-assets', 'suspense', 'direct-inc', 'indirect-inc', 'purchase', 'direct-exp', 'indirect-exp'];
export const PL_SIDES = ['I', 'II', 'E', 'IE'];
function index(b) {
  const groups = b.groups || [];
  const g = {}; groups.forEach(x => { g[x.id] = { ...x, kids: [] }; });
  groups.forEach(x => { if (x.parent && g[x.parent]) g[x.parent].kids.push(x.id); });
  const roots = groups.filter(x => !x.parent || !g[x.parent]).map(x => x.id)
    .sort((a, c) => (ORDER.indexOf(a) + 1 || 99) - (ORDER.indexOf(c) + 1 || 99) || g[a].name.localeCompare(g[c].name));
  Object.values(g).forEach(x => x.kids.sort((a, c) => g[a].name.localeCompare(g[c].name)));
  const L = {}; (b.ledgers || []).forEach(l => { L[l.name] = { ...l }; });
  // the virtual ledgers that make the books balance
  const opening = (b.ledgers || []).reduce((t, l) => t + (Number(l.opening) || 0), 0);
  if (Math.abs(r2(opening)) >= 0.01) L['Difference in opening balances'] = { name: 'Difference in opening balances', group: 'suspense', opening: r2(-opening), kind: 'virtual' };
  L['Profit & Loss A/c'] = { name: 'Profit & Loss A/c', group: g.reserves ? 'reserves' : 'capital', opening: 0, kind: 'pl' };
  const byLed = {};
  (b.postings || []).forEach(p => { (byLed[p.led] = byLed[p.led] || []).push(p); });
  const side = name => g[L[name]?.group]?.side || 'X';
  return { ...b, g, roots, L, byLed, side, isPL: name => PL_SIDES.includes(side(name)) };
}
/* ledgers under a group (with its sub-groups) */
export function inGroup(books, ledName, groupId) {
  let id = books.L[ledName]?.group, k = 0;
  while (id && k++ < 20) { if (id === groupId) return true; id = books.g[id]?.parent; }
  return false;
}

/* balances for a period: opening (as at `from`), debit, credit, closing — signed, Dr = +.
   Income / expense ledgers start each year at zero; earlier years' profit sits in "Profit & Loss A/c". */
export function balances(books, from, to) {
  const fyFrom = fyStartOf(from || today());
  const out = {};
  Object.values(books.L).forEach(l => { out[l.name] = { name: l.name, group: l.group, opening: books.isPL(l.name) ? 0 : (Number(l.opening) || 0), dr: 0, cr: 0 }; });
  let plCarry = 0;
  (books.postings || []).forEach(p => {
    const o = out[p.led]; if (!o) return;
    const d = p.date || '';
    if (to && d > to) return;
    if (from && d < from) {
      if (books.isPL(p.led)) { if (d >= fyFrom) o.opening += p.dr - p.cr; else plCarry += p.dr - p.cr; } else o.opening += p.dr - p.cr;
    } else { o.dr += p.dr; o.cr += p.cr; }
  });
  out['Profit & Loss A/c'].opening += plCarry;
  Object.values(out).forEach(o => { o.opening = r2(o.opening); o.dr = r2(o.dr); o.cr = r2(o.cr); o.closing = r2(o.opening + o.dr - o.cr); });
  return out;
}

/* group tree with rolled-up totals: rows [{ type:'g'|'l', id, name, depth, opening, dr, cr, closing }] */
export function groupRows(books, bal, { roots, withLedgers = true, keep = () => true } = {}) {
  const rows = [];
  const sum = id => {
    const g = books.g[id];
    const t = { opening: 0, dr: 0, cr: 0, closing: 0 };
    const leds = Object.values(bal).filter(b => b.group === id && keep(b)).sort((a, c) => a.name.localeCompare(c.name));
    leds.forEach(b => { t.opening += b.opening; t.dr += b.dr; t.cr += b.cr; t.closing += b.closing; });
    const kids = g.kids.map(k => sum(k));
    kids.forEach(k => { ['opening', 'dr', 'cr', 'closing'].forEach(f => { t[f] += k.t[f]; }); });
    return { id, g, t, leds, kids };
  };
  const walk = (node, depth) => {
    const empty = !node.leds.some(b => b.opening || b.dr || b.cr) && !node.kids.some(k => k.t.opening || k.t.dr || k.t.cr);
    if (empty) return;
    rows.push({ type: 'g', id: node.id, name: node.g.name, depth, ...node.t });
    node.kids.forEach(k => walk(k, depth + 1));
    if (withLedgers) node.leds.filter(b => b.opening || b.dr || b.cr).forEach(b => rows.push({ type: 'l', id: b.name, name: b.name, depth: depth + 1, opening: b.opening, dr: b.dr, cr: b.cr, closing: b.closing }));
  };
  (roots || books.roots).forEach(id => { if (books.g[id]) walk(sum(id), 0); });
  return rows;
}
export const groupTotal = (books, bal, id) => Object.values(bal).filter(b => inGroup(books, b.name, id)).reduce((t, b) => ({ opening: t.opening + b.opening, dr: t.dr + b.dr, cr: t.cr + b.cr, closing: t.closing + b.closing }), { opening: 0, dr: 0, cr: 0, closing: 0 });

/* profit & loss for a period */
export function profitLoss(books, from, to) {
  const bal = balances(books, from, to);
  const mv = b => b.dr - b.cr;   // movement in the period, Dr = +
  const part = side => books.roots.filter(id => books.g[id].side === side);
  const total = side => r2(part(side).reduce((t, id) => t + Object.values(bal).filter(b => inGroup(books, b.name, id)).reduce((s, b) => s + mv(b), 0), 0));
  const I = -total('I'), E = total('E'), II = -total('II'), IE = total('IE');
  const gross = r2(I - E), net = r2(gross + II - IE);
  const plBal = {}; Object.values(bal).forEach(b => { plBal[b.name] = { ...b, opening: 0, closing: r2(mv(b)) }; });
  return { bal: plBal, I, E, II, IE, gross, net, part };
}

/* balance sheet as on a date: closing balances, earlier years' profit + this year's profit */
export function balanceSheet(books, asOn) {
  const fy = fyStartOf(asOn);
  const bal = balances(books, fy, asOn);          // opening at FY start already carries earlier profit into P&L A/c
  Object.values(bal).forEach(b => { if (books.isPL(b.name)) b.closing = 0; });
  const pl = profitLoss(books, fy, asOn);
  bal['Profit & Loss A/c'].closing = r2(bal['Profit & Loss A/c'].closing - pl.net);   // profit = credit
  return { bal, pl, fy };
}

/* ledger statement lines with running balance */
export function statement(books, name, from, to) {
  const bal = balances(books, from, to)[name] || { opening: 0 };
  let run = bal.opening;
  const lines = (books.byLed[name] || []).filter(p => (!from || p.date >= from) && (!to || p.date <= to))
    .map(p => { run = r2(run + p.dr - p.cr); return { ...p, run }; });
  return { opening: bal.opening, dr: bal.dr || 0, cr: bal.cr || 0, closing: r2(run), lines };
}
/* all lines of one voucher (for the drill-down under a ledger line) */
export const voucherLines = (books, p) => (books.postings || []).filter(x => x.src === p.src && x.no === p.no);

/* ageing — bills settled first-in-first-out by receipts / payments / notes; `kind` client | vendor */
export const BUCKETS = [[0, 30, '0–30 days'], [31, 60, '31–60'], [61, 90, '61–90'], [91, 180, '91–180'], [181, 1e9, 'Over 180']];
export function ageing(books, kind, asOn) {
  const grp = kind === 'client' ? 'sundry-debt' : 'sundry-cred';
  const sign = kind === 'client' ? 1 : -1;   // a client bill is a debit, a vendor bill a credit
  const days = d => Math.max(0, Math.round((new Date(asOn) - new Date(d || asOn)) / 86400000));
  const out = [];
  Object.values(books.L).filter(l => inGroup(books, l.name, grp)).forEach(l => {
    const bills = [], pays = [];
    const ob = sign * (Number(l.opening) || 0);
    if (ob > 0) bills.push({ no: 'Opening', date: '', amount: ob, left: ob, vt: 'Opening' }); else if (ob < 0) pays.push({ left: -ob });
    (books.byLed[l.name] || []).filter(p => p.date <= asOn).forEach(p => {
      const v = sign * (p.dr - p.cr);
      if (v > 0) bills.push({ no: p.no, date: p.date, amount: v, left: v, vt: p.vt, ref: p.ref }); else if (v < 0) pays.push({ left: -v });
    });
    let i = 0;
    pays.forEach(pm => { while (pm.left > 0.004 && i < bills.length) { const x = Math.min(pm.left, bills[i].left); bills[i].left = r2(bills[i].left - x); pm.left = r2(pm.left - x); if (bills[i].left <= 0.004) i++; } });
    const open = bills.filter(b => b.left > 0.004).map(b => ({ ...b, days: b.date ? days(b.date) : 9999 }));
    const advance = r2(pays.reduce((t, p) => t + p.left, 0));
    if (!open.length && !advance) return;
    const bk = BUCKETS.map(([a, z]) => r2(open.filter(b => b.days >= a && b.days <= z).reduce((t, b) => t + b.left, 0)));
    const due = r2(open.reduce((t, b) => t + b.left, 0));
    out.push({ name: l.name, gstin: l.gstin || '', city: l.city || '', phone: l.phone || '', bills: open, bk, due, advance, net: r2(due - advance), oldest: open.length ? Math.max(...open.map(b => b.days)) : 0 });
  });
  return out.sort((a, b) => b.net - a.net);
}

/* TDS lines: any ledger named TDS; receivable = deducted by clients from our bills, payable = deducted by us */
export function tdsLines(books, from, to) {
  const tdsLeds = Object.values(books.L).filter(l => l.kind === 'tds' || /\btds\b|tax deducted/i.test(l.name));
  const out = [];
  tdsLeds.forEach(l => {
    const payable = /payable|deducted by us|192/i.test(l.name) || books.g[l.group]?.root === 'curr-liab';
    (books.byLed[l.name] || []).filter(p => p.date >= from && p.date <= to).forEach(p => {
      const vl = voucherLines(books, p).filter(x => x.led !== l.name);
      const party = (vl.find(x => books.L[x.led] && ['client', 'vendor'].includes(books.L[x.led].kind)) || vl[0] || {}).led || '';
      const sec = (/\b19[2-6][A-Z]{0,2}\b/i.exec(`${p.narr} ${l.name}`) || [])[0] || (payable ? '' : '');
      out.push({ date: p.date, no: p.no, vt: p.vt, narr: p.narr, ledger: l.name, party, pan: books.L[party]?.pan || '', section: sec.toUpperCase(), payable,
        amount: r2(payable ? p.cr - p.dr : p.dr - p.cr), q: quarterOf(p.date) });
    });
  });
  (books.salaryTds || []).filter(s => s.date >= from && s.date <= to).forEach(s => out.push({ date: s.date, no: `SAL-${s.month}`, vt: 'Payroll', narr: `Salary ${s.month} (gross ₹ ${amt(s.base)})`, ledger: 'TDS Payable on Salary (192)', party: s.party, pan: s.pan, section: '192', payable: true, amount: s.tds, q: quarterOf(s.date), salary: true }));
  return out.sort((a, b) => a.date.localeCompare(b.date));
}
export const quarterOf = d => { const m = +String(d).slice(5, 7); return m >= 4 && m <= 6 ? 'Q1' : m <= 9 && m >= 7 ? 'Q2' : m >= 10 ? 'Q3' : 'Q4'; };

/* ── prints: bordered A4 report like the other Beta lists ── */
const REP_CSS = `
.rep { margin-top:6px; } .rep th { background:#E9E9E9; border:0.6pt solid #000; padding:4px; font-size:7.6pt; text-transform:uppercase; white-space:nowrap; }
.rep td { border-left:0.6pt solid #000; border-right:0.6pt solid #000; padding:2.5px 5px; font-size:8pt; vertical-align:top; }
.rep tbody tr:last-child td { border-bottom:0.6pt solid #000; }
.rep tr.g td { font-weight:bold; } .rep tr.g1 td { font-weight:bold; background:#F2F2F2; border-top:0.6pt solid #000; }
.rep tr.tot td { background:#E9E9E9; font-weight:bold; border:0.6pt solid #000; } .rep tr.sub td { font-style:italic; }
.rep .r { text-align:right; white-space:nowrap; } .rep .c { text-align:center; }
.note { font-size:7.4pt; margin-top:5px; color:#333; }`;
/* heads: [[label, width, 'r'|'c'|'']] ; rows: [{ c: [cells], cls, pad }] */
export async function printReport({ title, kv = [], heads, rows, note, company, user, landscape }) {
  const co = company || {}, logo = await logoOf(co);
  const body = rows.map(r => `<tr class="${r.cls || ''}">${r.c.map((v, i) => `<td class="${heads[i]?.[2] || ''}"${i === 0 && r.pad ? ` style="padding-left:${5 + r.pad * 12}px"` : ''}>${esc(v == null || v === '' ? '' : v)}</td>`).join('')}</tr>`).join('');
  showPage(page(title, REP_CSS, `
${headerHtml(co, logo, esc(title), [...kv.map(([k, v]) => [esc(k), esc(v)]), ['Printed', esc(nowText())]])}
<table class="rep"><colgroup>${heads.map(h => `<col${h[1] ? ` style="width:${h[1]}"` : ''}>`).join('')}</colgroup>
<thead><tr>${heads.map(h => `<th class="${h[2] || ''}">${esc(h[0])}</th>`).join('')}</tr></thead>
<tbody>${body || `<tr><td colspan="${heads.length}" class="c">Nothing to show.</td></tr>`}</tbody></table>
${note ? `<div class="note">${esc(note)}</div>` : ''}
<div class="foot"><span>${brandLine(user)}</span><span>${esc(co.companyName || '')}</span></div>`, landscape));
}

/* Excel: sheets = [{ name, rows: [[...]], widths: [..] }] */
export function excel(file, sheets) {
  const wb = XLSX.utils.book_new();
  sheets.forEach(s => {
    const ws = XLSX.utils.aoa_to_sheet(s.rows);
    if (s.widths) ws['!cols'] = s.widths.map(w => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, ws, String(s.name).slice(0, 31));
  });
  XLSX.writeFile(wb, `${file}_${today()}.xlsx`);
}

/* styles shared by the report screens — teal heads, vertical lines only */
export const BK_CSS = `
.bk-wrap { flex:1; min-height:0; overflow:auto; background:#fff; }
.bk { width:100%; border-collapse:separate; border-spacing:0; font-size:12px; font-variant-numeric:tabular-nums; }
.bk th { position:sticky; top:0; z-index:2; background:#D4EBEE; color:#000; font-weight:700; font-size:11px; text-align:left; padding:0 8px; height:30px; border-right:1px solid #B9D0D3; border-bottom:1px solid #A9CDD2; white-space:nowrap; }
.bk td { padding:0 8px; height:26px; border-right:1px solid #D5E3E5; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:420px; color:#101828; }
.bk .r { text-align:right; } .bk th.r { text-align:right; } .bk .c { text-align:center; }
.bk tr.g td { font-weight:700; color:#03444f; } .bk tr.g0 td { background:#F2F8F8; font-weight:800; color:#03444f; }
.bk tr.l { cursor:pointer; } .bk tr.l:hover td { background:#F0F7F8; } .bk tr.sel td { background:#D4EBEE !important; }
.bk tr.sub td { color:#475467; font-size:11.5px; background:#FAFCFC; }
.bk tfoot td { position:sticky; bottom:0; background:#D4EBEE; font-weight:800; border-top:1px solid #A9CDD2; color:#03444f; }
.bk tr.tt td { background:#E6F2F3; font-weight:800; color:#03444f; border-top:1px solid #B9D0D3; }
.bk td.neg { color:#B42318; } .bk .mut { color:#98A2B3; }
.bk input.bd { height:22px; border:1px solid #C9D7DA; border-radius:4px; font:12px Inter, Arial, sans-serif; padding:0 4px; width:128px; }
.bk-bar { display:flex; align-items:center; gap:0; background:#fff; border-bottom:1px solid #DCE6E8; flex-shrink:0; flex-wrap:nowrap; overflow-x:auto; }
.bk-bar .ac-seg { border-bottom:0; flex-shrink:0; } .bk-bar .ac-sum { border-bottom:0; flex-wrap:nowrap; } .bk-bar .ac-sum div { white-space:nowrap; }
.bk-bar label { display:flex; align-items:center; gap:5px; font-size:12px; color:#344054; padding:0 12px; white-space:nowrap; cursor:pointer; }
.bk-info { padding:6px 12px; font-size:11.5px; color:#B54708; background:#FFFAEB; border-bottom:1px solid #FEDF89; flex-shrink:0; }
.bk-info.ok { color:#067647; background:#ECFDF3; border-color:#ABEFC6; }
.bk-two { display:grid; grid-template-columns:1fr 1fr; gap:0; } .bk-two > div { min-width:0; border-right:1px solid #DCE6E8; }
.bk-form { display:grid; grid-template-columns:repeat(4, minmax(0, 1fr)); gap:10px 14px; padding:14px 16px; background:#fff; border-bottom:1px solid #DCE6E8; }
.bk-form label { display:flex; flex-direction:column; gap:4px; font-size:11px; font-weight:600; color:#475467; }
.bk-form input, .bk-form select { height:32px; border:1px solid #C9D7DA; border-radius:4px; padding:0 8px; font:12.5px Inter, Arial, sans-serif; background:#fff; }
.bk-form .act { grid-column:1 / -1; display:flex; gap:8px; justify-content:flex-end; }
@media (max-width:900px) { .bk-two { grid-template-columns:1fr; } .bk-form { grid-template-columns:1fr 1fr; } }
`;
