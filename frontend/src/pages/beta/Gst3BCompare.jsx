/* GSTR-3B — as per books vs as per the GST portal, for one month.
 *   Outward tax:  our sales bills (less credit notes)        vs  GSTR-1 filed on the portal
 *   ITC:          our purchase bills / expenses (less DN)     vs  GSTR-2B (ITC available)
 *   Ledger:       the GST dashboard's Ledger Balance (cash / credit ledger…), read by the portal worker
 *   Tax to pay:   output tax − (credit ledger balance + this month's ITC), set off in the legal order; what is left is
 *                 paid in cash — less what is already in the cash ledger = to pay by challan.
 *   Differences:  bill by bill — not on the portal, not in books, amount differs (sales vs GSTR-1, purchases vs 2B). */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import { Svg } from '../../components/ui/Icon';
import { dmy, amt, r2, printReport, excel } from './BetaBooksLib';
import { Downloader, GP_CSS, compareR1, compareR2B, perOf, perLabel } from './BetaGstPortal';

const H = ['igst', 'cgst', 'sgst'];
const tx = x => r2(H.reduce((t, f) => t + (Number(x?.[f]) || 0), 0));
const sumOf = (rows, f) => r2(rows.reduce((t, x) => t + (Number(x[f]) || 0), 0));
const pick = (rows, f = r => r) => ['taxable', ...H].reduce((o, k) => ({ ...o, [k]: sumOf(rows.map(f), k) }), {});
const minus = (a, b) => ['taxable', ...H].reduce((o, k) => ({ ...o, [k]: r2((Number(a?.[k]) || 0) - (Number(b?.[k]) || 0)) }), {});
/* set-off (sec. 49 / rule 88A): IGST credit first (IGST → CGST → SGST), then CGST (→ CGST, IGST), then SGST (→ SGST, IGST) */
function setOff(liab, itc) {
  const L = { ...liab }, C = { ...itc }, used = { igst: 0, cgst: 0, sgst: 0 };
  const use = (from, to) => { const x = r2(Math.min(C[from], L[to])); if (x > 0) { C[from] = r2(C[from] - x); L[to] = r2(L[to] - x); used[to] = r2(used[to] + x); } };
  use('igst', 'igst'); use('igst', 'cgst'); use('igst', 'sgst'); use('cgst', 'cgst'); use('cgst', 'igst'); use('sgst', 'sgst'); use('sgst', 'igst');
  return { cash: L, carry: C, used };
}
const STATE = { diff: ['Amount differs', '#B54708', '#FFFAEB'], portal: ['On portal, not in books', '#B42318', '#FEF3F2'], books: ['In books, not on portal', '#6941C6', '#F4F3FF'] };

export default function Gst3BCompare({ R, d, fy, mon, period, company, companyId, user, slot }) {
  const monthly = /^\d+$/.test(String(mon));
  const per = monthly ? perOf(+fy, +mon) : '';
  const [idx, setIdx] = useState({});
  const [json, setJson] = useState({});
  const [ledger, setLedger] = useState(undefined);
  const [reload, setReload] = useState(0);
  const [basis, setBasis] = useState('portal');   // which figures the 3B is worked out from
  const [show, setShow] = useState('sales');
  const startRef = useRef(null);
  useEffect(() => {
    if (!companyId) return;
    axios.get('/api/gst-portal', { params: { companyId } }).then(r => setIdx(r.data || {})).catch(() => setIdx({}));
    axios.get('/api/gst-portal/ledger', { params: { companyId } }).then(r => setLedger(r.data || null)).catch(() => setLedger(null));
  }, [companyId, reload]);
  useEffect(() => {
    if (!companyId || !per || !idx[per]) { setJson({}); return; }
    let live = true;
    const one = k => (idx[per][k] ? axios.get(`/api/gst-portal/${per}/${k}`, { params: { companyId } }).then(r => r.data).catch(() => null) : Promise.resolve(null));
    Promise.all([one('r1'), one('r2b')]).then(([r1, r2b]) => { if (live) setJson({ r1, r2b }); });
    return () => { live = false; };
  }, [companyId, per, idx]);

  const names = useMemo(() => {
    const m = {};
    (d.cl || []).forEach(c => { const g = String(c.gstin || c.gst || '').trim().toUpperCase(); if (g) m[g] = c.clientName || c.companyName || ''; });
    return m;
  }, [d.cl]);
  const c1 = useMemo(() => (per ? compareR1(json.r1, d.sb, names, per) : null), [json.r1, d.sb, names, per]);
  const c2 = useMemo(() => (per ? compareR2B(json.r2b, d.pb, per) : null), [json.r2b, d.pb, per]);

  if (!monthly) return <div className="sb-empty" style={{ padding: 34 }}>Choose <b>one month</b> (top right) — the portal’s GSTR-1, GSTR-2B and ledger are compared month by month.</div>;

  /* ── the figures ── */
  const booksOut = R.outNet;                                                            // sales − credit notes
  const portalOut = c1.portal ? pick(c1.portal) : null;                                  // GSTR-1 as filed (notes signed)
  const booksItc = { taxable: sumOf(R.inward.filter(r => !r.rcm), 'taxable'), ...R.itcNet };
  const itc2b = c2.portal ? c2.portal.filter(r => r.itc !== false && !r.rev) : null;     // ITC available, not reverse charge
  const portalItc = itc2b ? pick(itc2b) : null;
  const usePortal = basis === 'portal';
  const out = usePortal && portalOut ? portalOut : booksOut;
  const itc = usePortal && portalItc ? portalItc : booksItc;
  const rc = R.rcmIn;
  const lrow = re => (ledger?.rows || []).find(r => re.test(r.name) && !/reversal|re-?claim/i.test(r.name));
  const credit = lrow(/credit\s+ledger/i), cash = lrow(/cash\s+ledger/i);
  const pos = x => H.reduce((o, f) => ({ ...o, [f]: Math.max(0, Number(x?.[f]) || 0) }), {});
  const creditAvail = H.reduce((o, f) => ({ ...o, [f]: r2((credit ? Number(credit[f]) || 0 : 0) + Math.max(0, itc[f])) }), {});
  const so = setOff(pos(out), creditAvail);
  const cashNeed = H.reduce((o, f) => ({ ...o, [f]: r2(so.cash[f] + (Number(rc[f]) || 0)) }), {});   // reverse charge is paid in cash only
  const challan = H.reduce((o, f) => ({ ...o, [f]: r2(Math.max(0, cashNeed[f] - (cash ? Number(cash[f]) || 0 : 0))) }), {});
  const got = idx[per] || {};

  const diffRows = (show === 'sales' ? c1.rows : c2.rows).filter(r => STATE[r.state]);
  const count = (c, s) => (c?.rows || []).filter(r => r.state === s).length;
  const diffsN = c => ['diff', 'portal', 'books'].reduce((t, s) => t + count(c, s), 0);

  /* ── comparison table rows: [label, books, portal] ── */
  const cmp = [
    ['Outward supplies — 3.1 (a)', booksOut, portalOut, 'Sales bills less credit notes', 'GSTR-1 filed on the portal'],
    ['Input tax credit — 4 (A)(5)', booksItc, portalItc, 'Purchase bills + expenses less debit notes', 'GSTR-2B (ITC available)'],
  ];
  const xl = () => excel(`GSTR3B_books_vs_portal_${per}`, [
    { name: '3B books vs portal', widths: [40, 16, 14, 14, 14, 14], rows: [['GSTR-3B', perLabel(per), company?.gstin || ''], [], ['Particulars', 'Taxable', 'IGST', 'CGST', 'SGST', 'Total tax'],
      ...cmp.flatMap(([l, b, p]) => [[`${l} — books`, b.taxable, b.igst, b.cgst, b.sgst, tx(b)], [`${l} — portal`, ...(p ? [p.taxable, p.igst, p.cgst, p.sgst, tx(p)] : ['not downloaded'])], [`${l} — difference`, ...(p ? (() => { const x = minus(p, b); return [x.taxable, x.igst, x.cgst, x.sgst, tx(x)]; })() : [''])]]),
      [], ['Tax to pay (as per ' + (usePortal ? 'portal' : 'books') + ')', '', 'IGST', 'CGST', 'SGST', 'Total'],
      ['Output tax', '', ...H.map(f => out[f]), tx(out)], ['Credit ledger balance', '', ...H.map(f => (credit ? credit[f] : 0)), tx(credit)], ['ITC this month', '', ...H.map(f => itc[f]), tx(itc)],
      ['Paid through credit', '', ...H.map(f => so.used[f]), tx(so.used)], ['To pay in cash (incl. RCM)', '', ...H.map(f => cashNeed[f]), tx(cashNeed)], ['Cash ledger balance', '', ...H.map(f => (cash ? cash[f] : 0)), tx(cash)],
      ['Pay by challan', '', ...H.map(f => challan[f]), tx(challan)], ['Credit left after 3B', '', ...H.map(f => so.carry[f]), tx(so.carry)]] },
    { name: 'Sales vs GSTR-1', widths: [22, 18, 34, 18, 12, 14, 14, 14, 18], rows: [['Status', 'GSTIN', 'Party', 'Invoice', 'Date', 'Taxable', 'Tax (portal)', 'Tax (books)', 'Our bill'], ...c1.rows.filter(r => STATE[r.state]).map(r => [STATE[r.state][0], r.gstin, r.party, r.no, r.date ? dmy(r.date) : '', r2(r.taxable), r.state === 'books' ? '' : tx(r), r.state === 'portal' ? '' : (r.bookTax ?? tx(r)), r.ours || ''])] },
    { name: 'Purchases vs GSTR-2B', widths: [22, 18, 34, 18, 12, 14, 14, 14, 18], rows: [['Status', 'GSTIN', 'Supplier', 'Invoice', 'Date', 'Taxable', 'ITC (2B)', 'ITC (books)', 'Our bill'], ...c2.rows.filter(r => STATE[r.state]).map(r => [STATE[r.state][0], r.gstin, r.party, r.no, r.date ? dmy(r.date) : '', r2(r.taxable), r.state === 'books' ? '' : tx(r), r.state === 'portal' ? '' : (r.bookTax ?? tx(r)), r.ours || ''])] },
  ]);
  const print = () => printReport({ title: 'GSTR-3B — BOOKS vs PORTAL', kv: [['Period', perLabel(per)], ['GSTIN', company?.gstin || ''], ['Worked out as per', usePortal ? 'Portal (GSTR-1 + GSTR-2B)' : 'Books']], company, user,
    heads: [['Particulars', ''], ['Taxable ₹', '100px', 'r'], ['IGST ₹', '90px', 'r'], ['CGST ₹', '90px', 'r'], ['SGST ₹', '90px', 'r'], ['Total tax ₹', '96px', 'r']],
    rows: [
      ...cmp.flatMap(([l, b, p]) => [{ cls: 'g', c: [l, '', '', '', '', ''] }, { c: ['As per books', amt(b.taxable), amt(b.igst), amt(b.cgst), amt(b.sgst), amt(tx(b))] },
        { c: ['As per portal', ...(p ? [amt(p.taxable), amt(p.igst), amt(p.cgst), amt(p.sgst), amt(tx(p))] : ['not downloaded', '', '', '', ''])] },
        ...(p ? [(() => { const x = minus(p, b); return { cls: 'tot', c: ['Difference (portal − books)', amt(x.taxable), amt(x.igst), amt(x.cgst), amt(x.sgst), amt(tx(x))] }; })()] : [])]),
      { cls: 'g', c: [`Tax to pay (as per ${usePortal ? 'portal' : 'books'})`, '', '', '', '', ''] },
      { c: ['Output tax', '', amt(out.igst), amt(out.cgst), amt(out.sgst), amt(tx(out))] },
      { c: [`Credit ledger balance${ledger?.asOn ? ` (${ledger.asOn})` : ''}`, '', amt(credit?.igst), amt(credit?.cgst), amt(credit?.sgst), amt(tx(credit))] },
      { c: ['ITC this month', '', amt(itc.igst), amt(itc.cgst), amt(itc.sgst), amt(tx(itc))] },
      { c: ['Paid through credit', '', amt(so.used.igst), amt(so.used.cgst), amt(so.used.sgst), amt(tx(so.used))] },
      { c: ['To pay in cash (incl. reverse charge)', '', amt(cashNeed.igst), amt(cashNeed.cgst), amt(cashNeed.sgst), amt(tx(cashNeed))] },
      { c: ['Less: cash ledger balance', '', amt(cash?.igst), amt(cash?.cgst), amt(cash?.sgst), amt(tx(cash))] },
      { cls: 'tot', c: ['PAY BY CHALLAN', '', amt(challan.igst), amt(challan.cgst), amt(challan.sgst), amt(tx(challan))] },
      { c: ['Credit left after this 3B', '', amt(so.carry.igst), amt(so.carry.cgst), amt(so.carry.sgst), amt(tx(so.carry))] },
    ],
    note: 'Set-off order: IGST credit first (IGST → CGST → SGST), then CGST (→ CGST, IGST), then SGST (→ SGST, IGST). The credit ledger balance is as read from the GST dashboard; reverse-charge tax is paid in cash only.' });

  return (
    <div className="g3">
      <style>{GP_CSS + G3_CSS}</style>
      {slot && createPortal(<div className="sb-tools">
        <button type="button" className="sb-tbtn" onClick={print}><Svg name="file" size={13} />Print</button>
        <button type="button" className="sb-tbtn" onClick={xl}><Svg name="chart" size={13} />Excel</button>
      </div>, slot)}

      <Downloader companyId={companyId} fy={+fy} idx={idx} cur={+mon} startRef={startRef} onDone={() => setReload(x => x + 1)} title={`Get ${perLabel(per)} from the GST portal — GSTR-1, GSTR-2B and ledger balance`} />

      {/* ── headline ── */}
      <div className="g3-cards">
        <Card k="Output tax" sub={portalOut ? 'GSTR-1 (portal)' : 'Books — GSTR-1 not downloaded'} v={tx(portalOut || booksOut)} d={portalOut ? tx(minus(portalOut, booksOut)) : null} dl="vs books" />
        <Card k="ITC this month" sub={portalItc ? 'GSTR-2B (portal)' : 'Books — GSTR-2B not downloaded'} v={tx(portalItc || booksItc)} d={portalItc ? tx(minus(portalItc, booksItc)) : null} dl="vs books" />
        <Card k="Credit in ledger" sub={ledger ? `GST portal${ledger.asOn ? ` · ${ledger.asOn}` : ''}` : 'Not read yet'} v={credit ? tx(credit) : null} />
        <Card k="Pay by challan" sub={`As per ${usePortal ? 'portal' : 'books'}, after credit + cash ledger`} v={tx(challan)} hot={tx(challan) > 0} />
      </div>

      <div className="g3-grid">
        {/* ── books vs portal ── */}
        <section className="g3-box">
          <h3><Svg name="swap" size={14} />Books vs portal — {perLabel(per)}</h3>
          <table className="g3-t">
            <colgroup><col /><col style={{ width: 120 }} /><col style={{ width: 104 }} /><col style={{ width: 104 }} /><col style={{ width: 104 }} /><col style={{ width: 116 }} /></colgroup>
            <thead><tr><th /><th className="r">Taxable ₹</th><th className="r">IGST ₹</th><th className="r">CGST ₹</th><th className="r">SGST ₹</th><th className="r">Total tax ₹</th></tr></thead>
            {cmp.map(([l, b, p, bs, ps]) => { const x = p ? minus(p, b) : null; return (
              <tbody key={l}>
                <tr className="hd"><td colSpan={6}>{l}</td></tr>
                <tr><td>As per books<small>{bs}</small></td><Nums x={b} /></tr>
                <tr><td>As per portal<small>{ps}</small></td>{p ? <Nums x={p} /> : <td colSpan={5} className="na">{(got[l.startsWith('Outward') ? 'r1' : 'r2b']) ? 'Reading…' : 'Not downloaded — use “Get from the GST portal” above'}</td>}</tr>
                {x && <tr className={`df${Math.abs(tx(x)) > 1 || Math.abs(x.taxable) > 1 ? ' bad' : ' ok'}`}><td>Difference <small>portal − books</small></td><Nums x={x} sign /></tr>}
              </tbody>); })}
          </table>
        </section>

        {/* ── ledger balance ── */}
        <section className="g3-box">
          <h3><Svg name="ledger" size={14} />GST portal ledger balance{ledger?.asOn && <span className="g3-on">as on {ledger.asOn}</span>}
            <span className="grow" /><button type="button" className="sf-lnk" onClick={() => startRef.current && startRef.current(null, ['ledger'])}>Refresh from portal</button></h3>
          {ledger === undefined ? <div className="na">Loading…</div> : !ledger ? <div className="na">Not read yet — press <b>Refresh from portal</b> (it logs in to the GST portal and reads the dashboard’s Ledger Balance).</div> : (
            <table className="g3-t lg">
              <colgroup><col /><col style={{ width: 92 }} /><col style={{ width: 92 }} /><col style={{ width: 92 }} /><col style={{ width: 70 }} /></colgroup>
              <thead><tr><th /><th className="r">IGST ₹</th><th className="r">CGST ₹</th><th className="r">SGST ₹</th><th className="r">CESS ₹</th></tr></thead>
              <tbody>{ledger.rows.map(r => <tr key={r.name} className={/credit\s+ledger/i.test(r.name) && !/reversal/i.test(r.name) ? 'cr' : /cash\s+ledger/i.test(r.name) ? 'cs' : ''}>
                <td>{r.name}</td>{['igst', 'cgst', 'sgst', 'cess'].map(f => <td key={f} className="r">{amt(r[f])}</td>)}</tr>)}</tbody>
            </table>)}
          {ledger?.at && <div className="g3-foot">Read {new Date(ledger.at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })} · it is read again with every download from the portal</div>}
        </section>
      </div>

      {/* ── tax to pay ── */}
      <section className="g3-box">
        <h3><Svg name="wallet" size={14} />Tax to pay for {perLabel(per)}<span className="grow" />
          <span className="ac-seg g3-seg" role="group" aria-label="Work out as per">
            <button type="button" className={usePortal ? 'on' : ''} aria-pressed={usePortal} onClick={() => setBasis('portal')}>As per portal</button>
            <button type="button" className={!usePortal ? 'on' : ''} aria-pressed={!usePortal} onClick={() => setBasis('books')}>As per books</button>
          </span></h3>
        {usePortal && (!portalOut || !portalItc) && <div className="g3-warn">{[!portalOut && 'GSTR-1', !portalItc && 'GSTR-2B'].filter(Boolean).join(' and ')} not downloaded — books figures are used for {!portalOut && !portalItc ? 'both' : 'it'}.</div>}
        <table className="g3-t pay">
          <colgroup><col /><col style={{ width: 120 }} /><col style={{ width: 120 }} /><col style={{ width: 120 }} /><col style={{ width: 130 }} /></colgroup>
          <thead><tr><th /><th className="r">IGST ₹</th><th className="r">CGST ₹</th><th className="r">SGST ₹</th><th className="r">Total ₹</th></tr></thead>
          <tbody>
            <tr><td>Output tax<small>{usePortal && portalOut ? 'GSTR-1' : 'sales bills less credit notes'}</small></td><Nums3 x={out} /></tr>
            <tr><td>Credit ledger balance<small>{ledger ? `GST portal${ledger.asOn ? `, ${ledger.asOn}` : ''}` : 'not read — counted as 0'}</small></td><Nums3 x={credit} /></tr>
            <tr><td>+ ITC of this month<small>{usePortal && portalItc ? 'GSTR-2B, ITC available' : 'purchase bills + expenses'}</small></td><Nums3 x={itc} /></tr>
            <tr className="mid"><td>Paid through credit<small>IGST → CGST → SGST order</small></td><Nums3 x={so.used} /></tr>
            <tr><td>To pay in cash<small>incl. reverse charge {tx(rc) > 0 ? `₹ ${amt(tx(rc))}` : ''}</small></td><Nums3 x={cashNeed} /></tr>
            <tr><td>Less: cash ledger balance<small>{cash ? 'GST portal' : 'not read — counted as 0'}</small></td><Nums3 x={cash} /></tr>
            <tr className="big"><td>Pay by challan</td><Nums3 x={challan} /></tr>
            <tr className="soft"><td>Credit left after this 3B</td><Nums3 x={so.carry} /></tr>
          </tbody>
        </table>
      </section>

      {/* ── bill-wise differences ── */}
      <section className="g3-box">
        <h3><Svg name="alert" size={14} />Bill-wise differences<span className="grow" />
          <span className="ac-seg g3-seg" role="group" aria-label="Which">
            <button type="button" className={show === 'sales' ? 'on' : ''} onClick={() => setShow('sales')}>Sales vs GSTR-1<span className="gp-n">{c1.portal ? diffsN(c1) : '—'}</span></button>
            <button type="button" className={show === 'purch' ? 'on' : ''} onClick={() => setShow('purch')}>Purchases vs GSTR-2B<span className="gp-n">{c2.portal ? diffsN(c2) : '—'}</span></button>
          </span></h3>
        {!(show === 'sales' ? c1 : c2).portal ? <div className="na">{show === 'sales' ? 'GSTR-1' : 'GSTR-2B'} of {perLabel(per)} is not downloaded yet.</div>
          : !diffRows.length ? <div className="g3-good"><Svg name="check" size={16} /> Every bill matches the portal — nothing to fix.</div> : (
            <table className="g3-t df-t">
              <colgroup><col style={{ width: 168 }} /><col style={{ width: 150 }} /><col /><col style={{ width: 140 }} /><col style={{ width: 100 }} /><col style={{ width: 110 }} /><col style={{ width: 104 }} /><col style={{ width: 104 }} /><col style={{ width: 96 }} /><col style={{ width: 130 }} /></colgroup>
              <thead><tr><th>Status</th><th>GSTIN</th><th>{show === 'sales' ? 'Party' : 'Supplier'}</th><th>Invoice</th><th>Date</th><th className="r">Taxable ₹</th><th className="r">{show === 'sales' ? 'Tax' : 'ITC'} portal ₹</th><th className="r">{show === 'sales' ? 'Tax' : 'ITC'} books ₹</th><th className="r">Diff ₹</th><th>Our bill</th></tr></thead>
              <tbody>{diffRows.map((r, i) => {
                const s = STATE[r.state], tp = r.state === 'books' ? 0 : tx(r), tb = r.state === 'portal' ? 0 : (r.bookTax ?? tx(r));
                return (
                  <tr key={i}>
                    <td><span className="gp-st" style={{ color: s[1], background: s[2] }}>{s[0]}</span></td>
                    <td className="mono">{r.gstin || '—'}</td><td title={r.party}>{r.party || '—'}</td><td className="mono" title={r.no}>{r.no || '—'}</td><td>{r.date ? dmy(r.date) : '—'}</td>
                    <td className="r">{amt(r.taxable)}</td><td className="r">{r.state === 'books' ? '—' : amt(tp)}</td><td className="r">{r.state === 'portal' ? '—' : amt(tb)}</td>
                    <td className={`r ${Math.abs(tp - tb) > 1 ? 'neg' : ''}`}>{amt(r2(tp - tb))}</td><td className="mono">{r.ours || '—'}</td>
                  </tr>);
              })}</tbody>
              <tfoot><tr><td colSpan={5}>{diffRows.length} bill{diffRows.length === 1 ? '' : 's'} to check</td><td className="r">{amt(sumOf(diffRows, 'taxable'))}</td>
                <td className="r">{amt(r2(diffRows.reduce((t, r) => t + (r.state === 'books' ? 0 : tx(r)), 0)))}</td><td className="r">{amt(r2(diffRows.reduce((t, r) => t + (r.state === 'portal' ? 0 : (r.bookTax ?? tx(r))), 0)))}</td>
                <td className="r">{amt(r2(diffRows.reduce((t, r) => t + (r.state === 'books' ? 0 : tx(r)) - (r.state === 'portal' ? 0 : (r.bookTax ?? tx(r))), 0)))}</td><td /></tr></tfoot>
            </table>)}
        <div className="g3-foot">{show === 'sales'
          ? '“On portal, not in books” = filed in GSTR-1 but no such sales bill here · “In books, not on portal” = our bill of this month (with a GSTIN) not filed in GSTR-1 — add it in the next GSTR-1.'
          : '“On portal, not in books” = the supplier filed it, enter the purchase bill · “In books, not on portal” = the supplier has not filed it yet — hold its ITC until it shows in GSTR-2B.'}</div>
      </section>
    </div>
  );
}

function Card({ k, sub, v, d, dl, hot }) {
  return (
    <div className={`g3-card${hot ? ' hot' : ''}`}>
      <small>{k}</small>
      <b>{v == null ? '—' : `₹ ${amt(v)}`}</b>
      <span>{sub}</span>
      {d != null && <em className={Math.abs(d) > 1 ? 'bad' : 'ok'}>{Math.abs(d) > 1 ? `${d > 0 ? '+' : '−'} ₹ ${amt(Math.abs(d))} ${dl}` : `Matches ${dl.replace('vs ', '')}`}</em>}
    </div>
  );
}
const sg = (v, sign) => (sign && v > 0 ? `+${amt(v)}` : amt(v));
const Nums = ({ x, sign }) => <>{['taxable', ...H].map(f => <td key={f} className="r">{sg(Number(x?.[f]) || 0, sign)}</td>)}<td className="r b">{sg(tx(x), sign)}</td></>;
const Nums3 = ({ x }) => <>{H.map(f => <td key={f} className="r">{amt(Number(x?.[f]) || 0)}</td>)}<td className="r b">{amt(tx(x))}</td></>;

const G3_CSS = `
.g3 { padding:0 12px 18px; }
.g3 .gp-dl { margin:10px 0 0; }
.g3-cards { display:grid; grid-template-columns:repeat(4, minmax(0, 1fr)); gap:10px; margin:12px 0; }
.g3-card { position:relative; padding:12px 14px 12px 16px; border:1px solid #D6E4E6; border-radius:8px; background:#fff; box-shadow:0 1px 2px rgba(16,24,40,.05); overflow:hidden; }
.g3-card::before { content:''; position:absolute; left:0; top:0; bottom:0; width:4px; background:#03444f; }
.g3-card.hot::before { background:#B42318; }
.g3-card small { display:block; font-size:11px; font-weight:700; letter-spacing:.5px; text-transform:uppercase; color:#5E7A80; }
.g3-card b { display:block; margin:4px 0 2px; font-size:22px; font-weight:700; color:#03444f; }
.g3-card.hot b { color:#B42318; }
.g3-card span { display:block; font-size:11.5px; color:#667085; }
.g3-card em { display:inline-block; margin-top:6px; padding:2px 8px; border-radius:99px; font-size:11px; font-style:normal; font-weight:700; }
.g3-card em.ok { background:#ECFDF3; color:#067647; } .g3-card em.bad { background:#FFFAEB; color:#B54708; }
.g3-grid { display:grid; grid-template-columns:minmax(0, 1.55fr) minmax(0, 1fr); gap:10px; }
.g3-box { margin-top:10px; border:1px solid #D6E4E6; border-radius:8px; background:#fff; overflow:hidden; }
.g3-grid .g3-box { margin-top:0; }
.g3-box h3 { display:flex; align-items:center; gap:8px; margin:0; padding:9px 12px; font-size:13px; font-weight:700; color:#fff; background:#03444f; }
.g3-box h3 .grow { flex:1; }
.g3-box h3 .sf-lnk, .g3-box h3 .g3-btn { height:26px; padding:0 10px; border:1px solid rgba(255,255,255,.45); border-radius:5px; background:rgba(255,255,255,.1); color:#fff; font:600 12px inherit; cursor:pointer; text-decoration:none; }
.g3-box h3 .sf-lnk:hover { background:rgba(255,255,255,.2); }
.g3-on { font-size:11.5px; font-weight:500; opacity:.8; }
.g3-box h3 .g3-seg { display:inline-flex; gap:2px; padding:2px; border:1px solid rgba(255,255,255,.35); border-radius:6px; background:rgba(255,255,255,.08); }
.g3-box h3 .g3-seg button { height:24px; padding:0 10px; border:0; border-radius:4px; background:transparent; color:#E8F3F4; font:600 12px inherit; cursor:pointer; display:inline-flex; align-items:center; gap:6px; }
.g3-box h3 .g3-seg button:hover:not(.on) { background:rgba(255,255,255,.14); }
.g3-box h3 .g3-seg button.on { background:#fff; color:#03444f; }
.g3-box h3 .g3-seg .gp-n { background:rgba(0,0,0,.18); color:inherit; }
.g3-box h3 .g3-seg button.on .gp-n { background:#E8F3F4; }
.g3-t { width:100%; border-collapse:collapse; font-size:12.5px; }
.g3-t th { padding:7px 10px; background:#F0F7F7; color:#344054; font-weight:700; text-align:left; border-bottom:1px solid #D6E4E6; white-space:nowrap; }
.g3-t td { padding:7px 10px; border-bottom:1px solid #EDF2F3; color:#1D2939; vertical-align:top; }
.g3-t .r { text-align:right; white-space:nowrap; } .g3-t td.b { font-weight:700; }
.g3-t td small { display:block; font-size:11px; color:#667085; margin-top:1px; }
.g3-t tr.hd td { background:#FAFCFC; font-weight:700; color:#03444f; border-top:2px solid #D6E4E6; }
.g3-t tr.df td { font-weight:700; } .g3-t tr.df.bad td { background:#FFFAEB; color:#B54708; } .g3-t tr.df.ok td { background:#F6FEF9; color:#067647; }
.g3-t td.na { color:#98A2B3; font-style:italic; }
.g3-t.lg tr.cr td { background:#ECFDF3; font-weight:700; color:#067647; } .g3-t.lg tr.cs td { background:#F0F7FF; font-weight:700; color:#175CD3; }
.g3-t.pay tr.mid td { background:#FAFCFC; } .g3-t.pay tr.big td { background:#03444f; color:#fff; font-size:14px; font-weight:700; } .g3-t.pay tr.big td small { color:#BFE6EA; }
.g3-t.pay tr.soft td { color:#475467; }
.g3-t.df-t td.neg { color:#B42318; font-weight:700; } .g3-t tfoot td { font-weight:700; background:#F7FAFA; border-top:2px solid #D6E4E6; }
.g3-t.df-t td:nth-child(5) { white-space:nowrap; }
.g3-t .mono { font-family:ui-monospace, Menlo, Consolas, monospace; font-size:11.5px; }
.g3 .na { padding:16px 12px; color:#667085; font-size:12.5px; }
.g3-good { display:flex; align-items:center; gap:8px; padding:16px 12px; color:#067647; font-weight:600; font-size:13px; }
.g3-warn { margin:10px 12px 0; padding:8px 10px; border:1px solid #FEDF89; background:#FFFAEB; color:#B54708; border-radius:6px; font-size:12px; }
.g3-foot { padding:8px 12px; font-size:11.5px; color:#667085; border-top:1px solid #EDF2F3; background:#FCFDFD; }
@media (max-width:1100px) { .g3-cards { grid-template-columns:repeat(2, minmax(0, 1fr)); } .g3-grid { grid-template-columns:1fr; } }
`;
