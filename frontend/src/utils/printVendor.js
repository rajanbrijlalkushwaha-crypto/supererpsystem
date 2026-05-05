/* Fetch a URL and return a base64 data URI */
const fetchBase64 = async (url) => {
  try {
    const res  = await fetch(url);
    const blob = await res.blob();
    return await new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(blob);
    });
  } catch { return null; }
};

const dash = (val) => val || '';

export const printVendorDetails = async (vendor, company) => {
  /* ── Fetch logo as base64 if available ── */
  let logoBase64 = null;
  if (company?.logoFileName) {
    logoBase64 = await fetchBase64(`/api/companies/logo/${encodeURIComponent(company.logoFileName)}?companyId=${company.companyId||''}`);
  }

  const contact  = (vendor.contactPersons || [])[0] || {};
  const today    = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' });
  const payModes = Array.isArray(vendor.paymentModes) ? vendor.paymentModes.join(', ') : (vendor.paymentModes || '');

  /* ── Company header block ── */
  const logoTag = logoBase64
    ? `<img src="${logoBase64}" alt="Logo" style="height:64px;max-width:120px;object-fit:contain;" />`
    : `<div style="width:64px;height:64px;border:1px solid #ccc;display:flex;align-items:center;justify-content:center;font-size:9pt;color:#999;">No Logo</div>`;

  const coAddr = [company?.address, company?.city, company?.state, company?.pincode].filter(Boolean).join(', ');

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Vendor Details — ${dash(vendor.vendorName)}</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 10pt; color: #000; background: #fff; }

    .page { padding: 12mm 14mm; }

    /* ── Company header ── */
    .co-header {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 16px;
      padding: 10px 14px;
      margin-bottom: 10px;
      text-align: center;
    }
    .co-info { text-align: center; }
    .co-name { font-size: 16pt; font-weight: bold; line-height: 1.2; }
    .co-sub  { font-size: 9pt; color: #333; margin-top: 3px; line-height: 1.6; }

    /* ── Section heading ── */
    .sec-head {
      font-size: 10pt;
      font-weight: bold;
      text-decoration: underline;
      margin: 8px 0 4px;
    }

    /* ── Form table ── */
    table.form { width: 100%; border-collapse: collapse; }
    table.form td { padding: 3px 0; font-size: 10pt; vertical-align: top; }
    table.form td.lbl { font-weight: normal; width: 130px; white-space: nowrap; }
    table.form td.sep { width: 10px; text-align: center; }
    table.form td.val { min-width: 80px; }
    table.form td.sign { border-bottom: 1px solid #000; min-width: 160px; }

    /* ── Two-col wrapper ── */
    .two-col { display: flex; gap: 14px; }
    .two-col > div { flex: 1; }

    /* ── Divider ── */
    .hr { border: none; border-top: 1px solid #000; margin: 8px 0; }

    @media print {
      @page { margin: 0; size: A4 portrait; }
      .page { padding: 10mm 14mm 24mm 14mm; }
    }
  </style>
</head>
<body>
<div class="page">

  <!-- ══ COMPANY HEADER ══ -->
  <div class="co-header">
    ${logoTag}
    <div class="co-info">
      <div class="co-name">${dash(company?.companyName || 'Epsilon Enterprise')}</div>
      <div class="co-sub">
        ${coAddr ? coAddr + '<br>' : ''}
        ${company?.gstin  ? 'GSTIN: ' + company.gstin + '&nbsp;&nbsp;' : ''}
        ${company?.phone  ? 'Ph: '   + company.phone  + '&nbsp;&nbsp;' : ''}
        ${company?.email  ? 'Email: '+ company.email               : ''}
        <br><span style="color:#888;font-size:8pt">Printed: ${today}</span>
      </div>
    </div>
  </div>

  <!-- ══ ROW 1: Vendor Details + Tax Identity ══ -->
  <div class="two-col">

    <!-- Vendor Details -->
    <div>
      <div class="sec-head">Vendor Details</div>
      <table class="form">
        <tr><td class="lbl">Vendor ID</td><td class="sep">:</td><td class="val">${dash(vendor.vendorId)}</td></tr>
        <tr><td class="lbl">Vendor Name</td><td class="sep">:</td><td class="val">${dash(vendor.vendorName)}</td></tr>
        <tr><td class="lbl">Business Type</td><td class="sep">:</td><td class="val">${dash(vendor.businessType)}</td></tr>
        <tr><td class="lbl">Industry Type</td><td class="sep">:</td><td class="val">${dash(vendor.industryType)}</td></tr>
        <tr><td class="lbl">Category</td><td class="sep">:</td><td class="val">${dash(vendor.category)}</td></tr>
        <tr><td class="lbl">TDS Applicable</td><td class="sep">:</td><td class="val">${vendor.tdsApplicable ? 'Yes' : 'No'}</td></tr>
      </table>
    </div>

    <!-- Tax Identity -->
    <div>
      <div class="sec-head">Tax Identity</div>
      <table class="form">
        <tr><td class="lbl">Pan No</td><td class="sep">:</td><td class="val">${dash(vendor.pan)}</td></tr>
        <tr><td class="lbl">GSTIN No</td><td class="sep">:</td><td class="val">${dash(vendor.gstin)}</td></tr>
        <tr><td class="lbl">CIN No</td><td class="sep">:</td><td class="val">${dash(vendor.cin)}</td></tr>
        <tr><td class="lbl">MSME if Applicable</td><td class="sep">:</td><td class="val">${dash(vendor.msme)}</td></tr>
        <tr><td class="lbl">GST Type</td><td class="sep">:</td><td class="val">${dash(vendor.gstType)}</td></tr>
        <tr><td class="lbl">GST Registered</td><td class="sep">:</td><td class="val">${vendor.gstRegistered !== false ? 'Yes' : 'No'}</td></tr>
      </table>
    </div>

  </div>

  <hr class="hr">

  <!-- ══ Contact Details ══ -->
  <div class="sec-head">Contact Details:</div>
  <div class="two-col">
    <div>
      <table class="form">
        <tr><td class="lbl">Name</td><td class="sep">:</td><td class="val">${dash(contact.name || vendor.contactPerson)}</td></tr>
        <tr><td class="lbl">Mobile No</td><td class="sep">:</td><td class="val">${dash(contact.mobileNumber || vendor.mobile)}</td></tr>
        <tr><td class="lbl">Alternate No</td><td class="sep">:</td><td class="val">${dash(contact.altMobile || vendor.altMobile)}</td></tr>
        <tr><td class="lbl">Landline</td><td class="sep">:</td><td class="val">${dash(vendor.landline)}</td></tr>
      </table>
    </div>
    <div>
      <table class="form">
        <tr><td class="lbl">Email ID</td><td class="sep">:</td><td class="val">${dash(contact.email || vendor.email)}</td></tr>
        <tr><td class="lbl">Website</td><td class="sep">:</td><td class="val">${dash(vendor.website)}</td></tr>
      </table>
    </div>
  </div>

  <hr class="hr">

  <!-- ══ Billing + Shipping Address ══ -->
  <div class="two-col">

    <div>
      <div class="sec-head">Billing Address</div>
      <table class="form">
        <tr><td class="lbl">Address</td><td class="sep">:</td><td class="val">${dash(vendor.billingAddr || vendor.addressLine1 || vendor.address)}</td></tr>
        <tr><td class="lbl">State</td><td class="sep">:</td><td class="val">${dash(vendor.state)}</td></tr>
        <tr><td class="lbl">City</td><td class="sep">:</td><td class="val">${dash(vendor.city)}</td></tr>
        <tr><td class="lbl">Pincode</td><td class="sep">:</td><td class="val">${dash(vendor.pincode)}</td></tr>
        <tr><td class="lbl">Country</td><td class="sep">:</td><td class="val">${dash(vendor.country || 'India')}</td></tr>
      </table>
    </div>

    <div>
      <div class="sec-head">Shipping Address</div>
      <table class="form">
        <tr><td class="lbl">Address</td><td class="sep">:</td><td class="val">${dash(vendor.shippingAddr)}</td></tr>
        <tr><td class="lbl">State</td><td class="sep">:</td><td class="val">${dash(vendor.state)}</td></tr>
        <tr><td class="lbl">City</td><td class="sep">:</td><td class="val">${dash(vendor.city)}</td></tr>
        <tr><td class="lbl">Pincode</td><td class="sep">:</td><td class="val">${dash(vendor.pincode)}</td></tr>
        <tr><td class="lbl">Country</td><td class="sep">:</td><td class="val">${dash(vendor.country || 'India')}</td></tr>
      </table>
    </div>

  </div>

  <hr class="hr">

  <!-- ══ Bank Account ══ -->
  <div class="sec-head">Bank Account</div>
  <table class="form">
    <tr>
      <td class="lbl">Bank Name</td><td class="sep">:</td><td class="val" style="width:180px">${dash(vendor.bankName)}</td>
      <td style="width:20px"></td>
      <td class="lbl">Account Holder</td><td class="sep">:</td><td class="val">${dash(vendor.accountHolder)}</td>
    </tr>
    <tr>
      <td class="lbl">Account No</td><td class="sep">:</td><td class="val">${dash(vendor.accountNo)}</td>
      <td></td>
      <td class="lbl">IFSC Code</td><td class="sep">:</td><td class="val">${dash(vendor.ifsc)}</td>
    </tr>
    <tr>
      <td class="lbl">Branch</td><td class="sep">:</td><td class="val">${dash(vendor.branch)}</td>
      <td></td><td></td><td></td><td></td>
    </tr>
  </table>

  <hr class="hr">

  <!-- ══ Payment Terms + Payment Mode ══ -->
  <div class="two-col">

    <div>
      <div class="sec-head">Payment Terms</div>
      <table class="form">
        <tr><td class="lbl">Payment Terms</td><td class="sep">:</td><td class="val">${dash(vendor.paymentTerms)}</td></tr>
        <tr><td class="lbl">Currency</td><td class="sep">:</td><td class="val">${dash(vendor.currency)}</td></tr>
        <tr><td class="lbl">Credit Limit</td><td class="sep">:</td><td class="val">${vendor.creditLimit ? '₹ ' + Number(vendor.creditLimit).toLocaleString('en-IN') : ''}</td></tr>
      </table>
    </div>

    <div>
      <div class="sec-head">Payment Mode</div>
      <table class="form">
        <tr><td class="lbl">NEFT/RTGS/UPI</td><td class="sep">:</td><td class="val">${dash(payModes)}</td></tr>
      </table>
    </div>

  </div>

  <hr class="hr">

  <!-- ══ Remarks ══ -->
  <div class="sec-head">Remarks</div>
  <table class="form">
    <tr><td class="lbl">Internal Notes</td><td class="sep">:</td><td class="val" style="min-height:30px">${dash(vendor.remarks)}</td></tr>
  </table>

  <hr class="hr">

  <!-- ══ Created By / Approved By ══ -->
  <div class="two-col" style="margin-top:10px">

    <div>
      <div class="sec-head">Created By</div>
      <table class="form" style="margin-top:6px">
        <tr><td class="lbl">Username</td><td class="sep">:</td><td class="val">&nbsp;</td></tr>
        <tr style="height:8px"><td colspan="3"></td></tr>
        <tr><td class="lbl">Date</td><td class="sep">:</td><td class="val">&nbsp;</td></tr>
        <tr style="height:8px"><td colspan="3"></td></tr>
        <tr><td class="lbl">Sign</td><td class="sep">:</td><td class="sign">&nbsp;</td></tr>
      </table>
    </div>

    <div>
      <div class="sec-head">Approved by</div>
      <table class="form" style="margin-top:6px">
        <tr><td class="lbl">Username</td><td class="sep">:</td><td class="val">&nbsp;</td></tr>
        <tr style="height:8px"><td colspan="3"></td></tr>
        <tr><td class="lbl">Date</td><td class="sep">:</td><td class="val">&nbsp;</td></tr>
        <tr style="height:8px"><td colspan="3"></td></tr>
        <tr><td class="lbl">Sign</td><td class="sep">:</td><td class="sign">&nbsp;</td></tr>
      </table>
    </div>

  </div>

</div>
</body>
</html>`;

  const pageUrl = window.location.href;
  const htmlWithFooter = html.replace('</body>', `
  <div style="position:fixed;bottom:6mm;left:14mm;font-size:8pt;color:#555;font-family:Arial,sans-serif;">
    ${pageUrl}
  </div>
</body>`);

  const win = window.open('', '_blank', 'width=860,height=900');
  win.document.write(htmlWithFooter);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 600);
};
