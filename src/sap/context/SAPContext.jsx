/**
 * SAP Mode — Global Context
 * Provides: companyId, mode toggle, notifications, document search
 * Completely isolated from OLD mode context.
 */
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import axios from 'axios';

const SAPContext = createContext(null);

export const useSAP = () => {
  const ctx = useContext(SAPContext);
  if (!ctx) throw new Error('useSAP must be used inside SAPProvider');
  return ctx;
};

export const SAPProvider = ({ children, companyId, companyName }) => {
  const [projects,     setProjects]     = useState([]);
  const [loadingProj,  setLoadingProj]  = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [searchQuery,  setSearchQuery]  = useState('');
  const [searchResults,setSearchResults] = useState([]);

  const api = useCallback((url, opts = {}) => {
    const sep = url.includes('?') ? '&' : '?';
    return axios({ url: `${url}${sep}companyId=${companyId}`, ...opts });
  }, [companyId]);

  /* Load projects summary on mount */
  const refreshProjects = useCallback(async () => {
    if (!companyId) return;
    setLoadingProj(true);
    try {
      const res = await api('/api/sap/projects');
      setProjects(res.data || []);
    } catch {}
    setLoadingProj(false);
  }, [api, companyId]);

  useEffect(() => { refreshProjects(); }, [refreshProjects]);

  /* Global search across SAP documents */
  const globalSearch = useCallback(async (q) => {
    if (!q || q.length < 2) { setSearchResults([]); return; }
    setSearchQuery(q);
    try {
      const [projRes, soRes, poRes] = await Promise.all([
        api('/api/sap/projects'),
        api('/api/sap/sales-orders'),
        api('/api/sap/purchase-orders'),
      ]);
      const ql = q.toLowerCase();
      const results = [
        ...(projRes.data || []).filter(p =>
          p.projectName?.toLowerCase().includes(ql) ||
          p.clientName?.toLowerCase().includes(ql) ||
          p.projectId?.toLowerCase().includes(ql)
        ).map(p => ({ type: 'Project', id: p.projectId, label: `${p.projectId} — ${p.projectName}`, sub: p.clientName, path: `/sap/projects/${p.projectId}` })),
        ...(soRes.data || []).filter(s =>
          s.soNumber?.toLowerCase().includes(ql) ||
          s.clientName?.toLowerCase().includes(ql)
        ).map(s => ({ type: 'Sales Order', id: s.soId, label: `${s.soNumber} — ${s.clientName}`, sub: `₹${s.grandTotal?.toLocaleString()}`, path: `/sap/projects/${s.projectId}` })),
        ...(poRes.data || []).filter(p =>
          p.poNumber?.toLowerCase().includes(ql) ||
          p.vendorName?.toLowerCase().includes(ql)
        ).map(p => ({ type: 'Purchase Order', id: p.poId, label: `${p.poNumber} — ${p.vendorName}`, sub: `₹${p.grandTotal?.toLocaleString()}`, path: `/sap/projects/${p.projectId}` })),
      ];
      setSearchResults(results.slice(0, 10));
    } catch {}
  }, [api]);

  const addNotification = useCallback((msg, type = 'info') => {
    const n = { id: Date.now(), msg, type, time: new Date().toLocaleTimeString() };
    setNotifications(prev => [n, ...prev].slice(0, 20));
  }, []);

  return (
    <SAPContext.Provider value={{
      companyId,
      companyName,
      api,
      projects,
      loadingProj,
      refreshProjects,
      notifications,
      addNotification,
      searchQuery,
      searchResults,
      globalSearch,
      clearSearch: () => { setSearchQuery(''); setSearchResults([]); },
    }}>
      {children}
    </SAPContext.Provider>
  );
};
