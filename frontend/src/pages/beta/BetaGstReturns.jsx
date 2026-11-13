/* Beta — GST returns from the posted bills: GSTR-1 (B2B, B2C large, B2C small, credit notes, HSN summary,
 * documents issued), GSTR-3B (outward tax, ITC with the set-off order, tax to pay in cash) and the purchase
 * register to match with GSTR-2B. Excel in the GSTR-1 offline-tool sheet layout. */
import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import { useCompany } from '../../context/CompanyContext';
import { useAuth } from '../../context/AuthContext';
import { Svg } from '../../components/ui/Icon';
import { CSS as SALES_CSS } from './BetaSales';
import { PX_CSS } from './BetaPurchaseParts';
import { ACC_CSS } from './BetaAccKit';
import { BK_CSS, fyName, fyRange, fyStartYear, today, dmy, amt, amtZ, r2, printReport, excel } from './BetaBooksLib';

const STATES = { '01': 'Jammu & Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab', '04': 'Chandigarh', '05': 'Uttarakhand', '06': 'Haryana', '07': 'Delhi', '08': 'Rajasthan', '09': 'Uttar Pradesh',
  10: 'Bihar', 11: 'Sikkim', 12: 'Arunachal Pradesh', 13: 'Nagaland', 14: 'Manipur', 15: 'Mizoram', 16: 'Tripura', 17: 'Meghalaya', 18: 'Assam', 19: 'West Bengal', 20: 'Jharkhand',
  21: 'Odisha', 22: 'Chhattisgarh', 23: 'Madhya Pradesh', 24: 'Gujarat', 26: 'Dadra & Nagar Haveli and Daman & Diu', 27: 'Maharashtra', 29: 'Karnataka', 30: 'Goa', 31: 'Lakshadweep',
  32: 'Kerala', 33: 'Tamil Nadu', 34: 'Puducherry', 35: 'Andaman & Nicobar Islands', 36: 'Telangana', 37: 'Andhra Pradesh', 38: 'Ladakh', 97: 'Other Territory' };
const norm = s => String(s || '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z]/g, '');
const CODE_BY_NAME = Object.fromEntries(Object.entries(STATES).map(([c, nm]) => [norm(nm), String(c).padStart(2, '0')]));
Object.assign(CODE_BY_NAME, { orissa: '21', pondicherry: '34', jammuandkashmir: '01', damananddiu: '26', dadraandnagarhaveli: '26', uttaranchal: '05', newdelhi: '07' });
const GSTIN_RE = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const posOf = (gstin, state) => { const g = String(gstin || '').trim().toUpperCase(); if (GSTIN_RE.test(g)) return g.slice(0, 2); return CODE_BY_NAME[norm(state)] || ''; };
const posText = c => (c ? `${c}-${STATES[+c] || STATES[c] || ''}` : '');
const B2CL_LIMIT = 100000;   // inter-state B2C invoices above ₹1 lakh go invoice-wise (from Aug 2024)
const dead = s => /cancel|reject|draft|void/i.test(String(s || ''));
const MONTHS = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'];

/* one line per bill per GST rate */
function rateLines(b) {
  const by = {};
  (b.items || []).forEach(it => {
    const rt = Number(it.gstPct ?? it.gstPercent ?? it.gst) || 0, k = String(rt);
    const x = by[k] = by[k] || { rate: rt, taxable: 0, igst: 0, cgst: 0, sgst: 0 };
    const tx = Number(it.taxable) || (Number(it.qty) || 0) * (Number(it.rate) || 0);
    x.taxable += tx;
    if (it.igst != null || it.cgst != null) { x.igst += Number(it.igst) || 0; x.cgst += Number(it.cgst) || 0; x.sgst += Number(it.sgst) || 0; }
    else if (b.gstType === 'intrastate') { x.cgst += tx * rt / 200; x.sgst += tx * rt / 200; } else x.igst += tx * rt / 100;
  });
  let out = Object.values(by);
  if (!out.length) out = [{ rate: b.subTotal ? r2((Number(b.totalGST) || 0) / b.subTotal * 100) : 0, taxable: Number(b.subTotal) || 0, igst: Number(b.totalIGST) || 0, cgst: Number(b.totalCGST) || 0, sgst: Number(b.totalSGST) || 0 }];
  return out.map(x => ({ ...x, taxable: r2(x.taxable), igst: r2(x.igst), cgst: r2(x.cgst), sgst: r2(x.sgst) }));
}
/* GST set-off (sec. 49 / rule 88A): IGST credit first (IGST → CGST → SGST), then CGST (CGST → IGST), then SGST (SGST → IGST) */
function setOff(liab, itc) {
  const L = { ...liab }, C = { ...itc }, used = [];
  const use = (from, to) => { const x = r2(Math.min(C[from], L[to])); if (x > 0) { C[from] = r2(C[from] - x); L[to] = r2(L[to] - x); used.push([from, to, x]); } };
  use('igst', 'igst'); use('igst', 'cgst'); use('igst', 'sgst');
  use('cgst', 'cgst'); use('cgst', 'igst');
  use('sgst', 'sgst'); use('sgst', 'igst');
  return { cash: L, carry: C, used };
}

export default function BetaGstReturns() {
  const { selectedCompany } = useCompany() || {};
  const { user } = useAuth() || {};
  const companyId = selectedCompany?.companyId;
  const [d, setD] = useState(null);
  const [slot, setSlot] = useState(null);
  const thisFy = fyStartYear(today());
  const last = new Date(); last.setDate(1); last.setMonth(last.getMonth() - 1);   // last month is the usual return
  const [fy, setFy] = useState(() => fyStartYear(last.toISOString().slice(0, 10)));
  const [mon, setMon] = useState(() => { const m = last.getMonth(); return String(m >= 3 ? m - 3 : m + 9); });
  const [tab, setTab] = useState('r1');
  const [sec, setSec] = useState('b2b');
  useEffect(() => {
    if (!companyId) return;
    const get = (u, p = {}) => axios.get(u, { params: { companyId, ...p } }).then(r => (Array.isArray(r.data) ? r.data : [])).catch(() => []);
    Promise.all([get('/api/bills', { type: 'sales' }), get('/api/bills', { type: 'purchase' }), get('/api/accounts/credit-notes'), get('/api/accounts/debit-notes'), get('/api/accounts/expenses'), get('/api/clients')])
      .then(([sb, pb, cn, dn, ex, cl]) => setD({ sb, pb, cn, dn, ex, cl }));
  }, [companyId]);
  const { from, to } = useMemo(() => {
    const r = fyRange(+fy);
    if (mon === '' || mon === 'all') return r;
    if (mon.startsWith('q')) { const q = +mon.slice(1); const y = q === 4 ? +fy + 1 : +fy; const m0 = q === 4 ? 1 : 1 + q * 3; return { from: `${y}-${String(m0).padStart(2, '0')}-01`, to: `${y}-${String(m0 + 2).padStart(2, '0')}-${new Date(y, m0 + 2, 0).getDate()}` }; }
    const m = +mon, y = m >= 9 ? +fy + 1 : +fy, mm = ((m + 3) % 12) + 1;
    return { from: `${y}-${String(mm).padStart(2, '0')}-01`, to: `${y}-${String(mm).padStart(2, '0')}-${new Date(y, mm, 0).getDate()}` };
  }, [fy, mon]);
  const period = mon === 'all' ? fyName(+fy) : mon.startsWith('q') ? `Q${mon.slice(1)} ${fyName(+fy)}` : `${MONTHS[+mon]} ${mon >= 9 ? +fy + 1 : fy}`;
  const R = useMemo(() => (d ? build(d, from, to) : null), [d, from, to]);
  const fys = [thisFy, thisFy - 1, thisFy - 2, thisFy - 3];
  return (
    <div className="sb">
      <style>{SALES_CSS + PX_CSS + ACC_CSS + BK_CSS}</style>
      <div className="sb-tabs" role="tablist">
        {[['r1', 'GSTR-1'], ['r3b', 'GSTR-3B'], ['pr', 'Purchase register (2B)']].map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={tab === k} className={`sb-tab${tab === k ? ' on' : ''}`} onClick={() => setTab(k)}>{l}</button>)}
        <div className="sb-slot" ref={setSlot} />
      </div>
      {slot && createPortal(<>
        <select className="sb-search" style={{ width: 112 }} value={fy} onChange={e => setFy(+e.target.value)} aria-label="Financial year">{fys.map(y => <option key={y} value={y}>{fyName(y)}</option>)}</select>
        <select className="sb-search" style={{ width: 140 }} value={mon} onChange={e => setMon(e.target.value)} aria-label="Return period">
          {MONTHS.map((m, i) => <option key={m} value={String(i)}>{m} {i >= 9 ? +fy + 1 : fy}</option>)}
          <option value="q1">Q1 (Apr–Jun)</option><option value="q2">Q2 (Jul–Sep)</option><option value="q3">Q3 (Oct–Dec)</option><option value="q4">Q4 (Jan–Mar)</option><option value="all">Whole year</option>
        </select>
      </>, slot)}
      {!R ? <div className="sb-empty" style={{ padding: 30 }}>Loading bills…</div>
        : tab === 'r1' ? <R1 R={R} sec={sec} setSec={setSec} slot={slot} period={period} company={selectedCompany} user={user} />
          : tab === 'r3b' ? <R3B R={R} slot={slot} period={period} company={selectedCompany} user={user} />
            : <PurchaseReg R={R} slot={slot} period={period} company={selectedCompany} user={user} />}
    </div>
  );
}

function build(d, from, to) {
  const inP = x => { const s = String(x || '').slice(0, 10); return s >= from && s <= to; };
  const clientGst = {}; d.cl.forEach(c => { const nm = String(c.clientName || c.companyName || '').trim().toUpperCase(); if (nm) clientGst[nm] = c.gstin || c.gst || ''; });
  const sales = d.sb.filter(b => b.type !== 'purchase' && !dead(b.status) && inP(b.billDate || b.createdAt));
  const b2b = [], b2cl = [], b2csMap = {}, nil = { taxable: 0 };
  const hsn = {};
  const out = { taxable: 0, igst: 0, cgst: 0, sgst: 0 };
  sales.forEach(b => {
    const g = String(b.partyGstin || '').trim().toUpperCase(), reg = GSTIN_RE.test(g);
    const pos = posOf(g, b.shipToState || b.partyState || b.billToState);
    const inter = b.gstType === 'interstate';
    rateLines(b).forEach(x => {
      const row = { gstin: g, party: b.partyName, no: b.billNo || b.billId, date: b.billDate, value: r2(b.grandTotal), pos, ...x, reverse: 'N', irn: b.irnNo || '' };
      if (x.rate === 0) nil.taxable += x.taxable;
      if (reg) b2b.push(row);
      else if (inter && Number(b.grandTotal) > B2CL_LIMIT) b2cl.push(row);
      else { const k = `${pos}|${x.rate}`; const s = b2csMap[k] = b2csMap[k] || { pos, rate: x.rate, taxable: 0, igst: 0, cgst: 0, sgst: 0, type: inter ? 'Inter-state' : 'Intra-state' }; ['taxable', 'igst', 'cgst', 'sgst'].forEach(f => { s[f] = r2(s[f] + x[f]); }); }
      if (x.rate > 0) ['taxable', 'igst', 'cgst', 'sgst'].forEach(f => { out[f] += x[f]; });
    });
    (b.items || []).forEach(it => {
      const rt = Number(it.gstPct ?? it.gstPercent) || 0, code = String(it.hsnCode || it.hsn || '').trim() || '—', k = `${code}|${rt}`;
      const h = hsn[k] = hsn[k] || { hsn: code, desc: it.description || it.itemName || '', uqc: String(it.unit || 'NOS').toUpperCase(), qty: 0, rate: rt, taxable: 0, igst: 0, cgst: 0, sgst: 0 };
      const tx = Number(it.taxable) || (Number(it.qty) || 0) * (Number(it.rate) || 0);
      h.qty += Number(it.qty) || 0; h.taxable += tx;
      if (it.igst != null || it.cgst != null) { h.igst += Number(it.igst) || 0; h.cgst += Number(it.cgst) || 0; h.sgst += Number(it.sgst) || 0; } else if (b.gstType === 'intrastate') { h.cgst += tx * rt / 200; h.sgst += tx * rt / 200; } else h.igst += tx * rt / 100;
    });
  });
  // credit notes to registered clients (CDNR) and others (CDNUR / reduce B2CS)
  const coCode = posOf('', (d.sb.find(b => b.companyState) || {}).companyState);
  const billById = Object.fromEntries(d.sb.map(b => [b.billId, b]));
  const cdnr = [], cdnur = [];
  const cnTot = { taxable: 0, igst: 0, cgst: 0, sgst: 0 };
  d.cn.filter(c => /approv|posted|confirm/i.test(String(c.status || '')) && inP(c.date)).forEach(c => {
    const b = billById[c.linkedBillId] || {};
    const g = String(b.partyGstin || clientGst[String(c.clientName || '').trim().toUpperCase()] || '').toUpperCase();
    const intra = b.gstType ? b.gstType === 'intrastate' : (!!g && g.slice(0, 2) === coCode);
    const gst = Number(c.totalGST) || 0, rate = c.subTotal ? r2(gst / c.subTotal * 100) : 0;
    const row = { gstin: g, party: c.clientName, no: c.cnNo || c.cnId, date: c.date, bill: c.billRef || '', value: r2(c.grandTotal), rate, taxable: r2(c.subTotal), igst: intra ? 0 : r2(gst), cgst: intra ? r2(gst / 2) : 0, sgst: intra ? r2(gst / 2) : 0, pos: posOf(g, b.shipToState || b.partyState) };
    (GSTIN_RE.test(g) ? cdnr : cdnur).push(row);
    ['taxable', 'igst', 'cgst', 'sgst'].forEach(f => { cnTot[f] += row[f]; });
  });
  // documents issued: invoice series
  const nos = sales.map(b => String(b.billNo || '')).filter(Boolean).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const docs = [{ nature: 'Invoices for outward supply', from: nos[0] || '', to: nos[nos.length - 1] || '', total: nos.length, cancelled: d.sb.filter(b => b.type !== 'purchase' && /cancel/i.test(b.status || '') && inP(b.billDate)).length },
    { nature: 'Credit notes', from: (cdnr[0] || cdnur[0] || {}).no || '', to: ([...cdnr, ...cdnur].slice(-1)[0] || {}).no || '', total: cdnr.length + cdnur.length, cancelled: 0 }];
  // inward: purchase bills + expenses with GST (ITC), less debit notes
  const purch = d.pb.filter(b => b.type !== 'sales' && !dead(b.status) && inP(b.billDate || b.createdAt)).map(b => {
    const x = rateLines(b).reduce((t, l) => ({ taxable: t.taxable + l.taxable, igst: t.igst + l.igst, cgst: t.cgst + l.cgst, sgst: t.sgst + l.sgst }), { taxable: 0, igst: 0, cgst: 0, sgst: 0 });
    const tot = { igst: Number(b.totalIGST) || 0, cgst: Number(b.totalCGST) || 0, sgst: Number(b.totalSGST) || 0 };
    const useTot = tot.igst || tot.cgst || tot.sgst;
    return { src: 'Purchase bill', gstin: String(b.partyGstin || '').toUpperCase(), party: b.partyName, no: b.vendorBillNo || b.billNo || b.billId, ourNo: b.billNo, date: b.billDate, taxable: r2(b.subTotal || x.taxable), igst: r2(useTot ? tot.igst : x.igst), cgst: r2(useTot ? tot.cgst : x.cgst), sgst: r2(useTot ? tot.sgst : x.sgst), value: r2(b.grandTotal), po: b.orderNo || '' };
  });
  const exps = d.ex.filter(e => /approv|posted|confirm|paid/i.test(String(e.status || '')) && inP(e.date)).map(e => {
    const gst = r2((Number(e.grandTotal) || 0) - (Number(e.amount) || 0));
    return gst > 0 ? { src: 'Expense', gstin: '', party: e.ledgerName || e.vendorName || e.expenseCategory, no: e.invoiceNo || `EXP-${e.expenseId}`, date: e.date, taxable: r2(e.amount), igst: 0, cgst: r2(gst / 2), sgst: r2(gst / 2), value: r2(e.grandTotal), po: e.orderNo || '', guess: true } : null;
  }).filter(Boolean);
  // reverse charge expenses: the supplier charged no GST; we pay it (3.1 d) and take it as ITC (4 A 3)
  const rcms = d.ex.filter(e => e.rcm && /approv|posted|confirm|paid/i.test(String(e.status || '')) && inP(e.date)).map(e => {
    const base = r2(e.amount), tax = r2(base * (Number(e.rcmRate) || 0) / 100);
    return { src: `Expense (RCM ${e.rcmRate}%)`, gstin: '', party: e.ledgerName || e.vendorName || e.vendor || e.expenseCategory, no: e.invoiceNo || `EXP-${e.expenseId}`, date: e.date, taxable: base, igst: e.rcmInter ? tax : 0, cgst: e.rcmInter ? 0 : r2(tax / 2), sgst: e.rcmInter ? 0 : r2(tax - r2(tax / 2)), value: r2(e.grandTotal || e.amount), po: e.orderNo || '', rcm: true };
  });
  const dns = d.dn.filter(x => /approv|posted|confirm/i.test(String(x.status || '')) && inP(x.date)).map(x => {
    const b = d.pb.find(p => p.billId === x.linkedBillId) || {}, g = Number(x.totalGST) || 0, intra = b.gstType === 'intrastate';
    return { src: 'Debit note', gstin: String(b.partyGstin || '').toUpperCase(), party: x.vendorName, no: x.dnNo || x.dnId, date: x.date, taxable: -r2(x.subTotal), igst: intra ? 0 : -r2(g), cgst: intra ? -r2(g / 2) : 0, sgst: intra ? -r2(g / 2) : 0, value: -r2(x.grandTotal), po: x.billRef || '' };
  });
  const sum = (rows, f) => r2(rows.reduce((t, x) => t + (Number(x[f]) || 0), 0));
  const itcAll = ['igst', 'cgst', 'sgst'].reduce((o, f) => ({ ...o, [f]: r2(sum(purch, f) + sum(exps, f)) }), {});
  const itcRev = ['igst', 'cgst', 'sgst'].reduce((o, f) => ({ ...o, [f]: r2(-sum(dns, f)) }), {});
  const rcmIn = ['taxable', 'igst', 'cgst', 'sgst'].reduce((o, f) => ({ ...o, [f]: sum(rcms, f) }), {});
  const itcNet = ['igst', 'cgst', 'sgst'].reduce((o, f) => ({ ...o, [f]: r2(itcAll[f] + rcmIn[f] - itcRev[f]) }), {});
  const outNet = ['taxable', 'igst', 'cgst', 'sgst'].reduce((o, f) => ({ ...o, [f]: r2(out[f] - cnTot[f]) }), {});
  return {
    from, to, sales, b2b, b2cl, b2cs: Object.values(b2csMap).sort((a, b) => a.pos.localeCompare(b.pos) || a.rate - b.rate), cdnr, cdnur, docs,
    hsn: Object.values(hsn).map(h => ({ ...h, qty: r2(h.qty), taxable: r2(h.taxable), igst: r2(h.igst), cgst: r2(h.cgst), sgst: r2(h.sgst) })).sort((a, b) => a.hsn.localeCompare(b.hsn)),
    nil: r2(nil.taxable), out, cnTot, outNet, inward: [...purch, ...exps, ...rcms, ...dns].sort((a, b) => String(a.date).localeCompare(String(b.date))), itcAll, itcRev, itcNet, rcmIn,
    setoff: setOff({ igst: Math.max(0, outNet.igst), cgst: Math.max(0, outNet.cgst), sgst: Math.max(0, outNet.sgst) }, { igst: Math.max(0, itcNet.igst), cgst: Math.max(0, itcNet.cgst), sgst: Math.max(0, itcNet.sgst) }),
    noHsn: Object.values(hsn).filter(h => h.hsn === '—').length, badGstin: sales.filter(b => b.partyGstin && !GSTIN_RE.test(String(b.partyGstin).trim().toUpperCase())).length,
  };
}

const T = (rows, f) => r2(rows.reduce((t, x) => t + (Number(x[f]) || 0), 0));
const SECS = [['b2b', 'B2B'], ['b2cl', 'B2C Large'], ['b2cs', 'B2C Small'], ['cdnr', 'Credit notes (reg.)'], ['cdnur', 'Credit notes (unreg.)'], ['hsn', 'HSN summary'], ['docs', 'Documents']];
const COLS = {
  b2b: [['GSTIN', 160, r => r.gstin], ['Receiver', 0, r => r.party], ['Invoice No.', 140, r => r.no], ['Date', 92, r => dmy(r.date)], ['Invoice value', 120, r => amt(r.value), 'r'], ['Place of supply', 150, r => posText(r.pos)], ['Rate', 60, r => `${r.rate}%`, 'r'], ['Taxable', 120, r => amt(r.taxable), 'r'], ['IGST', 100, r => amtZ(r.igst), 'r'], ['CGST', 100, r => amtZ(r.cgst), 'r'], ['SGST', 100, r => amtZ(r.sgst), 'r']],
  b2cl: [['Invoice No.', 140, r => r.no], ['Date', 92, r => dmy(r.date)], ['Party', 0, r => r.party], ['Invoice value', 120, r => amt(r.value), 'r'], ['Place of supply', 160, r => posText(r.pos)], ['Rate', 60, r => `${r.rate}%`, 'r'], ['Taxable', 120, r => amt(r.taxable), 'r'], ['IGST', 110, r => amtZ(r.igst), 'r']],
  b2cs: [['Type', 110, r => r.type], ['Place of supply', 0, r => posText(r.pos)], ['Rate', 70, r => `${r.rate}%`, 'r'], ['Taxable', 130, r => amt(r.taxable), 'r'], ['IGST', 110, r => amtZ(r.igst), 'r'], ['CGST', 110, r => amtZ(r.cgst), 'r'], ['SGST', 110, r => amtZ(r.sgst), 'r']],
  cdnr: [['GSTIN', 160, r => r.gstin], ['Party', 0, r => r.party], ['Note No.', 150, r => r.no], ['Date', 92, r => dmy(r.date)], ['Against bill', 140, r => r.bill], ['Note value', 110, r => amt(r.value), 'r'], ['Rate', 60, r => `${r.rate}%`, 'r'], ['Taxable', 110, r => amt(r.taxable), 'r'], ['IGST', 96, r => amtZ(r.igst), 'r'], ['CGST', 96, r => amtZ(r.cgst), 'r'], ['SGST', 96, r => amtZ(r.sgst), 'r']],
  hsn: [['HSN / SAC', 110, r => r.hsn], ['Description', 0, r => r.desc], ['UQC', 70, r => r.uqc], ['Qty', 90, r => r.qty, 'r'], ['Rate', 60, r => `${r.rate}%`, 'r'], ['Taxable', 130, r => amt(r.taxable), 'r'], ['IGST', 110, r => amtZ(r.igst), 'r'], ['CGST', 110, r => amtZ(r.cgst), 'r'], ['SGST', 110, r => amtZ(r.sgst), 'r'], ['Total value', 130, r => amt(r.taxable + r.igst + r.cgst + r.sgst), 'r']],
  docs: [['Nature of document', 0, r => r.nature], ['Sr. no. from', 180, r => r.from], ['Sr. no. to', 180, r => r.to], ['Total', 90, r => r.total, 'r'], ['Cancelled', 90, r => r.cancelled, 'r'], ['Net issued', 100, r => r.total - r.cancelled, 'r']],
};
COLS.cdnur = COLS.cdnr;

function Grid({ cols, rows, foot, empty }) {
  return (
    <div className="bk-wrap">
      <table className="bk">
        <colgroup>{cols.map((c, i) => <col key={i} style={c[1] ? { width: c[1] } : undefined} />)}</colgroup>
        <thead><tr>{cols.map(c => <th key={c[0]} className={c[3] || ''}>{c[0]}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i}>{cols.map(c => { const v = c[2](r); return <td key={c[0]} className={c[3] || ''} title={typeof v === 'string' ? v : undefined}>{v}</td>; })}</tr>)}
          {!rows.length && <tr><td colSpan={cols.length} className="sb-empty">{empty || 'Nothing in this period.'}</td></tr>}</tbody>
        {foot && rows.length > 0 && <tfoot><tr>{cols.map((c, i) => <td key={c[0]} className={c[3] || ''}>{foot[i] ?? ''}</td>)}</tr></tfoot>}
      </table>
    </div>
  );
}
const footOf = (key, rows) => {
  const cols = COLS[key];
  return cols.map((c, i) => (i === 0 ? `${rows.length} ${key === 'hsn' ? 'HSN' : key === 'docs' ? 'types' : rows.length === 1 ? 'row' : 'rows'}` : { 'Invoice value': amt(T(rows, 'value')), 'Note value': amt(T(rows, 'value')), Taxable: amt(T(rows, 'taxable')), IGST: amt(T(rows, 'igst')), CGST: amt(T(rows, 'cgst')), SGST: amt(T(rows, 'sgst')), 'Total value': amt(T(rows, 'taxable') + T(rows, 'igst') + T(rows, 'cgst') + T(rows, 'sgst')), Total: rows.reduce((t, r) => t + (r.total || 0), 0) }[c[0]] ?? ''));
};

function R1({ R, sec, setSec, slot, period, company, user }) {
  const rows = R[sec] || [];
  const cols = COLS[sec];
  const xl = () => excel(`GSTR1_${period.replace(/\s+/g, '_')}`, [
    { name: 'b2b', widths: [18, 34, 18, 12, 14, 22, 8, 14, 12, 12, 12], rows: [['GSTIN/UIN of Recipient', 'Receiver Name', 'Invoice Number', 'Invoice date', 'Invoice Value', 'Place Of Supply', 'Rate', 'Taxable Value', 'Integrated Tax', 'Central Tax', 'State/UT Tax', 'Reverse Charge', 'Invoice Type'], ...R.b2b.map(r => [r.gstin, r.party, r.no, dmy(r.date), r.value, posText(r.pos), r.rate, r.taxable, r.igst, r.cgst, r.sgst, 'N', 'Regular B2B'])] },
    { name: 'b2cl', rows: [['Invoice Number', 'Invoice date', 'Invoice Value', 'Place Of Supply', 'Rate', 'Taxable Value', 'Integrated Tax'], ...R.b2cl.map(r => [r.no, dmy(r.date), r.value, posText(r.pos), r.rate, r.taxable, r.igst])] },
    { name: 'b2cs', rows: [['Type', 'Place Of Supply', 'Rate', 'Taxable Value', 'Integrated Tax', 'Central Tax', 'State/UT Tax'], ...R.b2cs.map(r => ['OE', posText(r.pos), r.rate, r.taxable, r.igst, r.cgst, r.sgst])] },
    { name: 'cdnr', rows: [['GSTIN/UIN of Recipient', 'Receiver Name', 'Note Number', 'Note Date', 'Note Type', 'Place Of Supply', 'Note Value', 'Rate', 'Taxable Value', 'Integrated Tax', 'Central Tax', 'State/UT Tax'], ...R.cdnr.map(r => [r.gstin, r.party, r.no, dmy(r.date), 'C', posText(r.pos), r.value, r.rate, r.taxable, r.igst, r.cgst, r.sgst])] },
    { name: 'cdnur', rows: [['Note Number', 'Note Date', 'Note Type', 'Place Of Supply', 'Note Value', 'Rate', 'Taxable Value', 'Integrated Tax', 'Central Tax', 'State/UT Tax'], ...R.cdnur.map(r => [r.no, dmy(r.date), 'C', posText(r.pos), r.value, r.rate, r.taxable, r.igst, r.cgst, r.sgst])] },
    { name: 'hsn', rows: [['HSN', 'Description', 'UQC', 'Total Quantity', 'Rate', 'Taxable Value', 'Integrated Tax Amount', 'Central Tax Amount', 'State/UT Tax Amount', 'Total Value'], ...R.hsn.map(h => [h.hsn, h.desc, h.uqc, h.qty, h.rate, h.taxable, h.igst, h.cgst, h.sgst, r2(h.taxable + h.igst + h.cgst + h.sgst)])] },
    { name: 'docs', rows: [['Nature of Document', 'Sr. No. From', 'Sr. No. To', 'Total Number', 'Cancelled'], ...R.docs.map(x => [x.nature, x.from, x.to, x.total, x.cancelled])] },
  ]);
  return (
    <>
      {slot && createPortal(<div className="sb-tools">
        <button type="button" className="sb-tbtn" onClick={() => printReport({ title: `GSTR-1 · ${SECS.find(s => s[0] === sec)[1].toUpperCase()}`, kv: [['Period', period], ['GSTIN', company?.gstin || '']], company, user, landscape: true,
          heads: cols.map(c => [c[0], c[1] ? `${Math.round(c[1] * 0.62)}px` : '', c[3] || '']), rows: [...rows.map(r => ({ c: cols.map(c => String(c[2](r) ?? '')) })), ...(rows.length ? [{ cls: 'tot', c: footOf(sec, rows).map(String) }] : [])] })}><Svg name="file" size={13} />Print</button>
        <button type="button" className="sb-tbtn" onClick={xl}><Svg name="chart" size={13} />Excel (all sheets)</button>
      </div>, slot)}
      <div className="bk-bar">
        <div className="ac-seg">{SECS.map(([k, l]) => <button key={k} type="button" className={sec === k ? 'on' : ''} onClick={() => setSec(k)}>{l}<span>{(R[k] || []).length}</span></button>)}</div>
        <div className="ac-sum"><div>Invoices<b>{R.sales.length}</b></div><div>Taxable ₹<b>{amt(R.out.taxable)}</b></div><div>Tax ₹<b>{amt(R.out.igst + R.out.cgst + R.out.sgst)}</b></div></div>
      </div>
      {(R.noHsn > 0 || R.badGstin > 0) && <div className="bk-info">Check before filing: {[R.noHsn && `${R.noHsn} item line(s) without HSN`, R.badGstin && `${R.badGstin} bill(s) with a wrong-format GSTIN (shown as B2C)`].filter(Boolean).join(' · ')}</div>}
      <Grid cols={cols} rows={rows} foot={footOf(sec, rows)} />
    </>
  );
}

function R3B({ R, slot, period, company, user }) {
  const o = R.outNet, rc = R.rcmIn;
  const so = { ...R.setoff, cash: ['igst', 'cgst', 'sgst'].reduce((x, f) => ({ ...x, [f]: r2(R.setoff.cash[f] + rc[f]) }), {}) };   // RCM tax cannot be paid from ITC
  const tx = x => (x.igst || 0) + (x.cgst || 0) + (x.sgst || 0);
  const rows = [
    { h: '3.1 (a)  Outward taxable supplies (other than zero / nil rated)', t: o.taxable, ...o, b: 1 },
    { h: '      Sales bills', t: R.out.taxable, ...R.out },
    { h: '      Less: credit notes', t: -R.cnTot.taxable, igst: -R.cnTot.igst, cgst: -R.cnTot.cgst, sgst: -R.cnTot.sgst },
    { h: '3.1 (c)  Nil-rated / exempt supplies', t: R.nil, b: 1 },
    { h: '3.1 (d)  Inward supplies liable to reverse charge (RCM)', t: rc.taxable, ...rc, b: 1 },
    { h: '4 (A)(3)  ITC — inward supplies liable to reverse charge', ...rc, b: 1 },
    { h: '4 (A)(5)  ITC available — all other ITC', ...R.itcAll, b: 1 },
    { h: '4 (B)(2)  ITC reversed — debit notes (purchase returns)', ...R.itcRev },
    { h: '4 (C)  Net ITC available', ...R.itcNet, b: 1 },
    { h: '6.1  Tax paid through ITC', igst: so.used.filter(u => u[1] === 'igst').reduce((t, u) => t + u[2], 0), cgst: so.used.filter(u => u[1] === 'cgst').reduce((t, u) => t + u[2], 0), sgst: so.used.filter(u => u[1] === 'sgst').reduce((t, u) => t + u[2], 0) },
    { h: '6.1  Reverse charge tax (cash only)', ...rc },
    { h: '6.1  TAX TO PAY IN CASH', ...so.cash, b: 2 },
    { h: '      ITC carried forward to next period', ...so.carry },
  ];
  const heads = [['Particulars', ''], ['Taxable ₹', '100px', 'r'], ['IGST ₹', '90px', 'r'], ['CGST ₹', '90px', 'r'], ['SGST ₹', '90px', 'r'], ['Total tax ₹', '96px', 'r']];
  const cells = r => [r.t != null ? amt(r.t) : '', amt(r.igst), amt(r.cgst), amt(r.sgst), amt(tx(r))];
  return (
    <>
      {slot && createPortal(<div className="sb-tools">
        <button type="button" className="sb-tbtn" onClick={() => printReport({ title: 'GSTR-3B SUMMARY', kv: [['Period', period], ['GSTIN', company?.gstin || '']], company, user, heads, rows: rows.map(r => ({ cls: r.b === 2 ? 'tot' : r.b ? 'g' : '', c: [r.h.trim(), ...cells(r)] })),
          note: 'ITC is set off IGST first (IGST → CGST → SGST), then CGST (CGST → IGST), then SGST (SGST → IGST). Check ITC with GSTR-2B before filing; expense GST is taken as CGST + SGST.' })}><Svg name="file" size={13} />Print</button>
        <button type="button" className="sb-tbtn" onClick={() => excel(`GSTR3B_${period.replace(/\s+/g, '_')}`, [{ name: 'GSTR-3B', widths: [62, 16, 14, 14, 14, 14], rows: [['GSTR-3B', period], [], heads.map(h => h[0]), ...rows.map(r => [r.h.trim(), r.t != null ? r2(r.t) : '', r2(r.igst), r2(r.cgst), r2(r.sgst), r2(tx(r))])] }])}><Svg name="chart" size={13} />Excel</button>
      </div>, slot)}
      <div className="bk-bar"><div className="ac-sum">
        <div>Output tax ₹<b>{amt(tx(o))}</b></div>{tx(rc) > 0 && <div>RCM tax ₹<b>{amt(tx(rc))}</b></div>}<div>Net ITC ₹<b>{amt(tx(R.itcNet))}</b></div>
        <div>Pay in cash ₹<b style={{ color: tx(so.cash) ? '#B42318' : '#067647' }}>{amt(tx(so.cash))}</b></div><div>ITC carried forward ₹<b>{amt(tx(so.carry))}</b></div>
      </div></div>
      <div className="bk-wrap">
        <table className="bk" style={{ maxWidth: 1100 }}>
          <colgroup><col /><col style={{ width: 150 }} /><col style={{ width: 130 }} /><col style={{ width: 130 }} /><col style={{ width: 130 }} /><col style={{ width: 140 }} /></colgroup>
          <thead><tr>{heads.map(h => <th key={h[0]} className={h[2] || ''}>{h[0]}</th>)}</tr></thead>
          <tbody>{rows.map(r => <tr key={r.h} className={r.b === 2 ? 'tt' : r.b ? 'g' : ''}><td style={{ whiteSpace: 'pre' }}>{r.h}</td>{cells(r).map((v, i) => <td key={i} className="r">{v}</td>)}</tr>)}</tbody>
        </table>
        <div style={{ padding: '8px 12px', fontSize: 11.5, color: '#667085', lineHeight: 1.6 }}>
          ITC set-off order: IGST credit first (IGST → CGST → SGST), then CGST (CGST → IGST), then SGST (SGST → IGST). CGST and SGST credit cannot pay each other.<br />
          ITC here is from purchase bills and approved expenses (expense GST is taken as CGST + SGST). Claim only what shows in your GSTR-2B — see “Purchase register (2B)”.<br />
          Reverse charge (RCM) expenses: the tax is paid in cash (it cannot be paid from ITC) and the same amount is ITC in 4(A)(3).
        </div>
      </div>
    </>
  );
}

function PurchaseReg({ R, slot, period, company, user }) {
  const [q, setQ] = useState('');
  const w = q.toLowerCase();
  const rows = R.inward.filter(r => !w || `${r.party} ${r.gstin} ${r.no} ${r.po}`.toLowerCase().includes(w));
  const cols = [['Source', 110, r => r.src], ['Vendor GSTIN', 160, r => r.gstin || (r.guess ? '—' : '')], ['Vendor', 0, r => r.party], ['Bill No.', 140, r => r.no], ['Date', 92, r => dmy(r.date)], ['PO / Ref', 140, r => r.po], ['Taxable', 120, r => amt(r.taxable), 'r'], ['IGST', 100, r => amtZ(r.igst), 'r'], ['CGST', 100, r => amtZ(r.cgst), 'r'], ['SGST', 100, r => amtZ(r.sgst), 'r'], ['Bill value', 120, r => amt(r.value), 'r']];
  const foot = [`${rows.length} bills`, '', '', '', '', '', amt(T(rows, 'taxable')), amt(T(rows, 'igst')), amt(T(rows, 'cgst')), amt(T(rows, 'sgst')), amt(T(rows, 'value'))];
  return (
    <>
      {slot && createPortal(<>
        <input className="sb-search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search vendor, GSTIN, bill…" aria-label="Search purchase register" />
        <div className="sb-tools">
          <button type="button" className="sb-tbtn" onClick={() => printReport({ title: 'PURCHASE REGISTER (ITC)', kv: [['Period', period]], company, user, landscape: true, heads: cols.map(c => [c[0], c[1] ? `${Math.round(c[1] * 0.6)}px` : '', c[3] || '']), rows: [...rows.map(r => ({ c: cols.map(c => String(c[2](r) ?? '')) })), { cls: 'tot', c: foot }] })}><Svg name="file" size={13} />Print</button>
          <button type="button" className="sb-tbtn" onClick={() => excel(`Purchase_Register_${period.replace(/\s+/g, '_')}`, [{ name: 'Purchase register', widths: [14, 18, 36, 18, 12, 18, 14, 12, 12, 12, 14], rows: [cols.map(c => c[0]), ...rows.map(r => [r.src, r.gstin, r.party, r.no, dmy(r.date), r.po, r.taxable, r.igst, r.cgst, r.sgst, r.value])] }])}><Svg name="chart" size={13} />Excel</button>
        </div>
      </>, slot)}
      <div className="bk-bar"><div className="ac-sum"><div>Bills<b>{rows.length}</b></div><div>Taxable ₹<b>{amt(T(rows, 'taxable'))}</b></div><div>ITC ₹<b>{amt(T(rows, 'igst') + T(rows, 'cgst') + T(rows, 'sgst'))}</b></div>
        <div>No GSTIN<b style={{ color: rows.filter(r => !r.gstin && r.src === 'Purchase bill').length ? '#B42318' : undefined }}>{rows.filter(r => !r.gstin && r.src === 'Purchase bill').length}</b></div></div></div>
      <Grid cols={cols} rows={rows} foot={foot} empty="No purchase bill in this period." />
    </>
  );
}
