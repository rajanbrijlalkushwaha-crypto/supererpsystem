/* TallyBank — Account › "Tally Bank Match".
 *
 * Payment and Receipt vouchers read from Tally (bank lines only — a copy saved in the ERP;
 * opening this page does not contact Tally), matched bank by bank to the ERP's payments and
 * receipts: same type, same bank, same amount, dated within 3 days (party agreeing too).
 * The user approves the pairs; Tally entries not in the ERP can be created as ERP entries,
 * which go for approval like any entry made by hand. Nothing is ever written to Tally.
 */
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import axios from 'axios';
import { useCompany } from '../../../context/CompanyContext';
import FyDropdown from '../../../components/FyDropdown';
import ApproverPickerModal from '../../../components/ApproverPicker';

const F   = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const BD  = '#EAECF0';
const money = n => (parseFloat(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtD = d => { if (!d) return '—'; const s = String(d).slice(0, 10).split('-'); return s.length === 3 ? `${s[2]}-${s[1]}-${s[0]}` : d; };
const whenTxt = d => d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
const curFy = (() => { const t = new Date(); const y = t.getMonth() >= 3 ? t.getFullYear() : t.getFullYear() - 1; return `${String(y).slice(2)}-${String(y + 1).slice(2)}`; })();
const FYS = (() => { const out = []; const y0 = 2000 + parseInt(curFy.slice(0, 2), 10); for (let y = y0; y >= 2022; y--) out.push(`${String(y).slice(2)}-${String(y + 1).slice(2)}`); return out; })();
/* ERP payment mode from Tally's transaction type — Tally defaults most entries to "Cheque/DD",
   so it only counts as a cheque when a cheque number was entered */
const modeOf = r => /upi/i.test(r.txnType || '') ? 'UPI' : /neft/i.test(r.txnType || '') ? 'NEFT' : /rtgs/i.test(r.txnType || '') ? 'RTGS'
  : /cheque|dd/i.test(r.txnType || '') && r.instrumentNo ? 'Cheque' : 'Bank Transfer';

/* only Payment / Receipt vouchers become ERP entries — a Contra (bank ↔ bank / cash) or Journal is not a payment */
const creatable = r => !r.vchType || r.vchType === 'Payment' || r.vchType === 'Receipt';

const MATCH = {
  approved: { label: 'Approved',     bg: '#ECFDF3', fg: '#067647' },
  match:    { label: 'Matched',      bg: '#EFF8FF', fg: '#175CD3' },
  suggest:  { label: 'Suggested',    bg: '#FFFAEB', fg: '#B54708' },
  none:     { label: 'Only in Tally', bg: '#F2F4F7', fg: '#475467' },
};

export default function TallyBank() {
  const { selectedCompany } = useCompany();
  const cid = selectedCompany?.companyId;

  const [fy, setFy]             = useState(curFy);
  const [type, setType]         = useState('receipt');   // receipt | payment
  const [bank, setBank]         = useState('');          // ERP bankId, '' = all
  const [view, setView]         = useState('todo');
  const [q, setQ]               = useState('');
  const [data, setData]         = useState(null);
  const [loading, setLoading]   = useState(true);
  const [job, setJob]           = useState(null);        // background fetch progress
  const [err, setErr]           = useState(null);
  const [msg, setMsg]           = useState('');
  const [serverOld, setServerOld] = useState(false);
  const [pick, setPick]         = useState({});          // tally key → ERP paymentId chosen
  const [sel, setSel]           = useState(new Set());
  const [busy, setBusy]         = useState(false);
  const [creating, setCreating] = useState(null);        // rows waiting for the approver choice
  const poll = useRef(null);

  const loadSaved = useCallback(async () => {
    if (!cid) return;
    setLoading(true); setErr(null);
    try {
      const r = await axios.get(`/api/tally-reports/bank/saved?companyId=${cid}&fy=${fy}`);
      const old = !r.data || typeof r.data !== 'object' || !Array.isArray(r.data.rows);
      setServerOld(old); setData(old ? null : r.data);
    } catch (e) { setErr(e.response?.data || { error: e.message }); }
    setLoading(false);
  }, [cid, fy]);
  useEffect(() => { loadSaved(); setSel(new Set()); setPick({}); }, [loadSaved]);

  /* background fetch: start, then poll the progress until it ends */
  const watch = useCallback(() => {
    clearInterval(poll.current);
    poll.current = setInterval(async () => {
      try {
        const j = (await axios.get(`/api/tally-reports/bank/fetch-status?companyId=${cid}`)).data?.job;
        setJob(j);
        if (!j || !j.running) {
          clearInterval(poll.current);
          if (j?.error) setErr({ error: `Stopped: ${j.error}` });
          else if (j) setMsg(`✓ Payments & receipts read from Tally and saved in the ERP — ${j.done.map(d => `FY ${d.fy}: ${d.lines} bank entries`).join(' · ')}.`);
          loadSaved();
        }
      } catch { /* keep polling */ }
    }, 2000);
  }, [cid, loadSaved]);
  useEffect(() => () => clearInterval(poll.current), []);
  useEffect(() => {   // a fetch started earlier may still be running
    if (!cid) return;
    axios.get(`/api/tally-reports/bank/fetch-status?companyId=${cid}`).then(r => { if (r.data?.job?.running) { setJob(r.data.job); watch(); } }).catch(() => {});
  }, [cid, watch]);
  const startFetch = async allYears => {
    setErr(null); setMsg('');
    try {
      const r = await axios.get(`/api/tally-reports/bank/fetch?companyId=${cid}&fy=${fy}${allYears ? '&all=1' : ''}`);
      if (!r.data?.started) throw new Error('The ERP server did not start the fetch — it may need a restart.');
      setJob(r.data.job); watch();
    } catch (e) { setErr(e.response?.data || { error: e.message }); if (e.response?.data?.job) { setJob(e.response.data.job); watch(); } }
  };
  const running = !!job?.running;

  /* ── rows ── */
  const all = useMemo(() => data?.rows || [], [data]);
  const bankName = useMemo(() => Object.fromEntries((data?.erpBanks || []).map(b => [b.bankId, b.bankName])), [data]);
  const inScope = useCallback(r => r.type === type && (!bank || r.erpBankId === bank), [type, bank]);
  const statusOf = r => r.link ? 'approved' : r.match?.by || 'none';
  const scoped = useMemo(() => all.filter(inScope), [all, inScope]);
  const erpOnly = useMemo(() => (data?.erpOnly || []).filter(p => p.type === type && (!bank || !p.bankId || p.bankId === bank)), [data, type, bank]);
  const counts = {
    todo: scoped.filter(r => statusOf(r) === 'match').length,
    suggest: scoped.filter(r => statusOf(r) === 'suggest').length,
    none: scoped.filter(r => statusOf(r) === 'none').length,
    approved: scoped.filter(r => r.link).length,
    all: scoped.length,
    erp: erpOnly.length,
  };
  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    return scoped.filter(r => {
      const st = statusOf(r);
      if (view === 'todo' && st !== 'match') return false;
      if (view === 'suggest' && st !== 'suggest') return false;
      if (view === 'none' && st !== 'none') return false;
      if (view === 'approved' && st !== 'approved') return false;
      if (!t) return true;
      return [r.party, r.number, r.narration, r.amount, r.bank, r.match?.erp?.party, r.link?.erp?.party].join(' ').toLowerCase().includes(t);
    }).sort((a, b) => a.date.localeCompare(b.date) || a.amount - b.amount);
  }, [scoped, view, q]);   // eslint-disable-line react-hooks/exhaustive-deps

  /* ERP entries a Tally line could be paired with by hand: same type and bank, not yet approved for another */
  const linkedIds = useMemo(() => new Set(all.filter(r => r.link).map(r => String(r.link.paymentId))), [all]);
  const choicesFor = r => {
    const pool = [...(data?.erpOnly || []), ...all.filter(x => x.match && x.key !== r.key).map(x => x.match.erp), ...(r.match ? [r.match.erp] : [])];
    const seen = new Set();
    return pool.filter(p => p && p.type === r.type && (!p.bankId || !r.erpBankId || p.bankId === r.erpBankId) && !linkedIds.has(String(p.paymentId)) && !seen.has(p.paymentId) && seen.add(p.paymentId))
      .sort((a, b) => Math.abs(a.amount - r.amount) - Math.abs(b.amount - r.amount)).slice(0, 60);
  };
  const chosen = r => pick[r.key] !== undefined ? pick[r.key] : (r.match?.by === 'match' ? String(r.match.erp.paymentId) : '');

  const approve = async list => {
    const todo = list.filter(r => !r.link && chosen(r));
    if (!todo.length) { setMsg('Choose the ERP entry first.'); return; }
    setBusy(true); setErr(null); setMsg('');
    let ok = 0;
    for (const r of todo) {
      try { await axios.post('/api/tally-reports/bank/link', { companyId: cid, key: r.key, paymentId: chosen(r) }); ok++; }
      catch (e) { setErr({ error: `Stopped at Tally voucher ${r.number} (${fmtD(r.date)}): ${e.response?.data?.error || e.message}` }); break; }
    }
    setBusy(false); setSel(new Set()); setPick({});
    if (ok) setMsg(`✓ ${ok} entr${ok === 1 ? 'y' : 'ies'} approved — the same in Tally and the ERP.`);
    loadSaved();
  };
  const unlink = async r => {
    if (!window.confirm(`Remove the approval for Tally voucher ${r.number} (${fmtD(r.date)}, ₹${money(r.amount)})?`)) return;
    setBusy(true);
    try { await axios.post('/api/tally-reports/bank/unlink', { companyId: cid, key: r.key }); } catch (e) { setErr(e.response?.data || { error: e.message }); }
    setBusy(false); loadSaved();
  };

  /* create ERP payments / receipts for Tally entries not in the ERP — pending, with an approver */
  const askCreate = list => {
    const todo = list.filter(r => !r.link && !r.match && r.erpBankId && creatable(r));
    if (!todo.length) { setMsg('Tick "Only in Tally" entries whose bank is linked to an ERP bank.'); return; }
    setCreating(todo);
  };
  const createInErp = async (list, approverId) => {
    setCreating(null); setBusy(true); setErr(null); setMsg('');
    let ok = 0;
    for (const r of list) {
      try {
        const pl = r.partyLink;
        const res = await axios.post(`/api/accounts/payments?companyId=${cid}`, {
          companyId: cid, type: r.type, date: r.date, amount: String(r.amount), bankId: r.erpBankId, paymentMode: modeOf(r),
          referenceNo: r.instrumentNo || '', party: pl?.name || r.party,
          entityType: pl ? pl.kind : 'ledger', entityId: pl ? pl.id : '', entityName: pl?.name || r.party,
          orderId: '', orderType: '', linkedExpenses: [],
          notes: `From Tally ${r.type} voucher ${r.number} dated ${fmtD(r.date)} (${r.bank})${r.narration ? ' — ' + r.narration : ''}`,
          tallyKey: r.key, status: 'pending', approverId: approverId || '',
        });
        if (!res.data?.paymentId) throw new Error('the ERP did not return the new entry ID');
        await axios.post('/api/tally-reports/bank/link', { companyId: cid, key: r.key, paymentId: res.data.paymentId });
        ok++;
      } catch (e) { setErr({ error: `Stopped at Tally voucher ${r.number} (${fmtD(r.date)}): ${e.response?.data?.error || e.message}` }); break; }
    }
    setBusy(false); setSel(new Set());
    if (ok) setMsg(`✓ ${ok} ${type === 'receipt' ? 'receipt' : 'payment'}${ok === 1 ? '' : 's'} created in the ERP from Tally, linked, and sent for approval. They count in the bank balance once approved.`);
    loadSaved();
  };

  const mapBank = async (tallyBank, bankId) => {
    try { await axios.post('/api/tally-reports/bank/map', { companyId: cid, tallyBank, bankId }); loadSaved(); }
    catch (e) { setErr(e.response?.data || { error: e.message }); }
  };

  /* ── ui ── */
  const ready = rows.filter(r => statusOf(r) === 'match');
  const nSelNone = all.filter(r => sel.has(r.key) && !r.link && !r.match).length;
  const chip = (k, label) => (
    <button key={k} onClick={() => setView(k)} style={{ height: 30, padding: '0 12px', borderRadius: 20, cursor: 'pointer', fontFamily: F, fontSize: 12, fontWeight: 700,
      border: `1.5px solid ${view === k ? '#3A6186' : '#D0D5DD'}`, background: view === k ? '#3A6186' : '#fff', color: view === k ? '#fff' : '#344054' }}>{label} <span style={{ opacity: 0.8 }}>{counts[k]}</span></button>
  );
  const seg = (val, cur, set, label) => (
    <button key={val} onClick={() => { set(val); setSel(new Set()); }} style={{ height: 32, padding: '0 14px', border: 'none', cursor: 'pointer', fontFamily: F, fontSize: 12.5, fontWeight: 800,
      background: cur === val ? '#104f4f' : 'transparent', color: cur === val ? '#fff' : '#344054', borderRadius: 7 }}>{label}</button>
  );
  const th = { position: 'sticky', top: 0, zIndex: 2, background: '#F9FAFB', padding: '8px 10px', fontSize: 10.5, fontWeight: 800, color: '#475467', textTransform: 'uppercase', borderBottom: `1px solid ${BD}`, textAlign: 'left', whiteSpace: 'nowrap' };
  const td = { padding: '8px 10px', borderBottom: '1px solid #F2F4F7', fontSize: 12.5, verticalAlign: 'top' };
  const erpLine = p => p && (
    <div style={{ fontSize: 11, color: '#475467', marginTop: 3 }}>
      ERP #{p.paymentId} · {fmtD(p.date)} · ₹{money(p.amount)} · {p.party || '—'}{p.bankId ? ` · ${bankName[p.bankId] || p.bankId}` : ''}{p.status && p.status !== 'confirmed' ? ` · ${p.status}` : ''}
    </div>
  );

  if (!cid) return <div style={{ padding: 40, fontFamily: F, color: '#667085' }}>Select a company first.</div>;

  return (
    <div style={{ fontFamily: F, display: 'flex', flexDirection: 'column', gap: 10, height: '100%', minHeight: 0, padding: '12px 14px', boxSizing: 'border-box', background: '#F2F4F7' }}>
      {/* header */}
      <div style={{ background: '#fff', border: `1px solid ${BD}`, borderRadius: 12, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 260 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#101828' }}>🏦 Tally Payments & Receipts ↔ ERP Bank Entries</div>
          <div style={{ fontSize: 11.5, color: '#667085', marginTop: 2 }}>
            Bank entries from Tally (read-only), saved in the ERP, matched bank by bank: same amount, within 3 days. Approve the pairs; create the ones only in Tally.
            {data?.saved && <> · <b>{data.saved.company}</b> · GSTIN {data.saved.gstin} <span style={{ color: '#067647', fontWeight: 800 }}>✓ matched</span></>}
          </div>
        </div>
        <FyDropdown value={fy} options={FYS} onChange={setFy} neu current={curFy} />
        <div style={{ padding: '4px 10px', borderRadius: 8, fontSize: 11.5, lineHeight: 1.3, background: data?.saved ? '#F0F9FF' : '#FFFAEB', border: `1px solid ${data?.saved ? '#B9E6FE' : '#FEDF89'}`, color: data?.saved ? '#026AA2' : '#B54708' }}>
          <div style={{ fontWeight: 800 }}>Last updated</div>
          <div>{data?.saved ? <>{whenTxt(data.saved.savedAt || data.saved.fetchedAt)} · up to {fmtD(data.saved.to)}</> : 'never — not fetched yet'}</div>
        </div>
        <button onClick={() => startFetch(false)} disabled={running} style={{ height: 36, padding: '0 12px', border: '1px solid #D0D5DD', borderRadius: 8, background: '#fff', color: '#344054', cursor: running ? 'wait' : 'pointer', fontFamily: F, fontWeight: 700, fontSize: 12 }}>FY {fy} only</button>
        <button onClick={() => startFetch(true)} disabled={running} style={{ height: 36, padding: '0 16px', border: 'none', borderRadius: 8, background: '#104f4f', color: '#fff', cursor: running ? 'wait' : 'pointer', fontFamily: F, fontWeight: 800, fontSize: 12.5, opacity: running ? 0.7 : 1 }}>
          {running ? 'Fetching from Tally…' : '⟳ Fetch all years from Tally'}</button>
      </div>

      {running && <div style={{ background: '#F0F9FF', border: '1px solid #B9E6FE', borderRadius: 10, padding: '8px 14px', fontSize: 12.5, color: '#026AA2', fontWeight: 600 }}>
        ⏳ Reading from Tally, one month at a time — {job.step || 'starting…'} · {job.done.length} of {job.fys.length} FY done. You can keep working; this page updates when it finishes.</div>}
      {serverOld && <div style={{ background: '#FEF3F2', border: '1px solid #FDA29B', borderRadius: 10, padding: '10px 14px', color: '#B42318', fontSize: 13, fontWeight: 600 }}>⚠ The ERP server needs a restart (node server.js) — it is running an older version without this page's data.</div>}
      {err && <div style={{ background: err.code === 'GSTIN_MISMATCH' ? '#FEF3F2' : '#FFFAEB', border: `1px solid ${err.code === 'GSTIN_MISMATCH' ? '#FDA29B' : '#FEDF89'}`, borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#344054' }}>
        <b style={{ color: err.code === 'GSTIN_MISMATCH' ? '#B42318' : '#B54708' }}>{err.code === 'GSTIN_MISMATCH' ? '⛔ Company not matched' : '⚠ Problem'}</b> — {err.error}</div>}
      {msg && <div style={{ background: '#ECFDF3', border: '1px solid #ABEFC6', borderRadius: 10, padding: '8px 14px', fontSize: 12.5, color: '#067647', fontWeight: 600 }}>{msg}</div>}

      {data?.saved && (<>
        {/* Tally bank → ERP bank */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', fontSize: 12 }}>
          <span style={{ fontWeight: 800, color: '#475467' }}>Banks:</span>
          {Object.entries(data.bankMap || {}).map(([t, m]) => (
            <span key={t} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#fff', border: `1px solid ${m ? BD : '#FDA29B'}`, borderRadius: 8, padding: '3px 8px' }}>
              Tally <b>{t}</b> →
              <select value={m?.bankId || ''} onChange={e => mapBank(t, e.target.value)} style={{ height: 26, border: '1px solid #D0D5DD', borderRadius: 6, fontFamily: F, fontSize: 12 }}>
                <option value="">— not linked —</option>
                {(data.erpBanks || []).map(b => <option key={b.bankId} value={b.bankId}>{b.bankName}{b.accountNumber ? ` · ${b.accountNumber}` : ''}</option>)}
              </select>
              {!m && <span style={{ color: '#B42318', fontWeight: 700 }}>link it to match</span>}
            </span>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ display: 'flex', background: '#fff', border: `1px solid ${BD}`, borderRadius: 9, padding: 2 }}>
            {seg('receipt', type, setType, `Receipts (${all.filter(r => r.type === 'receipt').length})`)}{seg('payment', type, setType, `Payments (${all.filter(r => r.type === 'payment').length})`)}
          </div>
          <div style={{ display: 'flex', background: '#fff', border: `1px solid ${BD}`, borderRadius: 9, padding: 2 }}>
            {seg('', bank, setBank, 'All banks')}
            {(data.erpBanks || []).filter(b => Object.values(data.bankMap || {}).some(m => m?.bankId === b.bankId)).map(b => seg(b.bankId, bank, setBank, b.bankName))}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {chip('todo', 'Matched — to approve')}{chip('suggest', 'Suggested — check')}{chip('none', 'Only in Tally')}{chip('erp', 'Only in ERP')}{chip('approved', '✓ Approved')}{chip('all', 'All Tally')}
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="🔍 Search party, voucher, amount…"
            style={{ height: 32, padding: '0 11px', border: '1px solid #D0D5DD', borderRadius: 8, fontSize: 12.5, fontFamily: F, width: 230, marginLeft: 'auto' }} />
          {view !== 'erp' && ready.length > 0 && <button disabled={busy} onClick={() => approve(ready)}
            style={{ height: 32, padding: '0 12px', border: '1px solid #ABEFC6', borderRadius: 8, background: '#ECFDF3', color: '#067647', cursor: 'pointer', fontFamily: F, fontWeight: 800, fontSize: 12 }}>✓ Approve all {ready.length} matches</button>}
          {nSelNone > 0 && <button disabled={busy} onClick={() => askCreate(all.filter(r => sel.has(r.key)))}
            style={{ height: 32, padding: '0 12px', border: '1px solid #B2CCFF', borderRadius: 8, background: '#EFF8FF', color: '#175CD3', cursor: 'pointer', fontFamily: F, fontWeight: 800, fontSize: 12 }}>＋ Create {nSelNone} in ERP</button>}
          {view !== 'erp' && <button disabled={busy || sel.size === 0} onClick={() => approve(all.filter(r => sel.has(r.key)))}
            style={{ height: 32, padding: '0 12px', border: 'none', borderRadius: 8, background: sel.size ? '#079455' : '#D0D5DD', color: '#fff', cursor: sel.size ? 'pointer' : 'default', fontFamily: F, fontWeight: 800, fontSize: 12 }}>✓ Approve selected ({sel.size})</button>}
        </div>
      </>)}

      {creating && (
        <ApproverPickerModal module={type === 'receipt' ? 'receipt' : 'payment'}
          recordLabel={`${creating.length} ${type === 'receipt' ? 'receipt' : 'payment'}${creating.length === 1 ? '' : 's'} from Tally (₹${money(creating.reduce((t, r) => t + r.amount, 0))})`}
          onConfirm={approverId => createInErp(creating, approverId)} onCancel={() => setCreating(null)} />
      )}

      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', background: '#fff', border: `1px solid ${BD}`, borderRadius: 12 }}>
        {loading ? <div style={{ padding: 40, textAlign: 'center', color: '#98A2B3' }}>Loading…</div>
        : !data?.saved ? <div style={{ padding: 40, textAlign: 'center', color: '#475467' }}>No Tally payments & receipts saved for FY {fy} yet. Click <b>Fetch all years from Tally</b>.</div>
        : view === 'erp' ? (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>{['ERP entry', 'Date', 'Party', 'Bank', 'Mode · Ref', 'Amount', 'Status'].map(h => <th key={h} style={{ ...th, textAlign: h === 'Amount' ? 'right' : 'left' }}>{h}</th>)}</tr></thead>
            <tbody>
              {erpOnly.map(p => (
                <tr key={p.paymentId}>
                  <td style={td}><b>#{p.paymentId}</b>{p.orderNo && <div style={{ fontSize: 11, color: '#667085' }}>{p.orderNo}</div>}</td>
                  <td style={td}>{fmtD(p.date)}</td><td style={td}>{p.party || '—'}</td><td style={td}>{bankName[p.bankId] || (p.bankId ? p.bankId : <span style={{ color: '#B54708' }}>no bank</span>)}</td>
                  <td style={td}>{p.mode}{p.ref ? <div style={{ fontSize: 11, color: '#667085' }}>{p.ref}</div> : null}</td>
                  <td style={{ ...td, textAlign: 'right', fontWeight: 800 }}>₹{money(p.amount)}</td><td style={td}>{p.status}</td>
                </tr>
              ))}
              {erpOnly.length === 0 && <tr><td colSpan={7} style={{ padding: 30, textAlign: 'center', color: '#98A2B3' }}>Every ERP {type} of FY {fy} for these banks is in Tally.</td></tr>}
            </tbody>
          </table>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              <th style={{ ...th, width: 30 }}><input type="checkbox" checked={rows.some(r => !r.link) && rows.filter(r => !r.link).every(r => sel.has(r.key))}
                onChange={e => setSel(e.target.checked ? new Set(rows.filter(r => !r.link).map(r => r.key)) : new Set())} /></th>
              <th style={th}>Date</th><th style={th}>Tally voucher</th><th style={th}>Party</th><th style={{ ...th, textAlign: 'right' }}>Amount</th><th style={th}>Match</th><th style={th}>ERP entry</th><th style={th}>Status</th>
            </tr></thead>
            <tbody>
              {rows.map(r => {
                const st = statusOf(r), m = MATCH[st], ch = chosen(r);
                return (
                  <tr key={r.key} style={{ background: sel.has(r.key) ? '#F5FAFF' : undefined }}>
                    <td style={td}>{!r.link && <input type="checkbox" checked={sel.has(r.key)} onChange={() => setSel(s => { const n = new Set(s); n.has(r.key) ? n.delete(r.key) : n.add(r.key); return n; })} />}</td>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}>{fmtD(r.date)}</td>
                    <td style={td}><b>{r.vchType && !creatable(r) ? r.vchType : r.type === 'receipt' ? 'Rcpt' : 'Pymt'} {r.number}</b><div style={{ fontSize: 11, color: '#667085' }}>{r.bank}{r.txnType ? ` · ${r.txnType}` : ''}{r.instrumentNo ? ` · ${r.instrumentNo}` : ''}</div>
                      {r.reconciled && <div style={{ fontSize: 10.5, color: '#067647' }}>✓ reconciled in Tally {fmtD(r.reconciled)}</div>}</td>
                    <td style={td}>{r.party || '—'}{r.partyLink && <div style={{ fontSize: 11, color: '#067647' }}>✓ ERP {r.partyLink.kind}: {r.partyLink.name}</div>}
                      {r.others?.length > 1 && <div style={{ fontSize: 11, color: '#667085' }}>+ {r.others.slice(1).map(o => o.name).join(', ')}</div>}
                      {r.narration && <div style={{ fontSize: 11, color: '#98A2B3', maxWidth: 300 }}>{r.narration}</div>}</td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: 800, whiteSpace: 'nowrap', color: r.type === 'receipt' ? '#067647' : '#B42318' }}>{r.type === 'receipt' ? '+' : '−'} ₹{money(r.amount)}</td>
                    <td style={td}><span style={{ fontSize: 10.5, fontWeight: 800, padding: '2px 8px', borderRadius: 20, background: m.bg, color: m.fg, whiteSpace: 'nowrap' }}>{m.label}</span>
                      {r.match && <div style={{ fontSize: 10.5, color: '#667085', marginTop: 3 }}>{r.match.days === 0 ? 'same day' : `${r.match.days} day${r.match.days === 1 ? '' : 's'} apart`}{r.match.partyOk ? ' · same party' : ' · party differs'}</div>}</td>
                    <td style={{ ...td, minWidth: 280 }}>
                      {r.link ? erpLine(r.link.erp) : (<>
                        <select value={String(ch)} onChange={e => setPick(p => ({ ...p, [r.key]: e.target.value }))}
                          style={{ width: '100%', height: 30, border: '1px solid #D0D5DD', borderRadius: 8, fontSize: 12, fontFamily: F, padding: '0 6px', background: ch ? '#fff' : '#F9FAFB', color: ch ? '#101828' : '#98A2B3' }}>
                          <option value="">— not in ERP / choose entry —</option>
                          {choicesFor(r).map(p => <option key={p.paymentId} value={String(p.paymentId)}>#{p.paymentId} · {fmtD(p.date)} · ₹{money(p.amount)} · {p.party}</option>)}
                        </select>
                        {r.match?.by === 'suggest' && !pick[r.key] && (
                          <div style={{ fontSize: 11, marginTop: 4, color: '#B54708' }}>Suggestion: #{r.match.erp.paymentId} {r.match.erp.party} ({fmtD(r.match.erp.date)})
                            <button onClick={() => setPick(p => ({ ...p, [r.key]: String(r.match.erp.paymentId) }))} style={{ marginLeft: 6, border: '1px solid #FEC84B', background: '#FFFAEB', color: '#B54708', borderRadius: 6, cursor: 'pointer', fontSize: 10.5, fontWeight: 800, padding: '1px 7px', fontFamily: F }}>Use</button></div>
                        )}
                        {ch && r.match?.erp && String(r.match.erp.paymentId) === String(ch) && erpLine(r.match.erp)}
                      </>)}
                    </td>
                    <td style={td}>
                      {r.link ? (<div style={{ fontSize: 11.5, color: '#067647' }}>✓ In both<div style={{ color: '#98A2B3', fontSize: 10.5 }}>{whenTxt(r.link.approvedAt)}</div>
                        <button disabled={busy} onClick={() => unlink(r)} style={{ border: 'none', background: 'none', color: '#B42318', cursor: 'pointer', fontSize: 11, padding: 0, fontFamily: F, fontWeight: 700 }}>Undo</button></div>)
                      : !r.match && !ch ? (
                        <button disabled={busy || !r.erpBankId || !creatable(r)} onClick={() => askCreate([r])} title={!creatable(r) ? `A ${r.vchType} is a transfer, not a payment — it stays only in the statement` : r.erpBankId ? 'Create this entry in the ERP from Tally (goes for approval)' : 'Link this Tally bank to an ERP bank first'}
                          style={{ height: 30, padding: '0 10px', border: '1px solid #B2CCFF', borderRadius: 8, fontFamily: F, fontWeight: 800, fontSize: 12, background: '#EFF8FF', color: '#175CD3', cursor: r.erpBankId ? 'pointer' : 'default', whiteSpace: 'nowrap' }}>＋ Create in ERP</button>
                      ) : (
                        <button disabled={busy || !ch} onClick={() => approve([r])} style={{ height: 30, padding: '0 12px', border: 'none', borderRadius: 8, fontFamily: F, fontWeight: 800, fontSize: 12, background: ch ? '#079455' : '#EAECF0', color: ch ? '#fff' : '#98A2B3', cursor: ch ? 'pointer' : 'default', whiteSpace: 'nowrap' }}>✓ Approve</button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && <tr><td colSpan={8} style={{ padding: 30, textAlign: 'center', color: '#98A2B3' }}>Nothing here.</td></tr>}
            </tbody>
          </table>
        )}
      </div>
      {data?.saved && <div style={{ fontSize: 11, color: '#667085' }}>
        FY {fy}: {all.length} bank entries in Tally ({data.saved.vouchers} vouchers{data.saved.cash ? `, ${data.saved.cash} cash vouchers not shown` : ''}) · totals in view: Tally ₹{money(rows.reduce((t, r) => t + r.amount, 0))}
      </div>}
    </div>
  );
}
