import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';

const VendorAuthContext = createContext(null);

export function VendorAuthProvider({ children }) {
  const [vendor, setVendor]   = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('vendorToken');
    if (token) {
      axios.get('/api/vendor-portal/me', { headers: { Authorization: `Bearer ${token}` } })
        .then(r => setVendor({ ...r.data, token }))
        .catch(() => localStorage.removeItem('vendorToken'))
        .finally(() => setLoading(false));
    } else {
      // Check for pending session (stored without token)
      const pendingStr = sessionStorage.getItem('vendorPending');
      if (pendingStr) {
        try { setVendor(JSON.parse(pendingStr)); } catch { sessionStorage.removeItem('vendorPending'); }
      }
      setLoading(false);
    }
  }, []);

  const vendorLogin = async (email, password) => {
    const res = await axios.post('/api/vendor-portal/login', { email, password });
    if (res.data.pending) {
      // Vendor is pending approval — store in sessionStorage (not localStorage)
      const pendingVendor = { pending: true, trackingNo: res.data.trackingNo, name: res.data.name, email: res.data.email };
      sessionStorage.setItem('vendorPending', JSON.stringify(pendingVendor));
      setVendor(pendingVendor);
      return res.data;
    }
    localStorage.setItem('vendorToken', res.data.token);
    setVendor({ ...res.data.vendor, token: res.data.token });
    return res.data;
  };

  const vendorLogout = () => {
    localStorage.removeItem('vendorToken');
    sessionStorage.removeItem('vendorPending');
    setVendor(null);
  };

  return (
    <VendorAuthContext.Provider value={{ vendor, loading, vendorLogin, vendorLogout }}>
      {children}
    </VendorAuthContext.Provider>
  );
}

export const useVendorAuth = () => useContext(VendorAuthContext);
