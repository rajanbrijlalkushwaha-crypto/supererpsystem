import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCompany } from '../context/CompanyContext';
import { useAuth } from '../context/AuthContext';
import { useChat } from '../context/ChatContext';
import { useLock } from '../context/LockContext';
import { useNavTheme, NEU } from '../utils/navTheme';
import { useUiScale, SCALE_OPTIONS } from '../utils/uiScale';
import axios from 'axios';
import {
  Search, ChevronDown, Building2, LogOut, Settings,
  RefreshCw, Bell, User,
} from 'lucide-react';

const FONT = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
// Kept as TEAL/TEAL2 to avoid touching every reference below; both now resolve
// to the app's single orange accent (Direction A) instead of the old teal.
const TEAL = '#EA580C';
const TEAL2= '#C2410C';

/* ── Top bar tokens — 'classic' = navy (matches SidebarNav), 'neu' = neumorphism.
   Every colour/shadow of the bar comes from here, so the toggle switches it all. ── */
const NAV_W_OPEN = 204, NAV_W_RAIL = 60;   // must match SidebarNav widths

const HDR_CLASSIC = {
  neu: false,
  bg: 'linear-gradient(90deg, #1B354D 0%, #22415C 40%, #2A4D6E 100%)',
  barBorder: '1px solid rgba(0,0,0,0.28)', barShadow: '0 2px 10px rgba(0,0,0,0.16)',
  edge: '#1F3B56',                          // badge rings sit on this colour
  line: 'rgba(255,255,255,0.12)',
  txt: 'rgba(255,255,255,0.86)', muted: 'rgba(255,255,255,0.55)', strong: '#fff',
  brandBg: 'rgba(0,0,0,0.14)',
  // icon buttons
  btnBg: 'transparent', btnHoverBg: 'rgba(255,255,255,0.12)', btnActiveBg: 'rgba(255,255,255,0.16)',
  btnShadow: 'none', btnHoverShadow: 'none', btnActiveShadow: 'none',
  btnColor: 'rgba(255,255,255,0.86)', btnHoverColor: '#fff',
  // search field
  fieldBg: 'rgba(255,255,255,0.08)', fieldBgFocus: 'rgba(255,255,255,0.16)',
  fieldBorder: 'rgba(255,255,255,0.14)', fieldBorderFocus: 'rgba(255,255,255,0.42)',
  fieldShadow: 'none', fieldShadowFocus: 'none', fieldText: '#fff',
  kbdBg: 'rgba(255,255,255,0.10)', kbdHoverBg: 'rgba(255,255,255,0.2)', kbdBorder: 'rgba(255,255,255,0.20)', kbdShadow: 'none',
  // pills (company switcher)
  pillBg: 'rgba(255,255,255,0.07)', pillHoverBg: 'rgba(255,255,255,0.12)', pillOpenBg: 'rgba(255,255,255,0.16)',
  pillBorder: 'rgba(255,255,255,0.14)', pillHoverBorder: 'rgba(255,255,255,0.3)', pillOpenBorder: 'rgba(255,255,255,0.42)',
  pillShadow: 'none', pillHoverShadow: 'none', pillOpenShadow: 'none',
  coTileBg: 'linear-gradient(135deg, #10B981, #047857)', coTileIcon: '#fff', coTileShadow: 'inset 0 1px 0 rgba(255,255,255,0.2)',
};
const HDR_NEU = {
  neu: true,
  bg: NEU.base,
  barBorder: 'none', barShadow: '0 5px 14px rgba(163,177,198,0.55)',
  edge: NEU.base,
  line: 'rgba(163,177,198,0.55)',
  txt: NEU.text, muted: NEU.muted, strong: NEU.strong,
  brandBg: NEU.base,
  btnBg: NEU.base, btnHoverBg: NEU.base, btnActiveBg: NEU.base,
  btnShadow: NEU.raisedSm, btnHoverShadow: NEU.raised, btnActiveShadow: NEU.inset,
  btnColor: NEU.text, btnHoverColor: NEU.accent,
  fieldBg: NEU.base, fieldBgFocus: NEU.base,
  fieldBorder: 'transparent', fieldBorderFocus: 'transparent',
  fieldShadow: NEU.inset, fieldShadowFocus: 'inset 4px 4px 9px #A3B1C6, inset -4px -4px 9px #FFFFFF', fieldText: NEU.strong,
  kbdBg: NEU.base, kbdHoverBg: NEU.base, kbdBorder: 'transparent', kbdShadow: NEU.raisedSm,
  pillBg: NEU.base, pillHoverBg: NEU.base, pillOpenBg: NEU.base,
  pillBorder: 'transparent', pillHoverBorder: 'transparent', pillOpenBorder: 'transparent',
  pillShadow: NEU.raisedSm, pillHoverShadow: NEU.raised, pillOpenShadow: NEU.inset,
  coTileBg: NEU.base, coTileIcon: '#1F2937', coTileShadow: NEU.raisedSm,
};
/* Current top-bar tokens; re-renders when the look is switched. */
const useHdrTokens = () => { const [theme] = useNavTheme(); return theme === 'neu' ? HDR_NEU : HDR_CLASSIC; };

/* Rounded-square icon button used across the top bar. */
const ghostBtn = (active, tk) => ({
  display:'flex', alignItems:'center', justifyContent:'center', position:'relative',
  width:32, height:32, borderRadius: tk.neu ? 10 : 8, flexShrink:0, cursor:'pointer',
  background: active ? tk.btnActiveBg : tk.btnBg,
  boxShadow: active ? tk.btnActiveShadow : tk.btnShadow,
  border:'1px solid transparent', color: active ? tk.btnHoverColor : tk.btnColor,
  transition:'background 0.12s, color 0.12s, box-shadow 0.15s',
});
const ghostIn = tk => e => {
  e.currentTarget.style.background = tk.btnHoverBg; e.currentTarget.style.boxShadow = tk.btnHoverShadow;
  e.currentTarget.style.color = tk.btnHoverColor;
};
const ghostOut = (active, tk) => e => {
  if (active) return;
  e.currentTarget.style.background = tk.btnBg; e.currentTarget.style.boxShadow = tk.btnShadow;
  e.currentTarget.style.color = tk.btnColor;
};
const countBadge = (urgent, tk) => ({
  position:'absolute', top:-3, right:-3, minWidth:16, height:16, padding:'0 3px', borderRadius:8,
  background: urgent ? '#DC2626' : '#F59E0B', color:'#fff', fontSize:9, fontWeight:800, lineHeight:1,
  display:'flex', alignItems:'center', justifyContent:'center', border:`2px solid ${tk.edge}`,
});

/* Switch Company menu in the soft (neumorphic) look: raised panel, the
   current company pressed in, other rows lift on hover. */
function CompanyMenuSoft({ companies, selectedCompany, onPick, onManage }) {
  const rowIn  = e => { e.currentTarget.style.boxShadow = NEU.raisedSm; };
  const rowOut = e => { e.currentTarget.style.boxShadow = 'none'; };
  return (
    <div style={{ position:'absolute', top:'calc(100% + 12px)', right:0, minWidth:290, zIndex:9999,
      background:NEU.base, borderRadius:16, boxShadow:'8px 8px 18px #A3B1C6, -8px -8px 18px #FFFFFF',
      padding:'10px 10px 12px', fontFamily:FONT }}>
      <div style={{ fontSize:9.5, fontWeight:800, color:NEU.muted, textTransform:'uppercase', letterSpacing:'1px', padding:'2px 8px 8px' }}>
        Switch Company
      </div>
      {companies.length === 0 ? (
        <div style={{ padding:'14px 8px', fontSize:12.5, color:NEU.text, textAlign:'center' }}>
          No companies.{' '}<span onClick={onManage} style={{ color:NEU.accent, cursor:'pointer', fontWeight:700 }}>Add one →</span>
        </div>
      ) : (
        <div style={{ maxHeight:260, overflowY:'auto', padding:'2px 4px', scrollbarWidth:'thin', scrollbarColor:'#A3B1C6 transparent' }}>
          {companies.map(co => {
            const isAct = selectedCompany?.companyId === co.companyId;
            return (
              <div key={co.companyId}
                onClick={() => { if (!isAct) onPick(co); }}
                onMouseEnter={isAct ? undefined : rowIn} onMouseLeave={isAct ? undefined : rowOut}
                style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 10px', margin:'4px 0', borderRadius:12,
                  cursor: isAct ? 'default' : 'pointer', background:NEU.base,
                  boxShadow: isAct ? NEU.inset : 'none', transition:'box-shadow 0.15s' }}>
                <span style={{ width:28, height:28, borderRadius:9, flexShrink:0, background:NEU.base,
                  boxShadow: isAct ? NEU.insetSm : NEU.raisedSm,
                  display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <Building2 size={14} color={isAct ? NEU.accent : '#059669'} strokeWidth={2} />
                </span>
                <span style={{ flex:1, minWidth:0 }}>
                  <span style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
                    <span style={{ fontSize:12.5, fontWeight:700, color: isAct ? NEU.accent : NEU.strong, lineHeight:1.3 }}>{co.companyName}</span>
                    {co.isDefault && (
                      <span style={{ fontSize:8.5, fontWeight:800, letterSpacing:'0.5px', color:NEU.accent,
                        padding:'2px 7px', borderRadius:8, background:NEU.base, boxShadow:NEU.insetSm }}>DEFAULT</span>
                    )}
                  </span>
                  <span style={{ display:'block', fontSize:10.5, color:NEU.muted, marginTop:2 }}>{co.gstin || co.city || ''}</span>
                </span>
                {isAct && <span title="Current company" style={{ width:7, height:7, borderRadius:'50%', background:NEU.accent, flexShrink:0 }} />}
              </div>
            );
          })}
        </div>
      )}
      <div onClick={onManage}
        onMouseEnter={e => { e.currentTarget.style.boxShadow = NEU.inset; }}
        onMouseLeave={e => { e.currentTarget.style.boxShadow = NEU.raisedSm; }}
        style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:6, marginTop:10, height:34, borderRadius:11,
          cursor:'pointer', background:NEU.base, boxShadow:NEU.raisedSm, transition:'box-shadow 0.15s',
          fontSize:12, fontWeight:700, color:NEU.accent }}>
        <Settings size={13} /> Manage Companies
      </div>
    </div>
  );
}

/* Display size of the whole app — Auto fits the screen (smaller on laptops). */
function UiScaleSelect() {
  const { pref, zoom, setPref } = useUiScale();
  const [theme] = useNavTheme();
  const neu = theme === 'neu';
  return (
    <label title={`Display size — ${pref === 'auto' ? `Auto (${Math.round(zoom * 100)}% for this screen)` : `${Math.round(zoom * 100)}%`}. Smaller fits more on a laptop screen.`}
      style={{ display:'flex', alignItems:'center', gap:5, height:32, padding:'0 6px', flexShrink:0, cursor:'pointer', borderRadius:10, fontFamily:FONT,
        background: neu ? NEU.base : 'transparent', boxShadow: neu ? NEU.raisedSm : 'none' }}>
      <span style={{ fontSize:12, fontWeight:800, color: neu ? NEU.accent : 'rgba(255,255,255,0.8)' }}>Aa</span>
      <select value={pref} onChange={e => setPref(e.target.value)}
        style={{ height:24, border:'none', borderRadius:6, fontSize:11, fontWeight:700, fontFamily:FONT, cursor:'pointer', outline:'none', padding:'0 2px',
          background: neu ? NEU.base : 'rgba(255,255,255,0.14)', color: neu ? NEU.text : '#fff' }}>
        {SCALE_OPTIONS.map(([k, l]) => <option key={k} value={k} style={{ color:'#101828' }}>{k === 'auto' ? `Auto ${Math.round(zoom * 100)}%` : l}</option>)}
      </select>
    </label>
  );
}

/* Switch in the top bar that turns the neumorphic look on/off. */
function NavThemeToggle() {
  const [theme, setTheme] = useNavTheme();
  const on = theme === 'neu';
  return (
    <button onClick={() => setTheme(on ? 'classic' : 'neu')} role="switch" aria-checked={on}
      title={on ? 'Soft (neumorphic) look is ON — click for the classic navy look' : 'Switch the top bar and side menu to the soft (neumorphic) look'}
      style={{ display:'flex', alignItems:'center', gap:7, height:32, padding:'0 8px', flexShrink:0, cursor:'pointer',
        borderRadius:10, border:'1px solid transparent', fontFamily:FONT,
        background: on ? NEU.base : 'transparent', boxShadow: on ? NEU.raisedSm : 'none' }}>
      <span style={{ fontSize:10, fontWeight:800, letterSpacing:'0.6px', textTransform:'uppercase',
        color: on ? NEU.accent : 'rgba(255,255,255,0.75)' }} className="hdr-hide-md">Soft</span>
      <span style={{ position:'relative', width:36, height:20, borderRadius:10, flexShrink:0,
        background: on ? NEU.base : 'rgba(255,255,255,0.18)',
        boxShadow: on ? NEU.insetSm : 'inset 0 1px 2px rgba(0,0,0,0.3)', transition:'background 0.2s' }}>
        <span style={{ position:'absolute', top:2, left: on ? 18 : 2, width:16, height:16, borderRadius:'50%',
          background: on ? NEU.base : '#fff', transition:'left 0.2s',
          boxShadow: on ? '2px 2px 4px #A3B1C6, -2px -2px 4px #FFFFFF' : '0 1px 3px rgba(0,0,0,0.35)',
          display:'flex', alignItems:'center', justifyContent:'center' }}>
          {on && <span style={{ width:6, height:6, borderRadius:'50%', background:NEU.accent }} />}
        </span>
      </span>
    </button>
  );
}

/* ── All navigable pages (command palette) ─────────────────────── */
const ALL_PAGES = [
  { section:'Dashboard',       label:'Dashboard',                  path:'/dashboard',                       color:'#3b82f6', keys:'home main' },
  { section:'Jobcode',         label:'All Jobcodes',               path:'/project/list',                    color:'#4f46e5', keys:'project list' },
  { section:'Jobcode',         label:'Project Close',              path:'/project/close',                   color:'#4f46e5', keys:'close finish' },
  { section:'Client',          label:'View Clients',               path:'/client/view',                     color:'#ec4899', keys:'customers list' },
  { section:'Client',          label:'Pending Clients',            path:'/client/pending',                  color:'#ec4899', keys:'approval' },
  { section:'Client',          label:'CRM',                        path:'/crm/view',                        color:'#ec4899', keys:'leads crm' },
  { section:'Vendor',          label:'All Vendors',                path:'/vendor/view',                     color:'#059669', keys:'suppliers list' },
  { section:'Vendor',          label:'Add Vendor',                 path:'/vendor/create',                   color:'#059669', keys:'new create' },
  { section:'Vendor',          label:'Pending Vendors',            path:'/vendor/pending',                  color:'#059669', keys:'approval' },
  { section:'Vendor',          label:'Self Registrations',         path:'/vendor/self-registrations',       color:'#059669', keys:'register' },
  { section:'Inventory',       label:'Items / Products',           path:'/items/view',                      color:'#0d9488', keys:'product catalogue' },
  { section:'Inventory',       label:'Create Item',                path:'/items/create',                    color:'#0d9488', keys:'new add' },
  { section:'Sales Order',     label:'All Sales Orders',           path:'/sales-order/view',                color:'#7c3aed', keys:'SO view list' },
  { section:'Sales Order',     label:'Create Sales Order',         path:'/sales-order/create',              color:'#7c3aed', keys:'new SO' },
  { section:'Sales Order',     label:'Pending Approval',           path:'/sales-order/pending',             color:'#7c3aed', keys:'approve' },
  { section:'Manufacturing',   label:'Manufacturing Orders',       path:'/manufacturing/orders',            color:'#9333ea', keys:'mfg production' },
  { section:'Manufacturing',   label:'Job Sheets',                 path:'/manufacturing/job-sheets',        color:'#9333ea', keys:'job work' },
  { section:'Manufacturing',   label:'Create Job Sheet',           path:'/manufacturing/job-sheets/create', color:'#9333ea', keys:'new job' },
  { section:'Manufacturing',   label:'Locations',                  path:'/manufacturing/locations',         color:'#9333ea', keys:'warehouse store' },
  { section:'Purchase Order',  label:'PO Tracking',                path:'/purchase-order/tracking',         color:'#ea580c', keys:'track PO' },
  { section:'Purchase Order',  label:'Create PO',                  path:'/purchase-order/create',           color:'#ea580c', keys:'new purchase' },
  { section:'Purchase Order',  label:'View / Edit POs',            path:'/purchase-order/view',             color:'#ea580c', keys:'list PO' },
  { section:'Purchase Order',  label:'Pending Approval',           path:'/purchase-order/pending',          color:'#ea580c', keys:'approve' },
  { section:'Sales Bill',      label:'Tax Invoices',               path:'/sales-bill',                      color:'#0891b2', keys:'invoice bill dispatch' },
  { section:'Purchase Bill',   label:'Purchase Bills',             path:'/purchase-bill',                   color:'#6d28d9', keys:'vendor invoice' },
  { section:'Account',         label:'Ledger Master',              path:'/account/ledger/master',           color:'#b45309', keys:'master setup' },
  { section:'Account',         label:'Account Groups',             path:'/account/groups/view',             color:'#b45309', keys:'groups setup' },
  { section:'Account',         label:'Expense Entry',              path:'/account/expense/create',          color:'#b45309', keys:'expense add' },
  { section:'Account',         label:'View Expenses',              path:'/account/expense/view',            color:'#b45309', keys:'expenses list' },
  { section:'Account',         label:'Payment to Vendor',          path:'/account/payment/create',          color:'#b45309', keys:'pay vendor outflow' },
  { section:'Account',         label:'Receipt from Client',        path:'/account/receipt/create',          color:'#b45309', keys:'receive client inflow' },
  { section:'Account',         label:'Journal Entry',              path:'/account/journal/view',            color:'#b45309', keys:'journal voucher' },
  { section:'Account',         label:'Debit Note',                 path:'/account/debit-note/view',         color:'#b45309', keys:'debit' },
  { section:'Account',         label:'Credit Note',                path:'/account/credit-note/view',        color:'#b45309', keys:'credit' },
  { section:'Account',         label:'Deposit',                    path:'/account/deposit/view',            color:'#b45309', keys:'deposit bank' },
  { section:'Account',         label:'View Balance / Dues',        path:'/account/dues',                    color:'#b45309', keys:'dues balance receivable payable' },
  { section:'Account',         label:'All Ledgers',                path:'/account/ledger/view',             color:'#b45309', keys:'ledger accounts' },
  { section:'Account',         label:'Bank Accounts',              path:'/account/bank/view',               color:'#b45309', keys:'bank' },
  { section:'Account',         label:'Statement',                  path:'/account/statement',               color:'#b45309', keys:'bank statement' },
  { section:'Account',         label:'Approval',                   path:'/account/approval',                color:'#b45309', keys:'approve' },
  { section:'Account',         label:'Financial Documents',        path:'/account/financial-docs',          color:'#b45309', keys:'pdf docs certificates gst pan' },
  { section:'GST',             label:'GST & Compliance',           path:'/gst/compliance',                  color:'#dc2626', keys:'tax return filing' },
  { section:'Communication',   label:'Communication Logs',         path:'/communication/logs',              color:'#0284c7', keys:'logs chat messages' },
  { section:'Approvals',       label:'Approvals',                  path:'/approval',                        color:'#16a34a', keys:'approve pending' },
  { section:'Reports',          label:'Day Book',                   path:'/reports/daybook',                 color:'#0284c7', keys:'daybook daily transactions' },
  { section:'Reports',          label:'Cash Book',                  path:'/reports/cashbook',                color:'#0284c7', keys:'cash transactions' },
  { section:'Reports',          label:'Monthly Summary',            path:'/reports/monthly',                 color:'#7c3aed', keys:'monthly report summary' },
  { section:'Reports',          label:'Sales Register',             path:'/reports/sales-register',          color:'#7c3aed', keys:'sales report register' },
  { section:'Reports',          label:'Purchase Register',          path:'/reports/purchase-register',       color:'#7c3aed', keys:'purchase report register' },
  { section:'Reports',          label:'P&L Statement',              path:'/reports/pnl',                     color:'#059669', keys:'profit loss statement' },
  { section:'Admin',            label:'Companies',                  path:'/admin/companies',                 color:'#475569', keys:'admin settings company' },
  { section:'Admin',            label:'Password Manager',           path:'/passwords',                       color:'#65a30d', keys:'passwords secrets' },
  { section:'Admin',            label:'Approvals',                  path:'/approval',                        color:'#475569', keys:'approve pending admin' },
];


function useClickOutside(ref, onClose) {
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [ref, onClose]);
}

/* ── Command Palette ── */
function CommandPalette({ onClose }) {
  const [q, setQ]         = useState('');
  const [active, setActive] = useState(0);
  const navigate = useNavigate();
  const ref      = useRef(null);
  const listRef  = useRef(null);
  useClickOutside(ref, onClose);
  useEffect(() => { ref.current?.querySelector('input')?.focus(); }, []);

  const filtered = q.trim() === ''
    ? ALL_PAGES.slice(0, 8)
    : ALL_PAGES.filter(p => {
        const t = q.toLowerCase();
        return p.label.toLowerCase().includes(t)
          || p.section.toLowerCase().includes(t)
          || (p.keys||'').toLowerCase().includes(t);
      });

  useEffect(() => { setActive(0); }, [q]);

  const go = (path) => { navigate(path); onClose(); };
  const onKey = (e) => {
    if (e.key === 'Escape')    { onClose(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(i => Math.min(i+1, filtered.length-1)); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setActive(i => Math.max(i-1, 0)); }
    if (e.key === 'Enter' && filtered[active]) go(filtered[active].path);
  };

  useEffect(() => {
    const el = listRef.current?.children[active];
    el?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const groups = [];
  const seen = new Map();
  filtered.forEach((p, idx) => {
    if (!seen.has(p.section)) { seen.set(p.section, groups.length); groups.push({ section: p.section, color: p.color, items: [] }); }
    groups[seen.get(p.section)].items.push({ ...p, idx });
  });

  return (
    <div style={{ position:'fixed', inset:0, zIndex:9999, background:'rgba(15,23,42,0.5)', backdropFilter:'blur(5px)', display:'flex', alignItems:'flex-start', justifyContent:'center', paddingTop:70 }}>
      <div ref={ref} style={{ width:580, background:'#fff', borderRadius:16, boxShadow:'0 24px 70px rgba(0,0,0,0.22)', border:'1px solid #E5E7EB', fontFamily:FONT, display:'flex', flexDirection:'column', maxHeight:'calc(100vh - 140px)' }}>
        <div style={{ display:'flex', alignItems:'center', gap:10, padding:'14px 18px', borderBottom:'1px solid #F1F5F9', flexShrink:0 }}>
          <Search size={17} color="#6366f1" strokeWidth={2.2} />
          <input value={q} onChange={e=>setQ(e.target.value)} onKeyDown={onKey}
            placeholder="Search any page, menu, feature…"
            style={{ flex:1, border:'none', outline:'none', fontSize:14.5, color:'#1e293b', fontFamily:'inherit', background:'transparent', fontWeight:500 }} />
          {q && <button onClick={()=>setQ('')} style={{ background:'none', border:'none', cursor:'pointer', color:'#9ca3af', fontSize:16, lineHeight:1, padding:0 }}>✕</button>}
          <kbd style={{ fontSize:10.5, color:'#94a3b8', border:'1px solid #e5e7eb', borderRadius:5, padding:'2px 7px', fontFamily:'monospace', flexShrink:0 }}>ESC</kbd>
        </div>
        <div ref={listRef} style={{ flex:1, overflowY:'auto', padding:'6px 0' }}>
          {filtered.length === 0 ? (
            <div style={{ padding:'36px 18px', textAlign:'center', color:'#9ca3af', fontSize:13 }}>
              <div style={{ fontSize:28, marginBottom:8 }}>🔍</div>
              No pages found for <strong>"{q}"</strong>
            </div>
          ) : groups.map(g => (
            <div key={g.section}>
              <div style={{ padding:'6px 18px 3px', display:'flex', alignItems:'center', gap:6 }}>
                <div style={{ width:7, height:7, borderRadius:'50%', background:g.color, flexShrink:0 }} />
                <span style={{ fontSize:10.5, fontWeight:700, color:'#9ca3af', textTransform:'uppercase', letterSpacing:'0.6px' }}>{g.section}</span>
              </div>
              {g.items.map(p => {
                const isAct = active === p.idx;
                return (
                  <div key={p.path} onClick={()=>go(p.path)} onMouseEnter={()=>setActive(p.idx)}
                    style={{ display:'flex', alignItems:'center', gap:12, padding:'9px 18px', cursor:'pointer', background:isAct?'#EEF2FF':'transparent', borderLeft:`3px solid ${isAct?'#6366f1':'transparent'}`, transition:'all 0.08s' }}>
                    <div style={{ width:32, height:32, borderRadius:8, background:isAct?g.color:'#F1F5F9', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', transition:'background 0.15s' }}>
                      <span style={{ fontSize:14 }}>
                        {p.section==='Dashboard'?'🏠':p.section==='Sales Order'?'📋':p.section==='Purchase Order'?'🛒':p.section==='Account'?'💰':p.section==='Vendor'?'🏢':p.section==='Client'?'👥':p.section==='Stock'?'📦':p.section==='Sales Bill'?'🧾':p.section==='Purchase Bill'?'📄':p.section==='Inventory'?'🗂️':p.section==='Manufacturing'?'🏭':p.section==='Tally'?'📥':p.section==='GST'?'🏷️':p.section==='Jobcode'?'📁':p.section==='Admin'?'⚙️':'📌'}
                      </span>
                    </div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:13.5, fontWeight:isAct?700:500, color:isAct?'#3730a3':'#1e293b', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{p.label}</div>
                      <div style={{ fontSize:11, color:'#9ca3af', marginTop:1 }}>{p.section}</div>
                    </div>
                    {isAct && <span style={{ fontSize:11, color:'#6366f1', fontWeight:700, flexShrink:0 }}>↵ open</span>}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        <div style={{ padding:'8px 18px', borderTop:'1px solid #F1F5F9', display:'flex', gap:16, alignItems:'center', flexShrink:0, background:'#FAFAFA', borderRadius:'0 0 16px 16px' }}>
          {[['↑↓','Navigate'],['↵','Open'],['Esc','Close']].map(([k,l]) => (
            <span key={k} style={{ display:'flex', alignItems:'center', gap:4, fontSize:11, color:'#9ca3af' }}>
              <kbd style={{ fontSize:10, background:'#F1F5F9', border:'1px solid #E2E8F0', borderRadius:4, padding:'1px 5px', fontFamily:'monospace', color:'#64748b' }}>{k}</kbd>{l}
            </span>
          ))}
          <span style={{ marginLeft:'auto', fontSize:11, color:'#c7d2fe', fontWeight:600 }}>{filtered.length} result{filtered.length!==1?'s':''}</span>
        </div>
      </div>
    </div>
  );
}

/* ── Notification Centre ── */
function NotificationCentre({ companyId, userId }) {
  const tk = useHdrTokens();
  const [open,   setOpen]   = useState(false);
  const [tab,    setTab]    = useState('dispatch'); // 'dispatch' | 'approvals'
  const [alerts, setAlerts] = useState([]);
  const [approvals, setApprovals] = useState([]);
  const ref = useRef(null);
  const navigate = useNavigate();
  useClickOutside(ref, () => setOpen(false));

  const load = useCallback(() => {
    if (!companyId) return;
    Promise.all([
      axios.get(`/api/sales-orders?companyId=${companyId}`),
      axios.get(`/api/bills?companyId=${companyId}&type=sales`).catch(() => ({ data: [] })),
    ]).then(([soRes, billRes]) => {
      const billedByOrder = {};
      (billRes.data || []).forEach(b => {
        const key = String(b.orderId);
        billedByOrder[key] = (billedByOrder[key] || 0) + (parseFloat(b.grandTotal) || 0);
      });
      const today = new Date(); today.setHours(0,0,0,0);
      const cutoff = new Date(today); cutoff.setDate(cutoff.getDate() + 5);
      const hits = (soRes.data || []).filter(o => {
        if (!o.deliveryDate) return false;
        if (o.status === 'cancelled' || o.status === 'completed') return false;
        const d = new Date(o.deliveryDate); d.setHours(0,0,0,0);
        if (d > cutoff) return false;
        const orderValue = parseFloat(o.grandTotal) || 0;
        const billed = billedByOrder[String(o.orderId)] || 0;
        if (orderValue > 0 && billed >= orderValue) return false;
        return true;
      }).sort((a, b) => new Date(b.deliveryDate) - new Date(a.deliveryDate));
      setAlerts(hits);
    }).catch(() => {});
  }, [companyId]);

  const loadApprovals = useCallback(() => {
    if (!userId) return;
    axios.get(`/api/notifications?userId=${userId}`)
      .then(res => setApprovals(Array.isArray(res.data) ? res.data : []))
      .catch(() => {});
  }, [userId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadApprovals(); }, [loadApprovals]);
  useEffect(() => {
    if (!userId) return;
    const t = setInterval(loadApprovals, 60000);
    return () => clearInterval(t);
  }, [userId, loadApprovals]);

  const unreadApprovals = approvals.filter(n => !n.read).length;

  const timeAgo = (iso) => {
    const diff = Math.max(0, Date.now() - new Date(iso).getTime());
    const mins = Math.floor(diff / 60000);
    if (mins < 1)   return 'just now';
    if (mins < 60)  return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24)   return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  };

  const openApproval = (n) => {
    if (!n.read) {
      axios.put(`/api/notifications/${n.id}/read`).catch(() => {});
      setApprovals(prev => prev.map(x => x.id === n.id ? { ...x, read: true } : x));
    }
    setOpen(false);
    if (n.link) navigate(n.link);
  };

  const markAllApprovalsRead = () => {
    if (!userId) return;
    axios.put(`/api/notifications/read-all?userId=${userId}`).catch(() => {});
    setApprovals(prev => prev.map(x => ({ ...x, read: true })));
  };

  const today = new Date(); today.setHours(0,0,0,0);
  const urgency = (dateStr) => {
    const d = new Date(dateStr); d.setHours(0,0,0,0);
    const diff = Math.round((d - today) / 86400000);
    if (diff < 0)   return { label:`${Math.abs(diff)}d overdue`, bg:'#FEE2E2', color:'#DC2626', dot:'#DC2626' };
    if (diff === 0) return { label:'Due Today',  bg:'#FEF3C7', color:'#92400E', dot:'#F59E0B' };
    if (diff === 1) return { label:'Tomorrow',   bg:'#FFF7ED', color:'#C2410C', dot:'#F97316' };
    return { label:`In ${diff} days`, bg:'#EFF6FF', color:'#1d4ed8', dot:'#3B82F6' };
  };
  const fmtDate = s => {
    if (!s) return '—';
    const [y,m,d] = s.split('-');
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${parseInt(d,10)} ${months[parseInt(m,10)-1]} ${y}`;
  };
  const overdue     = alerts.filter(o => new Date(o.deliveryDate).setHours(0,0,0,0) < today.getTime());
  const badgeCount  = alerts.length + unreadApprovals;
  const badgeUrgent = overdue.length > 0 || unreadApprovals > 0;

  return (
    <div ref={ref} style={{ position:'relative', flexShrink:0 }}>
      <button onClick={()=>setOpen(p=>!p)} title="Notifications"
        style={ghostBtn(open, tk)} onMouseEnter={ghostIn(tk)} onMouseLeave={ghostOut(open, tk)}>
        <Bell size={16} strokeWidth={2} />
        {badgeCount>0 && (
          <span style={countBadge(badgeUrgent, tk)}>
            {badgeCount>9?'9+':badgeCount}
          </span>
        )}
      </button>

      {open && (
        <div style={{ position:'absolute', top:'calc(100% + 8px)', right:0, width:380,
          background:'#fff', borderRadius:12, boxShadow:'0 16px 48px rgba(0,0,0,0.14)',
          border:'1px solid #E5E7EB', zIndex:9999, overflow:'hidden', fontFamily:FONT }}>
          <div style={{ background:'linear-gradient(135deg,#1e293b,#334155)', padding:'10px 16px 0' }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
              <div style={{ fontSize:13, fontWeight:700, color:'#fff' }}>Notifications</div>
              <button onClick={tab==='dispatch'?load:loadApprovals} title="Refresh" style={{ width:24, height:24, borderRadius:5, border:'1px solid #475569', background:'transparent', color:'#94a3b8', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}><RefreshCw size={11}/></button>
            </div>
            <div style={{ display:'flex', gap:4 }}>
              <button onClick={()=>setTab('dispatch')} style={{
                flex:1, padding:'6px 8px', fontSize:11, fontWeight:700, cursor:'pointer',
                background: tab==='dispatch' ? '#fff' : 'transparent',
                color: tab==='dispatch' ? '#1e293b' : '#94a3b8',
                border:'none', borderRadius:'6px 6px 0 0', fontFamily:FONT }}>
                Dispatch Alerts {alerts.length>0 && `(${alerts.length})`}
              </button>
              <button onClick={()=>setTab('approvals')} style={{
                flex:1, padding:'6px 8px', fontSize:11, fontWeight:700, cursor:'pointer',
                background: tab==='approvals' ? '#fff' : 'transparent',
                color: tab==='approvals' ? '#1e293b' : '#94a3b8',
                border:'none', borderRadius:'6px 6px 0 0', fontFamily:FONT }}>
                My Approvals {unreadApprovals>0 && `(${unreadApprovals})`}
              </button>
            </div>
          </div>

          {tab === 'dispatch' ? (
            <>
              <div style={{ maxHeight:380, overflowY:'auto' }}>
                {alerts.length===0 ? (
                  <div style={{ padding:'32px 16px', textAlign:'center' }}>
                    <div style={{ fontSize:32, marginBottom:8 }}>✅</div>
                    <div style={{ fontSize:13, fontWeight:600, color:'#374151' }}>All clear!</div>
                    <div style={{ fontSize:11, color:'#9ca3af', marginTop:3 }}>No orders due in the next 5 days</div>
                  </div>
                ) : alerts.map((o,i) => {
                  const urg = urgency(o.deliveryDate);
                  const items = (o.items||[]).slice(0,2);
                  const moreItems = (o.items||[]).length - 2;
                  return (
                    <div key={o.orderId} style={{ padding:'12px 16px', borderBottom:i<alerts.length-1?'1px solid #F1F5F9':'none', background:i%2===0?'#fff':'#FAFAFA' }}>
                      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:8 }}>
                        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                          <span style={{ width:8, height:8, borderRadius:'50%', background:urg.dot, flexShrink:0, display:'inline-block' }}/>
                          <span style={{ fontSize:12, fontWeight:800, color:'#1e293b' }}>{o.orderNo}</span>
                        </div>
                        <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:10, background:urg.bg, color:urg.color, whiteSpace:'nowrap' }}>{urg.label}</span>
                      </div>
                      <div style={{ fontSize:11, fontWeight:600, color:'#374151', marginTop:4, paddingLeft:14 }}>{o.customerName}</div>
                      <div style={{ fontSize:11, color:'#6B7280', paddingLeft:14, marginTop:2, display:'flex', alignItems:'center', gap:4 }}>
                        <span style={{ fontSize:10 }}>📅</span>
                        <span>Dispatch by <strong style={{ color:urg.color }}>{fmtDate(o.deliveryDate)}</strong></span>
                      </div>
                      {items.length>0 && (
                        <div style={{ marginTop:6, paddingLeft:14 }}>
                          {items.map((it,j) => (
                            <div key={j} style={{ fontSize:10.5, color:'#374151', display:'flex', gap:6, background:'#F8FAFF', border:'1px solid #E5EAF2', borderRadius:5, padding:'3px 8px', marginBottom:3, alignItems:'center' }}>
                              <span style={{ flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{it.description||it.itemCode}</span>
                              <span style={{ fontWeight:700, color:'#1e40af', flexShrink:0 }}>{it.qty} {it.unit}</span>
                            </div>
                          ))}
                          {moreItems>0 && <div style={{ fontSize:10, color:'#9ca3af', paddingLeft:2 }}>+{moreItems} more item{moreItems>1?'s':''}</div>}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              {alerts.length>0 && (
                <div style={{ padding:'8px 16px', background:'#F8FAFC', borderTop:'1px solid #F1F5F9', fontSize:11, color:'#9ca3af', textAlign:'center' }}>
                  Showing orders due within 5 days · Updated now
                </div>
              )}
            </>
          ) : (
            <>
              <div style={{ maxHeight:380, overflowY:'auto' }}>
                {approvals.length===0 ? (
                  <div style={{ padding:'32px 16px', textAlign:'center' }}>
                    <div style={{ fontSize:32, marginBottom:8 }}>✅</div>
                    <div style={{ fontSize:13, fontWeight:600, color:'#374151' }}>Nothing pending</div>
                    <div style={{ fontSize:11, color:'#9ca3af', marginTop:3 }}>You have no approval requests</div>
                  </div>
                ) : approvals.map((n,i) => (
                  <div key={n.id} onClick={()=>openApproval(n)}
                    style={{ padding:'12px 16px', borderBottom:i<approvals.length-1?'1px solid #F1F5F9':'none',
                      background: n.read ? (i%2===0?'#fff':'#FAFAFA') : '#EFF6FF', cursor:'pointer' }}
                    onMouseEnter={e=>{ e.currentTarget.style.background='#F8FAFC'; }}
                    onMouseLeave={e=>{ e.currentTarget.style.background = n.read ? (i%2===0?'#fff':'#FAFAFA') : '#EFF6FF'; }}>
                    <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:8 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                        {!n.read && <span style={{ width:7, height:7, borderRadius:'50%', background:'#3B82F6', flexShrink:0, display:'inline-block' }}/>}
                        <span style={{ fontSize:12, fontWeight:800, color:'#1e293b' }}>{n.recordLabel || n.module}</span>
                      </div>
                      <span style={{ fontSize:10, color:'#9ca3af', whiteSpace:'nowrap' }}>{timeAgo(n.createdAt)}</span>
                    </div>
                    <div style={{ fontSize:11, color:'#4B5563', marginTop:4, paddingLeft:n.read?0:13, lineHeight:1.4 }}>{n.message}</div>
                    {n.createdBy && <div style={{ fontSize:10, color:'#9ca3af', marginTop:3, paddingLeft:n.read?0:13 }}>Submitted by {n.createdBy}</div>}
                  </div>
                ))}
              </div>
              {approvals.length>0 && (
                <div style={{ padding:'8px 16px', background:'#F8FAFC', borderTop:'1px solid #F1F5F9', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <span style={{ fontSize:10.5, color:'#9ca3af' }}>{unreadApprovals>0?`${unreadApprovals} unread`:'All read'}</span>
                  {unreadApprovals>0 && (
                    <button onClick={markAllApprovalsRead} style={{ fontSize:10.5, fontWeight:700, color:'#EA580C', background:'transparent', border:'none', cursor:'pointer' }}>Mark all read</button>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Finacle-style shortcut-code box: type a menu code (POC, SOV…) and
   press Enter to jump straight there, with a matching autocomplete list. ── */
const SHORTCUT_CODES = [
  { code:'DSH', label:'Dashboard',               path:'/dashboard' },
  { code:'SOC', label:'Create Sales Order',      path:'/sales-order/create' },
  { code:'SOV', label:'Sales Order View',        path:'/sales-order/view' },
  { code:'SOP', label:'Sales Order Pending',     path:'/sales-order/pending' },
  { code:'POC', label:'Create Purchase Order',   path:'/purchase-order/create' },
  { code:'POV', label:'Purchase Order View',     path:'/purchase-order/view' },
  { code:'POP', label:'Purchase Order Pending',  path:'/purchase-order/pending' },
  { code:'POT', label:'PO Tracking',             path:'/purchase-order/tracking' },
  { code:'CLV', label:'Client View',             path:'/client/view' },
  { code:'CLP', label:'Client Pending',          path:'/client/pending' },
  { code:'CRM', label:'CRM',                     path:'/crm/view' },
  { code:'VEV', label:'Vendor View',             path:'/vendor/view' },
  { code:'VEC', label:'Vendor Create',           path:'/vendor/create' },
  { code:'VEP', label:'Vendor Pending',          path:'/vendor/pending' },
  { code:'ITV', label:'Items View',              path:'/items/view' },
  { code:'ITC', label:'Items Create',            path:'/items/create' },
  { code:'SBV', label:'Sales Bill / Tax Invoice',path:'/sales-bill' },
  { code:'PBV', label:'Purchase Bill',           path:'/purchase-bill' },
  { code:'LGM', label:'Ledger Master',           path:'/account/ledger/master' },
  { code:'LGV', label:'All Ledgers',             path:'/account/ledger/view' },
  { code:'DUE', label:'Dues / Balance',          path:'/account/dues' },
  { code:'EXC', label:'Expense Entry',           path:'/account/expense/create' },
  { code:'EXV', label:'View Expenses',           path:'/account/expense/view' },
  { code:'PAY', label:'Payment to Vendor',       path:'/account/payment/create' },
  { code:'REC', label:'Receipt from Client',     path:'/account/receipt/create' },
  { code:'JV',  label:'Journal Entry',           path:'/account/journal/view' },
  { code:'DN',  label:'Debit Note',              path:'/account/debit-note/view' },
  { code:'CN',  label:'Credit Note',             path:'/account/credit-note/view' },
  { code:'DEP', label:'Deposit',                 path:'/account/deposit/view' },
  { code:'BNK', label:'Bank Accounts',           path:'/account/bank/view' },
  { code:'STM', label:'Bank Statement',          path:'/account/statement' },
  { code:'BLS', label:'Balance Sheet (Tally)',   path:'/account/balance-sheet' },
  { code:'PNL', label:'Profit & Loss (Tally)',   path:'/account/balance-sheet?tab=pl' },
  { code:'GST', label:'GST & Compliance',        path:'/gst/compliance' },
  { code:'JBL', label:'Jobcode List',            path:'/project/list' },
  { code:'JBC', label:'Project Close',           path:'/project/close' },
  { code:'MFO', label:'Manufacturing Orders',    path:'/manufacturing/orders' },
  { code:'JSH', label:'Job Sheets',              path:'/manufacturing/job-sheets' },
  { code:'COM', label:'Communication Logs',      path:'/communication/logs' },
  { code:'APV', label:'Approvals',               path:'/approval' },
  { code:'RPD', label:'Day Book',                path:'/reports/daybook' },
  { code:'RPC', label:'Cash Book',                path:'/reports/cashbook' },
  { code:'RPM', label:'Monthly Summary',         path:'/reports/monthly' },
  { code:'RPS', label:'Sales Register',          path:'/reports/sales-register' },
  { code:'RPP', label:'Purchase Register',       path:'/reports/purchase-register' },
  { code:'PNL', label:'P&L Statement',           path:'/reports/pnl' },
  { code:'CMP', label:'Companies (Admin)',       path:'/admin/companies' },
  { code:'PWD', label:'Password Manager',        path:'/passwords' },
  { code:'AI',  label:'Epsilon AI',              path:'/epsilon-ai' },
];

function ShortcutBox({ onPalette }) {
  const tk = useHdrTokens();
  const [q, setQ]         = useState('');
  const [open, setOpen]   = useState(false);
  const [focus, setFocus] = useState(false);
  const [active, setActive] = useState(0);
  const ref = useRef(null);
  const navigate = useNavigate();
  useClickOutside(ref, () => setOpen(false));

  const term = q.trim().toUpperCase();
  const matches = term
    ? SHORTCUT_CODES.filter(s => s.code.startsWith(term) || s.label.toUpperCase().includes(term)).slice(0, 8)
    : [];

  useEffect(() => { setActive(0); }, [q]);

  const go = (s) => { navigate(s.path); setQ(''); setOpen(false); };

  const onKey = (e) => {
    if (e.key === 'Escape') { setOpen(false); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(i => Math.min(i+1, matches.length-1)); return; }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setActive(i => Math.max(i-1, 0)); return; }
    if (e.key === 'Enter') {
      if (matches[active]) go(matches[active]);
      else {
        const exact = SHORTCUT_CODES.find(s => s.code === term);
        if (exact) go(exact);
      }
    }
  };

  return (
    <div ref={ref} style={{ position:'relative', flexShrink:1, minWidth:150 }}>
      <div style={{
        display:'flex', alignItems:'center', gap:8, width:280, maxWidth:'100%', height:34,
        padding:'0 5px 0 11px', borderRadius: tk.neu ? 11 : 9, boxSizing:'border-box',
        background: focus ? tk.fieldBgFocus : tk.fieldBg,
        border:`1px solid ${focus ? tk.fieldBorderFocus : tk.fieldBorder}`,
        boxShadow: focus ? tk.fieldShadowFocus : tk.fieldShadow,
        transition:'background 0.12s, border-color 0.12s, box-shadow 0.15s',
      }}>
        <Search size={14} strokeWidth={2.2} color={tk.muted} style={{ flexShrink:0 }} />
        <input
          className={`hdr-search${tk.neu ? ' neu' : ''}`}
          value={q}
          onChange={e => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => { setOpen(true); setFocus(true); }}
          onBlur={() => setFocus(false)}
          onKeyDown={onKey}
          placeholder="Shortcut code… e.g. POC, SOV"
          title="Type a shortcut code (e.g. POC = Create PO, SOV = Sales Order View) and press Enter"
          style={{ flex:1, minWidth:0, height:'100%', padding:0, fontSize:12, fontWeight:600, fontFamily:FONT,
            background:'transparent', border:'none', color:tk.fieldText, outline:'none', letterSpacing:'0.2px' }}
        />
        {onPalette && (
          <button onClick={onPalette} title="Search all pages (Ctrl+K)"
            style={{ flexShrink:0, height:22, padding:'0 7px', borderRadius: tk.neu ? 7 : 5, cursor:'pointer',
              fontSize:10, fontWeight:700, fontFamily:FONT, letterSpacing:'0.3px',
              color:tk.txt, background:tk.kbdBg, border:`1px solid ${tk.kbdBorder}`, boxShadow:tk.kbdShadow }}
            onMouseEnter={e => { e.currentTarget.style.background = tk.kbdHoverBg; e.currentTarget.style.color = tk.btnHoverColor; }}
            onMouseLeave={e => { e.currentTarget.style.background = tk.kbdBg; e.currentTarget.style.color = tk.txt; }}>
            Ctrl K
          </button>
        )}
      </div>
      {open && matches.length > 0 && (
        <div style={{ position:'absolute', top:'calc(100% + 6px)', left:0, width:300,
          background:'#fff', borderRadius:10, boxShadow:'0 16px 40px rgba(0,0,0,0.18)',
          border:'1px solid #E5E7EB', zIndex:9999, overflow:'hidden', fontFamily:FONT }}>
          {matches.map((s, i) => (
            <div key={s.code} onClick={() => go(s)} onMouseEnter={() => setActive(i)}
              style={{ display:'flex', alignItems:'center', gap:9, padding:'8px 12px', cursor:'pointer',
                background: active === i ? '#EEF2FF' : '#fff' }}>
              <span style={{ fontSize:10, fontWeight:800, color:'#4f46e5', background:'#EEF2FF',
                borderRadius:4, padding:'2px 6px', minWidth:32, textAlign:'center', flexShrink:0 }}>{s.code}</span>
              <span style={{ fontSize:12, color:'#374151', fontWeight:500, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{s.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── User Avatar ── */
function UserAvatar({ userId, initials, photoExt, size = 30 }) {
  const [err, setErr] = useState(false);
  const src = userId && photoExt ? `/api/auth/profile/photo/${userId}` : null;
  return (
    <div style={{ width:size, height:size, borderRadius:8, flexShrink:0, overflow:'hidden',
      background:`linear-gradient(135deg,${TEAL2},${TEAL})`,
      display:'flex', alignItems:'center', justifyContent:'center' }}>
      {src && !err
        ? <img src={src} alt="avatar" style={{ width:'100%', height:'100%', objectFit:'cover' }} onError={()=>setErr(true)}/>
        : <span style={{ fontSize:size*0.38, fontWeight:800, color:'#fff' }}>{initials}</span>}
    </div>
  );
}

/* ── Logout Modal ───────────────────────────────────────────────── */
function LogoutModal({ onConfirm, onCancel }) {
  const neu = useHdrTokens().neu;   // soft (neumorphic) look when SOFT is on
  const [phase, setPhase] = useState('confirm'); // confirm | step1 | step2 | step3

  const STEPS = [
    { key:'step1', icon:'🔄', text:'Logging out from server...',   spin: true  },
    { key:'step2', icon:'🔌', text:'Disconnecting from server...', spin: true  },
    { key:'step3', icon:'✅', text:'Successfully logged out!',     spin: false },
  ];

  const handleOK = () => {
    setPhase('step1');
    setTimeout(() => setPhase('step2'), 1300);
    setTimeout(() => setPhase('step3'), 2500);
    setTimeout(() => onConfirm(), 3600);
  };

  useEffect(() => {
    const h = (e) => {
      if (phase === 'confirm' && e.key === 'Enter') handleOK();
      if (phase === 'confirm' && e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const currentStep = STEPS.find(s => s.key === phase);
  const isDone      = phase === 'confirm';

  return (
    <div style={{ position:'fixed', inset:0, zIndex:99999, display:'flex',
      alignItems:'center', justifyContent:'center',
      background:'rgba(15,23,42,0.55)', backdropFilter:'blur(6px)', fontFamily:FONT }}>
      <style>{`
        @keyframes logout-spin { to { transform: rotate(360deg); } }
        @keyframes logout-pop  { 0%{transform:scale(0.82);opacity:0} 100%{transform:scale(1);opacity:1} }
        @keyframes logout-fade { 0%{opacity:0;transform:translateY(8px)} 100%{opacity:1;transform:none} }
        .lo-card { animation: logout-pop 0.22s cubic-bezier(.34,1.56,.64,1) both; }
        .lo-step  { animation: logout-fade 0.3s ease both; }
        .lo-spin  { display:inline-block; animation: logout-spin 0.9s linear infinite; }
      `}</style>

      <div className="lo-card" style={{ background: neu ? NEU.base : '#fff', borderRadius: neu ? 24 : 16,
        width:360, padding:'32px 28px', boxShadow: neu ? '12px 12px 28px rgba(60,72,92,0.45), -8px -8px 20px rgba(255,255,255,0.25)' : '0 24px 60px rgba(0,0,0,0.22)',
        display:'flex', flexDirection:'column', alignItems:'center', textAlign:'center' }}>

        {/* Icon area */}
        <div style={neu ? { width:64, height:64, borderRadius:18, marginBottom:18, background:NEU.base, boxShadow:NEU.raised,
          display:'flex', alignItems:'center', justifyContent:'center', transition:'all 0.4s ease' } : { width:64, height:64, borderRadius:16, marginBottom:18,
          background: phase==='step3' ? 'linear-gradient(135deg,#16a34a,#15803d)'
                    : phase==='confirm' ? 'linear-gradient(135deg,#dc2626,#b91c1c)'
                    : 'linear-gradient(135deg,#1e40af,#1d4ed8)',
          display:'flex', alignItems:'center', justifyContent:'center',
          boxShadow: phase==='step3' ? '0 8px 24px rgba(22,163,74,0.35)'
                   : phase==='confirm' ? '0 8px 24px rgba(220,38,38,0.35)'
                   : '0 8px 24px rgba(30,64,175,0.35)',
          transition:'all 0.4s ease' }}>
          {phase === 'confirm' && <LogOut size={28} color={neu ? '#dc2626' : '#fff'} strokeWidth={2.5} />}
          {phase !== 'confirm' && (
            <span style={{ fontSize:28, lineHeight:1 }}
              className={currentStep?.spin ? 'lo-spin' : ''}>
              {currentStep?.icon}
            </span>
          )}
        </div>

        {/* Text */}
        {phase === 'confirm' ? (
          <>
            <div style={{ fontSize:18, fontWeight:800, color: neu ? NEU.strong : '#0f172a', marginBottom:6 }}>
              Sign Out?
            </div>
            <div style={{ fontSize:13, color: neu ? NEU.text : '#64748b', marginBottom:28, lineHeight:1.5 }}>
              You'll be logged out of the current session.<br />
              Press <kbd style={neu ? { background:NEU.base, boxShadow:NEU.insetSm, border:'none', borderRadius:5, padding:'1px 7px', fontSize:11, fontFamily:'monospace' } : { background:'#f1f5f9', border:'1px solid #e2e8f0',
                borderRadius:4, padding:'1px 6px', fontSize:11, fontFamily:'monospace' }}>Enter</kbd> to confirm.
            </div>
            <div style={{ display:'flex', gap:10, width:'100%' }}>
              <button onClick={onCancel}
                style={neu ? { flex:1, height:40, border:'none', borderRadius:12, background:NEU.base, boxShadow:NEU.raisedSm, color:NEU.strong, fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:FONT } : { flex:1, height:38, border:'1.5px solid #e2e8f0', borderRadius:8,
                  background:'#f8fafc', color:'#374151', fontSize:13, fontWeight:600,
                  cursor:'pointer', fontFamily:FONT }}>
                Cancel
              </button>
              <button onClick={handleOK} autoFocus
                style={neu ? { flex:1, height:40, border:'none', borderRadius:12, background:NEU.base, boxShadow:NEU.raisedSm, color:'#dc2626', fontSize:13, fontWeight:800, cursor:'pointer', fontFamily:FONT } : { flex:1, height:38, border:'none', borderRadius:8,
                  background:'linear-gradient(135deg,#dc2626,#b91c1c)', color:'#fff',
                  fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:FONT,
                  boxShadow:'0 3px 10px rgba(220,38,38,0.35)' }}>
                Yes, Sign Out
              </button>
            </div>
          </>
        ) : (
          <div key={phase} className="lo-step">
            <div style={{ fontSize:15, fontWeight:700, color: neu ? NEU.strong : '#1e293b', marginBottom:6 }}>
              {currentStep?.text}
            </div>
            {phase !== 'step3' && (
              <div style={{ display:'flex', justifyContent:'center', gap:5, marginTop:12 }}>
                {[0,1,2].map(i => (
                  <div key={i} style={{ width:7, height:7, borderRadius:'50%', background:'#3b82f6',
                    animation:`logout-spin 1s ease-in-out ${i*0.2}s infinite alternate`,
                    opacity: 0.7 }} />
                ))}
              </div>
            )}
            {phase === 'step3' && (
              <div style={{ fontSize:12, color:'#16a34a', marginTop:4, fontWeight:600 }}>
                Redirecting you to login page…
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── User dropdown ──────────────────────────────────────────────── */
function UserDropdown({ user, username, userRole, initials, onLogout, onNavigate }) {
  const tk = useHdrTokens();
  const [open,       setOpen]       = useState(false);
  const [showLogout, setShowLogout] = useState(false);
  const ref = useRef(null);
  useClickOutside(ref, () => setOpen(false));

  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0, display:'flex', alignItems:'center' }}>
      <button
        onClick={() => setOpen(p => !p)}
        title={`${username} — ${userRole}`}
        style={{ display:'flex', alignItems:'center', gap:9,
          padding:'0 8px 0 4px', height: 38, borderRadius: tk.neu ? 12 : 9,
          background: open ? tk.btnActiveBg : tk.btnBg,
          boxShadow: open ? tk.btnActiveShadow : tk.btnShadow,
          border:'1px solid transparent',
          cursor:'pointer', fontFamily:FONT, transition:'background 0.12s, box-shadow 0.15s' }}
        onMouseEnter={e => { e.currentTarget.style.background = tk.btnHoverBg; e.currentTarget.style.boxShadow = tk.btnHoverShadow; }}
        onMouseLeave={e => { if (!open) { e.currentTarget.style.background = tk.btnBg; e.currentTarget.style.boxShadow = tk.btnShadow; } }}>
        <span style={{ position:'relative', display:'flex', flexShrink:0 }}>
          <UserAvatar userId={user?.id||user?.userId} initials={initials} photoExt={user?.photoExt} size={30} />
          <span style={{ position:'absolute', right:-2, bottom:-2, width:9, height:9, borderRadius:'50%',
            background:'#22c55e', border:`2px solid ${tk.edge}` }} />
        </span>
        <span className="hdr-hide-md" style={{ display:'flex', flexDirection:'column', alignItems:'flex-start', lineHeight:1.2, minWidth:0 }}>
          <span style={{ fontSize:12.5, fontWeight:700, color:tk.strong, maxWidth:140, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{username}</span>
          <span style={{ fontSize:10.5, fontWeight:500, color:tk.muted, whiteSpace:'nowrap' }}>{userRole}</span>
        </span>
        <ChevronDown size={12} color={tk.txt} style={{ transition:'transform 0.2s', transform:open?'rotate(180deg)':'none', flexShrink:0 }} />
      </button>

      {open && tk.neu && (
        <div style={{ position:'absolute', top:'calc(100% + 12px)', right:0, width:250, zIndex:9999,
          background:NEU.base, borderRadius:16, boxShadow:'8px 8px 18px #A3B1C6, -8px -8px 18px #FFFFFF',
          padding:12, fontFamily:FONT }}>
          {/* User card — pressed into the panel */}
          <div style={{ display:'flex', alignItems:'center', gap:11, padding:'11px 12px', borderRadius:13,
            background:NEU.base, boxShadow:NEU.inset }}>
            <span style={{ borderRadius:10, boxShadow:NEU.raisedSm, display:'flex' }}>
              <UserAvatar userId={user?.id||user?.userId} initials={initials} photoExt={user?.photoExt} size={38} />
            </span>
            <div style={{ minWidth:0 }}>
              <div style={{ fontSize:13, fontWeight:700, color:NEU.strong, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{username}</div>
              <div style={{ fontSize:11, color:NEU.muted, marginTop:1 }}>{userRole}</div>
              <div style={{ display:'flex', alignItems:'center', gap:4, marginTop:3 }}>
                <span style={{ width:6, height:6, borderRadius:'50%', background:'#22c55e', display:'inline-block' }}/>
                <span style={{ fontSize:10, color:'#16a34a', fontWeight:700 }}>Online</span>
              </div>
            </div>
          </div>
          {[
            { label:'My Profile', sub:'Account settings', icon:<User size={14} color="#3b82f6" />, color:NEU.strong,
              onClick:() => { onNavigate('/profile'); setOpen(false); } },
            { label:'Sign Out', sub:'End this session', icon:<LogOut size={14} color="#DC2626" />, color:'#DC2626',
              onClick:() => { setOpen(false); setShowLogout(true); } },
          ].map(m => (
            <div key={m.label} onClick={m.onClick}
              onMouseEnter={e => { e.currentTarget.style.boxShadow = NEU.raisedSm; }}
              onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; }}
              style={{ display:'flex', alignItems:'center', gap:11, marginTop:10, padding:'8px 10px', borderRadius:12,
                cursor:'pointer', background:NEU.base, transition:'box-shadow 0.15s' }}>
              <span style={{ width:30, height:30, borderRadius:9, background:NEU.base, boxShadow:NEU.raisedSm,
                display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>{m.icon}</span>
              <span>
                <span style={{ display:'block', fontSize:12.5, fontWeight:700, color:m.color }}>{m.label}</span>
                <span style={{ display:'block', fontSize:10.5, color:NEU.muted }}>{m.sub}</span>
              </span>
            </div>
          ))}
        </div>
      )}
      {open && !tk.neu && (
        <div style={{ position:'absolute', top:'calc(100% + 8px)', right:0, width:230,
          background:'#fff', borderRadius:10, boxShadow:'0 16px 40px rgba(0,0,0,0.18)',
          border:'1px solid #E5E7EB', borderTop:`3px solid ${TEAL}`, zIndex:9999, overflow:'hidden', fontFamily:FONT }}>
          {/* User info header */}
          <div style={{ padding:'12px 14px', background:`linear-gradient(135deg,${TEAL}15,${TEAL2}10)`, borderBottom:'1px solid #E5E7EB' }}>
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              <UserAvatar userId={user?.id||user?.userId} initials={initials} photoExt={user?.photoExt} size={36} />
              <div>
                <div style={{ fontSize:13, fontWeight:700, color:'#0f172a' }}>{username}</div>
                <div style={{ fontSize:11, color:'#64748b', marginTop:1 }}>{userRole}</div>
                <div style={{ display:'flex', alignItems:'center', gap:4, marginTop:3 }}>
                  <span style={{ width:5, height:5, borderRadius:'50%', background:'#22c55e', display:'inline-block' }}/>
                  <span style={{ fontSize:10, color:'#16a34a', fontWeight:600 }}>Online</span>
                </div>
              </div>
            </div>
          </div>

          {/* Menu items */}
          <div style={{ padding:'4px 0' }}>
            <div
              onClick={() => { onNavigate('/profile'); setOpen(false); }}
              style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 14px', cursor:'pointer', fontSize:12.5, color:'#374151', transition:'all 0.1s' }}
              onMouseEnter={e => { e.currentTarget.style.background='#F8FAFC'; }}
              onMouseLeave={e => { e.currentTarget.style.background='transparent'; }}>
              <div style={{ width:28, height:28, borderRadius:7, background:'#EFF6FF', display:'flex', alignItems:'center', justifyContent:'center' }}>
                <User size={14} color="#3b82f6" />
              </div>
              <div>
                <div style={{ fontWeight:600 }}>My Profile</div>
                <div style={{ fontSize:10.5, color:'#9ca3af' }}>Account settings</div>
              </div>
            </div>
          </div>

          <div style={{ height:1, background:'#F1F5F9', margin:'0 14px' }} />

          {/* Logout */}
          <div style={{ padding:'4px 0 4px' }}>
            <div
              onClick={() => { setOpen(false); setShowLogout(true); }}
              style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 14px', cursor:'pointer', fontSize:12.5, color:'#DC2626', transition:'all 0.1s' }}
              onMouseEnter={e => { e.currentTarget.style.background='#FEF2F2'; }}
              onMouseLeave={e => { e.currentTarget.style.background='transparent'; }}>
              <div style={{ width:28, height:28, borderRadius:7, background:'#FEF2F2', display:'flex', alignItems:'center', justifyContent:'center' }}>
                <LogOut size={14} color="#DC2626" />
              </div>
              <div style={{ fontWeight:600 }}>Sign Out</div>
            </div>
          </div>
        </div>
      )}

      {showLogout && (
        <LogoutModal
          onConfirm={() => { setShowLogout(false); onLogout(); }}
          onCancel={() => setShowLogout(false)}
        />
      )}
    </div>
  );
}

/* ── Company Switch Modal ───────────────────────────────────────── */
function CompanySwitchModal({ company, currentCompany, onConfirm, onCancel }) {
  const neu = useHdrTokens().neu;   // soft (neumorphic) look when SOFT is on
  const [phase, setPhase] = useState('confirm'); // confirm | checking | success | denied

  const PHASES = {
    checking: { icon:'🔄', text:'Verifying your access…',            color:'#1d4ed8', spin:true  },
    success:  { icon:'✅', text:'Access verified! Switching now…',   color:'#16a34a', spin:false },
    denied:   { icon:'🚫', text:'Access Denied',                     color:'#dc2626', spin:false },
  };

  const handleConfirm = async () => {
    setPhase('checking');
    try {
      // Verify the company is still accessible to this user
      const res = await axios.get('/api/companies');
      const list = Array.isArray(res.data) ? res.data : [];
      const allowed = list.some(c => c.companyId === company.companyId);
      if (!allowed) { setPhase('denied'); setTimeout(onCancel, 2500); return; }
      setPhase('success');
      setTimeout(onConfirm, 1400);
    } catch {
      setPhase('denied');
      setTimeout(onCancel, 2500);
    }
  };

  useEffect(() => {
    const h = (e) => {
      if (phase === 'confirm' && e.key === 'Enter') handleConfirm();
      if (phase === 'confirm' && e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const p = PHASES[phase];

  return (
    <div style={{ position:'fixed', inset:0, zIndex:99999, display:'flex',
      alignItems:'center', justifyContent:'center',
      background:'rgba(10,20,40,0.6)', backdropFilter:'blur(7px)', fontFamily:FONT }}>
      <style>{`
        @keyframes cs-pop  { 0%{transform:scale(0.8);opacity:0} 100%{transform:scale(1);opacity:1} }
        @keyframes cs-fade { 0%{opacity:0;transform:translateY(8px)} 100%{opacity:1;transform:none} }
        @keyframes cs-spin { to{transform:rotate(360deg)} }
        @keyframes cs-dot  { 0%,80%,100%{transform:scale(0.5);opacity:0.3} 40%{transform:scale(1);opacity:1} }
        .cs-card { animation: cs-pop 0.22s cubic-bezier(.34,1.56,.64,1) both; }
        .cs-step { animation: cs-fade 0.28s ease both; }
        .cs-spin-icon { display:inline-block; animation: cs-spin 0.85s linear infinite; }
      `}</style>

      <div className="cs-card" style={{ background: neu ? NEU.base : '#fff', borderRadius: neu ? 24 : 18, width:380,
        padding:'32px 28px', boxShadow: neu ? '12px 12px 28px rgba(60,72,92,0.45), -8px -8px 20px rgba(255,255,255,0.25)' : '0 28px 70px rgba(0,0,0,0.25)',
        display:'flex', flexDirection:'column', alignItems:'center', textAlign:'center' }}>

        {/* Icon */}
        <div style={neu ? { width:68, height:68, borderRadius:18, marginBottom:18, background:NEU.base, boxShadow:NEU.raised,
          display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 } : { width:68, height:68, borderRadius:16, marginBottom:18,
          background: phase==='confirm'  ? 'linear-gradient(135deg,#1d4ed8,#1e40af)'
                    : phase==='checking' ? 'linear-gradient(135deg,#1d4ed8,#1e40af)'
                    : phase==='success'  ? 'linear-gradient(135deg,#16a34a,#15803d)'
                    : 'linear-gradient(135deg,#dc2626,#b91c1c)',
          display:'flex', alignItems:'center', justifyContent:'center',
          boxShadow: phase==='success' ? '0 10px 28px rgba(22,163,74,0.4)'
                   : phase==='denied'  ? '0 10px 28px rgba(220,38,38,0.4)'
                   : '0 10px 28px rgba(29,78,216,0.4)',
          transition:'all 0.4s ease', flexShrink:0 }}>
          {phase === 'confirm' ? (
            <Building2 size={30} color={neu ? '#1d4ed8' : '#fff'} strokeWidth={2} />
          ) : (
            <span style={{ fontSize:30, lineHeight:1 }}
              className={p?.spin ? 'cs-spin-icon' : ''}>{p?.icon}</span>
          )}
        </div>

        {/* Content */}
        {phase === 'confirm' ? (
          <>
            <div style={{ fontSize:17, fontWeight:800, color: neu ? NEU.strong : '#0f172a', marginBottom:6 }}>
              Switch Company?
            </div>
            <div style={{ fontSize:12.5, color: neu ? NEU.text : '#64748b', marginBottom:4, lineHeight:1.5 }}>
              From: <strong style={{ color: neu ? NEU.strong : '#475569' }}>{currentCompany?.companyName || '—'}</strong>
            </div>
            <div style={{ fontSize:12.5, color: neu ? NEU.text : '#64748b', marginBottom:20, lineHeight:1.5 }}>
              To:&nbsp;&nbsp; <strong style={{ color:'#1d4ed8' }}>{company.companyName}</strong>
              {company.gstin && <span style={{ color:'#94a3b8', fontSize:11, marginLeft:6 }}>({company.gstin})</span>}
            </div>
            <div style={{ fontSize:11, color:'#94a3b8', marginBottom:22 }}>
              Press <kbd style={{ background:'#f1f5f9', border:'1px solid #e2e8f0',
                borderRadius:4, padding:'1px 6px', fontSize:10, fontFamily:'monospace' }}>Enter</kbd> to confirm
            </div>
            <div style={{ display:'flex', gap:10, width:'100%' }}>
              <button onClick={onCancel}
                style={neu ? { flex:1, height:40, border:'none', borderRadius:12, background:NEU.base, boxShadow:NEU.raisedSm, color:NEU.strong, fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:FONT } : { flex:1, height:38, border:'1.5px solid #e2e8f0', borderRadius:8,
                  background:'#f8fafc', color:'#374151', fontSize:13, fontWeight:600,
                  cursor:'pointer', fontFamily:FONT }}>
                Cancel
              </button>
              <button onClick={handleConfirm} autoFocus
                style={neu ? { flex:1, height:40, border:'none', borderRadius:12, background:NEU.base, boxShadow:NEU.raisedSm, color:'#1d4ed8', fontSize:13, fontWeight:800, cursor:'pointer', fontFamily:FONT } : { flex:1, height:38, border:'none', borderRadius:8,
                  background:'linear-gradient(135deg,#1d4ed8,#1e40af)', color:'#fff',
                  fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:FONT,
                  boxShadow:'0 3px 10px rgba(29,78,216,0.35)' }}>
                Yes, Switch
              </button>
            </div>
          </>
        ) : (
          <div key={phase} className="cs-step">
            <div style={{ fontSize:15, fontWeight:700, color: neu ? NEU.strong : '#0f172a', marginBottom:8 }}>{p.text}</div>
            {phase === 'checking' && (
              <div style={{ display:'flex', justifyContent:'center', gap:6, marginTop:10 }}>
                {[0,1,2].map(i => (
                  <div key={i} style={{ width:8, height:8, borderRadius:'50%', background:'#3b82f6',
                    animation:`cs-dot 1.2s ease-in-out ${i*0.2}s infinite` }}/>
                ))}
              </div>
            )}
            {phase === 'success' && (
              <div style={{ fontSize:12, color:'#16a34a', fontWeight:600, marginTop:4 }}>
                Welcome to <strong>{company.companyName}</strong>
              </div>
            )}
            {phase === 'denied' && (
              <div style={{ fontSize:12, color:'#dc2626', marginTop:4 }}>
                You do not have access to this company.
              </div>
            )}
          </div>
        )}

        <div style={{ marginTop:20, fontSize:10.5, color:'#cbd5e1', fontWeight:600,
          borderTop:'1px solid #f1f5f9', paddingTop:12, width:'100%' }}>
          Super ERP System
        </div>
      </div>
    </div>
  );
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   HEADER (top bar + nav bar)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
const Header = ({ username: usernameProp, onLogout }) => {
  const { user }   = useAuth();
  const { openPanel, total: chatUnread } = useChat() || {};
  const lockCtx = useLock();
  const tk = useHdrTokens();
  const username  = user?.name || user?.username || usernameProp || 'User';
  const userRole  = user?.role ? (user.role.charAt(0).toUpperCase() + user.role.slice(1)) : 'User';
  const initials  = username ? username.split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2) : 'AD';

  const [showPalette,   setShowPalette]   = useState(false);
  const [showCoSwitch,  setShowCoSwitch]  = useState(false);
  const [pendingCompany,setPendingCompany] = useState(null);
  const [time,          setTime]          = useState(new Date());
  // Brand block tracks the sidebar's collapsed state so header + sidebar line up
  const [navCollapsed, setNavCollapsed] = useState(() => { try { return localStorage.getItem('sidebarnav-collapsed') === '1'; } catch { return false; } });
  useEffect(() => {
    const h = e => setNavCollapsed(!!e.detail);
    window.addEventListener('sidebarnav:collapsed', h);
    return () => window.removeEventListener('sidebarnav:collapsed', h);
  }, []);
  // the sidebar also reports its exact width (the tile rail is 104px) and whether it is compact
  const [navBox, setNavBox] = useState(() => { try { return localStorage.getItem('sidebarnav-layout') === 'list' ? null : { width: 84, compact: true }; } catch { return { width: 84, compact: true }; } });
  useEffect(() => {
    const h = e => setNavBox(e.detail && e.detail.width ? e.detail : null);
    window.addEventListener('sidebarnav:width', h);
    return () => window.removeEventListener('sidebarnav:width', h);
  }, []);
  const navigate   = useNavigate();
  const coRef      = useRef(null);
  const { companies, selectedCompany, selectCompany } = useCompany();

  useClickOutside(coRef, () => setShowCoSwitch(false));

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const h = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); setShowPalette(p=>!p); }
    };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, []);

  const timeStr = time.toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit', hour12:true });
  const dateStr = time.toLocaleDateString('en-IN', { weekday:'short', day:'2-digit', month:'short' });
  const navW    = navBox ? navBox.width : navCollapsed ? NAV_W_RAIL : NAV_W_OPEN;
  const navCompact = navBox ? navBox.compact : navCollapsed;

  return (
    <>
      {showPalette && <CommandPalette onClose={() => setShowPalette(false)} />}

      <div style={{ flexShrink: 0, position: 'relative', zIndex: 200, overflow: 'visible', fontFamily: FONT }}>

        {/* ══ Top bar — navy (classic) or soft neumorphic, framed with the sidebar ══ */}
        <div style={{
          background: tk.bg,
          display: 'flex', alignItems: 'center', gap: 12,
          height: 50,
          borderBottom: tk.barBorder,
          boxShadow: tk.barShadow,
          padding: '0 12px 0 0',
          overflow: 'visible',
          transition: 'background 0.25s',
        }}>
          {/* Brand — same width as the sidebar below it, so the two read as one frame */}
          <div onClick={() => navigate('/dashboard')} title="Go to Dashboard" style={{
            display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
            width: navW, minWidth: navW, height: '100%', boxSizing: 'border-box',
            padding: navCompact ? 0 : '0 14px',
            justifyContent: navCompact ? 'center' : 'flex-start',
            background: tk.brandBg, borderRight: `1px solid ${tk.line}`,
            flexShrink: 0, overflow: 'hidden',
            transition: 'width 0.18s ease, min-width 0.18s ease',
          }}>
            <div style={{
              width: 32, height: 32, borderRadius: 9, flexShrink: 0,
              background: `linear-gradient(135deg, #FB923C, ${TEAL2})`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: tk.neu ? NEU.raisedSm : 'inset 0 1px 0 rgba(255,255,255,0.25), 0 2px 6px rgba(0,0,0,0.3)',
            }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="#fff" stroke="none" aria-hidden="true">
                <path d="M13 2L4.5 13.5H11L10 22l8.5-11.5H12L13 2z" />
              </svg>
            </div>
            {!navCompact && (
              <div style={{ lineHeight: 1.15, whiteSpace: 'nowrap' }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: tk.strong, letterSpacing: '-0.3px' }}>ERP Suite</div>
                <div style={{ fontSize: 8.5, color: tk.muted, fontWeight: 700, letterSpacing: '1.4px', textTransform: 'uppercase' }}>Enterprise</div>
              </div>
            )}
          </div>

          {/* Shortcut code box — Ctrl K opens the full page search */}
          <ShortcutBox onPalette={() => setShowPalette(true)} />

          <div style={{ flex: 1 }} />

          {/* Company switcher */}
          <div ref={coRef} style={{ position: 'relative', flexShrink: 0 }}>
            <button onClick={() => setShowCoSwitch(p => !p)}
              title={selectedCompany?.companyName || 'Select Company'}
              style={{
                display: 'flex', alignItems: 'center', gap: 9,
                padding: '0 10px 0 5px', height: 38, maxWidth: 270,
                background: showCoSwitch ? tk.pillOpenBg : tk.pillBg,
                border: `1px solid ${showCoSwitch ? tk.pillOpenBorder : tk.pillBorder}`,
                boxShadow: showCoSwitch ? tk.pillOpenShadow : tk.pillShadow,
                borderRadius: tk.neu ? 12 : 9, cursor: 'pointer', fontFamily: FONT, textAlign: 'left',
                transition: 'background 0.12s, border-color 0.12s, box-shadow 0.15s',
              }}
              onMouseEnter={e => { if (!showCoSwitch) { e.currentTarget.style.background = tk.pillHoverBg; e.currentTarget.style.borderColor = tk.pillHoverBorder; e.currentTarget.style.boxShadow = tk.pillHoverShadow; } }}
              onMouseLeave={e => { if (!showCoSwitch) { e.currentTarget.style.background = tk.pillBg; e.currentTarget.style.borderColor = tk.pillBorder; e.currentTarget.style.boxShadow = tk.pillShadow; } }}>
              <span style={{
                position: 'relative', width: 28, height: 28, borderRadius: 7, flexShrink: 0,
                background: tk.coTileBg,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: tk.coTileShadow,
              }}>
                <Building2 size={15} color={tk.coTileIcon} strokeWidth={2} />
              </span>
              <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0, lineHeight: 1.2 }}>
                <span style={{ fontSize: 9, fontWeight: 700, color: tk.muted, letterSpacing: '0.9px', textTransform: 'uppercase' }}>Company</span>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: tk.strong, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 200 }}>
                  {selectedCompany ? selectedCompany.companyName : 'Select Company'}
                </span>
              </span>
              <ChevronDown size={12} color={tk.txt} style={{ flexShrink: 0, transition: 'transform 0.2s', transform: showCoSwitch ? 'rotate(180deg)' : 'none' }} />
            </button>
            {showCoSwitch && tk.neu && (
              <CompanyMenuSoft
                companies={companies} selectedCompany={selectedCompany}
                onPick={co => { setShowCoSwitch(false); setPendingCompany(co); }}
                onManage={() => { navigate('/admin/companies'); setShowCoSwitch(false); }}
              />
            )}
            {showCoSwitch && !tk.neu && (
              <div style={{ position: 'absolute', top: 'calc(100% + 8px)', right: 0, minWidth: 280, background: '#fff',
                borderRadius: 10, boxShadow: '0 16px 40px rgba(0,0,0,0.18)',
                zIndex: 9999, overflow: 'hidden', border: '1px solid #E5E7EB', borderTop: `3px solid ${TEAL}` }}>
                <div style={{ background: '#F8FAFC', padding: '8px 13px', borderBottom: '1px solid #EEEEEE' }}>
                  <div style={{ fontSize: 9.5, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.8px' }}>Switch Company</div>
                </div>
                {companies.length === 0 ? (
                  <div style={{ padding: '16px 13px', fontSize: 12.5, color: '#6b7280', textAlign: 'center' }}>
                    No companies.{' '}<span onClick={() => { navigate('/admin/companies'); setShowCoSwitch(false); }} style={{ color: '#EA580C', cursor: 'pointer', fontWeight: 700 }}>Add one →</span>
                  </div>
                ) : (
                  <div style={{ maxHeight: 230, overflowY: 'auto' }}>
                    {companies.map(co => {
                      const isAct = selectedCompany?.companyId === co.companyId;
                      return (
                        <div key={co.companyId} onClick={() => { if (isAct) return; setShowCoSwitch(false); setPendingCompany(co); }}
                          style={{ padding: '9px 13px', cursor: 'pointer',
                            background: isAct ? '#FFF3EA' : '#fff', borderBottom: '1px solid #F5F5F5',
                            borderLeft: `3px solid ${isAct ? TEAL2 : 'transparent'}` }}
                          onMouseEnter={e => { if (!isAct) e.currentTarget.style.background = '#F8FAFC'; }}
                          onMouseLeave={e => { e.currentTarget.style.background = isAct ? '#FFF3EA' : '#fff'; }}>
                          <div style={{ fontSize: 12.5, fontWeight: 600, color: isAct ? TEAL : '#111827', display: 'flex', alignItems: 'center', gap: 6 }}>
                            <Building2 size={11} color={isAct ? TEAL2 : '#94a3b8'} />{co.companyName}
                            {co.isDefault && <span style={{ fontSize: 9, background: '#FFF3EA', color: TEAL, borderRadius: 10, padding: '1px 6px', fontWeight: 700 }}>DEFAULT</span>}
                          </div>
                          <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 1, paddingLeft: 17 }}>{co.gstin || co.city || ''}</div>
                        </div>
                      );
                    })}
                  </div>
                )}
                <div onClick={() => { navigate('/admin/companies'); setShowCoSwitch(false); }}
                  style={{ padding: '8px 13px', cursor: 'pointer', fontSize: 11.5, fontWeight: 600, color: TEAL, background: '#F8FAFC', borderTop: '1px solid #EEEEEE', display: 'flex', alignItems: 'center', gap: 5 }}
                  onMouseEnter={e => e.currentTarget.style.background = '#FFF3EA'} onMouseLeave={e => e.currentTarget.style.background = '#F8FAFC'}>
                  <Settings size={11} /> Manage Companies
                </div>
              </div>
            )}
          </div>

          {/* Tools — Look switch / Refresh / Chat / Notifications / Lock */}
          <div style={{ display: 'flex', alignItems: 'center', gap: tk.neu ? 8 : 2, paddingLeft: 10, height: 34,
            borderLeft: `1px solid ${tk.line}`, flexShrink: 0 }}>
            <UiScaleSelect />
            <NavThemeToggle />

            <button onClick={() => window.location.reload()} title="Refresh"
              style={ghostBtn(false, tk)} onMouseEnter={ghostIn(tk)} onMouseLeave={ghostOut(false, tk)}>
              <RefreshCw size={15} strokeWidth={2} />
            </button>

            {openPanel && (
              <button onClick={openPanel} title="Chat"
                style={ghostBtn(false, tk)} onMouseEnter={ghostIn(tk)} onMouseLeave={ghostOut(false, tk)}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" /></svg>
                {chatUnread > 0 && <span style={countBadge(true, tk)}>{chatUnread > 9 ? '9+' : chatUnread}</span>}
              </button>
            )}

            <NotificationCentre companyId={selectedCompany?.companyId} userId={user?.id || user?.userId} />

            {lockCtx?.hasPin && (
              <button onClick={() => lockCtx.lock()} title="Lock Screen"
                style={ghostBtn(false, tk)} onMouseEnter={ghostIn(tk)} onMouseLeave={ghostOut(false, tk)}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
              </button>
            )}
          </div>

          {/* Date & time */}
          <div className="hdr-hide-sm" style={{
            display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'center',
            lineHeight: 1.2, padding: '0 12px', height: 30, flexShrink: 0,
            borderLeft: `1px solid ${tk.line}`, borderRight: `1px solid ${tk.line}`,
          }}>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: tk.strong, whiteSpace: 'nowrap' }}>{timeStr}</span>
            <span style={{ fontSize: 10, fontWeight: 500, color: tk.muted, whiteSpace: 'nowrap' }}>{dateStr}</span>
          </div>

          {/* User — name, role and the profile / sign-out menu */}
          <UserDropdown
            user={user} username={username} userRole={userRole} initials={initials}
            onLogout={onLogout} onNavigate={navigate}
          />
        </div>

      </div>

      {pendingCompany && (
        <CompanySwitchModal
          company={pendingCompany}
          currentCompany={selectedCompany}
          onConfirm={() => { selectCompany(pendingCompany); setPendingCompany(null); }}
          onCancel={() => setPendingCompany(null)}
        />
      )}
    </>
  );
};

export default Header;
