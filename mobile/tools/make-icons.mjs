/* Makes the app icons from the company logo (mobile/icon.png) in every Android size: legacy square + round,
 * the adaptive foreground (on a light background colour), a small logo for the app's own screens, and the
 * opening (splash) images. Run: node tools/make-icons.mjs
 * Needs the ERP's puppeteer (../node_modules) and Google Chrome. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const res = path.join(root, 'android', 'app', 'src', 'main', 'res');
const puppeteer = (await import(path.join(root, '..', 'node_modules', 'puppeteer', 'lib', 'esm', 'puppeteer', 'puppeteer.js'))).default;
const BG = '#F2F5FD';                     // the logo's own light background
const DENS = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
const src = 'data:image/png;base64,' + fs.readFileSync(path.join(root, 'icon.png')).toString('base64');

const br = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
const p = await br.newPage();
await p.setContent('<html><body></body></html>');
await p.evaluate(async src => { const i = new Image(); i.src = src; await i.decode(); window.LOGO = i; }, src);

// kind: square | round | fg | splash ; w,h = canvas size
const draw = (w, h, kind) => p.evaluate((w, h, kind, BG) => {
  const L = window.LOGO, c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d');
  // the logo tile without its outer shadow/margin
  const n = L.naturalWidth, cs = n * 0.035, cw = n - cs * 2;
  const tile = (dx, dy, s, r) => { x.save(); x.beginPath(); x.roundRect(dx, dy, s, s, r); x.clip(); x.drawImage(L, cs, cs * 0.9, cw, cw, dx, dy, s, s); x.restore(); };
  if (kind === 'square') tile(0, 0, w, w * 0.2);
  else if (kind === 'round') { x.beginPath(); x.arc(w / 2, w / 2, w / 2, 0, Math.PI * 2); x.clip(); tile(0, 0, w, 0); }
  else if (kind === 'fg') { const s = w * 0.6; tile((w - s) / 2, (w - s) / 2, s, s * 0.12); }
  else {                                   // splash
    const g = x.createLinearGradient(0, 0, w, h); g.addColorStop(0, '#FFFFFF'); g.addColorStop(1, '#DCE6FA'); x.fillStyle = g; x.fillRect(0, 0, w, h);
    const s = Math.min(w, h) * 0.55;
    x.shadowColor = 'rgba(20,50,120,.25)'; x.shadowBlur = s * 0.08; x.shadowOffsetY = s * 0.03;
    x.fillStyle = BG; x.beginPath(); x.roundRect((w - s) / 2, (h - s) / 2, s, s, s * 0.2); x.fill(); x.shadowColor = 'transparent';
    tile((w - s) / 2, (h - s) / 2, s, s * 0.2);
  }
  return c.toDataURL('image/png').split(',')[1];
}, w, h, kind, BG);
const put = async (file, w, h, kind) => fs.writeFileSync(file, Buffer.from(await draw(w, h, kind), 'base64'));

for (const [d, k] of Object.entries(DENS)) {
  const dir = path.join(res, `mipmap-${d}`);
  fs.mkdirSync(dir, { recursive: true });
  const s = Math.round(48 * k), f = Math.round(108 * k);
  await put(path.join(dir, 'ic_launcher.png'), s, s, 'square');
  await put(path.join(dir, 'ic_launcher_round.png'), s, s, 'round');
  await put(path.join(dir, 'ic_launcher_foreground.png'), f, f, 'fg');
}
fs.writeFileSync(path.join(res, 'values', 'ic_launcher_background.xml'), `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${BG}</color>\n</resources>\n`);
await put(path.join(here, 'icon-512.png'), 512, 512, 'square');            // large copy for the update page
fs.mkdirSync(path.join(root, 'src', 'assets'), { recursive: true });
await put(path.join(root, 'src', 'assets', 'logo.png'), 192, 192, 'square'); // the app's own screens
const sizes = JSON.parse(fs.readFileSync(path.join(here, 'splash-sizes.json'), 'utf8'));
for (const [file, w, h] of sizes) await put(path.join(root, file), w, h, 'splash');
await br.close();
console.log('icons, logo and splash written');
