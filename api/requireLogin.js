/* Every /api address needs a signed-in user, except the few that run before login or have their own login:
 *   /api/auth/*          — login, logout, forgot / reset password, invites (checks its own sessions)
 *   /api/vendor-portal/* — vendors (their own login)
 *   /api/eway-helper/*   — the E-Way Helper program on office PCs (its own paired key)
 * The login is read from the "Authorization: Bearer <token>" header (axios, the Android app) or the erp_s
 * cookie (set at login, so the browser also sends it for logos, files and print pages it loads itself). */
const SESSIONS = require('./sessions');

const OPEN = /^\/api\/(auth|vendor-portal|eway-helper)(\/|$)/;
const COOKIE = 'erp_s';
const LIFE = 8 * 60 * 60 * 1000;   // 8 hours after the last use

function cookieToken(req) {
  const m = (req.headers.cookie || '').match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  return m ? decodeURIComponent(m[1]) : '';
}

/* the login token of this request: header first, then the cookie */
function tokenOf(req) {
  return (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim() || cookieToken(req);
}

/* a valid session for the token (and it stays valid for another 8 hours), or null */
function sessionOf(req) {
  const token = tokenOf(req);
  const s = token && SESSIONS.get(token);
  if (!s) return null;
  if (s.expiresAt < Date.now()) { SESSIONS.delete(token); return null; }
  s.expiresAt = Date.now() + LIFE;
  return s;
}

function requireLogin(req, res, next) {
  if (OPEN.test(req.originalUrl.split('?')[0])) return next();
  const s = sessionOf(req);
  if (!s) return res.status(401).json({ error: 'Please log in again.' });
  req.authUser = s;
  return next();
}

/* the browser keeps the login in a cookie too (HttpOnly: page scripts cannot read it) */
const setLoginCookie = (res, token) => res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'lax', path: '/' });
const clearLoginCookie = res => res.clearCookie(COOKIE, { path: '/' });

module.exports = { requireLogin, tokenOf, sessionOf, setLoginCookie, clearLoginCookie };
