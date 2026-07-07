const express    = require('express');
const cors       = require('cors');
const path       = require('path');
const http       = require('http');
const { Server } = require('socket.io');
require('dotenv').config();

const app  = express();
const PORT = process.env.PORT || 5000;

// ── Middleware ──
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'frontend', 'build')));

// Normalize companyId — prevents duplicate query params sending an array
app.use((req, _res, next) => {
  if (Array.isArray(req.query.companyId)) req.query.companyId = req.query.companyId[0];
  next();
});

// ── Auth routes (no token required — public) ──
app.use('/api/auth', require('./api/auth').router);

// ── API routes ──
app.use('/api/clients',           require('./api/clients'));
app.use('/api/vendors',           require('./api/vendors'));
app.use('/api/items',             require('./api/items'));
app.use('/api/sales-orders',      require('./api/salesOrders'));
app.use('/api/purchase-orders',   require('./api/purchaseOrders'));
app.use('/api/companies',         require('./api/companies'));
app.use('/api/accounts',          require('./api/accounts'));
app.use('/api/tally',             require('./api/tally'));
app.use('/api/manufacturing',     require('./api/manufacturing'));
app.use('/api/stock',             require('./api/stock'));
app.use('/api/projects',          require('./api/projects'));
app.use('/api/bills',             require('./api/bills'));
app.use('/api/delivery-challans', require('./api/deliveryChallans'));
app.use('/api/grn',               require('./api/grn'));
app.use('/api/gdn',               require('./api/gdn'));
app.use('/api/passwords',         require('./api/passwords'));
app.use('/api/crm',               require('./api/crm'));
app.use('/api/deposits',          require('./api/deposits'));
app.use('/api/approvals',         require('./api/approvals'));
app.use('/api/ledger',            require('./api/ledger'));
app.use('/api/communication',     require('./api/communication').router);
app.use('/api/financial-docs',    require('./api/financial-docs'));
app.use('/api/chat',              require('./api/chat'));

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
app.get('*', (_req, res) => {
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
});
