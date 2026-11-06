/* TallyDebtors — Client list › "Tally" tab.
 *
 * Shows the Sundry Debtors list fetched from Tally (a copy saved in the ERP — opening
 * this tab does not contact Tally). Each Tally ledger is matched to an ERP client
 * (GSTIN first, then name; weaker "suggested" matches need a look). Approving a pair
 * records that the ledger already exists in the ERP as that client — it is not to be
 * imported again, and its balance comes from Tally. Nothing is ever written to Tally.
 */
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import axios from 'axios';
import { useNavigate, useLocation } from 'react-router-dom';
import { useCompany } from '../../context/CompanyContext';

const F   = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const P   = '#3A6186';
const BD  = '#EAECF0';
const money = n => Math.abs(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const whenTxt = d => d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';

const MATCH = {
  gstin:   { label: 'GSTIN match',  bg: '#ECFDF3', fg: '#067647' },
  name:    { label: 'Name match',   bg: '#EFF8FF', fg: '#175CD3' },
  suggest: { label: 'Suggested',    bg: '#FFFAEB', fg: '#B54708' },
  none:    { label: 'Not in ERP',   bg: '#F2F4F7', fg: '#475467' },
};

/* embedded: shown inside Tally Reconciliation, which has its own top bar */
export default function TallyDebtors({ embedded = false } = {}) {
  const { selectedCompany } = useCompany();
  const cid = selectedCompany?.companyId;
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const [data, setData]         = useState(null);   // { saved, rows, clientCount }
  const [clients, setClients]   = useState([]);
  const [rawById, setRawById]   = useState({});     // full ERP client records, to fill only empty fields
  const [loading, setLoading]   = useState(true);
  const [fetching, setFetching] = useState(false);
  const [err, setErr]           = useState(null);
  const [msg, setMsg]           = useState('');
  const [serverOld, setServerOld] = useState(false);

  const [q, setQ]               = useState('');
  const [view, setView]         = useState('balance');   // balance | all | approved | todo | none
  const [pick, setPick]         = useState({});          // tallyName → clientId chosen in the dropdown
  const [sel, setSel]           = useState(new Set());   // ticked rows
  const [busy, setBusy]         = useState(false);
  const [pairOpen, setPairOpen] = useState(false);
  const [pairT, setPairT]       = useState(null);   // Tally ledger name
  const [pairC, setPairC]       = useState(null);   // ERP client id
  const [pqT, setPqT]           = useState('');
  const [pqC, setPqC]           = useState('');

  const loadSaved = useCallback(async () => {
    if (!cid) return;
    setLoading(true); setErr(null);
    try {
      const [s, c] = await Promise.all([
        axios.get(`/api/tally-reports/debtors/saved?companyId=${cid}`),
        axios.get('/api/clients', { params: { companyId: cid } }),
      ]);
      const old = !s.data || typeof s.data !== 'object';
      setServerOld(old);
      setData(old ? null : s.data);
      const raw = Array.isArray(c.data) ? c.data : [];
      setRawById(Object.fromEntries(raw.map(x => [String(x.clientId), x])));
      setClients(raw.map(x => ({ id: x.clientId, name: x.clientName || x.companyName || '',
        gstin: String(x.gstin || x.gst || '').toUpperCase().trim(), state: x.state || '' })).filter(x => x.name)
        .sort((a, b) => a.name.localeCompare(b.name)));
    } catch (e) { setErr(e.response?.data || { error: e.message }); }
    setLoading(false);
  }, [cid]);
  useEffect(() => { loadSaved(); }, [loadSaved]);

  const fetchFromTally = async () => {
    if (!cid) return;
    setFetching(true); setErr(null); setMsg('');
    try {
      const r = await axios.get(`/api/tally-reports/debtors/fetch?companyId=${cid}`);
      if (!r.data || !Array.isArray(r.data.rows)) throw new Error('Tally sent an unexpected reply — the saved list was kept. Please try again.');
      setData(r.data); setMsg(`✓ ${r.data.rows.length} debtors read from Tally and saved in the ERP.`);
    } catch (e) { setErr(e.response?.data || { error: e.message }); }
    setFetching(false);
  };

  /* the ERP client a row would be approved as: the dropdown choice, else the auto match */
  const chosen = r => pick[r.name] !== undefined ? pick[r.name] : (r.match && r.match.by !== 'suggest' ? r.match.client.clientId : '');
  const statusOf = r => r.link ? 'approved' : (r.match?.by || 'none');

  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (data?.rows || []).filter(r => {
      if (view === 'balance' && !(Math.abs(r.closing) > 0.005)) return false;
      if (view === 'approved' && !r.link) return false;
      if (view === 'todo' && (r.link || !r.match || r.match.by === 'suggest')) return false;
      if (view === 'suggest' && (r.link || r.match?.by !== 'suggest')) return false;
      if (view === 'none' && (r.link || r.match)) return false;
      if (!t) return true;
      return [r.name, r.gstins?.join(' '), r.state, r.address, r.match?.client?.name, r.match?.client?.gstin, r.link?.client?.name, r.link?.client?.gstin].join(' ').toLowerCase().includes(t);
    }).sort((a, b) => Math.abs(b.closing) - Math.abs(a.closing) || a.name.localeCompare(b.name));
  }, [data, q, view]);

  const all = data?.rows || [];
  /* ERP clients already approved for a Tally ledger — not offered again in the dropdowns */
  const takenIds = new Set(all.filter(r => r.link).map(r => String(r.link.clientId)));
  const counts = {
    all: all.length,
    balance: all.filter(r => Math.abs(r.closing) > 0.005).length,
    approved: all.filter(r => r.link).length,
    todo: all.filter(r => !r.link && r.match && r.match.by !== 'suggest').length,
    suggest: all.filter(r => !r.link && r.match?.by === 'suggest').length,
    none: all.filter(r => !r.link && !r.match).length,
  };

  const approve = async (list) => {
    const todo = list.filter(r => !r.link && chosen(r));
    if (!todo.length) { setMsg('Pick an ERP client for the ticked rows first.'); return; }
    setBusy(true); setMsg('');
    let ok = 0;
    for (const r of todo) {
      try { await axios.post('/api/tally-reports/debtors/link', { companyId: cid, tallyName: r.name, clientId: chosen(r) }); ok++; }
      catch (e) { setErr(e.response?.data || { error: e.message }); break; }
    }
    setSel(new Set()); setBusy(false);
    setMsg(`✓ ${ok} ledger${ok === 1 ? '' : 's'} approved as already in the ERP.`);
    loadSaved();
  };
  /* the client details Tally holds for a ledger */
  const tallyFields = r => {
    const gst = (r.gstins || [])[0] || '';
    return {
      gst, pan: r.pan || (gst ? gst.slice(2, 12) : ''),
      address: r.address || '', state: r.state || '', country: r.country || 'India',
      pincode: r.pincode || ((r.address || '').match(/\b\d{6}\b/) || [])[0] || '',
      contact: { name: r.contact || '', mobileNumber: r.mobile || '', altMobile: '', email: r.email || '', website: '', landline: '' },
    };
  };

  /* fill only the EMPTY fields of linked ERP clients from Tally — never overwrite what is there */
  const fillFromTally = async (list) => {
    const todo = list.filter(r => r.link);
    if (!todo.length) return;
    setBusy(true); setMsg(''); setErr(null);
    let updated = 0, nothing = 0;
    for (const r of todo) {
      const ex = rawById[String(r.link.clientId)];
      if (!ex) continue;
      const t = tallyFields(r), body = {};
      const empty = v => !String(v || '').trim();
      if (empty(ex.billingAddr || ex.address) && t.address) body.billingAddr = t.address;
      if (empty(ex.state) && t.state) body.state = t.state;
      if (empty(ex.pincode) && t.pincode) body.pincode = t.pincode;
      if (empty(ex.country) && t.country) body.country = t.country;
      if (empty(ex.gstin || ex.gst) && t.gst) { body.gst = t.gst; body.gstRegistered = 'true'; }
      if (empty(ex.pan) && t.pan) body.pan = t.pan;
      const cps = Array.isArray(ex.contactPersons) ? ex.contactPersons : [];
      const noContact = !cps.some(p => p && (String(p.name || '').trim() || String(p.mobileNumber || '').trim() || String(p.email || '').trim()));
      if (noContact && (t.contact.name || t.contact.mobileNumber || t.contact.email)) body.contactPersons = JSON.stringify([t.contact]);
      if (!['approved', 'pending', 'rejected', 'draft'].includes(ex.status)) body.status = 'pending';   // e.g. old "active" imports → approval
      if (!Object.keys(body).length) { nothing++; continue; }
      // the client update resets GST type to "Regular" when it is not sent — always send the current one
      const gstType = body.gst ? (ex.gstType && ex.gstType !== 'Unregistered' ? ex.gstType : 'Regular') : (ex.gstType || 'Regular');
      try { await axios.put(`/api/clients/${ex.clientId}`, { companyId: cid, gstType, ...body }); updated++; }
      catch (e) { setErr({ error: `Stopped at "${r.name}": ${e.response?.data?.error || e.message}` }); break; }
    }
    setBusy(false);
    setMsg(`✓ ${updated} client${updated === 1 ? '' : 's'} updated with missing details from Tally${nothing ? ` · ${nothing} already complete` : ''}.`);
    loadSaved();
  };

  /* a new ERP client from a Tally ledger: name, GSTIN, PAN, address, state, pincode, country, contact */
  /* saved as a Draft — the user edits it in the client list and sends it for approval */
  const askCreate = (list) => {
    const todo = list.filter(r => !r.link && !r.match);
    if (!todo.length) { setMsg('Tick "Not in ERP" ledgers to create.'); return; }
    createInErp(todo);
  };
  const createInErp = async (list) => {
    const todo = list.filter(r => !r.link && !r.match);
    if (!todo.length) { setMsg('Tick "Not in ERP" ledgers to create.'); return; }
    if (!window.confirm(`Create ${todo.length} new client${todo.length === 1 ? '' : 's'} in the ERP from the Tally details (name, GSTIN, address, state, contact)?\n\nThey are saved as Draft — open each in Clients, check / edit it and send it for approval. Nothing is changed in Tally.`)) return;
    setBusy(true); setMsg(''); setErr(null);
    let ok = 0;
    for (const r of todo) {
      const t = tallyFields(r);
      try {
        const res = await axios.post('/api/clients', {
          companyId: cid, clientName: r.name, billingAddr: t.address, state: t.state, pincode: t.pincode, country: t.country,
          gst: t.gst, gstType: t.gst ? 'Regular' : 'Unregistered', gstRegistered: t.gst ? 'true' : 'false', pan: t.pan,
          contactPersons: JSON.stringify([t.contact]),
          status: 'draft',   // a Draft: edited in the ERP, then sent for approval by the user
          remarks: `Created from Tally ledger "${r.name}" on ${new Date().toLocaleDateString('en-IN')}`,
        });
        const newId = res.data?.clientId || res.data?.client?.clientId || res.data?.id;
        if (!newId) throw new Error('The ERP did not return the new client ID');
        await axios.post('/api/tally-reports/debtors/link', { companyId: cid, tallyName: r.name, clientId: newId });
        ok++;
      } catch (e) { setErr({ error: `Stopped at "${r.name}": ${e.response?.data?.error || e.message}` }); break; }
    }
    setSel(new Set()); setBusy(false);
    if (ok) setMsg(`✓ ${ok} new client${ok === 1 ? '' : 's'} created from Tally as Draft and linked — open them in Clients (status Draft), edit and send for approval.`);
    loadSaved();
  };

  const unlink = async r => {
    if (!window.confirm(`Remove the approval for "${r.name}"?`)) return;
    await axios.post('/api/tally-reports/debtors/unlink', { companyId: cid, tallyName: r.name }).catch(() => {});
    loadSaved();
  };

  const gstReady = all.filter(r => !r.link && r.match?.by === 'gstin');
  const clientById = useMemo(() => { const m = {}; clients.forEach(c => { m[String(c.id)] = c; }); return m; }, [clients]);
  const erpGstLine = (r, clientId) => {
    const c = clientById[String(clientId || '')];
    if (!c) return null;
    const tally = r.gstins || [];
    const same = c.gstin && tally.includes(c.gstin);
    const tag = !c.gstin ? ['No GSTIN in ERP', '#98A2B3']
      : same ? ['✓ same as Tally', '#067647']
      : tally.length ? ['≠ differs from Tally', '#B42318'] : ['Tally has no GSTIN', '#B54708'];
    return (
      <div style={{ fontSize: 11, marginTop: 4, color: '#475467' }}>
        ERP GSTIN <b style={{ fontFamily: 'monospace', color: c.gstin ? '#101828' : '#98A2B3' }}>{c.gstin || '—'}</b>
        {c.state && <> · {c.state}</>} <span style={{ color: tag[1], fontWeight: 800, marginLeft: 4 }}>{tag[0]}</span>
      </div>
    );
  };
  const allTicked = rows.length > 0 && rows.every(r => sel.has(r.name));

  /* ── ui ── */
  const tabBtn = (label, path) => {
    const on = pathname === path;
    return (
      <button key={path} onClick={() => navigate(path)} style={{ display: 'flex', alignItems: 'center', padding: '0 12px', height: 26, alignSelf: 'center', fontSize: 11.5,
        fontWeight: on ? 700 : 600, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: F, color: on ? '#fff' : 'rgba(255,255,255,0.85)',
        background: on ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.07)', border: `1px solid ${on ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.22)'}`, borderRadius: 6, margin: '0 4px' }}>{label}</button>
    );
  };
  const chip = (k, label) => (
    <button key={k} onClick={() => setView(k)} style={{ height: 30, padding: '0 12px', borderRadius: 20, cursor: 'pointer', fontFamily: F, fontSize: 12, fontWeight: 700,
      border: `1.5px solid ${view === k ? P : '#D0D5DD'}`, background: view === k ? P : '#fff', color: view === k ? '#fff' : '#344054' }}>
      {label} <span style={{ opacity: 0.8 }}>{counts[k]}</span>
    </button>
  );
  const th = { position: 'sticky', top: 0, zIndex: 2, background: '#F9FAFB', padding: '8px 10px', fontSize: 10.5, fontWeight: 800, color: '#475467', textTransform: 'uppercase',
    borderBottom: `1px solid ${BD}`, textAlign: 'left', whiteSpace: 'nowrap' };
  const td = { padding: '8px 10px', borderBottom: '1px solid #F2F4F7', fontSize: 12.5, verticalAlign: 'top' };

  return (
    <div style={{ fontFamily: F, display: 'flex', flexDirection: 'column', height: '100%', background: '#F2F4F7' }}>
      {/* bar — same tabs as the client list */}
      {!embedded && <div style={{ display: 'flex', alignItems: 'stretch', background: P, borderBottom: '2px solid #2A4D6E', height: 40, flexShrink: 0, padding: '0 6px' }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: '#fff', textTransform: 'uppercase', letterSpacing: '0.8px', display: 'flex', alignItems: 'center', padding: '0 12px 0 6px',
          borderRight: '2px solid rgba(255,255,255,0.18)', marginRight: 6 }}>Clients</div>
        {tabBtn('👥 View Clients', '/client/view')}
        {tabBtn('⏳ Pending', '/client/pending')}
        {tabBtn('🧾 Tally', '/client/tally')}
      </div>}

      <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10, flex: 1, minHeight: 0 }}>
        {/* header */}
        <div style={{ background: '#fff', border: `1px solid ${BD}`, borderRadius: 12, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 260 }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#101828' }}>🧾 Tally Debtors ↔ ERP Clients</div>
            <div style={{ fontSize: 11.5, color: '#667085', marginTop: 2 }}>
              Sundry Debtors from Tally (read-only), saved in the ERP. Approve the matches that are the same party — those are already in the ERP and won't be imported again.
              {data?.saved && <> · <b>{data.saved.company}</b> · GSTIN {data.saved.gstin} <span style={{ color: '#067647', fontWeight: 800 }}>✓ matched</span></>}
            </div>
          </div>
          <div style={{ padding: '4px 10px', borderRadius: 8, fontSize: 11.5, lineHeight: 1.3, background: data?.saved ? '#F0F9FF' : '#FFFAEB',
            border: `1px solid ${data?.saved ? '#B9E6FE' : '#FEDF89'}`, color: data?.saved ? '#026AA2' : '#B54708' }}>
            <div style={{ fontWeight: 800 }}>Last updated</div>
            <div>{data?.saved ? <>{whenTxt(data.saved.savedAt || data.saved.fetchedAt)} · balances as at {data.saved.asAt}</> : 'never — not fetched yet'}</div>
          </div>
          <button onClick={fetchFromTally} disabled={fetching}
            style={{ height: 36, padding: '0 16px', border: 'none', borderRadius: 8, background: '#104f4f', color: '#fff', cursor: fetching ? 'wait' : 'pointer', fontFamily: F, fontWeight: 800, fontSize: 12.5, opacity: fetching ? 0.7 : 1 }}>
            {fetching ? 'Fetching from Tally…' : '⟳ Fetch debtors from Tally'}
          </button>
        </div>

        {serverOld && <div style={{ background: '#FEF3F2', border: '1px solid #FDA29B', borderRadius: 10, padding: '10px 14px', color: '#B42318', fontSize: 13, fontWeight: 600 }}>
          ⚠ The ERP server needs a restart (node server.js) — it is running an older version without this feature.</div>}
        {err && <div style={{ background: err.code === 'GSTIN_MISMATCH' ? '#FEF3F2' : '#FFFAEB', border: `1px solid ${err.code === 'GSTIN_MISMATCH' ? '#FDA29B' : '#FEDF89'}`, borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#344054' }}>
          <b style={{ color: err.code === 'GSTIN_MISMATCH' ? '#B42318' : '#B54708' }}>{err.code === 'GSTIN_MISMATCH' ? '⛔ Company not matched' : '⚠ Could not fetch'}</b> — {err.error}</div>}
        {msg && <div style={{ background: '#ECFDF3', border: '1px solid #ABEFC6', borderRadius: 10, padding: '8px 14px', fontSize: 12.5, color: '#067647', fontWeight: 600 }}>{msg}</div>}

        {/* filters */}
        {data?.saved && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {chip('balance', 'With balance')}{chip('all', 'All')}{chip('approved', '✓ Approved')}{chip('todo', 'Matched — to approve')}{chip('suggest', 'Suggested — check')}{chip('none', 'Not in ERP')}
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="🔍 Search ledger, GSTIN, state, client…"
              style={{ height: 32, padding: '0 11px', border: '1px solid #D0D5DD', borderRadius: 8, fontSize: 12.5, fontFamily: F, width: 260, marginLeft: 'auto' }} />
            {gstReady.length > 0 && (
              <button disabled={busy} onClick={() => approve(gstReady)}
                style={{ height: 32, padding: '0 12px', border: '1px solid #ABEFC6', borderRadius: 8, background: '#ECFDF3', color: '#067647', cursor: 'pointer', fontFamily: F, fontWeight: 800, fontSize: 12 }}>
                ✓ Approve all {gstReady.length} GSTIN matches
              </button>
            )}
            {(() => { const n = all.filter(r => sel.has(r.name) && !r.link && !r.match).length; return n > 0 && (
              <button disabled={busy} onClick={() => askCreate(all.filter(r => sel.has(r.name)))}
                style={{ height: 32, padding: '0 12px', border: '1px solid #B2CCFF', borderRadius: 8, background: '#EFF8FF', color: '#175CD3', cursor: 'pointer', fontFamily: F, fontWeight: 800, fontSize: 12 }}>
                ＋ Create {n} in ERP
              </button>
            ); })()}
            {counts.approved > 0 && (
              <button disabled={busy} onClick={() => { if (window.confirm(`Fill the empty fields of all ${counts.approved} linked ERP clients from Tally (pincode, country, PAN, address, contact)?

Fields that already have a value are not changed. Nothing is changed in Tally.`)) fillFromTally(all.filter(r => r.link)); }}
                style={{ height: 32, padding: '0 12px', border: '1px solid #B2CCFF', borderRadius: 8, background: '#fff', color: '#175CD3', cursor: 'pointer', fontFamily: F, fontWeight: 800, fontSize: 12 }}>
                ⟳ Fill missing from Tally ({counts.approved})
              </button>
            )}
            <button onClick={() => setPairOpen(o => !o)}
              style={{ height: 32, padding: '0 12px', border: '1px solid #D0D5DD', borderRadius: 8, background: pairOpen ? P : '#fff', color: pairOpen ? '#fff' : '#344054', cursor: 'pointer', fontFamily: F, fontWeight: 800, fontSize: 12 }}>
              ⇄ Pair manually
            </button>
            <button disabled={busy || sel.size === 0} onClick={() => approve(all.filter(r => sel.has(r.name)))}
              style={{ height: 32, padding: '0 12px', border: 'none', borderRadius: 8, background: sel.size ? '#079455' : '#D0D5DD', color: '#fff', cursor: sel.size ? 'pointer' : 'default', fontFamily: F, fontWeight: 800, fontSize: 12 }}>
              {busy ? 'Approving…' : `✓ Approve selected (${sel.size})`}
            </button>
          </div>
        )}

        {pairOpen && data?.saved && (() => {
          const tl = all.filter(r => !r.link && (!pqT || (r.name + ' ' + (r.gstins || []).join(' ')).toLowerCase().includes(pqT.toLowerCase())))
            .sort((a, b) => Math.abs(b.closing) - Math.abs(a.closing)).slice(0, 200);
          const linkedIds = new Set(all.filter(r => r.link).map(r => String(r.link.clientId)));
          const cl = clients.filter(c => !pqC || (c.name + ' ' + c.gstin).toLowerCase().includes(pqC.toLowerCase())).slice(0, 200);
          const tSel = all.find(r => r.name === pairT), cSel = clientById[String(pairC || '')];
          const box = { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', border: `1px solid ${BD}`, borderRadius: 10, overflow: 'hidden', background: '#fff' };
          const item = on => ({ padding: '7px 10px', borderBottom: '1px solid #F2F4F7', cursor: 'pointer', background: on ? '#EFF8FF' : '#fff', borderLeft: `3px solid ${on ? P : 'transparent'}` });
          return (
            <div style={{ background: '#F9FAFB', border: `1px solid ${BD}`, borderRadius: 12, padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', gap: 12, height: 300 }}>
                <div style={box}>
                  <div style={{ padding: '8px 10px', fontWeight: 800, fontSize: 12, borderBottom: `1px solid ${BD}` }}>1 · Tally ledger
                    <input value={pqT} onChange={e => setPqT(e.target.value)} placeholder="Search name / GSTIN" style={{ marginLeft: 8, height: 26, border: '1px solid #D0D5DD', borderRadius: 6, padding: '0 8px', fontSize: 12, fontFamily: F, width: 200 }} /></div>
                  <div style={{ overflowY: 'auto', flex: 1 }}>{tl.map(r => (
                    <div key={r.name} onClick={() => setPairT(r.name)} style={item(pairT === r.name)}>
                      <div style={{ fontSize: 12.5, fontWeight: 700 }}>{r.name}</div>
                      <div style={{ fontSize: 11, color: '#667085' }}>{(r.gstins || [])[0] || 'No GSTIN'} · {r.state || '—'}{Math.abs(r.closing) > 0.005 && <> · {money(r.closing)} {r.closing >= 0 ? 'Dr' : 'Cr'}</>}</div>
                    </div>))}</div>
                </div>
                <div style={box}>
                  <div style={{ padding: '8px 10px', fontWeight: 800, fontSize: 12, borderBottom: `1px solid ${BD}` }}>2 · ERP client
                    <input value={pqC} onChange={e => setPqC(e.target.value)} placeholder="Search name / GSTIN" style={{ marginLeft: 8, height: 26, border: '1px solid #D0D5DD', borderRadius: 6, padding: '0 8px', fontSize: 12, fontFamily: F, width: 200 }} /></div>
                  <div style={{ overflowY: 'auto', flex: 1 }}>{cl.map(c => (
                    <div key={c.id} onClick={() => setPairC(String(c.id))} style={item(String(pairC) === String(c.id))}>
                      <div style={{ fontSize: 12.5, fontWeight: 700 }}>{c.name} <span style={{ color: '#98A2B3', fontWeight: 500 }}>#{c.id}</span>
                        {linkedIds.has(String(c.id)) && <span style={{ fontSize: 10, fontWeight: 800, marginLeft: 6, color: '#067647' }}>already linked</span>}</div>
                      <div style={{ fontSize: 11, color: '#667085' }}>{c.gstin || 'No GSTIN'} · {c.state || '—'}</div>
                    </div>))}</div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5 }}>
                <div style={{ flex: 1 }}>
                  {tSel && cSel ? <>Pair <b>{tSel.name}</b> ({(tSel.gstins || [])[0] || 'no GSTIN'}) ⇄ <b>{cSel.name}</b> ({cSel.gstin || 'no GSTIN'})
                    {(tSel.gstins || []).length > 0 && cSel.gstin && <b style={{ marginLeft: 8, color: (tSel.gstins || []).includes(cSel.gstin) ? '#067647' : '#B42318' }}>
                      {(tSel.gstins || []).includes(cSel.gstin) ? '✓ GSTIN same' : '≠ GSTIN differs'}</b>}</>
                    : <span style={{ color: '#667085' }}>Click one Tally ledger on the left and one ERP client on the right.</span>}
                </div>
                <button disabled={!tSel || !cSel || busy} onClick={async () => { setPick(p => ({ ...p, [tSel.name]: String(cSel.id) })); await approve([{ ...tSel, match: { by: 'manual', client: { clientId: cSel.id } } }]); setPairT(null); setPairC(null); }}
                  style={{ height: 34, padding: '0 16px', border: 'none', borderRadius: 8, background: tSel && cSel ? '#079455' : '#D0D5DD', color: '#fff', cursor: tSel && cSel ? 'pointer' : 'default', fontFamily: F, fontWeight: 800 }}>✓ Approve pair</button>
              </div>
            </div>
          );
        })()}


        {/* table */}
        <div style={{ flex: 1, minHeight: 0, overflow: 'auto', background: '#fff', border: `1px solid ${BD}`, borderRadius: 12 }}>
          {loading ? <div style={{ padding: 40, textAlign: 'center', color: '#98A2B3' }}>Loading…</div>
          : !data?.saved ? <div style={{ padding: 40, textAlign: 'center', color: '#475467' }}>No Tally debtors saved yet. Click <b>Fetch debtors from Tally</b>.</div>
          : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>
                <th style={{ ...th, width: 34 }}><input type="checkbox" checked={allTicked} onChange={() => setSel(allTicked ? new Set() : new Set(rows.filter(r => !r.link).map(r => r.name)))} /></th>
                <th style={th}>Tally ledger</th>
                <th style={{ ...th, textAlign: 'right' }}>Tally balance</th>
                <th style={th}>Match</th>
                <th style={th}>ERP client</th>
                <th style={{ ...th, width: 150 }}>Status</th>
              </tr></thead>
              <tbody>
                {rows.length === 0 && <tr><td colSpan={6} style={{ ...td, textAlign: 'center', color: '#98A2B3', padding: 30 }}>Nothing to show</td></tr>}
                {rows.map(r => {
                  const st = statusOf(r);
                  const m = MATCH[r.match?.by || 'none'];
                  const dr = r.closing >= 0;
                  return (
                    <tr key={r.name} style={{ background: r.link ? '#F6FEF9' : sel.has(r.name) ? '#F0F9FF' : '#fff' }}>
                      <td style={td}>{!r.link && <input type="checkbox" checked={sel.has(r.name)} onChange={() => setSel(s => { const n = new Set(s); n.has(r.name) ? n.delete(r.name) : n.add(r.name); return n; })} />}</td>
                      <td style={td}>
                        <div style={{ fontWeight: 700, color: '#101828' }}>{r.name}</div>
                        <div style={{ fontSize: 11, color: '#667085', marginTop: 2 }}>
                          {r.gstins?.length ? <>GSTIN {r.gstins.join(', ')}</> : 'No GSTIN'}{r.state && <> · {r.state}</>}
                          {r.ownCompany && <span title="This GSTIN belongs to your other company in the ERP — a group-company customer" style={{ marginLeft: 6, fontSize: 10.5, fontWeight: 700, color: '#6941C6', background: '#F4F3FF', border: '1px solid #D9D6FE', borderRadius: 10, padding: '1px 7px' }}>🏢 Group company · {r.ownCompany}</span>}
                        </div>
                      </td>
                      <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 700, color: Math.abs(r.closing) < 0.005 ? '#98A2B3' : dr ? '#B54708' : '#175CD3' }}>
                        {Math.abs(r.closing) < 0.005 ? '—' : <>{money(r.closing)} {dr ? 'Dr' : 'Cr'}</>}
                        {Math.abs(r.closing) >= 0.005 && <div style={{ fontSize: 10.5, fontWeight: 600, color: '#667085' }}>{dr ? 'receivable' : 'advance / excess'}</div>}
                      </td>
                      <td style={td}>
                        {r.link ? <span style={{ fontSize: 10.5, fontWeight: 800, padding: '2px 8px', borderRadius: 20, background: '#ECFDF3', color: '#067647' }}>Approved</span>
                          : <span style={{ fontSize: 10.5, fontWeight: 800, padding: '2px 8px', borderRadius: 20, background: m.bg, color: m.fg, whiteSpace: 'nowrap' }}>
                              {m.label}{r.match?.by === 'suggest' ? ` ${Math.round(r.match.score * 100)}%` : ''}</span>}
                      </td>
                      <td style={{ ...td, minWidth: 260 }}>
                        {r.link ? (
                          <div><b>{r.link.client?.name}</b> <span style={{ color: '#98A2B3', fontSize: 11 }}>#{r.link.clientId}</span>{erpGstLine(r, r.link.clientId)}</div>
                        ) : (<>
                          <select value={String(chosen(r))} onChange={e => setPick(p => ({ ...p, [r.name]: e.target.value }))}
                            style={{ width: '100%', height: 32, border: '1px solid #D0D5DD', borderRadius: 8, fontSize: 12.5, fontFamily: F, padding: '0 8px',
                              background: chosen(r) ? '#fff' : '#F9FAFB', color: chosen(r) ? '#101828' : '#98A2B3' }}>
                            <option value="">— not in ERP / choose client —</option>
                            {clients.filter(c => !takenIds.has(String(c.id)) || String(c.id) === String(chosen(r))).map(c => <option key={c.id} value={String(c.id)}>{c.name}{c.gstin ? ` — ${c.gstin}` : ''} (#{c.id})</option>)}
                          </select>
                          {erpGstLine(r, chosen(r))}
                          {r.match?.by === 'suggest' && !pick[r.name] && (
                            <div style={{ fontSize: 11, marginTop: 4, color: '#B54708' }}>
                              Suggestion: <b>{r.match.client.name}</b>{r.match.client.gstin ? ` — ${r.match.client.gstin}` : ''} ({Math.round(r.match.score * 100)}% similar name)
                              <button onClick={() => setPick(p => ({ ...p, [r.name]: String(r.match.client.clientId) }))}
                                style={{ marginLeft: 6, border: '1px solid #FEC84B', background: '#FFFAEB', color: '#B54708', borderRadius: 6, cursor: 'pointer', fontSize: 10.5, fontWeight: 800, padding: '1px 7px', fontFamily: F }}>Use</button>
                            </div>
                          )}
                        </>)}
                      </td>
                      <td style={td}>
                        {st === 'approved' ? (
                          <div style={{ fontSize: 11.5, color: '#067647' }}>
                            ✓ Already in ERP<div style={{ color: '#98A2B3', fontSize: 10.5 }}>{whenTxt(r.link.approvedAt)}</div>
                            <div style={{ display: 'flex', gap: 10, marginTop: 3 }}>
                              <button disabled={busy} onClick={() => fillFromTally([r])} title="Fill the empty fields of this ERP client from Tally (pincode, country, PAN, address, contact…). Nothing already filled is changed."
                                style={{ border: 'none', background: 'none', color: '#175CD3', cursor: 'pointer', fontSize: 11, padding: 0, fontFamily: F, fontWeight: 700 }}>⟳ Update from Tally</button>
                              <button onClick={() => unlink(r)} style={{ border: 'none', background: 'none', color: '#B42318', cursor: 'pointer', fontSize: 11, padding: 0, fontFamily: F }}>Undo</button>
                            </div>
                          </div>
                        ) : !r.match && !chosen(r) ? (
                          <button disabled={busy} onClick={() => askCreate([r])} title="Create this party as a new ERP client from the Tally details"
                            style={{ height: 30, padding: '0 10px', border: '1px solid #B2CCFF', borderRadius: 8, fontFamily: F, fontWeight: 800, fontSize: 12, background: '#EFF8FF', color: '#175CD3', cursor: 'pointer', whiteSpace: 'nowrap' }}>＋ Create in ERP</button>
                        ) : (
                          <button disabled={busy || !chosen(r)} onClick={() => approve([r])}
                            style={{ height: 30, padding: '0 12px', border: 'none', borderRadius: 8, fontFamily: F, fontWeight: 800, fontSize: 12,
                              background: chosen(r) ? '#079455' : '#EAECF0', color: chosen(r) ? '#fff' : '#98A2B3', cursor: chosen(r) ? 'pointer' : 'default' }}>✓ Approve</button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
        {data?.saved && <div style={{ fontSize: 11, color: '#667085' }}>{counts.all} Tally debtors · {data.clientCount} ERP clients · "Not in ERP" ledgers can be imported as new clients in the next step.</div>}
      </div>
    </div>
  );
}
