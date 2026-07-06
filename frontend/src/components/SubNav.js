import { Link, useLocation } from 'react-router-dom';

const SECTIONS = {
  sales: {
    label: 'Sales Orders',
    routes: ['/sales-order'],
    tabs: [
      { label: 'All Sales Orders', path: '/sales-order/view' },
      { label: '+ Create SO',      path: '/sales-order/create', isCreate: true },
      { label: 'Pending',          path: '/sales-order/pending' },
    ],
  },
  purchase: {
    label: 'Purchase Orders',
    routes: ['/purchase-order'],
    tabs: [
      { label: 'PO Tracking',       path: '/purchase-order/tracking' },
      { label: 'Create PO',         path: '/purchase-order/create' },
      { label: 'View / Edit',       path: '/purchase-order/view' },
      { label: 'Pending Approval',  path: '/purchase-order/pending' },
    ],
  },
  client: {
    label: 'Clients',
    routes: ['/client', '/client-sap'],
    tabs: [
      { label: 'View Clients', path: '/client/view' },
      { label: 'Pending',      path: '/client/pending' },
    ],
  },
  items: {
    label: 'Items',
    routes: ['/items'],
    tabs: [
      { label: 'Create Item',   path: '/items/create' },
      { label: 'View Items',    path: '/items/view' },
      { label: 'Order Tracker', path: '/items/tracker' },
    ],
  },
  vendor: {
    label: 'Vendors',
    routes: ['/vendor'],
    tabs: [
      { label: 'Create Vendor',      path: '/vendor/create' },
      { label: 'View Vendors',       path: '/vendor/view' },
      { label: 'Pending',            path: '/vendor/pending' },
      { label: 'Self Registrations', path: '/vendor/self-registrations' },
    ],
  },
  account: {
    label: 'Nav Balance',
    routes: ['/account'],
    tabs: [
      { label: 'Expense',       path: '/account/expense/view' },
      { label: 'Debit Note',    path: '/account/debit-note/view' },
      { label: 'Credit Note',   path: '/account/credit-note/view' },
      { label: 'Payment',       path: '/account/payment/create' },
      { label: 'Receipt',       path: '/account/receipt/create' },
      { label: 'Journals',      path: '/account/journal/view' },
      { label: 'View Balance',  path: '/account/dues' },
      { label: 'Bank Accounts', path: '/account/bank/view' },
      { label: 'Statement',     path: '/account/statement' },
      { label: 'Approval',      path: '/account/approval' },
      { label: 'All Ledgers',   path: '/account/ledger/view' },
      { label: 'Deposit',       path: '/account/deposit/view' },
    ],
  },
  tally: {
    label: 'Tally Import',
    routes: ['/tally'],
    tabs: [
      { label: 'Import',         path: '/tally/import' },
      { label: 'Pending Review', path: '/tally/pending' },
    ],
  },
  manufacturing: {
    label: 'Manufacturing',
    routes: ['/manufacturing'],
    tabs: [
      { label: 'Mfg Orders',        path: '/manufacturing/orders' },
      { label: 'Job Sheets',        path: '/manufacturing/job-sheets' },
      { label: 'Create Job Sheet',  path: '/manufacturing/job-sheets/create' },
      { label: 'Locations',         path: '/manufacturing/locations' },
    ],
  },
  project: {
    label: 'Project',
    routes: ['/project'],
    tabs: [
      { label: 'Jobcodes',      path: '/project/list' },
      { label: 'Project Close', path: '/project/close' },
    ],
  },
  stock: {
    label: 'Stock',
    routes: ['/stock'],
    tabs: [
      { label: 'Stock View',          path: '/stock/view' },
      { label: 'GRN (Goods Receipt)', path: '/stock/in' },
      { label: 'GDN (Stock Out)',     path: '/stock/out' },
      { label: 'Delivery Challan',    path: '/stock/challan' },
    ],
  },
  admin: {
    label: 'Admin',
    routes: ['/admin'],
    tabs: [
      { label: 'Companies', path: '/admin/companies' },
    ],
  },
};

const match = (routes, path) => routes.some(r => path === r || path.startsWith(r + '/'));

const P = '#60A5FA';
const F = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

const TAB_ICONS = {
  sales:         { 'Create Order': '✏️', 'View / Edit': '📄', 'Pending': '⏳' },
  purchase:      { 'Create PO': '✏️', 'View / Edit': '📄', 'Pending Approval': '⏳' },
  client:        { 'Create Client': '➕', 'View Clients': '👥', 'Pending': '⏳' },
  vendor:        { 'Create Vendor': '➕', 'View Vendors': '🏢', 'Pending': '⏳', 'Self Registrations': '🌐' },
  items:         { 'Create Item': '➕', 'View Items': '📦', 'Order Tracker': '🔗' },
  account:       { 'Expense': '🧾', 'Debit Note': '📋', 'Credit Note': '📄', 'Payment': '💳', 'Receipt': '📥', 'Journals': '📒', 'View Balance': '💰', 'Bank Accounts': '🏦', 'Statement': '📊', 'Approval': '✅', 'All Ledgers': '📚', 'Deposit': '🏧' },
  tally:         { 'Import': '📥', 'Pending Review': '🔍' },
  manufacturing: { 'Mfg Orders': '🏭', 'Job Sheets': '📋', 'Create Job Sheet': '➕', 'Locations': '📍' },
  project:       { 'Projects': '📁', 'Create Project': '➕' },
  stock:         { 'Stock View': '🏬', 'GRN (Goods Receipt)': '📥', 'GDN (Stock Out)': '📤', 'Delivery Challan': '🚚' },
  admin:         { 'Companies': '🏢' },
};

export default function SubNav() {
  const { pathname } = useLocation();
  // Account mode sidebar handles all account navigation — hide tab bar on account/tally pages
  if (pathname.startsWith('/account') || pathname.startsWith('/tally')) return null;
  const sectionEntry = Object.entries(SECTIONS).find(([, s]) => match(s.routes, pathname));
  if (!sectionEntry) return null;
  const [sectionKey, section] = sectionEntry;
  if (!section || section.tabs.length === 0) return null;
  const iconMap = TAB_ICONS[sectionKey] || {};

  return (
    <nav style={{
      display: 'flex', alignItems: 'stretch',
      background: '#104f4f',
      borderBottom: '2px solid rgba(255,255,255,0.15)',
      flexShrink: 0, height: 40,
      fontFamily: F,
    }}>
      {/* Section label — pinned left, never scrolls away */}
      <div style={{
        fontSize: 11, fontWeight: 800, color: '#FFFFFF',
        textTransform: 'uppercase', letterSpacing: '0.8px',
        padding: '0 12px 0 10px', whiteSpace: 'nowrap',
        borderRight: '2px solid rgba(255,255,255,0.18)',
        display: 'flex', alignItems: 'center',
        flexShrink: 0,
      }}>
        {section.label}
      </div>

      {/* Tab strip — scrolls horizontally; scrollbar hidden via App.css */}
      <div className="subnav-tabs" style={{
        display: 'flex', alignItems: 'stretch',
        overflowX: 'auto', flex: 1,
        scrollbarWidth: 'none',
        msOverflowStyle: 'none',
      }}>
        {section.tabs.map(tab => {
          const isAct = pathname === tab.path || pathname.startsWith(tab.path + '/');
          const icon  = iconMap[tab.label] || '';
          if (tab.isCreate) {
            return (
              <Link key={tab.path} to={tab.path} style={{
                display: 'flex', alignItems: 'center', gap: 4,
                padding: '0 14px', height: '100%',
                fontSize: 11.5, fontWeight: 700,
                color: '#fff',
                background: isAct ? '#047857' : '#059669',
                textDecoration: 'none',
                borderBottom: '2px solid transparent',
                marginBottom: -2,
                fontFamily: F, whiteSpace: 'nowrap',
                transition: 'all 0.15s', flexShrink: 0,
                alignSelf: 'center', borderRadius: 5,
                margin: '0 6px', height: 26,
              }}
              onMouseEnter={e => { e.currentTarget.style.background = '#047857'; }}
              onMouseLeave={e => { e.currentTarget.style.background = isAct ? '#047857' : '#059669'; }}>
                {tab.label}
              </Link>
            );
          }
          return (
            <Link key={tab.path} to={tab.path} style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '0 11px',
              height: '100%',
              fontSize: 11.5,
              fontWeight: isAct ? 700 : 400,
              color: isAct ? '#FFFFFF' : 'rgba(255,255,255,0.65)',
              background: isAct ? 'rgba(255,255,255,0.12)' : 'transparent',
              textDecoration: 'none',
              borderBottom: isAct ? '2px solid rgba(255,255,255,0.85)' : '2px solid transparent',
              marginBottom: -2,
              fontFamily: F, whiteSpace: 'nowrap',
              transition: 'all 0.15s', flexShrink: 0,
            }}
            onMouseEnter={e => { if (!isAct) e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; }}
            onMouseLeave={e => { if (!isAct) e.currentTarget.style.background = 'transparent'; }}>
              {icon && <span style={{ fontSize: 12 }}>{icon}</span>}
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
