import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { px } from '../../utils/uiScale';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { useCompany } from '../../context/CompanyContext';
import * as XLSX from 'xlsx';
import { withPrintFont } from '../../utils/printFont';

const F  = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const P  = '#1a4a9a';
const GOLD = '#FFC000';
const NAVY = '#0d2c6b';

const getFY = d => { const dt=d?new Date(d):new Date(); const m=dt.getMonth()+1; const y=dt.getFullYear(); const s=m>=4?y:y-1; return `${String(s).slice(2)}-${String(s+1).slice(2)}`; };
const fmtD  = d => {
  if (!d) return '';
  const dt = new Date(d);
  return isNaN(dt) ? '' : `${String(dt.getDate()).padStart(2,'0')}.${String(dt.getMonth()+1).padStart(2,'0')}.${String(dt.getFullYear()).slice(-2)}`;
};
const normItem = it => ({
  name: it.itemName || it.description || it.name || '—',
  qty:  parseFloat(it.qty || it.quantity) || 0,
});

const COLUMNS = [
  { key:'sr',       label:'Sr No.'    },
  { key:'orderId',  label:'Order ID'  },
  { key:'location', label:'Location'  },
  { key:'orderDate',label:'Order Date'},
  { key:'dueDate',  label:'Due Date'  },
  { key:'vendor',   label:'Vendor'    },
  { key:'poDate',   label:'PO Date'   },
  { key:'poNo',     label:'PO No.'    },
  { key:'product',  label:'Product'   },
  { key:'qty',      label:'Qty'       },
  { key:'remarks',  label:'Remarks'   },
];

/* Fetch the company logo as base64 for embedding in the print header —
   same pattern as printDeliveryChallan.js / printSalesOrder.js. */
async function fetchLogoB64(company) {
  if (!company?.logoFileName || !company?.companyId) return null;
  try {
    const res  = await fetch(`/api/companies/logo/${encodeURIComponent(company.logoFileName)}?companyId=${company.companyId}`);
    const blob = await res.blob();
    return await new Promise(r => { const rd = new FileReader(); rd.onload = () => r(rd.result); rd.readAsDataURL(blob); });
  } catch { return null; }
}

/* ══════════════════════════════════════════════
   PROJECT TRACKER REPORT — FY-wise, grouped by
   Order → Vendor/PO → Product, matching the
   "Project Tracker" spreadsheet layout the user
   already keeps in Excel.
══════════════════════════════════════════════ */
export default function ProjectReport() {
  const { selectedCompany } = useCompany();
  const cid = selectedCompany?.companyId;
  const navigate = useNavigate();

  const [salesOrders,    setSalesOrders]    = useState([]);
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [loading,        setLoading]        = useState(true);
  const [search,         setSearch]         = useState('');
  const [fySel,          setFySel]          = useState(['all']); // multi-select FY filter
  const [fyOpen,         setFyOpen]         = useState(false);
  const [remarks,        setRemarks]        = useState({}); // rowKey -> text, persisted per company
  const [hiddenCols,     setHiddenCols]     = useState(new Set()); // column keys hidden from the on-screen grid
  const [colOpen,        setColOpen]        = useState(false);
  const fyRef  = useRef();
  const colRef = useRef();
  const cv = key => !hiddenCols.has(key);
  const toggleCol = key => setHiddenCols(prev => {
    const next = new Set(prev);
    next.has(key) ? next.delete(key) : next.add(key);
    try { localStorage.setItem(`ep_tracker_cols_${cid}`, JSON.stringify([...next])); } catch {}
    return next;
  });
  const showAllCols = () => {
    setHiddenCols(new Set());
    try { localStorage.setItem(`ep_tracker_cols_${cid}`, JSON.stringify([])); } catch {}
  };

  const load = useCallback(async () => {
    if (!cid) return;
    setLoading(true);
    try {
      const [soR, poR] = await Promise.all([
        axios.get(`/api/sales-orders?companyId=${cid}`).catch(()=>({data:[]})),
        axios.get(`/api/purchase-orders?companyId=${cid}`).catch(()=>({data:[]})),
      ]);
      setSalesOrders((soR.data||[]).filter(o => !o.tallyImported && !['draft','rejected'].includes(o.status)));
      setPurchaseOrders(poR.data||[]);
    } catch {}
    setLoading(false);
  }, [cid]);

  useEffect(() => { load(); }, [load]);

  /* Close the FY / Columns dropdowns on outside click */
  useEffect(() => {
    const close = e => {
      if (fyRef.current  && !fyRef.current.contains(e.target))  setFyOpen(false);
      if (colRef.current && !colRef.current.contains(e.target)) setColOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  /* Load per-company column visibility prefs */
  useEffect(() => {
    if (!cid) return;
    try { setHiddenCols(new Set(JSON.parse(localStorage.getItem(`ep_tracker_cols_${cid}`) || '[]'))); }
    catch { setHiddenCols(new Set()); }
  }, [cid]);

  /* ── Remarks: lightweight per-row notes, persisted in localStorage
     (same convention as the Jobcodes column-prefs), since these are
     free-text delivery notes with no backing field on SO/PO. ── */
  useEffect(() => {
    if (!cid) return;
    try { setRemarks(JSON.parse(localStorage.getItem(`ep_tracker_remarks_${cid}`) || '{}')); } catch { setRemarks({}); }
  }, [cid]);
  const setRemark = (key, val) => {
    setRemarks(prev => {
      const next = { ...prev, [key]: val };
      try { localStorage.setItem(`ep_tracker_remarks_${cid}`, JSON.stringify(next)); } catch {}
      return next;
    });
  };

  const fyList = useMemo(() => {
    const set = new Set(salesOrders.map(o => getFY(o.orderDate||o.date)));
    return [...set].sort().reverse();
  }, [salesOrders]);

  const toggleFy = f => {
    setFySel(prev => {
      if (f === 'all') return ['all'];
      const withoutAll = prev.filter(x => x !== 'all');
      const next = withoutAll.includes(f) ? withoutAll.filter(x => x !== f) : [...withoutAll, f];
      return next.length === 0 ? ['all'] : next;
    });
  };
  const fyBtnLabel = fySel.includes('all')
    ? 'All Years'
    : fySel.length === 1 ? `FY ${fySel[0]}` : `${fySel.length} FYs selected`;

  const linkedPOs = soId => purchaseOrders.filter(p =>
    String(p.linkedSalesOrderId)===String(soId) ||
    String(p.salesOrderId)===String(soId) ||
    String(p.soRef)===String(soId)
  );

  /* ── Universal search — matches order no/id, client PO no, any linked
     PO no, vendor name, client name, or any product/item text. ── */
  const soHaystack = so => {
    const pos = linkedPOs(so.orderId);
    return [
      so.orderNo, so.orderId, so.customerName, so.clientName, so.customerPO,
      ...(so.items||[]).map(i => i.itemName || i.description || i.name),
      ...pos.flatMap(p => [
        p.poNo, p.poNumber, p.vendorName,
        ...(p.items||[]).map(i => i.itemName || i.description || i.name),
      ]),
    ].filter(Boolean).join(' | ').toLowerCase();
  };

  const filteredSOs = useMemo(() => {
    let list = fySel.includes('all')
      ? salesOrders
      : salesOrders.filter(o => fySel.includes(getFY(o.orderDate||o.date)));
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(o => soHaystack(o).includes(q));
    }
    return [...list].sort((a,b) => new Date(b.orderDate||b.date||0) - new Date(a.orderDate||a.date||0));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [salesOrders, purchaseOrders, fySel, search]);

  /* ── Build one row per (SO × PO × item); blank cells handle the
     "same order/vendor, next line" continuation look. ── */
  const rows = [];
  for (const so of filteredSOs) {
    const pos = linkedPOs(so.orderId);
    const poList = pos.length > 0 ? pos : [null];
    const poBlockSizes = poList.map(po => Math.max(po ? (po.items||[]).length : 0, 1));
    const soItemCount = (so.items||[]).length;
    const totalRows = Math.max(soItemCount, poBlockSizes.reduce((s,n)=>s+n,0), 1);
    let absIdx = 0;
    for (let pb = 0; pb < poList.length; pb++) {
      const po = poList[pb];
      const poItems = po ? (po.items||[]).map(normItem) : [];
      for (let i = 0; i < poBlockSizes[pb]; i++) {
        const poItem = poItems[i] || null;
        rows.push({
          key: `${so.orderId}-${pb}-${i}`,
          so, po,
          isSOFirst: absIdx === 0,
          isPOFirst: i === 0,
          product: poItem?.name || (so.items||[])[absIdx]?.itemName || (so.items||[])[absIdx]?.description || '',
          qty:     poItem?.qty  || parseFloat((so.items||[])[absIdx]?.qty || (so.items||[])[absIdx]?.quantity) || '',
        });
        absIdx++;
      }
    }
    while (absIdx < totalRows) {
      const it = (so.items||[])[absIdx];
      rows.push({
        key: `${so.orderId}-tail-${absIdx}`,
        so, po:null, isSOFirst: absIdx===0, isPOFirst:false,
        product: it?.itemName || it?.description || '',
        qty: parseFloat(it?.qty||it?.quantity) || '',
      });
      absIdx++;
    }
  }

  /* ── Styles matching the yellow-header / black-border tracker look ── */
  const th = (w) => ({
    padding:'6px 8px', background:GOLD, color:'#000', fontSize:12, fontWeight:800,
    textAlign:'center', border:'1px solid #000', whiteSpace:'nowrap', ...(w?{width:w}:{}),
  });
  const td = (align='left', ex={}) => ({
    padding:'5px 8px', fontSize:11.5, fontFamily:F, border:'1px solid #000',
    verticalAlign:'middle', textAlign:align, color:'#000', ...ex,
  });

  const fyExportLabel = fySel.includes('all') ? 'AllYears' : fySel.join('+');

  /* Per-column cell value/rendering, keyed the same as COLUMNS, so both
     Excel export and Print only include the columns currently visible
     on screen (matching the Columns picker). */
  const COL_EXPORT = {
    sr:        (row,s) => row.isSOFirst ? s : '',
    orderId:   row => row.isSOFirst ? (row.so?.orderNo||row.so?.orderId||'') : '',
    location:  row => row.isSOFirst ? (row.so?.customerName||row.so?.clientName||'') : '',
    orderDate: row => row.isSOFirst ? (row.so?.orderDate||row.so?.date||'') : '',
    dueDate:   row => row.isSOFirst ? (row.so?.dueDate||row.so?.deliveryDate||'') : '',
    vendor:    row => row.isPOFirst ? (row.po?.vendorName||'') : '',
    poDate:    row => row.isPOFirst ? (row.po?.poDate||row.po?.date||'') : '',
    poNo:      row => row.isPOFirst ? (row.po?.poNo||row.po?.poNumber||'') : '',
    product:   row => row.product || '',
    qty:       row => row.qty || '',
    remarks:   row => remarks[row.key] || '',
  };
  const COL_EXPORT_WIDTH = { sr:7, orderId:16, location:24, orderDate:12, dueDate:12, vendor:18, poDate:12, poNo:16, product:28, qty:8, remarks:24 };
  const COL_PRINT = {
    sr:        (row,s) => ({ cls:'center bold', val: row.isSOFirst ? s : '' }),
    orderId:   row => ({ cls:'bold', val: row.isSOFirst ? (row.so?.orderNo||row.so?.orderId||'') : '' }),
    location:  row => ({ cls:'', val: row.isSOFirst ? (row.so?.customerName||row.so?.clientName||'') : '' }),
    orderDate: row => ({ cls:'center nowrap', val: row.isSOFirst ? fmtD(row.so?.orderDate||row.so?.date) : '' }),
    dueDate:   row => ({ cls:'center nowrap', val: row.isSOFirst ? fmtD(row.so?.dueDate||row.so?.deliveryDate) : '' }),
    vendor:    row => ({ cls:'', val: row.isPOFirst ? (row.po?.vendorName||'') : '' }),
    poDate:    row => ({ cls:'center nowrap', val: row.isPOFirst ? fmtD(row.po?.poDate||row.po?.date) : '' }),
    poNo:      row => ({ cls:'center', val: row.isPOFirst ? (row.po?.poNo||row.po?.poNumber||'') : '' }),
    product:   row => ({ cls:'', val: row.product || '' }),
    qty:       row => ({ cls:'center', val: row.qty || '' }),
    remarks:   row => ({ cls:'', val: remarks[row.key] || '' }),
  };
  const visibleCols = COLUMNS.filter(c => cv(c.key));

  const doExport = () => {
    const co = selectedCompany?.companyName || '';
    const wb = XLSX.utils.book_new();
    const headers = visibleCols.map(c => c.label);
    let sr = 0;
    const data = rows.map(row => {
      if (row.isSOFirst) sr++;
      return visibleCols.map(c => COL_EXPORT[c.key](row, sr));
    });
    const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);
    ws['!cols'] = visibleCols.map(c => ({ wch: COL_EXPORT_WIDTH[c.key] }));
    XLSX.utils.book_append_sheet(wb, ws, 'Project Tracker');
    XLSX.writeFile(wb, `${co?co+'_':''}Project_Tracker_${fyExportLabel}.xlsx`);
  };

  const doPrint = async () => {
    const co = selectedCompany || {};
    const logoB64 = await fetchLogoB64(co);
    const fyLabel = fySel.includes('all') ? 'All Financial Years' : `FY ${fySel.join(', ')}`;
    const coAddr = [co.address, co.city, co.state, co.pincode].filter(Boolean).join(', ');
    const logoTag = logoB64
      ? `<img src="${logoB64}" style="height:44px;max-width:130px;object-fit:contain;">`
      : `<span style="font-size:13pt;font-weight:bold;color:#104f4f;">${co.companyName||''}</span>`;

    let sr = 0;
    const rowsHtml = rows.map(row => {
      if (row.isSOFirst) sr++;
      const cells = visibleCols.map(c => {
        const { cls, val } = COL_PRINT[c.key](row, sr);
        return `<td class="${cls}">${val}</td>`;
      }).join('');
      return `<tr>${cells}</tr>`;
    }).join('');

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Project Tracker</title>
<style>
* { margin:0; padding:0; box-sizing:border-box; -webkit-print-color-adjust:exact; print-color-adjust:exact; color-adjust:exact; }
body { font-family: Arial, Helvetica, sans-serif; font-size:10pt; color:#000; padding:12px; }
table.outer { border:1.5px solid #000; width:100%; border-collapse:separate; border-spacing:0; }
table.outer > tbody > tr > td { border:1px solid #000; padding:3px 6px; vertical-align:top; }
.section-hdr { text-align:center; font-weight:bold; font-size:11pt; background:#fff; padding:4px; }
/* border-collapse:separate (not collapse) — Chromium can round thin shared
   horizontal borders to sub-pixel and drop them on print/scaled output;
   the separate model paints every cell's own border independently so rows
   never lose their bottom line, even at a thin 1px weight. */
table.tracker { width:100%; border-collapse:separate; border-spacing:0; font-size:9pt; }
table.tracker th { border:1px solid #000; padding:4px 5px; font-weight:bold; text-align:center; background:#fff; }
table.tracker td { border:1px solid #000; padding:3px 5px; vertical-align:middle; }
table.tracker tr:first-child th { border-top:1px solid #000; }
.bold { font-weight:bold; }
.center { text-align:center; }
.nowrap { white-space:nowrap; }
@media print { @page { margin:8mm; size:A4; } }
</style></head><body>

<table class="outer">
  <tr><td>
    <div style="display:flex;align-items:center;gap:10px;">
      ${logoTag}
      <div>
        <div style="font-size:13pt;font-weight:bold;">${co.companyName||''}</div>
        <div style="font-size:8.5pt;color:#333;">${coAddr}</div>
        <div style="font-size:8.5pt;color:#333;">${co.gstin?`GSTIN: ${co.gstin}`:''}${co.phone?` &nbsp;|&nbsp; Ph: ${co.phone}`:''}${co.email?` &nbsp;|&nbsp; ${co.email}`:''}</div>
      </div>
    </div>
  </td></tr>
  <tr><td class="section-hdr" style="padding:0">Project Tracker &nbsp;—&nbsp; ${fyLabel}</td></tr>
  <tr><td style="padding:0">
    <table class="tracker">
    <thead><tr>
    ${visibleCols.map(c=>`<th>${c.label}</th>`).join('')}
    </tr></thead>
    <tbody>${rowsHtml}</tbody>
    </table>
  </td></tr>
</table>
</body></html>`;

    const w = window.open('', '_blank', 'width=1000,height=750');
    w.document.write(withPrintFont(html));
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 500);
  };

  if (!cid) return null;

  let sr = 0;

  return (
    <div style={{ fontFamily:F, background:'#f0f2f5', minHeight:'100%' }}>
      {/* ── FINACLE-STYLE COMPACT TOOLBAR ── */}
      <div style={{
        background:'#000000', borderBottom:'1px solid #000000',
        padding:'3px 8px', display:'flex', alignItems:'center',
        flexWrap:'nowrap', overflowX:'auto', minHeight:36, gap:0,
      }}>
        <span style={{ fontWeight:800, fontSize:13, color:P, paddingRight:8,
          borderRight:'1px solid #000000', marginRight:6, whiteSpace:'nowrap', flexShrink:0 }}>
          PROJECT
        </span>

        <button onClick={()=>navigate('/project/list')} style={{
          height:28, padding:'0 12px', fontSize:12, cursor:'pointer', whiteSpace:'nowrap', flexShrink:0,
          fontFamily:F, fontWeight:400, position:'relative',
          background:'#e4e8ed', border:'1px solid #000000',
          borderBottom:'1px solid #000000',
          color:'#555', zIndex:0, marginBottom:0, borderRadius:'3px 3px 0 0',
        }}>Jobcodes</button>

        <button onClick={()=>navigate('/project/report')} style={{
          height:28, padding:'0 12px', fontSize:12, cursor:'pointer', whiteSpace:'nowrap', flexShrink:0,
          fontFamily:F, fontWeight:700, position:'relative',
          background:'#fff', border:'1px solid #000000',
          borderBottom:'1px solid #000000',
          color:P, zIndex:1, marginBottom:-1, borderRadius:'3px 3px 0 0',
        }}>Report</button>

        <button onClick={()=>navigate('/project/close')} style={{
          height:28, padding:'0 12px', fontSize:12, cursor:'pointer', whiteSpace:'nowrap', flexShrink:0,
          fontFamily:F, fontWeight:400, position:'relative', marginRight:8,
          background:'#e4e8ed', border:'1px solid #000000',
          borderBottom:'1px solid #000000',
          color:'#555', zIndex:0, marginBottom:0, borderRadius:'3px 3px 0 0',
        }}>Project Close</button>

        {/* Divider */}
        <div style={{ width:1, height:20, background:'#000000', margin:'0 8px', flexShrink:0 }}/>

        {/* FY multi-select dropdown */}
        <div ref={fyRef} style={{ position:'relative', flexShrink:0 }}>
          <button onClick={()=>setFyOpen(o=>!o)} style={{
            height:28, padding:'0 12px', fontSize:11.5, cursor:'pointer', whiteSpace:'nowrap',
            fontFamily:F, fontWeight:700,
            background:P, border:'1px solid #000000',
            color:'#fff', borderRadius:4, display:'flex', alignItems:'center', gap:6,
          }}>{fyBtnLabel} <span style={{ fontSize:9 }}>▼</span></button>

          {fyOpen && fyRef.current && (() => {
            const r = fyRef.current.getBoundingClientRect();
            return (
              <div style={{ position:'fixed', top:px(r.bottom)+4, left:px(r.left), background:'#fff', border:'1px solid #000',
                borderRadius:5, boxShadow:'0 8px 24px rgba(0,0,0,0.25)', zIndex:2000, minWidth:150, padding:4 }}>
                <label style={{ display:'flex', alignItems:'center', gap:7, padding:'6px 8px', fontSize:12,
                  fontFamily:F, cursor:'pointer', fontWeight:700, borderBottom:'1px solid #eee' }}>
                  <input type="checkbox" checked={fySel.includes('all')} onChange={()=>toggleFy('all')} />
                  All Years
                </label>
                {fyList.map(f => (
                  <label key={f} style={{ display:'flex', alignItems:'center', gap:7, padding:'6px 8px',
                    fontSize:12, fontFamily:F, cursor:'pointer' }}>
                    <input type="checkbox" checked={fySel.includes(f)} onChange={()=>toggleFy(f)} />
                    FY {f}
                  </label>
                ))}
              </div>
            );
          })()}
        </div>

        <div style={{ width:1, height:20, background:'#000000', margin:'0 8px', flexShrink:0 }}/>

        {/* Column show/hide dropdown */}
        <div ref={colRef} style={{ position:'relative', flexShrink:0 }}>
          <button onClick={()=>setColOpen(o=>!o)} style={{
            height:28, padding:'0 12px', fontSize:11.5, cursor:'pointer', whiteSpace:'nowrap',
            fontFamily:F, fontWeight:700,
            background:hiddenCols.size>0?'#7c3aed':'#fff', border:'1px solid #000000',
            color:hiddenCols.size>0?'#fff':'#333', borderRadius:4, display:'flex', alignItems:'center', gap:6,
          }}>Columns{hiddenCols.size>0?` (${COLUMNS.length-hiddenCols.size}/${COLUMNS.length})`:''} <span style={{ fontSize:9 }}>▼</span></button>

          {colOpen && colRef.current && (() => {
            const r = colRef.current.getBoundingClientRect();
            return (
              <div style={{ position:'fixed', top:px(r.bottom)+4, left:px(r.left), background:'#fff', border:'1px solid #000',
                borderRadius:5, boxShadow:'0 8px 24px rgba(0,0,0,0.25)', zIndex:2000, minWidth:170, padding:4,
                maxHeight:'70vh', overflowY:'auto' }}>
                <label style={{ display:'flex', alignItems:'center', gap:7, padding:'6px 8px', fontSize:12,
                  fontFamily:F, cursor:'pointer', fontWeight:700, borderBottom:'1px solid #eee' }}>
                  <input type="checkbox" checked={hiddenCols.size===0} onChange={showAllCols} />
                  All Columns
                </label>
                {COLUMNS.map(c => (
                  <label key={c.key} style={{ display:'flex', alignItems:'center', gap:7, padding:'6px 8px',
                    fontSize:12, fontFamily:F, cursor:'pointer' }}>
                    <input type="checkbox" checked={cv(c.key)} onChange={()=>toggleCol(c.key)} />
                    {c.label}
                  </label>
                ))}
              </div>
            );
          })()}
        </div>

        <div style={{ width:1, height:20, background:'#000000', margin:'0 8px', flexShrink:0 }}/>

        <input value={search} onChange={e=>setSearch(e.target.value)}
          placeholder="Search anything — order no, order ID, PO no, client PO no, product…"
          style={{ height:26, padding:'0 10px', border:'1px solid #000000', borderRadius:4, fontSize:11.5,
            fontFamily:F, outline:'none', width:340, flexShrink:0 }}/>

        <div style={{ flex:1 }} />

        <button onClick={doExport} style={{
          height:28, padding:'0 14px', fontSize:11.5, fontWeight:700, cursor:'pointer', whiteSpace:'nowrap', flexShrink:0,
          fontFamily:F, background:'#1a7a3a', border:'1px solid #000000', color:'#fff', borderRadius:4, marginRight:6,
        }}>⬇ Excel</button>
        <button onClick={doPrint} style={{
          height:28, padding:'0 14px', fontSize:11.5, fontWeight:700, cursor:'pointer', whiteSpace:'nowrap', flexShrink:0,
          fontFamily:F, background:P, border:'1px solid #000000', color:'#fff', borderRadius:4,
        }}>🖨 Print</button>
      </div>

      {/* ── TABLE ── */}
      <div style={{ padding:14 }}>
        {loading ? (
          <div style={{ padding:60, textAlign:'center', color:'#888' }}>Loading…</div>
        ) : rows.length === 0 ? (
          <div style={{ padding:60, textAlign:'center', color:'#888' }}>No orders found for {fyBtnLabel}.</div>
        ) : (
          <div style={{ border:'1px solid #000', overflow:'hidden' }}>
            <div style={{ background:NAVY, color:'#fff', textAlign:'center', fontSize:16,
              fontWeight:800, padding:'9px 0', textDecoration:'underline', letterSpacing:0.5 }}>
              Project Tracker
            </div>
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse' }}>
                <thead>
                  <tr>
                    {cv('sr')        && <th style={th(56)}>Sr No.</th>}
                    {cv('orderId')   && <th style={th(110)}>Order ID</th>}
                    {cv('location')  && <th style={th(200)}>Location</th>}
                    {cv('orderDate') && <th style={th(90)}>Order Date</th>}
                    {cv('dueDate')   && <th style={th(90)}>Due Date</th>}
                    {cv('vendor')    && <th style={th(160)}>Vendor</th>}
                    {cv('poDate')    && <th style={th(80)}>PO Date</th>}
                    {cv('poNo')      && <th style={th(110)}>PO No.</th>}
                    {cv('product')   && <th style={th()}>Product</th>}
                    {cv('qty')       && <th style={th(60)}>Qty</th>}
                    {cv('remarks')   && <th style={th(220)}>Remarks</th>}
                  </tr>
                </thead>
                <tbody>
                  {rows.map(row => {
                    if (row.isSOFirst) sr++;
                    return (
                      <tr key={row.key} style={{ background:'#fff' }}>
                        {cv('sr')        && <td style={td('center')}>{row.isSOFirst ? sr : ''}</td>}
                        {cv('orderId')   && <td style={td('left',{fontWeight:700})}>{row.isSOFirst ? (row.so?.orderNo||row.so?.orderId||'') : ''}</td>}
                        {cv('location')  && <td style={td('left')}>{row.isSOFirst ? (row.so?.customerName||row.so?.clientName||'') : ''}</td>}
                        {cv('orderDate') && <td style={td('center',{whiteSpace:'nowrap'})}>{row.isSOFirst ? fmtD(row.so?.orderDate||row.so?.date) : ''}</td>}
                        {cv('dueDate')   && <td style={td('center',{whiteSpace:'nowrap'})}>{row.isSOFirst ? fmtD(row.so?.dueDate||row.so?.deliveryDate) : ''}</td>}
                        {cv('vendor')    && <td style={td('left')}>{row.isPOFirst ? (row.po?.vendorName||'') : ''}</td>}
                        {cv('poDate')    && <td style={td('center',{whiteSpace:'nowrap'})}>{row.isPOFirst ? fmtD(row.po?.poDate||row.po?.date) : ''}</td>}
                        {cv('poNo')      && <td style={td('center')}>{row.isPOFirst ? (row.po?.poNo||row.po?.poNumber||'') : ''}</td>}
                        {cv('product')   && <td style={td('left')}>{row.product||''}</td>}
                        {cv('qty')       && <td style={td('center',{fontWeight:600})}>{row.qty||''}</td>}
                        {cv('remarks')   && (
                          <td style={td('left',{padding:0})}>
                            <input
                              defaultValue={remarks[row.key]||''}
                              onBlur={e=>setRemark(row.key, e.target.value)}
                              placeholder="—"
                              style={{ width:'100%', height:'100%', minHeight:26, border:'none', outline:'none',
                                padding:'5px 8px', fontSize:11.5, fontFamily:F, background:'transparent', color:'#000' }}
                            />
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
