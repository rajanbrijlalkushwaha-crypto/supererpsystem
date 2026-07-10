const express  = require('express');
const crypto   = require('crypto');
const path     = require('path');
const fs       = require('fs');
const multer   = require('multer');
const { ROOT } = require('./helpers');

const router     = express.Router();
const USERS_FILE = path.join(ROOT, 'Database', 'users.json');

// Shared in-memory session store (also read by helpers.js for audit trail)
const SESSIONS = require('./sessions');

/* ── helpers ──────────────────────────────────── */
const hashPwd = pwd => crypto.createHash('sha256').update(pwd + 'epsilon-erp-salt-2024').digest('hex');

const ensureUsers = () => {
  if (!fs.existsSync(USERS_FILE)) {
    fs.mkdirSync(path.dirname(USERS_FILE), { recursive: true });
    const defaults = [
      {
        id: 1, username: 'admin', password: hashPwd('admin123'),
        name: 'Administrator', role: 'admin',
        email: 'admin@epsilon.com', active: true,
        createdAt: new Date().toISOString(),
      },
    ];
    fs.writeFileSync(USERS_FILE, JSON.stringify(defaults, null, 2));
    return defaults;
  }
  try { return JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8')); }
  catch { return []; }
};

const saveUsers = users =>
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));

const tokenFromHeader = req =>
  (req.headers.authorization || '').replace(/^Bearer\s+/, '').trim();

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

/* ── POST /api/auth/login ─────────────────────── */
router.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password)
    return res.status(400).json({ error: 'Username and password are required.' });

  const users = ensureUsers();
  const user  = users.find(
    u => (u.username === username.trim() || u.email === username.trim()) && u.active !== false
  );

  if (!user || user.password !== hashPwd(password))
    return res.status(401).json({ error: 'Invalid username or password.' });

  if (user.suspended)
    return res.status(403).json({ error: 'Your account has been suspended. Please contact the administrator.' });

  if (user.validUntil && new Date(user.validUntil) < new Date())
    return res.status(403).json({ error: `Your account access expired on ${new Date(user.validUntil).toLocaleDateString('en-IN')}. Please contact the administrator.` });

  const token     = crypto.randomBytes(32).toString('hex');
  const expiresAt = Date.now() + 8 * 60 * 60 * 1000; // 8 hours
  SESSIONS.set(token, { userId: user.id, username: user.username, name: user.name, role: user.role, expiresAt });

  res.json({
    token,
    user: { id: user.id, username: user.username, name: user.name, role: user.role, email: user.email, permissions: user.permissions ?? null },
  });
});

/* ── POST /api/auth/logout ────────────────────── */
router.post('/logout', (req, res) => {
  SESSIONS.delete(tokenFromHeader(req));
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
  const users = ensureUsers();
  const u = users.find(u => u.id === session.userId);
  res.json({
    userId: session.userId, username: session.username,
    name: session.name, role: session.role,
    email: u?.email || '',
    permissions: u?.permissions ?? null,
  });
});

/* ── GET /api/auth/users ─────────────────────────────────────────────────
   Also update login to include permissions in response
─────────────────────────────────────────────────────────────────────── */
router.get('/users', (req, res) => {
  const users = ensureUsers().map(({ password, ...rest }) => rest);
  res.json(users);
});

/* ── POST /api/auth/users ─────────────────────── */
router.post('/users', (req, res) => {
  const { username, password, name, role, email } = req.body || {};
  if (!username || !password || !name)
    return res.status(400).json({ error: 'username, password and name are required.' });

  const users = ensureUsers();
  if (users.find(u => u.username === username))
    return res.status(409).json({ error: 'Username already exists.' });

  const newUser = {
    id: Date.now(), username, password: hashPwd(password),
    name, role: role || 'user', email: email || '', active: true,
    createdAt: new Date().toISOString(),
  };
  users.push(newUser);
  saveUsers(users);

  const { password: _, ...safe } = newUser;
  res.json({ success: true, user: safe });
});

/* ── PUT /api/auth/users/:id/password ────────── */
router.put('/users/:id/password', (req, res) => {
  const { password } = req.body || {};
  if (!password) return res.status(400).json({ error: 'password is required.' });

  const users = ensureUsers();
  const idx   = users.findIndex(u => u.id == req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'User not found.' });

  users[idx].password = hashPwd(password);
  saveUsers(users);
  res.json({ success: true });
});

/* ── DELETE /api/auth/users/:id ──────────────── */
router.delete('/users/:id', (req, res) => {
  const users  = ensureUsers();
  const idx    = users.findIndex(u => u.id == req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'User not found.' });
  if (users[idx].role === 'admin' && users.filter(u => u.role === 'admin').length === 1)
    return res.status(400).json({ error: 'Cannot delete the last admin.' });

  users.splice(idx, 1);
  saveUsers(users);
  res.json({ success: true });
});

/* ── Password Reset Tokens ─────────────────────── */
const RESET_FILE = path.join(ROOT, 'Database', 'reset-tokens.json');

const readResetTokens = () => {
  try {
    if (!fs.existsSync(RESET_FILE)) return [];
    return JSON.parse(fs.readFileSync(RESET_FILE, 'utf8')) || [];
  } catch { return []; }
};
const saveResetTokens = tokens => {
  fs.mkdirSync(path.dirname(RESET_FILE), { recursive: true });
  fs.writeFileSync(RESET_FILE, JSON.stringify(tokens, null, 2));
};

/* POST /api/auth/forgot-password */
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body || {};
  if (!email) return res.status(400).json({ error: 'Email is required.' });

  const users = ensureUsers();
  const user  = users.find(u => u.email && u.email.toLowerCase() === email.trim().toLowerCase() && u.active !== false);

  // Always return success — prevents email enumeration
  if (!user) return res.json({ success: true, message: 'If that email is registered, a reset link has been sent.' });

  const token     = crypto.randomBytes(32).toString('hex');
  const expiresAt = Date.now() + 60 * 60 * 1000; // 1 hour

  // Replace any existing token for this user
  const tokens = readResetTokens().filter(t => t.userId !== user.id);
  tokens.push({ token, userId: user.id, email: user.email, expiresAt });
  saveResetTokens(tokens);

  try {
    const cfg = fs.existsSync(EMAIL_CFG_FILE) ? JSON.parse(fs.readFileSync(EMAIL_CFG_FILE, 'utf8')) : {};
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
      from:    `"Epsilon ERP" <${cfg.email}>`,
      to:      user.email,
      subject: 'Password Reset — Epsilon ERP',
      html: `
        <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">
          <div style="background:#133d80;padding:24px 32px">
            <div style="font-size:22px;font-weight:800;color:#fff;letter-spacing:-0.3px">⚡ Epsilon ERP</div>
            <div style="font-size:13px;color:#93c5fd;margin-top:4px">Password Reset Request</div>
          </div>
          <div style="padding:32px">
            <p style="font-size:15px;color:#111827;margin:0 0 12px">Hi <strong>${user.name}</strong>,</p>
            <p style="font-size:13px;color:#374151;line-height:1.6;margin:0 0 24px">
              We received a request to reset your Epsilon ERP password.<br>
              Click the button below to set a new password. This link expires in <strong>1 hour</strong>.
            </p>
            <a href="${resetUrl}" style="display:inline-block;background:#133d80;color:#fff;padding:13px 32px;border-radius:8px;font-size:14px;font-weight:700;text-decoration:none;letter-spacing:0.2px">
              Reset My Password →
            </a>
            <p style="font-size:12px;color:#9ca3af;margin:24px 0 0;line-height:1.6">
              If you didn't request this, you can safely ignore this email — your password won't change.<br>
              Link: <a href="${resetUrl}" style="color:#133d80">${resetUrl}</a>
            </p>
          </div>
          <div style="background:#f9fafb;padding:12px 32px;font-size:11px;color:#9ca3af;border-top:1px solid #e5e7eb">
            © Epsilon ERP · This is an automated message, do not reply
          </div>
        </div>`,
    });

    res.json({ success: true, message: 'Password reset link sent to your email.' });
  } catch (e) {
    // Clean up token if email failed
    saveResetTokens(readResetTokens().filter(t => t.token !== token));
    res.status(500).json({ error: 'Failed to send email: ' + e.message });
  }
});

/* GET /api/auth/verify-reset-token/:token */
router.get('/verify-reset-token/:token', (req, res) => {
  const rt = readResetTokens().find(t => t.token === req.params.token && t.expiresAt > Date.now());
  if (!rt) return res.status(400).json({ valid: false, error: 'Reset link is invalid or has expired.' });
  res.json({ valid: true, email: rt.email });
});

/* POST /api/auth/reset-password */
router.post('/reset-password', (req, res) => {
  const { token, password } = req.body || {};
  if (!token || !password) return res.status(400).json({ error: 'Token and new password are required.' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });

  const tokens = readResetTokens();
  const rt     = tokens.find(t => t.token === token && t.expiresAt > Date.now());
  if (!rt) return res.status(400).json({ error: 'Reset link is invalid or has expired. Please request a new one.' });

  const users = ensureUsers();
  const idx   = users.findIndex(u => u.id === rt.userId);
  if (idx === -1) return res.status(404).json({ error: 'User not found.' });

  users[idx].password = hashPwd(password);
  saveUsers(users);
  saveResetTokens(tokens.filter(t => t.token !== token)); // consume token

  res.json({ success: true, message: 'Password reset successfully. You can now log in.' });
});

/* ── Email Config ──────────────────────────────── */
const EMAIL_CFG_FILE = path.join(ROOT, 'Database', 'email-config.json');

router.get('/email-config', (_req, res) => {
  try {
    const cfg = fs.existsSync(EMAIL_CFG_FILE) ? JSON.parse(fs.readFileSync(EMAIL_CFG_FILE, 'utf8')) : {};
    // Never return the password to the client
    const { password: _, ...safe } = cfg;
    res.json({ ...safe, hasPassword: !!cfg.password });
  } catch { res.json({}); }
});

router.post('/email-config', (req, res) => {
  try {
    const existing = fs.existsSync(EMAIL_CFG_FILE) ? JSON.parse(fs.readFileSync(EMAIL_CFG_FILE, 'utf8')) : {};
    const { password, ...rest } = req.body;
    const cfg = { ...existing, ...rest };
    if (password) cfg.password = password; // only update password if provided
    fs.mkdirSync(path.dirname(EMAIL_CFG_FILE), { recursive: true });
    fs.writeFileSync(EMAIL_CFG_FILE, JSON.stringify(cfg, null, 2));
    const { password: _, ...safe } = cfg;
    res.json({ success: true, config: { ...safe, hasPassword: !!cfg.password } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/email-config/test', async (req, res) => {
  try {
    const cfg = fs.existsSync(EMAIL_CFG_FILE) ? JSON.parse(fs.readFileSync(EMAIL_CFG_FILE, 'utf8')) : {};
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
router.put('/users/:id', (req, res) => {
  const users = ensureUsers();
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
  saveUsers(users);
  const { password: _, ...safe } = users[idx];
  res.json({ success: true, user: safe });
});

/* ── Invite Token helpers ──────────────────────── */
const INVITE_FILE = path.join(ROOT, 'Database', 'invite-tokens.json');
const readInviteTokens = () => {
  try { return JSON.parse(fs.readFileSync(INVITE_FILE, 'utf8')) || []; } catch { return []; }
};
const saveInviteTokens = tokens => {
  fs.mkdirSync(path.dirname(INVITE_FILE), { recursive: true });
  fs.writeFileSync(INVITE_FILE, JSON.stringify(tokens, null, 2));
};

/* ── POST /api/auth/users/invite ─────────────── */
router.post('/users/invite', async (req, res) => {
  const { firstName, middleName, lastName, email, phone, role, permissions, designation, department } = req.body || {};
  if (!firstName || !lastName || !email)
    return res.status(400).json({ error: 'First name, last name and email are required.' });

  const users = ensureUsers();
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
  saveUsers(users);

  // Generate invite token (7 days)
  const token    = crypto.randomBytes(32).toString('hex');
  const expAt    = Date.now() + 7 * 24 * 60 * 60 * 1000;
  const invites  = readInviteTokens().filter(t => t.userId !== newUser.id);
  invites.push({ token, userId: newUser.id, email: newUser.email, expiresAt: expAt });
  saveInviteTokens(invites);

  const inviteUrl = `${frontendUrl(req)}/set-password?token=${token}`;

  // Send invite email if configured
  let emailSent = false; let emailError = null;
  try {
    const cfg = fs.existsSync(EMAIL_CFG_FILE) ? JSON.parse(fs.readFileSync(EMAIL_CFG_FILE, 'utf8')) : {};
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
router.post('/users/:id/resend-invite', async (req, res) => {
  const users = ensureUsers();
  const user  = users.find(u => u.id == req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  if (user.active && user.status === 'active')
    return res.status(400).json({ error: 'User is already active.' });

  // Regenerate invite token
  const token   = crypto.randomBytes(32).toString('hex');
  const expAt   = Date.now() + 7 * 24 * 60 * 60 * 1000;
  const invites = readInviteTokens().filter(t => t.userId !== user.id);
  invites.push({ token, userId: user.id, email: user.email, expiresAt: expAt });
  saveInviteTokens(invites);

  const inviteUrl = `${frontendUrl(req)}/set-password?token=${token}`;

  let emailSent = false; let emailError = null;
  try {
    const cfg = fs.existsSync(EMAIL_CFG_FILE) ? JSON.parse(fs.readFileSync(EMAIL_CFG_FILE, 'utf8')) : {};
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
  const inv = readInviteTokens().find(t => t.token === req.params.token && t.expiresAt > Date.now());
  if (!inv) return res.status(400).json({ valid: false, error: 'Invite link is invalid or has expired.' });
  const u = ensureUsers().find(u => u.id === inv.userId);
  if (!u) return res.status(404).json({ valid: false, error: 'User not found.' });
  res.json({ valid: true, email: inv.email, username: u.username, name: u.name });
});

/* ── POST /api/auth/accept-invite ────────────── */
router.post('/accept-invite', (req, res) => {
  const { token, password } = req.body || {};
  if (!token || !password) return res.status(400).json({ error: 'Token and password are required.' });
  if (password.length < 6)  return res.status(400).json({ error: 'Password must be at least 6 characters.' });

  const invites = readInviteTokens();
  const inv     = invites.find(t => t.token === token && t.expiresAt > Date.now());
  if (!inv) return res.status(400).json({ error: 'Invite link is invalid or has expired.' });

  const users = ensureUsers();
  const idx   = users.findIndex(u => u.id === inv.userId);
  if (idx === -1) return res.status(404).json({ error: 'User not found.' });

  users[idx].password    = hashPwd(password);
  users[idx].active      = true;
  users[idx].status      = 'active';
  users[idx].activatedAt = new Date().toISOString();
  saveUsers(users);
  saveInviteTokens(invites.filter(t => t.token !== token));

  res.json({ success: true, message: 'Account activated! You can now log in.' });
});

/* ── Profile Photo storage ──────────────────── */
const userPhotoDir = (userId) => path.join(ROOT, 'Database', 'Users', String(userId));

const photoUpload = multer({
  storage: multer.diskStorage({
    destination: (req, _file, cb) => {
      const token = (req.headers.authorization || '').replace(/^Bearer\s+/, '').trim();
      const session = SESSIONS.get(token);
      if (!session) return cb(new Error('Unauthorized'));
      const dir = userPhotoDir(session.userId);
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
  const dir = userPhotoDir(req.params.userId);
  for (const ext of ['jpg','jpeg','png','webp']) {
    const fp = path.join(dir, `photo.${ext}`);
    if (fs.existsSync(fp)) return res.sendFile(fp);
  }
  res.status(404).end();
});

/* ── POST /api/auth/profile/photo ────────────── */
router.post('/profile/photo', photoUpload.single('photo'), (req, res) => {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/, '').trim();
  const session = SESSIONS.get(token);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const users = ensureUsers();
  const idx = users.findIndex(u => u.id === session.userId);
  if (idx === -1) return res.status(404).json({ error: 'User not found' });

  const ext = path.extname(req.file.filename).toLowerCase().slice(1) || 'jpg';
  users[idx].photoExt = ext;
  saveUsers(users);

  res.json({ success: true, photoUrl: `/api/auth/profile/photo/${session.userId}?t=${Date.now()}` });
});

/* ── PUT /api/auth/profile ───────────────────── */
router.put('/profile', (req, res) => {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/, '').trim();
  const session = SESSIONS.get(token);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });

  const users = ensureUsers();
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
  saveUsers(users);

  const { password: _, ...safe } = users[idx];
  res.json({ success: true, user: safe });
});

/* ── PUT /api/auth/profile/password ──────────── */
router.put('/profile/password', (req, res) => {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/, '').trim();
  const session = SESSIONS.get(token);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });

  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword)
    return res.status(400).json({ error: 'Both current and new password required' });
  if (newPassword.length < 6)
    return res.status(400).json({ error: 'New password must be at least 6 characters' });

  const users = ensureUsers();
  const idx = users.findIndex(u => u.id === session.userId);
  if (idx === -1) return res.status(404).json({ error: 'User not found' });

  if (users[idx].password !== hashPwd(currentPassword))
    return res.status(401).json({ error: 'Current password is incorrect' });

  users[idx].password = hashPwd(newPassword);
  saveUsers(users);
  res.json({ success: true });
});

module.exports = { router, SESSIONS };
