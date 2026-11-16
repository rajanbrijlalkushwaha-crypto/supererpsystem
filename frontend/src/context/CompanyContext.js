import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { useAuth } from './AuthContext';

const CompanyContext = createContext(null);

export const CompanyProvider = ({ children }) => {
  const [companies, setCompanies] = useState([]);          // the companies this login may switch to (its own accounts)
  const [selectedCompany, setSelectedCompany] = useState(null);
  const [ask, setAsk] = useState(null);                   // { company, error } — the other company's password is needed
  const [pwd, setPwd] = useState('');
  const [busy, setBusy] = useState(false);

  // Ref so the interceptor always sees the latest company without re-registering
  const selectedCompanyRef = useRef(null);
  useEffect(() => {
    selectedCompanyRef.current = selectedCompany;
  }, [selectedCompany]);

  const fetchCompanies = async () => {
    try {
      const res = await axios.get('/api/companies');   // the signed-in company (a login belongs to one company)
      axios.get('/api/auth/my-companies').then(r => setCompanies(Array.isArray(r.data) && r.data.length ? r.data : res.data)).catch(() => setCompanies(res.data));
      const savedId = localStorage.getItem('selectedCompanyId');
      if (savedId) {
        const found = res.data.find(c => c.companyId === savedId);
        if (found) { setSelectedCompany(found); return; }
      }
      const def = res.data.find(c => c.isDefault) || res.data[0];
      if (def) { setSelectedCompany(def); localStorage.setItem('selectedCompanyId', def.companyId); }
    } catch {}
  };

  // the company list needs a signed-in user: load it when someone signs in (and again for a different user)
  const { user } = useAuth() || {};
  const uid = user ? (user.userId || user.id || user.username) : null;
  useEffect(() => { if (uid) fetchCompanies(); else { setCompanies([]); } }, [uid]);   // eslint-disable-line react-hooks/exhaustive-deps

  // Axios interceptor: registered once on mount, reads companyId from ref (always current)
  useEffect(() => {
    const interceptorId = axios.interceptors.request.use(config => {
      const companyId = selectedCompanyRef.current?.companyId;
      if (!companyId) return config;

      // Skip company routes themselves to avoid loops
      if (config.url && config.url.includes('/api/companies')) return config;

      // Add companyId only if not already present (avoids duplicate from SAPContext)
      const alreadyInParams = config.params?.companyId;
      const alreadyInUrl    = config.url && config.url.includes('companyId=');
      if (!alreadyInParams && !alreadyInUrl) {
        config.params = { ...config.params, companyId };
      }

      // Also add to body for non-GET/DELETE requests
      if (config.method !== 'get' && config.method !== 'delete') {
        if (config.data instanceof FormData) {
          if (!config.data.has('companyId')) {
            config.data.append('companyId', companyId);
          }
        } else if (config.data && typeof config.data === 'object') {
          config.data = { ...config.data, companyId };
        }
      }
      return config;
    });

    return () => axios.interceptors.request.eject(interceptorId);
  }, []); // Register once — ref keeps it current

  /* switch to another company: the server checks this user has an active login there (and its password if different),
     then gives a new login for that company — the page opens that company's dashboard */
  const switchTo = async (company, password) => {
    setBusy(true);
    try {
      const r = await axios.post('/api/auth/switch-company', { to: company.companyId, ...(password ? { password } : {}) });
      sessionStorage.setItem('erp_token', r.data.token);
      localStorage.setItem('selectedCompanyId', r.data.companyId);
      window.location.assign('/dashboard');
    } catch (e) {
      const d = e.response?.data || {};
      if (d.needPassword) { setAsk({ company, error: password ? d.error : '' }); setPwd(''); }
      else { setAsk(null); window.alert(d.error || 'Could not switch the company.'); }
    } finally { setBusy(false); }
  };
  const selectCompany = (company) => {
    if (!company || company.companyId === selectedCompanyRef.current?.companyId) return;
    switchTo(company);
  };

  const refreshCompanies = () => fetchCompanies();

  return (
    <CompanyContext.Provider value={{ companies, selectedCompany, selectCompany, refreshCompanies }}>
      {children}
      {ask && (
        <div role="dialog" aria-modal="true" aria-label="Company password" onMouseDown={e => { if (e.target === e.currentTarget) setAsk(null); }}
          style={{ position: 'fixed', inset: 0, zIndex: 3000, background: 'rgba(2,24,28,.5)', display: 'grid', placeItems: 'center', padding: 16, fontFamily: 'inherit' }}>
          <form onSubmit={e => { e.preventDefault(); if (pwd) switchTo(ask.company, pwd); }}
            style={{ width: '100%', maxWidth: 380, background: '#fff', borderRadius: 8, overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,.3)' }}>
            <div style={{ background: '#03444f', color: '#fff', padding: '12px 16px', fontWeight: 700 }}>Switch to {ask.company.companyName}</div>
            <div style={{ padding: 16 }}>
              <div style={{ fontSize: 13, color: '#475467', marginBottom: 10 }}>Your password in this company is different. Enter your password for <b>{ask.company.companyName}</b>.</div>
              <input type="password" autoFocus value={pwd} onChange={e => setPwd(e.target.value)} placeholder="Password" aria-label="Password"
                style={{ width: '100%', height: 38, padding: '0 10px', border: '1px solid #C9D7DA', borderRadius: 4, fontSize: 14, boxSizing: 'border-box' }} />
              {ask.error && <div style={{ marginTop: 8, fontSize: 12.5, color: '#B42318' }}>{ask.error}</div>}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
                <button type="button" onClick={() => setAsk(null)} disabled={busy} style={{ height: 34, padding: '0 14px', border: '1px solid #C9D7DA', background: '#fff', borderRadius: 4, cursor: 'pointer' }}>Cancel</button>
                <button type="submit" disabled={busy || !pwd} style={{ height: 34, padding: '0 16px', border: 0, background: '#03444f', color: '#fff', borderRadius: 4, cursor: 'pointer', fontWeight: 600 }}>{busy ? 'Switching…' : 'Switch'}</button>
              </div>
            </div>
          </form>
        </div>
      )}
    </CompanyContext.Provider>
  );
};

export const useCompany = () => useContext(CompanyContext);
