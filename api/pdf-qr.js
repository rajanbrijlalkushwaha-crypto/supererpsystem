/* QR codes out of a Tally tax-invoice PDF: the e-invoice QR (page 1) and the e-way bill QR (a later page).
 *
 * extractQrs(buffer) → { einvoiceQr, ewayQr } as PNG data URLs ('' when not found).
 * The work runs in a separate node process (this same file run as a script) with a time limit,
 * so a PDF that upsets pdf.js can never take the API server down.
 *
 * A QR is picked as a square image that is almost only black / white pixels (the logo is neither). */
const path = require('path');
const zlib = require('zlib');
const { execFile } = require('child_process');

function extractQrs(buffer, timeoutMs = 15000) {
  return new Promise(resolve => {
    const empty = { einvoiceQr: '', ewayQr: '' };
    try {
      const child = execFile(process.execPath, [__filename], { timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024, windowsHide: true },
        (err, stdout) => {
          if (err) return resolve(empty);
          try { resolve({ ...empty, ...JSON.parse(String(stdout).trim().split('\n').pop()) }); } catch { resolve(empty); }
        });
      child.stdin.on('error', () => {});
      child.stdin.end(buffer);
    } catch { resolve(empty); }
  });
}

/* ── minimal grayscale PNG encoder ── */
const CRC = (() => { const t = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c; } return t; })();
const crc32 = buf => { let c = -1; for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xFF] ^ (c >>> 8); return (c ^ -1) >>> 0; };
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};
function pngGray(width, height, gray) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 0; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc((width + 1) * height);
  for (let y = 0; y < height; y++) { raw[y * (width + 1)] = 0; gray.copy(raw, y * (width + 1) + 1, y * width, (y + 1) * width); }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

/* pdf.js image → gray bytes (kind 1 = 1-bit, 2 = RGB, 3 = RGBA) */
function toGray(img) {
  const { width: w, height: h, kind, data } = img, out = Buffer.alloc(w * h);
  if (kind === 1) {
    const rowBytes = (w + 7) >> 3;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) out[y * w + x] = (data[y * rowBytes + (x >> 3)] >> (7 - (x & 7))) & 1 ? 255 : 0;
  } else {
    const bpp = kind === 2 ? 3 : 4;
    for (let i = 0; i < w * h; i++) out[i] = Math.round((data[i * bpp] + data[i * bpp + 1] + data[i * bpp + 2]) / 3);
  }
  return out;
}
const looksLikeQr = (img, g) => {
  if (!img || img.width < 21 || Math.abs(img.width - img.height) > 2) return false;
  let bw = 0; for (let i = 0; i < g.length; i++) if (g[i] < 50 || g[i] > 205) bw++;
  return bw / g.length > 0.95;
};

async function runChild() {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  const buf = Buffer.concat(chunks);
  console.warn = () => {}; console.log = () => {};
  const out = process.stdout.write.bind(process.stdout);
  const pdfjsPath = path.join(path.dirname(require.resolve('pdf-parse/package.json')), 'lib', 'pdf.js', 'v1.10.100', 'build', 'pdf.js');
  const PDFJS = require(pdfjsPath);
  PDFJS.disableWorker = true; PDFJS.disableFontFace = true;
  if (global.PDFJS) global.PDFJS.disableFontFace = true;   // the setting pdf.js actually reads
  const res = { einvoiceQr: '', ewayQr: '' };
  // a stray pdf.js error ends the child, but still hands back whatever was found
  process.on('uncaughtException', () => { out(JSON.stringify(res) + '\n'); process.exit(0); });
  try {
    const doc = await PDFJS.getDocument({ data: new Uint8Array(buf), nativeImageDecoderSupport: 'none' });
    for (let p = 1; p <= Math.min(doc.numPages, 4); p++) {
      const page = await doc.getPage(p);
      const ops = await page.getOperatorList();
      for (let i = 0; i < ops.fnArray.length; i++) {
        const fn = ops.fnArray[i];
        if (fn !== PDFJS.OPS.paintImageXObject && fn !== PDFJS.OPS.paintJpegXObject) continue;
        const img = await new Promise(r => { try { page.objs.get(ops.argsArray[i][0], r); } catch { r(null); } setTimeout(() => r(null), 3000); });
        if (!img || !img.data) continue;
        const g = toGray(img);
        if (!looksLikeQr(img, g)) continue;
        const url = 'data:image/png;base64,' + pngGray(img.width, img.height, g).toString('base64');
        if (p === 1 && !res.einvoiceQr) res.einvoiceQr = url;
        else if (p > 1 && !res.ewayQr) res.ewayQr = url;
        break;
      }
    }
  } catch { /* nothing found */ }
  out(JSON.stringify(res) + '\n');
  process.exit(0);
}

if (require.main === module) runChild();
module.exports = { extractQrs };
