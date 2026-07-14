/**
 * Delivery Challan & Packing List — print layout matching the reference image.
 */
export function printDeliveryChallan(dc, company = {}) {
  const fmtN = n => (parseFloat(n) || 0).toFixed(2);
  const fmtD = d => {
    if (!d) return '';
    const dt = new Date(d); if (isNaN(dt)) return d;
    return `${String(dt.getDate()).padStart(2,'0')}-${String(dt.getMonth()+1).padStart(2,'0')}-${dt.getFullYear()}`;
  };
  const val = v => v || '';

  const items   = dc.items   || [];
  const addons  = dc.addons  || [];
  const charges = dc.charges || [];

  const subTotal        = parseFloat(dc.subTotal) || 0;
  const additionalChgs  = charges.reduce((s, c) => s + (parseFloat(c.amount) || 0), 0);
  const totalGST        = parseFloat(dc.totalGST) || 0;
  const grandTotal      = parseFloat(dc.grandTotal) || subTotal + totalGST;

  const css = `
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
    .two-col { display: grid; grid-template-columns: 1fr 1fr; }
    .item-table { width: 100%; border-collapse: collapse; font-size: 9pt; }
    .item-table th { border: 1px solid #000; padding: 4px 5px; font-weight: bold; text-align: center; background: #fff; }
    .item-table td { border: 1px solid #000; padding: 3px 5px; vertical-align: middle; }
    .total-row { display: flex; justify-content: flex-end; }
    .total-table { border-collapse: collapse; min-width: 280px; }
    .total-table td { border: 1px solid #000; padding: 3px 8px; font-size: 9.5pt; }
    .bold { font-weight: bold; }
    .center { text-align: center; }
    .right { text-align: right; }
    @media print { @page { margin: 8mm; size: A4; } }
  `;

  const field = (lbl, v) => `
    <div class="field-row">
      <span class="field-lbl">${lbl}</span>
      <span class="field-colon">:</span>
      <span class="field-val">${val(v)}</span>
    </div>`;

  const itemRows = items.map((it, i) => {
    const qty    = parseFloat(it.qty) || 0;
    const rate   = parseFloat(it.rate) || 0;
    const taxable = qty * rate;
    return `
      <tr>
        <td class="center">${i + 1}</td>
        <td>${val(it.itemCode || it.hsnCode)}</td>
        <td>${val(it.itemName || it.description)}</td>
        <td>${val(it.description || '')}</td>
        <td class="center">${val(it.hsnCode)}</td>
        <td class="right">${qty}</td>
        <td class="center">${val(it.unit || 'NOS')}</td>
        <td class="right">${fmtN(rate)}</td>
        <td class="right">${fmtN(taxable)}</td>
      </tr>`;
  }).join('');

  const emptyItemRows = items.length === 0 ? `
    <tr><td colspan="9" style="padding:20px; text-align:center; color:#666;">No items</td></tr>` : '';

  const addonRows = addons.map((a, i) => `
    <tr>
      <td class="center">${i + 1}</td>
      <td>${val(a.itemCode)}</td>
      <td>${val(a.itemName || a.description)}</td>
      <td>${val(a.description || '')}</td>
      <td class="center">${val(a.hsnCode)}</td>
      <td class="right">${val(a.qty)}</td>
      <td class="center">${val(a.unit || 'NOS')}</td>
      <td>${val(a.category)}</td>
      <td class="right">${val(a.includedPrice || '')}</td>
      <td>${val(a.remarks)}</td>
    </tr>`).join('');

  const emptyAddonRows = addons.length === 0 ? `
    <tr><td colspan="10" style="padding:14px; text-align:center; color:#666;">No add-on items</td></tr>` : '';

  const attachments = (dc.attachments || dc.documents || []);
  const attachHtml = attachments.length === 0
    ? '<div style="padding:10px 6px; color:#666;">No attachments</div>'
    : attachments.map(a => `<div style="padding:2px 0; font-size:9.5pt;">📎 ${a.name || a.fileName}</div>`).join('');

  const logoHtml = company.logoBase64
    ? `<img src="${company.logoBase64}" style="max-height:50px; max-width:140px; object-fit:contain;"/>`
    : `<span style="font-size:13pt; font-weight:bold; color:#104f4f;">${company.companyName || ''}</span>`;

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>Delivery Challan — ${val(dc.dcNo)}</title>
  <style>${css}</style>
</head>
<body>
<table class="outer" style="margin-bottom:0;">

  <!-- Company Header -->
  <tr>
    <td colspan="2" style="padding:8px 10px; border-bottom:2px solid #000;">
      <div style="display:flex; align-items:center; gap:12px;">
        ${logoHtml}
        <div>
          <div style="font-size:13pt; font-weight:bold;">${company.companyName || ''}</div>
          <div style="font-size:8.5pt; color:#333;">${company.address || ''}</div>
          <div style="font-size:8.5pt; color:#333;">GSTIN: ${company.gstin || ''} &nbsp;|&nbsp; PAN: ${company.pan || ''}</div>
        </div>
      </div>
    </td>
  </tr>

  <!-- Title -->
  <tr><td colspan="2" style="text-align:center; font-size:13pt; font-weight:bold; padding:6px; border-bottom:2px solid #000;">Delivery Challan &amp; Packing List</td></tr>

  <!-- Dispatch Details header -->
  <tr><td colspan="2" style="padding:3px 6px;"><span class="col-hdr">Dispatch Details</span></td></tr>

  <!-- Dispatch Details body -->
  <tr>
    <td style="width:50%;">
      ${field('DC No.', dc.dcNo)}
      ${field('Date', fmtD(dc.dcDate))}
      ${field('Dispatch Through', dc.dispatchThrough)}
    </td>
    <td style="width:50%;">
      ${field('Invoice No', dc.invoiceNo)}
      ${field('Date', fmtD(dc.invoiceDate))}
      ${field('Vehicle no./T-ID', dc.vehicleNo)}
    </td>
  </tr>

  <!-- Sales Order Details header -->
  <tr><td colspan="2" class="section-hdr" style="border-top:1.5px solid #000; border-bottom:1px solid #000;">Sales Order Details</td></tr>

  <!-- Client Details + Tax Identity headers -->
  <tr>
    <td><span class="col-hdr">Client Details</span></td>
    <td><span class="col-hdr">Tax Identity</span></td>
  </tr>

  <!-- Client + Tax fields -->
  <tr>
    <td>
      ${field('Client ID', dc.clientId)}
      ${field('Client Name', dc.clientName)}
      ${field('Business Type', dc.businessType)}
      ${field('Industries Type', dc.industriesType)}
      ${field('Category', dc.category)}
      ${field('TDS Applicable', dc.tdsApplicable)}
    </td>
    <td>
      ${field('Pan No', dc.panNo)}
      ${field('GSTIN No', dc.clientGstin)}
      ${field('CIN No', dc.cinNo)}
      ${field('MSME if Applicable', dc.msme)}
      ${field('GST Type', dc.gstType)}
      ${field('GST Registered', dc.gstRegistered)}
    </td>
  </tr>

  <!-- Order Description header -->
  <tr><td colspan="2" class="section-hdr" style="border-top:1.5px solid #000; border-bottom:1px solid #000;">Order Description</td></tr>

  <!-- Order Description fields -->
  <tr>
    <td>
      ${field('ERP No', dc.erpNo)}
      ${field('Order No', dc.orderNo)}
      ${field('Order Date', fmtD(dc.orderDate))}
      ${field('Order Type', dc.orderType)}
    </td>
    <td>
      ${field('Client PO Date', fmtD(dc.clientPoDate))}
      ${field('Client Order No', dc.clientOrderNo)}
      ${field('Delivery Due Date', fmtD(dc.deliveryDueDate))}
      ${field('Payment Terms', dc.paymentTerms)}
    </td>
  </tr>

  <!-- Contact header -->
  <tr><td colspan="2" class="section-hdr" style="border-top:1.5px solid #000; border-bottom:1px solid #000;">Contact</td></tr>
  <tr>
    <td><span class="col-hdr">Billing</span></td>
    <td><span class="col-hdr">Shipping</span></td>
  </tr>
  <tr>
    <td>
      ${field('Name', dc.billingName)}
      ${field('Mobile No', dc.billingMobile)}
      ${field('Alternate No', dc.billingAlternate)}
      ${field('Email id', dc.billingEmail)}
    </td>
    <td>
      ${field('Name', dc.shippingName)}
      ${field('Mobile No', dc.shippingMobile)}
      ${field('Alternate No', dc.shippingAlternate)}
      ${field('Email id', dc.shippingEmail)}
    </td>
  </tr>

  <!-- Address header -->
  <tr><td colspan="2" class="section-hdr" style="border-top:1.5px solid #000; border-bottom:1px solid #000;">Address</td></tr>
  <tr>
    <td><span class="col-hdr">Billing</span></td>
    <td><span class="col-hdr">Shipping</span></td>
  </tr>
  <tr>
    <td>
      ${field('Address', dc.billingAddress)}
      ${field('City', dc.billingCity)}
      ${field('State', dc.billingState)}
      ${field('Pincode', dc.billingPincode)}
    </td>
    <td>
      ${field('Address', dc.shippingAddress)}
      ${field('City', dc.shippingCity)}
      ${field('State', dc.shippingState)}
      ${field('Pincode', dc.shippingPincode)}
    </td>
  </tr>

  <!-- Item Description header -->
  <tr><td colspan="2" class="section-hdr" style="border-top:1.5px solid #000; border-bottom:1px solid #000;">Item Description</td></tr>

  <!-- Items table -->
  <tr>
    <td colspan="2" style="padding:0;">
      <table class="item-table">
        <thead>
          <tr>
            <th style="width:35px;">Sr No.</th>
            <th style="width:80px;">ITEM code</th>
            <th>Item Name</th>
            <th>Additional Description</th>
            <th style="width:80px;">HSN Code</th>
            <th style="width:45px;">Qty</th>
            <th style="width:50px;">UoM</th>
            <th style="width:80px;">Rate</th>
            <th style="width:90px;">Taxable</th>
          </tr>
        </thead>
        <tbody>
          ${itemRows}${emptyItemRows}
          <tr style="height:40px;"><td colspan="9"></td></tr>
        </tbody>
        <tfoot>
          <tr>
            <td colspan="7" style="border:none;"></td>
            <td class="bold" style="text-align:right; padding:3px 8px;">Total Taxable</td>
            <td class="bold right">${fmtN(subTotal)}</td>
          </tr>
          <tr>
            <td colspan="7" style="border:none;"></td>
            <td class="bold" style="text-align:right; padding:3px 8px;">All Additional Charges</td>
            <td class="bold right">${fmtN(additionalChgs)}</td>
          </tr>
          <tr>
            <td colspan="7" style="border:none;"></td>
            <td class="bold" style="text-align:right; padding:3px 8px;">GST</td>
            <td class="bold right">${fmtN(totalGST)}</td>
          </tr>
          <tr>
            <td colspan="7" style="border:none;"></td>
            <td class="bold" style="text-align:right; padding:3px 8px; border-top:1.5px solid #000;">Total Order Value</td>
            <td class="bold right" style="border-top:1.5px solid #000;">${fmtN(grandTotal)}</td>
          </tr>
        </tfoot>
      </table>
    </td>
  </tr>

  <!-- Add On Item header -->
  <tr><td colspan="2" class="section-hdr" style="border-top:2px solid #000; border-bottom:1px solid #000;">Add On Item</td></tr>

  <!-- Add On table -->
  <tr>
    <td colspan="2" style="padding:0;">
      <table class="item-table">
        <thead>
          <tr>
            <th style="width:35px;">Sr No.</th>
            <th style="width:80px;">ITEM code</th>
            <th>Item Name</th>
            <th>Additional Description</th>
            <th style="width:80px;">HSN Code</th>
            <th style="width:45px;">Qty</th>
            <th style="width:60px;">UoM</th>
            <th style="width:70px;">Category</th>
            <th style="width:90px;">Included Price</th>
            <th>Remarks</th>
          </tr>
        </thead>
        <tbody>
          ${addonRows}${emptyAddonRows}
          <tr style="height:40px;"><td colspan="10"></td></tr>
        </tbody>
      </table>
    </td>
  </tr>

  <!-- All Attachments header -->
  <tr><td colspan="2" class="section-hdr" style="border-top:2px solid #000; border-bottom:1px solid #000;">All Attachment</td></tr>
  <tr>
    <td colspan="2" style="padding:8px 10px; min-height:60px;">
      ${attachHtml}
    </td>
  </tr>

  <!-- Signature row -->
  <tr style="border-top:2px solid #000;">
    <td style="padding:30px 10px 10px; text-align:center; font-size:9pt;">
      <div style="border-top:1px solid #000; padding-top:4px; display:inline-block; min-width:150px;">Authorised Signatory</div>
    </td>
    <td style="padding:30px 10px 10px; text-align:center; font-size:9pt;">
      <div style="border-top:1px solid #000; padding-top:4px; display:inline-block; min-width:150px;">Receiver's Signature</div>
    </td>
  </tr>

</table>

<script>
  window.onload = () => { window.print(); };
</script>
</body>
</html>`;

  const win = window.open('', '_blank', 'width=900,height=700');
  win.document.write(html);
  win.document.close();
}
