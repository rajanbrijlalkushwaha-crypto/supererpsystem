/**
 * db-init.js — Run once to create the epsilon_erp database and all tables.
 * Usage: node db-init.js
 */
const mysql = require('mysql2/promise');
require('dotenv').config();

async function init() {
  const conn = await mysql.createConnection({
    host:     process.env.DB_HOST || '127.0.0.1',
    port:     parseInt(process.env.DB_PORT) || 3306,
    user:     process.env.DB_USER || 'root',
    password: process.env.DB_PASS || 'Epsilon$2022',
    multipleStatements: true,
  });

  console.log('Connected to MariaDB...');

  await conn.query(`CREATE DATABASE IF NOT EXISTS \`savvishprefab\`
    CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await conn.query('USE `savvishprefab`');

  await conn.query(`
    CREATE TABLE IF NOT EXISTS companies (
      id            VARCHAR(20)  PRIMARY KEY,
      company_name  VARCHAR(255) NOT NULL,
      address       TEXT,
      city          VARCHAR(100),
      state         VARCHAR(100),
      pincode       VARCHAR(20),
      gstin         VARCHAR(20),
      pan           VARCHAR(20),
      email         VARCHAR(255),
      phone         VARCHAR(50),
      website       VARCHAR(255),
      bank_name     VARCHAR(255),
      bank_account  VARCHAR(100),
      bank_ifsc     VARCHAR(30),
      is_default    TINYINT(1) DEFAULT 0,
      logo_file     VARCHAR(500),
      created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB;

    CREATE TABLE IF NOT EXISTS clients (
      id            INT          PRIMARY KEY,
      company_id    VARCHAR(20)  NOT NULL,
      name          VARCHAR(255) NOT NULL,
      address       TEXT,
      city          VARCHAR(100),
      state         VARCHAR(100),
      pincode       VARCHAR(20),
      gstin         VARCHAR(30),
      gst_type      VARCHAR(50),
      status        VARCHAR(30)  DEFAULT 'draft',
      contacts      JSON,
      documents     JSON,
      created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_company (company_id)
    ) ENGINE=InnoDB;

    CREATE TABLE IF NOT EXISTS vendors (
      id            INT          PRIMARY KEY,
      company_id    VARCHAR(20)  NOT NULL,
      name          VARCHAR(255) NOT NULL,
      address       TEXT,
      city          VARCHAR(100),
      state         VARCHAR(100),
      pincode       VARCHAR(20),
      gstin         VARCHAR(30),
      gst_type      VARCHAR(50),
      status        VARCHAR(30)  DEFAULT 'draft',
      contacts      JSON,
      documents     JSON,
      extra         JSON,
      created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_company (company_id)
    ) ENGINE=InnoDB;

    CREATE TABLE IF NOT EXISTS sales_orders (
      id                INT          PRIMARY KEY,
      company_id        VARCHAR(20)  NOT NULL,
      status            VARCHAR(30)  DEFAULT 'draft',
      order_no          VARCHAR(100),
      order_date        DATE,
      order_type        VARCHAR(100),
      customer_name     VARCHAR(255),
      customer_code     VARCHAR(100),
      customer_gstin    VARCHAR(30),
      customer_state    VARCHAR(100),
      customer_po       VARCHAR(100),
      po_date           DATE,
      delivery_date     DATE,
      payment_terms     VARCHAR(255),
      grand_total       DECIMAL(15,2) DEFAULT 0,
      data              JSON,
      created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_company (company_id),
      INDEX idx_status  (status)
    ) ENGINE=InnoDB;

    CREATE TABLE IF NOT EXISTS purchase_orders (
      id             INT          PRIMARY KEY,
      company_id     VARCHAR(20)  NOT NULL,
      status         VARCHAR(30)  DEFAULT 'draft',
      vendor_name    VARCHAR(255),
      po_date        DATE,
      delivery_date  DATE,
      grand_total    DECIMAL(15,2) DEFAULT 0,
      data           JSON,
      created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_company (company_id)
    ) ENGINE=InnoDB;

    CREATE TABLE IF NOT EXISTS expenses (
      id             INT          PRIMARY KEY,
      company_id     VARCHAR(20)  NOT NULL,
      expense_date   DATE,
      category       VARCHAR(100),
      description    TEXT,
      amount         DECIMAL(15,2) DEFAULT 0,
      tax_rate       DECIMAL(5,2)  DEFAULT 0,
      tax_amount     DECIMAL(15,2) DEFAULT 0,
      total_amount   DECIMAL(15,2) DEFAULT 0,
      payment_mode   VARCHAR(50),
      bank_id        VARCHAR(50),
      notes          TEXT,
      status         VARCHAR(30)  DEFAULT 'draft',
      created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_company (company_id)
    ) ENGINE=InnoDB;

    CREATE TABLE IF NOT EXISTS assets (
      id                  INT          PRIMARY KEY,
      company_id          VARCHAR(20)  NOT NULL,
      asset_date          DATE,
      asset_name          VARCHAR(255),
      category            VARCHAR(100),
      description         TEXT,
      purchase_amount     DECIMAL(15,2) DEFAULT 0,
      depreciation_rate   DECIMAL(5,2)  DEFAULT 0,
      current_value       DECIMAL(15,2) DEFAULT 0,
      notes               TEXT,
      status              VARCHAR(30)  DEFAULT 'active',
      created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_company (company_id)
    ) ENGINE=InnoDB;

    CREATE TABLE IF NOT EXISTS tally_pending (
      id             INT AUTO_INCREMENT PRIMARY KEY,
      company_id     VARCHAR(20),
      voucher_data   JSON,
      created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_company (company_id)
    ) ENGINE=InnoDB;

    CREATE TABLE IF NOT EXISTS tally_config (
      company_id     VARCHAR(20) PRIMARY KEY,
      host           VARCHAR(100) DEFAULT 'localhost',
      port           INT          DEFAULT 9000,
      company_name   VARCHAR(255),
      updated_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB;
  `);

  console.log('✅ All tables created successfully in savvishprefab database.');
  await conn.end();
}

init().catch(err => {
  console.error('❌ Init failed:', err.message);
  process.exit(1);
});
