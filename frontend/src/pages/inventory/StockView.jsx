import { useState, useEffect, useMemo, useCallback } from 'react';
import axios from 'axios';
import { useCompany } from '../../context/CompanyContext';
import { withPrintFont } from '../../utils/printFont';

/* ──────────────────────────────────────────────
   STOCK VIEW — one row per material line of every bill.
   Sales bill (client)    → Outward
   Purchase bill (vendor) → Inward
──────────────────────────────────────────────── */

const HDR   = '#3A6186';
const HDR2  = '#2A4D6E';
const OUT_C = '#B91C1C';
const IN_C  = '#15803D';
const LINE  = '1px solid #000';
const CLOSE_HDR = '#1E3A8A';  // closing stock column header
const CLOSE_C   = '#1E3A8A';  // closing stock value (red when negative)

const fmt  = n => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtQ = n => Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 3 });
const fmtD = d => {
  if (!d) return '—';
  const dt = new Date(d);
  if (isNaN(dt)) return String(d);
  return `${String(dt.getDate()).padStart(2, '0')}-${String(dt.getMonth() + 1).padStart(2, '0')}-${dt.getFullYear()}`;
};

const getFY = (dateStr) => {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d)) return null;
  const s = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  return `${s}-${String(s + 1).slice(-2)}`;
};
const currentFY = getFY(new Date().toISOString());

/* Freight / packing / insurance etc. are bill charges, not materials. */
const CHARGE_RE = /^\s*(packing|p\s*&\s*f|freight|insurance|other|transport|courier|forwarding|loading|unloading|erection|charges?)\b/i;

/* Sales bills tag real material lines with itemIdx; charge lines have none.
   Older bills without any itemIdx fall back to the charge-name check. */
const hasQty = it => (parseFloat(it.qty) || 0) > 0; // lines left unbilled are saved with qty 0
const salesMaterialLines = (b) => {
  const items = b.items || [];
  const tagged = items.filter(it => it.itemIdx !== undefined && it.itemIdx !== null);
  const lines = tagged.length ? tagged : items.filter(it => !CHARGE_RE.test(it.description || it.itemName || ''));
  return lines.filter(hasQty);
};
/* Purchase bills add charges as qty-1 "LOT" lines named after the charge. */
const purchaseMaterialLines = (b) =>
  (b.items || []).filter(it => hasQty(it) && !CHARGE_RE.test(it.description || it.itemName || ''));

/* One stock item = one material name, ignoring case, spacing and punctuation,
   so "Mobile Toilet Van 10 Seater" = "MOBILE TOILET VAN 10 SEATER" and
   "20X8X8. 5 FT" = "20X8X8.5 FT", while "06 Seater" and "10 Seater" differ. */
const stockItemKey = name => String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/* Company logo as base64 so it shows in the print window (same as other reports). */
const fetchLogoBase64 = async (logoFileName, companyId) => {
  if (!logoFileName) return null;
  try {
    const res = await fetch(`/api/companies/logo/${encodeURIComponent(logoFileName)}?companyId=${companyId}`);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise(r => { const rd = new FileReader(); rd.onload = () => r(rd.result); rd.readAsDataURL(blob); });
  } catch { return null; }
};

const isLive = b => !['rejected', 'cancelled', 'canceled'].includes(String(b.status || '').toLowerCase());

export default function StockView() {
  const { selectedCompany } = useCompany();
  const cid = selectedCompany?.companyId;

  const [salesBills, setSalesBills] = useState([]);
  const [purBills,   setPurBills]   = useState([]);
  const [salesOrders, setSOs]       = useState([]);
  const [purOrders,  setPOs]        = useState([]);
  const [loading,    setLoading]    = useState(true);

  const [search, setSearch] = useState('');
  const [dir,    setDir]    = useState('all');      // all | out | in
  const [fy,     setFy]     = useState(currentFY);

  const load = useCallback(async () => {
    if (!cid) return;
    setLoading(true);
    const get = url => axios.get(url).then(r => r.data || []).catch(() => []);
    const [sb, pb, so, po] = await Promise.all([
      get(`/api/bills?companyId=${cid}&type=sales`),
      get(`/api/bills?companyId=${cid}&type=purchase`),
      get(`/api/sales-orders?companyId=${cid}`),
      get(`/api/purchase-orders?companyId=${cid}`),
    ]);
    setSalesBills(Array.isArray(sb) ? sb : []);
    setPurBills(Array.isArray(pb) ? pb : []);
    setSOs(Array.isArray(so) ? so : []);
    setPOs(Array.isArray(po) ? po : []);
    setLoading(false);
  }, [cid]);

  useEffect(() => { load(); }, [load]);

  /* Flatten every bill into material rows. */
  const allRows = useMemo(() => {
    const soById = {}; salesOrders.forEach(o => { soById[String(o.orderId)] = o; });
    const poById = {}; purOrders.forEach(o => { poById[String(o.orderId)] = o; });
    const rows = [];

    salesBills.filter(isLive).forEach(b => {
      const so = soById[String(b.orderId)];
      salesMaterialLines(b).forEach((it, i) => {
        const qty = parseFloat(it.qty) || 0, rate = parseFloat(it.rate) || 0;
        rows.push({
          key: `S-${b.billId}-${i}`, dir: 'out',
          party:   (b.partyName || so?.customerName || '').trim() || '—',
          fileNo:  b.orderNo || so?.orderNo || '—',
          orderNo: so?.customerPO || '—',
          material: it.itemName || it.description || '—',
          qty, rate, taxable: it.taxable != null ? parseFloat(it.taxable) || 0 : qty * rate,
          billNo: b.billNo || b.billId, billDate: b.billDate, createdAt: b.createdAt,
        });
      });
    });

    purBills.filter(isLive).forEach(b => {
      const po = poById[String(b.orderId)];
      const so = po ? soById[String(po.linkedSalesOrderId)] : null;
      purchaseMaterialLines(b).forEach((it, i) => {
        const qty = parseFloat(it.qty) || 0, rate = parseFloat(it.rate) || 0;
        rows.push({
          key: `P-${b.billId}-${i}`, dir: 'in',
          party:   (b.partyName || po?.vendorName || '').trim() || '—',
          fileNo:  so?.orderNo || '—',
          orderNo: b.orderNo || po?.poNo || po?.poNumber || '—',
          material: it.description || it.itemName || '—',
          qty, rate, taxable: it.taxable != null ? parseFloat(it.taxable) || 0 : qty * rate,
          billNo: b.vendorBillNo || b.billNo || b.billId, billDate: b.billDate, createdAt: b.createdAt,
        });
      });
    });

    /* Material A → Z (rows without a material go last); for the same
       material the newest invoice comes first. Sorting on the stock-item key
       keeps every row of one item together. */
    rows.forEach(r => {
      r.itemKey = stockItemKey(r.material);
      /* search text: every searchable field, with spacing/punctuation evened out */
      r.hay    = stockItemKey([r.party, r.fileNo, r.orderNo, r.material, r.billNo, fmtD(r.billDate)].join(' '));
      r.tokens = r.hay.split(' ');
      r.haySq  = r.hay.replace(/ /g, '');
    });
    return rows.sort((a, b) =>
      ((a.material === '—') - (b.material === '—')) ||
      a.itemKey.localeCompare(b.itemKey, 'en', { numeric: true }) ||
      (new Date(b.billDate || 0) - new Date(a.billDate || 0)) ||
      (new Date(b.createdAt || 0) - new Date(a.createdAt || 0)));
  }, [salesBills, purBills, salesOrders, purOrders]);

  const fyOptions = useMemo(() => {
    const s = new Set(allRows.map(r => getFY(r.billDate)).filter(Boolean));
    s.add(currentFY);
    return [...s].sort().reverse();
  }, [allRows]);

  /* Search ignores case, extra spaces and punctuation, and every typed word
     must appear in the row (any order). A word matches the START of a word
     in the row, so "02" finds "02 SEATER" but not invoice "…/002" or "2024".
     Words of 4+ characters may also match inside a word or across a space,
     so "biodigester" finds "BIO DIGESTER TANK" and "rail" finds "Transrail". */
  const matchesSearch = useMemo(() => {
    const words = stockItemKey(search).split(' ').filter(Boolean);
    if (!words.length) return () => true;
    return r => words.every(w =>
      r.tokens.some(t => t.startsWith(w)) || (w.length >= 4 && r.haySq.includes(w)));
  }, [search]);

  /* FY + search first, so the All / Outward / Inward counts match what you see. */
  const baseRows = useMemo(() => allRows.filter(r =>
    (fy === 'all' || getFY(r.billDate) === fy) && matchesSearch(r)
  ), [allRows, fy, matchesSearch]);

  /* When a search finds nothing in the chosen year, say how many it finds in other years. */
  const otherYearHits = useMemo(() => {
    if (fy === 'all' || !search.trim() || baseRows.length) return 0;
    return allRows.filter(matchesSearch).length;
  }, [allRows, baseRows, fy, search, matchesSearch]);

  const rows = useMemo(() => dir === 'all' ? baseRows : baseRows.filter(r => r.dir === dir), [baseRows, dir]);

  /* true for the first row of each new stock item → draws the line above it */
  const startsGroup = useMemo(
    () => rows.map((r, i) => i > 0 && r.itemKey !== rows[i - 1].itemKey),
    [rows]);
  /* Rows per stock item, stored on the item's first row (0 elsewhere) — the
     closing stock cell spans the whole item so its number sits in the middle. */
  const groupSpan = useMemo(() => {
    const span = new Array(rows.length).fill(0);
    let start = 0;
    rows.forEach((r, i) => {
      if (i > 0 && r.itemKey !== rows[i - 1].itemKey) start = i;
      span[start] += 1;
    });
    return span;
  }, [rows]);

  /* Closing stock per item = Inward − Outward of every bill up to the end of
     the selected FY (earlier years included, so it is a true balance).
     Search and the Outward / Inward buttons only change which rows are listed. */
  const periodEnd = fy === 'all' ? null : `31-03-${Number(fy.slice(0, 4)) + 1}`;
  /* Also keeps the part from before the FY (opening) so the cell can show
     where a balance that is not explained by the listed rows comes from. */
  const periodStart = fy === 'all' ? null : `01-04-${fy.slice(0, 4)}`;
  const closing = useMemo(() => {
    const end   = fy === 'all' ? Infinity  : new Date(Number(fy.slice(0, 4)) + 1, 2, 31, 23, 59, 59).getTime();
    const start = fy === 'all' ? -Infinity : new Date(Number(fy.slice(0, 4)), 3, 1).getTime();
    const m = {};
    allRows.forEach(r => {
      const t = new Date(r.billDate).getTime();
      if (!isNaN(t) && t > end) return;
      const c = m[r.itemKey] || (m[r.itemKey] = { in: 0, out: 0, openIn: 0, openOut: 0 });
      c[r.dir] += r.qty;
      if (!isNaN(t) && t < start) c[r.dir === 'in' ? 'openIn' : 'openOut'] += r.qty;
    });
    return m;
  }, [allRows, fy]);
  /* Footer: closing stock summed over the items currently listed. */
  const closingTotal = useMemo(
    () => [...new Set(rows.map(r => r.itemKey))]
      .reduce((s, k) => s + ((closing[k]?.in || 0) - (closing[k]?.out || 0)), 0),
    [rows, closing]);

  const counts = useMemo(() => ({
    all: baseRows.length,
    out: baseRows.filter(r => r.dir === 'out').length,
    in:  baseRows.filter(r => r.dir === 'in').length,
  }), [baseRows]);

  const tot = useMemo(() => rows.reduce((t, r) => {
    t[r.dir].qty += r.qty; t[r.dir].taxable += r.taxable; return t;
  }, { out: { qty: 0, taxable: 0 }, in: { qty: 0, taxable: 0 } }), [rows]);

  /* ── Print — exactly what is on screen (filters, item lines, closing stock),
     A4 landscape with the company header, like the other reports. ── */
  const [printing, setPrinting] = useState(false);
  const doPrint = async () => {
    if (!rows.length) return;
    const w = window.open('', '_blank', 'width=1200,height=900');
    if (!w) { alert('Allow pop-ups to print.'); return; }
    w.document.write('<p style="font-family:Arial;padding:20px">Preparing print…</p>');
    setPrinting(true);
    const co = selectedCompany || {};
    const logo = await fetchLogoBase64(co.logoFileName, cid);
    setPrinting(false);

    const today = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    const view = dir === 'out' ? 'Outward only' : dir === 'in' ? 'Inward only' : 'Outward & Inward';
    const subtitle = [
      fy === 'all' ? 'All Years' : `FY ${fy}`,
      view,
      search.trim() ? `Search: “${esc(search.trim())}”` : '',
      `${rows.length} ${rows.length === 1 ? 'line' : 'lines'}`,
      periodEnd ? `Closing as on ${periodEnd}` : '',
      `Printed: ${today}`,
    ].filter(Boolean).join(' &middot; ');

    const widths = ['3%', '11%', '8.5%', '8.5%', '9.5%', '6.5%', '', '3.5%', '7%', '7.5%', '4.5%', '4.5%', '6%'];
    const heads  = ['Sr No', 'Client / Vendor Name', 'File No', 'Order No', 'Invoice No', 'Invoice Date', 'Material Name',
                    'Qty', 'Rate (₹)', 'Taxable (₹)', 'Outward', 'Inward', 'Closing Stock'];
    const align  = ['c', '', '', '', '', 'c', '', 'c', 'r', 'r', 'c', 'c', 'c'];

    const body = rows.map((r, i) => {
      let closeCell = '';
      if (groupSpan[i]) {
        const c = closing[r.itemKey] || { in: 0, out: 0, openIn: 0, openOut: 0 };
        const bal = c.in - c.out, open = c.openIn - c.openOut;
        closeCell = `<td rowspan="${groupSpan[i]}" class="c close${bal < 0 ? ' neg' : ''}">`
          + (periodStart && open !== 0 ? `<div class="open">Opening ${fmtQ(open)}</div>` : '')
          + `${fmtQ(bal)}</td>`;
      }
      return `<tr${startsGroup[i] ? ' class="sep"' : ''}>`
        + `<td class="c b">${i + 1}</td>`
        + `<td class="b">${esc(r.party)}</td>`
        + `<td>${esc(r.fileNo)}</td>`
        + `<td>${esc(r.orderNo)}</td>`
        + `<td class="b">${esc(r.billNo)}</td>`
        + `<td class="c nw">${fmtD(r.billDate)}</td>`
        + `<td>${esc(r.material)}</td>`
        + `<td class="c b">${fmtQ(r.qty)}</td>`
        + `<td class="r nw">${fmt(r.rate)}</td>`
        + `<td class="r nw">${fmt(r.taxable)}</td>`
        + `<td class="c b ${r.dir === 'out' ? 'out' : 'dim'}">${r.dir === 'out' ? fmtQ(r.qty) : '—'}</td>`
        + `<td class="c b ${r.dir === 'in' ? 'in' : 'dim'}">${r.dir === 'in' ? fmtQ(r.qty) : '—'}</td>`
        + closeCell + '</tr>';
    }).join('');

    const foot = `<tr class="tot">`
      + `<td colspan="9">TOTAL (${rows.length} ${rows.length === 1 ? 'line' : 'lines'}${fy !== 'all' ? ` · FY ${fy}` : ''})</td>`
      + `<td class="r nw">${dir !== 'in' ? `<div class="out">${fmt(tot.out.taxable)}</div>` : ''}${dir !== 'out' ? `<div class="in">${fmt(tot.in.taxable)}</div>` : ''}</td>`
      + `<td class="c out">${dir === 'in' ? '—' : fmtQ(tot.out.qty)}</td>`
      + `<td class="c in">${dir === 'out' ? '—' : fmtQ(tot.in.qty)}</td>`
      + `<td class="c close${closingTotal < 0 ? ' neg' : ''}">${fmtQ(closingTotal)}</td></tr>`;

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Stock View${fy !== 'all' ? ` FY ${fy}` : ''}</title>
<style>*{margin:0;padding:0;box-sizing:border-box;}
body{font-family:Arial,Helvetica,sans-serif;font-size:7.5pt;color:#000;padding:10px;}
.box{border:1.5px solid #000;border-bottom:none;}
.co{padding:8px 10px;border-bottom:2px solid #000;}
h1{font-size:12.5pt;font-weight:bold;text-align:center;padding:5px;border-bottom:1px solid #000;}
.sub{font-size:8pt;text-align:center;color:#333;padding:3px 6px;}
table.data{width:100%;border-collapse:collapse;table-layout:fixed;font-size:7.5pt;border:1.5px solid #000;}
table.data th{border:1px solid #000;padding:4px 3px;font-weight:bold;background:#fff;text-align:left;}
table.data td{border-left:1px solid #000;border-right:1px solid #000;padding:2px 3px;vertical-align:top;word-break:break-word;}
table.data tr.sep td{border-top:1px solid #000;}
table.data tr.tot td{border:1px solid #000;font-weight:bold;background:#f0f0f0;vertical-align:middle;padding:4px 3px;}
.c{text-align:center !important;}.r{text-align:right !important;}.b{font-weight:bold;}.nw{white-space:nowrap;}
.out{color:#B91C1C;}.in{color:#15803D;}.dim{color:#bbb;}
td.close{font-weight:bold;font-size:9pt;color:#1E3A8A;vertical-align:middle !important;}
td.close.neg{color:#B91C1C;}
.open{font-size:6.5pt;font-weight:600;color:#555;white-space:nowrap;}
thead{display:table-header-group;} table.data tr{page-break-inside:avoid;}
@media print{@page{margin:8mm;size:A4 landscape;}}</style>
</head><body>
<div class="box">
  <div class="co">
    <div style="display:flex;align-items:center;gap:12px;">
      ${logo ? `<img src="${logo}" style="height:52px;max-width:150px;object-fit:contain;">` : ''}
      <div>
        <div style="font-size:13pt;font-weight:bold;">${esc(co.companyName || co.name || '')}</div>
        <div style="font-size:8.5pt;color:#333;">${esc([co.address, co.city, co.state, co.pincode].filter(Boolean).join(', '))}</div>
        <div style="font-size:8.5pt;color:#333;">${co.gstin || co.gst ? `GSTIN: ${esc(co.gstin || co.gst)}` : ''}${co.pan ? ` &nbsp;|&nbsp; PAN: ${esc(co.pan)}` : ''}</div>
      </div>
    </div>
  </div>
  <h1>Stock View</h1>
  <div class="sub">${subtitle}</div>
</div>
<table class="data">
  <colgroup>${widths.map(x => `<col${x ? ` style="width:${x}"` : ''}>`).join('')}</colgroup>
  <thead><tr>${heads.map((h, k) => `<th class="${align[k]}">${h}</th>`).join('')}</tr></thead>
  <tbody>${body}${foot}</tbody>
</table>
<script>window.onload=()=>setTimeout(()=>window.print(),400);</${'script'}></body></html>`;
    w.document.open();
    w.document.write(withPrintFont(html));
    w.document.close();
  };

  /* Widths are % of the screen so the table always fits — no sideways scroll.
     Material Name takes whatever is left (≈ 20%). */
  const COLS = [
    { h: 'Sr No',                 w: '3%',   align: 'center' },
    { h: 'Client / Vendor Name',  w: '10%',  align: 'left' },
    { h: 'File No',               w: '7.5%', align: 'left' },
    { h: 'Order No',              w: '9%',   align: 'left' },
    { h: 'Invoice No',            w: '8.5%', align: 'left' },
    { h: 'Invoice Date',          w: '6.5%', align: 'center' },
    { h: 'Material Name',         w: null,   align: 'left' },
    { h: 'Qty',                   w: '3.5%', align: 'center' },
    { h: 'Rate (₹)',              w: '7%',   align: 'right' },
    { h: 'Taxable (₹)',           w: '7.5%', align: 'right' },
    { h: 'Outward',               w: '5%',   align: 'center' },
    { h: 'Inward',                w: '5%',   align: 'center' },
    { h: 'Closing Stock',         w: '6%',   align: 'center' },
  ];

  /* Body cells: vertical column lines only — no horizontal line between rows. */
  const td = (extra = {}) => ({
    padding: '4px 5px', borderLeft: LINE, borderRight: LINE, borderTop: 'none', borderBottom: 'none',
    color: '#000', fontSize: 11.5, verticalAlign: 'top', ...extra,
  });
  const tf = (extra = {}) => td({ borderTop: LINE, borderBottom: LINE, ...extra }); // totals row

  const Seg = ({ k, label, color }) => {
    const on = dir === k;
    return (
      <button onClick={() => setDir(k)} style={{
        height: 28, padding: '0 11px', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
        fontSize: 11.5, fontWeight: 700, whiteSpace: 'nowrap',
        background: on ? '#fff' : 'transparent', color: on ? (color || HDR2) : 'rgba(255,255,255,0.85)',
        borderRadius: 6, transition: 'background 0.12s',
      }}>
        {label} <span style={{ fontWeight: 600, opacity: 0.75 }}>({counts[k]})</span>
      </button>
    );
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#F4F6F9', minHeight: 0 }}>

      {/* ── Header: title + filters on one line ── */}
      <div style={{
        background: `linear-gradient(135deg, ${HDR}, ${HDR2})`, color: '#fff', flexShrink: 0,
        borderBottom: '2px solid #22394F', padding: '8px 14px',
        display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
      }}>
        <div style={{ lineHeight: 1.15, marginRight: 4 }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', opacity: 0.7 }}>Inventory</div>
          <div style={{ fontSize: 16, fontWeight: 800, whiteSpace: 'nowrap' }}>Stock View</div>
        </div>

        <div style={{ display: 'flex', gap: 2, padding: 2, background: 'rgba(0,0,0,0.18)', borderRadius: 8 }}>
          <Seg k="all" label="All" />
          <Seg k="out" label="Outward" color={OUT_C} />
          <Seg k="in"  label="Inward"  color={IN_C} />
        </div>

        <div style={{ flex: 1 }} />

        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search name, file / order / invoice no, material…"
          style={{ width: 290, height: 30, padding: '0 10px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.35)',
            background: '#fff', color: '#000', fontSize: 12, fontFamily: 'inherit', outline: 'none' }}
        />
        <select value={fy} onChange={e => setFy(e.target.value)}
          style={{ height: 30, padding: '0 8px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.35)',
            background: '#fff', color: '#000', fontSize: 12, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer' }}>
          <option value="all">All Years</option>
          {fyOptions.map(f => <option key={f} value={f}>FY {f}</option>)}
        </select>
        <button onClick={doPrint} disabled={!rows.length || printing}
          title={rows.length ? 'Print what is shown (A4 landscape)' : 'Nothing to print'}
          style={{ height: 30, padding: '0 14px', borderRadius: 6, fontFamily: 'inherit',
            fontSize: 12, fontWeight: 700, color: HDR2, background: '#fff', border: '1px solid #fff',
            cursor: rows.length && !printing ? 'pointer' : 'not-allowed', opacity: rows.length ? 1 : 0.6 }}>
          {printing ? 'Preparing…' : '🖨 Print'}
        </button>
        <button onClick={load} title="Reload"
          style={{ height: 30, padding: '0 12px', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit',
            fontSize: 12, fontWeight: 700, color: '#fff', background: 'rgba(255,255,255,0.12)',
            border: '1px solid rgba(255,255,255,0.35)' }}>
          ↻ Refresh
        </button>
      </div>

      {/* ── Table ── */}
      <div style={{ flex: 1, minHeight: 0, padding: 10, display: 'flex' }}>
        <div style={{ flex: 1, minHeight: 0, overflow: 'auto', background: '#fff', border: LINE }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', fontFamily: 'inherit' }}>
            <colgroup>{COLS.map(c => <col key={c.h} style={c.w ? { width: c.w } : undefined} />)}</colgroup>
            <thead>
              <tr>
                {COLS.map(c => (
                  <th key={c.h} style={{
                    position: 'sticky', top: 0, zIndex: 2,
                    background: c.h === 'Outward' ? '#7F1D1D' : c.h === 'Inward' ? '#14532D' : c.h === 'Closing Stock' ? CLOSE_HDR : HDR,
                    color: '#fff', fontSize: 11, fontWeight: 700, padding: '6px 5px', lineHeight: 1.25,
                    border: LINE, textAlign: c.align, verticalAlign: 'middle',
                  }}>{c.h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={COLS.length} style={{ textAlign: 'center', padding: 34, color: '#64748b', fontStyle: 'italic', border: LINE }}>Loading…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={COLS.length} style={{ textAlign: 'center', padding: 34, color: '#64748b', fontStyle: 'italic', border: LINE }}>
                  {otherYearHits > 0 ? (
                    <span style={{ fontStyle: 'normal', color: '#000' }}>
                      No match in FY {fy}. Found <strong>{otherYearHits}</strong> {otherYearHits === 1 ? 'entry' : 'entries'} in other years.{' '}
                      <button onClick={() => setFy('all')}
                        style={{ marginLeft: 6, height: 26, padding: '0 12px', borderRadius: 5, cursor: 'pointer', fontFamily: 'inherit',
                          fontSize: 12, fontWeight: 700, color: '#fff', background: HDR, border: `1px solid ${HDR2}` }}>
                        Show all years
                      </button>
                    </span>
                  ) : search || fy !== 'all' || dir !== 'all' ? 'No entries match these filters.' : 'No sales or purchase bills yet.'}
                </td></tr>
              ) : rows.map((r, i) => { const sep = startsGroup[i] ? { borderTop: LINE } : {}; return (
                <tr key={r.key}
                  title={`${r.dir === 'out' ? 'Sales' : 'Purchase'} bill ${r.billNo}`}
                  style={{ background: '#fff' }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#EEF4FF'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = '#fff'; }}>
                  <td style={td({ ...sep, textAlign: 'center', fontWeight: 700 })}>{i + 1}</td>
                  <td style={td({ ...sep, fontWeight: 600, overflowWrap: 'anywhere' })}>{r.party}</td>
                  <td style={td({ ...sep, wordBreak: 'break-word', fontSize: 11 })}>{r.fileNo}</td>
                  <td style={td({ ...sep, wordBreak: 'break-word' })}>{r.orderNo}</td>
                  <td style={td({ ...sep, wordBreak: 'break-word', fontWeight: 600 })}>{r.billNo}</td>
                  <td style={td({ ...sep, textAlign: 'center', whiteSpace: 'nowrap' })}>{fmtD(r.billDate)}</td>
                  <td style={td(sep)}>
                    <div title={r.material} style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', lineHeight: 1.35 }}>
                      {r.material}
                    </div>
                  </td>
                  <td style={td({ ...sep, textAlign: 'center', fontWeight: 700 })}>{fmtQ(r.qty)}</td>
                  <td style={td({ ...sep, textAlign: 'right', whiteSpace: 'nowrap' })}>{fmt(r.rate)}</td>
                  <td style={td({ ...sep, textAlign: 'right', whiteSpace: 'nowrap' })}>{fmt(r.taxable)}</td>
                  <td style={td({ ...sep, textAlign: 'center', fontWeight: 800, color: r.dir === 'out' ? OUT_C : '#CBD5E1' })}>
                    {r.dir === 'out' ? fmtQ(r.qty) : '—'}
                  </td>
                  <td style={td({ ...sep, textAlign: 'center', fontWeight: 800, color: r.dir === 'in' ? IN_C : '#CBD5E1' })}>
                    {r.dir === 'in' ? fmtQ(r.qty) : '—'}
                  </td>
                  {(() => {
                    if (!groupSpan[i]) return null; // covered by the item's spanning cell above
                    const c = closing[r.itemKey] || { in: 0, out: 0, openIn: 0, openOut: 0 };
                    const bal = c.in - c.out;
                    const open = c.openIn - c.openOut;
                    const tip = periodStart
                      ? `Opening on ${periodStart}: ${fmtQ(open)}\n+ Inward this year: ${fmtQ(c.in - c.openIn)}\n− Outward this year: ${fmtQ(c.out - c.openOut)}\n= Closing on ${periodEnd}: ${fmtQ(bal)}`
                      : `Inward ${fmtQ(c.in)} − Outward ${fmtQ(c.out)} = Closing ${fmtQ(bal)}`;
                    return (
                      <td rowSpan={groupSpan[i]} title={tip}
                        style={td({ ...sep, textAlign: 'center', fontWeight: 800, fontSize: 13, verticalAlign: 'middle',
                          background: '#fff', color: bal < 0 ? OUT_C : CLOSE_C })}>
                        {periodStart && open !== 0 && (
                          <div style={{ fontSize: 9.5, fontWeight: 600, color: '#64748b', whiteSpace: 'nowrap', marginBottom: 1 }}>
                            Opening {fmtQ(open)}
                          </div>
                        )}
                        {fmtQ(bal)}
                      </td>
                    );
                  })()}
                </tr>
              );})}
            </tbody>
            {!loading && rows.length > 0 && (
              <tfoot style={{ position: 'sticky', bottom: 0, zIndex: 2 }}>
                <tr>
                  <td colSpan={9} style={tf({ background: '#E2E8F0', fontWeight: 800, verticalAlign: 'middle' })}>
                    TOTAL ({rows.length} {rows.length === 1 ? 'line' : 'lines'}{fy !== 'all' ? ` · FY ${fy}` : ''})
                  </td>
                  <td title="Taxable total — red: Outward (sales), green: Inward (purchase)"
                    style={tf({ background: '#E2E8F0', textAlign: 'right', fontWeight: 800, fontSize: 11, whiteSpace: 'nowrap', lineHeight: 1.45 })}>
                    {dir !== 'in'  && <div style={{ color: OUT_C }}>{fmt(tot.out.taxable)}</div>}
                    {dir !== 'out' && <div style={{ color: IN_C }}>{fmt(tot.in.taxable)}</div>}
                  </td>
                  <td style={tf({ background: '#FEE2E2', textAlign: 'center', fontWeight: 800, color: OUT_C, verticalAlign: 'middle' })}>
                    {dir === 'in' ? '—' : fmtQ(tot.out.qty)}
                  </td>
                  <td style={tf({ background: '#DCFCE7', textAlign: 'center', fontWeight: 800, color: IN_C, verticalAlign: 'middle' })}>
                    {dir === 'out' ? '—' : fmtQ(tot.in.qty)}
                  </td>
                  <td title={`Closing stock of the listed items${periodEnd ? ` as on ${periodEnd}` : ''}`}
                    style={tf({ background: '#DBEAFE', textAlign: 'center', fontWeight: 800, fontSize: 12.5, verticalAlign: 'middle',
                      color: closingTotal < 0 ? OUT_C : CLOSE_C })}>
                    {fmtQ(closingTotal)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}
