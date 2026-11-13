const express    = require('express');
const compression = require('compression');
const cors       = require('cors');
const path       = require('path');
const http       = require('http');
const { Server } = require('socket.io');
require('dotenv').config();

const app  = express();
const PORT = process.env.PORT || 5000;

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

app.get('*', (_req, res) => {
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(path.join(__dirname, 'frontend', 'build', 'index.html'));
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
