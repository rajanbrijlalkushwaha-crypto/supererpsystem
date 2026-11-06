/* TallyStatement — Account › Bank Statement (from Tally).
 *
 * One bank, one FY: every bank entry read from Tally (receipts, payments, contra) in date order
 * with the running balance — opening and closing agree with Tally. Each line shows what it was for
 * (vendor against / without PO, office expense, tax, asset, salary, loan … from the Tally ledger's
 * group), the ERP sales order (SO file no.), the client's order no. and the purchase order: taken
 * from the matched ERP entry, or assigned here (saved in the ERP only). Nothing is written to Tally.
 */
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { useCompany } from '../../../context/CompanyContext';
import FyDropdown from '../../../components/FyDropdown';

const F   = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const BD  = '#EAECF0';
const GRID = '#E4E7EC';   // table cell borders
const money = n => (parseFloat(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const lakh = n => { const v = Math.abs(n || 0); return v >= 1e7 ? `${(v / 1e7).toFixed(2)} Cr` : v >= 1e5 ? `${(v / 1e5).toFixed(2)} L` : money(v); };
const balTxt = v => `${money(Math.abs(v))} ${v < 0 ? 'Cr' : 'Dr'}`;   // bank ledger: Dr = money in the bank, Cr = overdrawn
const fmtD = d => { if (!d) return '—'; const s = String(d).slice(0, 10).split('-'); return s.length === 3 ? `${s[2]}-${s[1]}-${s[0]}` : d; };
const whenTxt = d => d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
const curFy = (() => { const t = new Date(); const y = t.getMonth() >= 3 ? t.getFullYear() : t.getFullYear() - 1; return `${String(y).slice(2)}-${String(y + 1).slice(2)}`; })();
const FYS = (() => { const out = []; const y0 = 2000 + parseInt(curFy.slice(0, 2), 10); for (let y = y0; y >= 2022; y--) out.push(`${String(y).slice(2)}-${String(y + 1).slice(2)}`); return out; })();
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/* colour per entry type */
const CAT_COLOR = {
  client: ['#ECFDF3', '#067647'], 'vendor-po': ['#EFF8FF', '#175CD3'], vendor: ['#F5F3FF', '#6941C6'], expense: ['#FFF6ED', '#C4320A'],
  salary: ['#FDF2FA', '#C11574'], tax: ['#FEF3F2', '#B42318'], asset: ['#F0F9FF', '#026AA2'], loan: ['#F4F3FF', '#5925DC'],
  investment: ['#ECFDFF', '#0E7090'], income: ['#F6FEF9', '#079455'], transfer: ['#F2F4F7', '#475467'], cash: ['#F2F4F7', '#475467'],
  suspense: ['#FFFAEB', '#B54708'], other: ['#F2F4F7', '#667085'],
};
const SHORT = { client: 'Client', 'vendor-po': 'Vendor · PO', vendor: 'Vendor · no PO', expense: 'Expense', salary: 'Salary', tax: 'Tax', asset: 'Asset',
  loan: 'Loan / capital', investment: 'FD / BG / Inv.', income: 'Income', transfer: 'Transfer', cash: 'Cash', suspense: 'Suspense', other: 'Other' };
const needsOrder = c => ['client', 'vendor-po', 'vendor'].includes(c);   // types that normally carry an SO / PO

export default function TallyStatement() {
  const { selectedCompany } = useCompany();
  const cid = selectedCompany?.companyId;
  const navigate = useNavigate();

  const [fy, setFy]         = useState(curFy);
  const [bank, setBank]     = useState(() => { try { return localStorage.getItem('tallyStmtBank') || ''; } catch { return ''; } });
  const [data, setData]     = useState(null);
  const [banksAll, setBanksAll] = useState([]);       // Tally banks + their ERP link
  const [loading, setLoading] = useState(true);
  const [err, setErr]       = useState(null);
  const [msg, setMsg]       = useState('');
  const [q, setQ]           = useState('');
  const [side, setSide]     = useState('all');        // all | debit | credit
  const [cat, setCat]       = useState('');           // entry type filter
  const [needs, setNeeds]   = useState(false);        // client / vendor entries still without SO / PO
  const [edit, setEdit]     = useState(null);         // line being assigned
  const [job, setJob]       = useState(null);
  const poll = useRef(null);

  const loadBanks = useCallback(async () => {
    if (!cid) return;
    try {
      const r = await axios.get(`/api/tally-reports/bank/saved?companyId=${cid}&fy=${fy}`);
      const map = r.data?.bankMap || {}, erp = r.data?.erpBanks || [];
      setBanksAll(Object.keys(map).map(name => ({ name, erpBankId: map[name]?.bankId || '', erpName: (erp.find(b => b.bankId === map[name]?.bankId) || {}).bankName || '' })));
      if (!bank && Object.keys(map)[0]) setBank(Object.keys(map)[0]);
      if (!bank && !Object.keys(map).length) { setData(null); setLoading(false); }   // nothing fetched yet
    } catch (e) { setErr(e.response?.data?.error || e.message); setLoading(false); }
  }, [cid, fy, bank]);

  const load = useCallback(async () => {
    if (!cid || !bank) { setLoading(!cid ? false : loading); return; }
    setLoading(true); setErr(null);
    try {
      const r = await axios.get(`/api/tally-reports/bank/statement`, { params: { companyId: cid, fy, bank } });
      if (!r.data || typeof r.data !== 'object') throw new Error('The ERP server needs a restart (node server.js) — it is running an older version without this page.');
      setData(r.data);
    } catch (e) { setErr(e.response?.data?.error || e.message); }
    setLoading(false);
  }, [cid, fy, bank]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { loadBanks(); }, [loadBanks]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { try { if (bank) localStorage.setItem('tallyStmtBank', bank); } catch { /* ignore */ } }, [bank]);

  /* fetch from Tally (all years, in the background) */
  const watch = useCallback(() => {
    clearInterval(poll.current);
    poll.current = setInterval(async () => {
      try {
        const j = (await axios.get(`/api/tally-reports/bank/fetch-status?companyId=${cid}`)).data?.job;
        setJob(j);
        if (!j || !j.running) { clearInterval(poll.current); if (j?.error) setErr(`Fetch stopped: ${j.error}`); else if (j) setMsg('✓ Bank entries of every FY read from Tally and saved in the ERP.'); load(); loadBanks(); }
      } catch { /* keep polling */ }
    }, 2500);
  }, [cid, load, loadBanks]);
  useEffect(() => () => clearInterval(poll.current), []);
  useEffect(() => { if (cid) axios.get(`/api/tally-reports/bank/fetch-status?companyId=${cid}`).then(r => { if (r.data?.job?.running) { setJob(r.data.job); watch(); } }).catch(() => {}); }, [cid, watch]);
  const fetchAll = async () => {
    setErr(null); setMsg('');
    try { const r = await axios.get(`/api/tally-reports/bank/fetch?companyId=${cid}&all=1`); setJob(r.data.job); watch(); }
    catch (e) { setErr(e.response?.data?.error || e.message); if (e.response?.data?.job) { setJob(e.response.data.job); watch(); } }
  };
  const running = !!job?.running;

  /* a Tally bank not in the ERP yet (e.g. IDFC) — add it as an ERP bank account and link it */
  const addErpBank = async () => {
    const t = (data?.banks || []).find(b => b.name === bank) || { name: bank };
    if (!window.confirm(`Add "${t.name}"${t.accountNo ? ` (A/c ${t.accountNo}${t.ifsc ? `, IFSC ${t.ifsc}` : ''})` : ''} to the ERP's bank accounts?\n\nNothing is changed in Tally.`)) return;
    try {
      const r = await axios.post(`/api/accounts/banks?companyId=${cid}`, { companyId: cid, bankName: t.name, accountNumber: t.accountNo || '-', ifscCode: t.ifsc || '', accountHolder: selectedCompany?.companyName || '', accountType: 'Current', openingBalance: 0, notes: 'Added from Tally' });
      if (!r.data?.bankId) throw new Error('the ERP did not return the new bank ID');
      await axios.post('/api/tally-reports/bank/map', { companyId: cid, tallyBank: t.name, bankId: r.data.bankId });
      setMsg(`✓ ${t.name} added to the ERP bank accounts and linked to Tally.`); loadBanks();
    } catch (e) { setErr(e.response?.data?.error || e.message); }
  };

  const all = useMemo(() => data?.lines || [], [data]);
  const catLabel = k => data?.categories?.[k] || SHORT[k] || k;
  const lines = useMemo(() => {
    const t = q.trim().toLowerCase();
    return all.filter(l => {
      if (side === 'debit' && !l.debit) return false;
      if (side === 'credit' && !l.credit) return false;
      if (cat && l.category !== cat) return false;
      if (needs && !(needsOrder(l.category) && !l.so && !l.po)) return false;
      if (!t) return true;
      return [l.party, l.so?.orderNo, l.so?.customerPO, l.po?.poNumber, l.remark, l.narration, l.number, l.debit || l.credit, catLabel(l.category)].join(' ').toLowerCase().includes(t);
    });
  }, [all, q, side, cat, needs]);   // eslint-disable-line react-hooks/exhaustive-deps
  const cats = useMemo(() => {   // type → count, amount (for the type chips)
    const m = {};
    all.filter(l => side === 'all' || (side === 'debit' ? l.debit : l.credit)).forEach(l => { m[l.category] = m[l.category] || { n: 0, amt: 0 }; m[l.category].n++; m[l.category].amt += l.debit + l.credit; });
    return Object.entries(m).sort((a, b) => b[1].amt - a[1].amt);
  }, [all, side]);
  const curBank = banksAll.find(b => b.name === bank);
  const filtered = side !== 'all' || cat || needs || q.trim();
  const needCount = all.filter(l => needsOrder(l.category) && !l.so && !l.po).length;

  const print = () => {
    const w = window.open('', '_blank'); if (!w) return;
    const L = data?.ledger || {};
    w.document.write(`<html><head><title>Bank Statement — ${esc(bank)} — FY ${fy}</title><style>
      body{font-family:Inter,Arial,sans-serif;font-size:10.5px;color:#101828;margin:16px} h2{margin:0 0 2px;font-size:15px} .s{color:#667085;margin-bottom:10px}
      table{width:100%;border-collapse:collapse} th,td{border:1px solid #D0D5DD;padding:4px 6px;vertical-align:top} th{background:#F2F4F7;text-align:left;font-size:9.5px;text-transform:uppercase}
      .n{text-align:right;white-space:nowrap} tr.o td{background:#F9FAFB;font-weight:700}</style></head><body>
      <h2>${esc(selectedCompany?.companyName || '')} — Bank Statement</h2>
      <div class="s">${esc(bank)}${L.accountNo ? ` · A/c ${esc(L.accountNo)}` : ''}${L.ifsc ? ` · IFSC ${esc(L.ifsc)}` : ''} · FY ${fy} (${fmtD(data?.saved?.from)} to ${fmtD(data?.saved?.to)})${filtered ? ' · filtered' : ''}</div>
      <table><thead><tr><th>Sr</th><th>Date</th><th>SO File No</th><th>Client / Vendor</th><th>Type</th><th>Client Order No</th><th>PO No</th><th class="n">Debit</th><th class="n">Credit</th><th class="n">Closing Balance</th><th>Remarks</th></tr></thead><tbody>
      <tr class="o"><td></td><td>${fmtD(data?.saved?.from)}</td><td colspan="5">Opening Balance</td><td></td><td></td><td class="n">${balTxt(data?.opening || 0)}</td><td></td></tr>
      ${lines.map(l => `<tr><td>${l.sr}</td><td>${fmtD(l.date)}</td><td>${esc(l.so?.orderNo || '')}</td><td>${esc(l.party)}</td><td>${esc(SHORT[l.category] || '')}${l.taxKind ? ' · ' + l.taxKind : ''}</td><td>${esc(l.category === 'client' ? l.so?.customerPO || '' : '')}</td><td>${esc(l.po?.poNumber || '')}</td>
        <td class="n">${l.debit ? money(l.debit) : ''}</td><td class="n">${l.credit ? money(l.credit) : ''}</td><td class="n">${filtered ? '' : balTxt(l.balance)}</td><td>${esc(l.remark || l.narration || '')}</td></tr>`).join('')}
      <tr class="o"><td></td><td>${fmtD(data?.saved?.to)}</td><td colspan="5">${filtered ? 'Total (filtered)' : 'Total / Closing Balance'}</td><td class="n">${money(lines.reduce((t, l) => t + l.debit, 0))}</td><td class="n">${money(lines.reduce((t, l) => t + l.credit, 0))}</td><td class="n">${filtered ? '' : balTxt(data?.closing || 0)}</td><td></td></tr>
      </tbody></table></body></html>`);
    w.document.close(); w.focus(); setTimeout(() => w.print(), 300);
  };

  /* ── ui ── */
  const monthName = k => { const [y, m] = k.split('-'); return new Date(+y, +m - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }); };
  const groups = useMemo(() => {   // month by month, with the month's in / out
    const out = [];
    lines.forEach(l => { const k = String(l.date).slice(0, 7); let g = out[out.length - 1]; if (!g || g.key !== k) { g = { key: k, rows: [], inAmt: 0, outAmt: 0 }; out.push(g); } g.rows.push(l); g.inAmt += l.debit; g.outAmt += l.credit; });
    return out;
  }, [lines]);
  const typeOpts = [['', `All types (${all.filter(l => side === 'all' || (side === 'debit' ? l.debit : l.credit)).length})`], ...cats.map(([k, v]) => [k, `${SHORT[k] || k} (${v.n}) · ₹${lakh(v.amt)}`])];
  const pending = all.filter(l => l.credit && l.closed && l.closed.status === 'pending').length;
  const figures = data?.lines ? [
    ['Opening', balTxt(data.opening), '#344054', data.openingMissing?.length ? `Fetch FY ${data.openingMissing.join(', ')} for the exact opening` : `On ${fmtD(data.saved.from)}`],
    ['Debit · In', '₹' + money(data.totIn), '#067647', `${all.filter(l => l.debit).length} deposits`],
    ['Credit · Out', '₹' + money(data.totOut), '#B42318', `${all.filter(l => l.credit).length} withdrawals`],
    ['Closing', balTxt(data.closing), '#175CD3', data.check ? (data.check.diff === 0 ? 'Same as Tally ✓' : `Tally shows ${balTxt(data.check.tally)}`) : `On ${fmtD(data.saved.to)}`],
    ['Bill / JV pending', String(pending), '#B54708', 'Payments with no bill / journal booked in Tally yet'],
  ] : [];

  if (!cid) return <div style={{ padding: 40, fontFamily: F, color: '#667085' }}>Select a company first.</div>;

  return (
    <div className="ts" style={{ fontFamily: F, display: 'flex', flexDirection: 'column', gap: 10, height: '100%', minHeight: 0 }}>
      <style>{`
        .ts button, .ts select, .ts input { box-shadow: none !important; text-shadow: none !important; font-family: inherit; }
        .ts-card { background: #fff; border: 1px solid #E4E7EC; border-radius: 10px; }
        .ts-ctl { height: 32px; border: 1px solid #D0D5DD !important; border-radius: 7px !important; padding: 0 10px; font-size: 12.5px; background: #fff !important; color: #344054; outline: none; }
        .ts-ctl:focus { border-color: #84ADFF !important; }
        .ts-btn { height: 32px; padding: 0 14px; border: 1px solid #D0D5DD !important; border-radius: 7px !important; background: #fff !important; color: #344054; font-size: 12.5px; font-weight: 600; cursor: pointer; white-space: nowrap; }
        .ts-btn:hover { background: #F9FAFB !important; }
        .ts-btn.primary { background: #104f4f !important; border-color: #104f4f !important; color: #fff; }
        .ts-btn.on { background: #104f4f !important; border-color: #104f4f !important; color: #fff; }
        .ts-seg { display: inline-flex; border: 1px solid #D0D5DD; border-radius: 7px; overflow: hidden; }
        .ts-seg button { height: 30px; padding: 0 14px; border: none !important; border-radius: 0 !important; background: #fff !important; color: #475467; font-size: 12.5px; font-weight: 600; cursor: pointer; }
        .ts-seg button + button { border-left: 1px solid #D0D5DD !important; }
        .ts-seg button.on { background: #104f4f !important; color: #fff; }
        .ts-tbl { width: 100%; border-collapse: collapse; table-layout: fixed; min-width: 1240px; font-size: 12.5px; color: #101828; }
        .ts-tbl th { position: sticky; top: 0; z-index: 2; background: #F9FAFB; border-bottom: 1px solid #D0D5DD; border-right: 1px solid #EAECF0; padding: 10px 10px; font-size: 11px; font-weight: 700; color: #475467; text-transform: uppercase; letter-spacing: .3px; text-align: left; white-space: nowrap; }
        .ts-tbl td { border-bottom: 1px solid #EAECF0; border-right: 1px solid #F2F4F7; padding: 9px 9px; vertical-align: middle; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .ts-tbl th:last-child, .ts-tbl td:last-child { border-right: none; }
        .ts-tbl .n { text-align: right; font-variant-numeric: tabular-nums; }
        .ts-tbl tr.row:hover td { background: #F5FAFF; }
        .ts-tbl tr.month td { background: #F9FAFB; font-size: 11.5px; padding: 6px 10px; color: #475467; }
        .ts-tbl tr.total td { background: #F2F4F7; font-weight: 700; }
        .ts-add { visibility: hidden; border: 1px dashed #B2CCFF !important; background: #F5FAFF !important; color: #175CD3; border-radius: 6px !important; font-size: 11px; font-weight: 700; padding: 1px 8px; cursor: pointer; }
        .ts-tbl tr.row:hover .ts-add { visibility: visible; }
        .ts-edit { visibility: hidden; border: none !important; background: none !important; color: #667085; cursor: pointer; font-size: 12px; padding: 0 0 0 4px; }
        .ts-tbl tr.row:hover .ts-edit { visibility: visible; }
      `}</style>

      {/* header — row 1: title · bank · FY · actions; row 2: the figures */}
      <div className="ts-card" style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#101828', whiteSpace: 'nowrap' }}>Bank Statement</div>
          <span style={{ fontSize: 11, color: '#667085', whiteSpace: 'nowrap' }} title="Read from Tally (read-only)">from Tally{data?.saved ? ` · ${whenTxt(data.saved.savedAt || data.saved.fetchedAt)}` : ''}</span>
          <div style={{ width: 1, height: 22, background: '#EAECF0', margin: '0 4px' }} />
          <select className="ts-ctl" value={bank} onChange={e => setBank(e.target.value)} title="Bank account" style={{ minWidth: 280, fontWeight: 600 }}>
            {banksAll.map(b => { const t = (data?.banks || []).find(x => x.name === b.name); return <option key={b.name} value={b.name}>{b.name}{t?.accountNo ? `  ·  A/c ${t.accountNo}` : ''}{!b.erpBankId ? '  ·  not in ERP' : ''}</option>; })}
          </select>
          {curBank && !curBank.erpBankId && <button className="ts-btn" onClick={addErpBank} style={{ color: '#175CD3' }}>＋ Add to ERP banks</button>}
          <FyDropdown value={fy} options={FYS} onChange={setFy} neu current={curFy} />
          <div style={{ flex: 1 }} />
          <button className="ts-btn" onClick={() => navigate('/account/order-profit')}>Order Profit</button>
          <button className="ts-btn" onClick={() => navigate('/account/tally-bank')}>Match with ERP</button>
          <button className="ts-btn" onClick={fetchAll} disabled={running}>{running ? 'Fetching…' : 'Fetch from Tally'}</button>
          <button className="ts-btn primary" onClick={print} disabled={!data?.lines}>Print</button>
        </div>
        {figures.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(150px, 1fr))', borderTop: '1px solid #EAECF0', paddingTop: 10 }}>
            {figures.map(([label, value, color, sub], i) => (
              <div key={label} style={{ padding: '0 14px', borderLeft: i ? '1px solid #EAECF0' : 'none' }}>
                <div style={{ fontSize: 11, color: '#667085', fontWeight: 600 }}>{label}</div>
                <div style={{ fontSize: 16, fontWeight: 700, color, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{value}</div>
                <div style={{ fontSize: 11, color: '#98A2B3', whiteSpace: 'nowrap' }}>{sub}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {running && <div style={{ background: '#F0F9FF', border: '1px solid #B9E6FE', borderRadius: 10, padding: '7px 14px', fontSize: 12.5, color: '#026AA2', fontWeight: 600 }}>Reading from Tally, one month at a time — {job.step || 'starting…'} · {job.done.length} of {job.fys.length} FY done.</div>}
      {err && <div style={{ background: '#FFFAEB', border: '1px solid #FEDF89', borderRadius: 10, padding: '8px 14px', fontSize: 13, color: '#B54708', fontWeight: 600 }}>{err}</div>}
      {msg && <div style={{ background: '#ECFDF3', border: '1px solid #ABEFC6', borderRadius: 10, padding: '7px 14px', fontSize: 12.5, color: '#067647', fontWeight: 600 }}>{msg}</div>}

      {/* statement: filters on top of the table, then the table */}
      <div className="ts-card" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {data?.lines && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', padding: '10px 12px', borderBottom: '1px solid #EAECF0' }}>
            <div className="ts-seg">
              {[['all', 'All'], ['debit', 'Debit · In'], ['credit', 'Credit · Out']].map(([v, l]) => <button key={v} className={side === v ? 'on' : ''} onClick={() => { setSide(v); setCat(''); }}>{l}</button>)}
            </div>
            <select className="ts-ctl" value={cat} onChange={e => setCat(e.target.value)} style={{ width: 250 }}>
              {typeOpts.map(([k, label]) => <option key={k || 'all'} value={k}>{label}</option>)}
            </select>
            <button className={`ts-btn${needs ? ' on' : ''}`} onClick={() => setNeeds(n => !n)} title="Client and vendor entries without an SO or PO">Without SO / PO ({needCount})</button>
            <input className="ts-ctl" value={q} onChange={e => setQ(e.target.value)} placeholder="Search party, SO, PO, amount, remark" style={{ width: 280 }} />
            {filtered && <button className="ts-btn" onClick={() => { setSide('all'); setCat(''); setNeeds(false); setQ(''); }}>Clear</button>}
            <span style={{ fontSize: 12, color: '#667085', marginLeft: 'auto', whiteSpace: 'nowrap' }}>{lines.length} of {all.length} entries{filtered ? ' · balance hidden while filtered' : ''}</span>
          </div>
        )}
        <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
          {loading ? <div style={{ padding: 40, textAlign: 'center', color: '#98A2B3' }}>Loading statement…</div>
          : !data?.lines ? <div style={{ padding: 40, textAlign: 'center', color: '#475467' }}>{data?.error || `No Tally bank entries saved for FY ${fy} yet.`} Click <b>Fetch from Tally</b>.</div>
          : (
            <table className="ts-tbl">
              <colgroup>
                <col style={{ width: 48 }} /><col style={{ width: 104 }} /><col style={{ width: 124 }} /><col />
                <col style={{ width: 164 }} /><col style={{ width: 140 }} /><col style={{ width: 110 }} /><col style={{ width: 110 }} /><col style={{ width: 140 }} /><col style={{ width: 170 }} />
              </colgroup>
              <thead><tr>
                <th className="n">Sr No</th><th>Date</th><th>SO File No</th><th>Client / Vendor</th><th>Client Order No</th><th>PO No</th>
                <th className="n">Debit</th><th className="n">Credit</th><th className="n">Closing Balance</th><th>Remarks</th>
              </tr></thead>
              <tbody>
                <tr className="total"><td></td><td>{fmtD(data.saved.from)}</td><td colSpan={6}>Opening Balance</td><td className="n">{balTxt(data.opening)}</td><td></td></tr>
                {groups.map(g => (
                  <React.Fragment key={g.key}>
                    <tr className="month"><td colSpan={10}>
                      <b style={{ color: '#101828' }}>{monthName(g.key)}</b><span style={{ marginLeft: 10 }}>{g.rows.length} entries</span>
                      <span style={{ float: 'right', fontVariantNumeric: 'tabular-nums' }}>In <b style={{ color: '#067647' }}>{money(g.inAmt)}</b><span style={{ margin: '0 8px', color: '#D0D5DD' }}>|</span>Out <b style={{ color: '#B42318' }}>{money(g.outAmt)}</b></span>
                    </td></tr>
                    {g.rows.map(l => {
                      const transfer = l.category === 'transfer' || l.category === 'cash';
                      const vendorish = l.category === 'vendor' || l.category === 'vendor-po';
                      return (
                        <tr key={l.key} className="row">
                          <td className="n" style={{ color: '#98A2B3' }}>{l.sr}</td>
                          <td>{fmtD(l.date)}</td>
                          <td title={l.so?.orderNo || ''}>{l.so ? <span style={{ color: '#175CD3', fontWeight: 600 }}>{l.so.orderNo}</span> : !transfer && <button className="ts-add" onClick={() => setEdit(l)}>＋ SO</button>}</td>
                          <td title={l.party} style={{ fontWeight: 600 }}>{l.party || '—'}</td>
                          <td title={l.category === 'client' ? l.so?.customerPO || '' : ''}>{l.category === 'client' ? l.so?.customerPO || '' : ''}</td>
                          <td title={l.po?.poNumber || ''}>{l.po ? <span style={{ fontWeight: 600 }} title={l.poSplit ? l.poSplit.map(x => `${x.poNumber}: ₹${money(x.amount)}`).join('\n') : ''}>{l.po.poNumber}{l.poSplit && <span style={{ color: '#175CD3', fontWeight: 700 }}> +{l.poSplit.length - 1}</span>}</span> : vendorish && <button className="ts-add" onClick={() => setEdit(l)}>＋ PO</button>}</td>
                          <td className="n" style={{ color: '#067647', fontWeight: 600 }}>{l.debit ? money(l.debit) : ''}</td>
                          <td className="n" style={{ color: '#B42318', fontWeight: 600 }}>{l.credit ? money(l.credit) : ''}</td>
                          <td className="n" style={{ color: l.balance < 0 ? '#B42318' : '#344054' }}>{filtered ? '' : balTxt(l.balance)}</td>
                          <td title={l.remark || l.narration || ''} style={{ color: l.remark ? '#101828' : '#667085' }}>
                            {!transfer && <button className="ts-edit" style={{ float: 'right' }} onClick={() => setEdit(l)} title="Assign SO / PO / remark">✎</button>}
                            {l.remark || l.narration || ''}
                          </td>
                        </tr>
                      );
                    })}
                  </React.Fragment>
                ))}
                <tr className="total"><td></td><td>{fmtD(data.saved.to)}</td><td colSpan={4}>{filtered ? 'Total (filtered)' : 'Total / Closing Balance'}</td>
                  <td className="n" style={{ color: '#067647' }}>{money(lines.reduce((t, l) => t + l.debit, 0))}</td><td className="n" style={{ color: '#B42318' }}>{money(lines.reduce((t, l) => t + l.credit, 0))}</td>
                  <td className="n">{filtered ? '' : balTxt(data.closing)}</td><td></td></tr>
              </tbody>
            </table>
          )}
        </div>
      </div>

      {edit && <AssignModal line={edit} data={data} cid={cid} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); }} />}
    </div>
  );
}

/* a list you can search, not only a dropdown */
export function Picker({ items, value, onChange, placeholder, empty }) {
  const [q, setQ] = useState('');
  const t = q.trim().toLowerCase();
  const shown = items.filter(i => !t || (i.title + ' ' + (i.sub || '')).toLowerCase().includes(t)).slice(0, 150);
  let lastGroup = null;
  return (
    <div style={{ border: '1px solid #D0D5DD', borderRadius: 8, overflow: 'hidden' }}>
      <input value={q} onChange={e => setQ(e.target.value)} placeholder={placeholder} autoFocus={false}
        style={{ width: '100%', height: 34, border: 'none', borderBottom: `1px solid ${BD}`, padding: '0 10px', fontFamily: F, fontSize: 12.5, boxSizing: 'border-box', outline: 'none' }} />
      <div style={{ maxHeight: 168, overflow: 'auto' }}>
        <div onClick={() => onChange('')} style={{ padding: '6px 10px', fontSize: 12, cursor: 'pointer', background: !value ? '#EFF8FF' : '#fff', color: '#475467', fontWeight: !value ? 800 : 500 }}>{empty}</div>
        {shown.map(i => {
          const head = i.group && i.group !== lastGroup ? (lastGroup = i.group) : null;
          return (
            <React.Fragment key={i.id}>
              {head && <div style={{ padding: '5px 10px', fontSize: 10, fontWeight: 800, color: '#667085', textTransform: 'uppercase', background: '#F9FAFB', borderTop: `1px solid ${BD}` }}>{head}</div>}
              <div onClick={() => onChange(i.id)} style={{ padding: '6px 10px', fontSize: 12.5, cursor: 'pointer', borderTop: '1px solid #F2F4F7', background: String(value) === String(i.id) ? '#EFF8FF' : '#fff' }}>
                <b style={{ color: String(value) === String(i.id) ? '#175CD3' : '#101828' }}>{String(value) === String(i.id) ? '✓ ' : ''}{i.title}</b>
                {i.sub && <span style={{ color: '#667085', fontSize: 11.5 }}> · {i.sub}</span>}
              </div>
            </React.Fragment>
          );
        })}
        {shown.length === 0 && <div style={{ padding: '8px 10px', fontSize: 12, color: '#98A2B3' }}>Nothing matches “{q}”.</div>}
      </div>
    </div>
  );
}

/* type / SO / PO / remark of one statement line. One list shows this party's POs and Order IDs
   together: pick a PO and its Order ID (SO) + client order no. come with it; pick an Order ID alone
   for a receipt or a payment without PO. All POs / orders stay searchable below. */
const normName = s => String(s || '').toLowerCase().replace(/^\s*m\s*\/?\s*s\.?\s*/, '').replace(/\b(pvt|private|ltd|limited|co|company|the)\b/g, '').replace(/[^a-z0-9]/g, '');
export function AssignModal({ line, data, cid, onClose, onSaved }) {
  const [category, setCategory] = useState(line.category || 'other');
  const [soId, setSoId] = useState(line.so ? line.so.orderId : '');
  const [poId, setPoId] = useState(line.po ? line.po.orderId : '');
  const [noPo, setNoPo] = useState(!line.catAuto && line.category === 'vendor' && !line.po);   // only when you said so before
  const [remark, setRemark] = useState(line.remark || '');
  const [busy, setBusy] = useState(false);
  const [e, setE] = useState('');
  const pl = line.partyLink;
  const pName = normName(pl?.name || line.party);
  const near = n => { const x = normName(n); return !!x && !!pName && (x === pName || (x.length > 5 && pName.length > 5 && (x.includes(pName) || pName.includes(x)))); };
  const vendorish = category === 'vendor' || category === 'vendor-po';
  const soById = useMemo(() => Object.fromEntries((data?.salesOrders || []).map(o => [o.orderId, o])), [data]);
  const poById = useMemo(() => Object.fromEntries((data?.purchaseOrders || []).map(p => [p.orderId, p])), [data]);

  const items = useMemo(() => {
    const sos = (data?.salesOrders || []).slice().sort((a, b) => String(b.orderDate).localeCompare(String(a.orderDate)));
    const pos = (data?.purchaseOrders || []).slice().sort((a, b) => String(b.poDate).localeCompare(String(a.poDate)));
    const myPo = p => (pl?.kind === 'vendor' && p.vendorId === String(pl.id)) || near(p.vendorName);
    const mySo = o => (pl?.kind === 'client' && o.customerCode === String(pl.id)) || near(o.customerName);
    const poItem = (p, group) => { const o = soById[p.linkedSalesOrderId]; return { id: 'po:' + p.orderId, group,
      title: `PO ${p.poNumber}`, sub: [o ? `Order ${o.orderNo}` : 'no order linked', o?.customerPO && `client order ${o.customerPO}`, group.startsWith('All') && p.vendorName, fmtD(p.poDate)].filter(Boolean).join(' · ') }; };
    const soItem = (o, group) => ({ id: 'so:' + o.orderId, group, title: `Order ${o.orderNo}`,
      sub: [o.customerName, o.customerPO && `client order ${o.customerPO}`, fmtD(o.orderDate)].filter(Boolean).join(' · ') });
    const head = `${pl?.name || line.party} — POs & orders`;
    const mineP = pos.filter(myPo), mineS = sos.filter(mySo);
    return [
      ...mineP.map(p => poItem(p, head)), ...mineS.map(o => soItem(o, head)),
      ...pos.filter(p => !mineP.includes(p)).map(p => poItem(p, 'All purchase orders')),
      ...sos.filter(o => !mineS.includes(o)).map(o => soItem(o, 'All sales orders')),
    ];
  }, [data, pl, line.party, soById]);   // eslint-disable-line react-hooks/exhaustive-deps
  const mineCount = items.filter(i => !i.group.startsWith('All')).length;

  const value = poId ? 'po:' + poId : soId ? 'so:' + soId : '';
  const pick = v => {
    if (!v) { setSoId(''); setPoId(''); return; }
    const [kind, id] = v.split(':');
    if (kind === 'po') {
      setPoId(id); setNoPo(false);
      const p = poById[id]; setSoId(p?.linkedSalesOrderId || '');   // the PO's own order
      if (category === 'vendor' || !vendorish) setCategory(c => (c === 'client' ? c : 'vendor-po'));
    } else { setSoId(id); setPoId(''); }
  };
  const save = async () => {
    setBusy(true); setE('');
    const auto = line.catAuto ? line.category : null;
    const cat = vendorish ? (poId && !noPo ? 'vendor-po' : 'vendor') : category;
    try {
      await axios.post('/api/tally-reports/bank/assign', { companyId: cid, key: line.key, soId, poId: noPo ? '' : poId, remark: remark.trim(),
        category: auto && cat === auto ? '' : cat });   // same as the automatic type → no override
      onSaved();
    } catch (x) { setE(x.response?.data?.error || x.message); setBusy(false); }
  };
  const lbl = { fontSize: 11, fontWeight: 800, color: '#475467', textTransform: 'uppercase', margin: '12px 0 5px', display: 'flex', alignItems: 'center', gap: 8 };
  const cats = Object.entries(data?.categories || SHORT).filter(([k]) => k !== 'transfer' && k !== 'cash');
  const so = soById[soId], po = poById[poId];
  const chosen = (label, val, clear) => (
    <div style={{ flex: '1 1 150px', padding: '6px 10px', borderRadius: 8, background: val ? '#EFF8FF' : '#F9FAFB', border: `1px solid ${val ? '#B2CCFF' : BD}` }}>
      <div style={{ fontSize: 10, fontWeight: 800, color: '#667085', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 12.5, fontWeight: 800, color: val ? '#175CD3' : '#98A2B3', display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{val || '—'}</span>
        {val && clear && <button onClick={clear} title="Clear" style={{ border: 'none', background: 'none', color: '#98A2B3', cursor: 'pointer', fontSize: 12, padding: 0 }}>✕</button>}
      </div>
    </div>
  );
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(16,24,40,0.5)', zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onClose}>
      <div onClick={ev => ev.stopPropagation()} style={{ background: '#fff', borderRadius: 14, width: 'min(640px, 96vw)', maxHeight: '92vh', overflow: 'auto', padding: '16px 18px', fontFamily: F }}>
        <div style={{ fontSize: 15, fontWeight: 800 }}>{line.party}</div>
        <div style={{ fontSize: 12, color: '#667085', marginTop: 2 }}>{fmtD(line.date)} · {line.debit ? `Debit (in) ₹${money(line.debit)}` : `Credit (out) ₹${money(line.credit)}`} · {line.vchType} {line.number}{line.partyGroup ? ` · Tally group: ${line.partyGroup}` : ''}</div>
        {line.src === 'erp' && <div style={{ fontSize: 11.5, color: '#067647', marginTop: 6 }}>SO / PO now come from the matched ERP entry #{line.erpId}. A choice here overrides them on this statement.</div>}

        <div style={lbl}>Type</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {cats.map(([k, label]) => { const on = vendorish ? k === (poId && !noPo ? 'vendor-po' : 'vendor') : category === k; const [bg, fg] = CAT_COLOR[k] || CAT_COLOR.other; return (
            <button key={k} onClick={() => { setCategory(k); if (k === 'vendor') { setNoPo(true); setPoId(''); } if (k === 'vendor-po') setNoPo(false); }}
              style={{ height: 28, padding: '0 10px', borderRadius: 20, cursor: 'pointer', fontFamily: F, fontSize: 11.5, fontWeight: 800, border: `1.5px solid ${on ? fg : BD}`, background: on ? fg : bg, color: on ? '#fff' : fg }}>{label}</button>
          ); })}
        </div>

        <div style={lbl}>PO / Order ID {mineCount > 0
          ? <span style={{ fontWeight: 600, textTransform: 'none', color: '#667085' }}>{mineCount} for {pl?.name || line.party} listed first — pick one</span>
          : <span style={{ fontWeight: 600, textTransform: 'none', color: '#B54708' }}>none found for this party — search all below</span>}</div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
          {chosen('Order ID — SO File No', so?.orderNo, () => { setSoId(''); setPoId(''); })}
          {chosen('Client Order No', so?.customerPO)}
          {chosen('PO No', noPo ? 'without PO' : po?.poNumber, () => setPoId(''))}
        </div>
        <Picker items={items} value={value} onChange={pick} placeholder="Search PO no., order no., client order no., party…" empty="— none —" />
        {vendorish && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, marginTop: 8, cursor: 'pointer' }}>
            <input type="checkbox" checked={noPo} onChange={ev => { setNoPo(ev.target.checked); if (ev.target.checked) { setPoId(''); setCategory('vendor'); } }} /> Payment without PO (advance / other) — an Order ID can still be chosen
          </label>
        )}

        <div style={lbl}>Remarks</div>
        <input value={remark} onChange={ev => setRemark(ev.target.value)} placeholder={line.narration || 'e.g. milk & tea for office, GST of Sept, advance for cabin…'}
          style={{ width: '100%', height: 34, border: '1px solid #D0D5DD', borderRadius: 8, padding: '0 10px', fontFamily: F, fontSize: 12.5, boxSizing: 'border-box' }} />
        {e && <div style={{ fontSize: 12, color: '#B42318', marginTop: 8 }}>{e}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
          <button onClick={onClose} style={{ height: 36, padding: '0 16px', border: '1px solid #D0D5DD', borderRadius: 8, background: '#fff', cursor: 'pointer', fontFamily: F, fontWeight: 700 }}>Cancel</button>
          <button disabled={busy} onClick={save} style={{ height: 36, padding: '0 18px', border: 'none', borderRadius: 8, background: '#079455', color: '#fff', cursor: 'pointer', fontFamily: F, fontWeight: 800 }}>{busy ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </div>
  );
}
