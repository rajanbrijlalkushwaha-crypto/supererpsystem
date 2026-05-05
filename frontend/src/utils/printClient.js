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

const v = (val) => val || '';
const dash = (val) => val || '';

export const printClientDetails = async (client, company) => {
  /* ── Fetch logo as base64 if available ── */
  let logoBase64 = null;
  if (company?.logoFileName) {
    logoBase64 = await fetchBase64(`/api/companies/logo/${encodeURIComponent(company.logoFileName)}?companyId=${company.companyId||''}`);
  }

  const contact   = (client.contactPersons || [])[0] || {};
  const today     = new Date().toLocaleDateString('en-IN', { day:'2-digit', month:'long', year:'numeric' });
  const payModes  = Array.isArray(client.paymentModes) ? client.paymentModes.join(', ') : (client.paymentModes || '');

  /* ── Company header block ── */
  const logoTag = logoBase64
    ? `<img src="${logoBase64}" alt="Logo" style="height:64px;max-width:120px;object-fit:contain;" />`
    : `<div style="width:64px;height:64px;border:1px solid #ccc;display:flex;align-items:center;justify-content:center;font-size:9pt;color:#999;">No Logo</div>`;

  const coAddr = [company?.address, company?.city, company?.state, company?.pincode].filter(Boolean).join(', ');

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Client Details — ${v(client.companyName || client.clientName)}</title>
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

    /* ── Sign row ── */
    .sign-line {
      display: inline-block;
      width: 160px;
      border-bottom: 1px solid #000;
      margin-left: 6px;
    }

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

  <!-- ══ ROW 1: Client Details + Tax Identity ══ -->
  <div class="two-col">

    <!-- Client Details -->
    <div>
      <div class="sec-head">Client Details</div>
      <table class="form">
        <tr><td class="lbl">Client ID</td><td class="sep">:</td><td class="val">${dash(client.clientId)}</td></tr>
        <tr><td class="lbl">Client Name</td><td class="sep">:</td><td class="val">${dash(client.companyName || client.clientName)}</td></tr>
        <tr><td class="lbl">Business Type</td><td class="sep">:</td><td class="val">${dash(client.businessType)}</td></tr>
        <tr><td class="lbl">Industries Type</td><td class="sep">:</td><td class="val">${dash(client.industryType)}</td></tr>
        <tr><td class="lbl">Category</td><td class="sep">:</td><td class="val">${dash(client.category)}</td></tr>
        <tr><td class="lbl">TDS Applicable</td><td class="sep">:</td><td class="val">${client.tdsApplicable ? 'Yes' : 'No'}</td></tr>
      </table>
    </div>

    <!-- Tax Identity -->
    <div>
      <div class="sec-head">Tax Identity</div>
      <table class="form">
        <tr><td class="lbl">Pan N0</td><td class="sep">:</td><td class="val">${dash(client.pan)}</td></tr>
        <tr><td class="lbl">GSTIN No</td><td class="sep">:</td><td class="val">${dash(client.gstin || client.gst)}</td></tr>
        <tr><td class="lbl">CIN No</td><td class="sep">:</td><td class="val">${dash(client.cin)}</td></tr>
        <tr><td class="lbl">MSME if Applicable</td><td class="sep">:</td><td class="val">${dash(client.msme)}</td></tr>
        <tr><td class="lbl">GST Type</td><td class="sep">:</td><td class="val">${dash(client.gstType)}</td></tr>
        <tr><td class="lbl">GST Registred</td><td class="sep">:</td><td class="val">${client.gstRegistered !== false ? 'Yes' : 'No'}</td></tr>
      </table>
    </div>

  </div>

  <hr class="hr">

  <!-- ══ Contact Details ══ -->
  <div class="sec-head">Contact Details:</div>
  <div class="two-col">
    <div>
      <table class="form">
        <tr><td class="lbl">Name</td><td class="sep">:</td><td class="val">${dash(contact.name || client.contactPerson)}</td></tr>
        <tr><td class="lbl">Mobile no</td><td class="sep">:</td><td class="val">${dash(contact.mobileNumber || client.mobile)}</td></tr>
        <tr><td class="lbl">Alternate No</td><td class="sep">:</td><td class="val">${dash(contact.altMobile || client.altMobile)}</td></tr>
        <tr><td class="lbl">Landline</td><td class="sep">:</td><td class="val">${dash(client.landline)}</td></tr>
      </table>
    </div>
    <div>
      <table class="form">
        <tr><td class="lbl">Email id</td><td class="sep">:</td><td class="val">${dash(contact.email || client.email)}</td></tr>
        <tr><td class="lbl">Website</td><td class="sep">:</td><td class="val">${dash(client.website)}</td></tr>
      </table>
    </div>
  </div>

  <hr class="hr">

  <!-- ══ Billing + Shipping Address ══ -->
  <div class="two-col">

    <div>
      <div class="sec-head">Billing Address</div>
      <table class="form">
        <tr><td class="lbl">Address</td><td class="sep">:</td><td class="val">${dash(client.billingAddr || client.address)}</td></tr>
        <tr><td class="lbl">State</td><td class="sep">:</td><td class="val">${dash(client.state)}</td></tr>
        <tr><td class="lbl">City</td><td class="sep">:</td><td class="val">${dash(client.city)}</td></tr>
        <tr><td class="lbl">Pincode</td><td class="sep">:</td><td class="val">${dash(client.pincode)}</td></tr>
        <tr><td class="lbl">Country</td><td class="sep">:</td><td class="val">${dash(client.country || 'India')}</td></tr>
      </table>
    </div>

    <div>
      <div class="sec-head">Shipping Address</div>
      <table class="form">
        <tr><td class="lbl">Address</td><td class="sep">:</td><td class="val">${dash(client.shippingAddr)}</td></tr>
        <tr><td class="lbl">State</td><td class="sep">:</td><td class="val">${dash(client.state)}</td></tr>
        <tr><td class="lbl">City</td><td class="sep">:</td><td class="val">${dash(client.city)}</td></tr>
        <tr><td class="lbl">Pincode</td><td class="sep">:</td><td class="val">${dash(client.pincode)}</td></tr>
        <tr><td class="lbl">Country</td><td class="sep">:</td><td class="val">${dash(client.country || 'India')}</td></tr>
      </table>
    </div>

  </div>

  <hr class="hr">

  <!-- ══ Bank Account ══ -->
  <div class="sec-head">Bank Account</div>
  <table class="form">
    <tr>
      <td class="lbl">Bank Name</td><td class="sep">:</td><td class="val" style="width:180px">${dash(client.bankName)}</td>
      <td style="width:20px"></td>
      <td class="lbl">Account Holder</td><td class="sep">:</td><td class="val">${dash(client.accountHolder)}</td>
    </tr>
    <tr>
      <td class="lbl">Account No</td><td class="sep">:</td><td class="val">${dash(client.accountNo)}</td>
      <td></td>
      <td class="lbl">IFSC Code</td><td class="sep">:</td><td class="val">${dash(client.ifsc)}</td>
    </tr>
    <tr>
      <td class="lbl">Branch</td><td class="sep">:</td><td class="val">${dash(client.branch)}</td>
      <td></td><td></td><td></td><td></td>
    </tr>
  </table>

  <hr class="hr">

  <!-- ══ Payment Terms + Payment Mode ══ -->
  <div class="two-col">

    <div>
      <div class="sec-head">Payment Terms</div>
      <table class="form">
        <tr><td class="lbl">Payment Terms</td><td class="sep">:</td><td class="val">${dash(client.paymentTerms)}</td></tr>
        <tr><td class="lbl">Currency</td><td class="sep">:</td><td class="val">${dash(client.currency)}</td></tr>
        <tr><td class="lbl">Credit Limit</td><td class="sep">:</td><td class="val">${client.creditLimit ? '₹ ' + Number(client.creditLimit).toLocaleString('en-IN') : '—'}</td></tr>
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
    <tr><td class="lbl">Internal Notes</td><td class="sep">:</td><td class="val" style="min-height:30px">${dash(client.remarks)}</td></tr>
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
