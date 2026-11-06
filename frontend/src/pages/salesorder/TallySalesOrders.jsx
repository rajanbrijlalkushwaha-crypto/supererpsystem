/* TallySalesOrders — Sales Orders from Tally matched to ERP sales orders.
 *
 * Shows the Sales Order vouchers of one FY fetched from Tally (a copy saved in the ERP —
 * opening this page does not contact Tally). Each is matched to an ERP sales order: the
 * client's PO number first, then the same party with the same amount; anything weaker is
 * only a suggestion. Approving a pair records that the Tally order IS that ERP order.
 * Nothing is ever written to Tally.
 */
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import axios from 'axios';
import { useCompany } from '../../context/CompanyContext';
import FyDropdown from '../../components/FyDropdown';

const F  = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const P  = '#3A6186';
const BD = '#EAECF0';
const money = n => (parseFloat(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtD = d => { if (!d) return '—'; const t = new Date(d); return isNaN(t) ? d : `${String(t.getDate()).padStart(2, '0')}-${String(t.getMonth() + 1).padStart(2, '0')}-${t.getFullYear()}`; };
const whenTxt = d => d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
const curFy = (() => { const t = new Date(); const y = t.getMonth() >= 3 ? t.getFullYear() : t.getFullYear() - 1; return `${String(y).slice(2)}-${String(y + 1).slice(2)}`; })();
const FYS = (() => { const out = []; const y0 = 2000 + parseInt(curFy.slice(0, 2), 10); for (let y = y0; y >= 2022; y--) out.push(`${String(y).slice(2)}-${String(y + 1).slice(2)}`); return out; })();

/* GST % from Tally's totals: order amount (incl. GST) vs the item total — snapped to a standard rate */
const gstRateOf = (amount, taxable) => {
  if (!(taxable > 0) || !(amount > taxable)) return 0;
  const pct = (amount - taxable) / taxable * 100;
  return [0, 5, 12, 18, 28].reduce((b, r) => (Math.abs(r - pct) < Math.abs(b - pct) ? r : b), 18);
};
/* next free number in the ERP's current series for this FY, e.g. EESO2627017 → EESO2627018 */
const nextOrderNos = (erpOrders, fy, count) => {
  const fyd = fy.replace('-', '');
  const seen = new Set(erpOrders.map(o => String(o.orderNo || '').trim().toUpperCase()));
  const tally = {};
  erpOrders.forEach(o => { const m = String(o.orderNo || '').trim().match(/^([A-Z]+)(\d{4})(\d{3})$/); if (m && m[2] === fyd) { tally[m[1]] = tally[m[1]] || []; tally[m[1]].push(+m[3]); } });
  const prefix = Object.entries(tally).sort((a, b) => b[1].length - a[1].length)[0]?.[0] || 'EESO';
  let n = Math.max(0, ...(tally[prefix] || [0]));
  const out = [];
  while (out.length < count) { n++; const no = `${prefix}${fyd}${String(n).padStart(3, '0')}`; if (!seen.has(no)) out.push(no); }
  return out;
};

const MATCH = {
  po:      { label: 'Client PO match', bg: '#ECFDF3', fg: '#067647' },
  amount:  { label: 'Party + amount',  bg: '#EFF8FF', fg: '#175CD3' },
  suggest: { label: 'Suggested',       bg: '#FFFAEB', fg: '#B54708' },
  none:    { label: 'Not in ERP',      bg: '#F2F4F7', fg: '#475467' },
};

export default function TallySalesOrders() {
  const { selectedCompany } = useCompany();
  const cid = selectedCompany?.companyId;

  const [fy, setFy]             = useState(curFy);
  const [data, setData]         = useState(null);
  const [loading, setLoading]   = useState(true);
  const [fetching, setFetching] = useState(false);
  const [err, setErr]           = useState(null);
  const [msg, setMsg]           = useState('');
  const [serverOld, setServerOld] = useState(false);
  const [view, setView]         = useState('all');
  const [q, setQ]               = useState('');
  const [pick, setPick]         = useState({});
  const [sel, setSel]           = useState(new Set());
  const [busy, setBusy]         = useState(false);
  const [open, setOpen]         = useState({});          // expanded item lists
  const [clients, setClients]   = useState({});          // ERP clients by id (for the order's customer details)
  const [creating, setCreating] = useState(null);        // [{ row, orderNo }] — the create dialog
  const [checks, setChecks]     = useState({});          // Tally SO → can it be imported? (client in the ERP with the same name + GST)

  const loadSaved = useCallback(async () => {
    if (!cid) return;
    setLoading(true); setErr(null);
    try {
      const r = await axios.get(`/api/tally-reports/sales-orders/saved?companyId=${cid}&fy=${fy}`);
      const old = !r.data || typeof r.data !== 'object';
      setServerOld(old); setData(old ? null : r.data);
      axios.get(`/api/tally-reports/sales-orders/party-check?companyId=${cid}&fy=${fy}`).then(x => setChecks(x.data?.checks || {})).catch(() => setChecks({}));
    } catch (e) { setErr(e.response?.data || { error: e.message }); }
    setLoading(false);
  }, [cid, fy]);
  useEffect(() => { loadSaved(); setSel(new Set()); setPick({}); }, [loadSaved]);
  useEffect(() => {
    if (!cid) return;
    axios.get('/api/clients', { params: { companyId: cid } }).then(r => setClients(Object.fromEntries((Array.isArray(r.data) ? r.data : []).map(c => [String(c.clientId), c])))).catch(() => {});
  }, [cid]);

  /* the ERP client of a Tally order — only when it is in the ERP with the same name + GST */
  const clientOf = r => { const c = checks[r.key]; return c?.ok ? clients[String(c.id)] || null : null; };
  const whyNot = r => checks[r.key]?.reason || 'Client is not in the ERP with the same name + GST — import the client first';

  /* ── create Tally orders that are not in the ERP ── */
  const openCreate = list => {
    const todo = list.filter(r => !r.link && !r.match && clientOf(r));
    if (!todo.length) { setMsg('Tick "Not in ERP" orders whose client is in the ERP with the same name + GST.'); return; }
    const nos = nextOrderNos(data?.erpOrders || [], fy, todo.length);
    setCreating(todo.map((r, i) => ({ row: r, orderNo: nos[i] })));
  };
  /* created as drafts — the user then edits each one (terms, material codes, attachments) and submits it for approval */
  const createOrders = async () => {
    const list = creating; setCreating(null);
    setBusy(true); setErr(null); setMsg('');
    const coState = String(selectedCompany?.state || '').toLowerCase().trim();
    let ok = 0;
    for (const { row: r, orderNo } of list) {
      try {
        const cl = clientOf(r);
        if (!cl) throw new Error(whyNot(r));
        const cp = (cl.contactPersons || [])[0] || {};
        const taxable = r.items.reduce((t, i) => t + (i.amount || (i.qty * i.rate) || 0), 0);
        const gst = gstRateOf(r.amount, taxable);
        const totalGST = Math.max(0, +(r.amount - taxable).toFixed(2));
        const same = coState && coState === String(cl.state || '').toLowerCase().trim();
        const items = r.items.map(i => ({ type: 'Bought Out', itemCode: '', description: i.item, additionalDesc: '', hsnCode: '', qty: i.qty, unit: (i.unit || 'NOS').toUpperCase(), rate: i.rate, gst, bom: [] }));
        const res = await axios.post(`/api/sales-orders?companyId=${cid}`, {
          companyId: cid, status: 'draft',
          orderNo, orderDate: r.date,
          customerName: cl.clientName || cl.companyName || r.party, customerCode: String(cl.clientId),
          customerGstin: cl.gstin || cl.gst || '', address: cl.billingAddr || cl.address || '',
          customerCity: cl.city || '', customerState: cl.state || '', customerPincode: cl.pincode || '',
          contactPerson: cp.name || '', mobile: cp.mobileNumber || '', email: cp.email || '',
          customerPO: r.reference || '', poDate: r.referenceDate || '', paymentTerms: cl.paymentTerms || '',
          enquiryRef: r.number,   // Tally's order number, kept on the ERP order
          internalNotes: `Created from Tally sales order ${r.number} dated ${fmtD(r.date)}${r.narration ? ' — ' + r.narration : ''}`,
          subTotal: +taxable.toFixed(2), totalGST, grandTotal: r.amount,
          cgst: same ? +(totalGST / 2).toFixed(2) : 0, sgst: same ? +(totalGST / 2).toFixed(2) : 0, igst: same ? 0 : totalGST,
          items: JSON.stringify(items),
        });
        if (!res.data?.orderId) throw new Error('the ERP did not return the new order ID');
        await axios.post('/api/tally-reports/sales-orders/link', { companyId: cid, key: r.key, orderId: res.data.orderId });
        ok++;
      } catch (e) { setErr({ error: `Stopped at Tally order ${r.number}: ${e.response?.data?.error || e.message}` }); break; }
    }
    setBusy(false); setSel(new Set());
    if (ok) setMsg(`✓ ${ok} sales order${ok === 1 ? '' : 's'} created in the ERP from Tally as draft and linked — open each in Sales Orders › Pending, edit it (terms, material codes, attachments) and submit it for approval.`);
    loadSaved();
  };

  /* every FY in one click (one Tally report per year, one after another); or just the FY shown */
  const fetchFromTally = async (allYears = true) => {
    setFetching(allYears ? 'all' : 'one'); setErr(null); setMsg('');
    try {
      const r = await axios.get(`/api/tally-reports/sales-orders/${allYears ? 'fetch-all' : 'fetch'}?companyId=${cid}&fy=${fy}`, { timeout: 15 * 60 * 1000 });
      if (!r.data || !Array.isArray(r.data.rows)) throw new Error('Tally sent an unexpected reply — the saved list was kept. Please try again.');
      setMsg(allYears && Array.isArray(r.data.years)
        ? `✓ Sales orders of every FY read from Tally and saved in the ERP — ${r.data.years.map(y => `FY ${y.fy}: ${y.count}`).join(' · ')}.`
        : `✓ ${r.data.rows.length} sales orders of FY ${fy} read from Tally and saved in the ERP.`);
      await loadSaved();
    } catch (e) { setErr(e.response?.data || { error: e.message }); }
    setFetching(false);
  };

  const erpOrders = useMemo(() => (data?.erpOrders || []).slice().sort((a, b) => String(b.orderDate).localeCompare(String(a.orderDate))), [data]);
  const erpById = useMemo(() => Object.fromEntries(erpOrders.map(o => [String(o.orderId), o])), [erpOrders]);
  const chosen = r => pick[r.key] !== undefined ? pick[r.key] : (r.match && r.match.by !== 'suggest' ? String(r.match.order.orderId) : '');
  const all = useMemo(() => data?.rows || [], [data]);
  const counts = {
    all: all.length,
    approved: all.filter(r => r.link).length,
    todo: all.filter(r => !r.link && r.match && r.match.by !== 'suggest').length,
    suggest: all.filter(r => !r.link && r.match?.by === 'suggest').length,
    none: all.filter(r => !r.link && !r.match).length,
  };
  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    return all.filter(r => {
      if (view === 'approved' && !r.link) return false;
      if (view === 'todo' && (r.link || !r.match || r.match.by === 'suggest')) return false;
      if (view === 'suggest' && (r.link || r.match?.by !== 'suggest')) return false;
      if (view === 'none' && (r.link || r.match)) return false;
      if (!t) return true;
      return [r.number, r.party, r.reference, r.items.map(i => i.item).join(' '), r.match?.order?.orderNo, r.link?.order?.orderNo].join(' ').toLowerCase().includes(t);
    });
  }, [all, q, view]);

  const approve = async (list) => {
    const todo = list.filter(r => !r.link && chosen(r));
    if (!todo.length) { setMsg('Pick an ERP sales order for the ticked rows first.'); return; }
    setBusy(true); setMsg(''); let ok = 0;
    for (const r of todo) {
      try { await axios.post('/api/tally-reports/sales-orders/link', { companyId: cid, key: r.key, orderId: chosen(r) }); ok++; }
      catch (e) { setErr(e.response?.data || { error: e.message }); break; }
    }
    setSel(new Set()); setBusy(false);
    setMsg(`✓ ${ok} Tally sales order${ok === 1 ? '' : 's'} approved as the same order in the ERP.`);
    loadSaved();
  };
  const unlink = async r => {
    if (!window.confirm(`Remove the approval for Tally order ${r.number}?`)) return;
    await axios.post('/api/tally-reports/sales-orders/unlink', { companyId: cid, key: r.key }).catch(() => {});
    loadSaved();
  };
  const ready = all.filter(r => !r.link && r.match && r.match.by !== 'suggest');

  /* compare line under the ERP order: amount + client PO side by side with Tally */
  const cmp = (r, id) => {
    const o = erpById[String(id || '')]; if (!o) return null;
    const amtOk = Math.abs(o.grandTotal - r.amount) < 1;
    const pk = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const poOk = pk(o.customerPO) && pk(r.reference) && (pk(r.reference).startsWith(pk(o.customerPO)) || pk(o.customerPO).startsWith(pk(r.reference)));
    return (
      <div style={{ fontSize: 11, marginTop: 4, color: '#475467', lineHeight: 1.5 }}>
        ERP ₹{money(o.grandTotal)} <b style={{ color: amtOk ? '#067647' : '#B42318' }}>{amtOk ? '✓ same amount' : `≠ Tally ₹${money(r.amount)}`}</b>
        {' · '}PO {o.customerPO || '—'} <b style={{ color: poOk ? '#067647' : '#98A2B3' }}>{poOk ? '✓ same PO' : ''}</b>
        <div>{fmtD(o.orderDate)} · {o.customerName}</div>
      </div>
    );
  };

  const chip = (k, label) => (
    <button key={k} onClick={() => setView(k)} style={{ height: 30, padding: '0 12px', borderRadius: 20, cursor: 'pointer', fontFamily: F, fontSize: 12, fontWeight: 700,
      border: `1.5px solid ${view === k ? P : '#D0D5DD'}`, background: view === k ? P : '#fff', color: view === k ? '#fff' : '#344054' }}>{label} <span style={{ opacity: 0.8 }}>{counts[k]}</span></button>
  );
  const th = { position: 'sticky', top: 0, zIndex: 2, background: '#F9FAFB', padding: '8px 10px', fontSize: 10.5, fontWeight: 800, color: '#475467', textTransform: 'uppercase', borderBottom: `1px solid ${BD}`, textAlign: 'left', whiteSpace: 'nowrap' };
  const td = { padding: '8px 10px', borderBottom: '1px solid #F2F4F7', fontSize: 12.5, verticalAlign: 'top' };
  const allTicked = rows.length > 0 && rows.filter(r => !r.link).every(r => sel.has(r.key));

  return (
    <div style={{ fontFamily: F, display: 'flex', flexDirection: 'column', height: '100%', background: '#F2F4F7', padding: '12px 14px', gap: 10, boxSizing: 'border-box' }}>
      <div style={{ background: '#fff', border: `1px solid ${BD}`, borderRadius: 12, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 280 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#101828' }}>📑 Tally Sales Orders ↔ ERP Sales Orders</div>
          <div style={{ fontSize: 11.5, color: '#667085', marginTop: 2 }}>
            Sales Order vouchers from Tally (read-only), saved in the ERP. Approve the pairs that are the same order.
            {data?.saved && <> · <b>{data.saved.company}</b> · GSTIN {data.saved.gstin} <span style={{ color: '#067647', fontWeight: 800 }}>✓ matched</span></>}
          </div>
        </div>
        <FyDropdown value={fy} options={FYS} onChange={setFy} neu current={curFy} />
        <div style={{ padding: '4px 10px', borderRadius: 8, fontSize: 11.5, lineHeight: 1.3, background: data?.saved ? '#F0F9FF' : '#FFFAEB', border: `1px solid ${data?.saved ? '#B9E6FE' : '#FEDF89'}`, color: data?.saved ? '#026AA2' : '#B54708' }}>
          <div style={{ fontWeight: 800 }}>Last updated</div>
          <div>{data?.saved ? <>{whenTxt(data.saved.savedAt || data.saved.fetchedAt)} · up to {fmtD(data.saved.to)}</> : 'never — not fetched yet'}</div>
        </div>
        <button onClick={() => fetchFromTally(false)} disabled={!!fetching} title={`Read only FY ${fy} from Tally`}
          style={{ height: 36, padding: '0 12px', border: '1px solid #D0D5DD', borderRadius: 8, background: '#fff', color: '#344054', cursor: fetching ? 'wait' : 'pointer', fontFamily: F, fontWeight: 700, fontSize: 12, opacity: fetching ? 0.7 : 1 }}>
          {fetching === 'one' ? 'Fetching…' : `FY ${fy} only`}
        </button>
        <button onClick={() => fetchFromTally(true)} disabled={!!fetching} title="Read the sales orders of every FY from Tally in one go and save them in the ERP"
          style={{ height: 36, padding: '0 16px', border: 'none', borderRadius: 8, background: '#104f4f', color: '#fff', cursor: fetching ? 'wait' : 'pointer', fontFamily: F, fontWeight: 800, fontSize: 12.5, opacity: fetching ? 0.7 : 1 }}>
          {fetching === 'all' ? 'Fetching all years from Tally…' : '⟳ Fetch all years from Tally'}
        </button>
      </div>

      {serverOld && <div style={{ background: '#FEF3F2', border: '1px solid #FDA29B', borderRadius: 10, padding: '10px 14px', color: '#B42318', fontSize: 13, fontWeight: 600 }}>⚠ The ERP server needs a restart (node server.js) — it is running an older version without this page's data.</div>}
      {err && <div style={{ background: err.code === 'GSTIN_MISMATCH' ? '#FEF3F2' : '#FFFAEB', border: `1px solid ${err.code === 'GSTIN_MISMATCH' ? '#FDA29B' : '#FEDF89'}`, borderRadius: 10, padding: '10px 14px', fontSize: 13 }}>
        <b style={{ color: err.code === 'GSTIN_MISMATCH' ? '#B42318' : '#B54708' }}>{err.code === 'GSTIN_MISMATCH' ? '⛔ Company not matched' : '⚠ Could not fetch'}</b> — {err.error}</div>}
      {msg && <div style={{ background: '#ECFDF3', border: '1px solid #ABEFC6', borderRadius: 10, padding: '8px 14px', fontSize: 12.5, color: '#067647', fontWeight: 600 }}>{msg}</div>}

      {data?.saved && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {chip('all', 'All')}{chip('approved', '✓ Approved')}{chip('todo', 'Matched — to approve')}{chip('suggest', 'Suggested — check')}{chip('none', 'Not in ERP')}
          <span style={{ fontSize: 11.5, color: '#667085' }}>ERP orders in FY {fy}: <b>{data.erpInFy}</b> · not linked to Tally: <b>{data.erpNotInTally}</b></span>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="🔍 Search order no, party, PO, item…" style={{ height: 32, padding: '0 11px', border: '1px solid #D0D5DD', borderRadius: 8, fontSize: 12.5, fontFamily: F, width: 240, marginLeft: 'auto' }} />
          {ready.length > 0 && <button disabled={busy} onClick={() => approve(ready)} style={{ height: 32, padding: '0 12px', border: '1px solid #ABEFC6', borderRadius: 8, background: '#ECFDF3', color: '#067647', cursor: 'pointer', fontFamily: F, fontWeight: 800, fontSize: 12 }}>✓ Approve all {ready.length} matches</button>}
          {(() => { const n = all.filter(r => sel.has(r.key) && !r.link && !r.match).length; return n > 0 && (
            <button disabled={busy} onClick={() => openCreate(all.filter(r => sel.has(r.key)))} style={{ height: 32, padding: '0 12px', border: '1px solid #B2CCFF', borderRadius: 8, background: '#EFF8FF', color: '#175CD3', cursor: 'pointer', fontFamily: F, fontWeight: 800, fontSize: 12 }}>＋ Create {n} in ERP</button>
          ); })()}
          <button disabled={busy || sel.size === 0} onClick={() => approve(all.filter(r => sel.has(r.key)))} style={{ height: 32, padding: '0 12px', border: 'none', borderRadius: 8, background: sel.size ? '#079455' : '#D0D5DD', color: '#fff', cursor: sel.size ? 'pointer' : 'default', fontFamily: F, fontWeight: 800, fontSize: 12 }}>
            {busy ? 'Approving…' : `✓ Approve selected (${sel.size})`}
          </button>
        </div>
      )}

      {creating && (() => {
        const taken = new Set((data?.erpOrders || []).map(o => String(o.orderNo || '').trim().toUpperCase()));
        const nos = creating.map(c => c.orderNo.trim().toUpperCase());
        const problem = creating.map((c, i) => !c.orderNo.trim() ? 'Enter an order no.' : taken.has(nos[i]) ? 'Already used in the ERP' : nos.indexOf(nos[i]) !== i ? 'Same number twice' : !clientOf(c.row) ? whyNot(c.row) : '');
        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(16,24,40,0.5)', zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
            <div style={{ background: '#fff', borderRadius: 14, width: 'min(980px, 98vw)', maxHeight: '88vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', fontFamily: F }}>
              <div style={{ padding: '14px 18px', borderBottom: `1px solid ${BD}` }}>
                <div style={{ fontSize: 15, fontWeight: 800 }}>Create {creating.length} sales order{creating.length === 1 ? '' : 's'} in the ERP from Tally</div>
                <div style={{ fontSize: 12, color: '#667085', marginTop: 2 }}>Each gets the next ERP number (change it if needed); Tally's number is kept on the order. They are saved as drafts for you to edit and submit for approval. Nothing is changed in Tally.</div>
              </div>
              <div style={{ overflow: 'auto', padding: '8px 18px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                  <thead><tr>{['Tally order', 'ERP order no.', 'ERP client', 'Client PO', 'Items', 'Amount'].map(h => <th key={h} style={{ textAlign: h === 'Amount' ? 'right' : 'left', fontSize: 10.5, color: '#475467', textTransform: 'uppercase', padding: '6px 8px', borderBottom: `1px solid ${BD}` }}>{h}</th>)}</tr></thead>
                  <tbody>{creating.map((c, i) => {
                    const cl = clientOf(c.row);
                    return (
                      <tr key={c.row.key}>
                        <td style={{ padding: '8px', borderBottom: '1px solid #F2F4F7', verticalAlign: 'top' }}><b>{c.row.number}</b><div style={{ fontSize: 11, color: '#667085' }}>{fmtD(c.row.date)}</div></td>
                        <td style={{ padding: '8px', borderBottom: '1px solid #F2F4F7', verticalAlign: 'top', width: 170 }}>
                          <input value={c.orderNo} onChange={e => setCreating(list => list.map((x, j) => j === i ? { ...x, orderNo: e.target.value } : x))}
                            style={{ width: '100%', height: 30, border: `1px solid ${problem[i] && clientOf(c.row) ? '#F04438' : '#D0D5DD'}`, borderRadius: 7, padding: '0 8px', fontFamily: 'monospace', fontSize: 12.5, fontWeight: 700 }} />
                          {problem[i] && <div style={{ fontSize: 11, color: '#B42318', marginTop: 2 }}>{problem[i]}</div>}
                        </td>
                        <td style={{ padding: '8px', borderBottom: '1px solid #F2F4F7', verticalAlign: 'top' }}>{cl ? <><b>{cl.clientName || cl.companyName}</b><div style={{ fontSize: 11, color: '#667085' }}>#{cl.clientId} · {cl.gstin || 'no GSTIN'}</div></> : <span style={{ color: '#B42318' }}>{c.row.party} — not linked</span>}</td>
                        <td style={{ padding: '8px', borderBottom: '1px solid #F2F4F7', verticalAlign: 'top' }}>{c.row.reference || '—'}<div style={{ fontSize: 11, color: '#667085' }}>{fmtD(c.row.referenceDate)}</div></td>
                        <td style={{ padding: '8px', borderBottom: '1px solid #F2F4F7', verticalAlign: 'top', fontSize: 11.5 }}>{c.row.items.map((it, k) => <div key={k}>{it.item} · {it.qty} {it.unit} @ {money(it.rate)}</div>)}</td>
                        <td style={{ padding: '8px', borderBottom: '1px solid #F2F4F7', verticalAlign: 'top', textAlign: 'right', fontWeight: 700 }}>₹{money(c.row.amount)}</td>
                      </tr>
                    );
                  })}</tbody>
                </table>
              </div>
              <div style={{ padding: '12px 18px', borderTop: `1px solid ${BD}`, display: 'flex', justifyContent: 'flex-end', gap: 8, alignItems: 'center' }}>
                {problem.some(Boolean) && <span style={{ fontSize: 12, color: '#B42318', marginRight: 'auto' }}>Fix the rows marked in red first.</span>}
                <button onClick={() => setCreating(null)} style={{ height: 36, padding: '0 16px', border: '1px solid #D0D5DD', borderRadius: 8, background: '#fff', cursor: 'pointer', fontFamily: F, fontWeight: 700 }}>Cancel</button>
                <button disabled={problem.some(Boolean)} onClick={() => createOrders()}
                  style={{ height: 36, padding: '0 18px', border: 'none', borderRadius: 8, background: problem.some(Boolean) ? '#D0D5DD' : '#079455', color: '#fff', cursor: problem.some(Boolean) ? 'default' : 'pointer', fontFamily: F, fontWeight: 800 }}>Create as draft</button>
              </div>
            </div>
          </div>
        );
      })()}

      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', background: '#fff', border: `1px solid ${BD}`, borderRadius: 12 }}>
        {loading ? <div style={{ padding: 40, textAlign: 'center', color: '#98A2B3' }}>Loading…</div>
        : !data?.saved ? <div style={{ padding: 40, textAlign: 'center', color: '#475467' }}>No Tally sales orders saved for FY {fy} yet. Click <b>Fetch all years from Tally</b>.</div>
        : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              <th style={{ ...th, width: 34 }}><input type="checkbox" checked={allTicked} onChange={() => setSel(allTicked ? new Set() : new Set(rows.filter(r => !r.link).map(r => r.key)))} /></th>
              <th style={th}>Tally order</th><th style={th}>Party / client PO</th><th style={{ ...th, textAlign: 'right' }}>Amount</th><th style={th}>Items</th>
              <th style={th}>Match</th><th style={th}>ERP sales order</th><th style={{ ...th, width: 140 }}>Status</th>
            </tr></thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={8} style={{ ...td, textAlign: 'center', color: '#98A2B3', padding: 30 }}>Nothing to show</td></tr>}
              {rows.map(r => {
                const m = MATCH[r.match?.by || 'none'];
                return (
                  <tr key={r.key} style={{ background: r.link ? '#F6FEF9' : sel.has(r.key) ? '#F0F9FF' : '#fff' }}>
                    <td style={td}>{!r.link && <input type="checkbox" checked={sel.has(r.key)} onChange={() => setSel(s => { const n = new Set(s); n.has(r.key) ? n.delete(r.key) : n.add(r.key); return n; })} />}</td>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}><div style={{ fontWeight: 800, color: P }}>{r.number}</div><div style={{ fontSize: 11, color: '#667085' }}>{fmtD(r.date)}</div></td>
                    <td style={td}><div style={{ fontWeight: 700 }}>{r.party}</div><div style={{ fontSize: 11, color: '#667085' }}>PO {r.reference || '—'}{r.referenceDate ? ` · ${fmtD(r.referenceDate)}` : ''}</div>
                      {!r.link && !r.match && (clientOf(r)
                        ? <div style={{ fontSize: 10.5, color: '#067647' }}>✓ ERP client {checks[r.key].name} · same GST</div>
                        : <div style={{ fontSize: 10.5, color: '#B42318' }}>✗ {whyNot(r)}</div>)}</td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: 700, whiteSpace: 'nowrap' }}>₹{money(r.amount)}</td>
                    <td style={{ ...td, maxWidth: 240 }}>
                      {r.items.slice(0, open[r.key] ? 99 : 1).map((it, i) => <div key={i} style={{ fontSize: 11.5 }}>{it.item} <span style={{ color: '#667085' }}>· {it.qty} {it.unit} @ {money(it.rate)}</span></div>)}
                      {r.items.length > 1 && <button onClick={() => setOpen(o => ({ ...o, [r.key]: !o[r.key] }))} style={{ border: 'none', background: 'none', color: P, cursor: 'pointer', fontSize: 11, padding: 0, fontFamily: F, fontWeight: 700 }}>{open[r.key] ? 'less' : `+${r.items.length - 1} more`}</button>}
                    </td>
                    <td style={td}>{r.link ? <span style={{ fontSize: 10.5, fontWeight: 800, padding: '2px 8px', borderRadius: 20, background: '#ECFDF3', color: '#067647' }}>Approved</span>
                      : <span style={{ fontSize: 10.5, fontWeight: 800, padding: '2px 8px', borderRadius: 20, background: m.bg, color: m.fg, whiteSpace: 'nowrap' }}>{m.label}</span>}</td>
                    <td style={{ ...td, minWidth: 250 }}>
                      {r.link ? <div><b>{r.link.order?.orderNo}</b> <span style={{ color: '#98A2B3', fontSize: 11 }}>#{r.link.orderId}</span>{cmp(r, r.link.orderId)}</div> : (<>
                        <select value={chosen(r)} onChange={e => setPick(p => ({ ...p, [r.key]: e.target.value }))}
                          style={{ width: '100%', height: 32, border: '1px solid #D0D5DD', borderRadius: 8, fontSize: 12, fontFamily: F, padding: '0 8px', background: chosen(r) ? '#fff' : '#F9FAFB', color: chosen(r) ? '#101828' : '#98A2B3' }}>
                          <option value="">— not in ERP / choose order —</option>
                          {erpOrders.map(o => <option key={o.orderId} value={String(o.orderId)}>{o.orderNo} · {o.customerName} · ₹{money(o.grandTotal)}</option>)}
                        </select>
                        {cmp(r, chosen(r))}
                        {r.match?.by === 'suggest' && !pick[r.key] && <div style={{ fontSize: 11, marginTop: 4, color: '#B54708' }}>Suggestion: <b>{r.match.order.orderNo}</b> (same party, same date)
                          <button onClick={() => setPick(p => ({ ...p, [r.key]: String(r.match.order.orderId) }))} style={{ marginLeft: 6, border: '1px solid #FEC84B', background: '#FFFAEB', color: '#B54708', borderRadius: 6, cursor: 'pointer', fontSize: 10.5, fontWeight: 800, padding: '1px 7px', fontFamily: F }}>Use</button></div>}
                      </>)}
                    </td>
                    <td style={td}>{r.link ? (
                      <div style={{ fontSize: 11.5, color: '#067647' }}>✓ Same order in ERP<div style={{ color: '#98A2B3', fontSize: 10.5 }}>{whenTxt(r.link.approvedAt)}</div>
                        <button onClick={() => unlink(r)} style={{ marginTop: 3, border: 'none', background: 'none', color: '#B42318', cursor: 'pointer', fontSize: 11, padding: 0, fontFamily: F }}>Undo</button></div>
                    ) : !r.match && !chosen(r) ? (
                      <button disabled={busy || !clientOf(r)} onClick={() => openCreate([r])} title={clientOf(r) ? 'Import this order into the ERP as a Draft' : whyNot(r)}
                        style={{ height: 30, padding: '0 10px', border: '1px solid #B2CCFF', borderRadius: 8, fontFamily: F, fontWeight: 800, fontSize: 12, background: clientOf(r) ? '#EFF8FF' : '#F2F4F7', color: clientOf(r) ? '#175CD3' : '#98A2B3', cursor: clientOf(r) ? 'pointer' : 'not-allowed', whiteSpace: 'nowrap' }}>＋ Import as Draft</button>
                    ) : (
                      <button disabled={busy || !chosen(r)} onClick={() => approve([r])} style={{ height: 30, padding: '0 12px', border: 'none', borderRadius: 8, fontFamily: F, fontWeight: 800, fontSize: 12,
                        background: chosen(r) ? '#079455' : '#EAECF0', color: chosen(r) ? '#fff' : '#98A2B3', cursor: chosen(r) ? 'pointer' : 'default' }}>✓ Approve</button>
                    )}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      {data?.saved && <div style={{ fontSize: 11, color: '#667085' }}>{counts.all} Tally sales orders in FY {fy} · "Not in ERP" orders can be created with ＋ Create in ERP (as drafts to edit and submit).</div>}
    </div>
  );
}
