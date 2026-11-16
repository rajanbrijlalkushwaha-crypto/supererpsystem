const express  = require('express');
const crypto   = require('crypto');
const path     = require('path');
const fs       = require('fs');
const multer   = require('multer');
const { ROOT } = require('./helpers');

const router     = express.Router();
const T          = require('./tenant');

// Shared in-memory session store (also read by helpers.js for audit trail)
const SESSIONS = require('./sessions');

/* ── helpers ──────────────────────────────────── */
const hashPwd = pwd => crypto.createHash('sha256').update(pwd + 'epsilon-erp-salt-2024').digest('hex');

/* users live in each company's own folder: Companies/<companyId>/Users/users.json */
const ensureUsers = cid => T.readUsers(cid);
const saveUsers = (cid, users) => T.writeUsers(cid, users);

const { tokenOf, sessionOf, otherCompany, setLoginCookie, clearLoginCookie } = require('./requireLogin');
/* routes that change users / settings need a login, and work only inside the login's company */
const needLogin = (req, res, next) => {
  const s = sessionOf(req);
  if (!s || !s.companyId) return res.status(401).json({ error: 'Please log in again.' });
  if (otherCompany(req, s)) return res.status(403).json({ error: 'This login is for another company.' });
  req.authUser = s; req.cid = s.companyId;
  return T.runAs(s.companyId, next);
};
/* invite / reset links: kept in the company of their user (Companies/<c>/auth-tokens.json) */
const readTokens = (cid, kind) => T.readJ(T.tokensFile(cid), []).filter(t => t.kind === kind);
const saveTokens = (cid, kind, list) => T.writeJ(T.tokensFile(cid), [...T.readJ(T.tokensFile(cid), []).filter(t => t.kind !== kind), ...list.map(t => ({ ...t, kind }))]);
const findToken = (kind, token) => {
  for (const cid of T.companyIds()) {
    const t = readTokens(cid, kind).find(x => x.token === token && x.expiresAt > Date.now());
    if (t) return { cid, t };
  }
  return null;
};
const mailCfg = cid => T.readEmailCfg(cid);
// the login token: the Authorization header, or the erp_s login cookie the browser sends by itself
const tokenFromHeader = req => tokenOf(req);

/* Derive the public frontend base URL from the request.
   Priority: APP_URL env → Referer origin → Origin header → proto://host */
const frontendUrl = req => {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, '');
  const ref = req.headers.referer || req.headers.referrer || '';
  const fromRef = ref.match(/^(https?:\/\/[^/]+)/)?.[1];
  if (fromRef) return fromRef;
  if (req.headers.origin) return req.headers.origin.replace(/\/$/, '');
  const proto = req.headers['x-forwarded-proto'] || (req.socket?.encrypted ? 'https' : 'http');
  const host  = req.headers['x-forwarded-host']  || req.headers.host;
  return `${proto}://${host}`.replace(/\/$/, '');
};

/* ── GET /api/auth/companies — names only, for the sign-in page (choose the company first) ── */
router.get('/companies', (_req, res) => res.json(T.companyIds().map(c => ({ companyId: c, companyName: T.companyName(c) }))));

/* ── POST /api/auth/login ─────────────────────── */
router.post('/login', (req, res) => {
  const { username, password, companyId } = req.body || {};
  if (!username || !password)
    return res.status(400).json({ error: 'Username and password are required.' });

  // each company has its own users: this username + password in the company asked for, else in every company
  const name = String(username).trim();
  const cids = companyId ? [T.safeCid(companyId)].filter(c => T.companyIds().includes(c)) : T.companyIds();
  const hits = cids.map(cid => ({ cid, user: ensureUsers(cid).find(u => (u.username === name || u.email === name) && u.active !== false) }))
    .filter(x => x.user && x.user.password === hashPwd(password));
  if (!hits.length) return res.status(401).json({ error: 'Invalid username or password.' });
  // the same login in two companies: ask which one
  if (hits.length > 1) return res.status(409).json({ chooseCompany: hits.map(x => ({ companyId: x.cid, companyName: T.companyName(x.cid) })), error: 'Choose the company to sign in to.' });
  const { cid, user } = hits[0];

  if (user.suspended)
    return res.status(403).json({ error: 'Your account has been suspended. Please contact the administrator.' });

  if (user.validUntil && new Date(user.validUntil) < new Date())
    return res.status(403).json({ error: `Your account access expired on ${new Date(user.validUntil).toLocaleDateString('en-IN')}. Please contact the administrator.` });

  const token     = crypto.randomBytes(32).toString('hex');
  const expiresAt = Date.now() + 8 * 60 * 60 * 1000; // 8 hours
  SESSIONS.set(token, { userId: user.id, companyId: cid, username: user.username, name: user.name, role: user.role, expiresAt });
  setLoginCookie(res, token);

  res.json({
    token, companyId: cid, companyName: T.companyName(cid),
    user: { id: user.id, username: user.username, name: user.name, role: user.role, email: user.email, permissions: user.permissions ?? null, companyId: cid },
  });
});

/* ── switching company after sign-in ─────────────
   Allowed only into a company where this same username has its own account that is active (not suspended / expired).
   Same password there → switches at once; a different password → that company's password is asked. */
const okUser = u => u && u.active !== false && !u.suspended && !(u.validUntil && new Date(u.validUntil) < new Date());
const accountIn = (cid, username) => ensureUsers(cid).find(u => u.username === username);
router.get('/my-companies', needLogin, (req, res) => {
  const me = accountIn(req.cid, req.authUser.username);
  res.json(T.companyIds().map(cid => ({ cid, u: accountIn(cid, req.authUser.username) })).filter(x => okUser(x.u))
    .map(x => ({ companyId: x.cid, companyName: T.companyName(x.cid), current: x.cid === req.cid, needPassword: !me || x.u.password !== me.password })));
});
router.post('/switch-company', needLogin, (req, res) => {
  const to = T.safeCid(req.body && req.body.to);
  if (!to || !T.companyIds().includes(to)) return res.status(404).json({ error: 'Company not found.' });
  if (to === req.cid) return res.status(400).json({ error: 'You are already in this company.' });
  const target = accountIn(to, req.authUser.username);
  if (!target) return res.status(403).json({ error: `You do not have a login in ${T.companyName(to)}. Ask its admin to add you.` });
  if (!okUser(target)) return res.status(403).json({ error: `Your login in ${T.companyName(to)} is not active (suspended or expired). Ask its admin.` });
  const me = accountIn(req.cid, req.authUser.username);
  if (!me || target.password !== me.password) {
    const pwd = String((req.body && req.body.password) || '');
    if (!pwd) return res.status(401).json({ needPassword: true, error: `Enter your password for ${T.companyName(to)}.` });
    if (hashPwd(pwd) !== target.password) return res.status(401).json({ needPassword: true, error: 'Wrong password for this company.' });
  }
  // a new login for that company; the old one ends
  const old = tokenFromHeader(req);
  const token = crypto.randomBytes(32).toString('hex');
  SESSIONS.set(token, { userId: target.id, companyId: to, username: target.username, name: target.name, role: target.role, expiresAt: Date.now() + 8 * 60 * 60 * 1000 });
  SESSIONS.delete(old);
  setLoginCookie(res, token);
  res.json({ token, companyId: to, companyName: T.companyName(to),
    user: { id: target.id, username: target.username, name: target.name, role: target.role, email: target.email, permissions: target.permissions ?? null, companyId: to } });
});

/* ── POST /api/auth/logout ────────────────────── */
router.post('/logout', (req, res) => {
  SESSIONS.delete(tokenFromHeader(req));
  clearLoginCookie(res);
  res.json({ success: true });
});

/* ── GET /api/auth/me ─────────────────────────── */
router.get('/me', (req, res) => {
  const token   = tokenFromHeader(req);
  const session = SESSIONS.get(token);
  if (!session || session.expiresAt < Date.now()) {
    SESSIONS.delete(token);
    return res.status(401).json({ error: 'Session expired. Please log in again.' });
  }
  session.expiresAt = Date.now() + 8 * 60 * 60 * 1000;
  setLoginCookie(res, token);
  if (!session.companyId) { SESSIONS.delete(token); return res.status(401).json({ error: 'Please log in again.' }); }
  const u = ensureUsers(session.companyId).find(x => x.id === session.userId);
  if (!u || u.active === false || u.suspended) { SESSIONS.delete(token); return res.status(401).json({ error: 'Please log in again.' }); }
  res.json({
    companyId: session.companyId, companyName: T.companyName(session.companyId),
    userId: session.userId, username: session.username,
    name: session.name, role: session.role,
    email: u?.email || '',
    permissions: u?.permissions ?? null,
  });
});

/* ── GET /api/auth/users ─────────────────────────────────────────────────
   Also update login to include permissions in response
─────────────────────────────────────────────────────────────────────── */
router.get('/users', needLogin, (req, res) => {
  const users = ensureUsers(req.cid).map(({ password, ...rest }) => rest);
  res.json(users);
});

/* ── POST /api/auth/users ─────────────────────── */
router.post('/users', needLogin, (req, res) => {
  const { username, password, name, role, email } = req.body || {};
  if (!username || !password || !name)
    return res.status(400).json({ error: 'username, password and name are required.' });

  const users = ensureUsers(req.cid);
  if (users.find(u => u.username === username))
    return res.status(409).json({ error: 'Username already exists.' });

  const newUser = {
    id: Date.now(), username, password: hashPwd(password),
    name, role: role || 'user', email: email || '', active: true,
    createdAt: new Date().toISOString(),
  };
  users.push(newUser);
  saveUsers(req.cid, users);

  const { password: _, ...safe } = newUser;
  res.json({ success: true, user: safe });
});

/* ── PUT /api/auth/users/:id/password ────────── */
router.put('/users/:id/password', needLogin, (req, res) => {
  const { password } = req.body || {};
  if (!password) return res.status(400).json({ error: 'password is required.' });

  const users = ensureUsers(req.cid);
  const idx   = users.findIndex(u => u.id == req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'User not found.' });

  users[idx].password = hashPwd(password);
  saveUsers(req.cid, users);
  res.json({ success: true });
});

/* ── DELETE /api/auth/users/:id ──────────────── */
router.delete('/users/:id', needLogin, (req, res) => {
  const users  = ensureUsers(req.cid);
  const idx    = users.findIndex(u => u.id == req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'User not found.' });
  if (users[idx].role === 'admin' && users.filter(u => u.role === 'admin').length === 1)
    return res.status(400).json({ error: 'Cannot delete the last admin.' });

  users.splice(idx, 1);
  saveUsers(req.cid, users);
  res.json({ success: true });
});

/* ── Password Reset Tokens ─────────────────────── */
/* (kept in each company's auth-tokens.json — readTokens / findToken above) */

/* POST /api/auth/forgot-password */
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body || {};
  if (!email) return res.status(400).json({ error: 'Email is required.' });

  // each company has its own users: the password is reset only in the company chosen on the page
  const want = T.safeCid(req.body?.companyId);
  if (!want || !T.companyIds().includes(want)) return res.status(400).json({ error: 'Choose the company whose password you want to reset.' });
  const hit = T.companyIds().filter(c => c === want)
    .map(cid => ({ cid, user: ensureUsers(cid).find(u => u.email && u.email.toLowerCase() === email.trim().toLowerCase() && u.active !== false) }))
    .find(x => x.user);

  // Always return success — prevents email enumeration
  if (!hit) return res.json({ success: true, message: 'If that email is registered, a reset link has been sent.' });
  const { cid, user } = hit;

  const token     = crypto.randomBytes(32).toString('hex');
  const expiresAt = Date.now() + 60 * 60 * 1000; // 1 hour

  // Replace any existing token for this user
  const tokens = readTokens(cid, 'reset').filter(t => t.userId !== user.id);
  tokens.push({ token, userId: user.id, email: user.email, expiresAt });
  saveTokens(cid, 'reset', tokens);

  try {
    const cfg = mailCfg(cid);   // the company's own mail account
    if (!cfg.email || !cfg.password)
      return res.status(500).json({ error: 'Email is not configured on this server. Ask your admin to set up email in Admin → Settings.' });

    const nodemailer = require('nodemailer');
    const transport  = nodemailer.createTransport({
      service: cfg.service || 'gmail',
      host:    cfg.host    || undefined,
      port:    cfg.port    ? Number(cfg.port) : undefined,
      auth:    { user: cfg.email, pass: cfg.password },
    });

    const resetUrl = `${frontendUrl(req)}/reset-password?token=${token}`;

    await transport.sendMail({
      from:    `"Universal Core ERP Solutions" <${cfg.email}>`,
      to:      user.email,
      subject: `Password Reset Request — ${T.companyName(cid)}`,
      html: `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f0ede8;font-family:Arial,Helvetica,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0ede8;padding:32px 16px">
<tr><td align="center">
<table width="540" cellpadding="0" cellspacing="0" style="max-width:540px;width:100%;background:#ffffff;border-radius:6px;overflow:hidden;box-shadow:0 2px 16px rgba(0,0,0,0.12)">

  <!-- Top accent bar -->
  <tr><td style="background:linear-gradient(90deg,#CC0000,#3A6186);height:4px;font-size:0">&nbsp;</td></tr>

  <!-- Header: brand left, badge right -->
  <tr>
    <td style="padding:0">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <!-- Left: title -->
          <td style="padding:22px 24px 16px;vertical-align:bottom">
            <div style="font-size:22px;color:#111;line-height:1.2">
              <span style="font-weight:300">⚡ Universal Core </span><strong>ERP Solutions</strong>
            </div>
            <div style="font-size:12px;color:#888;margin-top:4px">Password Reset Request</div>
          </td>
          <!-- Right: red badge (like Finacle) -->
          <td align="right" style="vertical-align:top;padding:0">
            <table cellpadding="0" cellspacing="0">
              <tr>
                <td style="background:#CC0000;padding:14px 18px;border-bottom-left-radius:10px">
                  <div style="font-size:16px;font-weight:900;color:#fff;line-height:1;letter-spacing:-0.3px">Finacle ERP</div>
                  <div style="font-size:9px;color:rgba(255,255,255,0.75);font-style:italic;margin-top:3px;letter-spacing:0.5px">Transforming Business</div>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- Divider -->
  <tr><td style="padding:0 24px"><div style="height:1px;background:#e5e7eb"></div></td></tr>

  <!-- Body -->
  <tr>
    <td style="padding:28px 24px 20px">
      <p style="font-size:15px;color:#111827;margin:0 0 10px">Hi <strong>${user.name}</strong>,</p>
      <p style="font-size:13px;color:#374151;line-height:1.7;margin:0 0 24px">
        We received a request to reset your <strong>Universal Core ERP Solutions</strong> password.<br>
        Click the button below to set a new password. This link expires in <strong>1 hour</strong>.
      </p>

      <!-- CTA Button -->
      <table cellpadding="0" cellspacing="0" style="margin-bottom:24px">
        <tr>
          <td style="border-radius:4px;background:linear-gradient(180deg,#4A7FAA 0%,#2D5F8A 100%);border:1px solid #1E4A70;box-shadow:0 2px 6px rgba(0,0,0,0.25)">
            <a href="${resetUrl}" style="display:inline-block;color:#ffffff;padding:11px 32px;font-size:14px;font-weight:700;text-decoration:none;letter-spacing:0.3px;font-family:Arial,sans-serif">
              Reset My Password &rarr;
            </a>
          </td>
        </tr>
      </table>

      <!-- Info / disclaimer -->
      <p style="font-size:12px;color:#9ca3af;margin:0;line-height:1.7">
        If you didn't request this, you can safely ignore this email — your password won't change.<br>
        Link: <a href="${resetUrl}" style="color:#3A6186;word-break:break-all">${resetUrl}</a>
      </p>
    </td>
  </tr>

  <!-- Footer -->
  <tr>
    <td style="background:#f8fafc;border-top:1px solid #e5e7eb;padding:12px 24px">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="font-size:10px;color:#9CA3AF;line-height:1.5">
            Copyright &copy; 2024&ndash;2025 Epsilon Group Limited. All rights reserved. epsilonprefab.org
          </td>
          <td align="right" style="font-size:16px;font-weight:900;color:#003580;font-style:italic;white-space:nowrap;letter-spacing:-0.3px">
            Epsilongroup
          </td>
        </tr>
      </table>
    </td>
  </tr>

</table>
</td></tr>
</table>
</body></html>`,
    });

    res.json({ success: true, message: 'Password reset link sent to your email.' });
  } catch (e) {
    // Clean up token if email failed
    saveTokens(cid, 'reset', readTokens(cid, 'reset').filter(t => t.token !== token));
    res.status(500).json({ error: 'Failed to send email: ' + e.message });
  }
});

/* GET /api/auth/verify-reset-token/:token */
router.get('/verify-reset-token/:token', (req, res) => {
  const rt = (findToken('reset', req.params.token) || {}).t;
  if (!rt) return res.status(400).json({ valid: false, error: 'Reset link is invalid or has expired.' });
  res.json({ valid: true, email: rt.email });
});

/* POST /api/auth/reset-password */
router.post('/reset-password', (req, res) => {
  const { token, password } = req.body || {};
  if (!token || !password) return res.status(400).json({ error: 'Token and new password are required.' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });

  const found = findToken('reset', token);
  if (!found) return res.status(400).json({ error: 'Reset link is invalid or has expired. Please request a new one.' });
  const { cid, t: rt } = found;
  const tokens = readTokens(cid, 'reset');

  const users = ensureUsers(cid);
  const idx   = users.findIndex(u => u.id === rt.userId);
  if (idx === -1) return res.status(404).json({ error: 'User not found.' });

  users[idx].password = hashPwd(password);
  saveUsers(cid, users);
  saveTokens(cid, 'reset', tokens.filter(t => t.token !== token)); // consume token

  res.json({ success: true, message: 'Password reset successfully. You can now log in.' });
});

/* ── Email Config ──────────────────────────────── */
/* each company's own mail account: Companies/<companyId>/email-config.json */

router.get('/email-config', needLogin, (req, res) => {
  try {
    const cfg = mailCfg(req.cid);
    // Never return the password to the client
    const { password: _, ...safe } = cfg;
    res.json({ ...safe, hasPassword: !!cfg.password });
  } catch { res.json({}); }
});

router.post('/email-config', needLogin, (req, res) => {
  try {
    const existing = mailCfg(req.cid);
    const { password, companyId: _c, ...rest } = req.body || {};
    const cfg = { ...existing, ...rest };
    if (password) cfg.password = password; // only update password if provided
    T.writeJ(T.emailCfgFile(req.cid), { ...cfg, companyId: req.cid });
    const { password: _, ...safe } = cfg;
    res.json({ success: true, config: { ...safe, hasPassword: !!cfg.password } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/email-config/test', needLogin, async (req, res) => {
  try {
    const cfg = mailCfg(req.cid);
    if (!cfg.email || !cfg.password) return res.status(400).json({ error: 'Email config not saved yet.' });
    const nodemailer = require('nodemailer');
    const transport = nodemailer.createTransport({
      service: cfg.service || 'gmail',
      host: cfg.host || undefined,
      port: cfg.port ? Number(cfg.port) : undefined,
      auth: { user: cfg.email, pass: cfg.password },
    });
    await transport.verify();
    res.json({ success: true, message: 'Connection successful! Email is configured correctly.' });
  } catch (e) { res.status(500).json({ error: 'Connection failed: ' + e.message }); }
});

/* ── PUT /api/auth/users/:id ─────────────────── */
router.put('/users/:id', needLogin, (req, res) => {
  const users = ensureUsers(req.cid);
  const idx   = users.findIndex(u => u.id == req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'User not found.' });

  const { firstName, middleName, lastName, email, phone, role, active, permissions, designation, department, suspended, validUntil } = req.body || {};
  const fullName = firstName && lastName
    ? [firstName, middleName, lastName].filter(Boolean).join(' ')
    : users[idx].name;

  users[idx] = {
    ...users[idx],
    ...(firstName  !== undefined && { firstName }),
    ...(middleName !== undefined && { middleName }),
    ...(lastName   !== undefined && { lastName }),
    name: fullName,
    ...(email       !== undefined && { email }),
    ...(phone       !== undefined && { phone }),
    ...(role        !== undefined && { role }),
    ...(active      !== undefined && { active }),
    ...(permissions !== undefined && { permissions }),
    ...(designation !== undefined && { designation }),
    ...(department  !== undefined && { department }),
    ...(suspended   !== undefined && { suspended: !!suspended }),
    ...(validUntil  !== undefined && { validUntil: validUntil || null }),
    updatedAt: new Date().toISOString(),
  };
  saveUsers(req.cid, users);
  const { password: _, ...safe } = users[idx];
  res.json({ success: true, user: safe });
});

/* ── Invite Token helpers ──────────────────────── */
/* (kept in each company's auth-tokens.json) */

/* ── POST /api/auth/users/invite ─────────────── */
router.post('/users/invite', needLogin, async (req, res) => {
  const { firstName, middleName, lastName, email, phone, role, permissions, designation, department } = req.body || {};
  if (!firstName || !lastName || !email)
    return res.status(400).json({ error: 'First name, last name and email are required.' });

  const users = ensureUsers(req.cid);
  if (users.find(u => u.email && u.email.toLowerCase() === email.trim().toLowerCase()))
    return res.status(409).json({ error: 'A user with this email already exists.' });

  // Auto-generate unique username from email
  let baseUser = email.split('@')[0].toLowerCase().replace(/[^a-z0-9.]/g, '');
  let username = baseUser;
  let sfx = 1;
  while (users.find(u => u.username === username)) username = baseUser + (sfx++);

  const fullName = [firstName, middleName, lastName].filter(Boolean).join(' ');
  const newUser = {
    id: Date.now(), username, password: null,
    firstName, middleName: middleName || '', lastName,
    name: fullName, email: email.trim(), phone: phone || '',
    role: role || 'user', designation: designation || '', department: department || '',
    active: false, status: 'pending',
    permissions: permissions || {},
    createdAt: new Date().toISOString(),
  };
  users.push(newUser);
  saveUsers(req.cid, users);

  // Generate invite token (7 days)
  const token    = crypto.randomBytes(32).toString('hex');
  const expAt    = Date.now() + 7 * 24 * 60 * 60 * 1000;
  const invites  = readTokens(req.cid, 'invite').filter(t => t.userId !== newUser.id);
  invites.push({ token, userId: newUser.id, email: newUser.email, expiresAt: expAt });
  saveTokens(req.cid, 'invite', invites);

  const inviteUrl = `${frontendUrl(req)}/set-password?token=${token}`;

  // Send invite email if configured
  let emailSent = false; let emailError = null;
  try {
    const cfg = mailCfg(req.cid);
    if (cfg.email && cfg.password) {
      const nodemailer = require('nodemailer');
      const transport  = nodemailer.createTransport({
        service: cfg.service || 'gmail', host: cfg.host || undefined,
        port: cfg.port ? Number(cfg.port) : undefined,
        auth: { user: cfg.email, pass: cfg.password },
      });
      await transport.sendMail({
        from: `"Epsilon ERP" <${cfg.email}>`, to: newUser.email,
        subject: 'You have been invited to Epsilon ERP',
        html: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">
          <div style="background:#133d80;padding:24px 32px">
            <div style="font-size:22px;font-weight:800;color:#fff">⚡ Epsilon ERP</div>
            <div style="font-size:13px;color:#93c5fd;margin-top:4px">Account Invitation</div>
          </div>
          <div style="padding:32px">
            <p style="font-size:15px;color:#111827;margin:0 0 12px">Hi <strong>${newUser.firstName}</strong>,</p>
            <p style="font-size:13px;color:#374151;line-height:1.6;margin:0 0 16px">You've been added to <strong>Epsilon ERP</strong>. Your account details:</p>
            <div style="background:#f8faff;border:1px solid #e0e7ff;border-radius:8px;padding:16px;margin:0 0 20px;font-size:13px;">
              <div style="margin-bottom:8px;"><strong>Username:</strong> ${username}</div>
              <div><strong>Email:</strong> ${newUser.email}</div>
            </div>
            <p style="font-size:13px;color:#374151;margin:0 0 20px">Click below to set your password and activate your account. Link expires in <strong>7 days</strong>.</p>
            <a href="${inviteUrl}" style="display:inline-block;background:#133d80;color:#fff;padding:13px 32px;border-radius:8px;font-size:14px;font-weight:700;text-decoration:none;">Set Password &amp; Activate →</a>
            <p style="font-size:12px;color:#9ca3af;margin:24px 0 0;">Link: <a href="${inviteUrl}" style="color:#133d80">${inviteUrl}</a></p>
          </div>
          <div style="background:#f9fafb;padding:12px 32px;font-size:11px;color:#9ca3af;border-top:1px solid #e5e7eb">© Epsilon ERP · Automated message</div>
        </div>`,
      });
      emailSent = true;
    }
  } catch(e) { emailError = e.message; }

  const { password: _, ...safe } = newUser;
  res.json({ success: true, user: safe, username, inviteUrl, emailSent, emailError });
});

/* ── POST /api/auth/users/:id/resend-invite ─── */
router.post('/users/:id/resend-invite', needLogin, async (req, res) => {
  const users = ensureUsers(req.cid);
  const user  = users.find(u => u.id == req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  if (user.active && user.status === 'active')
    return res.status(400).json({ error: 'User is already active.' });

  // Regenerate invite token
  const token   = crypto.randomBytes(32).toString('hex');
  const expAt   = Date.now() + 7 * 24 * 60 * 60 * 1000;
  const invites = readTokens(req.cid, 'invite').filter(t => t.userId !== user.id);
  invites.push({ token, userId: user.id, email: user.email, expiresAt: expAt });
  saveTokens(req.cid, 'invite', invites);

  const inviteUrl = `${frontendUrl(req)}/set-password?token=${token}`;

  let emailSent = false; let emailError = null;
  try {
    const cfg = mailCfg(req.cid);
    if (cfg.email && cfg.password) {
      const nodemailer = require('nodemailer');
      const transport  = nodemailer.createTransport({
        service: cfg.service || 'gmail', host: cfg.host || undefined,
        port: cfg.port ? Number(cfg.port) : undefined,
        auth: { user: cfg.email, pass: cfg.password },
      });
      await transport.sendMail({
        from: `"Epsilon ERP" <${cfg.email}>`, to: user.email,
        subject: 'Your Epsilon ERP Invitation (Resent)',
        html: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">
          <div style="background:#133d80;padding:24px 32px">
            <div style="font-size:22px;font-weight:800;color:#fff">⚡ Epsilon ERP</div>
            <div style="font-size:13px;color:#93c5fd;margin-top:4px">Account Invitation (Resent)</div>
          </div>
          <div style="padding:32px">
            <p style="font-size:15px;color:#111827;margin:0 0 12px">Hi <strong>${user.firstName || user.name}</strong>,</p>
            <p style="font-size:13px;color:#374151;line-height:1.6;margin:0 0 16px">Your invitation to <strong>Epsilon ERP</strong> has been resent. Your username is <strong>${user.username}</strong>.</p>
            <p style="font-size:13px;color:#374151;margin:0 0 20px">Click below to set your password. Link expires in <strong>7 days</strong>.</p>
            <a href="${inviteUrl}" style="display:inline-block;background:#133d80;color:#fff;padding:13px 32px;border-radius:8px;font-size:14px;font-weight:700;text-decoration:none;">Set Password &amp; Activate →</a>
            <p style="font-size:12px;color:#9ca3af;margin:24px 0 0;">Link: <a href="${inviteUrl}" style="color:#133d80">${inviteUrl}</a></p>
          </div>
          <div style="background:#f9fafb;padding:12px 32px;font-size:11px;color:#9ca3af;border-top:1px solid #e5e7eb">© Epsilon ERP · Automated message</div>
        </div>`,
      });
      emailSent = true;
    }
  } catch(e) { emailError = e.message; }

  const { password: _, ...safe } = user;
  res.json({ success: true, user: safe, username: user.username, inviteUrl, emailSent, emailError });
});

/* ── GET /api/auth/verify-invite/:token ──────── */
router.get('/verify-invite/:token', (req, res) => {
  const found = findToken('invite', req.params.token);
  if (!found) return res.status(400).json({ valid: false, error: 'Invite link is invalid or has expired.' });
  const inv = found.t;
  const u = ensureUsers(found.cid).find(x => x.id === inv.userId);
  if (!u) return res.status(404).json({ valid: false, error: 'User not found.' });
  res.json({ valid: true, email: inv.email, username: u.username, name: u.name });
});

/* ── POST /api/auth/accept-invite ────────────── */
router.post('/accept-invite', (req, res) => {
  const { token, password } = req.body || {};
  if (!token || !password) return res.status(400).json({ error: 'Token and password are required.' });
  if (password.length < 6)  return res.status(400).json({ error: 'Password must be at least 6 characters.' });

  const found = findToken('invite', token);
  if (!found) return res.status(400).json({ error: 'Invite link is invalid or has expired.' });
  const { cid, t: inv } = found;
  const invites = readTokens(cid, 'invite');

  const users = ensureUsers(cid);
  const idx   = users.findIndex(u => u.id === inv.userId);
  if (idx === -1) return res.status(404).json({ error: 'User not found.' });

  users[idx].password    = hashPwd(password);
  users[idx].active      = true;
  users[idx].status      = 'active';
  users[idx].activatedAt = new Date().toISOString();
  saveUsers(cid, users);
  saveTokens(cid, 'invite', invites.filter(t => t.token !== token));

  res.json({ success: true, message: 'Account activated! You can now log in.' });
});

/* ── Profile Photo storage ──────────────────── */
const userPhotoDir = (cid, userId) => T.userDir(cid, userId);

const photoUpload = multer({
  storage: multer.diskStorage({
    destination: (req, _file, cb) => {
      const session = sessionOf(req);
      if (!session || !session.companyId) return cb(new Error('Unauthorized'));
      const dir = userPhotoDir(session.companyId, session.userId);
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
      cb(null, `photo${ext}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files are allowed'));
  },
});

/* ── GET /api/auth/profile/photo/:userId ─────── */
router.get('/profile/photo/:userId', (req, res) => {
  const session = sessionOf(req);   // a photo of a user of the login's company
  if (!session || !session.companyId) return res.status(401).end();
  const dir = userPhotoDir(session.companyId, req.params.userId);
  for (const ext of ['jpg','jpeg','png','webp']) {
    const fp = path.join(dir, `photo.${ext}`);
    if (fs.existsSync(fp)) return res.sendFile(fp);
  }
  res.status(404).end();
});

/* ── POST /api/auth/profile/photo ────────────── */
router.post('/profile/photo', photoUpload.single('photo'), (req, res) => {
  const session = sessionOf(req);
  if (!session || !session.companyId) return res.status(401).json({ error: 'Unauthorized' });
  const cid = session.companyId;
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const users = ensureUsers(cid);
  const idx = users.findIndex(u => u.id === session.userId);
  if (idx === -1) return res.status(404).json({ error: 'User not found' });

  const ext = path.extname(req.file.filename).toLowerCase().slice(1) || 'jpg';
  users[idx].photoExt = ext;
  saveUsers(cid, users);

  res.json({ success: true, photoUrl: `/api/auth/profile/photo/${session.userId}?t=${Date.now()}` });
});

/* ── PUT /api/auth/profile ───────────────────── */
router.put('/profile', (req, res) => {
  const session = sessionOf(req);
  if (!session || !session.companyId) return res.status(401).json({ error: 'Unauthorized' });
  const cid = session.companyId;

  const users = ensureUsers(cid);
  const idx = users.findIndex(u => u.id === session.userId);
  if (idx === -1) return res.status(404).json({ error: 'User not found' });

  const { firstName, middleName, lastName, email, phone, designation, department, dashboardPrefs } = req.body || {};
  if (firstName  !== undefined) users[idx].firstName  = firstName;
  if (middleName !== undefined) users[idx].middleName = middleName;
  if (lastName   !== undefined) users[idx].lastName   = lastName;
  if (firstName && lastName)
    users[idx].name = [firstName, middleName, lastName].filter(Boolean).join(' ');
  if (email          !== undefined) users[idx].email       = email;
  if (phone          !== undefined) users[idx].phone       = phone;
  if (designation    !== undefined) users[idx].designation = designation;
  if (department     !== undefined) users[idx].department  = department;
  if (dashboardPrefs !== undefined) users[idx].dashboardPrefs = dashboardPrefs;
  users[idx].updatedAt = new Date().toISOString();
  saveUsers(cid, users);

  const { password: _, ...safe } = users[idx];
  res.json({ success: true, user: safe });
});

/* ── PUT /api/auth/profile/password ──────────── */
router.put('/profile/password', (req, res) => {
  const session = sessionOf(req);
  if (!session || !session.companyId) return res.status(401).json({ error: 'Unauthorized' });
  const cid = session.companyId;

  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword)
    return res.status(400).json({ error: 'Both current and new password required' });
  if (newPassword.length < 6)
    return res.status(400).json({ error: 'New password must be at least 6 characters' });

  const users = ensureUsers(cid);
  const idx = users.findIndex(u => u.id === session.userId);
  if (idx === -1) return res.status(404).json({ error: 'User not found' });

  if (users[idx].password !== hashPwd(currentPassword))
    return res.status(401).json({ error: 'Current password is incorrect' });

  users[idx].password = hashPwd(newPassword);
  saveUsers(cid, users);
  res.json({ success: true });
});

module.exports = { router, SESSIONS };
