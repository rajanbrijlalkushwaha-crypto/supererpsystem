/* Tally Reconciliation › PO — Tally purchase orders against the ERP's POs.
 * Same number, or same vendor + amount → approve as the same PO. A PO not in the ERP can be imported
 * as a Draft only when its vendor is in the ERP with the same name + GST. Nothing is written to Tally.
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import { useCompany } from '../../context/CompanyContext';
import FyDropdown from '../../components/FyDropdown';
import { F, money, fmtD, whenTxt, curFy, FYS } from './reconUi';

const STATUS = {
  number: ['Same PO no.', '#EFF8FF', '#175CD3'], amount: ['Same vendor + amount', '#EFF8FF', '#175CD3'],
  suggest: ['Suggested', '#FFFAEB', '#B54708'], none: ['Not in ERP', '#F2F4F7', '#475467'], linked: ['✓ Approved', '#ECFDF3', '#067647'],
};
/* GST % from the order total vs the item total, snapped to a standard rate */
const gstRateOf = (amount, taxable) => { if (!(taxable > 0) || !(amount > taxable)) return 0; const p = (amount - taxable) / taxable * 100; return [0, 5, 12, 18, 28].reduce((b, r) => (Math.abs(r - p) < Math.abs(b - p) ? r : b), 18); };

export default function TallyPurchaseOrders() {
  const { selectedCompany } = useCompany();
  const cid = selectedCompany?.companyId;
  const [fy, setFy] = useState(curFy);
  const [data, setData] = useState(null);
  const [vendors, setVendors] = useState({});
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [view, setView] = useState('all');
  const [q, setQ] = useState('');
  const [pick, setPick] = useState({});

  const load = useCallback(async () => {
    if (!cid) return;
    setLoading(true); setErr('');
    try {
      const r = await axios.get('/api/tally-reports/purchase-orders/saved', { params: { companyId: cid, fy } });
      if (!r.data || !Array.isArray(r.data.rows)) throw new Error('The ERP server needs a restart (node server.js) — it is running an older version without this page.');
      setData(r.data);
    } catch (e) { setErr(e.response?.data?.error || e.message); }
    setLoading(false);
  }, [cid, fy]);
  useEffect(() => { load(); setPick({}); }, [load]);
  useEffect(() => { if (cid) axios.get('/api/vendors', { params: { companyId: cid } }).then(r => setVendors(Object.fromEntries((Array.isArray(r.data) ? r.data : []).map(v => [String(v.vendorId), v])))).catch(() => {}); }, [cid]);

  const fetchAll = async () => {
    setFetching(true); setErr(''); setMsg('');
    try {
      const r = await axios.get('/api/tally-reports/purchase-orders/fetch-all', { params: { companyId: cid, fy }, timeout: 10 * 60 * 1000 });
      setMsg(`Purchase orders read from Tally — ${(r.data.years || []).map(y => `FY ${y.fy}: ${y.count}`).join(' · ')}.`); load();
    } catch (e) { setErr(e.response?.data?.error || e.message); }
    setFetching(false);
  };

  const all = useMemo(() => data?.rows || [], [data]);
  const erp = useMemo(() => (data?.erpOrders || []).slice().sort((a, b) => String(b.poDate).localeCompare(String(a.poDate))), [data]);
  const statusOf = r => r.link ? 'linked' : r.match?.by || 'none';
  const chosen = r => pick[r.key] !== undefined ? pick[r.key] : (r.match && r.match.by !== 'suggest' ? String(r.match.order.orderId) : '');
  const counts = { all: all.length, todo: all.filter(r => !r.link && r.match && r.match.by !== 'suggest').length, none: all.filter(r => !r.link && !r.match).length, linked: all.filter(r => r.link).length };
  const rows = all.filter(r => {
    if (view === 'todo' && !(!r.link && r.match && r.match.by !== 'suggest')) return false;
    if (view === 'none' && (r.link || r.match)) return false;
    if (view === 'linked' && !r.link) return false;
    const t = q.trim().toLowerCase();
    return !t || [r.number, r.party, r.reference, r.amount].join(' ').toLowerCase().includes(t);
  });

  const approve = async list => {
    setBusy(true); setErr(''); setMsg(''); let ok = 0;
    for (const r of list) {
      if (!chosen(r)) continue;
      try { await axios.post('/api/tally-reports/purchase-orders/link', { companyId: cid, key: r.key, orderId: chosen(r) }); ok++; }
      catch (e) { setErr(`Stopped at ${r.number}: ${e.response?.data?.error || e.message}`); break; }
    }
    setBusy(false); if (ok) setMsg(`${ok} PO${ok === 1 ? '' : 's'} approved as the same in Tally and the ERP.`); load();
  };
  const unlink = async r => { if (!window.confirm(`Remove the approval for ${r.number}?`)) return; await axios.post('/api/tally-reports/purchase-orders/unlink', { companyId: cid, key: r.key }).catch(() => {}); load(); };

  /* a Tally PO not in the ERP → a Draft PO for its vendor (same name + GST in the ERP) */
  const importDraft = async r => {
    const v = vendors[String(r.partyCheck?.id || '')];
    if (!r.partyCheck?.ok || !v) { setErr(r.partyCheck?.reason || 'The vendor is not in the ERP with the same name + GST.'); return; }
    if (!window.confirm(`Import ${r.number} (${r.party}, ₹${money(r.amount)}) into the ERP as a Draft PO?\n\nYou can then edit it and send it for approval. Nothing is changed in Tally.`)) return;
    setBusy(true); setErr(''); setMsg('');
    try {
      const taxable = r.items.reduce((t, i) => t + (i.amount || i.qty * i.rate || 0), 0);
      const gst = gstRateOf(r.amount, taxable), totalGST = Math.max(0, +(r.amount - taxable).toFixed(2));
      const same = String(selectedCompany?.state || '').toLowerCase().trim() === String(v.state || '').toLowerCase().trim();
      const res = await axios.post(`/api/purchase-orders?companyId=${cid}`, {
        companyId: cid, status: 'draft', vendorId: String(v.vendorId), vendorName: v.vendorName, vendorGstin: v.gstin || '', vendorCode: v.vendorCode || String(v.vendorId),
        vendorState: v.state || '', vendorAddress: v.address || '', vendorCity: v.city || '', vendorPincode: v.pincode || '',
        poNo: r.number, poDate: r.date, vendorRef: r.reference || '',
        items: JSON.stringify(r.items.map(i => ({ itemCode: '', itemName: i.item, description: '', hsnCode: '', qty: i.qty, unit: (i.unit || 'NOS').toUpperCase(), rate: i.rate, discount: 0, discountType: '%', gstPercent: gst }))),
        subTotal: +taxable.toFixed(2), totalGST, grandTotal: r.amount,
        cgst: same ? +(totalGST / 2).toFixed(2) : 0, sgst: same ? +(totalGST / 2).toFixed(2) : 0, igst: same ? 0 : totalGST,
        internalNotes: `Imported from Tally purchase order ${r.number} dated ${fmtD(r.date)}${r.narration ? ' — ' + r.narration : ''}`,
      });
      if (!res.data?.orderId) throw new Error('the ERP did not return the new PO ID');
      await axios.post('/api/tally-reports/purchase-orders/link', { companyId: cid, key: r.key, orderId: res.data.orderId });
      setMsg(`${r.number} imported as a Draft PO — open it in Purchase Orders, edit and send for approval.`);
    } catch (e) { setErr(`${r.number}: ${e.response?.data?.error || e.message}`); }
    setBusy(false); load();
  };

  const ready = all.filter(r => !r.link && r.match && r.match.by !== 'suggest');
  return (
    <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10, height: '100%', boxSizing: 'border-box', fontFamily: F }}>
      <div className="rc-card" style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>Purchase Orders</div>
        <span style={{ fontSize: 11, color: '#667085' }}>Tally ↔ ERP{data?.saved ? ` · read ${whenTxt(data.saved.fetchedAt)}` : ''}</span>
        <FyDropdown value={fy} options={FYS} onChange={setFy} neu current={curFy} />
        <div style={{ flex: 1 }} />
        <button className="rc-btn" onClick={fetchAll} disabled={fetching}>{fetching ? 'Fetching…' : 'Fetch from Tally'}</button>
      </div>
      {err && <div style={{ background: '#FFFAEB', border: '1px solid #FEDF89', borderRadius: 10, padding: '8px 14px', fontSize: 13, color: '#B54708', fontWeight: 600 }}>{err}</div>}
      {msg && <div style={{ background: '#ECFDF3', border: '1px solid #ABEFC6', borderRadius: 10, padding: '7px 14px', fontSize: 12.5, color: '#067647', fontWeight: 600 }}>{msg}</div>}
      <div className="rc-card" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', padding: '10px 12px', borderBottom: '1px solid #EAECF0' }}>
          <div className="rc-seg">
            {[['all', `All (${counts.all})`], ['todo', `Match — approve (${counts.todo})`], ['none', `Not in ERP (${counts.none})`], ['linked', `Approved (${counts.linked})`]].map(([k, l]) => <button key={k} className={view === k ? 'on' : ''} onClick={() => setView(k)}>{l}</button>)}
          </div>
          <input className="rc-ctl" value={q} onChange={e => setQ(e.target.value)} placeholder="Search PO no., vendor, amount" style={{ width: 260 }} />
          <div style={{ flex: 1 }} />
          {ready.length > 0 && <button className="rc-btn green" disabled={busy} onClick={() => approve(ready)}>Approve all {ready.length} matches</button>}
        </div>
        <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
          {loading ? <div style={{ padding: 40, textAlign: 'center', color: '#98A2B3' }}>Loading…</div>
          : !data?.saved ? <div style={{ padding: 40, textAlign: 'center', color: '#475467' }}>No Tally purchase orders saved for FY {fy} yet. Click <b>Fetch from Tally</b>.</div>
          : (
            <table className="rc-tbl" style={{ minWidth: 1150 }}>
              <colgroup><col style={{ width: 160 }} /><col style={{ width: 96 }} /><col /><col style={{ width: 120 }} /><col style={{ width: 170 }} /><col style={{ width: 280 }} /><col style={{ width: 150 }} /></colgroup>
              <thead><tr><th>Tally PO No</th><th>Date</th><th>Vendor</th><th className="n">Amount</th><th>Status</th><th>ERP PO</th><th>Action</th></tr></thead>
              <tbody>
                {rows.map(r => {
                  const [label, bg, fg] = STATUS[statusOf(r)], ch = chosen(r);
                  return (
                    <tr key={r.key} className="row">
                      <td style={{ fontWeight: 600 }} title={r.number}>{r.number}</td>
                      <td>{fmtD(r.date)}</td>
                      <td title={`${r.party}${r.items.length ? ' · ' + r.items.map(i => `${i.item} ${i.qty} ${i.unit}`).join(', ') : ''}`}>
                        <span style={{ fontWeight: 600 }}>{r.party}</span>
                        {!r.link && !r.match && r.partyCheck && !r.partyCheck.ok && <span style={{ color: '#B42318', fontSize: 11, marginLeft: 8 }}>✗ {r.partyCheck.reason}</span>}
                      </td>
                      <td className="n" style={{ fontWeight: 600 }}>{money(r.amount)}</td>
                      <td><span className="rc-tag" style={{ background: bg, color: fg }}>{label}</span></td>
                      <td>
                        {r.link ? <b>{r.link.order?.poNumber || r.link.poNumber}</b> : (
                          <select className="rc-ctl" value={ch} onChange={e => setPick(p => ({ ...p, [r.key]: e.target.value }))} style={{ width: '100%', height: 28 }}>
                            <option value="">— not in ERP —</option>
                            {erp.map(o => <option key={o.orderId} value={String(o.orderId)}>{o.poNumber} · {o.vendorName} · ₹{money(o.grandTotal)}</option>)}
                          </select>
                        )}
                      </td>
                      <td>
                        {r.link ? <button className="rc-btn sm" onClick={() => unlink(r)} style={{ color: '#B42318' }}>Undo</button>
                          : ch ? <button className="rc-btn sm green" disabled={busy} onClick={() => approve([r])}>Approve</button>
                          : <button className="rc-btn sm" disabled={busy || !r.partyCheck?.ok} title={r.partyCheck?.ok ? 'Import into the ERP as a Draft PO' : r.partyCheck?.reason || ''} onClick={() => importDraft(r)} style={{ color: '#175CD3' }}>Import as Draft</button>}
                      </td>
                    </tr>
                  );
                })}
                {rows.length === 0 && <tr><td colSpan={7} style={{ textAlign: 'center', color: '#98A2B3', padding: 30 }}>Nothing here.</td></tr>}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
