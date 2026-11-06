/* BalanceSheet — Balance Sheet, Profit & Loss and FY-wise profit, read live from Tally.
 *
 * Opening the page shows the copy saved in the ERP from the last fetch — Tally is not
 * contacted. "Fetch from Tally" reads fresh figures and overwrites that saved copy
 * (in the ERP only; nothing is written to Tally).
 *
 * Every figure comes from /api/tally-reports, which only sends read-only Export
 * requests to Tally (nothing is ever written back). Before any figure is shown the
 * server confirms the open Tally company's GSTIN equals this ERP company's GSTIN;
 * if not, the page says "Company not matched" and shows nothing.
 */
import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useSearchParams } from 'react-router-dom';
import { useCompany } from '../../../context/CompanyContext';
import FyDropdown from '../../../components/FyDropdown';

/* PAUSED: TallyPrime showed an error and closed while this page was fetching.
   Until the cause is found, the page sends NO request to Tally. */
const TALLY_PAUSED = false;   // re-enabled 16-10-2026 after a controlled test (Tally stayed up)

const F   = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const INK = '#104f4f';
const BD  = '#EAECF0';

const fyOf  = d => { const t = d ? new Date(d) : new Date(); const y = t.getMonth() >= 3 ? t.getFullYear() : t.getFullYear() - 1; return `${String(y).slice(2)}-${String(y + 1).slice(2)}`; };
const fyRange = fy => { const y = 2000 + parseInt(fy.slice(0, 2), 10); return { from: `${y}-04-01`, to: `${y + 1}-03-31` }; };
const isoToday = () => new Date().toISOString().slice(0, 10);
const inr = n => (n == null || n === 0) ? '' : (n < 0 ? '(-)' : '') + Math.abs(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const inrZ = n => (n < 0 ? '(-)' : '') + Math.abs(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/* only accept well-formed reports — a bad reply must never break the page */
const okBs = d => d && Array.isArray(d.liabilities) && Array.isArray(d.assets) ? d : null;
const okPl = d => d && Array.isArray(d.heads) ? d : null;
const okFy = d => d && Array.isArray(d.years) ? d : null;
const whenTxt = d => new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const agoTxt = d => {
  const m = Math.round((Date.now() - new Date(d).getTime()) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h} hr ago` : `${Math.round(h / 24)} day${h >= 48 ? 's' : ''} ago`;
};
const dLabel = d => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' }).replace(/ /g, '-');

export default function BalanceSheet() {
  const { selectedCompany } = useCompany();
  const cid = selectedCompany?.companyId;
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || 'bs';
  const setTab = t => setParams(p => { p.set('tab', t); return p; }, { replace: true });

  const curFy = fyOf();
  const [fy, setFy] = useState(curFy);
  const [fyList, setFyList] = useState([curFy]);
  const [showZero, setShowZero] = useState(false);
  const [open, setOpen] = useState({});            // expanded P&L heads

  const [bs, setBs] = useState(null);
  const [pl, setPl] = useState(null);
  const [fyRows, setFyRows] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);            // { code, error, tallyGstin, erpGstin }

  /* period: whole FY, but a running FY stops at today (as Tally shows "as at") */
  const range = (() => { const r = fyRange(fy); return fy === curFy ? { from: r.from, to: isoToday() } : r; })();

  const applyFyRows = y => {
    setFyRows(y);
    const list = (y?.years || []).map(r => r.fy).reverse();
    if (list.length) setFyList(list.includes(curFy) ? list : [curFy, ...list]);
  };

  /* opening the page / changing FY: show the copy saved in the ERP — Tally is NOT contacted */
  const [loadingSaved, setLoadingSaved] = useState(false);
  const [serverOld, setServerOld] = useState(false);
  useEffect(() => {
    if (!cid) return;
    let alive = true;
    setLoadingSaved(true); setErr(null);
    axios.get(`/api/tally-reports/saved?companyId=${cid}&fy=${fy}`).then(r => {
      if (!alive) return;
      const old = !r.data || typeof r.data !== 'object';
      setServerOld(old);
      if (old) { setBs(null); setPl(null); return; }
      setBs(okBs(r.data?.bs)); setPl(okPl(r.data?.pl));
      if (okFy(r.data?.fy)) applyFyRows(r.data.fy);
    }).catch(() => { if (alive) { setBs(null); setPl(null); } })
      .finally(() => alive && setLoadingSaved(false));
    return () => { alive = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cid, fy]);

  /* "Fetch all FYs": every year's Balance Sheet + P&L (and the FY comparison), saved in the ERP */
  const [loadingAll, setLoadingAll] = useState(false);
  const fetchAllFys = useCallback(async () => {
    if (!cid || TALLY_PAUSED) return;
    setLoadingAll(true); setLoading(true); setErr(null);
    try {
      const r = await axios.get(`/api/tally-reports/fetch-all?companyId=${cid}`);
      if (!r.data || !Array.isArray(r.data.fys)) throw new Error('Tally sent an unexpected reply — the saved figures were kept. Please try again.');
      applyFyRows({ ...r.data.profitByFy, savedAt: new Date().toISOString() });
      const sv = await axios.get(`/api/tally-reports/saved?companyId=${cid}&fy=${fy}`);
      setBs(okBs(sv.data?.bs)); setPl(okPl(sv.data?.pl));
    } catch (e) {
      setErr(e.response?.data || { code: 'TALLY', error: e.message });
    }
    setLoadingAll(false); setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cid, fy]);

  /* "Fetch from Tally": fresh figures, saved over the ERP copy. On the FY tab it
     fetches the year-wise comparison; otherwise the Balance Sheet + P&L of the chosen FY. */
  const fetchFromTally = useCallback(async () => {
    if (!cid || TALLY_PAUSED) return;
    setLoading(true); setErr(null);
    try {
      if (tab === 'fy') {
        const y = await axios.get(`/api/tally-reports/profit-by-fy?companyId=${cid}&fresh=1`);
        if (!okFy(y.data)) throw new Error('Tally sent an unexpected reply — nothing was saved. Please try again.');
        applyFyRows({ ...y.data, savedAt: new Date().toISOString() });
      } else {
        const q = `companyId=${cid}&fy=${fy}&from=${range.from}&to=${range.to}&fresh=1`;
        const b = await axios.get(`/api/tally-reports/balance-sheet?${q}`);
        const p = await axios.get(`/api/tally-reports/profit-loss?${q}`);
        if (!okBs(b.data) || !okPl(p.data)) throw new Error('Tally sent an unexpected reply — the saved figures were kept. Please try again.');
        const now = new Date().toISOString();
        setBs({ ...b.data, savedAt: now }); setPl({ ...p.data, savedAt: now });
      }
    } catch (e) {
      setErr(e.response?.data || { code: 'TALLY', error: e.message });
    }
    setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cid, fy, tab, range.from, range.to]);

  /* ── shared bits ── */
  const card = { background: '#fff', border: `1px solid ${BD}`, borderRadius: 12 };
  const btn  = { height: 34, padding: '0 14px', borderRadius: 8, border: `1px solid #D0D5DD`, background: '#fff', cursor: 'pointer', fontFamily: F, fontSize: 12.5, fontWeight: 700, color: '#344054' };

  const Side = ({ title, heads, total }) => (
    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', padding: '8px 12px', borderBottom: '1px solid #98A2B3' }}>
        <div style={{ flex: 1, fontWeight: 800, letterSpacing: '3px', fontSize: 13 }}>{title}</div>
        <div style={{ textAlign: 'right', fontSize: 11.5, lineHeight: 1.35 }}>
          <div style={{ fontWeight: 800 }}>{bs.company}</div><div style={{ color: '#475467' }}>as at {dLabel(bs.to)}</div>
        </div>
      </div>
      <div style={{ flex: 1, padding: '6px 0' }}>
        {heads.map(h => {
          const items = h.items.filter(i => showZero || i.amount);
          return (
            <div key={h.name} style={{ marginBottom: 6 }}>
              <div style={{ display: 'flex', padding: '3px 12px', fontWeight: 800, fontSize: 12.5 }}>
                <span style={{ flex: 1 }}>{h.name}</span>
                <span style={{ fontVariantNumeric: 'tabular-nums' }}>{inr(h.amount)}</span>
              </div>
              {items.map((i, k) => (
                <div key={i.name + k} style={{ display: 'flex', padding: '1px 12px 1px 32px', fontSize: 12, fontStyle: 'italic', color: '#344054' }}>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{i.name}</span>
                  <span style={{ width: 150, textAlign: 'right', marginRight: 120, fontVariantNumeric: 'tabular-nums',
                    borderBottom: k === items.length - 1 ? '1px solid #98A2B3' : 'none' }}>{inr(i.amount)}</span>
                </div>
              ))}
            </div>
          );
        })}
      </div>
      <div style={{ display: 'flex', padding: '8px 12px', borderTop: '1px solid #98A2B3', fontWeight: 800, fontSize: 13 }}>
        <span style={{ flex: 1, letterSpacing: '3px' }}>Total</span><span style={{ fontVariantNumeric: 'tabular-nums' }}>{inrZ(total)}</span>
      </div>
    </div>
  );

  const PLRow = ({ label, amount, strong, indent = 0, color, onClick, isOpen, toggle }) => (
    <div onClick={onClick} style={{ display: 'flex', alignItems: 'center', padding: `${strong ? 7 : 4}px 14px 4px ${14 + indent * 20}px`, cursor: onClick ? 'pointer' : 'default',
      fontWeight: strong ? 800 : 600, fontSize: strong ? 13 : 12.5, color: color || '#101828', borderTop: strong ? `1px solid ${BD}` : 'none' }}>
      {toggle && <span style={{ width: 14, fontSize: 10, color: '#667085' }}>{isOpen ? '▾' : '▸'}</span>}
      <span style={{ flex: 1 }}>{label}</span>
      <span style={{ fontVariantNumeric: 'tabular-nums' }}>{inrZ(amount)}</span>
    </div>
  );

  const plView = () => {
    if (!pl) return null;
    const pos = h => Math.abs(h.amount || 0);
    const head = h => {
      const items = h.items.filter(i => showZero || i.amount);
      const expandable = items.length > 0 || h.parts.length > 0;
      return (
        <div key={h.name}>
          <PLRow label={h.name} amount={pos(h)} toggle={expandable} isOpen={open[h.name]} onClick={expandable ? () => setOpen(o => ({ ...o, [h.name]: !o[h.name] })) : undefined} />
          {open[h.name] && h.parts.map(p => (
            <div key={p.name}>
              <PLRow label={p.name} amount={pos(p)} indent={1} />
              {p.items.filter(i => showZero || i.amount).map((i, k) => <PLRow key={k} label={i.name} amount={Math.abs(i.amount || 0)} indent={2} color="#475467" />)}
            </div>
          ))}
          {open[h.name] && items.map((i, k) => <PLRow key={k} label={i.name} amount={Math.abs(i.amount || 0)} indent={1} color="#475467" />)}
        </div>
      );
    };
    const before = pl.heads.filter(h => !/^Indirect/i.test(h.name));
    const after  = pl.heads.filter(h => /^Indirect/i.test(h.name));
    return (
      <div style={{ ...card, maxWidth: 820, margin: '0 auto', overflow: 'hidden' }}>
        <div style={{ padding: '10px 14px', borderBottom: '1px solid #98A2B3', display: 'flex' }}>
          <b style={{ flex: 1, letterSpacing: '2px' }}>Profit & Loss A/c</b>
          <span style={{ fontSize: 11.5, textAlign: 'right' }}><b>{pl.company}</b><br />{dLabel(pl.from)} to {dLabel(pl.to)}</span>
        </div>
        {before.map(head)}
        <PLRow label={pl.grossProfit >= 0 ? 'Gross Profit' : 'Gross Loss'} amount={pl.grossProfit} strong color={pl.grossProfit >= 0 ? '#067647' : '#B42318'} />
        {after.map(head)}
        <div style={{ display: 'flex', padding: '10px 14px', background: pl.netProfit >= 0 ? '#ECFDF3' : '#FEF3F2', borderTop: '2px solid #98A2B3', fontWeight: 800, fontSize: 14 }}>
          <span style={{ flex: 1 }}>{pl.netProfit >= 0 ? 'Net Profit' : 'Net Loss'}</span>
          <span style={{ color: pl.netProfit >= 0 ? '#067647' : '#B42318', fontVariantNumeric: 'tabular-nums' }}>{inrZ(pl.netProfit)}</span>
        </div>
      </div>
    );
  };

  const fyView = () => {
    const ys = fyRows?.years || [];
    if (!ys.length) return null;
    const max = Math.max(...ys.map(y => Math.abs(y.netProfit)), 1);
    const pct = (a, b) => (b ? (a / b * 100).toFixed(1) + '%' : '—');
    return (
      <div style={{ ...card, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
          <thead><tr>{['FY', 'Sales', 'Direct Incomes', 'Cost of Sales', 'Gross Profit', 'GP %', 'Indirect Exp.', 'Net Profit', 'NP %', ''].map((h, i) => (
            <th key={i} style={{ padding: '9px 12px', background: '#F9FAFB', borderBottom: `1px solid ${BD}`, fontSize: 10.5, fontWeight: 800, color: '#475467', textTransform: 'uppercase', textAlign: i === 0 || i === 9 ? 'left' : 'right', whiteSpace: 'nowrap' }}>{h}</th>
          ))}</tr></thead>
          <tbody>
            {ys.map(y => (
              <tr key={y.fy} onClick={() => { setFy(y.fy); setTab('pl'); }} style={{ cursor: 'pointer', background: y.fy === fy ? '#F0F9FF' : '#fff' }}>
                <td style={{ padding: '9px 12px', borderBottom: `1px solid #F2F4F7`, fontWeight: 800 }}>FY {y.fy}</td>
                {[y.sales, y.directIncomes, Math.abs(y.costOfSales)].map((v, i) => <td key={i} style={{ padding: '9px 12px', borderBottom: `1px solid #F2F4F7`, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{inrZ(v)}</td>)}
                <td style={{ padding: '9px 12px', borderBottom: `1px solid #F2F4F7`, textAlign: 'right', fontWeight: 700, color: y.grossProfit >= 0 ? '#067647' : '#B42318' }}>{inrZ(y.grossProfit)}</td>
                <td style={{ padding: '9px 12px', borderBottom: `1px solid #F2F4F7`, textAlign: 'right', color: '#667085' }}>{pct(y.grossProfit, y.sales)}</td>
                <td style={{ padding: '9px 12px', borderBottom: `1px solid #F2F4F7`, textAlign: 'right' }}>{inrZ(Math.abs(y.indirectExpenses))}</td>
                <td style={{ padding: '9px 12px', borderBottom: `1px solid #F2F4F7`, textAlign: 'right', fontWeight: 800, color: y.netProfit >= 0 ? '#067647' : '#B42318' }}>{inrZ(y.netProfit)}</td>
                <td style={{ padding: '9px 12px', borderBottom: `1px solid #F2F4F7`, textAlign: 'right', color: '#667085' }}>{pct(y.netProfit, y.sales)}</td>
                <td style={{ padding: '9px 12px', borderBottom: `1px solid #F2F4F7`, width: 180 }}>
                  <div style={{ height: 10, borderRadius: 5, background: '#F2F4F7', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${Math.abs(y.netProfit) / max * 100}%`, background: y.netProfit >= 0 ? '#12B76A' : '#F04438', borderRadius: 5 }} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ padding: '8px 12px', fontSize: 11, color: '#667085' }}>Click a year to open its Profit & Loss. Running FY is up to today.</div>
      </div>
    );
  };

  const errorView = () => {
    if (!err) return null;
    const mismatch = err.code === 'GSTIN_MISMATCH';
    return (
      <div style={{ ...card, padding: 22, borderColor: mismatch ? '#FDA29B' : '#FEDF89', background: mismatch ? '#FEF3F2' : '#FFFAEB', maxWidth: 760, margin: '20px auto' }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: mismatch ? '#B42318' : '#B54708' }}>
          {mismatch ? '⛔ Company not matched' : err.code === 'NO_TALLY_GSTIN' || err.code === 'NO_ERP_GSTIN' ? '⚠ Cannot confirm the company' : '⚠ Tally not reachable'}
        </div>
        <div style={{ fontSize: 13, color: '#344054', marginTop: 8, lineHeight: 1.6 }}>{err.error}</div>
        {mismatch && (
          <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
            <div style={{ flex: 1, padding: 10, background: '#fff', borderRadius: 8, border: `1px solid ${BD}` }}><div style={{ fontSize: 10.5, color: '#667085', fontWeight: 700 }}>ERP COMPANY GSTIN</div><b>{err.erpGstin}</b></div>
            <div style={{ flex: 1, padding: 10, background: '#fff', borderRadius: 8, border: `1px solid ${BD}` }}><div style={{ fontSize: 10.5, color: '#667085', fontWeight: 700 }}>TALLY COMPANY GSTIN</div><b>{(err.tallyGstin || []).join(', ')}</b></div>
          </div>
        )}
        {err.code === 'TALLY' && (
          <ul style={{ fontSize: 12.5, color: '#475467', marginTop: 10, paddingLeft: 18, lineHeight: 1.7 }}>
            <li>Open <b>TallyPrime</b> and load the company.</li>
            <li>In TallyPrime: <b>F1 Help → Settings → Connectivity</b> → "TallyPrime acts as" <b>Server</b>, port <b>9000</b>.</li>
          </ul>
        )}
        <div style={{ fontSize: 11.5, color: '#667085', marginTop: 10 }}>No figures are shown until the GSTIN in Tally and in the ERP match. Nothing is ever written to Tally.</div>
      </div>
    );
  };

  return (
    <div style={{ fontFamily: F, background: '#F2F4F7', minHeight: '100%', padding: '12px 16px', boxSizing: 'border-box' }}>
      {/* toolbar */}
      <div style={{ ...card, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <div style={{ marginRight: 6 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#101828' }}>📊 Balance Sheet & P&L</div>
          <div style={{ fontSize: 11.5, color: '#667085' }}>
            From Tally (read-only), saved in the ERP
            {(() => {
              const src = tab === 'fy' ? fyRows : bs;
              if (!src) return null;
              return <> · <b>{src.company}</b> · GSTIN {src.gstin} <span style={{ color: '#067647', fontWeight: 800 }}>✓ matched</span></>;
            })()}
          </div>
        </div>
        <div style={{ display: 'flex', background: '#F2F4F7', borderRadius: 9, padding: 3, gap: 2 }}>
          {[['bs', 'Balance Sheet'], ['pl', 'Profit & Loss'], ['fy', 'FY Comparison']].map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} style={{ height: 30, padding: '0 14px', border: 'none', borderRadius: 7, cursor: 'pointer', fontFamily: F, fontSize: 12.5, fontWeight: 700,
              background: tab === k ? '#fff' : 'transparent', color: tab === k ? INK : '#475467', boxShadow: tab === k ? '0 1px 3px rgba(16,24,40,0.12)' : 'none' }}>{l}</button>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        {tab !== 'fy' && <FyDropdown value={fy} options={fyList} onChange={setFy} neu current={curFy} />}   {/* light style suits this white toolbar */}
        <label style={{ fontSize: 12, color: '#475467', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
          <input type="checkbox" checked={showZero} onChange={e => setShowZero(e.target.checked)} /> Show zero ledgers
        </label>
        {(() => {
          const src = tab === 'fy' ? fyRows : tab === 'pl' ? pl : bs;
          const at = src && (src.savedAt || src.fetchedAt);
          return (
            <div title="When these figures were last read from Tally and saved in the ERP" style={{ padding: '4px 10px', borderRadius: 8, fontSize: 11.5, lineHeight: 1.3,
              background: at ? '#F0F9FF' : '#FFFAEB', border: `1px solid ${at ? '#B9E6FE' : '#FEDF89'}`, color: at ? '#026AA2' : '#B54708' }}>
              <div style={{ fontWeight: 800 }}>Last updated</div>
              <div>{at ? <>{whenTxt(at)} · {agoTxt(at)}</> : 'never — not fetched yet'}</div>
            </div>
          );
        })()}
        {tab !== 'fy' && (
          <button onClick={fetchAllFys} disabled={loading || TALLY_PAUSED} title="Read the Balance Sheet and P&L of every FY from Tally and save them in the ERP"
            style={{ ...btn, opacity: loading ? 0.7 : 1 }}>
            {loadingAll ? 'Fetching all FYs…' : '⟳ Fetch all FYs'}
          </button>
        )}
        <button onClick={tab === 'fy' ? fetchAllFys : fetchFromTally} disabled={loading || TALLY_PAUSED} title={TALLY_PAUSED ? 'Paused — Tally fetch is switched off' : ''} style={{ ...btn, background: INK, color: '#fff', border: 'none', opacity: loading ? 0.7 : 1 }}>
          {loadingAll ? 'Fetching all FYs…' : loading ? 'Fetching from Tally…' : tab === 'fy' ? '⟳ Fetch all FYs from Tally' : `⟳ Fetch FY ${fy} from Tally`}
        </button>
      </div>

      {TALLY_PAUSED && (
        <div style={{ ...card, padding: 22, maxWidth: 760, margin: '20px auto', borderColor: '#FEDF89', background: '#FFFAEB' }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#B54708' }}>⏸ Tally fetch is paused</div>
          <div style={{ fontSize: 13, color: '#344054', marginTop: 8, lineHeight: 1.6 }}>
            TallyPrime showed an error and closed while figures were being read, so this page no longer contacts Tally.
            It will be switched back on only after the cause is found and fixed.
          </div>
        </div>
      )}
      {loadingAll && (
        <div style={{ ...card, padding: '12px 16px', marginBottom: 12, background: '#F0F9FF', borderColor: '#B9E6FE', color: '#026AA2', fontSize: 13 }}>
          ⏳ Reading the Balance Sheet and P&L of <b>every FY</b> from Tally, one report at a time so Tally is not overloaded.
          This takes about a minute — keep this page open. Each year is saved in the ERP as it arrives.
        </div>
      )}
      {serverOld && (
        <div style={{ ...card, padding: 18, maxWidth: 760, margin: '0 auto 12px', borderColor: '#FDA29B', background: '#FEF3F2' }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: '#B42318' }}>⚠ The ERP server needs a restart</div>
          <div style={{ fontSize: 13, color: '#344054', marginTop: 6 }}>
            It is running an older version that does not save Tally figures, so every visit asks to fetch again.
            Restart the ERP backend (<b>node server.js</b>), then reload this page.
          </div>
        </div>
      )}
      {!serverOld && !err && !loading && !loadingSaved && tab !== 'fy' && !bs && (
        <div style={{ ...card, padding: 30, textAlign: 'center', color: '#475467' }}>
          No saved figures for FY {fy} yet. Click <b>Fetch FY {fy} from Tally</b> — they'll be saved in the ERP for next time.
        </div>
      )}
      {loading && !bs && <div style={{ ...card, padding: 40, textAlign: 'center', color: '#667085' }}>Reading figures from Tally… (checking GSTIN first)</div>}
      {errorView()}

      {!err && bs && tab === 'bs' && (
        <div style={{ ...card, display: 'flex', overflow: 'hidden', minHeight: 420 }}>
          <Side title="Liabilities" heads={bs.liabilities} total={bs.totalLiabilities} />
          <div style={{ width: 1, background: '#98A2B3' }} />
          <Side title="Assets" heads={bs.assets} total={bs.totalAssets} />
        </div>
      )}
      {!err && bs && tab === 'bs' && Math.abs(bs.totalLiabilities - bs.totalAssets) > 0.5 && (
        <div style={{ marginTop: 8, fontSize: 12, color: '#B42318', fontWeight: 700 }}>⚠ Sides differ by {inrZ(bs.totalLiabilities - bs.totalAssets)} — check "Difference in opening balances" in Tally.</div>
      )}
      {!err && tab === 'pl' && plView()}
      {!err && tab === 'fy' && (fyRows ? fyView() : <div style={{ ...card, padding: 30, textAlign: 'center', color: '#667085' }}>{loading ? 'Reading each FY from Tally…' : <>No saved FY comparison yet. Click <b>Fetch all FYs from Tally</b>.</>}</div>)}
    </div>
  );
}
