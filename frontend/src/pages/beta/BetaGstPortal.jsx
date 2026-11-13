/* Beta — GST returns "As per Portal": GSTR-1 and GSTR-2B as downloaded from the GST portal, side by side with our books.
 * Download: the portal worker logs in with the GST login from the Password Manager (captcha / OTP typed here), opens
 * the returns dashboard month by month and saves the JSON (api/gstPortal.js). View: one month at a time —
 *   GSTR-2B  supplier invoices / notes, matched with our purchase bills (GSTIN + invoice no.) → In books / Not in books,
 *            and our purchase bills of the month that are not in 2B.
 *   GSTR-1   what was filed, matched with our sales bills (invoice no.) → In books / Not in books, and bills not filed. */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import { useCompany } from '../../context/CompanyContext';
import { Svg } from '../../components/ui/Icon';
import { CSS as SALES_CSS } from './BetaSales';
import { PX_CSS } from './BetaPurchaseParts';
import { ACC_CSS } from './BetaAccKit';
import { BK_CSS, fyName, fyStartYear, today, dmy, amt, amtZ, r2, excel } from './BetaBooksLib';

const TEAL = '#03444f';
const MONTHS = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'];
/* month index in the FY (0 = Apr) → 'MMYYYY' */
const perOf = (fy, i) => { const mm = ((i + 3) % 12) + 1; return `${String(mm).padStart(2, '0')}${i >= 9 ? fy + 1 : fy}`; };
const perLabel = p => `${MONTHS[(+p.slice(0, 2) + 8) % 12]} ${p.slice(2)}`;
const isoOf = d => { const m = String(d || '').match(/^(\d{2})-(\d{2})-(\d{4})$/); return m ? `${m[3]}-${m[2]}-${m[1]}` : String(d || '').slice(0, 10); };
const key = (g, no) => `${String(g || '').trim().toUpperCase()}|${String(no || '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^0+/, '')}`;
const nkey = no => String(no || '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^0+/, '');
const dead = s => /cancel|reject|draft|void/i.test(String(s || ''));
const sum = (rows, f) => r2(rows.reduce((t, x) => t + (Number(x[f]) || 0), 0));
const R1_MIN = 20;   // the portal takes about this long to make a GSTR-1 file
/* GSTR-1 asked for on the portal, not downloaded yet → { ready, left (minutes), at, readyAt } */
const r1State = (d, now) => {
  if (!d || d.r1 || !d.r1Req) return null;
  const at = new Date(d.r1Req.at), readyAt = new Date(at.getTime() + R1_MIN * 60000);
  return { ready: now >= readyAt, left: Math.max(0, Math.ceil((readyAt - now) / 60000)), at, readyAt };
};
const hm = d => d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
const tax = x => r2((Number(x.igst) || 0) + (Number(x.cgst) || 0) + (Number(x.sgst) || 0));

/* ── the portal JSON → rows ── */
function rows2b(j) {
  const dd = ((j && (j.data || j)) || {}).docdata || {};
  const out = [];
  const add = (list, type, notes, sign = () => 1) => (list || []).forEach(s => (s[notes] || []).forEach(i => {
    const it = Array.isArray(i.items) && i.items.length ? i.items : [i], k = sign(i);   // the portal gives the amounts per item or on the invoice itself
    out.push({ type, gstin: s.ctin, party: s.trdnm || '', no: i.inum || i.ntnum || '', date: isoOf(i.dt), value: k * (Number(i.val) || 0), pos: i.pos || '',
      taxable: k * sum(it, 'txval'), igst: k * sum(it, 'igst'), cgst: k * sum(it, 'cgst'), sgst: k * sum(it, 'sgst'), rev: i.rev === 'Y', itc: i.itcavl !== 'N', filed: isoOf(s.supfildt), sup: s.supprd || '', ims: i.imsStatus || '' });
  }));
  add(dd.b2b, 'Invoice', 'inv');
  add(dd.b2ba, 'Invoice (amended)', 'inv');
  add(dd.cdnr, 'Note', 'nt', i => (i.typ === 'C' ? -1 : 1));
  add(dd.cdnra, 'Note (amended)', 'nt', i => (i.typ === 'C' ? -1 : 1));
  (dd.impg || []).forEach(i => out.push({ type: 'Import (BoE)', gstin: '', party: `Port ${i.portcode || ''}`, no: i.boenum, date: isoOf(i.boedt), value: Number(i.txval) + Number(i.igst || 0), taxable: Number(i.txval) || 0, igst: Number(i.igst) || 0, cgst: 0, sgst: 0, itc: true }));
  return out;
}
function rows1(j, names) {
  const out = [];
  const lines = i => (i.itms || []).map(x => x.itm_det || x);
  const push = (type, gstin, i, extra = {}, k = 1) => {
    const l = lines(i);
    out.push({ type, gstin: gstin || '', party: names[String(gstin || '').toUpperCase()] || '', no: i.inum || i.nt_num || '', date: isoOf(i.idt || i.nt_dt), value: k * (Number(i.val) || 0), pos: i.pos || '',
      taxable: k * sum(l, 'txval'), igst: k * sum(l, 'iamt'), cgst: k * sum(l, 'camt'), sgst: k * sum(l, 'samt'), ...extra });
  };
  (j.b2b || []).forEach(c => (c.inv || []).forEach(i => push('B2B', c.ctin, i)));
  (j.b2ba || []).forEach(c => (c.inv || []).forEach(i => push('B2B (amended)', c.ctin, i)));
  (j.b2cl || []).forEach(c => (c.inv || []).forEach(i => push('B2C large', '', { ...i, pos: c.pos })));
  (j.exp || []).forEach(c => (c.inv || []).forEach(i => push(`Export ${c.exp_typ || ''}`.trim(), '', i)));
  (j.cdnr || []).forEach(c => (c.nt || []).forEach(n => push(n.ntty === 'C' ? 'Credit note' : 'Debit note', c.ctin, n, {}, n.ntty === 'C' ? -1 : 1)));
  (j.cdnur || []).forEach(n => push(n.ntty === 'C' ? 'Credit note (unreg.)' : 'Debit note (unreg.)', '', n, {}, n.ntty === 'C' ? -1 : 1));
  (j.b2cs || []).forEach(x => out.push({ type: 'B2C small', gstin: '', party: `${x.sply_ty === 'INTER' ? 'Inter' : 'Intra'}-state · ${x.rt}%`, no: '', date: '', value: (Number(x.txval) || 0) + (Number(x.iamt) || 0) + (Number(x.camt) || 0) + (Number(x.samt) || 0), pos: x.pos || '',
    taxable: Number(x.txval) || 0, igst: Number(x.iamt) || 0, cgst: Number(x.camt) || 0, sgst: Number(x.samt) || 0, summary: true }));
  return out;
}

export default function BetaGstPortal() {
  const { selectedCompany } = useCompany() || {};
  const companyId = selectedCompany?.companyId;
  const last = new Date(); last.setDate(1); last.setMonth(last.getMonth() - 1);
  const thisFy = fyStartYear(today());
  const [fy, setFy] = useState(() => fyStartYear(last.toISOString().slice(0, 10)));
  const [mon, setMon] = useState(() => { const m = last.getMonth(); return m >= 3 ? m - 3 : m + 9; });
  const [tab, setTab] = useState('r2b');
  const [show, setShow] = useState('all');
  const [q, setQ] = useState('');
  const [slot, setSlot] = useState(null);
  const [idx, setIdx] = useState({});
  const [reload, setReload] = useState(0);
  const [data, setData] = useState({});
  const [bills, setBills] = useState(null);
  const period = perOf(fy, mon);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 20000); return () => clearInterval(t); }, []);
  const startRef = useRef(null);

  useEffect(() => {
    if (!companyId) return;
    axios.get('/api/gst-portal', { params: { companyId } }).then(r => setIdx(r.data || {})).catch(() => setIdx({}));
  }, [companyId, reload]);
  useEffect(() => {
    if (!companyId) return;
    const get = (u, p = {}) => axios.get(u, { params: { companyId, ...p } }).then(r => (Array.isArray(r.data) ? r.data : [])).catch(() => []);
    Promise.all([get('/api/bills', { type: 'sales' }), get('/api/bills', { type: 'purchase' }), get('/api/clients')]).then(([sb, pb, cl]) => setBills({ sb, pb, cl }));
  }, [companyId]);
  useEffect(() => {
    if (!companyId || !idx[period]) { setData({}); return; }
    let live = true;
    const one = k => (idx[period][k] ? axios.get(`/api/gst-portal/${period}/${k}`, { params: { companyId } }).then(r => r.data).catch(() => null) : Promise.resolve(null));
    Promise.all([one('r1'), one('r2b')]).then(([r1, r2b]) => { if (live) setData({ r1, r2b }); });
    return () => { live = false; };
  }, [companyId, period, idx]);

  const names = useMemo(() => {
    const m = {};
    (bills?.cl || []).forEach(c => { const g = String(c.gstin || c.gst || '').trim().toUpperCase(); if (g) m[g] = c.clientName || c.companyName || ''; });
    (bills?.sb || []).forEach(b => { const g = String(b.partyGstin || '').trim().toUpperCase(); if (g && !m[g]) m[g] = b.partyName; });
    return m;
  }, [bills]);
  const view = useMemo(() => {
    if (!bills) return null;
    const inMonth = d => { const s = String(d || '').slice(0, 7); return s === `${period.slice(2)}-${period.slice(0, 2)}`; };
    const bTax = b => ({ taxable: r2(b.subTotal), igst: r2(b.totalIGST), cgst: r2(b.totalCGST), sgst: r2(b.totalSGST) });
    if (tab === 'r2b') {
      const portal = data.r2b ? rows2b(data.r2b) : null;
      const pb = bills.pb.filter(b => b.type !== 'sales' && !dead(b.status));
      const byKey = {}; pb.forEach(b => { byKey[key(b.partyGstin, b.vendorBillNo || b.billNo)] = b; if (b.vendorBillNo && b.billNo) byKey[key(b.partyGstin, b.billNo)] = byKey[key(b.partyGstin, b.billNo)] || b; });
      const used = new Set();
      const rows = (portal || []).map(r => {
        const b = r.gstin ? byKey[key(r.gstin, r.no)] : null;
        if (b) used.add(b.billId);
        const bt = b ? bTax(b) : null;
        return { ...r, ours: b ? String(b.billNo || b.billId) : '', oursDate: b ? b.billDate : '', state: b ? (Math.abs(tax(bt) - tax(r)) > 1 ? 'diff' : 'match') : 'portal', bookTax: bt ? tax(bt) : null };
      });
      const extra = portal ? pb.filter(b => inMonth(b.billDate || b.createdAt) && !used.has(b.billId) && String(b.partyGstin || '').trim()).map(b => ({ type: 'Purchase bill', gstin: String(b.partyGstin).toUpperCase(), party: b.partyName, no: b.vendorBillNo || b.billNo, date: b.billDate, value: r2(b.grandTotal), ...bTax(b), ours: b.billNo || b.billId, state: 'books' })) : [];
      return { portal, rows: [...rows, ...extra] };
    }
    const portal = data.r1 ? rows1(data.r1, names) : null;
    const sb = bills.sb.filter(b => b.type !== 'purchase' && !dead(b.status));
    const byNo = {}; sb.forEach(b => { byNo[nkey(b.billNo || b.billId)] = b; });
    const used = new Set();
    const rows = (portal || []).map(r => {
      if (r.summary || !r.no || /note/i.test(r.type)) return { ...r, state: 'info' };
      const b = byNo[nkey(r.no)];
      if (b) used.add(b.billId);
      const bt = b ? bTax(b) : null;
      return { ...r, party: r.party || b?.partyName || '', ours: b ? String(b.billNo || b.billId) : '', oursDate: b ? b.billDate : '', state: b ? (Math.abs(r2(bt.taxable) - r2(r.taxable)) > 1 || Math.abs(tax(bt) - tax(r)) > 1 ? 'diff' : 'match') : 'portal', bookTax: bt ? tax(bt) : null };
    });
    const extra = portal ? sb.filter(b => inMonth(b.billDate || b.createdAt) && !used.has(b.billId) && String(b.partyGstin || '').trim()).map(b => ({ type: 'Sales bill', gstin: String(b.partyGstin).toUpperCase(), party: b.partyName, no: b.billNo, date: b.billDate, value: r2(b.grandTotal), ...bTax(b), ours: b.billNo, state: 'books' })) : [];
    return { portal, rows: [...rows, ...extra] };
  }, [bills, data, tab, period, names]);

  const w = q.trim().toLowerCase();
  const shown = (view?.rows || []).filter(r => (show === 'all' || r.state === show || (show === 'match' && r.state === 'info')) && (!w || `${r.gstin} ${r.party} ${r.no} ${r.ours || ''}`.toLowerCase().includes(w)));
  const count = s => (view?.rows || []).filter(r => r.state === s).length;
  const portalRows = (view?.rows || []).filter(r => r.state !== 'books');
  const fys = [thisFy, thisFy - 1, thisFy - 2, thisFy - 3];
  const retName = tab === 'r2b' ? 'GSTR-2B' : 'GSTR-1';
  const got = idx[period]?.[tab];
  const STATE = { match: ['In books', '#067647', '#ECFDF3'], diff: ['Amount differs', '#B54708', '#FFFAEB'], portal: ['Not in books', '#B42318', '#FEF3F2'], books: [tab === 'r2b' ? 'Not in 2B' : 'Not in GSTR-1', '#6941C6', '#F4F3FF'], info: ['Summary', '#475467', '#F2F4F7'] };

  const xl = () => excel(`${retName}_portal_${period}`, [{ name: retName, widths: [16, 18, 34, 18, 12, 14, 14, 12, 12, 12, 22, 16], rows: [
    ['Type', 'GSTIN', 'Party', 'Invoice / note no.', 'Date', 'Value', 'Taxable', 'IGST', 'CGST', 'SGST', 'Our bill', 'Status'],
    ...shown.map(r => [r.type, r.gstin, r.party, r.no, r.date ? dmy(r.date) : '', r2(r.value), r2(r.taxable), r2(r.igst), r2(r.cgst), r2(r.sgst), r.ours || '', STATE[r.state][0]])] }]);

  return (
    <div className="sb">
      <style>{SALES_CSS + PX_CSS + ACC_CSS + BK_CSS + GP_CSS}</style>
      <div className="sb-tabs" role="tablist">
        {[['r2b', 'GSTR-2B (purchases)'], ['r1', 'GSTR-1 (sales)']].map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={tab === k} className={`sb-tab${tab === k ? ' on' : ''}`} onClick={() => { setTab(k); setShow('all'); }}>{l}</button>)}
        <div className="sb-slot" ref={setSlot} />
      </div>
      {slot && createPortal(<>
        <input className="sb-search" style={{ width: 210 }} value={q} onChange={e => setQ(e.target.value)} placeholder="Search GSTIN, party, invoice…" aria-label="Search" />
        <select className="sb-search" style={{ width: 112 }} value={fy} onChange={e => setFy(+e.target.value)} aria-label="Financial year">{fys.map(y => <option key={y} value={y}>{fyName(y)}</option>)}</select>
        <button type="button" className="sb-tbtn" onClick={xl} disabled={!shown.length}><Svg name="chart" size={13} />Excel</button>
      </>, slot)}

      <Downloader companyId={companyId} fy={fy} idx={idx} cur={mon} startRef={startRef} onDone={() => setReload(x => x + 1)} />

      <div className="gp-months" role="tablist" aria-label="Month">
        {MONTHS.map((m, i) => { const p = perOf(fy, i), d = idx[p] || {}; return (
          <button key={p} type="button" role="tab" aria-selected={mon === i} className={mon === i ? 'on' : ''} onClick={() => setMon(i)}>
            <b>{m} {p.slice(4)}</b><span>{(() => { const rs = r1State(d, now); return rs
              ? <i className={rs.ready ? 'r' : 'w'} title={rs.ready ? 'GSTR-1 ready to download' : `GSTR-1 being made on the portal — ready about ${hm(rs.readyAt)}`}>{rs.ready ? 'R1 ready' : `R1 ${rs.left}m`}</i>
              : <i className={d.r1 ? 'y' : ''} title={d.r1 ? 'GSTR-1 downloaded' : 'GSTR-1 not downloaded'}>R1</i>; })()}<i className={d.r2b ? 'y' : ''} title={d.r2b ? 'GSTR-2B downloaded' : 'GSTR-2B not downloaded'}>2B</i></span>
          </button>); })}
      </div>

      {!view ? <div className="sb-empty" style={{ padding: 30 }}>Loading…</div>
        : !got && tab === 'r1' && r1State(idx[period], now) ? <R1Wait rs={r1State(idx[period], now)} label={perLabel(period)} onDownload={() => startRef.current && startRef.current([period], ['r1'])} />
        : !got ? <div className="sb-empty" style={{ padding: 34 }}>{retName} of <b>{perLabel(period)}</b> is not downloaded yet — tick the month above and press <b>Download from portal</b>.</div>
          : !view.portal ? <div className="sb-empty" style={{ padding: 30 }}>Reading {retName}…</div>
            : <>
              <div className="bk-bar"><div className="ac-sum">
                <div>{retName} lines<b>{portalRows.length}</b></div>
                <div>Taxable ₹<b>{amt(sum(portalRows, 'taxable'))}</b></div>
                <div>{tab === 'r2b' ? 'ITC' : 'Tax'} ₹<b>{amt(sum(portalRows, 'igst') + sum(portalRows, 'cgst') + sum(portalRows, 'sgst'))}</b></div>
                <div>Downloaded<b style={{ fontSize: 12 }}>{new Date(got.at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</b></div>
              </div>
                <div className="ac-seg" role="group" aria-label="Show">
                  {[['all', 'All'], ['match', 'In books'], ['diff', 'Differs'], ['portal', 'Not in books'], ['books', tab === 'r2b' ? 'Not in 2B' : 'Not in GSTR-1']].map(([k, l]) => <button key={k} type="button" className={show === k ? 'on' : ''} aria-pressed={show === k} onClick={() => setShow(k)}>{l}{k !== 'all' && <span className="gp-n">{count(k)}</span>}</button>)}
                </div>
              </div>
              <div className="bk-wrap">
                <table className="bk gp-t">
                  <colgroup><col style={{ width: 140 }} /><col /><col style={{ width: 136 }} /><col style={{ width: 90 }} /><col style={{ width: 110 }} /><col style={{ width: 110 }} /><col style={{ width: 98 }} /><col style={{ width: 98 }} /><col style={{ width: 98 }} /><col style={{ width: 136 }} /><col style={{ width: 118 }} /></colgroup>
                  <thead><tr><th>GSTIN</th><th>Party</th><th>Invoice / note</th><th>Date</th><th className="r">Value</th><th className="r">Taxable</th><th className="r">IGST</th><th className="r">CGST</th><th className="r">SGST</th><th>Our bill</th><th>Status</th></tr></thead>
                  <tbody>
                    {shown.map((r, i) => { const s = STATE[r.state]; return (
                      <tr key={i}>
                        <td className="mono">{r.gstin || '—'}</td><td title={r.party}>{r.party || '—'}</td>
                        <td className="mono" title={r.no}>{r.no || '—'}<span className="sm">{r.type}{r.rev ? ' · reverse charge' : ''}</span>{r.itc === false && <span className="sm" style={{ color: '#B42318' }}>ITC not available</span>}</td><td className="d">{r.date ? dmy(r.date) : '—'}</td>
                        <td className="r">{amt(r.value)}</td><td className="r">{amt(r.taxable)}</td><td className="r">{amtZ(r.igst)}</td><td className="r">{amtZ(r.cgst)}</td><td className="r">{amtZ(r.sgst)}</td>
                        <td className="mono">{r.ours || '—'}{r.oursDate && r.state !== 'books' && <span className="sm">{dmy(r.oursDate)}</span>}{r.state === 'diff' && r.bookTax != null && <span className="sm">books tax ₹ {amt(r.bookTax)}</span>}</td>
                        <td><span className="gp-st" style={{ color: s[1], background: s[2] }}>{s[0]}</span></td>
                      </tr>); })}
                    {!shown.length && <tr><td colSpan={11} className="sb-empty">Nothing to show.</td></tr>}
                  </tbody>
                  {shown.length > 0 && <tfoot><tr><td colSpan={4}>Total ({shown.length})</td><td className="r">{amt(sum(shown, 'value'))}</td><td className="r">{amt(sum(shown, 'taxable'))}</td><td className="r">{amt(sum(shown, 'igst'))}</td><td className="r">{amt(sum(shown, 'cgst'))}</td><td className="r">{amt(sum(shown, 'sgst'))}</td><td colSpan={2} /></tr></tfoot>}
                </table>
                <div className="gp-note">{tab === 'r2b'
                  ? 'Matched with purchase bills by supplier GSTIN + invoice no. (any month). "Not in books" = in 2B but not entered; "Not in 2B" = our purchase bill of this month that the supplier has not filed — hold its ITC.'
                  : 'Matched with sales bills by invoice no. "Not in books" = filed on the portal but no such bill here; "Not in GSTR-1" = our bill of this month (with a GSTIN) that was not filed.'}</div>
              </div>
            </>}
    </div>
  );
}

/* GSTR-1 being made on the portal: in progress (with the time left), then ready to download */
function R1Wait({ rs, label, onDownload }) {
  const pct = Math.min(100, Math.round(100 - (rs.left / R1_MIN) * 100));
  return (
    <div className={`gp-wait${rs.ready ? ' ready' : ''}`} role="status">
      <span className="ic"><Svg name={rs.ready ? 'check' : 'clock'} size={18} /></span>
      <div className="tx">
        <b>{rs.ready ? `GSTR-1 of ${label} is ready to download` : `GSTR-1 of ${label} — in progress on the GST portal`}</b>
        <span>{rs.ready ? `Asked for at ${hm(rs.at)}. Press Download — the robot logs in (you type the captcha) and takes the file; nothing is asked for again.`
          : `Asked for at ${hm(rs.at)} · ready about ${hm(rs.readyAt)} (${rs.left} min left). The portal makes this file in about ${R1_MIN} minutes — come back then.`}</span>
        {!rs.ready && <div className="bar"><i style={{ width: `${pct}%` }} /></div>}
      </div>
      <button type="button" className={`sf-b ${rs.ready ? 'pri' : 'ghost'}`} onClick={onDownload} title={rs.ready ? '' : 'You can try now — if the file is not ready yet it stays in progress'}>{rs.ready ? 'Download GSTR-1' : 'Try now'}</button>
    </div>
  );
}

/* ── the download panel: months, returns, progress, captcha / OTP ── */
const JOB_KEY = co => `gst-portal-job-${co}`;
function Downloader({ companyId, fy, idx, cur, onDone, startRef }) {
  const [open, setOpen] = useState(false);
  const [pick, setPick] = useState(() => new Set([cur]));
  const [what, setWhat] = useState({ r1: true, r2b: true });
  const [job, setJob] = useState(null);
  const [err, setErr] = useState('');
  const [ans, setAns] = useState('');
  const [sent, setSent] = useState(0);
  const timer = useRef(null);
  useEffect(() => { setPick(new Set([cur])); }, [cur, fy]);
  const poll = id => {
    clearTimeout(timer.current);
    const tick = async () => {
      let j; try { j = (await axios.get(`/api/eway-helper/jobs/${id}`)).data; } catch { timer.current = setTimeout(tick, 2500); return; }
      setJob(j);
      if (['done', 'failed'].includes(j.status)) { try { sessionStorage.removeItem(JOB_KEY(companyId)); } catch { /* ignore */ } onDone(); return; }
      timer.current = setTimeout(tick, 1500);
    };
    tick();
  };
  useEffect(() => {   // a download still running (page opened again): show it
    let id = null; try { id = sessionStorage.getItem(JOB_KEY(companyId)); } catch { /* ignore */ }
    if (id) { setOpen(true); poll(id); }
    return () => clearTimeout(timer.current);
  }, [companyId]); // eslint-disable-line react-hooks/exhaustive-deps
  const start = async (only, onlyWhat) => {
    setErr(''); setAns(''); setSent(0);
    const periods = only || [...pick].sort((a, b) => a - b).map(i => perOf(fy, i));
    const w = onlyWhat || Object.keys(what).filter(k => what[k]);
    if (only) setOpen(true);
    if (!periods.length || !w.length) return setErr('Tick at least one month and one return.');
    try {
      const j = (await axios.post('/api/eway-helper/jobs', { companyId, kind: 'gstret', periods, what: w })).data;
      try { sessionStorage.setItem(JOB_KEY(companyId), j.id); } catch { /* ignore */ }
      setJob(j); poll(j.id);
    } catch (e) { setErr(e.response?.data?.error || 'Could not start the download.'); }
  };
  const answer = async refresh => {
    if (!job) return;
    try { await axios.post(`/api/eway-helper/jobs/${job.id}/captcha`, refresh ? { seq: job.captchaSeq, refresh: true } : { seq: job.captchaSeq, answer: ans.trim() }); setSent(job.captchaSeq); setAns(''); }
    catch (e) { setErr(e.response?.data?.error || 'Could not send it — try again.'); }
  };
  const stop = () => { if (job) axios.post(`/api/eway-helper/jobs/${job.id}/cancel`).catch(() => {}); };
  const running = job && !['done', 'failed'].includes(job.status);
  if (startRef) startRef.current = running ? null : start;
  const asking = running && (job.status === 'captcha' || job.status === 'otp') && job.captchaSeq && sent !== job.captchaSeq;
  const RES = { saved: ['✓', '#067647'], requested: ['⏳', '#B54708'], waiting: ['…', '#B54708'], none: ['—', '#667085'], error: ['✕', '#B42318'] };
  return (
    <div className="gp-dl">
      <div className="gp-dl-h">
        <span className="ic"><Svg name="sync" size={14} /></span>
        <div><b>Download from the GST portal</b><span>Logs in with the GST login saved in Password Manager — you type only the captcha (and OTP, if asked) here.</span></div>
        <span className="grow" />
        {!running && <button type="button" className="sf-b pri" onClick={() => setOpen(o => !o)}>{open ? 'Close' : 'Download from portal'}</button>}
        {running && <button type="button" className="sf-b ghost" onClick={stop}>Stop</button>}
      </div>
      {open && !running && (
        <div className="gp-dl-b">
          <div className="gp-pick" role="group" aria-label="Months to download">
            {MONTHS.map((m, i) => { const p = perOf(fy, i), on = pick.has(i), d = idx[p] || {}; return (
              <label key={p} className={on ? 'on' : ''}><input type="checkbox" checked={on} onChange={() => setPick(s => { const n = new Set(s); if (n.has(i)) n.delete(i); else n.add(i); return n; })} />{m} {p.slice(4)}{(d.r1 || d.r2b) && <em title="Already downloaded — downloading again replaces it">✓</em>}</label>); })}
            <button type="button" className="sf-lnk" onClick={() => setPick(new Set(MONTHS.map((_, i) => i).filter(i => new Date(+perOf(fy, i).slice(2), +perOf(fy, i).slice(0, 2) - 1, 1) < new Date(new Date().getFullYear(), new Date().getMonth(), 1))))}>Whole year so far</button>
          </div>
          <div className="gp-row">
            <label><input type="checkbox" checked={what.r1} onChange={e => setWhat(o => ({ ...o, r1: e.target.checked }))} />GSTR-1</label>
            <label><input type="checkbox" checked={what.r2b} onChange={e => setWhat(o => ({ ...o, r2b: e.target.checked }))} />GSTR-2B</label>
            <span className="grow" />
            <button type="button" className="sf-b pri" onClick={() => start()}>Start download ({pick.size} month{pick.size === 1 ? '' : 's'})</button>
          </div>
          <div className="gp-hint">GSTR-1: the portal makes the file on request in about 20 minutes — the month shows “In progress”, then “Ready” with a Download button. GSTR-2B is ready after the 14th of the next month.</div>
        </div>
      )}
      {err && <div className="sf-msg err" role="alert" style={{ margin: '0 12px 10px' }}>{err}</div>}
      {job && (
        <div className="gp-job" role="status" aria-live="polite">
          <div className={`gp-msg ${job.status}`}>{running && <span className="gp-spin" />}{job.message}</div>
          {asking && (
            <form className="gp-cap" onSubmit={e => { e.preventDefault(); if (ans.trim()) answer(false); }}>
              {job.ask !== 'otp' && job.captchaImg && <img src={job.captchaImg} alt="Captcha" />}
              <input autoFocus value={ans} onChange={e => setAns(e.target.value)} placeholder={job.ask === 'otp' ? 'OTP' : 'Type the captcha'} inputMode={job.ask === 'otp' ? 'numeric' : 'text'} aria-label={job.ask === 'otp' ? 'OTP' : 'Captcha'} autoComplete="off" />
              <button type="submit" className="sf-b pri" disabled={!ans.trim()}>{job.ask === 'otp' ? 'Verify' : 'Login'}</button>
              {job.ask !== 'otp' && <button type="button" className="sf-lnk" onClick={() => answer(true)}>New captcha</button>}
            </form>
          )}
          {(job.results || []).length > 0 && (
            <div className="gp-res">{job.results.map(r => { const s = RES[r.status] || RES.none; return (
              <span key={r.period + r.kind} title={r.message}><b style={{ color: s[1] }}>{s[0]}</b>{perLabel(r.period)} {r.kind === 'r1' ? 'GSTR-1' : 'GSTR-2B'}<i>{r.message}</i></span>); })}</div>
          )}
        </div>
      )}
    </div>
  );
}

const GP_CSS = `
.gp-dl { margin:10px 12px 0; border:1px solid #CFE0E3; border-radius:6px; background:#fff; }
.gp-dl-h { display:flex; align-items:center; gap:10px; padding:9px 12px; }
.gp-dl-h .ic { width:28px; height:28px; border-radius:6px; display:grid; place-items:center; background:#E1EFF0; color:${TEAL}; flex-shrink:0; }
.gp-dl-h b { display:block; font-size:13px; color:#101828; } .gp-dl-h span:not(.ic):not(.grow) { font-size:11.5px; color:#667085; }
.gp-dl-h .grow, .gp-row .grow { flex:1; }
.gp-dl-b { border-top:1px solid #E4ECEE; padding:10px 12px; }
.gp-pick { display:flex; flex-wrap:wrap; gap:6px; align-items:center; }
.gp-pick label { display:inline-flex; align-items:center; gap:5px; padding:4px 9px; border:1px solid #C9D7DA; border-radius:4px; font-size:12px; cursor:pointer; background:#fff; }
.gp-pick label.on { border-color:${TEAL}; background:#E8F3F4; color:${TEAL}; font-weight:600; }
.gp-pick input, .gp-row input { width:auto; height:auto; margin:0; }
.gp-pick em { font-style:normal; color:#067647; font-weight:700; }
.gp-row { display:flex; align-items:center; gap:16px; margin-top:10px; font-size:12.5px; }
.gp-row label { display:inline-flex; align-items:center; gap:6px; cursor:pointer; font-weight:600; }
.gp-hint { margin-top:8px; font-size:11.5px; color:#667085; }
.gp-job { border-top:1px solid #E4ECEE; padding:10px 12px; }
.gp-msg { display:flex; align-items:center; gap:8px; font-size:12.5px; color:#344054; }
.gp-msg.done { color:#067647; font-weight:600; } .gp-msg.failed { color:#B42318; font-weight:600; }
.gp-spin { width:13px; height:13px; border:2px solid #CFE0E3; border-top-color:${TEAL}; border-radius:50%; animation:gpspin .8s linear infinite; flex-shrink:0; }
@keyframes gpspin { to { transform:rotate(360deg); } }
.gp-cap { display:flex; align-items:center; gap:8px; margin-top:9px; flex-wrap:wrap; }
.gp-cap img { height:44px; border:1px solid #C9D7DA; border-radius:4px; background:#fff; }
.gp-cap input { width:170px; height:34px; border:1px solid #C9D7DA; border-radius:4px; padding:0 10px; font-size:14px; letter-spacing:1px; }
.gp-cap input:focus { outline:none; border-color:#2A9DAA; box-shadow:0 0 0 3px rgba(42,157,170,.15); }
.gp-res { display:flex; flex-direction:column; gap:3px; margin-top:9px; font-size:12px; }
.gp-res span { display:flex; gap:7px; align-items:baseline; } .gp-res b { width:12px; } .gp-res i { font-style:normal; color:#667085; }
.gp-months { display:flex; gap:4px; padding:10px 12px 0; overflow-x:auto; }
.gp-months button { flex:1; min-width:70px; border:1px solid #D5E2E4; background:#fff; border-radius:5px; padding:5px 4px; cursor:pointer; display:flex; flex-direction:column; align-items:center; gap:3px; font:inherit; }
.gp-months button b { font-size:12px; color:#344054; }
.gp-months button.on { border-color:${TEAL}; background:${TEAL}; } .gp-months button.on b { color:#fff; }
.gp-months i { font-style:normal; font-size:9.5px; font-weight:700; padding:0 4px; border-radius:3px; margin:0 1px; color:#98A2B3; background:#F2F4F7; }
.gp-months i.y { color:#067647; background:#DCFAE6; }
.gp-months i.w { color:#B54708; background:#FEF0C7; } .gp-months i.r { color:#fff; background:#1570EF; }
.gp-months button.on i.w { background:#FEF0C7; } .gp-months button.on i.r { background:#53B1FD; }
.gp-wait { display:flex; align-items:center; gap:14px; margin:14px 12px; padding:16px 18px; border:1px solid #FEDF89; background:#FFFCF5; border-radius:8px; }
.gp-wait.ready { border-color:#B2DDFF; background:#F5FAFF; }
.gp-wait .ic { width:40px; height:40px; border-radius:50%; display:grid; place-items:center; background:#FEF0C7; color:#B54708; flex-shrink:0; }
.gp-wait.ready .ic { background:#D1E9FF; color:#1570EF; }
.gp-wait .tx { flex:1; min-width:0; } .gp-wait b { display:block; font-size:14px; color:#101828; } .gp-wait span { font-size:12.5px; color:#475467; }
.gp-wait .bar { height:6px; border-radius:99px; background:#FEF0C7; margin-top:9px; overflow:hidden; max-width:420px; }
.gp-wait .bar i { display:block; height:100%; background:#F79009; border-radius:99px; transition:width .6s; }
.gp-n { margin-left:5px; font-size:10.5px; opacity:.75; }
.gp-st { display:inline-block; padding:1px 8px; border-radius:99px; font-size:11px; font-weight:700; white-space:nowrap; }
.gp-t { table-layout:fixed; width:100%; }
.gp-t td { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; vertical-align:top; }
.gp-t td .sm { display:block; font-size:10.5px; color:#667085; font-family:inherit; font-weight:400; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.gp-note { padding:8px 12px; font-size:11.5px; color:#667085; line-height:1.6; }
`;
