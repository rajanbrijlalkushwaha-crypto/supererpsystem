import { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useLocation } from 'react-router-dom';
import { NAV_GROUPS, isPathActive } from '../utils/navGroups';
import { useNavTheme, NEU } from '../utils/navTheme';
import { useAuth } from '../context/AuthContext';
import { px, vh } from '../utils/uiScale';

/* ──────────────────────────────────────────────
   DESIGN TOKENS — deep navy rail that frames the blue header
──────────────────────────────────────────────── */
const W_OPEN    = 204;
const W_RAIL    = 60;
const W_TILE    = 84;    // tile rail: one card per menu (icon box + name under it)
const BG_TOP    = '#2A4D6E';
const BG_BOT    = '#1E3A54';
const LINE      = 'rgba(255,255,255,0.10)';
const TXT       = 'rgba(255,255,255,0.92)';
const TXT_SUB   = 'rgba(255,255,255,0.74)';
const TXT_MUTED = 'rgba(255,255,255,0.42)';
const HOVER     = 'rgba(255,255,255,0.08)';
const OPEN_BG   = 'rgba(255,255,255,0.05)';
const ACTIVE_BG = 'rgba(255,255,255,0.15)';
const ACCENT    = '#FB923C'; // warm orange — same family as the header brand tile

/* Two looks, switched from the top bar: 'classic' navy and 'neu' (neumorphism —
   one soft surface; raised = light/dark shadow, pressed = inset shadow). */
const T_CLASSIC = {
  neu: false,
  bg: `linear-gradient(180deg, ${BG_TOP} 0%, ${BG_BOT} 100%)`,
  edgeBorder: '1px solid rgba(0,0,0,0.25)', edgeShadow: 'inset -1px 0 0 rgba(255,255,255,0.04)',
  line: LINE, txt: TXT, txtSub: TXT_SUB, muted: TXT_MUTED, activeTxt: '#fff',
  restBg: 'transparent', hoverBg: HOVER, openBg: OPEN_BG, activeBg: ACTIVE_BG,
  rowShadow: 'none', hoverShadow: 'none', openShadow: 'none', activeShadow: 'none',
  rowMargin: '1px 8px', guide: 'rgba(255,255,255,0.14)',
  subHoverBg: HOVER, subHoverTxt: '#fff', subCurBg: ACTIVE_BG, subCurTxt: '#fff',
  subHoverShadow: 'none', subCurShadow: 'none', subRestShadow: 'none', subRestBg: 'transparent', dot: 'rgba(255,255,255,0.35)', accent: ACCENT,
  flyBg: BG_TOP, flyBorder: '1px solid rgba(255,255,255,0.14)', flyShadow: '0 12px 32px rgba(0,0,0,0.35)', flyTitle: '#fff',
  scroll: 'rgba(255,255,255,0.22) transparent', ringBase: BG_TOP,
  colBg: 'transparent', colShadow: 'none', colHoverBg: HOVER, colHoverShadow: 'none', colTxt: TXT_SUB, colHoverTxt: '#fff',
};
const T_NEU = {
  neu: true,
  bg: NEU.base,
  edgeBorder: 'none', edgeShadow: '5px 0 14px rgba(163,177,198,0.5)',
  line: 'rgba(163,177,198,0.5)', txt: NEU.text, txtSub: NEU.text, muted: NEU.muted, activeTxt: NEU.accent,
  restBg: NEU.base, hoverBg: NEU.base, openBg: NEU.base, activeBg: NEU.base,
  /* every row is a raised pill button (like the profile page tabs); hover lifts
     it further; the active row is pressed in */
  rowShadow: NEU.raisedSm, hoverShadow: NEU.raised, openShadow: NEU.raisedSm, activeShadow: NEU.inset,
  rowMargin: '8px 12px', guide: 'rgba(163,177,198,0.75)',
  subHoverBg: NEU.base, subHoverTxt: NEU.accent, subCurBg: NEU.base, subCurTxt: NEU.accent,
  subHoverShadow: NEU.raised, subCurShadow: NEU.inset, subRestShadow: NEU.raisedSm, subRestBg: NEU.base, dot: NEU.muted, accent: '#EA580C',
  flyBg: NEU.base, flyBorder: 'none', flyShadow: NEU.raised, flyTitle: NEU.strong,
  scroll: '#A3B1C6 transparent', ringBase: NEU.base,
  colBg: NEU.base, colShadow: NEU.raisedSm, colHoverBg: NEU.base, colHoverShadow: NEU.inset, colTxt: NEU.text, colHoverTxt: NEU.accent,
};

/* sub-items inside the tile rail's flyout (white panel) */
const T_TILE_FLY = {
  ...T_CLASSIC, txtSub: '#344054', muted: '#98A2B3', dot: '#D0D5DD', accent: '#F97316',
  subHoverBg: '#F2F4F7', subHoverTxt: '#101828', subCurBg: '#FFF4ED', subCurTxt: '#C2410C',
};

/* Menu is shown in four labelled sections. Any group not listed here
   falls into the last section, so new groups never silently disappear. */
const NAV_SECTIONS = [
  { title: 'Main',       keys: ['dashboard', 'jobcode'] },
  { title: 'Operations', keys: ['crm', 'vendor', 'inventory', 'mfg', 'hr'] },
  { title: 'Finance',    keys: ['tallyrecon', 'transaction', 'account', 'reports'] },
  { title: 'System',     keys: ['admin', 'company', 'epsilonai'] },
];

/* Layout: 'tiles' (default — a rail of cards, sub-pages open beside it) or 'list' (the classic list) */
const LAYOUT_KEY = 'sidebarnav-layout';
const readLayout = () => { try { return localStorage.getItem(LAYOUT_KEY) === 'list' ? 'list' : 'tiles'; } catch { return 'tiles'; } };
const saveLayout = v => { try { localStorage.setItem(LAYOUT_KEY, v); } catch { /* storage blocked */ } };
/* menus that get a "New" badge on their tile */
const NEW_KEYS = new Set(['hr', 'tallyrecon']);
/* shorter names where the full one is too long for a tile */
const TILE_LABEL = { tallyrecon: 'Tally Recon', epsilonai: 'Epsilon AI' };

const COLLAPSE_KEY = 'sidebarnav-collapsed';
const readCollapsed = () => { try { return localStorage.getItem(COLLAPSE_KEY) === '1'; } catch { return false; } };
const saveCollapsed = v => { try { localStorage.setItem(COLLAPSE_KEY, v ? '1' : '0'); } catch { /* storage blocked */ } };

const groupItems = g => g.sections ? g.sections.flatMap(s => s.items) : (g.items || []);
const isDirect   = g => !!g.path && !g.items && !g.sections;

/* Darken a #rrggbb colour for the icon tile gradient. */
const shade = (hex, f = 0.74) => {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * f), g = Math.round(((n >> 8) & 255) * f), b = Math.round((n & 255) * f);
  return `rgb(${r},${g},${b})`;
};

/* Enter / Space activates a focused row, like a button. */
const kb = fn => e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(e); } };

/* Stroke-based, 24px-grid icons — one per top-level group, no emoji. */
function GroupIcon({ name, size = 15, color = '#fff' }) {
  const inner = {
    dashboard: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    jobcode:   '<path d="M3 6a1 1 0 011-1h5l2 2h9a1 1 0 011 1v10a1 1 0 01-1 1H4a1 1 0 01-1-1V6z"/>',
    crm:       '<circle cx="9" cy="8" r="3.2"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6"/><circle cx="17.5" cy="8.5" r="2.6"/><path d="M15.5 14.3c2.8.4 4.9 2.4 5 5.7"/>',
    vendor:    '<rect x="2" y="7" width="12" height="9" rx="1"/><path d="M14 10h4l3 3v3h-7z"/><circle cx="6.5" cy="18" r="1.8"/><circle cx="17.5" cy="18" r="1.8"/>',
    inventory: '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z"/><path d="M4.5 7.5L12 12l7.5-4.5M12 12v9"/>',
    transaction: '<path d="M4 8h15M15 4l4 4-4 4M20 16H5M9 12l-4 4 4 4"/>',
    hr:        '<circle cx="12" cy="7.5" r="3.5"/><path d="M5 20c0-3.9 3.1-6.5 7-6.5s7 2.6 7 6.5"/><path d="M17.5 4.5l1.2 1.2 2.3-2.3"/>',
    tallyrecon: '<path d="M4 7a3 3 0 013-3h4v6H4V7zM13 14h7v3a3 3 0 01-3 3h-4v-6z"/><path d="M8 14v3a3 3 0 003 3M16 10V7a3 3 0 00-3-3"/><path d="M6 16l2-2 2 2M14 8l2 2 2-2"/>',
    account:   '<rect x="2.5" y="6" width="19" height="13" rx="2"/><path d="M2.5 10h19M16 14.5h2.5" stroke-linecap="round"/>',
    mfg:       '<circle cx="12" cy="12" r="3.2"/><path d="M12 3v2.4M12 18.6V21M21 12h-2.4M5.4 12H3M18.4 5.6l-1.7 1.7M7.3 16.7l-1.7 1.7M18.4 18.4l-1.7-1.7M7.3 7.3L5.6 5.6"/>',
    reports:   '<path d="M4 20V10M11 20V4M18 20v-7" stroke-linecap="round"/>',
    admin:     '<path d="M12 3l7.5 3v5.5C19.5 16.5 16.5 20 12 21c-4.5-1-7.5-4.5-7.5-9.5V6L12 3z"/>',
    company:   '<rect x="4" y="3" width="10" height="18" rx="1"/><rect x="15" y="9" width="5" height="12" rx="1"/><path d="M7 7h1M11 7h1M7 11h1M11 11h1M7 15h1M11 15h1" stroke-linecap="round"/>',
    epsilonai: '<path d="M12 3l1.8 5.4L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.6L12 3z"/><path d="M19 2.5l.5 1.5 1.5.5-1.5.5-.5 1.5-.5-1.5L17 4.5l1.5-.5z"/>',
  }[name] || '<circle cx="12" cy="12" r="8"/>';
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      dangerouslySetInnerHTML={{ __html: inner }} />
  );
}

/* Icon tile — each group keeps its identity colour at all times.
   Classic: solid colour tile, white icon. Soft: raised surface tile, coloured icon. */
/* Groups that use a full-colour picture instead of a line icon (files in public/icons) */
const IMG_ICONS = { dashboard: '/icons/dashboard.png' };

function IconTile({ name, color, size = 26, ring = false, flat = false, t = T_CLASSIC }) {
  if (IMG_ICONS[name]) {
    return (
      <div style={{ width: size, height: size, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
        borderRadius: 7, boxShadow: ring ? `0 0 0 2px ${t.ringBase}, 0 0 0 3.5px ${t.accent}` : 'none' }}>
        <img src={IMG_ICONS[name]} alt="" draggable={false}
          style={{ width: size + 2, height: size + 2, objectFit: 'contain', display: 'block' }} />
      </div>
    );
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: t.neu ? 9 : 7, flexShrink: 0,
      background: t.neu ? 'transparent' : `linear-gradient(135deg, ${color}, ${shade(color)})`,
      boxShadow: t.neu
        ? (flat ? 'none' : ring ? NEU.insetSm : NEU.raisedSm)
        : ring
          ? `0 0 0 2px ${t.ringBase}, 0 0 0 3.5px ${t.accent}`
          : 'inset 0 1px 0 rgba(255,255,255,0.18), 0 1px 3px rgba(0,0,0,0.30)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      transition: 'box-shadow 0.15s',
    }}>
      <GroupIcon name={name} size={size >= 30 ? 16 : 15} color={t.neu ? shade(color, 0.72) : '#fff'} />
    </div>
  );
}

const Chevron = ({ open }) => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"
    style={{ flexShrink: 0, opacity: 0.7, transition: 'transform 0.18s', transform: open ? 'rotate(90deg)' : 'none' }}>
    <path d="M9 6l6 6-6 6" />
  </svg>
);

/* Sub-menu entry — used both in the expanded accordion and the rail flyout. */
function SubItem({ item, current, onClick, t }) {
  return (
    <div
      role="button" tabIndex={0}
      onClick={onClick} onKeyDown={kb(onClick)}
      title={item.label}
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        height: 29, padding: '0 8px', margin: t.neu ? '7px 0' : '1px 0', borderRadius: t.neu ? 10 : 6,
        cursor: 'pointer', userSelect: 'none',
        fontSize: 12.5, fontWeight: current ? 600 : 500,
        color: current ? t.subCurTxt : t.txtSub,
        background: current ? t.subCurBg : t.subRestBg,
        boxShadow: current ? t.subCurShadow : t.subRestShadow,
        transition: 'background 0.12s, color 0.12s, box-shadow 0.15s',
      }}
      onMouseEnter={e => { if (!current) { e.currentTarget.style.background = t.subHoverBg; e.currentTarget.style.color = t.subHoverTxt; e.currentTarget.style.boxShadow = t.subHoverShadow; } }}
      onMouseLeave={e => { if (!current) { e.currentTarget.style.background = t.subRestBg; e.currentTarget.style.color = t.txtSub; e.currentTarget.style.boxShadow = t.subRestShadow; } }}
    >
      <span style={{
        width: current ? 6 : 4, height: current ? 6 : 4, borderRadius: '50%', flexShrink: 0,
        background: current ? t.accent : t.dot,
      }} />
      <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.label}</span>
    </div>
  );
}

const SubTitle = ({ children, t }) => (
  <div style={{
    fontSize: 9.5, fontWeight: 700, color: t.muted,
    textTransform: 'uppercase', letterSpacing: '0.9px', padding: '8px 8px 3px',
  }}>{children}</div>
);

/* Items of a group, with section titles when the group has sections. */
function GroupBody({ group, currentPath, onPick, t }) {
  if (group.sections) {
    return group.sections.map(sec => (
      <div key={sec.title}>
        <SubTitle t={t}>{sec.title}</SubTitle>
        {sec.items.map(item => (
          <SubItem key={item.path} item={item} current={item.path === currentPath} onClick={() => onPick(item)} t={t} />
        ))}
      </div>
    ));
  }
  return (group.items || []).map(item => (
    <SubItem key={item.path} item={item} current={item.path === currentPath} onClick={() => onPick(item)} t={t} />
  ));
}

export default function SidebarNav() {
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [layout, setLayout]       = useState(readLayout);
  const tiles = layout === 'tiles';
  const { user } = useAuth() || {};
  const [openKey, setOpenKey]     = useState(null);
  const [fly, setFly]             = useState(null); // rail flyout: { key, top }
  const asideRef     = useRef(null);
  const flyRef       = useRef(null); // rail flyout (rendered in a portal, outside the aside)
  const flyTimer     = useRef(null);
  const pickedGroup  = useRef(null); // group the user last clicked an item in
  const [theme]      = useNavTheme();
  const t            = theme === 'neu' ? T_NEU : T_CLASSIC;

  useEffect(() => () => clearTimeout(flyTimer.current), []);

  /* Tell the header so its brand block stays the same width as this rail. */
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('sidebarnav:collapsed', { detail: collapsed }));
    window.dispatchEvent(new CustomEvent('sidebarnav:width', { detail: { width: tiles ? W_TILE : collapsed ? W_RAIL : W_OPEN, compact: tiles || collapsed } }));
  }, [collapsed, tiles]);
  const switchLayout = () => { setFly(null); setLayout(l => { const n = l === 'tiles' ? 'list' : 'tiles'; saveLayout(n); return n; }); };

  /* A flyout opened by click or keyboard closes on any click outside the menu. */
  useEffect(() => {
    if (!fly) return undefined;
    const onDown = e => {
      if (!asideRef.current?.contains(e.target) && !flyRef.current?.contains(e.target)) setFly(null);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [fly]);

  /* The menu entry that matches the current URL. Entries with a query string
     (e.g. ?tab=client) win over a bare path so "Client Balance" and
     "View Balance" never both light up. */
  const currentPath = useMemo(() => {
    const have = new URLSearchParams(search);
    const all = NAV_GROUPS.flatMap(groupItems);
    const withQuery = all.find(i => {
      const [p, q] = i.path.split('?');
      if (!q || p !== pathname) return false;
      return [...new URLSearchParams(q)].every(([k, v]) => have.get(k) === v);
    });
    if (withQuery) return withQuery.path;
    return all.find(i => i.path === pathname)?.path ?? null;
  }, [pathname, search]);

  /* Active group: the one that owns the current entry (preferring the group
     the user clicked it from, since some pages appear in two groups), else the
     group whose routes cover the URL. */
  const activeKey = useMemo(() => {
    const owners = NAV_GROUPS.filter(g => groupItems(g).some(i => i.path === currentPath)).map(g => g.key);
    const byRoute = NAV_GROUPS.find(g => isPathActive(g.routes, pathname))?.key ?? null;
    if (owners.length) {
      if (owners.includes(pickedGroup.current)) return pickedGroup.current;
      if (byRoute && owners.includes(byRoute)) return byRoute;
      return owners[0];
    }
    return byRoute;
  }, [currentPath, pathname]);

  useEffect(() => { if (activeKey) setOpenKey(activeKey); }, [activeKey]);

  const sections = useMemo(() => {
    const listed = new Set(NAV_SECTIONS.flatMap(s => s.keys));
    const byKey  = Object.fromEntries(NAV_GROUPS.map(g => [g.key, g]));
    const out = NAV_SECTIONS.map(s => ({ title: s.title, groups: s.keys.map(k => byKey[k]).filter(Boolean) }));
    const rest = NAV_GROUPS.filter(g => !listed.has(g.key));
    if (rest.length) out[out.length - 1].groups.push(...rest);
    return out.filter(s => s.groups.length);
  }, []);

  const pick = (group, item) => {
    pickedGroup.current = group.key;
    setFly(null);
    navigate(item.path);
  };

  const toggleCollapsed = () => {
    setFly(null);
    setCollapsed(c => { saveCollapsed(!c); return !c; });
  };

  /* ── Rail flyout (collapsed mode) ── */
  const openFly = (group, el) => {
    clearTimeout(flyTimer.current);
    const r = el.getBoundingClientRect();
    const est = 46 + (group.sections
      ? group.sections.reduce((n, s) => n + 25 + s.items.length * 31, 0)
      : (group.items || []).length * 31);
    const top = Math.max(8, Math.min(px(r.top) - 4, vh() - est - 8));   // screen px → page px (display size)
    setFly({ key: group.key, top });
  };
  const closeFly = () => {
    clearTimeout(flyTimer.current);
    flyTimer.current = setTimeout(() => setFly(null), 160);
  };
  const keepFly = () => clearTimeout(flyTimer.current);

  const W = tiles ? W_TILE : collapsed ? W_RAIL : W_OPEN;
  const flyGroup = fly && NAV_GROUPS.find(g => g.key === fly.key);
  const flyLeft  = (asideRef.current ? px(asideRef.current.getBoundingClientRect().right) : W) + 6;

  /* Rail flyout — group name and its pages, shown beside the rail.
     Rendered at <body> level: the sidebar is its own layer (for the soft-look
     shadow), so a flyout inside it would slide under the page's table. */
  const flyout = flyGroup && createPortal(
    <div
      ref={flyRef}
      onMouseEnter={keepFly}
      onMouseLeave={tiles ? undefined : closeFly}
      style={{
        position: 'fixed', left: flyLeft, top: fly.top, zIndex: 1500, fontFamily: 'inherit',
        width: 220, maxHeight: 'calc(100vh - 16px)', overflowY: 'auto',
        background: tiles && !t.neu ? '#fff' : t.flyBg, border: tiles && !t.neu ? '1px solid #E4E7EC' : t.flyBorder, borderRadius: t.neu || tiles ? 14 : 10,
        boxShadow: tiles && !t.neu ? '0 12px 32px rgba(16,24,40,0.18)' : t.flyShadow, padding: t.neu || tiles ? '8px 8px 10px' : '6px 6px 8px',
        scrollbarWidth: 'thin', scrollbarColor: t.scroll,
      }}
    >
      <div
        onClick={isDirect(flyGroup) ? () => { pickedGroup.current = flyGroup.key; setFly(null); navigate(flyGroup.path); } : undefined}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '4px 6px 6px',
          borderBottom: isDirect(flyGroup) ? 'none' : `1px solid ${tiles && !t.neu ? '#EAECF0' : t.line}`,
          marginBottom: isDirect(flyGroup) ? 0 : 2,
          cursor: isDirect(flyGroup) ? 'pointer' : 'default',
          color: tiles && !t.neu ? '#101828' : t.flyTitle, fontSize: 13, fontWeight: 700,
        }}
      >
        <IconTile name={flyGroup.key} color={flyGroup.color} size={22} t={tiles ? { ...t, neu: false } : t} />
        {flyGroup.label}
      </div>
      {!isDirect(flyGroup) && (
        <GroupBody group={flyGroup} currentPath={currentPath} onPick={item => pick(flyGroup, item)} t={tiles && !t.neu ? T_TILE_FLY : t} />
      )}
    </div>,
    document.body
  );

  /* ── Tile rail ── */
  if (tiles) {
    const neu = t.neu;
    const initial = String(user?.name || user?.username || '?').trim().charAt(0).toUpperCase();
    const firstName = String(user?.name || user?.username || 'Profile').trim().split(/\s+/)[0];
    return (
      <aside ref={asideRef} style={{
        width: W_TILE, minWidth: W_TILE, flexShrink: 0, height: '100%', position: 'relative', zIndex: 1,
        background: neu ? NEU.base : '#F2F4F7', borderRight: neu ? 'none' : '1px solid #E4E7EC', boxShadow: neu ? t.edgeShadow : 'none',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        <style>{`
          .snt-tile { position: relative; width: 68px; margin: 0 auto 7px; padding: 7px 3px 6px; border-radius: 13px; cursor: pointer; user-select: none;
            display: flex; flex-direction: column; align-items: center; gap: 4px; box-sizing: border-box; outline: none;
            background: ${neu ? NEU.base : '#fff'}; border: ${neu ? 'none' : '1px solid #EAECF0'}; box-shadow: ${neu ? NEU.raisedSm : '0 1px 2px rgba(16,24,40,0.06)'};
            transition: transform .12s, box-shadow .15s, background .15s; }
          .snt-tile:hover { transform: translateY(-1px); box-shadow: ${neu ? NEU.raised : '0 6px 14px rgba(16,24,40,0.10)'}; }
          .snt-tile:focus-visible { box-shadow: 0 0 0 3px rgba(251,146,60,.45); }
          .snt-tile.on { background: linear-gradient(160deg, #FB923C, #F97316); border-color: transparent; box-shadow: 0 8px 18px rgba(249,115,22,0.35); }
          .snt-tile.open:not(.on) { box-shadow: ${neu ? NEU.inset : '0 0 0 2px #FDBA74, 0 6px 14px rgba(16,24,40,0.10)'}; }
          .snt-box { width: 30px; height: 30px; border-radius: 9px; display: flex; align-items: center; justify-content: center;
            box-shadow: inset 0 1px 0 rgba(255,255,255,0.25), 0 2px 5px rgba(16,24,40,0.18); }
          .snt-tile.on .snt-box { box-shadow: 0 0 0 2px rgba(255,255,255,0.85), 0 2px 6px rgba(0,0,0,0.18); }
          .snt-name { font-size: 10px; font-weight: 600; line-height: 1.15; text-align: center; color: ${neu ? NEU.text : '#1F2937'};
            max-width: 64px; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
          .snt-tile.on .snt-name { color: #fff; font-weight: 700; }
          .snt-new { position: absolute; top: -5px; right: -4px; background: #16A34A; color: #fff; font-size: 8px; font-weight: 800;
            padding: 1px 5px; border-radius: 10px; box-shadow: 0 1px 3px rgba(0,0,0,0.25); letter-spacing: .2px; }
          .snt-nav::-webkit-scrollbar { width: 4px; } .snt-nav::-webkit-scrollbar-thumb { background: #D0D5DD; border-radius: 4px; }
        `}</style>
        <nav className="snt-nav" onScroll={() => setFly(null)} style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '10px 0 6px', scrollbarWidth: 'thin' }}>
          {sections.map((sec, si) => (
            <div key={sec.title}>
              {si > 0 && <div style={{ height: 1, background: neu ? 'rgba(163,177,198,0.5)' : '#E4E7EC', margin: '2px 14px 9px' }} />}
              {sec.groups.map(group => {
                const direct = isDirect(group), isActive = group.key === activeKey, flyOpen = fly?.key === group.key;
                const onTile = e => {
                  if (direct) { pickedGroup.current = group.key; setFly(null); navigate(group.path); return; }
                  if (flyOpen) { setFly(null); return; }
                  openFly(group, e.currentTarget);
                };
                return (
                  <div key={group.key} role="button" tabIndex={0} title={group.label}
                    className={`snt-tile${isActive ? ' on' : ''}${flyOpen ? ' open' : ''}`}
                    aria-expanded={direct ? undefined : flyOpen}
                    onClick={onTile} onKeyDown={kb(onTile)}>
                    {NEW_KEYS.has(group.key) && <span className="snt-new">New</span>}
                    <div className="snt-box" style={{ background: `linear-gradient(135deg, ${group.color}, ${shade(group.color, 0.72)})` }}>
                      <GroupIcon name={group.key} size={15} color="#fff" />
                    </div>
                    <div className="snt-name">{TILE_LABEL[group.key] || group.label}</div>
                  </div>
                );
              })}
            </div>
          ))}
        </nav>
        {/* user + switch to the list view */}
        <div style={{ flexShrink: 0, borderTop: `1px solid ${neu ? 'rgba(163,177,198,0.5)' : '#E4E7EC'}`, padding: '10px 0 8px' }}>
          <div role="button" tabIndex={0} className={`snt-tile${pathname === '/profile' ? ' on' : ''}`} title={user?.name || user?.username || 'Profile'}
            onClick={() => { setFly(null); navigate('/profile'); }} onKeyDown={kb(() => navigate('/profile'))} style={{ marginBottom: 6 }}>
            <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'linear-gradient(135deg, #FB923C, #EA580C)', color: '#fff', fontWeight: 800, fontSize: 12.5,
              display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 6px rgba(234,88,12,0.35)' }}>{initial}</div>
            <div className="snt-name">{firstName}</div>
          </div>
          <div role="button" tabIndex={0} onClick={switchLayout} onKeyDown={kb(switchLayout)} title="Switch to the list menu"
            style={{ margin: '0 auto', width: 68, textAlign: 'center', fontSize: 9.5, fontWeight: 600, color: neu ? NEU.muted : '#98A2B3', cursor: 'pointer', padding: '3px 0' }}>☰ List view</div>
        </div>
        {flyout}
      </aside>
    );
  }

  return (
    <aside ref={asideRef} style={{
      width: W, minWidth: W, flexShrink: 0, height: '100%',
      background: t.bg,
      borderRight: t.edgeBorder,
      boxShadow: t.edgeShadow,
      position: 'relative', zIndex: 1,
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
      transition: 'width 0.18s ease, min-width 0.18s ease, background 0.25s',
    }}>
      <nav
        onScroll={() => setFly(null)}
        style={{
          flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '4px 0 10px',
          scrollbarWidth: 'thin', scrollbarColor: t.scroll,
        }}
      >
        {sections.map((sec, si) => (
          <div key={sec.title}>
            {collapsed
              ? (si > 0 && <div style={{ height: 1, background: t.line, margin: '8px 14px' }} />)
              : (
                <div style={{
                  fontSize: 9.5, fontWeight: 700, color: t.muted,
                  textTransform: 'uppercase', letterSpacing: '1.2px',
                  padding: si === 0 ? '10px 18px 5px' : '14px 18px 5px',
                  whiteSpace: 'nowrap', userSelect: 'none',
                }}>{sec.title}</div>
              )}

            {sec.groups.map(group => {
              const direct   = isDirect(group);
              const isOpen   = !collapsed && openKey === group.key;
              const isActive = group.key === activeKey;
              const flyOpen  = collapsed && fly?.key === group.key;
              const restBg   = isActive ? t.activeBg : (isOpen || flyOpen ? t.openBg : t.restBg);
              const restSh   = isActive ? t.activeShadow : (isOpen || flyOpen ? t.openShadow : t.rowShadow);

              const onRowClick = e => {
                if (direct) { pickedGroup.current = group.key; setFly(null); navigate(group.path); return; }
                if (collapsed) { openFly(group, e.currentTarget); return; }
                setOpenKey(isOpen ? null : group.key);
              };

              return (
                <div key={group.key}>
                  <div
                    role="button" tabIndex={0} aria-expanded={direct ? undefined : (isOpen || flyOpen)}
                    onClick={onRowClick} onKeyDown={kb(onRowClick)}
                    onMouseEnter={e => {
                      if (!isActive) { e.currentTarget.style.background = t.hoverBg; e.currentTarget.style.boxShadow = t.hoverShadow; }
                      if (collapsed) openFly(group, e.currentTarget);
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.background = restBg; e.currentTarget.style.boxShadow = restSh;
                      if (collapsed) closeFly();
                    }}
                    style={{
                      position: 'relative',
                      display: 'flex', alignItems: 'center',
                      justifyContent: collapsed ? 'center' : 'flex-start',
                      gap: 10, height: collapsed ? 42 : 36,
                      margin: t.neu && collapsed ? '8px 9px' : t.rowMargin, padding: collapsed ? 0 : '0 8px 0 7px',
                      borderRadius: t.neu ? 12 : 8, cursor: 'pointer', userSelect: 'none',
                      background: restBg, boxShadow: restSh,
                      color: isActive ? t.activeTxt : t.txt,
                      fontSize: 13, fontWeight: isActive ? 700 : 600,
                      transition: 'background 0.12s, box-shadow 0.15s',
                    }}
                  >
                    {/* Active marker on the rail's left edge */}
                    {isActive && !t.neu && (
                      <span style={{
                        position: 'absolute', left: -8, top: 7, bottom: 7, width: 3,
                        borderRadius: '0 3px 3px 0', background: ACCENT,
                      }} />
                    )}
                    <IconTile name={group.key} color={group.color} size={collapsed ? 30 : 26} ring={!t.neu && collapsed && isActive} flat={t.neu} t={t} />
                    {!collapsed && (
                      <>
                        <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{group.label}</span>
                        {!direct && <Chevron open={isOpen} />}
                      </>
                    )}
                  </div>

                  {/* Expanded accordion */}
                  {!direct && isOpen && (
                    <div style={{
                      margin: t.neu ? '2px 12px 10px 25px' : '2px 8px 6px 21px', paddingLeft: 9,
                      borderLeft: `1px solid ${t.guide}`,
                    }}>
                      <GroupBody group={group} currentPath={currentPath} onPick={item => pick(group, item)} t={t} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Collapse / expand toggle */}
      <div style={{ flexShrink: 0, borderTop: `1px solid ${t.line}`, padding: t.neu ? 10 : 8 }}>
        <div
          role="button" tabIndex={0}
          onClick={toggleCollapsed} onKeyDown={kb(toggleCollapsed)}
          title={collapsed ? 'Expand menu' : 'Collapse menu'}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : 'flex-start',
            gap: 10, height: 32, padding: collapsed ? 0 : '0 10px', borderRadius: t.neu ? 10 : 8,
            cursor: 'pointer', userSelect: 'none',
            background: t.colBg, boxShadow: t.colShadow,
            color: t.colTxt, fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap',
            transition: 'background 0.12s, color 0.12s, box-shadow 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = t.colHoverBg; e.currentTarget.style.boxShadow = t.colHoverShadow; e.currentTarget.style.color = t.colHoverTxt; }}
          onMouseLeave={e => { e.currentTarget.style.background = t.colBg; e.currentTarget.style.boxShadow = t.colShadow; e.currentTarget.style.color = t.colTxt; }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
            style={{ flexShrink: 0, transition: 'transform 0.18s', transform: collapsed ? 'rotate(180deg)' : 'none' }}>
            <path d="M11 17l-5-5 5-5M18 17l-5-5 5-5" />
          </svg>
          {!collapsed && <span>Collapse menu</span>}
        </div>
        <div role="button" tabIndex={0} onClick={switchLayout} onKeyDown={kb(switchLayout)} title="Switch to the tile menu"
          style={{ marginTop: 6, textAlign: 'center', fontSize: 10.5, fontWeight: 600, color: t.colTxt, cursor: 'pointer', opacity: 0.8 }}>▦ {collapsed ? '' : 'Tile view'}</div>
      </div>

      {flyout}
      {false && createPortal(
        <div
          ref={flyRef}
          onMouseEnter={keepFly}
          onMouseLeave={closeFly}
          style={{
            position: 'fixed', left: flyLeft, top: fly.top, zIndex: 1500, fontFamily: 'inherit',
            width: 212, maxHeight: 'calc(100vh - 16px)', overflowY: 'auto',
            background: t.flyBg, border: t.flyBorder, borderRadius: t.neu ? 14 : 10,
            boxShadow: t.flyShadow, padding: t.neu ? '8px 8px 10px' : '6px 6px 8px',
            scrollbarWidth: 'thin', scrollbarColor: t.scroll,
          }}
        >
          <div
            onClick={isDirect(flyGroup) ? () => { pickedGroup.current = flyGroup.key; setFly(null); navigate(flyGroup.path); } : undefined}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '4px 6px 6px',
              borderBottom: isDirect(flyGroup) ? 'none' : `1px solid ${t.line}`,
              marginBottom: isDirect(flyGroup) ? 0 : 2,
              cursor: isDirect(flyGroup) ? 'pointer' : 'default',
              color: t.flyTitle, fontSize: 13, fontWeight: 700,
            }}
          >
            <IconTile name={flyGroup.key} color={flyGroup.color} size={22} t={t} />
            {flyGroup.label}
          </div>
          {!isDirect(flyGroup) && (
            <GroupBody group={flyGroup} currentPath={currentPath} onPick={item => pick(flyGroup, item)} t={t} />
          )}
        </div>,
        document.body
      )}
    </aside>
  );
}
