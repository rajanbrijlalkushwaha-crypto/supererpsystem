import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';

const NAV = [
  { key: 'client',  label: 'Clients',         icon: '👥', path: '/client-sap',            routes: ['/client', '/client-sap'] },
  { key: 'vendor',  label: 'Vendors',         icon: '🏭', path: '/vendor/create',         routes: ['/vendor'] },
  { key: 'sales',   label: 'Sales Orders',    icon: '🧾', path: '/sales-order/create',    routes: ['/sales-order'] },
  { key: 'purchase',label: 'Purchase Orders', icon: '🛒', path: '/purchase-order/create', routes: ['/purchase-order'] },
  { key: 'account', label: 'Nav Balance',     icon: '💰', path: '/account/dues',          routes: ['/account'] },
  { key: 'tally',   label: 'Tally Import',    icon: '📥', path: '/tally/import',          routes: ['/tally'] },
  { key: 'admin',   label: 'Admin',           icon: '⚙️', path: '/admin/companies',       routes: ['/admin'] },
];

const match = (routes, path) => routes?.some(r => path === r || path.startsWith(r + '/'));

const ACCENT = '#1a4a7a';
const F = "'Segoe UI', Arial, sans-serif";

const W_COLLAPSED = 46;
const W_EXPANDED  = 210;

export default function Sidebar() {
  const { pathname } = useLocation();
  const [hovered, setHovered] = useState(false);

  const expanded = hovered;
  const w = expanded ? W_EXPANDED : W_COLLAPSED;

  return (
    <aside
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: w, minWidth: w, flexShrink: 0,
        background: '#f8fafc',
        borderRight: '1px solid #e2e8f0',
        display: 'flex', flexDirection: 'column',
        fontFamily: F, overflow: 'hidden',
        boxShadow: '2px 0 8px rgba(0,0,0,0.06)',
        transition: 'width 0.22s ease',
      }}
    >
      {/* Nav */}
      <ul style={{
        listStyle: 'none', margin: 0,
        padding: expanded ? '8px 6px' : '8px 4px',
        flex: 1, overflowY: 'auto', overflowX: 'hidden',
        transition: 'padding 0.22s ease',
      }}>
        {NAV.map(node => {
          const active = match(node.routes, pathname);
          return (
            <li key={node.key} style={{ marginBottom: 3 }}>
              <Link to={node.path} title={!expanded ? node.label : undefined} style={{
                display: 'flex', alignItems: 'center',
                gap: expanded ? 9 : 0,
                padding: expanded ? '6px 8px' : '6px 0',
                justifyContent: expanded ? 'flex-start' : 'center',
                borderRadius: 6,
                fontSize: 12, fontWeight: active ? 700 : 500,
                color: active ? ACCENT : '#475569',
                background: active ? '#eff6ff' : 'transparent',
                textDecoration: 'none',
                borderLeft: active ? `3px solid ${ACCENT}` : '3px solid transparent',
                transition: 'all 0.15s',
                overflow: 'hidden', whiteSpace: 'nowrap',
              }}
                onMouseEnter={e => { if (!active) { e.currentTarget.style.background = '#f1f5f9'; e.currentTarget.style.color = '#1e293b'; } }}
                onMouseLeave={e => { if (!active) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#475569'; } }}
              >
                {/* Circle icon — same style as numbered tab circles */}
                <span style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                  background: active ? ACCENT : '#d0d8e4',
                  fontSize: 14,
                  transition: 'background 0.15s',
                }}>{node.icon}</span>
                {expanded && (
                  <span style={{ fontSize: 12, fontWeight: active ? 700 : 500 }}>{node.label}</span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>

      {/* Footer */}
      <div style={{
        padding: expanded ? '8px 14px' : '8px 0',
        justifyContent: expanded ? 'flex-start' : 'center',
        borderTop: '1px solid #e2e8f0',
        background: '#fff',
        fontSize: 10, color: '#94a3b8',
        display: 'flex', alignItems: 'center', gap: 6,
        overflow: 'hidden', whiteSpace: 'nowrap',
        transition: 'padding 0.22s ease',
      }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', flexShrink: 0 }} />
        {expanded && 'Epsilon ERP v2.0'}
      </div>
    </aside>
  );
}
