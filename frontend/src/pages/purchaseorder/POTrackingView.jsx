import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCompany } from '../../context/CompanyContext';

const F    = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const ORG  = '#EA580C';
const ORG2 = '#C2410C';
const BD   = '#e2e8f0';

const fmtN = n => Number(n || 0).toFixed(2);
const fmtD = v => { if (!v) return '—'; const d = new Date(v); return isNaN(d) ? v : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }); };
const normName = s => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
const namesMatch = (a, b) => { const x=normName(a), y=normName(b); if(!x||!y) return false; return x===y||x.includes(y)||y.includes(x); };
const getFY = d => { const dt=d?new Date(d):new Date(); const m=dt.getMonth()+1; const y=dt.getFullYear(); const s=m>=4?y:y-1; return `${String(s).slice(2)}-${String(s+1).slice(2)}`; };

/* ── Print flat table ── */
const printTrackingReport = (title, subtitle, rows) => {
  const today = new Date().toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'});
  const cols = ['#','Order No','Client Name','Material / Item','SO Qty','Unit','Vendor Name','PO Date','PO No','Rate (₹)','GST%','Taxable (₹)','Amount (₹)','PO Status'];
  const rHtml = rows.map((r,i) => `<tr class="${i%2===0?'':'alt'}">${r.map((c,ci)=>`<td class="${ci>=9?'r':''}">${c??'—'}</td>`).join('')}</tr>`).join('');
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title>
<style>*{margin:0;padding:0;box-sizing:border-box;}
body{font-family:Arial,sans-serif;font-size:8.5pt;color:#000;}
.pg{padding:8mm 10mm;}
h1{font-size:13pt;font-weight:bold;text-align:center;margin-bottom:2px;}
.sub{font-size:9pt;text-align:center;color:#444;margin-bottom:8px;padding-bottom:4px;border-bottom:2px solid #ea580c;}
table{width:100%;border-collapse:collapse;border:1.5px solid #000;}
th{background:#1a2a3a;color:#fff;padding:5px 7px;font-size:8pt;font-weight:bold;text-align:left;border:1px solid #000;white-space:nowrap;}
td{padding:4px 7px;font-size:8.5pt;border:1px solid #ccc;vertical-align:middle;}
.alt td{background:#f5f7fb;}td.r{text-align:right;}
.foot{margin-top:5px;font-size:7.5pt;color:#555;text-align:right;}
@media print{@page{margin:7mm;size:A3 landscape;}.pg{padding:0;}}</style>
</head><body><div class="pg">
<h1>${title}</h1><div class="sub">${subtitle} · ${rows.length} item rows · Printed: ${today}</div>
<table><thead><tr>${cols.map(c=>`<th>${c}</th>`).join('')}</tr></thead>
<tbody>${rHtml}</tbody></table>
<div class="foot">Generated: ${today}</div>
</div><script>window.onload=()=>setTimeout(()=>window.print(),400);<\/script></body></html>`;
  const w = window.open('','_blank','width=1400,height=900');
  if (!w) { alert('Allow pop-ups to print.'); return; }
  w.document.write(html); w.document.close();
};

/* ── Status badge ── */
const STATUS_MAP = {
  approved:  { bg:'#d1fae5', color:'#065f46', bd:'#6ee7b7' },
  pending:   { bg:'#fef3c7', color:'#92400e', bd:'#fcd34d' },
  draft:     { bg:'#f1f5f9', color:'#475569', bd:'#cbd5e1' },
  rejected:  { bg:'#fee2e2', color:'#991b1b', bd:'#fca5a5' },
  'in progress':{ bg:'#ede9fe',color:'#4c1d95',bd:'#c4b5fd'},
  confirmed: { bg:'#dbeafe', color:'#1e40af', bd:'#93c5fd' },
  completed: { bg:'#d1fae5', color:'#065f46', bd:'#6ee7b7' },
};
function StatusBadge({ label }) {
  const c = STATUS_MAP[String(label||'').toLowerCase()] || STATUS_MAP.draft;
  return (
    <span style={{ display:'inline-block', padding:'2px 8px', borderRadius:10,
      fontSize:9.5, fontWeight:700, background:c.bg, color:c.color,
      border:`1px solid ${c.bd}`, whiteSpace:'nowrap' }}>{label||'—'}</span>
  );
}

export default function POTrackingView() {
  const { selectedCompany } = useCompany();
  const navigate = useNavigate();
  const cid = selectedCompany?.companyId;

  const [salesOrders,    setSalesOrders]    = useState([]);
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [filter,   setFilter]   = useState('all');
  const [search,   setSearch]   = useState('');
  const [fy,       setFy]       = useState(getFY());

  const load = useCallback(async () => {
    if (!cid) { setLoading(false); return; }
    setLoading(true);
    try {
      const [soData, poData] = await Promise.all([
        fetch(`/api/sales-orders?companyId=${cid}`).then(r => r.json()),
        fetch(`/api/purchase-orders?companyId=${cid}`).then(r => r.json()),
      ]);
      setSalesOrders(Array.isArray(soData) ? soData : []);
      setPurchaseOrders(Array.isArray(poData) ? poData : []);
    } catch {}
    setLoading(false);
  }, [cid]);

  useEffect(() => { load(); }, [load]);

  const fyList = useMemo(() => {
    const s = new Set(salesOrders.map(o => getFY(o.orderDate||o.date)));
    return ['all', ...[...s].sort().reverse()];
  }, [salesOrders]);

  /* ── Build per-SO tracking (same as before, adds poDate+gst to hits) ── */
  const trackingData = useMemo(() => salesOrders.map(so => {
    const soId = so.orderId;
    const linkedPOs = purchaseOrders.filter(po =>
      po.linkedSalesOrderId === soId || po.linkedSalesOrderId === String(soId)
    );
    const allItems = [
      ...(so.items || []).map(it => ({ ...it, _isAddon: false })),
      ...(so.addons || []).map(a  => ({ ...a, _isAddon: true })),
    ];
    const rows = allItems.map(it => {
      const name   = it.material || it.itemName || it.description || '—';
      const code   = it.itemCode || it.code || '';
      const qty    = parseFloat(it.qty || it.requiredQty || it.quantity) || 0;
      const unit   = it.unit || '';
      const hsn    = it.hsnCode || '';
      const isAddon = it._isAddon || false;
      const poHits = [];
      linkedPOs.forEach(po => {
        (po.items || []).forEach(poi => {
          const poName = poi.itemName || poi.description || '';
          const codeMatch = code && namesMatch(poi.itemCode || '', code);
          const nameMatch = namesMatch(poName, name);
          const addonMatch = isAddon && poi.isAddon && namesMatch(poName, name);
          if (codeMatch || nameMatch || addonMatch) {
            poHits.push({
              poId:       po.orderId,
              poNo:       po.poNumber || po.poNo || po.voucherNumber || po.orderId,
              poDate:     po.poDate || po.date || '',
              poStatus:   po.status || 'draft',
              vendorName: po.vendorName || '—',
              rate: parseFloat(poi.rate) || 0,
              qty:  parseFloat(poi.qty)  || 0,
              unit: poi.unit || unit,
              gst:  parseFloat(poi.gst || poi.gstPercent || poi.gstPct || 0),
            });
          }
        });
      });
      const issuedQty  = poHits.reduce((s, p) => s + p.qty, 0);
      const pendingQty = Math.max(0, qty - issuedQty);
      return { name, code, qty, unit, hsn, isAddon, poHits, issuedQty, pendingQty };
    });
    const hasPending  = rows.some(r => r.pendingQty > 0 && r.qty > 0);
    const itemsWithQty = rows.filter(r => r.qty > 0).length;
    return {
      soId, orderNo: so.orderNo || soId,
      customerName: so.customerName || so.party || '—',
      orderDate: so.orderDate || so.date || '',
      linkedPOs, rows, hasPending, itemsWithQty,
    };
  }), [salesOrders, purchaseOrders]);

  /* ── Filter visible SOs ── */
  const visible = useMemo(() => trackingData
    .filter(d => fy === 'all' || getFY(d.orderDate) === fy)
    .filter(d => {
      if (filter === 'pending') return d.hasPending;
      if (filter === 'covered') return !d.hasPending && d.itemsWithQty > 0;
      return true;
    })
    .filter(d => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return d.orderNo.toLowerCase().includes(q) || d.customerName.toLowerCase().includes(q);
    })
  , [trackingData, fy, filter, search]);

  /* ── Build flat rows for rendering (rowspan logic) ── */
  const flatRows = useMemo(() => {
    const result = [];
    visible.forEach((so, soSeq) => {
      if (so.rows.length === 0) {
        result.push({ so, soSeq: soSeq+1, item: null, hit: null, isItemFirst: true, itemRowSpan: 1, soRowSpan: 1 });
        return;
      }
      const soStart = result.length;
      so.rows.forEach(item => {
        const hitList = item.poHits.length > 0 ? item.poHits : [null];
        hitList.forEach((hit, hi) => {
          result.push({
            so, soSeq: soSeq+1,
            item, hit,
            isItemFirst: hi === 0,
            itemRowSpan: hi === 0 ? hitList.length : 0,
            soRowSpan: 0,
          });
        });
      });
      const soCount = result.length - soStart;
      result[soStart].soRowSpan = soCount;
    });
    return result;
  }, [visible]);

  /* ── Totals ── */
  const totals = useMemo(() => ({
    taxable: flatRows.reduce((s,r) => s + (r.hit ? (r.hit.qty||0)*(r.hit.rate||0) : 0), 0),
    amount:  flatRows.reduce((s,r) => {
      if (!r.hit) return s;
      const tx = (r.hit.qty||0)*(r.hit.rate||0);
      return s + tx + tx*(r.hit.gst||0)/100;
    }, 0),
  }), [flatRows]);

  const totalPendingAll = trackingData.filter(d => d.hasPending).length;
  const totalCoveredAll = trackingData.filter(d => !d.hasPending && d.itemsWithQty > 0).length;

  /* ── Print rows ── */
  const doPrint = () => {
    const fyLabel = fy==='all'?'All Financial Years':`FY ${fy}`;
    const rows = flatRows.map(r => [
      r.soSeq,
      r.so.orderNo,
      r.so.customerName,
      r.item?.name || '—',
      r.item ? `${r.item.qty} ${r.item.unit}`.trim() : '—',
      r.item?.unit || '—',
      r.hit?.vendorName || '',
      r.hit ? fmtD(r.hit.poDate) : '',
      r.hit?.poNo || '',
      r.hit ? fmtN(r.hit.rate) : '',
      r.hit ? `${r.hit.gst}%` : '',
      r.hit ? fmtN((r.hit.qty||0)*(r.hit.rate||0)) : '',
      r.hit ? fmtN((r.hit.qty||0)*(r.hit.rate||0)*(1+(r.hit.gst||0)/100)) : '',
      r.hit?.poStatus || 'No PO',
    ]);
    printTrackingReport('PO Tracking Report', fyLabel, rows);
  };

  /* ── Styles ── */
  const TH = ({ children, right, center, w, style:sx={} }) => (
    <th style={{ padding:'7px 9px', background:'#1e293b', color:'#f1f5f9', fontWeight:700,
      fontSize:10.5, textAlign:right?'right':center?'center':'left', whiteSpace:'nowrap',
      borderRight:'1px solid #374151', borderBottom:'2px solid #0f172a',
      position:'sticky', top:0, zIndex:2, width:w||undefined, ...sx }}>
      {children}
    </th>
  );

  const filterBtn = active => ({
    padding:'4px 13px', fontSize:11, fontWeight:600, fontFamily:F,
    background: active ? ORG : '#fff', color: active ? '#fff' : '#57534E',
    border:`1.5px solid ${active ? ORG2 : '#D6D3D1'}`, borderRadius:4, cursor:'pointer',
    transition:'all 0.13s',
  });

  return (
    <div style={{ fontFamily:F, background:'#fff' }}
      onClick={() => {}}>

      {/* ══ STICKY TOP ══ */}
      <div style={{ position:'sticky', top:0, zIndex:20, background:'#fff' }}>

        {/* Title bar */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
          background:ORG, color:'#fff', padding:'0 14px', height:36 }}>
          <span style={{ fontSize:12, fontWeight:700 }}>PO Tracking — Sales Order Material Status</span>
          <div style={{ display:'flex', gap:7 }}>
            <button onClick={load} style={{ background:'rgba(255,255,255,0.15)', color:'#fff',
              border:'1px solid rgba(255,255,255,0.35)', borderRadius:4,
              padding:'3px 11px', fontSize:11, fontWeight:600, cursor:'pointer', fontFamily:F }}>
              ↺ Refresh
            </button>
            <button onClick={doPrint} style={{ background:'rgba(255,255,255,0.15)', color:'#fff',
              border:'1px solid rgba(255,255,255,0.35)', borderRadius:4,
              padding:'3px 11px', fontSize:11, fontWeight:600, cursor:'pointer', fontFamily:F }}>
              🖨 Print
            </button>
            <button onClick={() => navigate('/purchase-order/create')} style={{ background:'#fff', color:ORG,
              border:'none', borderRadius:4, padding:'3px 13px', fontSize:11,
              fontWeight:700, cursor:'pointer', fontFamily:F }}>
              + Create PO
            </button>
          </div>
        </div>

        {/* Stats row */}
        <div style={{ display:'flex', alignItems:'center', gap:8, background:'#FFF7ED',
          borderBottom:'1px solid #FED7AA', padding:'0 14px', height:44, flexWrap:'wrap' }}>
          {[
            { label:'Total SOs',     val:trackingData.length,       color:'#9A3412' },
            { label:'PO Pending',    val:totalPendingAll,            color:'#92400e' },
            { label:'Fully Covered', val:totalCoveredAll,            color:'#104f4f' },
            { label:'Total POs',     val:purchaseOrders.length,      color:'#9A3412' },
            { label:'Showing',       val:`${visible.length} SO${visible.length!==1?'s':''}`, color:'#374151' },
          ].map((s,i) => (
            <div key={s.label} style={{ display:'flex', alignItems:'center', gap:5,
              paddingRight:12, borderRight: i<4 ? '1px solid #FED7AA' : 'none', marginRight: i<4 ? 4 : 0 }}>
              <span style={{ fontSize:18, fontWeight:800, color:s.color }}>{s.val}</span>
              <span style={{ fontSize:9.5, fontWeight:600, color:'#A16207', textTransform:'uppercase', lineHeight:1.2, whiteSpace:'nowrap' }}>{s.label}</span>
            </div>
          ))}
        </div>

        {/* FY + Filter + Search */}
        <div style={{ display:'flex', alignItems:'center', gap:6, padding:'0 12px',
          height:36, borderBottom:'1.5px solid #FED7AA', background:'#FFFBF8', flexWrap:'wrap' }}>
          <span style={{ fontSize:10, fontWeight:700, color:'#92400E' }}>FY:</span>
          {fyList.map(f => {
            const active = fy === f;
            return (
              <button key={f} onClick={() => setFy(f)} style={{
                height:24, padding:'0 11px', fontSize:10.5, fontWeight:active?700:500,
                fontFamily:F, cursor:'pointer', borderRadius:12,
                border:`1.5px solid ${active?ORG2:'#D6D3D1'}`,
                background:active?ORG:'#fff', color:active?'#fff':'#57534E',
                whiteSpace:'nowrap', transition:'all 0.12s' }}>
                {f==='all'?'All Years':`FY ${f}`}
              </button>
            );
          })}

          <div style={{ width:1, height:20, background:'#E7E5E4', margin:'0 4px' }}/>

          {[
            { key:'all',     label:`All` },
            { key:'pending', label:`PO Pending` },
            { key:'covered', label:`Covered` },
          ].map(tab => (
            <button key={tab.key} onClick={() => setFilter(tab.key)} style={filterBtn(filter===tab.key)}>
              {tab.label}
            </button>
          ))}

          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search SO No or Client…"
            style={{ marginLeft:'auto', padding:'4px 10px', fontSize:11, fontFamily:F,
              border:'1.5px solid #D6D3D1', borderRadius:4, width:200, outline:'none' }}
            onFocus={e => e.target.style.borderColor = ORG}
            onBlur={e => e.target.style.borderColor = '#D6D3D1'}
          />
        </div>
      </div>

      {/* ══ FLAT TABLE ══ */}
      {loading ? (
        <div style={{ padding:40, textAlign:'center', color:'#888', fontSize:13 }}>Loading…</div>
      ) : flatRows.length === 0 ? (
        <div style={{ padding:40, textAlign:'center', color:'#888', fontSize:13 }}>No records match current filter.</div>
      ) : (
        <div style={{ overflowX:'auto', overflowY:'auto', maxHeight:'calc(100vh - 210px)' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11, fontFamily:F, minWidth:1200 }}>
            <thead>
              <tr>
                <TH w={30}>#</TH>
                <TH>Order No</TH>
                <TH>Client Name</TH>
                <TH>Material / Item</TH>
                <TH center w={60}>SO Qty</TH>
                <TH>Unit</TH>
                <TH>Vendor Name</TH>
                <TH>PO Date</TH>
                <TH>PO No</TH>
                <TH right>Rate (₹)</TH>
                <TH right w={50}>GST%</TH>
                <TH right>Taxable (₹)</TH>
                <TH right>Amount (₹)</TH>
                <TH center>PO Status</TH>
                <TH center w={60}>Action</TH>
              </tr>
            </thead>
            <tbody>
              {flatRows.map((r, ridx) => {
                const noPO   = r.hit === null;
                const rowBg  = r.soSeq % 2 === 0 ? '#f8fbff' : '#fff';
                const noPObg = noPO ? '#fffbf0' : rowBg;
                const txAmt  = r.hit ? (r.hit.qty||0)*(r.hit.rate||0) : 0;
                const totAmt = txAmt * (1 + (r.hit?.gst||0)/100);

                /* top separator only at the first row of each new SO */
                const soSep = r.soRowSpan > 0 ? { borderTop:'2px solid #9ca3af' } : {};

                const soTD  = (content, extra={}) => r.soRowSpan > 0 ? (
                  <td rowSpan={r.soRowSpan} style={{ padding:'6px 9px',
                    border:`1px solid ${BD}`, borderTop:'2px solid #9ca3af',
                    background:rowBg, verticalAlign:'top', ...extra }}>
                    {content}
                  </td>
                ) : null;

                const itemTD = (content, extra={}) => r.itemRowSpan > 0 ? (
                  <td rowSpan={r.itemRowSpan} style={{ padding:'6px 9px',
                    border:`1px solid ${BD}`, ...soSep,
                    background:noPObg, verticalAlign:'middle', ...extra }}>
                    {content}
                  </td>
                ) : null;

                const cell = (content, right=false, extra={}) => (
                  <td style={{ padding:'6px 9px',
                    border:`1px solid ${BD}`, ...soSep,
                    background:noPObg,
                    textAlign:right?'right':'left', verticalAlign:'middle', ...extra }}>
                    {content}
                  </td>
                );

                return (
                  <tr key={ridx}>
                    {/* SO-level cells (rowspan = entire SO) */}
                    {soTD(
                      <span style={{ fontSize:10.5, color:'#94a3b8', fontWeight:700 }}>{r.soSeq}</span>
                    )}
                    {soTD(
                      <span style={{ fontWeight:800, color:'#1e293b', fontSize:12 }}>{r.so.orderNo}</span>
                    )}
                    {soTD(
                      <div>
                        <div style={{ fontWeight:600, color:'#1e293b', fontSize:11 }}>{r.so.customerName}</div>
                        <div style={{ fontSize:9.5, color:'#94a3b8', marginTop:1 }}>{fmtD(r.so.orderDate)}</div>
                      </div>
                    )}

                    {/* Item-level cells (rowspan = PO hit count for this item) */}
                    {itemTD(
                      r.item
                        ? <div>
                            <div style={{ display:'flex', alignItems:'center', gap:5, flexWrap:'wrap' }}>
                              <span style={{ fontWeight:600, color:'#1e293b' }}>{r.item.name}</span>
                              {r.item.isAddon && (
                                <span style={{ fontSize:9, fontWeight:700, padding:'1px 5px', borderRadius:3,
                                  background:'#fff3e0', color:'#b45309', border:'1px solid #fbbf24',
                                  whiteSpace:'nowrap' }}>Add-on</span>
                              )}
                            </div>
                            {r.item.code && <div style={{ fontSize:9.5, color:'#94a3b8', marginTop:1 }}>{r.item.code}</div>}
                            {r.item.hsn  && <div style={{ fontSize:9.5, color:'#94a3b8' }}>HSN: {r.item.hsn}</div>}
                          </div>
                        : <span style={{ color:'#aaa', fontStyle:'italic' }}>No items</span>
                    )}
                    {itemTD(
                      <span style={{ fontWeight:700, color:'#1e293b' }}>
                        {r.item ? r.item.qty.toFixed(2) : '—'}
                      </span>,
                      { textAlign:'center' }
                    )}
                    {itemTD(
                      <span style={{ color:'#6b7280' }}>{r.item?.unit || '—'}</span>,
                      { textAlign:'center' }
                    )}

                    {/* PO-level cells — blank if no PO */}
                    {cell(
                      noPO
                        ? <span style={{ color:'#94a3b8', fontStyle:'italic', fontSize:10 }}>—</span>
                        : <span style={{ fontWeight:600, color:'#1e293b' }}>{r.hit.vendorName}</span>
                    )}
                    {cell(
                      noPO ? '' : fmtD(r.hit.poDate),
                      false,
                      { color:'#6b7280', whiteSpace:'nowrap' }
                    )}
                    {cell(
                      noPO
                        ? ''
                        : <span style={{ fontWeight:700, color:'#1e293b', cursor:'pointer', textDecoration:'underline' }}
                            onClick={() => navigate(`/purchase-order/edit/${r.hit.poId}`)}>
                            {r.hit.poNo}
                          </span>
                    )}
                    {cell(
                      noPO ? '' : fmtN(r.hit.rate),
                      true,
                      { fontWeight: noPO?400:600, color:'#374151' }
                    )}
                    {cell(
                      noPO ? '' : `${r.hit.gst}%`,
                      true,
                      { color:'#6b7280' }
                    )}
                    {cell(
                      noPO ? '' : fmtN(txAmt),
                      true,
                      { fontWeight:600, color:'#1e293b' }
                    )}
                    {cell(
                      noPO ? '' : fmtN(totAmt),
                      true,
                      { fontWeight:700, color:'#104f4f' }
                    )}
                    {cell(
                      noPO
                        ? <span style={{ background:'#fee2e2', color:'#991b1b', padding:'2px 8px',
                            borderRadius:10, fontSize:9.5, fontWeight:700, border:'1px solid #fca5a5', whiteSpace:'nowrap' }}>
                            No PO
                          </span>
                        : <StatusBadge label={r.hit.poStatus} />,
                      false,
                      { textAlign:'center' }
                    )}
                    {/* Action — only on first row of SO */}
                    {r.soRowSpan > 0 ? (
                      <td rowSpan={r.soRowSpan} style={{ padding:'6px 8px',
                        border:`1px solid ${BD}`, borderTop:'2px solid #9ca3af',
                        background:rowBg, textAlign:'center', verticalAlign:'middle' }}>
                        <button onClick={() => navigate('/purchase-order/create', { state: { linkedSalesOrderId: r.so.soId } })}
                          style={{ padding:'4px 10px', background:'#1e293b', color:'#fff', border:'none',
                            borderRadius:5, fontSize:10, fontWeight:700, cursor:'pointer', fontFamily:F,
                            whiteSpace:'nowrap' }}>
                          + PO
                        </button>
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>

            {/* ── Totals Footer ── */}
            {flatRows.length > 0 && (
              <tfoot>
                <tr style={{ background:'#eef2ff' }}>
                  <td colSpan={11} style={{ padding:'7px 10px', borderTop:'2px solid #818cf8',
                    color:'#4f46e5', fontWeight:700, fontSize:11, borderRight:`1px solid ${BD}` }}>
                    TOTAL — {visible.length} SO{visible.length!==1?'s':''}, {flatRows.filter(r=>r.hit).length} PO item row{flatRows.filter(r=>r.hit).length!==1?'s':''}
                  </td>
                  <td style={{ padding:'7px 9px', textAlign:'right', borderTop:'2px solid #818cf8',
                    borderRight:`1px solid ${BD}`, fontWeight:700, color:'#1e293b', fontSize:11 }}>
                    ₹{totals.taxable.toFixed(2)}
                  </td>
                  <td style={{ padding:'7px 9px', textAlign:'right', borderTop:'2px solid #818cf8',
                    borderRight:`1px solid ${BD}`, fontWeight:800, color:'#4f46e5', fontSize:12 }}>
                    ₹{totals.amount.toFixed(2)}
                  </td>
                  <td colSpan={2} style={{ borderTop:'2px solid #818cf8' }}/>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}

      <div style={{ fontSize:10, color:'#A8A29E', fontFamily:F, padding:'5px 14px 8px' }}>
        * Item matching is based on item name/code. PO rows appear once per matching PO. If no PO raised for an item, PO columns are blank.
      </div>
    </div>
  );
}
