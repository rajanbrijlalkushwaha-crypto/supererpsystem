const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
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

// ── OLD MODE: existing API routes (UNTOUCHED) ──
app.use('/api/clients',         require('./api/clients'));
app.use('/api/vendors',         require('./api/vendors'));
app.use('/api/items',           require('./api/items'));
app.use('/api/sales-orders',    require('./api/salesOrders'));
app.use('/api/purchase-orders', require('./api/purchaseOrders'));
app.use('/api/companies',       require('./api/companies'));
app.use('/api/accounts',        require('./api/accounts'));
app.use('/api/tally',           require('./api/tally'));
app.use('/api/manufacturing',   require('./api/manufacturing'));
app.use('/api/stock',           require('./api/stock'));
app.use('/api/projects',        require('./api/projects'));
app.use('/api/bills',           require('./api/bills'));
app.use('/api/passwords',       require('./api/passwords'));

// ── Vendor Portal (self-registration, vendor login) ──
app.use('/api/vendor-portal', require('./api/vendor-portal').router);

// ── SAP MODE: isolated SAP API routes (new) ──
app.use('/api/sap/projects',         require('./api/sap/projects'));
app.use('/api/sap/sales-orders',     require('./api/sap/salesOrders'));
app.use('/api/sap/purchase-orders',  require('./api/sap/purchaseOrders'));
app.use('/api/sap/grn',              require('./api/sap/grn'));
app.use('/api/sap/mrp',              require('./api/sap/mrp'));
app.use('/api/sap/production',       require('./api/sap/production'));
app.use('/api/sap/finance',          require('./api/sap/finance'));
app.use('/api/sap/tasks',            require('./api/sap/tasks'));



// Serve React app for all non-API routes (production only)
if (process.env.NODE_ENV === 'production') {
  app.get('*', (_req, res) => {
    res.sendFile(path.join(__dirname, 'frontend', 'build', 'index.html'));
  });
}

// Global error handler — catches unhandled errors from multer and middleware
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error('[Server Error]', err.message);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});
    
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
});
