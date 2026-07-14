import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { useCompany } from '../../context/CompanyContext';
import { printDeliveryChallan } from '../../utils/printDeliveryChallan';
import AuditTrail from '../../components/AuditTrail';
import ActivityDrawer from '../../components/ActivityDrawer';

const F  = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const P  = '#3A6186';
const PD = '#2A4D6E';
const PL = '#e8eef5';

const fmt  = n => (parseFloat(n)||0).toFixed(2);
const fmtD = d => { if(!d) return '—'; const dt=new Date(d); if(isNaN(dt)) return d; return `${String(dt.getDate()).padStart(2,'0')}-${String(dt.getMonth()+1).padStart(2,'0')}-${dt.getFullYear()}`; };
const today = () => new Date().toISOString().split('T')[0];
const billFileUrl = (billId, fileName, companyId, dl=false) =>
  `/api/bills/${billId}/download/${encodeURIComponent(fileName)}?companyId=${companyId}&type=sales${dl?'&dl=1':''}`;
const isImage = n => /\.(jpg|jpeg|png|gif|bmp|webp)$/i.test(n||'');
const isPDF   = n => /\.pdf$/i.test(n||'');

/* Indian Financial Year helpers */
const getFY = (dateStr) => {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d)) return null;
  const yr = d.getFullYear();
  const fyStart = d.getMonth() >= 3 ? yr : yr - 1;
  return `${fyStart}-${String(fyStart + 1).slice(-2)}`;
};
const currentFY = (() => {
  const now = new Date();
  const fyStart = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return `${fyStart}-${String(fyStart + 1).slice(-2)}`;
})();
const sameState = (a,b) => { if(!a||!b) return false; return a.trim().toLowerCase()===b.trim().toLowerCase(); };

const inp = { width:'100%', height:32, padding:'0 9px', border:'1px solid #D1D5DB', borderRadius:6, fontSize:12, fontFamily:F, outline:'none', background:'#fff', boxSizing:'border-box' };
const lbl = { fontSize:11, fontWeight:600, color:'#374151', marginBottom:4, display:'block' };
const TH  = ({children, align='left', style={}}) => (
  <th style={{ padding:'6px 8px', background:P, color:'#fff', fontSize:10, fontWeight:700, textAlign:align, border:'1px solid #1a3a9f', whiteSpace:'nowrap', ...style }}>{children}</th>
);
const TD  = ({children, align='left', bold, color, style={}}) => (
  <td style={{ padding:'4px 8px', fontSize:11, border:'1px solid #e2e8f0', textAlign:align, fontWeight:bold?700:400, color:color||'#111827', verticalAlign:'middle', fontFamily:F, ...style }}>{children}</td>
);

/* ──────────────────────────────────────────────
   WARRANTY CERTIFICATE — clean professional design
────────────────────────────────────────────── */
async function printWarrantyCert(bill, order, company, dcList) {
  /* ── Fetch company logo ── */
  let logoB64 = null;
  if (company?.logoFileName && company?.companyId) {
    try {
      const res  = await fetch(`/api/companies/logo/${encodeURIComponent(company.logoFileName)}?companyId=${company.companyId}`);
      const blob = await res.blob();
      logoB64 = await new Promise(r => { const rd = new FileReader(); rd.onload = () => r(rd.result); rd.readAsDataURL(blob); });
    } catch {}
  }

  /* ── Company ── */
  const coName    = company?.companyName || 'Epsilon Enterprise';
  const coAddr    = [company?.address, company?.city, company?.state, company?.pincode].filter(Boolean).join(', ');
  const coPhone   = company?.phone || '';
  const coEmail   = company?.email || '';
  const coGstin   = company?.gstin || '';

  /* ── Warranty dates ── */
  const wty       = order?.warranty || {};
  const wtyYears  = parseFloat(wty.period) || 1;
  const startDt   = new Date(bill.billDate || new Date());
  const endDt     = new Date(startDt);
  endDt.setFullYear(endDt.getFullYear() + wtyYears);
  const wtyStart  = fmtD(startDt.toISOString().slice(0,10));
  const wtyEnd    = fmtD(endDt.toISOString().slice(0,10));

  /* ── Client ── */
  const clientName  = bill.partyName || order?.customerName || '—';
  const clientAddr  = [order?.address || bill.billToAddress,
    [order?.customerCity||bill.billToCity, order?.customerPincode||bill.billToPincode].filter(Boolean).join(' - '),
    order?.customerState||bill.billToState].filter(Boolean).join(', ');
  const clientGstin = bill.partyGstin || order?.customerGstin || '';
  const clientPhone = order?.mobile || '';

  /* ── Order ── */
  const orderDate  = fmtD(order?.orderDate || order?.date);
  const clientPONo = order?.customerPO || order?.orderNo || '—';
  const delivAddr  = order?.shipToAddress || order?.deliveryAddr || order?.address || '—';
  const refNo      = order?.orderId || bill.orderId || '—';

  /* ── DC ── */
  const dc = (dcList||[]).find(d => String(d.dcId) === String(bill.linkedDcId)) || null;

  /* ── Items ── */
  const billItems = (bill.items || order?.items || []).filter(it => it.description || it.itemName);

  const logoTag = logoB64
    ? `<img src="${logoB64}" style="height:60px;max-width:160px;object-fit:contain;display:block;">`
    : `<div style="font-size:26pt;font-weight:900;color:#133d80;letter-spacing:2px;">${coName}</div>`;

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>Warranty Certificate</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box;}
  body{font-family:'Times New Roman',Times,serif;font-size:10.5pt;color:#1a1a1a;background:#fff;
    -webkit-print-color-adjust:exact;print-color-adjust:exact;}
  .page{padding:8mm 12mm 6mm;}

  /* ── Header band ── */
  .header{display:flex;justify-content:space-between;align-items:center;
    border-bottom:3px solid #133d80;padding-bottom:10px;margin-bottom:14px;}
  .co-info{flex:1;}
  .co-name{font-size:18pt;font-weight:bold;color:#133d80;letter-spacing:0.5px;margin-bottom:3px;}
  .co-meta{font-size:9pt;color:#555;line-height:1.6;}
  .logo-area{text-align:right;min-width:160px;}

  /* ── Certificate title ── */
  .cert-title{text-align:center;margin:0 0 14px;}
  .cert-title h1{font-size:16pt;font-weight:bold;letter-spacing:3px;text-transform:uppercase;
    color:#133d80;border-top:1.5px solid #133d80;border-bottom:1.5px solid #133d80;
    padding:6px 0;display:inline-block;min-width:60%;}
  .cert-no{font-size:10pt;color:#666;margin-top:4px;}

  /* ── Two-column meta row ── */
  .meta-row{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:14px;}
  .meta-box{border:1px solid #D1D5DB;border-radius:6px;padding:10px 12px;background:#FAFAFA;}
  .meta-box .label{font-size:8.5pt;font-weight:bold;text-transform:uppercase;
    letter-spacing:0.6px;color:#133d80;margin-bottom:6px;border-bottom:1px solid #E5EAF2;padding-bottom:4px;}
  .meta-box .line{display:flex;gap:6px;margin-bottom:3px;font-size:10pt;}
  .meta-box .key{font-weight:bold;min-width:90px;color:#374151;}
  .meta-box .val{color:#1a1a1a;}

  /* ── Certification text ── */
  .cert-body{margin-bottom:14px;line-height:1.6;font-size:10.5pt;}
  .order-details{display:grid;grid-template-columns:auto 1fr;gap:4px 12px;
    margin:8px 0 0 24px;font-size:10.5pt;}
  .order-details .dk{font-weight:bold;text-align:right;}

  /* ── Product table ── */
  .prod-section{margin-bottom:14px;}
  .prod-header{background:#F5A623;color:#1a1a1a;font-weight:bold;font-size:11pt;
    text-align:center;padding:6px;border:1px solid #d4870a;border-bottom:none;border-radius:4px 4px 0 0;}
  table.prod{width:100%;border-collapse:collapse;border:1px solid #ccc;}
  table.prod th{background:#2a3a5a;color:#fff;padding:6px 8px;font-size:9.5pt;
    font-weight:bold;text-align:center;border:1px solid #1a2a4a;}
  table.prod td{padding:7px 8px;font-size:10pt;border:1px solid #D1D5DB;vertical-align:top;}
  table.prod tbody tr:nth-child(odd) td{background:#FAFBFF;}
  table.prod .blank td{height:24px;background:#fff;}

  /* ── Warranty details box ── */
  .wty-section{margin-bottom:14px;}
  .wty-title{font-size:11pt;font-weight:bold;color:#133d80;margin-bottom:8px;
    border-bottom:2px solid #133d80;padding-bottom:3px;}
  .wty-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:10px;}
  .wty-box{background:#EFF6FF;border:1px solid #BFDBFE;border-radius:6px;padding:8px 12px;text-align:center;}
  .wty-box .wlbl{font-size:8.5pt;font-weight:bold;text-transform:uppercase;
    letter-spacing:0.5px;color:#133d80;margin-bottom:4px;}
  .wty-box .wval{font-size:13pt;font-weight:bold;color:#104f4f;}

  /* ── Terms ── */
  .terms{font-size:9.5pt;color:#374151;line-height:1.6;margin-bottom:14px;}
  .terms p{margin-bottom:7px;}

  /* ── Signature ── */
  .sig-section{display:grid;grid-template-columns:1fr 1fr 1fr;gap:20px;margin-bottom:14px;margin-top:4px;}
  .sig-box{text-align:center;}
  .sig-line{border-top:1px solid #555;margin-top:44px;padding-top:5px;font-size:10pt;font-weight:bold;}
  .sig-sub{font-size:9pt;color:#666;margin-top:2px;}

  /* ── Footer ── */
  .footer{border-top:2px solid #133d80;border-bottom:2px solid #133d80;padding:5px 0;
    text-align:center;font-size:9pt;color:#374151;margin-top:6px;}

  @media print{
    @page{margin:7mm;size:A4 portrait;}
    .page{padding:0;}
  }
</style>
</head><body><div class="page">

<!-- ═══ HEADER ═══ -->
<div class="header">
  <div class="co-info">
    <div class="co-name">${coName}</div>
    <div class="co-meta">
      ${coAddr ? `${coAddr}<br>` : ''}
      ${coGstin ? `GSTIN: ${coGstin}` : ''}${coPhone ? `&nbsp;&nbsp;|&nbsp;&nbsp;Ph: ${coPhone}` : ''}${coEmail ? `&nbsp;&nbsp;|&nbsp;&nbsp;${coEmail}` : ''}
    </div>
  </div>
  <div class="logo-area">
    ${logoTag}
  </div>
</div>

<!-- ═══ CERTIFICATE TITLE ═══ -->
<div class="cert-title">
  <h1>Warranty Certificate</h1>
  <div class="cert-no">Date: <strong>${fmtD(bill.billDate)}</strong>&nbsp;&nbsp;&nbsp;&nbsp;Ref No.: <strong>${refNo}</strong></div>
</div>

<!-- ═══ CLIENT + ORDER META ═══ -->
<div class="meta-row">
  <div class="meta-box">
    <div class="label">To (Client Details)</div>
    <div class="line"><span class="key">Name</span><span class="val"><strong>${clientName}</strong></span></div>
    ${clientAddr ? `<div class="line"><span class="key">Address</span><span class="val">${clientAddr}</span></div>` : ''}
    ${clientGstin ? `<div class="line"><span class="key">GSTIN/UIN</span><span class="val">${clientGstin}</span></div>` : ''}
    ${clientPhone ? `<div class="line"><span class="key">Contact</span><span class="val">${clientPhone}</span></div>` : ''}
  </div>
  <div class="meta-box">
    <div class="label">Order Reference</div>
    <div class="line"><span class="key">Order Date</span><span class="val">${orderDate}</span></div>
    <div class="line"><span class="key">Client PO No.</span><span class="val"><strong>${clientPONo}</strong></span></div>
    <div class="line"><span class="key">Invoice No.</span><span class="val">${bill.billNo || '—'}</span></div>
    ${dc ? `<div class="line"><span class="key">Challan No.</span><span class="val">${dc.dcNo}</span></div>` : ''}
    <div class="line"><span class="key">Delivery Addr.</span><span class="val">${delivAddr}</span></div>
  </div>
</div>

<!-- ═══ CERTIFICATION TEXT ═══ -->
<div class="cert-body">
  This is to certify that the following items have been supplied to <strong>${clientName}</strong>
  and are covered under our warranty as detailed below:
</div>

<!-- ═══ PRODUCT TABLE ═══ -->
<div class="prod-section">
  <div class="prod-header">Product Description</div>
  <table class="prod">
    <thead>
      <tr>
        <th style="width:5%;">Sr No.</th>
        <th style="text-align:left;width:32%;">Product</th>
        <th style="width:7%;">Qty</th>
        <th style="width:12%;">Invoice Date</th>
        <th style="width:18%;">Delivery Challan No.</th>
        <th style="width:12%;">Delivered Date</th>
        <th style="text-align:left;width:14%;">Remarks</th>
      </tr>
    </thead>
    <tbody>
      ${billItems.length === 0
        ? `<tr><td colspan="7" style="text-align:center;color:#888;font-style:italic;padding:16px;">No items</td></tr>`
        : billItems.map((it, i) => `
      <tr>
        <td style="text-align:center;">${i+1}</td>
        <td>${it.description||it.itemName||'—'}</td>
        <td style="text-align:center;">${it.qty||'—'}</td>
        <td style="text-align:center;">${fmtD(bill.billDate)}</td>
        <td style="text-align:center;">${dc?.dcNo || bill.linkedDcNo || bill.billNo || '—'}</td>
        <td style="text-align:center;">${dc ? fmtD(dc.dcDate) : '—'}</td>
        <td>${it.remarks||''}</td>
      </tr>`).join('')}
      <tr class="blank"><td colspan="7"></td></tr>
      <tr class="blank"><td colspan="7"></td></tr>
    </tbody>
  </table>
</div>

<!-- ═══ WARRANTY DETAILS ═══ -->
<div class="wty-section">
  <div class="wty-title">Warranty Terms and Conditions</div>
  <div class="wty-grid">
    <div class="wty-box">
      <div class="wlbl">Warranty Period</div>
      <div class="wval">${wtyYears} ${wtyYears === 1 ? 'Year' : 'Years'}</div>
    </div>
    <div class="wty-box">
      <div class="wlbl">Warranty Start Date</div>
      <div class="wval">${wtyStart}</div>
    </div>
    <div class="wty-box" style="background:#FEF3C7;border-color:#FDE68A;">
      <div class="wlbl" style="color:#92400E;">Warranty End Date</div>
      <div class="wval" style="color:#92400E;">${wtyEnd}</div>
    </div>
  </div>
</div>

<!-- ═══ TERMS ═══ -->
<div class="terms">
  <p>1. The warranty covers manufacturing defects in materials and workmanship under normal use and maintenance. It does not cover damage resulting from accidents, misuse, abuse, improper maintenance, or unauthorized alterations or repairs. The warranty does not extend to any third-party components or accessories that may be integrated into the cabin.</p>
  <p><strong>2. Exclusions — The warranty does not cover:</strong><br>
  &nbsp;&nbsp;a. Normal wear and tear.<br>
  &nbsp;&nbsp;b. Cosmetic issues that do not affect the cabin's functionality.<br>
  &nbsp;&nbsp;c. Damage or defects caused by natural disasters, environmental factors, or acts of nature.<br>
  &nbsp;&nbsp;d. Damage or defects caused by modifications or alterations made by parties other than the supplier or its authorized representatives.</p>
</div>

<!-- ═══ SIGNATURE ═══ -->
<div style="margin-bottom:6px;font-weight:bold;font-size:10pt;">Please Noted Record &nbsp;&nbsp; For ${coName}</div>
<div class="sig-section">
  <div class="sig-box">
    <div class="sig-line">Customer Signature</div>
    <div class="sig-sub">Name &amp; Stamp</div>
  </div>
  <div class="sig-box">
    <div class="sig-line">Service Engineer</div>
    <div class="sig-sub">Name &amp; Sign</div>
  </div>
  <div class="sig-box">
    <div class="sig-line">Authorized Signatory</div>
    <div class="sig-sub">For ${coName}</div>
  </div>
</div>

<!-- ═══ FOOTER ═══ -->
<div class="footer">
  <strong>Registered Address:</strong> ${coAddr}
  ${coPhone ? `&nbsp;&nbsp;|&nbsp;&nbsp;<strong>Mobile:</strong> ${coPhone}` : ''}
  ${coEmail ? `&nbsp;&nbsp;|&nbsp;&nbsp;<strong>Email:</strong> ${coEmail}` : ''}
</div>

<script>window.onload=()=>setTimeout(()=>window.print(),500);<\/script>
</div></body></html>`;

  const w = window.open('','_blank','width=900,height=980,scrollbars=yes');
  if(!w){alert('Allow pop-ups to print.');return;}
  w.document.write(html); w.document.close();
}

/* ──────────────────────────────────────────────
   COMPLETION CERTIFICATE
────────────────────────────────────────────── */
async function printCompletionCert(order, company) {
  /* ── Logo ── */
  let logoB64 = null;
  if (company?.logoFileName && company?.companyId) {
    try {
      const res  = await fetch(`/api/companies/logo/${encodeURIComponent(company.logoFileName)}?companyId=${company.companyId}`);
      const blob = await res.blob();
      logoB64 = await new Promise(r => { const rd = new FileReader(); rd.onload = () => r(rd.result); rd.readAsDataURL(blob); });
    } catch {}
  }

  /* ── Company details ── */
  const coName  = company?.companyName || 'Epsilon Enterprise';
  const coAddr  = company?.address || '';
  const coCity  = company?.city    || '';
  const coState = company?.state   || '';
  const coPin   = company?.pincode || '';
  const coGstin = company?.gstin   || '';
  const coPhone = company?.phone   || '';
  const coEmail = company?.email   || '';
  const coFullAddr = [coAddr, coCity, coState, coPin].filter(Boolean).join(', ');

  const logoTag = logoB64
    ? `<img src="${logoB64}" style="height:64px;max-width:180px;object-fit:contain;display:block;">`
    : '';

  /* ── Client billing address (To section) ── */
  const clientName   = order?.customerName   || order?.clientName   || '—';
  const clientAddr1  = order?.address        || order?.customerAddress || '';
  const clientCity   = order?.customerCity   || '';
  const clientPin    = order?.customerPincode|| '';
  const clientState  = order?.customerState  || '';
  const clientGstin  = order?.customerGstin  || order?.partyGstin   || '';
  const clientPhone  = order?.mobile         || '';

  /* ── Ship To / Delivery address (where installation happened) ── */
  const shipAddr  = order?.shipToAddress  || order?.deliveryAddr    || clientAddr1 || '';
  const shipCity  = order?.shipToCity     || clientCity;
  const shipPin   = order?.shipToPincode  || clientPin;
  const shipState = order?.shipToState    || clientState;
  const shipName  = order?.shipToName     || clientName;

  const delivFullAddr = [shipAddr, [shipCity, shipPin].filter(Boolean).join('-'), shipState]
    .filter(Boolean).join(', ');

  /* ── Order meta ── */
  const orderDate  = fmtD(order?.orderDate || order?.date);
  const clientPONo = order?.customerPO || order?.clientOrderNo || order?.orderNo || '—';
  const certDate   = new Date().toLocaleDateString('en-IN',{day:'2-digit',month:'2-digit',year:'numeric'});

  /* ── Item description ── */
  const items      = order?.items || [];
  const itemDesc   = items.length === 1
    ? (items[0].itemName || items[0].description || 'supplied items')
    : items.length > 0
      ? items.map(it => it.itemName||it.description||'').filter(Boolean).join(', ')
      : 'supplied items';

  /* ── Items table rows ── */
  const itemsTableRows = items.length > 0
    ? items.map((it, idx) => `
        <tr>
          <td style="padding:5px 8px;border:1px solid #bbb;text-align:center;">${idx+1}</td>
          <td style="padding:5px 8px;border:1px solid #bbb;">${it.itemName||it.description||'—'}</td>
          <td style="padding:5px 8px;border:1px solid #bbb;text-align:center;">${it.qty||'—'}</td>
          <td style="padding:5px 8px;border:1px solid #bbb;text-align:center;">${it.unit||it.uom||'Nos'}</td>
        </tr>`).join('')
    : `<tr><td colspan="4" style="padding:5px 8px;border:1px solid #bbb;text-align:center;">—</td></tr>`;

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>Completion Certificate — ${order?.orderNo||order?.orderId}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box;}
  body{font-family:'Times New Roman',Times,serif;font-size:10.5pt;color:#000;background:#e8eaf0;
    -webkit-print-color-adjust:exact;print-color-adjust:exact;}

  /* ── OUTER PAGE WRAPPER ── */
  .page{
    width:210mm;min-height:297mm;margin:8mm auto;background:#fff;
    border:3px double #133d80;
    padding:0;
    position:relative;
    display:flex;flex-direction:column;
  }
  /* inner gold/blue accent stripe */
  .page::before{
    content:'';position:absolute;inset:5px;
    border:1px solid #c8a951;pointer-events:none;
  }

  /* ── HEADER BAND ── */
  .header-band{
    background:#fff;
    padding:10px 18px 10px;
    display:flex;align-items:center;justify-content:space-between;
    border-bottom:2.5px solid #133d80;
  }
  .co-name{font-size:16pt;font-weight:bold;color:#133d80;letter-spacing:0.5px;}
  .co-meta-head{font-size:8.5pt;color:#444;line-height:1.7;margin-top:4px;}
  .logo-wrap{text-align:right;display:flex;flex-direction:column;align-items:flex-end;gap:4px;}
  .tagline{font-size:7.5pt;letter-spacing:1.5px;color:#133d80;text-align:right;font-style:italic;}

  /* ── CERT TITLE BAND ── */
  .cert-title-band{
    background:#f5f7ff;border-top:1px solid #c8a951;border-bottom:1px solid #c8a951;
    text-align:center;padding:7px 0 5px;
  }
  .cert-title{font-size:14pt;font-weight:bold;letter-spacing:3px;color:#133d80;text-transform:uppercase;}
  .cert-sub{font-size:8.5pt;color:#555;letter-spacing:1px;margin-top:2px;}

  /* ── BODY ── */
  .body{padding:8px 20px 6px;flex:1;display:flex;flex-direction:column;gap:5px;}

  .meta-row{display:flex;justify-content:space-between;font-size:9.5pt;margin-bottom:2px;}
  .meta-row span{font-weight:bold;}

  .to-block{font-size:10pt;line-height:1.55;border-left:3px solid #133d80;padding-left:8px;margin:2px 0 4px;}

  .subject{font-weight:bold;font-size:10pt;text-decoration:underline;margin:2px 0 1px;}
  .ref-line{font-size:10pt;font-weight:bold;margin-bottom:3px;}
  .salut{font-size:10pt;margin-bottom:3px;}
  .body-para{font-size:10pt;line-height:1.6;text-align:justify;}

  /* ── ITEMS TABLE ── */
  .items-table{width:100%;border-collapse:collapse;font-size:10pt;margin:4px 0;}
  .items-table th{
    background:#133d80;color:#fff;padding:5px 8px;
    border:1px solid #133d80;text-align:center;font-weight:600;
  }
  .items-table th.left{text-align:left;}
  .items-table td{padding:4px 8px;border:1px solid #b0b8cc;}
  .items-table tr:nth-child(even) td{background:#f2f5fb;}
  .items-table td.center{text-align:center;}

  /* ── INSTALLATION ADDRESS ── */
  .inst-addr{
    border:1px solid #133d80;border-radius:3px;
    padding:5px 10px;background:#f0f4ff;font-size:10pt;line-height:1.6;
    margin:2px 0;
  }
  .inst-addr-label{color:#133d80;font-weight:bold;font-size:9pt;text-transform:uppercase;
    letter-spacing:0.5px;margin-bottom:2px;}

  /* ── SIGNATURE ── */
  .sig-row{display:flex;justify-content:space-between;margin-top:8px;}
  .sig-col{width:44%;font-size:10pt;}
  .sig-line{border-top:1px solid #444;margin-top:38px;padding-top:4px;font-weight:bold;font-size:10pt;}

  /* ── FOOTER BAND ── */
  .footer-band{
    background:#f5f7ff;border-top:2px solid #133d80;
    padding:5px 18px;font-size:8pt;color:#333;text-align:center;font-weight:bold;
    line-height:1.5;
  }

  @media print{
    @page{margin:0;size:A4 portrait;}
    body{background:#fff;}
    .page{margin:0;width:100%;min-height:100vh;border:3px double #133d80;}
  }
</style>
</head>
<body>
<div class="page">

  <!-- ═══ HEADER BAND ═══ -->
  <div class="header-band">
    <div>
      <div class="co-name">${coName}</div>
      <div class="co-meta-head">
        ${coAddr ? coAddr+'<br>' : ''}
        ${[coCity,coState,coPin].filter(Boolean).join(', ')}
        ${coGstin ? '<br>GSTIN: <strong>'+coGstin+'</strong>' : ''}
        ${coPhone ? '&nbsp;&nbsp;|&nbsp;&nbsp;Ph: '+coPhone : ''}
        ${coEmail ? '&nbsp;&nbsp;|&nbsp;&nbsp;'+coEmail : ''}
      </div>
    </div>
    <div class="logo-wrap">
      ${logoTag || `<div style="font-size:20pt;font-weight:900;letter-spacing:2px;color:#133d80;">Îµ ERP</div>`}
      <div class="tagline">Savvish Prefabricated Systems</div>
    </div>
  </div>

  <!-- ═══ CERTIFICATE TITLE ═══ -->
  <div class="cert-title-band">
    <div class="cert-title">Completion Certificate</div>
    <div class="cert-sub">Supply &amp; Installation — Satisfactory Completion</div>
  </div>

  <!-- ═══ BODY ═══ -->
  <div class="body">

    <!-- Meta row -->
    <div class="meta-row">
      <div>Date: <span>${certDate}</span></div>
      <div>Ref / PO No.: <span>${clientPONo}</span>&nbsp;&nbsp;Dated: <span>${orderDate}</span></div>
    </div>

    <!-- To -->
    <div class="to-block">
      <strong>To,</strong><br>
      <strong>${clientName}</strong><br>
      ${clientAddr1 ? clientAddr1+'<br>' : ''}
      ${[clientCity,clientPin].filter(Boolean).join('-')}${clientCity||clientPin?'<br>':''}
      ${clientState ? clientState+'<br>' : ''}
      ${clientGstin ? 'GSTIN/UIN: '+clientGstin+'<br>' : ''}
      ${clientPhone || ''}
    </div>

    <!-- Subject / Ref -->
    <div class="subject">Sub: Successful Completion of ${itemDesc} — Supply &amp; Installation.</div>

    <!-- Salutation -->
    <div class="salut">Dear Sir,</div>

    <!-- Opening para -->
    <div class="body-para">
      We are pleased to inform you that the supply &amp; installation of the following items,
      as per the above reference, has been successfully completed to your full satisfaction.
    </div>

    <!-- ITEMS TABLE -->
    <table class="items-table">
      <thead>
        <tr>
          <th style="width:5%;">S.No</th>
          <th class="left" style="width:65%;">Product / Item Description</th>
          <th style="width:15%;">Qty</th>
          <th style="width:15%;">Unit</th>
        </tr>
      </thead>
      <tbody>
        ${itemsTableRows}
      </tbody>
    </table>

    <!-- Installation address -->
    <div>
      <div class="inst-addr-label">Installation / Site Address</div>
      <div class="inst-addr">
        ${shipName !== clientName ? '<strong>'+shipName+'</strong><br>' : ''}
        ${delivFullAddr || '—'}
      </div>
    </div>

    <!-- Closing para -->
    <div class="body-para">
      The installation, commissioning, and performance testing of the above items were executed
      satisfactorily. Please treat this letter as the formal <strong>Completion Certificate</strong>
      acknowledging successful completion of the work.
    </div>

    <div class="body-para">Thank you for your confidence in our services.</div>

    <!-- Signature row -->
    <div style="margin-top:4px;font-size:10pt;">Yours faithfully,</div>
    <div class="sig-row">
      <div class="sig-col">
        <div>For: <strong>${coName}</strong></div>
        <div class="sig-line">Authorized Signatory</div>
      </div>
      <div class="sig-col" style="text-align:right;">
        <div>For: <strong>${clientName}</strong></div>
        <div class="sig-line">Authorized Signatory</div>
      </div>
    </div>

  </div><!-- /body -->

  <!-- ═══ FOOTER BAND ═══ -->
  <div class="footer-band">
    ${coFullAddr}${coPhone ? '&nbsp;&nbsp;|&nbsp;&nbsp;M: '+coPhone : ''}${coEmail ? '&nbsp;&nbsp;|&nbsp;&nbsp;'+coEmail : ''}
  </div>

</div><!-- /page -->
<script>window.onload=()=>setTimeout(()=>window.print(),500);<\/script>
</body></html>`;

  const w = window.open('','_blank','width=820,height=980,scrollbars=yes');
  if(!w){alert('Allow pop-ups to print.');return;}
  w.document.write(html); w.document.close();
}

/* ──────────────────────────────────────────────
   PRINT REPORT
────────────────────────────────────────────── */
const printReport = (title, subtitle, cols, rows, totalRow) => {
  const today2 = new Date().toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'});
  const rHtml = rows.map(r=>`<tr>${r.map(c=>`<td>${c??'—'}</td>`).join('')}</tr>`).join('');
  const tHtml = totalRow?`<tr class="tot">${totalRow.map(c=>`<td>${c??''}</td>`).join('')}</tr>`:'';
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title>
<style>*{margin:0;padding:0;box-sizing:border-box;}body{font-family:'Times New Roman',Times,serif;font-size:10.5pt;color:#000;background:#fff;}
.pg{padding:10mm 14mm;}h1{font-size:17pt;font-weight:bold;text-align:center;margin-bottom:3px;}
.sub{font-size:10pt;text-align:center;color:#555;margin-bottom:10px;border-bottom:1px solid #aaa;padding-bottom:5px;}
table{width:100%;border-collapse:collapse;margin-top:6px;}
th{background:#1a2a3a;color:#fff;padding:5px 8px;font-size:9.5pt;font-weight:bold;text-align:left;border:1px solid #444;white-space:nowrap;}
td{padding:4px 8px;font-size:9.5pt;border:1px solid #ccc;vertical-align:top;}
tr:nth-child(even) td{background:#f7f7f7;}.tot td{font-weight:bold;background:#ddd;border-top:2px solid #555;}
.foot{margin-top:8px;font-size:8.5pt;color:#666;text-align:right;}
@media print{@page{margin:10mm;size:A4 landscape;}.pg{padding:0;}}</style>
</head><body><div class="pg">
<h1>${title}</h1>
<div class="sub">${subtitle} &nbsp;·&nbsp; ${rows.length} records &nbsp;·&nbsp; Generated: ${today2}</div>
<table><thead><tr>${cols.map(c=>`<th>${c}</th>`).join('')}</tr></thead>
<tbody>${rHtml}${tHtml}</tbody></table>
<div class="foot">Printed: ${today2}</div>
</div><script>window.onload=()=>setTimeout(()=>window.print(),400);<\/script></body></html>`;
  const w=window.open('','_blank','width=1100,height=750,scrollbars=yes');
  if(!w){alert('Allow pop-ups to print.');return;}
  w.document.write(html); w.document.close();
};

/* ══════════════════════════════════════════════
   MAIN COMPONENT
══════════════════════════════════════════════ */
export default function SalesBill() {
  const { selectedCompany } = useCompany();
  const cid          = selectedCompany?.companyId;
  const companyState = selectedCompany?.state || '';

  const [salesOrders, setSalesOrders] = useState([]);
  const [bills,       setBills]       = useState([]);
  const [pendingDCs,  setPendingDCs]  = useState([]);
  const [clientDues,  setClientDues]  = useState([]);
  const [searchParams, setSearchParams] = useSearchParams();
  const listTab = searchParams.get('tab') || 'dashboard';
  const setListTab = (tab) => setSearchParams({ tab }, { replace: true });
  const [view,        setView]        = useState('list');      // 'list'|'create'|'issue-dc'
  const [sbSearch,    setSbSearch]    = useState('');
  const [billStatusFilter, setBillStatusFilter] = useState('all'); // 'all'|'fully'|'partial'|'none'
  const [fyFilter,    setFyFilter]    = useState('all');

  /* DC creation */
  const [dcSO,       setDcSO]       = useState('');
  const [dcSOData,   setDcSOData]   = useState(null);
  const [dcDate,     setDcDate]     = useState('');
  const [dcDispatch, setDcDispatch] = useState('');
  const [dcVehicle,  setDcVehicle]  = useState('');
  const [dcInvNo,    setDcInvNo]    = useState('');
  const [dcInvDate,  setDcInvDate]  = useState('');
  const [dcSaving,   setDcSaving]   = useState(false);
  const [dcMsg,      setDcMsg]      = useState('');

  /* Bill create */
  const [selOrder,    setSelOrder]    = useState('');
  const [selDC,       setSelDC]       = useState('');
  const [order,       setOrder]       = useState(null);
  const [billNo,      setBillNo]      = useState('');
  const [billDate,    setBillDate]    = useState(today());
  const [ewayBillNo,  setEwayBillNo]  = useState('');
  const [irnNo,       setIrnNo]       = useState('');
  const [acknNo,      setAcknNo]      = useState('');
  const [acknDate,    setAcknDate]    = useState('');
  const [billFile,    setBillFile]    = useState(null);
  const [editBill,    setEditBill]    = useState(null); // bill being edited (null = new)
  /* billQtys: { [itemIdx]: qty } — actual qty to bill in current invoice */
  const [billQtys,    setBillQtys]    = useState({});
  /* billCharges: editable additional charges (P&F, freight, custom) */
  const [billCharges, setBillCharges] = useState([]); // [{description,amount,gstPct}]
  const [loading,     setLoading]     = useState(false);
  const [saving,      setSaving]      = useState(false);
  const [msg,         setMsg]         = useState('');
  /* bill detail view */
  const [viewBill,    setViewBill]    = useState(null);
  const [selBill,     setSelBill]     = useState(null);
  const [selRow,      setSelRow]      = useState(null);
  const [activityRec, setActivityRec] = useState(null);
  /* order bills modal */
  const [viewOrderBills, setViewOrderBills] = useState(null);
  /* PDF / image inline viewer */
  const [pdfViewer,   setPdfViewer]   = useState(null); // { url, name }
  /* PDF auto-fill */
  const [pdfConfirm,  setPdfConfirm]  = useState(null); // extracted fields pending confirmation
  const [pdfParsing,  setPdfParsing]  = useState(false);

  const handleParsePdf = async (file) => {
    if (!file || !isPDF(file.name)) return;
    setPdfParsing(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await axios.post('/api/bills/parse-pdf', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      const d = res.data;
      if (!d.billNo && !d.irnNo && !d.ewayBillNo && !d.acknNo) {
        setMsg('Could not extract invoice fields from this PDF. Please fill manually.');
      } else {
        setPdfConfirm(d);
      }
    } catch (e) {
      setMsg('PDF parse error: ' + (e.response?.data?.error || e.message));
    } finally {
      setPdfParsing(false);
    }
  };

  const load = useCallback(async () => {
    if (!cid) return;
    setLoading(true);
    try {
      const [soR, bR, dcR, duesR] = await Promise.all([
        axios.get(`/api/sales-orders?companyId=${cid}`),
        axios.get(`/api/bills?companyId=${cid}&type=sales`).catch(()=>({data:[]})),
        axios.get(`/api/delivery-challans?companyId=${cid}`).catch(()=>({data:[]})),
        axios.get(`/api/accounts/dues?companyId=${cid}`).catch(()=>({data:{}})),
      ]);
      setSalesOrders((soR.data||[]).filter(o => !o.tallyImported && !['draft','rejected'].includes(o.status)));
      setBills(bR.data||[]);
      setPendingDCs(dcR.data||[]);
      const { clientDues: cd = [] } = duesR.data || {};
      setClientDues(Array.isArray(cd) ? cd : []);
    } catch {}
    setLoading(false);
  }, [cid]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (view==='create') {
      const yr = new Date().getFullYear();
      const next = bills.length + 1;
      setBillNo(`INV/${yr}-${String(yr+1).slice(2)}/${String(next).padStart(3,'0')}`);
      setEwayBillNo(''); setIrnNo(''); setAcknNo(''); setAcknDate('');
    }
  }, [view, bills.length]);

  useEffect(() => {
    if (!selOrder) { setOrder(null); setBillQtys({}); return; }
    axios.get(`/api/sales-orders/${selOrder}?companyId=${cid}`)
      .then(r => setOrder(r.data))
      .catch(() => { setOrder(salesOrders.find(o=>String(o.orderId)===String(selOrder))||null); });
  }, [selOrder, cid]);

  /* When order or bills change: compute already-billed qty per item and init billQtys */
  useEffect(() => {
    if (!order) { setBillQtys({}); return; }
    const soItems = order.items || [];
    const soBills = bills.filter(b => String(b.orderId) === String(selOrder));

    /* For each SO item, sum qty across all previous bills (match by itemCode or description) */
    const prevBilled = soItems.map((soItem, idx) => {
      const code = soItem.itemCode || soItem.code || '';
      const desc = (soItem.itemName || soItem.description || '').toLowerCase().trim();
      let total = 0;
      soBills.forEach(bill => {
        (bill.items || []).forEach(li => {
          const liCode = li.itemCode || li.code || '';
          const liDesc = (li.description || '').toLowerCase().trim();
          const matchCode = code && liCode && code === liCode;
          const matchDesc = desc && liDesc && liDesc === desc;
          if (matchCode || matchDesc) total += parseFloat(li.qty) || 0;
        });
      });
      return total;
    });

    /* Default current bill qty = remaining due qty (Order - PrevBilled) */
    const qtys = {};
    soItems.forEach((it, idx) => {
      const ordered = parseFloat(it.qty) || 0;
      const due = Math.max(0, ordered - prevBilled[idx]);
      qtys[idx] = due; // pre-fill with full due qty
    });
    setBillQtys(qtys);
  }, [order, bills, selOrder]);

  /* Init editable charges from the SO when order loads (skip if editing existing bill) */
  useEffect(() => {
    if (!order || editBill) return;
    const charges = [];
    const pnf = parseFloat(order.packingCharges) || 0;
    const frt = parseFloat(order.freightCharges) || 0;
    if (pnf > 0) charges.push({ description:'Packing & Forwarding', amount:String(pnf), gstPct:'0' });
    if (frt > 0) charges.push({ description:'Freight / Transport',   amount:String(frt), gstPct:'0' });
    (order.charges || []).forEach(ch => {
      const amt = parseFloat(ch.amount) || 0;
      if (amt > 0) charges.push({
        description: ch.chargeType || ch.description || 'Additional Charge',
        amount: String(amt), gstPct: String(parseFloat(ch.gst) || 0),
      });
    });
    setBillCharges(charges);
  }, [order, editBill]);

  useEffect(() => {
    if (!dcSO) { setDcSOData(null); return; }
    axios.get(`/api/sales-orders/${dcSO}?companyId=${cid}`)
      .then(r => setDcSOData(r.data))
      .catch(() => setDcSOData(salesOrders.find(o=>String(o.orderId)===String(dcSO))||null));
  }, [dcSO, cid, salesOrders]);

  const openIssueDC = (soId='') => {
    setDcSO(soId?String(soId):'');
    setDcDate(new Date().toISOString().slice(0,10));
    setDcDispatch(''); setDcVehicle(''); setDcInvNo(''); setDcInvDate(''); setDcMsg('');
    setView('issue-dc');
  };

  const handleIssueDC = async () => {
    if (!dcSO) { setDcMsg('Please select a Sales Order'); return; }
    setDcSaving(true); setDcMsg('');
    const so = dcSOData;
    try {
      const payload = {
        companyId:cid, dcDate:dcDate||today(), dispatchThrough:dcDispatch, vehicleNo:dcVehicle,
        invoiceNo:dcInvNo, invoiceDate:dcInvDate,
        linkedSalesOrderId:so?.orderId,
        clientId:so?.clientCode||so?.customerId||'', clientName:so?.customerName||so?.clientName||'',
        clientGstin:so?.customerGstin||so?.partyGstin||'',
        erpNo:String(so?.orderId||''), orderNo:so?.orderNo||'',
        orderDate:so?.orderDate||'', orderType:so?.orderType||'',
        clientPoDate:so?.clientPoDate||so?.poDate||'', clientOrderNo:so?.clientOrderNo||so?.customerPO||'',
        deliveryDueDate:so?.deliveryDate||'', paymentTerms:so?.paymentTerms||'',
        billingName:so?.contactPerson||'', billingMobile:so?.mobile||'', billingEmail:so?.email||'',
        billingAddress:so?.address||'', billingCity:so?.customerCity||'', billingState:so?.customerState||'', billingPincode:so?.customerPincode||'',
        shippingName:so?.shipToName||so?.contactPerson||'', shippingMobile:so?.shipToMobile||so?.mobile||'',
        shippingAddress:so?.shipToAddress||so?.deliveryAddr||'', shippingCity:so?.shipToCity||'',
        shippingState:so?.shipToState||so?.customerState||'', shippingPincode:so?.shipToPincode||'',
        items:so?.items||[], addons:so?.addons||[], charges:so?.charges||[],
        subTotal:so?.subTotal||0, totalGST:so?.totalGST||0, grandTotal:so?.grandTotal||0,
      };
      const r = await axios.post('/api/delivery-challans', payload);
      setDcMsg(`✅ ${r.data.dcNo} issued!`);
      await load();
      setTimeout(()=>{ setView('list'); setListTab('pending-dc'); setDcMsg(''); }, 1400);
    } catch(e) { setDcMsg('Error: '+(e.response?.data?.error||e.message)); }
    setDcSaving(false);
  };

  /* ── Per-item billing summary (for UI display) ── */
  const itemBillingInfo = (() => {
    if (!order) return [];
    const soItems = order.items || [];
    const soBills = bills.filter(b => String(b.orderId) === String(selOrder));
    return soItems.map((it, idx) => {
      const code = it.itemCode || it.code || '';
      const desc = (it.itemName || it.description || '').toLowerCase().trim();
      let prevBilled = 0;
      soBills.forEach(bill => {
        (bill.items || []).forEach(li => {
          const liCode = li.itemCode || li.code || '';
          const liDesc = (li.description || '').toLowerCase().trim();
          if ((code && liCode && code === liCode) || (desc && liDesc && liDesc === desc))
            prevBilled += parseFloat(li.qty) || 0;
        });
      });
      const ordered  = parseFloat(it.qty) || 0;
      const dueQty   = Math.max(0, ordered - prevBilled);
      const currentQ = Math.min(Math.max(parseFloat(billQtys[idx]) || 0, 0), dueQty);
      return { idx, it, ordered, prevBilled, dueQty, currentQ, fullyBilled: dueQty <= 0 };
    });
  })();

  /* ── Calculate line items using actual bill qtys ── */
  const calcLines = () => {
    if (!order) return { lines:[],subTotal:0,totalCGST:0,totalSGST:0,totalIGST:0,totalGST:0,grandTotal:0,intrastate:false };
    const partyState = order.customerState||order.shipToState||'';
    const intrastate = sameState(companyState, partyState);

    const lines = itemBillingInfo
      .filter(info => info.currentQ > 0)   // skip items with 0 billing qty
      .map(info => {
        const { it, idx, currentQ } = info;
        const rate   = parseFloat(it.rate) || 0;
        const gstPct = parseFloat(it.gst||it.gstPercent||it.taxRate) || 0;
        const taxable = currentQ * rate;
        const gstAmt  = taxable * gstPct / 100;
        const cgst = intrastate ? gstAmt/2 : 0;
        const sgst = intrastate ? gstAmt/2 : 0;
        const igst = intrastate ? 0 : gstAmt;
        return {
          itemCode: it.itemCode||it.code||'', itemIdx: idx,
          description: it.description||it.itemName||it.name||'—',
          hsnCode: it.hsnCode||it.hsn||'', unit: it.unit||it.uom||'NOS',
          qty: currentQ, rate, taxable, gstPct, gstAmt, cgst, sgst, igst, total: taxable+gstAmt,
        };
      });

    billCharges.forEach(ch => {
      const amt = parseFloat(ch.amount) || 0;
      if (amt <= 0) return;
      const gst = parseFloat(ch.gstPct) || 0, gstA = amt * gst / 100;
      lines.push({ description:ch.description||'Additional Charge', hsnCode:'', unit:'LOT', qty:1, rate:amt, taxable:amt,
        gstPct:gst, gstAmt:gstA, cgst:intrastate?gstA/2:0, sgst:intrastate?gstA/2:0, igst:intrastate?0:gstA, total:amt+gstA });
    });

    const subTotal=lines.reduce((s,l)=>s+l.taxable,0);
    const totalCGST=lines.reduce((s,l)=>s+l.cgst,0), totalSGST=lines.reduce((s,l)=>s+l.sgst,0), totalIGST=lines.reduce((s,l)=>s+l.igst,0);
    const totalGST=totalCGST+totalSGST+totalIGST;
    return { lines, subTotal, totalCGST, totalSGST, totalIGST, totalGST, grandTotal:subTotal+totalGST, intrastate };
  };

  const { lines, subTotal, totalCGST, totalSGST, totalIGST, totalGST, grandTotal, intrastate } = calcLines();

  const handleSave = async () => {
    if (!selOrder) { setMsg('Select a Sales Order'); return; }
    setSaving(true); setMsg('');
    try {
      const partyState = order?.customerState||order?.shipToState||'';
      const payload = {
        type:'sales', billNo:billNo.trim()||'', billDate,
        orderId:selOrder, orderNo:order?.orderNo||`SO-${selOrder}`,
        partyName:order?.customerName||order?.clientName||'—',
        partyGstin:order?.customerGstin||order?.partyGstin||'',
        partyState, companyState, gstType:intrastate?'intrastate':'interstate',
        items:lines, subTotal,
        totalCGST:intrastate?totalCGST:0, totalSGST:intrastate?totalSGST:0,
        totalIGST:intrastate?0:totalIGST, totalGST, grandTotal,
        linkedDcId:selDC||undefined, companyId:cid,
        /* new invoice details */
        ewayBillNo:ewayBillNo||'', irnNo:irnNo||'', acknNo:acknNo||'', acknDate:acknDate||'',
        /* bill to / ship to */
        billToName:order?.contactPerson||'', billToAddress:order?.address||order?.customerAddress||'',
        billToCity:order?.customerCity||'', billToState:order?.customerState||'', billToPincode:order?.customerPincode||'',
        shipToName:order?.shipToName||order?.contactPerson||'',
        shipToAddress:order?.shipToAddress||order?.deliveryAddr||'',
        shipToCity:order?.shipToCity||'', shipToState:order?.shipToState||order?.customerState||'', shipToPincode:order?.shipToPincode||'',
      };
      let savedBill;
      if (editBill) {
        // UPDATE existing bill
        savedBill = await axios.put(`/api/bills/${editBill.billId}?companyId=${cid}&type=sales`, payload);
      } else {
        // CREATE new bill
        savedBill = await axios.post(`/api/bills?companyId=${cid}`, payload);
        if (selDC) {
          await axios.put(`/api/delivery-challans/${selDC}/link-invoice`,{companyId:cid,invoiceId:savedBill.data?.billId||billNo,invoiceNo:billNo}).catch(()=>{});
        }
      }
      /* upload attachment if provided */
      const billId = editBill?.billId || savedBill.data?.billId;
      if (billFile && billId) {
        const fd = new FormData();
        fd.append('file', billFile);
        await axios.post(`/api/bills/${billId}/upload?companyId=${cid}&type=sales`, fd, { headers:{'Content-Type':'multipart/form-data'} }).catch(()=>{});
      }
      setMsg(editBill ? '✅ Bill updated!' : '✅ Bill saved! You can add another bill below.');
      await load();
      if (editBill) {
        // after edit → go back to list
        setTimeout(()=>{ setView('list'); setListTab('bills'); setMsg(''); setSelOrder(''); setOrder(null); setSelDC(''); setBillFile(null); setEditBill(null); }, 1400);
      } else {
        // after new bill → stay on page, reset only form fields so user can add another
        resetBillFields();
      }
    } catch(e) { setMsg('Error: '+(e.response?.data?.error||e.message)); }
    setSaving(false);
  };

  /* reset only the per-bill fields, keep order selected */
  const resetBillFields = () => {
    setBillNo(''); setBillDate(today()); setEwayBillNo(''); setIrnNo('');
    setAcknNo(''); setAcknDate(''); setBillFile(null); setSelDC(''); setBillQtys({});
    setTimeout(()=>setMsg(''),3000);
  };

  /* ── Open a bill in edit mode ── */
  const openEditBill = (b) => {
    setEditBill(b);
    setSelOrder(String(b.orderId || ''));
    setBillNo(b.billNo || '');
    setBillDate(b.billDate || today());
    setEwayBillNo(b.ewayBillNo || '');
    setIrnNo(b.irnNo || '');
    setAcknNo(b.acknNo || '');
    setAcknDate(b.acknDate || '');
    setBillFile(null);
    setSelDC(b.linkedDcId ? String(b.linkedDcId) : '');
    /* Load editable charges from saved bill items (those without itemIdx are charges) */
    const chargeItems = (b.items || [])
      .filter(it => it.itemIdx === undefined || it.itemIdx === null)
      .map(it => ({
        description: it.description || '',
        amount: String(it.rate || it.taxable || 0),
        gstPct: String(it.gstPct || 0),
      }));
    setBillCharges(chargeItems);
    setViewBill(null);
    setView('create');
  };

  const handleDelete = async (billId) => {
    if (!window.confirm(`Delete bill ${billId}?`)) return;
    await axios.delete(`/api/bills/${billId}?companyId=${cid}&type=sales`).catch(()=>{});
    load();
  };

  const handleDeleteDC = async (dc) => {
    if (!window.confirm(`Delete Delivery Challan ${dc.dcNo}?`)) return;
    await axios.delete(`/api/delivery-challans/${dc.dcId}?companyId=${cid}`).catch(()=>{});
    load();
  };

  /* ── Compute dashboard rows ── */
  const dashboardRows = (() => {
    const soMap = {};
    salesOrders.forEach(o => { soMap[String(o.orderId)] = o; });

    // group bills by orderId
    const billsByOrder = {};
    bills.forEach(b => {
      const key = String(b.orderId);
      if (!billsByOrder[key]) billsByOrder[key] = [];
      billsByOrder[key].push(b);
    });

    // group DCs by orderId
    const dcsByOrder = {};
    pendingDCs.forEach(d => {
      const key = String(d.linkedSalesOrderId||'');
      if (!key) return;
      if (!dcsByOrder[key]) dcsByOrder[key] = [];
      dcsByOrder[key].push(d);
    });

    // dues by orderId
    const duesByOrder = {};
    clientDues.forEach(d => {
      duesByOrder[String(d.orderId)] = parseFloat(d.due)||0;
    });

    // combine: all SOs that have bills OR all SOs
    const keys = new Set([...salesOrders.map(o=>String(o.orderId)), ...Object.keys(billsByOrder)]);
    return [...keys].map(key => {
      const so = soMap[key];
      const soItems = so?.items || [];
      const orderedQty = soItems.reduce((s,it)=>s+(parseFloat(it.qty)||0), 0);

      const dcList = dcsByOrder[key] || [];
      const dispatchQty = dcList.reduce((s,dc)=>{
        const dcItems = dc.items||[];
        return s + dcItems.reduce((ss,it)=>ss+(parseFloat(it.qty)||0), 0);
      }, 0);

      const billList = billsByOrder[key] || [];
      const billedQty = billList.reduce((s,b)=>{
        return s + (b.items||[])
          .filter(it => it.itemIdx !== undefined && it.itemIdx !== null)
          .reduce((ss,it)=>ss+(parseFloat(it.qty)||0), 0);
      }, 0);
      const billAmount = billList.reduce((s,b)=>s+(parseFloat(b.grandTotal)||0), 0);
      const dueAmt = duesByOrder[key] || 0;
      const orderValue = parseFloat(so?.grandTotal || 0);
      const pendingBillAmt = Math.max(0, orderValue - billAmount);

      const material = soItems.length===1
        ? (soItems[0].itemName||soItems[0].description||'—')
        : soItems.length>1 ? `${soItems[0].itemName||soItems[0].description||'—'} +${soItems.length-1} more`
        : '—';

      return {
        orderId: key, so,
        clientOrderNo: so?.customerPO || '—',
        clientName: so?.customerName || so?.clientName || '—',
        material, orderedQty, dispatchQty,
        dueQty: Math.max(0, orderedQty - dispatchQty),
        billedQty, billAmount, dueAmt, orderValue, pendingBillAmt,
        billCount: billList.length,
        billList,
      };
    }).filter(r => r.so); // only rows with valid SO
  })();

  /* ══════════ PDF CONFIRM MODAL (rendered outside view branches) ══════════ */
  const _normName = s => (s||'').toLowerCase()
    .replace(/\bprivate\b/g,'pvt').replace(/\blimited\b/g,'ltd')
    .replace(/[.\s,()&\-]/g,'');
  const _isDupe  = pdfConfirm?.billNo ? bills.some(b => b.billNo === pdfConfirm.billNo && (!editBill || b.billId !== editBill.billId)) : false;
  const _erpName = order?.customerName || order?.clientName || '';
  const _pdfName = pdfConfirm?.partyName || '';
  const _nameMatch = _pdfName && _erpName
    ? _normName(_pdfName) === _normName(_erpName)
    : null; // null = can't compare (no order selected or no name in PDF)

  const PdfConfirmModal = pdfConfirm ? (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', zIndex:10500,
      display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
      <div style={{ background:'#fff', borderRadius:12, width:'100%', maxWidth:520,
        boxShadow:'0 24px 60px rgba(0,0,0,0.3)', overflow:'hidden' }}>

        {/* Header */}
        <div style={{ background:P, padding:'12px 18px', display:'flex', alignItems:'center', gap:10 }}>
          <span style={{ fontSize:18 }}>📋</span>
          <div>
            <div style={{ fontSize:13, fontWeight:800, color:'#fff' }}>Auto-fill from PDF</div>
            <div style={{ fontSize:11, color:'rgba(255,255,255,0.75)', marginTop:1 }}>Review extracted fields, edit if needed, then confirm.</div>
          </div>
        </div>

        <div style={{ padding:'14px 18px 0' }}>

          {/* ── Duplicate Bill Warning ── */}
          {_isDupe && (
            <div style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 12px',
              background:'#FEF2F2', border:'1px solid #FECACA', borderRadius:7, marginBottom:10 }}>
              <span style={{ fontSize:16 }}>⚠️</span>
              <div>
                <div style={{ fontSize:12, fontWeight:700, color:'#DC2626' }}>Duplicate Bill</div>
                <div style={{ fontSize:11, color:'#991B1B' }}>Invoice <strong>{pdfConfirm.billNo}</strong> already exists in the system.</div>
              </div>
            </div>
          )}

          {/* ── Client Name Match ── */}
          {(_pdfName || _erpName) && (
            <div style={{ padding:'8px 12px', borderRadius:7, marginBottom:10,
              background: _nameMatch === true ? '#F0FFF4' : _nameMatch === false ? '#FEF2F2' : '#F9FAFB',
              border: `1px solid ${_nameMatch === true ? '#6EE7B7' : _nameMatch === false ? '#FECACA' : '#E5EAF2'}` }}>
              <div style={{ fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.4px',
                color: _nameMatch === true ? '#059669' : _nameMatch === false ? '#DC2626' : '#6B7280', marginBottom:6 }}>
                {_nameMatch === true ? '✅ Client Match' : _nameMatch === false ? '❌ Client Name Mismatch' : '👤 Client Name'}
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                <div>
                  <div style={{ fontSize:10, color:'#6B7280', marginBottom:2 }}>ERP (Sales Order)</div>
                  <div style={{ fontSize:12, fontWeight:600, color:'#111827' }}>{_erpName || '— no order selected —'}</div>
                </div>
                <div>
                  <div style={{ fontSize:10, color:'#6B7280', marginBottom:2 }}>PDF (Bill To)</div>
                  <div style={{ fontSize:12, fontWeight:600, color:'#111827' }}>{_pdfName || '— not found in PDF —'}</div>
                </div>
              </div>
            </div>
          )}

          {/* ── Extracted Fields ── */}
          {[
            { label:'Tax Invoice No',     key:'billNo' },
            { label:'Invoice Date',       key:'billDate',  type:'date' },
            { label:'E-way Bill No',      key:'ewayBillNo' },
            { label:'IRN No',             key:'irnNo' },
            { label:'Acknowledgement No', key:'acknNo' },
            { label:'Ack Date',           key:'acknDate',  type:'date' },
          ].map(({ label, key, type }) => (
            <div key={key} style={{ display:'grid', gridTemplateColumns:'160px 1fr', gap:8, alignItems:'center', marginBottom:8 }}>
              <label style={{ fontSize:11, fontWeight:600, color:'#374151' }}>
                {label}
                {key === 'billNo' && _isDupe && <span style={{ marginLeft:6, fontSize:10, color:'#DC2626', fontWeight:700 }}>● duplicate</span>}
              </label>
              <input type={type||'text'} value={pdfConfirm[key]||''}
                onChange={e => setPdfConfirm(p => ({ ...p, [key]: e.target.value }))}
                style={{ ...inp, height:30,
                  background: key==='billNo' && _isDupe ? '#FEF2F2' : pdfConfirm[key] ? '#F0FFF4' : '#FFF7ED',
                  border: key==='billNo' && _isDupe ? '1px solid #FECACA' : pdfConfirm[key] ? '1px solid #6EE7B7' : '1px solid #FCD34D' }} />
            </div>
          ))}
        </div>

        {/* Buttons */}
        <div style={{ padding:'10px 18px 16px', display:'flex', gap:8, justifyContent:'flex-end',
          borderTop:'1px solid #E5EAF2', marginTop:6 }}>
          <button onClick={() => setPdfConfirm(null)}
            style={{ height:32, padding:'0 16px', fontSize:12, cursor:'pointer', fontFamily:F,
              background:'#fff', color:'#374151', border:'1px solid #D1D5DB', borderRadius:6, fontWeight:600 }}>
            Cancel
          </button>
          {_isDupe && (
            <button onClick={() => setPdfConfirm(null)}
              style={{ height:32, padding:'0 16px', fontSize:12, cursor:'pointer', fontFamily:F,
                background:'#FEF2F2', color:'#DC2626', border:'1px solid #FECACA', borderRadius:6, fontWeight:700 }}>
              ✕ Discard (Duplicate)
            </button>
          )}
          <button onClick={() => {
            if (pdfConfirm.billNo)     setBillNo(pdfConfirm.billNo);
            if (pdfConfirm.billDate)   setBillDate(pdfConfirm.billDate);
            if (pdfConfirm.ewayBillNo) setEwayBillNo(pdfConfirm.ewayBillNo);
            if (pdfConfirm.irnNo)      setIrnNo(pdfConfirm.irnNo);
            if (pdfConfirm.acknNo)     setAcknNo(pdfConfirm.acknNo);
            if (pdfConfirm.acknDate)   setAcknDate(pdfConfirm.acknDate);
            setPdfConfirm(null);
          }} style={{ height:32, padding:'0 20px', fontSize:12, cursor:'pointer', fontFamily:F,
            background: _isDupe ? '#F59E0B' : P, color:'#fff', border:'none', borderRadius:6, fontWeight:700 }}>
            {_isDupe ? '⚠ Fill Anyway' : '✓ Fill Form'}
          </button>
        </div>
      </div>
    </div>
  ) : null;

  /* ═══════════════════════ LIST VIEW ═══════════════════════ */
  if (view==='list') return (
    <div style={{ fontFamily:F, fontSize:12, display:'flex', flexDirection:'column', height:'100%' }}>
      {PdfConfirmModal}

      {/* ── PDF / Image Viewer ── */}
      {pdfViewer && (
        <div onClick={()=>setPdfViewer(null)} style={{ position:'fixed',inset:0,background:'rgba(0,0,0,0.75)',zIndex:9200,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:16 }}>
          <div onClick={e=>e.stopPropagation()} style={{ background:'#1E293B',borderRadius:10,width:'100%',maxWidth:900,maxHeight:'94vh',display:'flex',flexDirection:'column',boxShadow:'0 24px 80px rgba(0,0,0,0.5)' }}>
            <div style={{ padding:'10px 16px',display:'flex',justifyContent:'space-between',alignItems:'center',borderBottom:'1px solid #334155' }}>
              <span style={{ color:'#fff',fontWeight:700,fontSize:13,fontFamily:F }}>
                {isPDF(pdfViewer.name)?'📄':'🖼ï¸'} {pdfViewer.name}
              </span>
              <div style={{ display:'flex',gap:8 }}>
                {isPDF(pdfViewer.name) && (
                  <button onClick={()=>window.open(pdfViewer.url,'_blank')}
                    style={{ padding:'5px 12px',background:'#10B981',color:'#fff',borderRadius:5,fontSize:11,fontWeight:700,border:'none',cursor:'pointer',fontFamily:F }}>
                    🔗 Open in New Tab
                  </button>
                )}
                <a href={pdfViewer.url+'&dl=1'} download style={{ padding:'5px 12px',background:'#3B82F6',color:'#fff',borderRadius:5,fontSize:11,fontWeight:700,textDecoration:'none',fontFamily:F }}>⬇ Download</a>
                <button onClick={()=>setPdfViewer(null)} style={{ background:'#DC2626',border:'none',borderRadius:5,color:'#fff',width:28,height:28,cursor:'pointer',fontSize:16 }}>✕</button>
              </div>
            </div>
            <div style={{ flex:1,overflow:'hidden',borderRadius:'0 0 10px 10px',minHeight:isPDF(pdfViewer.name)?500:300 }}>
              {isImage(pdfViewer.name) ? (
                <div style={{ display:'flex',alignItems:'center',justifyContent:'center',height:'100%',padding:16,background:'#0F172A' }}>
                  <img src={pdfViewer.url} alt={pdfViewer.name} style={{ maxWidth:'100%',maxHeight:'80vh',objectFit:'contain',borderRadius:6 }}/>
                </div>
              ) : (
                <object data={pdfViewer.url} type="application/pdf"
                  style={{ width:'100%',height:'80vh',border:'none',borderRadius:'0 0 10px 10px' }}>
                  <div style={{ display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',height:'100%',gap:16,color:'#94A3B8',background:'#0F172A' }}>
                    <span style={{ fontSize:48 }}>📄</span>
                    <span style={{ fontSize:14,fontWeight:600 }}>{pdfViewer.name}</span>
                    <span style={{ fontSize:12 }}>PDF cannot be displayed inline in this browser.</span>
                    <div style={{ display:'flex',gap:10 }}>
                      <button onClick={()=>window.open(pdfViewer.url,'_blank')}
                        style={{ padding:'8px 18px',background:'#10B981',color:'#fff',border:'none',borderRadius:6,fontSize:13,fontWeight:700,cursor:'pointer' }}>
                        🔗 Open in New Tab
                      </button>
                      <a href={pdfViewer.url+'&dl=1'} download
                        style={{ padding:'8px 18px',background:'#3B82F6',color:'#fff',borderRadius:6,fontSize:13,fontWeight:700,textDecoration:'none' }}>
                        ⬇ Download
                      </a>
                    </div>
                  </div>
                </object>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Bill Detail Modal ── */}
      {viewBill && (
        <div onClick={()=>setViewBill(null)} style={{ position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',zIndex:9000,display:'flex',alignItems:'center',justifyContent:'center',padding:16 }}>
          <div onClick={e=>e.stopPropagation()} style={{ background:'#fff',borderRadius:10,width:'100%',maxWidth:640,maxHeight:'88vh',display:'flex',flexDirection:'column',boxShadow:'0 20px 60px rgba(0,0,0,0.25)',fontFamily:F }}>
            {/* modal header */}
            <div style={{ background:P,color:'#fff',padding:'12px 18px',borderRadius:'10px 10px 0 0',display:'flex',justifyContent:'space-between',alignItems:'center' }}>
              <div>
                <div style={{ fontSize:15,fontWeight:800 }}>🧾 {viewBill.billNo||'Draft Invoice'}</div>
                <div style={{ fontSize:11,opacity:0.7,marginTop:2 }}>{viewBill.partyName} · {fmtD(viewBill.billDate)}</div>
              </div>
              <button onClick={()=>setViewBill(null)} style={{ background:'rgba(255,255,255,0.15)',border:'1px solid rgba(255,255,255,0.3)',borderRadius:6,color:'#fff',width:30,height:30,cursor:'pointer',fontSize:16 }}>✕</button>
            </div>
            {/* modal body */}
            <div style={{ flex:1,overflowY:'auto',padding:'16px 18px' }}>
              {/* Bill details grid */}
              <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:14 }}>
                {[
                  ['Invoice No',   viewBill.billNo||'—'],
                  ['Date',         fmtD(viewBill.billDate)],
                  ['Sales Order',  viewBill.orderNo||`SO-${viewBill.orderId}`],
                  ['Client',       viewBill.partyName||'—'],
                  ['GST Type',     viewBill.gstType==='intrastate'?'CGST+SGST':'IGST'],
                  ['Grand Total',  `₹${Number(viewBill.grandTotal||0).toFixed(2)}`],
                  ['E-way Bill',   viewBill.ewayBillNo||'—'],
                  ['IRN No',       viewBill.irnNo||'—'],
                  ['Ack No',       viewBill.acknNo||'—'],
                ].map(([k,v])=>(
                  <div key={k} style={{ background:'#F8FAFF',borderRadius:5,padding:'6px 10px',border:'1px solid #E5EAF2' }}>
                    <div style={{ fontSize:10,color:'#6B7280',fontWeight:500 }}>{k}</div>
                    <div style={{ fontSize:12,fontWeight:600,color:'#111',marginTop:2,wordBreak:'break-all' }}>{v}</div>
                  </div>
                ))}
              </div>
              {/* Items */}
              {(viewBill.items||[]).length>0 && (
                <div style={{ marginBottom:14 }}>
                  <div style={{ fontSize:11,fontWeight:800,color:P,marginBottom:6,paddingBottom:3,borderBottom:`1px solid #E5EAF2` }}>Line Items</div>
                  <table style={{ width:'100%',borderCollapse:'collapse',fontSize:11 }}>
                    <thead><tr style={{ background:P,color:'#fff' }}>
                      {['#','Description','Qty','Rate','GST%','Amount'].map(h=>(
                        <th key={h} style={{ padding:'4px 7px',border:'1px solid #1a3a9f',fontWeight:700,textAlign:h==='#'?'center':'left' }}>{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>
                      {(viewBill.items||[]).map((it,i)=>(
                        <tr key={i} style={{ background:i%2===0?'#fff':'#F8FAFF' }}>
                          <td style={{ padding:'4px 7px',border:'1px solid #E5EAF2',textAlign:'center' }}>{i+1}</td>
                          <td style={{ padding:'4px 7px',border:'1px solid #E5EAF2' }}>{it.description||it.itemName||'—'}</td>
                          <td style={{ padding:'4px 7px',border:'1px solid #E5EAF2',textAlign:'right' }}>{it.qty} {it.unit||''}</td>
                          <td style={{ padding:'4px 7px',border:'1px solid #E5EAF2',textAlign:'right' }}>₹{Number(it.rate||0).toFixed(2)}</td>
                          <td style={{ padding:'4px 7px',border:'1px solid #E5EAF2',textAlign:'center' }}>{it.gstPct||0}%</td>
                          <td style={{ padding:'4px 7px',border:'1px solid #E5EAF2',textAlign:'right',fontWeight:700 }}>₹{Number(it.total||0).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {/* Attachments */}
              <div>
                <div style={{ fontSize:11,fontWeight:800,color:P,marginBottom:8,paddingBottom:3,borderBottom:`1px solid #E5EAF2`,display:'flex',alignItems:'center',justifyContent:'space-between' }}>
                  <span>📎 Attachments</span>
                  <label style={{ cursor:'pointer',fontSize:10,padding:'3px 10px',background:'#EFF6FF',color:P,border:`1px solid #b3c6e8`,borderRadius:5,fontWeight:700 }}>
                    + Upload
                    <input type="file" accept=".pdf,.jpg,.jpeg,.png" style={{ display:'none' }} onChange={async e=>{
                      const f=e.target.files[0]; if(!f) return;
                      const fd=new FormData(); fd.append('file',f);
                      const res=await axios.post(`/api/bills/${viewBill.billId}/upload?companyId=${cid}&type=sales`,fd,{headers:{'Content-Type':'multipart/form-data'}}).catch(()=>null);
                      if(res?.data) { setViewBill(res.data); load(); }
                    }}/>
                  </label>
                </div>
                {(viewBill.attachments||[]).length===0
                  ? <div style={{ color:'#9CA3AF',fontSize:11,fontStyle:'italic' }}>No attachments yet.</div>
                  : <div style={{ display:'flex',flexWrap:'wrap',gap:8 }}>
                    {(viewBill.attachments||[]).map((a,i)=>{
                      const url = billFileUrl(viewBill.billId, a.fileName, cid);
                      return (
                        <div key={i} style={{ display:'flex',alignItems:'center',gap:0,borderRadius:7,overflow:'hidden',border:`1px solid ${P}30` }}>
                          <button onClick={()=>setPdfViewer({ url, name: a.name||a.fileName })}
                            style={{ display:'flex',alignItems:'center',gap:6,padding:'6px 12px',background:'#F0F4FF',border:'none',cursor:'pointer',color:'#111',fontSize:11,fontWeight:600,fontFamily:F }}>
                            {isPDF(a.fileName)?'📄':'🖼ï¸'} {a.name||a.fileName}
                          </button>
                          <a href={billFileUrl(viewBill.billId, a.fileName, cid, true)} download
                            style={{ padding:'6px 8px',background:'#E0E7FF',borderLeft:`1px solid ${P}30`,color:P,fontSize:11,fontWeight:700,textDecoration:'none' }}
                            title="Download">⬇</a>
                        </div>
                      );
                    })}
                  </div>
                }
              </div>
              {/* Audit Trail */}
              <div style={{ marginTop: 16 }}>
                <AuditTrail audit={viewBill.audit} title="Activity Log" compact />
              </div>
            </div>
            {/* modal footer */}
            <div style={{ padding:'10px 18px',borderTop:'1px solid #E5EAF2',display:'flex',gap:8,justifyContent:'flex-end',background:'#FAFBFC',borderRadius:'0 0 10px 10px' }}>
              <button onClick={()=>setViewBill(null)} style={{ padding:'6px 18px',border:'1px solid #E5EAF2',borderRadius:6,background:'#fff',cursor:'pointer',fontSize:12,fontWeight:600 }}>Close</button>
              <button onClick={()=>openEditBill(viewBill)} style={{ padding:'6px 18px',border:'none',borderRadius:6,background:P,color:'#fff',cursor:'pointer',fontSize:12,fontWeight:700 }}>✏ï¸ Edit Invoice</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Order Bills Modal ── */}
      {viewOrderBills && (
        <div onClick={()=>setViewOrderBills(null)} style={{ position:'fixed',inset:0,background:'rgba(0,0,0,0.55)',zIndex:9100,display:'flex',alignItems:'center',justifyContent:'center',padding:16 }}>
          <div onClick={e=>e.stopPropagation()} style={{ background:'#fff',borderRadius:10,width:'100%',maxWidth:820,maxHeight:'88vh',display:'flex',flexDirection:'column',boxShadow:'0 20px 60px rgba(0,0,0,0.3)',fontFamily:F }}>
            <div style={{ background:P,color:'#fff',padding:'12px 18px',borderRadius:'10px 10px 0 0',display:'flex',justifyContent:'space-between',alignItems:'center' }}>
              <div>
                <div style={{ fontSize:15,fontWeight:800 }}>📋 Bills for {viewOrderBills.so?.orderNo||`SO-${viewOrderBills.orderId}`}</div>
                <div style={{ fontSize:11,opacity:0.7,marginTop:2 }}>{viewOrderBills.clientName} · {viewOrderBills.billCount} invoice{viewOrderBills.billCount!==1?'s':''}</div>
              </div>
              <div style={{ display:'flex',gap:8 }}>
                <button onClick={()=>{ setViewOrderBills(null); setSelOrder(String(viewOrderBills.orderId)); setView('create'); }}
                  style={{ background:'#10B981',border:'none',borderRadius:6,color:'#fff',padding:'5px 14px',cursor:'pointer',fontSize:12,fontWeight:700 }}>
                  🧾 + New Bill
                </button>
                <button onClick={()=>setViewOrderBills(null)} style={{ background:'rgba(255,255,255,0.15)',border:'1px solid rgba(255,255,255,0.3)',borderRadius:6,color:'#fff',width:30,height:30,cursor:'pointer',fontSize:16 }}>✕</button>
              </div>
            </div>
            <div style={{ flex:1,overflowY:'auto',padding:'14px 18px' }}>
              {viewOrderBills.billList.length===0 ? (
                <div style={{ textAlign:'center',padding:40,color:'#9CA3AF',fontSize:13 }}>No invoices created yet for this order.</div>
              ) : viewOrderBills.billList.map((b,i) => (
                <div key={b.billId} style={{ border:'1px solid #E5EAF2',borderRadius:8,marginBottom:10,overflow:'hidden' }}>
                  {/* bill card header */}
                  <div style={{ background:i%2===0?'#F8FAFF':'#FFF',padding:'8px 14px',borderBottom:'1px solid #E5EAF2',display:'flex',justifyContent:'space-between',alignItems:'center' }}>
                    <div>
                      <span style={{ fontWeight:800,color:P,fontSize:13 }}>{b.billNo||<em style={{color:'#9CA3AF',fontWeight:400}}>Draft</em>}</span>
                      <span style={{ marginLeft:10,fontSize:11,color:'#6B7280' }}>{fmtD(b.billDate)}</span>
                      {(b.attachments||[]).length>0 && <span style={{ marginLeft:8,fontSize:10,color:'#059669',fontWeight:700 }}>📎 {(b.attachments||[]).length} file{(b.attachments||[]).length>1?'s':''}</span>}
                    </div>
                    <div style={{ display:'flex',gap:6,alignItems:'center' }}>
                      <span style={{ fontSize:13,fontWeight:800,color:P }}>₹{fmt(b.grandTotal)}</span>
                      <button onClick={()=>{ setViewOrderBills(null); setViewBill(b); }}
                        style={{ padding:'3px 10px',fontSize:11,cursor:'pointer',background:'#EFF6FF',color:P,border:'1px solid #b3c6e8',borderRadius:5,fontFamily:F,fontWeight:700 }}>👁 View</button>
                      <button onClick={()=>{ setViewOrderBills(null); openEditBill(b); }}
                        style={{ padding:'3px 10px',fontSize:11,cursor:'pointer',background:'#FFF7ED',color:'#C2410C',border:'1px solid #FED7AA',borderRadius:5,fontFamily:F,fontWeight:700 }}>✏ï¸ Edit</button>
                    </div>
                  </div>
                  {/* bill card details */}
                  <div style={{ padding:'8px 14px',display:'flex',gap:24,flexWrap:'wrap',fontSize:11,color:'#555' }}>
                    <span>GST: <strong>{b.gstType==='intrastate'?'CGST+SGST':'IGST'}</strong></span>
                    <span>Taxable: <strong>₹{fmt(b.subTotal)}</strong></span>
                    <span>GST Amt: <strong style={{color:'#7C3AED'}}>₹{fmt(b.totalGST)}</strong></span>
                    {b.ewayBillNo && <span>E-way: <strong>{b.ewayBillNo}</strong></span>}
                    {b.irnNo && <span>IRN: <strong style={{fontSize:10,wordBreak:'break-all'}}>{b.irnNo}</strong></span>}
                  </div>
                  {/* attachments row */}
                  {(b.attachments||[]).length>0 && (
                    <div style={{ padding:'6px 14px',background:'#F8FAFF',borderTop:'1px solid #E5EAF2',display:'flex',gap:8,flexWrap:'wrap' }}>
                      {(b.attachments||[]).map((a,ai)=>(
                        <button key={ai} onClick={()=>setPdfViewer({ url:billFileUrl(b.billId,a.fileName,cid), name:a.name||a.fileName })}
                          style={{ display:'flex',alignItems:'center',gap:5,padding:'4px 10px',background:'#fff',border:'1px solid #b3c6e8',borderRadius:5,cursor:'pointer',color:P,fontSize:11,fontWeight:600,fontFamily:F }}>
                          {isPDF(a.fileName)?'📄':'🖼ï¸'} {a.name||a.fileName}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div style={{ padding:'10px 18px',borderTop:'1px solid #E5EAF2',background:'#FAFBFC',borderRadius:'0 0 10px 10px',display:'flex',justifyContent:'flex-end' }}>
              <button onClick={()=>setViewOrderBills(null)} style={{ padding:'6px 18px',border:'1px solid #E5EAF2',borderRadius:6,background:'#fff',cursor:'pointer',fontSize:12,fontWeight:600 }}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* ══ Combined nav bar ══ */}
      <div style={{ flexShrink:0, height:40, background:P, borderBottom:`2px solid ${PD}`,
        display:'flex', alignItems:'stretch', overflow:'hidden', fontFamily:F,
        position:'sticky', top:0, zIndex:20 }}>
        <style>{`.sb-srch::placeholder{color:rgba(255,255,255,0.45)}`}</style>

        {/* Label */}
        <div style={{ display:'flex', alignItems:'center', padding:'0 12px 0 10px',
          fontSize:11, fontWeight:800, color:'#fff', textTransform:'uppercase',
          letterSpacing:'0.8px', whiteSpace:'nowrap',
          borderRight:'2px solid rgba(255,255,255,0.18)', flexShrink:0 }}>
          🧾 SALES BILLS
        </div>

        {/* Tabs */}
        {[
          { key:'dashboard', label:'📊 Order Dashboard', count: dashboardRows.length },
          { key:'bills',     label:'Tax Invoices',       count: bills.length },
          { key:'pending-dc',label:'🚚 Delivery Challan', count: pendingDCs.length, alert: pendingDCs.filter(d=>d.status==='issued').length > 0 },
        ].map(t => {
          const isAct = listTab === t.key;
          return (
            <button key={t.key} onClick={() => { setListTab(t.key); setSbSearch(''); setBillStatusFilter('all'); setSelRow(null); }}
              style={{ display:'flex', alignItems:'center', gap:5, padding:'0 12px', height:'100%',
                fontSize:11.5, fontWeight:isAct?700:400, border:'none', cursor:'pointer',
                whiteSpace:'nowrap', flexShrink:0, fontFamily:F,
                color:isAct?'#fff':'rgba(255,255,255,0.65)',
                background:isAct?'rgba(255,255,255,0.12)':'transparent',
                borderBottom:isAct?'2px solid rgba(255,255,255,0.85)':'2px solid transparent',
                marginBottom:-2 }}>
              {t.label}
              <span style={{ background:t.alert?'#DC2626':isAct?'rgba(255,255,255,0.3)':'rgba(255,255,255,0.15)',
                color:'#fff', borderRadius:10, fontSize:10, padding:'1px 7px', fontWeight:700 }}>
                {t.count}
              </span>
            </button>
          );
        })}

        {/* Divider */}
        <div style={{ width:1, height:20, background:'rgba(255,255,255,0.2)', alignSelf:'center', flexShrink:0, margin:'0 4px' }} />

        {/* Search */}
        <div style={{ position:'relative', flex:1, minWidth:120, maxWidth:220, alignSelf:'center', margin:'0 6px' }}>
          <input value={sbSearch} onChange={e => setSbSearch(e.target.value)}
            placeholder="Search…" className="sb-srch"
            style={{ width:'100%', height:26, padding:'0 10px',
              border:'1px solid rgba(255,255,255,0.22)', borderRadius:6, fontSize:11, fontFamily:F,
              outline:'none', background:'rgba(255,255,255,0.1)', color:'#fff', boxSizing:'border-box' }} />
        </div>

        {/* Right buttons */}
        <div style={{ display:'flex', alignItems:'center', gap:6, padding:'0 10px', flexShrink:0, marginLeft:'auto' }}>
          <button onClick={() => openIssueDC()}
            style={{ height:26, padding:'0 12px', background:'rgba(255,255,255,0.18)', border:'1px solid rgba(255,255,255,0.35)',
              borderRadius:5, cursor:'pointer', color:'#fff', fontSize:11, fontWeight:700, fontFamily:F, whiteSpace:'nowrap' }}>
            🚚 New DC
          </button>
          <button onClick={() => setView('create')}
            style={{ height:26, padding:'0 12px', background:'#fff', border:'none',
              borderRadius:5, cursor:'pointer', color:P, fontSize:11, fontWeight:800, fontFamily:F, whiteSpace:'nowrap' }}>
            🧾 + New Invoice
          </button>
        </div>
      </div>

      {/* Contextual action bar */}
      {selRow && (
        <div style={{ flexShrink:0, background:`linear-gradient(90deg,${P},${PD})`, padding:'5px 12px',
          display:'flex', alignItems:'center', gap:8, boxShadow:'0 2px 6px rgba(0,0,0,0.18)', zIndex:19, position:'sticky', top:40 }}>
          <span style={{ fontSize:12, fontWeight:700, color:'#fff', flex:1,
            overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
            ▶ {selRow.so?.orderNo||`SO-${selRow.orderId}`} · {selRow.clientName}
          </span>
          {selRow.orderedQty > 0 && selRow.billedQty >= selRow.orderedQty ? (
            <span style={{ fontSize:10, fontWeight:700, padding:'3px 10px', borderRadius:10,
              background:'rgba(16,185,129,0.3)', color:'#fff', border:'1px solid rgba(16,185,129,0.5)', whiteSpace:'nowrap' }}>
              ✅ Fully Billed
            </span>
          ) : (
            <button onClick={() => { setSelOrder(String(selRow.orderId)); setView('create'); }}
              style={{ height:26, padding:'0 12px', fontSize:11, cursor:'pointer', fontFamily:F,
                fontWeight:700, borderRadius:5, border:'none', whiteSpace:'nowrap',
                background:'rgba(255,255,255,0.18)', color:'#fff' }}>🧾 Bill</button>
          )}
          <button onClick={() => setViewOrderBills(selRow)}
            style={{ height:26, padding:'0 12px', fontSize:11, cursor:'pointer', fontFamily:F,
              fontWeight:700, borderRadius:5, border:'none', whiteSpace:'nowrap',
              background:'rgba(255,255,255,0.18)', color:'#fff' }}>📋 View Bills</button>
          {selRow.so && (
            <button onClick={() => printCompletionCert(selRow.so, selectedCompany)}
              style={{ height:26, padding:'0 12px', fontSize:11, cursor:'pointer', fontFamily:F,
                fontWeight:700, borderRadius:5, border:'none', whiteSpace:'nowrap',
                background:'rgba(255,255,255,0.18)', color:'#fff' }}>🏆 Completion</button>
          )}
          {selRow.billList?.[0] && (
            <button onClick={() => printWarrantyCert(selRow.billList[0], selRow.so, selectedCompany, pendingDCs)}
              style={{ height:26, padding:'0 12px', fontSize:11, cursor:'pointer', fontFamily:F,
                fontWeight:700, borderRadius:5, border:'none', whiteSpace:'nowrap',
                background:'rgba(255,255,255,0.18)', color:'#fff' }}>📜 Warranty</button>
          )}
          <button onClick={() => setSelRow(null)}
            style={{ height:26, width:26, background:'rgba(255,255,255,0.15)', border:'none',
              color:'#fff', borderRadius:5, cursor:'pointer', fontSize:13, flexShrink:0 }}>✕</button>
        </div>
      )}

      {/* ── DASHBOARD TAB ── */}
      {listTab==='dashboard' && (() => {
        const q = sbSearch.toLowerCase();
        const dashFyOptions = ['all', ...Array.from(new Set(dashboardRows.map(r=>getFY(r.so?.orderDate)).filter(Boolean))).sort().reverse()];
        if (!dashFyOptions.includes(currentFY)) dashFyOptions.splice(1,0,currentFY);

        let rows = dashboardRows;
        if (fyFilter !== 'all') rows = rows.filter(r => getFY(r.so?.orderDate) === fyFilter);
        if (billStatusFilter === 'fully')   rows = rows.filter(r => r.pendingBillAmt === 0 && r.billAmount > 0);
        else if (billStatusFilter === 'partial') rows = rows.filter(r => r.billAmount > 0 && r.pendingBillAmt > 0);
        else if (billStatusFilter === 'none')    rows = rows.filter(r => r.billAmount === 0);
        if (q) rows = rows.filter(r =>
          (r.so?.orderNo||`SO-${r.orderId}`).toLowerCase().includes(q) ||
          (r.clientName||'').toLowerCase().includes(q) ||
          (r.clientOrderNo||'').toLowerCase().includes(q) ||
          (r.material||'').toLowerCase().includes(q)
        );

        return (
        <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>
          <div style={{ background:'#F8FAFF', borderBottom:'1px solid #E5EAF2', padding:'6px 14px', display:'flex', flexWrap:'wrap', gap:8, justifyContent:'space-between', alignItems:'center', flexShrink:0 }}>
            <div style={{ display:'flex', gap:6, alignItems:'center', flexWrap:'wrap' }}>

              {/* FY filter */}
              <span style={{ fontSize:10.5, fontWeight:700, color:'#374151' }}>Financial Year:</span>
              <select value={fyFilter} onChange={e=>setFyFilter(e.target.value)}
                style={{ height:28, padding:'0 8px', border:'1px solid #c5d0e6', borderRadius:5, fontSize:11, fontFamily:F, cursor:'pointer', background:'#fff', color:'#374151', minWidth:130 }}>
                {dashFyOptions.map(fy => (
                  <option key={fy} value={fy}>{fy === 'all' ? 'All Years' : `FY ${fy}`}</option>
                ))}
              </select>

              {/* Billing status filter */}
              <span style={{ fontSize:10.5, fontWeight:700, color:'#374151', marginLeft:6 }}>Status:</span>
              {[
                { key:'all',     label:'All',     bg:'#1e40af', fg:'#fff' },
                { key:'fully',   label:'Fully',   bg:'#065F46', fg:'#fff' },
                { key:'partial', label:'Partial', bg:'#92400E', fg:'#fff' },
                { key:'none',    label:'No Bill', bg:'#991B1B', fg:'#fff' },
              ].map(f => {
                const active = billStatusFilter === f.key;
                const base = fyFilter !== 'all'
                  ? dashboardRows.filter(r => getFY(r.so?.orderDate) === fyFilter)
                  : dashboardRows;
                const cnt = f.key === 'all' ? base.length
                  : f.key === 'fully'   ? base.filter(r => r.pendingBillAmt === 0 && r.billAmount > 0).length
                  : f.key === 'partial' ? base.filter(r => r.billAmount > 0 && r.pendingBillAmt > 0).length
                  :                       base.filter(r => r.billAmount === 0).length;
                return (
                  <button key={f.key} onClick={() => setBillStatusFilter(f.key)}
                    style={{ padding:'3px 10px', fontSize:10.5, cursor:'pointer', fontFamily:F, fontWeight:700, borderRadius:20,
                      background: active ? f.bg : '#fff', color: active ? f.fg : '#374151',
                      border: active ? `1.5px solid ${f.bg}` : '1.5px solid #c5d0e6',
                      display:'flex', alignItems:'center', gap:4 }}>
                    {f.label}
                    <span style={{ background: active?'rgba(255,255,255,0.3)':'#e5e7eb', color:active?f.fg:'#374151', borderRadius:10, fontSize:10, padding:'0 5px', fontWeight:700 }}>{cnt}</span>
                  </button>
                );
              })}
            </div>
            <button onClick={()=>{
              const cols=['Order No','Order Date','Client Order No','Client Name','Material','Order Value (₹)','Order Qty','Dispatch Qty','Due Qty','Billed Qty','Bill Amount (₹)','Bill Pending (₹)'];
              const rdata=rows.map(r=>[r.so?.orderNo||`SO-${r.orderId}`,fmtD(r.so?.orderDate),r.clientOrderNo,r.clientName,r.material,fmt(r.orderValue),r.orderedQty,r.dispatchQty,r.dueQty,r.billedQty,fmt(r.billAmount),fmt(r.pendingBillAmt)]);
              printReport('Sales Bill Dashboard',`Order-wise Billing Summary${fyFilter!=='all'?' — FY '+fyFilter:''}`,cols,rdata,null);
            }} style={{ padding:'3px 12px',fontSize:11,cursor:'pointer',background:'#EFF6FF',color:P,border:`1px solid ${P}`,borderRadius:5,fontFamily:F,fontWeight:700 }}>
              🖨 Print
            </button>
          </div>
          {loading ? (
            <div style={{ padding:30, textAlign:'center', color:'#9CA3AF' }}>Loading…</div>
          ) : (
            <div style={{ flex:1, overflow:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11, fontFamily:F, tableLayout:'fixed' }}>
                <colgroup>
                  <col style={{ width:'9%' }} />{/* Order No */}
                  <col style={{ width:'7%' }} />{/* Order Date */}
                  <col style={{ width:'8%' }} />{/* Client Order No */}
                  <col style={{ width:'14%' }} />{/* Client Name */}
                  <col style={{ width:'12%' }} />{/* Material */}
                  <col style={{ width:'8%' }} />{/* Order Value */}
                  <col style={{ width:'5%' }} />{/* Order Qty */}
                  <col style={{ width:'6%' }} />{/* Dispatch Qty */}
                  <col style={{ width:'5%' }} />{/* Due Qty */}
                  <col style={{ width:'5%' }} />{/* Billed Qty */}
                  <col style={{ width:'8%' }} />{/* Bill Amount */}
                  <col style={{ width:'8%' }} />{/* Bill Pending */}
                  <col style={{ width:'5%' }} />{/* Bills */}
                </colgroup>
                <thead style={{ position:'sticky', top:0, zIndex:2 }}>
                  <tr>
                    {['Order No','Order Date','Client Order No','Client Name','Material','Order Value (₹)','Order Qty','Dispatch Qty','Due Qty','Billed Qty','Bill Amount (₹)','Bill Pending (₹)','Bills'].map((h,i)=>(
                      <th key={h} style={{ padding:'5px 6px', background:P, color:'#fff', fontSize:9.5, fontWeight:700,
                        textAlign:i>=5&&i<=11?'right':'left', border:`1px solid ${PD}`, whiteSpace:'nowrap', position:'sticky', top:0 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.length===0 ? (
                    <tr><td colSpan={13} style={{ textAlign:'center',padding:30,color:'#9CA3AF',fontStyle:'italic' }}>{sbSearch||billStatusFilter!=='all'||fyFilter!=='all'?'No results':'No sales orders found'}</td></tr>
                  ) : rows.map((r,i)=>{
                    const isSel = selRow?.orderId === r.orderId;
                    const rowBg = isSel ? '#EEF4FF' : i%2===0?'#fff':'#F8FAFF';
                    return (
                    <tr key={r.orderId} onClick={()=>setSelRow(isSel?null:r)}
                      style={{ background:rowBg, cursor:'pointer', outline:isSel?`2px solid ${P}`:'none', outlineOffset:'-2px' }}
                      onMouseEnter={e=>{ if(!isSel) e.currentTarget.style.background='#EEF4FF'; }}
                      onMouseLeave={e=>e.currentTarget.style.background=rowBg}>
                      <td style={{ padding:'4px 6px',border:'1px solid #E5EAF2',fontWeight:700,color:P,wordBreak:'break-all',fontSize:10.5 }}>{r.so?.orderNo||`SO-${r.orderId}`}</td>
                      <td style={{ padding:'4px 6px',border:'1px solid #E5EAF2',color:'#555',whiteSpace:'nowrap',fontSize:10.5 }}>{fmtD(r.so?.orderDate||r.so?.date)||'—'}</td>
                      <td style={{ padding:'4px 6px',border:'1px solid #E5EAF2',color:'#555',wordBreak:'break-all',fontSize:10.5 }}>{r.clientOrderNo||'—'}</td>
                      <td style={{ padding:'4px 6px',border:'1px solid #E5EAF2',fontWeight:600,lineHeight:1.3 }}>{r.clientName}</td>
                      <td style={{ padding:'4px 6px',border:'1px solid #E5EAF2',lineHeight:1.3,color:'#374151' }} title={r.material}>{r.material}</td>
                      <td style={{ padding:'4px 6px',border:'1px solid #E5EAF2',textAlign:'right',fontWeight:700,color:'#1e293b',whiteSpace:'nowrap' }}>{r.orderValue>0?`₹${fmt(r.orderValue)}`:'—'}</td>
                      <td style={{ padding:'4px 6px',border:'1px solid #E5EAF2',textAlign:'right' }}>{r.orderedQty||'—'}</td>
                      <td style={{ padding:'4px 6px',border:'1px solid #E5EAF2',textAlign:'right',color:'#059669',fontWeight:600 }}>{r.dispatchQty||'—'}</td>
                      <td style={{ padding:'4px 6px',border:'1px solid #E5EAF2',textAlign:'right',color:r.dueQty>0?'#DC2626':'#059669',fontWeight:600 }}>{r.dueQty||'—'}</td>
                      <td style={{ padding:'4px 6px',border:'1px solid #E5EAF2',textAlign:'right',color:'#7C3AED',fontWeight:600 }}>{r.billedQty||'—'}</td>
                      <td style={{ padding:'4px 6px',border:'1px solid #E5EAF2',textAlign:'right',fontWeight:700,color:P,whiteSpace:'nowrap' }}>{r.billAmount>0?`₹${fmt(r.billAmount)}`:'—'}</td>
                      <td style={{ padding:'4px 6px',border:'1px solid #E5EAF2',textAlign:'right',fontWeight:700,color:r.pendingBillAmt>0?'#DC2626':'#059669',fontSize:10 }}>{r.pendingBillAmt>0?`₹${fmt(r.pendingBillAmt)}`:'✓ Billed'}</td>
                      <td style={{ padding:'4px 6px',border:'1px solid #E5EAF2',textAlign:'center' }}>
                        {r.billCount>0?(
                          <span style={{ fontSize:9.5,fontWeight:700,padding:'1px 6px',borderRadius:10,background:'#ECFDF5',color:'#065F46',border:'1px solid #6EE7B7',whiteSpace:'nowrap' }}>{r.billCount}✓</span>
                        ):(
                          <span style={{ fontSize:9.5,padding:'1px 6px',borderRadius:10,background:'#FEF3C7',color:'#92400E',border:'1px solid #FDE68A' }}>—</span>
                        )}
                      </td>
                    </tr>
                  );})}
                </tbody>
              </table>
            </div>
          )}
        </div>
        );
      })()}

      {/* ── BILLS TAB ── */}
      {listTab==='bills' && (() => {
        const q = sbSearch.toLowerCase();
        const fyOptions = ['all', ...Array.from(new Set(bills.map(b=>getFY(b.billDate)).filter(Boolean))).sort().reverse()];
        if (!fyOptions.includes(currentFY)) fyOptions.splice(1,0,currentFY);

        let filteredBills = bills;
        if (fyFilter !== 'all') filteredBills = filteredBills.filter(b => getFY(b.billDate) === fyFilter);
        if (q) filteredBills = filteredBills.filter(b =>
          (b.billNo||'').toLowerCase().includes(q) ||
          (b.partyName||'').toLowerCase().includes(q) ||
          (b.orderNo||'').toLowerCase().includes(q) ||
          (b.ewayBillNo||'').toLowerCase().includes(q)
        );
        filteredBills = [...filteredBills].sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));

        return (
        <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>

          {/* ── Bill Selection Action Bar ── */}
          {selBill && (() => {
            const selSO = salesOrders.find(o=>String(o.orderId)===String(selBill.orderId));
            return (
              <div style={{ background:`linear-gradient(90deg,${P},${PD})`, padding:'5px 12px', display:'flex', alignItems:'center', gap:8, flexShrink:0 }}>
                <span style={{ fontSize:11, color:'rgba(255,255,255,0.8)' }}>▶</span>
                <span style={{ fontSize:12, fontWeight:700, color:'#fff', flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                  {selBill.billNo||'Draft'} · {selBill.partyName||''}
                </span>
                {[
                  { label:'👁 View',   fn:()=>setViewBill(selBill) },
                  { label:'✏ï¸ Edit',   fn:()=>openEditBill(selBill) },
                  { label:'🏆 Cert',   fn:()=>printCompletionCert(selSO, selectedCompany) },
                  { label:'📜 Warranty', fn:()=>printWarrantyCert(selBill, selSO, selectedCompany, pendingDCs) },
                  { label:'🗑 Delete', fn:()=>handleDelete(selBill.billId), danger:true },
                ].map(btn => (
                  <button key={btn.label} onClick={btn.fn}
                    style={{ height:26, padding:'0 10px', fontSize:11, cursor:'pointer', fontFamily:F, fontWeight:700, borderRadius:5, whiteSpace:'nowrap', border:'none', background: btn.danger ? 'rgba(220,38,38,0.35)' : 'rgba(255,255,255,0.18)', color:'#fff' }}>
                    {btn.label}
                  </button>
                ))}
                <button onClick={()=>setSelBill(null)}
                  style={{ height:26, width:26, background:'rgba(255,255,255,0.15)', border:'none', color:'#fff', borderRadius:5, cursor:'pointer', fontSize:13 }}>✕</button>
              </div>
            );
          })()}

          {/* FY filter bar */}
          <div style={{ background:'#F8FAFF', borderBottom:'1px solid #E5EAF2', padding:'6px 14px', display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', flexShrink:0 }}>
            <span style={{ fontSize:10.5, fontWeight:700, color:'#374151' }}>Financial Year:</span>
            <select value={fyFilter} onChange={e=>setFyFilter(e.target.value)}
              style={{ height:28, padding:'0 8px', border:`1px solid ${fyFilter!=='all'?P:'#D1D5DB'}`, borderRadius:5, fontSize:11, fontFamily:F, cursor:'pointer', background:fyFilter!=='all'?'#EFF6FF':'#fff', color:fyFilter!=='all'?P:'#374151', minWidth:140, fontWeight:fyFilter!=='all'?700:400 }}>
              {fyOptions.map(fy => (
                <option key={fy} value={fy}>{fy === 'all' ? 'All Years' : `FY ${fy}`}</option>
              ))}
            </select>
            {fyFilter!=='all' && (
              <button onClick={()=>setFyFilter('all')} style={{ fontSize:10,padding:'2px 7px',borderRadius:4,border:'1px solid #D1D5DB',background:'#fff',cursor:'pointer',color:'#6B7280',fontFamily:F }}>✕ Clear</button>
            )}
            <span style={{ fontSize:10.5, color:'#6B7280', marginLeft:4 }}>
              {filteredBills.length} bill{filteredBills.length!==1?'s':''}
              {fyFilter!=='all' ? ` in FY ${fyFilter}` : ''}
            </span>
          </div>

          {/* scrollable table container */}
          <div style={{ flex:1, overflow:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11, fontFamily:F, tableLayout:'fixed' }}>
            <colgroup>
              <col style={{ width:'3%' }} />{/* # */}
              <col style={{ width:'9%' }} />{/* Bill No */}
              <col style={{ width:'6%' }} />{/* Bill Date */}
              <col style={{ width:'9%' }} />{/* Order No */}
              <col style={{ width:'6%' }} />{/* Order Date */}
              <col style={{ width:'13%' }} />{/* Client */}
              <col style={{ width:'8%' }} />{/* E-way */}
              <col style={{ width:'12%' }} />{/* IRN No */}
              <col style={{ width:'8%' }} />{/* Ack No */}
              <col style={{ width:'7%' }} />{/* GST Type */}
              <col style={{ width:'7%' }} />{/* Taxable */}
              <col style={{ width:'6%' }} />{/* GST */}
              <col style={{ width:'6%' }} />{/* Grand Total */}
            </colgroup>
            <thead style={{ position:'sticky', top:0, zIndex:2 }}>
              <tr>
                {['#','Bill No','Bill Date','Order No','Order Date','Client','E-way Bill No','IRN No','Ack No','GST Type','Taxable (₹)','GST (₹)','Grand Total (₹)'].map((h,i) => (
                  <th key={h} style={{ padding:'5px 6px', background:P, color:'#fff', fontSize:9.5, fontWeight:700,
                    textAlign:i>=10&&i<=12?'right':(i===0?'center':'left'), border:`1px solid ${PD}`, whiteSpace:'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={13} style={{ textAlign:'center',padding:30,color:'#9CA3AF' }}>Loading…</td></tr>
              ) : filteredBills.length===0 ? (
                <tr><td colSpan={13} style={{ textAlign:'center',padding:36,color:'#9CA3AF',fontStyle:'italic' }}>{sbSearch||fyFilter!=='all'?'No results':'No bills yet'}</td></tr>
              ) : filteredBills.map((b,i) => {
                const so = salesOrders.find(o=>String(o.orderId)===String(b.orderId));
                const isSel = selBill?.billId === b.billId;
                const rowBg = isSel ? '#EEF4FF' : i%2===0 ? '#fff' : '#F8FAFF';
                return (
                <tr key={b.billId} style={{ background:rowBg,cursor:'pointer', outline:isSel?`2px solid ${P}`:'none', outlineOffset:'-2px' }}
                  onClick={()=>setActivityRec(b)}
                  onMouseEnter={e=>{if(!isSel)e.currentTarget.style.background='#EEF4FF';}}
                  onMouseLeave={e=>{e.currentTarget.style.background=rowBg;}}>
                  {/* # select */}
                  <td style={{ padding:'4px 5px',border:'1px solid #E5EAF2',textAlign:'center',fontWeight:700,color:isSel?'#fff':'#9CA3AF',background:isSel?P:'transparent',cursor:'pointer',fontSize:10 }}
                    onClick={e=>{e.stopPropagation();setSelBill(s=>s?.billId===b.billId?null:b);}}>
                    {isSel?'✓':i+1}
                  </td>
                  <td style={{ padding:'4px 5px',border:'1px solid #E5EAF2',fontWeight:700,color:P,wordBreak:'break-all',fontSize:10.5 }}>
                    {b.billNo||<span style={{color:'#9CA3AF',fontStyle:'italic',fontWeight:400}}>Draft</span>}
                    {(b.attachments||[]).length>0 && <span style={{marginLeft:3,fontSize:9,color:'#059669'}}>📎{(b.attachments||[]).length}</span>}
                  </td>
                  <td style={{ padding:'4px 5px',border:'1px solid #E5EAF2',whiteSpace:'nowrap',fontSize:10.5 }}>{fmtD(b.billDate)}</td>
                  <td style={{ padding:'4px 5px',border:'1px solid #E5EAF2',color:P,fontWeight:600,wordBreak:'break-all',fontSize:10.5 }}>
                    {b.orderNo || (so?.orderNo ? so.orderNo : '—')}
                  </td>
                  <td style={{ padding:'4px 5px',border:'1px solid #E5EAF2',color:'#555',whiteSpace:'nowrap',fontSize:10.5 }}>
                    {fmtD(so?.orderDate || so?.date) || '—'}
                  </td>
                  <td style={{ padding:'4px 5px',border:'1px solid #E5EAF2',fontWeight:600,lineHeight:1.3 }}>{b.partyName}</td>
                  <td style={{ padding:'4px 5px',border:'1px solid #E5EAF2',fontSize:10,color:'#555',wordBreak:'break-all' }}>{b.ewayBillNo||'—'}</td>
                  <td style={{ padding:'4px 5px',border:'1px solid #E5EAF2',fontSize:9.5,color:'#555',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }} title={b.irnNo||''}>{b.irnNo||'—'}</td>
                  <td style={{ padding:'4px 5px',border:'1px solid #E5EAF2',fontSize:10,color:'#555',wordBreak:'break-all' }}>{b.acknNo||'—'}</td>
                  <td style={{ padding:'4px 5px',border:'1px solid #E5EAF2',textAlign:'center' }}>
                    <span style={{ padding:'1px 5px',borderRadius:4,fontSize:9.5,fontWeight:700,background:b.gstType==='intrastate'?'#DCFCE7':'#EEF2FF',color:b.gstType==='intrastate'?'#133d80':'#4338CA',whiteSpace:'nowrap' }}>
                      {b.gstType==='intrastate'?'CGST+SGST':'IGST'}
                    </span>
                  </td>
                  <td style={{ padding:'4px 5px',border:'1px solid #E5EAF2',textAlign:'right',whiteSpace:'nowrap' }}>{fmt(b.subTotal)}</td>
                  <td style={{ padding:'4px 5px',border:'1px solid #E5EAF2',textAlign:'right',color:'#7C3AED',whiteSpace:'nowrap' }}>{fmt(b.totalGST)}</td>
                  <td style={{ padding:'4px 5px',border:'1px solid #E5EAF2',textAlign:'right',fontWeight:700,color:P,whiteSpace:'nowrap' }}>{fmt(b.grandTotal)}</td>
                </tr>
              );})}
            </tbody>
            {filteredBills.length>0 && (
              <tfoot style={{ position:'sticky', bottom:0, zIndex:2 }}>
                <tr style={{ background:'#e8eef8', fontWeight:700 }}>
                  <td colSpan={10} style={{ padding:'6px 8px',border:'1px solid #E5EAF2',fontWeight:800 }}>TOTAL ({filteredBills.length} bills{fyFilter!=='all'?` · FY ${fyFilter}`:''})</td>
                  <td style={{ padding:'6px 8px',border:'1px solid #E5EAF2',textAlign:'right',fontWeight:800 }}>{fmt(filteredBills.reduce((s,b)=>s+(parseFloat(b.subTotal)||0),0))}</td>
                  <td style={{ padding:'6px 8px',border:'1px solid #E5EAF2',textAlign:'right',color:'#7C3AED',fontWeight:800 }}>{fmt(filteredBills.reduce((s,b)=>s+(parseFloat(b.totalGST)||0),0))}</td>
                  <td style={{ padding:'6px 8px',border:'1px solid #E5EAF2',textAlign:'right',color:P,fontWeight:800 }}>{fmt(filteredBills.reduce((s,b)=>s+(parseFloat(b.grandTotal)||0),0))}</td>
                </tr>
              </tfoot>
            )}
          </table>
          </div>{/* end scroll wrapper */}
        </div>
        );
      })()}

      {/* ── DC TAB ── */}
      {listTab==='pending-dc' && (
        <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>
          <div style={{ background:'#FFFBEB', borderBottom:'1px solid #FDE68A', padding:'7px 14px', display:'flex', alignItems:'center', gap:10 }}>
            <span style={{ fontSize:11, color:'#92400E', flex:1 }}><strong>Delivery Challans</strong> — "Invoice Pending" = invoice not yet created.</span>
            <span style={{ fontSize:10,fontWeight:700,padding:'2px 10px',borderRadius:10,background:'#FEF3C7',color:'#92400E',border:'1px solid #FDE68A' }}>
              {pendingDCs.filter(d=>d.status==='issued').length} Pending Invoice
            </span>
          </div>
          {loading ? (
            <div style={{ padding:30,textAlign:'center',color:'#9CA3AF' }}>Loading…</div>
          ) : (
            <table style={{ width:'100%',borderCollapse:'collapse',fontSize:11,fontFamily:F }}>
              <thead>
                <tr>{['DC No','DC Date','Sales Order','Client','Amount (₹)','Dispatched Via','Status','Action'].map((h,i)=>(
                  <th key={h} style={{ padding:'6px 8px',background:'#b45309',color:'#fff',fontSize:10,fontWeight:700,textAlign:i===4?'right':'left',border:'1px solid #92400e',whiteSpace:'nowrap' }}>{h}</th>
                ))}</tr>
              </thead>
              <tbody>
                {(() => {
                  const q = sbSearch.toLowerCase();
                  const dcs = q ? pendingDCs.filter(d =>
                    (d.dcNo||'').toLowerCase().includes(q) ||
                    (d.clientName||'').toLowerCase().includes(q) ||
                    (d.orderNo||'').toLowerCase().includes(q) ||
                    (d.dispatchThrough||'').toLowerCase().includes(q)
                  ) : pendingDCs;
                  if (dcs.length===0) return <tr><td colSpan={8} style={{ textAlign:'center',padding:30,color:'#9CA3AF',fontStyle:'italic' }}>{sbSearch?'No results':'No delivery challans yet.'}</td></tr>;
                  return dcs.map((d,i)=>{
                  const isPending=d.status==='issued';
                  return (
                    <tr key={d.dcId} style={{ background:i%2===0?'#fff':'#FFFBEB' }}>
                      <td style={{ padding:'5px 8px',border:'1px solid #E5EAF2',fontWeight:700,color:'#92400e' }}>{d.dcNo}</td>
                      <td style={{ padding:'5px 8px',border:'1px solid #E5EAF2' }}>{fmtD(d.dcDate)}</td>
                      <td style={{ padding:'5px 8px',border:'1px solid #E5EAF2',color:'#555' }}>{d.orderNo||'—'}</td>
                      <td style={{ padding:'5px 8px',border:'1px solid #E5EAF2',fontWeight:600 }}>{d.clientName||'—'}</td>
                      <td style={{ padding:'5px 8px',border:'1px solid #E5EAF2',textAlign:'right',fontWeight:700 }}>{fmt(d.grandTotal)}</td>
                      <td style={{ padding:'5px 8px',border:'1px solid #E5EAF2',color:'#555' }}>{d.dispatchThrough||'—'}</td>
                      <td style={{ padding:'5px 8px',border:'1px solid #E5EAF2' }}>
                        {isPending
                          ? <span style={{ fontSize:10,fontWeight:700,padding:'2px 8px',borderRadius:10,background:'#FEF3C7',color:'#92400E',border:'1px solid #FDE68A',whiteSpace:'nowrap' }}>⏳ Invoice Pending</span>
                          : <span style={{ fontSize:10,fontWeight:700,padding:'2px 8px',borderRadius:10,background:'#ECFDF5',color:'#065F46',border:'1px solid #6EE7B7',whiteSpace:'nowrap' }}>✅ {d.linkedInvoiceNo||'Invoiced'}</span>
                        }
                      </td>
                      <td style={{ padding:'5px 8px',border:'1px solid #E5EAF2' }}>
                        <div style={{ display:'flex',gap:4 }}>
                          {isPending && (
                            <button onClick={()=>{ setSelDC(String(d.dcId)); setSelOrder(String(d.linkedSalesOrderId||'')); setView('create'); }}
                              style={{ padding:'2px 8px',fontSize:10,cursor:'pointer',background:'#ECFDF5',color:'#065F46',border:'1px solid #6EE7B7',borderRadius:4,fontFamily:F,fontWeight:700 }}>
                              🧾 Invoice
                            </button>
                          )}
                          <button onClick={()=>printDeliveryChallan(d,{companyName:selectedCompany?.companyName||'',address:selectedCompany?.address||'',gstin:selectedCompany?.gstin||''})}
                            style={{ padding:'2px 8px',fontSize:10,cursor:'pointer',background:'#EFF6FF',color:P,border:'1px solid #b3c6e8',borderRadius:4,fontFamily:F,fontWeight:700 }}>
                            🖨 Print
                          </button>
                          <button onClick={()=>handleDeleteDC(d)}
                            style={{ padding:'2px 8px',fontSize:10,cursor:'pointer',background:'#FEF2F2',color:'#DC2626',border:'1px solid #FECACA',borderRadius:4,fontFamily:F }}>
                            🗑
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })})()}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );

  /* ═══════════════════════ ISSUE DC VIEW ═══════════════════════ */
  if (view==='issue-dc') {
    const so = dcSOData;
    return (
      <div style={{ fontFamily:F, fontSize:12, padding:10 }}>
        <div style={{ background:'#b45309', color:'#fff', padding:'8px 14px', borderRadius:7, display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
          <div>
            <div style={{ fontSize:14, fontWeight:800 }}>🚚 Issue Delivery Challan</div>
            <div style={{ fontSize:10, opacity:0.8, marginTop:1 }}>Goods dispatched — invoice to be raised later</div>
          </div>
          <button onClick={()=>{ setView('list'); setListTab('pending-dc'); }}
            style={{ height:28,padding:'0 14px',background:'rgba(255,255,255,0.2)',border:'1px solid rgba(255,255,255,0.4)',color:'#fff',borderRadius:5,cursor:'pointer',fontSize:11,fontWeight:600,fontFamily:F }}>
            ← Back
          </button>
        </div>
        {dcMsg && <div style={{ marginBottom:10,padding:'8px 12px',borderRadius:6,fontSize:12,background:dcMsg.startsWith('Error')?'#FEF2F2':'#ECFDF5',color:dcMsg.startsWith('Error')?'#DC2626':'#059669',border:`1px solid ${dcMsg.startsWith('Error')?'#FECACA':'#A7F3D0'}` }}>{dcMsg}</div>}
        <div style={{ background:'#fff',border:'1px solid #E5EAF2',borderRadius:8,padding:14,marginBottom:10 }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:14 }}>
            <div><label style={lbl}>Select Sales Order *</label>
              <select style={{ ...inp,cursor:'pointer' }} value={dcSO} onChange={e=>setDcSO(e.target.value)}>
                <option value="">— Select SO —</option>
                {salesOrders.map(o=><option key={o.orderId} value={o.orderId}>{o.orderNo||`SO-${o.orderId}`} · {o.customerName||'—'}</option>)}
              </select>
            </div>
            <div><label style={lbl}>DC Date *</label><input type="date" style={inp} value={dcDate} onChange={e=>setDcDate(e.target.value)}/></div>
            <div><label style={lbl}>Dispatch Through</label><input style={inp} value={dcDispatch} onChange={e=>setDcDispatch(e.target.value)} placeholder="Transport / courier"/></div>
            <div><label style={lbl}>Vehicle No</label><input style={inp} value={dcVehicle} onChange={e=>setDcVehicle(e.target.value)} placeholder="Vehicle number"/></div>
            <div><label style={lbl}>Invoice No (if already issued)</label><input style={inp} value={dcInvNo} onChange={e=>setDcInvNo(e.target.value)} placeholder="Optional"/></div>
            <div><label style={lbl}>Invoice Date</label><input type="date" style={inp} value={dcInvDate} onChange={e=>setDcInvDate(e.target.value)}/></div>
          </div>
        </div>
        {so && (
          <div style={{ background:'#fff',border:'1px solid #E5EAF2',borderRadius:8,padding:12,marginBottom:10 }}>
            <div style={{ fontWeight:800,fontSize:12,color:'#1E293B',marginBottom:8 }}>Order Details</div>
            <div style={{ display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:10 }}>
              {[{label:'Client',val:so.customerName||'—'},{label:'Order No',val:so.orderNo||'—'},{label:'Order Date',val:fmtD(so.orderDate)},{label:'Grand Total',val:`₹${fmt(so.grandTotal)}`}].map(x=>(
                <div key={x.label}>
                  <div style={{ fontSize:9,color:'#9CA3AF',textTransform:'uppercase' }}>{x.label}</div>
                  <div style={{ fontSize:12,fontWeight:600,color:'#1E293B',marginTop:2 }}>{x.val}</div>
                </div>
              ))}
            </div>
          </div>
        )}
        <div style={{ display:'flex',justifyContent:'flex-end',gap:8 }}>
          <button onClick={()=>{ setView('list'); setListTab('pending-dc'); }}
            style={{ height:30,padding:'0 16px',background:'#f5f5f5',border:'1px solid #d1d5db',color:'#374151',borderRadius:5,cursor:'pointer',fontSize:11,fontWeight:600,fontFamily:F }}>Cancel</button>
          <button onClick={handleIssueDC} disabled={dcSaving||!dcSO}
            style={{ height:30,padding:'0 20px',background:dcSaving||!dcSO?'#9CA3AF':'#b45309',border:'none',color:'#fff',borderRadius:5,cursor:dcSaving||!dcSO?'not-allowed':'pointer',fontSize:11,fontWeight:700,fontFamily:F }}>
            {dcSaving?'Issuing…':'🚚 Issue DC'}
          </button>
        </div>
      </div>
    );
  }

  /* ═══════════════════════ CREATE VIEW ═══════════════════════ */
  const partyState = order?.customerState||order?.shipToState||'';
  return (
    <div style={{ fontFamily:F, fontSize:12, padding:10 }}>
      {PdfConfirmModal}
      <div style={{ background:P, color:'#fff', padding:'8px 14px', borderRadius:7, display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
        <div>
          <div style={{ fontSize:14, fontWeight:800 }}>{editBill ? `✏ï¸ Edit Invoice — ${editBill.billNo||editBill.billId}` : '🧾 New Sales Invoice'}</div>
          <div style={{ fontSize:10, opacity:0.7, marginTop:1 }}>{companyState?`Company State: ${companyState}`:'Set company state in Admin'}</div>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={()=>{ setView('list'); setSelOrder(''); setOrder(null); setMsg(''); setEditBill(null); }}
            style={{ height:30,padding:'0 14px',background:'rgba(255,255,255,0.15)',border:'1px solid rgba(255,255,255,0.3)',color:'#fff',borderRadius:6,cursor:'pointer',fontSize:12,fontWeight:600,fontFamily:F }}>
            ← Back
          </button>
          {!editBill && (
            <button onClick={async()=>{ await handleSave(); }}
              disabled={saving}
              style={{ height:30,padding:'0 16px',background:'#10B981',border:'none',borderRadius:6,cursor:saving?'not-allowed':'pointer',color:'#fff',fontSize:12,fontWeight:800,fontFamily:F,opacity:saving?0.7:1 }}>
              {saving?'Saving…':'💾 Save & Add Another'}
            </button>
          )}
          <button onClick={async()=>{
            await handleSave();
            // for edit this already redirects; for new, redirect after saving
            if (!editBill) setTimeout(()=>{ setView('list'); setListTab('bills'); setMsg(''); setSelOrder(''); setOrder(null); setSelDC(''); setBillFile(null); setEditBill(null); }, 400);
          }} disabled={saving}
            style={{ height:30,padding:'0 18px',background: editBill?'#10B981':'#133d80',border:'none',borderRadius:6,cursor:saving?'not-allowed':'pointer',color:'#fff',fontSize:12,fontWeight:800,fontFamily:F,opacity:saving?0.7:1 }}>
            {saving?'Saving…': editBill ? '✔ Update Bill' : '✔ Save & Done'}
          </button>
        </div>
      </div>

      {msg && (
        <div style={{ marginBottom:10,padding:'10px 14px',borderRadius:6,fontSize:12,fontWeight:600,
          background:msg.startsWith('Error')?'#FEF2F2':'#ECFDF5',
          color:msg.startsWith('Error')?'#DC2626':'#059669',
          border:`1.5px solid ${msg.startsWith('Error')?'#FECACA':'#A7F3D0'}`,
          display:'flex',alignItems:'center',gap:8 }}>
          {msg}
          {!msg.startsWith('Error') && !editBill && (
            <span style={{ marginLeft:'auto',fontSize:11,color:'#374151',fontWeight:400 }}>
              Form reset — fill in details for the next bill
            </span>
          )}
        </div>
      )}

      {/* ── Section 1: Invoice Details ── */}
      <div style={{ background:'#fff',border:'1px solid #E5EAF2',borderRadius:8,padding:14,marginBottom:10 }}>
        <div style={{ fontSize:12,fontWeight:800,color:P,marginBottom:10,paddingBottom:4,borderBottom:'1px solid #E5EAF2' }}>Invoice Details</div>
        <div style={{ display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12 }}>
          <div><label style={lbl}>Tax Invoice No <span style={{color:'#9CA3AF',fontWeight:400}}>(optional)</span></label>
            <input style={inp} value={billNo} onChange={e=>setBillNo(e.target.value)} placeholder="Leave blank to fill later"/>
          </div>
          <div><label style={lbl}>Invoice Date *</label>
            <input type="date" style={inp} value={billDate} onChange={e=>setBillDate(e.target.value)}/>
          </div>
          <div><label style={lbl}>E-way Bill No</label>
            <input style={inp} value={ewayBillNo} onChange={e=>setEwayBillNo(e.target.value)} placeholder="e.g. 231234567890"/>
          </div>
          <div><label style={lbl}>IRN No</label>
            <input style={inp} value={irnNo} onChange={e=>setIrnNo(e.target.value)} placeholder="Invoice Reference Number"/>
          </div>
          <div><label style={lbl}>Acknowledgement No</label>
            <input style={inp} value={acknNo} onChange={e=>setAcknNo(e.target.value)} placeholder="Ack No"/>
          </div>
          <div><label style={lbl}>Acknowledgement Date</label>
            <input type="date" style={inp} value={acknDate} onChange={e=>setAcknDate(e.target.value)}/>
          </div>
          <div><label style={lbl}>Select Sales Order *</label>
            <select style={{ ...inp,cursor:'pointer' }} value={selOrder} onChange={e=>setSelOrder(e.target.value)}>
              <option value="">— Select Sales Order —</option>
              {salesOrders.map(o=><option key={o.orderId} value={o.orderId}>{o.orderNo||`SO-${o.orderId}`} · {o.customerName||o.clientName||'—'}</option>)}
            </select>
          </div>
          <div><label style={lbl}>Link Delivery Challan</label>
            <select style={{ ...inp,cursor:'pointer' }} value={selDC} onChange={e=>setSelDC(e.target.value)}>
              <option value="">— No DC linked —</option>
              {pendingDCs.map(d=><option key={d.dcId} value={d.dcId}>{d.dcNo} · {d.clientName||'—'} · {fmtD(d.dcDate)}</option>)}
            </select>
            {selDC && <div style={{ fontSize:10,color:'#059669',marginTop:3 }}>✅ DC will be marked as Invoiced</div>}
          </div>
          <div><label style={lbl}>Upload Bill / Invoice PDF</label>
            <input type="file" accept=".pdf,.jpg,.jpeg,.png"
              onChange={e => { const f = e.target.files[0]||null; setBillFile(f); if (f && isPDF(f.name)) handleParsePdf(f); }}
              style={{ ...inp, padding:'3px 6px', cursor:'pointer' }}/>
            {pdfParsing && <div style={{ fontSize:10,color:P,marginTop:3 }}>⏳ Reading PDF…</div>}
            {!pdfParsing && billFile && <div style={{ fontSize:10,color:'#059669',marginTop:3 }}>📎 {billFile.name} {isPDF(billFile.name) ? '· fields auto-extracted' : ''}</div>}
          </div>
        </div>
      </div>

      {order && (
        <>
          {/* ── Section 2: Bill To / Ship To ── */}
          <div style={{ background:'#fff',border:'1px solid #E5EAF2',borderRadius:8,padding:14,marginBottom:10 }}>
            <div style={{ fontSize:12,fontWeight:800,color:P,marginBottom:10,paddingBottom:4,borderBottom:'1px solid #E5EAF2' }}>Bill To / Ship To</div>
            <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:14 }}>
              {/* Bill To */}
              <div>
                <div style={{ fontSize:11,fontWeight:700,color:'#374151',marginBottom:6,background:'#F8FAFF',padding:'4px 8px',borderRadius:4,border:'1px solid #E5EAF2' }}>📋 Bill To</div>
                <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:8 }}>
                  {[
                    {label:'Company / Client',val:order.customerName||order.clientName||'—'},
                    {label:'Contact Person',   val:order.contactPerson||'—'},
                    {label:'GSTIN',            val:order.customerGstin||order.partyGstin||'—'},
                    {label:'Mobile',           val:order.mobile||'—'},
                    {label:'Address',          val:order.address||order.customerAddress||'—'},
                    {label:'City',             val:order.customerCity||'—'},
                    {label:'State',            val:order.customerState||'—'},
                    {label:'Pincode',          val:order.customerPincode||'—'},
                  ].map(x=>(
                    <div key={x.label}>
                      <div style={{ fontSize:9,color:'#9CA3AF',textTransform:'uppercase',letterSpacing:'0.3px' }}>{x.label}</div>
                      <div style={{ fontSize:11,fontWeight:500,color:'#1E293B',marginTop:2 }}>{x.val}</div>
                    </div>
                  ))}
                </div>
              </div>
              {/* Ship To */}
              <div>
                <div style={{ fontSize:11,fontWeight:700,color:'#374151',marginBottom:6,background:'#FFF7ED',padding:'4px 8px',borderRadius:4,border:'1px solid #FED7AA' }}>🚚 Ship To</div>
                <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:8 }}>
                  {[
                    {label:'Contact Name',    val:order.shipToName||order.contactPerson||'—'},
                    {label:'Mobile',          val:order.shipToMobile||order.mobile||'—'},
                    {label:'Address',         val:order.shipToAddress||order.deliveryAddr||'—'},
                    {label:'City',            val:order.shipToCity||'—'},
                    {label:'State',           val:order.shipToState||order.customerState||'—'},
                    {label:'Pincode',         val:order.shipToPincode||'—'},
                    {label:'Client PO No',    val:order.customerPO||'—'},
                    {label:'Delivery Date',   val:fmtD(order.deliveryDate)||'—'},
                  ].map(x=>(
                    <div key={x.label}>
                      <div style={{ fontSize:9,color:'#9CA3AF',textTransform:'uppercase',letterSpacing:'0.3px' }}>{x.label}</div>
                      <div style={{ fontSize:11,fontWeight:500,color:'#1E293B',marginTop:2 }}>{x.val}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            {/* GST type badge */}
            <div style={{ marginTop:10,padding:'8px 14px',borderRadius:6,display:'inline-flex',alignItems:'center',gap:10,background:intrastate?'#ECFDF5':'#EEF2FF',border:`1px solid ${intrastate?'#6EE7B7':'#A5B4FC'}` }}>
              <span style={{ fontSize:20 }}>{intrastate?'🏠':'✈ï¸'}</span>
              <div>
                <div style={{ fontSize:13,fontWeight:800,color:intrastate?'#059669':'#4338CA' }}>{intrastate?'INTRASTATE — CGST + SGST':'INTERSTATE — IGST'}</div>
                <div style={{ fontSize:10,color:'#6B7280' }}>{companyState||'?'} → {partyState||'?'}</div>
              </div>
            </div>
          </div>

          {/* ── Section 3: Item Billing Quantities ── */}
          <div style={{ background:'#fff',border:'1px solid #E5EAF2',borderRadius:8,overflow:'hidden',marginBottom:10 }}>
            <div style={{ background:P,padding:'7px 14px',display:'flex',justifyContent:'space-between',alignItems:'center' }}>
              <span style={{ fontSize:11,fontWeight:800,color:'#fff',textTransform:'uppercase',letterSpacing:'0.6px' }}>Item Billing Quantities</span>
              <span style={{ fontSize:10,color:'rgba(255,255,255,0.75)' }}>
                {itemBillingInfo.filter(i=>i.fullyBilled).length} fully billed · {itemBillingInfo.filter(i=>!i.fullyBilled).length} remaining
              </span>
            </div>
            <div style={{ overflowX:'auto' }}>
              <table style={{ borderCollapse:'collapse',fontSize:11,fontFamily:F,width:'100%',minWidth:860 }}>
                <thead>
                  <tr>
                    <TH>#</TH>
                    <TH style={{ minWidth:180 }}>Item Description</TH>
                    <TH align="center">HSN</TH>
                    <TH align="center">Unit</TH>
                    <TH align="right">Rate (₹)</TH>
                    <TH align="right" style={{ background:'#1a4a9f' }}>Order Qty</TH>
                    <TH align="right" style={{ background:'#7c3aed' }}>Billed Qty</TH>
                    <TH align="right" style={{ background:'#dc2626' }}>Due Qty</TH>
                    <TH align="right" style={{ background:'#059669',minWidth:100 }}>Current Bill Qty</TH>
                    <TH align="right">Taxable (₹)</TH>
                    <TH align="center">GST%</TH>
                    <TH align="right">Total (₹)</TH>
                  </tr>
                </thead>
                <tbody>
                  {itemBillingInfo.length===0 && (
                    <tr><td colSpan={12} style={{ textAlign:'center',padding:20,color:'#9CA3AF',fontStyle:'italic' }}>No items in selected order</td></tr>
                  )}
                  {itemBillingInfo.map((info, rowI) => {
                    const { idx, it, ordered, prevBilled, dueQty, currentQ, fullyBilled } = info;
                    const rate   = parseFloat(it.rate) || 0;
                    const gstPct = parseFloat(it.gst||it.gstPercent) || 0;
                    const taxable = currentQ * rate;
                    const gstAmt  = taxable * gstPct / 100;
                    return (
                      <tr key={idx} style={{ background: fullyBilled ? '#F9FAFB' : rowI%2===0 ? '#fff' : '#F8FAFF', opacity: fullyBilled ? 0.6 : 1 }}>
                        <TD align="center" color="#9CA3AF">{rowI+1}</TD>
                        <TD bold={!fullyBilled} color={fullyBilled?'#9CA3AF':'#111827'}>
                          {it.itemName||it.description||'—'}
                          {it.additionalDesc && <div style={{ fontSize:10,color:'#9CA3AF',fontWeight:400 }}>{it.additionalDesc}</div>}
                        </TD>
                        <TD align="center" style={{ fontFamily:'monospace',fontSize:10,color:'#555' }}>{it.hsnCode||'—'}</TD>
                        <TD align="center">{it.unit||'NOS'}</TD>
                        <TD align="right">{fmt(rate)}</TD>
                        {/* Order Qty */}
                        <td style={{ padding:'4px 8px',border:'1px solid #e2e8f0',textAlign:'right',fontWeight:600,color:'#1a4a9f',fontSize:12 }}>{ordered}</td>
                        {/* Billed Qty */}
                        <td style={{ padding:'4px 8px',border:'1px solid #e2e8f0',textAlign:'right',fontWeight:600,color:'#7c3aed',fontSize:12 }}>{prevBilled||'—'}</td>
                        {/* Due Qty */}
                        <td style={{ padding:'4px 8px',border:'1px solid #e2e8f0',textAlign:'right',fontWeight:700, fontSize:12,
                          color: fullyBilled ? '#059669' : dueQty < ordered ? '#dc2626' : '#374151' }}>
                          {fullyBilled ? '✅ Full' : dueQty}
                        </td>
                        {/* Current Bill Qty — editable */}
                        <td style={{ padding:'3px 6px',border:'1px solid #6EE7B7',background:fullyBilled?'#F3F4F6':'#F0FDF4' }}>
                          {fullyBilled ? (
                            <div style={{ textAlign:'center',fontSize:10,color:'#059669',fontWeight:700 }}>Fully Billed</div>
                          ) : (
                            <input
                              type="number" min="0" max={dueQty} step="1"
                              value={billQtys[idx] ?? dueQty}
                              onChange={e => {
                                const v = Math.min(Math.max(parseFloat(e.target.value)||0, 0), dueQty);
                                setBillQtys(prev => ({ ...prev, [idx]: v }));
                              }}
                              style={{ width:'100%',height:26,padding:'0 6px',border:'1px solid #6EE7B7',borderRadius:4,
                                fontSize:12,fontWeight:700,color:'#059669',textAlign:'right',
                                fontFamily:F,outline:'none',background:'transparent',boxSizing:'border-box' }}
                            />
                          )}
                        </td>
                        {/* Computed totals for current bill qty */}
                        <TD align="right" color={currentQ>0?'#374151':'#D1D5DB'}>{currentQ>0?fmt(taxable):'—'}</TD>
                        <TD align="center">{gstPct}%</TD>
                        <TD align="right" bold color={currentQ>0?P:'#D1D5DB'}>{currentQ>0?fmt(taxable+gstAmt):'—'}</TD>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Section 3b: Additional Charges ── */}
          <div style={{ background:'#fff',border:'1px solid #E5EAF2',borderRadius:8,padding:14,marginBottom:10 }}>
            <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10,paddingBottom:4,borderBottom:'1px solid #E5EAF2' }}>
              <span style={{ fontSize:12,fontWeight:800,color:'#7c3800' }}>Additional Charges <span style={{ fontSize:10,fontWeight:400,color:'#9CA3AF' }}>(P&F, Freight, custom charges)</span></span>
              <button onClick={()=>setBillCharges(c=>[...c,{description:'',amount:'',gstPct:'0'}])}
                style={{ padding:'3px 12px',fontSize:11,cursor:'pointer',background:'#FFF7ED',color:'#C2410C',border:'1px solid #FED7AA',borderRadius:4,fontFamily:F,fontWeight:700 }}>
                + Add Charge
              </button>
            </div>
            {billCharges.length===0 ? (
              <div style={{ color:'#9CA3AF',fontSize:11,fontStyle:'italic',padding:'8px 4px' }}>No additional charges — click <strong>+ Add Charge</strong> to add P&F, freight, or any custom charge.</div>
            ) : (
              <div style={{ overflowX:'auto' }}>
                <table style={{ borderCollapse:'collapse',fontSize:11,fontFamily:F,width:'100%',minWidth:580 }}>
                  <thead>
                    <tr>
                      <TH style={{ width:36 }}>#</TH>
                      <TH>Description</TH>
                      <TH align="right" style={{ width:130 }}>Amount (₹)</TH>
                      <TH align="center" style={{ width:90 }}>GST %</TH>
                      <TH align="right" style={{ width:120 }}>Total (₹)</TH>
                      <TH style={{ width:50,background:'#7c0000' }}></TH>
                    </tr>
                  </thead>
                  <tbody>
                    {billCharges.map((ch,i)=>{
                      const amt=parseFloat(ch.amount)||0, gst=parseFloat(ch.gstPct)||0;
                      const total=amt+amt*gst/100;
                      return (
                        <tr key={i} style={{ background:i%2===0?'#fff':'#FFF7ED' }}>
                          <TD align="center" color="#9CA3AF">{i+1}</TD>
                          <td style={{ padding:'4px 8px',border:'1px solid #e2e8f0' }}>
                            <input value={ch.description}
                              onChange={e=>{ const c=[...billCharges]; c[i]={...c[i],description:e.target.value}; setBillCharges(c); }}
                              placeholder="e.g. Packing & Forwarding, Freight…"
                              style={{ ...inp,height:28,fontSize:11 }}/>
                          </td>
                          <td style={{ padding:'4px 8px',border:'1px solid #e2e8f0' }}>
                            <input type="number" min="0" value={ch.amount}
                              onChange={e=>{ const c=[...billCharges]; c[i]={...c[i],amount:e.target.value}; setBillCharges(c); }}
                              placeholder="0"
                              style={{ ...inp,height:28,fontSize:11,textAlign:'right' }}/>
                          </td>
                          <td style={{ padding:'4px 8px',border:'1px solid #e2e8f0' }}>
                            <input type="number" min="0" max="28" value={ch.gstPct}
                              onChange={e=>{ const c=[...billCharges]; c[i]={...c[i],gstPct:e.target.value}; setBillCharges(c); }}
                              placeholder="0"
                              style={{ ...inp,height:28,fontSize:11,textAlign:'center' }}/>
                          </td>
                          <TD align="right" bold color={total>0?'#7c3800':'#D1D5DB'}>{total>0?`₹${fmt(total)}`:'—'}</TD>
                          <td style={{ padding:'4px 8px',border:'1px solid #e2e8f0',textAlign:'center' }}>
                            <button onClick={()=>setBillCharges(c=>c.filter((_,j)=>j!==i))}
                              style={{ border:'none',background:'none',cursor:'pointer',color:'#DC2626',fontSize:15,lineHeight:1,padding:'0 4px' }}>🗑</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{ background:'#FFF3E0' }}>
                      <td colSpan={4} style={{ padding:'5px 8px',border:'1px solid #e2e8f0',fontWeight:700,fontSize:11,color:'#7c3800' }}>Charges Total</td>
                      <TD align="right" bold color="#7c3800">
                        ₹{fmt(billCharges.reduce((s,ch)=>{ const a=parseFloat(ch.amount)||0,g=parseFloat(ch.gstPct)||0; return s+a+a*g/100; },0))}
                      </TD>
                      <td style={{ border:'1px solid #e2e8f0' }}></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>

          {/* ── Summary ── */}
          <div style={{ display:'flex',justifyContent:'flex-end',marginBottom:10 }}>
            <div style={{ background:'#fff',border:'1px solid #E5EAF2',borderRadius:8,overflow:'hidden',minWidth:340 }}>
              <div style={{ background:P,padding:'6px 14px',fontSize:11,fontWeight:800,color:'#fff',textTransform:'uppercase',letterSpacing:'0.6px' }}>Invoice Summary</div>
              <table style={{ borderCollapse:'collapse',width:'100%',fontSize:12,fontFamily:F }}>
                <tbody>
                  <tr><td style={{ padding:'7px 14px',borderBottom:'1px solid #F1F5F9',color:'#374151' }}>Taxable Amount</td><td style={{ padding:'7px 14px',borderBottom:'1px solid #F1F5F9',textAlign:'right',fontWeight:600 }}>₹{fmt(subTotal)}</td></tr>
                  {intrastate?<>
                    <tr><td style={{ padding:'7px 14px',borderBottom:'1px solid #F1F5F9',color:'#059669' }}>CGST</td><td style={{ padding:'7px 14px',borderBottom:'1px solid #F1F5F9',textAlign:'right',color:'#059669',fontWeight:600 }}>₹{fmt(totalCGST)}</td></tr>
                    <tr><td style={{ padding:'7px 14px',borderBottom:'1px solid #F1F5F9',color:'#059669' }}>SGST</td><td style={{ padding:'7px 14px',borderBottom:'1px solid #F1F5F9',textAlign:'right',color:'#059669',fontWeight:600 }}>₹{fmt(totalSGST)}</td></tr>
                  </>:<tr><td style={{ padding:'7px 14px',borderBottom:'1px solid #F1F5F9',color:'#4338CA' }}>IGST</td><td style={{ padding:'7px 14px',borderBottom:'1px solid #F1F5F9',textAlign:'right',color:'#4338CA',fontWeight:600 }}>₹{fmt(totalIGST)}</td></tr>}
                  <tr style={{ background:PL }}><td style={{ padding:'9px 14px',fontWeight:800,fontSize:13,color:'#1E293B' }}>Grand Total</td><td style={{ padding:'9px 14px',textAlign:'right',fontWeight:800,fontSize:14,color:P }}>₹{fmt(grandTotal)}</td></tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Existing Bills for this Order ── */}
          {(() => {
            const orderBills = bills.filter(b => String(b.orderId) === String(selOrder));
            if (orderBills.length === 0) return null;
            return (
              <div style={{ background:'#fff',border:'1px solid #E5EAF2',borderRadius:8,padding:14,marginTop:10 }}>
                <div style={{ fontSize:12,fontWeight:800,color:P,marginBottom:10,paddingBottom:4,borderBottom:'1px solid #E5EAF2',display:'flex',justifyContent:'space-between',alignItems:'center' }}>
                  <span>📋 Existing Bills for this Order ({orderBills.length})</span>
                  <span style={{ fontSize:11,fontWeight:600,color:'#059669' }}>
                    Total Billed: ₹{fmt(orderBills.reduce((s,b)=>s+(parseFloat(b.grandTotal)||0),0))}
                  </span>
                </div>
                <div style={{ display:'flex',flexDirection:'column',gap:8 }}>
                  {[...orderBills].sort((a,b2)=>new Date(b2.createdAt)-new Date(a.createdAt)).map((b,i) => (
                    <div key={b.billId} style={{ border:'1px solid #E5EAF2',borderRadius:6,overflow:'hidden',background:i%2===0?'#F8FAFF':'#fff' }}>
                      <div style={{ padding:'7px 12px',display:'flex',justifyContent:'space-between',alignItems:'center' }}>
                        <div style={{ display:'flex',gap:14,alignItems:'center' }}>
                          <span style={{ fontWeight:800,color:P,fontSize:12 }}>{b.billNo||<em style={{color:'#9CA3AF',fontWeight:400,fontSize:11}}>Draft Invoice</em>}</span>
                          <span style={{ fontSize:11,color:'#6B7280' }}>{fmtD(b.billDate)}</span>
                          <span style={{ fontSize:11,color:'#7C3AED' }}>GST: ₹{fmt(b.totalGST)}</span>
                          <span style={{ fontSize:12,fontWeight:700,color:P }}>Total: ₹{fmt(b.grandTotal)}</span>
                          {(b.attachments||[]).length>0 && <span style={{ fontSize:10,color:'#059669' }}>📎{(b.attachments||[]).length}</span>}
                        </div>
                        <div style={{ display:'flex',gap:6 }}>
                          <button onClick={()=>setViewBill(b)}
                            style={{ padding:'2px 10px',fontSize:10,cursor:'pointer',background:'#EFF6FF',color:P,border:'1px solid #b3c6e8',borderRadius:4,fontFamily:F,fontWeight:700 }}>
                            👁 View
                          </button>
                          <button onClick={()=>openEditBill(b)}
                            style={{ padding:'2px 10px',fontSize:10,cursor:'pointer',background:'#FFF7ED',color:'#C2410C',border:'1px solid #FED7AA',borderRadius:4,fontFamily:F,fontWeight:700 }}>
                            ✏ï¸ Edit
                          </button>
                        </div>
                      </div>
                      {(b.attachments||[]).length>0 && (
                        <div style={{ padding:'4px 12px',background:'#F0F4FF',borderTop:'1px solid #E5EAF2',display:'flex',gap:8,flexWrap:'wrap' }}>
                          {(b.attachments||[]).map((a,ai)=>(
                            <button key={ai} onClick={()=>setPdfViewer({ url:billFileUrl(b.billId,a.fileName,cid), name:a.name||a.fileName })}
                              style={{ fontSize:10,color:P,fontWeight:600,background:'none',border:'none',cursor:'pointer',fontFamily:F,padding:0 }}>
                              {isPDF(a.fileName)?'📄':'🖼ï¸'} {a.name||a.fileName}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
        </>
      )}

      <ActivityDrawer record={activityRec} recordType="sb" onClose={()=>setActivityRec(null)} />
    </div>
  );
}
