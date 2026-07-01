import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCompany } from '../context/CompanyContext';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';
import {
  Search, ChevronDown, Building2, LogOut,
  Settings, RefreshCw, Bell,
} from 'lucide-react';

/* ── Quick-nav shortcuts ── */
const SHORTCUTS = {
  'CC':  { path: '/client/create',         label: 'Create Client' },
  'CV':  { path: '/client/view',           label: 'View Clients' },
  'VC':  { path: '/vendor/create',         label: 'Create Vendor' },
  'VV':  { path: '/vendor/view',           label: 'View Vendors' },
  'SC':  { path: '/sales-order/create',    label: 'Create Sales Order' },
  'SV':  { path: '/sales-order/view',      label: 'View Sales Orders' },
  'PC':  { path: '/purchase-order/create', label: 'Create Purchase Order' },
  'PV':  { path: '/purchase-order/view',   label: 'View Purchase Orders' },
  'TI':  { path: '/tally/import',          label: 'Tally Import' },
  'TP':  { path: '/tally/pending',         label: 'Tally Pending' },
  'ADM': { path: '/admin/companies',       label: 'Admin Companies' },
  'STK': { path: '/stock/view',            label: 'Stock View' },
};

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
  const [q, setQ] = useState('');
  const navigate  = useNavigate();
  const ref       = useRef(null);
  useClickOutside(ref, onClose);
  useEffect(() => { ref.current?.querySelector('input')?.focus(); }, []);

  const filtered = Object.entries(SHORTCUTS).filter(([code, { label }]) =>
    code.includes(q.toUpperCase()) || label.toLowerCase().includes(q.toLowerCase())
  );
  const go = (path) => { navigate(path); onClose(); };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(15,23,42,0.45)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 80,
    }}>
      <div ref={ref} style={{
        width: 520, background: '#fff', borderRadius: 14,
        boxShadow: '0 20px 60px rgba(0,0,0,0.18)',
        overflow: 'hidden', border: '1px solid #E5E7EB',
        fontFamily: FONT,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: '1px solid #F1F5F9' }}>
          <Search size={16} color="#9ca3af" strokeWidth={2} />
          <input
            value={q} onChange={e => setQ(e.target.value)}
            placeholder="Search pages or type shortcode (e.g. CC, SV)…"
            style={{ flex: 1, border: 'none', outline: 'none', fontSize: 13.5, color: '#1e293b', fontFamily: 'inherit', background: 'transparent' }}
            onKeyDown={e => {
              if (e.key === 'Escape') onClose();
              if (e.key === 'Enter' && filtered[0]) go(filtered[0][1].path);
            }}
          />
          <kbd style={{ fontSize: 11, color: '#94a3b8', border: '1px solid #e5e7eb', borderRadius: 5, padding: '2px 7px', fontFamily: 'monospace' }}>ESC</kbd>
        </div>
        <div style={{ maxHeight: 340, overflowY: 'auto' }}>
          {filtered.length === 0 ? (
            <div style={{ padding: '28px 16px', textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>No results found</div>
          ) : filtered.map(([code, { path, label }]) => (
            <div key={code} onClick={() => go(path)}
              style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', cursor: 'pointer', transition: 'background 0.12s' }}
              onMouseEnter={e => e.currentTarget.style.background = '#F8FAFC'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              <kbd style={{ fontSize: 11, fontWeight: 700, color: '#EA580C', border: '1px solid #FED7AA', borderRadius: 5, padding: '2px 8px', background: '#FFF7ED', fontFamily: 'monospace', minWidth: 34, textAlign: 'center' }}>{code}</kbd>
              <span style={{ fontSize: 13, color: '#374151', fontWeight: 500 }}>{label}</span>
              <span style={{ marginLeft: 'auto', fontSize: 11, color: '#94a3b8' }}>↵</span>
            </div>
          ))}
        </div>
        <div style={{ padding: '8px 16px', borderTop: '1px solid #F1F5F9', display: 'flex', gap: 14 }}>
          {['↑↓ navigate','↵ select','ESC close'].map(h => (
            <span key={h} style={{ fontSize: 11, color: '#94a3b8' }}>{h}</span>
          ))}
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
