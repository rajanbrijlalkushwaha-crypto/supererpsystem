/**
 * Finacle UI Component Kit
 * Reusable components for all ERP screens.
 *
 * Usage:
 *   import { FnScreen, FnTitleBar, FnActionBar, FnFormPanel,
 *            FnFormRow, FnTable, FnFKeyBar, FnBtn, FnBadge } from '../components/finacle';
 */
import React, { useState } from 'react';

/* ══════════════════════════════════════════════════════════════
   FnScreen — full-height screen wrapper
══════════════════════════════════════════════════════════════ */
export function FnScreen({ children, style }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      height: '100%', background: '#f0f0f0',
      overflow: 'hidden', fontFamily: 'Arial, Segoe UI, sans-serif',
      ...style,
    }}>
      {children}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   FnTitleBar — navy title bar with screen name + right actions
══════════════════════════════════════════════════════════════ */
export function FnTitleBar({ title, right, tcode }) {
  return (
    <div style={{
      background: '#1a4a7a', color: '#fff',
      padding: '2px 8px', fontSize: 12, fontWeight: 700,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      flexShrink: 0, borderBottom: '1px solid #0d2f50', minHeight: 24,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {tcode && (
          <span style={{
            fontSize: 10, background: 'rgba(255,255,255,0.2)',
            padding: '0 6px', fontWeight: 700, border: '1px solid rgba(255,255,255,0.3)',
            letterSpacing: 0.5,
          }}>{tcode}</span>
        )}
        <span>{title}</span>
      </div>
      {right && <div style={{ display: 'flex', gap: 4 }}>{right}</div>}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   FnActionBar — grey toolbar with buttons
══════════════════════════════════════════════════════════════ */
export function FnActionBar({ children, right }) {
  return (
    <div style={{
      background: '#e8e8e8', borderBottom: '1px solid #b8b8b8',
      padding: '2px 6px', display: 'flex', alignItems: 'center',
      gap: 4, flexShrink: 0, minHeight: 26, flexWrap: 'wrap',
    }}>
      {children}
      {right && <><div style={{ flex: 1 }} />{right}</>}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   FnBtn — classic rectangular button
══════════════════════════════════════════════════════════════ */
export function FnBtn({ children, onClick, variant = 'default', disabled, type, title }) {
  const styles = {
    default: { background: '#d8d8d8', border: '1px solid #888', color: '#000' },
    primary: { background: '#1a4a7a', border: '1px solid #0d2f50', color: '#fff', fontWeight: 700 },
    danger:  { background: '#cc2200', border: '1px solid #991100', color: '#fff', fontWeight: 700 },
    success: { background: '#006620', border: '1px solid #004410', color: '#fff', fontWeight: 700 },
    warning: { background: '#d8a000', border: '1px solid #aa7800', color: '#fff', fontWeight: 700 },
  };
  const s = styles[variant] || styles.default;
  return (
    <button type={type || 'button'} onClick={onClick} disabled={disabled} title={title}
      style={{
        ...s, padding: '1px 10px', fontSize: 11, fontFamily: 'Arial, sans-serif',
        cursor: disabled ? 'default' : 'pointer', height: 22,
        borderRadius: 0, whiteSpace: 'nowrap',
        opacity: disabled ? 0.5 : 1,
      }}>
      {children}
    </button>
  );
}

/* ══════════════════════════════════════════════════════════════
   FnBtnSep — vertical separator between buttons
══════════════════════════════════════════════════════════════ */
export function FnBtnSep() {
  return <div style={{ width: 1, height: 16, background: '#aaa', margin: '0 2px', alignSelf: 'center', flexShrink: 0 }} />;
}

/* ══════════════════════════════════════════════════════════════
   FnFormPanel — white bordered form container
══════════════════════════════════════════════════════════════ */
export function FnFormPanel({ title, children, style }) {
  return (
    <div style={{
      background: '#fff', border: '1px solid #b0b0b0',
      margin: '4px 6px', flexShrink: 0, ...style,
    }}>
      {title && (
        <div style={{
          background: '#3a6a9a', color: '#fff',
          fontSize: 11, fontWeight: 700, padding: '2px 8px',
          borderBottom: '1px solid #1a4a7a',
        }}>
          {title}
        </div>
      )}
      {children}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   FnFormGrid — compact multi-column grid of label+input rows
   cols: number of columns (default 2)
══════════════════════════════════════════════════════════════ */
export function FnFormGrid({ cols = 2, children, style }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: `repeat(${cols}, 1fr)`,
      padding: '2px 6px',
      ...style,
    }}>
      {children}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   FnFormRow — single label + input row inside a grid cell
══════════════════════════════════════════════════════════════ */
export function FnFormRow({ label, required, labelW = 110, children, fullSpan }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center',
      minHeight: 22, borderBottom: '1px solid #ebebeb',
      padding: '1px 2px',
      gridColumn: fullSpan ? '1 / -1' : undefined,
    }}>
      <label style={{
        fontSize: 11, fontWeight: 700, color: '#000',
        minWidth: labelW, maxWidth: labelW,
        padding: '0 6px 0 0', textAlign: 'right', flexShrink: 0,
      }}>
        {label}{required && <span style={{ color: '#cc0000' }}>*</span>}
      </label>
      <div style={{ flex: 1, display: 'flex', gap: 4, alignItems: 'center' }}>
        {children}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   FnInput — Finacle-style input
══════════════════════════════════════════════════════════════ */
export function FnInput({ value, onChange, type = 'text', placeholder, readOnly, disabled, min, max, style, onKeyDown }) {
  return (
    <input
      type={type} value={value ?? ''} onChange={onChange}
      placeholder={placeholder} readOnly={readOnly} disabled={disabled}
      min={min} max={max} onKeyDown={onKeyDown}
      style={{
        height: 20, padding: '0 4px',
        border: '1px solid #888', borderRadius: 0,
        fontSize: 12, fontFamily: 'Arial, sans-serif', color: '#000',
        background: readOnly ? '#f0f0f0' : (disabled ? '#e8e8e8' : '#fff'),
        outline: 'none', flex: 1, boxSizing: 'border-box',
        ...style,
      }}
      onFocus={e => { if (!readOnly && !disabled) e.target.style.borderColor = '#1a4a7a'; }}
      onBlur={e => (e.target.style.borderColor = '#888')}
    />
  );
}

/* ══════════════════════════════════════════════════════════════
   FnSelect — Finacle-style select
══════════════════════════════════════════════════════════════ */
export function FnSelect({ value, onChange, options = [], disabled, style }) {
  return (
    <select value={value} onChange={onChange} disabled={disabled}
      style={{
        height: 20, padding: '0 2px',
        border: '1px solid #888', borderRadius: 0,
        fontSize: 12, fontFamily: 'Arial, sans-serif', color: '#000',
        background: disabled ? '#e8e8e8' : '#fff',
        outline: 'none', flex: 1, cursor: 'pointer', boxSizing: 'border-box',
        ...style,
      }}
      onFocus={e => (e.target.style.borderColor = '#1a4a7a')}
      onBlur={e => (e.target.style.borderColor = '#888')}
    >
      {options.map((o, i) => (
        <option key={i} value={o.value ?? o}>{o.label ?? o}</option>
      ))}
    </select>
  );
}

/* ══════════════════════════════════════════════════════════════
   FnTextarea — Finacle-style textarea
══════════════════════════════════════════════════════════════ */
export function FnTextarea({ value, onChange, placeholder, rows = 3 }) {
  return (
    <textarea value={value ?? ''} onChange={onChange} placeholder={placeholder} rows={rows}
      style={{
        padding: '2px 4px', border: '1px solid #888', borderRadius: 0,
        fontSize: 12, fontFamily: 'Arial, sans-serif', color: '#000',
        background: '#fff', outline: 'none', flex: 1, resize: 'vertical',
        boxSizing: 'border-box',
      }}
      onFocus={e => (e.target.style.borderColor = '#1a4a7a')}
      onBlur={e => (e.target.style.borderColor = '#888')}
    />
  );
}

/* ══════════════════════════════════════════════════════════════
   FnTable — dense ALV-style data table
   cols: [{ key, label, right, width, render }]
   rows: array of objects
══════════════════════════════════════════════════════════════ */
export function FnTable({ cols, rows, onRow, selected, emptyMsg, footer, searchable, tableStyle }) {
  const [q, setQ] = useState('');

  const filtered = searchable && q
    ? rows.filter(r => Object.values(r).some(v => String(v ?? '').toLowerCase().includes(q.toLowerCase())))
    : rows;

  return (
    <div style={{ background: '#fff', border: '1px solid #b0b0b0', margin: '4px 6px', flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {searchable && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '2px 6px', background: '#f0f0f0', borderBottom: '1px solid #c8c8c8', flexShrink: 0 }}>
          <span style={{ fontSize: 10, color: '#555' }}>🔍</span>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search…"
            style={{ border: '1px solid #888', borderRadius: 0, fontSize: 11, fontFamily: 'Arial', height: 20, padding: '0 4px', outline: 'none', width: 180 }}
            onFocus={e => (e.target.style.borderColor = '#1a4a7a')}
            onBlur={e => (e.target.style.borderColor = '#888')}
          />
          {q && <button onClick={() => setQ('')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: '#888' }}>✕</button>}
          <span style={{ marginLeft: 'auto', fontSize: 10, color: '#666' }}>{filtered.length} record{filtered.length !== 1 ? 's' : ''}</span>
        </div>
      )}
      <div style={{ flex: 1, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, fontFamily: 'Arial, sans-serif', ...tableStyle }}>
          <thead style={{ position: 'sticky', top: 0, zIndex: 2 }}>
            <tr style={{ background: '#1a4a7a' }}>
              {cols.map((c, i) => (
                <th key={i} style={{
                  padding: '3px 6px', color: '#fff', fontWeight: 700, fontSize: 11,
                  textAlign: c.right ? 'right' : 'left',
                  borderRight: i < cols.length - 1 ? '1px solid #2a5a8a' : 'none',
                  whiteSpace: 'nowrap',
                  width: c.width,
                }}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0
              ? (
                <tr>
                  <td colSpan={cols.length} style={{ padding: '12px 8px', textAlign: 'center', color: '#666', fontSize: 11, border: '1px solid #e8e8e8' }}>
                    {emptyMsg || 'No records found'}
                  </td>
                </tr>
              )
              : filtered.map((row, ri) => {
                const isSel = selected !== undefined && (row.id === selected || ri === selected);
                return (
                  <tr key={ri}
                    onClick={() => onRow && onRow(row, ri)}
                    style={{
                      background: isSel ? '#b8d4f0' : (ri % 2 === 0 ? '#fff' : '#f5f8fc'),
                      cursor: onRow ? 'pointer' : 'default',
                    }}
                    onMouseEnter={e => { if (!isSel) e.currentTarget.style.background = '#d0e4f8'; }}
                    onMouseLeave={e => { if (!isSel) e.currentTarget.style.background = ri % 2 === 0 ? '#fff' : '#f5f8fc'; }}
                  >
                    {cols.map((c, ci) => (
                      <td key={ci} style={{
                        padding: '2px 6px',
                        borderBottom: '1px solid #e8e8e8',
                        borderRight: ci < cols.length - 1 ? '1px solid #ebebeb' : 'none',
                        textAlign: c.right ? 'right' : 'left',
                        whiteSpace: c.wrap ? 'normal' : 'nowrap',
                        fontSize: 11,
                      }}>
                        {c.render ? c.render(row) : (row[c.key] ?? '')}
                      </td>
                    ))}
                  </tr>
                );
              })
            }
          </tbody>
          {footer && (
            <tfoot>
              <tr style={{ background: '#f0f0f0', borderTop: '2px solid #aaa' }}>
                {footer}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   FnBadge — flat status badge
══════════════════════════════════════════════════════════════ */
const BADGE_MAP = {
  Active:'green', Posted:'green', Approved:'green', Paid:'green', Completed:'green', Done:'green', Received:'green',
  Pending:'blue', Draft:'grey', Open:'yellow', InProgress:'yellow', 'Not Posted':'yellow', Partial:'yellow', Unpaid:'red',
  Cancelled:'red', Rejected:'red', Blocked:'red', OnHold:'yellow',
  Planning:'grey', Planned:'grey',
};
export function FnBadge({ status }) {
  const type = BADGE_MAP[status] || 'grey';
  const colors = {
    green:  { bg: '#e0f5e0', color: '#005500', border: '#44aa44' },
    red:    { bg: '#ffe0e0', color: '#880000', border: '#cc4444' },
    blue:   { bg: '#d8eeff', color: '#003875', border: '#88aacc' },
    yellow: { bg: '#fff8cc', color: '#664400', border: '#ccaa00' },
    grey:   { bg: '#f0f0f0', color: '#444444', border: '#aaaaaa' },
  }[type];
  return (
    <span style={{
      display: 'inline-block', padding: '0 5px', fontSize: 10, fontWeight: 700,
      fontFamily: 'Arial, sans-serif', border: `1px solid ${colors.border}`,
      background: colors.bg, color: colors.color,
      textTransform: 'uppercase', letterSpacing: 0.2,
    }}>
      {status || '—'}
    </span>
  );
}

/* ══════════════════════════════════════════════════════════════
   FnFKeyBar — bottom function key bar
   keys: [{ key: 'F1', label: 'Help', onClick, href }]
   status: string (right side message)
══════════════════════════════════════════════════════════════ */
export function FnFKeyBar({ keys = [], status }) {
  return (
    <div style={{
      background: '#2a2a2a', height: 20,
      display: 'flex', alignItems: 'stretch',
      flexShrink: 0, borderTop: '1px solid #111', overflow: 'hidden',
    }}>
      {keys.map((k, i) => {
        const Tag = k.href ? 'a' : 'div';
        return (
          <Tag key={i} href={k.href} onClick={k.onClick}
            style={{
              display: 'flex', alignItems: 'center', padding: '0 8px',
              fontSize: 10, fontFamily: 'Arial, sans-serif',
              color: '#e0e0e0', borderRight: '1px solid #444',
              whiteSpace: 'nowrap', cursor: k.onClick || k.href ? 'pointer' : 'default',
              gap: 3, textDecoration: 'none',
            }}
            onMouseEnter={e => { if (k.onClick || k.href) e.currentTarget.style.background = '#1a4a7a'; }}
            onMouseLeave={e => (e.currentTarget.style.background = '')}
          >
            <span style={{ fontWeight: 700, color: '#ffd700', fontSize: 10 }}>{k.key}</span>
            <span style={{ color: '#c8c8c8' }}>{k.label}</span>
          </Tag>
        );
      })}
      <div style={{ flex: 1 }} />
      {status && (
        <div style={{
          display: 'flex', alignItems: 'center', padding: '0 10px',
          fontSize: 10, color: '#a0a0a0', gap: 8, borderLeft: '1px solid #444',
        }}>
          {status}
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   FnErrorBar — error strip (inline, not blocking)
══════════════════════════════════════════════════════════════ */
export function FnErrorBar({ msg }) {
  if (!msg) return null;
  return (
    <div style={{
      background: '#ffe0e0', border: '1px solid #cc4444',
      borderLeft: '3px solid #cc0000', padding: '3px 8px',
      fontSize: 11, color: '#880000', fontFamily: 'Arial, sans-serif',
      fontWeight: 700, flexShrink: 0, margin: '2px 6px',
      display: 'flex', alignItems: 'center', gap: 5,
    }}>
      ⊗ {msg}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   FnSuccessBar — success strip
══════════════════════════════════════════════════════════════ */
export function FnSuccessBar({ msg }) {
  if (!msg) return null;
  return (
    <div style={{
      background: '#d8f0d8', border: '1px solid #44aa44',
      borderLeft: '3px solid #008800', padding: '3px 8px',
      fontSize: 11, color: '#005500', fontFamily: 'Arial, sans-serif',
      fontWeight: 700, flexShrink: 0, margin: '2px 6px',
      display: 'flex', alignItems: 'center', gap: 5,
    }}>
      ✔ {msg}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   FnSpinner
══════════════════════════════════════════════════════════════ */
export function FnSpinner() {
  return (
    <div style={{ textAlign: 'center', padding: 20, fontSize: 12, color: '#1a4a7a', fontFamily: 'Arial' }}>
      Please wait…
    </div>
  );
}

/* Format helpers */
export const fnFmt     = (n) => `₹${(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const fnFmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
