const express    = require('express');
const compression = require('compression');
const cors       = require('cors');
const path       = require('path');
const http       = require('http');
const { Server } = require('socket.io');
require('dotenv').config();
require('./api/multerGuard');                 // uploads may not name another company than the login's
try { require('./api/splitCompanyData').run(); }   // once: shared users / mail settings / notifications → each company's folder
catch (e) { console.error('[company data] move into company folders stopped:', e.message); }

const app  = express();
const PORT = process.env.PORT || 5000;

// ── Speed check: every /api answer says how long the server itself took (Server-Timing header, visible in the
// browser's Network tab), slow ones are logged, and a stalled server (blocked event loop) is logged too —
// so a slow page can be told apart: server slow vs. the internet path between home and the office.
app.use('/api', (req, res, next) => {
  const t0 = process.hrtime.bigint();
  const writeHead = res.writeHead;
  res.writeHead = function (...a) {
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    try { res.setHeader('Server-Timing', `app;dur=${ms.toFixed(1)}`); } catch { /* headers gone */ }
    if (ms > 1000) console.log(`[slow] ${req.method} ${req.originalUrl.split('?')[0]} ${Math.round(ms)}ms`);
    return writeHead.apply(this, a);
  };
  next();
});
{
  const { monitorEventLoopDelay } = require('perf_hooks');
  const h = monitorEventLoopDelay({ resolution: 50 }); h.enable();
  setInterval(() => {
    const max = h.max / 1e6;
    if (max > 500) console.log(`[stall] server was blocked up to ${Math.round(max)}ms in the last 10s`);
    h.reset();
  }, 10000).unref();
}

// ── Middleware ──
// level 4 keeps ~88% of the size win at ~25% less CPU than the default (6),
// which matters here because the server is a single blocking Node process.
app.use(compression({ level: 4, threshold: 1024 }));
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
/* server update in progress (server-update.cmd makes the file .updating and removes it when the new ERP is up):
   everyone sees the "updating" page and the screens get a short answer, instead of a broken or closed site.
   /__alive always answers — the update script uses it to check the ERP has started. */
const UPDATING_FLAG = path.join(__dirname, '.updating');
app.get('/__alive', (_req, res) => { res.setHeader('Cache-Control', 'no-store'); res.type('text').send('ok'); });
app.use((req, res, next) => {
  if (!require('fs').existsSync(UPDATING_FLAG)) return next();
  if (req.path.startsWith('/app/android')) return next();
  res.setHeader('Cache-Control', 'no-store'); res.setHeader('Retry-After', '10');
  if (req.path.startsWith('/api/')) return res.status(503).json({ error: 'Super ERP System is being updated — it is back in a minute or two.' });
  return res.status(503).type('html').send(UPDATING_PAGE);
});
app.use(express.static(path.join(__dirname, 'frontend', 'build'), {
  maxAge: '1y',              // hashed bundle filenames — safe to cache hard
  setHeaders: (res, fp) => {
    if (fp.endsWith('index.html')) res.setHeader('Cache-Control', 'no-cache');
  },
}));

// Normalize companyId — prevents duplicate query params sending an array
app.use((req, _res, next) => {
  if (Array.isArray(req.query.companyId)) req.query.companyId = req.query.companyId[0];
  next();
});

// ── SQLite read index — built from the JSON tree, kept current by a watcher ──
const sqlite = require('./api/sqlite');
sqlite.reindexAll();
sqlite.startWatcher();

// ── Every /api address needs a signed-in user (except login, vendor portal and the E-Way Helper) ──
app.use('/api', require('./api/requireLogin').requireLogin);

// ── Auth routes (no token required — public) ──
app.use('/api/auth', require('./api/auth').router);

// ── API routes ──
app.use('/api/clients',           require('./api/clients'));
app.use('/api/vendors',           require('./api/vendors'));
app.use('/api/hr',                require('./api/hr'));
app.use('/api/items',             require('./api/items'));
app.use('/api/sales-orders',      require('./api/salesOrders'));
app.use('/api/purchase-orders',   require('./api/purchaseOrders'));
app.use('/api/companies',         require('./api/companies'));
app.use('/api/accounts',          require('./api/accounts'));
app.use('/api/tally',             require('./api/tally'));
app.use('/api/tally-reports',     require('./api/tallyReports'));   // read-only Balance Sheet / P&L from Tally
app.use('/api/manufacturing',     require('./api/manufacturing'));
app.use('/api/stock',             require('./api/stock'));
app.use('/api/projects',          require('./api/projects'));
app.use('/api/bills',             require('./api/bills'));
app.use('/api/proforma-invoices', require('./api/proformaInvoices'));
app.use('/api/delivery-challans', require('./api/deliveryChallans'));
app.use('/api/grn',               require('./api/grn'));
app.use('/api/returns',           require('./api/returns'));
app.use('/api/print-merge',       require('./api/printMerge'));     // bill + DC (or any documents) as one PDF
app.use('/api/office',            require('./api/office'));
app.use('/api/whatsapp',          require('./api/whatsapp'));       // each user's own WhatsApp (linked once, kept on the server)         // Office Suite: letters (Word) and sheets (Excel) kept with an order
app.use('/api/mail',              require('./api/mail'));           // e-mail a printed document (PDF) with To / CC and files
app.use('/api/sign',              require('./api/signing'));        // my signature + who signed a document (prepared / reviewed / approved)
app.use('/api/warranty-certs',    require('./api/warrantyCerts'));   // Warranty Certificates
app.use('/api/completion-certs',  require('./api/completionCerts')); // Completion Certificates
app.use('/api/insurance',         require('./api/insurance'));       // Insurance policies + claims
app.use('/api/raw-materials',     require('./api/rawMaterials'));   // Raw Material master (manufacturing)   // Return Note (client) / Return to Vendor
app.use('/api/production',        require('./api/production'));    // BOM, material issue / return, QC, job cost
app.use('/api/gdn',               require('./api/gdn'));
app.use('/api/passwords',         require('./api/passwords'));
app.use('/api/bank-ifsc',         require('./api/bankIfsc'));   // IFSC → bank, branch, address (read from ifsc.bankifsccode.com)
app.use('/api/eway-helper',       require('./api/ewayHelper'));   // pairs the E-Way Helper on user PCs and hands it e-way jobs
app.use('/api/gst-portal',        require('./api/gstPortal'));    // GSTR-1 / GSTR-2B as downloaded from the GST portal
app.use('/api/crm',               require('./api/crm'));
app.use('/api/deposits',          require('./api/deposits'));
app.use('/api/approvals',         require('./api/approvals'));
app.use('/api/notifications',     require('./api/notifications').router);
app.use('/api/ledger',            require('./api/ledger'));
app.use('/api/books',             require('./api/books'));
app.use('/api/communication',     require('./api/communication').router);
app.use('/api/financial-docs',    require('./api/financial-docs'));
app.use('/api/chat',              require('./api/chat'));
app.use('/api/ai',                require('./api/ai'));

// ── Vendor Portal ──
app.use('/api/vendor-portal', require('./api/vendor-portal').router);

// ── SAP MODE ──
app.use('/api/sap/projects',          require('./api/sap/projects'));
app.use('/api/sap/sales-orders',      require('./api/sap/salesOrders'));
app.use('/api/sap/purchase-orders',   require('./api/sap/purchaseOrders'));
app.use('/api/sap/grn',               require('./api/sap/grn'));
app.use('/api/sap/mrp',               require('./api/sap/mrp'));
app.use('/api/sap/production',        require('./api/sap/production'));
app.use('/api/sap/finance',           require('./api/sap/finance'));
app.use('/api/sap/tasks',             require('./api/sap/tasks'));

// Serve React app for all non-API routes
/* the Android app: download (super-erp.apk) and update check (version.json) — files in mobile/release */
app.use('/app/android', express.static(path.join(__dirname, 'mobile', 'release'), {
  setHeaders: (res, fp) => { if (fp.endsWith('.apk')) res.setHeader('Content-Type', 'application/vnd.android.package-archive'); res.setHeader('Cache-Control', 'no-store'); },
}));

/* the website is (re)built while the server runs (server update): until build/index.html is back, a short
   "being updated" page that checks again by itself — never a raw file error */
const UPDATING_PAGE = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Super ERP System — updating</title><noscript><meta http-equiv="refresh" content="15"></noscript>
<style>
*{box-sizing:border-box}
html,body{height:100%}
body{margin:0;overflow:hidden;color:#1E1E1E;font:14px/1.45 "Segoe UI",Tahoma,Inter,Arial,sans-serif;
  background:radial-gradient(ellipse 120% 90% at 50% 30%,#3C8FD6 0%,#1D64B0 30%,#0F427F 62%,#07234A 100%)}
/* moving light ribbons, like the Windows 7 wallpaper */
.sky{position:fixed;inset:0;overflow:hidden;pointer-events:none}
.sky i{position:absolute;left:-30%;width:160%;height:46%;border-radius:50%;filter:blur(28px);opacity:.55;mix-blend-mode:screen;animation:drift 18s ease-in-out infinite alternate}
.sky i:nth-child(1){top:8%;background:radial-gradient(ellipse at 40% 50%,rgba(140,215,255,.55),transparent 62%);transform:rotate(-8deg)}
.sky i:nth-child(2){top:46%;background:radial-gradient(ellipse at 60% 50%,rgba(90,190,255,.40),transparent 60%);transform:rotate(6deg);animation-duration:24s}
.sky i:nth-child(3){top:62%;background:radial-gradient(ellipse at 30% 50%,rgba(170,240,255,.28),transparent 58%);transform:rotate(-4deg);animation-duration:30s}
@keyframes drift{0%{translate:-6% 0}100%{translate:6% -3%}}
.sky b{position:absolute;inset:0;background:radial-gradient(ellipse 80% 70% at 50% 45%,transparent 55%,rgba(0,10,30,.55) 100%)}
.wrap{position:relative;z-index:1;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:16px 16px 64px}
/* ring of glowing dots */
.sp{position:relative;width:58px;height:58px;margin:0 0 18px}
.sp i{position:absolute;left:25px;top:0;width:8px;height:8px;border-radius:50%;background:#fff;box-shadow:0 0 6px rgba(255,255,255,.9);transform-origin:4px 29px;opacity:.1;animation:dot 1.6s linear infinite}
.sp i:nth-child(1){rotate:0deg;animation-delay:-1.4s}.sp i:nth-child(2){rotate:45deg;animation-delay:-1.2s}.sp i:nth-child(3){rotate:90deg;animation-delay:-1s}.sp i:nth-child(4){rotate:135deg;animation-delay:-.8s}
.sp i:nth-child(5){rotate:180deg;animation-delay:-.6s}.sp i:nth-child(6){rotate:225deg;animation-delay:-.4s}.sp i:nth-child(7){rotate:270deg;animation-delay:-.2s}.sp i:nth-child(8){rotate:315deg;animation-delay:0s}
@keyframes dot{0%{opacity:1}75%,100%{opacity:.1}}
h1{margin:0;color:#fff;font-weight:300;font-size:clamp(24px,4.4vw,36px);letter-spacing:.2px;text-align:center;text-shadow:0 0 18px rgba(140,210,255,.6),0 2px 4px rgba(0,0,0,.35)}
.lead{margin:6px 0 24px;color:#D7EAFB;font-weight:300;font-size:clamp(14px,2.3vw,17px);text-align:center;min-height:1.45em}
/* the Aero window */
.win{width:min(560px,100%);border-radius:8px;padding:0 7px 7px;
  background:linear-gradient(180deg,rgba(185,220,250,.62) 0%,rgba(120,175,230,.42) 30px,rgba(95,150,210,.38) 100%);
  border:1px solid rgba(20,40,70,.65);box-shadow:inset 0 0 0 1px rgba(255,255,255,.55),0 18px 50px rgba(0,0,0,.5);
  -webkit-backdrop-filter:blur(10px) saturate(1.3);backdrop-filter:blur(10px) saturate(1.3)}
.tb{display:flex;align-items:center;gap:8px;height:31px;padding:0 2px 0 3px;color:#0B1A2E;font-size:12.5px;text-shadow:0 0 8px rgba(255,255,255,.9),0 0 2px #fff}
.tb .ti{width:16px;height:16px;border-radius:4px;display:grid;place-items:center;color:#fff;font:700 10px/1 "Segoe UI",Arial;background:linear-gradient(180deg,#58B0EA,#1662AA);box-shadow:inset 0 1px 0 rgba(255,255,255,.6)}
.tb .gr{flex:1}
.tb .x{width:43px;height:19px;margin-top:-8px;border-radius:0 0 5px 5px;border:1px solid rgba(60,20,20,.7);border-top:0;
  background:linear-gradient(180deg,#E8A493 0%,#D2614A 45%,#B7301A 50%,#D0603F 100%);box-shadow:inset 0 1px 0 rgba(255,255,255,.5);opacity:.55;position:relative}
.tb .x:before,.tb .x:after{content:"";position:absolute;left:50%;top:50%;width:11px;height:2px;background:#fff;border-radius:1px}
.tb .x:before{transform:translate(-50%,-50%) rotate(45deg)}.tb .x:after{transform:translate(-50%,-50%) rotate(-45deg)}
.body{background:#fff;border:1px solid rgba(40,70,110,.55);border-radius:2px;box-shadow:inset 0 1px 0 #fff}
.hd{display:flex;gap:14px;align-items:center;padding:16px 18px 14px;border-bottom:1px solid #E5ECF3;background:linear-gradient(180deg,#FFFFFF,#F4F8FC)}
.orb{flex:none;width:48px;height:48px;border-radius:50%;display:grid;place-items:center;color:#fff;font:700 24px/1 "Segoe UI",Arial;position:relative;
  background:radial-gradient(circle at 50% 30%,#8BD1FF 0%,#2E8BDA 42%,#0E4F96 78%,#0A3A70 100%);box-shadow:0 2px 6px rgba(0,40,90,.45),inset 0 -3px 6px rgba(0,0,0,.25);text-shadow:0 1px 2px rgba(0,0,0,.4)}
.orb:after{content:"";position:absolute;left:9px;right:9px;top:4px;height:18px;border-radius:50%;background:linear-gradient(180deg,rgba(255,255,255,.75),rgba(255,255,255,0))}
.hd h2{margin:0;font-weight:400;font-size:17px;color:#1E3287}
.hd p{margin:1px 0 0;color:#5A6B7D;font-size:12.5px}
.ct{padding:14px 18px 16px}
.now{display:flex;justify-content:space-between;gap:10px;margin:0 0 7px;font-size:13px;color:#1E1E1E}
.now span:last-child{color:#5A6B7D;font-variant-numeric:tabular-nums}
/* green Windows 7 progress bar */
.pb{position:relative;height:16px;border:1px solid #9AA8B6;border-radius:3px;overflow:hidden;background:linear-gradient(180deg,#F4F4F4 0%,#E2E2E2 50%,#D6D6D6 51%,#EBEBEB 100%);box-shadow:inset 0 1px 2px rgba(0,0,0,.15)}
.pb .f{position:absolute;inset:0 auto 0 0;width:6%;transition:width 1.4s ease;overflow:hidden;
  background:linear-gradient(180deg,#C8F7BB 0%,#6EDB57 40%,#2FB51E 50%,#3BC528 80%,#5BD447 100%);box-shadow:inset 0 0 0 1px rgba(0,90,0,.22)}
.pb .f:after{content:"";position:absolute;top:0;bottom:0;width:110px;left:-110px;background:linear-gradient(90deg,transparent,rgba(255,255,255,.85),transparent);animation:sh 2.4s ease-in-out infinite}
@keyframes sh{0%{left:-110px}100%{left:110%}}
.list{list-style:none;margin:14px 0 0;padding:10px 12px;border:1px solid #E1E8EF;border-radius:4px;background:#FAFCFE}
.list li{display:flex;align-items:center;gap:10px;padding:4px 0;color:#8A97A5;font-size:13px}
.list li .ic{flex:none;width:16px;height:16px;border-radius:50%;border:1.5px solid #C3CED9;position:relative}
.list li.on{color:#1E1E1E;font-weight:600}
.list li.on .ic{border-color:#2E8BDA;border-right-color:transparent;animation:r .8s linear infinite}
.list li.ok{color:#2B6A1F}
.list li.ok .ic{border:0;background:linear-gradient(180deg,#7EDC63,#2FA51C);box-shadow:inset 0 1px 0 rgba(255,255,255,.6)}
.list li.ok .ic:after{content:"";position:absolute;left:5px;top:3px;width:4px;height:7px;border:solid #fff;border-width:0 2px 2px 0;transform:rotate(45deg)}
@keyframes r{to{transform:rotate(360deg)}}
.ft{display:flex;align-items:center;gap:10px;justify-content:space-between;padding:10px 18px;border-top:1px solid #E5ECF3;background:#F1F5F9;font-size:12px;color:#5A6B7D}
.safe{display:flex;align-items:center;gap:7px}
.safe:before{content:"";width:14px;height:16px;flex:none;background:linear-gradient(180deg,#7EDC63,#2FA51C);clip-path:polygon(50% 0,100% 18%,100% 55%,50% 100%,0 55%,0 18%)}
button{padding:4px 20px;border-radius:3px;cursor:pointer;font:12.5px "Segoe UI",Tahoma,Arial,sans-serif;color:#111;border:1px solid #707070;
  background:linear-gradient(180deg,#F2F2F2 0%,#EBEBEB 50%,#DDDDDD 51%,#CFCFCF 100%);box-shadow:inset 0 1px 0 #fff}
button:hover{border-color:#3C7FB1;background:linear-gradient(180deg,#EAF6FD 0%,#D9F0FC 50%,#BEE6FD 51%,#A7D9F5 100%)}
button:focus-visible{outline:1px dotted #000;outline-offset:2px}
.note{margin-top:16px;color:#CFE3F7;font-size:12.5px;text-align:center;text-shadow:0 1px 2px rgba(0,0,0,.4)}
/* taskbar with the clock */
.bar{position:fixed;left:0;right:0;bottom:0;height:40px;z-index:2;display:flex;align-items:center;gap:10px;padding:0 10px 0 6px;
  background:linear-gradient(180deg,rgba(40,70,105,.78) 0%,rgba(20,40,65,.86) 50%,rgba(12,28,48,.92) 100%);border-top:1px solid rgba(255,255,255,.28);box-shadow:inset 0 1px 0 rgba(255,255,255,.12);
  -webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);color:#fff}
.bar .st{width:34px;height:34px;border-radius:50%;display:grid;place-items:center;font:700 16px/1 "Segoe UI",Arial;position:relative;
  background:radial-gradient(circle at 50% 30%,#8BD1FF 0%,#2E8BDA 45%,#0E4F96 80%);box-shadow:0 0 10px rgba(110,190,255,.55),inset 0 -2px 4px rgba(0,0,0,.3)}
.bar .st:after{content:"";position:absolute;left:7px;right:7px;top:3px;height:12px;border-radius:50%;background:linear-gradient(180deg,rgba(255,255,255,.7),rgba(255,255,255,0))}
.bar .tk{height:32px;padding:0 12px;display:flex;align-items:center;gap:8px;border-radius:3px;font-size:12.5px;
  background:linear-gradient(180deg,rgba(255,255,255,.28),rgba(255,255,255,.08) 50%,rgba(255,255,255,.02) 51%,rgba(255,255,255,.12));border:1px solid rgba(255,255,255,.35);box-shadow:inset 0 0 0 1px rgba(0,0,0,.25)}
.bar .tk i{width:16px;height:16px;border-radius:4px;background:linear-gradient(180deg,#58B0EA,#1662AA)}
.bar .gr{flex:1}
.bar .ck{text-align:center;font-size:12px;line-height:1.25}
@media (max-width:520px){.bar .tk span{display:none}.hd{padding:14px}.ct{padding:12px 14px 14px}.ft{flex-direction:column;align-items:stretch;text-align:center}.safe{justify-content:center}}
@media (prefers-reduced-motion:reduce){.sky i,.sp i,.pb .f:after,.list li.on .ic{animation:none}.sp i{opacity:.7}}
</style></head><body>
<div class="sky" aria-hidden="true"><i></i><i></i><i></i><b></b></div>
<main class="wrap" role="status" aria-live="polite">
  <div class="sp" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>
  <h1>Super ERP System is updating</h1>
  <p class="lead" id="lead">Getting the new version ready — please wait</p>
  <div class="win">
    <div class="tb"><span class="ti">S</span><span>Super ERP System Update</span><span class="gr"></span><span class="x" aria-hidden="true"></span></div>
    <div class="body">
      <div class="hd"><div class="orb" aria-hidden="true">S</div><div><h2>Installing updates</h2><p>A new version of Super ERP System is being installed on the server.</p></div></div>
      <div class="ct">
        <div class="now"><span id="ph">Installing update 1 of 3…</span><span id="tm">0:00</span></div>
        <div class="pb" aria-hidden="true"><div class="f" id="f"></div></div>
        <ul class="list">
          <li id="s1" class="on"><span class="ic"></span>Getting the new version</li>
          <li id="s2"><span class="ic"></span>Building the screens</li>
          <li id="s3"><span class="ic"></span>Starting Super ERP System</li>
        </ul>
      </div>
      <div class="ft"><span class="safe">Your data is safe — only the program is being replaced.</span><button type="button" onclick="location.reload()">Try now</button></div>
    </div>
  </div>
  <p class="note">Keep this page open — Super ERP System opens here by itself when the update is done.</p>
</main>
<div class="bar" aria-hidden="true"><span class="st">S</span><span class="tk"><i></i><span>Super ERP System Update</span></span><span class="gr"></span><span class="ck" id="ck"></span></div>
<script>
(function(){
  var t0=Date.now(),$=function(id){return document.getElementById(id)};
  var steps=[$('s1'),$('s2'),$('s3')];
  var lead=['Getting the new version ready — please wait','Building the new screens — this takes a minute or two','Almost done — starting Super ERP System'];
  var ph=['Installing update 1 of 3…','Installing update 2 of 3…','Installing update 3 of 3…'];
  function stage(sec){return sec<20?0:sec<110?1:2}
  function tick(){
    var sec=Math.floor((Date.now()-t0)/1000),s=stage(sec),d=new Date();
    $('tm').textContent=Math.floor(sec/60)+':'+('0'+sec%60).slice(-2);
    // the bar shows that work goes on; it reaches the end only when the ERP is back
    var p=s===0?6+sec*1.2:s===1?30+(sec-20)*0.5:Math.min(96,75+(sec-110)*0.12);
    $('f').style.width=Math.min(96,p).toFixed(1)+'%';
    $('ph').textContent=ph[s];$('lead').textContent=lead[s];
    steps.forEach(function(el,i){el.className=i<s?'ok':i===s?'on':''});
    $('ck').innerHTML=d.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})+'<br>'+d.toLocaleDateString('en-GB');
  }
  function done(){
    $('f').style.width='100%';steps.forEach(function(el){el.className='ok'});
    $('ph').textContent='Update complete';$('lead').textContent='Done — opening Super ERP System…';
    setTimeout(function(){location.reload()},900);
  }
  function check(){fetch(location.href,{cache:'no-store',credentials:'same-origin'}).then(function(r){if(r.status===200)done()}).catch(function(){})}
  tick();setInterval(tick,1000);setInterval(check,5000);
})();
</script></body></html>`;
app.get('*', (_req, res) => {
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(path.join(__dirname, 'frontend', 'build', 'index.html'), err => {
    if (!err || res.headersSent) return;
    res.status(503).set('Retry-After', '10').type('html').send(UPDATING_PAGE);
  });
});

// Global error handler
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error('[Server Error]', err.message);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

// ── Socket.io ──
const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

// userId (string) -> Set<socketId>
const onlineUsers = new Map();

io.on('connection', (socket) => {
  socket.on('user:join', ({ userId, companyId }) => {
    socket.userId    = String(userId);
    socket.companyId = String(companyId || '');
    if (!onlineUsers.has(socket.userId)) onlineUsers.set(socket.userId, new Set());
    onlineUsers.get(socket.userId).add(socket.id);
    io.emit('users:online', [...onlineUsers.keys()]);
  });

  socket.on('chat:typing', ({ toUserId }) => {
    if (!socket.userId) return;
    const sids = onlineUsers.get(String(toUserId));
    if (sids) sids.forEach(sid => io.to(sid).emit('chat:typing', { fromUserId: socket.userId }));
  });

  socket.on('chat:stopTyping', ({ toUserId }) => {
    if (!socket.userId) return;
    const sids = onlineUsers.get(String(toUserId));
    if (sids) sids.forEach(sid => io.to(sid).emit('chat:stopTyping', { fromUserId: socket.userId }));
  });

  // Relay a sent message to the recipient if online
  socket.on('chat:relay', (msg) => {
    const sids = onlineUsers.get(String(msg.toUserId));
    if (sids) sids.forEach(sid => io.to(sid).emit('chat:message', msg));
  });

  // Relay group message to all online members (except sender)
  socket.on('chat:groupRelay', ({ msg, memberIds }) => {
    if (!msg || !Array.isArray(memberIds)) return;
    memberIds.forEach(uid => {
      if (String(uid) === socket.userId) return;
      const sids = onlineUsers.get(String(uid));
      if (sids) sids.forEach(sid => io.to(sid).emit('chat:groupMessage', msg));
    });
  });

  // Recipient tells server: "I received msgId" → relay delivered status back to sender
  socket.on('chat:deliveredAck', ({ msgId, toUserId }) => {
    const sids = onlineUsers.get(String(toUserId));
    if (sids) sids.forEach(sid => io.to(sid).emit('chat:delivered', { msgId }));
  });

  // Recipient tells server: "I read these messages" → relay read status back to sender
  socket.on('chat:readAck', ({ msgIds, toUserId }) => {
    const sids = onlineUsers.get(String(toUserId));
    if (sids) sids.forEach(sid => io.to(sid).emit('chat:read', { msgIds }));
  });

  // ── WebRTC call signaling ──
  socket.on('call:offer', ({ toUserId, offer, callType }) => {
    console.log(`[Server] call:offer  from=${socket.userId}  to=${toUserId}  type=${callType}`);
    if (!socket.userId) { console.log('[Server] call:offer DROPPED — socket.userId not set'); return; }
    const sids = onlineUsers.get(String(toUserId));
    console.log(`[Server] target "${toUserId}" sockets:`, sids ? [...sids] : 'NOT IN onlineUsers');
    console.log('[Server] all online users:', [...onlineUsers.keys()]);
    if (sids) sids.forEach(sid => io.to(sid).emit('call:incoming', { fromUserId: socket.userId, offer, callType }));
  });
  socket.on('call:answer', ({ toUserId, answer }) => {
    if (!socket.userId) return;
    const sids = onlineUsers.get(String(toUserId));
    if (sids) sids.forEach(sid => io.to(sid).emit('call:answered', { answer }));
  });
  socket.on('call:ice-candidate', ({ toUserId, candidate }) => {
    if (!socket.userId) return;
    const sids = onlineUsers.get(String(toUserId));
    if (sids) sids.forEach(sid => io.to(sid).emit('call:ice-candidate', { candidate }));
  });
  socket.on('call:end', ({ toUserId }) => {
    if (!socket.userId) return;
    const sids = onlineUsers.get(String(toUserId));
    if (sids) sids.forEach(sid => io.to(sid).emit('call:ended', { fromUserId: socket.userId }));
  });
  socket.on('call:reject', ({ toUserId }) => {
    if (!socket.userId) return;
    const sids = onlineUsers.get(String(toUserId));
    if (sids) sids.forEach(sid => io.to(sid).emit('call:rejected', { fromUserId: socket.userId }));
  });

  socket.on('disconnect', () => {
    if (socket.userId) {
      const sids = onlineUsers.get(socket.userId);
      if (sids) {
        sids.delete(socket.id);
        if (sids.size === 0) onlineUsers.delete(socket.userId);
      }
      io.emit('users:online', [...onlineUsers.keys()]);
    }
  });
});

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
  // e-way / GST portal work runs here on the server (headless) — nothing to install on the users' PCs
  try { require('./api/ewayHelper').startServerHelpers(PORT); } catch (e) { console.warn('[eway] portal workers not started:', e.message); }
});

// The same app on the standard web port too, so users open just http://<server-ip> (no ":5000").
// Port 5000 stays — the dev proxy and the chat socket use it. HTTP_PORT=0 turns this off.
const WEB_PORT = Number(process.env.HTTP_PORT ?? 80);
if (WEB_PORT && WEB_PORT !== Number(PORT)) {
  const webServer = http.createServer(app);
  io.attach(webServer);   // chat / calls work on this port too (the page connects to its own origin)
  webServer
    .on('error', e => console.warn(`Port ${WEB_PORT} not opened (${e.code}) — use http://<ip>:${PORT}. ${e.code === 'EADDRINUSE' ? 'Another program is using it.' : ''}`))
    .listen(WEB_PORT, '0.0.0.0', () => console.log(`Also on http://0.0.0.0:${WEB_PORT} (no port needed in the address)`));
}
