/**
 * SAP MODE — Shared UI Primitives (SAP GUI Classic Skin)
 * All SAP pages import from here — updating tokens here changes every screen.
 * Exports match the original API so no page code needs to change.
 */
import React, { useState } from 'react';

/* ══════════════════════════════════════════════════════════════
   C — SAP GUI design tokens
   (same property names as before → zero page-code changes needed)
══════════════════════════════════════════════════════════════ */
export const C = {
  bg:       '#dfe3e8',   /* screen background          was #0F172A */
  surface:  '#ffffff',   /* panel / form background    was #1E293B */
  surface2: '#ECE9D8',   /* toolbar / alt header       was #162032 */
  border:   '#a0a0a0',   /* main border                was #2D3F55 */
  blue:     '#0070D2',   /* SAP blue                   was #4F46E5 */
  text:     '#000000',   /* body text                  was #CBD5E1 */
  muted:    '#555555',   /* secondary text             was #475569 */
  white:    '#000000',   /* "bright" text (now black)  was #F1F5F9 */
  green:    '#007830',   /* success                    was #10B981 */
  red:      '#CC0000',   /* error                      was #EF4444 */
  yellow:   '#B85C00',   /* warning                    was #F59E0B */
  cyan:     '#0070D2',   /* info                       was #06B6D4 */
  font:     "Arial, Helvetica, 'Liberation Sans', sans-serif",
  /* SAP extras */
  sapNavy:  '#003875',
  sapBlue:  '#0070D2',
  btnBg:    '#D4D0C8',
  tblHdr:   '#D6D2C8',
  tblAlt:   '#F8F6F2',
  borderDk: '#808080',
  borderLt: '#ffffff',
};

/* ══════════════════════════════════════════════════════════════
   Panel — SAP bordered panel with grey title bar
══════════════════════════════════════════════════════════════ */
export function Panel({ title, children, action, style }) {
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, ...style }}>
      {title && (
        <div style={{
          background: C.tblHdr, borderBottom: `1px solid ${C.border}`,
          padding: '2px 8px', display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', minHeight: 22,
        }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: C.sapNavy, fontFamily: C.font }}>{title}</span>
          {action && <div style={{ display: 'flex', gap: 3 }}>{action}</div>}
        </div>
      )}
      <div style={{ padding: 8 }}>{children}</div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   KpiCard — flat SAP metric card
══════════════════════════════════════════════════════════════ */
export function KpiCard({ label, value, sub, color, icon }) {
  return (
    <div style={{
      background: C.surface, border: `1px solid ${C.border}`,
      padding: '8px 10px', borderLeft: `3px solid ${color || C.blue}`,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: 10, color: C.sapNavy, fontWeight: 700, fontFamily: C.font, textTransform: 'uppercase', letterSpacing: '0.4px' }}>{label}</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: C.text, fontFamily: C.font, marginTop: 2 }}>{value}</div>
          {sub && <div style={{ fontSize: 10, color: C.muted, fontFamily: C.font, marginTop: 1 }}>{sub}</div>}
        </div>
        {icon && <span style={{ fontSize: 18, opacity: 0.4 }}>{icon}</span>}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   Table — SAP ALV dense grid
══════════════════════════════════════════════════════════════ */
export function Table({ cols, rows, onRow, emptyMsg }) {
  return (
    <div style={{ overflowX: 'auto', border: `1px solid ${C.border}` }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: C.font, fontSize: 12 }}>
        <thead>
          <tr style={{ background: C.tblHdr }}>
            {cols.map((c, i) => (
              <th key={i} style={{
                padding: '3px 6px', textAlign: c.right ? 'right' : 'left',
                color: C.sapNavy, fontWeight: 700, fontSize: 11,
                border: `1px solid ${C.border}`, borderBottom: `2px solid ${C.borderDk}`,
                whiteSpace: 'nowrap',
              }}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0
            ? (
              <tr><td colSpan={cols.length}
                style={{ padding: '16px 8px', textAlign: 'center', color: C.muted, fontSize: 12, border: `1px solid ${C.border}` }}>
                {emptyMsg || 'No entries found'}
              </td></tr>
            )
            : rows.map((row, ri) => (
              <tr key={ri}
                onClick={() => onRow && onRow(row)}
                style={{
                  background: ri % 2 === 0 ? C.surface : C.tblAlt,
                  cursor: onRow ? 'pointer' : 'default',
                  borderBottom: `1px solid ${C.border}`,
                }}
                onMouseEnter={e => onRow && (e.currentTarget.style.background = '#D4E8F5')}
                onMouseLeave={e => onRow && (e.currentTarget.style.background = ri % 2 === 0 ? C.surface : C.tblAlt)}
              >
                {cols.map((c, ci) => (
                  <td key={ci} style={{
                    padding: '2px 6px', color: c.muted ? C.muted : C.text,
                    textAlign: c.right ? 'right' : 'left',
                    border: `1px solid ${C.border}`, whiteSpace: c.wrap ? 'normal' : 'nowrap',
                    fontSize: 12,
                  }}>
                    {c.render ? c.render(row) : (row[c.key] ?? '')}
                  </td>
                ))}
              </tr>
            ))
          }
        </tbody>
      </table>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   Badge — SAP status indicator
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
export function Badge({ status }) {
  const clr = STATUS_CLR[status] || '#555';
  return (
    <span style={{
      display: 'inline-block', padding: '0px 5px', fontSize: 10, fontWeight: 700,
      fontFamily: C.font, color: clr, background: `${clr}14`,
      border: `1px solid ${clr}60`, whiteSpace: 'nowrap',
    }}>
      {status || '—'}
    </span>
  );
}

/* ══════════════════════════════════════════════════════════════
   Btn — 3-D raised SAP button
══════════════════════════════════════════════════════════════ */
export function Btn({ children, onClick, variant, disabled, type, small, style }) {
  const [pressed, setPressed] = useState(false);
  const [hover,   setHover]   = useState(false);

  const base = {
    fontFamily: C.font, fontWeight: 400, cursor: disabled ? 'default' : 'pointer',
    fontSize: small ? 11 : 12, padding: small ? '1px 6px' : '1px 8px',
    height: small ? 20 : 22, minWidth: 40,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 3,
    background: disabled ? '#E8E4DC' : (hover ? C.btnHover || '#C4C0B8' : C.btnBg),
    color: disabled ? '#888' : C.text,
    border: '1px solid',
    borderTopColor:    pressed ? C.borderDk : C.borderLt,
    borderLeftColor:   pressed ? C.borderDk : C.borderLt,
    borderRightColor:  pressed ? C.borderLt : C.borderDk,
    borderBottomColor: pressed ? C.borderLt : C.borderDk,
    userSelect: 'none', whiteSpace: 'nowrap', boxSizing: 'border-box',
    opacity: disabled ? 0.55 : 1,
    ...style,
  };

  const variantStyles = {
    primary:  { ...base, background: pressed ? '#005BA8' : (hover ? '#0061BA' : C.sapBlue), color: '#fff', borderTopColor: pressed ? '#003875' : '#6EB5FF', borderLeftColor: pressed ? '#003875' : '#6EB5FF', borderRightColor: pressed ? '#6EB5FF' : '#003875', borderBottomColor: pressed ? '#6EB5FF' : '#003875' },
    secondary:{ ...base },
    danger:   { ...base, background: pressed ? '#AA0000' : (hover ? '#BB0000' : '#CC0000'), color: '#fff', borderTopColor: pressed ? '#880000' : '#FF8888', borderLeftColor: pressed ? '#880000' : '#FF8888', borderRightColor: pressed ? '#FF8888' : '#880000', borderBottomColor: pressed ? '#FF8888' : '#880000' },
    success:  { ...base, background: pressed ? '#005A20' : (hover ? '#006828' : '#007830'), color: '#fff', borderTopColor: pressed ? '#004010' : '#40C070', borderLeftColor: pressed ? '#004010' : '#40C070', borderRightColor: pressed ? '#40C070' : '#004010', borderBottomColor: pressed ? '#40C070' : '#004010' },
  };

  return (
    <button type={type || 'button'} onClick={!disabled ? onClick : undefined} disabled={disabled}
      style={variantStyles[variant] || base}
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
   PageHeader — SAP navy transaction header
══════════════════════════════════════════════════════════════ */
export function PageHeader({ title, sub, action, tcode }) {
  return (
    <div style={{
      background: C.sapNavy, color: '#fff',
      padding: '3px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      flexShrink: 0, borderBottom: `1px solid ${C.border}`, minHeight: 26,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {tcode && (
          <span style={{
            fontSize: 10, background: 'rgba(255,255,255,0.18)', padding: '0px 6px',
            fontFamily: C.font, fontWeight: 700, letterSpacing: '0.5px',
            border: '1px solid rgba(255,255,255,0.25)',
          }}>{tcode}</span>
        )}
        <span style={{ fontSize: 13, fontWeight: 700, fontFamily: C.font }}>{title}</span>
        {sub && <span style={{ fontSize: 10, opacity: 0.7, fontFamily: C.font }}>— {sub}</span>}
      </div>
      {action && <div style={{ display: 'flex', gap: 3 }}>{action}</div>}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   FormRow — vertical label+field pair
══════════════════════════════════════════════════════════════ */
export function FormRow({ label, required, children, half }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: half ? '0 0 calc(50% - 6px)' : 1, minWidth: 160 }}>
      <label style={{ fontSize: 11, fontWeight: 700, color: C.sapNavy, fontFamily: C.font }}>
        {label}{required && <span style={{ color: C.red }}> *</span>}
      </label>
      {children}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   Input — SAP classic input field
══════════════════════════════════════════════════════════════ */
export function Input({ value, onChange, placeholder, type, disabled, min, readOnly }) {
  return (
    <input
      type={type || 'text'} value={value ?? ''} onChange={onChange}
      placeholder={placeholder} disabled={disabled} min={min} readOnly={readOnly}
      style={{
        background: readOnly ? '#F0EDE4' : (disabled ? '#E8E4DC' : '#ffffff'),
        border: '1px solid',
        borderTopColor: C.borderDk, borderLeftColor: C.borderDk,
        borderRightColor: C.borderLt, borderBottomColor: C.borderLt,
        padding: '1px 4px', fontSize: 12, fontFamily: C.font,
        color: C.text, outline: 'none',
        width: '100%', height: 22, boxSizing: 'border-box',
      }}
      onFocus={e => (e.target.style.outline = `1px solid ${C.sapBlue}`)}
      onBlur={e  => (e.target.style.outline = 'none')}
    />
  );
}

/* ══════════════════════════════════════════════════════════════
   Select — SAP classic select
══════════════════════════════════════════════════════════════ */
export function Select({ value, onChange, options, disabled }) {
  return (
    <select value={value} onChange={onChange} disabled={disabled}
      style={{
        background: disabled ? '#E8E4DC' : '#ffffff',
        border: '1px solid',
        borderTopColor: C.borderDk, borderLeftColor: C.borderDk,
        borderRightColor: C.borderLt, borderBottomColor: C.borderLt,
        padding: '1px 4px', fontSize: 12, fontFamily: C.font,
        color: C.text, outline: 'none', height: 22,
        width: '100%', boxSizing: 'border-box', cursor: 'pointer',
      }}>
      {(options || []).map((o, i) => (
        <option key={i} value={o.value ?? o}>{o.label ?? o}</option>
      ))}
    </select>
  );
}

/* ══════════════════════════════════════════════════════════════
   Textarea — SAP classic textarea
══════════════════════════════════════════════════════════════ */
export function Textarea({ value, onChange, placeholder, rows }) {
  return (
    <textarea value={value ?? ''} onChange={onChange} placeholder={placeholder} rows={rows || 3}
      style={{
        background: '#ffffff',
        border: '1px solid',
        borderTopColor: C.borderDk, borderLeftColor: C.borderDk,
        borderRightColor: C.borderLt, borderBottomColor: C.borderLt,
        padding: '2px 4px', fontSize: 12, fontFamily: C.font,
        color: C.text, outline: 'none', width: '100%', resize: 'vertical',
        boxSizing: 'border-box',
      }}
    />
  );
}

/* ══════════════════════════════════════════════════════════════
   Spinner
══════════════════════════════════════════════════════════════ */
export function Spinner() {
  return (
    <div style={{ textAlign: 'center', padding: 30, color: C.muted, fontSize: 12, fontFamily: C.font }}>
      Please wait…
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   ErrorBox — SAP error message strip
══════════════════════════════════════════════════════════════ */
export function ErrorBox({ msg }) {
  if (!msg) return null;
  return (
    <div style={{
      background: '#FFF0F0', border: `1px solid ${C.red}`,
      padding: '3px 8px', fontSize: 12, color: C.red,
      fontFamily: C.font, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 5,
    }}>
      <span style={{ fontWeight: 700, fontSize: 14 }}>⊗</span> {msg}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   Format helpers
══════════════════════════════════════════════════════════════ */
export const fmt     = (n) => `₹${(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
export const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
