import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useCompany } from '../context/CompanyContext';
import { useAuth } from '../context/AuthContext';
import { useChat } from '../context/ChatContext';
import axios from 'axios';
import {
  Search, ChevronDown, Building2, LogOut, Settings,
  RefreshCw, Bell, User, ChevronRight,
} from 'lucide-react';

const FONT = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const TEAL = '#104f4f';
const TEAL2= '#14837e';

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
  { section:'Sales Bill',      label:'Delivery Challan',           path:'/delivery-challan/view',           color:'#0891b2', keys:'DC challan' },
  { section:'Purchase Bill',   label:'Purchase Bills',             path:'/purchase-bill',                   color:'#6d28d9', keys:'vendor invoice' },
  { section:'Purchase Bill',   label:'GRN (Goods Receipt)',        path:'/stock/in',                        color:'#6d28d9', keys:'goods received' },
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
  { section:'Stock',           label:'Stock View',                 path:'/stock/view',                      color:'#0f766e', keys:'inventory levels' },
  { section:'Stock',           label:'GRN — Goods Receipt',        path:'/stock/in',                        color:'#0f766e', keys:'receive inward' },
  { section:'Stock',           label:'GDN — Stock Out',            path:'/stock/out',                       color:'#0f766e', keys:'issue outward' },
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

const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

function useClickOutside(ref, onClose) {
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [ref, onClose]);
}

/* ── Navigation group config ───────────────────────────────────── */
const NAV_GROUPS = [
  {
    key: 'dashboard',
    label: 'Dashboard',
    icon: '🏠',
    color: '#3b82f6',
    path: '/dashboard',
    routes: ['/dashboard'],
  },
  {
    key: 'jobcode',
    label: 'Jobcode',
    icon: '📁',
    color: '#4f46e5',
    routes: ['/project'],
    items: [
      { label: '📋 All Jobcodes',  path: '/project/list'  },
      { label: '✅ Project Close', path: '/project/close' },
    ],
  },
  {
    key: 'crm',
    label: 'CRM',
    icon: '👥',
    color: '#ec4899',
    routes: ['/client', '/crm', '/sales-order', '/sales-bill', '/delivery-challan', '/communication'],
    sections: [
      {
        title: '👤 Clients', color: '#ec4899',
        items: [
          { label: '👥 View Clients',   path: '/client/view'        },
          { label: '🎯 CRM / Leads',    path: '/crm/view'           },
          { label: '💬 Communication',  path: '/communication/logs' },
        ],
      },
      {
        title: '📋 Sales', color: '#7c3aed',
        items: [
          { label: '📋 Sales Orders',   path: '/sales-order/view'        },
          { label: '🧾 Sales Bills',    path: '/sales-bill'              },
          { label: '🟢 Client Balance', path: '/account/dues?tab=client' },
        ],
      },
    ],
  },
  {
    key: 'vendor',
    label: 'Vendor',
    icon: '🏢',
    color: '#059669',
    routes: ['/vendor', '/purchase-order', '/purchase-bill'],
    sections: [
      {
        title: '🏢 Suppliers', color: '#059669',
        items: [
          { label: '🏢 All Vendors',        path: '/vendor/view'               },
          { label: '📝 Self Registrations', path: '/vendor/self-registrations' },
        ],
      },
      {
        title: '🛒 Purchasing', color: '#ea580c',
        items: [
          { label: '🛒 Purchase Orders', path: '/purchase-order/tracking' },
          { label: '📄 Purchase Bills',  path: '/purchase-bill'           },
          { label: '🔴 Vendor Dues',     path: '/account/dues?tab=vendor' },
        ],
      },
    ],
  },
  {
    key: 'inventory',
    label: 'Inventory',
    icon: '📦',
    color: '#0d9488',
    routes: ['/items', '/stock'],
    sections: [
      {
        title: '🗂️ Products', color: '#0d9488',
        items: [
          { label: '🗂️ Items / Products', path: '/items/view'   },
          { label: '➕ Create Item',       path: '/items/create' },
        ],
      },
      {
        title: '📦 Stock', color: '#0f766e',
        items: [
          { label: '📦 Stock View',          path: '/stock/view'    },
          { label: '📥 GRN (Goods Receipt)', path: '/stock/in'      },
          { label: '📤 GDN (Stock Out)',     path: '/stock/out'     },
          { label: '🚚 Delivery Challan',    path: '/stock/challan' },
        ],
      },
    ],
  },
  {
    key: 'account',
    label: 'Account',
    icon: '💰',
    color: '#b45309',
    routes: ['/account', '/tally', '/gst'],
    sections: [
      {
        title: '⚙️ Setup', color: '#0d9488',
        items: [
          { label: '📒 Ledger Master',  path: '/account/ledger/master' },
          { label: '🗂️ Account Groups', path: '/account/groups/view'   },
        ],
      },
      {
        title: '💳 Transactions', color: '#7c3aed',
        items: [
          { label: '🧾 Expense Entry',  path: '/account/expense/create'   },
          { label: '💳 Payment',        path: '/account/payment/create'   },
          { label: '💰 Receipt',        path: '/account/receipt/create'   },
          { label: '📔 Journal Entry',  path: '/account/journal/view'     },
          { label: '📉 Debit Note',     path: '/account/debit-note/view'  },
          { label: '📈 Credit Note',    path: '/account/credit-note/view' },
          { label: '🏦 Deposit',        path: '/account/deposit/view'     },
        ],
      },
      {
        title: '📊 Reports', color: '#b45309',
        items: [
          { label: '⚖️ View Balance',   path: '/account/dues'           },
          { label: '📒 All Ledgers',    path: '/account/ledger/view'    },
          { label: '🏦 Bank Accounts',  path: '/account/bank/view'      },
          { label: '📄 Statement',      path: '/account/statement'      },
        ],
      },
      {
        title: '🏷️ Compliance', color: '#dc2626',
        items: [
          { label: '🏷️ GST & Compliance', path: '/gst/compliance' },
          { label: '📥 Tally Import',     path: '/tally/import'   },
        ],
      },
    ],
  },
  {
    key: 'mfg',
    label: 'MFG',
    icon: '🏭',
    color: '#9333ea',
    routes: ['/manufacturing'],
    items: [
      { label: '🏭 Manufacturing Orders', path: '/manufacturing/orders'            },
      { label: '📋 Job Sheets',           path: '/manufacturing/job-sheets'        },
      { label: '➕ Create Job Sheet',     path: '/manufacturing/job-sheets/create' },
      { label: '📍 Locations',            path: '/manufacturing/locations'         },
    ],
  },
  {
    key: 'reports',
    label: 'Reports',
    icon: '📊',
    color: '#0284c7',
    alwaysShow: true,
    routes: ['/reports'],
    sections: [
      {
        title: '📒 Day Book', color: '#0284c7',
        items: [
          { label: '📖 Day Book',          path: '/reports/daybook'           },
          { label: '💵 Cash Book',         path: '/reports/cashbook'          },
          { label: '🏦 Bank Statement',    path: '/account/statement'         },
        ],
      },
      {
        title: '📅 Monthly Reports', color: '#7c3aed',
        items: [
          { label: '📋 Monthly Summary',   path: '/reports/monthly'           },
          { label: '📈 Sales Register',    path: '/reports/sales-register'    },
          { label: '📉 Purchase Register', path: '/reports/purchase-register' },
          { label: '💹 P&L Statement',     path: '/reports/pnl'               },
        ],
      },
      {
        title: '👥 Party Reports', color: '#059669',
        items: [
          { label: '📒 All Ledgers',       path: '/account/ledger/view'       },
          { label: '🟢 Client Balance',    path: '/account/dues?tab=client'   },
          { label: '🔴 Vendor Dues',       path: '/account/dues?tab=vendor'   },
          { label: '🏷️ GST Reports',       path: '/gst/compliance'            },
        ],
      },
    ],
  },
  {
    key: 'admin',
    label: 'Admin',
    icon: '⚙️',
    color: '#475569',
    alwaysShow: true,
    routes: ['/admin', '/approval', '/passwords'],
    sections: [
      {
        title: '🖥️ System', color: '#475569',
        items: [
          { label: '✅ Approvals',        path: '/approval'        },
          { label: '🔑 Password Manager', path: '/passwords'       },
          { label: '🏢 Companies',        path: '/admin/companies' },
          { label: '👤 User Management',  path: '/admin/users'     },
        ],
      },
      {
        title: '⚙️ Settings', color: '#0891b2',
        items: [
          { label: '📥 Tally Import',     path: '/tally/import'    },
        ],
      },
    ],
  },
  {
    key: 'company',
    label: 'Company',
    icon: '🏛️',
    color: '#0f766e',
    alwaysShow: true,
    path: '/company-info',
    routes: ['/company-info'],
  },
];

const isPathActive = (routes, pathname) =>
  routes?.some(r => pathname === r || pathname.startsWith(r + '/'));

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
function NotificationCentre({ companyId }) {
  const [open,   setOpen]   = useState(false);
  const [alerts, setAlerts] = useState([]);
  const ref = useRef(null);
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

  useEffect(() => { load(); }, [load]);

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
  const overdue    = alerts.filter(o => new Date(o.deliveryDate).setHours(0,0,0,0) < today.getTime());
  const badgeCount = alerts.length;

  return (
    <div ref={ref} style={{ position:'relative', flexShrink:0 }}>
      <button onClick={()=>setOpen(p=>!p)} title="Dispatch Notifications"
        style={{ width:32, height:32, borderRadius:7, cursor:'pointer', position:'relative',
          background:open?'#FFF7ED':'#F9FAFB', border:`1px solid ${open?'#FED7AA':'#E5E7EB'}`,
          color:open?'#EA580C':'#9ca3af', display:'flex', alignItems:'center', justifyContent:'center',
          transition:'all 0.15s', flexShrink:0 }}
        onMouseEnter={e=>{e.currentTarget.style.background='#FFF7ED';e.currentTarget.style.color='#EA580C';}}
        onMouseLeave={e=>{if(!open){e.currentTarget.style.background='#F9FAFB';e.currentTarget.style.color='#9ca3af';}}}>
        <Bell size={14} strokeWidth={2} />
        {badgeCount>0 && (
          <span style={{ position:'absolute', top:-4, right:-4, width:16, height:16, borderRadius:'50%',
            background:overdue.length>0?'#DC2626':'#F59E0B', color:'#fff', fontSize:9, fontWeight:800,
            display:'flex', alignItems:'center', justifyContent:'center', border:'2px solid #fff', lineHeight:1 }}>
            {badgeCount>9?'9+':badgeCount}
          </span>
        )}
      </button>

      {open && (
        <div style={{ position:'absolute', top:'calc(100% + 8px)', right:0, width:380,
          background:'#fff', borderRadius:12, boxShadow:'0 16px 48px rgba(0,0,0,0.14)',
          border:'1px solid #E5E7EB', zIndex:9999, overflow:'hidden', fontFamily:FONT }}>
          <div style={{ background:'linear-gradient(135deg,#1e293b,#334155)', padding:'12px 16px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <div>
              <div style={{ fontSize:13, fontWeight:700, color:'#fff' }}>Dispatch Alerts</div>
              <div style={{ fontSize:10.5, color:'#94a3b8', marginTop:1 }}>
                {badgeCount===0?'No upcoming due dates':`${badgeCount} order${badgeCount>1?'s':''} need attention`}
              </div>
            </div>
            <div style={{ display:'flex', gap:6 }}>
              {overdue.length>0 && <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:10, background:'#DC2626', color:'#fff' }}>{overdue.length} overdue</span>}
              <button onClick={load} title="Refresh" style={{ width:24, height:24, borderRadius:5, border:'1px solid #475569', background:'transparent', color:'#94a3b8', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}><RefreshCw size={11}/></button>
            </div>
          </div>
          <div style={{ maxHeight:420, overflowY:'auto' }}>
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

/* ── Shared dropdown panel — classic application menu style ─────── */
function NavDropdown({ group, onNavigate, onClose, alignRight }) {
  const hasSections = !!group.sections;
  const cols        = group.sections?.length || 1;

  const itemStyle = (hovered) => ({
    padding: '6px 20px 6px 14px',
    cursor: 'pointer',
    fontSize: 12.5,
    color: hovered ? '#fff' : '#1a1a1a',
    background: hovered ? '#3A6186' : 'transparent',
    borderBottom: '1px solid transparent',
    display: 'flex', alignItems: 'center', gap: 6,
    userSelect: 'none',
    whiteSpace: 'nowrap',
  });

  const [hoveredPath, setHoveredPath] = useState(null);

  const renderItem = (item) => (
    <div key={item.path}
      onClick={() => { onNavigate(item.path); onClose(); }}
      onMouseEnter={() => setHoveredPath(item.path)}
      onMouseLeave={() => setHoveredPath(null)}
      style={itemStyle(hoveredPath === item.path)}>
      {item.label}
    </div>
  );

  return (
    <div style={{
      position: 'absolute', top: '100%',
      ...(alignRight ? { right: 0 } : { left: 0 }),
      background: '#f0f0f0',
      boxShadow: '2px 2px 6px rgba(0,0,0,0.35), inset 0 0 0 1px rgba(255,255,255,0.6)',
      border: '1px solid #888',
      zIndex: 9999,
      minWidth: hasSections ? cols * 170 : 190,
      display: hasSections ? 'flex' : 'block',
      fontFamily: FONT,
      overflow: 'hidden',
      paddingBottom: 2,
    }}>
      {hasSections ? (
        group.sections.map((sec, si) => (
          <div key={sec.title} style={{
            flex: 1, minWidth: 155,
            borderRight: si < group.sections.length - 1 ? '1px solid #bbb' : 'none',
          }}>
            <div style={{
              padding: '5px 14px 4px',
              background: 'linear-gradient(180deg,#e8e8e8,#d8d8d8)',
              borderBottom: '1px solid #aaa',
              fontSize: 10, fontWeight: 700, color: '#444',
              textTransform: 'uppercase', letterSpacing: '0.5px',
            }}>
              {sec.title}
            </div>
            {sec.items.map(renderItem)}
          </div>
        ))
      ) : (
        <>
          <div style={{
            padding: '5px 14px 4px',
            background: 'linear-gradient(180deg,#e8e8e8,#d8d8d8)',
            borderBottom: '1px solid #aaa',
            fontSize: 10, fontWeight: 700, color: '#444',
            textTransform: 'uppercase', letterSpacing: '0.5px',
          }}>
            {group.label}
          </div>
          {group.items.map(renderItem)}
        </>
      )}
    </div>
  );
}

/* ── Single nav group — classic raised menu button ───────────────── */
function NavGroup({ group, pathname, onNavigate, alignRight }) {
  const [open,    setOpen]    = useState(false);
  const [hovered, setHovered] = useState(false);
  const ref   = useRef(null);
  const timer = useRef(null);
  useClickOutside(ref, () => setOpen(false));

  const active   = isPathActive(group.routes, pathname);
  const isDirect = !!group.path && !group.items && !group.sections;

  const onEnter = () => { clearTimeout(timer.current); setHovered(true); if (!isDirect) setOpen(true); };
  const onLeave = () => { setHovered(false); timer.current = setTimeout(() => setOpen(false), 180); };

  /* Classic button look: raised on hover, pressed when open */
  const getBtnStyle = () => {
    if (active) return {
      background: '#fff',
      border: '1px solid #2A4D6E',
      color: '#2A4D6E',
      boxShadow: 'inset 1px 1px 0 rgba(255,255,255,0.8)',
    };
    if (open) return {
      background: 'rgba(0,0,0,0.18)',
      border: '1px solid rgba(0,0,0,0.35)',
      borderBottom: '1px solid #f0f0f0',
      color: '#fff',
      boxShadow: 'inset 1px 1px 2px rgba(0,0,0,0.2)',
    };
    if (hovered) return {
      background: 'rgba(255,255,255,0.18)',
      border: '1px solid rgba(255,255,255,0.5)',
      color: '#fff',
      boxShadow: '1px 1px 0 rgba(255,255,255,0.25), inset 0 1px 0 rgba(255,255,255,0.3)',
    };
    return {
      background: 'transparent',
      border: '1px solid transparent',
      color: 'rgba(255,255,255,0.92)',
      boxShadow: 'none',
    };
  };

  const btnStyle = getBtnStyle();

  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0, display: 'flex', alignItems: 'center' }}
      onMouseEnter={onEnter} onMouseLeave={onLeave}
    >
      <button
        onClick={() => { if (isDirect) { onNavigate(group.path); } else setOpen(o => !o); }}
        style={{
          display: 'flex', alignItems: 'center', gap: 4,
          height: 28, padding: '0 11px',
          borderRadius: 2,
          cursor: 'pointer', fontFamily: FONT, fontSize: 12,
          fontWeight: active ? 700 : 500,
          whiteSpace: 'nowrap', letterSpacing: '0.15px',
          transition: 'background 0.08s, box-shadow 0.08s, border-color 0.08s',
          ...btnStyle,
        }}
      >
        {group.icon && <span style={{ fontSize: 12, lineHeight: 1 }}>{group.icon}</span>}
        {group.label}
        {!isDirect && (
          <ChevronDown size={9}
            color={active ? '#2A4D6E' : 'rgba(255,255,255,0.85)'}
            style={{ transition: 'transform 0.12s', transform: open ? 'rotate(180deg)' : 'none', marginLeft: 1 }} />
        )}
      </button>
      {open && !isDirect && (
        <NavDropdown group={group} onNavigate={onNavigate} onClose={() => setOpen(false)} alignRight={alignRight} />
      )}
    </div>
  );
}

/* ── "More ▾" overflow — classic flyout submenus ────────────────── */
function MoreMenu({ groups, pathname, onNavigate }) {
  const [open,    setOpen]    = useState(false);
  const [subOpen, setSubOpen] = useState(null);
  const [hovered, setHovered] = useState(false);
  const [hovSub,  setHovSub]  = useState(null);
  const ref      = useRef(null);
  const timer    = useRef(null);
  const subTimer = useRef(null);
  useClickOutside(ref, () => { setOpen(false); setSubOpen(null); });

  const anyActive = groups.some(g => isPathActive(g.routes, pathname));
  const onEnter = () => { clearTimeout(timer.current); setHovered(true); setOpen(true); };
  const onLeave = () => { setHovered(false); timer.current = setTimeout(() => { setOpen(false); setSubOpen(null); }, 200); };

  if (!groups.length) return null;

  const getBtnStyle = () => {
    if (anyActive) return { background: '#fff', border: '1px solid #2A4D6E', color: '#2A4D6E', boxShadow: 'inset 1px 1px 0 rgba(255,255,255,0.8)' };
    if (open)      return { background: 'rgba(0,0,0,0.18)', border: '1px solid rgba(0,0,0,0.35)', borderBottom: '1px solid #f0f0f0', color: '#fff', boxShadow: 'inset 1px 1px 2px rgba(0,0,0,0.2)' };
    if (hovered)   return { background: 'rgba(255,255,255,0.18)', border: '1px solid rgba(255,255,255,0.5)', color: '#fff', boxShadow: '1px 1px 0 rgba(255,255,255,0.25), inset 0 1px 0 rgba(255,255,255,0.3)' };
    return { background: 'transparent', border: '1px solid transparent', color: 'rgba(255,255,255,0.92)', boxShadow: 'none' };
  };

  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0, display: 'flex', alignItems: 'center' }}
      onMouseEnter={onEnter} onMouseLeave={onLeave}
    >
      <button style={{
        display: 'flex', alignItems: 'center', gap: 4,
        height: 28, padding: '0 11px', borderRadius: 2,
        cursor: 'pointer', fontFamily: FONT, fontSize: 12, fontWeight: anyActive ? 700 : 500,
        whiteSpace: 'nowrap', letterSpacing: '0.15px',
        transition: 'background 0.08s, box-shadow 0.08s',
        ...getBtnStyle(),
      }}>
        ⚙ More <ChevronDown size={9} color={anyActive ? '#2A4D6E' : 'rgba(255,255,255,0.85)'} style={{ transition: 'transform 0.12s', transform: open ? 'rotate(180deg)' : 'none' }} />
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: '100%', right: 0,
          background: '#f0f0f0',
          boxShadow: '2px 2px 6px rgba(0,0,0,0.35)',
          border: '1px solid #888',
          zIndex: 9999, minWidth: 190, fontFamily: FONT, overflow: 'visible', paddingBottom: 2,
        }}>
          {groups.map((g, gi) => {
            const isAct    = isPathActive(g.routes, pathname);
            const isDirect = !!g.path && !g.items && !g.sections;
            const allItems = g.items || (g.sections || []).flatMap(s => s.items);
            const isSub    = subOpen === g.key;
            const isHov    = hovSub === g.key;

            return (
              <div key={g.key} style={{ position: 'relative' }}
                onMouseEnter={() => { clearTimeout(subTimer.current); setSubOpen(g.key); setHovSub(g.key); }}
                onMouseLeave={() => { subTimer.current = setTimeout(() => { setSubOpen(null); setHovSub(null); }, 120); }}>
                <div
                  onClick={() => { if (isDirect) { onNavigate(g.path); setOpen(false); setSubOpen(null); } }}
                  style={{
                    padding: '6px 14px 6px 12px', cursor: 'pointer', fontSize: 12.5,
                    color: (isHov || isSub) ? '#fff' : isAct ? '#3A6186' : '#1a1a1a',
                    fontWeight: isAct ? 700 : 400,
                    background: (isHov || isSub) ? '#3A6186' : 'transparent',
                    borderBottom: gi < groups.length - 1 ? '1px solid #ccc' : 'none',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                    userSelect: 'none',
                  }}>
                  <span>{g.icon} {g.label}</span>
                  {!isDirect && <ChevronRight size={10} color={(isHov || isSub) ? '#fff' : '#888'} />}
                </div>

                {/* Flyout submenu — opens to the LEFT */}
                {isSub && !isDirect && allItems.length > 0 && (
                  <div
                    onMouseEnter={() => clearTimeout(subTimer.current)}
                    onMouseLeave={() => { subTimer.current = setTimeout(() => { setSubOpen(null); setHovSub(null); }, 120); }}
                    style={{
                      position: 'absolute', top: -1, right: '100%',
                      background: '#f0f0f0',
                      boxShadow: '2px 2px 6px rgba(0,0,0,0.35)',
                      border: '1px solid #888',
                      zIndex: 10000, minWidth: 190, fontFamily: FONT, overflow: 'hidden',
                      marginRight: 1, paddingBottom: 2,
                    }}>
                    <div style={{
                      padding: '5px 14px 4px',
                      background: 'linear-gradient(180deg,#e8e8e8,#d8d8d8)',
                      borderBottom: '1px solid #aaa',
                      fontSize: 10, fontWeight: 700, color: '#444',
                      textTransform: 'uppercase', letterSpacing: '0.5px',
                    }}>{g.label}</div>
                    {allItems.map((item) => (
                      <SubItem key={item.path} item={item}
                        onClick={() => { onNavigate(item.path); setOpen(false); setSubOpen(null); }} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SubItem({ item, onClick }) {
  const [hov, setHov] = useState(false);
  return (
    <div onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        padding: '6px 20px 6px 14px', cursor: 'pointer', fontSize: 12.5,
        color: hov ? '#fff' : '#1a1a1a',
        background: hov ? '#3A6186' : 'transparent',
        userSelect: 'none', whiteSpace: 'nowrap',
      }}>
      {item.label}
    </div>
  );
}

/* ── Logout Modal ───────────────────────────────────────────────── */
function LogoutModal({ onConfirm, onCancel }) {
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

      <div className="lo-card" style={{ background:'#fff', borderRadius:16,
        width:360, padding:'32px 28px', boxShadow:'0 24px 60px rgba(0,0,0,0.22)',
        display:'flex', flexDirection:'column', alignItems:'center', textAlign:'center' }}>

        {/* Icon area */}
        <div style={{ width:64, height:64, borderRadius:16, marginBottom:18,
          background: phase==='step3' ? 'linear-gradient(135deg,#16a34a,#15803d)'
                    : phase==='confirm' ? 'linear-gradient(135deg,#dc2626,#b91c1c)'
                    : 'linear-gradient(135deg,#1e40af,#1d4ed8)',
          display:'flex', alignItems:'center', justifyContent:'center',
          boxShadow: phase==='step3' ? '0 8px 24px rgba(22,163,74,0.35)'
                   : phase==='confirm' ? '0 8px 24px rgba(220,38,38,0.35)'
                   : '0 8px 24px rgba(30,64,175,0.35)',
          transition:'all 0.4s ease' }}>
          {phase === 'confirm' && <LogOut size={28} color="#fff" strokeWidth={2.5} />}
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
            <div style={{ fontSize:18, fontWeight:800, color:'#0f172a', marginBottom:6 }}>
              Sign Out?
            </div>
            <div style={{ fontSize:13, color:'#64748b', marginBottom:28, lineHeight:1.5 }}>
              You'll be logged out of the current session.<br />
              Press <kbd style={{ background:'#f1f5f9', border:'1px solid #e2e8f0',
                borderRadius:4, padding:'1px 6px', fontSize:11, fontFamily:'monospace' }}>Enter</kbd> to confirm.
            </div>
            <div style={{ display:'flex', gap:10, width:'100%' }}>
              <button onClick={onCancel}
                style={{ flex:1, height:38, border:'1.5px solid #e2e8f0', borderRadius:8,
                  background:'#f8fafc', color:'#374151', fontSize:13, fontWeight:600,
                  cursor:'pointer', fontFamily:FONT }}>
                Cancel
              </button>
              <button onClick={handleOK} autoFocus
                style={{ flex:1, height:38, border:'none', borderRadius:8,
                  background:'linear-gradient(135deg,#dc2626,#b91c1c)', color:'#fff',
                  fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:FONT,
                  boxShadow:'0 3px 10px rgba(220,38,38,0.35)' }}>
                Yes, Sign Out
              </button>
            </div>
          </>
        ) : (
          <div key={phase} className="lo-step">
            <div style={{ fontSize:15, fontWeight:700, color:'#1e293b', marginBottom:6 }}>
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
  const [open,       setOpen]       = useState(false);
  const [showLogout, setShowLogout] = useState(false);
  const ref = useRef(null);
  useClickOutside(ref, () => setOpen(false));

  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0, display:'flex', alignItems:'stretch' }}>
      <button
        onClick={() => setOpen(p => !p)}
        style={{ display:'flex', alignItems:'center', gap:7,
          padding:'0 13px', height: 36,
          background: open ? '#F0F4F4' : 'transparent',
          border:'none', borderLeft: '1px solid #DDDDDD',
          cursor:'pointer', fontFamily:FONT }}
        onMouseEnter={e => { e.currentTarget.style.background='#F0F4F4'; }}
        onMouseLeave={e => { if (!open) e.currentTarget.style.background='transparent'; }}>
        <UserAvatar userId={user?.id||user?.userId} initials={initials} photoExt={user?.photoExt} size={26} />
        <ChevronDown size={10} color="#666" style={{ transition:'transform 0.2s', transform:open?'rotate(180deg)':'none', flexShrink:0 }} />
      </button>

      {open && (
        <div style={{ position:'absolute', top:'calc(100% + 2px)', right:0, width:220,
          background:'#fff', borderRadius:'0 0 8px 8px', boxShadow:'0 10px 36px rgba(0,0,0,0.14)',
          border:'1px solid #D1D5DB', borderTop:`2px solid ${TEAL2}`, zIndex:9999, overflow:'hidden', fontFamily:FONT }}>
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

      <div className="cs-card" style={{ background:'#fff', borderRadius:18, width:380,
        padding:'32px 28px', boxShadow:'0 28px 70px rgba(0,0,0,0.25)',
        display:'flex', flexDirection:'column', alignItems:'center', textAlign:'center' }}>

        {/* Icon */}
        <div style={{ width:68, height:68, borderRadius:16, marginBottom:18,
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
            <Building2 size={30} color="#fff" strokeWidth={2} />
          ) : (
            <span style={{ fontSize:30, lineHeight:1 }}
              className={p?.spin ? 'cs-spin-icon' : ''}>{p?.icon}</span>
          )}
        </div>

        {/* Content */}
        {phase === 'confirm' ? (
          <>
            <div style={{ fontSize:17, fontWeight:800, color:'#0f172a', marginBottom:6 }}>
              Switch Company?
            </div>
            <div style={{ fontSize:12.5, color:'#64748b', marginBottom:4, lineHeight:1.5 }}>
              From: <strong style={{ color:'#475569' }}>{currentCompany?.companyName || '—'}</strong>
            </div>
            <div style={{ fontSize:12.5, color:'#64748b', marginBottom:20, lineHeight:1.5 }}>
              To:&nbsp;&nbsp; <strong style={{ color:'#1d4ed8' }}>{company.companyName}</strong>
              {company.gstin && <span style={{ color:'#94a3b8', fontSize:11, marginLeft:6 }}>({company.gstin})</span>}
            </div>
            <div style={{ fontSize:11, color:'#94a3b8', marginBottom:22 }}>
              Press <kbd style={{ background:'#f1f5f9', border:'1px solid #e2e8f0',
                borderRadius:4, padding:'1px 6px', fontSize:10, fontFamily:'monospace' }}>Enter</kbd> to confirm
            </div>
            <div style={{ display:'flex', gap:10, width:'100%' }}>
              <button onClick={onCancel}
                style={{ flex:1, height:38, border:'1.5px solid #e2e8f0', borderRadius:8,
                  background:'#f8fafc', color:'#374151', fontSize:13, fontWeight:600,
                  cursor:'pointer', fontFamily:FONT }}>
                Cancel
              </button>
              <button onClick={handleConfirm} autoFocus
                style={{ flex:1, height:38, border:'none', borderRadius:8,
                  background:'linear-gradient(135deg,#1d4ed8,#1e40af)', color:'#fff',
                  fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:FONT,
                  boxShadow:'0 3px 10px rgba(29,78,216,0.35)' }}>
                Yes, Switch
              </button>
            </div>
          </>
        ) : (
          <div key={phase} className="cs-step">
            <div style={{ fontSize:15, fontWeight:700, color:'#0f172a', marginBottom:8 }}>{p.text}</div>
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
          Universal Core ERP Solutions
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
  const username  = user?.name || user?.username || usernameProp || 'User';
  const userRole  = user?.role ? (user.role.charAt(0).toUpperCase() + user.role.slice(1)) : 'User';
  const initials  = username ? username.split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2) : 'AD';

  const [showPalette,   setShowPalette]   = useState(false);
  const [showCoSwitch,  setShowCoSwitch]  = useState(false);
  const [pendingCompany,setPendingCompany] = useState(null);
  const [time,          setTime]          = useState(new Date());
  const [winWidth,      setWinWidth]      = useState(window.innerWidth);
  const navigate   = useNavigate();
  const { pathname } = useLocation();
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

  useEffect(() => {
    const onResize = () => setWinWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const timeStr = time.toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit', hour12:true });
  const dayStr  = DAYS[time.getDay()];

  /* Responsive nav: how many items to show inline vs overflow */
  const pinnedGroups   = NAV_GROUPS.filter(g => g.alwaysShow);
  const mainGroups     = NAV_GROUPS.filter(g => !g.alwaysShow);
  const visibleCount   = winWidth >= 1400 ? 8 : winWidth >= 1200 ? 7 : winWidth >= 1024 ? 6 : winWidth >= 860 ? 5 : winWidth >= 720 ? 4 : 3;
  const visibleGroups  = mainGroups.slice(0, visibleCount);
  const overflowGroups = mainGroups.slice(visibleCount);

  return (
    <>
      {showPalette && <CommandPalette onClose={() => setShowPalette(false)} />}

      <div style={{ flexShrink: 0, position: 'relative', zIndex: 200, overflow: 'visible', fontFamily: FONT }}>

        {/* ══ ROW 1 — White utility bar (Finacle: white top row) ══ */}
        <div style={{
          background: '#FFFFFF',
          display: 'flex', alignItems: 'center',
          height: 36,
          borderBottom: '1px solid #CCCCCC',
          padding: '0 10px 0 0',
          overflow: 'visible',
        }}>
          {/* Brand — left */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 7,
            padding: '0 14px', flexShrink: 0, height: '100%',
            borderRight: '1px solid #DDDDDD',
          }}>
            <div style={{
              width: 24, height: 24, background: TEAL, borderRadius: 4,
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <span style={{ fontSize: 13, lineHeight: 1 }}>⚡</span>
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 800, color: TEAL, letterSpacing: '-0.3px', whiteSpace: 'nowrap' }}>ERP Suite</div>
              <div style={{ fontSize: 8, color: '#888', fontWeight: 600, letterSpacing: '0.8px', textTransform: 'uppercase' }}>Enterprise</div>
            </div>
          </div>

          {/* Spacer */}
          <div style={{ flex: 1 }} />

          {/* Right controls — match Finacle: User info | Company | tools | Sign Out */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 0, flexShrink: 0 }}>

            {/* User label (like "User: ADMIN" in Finacle) */}
            <div style={{ fontSize: 12, color: '#444', padding: '0 12px', borderRight: '1px solid #DDDDDD', whiteSpace: 'nowrap' }}>
              User: <strong style={{ color: '#111' }}>{username}</strong>
              {userRole && <span style={{ fontSize: 10.5, color: '#888', marginLeft: 5 }}>({userRole})</span>}
            </div>

            {/* Company Switcher */}
            <div ref={coRef} style={{ position: 'relative', flexShrink: 0, height: '100%', display: 'flex', alignItems: 'center' }}>
              <button onClick={() => setShowCoSwitch(p => !p)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '0 12px', height: 36,
                  background: showCoSwitch ? '#F0F4F4' : 'transparent',
                  border: 'none', borderRight: '1px solid #DDDDDD', cursor: 'pointer',
                  color: '#333', fontSize: 11.5, fontWeight: 600, fontFamily: FONT,
                  whiteSpace: 'nowrap', maxWidth: 200,
                }}
                onMouseEnter={e => { e.currentTarget.style.background = '#F0F4F4'; }}
                onMouseLeave={e => { if (!showCoSwitch) e.currentTarget.style.background = 'transparent'; }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#22c55e', flexShrink: 0 }} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 130, display: 'block' }}>
                  {selectedCompany ? selectedCompany.companyName : 'Select Company'}
                </span>
                <ChevronDown size={10} color="#666" style={{ flexShrink: 0, transition: 'transform 0.2s', transform: showCoSwitch ? 'rotate(180deg)' : 'none' }} />
              </button>
              {showCoSwitch && (
                <div style={{ position: 'absolute', top: '100%', right: 0, minWidth: 270, background: '#fff',
                  boxShadow: '0 8px 28px rgba(0,0,0,0.16)',
                  zIndex: 9999, overflow: 'hidden', border: '1px solid #CCCCCC', borderTop: `2px solid ${TEAL2}` }}>
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
                              background: isAct ? '#EEF9F8' : '#fff', borderBottom: '1px solid #F5F5F5',
                              borderLeft: `3px solid ${isAct ? TEAL2 : 'transparent'}` }}
                            onMouseEnter={e => { if (!isAct) e.currentTarget.style.background = '#F8FAFC'; }}
                            onMouseLeave={e => { e.currentTarget.style.background = isAct ? '#EEF9F8' : '#fff'; }}>
                            <div style={{ fontSize: 12.5, fontWeight: 600, color: isAct ? TEAL : '#111827', display: 'flex', alignItems: 'center', gap: 6 }}>
                              <Building2 size={11} color={isAct ? TEAL2 : '#94a3b8'} />{co.companyName}
                              {co.isDefault && <span style={{ fontSize: 9, background: '#EEF9F8', color: TEAL, borderRadius: 10, padding: '1px 6px', fontWeight: 700 }}>DEFAULT</span>}
                            </div>
                            <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 1, paddingLeft: 17 }}>{co.gstin || co.city || ''}</div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <div onClick={() => { navigate('/admin/companies'); setShowCoSwitch(false); }}
                    style={{ padding: '8px 13px', cursor: 'pointer', fontSize: 11.5, fontWeight: 600, color: TEAL, background: '#F8FAFC', borderTop: '1px solid #EEEEEE', display: 'flex', alignItems: 'center', gap: 5 }}
                    onMouseEnter={e => e.currentTarget.style.background = '#EEF9F8'} onMouseLeave={e => e.currentTarget.style.background = '#F8FAFC'}>
                    <Settings size={11} /> Manage Companies
                  </div>
                </div>
              )}
            </div>

            {/* Search */}
            <button onClick={() => setShowPalette(true)} title="Search (Ctrl+K)"
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 36,
                background: 'transparent', border: 'none', borderRight: '1px solid #DDDDDD',
                cursor: 'pointer', color: '#555', flexShrink: 0 }}
              onMouseEnter={e => { e.currentTarget.style.background = '#F0F4F4'; e.currentTarget.style.color = '#111'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#555'; }}>
              <Search size={13} strokeWidth={2} />
            </button>

            {/* Refresh */}
            <button onClick={() => window.location.reload()} title="Refresh"
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 36,
                background: 'transparent', border: 'none', borderRight: '1px solid #DDDDDD',
                cursor: 'pointer', color: '#555', flexShrink: 0 }}
              onMouseEnter={e => { e.currentTarget.style.background = '#F0F4F4'; e.currentTarget.style.color = '#111'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#555'; }}>
              <RefreshCw size={11} strokeWidth={2} />
            </button>

            {/* Chat */}
            {openPanel && (
              <button onClick={openPanel} title="Chat"
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 36,
                  background: 'transparent', border: 'none', borderRight: '1px solid #DDDDDD',
                  cursor: 'pointer', color: '#EA580C', flexShrink: 0, position: 'relative' }}
                onMouseEnter={e => { e.currentTarget.style.background = '#FFF7ED'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" /></svg>
                {chatUnread > 0 && <span style={{ position: 'absolute', top: 5, right: 3, width: 12, height: 12, borderRadius: '50%', background: '#ef4444', color: '#fff', fontSize: 7, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{chatUnread > 9 ? '9+' : chatUnread}</span>}
              </button>
            )}

            {/* Notifications */}
            <div style={{ borderRight: '1px solid #DDDDDD', display: 'flex', alignItems: 'center', padding: '0 3px', height: 36 }}>
              <NotificationCentre companyId={selectedCompany?.companyId} />
            </div>

            {/* Time */}
            <div style={{ padding: '0 10px', textAlign: 'center', flexShrink: 0, lineHeight: 1.25,
              borderRight: '1px solid #DDDDDD', height: 36,
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#222' }}>{timeStr}</div>
              <div style={{ fontSize: 8.5, color: '#888' }}>{dayStr}</div>
            </div>

            {/* User / Sign Out — like Finacle's "Sign Out" on the far right */}
            <UserDropdown
              user={user} username={username} userRole={userRole} initials={initials}
              onLogout={onLogout} onNavigate={navigate}
            />
          </div>
        </div>

        {/* ══ ROW 2 — Blue menu bar (Finacle-style blue banner) ══ */}
        <div style={{
          background: '#3A6186',
          display: 'flex', alignItems: 'center',
          height: 36,
          borderBottom: '2px solid #2A4D6E',
          padding: '0 6px',
          gap: 3,
          overflow: 'visible',
        }}>
          {visibleGroups.map(group => (
            <NavGroup key={group.key} group={group} pathname={pathname} onNavigate={navigate} />
          ))}
          <MoreMenu groups={overflowGroups} pathname={pathname} onNavigate={navigate} />
          {pinnedGroups.map(group => (
            <NavGroup key={group.key} group={group} pathname={pathname} onNavigate={navigate} alignRight />
          ))}
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
