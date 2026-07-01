/**
 * setup.js — Run once on a fresh server to create the Database folder structure
 * and a default admin user.
 *
 * Usage: node setup.js
 * Default login: username = admin  |  password = Admin@123
 */

const fs   = require('fs');
const path = require('path');
const crypto = require('crypto');

const DB = path.join(__dirname, 'Database');

const folders = [
  'Database',
  'Database/Accounts',
  'Database/Accounts/Banks',
  'Database/Client',
  'Database/Companies',
  'Database/Companies/logos',
  'Database/PurchaseOrder',
  'Database/SalesOrder',
  'Database/TallyImport',
  'Database/Vendor',
];

console.log('Creating folder structure...');
folders.forEach(f => {
  const p = path.join(__dirname, f);
  if (!fs.existsSync(p)) {
    fs.mkdirSync(p, { recursive: true });
    console.log('  created:', f);
  } else {
    console.log('  exists :', f);
  }
});

// Create users.json with default admin
const usersFile = path.join(DB, 'users.json');
if (!fs.existsSync(usersFile)) {
  const defaultPassword = 'Admin@123';
  const hash = crypto.createHash('sha256').update(defaultPassword).digest('hex');
  const users = [
    {
      id: 1,
      username: 'admin',
      password: hash,
      name: 'Administrator',
      role: 'admin',
      email: 'admin@epsilon.com',
      active: true,
      createdAt: new Date().toISOString(),
    },
  ];
  fs.writeFileSync(usersFile, JSON.stringify(users, null, 2));
  console.log('\nCreated users.json');
  console.log('  Default login -> username: admin  |  password: Admin@123');
} else {
  console.log('\nusers.json already exists — skipped');
}

// Create vendor-registrations.json
const vr = path.join(DB, 'vendor-registrations.json');
if (!fs.existsSync(vr)) {
  fs.writeFileSync(vr, '[]');
  console.log('Created vendor-registrations.json');
}

console.log('\nSetup complete. Start the app with:  start.bat  or  pm2 start ecosystem.config.js');
