/* The companies on this server (names only), for the sign-in and password-reset pages — each company has its own
 * users, so the company is chosen first. Starts on the company remembered at the last sign-in. */
import { useEffect, useState } from 'react';
import axios from 'axios';

export default function useCompanies() {
  const [companies, setCompanies] = useState([]);
  const [cid, setCid] = useState(() => { try { return (JSON.parse(localStorage.getItem('login-remember')) || {}).cid || ''; } catch { return ''; } });
  useEffect(() => {
    axios.get('/api/auth/companies').then(r => {
      const l = Array.isArray(r.data) ? r.data : [];
      setCompanies(l);
      setCid(c => (l.some(x => x.companyId === c) ? c : l.length === 1 ? l[0].companyId : ''));
    }).catch(() => setCompanies([]));
  }, []);
  return { companies, cid, setCid };
}
