/**
 * accounts.js — JSON-only storage for Banks, Payments, Journals, Dues, Expenses, Assets
 * All data stored in: Database/Companies/{companyId}/{Module}/
 * Bank accounts: Database/Accounts/Banks/ (global, not per-company)
 */
const express = require('express');
const path    = require('path');
const fs      = require('fs');
const { ROOT, saveJson, auditEntry, pushAudit, upload, saveUploadedFiles, resolveUser } = require('./helpers');
const sqlite = require('./sqlite');
const { addSystemLog } = require('./communication');
const { notifyApprovers } = require('./notifications');

const router = express.Router();

/* ── path helpers ── */
// Banks are per-company: Database/Companies/{cid}/Accounts/Banks/
const banksDir   = (cid)        => path.join(ROOT, 'Database', 'Companies', cid, 'Accounts', 'Banks');
const bankFile   = (cid, id)    => path.join(banksDir(cid), `${id}.json`);


const coDir      = (cid, mod)   => path.join(ROOT, 'Database', 'Companies', cid, mod);
const coFile     = (cid, mod, id) => path.join(coDir(cid, mod), `${id}.json`);

/* ── helpers ── */
const readAll = (dir) => sqlite.listFlatByDir(dir);

const nextId = (dir, base) => {
  if (!fs.existsSync(dir)) return base;
  let max = base - 1;
  fs.readdirSync(dir).forEach(f => {
    const n = parseInt(f, 10);
    if (!isNaN(n) && n > max) max = n;
  });
  return max + 1;
};

const cid = (req) => req.query.companyId || req.body?.companyId || '';

const ensureDir = (d) => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); };

/* ════════════════════════════════════════════════════════
   BANK ACCOUNTS  — per company
   Path: Database/Companies/{companyId}/Accounts/Banks/{bankId}.json
   Each company has completely separate bank accounts.
════════════════════════════════════════════════════════ */

router.get('/banks', (req, res) => {
  try {
    const companyId = req.query.companyId || cid(req);
    if (!companyId) return res.status(400).json({ error: 'companyId required' });

    const records = readAll(banksDir(companyId)).sort((a, b) => (b.bankId || 0) - (a.bankId || 0));

    // Compute live balance from company's confirmed payments/receipts
    const payments = readAll(coDir(companyId, 'Payments'));
    const result = records.map(bank => {
      const confirmed = payments.filter(p => String(p.bankId) === String(bank.bankId) && p.status === 'confirmed');
      const totalIn  = confirmed.filter(p => p.type === 'receipt').reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
      const totalOut = confirmed.filter(p => p.type === 'payment').reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
      const currentBalance = (parseFloat(bank.openingBalance) || 0) + totalIn - totalOut;
      return { ...bank, currentBalance };
    });
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/banks', (req, res) => {
  try {
    const companyId = cid(req);
    if (!companyId) return res.status(400).json({ error: 'companyId required' });
    const { bankName, accountHolder, accountNumber, ifscCode, accountType = 'Current',
            openingBalance = 0, notes, status = 'active' } = req.body;
    if (!bankName || !accountNumber)
      return res.status(400).json({ error: 'Bank name and account number are required.' });

    const dir = banksDir(companyId);
    ensureDir(dir);
    const bankId = nextId(dir, 700001);
    const ob = parseFloat(openingBalance) || 0;
    const now = new Date().toISOString();
    const rec = { bankId, companyId, bankName, accountHolder, accountNumber, ifscCode, accountType,
                  openingBalance: ob, currentBalance: ob, notes, status, createdAt: now, updatedAt: now };
    saveJson(bankFile(companyId, bankId), rec);
    res.json({ success: true, bankId, message: `Bank account created with ID: ${bankId}` });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/banks/:id', (req, res) => {
  try {
    const companyId = cid(req);
    if (!companyId) return res.status(400).json({ error: 'companyId required' });
    const fp = bankFile(companyId, req.params.id);
    if (!fs.existsSync(fp)) return res.status(404).json({ error: 'Bank account not found' });
    const existing = JSON.parse(fs.readFileSync(fp, 'utf-8'));
    const updated = { ...existing, ...req.body, bankId: existing.bankId, companyId, updatedAt: new Date().toISOString() };
    saveJson(fp, updated);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/banks/:id', (req, res) => {
  try {
    const companyId = cid(req);
    if (!companyId) return res.status(400).json({ error: 'companyId required' });
    const fp = bankFile(companyId, req.params.id);
    if (!fs.existsSync(fp)) return res.status(404).json({ error: 'Bank account not found' });
    fs.unlinkSync(fp);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ════════════════════════════════════════════════════════
   PAYMENTS & RECEIPTS  — per company
════════════════════════════════════════════════════════ */
router.get('/payments', (req, res) => {
  try {
    const companyId = cid(req);
    const dir = coDir(companyId, 'Payments');
    const records = readAll(dir).sort((a, b) => (b.paymentId || 0) - (a.paymentId || 0));
    res.json(records);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/payments', (req, res) => {
  try {
    const companyId = cid(req);
    if (!companyId) return res.status(400).json({ error: 'companyId required' });
    const dir = coDir(companyId, 'Payments');
    ensureDir(dir);
    const paymentId = nextId(dir, 800001);
    const now = new Date().toISOString();
    const rec = { paymentId, ...req.body, companyId, status: req.body.status || 'pending', createdAt: now, updatedAt: now,
      audit: [auditEntry(req, 'created')] };
    saveJson(coFile(companyId, 'Payments', paymentId), rec);

    if (rec.type === 'receipt' && rec.orderId) {
      const fmtAmt = n => Number(n || 0).toLocaleString('en-IN');
      addSystemLog(companyId, rec.orderId, 'System',
        `Advance/Receipt received — ₹${fmtAmt(rec.amount)} via ${rec.paymentMode || 'cash'}` +
        (rec.reference || rec.referenceNo ? ` (Ref: ${rec.reference || rec.referenceNo})` : ''),
        rec.date);
    }

    if (rec.status === 'pending') {
      const submitter = resolveUser(req);
      const mod = rec.type === 'receipt' ? 'receipt' : 'payment';
      notifyApprovers({
        companyId, module: mod, recordId: paymentId,
        recordLabel: `${rec.type === 'receipt' ? 'Receipt' : 'Payment'} ${paymentId} — ${rec.party || ''}`,
        message: `${rec.type === 'receipt' ? 'Receipt' : 'Payment'} ${paymentId} (${rec.party || ''}) needs your approval`,
        link: rec.type === 'receipt' ? '/account/payment/view' : '/account/payment/view',
        createdBy: submitter?.name || submitter?.username || 'System',
        targetUserId: req.body.approverId || null,
      });
    }

    res.json({ success: true, paymentId, message: `Payment recorded with ID: ${paymentId}` });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/payments/:id', (req, res) => {
  try {
    const companyId = cid(req);
    const fp = coFile(companyId, 'Payments', req.params.id);
    if (!fs.existsSync(fp)) return res.status(404).json({ error: 'Not found' });
    const existing = JSON.parse(fs.readFileSync(fp, 'utf-8'));
    const newStatus = req.body.status || existing.status;
    const oldStatus = existing.status;
    const action = newStatus !== oldStatus
      ? (newStatus === 'confirmed' ? 'approved' : newStatus === 'rejected' ? 'rejected' : 'status_changed')
      : 'edited';
    const extra = newStatus !== oldStatus ? { from: oldStatus, to: newStatus } : {};
    const updated = { ...existing, ...req.body, paymentId: existing.paymentId, updatedAt: new Date().toISOString(),
      audit: pushAudit(existing, req, action, extra) };
    saveJson(fp, updated);

    if (newStatus === 'pending' && oldStatus !== 'pending') {
      const submitter = resolveUser(req);
      const mod = updated.type === 'receipt' ? 'receipt' : 'payment';
      notifyApprovers({
        companyId, module: mod, recordId: existing.paymentId,
        recordLabel: `${updated.type === 'receipt' ? 'Receipt' : 'Payment'} ${existing.paymentId} — ${updated.party || ''}`,
        message: `${updated.type === 'receipt' ? 'Receipt' : 'Payment'} ${existing.paymentId} (${updated.party || ''}) needs your approval`,
        link: updated.type === 'receipt' ? '/account/payment/view' : '/account/payment/view',
        createdBy: submitter?.name || submitter?.username || 'System',
        targetUserId: req.body.approverId || null,
      });
    }

    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/payments/:id', (req, res) => {
  try {
    const fp = coFile(cid(req), 'Payments', req.params.id);
    if (!fs.existsSync(fp)) return res.status(404).json({ error: 'Not found' });
    res.json(JSON.parse(fs.readFileSync(fp, 'utf-8')));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/payments/:id', (req, res) => {
  try {
    const fp = coFile(cid(req), 'Payments', req.params.id);
    if (!fs.existsSync(fp)) return res.status(404).json({ error: 'Not found' });
    const rec = JSON.parse(fs.readFileSync(fp, 'utf-8'));
    const who = resolveUser(req);
    /* an approved (confirmed) payment is in the books — only an Admin may delete it */
    if (rec.status === 'confirmed' && who?.role !== 'admin') return res.status(403).json({ error: 'Only an Admin can delete an approved payment.' });
    /* keep a copy of every deleted payment (outside the company data, so it is never counted) to recover a mistake */
    try {
      const bin = path.join(ROOT, 'Database', 'DeletedRecords', String(cid(req)), 'Payments');
      fs.mkdirSync(bin, { recursive: true });
      fs.writeFileSync(path.join(bin, `${req.params.id}-${Date.now()}.json`),
        JSON.stringify({ ...rec, deletedAt: new Date().toISOString(), deletedBy: who || { name: 'Unknown' } }, null, 2));
    } catch (e) { return res.status(500).json({ error: 'Could not keep a backup copy — not deleted: ' + e.message }); }
    fs.unlinkSync(fp);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ════════════════════════════════════════════════════════
   JOURNALS  — per company
════════════════════════════════════════════════════════ */
router.get('/journals', (req, res) => {
  try {
    const companyId = cid(req);
    const dir = coDir(companyId, 'Journals');
    const records = readAll(dir).sort((a, b) => (b.journalId || 0) - (a.journalId || 0));
    res.json(records);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/journals', (req, res) => {
  try {
    const companyId = cid(req);
    if (!companyId) return res.status(400).json({ error: 'companyId required' });
    const dir = coDir(companyId, 'Journals');
    ensureDir(dir);
    const journalId = nextId(dir, 900001);
    const now = new Date().toISOString();
    const rec = { journalId, ...req.body, companyId, createdAt: now, updatedAt: now };
    saveJson(coFile(companyId, 'Journals', journalId), rec);

    if (rec.status === 'pending') {
      const submitter = resolveUser(req);
      notifyApprovers({
        companyId, module: 'journal', recordId: journalId,
        recordLabel: `Journal ${journalId}`,
        message: `Journal ${journalId} needs your approval`,
        link: '/account/journal/view',
        createdBy: submitter?.name || submitter?.username || 'System',
        targetUserId: req.body.approverId || null,
      });
    }

    res.json({ success: true, journalId, message: `Journal created with ID: ${journalId}` });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/journals/:id', (req, res) => {
  try {
    const fp = coFile(cid(req), 'Journals', req.params.id);
    if (!fs.existsSync(fp)) return res.status(404).json({ error: 'Not found' });
    res.json(JSON.parse(fs.readFileSync(fp, 'utf-8')));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/journals/:id', (req, res) => {
  try {
    const fp = coFile(cid(req), 'Journals', req.params.id);
    if (!fs.existsSync(fp)) return res.status(404).json({ error: 'Not found' });
    const existing = JSON.parse(fs.readFileSync(fp, 'utf-8'));
    const updated  = { ...existing, ...req.body, journalId: existing.journalId, updatedAt: new Date().toISOString() };
    saveJson(fp, updated);

    if (updated.status === 'pending' && existing.status !== 'pending') {
      const submitter = resolveUser(req);
      notifyApprovers({
        companyId: cid(req), module: 'journal', recordId: existing.journalId,
        recordLabel: `Journal ${existing.journalId}`,
        message: `Journal ${existing.journalId} needs your approval`,
        link: '/account/journal/view',
        createdBy: submitter?.name || submitter?.username || 'System',
        targetUserId: req.body.approverId || null,
      });
    }

    res.json({ success: true, journalId: existing.journalId });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/journals/:id', (req, res) => {
  try {
    const fp = coFile(cid(req), 'Journals', req.params.id);
    if (!fs.existsSync(fp)) return res.status(404).json({ error: 'Not found' });
    fs.unlinkSync(fp);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* Upload docs to a journal */
router.post('/journals/:id/upload', upload.array('files', 20), (req, res) => {
  try {
    const companyId = cid(req);
    const fp = coFile(companyId, 'Journals', req.params.id);
    if (!fs.existsSync(fp)) return res.status(404).json({ error: 'Journal not found' });
    const rec = JSON.parse(fs.readFileSync(fp, 'utf-8'));
    const docsPath = path.join(ROOT, 'Database', 'Companies', companyId, 'Journals', `docs-${req.params.id}`);
    ensureDir(docsPath);
    const saved = saveUploadedFiles(req.files || [], docsPath);
    rec.attachments = [...(rec.attachments || []), ...saved];
    rec.updatedAt = new Date().toISOString();
    saveJson(fp, rec);
    res.json({ success: true, attachments: rec.attachments });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* Download a journal attachment */
router.get('/journals/:id/download/:fileName', (req, res) => {
  try {
    const companyId = cid(req);
    const docsPath = path.join(ROOT, 'Database', 'Companies', companyId, 'Journals', `docs-${req.params.id}`);
    const filePath = path.join(docsPath, req.params.fileName);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });
    req.query.inline ? res.sendFile(filePath) : res.download(filePath);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* Delete a journal attachment */
router.delete('/journals/:id/docs/:fileName', (req, res) => {
  try {
    const companyId = cid(req);
    const fp = coFile(companyId, 'Journals', req.params.id);
    if (!fs.existsSync(fp)) return res.status(404).json({ error: 'Not found' });
    const rec = JSON.parse(fs.readFileSync(fp, 'utf-8'));
    const docsPath = path.join(ROOT, 'Database', 'Companies', companyId, 'Journals', `docs-${req.params.id}`);
    const filePath = path.join(docsPath, req.params.fileName);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    rec.attachments = (rec.attachments || []).filter(a => a.fileName !== req.params.fileName);
    rec.updatedAt = new Date().toISOString();
    saveJson(fp, rec);
    res.json({ success: true, attachments: rec.attachments });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ════════════════════════════════════════════════════════
   PAYMENT ADVICE EMAIL
════════════════════════════════════════════════════════ */
router.post('/send-payment-advice', async (req, res) => {
  try {
    const { paymentId, toEmail, companyId: cidBody } = req.body;
    const companyId = cidBody || cid(req);
    if (!toEmail) return res.status(400).json({ error: 'toEmail is required' });

    const EMAIL_CFG_FILE = path.join(ROOT, 'Database', 'email-config.json');
    const cfg = fs.existsSync(EMAIL_CFG_FILE) ? JSON.parse(fs.readFileSync(EMAIL_CFG_FILE, 'utf8')) : {};
    if (!cfg.email || !cfg.password)
      return res.status(500).json({ error: 'Email is not configured. Set up email in Admin → Settings.' });

    // Load payment
    const payFile = coFile(companyId, 'Payments', String(paymentId));
    if (!fs.existsSync(payFile)) return res.status(404).json({ error: 'Payment not found' });
    const pay = JSON.parse(fs.readFileSync(payFile, 'utf8'));

    // Load company info
    const compFile = path.join(ROOT, 'Database', 'Companies', companyId, `${companyId}.json`);
    const comp = fs.existsSync(compFile) ? JSON.parse(fs.readFileSync(compFile, 'utf8')) : {};
    const companyName = comp.companyName || comp.name || 'Epsilon Enterprise';

    // Load ledger account (for name/contact)
    const lAccsFile = path.join(ROOT, 'Database', 'Companies', companyId, 'Ledger', 'accounts.json');
    const lAccs = fs.existsSync(lAccsFile) ? JSON.parse(fs.readFileSync(lAccsFile, 'utf8')) : [];
    const partyName = pay.entityName || pay.party || 'Party';
    const ledgerAcc = lAccs.find(a => a.name === partyName) || {};

    // Load linked expenses
    const linkedExps = (pay.linkedExpenses || []).map(le => {
      const ef = coFile(companyId, 'Expenses', String(le.expenseId));
      if (!fs.existsSync(ef)) return le;
      return { ...JSON.parse(fs.readFileSync(ef, 'utf8')), _paidAmt: le.amount };
    });

    const fmtD = d => { if (!d) return '—'; const dt = new Date(d); return isNaN(dt)?d:`${String(dt.getDate()).padStart(2,'0')}-${String(dt.getMonth()+1).padStart(2,'0')}-${dt.getFullYear()}`; };
    const fmt2 = n => (parseFloat(n)||0).toFixed(2);
    const today = fmtD(new Date().toISOString());

    const expRows = linkedExps.map((e, i) => `
      <tr style="background:${i%2===0?'#fff':'#fffbeb'}">
        <td style="padding:6px 10px;border:1px solid #e5e7eb">${i+1}</td>
        <td style="padding:6px 10px;border:1px solid #e5e7eb;font-weight:600;color:#92400e">${e.expenseCategory||e.category||'—'}</td>
        <td style="padding:6px 10px;border:1px solid #e5e7eb">${e.description||'—'}</td>
        <td style="padding:6px 10px;border:1px solid #e5e7eb">${e.orderNo||'—'}</td>
        <td style="padding:6px 10px;border:1px solid #e5e7eb;text-align:right;font-weight:700">₹${fmt2(e.grandTotal||e.amount||0)}</td>
        <td style="padding:6px 10px;border:1px solid #e5e7eb;text-align:right;color:#15803d;font-weight:700">₹${fmt2(e._paidAmt||0)}</td>
      </tr>`).join('');

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'Segoe UI',Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:24px 16px">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 2px 20px rgba(0,0,0,0.10)">

  <!-- Header -->
  <tr><td style="background:linear-gradient(135deg,#104f4f 0%,#1a3a8a 100%);padding:20px 28px">
    <div style="font-size:11pt;color:rgba(255,255,255,0.7);letter-spacing:1px;text-transform:uppercase;margin-bottom:2px">${companyName}</div>
    <div style="font-size:20pt;font-weight:900;color:#fff;letter-spacing:0.5px">PAYMENT ADVICE</div>
    <div style="font-size:10pt;color:rgba(255,255,255,0.8);margin-top:4px">Reference: PMT-${pay.paymentId} &nbsp;|&nbsp; Date: ${today}</div>
  </td></tr>

  <!-- To / From -->
  <tr><td style="padding:20px 28px;border-bottom:1px solid #e5e7eb">
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td width="50%" valign="top">
          <div style="font-size:9pt;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;font-weight:700;margin-bottom:5px">To</div>
          <div style="font-size:13pt;font-weight:800;color:#1f2937">${partyName}</div>
          ${ledgerAcc.address ? `<div style="font-size:10pt;color:#4b5563;margin-top:3px">${(ledgerAcc.address||'').replace(/\n/g,'<br>')}</div>` : ''}
          ${ledgerAcc.gstin ? `<div style="font-size:10pt;color:#6b7280;margin-top:2px">GSTIN: <b>${ledgerAcc.gstin}</b></div>` : ''}
          ${ledgerAcc.contact ? `<div style="font-size:10pt;color:#6b7280">Contact: ${ledgerAcc.contact}</div>` : ''}
        </td>
        <td width="50%" valign="top" style="text-align:right">
          <div style="font-size:9pt;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;font-weight:700;margin-bottom:5px">Payment Details</div>
          <div style="font-size:12pt;color:#104f4f;font-weight:700">₹${fmt2(pay.amount)}</div>
          <div style="font-size:10pt;color:#4b5563;margin-top:3px">Mode: <b>${pay.paymentMode||'—'}</b></div>
          ${pay.referenceNo||pay.reference ? `<div style="font-size:10pt;color:#4b5563">Ref No: <b>${pay.referenceNo||pay.reference}</b></div>` : ''}
          <div style="font-size:10pt;color:#4b5563">Date: <b>${fmtD(pay.date)}</b></div>
        </td>
      </tr>
    </table>
  </td></tr>

  <!-- Payment summary box -->
  <tr><td style="padding:16px 28px;background:#f0fdf4;border-bottom:1px solid #bbf7d0">
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="font-size:11pt;font-weight:700;color:#15803d">✓ Payment Confirmed</td>
        <td style="text-align:right;font-size:14pt;font-weight:900;color:#15803d">₹${fmt2(pay.amount)}</td>
      </tr>
    </table>
  </td></tr>

  ${linkedExps.length > 0 ? `
  <!-- Expenses -->
  <tr><td style="padding:20px 28px">
    <div style="font-size:11pt;font-weight:800;color:#92400e;margin-bottom:10px;border-bottom:2px solid #fcd34d;padding-bottom:5px">Bills / Expenses Covered</div>
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:10pt">
      <thead><tr style="background:#92400e;color:#fff">
        <th style="padding:6px 10px;border:1px solid #78350f;text-align:left;width:28px">#</th>
        <th style="padding:6px 10px;border:1px solid #78350f;text-align:left">Category</th>
        <th style="padding:6px 10px;border:1px solid #78350f;text-align:left">Description</th>
        <th style="padding:6px 10px;border:1px solid #78350f;text-align:left">Order No</th>
        <th style="padding:6px 10px;border:1px solid #78350f;text-align:right">Bill Amt</th>
        <th style="padding:6px 10px;border:1px solid #78350f;text-align:right">Paid Now</th>
      </tr></thead>
      <tbody>${expRows}</tbody>
    </table>
  </td></tr>` : ''}

  ${pay.purpose ? `
  <tr><td style="padding:4px 28px 16px">
    <div style="font-size:10pt;color:#6b7280"><b>Purpose:</b> ${pay.purpose}</div>
  </td></tr>` : ''}

  <!-- Footer -->
  <tr><td style="padding:16px 28px;background:#f8fafc;border-top:1px solid #e5e7eb;text-align:center">
    <div style="font-size:9pt;color:#9ca3af">This is a system-generated payment advice from <b>${companyName}</b>.</div>
    <div style="font-size:9pt;color:#9ca3af;margin-top:2px">Please retain this for your records. For queries, contact us.</div>
  </td></tr>

</table>
</td></tr></table>
</body></html>`;

    const nodemailer = require('nodemailer');
    const transport = nodemailer.createTransport({
      service: cfg.service && cfg.service !== 'custom' ? cfg.service : undefined,
      host:    cfg.host    || undefined,
      port:    cfg.port    ? Number(cfg.port) : undefined,
      secure:  cfg.secure  !== undefined ? cfg.secure : undefined,
      auth:    { user: cfg.email, pass: cfg.password },
    });
    await transport.sendMail({
      from:    `"${cfg.fromName || companyName}" <${cfg.email}>`,
      to:      toEmail,
      subject: `Payment Advice — ₹${fmt2(pay.amount)} — PMT-${pay.paymentId}`,
      html,
    });
    res.json({ ok: true, message: `Payment advice sent to ${toEmail}` });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ════════════════════════════════════════════════════════
   DUES — compute outstanding from Sales/Purchase Orders + Payments
════════════════════════════════════════════════════════ */
router.get('/dues', (req, res) => {
  try {
    const companyId = cid(req);

    // Helper: read all JSON records from a directory — handles BOTH:
    //   1. Flat files: dir/EPROP_SO_25_26_001.json  (Tally-imported)
    //   2. Subdirs:    dir/400001/400001.json         (app-created)
    const readAllRecords = (dir) => sqlite.listAnyByDir(dir);

    const calcTotal = (items = []) =>
      items.reduce((s, it) => {
        const base = (parseFloat(it.qty || it.quantity) || 0) * (parseFloat(it.rate) || 0);
        const disc = it.discountType === '%' ? base * (parseFloat(it.discount) || 0) / 100 : (parseFloat(it.discount) || 0);
        const taxable = base - disc;
        return s + taxable + taxable * (parseFloat(it.gstPercent) || 0) / 100;
      }, 0);

    const salesOrders    = readAllRecords(coDir(companyId, 'SalesOrder'));
    const purchaseOrders = readAllRecords(coDir(companyId, 'PurchaseOrder'));
    const payments       = readAll(coDir(companyId, 'Payments'));
    const expenses       = readAll(coDir(companyId, 'Expenses'));
    // Order journals — posted journals tagged with a specific orderId
    const orderJournals  = readAll(coDir(companyId, 'Journals'))
      .filter(j => j.type === 'order' && j.orderId && j.status === 'posted');
    const soMap = {};
    salesOrders.forEach(so => { soMap[String(so.orderId || so.id)] = so; });

    // Security deposits — load once, used in clientDues below
    const allDepositsForDues = readAllRecords(coDir(companyId, 'Deposits'));

    // Build credit-note → sales order map via linked bill
    const salesBillsList = readAllRecords(coDir(companyId, 'SalesBills'));
    const billToOrderMap = {};
    salesBillsList.forEach(b => { if (b.billId && b.orderId) billToOrderMap[String(b.billId)] = String(b.orderId); });
    const creditNotesList = readAll(coDir(companyId, 'CreditNotes')).filter(cn => cn.status !== 'cancelled');
    const cnByOrder = {};
    const cnRecsByOrder = {};
    creditNotesList.forEach(cn => {
      const oid = cn.linkedBillId ? billToOrderMap[String(cn.linkedBillId)] : null;
      if (!oid) return;
      cnByOrder[oid]    = (cnByOrder[oid] || 0) + (parseFloat(cn.grandTotal) || 0);
      if (!cnRecsByOrder[oid]) cnRecsByOrder[oid] = [];
      cnRecsByOrder[oid].push({ cnId: cn.cnId, cnNo: cn.cnNo, date: cn.date, amount: parseFloat(cn.grandTotal)||0 });
    });

    // Build debit-note → purchase order map via linked bill
    const purchBillsList = readAllRecords(coDir(companyId, 'PurchaseBills'));
    const pbillToOrderMap = {};
    purchBillsList.forEach(b => { if (b.billId && b.orderId) pbillToOrderMap[String(b.billId)] = String(b.orderId); });
    const debitNotesList = readAll(coDir(companyId, 'DebitNotes')).filter(dn => dn.status !== 'cancelled');
    const dnByOrder = {};
    const dnRecsByOrder = {};
    debitNotesList.forEach(dn => {
      const oid = dn.linkedBillId ? pbillToOrderMap[String(dn.linkedBillId)] : null;
      if (!oid) return;
      dnByOrder[oid]    = (dnByOrder[oid] || 0) + (parseFloat(dn.grandTotal) || 0);
      if (!dnRecsByOrder[oid]) dnRecsByOrder[oid] = [];
      dnRecsByOrder[oid].push({ dnId: dn.dnId, dnNo: dn.dnNo, date: dn.date, amount: parseFloat(dn.grandTotal)||0 });
    });

    // Client dues (receivable) — only app-created orders (not Tally imports) with non-zero value
    const clientDues = salesOrders
      .filter(o => !o.tallyImported && !['rejected', 'draft'].includes(o.status))
      .map(o => {
        const oid = o.orderId || o.id;
        const orderTotal = parseFloat(o.grandTotal || o.amount) || calcTotal(o.items);
        const linkedPayments = payments.filter(p =>
          p.type === 'receipt' && p.status !== 'rejected' &&
          (String(p.orderId) === String(oid) || String(p.orderId) === String(o.voucherNumber))
        );
        const linkedSecurityDeposits = allDepositsForDues.filter(d =>
          d.depositType === 'Security' && d.status === 'active' && String(d.soId) === String(oid)
        );
        const paymentsReceived    = linkedPayments.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
        const securityDepositAmt  = linkedSecurityDeposits.reduce((s, d) => s + (parseFloat(d.amount) || 0), 0);
        const received            = paymentsReceived + securityDepositAmt;
        const creditNotesAmt      = cnByOrder[String(oid)] || 0;
        return {
          orderId:         oid,
          orderNo:         o.orderNo || o.voucherNumber || o.soNo || `SO-${oid}`,
          orderDate:       o.orderDate || o.date || o.createdAt,
          deliveryDate:    o.deliveryDate || o.dueDate || '',
          clientId:        o.clientId,
          entityName:      o.customerName || o.clientName || o.party || '—',
          orderType:       o.orderType || '',
          status:          o.status || 'approved',
          orderTotal,
          received,
          paymentsReceived,
          securityDepositAmt,
          linkedSecurityDeposits,
          creditNotesAmt,
          linkedCreditNotes: cnRecsByOrder[String(oid)] || [],
          linkedPayments,
          items:           o.items     || [],
          addOnItems:      o.addOnItems || [],
          charges:         o.charges   || [],
          due:             orderTotal - received - creditNotesAmt,
          scopeOfWork:     o.scopeOfWork  || '',
          clientScope:     o.clientScope  || '',
          epsilonScope:    o.epsilonScope || '',
          scopeItems:      o.scopeItems   || [],
          paymentTerms:    o.paymentTerms || o.billingTerms || '',
          contactPerson:   o.contactPerson || '',
          mobile:          o.mobile || '',
          mobile2:         o.mobile2 || '',
          email:           o.email || '',
          deliveryAddress: o.deliveryAddress || o.deliveryAddr || '',
          deliveryCity:    o.deliveryCity || '',
          deliveryState:   o.deliveryState || '',
          deliveryPincode: o.deliveryPincode || '',
          shipFromAddress: o.shipFromAddress || '',
          shipFromCity:    o.shipFromCity || '',
          shipFromState:   o.shipFromState || '',
          shipFromPincode: o.shipFromPincode || '',
        };
      })
      .filter(r => r.orderTotal > 0);

    // Vendor dues (payable) — only app-created orders (not Tally imports) with non-zero value
    const vendorDues = purchaseOrders
      .filter(o => !o.tallyImported && !['rejected', 'draft'].includes(o.status))
      .map(o => {
        const oid = o.orderId || o.id;
        const orderTotal = parseFloat(o.grandTotal || o.amount) || calcTotal(o.items);
        // a payment can be split over several POs (poAllocations) — count only this PO's share
        const shareOf = p => (Array.isArray(p.poAllocations) && p.poAllocations.length
          ? p.poAllocations.filter(a => String(a.orderId) === String(oid)).reduce((s, a) => s + (parseFloat(a.amount) || 0), 0)
          : (String(p.orderId) === String(oid) || String(p.orderId) === String(o.voucherNumber)) ? parseFloat(p.amount) || 0 : 0);
        const linkedPayments = payments.filter(p => p.type === 'payment' && p.status !== 'rejected' && shareOf(p) > 0);
        // Add posted order journals linked to this PO
        const linkedJournals = orderJournals.filter(j => String(j.orderId) === String(oid));
        const journalPaid    = linkedJournals.reduce((s, j) => s + Math.min(parseFloat(j.totalDebit)||0, parseFloat(j.totalCredit)||0), 0);
        const paid           = linkedPayments.reduce((s, p) => s + shareOf(p), 0) + journalPaid;
        const debitNotesAmt  = dnByOrder[String(oid)] || 0;
        return {
          orderId:          oid,
          orderNo:          o.poNo || o.poNumber || o.voucherNumber || `PO-${oid}`,
          poNo:             o.poNo || o.poNumber || '',
          orderDate:        o.poDate || o.date || o.createdAt,
          poDate:           o.poDate || '',
          deliveryDate:     o.deliveryDate || o.dueDate || '',
          vendorId:         o.vendorId,
          vendorCode:       o.vendorCode || '',
          entityName:       o.vendorName || o.party || '—',
          poType:           o.poType || '',
          status:           o.status || 'approved',
          orderTotal,
          paid,
          debitNotesAmt,
          linkedDebitNotes: dnRecsByOrder[String(oid)] || [],
          // what settled this PO, line by line — the same lines that make up "paid":
          // payments (a split payment shows only this PO's share) and posted order journals (TDS, adjustments)
          linkedPayments: [
            ...linkedPayments.map(p => ({ ...p, amount: shareOf(p), fullAmount: parseFloat(p.amount) || 0, isSplit: shareOf(p) !== (parseFloat(p.amount) || 0) })),
            ...linkedJournals.map(j => ({ journalId: j.journalId, isJournal: true, date: j.date, amount: Math.min(parseFloat(j.totalDebit) || 0, parseFloat(j.totalCredit) || 0),
              referenceNo: `JV #${j.journalId}`, paymentMode: 'Journal', narration: j.narration || '', status: j.status })),
          ].sort((a, b) => String(a.date || '').localeCompare(String(b.date || ''))),
          items:            o.items     || [],
          addOnItems:       o.addOnItems || [],
          charges:          o.charges   || [],
          due:              orderTotal - paid - debitNotesAmt,
          vendorScope:      o.vendorScope  || '',
          epsilonScope:     o.epsilonScope || '',
          clientScope:      o.clientScope  || '',
          scopeItems:       o.scopeItems   || [],
          paymentTerms:     o.paymentTerms || o.billingTerms || '',
          contactPerson:    o.contactPerson || '',
          mobile:           o.mobile || '',
          mobile2:          o.mobile2 || '',
          email:            o.email || '',
          deliveryAddress:  o.deliveryAddress || o.deliveryAddr || '',
          deliveryCity:     o.deliveryCity || '',
          deliveryState:    o.deliveryState || '',
          deliveryPincode:  o.deliveryPincode || '',
          shipFromAddress:  o.shipFromAddress || '',
          shipFromCity:     o.shipFromCity || '',
          shipFromState:    o.shipFromState || '',
          shipFromPincode:  o.shipFromPincode || '',
          linkedSalesOrderId: o.linkedSalesOrderId || '',
          clientName: (() => {
            const sid = String(o.linkedSalesOrderId || '');
            if (!sid) return '';
            const so = soMap[sid];
            return so ? (so.customerName || so.clientName || so.party || '') : '';
          })(),
        };
      })
      .filter(r => r.orderTotal > 0);

    // Expense dues — approved/pending expenses that have a vendor party
    const expenseDues = expenses
      .filter(e => !['rejected', 'draft'].includes(e.status))
      .map(e => {
        const eid        = e.expenseId;
        const entityName = e.vendorName || e.vendor || e.ledgerName || '';
        if (!entityName) return null;                         // skip expenses with no vendor/party
        const orderTotal = parseFloat(e.grandTotal) || 0;
        if (!orderTotal) return null;

        // Find payments linked to this expense (by expenseId or orderId)
        const linkedPayments = payments.filter(p =>
          p.type === 'payment' && p.status !== 'rejected' && (
            String(p.expenseId) === String(eid) ||
            String(p.orderId)   === String(eid)
          )
        );
        // Add posted order journals linked to this expense
        const linkedExpJournals = orderJournals.filter(j => String(j.orderId) === String(eid));
        const journalExpPaid    = linkedExpJournals.reduce((s, j) => s + Math.min(parseFloat(j.totalDebit)||0, parseFloat(j.totalCredit)||0), 0);
        const paid = linkedPayments.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0) + journalExpPaid;
        return {
          orderId:     eid,
          orderNo:     `EXP-${eid}`,
          poNo:        `EXP-${eid}`,
          orderDate:   e.date || e.createdAt,
          vendorId:    e.vendorId || '',
          entityName,
          poType:      'expense',
          expenseType: e.expenseType || e.expType || '',
          category:    e.expenseCategory || e.category || '',
          status:      e.status || 'approved',
          orderTotal,
          paid,
          debitNotesAmt:   0,
          linkedDebitNotes:[],
          linkedPayments,
          items:       [],
          addOnItems:  [],
          charges:     [],
          due:         orderTotal - paid,
          description: e.description || '',
          soId:        e.soId || '',
          invoiceNo:   e.invoiceNo || '',
          clientName:  e.clientName || '',
          linkedSalesOrderId: e.soId || '',
        };
      })
      .filter(Boolean)
      .filter(r => r.orderTotal > 0);

    res.json({ clientDues, vendorDues: [...vendorDues, ...expenseDues] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ════════════════════════════════════════════════════════
   STATEMENT — all payments + orders in one ledger view
════════════════════════════════════════════════════════ */
router.get('/statement', (req, res) => {
  try {
    const companyId = cid(req);

    const readAllRecords = (dir) => sqlite.listAnyByDir(dir);

    const payments       = readAll(coDir(companyId, 'Payments'));
    const salesOrders    = readAllRecords(coDir(companyId, 'SalesOrder'));
    const purchaseOrders = readAllRecords(coDir(companyId, 'PurchaseOrder'));

    const entries = [
      ...salesOrders.map(o => ({
        id: o.orderId || o.id,
        type: 'sales-order',
        ref: o.orderNo || o.soNo || o.voucherNumber || `SO-${o.orderId}`,
        date: o.orderDate || o.date || o.createdAt || '',
        party: o.customerName || o.clientName || o.party || '—',
        description: `Sales Order`,
        amount: parseFloat(o.grandTotal) || 0,
        status: o.status || 'draft',
        direction: 'receivable',
      })),
      ...purchaseOrders.map(o => ({
        id: o.orderId || o.id,
        type: 'purchase-order',
        ref: o.poNo || o.poNumber || o.voucherNumber || `PO-${o.orderId}`,
        date: o.poDate || o.date || o.createdAt || '',
        party: o.vendorName || o.party || '—',
        description: `Purchase Order`,
        amount: parseFloat(o.grandTotal) || 0,
        status: o.status || 'draft',
        direction: 'payable',
      })),
      ...payments.filter(p => p.status !== 'rejected').map(p => ({
        id: p.paymentId,
        type: p.type || 'payment',
        ref: p.referenceNo || `PMT-${p.paymentId}`,
        date: p.date || p.createdAt || '',
        party: p.entityName || '—',
        description: `${p.type === 'receipt' ? 'Receipt' : 'Payment'} — ${p.paymentMode || ''}`,
        amount: parseFloat(p.amount) || 0,
        status: p.status || 'confirmed',
        direction: p.type === 'receipt' ? 'receivable' : 'payable',
        orderId: p.orderId,
      })),
    ];

    entries.sort((a, b) => new Date(b.date) - new Date(a.date));
    res.json(entries);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ════════════════════════════════════════════════════════
   EXPENSES  — per company
════════════════════════════════════════════════════════ */
router.get('/expenses', (req, res) => {
  try {
    const dir = coDir(cid(req), 'Expenses');
    res.json(readAll(dir).sort((a, b) => (b.expenseId || 0) - (a.expenseId || 0)));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/expenses', (req, res) => {
  try {
    const companyId = cid(req);
    if (!companyId) return res.status(400).json({ error: 'companyId required' });
    const dir = coDir(companyId, 'Expenses');
    ensureDir(dir);
    const expenseId = nextId(dir, 500001);
    const expItems = Array.isArray(req.body.items) ? req.body.items : [];
    let grandTotal = 0;
    if (expItems.length > 0) {
      expItems.forEach(it => {
        const base = (parseFloat(it.qty)||0) * (parseFloat(it.rate)||0);
        grandTotal += base + base * (parseFloat(it.gstPercent)||0) / 100;
      });
    } else {
      const am = parseFloat(req.body.amount)||0;
      grandTotal = am + am * (parseFloat(req.body.taxRate)||0) / 100;
    }
    grandTotal = parseFloat(grandTotal.toFixed(2));
    const now = new Date().toISOString();
    const rec = { expenseId, ...req.body, grandTotal, companyId, createdAt: now, updatedAt: now };
    saveJson(coFile(companyId, 'Expenses', expenseId), rec);

    if (rec.status === 'pending') {
      const submitter = resolveUser(req);
      notifyApprovers({
        companyId, module: 'expense', recordId: expenseId,
        recordLabel: `Expense ${expenseId} — ${rec.party || ''}`,
        message: `Expense ${expenseId} (${rec.party || ''}) needs your approval`,
        link: '/account/expense/view',
        createdBy: submitter?.name || submitter?.username || 'System',
        targetUserId: req.body.approverId || null,
      });
    }

    res.json({ success: true, expenseId, message: `Expense created: ${expenseId}` });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/expenses/:id', (req, res) => {
  try {
    const fp = coFile(cid(req), 'Expenses', req.params.id);
    if (!fs.existsSync(fp)) return res.status(404).json({ error: 'Not found' });
    res.json(JSON.parse(fs.readFileSync(fp, 'utf-8')));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/expenses/:id', (req, res) => {
  try {
    const companyId = cid(req);
    const fp = coFile(companyId, 'Expenses', req.params.id);
    if (!fs.existsSync(fp)) return res.status(404).json({ error: 'Not found' });
    const existing = JSON.parse(fs.readFileSync(fp, 'utf-8'));
    const expItems = Array.isArray(req.body.items) ? req.body.items : (existing.items || []);
    let grandTotal = 0;
    if (expItems.length > 0) {
      expItems.forEach(it => {
        const base = (parseFloat(it.qty)||0) * (parseFloat(it.rate)||0);
        grandTotal += base + base * (parseFloat(it.gstPercent)||0) / 100;
      });
    } else {
      const am = parseFloat(req.body.amount || existing.amount)||0;
      grandTotal = am + am * (parseFloat(req.body.taxRate || existing.taxRate)||0) / 100;
    }
    grandTotal = parseFloat(grandTotal.toFixed(2));
    const rec = { ...existing, ...req.body, grandTotal, updatedAt: new Date().toISOString() };
    saveJson(fp, rec);

    if (rec.status === 'pending' && existing.status !== 'pending') {
      const submitter = resolveUser(req);
      notifyApprovers({
        companyId, module: 'expense', recordId: existing.expenseId,
        recordLabel: `Expense ${existing.expenseId} — ${rec.party || ''}`,
        message: `Expense ${existing.expenseId} (${rec.party || ''}) needs your approval`,
        link: '/account/expense/view',
        createdBy: submitter?.name || submitter?.username || 'System',
        targetUserId: req.body.approverId || null,
      });
    }

    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/expenses/:id', (req, res) => {
  try {
    const fp = coFile(cid(req), 'Expenses', req.params.id);
    if (!fs.existsSync(fp)) return res.status(404).json({ error: 'Not found' });
    fs.unlinkSync(fp);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* Upload docs to an expense */
router.post('/expenses/:id/upload', upload.array('files', 20), (req, res) => {
  try {
    const companyId = cid(req);
    const fp = coFile(companyId, 'Expenses', req.params.id);
    if (!fs.existsSync(fp)) return res.status(404).json({ error: 'Expense not found' });
    const rec = JSON.parse(fs.readFileSync(fp, 'utf-8'));
    const docsPath = path.join(ROOT, 'Database', 'Companies', companyId, 'Expenses', `docs-${req.params.id}`);
    ensureDir(docsPath);
    const saved = saveUploadedFiles(req.files || [], docsPath);
    rec.attachments = [...(rec.attachments || []), ...saved];
    rec.updatedAt = new Date().toISOString();
    saveJson(fp, rec);
    res.json({ success: true, attachments: rec.attachments });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* Download an expense attachment */
router.get('/expenses/:id/download/:fileName', (req, res) => {
  try {
    const companyId = cid(req);
    const docsPath = path.join(ROOT, 'Database', 'Companies', companyId, 'Expenses', `docs-${req.params.id}`);
    const filePath = path.join(docsPath, req.params.fileName);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });
    req.query.inline ? res.sendFile(filePath) : res.download(filePath);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* Delete an expense attachment */
router.delete('/expenses/:id/docs/:fileName', (req, res) => {
  try {
    const companyId = cid(req);
    const fp = coFile(companyId, 'Expenses', req.params.id);
    if (!fs.existsSync(fp)) return res.status(404).json({ error: 'Not found' });
    const rec = JSON.parse(fs.readFileSync(fp, 'utf-8'));
    const docsPath = path.join(ROOT, 'Database', 'Companies', companyId, 'Expenses', `docs-${req.params.id}`);
    const filePath = path.join(docsPath, req.params.fileName);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    rec.attachments = (rec.attachments || []).filter(a => a.fileName !== req.params.fileName);
    rec.updatedAt = new Date().toISOString();
    saveJson(fp, rec);
    res.json({ success: true, attachments: rec.attachments });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ════════════════════════════════════════════════════════
   ASSETS  — per company
════════════════════════════════════════════════════════ */
router.get('/assets', (req, res) => {
  try {
    const dir = coDir(cid(req), 'Assets');
    res.json(readAll(dir).sort((a, b) => (b.assetId || 0) - (a.assetId || 0)));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/assets', (req, res) => {
  try {
    const companyId = cid(req);
    if (!companyId) return res.status(400).json({ error: 'companyId required' });
    const dir = coDir(companyId, 'Assets');
    ensureDir(dir);
    const assetId = nextId(dir, 600001);
    const now = new Date().toISOString();
    const { purchaseAmount = 0 } = req.body;
    const rec = { assetId, ...req.body, currentValue: parseFloat(purchaseAmount) || 0, companyId, createdAt: now, updatedAt: now };
    saveJson(coFile(companyId, 'Assets', assetId), rec);
    res.json({ success: true, assetId, message: `Asset created: ${assetId}` });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/assets/:id', (req, res) => {
  try {
    const fp = coFile(cid(req), 'Assets', req.params.id);
    if (!fs.existsSync(fp)) return res.status(404).json({ error: 'Not found' });
    res.json(JSON.parse(fs.readFileSync(fp, 'utf-8')));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/assets/:id', (req, res) => {
  try {
    const companyId = cid(req);
    const fp = coFile(companyId, 'Assets', req.params.id);
    if (!fs.existsSync(fp)) return res.status(404).json({ error: 'Not found' });
    const existing = JSON.parse(fs.readFileSync(fp, 'utf-8'));
    const rec = { ...existing, ...req.body, updatedAt: new Date().toISOString() };
    saveJson(fp, rec);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/assets/:id', (req, res) => {
  try {
    const fp = coFile(cid(req), 'Assets', req.params.id);
    if (!fs.existsSync(fp)) return res.status(404).json({ error: 'Not found' });
    fs.unlinkSync(fp);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ════════════════════════════════════════════════════════
   LEDGER — aggregate all transactions by party / ledger name
════════════════════════════════════════════════════════ */

/* reads JSON files one level deep (handles sub-folder structures) */
// served from the SQLite index (same rows, same order as walking the folders)
const readAllDeep = (dir) => sqlite.listShallowByDir(dir);

router.get('/ledger', (req, res) => {
  try {
    const companyId = cid(req);
    const journals    = readAll(coDir(companyId, 'Journals')).filter(j => j.status !== 'rejected');
    const banks       = readAll(banksDir(companyId));
    const payments    = readAll(coDir(companyId, 'Payments'));
    const salesBills  = readAllDeep(coDir(companyId, 'SalesBills'));
    const purchBills  = readAllDeep(coDir(companyId, 'PurchaseBills'));
    const clients     = readAllDeep(coDir(companyId, 'Client'));
    const vendors     = readAllDeep(coDir(companyId, 'Vendor'));

    /* order look-ups so each entry can carry its File No (= sales order no.) and PO No */
    const soById = {}, poById = {};
    readAllDeep(coDir(companyId, 'SalesOrder')).forEach(o => { if (o && o.orderId != null) soById[String(o.orderId)] = o; });
    readAllDeep(coDir(companyId, 'PurchaseOrder')).forEach(o => { if (o && o.orderId != null) poById[String(o.orderId)] = o; });
    const fileOf = (orderId) => {
      const id = String(orderId || '');
      if (soById[id]) return soById[id].orderNo || '';
      const po = poById[id];
      return po ? (soById[String(po.linkedSalesOrderId || '')]?.orderNo || '') : '';
    };
    const poNoOf = (orderId) => poById[String(orderId || '')]?.poNo || '';

    const map = {};
    const ensure = (name, type) => {
      if (!name) return;
      if (!map[name]) map[name] = { ledger: name, totalDebit: 0, totalCredit: 0, entries: [], partyType: type || null };
    };

    /* 1. Journal entries */
    journals.forEach(j => {
      (j.entries || []).forEach(e => {
        if (!e.ledger) return;
        ensure(e.ledger);
        map[e.ledger].totalDebit  += parseFloat(e.debit)  || 0;
        map[e.ledger].totalCredit += parseFloat(e.credit) || 0;
        map[e.ledger].entries.push({
          journalId: j.journalId, date: j.date, narration: j.narration,
          refNo: j.refNo || '', status: j.status || 'draft',
          debit: parseFloat(e.debit) || 0, credit: parseFloat(e.credit) || 0,
          source: 'journal',
        });
      });
    });

    /* 2. Sales Bills → Dr client (they owe us) */
    salesBills.forEach(b => {
      const name = b.partyName;
      if (!name) return;
      ensure(name, 'client');
      const amt = parseFloat(b.grandTotal) || 0;
      map[name].totalDebit += amt;
      map[name].entries.push({
        journalId: b.billId, date: b.billDate, narration: `Sales Bill: ${b.billNo || b.billId}`,
        refNo: b.billNo || b.billId, status: 'posted',
        debit: amt, credit: 0, source: 'sales-bill',
        fileNo: b.orderNo || fileOf(b.orderId),
      });
    });

    /* 3. Receipts (payments type=receipt) → Cr client (they paid us) */
    payments.filter(p => p.type === 'receipt' && p.status === 'confirmed').forEach(p => {
      const name = p.party || p.entityName;
      if (!name) return;
      ensure(name, 'client');
      const amt = parseFloat(p.amount) || 0;
      map[name].totalCredit += amt;
      map[name].entries.push({
        journalId: `PMT-${p.paymentId}`, date: p.date, narration: `Receipt: ${p.paymentMode || ''}`,
        refNo: p.reference || p.referenceNo || String(p.paymentId), status: 'confirmed',
        debit: 0, credit: amt, source: 'receipt',
        mode: p.paymentMode || '', chqNo: p.reference || p.referenceNo || '', notes: p.notes || '',
        fileNo: fileOf(p.orderId),
      });
    });

    /* 4. Purchase Bills → Cr vendor (we owe them) */
    purchBills.forEach(b => {
      const name = b.partyName;
      if (!name) return;
      ensure(name, 'vendor');
      const amt = parseFloat(b.grandTotal) || 0;
      map[name].totalCredit += amt;
      map[name].entries.push({
        journalId: b.billId, date: b.billDate, narration: `Purchase Bill: ${b.billNo || b.billId}`,
        refNo: b.billNo || b.billId, status: 'posted',
        debit: 0, credit: amt, source: 'purchase-bill',
        fileNo: fileOf(b.orderId), poNo: b.orderNo || poNoOf(b.orderId), vendorBillNo: b.vendorBillNo || '',
      });
    });

    /* 5. Payments (type=payment) → Dr vendor (we paid them) */
    payments.filter(p => p.type === 'payment' && p.status === 'confirmed').forEach(p => {
      const name = p.party || p.entityName;
      if (!name) return;
      ensure(name, 'vendor');
      const amt = parseFloat(p.amount) || 0;
      map[name].totalDebit += amt;
      map[name].entries.push({
        journalId: `PMT-${p.paymentId}`, date: p.date, narration: `Payment: ${p.paymentMode || ''}`,
        refNo: p.reference || p.referenceNo || String(p.paymentId), status: 'confirmed',
        debit: amt, credit: 0, source: 'payment',
        mode: p.paymentMode || '', chqNo: p.reference || p.referenceNo || '', notes: p.notes || '',
        fileNo: fileOf(p.orderId), poNo: poNoOf(p.orderId),
      });
    });

    /* 6. Credit Notes → Cr client (reduce receivable) */
    const creditNotesLedger = readAll(coDir(companyId, 'CreditNotes')).filter(cn => cn.status !== 'cancelled');
    creditNotesLedger.forEach(cn => {
      const name = cn.clientName;
      if (!name) return;
      ensure(name, 'client');
      const amt = parseFloat(cn.grandTotal) || 0;
      map[name].totalCredit += amt;
      map[name].entries.push({
        journalId: String(cn.cnId), date: cn.date,
        narration: `Credit Note: ${cn.cnNo || cn.cnId}`,
        refNo: cn.cnNo || String(cn.cnId), status: cn.status || 'draft',
        debit: 0, credit: amt, source: 'credit-note',
      });
    });

    /* 7. Debit Notes → Dr vendor (reduce payable) */
    const debitNotesLedger = readAll(coDir(companyId, 'DebitNotes')).filter(dn => dn.status !== 'cancelled');
    debitNotesLedger.forEach(dn => {
      const name = dn.vendorName;
      if (!name) return;
      ensure(name, 'vendor');
      const amt = parseFloat(dn.grandTotal) || 0;
      map[name].totalDebit += amt;
      map[name].entries.push({
        journalId: String(dn.dnId), date: dn.date,
        narration: `Debit Note: ${dn.dnNo || dn.dnId}`,
        refNo: dn.dnNo || String(dn.dnId), status: dn.status || 'draft',
        debit: amt, credit: 0, source: 'debit-note',
      });
    });

    /* 8. Security Deposits (type='Security', active/released) → Cr client */
    const deposits = readAllDeep(coDir(companyId, 'Deposits'));
    deposits.filter(d => d.depositType === 'Security' && ['active','released'].includes(d.status)).forEach(d => {
      const name = d.customerName;
      if (!name) return;
      ensure(name, 'client');
      const amt = parseFloat(d.amount) || 0;
      map[name].totalCredit += amt;
      map[name].entries.push({
        journalId: d.depositId, date: d.startDate || d.createdAt,
        narration: `Security Deposit${d.orderNo ? ' — ' + d.orderNo : ''}`,
        refNo: d.depositId, status: d.status,
        debit: 0, credit: amt, source: 'security-deposit',
        fileNo: d.orderNo || '',
      });
    });

    /* 9. Ensure all clients and vendors appear even with zero transactions */
    /* party details (address + first contact) for printed statements */
    const partyInfo = (o) => {
      const cp = (o.contactPersons || []).find(p => p && (p.name || p.mobileNumber)) || {};
      return {
        address: o.address || o.billingAddr || '', city: o.city || '', state: o.state || '', pincode: o.pincode || '',
        gstin: o.gstin || o.gst || '',
        contactPerson: cp.name || o.contactPerson || '', mobile: cp.mobileNumber || o.mobile || '', email: cp.email || o.email || '',
      };
    };
    clients.forEach(c => {
      const name = c.clientName || c.companyName;
      if (!name || name.trim() === '') return;
      ensure(name, 'client');
      if (!map[name].party) map[name].party = partyInfo(c);
    });
    vendors.forEach(v => {
      const name = v.vendorName || v.companyName;
      if (!name || name.trim() === '') return;
      ensure(name, 'vendor');
      if (!map[name].party) map[name].party = partyInfo(v);
    });

    /* 10. Expenses → Credit vendor/ledger party (we owe them) */
    const expensesList = readAll(coDir(companyId, 'Expenses'))
      .filter(e => e.status !== 'rejected');
    expensesList.forEach(e => {
      const name = e.vendorName || e.vendor || e.ledgerName;
      if (!name || name.trim() === '') return;
      const amt = parseFloat(e.grandTotal || e.amount) || 0;
      if (amt <= 0) return;
      ensure(name);
      map[name].totalCredit += amt;
      map[name].entries.push({
        journalId: `EXP-${e.expenseId}`,
        date: e.date || e.expenseDate || e.createdAt,
        narration: `Expense: ${e.expenseCategory || e.category || ''}${e.description ? ' — ' + e.description : ''}${e.orderNo ? ' [' + e.orderNo + ']' : ''}`,
        refNo: `EXP-${e.expenseId}`,
        status: e.status || 'pending',
        debit: 0, credit: amt,
        source: 'expense',
        fileNo: e.orderNo || '',
      });
    });

    /* 11. Manual ledger master accounts (Ledger/accounts.json) */
    const lAccsFile = path.join(ROOT, 'Database', 'Companies', companyId, 'Ledger', 'accounts.json');
    if (fs.existsSync(lAccsFile)) {
      try {
        const manualAccs = JSON.parse(fs.readFileSync(lAccsFile, 'utf-8'));
        manualAccs.forEach(acc => {
          const name = acc.name;
          if (!name || name.trim() === '') return;
          ensure(name);
          const ob = parseFloat(acc.openingBalance) || 0;
          if (ob > 0) {
            if ((acc.openingBalanceNature || 'Dr') === 'Cr') {
              map[name].totalCredit += ob;
            } else {
              map[name].totalDebit += ob;
            }
          }
          if (!map[name].ledgerGroup) map[name].ledgerGroup = acc.groupName || '';
          if (!map[name].ledgerMasterId) map[name].ledgerMasterId = acc.id || '';
          map[name].isManualLedger = true;
        });
      } catch {}
    }

    /* 7. Bank accounts — enrich with current balance */
    banks.forEach(b => {
      const name = `Bank - ${b.bankName}`;
      ensure(name, 'bank');
      const conf     = payments.filter(p => String(p.bankId) === String(b.bankId) && p.status === 'confirmed');
      const inflow   = conf.filter(p => p.type === 'receipt').reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
      const outflow  = conf.filter(p => p.type === 'payment').reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
      map[name].openingBalance = parseFloat(b.openingBalance) || 0;
      map[name].currentBalance = (parseFloat(b.openingBalance) || 0) + inflow - outflow;
      map[name].bankId         = b.bankId;
      map[name].accountNumber  = b.accountNumber;
      map[name].bankType       = true;
    });

    const result = Object.values(map)
      .map(l => ({
        ...l,
        totalDebit:  +l.totalDebit.toFixed(2),
        totalCredit: +l.totalCredit.toFixed(2),
        balance:     +(l.totalDebit - l.totalCredit).toFixed(2),
        entries: l.entries.sort((a, b) => new Date(a.date) - new Date(b.date)),
      }))
      .sort((a, b) => a.ledger.localeCompare(b.ledger));

    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ════════════════════════════════════════════════════════
   DEBIT NOTES  — per company
   Path: Database/Companies/{cid}/DebitNotes/{id}.json
════════════════════════════════════════════════════════ */
const calcNoteItems = (items = []) => {
  let subTotal = 0, totalGST = 0;
  const computed = items.map(it => {
    const taxable = (parseFloat(it.qty)||0) * (parseFloat(it.rate)||0);
    const gst = taxable * (parseFloat(it.gstPercent)||0) / 100;
    subTotal += taxable; totalGST += gst;
    return { ...it, taxableAmt: +taxable.toFixed(2), gstAmt: +gst.toFixed(2), totalAmt: +(taxable+gst).toFixed(2) };
  });
  return { items: computed, subTotal: +subTotal.toFixed(2), totalGST: +totalGST.toFixed(2), grandTotal: +(subTotal+totalGST).toFixed(2) };
};
const currentFY = () => { const d = new Date(); const m = d.getMonth()+1, y = d.getFullYear(); return m >= 4 ? y : y-1; };

router.get('/debit-notes', (req, res) => {
  try { res.json(readAll(coDir(cid(req), 'DebitNotes')).sort((a,b)=>(b.dnId||0)-(a.dnId||0))); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
router.post('/debit-notes', (req, res) => {
  try {
    const companyId = cid(req);
    if (!companyId) return res.status(400).json({ error: 'companyId required' });
    const dir = coDir(companyId, 'DebitNotes'); ensureDir(dir);
    const dnId = nextId(dir, 950001);
    const dnNo = `DN-${currentFY()}-${dnId}`;
    const { items: computed, subTotal, totalGST, grandTotal } = calcNoteItems(req.body.items);
    const now = new Date().toISOString();
    const rec = { dnId, dnNo, ...req.body, items: computed, subTotal, totalGST, grandTotal, companyId, createdAt: now, updatedAt: now };
    saveJson(coFile(companyId, 'DebitNotes', dnId), rec);

    if (rec.status === 'pending') {
      const submitter = resolveUser(req);
      notifyApprovers({
        companyId, module: 'debitnote', recordId: dnId,
        recordLabel: `Debit Note ${dnNo} — ${rec.party || ''}`,
        message: `Debit Note ${dnNo} (${rec.party || ''}) needs your approval`,
        link: '/account/debit-note',
        createdBy: submitter?.name || submitter?.username || 'System',
        targetUserId: req.body.approverId || null,
      });
    }

    res.json({ success: true, dnId, dnNo });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
router.get('/debit-notes/:id', (req, res) => {
  try {
    const fp = coFile(cid(req), 'DebitNotes', req.params.id);
    if (!fs.existsSync(fp)) return res.status(404).json({ error: 'Not found' });
    res.json(JSON.parse(fs.readFileSync(fp, 'utf-8')));
  } catch (e) { res.status(500).json({ error: e.message }); }
});
router.put('/debit-notes/:id', (req, res) => {
  try {
    const companyId = cid(req);
    const fp = coFile(companyId, 'DebitNotes', req.params.id);
    if (!fs.existsSync(fp)) return res.status(404).json({ error: 'Not found' });
    const existing = JSON.parse(fs.readFileSync(fp, 'utf-8'));
    const { items: computed, subTotal, totalGST, grandTotal } = calcNoteItems(req.body.items || existing.items);
    const updated = { ...existing, ...req.body, items: computed, subTotal, totalGST, grandTotal, updatedAt: new Date().toISOString() };
    saveJson(fp, updated);

    if (updated.status === 'pending' && existing.status !== 'pending') {
      const submitter = resolveUser(req);
      notifyApprovers({
        companyId, module: 'debitnote', recordId: existing.dnId,
        recordLabel: `Debit Note ${existing.dnNo} — ${updated.party || ''}`,
        message: `Debit Note ${existing.dnNo} (${updated.party || ''}) needs your approval`,
        link: '/account/debit-note',
        createdBy: submitter?.name || submitter?.username || 'System',
        targetUserId: req.body.approverId || null,
      });
    }

    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
router.delete('/debit-notes/:id', (req, res) => {
  try {
    const fp = coFile(cid(req), 'DebitNotes', req.params.id);
    if (!fs.existsSync(fp)) return res.status(404).json({ error: 'Not found' });
    fs.unlinkSync(fp); res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ════════════════════════════════════════════════════════
   CREDIT NOTES  — per company
   Path: Database/Companies/{cid}/CreditNotes/{id}.json
════════════════════════════════════════════════════════ */
router.get('/credit-notes', (req, res) => {
  try { res.json(readAll(coDir(cid(req), 'CreditNotes')).sort((a,b)=>(b.cnId||0)-(a.cnId||0))); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
router.post('/credit-notes', (req, res) => {
  try {
    const companyId = cid(req);
    if (!companyId) return res.status(400).json({ error: 'companyId required' });
    const dir = coDir(companyId, 'CreditNotes'); ensureDir(dir);
    const cnId = nextId(dir, 960001);
    const cnNo = `CN-${currentFY()}-${cnId}`;
    const { items: computed, subTotal, totalGST, grandTotal } = calcNoteItems(req.body.items);
    const now = new Date().toISOString();
    const rec = { cnId, cnNo, ...req.body, items: computed, subTotal, totalGST, grandTotal, companyId, createdAt: now, updatedAt: now };
    saveJson(coFile(companyId, 'CreditNotes', cnId), rec);

    if (rec.status === 'pending') {
      const submitter = resolveUser(req);
      notifyApprovers({
        companyId, module: 'creditnote', recordId: cnId,
        recordLabel: `Credit Note ${cnNo} — ${rec.party || ''}`,
        message: `Credit Note ${cnNo} (${rec.party || ''}) needs your approval`,
        link: '/account/credit-note',
        createdBy: submitter?.name || submitter?.username || 'System',
        targetUserId: req.body.approverId || null,
      });
    }

    res.json({ success: true, cnId, cnNo });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
router.get('/credit-notes/:id', (req, res) => {
  try {
    const fp = coFile(cid(req), 'CreditNotes', req.params.id);
    if (!fs.existsSync(fp)) return res.status(404).json({ error: 'Not found' });
    res.json(JSON.parse(fs.readFileSync(fp, 'utf-8')));
  } catch (e) { res.status(500).json({ error: e.message }); }
});
router.put('/credit-notes/:id', (req, res) => {
  try {
    const companyId = cid(req);
    const fp = coFile(companyId, 'CreditNotes', req.params.id);
    if (!fs.existsSync(fp)) return res.status(404).json({ error: 'Not found' });
    const existing = JSON.parse(fs.readFileSync(fp, 'utf-8'));
    const { items: computed, subTotal, totalGST, grandTotal } = calcNoteItems(req.body.items || existing.items);
    const updated = { ...existing, ...req.body, items: computed, subTotal, totalGST, grandTotal, updatedAt: new Date().toISOString() };
    saveJson(fp, updated);

    if (updated.status === 'pending' && existing.status !== 'pending') {
      const submitter = resolveUser(req);
      notifyApprovers({
        companyId, module: 'creditnote', recordId: existing.cnId,
        recordLabel: `Credit Note ${existing.cnNo} — ${updated.party || ''}`,
        message: `Credit Note ${existing.cnNo} (${updated.party || ''}) needs your approval`,
        link: '/account/credit-note',
        createdBy: submitter?.name || submitter?.username || 'System',
        targetUserId: req.body.approverId || null,
      });
    }

    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
router.delete('/credit-notes/:id', (req, res) => {
  try {
    const fp = coFile(cid(req), 'CreditNotes', req.params.id);
    if (!fs.existsSync(fp)) return res.status(404).json({ error: 'Not found' });
    fs.unlinkSync(fp); res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
