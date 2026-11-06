import React, { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import { useCompany } from '../../context/CompanyContext';
import { withPrintFont } from '../../utils/printFont';

const P  = '#133d80';
const F  = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const BD = '#E5EAF2';
const BG = '#F5F7FB';

const fmt  = n => Number(n||0).toFixed(2);
const fmtD = d => { if(!d) return '—'; const dt=new Date(d); return isNaN(dt)?d:`${String(dt.getDate()).padStart(2,'0')}-${String(dt.getMonth()+1).padStart(2,'0')}-${dt.getFullYear()}`; };
const norm = s => String(s||'').trim().toLowerCase().replace(/\s+/g,'');

/* ── Status badge ── */
const Badge = ({ type }) => {
  const cfg = {
    matched:  { bg:'#ECFDF5', color:'#065F46', border:'#6EE7B7', label:'✅ Matched' },
    erponly:  { bg:'#FFF7ED', color:'#92400E', border:'#FCD34D', label:'⚠️ ERP Only' },
    gstonly:  { bg:'#FEF2F2', color:'#991B1B', border:'#FECACA', label:'🔴 GST Only' },
    accepted: { bg:'#ECFDF5', color:'#065F46', border:'#6EE7B7', label:'Accepted' },
    pending:  { bg:'#FEF3C7', color:'#92400E', border:'#FDE68A', label:'Pending' },
  };
  const c = cfg[type] || cfg.pending;
  return <span style={{ padding:'2px 8px', borderRadius:10, fontSize:10, fontWeight:700,
    background:c.bg, color:c.color, border:`1px solid ${c.border}`, whiteSpace:'nowrap' }}>{c.label}</span>;
};

/* ── KPI card ── */
const KPI = ({ label, value, sub, color='#133d80', bg='#EFF6FF' }) => (
  <div style={{ flex:1, background:bg, borderRadius:8, padding:'12px 16px', border:`1px solid ${BD}`, minWidth:130 }}>
    <div style={{ fontSize:10, color:'#6B7280', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:4 }}>{label}</div>
    <div style={{ fontSize:18, fontWeight:800, color }}>{value}</div>
    {sub && <div style={{ fontSize:10, color:'#9CA3AF', marginTop:2 }}>{sub}</div>}
  </div>
);

/* ── Parse GSTR-2B JSON ── */
function parseGSTR2B(json) {
  const data = json?.data || json;
  const b2b  = data?.docdata?.b2b  || [];
  const cdnr = data?.docdata?.cdnr || [];
  const invoices = [];

  b2b.forEach(sup => {
    (sup.inv || []).forEach(inv => {
      invoices.push({
        gstin:    sup.ctin,
        trdnm:    sup.trdnm,
        supprd:   sup.supprd,
        supfildt: sup.supfildt,
        inum:     inv.inum,
        dt:       inv.dt,
        txval:    parseFloat(inv.txval) || 0,
        igst:     parseFloat(inv.igst)  || 0,
        cgst:     parseFloat(inv.cgst)  || 0,
        sgst:     parseFloat(inv.sgst)  || 0,
        cess:     parseFloat(inv.cess)  || 0,
        val:      parseFloat(inv.val)   || 0,
        rev:      inv.rev,
        itcavl:   inv.itcavl,
        imsStatus:inv.imsStatus,
        irn:      inv.irn || '',
        srctyp:   inv.srctyp || '',
        type:     'B2B',
      });
    });
  });

  cdnr.forEach(sup => {
    (sup.nt || []).forEach(nt => {
      invoices.push({
        gstin:    sup.ctin,
        trdnm:    sup.trdnm,
        supprd:   sup.supprd,
        supfildt: sup.supfildt,
        inum:     nt.ntnum,
        dt:       nt.dt,
        txval:    parseFloat(nt.txval) || 0,
        igst:     parseFloat(nt.igst)  || 0,
        cgst:     parseFloat(nt.cgst)  || 0,
        sgst:     parseFloat(nt.sgst)  || 0,
        cess:     0,
        val:      parseFloat(nt.val)   || 0,
        rev:      nt.rev,
        itcavl:   nt.itcavl,
        imsStatus:nt.imsStatus,
        irn:      '',
        srctyp:   '',
        type:     'CDNR',
      });
    });
  });

  return {
    gstin:   data?.gstin   || '',
    rtnprd:  data?.rtnprd  || '',
    gendt:   data?.gendt   || '',
    invoices,
  };
}

/* ── Reconcile ERP bills vs GST portal invoices ── */
function reconcile(erpBills, gstInvoices) {
  const matched   = [];
  const erpOnly   = [];
  const gstOnly   = [];

  const usedGst = new Set();

  erpBills.forEach(bill => {
    const invNo  = norm(bill.vendorBillNo || bill.billNo || '');
    const gstin  = norm(bill.partyGstin   || '');
    const amount = parseFloat(bill.grandTotal) || 0;

    // try match: gstin + invoice number
    let found = gstInvoices.find((g, idx) =>
      !usedGst.has(idx) &&
      norm(g.inum) === invNo &&
      (gstin === '' || norm(g.gstin) === gstin)
    );

    // fallback: invoice number only
    if (!found && invNo) {
      found = gstInvoices.find((g, idx) =>
        !usedGst.has(idx) && norm(g.inum) === invNo
      );
    }

    if (found) {
      const idx = gstInvoices.indexOf(found);
      usedGst.add(idx);
      const gstTotal = found.txval + found.igst + found.cgst + found.sgst;
      const diff     = Math.abs(amount - gstTotal);
      matched.push({ erp: bill, gst: found, diff, amtMatch: diff < 2 });
    } else {
      erpOnly.push({ erp: bill, gst: null });
    }
  });

  gstInvoices.forEach((g, idx) => {
    if (!usedGst.has(idx)) gstOnly.push({ erp: null, gst: g });
  });

  return { matched, erpOnly, gstOnly };
}

/* ══════════════════════ MAIN COMPONENT ══════════════════════ */
export default function GSTCompliance() {
  const { selectedCompany } = useCompany();
  const cid = selectedCompany?.companyId || '';

  const [tab,        setTab]        = useState('purchase'); // 'purchase' | 'sales'
  const [purBills,   setPurBills]   = useState([]);
  const [salBills,   setSalBills]   = useState([]);
  const [loading,      setLoading]    = useState(false);
  const [gstr2b,       setGstr2b]     = useState(null);
  const [fileName,     setFileName]   = useState('');
  const [filter,       setFilter]     = useState('all');
  const [viewMode,     setViewMode]   = useState('flat'); // 'flat' | 'vendor'
  const [search,       setSearch]     = useState('');
  const [msg,          setMsg]        = useState('');
  /* FY / month filters — based on BILL DATE, not return period */
  const [selFY,        setSelFY]      = useState('');   // e.g. '2026-27'
  const [selBillMonth, setSelBillMonth] = useState(''); // e.g. '2026-04' (YYYY-MM of bill date)

  /* load ERP bills */
  const load = useCallback(async () => {
    if (!cid) return;
    setLoading(true);
    try {
      const [pR, sR] = await Promise.all([
        axios.get(`/api/bills?companyId=${cid}&type=purchase`),
        axios.get(`/api/bills?companyId=${cid}&type=sales`),
      ]);
      setPurBills(pR.data || []);
      setSalBills(sR.data || []);
    } catch(e) { setMsg('Error loading bills: '+e.message); }
    finally { setLoading(false); }
  }, [cid]);

  useEffect(() => { load(); }, [load]);

  /* handle JSON upload */
  const handleUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const json = JSON.parse(ev.target.result);
        setGstr2b(parseGSTR2B(json));
        setMsg('');
      } catch { setMsg('Invalid JSON file. Please upload a valid GSTR-2B file.'); }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  /* reconciliation result */
  const recon = useMemo(() => {
    if (!gstr2b) return null;
    return reconcile(purBills, gstr2b.invoices);
  }, [purBills, gstr2b]);

  /* ── date helpers ── */
  const parseDate = d => {
    if (!d) return null;
    if (/^\d{2}-\d{2}-\d{4}$/.test(d)) {
      const [dd,mm,yyyy] = d.split('-');
      return new Date(`${yyyy}-${mm}-${dd}`);
    }
    const dt = new Date(d); return isNaN(dt) ? null : dt;
  };
  const rowDate = r => parseDate(r.erp?.billDate || r.gst?.dt || '');
  const getYM   = dt => dt ? `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}` : '';
  const getFY   = dt => {
    if (!dt) return '';
    const m = dt.getMonth()+1, y = dt.getFullYear();
    return m >= 4 ? `${y}-${String(y+1).slice(2)}` : `${y-1}-${String(y).slice(2)}`;
  };
  /* parse GSTR-2B supprd "042026" → "2026-04" */
  const supprdToYM = s => s && s.length===6 ? `${s.slice(2)}-${s.slice(0,2)}` : '';
  /* "2026-04" → "Apr 26" */
  const ymLabel = ym => {
    if (!ym) return '—';
    const [y,m] = ym.split('-');
    const months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${months[parseInt(m)-1]} ${String(y).slice(2)}`;
  };

  /* ── FY months in order Apr-Mar ── */
  const FY_MONTH_ORDER = [4,5,6,7,8,9,10,11,12,1,2,3];
  const fyMonths = fy => {
    if (!fy) return [];
    const [startY] = fy.split('-').map(Number);
    return FY_MONTH_ORDER.map(m => {
      const y = m >= 4 ? startY : startY + 1;
      return `${y}-${String(m).padStart(2,'0')}`;
    });
  };

  /* ── all base rows ── */
  const baseRows = useMemo(() => {
    if (!recon) return [];
    return [
      ...recon.matched.map(r => ({ ...r, status:'matched' })),
      ...recon.erpOnly.map(r => ({ ...r, status:'erponly' })),
      ...recon.gstOnly.map(r => ({ ...r, status:'gstonly' })),
    ];
  }, [recon]);

  /* ── available FYs from bill dates ── */
  const availableFYs = useMemo(() => {
    const fys = new Set();
    baseRows.forEach(r => { const dt=rowDate(r); if(dt) fys.add(getFY(dt)); });
    return [...fys].sort().reverse();
  }, [baseRows]);

  /* months that have data in selected FY */
  const activeMonths = useMemo(() => {
    if (!selFY) return [];
    const months = new Set();
    baseRows.forEach(r => {
      const dt = rowDate(r);
      if (dt && getFY(dt) === selFY) months.add(getYM(dt));
    });
    return fyMonths(selFY).filter(m => months.has(m)); // only months with data, in FY order
  }, [baseRows, selFY]);

  /* ── filtered rows ── */
  const allRows = useMemo(() => {
    const q = search.toLowerCase();
    return baseRows.filter(r => {
      if (filter !== 'all' && r.status !== filter) return false;
      const dt = rowDate(r);
      const ym = getYM(dt);
      const fy = getFY(dt);
      if (selBillMonth && ym !== selBillMonth) return false;
      else if (selFY && !selBillMonth && fy !== selFY) return false;
      if (!q) return true;
      const invNo = (r.gst?.inum || r.erp?.vendorBillNo || '').toLowerCase();
      const party = (r.erp?.partyName || r.gst?.trdnm || '').toLowerCase();
      const gstin = (r.erp?.partyGstin || r.gst?.gstin || '').toLowerCase();
      return invNo.includes(q) || party.includes(q) || gstin.includes(q);
    });
  }, [baseRows, filter, search, selFY, selBillMonth]);

  /* ── vendor grouping ── */
  const vendorGroups = useMemo(() => {
    const map = {};
    allRows.forEach(r => {
      const key  = r.erp?.partyName || r.gst?.trdnm || 'Unknown';
      const gstin = r.erp?.partyGstin || r.gst?.gstin || '';
      if (!map[key]) map[key] = { name:key, gstin, rows:[], matched:0, erpOnly:0, gstOnly:0, totalGST:0, hasLate:false };
      map[key].rows.push(r);
      if (r.status==='matched') map[key].matched++;
      else if (r.status==='erponly') map[key].erpOnly++;
      else map[key].gstOnly++;
      map[key].totalGST += r.erp ? parseFloat(r.erp.totalGST||0) : (r.gst?.igst||0)+(r.gst?.cgst||0)+(r.gst?.sgst||0);
      // late filer: bill date month ≠ return period month
      if (r.gst?.supprd) {
        const billYM = getYM(parseDate(r.gst.dt));
        const retYM  = supprdToYM(r.gst.supprd);
        if (billYM && retYM && billYM !== retYM) map[key].hasLate = true;
      }
    });
    return Object.values(map).sort((a,b)=>a.name.localeCompare(b.name));
  }, [allRows]);

  /* ── Excel export ── */
  const exportExcel = (rows, type) => {
    const headers = ['Status','Invoice No (GST)','Party Name','GSTIN','Bill Date','Return Period',
      'Late Filed','Taxable (₹)','IGST (₹)','CGST (₹)','SGST (₹)','Total (₹)','IMS Status','Remarks'];
    const data = rows.map(r => {
      const billYM = getYM(parseDate(r.gst?.dt || r.erp?.billDate));
      const retYM  = supprdToYM(r.gst?.supprd||'');
      const late   = billYM && retYM && billYM !== retYM ? 'YES' : 'NO';
      return [
        r.status==='matched'?'Matched':r.status==='erponly'?'ERP Only':'GST Only',
        r.gst?.inum || '—',
        r.erp?.partyName || r.gst?.trdnm || '—',
        r.erp?.partyGstin || r.gst?.gstin || '—',
        fmtD(r.erp?.billDate || r.gst?.dt),
        r.gst?.supprd ? ymLabel(supprdToYM(r.gst.supprd)) : '—',
        late,
        fmt(r.erp ? parseFloat(r.erp.subTotal||0) : (r.gst?.txval||0)),
        fmt(r.gst?.igst||0), fmt(r.gst?.cgst||0), fmt(r.gst?.sgst||0),
        fmt(r.erp ? parseFloat(r.erp.grandTotal||0) : (r.gst?.val||0)),
        r.gst?.imsStatus==='A'?'Accepted':r.gst?.imsStatus==='N'?'Not Accepted':'—',
        r.status==='erponly'?'Supplier not filed':r.status==='gstonly'?'Not in ERP':
          r.amtMatch?'':('Amount mismatch ₹'+fmt(r.diff)),
      ];
    });

    let csv = [headers, ...data].map(row => row.map(v => `"${String(v||'').replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob = new Blob(['﻿'+csv], { type:'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href=url; a.download=`GST_Reconciliation_${type}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  /* ── PDF print ── */
  const printRecon = (rows, period) => {
    const matched = rows.filter(r=>r.status==='matched').length;
    const erpOnly = rows.filter(r=>r.status==='erponly').length;
    const gstOnly = rows.filter(r=>r.status==='gstonly').length;
    const totalGST = rows.reduce((s,r)=> s+(r.erp ? parseFloat(r.erp.totalGST||0) : (r.gst?.igst||0)+(r.gst?.cgst||0)+(r.gst?.sgst||0)), 0);

    const rowsHtml = rows.map((r,i) => {
      const status  = r.status==='matched'?'✅ Matched':r.status==='erponly'?'⚠️ ERP Only':'🔴 GST Only';
      const bg      = r.status==='matched'?'#ECFDF5':r.status==='erponly'?'#FFF7ED':'#FEF2F2';
      const billYM  = getYM(parseDate(r.gst?.dt||r.erp?.billDate||''));
      const retYM   = supprdToYM(r.gst?.supprd||'');
      const isLate  = billYM && retYM && billYM !== retYM;
      return `<tr style="background:${i%2===0?'#fff':bg}">
        <td>${status}</td>
        <td>${r.gst?.inum||'—'}</td>
        <td>${r.erp?.partyName||r.gst?.trdnm||'—'}</td>
        <td style="font-size:8pt">${r.erp?.partyGstin||r.gst?.gstin||'—'}</td>
        <td>${fmtD(r.gst?.dt||r.erp?.billDate)}</td>
        <td style="text-align:center;${isLate?'color:#b45309;font-weight:700':''}">${retYM?ymLabel(retYM):'—'}${isLate?' ⚠️':''}</td>
        <td style="text-align:right">₹${fmt(r.erp?parseFloat(r.erp.subTotal||0):(r.gst?.txval||0))}</td>
        <td style="text-align:right">₹${fmt((r.gst?.igst||0)+(r.gst?.cgst||0)+(r.gst?.sgst||0))}</td>
        <td style="text-align:right;font-weight:700">₹${fmt(r.erp?parseFloat(r.erp.grandTotal||0):(r.gst?.val||0))}</td>
        <td>${r.gst?.imsStatus==='A'?'Accepted':r.gst?.imsStatus==='N'?'Pending':'—'}</td>
      </tr>`;
    }).join('');

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>GST Reconciliation</title>
<style>*{box-sizing:border-box;margin:0;padding:0;}body{font-family:Arial,sans-serif;font-size:9pt;color:#1a1a1a;}
.hdr{background:#133d80;color:#fff;padding:10px 16px;display:flex;justify-content:space-between;align-items:center;}
.hdr h1{font-size:14pt;font-weight:900;letter-spacing:1px;}
.hdr .sub{font-size:9pt;opacity:0.8;margin-top:2px;}
.kpis{display:flex;gap:0;border-bottom:2px solid #133d80;}
.kpi{flex:1;padding:8px 14px;text-align:center;border-right:1px solid #d1d9ed;}
.kpi:last-child{border-right:none;}
.kpi-lbl{font-size:7pt;color:#6b7280;text-transform:uppercase;font-weight:700;letter-spacing:0.5px;}
.kpi-val{font-size:14pt;font-weight:800;margin-top:2px;}
.body{padding:10px 16px;}
table{width:100%;border-collapse:collapse;font-size:8pt;}
th{background:#133d80;color:#fff;padding:5px 7px;text-align:left;border:1px solid #0d2d6b;font-weight:700;}
td{padding:4px 7px;border:1px solid #d1d9ed;}
.footer{margin-top:14px;padding-top:8px;border-top:1px solid #d1d9ed;font-size:8pt;color:#9ca3af;display:flex;justify-content:space-between;}
@media print{@page{size:A4 landscape;margin:8mm;}}</style></head><body>
<div class="hdr">
  <div><h1>GST RECONCILIATION REPORT</h1>
    <div class="sub">GSTR-2B vs ERP Purchase Bills&nbsp;&nbsp;|&nbsp;&nbsp;Period: ${period}&nbsp;&nbsp;|&nbsp;&nbsp;GSTIN: ${selectedCompany?.gstin||gstr2b?.gstin||'—'}</div>
  </div>
  <div style="text-align:right;font-size:8.5pt;opacity:0.9">
    ${selectedCompany?.companyName||''}<br>Generated: ${new Date().toLocaleDateString('en-IN')}
  </div>
</div>
<div class="kpis">
  <div class="kpi"><div class="kpi-lbl">Total Records</div><div class="kpi-val" style="color:#133d80">${rows.length}</div></div>
  <div class="kpi"><div class="kpi-lbl">✅ Matched</div><div class="kpi-val" style="color:#059669">${matched}</div></div>
  <div class="kpi"><div class="kpi-lbl">⚠️ ERP Only</div><div class="kpi-val" style="color:#d97706">${erpOnly}</div></div>
  <div class="kpi"><div class="kpi-lbl">🔴 GST Only</div><div class="kpi-val" style="color:#dc2626">${gstOnly}</div></div>
  <div class="kpi"><div class="kpi-lbl">Total GST (₹)</div><div class="kpi-val" style="color:#7c3aed">₹${fmt(totalGST)}</div></div>
</div>
<div class="body">
  <table><thead><tr>
    <th>Status</th><th>Invoice No (GST)</th><th>Party Name</th>
    <th>GSTIN</th><th>Bill Date</th><th style="text-align:center">Return Period</th>
    <th style="text-align:right">Taxable</th>
    <th style="text-align:right">GST</th><th style="text-align:right">Total</th><th>IMS</th>
  </tr></thead><tbody>${rowsHtml}</tbody></table>
  <div class="footer">
    <span>ERP System — GST Compliance Module</span>
    <span>Total GST ITC Available: ₹${fmt(totalGST)}</span>
  </div>
</div>
<script>window.onload=()=>setTimeout(()=>window.print(),400);<\/script>
</body></html>`;
    const w = window.open('','_blank','width=1200,height=900,scrollbars=yes');
    if(!w){alert('Allow pop-ups to print.');return;}
    w.document.write(withPrintFont(html)); w.document.close();
  };

  /* ── Sales bill Excel export ── */
  const exportSalesExcel = () => {
    const headers = ['Bill No','Date','Sales Order','Client','GSTIN','GST Type','Taxable (₹)','GST (₹)','Grand Total (₹)'];
    const data = salBills.map(b => [
      b.billNo||'—', fmtD(b.billDate), b.orderNo||'—', b.partyName||'—',
      b.partyGstin||'—', b.gstType==='intrastate'?'CGST+SGST':'IGST',
      fmt(b.subTotal), fmt(b.totalGST), fmt(b.grandTotal),
    ]);
    const totals = ['TOTAL','','','','','',
      fmt(salBills.reduce((s,b)=>s+(parseFloat(b.subTotal)||0),0)),
      fmt(salBills.reduce((s,b)=>s+(parseFloat(b.totalGST)||0),0)),
      fmt(salBills.reduce((s,b)=>s+(parseFloat(b.grandTotal)||0),0)),
    ];
    let csv = [headers,...data,totals].map(r=>r.map(v=>`"${String(v||'').replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob=new Blob(['﻿'+csv],{type:'text/csv;charset=utf-8;'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');a.href=url;a.download='Sales_Bills_GST.csv';a.click();
    URL.revokeObjectURL(url);
  };

  const period = gstr2b?.rtnprd
    ? `${gstr2b.rtnprd.slice(0,2)}/${gstr2b.rtnprd.slice(2)}`
    : 'Not uploaded';

  /* ══ RENDER ══ */
  return (
    <div style={{ background:BG, minHeight:'100%', fontFamily:F }}>

      {/* Page Header */}
      <div style={{ background:P, padding:'14px 20px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div>
          <div style={{ fontSize:15, fontWeight:800, color:'#fff', letterSpacing:'-0.2px' }}>GST Compliance</div>
          <div style={{ fontSize:11, color:'rgba(255,255,255,0.65)', marginTop:2 }}>
            GSTR-2B Reconciliation &amp; Tax Invoice Register
          </div>
        </div>
        <button onClick={load} style={{ height:30, padding:'0 14px', fontSize:12, fontFamily:F, cursor:'pointer',
          background:'rgba(255,255,255,0.12)', color:'#fff', border:'1px solid rgba(255,255,255,0.25)', borderRadius:6, fontWeight:600 }}>
          ↻ Refresh
        </button>
      </div>

      {/* Tabs */}
      <div style={{ background:'#fff', borderBottom:`2px solid ${BD}`, display:'flex', padding:'0 16px' }}>
        {[
          { key:'purchase', label:'📥 Purchase Bills (GSTR-2B)' },
          { key:'sales',    label:'📤 Sales Bills (GSTR-1)' },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            style={{ padding:'8px 18px', fontSize:12, fontWeight: tab===t.key?700:500,
              fontFamily:F, cursor:'pointer', border:'none', background:'transparent',
              color: tab===t.key?P:'#6B7280',
              borderBottom: tab===t.key?`2px solid ${P}`:'2px solid transparent',
              marginBottom:-2 }}>
            {t.label}
          </button>
        ))}
      </div>

      {msg && <div style={{ margin:'10px 16px 0', padding:'8px 14px', fontSize:12, background:'#FEF2F2',
        color:'#DC2626', border:'1px solid #FECACA', borderRadius:6, fontFamily:F }}>{msg}</div>}

      {loading ? (
        <div style={{ padding:60, textAlign:'center', color:'#9CA3AF', fontSize:13, fontFamily:F }}>Loading…</div>
      ) : (

        /* ═════════════ PURCHASE TAB ═════════════ */
        tab === 'purchase' ? (
          <div style={{ padding:'14px 16px' }}>

            {/* Upload + info strip */}
            <div style={{ background:'#fff', border:`1px solid ${BD}`, borderRadius:10, padding:'16px 18px', marginBottom:14,
              display:'flex', alignItems:'center', gap:16, flexWrap:'wrap' }}>
              <div style={{ flex:1, minWidth:260 }}>
                <div style={{ fontSize:13, fontWeight:700, color:'#1E293B', marginBottom:4 }}>Upload GSTR-2B JSON</div>
                <div style={{ fontSize:11, color:'#6B7280' }}>
                  Download from GST Portal → Returns → GSTR-2B → Download JSON (returns_R2B_*.json)
                </div>
              </div>
              <label style={{ cursor:'pointer', height:36, padding:'0 18px', background:P, color:'#fff',
                border:'none', borderRadius:6, fontSize:12, fontWeight:700, fontFamily:F,
                display:'flex', alignItems:'center', gap:6 }}>
                📁 Upload GSTR-2B JSON
                <input type="file" accept=".json" onChange={handleUpload} style={{ display:'none' }}/>
              </label>
              {gstr2b && (
                <div style={{ padding:'6px 14px', background:'#ECFDF5', border:'1px solid #A7F3D0',
                  borderRadius:6, fontSize:11, fontWeight:600, color:'#059669' }}>
                  ✅ {fileName}<br/>
                  <span style={{ fontWeight:400, color:'#374151' }}>Period: {period} &nbsp;|&nbsp; {gstr2b.invoices.length} invoices &nbsp;|&nbsp; Generated: {gstr2b.gendt}</span>
                </div>
              )}
            </div>

            {!gstr2b ? (
              /* No JSON uploaded yet — show ERP purchase bills */
              <div style={{ background:'#fff', border:`1px solid ${BD}`, borderRadius:10, overflow:'hidden' }}>
                <div style={{ padding:'10px 16px', background:'#F8FAFF', borderBottom:`1px solid ${BD}`,
                  display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <span style={{ fontWeight:700, fontSize:13, color:'#1E293B' }}>
                    ERP Purchase Bills ({purBills.length})
                  </span>
                  <span style={{ fontSize:11, color:'#6B7280' }}>Upload GSTR-2B JSON to start reconciliation</span>
                </div>
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11, fontFamily:F }}>
                  <thead>
                    <tr style={{ background:P }}>
                      {['#','Bill No (ERP)','Vendor Invoice No','Party Name','GSTIN','Date','Taxable (₹)','GST (₹)','Total (₹)'].map((h,i) => (
                        <th key={h} style={{ padding:'7px 10px', color:'#fff', fontWeight:700, fontSize:10,
                          textAlign: i>=6?'right':'left', border:'1px solid #0d2d6b', whiteSpace:'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {purBills.length===0 ? (
                      <tr><td colSpan={9} style={{ padding:30, textAlign:'center', color:'#9CA3AF', fontStyle:'italic' }}>No purchase bills in ERP</td></tr>
                    ) : [...purBills].sort((a,b)=>new Date(b.billDate)-new Date(a.billDate)).map((b,i) => (
                      <tr key={b.billId} style={{ background:i%2===0?'#fff':'#F8FAFF' }}>
                        <td style={{ padding:'5px 10px', border:`1px solid ${BD}`, color:'#9CA3AF', textAlign:'center' }}>{i+1}</td>
                        <td style={{ padding:'5px 10px', border:`1px solid ${BD}`, fontWeight:700, color:P }}>{b.billNo||'—'}</td>
                        <td style={{ padding:'5px 10px', border:`1px solid ${BD}`, fontWeight:600 }}>{b.vendorBillNo||'—'}</td>
                        <td style={{ padding:'5px 10px', border:`1px solid ${BD}` }}>{b.partyName||'—'}</td>
                        <td style={{ padding:'5px 10px', border:`1px solid ${BD}`, fontSize:10, color:'#555' }}>{b.partyGstin||'—'}</td>
                        <td style={{ padding:'5px 10px', border:`1px solid ${BD}`, whiteSpace:'nowrap' }}>{fmtD(b.billDate)}</td>
                        <td style={{ padding:'5px 10px', border:`1px solid ${BD}`, textAlign:'right' }}>₹{fmt(b.subTotal)}</td>
                        <td style={{ padding:'5px 10px', border:`1px solid ${BD}`, textAlign:'right', color:'#7C3AED' }}>₹{fmt(b.totalGST)}</td>
                        <td style={{ padding:'5px 10px', border:`1px solid ${BD}`, textAlign:'right', fontWeight:700, color:P }}>₹{fmt(b.grandTotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              /* Reconciliation view */
              <>
                {/* KPIs */}
                <div style={{ display:'flex', gap:10, marginBottom:14, flexWrap:'wrap' }}>
                  <KPI label="Total Records"    value={recon.matched.length+recon.erpOnly.length+recon.gstOnly.length} color={P} bg='#EFF6FF'/>
                  <KPI label="✅ Matched"        value={recon.matched.length}  color='#059669' bg='#ECFDF5'
                    sub={`${recon.matched.filter(r=>r.amtMatch).length} amt ok · ${recon.matched.filter(r=>!r.amtMatch).length} mismatch`}/>
                  <KPI label="⚠️ ERP Only"       value={recon.erpOnly.length}  color='#D97706' bg='#FFFBEB'
                    sub="Supplier not filed"/>
                  <KPI label="🔴 GST Only"       value={recon.gstOnly.length}  color='#DC2626' bg='#FEF2F2'
                    sub="Not in ERP"/>
                  <KPI label="ITC Available (₹)" value={'₹'+fmt(recon.matched.reduce((s,r)=>s+(r.gst?r.gst.igst+r.gst.cgst+r.gst.sgst:0),0))}
                    color='#7C3AED' bg='#F5F3FF'/>
                  <KPI label="ERP Bills"         value={purBills.length}       color='#374151' bg='#F9FAFB'/>
                  <KPI label="GST Invoices"      value={gstr2b.invoices.length} color='#374151' bg='#F9FAFB'/>
                </div>

                {/* ── Row 1: FY selector ── */}
                <div style={{ background:'#fff', border:`1px solid ${BD}`, borderRadius:'8px 8px 0 0',
                  borderBottom:'none', padding:'8px 14px', display:'flex', alignItems:'center', gap:8 }}>
                  <span style={{ fontSize:11, fontWeight:700, color:'#374151', marginRight:4 }}>Financial Year:</span>
                  <button onClick={()=>{setSelFY('');setSelBillMonth('');}}
                    style={{ padding:'3px 12px', fontSize:11, fontWeight:!selFY?700:400,
                      background:!selFY?P:'#F9FAFB', color:!selFY?'#fff':'#374151',
                      border:`1px solid ${!selFY?P:BD}`, borderRadius:5, cursor:'pointer', fontFamily:F }}>
                    All Years
                  </button>
                  {availableFYs.map(fy => (
                    <button key={fy} onClick={()=>{setSelFY(fy);setSelBillMonth('');}}
                      style={{ padding:'3px 12px', fontSize:11, fontWeight:selFY===fy?700:400,
                        background:selFY===fy?P:'#F9FAFB', color:selFY===fy?'#fff':'#374151',
                        border:`1px solid ${selFY===fy?P:BD}`, borderRadius:5, cursor:'pointer', fontFamily:F }}>
                      FY {fy}
                    </button>
                  ))}
                </div>

                {/* ── Row 2: Month tabs (only when FY selected) ── */}
                {selFY && (
                  <div style={{ background:'#F8FAFF', border:`1px solid ${BD}`, borderTop:'none',
                    borderBottom:'none', padding:'6px 14px', display:'flex', gap:4, flexWrap:'wrap', alignItems:'center' }}>
                    <span style={{ fontSize:10, fontWeight:700, color:'#6B7280', marginRight:4, textTransform:'uppercase', letterSpacing:'0.5px' }}>Bill Date Month:</span>
                    <button onClick={()=>setSelBillMonth('')}
                      style={{ padding:'3px 10px', fontSize:11, fontWeight:!selBillMonth?700:400,
                        background:!selBillMonth?'#7C3AED':'#fff', color:!selBillMonth?'#fff':'#374151',
                        border:`1px solid ${!selBillMonth?'#7C3AED':BD}`, borderRadius:5, cursor:'pointer', fontFamily:F }}>
                      All Months
                    </button>
                    {fyMonths(selFY).map(ym => {
                      const hasData = activeMonths.includes(ym);
                      const count   = baseRows.filter(r=>getYM(rowDate(r))===ym).length;
                      return (
                        <button key={ym} onClick={()=>hasData&&setSelBillMonth(ym)}
                          disabled={!hasData}
                          style={{ padding:'3px 10px', fontSize:11, fontWeight:selBillMonth===ym?700:400,
                            background: selBillMonth===ym?'#7C3AED': hasData?'#fff':'#F3F4F6',
                            color: selBillMonth===ym?'#fff': hasData?'#374151':'#9CA3AF',
                            border:`1px solid ${selBillMonth===ym?'#7C3AED': hasData?BD:'#E5E7EB'}`,
                            borderRadius:5, cursor:hasData?'pointer':'default', fontFamily:F, opacity:hasData?1:0.5 }}>
                          {ymLabel(ym)}
                          {hasData && <span style={{ marginLeft:4, fontSize:9, opacity:0.7 }}>({count})</span>}
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* ── Row 3: Status + Search + View + Export ── */}
                <div style={{ background:'#fff', border:`1px solid ${BD}`, borderTop:`1px solid ${BD}`,
                  borderRadius: selFY ? '0 0 8px 8px':'8px', padding:'8px 14px',
                  marginBottom:10, display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
                  <div style={{ display:'flex', gap:4 }}>
                    {[
                      { key:'all',     label:'All',        count: recon.matched.length+recon.erpOnly.length+recon.gstOnly.length },
                      { key:'matched', label:'✅ Matched',  count: recon.matched.length },
                      { key:'erponly', label:'⚠️ ERP Only', count: recon.erpOnly.length },
                      { key:'gstonly', label:'🔴 GST Only', count: recon.gstOnly.length },
                    ].map(f => (
                      <button key={f.key} onClick={() => setFilter(f.key)}
                        style={{ padding:'3px 10px', fontSize:11, fontWeight:filter===f.key?700:500,
                          background:filter===f.key?P:'#F9FAFB', color:filter===f.key?'#fff':'#374151',
                          border:`1px solid ${filter===f.key?P:BD}`, borderRadius:5, cursor:'pointer', fontFamily:F }}>
                        {f.label} <span style={{ fontSize:10, opacity:0.8 }}>({f.count})</span>
                      </button>
                    ))}
                  </div>
                  <div style={{ width:1, height:22, background:BD }}/>
                  <button onClick={()=>setViewMode(v=>v==='flat'?'vendor':'flat')}
                    style={{ height:26, padding:'0 10px', fontSize:11, fontWeight:700, cursor:'pointer',
                      background:viewMode==='vendor'?'#F0F4FF':'#F9FAFB', color:viewMode==='vendor'?P:'#374151',
                      border:`1px solid ${viewMode==='vendor'?P:BD}`, borderRadius:5, fontFamily:F }}>
                    {viewMode==='vendor' ? '🏢 Vendor' : '📋 Flat'}
                  </button>
                  <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search party, invoice, GSTIN…"
                    style={{ flex:1, minWidth:160, height:26, padding:'0 10px', border:`1px solid ${BD}`,
                      borderRadius:5, fontSize:11, fontFamily:F, outline:'none' }}/>
                  <div style={{ display:'flex', gap:6 }}>
                    <button onClick={()=>exportExcel(allRows, selBillMonth?ymLabel(selBillMonth):selFY||'All')}
                      style={{ height:26, padding:'0 12px', fontSize:11, fontWeight:700, cursor:'pointer',
                        background:'#F0FDF4', color:'#059669', border:'1px solid #A7F3D0', borderRadius:5, fontFamily:F }}>
                      📊 Excel
                    </button>
                    <button onClick={()=>printRecon(allRows, selBillMonth?ymLabel(selBillMonth):selFY||'All')}
                      style={{ height:26, padding:'0 12px', fontSize:11, fontWeight:700, cursor:'pointer',
                        background:'#EFF6FF', color:P, border:`1px solid #b3c6e8`, borderRadius:5, fontFamily:F }}>
                      🖨️ PDF
                    </button>
                  </div>
                </div>

                {/* ── Results info bar ── */}
                <div style={{ padding:'4px 2px', marginBottom:6, fontSize:11, color:'#6B7280', fontFamily:F, display:'flex', gap:16, alignItems:'center' }}>
                  <span>Showing <strong style={{color:'#1E293B'}}>{allRows.length}</strong> records
                    {selBillMonth && <span style={{marginLeft:6,color:'#7C3AED',fontWeight:700}}> · Bill Month: {ymLabel(selBillMonth)}</span>}
                    {selFY && !selBillMonth && <span style={{marginLeft:6,color:P,fontWeight:700}}> · FY {selFY}</span>}
                  </span>
                  {allRows.some(r=>{ const b=getYM(parseDate(r.gst?.dt||'')); const ret=supprdToYM(r.gst?.supprd||''); return b&&ret&&b!==ret; }) && (
                    <span style={{ fontSize:10, padding:'2px 8px', borderRadius:4, background:'#FFF7ED', color:'#b45309', border:'1px solid #FCD34D', fontWeight:700 }}>
                      ⚠️ Late filers detected — highlighted in orange
                    </span>
                  )}
                </div>

                {/* ── FLAT VIEW ── */}
                {viewMode === 'flat' && (
                <div style={{ background:'#fff', border:`1px solid ${BD}`, borderRadius:8, overflow:'auto' }}>
                  <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11, fontFamily:F }}>
                    <thead>
                      <tr style={{ background:P }}>
                        {['#','Status','Invoice No (GST)','Party Name','GSTIN',
                          'Bill Date','Return Period','Taxable (₹)','IGST (₹)','CGST (₹)','SGST (₹)','Total (₹)','IMS','Remarks'].map((h,i) => (
                          <th key={h} style={{ padding:'7px 9px', color:'#fff', fontWeight:700, fontSize:10,
                            textAlign:[7,8,9,10,11].includes(i)?'right':'left',
                            border:'1px solid #0d2d6b', whiteSpace:'nowrap' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {allRows.length === 0 ? (
                        <tr><td colSpan={13} style={{ padding:30, textAlign:'center', color:'#9CA3AF', fontStyle:'italic' }}>
                          No records match your filter
                        </td></tr>
                      ) : allRows.map((r, i) => {
                        const rowBg = r.status==='matched'
                          ? (i%2===0?'#fff':'#F0FDF4')
                          : r.status==='erponly'
                            ? (i%2===0?'#fff':'#FFFBEB')
                            : (i%2===0?'#fff':'#FEF2F2');
                        const taxable = r.erp ? parseFloat(r.erp.subTotal||0) : (r.gst?.txval||0);
                        const igst    = r.gst?.igst||0;
                        const cgst    = r.gst?.cgst||0;
                        const sgst    = r.gst?.sgst||0;
                        const total   = r.erp ? parseFloat(r.erp.grandTotal||0) : (r.gst?.val||0);
                        const remark  = r.status==='erponly' ? 'Supplier not filed'
                          : r.status==='gstonly' ? 'Not entered in ERP'
                          : !r.amtMatch ? `Amt diff ₹${fmt(r.diff)}`
                          : r.gst?.rev==='Y' ? 'RCM' : '';
                        /* late filer: invoice date month ≠ GSTR-2B return month */
                        const billYM  = getYM(parseDate(r.gst?.dt||r.erp?.billDate||''));
                        const retYM   = supprdToYM(r.gst?.supprd||'');
                        const isLate  = billYM && retYM && billYM !== retYM;
                        const trStyle = isLate
                          ? { background:'#FFFBEB', borderLeft:'3px solid #F59E0B' }
                          : { background:rowBg };
                        return (
                          <tr key={i} style={trStyle}>
                            <td style={{ padding:'5px 9px', border:`1px solid ${BD}`, color:'#9CA3AF', textAlign:'center' }}>{i+1}</td>
                            <td style={{ padding:'5px 9px', border:`1px solid ${BD}` }}><Badge type={r.status}/></td>
                            <td style={{ padding:'5px 9px', border:`1px solid ${BD}`, fontWeight:600, color:r.gst?'#059669':'#9CA3AF' }}>
                              {r.gst?.inum||'—'}
                            </td>
                            <td style={{ padding:'5px 9px', border:`1px solid ${BD}`, fontWeight:600 }}>
                              {r.erp?.partyName||r.gst?.trdnm||'—'}
                            </td>
                            <td style={{ padding:'5px 9px', border:`1px solid ${BD}`, fontSize:10, color:'#555' }}>
                              {r.erp?.partyGstin||r.gst?.gstin||'—'}
                            </td>
                            <td style={{ padding:'5px 9px', border:`1px solid ${BD}`, whiteSpace:'nowrap' }}>
                              {fmtD(r.gst?.dt||r.erp?.billDate)}
                            </td>
                            {/* Return Period — orange if late filer */}
                            <td style={{ padding:'5px 9px', border:`1px solid ${BD}`, textAlign:'center',
                              fontWeight:isLate?700:400, whiteSpace:'nowrap' }}>
                              {retYM ? (
                                <span style={{ padding:'2px 7px', borderRadius:4, fontSize:10, fontWeight:700,
                                  background:isLate?'#FEF3C7':'#EFF6FF',
                                  color:isLate?'#b45309':P,
                                  border:`1px solid ${isLate?'#FCD34D':'#b3c6e8'}` }}>
                                  {ymLabel(retYM)}{isLate?' ⚠️ Late':''}
                                </span>
                              ) : '—'}
                            </td>
                            <td style={{ padding:'5px 9px', border:`1px solid ${BD}`, textAlign:'right' }}>₹{fmt(taxable)}</td>
                            <td style={{ padding:'5px 9px', border:`1px solid ${BD}`, textAlign:'right', color:'#2563EB' }}>{igst>0?`₹${fmt(igst)}`:'—'}</td>
                            <td style={{ padding:'5px 9px', border:`1px solid ${BD}`, textAlign:'right', color:'#7C3AED' }}>{cgst>0?`₹${fmt(cgst)}`:'—'}</td>
                            <td style={{ padding:'5px 9px', border:`1px solid ${BD}`, textAlign:'right', color:'#7C3AED' }}>{sgst>0?`₹${fmt(sgst)}`:'—'}</td>
                            <td style={{ padding:'5px 9px', border:`1px solid ${BD}`, textAlign:'right', fontWeight:700, color:P }}>₹{fmt(total)}</td>
                            <td style={{ padding:'5px 9px', border:`1px solid ${BD}`, textAlign:'center' }}>
                              {r.gst ? (
                                <span style={{ padding:'1px 6px', borderRadius:4, fontSize:10, fontWeight:700,
                                  background:r.gst.imsStatus==='A'?'#ECFDF5':'#FEF3C7',
                                  color:r.gst.imsStatus==='A'?'#059669':'#92400E' }}>
                                  {r.gst.imsStatus==='A'?'Accepted':'Pending'}
                                </span>
                              ):'—'}
                            </td>
                            <td style={{ padding:'5px 9px', border:`1px solid ${BD}`, fontSize:10,
                              color:remark&&remark!=='RCM'?'#DC2626':'#7C3AED', fontWeight:remark?600:400 }}>
                              {remark||'—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    {allRows.length > 0 && (
                      <tfoot>
                        <tr style={{ background:'#e8eef8', fontWeight:800 }}>
                          <td colSpan={7} style={{ padding:'6px 9px', border:`1px solid ${BD}`, textAlign:'right' }}>
                            TOTAL ({allRows.length})
                          </td>
                          <td style={{ padding:'6px 9px', border:`1px solid ${BD}`, textAlign:'right' }}>
                            ₹{fmt(allRows.reduce((s,r)=>s+(r.erp?parseFloat(r.erp.subTotal||0):(r.gst?.txval||0)),0))}
                          </td>
                          <td style={{ padding:'6px 9px', border:`1px solid ${BD}`, textAlign:'right', color:'#2563EB' }}>
                            ₹{fmt(allRows.reduce((s,r)=>s+(r.gst?.igst||0),0))}
                          </td>
                          <td style={{ padding:'6px 9px', border:`1px solid ${BD}`, textAlign:'right', color:'#7C3AED' }}>
                            ₹{fmt(allRows.reduce((s,r)=>s+(r.gst?.cgst||0),0))}
                          </td>
                          <td style={{ padding:'6px 9px', border:`1px solid ${BD}`, textAlign:'right', color:'#7C3AED' }}>
                            ₹{fmt(allRows.reduce((s,r)=>s+(r.gst?.sgst||0),0))}
                          </td>
                          <td style={{ padding:'6px 9px', border:`1px solid ${BD}`, textAlign:'right', color:P }}>
                            ₹{fmt(allRows.reduce((s,r)=>s+(r.erp?parseFloat(r.erp.grandTotal||0):(r.gst?.val||0)),0))}
                          </td>
                          <td colSpan={2} style={{ border:`1px solid ${BD}` }}/>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
                )}

                {/* ── VENDOR VIEW ── */}
                {viewMode === 'vendor' && (
                  <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                    {vendorGroups.length === 0 ? (
                      <div style={{ background:'#fff', border:`1px solid ${BD}`, borderRadius:8, padding:30,
                        textAlign:'center', color:'#9CA3AF', fontStyle:'italic' }}>No records</div>
                    ) : vendorGroups.map((vg, vi) => (
                      <div key={vg.name} style={{ background:'#fff', border:`1px solid ${BD}`, borderRadius:8, overflow:'hidden' }}>
                        {/* vendor header */}
                        <div style={{ background:vi%2===0?'#EFF6FF':'#F5F3FF', padding:'8px 14px',
                          display:'flex', justifyContent:'space-between', alignItems:'center',
                          borderBottom:`1px solid ${BD}` }}>
                          <div>
                            <span style={{ fontWeight:800, fontSize:13, color:P }}>{vg.name}</span>
                            <span style={{ marginLeft:10, fontSize:10, color:'#6B7280' }}>{vg.gstin}</span>
                          </div>
                          <div style={{ display:'flex', gap:12, alignItems:'center', fontSize:11 }}>
                            {vg.matched>0  && <span style={{color:'#059669',fontWeight:700}}>✅ {vg.matched}</span>}
                            {vg.erpOnly>0  && <span style={{color:'#D97706',fontWeight:700}}>⚠️ {vg.erpOnly}</span>}
                            {vg.gstOnly>0  && <span style={{color:'#DC2626',fontWeight:700}}>🔴 {vg.gstOnly}</span>}
                            <span style={{ fontWeight:800, color:P, marginLeft:8 }}>
                              GST: ₹{fmt(vg.totalGST)}
                            </span>
                          </div>
                        </div>
                        {/* vendor invoices */}
                        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11, fontFamily:F }}>
                          <thead>
                            <tr style={{ background:'#F8FAFF' }}>
                              {['#','Status','Invoice No (GST)','Date','Taxable (₹)','IGST (₹)','CGST (₹)','SGST (₹)','Total (₹)','IMS','Remarks'].map((h,i) => (
                                <th key={h} style={{ padding:'5px 9px', fontSize:10, fontWeight:700, color:'#374151',
                                  textAlign:[4,5,6,7,8].includes(i)?'right':'left',
                                  border:`1px solid ${BD}`, whiteSpace:'nowrap' }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {vg.rows.map((r,i) => {
                              const taxable = r.erp ? parseFloat(r.erp.subTotal||0) : (r.gst?.txval||0);
                              const total   = r.erp ? parseFloat(r.erp.grandTotal||0) : (r.gst?.val||0);
                              const remark  = r.status==='erponly'?'Supplier not filed'
                                :r.status==='gstonly'?'Not in ERP'
                                :!r.amtMatch?`Diff ₹${fmt(r.diff)}`
                                :r.gst?.rev==='Y'?'RCM':'';
                              const rowBg = r.status==='matched'?'#fff':r.status==='erponly'?'#FFFBEB':'#FEF2F2';
                              return (
                                <tr key={i} style={{ background:i%2===0?rowBg:'#fafbff' }}>
                                  <td style={{ padding:'4px 9px', border:`1px solid ${BD}`, color:'#9CA3AF', textAlign:'center' }}>{i+1}</td>
                                  <td style={{ padding:'4px 9px', border:`1px solid ${BD}` }}><Badge type={r.status}/></td>
                                  <td style={{ padding:'4px 9px', border:`1px solid ${BD}`, fontWeight:600,
                                    color:r.gst?'#059669':'#9CA3AF' }}>{r.gst?.inum||'—'}</td>
                                  <td style={{ padding:'4px 9px', border:`1px solid ${BD}`, whiteSpace:'nowrap' }}>
                                    {fmtD(r.erp?.billDate||r.gst?.dt)}</td>
                                  <td style={{ padding:'4px 9px', border:`1px solid ${BD}`, textAlign:'right' }}>₹{fmt(taxable)}</td>
                                  <td style={{ padding:'4px 9px', border:`1px solid ${BD}`, textAlign:'right', color:'#2563EB' }}>
                                    {(r.gst?.igst||0)>0?`₹${fmt(r.gst.igst)}`:'—'}</td>
                                  <td style={{ padding:'4px 9px', border:`1px solid ${BD}`, textAlign:'right', color:'#7C3AED' }}>
                                    {(r.gst?.cgst||0)>0?`₹${fmt(r.gst.cgst)}`:'—'}</td>
                                  <td style={{ padding:'4px 9px', border:`1px solid ${BD}`, textAlign:'right', color:'#7C3AED' }}>
                                    {(r.gst?.sgst||0)>0?`₹${fmt(r.gst.sgst)}`:'—'}</td>
                                  <td style={{ padding:'4px 9px', border:`1px solid ${BD}`, textAlign:'right', fontWeight:700, color:P }}>₹{fmt(total)}</td>
                                  <td style={{ padding:'4px 9px', border:`1px solid ${BD}`, textAlign:'center' }}>
                                    {r.gst ? (
                                      <span style={{ padding:'1px 6px', borderRadius:4, fontSize:10, fontWeight:700,
                                        background:r.gst.imsStatus==='A'?'#ECFDF5':'#FEF3C7',
                                        color:r.gst.imsStatus==='A'?'#059669':'#92400E' }}>
                                        {r.gst.imsStatus==='A'?'Accepted':'Pending'}
                                      </span>
                                    ):'—'}
                                  </td>
                                  <td style={{ padding:'4px 9px', border:`1px solid ${BD}`, fontSize:10,
                                    color:remark&&remark!=='RCM'?'#DC2626':'#7C3AED', fontWeight:remark?600:400 }}>
                                    {remark||'—'}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        ) : (

          /* ═════════════ SALES TAB ═════════════ */
          <div style={{ padding:'14px 16px' }}>
            {/* KPIs */}
            <div style={{ display:'flex', gap:10, marginBottom:14, flexWrap:'wrap' }}>
              <KPI label="Total Invoices"    value={salBills.length}        color={P}        bg='#EFF6FF'/>
              <KPI label="Total Taxable (₹)" value={'₹'+fmt(salBills.reduce((s,b)=>s+(parseFloat(b.subTotal)||0),0))} color='#374151' bg='#F9FAFB'/>
              <KPI label="Total GST (₹)"     value={'₹'+fmt(salBills.reduce((s,b)=>s+(parseFloat(b.totalGST)||0),0))} color='#7C3AED' bg='#F5F3FF'/>
              <KPI label="Grand Total (₹)"   value={'₹'+fmt(salBills.reduce((s,b)=>s+(parseFloat(b.grandTotal)||0),0))} color='#059669' bg='#ECFDF5'/>
              <KPI label="CGST+SGST Bills"   value={salBills.filter(b=>b.gstType==='intrastate').length} color='#059669' bg='#F0FDF4'/>
              <KPI label="IGST Bills"        value={salBills.filter(b=>b.gstType!=='intrastate').length} color='#2563EB' bg='#EFF6FF'/>
            </div>

            {/* Toolbar */}
            <div style={{ background:'#fff', border:`1px solid ${BD}`, borderRadius:8, padding:'10px 14px',
              marginBottom:10, display:'flex', gap:8, justifyContent:'flex-end' }}>
              <button onClick={exportSalesExcel}
                style={{ height:30, padding:'0 14px', fontSize:11, fontWeight:700, cursor:'pointer',
                  background:'#F0FDF4', color:'#059669', border:'1px solid #A7F3D0', borderRadius:5, fontFamily:F }}>
                📊 Export Excel
              </button>
              <button onClick={() => {
                const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Sales Bills GST Register</title>
<style>*{box-sizing:border-box;margin:0;padding:0;}body{font-family:Arial,sans-serif;font-size:9pt;}
.hdr{background:#133d80;color:#fff;padding:10px 16px;display:flex;justify-content:space-between;}
.hdr h1{font-size:13pt;font-weight:900;}
table{width:100%;border-collapse:collapse;font-size:8.5pt;}
th{background:#133d80;color:#fff;padding:5px 8px;text-align:left;border:1px solid #0d2d6b;font-weight:700;}
td{padding:4px 8px;border:1px solid #d1d9ed;}
tr:nth-child(even) td{background:#f5f8ff;}
.tot td{background:#e8eef8;font-weight:800;border-top:2px solid #133d80;}
@media print{@page{size:A4 landscape;margin:8mm;}}</style></head><body>
<div class="hdr"><div><h1>SALES TAX INVOICE REGISTER</h1><div style="font-size:9pt;opacity:0.8;margin-top:2px">${selectedCompany?.companyName||''} &nbsp;|&nbsp; GSTIN: ${selectedCompany?.gstin||'—'} &nbsp;|&nbsp; ${salBills.length} invoices</div></div>
<div style="font-size:8.5pt;opacity:0.9">Generated: ${new Date().toLocaleDateString('en-IN')}</div></div>
<table><thead><tr><th>#</th><th>Bill No</th><th>Date</th><th>Sales Order</th><th>Client</th><th>GSTIN</th><th>GST Type</th><th style="text-align:right">Taxable (₹)</th><th style="text-align:right">GST (₹)</th><th style="text-align:right">Total (₹)</th></tr></thead>
<tbody>${[...salBills].sort((a,b)=>new Date(b.billDate)-new Date(a.billDate)).map((b,i)=>`<tr>
  <td style="text-align:center;color:#9ca3af">${i+1}</td>
  <td style="font-weight:700;color:#133d80">${b.billNo||'Draft'}</td>
  <td style="white-space:nowrap">${fmtD(b.billDate)}</td>
  <td>${b.orderNo||'—'}</td>
  <td>${b.partyName||'—'}</td>
  <td style="font-size:8pt;color:#555">${b.partyGstin||'—'}</td>
  <td><span style="background:${b.gstType==='intrastate'?'#DCFCE7':'#EEF2FF'};padding:1px 6px;border-radius:4px;font-size:8pt;font-weight:700">${b.gstType==='intrastate'?'CGST+SGST':'IGST'}</span></td>
  <td style="text-align:right">₹${fmt(b.subTotal)}</td>
  <td style="text-align:right;color:#7c3aed">₹${fmt(b.totalGST)}</td>
  <td style="text-align:right;font-weight:700;color:#133d80">₹${fmt(b.grandTotal)}</td>
</tr>`).join('')}
<tr class="tot"><td colspan="7" style="text-align:right">TOTAL (${salBills.length} invoices)</td>
<td style="text-align:right">₹${fmt(salBills.reduce((s,b)=>s+(parseFloat(b.subTotal)||0),0))}</td>
<td style="text-align:right;color:#7c3aed">₹${fmt(salBills.reduce((s,b)=>s+(parseFloat(b.totalGST)||0),0))}</td>
<td style="text-align:right;color:#133d80">₹${fmt(salBills.reduce((s,b)=>s+(parseFloat(b.grandTotal)||0),0))}</td></tr>
</tbody></table>
<script>window.onload=()=>setTimeout(()=>window.print(),400);<\/script>
</body></html>`;
                const w=window.open('','_blank','width=1100,height=800,scrollbars=yes');
                if(!w){alert('Allow pop-ups.');return;}
                w.document.write(withPrintFont(html)); w.document.close();
              }} style={{ height:30, padding:'0 14px', fontSize:11, fontWeight:700, cursor:'pointer',
                background:'#EFF6FF', color:P, border:`1px solid #b3c6e8`, borderRadius:5, fontFamily:F }}>
                🖨️ Print PDF
              </button>
            </div>

            {/* Sales bills table */}
            <div style={{ background:'#fff', border:`1px solid ${BD}`, borderRadius:8, overflow:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11, fontFamily:F }}>
                <thead>
                  <tr style={{ background:P }}>
                    {['#','Bill No','Date','Sales Order','Client','GSTIN','GST Type','Taxable (₹)','GST (₹)','Total (₹)'].map((h,i) => (
                      <th key={h} style={{ padding:'7px 10px', color:'#fff', fontWeight:700, fontSize:10,
                        textAlign:[7,8,9].includes(i)?'right':'left', border:'1px solid #0d2d6b', whiteSpace:'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {salBills.length===0 ? (
                    <tr><td colSpan={10} style={{ padding:30, textAlign:'center', color:'#9CA3AF', fontStyle:'italic' }}>No sales bills found</td></tr>
                  ) : [...salBills].sort((a,b)=>new Date(b.billDate)-new Date(a.billDate)).map((b,i) => (
                    <tr key={b.billId} style={{ background:i%2===0?'#fff':'#F8FAFF' }}>
                      <td style={{ padding:'5px 10px', border:`1px solid ${BD}`, color:'#9CA3AF', textAlign:'center' }}>{i+1}</td>
                      <td style={{ padding:'5px 10px', border:`1px solid ${BD}`, fontWeight:700, color:P }}>
                        {b.billNo||<em style={{color:'#9CA3AF',fontWeight:400}}>Draft</em>}
                      </td>
                      <td style={{ padding:'5px 10px', border:`1px solid ${BD}`, whiteSpace:'nowrap' }}>{fmtD(b.billDate)}</td>
                      <td style={{ padding:'5px 10px', border:`1px solid ${BD}`, color:'#555' }}>{b.orderNo||'—'}</td>
                      <td style={{ padding:'5px 10px', border:`1px solid ${BD}`, fontWeight:600 }}>{b.partyName||'—'}</td>
                      <td style={{ padding:'5px 10px', border:`1px solid ${BD}`, fontSize:10, color:'#555' }}>{b.partyGstin||'—'}</td>
                      <td style={{ padding:'5px 10px', border:`1px solid ${BD}` }}>
                        <span style={{ padding:'1px 7px', borderRadius:4, fontSize:10, fontWeight:700,
                          background:b.gstType==='intrastate'?'#DCFCE7':'#EEF2FF',
                          color:b.gstType==='intrastate'?'#059669':'#4338CA' }}>
                          {b.gstType==='intrastate'?'CGST+SGST':'IGST'}
                        </span>
                      </td>
                      <td style={{ padding:'5px 10px', border:`1px solid ${BD}`, textAlign:'right' }}>₹{fmt(b.subTotal)}</td>
                      <td style={{ padding:'5px 10px', border:`1px solid ${BD}`, textAlign:'right', color:'#7C3AED' }}>₹{fmt(b.totalGST)}</td>
                      <td style={{ padding:'5px 10px', border:`1px solid ${BD}`, textAlign:'right', fontWeight:700, color:P }}>₹{fmt(b.grandTotal)}</td>
                    </tr>
                  ))}
                </tbody>
                {salBills.length > 0 && (
                  <tfoot>
                    <tr style={{ background:'#e8eef8', fontWeight:800 }}>
                      <td colSpan={7} style={{ padding:'6px 10px', border:`1px solid ${BD}`, textAlign:'right' }}>
                        TOTAL ({salBills.length} invoices)
                      </td>
                      <td style={{ padding:'6px 10px', border:`1px solid ${BD}`, textAlign:'right' }}>
                        ₹{fmt(salBills.reduce((s,b)=>s+(parseFloat(b.subTotal)||0),0))}
                      </td>
                      <td style={{ padding:'6px 10px', border:`1px solid ${BD}`, textAlign:'right', color:'#7C3AED' }}>
                        ₹{fmt(salBills.reduce((s,b)=>s+(parseFloat(b.totalGST)||0),0))}
                      </td>
                      <td style={{ padding:'6px 10px', border:`1px solid ${BD}`, textAlign:'right', color:P }}>
                        ₹{fmt(salBills.reduce((s,b)=>s+(parseFloat(b.grandTotal)||0),0))}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        )
      )}
    </div>
  );
}
