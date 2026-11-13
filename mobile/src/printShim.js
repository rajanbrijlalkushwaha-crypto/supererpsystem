/* The ERP's print preview, for the phone. The ERP's print code (shared with the website) calls openPreview /
 * previewFrame / previewPdf; here they open the app's own viewer (Viewer.jsx), which shows the page and shares it
 * as a PDF (made on the ERP server, /api/print-merge). The rest of printKit is the website's own. */
import * as real from '../../frontend/src/pages/beta/printKit.js';

export const { withTeal, signHtml, finalPdf, prodText, logoData, fillPages, applySigns, loadSigns, TEAL_PRINT_CSS } = real;

export function openPreview(title, opts = {}) {
  window.dispatchEvent(new CustomEvent('erp-preview', { detail: { title, opts } }));
}
export function previewFrame(fr, title, extra = {}) {
  const doc = fr.contentWindow.document;
  const html = '<!DOCTYPE html>' + doc.documentElement.outerHTML;
  fr.remove();
  openPreview(title || doc.title, { html, ...extra });
}
export function previewHtml(html, title, extra = {}) { openPreview(title, { html, ...extra }); }
export function previewPdf(blob, title, name, extra = {}) { openPreview(title, { pdfBlob: blob, fileName: name, ...extra }); }
