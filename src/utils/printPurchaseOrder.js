/* ── Purchase Order Print — Epsilon Enterprise Format ── */

const isImage = (f) => /\.(jpg|jpeg|png|gif|bmp|webp)$/i.test(f || '');
const isPdf   = (f) => /\.pdf$/i.test(f || '');

const fetchBase64 = async (orderId, fileName, companyId) => {
  try {
    const qs   = companyId ? `?companyId=${encodeURIComponent(companyId)}` : '';
    const res  = await fetch(`/api/purchase-orders/${orderId}/download/${encodeURIComponent(fileName)}${qs}`);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve({ base64: reader.result, mimeType: blob.type });
      reader.readAsDataURL(blob);
    });
  } catch { return null; }
};

/* ── Number to Indian Words ── */
const ones = ['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine',
               'Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen',
               'Seventeen','Eighteen','Nineteen'];
const tens  = ['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];

function numToWords(n) {
  n = Math.round(n);
  if (n === 0) return 'Zero';
  const crore  = Math.floor(n / 10000000); n %= 10000000;
  const lakh   = Math.floor(n / 100000);   n %= 100000;
  const thou   = Math.floor(n / 1000);     n %= 1000;
  const hund   = Math.floor(n / 100);      n %= 100;
  const ten    = Math.floor(n / 10);
  const one    = n % 10;
  let w = '';
  if (crore)         w += numToWords(crore) + ' Crore ';
  if (lakh)          w += numToWords(lakh)  + ' Lakh ';
  if (thou)          w += numToWords(thou)  + ' Thousand ';
  if (hund)          w += ones[hund]        + ' Hundred ';
  if (n > 0 && n < 20) w += ones[n]         + ' ';
  else if (ten)      { w += tens[ten] + ' '; if (one) w += ones[one] + ' '; }
  return w.trim();
}

function amountInWords(amount) {
  const total = Math.round(amount * 100);
  const rupees = Math.floor(total / 100);
  const paise  = total % 100;
  let w = 'INR ' + numToWords(rupees);
  if (paise) w += ' and ' + numToWords(paise) + ' Paise';
  w += ' Only';
  return w;
}

/* ── Format voucher number ── */
function voucherNo(order) {
  const now = new Date();
  const yr1 = now.getFullYear() % 100;
  const yr2 = (yr1 + 1) % 100;
  const fy  = `${String(yr1).padStart(2,'0')}-${String(yr2).padStart(2,'0')}`;
  const seq = order.orderId ? String(order.orderId).slice(-3).padStart(3, '0') : '001';
  return `EPROP/PO/${fy}/${seq}`;
}

/* ── Company info (fallback) ── */
const DEFAULT_COMPANY = {
  name:    'EPSILON ENTERPRISE',
  address: '058, Gujarat Housing Board\nChandkhed, Ahmedabad\n382424',
  gstin:   '24BEZPS9549Q1ZW',
  state:   'Gujarat, Code : 24',
  email:   'finacc@epsilonprefab.org',
};

export const printPurchaseOrder = async (order, companyData) => {
  const COMPANY = companyData ? {
    name:    companyData.companyName || DEFAULT_COMPANY.name,
    address: [companyData.address, companyData.city, companyData.state, companyData.pincode].filter(Boolean).join('\n') || DEFAULT_COMPANY.address,
    gstin:   companyData.gstin || DEFAULT_COMPANY.gstin,
    state:   companyData.state ? `${companyData.state}, Code : 24` : DEFAULT_COMPANY.state,
    email:   companyData.email || DEFAULT_COMPANY.email,
  } : DEFAULT_COMPANY;
  // support both new (attachments) and old (documents) field names
  const allDocs = order.attachments || order.documents || [];
  const docsWithData = await Promise.all(
    allDocs.map(async (doc) => {
      if (doc.fileName && order.orderId) {
        const data = await fetchBase64(order.orderId, doc.fileName, order.companyId);
        return { ...doc, ...data };
      }
      return doc;
    })
  );

  const items = order.items || [];
  const vNo   = voucherNo(order);
  // support both new (poDate) and old (orderDate / date) field names
  const rawDate = order.poDate || order.orderDate || order.date;
  const dated = rawDate
    ? new Date(rawDate).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'2-digit' })
    : new Date().toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'2-digit' });

  /* ── Compute totals — support both qty/quantity and itemName/description ── */
  let subTotal = 0, totalCgst = 0, totalSgst = 0;
  const itemRows = items.map((item, i) => {
    const qty    = parseFloat(item.qty || item.quantity) || 0;
    const rate   = parseFloat(item.rate) || 0;
    const gstPct = parseFloat(item.gstPercent) || 0;
    // apply discount
    const base   = qty * rate;
    const disc   = item.discountType === '%'
      ? base * (parseFloat(item.discount) || 0) / 100
      : (parseFloat(item.discount) || 0);
    const taxable = base - disc;
    const cgst   = taxable * (gstPct / 2) / 100;
    const sgst   = taxable * (gstPct / 2) / 100;
    subTotal  += taxable;
    totalCgst += cgst;
    totalSgst += sgst;
    const dueOn = item.dueDate
      ? new Date(item.dueDate).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'2-digit'})
      : (order.deliveryDate || order.gen?.deliveryDate
          ? new Date(order.deliveryDate || order.gen?.deliveryDate).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'2-digit'})
          : '—');
    // item name: prefer itemName, fall back to description
    const itemLabel = (item.itemName || item.description || '—')
      + (item.description && item.itemName && item.description !== item.itemName
          ? `<br/><span style="font-size:9pt;color:#555">${item.description}</span>` : '');
    // HSN code
    const hsnLabel = item.hsnCode ? `<br/><span style="font-size:9pt;color:#555">HSN: ${item.hsnCode}</span>` : '';
    return `
      <tr>
        <td class="c">${i + 1}</td>
        <td>${itemLabel}${hsnLabel}</td>
        <td class="c">${dueOn}</td>
        <td class="c">${qty}<br/><span style="font-size:9pt">${item.unit || 'NOS'}</span></td>
        <td class="r">${rate.toLocaleString('en-IN',{minimumFractionDigits:2})}</td>
        <td class="c">${item.unit || 'NOS'}</td>
        <td class="c">${item.discount ? (item.discount + (item.discountType || '%')) : ''}</td>
        <td class="r">${taxable.toLocaleString('en-IN',{minimumFractionDigits:2})}</td>
      </tr>`;
  }).join('');

  const gstTotal   = totalCgst + totalSgst;
  const freight    = parseFloat(order.freightCharges)  || 0;
  const packing    = parseFloat(order.packingCharges)  || 0;
  const roundOff   = parseFloat(order.roundOff)        || 0;
  const overallDisc = subTotal * (parseFloat(order.overallDiscount) || 0) / 100;
  const grandTotal = parseFloat(order.grandTotal) ||
    (subTotal + gstTotal - overallDisc + freight + packing + roundOff);
  const totalQty  = items.reduce((s,it) => s + (parseFloat(it.qty || it.quantity)||0), 0);
  const totalUnit = items.length === 1 ? (items[0].unit || 'NOS') : 'NOS';

  // attachment list (shown even without base64 — names only)
  const attachmentListHtml = docsWithData.length > 0 ? `
    <div style="margin-top:12px;border:1px solid #000;padding:6px 10px">
      <div style="font-weight:bold;font-size:9.5pt;margin-bottom:4px">Attachments (${docsWithData.length})</div>
      ${docsWithData.map((d, i) => `<div style="font-size:9pt">📎 ${i+1}. ${d.name || d.fileName || 'File ' + (i+1)}</div>`).join('')}
    </div>` : '';

  // PDFs rendered to canvas via pdf.js (canvas prints; <embed> does not)
  const attachmentBlocks = docsWithData.filter(d => d.base64).map((d, i) => {
    const title = `<div class="att-title">Attachment ${i+1} — ${d.name || d.fileName}</div>`;
    if (isImage(d.fileName)) return `<div class="att-block">${title}<div class="att-body"><img src="${d.base64}" alt="" style="max-width:100%"/></div></div>`;
    if (isPdf(d.fileName))   return `<div class="att-block">${title}<div class="att-body att-pdf" data-pdf-b64="${d.base64}" style="min-height:80px"><p style="padding:16px;color:#666;font-style:italic">Loading PDF pages…</p></div></div>`;
    return `<div class="att-block">${title}<div class="att-body att-nopreview">File: ${d.fileName} (no preview available)</div></div>`;
  }).join('');

  const html = `<!DOCTYPE html><html><head>
  <title>Purchase Order — ${vNo}</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:'Times New Roman',Times,serif;font-size:11pt;color:#000;background:#fff}
    .page{padding:12mm 14mm;max-width:210mm;margin:0 auto}
    h1.po-title{text-align:center;font-size:16pt;font-weight:bold;letter-spacing:2px;margin-bottom:8px;text-decoration:underline}

    /* ── outer border ── */
    .po-wrap{border:1.5px solid #000}

    /* ── top two-col ── */
    .top-row{display:flex;border-bottom:1px solid #000}
    .top-left{flex:0 0 52%;border-right:1px solid #000;padding:7px 9px}
    .top-right{flex:1;padding:0}
    .inv-label{font-size:9pt;color:#444}
    .co-name{font-size:12pt;font-weight:bold;margin:2px 0}
    .co-addr{font-size:9.5pt;line-height:1.4}
    .gstin-row{font-size:9pt;margin-top:3px}

    /* right meta grid */
    .meta-table{width:100%;border-collapse:collapse}
    .meta-table td{border-bottom:1px solid #ccc;border-left:none;padding:4px 8px;font-size:9.5pt;vertical-align:top}
    .meta-table td.ml{font-size:9pt;color:#333;width:52%}
    .meta-table td.mv{font-weight:bold}
    .meta-table tr:last-child td{border-bottom:none}

    /* consignee / supplier row */
    .cs-row{display:flex;border-bottom:1px solid #000}
    .cs-box{flex:1;padding:7px 9px}
    .cs-box:first-child{border-right:1px solid #000}
    .cs-label{font-size:9pt;color:#444;margin-bottom:2px}
    .cs-name{font-size:11pt;font-weight:bold;margin-bottom:2px}
    .cs-addr{font-size:9.5pt;line-height:1.45}

    /* items table */
    table.items{width:100%;border-collapse:collapse}
    table.items th{border:1px solid #000;padding:5px 6px;font-size:9.5pt;text-align:center;background:#f5f5f5;font-weight:bold}
    table.items td{border:1px solid #000;padding:4px 6px;font-size:10pt;vertical-align:top}
    table.items td.c{text-align:center}
    table.items td.r{text-align:right}
    tr.gst-row td{font-style:italic;font-weight:bold;border-top:none;border-bottom:none;padding:3px 6px}
    tr.total-row td{font-weight:bold;border-top:2px solid #000;padding:5px 6px;font-size:10.5pt}
    tr.total-row td.r{text-align:right}

    /* footer */
    .footer-row{display:flex;border-top:1px solid #000}
    .footer-left{flex:1;padding:8px 9px;border-right:1px solid #000}
    .footer-right{flex:0 0 44%;padding:8px 9px}
    .amount-words{font-size:10pt;font-weight:bold;margin-top:3px}
    .declaration{font-size:8.5pt;line-height:1.5;margin-top:8px;color:#222}
    .sign-box{text-align:right;padding:6px 9px;border-top:1px solid #000}
    .for-co{font-size:10pt;font-weight:bold;margin-bottom:30px}
    .auth-sig{font-size:9.5pt;border-top:1px solid #000;display:inline-block;padding-top:3px;margin-top:4px}
    .bottom-note{text-align:center;border-top:1px solid #000;padding:5px;font-size:9pt}

    /* attachments */
    .att-block{border:1px solid #000;margin-bottom:16px;page-break-inside:avoid;margin-top:16px}
    .att-title{background:#333;color:#fff;padding:4px 10px;font-size:9.5pt;font-weight:bold}
    .att-body{padding:8px}
    .att-body img{max-width:100%;display:block;border:1px solid #ccc}
    .att-pdf{padding:0}
    .att-nopreview{font-style:italic;color:#666;padding:12px}

    @media print{
      @page{margin:8mm;size:A4 portrait}
      .page{padding:0}
      .att-block{page-break-inside:avoid}
    }
  </style></head><body><div class="page">

  <h1 class="po-title">PURCHASE ORDER</h1>

  <div class="po-wrap">

    <!-- TOP ROW: Invoice To + Meta -->
    <div class="top-row">
      <div class="top-left">
        <div class="inv-label">Invoice To</div>
        <div class="co-name">${COMPANY.name}</div>
        <div class="co-addr">${COMPANY.address.replace(/\n/g,'<br/>')}</div>
        <div class="gstin-row"><b>GSTIN/UIN:</b> ${COMPANY.gstin}</div>
        <div class="gstin-row"><b>State Name :</b> ${COMPANY.state}</div>
        <div class="gstin-row"><b>E-Mail :</b> ${COMPANY.email}</div>
      </div>
      <div class="top-right">
        <table class="meta-table">
          <tr><td class="ml">Voucher No.</td><td class="mv">${vNo}</td></tr>
          <tr><td class="ml">Dated</td><td class="mv">${dated}</td></tr>
          <tr><td class="ml">Mode/Terms of Payment</td><td class="mv">${order.paymentTerms || 'ONLINE'}</td></tr>
          <tr><td class="ml">Reference No. &amp; Date.</td><td class="mv">${order.vendorRef || order.enquiryRef || vNo}</td></tr>
          <tr><td class="ml">Dispatched through</td><td class="mv">${order.dispatchMode || order.dispatchedThrough || 'BY ROAD'}</td></tr>
          <tr><td class="ml">Other References</td><td class="mv">${order.linkedSalesOrderId ? 'SO #' + order.linkedSalesOrderId : (order.quotationRef || '—')}</td></tr>
          <tr><td class="ml">Destination</td><td class="mv">${order.shippingAddr || order.destination || order.deliveryAddr || order.deliveryAddress || '—'}</td></tr>
          <tr><td class="ml">Terms of Delivery</td><td class="mv">${order.incoterms || order.billingTerms || order.termsOfDelivery || '—'}</td></tr>
          <tr><td class="ml">Purchase Person</td><td class="mv">${order.purchasePerson || '—'}</td></tr>
        </table>
      </div>
    </div>

    <!-- CONSIGNEE / SUPPLIER ROW -->
    <div class="cs-row">
      <div class="cs-box">
        <div class="cs-label">Consignee (Ship to)</div>
        <div class="cs-name">${COMPANY.name}</div>
        <div class="cs-addr">${COMPANY.address.replace(/\n/g,'<br/>')}</div>
        <div class="gstin-row"><b>GSTIN/UIN &nbsp;:</b> ${COMPANY.gstin}</div>
        <div class="gstin-row"><b>State Name &nbsp;:</b> ${COMPANY.state}</div>
      </div>
      <div class="cs-box">
        <div class="cs-label">Supplier (Bill from)</div>
        <div class="cs-name">${order.vendorName || '—'}</div>
        <div class="cs-addr">${(order.deliveryAddr || order.vendorAddress || '').replace(/\n/g,'<br/>') || '&nbsp;'}</div>
        ${order.vendorGstin ? `<div class="gstin-row"><b>GSTIN/UIN &nbsp;:</b> ${order.vendorGstin}</div>` : ''}
        ${order.vendorState ? `<div class="gstin-row"><b>State Name &nbsp;:</b> ${order.vendorState}</div>` : ''}
        ${order.contactPerson ? `<div class="gstin-row"><b>Contact &nbsp;:</b> ${order.contactPerson}${order.mobile ? ' | ' + order.mobile : ''}</div>` : ''}
      </div>
    </div>

    <!-- ITEMS TABLE -->
    <table class="items">
      <thead>
        <tr>
          <th style="width:4%">Sl<br/>No.</th>
          <th style="width:34%">Description of Goods</th>
          <th style="width:9%">Due on</th>
          <th style="width:9%">Quantity</th>
          <th style="width:10%">Rate</th>
          <th style="width:6%">per</th>
          <th style="width:7%">Disc. %</th>
          <th style="width:11%">Amount</th>
        </tr>
      </thead>
      <tbody>
        ${itemRows}
        <!-- blank filler rows for short POs -->
        ${items.length < 6 ? Array(6 - items.length).fill('<tr><td style="height:22px">&nbsp;</td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>').join('') : ''}
        <!-- CGST / SGST -->
        ${totalCgst > 0 ? `<tr class="gst-row"><td></td><td colspan="6" style="text-align:right;font-style:italic;font-weight:bold">CGST</td><td class="r">${totalCgst.toLocaleString('en-IN',{minimumFractionDigits:2})}</td></tr>` : ''}
        ${totalSgst > 0 ? `<tr class="gst-row"><td></td><td colspan="6" style="text-align:right;font-style:italic;font-weight:bold">SGST</td><td class="r">${totalSgst.toLocaleString('en-IN',{minimumFractionDigits:2})}</td></tr>` : ''}
        ${freight > 0   ? `<tr class="gst-row"><td></td><td colspan="6" style="text-align:right">Freight Charges</td><td class="r">${freight.toLocaleString('en-IN',{minimumFractionDigits:2})}</td></tr>` : ''}
        ${packing > 0   ? `<tr class="gst-row"><td></td><td colspan="6" style="text-align:right">Packing Charges</td><td class="r">${packing.toLocaleString('en-IN',{minimumFractionDigits:2})}</td></tr>` : ''}
        ${overallDisc > 0 ? `<tr class="gst-row"><td></td><td colspan="6" style="text-align:right">Overall Discount</td><td class="r">- ${overallDisc.toLocaleString('en-IN',{minimumFractionDigits:2})}</td></tr>` : ''}
        ${roundOff !== 0 ? `<tr class="gst-row"><td></td><td colspan="6" style="text-align:right">Round Off</td><td class="r">${roundOff.toLocaleString('en-IN',{minimumFractionDigits:2})}</td></tr>` : ''}
        <!-- TOTAL ROW -->
        <tr class="total-row">
          <td class="c">Total</td>
          <td></td>
          <td></td>
          <td class="c">${totalQty} ${totalUnit}</td>
          <td></td><td></td><td></td>
          <td class="r">&#8377; ${grandTotal.toLocaleString('en-IN',{minimumFractionDigits:2})}</td>
        </tr>
      </tbody>
    </table>

    <!-- FOOTER -->
    <div class="footer-row">
      <div class="footer-left">
        <div style="font-size:9.5pt">Amount Chargeable (in words)</div>
        <div class="amount-words">${amountInWords(grandTotal)}</div>
        <div style="text-align:right;font-size:9pt;margin-top:2px;font-style:italic">E. &amp; O.E</div>
      </div>
      <div class="footer-right" style="border-left:1px solid #000">
        &nbsp;
      </div>
    </div>

    <!-- DECLARATION + SIGNATURE -->
    <div class="footer-row" style="align-items:flex-start">
      <div class="footer-left">
        <div class="declaration">
          <b>Declaration</b><br/>
          1. Please mentioned PO Number in each Invoice.<br/>
          2. Please make sure to do proper quality Check &amp; inspection of supplied item before dispatch.<br/>
          3. If the supplier does not respond in 3 days about change in PO. The PO shall be deemed as accepted &amp; enforced.
        </div>
      </div>
      <div class="footer-right" style="border-left:1px solid #000;text-align:right;padding:8px 12px">
        <div class="for-co">for ${COMPANY.name}</div>
        <div class="auth-sig">Authorised Signatory</div>
      </div>
    </div>

    ${attachmentListHtml}

    <div class="bottom-note">
      SUBJECT TO AHMEDABAD JURISDICTION<br/>
      <span style="font-size:8.5pt">This is a Computer Generated Document</span>
    </div>
  </div>

  ${attachmentBlocks ? `<div style="margin-top:20px">${attachmentBlocks}</div>` : ''}

</div>
<script src="https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.min.js"></script>
<script>
(async function() {
  var divs = document.querySelectorAll('.att-pdf[data-pdf-b64]');
  if (!divs.length) { setTimeout(function(){ window.print(); }, 900); return; }

  if (typeof pdfjsLib === 'undefined') { setTimeout(function(){ window.print(); }, 900); return; }
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js';

  for (var i = 0; i < divs.length; i++) {
    var div = divs[i];
    var b64 = div.getAttribute('data-pdf-b64');
    try {
      var raw = atob(b64.split(',')[1]);
      var bytes = new Uint8Array(raw.length);
      for (var j = 0; j < raw.length; j++) bytes[j] = raw.charCodeAt(j);
      var pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
      div.innerHTML = '';
      for (var p = 1; p <= pdf.numPages; p++) {
        var page = await pdf.getPage(p);
        var vp = page.getViewport({ scale: 1.5 });
        var canvas = document.createElement('canvas');
        canvas.width = vp.width; canvas.height = vp.height;
        canvas.style.cssText = 'width:100%;display:block;margin-bottom:6px;page-break-after:auto';
        await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
        div.appendChild(canvas);
      }
    } catch(e) {
      div.innerHTML = '<p style="color:red;padding:12px">Could not render: ' + e.message + '</p>';
    }
  }
  setTimeout(function(){ window.print(); }, 600);
})();
</script>
</body></html>`;

  const blob = new Blob([html], { type: 'text/html' });
  const url  = URL.createObjectURL(blob);
  window.open(url, '_blank', 'width=900,height=850');
  // blob URL is revoked by browser on tab close; no manual cleanup needed
};
