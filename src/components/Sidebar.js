import { useLocation, useNavigate } from 'react-router-dom';

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   ILLUSTRATED SVG ICONS  — matching screenshot
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

/* Dashboard — speedometer gauge */
const IcoDashboard = () => (
  <svg viewBox="0 0 48 48" width="26" height="26">
    <circle cx="24" cy="28" r="18" fill="#1e2a3a"/>
    <path d="M8 28 A16 16 0 0 1 40 28" fill="none" stroke="#ef4444" strokeWidth="4" strokeLinecap="round"/>
    <path d="M8 28 A16 16 0 0 1 24 12" fill="none" stroke="#f97316" strokeWidth="4" strokeLinecap="round"/>
    <path d="M24 12 A16 16 0 0 1 40 28" fill="none" stroke="#22c55e" strokeWidth="4" strokeLinecap="round"/>
    <circle cx="24" cy="28" r="4" fill="#fff"/>
    <line x1="24" y1="28" x2="16" y2="18" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"/>
    <circle cx="24" cy="28" r="2" fill="#94a3b8"/>
  </svg>
);

/* Clients — two people */
const IcoClients = () => (
  <svg viewBox="0 0 48 48" width="26" height="26">
    <circle cx="16" cy="16" r="8" fill="#f97316"/>
    <circle cx="16" cy="16" r="5" fill="#fed7aa"/>
    <path d="M2 40c0-8 6-14 14-14s14 6 14 14" fill="#f97316"/>
    <circle cx="32" cy="14" r="7" fill="#3b82f6"/>
    <circle cx="32" cy="14" r="4.5" fill="#bfdbfe"/>
    <path d="M20 40c0-7 5-12 12-12s12 5 12 12" fill="#3b82f6"/>
  </svg>
);

/* Vendors — handshake */
const IcoVendors = () => (
  <svg viewBox="0 0 48 48" width="26" height="26">
    <path d="M4 30l10-10 6 2 8-8 6 2 10-8" stroke="#3b82f6" strokeWidth="2" fill="none" strokeLinecap="round"/>
    <path d="M4 28c0 0 8-8 12-8l6 4 8-6 8 4 6-4" fill="#93c5fd" stroke="#3b82f6" strokeWidth="1"/>
    <path d="M6 26 Q24 16 42 26" fill="#fed7aa" stroke="#f97316" strokeWidth="2"/>
    <circle cx="16" cy="26" r="3" fill="#f97316"/>
    <circle cx="32" cy="22" r="3" fill="#3b82f6"/>
    <path d="M14 26 Q24 32 34 22" fill="none" stroke="#fbbf24" strokeWidth="2.5" strokeLinecap="round"/>
    <rect x="2" y="28" width="8" height="14" rx="2" fill="#3b82f6"/>
    <rect x="38" y="24" width="8" height="14" rx="2" fill="#f97316"/>
    <path d="M10 30 Q24 38 38 28" fill="#fde68a" stroke="#f59e0b" strokeWidth="1.5"/>
  </svg>
);

/* Sales Orders — shopping cart */
const IcoSales = () => (
  <svg viewBox="0 0 48 48" width="26" height="26">
    <path d="M4 8h6l6 22h22l6-18H14" stroke="#3b82f6" strokeWidth="0" fill="none"/>
    <rect x="14" y="12" width="24" height="18" rx="3" fill="#3b82f6"/>
    <path d="M4 8h8l2 4H8L4 8z" fill="#1d4ed8"/>
    <path d="M8 12h28l-4 14H12L8 12z" fill="#60a5fa"/>
    <rect x="18" y="16" width="4" height="6" rx="1" fill="#fff" opacity="0.7"/>
    <rect x="24" y="16" width="4" height="6" rx="1" fill="#fbbf24" opacity="0.9"/>
    <circle cx="18" cy="34" r="3.5" fill="#1d4ed8" stroke="#fff" strokeWidth="1.5"/>
    <circle cx="32" cy="34" r="3.5" fill="#1d4ed8" stroke="#fff" strokeWidth="1.5"/>
    <path d="M4 8L8 12l28 0 4-4" fill="#2563eb"/>
  </svg>
);

/* Purchase Orders — invoice document */
const IcoPurchase = () => (
  <svg viewBox="0 0 48 48" width="26" height="26">
    <rect x="8" y="4" width="32" height="40" rx="4" fill="#e0f2fe"/>
    <rect x="8" y="4" width="32" height="12" rx="4" fill="#0284c7"/>
    <rect x="14" y="22" width="20" height="2.5" rx="1.2" fill="#0284c7"/>
    <rect x="14" y="28" width="14" height="2.5" rx="1.2" fill="#7dd3fc"/>
    <rect x="14" y="34" width="18" height="2.5" rx="1.2" fill="#7dd3fc"/>
    <text x="24" y="14" textAnchor="middle" fill="#fff" fontSize="7" fontWeight="bold" fontFamily="Arial">PO</text>
  </svg>
);

/* Sales Bill — receipt with green accent */
const IcoSalesBill = () => (
  <svg viewBox="0 0 48 48" width="26" height="26">
    <rect x="8" y="2" width="28" height="42" rx="3" fill="#dcfce7"/>
    <rect x="8" y="2" width="28" height="11" rx="3" fill="#16a34a"/>
    <text x="22" y="11" textAnchor="middle" fill="#fff" fontSize="6.5" fontWeight="bold" fontFamily="Arial">SB</text>
    <rect x="13" y="19" width="18" height="2.2" rx="1" fill="#16a34a"/>
    <rect x="13" y="24" width="13" height="2.2" rx="1" fill="#86efac"/>
    <rect x="13" y="29" width="16" height="2.2" rx="1" fill="#86efac"/>
    <rect x="13" y="34" width="10" height="2.2" rx="1" fill="#86efac"/>
    <path d="M8 40 l4-4 4 4 4-4 4 4 4-4 4 4 4-4" stroke="#16a34a" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

/* Purchase Bill — receipt with orange accent */
const IcoPurchaseBill = () => (
  <svg viewBox="0 0 48 48" width="26" height="26">
    <rect x="8" y="2" width="28" height="42" rx="3" fill="#fff7ed"/>
    <rect x="8" y="2" width="28" height="11" rx="3" fill="#ea580c"/>
    <text x="22" y="11" textAnchor="middle" fill="#fff" fontSize="6.5" fontWeight="bold" fontFamily="Arial">PB</text>
    <rect x="13" y="19" width="18" height="2.2" rx="1" fill="#ea580c"/>
    <rect x="13" y="24" width="13" height="2.2" rx="1" fill="#fdba74"/>
    <rect x="13" y="29" width="16" height="2.2" rx="1" fill="#fdba74"/>
    <rect x="13" y="34" width="10" height="2.2" rx="1" fill="#fdba74"/>
    <path d="M8 40 l4-4 4 4 4-4 4 4 4-4 4 4 4-4" stroke="#ea580c" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

/* Projects — gear with nodes */
const IcoProjects = () => (
  <svg viewBox="0 0 48 48" width="26" height="26">
    <circle cx="24" cy="24" r="10" fill="#6366f1"/>
    <circle cx="24" cy="24" r="5" fill="#c7d2fe"/>
    {[0,60,120,180,240,300].map((deg,i)=>{
      const r=Math.PI*deg/180, x=24+14*Math.cos(r), y=24+14*Math.sin(r);
      return <rect key={i} x={x-3} y={y-3} width="6" height="6" rx="1.5" fill="#4f46e5" transform={`rotate(${deg},${x},${y})`}/>;
    })}
    <circle cx="8" cy="10" r="5" fill="#f59e0b"/>
    <circle cx="40" cy="10" r="5" fill="#10b981"/>
    <circle cx="40" cy="40" r="5" fill="#ef4444"/>
    <line x1="13" y1="13" x2="20" y2="20" stroke="#94a3b8" strokeWidth="1.5"/>
    <line x1="35" y1="13" x2="28" y2="20" stroke="#94a3b8" strokeWidth="1.5"/>
    <line x1="35" y1="37" x2="28" y2="28" stroke="#94a3b8" strokeWidth="1.5"/>
  </svg>
);

/* Items / BOM — org chart hierarchy */
const IcoBOM = () => (
  <svg viewBox="0 0 48 48" width="26" height="26">
    <rect x="18" y="4" width="12" height="10" rx="3" fill="#a855f7"/>
    <rect x="4" y="34" width="12" height="10" rx="3" fill="#f97316"/>
    <rect x="18" y="34" width="12" height="10" rx="3" fill="#3b82f6"/>
    <rect x="32" y="34" width="12" height="10" rx="3" fill="#10b981"/>
    <line x1="24" y1="14" x2="24" y2="22" stroke="#94a3b8" strokeWidth="2"/>
    <line x1="10" y1="22" x2="38" y2="22" stroke="#94a3b8" strokeWidth="2"/>
    <line x1="10" y1="22" x2="10" y2="34" stroke="#94a3b8" strokeWidth="2"/>
    <line x1="24" y1="22" x2="24" y2="34" stroke="#94a3b8" strokeWidth="2"/>
    <line x1="38" y1="22" x2="38" y2="34" stroke="#94a3b8" strokeWidth="2"/>
  </svg>
);

/* Manufacturing — industrial robot/machine */
const IcoManufacturing = () => (
  <svg viewBox="0 0 48 48" width="26" height="26">
    <rect x="14" y="20" width="20" height="22" rx="3" fill="#475569"/>
    <rect x="18" y="14" width="12" height="8" rx="2" fill="#64748b"/>
    <rect x="22" y="10" width="4" height="6" rx="1" fill="#94a3b8"/>
    <rect x="6" y="24" width="8" height="5" rx="2" fill="#f59e0b"/>
    <rect x="34" y="24" width="8" height="5" rx="2" fill="#f59e0b"/>
    <rect x="18" y="26" width="5" height="5" rx="1" fill="#38bdf8"/>
    <rect x="25" y="26" width="5" height="5" rx="1" fill="#38bdf8"/>
    <rect x="16" y="34" width="6" height="8" rx="2" fill="#334155"/>
    <rect x="26" y="34" width="6" height="8" rx="2" fill="#334155"/>
    <circle cx="20" cy="17" r="2" fill="#fbbf24"/>
    <circle cx="28" cy="17" r="2" fill="#fbbf24"/>
    <path d="M6 44h36" stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round"/>
  </svg>
);

/* Stock — stacked boxes */
const IcoStock = () => (
  <svg viewBox="0 0 48 48" width="26" height="26">
    <rect x="4" y="32" width="18" height="14" rx="2" fill="#92400e"/>
    <rect x="26" y="32" width="18" height="14" rx="2" fill="#78350f"/>
    <rect x="14" y="20" width="20" height="14" rx="2" fill="#b45309"/>
    <rect x="4" y="32" width="18" height="4" rx="0" fill="#d97706"/>
    <rect x="26" y="32" width="18" height="4" rx="0" fill="#b45309"/>
    <rect x="14" y="20" width="20" height="4" rx="0" fill="#f59e0b"/>
    <line x1="13" y1="32" x2="13" y2="46" stroke="#fde68a" strokeWidth="1.5" opacity="0.5"/>
    <line x1="35" y1="32" x2="35" y2="46" stroke="#fde68a" strokeWidth="1.5" opacity="0.5"/>
    <line x1="24" y1="20" x2="24" y2="34" stroke="#fde68a" strokeWidth="1.5" opacity="0.5"/>
  </svg>
);

/* Accounts — gold coins stack */
const IcoAccounts = () => (
  <svg viewBox="0 0 48 48" width="26" height="26">
    <ellipse cx="24" cy="40" rx="14" ry="5" fill="#d97706"/>
    <rect x="10" y="32" width="28" height="8" rx="0" fill="#f59e0b"/>
    <ellipse cx="24" cy="32" rx="14" ry="5" fill="#fbbf24"/>
    <rect x="10" y="24" width="28" height="8" rx="0" fill="#f59e0b"/>
    <ellipse cx="24" cy="24" rx="14" ry="5" fill="#fcd34d"/>
    <rect x="10" y="16" width="28" height="8" rx="0" fill="#f59e0b"/>
    <ellipse cx="24" cy="16" rx="14" ry="5" fill="#fde68a"/>
    <text x="24" y="19" textAnchor="middle" fill="#92400e" fontSize="6" fontWeight="bold" fontFamily="Arial">₹</text>
  </svg>
);

/* Tally Import — download with document */
const IcoTally = () => (
  <svg viewBox="0 0 48 48" width="26" height="26">
    <rect x="8" y="6" width="28" height="36" rx="4" fill="#ddd6fe"/>
    <rect x="8" y="6" width="28" height="10" rx="4" fill="#7c3aed"/>
    <text x="22" y="14" textAnchor="middle" fill="#fff" fontSize="6" fontWeight="bold" fontFamily="Arial">TLY</text>
    <rect x="14" y="22" width="16" height="2" rx="1" fill="#7c3aed"/>
    <rect x="14" y="27" width="12" height="2" rx="1" fill="#a78bfa"/>
    <circle cx="36" cy="36" r="10" fill="#7c3aed"/>
    <path d="M36 28v10M31 34l5 6 5-6" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

/* Password Manager — padlock with keyhole */
const IcoPasswords = () => (
  <svg viewBox="0 0 48 48" width="26" height="26">
    <rect x="9" y="22" width="30" height="23" rx="5" fill="#4B5563"/>
    <path d="M16 23v-8a8 8 0 0 1 16 0v8" fill="none" stroke="#94A3B8" strokeWidth="4" strokeLinecap="round"/>
    <circle cx="24" cy="34" r="5" fill="#FCD34D"/>
    <rect x="22" y="34" width="4" height="6" rx="2" fill="#F59E0B"/>
    <circle cx="35" cy="13" r="7" fill="#22c55e"/>
    <text x="35" y="17" textAnchor="middle" fill="#fff" fontSize="8" fontWeight="bold" fontFamily="Arial">🔑</text>
  </svg>
);

/* Admin — shield with gear */
const IcoAdmin = () => (
  <svg viewBox="0 0 48 48" width="26" height="26">
    <path d="M24 4L8 12v14c0 10 7 18 16 20 9-2 16-10 16-20V12L24 4z" fill="#e2e8f0"/>
    <path d="M24 4L8 12v14c0 10 7 18 16 20" fill="#cbd5e1"/>
    <circle cx="24" cy="26" r="8" fill="#64748b"/>
    <circle cx="24" cy="26" r="4" fill="#f1f5f9"/>
    {[0,60,120,180,240,300].map((deg,i)=>{
      const r=Math.PI*deg/180, x=24+10*Math.cos(r), y=26+10*Math.sin(r);
      return <circle key={i} cx={x} cy={y} r="2.5" fill="#475569"/>;
    })}
  </svg>
);

/* ── Nav structure ── */
const NAV_ITEMS = [
  { key:'dashboard', label:'Dashboard',      Ico:IcoDashboard,     path:'/dashboard',                routes:['/dashboard'] },
  { key:'client',    label:'Clients',         Ico:IcoClients,       path:'/client-sap',               routes:['/client','/client-sap'] },
  { key:'vendor',    label:'Vendors',         Ico:IcoVendors,       path:'/vendor/view',              routes:['/vendor'] },
  { key:'sales',     label:'Sales Orders',    Ico:IcoSales,         path:'/sales-order/create',       routes:['/sales-order'] },
  { key:'salesbill', label:'Sales Bill',      Ico:IcoSalesBill,     path:'/sales-bill',               routes:['/sales-bill'] },
  { key:'purchase',  label:'Purchase Orders', Ico:IcoPurchase,      path:'/purchase-order/create',    routes:['/purchase-order'] },
  { key:'purchasebill', label:'Purchase Bill',Ico:IcoPurchaseBill,  path:'/purchase-bill',            routes:['/purchase-bill'] },
  { key:'project',   label:'Projects',        Ico:IcoProjects,      path:'/project/list',             routes:['/project'] },
  { key:'items',     label:'Items / BOM',     Ico:IcoBOM,           path:'/items/view',               routes:['/items'] },
  { key:'mfg',       label:'Manufacturing',   Ico:IcoManufacturing, path:'/manufacturing/job-sheets', routes:['/manufacturing'] },
  { key:'stock',     label:'Stock',           Ico:IcoStock,         path:'/stock/view',               routes:['/stock'] },
  { key:'account',   label:'Accounts',        Ico:IcoAccounts,      path:'/account/dues',             routes:['/account'] },
  { key:'tally',     label:'Tally Import',    Ico:IcoTally,         path:'/tally/import',             routes:['/tally'] },
  { key:'passwords', label:'Password Manager',Ico:IcoPasswords,     path:'/passwords',                routes:['/passwords'] },
  { key:'admin',     label:'Admin',           Ico:IcoAdmin,         path:'/admin/companies',          routes:['/admin'] },
];

const isActive = (routes, path) =>
  routes?.some(r => path === r || path.startsWith(r + '/'));

const FONT = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

export default function Sidebar() {
  const { pathname } = useLocation();
  const navigate = useNavigate();

  return (
    <aside style={{
      width: 210, minWidth: 210, flexShrink: 0,
      background: '#1a2035',
      display: 'flex', flexDirection: 'column',
      fontFamily: FONT,
      overflowY: 'auto', overflowX: 'hidden',
      zIndex: 10,
    }}>
      <nav style={{ padding: '4px 0', display:'flex', flexDirection:'column' }}>
        {NAV_ITEMS.map(({ key, label, Ico, path, routes }) => {
          const active = isActive(routes, pathname);
          return (
            <div key={key}
              onClick={() => navigate(path)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                height: 38, padding: '0 8px',
                cursor: 'pointer',
                margin: '1px 5px', borderRadius: 6,
                background: active ? 'rgba(255,255,255,0.12)' : 'transparent',
                borderLeft: active ? '3px solid #60a5fa' : '3px solid transparent',
                transition: 'background 0.15s', flexShrink: 0,
                userSelect: 'none',
              }}
              onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
              onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}
            >
              <span style={{ width: 26, height: 26, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                <Ico />
              </span>
              <span style={{
                fontSize: 13, fontWeight: active ? 600 : 400,
                color: active ? '#ffffff' : '#cbd5e1',
                whiteSpace: 'nowrap',
                letterSpacing: '0.01em',
              }}>
                {label}
              </span>
              {active && <span style={{ marginLeft:'auto', color:'#60a5fa', fontSize:13 }}>›</span>}
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
