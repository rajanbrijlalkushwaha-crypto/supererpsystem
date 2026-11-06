/* Tally Reconciliation › Payment / Receipt — every bank's Tally entries of one FY.
 * You assign the SO (and the PO for a vendor payment). An entry made in the ERP first, then in Tally,
 * is matched to it (same bank + amount, near date) — approve with "Match". Nothing is written to Tally.
 */
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import axios from 'axios';
import { useCompany } from '../../context/CompanyContext';
import FyDropdown from '../../components/FyDropdown';
import { AssignModal } from '../account/statement/TallyStatement';
import { F, money, fmtD, whenTxt, curFy, FYS } from './reconUi';

export default function TallyBook({ type = 'payment' }) {
  const { selectedCompany } = useCompany();
  const cid = selectedCompany?.companyId;
  const isPay = type === 'payment';
  const [fy, setFy] = useState(curFy);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [q, setQ] = useState('');
  const [bank, setBank] = useState('');
  const [only, setOnly] = useState('all');   // all | without | erp
  const [edit, setEdit] = useState(null);
  const [busy, setBusy] = useState(false);
  const [job, setJob] = useState(null);
  const poll = useRef(null);

  const load = useCallback(async () => {
    if (!cid) return;
    setLoading(true); setErr('');
    try {
      const r = await axios.get('/api/tally-reports/book/lines', { params: { companyId: cid, fy, type } });
      if (!r.data || !Array.isArray(r.data.lines)) throw new Error('The ERP server needs a restart (node server.js) — it is running an older version without this page.');
      setData(r.data);
    } catch (e) { setErr(e.response?.data?.error || e.message); }
    setLoading(false);
  }, [cid, fy, type]);
  useEffect(() => { load(); }, [load]);

  const fetchAll = async () => {
    setErr(''); setMsg('');
    try {
      const r = await axios.get(`/api/tally-reports/bank/fetch?companyId=${cid}&all=1`); setJob(r.data.job);
      clearInterval(poll.current);
      poll.current = setInterval(async () => {
        const j = (await axios.get(`/api/tally-reports/bank/fetch-status?companyId=${cid}`).catch(() => ({ data: {} }))).data?.job;
        setJob(j); if (!j || !j.running) { clearInterval(poll.current); if (j?.error) setErr(j.error); else setMsg('Bank entries of every FY read from Tally.'); load(); }
      }, 3000);
    } catch (e) { setErr(e.response?.data?.error || e.message); }
  };
  useEffect(() => () => clearInterval(poll.current), []);

  const lines = useMemo(() => (data?.lines || []).filter(l => {
    if (bank && l.bank !== bank) return false;
    if (only === 'without' && (l.so || l.po)) return false;
    if (only === 'erp' && !l.erp) return false;
    const t = q.trim().toLowerCase();
    return !t || [l.party, l.so?.orderNo, l.po?.poNumber, l.amount, l.remark, l.narration, l.number].join(' ').toLowerCase().includes(t);
  }), [data, bank, only, q]);
  const banks = useMemo(() => [...new Set((data?.lines || []).map(l => l.bank))], [data]);

  const match = async l => {
    setBusy(true); setErr('');
    try { await axios.post('/api/tally-reports/bank/link', { companyId: cid, key: l.key, paymentId: l.erp.paymentId }); setMsg(`Matched with ERP entry #${l.erp.paymentId}.`); load(); }
    catch (e) { setErr(e.response?.data?.error || e.message); }
    setBusy(false);
  };
  const unmatch = async l => {
    if (!window.confirm(`Remove the match with ERP entry #${l.erp.paymentId}?`)) return;
    await axios.post('/api/tally-reports/bank/unlink', { companyId: cid, key: l.key }).catch(() => {}); load();
  };

  const total = lines.reduce((t, l) => t + l.amount, 0);
  return (
    <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10, height: '100%', boxSizing: 'border-box', fontFamily: F }}>
      <div className="rc-card" style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>{isPay ? 'Payments' : 'Receipts'}</div>
        <span style={{ fontSize: 11, color: '#667085' }}>from Tally{data?.saved ? ` · read ${whenTxt(data.saved.fetchedAt)}` : ''}</span>
        <FyDropdown value={fy} options={FYS} onChange={setFy} neu current={curFy} />
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 12.5, color: '#667085' }}>{lines.length} entries · <b style={{ color: isPay ? '#B42318' : '#067647' }}>₹{money(total)}</b></span>
        <button className="rc-btn" onClick={fetchAll} disabled={job?.running}>{job?.running ? 'Fetching…' : 'Fetch from Tally'}</button>
      </div>
      {job?.running && <div style={{ background: '#F0F9FF', border: '1px solid #B9E6FE', borderRadius: 10, padding: '7px 14px', fontSize: 12.5, color: '#026AA2', fontWeight: 600 }}>Reading from Tally — {job.step || 'starting…'} · {job.done.length} of {job.fys.length} FY done.</div>}
      {err && <div style={{ background: '#FFFAEB', border: '1px solid #FEDF89', borderRadius: 10, padding: '8px 14px', fontSize: 13, color: '#B54708', fontWeight: 600 }}>{err}</div>}
      {msg && <div style={{ background: '#ECFDF3', border: '1px solid #ABEFC6', borderRadius: 10, padding: '7px 14px', fontSize: 12.5, color: '#067647', fontWeight: 600 }}>{msg}</div>}
      <div className="rc-card" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', padding: '10px 12px', borderBottom: '1px solid #EAECF0' }}>
          <select className="rc-ctl" value={bank} onChange={e => setBank(e.target.value)} style={{ width: 230 }}>
            <option value="">All banks</option>{banks.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
          <div className="rc-seg">
            {[['all', 'All'], ['without', isPay ? 'Without SO / PO' : 'Without SO'], ['erp', 'Entered in ERP']].map(([k, l]) => <button key={k} className={only === k ? 'on' : ''} onClick={() => setOnly(k)}>{l}</button>)}
          </div>
          <input className="rc-ctl" value={q} onChange={e => setQ(e.target.value)} placeholder="Search party, SO, PO, amount, remark" style={{ width: 280 }} />
        </div>
        <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
          {loading ? <div style={{ padding: 40, textAlign: 'center', color: '#98A2B3' }}>Loading…</div>
          : !data?.saved ? <div style={{ padding: 40, textAlign: 'center', color: '#475467' }}>No Tally bank entries saved for FY {fy} yet. Click <b>Fetch from Tally</b>.</div>
          : (
            <table className="rc-tbl" style={{ minWidth: 1180 }}>
              <colgroup><col style={{ width: 96 }} /><col style={{ width: 150 }} /><col /><col style={{ width: 120 }} /><col style={{ width: 140 }} />{isPay && <col style={{ width: 150 }} />}<col style={{ width: 190 }} /><col style={{ width: 200 }} /></colgroup>
              <thead><tr>
                <th>Date</th><th>Bank</th><th>{isPay ? 'Paid to' : 'Received from'}</th><th className="n">Amount</th><th>SO File No</th>{isPay && <th>PO No</th>}<th>ERP entry</th><th>Remarks</th>
              </tr></thead>
              <tbody>
                {lines.map(l => (
                  <tr key={l.key} className="row">
                    <td>{fmtD(l.date)}</td>
                    <td title={l.bank} style={{ color: '#475467' }}>{l.bank}</td>
                    <td title={`${l.party} · ${l.vchType} ${l.number}`} style={{ fontWeight: 600 }}>{l.party}</td>
                    <td className="n" style={{ fontWeight: 600, color: isPay ? '#B42318' : '#067647' }}>{money(l.amount)}</td>
                    <td title={l.so?.orderNo || ''}>{l.so ? <span style={{ color: '#175CD3', fontWeight: 600, cursor: 'pointer' }} onClick={() => setEdit(l)}>{l.so.orderNo}</span> : <button className="rc-add" onClick={() => setEdit(l)}>＋ SO</button>}</td>
                    {isPay && <td title={l.po?.poNumber || ''}>{l.po ? <span style={{ fontWeight: 600, cursor: 'pointer' }} onClick={() => setEdit(l)} title={l.poSplit ? l.poSplit.map(x => `${x.poNumber}: ₹${money(x.amount)}`).join('\n') : ''}>{l.po.poNumber}{l.poSplit && <span style={{ color: '#175CD3', fontWeight: 700 }}> +{l.poSplit.length - 1}</span>}</span> : <button className="rc-add" onClick={() => setEdit(l)}>＋ PO</button>}</td>}
                    <td>
                      {!l.erp ? <span style={{ color: '#D0D5DD' }}>—</span>
                        : l.erp.status === 'linked' ? <span title="Matched with the entry made in the ERP" style={{ color: '#067647', fontWeight: 600 }}>✓ ERP #{l.erp.paymentId} <button className="rc-btn sm" onClick={() => unmatch(l)} style={{ marginLeft: 6, color: '#B42318', height: 22 }}>Undo</button></span>
                        : <span title={`ERP #${l.erp.paymentId} · ${fmtD(l.erp.date)} · ${l.erp.party} · ₹${money(l.erp.amount)}`}>#{l.erp.paymentId} · {fmtD(l.erp.date)} <button className="rc-btn sm green" disabled={busy} onClick={() => match(l)} style={{ marginLeft: 6, height: 22 }}>Match</button></span>}
                    </td>
                    <td title={l.remark || l.narration || ''} style={{ color: l.remark ? '#101828' : '#667085' }}>{l.remark || l.narration || ''}</td>
                  </tr>
                ))}
                {lines.length === 0 && <tr><td colSpan={isPay ? 8 : 7} style={{ textAlign: 'center', color: '#98A2B3', padding: 30 }}>Nothing here.</td></tr>}
              </tbody>
            </table>
          )}
        </div>
      </div>
      {edit && <AssignModal line={edit} data={data} cid={cid} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); }} />}
    </div>
  );
}
