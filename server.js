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
app.use('/api/office',            require('./api/office'));         // Office Suite: letters (Word) and sheets (Excel) kept with an order
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
body{margin:0;display:flex;align-items:center;justify-content:center;padding:16px;overflow:hidden;color:#fff;
  font:15px/1.5 "Segoe UI",Tahoma,Inter,Arial,sans-serif;
  background:radial-gradient(ellipse at 50% 38%,#2F7CC0 0%,#1A5A9C 32%,#0E3A6E 64%,#081F40 100%)}
/* soft light streaks, like the Windows 7 update screen */
body:before{content:"";position:fixed;inset:-20%;pointer-events:none;
  background:radial-gradient(ellipse 60% 22% at 30% 20%,rgba(255,255,255,.10),transparent 70%),radial-gradient(ellipse 50% 18% at 75% 80%,rgba(120,200,255,.10),transparent 70%)}
.w{position:relative;width:min(560px,100%);text-align:center}
/* the ring of dots */
.sp{position:relative;width:64px;height:64px;margin:0 auto 26px}
.sp i{position:absolute;left:28px;top:0;width:8px;height:8px;border-radius:50%;background:#fff;transform-origin:4px 32px;opacity:0;animation:o 1.6s linear infinite}
.sp i:nth-child(1){transform:rotate(0deg);animation-delay:0s}.sp i:nth-child(2){transform:rotate(45deg);animation-delay:.2s}
.sp i:nth-child(3){transform:rotate(90deg);animation-delay:.4s}.sp i:nth-child(4){transform:rotate(135deg);animation-delay:.6s}
.sp i:nth-child(5){transform:rotate(180deg);animation-delay:.8s}.sp i:nth-child(6){transform:rotate(225deg);animation-delay:1s}
.sp i:nth-child(7){transform:rotate(270deg);animation-delay:1.2s}.sp i:nth-child(8){transform:rotate(315deg);animation-delay:1.4s}
@keyframes o{0%{opacity:1}70%{opacity:.08}100%{opacity:.08}}
h1{margin:0 0 4px;font-weight:300;font-size:clamp(22px,4.2vw,32px);letter-spacing:.3px;text-shadow:0 1px 3px rgba(0,0,0,.35)}
.st{margin:0 0 22px;font-size:clamp(14px,2.4vw,17px);font-weight:300;color:#DCEBFA;min-height:1.5em}
/* the Aero glass panel */
.g{position:relative;margin:0 auto;padding:18px 20px 16px;border-radius:8px;text-align:left;
  background:linear-gradient(180deg,rgba(255,255,255,.26) 0%,rgba(255,255,255,.10) 46%,rgba(255,255,255,.05) 47%,rgba(255,255,255,.12) 100%);
  border:1px solid rgba(255,255,255,.45);box-shadow:inset 0 1px 0 rgba(255,255,255,.55),inset 0 0 0 1px rgba(0,0,0,.12),0 10px 34px rgba(0,0,0,.35);
  -webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px)}
.hd{display:flex;align-items:center;gap:12px;margin-bottom:12px}
.lg{flex:none;width:42px;height:42px;border-radius:8px;display:grid;place-items:center;font:700 24px/1 "Segoe UI",Arial,sans-serif;color:#fff;
  background:linear-gradient(180deg,#3E9BD8 0%,#1C6AAE 50%,#145893 51%,#1D73B8 100%);border:1px solid rgba(255,255,255,.6);box-shadow:inset 0 1px 0 rgba(255,255,255,.6),0 2px 6px rgba(0,0,0,.35)}
.hd b{display:block;font-size:15px;font-weight:600}.hd span{display:block;font-size:12.5px;color:#D6E8F8}
/* the green Windows 7 progress bar, with its moving shine */
.pb{position:relative;height:18px;border-radius:3px;overflow:hidden;border:1px solid #6E8FA8;
  background:linear-gradient(180deg,#F3F3F3 0%,#DADADA 50%,#CFCFCF 51%,#E7E7E7 100%);box-shadow:inset 0 1px 2px rgba(0,0,0,.25)}
.pb .f{position:absolute;inset:0 auto 0 0;width:8%;transition:width 1.2s ease;
  background:linear-gradient(180deg,#B6F5A6 0%,#4FD43A 45%,#2DB51B 50%,#36C424 100%);box-shadow:inset 0 0 0 1px rgba(0,80,0,.18)}
.pb .f:after{content:"";position:absolute;top:0;bottom:0;width:90px;left:-90px;
  background:linear-gradient(90deg,transparent,rgba(255,255,255,.75),transparent);animation:sh 2.2s ease-in-out infinite}
@keyframes sh{0%{left:-90px}100%{left:100%}}
.ln{display:flex;justify-content:space-between;gap:10px;margin-top:8px;font-size:12.5px;color:#E3EFFA}
.steps{list-style:none;margin:12px 0 0;padding:0;font-size:13px}
.steps li{display:flex;align-items:center;gap:8px;padding:2px 0;color:rgba(255,255,255,.55)}
.steps li:before{content:"";flex:none;width:14px;height:14px;border-radius:50%;border:1.5px solid rgba(255,255,255,.45)}
.steps li.on{color:#fff}.steps li.on:before{border-color:#fff;border-top-color:transparent;animation:r .9s linear infinite}
.steps li.ok{color:#CFF5C6}.steps li.ok:before{border:0;background:#3CC92A;box-shadow:inset 0 1px 0 rgba(255,255,255,.6)}
@keyframes r{to{transform:rotate(360deg)}}
.ft{margin-top:22px;font-size:13px;color:#C9DDF1}
button{margin-top:10px;padding:5px 22px;border-radius:3px;cursor:pointer;font:13px "Segoe UI",Tahoma,Arial,sans-serif;color:#111;
  border:1px solid #707070;background:linear-gradient(180deg,#F2F2F2 0%,#EBEBEB 50%,#DDDDDD 51%,#CFCFCF 100%);box-shadow:inset 0 1px 0 #fff}
button:hover{border-color:#3C7FB1;background:linear-gradient(180deg,#EAF6FD 0%,#D9F0FC 50%,#BEE6FD 51%,#A7D9F5 100%)}
button:focus-visible{outline:1px dotted #fff;outline-offset:3px}
@media (prefers-reduced-motion:reduce){.sp i,.pb .f:after,.steps li.on:before{animation:none}.sp i{opacity:.7}}
</style></head><body>
<main class="w" role="status" aria-live="polite">
  <div class="sp" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>
  <h1>Super ERP System is updating</h1>
  <p class="st" id="st">Installing the new version — please wait</p>
  <div class="g">
    <div class="hd"><div class="lg" aria-hidden="true">S</div><div><b>Installing updates</b><span>Your data is safe — only the program is being replaced.</span></div></div>
    <div class="pb" aria-hidden="true"><div class="f" id="f"></div></div>
    <div class="ln"><span id="ph">Stage 1 of 3</span><span id="tm">0:00</span></div>
    <ul class="steps">
      <li id="s1" class="on">Getting the new version</li>
      <li id="s2">Building the screens</li>
      <li id="s3">Starting Super ERP System</li>
    </ul>
  </div>
  <div class="ft">Do not close this page — it opens Super ERP System by itself when the update is done.<br>
    <button type="button" onclick="location.reload()">Try now</button></div>
</main>
<script>
(function(){
  var t0=Date.now(),st=document.getElementById('st'),f=document.getElementById('f'),ph=document.getElementById('ph'),tm=document.getElementById('tm');
  var steps=[document.getElementById('s1'),document.getElementById('s2'),document.getElementById('s3')];
  var msgs=['Installing the new version — please wait','Building the new screens — this takes a minute or two','Almost there — starting Super ERP System'];
  function stage(sec){return sec<20?0:sec<110?1:2}
  function tick(){
    var sec=Math.floor((Date.now()-t0)/1000),s=stage(sec);
    tm.textContent=Math.floor(sec/60)+':'+('0'+sec%60).slice(-2);
    // the bar only shows that it is working; it never reaches the end until the ERP is back
    var p=s===0?8+sec*1.1:s===1?30+(sec-20)*0.5:Math.min(96,75+(sec-110)*0.12);
    f.style.width=Math.min(96,p).toFixed(1)+'%';
    ph.textContent='Stage '+(s+1)+' of 3';st.textContent=msgs[s];
    steps.forEach(function(el,i){el.className=i<s?'ok':i===s?'on':''});
  }
  function check(){
    fetch(location.href,{cache:'no-store',credentials:'same-origin'}).then(function(r){
      if(r.status===200){f.style.width='100%';steps.forEach(function(el){el.className='ok'});st.textContent='Done — opening Super ERP System…';setTimeout(function(){location.reload()},700)}
    }).catch(function(){});
  }
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
