/* New (beta) app frame: slim side nav + top bar around the normal pages.
 * Used instead of the classic Header / SidebarNav / SubNav when the person signed in from the
 * new sign-in page (utils/uiVersion).
 * Top bar: search (middle) · active company · profile menu (Profile settings, Chat, Logout). */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useCompany } from '../../context/CompanyContext';
import { useChat } from '../../context/ChatContext';
import { NAV_GROUPS } from '../../utils/navGroups';
import { canViewNav, can } from '../../utils/permissions';
import { PRODUCT_NAME } from '../../utils/brand';
import { Svg } from '../ui/Icon';
import { VOUCHERS, isTransactionPath } from '../VoucherBar';
import BetaClients from '../../pages/beta/BetaClients';
import BetaOrders from '../../pages/beta/BetaOrders';
import BetaProforma from '../../pages/beta/BetaProforma';
import BetaReceipt from '../../pages/beta/BetaReceipt';
import BetaDues from '../../pages/beta/BetaDues';
import BetaSales from '../../pages/beta/BetaSales';
import BetaDC from '../../pages/beta/BetaDC';
import BetaPasswords from '../../pages/beta/BetaPasswords';
import BetaVendors from '../../pages/beta/BetaVendors';
import BetaPO from '../../pages/beta/BetaPO';
import BetaPayment from '../../pages/beta/BetaPayment';
import BetaPurchaseDues from '../../pages/beta/BetaPurchaseDues';
import BetaPurchaseBill from '../../pages/beta/BetaPurchaseBill';
import BetaGRN from '../../pages/beta/BetaGRN';
import BetaReturns from '../../pages/beta/BetaReturns';
import BetaStock from '../../pages/beta/BetaStock';
import BetaRawMaterial, { RawStock } from '../../pages/beta/BetaRawMaterial';
import BetaItems from '../../pages/beta/BetaItems';
import BetaBG from '../../pages/beta/BetaBG';
import BetaWarranty from '../../pages/beta/BetaWarranty';
import ApprovalView from '../../pages/approval/View';
import Companies from '../../pages/admin/Companies';
import AdminUsers from '../../pages/admin/Users';

const F = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
const LAST_VOUCHER_KEY = 'bx-last-voucher';   // the voucher screen used last — V opens it again (like Tally)

/* true while the person is typing somewhere — single-letter keys must not fire then */
const typing = el => !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
/* side nav buttons — added one by one as decided */
const SIDE_NAV = [
  { key: 'so', label: 'Sales Order', icon: 'file', perm: 'salesOrder',
    sub: [
      { label: 'Client', path: '/beta/client' },
      { label: 'Order', path: '/beta/order' }, { label: 'Proforma Invoice', path: '/beta/proforma' }, { label: 'Receipt', path: '/beta/receipt' }, { label: 'Sales', path: '/beta/sales' }, { label: 'Delivery Challan', path: '/beta/delivery-challan' }, { label: 'Return Note', path: '/beta/return-note' },
      { label: 'Warranty Certificate', path: '/beta/warranty' }, { label: 'Bank Guarantee', path: '/beta/bank-guarantee', perm: 'accDeposit' }, { label: 'Dues', path: '/beta/dues' },
    ] },
  { key: 'po', label: 'Purchase Order', icon: 'cart', perm: 'purchaseOrder',
    sub: [
      { label: 'Vendor', path: '/beta/vendor' }, { label: 'PO', path: '/beta/po' }, { label: 'Payment', path: '/beta/payment' }, { label: 'Purchase', path: '/beta/purchase-bill' }, { label: 'Goods Receipt', path: '/beta/grn' }, { label: 'Return to Vendor', path: '/beta/return-vendor' }, { label: 'Dues', path: '/beta/purchase-dues' },
    ] },
  { key: 'mfg', label: 'Manufacturing', icon: 'factory', perm: 'mfgOrders',
    sub: [
      { label: 'Raw Material', path: '/beta/mfg/raw-material' },
    ] },
  { key: 'stock', label: 'Stock', icon: 'box', perms: ['stock', 'items'],
    sub: [
      { label: 'Stock Items', path: '/beta/items', perm: 'items' },
      { label: 'Material — where lying', path: '/beta/stock', perm: 'stock' },
      { label: 'Raw Material Stock', path: '/beta/raw-stock', perm: 'stock' },
    ] },
  { key: 'pm', label: 'Password Manager', icon: 'lock', perm: 'passwords', path: '/beta/passwords' },
  /* Admin: each page shows only to those allowed (perm 'admin' = admin role only) */
  { key: 'admin', label: 'Admin', icon: 'shield', perms: ['approvals', 'admin', 'userMgmt'],
    sub: [
      { label: 'Approvals', path: '/beta/admin/approvals', perm: 'approvals' },
      { label: 'Company', path: '/beta/admin/company', perm: 'admin' },
      { label: 'Users', path: '/beta/admin/users', perm: 'userMgmt' },
    ] },
];
const allowed = (user, perm) => (perm === 'admin' ? user?.role === 'admin' : can(user, perm, 'view'));

const sectionsOf = g => g.sections || (g.items ? [{ title: null, items: g.items }] : []);
const initials = s => (s || '').replace(/^M\/s\.?\s*/i, '').split(/\s+/).filter(w => /^[A-Za-z]/.test(w)).slice(0, 2).map(w => w[0].toUpperCase()).join('') || 'U';

const CSS = `
.bx { display:flex; height:100vh; height:calc(100vh / var(--ui-zoom, 1)); overflow:hidden; font-family:${F}; background:#F5F7FA; -webkit-font-smoothing:antialiased; }
.bx * { box-sizing:border-box; }

/* side nav — brand teal #03444f */
.bx-side { width:188px; flex-shrink:0; display:flex; flex-direction:column; background:#03444f; border-right:1px solid #023840; }
.bx-brand { height:40px; flex-shrink:0; display:flex; align-items:center; gap:7px; padding:0 12px; background:#023a43; border-bottom:1px solid rgba(255,255,255,.08); text-decoration:none; }
.bx-mark { width:20px; height:20px; flex-shrink:0; border-radius:4px; display:grid; place-items:center; color:#fff; font-weight:800; font-size:11px; background:#fff; color:#03444f; }
.bx-nav { flex:1; overflow-y:auto; padding:10px 8px; scrollbar-width:thin; scrollbar-color:rgba(255,255,255,.18) transparent; }
.bx-g { text-decoration:none; display:flex; align-items:center; gap:9px; width:100%; height:36px; padding:0 9px; border:1px solid rgba(255,255,255,.1); border-radius:7px; cursor:pointer;
  background:rgba(255,255,255,.06); color:#E8F3F4; font:600 12.5px ${F}; text-align:left; transition:background .15s, border-color .15s; }
.bx-g:hover { background:rgba(255,255,255,.12); border-color:rgba(255,255,255,.18); }
.bx-g.on { background:#fff; color:#03444f; border-color:#fff; box-shadow:0 2px 8px rgba(0,0,0,.18); }
.bx-g .ico { width:24px; height:24px; flex-shrink:0; border-radius:6px; display:grid; place-items:center; background:rgba(255,255,255,.12); color:#fff; }
.bx-g.on .ico { background:#03444f; color:#fff; }
.bx-g .lbl { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.bx-nav > div + div { margin-top:6px; }
.bx-g .chev { display:grid; opacity:.7; transition:transform .15s; }
.bx-g.open .chev { transform:rotate(90deg); }
.bx-sub { margin:5px 0 8px 12px; display:flex; flex-direction:column; gap:4px; }
.bx-i { display:block; width:100%; height:28px; padding:0 10px; border:1px solid rgba(255,255,255,.12); border-radius:6px; background:rgba(255,255,255,.07);
  cursor:pointer; text-align:left; font:500 12px ${F}; color:#E0EEEF; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
  box-shadow:0 1px 2px rgba(0,0,0,.15); transition:background .15s, border-color .15s; }
.bx-i:hover { background:rgba(255,255,255,.15); border-color:rgba(255,255,255,.24); color:#fff; }
.bx-i.cur { background:#fff; border-color:#fff; color:#03444f; font-weight:600; }
.bx-i:active { background:rgba(255,255,255,.2); box-shadow:none; }
.bx-brand b { font-size:12px; font-weight:700; color:#fff; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }

/* top bar — brand teal #03444f, 40px, one-line controls */
.bx-main { flex:1; min-width:0; display:flex; flex-direction:column; }
/* beta scrollbars: teal, not the browser blue/grey */
.bx-main * { scrollbar-width:thin; scrollbar-color:#7FA9AF #E3EEEF; }
.bx-main *::-webkit-scrollbar { width:10px; height:10px; }
.bx-main *::-webkit-scrollbar-track { background:#E3EEEF; }
.bx-main *::-webkit-scrollbar-thumb { background:#7FA9AF; border-radius:6px; border:2px solid #E3EEEF; }
.bx-main *::-webkit-scrollbar-thumb:hover { background:#03444f; }
.bx-main *::-webkit-scrollbar-corner { background:#E3EEEF; }
.bx-top { height:40px; flex-shrink:0; display:flex; align-items:center; gap:6px; padding:0 8px; position:relative; z-index:20;
  background:#03444f; border-bottom:1px solid #023840; color:#fff; }
.bx-grow { flex:1; min-width:0; }

.bx-search { position:relative; width:100%; max-width:420px; flex:0 1 420px; }
.bx-search input { width:100%; height:28px; padding:0 54px 0 28px; border:1px solid rgba(255,255,255,.18); border-radius:6px; background:rgba(255,255,255,.1); outline:none;
  font:400 12.5px ${F}; color:#fff; }
.bx-search input::placeholder { color:rgba(255,255,255,.6); }
.bx-search input:focus { background:#fff; color:#101828; border-color:#fff; }
.bx-search input:focus::placeholder { color:#98A2B3; }
.bx-search input:focus::placeholder { color:#98A2B3; }
.bx-search .s-ic { position:absolute; left:8px; top:50%; transform:translateY(-50%); color:rgba(255,255,255,.65); pointer-events:none; display:grid; }
.bx-search input:focus ~ .s-ic, .bx-search:focus-within .s-ic { color:#98A2B3; }
.bx-search kbd { position:absolute; right:5px; top:50%; transform:translateY(-50%); padding:1px 5px; border-radius:3px; border:1px solid rgba(255,255,255,.25);
  font:500 10px ${F}; color:rgba(255,255,255,.7); pointer-events:none; background:none; }
.bx-search:focus-within kbd { color:#98A2B3; border-color:#EAECF0; }
.bx-res { position:absolute; left:0; right:0; top:32px; z-index:50; padding:4px; border-radius:6px; background:#fff; border:1px solid #D0D5DD;
  box-shadow:0 10px 28px rgba(16,24,40,.18); max-height:360px; overflow-y:auto; }
.bx-res a { display:flex; align-items:center; gap:10px; padding:6px 9px; border-radius:4px; text-decoration:none; color:#101828; font-size:12.5px; }
.bx-res a small { margin-left:auto; color:#98A2B3; font-size:11px; white-space:nowrap; }
.bx-res a.sel, .bx-res a:hover { background:#E6F2F3; }
.bx-res .none { padding:10px 9px; font-size:12.5px; color:#667085; }

.bx-dd { position:relative; flex-shrink:0; }
.bx-btn { display:flex; align-items:center; gap:6px; height:30px; padding:0 6px 0 4px; border:1px solid transparent; border-radius:4px; background:none; cursor:pointer;
  font:inherit; color:#fff; text-align:left; }
.bx-btn:hover, .bx-btn[aria-expanded="true"] { background:rgba(255,255,255,.12); }
.bx-btn.co { border-color:rgba(255,255,255,.2); background:rgba(255,255,255,.06); max-width:260px; }
.bx-btn b { display:block; font-size:12.5px; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.bx-btn .nm { min-width:0; display:flex; align-items:baseline; gap:6px; }
.bx-btn small { font-size:10.5px; color:rgba(255,255,255,.65); text-transform:capitalize; white-space:nowrap; }
.bx-btn .cv { color:rgba(255,255,255,.6); display:grid; flex-shrink:0; }
.bx-co-av { width:22px; height:22px; flex-shrink:0; border-radius:4px; display:grid; place-items:center; font-size:9.5px; font-weight:700; color:#03444f; background:#D6ECEE; }
.bx-av { width:22px; height:22px; flex-shrink:0; border-radius:50%; display:grid; place-items:center; font-size:9.5px; font-weight:700; color:#fff; background:#fff; color:#03444f; position:relative; }
.bx-av .dot, .bx-mi .cnt { min-width:16px; height:16px; padding:0 4px; border-radius:99px; background:#D92D20; color:#fff; font-size:9.5px; font-weight:700; line-height:16px; text-align:center; }
.bx-av .dot { position:absolute; top:-6px; right:-8px; border:1.5px solid #03444f; box-sizing:content-box; height:13px; line-height:13px; min-width:13px; padding:0 3px; }
.bx-mi .cnt { margin-left:auto; }

.bx-pop { position:absolute; right:0; top:34px; z-index:60; min-width:210px; padding:4px; border-radius:6px; background:#fff; border:1px solid #D0D5DD;
  box-shadow:0 10px 28px rgba(16,24,40,.18); }
.bx-pop .hd { padding:7px 9px 6px; border-bottom:1px solid #F2F4F7; margin-bottom:3px; }
.bx-pop .hd b { display:block; font-size:12.5px; color:#101828; }
.bx-pop .hd small { display:block; font-size:11px; color:#667085; margin-top:1px; word-break:break-all; }
.bx-mi { display:flex; align-items:center; gap:9px; width:100%; padding:6px 9px; border:none; border-radius:4px; background:none; cursor:pointer;
  font:400 12.5px ${F}; color:#344054; text-align:left; text-decoration:none; }
.bx-mi:hover { background:#E6F2F3; color:#101828; }
.bx-mi .ico { color:#667085; display:grid; }
.bx-mi.danger { color:#B42318; }
.bx-mi.danger .ico { color:#D92D20; }
.bx-sep { height:1px; background:#F2F4F7; margin:3px 0; }

.bx-body { flex:1; min-height:0; display:flex; flex-direction:column; }
.bx-body > .content-area { flex:1; }

@media (max-width: 900px) {
  .bx-side { width:44px; }
  .bx-brand { padding:0 12px; }
  .bx-nav { padding:8px 4px; }
  .bx-g { justify-content:center; padding:0; }
  .bx-g .lbl, .bx-g .chev, .bx-sub { display:none; }
  .bx-brand b, .bx-btn .nm, .bx-btn .cv, .bx-search kbd { display:none; }
  .bx-top { padding:0 6px; gap:4px; }
  .bx-search input { padding-right:10px; }
}
`;

/* close a popup on outside click / Escape */
function useOutside(open, close, ref) {
  useEffect(() => {
    if (!open) return undefined;
    const down = e => { if (!ref.current?.contains(e.target)) close(); };
    const key = e => { if (e.key === 'Escape') close(); };
    document.addEventListener('mousedown', down);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('mousedown', down); document.removeEventListener('keydown', key); };
  }, [open]);   // eslint-disable-line react-hooks/exhaustive-deps
}

export default function BetaShell() {
  const { user, logout } = useAuth();
  const { companies = [], selectedCompany, selectCompany } = useCompany() || {};
  const chat = useChat();
  const navigate = useNavigate();
  const { pathname, search } = useLocation();

  const [menu, setMenu] = useState(null);   // 'co' | 'me'
  const sideNav = useMemo(() => SIDE_NAV.filter(n => (n.perms ? n.perms.some(p => allowed(user, p)) : can(user, n.perm, 'view')))
    .map(n => (n.sub ? { ...n, sub: n.sub.filter(x => !x.perm || allowed(user, x.perm)) } : n)), [user]);
  const [openNav, setOpenNav] = useState({});   // the one side nav button whose sub menu is open (opening one closes the others)
  const inSub = (n, p) => (n.sub || []).some(x => x.path && (p === x.path || p.startsWith(x.path + '/')));
  useEffect(() => { SIDE_NAV.forEach(n => { if (inSub(n, pathname)) setOpenNav({ [n.key]: true }); }); }, [pathname]);   // eslint-disable-line react-hooks/exhaustive-deps
  const [q, setQ] = useState('');
  const [qOpen, setQOpen] = useState(false);
  const [sel, setSel] = useState(0);
  const searchRef = useRef(null), searchBox = useRef(null), coRef = useRef(null), meRef = useRef(null);

  useEffect(() => { setMenu(null); setQOpen(false); }, [pathname, search]);
  useOutside(menu === 'co', () => setMenu(null), coRef);
  useOutside(menu === 'me', () => setMenu(null), meRef);
  useOutside(qOpen, () => setQOpen(false), searchBox);

  /* search: every page in the menu this user may open (one entry per page) */
  const allItems = useMemo(() => {
    const out = [], seen = new Set();
    const add = it => { if (!it.path || seen.has(it.path)) return; seen.add(it.path); out.push(it); };
    NAV_GROUPS.filter(g => canViewNav(user, g.key)).forEach(g => {
      if (g.path) add({ label: g.label, path: g.path, group: '' });
      sectionsOf(g).forEach(sec => sec.items.forEach(it => add({ label: it.label, path: it.path, group: g.label + (sec.title ? ` · ${sec.title}` : '') })));
    });
    return out;
  }, [user]);
  const results = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    return allItems.filter(it => { const hay = `${it.label} ${it.group}`.toLowerCase(); return words.every(w => hay.includes(w)); }).slice(0, 10);
  }, [q, allItems]);
  useEffect(() => setSel(0), [q]);
  const go = path => { setQ(''); setQOpen(false); searchRef.current?.blur(); navigate(path); };
  const onSearchKey = e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSel(s => Math.min(s + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel(s => Math.max(s - 1, 0)); }
    else if (e.key === 'Enter' && results[sel]) go(results[sel].path);
    else if (e.key === 'Escape') { setQOpen(false); searchRef.current?.blur(); }
  };

  /* keys: Ctrl+K = search, V = vouchers (last used voucher screen, like Tally) */
  const onTxn = isTransactionPath(pathname);
  useEffect(() => { if (onTxn) try { localStorage.setItem(LAST_VOUCHER_KEY, pathname); } catch { /* ignore */ } }, [onTxn, pathname]);
  useEffect(() => {
    const k = e => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); searchRef.current?.focus(); setQOpen(true); return; }
      if (e.ctrlKey || e.altKey || e.metaKey || e.shiftKey || e.repeat || onTxn) return;
      if (typing(e.target) || typing(document.activeElement) || document.querySelector('.ls-overlay')) return;
      if (e.key !== 'v' && e.key !== 'V') return;
      let p = null; try { p = localStorage.getItem(LAST_VOUCHER_KEY); } catch { /* ignore */ }
      e.preventDefault();
      navigate(p && isTransactionPath(p) ? p : VOUCHERS[0].path);
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onTxn, navigate]);

  const signOut = async () => { setMenu(null); try { await logout(); } finally { navigate('/beta/login', { replace: true }); } };
  const openChat = () => { setMenu(null); chat?.openPanel?.(); };

  const coName = selectedCompany?.companyName || 'Select company';
  const userName = user?.name || user?.username || 'User';
  const chatUnread = chat?.total || 0;

  return (
    <div className="bx">
      <style>{CSS}</style>

      <aside className="bx-side" aria-label="Side navigation">
        <Link to="/dashboard" className="bx-brand" title={PRODUCT_NAME}>
          <span className="bx-mark">S</span><b>{PRODUCT_NAME}</b>
        </Link>

        <nav className="bx-nav" aria-label="Main menu">
          {sideNav.map(n => {
            const open = !!openNav[n.key];
            return (
              <div key={n.key}>
                <button type="button" className={`bx-g${open ? ' open' : ''}${n.path && pathname.startsWith(n.path) ? ' on' : ''}`} title={n.label} aria-expanded={n.sub ? open : undefined}
                  onClick={() => (n.path && !n.sub ? navigate(n.path) : setOpenNav(o => (o[n.key] ? {} : { [n.key]: true })))}>
                  <span className="ico"><Svg name={n.icon} size={14} /></span>
                  <span className="lbl">{n.label}</span>
                  {n.sub && <span className="chev"><Svg name="chevRight" size={13} /></span>}
                </button>
                {open && n.sub && (
                  <div className="bx-sub">
                    {n.sub.map(x => <button key={x.label} type="button" className={`bx-i${x.path && pathname.startsWith(x.path) ? ' cur' : ''}`} onClick={() => x.path && navigate(x.path)}>{x.label}</button>)}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
      </aside>

      <div className="bx-main">
        <header className="bx-top">
          <div className="bx-grow" />

          {/* search — middle */}
          <div className="bx-search" ref={searchBox}>
            <span className="s-ic"><Svg name="search" size={14} /></span>
            <input ref={searchRef} value={q} placeholder="Search pages…" aria-label="Search pages"
              onChange={e => { setQ(e.target.value); setQOpen(true); }} onFocus={() => setQOpen(true)} onKeyDown={onSearchKey} />
            <kbd>Ctrl K</kbd>
            {qOpen && q.trim() && (
              <div className="bx-res" role="listbox">
                {results.length ? results.map((r, i) => (
                  <a key={r.path} href={r.path} className={i === sel ? 'sel' : ''} role="option" aria-selected={i === sel}
                    onMouseEnter={() => setSel(i)} onClick={e => { e.preventDefault(); go(r.path); }}>
                    {r.label}<small>{r.group}</small>
                  </a>
                )) : <div className="none">No page matches “{q}”.</div>}
              </div>
            )}
          </div>

          <div className="bx-grow" />

          {/* active company */}
          <div className="bx-dd" ref={coRef}>
            <button type="button" className="bx-btn co" onClick={() => setMenu(m => (m === 'co' ? null : 'co'))} title={coName} aria-haspopup="listbox" aria-expanded={menu === 'co'}>
              <span className="bx-co-av">{initials(coName)}</span>
              <span className="nm"><b>{coName}</b><small>Active company</small></span>
              <span className="cv"><Svg name="chevDown" size={13} /></span>
            </button>
            {menu === 'co' && (
              <div className="bx-pop" role="listbox" style={{ width: 280 }}>
                <div className="hd"><b>Companies</b><small>{companies.length} available</small></div>
                {companies.map(c => {
                  const on = c.companyId === selectedCompany?.companyId;
                  return (
                    <button key={c.companyId} type="button" role="option" aria-selected={on} className="bx-mi"
                      onClick={() => { setMenu(null); if (!on) selectCompany(c); }}>
                      <span className="bx-co-av" style={{ width: 24, height: 24, fontSize: 10 }}>{initials(c.companyName)}</span>
                      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: on ? 600 : 400 }}>{c.companyName}</span>
                      {on && <span style={{ color: '#03444f', display: 'grid' }}><Svg name="check" size={16} stroke={2.2} /></span>}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* profile — last */}
          <div className="bx-dd" ref={meRef}>
            <button type="button" className="bx-btn" onClick={() => setMenu(m => (m === 'me' ? null : 'me'))} aria-haspopup="menu" aria-expanded={menu === 'me'} aria-label="Profile">
              <span className="bx-av">{initials(userName)}{chatUnread > 0 && <span className="dot">{chatUnread > 99 ? '99+' : chatUnread}</span>}</span>
              <span className="nm"><b>{userName}</b><small>{user?.role || 'user'}</small></span>
              <span className="cv"><Svg name="chevDown" size={13} /></span>
            </button>
            {menu === 'me' && (
              <div className="bx-pop" role="menu">
                <div className="hd"><b>{userName}</b><small>{user?.email || user?.username}</small></div>
                <Link to="/profile" className="bx-mi" role="menuitem"><span className="ico"><Svg name="settings" size={16} /></span>Profile settings</Link>
                <button type="button" className="bx-mi" role="menuitem" onClick={openChat}>
                  <span className="ico"><Svg name="mail" size={16} /></span>Chat
                  {chatUnread > 0 && <span className="cnt">{chatUnread > 99 ? '99+' : chatUnread}</span>}
                </button>
                <div className="bx-sep" />
                <button type="button" className="bx-mi danger" role="menuitem" onClick={signOut}><span className="ico"><Svg name="logout" size={16} /></span>Logout</button>
              </div>
            )}
          </div>
        </header>

        <div className="bx-body">
          {pathname.startsWith('/beta/client') && <BetaClients key={selectedCompany?.companyId || 'none'} />}
          {pathname.startsWith('/beta/order') && <BetaOrders key={selectedCompany?.companyId || 'none'} />}
          {pathname.startsWith('/beta/proforma') && <BetaProforma key={selectedCompany?.companyId || 'none'} />}
          {pathname.startsWith('/beta/receipt') && <BetaReceipt key={selectedCompany?.companyId || 'none'} />}
          {pathname.startsWith('/beta/dues') && <BetaDues key={selectedCompany?.companyId || 'none'} />}
          {pathname.startsWith('/beta/sales') && <BetaSales key={selectedCompany?.companyId || 'none'} />}
          {pathname.startsWith('/beta/delivery-challan') && <BetaDC key={selectedCompany?.companyId || 'none'} />}
          {pathname.startsWith('/beta/passwords') && <BetaPasswords key={selectedCompany?.companyId || 'none'} />}
          {pathname.startsWith('/beta/vendor') && <BetaVendors key={selectedCompany?.companyId || 'none'} />}
          {pathname.startsWith('/beta/po') && <BetaPO key={selectedCompany?.companyId || 'none'} />}
          {pathname.startsWith('/beta/payment') && <BetaPayment key={selectedCompany?.companyId || 'none'} />}
          {pathname.startsWith('/beta/purchase-dues') && <BetaPurchaseDues key={selectedCompany?.companyId || 'none'} />}
          {pathname.startsWith('/beta/purchase-bill') && <BetaPurchaseBill key={selectedCompany?.companyId || 'none'} />}
          {pathname.startsWith('/beta/grn') && <BetaGRN key={selectedCompany?.companyId || 'none'} />}
          {pathname.startsWith('/beta/return-note') && <BetaReturns kind="client" key={`rn-${selectedCompany?.companyId || 'none'}`} />}
          {pathname.startsWith('/beta/return-vendor') && <BetaReturns kind="vendor" key={`rv-${selectedCompany?.companyId || 'none'}`} />}
          {pathname.startsWith('/beta/stock') && <BetaStock key={selectedCompany?.companyId || 'none'} />}
          {pathname.startsWith('/beta/raw-stock') && <RawStock key={selectedCompany?.companyId || 'none'} />}
          {pathname.startsWith('/beta/items') && <BetaItems key={selectedCompany?.companyId || 'none'} />}
          {pathname.startsWith('/beta/warranty') && <BetaWarranty key={selectedCompany?.companyId || 'none'} />}
          {pathname.startsWith('/beta/bank-guarantee') && <BetaBG key={selectedCompany?.companyId || 'none'} />}
          {pathname.startsWith('/beta/mfg/raw-material') && <BetaRawMaterial key={selectedCompany?.companyId || 'none'} />}
          {pathname.startsWith('/beta/admin/') && (
            <div style={{ height: '100%', overflow: 'auto', padding: 16, background: '#fff' }}>
              {pathname.startsWith('/beta/admin/approvals') && (allowed(user, 'approvals') ? <ApprovalView /> : <p>You do not have access to Approvals.</p>)}
              {pathname.startsWith('/beta/admin/company') && (allowed(user, 'admin') ? <Companies /> : <p>Only an Admin can manage companies.</p>)}
              {pathname.startsWith('/beta/admin/users') && (allowed(user, 'userMgmt') ? <AdminUsers /> : <p>You do not have access to User Management.</p>)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
