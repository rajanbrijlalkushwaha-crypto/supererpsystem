/* TallyItems — Items › "Tally" tab.
 *
 * Shows the Stock Items master fetched from Tally (a copy saved in the ERP — opening this
 * page does not contact Tally). Each Tally item is matched to an ERP item by name (or a
 * "suggested" lookalike with the same size/capacity numbers). Approving a pair records that
 * the Tally item already exists in the ERP as that item; items not in the ERP can be created
 * from Tally's details (name, unit, HSN). Nothing is ever written to Tally.
 */
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { useCompany } from '../../context/CompanyContext';

const F   = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const BD  = '#EAECF0';
const whenTxt = d => d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
const ITEM_TYPES = ['Ready Product', 'Raw Material', 'Service'];

const MATCH = {
  name:    { label: 'Name match',  bg: '#EFF8FF', fg: '#175CD3' },
  suggest: { label: 'Suggested',   bg: '#FFFAEB', fg: '#B54708' },
  none:    { label: 'Not in ERP',  bg: '#F2F4F7', fg: '#475467' },
};
/* ERP item type for a Tally item: services by Tally's GST supply type, consumables/raw by group */
const typeOf = r => r.service || /^99/.test(r.hsn || '') ? 'Service' : /raw|consum|consumble|material|spare/i.test(r.group || '') ? 'Raw Material' : 'Ready Product';

export default function TallyItems() {
  const { selectedCompany } = useCompany();
  const cid = selectedCompany?.companyId;
  const navigate = useNavigate();

  const [data, setData]         = useState(null);   // { saved, rows, erpItems }
  const [loading, setLoading]   = useState(true);
  const [fetching, setFetching] = useState(false);
  const [err, setErr]           = useState(null);
  const [msg, setMsg]           = useState('');
  const [serverOld, setServerOld] = useState(false);
  const [q, setQ]               = useState('');
  const [view, setView]         = useState('all');
  const [pick, setPick]         = useState({});          // tally item name → ERP itemCode chosen
  const [sel, setSel]           = useState(new Set());
  const [busy, setBusy]         = useState(false);
  const [creating, setCreating] = useState(null);        // [{ row, itemName, uom, hsnCode, itemType }]

  const loadSaved = useCallback(async () => {
    if (!cid) return;
    setLoading(true); setErr(null);
    try {
      const s = await axios.get(`/api/tally-reports/items/saved?companyId=${cid}`);
      const old = !s.data || typeof s.data !== 'object' || !Array.isArray(s.data.rows);
      setServerOld(old); setData(old ? null : s.data);
    } catch (e) { setErr(e.response?.data || { error: e.message }); }
    setLoading(false);
  }, [cid]);
  useEffect(() => { loadSaved(); setSel(new Set()); setPick({}); }, [loadSaved]);

  const fetchFromTally = async () => {
    setFetching(true); setErr(null); setMsg('');
    try {
      const r = await axios.get(`/api/tally-reports/items/fetch?companyId=${cid}`);
      if (!r.data || !Array.isArray(r.data.rows)) throw new Error('Tally sent an unexpected reply — the saved list was kept. Please try again.');
      setData(r.data); setServerOld(false);
      setMsg(`✓ ${r.data.rows.length} stock items read from Tally and saved in the ERP.`);
    } catch (e) { setErr(e.response?.data || { error: e.message }); }
    setFetching(false);
  };

  const all = useMemo(() => data?.rows || [], [data]);
  const erpItems = useMemo(() => (data?.erpItems || []).slice().sort((a, b) => a.name.localeCompare(b.name)), [data]);
  const erpByCode = useMemo(() => Object.fromEntries(erpItems.map(i => [String(i.itemCode), i])), [erpItems]);
  const takenCodes = useMemo(() => new Set(all.filter(r => r.link).map(r => String(r.link.itemCode))), [all]);
  const chosen = r => pick[r.name] !== undefined ? pick[r.name] : (r.match && r.match.by !== 'suggest' ? String(r.match.item.itemCode) : '');
  const statusOf = r => r.link ? 'approved' : (r.match?.by || 'none');

  const counts = {
    all: all.length,
    approved: all.filter(r => r.link).length,
    todo: all.filter(r => !r.link && r.match?.by === 'name').length,
    suggest: all.filter(r => !r.link && r.match?.by === 'suggest').length,
    none: all.filter(r => !r.link && !r.match).length,
  };
  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    return all.filter(r => {
      const st = statusOf(r);
      if (view === 'approved' && st !== 'approved') return false;
      if (view === 'todo' && st !== 'name') return false;
      if (view === 'suggest' && st !== 'suggest') return false;
      if (view === 'none' && st !== 'none') return false;
      if (!t) return true;
      return [r.name, r.group, r.hsn, r.unit, r.match?.item?.name, r.link?.item?.name, r.link?.itemCode].join(' ').toLowerCase().includes(t);
    }).sort((a, b) => a.name.localeCompare(b.name));
  }, [all, q, view]);   // eslint-disable-line react-hooks/exhaustive-deps

  /* approve: this Tally item IS that ERP item */
  const approve = async list => {
    const todo = list.filter(r => !r.link && chosen(r));
    if (!todo.length) { setMsg('Choose the ERP item first.'); return; }
    setBusy(true); setErr(null); setMsg('');
    let ok = 0;
    for (const r of todo) {
      try { await axios.post('/api/tally-reports/items/link', { companyId: cid, tallyName: r.name, itemCode: chosen(r) }); ok++; }
      catch (e) { setErr({ error: `Stopped at "${r.name}": ${e.response?.data?.error || e.message}` }); break; }
    }
    setBusy(false); setSel(new Set()); setPick({});
    if (ok) setMsg(`✓ ${ok} item${ok === 1 ? '' : 's'} approved as already in the ERP.`);
    loadSaved();
  };
  const unlink = async r => {
    if (!window.confirm(`Remove the approval for Tally item "${r.name}"?`)) return;
    setBusy(true);
    try { await axios.post('/api/tally-reports/items/unlink', { companyId: cid, tallyName: r.name }); }
    catch (e) { setErr(e.response?.data || { error: e.message }); }
    setBusy(false); loadSaved();
  };

  /* fill only the EMPTY unit / HSN of approved ERP items from Tally (the item update replaces
     every field, so the current values are always sent back) */
  const fillFromTally = async list => {
    const todo = list.filter(r => r.link && erpByCode[String(r.link.itemCode)]);
    setBusy(true); setErr(null); setMsg('');
    let updated = 0, nothing = 0;
    for (const r of todo) {
      const ex = erpByCode[String(r.link.itemCode)];
      const hsnCode = ex.hsn || r.hsn || '';
      const uom = ex.uom || r.erpUom || '';
      if (hsnCode === ex.hsn && uom === ex.uom) { nothing++; continue; }
      try { await axios.put(`/api/items/${ex.itemCode}?companyId=${cid}`, { companyId: cid, itemName: ex.name, uom, hsnCode, itemType: ex.type || 'Ready Product' }); updated++; }
      catch (e) { setErr({ error: `Stopped at "${r.name}": ${e.response?.data?.error || e.message}` }); break; }
    }
    setBusy(false);
    setMsg(`✓ ${updated} item${updated === 1 ? '' : 's'} updated with missing unit / HSN from Tally${nothing ? ` · ${nothing} already complete` : ''}.`);
    loadSaved();
  };

  /* create ERP items for Tally items that are not in the ERP, then link them */
  const openCreate = list => {
    const todo = list.filter(r => !r.link && !r.match);
    if (!todo.length) { setMsg('Tick "Not in ERP" items to create.'); return; }
    setCreating(todo.map(r => ({ row: r, itemName: r.name, uom: typeOf(r) === 'Service' ? 'N/A' : (r.erpUom || 'NOS'), hsnCode: r.hsn || '', itemType: typeOf(r) })));
  };
  const createItems = async () => {
    const list = creating; setCreating(null);
    setBusy(true); setErr(null); setMsg('');
    let ok = 0;
    for (const c of list) {
      try {
        const res = await axios.post(`/api/items?companyId=${cid}`, { companyId: cid, itemName: c.itemName.trim(), uom: c.uom, hsnCode: c.hsnCode.trim(), itemType: c.itemType });
        if (!res.data?.itemCode) throw new Error('the ERP did not return the new item code');
        await axios.post('/api/tally-reports/items/link', { companyId: cid, tallyName: c.row.name, itemCode: res.data.itemCode });
        ok++;
      } catch (e) { setErr({ error: `Stopped at "${c.row.name}": ${e.response?.data?.error || e.message}` }); break; }
    }
    setBusy(false); setSel(new Set());
    if (ok) setMsg(`✓ ${ok} item${ok === 1 ? '' : 's'} created in the ERP from Tally and linked.`);
    loadSaved();
  };

  const nameReady = all.filter(r => !r.link && r.match?.by === 'name');
  const chip = (k, label) => (
    <button key={k} onClick={() => setView(k)}
      style={{ height: 32, padding: '0 12px', borderRadius: 8, border: `1px solid ${view === k ? '#3A6186' : '#D0D5DD'}`, background: view === k ? '#3A6186' : '#fff',
        color: view === k ? '#fff' : '#344054', fontFamily: F, fontWeight: 700, fontSize: 12.5, cursor: 'pointer' }}>{label} {counts[k]}</button>
  );
  const td = { padding: '10px 10px', borderBottom: '1px solid #F2F4F7', verticalAlign: 'top', fontSize: 12.5 };
  const tabs = [['Items / Products', '/items/view'], ['Tally', '/items/tally']];

  if (!cid) return <div style={{ padding: 40, fontFamily: F, color: '#667085' }}>Select a company first.</div>;

  return (
    <div style={{ fontFamily: F, padding: 16, display: 'flex', flexDirection: 'column', gap: 12, height: '100%', minHeight: 0, boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', gap: 6 }}>
        {tabs.map(([l, p]) => <button key={p} onClick={() => navigate(p)} style={{ height: 32, padding: '0 14px', borderRadius: 8, border: `1px solid ${p === '/items/tally' ? '#104f4f' : '#D0D5DD'}`,
          background: p === '/items/tally' ? '#104f4f' : '#fff', color: p === '/items/tally' ? '#fff' : '#344054', fontFamily: F, fontWeight: 700, fontSize: 12.5, cursor: 'pointer' }}>{l}</button>)}
      </div>

      <div style={{ background: '#fff', border: `1px solid ${BD}`, borderRadius: 12, padding: '12px 16px', display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 260 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#101828' }}>📦 Tally Stock Items ↔ ERP Items</div>
          <div style={{ fontSize: 12, color: '#667085', marginTop: 2 }}>
            Stock items from Tally (read-only), saved in the ERP. Approve the pairs that are the same item; create the ones not in the ERP.
            {data?.saved && <> · <b>{data.saved.company}</b> · GSTIN {data.saved.gstin} <span style={{ color: '#067647', fontWeight: 800 }}>✓ matched</span></>}
          </div>
        </div>
        <div style={{ padding: '4px 10px', borderRadius: 8, fontSize: 11.5, lineHeight: 1.3, background: data?.saved ? '#F0F9FF' : '#FFFAEB', border: `1px solid ${data?.saved ? '#B9E6FE' : '#FEDF89'}`, color: data?.saved ? '#026AA2' : '#B54708' }}>
          <div style={{ fontWeight: 800 }}>Last updated</div>
          <div>{data?.saved ? whenTxt(data.saved.savedAt || data.saved.fetchedAt) : 'never — not fetched yet'}</div>
        </div>
        <button onClick={fetchFromTally} disabled={fetching}
          style={{ height: 36, padding: '0 16px', border: 'none', borderRadius: 8, background: '#104f4f', color: '#fff', cursor: fetching ? 'wait' : 'pointer', fontFamily: F, fontWeight: 800, fontSize: 12.5, opacity: fetching ? 0.7 : 1 }}>
          {fetching ? 'Fetching from Tally…' : '⟳ Fetch stock items from Tally'}
        </button>
      </div>

      {serverOld && <div style={{ background: '#FEF3F2', border: '1px solid #FDA29B', borderRadius: 10, padding: '10px 14px', color: '#B42318', fontSize: 13, fontWeight: 600 }}>⚠ The ERP server needs a restart (node server.js) — it is running an older version without this page's data.</div>}
      {err && <div style={{ background: err.code === 'GSTIN_MISMATCH' ? '#FEF3F2' : '#FFFAEB', border: `1px solid ${err.code === 'GSTIN_MISMATCH' ? '#FDA29B' : '#FEDF89'}`, borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#344054' }}>
        <b style={{ color: err.code === 'GSTIN_MISMATCH' ? '#B42318' : '#B54708' }}>{err.code === 'GSTIN_MISMATCH' ? '⛔ Company not matched' : '⚠ Problem'}</b> — {err.error}</div>}
      {msg && <div style={{ background: '#ECFDF3', border: '1px solid #ABEFC6', borderRadius: 10, padding: '8px 14px', fontSize: 12.5, color: '#067647', fontWeight: 600 }}>{msg}</div>}

      {data?.saved && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {chip('all', 'All')}{chip('approved', '✓ Approved')}{chip('todo', 'Matched — to approve')}{chip('suggest', 'Suggested — check')}{chip('none', 'Not in ERP')}
          <span style={{ fontSize: 11.5, color: '#667085' }}>ERP items: {erpItems.length} · not linked to Tally: {erpItems.filter(i => !takenCodes.has(String(i.itemCode))).length}</span>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="🔍 Search item, group, HSN…"
            style={{ height: 32, padding: '0 11px', border: '1px solid #D0D5DD', borderRadius: 8, fontSize: 12.5, fontFamily: F, width: 230, marginLeft: 'auto' }} />
          {nameReady.length > 0 && (
            <button disabled={busy} onClick={() => approve(nameReady)}
              style={{ height: 32, padding: '0 12px', border: '1px solid #ABEFC6', borderRadius: 8, background: '#ECFDF3', color: '#067647', cursor: 'pointer', fontFamily: F, fontWeight: 800, fontSize: 12 }}>✓ Approve all {nameReady.length} name matches</button>
          )}
          {(() => { const n = all.filter(r => sel.has(r.name) && !r.link && !r.match).length; return n > 0 && (
            <button disabled={busy} onClick={() => openCreate(all.filter(r => sel.has(r.name)))} style={{ height: 32, padding: '0 12px', border: '1px solid #B2CCFF', borderRadius: 8, background: '#EFF8FF', color: '#175CD3', cursor: 'pointer', fontFamily: F, fontWeight: 800, fontSize: 12 }}>＋ Create {n} in ERP</button>
          ); })()}
          {counts.approved > 0 && (
            <button disabled={busy} onClick={() => fillFromTally(all)} title="Fill the empty unit / HSN of approved ERP items from Tally. Nothing already filled is changed."
              style={{ height: 32, padding: '0 12px', border: '1px solid #D0D5DD', borderRadius: 8, background: '#fff', color: '#175CD3', cursor: 'pointer', fontFamily: F, fontWeight: 800, fontSize: 12 }}>⟳ Fill missing unit / HSN from Tally</button>
          )}
          <button disabled={busy || sel.size === 0} onClick={() => approve(all.filter(r => sel.has(r.name)))}
            style={{ height: 32, padding: '0 12px', border: 'none', borderRadius: 8, background: sel.size ? '#079455' : '#D0D5DD', color: '#fff', cursor: sel.size ? 'pointer' : 'default', fontFamily: F, fontWeight: 800, fontSize: 12 }}>✓ Approve selected ({sel.size})</button>
        </div>
      )}

      {creating && (() => {
        const taken = new Set(erpItems.map(i => i.name.trim().toLowerCase()));
        const names = creating.map(c => c.itemName.trim().toLowerCase());
        const problem = creating.map((c, i) => !names[i] ? 'Enter a name' : taken.has(names[i]) ? 'An ERP item has this name — approve it instead' : names.indexOf(names[i]) !== i ? 'Same name twice' : '');
        const set = (i, k, v) => setCreating(list => list.map((x, j) => j === i ? { ...x, [k]: v } : x));
        const cell = { padding: '6px 8px', borderBottom: '1px solid #F2F4F7', verticalAlign: 'top' };
        const inp = { width: '100%', height: 30, border: '1px solid #D0D5DD', borderRadius: 7, padding: '0 8px', fontFamily: F, fontSize: 12.5, boxSizing: 'border-box' };
        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(16,24,40,0.5)', zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
            <div style={{ background: '#fff', borderRadius: 14, width: 'min(980px, 98vw)', maxHeight: '88vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', fontFamily: F }}>
              <div style={{ padding: '14px 18px', borderBottom: `1px solid ${BD}` }}>
                <div style={{ fontSize: 15, fontWeight: 800 }}>Create {creating.length} item{creating.length === 1 ? '' : 's'} in the ERP from Tally</div>
                <div style={{ fontSize: 12, color: '#667085', marginTop: 2 }}>Name, unit and HSN come from Tally — change them if needed. Each new item gets the next ERP item code and is linked to its Tally item. Nothing is changed in Tally.</div>
              </div>
              <div style={{ overflow: 'auto', padding: '8px 18px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                  <thead><tr>{['Tally item', 'ERP item name', 'Type', 'Unit', 'HSN / SAC'].map(h => <th key={h} style={{ textAlign: 'left', fontSize: 10.5, color: '#475467', textTransform: 'uppercase', padding: '6px 8px', borderBottom: `1px solid ${BD}` }}>{h}</th>)}</tr></thead>
                  <tbody>{creating.map((c, i) => (
                    <tr key={c.row.name}>
                      <td style={cell}><b>{c.row.name}</b><div style={{ fontSize: 11, color: '#667085' }}>{[c.row.group, c.row.unit, c.row.gst != null ? `GST ${c.row.gst}%` : ''].filter(Boolean).join(' · ')}</div></td>
                      <td style={cell}><input value={c.itemName} onChange={e => set(i, 'itemName', e.target.value)} style={{ ...inp, borderColor: problem[i] ? '#F04438' : '#D0D5DD' }} />
                        {problem[i] && <div style={{ fontSize: 11, color: '#B42318', marginTop: 2 }}>{problem[i]}</div>}</td>
                      <td style={{ ...cell, width: 140 }}><select value={c.itemType} onChange={e => set(i, 'itemType', e.target.value)} style={inp}>{ITEM_TYPES.map(t => <option key={t}>{t}</option>)}</select></td>
                      <td style={{ ...cell, width: 90 }}><input value={c.uom} onChange={e => set(i, 'uom', e.target.value)} style={inp} /></td>
                      <td style={{ ...cell, width: 120 }}><input value={c.hsnCode} onChange={e => set(i, 'hsnCode', e.target.value)} style={inp} /></td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
              <div style={{ padding: '12px 18px', borderTop: `1px solid ${BD}`, display: 'flex', justifyContent: 'flex-end', gap: 8, alignItems: 'center' }}>
                {problem.some(Boolean) && <span style={{ fontSize: 12, color: '#B42318', marginRight: 'auto' }}>Fix the rows marked in red first.</span>}
                <button onClick={() => setCreating(null)} style={{ height: 36, padding: '0 16px', border: '1px solid #D0D5DD', borderRadius: 8, background: '#fff', cursor: 'pointer', fontFamily: F, fontWeight: 700 }}>Cancel</button>
                <button disabled={problem.some(Boolean)} onClick={createItems}
                  style={{ height: 36, padding: '0 18px', border: 'none', borderRadius: 8, background: problem.some(Boolean) ? '#D0D5DD' : '#079455', color: '#fff', cursor: problem.some(Boolean) ? 'default' : 'pointer', fontFamily: F, fontWeight: 800 }}>Create {creating.length} item{creating.length === 1 ? '' : 's'}</button>
              </div>
            </div>
          </div>
        );
      })()}

      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', background: '#fff', border: `1px solid ${BD}`, borderRadius: 12 }}>
        {loading ? <div style={{ padding: 40, textAlign: 'center', color: '#98A2B3' }}>Loading…</div>
        : !data?.saved ? <div style={{ padding: 40, textAlign: 'center', color: '#475467' }}>No Tally stock items saved yet. Click <b>Fetch stock items from Tally</b>.</div>
        : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ position: 'sticky', top: 0, background: '#F9FAFB', zIndex: 1 }}>
              <tr>
                <th style={{ ...td, width: 30 }}><input type="checkbox" checked={rows.length > 0 && rows.filter(r => !r.link).every(r => sel.has(r.name))}
                  onChange={e => setSel(e.target.checked ? new Set(rows.filter(r => !r.link).map(r => r.name)) : new Set())} /></th>
                {['Tally item', 'Unit · HSN · GST', 'Match', 'ERP item', 'Status'].map(h => <th key={h} style={{ ...td, textAlign: 'left', fontSize: 11, fontWeight: 800, color: '#475467', textTransform: 'uppercase' }}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const st = statusOf(r), m = MATCH[st] || MATCH.none;
                const ch = chosen(r), ci = erpByCode[String(ch)];
                return (
                  <tr key={r.name} style={{ background: sel.has(r.name) ? '#F5FAFF' : undefined }}>
                    <td style={td}>{!r.link && <input type="checkbox" checked={sel.has(r.name)} onChange={() => setSel(s => { const n = new Set(s); n.has(r.name) ? n.delete(r.name) : n.add(r.name); return n; })} />}</td>
                    <td style={td}><b>{r.name}</b>{r.group && <div style={{ fontSize: 11, color: '#667085' }}>Group: {r.group}</div>}
                      {r.aliases?.length > 0 && <div style={{ fontSize: 11, color: '#667085' }}>Alias: {r.aliases.join(', ')}</div>}</td>
                    <td style={{ ...td, whiteSpace: 'nowrap', color: '#344054' }}>{r.unit || '—'}<div style={{ fontSize: 11, color: '#667085' }}>HSN {r.hsn || '—'}{r.gst != null ? ` · GST ${r.gst}%` : ''}</div></td>
                    <td style={td}>{r.link ? <span style={{ fontSize: 10.5, fontWeight: 800, padding: '2px 8px', borderRadius: 20, background: '#ECFDF3', color: '#067647' }}>Approved</span>
                      : <span style={{ fontSize: 10.5, fontWeight: 800, padding: '2px 8px', borderRadius: 20, background: m.bg, color: m.fg, whiteSpace: 'nowrap' }}>{m.label}{st === 'suggest' ? ` ${Math.round(r.match.score * 100)}%` : ''}</span>}</td>
                    <td style={{ ...td, minWidth: 280 }}>
                      {r.link ? (
                        <div><b>{r.link.item?.name}</b> <span style={{ color: '#98A2B3', fontSize: 11 }}>#{r.link.itemCode}</span>
                          <div style={{ fontSize: 11, color: '#667085' }}>{r.link.item?.uom || 'no unit'} · HSN {r.link.item?.hsn || '—'}{r.link.item?.type ? ` · ${r.link.item.type}` : ''}</div></div>
                      ) : (<>
                        <select value={String(ch)} onChange={e => setPick(p => ({ ...p, [r.name]: e.target.value }))}
                          style={{ width: '100%', height: 32, border: '1px solid #D0D5DD', borderRadius: 8, fontSize: 12.5, fontFamily: F, padding: '0 8px', background: ch ? '#fff' : '#F9FAFB', color: ch ? '#101828' : '#98A2B3' }}>
                          <option value="">— not in ERP / choose item —</option>
                          {erpItems.filter(i => !takenCodes.has(String(i.itemCode)) || String(i.itemCode) === String(ch)).map(i => <option key={i.itemCode} value={String(i.itemCode)}>{i.name} (#{i.itemCode}{i.hsn ? ` · HSN ${i.hsn}` : ''})</option>)}
                        </select>
                        {ci && <div style={{ fontSize: 11, color: '#667085', marginTop: 3 }}>ERP: {ci.uom || 'no unit'} · HSN {ci.hsn || '—'}
                          {r.hsn && ci.hsn && r.hsn.slice(0, 4) !== ci.hsn.slice(0, 4) && <span style={{ color: '#B54708', fontWeight: 700 }}> · HSN differs from Tally ({r.hsn})</span>}</div>}
                        {st === 'suggest' && !pick[r.name] && (
                          <div style={{ fontSize: 11, marginTop: 4, color: '#B54708' }}>Suggestion: <b>{r.match.item.name}</b> (#{r.match.item.itemCode})
                            <button onClick={() => setPick(p => ({ ...p, [r.name]: String(r.match.item.itemCode) }))}
                              style={{ marginLeft: 6, border: '1px solid #FEC84B', background: '#FFFAEB', color: '#B54708', borderRadius: 6, cursor: 'pointer', fontSize: 10.5, fontWeight: 800, padding: '1px 7px', fontFamily: F }}>Use</button></div>
                        )}
                      </>)}
                    </td>
                    <td style={td}>
                      {r.link ? (
                        <div style={{ fontSize: 11.5, color: '#067647' }}>✓ Already in ERP<div style={{ color: '#98A2B3', fontSize: 10.5 }}>{whenTxt(r.link.approvedAt)}</div>
                          <button disabled={busy} onClick={() => unlink(r)} style={{ border: 'none', background: 'none', color: '#B42318', cursor: 'pointer', fontSize: 11, padding: 0, fontFamily: F, fontWeight: 700, marginTop: 3 }}>Undo</button></div>
                      ) : !r.match && !ch ? (
                        <button disabled={busy} onClick={() => openCreate([r])} title="Create this item in the ERP from the Tally details"
                          style={{ height: 30, padding: '0 10px', border: '1px solid #B2CCFF', borderRadius: 8, fontFamily: F, fontWeight: 800, fontSize: 12, background: '#EFF8FF', color: '#175CD3', cursor: 'pointer', whiteSpace: 'nowrap' }}>＋ Create in ERP</button>
                      ) : (
                        <button disabled={busy || !ch} onClick={() => approve([r])}
                          style={{ height: 30, padding: '0 12px', border: 'none', borderRadius: 8, fontFamily: F, fontWeight: 800, fontSize: 12, background: ch ? '#079455' : '#EAECF0', color: ch ? '#fff' : '#98A2B3', cursor: ch ? 'pointer' : 'default' }}>✓ Approve</button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && <tr><td colSpan={6} style={{ padding: 30, textAlign: 'center', color: '#98A2B3' }}>Nothing here.</td></tr>}
            </tbody>
          </table>
        )}
      </div>
      {data?.saved && <div style={{ fontSize: 11, color: '#667085' }}>{counts.all} Tally stock items · approve the matches, then create the "Not in ERP" ones with ＋ Create in ERP.</div>}
    </div>
  );
}
