/**
 * One-time move (runs at server start, does nothing once done): the files that were shared by all companies
 * go into each company's own folder (see tenant.js).
 *
 *   Database/users.json + Database/Users/<id>/   → every company: Companies/<c>/Users/ (each company gets its own copy
 *                                                  of the users — remove the ones who do not work there)
 *   Database/email-config.json                   → every company: Companies/<c>/email-config.json (change per company)
 *   Database/Notifications.json                  → split by company
 *   Database/vendor-registrations.json           → split by company (no company yet → the default company)
 *   Database/invite-tokens.json, reset-tokens.json → links still valid, to the company of their user
 *   Database/DeletedRecords/<c>/                 → Companies/<c>/DeletedRecords/
 *   Database/Companies/logos/, Companies/<c>.json  (old copies — every company has its own logo / company.json)
 *
 * The old files are not deleted here: they are moved to Database/_old-shared/ so nothing is lost. */
const fs = require('fs');
const path = require('path');
const { ROOT } = require('./helpers');
const T = require('./tenant');

const DB = path.join(ROOT, 'Database');
const OLD = path.join(DB, '_old-shared');
const exists = f => fs.existsSync(f);
const moveAway = rel => {
  const from = path.join(DB, rel);
  if (!exists(from)) return;
  let to = path.join(OLD, rel);
  if (exists(to)) to = `${to}-${Date.now()}`;   // moved once already — keep both, never overwrite
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.renameSync(from, to);
};
const copyDir = (from, to) => {
  if (!exists(from)) return;
  fs.mkdirSync(to, { recursive: true });
  fs.readdirSync(from, { withFileTypes: true }).forEach(e => {
    const a = path.join(from, e.name), b = path.join(to, e.name);
    if (e.isDirectory()) copyDir(a, b);
    else if (!exists(b)) fs.copyFileSync(a, b);
  });
};

function run() {
  const cids = T.companyIds();
  if (!cids.length) return;
  const log = [];
  const defCid = cids.find(c => (T.readJ(path.join(T.coDir(c), 'company.json'), {}) || {}).isDefault) || cids[0];

  // users — each company its own copy (same usernames / passwords as before)
  const usersOld = path.join(DB, 'users.json');
  if (exists(usersOld)) {
    const users = T.readJ(usersOld, []);
    cids.forEach(c => {
      if (!exists(T.usersFile(c))) { T.writeUsers(c, users); log.push(`${c}: ${users.length} users`); }
      copyDir(path.join(DB, 'Users'), path.join(T.coDir(c), 'Users'));
    });
    moveAway('users.json'); moveAway('Users');
  }
  // mail account — each company its own (starts as the old shared one)
  const cfgOld = path.join(DB, 'email-config.json');
  if (exists(cfgOld)) {
    const cfg = T.readJ(cfgOld, {});
    cids.forEach(c => { if (!exists(T.emailCfgFile(c))) { T.writeJ(T.emailCfgFile(c), { ...cfg, companyId: c }); log.push(`${c}: email settings`); } });
    moveAway('email-config.json');
  }
  // notifications
  const notOld = path.join(DB, 'Notifications.json');
  if (exists(notOld)) {
    const all = T.readJ(notOld, []);
    cids.forEach(c => {
      const mine = all.filter(n => String(n.companyId) === c);
      if (mine.length) { T.writeJ(T.notifFile(c), [...T.readJ(T.notifFile(c), []), ...mine]); log.push(`${c}: ${mine.length} notifications`); }
    });
    moveAway('Notifications.json');
  }
  // supplier sign-ups (vendor portal)
  const regOld = path.join(DB, 'vendor-registrations.json');
  if (exists(regOld)) {
    const all = T.readJ(regOld, []);
    cids.forEach(c => {
      const mine = all.filter(r => (cids.includes(String(r.companyId)) ? String(r.companyId) : defCid) === c);
      if (mine.length) { T.writeJ(T.regsFile(c), [...T.readJ(T.regsFile(c), []), ...mine]); log.push(`${c}: ${mine.length} supplier sign-ups`); }
    });
    moveAway('vendor-registrations.json');
  }
  // invite / password-reset links still valid → the company of their user
  ['invite-tokens.json', 'reset-tokens.json'].forEach(f => {
    const old = path.join(DB, f);
    if (!exists(old)) return;
    const kind = f.startsWith('invite') ? 'invite' : 'reset';
    T.readJ(old, []).filter(t => t && t.expiresAt > Date.now()).forEach(t => cids.forEach(c => {
      if (!T.readUsers(c).some(u => u.id === t.userId)) return;
      const cur = T.readJ(T.tokensFile(c), []);
      if (!cur.some(x => x.token === t.token)) T.writeJ(T.tokensFile(c), [...cur, { ...t, kind }]);
    }));
    moveAway(f);
  });
  // deleted-record copies
  const delOld = path.join(DB, 'DeletedRecords');
  if (exists(delOld)) {
    fs.readdirSync(delOld).filter(c => cids.includes(c)).forEach(c => { copyDir(path.join(delOld, c), T.deletedDir(c)); log.push(`${c}: deleted records`); });
    moveAway('DeletedRecords');
  }
  // old duplicates: the shared logo folder, Companies/<c>.json, an old users copy
  if (exists(path.join(DB, 'Companies', 'logos'))) moveAway(path.join('Companies', 'logos'));
  fs.readdirSync(path.join(DB, 'Companies')).filter(f => /^C\d+\.json$/.test(f) && exists(path.join(DB, 'Companies', f.replace(/\.json$/, ''), 'company.json')))
    .forEach(f => moveAway(path.join('Companies', f)));
  if (exists(path.join(DB, 'tempuser'))) moveAway('tempuser');

  if (log.length) console.log(`[company data] moved into each company's folder — ${log.join('; ')}. Old shared files kept in Database/_old-shared/`);
}

module.exports = { run };
