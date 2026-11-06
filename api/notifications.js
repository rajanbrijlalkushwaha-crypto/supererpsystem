/**
 * notifications.js — persistent, per-user, in-app notifications.
 * Used to tell an approver "this record needs your approval" the moment
 * someone submits it, instead of them having to go looking for it.
 *
 * Storage: Database/Notifications.json (single global file — notifications
 * are user-scoped like users.json, not per-company, though each entry still
 * carries its companyId so the UI can switch company context on click).
 */
const express = require('express');
const path    = require('path');
const fs      = require('fs');
const { ROOT } = require('./helpers');

const router = express.Router();

const NOTIF_FILE = path.join(ROOT, 'Database', 'Notifications.json');
const USERS_FILE = path.join(ROOT, 'Database', 'users.json');

const readAll = () => {
  if (!fs.existsSync(NOTIF_FILE)) return [];
  try { return JSON.parse(fs.readFileSync(NOTIF_FILE, 'utf-8')); } catch { return []; }
};
const writeAll = (list) => {
  fs.mkdirSync(path.dirname(NOTIF_FILE), { recursive: true });
  fs.writeFileSync(NOTIF_FILE, JSON.stringify(list, null, 2));
};
const readUsers = () => {
  try { return JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8')); } catch { return []; }
};

/* Maps the approvals.js registry's module keys (lowercase, e.g. 'salesorder')
   to the permission-system's module keys (e.g. 'salesOrder') used in a
   user's `permissions` object — see frontend/src/utils/permissions.js. */
const PERMISSION_MODULE = {
  salesorder: 'salesOrder', purchaseorder: 'purchaseOrder',
  salesbill: 'salesBill',   purchasebill: 'purchaseBill',
  vendor: 'vendor',         client: 'client',
  deposit: 'accDeposit',    payment: 'accPayment',
  receipt: 'accReceipt',    journal: 'accJournal',
  expense: 'accExpense',    creditnote: 'accCreditNote', debitnote: 'accDebitNote',
};

/* Users allowed to approve a given module — admins always qualify;
   everyone else needs permissions[<module>].approve === true. */
function approversFor(approvalModuleKey) {
  const permKey = PERMISSION_MODULE[approvalModuleKey] || approvalModuleKey;
  return readUsers().filter(u =>
    u.active !== false &&
    (u.role === 'admin' || !!(u.permissions && u.permissions[permKey] && u.permissions[permKey].approve))
  );
}

/* Creates one notification per target user for an approval request.
   Pass `targetUserId` to notify one specific person, or omit it to notify
   every user with approve rights on `module`. Returns how many were notified. */
function notifyApprovers({ companyId, module, recordId, recordLabel, message, link, createdBy, targetUserId }) {
  const list = readAll();
  const now = new Date().toISOString();
  const targets = targetUserId
    ? readUsers().filter(u => String(u.id) === String(targetUserId) && u.active !== false)
    : approversFor(module);

  targets.forEach((u, i) => {
    list.push({
      id: Date.now() + i + Math.random(),
      type: 'approval_request',
      module, companyId, recordId,
      recordLabel: recordLabel || '',
      message: message || `${recordLabel || 'A record'} needs your approval`,
      link: link || '',
      targetUserId: u.id,
      createdBy: createdBy || '',
      createdAt: now,
      read: false, readAt: null,
    });
  });
  if (targets.length) writeAll(list);
  return targets.length;
}

/* ── GET /api/notifications?userId=&unreadOnly=1 ── */
router.get('/', (req, res) => {
  const { userId, unreadOnly } = req.query;
  let list = readAll();
  if (userId) list = list.filter(n => String(n.targetUserId) === String(userId));
  if (unreadOnly) list = list.filter(n => !n.read);
  list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(list.slice(0, 200));
});

/* ── GET /api/notifications/approvers/:module — for the approver-picker dropdown ── */
router.get('/approvers/:module', (req, res) => {
  res.json(approversFor(req.params.module).map(({ password, ...u }) => u));
});

/* ── PUT /api/notifications/read-all?userId= ── */
router.put('/read-all', (req, res) => {
  const userId = req.query.userId || req.body?.userId;
  const list = readAll();
  const now = new Date().toISOString();
  let count = 0;
  list.forEach(n => { if (String(n.targetUserId) === String(userId) && !n.read) { n.read = true; n.readAt = now; count++; } });
  if (count) writeAll(list);
  res.json({ success: true, count });
});

/* ── PUT /api/notifications/:id/read ── */
router.put('/:id/read', (req, res) => {
  const list = readAll();
  const n = list.find(x => String(x.id) === String(req.params.id));
  if (!n) return res.status(404).json({ error: 'Not found' });
  n.read = true; n.readAt = new Date().toISOString();
  writeAll(list);
  res.json({ success: true });
});

module.exports = { router, notifyApprovers, approversFor };
