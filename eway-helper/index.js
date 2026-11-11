/* Epsilon E-Way Helper — runs on the user's PC.
 *
 *   node index.js --pair <erp address> <code>   pair this PC with your ERP user
 *   node index.js                               run: wait for e-way jobs from the ERP and do them
 *
 * For each job it opens Chrome (or Edge) on this PC, fills the e-way portal user id + password, you type the
 * captcha and click Login, then it opens the right page from the portal's own menu (bulk generation / cancel /
 * print), does the work and sends the result to the ERP, which saves it in the delivery challans.
 * It only talks to the ERP server; nothing calls into this PC. Only one copy runs at a time. */
const fs = require('fs');
const os = require('os');
const net = require('net');
const path = require('path');
const puppeteer = require('puppeteer-core');

const HOME = process.env.EWAY_HELPER_HOME || path.join(process.env.APPDATA || os.homedir(), 'EpsilonEwayHelper');
const CONFIG = path.join(HOME, 'config.json');
const LOG = path.join(HOME, 'helper.log');
const LOCK_PORT = +(process.env.EWAY_HELPER_LOCK_PORT || 47391);   // a second copy cannot bind it → exits
/* server mode: started by the ERP server itself (no PC install). Headless, no window: the captcha is always
   typed in the ERP; a step that needs a person at the portal ends the job with a clear message instead. */
const SERVER_MODE = !!process.env.EWAY_SERVER_MODE;
const ON_SERVER = ' — this needs a person at the portal, which is not possible while it runs on the server.';
fs.mkdirSync(HOME, { recursive: true });
const log = (...a) => { const line = `[${new Date().toLocaleString('en-IN')}] ${a.join(' ')}`; console.log(line); try { fs.appendFileSync(LOG, line + '\n'); } catch { /* ignore */ } };
const readCfg = () => { try { return JSON.parse(fs.readFileSync(CONFIG, 'utf8')); } catch { return {}; } };
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* pages are found from the portal's own menu; an address can be forced with env (tests) */
const PORTAL_BASE = 'https://ewaybillgst.gov.in/';
const URLS = {
  bulk: process.env.EWAY_BULK_URL || PORTAL_BASE + 'BillGeneration/BulkUploadEwayBill.aspx',
  cancel: process.env.EWAY_CANCEL_URL || PORTAL_BASE + 'BillGeneration/Cancel_ewaybill.aspx',
  check: process.env.EWAY_CHECK_URL || PORTAL_BASE + 'BillGeneration/EBPrint.aspx?cal=1',
};
/* only use the built-in portal addresses on the real portal (tests run a mock portal elsewhere) */
const urlFor = (what, page) => (process.env['EWAY_' + what.toUpperCase() + '_URL'] || page.url().startsWith(PORTAL_BASE) ? URLS[what] : null);
const MENU = {
  bulk: { text: /generate\s*bulk|bulk\s*generat|^\s*bulk\s*$/i, ref: /bulk/i },
  cancel: { text: /^\s*cancel(\s*ewb|\s*e-?way\s*bill)?\s*$/i, ref: /cancel/i },
  check: { text: /^\s*(print\s*ewb|ewb\s*print|print|detailed\s*print|print\s*e-?way\s*bill)\s*$/i, ref: /print/i },
};
const SKIP = /consol|reject|irn|einv|transporter|multi|cewb/i;
const REASONS = { 1: /duplicate/i, 2: /order\s*cancel/i, 3: /data\s*entry/i, 4: /other/i };
const WAIT_LOGIN_MS = 5 * 60 * 1000, WAIT_PAGE_MS = 5 * 60 * 1000, WAIT_RESULT_MS = 4 * 60 * 1000;
const isErrorPage = p => /customerror|error\.htm|login\.aspx/i.test(p.url());

async function api(cfg, method, url, body, timeoutMs = 40000) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(cfg.server.replace(/\/+$/, '') + '/api/eway-helper' + url, {
      method, signal: ctl.signal, headers: { 'Content-Type': 'application/json', ...(cfg.token ? { Authorization: 'Bearer ' + cfg.token } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(data.error || `HTTP ${r.status}`); e.status = r.status; throw e; }
    return data;
  } finally { clearTimeout(t); }
}

function findBrowser() {
  const pf = process.env.ProgramFiles || 'C:\\Program Files', pf86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', la = process.env.LOCALAPPDATA || '';
  return [readCfg().browserPath,
    path.join(pf, 'Google\\Chrome\\Application\\chrome.exe'), path.join(pf86, 'Google\\Chrome\\Application\\chrome.exe'), path.join(la, 'Google\\Chrome\\Application\\chrome.exe'),
    path.join(pf86, 'Microsoft\\Edge\\Application\\msedge.exe'), path.join(pf, 'Microsoft\\Edge\\Application\\msedge.exe'),
  ].filter(Boolean).find(p => fs.existsSync(p));
}

/* every frame of every tab — the portal may put its menu / forms inside frames */
async function allFrames(browser) {
  const out = [];
  for (const p of await browser.pages().catch(() => [])) { try { out.push(...p.frames()); } catch { /* closing */ } }
  return out;
}
const safe = (f, ...a) => f.evaluate(...a).catch(() => null);

/* yellow strip at the top of the page telling the user what to do */
async function banner(page, text) {
  await safe(page.mainFrame ? page.mainFrame() : page, t => {
    let b = document.getElementById('__erp_helper_banner');
    if (!b) { b = document.createElement('div'); b.id = '__erp_helper_banner'; b.style.cssText = 'position:fixed;left:0;right:0;top:0;z-index:2147483647;padding:9px 14px;background:#FEF0C7;color:#7A2E0E;font:600 14px Arial;border-bottom:2px solid #F79009;text-align:center'; document.body.appendChild(b); }
    b.textContent = 'ERP E-Way Helper: ' + t;
  }, text);
}

/* close notice pop-ups / modals the portal shows (after login and on pages); JS alerts are accepted elsewhere */
async function dismissPopups(page) {
  let closed = 0;
  for (const f of page.frames()) {
    closed += (await safe(f, () => {
      let n = 0;
      // fixed-position pop-ups have no offsetParent — look at their boxes and style instead
      const vis = e => { if (!e || !e.getClientRects().length) return false; const cs = getComputedStyle(e); return cs.display !== 'none' && cs.visibility !== 'hidden' && cs.opacity !== '0'; };
      const boxes = [...document.querySelectorAll('.modal, .modal-dialog, [role=dialog], .popup, .ui-dialog, .swal2-popup, .bootbox, [id*="popup" i], [id*="Popup"], [class*="popup" i], [id*="modal" i]')].filter(vis);
      boxes.forEach(b => {
        const btn = [...b.querySelectorAll('button, input[type=button], input[type=submit], a, span, .close, [aria-label]')].filter(vis)
          .find(e => /^\s*(close|ok|okay|x|×|✕|skip|later|remind me later|got it|dismiss|continue|proceed)\s*$/i.test(e.innerText || e.value || e.getAttribute('aria-label') || '') || e.classList.contains('close'));
        if (btn && !/cancel/i.test(btn.innerText || btn.value || '')) { btn.click(); n++; }
      });
      document.querySelectorAll('.modal-backdrop').forEach(x => x.remove());
      return n;
    })) || 0;
  }
  if (closed) log('closed', closed, 'pop-up(s)');
  return closed;
}

/* write what the portal's menu looks like into the log once per run (to tune the steps if the portal changes) */
let menuLogged = false;
async function logMenu(page) {
  if (menuLogged) return;
  menuLogged = true;
  const lines = [];
  for (const f of page.frames()) {
    const items = await safe(f, () => [...document.querySelectorAll('a, li, span, div, td, button, input[type=button], input[type=submit]')]
      .filter(e => e.children.length <= 2)
      .map(e => ({ t: (e.innerText || e.value || '').replace(/\s+/g, ' ').trim(), h: e.getAttribute('href') || '', o: (e.getAttribute('onclick') || '').slice(0, 120) }))
      .filter(x => x.t && x.t.length <= 40 && (x.h || x.o))
      .slice(0, 200).map(x => `${x.t} | ${x.h} | ${x.o}`));
    if (items && items.length) lines.push(`[frame ${f.url()}]`, ...items);
  }
  log('portal menu after login:\n  ' + (lines.length ? lines.join('\n  ') : '(no links found)'));
}

/* find the menu item for bulk / cancel / print in any frame; follow its link, or click it (JS menus) */
async function openFromMenu(page, mainUrl, what) {
  const direct = urlFor(what, page);
  if (direct) { try { await page.goto(direct, { waitUntil: 'domcontentloaded', timeout: 30000 }); await dismissPopups(page); if (!isErrorPage(page)) return true; } catch { /* menu */ } }
  if (isErrorPage(page) || page.url() !== mainUrl) await page.goto(mainUrl, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
  await sleep(1500);
  await logMenu(page);
  const m = MENU[what];
  for (const f of page.frames()) {
    const hit = await safe(f, (t, r, sk) => {
      const tx = new RegExp(t, 'i'), rx = new RegExp(r, 'i'), skip = new RegExp(sk, 'i');
      const label = e => (e.innerText || e.value || '').replace(/\s+/g, ' ').trim();
      const ref = e => `${e.getAttribute('href') || ''} ${e.getAttribute('onclick') || ''}`;
      const els = [...document.querySelectorAll('a, li, span, div, td, button, input[type=button]')].filter(e => e.children.length <= 2 && label(e).length <= 40);
      const ok = e => !skip.test(ref(e)) && !skip.test(label(e)) && !skip.test((e.closest('ul') || {}).previousElementSibling?.innerText || '');
      const pick = els.find(e => tx.test(label(e)) && rx.test(ref(e)) && ok(e)) || els.find(e => tx.test(label(e)) && ref(e).trim() && ok(e)) || els.find(e => tx.test(label(e)) && ok(e));
      if (!pick) return null;
      const href = pick.getAttribute('href') || '';
      if (href && !/^(#|javascript:)/i.test(href)) return { href: pick.href };
      pick.click();
      return { clicked: label(pick) };
    }, m.text.source, m.ref.source, SKIP.source);
    if (!hit) continue;
    log('menu item for', what + ':', hit.href || `clicked "${hit.clicked}"`);
    if (hit.href) await page.goto(hit.href, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
    else await sleep(3000);
    if (isErrorPage(page)) { log('that menu item gave an error page'); await page.goto(mainUrl, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {}); return false; }
    return true;
  }
  log('no menu item found for', what);
  return false;
}

/* a box for the e-way bill no. in any frame: fill it and press Go / Submit → that frame */
async function fillEwb(browser, ewbNo) {
  for (const f of await allFrames(browser)) {
    const ok = await safe(f, no => {
      const vis = e => e.offsetParent !== null && !e.disabled && !e.readOnly;
      const boxes = [...document.querySelectorAll('input[type=text], input[type=number], input[type=tel], input[type=search], input:not([type])')].filter(vis);
      const near = e => {   // text written just before the box (its label / cell / previous element)
        const lab = e.id && document.querySelector(`label[for="${e.id}"]`);
        let t = lab ? lab.innerText : '';
        let p = e.previousElementSibling; if (p) t += ' ' + p.innerText;
        const cell = e.closest('td, div, span, p'); if (cell) { const pc = cell.previousElementSibling; if (pc) t += ' ' + pc.innerText; t += ' ' + (cell.innerText || ''); }
        return t;
      };
      const label = /e-?\s*way\s*bill\s*(no|number)|ewb\s*(no|number)/i;
      const box = boxes.find(e => /ewb|eway|e_way|billno/i.test(e.id + ' ' + e.name)) || boxes.find(e => +e.maxLength === 12)
        || boxes.find(e => label.test(near(e))) || (boxes.length === 1 && label.test(document.body.innerText) ? boxes[0] : null);
      if (!box) return false;
      box.focus(); box.value = no; box.dispatchEvent(new Event('input', { bubbles: true })); box.dispatchEvent(new Event('change', { bubbles: true }));
      const go = [...document.querySelectorAll('input[type=submit], input[type=button], button')].filter(vis).find(e => /^\s*(go|submit|search|get|view|show)/i.test(e.value || e.innerText || ''));
      if (go) go.click();
      return true;
    }, ewbNo);
    if (ok) return f;
  }
  return null;
}
const clickText = async (f, re) => !!(await safe(f, src => {
  const rx = new RegExp(src, 'i');
  const el = [...document.querySelectorAll('input[type=submit], input[type=button], button, a')].find(e => e.offsetParent !== null && rx.test(e.value || e.innerText || e.title || ''));
  if (!el) return false; el.click(); return true;
}, re.source));

/* put the typing cursor in a box (the captcha) with a real click, so the user can type straight away */
async function focusField(page, selector) {
  try {
    await page.bringToFront();
    const h = await page.$(selector);
    if (h) { await h.click(); await h.dispose(); }
  } catch { /* the user can click it */ }
}

/* the window is needed: bring it up and tell the user what to do there */
async function needUser(page, text) {
  if (SERVER_MODE) throw new Error(text + ON_SERVER);
  await showWindow(page, 'normal');
  await banner(page, text);
}

/* send a captcha picture to the ERP and wait for what the user types there.
   → { answer } | { refresh: true } | { done: <value from check()> }  (check() lets the wait end early, e.g. the user did it in Chrome) */
async function askCaptcha(cfg, job, img, seq, message, check) {
  const p = await api(cfg, 'POST', `/helper/jobs/${job.id}/progress`, { status: 'captcha', message, captcha: img, captchaSeq: seq }).catch(() => ({}));
  if (p.cancelled) throw new Error('Cancelled in the ERP');
  const t0 = Date.now();
  for (;;) {
    if (Date.now() - t0 > WAIT_LOGIN_MS) throw new Error('The captcha was not typed within 5 minutes');
    const r = await api(cfg, 'GET', `/helper/jobs/${job.id}/captcha?seq=${seq}`).catch(() => ({}));
    if (r.cancelled) throw new Error('Cancelled in the ERP');
    if (r.answer) return { answer: r.answer };
    if (r.refresh) return { refresh: true };
    const d = check ? await check() : null;
    if (d) return { done: d };
    await sleep(900);
  }
}

/* login: fill id + password; the captcha is typed in the ERP (its picture is sent there), else in the Chrome window. */
async function login(cfg, browser, page, job, step) {
  await page.goto(job.portal, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const onLogin = async () => { try { return /login\.aspx/i.test(page.url()) || !!(await page.$('#txt_username')); } catch { return true; } };
  if (!(await onLogin())) return;
  const fill = async again => {
    await safe(page, (u, p) => {
      const a = document.getElementById('txt_username'), b = document.getElementById('txt_password');
      if (a && !a.value) a.value = u; if (b && !b.value) b.value = p;
      const c = document.getElementById('txtCaptcha'); if (c) c.focus();
    }, job.username, job.password);
    await banner(page, again ? 'Type the captcha again and click Login.' : 'User id and password are filled. Type the captcha and click Login.');
  };
  await fill(false);
  await dismissPopups(page);

  // captcha in the ERP
  const loginError = () => safe(page, () => {
    const t = document.body ? document.body.innerText : '';
    return (t.split('\n').find(l => /invalid\s+(user|login|credential|password)|(user\s*name|password).{0,30}(invalid|incorrect|wrong)|account.{0,20}(locked|blocked|disabled)/i.test(l)) || '').trim().slice(0, 200);
  });
  let img = await captchaImage(page);
  for (let i = 0; !img && i < 4; i++) { await sleep(1000); img = await captchaImage(page); }
  if (img) {
    await showWindow(page, 'minimized');
    let seq = 0, note = '';
    while (await onLogin()) {
      seq++;
      const a = await askCaptcha(cfg, job, img, seq, note || 'Type the captcha of the e-way portal login and press Login.', async () => !(await onLogin()));
      if (a.done) break;
      if (a.refresh) {
        const clicked = await safe(page, () => {
          const b = [...document.querySelectorAll('button, a, i, span, img, input[type=image]')].find(e => e.getClientRects().length && /refresh|reload|new\s*captcha/i.test(`${e.id} ${e.className} ${e.title || ''} ${e.getAttribute('alt') || ''} ${e.getAttribute('onclick') || ''}`));
          if (b) { (b.closest('button, a') || b).click(); return true; } return false;
        });
        if (!clicked) await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
        await sleep(1500); await fill(true);
        img = (await captchaImage(page)) || img; note = ''; continue;
      }
      const before = img;
      await fill(true);
      await safe(page, ans => {
        const c = document.getElementById('txtCaptcha'); if (c) c.value = ans;
        const b = document.getElementById('btnLogin'); if (b) b.click();
      }, a.answer);
      await step('login', 'Logging in to the e-way portal…');
      // logged in, wrong user/password, or a new captcha (the last one was wrong)
      const t1 = Date.now(); note = '';
      while (Date.now() - t1 < 25000) {
        await sleep(1000);
        if (!(await onLogin())) break;
        const bad = await loginError();
        if (bad) { await needUser(page, bad); throw new Error(`E-way portal: ${bad} — check the login in the Password Manager.`); }
        const now = await captchaImage(page);
        if (now && now !== before) { img = now; await fill(true); note = 'That captcha was not accepted — type the new one.'; break; }
      }
      if (await onLogin() && !note) { img = (await captchaImage(page)) || img; note = 'Not logged in yet — type the captcha again.'; }
    }
    await sleep(1500);
    await dismissPopups(page); await sleep(1200); await dismissPopups(page);
    return;
  }

  // no captcha picture: the user types it in the Chrome window
  if (SERVER_MODE) throw new Error('The captcha picture of the e-way portal login could not be read. Try again.');
  await showWindow(page, 'normal');
  await focusField(page, '#txtCaptcha');
  await step('login', 'Type the captcha and click Login in the Chrome window that opened.');
  const t0 = Date.now();
  while (await onLogin()) {
    if (Date.now() - t0 > WAIT_LOGIN_MS) throw new Error('Login was not completed within 5 minutes');
    if (browser.process()?.exitCode != null || !browser.connected) throw new Error('The Chrome window was closed');
    await sleep(1000);
    try { if (await page.$('#txt_username') && !(await page.$('#__erp_helper_banner'))) await fill(true); } catch { /* navigating */ }
  }
  await sleep(1500);   // let the menu page finish loading
  await dismissPopups(page); await sleep(1200); await dismissPopups(page);
}

async function runJob(cfg, job) {
  const step = (status, message) => api(cfg, 'POST', `/helper/jobs/${job.id}/progress`, { status, message }).then(r => { if (r.cancelled) throw new Error('Cancelled in the ERP'); }).catch(e => { if (/Cancelled/.test(e.message)) throw e; });
  const exe = findBrowser();
  if (!exe) throw new Error('Chrome or Edge was not found on this PC');
  const tmp = path.join(HOME, `ewb-${job.id}.json`);
  if (job.json) fs.writeFileSync(tmp, JSON.stringify(job.json, null, 2));
  const beat = setInterval(() => api(cfg, 'POST', '/helper/ping', { busy: true }).catch(() => {}), 15000);   // "still here" while busy
  // open Chrome straight on the portal (a blank start page leaves the cursor in the address bar, not in the captcha box)
  // GST search: the captcha is typed in the ERP, so the window opens off the screen and only comes up if the user is needed
  // the captcha is typed in the ERP, so the window opens off the screen and comes up only when the user is needed there
  const place = ['--window-position=-32000,-32000', '--window-size=1280,900'];
  const headless = !!(process.env.EWAY_HEADLESS || SERVER_MODE);
  /* GST search needs no login: every search gets a brand-new, empty Chrome profile (no cookies / session of the last
     search — a reused profile made the next search fail with "The GST search page did not open"); it is deleted afterwards */
  const gstJob = job.kind === 'gst';
  /* kept under HOME, not os.tmpdir(): on a Windows server started from Remote Desktop, TEMP is a per-session folder
     (…\Temp\2) that Windows deletes at log-off while the ERP keeps running → mkdtemp failed with ENOENT */
  const gstRoot = path.join(HOME, 'gst-profiles');
  if (gstJob) fs.mkdirSync(gstRoot, { recursive: true });
  const profile = gstJob ? fs.mkdtempSync(path.join(gstRoot, 'epsilon-gst-')) : path.join(HOME, 'browser-profile');
  const browser = await puppeteer.launch({ executablePath: exe, headless: headless ? 'new' : false, defaultViewport: headless ? { width: 1366, height: 900 } : null,
    args: [...(headless ? [] : place), ...(gstJob ? ['--no-first-run', '--no-default-browser-check'] : []), ...(job.portal ? [job.portal] : [])], userDataDir: profile });
  /* Stop in the ERP (or a newer search) → close this Chrome at once instead of at the next step */
  let cancelWatch = null;
  if (gstJob) cancelWatch = setInterval(() => api(cfg, 'GET', `/helper/jobs/${job.id}/captcha?seq=-1`, null, 5000)
    .then(r => { if (r.cancelled) { log('job', job.id, 'cancelled in the ERP — closing its Chrome'); clearInterval(cancelWatch); browser.close().catch(() => {}); } }).catch(() => {}), 1000);
  try {
    const page = (await browser.pages())[0] || await browser.newPage();
    if (SERVER_MODE) { try { await page.setUserAgent((await browser.userAgent()).replace('HeadlessChrome', 'Chrome')); } catch { /* keep the default */ } }
    browser.on('targetcreated', async t => { const p = await t.page().catch(() => null); if (p) p.on('dialog', d => d.accept().catch(() => {})); });
    page.on('dialog', d => d.accept().catch(() => {}));
    if (job.kind === 'gst') return await gstSearchFlow(cfg, browser, page, job, step);
    await login(cfg, browser, page, job, step);
    log('logged in:', page.url());
    const mainUrl = page.url();
    if (job.kind === 'cancel' || job.kind === 'check') return await ewbStatusFlow(browser, page, job, step, mainUrl);

    // bulk generation page (from the menu, else the user opens it)
    await step('bulk', 'Logged in — opening bulk generation…');
    await openFromMenu(page, mainUrl, 'bulk');
    const findInput = async () => { for (const f of await allFrames(browser)) { const h = await f.$('input[type=file]').catch(() => null); if (h) return { f, h }; } return null; };
    let got = await findInput();
    if (!got) {
      if (isErrorPage(page)) await page.goto(mainUrl, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
      await needUser(page, 'Open e-Waybill → Generate Bulk from the menu.');
      await step('bulk', 'Please open "e-Waybill → Generate Bulk" in the portal menu.');
      const t0 = Date.now();
      while (!(got = await findInput())) { if (Date.now() - t0 > WAIT_PAGE_MS) throw new Error('The bulk generation page was not opened'); await sleep(1500); }
    }
    // upload the JSON, then generate
    await got.h.uploadFile(tmp);
    await step('upload', 'Uploading the JSON…');
    await sleep(800);
    if (!(await clickText(got.f, /upload/))) await needUser(page, 'Click the Upload button.');
    await sleep(4000);
    for (let i = 0; i < 20; i++) { let done = false; for (const f of await allFrames(browser)) if (await clickText(f, /^\s*generate/)) { done = true; break; } if (done) break; await sleep(1500); }
    await step('generate', 'Generating the e-way bills…');

    // read the e-way bill numbers: a table row with the doc no. + a 12-digit number
    const docs = job.docs.map(d => String(d.docNo));
    const found = {};
    const t1 = Date.now();
    while (Object.keys(found).length < docs.length && Date.now() - t1 < WAIT_RESULT_MS) {
      for (const f of await allFrames(browser)) {
        const rows = (await safe(f, () => [...document.querySelectorAll('tr')].map(tr => tr.innerText.replace(/\s+/g, ' ')))) || [];
        rows.forEach(r => docs.forEach(doc => {
          if (found[doc] || !r.includes(doc)) return;
          const no = (r.match(/\b(\d{12})\b/) || [])[1];
          if (!no) return;
          const dts = r.match(/\d{2}\/\d{2}\/\d{4}(?:\s+\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AP]M)?)?/gi) || [];
          found[doc] = { docNo: doc, ewbNo: no, ewbDate: dts[0] || '', validUpto: dts[1] || '' };
        }));
      }
      if (Object.keys(found).length < docs.length) await sleep(2000);
    }
    if (Object.keys(found).length) {
      await step('details', 'Reading the e-way bill details (valid upto, distance)…');
      for (const r of Object.values(found)) {
        try {
          const d = await readEwbDetails(browser, page, mainUrl, r.ewbNo);
          if (d) { if (d.ewbDate) r.ewbDate = d.ewbDate; if (d.validUpto) r.validUpto = d.validUpto; if (d.distanceKm) r.distanceKm = d.distanceKm; }
        } catch { /* keep what the result table gave */ }
      }
    }
    await banner(page, Object.keys(found).length ? `Done — ${Object.keys(found).length} e-way bill(s) sent to the ERP. You can close this window.` : 'No e-way bill number could be read. Check the portal, then close this window.');
    return { results: Object.values(found), error: Object.keys(found).length < docs.length ? `${docs.length - Object.keys(found).length} e-way bill(s) could not be read from the portal.` : '' };
  } finally {
    clearInterval(beat);
    if (cancelWatch) clearInterval(cancelWatch);
    try { fs.unlinkSync(tmp); } catch { /* ignore */ }
    if (gstJob) {   // GST search: nothing to look at afterwards — close Chrome and delete its profile right away
      await browser.close().catch(() => {});
      for (let i = 0; i < 5; i++) { try { fs.rmSync(profile, { recursive: true, force: true }); break; } catch { await sleep(300); } }
      module.exports.lastBrowser = null;
    } else module.exports.lastBrowser = browser;   // stays open to view / print; closed when the next job starts
  }
}

/* e-way bill details from a page's text: generated date-time, valid upto, distance */
const DT = '(\\d{1,2}[\\/-](?:\\d{1,2}|[A-Za-z]{3})[\\/-]\\d{2,4}(?:\\s+\\d{1,2}:\\d{2}(?::\\d{2})?\\s*(?:[AP]M)?)?)';
function detailsOf(t) {
  const g = re => { const m = t.match(re); return m ? m[1].replace(/\s+/g, ' ').trim() : ''; };
  return {
    ewbDate: g(new RegExp('(?:Generated\\s*(?:Date|On)|E-?\\s*Way\\s*Bill\\s*Date|EWB\\s*Date)\\s*(?:&\\s*Time)?\\s*:?\\s*' + DT, 'i')),
    validUpto: g(new RegExp('Valid\\s*(?:Upto|Up\\s*to|Until|Till)\\s*:?\\s*' + DT, 'i')),
    distanceKm: g(/(?:Approx\.?\s*)?Distance\s*(?:\(\s*KM\s*\))?\s*:?\s*(\d+)/i),
  };
}
/* open the print / details page of one e-way bill and read its details (used after generating, and by "check") */
async function readEwbDetails(browser, page, mainUrl, ewbNo) {
  if (!(await openFromMenu(page, mainUrl, 'check'))) return null;
  await sleep(800);
  if (!(await fillEwb(browser, ewbNo))) return null;
  const t0 = Date.now();
  while (Date.now() - t0 < 30000) {
    for (const f of await allFrames(browser)) {
      const t = (await safe(f, () => (document.body ? document.body.innerText : ''))) || '';
      if (t.includes(ewbNo)) { const d = detailsOf(t); if (d.ewbDate || d.validUpto || d.distanceKm) return { ...d, text: t }; }
    }
    await sleep(1500);
  }
  return null;
}

/* After the e-way bill no. is entered on the Cancel page, the portal shows one of:
   - the reason-for-cancellation box  → the e-way bill is still ACTIVE
   - the e-way bill itself, no reason box (or a "cancelled" message / CANCELLED stamp) → it is CANCELLED
   - an error ("invalid / not found") */
async function readCancelPage(browser, ewbNo) {
  const t0 = Date.now();
  while (Date.now() - t0 < 25000) {
    await sleep(1500);
    for (const f of await allFrames(browser)) {
      const r = await safe(f, no => {
        const vis = e => !!e && e.getClientRects().length > 0;
        const txt = document.body ? document.body.innerText : '';
        const reason = [...document.querySelectorAll('select')].filter(vis).find(s => [...s.options].some(o => /duplicate|order\s*cancel|data\s*entry/i.test(o.text)));
        const stamp = [...document.querySelectorAll('img, [style*="background"]')].some(e => /cancel/i.test(`${e.getAttribute('src') || ''} ${e.getAttribute('alt') || ''} ${e.getAttribute('style') || ''} ${e.className || ''} ${e.id || ''}`));
        if (reason) return { state: 'active' };
        // "THIS EWB NO. IS NOT ACTIVE" = it cannot be cancelled any more: validity over, or already cancelled — the Print page tells which
        if (/not\s+active/i.test(txt)) return { state: 'notactive' };
        if (/already\s+(been\s+)?cancel|has been cancel+ed|is\s+cancel+ed|status\s*:?\s*cancel/i.test(txt) || stamp) return { state: 'cancelled' };
        if (/invalid|not\s+found|does\s+not\s+exist|no\s+record|not\s+generated\s+by\s+you|not\s+belong/i.test(txt)) return { state: 'error', msg: (txt.match(/[^\n]*(invalid|not\s+found|does\s+not\s+exist|no\s+record|not\s+generated\s+by\s+you|not\s+belong)[^\n]*/i) || [''])[0].trim().slice(0, 200) };
        // the e-way bill is shown (its details) but no reason box → already cancelled
        const shown = [...document.querySelectorAll('td, span, div, label')].some(e => e.children.length === 0 && (e.innerText || '').includes(no));
        if (shown && /(document\s*(no|date)|gstin\s*of|place\s*of|valid|vehicle|generated)/i.test(txt)) return { state: 'cancelled-shown' };
        return null;
      }, ewbNo);
      if (r) return { ...r, frame: f };
    }
  }
  return { state: 'unknown' };
}

/* Print page of one e-way bill: is the CANCELLED watermark on it? → { cancelled, details } or null (page not read) */
async function readPrintPage(browser, page, mainUrl, ewbNo) {
  if (!(await openFromMenu(page, mainUrl, 'check'))) return null;
  await sleep(800);
  if (!(await fillEwb(browser, ewbNo))) return null;
  const look = f => safe(f, no => {
    const txt = document.body ? document.body.innerText : '';
    if (!txt.includes(no)) return null;
    // the watermark: a picture / background picture with "cancel" in it (also on ::before / ::after),
    // or the word CANCELLED on the bill — buttons / menu items named "cancel" do not count
    const hits = [];
    const bg = (e, p) => { try { const cs = getComputedStyle(e, p); return `${cs.backgroundImage || ''} ${p ? cs.content || '' : ''}`; } catch { return ''; } };
    document.querySelectorAll('*').forEach(e => {
      if (/^(BUTTON|INPUT|A|SCRIPT|STYLE|OPTION|SELECT)$/.test(e.tagName)) return;
      const own = e.tagName === 'IMG' ? `${e.getAttribute('src') || ''} ${e.getAttribute('alt') || ''} ${e.getAttribute('title') || ''}` : '';
      const pics = `${own} ${e.getAttribute('background') || ''} ${bg(e)} ${bg(e, '::before')} ${bg(e, '::after')}`;
      if (/cancel/i.test(pics)) hits.push(`${e.tagName}#${e.id || ''}.${typeof e.className === 'string' ? e.className : ''} ${pics.replace(/\s+/g, ' ').trim().slice(0, 160)}`);
      if (e.tagName === 'text' && /cancel/i.test(e.textContent || '')) hits.push('svg text ' + e.textContent.trim().slice(0, 40));
    });
    const word = /\bCANCELL?ED\b/.test(txt);   // a text watermark is in capitals
    return { cancelled: hits.length > 0 || word, hits, word, text: txt,
      imgs: [...document.images].map(i => (i.getAttribute('src') || '').slice(0, 120)).filter(Boolean).slice(0, 40), html: document.documentElement.outerHTML };
  }, ewbNo);
  const t0 = Date.now();
  let seen = null;
  while (Date.now() - t0 < 30000) {
    for (const f of await allFrames(browser)) {
      const r = await look(f);
      if (!r) continue;
      seen = { r, f };
      // the bill itself is on the page (its dates / validity), not just the number: give its pictures a moment, look again
      const d = detailsOf(r.text);
      if (r.cancelled || d.ewbDate || d.validUpto) {
        await sleep(2000);
        const r2 = (await look(f)) || r;
        savePrint(ewbNo, r2);
        return { cancelled: r2.cancelled, details: detailsOf(r2.text) };
      }
    }
    await sleep(1500);
  }
  if (seen) savePrint(ewbNo, seen.r);
  return null;
}
/* keep what the print page showed (helper folder) — to see how the portal marks a cancelled bill */
function savePrint(ewbNo, r) {
  try {
    fs.writeFileSync(path.join(HOME, 'last-print.html'), r.html || '');
    log(`print page of ${ewbNo}: cancelled=${r.cancelled} word=${r.word} marks=${JSON.stringify(r.hits || [])} images=${JSON.stringify(r.imgs || [])}`);
  } catch { /* only for checking */ }
}

/* the cancel page said the e-way bill is not active (or showed it without the reason box):
   the Print page decides — CANCELLED watermark → cancelled, no watermark → its validity is over */
async function printVerdict(browser, page, job, step, mainUrl, state) {
  await step(job.kind === 'cancel' ? 'cancel' : 'check', `E-way bill ${job.ewbNo} is not active — checking its print for the CANCELLED mark…`);
  let p = null;
  try { p = await readPrintPage(browser, page, mainUrl, job.ewbNo); } catch { /* not read */ }
  log('print page says:', p ? (p.cancelled ? 'cancelled' : 'no cancel mark') : 'not read');
  if (p && p.cancelled) return { results: [{ ewbNo: job.ewbNo, status: 'cancelled', details: p.details }], error: '' };
  if (p && state === 'notactive') return { results: [{ ewbNo: job.ewbNo, status: 'expired', details: p.details }], error: '' };
  return { results: [{ ewbNo: job.ewbNo, status: 'unknown' }], error: state === 'notactive'
    ? 'The portal says this e-way bill is not active, but its print page could not be read to tell cancelled from expired.'
    : 'The cancel page showed the e-way bill without the reason box, but its print page shows no CANCELLED mark.' };
}

/* cancel: Cancel page → no. → reason + remarks → Cancel → outcome.
   check:  Cancel page → no. → reason box means active (then read details from Print), no reason box means cancelled.
           Nothing is ever cancelled by a check. */
async function ewbStatusFlow(browser, page, job, step, mainUrl) {
  const cancel = job.kind === 'cancel';
  await step(cancel ? 'cancel' : 'check', cancel ? `Opening the cancel page for e-way bill ${job.ewbNo}…` : `Checking e-way bill ${job.ewbNo} on the portal…`);
  let work = null;
  if (await openFromMenu(page, mainUrl, 'cancel')) { await sleep(800); work = await fillEwb(browser, job.ewbNo); }
  if (!work) {
    if (isErrorPage(page)) await page.goto(mainUrl, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
    const ask = `Open "e-Waybill → Cancel" from the menu — the helper fills ${job.ewbNo}.`;
    await needUser(page, ask); await step(cancel ? 'cancel' : 'check', ask);
    const t0 = Date.now();
    while (!(work = await fillEwb(browser, job.ewbNo))) { if (Date.now() - t0 > WAIT_PAGE_MS) throw new Error('The page was not opened'); await sleep(1500); }
  }
  const seen = await readCancelPage(browser, job.ewbNo);
  log('cancel page says:', seen.state, seen.msg || '');
  if (seen.state === 'error') return { results: [{ ewbNo: job.ewbNo, status: 'unknown', message: seen.msg }], error: seen.msg || 'The portal did not accept this e-way bill no.' };
  if (seen.state === 'notactive' || seen.state === 'cancelled' || seen.state === 'cancelled-shown') return await printVerdict(browser, page, job, step, mainUrl, seen.state);
  if (seen.state === 'unknown') return { results: [{ ewbNo: job.ewbNo, status: 'unknown' }], error: 'The cancel page did not show the e-way bill or the reason box.' };

  // the e-way bill is active
  if (!cancel) {
    await step('check', 'Active — reading its details (valid upto, distance)…');
    let details = {};
    try { const d = await readEwbDetails(browser, page, mainUrl, job.ewbNo); if (d) { const { text, ...rest } = d; details = rest; } } catch { /* status is what matters */ }
    await banner(page, `E-way bill ${job.ewbNo} is ACTIVE on the portal — sent to the ERP. You can close this window.`);
    return { results: [{ ewbNo: job.ewbNo, status: 'active', details }], error: '' };
  }

  // cancel it: reason + remarks, then the Cancel button (a button, not a menu link)
  const frame = seen.frame || work;
  await safe(frame, (re, remarks) => {
    const rx = new RegExp(re, 'i');
    const sel = [...document.querySelectorAll('select')].find(s => [...s.options].some(o => /duplicate|order\s*cancel|data\s*entry/i.test(o.text)));
    if (sel) { const o = [...sel.options].find(x => rx.test(x.text)) || [...sel.options].find(x => /other/i.test(x.text)); if (o) { sel.value = o.value; sel.dispatchEvent(new Event('change', { bubbles: true })); } }
    const rm = [...document.querySelectorAll('textarea, input[type=text]')].find(e => /remark/i.test(e.id + ' ' + e.name));
    if (rm) { rm.value = remarks || 'Cancelled'; rm.dispatchEvent(new Event('input', { bubbles: true })); }
  }, (REASONS[job.reason] || REASONS[4]).source, job.remarks || '');
  await sleep(800);
  const clicked = await safe(frame, () => {
    const b = [...document.querySelectorAll('input[type=submit], input[type=button], button')].find(e => e.getClientRects().length && /cancel/i.test(e.value || e.innerText || '') && !/^\s*(close|exit)/i.test(e.value || e.innerText || ''));
    if (b) { b.click(); return true; } return false;
  });
  if (!clicked) { await needUser(page, 'Choose the reason and click the Cancel button — the helper is watching for the result.'); await step('cancel', 'Choose the reason and click Cancel on the portal page.'); }
  const t1 = Date.now();
  while (Date.now() - t1 < WAIT_RESULT_MS) {
    for (const f of await allFrames(browser)) {
      const t = (await safe(f, () => (document.body ? document.body.innerText : ''))) || '';
      if (/cancel+ed\s+success|success\w*\s+cancel|has been cancel+ed|already\s+cancel/i.test(t)) {
        await banner(page, `E-way bill ${job.ewbNo} is cancelled — sent to the ERP. You can close this window.`);
        return { results: [{ ewbNo: job.ewbNo, status: 'cancelled' }], error: '' };
      }
      if (/cannot be cancel|can not be cancel|not eligible|beyond 24|24 hours/i.test(t)) {
        await banner(page, 'The portal does not allow this cancel.');
        return { results: [{ ewbNo: job.ewbNo, status: 'active', message: (t.match(/[^\n]*(cannot be cancel|can not be cancel|not eligible|24 hours)[^\n]*/i) || [''])[0].trim().slice(0, 200) }], error: '' };
      }
    }
    await sleep(2000);
  }
  // no clear message: look at the cancel page again for this no.
  const again = await (async () => { if (await openFromMenu(page, mainUrl, 'cancel') && await fillEwb(browser, job.ewbNo)) return readCancelPage(browser, job.ewbNo); return { state: 'unknown' }; })();
  if (['notactive', 'cancelled', 'cancelled-shown'].includes(again.state)) return await printVerdict(browser, page, job, step, mainUrl, again.state);
  if (again.state === 'active') return { results: [{ ewbNo: job.ewbNo, status: 'active' }], error: 'The cancel was not completed on the portal.' };
  return { results: [{ ewbNo: job.ewbNo, status: 'unknown' }], error: 'No clear answer was read from the portal within 4 minutes.' };
}

/* GST taxpayer search (public page, no login): open it, fill the GSTIN, close notices, the user types the captcha
   and clicks Search, then the details shown are read and sent to the ERP form. */
const GST_LABELS = {
  legalName: /^\s*legal\s+name\s+of\s+business/i,
  tradeName: /^\s*trade\s+name/i,
  regDate: /^\s*(effective\s+)?date\s+of\s+registration/i,
  constitution: /^\s*constitution\s+of\s+business/i,
  status: /^\s*gstin\s*\/?\s*(uin)?\s*status/i,
  taxpayerType: /^\s*taxpayer\s+type/i,
  address: /^\s*principal\s+place\s+of\s+business/i,
  jurisdiction: /^\s*administrative\s+office/i,
  natureOfBusiness: /^\s*nature\s+of\s+business\s+activit/i,
};
function gstDetailsOf(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const isLabel = l => Object.values(GST_LABELS).some(r => r.test(l)) || /^\s*(whether|nature\s+of\s+core|other\s+office|additional\s+place|state\s+jurisdiction|centre\s+jurisdiction)/i.test(l);
  const out = {};
  for (const [k, re] of Object.entries(GST_LABELS)) {
    const i = lines.findIndex(l => re.test(l));
    if (i < 0) continue;
    const rest = lines[i].replace(re, '').replace(/^[^:\t]*?[:\t]\s*/, '').replace(/^\s*[-:]\s*/, '').trim();
    let v = rest && !isLabel(rest) && rest.length > 1 ? rest : '';
    if (!v) { const nx = lines[i + 1]; if (nx && !isLabel(nx)) v = nx; }
    // administrative office: keep its first lines (state / division / range)
    if (k === 'jurisdiction' && v) v = lines.slice(i + 1, i + 4).filter(l => !isLabel(l)).join(', ');
    if (v) out[k] = v;
  }
  return out;
}
async function gstSearchFlow(cfg, browser, page, job, step) {
  await step('gst', `Opening the GST portal search for ${job.gstin}…`);
  if (!page.url().startsWith(job.portal)) await page.goto(job.portal, { waitUntil: 'domcontentloaded', timeout: 60000 });   // Chrome was opened on it
  const closeNotices = async () => { await dismissPopups(page); await page.keyboard.press('Escape').catch(() => {}); };
  const fill = () => safe(page, g => {
    const vis = e => !!e && e.getClientRects().length > 0 && !e.disabled;
    const ins = [...document.querySelectorAll('input')].filter(vis);
    const box = document.getElementById('for_gstin') || ins.find(e => /gstin|uin/i.test(`${e.id} ${e.name} ${e.placeholder} ${e.getAttribute('aria-label') || ''}`));
    if (!vis(box)) return false;
    if (box.value !== g) {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(box, g);
      ['input', 'change', 'keyup', 'blur'].forEach(t => box.dispatchEvent(new Event(t, { bubbles: true })));
    }
    const cap = document.getElementById('fo-captcha') || ins.find(e => /captcha|characters/i.test(`${e.id} ${e.name} ${e.placeholder}`));
    if (cap && !cap.value && document.activeElement !== cap) cap.focus();
    return true;
  }, job.gstin);
  /* the GST portal's firewall answers "The requested URL was rejected" when it gets too many searches in a short time
     (it clears by itself after a few minutes) — say so at once instead of waiting a minute for a search box that never comes */
  const rejected = () => safe(page, () => /requested\s+url\s+was\s+rejected|request\s+rejected/i.test(`${document.title} ${document.body ? document.body.innerText : ''}`));
  let t0 = Date.now();
  while (!(await fill())) {
    if (!browser.connected) throw new Error('Cancelled in the ERP');
    if (await rejected()) { log('GST portal rejected the request (portal firewall)'); throw new Error('The GST portal is blocking searches for a few minutes (too many searches in a short time). Wait 2 – 3 minutes, then search again.'); }
    if (Date.now() - t0 > 60000) throw new Error('The GST search page did not open');
    await closeNotices(); await sleep(400);
  }
  await sleep(400); await closeNotices(); await fill();
  await focusField(page, CAPTCHA_BOX);
  await banner(page, `GSTIN ${job.gstin} is filled. Type the captcha in the ERP (or here) and search.`);

  // the result on the page: details → done, "not found" → error
  const result = async () => {
    for (const f of await allFrames(browser)) {
      const t = (await safe(f, () => (document.body ? document.body.innerText : ''))) || '';
      if (/legal\s+name\s+of\s+business/i.test(t)) {
        await sleep(300);
        const d = gstDetailsOf((await safe(f, () => document.body.innerText)) || t);
        if (d.legalName) {
          log('GST details read for', job.gstin + ':', d.legalName, '|', d.status || '');
          await browser.close().catch(() => {});   // the details are shown in the ERP now
          return { results: [], gst: { gstin: job.gstin, ...d }, error: '' };
        }
      }
      const bad = t.split('\n').find(l => /no\s+records?\s+found|gstin.{0,40}(invalid|not\s+valid|does\s+not\s+exist|not\s+found)|(invalid|not\s+a\s+valid).{0,20}gstin/i.test(l) && !/captcha|letters|characters/i.test(l));
      if (bad) { await showWindow(page, 'normal'); await banner(page, 'The GST portal did not find this GSTIN.'); return { results: [], gst: null, error: `GST portal: ${bad.trim().slice(0, 200)}` }; }
    }
    return null;
  };
  const alive = () => { if (browser.process()?.exitCode != null || !browser.connected) throw new Error('The Chrome window was closed'); };

  /* the captcha picture goes to the ERP; the user reads it and types it there; it is filled in here and Search is clicked.
     If no picture can be taken, the user types it in this window as before. */
  let img = await captchaImage(page);
  if (img) await showWindow(page, 'minimized');
  else if (SERVER_MODE) {   // no window to type in: wait a little for the picture, else give up
    for (let i = 0; !img && i < 10; i++) { await dismissPopups(page).catch(() => {}); await sleep(1500); img = await captchaImage(page); }
    if (!img) throw new Error('The captcha picture of the GST portal could not be read. Try again.');
  }
  else { await showWindow(page, 'normal'); await focusField(page, CAPTCHA_BOX); await step('gst', 'Type the captcha and click Search in the Chrome window that opened.'); }
  let seq = 0, note = '';
  t0 = Date.now();
  while (Date.now() - t0 < WAIT_LOGIN_MS) {
    alive();
    const r0 = await result(); if (r0) return r0;
    if (!img) { await dismissPopups(page).catch(() => {}); await sleep(600); img = await captchaImage(page); if (img) await showWindow(page, 'minimized'); continue; }
    seq++;
    const p = await api(cfg, 'POST', `/helper/jobs/${job.id}/progress`, { status: 'captcha', message: note || 'Type the captcha shown here and press Search.', captcha: img, captchaSeq: seq }).catch(() => ({}));
    if (p.cancelled) throw new Error('Cancelled in the ERP');
    // wait for the user's answer from the ERP (or for them to search in the Chrome window)
    let ans = null;
    while (!ans) {
      if (Date.now() - t0 > WAIT_LOGIN_MS) throw new Error('The search was not completed within 5 minutes');
      alive();
      const r = await api(cfg, 'GET', `/helper/jobs/${job.id}/captcha?seq=${seq}`).catch(() => ({}));
      if (r.cancelled) throw new Error('Cancelled in the ERP');
      if (r.answer || r.refresh) { ans = r; break; }
      const rr = await result(); if (rr) return rr;
      await sleep(300);
    }
    if (ans.refresh) {
      await safe(page, () => {
        const b = [...document.querySelectorAll('button, a, i, span, img')].find(e => e.getClientRects().length && /refresh|reload/i.test(`${e.id} ${e.className} ${e.title || ''} ${e.getAttribute('aria-label') || ''}`));
        if (b) (b.closest('button, a') || b).click();
      });
      await sleep(800); note = ''; img = await captchaImage(page) || img; continue;
    }
    const before = img;
    await safe(page, (sel, a) => {
      const cap = document.querySelector(sel);
      if (cap) {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(cap, a);
        ['input', 'change', 'keyup', 'blur'].forEach(t => cap.dispatchEvent(new Event(t, { bubbles: true })));
      }
      const go = document.getElementById('lotsearch') || [...document.querySelectorAll('button, input[type=submit], input[type=button]')].find(e => e.getClientRects().length && /^\s*search\s*$/i.test(e.innerText || e.value || ''));
      if (go) go.click();
    }, CAPTCHA_BOX, ans.answer);
    await step('gst', 'Searching on the GST portal…');
    // details, "not found", or a new captcha picture (the last one was wrong)
    const t1 = Date.now();
    note = '';
    while (Date.now() - t1 < 20000) {
      alive();
      const r = await result(); if (r) return r;
      const wrong = await safe(page, () => /valid\s+letters|invalid\s+captcha|captcha.{0,20}(invalid|incorrect|wrong|not\s+match)/i.test(document.body ? document.body.innerText : ''));
      const now = await captchaImage(page);
      if (wrong || (now && now !== before)) { img = now || img; note = 'That captcha was not accepted — type the new one.'; break; }
      await sleep(300);
    }
    if (!note) { img = await captchaImage(page) || img; note = 'No answer from the portal — type the captcha again.'; }
  }
  throw new Error('The search was not completed within 5 minutes');
}

/* the GST captcha: the box to type in, and its picture as a data URL (from the page's own image — no new captcha is loaded) */
const CAPTCHA_BOX = '#fo-captcha, input[id*="captcha" i], input[name*="captcha" i], input[placeholder*="characters" i]';
async function captchaImage(page) {
  const got = await safe(page, () => {
    const vis = e => !!e && e.getClientRects().length > 0;
    const el = document.getElementById('imgCaptcha') || [...document.querySelectorAll('img, canvas')].filter(vis)
      .find(e => /captcha/i.test(`${e.id} ${e.className} ${e.getAttribute('src') || ''} ${e.getAttribute('alt') || ''} ${e.getAttribute('name') || ''}`));
    if (!vis(el)) return null;
    try {
      if (el.tagName === 'CANVAS') return { url: el.toDataURL('image/png') };
      if (!el.complete || !el.naturalWidth) return null;
      const c = document.createElement('canvas'); c.width = el.naturalWidth; c.height = el.naturalHeight;
      c.getContext('2d').drawImage(el, 0, 0);
      return { url: c.toDataURL('image/png') };
    } catch { return { shot: true }; }   // picture from another site: take a screenshot of it instead
  });
  if (!got) return null;
  if (got.url) return got.url.length < 400000 ? got.url : null;
  try {
    const h = await page.$('#imgCaptcha, img[id*="captcha" i], img[src*="captcha" i]');
    if (!h) return null;
    const b64 = await Promise.race([h.screenshot({ encoding: 'base64' }), sleep(5000).then(() => null)]);
    return b64 ? 'data:image/png;base64,' + b64 : null;
  } catch { return null; }
}
/* minimise / restore the Chrome window (the captcha is typed in the ERP, the window is not needed meanwhile) */
async function showWindow(page, state) {
  if (process.env.EWAY_HEADLESS) return;
  try {
    const s = await page.target().createCDPSession();
    const { windowId } = await s.send('Browser.getWindowForTarget');
    if (state === 'normal') {   // bring it onto the screen (it may have been opened off the screen) and maximise it
      await s.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'normal' } });
      await s.send('Browser.setWindowBounds', { windowId, bounds: { left: 40, top: 40, width: 1280, height: 900 } });
      await s.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'maximized' } });
      await page.bringToFront().catch(() => {});
    } else await s.send('Browser.setWindowBounds', { windowId, bounds: { windowState: state } });
    await s.detach();
  } catch { /* leave it as it is */ }
}

/* one copy only: hold a local port; a second start just exits */
const singleInstance = () => new Promise(res => {
  const s = net.createServer(); s.once('error', () => res(false)); s.listen(LOCK_PORT, '127.0.0.1', () => res(true));
});

async function loop() {
  const cfg = readCfg();
  if (!cfg.server || !cfg.token) { log('Not paired yet. Run: node index.js --pair <ERP address> <code>'); process.exit(1); }
  if (!(await singleInstance())) { log('The E-Way Helper is already running on this PC.'); process.exit(0); }
  log('E-Way Helper running for', cfg.user || 'ERP user', '— waiting for jobs from', cfg.server);
  for (;;) {
    try {
      const { job } = await api(cfg, 'GET', '/helper/next', null, 35000);
      if (!job) continue;
      log('job', job.id, job.kind || 'generate', '—', job.kind === 'gst' ? job.gstin : job.kind && job.kind !== 'generate' ? job.ewbNo : `${job.docs.length} e-way bill(s)`);
      try { await module.exports.lastBrowser?.close(); } catch { /* already closed */ }
      menuLogged = false;
      let out;
      try { out = await runJob(cfg, job); } catch (e) { out = { results: [], error: e.message }; log('job failed:', e.message); }
      await api(cfg, 'POST', `/helper/jobs/${job.id}/result`, out).catch(e => log('could not send the result:', e.message));
      // all done → close the (hidden) window; something went wrong → show it so the user can see the portal
      try {
        const b = module.exports.lastBrowser;
        if (b && b.connected) {
          if (out.error && !SERVER_MODE) { const p = (await b.pages())[0]; if (p) await showWindow(p, 'normal'); }
          else await b.close();   // on the server nobody can look at it
        }
      } catch { /* already closed */ }
      log('job', job.id, 'done:', out.results.length, 'read', out.error || '');
    } catch (e) {
      if (e.status === 401) { log('This PC is no longer paired:', e.message); process.exit(1); }
      if (e.name !== 'AbortError') { log('server not reachable:', e.message); await sleep(10000); }
    }
  }
}

async function pair(server, code) {
  if (!server || !code) { console.log('Usage: node index.js --pair <ERP address, e.g. http://192.168.1.10:5000> <code>'); process.exit(1); }
  const srv = /^https?:\/\//i.test(server) ? server : `http://${server}`;
  const r = await api({ server: srv }, 'POST', '/pair/finish', { code, machine: os.hostname() });
  fs.writeFileSync(CONFIG, JSON.stringify({ ...readCfg(), server: srv, token: r.token, user: r.user, pairedAt: new Date().toISOString() }, null, 2));
  log(`Paired with ${srv} for ${r.user}.`);
}

module.exports = { runJob };
if (require.main === module) {
  const a = process.argv.slice(2);
  (a[0] === '--pair' ? pair(a[1], a[2]) : loop()).catch(e => { log('error:', e.message); process.exit(1); });
}
