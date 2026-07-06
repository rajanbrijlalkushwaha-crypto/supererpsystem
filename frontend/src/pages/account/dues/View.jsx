import React, { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import { useCompany } from '../../../context/CompanyContext';
import { useAuth } from '../../../context/AuthContext';

const fmt  = n => (parseFloat(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });
const fmtD = d => {
  if (!d) return '—';
  const dt = new Date(d);
  return isNaN(dt) ? d : `${String(dt.getDate()).padStart(2,'0')}-${String(dt.getMonth()+1).padStart(2,'0')}-${dt.getFullYear()}`;
};
const F  = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const BD = '#E5EAF2';
const P  = '#104f4f';
const BG = '#F4F7FB';

/* ── amount in words (Indian format) ── */
function numToWords(num) {
  num = Math.round(parseFloat(num) || 0);
  if (num === 0) return 'Zero';
  const ones = ['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine',
    'Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'];
  const tens = ['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
  function below1000(n) {
    if (n < 20) return ones[n];
    if (n < 100) return tens[Math.floor(n/10)] + (n%10 ? ' '+ones[n%10] : '');
    return ones[Math.floor(n/100)]+' Hundred'+(n%100 ? ' '+below1000(n%100) : '');
  }
  let w = ''; let n = num;
  if (n >= 10000000) { w += below1000(Math.floor(n/10000000))+' Crore '; n %= 10000000; }
  if (n >= 100000)   { w += below1000(Math.floor(n/100000))+' Lakh ';   n %= 100000; }
  if (n >= 1000)     { w += below1000(Math.floor(n/1000))+' Thousand '; n %= 1000; }
  if (n > 0)         { w += below1000(n); }
  return 'INR '+w.trim()+' Only';
}

/* ══════════════════════════════════════════════════════════
   PRINT — One full page per PO, all in one document
══════════════════════════════════════════════════════════ */
function printAdvice(entityName, groupRows, type, companyData, entityDetail, billsLookup, salesBillsLookup, grnsLookup, currentUser) {
  const isVendor = type === 'vendor';
  const logoUrl  = (companyData?.logoFileName && companyData?.companyId)
    ? `/api/companies/logo/${encodeURIComponent(companyData.logoFileName)}?companyId=${companyData.companyId}`
    : '';

  /* shared company header HTML — centered professional layout */
  const coHeader = `
    <div class="co-hdr">
      ${logoUrl ? `<img src="${logoUrl}" alt="logo" class="co-logo-img" onerror="this.style.display='none'">` : ''}
      <div class="co-name">${companyData?.companyName || 'Epsilon Enterprise'}</div>
      <div class="co-addr">${[companyData?.address, companyData?.city, companyData?.state, companyData?.pincode].filter(Boolean).join(', ')}</div>
      <div class="co-addr">GSTIN: ${companyData?.gstin||'—'}${companyData?.phone?' | Ph: '+companyData.phone:''}${companyData?.email?' | Email: '+companyData.email:''}</div>
    </div>
    <hr class="hdr-line">`;

  /* per-PO pages */
  const poPages = groupRows.map((row, idx) => {
    const isVend = isVendor;
    const items     = row.items     || [];
    const addOnItems= row.addOnItems|| [];
    const charges   = row.charges   || [];

    /* item calc */
    let subTotal = 0, totalCGST = 0, totalIGST = 0;
    items.forEach(it => {
      const base    = (parseFloat(it.qty||it.quantity)||0)*(parseFloat(it.rate)||0);
      const disc    = it.discountType==='%' ? base*(parseFloat(it.discount)||0)/100 : (parseFloat(it.discount)||0);
      const taxable = base - disc;
      const gp      = parseFloat(it.gstPercent)||0;
      subTotal    += taxable;
      totalCGST   += taxable * gp / 200;
      totalIGST   += taxable * gp / 100;
    });
    const isInterState = (companyData?.state||'') !== (entityDetail?.state||'') && totalCGST === 0;
    const totalGST = isInterState ? totalIGST : totalCGST * 2;
    const addlCharges = charges.reduce((s,c) => s+(parseFloat(c.amount||c.value)||0), 0);

    /* item rows */
    const itemRowsHtml = items.map((it, j) => {
      const base    = (parseFloat(it.qty||it.quantity)||0)*(parseFloat(it.rate)||0);
      const disc    = it.discountType==='%' ? base*(parseFloat(it.discount)||0)/100 : (parseFloat(it.discount)||0);
      const taxable = base - disc;
      return `<tr>
        <td class="c">${j+1}</td>
        <td>${it.itemCode||it.code||'—'}</td>
        <td>${it.itemName||'—'}</td>
        <td>${it.description||it.specs||''}</td>
        <td>${it.hsnCode||'—'}</td>
        <td class="c">${it.qty||it.quantity||''}</td>
        <td class="c">${it.unit||''}</td>
        <td class="r">${fmt(it.rate)}</td>
        <td class="r">${fmt(taxable)}</td>
      </tr>`;
    }).join('') || `<tr><td colspan="9" class="c eg">—</td></tr>`;

    /* add-on rows */
    const addOnRowsHtml = addOnItems.map((it, j) => `<tr>
      <td class="c">${j+1}</td>
      <td>${it.itemCode||it.code||'—'}</td>
      <td>${it.itemName||'—'}</td>
      <td>${it.description||''}</td>
      <td>${it.hsnCode||'—'}</td>
      <td class="c">${it.qty||''}</td>
      <td class="c">${it.unit||''}</td>
      <td>${it.category||''}</td>
      <td class="r">${it.includedPrice||it.rate||''}</td>
      <td>${it.remarks||''}</td>
    </tr>`).join('') || `<tr><td colspan="10" class="c eg">—</td></tr>`;

    /* scope — prefer structured scopeItems array, fall back to legacy text fields */
    const scopeItems = (row.scopeItems || []).filter(s => s.item && String(s.item).trim());
    const scopeLegacy = [row.vendorScope, row.epsilonScope, row.clientScope, row.scopeOfWork]
      .filter(s => s && String(s).trim()).join('\n\n');

    /* render scope as a table if structured items exist, otherwise show text */
    const scopeHtml = scopeItems.length > 0
      ? `<table class="scope-tbl">
          <thead>
            <tr>
              <th style="width:28px" class="c">#</th>
              <th>Scope Item / Activity</th>
              <th class="c" style="width:72px">Client</th>
              <th class="c" style="width:72px">Our Scope</th>
              <th class="c" style="width:72px">Vendor</th>
              <th style="width:110px">Remarks</th>
            </tr>
          </thead>
          <tbody>
            ${scopeItems.map((s, j) => `<tr>
              <td class="c">${j+1}</td>
              <td>${s.item||''}</td>
              <td class="c">${s.clientScope ? '✔' : '—'}</td>
              <td class="c">${s.ourScope    ? '✔' : '—'}</td>
              <td class="c">${s.vendorScope ? '✔' : '—'}</td>
              <td>${s.remarks||''}</td>
            </tr>`).join('')}
          </tbody>
        </table>`
      : `<div class="scope-box">${scopeLegacy ? scopeLegacy.replace(/\n/g,'<br>') : '&nbsp;'}</div>`;

    /* yellow table — each entry on its own date-wise row */
    const narr = row.orderNo || row.poNo || `#${row.orderId}`;

    /* use purchase bills for vendor, sales bills for client */
    const orderBills = isVend
      ? ((billsLookup && billsLookup[String(row.orderId)]) || [])
      : ((salesBillsLookup && salesBillsLookup[String(row.orderId)]) || []);

    /* GRNs only relevant on vendor/payable side */
    const poRef  = row.orderNo || row.poNo || '';
    const poGRNs = isVend ? ((grnsLookup && grnsLookup[poRef]) || []) : [];

    /* linked payments/receipts for this order */
    const linkedPayments = row.linkedPayments || [];

    /* column labels */
    const colA = isVend ? 'Payment'  : 'Receipt';
    const colB = isVend ? 'Purchase' : 'Sales';

    /* Build all rows sorted by date — each entry is ONE row with only one column filled */
    const entries = [];

    /* 1. PO row for vendor only — client SO should NOT appear as a "Sales" transaction */
    if (isVend) {
      entries.push({ date: row.orderDate, narr, colA: null, colB: row.orderTotal });
    }

    /* 2. Bill rows — only Purchase/Sales column */
    orderBills.forEach(bill => {
      const billLabel = isVend
        ? `Bill: ${bill.billNo || bill.vendorBillNo || ('B#'+bill.billId)}`
        : `Sales Bill: ${bill.billNo || ('SB#'+bill.billId)}`;
      entries.push({ date: bill.billDate, narr: billLabel, colA: null, colB: parseFloat(bill.grandTotal)||0 });
    });

    /* 3. GRN rows (vendor only) — informational, no amounts */
    poGRNs.forEach(grn => {
      entries.push({ date: grn.date, narr: `GRN: ${grn.grnNo || ('GRN#'+grn.txnId)}`, colA: null, colB: null });
    });

    /* 4. Payment / Receipt rows — only Payment/Receipt column */
    linkedPayments.forEach(pmt => {
      const pmtNarr = ['Payment', pmt.referenceNo, pmt.paymentMode].filter(Boolean).join(' — ');
      entries.push({ date: pmt.date, narr: pmtNarr, colA: parseFloat(pmt.amount)||0, colB: null });
    });

    /* sort all entries by date ascending */
    entries.sort((a, b) => {
      const da = a.date ? new Date(a.date) : new Date(0);
      const db = b.date ? new Date(b.date) : new Date(0);
      return da - db;
    });

    let srNo = 1;
    const yellowBodyRows = entries.map(e => `<tr>
      <td class="c">${srNo++}</td>
      <td class="nw">${fmtD(e.date)}</td>
      <td>${e.narr}</td>
      <td class="r">${e.colA != null ? '₹ '+fmt(e.colA) : ''}</td>
      <td class="r">${e.colB != null ? '₹ '+fmt(e.colB) : ''}</td>
      <td class="sign"></td>
    </tr>`).join('');

    /* Totals */
    const yellowTotalA = linkedPayments.reduce((s,p) => s+(parseFloat(p.amount)||0), 0);
    /* vendor: PO value + bills; client: only sales bills (SO value shown in Item Description above) */
    const yellowTotalB = isVend
      ? row.orderTotal + orderBills.reduce((s,b) => s+(parseFloat(b.grandTotal)||0), 0)
      : orderBills.reduce((s,b) => s+(parseFloat(b.grandTotal)||0), 0);
    const paid         = yellowTotalA;

    /* Closing balance */
    const closingWithGST = Math.max(0, (row.orderTotal || 0) - paid);
    const salesBillTotal = !isVend ? orderBills.reduce((s,b) => s+(parseFloat(b.grandTotal)||0), 0) : 0;
    const billBalance    = Math.max(0, salesBillTotal - paid);

    return `
    <div class="po-page${idx>0?' page-break':''}">
      ${coHeader}

      <div class="doc-title">${isVend ? 'Payment&nbsp;&nbsp;Advice' : 'Receipt&nbsp;&nbsp;Advice'}</div>

      <!-- Compact 3-column info grid -->
      <table class="info-grid">
        <tr>
          <td class="ig-cell">
            <div class="ig-hd">${isVend ? 'Vendor Details' : 'Client Details'}</div>
            <div class="ig-row"><span class="ig-lbl">${isVend ? 'Vendor ID' : 'Client ID'}</span><span class="ig-val">${entityDetail?.code||'—'}</span></div>
            <div class="ig-row"><span class="ig-lbl">${isVend ? 'Vendor Name' : 'Client Name'}</span><span class="ig-val">${entityName}</span></div>
            <div class="ig-row"><span class="ig-lbl">Business Type</span><span class="ig-val">${entityDetail?.businessType||'—'}</span></div>
            <div class="ig-row"><span class="ig-lbl">Industry Type</span><span class="ig-val">${entityDetail?.industryType||'—'}</span></div>
            <div class="ig-row"><span class="ig-lbl">Category</span><span class="ig-val">${entityDetail?.category||'—'}</span></div>
            <div class="ig-row"><span class="ig-lbl">TDS Applicable</span><span class="ig-val">${entityDetail?.tdsApplicable||'—'}</span></div>
            <div class="ig-sep"></div>
            <div class="ig-hd">Tax Identity</div>
            <div class="ig-row"><span class="ig-lbl">PAN No</span><span class="ig-val">${entityDetail?.pan||'—'}</span></div>
            <div class="ig-row"><span class="ig-lbl">GSTIN No</span><span class="ig-val">${entityDetail?.gstin||'—'}</span></div>
            <div class="ig-row"><span class="ig-lbl">CIN No</span><span class="ig-val">${entityDetail?.cin||'—'}</span></div>
            <div class="ig-row"><span class="ig-lbl">MSME</span><span class="ig-val">${entityDetail?.msme||'—'}</span></div>
            <div class="ig-row"><span class="ig-lbl">GST Type</span><span class="ig-val">${entityDetail?.gstType||'—'}</span></div>
            <div class="ig-row"><span class="ig-lbl">GST Registered</span><span class="ig-val">${entityDetail?.gstRegistered||'—'}</span></div>
          </td>
          <td class="ig-cell">
            <div class="ig-hd">Order Details</div>
            <div class="ig-row"><span class="ig-lbl">ERP No</span><span class="ig-val">${row.orderId||'—'}</span></div>
            <div class="ig-row"><span class="ig-lbl">Order No</span><span class="ig-val">${row.orderNo||row.poNo||'—'}</span></div>
            <div class="ig-row"><span class="ig-lbl">Order Date</span><span class="ig-val">${fmtD(row.orderDate)}</span></div>
            <div class="ig-row"><span class="ig-lbl">Order Type</span><span class="ig-val">${row.poType||row.orderType||'—'}</span></div>
            <div class="ig-row"><span class="ig-lbl">Delivery Date</span><span class="ig-val">${fmtD(row.deliveryDate)}</span></div>
            <div class="ig-row"><span class="ig-lbl">Payment Terms</span><span class="ig-val">${row.paymentTerms||'—'}</span></div>
            ${isVend && row.linkedSalesOrderId ? `<div class="ig-row"><span class="ig-lbl">Linked SO</span><span class="ig-val">SO #${row.linkedSalesOrderId}</span></div>` : ''}
            <div class="ig-sep"></div>
            <div class="ig-hd">Contact</div>
            <div class="ig-row"><span class="ig-lbl">Company</span><span class="ig-val">${companyData?.companyName||'—'}</span></div>
            <div class="ig-row"><span class="ig-lbl">Contact Person</span><span class="ig-val">${row.contactPerson||entityDetail?.contact||'—'}</span></div>
            <div class="ig-row"><span class="ig-lbl">Mobile</span><span class="ig-val">${row.mobile||entityDetail?.mobile||companyData?.phone||'—'}</span></div>
            <div class="ig-row"><span class="ig-lbl">Alt Mobile</span><span class="ig-val">${row.mobile2||entityDetail?.altMobile||'—'}</span></div>
            <div class="ig-row"><span class="ig-lbl">Email</span><span class="ig-val">${row.email||entityDetail?.email||companyData?.email||'—'}</span></div>
          </td>
          <td class="ig-cell">
            <div class="ig-hd">Billing Address</div>
            <div class="ig-row"><span class="ig-lbl">Name</span><span class="ig-val">${companyData?.companyName||'—'}</span></div>
            <div class="ig-row"><span class="ig-lbl">Address</span><span class="ig-val">${row.deliveryAddress||companyData?.address||'—'}</span></div>
            <div class="ig-row"><span class="ig-lbl">City</span><span class="ig-val">${row.deliveryCity||companyData?.city||'—'}</span></div>
            <div class="ig-row"><span class="ig-lbl">State</span><span class="ig-val">${row.deliveryState||companyData?.state||'—'}</span></div>
            <div class="ig-row"><span class="ig-lbl">Pincode</span><span class="ig-val">${row.deliveryPincode||companyData?.pincode||'—'}</span></div>
            <div class="ig-sep"></div>
            <div class="ig-hd">Shipping Address</div>
            <div class="ig-row"><span class="ig-lbl">Address</span><span class="ig-val">${row.shipFromAddress||entityDetail?.address||'—'}</span></div>
            <div class="ig-row"><span class="ig-lbl">City</span><span class="ig-val">${row.shipFromCity||entityDetail?.city||'—'}</span></div>
            <div class="ig-row"><span class="ig-lbl">State</span><span class="ig-val">${row.shipFromState||entityDetail?.state||'—'}</span></div>
            <div class="ig-row"><span class="ig-lbl">Pincode</span><span class="ig-val">${row.shipFromPincode||entityDetail?.pincode||'—'}</span></div>
          </td>
        </tr>
      </table>

      <!-- Item Description -->
      <div class="sect-bar">Item Description</div>
      <table class="item-tbl">
        <thead>
          <tr>
            <th class="c" style="width:32px">Sr No</th>
            <th style="width:72px">ITEM code</th>
            <th>Item Name</th>
            <th>Additional Description</th>
            <th style="width:64px">HSN Code</th>
            <th class="c" style="width:40px">Qty</th>
            <th class="c" style="width:44px">UoM</th>
            <th class="r" style="width:72px">Rate</th>
            <th class="r" style="width:80px">Taxable</th>
          </tr>
        </thead>
        <tbody>${itemRowsHtml}</tbody>
        <tfoot>
          <tr><td colspan="8" class="r fw">Total Taxable</td><td class="r fw">${fmt(subTotal)}</td></tr>
          ${addlCharges ? `<tr><td colspan="8" class="r fw">All Additional Charges</td><td class="r fw">${fmt(addlCharges)}</td></tr>` : `<tr><td colspan="8" class="r">All Additional Charges</td><td class="r">—</td></tr>`}
          <tr><td colspan="8" class="r fw">GST Amount</td><td class="r fw">${fmt(Math.max(0, row.orderTotal - subTotal - addlCharges))}</td></tr>
          <tr class="grand-row">
            <td colspan="8" class="r">Total Order Value</td>
            <td class="r">₹ ${fmt(row.orderTotal)}</td>
          </tr>
        </tfoot>
      </table>
      <div class="words">Amount in Words: ${numToWords(row.orderTotal)}</div>

      <!-- Add On Items (only if present) -->
      ${addOnItems.length > 0 ? `
      <div class="sect-bar">Add On Item</div>
      <table class="item-tbl">
        <thead>
          <tr>
            <th class="c" style="width:32px">Sr No</th>
            <th style="width:72px">ITEM code</th>
            <th>Item Name</th>
            <th>Additional Description</th>
            <th style="width:64px">HSN Code</th>
            <th class="c" style="width:40px">Qty</th>
            <th class="c" style="width:44px">UoM</th>
            <th style="width:70px">Category</th>
            <th class="r" style="width:80px">Included Price</th>
            <th style="width:80px">Remarks</th>
          </tr>
        </thead>
        <tbody>${addOnRowsHtml}</tbody>
      </table>` : ''}

      <!-- Scope of Work (only if present) -->
      ${(scopeItems.length > 0 || scopeLegacy.trim()) ? `
      <div class="sect-bar">Scope of work</div>
      ${scopeHtml}` : ''}

      <!-- Yellow Payment Table -->
      <table class="pay-tbl">
        <thead>
          <tr>
            <th class="c" style="width:44px">Sr<br>No.</th>
            <th style="width:84px">Date</th>
            <th>Narration</th>
            <th class="r" style="width:110px">${colA}</th>
            <th class="r" style="width:110px">${colB}</th>
            <th class="r" style="width:80px">Sign</th>
          </tr>
        </thead>
        <tbody>
          ${yellowBodyRows}
        </tbody>
        <tfoot>
          <tr>
            <td colspan="3" class="r fw">TOTAL</td>
            <td class="r fw">${yellowTotalA > 0 ? '₹ '+fmt(yellowTotalA) : ''}</td>
            <td class="r fw">₹ ${fmt(yellowTotalB)}</td>
            <td></td>
          </tr>
          <tr class="closing-row">
            <td colspan="3" class="r fw" style="font-size:11px">
              ${isVend ? 'Closing Balance' : 'Closing Bal as per Sales Order'}
            </td>
            <td></td>
            <td class="r fw" style="color:${closingWithGST>0?'#b71c1c':'#2e7d32'}">
              ₹ ${fmt(closingWithGST)}
            </td>
            <td></td>
          </tr>
          ${(!isVend && salesBillTotal > 0) ? `
          <tr class="closing-row">
            <td colspan="3" class="r fw" style="font-size:11px">Closing Bal As per Sales</td>
            <td></td>
            <td class="r fw" style="color:${billBalance>0?'#b71c1c':'#2e7d32'}">
              ₹ ${fmt(billBalance)}
            </td>
            <td></td>
          </tr>` : ''}
        </tfoot>
      </table>

      <!-- Signature Footer -->
      <div class="sig-footer">
        <div class="sig-col">
          <div class="sig-name">${currentUser || ''}</div>
          <div class="sig-line-bar"></div>
          <div class="sig-label">Prepared By</div>
          <div class="sig-date">Date: ___________</div>
        </div>
        <div class="sig-col">
          <div class="sig-name">&nbsp;</div>
          <div class="sig-line-bar"></div>
          <div class="sig-label">Verified By</div>
          <div class="sig-date">Date: ___________</div>
        </div>
        <div class="sig-col">
          <div class="sig-name">&nbsp;</div>
          <div class="sig-line-bar"></div>
          <div class="sig-label">Authorised By</div>
          <div class="sig-date">Date: ___________</div>
        </div>
      </div>

    </div>`;
  }).join('');

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
  <title>${isVendor ? 'Payment Advice' : 'Receipt Advice'} — ${entityName}</title>
  <style>
    @page { size: A4; margin: 7mm 9mm; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Times New Roman', Times, serif; font-size: 10px; color: #000; }

    .po-page    { padding-bottom: 2mm; }
    .page-break { page-break-before: always; }

    /* Compact centered header */
    .co-hdr      { text-align: center; padding-bottom: 5px; }
    .co-logo-img { height: 44px; margin-bottom: 3px; display: block; margin-left: auto; margin-right: auto; }
    .co-name     { font-size: 18px; font-weight: 900; color: #104f4f; letter-spacing: 0.3px; }
    .co-addr     { font-size: 8.5px; color: #333; line-height: 1.55; margin-top: 2px; }
    .hdr-line    { border: none; border-top: 2px solid #104f4f; margin: 4px 0 5px; }

    /* Doc title */
    .doc-title { text-align: center; font-size: 14px; font-weight: 900; letter-spacing: 3px;
                 text-transform: uppercase; border: 1.5px solid #104f4f;
                 padding: 5px 10px; margin: 0 0 6px; color: #104f4f; background: #f0f4ff; }

    /* ── Compact 3-column info grid (replaces 4 separate sections) ── */
    .info-grid  { width: 100%; border-collapse: collapse; border: 1px solid #aaa; margin-bottom: 5px; font-size: 9px; }
    .ig-cell    { width: 33.33%; vertical-align: top; padding: 4px 6px; border-right: 1px solid #aaa; }
    .ig-cell:last-child { border-right: none; }
    .ig-hd      { font-weight: 800; font-size: 9.5px; color: #104f4f; text-transform: uppercase;
                  letter-spacing: 0.4px; border-bottom: 1px solid #ccc; padding-bottom: 2px; margin-bottom: 3px; }
    .ig-row     { display: flex; gap: 3px; margin-bottom: 1.5px; line-height: 1.4; }
    .ig-lbl     { color: #555; width: 78px; flex-shrink: 0; }
    .ig-val     { color: #000; font-weight: 600; }
    .ig-sep     { border-top: 1px dashed #ddd; margin: 4px 0 3px; }

    /* Section bar */
    .sect-bar { text-align: center; font-size: 10px; font-weight: 800;
                border: 1px solid #999; border-top: none; padding: 2.5px;
                background: #ececec; letter-spacing: 0.4px; text-transform: uppercase; }

    /* Item table */
    .item-tbl { width: 100%; border-collapse: collapse; font-size: 9px; margin-bottom: 0; }
    .item-tbl thead tr { background: #d8d8d8; }
    .item-tbl th { padding: 3px 4px; font-size: 9px; font-weight: 700; border: 1px solid #999; text-align: left; }
    .item-tbl td { padding: 2px 4px; border: 1px solid #ccc; vertical-align: top; }
    .item-tbl tfoot td { padding: 2.5px 4px; border: 1px solid #999; font-size: 9.5px; }
    .item-tbl .grand-row td { font-weight: 900; font-size: 11px; border-top: 2px solid #000; }
    .fw { font-weight: 700; }
    .eg { color: #aaa; font-style: italic; }

    .words { font-size: 8.5px; font-style: italic; border: 1px solid #ccc; border-top: none;
             padding: 2px 5px; background: #fafafa; margin-bottom: 4px; }
    .scope-box { border: 1px solid #999; border-top: none; min-height: 20px; padding: 3px 6px;
                 font-size: 9px; line-height: 1.5; margin-bottom: 3px; }
    .scope-tbl { width: 100%; border-collapse: collapse; font-size: 9px; margin-bottom: 3px; border: 1px solid #999; border-top: none; }
    .scope-tbl th { padding: 2.5px 5px; background: #104f4f; color: #fff; font-weight: 700; border: 1px solid #0d2d55; font-size: 8.5px; }
    .scope-tbl td { padding: 2px 5px; border: 1px solid #ccc; vertical-align: top; }
    .scope-tbl tbody tr:nth-child(even) td { background: #f8fafc; }

    /* Payment / Receipt table — main readable content */
    .pay-tbl { width: 100%; border-collapse: collapse; margin-top: 5px; }
    .pay-tbl thead tr { background: #104f4f; }
    .pay-tbl th { padding: 6px 7px; font-size: 11.5px; font-weight: 700; color: #fff;
                  border: 1px solid #0d2d55; letter-spacing: 0.3px; }
    .pay-tbl td { padding: 4.5px 7px; border: 1px solid #ccc; font-size: 11px; }
    .pay-tbl tfoot td { border-top: 2px solid #104f4f; border-bottom: 2px solid #104f4f;
                        padding: 5px 7px; background: #eef2ff; font-size: 11px; font-weight: 700; }
    .pay-tbl .closing-row td { background: #fffae0; border-top: 2px solid #e6c400; font-size: 11.5px; font-weight: 700; }
    .sign { min-width: 60px; }

    /* Signature footer */
    .sig-footer   { display: flex; justify-content: space-between; margin-top: 22px;
                    padding-top: 10px; border-top: 1.5px solid #000; }
    .sig-col      { text-align: center; flex: 1; padding: 0 8px; }
    .sig-name     { font-size: 10px; font-weight: 700; color: #104f4f; font-style: italic;
                    min-height: 14px; margin-bottom: 22px; }
    .sig-line-bar { border-top: 1.5px solid #000; padding-top: 4px; }
    .sig-label    { font-size: 11px; font-weight: 800; color: #000; letter-spacing: 0.3px; }
    .sig-date     { font-size: 8.5px; color: #666; margin-top: 2px; }

    /* helpers */
    .r { text-align: right; }
    .c { text-align: center; }
    .nw { white-space: nowrap; }

    @media print { body { margin: 0; } .page-break { page-break-before: always; } }
  </style></head><body>
  ${poPages}
  </body></html>`;

  const w = window.open('', '_blank');
  w.document.write(html);
  w.document.close();
  w.onload = () => w.print();
}

/* ══════════════════════════════════════════════════════════
   PRINT LIST REPORT (tabular summary, company header + orientation)
══════════════════════════════════════════════════════════ */
const printListReport = async (title, subtitle, cols, rows, groupEnds, rightColsSet, boldColsSet, company, orientation='landscape', subTotalRows=null) => {
  /* ── fetch company logo ── */
  let logoB64 = '';
  if (company?.logoFileName && company?.companyId) {
    try {
      const res  = await fetch(`/api/companies/logo/${encodeURIComponent(company.logoFileName)}?companyId=${company.companyId}`);
      const blob = await res.blob();
      logoB64 = await new Promise(r => { const rd = new FileReader(); rd.onload = () => r(rd.result); rd.readAsDataURL(blob); });
    } catch {}
  }
  const coName  = company?.companyName || 'Epsilon Enterprise';
  const coAddr  = [company?.address, company?.city, company?.state, company?.pincode].filter(Boolean).join(', ');
  const coPhone = company?.phone || '';
  const coEmail = company?.email || '';
  const coGstin = company?.gstin || '';
  const pageUrl = (typeof window !== 'undefined') ? window.location.href : '';

  const today2 = new Date().toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'});
  const rightCols = rightColsSet instanceof Set ? rightColsSet : new Set([7,8,9,11,15,16]);
  const boldCols  = boldColsSet  instanceof Set ? boldColsSet  : new Set([11,15,16]);
  const ends = groupEnds instanceof Set ? groupEnds : new Set();

  /* auto-detect wrappable columns from header names */
  const wrapCols = new Set();
  cols.forEach((c, ci) => {
    const cl = String(c).toLowerCase();
    if (cl.includes('name') || cl.includes('date') || cl.includes('product') ||
        cl.includes('description') || cl.includes('bill no') || cl.includes('bill') ||
        cl.includes('narration') || cl.includes('invoice')) {
      wrapCols.add(ci);
    }
  });

  /* build row HTML — include subtotal rows after group-end */
  let rHtml = '';
  rows.forEach((r, ri) => {
    const isEnd = ends.has(ri);
    const cls = []; if (isEnd && !(subTotalRows && subTotalRows.has(ri))) cls.push('grp-end');
    rHtml += `<tr${cls.length?' class="'+cls.join(' ')+'"':''}>${r.map((c,ci) => {
      const tc=[]; if(rightCols.has(ci)) tc.push('r'); if(boldCols.has(ci)) tc.push('b'); if(wrapCols.has(ci)) tc.push('wc');
      const clsStr=tc.length?` class="${tc.join(' ')}"`:''
      const raw=(c===null||c===undefined||c==='')?'':String(c);
      const val=raw.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
      const stkStyle=raw.includes('\n')?' style="white-space:pre-line;line-height:1.6;text-align:right;"':'';
      return `<td${clsStr}${stkStyle}>${val}</td>`;
    }).join('')}</tr>`;
    /* subtotal row after multi-item orders */
    if (subTotalRows && subTotalRows.has(ri)) {
      const sub = subTotalRows.get(ri);
      rHtml += `<tr class="sub-row grp-end">${sub.map((c,ci) => {
        const tc=[]; if(rightCols.has(ci)) tc.push('r');
        const clsStr=tc.length?` class="${tc.join(' ')}"`:''
        const val=c?String(c).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'):'';
        return `<td${clsStr}>${val}</td>`;
      }).join('')}</tr>`;
    }
  });

  const coHeaderHtml = `
    <div class="co-hdr">
      ${logoB64 ? `<div class="co-logo-wrap"><img src="${logoB64}" class="co-logo" alt="logo"/></div>` : ''}
      <div class="co-info">
        <div class="co-name">${coName}</div>
        ${coAddr   ? `<div class="co-addr">${coAddr}</div>` : ''}
        <div class="co-meta">${[coGstin?'GSTIN: <b>'+coGstin+'</b>':'', coPhone?'Ph: '+coPhone:'', coEmail?'Email: '+coEmail:''].filter(Boolean).join('&nbsp;&nbsp;|&nbsp;&nbsp;')}</div>
      </div>
    </div>`;

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box;}
body{font-family:'Calibri','Segoe UI',Arial,sans-serif;font-size:11.5pt;color:#000;background:#fff;}
.pg{padding:10mm 12mm;}
/* ── Company header — centered ── */
.co-hdr{text-align:center;margin-bottom:12px;padding-bottom:10px;border-bottom:3px double #1a2a3a;}
.co-logo-wrap{margin-bottom:6px;}
.co-logo{height:62px;width:auto;object-fit:contain;}
.co-name{font-size:20pt;font-weight:900;color:#1a2a3a;letter-spacing:0.3pt;line-height:1.2;}
.co-addr{font-size:10.5pt;color:#333;margin-top:5px;line-height:1.7;}
.co-meta{font-size:10.5pt;color:#222;margin-top:3px;line-height:1.7;}
/* ── Report title ── */
.report-head{text-align:center;margin-bottom:10px;}
h1{font-size:14pt;font-weight:bold;color:#1a2a3a;margin-bottom:3px;}
.sub{font-size:10.5pt;color:#555;padding-bottom:5px;border-bottom:2px solid #1a2a3a;margin-bottom:10px;display:block;}
/* ── Table ── */
table{width:100%;border-collapse:collapse;border:2px solid #1a2a3a;}
thead{display:table-header-group;}
thead tr th{
  background:#104f4f;color:#fff;
  padding:7px 9px;font-size:10pt;font-weight:700;
  text-align:left;border:1px solid #0b3d3d;white-space:nowrap;
}
thead tr th.r{text-align:right;}
tbody tr td{
  padding:6px 9px;font-size:10pt;
  border:1px solid #c8d4e0;
  vertical-align:middle;color:#111;line-height:1.4;
  white-space:nowrap;
}
tbody tr td.wc{white-space:normal;word-break:break-word;overflow-wrap:break-word;max-width:120px;}
tbody tr:nth-child(even) td{background:#f2f7ff;}
tbody tr.grp-end td{border-bottom:2.5px solid #1a2a3a !important;}
tbody tr.sub-row td{
  background:#fefce8 !important;
  font-weight:800;font-size:11.5pt;
  border-top:1.5px solid #d97706 !important;
  border-bottom:2.5px solid #1a2a3a !important;
  color:#78350f;
}
tbody tr.sub-row td:first-child{border-left:2px solid #d97706;}
tfoot tr td{
  padding:9px 11px;font-size:12pt;font-weight:800;
  border:1.5px solid #1a2a3a;background:#dbeafe;color:#1a2a3a;
}
.r{text-align:right;}.b{font-weight:700;}
/* ── Footer ── */
.foot{margin-top:14px;font-size:9.5pt;color:#555;display:flex;justify-content:space-between;align-items:flex-start;border-top:1px solid #aaa;padding-top:6px;}
.foot-url{color:#104f4f;font-weight:600;}
@media print{
  @page{margin:5mm;size:A3 ${orientation};}
  .pg{padding:0;}
  thead{display:table-header-group;}
  table{page-break-inside:auto;width:100%;table-layout:auto;}
  tr{page-break-inside:avoid;page-break-after:auto;}
  thead tr th{
    -webkit-print-color-adjust:exact;print-color-adjust:exact;
    background:#104f4f !important;color:#fff !important;
    font-size:8.5pt;padding:5px 6px;white-space:normal;word-break:break-word;
  }
  tbody tr td{font-size:8.5pt;padding:4px 6px;}
  tbody tr td.wc{max-width:100px;}
  tbody tr.sub-row td{font-size:9pt;padding:5px 6px;}
  tfoot tr td{font-size:9.5pt;padding:6px 7px;}
  tbody tr:nth-child(even) td{-webkit-print-color-adjust:exact;print-color-adjust:exact;background:#f2f7ff !important;}
  tbody tr.sub-row td{-webkit-print-color-adjust:exact;print-color-adjust:exact;background:#fefce8 !important;}
  tfoot tr td{-webkit-print-color-adjust:exact;print-color-adjust:exact;background:#dbeafe !important;}
  .foot{page-break-inside:avoid;font-size:8pt;}
}
</style>
</head><body><div class="pg">
${coHeaderHtml}
<div class="report-head">
<h1>${title}</h1>
<span class="sub">${subtitle}&nbsp;&nbsp;|&nbsp;&nbsp;${rows.length} line items&nbsp;&nbsp;|&nbsp;&nbsp;Generated: ${today2}</span>
</div>
<table>
<thead><tr>${cols.map((c,ci)=>`<th${rightCols.has(ci)?' class="r"':''}>${c}</th>`).join('')}</tr></thead>
<tbody>${rHtml}</tbody>
</table>
<div class="foot">
  <span>Printed by Epsilon ERP &nbsp;|&nbsp; ${today2}</span>
  ${pageUrl ? `<span class="foot-url">${pageUrl}</span>` : ''}
</div>
</div><script>window.onload=()=>setTimeout(()=>window.print(),400);<\/script>
</body></html>`;
  const w=window.open('','_blank','width=1500,height=900,scrollbars=yes');
  if(!w){alert('Allow pop-ups to print.');return;}
  w.document.write(html); w.document.close();
};

/* ── Financial Year helper ── */
const getFYV = (dateStr) => {
  const d = dateStr ? new Date(dateStr) : new Date();
  const m = d.getMonth()+1, y = d.getFullYear();
  const s = m>=4?y:y-1;
  return `${String(s).slice(2)}-${String(s+1).slice(2)}`;
};

/* ══════════════════════════════════════════════════════════
   PRINT SELECT MODAL — choose which orders to print
══════════════════════════════════════════════════════════ */
function PrintSelectModal({ entityName, orders, type, salesBillsLookup, billsLookup, grnsLookup, companyData, entityDetail, currentUser, onClose }) {
  const [checked, setChecked] = useState(() => {
    const m = {}; orders.forEach(o => { m[o.orderId] = true; }); return m;
  });
  const toggle = id => setChecked(prev => ({ ...prev, [id]: !prev[id] }));
  const allSel = orders.every(o => checked[o.orderId]);
  const toggleAll = () => {
    const m = {}; orders.forEach(o => { m[o.orderId] = !allSel; }); setChecked(m);
  };
  const selected = orders.filter(o => checked[o.orderId]);

  const handlePrint = () => {
    if (selected.length === 0) { alert('Select at least one order.'); return; }
    printAdvice(entityName, selected, type, companyData, entityDetail, billsLookup, salesBillsLookup, grnsLookup, currentUser);
    onClose();
  };

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', zIndex:1000,
      display:'flex', alignItems:'center', justifyContent:'center', fontFamily:F }}>
      <div style={{ background:'#fff', borderRadius:10, width:540, maxHeight:'82vh',
        display:'flex', flexDirection:'column', boxShadow:'0 8px 32px rgba(0,0,0,0.2)' }}>
        <div style={{ background:P, color:'#fff', padding:'11px 16px', borderRadius:'10px 10px 0 0',
          display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <span style={{ fontWeight:700, fontSize:13 }}>🖨 Print Advice — {entityName}</span>
          <button onClick={onClose} style={{ background:'none', border:'none', color:'#fff', fontSize:18, cursor:'pointer', lineHeight:1 }}>✕</button>
        </div>
        <div style={{ padding:'8px 16px', borderBottom:`1px solid ${BD}`, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <span style={{ fontSize:11, color:'#555' }}>Select orders to include in print:</span>
          <button onClick={toggleAll} style={{ fontSize:11, cursor:'pointer', padding:'3px 10px',
            border:`1px solid ${BD}`, borderRadius:4, background:'#f9fafb', fontFamily:F }}>
            {allSel ? 'Unselect All' : 'Select All'}
          </button>
        </div>
        <div style={{ flex:1, overflow:'auto' }}>
          {orders.map((o, i) => (
            <label key={o.orderId} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 16px',
              borderBottom:`1px solid ${BD}`, cursor:'pointer', background:i%2===0?'#fff':'#f8faff' }}>
              <input type="checkbox" checked={!!checked[o.orderId]} onChange={()=>toggle(o.orderId)}
                style={{ width:14, height:14, cursor:'pointer' }}/>
              <span style={{ fontWeight:700, color:'#104f4f', fontSize:12, minWidth:72 }}>#{o.orderId}</span>
              <span style={{ color:'#555', fontSize:11, flex:1 }}>{o.orderNo||'—'}</span>
              <span style={{ color:'#999', fontSize:11 }}>{fmtD(o.orderDate)}</span>
              <span style={{ fontWeight:600, fontSize:12 }}>₹{fmt(o.orderTotal)}</span>
              <span style={{ fontSize:9, padding:'1px 6px', borderRadius:3, fontWeight:700,
                background:o.due<=0?'#d8f0d8':'#fff3e0', color:o.due<=0?'#005500':'#b06000',
                border:'1px solid #ccc', whiteSpace:'nowrap' }}>
                {o.due<=0?'Cleared':`Due ₹${fmt(o.due)}`}
              </span>
            </label>
          ))}
        </div>
        <div style={{ padding:'10px 16px', borderTop:`1px solid ${BD}`, display:'flex', gap:8, justifyContent:'flex-end', alignItems:'center' }}>
          <span style={{ fontSize:11, color:'#888' }}>{selected.length} of {orders.length} selected</span>
          <button onClick={onClose} style={{ padding:'6px 14px', fontSize:12, cursor:'pointer', borderRadius:5,
            border:`1px solid ${BD}`, background:'#f9fafb', fontFamily:F }}>Cancel</button>
          <button onClick={handlePrint} style={{ padding:'6px 18px', fontSize:12, cursor:'pointer', borderRadius:5,
            background:P, color:'#fff', border:'none', fontWeight:700, fontFamily:F }}>
            🖨 Print Selected ({selected.length})
          </button>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   MAIN PAGE
══════════════════════════════════════════════════════════ */
const ViewDues = () => {
  const { selectedCompany } = useCompany();
  const { user }            = useAuth();
  const cid = selectedCompany?.companyId;
  const currentUser = user?.name || user?.username || '';

  const [activeTab,   setActiveTab]   = useState('client');
  const [data,        setData]        = useState({ clientDues:[], vendorDues:[] });
  const [salesOrders, setSalesOrders] = useState([]);
  const [vendors,     setVendors]     = useState([]);
  const [clients,     setClients]     = useState([]);
  const [allBills,      setAllBills]      = useState([]);
  const [allSalesBills, setAllSalesBills] = useState([]);
  const [allGRNs,       setAllGRNs]       = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [message,     setMessage]     = useState('');
  const [showCleared, setShowCleared] = useState(false);
  const [search,      setSearch]      = useState('');
  const [fy,          setFy]          = useState(() => getFYV(null));
  const [entityFlt,   setEntityFlt]   = useState('all');
  const [printModal,      setPrintModal]      = useState(null);
  const [showClientInPrint, setShowClientInPrint] = useState(true);
  const [listPrintOpts,   setListPrintOpts]   = useState(null); // { orient:'landscape'|'portrait' } or null

  const fetchAll = useCallback(async () => {
    if (!cid) return;
    setLoading(true); setMessage('');
    try {
      const [duesRes, vRes, cRes, billsRes, salesBillsRes, grnRes, soRes] = await Promise.all([
        axios.get(`/api/accounts/dues?companyId=${cid}`),
        axios.get(`/api/vendors?companyId=${cid}`),
        axios.get(`/api/clients?companyId=${cid}`),
        axios.get(`/api/bills?companyId=${cid}&type=purchase`).catch(() => ({ data: [] })),
        axios.get(`/api/bills?companyId=${cid}&type=sales`).catch(() => ({ data: [] })),
        axios.get(`/api/stock/grn?companyId=${cid}`).catch(() => ({ data: [] })),
        axios.get(`/api/sales-orders?companyId=${cid}`).catch(() => ({ data: [] })),
      ]);
      setData(duesRes.data || { clientDues:[], vendorDues:[] });
      setSalesOrders(Array.isArray(soRes.data) ? soRes.data : []);
      setVendors(vRes.data || []);
      setClients(cRes.data || []);
      setAllBills(Array.isArray(billsRes.data) ? billsRes.data : []);
      setAllSalesBills(Array.isArray(salesBillsRes.data) ? salesBillsRes.data : []);
      setAllGRNs(Array.isArray(grnRes.data) ? grnRes.data : []);
    } catch (e) { setMessage('Error: '+e.message); }
    finally { setLoading(false); }
  }, [cid]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const soMap = useMemo(() => {
    const m = {};
    salesOrders.forEach(so => { m[String(so.orderId || so.id)] = so; });
    return m;
  }, [salesOrders]);

  const vendorDetailMap = useMemo(() => {
    const map = {};
    vendors.forEach(v => {
      const name = (v.vendorName||v.companyName||'').trim();
      if (!name) return;
      map[name] = {
        gstin:v.gstin||v.vendorGstin, state:v.state, address:v.address,
        city:v.city, pincode:v.pincode, mobile:v.mobile||v.phone, altMobile:v.altMobile,
        contact:v.contactPerson, email:v.email, code:v.vendorCode||String(v.vendorId||''),
        pan:v.pan, cin:v.cin, msme:v.msme, gstType:v.gstType, gstRegistered:v.gstRegistered,
        businessType:v.businessType, industryType:v.industryType, tdsApplicable:v.tdsApplicable, category:v.category,
      };
    });
    return map;
  }, [vendors]);

  const clientDetailMap = useMemo(() => {
    const map = {};
    clients.forEach(c => {
      const name = (c.companyName||c.name||'').trim();
      if (!name) return;
      map[name] = {
        gstin:c.gstin, state:c.state, address:c.address,
        city:c.city, pincode:c.pincode, mobile:c.mobile||c.phone, altMobile:c.altMobile,
        contact:c.contactPerson, email:c.email, code:String(c.clientId||''),
        pan:c.pan, cin:c.cin, msme:c.msme, gstType:c.gstType, gstRegistered:c.gstRegistered,
        businessType:c.businessType, industryType:c.industryType, tdsApplicable:c.tdsApplicable, category:c.category,
      };
    });
    return map;
  }, [clients]);

  const billsLookup = useMemo(() => {
    const map = {};
    allBills.forEach(b => {
      const key = String(b.orderId);
      if (!key || key==='undefined') return;
      if (!map[key]) map[key] = [];
      map[key].push(b);
    });
    return map;
  }, [allBills]);

  const salesBillsLookup = useMemo(() => {
    const map = {};
    allSalesBills.forEach(b => {
      const key = String(b.orderId);
      if (!key || key==='undefined') return;
      if (!map[key]) map[key] = [];
      map[key].push(b);
    });
    return map;
  }, [allSalesBills]);

  const grnsLookup = useMemo(() => {
    const map = {};
    allGRNs.forEach(g => {
      const key = String(g.poRef||'');
      if (!key) return;
      if (!map[key]) map[key] = [];
      map[key].push(g);
    });
    return map;
  }, [allGRNs]);

  const rows = activeTab==='client' ? data.clientDues : data.vendorDues;

  const fyList = useMemo(() => {
    const set = new Set(rows.map(r => getFYV(r.orderDate)));
    return ['all', ...[...set].sort().reverse()];
  }, [rows]);

  const entityList = useMemo(() => {
    const set = new Set(rows.map(r => r.entityName).filter(Boolean));
    return [...set].sort();
  }, [rows]);

  const filtered = useMemo(() => {
    let r = showCleared ? rows : rows.filter(r => r.due > 0);
    if (fy !== 'all') r = r.filter(row => getFYV(row.orderDate) === fy);
    if (entityFlt !== 'all') r = r.filter(row => row.entityName === entityFlt);
    if (search.trim()) {
      const q = search.toLowerCase();
      r = r.filter(row =>
        (row.entityName||'').toLowerCase().includes(q) ||
        (row.orderNo||'').toLowerCase().includes(q) ||
        String(row.orderId).includes(q) ||
        (row.customerPO||row.reference||'').toLowerCase().includes(q) ||
        (row.items||[]).some(it => (it.itemName||it.description||'').toLowerCase().includes(q))
      );
    }
    return r;
  }, [rows, showCleared, fy, entityFlt, search]);

  /* expand orders into item rows with rowspan metadata */
  const tableRows = useMemo(() => {
    const tRows = [];
    let seq = 0;
    filtered.forEach(row => {
      seq++;
      const items = row.items || [];
      const salesBills = (salesBillsLookup[String(row.orderId)]||[])
        .slice().sort((a,b) => new Date(a.billDate||0)-new Date(b.billDate||0));
      const receipts = (row.linkedPayments||[])
        .slice().sort((a,b) => new Date(a.date||0)-new Date(b.date||0));
      if (items.length === 0) {
        tRows.push({ row, item:null, rowSpan:1, isFirst:true, seq, salesBills, receipts });
      } else {
        items.forEach((item, idx) => {
          tRows.push({ row, item, rowSpan:idx===0?items.length:0, isFirst:idx===0, seq, salesBills, receipts });
        });
      }
    });
    return tRows;
  }, [filtered, salesBillsLookup]);

  const totals = useMemo(() => {
    let taxable = 0, gst = 0;
    tableRows.forEach(tr => {
      if (!tr.item) return;
      const qty  = parseFloat(tr.item.qty||tr.item.quantity||0);
      const rate = parseFloat(tr.item.rate||0);
      const disc = tr.item.discountType==='%'
        ? qty*rate*(parseFloat(tr.item.discount)||0)/100
        : (parseFloat(tr.item.discount)||0);
      const tx   = qty*rate-disc;
      const gp   = parseFloat(tr.item.gstPercent||tr.item.gstPct||tr.item.gst||0);
      taxable += tx;
      gst     += tx * gp / 100;
    });
    return {
      orderVal: filtered.reduce((s,r) => s+r.orderTotal, 0),
      received: filtered.reduce((s,r) => s+(activeTab==='client'?(r.received||0):(r.paid||0)), 0),
      due:      filtered.reduce((s,r) => s+Math.max(0,r.due), 0),
      taxable, gst,
    };
  }, [filtered, tableRows, activeTab]);

  const TH = ({children, right, style:sx={}}) => (
    <th style={{ padding:'8px 9px', background:'#104f4f', color:'#fff', fontWeight:700,
      fontSize:10.5, textAlign:right?'right':'left', whiteSpace:'nowrap',
      borderRight:'1px solid #2a5080', position:'sticky', top:0, zIndex:2, ...sx }}>
      {children}
    </th>
  );

  const handlePrintList = () => {
    if (filtered.length === 0) { alert('No orders to print.'); return; }
    const isVendorTab = activeTab === 'vendor';

    /* ── column definitions ── */
    let cols, rightCols, boldCols;
    if (isVendorTab) {
      // #(0) | PO No(1) | [Client Name(2)] | Vendor | PO Date | Due Date | Product | Qty×Rate | Taxable | GST% | GST Amt | PO Value | Bill No | Bill Date | Payment Date | Payment Amt | Balance Due
      cols = ['#', 'PO No'];
      if (showClientInPrint) cols.push('Client Name');
      cols.push('Vendor Name', 'PO Date', 'Due Date', 'Product / Description',
        'Qty × Rate', 'Taxable (₹)', 'GST%', 'GST Amt (₹)',
        'PO Value (₹)', 'Purchase Bill No', 'Bill Date', 'Payment Date', 'Payment Amt (₹)', 'Balance Due (₹)');
      // Qty×Rate starts at index 7 (with client) or 6 (without)
      const baseQtyIdx = showClientInPrint ? 7 : 6;
      // right-align: Qty×Rate(+0), Taxable(+1), GST Amt(+3), PO Value(+4), Payment Amt(+8), Balance Due(+9)
      rightCols = new Set([baseQtyIdx, baseQtyIdx+1, baseQtyIdx+3, baseQtyIdx+4, baseQtyIdx+8, baseQtyIdx+9]);
      boldCols  = new Set([baseQtyIdx+4, baseQtyIdx+9]);
    } else {
      // #(0) | Order No(1) | Client Name(2) | Order Date(3) | Cust PO No(4) | Due Date(5) | Product(6) | Qty×Rate(7) | Taxable(8) | GST%(9) | GST Amt(10) | Order Value(11) | Sales Bill(12) | Bill Date(13) | Receipt Date(14) | Receipt Amt(15) | Balance Due(16)
      cols = ['#', 'Order No', 'Client Name', 'Order Date', 'Cust PO No', 'Due Date',
        'Product / Description', 'Qty × Rate', 'Taxable (₹)', 'GST%', 'GST Amt (₹)',
        'Order Value (₹)', 'Sales Bill No', 'Bill Date', 'Receipt Date', 'Receipt Amt (₹)', 'Balance Due (₹)'];
      rightCols = new Set([7,8,10,11,15,16]);
      boldCols  = new Set([11,15,16]);
    }

    const pRows = [];
    const subTotalRowsMap = new Map();

    /* Group tableRows by order, preserving order of appearance */
    const orderIds2 = [];
    const orderMap2 = new Map();
    tableRows.forEach(tr => {
      const id = String(tr.row.orderId);
      if (!orderMap2.has(id)) {
        orderIds2.push(id);
        orderMap2.set(id, { row: tr.row, seq: tr.seq, items: [], receipts: tr.receipts });
      }
      if (tr.item) orderMap2.get(id).items.push(tr.item);
    });

    orderIds2.forEach(orderId => {
      const { row, seq, items, receipts } = orderMap2.get(orderId);

      const orderBills = isVendorTab
        ? (billsLookup[String(row.orderId)] || []).slice().sort((a,b)=>new Date(a.billDate||0)-new Date(b.billDate||0))
        : (salesBillsLookup[String(row.orderId)] || []).slice().sort((a,b)=>new Date(a.billDate||0)-new Date(b.billDate||0));

      /* one print-row per item OR per receipt/bill — whichever is more */
      const maxRows = Math.max(items.length || 1, orderBills.length, receipts.length, 1);

      for (let j = 0; j < maxRows; j++) {
        const item    = items[j]      || null;
        const bill    = orderBills[j] || null;
        const receipt = receipts[j]   || null;
        const isFirst = j === 0;

        const qty     = item ? parseFloat(item.qty||item.quantity||0) : 0;
        const rate    = item ? parseFloat(item.rate||0) : 0;
        const disc    = item ? (item.discountType==='%' ? qty*rate*(parseFloat(item.discount)||0)/100 : (parseFloat(item.discount)||0)) : 0;
        const taxable = qty * rate - disc;

        let row_;
        if (isVendorTab) {
          const linkedSO   = soMap[String(row.linkedSalesOrderId || '')];
          const clientName = linkedSO
            ? (linkedSO.customerName || linkedSO.clientName || linkedSO.party || '')
            : (row.clientName || '');
          row_ = [
            isFirst ? seq : '',
            isFirst ? (row.orderNo || row.poNo || '—') : '',
            ...(showClientInPrint ? [isFirst ? (clientName || '—') : ''] : []),
            isFirst ? (row.entityName || '—') : '',
            isFirst ? fmtD(row.orderDate) : '',
            isFirst ? fmtD(row.deliveryDate || row.dueDate) : '',
          ];
        } else {
          row_ = [
            isFirst ? seq : '',
            isFirst ? (row.orderNo || '—') : '',
            isFirst ? (row.entityName || '—') : '',
            isFirst ? fmtD(row.orderDate) : '',
            isFirst ? (row.customerPO || row.reference || '—') : '',
            isFirst ? fmtD(row.deliveryDate || row.dueDate) : '',
          ];
        }

        const gstPctPrint = item ? parseFloat(item.gstPercent||item.gstPct||item.gst||0) : 0;
        const gstAmtPrint = taxable * gstPctPrint / 100;
        const unitStr = item ? (item.unit||'').trim() : '';
        const qtyStr  = item ? (qty%1===0 ? qty.toFixed(0) : qty.toFixed(2)) : '';
        row_.push(
          item ? (item.itemName||item.description||'—') : '',
          item ? `${qtyStr}${unitStr?' '+unitStr:''}\n${fmt(rate)}${unitStr?'/'+unitStr:''}` : '',
          item ? fmt(taxable) : '',
          item ? `${gstPctPrint}%` : '',
          item ? fmt(gstAmtPrint) : '',
          isFirst ? fmt(row.orderTotal) : '',
          /* each bill/receipt on its own row — matching portal display */
          bill    ? (bill.billNo || bill.vendorBillNo || `B#${bill.billId}`) : '',
          bill    ? fmtD(bill.billDate) : '',
          receipt ? fmtD(receipt.date) : '',
          receipt ? fmt(parseFloat(receipt.amount)||0) : '',
          isFirst ? fmt(Math.max(0, row.due)) : '',
        );
        pRows.push(row_);
      }

      /* subtotal row for orders with multiple display rows */
      if (maxRows > 1) {
        const groupEndIdx = pRows.length - 1;
        let totTax = 0, totGst = 0;
        items.forEach(it => {
          const q = parseFloat(it.qty||it.quantity||0);
          const r2 = parseFloat(it.rate||0);
          const d = it.discountType==='%' ? q*r2*(parseFloat(it.discount)||0)/100 : (parseFloat(it.discount)||0);
          const tx = q*r2-d;
          const gp = parseFloat(it.gstPercent||it.gstPct||it.gst||0);
          totTax += tx;
          totGst += tx*gp/100;
        });
        const totRec = receipts.reduce((s,p) => s+(parseFloat(p.amount)||0), 0);
        const totDue = Math.max(0, parseFloat(row.due)||0);
        const ov     = parseFloat(row.orderTotal)||0;

        const subCells = new Array(cols.length).fill('');
        if (isVendorTab) {
          const bi = showClientInPrint ? 7 : 6;
          subCells[bi-1] = 'ORDER TOTAL';
          subCells[bi+1] = fmt(totTax);
          subCells[bi+3] = fmt(totGst);
          subCells[bi+4] = fmt(ov);
          subCells[bi+8] = fmt(totRec);
          subCells[bi+9] = fmt(totDue);
        } else {
          subCells[6]  = 'ORDER TOTAL';
          subCells[8]  = fmt(totTax);
          subCells[10] = fmt(totGst);
          subCells[11] = fmt(ov);
          subCells[15] = fmt(totRec);
          subCells[16] = fmt(totDue);
        }
        subTotalRowsMap.set(groupEndIdx, subCells);
      }
    });

    const groupEnds = new Set();
    for (let i = 0; i < pRows.length - 1; i++) {
      if (pRows[i+1][0] !== '') groupEnds.add(i);
    }
    groupEnds.add(pRows.length - 1);

    const title    = isVendorTab ? 'Payables — Vendor List' : 'Receivables — Client List';
    const subtitle = (fy==='all' ? 'All FY' : `FY ${fy}`) + (entityFlt!=='all' ? ` | ${entityFlt}` : '');
    const orient   = listPrintOpts?.orient || 'landscape';
    printListReport(title, subtitle, cols, pRows, groupEnds, rightCols, boldCols, selectedCompany, orient, subTotalRowsMap);
    setListPrintOpts(null);
  };

  const tabBtn = (tab, label) => (
    <button onClick={() => { setActiveTab(tab); setSearch(''); setEntityFlt('all'); }} style={{
      padding:'7px 18px', fontWeight:tab===activeTab?700:500, fontSize:12, fontFamily:F,
      background:tab===activeTab?'#fff':'transparent', color:tab===activeTab?P:'#6B7280',
      border:'none', cursor:'pointer', borderBottom:tab===activeTab?`2px solid ${P}`:'2px solid transparent',
      marginBottom:-2, position:'relative', zIndex:tab===activeTab?1:0,
    }}>{label}</button>
  );

  if (loading) return <div style={{ padding:40, textAlign:'center', fontFamily:F, color:'#666' }}>Loading…</div>;

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', background:BG, fontFamily:F, fontSize:12 }}>

      {printModal && (
        <PrintSelectModal
          entityName={printModal}
          orders={filtered.filter(r => r.entityName===printModal)}
          type={activeTab}
          salesBillsLookup={salesBillsLookup}
          billsLookup={billsLookup}
          grnsLookup={grnsLookup}
          companyData={selectedCompany}
          entityDetail={activeTab==='client' ? clientDetailMap[printModal] : vendorDetailMap[printModal]}
          currentUser={currentUser}
          onClose={() => setPrintModal(null)}
        />
      )}

      {/* KPI strip */}
      <div style={{ flexShrink:0, background:'#fff', borderBottom:`2px solid ${BD}`, display:'flex', alignItems:'stretch' }}>
        {[
          { label:'Total Order Value', val:`₹${fmt(totals.orderVal)}`, color:'#104f4f' },
          { label:activeTab==='client'?'Total Received':'Total Paid', val:`₹${fmt(totals.received)}`, color:'#2e7d32' },
          { label:'Total Due', val:`₹${fmt(totals.due)}`, color:'#b71c1c' },
        ].map(k => (
          <div key={k.label} style={{ padding:'6px 16px', borderRight:`1px solid ${BD}`, minWidth:140 }}>
            <div style={{ fontSize:9.5, color:'#888', textTransform:'uppercase', letterSpacing:'0.5px' }}>{k.label}</div>
            <div style={{ fontSize:14, fontWeight:800, color:k.color, marginTop:1 }}>{k.val}</div>
          </div>
        ))}
        <div style={{ flex:1 }}/>
        <div style={{ display:'flex', alignItems:'center', gap:8, padding:'0 12px', borderLeft:`1px solid ${BD}` }}>
          <label style={{ fontSize:11, display:'flex', alignItems:'center', gap:4, cursor:'pointer', color:'#555' }}>
            <input type="checkbox" checked={showCleared} onChange={e => setShowCleared(e.target.checked)}/>
            Show cleared
          </label>
          <button onClick={fetchAll} style={{ height:26, padding:'0 10px', fontSize:11, fontWeight:600,
            fontFamily:F, background:'#EEF4FF', border:`1px solid ${BD}`, color:P, borderRadius:5, cursor:'pointer' }}>
            ↻ Refresh
          </button>
        </div>
      </div>

      {/* Tabs + filter bar */}
      <div style={{ flexShrink:0, background:'#fff', borderBottom:`2px solid ${BD}`, padding:'0 14px 8px' }}>
        <div style={{ display:'flex', alignItems:'center', gap:10, borderBottom:`1px solid ${BD}`, marginBottom:8 }}>
          <div style={{ display:'flex' }}>
            {tabBtn('client', `📥 Receivable (Clients) — ${data.clientDues.length}`)}
            {tabBtn('vendor', `📤 Payable (Vendors) — ${data.vendorDues.length}`)}
          </div>
          <div style={{ flex:1 }}/>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search name / order / product…"
            style={{ height:26, width:220, borderRadius:5, border:`1px solid ${BD}`,
              padding:'0 8px', fontSize:11, fontFamily:F, outline:'none' }}/>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
          <span style={{ fontSize:10, color:'#888', fontWeight:700 }}>FY:</span>
          {fyList.map(f => {
            const active = fy===f;
            return (
              <button key={f} onClick={() => setFy(f)}
                style={{ height:24, padding:'0 10px', fontSize:10.5, fontWeight:active?700:500, fontFamily:F,
                  cursor:'pointer', borderRadius:5, border:`1px solid ${active?P:BD}`,
                  background:active?P:'#fff', color:active?'#fff':'#374151', whiteSpace:'nowrap' }}>
                {f==='all'?'All FY':`FY ${f}`}
              </button>
            );
          })}
          <span style={{ fontSize:10, color:'#888', fontWeight:700, marginLeft:8 }}>
            {activeTab==='client'?'Client':'Vendor'}:
          </span>
          <select value={entityFlt} onChange={e => setEntityFlt(e.target.value)}
            style={{ height:26, padding:'0 6px', border:`1px solid ${BD}`, borderRadius:5,
              fontSize:11, fontFamily:F, outline:'none', background:'#f9fafb', maxWidth:220 }}>
            <option value="all">All</option>
            {entityList.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
          <div style={{ marginLeft:'auto', display:'flex', gap:6, alignItems:'center' }}>
            {activeTab === 'vendor' && (
              <label style={{ display:'flex', alignItems:'center', gap:4, fontSize:11, cursor:'pointer', color:'#555', whiteSpace:'nowrap',
                padding:'3px 8px', border:`1px solid ${BD}`, borderRadius:5, background:'#f9fafb' }}>
                <input type="checkbox" checked={showClientInPrint} onChange={e => setShowClientInPrint(e.target.checked)}
                  style={{ width:13, height:13, cursor:'pointer' }}/>
                Client Name in Print
              </label>
            )}
            <div style={{ position:'relative', display:'inline-block' }}>
              <button onClick={() => setListPrintOpts(o => o ? null : { orient:'landscape' })}
                style={{ height:26, padding:'0 12px', fontSize:11, fontFamily:F, cursor:'pointer',
                  borderRadius:5, border:`1px solid ${listPrintOpts ? P : BD}`, background: listPrintOpts ? '#e8f0fe' : '#f0f4ff', color:P, fontWeight:600 }}>
                🖨 Print List ▾
              </button>
              {listPrintOpts && (
                <div style={{ position:'absolute', top:30, right:0, zIndex:200, background:'#fff', border:`1px solid ${BD}`, borderRadius:8, padding:14, width:220, boxShadow:'0 4px 16px rgba(0,0,0,0.14)', fontFamily:F }}>
                  <div style={{ fontSize:11, fontWeight:700, color:'#374151', marginBottom:10 }}>Print Options</div>
                  <div style={{ fontSize:11, fontWeight:600, color:'#6B7280', marginBottom:6 }}>Orientation</div>
                  {[['landscape','A3 Landscape (wide)'],['portrait','A3 Portrait (tall)']].map(([val,label])=>(
                    <label key={val} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8, cursor:'pointer', fontSize:12 }}>
                      <input type="radio" name="listOrient" value={val}
                        checked={listPrintOpts.orient===val}
                        onChange={()=>setListPrintOpts(o=>({...o,orient:val}))}
                        style={{ accentColor:P, cursor:'pointer' }}/>
                      <span style={{ color: listPrintOpts.orient===val ? P : '#374151', fontWeight: listPrintOpts.orient===val ? 700 : 400 }}>{label}</span>
                    </label>
                  ))}
                  <div style={{ display:'flex', gap:6, marginTop:12 }}>
                    <button onClick={()=>setListPrintOpts(null)}
                      style={{ flex:1, height:28, fontSize:11, fontFamily:F, cursor:'pointer', border:`1px solid ${BD}`, borderRadius:5, background:'#fff', color:'#6B7280' }}>
                      Cancel
                    </button>
                    <button onClick={handlePrintList}
                      style={{ flex:2, height:28, fontSize:11, fontFamily:F, cursor:'pointer', border:'none', borderRadius:5, background:P, color:'#fff', fontWeight:700 }}>
                      🖨 Print Now
                    </button>
                  </div>
                </div>
              )}
            </div>
            {entityFlt !== 'all' && (
              <button onClick={() => setPrintModal(entityFlt)}
                style={{ height:26, padding:'0 12px', fontSize:11, fontFamily:F, cursor:'pointer',
                  borderRadius:5, background:P, color:'#fff', border:'none', fontWeight:700 }}>
                🖨 Print Advice
              </button>
            )}
          </div>
        </div>
      </div>

      {message && (
        <div style={{ flexShrink:0, background:'#ffe0e0', borderBottom:'1px solid #cc4444',
          color:'#880000', padding:'4px 14px', fontSize:11 }}>{message}</div>
      )}

      {/* Table */}
      <div style={{ flex:1, overflow:'auto', padding:'8px 14px 14px' }}>
        {tableRows.length === 0 ? (
          <div style={{ padding:40, textAlign:'center', color:'#888', fontStyle:'italic',
            background:'#fff', border:`1px solid ${BD}`, borderRadius:8 }}>
            {showCleared ? 'No linked orders found.' : 'No outstanding dues. Tick "Show cleared" to see all.'}
          </div>
        ) : (
          <div style={{ background:'#fff', borderRadius:10, border:`1px solid ${BD}`,
            overflow:'auto', maxHeight:'calc(100vh - 270px)', boxShadow:'0 1px 4px rgba(0,0,0,0.05)' }}>
            {activeTab === 'client' ? (
            /* ══ RECEIVABLE TABLE (client) ══ */
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11, fontFamily:F, minWidth:1300 }}>
              <thead>
                <tr>
                  <TH style={{width:30}}>#</TH>
                  <TH>Order No</TH>
                  <TH>Client Name</TH>
                  <TH>Due Date</TH>
                  <TH>Product / Description</TH>
                  <TH right>Rate (₹)</TH>
                  <TH right style={{width:80}}>Qty</TH>
                  <TH right>Taxable (₹)</TH>
                  <TH right style={{width:55}}>GST%</TH>
                  <TH right>GST Amt (₹)</TH>
                  <TH right>Order Value (₹)</TH>
                  <TH>Sales Bill No</TH>
                  <TH>Receipt</TH>
                  <TH right style={{borderRight:'none'}}>Balance Due (₹)</TH>
                </tr>
              </thead>
              <tbody>
                {tableRows.map((tr, ridx) => {
                  const { row, item, rowSpan, isFirst, seq, salesBills, receipts } = tr;
                  const bg = seq%2===0 ? '#fff' : '#f8fbff';
                  const qty=item?parseFloat(item.qty||item.quantity||0):0;
                  const rate=item?parseFloat(item.rate||0):0;
                  const disc=item?(item.discountType==='%'?qty*rate*(parseFloat(item.discount)||0)/100:(parseFloat(item.discount)||0)):0;
                  const taxable=qty*rate-disc;
                  const gstPct=item?parseFloat(item.gstPercent||item.gstPct||item.gst||0):0;
                  const gstAmt=taxable*gstPct/100;
                  const totalReceipt=receipts.reduce((s,p)=>s+(parseFloat(p.amount)||0),0);
                  const C = (content, right=false, extra={}) => rowSpan > 0 ? (
                    <td rowSpan={rowSpan} style={{ padding:'6px 9px', borderRight:'1px solid #e5e7eb', borderBottom:'1px solid #e5e7eb', background:bg, textAlign:right?'right':'left', verticalAlign:'top', ...extra }}>{content}</td>
                  ) : null;
                  return (
                    <tr key={`${row.orderId}-${ridx}`}>
                      {C(<span style={{color:'#9ca3af',fontSize:10}}>{seq}</span>)}
                      {C(<div><div style={{fontWeight:700,color:'#1e293b'}}>{row.orderNo||'—'}</div>{(row.customerPO||row.reference)&&<div style={{fontSize:9.5,color:'#9ca3af',marginTop:1}}>{row.customerPO||row.reference}</div>}</div>)}
                      {C(<div><div style={{fontWeight:600,color:'#111827'}}>{row.entityName||'—'}</div><div style={{fontSize:9.5,color:'#9ca3af',marginTop:1}}>{fmtD(row.orderDate)}</div></div>)}
                      {C(<span style={{color:'#6b7280',whiteSpace:'nowrap'}}>{fmtD(row.deliveryDate||row.dueDate)||'—'}</span>)}
                      <td style={{padding:'6px 9px',borderRight:'1px solid #e5e7eb',borderBottom:'1px solid #e5e7eb',background:bg,color:'#374151'}}>
                        {item ? <div>{item.itemName||item.description||item.name||'—'}</div> : <span style={{color:'#9ca3af',fontStyle:'italic'}}>No items</span>}
                      </td>
                      <td style={{padding:'6px 9px',textAlign:'right',borderRight:'1px solid #e5e7eb',borderBottom:'1px solid #e5e7eb',background:bg}}>{item?fmt(rate):'—'}</td>
                      <td style={{padding:'6px 9px',textAlign:'right',borderRight:'1px solid #e5e7eb',borderBottom:'1px solid #e5e7eb',background:bg,whiteSpace:'nowrap'}}>{item?`${qty.toFixed(2)} ${item.unit||''}`.trim():'—'}</td>
                      <td style={{padding:'6px 9px',textAlign:'right',fontWeight:600,borderRight:'1px solid #e5e7eb',borderBottom:'1px solid #e5e7eb',background:bg}}>{item?fmt(taxable):'—'}</td>
                      <td style={{padding:'6px 9px',textAlign:'right',borderRight:'1px solid #e5e7eb',borderBottom:'1px solid #e5e7eb',background:bg,color:'#6b7280'}}>{item?`${gstPct}%`:'—'}</td>
                      <td style={{padding:'6px 9px',textAlign:'right',borderRight:'1px solid #e5e7eb',borderBottom:'1px solid #e5e7eb',background:bg,color:'#7c2d12'}}>{item?fmt(gstAmt):'—'}</td>
                      {rowSpan>0&&<td rowSpan={rowSpan} style={{padding:'6px 9px',textAlign:'right',borderRight:'1px solid #e5e7eb',borderBottom:'1px solid #e5e7eb',background:bg,fontWeight:700,color:'#1e293b',verticalAlign:'top',whiteSpace:'nowrap'}}>₹{fmt(row.orderTotal)}</td>}
                      {rowSpan>0&&<td rowSpan={rowSpan} style={{padding:'6px 9px',borderRight:'1px solid #e5e7eb',borderBottom:'1px solid #e5e7eb',background:bg,verticalAlign:'top',fontSize:10.5}}>
                        {salesBills.length===0?<span style={{color:'#9ca3af'}}>—</span>:salesBills.map((b,bi)=>(
                          <div key={bi} style={{marginBottom:bi<salesBills.length-1?4:0}}><div style={{fontWeight:600,color:'#104f4f',whiteSpace:'nowrap'}}>{b.billNo||`SB#${b.billId}`}</div>{b.billDate&&<div style={{fontSize:9.5,color:'#9ca3af'}}>{fmtD(b.billDate)}</div>}</div>
                        ))}
                      </td>}
                      {rowSpan>0&&<td rowSpan={rowSpan} style={{padding:'6px 9px',textAlign:'right',borderRight:'1px solid #e5e7eb',borderBottom:'1px solid #e5e7eb',background:bg,verticalAlign:'top',fontSize:10.5}}>
                        {(receipts.length===0 && !(row.linkedCreditNotes||[]).length) ? <span style={{color:'#9ca3af'}}>—</span> : <>
                          {receipts.map((p,pi)=>(<div key={pi} style={{marginBottom:4}}><div style={{color:'#2e7d32',fontWeight:600,whiteSpace:'nowrap'}}>₹{fmt(p.amount)}</div>{p.date&&<div style={{fontSize:9.5,color:'#9ca3af'}}>{fmtD(p.date)}</div>}</div>))}
                          {(row.linkedCreditNotes||[]).map((cn,ci)=>(<div key={`cn${ci}`} style={{marginBottom:4}}><div style={{color:'#7c3aed',fontWeight:600,whiteSpace:'nowrap',fontSize:10}}>CN ₹{fmt(cn.amount)}</div><div style={{fontSize:9,color:'#7c3aed',opacity:0.8}}>{cn.cnNo} {cn.date&&fmtD(cn.date)}</div></div>))}
                          {(receipts.length+(row.linkedCreditNotes||[]).length)>1&&<div style={{borderTop:'1px solid #e5e7eb',marginTop:3,paddingTop:2,fontWeight:700,color:'#1e293b'}}>₹{fmt(totalReceipt+(row.creditNotesAmt||0))}</div>}
                        </>}
                      </td>}
                      {rowSpan>0&&<td rowSpan={rowSpan} style={{padding:'6px 9px',textAlign:'right',borderBottom:'1px solid #e5e7eb',background:bg,verticalAlign:'top',fontWeight:700,fontSize:12,color:row.due<=0?'#2e7d32':'#b71c1c',whiteSpace:'nowrap'}}>{row.due<=0?'✓ Cleared':`₹${fmt(row.due)}`}</td>}
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={{ background:'#e8f0fe', position:'sticky', bottom:0, zIndex:2 }}>
                  <td colSpan={5} style={{padding:'8px 10px',fontWeight:700,color:'#104f4f',fontSize:12,borderTop:'2px solid #4a6a9a'}}>TOTAL — {filtered.length} order{filtered.length!==1?'s':''}, {tableRows.length} line items</td>
                  <td style={{borderTop:'2px solid #4a6a9a',borderLeft:'1px solid #c7d2fe'}}/>
                  <td style={{borderTop:'2px solid #4a6a9a',borderLeft:'1px solid #c7d2fe'}}/>
                  <td style={{padding:'8px 9px',textAlign:'right',fontWeight:700,borderTop:'2px solid #4a6a9a',borderLeft:'1px solid #c7d2fe',color:'#1e293b'}}>₹{fmt(totals.taxable)}</td>
                  <td style={{borderTop:'2px solid #4a6a9a',borderLeft:'1px solid #c7d2fe'}}/>
                  <td style={{padding:'8px 9px',textAlign:'right',fontWeight:700,borderTop:'2px solid #4a6a9a',borderLeft:'1px solid #c7d2fe',color:'#7c2d12'}}>₹{fmt(totals.gst)}</td>
                  <td style={{padding:'8px 9px',textAlign:'right',fontWeight:800,borderTop:'2px solid #4a6a9a',borderLeft:'1px solid #c7d2fe',color:'#104f4f',fontSize:13}}>₹{fmt(totals.orderVal)}</td>
                  <td style={{borderTop:'2px solid #4a6a9a',borderLeft:'1px solid #c7d2fe'}}/>
                  <td style={{padding:'8px 9px',textAlign:'right',fontWeight:700,borderTop:'2px solid #4a6a9a',borderLeft:'1px solid #c7d2fe',color:'#2e7d32'}}>₹{fmt(totals.received)}</td>
                  <td style={{padding:'8px 9px',textAlign:'right',fontWeight:800,borderTop:'2px solid #4a6a9a',borderLeft:'1px solid #c7d2fe',color:'#b71c1c',fontSize:13}}>₹{fmt(totals.due)}</td>
                </tr>
              </tfoot>
            </table>
            ) : (
            /* ══ PAYABLE TABLE (vendor) ══ */
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11, fontFamily:F, minWidth:1400 }}>
              <thead>
                <tr>
                  <TH style={{width:30}}>#</TH>
                  <TH>Client Name</TH>
                  <TH>Vendor Name</TH>
                  <TH>PO Date</TH>
                  <TH>PO No</TH>
                  <TH>Product / Description</TH>
                  <TH right>Rate (₹)</TH>
                  <TH right style={{width:80}}>Qty</TH>
                  <TH right>Taxable (₹)</TH>
                  <TH right style={{width:55}}>GST%</TH>
                  <TH right>GST Amt (₹)</TH>
                  <TH right>PO Value (₹)</TH>
                  <TH>Purchase Bill</TH>
                  <TH right>Payment</TH>
                  <TH right style={{borderRight:'none'}}>Balance Due (₹)</TH>
                </tr>
              </thead>
              <tbody>
                {tableRows.map((tr, ridx) => {
                  const { row, item, rowSpan, seq, salesBills, receipts } = tr;
                  const bg = seq%2===0 ? '#fff' : '#f8fbff';
                  const qty=item?parseFloat(item.qty||item.quantity||0):0;
                  const rate=item?parseFloat(item.rate||0):0;
                  const disc=item?(item.discountType==='%'?qty*rate*(parseFloat(item.discount)||0)/100:(parseFloat(item.discount)||0)):0;
                  const taxable=qty*rate-disc;
                  const gstPctV=item?parseFloat(item.gstPercent||item.gstPct||item.gst||0):0;
                  const gstAmtV=taxable*gstPctV/100;
                  const totalPayment=receipts.reduce((s,p)=>s+(parseFloat(p.amount)||0),0);
                  const linkedSO = soMap[String(row.linkedSalesOrderId||'')];
                  const clientName = linkedSO ? (linkedSO.customerName||linkedSO.clientName||linkedSO.party||'') : (row.clientName||'');
                  const C = (content, right=false, extra={}) => rowSpan > 0 ? (
                    <td rowSpan={rowSpan} style={{ padding:'6px 9px', borderRight:'1px solid #e5e7eb', borderBottom:'1px solid #e5e7eb', background:bg, textAlign:right?'right':'left', verticalAlign:'top', ...extra }}>{content}</td>
                  ) : null;
                  return (
                    <tr key={`${row.orderId}-${ridx}`}>
                      {C(<span style={{color:'#9ca3af',fontSize:10}}>{seq}</span>)}
                      {C(<div style={{fontWeight:600,color:'#1e40af'}}>{clientName||<span style={{color:'#9ca3af',fontStyle:'italic'}}>—</span>}</div>)}
                      {C(<div><div style={{fontWeight:600,color:'#111827'}}>{row.entityName||'—'}</div></div>)}
                      {C(<span style={{color:'#6b7280',whiteSpace:'nowrap',fontSize:10.5}}>{fmtD(row.orderDate)||'—'}</span>)}
                      {C(<div style={{fontWeight:700,color:'#1e293b',whiteSpace:'nowrap'}}>{row.orderNo||'—'}</div>)}
                      <td style={{padding:'6px 9px',borderRight:'1px solid #e5e7eb',borderBottom:'1px solid #e5e7eb',background:bg,color:'#374151'}}>
                        {item ? <div>{item.itemName||item.description||item.name||'—'}{item.isAddon&&<span style={{fontSize:9,marginLeft:4,padding:'1px 4px',background:'#fff3e0',color:'#b45309',border:'1px solid #fbbf24',borderRadius:2,fontWeight:700}}>Add-on</span>}</div> : <span style={{color:'#9ca3af',fontStyle:'italic'}}>No items</span>}
                      </td>
                      <td style={{padding:'6px 9px',textAlign:'right',borderRight:'1px solid #e5e7eb',borderBottom:'1px solid #e5e7eb',background:bg}}>{item?fmt(rate):'—'}</td>
                      <td style={{padding:'6px 9px',textAlign:'right',borderRight:'1px solid #e5e7eb',borderBottom:'1px solid #e5e7eb',background:bg,whiteSpace:'nowrap'}}>{item?`${qty.toFixed(2)} ${item.unit||''}`.trim():'—'}</td>
                      <td style={{padding:'6px 9px',textAlign:'right',fontWeight:600,borderRight:'1px solid #e5e7eb',borderBottom:'1px solid #e5e7eb',background:bg}}>{item?fmt(taxable):'—'}</td>
                      <td style={{padding:'6px 9px',textAlign:'right',borderRight:'1px solid #e5e7eb',borderBottom:'1px solid #e5e7eb',background:bg,color:'#6b7280'}}>{item?`${gstPctV}%`:'—'}</td>
                      <td style={{padding:'6px 9px',textAlign:'right',borderRight:'1px solid #e5e7eb',borderBottom:'1px solid #e5e7eb',background:bg,color:'#7c2d12'}}>{item?fmt(gstAmtV):'—'}</td>
                      {rowSpan>0&&<td rowSpan={rowSpan} style={{padding:'6px 9px',textAlign:'right',borderRight:'1px solid #e5e7eb',borderBottom:'1px solid #e5e7eb',background:bg,fontWeight:700,color:'#1e293b',verticalAlign:'top',whiteSpace:'nowrap'}}>₹{fmt(row.orderTotal)}</td>}
                      {rowSpan>0&&<td rowSpan={rowSpan} style={{padding:'6px 9px',borderRight:'1px solid #e5e7eb',borderBottom:'1px solid #e5e7eb',background:bg,verticalAlign:'top',fontSize:10.5}}>
                        {salesBills.length===0?<span style={{color:'#9ca3af'}}>—</span>:salesBills.map((b,bi)=>(
                          <div key={bi} style={{marginBottom:bi<salesBills.length-1?4:0}}><div style={{fontWeight:600,color:'#7c3aed',whiteSpace:'nowrap'}}>{b.billNo||`PB#${b.billId}`}</div>{b.billDate&&<div style={{fontSize:9.5,color:'#9ca3af'}}>{fmtD(b.billDate)}</div>}</div>
                        ))}
                      </td>}
                      {rowSpan>0&&<td rowSpan={rowSpan} style={{padding:'6px 9px',textAlign:'right',borderRight:'1px solid #e5e7eb',borderBottom:'1px solid #e5e7eb',background:bg,verticalAlign:'top',fontSize:10.5}}>
                        {(receipts.length===0 && !(row.linkedDebitNotes||[]).length) ? <span style={{color:'#9ca3af'}}>—</span> : <>
                          {receipts.map((p,pi)=>(<div key={pi} style={{marginBottom:4}}><div style={{color:'#2e7d32',fontWeight:600,whiteSpace:'nowrap'}}>₹{fmt(p.amount)}</div>{p.date&&<div style={{fontSize:9.5,color:'#9ca3af'}}>{fmtD(p.date)}</div>}</div>))}
                          {(row.linkedDebitNotes||[]).map((dn,di)=>(<div key={`dn${di}`} style={{marginBottom:4}}><div style={{color:'#b45309',fontWeight:600,whiteSpace:'nowrap',fontSize:10}}>DN ₹{fmt(dn.amount)}</div><div style={{fontSize:9,color:'#b45309',opacity:0.8}}>{dn.dnNo} {dn.date&&fmtD(dn.date)}</div></div>))}
                          {(receipts.length+(row.linkedDebitNotes||[]).length)>1&&<div style={{borderTop:'1px solid #e5e7eb',marginTop:3,paddingTop:2,fontWeight:700,color:'#1e293b'}}>₹{fmt(totalPayment+(row.debitNotesAmt||0))}</div>}
                        </>}
                      </td>}
                      {rowSpan>0&&<td rowSpan={rowSpan} style={{padding:'6px 9px',textAlign:'right',borderBottom:'1px solid #e5e7eb',background:bg,verticalAlign:'top',fontWeight:700,fontSize:12,color:row.due<=0?'#2e7d32':'#b71c1c',whiteSpace:'nowrap'}}>{row.due<=0?'✓ Paid':`₹${fmt(row.due)}`}</td>}
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={{ background:'#e8f0fe', position:'sticky', bottom:0, zIndex:2 }}>
                  <td colSpan={6} style={{padding:'8px 10px',fontWeight:700,color:'#104f4f',fontSize:12,borderTop:'2px solid #4a6a9a'}}>TOTAL — {filtered.length} order{filtered.length!==1?'s':''}, {tableRows.length} line items</td>
                  <td style={{borderTop:'2px solid #4a6a9a',borderLeft:'1px solid #c7d2fe'}}/>
                  <td style={{borderTop:'2px solid #4a6a9a',borderLeft:'1px solid #c7d2fe'}}/>
                  <td style={{padding:'8px 9px',textAlign:'right',fontWeight:700,borderTop:'2px solid #4a6a9a',borderLeft:'1px solid #c7d2fe',color:'#1e293b'}}>₹{fmt(totals.taxable)}</td>
                  <td style={{borderTop:'2px solid #4a6a9a',borderLeft:'1px solid #c7d2fe'}}/>
                  <td style={{padding:'8px 9px',textAlign:'right',fontWeight:700,borderTop:'2px solid #4a6a9a',borderLeft:'1px solid #c7d2fe',color:'#7c2d12'}}>₹{fmt(totals.gst)}</td>
                  <td style={{padding:'8px 9px',textAlign:'right',fontWeight:800,borderTop:'2px solid #4a6a9a',borderLeft:'1px solid #c7d2fe',color:'#104f4f',fontSize:13}}>₹{fmt(totals.orderVal)}</td>
                  <td style={{borderTop:'2px solid #4a6a9a',borderLeft:'1px solid #c7d2fe'}}/>
                  <td style={{padding:'8px 9px',textAlign:'right',fontWeight:700,borderTop:'2px solid #4a6a9a',borderLeft:'1px solid #c7d2fe',color:'#2e7d32'}}>₹{fmt(totals.received)}</td>
                  <td style={{padding:'8px 9px',textAlign:'right',fontWeight:800,borderTop:'2px solid #4a6a9a',borderLeft:'1px solid #c7d2fe',color:'#b71c1c',fontSize:13}}>₹{fmt(totals.due)}</td>
                </tr>
              </tfoot>
            </table>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ViewDues;
