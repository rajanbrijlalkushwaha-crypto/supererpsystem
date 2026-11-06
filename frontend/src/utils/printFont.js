/* printFont.js — makes printed reports use the Adani brand typeface.
 *
 * Print output is written into a fresh window with document.write(), which does
 * NOT inherit the app's stylesheet or its @font-face rules. So every standalone
 * print document has to carry the font itself.
 *
 * The font is inlined as a data URI rather than linked by URL on purpose: most
 * print helpers call print() on window load, which can fire before a linked
 * font finishes downloading — that would silently print in the fallback face.
 * An inline font is already there when the document parses.
 */
import fontUrl from '../fonts/adani.ttf';

let dataUri = null;

/* Warm the cache once at startup so withPrintFont() can stay synchronous
   (the document.write call sites are all synchronous). */
export function preloadPrintFont() {
  if (dataUri) return;
  fetch(fontUrl)
    .then(r => r.blob())
    .then(b => new Promise(res => {
      const rd = new FileReader();
      rd.onload = () => res(rd.result);
      rd.readAsDataURL(b);
    }))
    .then(d => { dataUri = d; })
    .catch(() => { /* falls back to the absolute URL below */ });
}

/* Same-origin absolute URL is the fallback if a print fires before preload
   finishes — correct, just subject to the load-timing risk described above. */
const fontSrc = () => dataUri
  ? `url(${dataUri}) format('truetype')`
  : `url(${window.location.origin}${fontUrl}) format('truetype')`;

export const printFontCss = () => `
@font-face{font-family:'Adani';src:${fontSrc()};font-weight:400;font-style:normal;font-display:block;}
*,*::before,*::after{font-family:'Adani','Segoe UI',Arial,sans-serif !important;}
pre,code,kbd,samp{font-family:'Courier New',Courier,monospace !important;}
`;

/**
 * Inject the Adani @font-face into a standalone print document.
 * Injected at the end of <head> so it lands after the document's own <style>
 * block, letting the !important rules win.
 */
export function withPrintFont(html) {
  if (typeof html !== 'string') return html;
  html = withLegalNote(html);
  const tag = `<style>${printFontCss()}</style>`;
  if (/<\/head>/i.test(html))      return html.replace(/<\/head>/i, `${tag}</head>`);
  if (/<body[^>]*>/i.test(html))   return html.replace(/<body[^>]*>/i, m => m + tag);
  return tag + html;
}

/* Jurisdiction + system-generated note closing every printed document. Every
   print goes through withPrintFont(), so it is added here once instead of in
   each print helper. */
const LEGAL_MARK = 'data-legal-note';
export const legalNoteHtml = () => `
<div ${LEGAL_MARK} style="margin-top:10px;padding-top:5px;border-top:1px solid #000;text-align:center;font-size:8.5pt;line-height:1.5;color:#000;page-break-inside:avoid;break-inside:avoid;">
  <div style="font-weight:bold;">Subject to Ahmedabad Jurisdiction</div>
  <div>This is a system-generated document, hence no signature is required.</div>
</div>`;
function withLegalNote(html) {
  if (html.includes(LEGAL_MARK)) return html;
  if (/<\/body>/i.test(html)) return html.replace(/<\/body>(?![\s\S]*<\/body>)/i, `${legalNoteHtml()}</body>`);
  return html + legalNoteHtml();
}
