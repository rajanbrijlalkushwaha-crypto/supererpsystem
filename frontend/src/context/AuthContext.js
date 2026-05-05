import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import axios from 'axios';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user,    setUser]    = useState(null);   // { id, username, name, role, email }
  const [loading, setLoading] = useState(true);   // true while verifying token on mount

  /* ── axios interceptor: attach Bearer token to every request ── */
  useEffect(() => {
    const id = axios.interceptors.request.use(cfg => {
      const token = localStorage.getItem('erp_token');
      if (token) cfg.headers.Authorization = `Bearer ${token}`;
      return cfg;
    });
    return () => axios.interceptors.request.eject(id);
  }, []);

  /* ── Verify stored token on app load ── */
  useEffect(() => {
    const token = localStorage.getItem('erp_token');
    if (!token) { setLoading(false); return; }
    axios.get('/api/auth/me')
      .then(r => setUser(r.data))
      .catch(() => { localStorage.removeItem('erp_token'); })
      .finally(() => setLoading(false));
  }, []);

  /* ── Login ── */
  const login = useCallback(async (username, password) => {
    const res = await axios.post('/api/auth/login', { username, password });
    localStorage.setItem('erp_token', res.data.token);
    setUser(res.data.user);
    return res.data.user;
  }, []);

  /* ── Logout ── */
  const logout = useCallback(async () => {
    try { await axios.post('/api/auth/logout'); } catch {}
    localStorage.removeItem('erp_token');
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, isAdmin: user?.role === 'admin' }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
