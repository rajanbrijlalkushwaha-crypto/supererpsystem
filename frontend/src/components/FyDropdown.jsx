import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { NEU } from '../utils/navTheme';
import { px } from '../utils/uiScale';

const F = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

/* ── Year picker — our own dropdown (the browser's built-in <select> list can't be
   styled the same in Firefox/Chrome, e.g. Firefox shows grey strips beside white
   rows). The list opens in a fixed layer so the scrolling toolbar can't clip it. ── */
export default function FyDropdown({ value, options, onChange, neu, current }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos]   = useState(null);
  const btnRef = useRef(null), popRef = useRef(null);
  const label = f => (f === 'all' ? 'All Years' : `FY ${f}`);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = e => { if (!btnRef.current?.contains(e.target) && !popRef.current?.contains(e.target)) setOpen(false); };
    const onKey  = e => { if (e.key === 'Escape') setOpen(false); };
    const close  = () => setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', close);
    };
  }, [open]);

  const toggle = () => {
    const r = btnRef.current.getBoundingClientRect();
    setPos({ left: px(r.left), top: px(r.bottom) + 8, minWidth: Math.max(px(r.width), 150) });   // screen px → page px (display size)
    setOpen(o => !o);
  };
  const pick = f => { onChange(f); setOpen(false); };

  const btnStyle = neu ? {
    display:'flex', alignItems:'center', gap:8, height:30, padding:'0 12px', fontSize:11.5, fontWeight:700, fontFamily:F,
    cursor:'pointer', flexShrink:0, border:'none', borderRadius:10, margin:'0 5px', whiteSpace:'nowrap',
    background:NEU.base, color:NEU.accent, boxShadow: open ? NEU.inset : NEU.raisedSm,
  } : {
    display:'flex', alignItems:'center', gap:8, height:26, padding:'0 10px', fontSize:11.5, fontWeight:700, fontFamily:F,
    cursor:'pointer', flexShrink:0, borderRadius:6, margin:'0 4px', whiteSpace:'nowrap',
    border:'1px solid rgba(255,255,255,0.55)', background: open ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0.15)', color:'#fff',
  };
  const popStyle = neu
    ? { background:NEU.base, borderRadius:14, boxShadow:'8px 8px 18px #A3B1C6, -8px -8px 18px #FFFFFF', padding:8 }
    : { background:'#fff', borderRadius:8, border:'1px solid #E5E7EB', boxShadow:'0 12px 30px rgba(0,0,0,0.18)', padding:4 };
  const itemStyle = sel => neu ? {
    padding:'7px 12px', margin:'3px 0', borderRadius:10, fontSize:12, fontWeight: sel ? 700 : 600, cursor:'pointer',
    color: sel ? NEU.accent : NEU.text, background:NEU.base, boxShadow: sel ? NEU.inset : 'none', whiteSpace:'nowrap',
  } : {
    padding:'6px 10px', borderRadius:5, fontSize:12, fontWeight: sel ? 700 : 500, cursor:'pointer',
    color: sel ? '#2A4D6E' : '#111827', background: sel ? '#E8EEF6' : 'transparent', whiteSpace:'nowrap',
  };

  return (
    <>
      <button ref={btnRef} onClick={toggle} title="Financial year" aria-haspopup="listbox" aria-expanded={open} style={btnStyle}>
        {label(value)}
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"
          style={{ transition:'transform 0.15s', transform: open ? 'rotate(180deg)' : 'none' }}><path d="M6 9l6 6 6-6" /></svg>
      </button>
      {open && pos && createPortal(
        /* rendered at <body> level so no toolbar/table layer can paint over it */
        <div ref={popRef} role="listbox" style={{ position:'fixed', left:pos.left, top:pos.top, minWidth:pos.minWidth, zIndex:2000, fontFamily:F, ...popStyle }}>
          {options.map(f => {
            const sel = f === value;
            return (
              <div key={f} role="option" aria-selected={sel} onClick={() => pick(f)} style={itemStyle(sel)}
                onMouseEnter={e => { if (!sel) { if (neu) e.currentTarget.style.boxShadow = NEU.raisedSm; else e.currentTarget.style.background = '#F1F5F9'; } }}
                onMouseLeave={e => { if (!sel) { if (neu) e.currentTarget.style.boxShadow = 'none'; else e.currentTarget.style.background = 'transparent'; } }}>
                {label(f)}
                {f === current && <span style={{ fontSize:10, fontWeight:600, marginLeft:6, color: neu ? NEU.muted : '#6B7280' }}>(current)</span>}
              </div>
            );
          })}
        </div>,
        document.body
      )}
    </>
  );
}
