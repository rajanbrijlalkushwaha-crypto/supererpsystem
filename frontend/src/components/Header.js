import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCompany } from '../context/CompanyContext';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';
import {
  Search, ChevronDown, Building2, LogOut,
  Settings, RefreshCw, Bell,
} from 'lucide-react';

/* ── All navigable pages (section → label → path → optional keywords) ── */
const ALL_PAGES = [
  /* Dashboard */
  { section:'Dashboard',       label:'Dashboard',                  path:'/dashboard',                       color:'#3b82f6', keys:'home main' },
  /* Jobcode / Project */
  { section:'Jobcode',         label:'All Jobcodes',               path:'/project/list',                    color:'#4f46e5', keys:'project list' },
  { section:'Jobcode',         label:'Project Close',              path:'/project/close',                   color:'#4f46e5', keys:'close finish' },
  /* Client / CRM */
  { section:'Client',          label:'View Clients',               path:'/client/view',                     color:'#ec4899', keys:'customers list' },
  { section:'Client',          label:'Pending Clients',            path:'/client/pending',                  color:'#ec4899', keys:'approval' },
  { section:'Client',          label:'CRM',                        path:'/crm/view',                        color:'#ec4899', keys:'leads crm' },
  /* Vendor */
  { section:'Vendor',          label:'All Vendors',                path:'/vendor/view',                     color:'#059669', keys:'suppliers list' },
  { section:'Vendor',          label:'Add Vendor',                 path:'/vendor/create',                   color:'#059669', keys:'new create' },
  { section:'Vendor',          label:'Pending Vendors',            path:'/vendor/pending',                  color:'#059669', keys:'approval' },
  { section:'Vendor',          label:'Self Registrations',         path:'/vendor/self-registrations',       color:'#059669', keys:'register' },
  /* Inventory */
  { section:'Inventory',       label:'Items / Products',           path:'/items/view',                      color:'#0d9488', keys:'product catalogue' },
  { section:'Inventory',       label:'Create Item',                path:'/items/create',                    color:'#0d9488', keys:'new add' },
  { section:'Inventory',       label:'Order Tracker',              path:'/items/tracker',                   color:'#0d9488', keys:'track' },
  /* Sales Order */
  { section:'Sales Order',     label:'All Sales Orders',           path:'/sales-order/view',                color:'#7c3aed', keys:'SO view list' },
  { section:'Sales Order',     label:'Create Sales Order',         path:'/sales-order/create',              color:'#7c3aed', keys:'new SO' },
  { section:'Sales Order',     label:'Pending Approval',           path:'/sales-order/pending',             color:'#7c3aed', keys:'approve' },
  /* Manufacturing */
  { section:'Manufacturing',   label:'Manufacturing Orders',       path:'/manufacturing/orders',            color:'#9333ea', keys:'mfg production' },
  { section:'Manufacturing',   label:'Job Sheets',                 path:'/manufacturing/job-sheets',        color:'#9333ea', keys:'job work' },
  { section:'Manufacturing',   label:'Create Job Sheet',           path:'/manufacturing/job-sheets/create', color:'#9333ea', keys:'new job' },
  { section:'Manufacturing',   label:'Locations',                  path:'/manufacturing/locations',         color:'#9333ea', keys:'warehouse store' },
  /* Purchase Order */
  { section:'Purchase Order',  label:'PO Tracking',                path:'/purchase-order/tracking',         color:'#ea580c', keys:'track PO' },
  { section:'Purchase Order',  label:'Create PO',                  path:'/purchase-order/create',           color:'#ea580c', keys:'new purchase' },
  { section:'Purchase Order',  label:'View / Edit POs',            path:'/purchase-order/view',             color:'#ea580c', keys:'list PO' },
  { section:'Purchase Order',  label:'Pending Approval',           path:'/purchase-order/pending',          color:'#ea580c', keys:'approve' },
  /* Sales Bill */
  { section:'Sales Bill',      label:'Tax Invoices',               path:'/sales-bill',                      color:'#0891b2', keys:'invoice bill dispatch' },
  { section:'Sales Bill',      label:'Delivery Challan',           path:'/delivery-challan/view',           color:'#0891b2', keys:'DC challan' },
  /* Purchase Bill */
  { section:'Purchase Bill',   label:'Purchase Bills',             path:'/purchase-bill',                   color:'#6d28d9', keys:'vendor invoice' },
  { section:'Purchase Bill',   label:'GRN (Goods Receipt)',        path:'/stock/in',                        color:'#6d28d9', keys:'goods received' },
  /* Account — Setup */
  { section:'Account',         label:'Ledger Master',              path:'/account/ledger/master',           color:'#b45309', keys:'master setup' },
  { section:'Account',         label:'Account Groups',             path:'/account/groups/view',             color:'#b45309', keys:'groups setup' },
  /* Account — Transactions */
  { section:'Account',         label:'Expense Entry',              path:'/account/expense/create',          color:'#b45309', keys:'expense add' },
  { section:'Account',         label:'View Expenses',              path:'/account/expense/view',            color:'#b45309', keys:'expenses list' },
  { section:'Account',         label:'Payment to Vendor',          path:'/account/payment/create',          color:'#b45309', keys:'pay vendor outflow' },
  { section:'Account',         label:'Receipt from Client',        path:'/account/receipt/create',          color:'#b45309', keys:'receive client inflow' },
  { section:'Account',         label:'Journal Entry',              path:'/account/journal/view',            color:'#b45309', keys:'journal voucher' },
  { section:'Account',         label:'Debit Note',                 path:'/account/debit-note/view',         color:'#b45309', keys:'debit' },
  { section:'Account',         label:'Credit Note',                path:'/account/credit-note/view',        color:'#b45309', keys:'credit' },
  { section:'Account',         label:'Deposit',                    path:'/account/deposit/view',            color:'#b45309', keys:'deposit bank' },
  /* Account — Reports */
  { section:'Account',         label:'View Balance / Dues',        path:'/account/dues',                    color:'#b45309', keys:'dues balance receivable payable' },
  { section:'Account',         label:'All Ledgers',                path:'/account/ledger/view',             color:'#b45309', keys:'ledger accounts' },
  { section:'Account',         label:'Bank Accounts',              path:'/account/bank/view',               color:'#b45309', keys:'bank' },
  { section:'Account',         label:'Statement',                  path:'/account/statement',               color:'#b45309', keys:'bank statement' },
  { section:'Account',         label:'Approval',                   path:'/account/approval',                color:'#b45309', keys:'approve' },
  { section:'Account',         label:'Financial Documents',         path:'/account/financial-docs',          color:'#b45309', keys:'pdf docs certificates gst pan' },
  /* Tally */
  { section:'Tally',           label:'Tally Import',               path:'/tally/import',                    color:'#0f766e', keys:'import sync' },
  { section:'Tally',           label:'Tally Pending Review',       path:'/tally/pending',                   color:'#0f766e', keys:'pending review' },
  /* Stock */
  { section:'Stock',           label:'Stock View',                 path:'/stock/view',                      color:'#0f766e', keys:'inventory levels' },
  { section:'Stock',           label:'GRN — Goods Receipt',        path:'/stock/in',                        color:'#0f766e', keys:'receive inward' },
  { section:'Stock',           label:'GDN — Stock Out',            path:'/stock/out',                       color:'#0f766e', keys:'issue outward' },
  { section:'Stock',           label:'Delivery Challan',           path:'/stock/challan',                   color:'#0f766e', keys:'challan delivery' },
  /* GST */
  { section:'GST',             label:'GST & Compliance',           path:'/gst/compliance',                  color:'#dc2626', keys:'tax return filing' },
  /* Other */
  { section:'Communication',   label:'Communication Logs',         path:'/communication/logs',              color:'#0284c7', keys:'logs chat messages' },
  { section:'Approvals',       label:'Approvals',                  path:'/approval',                        color:'#16a34a', keys:'approve pending' },
  { section:'Admin',           label:'Companies',                  path:'/admin/companies',                 color:'#475569', keys:'admin settings company' },
  { section:'Admin',           label:'Password Manager',           path:'/passwords',                       color:'#65a30d', keys:'passwords secrets' },
];

const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const FONT = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

function useClickOutside(ref, onClose) {
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [ref, onClose]);
}

/* ── Command Palette ── */
function CommandPalette({ onClose }) {
  const [q,      setQ]      = useState('');
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

  /* scroll active item into view */
  useEffect(() => {
    const el = listRef.current?.children[active];
    el?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  /* group results by section */
  const groups = [];
  const seen = new Map();
  filtered.forEach((p, idx) => {
    if (!seen.has(p.section)) { seen.set(p.section, groups.length); groups.push({ section: p.section, color: p.color, items: [] }); }
    groups[seen.get(p.section)].items.push({ ...p, idx });
  });

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(5px)',
      display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 70,
    }}>
      <div ref={ref} style={{
        width: 580, background: '#fff', borderRadius: 16,
        boxShadow: '0 24px 70px rgba(0,0,0,0.22)',
        border: '1px solid #E5E7EB', fontFamily: FONT,
        display: 'flex', flexDirection: 'column', maxHeight: 'calc(100vh - 140px)',
      }}>
        {/* Search input */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', borderBottom: '1px solid #F1F5F9', flexShrink: 0 }}>
          <Search size={17} color="#6366f1" strokeWidth={2.2} />
          <input
            value={q} onChange={e => setQ(e.target.value)} onKeyDown={onKey}
            placeholder="Search any page, menu, feature…"
            style={{ flex: 1, border: 'none', outline: 'none', fontSize: 14.5, color: '#1e293b', fontFamily: 'inherit', background: 'transparent', fontWeight: 500 }}
          />
          {q && (
            <button onClick={() => setQ('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: 16, lineHeight: 1, padding: 0 }}>✕</button>
          )}
          <kbd style={{ fontSize: 10.5, color: '#94a3b8', border: '1px solid #e5e7eb', borderRadius: 5, padding: '2px 7px', fontFamily: 'monospace', flexShrink: 0 }}>ESC</kbd>
        </div>

        {/* Results */}
        <div ref={listRef} style={{ flex: 1, overflowY: 'auto', padding: '6px 0' }}>
          {filtered.length === 0 ? (
            <div style={{ padding: '36px 18px', textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>🔍</div>
              No pages found for <strong>"{q}"</strong>
            </div>
          ) : groups.map(g => (
            <div key={g.section}>
              {/* Section header */}
              <div style={{ padding: '6px 18px 3px', display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: g.color, flexShrink: 0 }} />
                <span style={{ fontSize: 10.5, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.6px' }}>{g.section}</span>
              </div>
              {g.items.map(p => {
                const isAct = active === p.idx;
                return (
                  <div key={p.path} onClick={() => go(p.path)}
                    onMouseEnter={() => setActive(p.idx)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '9px 18px', cursor: 'pointer',
                      background: isAct ? '#EEF2FF' : 'transparent',
                      borderLeft: `3px solid ${isAct ? '#6366f1' : 'transparent'}`,
                      transition: 'all 0.08s',
                    }}>
                    {/* Color dot */}
                    <div style={{ width: 32, height: 32, borderRadius: 8, background: isAct ? g.color : '#F1F5F9', flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.15s' }}>
                      <span style={{ fontSize: 14 }}>
                        {p.section==='Dashboard'?'🏠':p.section==='Sales Order'?'📋':p.section==='Purchase Order'?'🛒':
                         p.section==='Account'?'💰':p.section==='Vendor'?'🏢':p.section==='Client'?'👥':
                         p.section==='Stock'?'📦':p.section==='Sales Bill'?'🧾':p.section==='Purchase Bill'?'📄':
                         p.section==='Inventory'?'🗂️':p.section==='Manufacturing'?'🏭':p.section==='Tally'?'📥':
                         p.section==='GST'?'🏷️':p.section==='Jobcode'?'📁':p.section==='Admin'?'⚙️':'📌'}
                      </span>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: isAct ? 700 : 500, color: isAct ? '#3730a3' : '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.label}</div>
                      <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 1 }}>{p.section}</div>
                    </div>
                    {isAct && <span style={{ fontSize: 11, color: '#6366f1', fontWeight: 700, flexShrink: 0 }}>↵ open</span>}
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{ padding: '8px 18px', borderTop: '1px solid #F1F5F9', display: 'flex', gap: 16, alignItems: 'center', flexShrink: 0, background: '#FAFAFA', borderRadius: '0 0 16px 16px' }}>
          {[['↑↓','Navigate'],['↵','Open'],['Esc','Close']].map(([k,l]) => (
            <span key={k} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#9ca3af' }}>
              <kbd style={{ fontSize: 10, background: '#F1F5F9', border: '1px solid #E2E8F0', borderRadius: 4, padding: '1px 5px', fontFamily: 'monospace', color: '#64748b' }}>{k}</kbd>
              {l}
            </span>
          ))}
          <span style={{ marginLeft: 'auto', fontSize: 11, color: '#c7d2fe', fontWeight: 600 }}>
            {filtered.length} result{filtered.length !== 1 ? 's' : ''}
          </span>
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
      // sum billed amount per orderId
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
        // skip fully billed orders
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
    if (diff < 0)  return { label: `${Math.abs(diff)}d overdue`, bg:'#FEE2E2', color:'#DC2626', dot:'#DC2626' };
    if (diff === 0) return { label: 'Due Today',  bg:'#FEF3C7', color:'#92400E', dot:'#F59E0B' };
    if (diff === 1) return { label: 'Tomorrow',   bg:'#FFF7ED', color:'#C2410C', dot:'#F97316' };
    return { label: `In ${diff} days`, bg:'#EFF6FF', color:'#1d4ed8', dot:'#3B82F6' };
  };

  const fmtDate = s => {
    if (!s) return '—';
    const [y,m,d] = s.split('-');
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${parseInt(d,10)} ${months[parseInt(m,10)-1]} ${y}`;
  };

  const overdue = alerts.filter(o => new Date(o.deliveryDate).setHours(0,0,0,0) < today.getTime());
  const badgeCount = alerts.length;

  return (
    <div ref={ref} style={{ position:'relative', flexShrink:0 }}>
      <button onClick={() => setOpen(p => !p)} title="Dispatch Notifications"
        style={{ width:34, height:34, borderRadius:7, cursor:'pointer', position:'relative',
          background: open ? '#FFF7ED' : '#F9FAFB',
          border: `1px solid ${open ? '#FED7AA' : '#E5E7EB'}`,
          color: open ? '#EA580C' : '#9ca3af',
          display:'flex', alignItems:'center', justifyContent:'center',
          transition:'all 0.15s', flexShrink:0 }}
        onMouseEnter={e => { e.currentTarget.style.background='#FFF7ED'; e.currentTarget.style.color='#EA580C'; }}
        onMouseLeave={e => { if (!open) { e.currentTarget.style.background='#F9FAFB'; e.currentTarget.style.color='#9ca3af'; } }}>
        <Bell size={14} strokeWidth={2} />
        {badgeCount > 0 && (
          <span style={{ position:'absolute', top:-4, right:-4,
            width:16, height:16, borderRadius:'50%',
            background: overdue.length > 0 ? '#DC2626' : '#F59E0B',
            color:'#fff', fontSize:9, fontWeight:800,
            display:'flex', alignItems:'center', justifyContent:'center',
            border:'2px solid #fff', lineHeight:1 }}>
            {badgeCount > 9 ? '9+' : badgeCount}
          </span>
        )}
      </button>

      {open && (
        <div style={{ position:'absolute', top:'calc(100% + 8px)', right:0, width:380,
          background:'#fff', borderRadius:12, boxShadow:'0 16px 48px rgba(0,0,0,0.14)',
          border:'1px solid #E5E7EB', zIndex:9999, overflow:'hidden', fontFamily:FONT }}>
          {/* Header */}
          <div style={{ background:'linear-gradient(135deg,#1e293b,#334155)', padding:'12px 16px',
            display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <div>
              <div style={{ fontSize:13, fontWeight:700, color:'#fff' }}>Dispatch Alerts</div>
              <div style={{ fontSize:10.5, color:'#94a3b8', marginTop:1 }}>
                {badgeCount === 0 ? 'No upcoming due dates' : `${badgeCount} order${badgeCount>1?'s':''} need attention`}
              </div>
            </div>
            <div style={{ display:'flex', gap:6 }}>
              {overdue.length > 0 && (
                <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:10,
                  background:'#DC2626', color:'#fff' }}>
                  {overdue.length} overdue
                </span>
              )}
              <button onClick={load} title="Refresh"
                style={{ width:24, height:24, borderRadius:5, border:'1px solid #475569',
                  background:'transparent', color:'#94a3b8', cursor:'pointer',
                  display:'flex', alignItems:'center', justifyContent:'center' }}>
                <RefreshCw size={11} />
              </button>
            </div>
          </div>

          {/* List */}
          <div style={{ maxHeight:420, overflowY:'auto' }}>
            {alerts.length === 0 ? (
              <div style={{ padding:'32px 16px', textAlign:'center' }}>
                <div style={{ fontSize:32, marginBottom:8 }}>✅</div>
                <div style={{ fontSize:13, fontWeight:600, color:'#374151' }}>All clear!</div>
                <div style={{ fontSize:11, color:'#9ca3af', marginTop:3 }}>No orders due in the next 5 days</div>
              </div>
            ) : alerts.map((o, i) => {
              const urg = urgency(o.deliveryDate);
              const items = (o.items || []).slice(0, 2);
              const moreItems = (o.items || []).length - 2;
              return (
                <div key={o.orderId}
                  style={{ padding:'12px 16px', borderBottom: i < alerts.length-1 ? '1px solid #F1F5F9' : 'none',
                    background: i % 2 === 0 ? '#fff' : '#FAFAFA' }}>
                  {/* Top row */}
                  <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:8 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                      <span style={{ width:8, height:8, borderRadius:'50%', background:urg.dot, flexShrink:0, display:'inline-block' }} />
                      <span style={{ fontSize:12, fontWeight:800, color:'#1e293b' }}>{o.orderNo}</span>
                    </div>
                    <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:10,
                      background:urg.bg, color:urg.color, whiteSpace:'nowrap' }}>
                      {urg.label}
                    </span>
                  </div>
                  {/* Client */}
                  <div style={{ fontSize:11, fontWeight:600, color:'#374151', marginTop:4, paddingLeft:14 }}>
                    {o.customerName}
                  </div>
                  {/* Due date */}
                  <div style={{ fontSize:11, color:'#6B7280', paddingLeft:14, marginTop:2, display:'flex', alignItems:'center', gap:4 }}>
                    <span style={{ fontSize:10 }}>📅</span>
                    <span>Dispatch by <strong style={{ color: urg.color }}>{fmtDate(o.deliveryDate)}</strong></span>
                  </div>
                  {/* Items */}
                  {items.length > 0 && (
                    <div style={{ marginTop:6, paddingLeft:14 }}>
                      {items.map((it, j) => (
                        <div key={j} style={{ fontSize:10.5, color:'#374151', display:'flex', gap:6,
                          background:'#F8FAFF', border:'1px solid #E5EAF2', borderRadius:5,
                          padding:'3px 8px', marginBottom:3, alignItems:'center' }}>
                          <span style={{ flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                            {it.description || it.itemCode}
                          </span>
                          <span style={{ fontWeight:700, color:'#1e40af', flexShrink:0 }}>
                            {it.qty} {it.unit}
                          </span>
                        </div>
                      ))}
                      {moreItems > 0 && (
                        <div style={{ fontSize:10, color:'#9ca3af', paddingLeft:2 }}>+{moreItems} more item{moreItems>1?'s':''}</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Footer */}
          {alerts.length > 0 && (
            <div style={{ padding:'8px 16px', background:'#F8FAFC', borderTop:'1px solid #F1F5F9',
              fontSize:11, color:'#9ca3af', textAlign:'center' }}>
              Showing orders due within 5 days · Updated now
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── User Avatar (shows photo if uploaded, else initials) ── */
function UserAvatar({ userId, initials, photoExt }) {
  const [err, setErr] = useState(false);
  const src = userId && photoExt ? `/api/auth/profile/photo/${userId}` : null;
  return (
    <div style={{ width: 30, height: 30, borderRadius: 8, flexShrink: 0, overflow: 'hidden',
      background: 'linear-gradient(135deg, #6366F1, #4F46E5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {src && !err ? (
        <img src={src} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={() => setErr(true)} />
      ) : (
        <span style={{ fontSize: 11, fontWeight: 800, color: '#fff' }}>{initials}</span>
      )}
    </div>
  );
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   HEADER
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
const Header = ({ username: usernameProp, onLogout }) => {
  const { user } = useAuth();
  // Prefer auth context data over prop
  const username = user?.name || user?.username || usernameProp || 'User';
  const userRole = user?.role ? (user.role.charAt(0).toUpperCase() + user.role.slice(1)) : 'User';

  const [showPalette,  setShowPalette]  = useState(false);
  const [showCoSwitch, setShowCoSwitch] = useState(false);
  const [time,         setTime]         = useState(new Date());
  const navigate = useNavigate();
  const coRef    = useRef(null);
  const { companies, selectedCompany, selectCompany } = useCompany();

  useClickOutside(coRef, () => setShowCoSwitch(false));

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const h = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); setShowPalette(p => !p); }
    };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, []);

  const timeStr = time.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  const dayStr  = DAYS[time.getDay()];
  const initials = username ? username.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) : 'AD';

  return (
    <>
      {showPalette && <CommandPalette onClose={() => setShowPalette(false)} />}

      <header style={{
        background: '#FFFFFF',
        height: 50,
        display: 'flex',
        alignItems: 'center',
        padding: '0 16px',
        gap: 0,
        flexShrink: 0,
        borderBottom: '1px solid #E5E7EB',
        boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
        zIndex: 200,
        position: 'relative',
        fontFamily: FONT,
      }}>

        {/* ── Brand label ── */}
        <div style={{
          paddingRight: 14, borderRight: '1px solid #E5E7EB',
          flexShrink: 0, marginRight: 12,
        }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: '#1E293B', letterSpacing: '-0.3px', whiteSpace: 'nowrap' }}>
            ERP Suite
          </div>
        </div>

        {/* ── Company Switcher ── */}
        <div ref={coRef} style={{ position: 'relative', flexShrink: 0, marginRight: 10 }}>
          <button onClick={() => setShowCoSwitch(p => !p)} style={{
            display: 'flex', alignItems: 'center', gap: 7,
            background: showCoSwitch ? '#FFF7ED' : '#F9FAFB',
            border: `1px solid ${showCoSwitch ? '#FED7AA' : '#E5E7EB'}`,
            borderRadius: 7, padding: '0 10px', height: 34, cursor: 'pointer',
            color: '#1e293b', fontSize: 12.5, fontWeight: 600, fontFamily: FONT,
            whiteSpace: 'nowrap', maxWidth: 220, transition: 'all 0.15s',
          }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', flexShrink: 0, boxShadow: '0 0 5px rgba(34,197,94,0.6)' }} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 160, display: 'block' }}>
              {selectedCompany ? selectedCompany.companyName : 'Select Company'}
            </span>
            <ChevronDown size={12} color="#9ca3af" style={{ marginLeft: 'auto', flexShrink: 0, transition: 'transform 0.2s', transform: showCoSwitch ? 'rotate(180deg)' : 'none' }} />
          </button>

          {showCoSwitch && (
            <div style={{
              position: 'absolute', top: 'calc(100% + 6px)', left: 0, minWidth: 280,
              background: '#fff', borderRadius: 10,
              boxShadow: '0 12px 40px rgba(0,0,0,0.12)',
              zIndex: 9999, overflow: 'hidden', border: '1px solid #E5E7EB',
            }}>
              <div style={{ background: '#F8FAFC', padding: '10px 14px', borderBottom: '1px solid #F1F5F9' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '1px' }}>Switch Company</div>
              </div>
              {companies.length === 0 ? (
                <div style={{ padding: '18px 14px', fontSize: 13, color: '#6b7280', textAlign: 'center' }}>
                  No companies.{' '}
                  <span onClick={() => { navigate('/admin/companies'); setShowCoSwitch(false); }}
                    style={{ color: '#EA580C', cursor: 'pointer', fontWeight: 700 }}>Add one →</span>
                </div>
              ) : (
                <div style={{ maxHeight: 240, overflowY: 'auto' }}>
                  {companies.map(co => {
                    const isAct = selectedCompany?.companyId === co.companyId;
                    return (
                      <div key={co.companyId}
                        onClick={() => { selectCompany(co); setShowCoSwitch(false); }}
                        style={{
                          padding: '10px 14px', cursor: 'pointer', transition: 'background 0.12s',
                          background: isAct ? '#FFF7ED' : '#fff',
                          borderBottom: '1px solid #F9FAFB',
                          borderLeft: `3px solid ${isAct ? '#EA580C' : 'transparent'}`,
                        }}
                        onMouseEnter={e => { if (!isAct) e.currentTarget.style.background = '#F8FAFC'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = isAct ? '#FFF7ED' : '#fff'; }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: isAct ? '#EA580C' : '#111827', display: 'flex', alignItems: 'center', gap: 7 }}>
                          <Building2 size={12} color={isAct ? '#EA580C' : '#94a3b8'} />
                          {co.companyName}
                          {co.isDefault && (
                            <span style={{ fontSize: 9, background: '#FFF7ED', color: '#EA580C', borderRadius: 10, padding: '1px 6px', fontWeight: 700, border: '1px solid #FED7AA' }}>DEFAULT</span>
                          )}
                        </div>
                        <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 1, paddingLeft: 19 }}>
                          {co.gstin || co.city || ''}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              <div onClick={() => { navigate('/admin/companies'); setShowCoSwitch(false); }}
                style={{ padding: '10px 14px', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#EA580C', background: '#F8FAFC', borderTop: '1px solid #F1F5F9', display: 'flex', alignItems: 'center', gap: 6 }}
                onMouseEnter={e => e.currentTarget.style.background = '#FFF7ED'}
                onMouseLeave={e => e.currentTarget.style.background = '#F8FAFC'}>
                <Settings size={12} /> Manage Companies
              </div>
            </div>
          )}
        </div>

        {/* ── Search / Command Palette trigger ── */}
        <button onClick={() => setShowPalette(true)} style={{
          display: 'flex', alignItems: 'center', gap: 8,
          background: '#F9FAFB', border: '1px solid #E5E7EB',
          borderRadius: 7, padding: '0 12px', height: 34, cursor: 'pointer',
          color: '#9ca3af', fontSize: 12.5, fontFamily: FONT,
          transition: 'all 0.15s', width: 220,
        }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = '#FDBA74'; e.currentTarget.style.color = '#EA580C'; }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = '#E5E7EB'; e.currentTarget.style.color = '#9ca3af'; }}>
          <Search size={13} strokeWidth={2} />
          <span>Search clients, invoices…</span>
          <kbd style={{ marginLeft: 'auto', fontSize: 10, background: '#F1F5F9', border: '1px solid #E2E8F0', borderRadius: 4, padding: '1px 6px', color: '#94a3b8', fontFamily: 'monospace' }}>⌘K</kbd>
        </button>

        {/* ── Refresh ── */}
        <button onClick={() => window.location.reload()} title="Refresh" style={{
          width: 32, height: 32, borderRadius: 7, cursor: 'pointer', marginLeft: 6,
          background: '#F9FAFB', border: '1px solid #E5E7EB',
          color: '#9ca3af', display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'all 0.15s', flexShrink: 0,
        }}
        onMouseEnter={e => { e.currentTarget.style.background = '#FFF7ED'; e.currentTarget.style.color = '#EA580C'; }}
        onMouseLeave={e => { e.currentTarget.style.background = '#F9FAFB'; e.currentTarget.style.color = '#9ca3af'; }}>
          <RefreshCw size={13} strokeWidth={2} />
        </button>

        {/* ── Spacer ── */}
        <div style={{ flex: 1 }} />

        {/* ── Notification Centre ── */}
        <NotificationCentre companyId={selectedCompany?.companyId} />

        {/* ── Date / Time ── */}
        <div style={{ width: 1, height: 22, background: '#E5E7EB', flexShrink: 0, margin: '0 12px' }} />
        <div style={{ textAlign: 'right', flexShrink: 0, marginRight: 14, lineHeight: 1.4 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: '#1E293B' }}>{timeStr}</div>
          <div style={{ fontSize: 10.5, color: '#94a3b8', fontWeight: 500 }}>{dayStr}</div>
        </div>

        <div style={{ width: 1, height: 22, background: '#E5E7EB', flexShrink: 0, marginRight: 14 }} />

        {/* ── User Profile ── */}
        <div onClick={() => navigate('/profile')} title="My Profile"
          style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, marginRight: 12, cursor: 'pointer', padding: '4px 8px', borderRadius: 8, transition: 'background .15s' }}
          onMouseEnter={e => e.currentTarget.style.background = '#F0FDF9'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
          <UserAvatar userId={user?.id || user?.userId} initials={initials} photoExt={user?.photoExt} />
          <div style={{ lineHeight: 1.3 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: '#1E293B' }}>{username}</div>
            <div style={{ fontSize: 10, color: '#94a3b8' }}>{userRole}</div>
          </div>
          <ChevronDown size={12} color="#94a3b8" />
        </div>

        {/* ── Logout ── */}
        <button onClick={onLogout} style={{
          height: 32, padding: '0 12px', borderRadius: 7, cursor: 'pointer',
          background: '#FEF2F2', border: '1px solid #FECACA',
          color: '#DC2626', fontSize: 12, fontWeight: 600, fontFamily: FONT,
          transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: 5,
          flexShrink: 0,
        }}
        onMouseEnter={e => { e.currentTarget.style.background = '#FEE2E2'; e.currentTarget.style.borderColor = '#FCA5A5'; }}
        onMouseLeave={e => { e.currentTarget.style.background = '#FEF2F2'; e.currentTarget.style.borderColor = '#FECACA'; }}>
          <LogOut size={12} strokeWidth={2} />
          Logout
        </button>

      </header>
    </>
  );
};

export default Header;
