/* Beta — Books & Reports: Ledger, Chart of accounts, Trial balance, Profit & Loss, Balance sheet,
 * Cash / bank book (+ bank reconciliation), Ageing (receivables / payables) and TDS.
 * All read /api/books (the posted documents as double-entry lines) — see BetaBooksLib. */
import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useCompany } from '../../context/CompanyContext';
import { useAuth } from '../../context/AuthContext';
import { can } from '../../utils/permissions';
import { Svg } from '../../components/ui/Icon';
import { CSS as SALES_CSS } from './BetaSales';
import { PX_CSS } from './BetaPurchaseParts';
import { ACC_CSS, words, hit } from './BetaAccKit';
import {
  BK_CSS, useBooks, fyList, fyName, fyRange, fyStartYear, today, dmy, amt, amtZ, dc, r2,
  balances, groupRows, profitLoss, balanceSheet, statement, voucherLines, ageing, BUCKETS, tdsLines, printReport, excel, inGroup,
} from './BetaBooksLib';

const TITLES = { ledger: 'Ledger', chart: 'Chart of Accounts', trial: 'Trial Balance', pl: 'Profit & Loss', bs: 'Balance Sheet', cash: 'Cash / Bank Book', ageing: 'Ageing', tds: 'TDS' };
const KIND = { client: 'Client', vendor: 'Vendor', bank: 'Bank', cash: 'Cash', tds: 'TDS', asset: 'Fixed asset', employee: 'Employee', virtual: 'System', pl: 'System' };

export default function BetaBooks({ view = 'ledger' }) {
  const { selectedCompany } = useCompany() || {};
  const { user } = useAuth() || {};
  const companyId = selectedCompany?.companyId;
  const [reload, setReload] = useState(0);
  const { books, err } = useBooks(companyId, reload);
  const [slot, setSlot] = useState(null);
  const thisFy = fyStartYear(today());
  const [fy, setFy] = useState(thisFy);
  const [from, setFrom] = useState(fyRange(thisFy).from);
  const endOf = y => { const e = fyRange(y).to; return e > today() ? today() : e; };   // the current year runs to today
  const [to, setTo] = useState(endOf(thisFy));
  const pickFy = y => { setFy(y); if (y === '') return; setFrom(fyRange(+y).from); setTo(endOf(+y)); };
  const asOnly = view === 'bs' || view === 'ageing' || view === 'chart';
  const fys = useMemo(() => (books ? fyList(books) : [thisFy]), [books, thisFy]);
  const pend = Object.entries(books?.pending || {});
  const ctx = { books, from, to, slot, company: selectedCompany, user, companyId, refresh: () => setReload(x => x + 1), period: asOnly ? `As on ${dmy(to)}` : `${dmy(from)} to ${dmy(to)}` };
  const Body = { ledger: LedgerView, chart: ChartView, trial: TrialView, pl: PLView, bs: BSView, cash: CashView, ageing: AgeingView, tds: TdsView }[view] || LedgerView;
  return (
    <div className="sb">
      <style>{SALES_CSS + PX_CSS + ACC_CSS + BK_CSS}</style>
      <div className="sb-tabs" role="tablist">
        <button type="button" role="tab" aria-selected="true" className="sb-tab on">{TITLES[view]}</button>
        <div className="sb-slot" ref={setSlot} />
      </div>
      {slot && createPortal(<>
        <select className="sb-search" style={{ width: 112 }} value={fy} onChange={e => pickFy(e.target.value === '' ? '' : +e.target.value)} aria-label="Financial year">
          {fys.map(y => <option key={y} value={y}>{fyName(y)}</option>)}<option value="">Custom dates</option>
        </select>
        {!asOnly && <input type="date" className="sb-search" style={{ width: 136 }} value={from} max={to} onChange={e => { setFy(''); setFrom(e.target.value); }} aria-label="From date" />}
        <input type="date" className="sb-search" style={{ width: 136 }} value={to} min={asOnly ? undefined : from} onChange={e => { setFy(''); setTo(e.target.value); }} aria-label={asOnly ? 'As on date' : 'To date'} title={asOnly ? 'As on' : 'To'} />
      </>, slot)}
      {err && <div className="bk-info">{err}</div>}
      {pend.length > 0 && view !== 'chart' && <div className="bk-info">Not in the books until approved / posted: {pend.map(([k, v]) => `${v} ${k}`).join(' · ')}</div>}
      {(books?.byLed['Bank — not selected'] || []).length > 0 && view !== 'chart' && <div className="bk-info">{books.byLed['Bank — not selected'].length} receipt / payment entr{books.byLed['Bank — not selected'].length === 1 ? 'y has' : 'ies have'} a bank mode (NEFT…) but no bank picked — they sit in “Bank — not selected”. Open them in Payment / Receipt and pick the bank.</div>}
      {!books ? <div className="sb-empty" style={{ padding: 30 }}>Loading the books…</div> : <Body {...ctx} />}
    </div>
  );
}

/* toolbar buttons (Print / Excel) placed after the period controls */
function Tools({ slot, children }) { return slot ? createPortal(<div className="sb-tools">{children}</div>, slot) : null; }
const PrintBtn = ({ onClick, label = 'Print' }) => <button type="button" className="sb-tbtn" onClick={onClick}><Svg name="file" size={13} />{label}</button>;
const XlBtn = ({ onClick }) => <button type="button" className="sb-tbtn" onClick={onClick}><Svg name="chart" size={13} />Excel</button>;
const pad = d => ({ paddingLeft: 10 + d * 16 });

/* ───────────────────────── Ledger (all ledgers → one ledger's statement) ───────────────────────── */
function LedgerView({ books, from, to, slot, company, user, period }) {
  const navigate = useNavigate();
  const { search, pathname } = useLocation();
  const led = new URLSearchParams(search).get('l') || '';
  const open = name => navigate(`${pathname}?l=${encodeURIComponent(name)}`);
  if (led && books.L[led]) return <Statement books={books} name={led} from={from} to={to} slot={slot} company={company} user={user} period={period} back={() => navigate(pathname)} />;
  return <LedgerIndex books={books} from={from} to={to} slot={slot} company={company} user={user} period={period} open={open} />;
}

function LedgerIndex({ books, from, to, slot, company, user, period, open }) {
  const [q, setQ] = useState('');
  const [grp, setGrp] = useState('');
  const [sel, setSel] = useState('');
  const [hideZero, setHideZero] = useState(true);
  const bal = useMemo(() => balances(books, from, to), [books, from, to]);
  const w = words(q);
  const list = Object.values(bal).filter(b => (!grp || inGroup(books, b.name, grp)) && (!hideZero || b.opening || b.dr || b.cr) && hit(`${b.name} ${books.g[b.group]?.name || ''} ${books.L[b.name]?.gstin || ''}`, w))
    .sort((a, b) => a.name.localeCompare(b.name));
  const tot = list.reduce((t, b) => ({ dr: t.dr + b.dr, cr: t.cr + b.cr }), { dr: 0, cr: 0 });
  const groupOpts = Object.values(books.g).sort((a, b) => a.name.localeCompare(b.name));
  const rows = list.map(b => [b.name, books.g[b.group]?.name || '', dc(b.opening), amtZ(b.dr), amtZ(b.cr), dc(b.closing)]);
  const heads = [['Ledger', ''], ['Group', '150px'], ['Opening', '100px', 'r'], ['Debit', '95px', 'r'], ['Credit', '95px', 'r'], ['Closing', '100px', 'r']];
  return (
    <>
      {slot && createPortal(<>
        <input className="sb-search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search ledger, group, GSTIN…" aria-label="Search ledgers" />
        <select className="sb-search" style={{ width: 170 }} value={grp} onChange={e => setGrp(e.target.value)} aria-label="Group"><option value="">All groups</option>{groupOpts.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}</select>
      </>, slot)}
      <Tools slot={slot}>
        <span className="sb-picked">{sel ? <b>{sel}</b> : 'Select a ledger'}</span>
        <button type="button" className="sb-tbtn" disabled={!sel} onClick={() => open(sel)}><Svg name="eye" size={13} />Open</button>
        <PrintBtn label="Print list" onClick={() => printReport({ title: 'LEDGER BALANCES', kv: [['Period', period], ['Ledgers', String(list.length)]], company, user, heads, rows: [...rows.map(c => ({ c })), { cls: 'tot', c: ['TOTAL', '', '', amt(tot.dr), amt(tot.cr), ''] }] })} />
        <XlBtn onClick={() => excel('Ledgers', [{ name: 'Ledgers', rows: [heads.map(h => h[0]), ...list.map(b => [b.name, books.g[b.group]?.name || '', r2(b.opening), b.dr, b.cr, r2(b.closing)])], widths: [44, 26, 14, 14, 14, 14] }])} />
      </Tools>
      <div className="bk-bar">
        <div className="ac-sum"><div>Ledgers<b>{list.length}</b></div><div>Debit ₹<b>{amt(tot.dr)}</b></div><div>Credit ₹<b>{amt(tot.cr)}</b></div></div>
        <label><input type="checkbox" checked={hideZero} onChange={e => setHideZero(e.target.checked)} />Hide ledgers with no entries</label>
      </div>
      <div className="bk-wrap">
        <table className="bk">
          <colgroup><col /><col style={{ width: 200 }} /><col style={{ width: 140 }} /><col style={{ width: 130 }} /><col style={{ width: 130 }} /><col style={{ width: 140 }} /></colgroup>
          <thead><tr><th>Ledger</th><th>Group</th><th className="r">Opening</th><th className="r">Debit</th><th className="r">Credit</th><th className="r">Closing</th></tr></thead>
          <tbody>
            {!list.length ? <tr><td colSpan={6} className="sb-empty">Nothing matches.</td></tr> : list.map(b => (
              <tr key={b.name} className={`l${sel === b.name ? ' sel' : ''}`} onClick={() => setSel(b.name)} onDoubleClick={() => open(b.name)} title="Double-click to open the ledger">
                <td><b>{b.name}</b>{books.L[b.name]?.kind && KIND[books.L[b.name].kind] && <span className="mut"> · {KIND[books.L[b.name].kind]}</span>}</td>
                <td>{books.g[b.group]?.name}</td><td className="r">{dc(b.opening)}</td><td className="r">{amtZ(b.dr)}</td><td className="r">{amtZ(b.cr)}</td><td className="r"><b>{dc(b.closing)}</b></td>
              </tr>))}
          </tbody>
          <tfoot><tr><td>Total — {list.length} ledgers</td><td /><td /><td className="r">{amt(tot.dr)}</td><td className="r">{amt(tot.cr)}</td><td /></tr></tfoot>
        </table>
      </div>
    </>
  );
}

function Statement({ books, name, from, to, slot, company, user, period, back }) {
  const [openNo, setOpenNo] = useState('');
  const st = useMemo(() => statement(books, name, from, to), [books, name, from, to]);
  const L = books.L[name] || {};
  const heads = [['Date', '62px'], ['Type', '62px'], ['Vch No.', '90px'], ['Particulars', ''], ['Debit', '82px', 'r'], ['Credit', '82px', 'r'], ['Balance', '96px', 'r']];
  const printRows = [{ cls: 'g', c: ['', '', '', 'Opening balance', '', '', dc(st.opening)] },
    ...st.lines.map(p => ({ c: [dmy(p.date), p.vt, p.no, `${p.other || ''}${p.narr ? ` — ${p.narr}` : ''}`, amtZ(p.dr), amtZ(p.cr), dc(p.run)] })),
    { cls: 'tot', c: ['', '', '', 'Total / Closing balance', amt(st.dr), amt(st.cr), dc(st.closing)] }];
  return (
    <>
      <Tools slot={slot}>
        <button type="button" className="sb-tbtn" onClick={back}><Svg name="arrow" size={13} />All ledgers</button>
        <PrintBtn onClick={() => printReport({ title: 'LEDGER ACCOUNT', kv: [['Ledger', name], ['Group', books.g[L.group]?.name || ''], ['Period', period]], company, user, heads, rows: printRows, note: L.gstin ? `GSTIN: ${L.gstin}` : '' })} />
        <XlBtn onClick={() => excel(`Ledger_${name.slice(0, 30)}`, [{ name: 'Ledger', widths: [12, 12, 16, 40, 50, 14, 14, 16], rows: [[name], [period], [], ['Date', 'Type', 'Vch No.', 'Particulars', 'Narration', 'Debit', 'Credit', 'Balance'],
          ['', '', '', 'Opening balance', '', '', '', dc(st.opening)], ...st.lines.map(p => [dmy(p.date), p.vt, p.no, p.other, p.narr, p.dr || '', p.cr || '', dc(p.run)]), ['', '', '', 'Total', '', st.dr, st.cr, dc(st.closing)]] }])} />
      </Tools>
      <div className="bk-bar">
        <div className="ac-sum">
          <div>Ledger<b style={{ maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</b></div>
          <div>Group<b>{books.g[L.group]?.name || '—'}</b></div>
          {L.gstin && <div>GSTIN<b>{L.gstin}</b></div>}
          <div>Opening<b>{dc(st.opening) || '0.00'}</b></div><div>Debit ₹<b>{amt(st.dr)}</b></div><div>Credit ₹<b>{amt(st.cr)}</b></div>
          <div>Closing<b style={{ color: st.closing < 0 ? '#B42318' : '#03444f' }}>{dc(st.closing) || '0.00'}</b></div>
        </div>
      </div>
      <div className="bk-wrap">
        <table className="bk">
          <colgroup><col style={{ width: 96 }} /><col style={{ width: 96 }} /><col style={{ width: 150 }} /><col style={{ width: 240 }} /><col /><col style={{ width: 120 }} /><col style={{ width: 120 }} /><col style={{ width: 140 }} /></colgroup>
          <thead><tr><th>Date</th><th>Type</th><th>Vch No.</th><th>Particulars</th><th>Narration</th><th className="r">Debit</th><th className="r">Credit</th><th className="r">Balance</th></tr></thead>
          <tbody>
            <tr className="g"><td /><td /><td /><td>Opening balance</td><td /><td /><td /><td className="r">{dc(st.opening)}</td></tr>
            {st.lines.map((p, i) => {
              const k = `${p.src}|${p.no}|${i}`;
              return (
                <React.Fragment key={k}>
                  <tr className={`l${openNo === k ? ' sel' : ''}`} onClick={() => setOpenNo(openNo === k ? '' : k)} title="Click to see the full voucher">
                    <td>{dmy(p.date)}</td><td>{p.vt}</td><td><b>{p.no}</b></td><td title={p.other}>{p.other}</td><td title={p.narr}>{p.narr}</td>
                    <td className="r">{amtZ(p.dr)}</td><td className="r">{amtZ(p.cr)}</td><td className="r">{dc(p.run)}</td>
                  </tr>
                  {openNo === k && voucherLines(books, p).map((x, j) => <tr key={j} className="sub"><td /><td /><td>{x.ref}</td><td style={pad(1)}>{x.dr ? 'Dr' : 'Cr'} &nbsp;{x.led}</td><td /><td className="r">{amtZ(x.dr)}</td><td className="r">{amtZ(x.cr)}</td><td /></tr>)}
                </React.Fragment>
              );
            })}
            {!st.lines.length && <tr><td colSpan={8} className="sb-empty">No entries in this period.</td></tr>}
          </tbody>
          <tfoot><tr><td /><td /><td>{st.lines.length} entr{st.lines.length === 1 ? 'y' : 'ies'}</td><td>Closing balance</td><td /><td className="r">{amt(st.dr)}</td><td className="r">{amt(st.cr)}</td><td className="r">{dc(st.closing)}</td></tr></tfoot>
        </table>
      </div>
    </>
  );
}

/* ───────────────────────── Chart of accounts ───────────────────────── */
function ChartView({ books, to, slot, company, user, companyId, refresh }) {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [sel, setSel] = useState('');
  const [form, setForm] = useState(null);   // { mode:'ledger'|'group'|'move', ... }
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const canEdit = can(user, 'accLedger', 'create') || can(user, 'accLedger', 'edit') || can(user, 'accJournal', 'create');
  const bal = useMemo(() => balances(books, '', to), [books, to]);
  const w = words(q);
  const lines = name => (books.byLed[name] || []).length;
  const rows = groupRows(books, bal, { withLedgers: true, keep: b => !w.length || hit(`${b.name} ${books.L[b.name]?.gstin || ''}`, w) });
  // the chart lists every ledger, even unused ones: groupRows skips empty ones, so add them back
  const allRows = useMemo(() => {
    const out = [];
    const walk = (id, depth) => {
      const g = books.g[id];
      const leds = Object.values(books.L).filter(l => l.group === id && (!w.length || hit(`${l.name} ${l.gstin || ''}`, w))).sort((a, b) => a.name.localeCompare(b.name));
      const start = out.length;
      out.push({ type: 'g', id, name: g.name, depth });
      g.kids.forEach(k => walk(k, depth + 1));
      leds.forEach(l => out.push({ type: 'l', id: l.name, name: l.name, depth: depth + 1, closing: bal[l.name]?.closing || 0 }));
      if (w.length && out.length === start + 1) out.pop();
    };
    books.roots.forEach(id => walk(id, 0));
    return out;
  }, [books, bal, w.join(' ')]);   // eslint-disable-line react-hooks/exhaustive-deps
  const gTot = useMemo(() => Object.fromEntries(rows.filter(r => r.type === 'g').map(r => [r.id, r.closing])), [rows]);
  const nLed = Object.keys(books.L).length, nSus = Object.values(books.L).filter(l => l.group === 'suspense' && lines(l.name)).length;
  const groupOpts = Object.values(books.g).filter(g => g.id !== 'suspense').sort((a, b) => a.name.localeCompare(b.name));
  const selL = books.L[sel];
  const save = async () => {
    setBusy(true); setMsg('');
    try {
      if (form.mode === 'group') {
        if (!form.name.trim()) throw new Error('Type the group name.');
        const parent = books.g[form.parent];
        await axios.post('/api/ledger/groups', { name: form.name.trim(), nature: parent?.nature || 'Dr', parent: form.parent }, { params: { companyId } });
        setMsg(`Group “${form.name.trim()}” added under ${parent?.name}.`);
      } else {
        if (!form.name.trim() || !form.groupId) throw new Error('Type the ledger name and pick a group.');
        await axios.post('/api/books/ledger', { name: form.name.trim(), groupId: form.groupId, onlyNew: form.mode === 'ledger', openingBalance: form.opening === '' ? undefined : form.opening, openingBalanceNature: form.nature, gstin: form.gstin }, { params: { companyId } });
        setMsg(form.mode === 'ledger' ? `Ledger “${form.name.trim()}” added.` : `“${form.name.trim()}” is now under ${books.g[form.groupId]?.name}.`);
      }
      setForm(null); refresh();
    } catch (e) { setMsg(e.response?.data?.error || e.message || 'Could not save.'); } finally { setBusy(false); }
  };
  const fset = k => e => setForm(f => ({ ...f, [k]: e.target.value }));
  return (
    <>
      {slot && createPortal(<input className="sb-search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search ledger, GSTIN…" aria-label="Search chart of accounts" />, slot)}
      <Tools slot={slot}>
        <span className="sb-picked">{sel ? <b>{sel}</b> : 'Select a ledger'}</span>
        <button type="button" className="sb-tbtn" disabled={!sel} onClick={() => navigate(`/beta/books/ledger?l=${encodeURIComponent(sel)}`)}><Svg name="eye" size={13} />Ledger</button>
        {canEdit && <button type="button" className="sb-tbtn" disabled={!selL || ['virtual', 'pl'].includes(selL.kind)} onClick={() => setForm({ mode: 'move', name: sel, groupId: selL.group === 'suspense' ? '' : selL.group, opening: '', nature: '' })}><Svg name="settings" size={13} />Set group</button>}
        {canEdit && <button type="button" className="sb-tbtn" onClick={() => setForm({ mode: 'ledger', name: '', groupId: '', opening: '', nature: '', gstin: '' })}><Svg name="plus" size={13} />Add ledger</button>}
        {canEdit && <button type="button" className="sb-tbtn" onClick={() => setForm({ mode: 'group', name: '', parent: 'indirect-exp' })}><Svg name="plus" size={13} />Add group</button>}
        <PrintBtn onClick={() => printReport({ title: 'CHART OF ACCOUNTS', kv: [['As on', dmy(to)], ['Ledgers', String(nLed)]], company, user, heads: [['Group / Ledger', ''], ['Type', '80px'], ['GSTIN', '110px'], ['Balance', '100px', 'r']],
          rows: allRows.map(r => (r.type === 'g' ? { cls: r.depth ? 'g' : 'g1', pad: r.depth, c: [r.name, '', '', dc(gTot[r.id])] } : { pad: r.depth, c: [r.name, KIND[books.L[r.name]?.kind] || 'Ledger', books.L[r.name]?.gstin || '', dc(r.closing)] })) })} />
      </Tools>
      {msg && <div className={`bk-info${/added|now under/.test(msg) ? ' ok' : ''}`}>{msg}</div>}
      {nSus > 0 && <div className="bk-info">{nSus} ledger{nSus === 1 ? '' : 's'} used in entries but not in a group yet (Suspense). Select one → “Set group”.</div>}
      {form && (
        <div className="bk-form" role="form" aria-label={form.mode === 'group' ? 'Add group' : 'Ledger'}>
          {form.mode === 'group' ? <>
            <label>Group name<input value={form.name} onChange={fset('name')} autoFocus aria-label="Group name" /></label>
            <label>Under<select value={form.parent} onChange={fset('parent')} aria-label="Parent group">{groupOpts.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}</select></label>
          </> : <>
            <label>Ledger name<input value={form.name} onChange={fset('name')} readOnly={form.mode === 'move'} autoFocus={form.mode === 'ledger'} aria-label="Ledger name" /></label>
            <label>Group<select value={form.groupId} onChange={fset('groupId')} autoFocus={form.mode === 'move'} aria-label="Ledger group"><option value="">Pick a group…</option>{groupOpts.map(g => <option key={g.id} value={g.id}>{g.name}{g.parent && books.g[g.parent] ? ` (${books.g[g.parent].name})` : ''}</option>)}</select></label>
            <label>Opening balance ₹<input value={form.opening} onChange={e => setForm(f => ({ ...f, opening: e.target.value.replace(/[^\d.]/g, '') }))} placeholder={form.mode === 'move' ? 'unchanged' : '0'} inputMode="decimal" aria-label="Opening balance" /></label>
            <label>Dr / Cr<select value={form.nature} onChange={fset('nature')} aria-label="Opening Dr or Cr"><option value="">As the group</option><option value="Dr">Dr</option><option value="Cr">Cr</option></select></label>
            {form.mode === 'ledger' && <label>GSTIN (optional)<input value={form.gstin} onChange={e => setForm(f => ({ ...f, gstin: e.target.value.toUpperCase() }))} aria-label="GSTIN" /></label>}
          </>}
          <div className="act"><button type="button" className="sb-abtn" onClick={() => setForm(null)} disabled={busy}>Cancel</button><button type="button" className="sb-abtn pri" style={{ background: '#03444f', color: '#fff' }} onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button></div>
        </div>
      )}
      <div className="bk-wrap">
        <table className="bk">
          <colgroup><col /><col style={{ width: 120 }} /><col style={{ width: 170 }} /><col style={{ width: 90 }} /><col style={{ width: 150 }} /></colgroup>
          <thead><tr><th>Group / Ledger</th><th>Type</th><th>GSTIN</th><th className="r">Entries</th><th className="r">Balance</th></tr></thead>
          <tbody>
            {allRows.map(r => (r.type === 'g'
              ? <tr key={`g-${r.id}`} className={r.depth ? 'g' : 'g0'}><td style={pad(r.depth)}>{r.name}</td><td>{r.depth ? 'Sub-group' : 'Group'}</td><td /><td /><td className="r">{dc(gTot[r.id])}</td></tr>
              : <tr key={`l-${r.id}`} className={`l${sel === r.id ? ' sel' : ''}`} onClick={() => setSel(r.id)} onDoubleClick={() => navigate(`/beta/books/ledger?l=${encodeURIComponent(r.id)}`)}>
                <td style={pad(r.depth)}>{r.name}</td><td>{KIND[books.L[r.id]?.kind] || 'Ledger'}</td><td>{books.L[r.id]?.gstin || ''}</td><td className="r">{lines(r.id) || ''}</td><td className="r">{dc(r.closing)}</td></tr>))}
          </tbody>
          <tfoot><tr><td>{nLed} ledgers · {Object.keys(books.g).length} groups</td><td /><td /><td /><td /></tr></tfoot>
        </table>
      </div>
    </>
  );
}

/* ───────────────────────── Trial balance ───────────────────────── */
function TrialView({ books, from, to, slot, company, user, period }) {
  const navigate = useNavigate();
  const [det, setDet] = useState(false);
  const bal = useMemo(() => balances(books, from, to), [books, from, to]);
  const rows = useMemo(() => groupRows(books, bal, { withLedgers: det }), [books, bal, det]);
  const roots = rows.filter(r => r.type === 'g' && r.depth === 0);
  const T = roots.reduce((t, r) => ({ op: t.op + r.opening, dr: t.dr + r.dr, cr: t.cr + r.cr, cd: t.cd + Math.max(0, r.closing), cc: t.cc + Math.max(0, -r.closing) }), { op: 0, dr: 0, cr: 0, cd: 0, cc: 0 });
  const diff = r2(T.cd - T.cc);
  const cells = r => [dc(r.opening), amtZ(r.dr), amtZ(r.cr), r.closing > 0 ? amt(r.closing) : '', r.closing < 0 ? amt(-r.closing) : ''];
  const heads = [['Particulars', ''], ['Opening', '92px', 'r'], ['Debit', '86px', 'r'], ['Credit', '86px', 'r'], ['Closing Dr', '88px', 'r'], ['Closing Cr', '88px', 'r']];
  return (
    <>
      <Tools slot={slot}>
        <PrintBtn onClick={() => printReport({ title: 'TRIAL BALANCE', kv: [['Period', period], ['Detail', det ? 'Group + ledgers' : 'Groups']], company, user, heads,
          rows: [...rows.map(r => ({ cls: r.type === 'g' ? (r.depth ? 'g' : 'g1') : '', pad: r.depth, c: [r.name, ...cells(r)] })), { cls: 'tot', c: ['GRAND TOTAL', '', amt(T.dr), amt(T.cr), amt(T.cd), amt(T.cc)] }] })} />
        <XlBtn onClick={() => excel('Trial_Balance', [{ name: 'Trial balance', widths: [50, 16, 16, 16, 16, 16], rows: [['Trial balance', period], [], heads.map(h => h[0]),
          ...rows.map(r => [`${'   '.repeat(r.depth)}${r.name}`, dc(r.opening), r.dr || '', r.cr || '', r.closing > 0 ? r2(r.closing) : '', r.closing < 0 ? r2(-r.closing) : '']), ['Grand total', '', r2(T.dr), r2(T.cr), r2(T.cd), r2(T.cc)]] }])} />
      </Tools>
      <div className="bk-bar">
        <div className="ac-sum"><div>Debit ₹<b>{amt(T.dr)}</b></div><div>Credit ₹<b>{amt(T.cr)}</b></div><div>Closing Dr ₹<b>{amt(T.cd)}</b></div><div>Closing Cr ₹<b>{amt(T.cc)}</b></div>
          <div>Status<b style={{ color: Math.abs(diff) < 0.01 ? '#067647' : '#B42318' }}>{Math.abs(diff) < 0.01 ? 'Tallied ✔' : `Difference ${amt(diff)}`}</b></div></div>
        <label><input type="checkbox" checked={det} onChange={e => setDet(e.target.checked)} />Show ledgers</label>
      </div>
      <div className="bk-wrap">
        <table className="bk">
          <colgroup><col /><col style={{ width: 150 }} /><col style={{ width: 140 }} /><col style={{ width: 140 }} /><col style={{ width: 140 }} /><col style={{ width: 140 }} /></colgroup>
          <thead><tr>{heads.map(h => <th key={h[0]} className={h[2] || ''}>{h[0]}</th>)}</tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={`${r.type}-${r.id}`} className={r.type === 'g' ? (r.depth ? 'g' : 'g0') : 'l'} onDoubleClick={() => r.type === 'l' && navigate(`/beta/books/ledger?l=${encodeURIComponent(r.id)}`)} title={r.type === 'l' ? 'Double-click to open the ledger' : undefined}>
                <td style={pad(r.depth)}>{r.name}</td>{cells(r).map((v, i) => <td key={i} className="r">{v}</td>)}
              </tr>))}
            {!rows.length && <tr><td colSpan={6} className="sb-empty">No entries in this period.</td></tr>}
          </tbody>
          <tfoot><tr><td>Grand total</td><td /><td className="r">{amt(T.dr)}</td><td className="r">{amt(T.cr)}</td><td className="r">{amt(T.cd)}</td><td className="r">{amt(T.cc)}</td></tr></tfoot>
        </table>
      </div>
    </>
  );
}

/* ───────────────────────── Profit & Loss ───────────────────────── */
function PLView({ books, from, to, slot, company, user, period }) {
  const navigate = useNavigate();
  const [det, setDet] = useState(true);
  const pl = useMemo(() => profitLoss(books, from, to), [books, from, to]);
  const sales = pl.I || 0;
  const pct = v => (sales ? `${(v / sales * 100).toFixed(1)}%` : '');
  const section = (side, income) => groupRows(books, pl.bal, { roots: pl.part(side), withLedgers: det }).map(r => ({ ...r, v: income ? -r.closing : r.closing }));
  const blocks = [
    ['Income — Sales', section('I', true), pl.I], ['Less: Purchase & direct expenses', section('E', false), pl.E], ['gp'],
    ['Add: Other (indirect) income', section('II', true), pl.II], ['Less: Indirect expenses', section('IE', false), pl.IE], ['np'],
  ];
  const out = [];
  blocks.forEach(b => {
    if (b[0] === 'gp') out.push({ k: 'gp', cls: 'tt', name: pl.gross >= 0 ? 'GROSS PROFIT' : 'GROSS LOSS', v: pl.gross });
    else if (b[0] === 'np') out.push({ k: 'np', cls: 'tt', name: pl.net >= 0 ? 'NET PROFIT' : 'NET LOSS', v: pl.net });
    else { out.push({ k: b[0], cls: 'g0', name: b[0], v: b[2] }); b[1].forEach(r => out.push({ k: `${b[0]}-${r.type}-${r.id}`, cls: r.type === 'g' ? 'g' : 'l', name: r.name, v: r.v, depth: r.depth + 1, led: r.type === 'l' ? r.id : '' })); }
  });
  return (
    <>
      <Tools slot={slot}>
        <PrintBtn onClick={() => printReport({ title: 'PROFIT & LOSS ACCOUNT', kv: [['Period', period]], company, user, heads: [['Particulars', ''], ['Amount ₹', '110px', 'r'], ['% of sales', '70px', 'r']],
          rows: out.map(r => ({ cls: r.cls === 'tt' ? 'tot' : r.cls === 'g0' ? 'g1' : r.cls === 'g' ? 'g' : '', pad: r.depth || 0, c: [r.name, amt(r.v), pct(r.v)] })), note: 'Before closing stock — stock on hand is not valued in these books.' })} />
        <XlBtn onClick={() => excel('Profit_Loss', [{ name: 'P&L', widths: [52, 18, 10], rows: [['Profit & Loss', period], [], ['Particulars', 'Amount', '% of sales'], ...out.map(r => [`${'   '.repeat(r.depth || 0)}${r.name}`, r2(r.v), pct(r.v)])] }])} />
      </Tools>
      <div className="bk-bar">
        <div className="ac-sum"><div>Sales ₹<b>{amt(pl.I)}</b></div><div>Purchase + direct ₹<b>{amt(pl.E)}</b></div><div>Gross profit ₹<b>{amt(pl.gross)}</b></div><div>Indirect exp. ₹<b>{amt(pl.IE)}</b></div>
          <div>Net {pl.net >= 0 ? 'profit' : 'loss'} ₹<b style={{ color: pl.net >= 0 ? '#067647' : '#B42318' }}>{amt(Math.abs(pl.net))} {pct(pl.net) && `· ${pct(pl.net)}`}</b></div></div>
        <label><input type="checkbox" checked={det} onChange={e => setDet(e.target.checked)} />Show ledgers</label>
      </div>
      <div className="bk-wrap">
        <table className="bk" style={{ maxWidth: 980 }}>
          <colgroup><col /><col style={{ width: 170 }} /><col style={{ width: 110 }} /></colgroup>
          <thead><tr><th>Particulars</th><th className="r">Amount ₹</th><th className="r">% of sales</th></tr></thead>
          <tbody>{out.map(r => (
            <tr key={r.k} className={r.cls} onDoubleClick={() => r.led && navigate(`/beta/books/ledger?l=${encodeURIComponent(r.led)}`)}>
              <td style={pad(r.depth || 0)}>{r.name}</td><td className={`r${r.v < 0 ? ' neg' : ''}`}>{amt(r.v)}</td><td className="r">{pct(r.v)}</td></tr>))}
          </tbody>
        </table>
        <div style={{ padding: '8px 12px', fontSize: 11.5, color: '#667085' }}>Closing stock is not counted — stock on hand is not valued in these books. Depreciation comes from Fixed Assets.</div>
      </div>
    </>
  );
}

/* ───────────────────────── Balance sheet ───────────────────────── */
function BSView({ books, to, slot, company, user, period }) {
  const navigate = useNavigate();
  const [det, setDet] = useState(false);
  const bs = useMemo(() => balanceSheet(books, to), [books, to]);
  const sideRows = (side) => {
    const roots = books.roots.filter(id => books.g[id].side === side || (books.g[id].side === 'X' && (side === 'A' ? 1 : -1) * groupRows(books, bs.bal, { roots: [id], withLedgers: false }).reduce((t, r) => t + (r.depth ? 0 : r.closing), 0) > 0));
    return groupRows(books, bs.bal, { roots, withLedgers: det, keep: b => Math.abs(b.closing) >= 0.005 }).filter(r => Math.abs(r.closing) >= 0.005).map(r => ({ ...r, v: side === 'L' ? -r.closing : r.closing }));
  };
  const L = sideRows('L'), A = sideRows('A');
  const tl = r2(L.filter(r => !r.depth).reduce((t, r) => t + r.v, 0)), ta = r2(A.filter(r => !r.depth).reduce((t, r) => t + r.v, 0));
  const Side = ({ title, rows, total }) => (
    <div>
      <table className="bk">
        <colgroup><col /><col style={{ width: 150 }} /></colgroup>
        <thead><tr><th>{title}</th><th className="r">Amount ₹</th></tr></thead>
        <tbody>{rows.map(r => (
          <tr key={`${r.type}-${r.id}`} className={r.type === 'g' ? (r.depth ? 'g' : 'g0') : 'l'} onDoubleClick={() => r.type === 'l' && navigate(`/beta/books/ledger?l=${encodeURIComponent(r.id)}`)}>
            <td style={pad(r.depth)}>{r.name}{r.id === 'Profit & Loss A/c' && <span className="mut"> (incl. {bs.pl.net >= 0 ? 'profit' : 'loss'} this year ₹ {amt(Math.abs(bs.pl.net))})</span>}</td><td className={`r${r.v < 0 ? ' neg' : ''}`}>{amt(r.v)}</td></tr>))}
          {!rows.length && <tr><td colSpan={2} className="sb-empty">—</td></tr>}
        </tbody>
        <tfoot><tr><td>Total</td><td className="r">{amt(total)}</td></tr></tfoot>
      </table>
    </div>
  );
  const diff = r2(ta - tl);
  return (
    <>
      <Tools slot={slot}>
        <PrintBtn onClick={() => {
          const n = Math.max(L.length, A.length), rows = [];
          for (let i = 0; i < n; i++) { const l = L[i], a = A[i]; rows.push({ cls: (l && l.type === 'g' && !l.depth) || (a && a.type === 'g' && !a.depth) ? 'g' : '', c: [l ? `${'  '.repeat(l.depth * 2)}${l.name}` : '', l ? amt(l.v) : '', a ? `${'  '.repeat(a.depth * 2)}${a.name}` : '', a ? amt(a.v) : ''] }); }
          rows.push({ cls: 'tot', c: ['TOTAL', amt(tl), 'TOTAL', amt(ta)] });
          printReport({ title: 'BALANCE SHEET', kv: [['As on', dmy(to)], ['Profit this year', amt(bs.pl.net)]], company, user, landscape: true, heads: [['Liabilities', ''], ['Amount ₹', '110px', 'r'], ['Assets', ''], ['Amount ₹', '110px', 'r']], rows, note: Math.abs(diff) >= 0.01 ? `Difference ₹ ${amt(diff)} — see Suspense / opening balances.` : '' });
        }} />
        <XlBtn onClick={() => excel('Balance_Sheet', [{ name: 'Balance sheet', widths: [46, 18, 46, 18], rows: [['Balance sheet', period], [], ['Liabilities', 'Amount', 'Assets', 'Amount'],
          ...Array.from({ length: Math.max(L.length, A.length) }, (_, i) => [L[i] ? `${'   '.repeat(L[i].depth)}${L[i].name}` : '', L[i] ? r2(L[i].v) : '', A[i] ? `${'   '.repeat(A[i].depth)}${A[i].name}` : '', A[i] ? r2(A[i].v) : '']), ['Total', tl, 'Total', ta]] }])} />
      </Tools>
      <div className="bk-bar">
        <div className="ac-sum"><div>Liabilities ₹<b>{amt(tl)}</b></div><div>Assets ₹<b>{amt(ta)}</b></div><div>Profit this year ₹<b style={{ color: bs.pl.net >= 0 ? '#067647' : '#B42318' }}>{amt(bs.pl.net)}</b></div>
          <div>Status<b style={{ color: Math.abs(diff) < 0.01 ? '#067647' : '#B42318' }}>{Math.abs(diff) < 0.01 ? 'Tallied ✔' : `Difference ${amt(diff)}`}</b></div></div>
        <label><input type="checkbox" checked={det} onChange={e => setDet(e.target.checked)} />Show ledgers</label>
      </div>
      <div className="bk-wrap"><div className="bk-two"><Side title="Liabilities" rows={L} total={tl} /><Side title="Assets" rows={A} total={ta} /></div>
        <div style={{ padding: '8px 12px', fontSize: 11.5, color: '#667085' }}>Stock on hand is not valued in these books. A Dr balance on a liability group (or Cr on an asset group) shows in red.</div></div>
    </>
  );
}

/* ───────────────────────── Cash / bank book + reconciliation ───────────────────────── */
function CashView({ books, from, to, slot, company, user, period, companyId, refresh }) {
  const accs = useMemo(() => Object.values(books.L).filter(l => inGroup(books, l.name, 'bank') || inGroup(books, l.name, 'cash')).sort((a, b) => (a.kind === 'cash') - (b.kind === 'cash') || (a.name === 'Bank — not selected') - (b.name === 'Bank — not selected') || a.name.localeCompare(b.name)), [books]);
  const [acc, setAcc] = useState(() => (accs.find(a => (books.byLed[a.name] || []).length) || accs[0] || {}).name || '');
  const [mode, setMode] = useState('book');
  const [onlyOpen, setOnlyOpen] = useState(false);
  const [brs, setBrs] = useState(books.brs || {});
  const [err, setErr] = useState('');
  const isBank = acc && inGroup(books, acc, 'bank');
  const st = useMemo(() => (acc ? statement(books, acc, from, to) : { lines: [], opening: 0, dr: 0, cr: 0, closing: 0 }), [books, acc, from, to]);
  const keyOf = p => p.bankLine || `${p.src}:${p.line}`;
  const setDate = async (p, d) => {
    const key = keyOf(p);
    setBrs(b => { const n = { ...b }; if (d) n[key] = d; else delete n[key]; return n; });
    try { await axios.post('/api/books/brs', { key, clearedOn: d }, { params: { companyId } }); setErr(''); } catch (e) { setErr(e.response?.data?.error || 'Could not save the bank date.'); refresh(); }
  };
  // reconciliation as on `to`: everything in the books up to `to` that the bank has not cleared by `to`
  const upto = useMemo(() => (acc ? statement(books, acc, '', to) : { lines: [], closing: 0 }), [books, acc, to]);
  const notCleared = upto.lines.filter(p => !brs[keyOf(p)] || brs[keyOf(p)] > to);
  const unDep = r2(notCleared.reduce((t, p) => t + p.dr, 0)), unChq = r2(notCleared.reduce((t, p) => t + p.cr, 0));
  const asBank = r2(upto.closing - unDep + unChq);
  const lines = mode === 'brs' ? (onlyOpen ? notCleared : upto.lines) : st.lines;
  const heads = [['Date', '62px'], ['Particulars', ''], ['Type', '60px'], ['Vch No.', '80px'], ['Receipt', '84px', 'r'], ['Payment', '84px', 'r'], ['Balance', '96px', 'r'], ...(isBank ? [['Bank date', '64px']] : [])];
  const printIt = () => printReport({ title: mode === 'brs' ? 'BANK RECONCILIATION' : (isBank ? 'BANK BOOK' : 'CASH BOOK'), kv: [['Account', acc], ['Period', mode === 'brs' ? `As on ${dmy(to)}` : period]], company, user, heads,
    rows: mode === 'brs'
      ? [{ cls: 'g', c: ['', 'Balance as per books', '', '', '', '', dc(upto.closing), ''] }, { c: ['', 'Less: deposits not yet cleared by the bank', '', '', amt(unDep), '', '', ''] }, { c: ['', 'Add: payments / cheques not yet cleared', '', '', '', amt(unChq), '', ''] }, { cls: 'tot', c: ['', 'Balance as per bank', '', '', '', '', dc(asBank), ''] },
        ...notCleared.map(p => ({ c: [dmy(p.date), `${p.other}${p.ref ? ` · ${p.ref}` : ''}`, p.vt, p.no, amtZ(p.dr), amtZ(p.cr), '', 'Not cleared'] }))]
      : [{ cls: 'g', c: ['', 'Opening balance', '', '', '', '', dc(st.opening), ...(isBank ? [''] : [])] }, ...st.lines.map(p => ({ c: [dmy(p.date), `${p.other}${p.ref ? ` · ${p.ref}` : ''}`, p.vt, p.no, amtZ(p.dr), amtZ(p.cr), dc(p.run), ...(isBank ? [dmy(brs[keyOf(p)])] : [])] })),
        { cls: 'tot', c: ['', 'Total / Closing balance', '', '', amt(st.dr), amt(st.cr), dc(st.closing), ...(isBank ? [''] : [])] }] });
  return (
    <>
      {slot && createPortal(<select className="sb-search" style={{ width: 210 }} value={acc} onChange={e => { setAcc(e.target.value); if (!inGroup(books, e.target.value, 'bank')) setMode('book'); }} aria-label="Cash or bank account">
        {accs.map(a => <option key={a.name} value={a.name}>{a.name}</option>)}</select>, slot)}
      <Tools slot={slot}>
        <PrintBtn onClick={printIt} />
        <XlBtn onClick={() => excel(isBank ? 'Bank_Book' : 'Cash_Book', [{ name: mode === 'brs' ? 'Reconciliation' : 'Book', widths: [12, 46, 12, 14, 18, 14, 14, 16, 12], rows: [[acc, mode === 'brs' ? `As on ${dmy(to)}` : period], [],
          ['Date', 'Particulars', 'Type', 'Vch No.', 'Ref / mode', 'Receipt', 'Payment', 'Balance', 'Bank date'], ...lines.map(p => [dmy(p.date), p.other, p.vt, p.no, [p.ref, p.mode].filter(Boolean).join(' · '), p.dr || '', p.cr || '', dc(p.run), dmy(brs[keyOf(p)])])] }])} />
      </Tools>
      <div className="bk-bar">
        {isBank && <div className="ac-seg">{[['book', 'Bank book'], ['brs', 'Reconciliation']].map(([k, l]) => <button key={k} type="button" className={mode === k ? 'on' : ''} onClick={() => setMode(k)}>{l}</button>)}</div>}
        {mode === 'book'
          ? <div className="ac-sum"><div>Opening<b>{dc(st.opening) || '0.00'}</b></div><div>Receipts ₹<b>{amt(st.dr)}</b></div><div>Payments ₹<b>{amt(st.cr)}</b></div><div>Closing<b>{dc(st.closing) || '0.00'}</b></div><div>Entries<b>{st.lines.length}</b></div></div>
          : <div className="ac-sum"><div>As per books<b>{dc(upto.closing) || '0.00'}</b></div><div>Deposits not cleared ₹<b>{amt(unDep)}</b></div><div>Payments not cleared ₹<b>{amt(unChq)}</b></div><div>As per bank<b style={{ color: '#03444f' }}>{dc(asBank) || '0.00'}</b></div><div>Not cleared<b>{notCleared.length}</b></div></div>}
        {mode === 'brs' && <label><input type="checkbox" checked={onlyOpen} onChange={e => setOnlyOpen(e.target.checked)} />Only not cleared</label>}
      </div>
      {err && <div className="bk-info">{err}</div>}
      {mode === 'brs' && <div className="bk-info ok">Type the date the bank cleared each line (from the bank statement). Lines without a bank date by {dmy(to)} are the reconciliation difference.</div>}
      <div className="bk-wrap">
        <table className="bk">
          <colgroup><col style={{ width: 96 }} /><col /><col style={{ width: 90 }} /><col style={{ width: 110 }} /><col style={{ width: 170 }} /><col style={{ width: 120 }} /><col style={{ width: 120 }} /><col style={{ width: 140 }} />{isBank && <col style={{ width: 150 }} />}</colgroup>
          <thead><tr><th>Date</th><th>Particulars</th><th>Type</th><th>Vch No.</th><th>Ref / mode</th><th className="r">Receipt</th><th className="r">Payment</th><th className="r">Balance</th>{isBank && <th>Bank date</th>}</tr></thead>
          <tbody>
            {mode === 'book' && <tr className="g"><td /><td>Opening balance</td><td /><td /><td /><td /><td /><td className="r">{dc(st.opening)}</td>{isBank && <td />}</tr>}
            {lines.map((p, i) => (
              <tr key={`${keyOf(p)}-${i}`}>
                <td>{dmy(p.date)}</td><td title={p.narr}>{p.other}</td><td>{p.vt}</td><td><b>{p.no}</b></td><td title={p.ref}>{[p.ref, p.mode].filter(Boolean).join(' · ')}</td>
                <td className="r">{amtZ(p.dr)}</td><td className="r">{amtZ(p.cr)}</td><td className="r">{dc(p.run)}</td>
                {isBank && <td><input type="date" className="bd" value={brs[keyOf(p)] || ''} min={p.date} onChange={e => setDate(p, e.target.value)} aria-label={`Bank date for ${p.no}`} disabled={!can(user, 'accBank', 'edit') && !can(user, 'accBank', 'create')} /></td>}
              </tr>))}
            {!lines.length && <tr><td colSpan={isBank ? 9 : 8} className="sb-empty">{accs.length ? 'No entries.' : 'No cash or bank account yet.'}</td></tr>}
          </tbody>
          {mode === 'book' && <tfoot><tr><td /><td>Closing balance</td><td /><td /><td /><td className="r">{amt(st.dr)}</td><td className="r">{amt(st.cr)}</td><td className="r">{dc(st.closing)}</td>{isBank && <td />}</tr></tfoot>}
        </table>
      </div>
    </>
  );
}

/* ───────────────────────── Ageing ───────────────────────── */
function AgeingView({ books, to, slot, company, user }) {
  const navigate = useNavigate();
  const [kind, setKind] = useState('client');
  const [q, setQ] = useState('');
  const [openP, setOpenP] = useState('');
  const all = useMemo(() => ageing(books, kind, to), [books, kind, to]);
  const w = words(q);
  const list = all.filter(a => hit(`${a.name} ${a.city} ${a.gstin}`, w));
  const T = list.reduce((t, a) => ({ due: t.due + a.due, adv: t.adv + a.advance, net: t.net + a.net, bk: t.bk.map((x, i) => x + a.bk[i]) }), { due: 0, adv: 0, net: 0, bk: BUCKETS.map(() => 0) });
  const title = kind === 'client' ? 'RECEIVABLES AGEING' : 'PAYABLES AGEING';
  const heads = [['Party', ''], ['Outstanding', '84px', 'r'], ...BUCKETS.map(b => [b[2], '74px', 'r']), ['Advance', '74px', 'r'], ['Net', '84px', 'r']];
  return (
    <>
      {slot && createPortal(<input className="sb-search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search party, city, GSTIN…" aria-label="Search parties" />, slot)}
      <Tools slot={slot}>
        <PrintBtn onClick={() => printReport({ title, kv: [['As on', dmy(to)], ['Parties', String(list.length)]], company, user, landscape: true, heads,
          rows: [...list.map(a => ({ c: [a.name, amt(a.due), ...a.bk.map(amtZ), amtZ(a.advance), amt(a.net)] })), { cls: 'tot', c: ['TOTAL', amt(T.due), ...T.bk.map(amt), amt(T.adv), amt(T.net)] }], note: 'Bills are settled oldest first by the receipts / payments, TDS and notes against the party. Age = days from the bill date.' })} />
        <XlBtn onClick={() => excel(kind === 'client' ? 'Receivables_Ageing' : 'Payables_Ageing', [
          { name: 'Party-wise', widths: [44, 16, 22, 16, ...BUCKETS.map(() => 14), 14, 16], rows: [[title, `As on ${dmy(to)}`], [], ['Party', 'City', 'GSTIN', 'Outstanding', ...BUCKETS.map(b => b[2]), 'Advance', 'Net'], ...list.map(a => [a.name, a.city, a.gstin, a.due, ...a.bk, a.advance, a.net])] },
          { name: 'Bill-wise', widths: [44, 18, 12, 14, 10], rows: [['Party', 'Bill / Vch No.', 'Date', 'Pending', 'Days'], ...list.flatMap(a => a.bills.map(b => [a.name, b.no, dmy(b.date), b.left, b.date ? b.days : '']))] }])} />
      </Tools>
      <div className="bk-bar">
        <div className="ac-seg">{[['client', 'Receivables (clients)'], ['vendor', 'Payables (vendors)']].map(([k, l]) => <button key={k} type="button" className={kind === k ? 'on' : ''} onClick={() => { setKind(k); setOpenP(''); }}>{l}</button>)}</div>
        <div className="ac-sum"><div>Outstanding ₹<b>{amt(T.due)}</b></div>{BUCKETS.map((b, i) => <div key={b[2]}>{b[2]}<b style={i >= 3 && T.bk[i] ? { color: '#B42318' } : undefined}>{amt(T.bk[i])}</b></div>)}<div>Advance ₹<b>{amt(T.adv)}</b></div></div>
      </div>
      <div className="bk-wrap">
        <table className="bk">
          <colgroup><col /><col style={{ width: 130 }} />{BUCKETS.map(b => <col key={b[2]} style={{ width: 110 }} />)}<col style={{ width: 110 }} /><col style={{ width: 130 }} /><col style={{ width: 80 }} /></colgroup>
          <thead><tr><th>Party</th><th className="r">Outstanding</th>{BUCKETS.map(b => <th key={b[2]} className="r">{b[2]}</th>)}<th className="r">Advance</th><th className="r">Net</th><th className="r">Oldest</th></tr></thead>
          <tbody>
            {list.map(a => (
              <React.Fragment key={a.name}>
                <tr className={`l${openP === a.name ? ' sel' : ''}`} onClick={() => setOpenP(openP === a.name ? '' : a.name)} onDoubleClick={() => navigate(`/beta/books/ledger?l=${encodeURIComponent(a.name)}`)} title="Click for bill-wise · double-click for the ledger">
                  <td><b>{a.name}</b>{a.city && <span className="mut"> · {a.city}</span>}</td><td className="r"><b>{amtZ(a.due)}</b></td>
                  {a.bk.map((v, i) => <td key={i} className={`r${i >= 3 && v ? ' neg' : ''}`}>{amtZ(v)}</td>)}<td className="r">{amtZ(a.advance)}</td><td className="r"><b>{amt(a.net)}</b></td><td className="r">{a.bills.length ? (a.oldest >= 9999 ? 'Opening' : `${a.oldest} d`) : ''}</td>
                </tr>
                {openP === a.name && a.bills.map((b, j) => {
                  const bi = BUCKETS.findIndex(x => b.days >= x[0] && b.days <= x[1]);
                  return <tr key={j} className="sub"><td style={pad(1)}>{b.vt} <b>{b.no}</b>{b.date && ` · ${dmy(b.date)}`}{b.ref && <span className="mut"> · {b.ref}</span>}</td><td className="r">{amt(b.left)}</td>{BUCKETS.map((x, i) => <td key={i} className="r">{i === bi ? amt(b.left) : ''}</td>)}<td /><td /><td className="r">{b.date ? `${b.days} d` : ''}</td></tr>;
                })}
              </React.Fragment>))}
            {!list.length && <tr><td colSpan={10} className="sb-empty">Nothing outstanding.</td></tr>}
          </tbody>
          <tfoot><tr><td>Total — {list.length} parties</td><td className="r">{amt(T.due)}</td>{T.bk.map((v, i) => <td key={i} className="r">{amt(v)}</td>)}<td className="r">{amt(T.adv)}</td><td className="r">{amt(T.net)}</td><td /></tr></tfoot>
        </table>
      </div>
    </>
  );
}

/* ───────────────────────── TDS ───────────────────────── */
function TdsView({ books, from, to, slot, company, user, period }) {
  const [side, setSide] = useState('rec');
  const [qtr, setQtr] = useState('');
  const [byParty, setByParty] = useState(false);
  const all = useMemo(() => tdsLines(books, from, to), [books, from, to]);
  const list = all.filter(t => (side === 'pay') === t.payable && (!qtr || t.q === qtr));
  const total = r2(list.reduce((t, x) => t + x.amount, 0));
  const tdsLeds = Object.values(books.L).filter(l => l.kind === 'tds' || /\btds\b|tax deducted/i.test(l.name));
  const bal = balances(books, '', to);
  const parties = Object.values(list.reduce((m, t) => { const k = t.party || '—'; m[k] = m[k] || { party: k, pan: t.pan, n: 0, amount: 0, sections: new Set() }; m[k].n++; m[k].amount += t.amount; if (t.section) m[k].sections.add(t.section); return m; }, {})).sort((a, b) => b.amount - a.amount);
  const Q = ['Q1', 'Q2', 'Q3', 'Q4'].map(q => r2(all.filter(t => (side === 'pay') === t.payable && t.q === q).reduce((s, t) => s + t.amount, 0)));
  const title = side === 'rec' ? 'TDS DEDUCTED BY CLIENTS (RECEIVABLE)' : 'TDS DEDUCTED BY US (PAYABLE)';
  const heads = byParty ? [['Party', ''], ['PAN', '90px'], ['Sections', '80px'], ['Entries', '50px', 'r'], ['TDS ₹', '90px', 'r']]
    : [['Date', '62px'], ['Party', ''], ['PAN', '84px'], ['Section', '50px'], ['Voucher', '80px'], ['Qtr', '34px'], ['TDS ₹', '84px', 'r']];
  const pRows = byParty ? parties.map(p => [p.party, p.pan, [...p.sections].join(', '), String(p.n), amt(p.amount)]) : list.map(t => [dmy(t.date), t.party, t.pan, t.section, t.no, t.q, amt(t.amount)]);
  return (
    <>
      <Tools slot={slot}>
        <PrintBtn onClick={() => printReport({ title, kv: [['Period', period], ['Quarter', qtr || 'All']], company, user, heads, rows: [...pRows.map(c => ({ c })), { cls: 'tot', c: [...heads.slice(0, -1).map((_, i) => (i ? '' : 'TOTAL')), amt(total)] }],
          note: side === 'rec' ? 'Match with Form 26AS / AIS before claiming in the income-tax return.' : 'Deposit by the 7th of the next month (30 April for March); file 24Q (salary) / 26Q quarterly.' })} />
        <XlBtn onClick={() => excel(side === 'rec' ? 'TDS_Receivable' : 'TDS_Payable', [{ name: 'TDS', widths: [12, 44, 14, 10, 16, 8, 14, 50], rows: [[title, period], [], ['Date', 'Party', 'PAN', 'Section', 'Voucher', 'Quarter', 'TDS', 'Narration'], ...list.map(t => [dmy(t.date), t.party, t.pan, t.section, t.no, t.q, t.amount, t.narr])] },
          { name: 'Party-wise', widths: [44, 14, 16, 10, 14], rows: [['Party', 'PAN', 'Sections', 'Entries', 'TDS'], ...parties.map(p => [p.party, p.pan, [...p.sections].join(', '), p.n, r2(p.amount)])] }])} />
      </Tools>
      <div className="bk-bar">
        <div className="ac-seg">{[['rec', 'Deducted by clients'], ['pay', 'Deducted by us']].map(([k, l]) => <button key={k} type="button" className={side === k ? 'on' : ''} onClick={() => setSide(k)}>{l}</button>)}</div>
        <div className="ac-seg">{[['', 'All'], ['Q1', 'Q1 Apr–Jun'], ['Q2', 'Q2 Jul–Sep'], ['Q3', 'Q3 Oct–Dec'], ['Q4', 'Q4 Jan–Mar']].map(([k, l], i) => <button key={k} type="button" className={qtr === k ? 'on' : ''} onClick={() => setQtr(k)}>{l}{i > 0 && <span>{amt(Q[i - 1]).replace(/\.00$/, '')}</span>}</button>)}</div>
        <div className="ac-sum"><div>TDS ₹<b>{amt(total)}</b></div><div>Entries<b>{list.length}</b></div></div>
        <label><input type="checkbox" checked={byParty} onChange={e => setByParty(e.target.checked)} />Party-wise</label>
      </div>
      {tdsLeds.length > 0 && <div className="bk-info ok">TDS ledgers as on {dmy(to)}: {tdsLeds.map(l => `${l.name} ${dc(bal[l.name]?.closing || 0) || '0.00'}`).join(' · ')}</div>}
      <div className="bk-wrap">
        <table className="bk">
          {byParty ? <>
            <colgroup><col /><col style={{ width: 130 }} /><col style={{ width: 130 }} /><col style={{ width: 90 }} /><col style={{ width: 140 }} /></colgroup>
            <thead><tr><th>Party</th><th>PAN</th><th>Sections</th><th className="r">Entries</th><th className="r">TDS ₹</th></tr></thead>
            <tbody>{parties.map(p => <tr key={p.party}><td><b>{p.party}</b></td><td>{p.pan}</td><td>{[...p.sections].join(', ')}</td><td className="r">{p.n}</td><td className="r"><b>{amt(p.amount)}</b></td></tr>)}
              {!parties.length && <tr><td colSpan={5} className="sb-empty">No TDS entries.</td></tr>}</tbody>
            <tfoot><tr><td>Total — {parties.length} parties</td><td /><td /><td className="r">{list.length}</td><td className="r">{amt(total)}</td></tr></tfoot>
          </> : <>
            <colgroup><col style={{ width: 96 }} /><col style={{ width: 300 }} /><col style={{ width: 120 }} /><col style={{ width: 80 }} /><col style={{ width: 120 }} /><col /><col style={{ width: 60 }} /><col style={{ width: 130 }} /></colgroup>
            <thead><tr><th>Date</th><th>Party</th><th>PAN</th><th>Section</th><th>Voucher</th><th>Narration</th><th>Qtr</th><th className="r">TDS ₹</th></tr></thead>
            <tbody>{list.map((t, i) => <tr key={i}><td>{dmy(t.date)}</td><td title={t.party}><b>{t.party}</b></td><td>{t.pan}</td><td>{t.section}</td><td>{t.no}</td><td title={t.narr}>{t.narr}</td><td>{t.q}</td><td className={`r${t.amount < 0 ? ' neg' : ''}`}><b>{amt(t.amount)}</b></td></tr>)}
              {!list.length && <tr><td colSpan={8} className="sb-empty">No TDS entries in this period. TDS is booked by a journal to a ledger named “TDS …” (or from Payroll).</td></tr>}</tbody>
            <tfoot><tr><td /><td>Total — {list.length} entries</td><td /><td /><td /><td /><td /><td className="r">{amt(total)}</td></tr></tfoot>
          </>}
        </table>
      </div>
    </>
  );
}
