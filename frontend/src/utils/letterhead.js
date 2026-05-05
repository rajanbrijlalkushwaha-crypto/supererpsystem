/* ═══════════════════════════════════════════════════════════════
   EPSILON ERP — Shared Letterhead Template
   Usage: letterheadPage(bodyHtml, title)
   ═══════════════════════════════════════════════════════════════ */

/* Epsilon hexagon-sigma SVG logo */
const LOGO_SVG = `
<svg width="54" height="54" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
  <!-- Outer hexagon -->
  <polygon points="60,4 110,32 110,88 60,116 10,88 10,32"
    fill="none" stroke="#1a2e4a" stroke-width="5"/>
  <!-- Inner hexagon -->
  <polygon points="60,18 96,39 96,81 60,102 24,81 24,39"
    fill="none" stroke="#1a2e4a" stroke-width="3"/>
  <!-- Sigma / arrow shape -->
  <polyline points="78,38 42,38 62,60 42,82 78,82"
    fill="none" stroke="#1a2e4a" stroke-width="7" stroke-linejoin="round" stroke-linecap="round"/>
</svg>`;

/* Large watermark SVG (full page background) */
const WATERMARK_SVG = `
<svg width="520" height="520" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
  <polygon points="60,4 110,32 110,88 60,116 10,88 10,32"
    fill="none" stroke="#354A5E" stroke-width="4"/>
  <polygon points="60,18 96,39 96,81 60,102 24,81 24,39"
    fill="none" stroke="#354A5E" stroke-width="2.5"/>
  <polyline points="78,38 42,38 62,60 42,82 78,82"
    fill="none" stroke="#354A5E" stroke-width="6" stroke-linejoin="round" stroke-linecap="round"/>
</svg>`;

export const letterheadPage = (bodyHtml, title = 'Epsilon ERP') => `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${title}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: Arial, 'Segoe UI', sans-serif;
    font-size: 13px; color: #222; background: #fff;
  }

  /* ── Page margins leave space for fixed header & footer ── */
  @page {
    size: A4;
    margin: 95px 14mm 46px 14mm;
  }
  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .no-print { display: none !important; }
  }

  /* ── Fixed Header ── (repeats on every page) */
  .lh-header {
    position: fixed;
    top: -95px; left: -14mm; right: -14mm;
    height: 90px;
    background: #fff;
    border-bottom: 2.5px solid #1a2e4a;
    padding: 0 22px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    z-index: 100;
  }
  .lh-header-left {
    font-family: Arial, sans-serif;
    font-size: 9px;
    color: #888;
    line-height: 1.6;
  }
  .lh-header-right {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .lh-company-name {
    text-align: right;
  }
  .lh-company-name .big {
    font-family: 'Arial Black', Arial, sans-serif;
    font-size: 24px;
    font-weight: 900;
    color: #1a2e4a;
    letter-spacing: 3px;
    line-height: 1;
  }
  .lh-company-name .sub {
    font-size: 8.5px;
    color: #888;
    letter-spacing: 2.5px;
    text-transform: uppercase;
    margin-top: 3px;
  }

  /* ── Fixed Footer ── (repeats on every page) */
  .lh-footer {
    position: fixed;
    bottom: -46px; left: -14mm; right: -14mm;
    height: 42px;
    background: #fff;
    border-top: 1px solid #ccc;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
  }
  .lh-footer span {
    font-size: 9px;
    color: #555;
    font-family: Arial, sans-serif;
    text-align: center;
    line-height: 1.5;
  }

  /* ── Watermark ── */
  .lh-watermark {
    position: fixed;
    top: 50%; left: 50%;
    transform: translate(-50%, -50%);
    opacity: 0.045;
    z-index: 0;
    pointer-events: none;
  }

  /* ── Content sits above watermark ── */
  .lh-content {
    position: relative;
    z-index: 1;
  }

  /* ── Common table styles ── */
  table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
  th {
    background: #1a2e4a; color: #fff;
    padding: 6px 9px; font-size: 11px; font-weight: 700;
    text-align: left; border: 1px solid #14243a;
  }
  td { padding: 5px 9px; border: 1px solid #ddd; font-size: 12px; }
  tr:nth-child(even) td { background: #f8f9fa; }

  /* ── Info grid ── */
  .info-grid {
    display: grid; grid-template-columns: 1fr 1fr;
    border: 1px solid #ddd; margin-bottom: 14px;
  }
  .info-cell { padding: 6px 12px; border-bottom: 1px solid #eee; }
  .info-cell:nth-child(odd) { border-right: 1px solid #eee; }
  .info-label {
    font-size: 9.5px; font-weight: 700; color: #888;
    text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 2px;
  }
  .info-value { font-size: 13px; font-weight: 600; color: #1a2e4a; }

  /* ── Section heading ── */
  .sec-head {
    background: #1a2e4a; color: #fff;
    padding: 6px 12px; font-size: 11px; font-weight: 700;
    text-transform: uppercase; letter-spacing: 0.8px;
    margin-top: 14px; margin-bottom: 0;
  }

  /* ── Document title bar ── */
  .doc-title-bar {
    display: flex; justify-content: space-between; align-items: center;
    border: 1px solid #1a2e4a; padding: 8px 14px; margin-bottom: 14px;
    background: #f0f4f8;
  }
  .doc-title { font-size: 16px; font-weight: 800; color: #1a2e4a; letter-spacing: 0.5px; }
  .doc-no {
    font-size: 18px; font-weight: 900; color: #1a2e4a;
    font-family: 'Courier New', monospace; letter-spacing: 1px;
  }

  /* ── Signature row ── */
  .sig-area {
    display: grid; grid-template-columns: 1fr 1fr 1fr;
    gap: 20px; margin-top: 30px;
  }
  .sig-box {
    border-top: 1px solid #333; padding-top: 6px;
    text-align: center; font-size: 10px; color: #555;
  }
</style>
</head>
<body>

  <!-- LETTERHEAD HEADER -->
  <div class="lh-header">
    <div class="lh-header-left">
      <!-- left side intentionally blank — logo is on right per letterhead -->
    </div>
    <div class="lh-header-right">
      <div class="lh-company-name">
        <div class="big">&#931; EPSILON</div>
        <div class="sub">Savvish Prefabricated Systems</div>
      </div>
      <div>${LOGO_SVG}</div>
    </div>
  </div>

  <!-- WATERMARK -->
  <div class="lh-watermark">${WATERMARK_SVG}</div>

  <!-- PAGE CONTENT -->
  <div class="lh-content">
    ${bodyHtml}
  </div>

  <!-- LETTERHEAD FOOTER -->
  <div class="lh-footer">
    <span>
      Add: 502, Sungrace, Gandhinagar highway Motera Highway Ahmedabad, Gujarat-380005
      &nbsp;&nbsp;|&nbsp;&nbsp;
      M: +91-9328927032 &nbsp;/&nbsp; Email: Tender@epsilonprefab.org
    </span>
  </div>

  <script>window.onload = function(){ window.print(); };</script>
</body>
</html>`;
