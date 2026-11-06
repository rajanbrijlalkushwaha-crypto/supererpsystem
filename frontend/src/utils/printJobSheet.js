import { withPrintFont } from './printFont';
/* ═══════════════════════════════════════════════════════════════
   EPSILON ERP — Job Sheet Print
   Usage: printJobSheet(jobSheet, company)
═══════════════════════════════════════════════════════════════ */

const fmtD = d => {
  if (!d) return '—';
  const dt = new Date(d);
  return isNaN(dt) ? d : `${String(dt.getDate()).padStart(2,'0')}-${String(dt.getMonth()+1).padStart(2,'0')}-${dt.getFullYear()}`;
};
const esc = v => (!v && v !== 0) ? '' : String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const v   = x => esc(x) || '—';

function statusStyle(s) {
  const m = {
    pending:      'background:#fff3cd;color:#856404;border:1px solid #ffc107',
    submitted:    'background:#cce5ff;color:#004085;border:1px solid #b8daff',
    approved:     'background:#d4edda;color:#155724;border:1px solid #c3e6cb',
    'in-progress':'background:#e0f0ff;color:#0c5460;border:1px solid #bee5eb',
    completed:    'background:#d4edda;color:#155724;border:1px solid #c3e6cb',
    rejected:     'background:#f8d7da;color:#721c24;border:1px solid #f5c6cb',
    cancelled:    'background:#e9ecef;color:#495057;border:1px solid #dee2e6',
  };
  return m[s] || 'background:#e9ecef;color:#495057;border:1px solid #dee2e6';
}

export const printJobSheet = (js, company = {}) => {
  const o  = js || {};

  const jobNo     = v(o.jobNo);
  const soNumber  = v(o.soNumber);
  const customer  = v(o.customerName);
  const location  = v(o.locationName);
  const dueDate   = fmtD(o.dueDate);
  const startDate = fmtD(o.startDate);
  const status    = o.status || 'pending';
  const notes     = esc(o.notes);

  const outputItems = Array.isArray(o.outputItems) && o.outputItems.length
    ? o.outputItems
    : (o.itemName ? [{ itemName: o.itemName, itemCode: o.itemCode, qty: o.qtyRequired, uom: o.uom }] : []);

  const bom         = Array.isArray(o.bom) ? o.bom : [];
  const specs       = esc(o.specifications);
  const workInstr   = esc(o.workInstructions);
  const attachments = Array.isArray(o.attachments) ? o.attachments.filter(a => a.fileName || a.name) : [];

  const outputRows = outputItems.map((it, i) => `
    <tr>
      <td style="text-align:center">${i + 1}</td>
      <td style="font-weight:700">${esc(it.itemName) || '—'}</td>
      <td>${esc(it.itemCode) || '—'}</td>
      <td style="text-align:right;font-weight:700">${it.qty ?? '—'}</td>
      <td>${esc(it.uom) || '—'}</td>
    </tr>`).join('');

  const bomRows = bom.filter(r => r.material).map((r, i) => {
    const req = parseFloat(r.qty) || 0;
    const avl = r.availableQty !== '' && r.availableQty != null ? parseFloat(r.availableQty) : null;
    const suf    = avl !== null ? (avl >= req ? '✅ OK' : '❌ SHORT') : '—';
    const sufClr = avl !== null ? (avl >= req ? '#155724' : '#721c24') : '#888';
    const sufBg  = avl !== null ? (avl >= req ? '#d4edda' : '#f8d7da') : 'transparent';
    return `
    <tr>
      <td style="text-align:center">${i + 1}</td>
      <td style="font-weight:600">${esc(r.material)}</td>
      <td style="text-align:right">${esc(r.qty) || '—'}</td>
      <td>${esc(r.uom) || '—'}</td>
      <td>${esc(r.hsn) || '—'}</td>
      <td style="text-align:right">${avl !== null ? avl : '—'}</td>
      <td style="text-align:center;background:${sufBg};color:${sufClr};font-weight:700">${suf}</td>
    </tr>`;
  }).join('');

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Job Sheet ${jobNo}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, 'Segoe UI', sans-serif; font-size: 13px; color: #222; background: #fff; }
  @page { size: A4; margin: 14mm; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }

  table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
  th { background: #354A5E; color: #fff; padding: 6px 9px; font-size: 11px; font-weight: 700; text-align: left; border: 1px solid #14243a; }
  td { padding: 5px 9px; border: 1px solid #ddd; font-size: 12px; }
  tr:nth-child(even) td { background: #f8f9fa; }

  .doc-title-bar { display: flex; justify-content: space-between; align-items: center; border: 1px solid #354A5E; padding: 8px 14px; margin-bottom: 14px; background: #f0f4f8; }
  .doc-title { font-size: 16px; font-weight: 800; color: #354A5E; }
  .doc-no { font-size: 18px; font-weight: 900; color: #354A5E; font-family: 'Courier New', monospace; }

  .info-grid { display: grid; grid-template-columns: 1fr 1fr; border: 1px solid #ddd; margin-bottom: 14px; }
  .info-cell { padding: 6px 12px; border-bottom: 1px solid #eee; }
  .info-cell:nth-child(odd) { border-right: 1px solid #eee; }
  .info-label { font-size: 9.5px; font-weight: 700; color: #888; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 2px; }
  .info-value { font-size: 13px; font-weight: 600; color: #354A5E; }

  .sec-head { background: #354A5E; color: #fff; padding: 6px 12px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; margin-top: 14px; margin-bottom: 0; }

  .sig-area { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; margin-top: 30px; }
  .sig-box { border-top: 1px solid #333; padding-top: 6px; text-align: center; font-size: 10px; color: #555; }
</style>
</head>
<body>

  <!-- Document title -->
  <div class="doc-title-bar">
    <div>
      <div class="doc-title">JOB SHEET</div>
      <div style="font-size:11px;color:#666;margin-top:3px">Manufacturing Work Order</div>
    </div>
    <div style="text-align:right">
      <div class="doc-no">${jobNo}</div>
      <div style="margin-top:4px">
        <span style="padding:3px 12px;border-radius:12px;font-size:11px;font-weight:700;${statusStyle(status)}">
          ${status.charAt(0).toUpperCase() + status.slice(1)}
        </span>
      </div>
    </div>
  </div>

  <!-- Info grid -->
  <div class="info-grid">
    <div class="info-cell"><div class="info-label">Sales Order</div><div class="info-value">${soNumber}</div></div>
    <div class="info-cell"><div class="info-label">Customer</div><div class="info-value">${customer}</div></div>
    <div class="info-cell"><div class="info-label">Manufacturing Location</div><div class="info-value">${location}</div></div>
    <div class="info-cell"><div class="info-label">Due Date</div><div class="info-value">${dueDate}</div></div>
    <div class="info-cell"><div class="info-label">Start Date</div><div class="info-value">${startDate}</div></div>
    <div class="info-cell"><div class="info-label">Printed On</div><div class="info-value">${new Date().toLocaleDateString('en-IN')}</div></div>
  </div>

  <!-- Production Output -->
  <div class="sec-head">Production Output — Finished Products to Manufacture</div>
  <table>
    <thead>
      <tr>
        <th style="width:40px;text-align:center">#</th>
        <th>Item / Product Name</th>
        <th style="width:110px">Item Code</th>
        <th style="width:80px;text-align:right">Qty</th>
        <th style="width:70px">UOM</th>
      </tr>
    </thead>
    <tbody>
      ${outputRows || '<tr><td colspan="5" style="text-align:center;color:#888;padding:10px">No items</td></tr>'}
    </tbody>
  </table>

  <!-- BOM -->
  <div class="sec-head">Bill of Materials — Raw Materials Required</div>
  <table>
    <thead>
      <tr>
        <th style="width:40px;text-align:center">#</th>
        <th>Raw Material / Component</th>
        <th style="width:100px;text-align:right">Required Qty</th>
        <th style="width:70px">UOM</th>
        <th style="width:90px">HSN Code</th>
        <th style="width:100px;text-align:right">Available</th>
        <th style="width:90px;text-align:center">Status</th>
      </tr>
    </thead>
    <tbody>
      ${bomRows || '<tr><td colspan="7" style="text-align:center;color:#888;padding:10px">No BOM entries</td></tr>'}
    </tbody>
  </table>

  ${specs ? `<div class="sec-head">Specifications</div>
  <div style="border:1px solid #ddd;padding:10px 12px;font-size:12px;color:#444;background:#fafafa;white-space:pre-wrap;margin-bottom:14px">${specs}</div>` : ''}

  ${workInstr ? `<div class="sec-head">Work Instructions</div>
  <div style="border:1px solid #ddd;padding:10px 12px;font-size:12px;color:#444;background:#fafafa;white-space:pre-wrap;margin-bottom:14px">${workInstr}</div>` : ''}

  ${attachments.length ? `<div class="sec-head">Reference Documents / Attachments</div>
  <div style="border:1px solid #ddd;padding:8px 12px;margin-bottom:14px">
    ${attachments.map((a, i) => `<div style="padding:3px 0;font-size:12px;border-bottom:1px solid #f0f0f0;color:#333">
      ${i + 1}. ${esc(a.name || a.fileName)}${a.fileName ? ` <span style="color:#888;font-size:11px">(${esc(a.fileName)})</span>` : ''}
    </div>`).join('')}
  </div>` : ''}

  ${notes ? `<div class="sec-head">Notes</div>
  <div style="border:1px solid #ddd;padding:10px 12px;font-size:12px;color:#444;background:#fafafa;white-space:pre-wrap;margin-bottom:14px">${notes}</div>` : ''}

  <!-- Signatures -->
  <div class="sig-area">
    <div class="sig-box">Prepared By</div>
    <div class="sig-box">Production Manager</div>
    <div class="sig-box">Authorised Signatory</div>
  </div>

<script>window.onload = function(){ window.print(); };</script>
</body>
</html>`;

  const w = window.open('', '_blank', 'width=900,height=700');
  if (w) { w.document.write(withPrintFont(html)); w.document.close(); }
};
