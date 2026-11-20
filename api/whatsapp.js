/**
 * whatsapp.js — each user's own WhatsApp inside the ERP (like WhatsApp Web, but the login stays on the server).
 *
 * A user scans the QR once; the login (WhatsApp "linked device") is kept on the server, in that user's own folder:
 *   Database/Companies/{co}/Users/{userId}/whatsapp/auth/   the linked-device keys (Baileys multi-file auth)
 *   Database/Companies/{co}/Users/{userId}/whatsapp/store.json   chats, contact names, the last messages per chat
 *   Database/Companies/{co}/Users/{userId}/whatsapp/media/   pictures / files opened once (cache)
 * Only that user's requests reach that WhatsApp — every address below works on the signed-in user's own session.
 * After a server restart every linked user is connected again by itself (no new QR).
 *
 *   GET  /api/whatsapp/status?ver=          { status: none|connecting|qr|open|loggedout, qr, me, ver }
 *   POST /api/whatsapp/connect              start (shows the QR when not linked yet)
 *   POST /api/whatsapp/logout               unlink this ERP from the phone and forget the login
 *   GET  /api/whatsapp/chats                chats, newest first
 *   GET  /api/whatsapp/messages/:jid        the last messages of a chat (marks them read)
 *   POST /api/whatsapp/send { jid, text }   a text message
 *   POST /api/whatsapp/send-file            multipart: jid, caption, file (picture → picture, else document)
 *   GET  /api/whatsapp/media/:jid/:id       a message's picture / file
 *   POST /api/whatsapp/number { phone }     the chat of a phone number (checks it is on WhatsApp)
 */
const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { ROOT, resolveUser } = require('./helpers');
const T = require('./tenant');

const router = express.Router();
let WA = null; let waErr = '';
try { WA = require('@whiskeysockets/baileys'); } catch (e) { waErr = e.message; }
let logger;
try { logger = require('pino')({ level: 'silent' }); } catch { const s = { level: 'silent', trace() {}, debug() {}, info() {}, warn() {}, error() {}, fatal() {}, child() { return s; } }; logger = s; }

const MAX_PER_CHAT = 150;
const dirOf = (cid, uid) => path.join(T.userDir(cid, uid), 'whatsapp');
const sessions = new Map();   // "cid:uid" → session
const keyOf = (cid, uid) => `${cid}:${uid}`;
const tsOf = t => { if (!t) return Math.floor(Date.now() / 1000); if (typeof t === 'object' && typeof t.toNumber === 'function') return t.toNumber(); const x = Number(t); return Number.isFinite(x) ? x : Math.floor(Date.now() / 1000); };
const SKIP = ['protocolMessage', 'senderKeyDistributionMessage', 'messageContextInfo', 'reactionMessage', 'pollUpdateMessage', 'keepInChatMessage', 'pinInChatMessage'];
const okJid = j => j && !/@broadcast$|@newsletter$|^status@/.test(j);

function readStore(dir) {
  try { const s = JSON.parse(fs.readFileSync(path.join(dir, 'store.json'), 'utf8')); return { chats: s.chats || {}, names: s.names || {}, msgs: s.msgs || {} }; } catch { return { chats: {}, names: {}, msgs: {} }; }
}

/* one WhatsApp message → what the ERP shows (the raw message is kept only for pictures / files, to open them later) */
function norm(m) {
  if (!m || !m.key || !m.message) return null;
  const c = (WA.extractMessageContent && WA.extractMessageContent(m.message)) || m.message;
  const type = (WA.getContentType && WA.getContentType(c)) || Object.keys(c)[0] || '';
  if (!type || SKIP.includes(type)) return null;
  const img = c.imageMessage, vid = c.videoMessage, doc = c.documentMessage || c.documentWithCaptionMessage?.message?.documentMessage, aud = c.audioMessage, stk = c.stickerMessage;
  const text = c.conversation || c.extendedTextMessage?.text || img?.caption || vid?.caption || doc?.caption || c.buttonsResponseMessage?.selectedDisplayText || c.listResponseMessage?.title || '';
  const media = img ? { kind: 'image', mimetype: img.mimetype || 'image/jpeg' } : vid ? { kind: 'video', mimetype: vid.mimetype || 'video/mp4' }
    : doc ? { kind: 'document', mimetype: doc.mimetype || 'application/octet-stream', fileName: doc.fileName || doc.title || 'file' }
      : aud ? { kind: 'audio', mimetype: aud.mimetype || 'audio/ogg' } : stk ? { kind: 'sticker', mimetype: stk.mimetype || 'image/webp' } : null;
  const other = !text && !media ? ({ contactMessage: '👤 Contact', locationMessage: '📍 Location', liveLocationMessage: '📍 Live location', pollCreationMessage: '📊 Poll', pollCreationMessageV3: '📊 Poll' }[type] || `[${type.replace(/Message$/, '')}]`) : '';
  return {
    id: m.key.id, fromMe: !!m.key.fromMe, t: tsOf(m.messageTimestamp), text: text || other, media,
    by: m.key.participant ? (m.pushName || '') : '', participant: m.key.participant || '', push: m.pushName || '',
    raw: media ? JSON.stringify({ key: m.key, message: m.message }, WA.BufferJSON.replacer) : undefined,
  };
}
const preview = x => (x.media ? `${{ image: '📷', video: '🎥', document: '📄', audio: '🎤', sticker: '🏷️' }[x.media.kind] || ''} ${x.text || x.media.fileName || x.media.kind}`.trim() : x.text);

function session(cid, uid) { return sessions.get(keyOf(cid, uid)); }

async function start(cid, uid) {
  if (!WA) throw new Error(`WhatsApp is not installed on the server (${waErr}).`);
  const k = keyOf(cid, uid);
  const old = sessions.get(k);
  if (old && ['connecting', 'qr', 'open'].includes(old.status)) return old;
  const dir = dirOf(cid, uid);
  fs.mkdirSync(path.join(dir, 'auth'), { recursive: true });
  const s = old || { cid, uid, dir, status: 'connecting', qr: '', me: null, ver: 1, store: readStore(dir), saveT: null, retry: 0 };
  s.status = 'connecting'; s.qr = ''; s.ver += 1;
  sessions.set(k, s);
  const bump = () => { s.ver += 1; };
  const save = () => { clearTimeout(s.saveT); s.saveT = setTimeout(() => { try { fs.writeFileSync(path.join(dir, 'store.json'), JSON.stringify(s.store)); } catch { /* next time */ } }, 1500); };
  const chat = (jid, patch) => { if (!okJid(jid)) return; const c = s.store.chats[jid] || (s.store.chats[jid] = { id: jid, name: '', unread: 0, t: 0, last: '' }); Object.assign(c, patch); };
  const add = (jid, raw, live) => {
    if (!okJid(jid)) return;
    const x = norm(raw); if (!x) return;
    const list = s.store.msgs[jid] || (s.store.msgs[jid] = []);
    const at = list.findIndex(y => y.id === x.id);
    if (at >= 0) list[at] = { ...list[at], ...x }; else { list.push(x); list.sort((a, b) => a.t - b.t); if (list.length > MAX_PER_CHAT) list.splice(0, list.length - MAX_PER_CHAT); }
    const c = s.store.chats[jid];
    if (!c || x.t >= (c.t || 0)) chat(jid, { t: x.t, last: preview(x), lastMine: x.fromMe });
    if (live && !x.fromMe && at < 0) chat(jid, { unread: (s.store.chats[jid].unread || 0) + 1 });
    if (!x.fromMe && x.push && !jid.endsWith('@g.us') && !s.store.names[jid]) s.store.names[jid] = x.push;
  };

  const { state, saveCreds } = await WA.useMultiFileAuthState(path.join(dir, 'auth'));
  let version;
  try { ({ version } = await WA.fetchLatestBaileysVersion()); } catch { version = undefined; }
  const sock = WA.default({
    version, auth: state, logger, printQRInTerminal: false, browser: WA.Browsers ? WA.Browsers.windows('Chrome') : ['Super ERP', 'Chrome', '1.0'],
    markOnlineOnConnect: false, syncFullHistory: false, generateHighQualityLinkPreview: false,
    getMessage: async key => { const m = (s.store.msgs[key.remoteJid] || []).find(y => y.id === key.id); return m ? { conversation: m.text || '' } : undefined; },
  });
  s.sock = sock;
  sock.ev.on('creds.update', saveCreds);
  sock.ev.on('connection.update', u => {
    if (u.qr) { s.status = 'qr'; s.qr = u.qr; bump(); }
    if (u.connection === 'open') { s.status = 'open'; s.qr = ''; s.retry = 0; s.me = sock.user ? { id: sock.user.id, name: sock.user.name || sock.user.verifiedName || '' } : null; bump(); }
    if (u.connection === 'close') {
      const code = u.lastDisconnect?.error?.output?.statusCode;
      if (code === WA.DisconnectReason.loggedOut) {
        s.status = 'loggedout'; s.qr = ''; s.me = null; bump();
        try { fs.rmSync(path.join(dir, 'auth'), { recursive: true, force: true }); } catch { /* gone */ }
        return;
      }
      if (s.stopped) return;
      // QR shown but never scanned (expired): stop — the user presses Connect again. After a scan WhatsApp asks for a restart (515): go on.
      if (!state.creds?.registered && code !== WA.DisconnectReason.restartRequired) { s.status = 'none'; s.qr = ''; s.expired = true; bump(); return; }
      // anything else (restart required, network…): connect again by itself, a little later each time
      s.status = 'connecting'; bump();
      s.retry += 1;
      setTimeout(() => { if (!s.stopped) start(cid, uid).catch(() => {}); }, Math.min(60000, 2000 * s.retry));
      s.status = 'reconnect';
    }
  });
  sock.ev.on('messaging-history.set', ({ chats, contacts, messages }) => {
    (contacts || []).forEach(x => { if (x.id && (x.name || x.notify)) s.store.names[x.id] = x.name || x.notify; });
    (chats || []).forEach(x => { if (okJid(x.id)) chat(x.id, { name: x.name || s.store.chats[x.id]?.name || '', unread: x.unreadCount || 0, t: Math.max(tsOf(x.conversationTimestamp), s.store.chats[x.id]?.t || 0) }); });
    (messages || []).forEach(m => add(m.key?.remoteJid, m, false));
    bump(); save();
  });
  sock.ev.on('chats.upsert', list => { list.forEach(x => chat(x.id, { name: x.name || s.store.chats[x.id]?.name || '', ...(x.conversationTimestamp ? { t: tsOf(x.conversationTimestamp) } : {}) })); bump(); save(); });
  sock.ev.on('chats.update', list => { list.forEach(x => { if (!s.store.chats[x.id]) return; if (x.name) chat(x.id, { name: x.name }); if (x.unreadCount != null && x.unreadCount >= 0) chat(x.id, { unread: x.unreadCount }); }); bump(); save(); });
  sock.ev.on('contacts.upsert', list => { list.forEach(x => { if (x.id && (x.name || x.notify)) s.store.names[x.id] = x.name || x.notify; }); save(); });
  sock.ev.on('contacts.update', list => { list.forEach(x => { if (x.id && (x.name || x.notify)) s.store.names[x.id] = x.name || x.notify; }); save(); });
  sock.ev.on('messages.upsert', ({ messages, type }) => { (messages || []).forEach(m => add(m.key?.remoteJid, m, type === 'notify')); bump(); save(); });
  sock.ev.on('messages.update', list => {
    list.forEach(({ key, update }) => { const m = (s.store.msgs[key.remoteJid] || []).find(y => y.id === key.id); if (m && update.status != null) m.status = update.status; });
    bump(); save();
  });
  return s;
}

/* after a server restart: connect every user who had linked WhatsApp (a little apart, not all at once) */
function resumeAll() {
  if (!WA) return;
  let n = 0;
  const base = path.join(ROOT, 'Database', 'Companies');
  let cos = []; try { cos = fs.readdirSync(base); } catch { return; }
  cos.forEach(cid => {
    let users = []; try { users = fs.readdirSync(path.join(base, cid, 'Users')); } catch { return; }
    users.forEach(uid => {
      if (!fs.existsSync(path.join(base, cid, 'Users', uid, 'whatsapp', 'auth', 'creds.json'))) return;
      n += 1; setTimeout(() => start(cid, uid).catch(e => console.warn(`[whatsapp] ${cid}/${uid}: ${e.message}`)), 3000 + n * 2500);
    });
  });
  if (n) console.log(`[whatsapp] reconnecting ${n} linked WhatsApp account(s)`);
}
setTimeout(resumeAll, 4000).unref?.();

const need = (req, res) => { const u = resolveUser(req); if (!u) { res.status(401).json({ error: 'Please sign in again.' }); return null; } return u; };
const live = (req, res) => {
  const u = need(req, res); if (!u) return null;
  const s = session(u.companyId, u.id);
  if (!s || s.status !== 'open' || !s.sock) { res.status(409).json({ error: 'WhatsApp is not connected — scan the QR first.' }); return null; }
  return s;
};
const nameOf = (s, jid) => s.store.chats[jid]?.name || s.store.names[jid] || (jid.endsWith('@g.us') ? 'Group' : `+${jid.split('@')[0].split(':')[0]}`);

router.get('/status', (req, res) => {
  const u = need(req, res); if (!u) return;
  const s = session(u.companyId, u.id);
  const linked = fs.existsSync(path.join(dirOf(u.companyId, u.id), 'auth', 'creds.json'));
  if (!s && linked && WA) start(u.companyId, u.id).catch(() => {});
  res.json({ status: s ? (s.status === 'reconnect' ? 'connecting' : s.status) : (linked ? 'connecting' : 'none'), expired: !!s?.expired, qr: s?.status === 'qr' ? s.qr : '', me: s?.me || null, ver: s?.ver || 0, installed: !!WA, error: WA ? '' : waErr });
});

router.post('/connect', async (req, res) => {
  const u = need(req, res); if (!u) return;
  try { const s = await start(u.companyId, u.id); s.stopped = false; s.expired = false; res.json({ status: s.status, ver: s.ver }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/logout', async (req, res) => {
  const u = need(req, res); if (!u) return;
  const s = session(u.companyId, u.id);
  if (s) { s.stopped = true; try { await s.sock?.logout(); } catch { /* already gone */ } try { s.sock?.end?.(); } catch { /* closed */ } sessions.delete(keyOf(u.companyId, u.id)); }
  try { fs.rmSync(dirOf(u.companyId, u.id), { recursive: true, force: true }); } catch { /* gone */ }
  res.json({ ok: true });
});

router.get('/chats', (req, res) => {
  const s = live(req, res); if (!s) return;
  const list = Object.values(s.store.chats).filter(c => okJid(c.id) && (c.t || (s.store.msgs[c.id] || []).length))
    .sort((a, b) => (b.t || 0) - (a.t || 0)).slice(0, 400)
    .map(c => ({ id: c.id, name: nameOf(s, c.id), group: c.id.endsWith('@g.us'), unread: c.unread || 0, t: c.t || 0, last: c.last || '', lastMine: !!c.lastMine }));
  res.json(list);
});

router.get('/messages/:jid', async (req, res) => {
  const s = live(req, res); if (!s) return;
  const jid = String(req.params.jid);
  const list = (s.store.msgs[jid] || []).slice(-100);
  // read: the unread ones of the other side
  const c = s.store.chats[jid];
  if (c && c.unread) {
    c.unread = 0; s.ver += 1;
    const keys = list.filter(m => !m.fromMe).slice(-20).map(m => ({ remoteJid: jid, id: m.id, participant: m.participant || undefined, fromMe: false }));
    try { if (keys.length) await s.sock.readMessages(keys); } catch { /* read later */ }
  }
  res.json({ name: nameOf(s, jid), group: jid.endsWith('@g.us'), messages: list.map(({ raw, ...m }) => m) });
});

router.post('/send', async (req, res) => {
  const s = live(req, res); if (!s) return;
  const jid = String(req.body?.jid || ''); const text = String(req.body?.text || '').trim();
  if (!jid || !text) return res.status(400).json({ error: 'Write the message.' });
  try { const m = await s.sock.sendMessage(jid, { text: text.slice(0, 6000) }); res.json({ ok: true, id: m?.key?.id }); }
  catch (e) { res.status(500).json({ error: `Could not send: ${e.message}` }); }
});

const up = multer({ storage: multer.memoryStorage(), limits: { fileSize: 60 * 1024 * 1024 } });
router.post('/send-file', up.single('file'), async (req, res) => {
  const s = live(req, res); if (!s) return;
  const jid = String(req.body?.jid || ''); const f = req.file; const caption = String(req.body?.caption || '').slice(0, 1000);
  if (!jid || !f) return res.status(400).json({ error: 'Choose the file.' });
  const mt = f.mimetype || 'application/octet-stream';
  const msg = /^image\/(jpeg|png|webp)$/.test(mt) ? { image: f.buffer, caption, mimetype: mt }
    : /^video\//.test(mt) ? { video: f.buffer, caption, mimetype: mt }
      : { document: f.buffer, mimetype: mt, fileName: f.originalname || 'file', caption };
  try { const m = await s.sock.sendMessage(jid, msg); res.json({ ok: true, id: m?.key?.id }); }
  catch (e) { res.status(500).json({ error: `Could not send the file: ${e.message}` }); }
});

router.get('/media/:jid/:id', async (req, res) => {
  const s = live(req, res); if (!s) return;
  const jid = String(req.params.jid); const id = String(req.params.id).replace(/[^\w-]/g, '');
  const m = (s.store.msgs[jid] || []).find(y => y.id === req.params.id);
  if (!m || !m.media || !m.raw) return res.status(404).json({ error: 'Not found.' });
  const cache = path.join(s.dir, 'media', id);
  res.setHeader('Content-Type', m.media.mimetype || 'application/octet-stream');
  res.setHeader('Cache-Control', 'private, max-age=86400');
  if (m.media.fileName) res.setHeader('Content-Disposition', `inline; filename="${String(m.media.fileName).replace(/[^\w. -]/g, '_')}"`);
  if (fs.existsSync(cache)) return res.send(fs.readFileSync(cache));
  try {
    const raw = JSON.parse(m.raw, WA.BufferJSON.reviver);
    const buf = await WA.downloadMediaMessage(raw, 'buffer', {}, { logger, reuploadRequest: s.sock.updateMediaMessage });
    fs.mkdirSync(path.dirname(cache), { recursive: true }); fs.writeFileSync(cache, buf);
    res.send(buf);
  } catch (e) { res.status(410).json({ error: `The file is no longer on WhatsApp (${e.message}).` }); }
});

router.post('/number', async (req, res) => {
  const s = live(req, res); if (!s) return;
  let d = String(req.body?.phone || '').replace(/\D/g, '');
  if (d.length === 10) d = `91${d}`;
  if (d.length < 11) return res.status(400).json({ error: 'Write the mobile number with the country code (e.g. 91 98765 43210).' });
  try {
    const [hit] = await s.sock.onWhatsApp(`${d}@s.whatsapp.net`);
    if (!hit || !hit.exists) return res.status(404).json({ error: `+${d} is not on WhatsApp.` });
    const jid = WA.jidNormalizedUser(hit.jid);
    if (!s.store.chats[jid]) { s.store.chats[jid] = { id: jid, name: '', unread: 0, t: Math.floor(Date.now() / 1000), last: '' }; s.ver += 1; }
    res.json({ jid, name: nameOf(s, jid) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
