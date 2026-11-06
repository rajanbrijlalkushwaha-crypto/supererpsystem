import { Link, useLocation } from 'react-router-dom';
import { useNavTheme, NEU } from '../utils/navTheme';

const SECTIONS = {
  crm: {
    label: 'CRM',
    routes: ['/crm', '/communication'],
    tabs: [
      { label: 'Leads / CRM',      path: '/crm/view' },
      { label: 'Communication',    path: '/communication/logs' },
      { label: 'Proforma Invoice', path: '/proforma-invoice/view' },
    ],
  },
  sales: {
    label: 'Sales Orders',
    routes: ['/sales-order'],
    tabs: [
      { label: 'All Sales Orders', path: '/sales-order/view' },
      { label: '+ Create SO',      path: '/sales-order/create', isCreate: true },
      { label: 'Pending',          path: '/sales-order/pending' },
      { label: 'Proforma Invoice', path: '/proforma-invoice/view' },
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
      { label: '+ Create Client', path: '/client-sap', isCreate: true },
      { label: 'View Clients', path: '/client/view' },
      { label: 'Pending',      path: '/client/pending' },
    ],
  },
  items: {
    label: 'Items',
    routes: ['/items'],
    tabs: [
      { label: 'Create Item', path: '/items/create' },
      { label: 'View Items',  path: '/items/view' },
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
      { label: 'Report',        path: '/project/report' },
      { label: 'Project Close', path: '/project/close' },
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
  crm:           { 'Leads / CRM': '👥', 'Communication': '💬', 'Proforma Invoice': '📋' },
  sales:         { 'Create Order': '✏️', 'View / Edit': '📄', 'Pending': '⏳', 'Proforma Invoice': '📋' },
  purchase:      { 'Create PO': '✏️', 'View / Edit': '📄', 'Pending Approval': '⏳' },
  client:        { 'Create Client': '➕', 'View Clients': '👥', 'Pending': '⏳' },
  vendor:        { 'Create Vendor': '➕', 'View Vendors': '🏢', 'Pending': '⏳', 'Self Registrations': '🌐' },
  items:         { 'Create Item': '➕', 'View Items': '📦' },
  account:       { 'Expense': '🧾', 'Debit Note': '📋', 'Credit Note': '📄', 'Payment': '💳', 'Receipt': '📥', 'Journals': '📒', 'View Balance': '💰', 'Bank Accounts': '🏦', 'Statement': '📊', 'Approval': '✅', 'All Ledgers': '📚', 'Deposit': '🏧' },
  tally:         { 'Import': '📥', 'Pending Review': '🔍' },
  manufacturing: { 'Mfg Orders': '🏭', 'Job Sheets': '📋', 'Create Job Sheet': '➕', 'Locations': '📍' },
  project:       { 'Projects': '📁', 'Create Project': '➕' },
  admin:         { 'Companies': '🏢' },
};

export default function SubNav() {
  const { pathname } = useLocation();
  const [navTheme] = useNavTheme();
  const neu = navTheme === 'neu';
  if (pathname.startsWith('/account') || pathname.startsWith('/tally') || pathname.startsWith('/project') || pathname.startsWith('/client') || pathname.startsWith('/client-sap') || pathname.startsWith('/sales-order') || pathname.startsWith('/vendor')) return null;
  const sectionEntry = Object.entries(SECTIONS).find(([, s]) => match(s.routes, pathname));
  if (!sectionEntry) return null;
  const [sectionKey, section] = sectionEntry;
  if (!section || section.tabs.length === 0) return null;
  const iconMap = TAB_ICONS[sectionKey] || {};

  return (
    <nav style={neu ? {
      display: 'flex', alignItems: 'stretch',
      background: NEU.base, flexShrink: 0, height: 46, fontFamily: F,
      boxShadow: '0 4px 10px rgba(163,177,198,0.45)', position: 'relative', zIndex: 2,
    } : {
      display: 'flex', alignItems: 'stretch',
      background: '#3A6186',
      borderBottom: '2px solid #2A4D6E',
      flexShrink: 0, height: 40,
      fontFamily: F,
    }}>
      {/* Section label — pinned left, never scrolls away */}
      <div style={{
        fontSize: 11, fontWeight: 800, color: neu ? NEU.strong : '#FFFFFF',
        textTransform: 'uppercase', letterSpacing: '0.8px',
        padding: '0 12px 0 10px', whiteSpace: 'nowrap',
        borderRight: neu ? '1px solid rgba(163,177,198,0.6)' : '2px solid rgba(255,255,255,0.18)',
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
            if (neu) {
              return (
                <Link key={tab.path} to={tab.path} style={{
                  display: 'flex', alignItems: 'center', gap: 4, padding: '0 14px',
                  fontSize: 11.5, fontWeight: 700, color: '#047857', background: NEU.base,
                  boxShadow: isAct ? NEU.inset : NEU.raisedSm, textDecoration: 'none', fontFamily: F,
                  whiteSpace: 'nowrap', flexShrink: 0, alignSelf: 'center', borderRadius: 10, margin: '0 6px', height: 30,
                }}>{tab.label}</Link>
              );
            }
            return (
              <Link key={tab.path} to={tab.path} style={{
                display: 'flex', alignItems: 'center', gap: 4,
                padding: '0 14px',
                fontSize: 11.5, fontWeight: 700,
                color: '#fff',
                background: isAct ? '#047857' : '#059669',
                border: '1px solid rgba(255,255,255,0.3)',
                boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
                textDecoration: 'none',
                fontFamily: F, whiteSpace: 'nowrap',
                transition: 'background 0.15s', flexShrink: 0,
                alignSelf: 'center', borderRadius: 6,
                margin: '0 6px', height: 26,
              }}
              onMouseEnter={e => { e.currentTarget.style.background = '#047857'; }}
              onMouseLeave={e => { e.currentTarget.style.background = isAct ? '#047857' : '#059669'; }}>
                {tab.label}
              </Link>
            );
          }
          if (neu) {
            return (
              <Link key={tab.path} to={tab.path} style={{
                display: 'flex', alignItems: 'center', gap: 4, padding: '0 13px', height: 30, alignSelf: 'center',
                fontSize: 11.5, fontWeight: isAct ? 700 : 600, color: isAct ? NEU.accent : NEU.text,
                background: NEU.base, boxShadow: isAct ? NEU.inset : NEU.raisedSm, textDecoration: 'none',
                borderRadius: 10, margin: '0 6px', fontFamily: F, whiteSpace: 'nowrap', flexShrink: 0,
              }}>
                {icon && <span style={{ fontSize: 12 }}>{icon}</span>}
                {tab.label}
              </Link>
            );
          }
          return (
            <Link key={tab.path} to={tab.path} style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '0 12px',
              height: 26, alignSelf: 'center',
              fontSize: 11.5,
              fontWeight: isAct ? 700 : 600,
              color: isAct ? '#FFFFFF' : 'rgba(255,255,255,0.85)',
              background: isAct ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.07)',
              border: `1px solid ${isAct ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.22)'}`,
              boxShadow: isAct ? '0 2px 6px rgba(0,0,0,0.22)' : '0 1px 2px rgba(0,0,0,0.12)',
              textDecoration: 'none', borderRadius: 6,
              margin: '0 4px',
              fontFamily: F, whiteSpace: 'nowrap',
              transition: 'background 0.1s, border-color 0.1s', flexShrink: 0,
            }}
            onMouseEnter={e => { if (!isAct) { e.currentTarget.style.background = 'rgba(255,255,255,0.14)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.55)'; } }}
            onMouseLeave={e => { if (!isAct) { e.currentTarget.style.background = 'rgba(255,255,255,0.07)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.22)'; } }}>
              {icon && <span style={{ fontSize: 12 }}>{icon}</span>}
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
