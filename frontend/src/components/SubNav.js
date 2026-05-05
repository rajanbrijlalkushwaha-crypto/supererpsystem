import { Link, useLocation } from 'react-router-dom';

const SECTIONS = {
  sales: {
    label: 'Sales Orders',
    routes: ['/sales-order'],
    tabs: [
      { label: 'Create Order', path: '/sales-order/create' },
      { label: 'View / Edit',  path: '/sales-order/view' },
      { label: 'Pending',      path: '/sales-order/pending' },
    ],
  },
  purchase: {
    label: 'Purchase Orders',
    routes: ['/purchase-order'],
    tabs: [
      { label: 'Purchase',          path: '/purchase-order/dashboard' },
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
      { label: 'Create Client', path: '/client-sap' },
      { label: 'View Clients',  path: '/client/view' },
      { label: 'Pending',       path: '/client/pending' },
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
      { label: 'New Expense',   path: '/account/expense/create' },
      { label: 'View Balance',  path: '/account/dues' },
      { label: 'Payment',       path: '/account/payment/create' },
      { label: 'Receipt',       path: '/account/receipt/create' },
      { label: 'Journals',      path: '/account/journal/view' },
      { label: 'Bank Accounts', path: '/account/bank/view' },
      { label: 'Add Bank',      path: '/account/bank/create' },
      { label: 'Statement',     path: '/account/statement' },
      { label: 'Approval',      path: '/account/approval' },
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
      { label: 'Job Sheets',        path: '/manufacturing/job-sheets' },
      { label: 'Create Job Sheet',  path: '/manufacturing/job-sheets/create' },
      { label: 'Locations',         path: '/manufacturing/locations' },
    ],
  },
  project: {
    label: 'Project',
    routes: ['/project'],
    tabs: [
      { label: 'Projects',       path: '/project/list' },
      { label: 'Create Project', path: '/project/create' },
    ],
  },
  stock: {
    label: 'Stock',
    routes: ['/stock'],
    tabs: [
      { label: 'Stock View',             path: '/stock/view' },
      { label: 'GRN (Goods Receipt)',    path: '/stock/in' },
      { label: 'GDN (Delivery Challan)', path: '/stock/out' },
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

const P = '#2563EB';
const F = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

const TAB_ICONS = {
  sales:         { 'Create Order': '✏️', 'View / Edit': '📄', 'Pending': '⏳' },
  purchase:      { 'Create PO': '✏️', 'View / Edit': '📄', 'Pending Approval': '⏳' },
  client:        { 'Create Client': '➕', 'View Clients': '👥', 'Pending': '⏳' },
  vendor:        { 'Create Vendor': '➕', 'View Vendors': '🏢', 'Pending': '⏳', 'Self Registrations': '🌐' },
  items:         { 'Create Item': '➕', 'View Items': '📦', 'Order Tracker': '🔗' },
  account:       { 'Expense': '🧾', 'New Expense': '➕', 'View Balance': '💰', 'Payment': '💳', 'Receipt': '📥', 'Journals': '📒', 'Bank Accounts': '🏦', 'Add Bank': '➕', 'Statement': '📊', 'Approval': '✅' },
  tally:         { 'Import': '📥', 'Pending Review': '🔍' },
  manufacturing: { 'Job Sheets': '📋', 'Create Job Sheet': '➕', 'Locations': '📍' },
  project:       { 'Projects': '📁', 'Create Project': '➕' },
  stock:         { 'Stock View': '🏬', 'GRN (Goods Receipt)': '📥', 'GDN (Delivery Challan)': '📤' },
  admin:         { 'Companies': '🏢' },
};

export default function SubNav() {
  const { pathname } = useLocation();
  const sectionEntry = Object.entries(SECTIONS).find(([, s]) => match(s.routes, pathname));
  if (!sectionEntry) return null;
  const [sectionKey, section] = sectionEntry;
  if (!section || section.tabs.length === 0) return null;
  const iconMap = TAB_ICONS[sectionKey] || {};

  return (
    <nav style={{
      display: 'flex', alignItems: 'stretch',
      background: '#FFFFFF',
      borderBottom: '2px solid #E5E7EB',
      flexShrink: 0, height: 40,
      fontFamily: F,
    }}>
      {/* Section label — pinned left, never scrolls away */}
      <div style={{
        fontSize: 11, fontWeight: 800, color: '#1E293B',
        textTransform: 'uppercase', letterSpacing: '0.8px',
        padding: '0 12px 0 10px', whiteSpace: 'nowrap',
        borderRight: '2px solid #E5E7EB',
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
          return (
            <Link key={tab.path} to={tab.path} style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '0 11px',
              height: '100%',
              fontSize: 11.5,
              fontWeight: isAct ? 700 : 400,
              color: isAct ? P : '#6B7280',
              background: isAct ? '#EFF6FF' : 'transparent',
              textDecoration: 'none',
              borderBottom: isAct ? `2px solid ${P}` : '2px solid transparent',
              marginBottom: -2,
              fontFamily: F, whiteSpace: 'nowrap',
              transition: 'all 0.15s', flexShrink: 0,
            }}
            onMouseEnter={e => { if (!isAct) e.currentTarget.style.background = '#F9FAFB'; }}
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
