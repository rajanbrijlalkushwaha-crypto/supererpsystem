/* Tally Reconciliation › Journal — Tally journal vouchers of one FY (e.g. Dr Transport Exps / Cr Ridhi Sidhi).
 * Assign the SO a project expense belongs to; it then counts as that order's expense in Order Profit.
 * Office / salary journals stay without an SO (overheads). Nothing is written to Tally.
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import { useCompany } from '../../context/CompanyContext';
import FyDropdown from '../../components/FyDropdown';
import { Picker } from '../account/statement/TallyStatement';
import { F, money, fmtD, whenTxt, curFy, FYS } from './reconUi';

function JournalAssign({ line, data, cid, onClose, onSaved }) {
  const [soId, setSoId] = useState(line.so?.orderId || '');
  const [remark, setRemark] = useState(line.remark || '');
  const [busy, setBusy] = useState(false);
  const items = useMemo(() => (data?.salesOrders || []).slice().sort((a, b) => String(b.orderDate).localeCompare(String(a.orderDate)))
    .map(o => ({ id: o.orderId, title: o.orderNo, sub: [o.customerName, o.customerPO].filter(Boolean).join(' · ') })), [data]);
  const save = async () => {
    setBusy(true);
    try { await axios.post('/api/tally-reports/bank/assign', { companyId: cid, key: line.key, soId, remark: remark.trim() }); onSaved(); }
    catch (e) { alert(e.response?.data?.error || e.message); setBusy(false); }
  };
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(16,24,40,0.5)', zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 12, width: 'min(560px, 96vw)', padding: '16px 18px', fontFamily: F }}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>Journal {line.number} · {fmtD(line.date)}</div>
        <div style={{ fontSize: 12, color: '#667085', marginTop: 4 }}>Dr {line.dr.map(d => `${d.name} ${money(d.amt)}`).join(', ')}<br />Cr {line.cr.map(c => `${c.name} ${money(c.amt)}`).join(', ')}</div>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#475467', textTransform: 'uppercase', margin: '14px 0 5px' }}>SO File No — the project this expense is for</div>
        <Picker items={items} value={soId} onChange={setSoId} placeholder="Search order no., client…" empty="— none (office / overhead) —" />
        <div style={{ fontSize: 11, fontWeight: 700, color: '#475467', textTransform: 'uppercase', margin: '12px 0 5px' }}>Remarks</div>
        <input value={remark} onChange={e => setRemark(e.target.value)} placeholder={line.narration || 'e.g. transport for cabin delivery'} className="rc-ctl" style={{ width: '100%', boxSizing: 'border-box' }} />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
          <button className="rc-btn" onClick={onClose}>Cancel</button>
          <button className="rc-btn green" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </div>
  );
}

export default function TallyJournal() {
  const { selectedCompany } = useCompany();
  const cid = selectedCompany?.companyId;
  const [fy, setFy] = useState(curFy);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [only, setOnly] = useState('expense');   // expense | all | linked
  const [edit, setEdit] = useState(null);

  const load = useCallback(async () => {
    if (!cid) return;
    setLoading(true); setErr('');
    try {
      const r = await axios.get('/api/tally-reports/journal/list', { params: { companyId: cid, fy } });
      if (!r.data || !Array.isArray(r.data.lines)) throw new Error('The ERP server needs a restart (node server.js) — it is running an older version without this page.');
      setData(r.data);
    } catch (e) { setErr(e.response?.data?.error || e.message); }
    setLoading(false);
  }, [cid, fy]);
  useEffect(() => { load(); }, [load]);

  const lines = useMemo(() => (data?.lines || []).filter(l => {
    if (only === 'expense' && !l.expense) return false;
    if (only === 'linked' && !l.so) return false;
    const t = q.trim().toLowerCase();
    return !t || [l.number, l.narration, l.remark, l.so?.orderNo, ...l.dr.map(d => d.name), ...l.cr.map(c => c.name), l.amount].join(' ').toLowerCase().includes(t);
  }), [data, only, q]);
  const all = data?.lines || [];

  return (
    <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10, height: '100%', boxSizing: 'border-box', fontFamily: F }}>
      <div className="rc-card" style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>Journals</div>
        <span style={{ fontSize: 11, color: '#667085' }}>from Tally{data?.saved ? ` · read ${whenTxt(data.saved.fetchedAt)}` : ''}</span>
        <FyDropdown value={fy} options={FYS} onChange={setFy} neu current={curFy} />
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 12.5, color: '#667085' }}>{lines.length} journals · ₹{money(lines.reduce((t, l) => t + l.amount, 0))}</span>
      </div>
      {err && <div style={{ background: '#FFFAEB', border: '1px solid #FEDF89', borderRadius: 10, padding: '8px 14px', fontSize: 13, color: '#B54708', fontWeight: 600 }}>{err}</div>}
      <div className="rc-card" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', padding: '10px 12px', borderBottom: '1px solid #EAECF0' }}>
          <div className="rc-seg">
            {[['expense', `Expenses (${all.filter(l => l.expense).length})`], ['all', `All (${all.length})`], ['linked', `With SO (${all.filter(l => l.so).length})`]].map(([k, l]) => <button key={k} className={only === k ? 'on' : ''} onClick={() => setOnly(k)}>{l}</button>)}
          </div>
          <input className="rc-ctl" value={q} onChange={e => setQ(e.target.value)} placeholder="Search ledger, voucher no., amount, remark" style={{ width: 280 }} />
          <span style={{ fontSize: 11.5, color: '#98A2B3', marginLeft: 'auto' }}>Journals are read with the bills — Bank Statement › Fetch from Tally refreshes them.</span>
        </div>
        <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
          {loading ? <div style={{ padding: 40, textAlign: 'center', color: '#98A2B3' }}>Loading…</div>
          : !data?.saved ? <div style={{ padding: 40, textAlign: 'center', color: '#475467' }}>No Tally journals saved for FY {fy} yet.</div>
          : (
            <table className="rc-tbl" style={{ minWidth: 1100 }}>
              <colgroup><col style={{ width: 96 }} /><col style={{ width: 80 }} /><col /><col /><col style={{ width: 120 }} /><col style={{ width: 140 }} /><col style={{ width: 210 }} /></colgroup>
              <thead><tr><th>Date</th><th>Vch No</th><th>Debit (Dr)</th><th>Credit (Cr)</th><th className="n">Amount</th><th>SO File No</th><th>Remarks</th></tr></thead>
              <tbody>
                {lines.map(l => (
                  <tr key={l.key} className="row">
                    <td>{fmtD(l.date)}</td>
                    <td style={{ color: '#475467' }}>{l.number}</td>
                    <td title={l.dr.map(d => `${d.name} ${money(d.amt)}`).join('\n')} style={{ fontWeight: 600 }}>{l.dr.map(d => d.name).join(', ')}</td>
                    <td title={l.cr.map(c => `${c.name} ${money(c.amt)}`).join('\n')}>{l.cr.map(c => c.name).join(', ')}</td>
                    <td className="n" style={{ fontWeight: 600 }}>{money(l.amount)}</td>
                    <td title={l.so?.orderNo || ''}>{l.so ? <span style={{ color: '#175CD3', fontWeight: 600, cursor: 'pointer' }} onClick={() => setEdit(l)}>{l.so.orderNo}</span> : <button className="rc-add" onClick={() => setEdit(l)}>＋ SO</button>}</td>
                    <td title={l.remark || l.narration || ''} style={{ color: l.remark ? '#101828' : '#667085' }}>{l.remark || l.narration || ''}</td>
                  </tr>
                ))}
                {lines.length === 0 && <tr><td colSpan={7} style={{ textAlign: 'center', color: '#98A2B3', padding: 30 }}>Nothing here.</td></tr>}
              </tbody>
            </table>
          )}
        </div>
      </div>
      {edit && <JournalAssign line={edit} data={data} cid={cid} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); }} />}
    </div>
  );
}
