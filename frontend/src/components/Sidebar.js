import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { canViewNav, can } from '../utils/permissions';

/* ──────────────────────────────────────────────
   DESIGN TOKENS — Teal Theme
──────────────────────────────────────────────── */
const BG      = '#104f4f';
const BG2     = '#0b3d3d';
const MUTED   = 'rgba(255,255,255,0.88)';
const HOVER   = 'rgba(255,255,255,0.1)';
const DIVIDER = 'rgba(255,255,255,0.15)';
const F       = "'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif";

const ICON_BG = {
  dashboard:    '#3b82f6',
  crm:          '#ec4899',
  vendor:       '#059669',
  inventory:    '#0d9488',
  sales:        '#7c3aed',
  mfg:          '#9333ea',
  purchase:     '#ea580c',
  dispatch:     '#0891b2',
  purchasebill: '#6d28d9',
  finance:      '#b45309',
  stock:        '#0f766e',
  gst:          '#dc2626',
  project:      '#4f46e5',
  approvals:    '#16a34a',
  communication:'#0284c7',
  passwords:    '#65a30d',
  admin:        '#475569',
  logout:       '#ef4444',
};

const Ico = ({ d, color = '#fff', size = 14, stroke = 1.9 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round">
    {Array.isArray(d) ? d.map((p, i) => <path key={i} d={p} />) : <path d={d} />}
  </svg>
);

const ICONS = {
  dashboard:    ['M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z','M9 22V12h6v10'],
  sales:        ['M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z','M3 6h18','M16 10a4 4 0 01-8 0'],
  purchase:     ['M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z','M3 6h18','M9 10h6'],
  inventory:    ['M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z','M3.27 6.96L12 12.01l8.73-5.05','M12 22.08V12'],
  dispatch:     ['M5 17H3a2 2 0 01-2-2V5a2 2 0 012-2h11a2 2 0 012 2v3','M16 16h5v-5l-3-3h-2v8z','M5.5 21a2.5 2.5 0 100-5 2.5 2.5 0 000 5z','M18.5 21a2.5 2.5 0 100-5 2.5 2.5 0 000 5z'],
  purchasebill: ['M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2','M13 3H11a2 2 0 000 4h2a2 2 0 000-4z','M9 12h6','M9 16h4'],
  finance:      ['M12 2v20','M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6'],
  gst:          ['M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z','M7 7h.01'],
  approvals:    ['M22 11.08V12a10 10 0 11-5.93-9.14','M22 4L12 14.01l-3-3'],
  crm:          ['M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2','M9 7a4 4 0 100 8 4 4 0 000-8z','M23 21v-2a4 4 0 00-3-3.87','M16 3.13a4 4 0 010 7.75'],
  vendor:       ['M6 9H4.5a2.5 2.5 0 000 5H6','M18 9h1.5a2.5 2.5 0 010 5H18','M8 9h8','M8 15h8','M12 4v5','M12 15v5'],
  project:      ['M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z','M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z'],
  mfg:          ['M2 20a2 2 0 012-2h16a2 2 0 012 2','M7 20V8l5-5 5 5v12','M9 20v-5h6v5','M9 9v1m3-1v1m3-1v1'],
  stock:        ['M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4'],
  communication:['M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z'],
  passwords:    ['M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z'],
  admin:        ['M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z','M9 12l2 2 4-4'],
  logout:       ['M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4','M16 17l5-5-5-5','M21 12H9'],
  chevron:      'M9 18l6-6-6-6',
  chevronDown:  'M6 9l6 6 6-6',
  back:         'M19 12H5M12 19l-7-7 7-7',
  ledger:       ['M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z','M14 2v6h6','M16 13H8','M16 17H8','M10 9H8'],
  groups:       ['M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2','M9 3a4 4 0 010 8','M23 21v-2a4 4 0 00-3-3.87','M16 3.13a4 4 0 010 7.75'],
  expense:      ['M12 2v20','M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6'],
  payment:      ['M21 4H3a2 2 0 00-2 2v13a2 2 0 002 2h18a2 2 0 002-2V6a2 2 0 00-2-2z','M1 10h22'],
  receipt:      ['M5 3l14 0','M5 3v16l7-3 7 3V3','M10 12h4'],
  journal:      ['M4 19.5A2.5 2.5 0 016.5 17H20','M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z'],
  bank:         ['M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z','M9 22V12h6v10'],
  statement:    ['M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2','M13 3H11a2 2 0 000 4h2a2 2 0 000-4z','M9 12h6','M9 16h6'],
  dues:         ['M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z','M12 6v6l4 2'],
  debitnote:    ['M12 20h9','M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z'],
  creditnote:   ['M9 11l3 3L22 4','M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11'],
  deposit:      ['M12 2v20','M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6'],
  approval:     ['M22 11.08V12a10 10 0 11-5.93-9.14','M22 4L12 14.01l-3-3'],
  filedocs:     ['M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z','M12 11v6','M9 14h6'],
};

/* ──────────────────────────────────────────────
   MAIN NAV
──────────────────────────────────────────────── */
const NAV = [
  { key:'dashboard', label:'Dashboard', path:'/dashboard', routes:['/dashboard'] },
  {
    key:'project', label:'Jobcode', path:'/project/list', routes:['/project'],
    sub:[
      { label:'All Jobcodes',  path:'/project/list',  permKey:'project' },
      { label:'Project Close', path:'/project/close', permKey:'project' },
    ],
  },
  {
    key:'crm', label:'Client / CRM', path:'/client/view', routes:['/client','/crm','/client-sap'],
    sub:[
      { label:'View Clients',    path:'/client/view',    permKey:'client' },
      { label:'Pending Clients', path:'/client/pending', permKey:'client' },
      { label:'CRM',             path:'/crm/view',       permKey:'crm' },
    ],
  },
  {
    key:'vendor', label:'Vendor / Supplier', path:'/vendor/view', routes:['/vendor'],
    sub:[
      { label:'All Vendors',        path:'/vendor/view',               permKey:'vendor' },
      { label:'Add Vendor',         path:'/vendor/create',             permKey:'vendor' },
      { label:'Pending Vendors',    path:'/vendor/pending',            permKey:'vendor' },
      { label:'Self Registrations', path:'/vendor/self-registrations', permKey:'vendorSelfReg' },
    ],
  },
  {
    key:'inventory', label:'Inventory', path:'/items/view', routes:['/items'],
    sub:[
      { label:'Items / Products', path:'/items/view',    permKey:'items' },
      { label:'Create Item',      path:'/items/create',  permKey:'items' },
      { label:'Order Tracker',    path:'/items/tracker', permKey:'orderTracker' },
    ],
  },
  {
    key:'sales', label:'Sales Order', path:'/sales-order/view', routes:['/sales-order'],
    sub:[
      { label:'All Orders',       path:'/sales-order/view',    permKey:'salesOrder' },
      { label:'Create New Order', path:'/sales-order/create',  permKey:'salesOrder' },
      { label:'Pending Approval', path:'/sales-order/pending', permKey:'salesOrder' },
    ],
  },
  {
    key:'mfg', label:'Manufacturing', path:'/manufacturing/orders', routes:['/manufacturing'],
    sub:[
      { label:'Manufacturing Orders', path:'/manufacturing/orders',            permKey:'mfgOrders' },
      { label:'Job Sheets',           path:'/manufacturing/job-sheets',        permKey:'jobSheets' },
      { label:'Create Job Sheet',     path:'/manufacturing/job-sheets/create', permKey:'jobSheets' },
      { label:'Locations',            path:'/manufacturing/locations',         permKey:'mfgLocations' },
    ],
  },
  {
    key:'purchase', label:'Purchase Order', path:'/purchase-order/tracking', routes:['/purchase-order'],
    sub:[
      { label:'PO Tracking',      path:'/purchase-order/tracking', permKey:'purchaseOrder' },
      { label:'Create PO',        path:'/purchase-order/create',   permKey:'purchaseOrder' },
      { label:'View / Edit POs',  path:'/purchase-order/view',     permKey:'purchaseOrder' },
      { label:'Pending Approval', path:'/purchase-order/pending',  permKey:'purchaseOrder' },
    ],
  },
  {
    key:'dispatch', label:'Sales Bill', path:'/sales-bill', routes:['/sales-bill','/delivery-challan'],
    sub:[
      { label:'Tax Invoices (Sales Bill)', path:'/sales-bill',            permKey:'salesBill' },
      { label:'Delivery Challan',          path:'/delivery-challan/view', permKey:'deliveryChallan' },
      { label:'GDN',                       path:'/delivery-challan/view', permKey:'deliveryChallan' },
    ],
  },
  {
    key:'purchasebill', label:'Purchase Bill', path:'/purchase-bill', routes:['/purchase-bill'],
    sub:[
      { label:'Purchase Bills',      path:'/purchase-bill', permKey:'purchaseBill' },
      { label:'GRN (Goods Receipt)', path:'/stock/in',      permKey:'grn' },
    ],
  },
  // finance key → clicking enters Account Mode (no sub dropdown in normal mode)
  { key:'finance', label:'Account', path:'/account/dues', routes:['/account','/tally'] },
  { key:'stock', label:'Stock View', path:'/stock/view', routes:['/stock'] },
  { key:'gst',   label:'GST & Compliance', path:'/gst/compliance', routes:['/gst'] },
  { key:'communication', label:'Communication Logs', path:'/communication/logs', routes:['/communication'] },
  { key:'approvals', label:'Approvals',        path:'/approval', routes:['/approval'] },
  { key:'passwords', label:'Password Manager', path:'/passwords',        routes:['/passwords'] },
  { key:'admin',     label:'Admin Settings',   path:'/admin/companies',  routes:['/admin','/settings','/user-management'] },
];

/* ──────────────────────────────────────────────
   ACCOUNT MODE NAV (full account menu)
──────────────────────────────────────────────── */
const ACCOUNT_SECTIONS = [
  {
    label: 'Setup',
    color: '#0d9488',
    items: [
      { label: 'Ledger Master',  path: '/account/ledger/master', icon: 'ledger',  permKey: 'accLedger' },
      { label: 'Account Groups', path: '/account/groups/view',   icon: 'groups',  permKey: 'accLedger' },
    ],
  },
  {
    label: 'Transactions',
    color: '#7c3aed',
    items: [
      { label: 'Expense Entry',  path: '/account/expense/create',   icon: 'expense',    permKey: 'accExpense' },
      { label: 'View Expenses',  path: '/account/expense/view',     icon: 'statement',  permKey: 'accExpense' },
      { label: 'Payment',        path: '/account/payment/create',   icon: 'payment',    permKey: 'accPayment' },
      { label: 'Receipt',        path: '/account/receipt/create',   icon: 'receipt',    permKey: 'accReceipt' },
      { label: 'Journal Entry',  path: '/account/journal/view',     icon: 'journal',    permKey: 'accJournal' },
      { label: 'Debit Note',     path: '/account/debit-note/view',  icon: 'debitnote',  permKey: 'accDebitNote' },
      { label: 'Credit Note',    path: '/account/credit-note/view', icon: 'creditnote', permKey: 'accCreditNote' },
      { label: 'Deposit',        path: '/account/deposit/view',     icon: 'deposit',    permKey: 'accDeposit' },
    ],
  },
  {
    label: 'Reports',
    color: '#b45309',
    items: [
      { label: 'View Balance',  path: '/account/dues',         icon: 'dues',      permKey: null },
      { label: 'All Ledgers',  path: '/account/ledger/view',  icon: 'ledger',    permKey: 'accLedger' },
      { label: 'Bank Account', path: '/account/bank/view',    icon: 'bank',      permKey: 'accBank' },
      { label: 'Statement',    path: '/account/statement',    icon: 'statement', permKey: 'accStatement' },
    ],
  },
  {
    label: 'Other',
    color: '#475569',
    items: [
      { label: 'Approval',             path: '/account/approval',        icon: 'approval', permKey: null },
      { label: 'Financial Documents',  path: '/account/financial-docs',  icon: 'filedocs', permKey: null },
    ],
  },
];

const isActive = (routes, path) =>
  routes?.some(r => path === r || path.startsWith(r + '/'));

const ACCOUNT_ROUTES = ['/account', '/tally'];
const isAccountPath  = (p) => ACCOUNT_ROUTES.some(r => p === r || p.startsWith(r + '/'));

/* ──────────────────────────────────────────────
   SIDEBAR COMPONENT
──────────────────────────────────────────────── */
export default function Sidebar() {
  const { pathname } = useLocation();
  const navigate     = useNavigate();
  const { user, logout } = useAuth();
  const hasAccess = (navKey) => canViewNav(user, navKey);

  const [pinned,  setPinned]  = useState(
    () => localStorage.getItem('sidebar-pinned') === 'true'
  );
  const [hovered, setHovered] = useState(false);
  const isExpanded = pinned || hovered;

  const [openKeys, setOpenKeys] = useState(() => {
    const act = NAV.find(n => isActive(n.routes, window.location.pathname));
    return act?.sub ? new Set([act.key]) : new Set();
  });

  /* accountMode — transforms sidebar to show all account menu items */
  const [accountMode, setAccountMode] = useState(() => isAccountPath(window.location.pathname));

  useEffect(() => {
    if (isAccountPath(pathname)) {
      setAccountMode(true);
    } else {
      setAccountMode(false);
      const act = NAV.find(n => isActive(n.routes, pathname));
      setOpenKeys(act?.sub ? new Set([act.key]) : new Set());
    }
  }, [pathname]);

  useEffect(() => {
    localStorage.setItem('sidebar-pinned', String(pinned));
  }, [pinned]);

  const collapsed = !isExpanded;

  const initials = (name) => {
    if (!name) return 'U';
    const parts = name.trim().split(/\s+/);
    return parts.length > 1
      ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
      : name.slice(0, 2).toUpperCase();
  };

  const userName = user?.name || user?.username || 'User';
  const W = isExpanded ? 240 : 56;

  /* ── Pin toggle header ── */
  const PinHeader = () => (
    <div style={{
      display: 'flex', alignItems: 'center',
      justifyContent: isExpanded ? 'flex-end' : 'center',
      padding: isExpanded ? '0 10px' : '0',
      borderBottom: `1px solid ${DIVIDER}`,
      flexShrink: 0, height: 38,
      background: BG2,
      gap: isExpanded ? 6 : 0,
    }}>
      {isExpanded && (
        <span style={{ flex:1, fontSize:12, fontWeight:800, color:'#fff',
          letterSpacing:'0.5px', paddingLeft:4, userSelect:'none' }}>
          {accountMode ? 'Account' : 'ERP Suite'}
        </span>
      )}
      <button
        onClick={() => setPinned(p => !p)}
        title={pinned ? 'Unpin (hover-to-expand)' : 'Pin sidebar open'}
        style={{
          background: pinned ? 'rgba(255,255,255,0.18)' : 'none',
          border: pinned ? '1px solid rgba(255,255,255,0.35)' : '1px solid transparent',
          cursor: 'pointer', padding: 5,
          color: '#fff',
          borderRadius: 5, display: 'flex', alignItems: 'center',
          transition: 'all 0.15s', flexShrink: 0,
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill={pinned ? 'currentColor' : 'none'}
          stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="17" x2="12" y2="22"/>
          <path d="M5 17h14v-1.76a2 2 0 00-1.11-1.79l-1.78-.9A2 2 0 0115 10.76V6h1a2 2 0 000-4H8a2 2 0 000 4h1v4.76a2 2 0 01-1.11 1.79l-1.78.9A2 2 0 005 15.24V17z"/>
        </svg>
      </button>
    </div>
  );

  /* ── User profile footer ── */
  const UserFooter = () => (
    <div style={{
      flexShrink: 0,
      padding: collapsed ? '12px 0' : '10px 12px',
      borderTop: `1px solid ${DIVIDER}`,
      background: BG2,
      display: 'flex', alignItems: 'center',
      justifyContent: collapsed ? 'center' : 'flex-start',
      gap: 10,
    }}>
      <div style={{
        width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
        background: 'rgba(255,255,255,0.2)',
        border: '1.5px solid rgba(255,255,255,0.35)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 12, fontWeight: 700, color: '#fff', letterSpacing: 0.5,
      }}>
        {initials(userName)}
      </div>
      {!collapsed && (
        <div style={{ overflow: 'hidden', flex: 1 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#fff',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {userName}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 1 }}>
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.7)', fontWeight: 500 }}>Administrator</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3,
              background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.25)', borderRadius: 8,
              padding: '0 5px', fontSize: 9, color: '#fff', fontWeight: 700 }}>
              <span style={{ width: 4, height: 4, borderRadius: '50%', background: '#4ade80' }}/>
              Online
            </span>
          </div>
        </div>
      )}
    </div>
  );

  /* ══════════════════════════════════════════
     ACCOUNT MODE — full account navigation
  ══════════════════════════════════════════ */
  if (accountMode) {
    return (
      <aside
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          width: W, minWidth: W, flexShrink: 0,
          height: '100vh',
          background: BG,
          borderRight: `1px solid rgba(0,0,0,0.1)`,
          display: 'flex', flexDirection: 'column',
          fontFamily: F,
          transition: 'width 0.20s cubic-bezier(0.4,0,0.2,1), min-width 0.20s cubic-bezier(0.4,0,0.2,1)',
          overflow: 'hidden',
          zIndex: 20,
          boxShadow: '2px 0 16px rgba(0,0,0,0.18)',
        }}>

        <PinHeader />

        {/* ── Back button ── */}
        <div
          onClick={() => { setAccountMode(false); navigate('/dashboard'); }}
          title={collapsed ? 'Back to Main Menu' : undefined}
          style={{
            display: 'flex', alignItems: 'center',
            justifyContent: collapsed ? 'center' : 'flex-start',
            gap: 10, height: 40,
            padding: collapsed ? '0' : '0 12px 0 10px',
            cursor: 'pointer',
            background: 'rgba(255,255,255,0.08)',
            borderBottom: `1px solid ${DIVIDER}`,
            transition: 'background 0.12s',
            flexShrink: 0,
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.14)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; }}
        >
          <span style={{
            width: 30, height: 30, borderRadius: 8, flexShrink: 0,
            background: 'rgba(255,255,255,0.12)',
            border: '1.5px solid rgba(255,255,255,0.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Ico d={ICONS.back} color="#fff" size={14} stroke={2.2} />
          </span>
          {!collapsed && (
            <span style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.9)' }}>
              ← Back to Main Menu
            </span>
          )}
        </div>

        {/* ── Account nav sections ── */}
        <nav style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '4px 0' }}>
          {ACCOUNT_SECTIONS.map(section => (
            <div key={section.label}>
              {/* Section header — only when expanded */}
              {!collapsed && (
                <div style={{ padding: '10px 10px 4px 10px' }}>
                  <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                    background: section.color || 'rgba(255,255,255,0.12)',
                    border: `1px solid ${section.color || 'rgba(255,255,255,0.2)'}`,
                    borderRadius: 5, padding: '2px 8px',
                  }}>
                    <div style={{
                      width: 5, height: 5, borderRadius: '50%',
                      background: '#fff', opacity: 0.85, flexShrink: 0,
                    }}/>
                    <span style={{
                      fontSize: 9.5, fontWeight: 800, color: '#fff',
                      letterSpacing: '0.7px', textTransform: 'uppercase',
                    }}>
                      {section.label}
                    </span>
                  </div>
                </div>
              )}
              {collapsed && <div style={{ height: 6 }} />}

              {section.items.map(item => {
                const subLocked = item.permKey && user && user.role !== 'admin' &&
                  user.permissions != null && !can(user, item.permKey, 'view');
                if (subLocked) return null;

                const active = pathname === item.path || pathname.startsWith(item.path + '/');
                const iconD  = ICONS[item.icon] || ICONS.finance;

                return (
                  <div
                    key={item.path}
                    onClick={() => navigate(item.path)}
                    title={collapsed ? item.label : undefined}
                    style={{
                      display: 'flex', alignItems: 'center',
                      justifyContent: collapsed ? 'center' : 'flex-start',
                      gap: 10, height: 38,
                      padding: collapsed ? '0' : '0 12px 0 10px',
                      cursor: 'pointer',
                      background: active ? 'rgba(255,255,255,0.2)' : 'transparent',
                      borderLeft: `3px solid ${active ? 'rgba(255,255,255,0.85)' : 'transparent'}`,
                      transition: 'background 0.12s',
                      userSelect: 'none',
                    }}
                    onMouseEnter={e => { if (!active) e.currentTarget.style.background = HOVER; }}
                    onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}
                  >
                    <span style={{
                      width: 28, height: 28, borderRadius: 7, flexShrink: 0,
                      background: active ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.08)',
                      border: `1.5px solid ${active ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.2)'}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Ico d={iconD} color="#fff" size={13} stroke={active ? 2.2 : 1.9} />
                    </span>
                    {!collapsed && (
                      <span style={{
                        fontSize: 12, fontWeight: active ? 700 : 500,
                        color: active ? '#fff' : 'rgba(255,255,255,0.82)',
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      }}>
                        {item.label}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          ))}

          {/* Logout at bottom */}
          <div style={{ marginTop: 8 }}>
            <div
              onClick={() => { if (window.confirm('Log out?')) logout(); }}
              title={collapsed ? 'Logout' : undefined}
              style={{
                display: 'flex', alignItems: 'center',
                justifyContent: collapsed ? 'center' : 'flex-start',
                gap: 10, height: 38, padding: collapsed ? '0' : '0 12px 0 10px',
                cursor: 'pointer', transition: 'background 0.12s', userSelect: 'none',
                borderLeft: '3px solid transparent',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = HOVER; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
            >
              <span style={{
                width: 28, height: 28, borderRadius: 7, flexShrink: 0,
                background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Ico d={ICONS.logout} color="#fff" size={13} stroke={2}/>
              </span>
              {!collapsed && (
                <span style={{ fontSize: 12, fontWeight: 400, color: 'rgba(255,255,255,0.8)' }}>Logout</span>
              )}
            </div>
          </div>
        </nav>

        <UserFooter />
      </aside>
    );
  }

  /* ══════════════════════════════════════════
     NORMAL MODE — standard ERP navigation
  ══════════════════════════════════════════ */
  return (
    <aside
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: W, minWidth: W, flexShrink: 0,
        height: '100vh',
        background: BG,
        borderRight: `1px solid rgba(0,0,0,0.1)`,
        display: 'flex', flexDirection: 'column',
        fontFamily: F,
        transition: 'width 0.20s cubic-bezier(0.4,0,0.2,1), min-width 0.20s cubic-bezier(0.4,0,0.2,1)',
        overflow: 'hidden',
        zIndex: 20,
        boxShadow: '2px 0 16px rgba(0,0,0,0.18)',
      }}>

      <PinHeader />

      <nav style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '6px 0' }}>
        {NAV.map(({ key, label, path, routes, sub }) => {
          const active    = isActive(routes, pathname);
          const isOpen    = openKeys.has(key);
          const iconPaths = ICONS[key];
          const locked    = !hasAccess(key);

          const handleClick = () => {
            if (locked) return;
            if (key === 'finance') {
              // Enter account mode instead of accordion
              setAccountMode(true);
              navigate(path);
              return;
            }
            if (sub) {
              setOpenKeys(prev => {
                if (prev.has(key)) return new Set();
                navigate(path);
                return new Set([key]);
              });
            } else {
              navigate(path);
            }
          };

          if (locked) return null;

          return (
            <div key={key}>
              <div
                onClick={handleClick}
                title={collapsed ? label : undefined}
                style={{
                  display: 'flex', alignItems: 'center',
                  justifyContent: collapsed ? 'center' : 'flex-start',
                  gap: 10,
                  height: 40, padding: collapsed ? '0' : '0 12px 0 10px',
                  cursor: 'pointer',
                  background: active ? 'rgba(255,255,255,0.2)' : 'transparent',
                  borderLeft: `3px solid ${active ? 'rgba(255,255,255,0.85)' : 'transparent'}`,
                  transition: 'background 0.12s',
                  userSelect: 'none',
                }}
                onMouseEnter={e => { if (!active) e.currentTarget.style.background = HOVER; }}
                onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}
              >
                <span style={{
                  width: 30, height: 30, borderRadius: 8, flexShrink: 0,
                  background: active ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.1)',
                  border: `1.5px solid ${active ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.25)'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'all 0.15s',
                  boxShadow: active ? '0 2px 8px rgba(0,0,0,0.25)' : 'none',
                }}>
                  <Ico d={iconPaths} color="#fff" size={15} stroke={active ? 2.2 : 1.9} />
                </span>

                {!collapsed && (
                  <>
                    <span style={{
                      fontSize: 12.5, fontWeight: active ? 700 : 500,
                      color: '#fff',
                      flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>
                      {label}
                    </span>
                    {/* Show arrow for finance to indicate it opens account mode */}
                    {key === 'finance' && (
                      <span style={{ flexShrink: 0, color: 'rgba(255,255,255,0.6)' }}>
                        <Ico d={ICONS.chevron} color="currentColor" size={12} stroke={2.2} />
                      </span>
                    )}
                    {sub && key !== 'finance' && (
                      <span style={{ flexShrink: 0, color: 'rgba(255,255,255,0.6)' }}>
                        <Ico d={isOpen ? ICONS.chevronDown : ICONS.chevron}
                          color="currentColor" size={12} stroke={2.2} />
                      </span>
                    )}
                  </>
                )}
              </div>

              {!collapsed && isOpen && sub && (
                <div style={{ marginLeft: 24, borderLeft: `1px solid ${DIVIDER}`, marginBottom: 2, maxHeight: 320, overflowY: 'auto' }}>
                  {sub.map(s => {
                    const sa = pathname === s.path || pathname.startsWith(s.path + '/');
                    const subLocked = s.permKey && user && user.role !== 'admin' && user.permissions != null && !can(user, s.permKey, 'view');
                    if (subLocked) return null;
                    return (
                      <div key={s.path}
                        onClick={e => { e.stopPropagation(); navigate(s.path); }}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 8,
                          height: 32, padding: '0 10px 0 14px',
                          cursor: 'pointer',
                          background: sa ? 'rgba(255,255,255,0.15)' : 'transparent',
                          transition: 'background 0.1s',
                          userSelect: 'none',
                          borderRadius: '0 6px 6px 0',
                        }}
                        onMouseEnter={e => { if (!sa) e.currentTarget.style.background = HOVER; }}
                        onMouseLeave={e => { if (!sa) e.currentTarget.style.background = 'transparent'; }}
                      >
                        <span style={{
                          width: 5, height: 5, borderRadius: '50%', flexShrink: 0,
                          background: sa ? '#fff' : 'rgba(255,255,255,0.45)',
                        }}/>
                        <span style={{
                          fontSize: 12, fontWeight: sa ? 600 : 500,
                          color: sa ? '#fff' : 'rgba(255,255,255,0.78)',
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        }}>{s.label}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        <div style={{ marginTop: 4 }}>
          <div
            onClick={() => { if (window.confirm('Log out?')) logout(); }}
            title={collapsed ? 'Logout' : undefined}
            style={{
              display: 'flex', alignItems: 'center',
              justifyContent: collapsed ? 'center' : 'flex-start',
              gap: 10, height: 40, padding: collapsed ? '0' : '0 12px 0 10px',
              cursor: 'pointer', transition: 'background 0.12s', userSelect: 'none',
              borderLeft: '3px solid transparent',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
          >
            <span style={{
              width: 28, height: 28, borderRadius: 7, flexShrink: 0,
              background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Ico d={ICONS.logout} color="#fff" size={13} stroke={2}/>
            </span>
            {!collapsed && (
              <span style={{ fontSize: 12.5, fontWeight: 400, color: '#fff' }}>Logout</span>
            )}
          </div>
        </div>
      </nav>

      <UserFooter />
    </aside>
  );
}
