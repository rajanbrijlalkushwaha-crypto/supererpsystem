import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import axios from 'axios';

const CompanyContext = createContext(null);

export const CompanyProvider = ({ children }) => {
  const [companies, setCompanies] = useState([]);
  const [selectedCompany, setSelectedCompany] = useState(null);

  // Ref so the interceptor always sees the latest company without re-registering
  const selectedCompanyRef = useRef(null);
  useEffect(() => {
    selectedCompanyRef.current = selectedCompany;
  }, [selectedCompany]);

  const fetchCompanies = async () => {
    try {
      const res = await axios.get('/api/companies');
      setCompanies(res.data);
      const savedId = localStorage.getItem('selectedCompanyId');
      if (savedId) {
        const found = res.data.find(c => c.companyId === savedId);
        if (found) { setSelectedCompany(found); return; }
      }
      const def = res.data.find(c => c.isDefault) || res.data[0];
      if (def) { setSelectedCompany(def); localStorage.setItem('selectedCompanyId', def.companyId); }
    } catch {}
  };

  useEffect(() => { fetchCompanies(); }, []);

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

  const selectCompany = (company) => {
    setSelectedCompany(company);
    localStorage.setItem('selectedCompanyId', company.companyId);
  };

  const refreshCompanies = () => fetchCompanies();

  return (
    <CompanyContext.Provider value={{ companies, selectedCompany, selectCompany, refreshCompanies }}>
      {children}
    </CompanyContext.Provider>
  );
};

export const useCompany = () => useContext(CompanyContext);
