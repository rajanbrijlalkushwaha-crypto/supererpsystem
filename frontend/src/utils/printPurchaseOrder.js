import { withPrintFont } from './printFont';
import { brandLine } from './printBranding';
/* printPurchaseOrder.js — restyled to match printSalesOrder.js exactly:
 * Arial, a fully bordered grid (.outer — every cell boxed in black) and
 * field()-style label:value rows, instead of the old Times New Roman /
 * selective-left-border layout. All calculations below are unchanged
 * from before — only the HTML template and CSS changed. */

/* ── Helpers ── */
const fetchBase64 = async (url) => {
  try {
    const res  = await fetch(url);
    const blob = await res.blob();
    return await new Promise(r => {
      const rd = new FileReader(); rd.onload = () => r(rd.result); rd.readAsDataURL(blob);
    });
  } catch { return null; }
};

const fetchRendered = async (orderId, fileName, companyId) => {
  try {
    const r = await fetch(`/api/purchase-orders/${orderId}/render-attachment/${encodeURIComponent(fileName)}?companyId=${companyId}`);
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
};

/* ── Formatters ── */
const esc  = v => (!v && v !== 0) ? '' : String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const dv   = v => esc(v) || '';
const fmtD = v => {
  if (!v) return '';
  const dt = new Date(v);
  return isNaN(dt) ? String(v) : `${String(dt.getDate()).padStart(2,'0')}-${String(dt.getMonth()+1).padStart(2,'0')}-${dt.getFullYear()}`;
};
const fmtN = n => Number(n||0).toFixed(2);

/* ── Amount in words ── */
function numWords(n) {
  n = Math.round(Math.abs(n||0));
  if (!n) return 'Zero Rupees Only';
  const a = ['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten','Eleven','Twelve',
    'Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'];
  const b = ['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
  const seg = x => !x?'':x<20?a[x]+' ':b[Math.floor(x/10)]+(x%10?' '+a[x%10]:'')+' ';
  let w = '';
  if (Math.floor(n/10000000))          w += seg(Math.floor(n/10000000))+'Crore ';
  if (Math.floor((n%10000000)/100000)) w += seg(Math.floor((n%10000000)/100000))+'Lakh ';
  if (Math.floor((n%100000)/1000))     w += seg(Math.floor((n%100000)/1000))+'Thousand ';
  if (Math.floor((n%1000)/100))        w += seg(Math.floor((n%1000)/100))+'Hundred ';
  if (n%100) w += seg(n%100);
  return 'INR ' + w.trim() + ' Only';
}

/* ──────────────────────────────────────────────────────────────────
   Grid table builder — every cell boxed (Delivery Challan's .item-table
   convention, same helper as printSalesOrder.js). ──────────────────── */
function buildGridTable(cols, widths, bodyRows, footRows) {
  let thead = `<thead><tr>`;
  cols.forEach((c, i) => {
    const w = widths[i] ? `width:${widths[i]};` : '';
    thead += `<th style="${w}">${c}</th>`;
  });
  thead += `</tr></thead>`;

  let tbody = `<tbody>`;
  bodyRows.forEach(row => {
    tbody += `<tr>`;
    row.forEach(cell => {
      const span = cell.colspan || 1;
      const colAttr = span > 1 ? ` colspan="${span}"` : '';
      tbody += `<td${colAttr} style="${cell.style||''}">${cell.text}</td>`;
    });
    tbody += `</tr>`;
  });
  tbody += `</tbody>`;

  let tfoot = '';
  if (footRows && footRows.length) {
    tfoot = `<tfoot>`;
    footRows.forEach(row => {
      tfoot += `<tr>`;
      row.forEach(cell => {
        const span = cell.colspan || 1;
        const colAttr = span > 1 ? ` colspan="${span}"` : '';
        tfoot += `<td${colAttr} style="${cell.style||''}">${cell.text}</td>`;
      });
      tfoot += `</tr>`;
    });
    tfoot += `</tfoot>`;
  }

  return `<table class="item-table">${thead}${tbody}${tfoot}</table>`;
}

/* ══════════════════════════════════════════════════════════════════
   SHARED HTML BUILDER — used by both print and email
   opts.skipAttachments = true  → skip attachment fetching/rendering
══════════════════════════════════════════════════════════════════ */
export const buildPurchaseOrderHtml = async (order, company = {}, opts = {}, user = null) => {
  const { skipAttachments = false } = opts;
  const o   = order || {};
  const cid = company?.companyId || o.companyId || '';
  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  /* ── Logo ── */
  let logoB64 = null;
  if (company?.logoFileName)
    logoB64 = await fetchBase64(`/api/companies/logo/${encodeURIComponent(company.logoFileName)}?companyId=${cid}`);

  /* ── Process attachments ── */
  let processedAtts = [];
  if (!skipAttachments) {
    const atts = Array.isArray(o.attachments) ? o.attachments : (Array.isArray(o.documents) ? o.documents : []);
    processedAtts = await Promise.all(atts.map(async att => {
      if (!att.fileName || !o.orderId || !cid) return { ...att, kind: 'missing' };
      const ext = (att.fileName.split('.').pop()||'').toLowerCase();
      if (ext === 'pdf') {
        const url = `${origin}/api/purchase-orders/${o.orderId}/download/${encodeURIComponent(att.fileName)}?companyId=${cid}&inline=1`;
        return { ...att, kind: 'pdf', pdfUrl: url };
      }
      const rd = await fetchRendered(o.orderId, att.fileName, cid);
      return { ...att, kind: rd?.kind||'unknown', ...(rd||{}) };
    }));
  }
  const hasPdfs = !skipAttachments && processedAtts.some(a => a.kind === 'pdf');

  /* ── Linked SO orderNo ── */
  let linkedSOOrderNo = null;
  if (o.linkedSalesOrderId && cid) {
    try {
      const r = await fetch(`/api/sales-orders/${o.linkedSalesOrderId}?companyId=${cid}`);
      if (r.ok) { const so = await r.json(); linkedSOOrderNo = so.orderNo || null; }
    } catch {}
  }

  /* ── Prepared By — the user who created the order, from the audit trail
     (same lookup pattern as printSalesOrder.js). ── */
  const createdBy = Array.isArray(o.audit) ? o.audit.find(a => a.action === 'created')?.by : null;
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
  const preparedName = dv(createdBy?.name || createdBy?.username || o.purchasePerson) || '&nbsp;';
  const preparedLoginId     = dv(preparedUser?.username || createdBy?.username);
  const preparedDesignation = dv(preparedUser?.designation);

  /* ── Arrays ── */
  const items      = Array.isArray(o.items)      ? o.items      : [];
  const charges    = Array.isArray(o.charges)    ? o.charges    : [];
  const scopeItems = Array.isArray(o.scopeItems) ? o.scopeItems.filter(s=>s.item) : [];

  /* ── GST state logic ── */
  const coState     = (company.state||company.companyState||'').toLowerCase().trim();
  const vendorState = (o.vendorState||'').toLowerCase().trim();
  const sameState   = coState && vendorState && coState === vendorState;

  /* ── Calculations ── */
  const itemTaxable = items.reduce((s,it) => {
    const base = (parseFloat(it.qty)||0)*(parseFloat(it.rate)||0);
    const disc = it.discountType==='%' ? base*(parseFloat(it.discount)||0)/100 : (parseFloat(it.discount)||0);
    return s + base - disc;
  }, 0);
  const itemGstAmt = items.reduce((s,it) => {
    const base = (parseFloat(it.qty)||0)*(parseFloat(it.rate)||0);
    const disc = it.discountType==='%' ? base*(parseFloat(it.discount)||0)/100 : (parseFloat(it.discount)||0);
    return s + (base-disc)*(parseFloat(it.gstPercent)||0)/100;
  }, 0);
  const validChg  = charges.filter(c => parseFloat(c.amount)>0);
  const chgNet    = validChg.reduce((s,c) => s+(parseFloat(c.amount)||0), 0);
  const chgGstAmt = validChg.reduce((s,c) => { const a=parseFloat(c.amount)||0; return s+a*(parseFloat(c.gstPercent||c.gst)||0)/100; }, 0);
  const totalGstAmt = itemGstAmt + chgGstAmt;
  const discount  = parseFloat(o.overallDiscount)||0;
  const freight   = parseFloat(o.freightCharges)||0;
  const packing   = parseFloat(o.packingCharges)||0;
  const roundOff  = parseFloat(o.roundOff)||0;
  const grand     = parseFloat(o.grandTotal)||(itemTaxable+chgNet+totalGstAmt-discount+freight+packing+roundOff);

  /* ── Company ── */
  const coName = dv(company.companyName||company.name)||'Epsilon Enterprise';
  const coAddr = [company.address,company.city,company.state,company.pincode].filter(Boolean).join(', ');
  const today  = new Date().toLocaleDateString('en-IN',{day:'2-digit',month:'long',year:'numeric'});
  const logoTag = logoB64
    ? `<img src="${logoB64}" style="height:48px;max-width:110px;object-fit:contain;">`
    : '';

  /* Field row — matches Delivery Challan's / printSalesOrder.js's field() helper exactly. */
  const field = (lbl, v) => `
    <div class="field-row">
      <span class="field-lbl">${lbl}</span>
      <span class="field-colon">:</span>
      <span class="field-val">${dv(v) || '&nbsp;'}</span>
    </div>`;

  /* ══ ITEM TABLE ══ */
  const poNo = dv(o.poNo||o.voucherNumber||o.orderId);
  const itemCols   = ['Sr No','Item Name','Specs / Description','HSN Code','Qty','Unit','Rate','Disc','GST%','Amount'];
  const itemWidths = ['30px','','','65px','40px','44px','70px','50px','44px','85px'];

  const itemBody = items.length
    ? items.map((it,i) => {
        const qty  = parseFloat(it.qty)||0;
        const rate = parseFloat(it.rate)||0;
        const base = qty*rate;
        const disc = it.discountType==='%' ? base*(parseFloat(it.discount)||0)/100 : (parseFloat(it.discount)||0);
        const tax  = base-disc;
        const discLabel = it.discount ? (it.discount+(it.discountType||'%')) : '';
        return [
          {text:`${i+1}`, style:'text-align:center;'},
          {text:dv(it.itemName||it.description||'')||'—'},
          {text:dv(it.description&&it.description!==(it.itemName||'')?it.description:'')},
          {text:dv(it.hsnCode), style:'text-align:center;'},
          {text:qty?String(qty):'', style:'text-align:center;'},
          {text:dv(it.unit), style:'text-align:center;'},
          {text:rate?fmtN(rate):'', style:'text-align:right;'},
          {text:discLabel, style:'text-align:center;'},
          {text:(it.gstPercent||0)+'%', style:'text-align:center;'},
          {text:tax?fmtN(tax):'', style:'text-align:right;'},
        ];
      })
    : [[{text:'No items',style:'text-align:center;color:#888;font-style:italic;',colspan:10}]];

  // Order: 1) each charge (base, no GST)  2) Total Taxable  3) GST  4) Total Order Value
  const footRowsRaw = [];
  const R  = 'text-align:right;';
  const RB = 'text-align:right;font-weight:bold;white-space:nowrap;';
  const NC = itemCols.length; // 10

  validChg.forEach(c => {
    const a = parseFloat(c.amount)||0;
    footRowsRaw.push([
      {text:[dv(c.chargeType),dv(c.description)].filter(Boolean).join(' — ')||'Additional Charge', style:R, colspan:NC-1},
      {text:fmtN(a), style:R},
    ]);
  });

  const combinedTaxable = itemTaxable + chgNet;
  footRowsRaw.push([{text:'Total Taxable', style:RB, colspan:NC-1}, {text:fmtN(combinedTaxable), style:RB}]);

  const rates = [...new Set(items.map(it=>parseFloat(it.gstPercent)||0).filter(r=>r>0))];
  const singleRate = rates.length===1 ? rates[0] : null;
  if (sameState) {
    const cgst = totalGstAmt/2;
    const sgst = totalGstAmt/2;
    footRowsRaw.push([{text:`CGST${singleRate?` @ ${singleRate/2}%`:''}`, style:R, colspan:NC-1}, {text:fmtN(cgst), style:R}]);
    footRowsRaw.push([{text:`SGST${singleRate?` @ ${singleRate/2}%`:''}`, style:R, colspan:NC-1}, {text:fmtN(sgst), style:R}]);
  } else {
    footRowsRaw.push([{text:`IGST${singleRate?` @ ${singleRate}%`:''}`, style:R, colspan:NC-1}, {text:fmtN(totalGstAmt), style:R}]);
  }

  if (discount>0) footRowsRaw.push([{text:'Discount', style:R, colspan:NC-1}, {text:`− ${fmtN(discount)}`, style:`${R}color:#c00;`}]);
  if (freight>0)  footRowsRaw.push([{text:'Freight Charges',style:R,colspan:NC-1},{text:fmtN(freight),style:R}]);
  if (packing>0)  footRowsRaw.push([{text:'Packing Charges',style:R,colspan:NC-1},{text:fmtN(packing),style:R}]);
  if (roundOff)   footRowsRaw.push([{text:'Round Off',style:R,colspan:NC-1},{text:fmtN(roundOff),style:R}]);

  footRowsRaw.push([{text:'Total Order Value', style:RB, colspan:NC-1}, {text:`₹ ${fmtN(grand)}`, style:RB}]);

  const itemTable = buildGridTable(itemCols, itemWidths, itemBody, footRowsRaw);

  /* ══ SCOPE OF WORK TABLE ══ */
  const scopeCols   = ['#','Scope Item / Activity','Client Scope','Our Scope','Vendor Scope','Remarks'];
  const scopeWidths = ['30px','','75px','75px','75px',''];
  const scopeBody = scopeItems.length
    ? scopeItems.map((s,i)=>[
        {text:String(i+1),style:'text-align:center;'},
        {text:dv(s.item)},
        {text:s.clientScope?'✓':'',style:'text-align:center;'},
        {text:s.ourScope?'✓':'',style:'text-align:center;'},
        {text:s.vendorScope?'✓':'',style:'text-align:center;'},
        {text:dv(s.remarks)},
      ])
    : [[{text:'—',style:'text-align:center;color:#888;',colspan:6}]];
  const scopeTable = buildGridTable(scopeCols, scopeWidths, scopeBody, []);

  /* Renders one processed attachment as an inline print block (same
     convention as printSalesOrder.js's renderInlineFile). */
  const renderInlineFile = (f, i, label, headerBg = '#3A6186') => {
    if (f.kind === 'pdf') {
      return `<div style="${i>0?'page-break-before:always;break-before:page;':''}">
        <div style="background:${headerBg};color:#fff;font-weight:bold;font-size:10.5pt;padding:4px 10px;margin-bottom:4px;">${i+1}. ${dv(label)}</div>
        <div class="pdf-render" data-pdf-url="${f.pdfUrl||''}" style="width:100%;"></div>
      </div>`;
    }
    let content;
    if (f.kind === 'excel') {
      content = `<div style="overflow-x:auto;padding:6px;font-size:10pt;">${f.html||''}</div>`;
    } else if (f.kind === 'word') {
      content = `<div style="padding:10px;font-size:10pt;line-height:1.6;">${f.html||''}</div>`;
    } else if (f.kind === 'text') {
      const safe=(f.text||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
      content = `<pre style="padding:10px;font-family:monospace;font-size:10pt;white-space:pre-wrap;background:#f8f8f8;">${safe}</pre>`;
    } else if (f.kind === 'image') {
      content = `<div style="padding:8px;text-align:center;"><img src="${f.base64||''}" style="max-width:100%;max-height:900px;"></div>`;
    } else {
      const ext=(f.fileName||'').split('.').pop().toUpperCase();
      content = `<div style="padding:12px;text-align:center;color:#888;font-style:italic;">.${ext} file — cannot render inline</div>`;
    }
    return `<div class="att-block" style="border:1px solid #000;${i>0?'border-top:none;':''}">
      <div style="background:${headerBg};color:#fff;font-weight:bold;font-size:10.5pt;padding:4px 10px;">${i+1}. ${dv(label)}</div>
      ${content}
    </div>`;
  };

  /* ══ ATTACHMENTS ══ */
  let attHTML = '';
  if (!processedAtts.length) {
    attHTML = `<div style="border:1px solid #000;padding:12px;text-align:center;color:#888;font-style:italic;border-top:none;">No attachments</div>`;
  } else {
    processedAtts.forEach((att,i) => {
      attHTML += renderInlineFile(att, i, att.name||att.fileName||`Document ${i+1}`);
    });
  }

  /* ══ CSS — matches printSalesOrder.js / printDeliveryChallan.js exactly ══ */
  const css = `
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 10pt; color: #000; background: #fff; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
    .page { padding: 12px; }
    /* border-collapse:separate (not collapse) — collapsed shared borders can
       vanish between rows on some print engines (notably Firefox) once a
       table crosses a forced page-break; the separate model paints every
       cell's own border independently so rows never lose their divider. */
    .outer { border: 1.5px solid #000; width: 100%; border-collapse: separate; border-spacing: 0; }
    .outer td, .outer th { border: 1px solid #000; padding: 2px 6px; vertical-align: top; }
    .section-hdr { text-align: center; font-weight: bold; font-size: 11pt; background: #fff; padding: 3px; }
    .col-hdr { font-weight: bold; text-decoration: underline; font-size: 10pt; }
    .field-row { display: flex; gap: 2px; margin-bottom: 1px; font-size: 9.5pt; }
    .field-lbl { min-width: 130px; font-weight: normal; }
    .field-colon { margin: 0 4px; }
    .field-val { flex: 1; }
    .item-table { width: 100%; border-collapse: separate; border-spacing: 0; font-size: 9pt; }
    .item-table th { border: 1px solid #000; padding: 4px 5px; font-weight: bold; text-align: center; background: #fff; }
    .item-table td { border: 1px solid #000; padding: 3px 5px; vertical-align: middle; }
    .embed-excel table { border-collapse: collapse; width: 100%; }
    .embed-excel td, .embed-excel th { border: 1px solid #ccc; padding: 2px 5px; font-size: 9pt; }
    .att-block { page-break-inside: auto; break-inside: auto; margin-bottom: 0; }
    .sig-row { page-break-before: avoid; break-before: avoid; page-break-inside: avoid; break-inside: avoid; }
    @media print {
      @page {
        margin: 8mm;
        size: A4 portrait;
        @bottom-center { content: "Page " counter(page) " of " counter(pages); font-size: 8pt; font-family: Arial, sans-serif; color: #555; }
      }
      .page { padding: 0; }
      canvas { max-width: 100%; display: block; }
      tr { page-break-inside: avoid; break-inside: avoid; }
    }
  `;

  /* ══ HTML ══ */
  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<title>Purchase Order — ${poNo}</title>
<style>${css}</style>
</head><body><div class="page">

<table class="outer">

  <!-- Company Header -->
  <tr>
    <td colspan="2" style="padding:8px 10px; border-bottom:2px solid #000;">
      <div style="display:flex; align-items:center; gap:12px;">
        ${logoTag}
        <div>
          <div style="font-size:13pt; font-weight:bold;">${coName}</div>
          <div style="font-size:8.5pt; color:#333;">${coAddr}</div>
          <div style="font-size:8.5pt; color:#333;">${[company?.gstin?'GSTIN: '+dv(company.gstin):'',company?.phone?'Ph: '+dv(company.phone):'',company?.email?'Email: '+dv(company.email):''].filter(Boolean).join('&nbsp;&nbsp;|&nbsp;&nbsp;')}</div>
        </div>
      </div>
    </td>
  </tr>

  <!-- Title -->
  <tr><td colspan="2" style="text-align:center; font-size:13pt; font-weight:bold; padding:6px; border-bottom:2px solid #000;">Purchase Order</td></tr>

  <!-- Vendor Details + Tax Identity -->
  <tr><td colspan="2" class="section-hdr" style="border-top:1.5px solid #000; border-bottom:1px solid #000;">Vendor Details &amp; Tax Identity</td></tr>
  <tr>
    <td><span class="col-hdr">Vendor Details</span></td>
    <td><span class="col-hdr">Tax Identity</span></td>
  </tr>
  <tr>
    <td>
      ${field('Vendor Code', o.vendorCode||o.vendorId)}
      ${field('Vendor Name', o.vendorName)}
      ${field('Contact Person', o.contactPerson)}
      ${field('Mobile', o.mobile)}
      ${field('Email', o.email)}
    </td>
    <td>
      ${field('GSTIN No', o.vendorGstin)}
      ${field('State', o.vendorState)}
      ${field('Mobile 2', o.mobile2)}
      ${field('PO Type', o.poType)}
      ${field('Incoterms', o.incoterms)}
    </td>
  </tr>

  <!-- Order Description -->
  <tr><td colspan="2" class="section-hdr" style="border-top:1.5px solid #000; border-bottom:1px solid #000;">Order Description</td></tr>
  <tr>
    <td>
      ${field('ERP No', o.orderId)}
      ${field('PO No', poNo)}
      ${field('PO Date', fmtD(o.poDate||o.orderDate))}
      ${field('Purchase By', o.purchasePerson)}
    </td>
    <td>
      ${field('Delivery Date', fmtD(o.deliveryDate))}
      ${field('Payment Terms', o.paymentTerms)}
      ${field('Dispatch Mode', o.dispatchMode)}
      ${field('Linked SO', o.linkedSalesOrderId ? (linkedSOOrderNo||('SO #'+dv(o.linkedSalesOrderId))) : '')}
    </td>
  </tr>
  ${(o.vendorRef||o.enquiryRef||o.quotationRef||o.quoteDate) ? `
  <tr>
    <td>
      ${field('Vendor Ref', o.vendorRef)}
      ${field('Quotation Ref', o.quotationRef)}
    </td>
    <td>
      ${field('Enquiry Ref', o.enquiryRef)}
      ${field('Quote Date', fmtD(o.quoteDate))}
    </td>
  </tr>
  ` : ''}

  <!-- Delivery & Shipping -->
  <tr><td colspan="2" class="section-hdr" style="border-top:1.5px solid #000; border-bottom:1px solid #000;">Delivery &amp; Shipping</td></tr>
  <tr>
    <td><span class="col-hdr">Delivery Address</span></td>
    <td><span class="col-hdr">Ship From (Vendor)</span></td>
  </tr>
  <tr>
    <td>
      ${field('Address', o.deliveryAddr||o.deliveryAddress)}
      ${field('City', o.deliveryCity)}
      ${field('State', o.deliveryState)}
      ${field('Pincode', o.deliveryPincode)}
    </td>
    <td>
      ${field('Address', o.shipFromAddress||o.vendorAddress)}
      ${field('City', o.shipFromCity||o.vendorCity)}
      ${field('State', o.shipFromState||o.vendorState)}
      ${field('Pincode', o.shipFromPincode||o.vendorPincode)}
    </td>
  </tr>
  ${(o.transporterName||o.vehicleNumber) ? `
  <tr>
    <td colspan="2">
      ${field('Transporter', o.transporterName)}
      ${field('Vehicle No', o.vehicleNumber)}
    </td>
  </tr>
  ` : ''}

  <!-- Item Description -->
  <tr><td colspan="2" class="section-hdr" style="border-top:1.5px solid #000; border-bottom:1px solid #000;">Item Description</td></tr>
  <tr style="page-break-inside:auto;break-inside:auto;"><td colspan="2" style="padding:0;">${itemTable}</td></tr>
  <tr style="page-break-inside:auto;break-inside:auto;"><td colspan="2" style="padding:6px 8px;">
    <strong>Amount in Words:</strong>&nbsp;${numWords(grand)}
  </td></tr>

  ${scopeItems.length > 0 ? `
  <!-- Scope of Work -->
  <tr><td colspan="2" class="section-hdr" style="border-top:1.5px solid #000; border-bottom:1px solid #000;">Scope of Work</td></tr>
  <tr style="page-break-inside:auto;break-inside:auto;"><td colspan="2" style="padding:0;">${scopeTable}</td></tr>
  ` : ''}

  ${(o.termsConditions||o.vendorNotes)?`
  <!-- Terms & Conditions -->
  <tr><td colspan="2" class="section-hdr" style="border-top:1.5px solid #000; border-bottom:1px solid #000;">Terms &amp; Conditions</td></tr>
  <tr style="page-break-inside:auto;break-inside:auto;"><td colspan="2" style="padding:6px 8px; font-size:9.5pt; line-height:1.5; white-space:pre-wrap;">${esc(o.termsConditions||o.vendorNotes)}</td></tr>
  `:''}

  ${o.internalNotes?`
  <!-- Internal Notes -->
  <tr><td colspan="2" class="section-hdr" style="border-top:1.5px solid #000; border-bottom:1px solid #000;">Internal Notes</td></tr>
  <tr style="page-break-inside:auto;break-inside:auto;"><td colspan="2" style="padding:6px 8px; font-size:9.5pt; line-height:1.5; white-space:pre-wrap; background:#fffdf0;">${esc(o.internalNotes)}</td></tr>
  `:''}

  <!-- Declaration -->
  <tr><td colspan="2" class="section-hdr" style="border-top:1.5px solid #000; border-bottom:1px solid #000;">Declaration</td></tr>
  <tr style="page-break-inside:auto;break-inside:auto;"><td colspan="2" style="padding:6px 8px; font-size:9.5pt; line-height:1.5;">
    1. Please mention PO Number in each Invoice.<br>
    2. Please ensure proper quality check &amp; inspection of supplied items before dispatch.<br>
    3. If the supplier does not respond within 3 days about any change in PO, the PO shall be deemed accepted &amp; enforced.
  </td></tr>

  <!-- Signature — always on the last page of the main order content -->
  <tr class="sig-row">
    <td style="text-align:center; padding:10px 10px 8px; width:50%;">
      <div style="height:85px; margin:0 8px 4px; border:1px solid #ccc; display:flex; align-items:center; justify-content:center; color:#aaa; font-size:8.5pt;">Signature</div>
      <div style="border-top:1px solid #000; margin:0 8px; padding-top:4px;">
        <strong>Prepared By</strong><br>
        <span style="font-size:9.5pt;">${preparedName}</span>
        ${preparedLoginId ? `<br><span style="font-size:8pt;color:#555;">Login ID: ${preparedLoginId}</span>` : ''}
        ${preparedDesignation ? `<br><span style="font-size:8pt;color:#555;">${preparedDesignation}</span>` : ''}
      </div>
    </td>
    <td style="text-align:center; padding:10px 10px 8px; width:50%;">
      <div style="height:85px; margin:0 8px 4px; border:1px solid #ccc; display:flex; align-items:center; justify-content:center; color:#aaa; font-size:8.5pt;">Signature &amp; Stamp</div>
      <div style="border-top:1px solid #000; margin:0 8px; padding-top:4px;">
        <strong>Authorised Signatory</strong><br><span style="font-size:9.5pt;">For ${coName}</span>
      </div>
    </td>
  </tr>
  <tr><td colspan="2" style="border-top:1px solid #000; font-size:8pt; color:#555;">
    <div style="display:flex; justify-content:space-between;">
      <span>${brandLine(user)}</span>
      <span>Printed: ${today}</span>
    </div>
  </td></tr>

</table>
</div>

${processedAtts.length > 0 ? `
<!-- ALL ATTACHMENTS — outside main table; each PDF starts on its own fresh page -->
<div style="page-break-before:always;break-before:page;font-family:Arial,Helvetica,sans-serif;padding:0 12mm;">
  <div style="text-align:center;font-size:12pt;font-weight:bold;border-top:1.5px solid #000;border-bottom:1.5px solid #000;padding:6px;margin-bottom:0;">All Attachments</div>
  ${attHTML}
</div>
` : ''}

${hasPdfs?`
<script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"><\/script>
<script>
pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
const getDocWithRetry=async(url,tries)=>{
  for(let i=0;i<tries;i++){
    try{ return await pdfjsLib.getDocument(url).promise; }
    catch(e){ if(i===tries-1) throw e; await new Promise(r=>setTimeout(r,400*(i+1))); }
  }
};
(async()=>{
  const containers=document.querySelectorAll('.pdf-render');
  for(const c of containers){
    const url=c.getAttribute('data-pdf-url');
    if(!url)continue;
    try{
      const pdf=await getDocWithRetry(url,3);
      const pw=c.clientWidth||760;
      for(let p=1;p<=pdf.numPages;p++){
        const page=await pdf.getPage(p);
        const vp0=page.getViewport({scale:1});
        const vp=page.getViewport({scale:pw/vp0.width});
        const canvas=document.createElement('canvas');
        canvas.width=vp.width;canvas.height=vp.height;
        canvas.style.cssText='width:100%;display:block;margin-bottom:2px;';
        await page.render({canvasContext:canvas.getContext('2d'),viewport:vp}).promise;
        c.appendChild(canvas);
      }
    }catch(e){c.innerHTML='<div style="padding:10px;color:#c00;">Could not render PDF: '+e.message+'<\/div>';}
  }
  setTimeout(()=>window.print(),700);
})();
<\/script>`:''}

</body></html>`;

  return { html, hasPdfs };
};

/* ══════════════════════════════════════════════════════════════════
   PRINT — opens a new window and triggers browser print dialog
══════════════════════════════════════════════════════════════════ */
export const printPurchaseOrder = async (order, company = {}, user = null) => {
  const { html, hasPdfs } = await buildPurchaseOrderHtml(order, company, { skipAttachments: false }, user);
  const win = window.open('','_blank','width=920,height=980,scrollbars=yes');
  if (!win){alert('Please allow pop-ups to print.');return;}
  win.document.write(withPrintFont(html));
  win.document.close();
  win.focus();
  if (!hasPdfs) setTimeout(()=>win.print(),900);
};
