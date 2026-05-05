const express = require('express');
const router  = express.Router();
const path    = require('path');
const fs      = require('fs');

const ROOT = path.join(__dirname, '..');
const dir  = cid => path.join(ROOT, 'Database', 'Companies', cid, 'Passwords');
const file = cid => path.join(dir(cid), 'passwords.json');

const read  = cid => {
  try {
    if (!fs.existsSync(file(cid))) return [];
    return JSON.parse(fs.readFileSync(file(cid), 'utf8')) || [];
  } catch { return []; }
};
const write = (cid, data) => {
  fs.mkdirSync(dir(cid), { recursive: true });
  fs.writeFileSync(file(cid), JSON.stringify(data, null, 2));
};

/* ─────────────────────────────────────────────────────────
   PUPPETEER AUTO-LOGIN
   Opens a real visible browser, fills credentials, submits.
   Browser stays open so user can handle OTP / CAPTCHA.
───────────────────────────────────────────────────────── */

/* Username field selectors — tried in priority order */
const U_SELECTORS = [
  'input[type="email"]',
  'input[autocomplete="username"]',
  'input[autocomplete="email"]',
  'input[name="username"]',  'input[id="username"]',
  'input[name="userId"]',    'input[id="userId"]',
  'input[name="loginid"]',   'input[id="loginid"]',
  'input[name="LoginID"]',
  'input[name="email"]',     'input[id="email"]',
  'input[name="user"]',      'input[id="user"]',
  'input[name="login"]',     'input[id="login"]',
  'input[name="mobile"]',    'input[id="mobile"]',
  'input[name="phone"]',     'input[id="phone"]',
  'input[name="mobileNumber"]',
  'input[name="gstin"]',     'input[id="gstin"]',
  'input[type="text"]:not([type="hidden"])',
];

const SUBMIT_SELECTORS = [
  'button[type="submit"]',
  'input[type="submit"]',
  'button[id*="login" i]',   'button[class*="login" i]',
  'button[id*="signin" i]',  'button[class*="signin" i]',
  'button[id*="submit" i]',  'button[class*="submit" i]',
  'button[id*="next" i]',    'button[class*="next" i]',
  'button[id*="proceed" i]', 'button[class*="proceed" i]',
];

async function findVisible(page, selectors) {
  for (const sel of selectors) {
    try {
      const els = await page.$$(sel);
      for (const el of els) {
        const visible = await page.evaluate(e => {
          const s = window.getComputedStyle(e);
          const r = e.getBoundingClientRect();
          return s.display !== 'none' && s.visibility !== 'hidden' &&
                 s.opacity !== '0' && r.width > 0 && r.height > 0;
        }, el);
        if (visible) return el;
      }
    } catch {}
  }
  return null;
}

async function typeInto(el, text, page) {
  await el.click({ clickCount: 3 });                 // select all existing text
  await el.press('Backspace');
  await el.type(text, { delay: 60 });
}

async function launchAndFill(entry) {
  let puppeteer;
  try { puppeteer = require('puppeteer'); }
  catch { console.error('[Puppeteer] Not installed'); return; }

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: false,
      defaultViewport: null,
      args: [
        '--start-maximized',
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
      ],
      ignoreDefaultArgs: ['--enable-automation'],
    });

    const pages = await browser.pages();
    const page  = pages[0] || await browser.newPage();

    /* Remove automation flag so sites don't block Puppeteer */
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });

    const url = entry.url.startsWith('http') ? entry.url : 'https://' + entry.url;
    console.log(`[Puppeteer] Navigating to ${url}`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

    /* ── Step 1: fill username ── */
    let userFilled = false;
    const userEl = await findVisible(page, U_SELECTORS);
    if (userEl) {
      await typeInto(userEl, entry.username, page);
      userFilled = true;
      console.log('[Puppeteer] Username filled');
    }

    /* ── Step 2: check if password is already visible or need to click Next ── */
    let pwdEl = await findVisible(page, ['input[type="password"]']);

    if (!pwdEl && userFilled) {
      /* Google / GST-style — need to click Next first */
      const nextEl = await findVisible(page, SUBMIT_SELECTORS);
      if (nextEl) {
        await nextEl.click();
        console.log('[Puppeteer] Clicked Next — waiting for password field…');
        try {
          await page.waitForSelector('input[type="password"]', { visible: true, timeout: 10000 });
          pwdEl = await findVisible(page, ['input[type="password"]']);
        } catch {
          console.log('[Puppeteer] Password field did not appear after Next');
        }
      }
    }

    /* ── Step 3: fill password ── */
    if (pwdEl) {
      await typeInto(pwdEl, entry.password, page);
      console.log('[Puppeteer] Password filled');

      /* Short pause so the site registers input */
      await new Promise(r => setTimeout(r, 400));

      /* ── Step 4: submit ── */
      const submitEl = await findVisible(page, SUBMIT_SELECTORS);
      if (submitEl) {
        await submitEl.click();
        console.log('[Puppeteer] Submit clicked');
      } else {
        await pwdEl.press('Enter');
        console.log('[Puppeteer] Enter pressed on password field');
      }
    } else {
      console.log('[Puppeteer] Password field not found — browser left open for manual entry');
    }

    /* Browser stays open — user handles OTP / CAPTCHA / 2FA */
    console.log('[Puppeteer] Browser left open for user interaction');

  } catch (err) {
    console.error('[Puppeteer] Error:', err.message);
    /* Don't close browser on error — user may still see useful state */
  }
}

/* POST /api/passwords/launch — respond immediately, run Puppeteer async */
router.post('/launch', (req, res) => {
  const { companyId, id } = req.body;
  if (!companyId || !id) return res.status(400).json({ error: 'companyId and id required' });

  const passwords = read(companyId);
  const entry = passwords.find(p => p.id === id);
  if (!entry) return res.status(404).json({ error: 'Entry not found' });
  if (!entry.url) return res.status(400).json({ error: 'No login URL saved for this entry' });

  /* Respond immediately — Puppeteer runs in background */
  res.json({ ok: true, message: `Opening browser for ${entry.siteName}…` });

  /* Fire-and-forget */
  launchAndFill(entry).catch(e => console.error('[Puppeteer] Unhandled:', e.message));
});

/* ─────────────────────────────────────────────────────────
   CRUD + AUTOFILL (unchanged)
───────────────────────────────────────────────────────── */

router.get('/autofill', (req, res) => {
  const { companyId, url } = req.query;
  if (!companyId || !url) return res.json(null);
  const passwords = read(companyId);
  let targetHost;
  try { targetHost = new URL(url).hostname.replace(/^www\./, ''); } catch { return res.json(null); }

  const match = passwords.find(p => {
    if (!p.url) return false;
    try {
      const raw = p.url.startsWith('http') ? p.url : 'https://' + p.url;
      const pHost = new URL(raw).hostname.replace(/^www\./, '');
      return targetHost === pHost || targetHost.endsWith('.' + pHost) || pHost.endsWith('.' + targetHost);
    } catch { return false; }
  });

  res.json(match ? { username: match.username, password: match.password, siteName: match.siteName } : null);
});

router.get('/', (req, res) => {
  const { companyId } = req.query;
  if (!companyId) return res.status(400).json({ error: 'companyId required' });
  res.json(read(companyId));
});

router.post('/', (req, res) => {
  const { companyId } = req.query;
  if (!companyId) return res.status(400).json({ error: 'companyId required' });
  const passwords = read(companyId);
  const entry = { id: Date.now().toString(), ...req.body,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  passwords.push(entry);
  write(companyId, passwords);
  res.json(entry);
});

router.put('/:id', (req, res) => {
  const { companyId } = req.query;
  if (!companyId) return res.status(400).json({ error: 'companyId required' });
  const passwords = read(companyId);
  const idx = passwords.findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  passwords[idx] = { ...passwords[idx], ...req.body, updatedAt: new Date().toISOString() };
  write(companyId, passwords);
  res.json(passwords[idx]);
});

router.delete('/:id', (req, res) => {
  const { companyId } = req.query;
  if (!companyId) return res.status(400).json({ error: 'companyId required' });
  const filtered = read(companyId).filter(p => p.id !== req.params.id);
  write(companyId, filtered);
  res.json({ ok: true });
});

module.exports = router;
