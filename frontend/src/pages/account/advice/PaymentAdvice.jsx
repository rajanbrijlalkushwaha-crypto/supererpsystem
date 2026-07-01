import React, { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import { useCompany } from '../../../context/CompanyContext';

const F  = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const BD = '#E5EAF2';
const BG = '#F4F7FB';
const P  = '#133d80';

const fmt  = n => (parseFloat(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });
const fmtD = d => {
  if (!d) return '—';
  const dt = new Date(d);
  return isNaN(dt) ? d : `${String(dt.getDate()).padStart(2,'0')}-${String(dt.getMonth()+1).padStart(2,'0')}-${dt.getFullYear()}`;
};

/* ─────────────────────────────────────────────────────────
   Print: Receipt / Payment Advice
───────────────────────────────────────────────────────── */
async function printAdvice(entityName, entityData, orders, dueLookup, isVendor, companyData, salesBillsAll) {
  /* ── fetch company logo ── */
  let logoB64 = null;
  if (companyData?.logoFileName && companyData?.companyId) {
    try {
      const res  = await fetch(`/api/companies/logo/${encodeURIComponent(companyData.logoFileName)}?companyId=${companyData.companyId}`);
      const blob = await res.blob();
      logoB64 = await new Promise(r => { const rd = new FileReader(); rd.onload = () => r(rd.result); rd.readAsDataURL(blob); });
    } catch {}
  }
  const title = isVendor ? 'PAYMENT ADVICE' : 'RECEIPT ADVICE';
  const col4  = isVendor ? 'Payment'  : 'Receipt';
  const col5  = isVendor ? 'Purchase' : 'Sales';

  /* ── per-order calculations ── */
  const rows = orders.map((o, i) => {
    const oid    = String(o.orderId || o.id || '');
    const oNo    = o.poNo || o.poNumber || o.orderNo || o.soNo || `#${oid}`;
    const oDate  = o.poDate || o.orderDate || o.date || o.createdAt;
    const total  = parseFloat(o.grandTotal || o.amount || o.orderTotal) || 0;
    const paid   = (dueLookup[oid] || {}).paid || 0;
    const gstAmt = (o.items || []).reduce((sum, it) => {
      const base    = (parseFloat(it.qty||it.quantity)||0) * (parseFloat(it.rate)||0);
      const disc    = it.discountType === '%' ? base*(parseFloat(it.discount)||0)/100 : (parseFloat(it.discount)||0);
      const taxable = base - disc;
      return sum + taxable * (parseFloat(it.gstPercent)||0) / 100;
    }, 0);
    const withoutGst = Math.max(0, total - gstAmt);
    return { sr: i+1, date: fmtD(oDate), oNo, paid, total, gstAmt, withoutGst, oid, o };
  });

  const grandPaid       = rows.reduce((s,r) => s + r.paid,       0);
  const grandTotal      = rows.reduce((s,r) => s + r.total,      0);
  const grandGst        = rows.reduce((s,r) => s + r.gstAmt,     0);
  const grandWithoutGst = Math.max(0, grandTotal - grandGst);
  const soBalance       = Math.max(0, grandTotal - grandPaid);

  /* ── bill-based closing balance (client only) ── */
  let billBalance = soBalance;
  if (!isVendor && Array.isArray(salesBillsAll)) {
    const eName = entityName.trim().toLowerCase();
    const clientBills = salesBillsAll.filter(b =>
      (b.clientName || b.customerName || b.partyName || '').trim().toLowerCase() === eName
    );
    if (clientBills.length > 0) {
      const billTotal = clientBills.reduce((s,b) => s + (parseFloat(b.grandTotal)||0), 0);
      billBalance = Math.max(0, billTotal - grandPaid);
    }
  }

  /* ── table body ── */
  const tableRows = rows.map(r => `
    <tr>
      <td class="ctr">${r.sr}</td>
      <td class="nw">${r.date}</td>
      <td class="mono">${r.oNo}</td>
      <td class="r">${r.paid > 0 ? '₹'+fmt(r.paid) : ''}</td>
      <td class="r">₹${fmt(r.total)}</td>
      <td class="sign"></td>
    </tr>`).join('');

  /* ── scope section (vendor only) ── */
  const scopeSection = (() => {
    if (!isVendor) return '';
    const blocks = rows.map(r => {
      const o = r.o;
      const scope = [o.vendorScope, o.epsilonScope, o.clientScope, o.scopeOfWork]
        .filter(s => s && String(s).trim()).map(s => String(s).trim()).join('\n\n');
      const items   = o.items || [];
      const addOns  = (o.addOnItems || o.addOns || []).filter(it => it.itemName || it.description);
      const hasPT   = !!(o.paymentTerms || o.billingTerms);

      if (!items.length && !addOns.length && !scope && !hasPT) return '';

      const buildItemRows = (list) => list.map((it, j) => {
        const base    = (parseFloat(it.qty||it.quantity)||0) * (parseFloat(it.rate)||0);
        const disc    = it.discountType === '%' ? base*(parseFloat(it.discount)||0)/100 : (parseFloat(it.discount)||0);
        const taxable = base - disc;
        const gst     = taxable * (parseFloat(it.gstPercent)||0) / 100;
        return `<tr>
          <td>${j+1}</td><td>${it.itemName||it.description||'—'}</td>
          <td>${it.hsnCode||'—'}</td>
          <td class="r">${it.qty||it.quantity||''} ${it.unit||''}</td>
          <td class="r">₹${fmt(it.rate)}</td>
          <td class="r">${it.gstPercent||0}%</td>
          <td class="r">₹${fmt(taxable+gst)}</td>
        </tr>`;
      }).join('');

      const itemsHtml = items.length ? `
        <div class="sect-lbl">Items</div>
        <table class="items-tbl"><thead><tr>
          <th>#</th><th>Item / Description</th><th>HSN</th>
          <th class="r">Qty</th><th class="r">Rate</th><th class="r">GST%</th><th class="r">Amount</th>
        </tr></thead><tbody>${buildItemRows(items)}</tbody></table>` : '';

      const addOnsHtml = addOns.length ? `
        <div class="sect-lbl">Add-on Items</div>
        <table class="items-tbl"><thead><tr>
          <th>#</th><th>Item / Description</th><th>HSN</th>
          <th class="r">Qty</th><th class="r">Rate</th><th class="r">GST%</th><th class="r">Amount</th>
        </tr></thead><tbody>${buildItemRows(addOns)}</tbody></table>` : '';

      const scopeHtml = scope
        ? `<div class="scope-text"><strong>Scope of Work:</strong><br>${scope.replace(/\n/g,'<br>')}</div>` : '';
      const ptHtml = hasPT
        ? `<div class="scope-text"><strong>Payment Terms:</strong> ${o.paymentTerms||o.billingTerms}</div>` : '';

      return `
        <div class="scope-block">
          <div class="scope-head">
            PO ${o.poNo||o.poNumber||o.orderNo||`#${r.oid}`}
            &nbsp;·&nbsp;${fmtD(o.poDate||o.orderDate||o.date)}
            &nbsp;·&nbsp;${o.vendorName||'—'}
            &nbsp;·&nbsp;<strong>₹${fmt(r.total)}</strong>
          </div>
          ${itemsHtml}${addOnsHtml}${scopeHtml}${ptHtml}
        </div>`;
    }).filter(Boolean).join('');

    return blocks ? `<div class="scope-title">ORDER DETAILS &amp; SCOPE OF WORK</div>${blocks}` : '';
  })();

  /* ── helpers ── */
  const printDate = new Date().toLocaleDateString('en-IN', { day:'2-digit', month:'2-digit', year:'numeric' });
  const now       = new Date();
  const fy        = now.getMonth() >= 3 ? `${String(now.getFullYear()).slice(2)}-${String(now.getFullYear()+1).slice(2)}` : `${String(now.getFullYear()-1).slice(2)}-${String(now.getFullYear()).slice(2)}`;
  const raNo      = `RA/${fy}/${String(orders.length > 0 ? (orders[0].orderId||0) : Date.now()).slice(-4).padStart(4,'0')}`;

  const coName    = companyData?.companyName || 'Epsilon Enterprise';
  const coAddr1   = companyData?.address || '';
  const coCity    = [companyData?.city, companyData?.state, companyData?.pincode].filter(Boolean).join(', ');
  const coGstin   = companyData?.gstin || '';
  const coPhone   = companyData?.phone || '';
  const coEmail   = companyData?.email || '';
  const coWeb     = companyData?.website || '';
  const logoTag   = logoB64
    ? `<img src="${logoB64}" style="height:64px;max-width:80px;object-fit:contain;display:block;">`
    : `<div style="font-size:26pt;font-weight:900;color:#133d80;">ε</div>`;

  /* ── primary order (first order for detail fields) ── */
  const o0        = orders[0] || {};
  const o0No      = o0.orderNo || o0.soNo || `SO-${o0.orderId||''}`;
  const o0Date    = fmtD(o0.orderDate || o0.date || '');
  const o0Del     = fmtD(o0.deliveryDate || '');
  const o0PT      = o0.paymentTerms || '—';

  /* ── client bills for this entity ── */
  const eName     = entityName.trim().toLowerCase();
  const clientBills = (!isVendor && Array.isArray(salesBillsAll))
    ? salesBillsAll.filter(b => (b.clientName||b.customerName||b.partyName||'').trim().toLowerCase() === eName)
    : [];
  const salesInvNo = clientBills.length > 0 ? clientBills.map(b=>b.billNo||'').filter(Boolean).join(', ') : '—';

  /* ── all items across orders ── */
  const allItems  = orders.flatMap(o => (o.items||[]).map(it=>({...it, _oNo: o.orderNo||`SO-${o.orderId}`})));
  const totalTaxable = allItems.reduce((s,it)=>{
    const b=(parseFloat(it.qty||it.quantity)||0)*(parseFloat(it.rate)||0);
    const d=it.discountType==='%'?b*(parseFloat(it.discount)||0)/100:(parseFloat(it.discount)||0);
    return s+(b-d);
  }, 0);
  const totalCharges = orders.reduce((s,o)=>{
    return s + (o.charges||[]).reduce((cs,c)=>cs+(parseFloat(c.amount)||0),0);
  }, 0);

  /* ── scope items ── */
  const allScope  = orders.flatMap(o => (o.scopeItems || o.poScopeItems || []).filter(s=>s.activity||s.scopeItem));

  /* ── reconciliation rows: receipts + bills ── */
  const receiptRows = [];
  orders.forEach(o => {
    const oid = String(o.orderId||o.id||'');
    const lp  = (dueLookup[oid]||{}).linkedPayments || [];
    lp.forEach(p => {
      receiptRows.push({ date: fmtD(p.date||p.createdAt), narration: `Payment – ${p.paymentMode||'Bank Transfer'}`, receipt: parseFloat(p.amount)||0, sales: 0 });
    });
  });
  clientBills.forEach(b => {
    receiptRows.push({ date: fmtD(b.billDate||b.createdAt), narration: `Sales Bill: ${b.billNo||b.billId}`, receipt: 0, sales: parseFloat(b.grandTotal)||0 });
  });
  if (!receiptRows.length) {
    receiptRows.push({ date: printDate, narration: `${isVendor?'Purchase':'Sales'} Order Total`, receipt: grandPaid, sales: grandTotal });
  }
  let runBal = 0;
  receiptRows.forEach(r => { runBal += r.sales - r.receipt; r.balance = runBal; });
  const recTotal    = receiptRows.reduce((s,r)=>s+r.receipt, 0);
  const salesTotal  = receiptRows.reduce((s,r)=>s+r.sales,   0);
  const finalBal    = receiptRows.length ? receiptRows[receiptRows.length-1].balance : soBalance;

  /* ── amount in words ── */
  const ones=['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'];
  const tens=['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
  function numWords(n) {
    if (n===0) return 'Zero';
    let s='';
    if(n>=10000000){s+=ones[Math.floor(n/10000000)]+' Crore ';n%=10000000;}
    if(n>=100000){s+=ones[Math.floor(n/100000)]+' Lakh ';n%=100000;}
    if(n>=1000){const h=Math.floor(n/1000);s+=(h<20?ones[h]:tens[Math.floor(h/10)]+(h%10?(' '+ones[h%10]):''))+' Thousand ';n%=1000;}
    if(n>=100){s+=ones[Math.floor(n/100)]+' Hundred ';n%=100;}
    if(n>=20){s+=tens[Math.floor(n/10)]+' ';n%=10;}
    if(n>0){s+=ones[n];}
    return s.trim();
  }
  const amtWords = (() => {
    const n = Math.round(grandTotal); const p = Math.round((grandTotal-Math.floor(grandTotal))*100);
    return 'INR ' + numWords(Math.floor(n)) + (p>0?' and '+numWords(p)+' Paise':'')+' Only';
  })();

  const T = (s) => `<td style="padding:5px 8px;border:1px solid #d1d9ed;font-size:9pt;">${s}</td>`;
  const TH= (s,a='left') => `<th style="padding:6px 8px;background:#133d80;color:#fff;font-size:9pt;font-weight:700;text-align:${a};border:1px solid #0d2d6b;">${s}</th>`;
  const LR= (l,v) => `<tr><td style="padding:3px 6px;font-size:8.5pt;color:#555;width:42%">${l}</td><td style="padding:3px 6px;font-size:8.5pt;width:2%">:</td><td style="padding:3px 6px;font-size:8.5pt;font-weight:600;color:#1a1a1a">${v||'—'}</td></tr>`;

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>${title} — ${entityName}</title>
<style>
  @page{size:A4 portrait;margin:8mm;}
  *{box-sizing:border-box;margin:0;padding:0;}
  body{font-family:'Arial',sans-serif;font-size:9pt;color:#1a1a1a;background:#fff;
       -webkit-print-color-adjust:exact;print-color-adjust:exact;}
  .page{width:100%;background:#fff;border:2px solid #133d80;}

  /* header */
  .hdr{display:flex;align-items:center;justify-content:space-between;padding:10px 14px 8px;border-bottom:2px solid #133d80;}
  .hdr-logo{width:70px;text-align:center;}
  .hdr-co{flex:1;text-align:center;padding:0 10px;}
  .hdr-co .coname{font-size:18pt;font-weight:900;color:#133d80;letter-spacing:-0.3px;}
  .hdr-co .coaddr{font-size:8pt;color:#444;margin-top:3px;line-height:1.6;}
  .hdr-co .cometa{font-size:8pt;color:#444;margin-top:2px;display:flex;justify-content:center;gap:14px;flex-wrap:wrap;}
  .hdr-co .cometa span{display:flex;align-items:center;gap:3px;}

  /* title band */
  .title-band{display:flex;align-items:stretch;border-bottom:2px solid #133d80;}
  .title-lbl{background:#133d80;color:#fff;font-size:13pt;font-weight:900;letter-spacing:2px;
             padding:8px 18px;display:flex;align-items:center;text-transform:uppercase;min-width:200px;}
  .title-meta{flex:1;display:flex;border-left:2px solid #133d80;}
  .title-meta-cell{flex:1;padding:6px 12px;border-right:1px solid #d1d9ed;text-align:center;}
  .title-meta-cell:last-child{border-right:none;}
  .tml{font-size:7pt;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;font-weight:700;margin-bottom:2px;}
  .tmv{font-size:9.5pt;font-weight:800;color:#133d80;}

  /* info grid */
  .info-grid{display:grid;grid-template-columns:1fr 1fr 1fr;border-bottom:2px solid #133d80;}
  .info-panel{padding:8px 10px;border-right:1px solid #d1d9ed;}
  .info-panel:last-child{border-right:none;}
  .info-hdr{font-size:8pt;font-weight:800;color:#fff;background:#133d80;
            text-align:center;padding:4px 8px;margin:-8px -10px 6px;letter-spacing:0.5px;text-transform:uppercase;}
  .info-tbl{width:100%;border-collapse:collapse;}
  .info-tbl td{padding:2.5px 4px;font-size:8pt;vertical-align:top;}
  .info-sub-hdr{font-size:8pt;font-weight:800;color:#133d80;margin:6px 0 3px;padding-bottom:2px;border-bottom:1px solid #d1d9ed;}
  .addr-name{font-size:9pt;font-weight:800;color:#1a1a1a;margin-bottom:3px;}
  .addr-line{font-size:8pt;color:#444;line-height:1.6;}

  /* section title */
  .sec-title{font-size:9pt;font-weight:800;color:#fff;background:#133d80;text-align:center;
             padding:5px;letter-spacing:0.8px;text-transform:uppercase;margin-bottom:0;}

  /* tables */
  .tbl{width:100%;border-collapse:collapse;}
  .tbl th{padding:6px 8px;background:#133d80;color:#fff;font-size:8.5pt;font-weight:700;
          border:1px solid #0d2d6b;text-align:center;white-space:nowrap;}
  .tbl th.l{text-align:left;}
  .tbl th.r{text-align:right;}
  .tbl td{padding:5px 8px;border:1px solid #d1d9ed;font-size:8.5pt;vertical-align:middle;}
  .tbl tr:nth-child(even) td{background:#f7f9fc;}
  .tbl td.c{text-align:center;}
  .tbl td.r{text-align:right;}
  .tbl td.b{font-weight:700;}

  /* totals right panel */
  .totals-right{margin-left:auto;width:46%;border-collapse:collapse;}
  .totals-right td{padding:4px 10px;border:1px solid #d1d9ed;font-size:8.5pt;}
  .totals-right .tot-lbl{color:#444;}
  .totals-right .tot-val{text-align:right;font-weight:600;}
  .grand-row td{background:#133d80!important;color:#fff!important;font-weight:800!important;font-size:10pt!important;}

  /* closing balance */
  .cl-bal-row{display:flex;border:1px solid #d1d9ed;border-top:none;}
  .cl-bal-cell{flex:1;padding:6px 12px;text-align:center;border-right:1px solid #d1d9ed;}
  .cl-bal-cell:last-child{border-right:none;}
  .cl-bal-lbl{font-size:8pt;color:#374151;font-weight:600;}
  .cl-bal-val{font-size:11pt;font-weight:800;}

  /* signature */
  .sig-section{display:grid;grid-template-columns:1fr 1fr 1fr;border-top:2px solid #133d80;padding:10px 14px 6px;}
  .sig-col{text-align:center;}
  .sig-title{font-size:9pt;font-weight:700;color:#133d80;margin-bottom:4px;}
  .sig-area{height:36px;border-bottom:1px solid #555;margin:0 10px 4px;}
  .sig-name{font-size:8pt;color:#444;}

  /* footer */
  .footer-strip{background:#133d80;color:#fff;display:flex;justify-content:space-between;align-items:center;
                padding:5px 14px;font-size:8pt;}

  .sec-wrap{border:1px solid #d1d9ed;margin-bottom:0;}
  @media print{.page{border:2px solid #133d80;}}
</style></head><body>
<div class="page">

<!-- ═══ HEADER ═══ -->
<div class="hdr">
  <div class="hdr-logo">${logoTag}</div>
  <div class="hdr-co">
    <div class="coname">M/s. ${coName}</div>
    <div class="coaddr">${coAddr1}${coAddr1&&coCity?', ':''}${coCity}</div>
    <div class="cometa">
      ${coGstin?`<span>⊕ GSTIN: ${coGstin}</span>`:''}
      ${coPhone?`<span>📞 Ph: ${coPhone}</span>`:''}
      ${coEmail?`<span>✉ Email: ${coEmail}</span>`:''}
    </div>
  </div>
  <div style="width:70px"></div>
</div>

<!-- ═══ TITLE BAND ═══ -->
<div class="title-band">
  <div class="title-lbl">${title}</div>
  <div class="title-meta">
    <div class="title-meta-cell"><div class="tml">${title} No.</div><div class="tmv">${raNo}</div></div>
    <div class="title-meta-cell"><div class="tml">Issue Date</div><div class="tmv">${printDate}</div></div>
    <div class="title-meta-cell"><div class="tml">Revision No.</div><div class="tmv">0</div></div>
  </div>
</div>

<!-- ═══ INFO GRID ═══ -->
<div class="info-grid">

  <!-- Customer Info -->
  <div class="info-panel">
    <div class="info-hdr">Customer Information</div>
    <table class="info-tbl">
      ${LR('Client ID',        entityData?.clientId||entityData?.vendorId||'—')}
      ${LR('Client Name',      entityName)}
      ${LR('Business Type',    entityData?.businessType||'—')}
      ${LR('Industry Type',    entityData?.industryType||'—')}
      ${LR('Category',         entityData?.category||'Regular')}
      ${LR('TDS Applicable',   entityData?.tdsApplicable||'—')}
    </table>
    <div style="border-top:1px solid #d1d9ed;margin:4px 0;"></div>
    <table class="info-tbl">
      ${LR('PAN No',           entityData?.pan||'—')}
      ${LR('GSTIN No',         entityData?.gstin||'—')}
      ${LR('CIN No',           entityData?.cin||'—')}
      ${LR('MSME',             entityData?.msme||'—')}
      ${LR('GST Type',         entityData?.gstType||'Regular')}
      ${LR('GST Registered',   entityData?.gstin?'Yes':'—')}
    </table>
  </div>

  <!-- Order Info + Contact -->
  <div class="info-panel">
    <div class="info-hdr">Order Information</div>
    <table class="info-tbl">
      ${LR('ERP No',           o0.orderId||'—')}
      ${LR('Order No',         o0No)}
      ${LR('Order Date',       o0Date)}
      ${LR('Order Type',       o0.orderType||'—')}
      ${LR('Delivery Date',    o0Del)}
      ${LR('Payment Terms',    o0PT)}
      ${LR('Sales Invoice No', salesInvNo)}
    </table>
    <div class="info-sub-hdr" style="margin-top:8px;">Contact Person</div>
    <table class="info-tbl">
      ${LR('Contact Person',   o0.contactPerson||entityData?.contactPerson||'—')}
      ${LR('Mobile',           o0.mobile||entityData?.mobile||'—')}
      ${LR('Alt. Mobile',      o0.mobile2||entityData?.altMobile||'—')}
      ${LR('Email',            o0.email||entityData?.email||'—')}
    </table>
  </div>

  <!-- Address Details -->
  <div class="info-panel">
    <div class="info-hdr">Address Details</div>
    <div class="info-sub-hdr">Billing Address</div>
    <div class="addr-name">${coName}</div>
    <div class="addr-line">
      ${coAddr1}<br>${coCity}
    </div>
    <div class="info-sub-hdr" style="margin-top:8px;">Shipping Address</div>
    <div class="addr-line">
      ${o0.shipToName&&o0.shipToName!==entityName?'<strong>'+o0.shipToName+'</strong><br>':''}
      ${o0.shipToAddress||o0.deliveryAddr||entityData?.address||'—'}<br>
      ${[o0.shipToCity||entityData?.city, o0.shipToPincode].filter(Boolean).join(' – ')&&`City &nbsp;: ${o0.shipToCity||entityData?.city||'—'}`}<br>
      State &nbsp;: ${o0.shipToState||entityData?.state||'—'}<br>
      Pincode : ${o0.shipToPincode||entityData?.pincode||'—'}
    </div>
  </div>

</div><!-- /info-grid -->

<!-- ═══ ITEM DETAILS ═══ -->
<div class="sec-wrap" style="margin-bottom:0">
  <div class="sec-title">Item Details</div>
  <table class="tbl">
    <thead><tr>
      <th style="width:36px">Sr. No.</th>
      <th class="l">Item Code</th>
      <th class="l">Item Name</th>
      <th class="l">Additional Description</th>
      <th>HSN Code</th>
      <th>Qty</th>
      <th>UoM</th>
      <th class="r">Rate (₹)</th>
      <th class="r">Taxable Value (₹)</th>
    </tr></thead>
    <tbody>
      ${allItems.map((it,i)=>{
        const b=(parseFloat(it.qty||it.quantity)||0)*(parseFloat(it.rate)||0);
        const d=it.discountType==='%'?b*(parseFloat(it.discount)||0)/100:(parseFloat(it.discount)||0);
        const tv=b-d;
        return `<tr>
          ${T(i+1)}
          ${T(it.itemCode||it.code||'—')}
          ${T(it.itemName||'—')}
          ${T(it.description||it.itemName||'—')}
          ${T('<span style="text-align:center;display:block">'+(it.hsnCode||it.hsn||'—')+'</span>')}
          ${T('<span style="text-align:center;display:block">'+(it.qty||it.quantity||'—')+'</span>')}
          ${T('<span style="text-align:center;display:block">'+(it.unit||it.uom||'NOS')+'</span>')}
          ${T('<span style="text-align:right;display:block">'+fmt(it.rate)+'</span>')}
          ${T('<span style="text-align:right;display:block;font-weight:600">'+fmt(tv)+'</span>')}
        </tr>`;
      }).join('')}
    </tbody>
  </table>

  <!-- Totals right-side -->
  <div style="display:flex;justify-content:space-between;align-items:flex-start;padding:6px 10px;border-top:1px solid #d1d9ed;">
    <div style="font-size:8.5pt;color:#374151;max-width:55%;padding-top:2px;">
      <strong>Amount in Words:</strong>&nbsp; ${amtWords}
    </div>
    <table class="totals-right">
      <tr><td class="tot-lbl">Total Taxable Value</td><td class="tot-val">₹ ${fmt(totalTaxable)}</td></tr>
      <tr><td class="tot-lbl">Add: All Additional Charges</td><td class="tot-val">₹ ${fmt(totalCharges)}</td></tr>
      <tr><td class="tot-lbl">GST Amount (${allItems.length>0?(allItems[0].gstPercent||allItems[0].gst||18)+'%':''})</td><td class="tot-val">₹ ${fmt(grandGst)}</td></tr>
      <tr class="grand-row"><td>TOTAL ORDER VALUE</td><td style="text-align:right">₹ ${fmt(grandTotal)}</td></tr>
    </table>
  </div>
</div>

<!-- ═══ SCOPE OF WORK ═══ -->
${allScope.length > 0 ? `
<div class="sec-wrap" style="border-top:2px solid #133d80;margin-bottom:0">
  <div class="sec-title">Scope of Work</div>
  <table class="tbl">
    <thead><tr>
      <th style="width:36px">Sr. No.</th>
      <th class="l">Scope Item / Activity</th>
      <th>Client</th>
      <th>${coName} (Our Scope)</th>
      <th>Vendor</th>
      <th>Remarks</th>
    </tr></thead>
    <tbody>
      ${allScope.map((s,i)=>`<tr>
        ${T(i+1)}
        ${T(s.activity||s.scopeItem||'—')}
        ${T(`<div style="text-align:center">${s.client?'<span style="color:#059669;font-size:12pt">✔</span>':'—'}</div>`)}
        ${T(`<div style="text-align:center">${s.epsilon||s.ourScope?'<span style="color:#059669;font-size:12pt">✔</span>':'—'}</div>`)}
        ${T(`<div style="text-align:center">${s.vendor?'<span style="color:#059669;font-size:12pt">✔</span>':'—'}</div>`)}
        ${T(s.remarks||'—')}
      </tr>`).join('')}
    </tbody>
  </table>
</div>` : ''}

<!-- ═══ RECEIPT & SALES RECONCILIATION ═══ -->
<div class="sec-wrap" style="border-top:2px solid #133d80;margin-bottom:0">
  <div class="sec-title">Receipt &amp; Sales Reconciliation</div>
  <table class="tbl">
    <thead><tr>
      <th style="width:36px">Sr. No.</th>
      <th>Date</th>
      <th class="l">Narration</th>
      <th class="r">Receipt (₹)</th>
      <th class="r">Sales (₹)</th>
      <th class="r">Balance (₹)</th>
    </tr></thead>
    <tbody>
      ${receiptRows.map((r,i)=>`<tr>
        ${T('<span style="text-align:center;display:block">'+(i+1)+'</span>')}
        ${T(r.date)}
        ${T(r.narration)}
        ${T('<span style="text-align:right;display:block">'+(r.receipt>0?fmt(r.receipt):'—')+'</span>')}
        ${T('<span style="text-align:right;display:block">'+(r.sales>0?fmt(r.sales):'—')+'</span>')}
        ${T('<span style="text-align:right;display:block;font-weight:700;color:'+(r.balance>0?'#dc2626':'#059669')+'">'+(r.balance===0?'0.00':fmt(Math.abs(r.balance)))+'</span>')}
      </tr>`).join('')}
    </tbody>
    <tfoot>
      <tr style="background:#e8eef8">
        <td colspan="3" style="padding:5px 8px;font-size:9pt;font-weight:800;text-align:right;border:1px solid #d1d9ed;">TOTAL</td>
        <td style="padding:5px 8px;font-size:9.5pt;font-weight:800;text-align:right;border:1px solid #d1d9ed;">₹ ${fmt(recTotal)}</td>
        <td style="padding:5px 8px;font-size:9.5pt;font-weight:800;text-align:right;border:1px solid #d1d9ed;">₹ ${fmt(salesTotal)}</td>
        <td style="padding:5px 8px;font-size:9.5pt;font-weight:800;text-align:right;border:1px solid #d1d9ed;color:${finalBal===0?'#059669':'#dc2626'}">₹ ${fmt(Math.abs(finalBal))}</td>
      </tr>
    </tfoot>
  </table>
  <!-- Closing balances -->
  <div class="cl-bal-row">
    <div class="cl-bal-cell">
      <div class="cl-bal-lbl">Closing Balance as per Sales Order</div>
      <div class="cl-bal-val" style="color:${soBalance===0?'#059669':'#dc2626'}">₹ ${fmt(soBalance)}</div>
    </div>
    <div class="cl-bal-cell">
      <div class="cl-bal-lbl">Closing Balance as per Sales</div>
      <div class="cl-bal-val" style="color:${billBalance===0?'#059669':'#dc2626'}">₹ ${fmt(billBalance)}</div>
    </div>
  </div>
</div>

<!-- ═══ SIGNATURE SECTION ═══ -->
<div class="sig-section">
  <div class="sig-col">
    <div class="sig-title">Prepared By</div>
    <div class="sig-area"></div>
    <div class="sig-name">Name: _________________</div>
    <div class="sig-name">Date: ${printDate}</div>
  </div>
  <div class="sig-col">
    <div class="sig-title">Verified By</div>
    <div class="sig-area"></div>
    <div class="sig-name">Name: _________________</div>
    <div class="sig-name">Date: _________________</div>
  </div>
  <div class="sig-col">
    <div class="sig-title">Authorised By</div>
    <div class="sig-area"></div>
    <div class="sig-name">Name: _________________</div>
    <div class="sig-name">Date: _________________</div>
  </div>
</div>

<!-- ═══ FOOTER ═══ -->
<div class="footer-strip">
  <span>This is a system generated document.</span>
  <span>Thank you for your business!</span>
  <span>${coWeb||coEmail||'www.epsilonprefab.org'}</span>
</div>

</div><!-- /page -->
<script>window.onload=()=>setTimeout(()=>window.print(),500);<\/script>
</body></html>`;

  const w = window.open('', '_blank', 'width=900,height=1200,scrollbars=yes');
  if (!w) { alert('Allow pop-ups to print.'); return; }
  w.document.write(html);
  w.document.close();
}

/* ─────────────────────────────────────────────────────────
   Main Component
───────────────────────────────────────────────────────── */
export default function PaymentAdvice() {
  const { selectedCompany } = useCompany();
  const cid = selectedCompany?.companyId;

  const [tab,        setTab]       = useState('vendor');
  const [pos,        setPOs]       = useState([]);
  const [sos,        setSOs]       = useState([]);
  const [salesBills, setSalesBills] = useState([]);
  const [dueLookup,  setDueLookup] = useState({});
  const [vendors,    setVendors]   = useState([]);
  const [clients,    setClients]   = useState([]);
  const [search,     setSearch]    = useState('');
  const [selName,    setSelName]   = useState('');
  const [loading,    setLoading]   = useState(false);
  const [msg,        setMsg]       = useState('');

  const fetchAll = useCallback(async () => {
    if (!cid) return;
    setLoading(true); setMsg('');
    try {
      const [poRes, soRes, duesRes, vRes, cRes, sbRes] = await Promise.all([
        axios.get(`/api/purchase-orders?companyId=${cid}`),
        axios.get(`/api/sales-orders?companyId=${cid}`),
        axios.get(`/api/accounts/dues?companyId=${cid}`),
        axios.get(`/api/vendors?companyId=${cid}`),
        axios.get(`/api/clients?companyId=${cid}`),
        axios.get(`/api/bills?companyId=${cid}&type=sales`).catch(() => ({ data: [] })),
      ]);
      setPOs(poRes.data || []);
      setSOs(soRes.data || []);
      setSalesBills(sbRes.data || []);

      const d = duesRes.data || {};
      const lookup = {};
      (d.vendorDues || []).forEach(due => {
        lookup[String(due.orderId)] = { paid: due.paid || 0, linkedPayments: due.linkedPayments || [] };
      });
      (d.clientDues || []).forEach(due => {
        lookup[String(due.orderId)] = { paid: due.received || 0, linkedPayments: due.linkedPayments || [] };
      });
      setDueLookup(lookup);
      setVendors(vRes.data || []);
      setClients(cRes.data || []);
    } catch (e) { setMsg('Error loading data: ' + e.message); }
    finally { setLoading(false); }
  }, [cid]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const vendorGroups = useMemo(() => {
    const map = {};
    pos.forEach(o => {
      const name = (o.vendorName || '').trim();
      if (!name) return;
      if (!map[name]) map[name] = { name, orders: [], totalValue: 0 };
      map[name].orders.push(o);
      map[name].totalValue += parseFloat(o.grandTotal || o.amount) || 0;
    });
    return Object.values(map).sort((a, b) => a.name.localeCompare(b.name));
  }, [pos]);

  const clientGroups = useMemo(() => {
    const map = {};
    sos.forEach(o => {
      const name = (o.customerName || o.clientName || o.party || '').trim();
      if (!name) return;
      if (!map[name]) map[name] = { name, orders: [], totalValue: 0 };
      map[name].orders.push(o);
      map[name].totalValue += parseFloat(o.grandTotal || o.amount) || 0;
    });
    return Object.values(map).sort((a, b) => a.name.localeCompare(b.name));
  }, [sos]);

  const groups   = tab === 'vendor' ? vendorGroups : clientGroups;
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return groups;
    return groups.filter(g =>
      g.name.toLowerCase().includes(q) ||
      g.orders.some(o => {
        const no = (o.poNo || o.poNumber || o.orderNo || o.soNo || String(o.orderId || o.id || '')).toLowerCase();
        return no.includes(q);
      })
    );
  }, [groups, search]);

  const selGroup = filtered.find(g => g.name === selName) || null;

  const entityDetail = useMemo(() => {
    if (!selName) return null;
    if (tab === 'vendor') {
      const v = vendors.find(v => (v.vendorName || v.companyName || '').trim() === selName);
      if (!v) return null;
      return { gstin: v.gstin || v.vendorGstin, address: v.address, city: v.city, state: v.state, mobile: v.mobile || v.phone };
    } else {
      const c = clients.find(c => (c.companyName || c.name || '').trim() === selName);
      if (!c) return null;
      return { gstin: c.gstin, address: c.address, city: c.city, state: c.state, mobile: c.mobile || c.phone };
    }
  }, [selName, tab, vendors, clients]);

  const handlePrint = () => {
    if (!selGroup) return;
    printAdvice(selName, entityDetail, selGroup.orders, dueLookup, tab === 'vendor', selectedCompany, salesBills);
  };

  const paidFor = o => (dueLookup[String(o.orderId || o.id || '')] || {}).paid || 0;

  const tabSt = active => ({
    padding: '6px 18px', fontSize: 12, fontWeight: active ? 700 : 500,
    fontFamily: F, cursor: 'pointer', border: 'none', background: active ? '#fff' : 'transparent',
    color: active ? P : '#6B7280', borderBottom: active ? `2px solid ${P}` : '2px solid transparent',
    marginBottom: -2, position: 'relative', zIndex: active ? 1 : 0,
  });

  const isVendorTab = tab === 'vendor';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: BG, fontFamily: F }}>

      {/* Header */}
      <div style={{ flexShrink: 0, background: '#fff', borderBottom: `2px solid ${BD}`,
        padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontWeight: 800, fontSize: 13, color: '#1E293B' }}>
          {isVendorTab ? 'Payment Advice' : 'Receipt Advice'}
        </span>
        <div style={{ flex: 1 }} />
        <button onClick={fetchAll} style={{ height: 28, padding: '0 12px', fontSize: 11, fontWeight: 600,
          background: '#EEF4FF', border: `1px solid ${BD}`, color: P, borderRadius: 5,
          cursor: 'pointer', fontFamily: F }}>
          ↻ Refresh
        </button>
      </div>

      {/* Tabs */}
      <div style={{ flexShrink: 0, background: '#fff', borderBottom: `2px solid ${BD}`,
        padding: '0 14px', display: 'flex' }}>
        <button style={tabSt(isVendorTab)}
          onClick={() => { setTab('vendor'); setSelName(''); setSearch(''); }}>
          📤 Payables (Vendors)
        </button>
        <button style={tabSt(!isVendorTab)}
          onClick={() => { setTab('client'); setSelName(''); setSearch(''); }}>
          📥 Receivables (Clients)
        </button>
      </div>

      {msg && (
        <div style={{ flexShrink: 0, background: '#ffe0e0', borderBottom: '1px solid #cc4444',
          color: '#880000', padding: '5px 14px', fontSize: 11 }}>{msg}</div>
      )}

      {loading ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#888', fontSize: 12 }}>Loading…</div>
      ) : (
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

          {/* Left: entity list */}
          <div style={{ width: 280, flexShrink: 0, borderRight: `2px solid ${BD}`,
            display: 'flex', flexDirection: 'column', background: '#fff' }}>

            <div style={{ padding: '8px 10px', borderBottom: `1px solid ${BD}`, flexShrink: 0 }}>
              <input
                value={search}
                onChange={e => { setSearch(e.target.value); setSelName(''); }}
                placeholder={`Search ${isVendorTab ? 'vendor' : 'client'} / order no…`}
                style={{ width: '100%', height: 30, borderRadius: 5, border: `1px solid ${BD}`,
                  padding: '0 8px', fontSize: 11.5, fontFamily: F, boxSizing: 'border-box', outline: 'none' }}
              />
            </div>

            <div style={{ flex: 1, overflowY: 'auto' }}>
              {filtered.length === 0 ? (
                <div style={{ padding: 16, color: '#888', fontSize: 11, textAlign: 'center' }}>
                  No {isVendorTab ? 'vendors' : 'clients'} found
                </div>
              ) : filtered.map(g => {
                const isSel = g.name === selName;
                return (
                  <div key={g.name} onClick={() => setSelName(isSel ? '' : g.name)}
                    style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: `1px solid ${BD}`,
                      background: isSel ? '#EFF6FF' : 'transparent',
                      borderLeft: isSel ? `3px solid ${P}` : '3px solid transparent',
                      transition: 'all 0.12s' }}>
                    <div style={{ fontWeight: 700, fontSize: 12, color: isSel ? P : '#1E293B',
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {g.name}
                    </div>
                    <div style={{ fontSize: 10.5, color: '#6B7280', marginTop: 2 }}>
                      {g.orders.length} order{g.orders.length !== 1 ? 's' : ''} &nbsp;·&nbsp; ₹{fmt(g.totalValue)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right: orders for selected entity */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {!selGroup ? (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#AAB4C6', fontSize: 12 }}>
                ← Select a {isVendorTab ? 'vendor' : 'client'} to view their orders
              </div>
            ) : (
              <>
                {/* Entity header + print */}
                <div style={{ flexShrink: 0, padding: '8px 14px', background: '#fff',
                  borderBottom: `2px solid ${BD}`, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 800, fontSize: 13, color: '#1E293B' }}>{selName}</div>
                    <div style={{ fontSize: 10.5, color: '#6B7280' }}>
                      {selGroup.orders.length} order{selGroup.orders.length !== 1 ? 's' : ''}
                      &nbsp;·&nbsp; Total: ₹{fmt(selGroup.totalValue)}
                    </div>
                  </div>
                  <button onClick={handlePrint}
                    style={{ height: 32, padding: '0 16px', fontSize: 12, fontWeight: 700,
                      background: P, color: '#fff', border: 'none', borderRadius: 5,
                      cursor: 'pointer', fontFamily: F }}>
                    🖨 Print {isVendorTab ? 'Payment' : 'Receipt'} Advice
                  </button>
                </div>

                {/* Orders table */}
                <div style={{ flex: 1, overflow: 'auto', padding: '8px 14px' }}>
                  <table style={{ width: '100%', minWidth: 700, borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: '#133d80', position: 'sticky', top: 0, zIndex: 2 }}>
                        {[
                          { h: 'Sr No', w: 40 },
                          { h: 'Date',  w: 90 },
                          { h: isVendorTab ? 'PO No' : 'SO No', w: 110 },
                          { h: 'Narration', w: 0 },
                          { h: isVendorTab ? 'Payment' : 'Receipt', w: 110, r: true },
                          { h: isVendorTab ? 'Purchase' : 'Sales',  w: 110, r: true },
                        ].map(col => (
                          <th key={col.h} style={{
                            padding: '6px 10px', fontWeight: 700, fontSize: 11, color: '#fff',
                            border: '1px solid #0d2d6b', textAlign: col.r ? 'right' : 'left',
                            whiteSpace: 'nowrap', width: col.w || undefined,
                          }}>{col.h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {selGroup.orders.map((o, i) => {
                        const oid   = o.orderId || o.id;
                        const oNo   = o.poNo || o.poNumber || o.orderNo || o.soNo || `#${oid}`;
                        const oDate = o.poDate || o.orderDate || o.date || o.createdAt;
                        const total = parseFloat(o.grandTotal || o.amount) || 0;
                        const paid  = paidFor(o);
                        const narr  = o.items && o.items[0]
                          ? (o.items[0].itemName || o.items[0].description || '') : '';
                        return (
                          <tr key={oid} style={{ background: i % 2 === 0 ? '#fff' : '#f7f9fc' }}>
                            <td style={{ padding: '5px 10px', border: `1px solid ${BD}`, color: '#888', textAlign: 'center' }}>{i + 1}</td>
                            <td style={{ padding: '5px 10px', border: `1px solid ${BD}`, whiteSpace: 'nowrap' }}>{fmtD(oDate)}</td>
                            <td style={{ padding: '5px 10px', border: `1px solid ${BD}`, fontWeight: 700, color: P, whiteSpace: 'nowrap' }}>{oNo}</td>
                            <td style={{ padding: '5px 10px', border: `1px solid ${BD}`, color: '#374151',
                              maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {narr || '—'}
                            </td>
                            <td style={{ padding: '5px 10px', border: `1px solid ${BD}`, textAlign: 'right',
                              fontWeight: 600, color: paid > 0 ? '#2e7d32' : '#9CA3AF' }}>
                              {paid > 0 ? `₹${fmt(paid)}` : '—'}
                            </td>
                            <td style={{ padding: '5px 10px', border: `1px solid ${BD}`, textAlign: 'right', fontWeight: 700 }}>
                              ₹{fmt(total)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr style={{ background: '#e8eef8', fontWeight: 800 }}>
                        <td colSpan={4} style={{ padding: '6px 10px', border: `1px solid ${BD}`,
                          textAlign: 'right', fontSize: 11 }}>
                          TOTAL ({selGroup.orders.length} orders)
                        </td>
                        <td style={{ padding: '6px 10px', border: `1px solid ${BD}`, textAlign: 'right', color: '#2e7d32' }}>
                          {selGroup.orders.some(o => paidFor(o) > 0)
                            ? `₹${fmt(selGroup.orders.reduce((s,o) => s + paidFor(o), 0))}`
                            : '—'}
                        </td>
                        <td style={{ padding: '6px 10px', border: `1px solid ${BD}`, textAlign: 'right', color: P }}>
                          ₹{fmt(selGroup.totalValue)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
