/**
 * ledger.js — Ledger Groups, Ledger Master, Vouchers (double-entry)
 * Storage: Database/Companies/{cid}/Ledger/
 *   groups.json        — account groups (seeded with Tally standard groups)
 *   accounts.json      — ledger master (employee, contractor, expense a/c, etc.)
 *   vouchers/{id}.json — individual double-entry vouchers
 */
const express = require('express');
const path    = require('path');
const fs      = require('fs');
const { ROOT, saveJson } = require('./helpers');

const router = express.Router();

const cid       = (req) => req.query.companyId || req.body?.companyId || '';
const lDir      = (co)  => path.join(ROOT, 'Database', 'Companies', co, 'Ledger');
const groupsFile= (co)  => path.join(lDir(co), 'groups.json');
const accsFile  = (co)  => path.join(lDir(co), 'accounts.json');
const vDir      = (co)  => path.join(lDir(co), 'vouchers');

const ensureDir = (d) => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); };

const readJson  = (fp, def) => {
  try { return fs.existsSync(fp) ? JSON.parse(fs.readFileSync(fp, 'utf-8')) : def; }
  catch { return def; }
};

/* ── Standard Tally-style account groups ── */
const SEED_GROUPS = [
  { id:'capital',       name:'Capital Account',            nature:'Cr', parent:null,          isSystem:true },
  { id:'reserves',      name:'Reserves & Surplus',         nature:'Cr', parent:'capital',      isSystem:true },
  { id:'curr-liab',     name:'Current Liabilities',        nature:'Cr', parent:null,           isSystem:true },
  { id:'sundry-cred',   name:'Sundry Creditors',           nature:'Cr', parent:'curr-liab',    isSystem:true },
  { id:'employee-pay',  name:'Employee Payables',          nature:'Cr', parent:'curr-liab',    isSystem:true },
  { id:'other-liab',    name:'Other Current Liabilities',  nature:'Cr', parent:'curr-liab',    isSystem:true },
  { id:'duties-taxes',  name:'Duties & Taxes',             nature:'Cr', parent:'curr-liab',    isSystem:true },
  { id:'loans-liab',    name:'Loans (Liability)',          nature:'Cr', parent:null,           isSystem:true },
  { id:'curr-assets',   name:'Current Assets',             nature:'Dr', parent:null,           isSystem:true },
  { id:'sundry-debt',   name:'Sundry Debtors',             nature:'Dr', parent:'curr-assets',  isSystem:true },
  { id:'cash',          name:'Cash-in-Hand',               nature:'Dr', parent:'curr-assets',  isSystem:true },
  { id:'bank',          name:'Bank Accounts',              nature:'Dr', parent:'curr-assets',  isSystem:true },
  { id:'fixed-assets',  name:'Fixed Assets',               nature:'Dr', parent:null,           isSystem:true },
  { id:'indirect-exp',  name:'Indirect Expenses',          nature:'Dr', parent:null,           isSystem:true },
  { id:'salary-exp',    name:'Salary Expenses',            nature:'Dr', parent:'indirect-exp', isSystem:true },
  { id:'direct-exp',    name:'Direct Expenses',            nature:'Dr', parent:null,           isSystem:true },
  { id:'indirect-inc',  name:'Indirect Income',            nature:'Cr', parent:null,           isSystem:true },
  { id:'direct-inc',    name:'Direct Income (Sales)',      nature:'Cr', parent:null,           isSystem:true },
];

function seedGroups(co) {
  const fp = groupsFile(co);
  if (fs.existsSync(fp)) return;
  ensureDir(lDir(co));
  fs.writeFileSync(fp, JSON.stringify(SEED_GROUPS, null, 2));
}

function loadGroups(co)   { seedGroups(co); return readJson(groupsFile(co), []); }
function loadAccounts(co) { return readJson(accsFile(co), []); }

/* Read party records from subdirectory structure: dir/{id}/{id}.json */
function readParties(dir) {
  if (!fs.existsSync(dir)) return [];
  const results = [];
  fs.readdirSync(dir).forEach(entry => {
    const ep = path.join(dir, entry);
    try {
      if (fs.statSync(ep).isDirectory()) {
        const mf = path.join(ep, `${entry}.json`);
        if (fs.existsSync(mf)) results.push(JSON.parse(fs.readFileSync(mf, 'utf-8')));
      } else if (entry.endsWith('.json')) {
        results.push(JSON.parse(fs.readFileSync(ep, 'utf-8')));
      }
    } catch {}
  });
  return results;
}
function loadVouchers(co) {
  const d = vDir(co);
  if (!fs.existsSync(d)) return [];
  return fs.readdirSync(d)
    .filter(f => f.endsWith('.json'))
    .map(f => { try { return JSON.parse(fs.readFileSync(path.join(d, f), 'utf-8')); } catch { return null; } })
    .filter(Boolean);
}

function nextAccId(co) {
  const accs = loadAccounts(co);
  const nums = accs.map(a => parseInt((a.id||'').replace(/\D/g,''))||0);
  return `L${String((nums.length ? Math.max(...nums) : 0) + 1).padStart(4,'0')}`;
}
function nextVId(co) {
  const vs = loadVouchers(co);
  const nums = vs.map(v => parseInt((v.id||'').replace(/\D/g,''))||0);
  return `V${String((nums.length ? Math.max(...nums) : 0) + 1).padStart(4,'0')}`;
}

/* ══════════════════════════════════════════
   ACCOUNT GROUPS
══════════════════════════════════════════ */
router.get('/groups', (req, res) => {
  try {
    const co = cid(req);
    if (!co) return res.status(400).json({ error: 'companyId required' });
    res.json(loadGroups(co));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/groups', (req, res) => {
  try {
    const co = cid(req);
    if (!co) return res.status(400).json({ error: 'companyId required' });
    const groups = loadGroups(co);
    const { name, nature, parent } = req.body;
    if (!name || !nature) return res.status(400).json({ error: 'name and nature required' });
    const id = name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/-$/,'');
    if (groups.find(g => g.id === id || g.name.toLowerCase() === name.toLowerCase()))
      return res.status(409).json({ error: 'Group already exists' });
    const g = { id, name, nature, parent: parent || null, isSystem: false, createdAt: new Date().toISOString() };
    groups.push(g);
    fs.writeFileSync(groupsFile(co), JSON.stringify(groups, null, 2));
    res.json({ success: true, group: g });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/groups/:id', (req, res) => {
  try {
    const co = cid(req);
    if (!co) return res.status(400).json({ error: 'companyId required' });
    const groups = loadGroups(co);
    const idx = groups.findIndex(g => g.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Not found' });
    if (groups[idx].isSystem) return res.status(403).json({ error: 'Cannot delete system group' });
    groups.splice(idx, 1);
    fs.writeFileSync(groupsFile(co), JSON.stringify(groups, null, 2));
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ══════════════════════════════════════════
   LEDGER MASTER (ACCOUNTS)
══════════════════════════════════════════ */
router.get('/accounts', (req, res) => {
  try {
    const co = cid(req);
    if (!co) return res.status(400).json({ error: 'companyId required' });
    const accounts = loadAccounts(co);
    const vouchers = loadVouchers(co);
    const groups   = loadGroups(co);

    // Build balance map from vouchers
    const balMap = {};
    vouchers.forEach(v => {
      (v.entries || []).forEach(e => {
        if (!balMap[e.accountId]) balMap[e.accountId] = { dr: 0, cr: 0 };
        balMap[e.accountId].dr += parseFloat(e.dr) || 0;
        balMap[e.accountId].cr += parseFloat(e.cr) || 0;
      });
    });

    // Manual accounts with live balance
    const manualAccounts = accounts.map(a => {
      const bal = balMap[a.id] || { dr: 0, cr: 0 };
      const ob = parseFloat(a.openingBalance) || 0;
      const obNature = a.openingBalanceNature || a.groupNature || 'Dr';
      const totalDr = (obNature === 'Dr' ? ob : 0) + bal.dr;
      const totalCr = (obNature === 'Cr' ? ob : 0) + bal.cr;
      const balance = totalDr - totalCr;
      return { ...a, totalDr: +totalDr.toFixed(2), totalCr: +totalCr.toFixed(2), balance: +balance.toFixed(2) };
    });

    // Auto-include clients as Sundry Debtors
    const dG = groups.find(g => g.id === 'sundry-debt') || { name: 'Sundry Debtors', nature: 'Dr' };
    const clientAccounts = readParties(path.join(ROOT, 'Database', 'Companies', co, 'Client'))
      .filter(c => c.clientId)
      .map(c => {
        const accId = `CL-${c.clientId}`;
        const bal = balMap[accId] || { dr: 0, cr: 0 };
        const balance = bal.dr - bal.cr;
        return {
          id: accId,
          name: c.clientName || c.companyName || `Client ${c.clientId}`,
          groupId: 'sundry-debt', groupName: dG.name, groupNature: 'Dr',
          accountType: 'receivable',
          openingBalance: 0, openingBalanceNature: 'Dr',
          isAutoParty: true, partyType: 'client', partyId: c.clientId,
          totalDr: +bal.dr.toFixed(2), totalCr: +bal.cr.toFixed(2),
          balance: +balance.toFixed(2),
        };
      });

    // Auto-include vendors as Sundry Creditors
    const cG = groups.find(g => g.id === 'sundry-cred') || { name: 'Sundry Creditors', nature: 'Cr' };
    const vendorAccounts = readParties(path.join(ROOT, 'Database', 'Companies', co, 'Vendor'))
      .filter(v => v.vendorId)
      .map(v => {
        const accId = `VN-${v.vendorId}`;
        const bal = balMap[accId] || { dr: 0, cr: 0 };
        const balance = bal.dr - bal.cr;
        return {
          id: accId,
          name: v.vendorName || v.companyName || `Vendor ${v.vendorId}`,
          groupId: 'sundry-cred', groupName: cG.name, groupNature: 'Cr',
          accountType: 'payable',
          openingBalance: 0, openingBalanceNature: 'Cr',
          isAutoParty: true, partyType: 'vendor', partyId: v.vendorId,
          totalDr: +bal.dr.toFixed(2), totalCr: +bal.cr.toFixed(2),
          balance: +balance.toFixed(2),
        };
      });

    res.json([...manualAccounts, ...clientAccounts, ...vendorAccounts]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/accounts', (req, res) => {
  try {
    const co = cid(req);
    if (!co) return res.status(400).json({ error: 'companyId required' });
    const { name, groupId, openingBalance = 0, openingBalanceNature, accountType = 'general', notes = '' } = req.body;
    if (!name || !groupId) return res.status(400).json({ error: 'name and groupId required' });
    const groups = loadGroups(co);
    const group  = groups.find(g => g.id === groupId);
    if (!group) return res.status(400).json({ error: 'Group not found' });
    const accounts = loadAccounts(co);
    if (accounts.find(a => a.name.toLowerCase() === name.toLowerCase()))
      return res.status(409).json({ error: 'Account with this name already exists' });
    const id  = nextAccId(co);
    const now = new Date().toISOString();
    const rec = {
      id, name, groupId, groupName: group.name, groupNature: group.nature,
      openingBalance: parseFloat(openingBalance) || 0,
      openingBalanceNature: openingBalanceNature || group.nature,
      accountType, notes, companyId: co, createdAt: now, updatedAt: now,
    };
    accounts.push(rec);
    fs.writeFileSync(accsFile(co), JSON.stringify(accounts, null, 2));
    res.json({ success: true, account: rec });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/accounts/:id', (req, res) => {
  try {
    const co = cid(req);
    if (!co) return res.status(400).json({ error: 'companyId required' });
    const accounts = loadAccounts(co);
    const idx = accounts.findIndex(a => a.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Not found' });
    const groups  = loadGroups(co);
    const groupId = req.body.groupId || accounts[idx].groupId;
    const group   = groups.find(g => g.id === groupId);
    accounts[idx] = {
      ...accounts[idx], ...req.body, id: req.params.id,
      groupName: group?.name || accounts[idx].groupName,
      groupNature: group?.nature || accounts[idx].groupNature,
      updatedAt: new Date().toISOString(),
    };
    fs.writeFileSync(accsFile(co), JSON.stringify(accounts, null, 2));
    res.json({ success: true, account: accounts[idx] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/accounts/:id', (req, res) => {
  try {
    const co = cid(req);
    if (!co) return res.status(400).json({ error: 'companyId required' });
    const accounts = loadAccounts(co);
    const idx = accounts.findIndex(a => a.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Not found' });
    accounts.splice(idx, 1);
    fs.writeFileSync(accsFile(co), JSON.stringify(accounts, null, 2));
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ══════════════════════════════════════════
   VOUCHERS  (double-entry)
══════════════════════════════════════════ */
router.get('/vouchers', (req, res) => {
  try {
    const co = cid(req);
    if (!co) return res.status(400).json({ error: 'companyId required' });
    let vs = loadVouchers(co);
    if (req.query.accountId)
      vs = vs.filter(v => (v.entries||[]).some(e => e.accountId === req.query.accountId));
    if (req.query.voucherType)
      vs = vs.filter(v => v.voucherType === req.query.voucherType);
    vs.sort((a, b) => new Date(a.date) - new Date(b.date));
    res.json(vs);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/vouchers', (req, res) => {
  try {
    const co = cid(req);
    if (!co) return res.status(400).json({ error: 'companyId required' });
    const { entries, date, narration, voucherType = 'Journal', costCenter = '', costCenterType = '', refNo = '' } = req.body;
    if (!entries || entries.length < 2) return res.status(400).json({ error: 'At least 2 entries required' });
    const totalDr = entries.reduce((s, e) => s + (parseFloat(e.dr)||0), 0);
    const totalCr = entries.reduce((s, e) => s + (parseFloat(e.cr)||0), 0);
    if (Math.abs(totalDr - totalCr) > 0.01)
      return res.status(400).json({ error: `DR (${totalDr.toFixed(2)}) ≠ CR (${totalCr.toFixed(2)})` });
    ensureDir(vDir(co));
    const id  = nextVId(co);
    const now = new Date().toISOString();
    const rec = {
      id,
      date: date || now.slice(0,10),
      narration: narration || '',
      voucherType,
      entries: entries.map(e => ({
        accountId:   e.accountId,
        accountName: e.accountName || '',
        dr: +(parseFloat(e.dr)||0).toFixed(2),
        cr: +(parseFloat(e.cr)||0).toFixed(2),
      })),
      costCenter,
      costCenterType,
      refNo,
      totalAmount: +totalDr.toFixed(2),
      companyId: co,
      createdAt: now,
    };
    fs.writeFileSync(path.join(vDir(co), `${id}.json`), JSON.stringify(rec, null, 2));
    res.json({ success: true, voucher: rec });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/vouchers/:id', (req, res) => {
  try {
    const fp = path.join(vDir(cid(req)), `${req.params.id}.json`);
    if (!fs.existsSync(fp)) return res.status(404).json({ error: 'Not found' });
    res.json(JSON.parse(fs.readFileSync(fp, 'utf-8')));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/vouchers/:id', (req, res) => {
  try {
    const fp = path.join(vDir(cid(req)), `${req.params.id}.json`);
    if (!fs.existsSync(fp)) return res.status(404).json({ error: 'Not found' });
    fs.unlinkSync(fp);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ══════════════════════════════════════════
   LEDGER STATEMENT for one account
══════════════════════════════════════════ */
router.get('/statement/:accountId', (req, res) => {
  try {
    const co = cid(req);
    if (!co) return res.status(400).json({ error: 'companyId required' });
    const accounts = loadAccounts(co);
    const account  = accounts.find(a => a.id === req.params.accountId);
    if (!account) return res.status(404).json({ error: 'Account not found' });

    const vouchers = loadVouchers(co)
      .filter(v => (v.entries||[]).some(e => e.accountId === req.params.accountId));
    vouchers.sort((a, b) => new Date(a.date) - new Date(b.date));

    const ob      = parseFloat(account.openingBalance) || 0;
    const obNature = account.openingBalanceNature || account.groupNature || 'Dr';
    let balance   = obNature === 'Dr' ? ob : -ob;

    const entries = vouchers.map(v => {
      const me = (v.entries||[]).find(e => e.accountId === req.params.accountId) || {};
      const dr = parseFloat(me.dr) || 0;
      const cr = parseFloat(me.cr) || 0;
      balance += dr - cr;
      return {
        voucherId: v.id, date: v.date, narration: v.narration,
        voucherType: v.voucherType, refNo: v.refNo || '',
        costCenter: v.costCenter || '', costCenterType: v.costCenterType || '',
        dr, cr,
        balance:      +Math.abs(balance).toFixed(2),
        balanceLabel: balance >= 0 ? 'Dr' : 'Cr',
      };
    });

    res.json({
      account,
      openingBalance:      ob,
      openingBalanceNature: obNature,
      closingBalance:      +Math.abs(balance).toFixed(2),
      closingBalanceNature: balance >= 0 ? 'Dr' : 'Cr',
      entries,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ══════════════════════════════════════════
   MIGRATE existing Expenses → Vouchers
══════════════════════════════════════════ */
router.post('/migrate-expenses', (req, res) => {
  try {
    const co = cid(req);
    if (!co) return res.status(400).json({ error: 'companyId required' });
    seedGroups(co);

    const expDir = path.join(ROOT, 'Database', 'Companies', co, 'Expenses');
    if (!fs.existsSync(expDir)) return res.json({ success: true, migrated: 0 });

    const accounts = loadAccounts(co);

    // Ensure default migration accounts exist
    let genExpAcc = accounts.find(a => a.name === 'General Expense');
    let apAcc     = accounts.find(a => a.name === 'Accounts Payable (Expenses)');
    if (!genExpAcc) {
      genExpAcc = { id: nextAccId(co), name: 'General Expense', groupId: 'indirect-exp',
        groupName: 'Indirect Expenses', groupNature: 'Dr', openingBalance: 0,
        openingBalanceNature: 'Dr', accountType: 'expense', notes: 'Auto-created',
        companyId: co, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      accounts.push(genExpAcc);
    }
    if (!apAcc) {
      apAcc = { id: nextAccId(co), name: 'Accounts Payable (Expenses)', groupId: 'curr-liab',
        groupName: 'Current Liabilities', groupNature: 'Cr', openingBalance: 0,
        openingBalanceNature: 'Cr', accountType: 'payable', notes: 'Auto-created',
        companyId: co, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      accounts.push(apAcc);
    }
    fs.writeFileSync(accsFile(co), JSON.stringify(accounts, null, 2));

    ensureDir(vDir(co));
    const existing = loadVouchers(co);
    const migratedIds = new Set(existing.map(v => v.sourceExpenseId).filter(Boolean));

    let migrated = 0;
    fs.readdirSync(expDir).filter(f => f.endsWith('.json')).forEach(f => {
      try {
        const fp  = path.join(expDir, f);
        const exp = JSON.parse(fs.readFileSync(fp, 'utf-8'));
        if (migratedIds.has(String(exp.expenseId))) return;
        const amount = parseFloat(exp.grandTotal || exp.amount) || 0;
        if (!amount) return;
        const id  = nextVId(co);
        const rec = {
          id,
          date: (exp.date || exp.createdAt || new Date().toISOString()).slice(0,10),
          narration: exp.description || exp.expenseType || 'Expense',
          voucherType: 'Expense',
          entries: [
            { accountId: genExpAcc.id, accountName: 'General Expense', dr: amount, cr: 0 },
            { accountId: apAcc.id,     accountName: 'Accounts Payable (Expenses)', dr: 0, cr: amount },
          ],
          costCenter: exp.projectId || exp.orderId || '',
          costCenterType: exp.projectId ? 'project' : '',
          refNo: String(exp.expenseId),
          totalAmount: amount,
          sourceExpenseId: String(exp.expenseId),
          companyId: co,
          createdAt: new Date().toISOString(),
        };
        fs.writeFileSync(path.join(vDir(co), `${id}.json`), JSON.stringify(rec, null, 2));
        existing.push(rec);
        migratedIds.add(String(exp.expenseId));
        migrated++;
      } catch {}
    });

    res.json({ success: true, migrated, message: `Migrated ${migrated} expense(s)` });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
