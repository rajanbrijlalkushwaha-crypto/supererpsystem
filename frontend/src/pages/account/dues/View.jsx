import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { px } from '../../../utils/uiScale';
import axios from 'axios';
import { useLocation } from 'react-router-dom';
import { useCompany } from '../../../context/CompanyContext';
import { useAuth } from '../../../context/AuthContext';
import { withPrintFont } from '../../../utils/printFont';
import FyDropdown from '../../../components/FyDropdown';
import { useNavTheme } from '../../../utils/navTheme';

const fmt  = n => (parseFloat(n) || 0).toFixed(2);
const fmtD = d => {
  if (!d) return '—';
  const dt = new Date(d);
  return isNaN(dt) ? d : `${String(dt.getDate()).padStart(2,'0')}-${String(dt.getMonth()+1).padStart(2,'0')}-${dt.getFullYear()}`;
};
const F  = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const BD = '#E5EAF2';
const P  = '#3A6186';
const PD = '#2A4D6E';
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
      const pmtNarr = pmt.isJournal ? ['Journal', pmt.referenceNo, pmt.narration].filter(Boolean).join(' — ')
        : ['Payment', pmt.referenceNo, pmt.paymentMode, pmt.isSplit ? `share of ₹${fmt(pmt.fullAmount)}` : ''].filter(Boolean).join(' — ');
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
  w.document.write(withPrintFont(html));
  w.document.close();
  w.onload = () => w.print();
}

/* ══════════════════════════════════════════════════════════
   PRINT — Format-01 (compact single-block slip per PO, A4 portrait)
══════════════════════════════════════════════════════════ */
function printFormat01(entityName, groupRows, type, companyData, entityDetail, currentUser, soMap) {
  const isVend = type === 'vendor';
  const logoUrl = (companyData?.logoFileName && companyData?.companyId)
    ? `/api/companies/logo/${encodeURIComponent(companyData.logoFileName)}?companyId=${companyData.companyId}`
    : '';

  const coHeader = `
    <div class="co-hdr">
      ${logoUrl ? `<img src="${logoUrl}" alt="logo" class="co-logo-img" onerror="this.style.display='none'">` : ''}
      <div class="co-name">${companyData?.companyName || 'Epsilon Enterprise'}</div>
      <div class="co-addr">${[companyData?.address, companyData?.city, companyData?.state, companyData?.pincode].filter(Boolean).join(', ')}</div>
    </div>`;

  const blocks = groupRows.map((row, idx) => {
    const items = row.items || [];

    const vendorName = isVend ? entityName : (companyData?.companyName || '—');
    const linkedSO    = isVend ? (soMap && soMap[String(row.linkedSalesOrderId || '')]) : null;
    const clientName  = isVend
      ? (linkedSO ? (linkedSO.customerName || linkedSO.clientName || linkedSO.party || '') : (row.clientName || '—'))
      : entityName;

    const poNo     = row.orderNo || row.poNo || '—';
    /* "Order ID File no" = the File No. of the linked Sales Order this PO
       was raised against (e.g. EPSSO2627001) — not the PO's own internal id */
    const orderId  = linkedSO ? (linkedSO.orderNo || linkedSO.poNo || '—') : (row.linkedSalesOrderId || '—');
    const poDate   = fmtD(row.orderDate);
    const dueDate  = fmtD(row.deliveryDate || row.dueDate);

    const payments = row.linkedPayments || [];
    const paid     = payments.reduce((s,p) => s+(parseFloat(p.amount)||0), 0);
    const poValue  = parseFloat(row.orderTotal) || 0;

    /* each payment's amount + date stacked in the Paid cell, with a bold
       total underneath — matches the ledger-style reference layout */
    const paidCellHtml = payments.length
      ? payments.map(p => `<div class="pmt-line"><div class="pmt-amt">₹${fmt(p.amount)}</div><div class="pmt-date">${fmtD(p.date)}${p.isJournal ? ` · JV #${p.journalId}${p.narration ? ' ' + p.narration : ''}` : ''}</div></div>`).join('')
        + `<div class="pmt-total">₹${fmt(paid)}</div>`
      : (paid ? fmt(paid) : '');

    let sumTaxable = 0, sumGst = 0;
    const itemRows = items.map(it => {
      const qty  = parseFloat(it.qty||it.quantity||0);
      const rate = parseFloat(it.rate||0);
      const disc = it.discountType==='%' ? qty*rate*(parseFloat(it.discount)||0)/100 : (parseFloat(it.discount)||0);
      const taxable = qty*rate - disc;
      const gstPct  = parseFloat(it.gstPercent||it.gstPct||it.gst||0);
      const gstAmt  = taxable * gstPct / 100;
      sumTaxable += taxable;
      sumGst     += gstAmt;
      return { material: it.itemName||it.description||'—', qty, rate, taxable, gstAmt };
    });

    /* PO Value / Paid / Dues belong in their own columns, not in the total
       row — but rather than cramming them into item row 1's natural height
       (which stretched that single row and left a gap before row 2), they
       use rowspan to merge across all item rows, so the tall payment list
       fills the whole merged block evenly instead of distorting one row. */
    const n = itemRows.length;
    const itemRowsHtml = itemRows.map((r, j) => `<tr>
      <td class="c">${j+1}</td>
      <td>${r.material}</td>
      <td class="c">${r.qty||''}</td>
      <td class="r">${fmt(r.rate)}</td>
      <td class="r">${fmt(r.taxable)}</td>
      <td class="r">${fmt(r.gstAmt)}</td>
      ${j===0 ? `<td class="r" rowspan="${n}">${fmt(poValue)}</td>` : ''}
      ${j===0 ? `<td class="r pmt-cell" rowspan="${n}">${paidCellHtml}</td>` : ''}
      ${j===0 ? `<td class="r" rowspan="${n}">${fmt(poValue-paid)}</td>` : ''}
    </tr>`).join('') || `<tr><td colspan="9" class="c eg">No items</td></tr>`;

    /* total row — Taxable/GST sums only; PO Value/Paid/Dues already shown
       via the rowspanned cells above, so those 3 columns stay blank here */
    const totRowHtml = `<tr class="tot-row">
      <td></td><td class="fw">Total</td><td></td><td></td>
      <td class="r fw">${fmt(sumTaxable)}</td>
      <td class="r fw">${fmt(sumGst)}</td>
      <td></td><td></td><td></td>
    </tr>`;

    /* Dues-with-GST / Dues-without-GST + payment-progress footnote */
    const duesWithGst = poValue - paid;      // PO value incl. GST − paid
    const duesWoGst   = sumTaxable - paid;   // basic (taxable) value − paid
    const pctBasicPaid   = sumTaxable > 0 ? (paid / sumTaxable * 100) : 0;
    const pctWithGstPaid = poValue   > 0 ? (paid / poValue   * 100) : 0;

    return `
    <div class="f01-block${idx>0?' page-break':''}">
      ${coHeader}
      <table class="f01-info">
        <tr>
          <td class="lbl">Vendor Name</td><td class="cn">:</td><td class="val">${vendorName}</td>
          <td class="lbl">Client Name</td><td class="cn">:</td><td class="val">${clientName}</td>
        </tr>
        <tr>
          <td class="lbl">Po Date</td><td class="cn">:</td><td class="val">${poDate}</td>
          <td class="lbl">Order ID File no</td><td class="cn">:</td><td class="val">${orderId}</td>
        </tr>
        <tr>
          <td class="lbl">PO No</td><td class="cn">:</td><td class="val">${poNo}</td>
          <td class="lbl">due Date</td><td class="cn">:</td><td class="val">${dueDate}</td>
        </tr>
      </table>
      <div class="sect-bar">Order Description</div>
      <table class="f01-item">
        <thead><tr>
          <th class="c" style="width:32px">Sr No</th>
          <th>Material</th>
          <th class="c" style="width:40px">Qty</th>
          <th class="r" style="width:72px">Rate</th>
          <th class="r" style="width:80px">Taxable</th>
          <th class="r" style="width:64px">GST</th>
          <th class="r" style="width:80px">PO Value</th>
          <th class="r" style="width:64px">Paid</th>
          <th class="r" style="width:72px">Dues</th>
        </tr></thead>
        <tbody>
          ${itemRowsHtml}
          ${totRowHtml}
        </tbody>
      </table>
      <table class="f01-foot">
        <tr><td class="lbl">Dues with GST</td><td class="val r">${fmt(duesWithGst)}</td><td class="lbl">% of with GST Paid</td><td class="val r">${pctWithGstPaid.toFixed(2)}%</td></tr>
        <tr><td class="lbl">Dues W/o GST</td><td class="val r">${fmt(duesWoGst)}</td><td class="lbl">% of Basic Paid</td><td class="val r">${pctBasicPaid.toFixed(2)}%</td></tr>
      </table>
      <div class="words">Amount in Words: ${numToWords(poValue)}</div>
    </div>`;
  }).join('');

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
  <title>Format-01 — ${entityName}</title>
  <style>
    @page { size: A4 portrait; margin: 10mm 12mm; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 10.5pt; color: #000; }
    .f01-block { padding-bottom: 6mm; }
    .page-break { page-break-before: always; }
    .co-hdr      { text-align: center; padding-bottom: 6px; }
    .co-logo-img { height: 42px; margin-bottom: 3px; display: block; margin-left: auto; margin-right: auto; }
    .co-name     { font-size: 15pt; font-weight: 900; color: #104f4f; }
    .co-addr     { font-size: 8.5pt; color: #333; margin-top: 2px; }
    table { border-collapse: collapse; width: 100%; }
    /* info grid — thick outer frame only, no internal row lines; labels/values bold */
    .f01-info { border: 2px solid #000; margin-top: 6px; font-size: 10pt; }
    .f01-info td { border: none; padding: 4px 6px; }
    .f01-info .lbl { color: #0b4a8a; font-weight: 400 !important; width: 16%; }
    .f01-info .cn  { width: 1%; text-align: center; color: #0b4a8a; font-weight: 400 !important; }
    .f01-info .val { color: #b45309; font-weight: 900 !important; width: 33%; }
    .sect-bar { text-align: center; font-size: 10pt; font-weight: 800; border: 2px solid #000;
                border-top: none; padding: 3px; letter-spacing: 0.4px; }
    /* item table — full grid on the header row; body rows keep column
       (vertical) borders but no row (horizontal) lines between them.
       The boxed .tot-row (Taxable/GST totals) closes off the item block. */
    .f01-item { border: 2px solid #000; font-size: 9.5pt; margin-top: -2px; }
    .f01-item th { border: 1px solid #000; padding: 4px 5px; background: #fff; font-weight: 800; text-align: left; }
    .f01-item td { border-left: 1px solid #000; border-right: 1px solid #000; border-top: none; border-bottom: none; padding: 3px 5px; vertical-align: top; }
    .f01-item td:first-child { border-left: none; }
    .f01-item td:last-child { border-right: none; }
    .f01-item .tot-row td { border-top: 1.5px solid #000 !important; border-bottom: 1.5px solid #000 !important; padding-top: 4px; padding-bottom: 4px; }
    .pmt-cell { padding: 2px 5px !important; }
    .pmt-line { margin-bottom: 2px; }
    .pmt-amt  { font-weight: 700; }
    .pmt-date { font-size: 8pt; color: #000; font-weight: 400; }
    .pmt-total { border-top: 1.5px solid #000; margin-top: 2px; padding-top: 2px; font-weight: 800; }
    .fw { font-weight: 700; }
    .r { text-align: right; }
    .c { text-align: center; }
    .eg { color: #aaa; font-style: italic; }
    /* footnote box (Dues + payment % progress) — thick outer frame only */
    .f01-foot { border: 2px solid #000; border-top: none; margin-top: -2px; font-size: 10pt; }
    .f01-foot td { border: none; padding: 5px 8px; }
    .f01-foot .lbl { font-weight: 700; width: 25%; white-space: nowrap; }
    .f01-foot .val { font-weight: 800; width: 25%; }
    .words { border: 2px solid #000; border-top: none; margin-top: -2px; padding: 5px 6px; font-size: 9.5pt; font-style: italic; }
    @media print { body { margin: 0; } .page-break { page-break-before: always; } }
  </style></head><body>
  ${blocks}
  </body></html>`;

  const w = window.open('', '_blank');
  w.document.write(withPrintFont(html));
  w.document.close();
  w.onload = () => w.print();
}

/* ══════════════════════════════════════════════════════════
   PRINT LIST REPORT (tabular summary, company header + orientation)
══════════════════════════════════════════════════════════ */
const printListReport = async (title, subtitle, cols, rows, groupEnds, rightColsSet, boldColsSet, company, orientation='landscape', subTotalRows=null, grandCells=null) => {
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
        cl.includes('description') || cl.includes('bill') ||
        cl.includes('narration') || cl.includes('invoice') || cl.endsWith(' no')) {
      wrapCols.add(ci);
    }
  });

  /* ── proportional column widths ──
     table-layout:fixed + a <colgroup> keeps narrow columns (dates, #,
     GST%) at a sane width and gives the long Product/Description column
     the room it needs, instead of letting the browser's auto layout
     squeeze every column down until header text breaks mid-word. */
  const colWeight = (label) => {
    const l = String(label).toLowerCase();
    if (l === '#') return 2.5;
    if (l.includes('description') || l.includes('product')) return 19;
    if (l.includes('name')) return 8.5;
    if (l.includes('no') && !l.includes('gst')) return 7.5;   // PO No / Order No
    if (l.includes('date')) return 6.5;
    if (l.includes('gst%')) return 4;
    if (l.includes('qty')) return 8;
    return 7;   // Taxable / GST Amt / Order-PO Value / Payment Amt / Balance Due
  };
  const rawWeights = cols.map(colWeight);
  const totalW = rawWeights.reduce((a,b) => a+b, 0);
  const colWidths = rawWeights.map(w => (w/totalW*100).toFixed(2)+'%');
  const colgroupHtml = `<colgroup>${colWidths.map(w=>`<col style="width:${w};">`).join('')}</colgroup>`;

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

  const tfootHtml = grandCells ? `<tfoot><tr>${grandCells.map((c,ci) => {
    const tc=[]; if(rightCols.has(ci)) tc.push('r');
    const clsStr=tc.length?` class="${tc.join(' ')}"`:''
    const val=c?String(c).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'):'';
    return `<td${clsStr}>${val}</td>`;
  }).join('')}</tr></tfoot>` : '';

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
/* ── Table — every column/row boundary in solid black ── */
table{width:100%;border-collapse:collapse;border:2px solid #000;table-layout:fixed;}
thead{display:table-header-group;}
thead tr th{
  background:#104f4f;color:#fff;
  padding:7px 6px;font-size:9.5pt;font-weight:700;
  text-align:left;border:1px solid #000;white-space:normal;overflow-wrap:break-word;line-height:1.25;
}
thead tr th.r{text-align:right;}
tbody tr td{
  padding:6px 7px;font-size:10pt;
  border:1px solid #000;
  border-top:none;border-bottom:none;
  vertical-align:middle;color:#111;line-height:1.4;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
  background:#fff;
}
tbody tr td.wc{white-space:normal;overflow-wrap:break-word;overflow:visible;text-overflow:clip;}
tbody tr.grp-end td{border-bottom:2px solid #000 !important;}
tbody tr.sub-row td{
  background:#fefce8 !important;
  font-weight:800;font-size:11.5pt;
  border-top:1px solid #000 !important;
  border-bottom:2px solid #000 !important;
  color:#000;
}
tfoot tr td{
  padding:9px 11px;font-size:12pt;font-weight:800;
  border:1.5px solid #000;background:#dbeafe;color:#000;
}
.r{text-align:right;}.b{font-weight:700;color:#000;}
/* ── Footer ── */
.foot{margin-top:14px;font-size:9.5pt;color:#555;display:flex;justify-content:space-between;align-items:flex-start;border-top:1px solid #aaa;padding-top:6px;}
.foot-url{color:#104f4f;font-weight:600;}
@media print{
  @page{margin:5mm;size:A3 ${orientation};}
  .pg{padding:0;}
  thead{display:table-header-group;}
  table{page-break-inside:auto;width:100%;table-layout:fixed;}
  tr{page-break-inside:avoid;page-break-after:auto;}
  thead tr th{
    -webkit-print-color-adjust:exact;print-color-adjust:exact;
    background:#104f4f !important;color:#fff !important;
    font-size:8pt;padding:5px 4px;white-space:normal;overflow-wrap:break-word;line-height:1.2;
    border:1px solid #000 !important;
  }
  tbody tr td{font-size:8.5pt;padding:4px 5px;border:1px solid #000 !important;border-top:none !important;border-bottom:none !important;background:#fff !important;-webkit-print-color-adjust:exact;print-color-adjust:exact;overflow:hidden;text-overflow:ellipsis;}
  tbody tr td.wc{overflow:visible;text-overflow:clip;}
  tbody tr.grp-end td{border-bottom:2px solid #000 !important;}
  tbody tr.sub-row td{font-size:9pt;padding:5px 6px;-webkit-print-color-adjust:exact;print-color-adjust:exact;background:#fefce8 !important;color:#000 !important;}
  tfoot tr td{font-size:9.5pt;padding:6px 7px;-webkit-print-color-adjust:exact;print-color-adjust:exact;background:#dbeafe !important;color:#000 !important;border:1.5px solid #000 !important;}
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
${colgroupHtml}
<thead><tr>${cols.map((c,ci)=>`<th${rightCols.has(ci)?' class="r"':''}>${c}</th>`).join('')}</tr></thead>
<tbody>${rHtml}</tbody>
${tfootHtml}
</table>
<div class="foot">
  <span>Printed by Super ERP System &nbsp;|&nbsp; ${today2}</span>
  ${pageUrl ? `<span class="foot-url">${pageUrl}</span>` : ''}
</div>
</div><script>window.onload=()=>setTimeout(()=>window.print(),400);<\/script>
</body></html>`;
  const w=window.open('','_blank','width=1500,height=900,scrollbars=yes');
  if(!w){alert('Allow pop-ups to print.');return;}
  w.document.write(withPrintFont(html)); w.document.close();
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
function PrintSelectModal({ entityName, orders, type, salesBillsLookup, billsLookup, grnsLookup, companyData, entityDetail, currentUser, onClose, format='advice', soMap }) {
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
    if (format === 'format01') {
      printFormat01(entityName, selected, type, companyData, entityDetail, currentUser, soMap);
    } else {
      printAdvice(entityName, selected, type, companyData, entityDetail, billsLookup, salesBillsLookup, grnsLookup, currentUser);
    }
    onClose();
  };

  const isF01 = format === 'format01';

  /* format01 needs more scan-at-a-glance info per row to pick orders */
  const f01Row = (o) => {
    const linkedSO = soMap && soMap[String(o.linkedSalesOrderId || '')];
    const fileNo    = linkedSO ? (linkedSO.orderNo || linkedSO.poNo || '—') : (o.linkedSalesOrderId || '—');
    const clientName = linkedSO
      ? (linkedSO.customerName || linkedSO.clientName || linkedSO.party || '—')
      : (o.clientName || '—');
    const material = (o.items || []).map(it => it.itemName || it.description).filter(Boolean).join(', ') || '—';
    return { fileNo, clientName, material };
  };

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', zIndex:1000,
      display:'flex', alignItems:'center', justifyContent:'center', fontFamily:F }}>
      <div style={{ background:'#fff', borderRadius:10, width:isF01?900:540, maxWidth:'95vw', maxHeight:'82vh',
        display:'flex', flexDirection:'column', boxShadow:'0 8px 32px rgba(0,0,0,0.2)' }}>
        <div style={{ background:P, color:'#fff', padding:'11px 16px', borderRadius:'10px 10px 0 0',
          display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <span style={{ fontWeight:700, fontSize:13 }}>🖨 Print {isF01?'Format-01':'Advice'} — {entityName}</span>
          <button onClick={onClose} style={{ background:'none', border:'none', color:'#fff', fontSize:18, cursor:'pointer', lineHeight:1 }}>✕</button>
        </div>
        <div style={{ padding:'8px 16px', borderBottom:`1px solid ${BD}`, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <span style={{ fontSize:11, color:'#555' }}>Select orders to include in print:</span>
          <button onClick={toggleAll} style={{ fontSize:11, cursor:'pointer', padding:'3px 10px',
            border:`1px solid ${BD}`, borderRadius:4, background:'#f9fafb', fontFamily:F }}>
            {allSel ? 'Unselect All' : 'Select All'}
          </button>
        </div>

        {isF01 && (
          <div style={{ display:'flex', alignItems:'center', gap:10, padding:'6px 16px', background:'#f3f6fb',
            borderBottom:`1px solid ${BD}`, fontSize:10, fontWeight:700, color:'#6B7280', textTransform:'uppercase' }}>
            <span style={{ width:14 }}/>
            <span style={{ width:90 }}>File No</span>
            <span style={{ width:130 }}>Client</span>
            <span style={{ width:110 }}>Vendor</span>
            <span style={{ width:76 }}>Po Date</span>
            <span style={{ width:120 }}>PO No</span>
            <span style={{ flex:1 }}>Material</span>
            <span style={{ width:90, textAlign:'right' }}>PO Value</span>
          </div>
        )}

        <div style={{ flex:1, overflow:'auto' }}>
          {orders.map((o, i) => isF01 ? (
            <label key={o.orderId} style={{ display:'flex', alignItems:'center', gap:10, padding:'7px 16px',
              borderBottom:`1px solid ${BD}`, cursor:'pointer', background:i%2===0?'#fff':'#f8faff' }}>
              <input type="checkbox" checked={!!checked[o.orderId]} onChange={()=>toggle(o.orderId)}
                style={{ width:14, height:14, cursor:'pointer', flexShrink:0 }}/>
              {(() => { const r = f01Row(o); return (<>
                <span style={{ width:90, fontSize:11, color:'#555', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{r.fileNo}</span>
                <span style={{ width:130, fontSize:11, fontWeight:600, color:'#1e40af', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{r.clientName}</span>
                <span style={{ width:110, fontSize:11, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{entityName}</span>
                <span style={{ width:76, fontSize:11, color:'#999' }}>{fmtD(o.orderDate)}</span>
                <span style={{ width:120, fontSize:11, color:'#555', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{o.orderNo||'—'}</span>
                <span style={{ flex:1, fontSize:11, color:'#333', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }} title={r.material}>{r.material}</span>
                <span style={{ width:90, fontSize:12, fontWeight:700, textAlign:'right' }}>₹{fmt(o.orderTotal)}</span>
              </>); })()}
            </label>
          ) : (
            <label key={o.orderId} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 16px',
              borderBottom:`1px solid ${BD}`, cursor:'pointer', background:i%2===0?'#fff':'#f8faff' }}>
              <input type="checkbox" checked={!!checked[o.orderId]} onChange={()=>toggle(o.orderId)}
                style={{ width:14, height:14, cursor:'pointer' }}/>
              <span style={{ fontWeight:700, color:P, fontSize:12, minWidth:72 }}>#{o.orderId}</span>
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
   COMBINED ENTITY SEARCH + SELECT BOX
══════════════════════════════════════════════════════════ */
function DuesSearchBox({ entityList, entityFlt, setEntityFlt, search, setSearch, activeTab }) {
  const [open, setOpen] = React.useState(false);
  const [q, setQ]       = React.useState('');
  const ref             = useRef();
  const inputRef        = useRef();
  const [pos, setPos]   = React.useState({ top:0, left:0, width:200 });

  React.useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const openDrop = () => {
    if (inputRef.current) {
      const r = inputRef.current.getBoundingClientRect();
      setPos({ top: px(r.bottom + window.scrollY) + 2, left: px(r.left + window.scrollX), width: Math.max(px(r.width), 220) });
    }
    setQ(''); setOpen(true);
  };

  const filteredEnt = q.trim()
    ? entityList.filter(n => n.toLowerCase().includes(q.toLowerCase()))
    : entityList;

  const handleSelect = name => {
    setEntityFlt(name); setSearch(''); setQ(''); setOpen(false);
  };
  const handleClear = () => {
    setEntityFlt('all'); setSearch(''); setQ(''); setOpen(false);
  };
  const handleType = e => {
    const v = e.target.value;
    setQ(v);
    setSearch(v);
    if (entityFlt !== 'all') setEntityFlt('all');
    setOpen(true);
  };

  const displayVal = open ? q : (entityFlt !== 'all' ? entityFlt : search);
  const placeholder = `${activeTab==='client'?'Client':'Vendor'} name or order…`;

  return (
    <div ref={ref} style={{ position:'relative', minWidth:160, maxWidth:220, alignSelf:'center', margin:'0 5px' }}>
      <style>{`.dues-cb::placeholder{color:rgba(255,255,255,0.45)}`}</style>
      <input
        ref={inputRef}
        value={displayVal}
        onChange={handleType}
        onFocus={openDrop}
        placeholder={placeholder}
        className="dues-cb"
        style={{ width:'100%', height:26, padding:`0 ${entityFlt!=='all'||search?'22px':'8px'} 0 8px`,
          border:'1px solid rgba(255,255,255,0.25)', borderRadius:5, fontSize:11, fontFamily:F,
          outline:'none', background:'rgba(255,255,255,0.12)', color:'#fff', boxSizing:'border-box' }}
      />
      {(entityFlt !== 'all' || search) && (
        <button onMouseDown={e => { e.preventDefault(); handleClear(); }}
          style={{ position:'absolute', right:5, top:'50%', transform:'translateY(-50%)',
            background:'none', border:'none', color:'rgba(255,255,255,0.7)', cursor:'pointer', fontSize:11, padding:0, lineHeight:1 }}>
          ✕
        </button>
      )}
      {open && (
        <div style={{ position:'fixed', top:pos.top, left:pos.left, width:pos.width,
          zIndex:99999, background:'#fff', border:`1px solid ${BD}`, borderRadius:7,
          maxHeight:220, overflowY:'auto', boxShadow:'0 6px 24px rgba(0,0,0,0.18)' }}>
          {filteredEnt.length === 0
            ? <div style={{ padding:'10px 14px', fontSize:12, color:'#999' }}>No match for "{q}"</div>
            : filteredEnt.map(n => (
              <div key={n} onMouseDown={() => handleSelect(n)}
                style={{ padding:'7px 14px', cursor:'pointer', fontSize:12, fontFamily:F,
                  background: n===entityFlt ? '#EEF4FF' : '#fff', color: n===entityFlt ? P : '#111',
                  fontWeight: n===entityFlt ? 700 : 400, borderBottom:'1px solid #f1f5f9' }}
                onMouseEnter={e => { if (n!==entityFlt) e.currentTarget.style.background='#f8faff'; }}
                onMouseLeave={e => { if (n!==entityFlt) e.currentTarget.style.background='#fff'; }}>
                {n}
              </div>
            ))
          }
        </div>
      )}
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

  /* respect ?tab=client or ?tab=vendor from sidebar shortcuts */
  const { search: locSearch } = useLocation();
  const tabParam = new URLSearchParams(locSearch).get('tab');
  const lockedTab = tabParam === 'client' || tabParam === 'vendor' ? tabParam : null;

  const [activeTab,   setActiveTab]   = useState(lockedTab || 'client');
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
  const neu = useNavTheme()[0] === 'neu';
  const [entityFlt,   setEntityFlt]   = useState('all');
  const [printModal,      setPrintModal]      = useState(null);
  const [printFormat,     setPrintFormat]     = useState('advice');
  const [showClientInPrint, setShowClientInPrint] = useState(true);
  const [listPrintOpts,   setListPrintOpts]   = useState(null); // { mode:'landscape'|'portrait'|'format01' } or null

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
    set.add(getFYV(null));               // the current FY is always offered (it is the default)
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
      orderVal:    filtered.reduce((s,r) => s+r.orderTotal, 0),
      received:    filtered.reduce((s,r) => s+(activeTab==='client'?(r.received||0):(r.paid||0)), 0),
      due:         filtered.reduce((s,r) => s+Math.max(0,r.due), 0),
      debitNotes:  filtered.reduce((s,r) => s+(r.debitNotesAmt||0), 0),
      creditNotes: filtered.reduce((s,r) => s+(r.creditNotesAmt||0), 0),
      advance:     filtered.reduce((s,r) => s+Math.max(0,-(r.due||0)), 0),
      taxable, gst,
    };
  }, [filtered, tableRows, activeTab]);

  const TH = ({children, right, style:sx={}}) => (
    <th style={{ padding:'6px 8px', background:'#133d80', color:'#fff', fontWeight:700,
      fontSize:10, textAlign:right?'right':'left', whiteSpace:'nowrap',
      border:'1px solid #000', position:'sticky', top:0, zIndex:2, ...sx }}>
      {children}
    </th>
  );

  const handlePrintList = () => {
    if (filtered.length === 0) { alert('No orders to print.'); return; }
    const isVendorTab = activeTab === 'vendor';

    /* ── column definitions ──
       Bill columns (Purchase/Sales Bill No + Bill Date) are left out of
       print — they're almost always empty on a dues list and just eat
       width that the long Product/Description text needs. */
    let cols, rightCols, boldCols;
    if (isVendorTab) {
      // #(0) | PO No(1) | [Client Name(2)] | Vendor | PO Date | Due Date | Product | Qty×Rate | Taxable | GST% | GST Amt | PO Value | Payment Date | Payment Amt | Balance Due
      cols = ['#', 'PO No'];
      if (showClientInPrint) cols.push('Client Name');
      cols.push('Vendor Name', 'PO Date', 'Due Date', 'Product / Description',
        'Qty × Rate', 'Taxable (₹)', 'GST%', 'GST Amt (₹)',
        'PO Value (₹)', 'Payment Date', 'Payment Amt (₹)', 'Balance Due (₹)');
      // Qty×Rate starts at index 7 (with client) or 6 (without)
      const baseQtyIdx = showClientInPrint ? 7 : 6;
      // right-align: Qty×Rate(+0), Taxable(+1), GST Amt(+3), PO Value(+4), Payment Amt(+6), Balance Due(+7)
      rightCols = new Set([baseQtyIdx, baseQtyIdx+1, baseQtyIdx+3, baseQtyIdx+4, baseQtyIdx+6, baseQtyIdx+7]);
      boldCols  = new Set([baseQtyIdx+4, baseQtyIdx+7]);
    } else {
      // #(0) | Order No(1) | Client Name(2) | Order Date(3) | Cust PO No(4) | Due Date(5) | Product(6) | Qty×Rate(7) | Taxable(8) | GST%(9) | GST Amt(10) | Order Value(11) | Receipt Date(12) | Receipt Amt(13) | Balance Due(14)
      cols = ['#', 'Order No', 'Client Name', 'Order Date', 'Cust PO No', 'Due Date',
        'Product / Description', 'Qty × Rate', 'Taxable (₹)', 'GST%', 'GST Amt (₹)',
        'Order Value (₹)', 'Receipt Date', 'Receipt Amt (₹)', 'Balance Due (₹)'];
      rightCols = new Set([7,8,10,11,13,14]);
      boldCols  = new Set([11,13,14]);
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

      /* one print-row per item OR per receipt — whichever is more (bills
         aren't printed, so they no longer factor into the row count) */
      const maxRows = Math.max(items.length || 1, receipts.length, 1);

      for (let j = 0; j < maxRows; j++) {
        const item    = items[j]      || null;
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
          /* each receipt on its own row — matching portal display */
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
          subCells[bi+6] = fmt(totRec);
          subCells[bi+7] = fmt(totDue);
        } else {
          subCells[6]  = 'ORDER TOTAL';
          subCells[8]  = fmt(totTax);
          subCells[10] = fmt(totGst);
          subCells[11] = fmt(ov);
          subCells[13] = fmt(totRec);
          subCells[14] = fmt(totDue);
        }
        subTotalRowsMap.set(groupEndIdx, subCells);
      }
    });

    const groupEnds = new Set();
    for (let i = 0; i < pRows.length - 1; i++) {
      if (pRows[i+1][0] !== '') groupEnds.add(i);
    }
    groupEnds.add(pRows.length - 1);

    /* grand total row — mirrors the on-screen TOTAL strip */
    const grandCells = new Array(cols.length).fill('');
    grandCells[0] = 'TOTAL';
    if (isVendorTab) {
      const bi = showClientInPrint ? 7 : 6;
      grandCells[bi+1] = fmt(totals.taxable);
      grandCells[bi+3] = fmt(totals.gst);
      grandCells[bi+4] = fmt(totals.orderVal);
      grandCells[bi+6] = fmt(totals.received);
      grandCells[bi+7] = fmt(totals.due);
    } else {
      grandCells[8]  = fmt(totals.taxable);
      grandCells[10] = fmt(totals.gst);
      grandCells[11] = fmt(totals.orderVal);
      grandCells[13] = fmt(totals.received);
      grandCells[14] = fmt(totals.due);
    }

    const title    = isVendorTab ? 'Payables — Vendor List' : 'Receivables — Client List';
    const subtitle = (fy==='all' ? 'All FY' : `FY ${fy}`) + (entityFlt!=='all' ? ` | ${entityFlt}` : '');
    const orient   = listPrintOpts?.mode === 'portrait' ? 'portrait' : 'landscape';
    printListReport(title, subtitle, cols, pRows, groupEnds, rightCols, boldCols, selectedCompany, orient, subTotalRowsMap, grandCells);
    setListPrintOpts(null);
  };

  const tabBtn = (tab, label) => {
    const isAct = tab === activeTab;
    return (
      <button key={tab} onClick={() => { setActiveTab(tab); setSearch(''); setEntityFlt('all'); }}
        style={{ display:'flex', alignItems:'center', padding:'0 14px', height:26, alignSelf:'center',
          fontSize:11.5, fontWeight:isAct?700:600, cursor:'pointer',
          whiteSpace:'nowrap', flexShrink:0, fontFamily:F,
          color:isAct?'#fff':'rgba(255,255,255,0.85)',
          background:isAct?'rgba(255,255,255,0.22)':'rgba(255,255,255,0.07)',
          border:`1px solid ${isAct?'rgba(255,255,255,0.55)':'rgba(255,255,255,0.22)'}`,
          boxShadow:isAct?'0 2px 6px rgba(0,0,0,0.22)':'0 1px 2px rgba(0,0,0,0.12)',
          borderRadius:6, margin:'0 4px' }}
        onMouseEnter={e=>{if(!isAct){e.currentTarget.style.background='rgba(255,255,255,0.14)';e.currentTarget.style.borderColor='rgba(255,255,255,0.55)';}}}
        onMouseLeave={e=>{if(!isAct){e.currentTarget.style.background='rgba(255,255,255,0.07)';e.currentTarget.style.borderColor='rgba(255,255,255,0.22)';}}}>
        {label}
      </button>
    );
  };

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
          format={printFormat}
          soMap={soMap}
          onClose={() => setPrintModal(null)}
        />
      )}

      {/* ══ Single combined nav row ══ */}
      <div style={{ flexShrink:0, height:44, background:P, borderBottom:`2px solid ${PD}`,
        display:'flex', alignItems:'stretch', fontFamily:F, overflow:'visible' }}>

        {/* Title */}
        <div style={{ display:'flex', alignItems:'center', padding:'0 10px 0 12px',
          fontSize:11, fontWeight:800, color:'#fff', textTransform:'uppercase', letterSpacing:'0.8px',
          borderRight:'2px solid rgba(255,255,255,0.18)', flexShrink:0, whiteSpace:'nowrap' }}>
          💰 DUES
        </div>

        {/* KPI chips — removed Received/Paid, kept Order Value + Balance Due */}
        {[
          { label:'Order Val', val:`₹${fmt(totals.orderVal)}`, color:'#fde68a' },
          { label:'Balance Due', val:`₹${fmt(totals.due)}`, color:totals.due>0?'#fca5a5':'#6ee7b7' },
          totals.advance>0 ? { label:'Advance', val:`₹${fmt(totals.advance)}`, color:'#7dd3fc' } : null,
          activeTab==='vendor' && totals.debitNotes>0 ? { label:'Debit', val:`₹${fmt(totals.debitNotes)}`, color:'#fbbf24' } : null,
          activeTab==='client' && totals.creditNotes>0 ? { label:'Credit', val:`₹${fmt(totals.creditNotes)}`, color:'#c4b5fd' } : null,
        ].filter(Boolean).map(k => (
          <div key={k.label} style={{ display:'flex', flexDirection:'column', justifyContent:'center',
            padding:'0 10px', borderRight:'1px solid rgba(255,255,255,0.12)', flexShrink:0 }}>
            <div style={{ fontSize:8.5, color:'rgba(255,255,255,0.55)', textTransform:'uppercase', letterSpacing:'0.4px', lineHeight:1 }}>{k.label}</div>
            <div style={{ fontSize:12, fontWeight:800, color:k.color, lineHeight:1.5 }}>{k.val}</div>
          </div>
        ))}

        <div style={{ width:1, height:22, background:'rgba(255,255,255,0.2)', alignSelf:'center', flexShrink:0, margin:'0 4px' }} />

        {/* Client / Vendor tabs */}
        {(!lockedTab || lockedTab==='client') && tabBtn('client', `📥 Clients (${data.clientDues.length})`)}
        {(!lockedTab || lockedTab==='vendor') && tabBtn('vendor', `📤 Vendors (${data.vendorDues.length})`)}

        <div style={{ width:1, height:20, background:'rgba(255,255,255,0.2)', alignSelf:'center', flexShrink:0, margin:'0 4px' }} />

        {/* FY filter */}
        <span style={{ fontSize:9.5, color:'rgba(255,255,255,0.65)', fontWeight:700, alignSelf:'center', flexShrink:0 }}>FY:</span>
        <FyDropdown value={fy} options={fyList} onChange={setFy} neu={neu} current={getFYV(null)} />

        <div style={{ width:1, height:20, background:'rgba(255,255,255,0.2)', alignSelf:'center', flexShrink:0, margin:'0 4px' }} />

        {/* Combined entity search + select */}
        <DuesSearchBox
          entityList={entityList}
          entityFlt={entityFlt}
          setEntityFlt={v => { setEntityFlt(v); }}
          search={search}
          setSearch={setSearch}
          activeTab={activeTab}
        />

        {/* Show cleared */}
        <label style={{ fontSize:10.5, display:'flex', alignItems:'center', gap:3, cursor:'pointer',
          color:'rgba(255,255,255,0.85)', whiteSpace:'nowrap', flexShrink:0, margin:'0 5px' }}>
          <input type="checkbox" checked={showCleared} onChange={e => setShowCleared(e.target.checked)}
            style={{ accentColor:'#fff', cursor:'pointer' }}/>
          Cleared
        </label>

        {/* Client in Print (vendor only) */}
        {activeTab === 'vendor' && (
          <label style={{ display:'flex', alignItems:'center', gap:3, fontSize:10, cursor:'pointer',
            color:'rgba(255,255,255,0.75)', whiteSpace:'nowrap', flexShrink:0, margin:'0 4px' }}>
            <input type="checkbox" checked={showClientInPrint} onChange={e => setShowClientInPrint(e.target.checked)}
              style={{ accentColor:'#fff', cursor:'pointer' }}/>
            Client in Print
          </label>
        )}

        {/* 🖨 Advice — always visible, prints current entity filter or prompts */}
        <button onClick={() => {
            if (entityFlt !== 'all') { setPrintFormat('advice'); setPrintModal(entityFlt); }
            else if (filtered.length > 0) { alert(`Select a specific ${activeTab==='client'?'client':'vendor'} from the search box to print Advice.`); }
            else { alert('No data to print.'); }
          }}
          style={{ height:26, padding:'0 8px', alignSelf:'center', flexShrink:0, marginLeft:4,
            cursor:'pointer', fontFamily:F, fontSize:10.5, fontWeight:700, borderRadius:4,
            background:'rgba(255,255,255,0.18)', color:'#fff', border:'1px solid rgba(255,255,255,0.3)', whiteSpace:'nowrap' }}>
          🖨 Advice
        </button>

        {/* 🖨 Print List — orientation + (vendor only) Format-01 live in one menu */}
        <div style={{ position:'relative', flexShrink:0, alignSelf:'center', margin:'0 4px' }}>
          <button onClick={() => setListPrintOpts(o => o ? null : { mode:'landscape' })}
            style={{ height:26, padding:'0 8px', fontSize:10.5, fontFamily:F, cursor:'pointer',
              borderRadius:4, border:'1px solid rgba(255,255,255,0.3)',
              background:listPrintOpts?'rgba(255,255,255,0.25)':'rgba(255,255,255,0.12)',
              color:'#fff', fontWeight:700, whiteSpace:'nowrap' }}>
            🖨 List ▾
          </button>
          {listPrintOpts && (
            <div style={{ position:'absolute', top:34, right:0, zIndex:9999, background:'#fff', border:`1px solid ${BD}`,
              borderRadius:8, padding:14, width:220, boxShadow:'0 4px 16px rgba(0,0,0,0.18)', fontFamily:F }}>
              <div style={{ fontSize:11, fontWeight:700, color:'#374151', marginBottom:10 }}>Print Options</div>
              {[
                ['landscape','A3 Landscape (wide)'],
                ['portrait','A3 Portrait (tall)'],
                ...(activeTab==='vendor' ? [['format01','Format-01 (compact slip)']] : []),
              ].map(([val,lbl])=>(
                <label key={val} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8, cursor:'pointer', fontSize:12 }}>
                  <input type="radio" name="listOrient" value={val}
                    checked={listPrintOpts.mode===val}
                    onChange={()=>setListPrintOpts(o=>({...o,mode:val}))}
                    style={{ accentColor:P, cursor:'pointer' }}/>
                  <span style={{ color:listPrintOpts.mode===val?P:'#374151', fontWeight:listPrintOpts.mode===val?700:400 }}>{lbl}</span>
                </label>
              ))}
              <div style={{ display:'flex', gap:6, marginTop:12 }}>
                <button onClick={()=>setListPrintOpts(null)}
                  style={{ flex:1, height:28, fontSize:11, fontFamily:F, cursor:'pointer', border:`1px solid ${BD}`, borderRadius:5, background:'#fff', color:'#6B7280' }}>Cancel</button>
                <button onClick={() => {
                    if (listPrintOpts.mode === 'format01') {
                      if (entityFlt !== 'all') { setPrintFormat('format01'); setPrintModal(entityFlt); setListPrintOpts(null); }
                      else if (filtered.length > 0) { alert('Select a specific vendor from the search box to print Format-01.'); }
                      else { alert('No data to print.'); }
                    } else {
                      handlePrintList();
                    }
                  }}
                  style={{ flex:2, height:28, fontSize:11, fontFamily:F, cursor:'pointer', border:'none', borderRadius:5, background:P, color:'#fff', fontWeight:700 }}>🖨 Print Now</button>
              </div>
            </div>
          )}
        </div>

        {/* Refresh */}
        <button onClick={fetchAll} style={{ height:26, padding:'0 8px', alignSelf:'center', margin:'0 6px', flexShrink:0,
          cursor:'pointer', fontFamily:F, fontSize:11, fontWeight:700, borderRadius:4,
          background:'rgba(255,255,255,0.12)', border:'1px solid rgba(255,255,255,0.22)', color:'#fff' }}>
          ↻
        </button>
      </div>

      {message && (
        <div style={{ flexShrink:0, background:'#ffe0e0', borderBottom:'1px solid #cc4444',
          color:'#880000', padding:'4px 14px', fontSize:11 }}>{message}</div>
      )}

      {/* Table */}
      <div style={{ flex:1, overflow:'auto' }}>
        {tableRows.length === 0 ? (
          <div style={{ padding:40, textAlign:'center', color:'#888', fontStyle:'italic',
            background:'#fff' }}>
            {showCleared ? 'No linked orders found.' : 'No outstanding dues. Tick "Show cleared" to see all.'}
          </div>
        ) : (
          <div style={{ background:'#fff' }}>
            {activeTab === 'client' ? (
            /* ══ RECEIVABLE TABLE (client) ══ */
            <table style={{ width:'100%', borderCollapse:'separate', borderSpacing:0, fontSize:11, fontFamily:F, background:'#fff' }}>
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
                  const bg = '#fff';
                  const qty=item?parseFloat(item.qty||item.quantity||0):0;
                  const rate=item?parseFloat(item.rate||0):0;
                  const disc=item?(item.discountType==='%'?qty*rate*(parseFloat(item.discount)||0)/100:(parseFloat(item.discount)||0)):0;
                  const taxable=qty*rate-disc;
                  const gstPct=item?parseFloat(item.gstPercent||item.gstPct||item.gst||0):0;
                  const gstAmt=taxable*gstPct/100;
                  const totalReceipt=receipts.reduce((s,p)=>s+(parseFloat(p.amount)||0),0);
                  const C = (content, right=false, extra={}) => rowSpan > 0 ? (
                    <td rowSpan={rowSpan} style={{ padding:'6px 9px', borderRight:'1px solid #000', borderBottom:'1px solid #000', background:bg, textAlign:right?'right':'left', verticalAlign:'top', ...extra }}>{content}</td>
                  ) : null;
                  return (
                    <tr key={`${row.orderId}-${ridx}`}>
                      {C(<span style={{color:'#9ca3af',fontSize:10}}>{seq}</span>)}
                      {C(<div><div style={{fontWeight:700,color:'#1e293b'}}>{row.orderNo||'—'}</div>{(row.customerPO||row.reference)&&<div style={{fontSize:9.5,color:'#9ca3af',marginTop:1}}>{row.customerPO||row.reference}</div>}</div>)}
                      {C(<div><div style={{fontWeight:600,color:'#111827'}}>{row.entityName||'—'}</div><div style={{fontSize:9.5,color:'#9ca3af',marginTop:1}}>{fmtD(row.orderDate)}</div></div>)}
                      {C(<span style={{color:'#6b7280',whiteSpace:'nowrap'}}>{fmtD(row.deliveryDate||row.dueDate)||'—'}</span>)}
                      <td style={{padding:'6px 9px',borderRight:'1px solid #000',borderBottom:'1px solid #000',background:bg,color:'#374151'}}>
                        {item ? <div>{item.itemName||item.description||item.name||'—'}</div> : <span style={{color:'#9ca3af',fontStyle:'italic'}}>No items</span>}
                      </td>
                      <td style={{padding:'6px 9px',textAlign:'right',borderRight:'1px solid #000',borderBottom:'1px solid #000',background:bg}}>{item?fmt(rate):'—'}</td>
                      <td style={{padding:'6px 9px',textAlign:'right',borderRight:'1px solid #000',borderBottom:'1px solid #000',background:bg,whiteSpace:'nowrap'}}>{item?`${qty.toFixed(2)} ${item.unit||''}`.trim():'—'}</td>
                      <td style={{padding:'6px 9px',textAlign:'right',fontWeight:600,borderRight:'1px solid #000',borderBottom:'1px solid #000',background:bg}}>{item?fmt(taxable):'—'}</td>
                      <td style={{padding:'6px 9px',textAlign:'right',borderRight:'1px solid #000',borderBottom:'1px solid #000',background:bg,color:'#6b7280'}}>{item?`${gstPct}%`:'—'}</td>
                      <td style={{padding:'6px 9px',textAlign:'right',borderRight:'1px solid #000',borderBottom:'1px solid #000',background:bg,color:'#7c2d12'}}>{item?fmt(gstAmt):'—'}</td>
                      {rowSpan>0&&<td rowSpan={rowSpan} style={{padding:'6px 9px',textAlign:'right',borderRight:'1px solid #000',borderBottom:'1px solid #000',background:bg,fontWeight:700,color:'#1e293b',verticalAlign:'top',whiteSpace:'nowrap'}}>₹{fmt(row.orderTotal)}</td>}
                      {rowSpan>0&&<td rowSpan={rowSpan} style={{padding:'6px 9px',borderRight:'1px solid #000',borderBottom:'1px solid #000',background:bg,verticalAlign:'top',fontSize:10.5}}>
                        {salesBills.length===0?<span style={{color:'#9ca3af'}}>—</span>:salesBills.map((b,bi)=>(
                          <div key={bi} style={{marginBottom:bi<salesBills.length-1?4:0}}><div style={{fontWeight:600,color:P,whiteSpace:'nowrap'}}>{b.billNo||`SB#${b.billId}`}</div>{b.billDate&&<div style={{fontSize:9.5,color:'#9ca3af'}}>{fmtD(b.billDate)}</div>}</div>
                        ))}
                      </td>}
                      {rowSpan>0&&<td rowSpan={rowSpan} style={{padding:'6px 9px',textAlign:'right',borderRight:'1px solid #000',borderBottom:'1px solid #000',background:bg,verticalAlign:'top',fontSize:10.5}}>
                        {(receipts.length===0 && !(row.linkedCreditNotes||[]).length) ? <span style={{color:'#9ca3af'}}>—</span> : <>
                          {receipts.map((p,pi)=>(<div key={pi} style={{marginBottom:4}}><div style={{color:p.isJournal?'#7c3aed':'#2e7d32',fontWeight:600,whiteSpace:'nowrap'}}>₹{fmt(p.amount)}</div>{p.date&&<div style={{fontSize:9.5,color:'#9ca3af'}}>{fmtD(p.date)}</div>}{p.isJournal&&<div title={p.narration||''} style={{fontSize:9.5,color:'#7c3aed',fontWeight:700,whiteSpace:'nowrap'}}>JV #{p.journalId}{p.narration?` · ${p.narration}`:''}</div>}{p.isSplit&&<div style={{fontSize:9.5,color:'#9ca3af'}}>share of ₹{fmt(p.fullAmount)}</div>}</div>))}
                          {(row.linkedCreditNotes||[]).map((cn,ci)=>(<div key={`cn${ci}`} style={{marginBottom:4}}><div style={{color:'#7c3aed',fontWeight:600,whiteSpace:'nowrap',fontSize:10}}>CN ₹{fmt(cn.amount)}</div><div style={{fontSize:9,color:'#7c3aed',opacity:0.8}}>{cn.cnNo} {cn.date&&fmtD(cn.date)}</div></div>))}
                          {(receipts.length+(row.linkedCreditNotes||[]).length)>1&&<div style={{borderTop:'1px solid #000',marginTop:3,paddingTop:2,fontWeight:700,color:'#1e293b'}}>₹{fmt(totalReceipt+(row.creditNotesAmt||0))}</div>}
                        </>}
                      </td>}
                      {rowSpan>0&&<td rowSpan={rowSpan} style={{padding:'6px 9px',textAlign:'right',borderBottom:'1px solid #000',background:bg,verticalAlign:'top',fontWeight:700,fontSize:12,color:row.due<0?'#0891b2':row.due===0?'#6b7280':'#16a34a',whiteSpace:'nowrap'}}>{row.due<0?`↑ Adv ₹${fmt(-row.due)}`:row.due===0?'✓ Cleared':`₹${fmt(row.due)}`}</td>}
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={{ background:'#e8f0fe', position:'sticky', bottom:0, zIndex:2 }}>
                  <td colSpan={5} style={{padding:'8px 10px',fontWeight:700,color:P,fontSize:12,borderTop:'2px solid #4a6a9a'}}>TOTAL — {filtered.length} order{filtered.length!==1?'s':''}, {tableRows.length} line items</td>
                  <td style={{borderTop:'2px solid #4a6a9a',borderLeft:'1px solid #c7d2fe'}}/>
                  <td style={{borderTop:'2px solid #4a6a9a',borderLeft:'1px solid #c7d2fe'}}/>
                  <td style={{padding:'8px 9px',textAlign:'right',fontWeight:700,borderTop:'2px solid #4a6a9a',borderLeft:'1px solid #c7d2fe',color:'#1e293b'}}>₹{fmt(totals.taxable)}</td>
                  <td style={{borderTop:'2px solid #4a6a9a',borderLeft:'1px solid #c7d2fe'}}/>
                  <td style={{padding:'8px 9px',textAlign:'right',fontWeight:700,borderTop:'2px solid #4a6a9a',borderLeft:'1px solid #c7d2fe',color:'#7c2d12'}}>₹{fmt(totals.gst)}</td>
                  <td style={{padding:'8px 9px',textAlign:'right',fontWeight:800,borderTop:'2px solid #4a6a9a',borderLeft:'1px solid #c7d2fe',color:P,fontSize:13}}>₹{fmt(totals.orderVal)}</td>
                  <td style={{borderTop:'2px solid #4a6a9a',borderLeft:'1px solid #c7d2fe'}}/>
                  <td style={{padding:'8px 9px',textAlign:'right',fontWeight:700,borderTop:'2px solid #4a6a9a',borderLeft:'1px solid #c7d2fe',color:'#2e7d32'}}>₹{fmt(totals.received + totals.creditNotes)}</td>
                  <td style={{padding:'8px 9px',textAlign:'right',fontWeight:800,borderTop:'2px solid #4a6a9a',borderLeft:'1px solid #c7d2fe',color:totals.due>0?'#16a34a':'#6b7280',fontSize:13}}>₹{fmt(totals.due)}</td>
                </tr>
              </tfoot>
            </table>
            ) : (
            /* ══ PAYABLE TABLE (vendor) ══ */
            <table style={{ width:'100%', borderCollapse:'separate', borderSpacing:0, fontSize:11, fontFamily:F, background:'#fff' }}>
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
                  const bg = '#fff';
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
                    <td rowSpan={rowSpan} style={{ padding:'6px 9px', borderRight:'1px solid #000', borderBottom:'1px solid #000', background:bg, textAlign:right?'right':'left', verticalAlign:'top', ...extra }}>{content}</td>
                  ) : null;
                  return (
                    <tr key={`${row.orderId}-${ridx}`}>
                      {C(<span style={{color:'#9ca3af',fontSize:10}}>{seq}</span>)}
                      {C(<div style={{fontWeight:600,color:'#1e40af'}}>{clientName||<span style={{color:'#9ca3af',fontStyle:'italic'}}>—</span>}</div>)}
                      {C(<div><div style={{fontWeight:600,color:'#111827'}}>{row.entityName||'—'}</div></div>)}
                      {C(<span style={{color:'#6b7280',whiteSpace:'nowrap',fontSize:10.5}}>{fmtD(row.orderDate)||'—'}</span>)}
                      {C(<div style={{whiteSpace:'nowrap'}}>
                        <span style={{fontWeight:700,color:'#1e293b'}}>{row.orderNo||'—'}</span>
                        {row.poType==='expense'&&<span style={{marginLeft:5,fontSize:9,padding:'1px 5px',background:'#fff7ed',color:'#c2410c',border:'1px solid #fed7aa',borderRadius:3,fontWeight:700,verticalAlign:'middle'}}>EXP</span>}
                        {row.category&&<div style={{fontSize:9.5,color:'#9ca3af',marginTop:1}}>{row.category}</div>}
                      </div>)}
                      <td style={{padding:'6px 9px',borderRight:'1px solid #000',borderBottom:'1px solid #000',background:bg,color:'#374151'}}>
                        {item ? <div>{item.itemName||item.description||item.name||'—'}{item.isAddon&&<span style={{fontSize:9,marginLeft:4,padding:'1px 4px',background:'#fff3e0',color:'#b45309',border:'1px solid #fbbf24',borderRadius:2,fontWeight:700}}>Add-on</span>}</div> : row.description ? <div style={{color:'#374151'}}>{row.description}{row.invoiceNo&&<span style={{marginLeft:6,fontSize:9.5,color:'#9ca3af'}}>Inv: {row.invoiceNo}</span>}</div> : <span style={{color:'#9ca3af',fontStyle:'italic'}}>No items</span>}
                      </td>
                      <td style={{padding:'6px 9px',textAlign:'right',borderRight:'1px solid #000',borderBottom:'1px solid #000',background:bg}}>{item?fmt(rate):'—'}</td>
                      <td style={{padding:'6px 9px',textAlign:'right',borderRight:'1px solid #000',borderBottom:'1px solid #000',background:bg,whiteSpace:'nowrap'}}>{item?`${qty.toFixed(2)} ${item.unit||''}`.trim():'—'}</td>
                      <td style={{padding:'6px 9px',textAlign:'right',fontWeight:600,borderRight:'1px solid #000',borderBottom:'1px solid #000',background:bg}}>{item?fmt(taxable):'—'}</td>
                      <td style={{padding:'6px 9px',textAlign:'right',borderRight:'1px solid #000',borderBottom:'1px solid #000',background:bg,color:'#6b7280'}}>{item?`${gstPctV}%`:'—'}</td>
                      <td style={{padding:'6px 9px',textAlign:'right',borderRight:'1px solid #000',borderBottom:'1px solid #000',background:bg,color:'#7c2d12'}}>{item?fmt(gstAmtV):'—'}</td>
                      {rowSpan>0&&<td rowSpan={rowSpan} style={{padding:'6px 9px',textAlign:'right',borderRight:'1px solid #000',borderBottom:'1px solid #000',background:bg,fontWeight:700,color:'#1e293b',verticalAlign:'top',whiteSpace:'nowrap'}}>₹{fmt(row.orderTotal)}</td>}
                      {rowSpan>0&&<td rowSpan={rowSpan} style={{padding:'6px 9px',borderRight:'1px solid #000',borderBottom:'1px solid #000',background:bg,verticalAlign:'top',fontSize:10.5}}>
                        {salesBills.length===0?<span style={{color:'#9ca3af'}}>—</span>:salesBills.map((b,bi)=>(
                          <div key={bi} style={{marginBottom:bi<salesBills.length-1?4:0}}><div style={{fontWeight:600,color:'#7c3aed',whiteSpace:'nowrap'}}>{b.billNo||`PB#${b.billId}`}</div>{b.billDate&&<div style={{fontSize:9.5,color:'#9ca3af'}}>{fmtD(b.billDate)}</div>}</div>
                        ))}
                      </td>}
                      {rowSpan>0&&<td rowSpan={rowSpan} style={{padding:'6px 9px',textAlign:'right',borderRight:'1px solid #000',borderBottom:'1px solid #000',background:bg,verticalAlign:'top',fontSize:10.5}}>
                        {(receipts.length===0 && !(row.linkedDebitNotes||[]).length) ? <span style={{color:'#9ca3af'}}>—</span> : <>
                          {receipts.map((p,pi)=>(<div key={pi} style={{marginBottom:4}}><div style={{color:p.isJournal?'#7c3aed':'#2e7d32',fontWeight:600,whiteSpace:'nowrap'}}>₹{fmt(p.amount)}</div>{p.date&&<div style={{fontSize:9.5,color:'#9ca3af'}}>{fmtD(p.date)}</div>}{p.isJournal&&<div title={p.narration||''} style={{fontSize:9.5,color:'#7c3aed',fontWeight:700,whiteSpace:'nowrap'}}>JV #{p.journalId}{p.narration?` · ${p.narration}`:''}</div>}{p.isSplit&&<div style={{fontSize:9.5,color:'#9ca3af'}}>share of ₹{fmt(p.fullAmount)}</div>}</div>))}
                          {(row.linkedDebitNotes||[]).map((dn,di)=>(<div key={`dn${di}`} style={{marginBottom:4}}><div style={{color:'#b45309',fontWeight:600,whiteSpace:'nowrap',fontSize:10}}>DN ₹{fmt(dn.amount)}</div><div style={{fontSize:9,color:'#b45309',opacity:0.8}}>{dn.dnNo} {dn.date&&fmtD(dn.date)}</div></div>))}
                          {(receipts.length+(row.linkedDebitNotes||[]).length)>1&&<div style={{borderTop:'1px solid #000',marginTop:3,paddingTop:2,fontWeight:700,color:'#1e293b'}}>₹{fmt(totalPayment+(row.debitNotesAmt||0))}</div>}
                        </>}
                      </td>}
                      {rowSpan>0&&<td rowSpan={rowSpan} style={{padding:'6px 9px',textAlign:'right',borderBottom:'1px solid #000',background:bg,verticalAlign:'top',fontWeight:700,fontSize:12,color:row.due<0?'#0891b2':row.due===0?'#2e7d32':'#b71c1c',whiteSpace:'nowrap'}}>{row.due<0?`↑ Credit ₹${fmt(-row.due)}`:row.due===0?'✓ Paid':`₹${fmt(row.due)}`}</td>}
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={{ background:'#e8f0fe', position:'sticky', bottom:0, zIndex:2 }}>
                  <td colSpan={6} style={{padding:'8px 10px',fontWeight:700,color:P,fontSize:12,borderTop:'2px solid #4a6a9a'}}>TOTAL — {filtered.length} order{filtered.length!==1?'s':''}, {tableRows.length} line items</td>
                  <td style={{borderTop:'2px solid #4a6a9a',borderLeft:'1px solid #c7d2fe'}}/>
                  <td style={{borderTop:'2px solid #4a6a9a',borderLeft:'1px solid #c7d2fe'}}/>
                  <td style={{padding:'8px 9px',textAlign:'right',fontWeight:700,borderTop:'2px solid #4a6a9a',borderLeft:'1px solid #c7d2fe',color:'#1e293b'}}>₹{fmt(totals.taxable)}</td>
                  <td style={{borderTop:'2px solid #4a6a9a',borderLeft:'1px solid #c7d2fe'}}/>
                  <td style={{padding:'8px 9px',textAlign:'right',fontWeight:700,borderTop:'2px solid #4a6a9a',borderLeft:'1px solid #c7d2fe',color:'#7c2d12'}}>₹{fmt(totals.gst)}</td>
                  <td style={{padding:'8px 9px',textAlign:'right',fontWeight:800,borderTop:'2px solid #4a6a9a',borderLeft:'1px solid #c7d2fe',color:P,fontSize:13}}>₹{fmt(totals.orderVal)}</td>
                  <td style={{borderTop:'2px solid #4a6a9a',borderLeft:'1px solid #c7d2fe'}}/>
                  <td style={{padding:'8px 9px',textAlign:'right',fontWeight:700,borderTop:'2px solid #4a6a9a',borderLeft:'1px solid #c7d2fe',color:'#2e7d32'}}>₹{fmt(totals.received + totals.debitNotes)}</td>
                  <td style={{padding:'8px 9px',textAlign:'right',fontWeight:800,borderTop:'2px solid #4a6a9a',borderLeft:'1px solid #c7d2fe',color:totals.due>0?'#b71c1c':'#2e7d32',fontSize:13}}>₹{fmt(totals.due)}</td>
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
