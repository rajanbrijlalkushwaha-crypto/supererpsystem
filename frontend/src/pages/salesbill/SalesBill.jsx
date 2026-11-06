import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { useCompany } from '../../context/CompanyContext';
import { useAuth } from '../../context/AuthContext';
import { printSalesBill } from '../../utils/printSalesBill';
import AuditTrail from '../../components/AuditTrail';
import ActivityDrawer from '../../components/ActivityDrawer';
import { withPrintFont } from '../../utils/printFont';

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
/* e-way validity in whole calendar days from today: <0 expired, 0 expires today */
const ewayDaysLeft = v => {
  if (!v) return null;
  const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})/);
  const d = m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(v);
  if (isNaN(d)) return null;
  const t = new Date(); t.setHours(0, 0, 0, 0); d.setHours(0, 0, 0, 0);
  return Math.round((d - t) / 86400000);
};
const ewayOpen = b => b.ewayStatus !== 'delivered' && !!b.ewayValidUpto;

/* Same "Prepared By" lookup as the Sales Order print — the user who created
   the order, from its audit trail, with a live fetch for their login ID and
   designation (not stored on the audit snapshot itself). */
async function getPreparedBy(order) {
  const createdBy = Array.isArray(order?.audit) ? order.audit.find(a => a.action === 'created')?.by : null;
  let preparedUser = null;
  if (createdBy?.id || createdBy?.username) {
    try {
      const r = await fetch('/api/auth/users');
      if (r.ok) {
        const all = await r.json();
        preparedUser = all.find(u => String(u.id) === String(createdBy.id)) ||
                       all.find(u => u.username === createdBy.username) || null;
      }
    } catch {}
  }
  return {
    name: createdBy?.name || createdBy?.username || '',
    loginId: preparedUser?.username || createdBy?.username || '',
    designation: preparedUser?.designation || '',
  };
}
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
  const refNo      = order?.orderNo || bill.orderNo || order?.orderId || bill.orderId || '—';

  /* ── DC ── */
  const dc = (dcList||[]).find(d => String(d.dcId) === String(bill.linkedDcId)) || null;

  /* ── Items ── */
  const billItems = (bill.items || order?.items || []).filter(it => it.description || it.itemName);

  /* ── Prepared By ── */
  const prepared = await getPreparedBy(order);

  const logoTag = logoB64
    ? `<img src="${logoB64}" style="height:50px;max-width:140px;object-fit:contain;">`
    : `<span style="font-size:13pt;font-weight:bold;color:#104f4f;">${coName}</span>`;

  const val = v => v || '';
  const field = (lbl, v) => `
    <div class="field-row">
      <span class="field-lbl">${lbl}</span>
      <span class="field-colon">:</span>
      <span class="field-val">${val(v)}</span>
    </div>`;

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>Warranty Certificate — ${val(bill.billNo)}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 10pt; color: #000; padding: 12px; }
  .outer { border: 1.5px solid #000; width: 100%; border-collapse: collapse; }
  .outer td, .outer th { border: 1px solid #000; padding: 3px 6px; vertical-align: top; }
  .section-hdr { text-align: center; font-weight: bold; font-size: 11pt; background: #fff; padding: 4px; }
  .col-hdr { font-weight: bold; text-decoration: underline; font-size: 10pt; }
  .field-row { display: flex; gap: 2px; margin-bottom: 2px; font-size: 9.5pt; }
  .field-lbl { min-width: 110px; font-weight: normal; }
  .field-colon { margin: 0 4px; }
  .field-val { flex: 1; }
  .item-table { width: 100%; border-collapse: collapse; font-size: 9pt; }
  .item-table th { border: 1px solid #000; padding: 4px 5px; font-weight: bold; text-align: center; background: #fff; }
  .item-table td { border: 1px solid #000; padding: 3px 5px; vertical-align: middle; }
  .wty-grid { display: grid; grid-template-columns: repeat(3,1fr); }
  .wty-box { border-right: 1px solid #000; padding: 6px 10px; text-align: center; }
  .wty-box:last-child { border-right: none; }
  .wty-box .wlbl { font-size: 8.5pt; font-weight: bold; text-transform: uppercase; letter-spacing: 0.4px; margin-bottom: 3px; }
  .wty-box .wval { font-size: 12pt; font-weight: bold; }
  .terms { font-size: 9.5pt; line-height: 1.6; padding: 6px 8px; }
  .terms p { margin-bottom: 6px; }
  .center { text-align: center; }
  @media print { @page { margin: 8mm; size: A4; } }

</style>
</head><body>
<table class="outer" style="margin-bottom:0;">

  <!-- Company Header -->
  <tr>
    <td colspan="2" style="padding:8px 10px; border-bottom:2px solid #000;">
      <div style="display:flex; align-items:center; gap:12px;">
        ${logoTag}
        <div>
          <div style="font-size:13pt; font-weight:bold;">${coName}</div>
          <div style="font-size:8.5pt; color:#333;">${coAddr}</div>
          <div style="font-size:8.5pt; color:#333;">${coGstin ? `GSTIN: ${coGstin}` : ''}${coPhone ? ` &nbsp;|&nbsp; Ph: ${coPhone}` : ''}${coEmail ? ` &nbsp;|&nbsp; ${coEmail}` : ''}</div>
        </div>
      </div>
    </td>
  </tr>

  <!-- Title -->
  <tr><td colspan="2" style="text-align:center; font-size:13pt; font-weight:bold; padding:6px; border-bottom:2px solid #000;">Warranty Certificate</td></tr>

  <!-- Ref / Date -->
  <tr>
    <td style="width:50%;">${field('Date', fmtD(bill.billDate))}</td>
    <td style="width:50%;">${field('Order ID / File No.', refNo)}</td>
  </tr>

  <!-- Client Details + Order Reference headers -->
  <tr>
    <td><span class="col-hdr">Client Details</span></td>
    <td><span class="col-hdr">Order Reference</span></td>
  </tr>

  <!-- Client + Order fields -->
  <tr>
    <td>
      ${field('Name', clientName)}
      ${field('Address', clientAddr)}
      ${field('GSTIN/UIN', clientGstin)}
      ${field('Contact', clientPhone)}
    </td>
    <td>
      ${field('Order Date', orderDate)}
      ${field('Client PO No.', clientPONo)}
      ${field('Invoice No.', bill.billNo)}
      ${dc ? field('Challan No.', dc.dcNo) : ''}
      ${field('Delivery Addr.', delivAddr)}
    </td>
  </tr>

  <!-- Certification text -->
  <tr><td colspan="2" style="padding:8px; font-size:10pt; line-height:1.5;">
    This is to certify that the following items have been supplied to <strong>${clientName}</strong> and are covered under our warranty as detailed below:
  </td></tr>

  <!-- Product Description -->
  <tr><td colspan="2" class="section-hdr" style="border-top:1.5px solid #000; border-bottom:1px solid #000;">Product Description</td></tr>
  <tr><td colspan="2" style="padding:0;">
    <table class="item-table">
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
          ? `<tr><td colspan="7" style="text-align:center;color:#666;font-style:italic;padding:16px;">No items</td></tr>`
          : billItems.map((it, i) => `
        <tr>
          <td class="center">${i+1}</td>
          <td>${it.description||it.itemName||'—'}</td>
          <td class="center">${it.qty||'—'}</td>
          <td class="center">${fmtD(bill.billDate)}</td>
          <td class="center">${dc?.dcNo || bill.linkedDcNo || bill.billNo || '—'}</td>
          <td class="center">${dc ? fmtD(dc.dcDate) : '—'}</td>
          <td>${it.remarks||''}</td>
        </tr>`).join('')}
      </tbody>
    </table>
  </td></tr>

  <!-- Warranty Terms -->
  <tr><td colspan="2" class="section-hdr" style="border-top:1.5px solid #000; border-bottom:1px solid #000;">Warranty Terms and Conditions</td></tr>
  <tr><td colspan="2" style="padding:0;">
    <div class="wty-grid">
      <div class="wty-box">
        <div class="wlbl">Warranty Period</div>
        <div class="wval">${wtyYears} ${wtyYears === 1 ? 'Year' : 'Years'}</div>
      </div>
      <div class="wty-box">
        <div class="wlbl">Warranty Start Date</div>
        <div class="wval">${wtyStart}</div>
      </div>
      <div class="wty-box">
        <div class="wlbl">Warranty End Date</div>
        <div class="wval">${wtyEnd}</div>
      </div>
    </div>
  </td></tr>

  <!-- Terms & Exclusions -->
  <tr><td colspan="2" class="terms">
    <p>1. The warranty covers manufacturing defects in materials and workmanship under normal use and maintenance. It does not cover damage resulting from accidents, misuse, abuse, improper maintenance, or unauthorized alterations or repairs. The warranty does not extend to any third-party components or accessories that may be integrated into the cabin.</p>
    <p><strong>2. Exclusions — The warranty does not cover:</strong><br>
    &nbsp;&nbsp;a. Normal wear and tear.<br>
    &nbsp;&nbsp;b. Cosmetic issues that do not affect the cabin's functionality.<br>
    &nbsp;&nbsp;c. Damage or defects caused by natural disasters, environmental factors, or acts of nature.<br>
    &nbsp;&nbsp;d. Damage or defects caused by modifications or alterations made by parties other than the supplier or its authorized representatives.</p>
  </td></tr>

  <!-- Signature -->
  <tr>
    <td style="text-align:center; padding:10px 10px 8px; width:50%;">
      <div style="height:70px; margin:0 8px 4px; border:1px solid #ccc; display:flex; align-items:center; justify-content:center; color:#aaa; font-size:8.5pt;">Signature</div>
      <div style="border-top:1px solid #000; margin:0 8px; padding-top:4px;">
        <strong>Prepared By</strong><br>
        <span style="font-size:9.5pt;">${prepared.name || '&nbsp;'}</span>
        ${prepared.loginId ? `<br><span style="font-size:8pt;color:#555;">Login ID: ${prepared.loginId}</span>` : ''}
        ${prepared.designation ? `<br><span style="font-size:8pt;color:#555;">${prepared.designation}</span>` : ''}
      </div>
    </td>
    <td style="text-align:center; padding:10px 10px 8px; width:50%;">
      <div style="height:70px; margin:0 8px 4px; border:1px solid #ccc; display:flex; align-items:center; justify-content:center; color:#aaa; font-size:8.5pt;">Signature &amp; Stamp</div>
      <div style="border-top:1px solid #000; margin:0 8px; padding-top:4px;">
        <strong>Authorised Signatory</strong><br><span style="font-size:9.5pt;">For ${coName}</span>
      </div>
    </td>
  </tr>

  <tr><td colspan="2" style="border-top:1px solid #000; text-align:right; font-size:8pt; color:#555;">
    Printed: ${fmtD(new Date().toISOString().slice(0,10))}
  </td></tr>

</table>
<script>window.onload=()=>setTimeout(()=>window.print(),500);<\/script>
</body></html>`;

  const w = window.open('','_blank','width=900,height=980,scrollbars=yes');
  if(!w){alert('Allow pop-ups to print.');return;}
  w.document.write(withPrintFont(html)); w.document.close();
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
          <td class="center">${idx+1}</td>
          <td>${it.itemName||it.description||'—'}</td>
          <td class="center">${it.qty||'—'}</td>
          <td class="center">${it.unit||it.uom||'Nos'}</td>
        </tr>`).join('')
    : `<tr><td colspan="4" style="text-align:center;color:#666;font-style:italic;">—</td></tr>`;

  /* ── Prepared By ── */
  const prepared = await getPreparedBy(order);

  const val = v => v || '';
  const field = (lbl, v) => `
    <div class="field-row">
      <span class="field-lbl">${lbl}</span>
      <span class="field-colon">:</span>
      <span class="field-val">${val(v)}</span>
    </div>`;

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>Completion Certificate — ${order?.orderNo||order?.orderId}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 10pt; color: #000; padding: 12px; }
  .outer { border: 1.5px solid #000; width: 100%; border-collapse: collapse; }
  .outer td, .outer th { border: 1px solid #000; padding: 3px 6px; vertical-align: top; }
  .section-hdr { text-align: center; font-weight: bold; font-size: 11pt; background: #fff; padding: 4px; }
  .field-row { display: flex; gap: 2px; margin-bottom: 2px; font-size: 9.5pt; }
  .field-lbl { min-width: 110px; font-weight: normal; }
  .field-colon { margin: 0 4px; }
  .field-val { flex: 1; }
  .item-table { width: 100%; border-collapse: collapse; font-size: 9pt; }
  .item-table th { border: 1px solid #000; padding: 4px 5px; font-weight: bold; text-align: center; background: #fff; }
  .item-table td { border: 1px solid #000; padding: 3px 5px; vertical-align: middle; }
  .body-para { font-size: 10pt; line-height: 1.6; text-align: justify; padding: 4px 8px; }
  .center { text-align: center; }
  @media print { @page { margin: 8mm; size: A4; } }
</style>
</head><body>
<table class="outer" style="margin-bottom:0;">

  <!-- Company Header -->
  <tr>
    <td colspan="2" style="padding:8px 10px; border-bottom:2px solid #000;">
      <div style="display:flex; align-items:center; gap:12px;">
        ${logoTag || `<span style="font-size:13pt;font-weight:bold;color:#104f4f;">${coName}</span>`}
        <div>
          <div style="font-size:13pt; font-weight:bold;">${coName}</div>
          <div style="font-size:8.5pt; color:#333;">${coFullAddr}</div>
          <div style="font-size:8.5pt; color:#333;">${coGstin ? `GSTIN: ${coGstin}` : ''}${coPhone ? ` &nbsp;|&nbsp; Ph: ${coPhone}` : ''}${coEmail ? ` &nbsp;|&nbsp; ${coEmail}` : ''}</div>
        </div>
      </div>
    </td>
  </tr>

  <!-- Title -->
  <tr><td colspan="2" style="text-align:center; font-size:13pt; font-weight:bold; padding:6px; border-bottom:2px solid #000;">
    Completion Certificate
    <div style="font-size:9pt; font-weight:normal; color:#333;">Supply &amp; Installation — Satisfactory Completion</div>
  </td></tr>

  <!-- Date / Ref -->
  <tr>
    <td style="width:50%;">${field('Date', certDate)}</td>
    <td style="width:50%;">${field('Ref / PO No.', clientPONo)}${field('Dated', orderDate)}</td>
  </tr>

  <!-- To -->
  <tr><td colspan="2" style="padding:6px 8px;">
    <strong>To,</strong><br>
    <strong>${clientName}</strong><br>
    ${clientAddr1 ? clientAddr1+'<br>' : ''}
    ${[clientCity,clientPin].filter(Boolean).join('-')}${clientCity||clientPin?'<br>':''}
    ${clientState ? clientState+'<br>' : ''}
    ${clientGstin ? 'GSTIN/UIN: '+clientGstin+'<br>' : ''}
    ${clientPhone || ''}
  </td></tr>

  <!-- Subject -->
  <tr><td colspan="2" style="padding:6px 8px; font-weight:bold; text-decoration:underline; font-size:10pt;">
    Sub: Successful Completion of ${itemDesc} — Supply &amp; Installation.
  </td></tr>

  <!-- Opening para -->
  <tr><td colspan="2" class="body-para">
    Dear Sir,<br><br>
    We are pleased to inform you that the supply &amp; installation of the following items, as per the above reference, has been successfully completed to your full satisfaction.
  </td></tr>

  <!-- Items -->
  <tr><td colspan="2" class="section-hdr" style="border-top:1.5px solid #000; border-bottom:1px solid #000;">Product / Item Description</td></tr>
  <tr><td colspan="2" style="padding:0;">
    <table class="item-table">
      <thead>
        <tr>
          <th style="width:8%;">S.No</th>
          <th style="text-align:left;width:57%;">Product / Item Description</th>
          <th style="width:17%;">Qty</th>
          <th style="width:18%;">Unit</th>
        </tr>
      </thead>
      <tbody>
        ${itemsTableRows}
      </tbody>
    </table>
  </td></tr>

  <!-- Installation Address -->
  <tr><td colspan="2" class="section-hdr" style="border-top:1.5px solid #000; border-bottom:1px solid #000;">Installation / Site Address</td></tr>
  <tr><td colspan="2" style="padding:6px 8px; font-size:10pt; line-height:1.5;">
    ${shipName !== clientName ? '<strong>'+shipName+'</strong><br>' : ''}
    ${delivFullAddr || '—'}
  </td></tr>

  <!-- Closing para -->
  <tr><td colspan="2" class="body-para">
    The installation, commissioning, and performance testing of the above items were executed satisfactorily. Please treat this letter as the formal <strong>Completion Certificate</strong> acknowledging successful completion of the work.<br><br>
    Thank you for your confidence in our services.<br><br>
    Yours faithfully,
  </td></tr>

  <!-- Signature -->
  <tr>
    <td style="text-align:center; padding:10px 10px 8px; width:50%;">
      <div style="font-size:9.5pt; font-weight:bold; margin-bottom:4px;">For ${coName}</div>
      <div style="height:70px; margin:0 8px 4px; border:1px solid #999; display:flex; align-items:center; justify-content:center; color:#aaa; font-size:8.5pt;">Signature &amp; Stamp</div>
      <div style="border-top:1px solid #000; margin:0 8px; padding-top:4px;">
        <strong>Authorised Signatory</strong><br><span style="font-size:9.5pt;">${coName}</span>
      </div>
    </td>
    <td style="text-align:center; padding:10px 10px 8px; width:50%;">
      <div style="font-size:9.5pt; font-weight:bold; margin-bottom:4px;">For ${clientName}</div>
      <div style="height:70px; margin:0 8px 4px; border:1px solid #999; display:flex; align-items:center; justify-content:center; color:#aaa; font-size:8.5pt;">Signature &amp; Stamp</div>
      <div style="border-top:1px solid #000; margin:0 8px; padding-top:4px;">
        <strong>Client Authorised Signatory</strong><br><span style="font-size:9.5pt;">${clientName}</span>
        <div style="font-size:8.5pt; text-align:left; margin-top:6px; line-height:1.9;">
          Name &nbsp;: ________________________<br>
          Desig.&nbsp;: ________________________<br>
          Date &nbsp;&nbsp;: ________________________
        </div>
      </div>
    </td>
  </tr>

  <tr><td colspan="2" style="border-top:1px solid #000; font-size:8pt; color:#555;">
    <div style="display:flex; justify-content:space-between;">
      <span>${prepared.name ? `Prepared by: ${prepared.name}${prepared.loginId ? ` (${prepared.loginId})` : ''}${prepared.designation ? ` — ${prepared.designation}` : ''}` : ''}</span>
      <span>Printed: ${certDate}</span>
    </div>
  </td></tr>

</table>
<script>window.onload=()=>setTimeout(()=>window.print(),500);<\/script>
</body></html>`;

  const w = window.open('','_blank','width=820,height=980,scrollbars=yes');
  if(!w){alert('Allow pop-ups to print.');return;}
  w.document.write(withPrintFont(html)); w.document.close();
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
  w.document.write(withPrintFont(html)); w.document.close();
};

/* ══════════════════════════════════════════════
   MAIN COMPONENT
══════════════════════════════════════════════ */
export default function SalesBill() {
  const { selectedCompany } = useCompany();
  const { user } = useAuth();
  const cid          = selectedCompany?.companyId;
  const companyState = selectedCompany?.state || '';

  const [salesOrders, setSalesOrders] = useState([]);
  const [bills,       setBills]       = useState([]);
  const [pendingDCs,  setPendingDCs]  = useState([]);
  const [clientDues,  setClientDues]  = useState([]);
  const [searchParams, setSearchParams] = useSearchParams();
  const listTab = searchParams.get('tab') || 'dashboard';
  const setListTab = (tab) => setSearchParams({ tab }, { replace: true });
  const [view,        setView]        = useState('list');      // 'list'|'create'
  const [sbSearch,    setSbSearch]    = useState('');
  const [billStatusFilter, setBillStatusFilter] = useState('all'); // 'all'|'fully'|'partial'|'none'
  const [fyFilter,    setFyFilter]    = useState(currentFY);

  /* Bill create */
  const [selOrder,    setSelOrder]    = useState('');
  const [order,       setOrder]       = useState(null);
  const [billNo,      setBillNo]      = useState('');
  const [billDate,    setBillDate]    = useState(today());
  const [ewayBillNo,  setEwayBillNo]  = useState('');
  const [ewayValidUpto, setEwayValidUpto] = useState('');
  const [ewayGenDate, setEwayGenDate] = useState('');
  const [vehicleNo,   setVehicleNo]   = useState('');
  const [approxDistanceKm, setApproxDistanceKm] = useState('');
  const [dispatchFrom, setDispatchFrom] = useState('');
  const [ewayMode, setEwayMode] = useState('1 - Road');
  const [supplyType, setSupplyType] = useState('Outward-Supply');
  const [transactionType, setTransactionType] = useState('');
  const [transporterId, setTransporterId] = useState('');
  const [transporterName, setTransporterName] = useState('');
  const [vehicleFromCity, setVehicleFromCity] = useState('');
  const [cewbNo, setCewbNo] = useState('');
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
  /* e-way bill tracking */
  const [ewayExtendId,  setEwayExtendId]  = useState(null); // billId currently showing the extend-date input
  const [ewayExtendVal, setEwayExtendVal] = useState('');
  const [ewayBusyId,    setEwayBusyId]    = useState(null);
  const [podFor,        setPodFor]        = useState(null);   // bill being marked delivered
  const [podForm,       setPodForm]       = useState({ date:'', by:'', mobile:'', file:null });
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
      setEwayBillNo(''); setEwayValidUpto(''); setEwayGenDate(''); setVehicleNo(''); setApproxDistanceKm(''); setDispatchFrom('');
      setEwayMode('1 - Road'); setSupplyType('Outward-Supply'); setTransactionType(''); setTransporterId(''); setTransporterName(''); setVehicleFromCity(''); setCewbNo('');
      setIrnNo(''); setAcknNo(''); setAcknDate('');
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
        companyId:cid,
        /* new invoice details */
        ewayBillNo:ewayBillNo||'', ewayValidUpto:ewayValidUpto||'', ewayGenDate:ewayGenDate||'', vehicleNo:vehicleNo||'',
        approxDistanceKm:approxDistanceKm||'', dispatchFrom:dispatchFrom||'',
        ewayMode:ewayMode||'', supplyType:supplyType||'', transactionType:transactionType||'',
        transporterId:transporterId||'', transporterName:transporterName||'', vehicleFromCity:vehicleFromCity||'', cewbNo:cewbNo||'',
        irnNo:irnNo||'', acknNo:acknNo||'', acknDate:acknDate||'',
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
        setTimeout(()=>{ setView('list'); setListTab('bills'); setMsg(''); setSelOrder(''); setOrder(null); setBillFile(null); setEditBill(null); }, 1400);
      } else {
        // after new bill → stay on page, reset only form fields so user can add another
        resetBillFields();
      }
    } catch(e) { setMsg('Error: '+(e.response?.data?.error||e.message)); }
    setSaving(false);
  };

  /* reset only the per-bill fields, keep order selected */
  const resetBillFields = () => {
    setBillNo(''); setBillDate(today()); setEwayBillNo(''); setEwayValidUpto(''); setEwayGenDate(''); setVehicleNo(''); setApproxDistanceKm(''); setDispatchFrom('');
    setEwayMode('1 - Road'); setSupplyType('Outward-Supply'); setTransactionType(''); setTransporterId(''); setTransporterName(''); setVehicleFromCity(''); setCewbNo('');
    setIrnNo(''); setAcknNo(''); setAcknDate(''); setBillFile(null); setBillQtys({});
    setTimeout(()=>setMsg(''),3000);
  };

  /* ── Open a bill in edit mode ── */
  const openEditBill = (b) => {
    setEditBill(b);
    setSelOrder(String(b.orderId || ''));
    setBillNo(b.billNo || '');
    setBillDate(b.billDate || today());
    setEwayBillNo(b.ewayBillNo || '');
    setEwayValidUpto(b.ewayValidUpto || '');
    setEwayGenDate(b.ewayGenDate || '');
    setVehicleNo(b.vehicleNo || '');
    setApproxDistanceKm(b.approxDistanceKm || '');
    setDispatchFrom(b.dispatchFrom || '');
    setEwayMode(b.ewayMode || '1 - Road');
    setSupplyType(b.supplyType || 'Outward-Supply');
    setTransactionType(b.transactionType || '');
    setTransporterId(b.transporterId || '');
    setTransporterName(b.transporterName || '');
    setVehicleFromCity(b.vehicleFromCity || '');
    setCewbNo(b.cewbNo || '');
    setIrnNo(b.irnNo || '');
    setAcknNo(b.acknNo || '');
    setAcknDate(b.acknDate || '');
    setBillFile(null);
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

  /* Print the bill in our own Tax Invoice format — pulls the linked Sales
     Order (if any) just for Order Date / Client PO reference; everything
     else (IRN, Ack No, E-way Bill, items, GST) comes off the bill itself. */
  const handlePrintBill = async (b) => {
    let ord = salesOrders.find(o => String(o.orderId) === String(b.orderId)) || null;
    if (b.orderId) {
      try { const r = await axios.get(`/api/sales-orders/${b.orderId}?companyId=${cid}`); ord = r.data; } catch {}
    }
    printSalesBill(b, selectedCompany, ord, user);
  };

  const handleDelete = async (billId) => {
    if (!window.confirm(`Delete bill ${billId}?`)) return;
    await axios.delete(`/api/bills/${billId}?companyId=${cid}&type=sales`).catch(()=>{});
    load();
  };

  /* ── E-way bill tracking actions ── */
  const extendEwayValidity = async (bill) => {
    if (!ewayExtendVal) { setMsg('Pick a new Valid Upto date first.'); return; }
    setEwayBusyId(bill.billId);
    try {
      await axios.put(`/api/bills/${bill.billId}?companyId=${cid}&type=sales`, { ewayValidUpto: ewayExtendVal, ewayStatus:'active' });
      setMsg(`E-way Bill validity for ${bill.billNo||bill.billId} extended to ${fmtD(ewayExtendVal)}`);
      setEwayExtendId(null); setEwayExtendVal('');
      load();
    } catch (e) { setMsg('Error: ' + (e.response?.data?.error||e.message)); }
    setEwayBusyId(null);
  };

  const setEwayDelivered = async (bill, delivered) => {
    setEwayBusyId(bill.billId);
    try {
      await axios.put(`/api/bills/${bill.billId}?companyId=${cid}&type=sales`, { ewayStatus: delivered ? 'delivered' : 'active' });
      setMsg(delivered ? `E-way Bill ${bill.ewayBillNo} marked delivered — goods received.` : `E-way Bill ${bill.ewayBillNo} reopened.`);
      load();
    } catch (e) { setMsg('Error: ' + (e.response?.data?.error||e.message)); }
    setEwayBusyId(null);
  };

  const openPod = (bill) => {
    setPodFor(bill);
    setPodForm({ date: bill.pod?.deliveryDate || today(), by: bill.pod?.receivedBy || '', mobile: bill.pod?.receiverMobile || '', file: null });
  };
  const savePod = async () => {
    const bill = podFor;
    if (!podForm.date) { setMsg('Enter the delivery date.'); return; }
    if (!podForm.by.trim()) { setMsg('Enter who received the goods.'); return; }
    setEwayBusyId(bill.billId);
    try {
      let podFile = bill.pod?.fileName ? { fileName: bill.pod.fileName, name: bill.pod.fileOriginal } : null;
      if (podForm.file) {
        const fd = new FormData(); fd.append('file', podForm.file);
        const r = await axios.post(`/api/bills/${bill.billId}/upload?companyId=${cid}&type=sales`, fd, { headers:{'Content-Type':'multipart/form-data'} });
        const att = (r.data?.attachments || []).slice(-1)[0];
        if (att) podFile = { fileName: att.fileName, name: att.name };
      }
      await axios.put(`/api/bills/${bill.billId}?companyId=${cid}&type=sales`, {
        ewayStatus: 'delivered',
        pod: { deliveryDate: podForm.date, receivedBy: podForm.by.trim(), receiverMobile: podForm.mobile.trim(),
               fileName: podFile?.fileName || '', fileOriginal: podFile?.name || '', savedAt: new Date().toISOString() },
      });
      setMsg(`E-way Bill ${bill.ewayBillNo} marked delivered on ${fmtD(podForm.date)} — received by ${podForm.by.trim()}.`);
      setPodFor(null);
      load();
    } catch (e) { setMsg('Error: ' + (e.response?.data?.error||e.message)); }
    setEwayBusyId(null);
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

  /* ── E-way bill tracking rows — any bill that actually has an e-way bill no. ── */
  const ewayRows = bills.filter(b => {
    // tracked once it has an e-way bill no. and a Valid Upto date — and stays listed for good (no age cut-off)
    return !!(b.ewayBillNo && b.ewayValidUpto);
  }).sort((a,b) => {
    const aDone = a.ewayStatus==='delivered', bDone = b.ewayStatus==='delivered';
    if (aDone !== bDone) return aDone ? 1 : -1; // undelivered first
    const ad = new Date(a.ewayValidUpto || 0).getTime();
    const bd = new Date(b.ewayValidUpto || 0).getTime();
    return ad - bd; // most urgent (soonest/overdue) first
  });
  const soByOrderId = {};
  salesOrders.forEach(o => { soByOrderId[String(o.orderId)] = o; });

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
      {/* Box never exceeds the window: header + buttons stay put, fields scroll */}
      <div style={{ background:'#fff', borderRadius:12, width:'100%', maxWidth:520,
        maxHeight:'calc(100vh - 32px)', display:'flex', flexDirection:'column',
        boxShadow:'0 24px 60px rgba(0,0,0,0.3)', overflow:'hidden' }}>

        {/* Header */}
        <div style={{ background:P, padding:'12px 18px', display:'flex', alignItems:'center', gap:10, flexShrink:0 }}>
          <span style={{ fontSize:18 }}>📋</span>
          <div>
            <div style={{ fontSize:13, fontWeight:800, color:'#fff' }}>Auto-fill from PDF</div>
            <div style={{ fontSize:11, color:'rgba(255,255,255,0.75)', marginTop:1 }}>Review extracted fields, edit if needed, then confirm.</div>
          </div>
        </div>

        <div style={{ padding:'14px 18px 6px', flex:1, minHeight:0, overflowY:'auto' }}>

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
            { label:'E-way Valid Upto',   key:'ewayValidUpto' },
            { label:'E-way Generated',    key:'ewayGenDate' },
            { label:'Vehicle No',         key:'vehicleNo' },
            { label:'Approx Distance',    key:'approxDistanceKm' },
            { label:'Dispatch From',      key:'dispatchFrom' },
            { label:'Mode',               key:'ewayMode' },
            { label:'Supply Type',        key:'supplyType' },
            { label:'Transaction Type',   key:'transactionType' },
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
        <div style={{ padding:'10px 18px 14px', display:'flex', gap:8, justifyContent:'flex-end',
          borderTop:'1px solid #E5EAF2', flexShrink:0, background:'#fff' }}>
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
            if (pdfConfirm.ewayValidUpto) setEwayValidUpto(pdfConfirm.ewayValidUpto);
            if (pdfConfirm.ewayGenDate) setEwayGenDate(pdfConfirm.ewayGenDate);
            if (pdfConfirm.vehicleNo)  setVehicleNo(pdfConfirm.vehicleNo);
            if (pdfConfirm.approxDistanceKm) setApproxDistanceKm(pdfConfirm.approxDistanceKm);
            if (pdfConfirm.dispatchFrom) setDispatchFrom(pdfConfirm.dispatchFrom);
            if (pdfConfirm.ewayMode)   setEwayMode(pdfConfirm.ewayMode);
            if (pdfConfirm.supplyType) setSupplyType(pdfConfirm.supplyType);
            if (pdfConfirm.transactionType) setTransactionType(pdfConfirm.transactionType);
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
  const podInp = { width:'100%', height:32, padding:'0 10px', border:'1px solid #CBD5E1', borderRadius:6, fontSize:12, fontFamily:F, outline:'none', boxSizing:'border-box' };
  const podLbl = { fontSize:11, fontWeight:700, color:'#374151', marginBottom:4, display:'block' };
  const PodModal = podFor ? (
    <div onMouseDown={e=>{ if (e.target===e.currentTarget) setPodFor(null); }}
      style={{ position:'fixed', inset:0, background:'rgba(15,23,42,0.5)', zIndex:10500, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
      <div style={{ background:'#fff', borderRadius:12, width:400, maxWidth:'100%', boxShadow:'0 20px 50px rgba(0,0,0,0.25)', fontFamily:F, overflow:'hidden' }}>
        <div style={{ background:P, color:'#fff', padding:'10px 16px', fontWeight:800, fontSize:13 }}>
          ✅ Mark Delivered — {podFor.billNo || podFor.billId}
          <div style={{ fontSize:10.5, fontWeight:500, opacity:0.85, marginTop:2 }}>E-way Bill {podFor.ewayBillNo} · {podFor.partyName}</div>
        </div>
        <div style={{ padding:16, display:'flex', flexDirection:'column', gap:12 }}>
          <div>
            <label style={podLbl}>Delivery Date *</label>
            <input type="date" value={podForm.date} onChange={e=>setPodForm(f=>({ ...f, date:e.target.value }))} style={podInp}/>
          </div>
          <div>
            <label style={podLbl}>Received By (Name) *</label>
            <input value={podForm.by} onChange={e=>setPodForm(f=>({ ...f, by:e.target.value }))} placeholder="Person who received the goods" style={podInp} autoFocus/>
          </div>
          <div>
            <label style={podLbl}>Receiver Mobile No.</label>
            <input value={podForm.mobile} onChange={e=>setPodForm(f=>({ ...f, mobile:e.target.value.replace(/[^0-9+ ]/g,'') }))} placeholder="e.g. 9876543210" inputMode="tel" style={podInp}/>
          </div>
          <div>
            <label style={podLbl}>POD (Proof of Delivery)</label>
            <input type="file" accept=".pdf,image/*" onChange={e=>setPodForm(f=>({ ...f, file:e.target.files?.[0] || null }))} style={{ fontSize:11.5, fontFamily:F }}/>
            {!podForm.file && podFor.pod?.fileName && (
              <div style={{ fontSize:10.5, color:'#6b7280', marginTop:4 }}>
                Current: <a href={billFileUrl(podFor.billId, podFor.pod.fileName, cid)} target="_blank" rel="noreferrer" style={{ color:P, fontWeight:700 }}>{podFor.pod.fileOriginal || podFor.pod.fileName}</a> — choose a file to replace it
              </div>
            )}
          </div>
        </div>
        <div style={{ display:'flex', justifyContent:'flex-end', gap:8, padding:'10px 16px', borderTop:'1px solid #E5EAF2', background:'#F8FAFC' }}>
          <button onClick={()=>setPodFor(null)}
            style={{ height:32, padding:'0 16px', background:'#fff', border:'1px solid #CBD5E1', borderRadius:6, fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:F, color:'#374151' }}>Cancel</button>
          <button onClick={savePod} disabled={ewayBusyId===podFor.billId}
            style={{ height:32, padding:'0 18px', background:'#059669', border:'none', borderRadius:6, fontSize:12, fontWeight:700, cursor:ewayBusyId===podFor.billId?'wait':'pointer', fontFamily:F, color:'#fff' }}>
            {ewayBusyId===podFor.billId ? 'Saving…' : '✔ Save & Mark Delivered'}
          </button>
        </div>
      </div>
    </div>
  ) : null;

  if (view==='list') return (
    <div style={{ fontFamily:F, fontSize:12, display:'flex', flexDirection:'column', height:'100%' }}>
      {PdfConfirmModal}
      {PodModal}

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
                  ['E-way Valid Upto', viewBill.ewayValidUpto||'—'],
                  ['E-way Generated', viewBill.ewayGenDate||'—'],
                  ['Vehicle No',   viewBill.vehicleNo||'—'],
                  ['Approx Distance', viewBill.approxDistanceKm?`${viewBill.approxDistanceKm} KM`:'—'],
                  ['Dispatch From', viewBill.dispatchFrom||'—'],
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
              <button onClick={()=>handlePrintBill(viewBill)} style={{ padding:'6px 18px',border:'1px solid #b3c6e8',borderRadius:6,background:'#EFF6FF',color:P,cursor:'pointer',fontSize:12,fontWeight:700 }}>🖨 Print Invoice</button>
              <button onClick={()=>openEditBill(viewBill)} style={{ padding:'6px 18px',border:'none',borderRadius:6,background:P,color:'#fff',cursor:'pointer',fontSize:12,fontWeight:700 }}>✏ï¸ Edit Invoice</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Order Bills Modal ── */}
      {viewOrderBills && (
        <div onClick={()=>setViewOrderBills(null)} style={{ position:'fixed',inset:0,background:'rgba(0,0,0,0.55)',zIndex:9100,display:'flex',alignItems:'center',justifyContent:'center',padding:16 }}>
          <div onClick={e=>e.stopPropagation()} style={{ background:'#fff',borderRadius:10,width:'100%',maxWidth:1180,maxHeight:'88vh',display:'flex',flexDirection:'column',boxShadow:'0 20px 60px rgba(0,0,0,0.3)',fontFamily:F }}>
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
              ) : (() => {
                const so = viewOrderBills.so;
                const supplied = viewOrderBills.billAmount || 0;
                const received = Math.max(0, supplied - (viewOrderBills.dueAmt || 0));
                const dues     = viewOrderBills.dueAmt || 0;
                return (
                  <>
                    <table style={{ width:'100%',borderCollapse:'collapse',fontSize:11,fontFamily:F }}>
                      <thead>
                        <tr>
                          {['#','Invoice No','Invoice Date','PO No','PO Date','Product','Qty','Amount (₹)','Vehicle No','E-way Bill','Actions'].map(h=>(
                            <th key={h} style={{ padding:'6px 8px',background:P,color:'#fff',fontSize:10.5,fontWeight:700,textAlign:'left',border:`1px solid ${PD}`,whiteSpace:'nowrap' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {viewOrderBills.billList.map((b,i) => {
                          const items = b.items||[];
                          const qty   = items.reduce((s,it)=>s+(parseFloat(it.qty)||0),0);
                          const product = items.length
                            ? (items[0].itemName||items[0].description||'—') + (items.length>1?` +${items.length-1} more`:'')
                            : '—';
                          return (
                            <tr key={b.billId} style={{ background:'#fff' }}>
                              <td style={{ padding:'5px 8px',border:'1px solid #E5EAF2',color:'#6b7280' }}>{i+1}</td>
                              <td style={{ padding:'5px 8px',border:'1px solid #E5EAF2',fontWeight:700,color:P }}>{b.billNo||<em style={{color:'#9CA3AF',fontWeight:400}}>Draft</em>}</td>
                              <td style={{ padding:'5px 8px',border:'1px solid #E5EAF2' }}>{fmtD(b.billDate)}</td>
                              <td style={{ padding:'5px 8px',border:'1px solid #E5EAF2' }}>{so?.customerPO||'—'}</td>
                              <td style={{ padding:'5px 8px',border:'1px solid #E5EAF2' }}>{fmtD(so?.poDate)}</td>
                              <td style={{ padding:'5px 8px',border:'1px solid #E5EAF2' }}>{product}</td>
                              <td style={{ padding:'5px 8px',border:'1px solid #E5EAF2',textAlign:'center',fontWeight:700 }}>{qty||'—'}</td>
                              <td style={{ padding:'5px 8px',border:'1px solid #E5EAF2',textAlign:'right',fontWeight:700,color:'#1e293b' }}>{fmt(b.grandTotal)}</td>
                              <td style={{ padding:'5px 8px',border:'1px solid #E5EAF2' }}>{b.vehicleNo||'—'}</td>
                              <td style={{ padding:'5px 8px',border:'1px solid #E5EAF2',fontFamily:'monospace',fontSize:10 }}>{b.ewayBillNo||'—'}</td>
                              <td style={{ padding:'5px 8px',border:'1px solid #E5EAF2' }}>
                                <div style={{ display:'flex',gap:4 }}>
                                  <button onClick={()=>{ setViewOrderBills(null); setViewBill(b); }}
                                    style={{ padding:'3px 8px',fontSize:10,cursor:'pointer',background:'#EFF6FF',color:P,border:'1px solid #b3c6e8',borderRadius:4,fontFamily:F,fontWeight:700,whiteSpace:'nowrap' }}>👁 View</button>
                                  <button onClick={()=>handlePrintBill(b)}
                                    style={{ padding:'3px 8px',fontSize:10,cursor:'pointer',background:'#F0FDF4',color:'#166534',border:'1px solid #BBF7D0',borderRadius:4,fontFamily:F,fontWeight:700,whiteSpace:'nowrap' }}>🖨</button>
                                  <button onClick={()=>{ setViewOrderBills(null); openEditBill(b); }}
                                    style={{ padding:'3px 8px',fontSize:10,cursor:'pointer',background:'#FFF7ED',color:'#C2410C',border:'1px solid #FED7AA',borderRadius:4,fontFamily:F,fontWeight:700,whiteSpace:'nowrap' }}>✏️</button>
                                </div>
                                {(b.attachments||[]).length>0 && (
                                  <div style={{ display:'flex',gap:4,flexWrap:'wrap',marginTop:4 }}>
                                    {(b.attachments||[]).map((a,ai)=>(
                                      <button key={ai} onClick={()=>setPdfViewer({ url:billFileUrl(b.billId,a.fileName,cid), name:a.name||a.fileName })}
                                        style={{ padding:'2px 7px',background:'#fff',border:'1px solid #b3c6e8',borderRadius:4,cursor:'pointer',color:P,fontSize:10,fontWeight:600,fontFamily:F }}>
                                        {isPDF(a.fileName)?'📄':'🖼️'} {a.name||a.fileName}
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>

                    <div style={{ marginTop:14, border:'1px solid #E5EAF2', borderRadius:8, overflow:'hidden', maxWidth:360, marginLeft:'auto' }}>
                      <div style={{ display:'flex',justifyContent:'space-between',padding:'7px 12px',background:'#F8FAFF',borderBottom:'1px solid #E5EAF2',fontSize:11.5 }}>
                        <span style={{ fontWeight:600,color:'#374151' }}>A · Total Supplied Value</span>
                        <span style={{ fontWeight:800,color:'#1e293b' }}>₹{fmt(supplied)}</span>
                      </div>
                      <div style={{ display:'flex',justifyContent:'space-between',padding:'7px 12px',background:'#fff',borderBottom:'1px solid #E5EAF2',fontSize:11.5 }}>
                        <span style={{ fontWeight:600,color:'#374151' }}>B · Total Amount Received</span>
                        <span style={{ fontWeight:800,color:'#16a34a' }}>₹{fmt(received)}</span>
                      </div>
                      <div style={{ display:'flex',justifyContent:'space-between',padding:'8px 12px',background:'#FEF2F2',fontSize:12 }}>
                        <span style={{ fontWeight:800,color:'#991B1B' }}>A − B · Dues</span>
                        <span style={{ fontWeight:800,color:'#991B1B' }}>₹{fmt(dues)}</span>
                      </div>
                    </div>
                  </>
                );
              })()}
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
          { key:'eway',      label:'📍 E-way Bill',       count: ewayRows.length, alert: ewayRows.some(b => ewayOpen(b) && ewayDaysLeft(b.ewayValidUpto) <= 0) },
        ].map(t => {
          const isAct = listTab === t.key;
          return (
            <button key={t.key} onClick={() => { setListTab(t.key); setSbSearch(''); setBillStatusFilter('all'); setSelRow(null); }}
              style={{ display:'flex', alignItems:'center', gap:5, padding:'0 12px', height:26, alignSelf:'center',
                fontSize:11.5, fontWeight:isAct?700:600, cursor:'pointer',
                whiteSpace:'nowrap', flexShrink:0, fontFamily:F,
                color:isAct?'#fff':'rgba(255,255,255,0.85)',
                background:isAct?'rgba(255,255,255,0.22)':'rgba(255,255,255,0.07)',
                border:`1px solid ${isAct?'rgba(255,255,255,0.55)':'rgba(255,255,255,0.22)'}`,
                boxShadow:isAct?'0 2px 6px rgba(0,0,0,0.22)':'0 1px 2px rgba(0,0,0,0.12)',
                borderRadius:6, margin:'0 4px' }}
              onMouseEnter={e=>{if(!isAct){e.currentTarget.style.background='rgba(255,255,255,0.14)';e.currentTarget.style.borderColor='rgba(255,255,255,0.55)';}}}
              onMouseLeave={e=>{if(!isAct){e.currentTarget.style.background='rgba(255,255,255,0.07)';e.currentTarget.style.borderColor='rgba(255,255,255,0.22)';}}}>
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
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11, fontFamily:F, tableLayout:'fixed', background:'#fff' }}>
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
                <thead>
                  <tr>
                    {['Order No','Order Date','Client Order No','Client Name','Material','Order Value (₹)','Order Qty','Dispatch Qty','Due Qty','Billed Qty','Bill Amount (₹)','Bill Pending (₹)','Bills'].map((h,i)=>(
                      <th key={h} style={{ padding:'5px 6px', background:'#133d80', color:'#fff', fontSize:9.5, fontWeight:700,
                        textAlign:i>=5&&i<=11?'right':'left', border:'1px solid #000', whiteSpace:'nowrap', position:'sticky', top:0, zIndex:2 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.length===0 ? (
                    <tr><td colSpan={13} style={{ textAlign:'center',padding:30,color:'#9CA3AF',fontStyle:'italic' }}>{sbSearch||billStatusFilter!=='all'||fyFilter!=='all'?'No results':'No sales orders found'}</td></tr>
                  ) : rows.map((r,i)=>{
                    const isSel = selRow?.orderId === r.orderId;
                    const rowBg = isSel ? '#EEF4FF' : '#fff';
                    return (
                    <tr key={r.orderId} onClick={()=>setSelRow(isSel?null:r)}
                      style={{ background:rowBg, cursor:'pointer', outline:isSel?`2px solid ${P}`:'none', outlineOffset:'-2px' }}
                      onMouseEnter={e=>{ if(!isSel) e.currentTarget.style.background='#EEF4FF'; }}
                      onMouseLeave={e=>e.currentTarget.style.background=rowBg}>
                      <td style={{ padding:'4px 6px',border:'1px solid #000',fontWeight:700,color:'#000',wordBreak:'break-all',fontSize:10.5 }}>{r.so?.orderNo||`SO-${r.orderId}`}</td>
                      <td style={{ padding:'4px 6px',border:'1px solid #000',color:'#000',whiteSpace:'nowrap',fontSize:10.5 }}>{fmtD(r.so?.orderDate||r.so?.date)||'—'}</td>
                      <td style={{ padding:'4px 6px',border:'1px solid #000',color:'#000',wordBreak:'break-all',fontSize:10.5 }}>{r.clientOrderNo||'—'}</td>
                      <td style={{ padding:'4px 6px',border:'1px solid #000',color:'#000',fontWeight:600,lineHeight:1.3 }}>{r.clientName}</td>
                      <td style={{ padding:'4px 6px',border:'1px solid #000',color:'#000',lineHeight:1.3 }} title={r.material}>{r.material}</td>
                      <td style={{ padding:'4px 6px',border:'1px solid #000',textAlign:'right',fontWeight:700,color:'#000',whiteSpace:'nowrap' }}>{r.orderValue>0?`₹${fmt(r.orderValue)}`:'—'}</td>
                      <td style={{ padding:'4px 6px',border:'1px solid #000',color:'#000',textAlign:'right' }}>{r.orderedQty||'—'}</td>
                      <td style={{ padding:'4px 6px',border:'1px solid #000',textAlign:'right',color:'#059669',fontWeight:600 }}>{r.dispatchQty||'—'}</td>
                      <td style={{ padding:'4px 6px',border:'1px solid #000',textAlign:'right',color:r.dueQty>0?'#DC2626':'#059669',fontWeight:600 }}>{r.dueQty||'—'}</td>
                      <td style={{ padding:'4px 6px',border:'1px solid #000',textAlign:'right',color:'#7C3AED',fontWeight:600 }}>{r.billedQty||'—'}</td>
                      <td style={{ padding:'4px 6px',border:'1px solid #000',textAlign:'right',fontWeight:700,color:'#000',whiteSpace:'nowrap' }}>{r.billAmount>0?`₹${fmt(r.billAmount)}`:'—'}</td>
                      <td style={{ padding:'4px 6px',border:'1px solid #000',textAlign:'right',fontWeight:700,color:r.pendingBillAmt>0?'#DC2626':'#059669',fontSize:10 }}>{r.pendingBillAmt>0?`₹${fmt(r.pendingBillAmt)}`:'✓ Billed'}</td>
                      <td style={{ padding:'4px 6px',border:'1px solid #000',textAlign:'center' }}>
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
        filteredBills = [...filteredBills].sort((a,b)=>new Date(b.billDate)-new Date(a.billDate) || new Date(b.createdAt)-new Date(a.createdAt));

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
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11, fontFamily:F, tableLayout:'fixed', background:'#fff' }}>
            <colgroup>
              <col style={{ width:'3%' }} />{/* # */}
              <col style={{ width:'12%' }} />{/* Bill No */}
              <col style={{ width:'8%' }} />{/* Bill Date */}
              <col style={{ width:'12%' }} />{/* Order No */}
              <col style={{ width:'8%' }} />{/* Order Date */}
              <col style={{ width:'12%' }} />{/* Client */}
              <col style={{ width:'9%' }} />{/* Client PO No */}
              <col style={{ width:'10%' }} />{/* Material */}
              <col style={{ width:'4%' }} />{/* Qty */}
              <col style={{ width:'6%' }} />{/* Rate */}
              <col style={{ width:'7%' }} />{/* GST Type */}
              <col style={{ width:'8%' }} />{/* Taxable */}
              <col style={{ width:'7%' }} />{/* GST */}
              <col style={{ width:'7%' }} />{/* Grand Total */}
            </colgroup>
            <thead>
              <tr>
                {['#','Bill No','Bill Date','Order No','Order Date','Client','Client PO No','Material','Qty','Rate (₹)','GST Type','Taxable (₹)','GST (₹)','Grand Total (₹)'].map((h,i) => (
                  <th key={h} style={{ padding:'5px 6px', background:'#133d80', color:'#fff', fontSize:9.5, fontWeight:700,
                    textAlign:i===8?'center':i===9?'right':i>=11&&i<=13?'right':(i===0?'center':'left'), border:'1px solid #000', whiteSpace:'nowrap', position:'sticky', top:0, zIndex:2 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={14} style={{ textAlign:'center',padding:30,color:'#9CA3AF' }}>Loading…</td></tr>
              ) : filteredBills.length===0 ? (
                <tr><td colSpan={14} style={{ textAlign:'center',padding:36,color:'#9CA3AF',fontStyle:'italic' }}>{sbSearch||fyFilter!=='all'?'No results':'No bills yet'}</td></tr>
              ) : filteredBills.map((b,i) => {
                const so = salesOrders.find(o=>String(o.orderId)===String(b.orderId));
                const isSel = selBill?.billId === b.billId;
                const rowBg = isSel ? '#EEF4FF' : '#fff';
                /* material items only — exclude freight/packing/other charge lines (no itemIdx) */
                const matItems = (b.items||[]).filter(it => it.itemIdx !== undefined && it.itemIdx !== null);
                const matQty = matItems.reduce((s,it)=>s+(parseFloat(it.qty)||0),0);
                const material = matItems.length
                  ? (matItems[0].itemName||matItems[0].description||'—') + (matItems.length>1?` +${matItems.length-1} more`:'')
                  : '—';
                const matRate = matItems.length ? (parseFloat(matItems[0].rate)||0) : null;
                return (
                <tr key={b.billId} style={{ background:rowBg,cursor:'pointer', outline:isSel?`2px solid ${P}`:'none', outlineOffset:'-2px' }}
                  onClick={()=>setActivityRec(b)}
                  onMouseEnter={e=>{if(!isSel)e.currentTarget.style.background='#EEF4FF';}}
                  onMouseLeave={e=>{e.currentTarget.style.background=rowBg;}}>
                  {/* # select */}
                  <td style={{ padding:'4px 5px',border:'1px solid #000',textAlign:'center',fontWeight:700,color:isSel?'#fff':'#000',background:isSel?P:'transparent',cursor:'pointer',fontSize:10 }}
                    onClick={e=>{e.stopPropagation();setSelBill(s=>s?.billId===b.billId?null:b);}}>
                    {isSel?'✓':i+1}
                  </td>
                  <td style={{ padding:'4px 5px',border:'1px solid #000',fontWeight:700,color:'#000',wordBreak:'break-all',fontSize:10.5 }}>
                    {b.billNo||<span style={{color:'#9CA3AF',fontStyle:'italic',fontWeight:400}}>Draft</span>}
                    {(b.attachments||[]).length>0 && <span style={{marginLeft:3,fontSize:9,color:'#059669'}}>📎{(b.attachments||[]).length}</span>}
                  </td>
                  <td style={{ padding:'4px 5px',border:'1px solid #000',color:'#000',whiteSpace:'nowrap',fontSize:10.5 }}>{fmtD(b.billDate)}</td>
                  <td style={{ padding:'4px 5px',border:'1px solid #000',color:'#000',fontWeight:600,wordBreak:'break-all',fontSize:10.5 }}>
                    {b.orderNo || (so?.orderNo ? so.orderNo : '—')}
                  </td>
                  <td style={{ padding:'4px 5px',border:'1px solid #000',color:'#000',whiteSpace:'nowrap',fontSize:10.5 }}>
                    {fmtD(so?.orderDate || so?.date) || '—'}
                  </td>
                  <td style={{ padding:'4px 5px',border:'1px solid #000',color:'#000',fontWeight:600,lineHeight:1.3 }}>{b.partyName}</td>
                  <td style={{ padding:'4px 5px',border:'1px solid #000',color:'#000',fontSize:10.5,wordBreak:'break-all' }}>{so?.customerPO||'—'}</td>
                  <td style={{ padding:'4px 5px',border:'1px solid #000',color:'#000',fontSize:10.5,wordBreak:'break-word' }}>{material}</td>
                  <td style={{ padding:'4px 5px',border:'1px solid #000',color:'#000',textAlign:'center',fontWeight:700 }}>{matQty||'—'}</td>
                  <td style={{ padding:'4px 5px',border:'1px solid #000',color:'#000',textAlign:'right',whiteSpace:'nowrap' }}>{matRate!==null?fmt(matRate):'—'}</td>
                  <td style={{ padding:'4px 5px',border:'1px solid #000',textAlign:'center' }}>
                    <span style={{ padding:'1px 5px',borderRadius:4,fontSize:9.5,fontWeight:700,background:b.gstType==='intrastate'?'#DCFCE7':'#EEF2FF',color:b.gstType==='intrastate'?'#133d80':'#4338CA',whiteSpace:'nowrap' }}>
                      {b.gstType==='intrastate'?'CGST+SGST':'IGST'}
                    </span>
                  </td>
                  <td style={{ padding:'4px 5px',border:'1px solid #000',color:'#000',textAlign:'right',whiteSpace:'nowrap' }}>{fmt(b.subTotal)}</td>
                  <td style={{ padding:'4px 5px',border:'1px solid #000',textAlign:'right',color:'#7C3AED',whiteSpace:'nowrap' }}>{fmt(b.totalGST)}</td>
                  <td style={{ padding:'4px 5px',border:'1px solid #000',textAlign:'right',fontWeight:700,color:'#000',whiteSpace:'nowrap' }}>{fmt(b.grandTotal)}</td>
                </tr>
              );})}
            </tbody>
            {filteredBills.length>0 && (
              <tfoot style={{ position:'sticky', bottom:0, zIndex:2 }}>
                <tr style={{ background:'#e8eef8', fontWeight:700 }}>
                  <td colSpan={11} style={{ padding:'6px 8px',border:'1px solid #000',color:'#000',fontWeight:800 }}>TOTAL ({filteredBills.length} bills{fyFilter!=='all'?` · FY ${fyFilter}`:''})</td>
                  <td style={{ padding:'6px 8px',border:'1px solid #000',color:'#000',textAlign:'right',fontWeight:800 }}>{fmt(filteredBills.reduce((s,b)=>s+(parseFloat(b.subTotal)||0),0))}</td>
                  <td style={{ padding:'6px 8px',border:'1px solid #000',textAlign:'right',color:'#7C3AED',fontWeight:800 }}>{fmt(filteredBills.reduce((s,b)=>s+(parseFloat(b.totalGST)||0),0))}</td>
                  <td style={{ padding:'6px 8px',border:'1px solid #000',textAlign:'right',color:'#000',fontWeight:800 }}>{fmt(filteredBills.reduce((s,b)=>s+(parseFloat(b.grandTotal)||0),0))}</td>
                </tr>
              </tfoot>
            )}
          </table>
          </div>{/* end scroll wrapper */}
        </div>
        );
      })()}

      {listTab==='eway' && (
        <div style={{ flex:1, minHeight:0, display:'flex', flexDirection:'column', overflow:'hidden' }}>
          <div style={{ background:'#EFF6FF', borderBottom:'1px solid #BFDBFE', padding:'7px 14px', display:'flex', alignItems:'center', gap:10, flexShrink:0 }}>
            <span style={{ fontSize:11, color:'#1E3A5F', flex:1 }}>
              <strong>E-way Bill Tracking</strong> — monitor each invoice's e-way bill validity. If the vehicle hasn't reached the delivery location yet, extend the "Valid Upto" date; once goods are received, mark it delivered.
            </span>
            {(() => {
              const today = ewayRows.filter(b => ewayOpen(b) && ewayDaysLeft(b.ewayValidUpto) === 0).length;
              return today > 0 && (
                <span style={{ fontSize:10,fontWeight:700,padding:'2px 10px',borderRadius:10,background:'#FEF3C7',color:'#92400E',border:'1px solid #FCD34D',marginRight:6,whiteSpace:'nowrap' }}>
                  ⏰ {today} Expiring Today — extend or mark delivered
                </span>
              );
            })()}
            {ewayRows.some(b => ewayOpen(b) && ewayDaysLeft(b.ewayValidUpto) < 0) && (
              <span style={{ fontSize:10,fontWeight:700,padding:'2px 10px',borderRadius:10,background:'#FEE2E2',color:'#991B1B',border:'1px solid #FCA5A5',whiteSpace:'nowrap' }}>
                ⚠ {ewayRows.filter(b => ewayOpen(b) && ewayDaysLeft(b.ewayValidUpto) < 0).length} Expired — Still In Transit
              </span>
            )}
          </div>
          {loading ? (
            <div style={{ padding:30,textAlign:'center',color:'#9CA3AF' }}>Loading…</div>
          ) : (
            /* own scroll area — the panel above clips overflow, so rows past the screen were unreachable */
            <div style={{ flex:1, minHeight:0, overflow:'auto' }}>
            <table style={{ width:'100%',borderCollapse:'collapse',fontSize:11,fontFamily:F }}>
              <thead>
                <tr>{['Sr No','Client Name','PO No','PO Date','Bill Date','Bill No','Material','Qty','Invoice Value (₹)','Way Bill No','Vehicle No','Valid Upto','Status','Actions'].map(h=>(
                  <th key={h} style={{ padding:'6px 8px',background:P,color:'#fff',fontSize:10,fontWeight:700,textAlign:'left',border:`1px solid ${PD}`,whiteSpace:'nowrap',position:'sticky',top:0,zIndex:2 }}>{h}</th>
                ))}</tr>
              </thead>
              <tbody>
                {(() => {
                  const q = sbSearch.toLowerCase();
                  const rows = q ? ewayRows.filter(b => {
                    const so = soByOrderId[String(b.orderId)];
                    const matItems = (b.items||[]).filter(it => it.itemIdx !== undefined && it.itemIdx !== null);
                    const materialText = matItems.map(it=>it.itemName||it.description||'').join(' ');
                    const hay = [
                      b.billNo, b.partyName, b.vehicleNo, b.ewayBillNo,
                      so?.customerPO, fmtD(so?.poDate), fmtD(b.billDate),
                      materialText, b.grandTotal, fmtD(b.ewayValidUpto),
                      b.ewayStatus==='delivered' ? 'delivered' : ewayDaysLeft(b.ewayValidUpto) === 0 ? 'expires today in transit' : ewayDaysLeft(b.ewayValidUpto) < 0 ? 'expired' : 'in transit',
                      b.pod?.receivedBy, b.pod?.receiverMobile, fmtD(b.pod?.deliveryDate),
                    ].filter(Boolean).join(' ').toLowerCase();
                    return hay.includes(q);
                  }) : ewayRows;
                  if (rows.length===0) return <tr><td colSpan={14} style={{ textAlign:'center',padding:30,color:'#9CA3AF',fontStyle:'italic' }}>{sbSearch?'No results':'No e-way bills recorded yet — add one from an invoice\'s E-way Bill fields.'}</td></tr>;
                  return rows.map((b,i) => {
                    const delivered = b.ewayStatus==='delivered';
                    const daysLeft  = ewayDaysLeft(b.ewayValidUpto);
                    const expired   = !delivered && daysLeft !== null && daysLeft < 0;
                    const dueToday  = !delivered && daysLeft === 0;
                    const isExtending = ewayExtendId === b.billId;
                    const busy = ewayBusyId === b.billId;
                    const so = soByOrderId[String(b.orderId)];
                    /* material items only — exclude freight/packing/other charge lines (no itemIdx) */
                    const matItems = (b.items||[]).filter(it => it.itemIdx !== undefined && it.itemIdx !== null);
                    const matQty = matItems.reduce((s,it)=>s+(parseFloat(it.qty)||0),0);
                    const material = matItems.length
                      ? (matItems[0].itemName||matItems[0].description||'—') + (matItems.length>1?` +${matItems.length-1} more`:'')
                      : '—';
                    return (
                      <tr key={b.billId} style={{ background: delivered ? '#F0FDF4' : expired ? '#FEF2F2' : dueToday ? '#FFFBEB' : i%2===0?'#fff':'#F8FAFC' }}>
                        <td style={{ padding:'5px 8px',border:'1px solid #E5EAF2',color:'#6b7280' }}>{i+1}</td>
                        <td style={{ padding:'5px 8px',border:'1px solid #E5EAF2',fontWeight:600 }}>{b.partyName||'—'}</td>
                        <td style={{ padding:'5px 8px',border:'1px solid #E5EAF2' }}>{so?.customerPO||'—'}</td>
                        <td style={{ padding:'5px 8px',border:'1px solid #E5EAF2',whiteSpace:'nowrap' }}>{fmtD(so?.poDate)}</td>
                        <td style={{ padding:'5px 8px',border:'1px solid #E5EAF2',whiteSpace:'nowrap' }}>{fmtD(b.billDate)}</td>
                        <td style={{ padding:'5px 8px',border:'1px solid #E5EAF2',fontWeight:700,color:P }}>{b.billNo||b.billId}</td>
                        <td style={{ padding:'5px 8px',border:'1px solid #E5EAF2' }}>{material}</td>
                        <td style={{ padding:'5px 8px',border:'1px solid #E5EAF2',textAlign:'center',fontWeight:700 }}>{matQty||'—'}</td>
                        <td style={{ padding:'5px 8px',border:'1px solid #E5EAF2',textAlign:'right',fontWeight:700,color:'#1e293b' }}>{fmt(b.grandTotal)}</td>
                        <td style={{ padding:'5px 8px',border:'1px solid #E5EAF2',fontFamily:'monospace',fontSize:10 }}>{b.ewayBillNo}</td>
                        <td style={{ padding:'5px 8px',border:'1px solid #E5EAF2' }}>{b.vehicleNo||'—'}</td>
                        <td style={{ padding:'5px 8px',border:'1px solid #E5EAF2',whiteSpace:'nowrap' }}>
                          {isExtending ? (
                            <input type="date" value={ewayExtendVal} onChange={e=>setEwayExtendVal(e.target.value)}
                              style={{ height:24,padding:'0 6px',border:'1px solid #9CA3AF',borderRadius:4,fontSize:11,fontFamily:F,outline:'none' }}/>
                          ) : (
                            <>
                              <span style={{ fontWeight: expired||dueToday?700:400, color: expired?'#DC2626':dueToday?'#B45309':'#111' }}>
                                {fmtD(b.ewayValidUpto) || '—'}
                              </span>
                              {dueToday && <div style={{ fontSize:9.5, fontWeight:800, color:'#B45309', marginTop:1 }}>⏰ Expiring Today</div>}
                              {expired && <div style={{ fontSize:9.5, fontWeight:800, color:'#DC2626', marginTop:1 }}>Expired {-daysLeft} day{daysLeft === -1 ? '' : 's'} ago</div>}
                            </>
                          )}
                        </td>
                        <td style={{ padding:'5px 8px',border:'1px solid #E5EAF2' }}>
                          {delivered
                            ? <div>
                                <span style={{ fontSize:10,fontWeight:700,padding:'2px 8px',borderRadius:10,background:'#DCFCE7',color:'#166534',border:'1px solid #86EFAC',whiteSpace:'nowrap' }}>✅ Delivered</span>
                                {b.pod && (
                                  <div style={{ fontSize:9.5,color:'#374151',marginTop:3,lineHeight:1.4,whiteSpace:'nowrap' }}>
                                    {fmtD(b.pod.deliveryDate)} · {b.pod.receivedBy}{b.pod.receiverMobile ? ` (${b.pod.receiverMobile})` : ''}
                                    {b.pod.fileName && <> · <a href={billFileUrl(b.billId, b.pod.fileName, cid)} target="_blank" rel="noreferrer" style={{ color:P,fontWeight:700 }}>📎 POD</a></>}
                                  </div>
                                )}
                              </div>
                            : expired
                              ? <span style={{ fontSize:10,fontWeight:700,padding:'2px 8px',borderRadius:10,background:'#FEE2E2',color:'#991B1B',border:'1px solid #FCA5A5',whiteSpace:'nowrap' }}>⚠ Expired</span>                              : <span style={{ fontSize:10,fontWeight:700,padding:'2px 8px',borderRadius:10,background:'#DBEAFE',color:'#1E40AF',border:'1px solid #93C5FD',whiteSpace:'nowrap' }}>🚚 In Transit</span>}
                        </td>
                        <td style={{ padding:'5px 8px',border:'1px solid #E5EAF2' }}>
                          <div style={{ display:'flex',gap:4 }}>
                            {isExtending ? (
                              <>
                                <button disabled={busy} onClick={()=>extendEwayValidity(b)}
                                  style={{ padding:'2px 8px',fontSize:10,cursor:busy?'wait':'pointer',background:'#ECFDF5',color:'#065F46',border:'1px solid #6EE7B7',borderRadius:4,fontFamily:F,fontWeight:700 }}>
                                  ✔ Save
                                </button>
                                <button onClick={()=>{setEwayExtendId(null);setEwayExtendVal('');}}
                                  style={{ padding:'2px 8px',fontSize:10,cursor:'pointer',background:'#F3F4F6',color:'#374151',border:'1px solid #D1D5DB',borderRadius:4,fontFamily:F }}>
                                  Cancel
                                </button>
                              </>
                            ) : !delivered ? (
                              <>
                                <button disabled={busy} onClick={()=>{setEwayExtendId(b.billId);setEwayExtendVal(b.ewayValidUpto||'');}}
                                  style={{ padding:'2px 8px',fontSize:10,cursor:busy?'wait':'pointer',background:'#EFF6FF',color:P,border:'1px solid #b3c6e8',borderRadius:4,fontFamily:F,fontWeight:700,whiteSpace:'nowrap' }}>
                                  📅 Extend
                                </button>
                                <button disabled={busy} onClick={()=>openPod(b)}
                                  style={{ padding:'2px 8px',fontSize:10,cursor:busy?'wait':'pointer',background:'#ECFDF5',color:'#065F46',border:'1px solid #6EE7B7',borderRadius:4,fontFamily:F,fontWeight:700,whiteSpace:'nowrap' }}>
                                  ✅ Mark Delivered
                                </button>
                              </>
                            ) : (
                              <>
                              <button disabled={busy} onClick={()=>openPod(b)}
                                style={{ padding:'2px 8px',fontSize:10,cursor:busy?'wait':'pointer',background:'#ECFDF5',color:'#065F46',border:'1px solid #6EE7B7',borderRadius:4,fontFamily:F,fontWeight:700,whiteSpace:'nowrap' }}>
                                {b.pod ? '✏️ POD' : '📎 Add POD'}
                              </button>
                              <button disabled={busy} onClick={()=>setEwayDelivered(b,false)}
                                style={{ padding:'2px 8px',fontSize:10,cursor:busy?'wait':'pointer',background:'#F3F4F6',color:'#374151',border:'1px solid #D1D5DB',borderRadius:4,fontFamily:F,whiteSpace:'nowrap' }}>
                                ↺ Reopen
                              </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  });
                })()}
              </tbody>
            </table>
            </div>
          )}
        </div>
      )}
    </div>
  );

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
            if (!editBill) setTimeout(()=>{ setView('list'); setListTab('bills'); setMsg(''); setSelOrder(''); setOrder(null); setBillFile(null); setEditBill(null); }, 400);
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
          <div><label style={lbl}>E-way Bill Valid Upto</label>
            <input style={inp} value={ewayValidUpto} onChange={e=>setEwayValidUpto(e.target.value)} placeholder="e.g. 10-07-2026 11:59 PM"/>
          </div>
          <div><label style={lbl}>E-way Bill Generated</label>
            <input style={inp} value={ewayGenDate} onChange={e=>setEwayGenDate(e.target.value)} placeholder="e.g. 08-07-2026 11:05 AM"/>
          </div>
          <div><label style={lbl}>Vehicle No</label>
            <input style={inp} value={vehicleNo} onChange={e=>setVehicleNo(e.target.value.toUpperCase())} placeholder="e.g. MH40CT0743"/>
          </div>
          <div><label style={lbl}>Approx Distance (KM)</label>
            <input style={inp} value={approxDistanceKm} onChange={e=>setApproxDistanceKm(e.target.value)} placeholder="e.g. 1171"/>
          </div>
          <div style={{gridColumn:'span 2'}}><label style={lbl}>Dispatch From (if different from company address)</label>
            <input style={inp} value={dispatchFrom} onChange={e=>setDispatchFrom(e.target.value)} placeholder="Actual warehouse / dispatch location"/>
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
        </div>

        <div style={{ fontSize:11,fontWeight:800,color:'#6B7280',margin:'14px 0 8px',paddingTop:10,borderTop:'1px solid #E5EAF2' }}>e-Way Bill — Extended Details (optional, for the full e-Way Bill print page)</div>
        <div style={{ display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12 }}>
          <div><label style={lbl}>Mode</label>
            <input style={inp} value={ewayMode} onChange={e=>setEwayMode(e.target.value)} placeholder="e.g. 1 - Road"/>
          </div>
          <div><label style={lbl}>Supply Type</label>
            <input style={inp} value={supplyType} onChange={e=>setSupplyType(e.target.value)} placeholder="e.g. Outward-Supply"/>
          </div>
          <div><label style={lbl}>Transaction Type</label>
            <input style={inp} value={transactionType} onChange={e=>setTransactionType(e.target.value)} placeholder="e.g. Regular"/>
          </div>
          <div><label style={lbl}>Vehicle From (City)</label>
            <input style={inp} value={vehicleFromCity} onChange={e=>setVehicleFromCity(e.target.value)} placeholder="e.g. Ahmedabad"/>
          </div>
          <div><label style={lbl}>Transporter ID</label>
            <input style={inp} value={transporterId} onChange={e=>setTransporterId(e.target.value)} placeholder="GSTIN of transporter"/>
          </div>
          <div><label style={lbl}>Transporter Name</label>
            <input style={inp} value={transporterName} onChange={e=>setTransporterName(e.target.value)} placeholder="Transporter name"/>
          </div>
          <div><label style={lbl}>CEWB No</label>
            <input style={inp} value={cewbNo} onChange={e=>setCewbNo(e.target.value)} placeholder="Consolidated e-Way Bill No"/>
          </div>
        </div>

        <div style={{ display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12,marginTop:12,paddingTop:10,borderTop:'1px solid #E5EAF2' }}>
          <div><label style={lbl}>Select Sales Order *</label>
            <select style={{ ...inp,cursor:'pointer' }} value={selOrder} onChange={e=>setSelOrder(e.target.value)}>
              <option value="">— Select Sales Order —</option>
              {salesOrders.map(o=><option key={o.orderId} value={o.orderId}>{o.orderNo||`SO-${o.orderId}`} · {o.customerName||o.clientName||'—'}</option>)}
            </select>
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
