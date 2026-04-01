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
  vendor: {
    label: 'Vendors',
    routes: ['/vendor'],
    tabs: [
      { label: 'Create Vendor', path: '/vendor/create' },
      { label: 'View Vendors',  path: '/vendor/view' },
      { label: 'Pending',       path: '/vendor/pending' },
    ],
  },
  account: {
    label: 'Nav Balance',
    routes: ['/account'],
    tabs: [
      { label: 'View Balance',  path: '/account/dues' },
      { label: 'Payment',       path: '/account/payment/create' },
      { label: 'Receipt',       path: '/account/receipt/create' },
      { label: 'Journals',      path: '/account/journal/view' },
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
  admin: {
    label: 'Admin',
    routes: ['/admin'],
    tabs: [
      { label: 'Companies', path: '/admin/companies' },
    ],
  },
};

const match = (routes, path) => routes.some(r => path === r || path.startsWith(r + '/'));

export default function SubNav() {
  const { pathname } = useLocation();
  const section = Object.values(SECTIONS).find(s => match(s.routes, pathname));
  if (!section || section.tabs.length === 0) return null;

  const F = "Arial,'Segoe UI',sans-serif";
  const N = '#354A5E';

  return (
    <nav style={{
      display: 'flex', alignItems: 'flex-end',
      background: '#e4e8ed',
      borderBottom: `2px solid ${N}`,
      padding: '4px 6px 0', gap: 2,
      flexShrink: 0,
    }}>
      {/* Section label */}
      <div style={{
        fontSize: 10, fontWeight: 700, color: '#666',
        fontFamily: F, textTransform: 'uppercase', letterSpacing: 0.5,
        padding: '3px 10px 5px', whiteSpace: 'nowrap', marginRight: 4,
      }}>
        {section.label}
      </div>

      {/* Tabs */}
      {section.tabs.map(tab => {
        const isAct = pathname === tab.path || pathname.startsWith(tab.path + '/');
        return (
          <Link key={tab.path} to={tab.path} style={{
            display: 'flex', alignItems: 'center',
            padding: '3px 11px',
            fontSize: 11,
            fontWeight: isAct ? 700 : 400,
            color: isAct ? N : '#555',
            background: isAct ? '#fff' : '#d4d8de',
            textDecoration: 'none',
            border: `1px solid ${isAct ? '#b0b0b0' : '#bbb'}`,
            borderBottom: isAct ? '1px solid #fff' : `1px solid #b0b0b0`,
            marginBottom: isAct ? -2 : 0,
            fontFamily: F, whiteSpace: 'nowrap',
            position: 'relative', zIndex: isAct ? 1 : 0,
          }}>
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
