import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCompany } from '../context/CompanyContext';
import { useAuth } from '../context/AuthContext';
import {
  Search, ChevronDown, Building2, LogOut, Zap,
  Settings, RefreshCw,
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
              <kbd style={{ fontSize: 11, fontWeight: 700, color: '#2563EB', border: '1px solid #BFDBFE', borderRadius: 5, padding: '2px 8px', background: '#EFF6FF', fontFamily: 'monospace', minWidth: 34, textAlign: 'center' }}>{code}</kbd>
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

        {/* ── Brand ── */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          paddingRight: 14,
          borderRight: '1px solid #E5E7EB',
          flexShrink: 0, marginRight: 12,
        }}>
          <div style={{
            width: 30, height: 30, borderRadius: 8, flexShrink: 0,
            background: 'linear-gradient(135deg, #3B82F6, #1D4ED8)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 2px 8px rgba(59,130,246,0.32)',
          }}>
            <Zap size={15} color="#fff" strokeWidth={2.5} />
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#1E293B', letterSpacing: '-0.3px', lineHeight: 1.2 }}>
              Epsilon ERP
            </div>
            <div style={{ fontSize: 9, color: '#94a3b8', fontWeight: 500, letterSpacing: '0.3px' }}>
              Manufacturing Suite
            </div>
          </div>
        </div>

        {/* ── Company Switcher ── */}
        <div ref={coRef} style={{ position: 'relative', flexShrink: 0, marginRight: 10 }}>
          <button onClick={() => setShowCoSwitch(p => !p)} style={{
            display: 'flex', alignItems: 'center', gap: 7,
            background: showCoSwitch ? '#EFF6FF' : '#F9FAFB',
            border: `1px solid ${showCoSwitch ? '#BFDBFE' : '#E5E7EB'}`,
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
                    style={{ color: '#2563EB', cursor: 'pointer', fontWeight: 700 }}>Add one →</span>
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
                          background: isAct ? '#EFF6FF' : '#fff',
                          borderBottom: '1px solid #F9FAFB',
                          borderLeft: `3px solid ${isAct ? '#2563EB' : 'transparent'}`,
                        }}
                        onMouseEnter={e => { if (!isAct) e.currentTarget.style.background = '#F8FAFC'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = isAct ? '#EFF6FF' : '#fff'; }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: isAct ? '#2563EB' : '#111827', display: 'flex', alignItems: 'center', gap: 7 }}>
                          <Building2 size={12} color={isAct ? '#2563EB' : '#94a3b8'} />
                          {co.companyName}
                          {co.isDefault && (
                            <span style={{ fontSize: 9, background: '#EFF6FF', color: '#2563EB', borderRadius: 10, padding: '1px 6px', fontWeight: 700, border: '1px solid #BFDBFE' }}>DEFAULT</span>
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
                style={{ padding: '10px 14px', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#2563EB', background: '#F8FAFC', borderTop: '1px solid #F1F5F9', display: 'flex', alignItems: 'center', gap: 6 }}
                onMouseEnter={e => e.currentTarget.style.background = '#EFF6FF'}
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
        onMouseEnter={e => { e.currentTarget.style.borderColor = '#93C5FD'; e.currentTarget.style.color = '#2563EB'; }}
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
        onMouseEnter={e => { e.currentTarget.style.background = '#EFF6FF'; e.currentTarget.style.color = '#2563EB'; }}
        onMouseLeave={e => { e.currentTarget.style.background = '#F9FAFB'; e.currentTarget.style.color = '#9ca3af'; }}>
          <RefreshCw size={13} strokeWidth={2} />
        </button>

        {/* ── Spacer ── */}
        <div style={{ flex: 1 }} />

        {/* ── Date / Time ── */}
        <div style={{ textAlign: 'right', flexShrink: 0, marginRight: 14, lineHeight: 1.4 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: '#1E293B' }}>{timeStr}</div>
          <div style={{ fontSize: 10.5, color: '#94a3b8', fontWeight: 500 }}>{dayStr}</div>
        </div>

        <div style={{ width: 1, height: 22, background: '#E5E7EB', flexShrink: 0, marginRight: 14 }} />

        {/* ── User Profile ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, marginRight: 12 }}>
          <div style={{
            width: 30, height: 30, borderRadius: 8, flexShrink: 0,
            background: 'linear-gradient(135deg, #6366F1, #4F46E5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 11, fontWeight: 800, color: '#fff',
          }}>{initials}</div>
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
