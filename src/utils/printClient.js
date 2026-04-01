const isImage = (f) => /\.(jpg|jpeg|png|gif|bmp|webp)$/i.test(f || '');
const isPdf   = (f) => /\.pdf$/i.test(f || '');

const fetchBase64 = async (clientId, fileName) => {
  try {
    const res = await fetch(`/api/clients/${clientId}/download/${fileName}`);
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve({ base64: reader.result, mimeType: blob.type });
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
};

export const printClientDetails = async (client) => {
  // Fetch all attachments as base64
  const docsWithData = await Promise.all(
    (client.documents || []).map(async (doc) => {
      if (doc.fileName && client.clientId) {
        const data = await fetchBase64(client.clientId, doc.fileName);
        return { ...doc, ...data };
      }
      return doc;
    })
  );

  const statusLabel = { draft: 'Draft', pending: 'Pending Approval', approved: 'Approved' }[client.status] || client.status || 'Draft';
  const statusBg    = { draft: '#c87800', pending: '#1a6fa8', approved: '#1a7a3c' }[client.status] || '#555';

  const contactRows = (client.contactPersons || []).map((c, i) => `
    <tr>
      <td>${i + 1}</td><td>${c.name || '—'}</td><td>${c.designation || '—'}</td>
      <td>${c.mobileNumber || '—'}</td><td>${c.email || '—'}</td>
    </tr>`).join('');

  const docTableRows = docsWithData.map((d, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${d.name || `Document ${i + 1}`}</td>
      <td>${d.fileName || '—'}</td>
      <td style="text-align:center;font-weight:bold;color:${d.fileName ? '#1a7a3c' : '#c00'}">${d.fileName ? '✓' : '✗'}</td>
    </tr>`).join('');

  // Build embedded attachment blocks
  const attachmentBlocks = docsWithData
    .filter(d => d.base64)
    .map((d, i) => {
      const title = `<div class="att-title">Attachment ${i + 1} — ${d.name || d.fileName}</div>`;
      if (isImage(d.fileName)) {
        return `<div class="att-block">
          ${title}
          <div class="att-body"><img src="${d.base64}" alt="${d.name || ''}" /></div>
        </div>`;
      }
      if (isPdf(d.fileName)) {
        return `<div class="att-block">
          ${title}
          <div class="att-body att-pdf">
            <embed src="${d.base64}" type="application/pdf" width="100%" height="1050px" />
          </div>
        </div>`;
      }
      return `<div class="att-block">
        ${title}
        <div class="att-body att-nopreview">⚠ Preview not available for this file type (${d.fileName})</div>
      </div>`;
    }).join('');

  const html = `<!DOCTYPE html>
<html>
<head>
  <title>Client Details — ${client.companyName || ''}</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }

    body {
      font-family: 'Times New Roman', Times, serif;
      font-size: 12pt;
      color: #000;
      background: #fff;
    }

    .page { padding: 18mm 16mm; }

    /* ── Page Header ──────────────────────── */
    .page-header {
      border: 2px solid #000;
      padding: 10px 14px;
      margin-bottom: 14px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .company-name { font-size: 18pt; font-weight: bold; letter-spacing: 1px; }
    .report-title { font-size: 10pt; font-style: italic; margin-top: 3px; }
    .id-block { text-align: right; }
    .client-id-label { font-size: 10pt; }
    .client-id-value { font-size: 16pt; font-weight: bold; }
    .status-badge {
      display: inline-block;
      padding: 2px 10px;
      background: ${statusBg};
      color: #fff;
      font-size: 9pt;
      font-weight: bold;
      margin-top: 4px;
    }

    /* ── Section ──────────────────────────── */
    .section { margin-bottom: 14px; }
    .section-header {
      background: #000; color: #fff;
      font-size: 10pt; font-weight: bold;
      padding: 3px 8px;
      text-transform: uppercase; letter-spacing: 0.5px;
    }

    /* ── Info table ────────────────────────── */
    .info-table { width: 100%; border-collapse: collapse; border: 1px solid #000; }
    .info-table td { border: 1px solid #000; padding: 4px 8px; font-size: 11pt; vertical-align: top; }
    .info-table td.label { font-weight: bold; width: 22%; background: #f0f0f0; font-size: 10pt; }

    /* ── Data tables ────────────────────────── */
    table.data-table { width: 100%; border-collapse: collapse; border: 1px solid #000; font-size: 11pt; }
    table.data-table th { background: #333; color: #fff; border: 1px solid #000; padding: 4px 8px; text-align: left; font-size: 10pt; }
    table.data-table td { border: 1px solid #000; padding: 4px 8px; }
    table.data-table tbody tr:nth-child(even) td { background: #f7f7f7; }

    /* ── Attachments ────────────────────────── */
    .att-block {
      border: 1px solid #000;
      margin-bottom: 16px;
      page-break-inside: avoid;
    }
    .att-title {
      background: #333; color: #fff;
      padding: 4px 10px;
      font-size: 10pt; font-weight: bold;
    }
    .att-body { padding: 8px; }
    .att-body img { max-width: 100%; display: block; border: 1px solid #ccc; }
    .att-pdf { padding: 0; }
    .att-nopreview { font-style: italic; color: #666; font-size: 11pt; padding: 12px; }

    /* ── Footer ─────────────────────────────── */
    .page-footer {
      margin-top: 18px;
      border-top: 1px solid #000;
      padding-top: 6px;
      font-size: 9pt;
      display: flex;
      justify-content: space-between;
    }

    /* ── Print rules ─────────────────────────── */
    @media print {
      @page { margin: 10mm; size: A4 portrait; }
      .page { padding: 0; }
      .att-block { page-break-inside: avoid; }
    }
  </style>
</head>
<body>
<div class="page">

  <!-- Header -->
  <div class="page-header">
    <div>
      <div class="company-name">Epsilon Enterprise</div>
      <div class="report-title">Client Information Report</div>
    </div>
    <div class="id-block">
      <div class="client-id-label">Client ID</div>
      <div class="client-id-value">${client.clientId || '—'}</div>
      <div><span class="status-badge">${statusLabel}</span></div>
    </div>
  </div>

  <!-- Company Information -->
  <div class="section">
    <div class="section-header">Company Information</div>
    <table class="info-table">
      <tbody>
        <tr>
          <td class="label">Company Name</td>
          <td colspan="3"><strong>${client.companyName || '—'}</strong></td>
        </tr>
        <tr>
          <td class="label">Address</td>
          <td colspan="3">${client.address || '—'}</td>
        </tr>
        <tr>
          <td class="label">City</td><td>${client.city || '—'}</td>
          <td class="label">State</td><td>${client.state || '—'}</td>
        </tr>
        <tr>
          <td class="label">Pincode</td><td>${client.pincode || '—'}</td>
          <td class="label">GST Type</td><td>${client.gstType || '—'}</td>
        </tr>
        <tr>
          <td class="label">GSTIN</td>
          <td colspan="3">${client.gstin || '—'}</td>
        </tr>
      </tbody>
    </table>
  </div>

  <!-- Contact Persons -->
  <div class="section">
    <div class="section-header">Contact Persons</div>
    ${contactRows
      ? `<table class="data-table">
           <thead><tr><th>#</th><th>Name</th><th>Designation</th><th>Mobile</th><th>Email</th></tr></thead>
           <tbody>${contactRows}</tbody>
         </table>`
      : `<table class="info-table"><tbody><tr><td>No contact persons listed.</td></tr></tbody></table>`
    }
  </div>

  <!-- Documents List -->
  <div class="section">
    <div class="section-header">Attached Documents</div>
    ${docTableRows
      ? `<table class="data-table">
           <thead><tr><th>#</th><th>Document Name</th><th>File Name</th><th style="text-align:center">Attached</th></tr></thead>
           <tbody>${docTableRows}</tbody>
         </table>`
      : `<table class="info-table"><tbody><tr><td>No documents attached.</td></tr></tbody></table>`
    }
  </div>

  <!-- Footer (before attachments) -->
  <div class="page-footer">
    <span>Epsilon Enterprise — Client Portal</span>
    <span>Printed: ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })}</span>
  </div>

  <!-- Embedded Attachments -->
  ${attachmentBlocks ? `
  <div style="margin-top:24px;">
    <div class="section-header" style="margin-bottom:12px;">Document Attachments</div>
    ${attachmentBlocks}
  </div>` : ''}

</div>
</body>
</html>`;

  const win = window.open('', '_blank', 'width=900,height=800');
  win.document.write(html);
  win.document.close();
  win.focus();
  // Give embedded PDFs time to render before printing
  setTimeout(() => win.print(), 1200);
};
