/* printPurchaseOrder.js — same layout as printSalesOrder.js */

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
const fmtN = n => Number(n||0).toLocaleString('en-IN', { minimumFractionDigits:2, maximumFractionDigits:2 });

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

/* ── Nested table builder (same as SO) ── */
const BL = '1px solid #555';

function buildNestedTable(cols, headerWidths, bodyRows, footRows) {
  let thead = `<thead><tr>`;
  cols.forEach((c, i) => {
    const w = headerWidths[i] ? `width:${headerWidths[i]};` : '';
    const s = `border-top:none;border-bottom:${BL};border-left:${i===0?'none':BL};border-right:none;`;
    thead += `<th style="${s}${w}font-weight:bold;text-align:center;font-size:8.5pt;padding:3px 5px;white-space:nowrap;">${c}</th>`;
  });
  thead += `</tr></thead>`;

  let tbody = `<tbody>`;
  bodyRows.forEach(row => {
    tbody += `<tr>`;
    row.forEach((cell, ci) => {
      const s = `border-top:none;border-bottom:none;border-left:${ci===0?'none':BL};border-right:none;`;
      tbody += `<td style="${cell.style||''}${s}padding:3px 5px;font-size:9pt;vertical-align:top;">${cell.text}</td>`;
    });
    tbody += `</tr>`;
  });
  tbody += `</tbody>`;

  let tfoot = '';
  if (footRows && footRows.length > 0) {
    tfoot = `<tfoot>`;
    footRows.forEach((row, ri) => {
      tfoot += `<tr>`;
      row.forEach((cell, ci) => {
        const span = cell.colspan || 1;
        const colAttr = span > 1 ? ` colspan="${span}"` : '';
        const s = `border-top:${ri===0?BL:'none'};border-bottom:none;border-left:${ci===0?'none':BL};border-right:none;`;
        tfoot += `<td${colAttr} style="${cell.style||''}${s}padding:4px 8px;font-size:9.5pt;">${cell.text}</td>`;
      });
      tfoot += `</tr>`;
    });
    tfoot += `</tfoot>`;
  }

  return `<table style="width:100%;border-collapse:collapse;border:${BL};">${thead}${tbody}${tfoot}</table>`;
}

/* ══════════════════════════════════════════════════════════════════
   SHARED HTML BUILDER — used by both print and email
   opts.skipAttachments = true  → skip attachment fetching/rendering
══════════════════════════════════════════════════════════════════ */
export const buildPurchaseOrderHtml = async (order, company = {}, opts = {}) => {
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

  /* ── Arrays ── */
  const items   = Array.isArray(o.items)   ? o.items   : [];
  const charges = Array.isArray(o.charges) ? o.charges : [];

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
    ? `<img src="${logoB64}" style="height:56px;max-width:120px;object-fit:contain;vertical-align:middle;margin-right:12px;">`
    : '';

  /* ── Style constants (identical to SO) ── */
  const SECL  = '1.5px solid #555';
  const oc    = `border:none;padding:3px 8px;vertical-align:top;font-size:9.5pt;`;
  const lbl   = `${oc}white-space:nowrap;width:130px;font-weight:normal;`;
  const sep   = `${oc}width:12px;text-align:center;`;
  const val   = oc;
  const secHdr= `border-top:${SECL};border-bottom:${SECL};border-left:none;border-right:none;text-align:center;font-size:10.5pt;font-weight:bold;background:none;padding:6px 8px;`;
  const subHdr= `border:none;padding:7px 8px 2px;font-weight:bold;font-size:10pt;text-decoration:underline;`;
  const coCell= `border:none;text-align:center;padding:12px 14px;`;
  const ttlCell=`border-top:${SECL};border-bottom:${SECL};border-left:none;border-right:none;text-align:center;font-size:15pt;font-weight:bold;letter-spacing:3px;padding:9px;`;
  const ndWrap= `border:none;padding:2px 0 8px;`;

  const fr = (ll,lv,rl,rv) => `<tr>
    <td style="${lbl}">${ll}</td><td style="${sep}">:</td><td style="${val}">${lv}</td>
    <td style="${lbl}">${rl}</td><td style="${sep}">:</td><td style="${val}">${rv}</td>
  </tr>`;

  /* ══ ITEM TABLE ══ */
  const itemCols   = ['Sr No','Item Name','Specs / Description','HSN Code','Qty','Unit','Rate','Disc','GST%','Amount'];
  const itemWidths = ['30px','','','75px','45px','50px','75px','60px','50px','90px'];

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
          {text:dv(it.itemName||it.description||'')},
          {text:dv(it.description&&it.description!==(it.itemName||'')?it.description:''), style:'white-space:pre-wrap;font-size:8.5pt;color:#333;'},
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

  /* ── Footer rows ── */
  const footRowsRaw = [];
  const R  = 'text-align:right;';
  const RB = 'text-align:right;font-weight:bold;';
  const NC = itemCols.length; // 10

  // 1. Each charge
  validChg.forEach(c => {
    const a = parseFloat(c.amount)||0;
    footRowsRaw.push([
      {text:dv(c.chargeType||c.description||'Additional Charge'), style:R, colspan:NC-1},
      {text:fmtN(a), style:R},
    ]);
  });

  // 2. Total Taxable
  const combinedTaxable = itemTaxable + chgNet;
  footRowsRaw.push([
    {text:'Total Taxable', style:RB, colspan:NC-1},
    {text:fmtN(combinedTaxable), style:RB},
  ]);

  // 3. GST
  const rates = [...new Set(items.map(it=>parseFloat(it.gstPercent)||0).filter(r=>r>0))];
  const singleRate = rates.length===1 ? rates[0] : null;
  if (sameState) {
    const cgst = totalGstAmt/2;
    const sgst = totalGstAmt/2;
    footRowsRaw.push([{text:`CGST${singleRate?` @ ${singleRate/2}%`:''}`, style:R, colspan:NC-1},{text:fmtN(cgst),style:R}]);
    footRowsRaw.push([{text:`SGST${singleRate?` @ ${singleRate/2}%`:''}`, style:R, colspan:NC-1},{text:fmtN(sgst),style:R}]);
  } else {
    footRowsRaw.push([{text:`IGST${singleRate?` @ ${singleRate}%`:''}`, style:R, colspan:NC-1},{text:fmtN(totalGstAmt),style:R}]);
  }

  if (discount>0) footRowsRaw.push([{text:'Discount',style:R,colspan:NC-1},{text:`− ${fmtN(discount)}`,style:`${R}color:#c00;`}]);
  if (freight>0)  footRowsRaw.push([{text:'Freight Charges',style:R,colspan:NC-1},{text:fmtN(freight),style:R}]);
  if (packing>0)  footRowsRaw.push([{text:'Packing Charges',style:R,colspan:NC-1},{text:fmtN(packing),style:R}]);
  if (roundOff)   footRowsRaw.push([{text:'Round Off',style:R,colspan:NC-1},{text:fmtN(roundOff),style:R}]);

  // 4. Grand Total
  footRowsRaw.push([
    {text:'Total Order Value', style:RB, colspan:NC-1},
    {text:`₹ ${fmtN(grand)}`, style:RB},
  ]);

  const itemBodyFinal = itemBody[0]?.[0]?.colspan
    ? [[{text:'No items',style:'text-align:center;color:#888;font-style:italic;',colspan:NC}]]
    : itemBody;
  const itemTable = buildNestedTable(itemCols, itemWidths, itemBodyFinal, footRowsRaw);

  /* ══ ATTACHMENTS ══ */
  let attHTML = '';
  if (!processedAtts.length) {
    attHTML = `<div style="border:1px solid #555;padding:12px;text-align:center;color:#888;font-style:italic;border-top:none;">No attachments</div>`;
  } else {
    processedAtts.forEach((att,i) => {
      const label = att.name||att.fileName||`Document ${i+1}`;
      let content = '';
      if (att.kind==='pdf') {
        content = `<div class="pdf-render" data-pdf-url="${att.pdfUrl||''}" style="width:100%;min-height:40px;background:#f9f9f9;"></div>`;
      } else if (att.kind==='excel') {
        content = `<div style="overflow-x:auto;padding:6px;font-size:8.5pt;">${att.html||''}</div>`;
      } else if (att.kind==='word') {
        content = `<div style="padding:10px;font-size:9.5pt;line-height:1.6;">${att.html||''}</div>`;
      } else if (att.kind==='text') {
        const safe=(att.text||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
        content = `<pre style="padding:10px;font-family:monospace;font-size:8.5pt;white-space:pre-wrap;background:#f8f8f8;">${safe}</pre>`;
      } else {
        const ext=(att.fileName||'').split('.').pop().toUpperCase();
        content = `<div style="padding:12px;text-align:center;color:#888;font-style:italic;">.${ext} file — cannot render inline</div>`;
      }
      attHTML += `<div class="att-block" style="border:1px solid #555;${i>0?'border-top:none;':''}">
        <div style="background:#2a4a7a;color:#fff;font-weight:bold;font-size:9.5pt;padding:4px 10px;">${i+1}. ${dv(label)}</div>
        ${content}
      </div>`;
    });
  }

  /* ══ CSS ══ */
  const css = `
    *{margin:0;padding:0;box-sizing:border-box;}
    body{font-family:Arial,Helvetica,sans-serif;font-size:9.5pt;color:#000;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
    .page{padding:8mm 12mm;}
    .embed-excel table{border-collapse:collapse;width:100%;}
    .embed-excel td,.embed-excel th{border:1px solid #ccc;padding:2px 5px;font-size:8pt;}
    .att-block{page-break-inside:avoid;break-inside:avoid;}
    .sig-row{page-break-before:avoid;break-before:avoid;}
    @media print{
      @page{
        margin:10mm 10mm 14mm;
        size:A4 portrait;
        @bottom-center{content:"Page " counter(page) " of " counter(pages);font-size:8pt;font-family:Arial,sans-serif;color:#555;}
      }
      .page{padding:0;}
      canvas{max-width:100%;display:block;}
      tr{page-break-inside:avoid;break-inside:avoid;}
    }
  `;

  /* ══ HTML ══ */
  const poNo = dv(o.poNo||o.voucherNumber||o.orderId);
  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<title>Purchase Order — ${poNo}</title>
<style>${css}</style>
</head><body><div class="page">

<table style="width:100%;border-collapse:collapse;">
<colgroup>
  <col style="width:130px"><col style="width:14px"><col>
  <col style="width:130px"><col style="width:14px"><col>
</colgroup>
<tbody>

<!-- ═══ COMPANY HEADER ═══ -->
<tr><td colspan="6" style="${coCell}">
  <div style="text-align:center;">
    ${logoTag?`<div style="margin-bottom:6px;">${logoTag}</div>`:''}
    <div style="font-size:22pt;font-weight:bold;line-height:1.2;letter-spacing:1px;">${coName}</div>
    ${coAddr?`<div style="font-size:8.5pt;color:#444;margin-top:3px;">${coAddr}</div>`:''}
    ${company?.gstin||company?.phone||company?.email?`<div style="font-size:8.5pt;margin-top:2px;">${[company?.gstin?'GSTIN: '+dv(company.gstin):'',company?.phone?'Ph: '+dv(company.phone):'',company?.email?'Email: '+dv(company.email):''].filter(Boolean).join('&nbsp;&nbsp;|&nbsp;&nbsp;')}</div>`:''}
  </div>
</td></tr>

<!-- ═══ TITLE ═══ -->
<tr><td colspan="6" style="${ttlCell}">Purchase Order</td></tr>

<!-- VENDOR DETAILS | TAX IDENTITY -->
<tr>
  <td colspan="3" style="${subHdr}">Vendor Details</td>
  <td colspan="3" style="${subHdr}">Tax Identity</td>
</tr>
${fr('Vendor Name', `<strong>${dv(o.vendorName)}</strong>`, 'GSTIN No', dv(o.vendorGstin))}
${fr('Vendor Code', dv(o.vendorCode||o.vendorId),            'State',    dv(o.vendorState))}
${fr('Contact',     dv(o.contactPerson),                      'Mobile',   dv(o.mobile))}
${fr('Email',       dv(o.email),                              'Mobile 2', dv(o.mobile2))}

<!-- ORDER DESCRIPTION -->
<tr><td colspan="6" style="${secHdr}">Order Description</td></tr>
${fr('ERP No',        dv(o.orderId),                                     'PO Date',         fmtD(o.poDate||o.orderDate))}
${fr('PO No',         `<strong>${poNo}</strong>`,                         'Delivery Date',   `<strong>${fmtD(o.deliveryDate)}</strong>`)}
${fr('PO Type',       dv(o.poType),                                       'Payment Terms',   dv(o.paymentTerms))}
${fr('Linked SO',     o.linkedSalesOrderId?`<strong>SO #${dv(o.linkedSalesOrderId)}</strong>`:'—', 'Dispatch Mode', dv(o.dispatchMode))}
${fr('Purchase By',   dv(o.purchasePerson),                               'Incoterms',       dv(o.incoterms))}
${o.vendorRef||o.enquiryRef||o.quotationRef?fr('Vendor Ref', dv(o.vendorRef), 'Enquiry Ref', dv(o.enquiryRef)):''}
${o.quotationRef?fr('Quotation Ref', dv(o.quotationRef), 'Quote Date', fmtD(o.quoteDate)):''}

<!-- DELIVERY ADDRESS -->
<tr><td colspan="6" style="${secHdr}">Delivery & Shipping</td></tr>
<tr>
  <td colspan="3" style="${subHdr}">Delivery Address</td>
  <td colspan="3" style="${subHdr}">Ship From (Vendor)</td>
</tr>
${fr('Address',   dv(o.deliveryAddr||o.deliveryAddress),   'Address',  dv(o.shipFromAddress||o.vendorAddress))}
${fr('City',      dv(o.deliveryCity),                       'City',     dv(o.shipFromCity||o.vendorCity))}
${fr('State',     dv(o.deliveryState),                      'State',    dv(o.shipFromState||o.vendorState))}
${fr('Pincode',   dv(o.deliveryPincode),                    'Pincode',  dv(o.shipFromPincode||o.vendorPincode))}
${fr('Transporter', dv(o.transporterName),                  'Vehicle No', dv(o.vehicleNumber))}

<!-- ITEM DESCRIPTION -->
<tr><td colspan="6" style="${secHdr}">Item Description</td></tr>
<tr><td colspan="6" style="${ndWrap}">${itemTable}</td></tr>
<tr><td colspan="6" style="border:none;padding:4px 8px 8px;font-size:9.5pt;">
  <strong>Amount in Words:</strong>&nbsp;${numWords(grand)}
</td></tr>

${o.termsConditions||o.vendorNotes||o.internalNotes?`
<!-- TERMS -->
<tr><td colspan="6" style="${secHdr}">Terms &amp; Conditions</td></tr>
<tr><td colspan="6" style="${oc}font-size:9pt;line-height:1.5;white-space:pre-wrap;">${esc(o.termsConditions||o.vendorNotes||o.internalNotes)}</td></tr>
`:''}

<!-- DECLARATION -->
<tr><td colspan="6" style="${secHdr}">Declaration</td></tr>
<tr><td colspan="6" style="${oc}font-size:9pt;line-height:1.7;">
  1. Please mention PO Number in each Invoice.<br>
  2. Please ensure proper quality check &amp; inspection of supplied items before dispatch.<br>
  3. If the supplier does not respond within 3 days about any change in PO, the PO shall be deemed accepted &amp; enforced.
</td></tr>

<!-- ALL ATTACHMENTS -->
<tr><td colspan="6" style="${secHdr}">All Attachments</td></tr>
<tr><td colspan="6" style="${ndWrap}">
  ${attHTML||`<div style="padding:14px;text-align:center;color:#888;font-style:italic;">No attachments</div>`}
</td></tr>

<!-- SIGNATURE -->
<tr class="sig-row">
  <td colspan="2" style="border:none;text-align:center;padding:44px 10px 8px;">
    <div style="border-top:1px solid #000;margin:0 8px;padding-top:4px;">
      <strong>Prepared By</strong><br><span style="font-size:9pt;">${dv(o.purchasePerson)||'&nbsp;'}</span>
    </div>
  </td>
  <td colspan="2" style="border:none;text-align:center;padding:44px 10px 8px;">
    <div style="border-top:1px solid #000;margin:0 8px;padding-top:4px;"><strong>Checked By</strong></div>
  </td>
  <td colspan="2" style="border:none;text-align:center;padding:44px 10px 8px;">
    <div style="border-top:1px solid #000;margin:0 8px;padding-top:4px;">
      <strong>Authorised Signatory</strong><br><span style="font-size:9pt;">For ${coName}</span>
    </div>
  </td>
</tr>
<tr><td colspan="6" style="border-top:${SECL};border-left:none;border-right:none;border-bottom:none;text-align:right;font-size:8pt;color:#666;background:#f5f5f5;padding:3px 8px;">
  Printed: ${today}
</td></tr>

</tbody>
</table>
</div>

${hasPdfs?`
<script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"><\/script>
<script>
pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
(async()=>{
  const containers=document.querySelectorAll('.pdf-render');
  for(const c of containers){
    const url=c.getAttribute('data-pdf-url');
    if(!url)continue;
    try{
      const pdf=await pdfjsLib.getDocument(url).promise;
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
export const printPurchaseOrder = async (order, company = {}) => {
  const { html, hasPdfs } = await buildPurchaseOrderHtml(order, company, { skipAttachments: false });
  const win = window.open('','_blank','width=920,height=980,scrollbars=yes');
  if (!win){alert('Please allow pop-ups to print.');return;}
  win.document.write(html);
  win.document.close();
  win.focus();
  if (!hasPdfs) setTimeout(()=>win.print(),900);
};
