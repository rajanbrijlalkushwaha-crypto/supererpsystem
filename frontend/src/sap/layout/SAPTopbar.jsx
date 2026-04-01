/**
 * SAP MODE — Standard Toolbar + Menu Bar
 * Replicates classic SAP GUI 7.x top bar: 7-menu menubar + standard toolbar + T-code box
 */
import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useSAP } from '../context/SAPContext';

const G = {
  screen:  '#dfe3e8', toolbar: '#ECE9D8', border: '#a0a0a0',
  borderDk:'#808080', borderLt: '#ffffff', btnBg: '#D4D0C8',
  text: '#000000', muted: '#555555', sapNavy: '#003875', sapBlue: '#0070D2',
  font: "Arial, Helvetica, 'Liberation Sans', sans-serif",
  fs: '12px', fsSm: '11px', fsXs: '10px',
};

/* ── 3-D button (no hover/press state for toolbar icons) ── */
function TbarBtn({ children, onClick, title, active, wide }) {
  const [pressed, setPressed] = useState(false);
  const [hover,   setHover]   = useState(false);
  return (
    <button onClick={onClick} title={title}
      style={{
        fontFamily: G.font, fontSize: G.fsSm, fontWeight: 400, cursor: 'pointer',
        padding: wide ? '1px 8px' : '1px 4px', minWidth: wide ? 40 : 22, height: 22,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 3,
        background: active ? '#C0D8EE' : (hover ? G.btnHover || '#C4C0B8' : G.btnBg),
        color: G.text,
        border: '1px solid',
        borderTopColor:    pressed ? G.borderDk : G.borderLt,
        borderLeftColor:   pressed ? G.borderDk : G.borderLt,
        borderRightColor:  pressed ? G.borderLt : G.borderDk,
        borderBottomColor: pressed ? G.borderLt : G.borderDk,
        userSelect: 'none', boxSizing: 'border-box',
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => { setHover(false); setPressed(false); }}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
    >
      {children}
    </button>
  );
}

function Sep() {
  return <div style={{ width: 1, height: 18, background: G.borderDk, margin: '0 2px', flexShrink: 0 }} />;
}

/* ── SAP System menu items ── */
const SYSTEM_MENU = [
  { label: 'User Profile', sub: 'Own Data' },
  { label: 'Services', sub: 'Reporting' },
  { label: 'Create Session', shortcut: 'Ctrl+N' },
  { label: 'End Session', shortcut: 'Ctrl+W' },
  { label: '─────────' },
  { label: 'Sign Off' },
];

/* ── Dropdown menu component ── */
function MenuDropdown({ label, items, onItem }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0 }}>
      <button
        onClick={() => setOpen(p => !p)}
        style={{
          fontFamily: G.font, fontSize: G.fsSm, padding: '2px 8px', height: 22,
          background: open ? '#B8D0E8' : 'transparent', border: 'none',
          color: G.text, cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap',
        }}
        onMouseEnter={e => !open && (e.currentTarget.style.background = '#D0E4F4')}
        onMouseLeave={e => !open && (e.currentTarget.style.background = 'transparent')}
      >
        {label}
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, minWidth: 180, zIndex: 9000,
          background: '#ffffff', border: `1px solid ${G.borderDk}`,
          boxShadow: '2px 2px 4px rgba(0,0,0,0.3)',
        }}>
          {items.map((item, i) => (
            item.label.startsWith('─')
              ? <div key={i} style={{ height: 1, background: G.border, margin: '2px 0' }} />
              : (
                <div key={i}
                  onClick={() => { onItem && onItem(item); setOpen(false); }}
                  style={{
                    padding: '3px 16px 3px 8px', fontSize: G.fsSm, fontFamily: G.font,
                    color: G.text, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', gap: 20,
                    whiteSpace: 'nowrap',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#316AC5', e.currentTarget.style.color = '#fff')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent', e.currentTarget.style.color = G.text)}
                >
                  <span>{item.label}</span>
                  {item.shortcut && <span style={{ color: '#888', fontSize: G.fsXs }}>{item.shortcut}</span>}
                </div>
              )
          ))}
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   Main Topbar
══════════════════════════════════════════════════════════════ */
export default function SAPTopbar({ onModeSwitch }) {
  const { notifications, globalSearch, searchResults, clearSearch, companyName } = useSAP();
  const [tcode,    setTcode]    = useState('');
  const [showBell, setShowBell] = useState(false);
  const [query,    setQuery]    = useState('');
  const [showSrch, setShowSrch] = useState(false);
  const navigate  = useNavigate();
  const location  = useLocation();
  const bellRef   = useRef(null);
  const srchRef   = useRef(null);

  const unread = notifications.filter(n => n.type === 'error' || n.type === 'warn').length;

  useEffect(() => {
    const h = (e) => {
      if (bellRef.current && !bellRef.current.contains(e.target)) setShowBell(false);
      if (srchRef.current && !srchRef.current.contains(e.target)) { setShowSrch(false); clearSearch(); setQuery(''); }
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [clearSearch]);

  const execTcode = (e) => {
    if (e.key !== 'Enter') return;
    const t = tcode.trim().toUpperCase();
    const map = {
      'VA01':'/sap/sales-orders/new', 'VA05':'/sap/sales-orders',
      'ME21N':'/sap/purchase-orders/new', 'ME2N':'/sap/purchase-orders',
      'MIGO':'/sap/grn/new', 'MB52':'/sap/inventory',
      'CS03':'/sap/bom', 'MD04':'/sap/mrp',
      'CO01':'/sap/production/new', 'CO03':'/sap/production',
      'FB50':'/sap/journals', 'FB03':'/sap/journals',
      'VF03':'/sap/invoices', 'F110':'/sap/payments',
      'S_ALR':'/sap/reports/pnl', '/N':'/sap',
    };
    if (map[t]) { navigate(map[t]); setTcode(''); }
    else if (t === '/N' || t === 'HOME') { navigate('/sap'); setTcode(''); }
  };

  const onSearch = (v) => { setQuery(v); setShowSrch(true); globalSearch(v); };
  const goResult = (r) => { navigate(r.path); setShowSrch(false); clearSearch(); setQuery(''); };

  /* derive current T-code hint from route */
  const routeTcode = (() => {
    const p = location.pathname;
    if (p.endsWith('/new'))          return 'CREATE';
    if (p.includes('sales-orders'))  return 'VA05';
    if (p.includes('purchase-orders'))return 'ME2N';
    if (p.includes('grn'))           return 'MIGO';
    if (p.includes('inventory'))     return 'MB52';
    if (p.includes('bom'))           return 'CS03';
    if (p.includes('mrp'))           return 'MD04';
    if (p.includes('production'))    return 'CO03';
    if (p.includes('invoices'))      return 'VF03';
    if (p.includes('payments'))      return 'F110';
    if (p.includes('journals'))      return 'FB03';
    if (p.includes('reports'))       return 'S_ALR';
    if (p.includes('projects'))      return 'CJ20N';
    if (p.includes('tasks'))         return 'CNS41';
    return 'SAP Easy Access';
  })();

  return (
    <div style={{ flexShrink: 0, fontFamily: G.font }}>

      {/* ── Row 1: Menu bar ── */}
      <div style={{
        height: 22, background: G.toolbar, borderBottom: `1px solid ${G.border}`,
        display: 'flex', alignItems: 'center', padding: '0 4px',
      }}>
        {/* SAP logo pill */}
        <div style={{
          background: G.sapNavy, color: '#fff', fontSize: 10, fontWeight: 800,
          padding: '1px 7px', marginRight: 8, letterSpacing: '1px', height: 18,
          display: 'flex', alignItems: 'center', flexShrink: 0, cursor: 'pointer',
        }} onClick={() => navigate('/sap')}>
          SAP
        </div>

        <MenuDropdown label="System" items={SYSTEM_MENU} onItem={item => item.label === 'Sign Off' && onModeSwitch()} />
        <MenuDropdown label="Edit"   items={[{ label: 'Find', shortcut: 'Ctrl+F' }, { label: 'Find Next', shortcut: 'F3' }]} />
        <MenuDropdown label="Goto"   items={[{ label: 'Back', shortcut: 'F3' }, { label: 'Exit', shortcut: 'Shift+F3' }, { label: 'Cancel', shortcut: 'F12' }]} />
        <MenuDropdown label="Favorites" items={[{ label: 'Add to Favorites', shortcut: 'Ctrl+D' }, { label: 'Change Favorites' }]} />
        <MenuDropdown label="Extras" items={[{ label: 'Settings' }, { label: 'Administration' }]} />
        <MenuDropdown label="Help"   items={[{ label: 'SAP Library' }, { label: 'Glossary' }, { label: '─────────' }, { label: 'About' }]} />

        <div style={{ flex: 1 }} />

        {/* Mode toggle pill — always visible */}
        <div style={{
          display: 'flex', border: `1px solid ${G.borderDk}`, overflow: 'hidden',
          marginRight: 6, flexShrink: 0,
        }}>
          <button onClick={onModeSwitch}
            style={{
              padding: '1px 10px', fontSize: 10, fontWeight: 700, background: G.btnBg,
              border: 'none', color: G.muted, cursor: 'pointer',
              fontFamily: G.font, letterSpacing: '0.3px',
              borderRight: `1px solid ${G.borderDk}`,
            }}
            onMouseEnter={e => (e.currentTarget.style.background = '#C0C0B8')}
            onMouseLeave={e => (e.currentTarget.style.background = G.btnBg)}>
            OLD MODE
          </button>
          <div style={{
            padding: '1px 10px', fontSize: 10, fontWeight: 800,
            background: G.sapNavy, color: '#fff', letterSpacing: '0.3px',
          }}>
            SAP MODE
          </div>
        </div>

        {/* Notifications bell */}
        <div ref={bellRef} style={{ position: 'relative', marginRight: 4 }}>
          <TbarBtn onClick={() => setShowBell(p => !p)} title="Notifications">
            <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
              🔔
              {unread > 0 && (
                <span style={{
                  position: 'absolute', top: -4, right: -4,
                  background: '#CC0000', color: '#fff', fontSize: 8, fontWeight: 700,
                  borderRadius: '50%', width: 12, height: 12,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>{unread}</span>
              )}
            </span>
          </TbarBtn>
          {showBell && (
            <div style={{
              position: 'absolute', top: '100%', right: 0, width: 280, zIndex: 9000,
              background: '#fff', border: `1px solid ${G.borderDk}`,
              boxShadow: '2px 2px 6px rgba(0,0,0,0.3)',
            }}>
              <div style={{ padding: '3px 8px', fontSize: 10, fontWeight: 700, color: G.sapNavy, borderBottom: `1px solid ${G.border}`, textTransform: 'uppercase' }}>
                Notifications
              </div>
              {notifications.length === 0
                ? <div style={{ padding: '10px 8px', fontSize: 11, color: G.muted, textAlign: 'center' }}>No notifications</div>
                : notifications.slice(0, 8).map(n => (
                  <div key={n.id} style={{ padding: '4px 8px', borderBottom: `1px solid ${G.border}`, display: 'flex', gap: 6 }}>
                    <span style={{ fontSize: 12, flexShrink: 0 }}>{n.type === 'error' ? '🔴' : n.type === 'warn' ? '🟡' : '🟢'}</span>
                    <div>
                      <div style={{ fontSize: 11, color: G.text }}>{n.msg}</div>
                      <div style={{ fontSize: 9, color: G.muted }}>{n.time}</div>
                    </div>
                  </div>
                ))
              }
            </div>
          )}
        </div>
      </div>

      {/* ── Row 2: Standard toolbar ── */}
      <div style={{
        background: G.toolbar, borderBottom: `1px solid ${G.border}`,
        padding: '2px 6px', display: 'flex', alignItems: 'center', gap: 2, minHeight: 28,
      }}>
        {/* Standard SAP toolbar buttons */}
        <TbarBtn onClick={() => navigate(-1)} title="Back (F3)">◀</TbarBtn>
        <TbarBtn onClick={() => navigate('/sap')} title="Exit (Shift+F3)">⌂</TbarBtn>
        <TbarBtn onClick={() => window.location.reload()} title="Cancel / Refresh (F12)">✕</TbarBtn>
        <Sep />
        <TbarBtn onClick={() => window.print()} title="Print (Ctrl+P)">🖨</TbarBtn>
        <TbarBtn title="Find (Ctrl+F)">🔍</TbarBtn>
        <Sep />
        <TbarBtn onClick={() => navigate('/sap/sales-orders/new')} title="Create (F5)" wide>+ New SO</TbarBtn>
        <Sep />

        {/* Global search */}
        <div ref={srchRef} style={{ position: 'relative', flex: 1, maxWidth: 320 }}>
          <input
            value={query}
            onChange={e => onSearch(e.target.value)}
            onFocus={() => setShowSrch(true)}
            placeholder="Search projects, orders, vendors…"
            style={{
              height: 22, width: '100%', boxSizing: 'border-box',
              background: '#ffffff', fontSize: G.fsSm, fontFamily: G.font, color: G.text,
              border: '1px solid', borderTopColor: G.borderDk, borderLeftColor: G.borderDk,
              borderRightColor: G.borderLt, borderBottomColor: G.borderLt,
              padding: '1px 24px 1px 4px', outline: 'none',
            }}
          />
          <span style={{ position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)', fontSize: 11, color: G.muted, pointerEvents: 'none' }}>🔍</span>
          {showSrch && query.length >= 2 && searchResults.length > 0 && (
            <div style={{
              position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 9000,
              background: '#fff', border: `1px solid ${G.borderDk}`,
              boxShadow: '2px 2px 4px rgba(0,0,0,0.3)', maxHeight: 200, overflowY: 'auto',
            }}>
              {searchResults.map((r, i) => (
                <div key={i} onClick={() => goResult(r)}
                  style={{ padding: '3px 8px', fontSize: G.fsSm, fontFamily: G.font, cursor: 'pointer', display: 'flex', gap: 8, alignItems: 'center', borderBottom: `1px solid ${G.border}` }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#316AC5', e.currentTarget.style.color = '#fff')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent', e.currentTarget.style.color = G.text)}>
                  <span style={{ fontSize: 9, fontWeight: 700, background: G.sapNavy, color: '#fff', padding: '0 4px', flexShrink: 0 }}>{r.type}</span>
                  <div>
                    <div style={{ fontSize: G.fsSm }}>{r.label}</div>
                    {r.sub && <div style={{ fontSize: G.fsXs, color: G.muted }}>{r.sub}</div>}
                  </div>
                </div>
              ))}
            </div>
          )}
          {showSrch && query.length >= 2 && searchResults.length === 0 && (
            <div style={{
              position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 9000,
              background: '#fff', border: `1px solid ${G.borderDk}`,
              padding: '8px', fontSize: G.fsSm, color: G.muted, textAlign: 'center',
            }}>
              No results found
            </div>
          )}
        </div>

        <Sep />

        {/* T-code command field */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
          <span style={{ fontSize: G.fsXs, color: G.muted, whiteSpace: 'nowrap' }}>Transaction:</span>
          <input
            value={tcode}
            onChange={e => setTcode(e.target.value)}
            onKeyDown={execTcode}
            placeholder={routeTcode}
            title="Enter T-code and press Enter (e.g. VA01, ME21N, FB50)"
            style={{
              width: 80, height: 22, boxSizing: 'border-box',
              background: '#fffbe6', fontSize: G.fsSm, fontFamily: G.font, color: G.text,
              border: '1px solid', borderTopColor: G.borderDk, borderLeftColor: G.borderDk,
              borderRightColor: G.borderLt, borderBottomColor: G.borderLt,
              padding: '1px 4px', outline: 'none', textTransform: 'uppercase',
            }}
          />
        </div>

        <div style={{ marginLeft: 8, fontSize: G.fsXs, color: G.muted, flexShrink: 0 }}>
          {companyName || 'No Company'}
        </div>
      </div>
    </div>
  );
}
