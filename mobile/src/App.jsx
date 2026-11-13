/* Super ERP — the Android app. One screen at a time (a stack: Back goes to the previous one, also the phone's Back key).
 * Setup (ERP address) → Login → Company → Home. Phase 1: dashboard, clients, sales orders, sales bills (PDF share),
 * receipts, expenses (with bill photos), dues, approvals, settings (PIN lock, company, update). */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { App as CapApp } from '@capacitor/app';
import logoImg from './assets/logo.png';
import { S, loadState, setP, cleanServer, testServer, login, logout, loadCompanies, pickCompany, onLoggedOut, list, get, errText,
  num, inr, inr2, short, dmy, today, daysSince, dead, can } from './api';
import { htmlToPdf, shareBlob } from './share';
import { printSalesBill } from '../../frontend/src/pages/beta/BetaSalesPrint.js';
import { printSO } from '../../frontend/src/pages/beta/BetaSOPrint.js';

export const VERSION = '1.2.0';
const Nav = createContext(null);
const useNav = () => useContext(Nav);

/* ── small parts ── */
function Top({ title, sub, back = true, right }) {
  const nav = useNav();
  return (
    <header className="top">
      {back ? <button type="button" className="ib" onClick={nav.back} aria-label="Back">‹</button> : <img className="logo" src={logoImg} alt="Super ERP" />}
      <div className="tt"><b>{title}</b>{sub && <small>{sub}</small>}</div>
      {right}
    </header>
  );
}
const Empty = ({ children }) => <div className="empty">{children}</div>;
const Loading = () => <div className="empty"><span className="spin" />Loading…</div>;
const Msg = ({ m }) => (m ? <div className={`msg ${m.ok ? 'ok' : 'err'}`}>{m.t}</div> : null);
const Search = ({ value, onChange, ph }) => <div className="search"><span>⌕</span><input value={value} onChange={e => onChange(e.target.value)} placeholder={ph} /></div>;
const phoneOf = s => String(s || '').replace(/[^\d+]/g, '');
const waLink = m => { let p = phoneOf(m).replace(/^\+/, ''); if (p.length === 10) p = `91${p}`; return `https://wa.me/${p}`; };
function Contact({ mobile, email }) {
  if (!mobile && !email) return null;
  return (
    <div className="acts">
      {mobile && <a className="act" href={`tel:${phoneOf(mobile)}`}>📞 Call</a>}
      {mobile && <a className="act wa" href={waLink(mobile)} target="_blank" rel="noreferrer">💬 WhatsApp</a>}
      {email && <a className="act" href={`mailto:${email}`}>✉ Mail</a>}
    </div>
  );
}
function useData(loader, deps) {
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  const reload = useCallback(() => { setErr(''); loader().then(setD).catch(e => setErr(errText(e, 'Could not load.'))); }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(reload, [reload]);
  return [d, reload, err];
}

/* ── Setup: the ERP address ── */
function Setup({ onDone }) {
  const MAC = '192.168.31.133';   // the office Mac that runs the ERP
  const [url, setUrl] = useState(S.server || MAC);
  const [busy, setBusy] = useState(false);
  const [m, setM] = useState(null);
  const go = async () => {
    const u = cleanServer(url);
    if (!u) return setM({ t: 'Enter your ERP address.' });
    setBusy(true); setM(null);
    try { await testServer(u); S.server = u; await setP('server', u); onDone(); }
    catch (e) { setM({ t: e.message }); }
    finally { setBusy(false); }
  };
  return (
    <div className="center">
      <div className="hero"><img className="logo big" src={logoImg} alt="Super ERP" /><h1>Super ERP</h1><p>Connect the app to your company's ERP</p></div>
      <div className="card">
        <label className="lbl">ERP address</label>
        <input className="in" value={url} onChange={e => setUrl(e.target.value)} placeholder="e.g. 192.168.1.10 or erp.mycompany.com" autoCapitalize="none" autoCorrect="off" inputMode="url" onKeyDown={e => e.key === 'Enter' && go()} />
        <small className="hint">The same address you open the ERP with in the browser (port too, if it has one — e.g. 192.168.1.10:5000).</small>
        {url !== MAC && <button type="button" className="btn" style={{ marginTop: 8 }} onClick={() => setUrl(MAC)}>🖥 Use office Mac ({MAC})</button>}
        <Msg m={m} />
        <button type="button" className="btn pri" onClick={go} disabled={busy}>{busy ? 'Checking…' : 'Connect'}</button>
      </div>
    </div>
  );
}

/* ── Login ── */
function Login({ onDone, onChangeServer }) {
  const [u, setU] = useState(S.remember?.username || S.user?.username || '');
  const [p, setPw] = useState('');
  const [keep, setKeep] = useState(true);
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [m, setM] = useState(null);
  const go = async () => {
    if (!u.trim() || !p) return setM({ t: 'Enter your username and password.' });
    setBusy(true); setM(null);
    try { await login(u.trim(), p, keep); onDone(); }
    catch (e) { setM({ t: errText(e, 'Could not sign in.') }); }
    finally { setBusy(false); }
  };
  return (
    <div className="center">
      <div className="hero"><img className="logo big" src={logoImg} alt="Super ERP" /><h1>Sign in</h1><p>{S.server.replace(/^https?:\/\//, '')}</p></div>
      <div className="card">
        <label className="lbl">Username or e-mail</label>
        <input className="in" value={u} onChange={e => setU(e.target.value)} autoCapitalize="none" autoCorrect="off" autoComplete="username" />
        <label className="lbl">Password</label>
        <div className="pw"><input className="in" type={show ? 'text' : 'password'} value={p} onChange={e => setPw(e.target.value)} autoComplete="current-password" onKeyDown={e => e.key === 'Enter' && go()} />
          <button type="button" onClick={() => setShow(s => !s)}>{show ? 'Hide' : 'Show'}</button></div>
        <label className="chk"><input type="checkbox" checked={keep} onChange={e => setKeep(e.target.checked)} />Keep me signed in on this phone</label>
        <Msg m={m} />
        <button type="button" className="btn pri" onClick={go} disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        <button type="button" className="lnk" onClick={onChangeServer}>Change ERP address</button>
      </div>
    </div>
  );
}

/* ── Company pick ── */
function Companies({ onDone, back }) {
  const [cs, , err] = useData(() => loadCompanies(), []);
  return (
    <div className="page">
      <Top title="Choose company" back={!!back} />
      {err && <Msg m={{ t: err }} />}
      {!cs ? <Loading /> : !cs.length ? <Empty>No company is open for your login.</Empty> : (
        <div className="list">{cs.map(c => (
          <button key={c.companyId} type="button" className={`row${c.companyId === S.companyId ? ' on' : ''}`} onClick={async () => { await pickCompany(c); onDone(); }}>
            <span className="av">{String(c.companyName || '?').replace(/^m\/s\.?\s*/i, '').slice(0, 1)}</span>
            <div className="tx"><b>{c.companyName}</b><small>{[c.city, c.gstin].filter(Boolean).join(' · ')}</small></div>
            {c.companyId === S.companyId && <span className="tick">✓</span>}
          </button>))}</div>)}
    </div>
  );
}

/* ── Home ── */
const fyStart = () => { const t = new Date(); const y = t.getMonth() >= 3 ? t.getFullYear() : t.getFullYear() - 1; return `${y}-04-01`; };
const ERP_CODES = { SOC: ['/beta/order?tab=create', 'Create sales order'], DC: ['/beta/delivery-challan?tab=list', 'Delivery challans'], DCC: ['/beta/delivery-challan?tab=create', 'Create DC + e-way bill'],
  SBC: ['/beta/sales?tab=create', 'Create bill / e-invoice'], CLNC: ['/beta/client?tab=create', 'Create client'], VEND: ['/beta/vendor', 'Vendors'], VENC: ['/beta/vendor?tab=create', 'Create vendor'],
  PO: ['/beta/po?tab=list', 'PO list'], POC: ['/beta/po?tab=create', 'Create PO'], PI: ['/beta/proforma', 'Proforma invoice'], JOB: ['/beta/jobcode', 'Jobcode'], GST: ['/beta/books/gst', 'GST returns'], LED: ['/beta/books/ledger', 'Ledger'] };
const SHORT = { SO: 'orders', SINV: 'bills', RCPT: 'receipt', REC: 'receipt', EXP: 'expense', EXPC: 'expense', CLNT: 'clients', SDUE: 'dues', AGE: 'dues', APR: 'approvals', DASH: 'home' };
function Home() {
  const nav = useNav();
  const [per, setPer] = useState('month');
  const [code, setCode] = useState('');
  const [d, reload] = useData(async () => {
    const [sb, pay, dues, so, appr] = await Promise.all([list('/api/bills', { type: 'sales' }), list('/api/accounts/payments'), get('/api/accounts/dues').catch(() => ({})), list('/api/sales-orders'),
      can('approvals', 'view') ? list('/api/approvals', { status: 'pending' }) : Promise.resolve([])]);
    return { sb, pay, dues, so, appr };
  }, [S.companyId]);
  const k = useMemo(() => {
    if (!d) return null;
    const from = per === 'month' ? `${today().slice(0, 8)}01` : fyStart();
    const inP = x => String(x || '').slice(0, 10) >= from;
    const sales = d.sb.filter(b => b.type !== 'purchase' && !dead(b.status));
    const rec = d.pay.filter(p => p.type === 'receipt' && /confirm|approv|posted|paid/i.test(String(p.status || '')));
    const recv = (d.dues.clientDues || []).filter(x => num(x.due) > 0.5 && !dead(x.status));
    const payb = (d.dues.vendorDues || []).filter(x => num(x.due) > 0.5 && !dead(x.status));
    return {
      rev: sales.filter(b => inP(b.billDate || b.createdAt)).reduce((t, b) => t + num(b.grandTotal), 0),
      col: rec.filter(p => inP(p.date || p.transactionDate)).reduce((t, p) => t + num(p.amount), 0),
      ord: d.so.filter(o => !dead(o.status) && inP(o.orderDate || o.createdAt)).reduce((t, o) => t + num(o.grandTotal || o.orderTotal), 0),
      recv: recv.reduce((t, x) => t + num(x.due), 0), over: recv.filter(x => daysSince(x.orderDate) > 30).reduce((t, x) => t + num(x.due), 0),
      pay: payb.reduce((t, x) => t + num(x.due), 0), appr: d.appr.length,
    };
  }, [d, per]);
  const goCode = () => {
    const c = code.trim().toUpperCase(); const s = SHORT[c];
    if (s) { setCode(''); nav.go(s); return; }
    const pg = ERP_CODES[c]; if (pg) { setCode(''); nav.go('erp', { path: pg[0], title: pg[1] }); }
  };
  const tiles = [
    ['receipt', '💰', 'Receipt', 'Money received', can('accReceipt', 'create') || can('salesOrder', 'view')],
    ['expense', '🧾', 'Expense', 'With bill photo', can('accExpense', 'create')],
    ['orders', '📋', 'Sales orders', 'View & share', can('salesOrder', 'view')],
    ['bills', '📄', 'Sales bills', 'PDF & share', can('salesBill', 'view')],
    ['clients', '👥', 'Clients', 'Call · WhatsApp', can('client', 'view')],
    ['dues', '⏰', 'Dues', 'Follow up', can('accDues', 'view') || can('salesOrder', 'view')],
    ['approvals', '✅', 'Approvals', k && k.appr ? `${k.appr} waiting` : 'Approve / reject', can('approvals', 'view')],
  ].filter(t => t[4]);
  return (
    <div className="page">
      <header className="top home">
        <img className="logo" src={logoImg} alt="Super ERP" />
        <button type="button" className="tt co" onClick={() => nav.go('companies')}><b>{S.company?.companyName || 'Company'}</b><small>Hi {String(S.user?.name || '').split(' ')[0]} · tap to change company</small></button>
        <button type="button" className="ib" onClick={() => nav.go('settings')} aria-label="Settings">⚙</button>
      </header>
      <div className="body">
        <button type="button" className="openmenu" onClick={() => nav.go('menu')}><span>☰</span><b>Open Menu</b><small>Create · edit · print — sales order, DC + e-way bill, bill / e-invoice, client, vendor, PO and every ERP page</small></button>
        <div className="seg"><button type="button" className={per === 'month' ? 'on' : ''} onClick={() => setPer('month')}>This month</button><button type="button" className={per === 'fy' ? 'on' : ''} onClick={() => setPer('fy')}>Year to date</button><button type="button" onClick={reload} aria-label="Refresh">↻</button></div>
        {!k ? <Loading /> : (
          <div className="kpis">
            <div className="kpi"><small>Revenue</small><b>{short(k.rev)}</b></div>
            <div className="kpi"><small>Collections</small><b>{short(k.col)}</b></div>
            <div className="kpi"><small>Orders booked</small><b>{short(k.ord)}</b></div>
            <div className="kpi warn" onClick={() => nav.go('dues')}><small>Receivables</small><b>{short(k.recv)}</b><em>{short(k.over)} over 30 days</em></div>
            <div className="kpi"><small>Payables</small><b>{short(k.pay)}</b></div>
            {can('approvals', 'view') && <div className="kpi" onClick={() => nav.go('approvals')}><small>Approvals</small><b>{k.appr}</b><em>waiting</em></div>}
          </div>)}
        <div className="code"><span>MENU</span><input value={code} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="Shortcut (SO, SINV, RCPT…)" onKeyDown={e => e.key === 'Enter' && goCode()} autoCapitalize="characters" /><button type="button" onClick={goCode}>Go</button></div>
        <div className="tiles">{tiles.map(([s, ic, t, sub]) => <button key={s} type="button" className="tile" onClick={() => nav.go(s)}><span className="ic">{ic}</span><b>{t}</b><small>{sub}</small></button>)}</div>
      </div>
    </div>
  );
}

/* ── Menu: boxes by module → boxes by page. Each page is the real ERP page (create, edit, print, e-way bill, e-invoice…) ── */
const MODS = [
  { k: 'sales', ic: '🛒', t: 'Sales', c: '#0B6E7C', items: [
    ['👤', 'Create client', '/beta/client?tab=create'], ['👥', 'Clients', '/beta/client'],
    ['📝', 'Create sales order', '/beta/order?tab=create'], ['📋', 'Sales orders', '/beta/order'],
    ['🚚', 'Create DC + e-way bill', '/beta/delivery-challan?tab=create'], ['📦', 'Delivery challans', '/beta/delivery-challan?tab=list'], ['🛣', 'Dispatch status', '/beta/delivery-challan?tab=status'],
    ['🧾', 'Create bill / e-invoice', '/beta/sales?tab=create'], ['📄', 'Sales bills', '/beta/sales?tab=list'], ['⏳', 'Bill pending', '/beta/sales?tab=pending'],
    ['📑', 'Proforma invoice', '/beta/proforma'], ['💰', 'Receipt', '/beta/receipt'], ['↩', 'Return note', '/beta/return-note'],
    ['🛡', 'Warranty certificate', '/beta/warranty'], ['🏁', 'Completion certificate', '/beta/completion'], ['🏦', 'BG / FD / SD', '/beta/bank-guarantee'], ['⏰', 'Dues', '/beta/dues']] },
  { k: 'purchase', ic: '🛍', t: 'Purchase', c: '#7C3AED', items: [
    ['🏭', 'Create vendor', '/beta/vendor?tab=create'], ['📇', 'Vendors', '/beta/vendor'],
    ['📝', 'Create PO', '/beta/po?tab=create'], ['📋', 'PO list', '/beta/po?tab=list'], ['⏳', 'PO approval pending', '/beta/po?tab=approval'],
    ['💸', 'Payment', '/beta/payment'], ['🧾', 'Purchase bill', '/beta/purchase-bill'], ['📥', 'Goods receipt', '/beta/grn'], ['↩', 'Return to vendor', '/beta/return-vendor'], ['⏰', 'Dues', '/beta/purchase-dues']] },
  { k: 'job', ic: '📁', t: 'Jobcode', c: '#B45309', items: [['📁', 'Jobcode', '/beta/jobcode']] },
  { k: 'mfg', ic: '⚙', t: 'Manufacturing', c: '#475569', items: [
    ['🗒', 'Job sheet', '/beta/mfg/job-sheet'], ['🧩', 'BOM', '/beta/mfg/bom'], ['🧱', 'Raw material', '/beta/mfg/raw-material'], ['📤', 'Material issue / return', '/beta/mfg/issue'],
    ['📅', 'Planning (MRP)', '/beta/mfg/mrp'], ['🔍', 'QC inspection', '/beta/mfg/qc'], ['💹', 'Production cost', '/beta/mfg/cost']] },
  { k: 'stock', ic: '📦', t: 'Stock', c: '#0369A1', items: [['📦', 'Stock items', '/beta/items'], ['📍', 'Material — where lying', '/beta/stock'], ['🧱', 'Raw material stock', '/beta/raw-stock']] },
  { k: 'acc', ic: '💳', t: 'Account', c: '#047857', items: [
    ['💸', 'Payment', '/beta/account/payment'], ['💰', 'Receipt', '/beta/account/receipt'], ['📓', 'Journal', '/beta/account/journal'],
    ['➖', 'Debit note', '/beta/account/debit-note'], ['➕', 'Credit note', '/beta/account/credit-note'], ['🧾', 'Add expense', '/beta/account/expense?tab=create'], ['📒', 'Expenses', '/beta/account/expense']] },
  { k: 'books', ic: '📚', t: 'Books & GST', c: '#BE185D', items: [
    ['📒', 'Ledger', '/beta/books/ledger'], ['🗂', 'Chart of accounts', '/beta/books/chart'], ['⚖', 'Trial balance', '/beta/books/trial'], ['📈', 'Profit & loss', '/beta/books/pl'],
    ['🏛', 'Balance sheet', '/beta/books/bs'], ['🏦', 'Cash / bank book', '/beta/books/cash'], ['🧮', 'GST returns', '/beta/books/gst'], ['🌐', 'GST — as per portal', '/beta/books/gst-portal'],
    ['✂', 'TDS', '/beta/books/tds'], ['⏳', 'Ageing', '/beta/books/ageing'], ['🏗', 'Fixed assets', '/beta/books/assets']] },
  { k: 'hr', ic: '🧑‍💼', t: 'HR', c: '#C2410C', items: [
    ['🧑‍💼', 'Employees', '/beta/hr/employees'], ['💻', 'Company assets', '/beta/hr/assets'], ['🕘', 'Attendance', '/beta/hr/attendance'], ['💵', 'Payroll', '/beta/hr/payroll'], ['📜', 'HR policy', '/beta/hr/policy']] },
  { k: 'ins', ic: '☂', t: 'Insurance', c: '#4338CA', items: [['☂', 'Policies', '/beta/insurance/policies'], ['📨', 'Claims', '/beta/insurance/claims']] },
  { k: 'pm', ic: '🔐', t: 'Passwords', c: '#334155', items: [['🔐', 'Password manager', '/beta/passwords']] },
  { k: 'admin', ic: '🛠', t: 'Admin', c: '#991B1B', items: [['✅', 'Approvals', '/beta/admin/approvals'], ['🏢', 'Company', '/beta/admin/company'], ['👤', 'Users', '/beta/admin/users']] },
  { k: 'me', ic: '🙂', t: 'Me', c: '#0F766E', items: [['🙂', 'My profile', '/beta/profile'], ['✍', 'My signature', '/beta/profile?tab=signature'], ['📊', 'Full dashboard', '/dashboard']] },
];
function Menu() {
  const nav = useNav();
  const [q, setQ] = useState('');
  const w = q.trim().toLowerCase();
  const hits = w ? MODS.flatMap(m => m.items.filter(i => i[1].toLowerCase().includes(w)).map(i => [...i, m])) : [];
  return (
    <div className="page">
      <Top title="Menu" sub="Tap a box" />
      <div className="body">
        <Search value={q} onChange={setQ} ph="Find a page (e.g. DC, PO, vendor)" />
        {w ? (
          <div className="boxes">{hits.map(([ic, t, path, m]) => <button key={path} type="button" className="box" style={{ '--c': m.c }} onClick={() => nav.go('erp', { path, title: t })}><span className="ic">{ic}</span><b>{t}</b><small>{m.t}</small></button>)}
            {!hits.length && <Empty>Nothing matches “{q}”.</Empty>}</div>
        ) : (
          <div className="boxes">{MODS.map(m => <button key={m.k} type="button" className="box mod" style={{ '--c': m.c }} onClick={() => nav.go('module', { k: m.k })}><span className="ic">{m.ic}</span><b>{m.t}</b><small>{m.items.length} {m.items.length === 1 ? 'page' : 'pages'}</small></button>)}</div>
        )}
      </div>
    </div>
  );
}
function Module({ k }) {
  const nav = useNav();
  const m = MODS.find(x => x.k === k) || MODS[0];
  return (
    <div className="page">
      <Top title={m.t} sub="Tap a box to open" />
      <div className="body"><div className="boxes">{m.items.map(([ic, t, path]) => <button key={path} type="button" className="box" style={{ '--c': m.c }} onClick={() => nav.go('erp', { path, title: t })}><span className="ic">{ic}</span><b>{t}</b></button>)}</div></div>
    </div>
  );
}
const b64Blob = (b64, mime) => { const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new Blob([u], { type: mime }); };
/* The real ERP, loaded once in the background after sign-in and kept open, so every page from the menu opens at once
 * (no reload). Shown only while an ERP page is the current screen. Files it makes (PDF, Excel, JSON) open the share sheet. */
function ErpHost({ cur, depth }) {
  const nav = useNav();
  const fr = useRef(null);
  const [src, setSrc] = useState('');
  const [ready, setReady] = useState(false);
  const [m, setM] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const waiting = useRef(null);
  const on = cur.s === 'erp';
  const { path, title } = on ? cur.props || {} : {};
  useEffect(() => {
    let off = false;
    get('/api/auth/me').catch(() => null).then(() => {   // renews the login first if it ran out
      if (!off) setSrc(`${S.server}/beta/app-idle#erpapp=1&t=${encodeURIComponent(S.token || '')}&c=${encodeURIComponent(S.companyId || '')}`);
    });
    return () => { off = true; };
  }, []);
  // open the asked page inside the loaded ERP
  useEffect(() => {
    if (!on || !path || !ready) return;
    let off = false;
    setLoading(true);
    get('/api/auth/me').catch(() => null).then(() => {
      if (off || !fr.current) return;
      fr.current.contentWindow.postMessage({ type: 'erp-go', path, t: S.token }, '*');
      setTimeout(() => setLoading(false), 350);
    });
    return () => { off = true; };
  }, [on, path, depth, ready]);
  const goBack = useCallback(() => {
    const w = fr.current && fr.current.contentWindow;
    if (!w || !ready) { nav.back(); return; }
    clearTimeout(waiting.current);
    waiting.current = setTimeout(() => nav.back(), 700);   // the page did not answer → just close it
    w.postMessage({ type: 'erp-back' }, '*');
  }, [nav, ready]);
  useEffect(() => {
    const onMsg = async e => {
      if (!fr.current || e.source !== fr.current.contentWindow) return;
      const d = e.data || {};
      if (d.type === 'erp-ready') setReady(true);
      if (d.type === 'erp-back-ok') clearTimeout(waiting.current);
      if (d.type === 'erp-close') { clearTimeout(waiting.current); if (document.querySelector('.erpframe.on')) nav.back(); }
      if (d.type === 'erp-toast') { setM(d.text); setTimeout(() => setM(''), 4000); }
      if (d.type === 'erp-file') {
        setBusy(true);
        try { await shareBlob(b64Blob(d.b64, d.mime), d.name); } catch (er) { setM(errText(er, 'Could not share the file.')); } finally { setBusy(false); }
      }
    };
    const hw = () => { if (document.querySelector('.erpframe.on')) goBack(); };
    window.addEventListener('message', onMsg); window.addEventListener('erp-hw-back', hw);
    return () => { window.removeEventListener('message', onMsg); window.removeEventListener('erp-hw-back', hw); clearTimeout(waiting.current); };
  }, [nav, goBack]);
  return (
    <div className={`page erpframe${on ? ' on' : ''}`} aria-hidden={!on}>
      <header className="top">
        <button type="button" className="ib" onClick={goBack} aria-label="Back">‹</button>
        <div className="tt"><b>{title}</b></div>
        <button type="button" className="ib" onClick={() => nav.go('menu')} aria-label="Menu">☰</button>
        <button type="button" className="ib" onClick={() => nav.home()} aria-label="Home">⌂</button>
      </header>
      {m && <div className="msg err" style={{ margin: 8 }}>{m}</div>}
      {busy && <div className="msg ok" style={{ margin: 8 }}>Opening share…</div>}
      <div className="erpwrap">
        {src && <iframe ref={fr} className="erpif" title="ERP" src={src} allow="camera; clipboard-write" />}
        {on && (!ready || loading) && <div className="erpload"><span className="spin" /><small>{ready ? 'Opening…' : 'Loading the ERP…'}</small></div>}
      </div>
    </div>
  );
}

/* ── Clients ── */
const clientName = c => c.companyName || c.clientName || c.name || '';
const mob = p => p.mobile || p.mobileNumber || p.phone || p.contactNumber || '';
function Clients() {
  const nav = useNav();
  const [q, setQ] = useState('');
  const [cs] = useData(() => list('/api/clients'), [S.companyId]);
  const rows = (cs || []).filter(c => !q || `${clientName(c)} ${c.city || ''} ${c.gstin || ''} ${(c.contactPersons || []).map(p => `${p.name} ${mob(p)}`).join(' ')}`.toLowerCase().includes(q.toLowerCase())).slice(0, 200);
  return (
    <div className="page">
      <Top title="Clients" sub={cs ? `${cs.length} clients` : ''} />
      <Search value={q} onChange={setQ} ph="Search name, city, GSTIN, mobile…" />
      {!cs ? <Loading /> : !rows.length ? <Empty>No client matches.</Empty> : (
        <div className="list">{rows.map(c => (
          <button key={c.clientId} type="button" className="row" onClick={() => nav.go('client', { c })}>
            <span className="av">{clientName(c).slice(0, 1)}</span>
            <div className="tx"><b>{clientName(c)}</b><small>{[c.city || c.billingCity, (c.contactPersons || [])[0]?.name].filter(Boolean).join(' · ')}</small></div><span className="chev">›</span>
          </button>))}</div>)}
    </div>
  );
}
function Client({ c }) {
  const nav = useNav();
  const [d] = useData(async () => {
    const [so, dues] = await Promise.all([list('/api/sales-orders'), get('/api/accounts/dues').catch(() => ({}))]);
    const nm = clientName(c).trim().toLowerCase();
    return { so: so.filter(o => String(o.customerId || o.clientId || '') === String(c.clientId) || String(o.customerName || o.clientName || '').trim().toLowerCase() === nm),
      dues: (dues.clientDues || []).filter(x => String(x.entityId || '') === String(c.clientId) || String(x.entityName || '').trim().toLowerCase() === nm).filter(x => num(x.due) > 0.5) };
  }, [c.clientId]);
  const people = (c.contactPersons || []).filter(p => p.name || mob(p) || p.email);
  return (
    <div className="page">
      <Top title={clientName(c)} sub={[c.city || c.billingCity, c.gstin].filter(Boolean).join(' · ')} />
      <div className="body">
        {(c.address || c.billingAddress) && <div className="card"><small className="lbl">Address</small><div>{[c.address || c.billingAddress, c.city || c.billingCity, c.state, c.pincode].filter(Boolean).join(', ')}</div></div>}
        {people.map((p, i) => (
          <div key={i} className="card"><b>{p.name || 'Contact'}</b>{p.designation && <small className="mut"> · {p.designation}</small>}<div className="mut">{[mob(p), p.email].filter(Boolean).join(' · ')}</div><Contact mobile={mob(p)} email={p.email} /></div>))}
        {!people.length && <Contact mobile={c.mobile || c.phone} email={c.email} />}
        {!d ? <Loading /> : <>
          <h3 className="h">Dues <span>{inr(d.dues.reduce((t, x) => t + num(x.due), 0))}</span></h3>
          {!d.dues.length ? <Empty>Nothing due.</Empty> : d.dues.map(x => (
            <div key={x.orderId} className="card row2"><div><b>{x.orderNo}</b><small className="mut">{dmy(x.orderDate)} · {daysSince(x.orderDate)} days</small></div><div className="r"><b>{inr(x.due)}</b><button type="button" className="mini" onClick={() => nav.go('receipt', { clientId: c.clientId, orderId: x.orderId })}>+ Receipt</button></div></div>))}
          <h3 className="h">Orders <span>{d.so.length}</span></h3>
          {d.so.slice(0, 30).map(o => <OrderRow key={o.orderId} o={o} />)}
        </>}
      </div>
    </div>
  );
}

/* ── Sales orders ── */
const STAT = s => { const k = String(s || '').toLowerCase(); return /approv|confirm|active/.test(k) ? 'g' : /pend|draft|submit/.test(k) ? 'a' : /cancel|reject/.test(k) ? 'r' : /clos|complet|deliver/.test(k) ? 'b' : ''; };
function OrderRow({ o }) {
  const nav = useNav();
  return (
    <button type="button" className="row" onClick={() => nav.go('order', { id: o.orderId })}>
      <div className="tx"><b>{o.orderNo || o.orderId}</b><small>{o.customerName || o.clientName} · {dmy(o.orderDate)}</small></div>
      <div className="r"><b>{short(o.grandTotal || o.orderTotal)}</b><span className={`st ${STAT(o.status)}`}>{o.status}</span></div>
    </button>
  );
}
function Orders() {
  const [q, setQ] = useState('');
  const [os] = useData(() => list('/api/sales-orders'), [S.companyId]);
  const rows = (os || []).filter(o => !q || `${o.orderNo} ${o.customerName || o.clientName} ${o.customerPO || ''} ${(o.items || []).map(i => i.description || i.itemName).join(' ')}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => String(b.orderDate || b.createdAt).localeCompare(String(a.orderDate || a.createdAt))).slice(0, 200);
  return (
    <div className="page">
      <Top title="Sales orders" sub={os ? `${os.length} orders` : ''} />
      <Search value={q} onChange={setQ} ph="Search order, client, PO, product…" />
      {!os ? <Loading /> : !rows.length ? <Empty>No order matches.</Empty> : <div className="list">{rows.map(o => <OrderRow key={o.orderId} o={o} />)}</div>}
    </div>
  );
}
function Order({ id }) {
  const nav = useNav();
  const [o] = useData(() => get(`/api/sales-orders/${id}`), [id]);
  const [busy, setBusy] = useState(false);
  const [m, setM] = useState(null);
  const print = async () => { setBusy(true); setM(null); try { await printSO({ order: o, company: S.company, user: S.user }); } catch (e) { setM({ t: errText(e, 'Could not prepare the PDF.') }); } finally { setBusy(false); } };
  return (
    <div className="page">
      <Top title={o ? o.orderNo || o.orderId : 'Order'} sub={o ? o.customerName || o.clientName : ''} />
      {!o ? <Loading /> : (
        <div className="body">
          <div className="card kv">
            <div><small>Order date</small><b>{dmy(o.orderDate)}</b></div><div><small>Status</small><b><span className={`st ${STAT(o.status)}`}>{o.status}</span></b></div>
            <div><small>Client PO</small><b>{o.customerPO || '—'}</b></div><div><small>PO date</small><b>{dmy(o.poDate) || '—'}</b></div>
            <div><small>Delivery due</small><b>{dmy(o.dueDate || o.deliveryDate) || '—'}</b></div><div><small>Payment terms</small><b>{o.paymentTerms || '—'}</b></div>
          </div>
          <h3 className="h">Products</h3>
          {(o.items || []).map((it, i) => (
            <div key={i} className="card row2"><div><b>{it.description || it.material || it.itemName}</b><small className="mut">{num(it.qty)} {it.unit} × {inr2(it.rate)} · GST {num(it.gst ?? it.gstPercent)}%</small></div><div className="r"><b>{inr(num(it.qty) * num(it.rate))}</b></div></div>))}
          <div className="card tot"><span>Grand total (incl. GST)</span><b>{inr2(o.grandTotal || o.orderTotal)}</b></div>
          <Msg m={m} />
          <div className="bar2">
            <button type="button" className="btn" onClick={print} disabled={busy}>{busy ? 'Preparing…' : '📄 Order PDF'}</button>
            <button type="button" className="btn pri" onClick={() => nav.go('receipt', { clientId: o.customerId || o.clientId, clientName: o.customerName || o.clientName, orderId: o.orderId })}>💰 Receipt</button>
          </div>
        </div>)}
    </div>
  );
}

/* ── Sales bills ── */
function Bills() {
  const nav = useNav();
  const [q, setQ] = useState('');
  const [bs] = useData(() => list('/api/bills', { type: 'sales' }), [S.companyId]);
  const rows = (bs || []).filter(b => b.type !== 'purchase').filter(b => !q || `${b.billNo} ${b.partyName} ${b.ewayBillNo || ''}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => String(b.billDate || b.createdAt).localeCompare(String(a.billDate || a.createdAt))).slice(0, 200);
  return (
    <div className="page">
      <Top title="Sales bills" sub={bs ? `${rows.length} shown` : ''} />
      <Search value={q} onChange={setQ} ph="Search bill no., client, e-way bill…" />
      {!bs ? <Loading /> : !rows.length ? <Empty>No bill matches.</Empty> : (
        <div className="list">{rows.map(b => (
          <button key={b.billId} type="button" className="row" onClick={() => nav.go('bill', { id: b.billId })}>
            <div className="tx"><b>{b.billNo || b.billId}</b><small>{b.partyName} · {dmy(b.billDate)}</small></div>
            <div className="r"><b>{short(b.grandTotal)}</b>{b.irnNo ? <span className="st g">e-Invoice</span> : <span className={`st ${STAT(b.status)}`}>{b.status}</span>}</div>
          </button>))}</div>)}
    </div>
  );
}
function Bill({ id }) {
  const [b] = useData(() => get(`/api/bills/${id}`, { type: 'sales' }), [id]);
  const [busy, setBusy] = useState(false);
  const [m, setM] = useState(null);
  const pdf = async () => {
    setBusy(true); setM(null);
    try {
      const order = b.orderId ? await get(`/api/sales-orders/${b.orderId}`).catch(() => ({})) : {};
      await printSalesBill({ b, order, company: S.company, user: S.user });
    } catch (e) { setM({ t: errText(e, 'Could not prepare the PDF.') }); } finally { setBusy(false); }
  };
  return (
    <div className="page">
      <Top title={b ? b.billNo || b.billId : 'Bill'} sub={b ? b.partyName : ''} />
      {!b ? <Loading /> : (
        <div className="body">
          <div className="card kv">
            <div><small>Bill date</small><b>{dmy(b.billDate)}</b></div><div><small>Status</small><b>{b.status || '—'}</b></div>
            <div><small>Party GSTIN</small><b>{b.partyGstin || '—'}</b></div><div><small>E-way bill</small><b>{b.ewayBillNo || '—'}</b></div>
            {b.irnNo && <div className="w2"><small>IRN</small><b className="mono">{String(b.irnNo).slice(0, 24)}…</b></div>}
          </div>
          <h3 className="h">Items</h3>
          {(b.items || []).map((it, i) => (
            <div key={i} className="card row2"><div><b>{it.description}</b><small className="mut">{num(it.qty)} {it.unit} · GST {num(it.gstPct ?? it.gstPercent)}%</small></div><div className="r"><b>{inr(it.taxable || num(it.qty) * num(it.rate))}</b></div></div>))}
          <div className="card kv">
            <div><small>Taxable</small><b>{inr2(b.subTotal)}</b></div><div><small>GST</small><b>{inr2(num(b.totalGST) || num(b.totalIGST) + num(b.totalCGST) + num(b.totalSGST))}</b></div>
          </div>
          <div className="card tot"><span>Invoice total</span><b>{inr2(b.grandTotal)}</b></div>
          <Msg m={m} />
          <button type="button" className="btn pri" onClick={pdf} disabled={busy}>{busy ? 'Preparing…' : '📄 Invoice PDF — view & share'}</button>
        </div>)}
    </div>
  );
}

/* ── Receipt (money received) ── */
const MODES = ['NEFT', 'RTGS', 'IMPS', 'UPI', 'Cheque', 'Bank Transfer'];
function Receipt({ clientId, clientName: cn0, orderId }) {
  const nav = useNav();
  const [base] = useData(async () => {
    const [cl, dues, banks] = await Promise.all([list('/api/clients'), get('/api/accounts/dues').catch(() => ({})), list('/api/accounts/banks')]);
    return { cl, dues: dues.clientDues || [], banks: banks.filter(x => x.status !== 'inactive') };
  }, [S.companyId]);
  const [client, setClient] = useState(null);
  const [q, setQ] = useState('');
  const [f, setF] = useState({ date: today(), account: '', mode: 'NEFT', refNo: '', notes: '' });
  const [alloc, setAlloc] = useState({});
  const [busy, setBusy] = useState(false);
  const [m, setM] = useState(null);
  useEffect(() => {
    if (!base || client) return;
    const c = base.cl.find(x => String(x.clientId) === String(clientId)) || (cn0 && base.cl.find(x => clientName(x).trim().toLowerCase() === String(cn0).trim().toLowerCase()));
    if (c) setClient(c);
    if (base.banks.length === 1) setF(o => ({ ...o, account: String(base.banks[0].bankId) }));
  }, [base]); // eslint-disable-line react-hooks/exhaustive-deps
  const orders = useMemo(() => (!base || !client ? [] : base.dues.filter(x => (String(x.entityId || '') === String(client.clientId) || String(x.entityName || '').trim().toLowerCase() === clientName(client).trim().toLowerCase()) && num(x.due) > 0.5 && !dead(x.status))), [base, client]);
  useEffect(() => { if (orderId && orders.some(o => String(o.orderId) === String(orderId))) setAlloc(a => (Object.keys(a).length ? a : { [orderId]: String(num(orders.find(o => String(o.orderId) === String(orderId)).due)) })); }, [orders, orderId]);
  const total = Object.values(alloc).reduce((t, v) => t + num(v), 0);
  const isCash = f.account === 'cash';
  const save = async status => {
    const used = orders.filter(o => num(alloc[o.orderId]) > 0);
    if (!client) return setM({ t: 'Choose the client.' });
    if (!f.account) return setM({ t: 'Choose the account the money came into.' });
    if (!used.length) return setM({ t: 'Enter the amount against at least one order.' });
    if (!isCash && !f.refNo.trim()) return setM({ t: f.mode === 'Cheque' ? 'Enter the cheque no.' : 'Enter the UTR / transaction no.' });
    setBusy(true); setM(null);
    const name = clientName(client);
    const common = { type: 'receipt', entityType: 'client', entityId: client.clientId, party: name, entityName: name, date: f.date, paymentMode: isCash ? 'Cash' : f.mode,
      bankId: isCash ? '' : f.account, referenceNo: isCash ? '' : f.refNo.trim(), transactionDate: f.date, notes: f.notes.trim(), orderType: 'sales', status,
      receiptGroup: `RG${Date.now()}`, receiptTotal: total.toFixed(2), companyId: S.companyId };
    try {
      const ids = [];
      for (const o of used) { const r = await axios.post('/api/accounts/payments', { ...common, orderId: o.orderId, orderNo: o.orderNo || '', amount: num(alloc[o.orderId]).toFixed(2) }); ids.push(r.data?.paymentId); } // eslint-disable-line no-await-in-loop
      nav.replace('done', { title: 'Receipt saved', text: `₹ ${total.toLocaleString('en-IN')} from ${name} — ${status === 'pending' ? 'sent for approval' : 'saved'} (No. ${ids.join(', ')}).` });
    } catch (e) { setM({ t: errText(e, 'Could not save the receipt.') }); } finally { setBusy(false); }
  };
  if (!base) return <div className="page"><Top title="New receipt" /><Loading /></div>;
  if (!client) {
    const rows = base.cl.filter(c => !q || clientName(c).toLowerCase().includes(q.toLowerCase())).slice(0, 100);
    return (
      <div className="page">
        <Top title="New receipt" sub="Choose the client" />
        <Search value={q} onChange={setQ} ph="Search client…" />
        <div className="list">{rows.map(c => <button key={c.clientId} type="button" className="row" onClick={() => setClient(c)}><span className="av">{clientName(c).slice(0, 1)}</span><div className="tx"><b>{clientName(c)}</b><small>{c.city || ''}</small></div><span className="chev">›</span></button>)}</div>
      </div>
    );
  }
  return (
    <div className="page">
      <Top title="New receipt" sub={clientName(client)} right={<button type="button" className="lnk w" onClick={() => { setClient(null); setAlloc({}); }}>Change</button>} />
      <div className="body">
        <div className="card form">
          <label className="lbl">Date</label><input className="in" type="date" value={f.date} onChange={e => setF(o => ({ ...o, date: e.target.value }))} />
          <label className="lbl">Received in</label>
          <select className="in" value={f.account} onChange={e => setF(o => ({ ...o, account: e.target.value }))}><option value="">Choose…</option>{base.banks.map(bk => <option key={bk.bankId} value={bk.bankId}>{bk.bankName} {String(bk.accountNumber || '').slice(-4)}</option>)}<option value="cash">Cash</option></select>
          {!isCash && <><label className="lbl">Mode</label><select className="in" value={f.mode} onChange={e => setF(o => ({ ...o, mode: e.target.value }))}>{MODES.map(x => <option key={x}>{x}</option>)}</select>
            <label className="lbl">{f.mode === 'Cheque' ? 'Cheque no.' : 'UTR / transaction no.'}</label><input className="in" value={f.refNo} onChange={e => setF(o => ({ ...o, refNo: e.target.value }))} /></>}
          <label className="lbl">Notes</label><input className="in" value={f.notes} onChange={e => setF(o => ({ ...o, notes: e.target.value }))} placeholder="Optional" />
        </div>
        <h3 className="h">Against orders <span>{inr2(total)}</span></h3>
        {!orders.length ? <Empty>No order of this client has money due.</Empty> : orders.map(o => (
          <div key={o.orderId} className="card row2"><div><b>{o.orderNo}</b><small className="mut">Due {inr2(o.due)} · {dmy(o.orderDate)}</small></div>
            <div className="r"><input className="in amt" inputMode="decimal" value={alloc[o.orderId] || ''} placeholder="0" onChange={e => setAlloc(a => ({ ...a, [o.orderId]: e.target.value.replace(/[^\d.]/g, '') }))} />
              <button type="button" className="mini" onClick={() => setAlloc(a => ({ ...a, [o.orderId]: String(num(o.due)) }))}>Full</button></div></div>))}
        <Msg m={m} />
        <div className="bar2">
          {can('accReceipt', 'approve') || S.user?.role === 'admin' ? <button type="button" className="btn" onClick={() => save('confirmed')} disabled={busy}>Save</button> : null}
          <button type="button" className="btn pri" onClick={() => save('pending')} disabled={busy}>{busy ? 'Saving…' : 'Send for approval'}</button>
        </div>
      </div>
    </div>
  );
}

/* ── Expense (with bill photos) ── */
const CATS = ['Rent', 'Utilities', 'Internet / Telephone', 'Office Supplies', 'Travel & Conveyance', 'Printing & Stationery', 'Meals & Entertainment', 'Transport', 'Labour', 'Fuel & Power', 'Maintenance & Repairs', 'Professional Fees', 'Miscellaneous'];
function Expense() {
  const nav = useNav();
  const [f, setF] = useState({ date: today(), category: '', description: '', amount: '', gst: '0', rcm: false, rcmRate: '18', invoiceNo: '', paidTo: '', notes: '' });
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [m, setM] = useState(null);
  const set = k => e => setF(o => ({ ...o, [k]: e.target.value }));
  const base = num(f.amount), gst = f.rcm ? 0 : Math.round(base * num(f.gst)) / 100, total = base + gst;
  const save = async () => {
    if (!f.category) return setM({ t: 'Choose the category.' });
    if (!(base > 0)) return setM({ t: 'Enter the amount.' });
    setBusy(true); setM(null);
    try {
      const r = await axios.post('/api/accounts/expenses', { companyId: S.companyId, expenseType: 'office', expenseCategory: f.category, category: f.category, date: f.date, description: f.description.trim(),
        amount: f.amount, taxRate: f.rcm ? '0' : f.gst, grandTotal: total, invoiceNo: f.invoiceNo.trim(), notes: f.notes.trim(), status: 'approved', vendor: f.paidTo.trim(),
        rcm: f.rcm, rcmRate: f.rcm ? f.rcmRate : '', rcmTax: f.rcm ? Math.round(base * num(f.rcmRate)) / 100 : 0 });
      const id = r.data.expenseId;
      let up = '';
      if (files.length) { try { const fd = new FormData(); files.forEach(x => fd.append('files', x)); await axios.post(`/api/accounts/expenses/${id}/upload`, fd); up = ` ${files.length} photo${files.length === 1 ? '' : 's'} attached.`; } catch { up = ' The photos could not be uploaded — attach them from the desktop.'; } }
      nav.replace('done', { title: 'Expense saved', text: `EXP-${id} · ${f.category} · ${inr2(total)}.${up}` });
    } catch (e) { setM({ t: errText(e, 'Could not save the expense.') }); } finally { setBusy(false); }
  };
  return (
    <div className="page">
      <Top title="New expense" sub="Office expense" />
      <div className="body">
        <div className="card form">
          <label className="lbl">Date</label><input className="in" type="date" value={f.date} onChange={set('date')} />
          <label className="lbl">Category</label><select className="in" value={f.category} onChange={set('category')}><option value="">Choose…</option>{CATS.map(c => <option key={c}>{c}</option>)}</select>
          <label className="lbl">Description</label><input className="in" value={f.description} onChange={set('description')} placeholder="What was it for" />
          <label className="lbl">Amount ₹ (before GST)</label><input className="in" inputMode="decimal" value={f.amount} onChange={e => setF(o => ({ ...o, amount: e.target.value.replace(/[^\d.]/g, '') }))} />
          <label className="chk"><input type="checkbox" checked={f.rcm} onChange={e => setF(o => ({ ...o, rcm: e.target.checked, rcmRate: /transport|freight|conveyance/i.test(o.category) ? '5' : '18' }))} />Reverse charge (RCM) — we pay the GST</label>
          {f.rcm ? <><label className="lbl">RCM GST %</label><select className="in" value={f.rcmRate} onChange={set('rcmRate')}>{['5', '12', '18', '28'].map(x => <option key={x} value={x}>{x}%</option>)}</select></>
            : <><label className="lbl">GST %</label><select className="in" value={f.gst} onChange={set('gst')}>{['0', '5', '12', '18', '28'].map(x => <option key={x} value={x}>{x}%</option>)}</select></>}
          <label className="lbl">Bill / invoice no.</label><input className="in" value={f.invoiceNo} onChange={set('invoiceNo')} placeholder="Optional" />
          <label className="lbl">Paid to</label><input className="in" value={f.paidTo} onChange={set('paidTo')} placeholder="Shop / person (optional)" />
          <label className="lbl">Notes</label><input className="in" value={f.notes} onChange={set('notes')} placeholder="Optional" />
        </div>
        <div className="card">
          <b>Bill photos</b>
          <div className="photos">{files.map((x, i) => <div key={i} className="ph"><img src={URL.createObjectURL(x)} alt="" /><button type="button" onClick={() => setFiles(l => l.filter((_, j) => j !== i))}>×</button></div>)}
            <label className="ph add">📷<span>Take photo</span><input type="file" accept="image/*" capture="environment" hidden onChange={e => { const l = [...(e.target.files || [])]; e.target.value = ''; setFiles(x => [...x, ...l]); }} /></label>
            <label className="ph add">🖼<span>Gallery / PDF</span><input type="file" accept="image/*,.pdf" multiple hidden onChange={e => { const l = [...(e.target.files || [])]; e.target.value = ''; setFiles(x => [...x, ...l]); }} /></label></div>
        </div>
        <div className="card tot"><span>{f.rcm ? `Total (RCM ${f.rcmRate}% paid by us)` : `Total incl. GST ${inr2(gst)}`}</span><b>{inr2(total)}</b></div>
        <Msg m={m} />
        <button type="button" className="btn pri" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save expense'}</button>
      </div>
    </div>
  );
}

/* ── Dues ── */
function Dues() {
  const nav = useNav();
  const [q, setQ] = useState('');
  const [d] = useData(() => get('/api/accounts/dues'), [S.companyId]);
  const rows = ((d && d.clientDues) || []).filter(x => num(x.due) > 0.5 && !dead(x.status)).map(x => ({ ...x, days: daysSince(x.orderDate) }))
    .filter(x => !q || `${x.entityName} ${x.orderNo}`.toLowerCase().includes(q.toLowerCase())).sort((a, b) => num(b.due) - num(a.due));
  return (
    <div className="page">
      <Top title="Dues" sub={d ? `${inr(rows.reduce((t, x) => t + num(x.due), 0))} on ${rows.length} orders` : ''} />
      <Search value={q} onChange={setQ} ph="Search client or order…" />
      {!d ? <Loading /> : !rows.length ? <Empty>Nothing due.</Empty> : (
        <div className="list">{rows.slice(0, 200).map(x => (
          <div key={x.orderId} className="row">
            <span className={`days${x.days > 90 ? ' hi' : x.days > 30 ? ' mid' : ''}`}>{x.days}d</span>
            <div className="tx"><b>{x.entityName}</b><small>{x.orderNo}{x.contactPerson ? ` · ${x.contactPerson}` : ''}</small></div>
            <div className="r"><b>{short(x.due)}</b><div className="mini2">{x.mobile && <a href={`tel:${phoneOf(x.mobile)}`}>📞</a>}{x.mobile && <a href={waLink(x.mobile)} target="_blank" rel="noreferrer">💬</a>}<button type="button" onClick={() => nav.go('receipt', { clientId: x.entityId, clientName: x.entityName, orderId: x.orderId })}>💰</button></div></div>
          </div>))}</div>)}
    </div>
  );
}

/* ── Approvals ── */
function Approvals() {
  const [rows, reload] = useData(() => list('/api/approvals', { status: 'pending' }), [S.companyId]);
  const [busy, setBusy] = useState('');
  const [m, setM] = useState(null);
  const act = async (a, what) => {
    let reason = '';
    if (what === 'reject') { reason = window.prompt(`Reason for rejecting ${a.moduleLabel} ${a.refNo || a.refId}?`) || ''; if (!reason.trim()) return; }
    setBusy(a.approvalId); setM(null);
    try {
      await axios.put(`/api/approvals/${what}`, what === 'approve' ? { module: a.module, refId: a.refId, approvedBy: S.user?.name || 'Admin' } : { module: a.module, refId: a.refId, rejectedBy: S.user?.name || 'Admin', reason });
      setM({ ok: true, t: `${a.moduleLabel} ${a.refNo || a.refId} ${what === 'approve' ? 'approved' : 'rejected'}.` }); reload();
    } catch (e) { setM({ t: errText(e, 'Could not do that.') }); } finally { setBusy(''); }
  };
  return (
    <div className="page">
      <Top title="Approvals" sub={rows ? `${rows.length} waiting` : ''} />
      <div className="body">
        <Msg m={m} />
        {!rows ? <Loading /> : !rows.length ? <Empty>✓ Nothing waiting for approval.</Empty> : rows.map(a => (
          <div key={a.approvalId} className="card">
            <div className="row2"><div><span className="st a">{a.moduleLabel}</span> <b>{a.refNo || a.refId}</b><div className="mut">{a.party || '—'} · {dmy(a.date)}</div></div><div className="r"><b>{a.amount ? inr2(a.amount) : ''}</b></div></div>
            <div className="bar2">
              <button type="button" className="btn bad" disabled={!!busy} onClick={() => act(a, 'reject')}>Reject</button>
              <button type="button" className="btn pri" disabled={!!busy} onClick={() => act(a, 'approve')}>{busy === a.approvalId ? '…' : 'Approve'}</button>
            </div>
          </div>))}
      </div>
    </div>
  );
}

/* ── Done / Settings / PIN ── */
function Done({ title, text }) {
  const nav = useNav();
  return <div className="center"><div className="card done"><span className="big">✓</span><h2>{title}</h2><p>{text}</p><button type="button" className="btn pri" onClick={nav.home}>Home</button></div></div>;
}
function Settings({ onLogout, onServer }) {
  const nav = useNav();
  const [pin, setPin] = useState('');
  const [m, setM] = useState(null);
  const [upd, setUpd] = useState(null);
  const savePin = async () => { if (!/^\d{4}$/.test(pin)) return setM({ t: 'The PIN must be 4 digits.' }); S.pin = pin; await setP('pin', pin); setPin(''); setM({ ok: true, t: 'PIN set — the app asks for it when opened.' }); };
  const offPin = async () => { S.pin = ''; await setP('pin', null); setM({ ok: true, t: 'PIN removed.' }); };
  const check = async () => {
    setUpd({ t: 'Checking…' });
    try {
      const v = (await axios.get('/app/android/version.json', { params: { t: Date.now() } })).data || {};
      if (v.version && v.version !== VERSION) setUpd({ t: `Version ${v.version} is available${v.notes ? ` — ${v.notes}` : ''}.`, url: `${S.server}/app/android/${v.file || 'super-erp.apk'}` });
      else setUpd({ t: `You have the latest version (${VERSION}).` });
    } catch { setUpd({ t: 'No update information on the ERP server yet.' }); }
  };
  return (
    <div className="page">
      <Top title="Settings" />
      <div className="body">
        <div className="card kv"><div className="w2"><small>Signed in as</small><b>{S.user?.name} ({S.user?.username})</b></div><div className="w2"><small>ERP address</small><b>{S.server}</b></div><div className="w2"><small>Company</small><b>{S.company?.companyName}</b></div></div>
        <button type="button" className="btn" onClick={() => nav.go('companies', { back: true })}>Change company</button>
        <div className="card form">
          <b>App lock (PIN)</b><small className="mut">{S.pin ? 'A PIN is set.' : 'Ask for a 4-digit PIN when the app is opened.'}</small>
          <input className="in" inputMode="numeric" maxLength={4} type="password" value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, ''))} placeholder="New 4-digit PIN" />
          <div className="bar2"><button type="button" className="btn pri" onClick={savePin}>Set PIN</button>{S.pin && <button type="button" className="btn" onClick={offPin}>Remove PIN</button>}</div>
        </div>
        <Msg m={m} />
        <div className="card form"><b>App version {VERSION}</b><button type="button" className="btn" onClick={check}>Check for update</button>{upd && <div className="mut">{upd.t}</div>}{upd?.url && <a className="btn pri" href={upd.url} target="_blank" rel="noreferrer">Download update</a>}</div>
        <button type="button" className="btn" onClick={onServer}>Change ERP address</button>
        <button type="button" className="btn bad" onClick={onLogout}>Sign out</button>
      </div>
    </div>
  );
}
function Lock({ onOpen }) {
  const [p, setPin] = useState('');
  const [bad, setBad] = useState(false);
  useEffect(() => { if (p.length === 4) { if (p === S.pin) onOpen(); else { setBad(true); setTimeout(() => { setPin(''); setBad(false); }, 600); } } }, [p]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="center lock">
      <img className="logo big" src={logoImg} alt="Super ERP" /><h2>Enter PIN</h2>
      <div className={`dots${bad ? ' bad' : ''}`}>{[0, 1, 2, 3].map(i => <i key={i} className={i < p.length ? 'on' : ''} />)}</div>
      <div className="pad">{['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].map((k, i) => k ? <button key={i} type="button" onClick={() => setPin(x => (k === '⌫' ? x.slice(0, -1) : (x + k).slice(0, 4)))}>{k}</button> : <span key={i} />)}</div>
    </div>
  );
}

/* ── print viewer (the ERP's print code opens it) ── */
function Viewer() {
  const [v, setV] = useState(null);
  const [busy, setBusy] = useState(false);
  const [m, setM] = useState('');
  const box = useRef(null);
  useEffect(() => { const h = e => { setV(e.detail); setM(''); }; window.addEventListener('erp-preview', h); return () => window.removeEventListener('erp-preview', h); }, []);
  useEffect(() => { if (!v) return undefined; const k = CapApp.addListener('backButton', () => setV(null)); return () => { k.then(x => x.remove()); }; }, [v]);
  if (!v) return null;
  const { title, opts } = v;
  const share = async () => {
    setBusy(true); setM('');
    try { const blob = opts.pdfBlob || await htmlToPdf(opts.html); await shareBlob(blob, opts.fileName || title); }
    catch (e) { setM(errText(e, 'Could not make the PDF.')); } finally { setBusy(false); }
  };
  const w = box.current ? box.current.clientWidth : window.innerWidth;
  const k = Math.min(1, (w - 16) / 794);
  return (
    <div className="viewer">
      <header className="top"><button type="button" className="ib" onClick={() => setV(null)} aria-label="Close">✕</button><div className="tt"><b>{title}</b><small>Preview</small></div></header>
      <div className="vbody" ref={box}>
        {opts.html ? <div className="sheet" style={{ width: 794 * k, height: 1123 * k * 3 }}><iframe title="Preview" srcDoc={opts.html} style={{ width: 794, height: 1123 * 3, transform: `scale(${k})` }} /></div>
          : <div className="empty">📄 The PDF is ready.<br />Share it to WhatsApp, e-mail or save it.</div>}
      </div>
      {m && <div className="msg err">{m}</div>}
      <div className="vbar"><button type="button" className="btn pri" onClick={share} disabled={busy}>{busy ? 'Making PDF…' : '⤴ Share PDF'}</button></div>
    </div>
  );
}

/* ── the app ── */
export default function App() {
  const [ready, setReady] = useState(false);
  const [stage, setStage] = useState('');   // setup | login | company | app
  const [stack, setStack] = useState([{ s: 'home' }]);
  const [locked, setLocked] = useState(false);
  useEffect(() => {
    loadState().then(async st => {
      if (!st.server) setStage('setup');
      else if (!st.token && !st.remember) setStage('login');
      else {
        try { if (!st.token && st.remember) await login(st.remember.username, st.remember.password, true); await loadCompanies(); setStage(S.company ? 'app' : 'company'); }
        catch { setStage('login'); }
      }
      setLocked(!!st.pin); setReady(true);
    });
    onLoggedOut.fn = () => { setStage('login'); };
    const r = CapApp.addListener('resume', () => { if (S.pin) setLocked(true); });
    return () => { r.then(x => x.remove()); };
  }, []);
  const nav = useMemo(() => ({
    go: (s, props = {}) => setStack(st => [...st, { s, props }]),
    replace: (s, props = {}) => setStack(st => [...st.slice(0, -1), { s, props }]),
    back: () => setStack(st => (st.length > 1 ? st.slice(0, -1) : st)),
    home: () => setStack([{ s: 'home' }]),
  }), []);
  useEffect(() => {
    const h = CapApp.addListener('backButton', () => {
      if (document.querySelector('.viewer')) return;
      if (document.querySelector('.erpframe.on')) { window.dispatchEvent(new Event('erp-hw-back')); return; }
      setStack(st => { if (st.length > 1) return st.slice(0, -1); CapApp.exitApp(); return st; });
    });
    return () => { h.then(x => x.remove()); };
  }, []);
  if (!ready) return <div className="center"><span className="spin" /></div>;
  if (stage === 'setup') return <Setup onDone={() => setStage('login')} />;
  if (stage === 'login') return <Login onDone={async () => { try { await loadCompanies(); } catch { /* shown on the next screen */ } setStage(S.company ? 'app' : 'company'); setStack([{ s: 'home' }]); }} onChangeServer={() => setStage('setup')} />;
  if (stage === 'company') return <Nav.Provider value={nav}><Companies onDone={() => { setStage('app'); setStack([{ s: 'home' }]); }} /></Nav.Provider>;
  const cur = stack[stack.length - 1];
  const P = cur.props || {};
  const screens = {
    home: <Home />, menu: <Menu />, module: <Module {...P} />, erp: <div className="page" />, clients: <Clients />, client: <Client {...P} />, orders: <Orders />, order: <Order {...P} />, bills: <Bills />, bill: <Bill {...P} />,
    receipt: <Receipt {...P} />, expense: <Expense />, dues: <Dues />, approvals: <Approvals />, done: <Done {...P} />,
    companies: <Companies back onDone={() => nav.home()} />,
    settings: <Settings onLogout={async () => { await logout(); setStage('login'); }} onServer={() => setStage('setup')} />,
  };
  return (
    <Nav.Provider value={nav}>
      <div key={`${cur.s}-${stack.length}`} className="screen">{screens[cur.s] || <Home />}</div>
      <ErpHost key={`${S.server}|${S.companyId}`} cur={cur} depth={stack.length} />
      <Viewer />
      {locked && S.pin && <div className="lockov"><Lock onOpen={() => setLocked(false)} /></div>}
    </Nav.Provider>
  );
}
