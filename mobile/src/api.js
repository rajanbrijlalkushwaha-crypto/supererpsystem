/* Connection to the ERP server the user entered: address, login token, company, and the saved login (to sign in
 * again by itself when the server's 8-hour session ends). Every request made with axios — also by the ERP's own
 * print code — goes to that server with the token and the company. */
import axios from 'axios';
import { Preferences } from '@capacitor/preferences';

export const S = { server: '', token: '', user: null, companyId: '', company: null, companies: [], remember: null, pin: '' };
const K = k => `erp.${k}`;
const getP = async k => { try { const { value } = await Preferences.get({ key: K(k) }); return value == null ? null : JSON.parse(value); } catch { return null; } };
export const setP = (k, v) => (v == null ? Preferences.remove({ key: K(k) }) : Preferences.set({ key: K(k), value: JSON.stringify(v) }));

export async function loadState() {
  const [server, token, user, companyId, remember, pin] = await Promise.all(['server', 'token', 'user', 'companyId', 'remember', 'pin'].map(getP));
  Object.assign(S, { server: server || '', token: token || '', user, companyId: companyId || '', remember, pin: pin || '' });
  return S;
}

/* "192.168.1.10" → "http://192.168.1.10"; no slash at the end */
export const cleanServer = u => { let s = String(u || '').trim().replace(/\/+$/, ''); if (s && !/^https?:\/\//i.test(s)) s = `http://${s}`; return s; };

/* is it the ERP? /api/auth/me answers with JSON (401 without a login) */
export async function testServer(url) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 9000);
  try {
    const r = await fetch(`${url}/api/auth/me`, { signal: ctl.signal });
    const j = await r.json().catch(() => null);
    if (j && (j.error || j.user || j.id)) return true;
    throw new Error('This address does not look like the ERP server.');
  } catch (e) {
    throw new Error(e.name === 'AbortError' ? 'No answer from this address — check it and the Wi-Fi / internet.' : e.message === 'Failed to fetch' ? 'Could not reach this address — check it and the Wi-Fi / internet.' : e.message);
  } finally { clearTimeout(t); }
}

/* each company has its own users: the login opens one company (companyId). A user name in two companies → the
   server answers 409 with chooseCompany, and the sign-in screen asks which one. */
export async function login(username, password, keep, companyId) {
  const r = await axios.post('/api/auth/login', { username, password, ...(companyId ? { companyId } : {}) }, { _noRetry: true });
  S.token = r.data.token; S.user = r.data.user;
  await setP('token', S.token); await setP('user', S.user);
  if (r.data.companyId) { S.companyId = r.data.companyId; await setP('companyId', S.companyId); }
  S.remember = keep ? { username, password, companyId: r.data.companyId || companyId || '' } : null; await setP('remember', S.remember);
  return r.data;
}
export async function logout() {
  try { await axios.post('/api/auth/logout', {}, { _noRetry: true }); } catch { /* offline */ }
  S.token = ''; S.user = null; S.remember = null; S.companyId = ''; S.company = null;
  await Promise.all(['token', 'user', 'remember', 'companyId'].map(k => setP(k, null)));
}
/* the signed-in company (full details) + the companies this login may switch to (where the same username has an active account) */
export async function loadCompanies() {
  const r = await axios.get('/api/companies', { params: {} });
  const own = Array.isArray(r.data) ? r.data : [];
  S.company = own.find(c => c.companyId === S.companyId) || own[0] || null;
  if (S.company && S.company.companyId !== S.companyId) { S.companyId = S.company.companyId; await setP('companyId', S.companyId); }
  let mine = [];
  try { const m = await axios.get('/api/auth/my-companies'); mine = Array.isArray(m.data) ? m.data : []; } catch { /* older server */ }
  S.companies = mine.length ? mine.map(c => (c.companyId === S.companyId && S.company ? { ...S.company, ...c } : c)) : own;
  return S.companies;
}
export async function pickCompany(c) { S.companyId = c.companyId; S.company = c; await setP('companyId', c.companyId); }
/* switch company: the server checks this user may open it (and asks for that company's password when it differs) */
export async function switchCompany(c, password) {
  const r = await axios.post('/api/auth/switch-company', { to: c.companyId, ...(password ? { password } : {}) }, { _noRetry: true });
  S.token = r.data.token; S.user = r.data.user; S.companyId = r.data.companyId;
  await setP('token', S.token); await setP('user', S.user); await setP('companyId', S.companyId);
  if (S.remember) { S.remember = { ...S.remember, companyId: S.companyId, ...(password ? { password } : {}) }; await setP('remember', S.remember); }
  await loadCompanies();
}

/* every request: the server, the token and the company */
axios.interceptors.request.use(cfg => {
  if (cfg.url && cfg.url.startsWith('/')) cfg.url = S.server + cfg.url;
  // never wait for ever on a server that does not answer (e.g. its Wi-Fi address changed); PDFs get longer
  if (!cfg.timeout) cfg.timeout = /print-merge|\/pdf|download/.test(cfg.url || '') ? 120000 : 20000;
  if (S.token) cfg.headers.Authorization = `Bearer ${S.token}`;
  if (S.companyId && !/\/api\/(auth|companies)\b/.test(cfg.url || '')) cfg.params = { companyId: S.companyId, ...(cfg.params || {}) };
  return cfg;
});
/* session ended on the server: sign in again with the saved login, then repeat the request once */
let relogin = null;
export const onLoggedOut = { fn: () => {} };
axios.interceptors.response.use(r => r, async err => {
  const cfg = err.config || {};
  if (err.response?.status === 401 && !cfg._noRetry && !cfg._retried) {
    if (S.remember) {
      try {
        relogin = relogin || axios.post('/api/auth/login', S.remember, { _noRetry: true }).then(async r => { S.token = r.data.token; S.user = r.data.user; await setP('token', S.token); await setP('user', S.user); }).finally(() => { setTimeout(() => { relogin = null; }, 0); });
        await relogin;
        return axios({ ...cfg, _retried: true, url: cfg.url.replace(S.server, '') });
      } catch { /* the saved login no longer works */ }
    }
    onLoggedOut.fn();
  }
  return Promise.reject(err);
});

export const get = (url, params) => axios.get(url, { params }).then(r => r.data);
export const list = (url, params) => get(url, params).then(d => (Array.isArray(d) ? d : [])).catch(() => []);
export const errText = (e, fb = 'Something went wrong.') => e?.response?.data?.error || (e?.message === 'Network Error' ? 'No connection to the ERP server.' : fb);

/* numbers & dates */
export const num = v => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
export const inr = n => '₹' + Math.round(num(n)).toLocaleString('en-IN');
export const inr2 = n => '₹' + num(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const short = n => { const a = Math.abs(num(n)), s = num(n) < 0 ? '−' : ''; if (a >= 1e7) return `${s}₹${(a / 1e7).toFixed(2)} Cr`; if (a >= 1e5) return `${s}₹${(a / 1e5).toFixed(2)} L`; if (a >= 1e3) return `${s}₹${(a / 1e3).toFixed(1)} K`; return `${s}₹${Math.round(a)}`; };
export const dmy = d => { const t = new Date(d); return isNaN(t) ? '' : t.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }); };
export const today = () => { const t = new Date(); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`; };
export const daysSince = d => { const t = new Date(d); return isNaN(t) ? 0 : Math.max(0, Math.floor((Date.now() - t) / 864e5)); };
export const dead = s => /cancel|reject|draft|void|deleted/i.test(String(s || ''));
export const can = (perm, action = 'view') => { const u = S.user; if (!u) return false; if (u.role === 'admin') return true; if (u.permissions == null) return action !== 'approve'; return !!u.permissions?.[perm]?.[action]; };
