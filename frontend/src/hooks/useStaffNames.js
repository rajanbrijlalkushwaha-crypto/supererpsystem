import { useState, useEffect } from 'react';
import axios from 'axios';

/* Real user/employee names for "Assign to" dropdowns (Sales Person, Purchase
 * Person, etc.) — replaces what used to be a hardcoded fake list duplicated
 * across 8 files. Backed by the same GET /api/auth/users endpoint the app's
 * own Chat, AuthContext and Admin → Users screens already use.
 *
 * Returns a plain array of display names (sorted, deduplicated), so every
 * existing `options={SALES_PERSONS}` call site keeps working unchanged. */
export function useStaffNames() {
  const [names, setNames] = useState([]);

  useEffect(() => {
    let cancelled = false;
    axios.get('/api/auth/users')
      .then(r => {
        if (cancelled) return;
        const list = Array.isArray(r.data) ? r.data : [];
        const displayNames = list
          .filter(u => u.active !== false)
          .map(u => u.name || u.username)
          .filter(Boolean);
        setNames([...new Set(displayNames)].sort((a, b) => a.localeCompare(b)));
      })
      .catch(() => { if (!cancelled) setNames([]); });
    return () => { cancelled = true; };
  }, []);

  return names;
}
