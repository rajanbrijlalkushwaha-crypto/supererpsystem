import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { isAppMode } from '../appBridge';

const AuthContext = createContext(null);

/* Auto-logout after this long with no mouse/keyboard/touch activity. */
const IDLE_LIMIT_MS = 30 * 60 * 1000;

export const AuthProvider = ({ children }) => {
  const [user,    setUser]    = useState(null);   // { id, username, name, role, email }
  const [loading, setLoading] = useState(true);   // true while verifying token on mount
  const idleTimerRef = useRef(null);

  /* ── axios interceptor: attach Bearer token to every request ──
     sessionStorage (not localStorage) is deliberate: it's cleared the
     moment this browser tab/window closes, so closing the app's window
     ends the session — the next launch requires logging in again. */
  useEffect(() => {
    const id = axios.interceptors.request.use(cfg => {
      const token = sessionStorage.getItem('erp_token');
      if (token) cfg.headers.Authorization = `Bearer ${token}`;
      return cfg;
    });
    return () => axios.interceptors.request.eject(id);
  }, []);

  /* ── Verify stored token on app load ── */
  useEffect(() => {
    const token = sessionStorage.getItem('erp_token');
    if (!token) { setLoading(false); return; }
    axios.get('/api/auth/me')
      .then(r => setUser(r.data))
      .catch(() => { sessionStorage.removeItem('erp_token'); })
      .finally(() => setLoading(false));
  }, []);

  /* ── Login ── */
  const login = useCallback(async (username, password) => {
    const res = await axios.post('/api/auth/login', { username, password });
    sessionStorage.setItem('erp_token', res.data.token);
    setUser(res.data.user);
    return res.data.user;
  }, []);

  /* ── Logout ── */
  const logout = useCallback(async () => {
    try { await axios.post('/api/auth/logout'); } catch {}
    sessionStorage.removeItem('erp_token');
    setUser(null);
  }, []);

  /* ── Refresh current user (call after profile update) ── */
  const refreshUser = useCallback(async () => {
    try {
      const r = await axios.get('/api/auth/me');
      // Fetch full user to get dashboardPrefs etc.
      const all = await axios.get('/api/auth/users').catch(() => ({ data: [] }));
      const full = all.data.find(u => u.id === r.data.userId || u.username === r.data.username);
      setUser({ ...r.data, ...(full || {}), id: r.data.userId });
      return r.data;
    } catch {}
  }, []);

  /* ── 30-minute inactivity auto-logout ──
     Resets a single timer on real user activity. Listens at the window
     level with { passive: true } so this never blocks scrolling/typing,
     and deliberately avoids touching React state on every event (only the
     ref's timer is reset) so this can't trigger a re-render storm on
     something as frequent as mousemove. */
  useEffect(() => {
    if (!user || isAppMode()) return;   // the Android app has its own PIN lock

    const resetTimer = () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      idleTimerRef.current = setTimeout(() => { logout(); }, IDLE_LIMIT_MS);
    };

    const activityEvents = ['mousedown', 'mousemove', 'keydown', 'wheel', 'touchstart', 'scroll'];
    activityEvents.forEach(evt => window.addEventListener(evt, resetTimer, { passive: true }));
    resetTimer();

    return () => {
      activityEvents.forEach(evt => window.removeEventListener(evt, resetTimer));
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, [user, logout]);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refreshUser, isAdmin: user?.role === 'admin', permissions: user?.permissions ?? null }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
