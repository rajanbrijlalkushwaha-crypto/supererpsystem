import { withPrintFont } from './printFont';
import { brandLine } from './printBranding';
/* Client Details — print layout matching the Delivery Challan format
 * (bordered grid table, field() rows, section-hdr bars) instead of the old
 * plain colon-separated layout with no cell borders. */

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

export const printClientDetails = async (client, company = {}, user = null) => {
  let logoBase64 = null;
  if (company?.logoFileName) {
    logoBase64 = await fetchBase64(`/api/companies/logo/${encodeURIComponent(company.logoFileName)}?companyId=${company.companyId||''}`);
  }
  const logoHtml = logoBase64
    ? `<img src="${logoBase64}" alt="Logo" style="height:48px;max-width:110px;object-fit:contain;">`
    : '';

  const contact  = (client.contactPersons || [])[0] || {};
  const today    = new Date().toLocaleDateString('en-IN', { day:'2-digit', month:'long', year:'numeric' });
  const payModes = Array.isArray(client.paymentModes) ? client.paymentModes.join(', ') : (client.paymentModes || '');

  /* ── Created By — the user who created the client record, from the audit
     trail. Look up their live record for login ID + designation (not stored
     on older audit entries, and designation may have changed since). ── */
  const createdBy = Array.isArray(client.audit) ? client.audit.find(a => a.action === 'created')?.by : null;
  let createdUser = null;
  if (createdBy?.id || createdBy?.username) {
    try {
      const r = await fetch('/api/auth/users');
      if (r.ok) {
        const all = await r.json();
        createdUser = all.find(u => String(u.id) === String(createdBy.id)) ||
                      all.find(u => u.username === createdBy.username) || null;
      }
    } catch {}
  }
  const createdName       = dash(createdBy?.name || createdBy?.username) || '&nbsp;';
  const createdLoginId    = dash(createdUser?.username || createdBy?.username);
  const createdDesignation = dash(createdUser?.designation);
  const createdDate = createdBy?.at
    ? new Date(createdBy.at).toLocaleDateString('en-IN', { day:'2-digit', month:'long', year:'numeric' })
    : '&nbsp;';

  const approvedBy = Array.isArray(client.audit) ? [...client.audit].reverse().find(a => a.action === 'approved')?.by : null;
  const approvedName = dash(approvedBy?.name || approvedBy?.username) || '&nbsp;';
  const approvedDate = approvedBy?.at
    ? new Date(approvedBy.at).toLocaleDateString('en-IN', { day:'2-digit', month:'long', year:'numeric' })
    : '&nbsp;';

  const css = `
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 10pt; color: #000; padding: 12px; }
    .outer { border: 1.5px solid #000; width: 100%; border-collapse: collapse; }
    .outer td, .outer th { border: 1px solid #000; padding: 3px 6px; vertical-align: top; }
    .section-hdr { text-align: center; font-weight: bold; font-size: 11pt; background: #fff; padding: 4px; }
    .col-hdr { font-weight: bold; text-decoration: underline; font-size: 10pt; }
    .field-row { display: flex; gap: 2px; margin-bottom: 2px; font-size: 9.5pt; }
    .field-lbl { min-width: 130px; font-weight: normal; }
    .field-colon { margin: 0 4px; }
    .field-val { flex: 1; }
    .sign { border-bottom: 1px solid #000; min-width: 160px; display: inline-block; height: 18px; }
    @media print { @page { margin: 8mm; size: A4; } }
  `;

  const field = (lbl, v) => `
    <div class="field-row">
      <span class="field-lbl">${lbl}</span>
      <span class="field-colon">:</span>
      <span class="field-val">${dash(v)}</span>
    </div>`;

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>Client Details — ${dash(client.companyName || client.clientName)}</title>
  <style>${css}</style>
</head>
<body>
<table class="outer">

  <!-- Company Header -->
  <tr>
    <td colspan="2" style="padding:8px 10px; border-bottom:2px solid #000;">
      <div style="display:flex; align-items:center; gap:12px;">
        ${logoHtml}
        <div>
          <div style="font-size:13pt; font-weight:bold;">${dash(company.companyName) || 'Epsilon Enterprise'}</div>
          <div style="font-size:8.5pt; color:#333;">${[company.address, company.city, company.state, company.pincode].filter(Boolean).join(', ')}</div>
          <div style="font-size:8.5pt; color:#333;">GSTIN: ${dash(company.gstin)} &nbsp;|&nbsp; Ph: ${dash(company.phone)} &nbsp;|&nbsp; Email: ${dash(company.email)}</div>
        </div>
      </div>
    </td>
  </tr>

  <!-- Title -->
  <tr><td colspan="2" style="text-align:center; font-size:13pt; font-weight:bold; padding:6px; border-bottom:2px solid #000;">Client Details</td></tr>

  <!-- Client Details + Tax Identity -->
  <tr><td colspan="2" class="section-hdr" style="border-top:1.5px solid #000; border-bottom:1px solid #000;">Client Details &amp; Tax Identity</td></tr>
  <tr>
    <td><span class="col-hdr">Client Details</span></td>
    <td><span class="col-hdr">Tax Identity</span></td>
  </tr>
  <tr>
    <td>
      ${field('Client ID', client.clientId)}
      ${field('Client Name', client.companyName || client.clientName)}
      ${field('Business Type', client.businessType)}
      ${field('Industries Type', client.industryType)}
      ${field('Category', client.category)}
      ${field('TDS Applicable', client.tdsApplicable ? 'Yes' : 'No')}
    </td>
    <td>
      ${field('PAN No', client.pan)}
      ${field('GSTIN No', client.gstin || client.gst)}
      ${field('CIN No', client.cin)}
      ${field('MSME if Applicable', client.msme)}
      ${field('GST Type', client.gstType)}
      ${field('GST Registered', client.gstRegistered !== false ? 'Yes' : 'No')}
    </td>
  </tr>

  <!-- Contact -->
  <tr><td colspan="2" class="section-hdr" style="border-top:1.5px solid #000; border-bottom:1px solid #000;">Contact</td></tr>
  <tr>
    <td>
      ${field('Name', contact.name || client.contactPerson)}
      ${field('Mobile No', contact.mobileNumber || client.mobile)}
      ${field('Alternate No', contact.altMobile || client.altMobile)}
      ${field('Landline', client.landline)}
    </td>
    <td>
      ${field('Email id', contact.email || client.email)}
      ${field('Website', client.website)}
    </td>
  </tr>

  <!-- Address -->
  <tr><td colspan="2" class="section-hdr" style="border-top:1.5px solid #000; border-bottom:1px solid #000;">Address</td></tr>
  <tr>
    <td><span class="col-hdr">Billing</span></td>
    <td><span class="col-hdr">Shipping</span></td>
  </tr>
  <tr>
    <td>
      ${field('Address', client.billingAddr || client.address)}
      ${field('City', client.city)}
      ${field('State', client.state)}
      ${field('Pincode', client.pincode)}
      ${field('Country', client.country || 'India')}
    </td>
    <td>
      ${field('Address', client.shippingAddr)}
      ${field('City', client.city)}
      ${field('State', client.state)}
      ${field('Pincode', client.pincode)}
      ${field('Country', client.country || 'India')}
    </td>
  </tr>

  <!-- Bank Account -->
  <tr><td colspan="2" class="section-hdr" style="border-top:1.5px solid #000; border-bottom:1px solid #000;">Bank Account</td></tr>
  <tr>
    <td>
      ${field('Bank Name', client.bankName)}
      ${field('Account No', client.accountNo)}
      ${field('Branch', client.branch)}
    </td>
    <td>
      ${field('Account Holder', client.accountHolder)}
      ${field('IFSC Code', client.ifsc)}
    </td>
  </tr>

  <!-- Payment Terms + Mode -->
  <tr><td colspan="2" class="section-hdr" style="border-top:1.5px solid #000; border-bottom:1px solid #000;">Payment Terms &amp; Mode</td></tr>
  <tr>
    <td>
      ${field('Payment Terms', client.paymentTerms)}
      ${field('Currency', client.currency)}
      ${field('Credit Limit', client.creditLimit ? '₹ ' + Number(client.creditLimit).toFixed(2) : '')}
    </td>
    <td>
      ${field('NEFT/RTGS/UPI', payModes)}
    </td>
  </tr>

  <!-- Remarks -->
  <tr><td colspan="2" class="section-hdr" style="border-top:1.5px solid #000; border-bottom:1px solid #000;">Remarks</td></tr>
  <tr><td colspan="2" style="min-height:32px;">${dash(client.remarks)}</td></tr>

  <!-- Created By / Approved By -->
  <tr><td colspan="2" class="section-hdr" style="border-top:1.5px solid #000; border-bottom:1px solid #000;">Created By / Approved By</td></tr>
  <tr>
    <td>
      <span class="col-hdr">Created By</span>
      ${field('Username', createdName)}
      ${createdLoginId ? field('Login ID', createdLoginId) : ''}
      ${createdDesignation ? field('Designation', createdDesignation) : ''}
      ${field('Date', createdDate)}
      <div class="field-row"><span class="field-lbl">Sign</span><span class="field-colon">:</span><span class="sign"></span></div>
    </td>
    <td>
      <span class="col-hdr">Approved By</span>
      ${field('Username', approvedName)}
      ${field('Date', approvedDate)}
      <div class="field-row"><span class="field-lbl">Sign</span><span class="field-colon">:</span><span class="sign"></span></div>
    </td>
  </tr>

  <tr><td colspan="2" style="border-top:1px solid #000; font-size:8pt; color:#555;">
    <div style="display:flex; justify-content:space-between;">
      <span>${brandLine(user)}</span>
      <span>Printed: ${today}</span>
    </div>
  </td></tr>

</table>
</body>
</html>`;

  const pageUrl = window.location.href;
  const htmlWithFooter = html.replace('</body>', `
  <div style="position:fixed;bottom:6mm;left:14mm;font-size:8pt;color:#555;font-family:Arial,sans-serif;">
    ${pageUrl}
  </div>
</body>`);

  const win = window.open('', '_blank', 'width=860,height=900');
  win.document.write(withPrintFont(htmlWithFooter));
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 600);
};
