/**
 * SAP GUI Component Library
 * Classic SAP Desktop skin — Windows XP / SAP Classic palette
 * All SAP MODE screens use these primitives.
 */
import React, { useState, useEffect } from 'react';

/* ══════════════════════════════════════════════════════════════
   DESIGN TOKENS — strict SAP classic palette
══════════════════════════════════════════════════════════════ */
export const G = {
  /* backgrounds */
  screen:    '#dfe3e8',
  panel:     '#ffffff',
  toolbar:   '#ECE9D8',
  tblHdr:    '#D6D2C8',
  tblAlt:    '#F8F6F2',
  tblSel:    '#B8CFE5',
  inputBg:   '#ffffff',
  statusBg:  '#ECE9D8',
  sidebar:   '#EBE7DE',
  sidebarAct:'#316AC5',
  /* borders (3-D raised effect) */
  border:    '#a0a0a0',
  borderDk:  '#808080',
  borderLt:  '#ffffff',
  /* button */
  btnBg:     '#D4D0C8',
  btnHover:  '#C4C0B8',
  /* text */
  text:      '#000000',
  muted:     '#555555',
  label:     '#000080',
  /* semantic */
  error:     '#CC0000',
  errorBg:   '#FFF0F0',
  success:   '#007830',
  successBg: '#F0FFF4',
  warn:      '#B85C00',
  warnBg:    '#FFF8F0',
  /* SAP brand */
  sapNavy:   '#003875',
  sapBlue:   '#0070D2',
  sapSel:    '#316AC5',
  /* typography */
  font:      "Arial, Helvetica, 'Liberation Sans', sans-serif",
  fs:        '12px',
  fsSm:      '11px',
  fsXs:      '10px',
};

/* ══════════════════════════════════════════════════════════════
   SapBtn — 3-D raised rectangular button
══════════════════════════════════════════════════════════════ */
export function SapBtn({ children, onClick, variant, disabled, type, title, style }) {
  const [pressed, setPressed] = useState(false);
  const [hover,   setHover]   = useState(false);

  const mk = (bg, tc, lc, rc, bc, fg) => ({
    fontFamily: G.font, fontSize: G.fsSm, fontWeight: 400,
    cursor: disabled ? 'default' : 'pointer',
    padding: '1px 8px', minWidth: 40, height: 22,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 3,
    background: bg, color: fg || G.text,
    border: '1px solid',
    borderTopColor: tc, borderLeftColor: lc, borderRightColor: rc, borderBottomColor: bc,
    userSelect: 'none', whiteSpace: 'nowrap', boxSizing: 'border-box',
    opacity: disabled ? 0.55 : 1, transition: 'none',
    ...style,
  });

  const normal  = mk(hover ? G.btnHover : G.btnBg, G.borderLt, G.borderLt, G.borderDk, G.borderDk);
  const press   = mk(G.btnBg,                       G.borderDk, G.borderDk, G.borderLt, G.borderLt);
  const primary = mk(
    pressed ? '#005BA8' : (hover ? '#0061BA' : G.sapBlue),
    pressed ? '#003875' : '#6EB5FF',
    pressed ? '#003875' : '#6EB5FF',
    pressed ? '#6EB5FF' : '#003875',
    pressed ? '#6EB5FF' : '#003875',
    '#fff'
  );
  const danger  = mk(
    pressed ? '#AA0000' : (hover ? '#BB0000' : '#CC0000'),
    pressed ? '#880000' : '#FF8888',
    pressed ? '#880000' : '#FF8888',
    pressed ? '#FF8888' : '#880000',
    pressed ? '#FF8888' : '#880000',
    '#fff'
  );
  const success = mk(
    pressed ? '#005A20' : (hover ? '#006828' : '#007830'),
    pressed ? '#004010' : '#40C070',
    pressed ? '#004010' : '#40C070',
    pressed ? '#40C070' : '#004010',
    pressed ? '#40C070' : '#004010',
    '#fff'
  );

  const styles = { primary, danger, success };

  return (
    <button
      type={type || 'button'} title={title}
      onClick={!disabled ? onClick : undefined} disabled={disabled}
      style={styles[variant] || (pressed ? press : normal)}
      onMouseEnter={() => !disabled && setHover(true)}
      onMouseLeave={() => { setHover(false); setPressed(false); }}
      onMouseDown={() => !disabled && setPressed(true)}
      onMouseUp={() => setPressed(false)}
    >
      {children}
    </button>
  );
}

/* ══════════════════════════════════════════════════════════════
   SapInput
══════════════════════════════════════════════════════════════ */
export function SapInput({ value, onChange, placeholder, type, disabled, readOnly, min, width, style, onFocus, onBlur }) {
  return (
    <input
      type={type || 'text'} value={value ?? ''} onChange={onChange}
      placeholder={placeholder} disabled={disabled} min={min} readOnly={readOnly}
      onFocus={onFocus} onBlur={onBlur}
      style={{
        background: readOnly ? '#F0EDE4' : (disabled ? '#E8E4DC' : G.inputBg),
        border: '1px solid',
        borderTopColor: G.borderDk, borderLeftColor: G.borderDk,
        borderRightColor: G.borderLt, borderBottomColor: G.borderLt,
        padding: '1px 4px', fontSize: G.fs, fontFamily: G.font,
        color: G.text, outline: 'none',
        width: width || '100%', height: 22, boxSizing: 'border-box',
        cursor: readOnly ? 'default' : 'text',
        ...style,
      }}
    />
  );
}

/* ══════════════════════════════════════════════════════════════
   SapSelect
══════════════════════════════════════════════════════════════ */
export function SapSelect({ value, onChange, options, disabled, width }) {
  return (
    <select value={value} onChange={onChange} disabled={disabled}
      style={{
        background: disabled ? '#E8E4DC' : G.inputBg,
        border: '1px solid',
        borderTopColor: G.borderDk, borderLeftColor: G.borderDk,
        borderRightColor: G.borderLt, borderBottomColor: G.borderLt,
        padding: '1px 4px', fontSize: G.fs, fontFamily: G.font,
        color: G.text, outline: 'none', height: 22,
        width: width || '100%', boxSizing: 'border-box', cursor: 'pointer',
      }}>
      {(options || []).map((o, i) => (
        <option key={i} value={o.value ?? o}>{o.label ?? o}</option>
      ))}
    </select>
  );
}

/* ══════════════════════════════════════════════════════════════
   SapTextarea
══════════════════════════════════════════════════════════════ */
export function SapTextarea({ value, onChange, placeholder, rows }) {
  return (
    <textarea value={value ?? ''} onChange={onChange} placeholder={placeholder} rows={rows || 3}
      style={{
        background: G.inputBg, border: '1px solid',
        borderTopColor: G.borderDk, borderLeftColor: G.borderDk,
        borderRightColor: G.borderLt, borderBottomColor: G.borderLt,
        padding: '2px 4px', fontSize: G.fs, fontFamily: G.font,
        color: G.text, outline: 'none', width: '100%', resize: 'vertical',
        boxSizing: 'border-box',
      }}
    />
  );
}

/* ══════════════════════════════════════════════════════════════
   SapPanel — bordered white panel with optional title bar
══════════════════════════════════════════════════════════════ */
export function SapPanel({ title, children, action, style, bodyStyle }) {
  return (
    <div style={{ background: G.panel, border: `1px solid ${G.border}`, ...style }}>
      {title && (
        <div style={{
          background: G.tblHdr, borderBottom: `1px solid ${G.border}`,
          padding: '2px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          minHeight: 22,
        }}>
          <span style={{ fontSize: G.fsSm, fontWeight: 700, color: G.sapNavy, fontFamily: G.font }}>{title}</span>
          {action && <div style={{ display: 'flex', gap: 3 }}>{action}</div>}
        </div>
      )}
      <div style={{ padding: 8, ...bodyStyle }}>{children}</div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   SapTitleBar — transaction header (SAP navy bar)
══════════════════════════════════════════════════════════════ */
export function SapTitleBar({ tcode, title, sub }) {
  return (
    <div style={{
      background: G.sapNavy, color: '#fff',
      padding: '3px 10px', display: 'flex', alignItems: 'center', gap: 10,
      borderBottom: `1px solid ${G.border}`, flexShrink: 0, minHeight: 24,
    }}>
      {tcode && (
        <span style={{
          fontSize: G.fsXs, background: 'rgba(255,255,255,0.15)', padding: '1px 5px',
          fontFamily: G.font, fontWeight: 700, letterSpacing: '0.5px', color: '#fff',
        }}>{tcode}</span>
      )}
      <span style={{ fontSize: '13px', fontWeight: 700, fontFamily: G.font }}>{title}</span>
      {sub && <span style={{ fontSize: G.fsXs, opacity: 0.7, fontFamily: G.font }}>{sub}</span>}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   SapToolbar — standard + application toolbar
══════════════════════════════════════════════════════════════ */
export function SapToolbar({ children, style }) {
  return (
    <div style={{
      background: G.toolbar, borderBottom: `1px solid ${G.border}`,
      padding: '2px 6px', display: 'flex', alignItems: 'center', gap: 2,
      flexShrink: 0, flexWrap: 'wrap', minHeight: 26,
      ...style,
    }}>
      {children}
    </div>
  );
}
export function SapToolbarSep() {
  return <div style={{ width: 1, height: 18, background: G.borderDk, margin: '0 3px', flexShrink: 0 }} />;
}

/* ══════════════════════════════════════════════════════════════
   SapFormGrid — multi-column SAP header form
══════════════════════════════════════════════════════════════ */
export function SapFormGrid({ children, cols = 3, style }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: `repeat(${cols}, 1fr)`,
      gap: '4px 16px', padding: '6px 10px',
      background: G.panel,
      ...style,
    }}>
      {children}
    </div>
  );
}

export function SapField({ label, required, children, span }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      gridColumn: span ? `span ${span}` : undefined, minWidth: 0,
    }}>
      <label style={{
        fontSize: G.fsSm, fontFamily: G.font, color: G.sapNavy, fontWeight: 700,
        whiteSpace: 'nowrap', flexShrink: 0, minWidth: 110,
      }}>
        {label}{required && <span style={{ color: G.error }}>*</span>}:
      </label>
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   SapTabs — flat SAP tab strip
══════════════════════════════════════════════════════════════ */
export function SapTabs({ tabs, active, onChange, children }) {
  return (
    <div>
      <div style={{
        display: 'flex', borderBottom: `1px solid ${G.border}`,
        background: G.toolbar, padding: '3px 4px 0', flexWrap: 'wrap',
      }}>
        {tabs.map(tab => {
          const isAct = tab === active;
          return (
            <button key={tab} onClick={() => onChange(tab)} style={{
              fontFamily: G.font, fontSize: G.fsSm, fontWeight: isAct ? 700 : 400,
              color: isAct ? G.sapNavy : G.muted,
              background: isAct ? G.panel : G.btnBg,
              border: `1px solid ${G.border}`,
              borderBottom: isAct ? `1px solid ${G.panel}` : `1px solid ${G.border}`,
              marginBottom: isAct ? -1 : 0,
              padding: '2px 14px', cursor: 'pointer', marginRight: 2,
              position: 'relative', zIndex: isAct ? 1 : 0,
            }}>
              {tab}
            </button>
          );
        })}
      </div>
      <div style={{ background: G.panel, border: `1px solid ${G.border}`, borderTop: 'none', padding: 8 }}>
        {children}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   SapTable — dense ALV-style grid
══════════════════════════════════════════════════════════════ */
export function SapTable({ cols, rows, onRow, emptyMsg, selected, onSelect, selectable, loading }) {
  return (
    <div style={{ overflowX: 'auto', border: `1px solid ${G.border}` }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: G.font, fontSize: G.fs }}>
        <thead>
          <tr style={{ background: G.tblHdr }}>
            {selectable && (
              <th style={{ width: 22, padding: '2px 4px', border: `1px solid ${G.border}`, borderBottom: `2px solid ${G.borderDk}` }} />
            )}
            {cols.map((c, i) => (
              <th key={i} style={{
                padding: '3px 6px', textAlign: c.right ? 'right' : c.center ? 'center' : 'left',
                color: G.sapNavy, fontWeight: 700, fontSize: G.fsSm,
                border: `1px solid ${G.border}`, borderBottom: `2px solid ${G.borderDk}`,
                whiteSpace: 'nowrap', background: G.tblHdr,
              }}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={cols.length + (selectable ? 1 : 0)}
              style={{ padding: '12px 8px', textAlign: 'center', color: G.muted, fontSize: G.fs, border: `1px solid ${G.border}` }}>
              Loading…
            </td></tr>
          ) : rows.length === 0 ? (
            <tr><td colSpan={cols.length + (selectable ? 1 : 0)}
              style={{ padding: '14px 8px', textAlign: 'center', color: G.muted, fontSize: G.fs, border: `1px solid ${G.border}` }}>
              {emptyMsg || 'No entries found'}
            </td></tr>
          ) : rows.map((row, ri) => {
            const isSel = selected === ri;
            return (
              <tr key={ri}
                onClick={() => { onRow && onRow(row); onSelect && onSelect(ri); }}
                style={{
                  background: isSel ? G.tblSel : (ri % 2 === 0 ? G.panel : G.tblAlt),
                  color: isSel ? '#000' : G.text,
                  cursor: (onRow || onSelect) ? 'pointer' : 'default',
                }}
                onMouseEnter={e => !isSel && (e.currentTarget.style.background = '#D4E8F5')}
                onMouseLeave={e => !isSel && (e.currentTarget.style.background = ri % 2 === 0 ? G.panel : G.tblAlt)}
              >
                {selectable && (
                  <td style={{ padding: '1px 4px', textAlign: 'center', border: `1px solid ${G.border}` }}>
                    <input type="checkbox" checked={isSel} readOnly style={{ cursor: 'pointer' }} />
                  </td>
                )}
                {cols.map((c, ci) => (
                  <td key={ci} style={{
                    padding: '2px 6px', textAlign: c.right ? 'right' : c.center ? 'center' : 'left',
                    color: c.muted ? G.muted : G.text,
                    border: `1px solid ${G.border}`,
                    whiteSpace: c.wrap ? 'normal' : 'nowrap', fontSize: G.fs,
                  }}>
                    {c.render ? c.render(row) : (row[c.key] ?? '')}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   SapStatusBar — traffic light + message + metadata
══════════════════════════════════════════════════════════════ */
export function SapStatusBar({ message, type, companyCode, user, extra }) {
  const [time, setTime] = useState(() => new Date().toLocaleTimeString('en-IN', { hour12: false }));
  useEffect(() => {
    const t = setInterval(() => setTime(new Date().toLocaleTimeString('en-IN', { hour12: false })), 1000);
    return () => clearInterval(t);
  }, []);

  const tlColor = type === 'error' ? G.error : type === 'success' ? G.success : G.warn;

  return (
    <div style={{
      height: 22, background: G.statusBg, borderTop: `1px solid ${G.border}`,
      display: 'flex', alignItems: 'center', padding: '0 6px', gap: 6,
      fontFamily: G.font, fontSize: G.fsXs, color: G.text, flexShrink: 0,
    }}>
      <span style={{ width: 10, height: 10, borderRadius: '50%', background: tlColor, flexShrink: 0, display: 'inline-block', border: `1px solid ${G.borderDk}` }} />
      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{message || 'System ready'}</span>
      <div style={{ display: 'flex', gap: 8, color: G.muted, flexShrink: 0 }}>
        {companyCode && <span>CCode: <strong style={{ color: G.text }}>{companyCode}</strong></span>}
        {user        && <span>| {user}</span>}
        {extra       && <span>| {extra}</span>}
        <span>| {time}</span>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   SapBadge — status indicator (no rounded corners)
══════════════════════════════════════════════════════════════ */
const STATUS_CLR = {
  Planning:'#555', Active:'#007830', Completed:'#0054A6', OnHold:'#B85C00', Cancelled:'#CC0000',
  Draft:'#555', Confirmed:'#0054A6', Invoiced:'#0070D2', Closed:'#007830',
  Open:'#B85C00', Partial:'#0054A6', Received:'#007830',
  Unpaid:'#CC0000', PartiallyPaid:'#B85C00', Paid:'#007830',
  Planned:'#555', InProgress:'#B85C00',
  Posted:'#007830', 'Not Posted':'#B85C00',
  Invoice:'#0054A6', Payment:'#007830', GRN:'#0070D2',
  High:'#CC0000', Medium:'#B85C00', Low:'#555',
  Blocked:'#CC0000', Done:'#007830',
};
export function SapBadge({ status }) {
  const clr = STATUS_CLR[status] || '#555';
  return (
    <span style={{
      display: 'inline-block', padding: '0px 5px', fontSize: G.fsXs, fontWeight: 700,
      fontFamily: G.font, color: clr, background: `${clr}14`,
      border: `1px solid ${clr}60`, whiteSpace: 'nowrap',
    }}>
      {status || '—'}
    </span>
  );
}

/* ══════════════════════════════════════════════════════════════
   SapKpiCard — flat SAP-style metric card
══════════════════════════════════════════════════════════════ */
export function SapKpiCard({ label, value, sub, color, icon }) {
  return (
    <div style={{
      background: G.panel, border: `1px solid ${G.border}`,
      padding: '8px 10px', borderLeft: `3px solid ${color || G.sapBlue}`,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: G.fsXs, color: G.sapNavy, fontWeight: 700, fontFamily: G.font, textTransform: 'uppercase', letterSpacing: '0.4px' }}>{label}</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: G.text, fontFamily: G.font, marginTop: 2 }}>{value}</div>
          {sub && <div style={{ fontSize: G.fsXs, color: G.muted, fontFamily: G.font, marginTop: 1 }}>{sub}</div>}
        </div>
        {icon && <span style={{ fontSize: 18, opacity: 0.4 }}>{icon}</span>}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   SapPageHeader — SAP navy transaction header
══════════════════════════════════════════════════════════════ */
export function SapPageHeader({ title, sub, action, tcode }) {
  return (
    <div style={{
      background: G.sapNavy, color: '#fff',
      padding: '3px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      flexShrink: 0, borderBottom: `1px solid ${G.border}`, minHeight: 26,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {tcode && (
          <span style={{
            fontSize: G.fsXs, background: 'rgba(255,255,255,0.18)', padding: '0px 6px',
            fontFamily: G.font, fontWeight: 700, letterSpacing: '0.5px', border: '1px solid rgba(255,255,255,0.25)',
          }}>{tcode}</span>
        )}
        <span style={{ fontSize: '13px', fontWeight: 700, fontFamily: G.font }}>{title}</span>
        {sub && <span style={{ fontSize: G.fsXs, opacity: 0.7, fontFamily: G.font }}>— {sub}</span>}
      </div>
      {action && <div style={{ display: 'flex', gap: 3 }}>{action}</div>}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   SapFormRow — vertical label+field pair
══════════════════════════════════════════════════════════════ */
export function SapFormRow({ label, required, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
      <label style={{ fontSize: G.fsSm, fontWeight: 700, color: G.sapNavy, fontFamily: G.font }}>
        {label}{required && <span style={{ color: G.error }}> *</span>}
      </label>
      {children}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   SapErrorBox
══════════════════════════════════════════════════════════════ */
export function SapErrorBox({ msg }) {
  if (!msg) return null;
  return (
    <div style={{
      background: G.errorBg, border: `1px solid ${G.error}`,
      padding: '3px 8px', fontSize: G.fs, color: G.error,
      fontFamily: G.font, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 5,
    }}>
      <span style={{ fontWeight: 700, fontSize: 14 }}>⊗</span> {msg}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   SapInfoBox — informational message strip
══════════════════════════════════════════════════════════════ */
export function SapInfoBox({ msg, type }) {
  if (!msg) return null;
  const clr = type === 'error' ? G.error : type === 'success' ? G.success : G.sapNavy;
  const bg  = type === 'error' ? G.errorBg : type === 'success' ? G.successBg : '#EEF4FF';
  return (
    <div style={{
      background: bg, border: `1px solid ${clr}50`,
      padding: '3px 10px', fontSize: G.fs, color: clr,
      fontFamily: G.font, display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0,
    }}>
      <span>{type === 'error' ? '⊗' : type === 'success' ? '✔' : 'ℹ'}</span> {msg}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   Format helpers
══════════════════════════════════════════════════════════════ */
export const fmt     = (n) => `₹${(Number(n) || 0).toFixed(2)}`;
export const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
