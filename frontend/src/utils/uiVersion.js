/* Which look the app uses after sign-in: 'classic' (default) or 'beta' (new side nav + top bar).
 * Set by the sign-in page the person used; switchable from the user menu. Per browser. */
import { useEffect, useState } from 'react';

const KEY = 'ui-version';
const EVT = 'uiversion:change';

export const getUiVersion = () => { try { return localStorage.getItem(KEY) === 'beta' ? 'beta' : 'classic'; } catch { return 'classic'; } };

export const setUiVersion = v => {
  try { localStorage.setItem(KEY, v === 'beta' ? 'beta' : 'classic'); } catch { /* storage blocked — applies until reload */ }
  window.dispatchEvent(new CustomEvent(EVT));
};

export function useUiVersion() {
  const [v, setV] = useState(getUiVersion);
  useEffect(() => {
    const h = () => setV(getUiVersion());
    window.addEventListener(EVT, h);
    window.addEventListener('storage', h);
    return () => { window.removeEventListener(EVT, h); window.removeEventListener('storage', h); };
  }, []);
  return v;
}
