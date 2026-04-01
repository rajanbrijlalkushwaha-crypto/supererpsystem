/* ═══════════════════════════════════════════════════════════════
   EPSILON ERP — Sales Order Print  |  Clean A4 Layout
   Usage: printSalesOrder(order, company)
   ═══════════════════════════════════════════════════════════════ */

/* ── Helpers ── */
const fmtD = d => {
  if (!d) return '—';
  const dt = new Date(d);
  return isNaN(dt) ? d : `${String(dt.getDate()).padStart(2,'0')}-${String(dt.getMonth()+1).padStart(2,'0')}-${dt.getFullYear()}`;
};
const fmtN = (n, d=2) => Number(n||0).toLocaleString('en-IN',{minimumFractionDigits:d,maximumFractionDigits:d});
const esc  = v => (!v && v!==0) ? '' : String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const v    = x => esc(x) || '—';
const vb   = x => esc(x) || '';   /* blank if empty */
const r    = n => fmtN(n);

/* ── Amount in Words ── */
function numWords(n) {
  n = Math.round(Math.abs(n||0));
  if (!n) return 'Zero Rupees Only';
  const a = ['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten','Eleven','Twelve',
    'Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'];
  const b = ['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
  const seg = x => !x ? '' : x<20 ? a[x]+' ' : b[Math.floor(x/10)]+(x%10?' '+a[x%10]:'')+' ';
  let w = '';
  if (Math.floor(n/10000000))          w += seg(Math.floor(n/10000000))+'Crore ';
  if (Math.floor((n%10000000)/100000)) w += seg(Math.floor((n%10000000)/100000))+'Lakh ';
  if (Math.floor((n%100000)/1000))     w += seg(Math.floor((n%100000)/1000))+'Thousand ';
  if (Math.floor((n%1000)/100))        w += seg(Math.floor((n%1000)/100))+'Hundred ';
  if (n%100) w += seg(n%100);
  return 'INR ' + w.trim() + ' Only';
}

/* ═══════════════════════════════════════════════════════════════
   MAIN EXPORT
   ═══════════════════════════════════════════════════════════════ */
export const printSalesOrder = (order, company = {}) => {
  const o = order || {};

  /* Company */
  const coName   = vb(company.companyName||company.name) || 'Epsilon Enterprise';
  const coAddr   = vb(company.address) || '502, The Sungrace Arcade, Motera';
  const coCity   = [company.city, company.state, company.pincode].filter(Boolean).join(', ') || 'Ahmedabad - 382424';
  const coMobile = vb(company.mobile||company.phone) || '9328927043';
  const coEmail  = vb(company.email) || 'Finacc@epsilonprefab.org';
  const coGstin  = vb(company.gstin||company.gstNumber) || '24AAJFE8007G1ZM';
  const coPan    = vb(company.pan);

  /* Arrays */
  const items      = Array.isArray(o.items)      ? o.items      : [];
  const addons     = Array.isArray(o.addons)      ? o.addons     : [];
  const charges    = Array.isArray(o.charges)     ? o.charges    : [];
  const scopes     = Array.isArray(o.scopeItems)  ? o.scopeItems : [];
  const activities = Array.isArray(o.tasks)       ? o.tasks      :
                     Array.isArray(o.activities)  ? o.activities : [];
  const atts       = Array.isArray(o.attachments) ? o.attachments: [];
  const bg         = (typeof o.bankGuarantee==='object'&&o.bankGuarantee) ? o.bankGuarantee : {};
  const wt         = (typeof o.warranty==='object'&&o.warranty) ? o.warranty : {};

  /* Calculations */
  const itemsNet  = items.reduce((s,it)=>s+(parseFloat(it.qty)||0)*(parseFloat(it.rate)||0),0);
  const itemsGst  = items.reduce((s,it)=>{const a=(parseFloat(it.qty)||0)*(parseFloat(it.rate)||0);return s+a*(parseFloat(it.gstPercent||it.gst)||0)/100;},0);
  const chgNet    = charges.reduce((s,c)=>s+(parseFloat(c.amount)||0),0);
  const chgGst    = charges.reduce((s,c)=>{const a=parseFloat(c.amount)||0;return s+a*(parseFloat(c.gst)||0)/100;},0);
  const cgst      = parseFloat(o.cgst)||(itemsGst/2);
  const sgst      = parseFloat(o.sgst)||(itemsGst/2);
  const igst      = parseFloat(o.igst)||0;
  const freight   = parseFloat(o.freightCharges)||0;
  const packing   = parseFloat(o.packingCharges)||0;
  const discount  = parseFloat(o.overallDiscount)||0;
  const roundOff  = parseFloat(o.roundOff)||0;
  const grand     = parseFloat(o.grandTotal)||(itemsNet+itemsGst+chgNet+chgGst-discount+freight+packing+roundOff);

  const statusLabel = (o.status||'Draft').charAt(0).toUpperCase()+(o.status||'Draft').slice(1);

  /* ── CSS constants ── */
  const ORANGE = '#ffe0b2';
  const GRAY   = '#e8e8e8';
  const BLACK  = '#000';
  const BORDER = `1px solid ${BLACK}`;

  /* ── Shared cell style strings ── */
  const TC = 'text-align:center;';
  const TR = 'text-align:right;';
  const TL = 'text-align:left;';

  /* ════════════
     ITEM ROWS
     ════════════ */
  const itemRows = items.length===0
    ? `<tr><td colspan="8" style="height:28px;font-style:italic;${TC}color:#aaa;">No items added</td></tr>`
    : items.map((it,i)=>{
        const qty  = parseFloat(it.qty)||0;
        const rate = parseFloat(it.rate)||0;
        const amt  = qty*rate;
        const gst  = parseFloat(it.gstPercent||it.gst)||0;
        const name = vb(it.material||it.itemName||it.description);
        const desc = vb(it.description||'');
        const cell = (desc && desc!==name)
          ? `<b>${esc(name)||'—'}</b><br/><span style="font-size:8pt;color:#444;">${esc(desc)}</span>`
          : `<b>${esc(name)||'—'}</b>`;
        return `<tr>
          <td style="${TC}padding:4px;">${i+1}</td>
          <td style="${TC}">${vb(it.type)||'—'}</td>
          <td style="padding:4px 6px;">${cell}</td>
          <td style="${TC}">${qty||'—'}</td>
          <td style="${TC}">${vb(it.unit)||'—'}</td>
          <td style="${TR}padding-right:6px;">${rate?r(rate):'—'}</td>
          <td style="${TC}">${gst?gst+'%':'—'}</td>
          <td style="${TR}padding-right:6px;">${amt?r(amt):'—'}</td>
        </tr>`;
      }).join('');

  /* ════════════════
     SUMMARY ROWS (right-aligned box)
     ════════════════ */
  const summaryRows = [];
  summaryRows.push(`<tr><td>Sub Total (excl. GST)</td><td style="${TR}">${r(itemsNet)}</td></tr>`);
  charges.forEach(c=>{
    const a=parseFloat(c.amount)||0;
    if(a) summaryRows.push(`<tr><td>${vb(c.chargeType||c.description)||'Charge'}</td><td style="${TR}">${r(a)}</td></tr>`);
  });
  if(freight)  summaryRows.push(`<tr><td>Transport / Freight</td><td style="${TR}">${r(freight)}</td></tr>`);
  if(packing)  summaryRows.push(`<tr><td>Packing Charges</td><td style="${TR}">${r(packing)}</td></tr>`);
  if(discount) summaryRows.push(`<tr><td>Discount</td><td style="${TR}color:#c00;">– ${r(discount)}</td></tr>`);
  if(igst>0) {
    summaryRows.push(`<tr><td>IGST</td><td style="${TR}">${r(igst)}</td></tr>`);
  } else {
    if(cgst>0) summaryRows.push(`<tr><td>CGST</td><td style="${TR}">${r(cgst)}</td></tr>`);
    if(sgst>0) summaryRows.push(`<tr><td>SGST</td><td style="${TR}">${r(sgst)}</td></tr>`);
  }
  if(roundOff) summaryRows.push(`<tr><td>Round Off</td><td style="${TR}">${r(roundOff)}</td></tr>`);

  /* ════════════
     ADD-ON ROWS
     ════════════ */
  const addonRows = addons.length===0
    ? `<tr><td colspan="7" style="height:24px;"></td></tr>`
    : addons.map((a,i)=>`<tr>
        <td style="${TC}">${i+1}</td>
        <td>${vb(a.description||a.itemName)||'—'}</td>
        <td style="${TC}">${vb(a.category)||'—'}</td>
        <td style="${TC}">${a.qty||'—'}</td>
        <td style="${TC}">${vb(a.unit)||'—'}</td>
        <td style="${TC}">${a.includedInPrice?'Yes':'No'}</td>
        <td>${vb(a.remarks)||'—'}</td>
      </tr>`).join('');

  /* ════════════
     SCOPE ROWS
     ════════════ */
  const scopeRows = scopes.length===0
    ? `<tr><td colspan="6" style="height:24px;"></td></tr><tr><td colspan="6" style="height:24px;"></td></tr>`
    : scopes.map((s,i)=>`<tr>
        <td style="${TC}">${i+1}</td>
        <td>${vb(s.item||s.scope||s.description)||'—'}</td>
        <td style="${TC};font-size:12pt;">${s.clientScope?'✓':''}</td>
        <td style="${TC};font-size:12pt;">${s.ourScope!==false?'✓':''}</td>
        <td>${vb(s.notes)||'—'}</td>
        <td>${vb(s.remarks)||'—'}</td>
      </tr>`).join('');

  /* ════════════
     WARRANTY ROWS
     ════════════ */
  const wtRows = wt.period
    ? `<tr>
        <td style="${TC}">1</td>
        <td>${vb(wt.period)||'—'}</td>
        <td style="${TC}">${vb(wt.type)||'—'}</td>
        <td style="${TC}">${fmtD(wt.startDate)}</td>
        <td style="${TC}">${fmtD(wt.endDate)}</td>
      </tr>`
    : `<tr><td colspan="5" style="height:24px;"></td></tr><tr><td colspan="5" style="height:24px;"></td></tr>`;

  /* ════════════
     BANK GUARANTEE ROW
     ════════════ */
  const bgOrderVal = bg.basis==='withGst' ? grand : itemsNet;
  const bgPct      = parseFloat(bg.pct)||0;
  const bgAmt      = bgPct ? bgOrderVal*bgPct/100 : 0;
  const bgRow = bg.applicable
    ? `<tr>
        <td style="${TC}">1</td>
        <td style="${TC}">Yes</td>
        <td style="${TR}padding-right:6px;">${r(bgOrderVal)}</td>
        <td style="${TC}">${bg.basis==='withGst'?'With GST':'Without GST'}</td>
        <td style="${TC}">${bgPct?bgPct+'%':'—'}</td>
        <td style="${TR}padding-right:6px;">${bgAmt?r(bgAmt):'—'}</td>
        <td>${vb(bg.bankName)}${bg.bgNo?'<br/>BG No: '+vb(bg.bgNo):''}${bg.expiry?'<br/>Expiry: '+fmtD(bg.expiry):''}</td>
      </tr>`
    : `<tr><td style="${TC}">—</td><td colspan="6" style="color:#aaa;font-style:italic;">Not Applicable</td></tr>`;

  /* ════════════
     ACTIVITY ROWS
     ════════════ */
  const actRows = activities.length===0
    ? `<tr><td colspan="7" style="height:24px;"></td></tr><tr><td colspan="7" style="height:24px;"></td></tr>`
    : activities.map((a,i)=>{
        const st = {Completed:'#c8e6c9',['In Progress']:'#bbdefb',Pending:'#fff9c4',['On Hold']:'#eeeeee',Cancelled:'#ffcdd2'}[a.status]||'#fff';
        return `<tr>
          <td style="${TC}">${i+1}</td>
          <td>${vb(a.task||a.description)||'—'}</td>
          <td style="${TC}">${fmtD(a.startDate)}</td>
          <td style="${TC}">${fmtD(a.endDate)}</td>
          <td>${vb(a.ref||a.reference)||'—'}</td>
          <td style="${TC};background:${st};">${vb(a.status)||'Pending'}</td>
          <td>${vb(a.remarks)||'—'}</td>
        </tr>`;
      }).join('');

  /* ════════════
     ATTACHMENT ROWS
     ════════════ */
  const attRows = atts.length===0
    ? `<tr><td colspan="3" style="height:24px;"></td></tr>`
    : atts.map((a,i)=>`<tr>
        <td style="${TC}">${i+1}</td>
        <td>${vb(a.name||a.fileName)||'Document '+(i+1)}</td>
        <td>${vb(a.usedFor||a.description)||'—'}</td>
      </tr>`).join('');

  /* ════════════════════════════════════════════════════
     HTML
     ════════════════════════════════════════════════════ */
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<title>SO — ${vb(o.orderNo||o.orderId)}</title>
<style>
*,*::before,*::after{margin:0;padding:0;box-sizing:border-box;}
body{font-family:"Times New Roman",Times,serif;font-size:10pt;color:#000;background:#ccc;}

/* ── Page ── */
.page{background:#fff;max-width:210mm;margin:0 auto;padding:10mm 12mm 8mm;min-height:297mm;}

/* ── Toolbar (screen only) ── */
.toolbar{background:#2c2c2c;color:#fff;padding:8px 20px;display:flex;
  justify-content:space-between;align-items:center;max-width:210mm;margin:0 auto;}
.pbtn{background:#f90;color:#000;border:none;padding:6px 24px;
  font-family:"Times New Roman",Times,serif;font-size:10pt;font-weight:700;cursor:pointer;}

/* ── Company Header ── */
.co-hd{text-align:center;padding-bottom:8px;border-bottom:2.5px solid #000;margin-bottom:6px;}
.co-hd h1{font-size:24pt;font-weight:900;letter-spacing:0.5px;margin-bottom:3px;}
.co-hd p{font-size:9.5pt;line-height:1.5;}
.co-hd .gstin{font-size:10pt;font-weight:700;}

/* ── SO Title Banner ── */
.so-banner{
  background:#ffe0b2;border:${BORDER};
  text-align:center;font-size:13pt;font-weight:700;
  letter-spacing:2px;padding:4px;margin-bottom:0;
  text-transform:uppercase;
}

/* ── All tables ── */
table{width:100%;border-collapse:collapse;font-size:9.5pt;}
td,th{border:${BORDER};padding:3px 5px;vertical-align:middle;}

/* ── Orange section header row ── */
.sec td{background:#ffe0b2;font-weight:700;font-size:10pt;text-align:center;
  padding:5px;letter-spacing:0.5px;text-transform:uppercase;}

/* ── Gray column sub-headers ── */
th{background:#e8e8e8;font-weight:700;font-size:9pt;text-align:center;}

/* ── Order details grid ── */
.lbl{font-weight:700;background:#f5f5f5;width:130px;white-space:nowrap;}
.val{width:150px;}

/* ── Bill To / Ship To ── */
.party-hd td{background:#ffe0b2;font-weight:700;font-size:10pt;text-align:center;padding:5px;}
.party-lbl{font-weight:700;font-size:9pt;color:#333;white-space:nowrap;}

/* ── Summary box ── */
.sum-lbl{padding:3px 8px;font-size:9.5pt;}
.sum-val{padding:3px 8px;text-align:right;font-size:9.5pt;white-space:nowrap;}
.sum-total td{background:#ffe0b2;font-weight:700;font-size:11pt;}

/* ── Amount in words ── */
.words{border:${BORDER};padding:5px 8px;font-size:9.5pt;margin-bottom:6px;
  background:#fffde7;}

/* ── Page break ── */
.pb{page-break-before:always;}
.nb{page-break-inside:avoid;}

/* ── Signature ── */
.sig td{height:65px;text-align:center;vertical-align:bottom;
  padding-bottom:5px;font-size:9pt;}

/* ── Footer line ── */
.footer{border-top:1.5px solid #000;margin-top:10px;padding-top:4px;
  display:flex;justify-content:space-between;font-size:8.5pt;color:#444;}

@media screen{body{padding:10px 0 30px;}}
@media print{
  @page{size:A4 portrait;margin:7mm 9mm;}
  body{background:#fff;}
  .page{padding:0;max-width:none;min-height:auto;}
  .toolbar{display:none!important;}
  body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}
  tr{page-break-inside:avoid;}
  .nb{page-break-inside:avoid;}
  .pb{page-break-before:always;}
}
</style>
</head>
<body>

<!-- TOOLBAR -->
<div class="toolbar">
  <span>SO: <b>${vb(o.orderNo||('#'+o.orderId))}</b> &nbsp;·&nbsp; ${vb(o.customerName||o.party)}</span>
  <button class="pbtn" onclick="window.print()">🖨️ &nbsp;Print / Save PDF</button>
</div>

<div class="page">

<!-- ═══════════════════════════════
     1. COMPANY HEADER
     ═══════════════════════════════ -->
<div class="co-hd">
  <h1>${coName}</h1>
  <p>${coAddr}${coCity?', '+coCity:''}</p>
  <p>Mobile No: ${coMobile} &nbsp;&nbsp; Email: ${coEmail}</p>
  <p class="gstin">GSTIN: ${coGstin}${coPan?' &nbsp;&nbsp; PAN: '+coPan:''}</p>
</div>

<!-- ═══════════════════════════════
     2. SO TITLE BANNER
     ═══════════════════════════════ -->
<div class="so-banner">Sales Order</div>

<!-- ═══════════════════════════════
     3. ORDER REFERENCE DETAILS
     ═══════════════════════════════ -->
<table class="nb" style="margin-top:0;margin-bottom:6px;">
  <tr>
    <td class="lbl">Epsilon ERP No.</td>
    <td class="val"><b>${vb(o.orderId)}</b></td>
    <td class="lbl">ERP Order Date</td>
    <td class="val">${fmtD(o.orderDate||o.date)}</td>
  </tr>
  <tr>
    <td class="lbl">SO Number</td>
    <td class="val"><b>${vb(o.orderNo||o.voucherNumber)||'—'}</b></td>
    <td class="lbl">Status</td>
    <td class="val"><b>${statusLabel}</b></td>
  </tr>
  <tr>
    <td class="lbl">Quote Ref No.</td>
    <td class="val">${v(o.quotationRef||o.orderRef)}</td>
    <td class="lbl">Quote Date</td>
    <td class="val">${fmtD(o.poDate)}</td>
  </tr>
  <tr>
    <td class="lbl">Client Order No.</td>
    <td class="val"><b>${v(o.customerPO||o.reference)}</b></td>
    <td class="lbl">Client Order Date</td>
    <td class="val">${fmtD(o.poDate)}</td>
  </tr>
  <tr>
    <td class="lbl">Due / Delivery Date</td>
    <td class="val"><b>${fmtD(o.deliveryDate||o.dueDate)}</b></td>
    <td class="lbl">Payment Terms</td>
    <td class="val">${v(o.paymentTerms)}</td>
  </tr>
  <tr>
    <td class="lbl">Sales Person</td>
    <td class="val">${v(o.salesPerson)}</td>
    <td class="lbl">Order Type</td>
    <td class="val">${v(o.orderType)}</td>
  </tr>
</table>

<!-- ═══════════════════════════════
     4. BILL TO / SHIP TO
     ═══════════════════════════════ -->
<table class="nb" style="margin-bottom:6px;">
  <tr class="party-hd">
    <td style="width:50%;background:#ffe0b2;font-weight:700;font-size:10pt;text-align:center;padding:5px;">Bill To</td>
    <td style="width:50%;background:#ffe0b2;font-weight:700;font-size:10pt;text-align:center;padding:5px;border-left:2px solid #000;">Ship To</td>
  </tr>
  <tr>
    <td style="padding:6px 8px;vertical-align:top;">
      <div style="font-size:10.5pt;font-weight:700;margin-bottom:4px;">${vb(o.customerName||o.party)||'—'}</div>
      ${vb(o.address||o.shippingAddr)?`<div style="font-size:9pt;margin-bottom:2px;">${esc(o.address||o.shippingAddr)}</div>`:''}
      <div style="font-size:9pt;">
        ${vb(o.customerCity)?'<span class="party-lbl">City: </span>'+esc(o.customerCity)+'&nbsp;&nbsp;':''}
        ${vb(o.customerState)?'<span class="party-lbl">State: </span>'+esc(o.customerState):''}
      </div>
      ${vb(o.customerPincode)?`<div style="font-size:9pt;"><span class="party-lbl">Pincode: </span>${esc(o.customerPincode)}</div>`:''}
      ${vb(o.customerGstin||o.partyGstin)?`<div style="font-size:9pt;margin-top:3px;"><span class="party-lbl">GSTIN: </span>${esc(o.customerGstin||o.partyGstin)}</div>`:''}
      <div style="font-size:9pt;margin-top:4px;border-top:1px dashed #bbb;padding-top:3px;">
        ${vb(o.contactPerson)?'<span class="party-lbl">Contact: </span>'+esc(o.contactPerson)+'<br/>':''}
        ${vb(o.mobile)?'<span class="party-lbl">Mobile: </span>'+esc(o.mobile)+'<br/>':''}
        ${vb(o.email)?'<span class="party-lbl">Email: </span>'+esc(o.email):''}
      </div>
    </td>
    <td style="padding:6px 8px;vertical-align:top;border-left:2px solid #000;">
      <div style="font-size:10.5pt;font-weight:700;margin-bottom:4px;">${vb(o.shipToName||o.customerName||o.party)||'—'}</div>
      ${vb(o.shipToAddress||o.deliveryAddr||o.destination)?`<div style="font-size:9pt;margin-bottom:2px;">${esc(o.shipToAddress||o.deliveryAddr||o.destination)}</div>`:''}
      <div style="font-size:9pt;">
        ${vb(o.shipToCity)?'<span class="party-lbl">City: </span>'+esc(o.shipToCity)+'&nbsp;&nbsp;':''}
        ${vb(o.shipToState)?'<span class="party-lbl">State: </span>'+esc(o.shipToState):''}
      </div>
      ${vb(o.shipToPincode)?`<div style="font-size:9pt;"><span class="party-lbl">Pincode: </span>${esc(o.shipToPincode)}</div>`:''}
      ${vb(o.dispatchMode||o.shippedBy)?`<div style="font-size:9pt;margin-top:3px;"><span class="party-lbl">Dispatch Mode: </span>${esc(o.dispatchMode||o.shippedBy)}</div>`:''}
      <div style="font-size:9pt;margin-top:4px;border-top:1px dashed #bbb;padding-top:3px;">
        ${vb(o.shipToContact||o.contactPerson)?'<span class="party-lbl">Contact: </span>'+esc(o.shipToContact||o.contactPerson)+'<br/>':''}
        ${vb(o.shipToMobile||o.mobile)?'<span class="party-lbl">Mobile: </span>'+esc(o.shipToMobile||o.mobile)+'<br/>':''}
        ${vb(o.shipToEmail||o.email)?'<span class="party-lbl">Email: </span>'+esc(o.shipToEmail||o.email):''}
      </div>
    </td>
  </tr>
</table>

<!-- ═══════════════════════════════
     5. ORDER DESCRIPTION / ITEMS
     ═══════════════════════════════ -->
<table style="margin-bottom:0;">
  <tr class="sec"><td colspan="8">Order Description</td></tr>
  <tr>
    <th style="width:32px;">Sr No.</th>
    <th style="width:88px;">Type</th>
    <th style="text-align:left;padding-left:6px;">Item Description</th>
    <th style="width:40px;">Qty</th>
    <th style="width:42px;">Unit</th>
    <th style="width:82px;text-align:right;padding-right:6px;">Rate (₹)</th>
    <th style="width:52px;">GST @</th>
    <th style="width:86px;text-align:right;padding-right:6px;">Amount (₹)</th>
  </tr>
  ${itemRows}
</table>

<!-- ═══════════════════════════════
     6. FINANCIAL SUMMARY (right-aligned)
     ═══════════════════════════════ -->
<table style="margin-top:0;margin-bottom:6px;">
  <tr>
    <td style="border:none;width:55%;"></td>
    <td style="border:none;width:45%;padding:0;">
      <table style="margin:0;">
        ${summaryRows.join('')}
        <tr class="sum-total">
          <td class="sum-lbl" style="background:#ffe0b2;font-weight:700;font-size:10.5pt;">Total Order Value</td>
          <td class="sum-val" style="background:#ffe0b2;font-weight:700;font-size:10.5pt;">${r(grand)}</td>
        </tr>
      </table>
    </td>
  </tr>
</table>

<!-- Amount in words -->
<div class="words nb"><b>Amount in Words:</b> &nbsp; ${numWords(grand)}</div>

${addons.length>0?`
<!-- ═══════════════════════════════
     7. ADD-ON ITEMS
     ═══════════════════════════════ -->
<table class="nb" style="margin-bottom:6px;">
  <tr class="sec"><td colspan="7">Add On Items</td></tr>
  <tr>
    <th style="width:32px;">Sr No.</th>
    <th style="text-align:left;padding-left:6px;">Item Name</th>
    <th style="width:88px;">Category</th>
    <th style="width:40px;">Qty</th>
    <th style="width:42px;">UOM</th>
    <th style="width:72px;">Included in SO</th>
    <th style="text-align:left;padding-left:6px;">Remarks</th>
  </tr>
  ${addonRows}
</table>`:''}

<!-- ═══════════════════════════════
     8. BANK GUARANTEE
     ═══════════════════════════════ -->
<table class="nb" style="margin-bottom:6px;">
  <tr class="sec"><td colspan="7">Bank Guarantee</td></tr>
  <tr>
    <th style="width:32px;">Sr No.</th>
    <th style="width:72px;">BG Applicable</th>
    <th style="width:90px;text-align:right;padding-right:6px;">Order Value (₹)</th>
    <th style="width:88px;">On Basis</th>
    <th style="width:48px;">BG %</th>
    <th style="width:90px;text-align:right;padding-right:6px;">BG Amount (₹)</th>
    <th style="text-align:left;padding-left:6px;">BG Details &amp; Expiry</th>
  </tr>
  ${bgRow}
</table>

<!-- ═══════════════════════════════
     9. SCOPE OF WORK
     ═══════════════════════════════ -->
<table class="nb" style="margin-bottom:6px;">
  <tr class="sec"><td colspan="6">Scope of Work</td></tr>
  <tr>
    <th style="width:32px;">Sr No.</th>
    <th style="text-align:left;padding-left:6px;">Scope Item / Activity</th>
    <th style="width:72px;">Client Scope</th>
    <th style="width:72px;">Our Scope</th>
    <th style="text-align:left;padding-left:6px;">Notes</th>
    <th style="text-align:left;padding-left:6px;">Remarks</th>
  </tr>
  ${scopeRows}
</table>

<!-- ═══════════════════════════════
     10. WARRANTY DETAILS
     ═══════════════════════════════ -->
<table class="nb" style="margin-bottom:6px;">
  <tr class="sec"><td colspan="5">Warranty Details</td></tr>
  <tr>
    <th style="width:32px;">Sr No.</th>
    <th style="text-align:left;padding-left:6px;">Warranty Period</th>
    <th style="width:100px;">Type</th>
    <th style="width:88px;">Start Date</th>
    <th style="width:88px;">End Date</th>
  </tr>
  ${wtRows}
</table>

<!-- ═══════════════════════════════
     11. ACTIVITIES
     ═══════════════════════════════ -->
<table class="nb" style="margin-bottom:6px;">
  <tr class="sec"><td colspan="7">Activities</td></tr>
  <tr>
    <th style="width:32px;">Sr No.</th>
    <th style="text-align:left;padding-left:6px;">Activity Name</th>
    <th style="width:82px;">Start Date</th>
    <th style="width:82px;">End Date</th>
    <th style="width:65px;">Ref</th>
    <th style="width:78px;">Status</th>
    <th style="text-align:left;padding-left:6px;">Remarks</th>
  </tr>
  ${actRows}
</table>

<!-- ═══════════════════════════════
     12. ATTACHMENTS
     ═══════════════════════════════ -->
<table class="nb" style="margin-bottom:6px;">
  <tr class="sec"><td colspan="3">Attachments</td></tr>
  <tr>
    <th style="width:32px;">Sr No.</th>
    <th style="text-align:left;padding-left:6px;">Document Name</th>
    <th style="text-align:left;padding-left:6px;">Used For</th>
  </tr>
  ${attRows}
</table>

${(o.termsConditions||o.customerNotes)?`
<!-- ═══════════════════════════════
     13. TERMS & CONDITIONS
     ═══════════════════════════════ -->
<table class="nb" style="margin-bottom:6px;">
  <tr class="sec"><td>Terms &amp; Conditions</td></tr>
  ${o.termsConditions?`<tr><td style="white-space:pre-wrap;font-size:9pt;padding:6px;line-height:1.5;">${esc(o.termsConditions)}</td></tr>`:''}
  ${o.customerNotes?`<tr><td style="white-space:pre-wrap;font-size:9pt;padding:6px;background:#fffde7;line-height:1.5;">${esc(o.customerNotes)}</td></tr>`:''}
</table>`:''}

<!-- ═══════════════════════════════
     14. SIGNATURE BLOCK
     ═══════════════════════════════ -->
<table class="sig nb" style="margin-top:18px;">
  <tr>
    <td style="width:33.33%;text-align:center;height:70px;vertical-align:bottom;padding-bottom:5px;">
      <div style="border-top:1px solid #000;margin:0 16px;padding-top:5px;">
        <b>Prepared By</b><br/>
        <span style="font-size:9pt;">${vb(o.salesPerson)||'&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;'}</span>
      </div>
    </td>
    <td style="width:33.33%;text-align:center;height:70px;vertical-align:bottom;padding-bottom:5px;">
      <div style="border-top:1px solid #000;margin:0 16px;padding-top:5px;">
        <b>Checked By</b><br/>
        <span style="font-size:9pt;">&nbsp;</span>
      </div>
    </td>
    <td style="width:33.33%;text-align:center;height:70px;vertical-align:bottom;padding-bottom:5px;">
      <div style="border-top:1px solid #000;margin:0 16px;padding-top:5px;">
        <b>Authorised Signatory</b><br/>
        <span style="font-size:9pt;">For ${coName}</span>
      </div>
    </td>
  </tr>
</table>

<!-- FOOTER -->
<div class="footer">
  <span><b>${coName}</b></span>
  <span>SO: <b>${vb(o.orderNo||('#'+o.orderId))}</b> &nbsp;|&nbsp; ${vb(o.customerName||o.party)||'—'} &nbsp;|&nbsp; Total: <b>₹ ${r(grand)}</b></span>
  <span>Printed: ${new Date().toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'})}</span>
</div>

</div><!-- /page -->
</body>
</html>`;

  const win = window.open('', '_blank', 'width=900,height=950,scrollbars=yes');
  if (!win) { alert('Please allow pop-ups to print the Sales Order.'); return; }
  win.document.write(html);
  win.document.close();
  win.focus();
};
