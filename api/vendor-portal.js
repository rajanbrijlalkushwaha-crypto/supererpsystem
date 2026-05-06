const express  = require('express');
const crypto   = require('crypto');
const path     = require('path');
const fs       = require('fs');
const { ROOT, saveJson } = require('./helpers');
const jstore   = require('./json-store');

const router = express.Router();

// In-memory OTP store: email → { otp, expires }
const OTP_STORE = new Map();
// In-memory vendor sessions: token → session
const VENDOR_SESSIONS = new Map();

const REG_FILE        = path.join(ROOT, 'Database', 'vendor-registrations.json');
const EMAIL_CFG_FILE  = path.join(ROOT, 'Database', 'email-config.json');

const readRegs  = () => { try { return JSON.parse(fs.readFileSync(REG_FILE, 'utf8')); } catch { return []; } };
const writeRegs = d   => { fs.mkdirSync(path.dirname(REG_FILE), { recursive: true }); fs.writeFileSync(REG_FILE, JSON.stringify(d, null, 2)); };
const readEmailCfg = () => { try { return JSON.parse(fs.readFileSync(EMAIL_CFG_FILE, 'utf8')); } catch { return {}; } };

const hashPwd = (pwd, salt) => crypto.createHash('sha256').update(pwd + salt).digest('hex');

const generateTrackingNo = () => {
  const d = new Date();
  const dt = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
  return `VR-${dt}-${String(Math.floor(10000 + Math.random() * 90000))}`;
};

const vendorJsonPath = (companyId, vendorId, name) => {
  const safe = (name || '').replace(/[\\/:*?"<>|]/g, '_').slice(0, 60);
  return path.join(ROOT, 'Database', 'Companies', companyId, 'Vendor', String(vendorId), `${vendorId}-${safe}.json`);
};

/* ── Professional OTP email HTML ── */
const otpEmailHtml = (otp, purpose, vendorName) => `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F1F5F9;font-family:'Segoe UI',Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F1F5F9;padding:32px 0">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.10)">
        <tr>
          <td style="background:linear-gradient(135deg,#1E293B 0%,#2563EB 100%);padding:28px 32px">
            <div style="font-size:11px;color:rgba(255,255,255,0.55);font-weight:600;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:6px">Epsilon Enterprise</div>
            <div style="font-size:22px;font-weight:800;color:#fff">Vendor Portal</div>
          </td>
        </tr>
        <tr>
          <td style="padding:32px">
            <div style="font-size:15px;font-weight:600;color:#1E293B;margin-bottom:8px">Hello${vendorName ? ', ' + vendorName : ''}!</div>
            <div style="font-size:13.5px;color:#475569;line-height:1.7;margin-bottom:26px">
              ${purpose === 'register'
                ? 'Thank you for registering on the Epsilon Enterprise Vendor Portal. To complete your registration, please use the OTP below to verify your email address.'
                : 'You requested a password reset for your Vendor Portal account. Use the OTP below to set a new password.'}
            </div>
            <div style="background:#EFF6FF;border:2px dashed #93C5FD;border-radius:10px;padding:22px 20px;text-align:center;margin-bottom:24px">
              <div style="font-size:11px;color:#2563EB;font-weight:700;text-transform:uppercase;letter-spacing:3px;margin-bottom:10px">One-Time Password</div>
              <div style="font-size:46px;font-weight:900;color:#1D4ED8;letter-spacing:14px;line-height:1">${otp}</div>
              <div style="font-size:12px;color:#64748B;margin-top:12px">&#9203; Valid for <strong>10 minutes</strong> only</div>
            </div>
            <div style="background:#FFFBEB;border-left:3px solid #F59E0B;border-radius:0 6px 6px 0;padding:10px 14px;font-size:12px;color:#78350F;margin-bottom:22px">
              <strong>Security Notice:</strong> Never share this OTP with anyone. Epsilon Enterprise staff will never ask for your OTP.
            </div>
            <div style="font-size:12.5px;color:#64748B;line-height:1.7">
              If you did not request this, please ignore this email or contact your procurement administrator.
            </div>
          </td>
        </tr>
        <tr>
          <td style="background:#F8FAFC;padding:16px 32px;border-top:1px solid #E5E7EB">
            <div style="font-size:11px;color:#94A3B8;text-align:center">
              &copy; ${new Date().getFullYear()} Epsilon Enterprise &middot; This is an automated message, please do not reply directly.
            </div>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

/* ── Query email HTML ── */
const queryEmailHtml = (vendorName, message, trackingNo) => `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#F1F5F9;font-family:'Segoe UI',Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F1F5F9;padding:32px 0">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.10)">
        <tr>
          <td style="background:linear-gradient(135deg,#1E293B 0%,#2563EB 100%);padding:28px 32px">
            <div style="font-size:11px;color:rgba(255,255,255,0.55);font-weight:600;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:6px">Epsilon Enterprise</div>
            <div style="font-size:22px;font-weight:800;color:#fff">Vendor Registration Query</div>
          </td>
        </tr>
        <tr>
          <td style="padding:28px 32px">
            <div style="font-size:15px;font-weight:600;color:#1E293B;margin-bottom:14px">Dear ${vendorName},</div>
            <div style="font-size:13.5px;color:#475569;line-height:1.8;background:#F8FAFC;border-left:3px solid #2563EB;padding:14px 16px;border-radius:0 8px 8px 0;margin-bottom:20px">${message.replace(/\n/g, '<br>')}</div>
            <div style="padding:12px 14px;background:#ECFDF5;border:1px solid #A7F3D0;border-radius:6px;font-size:12.5px;color:#065F46">
              Your Registration Tracking No: <strong style="letter-spacing:1px">${trackingNo}</strong>
            </div>
            <div style="margin-top:16px;font-size:12px;color:#94A3B8">
              Please reply to this email or contact your procurement team for further assistance.
            </div>
          </td>
        </tr>
        <tr>
          <td style="background:#F8FAFC;padding:16px 32px;border-top:1px solid #E5E7EB">
            <div style="font-size:11px;color:#94A3B8;text-align:center">&copy; ${new Date().getFullYear()} Epsilon Enterprise &middot; Vendor Registration Portal</div>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

/* ── Send email helper ── */
const sendEmail = async (toEmail, subject, html) => {
  const cfg = readEmailCfg();
  if (!cfg.email || !cfg.password) throw new Error('Email not configured. Please set up SMTP in Admin → Email Config.');

  const nodemailer = require('nodemailer');
  const transport = nodemailer.createTransport({
    service: cfg.service && cfg.service !== 'custom' ? cfg.service : undefined,
    host:    cfg.host    || undefined,
    port:    cfg.port    ? Number(cfg.port) : undefined,
    secure:  cfg.secure  !== undefined ? cfg.secure : undefined,
    auth:    { user: cfg.email, pass: cfg.password },
  });

  await transport.sendMail({
    from: `"${cfg.fromName || 'Epsilon Enterprise'}" <${cfg.email}>`,
    to:   toEmail,
    subject,
    html,
  });
};

/* ── POST /api/vendor-portal/send-otp ── */
router.post('/send-otp', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required.' });

    const otp = String(Math.floor(100000 + Math.random() * 900000));
    OTP_STORE.set(email.toLowerCase(), { otp, expires: Date.now() + 10 * 60 * 1000 });
    console.log(`[OTP] Registration OTP for ${email}: ${otp}`);

    try {
      await sendEmail(email, 'Vendor Registration OTP — Epsilon Enterprise', otpEmailHtml(otp, 'register'));
      res.json({ success: true, message: `OTP sent to ${email}. Check your inbox.` });
    } catch (mailErr) {
      console.error('[OTP EMAIL ERROR]', mailErr.message);
      // OTP is stored — return it in dev so registration can proceed even if email fails
      res.json({ success: true, message: 'OTP generated (email delivery failed — check server console for OTP).', devOtp: otp });
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ── POST /api/vendor-portal/register ── */
router.post('/register', (req, res) => {
  try {
    const { email, otp, password, ...data } = req.body;
    if (!email || !otp || !password) return res.status(400).json({ error: 'Email, OTP and password are required.' });

    const stored = OTP_STORE.get(email.toLowerCase());
    if (!stored) return res.status(400).json({ error: 'OTP not found. Please request a new OTP.' });
    if (Date.now() > stored.expires) { OTP_STORE.delete(email.toLowerCase()); return res.status(400).json({ error: 'OTP has expired.' }); }
    if (stored.otp !== String(otp).trim()) return res.status(400).json({ error: 'Invalid OTP.' });
    OTP_STORE.delete(email.toLowerCase());

    const regs = readRegs();
    if (regs.find(r => r.email.toLowerCase() === email.toLowerCase())) {
      return res.status(409).json({ error: 'This email is already registered.' });
    }

    const salt         = crypto.randomBytes(16).toString('hex');
    const passwordHash = hashPwd(password, salt);
    const trackingNo   = generateTrackingNo();

    const reg = {
      id: Date.now(),
      ...data,
      email: email.toLowerCase(),
      passwordHash, salt,
      trackingNo,
      status: 'self-registered',
      createdAt: new Date().toISOString(),
    };
    regs.push(reg);
    writeRegs(regs);

    res.json({ success: true, trackingNo, message: 'Registration submitted! You will be notified once approved.' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ── POST /api/vendor-portal/login ── */
router.post('/login', (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });

    const regs = readRegs();
    const reg  = regs.find(r => r.email.toLowerCase() === email.toLowerCase().trim());
    if (!reg) return res.status(401).json({ error: 'No account found with this email.' });

    const hash = hashPwd(password, reg.salt);
    if (hash !== reg.passwordHash) return res.status(401).json({ error: 'Incorrect password.' });

    if (reg.status === 'self-registered') {
      return res.json({ pending: true, trackingNo: reg.trackingNo, name: reg.vendorName || reg.companyName || reg.email, email: reg.email });
    }
    if (reg.status === 'rejected') return res.status(401).json({ error: 'Your registration was rejected. Please contact admin.' });
    if (reg.status !== 'approved') return res.status(401).json({ error: 'Account not active.' });

    const token = crypto.randomBytes(32).toString('hex');
    VENDOR_SESSIONS.set(token, {
      regId:     reg.id,
      vendorId:  reg.vendorId,
      companyId: reg.companyId,
      name:      reg.vendorName || reg.companyName || reg.email,
      email:     reg.email,
      expiresAt: Date.now() + 8 * 60 * 60 * 1000,
    });

    res.json({
      token,
      vendor: { vendorId: reg.vendorId, name: reg.vendorName || reg.companyName, email: reg.email, companyId: reg.companyId },
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ── POST /api/vendor-portal/forgot-password/send-otp ── */
router.post('/forgot-password/send-otp', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required.' });

    const regs = readRegs();
    const reg  = regs.find(r => r.email.toLowerCase() === email.toLowerCase().trim());
    if (!reg) return res.status(404).json({ error: 'No account found with this email.' });

    const otp = String(Math.floor(100000 + Math.random() * 900000));
    OTP_STORE.set('reset:' + email.toLowerCase(), { otp, expires: Date.now() + 10 * 60 * 1000 });
    console.log(`[RESET OTP] Password reset OTP for ${email}: ${otp}`);

    try {
      await sendEmail(email, 'Password Reset OTP — Epsilon Enterprise', otpEmailHtml(otp, 'reset', reg.vendorName || reg.companyName));
      res.json({ success: true, message: `OTP sent to ${email}. Check your inbox.` });
    } catch (mailErr) {
      console.error('[RESET EMAIL ERROR]', mailErr.message);
      res.json({ success: true, message: 'OTP generated (email delivery failed — check server console for OTP).', devOtp: otp });
    }
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ── POST /api/vendor-portal/forgot-password/reset ── */
router.post('/forgot-password/reset', (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;
    if (!email || !otp || !newPassword) return res.status(400).json({ error: 'Email, OTP and new password are required.' });
    if (newPassword.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });

    const key    = 'reset:' + email.toLowerCase();
    const stored = OTP_STORE.get(key);
    if (!stored) return res.status(400).json({ error: 'OTP not found. Please request a new OTP.' });
    if (Date.now() > stored.expires) { OTP_STORE.delete(key); return res.status(400).json({ error: 'OTP has expired.' }); }
    if (stored.otp !== String(otp).trim()) return res.status(400).json({ error: 'Invalid OTP.' });
    OTP_STORE.delete(key);

    const regs = readRegs();
    const idx  = regs.findIndex(r => r.email.toLowerCase() === email.toLowerCase().trim());
    if (idx === -1) return res.status(404).json({ error: 'Account not found.' });

    const salt = crypto.randomBytes(16).toString('hex');
    regs[idx].passwordHash    = hashPwd(newPassword, salt);
    regs[idx].salt            = salt;
    regs[idx].passwordResetAt = new Date().toISOString();
    writeRegs(regs);

    res.json({ success: true, message: 'Password reset successfully. You can now log in.' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ── Vendor auth middleware ── */
const requireVendorAuth = (req, res, next) => {
  const token   = (req.headers.authorization || '').replace(/^Bearer\s+/, '').trim();
  const session = VENDOR_SESSIONS.get(token);
  if (!session || Date.now() > session.expiresAt) { VENDOR_SESSIONS.delete(token); return res.status(401).json({ error: 'Vendor session expired.' }); }
  session.expiresAt = Date.now() + 8 * 60 * 60 * 1000;
  req.vendor = session;
  next();
};

/* ── GET /api/vendor-portal/me ── */
router.get('/me', requireVendorAuth, (req, res) => res.json(req.vendor));

/* ── GET /api/vendor-portal/registrations — admin list ── */
router.get('/registrations', (_req, res) => {
  try { res.json(readRegs()); } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ── PUT /api/vendor-portal/registrations/:id — admin edit registration ── */
router.put('/registrations/:id', (req, res) => {
  try {
    const regId = Number(req.params.id);
    const regs  = readRegs();
    const idx   = regs.findIndex(r => r.id === regId);
    if (idx === -1) return res.status(404).json({ error: 'Registration not found.' });
    // Preserve sensitive/identity fields, allow editing of vendor data fields
    const { passwordHash, salt, id, status, createdAt, approvedAt, rejectedAt, vendorId, companyId, ...updates } = req.body;
    regs[idx] = { ...regs[idx], ...updates, updatedAt: new Date().toISOString() };
    writeRegs(regs);
    res.json({ success: true, reg: regs[idx] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ── POST /api/vendor-portal/send-query/:id — admin sends email to vendor ── */
router.post('/send-query/:id', async (req, res) => {
  try {
    const regId = Number(req.params.id);
    const { subject, message } = req.body;
    if (!message) return res.status(400).json({ error: 'Message is required.' });

    const regs = readRegs();
    const reg  = regs.find(r => r.id === regId);
    if (!reg)  return res.status(404).json({ error: 'Registration not found.' });

    const emailSubject = subject || 'Query regarding your Vendor Registration — Epsilon Enterprise';
    await sendEmail(reg.email, emailSubject, queryEmailHtml(reg.vendorName || reg.companyName || reg.email, message, reg.trackingNo || reg.id));
    res.json({ success: true, message: `Email sent to ${reg.email}` });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ── POST /api/vendor-portal/approve/:id ── */
router.post('/approve/:id', (req, res) => {
  try {
    const regId    = Number(req.params.id);
    const companyId = req.body.companyId;
    if (!companyId) return res.status(400).json({ error: 'companyId is required.' });

    const regs = readRegs();
    const idx  = regs.findIndex(r => r.id === regId);
    if (idx === -1) return res.status(404).json({ error: 'Registration not found.' });

    const reg      = regs[idx];
    const vendorId = jstore.nextId('Vendor', companyId, 200001);
    const now      = new Date().toISOString();

    const vendorData = {
      vendorId, companyId,
      vendorName:    reg.vendorName || reg.companyName || '',
      businessType:  reg.businessType  || '',
      industryType:  reg.industryType  || '',
      pan:           (reg.pan  || '').toUpperCase(),
      gst:           (reg.gst  || '').toUpperCase(),
      gstin:         (reg.gst  || '').toUpperCase(),
      gstType:       reg.gstType       || 'Regular',
      gstRegistered: true,
      contactPerson: reg.contactPerson || '',
      mobile:        reg.mobile        || '',
      email:         reg.email,
      website:       reg.website       || '',
      address:       reg.address       || '',
      billingAddr:   reg.address       || '',
      city:          reg.city          || '',
      state:         reg.state         || '',
      pincode:       reg.pincode       || '',
      country:       reg.country       || 'India',
      bankName:      reg.bankName      || '',
      accountHolder: reg.accountHolder || '',
      accountNo:     reg.accountNo     || '',
      ifsc:          (reg.ifsc || '').toUpperCase(),
      paymentTerms:  '30 Days', paymentModes: [], currency: 'INR',
      category:      'Regular', status: 'approved',
      contactPersons: [{ name: reg.contactPerson, mobileNumber: reg.mobile, email: reg.email }],
      documents: [], importSource: 'self-registration',
      createdAt: now, updatedAt: now,
    };

    saveJson(vendorJsonPath(companyId, vendorId, vendorData.vendorName), vendorData);

    regs[idx] = { ...reg, vendorId, companyId, status: 'approved', approvedAt: now };
    writeRegs(regs);

    res.json({ success: true, vendorId, message: 'Vendor approved and account activated.' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ── POST /api/vendor-portal/reject/:id ── */
router.post('/reject/:id', (req, res) => {
  try {
    const regId = Number(req.params.id);
    const regs  = readRegs();
    const idx   = regs.findIndex(r => r.id === regId);
    if (idx === -1) return res.status(404).json({ error: 'Registration not found.' });
    regs[idx].status          = 'rejected';
    regs[idx].rejectionReason = req.body.reason || '';
    regs[idx].rejectedAt      = new Date().toISOString();
    writeRegs(regs);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

const multer = require('multer');
const billUpload = multer({ storage: multer.memoryStorage() });

const poJsonPath  = (companyId, orderId) =>
  path.join(ROOT, 'Database', 'Companies', companyId, 'PurchaseOrder', String(orderId), `${orderId}.json`);
const docsPath    = (companyId, orderId) =>
  path.join(ROOT, 'Database', 'Companies', companyId, 'PurchaseOrder', String(orderId), 'docs');
const billsPath   = (companyId, orderId) =>
  path.join(ROOT, 'Database', 'Companies', companyId, 'PurchaseOrder', String(orderId), 'vendor-bills');

const authByTokenOrHeader = (req, res, next) => {
  let token = (req.headers.authorization || '').replace(/^Bearer\s+/, '').trim();
  if (!token) token = req.query.token || '';
  const session = VENDOR_SESSIONS.get(token);
  if (!session || Date.now() > session.expiresAt) { VENDOR_SESSIONS.delete(token); return res.status(401).json({ error: 'Session expired.' }); }
  session.expiresAt = Date.now() + 8 * 60 * 60 * 1000;
  req.vendor = session;
  next();
};

const vendorOwnsPO = (po, vendorId) =>
  String(po.vendorId) === String(vendorId) || String(po.vendorCode) === String(vendorId);

/* ── GET /api/vendor-portal/purchase-orders ── */
router.get('/purchase-orders', requireVendorAuth, (req, res) => {
  try {
    const { companyId, vendorId } = req.vendor;
    const allPOs = jstore.readAll('PurchaseOrder', companyId);
    const myPOs  = allPOs.filter(po => vendorOwnsPO(po, vendorId));
    const safePos = myPOs.map(po => ({
      orderId:      po.orderId,
      poNumber:     po.poNumber || po.poNo || po.orderNo || String(po.orderId),
      date:         po.poDate || po.date || po.orderDate || '',
      deliveryDate: po.deliveryDate || '',
      paymentTerms: po.paymentTerms || '',
      totalAmount:  po.grandTotal || po.totalAmount || po.total || 0,
      subTotal:     po.subTotal || 0,
      totalGST:     po.totalGST || 0,
      status:       po.status || '',
      items: (po.items || []).map(it => ({
        itemName:   it.itemName   || '',
        description:it.description|| '',
        hsnCode:    it.hsnCode    || '',
        qty:        parseFloat(it.qty)  || 0,
        unit:       it.unit       || 'NOS',
        rate:       parseFloat(it.rate) || 0,
        gstPercent: parseFloat(it.gstPercent) || 0,
      })),
      attachments: (po.attachments || po.documents || []).map(a => ({
        name:     a.name || a.fileName,
        fileName: a.fileName,
        size:     a.size || 0,
      })),
      vendorBills: (po.vendorBills || []).map(b => ({
        originalName: b.originalName,
        fileName:     b.fileName,
        size:         b.size || 0,
        uploadedAt:   b.uploadedAt,
      })),
    }));
    res.json(safePos);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ── GET /api/vendor-portal/purchase-orders/:orderId/attachment/:fileName ── */
router.get('/purchase-orders/:orderId/attachment/:fileName', authByTokenOrHeader, (req, res) => {
  try {
    const { companyId, vendorId } = req.vendor;
    const { orderId, fileName } = req.params;
    const po = jstore.readOne('PurchaseOrder', companyId, orderId);
    if (!po || !vendorOwnsPO(po, vendorId)) return res.status(403).json({ error: 'Access denied.' });
    const fp = path.join(docsPath(companyId, orderId), fileName);
    if (!fs.existsSync(fp)) return res.status(404).json({ error: 'File not found.' });
    res.download(fp, fileName);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ── POST /api/vendor-portal/purchase-orders/:orderId/upload-bill ── */
router.post('/purchase-orders/:orderId/upload-bill', requireVendorAuth, billUpload.single('bill'), (req, res) => {
  try {
    const { companyId, vendorId } = req.vendor;
    const { orderId } = req.params;
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });

    const po = jstore.readOne('PurchaseOrder', companyId, orderId);
    if (!po || !vendorOwnsPO(po, vendorId)) return res.status(403).json({ error: 'Access denied.' });

    const dir = billsPath(companyId, orderId);
    fs.mkdirSync(dir, { recursive: true });
    const fileName = `${Date.now()}-${req.file.originalname.replace(/[\\/:*?"<>|]/g, '_')}`;
    fs.writeFileSync(path.join(dir, fileName), req.file.buffer);

    const bill = { originalName: req.file.originalname, fileName, size: req.file.size, uploadedAt: new Date().toISOString() };
    po.vendorBills = [...(po.vendorBills || []), bill];
    saveJson(poJsonPath(companyId, orderId), po);

    res.json({ success: true, bill });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ── GET /api/vendor-portal/purchase-orders/:orderId/bills/:fileName ── */
router.get('/purchase-orders/:orderId/bills/:fileName', authByTokenOrHeader, (req, res) => {
  try {
    const { companyId, vendorId } = req.vendor;
    const { orderId, fileName } = req.params;
    const po = jstore.readOne('PurchaseOrder', companyId, orderId);
    if (!po || !vendorOwnsPO(po, vendorId)) return res.status(403).json({ error: 'Access denied.' });
    const fp = path.join(billsPath(companyId, orderId), fileName);
    if (!fs.existsSync(fp)) return res.status(404).json({ error: 'File not found.' });
    res.download(fp, fileName);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ── GET /api/vendor-portal/payments — vendor sees only their payments ── */
router.get('/payments', requireVendorAuth, (req, res) => {
  try {
    const { companyId, vendorId } = req.vendor;
    const allPayments = jstore.readAll('Payment', companyId);
    const myPayments  = allPayments.filter(p =>
      String(p.vendorId) === String(vendorId) || String(p.partyId) === String(vendorId)
    );
    res.json(myPayments);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = { router, requireVendorAuth, VENDOR_SESSIONS };
