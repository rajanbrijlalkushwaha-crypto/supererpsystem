/**
 * tenant.js — every company keeps its own data, its own users and its own settings.
 *
 *   Database/Companies/<companyId>/
 *     company.json                 the company itself
 *     Users/users.json             who can sign in to THIS company (own passwords, roles, permissions)
 *     Users/<userId>/              each user's photo and signature
 *     email-config.json            the company's own mail account
 *     Notifications.json           approval requests for its users
 *     vendor-registrations.json    suppliers who signed up for this company (vendor portal)
 *     auth-tokens.json             invite / password-reset links of its users
 *     DeletedRecords/              copies of deleted entries
 *     <module folders>             SalesOrder, DeliveryChallan, …
 *
 * A login belongs to one company (the session carries companyId). Requests made with that login run inside
 * that company — `cidNow()` gives it to code that has no request at hand. */
const fs = require('fs');
const path = require('path');
const { AsyncLocalStorage } = require('async_hooks');
const { ROOT } = require('./helpers');

const COMPANIES = path.join(ROOT, 'Database', 'Companies');
const ctx = new AsyncLocalStorage();

const safeCid = v => (/^[A-Za-z0-9_-]{1,40}$/.test(String(v || '')) ? String(v) : '');
const coDir = cid => { const c = safeCid(cid); if (!c) throw new Error('Unknown company.'); return path.join(COMPANIES, c); };
/* the companies on this server (folders with a company.json) */
const companyIds = () => {
  try {
    return fs.readdirSync(COMPANIES).filter(d => safeCid(d) && fs.existsSync(path.join(COMPANIES, d, 'company.json')));
  } catch { return []; }
};
const companyName = cid => { try { return JSON.parse(fs.readFileSync(path.join(coDir(cid), 'company.json'), 'utf8')).companyName || cid; } catch { return cid; } };

const readJ = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const writeJ = (f, v) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(v, null, 2)); };

const usersFile = cid => path.join(coDir(cid), 'Users', 'users.json');
const readUsers = cid => { const u = readJ(usersFile(cid), []); return Array.isArray(u) ? u : []; };
const writeUsers = (cid, users) => writeJ(usersFile(cid), users);
const userDir = (cid, id) => path.join(coDir(cid), 'Users', String(id).replace(/[^\w-]/g, ''));
const emailCfgFile = cid => path.join(coDir(cid), 'email-config.json');
const readEmailCfg = cid => { try { return readJ(emailCfgFile(cid), {}) || {}; } catch { return {}; } };
const notifFile = cid => path.join(coDir(cid), 'Notifications.json');
const regsFile = cid => path.join(coDir(cid), 'vendor-registrations.json');
const tokensFile = cid => path.join(coDir(cid), 'auth-tokens.json');
const deletedDir = cid => path.join(coDir(cid), 'DeletedRecords');

/* the company of the request being handled (set by requireLogin), or '' */
const cidNow = () => (ctx.getStore() || {}).companyId || '';
const runAs = (companyId, fn) => ctx.run({ companyId }, fn);

module.exports = {
  ctx, runAs, cidNow, safeCid, coDir, companyIds, companyName, readJ, writeJ,
  usersFile, readUsers, writeUsers, userDir, emailCfgFile, readEmailCfg, notifFile, regsFile, tokensFile, deletedDir,
};
