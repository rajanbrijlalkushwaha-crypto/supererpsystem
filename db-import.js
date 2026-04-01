/**
 * db-import.js — Import all JSON files from /Database into MariaDB (savvishprefab).
 * Run AFTER db-init.js: node db-import.js
 */
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const DB_DIR = path.join(__dirname, 'Database');

async function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function findJsonFiles(dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...findJsonFiles(full));
    else if (entry.name.endsWith('.json')) results.push(full);
  }
  return results;
}

async function importCompanies(conn) {
  const files = [
    path.join(DB_DIR, 'Companies', 'C1.json'),
    path.join(DB_DIR, 'Companies', 'C2.json'),
  ];
  let count = 0;
  for (const f of files) {
    const d = await readJson(f);
    if (!d) continue;
    await conn.query(
      `INSERT INTO companies
        (id, company_name, address, city, state, pincode, gstin, pan,
         email, phone, website, bank_name, bank_account, bank_ifsc, is_default, logo_file,
         created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE
         company_name=VALUES(company_name), address=VALUES(address),
         city=VALUES(city), state=VALUES(state), updated_at=VALUES(updated_at)`,
      [
        d.companyId, d.companyName, d.address || null, d.city || null,
        d.state || null, d.pincode || null, d.gstin || null, d.pan || null,
        d.email || null, d.phone || null, d.website || null,
        d.bankName || null, d.bankAccount || null, d.bankIfsc || null,
        d.isDefault ? 1 : 0, d.logoFileName || null,
        d.createdAt ? new Date(d.createdAt) : new Date(),
        d.updatedAt ? new Date(d.updatedAt) : new Date(),
      ]
    );
    count++;
  }
  console.log(`  companies: ${count} rows`);
}

async function importClients(conn) {
  let count = 0;
  // Company-level clients: Database/Companies/C*/Client/XXXXXX/*.json
  const companiesDir = path.join(DB_DIR, 'Companies');
  for (const companyFolder of fs.readdirSync(companiesDir)) {
    const clientDir = path.join(companiesDir, companyFolder, 'Client');
    if (!fs.existsSync(clientDir)) continue;
    for (const clientId of fs.readdirSync(clientDir)) {
      const clientFolder = path.join(clientDir, clientId);
      if (!fs.statSync(clientFolder).isDirectory()) continue;
      const files = fs.readdirSync(clientFolder).filter(f => f.endsWith('.json'));
      for (const file of files) {
        const d = await readJson(path.join(clientFolder, file));
        if (!d || !d.clientId) continue;
        await conn.query(
          `INSERT INTO clients
            (id, company_id, name, address, city, state, pincode, gstin, gst_type,
             status, contacts, documents, created_at, updated_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
           ON DUPLICATE KEY UPDATE
             name=VALUES(name), address=VALUES(address), status=VALUES(status),
             updated_at=VALUES(updated_at)`,
          [
            d.clientId, companyFolder,
            d.companyName || d.clientName || '',
            d.address || null, d.city || null, d.state || null, d.pincode || null,
            d.gstin || null, d.gstType || null, d.status || 'draft',
            JSON.stringify(d.contactPersons || []),
            JSON.stringify(d.documents || []),
            d.createdAt ? new Date(d.createdAt) : new Date(),
            d.updatedAt ? new Date(d.updatedAt) : new Date(),
          ]
        );
        count++;
      }
    }
  }
  // Root-level clients: Database/Client/XXXXXX/*.json
  const rootClientDir = path.join(DB_DIR, 'Client');
  if (fs.existsSync(rootClientDir)) {
    for (const clientId of fs.readdirSync(rootClientDir)) {
      const clientFolder = path.join(rootClientDir, clientId);
      if (!fs.statSync(clientFolder).isDirectory()) continue;
      const files = fs.readdirSync(clientFolder).filter(f => f.endsWith('.json'));
      for (const file of files) {
        const d = await readJson(path.join(clientFolder, file));
        if (!d || !d.clientId) continue;
        await conn.query(
          `INSERT INTO clients
            (id, company_id, name, address, city, state, pincode, gstin, gst_type,
             status, contacts, documents, created_at, updated_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
           ON DUPLICATE KEY UPDATE
             name=VALUES(name), address=VALUES(address), updated_at=VALUES(updated_at)`,
          [
            d.clientId, 'ROOT',
            d.companyName || d.clientName || '',
            d.address || null, d.city || null, d.state || null, d.pincode || null,
            d.gstin || null, d.gstType || null, d.status || 'draft',
            JSON.stringify(d.contactPersons || []),
            JSON.stringify(d.documents || []),
            d.createdAt ? new Date(d.createdAt) : new Date(),
            d.updatedAt ? new Date(d.updatedAt) : new Date(),
          ]
        );
        count++;
      }
    }
  }
  console.log(`  clients: ${count} rows`);
}

async function importVendors(conn) {
  let count = 0;
  const vendorDir = path.join(DB_DIR, 'Vendor');
  if (!fs.existsSync(vendorDir)) return;
  for (const vendorId of fs.readdirSync(vendorDir)) {
    const vendorFolder = path.join(vendorDir, vendorId);
    if (!fs.statSync(vendorFolder).isDirectory()) continue;
    const files = fs.readdirSync(vendorFolder).filter(f => f.endsWith('.json'));
    for (const file of files) {
      const d = await readJson(path.join(vendorFolder, file));
      if (!d || !d.vendorId) continue;
      await conn.query(
        `INSERT INTO vendors
          (id, company_id, name, address, city, state, pincode, gstin, gst_type,
           status, contacts, documents, extra, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
         ON DUPLICATE KEY UPDATE
           name=VALUES(name), address=VALUES(address), status=VALUES(status),
           updated_at=VALUES(updated_at)`,
        [
          d.vendorId, 'ROOT',
          d.vendorName || '',
          d.address || null, d.city || null, d.state || null, d.pincode || null,
          d.gstin || null, d.gstType || null, d.status || 'draft',
          JSON.stringify(d.contactPersons || []),
          JSON.stringify(d.documents || []),
          JSON.stringify({}),
          d.createdAt ? new Date(d.createdAt) : new Date(),
          d.updatedAt ? new Date(d.updatedAt) : new Date(),
        ]
      );
      count++;
    }
  }
  console.log(`  vendors: ${count} rows`);
}

async function importSalesOrders(conn) {
  let count = 0;
  const companiesDir = path.join(DB_DIR, 'Companies');
  for (const companyFolder of fs.readdirSync(companiesDir)) {
    const soDir = path.join(companiesDir, companyFolder, 'SalesOrder');
    if (!fs.existsSync(soDir)) continue;
    for (const orderId of fs.readdirSync(soDir)) {
      const orderFolder = path.join(soDir, orderId);
      if (!fs.statSync(orderFolder).isDirectory()) continue;
      const files = fs.readdirSync(orderFolder).filter(f => f.endsWith('.json'));
      for (const file of files) {
        const d = await readJson(path.join(orderFolder, file));
        if (!d || !d.orderId) continue;
        await conn.query(
          `INSERT INTO sales_orders
            (id, company_id, status, order_no, order_date, order_type,
             customer_name, customer_code, customer_gstin, customer_state,
             customer_po, po_date, delivery_date, payment_terms, grand_total,
             data, created_at, updated_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
           ON DUPLICATE KEY UPDATE
             status=VALUES(status), grand_total=VALUES(grand_total),
             data=VALUES(data), updated_at=VALUES(updated_at)`,
          [
            d.orderId, companyFolder,
            d.status || 'draft',
            d.voucherNumber || d.orderNo || null,
            d.date || d.orderDate || null,
            d.orderType || d.tallyType || null,
            d.clientName || d.party || null,
            d.customerCode || null,
            d.partyGstin || null,
            d.stateName || null,
            d.orderRef || null,
            d.poDate || null,
            d.deliveryDate || null,
            d.paymentTerms || null,
            d.amount || d.grandTotal || 0,
            JSON.stringify(d),
            d.createdAt ? new Date(d.createdAt) : new Date(),
            d.updatedAt ? new Date(d.updatedAt) : new Date(),
          ]
        );
        count++;
      }
    }
  }
  console.log(`  sales_orders: ${count} rows`);
}

async function importPurchaseOrders(conn) {
  let count = 0;
  const companiesDir = path.join(DB_DIR, 'Companies');
  for (const companyFolder of fs.readdirSync(companiesDir)) {
    const poDir = path.join(companiesDir, companyFolder, 'PurchaseOrder');
    if (!fs.existsSync(poDir)) continue;
    for (const orderId of fs.readdirSync(poDir)) {
      const orderFolder = path.join(poDir, orderId);
      if (!fs.statSync(orderFolder).isDirectory()) continue;
      const files = fs.readdirSync(orderFolder).filter(f => f.endsWith('.json'));
      for (const file of files) {
        const d = await readJson(path.join(orderFolder, file));
        if (!d || !d.orderId) continue;
        await conn.query(
          `INSERT INTO purchase_orders
            (id, company_id, status, vendor_name, po_date, delivery_date,
             grand_total, data, created_at, updated_at)
           VALUES (?,?,?,?,?,?,?,?,?,?)
           ON DUPLICATE KEY UPDATE
             status=VALUES(status), grand_total=VALUES(grand_total),
             data=VALUES(data), updated_at=VALUES(updated_at)`,
          [
            d.orderId, companyFolder,
            d.status || 'draft',
            d.vendorName || d.party || null,
            d.date || d.poDate || null,
            d.deliveryDate || null,
            d.amount || d.grandTotal || 0,
            JSON.stringify(d),
            d.createdAt ? new Date(d.createdAt) : new Date(),
            d.updatedAt ? new Date(d.updatedAt) : new Date(),
          ]
        );
        count++;
      }
    }
  }
  // Also check root PurchaseOrder folder
  const rootPoDir = path.join(DB_DIR, 'PurchaseOrder');
  if (fs.existsSync(rootPoDir)) {
    for (const file of findJsonFiles(rootPoDir)) {
      const d = await readJson(file);
      if (!d || !d.orderId) continue;
      await conn.query(
        `INSERT INTO purchase_orders
          (id, company_id, status, vendor_name, po_date, delivery_date, grand_total, data, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?)
         ON DUPLICATE KEY UPDATE data=VALUES(data), updated_at=VALUES(updated_at)`,
        [
          d.orderId, 'ROOT', d.status || 'draft',
          d.vendorName || null, d.poDate || null, d.deliveryDate || null,
          d.grandTotal || 0, JSON.stringify(d),
          d.createdAt ? new Date(d.createdAt) : new Date(),
          d.updatedAt ? new Date(d.updatedAt) : new Date(),
        ]
      );
      count++;
    }
  }
  console.log(`  purchase_orders: ${count} rows`);
}

async function importTally(conn) {
  const configFile = path.join(DB_DIR, 'TallyImport', 'config.json');
  const pendingFile = path.join(DB_DIR, 'TallyImport', 'pending.json');

  if (fs.existsSync(configFile)) {
    const cfg = await readJson(configFile);
    if (cfg) {
      await conn.query(
        `INSERT INTO tally_config (company_id, host, port)
         VALUES ('ROOT', ?, ?)
         ON DUPLICATE KEY UPDATE host=VALUES(host), port=VALUES(port)`,
        [cfg.host || 'localhost', cfg.port || 9000]
      );
      console.log('  tally_config: 1 row');
    }
  }

  if (fs.existsSync(pendingFile)) {
    const pending = await readJson(pendingFile);
    if (Array.isArray(pending) && pending.length > 0) {
      for (const item of pending) {
        await conn.query(
          `INSERT INTO tally_pending (company_id, voucher_data) VALUES (?,?)`,
          ['ROOT', JSON.stringify(item)]
        );
      }
      console.log(`  tally_pending: ${pending.length} rows`);
    } else {
      console.log('  tally_pending: 0 rows (empty)');
    }
  }
}

async function main() {
  const conn = await mysql.createConnection({
    host:               process.env.DB_HOST || '127.0.0.1',
    port:               parseInt(process.env.DB_PORT) || 3306,
    user:               process.env.DB_USER || 'root',
    password:           process.env.DB_PASS || 'Epsilon$2022',
    database:           process.env.DB_NAME || 'savvishprefab',
    multipleStatements: true,
  });

  console.log('Connected to MariaDB savvishprefab...');
  console.log('Importing data from Database/ folder...\n');

  await importCompanies(conn);
  await importClients(conn);
  await importVendors(conn);
  await importSalesOrders(conn);
  await importPurchaseOrders(conn);
  await importTally(conn);

  console.log('\n✅ Import complete. JSON files remain unchanged in Database/ folder.');
  await conn.end();
}

main().catch(err => {
  console.error('❌ Import failed:', err.message);
  process.exit(1);
});
