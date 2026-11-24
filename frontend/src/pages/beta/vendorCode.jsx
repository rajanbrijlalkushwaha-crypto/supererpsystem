/* Vendor code (= Vendor ID, e.g. 200028) for every list, print and report.
 * Where it comes from, in this order:
 *   1. the record's own vendorCode / vendorId (a vendor payment: entityId)
 *   2. the same of the records given with it — e.g. the PO of a GRN, the purchase bill of a debit note
 *   3. the vendor master by name — ONLY when exactly one vendor has that name. Two vendors can share a name
 *      (two GST registrations), and a wrong code on a document is worse than none.
 * BetaShell loads the master for the company (useVendorCodes) and refreshes it now and then. */
import React, { useEffect, useState } from 'react';
import axios from 'axios';

const norm = v => String(v || '').replace(/\s+/g, ' ').trim().toLowerCase();
let S = { cid: '', at: 0, byName: {} };
const subs = new Set();

export async function loadVendorCodes(cid) {
  if (!cid) return;
  if (S.cid !== cid) S = { cid, at: 0, byName: {} };   // never one company's codes on another's papers
  try {
    const r = await axios.get('/api/vendors', { params: { companyId: cid } });
    if (S.cid !== cid) return;   // the company was changed meanwhile
    const byName = {};
    (Array.isArray(r.data) ? r.data : []).filter(v => v && v.vendorId && v.status !== 'deleted').forEach(v => {
      const nm = norm(v.vendorName || v.companyName); if (!nm) return;
      const l = byName[nm] = byName[nm] || []; const c = String(v.vendorId);
      if (!l.includes(c)) l.push(c);
    });
    S = { cid, at: Date.now(), byName };
    subs.forEach(f => f());
  } catch { /* the records' own codes still show */ }
}
/* where: changes as the user moves between pages — the master is read again when it is over a minute old */
export function useVendorCodes(cid, where) {
  const [ver, set] = useState(0);
  useEffect(() => { const f = () => set(x => x + 1); subs.add(f); return () => { subs.delete(f); }; }, []);
  useEffect(() => { if (cid && (S.cid !== cid || Date.now() - S.at > 60000)) loadVendorCodes(cid); }, [cid, where]);
  return ver;   // changes when the master is read — for memos that hold codes
}

/* every code with that name (a ledger is kept by name, so it can hold two vendors) */
export const codesOfName = name => S.byName[norm(name)] || [];

const own = r => {
  if (!r || typeof r === 'string') return '';
  const c = r.vendorCode || r.vendorId
    || (r.entityType === 'vendor' || r.partyKind === 'vendor' || /^V\d+$/.test(String(r.entityId || '')) ? r.entityId : '');
  return String(c || '').replace(/^V(?=\d)/, '').trim();
};
const nameOf = r => (typeof r === 'string' ? r : r ? r.vendorName || r.partyName || r.entityName || r.party || '' : '');
export function vendorCode(...recs) {
  for (const r of recs) { const c = own(r); if (c) return c; }
  for (const r of recs) { const nm = nameOf(r); if (nm) { const l = codesOfName(nm); return l.length === 1 ? l[0] : ''; } }
  return '';
}

/* "Epics Infra (200012)" — for prints and reports that take plain text */
export const withCode = (name, code) => (name && code ? `${name} (${code})` : name || '');
/* under a vendor's name in a list */
export const VCode = ({ c }) => (c ? <small style={{ display: 'block', fontSize: 10.5, fontWeight: 500, color: '#667085' }}>Code {c}</small> : null);
