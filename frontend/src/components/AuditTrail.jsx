import React from 'react';

const F = "'Inter', -apple-system, BlinkMacSystemFont, sans-serif";

const ACTION_META = {
  created:        { label: 'Created',          color: '#059669', bg: '#f0fdf4', border: '#bbf7d0', dot: '#059669' },
  edited:         { label: 'Edited',            color: '#2563eb', bg: '#eff6ff', border: '#bfdbfe', dot: '#2563eb' },
  approved:       { label: 'Approved',          color: '#059669', bg: '#f0fdf4', border: '#bbf7d0', dot: '#059669' },
  rejected:       { label: 'Rejected',          color: '#dc2626', bg: '#fef2f2', border: '#fecaca', dot: '#dc2626' },
  submitted:      { label: 'Submitted',         color: '#7c3aed', bg: '#f5f3ff', border: '#ddd6fe', dot: '#7c3aed' },
  status_changed: { label: 'Status Changed',    color: '#d97706', bg: '#fffbeb', border: '#fde68a', dot: '#d97706' },
};

const DEFAULT_META = { label: 'Updated', color: '#6b7280', bg: '#f9fafb', border: '#e5e7eb', dot: '#9ca3af' };

function fmtDT(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true });
}

export default function AuditTrail({ audit, title = 'Activity Log', compact = false }) {
  if (!Array.isArray(audit) || audit.length === 0) {
    return (
      <div style={{ fontFamily: F, border: '1px solid #E5EAF2', borderRadius: 8, overflow: 'hidden' }}>
        <div style={{ padding: '10px 14px', background: '#f8fafc', borderBottom: '1px solid #E5EAF2', fontSize: 12, fontWeight: 700, color: '#374151' }}>
          {title}
        </div>
        <div style={{ padding: '16px 14px', fontSize: 11, color: '#9ca3af', textAlign: 'center', fontStyle: 'italic' }}>
          No activity recorded yet
        </div>
      </div>
    );
  }

  const entries = [...audit].reverse(); // newest first

  return (
    <div style={{ fontFamily: F, border: '1px solid #E5EAF2', borderRadius: 8, overflow: 'hidden' }}>
      <div style={{ padding: '10px 14px', background: '#f8fafc', borderBottom: '1px solid #E5EAF2', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#374151' }}>{title}</span>
        <span style={{ fontSize: 10, color: '#9ca3af', background: '#e5e7eb', borderRadius: 10, padding: '1px 7px', fontWeight: 600 }}>{audit.length}</span>
      </div>
      <div style={{ padding: compact ? '8px 14px' : '12px 14px', display: 'flex', flexDirection: 'column', gap: compact ? 6 : 10 }}>
        {entries.map((entry, i) => {
          const meta = ACTION_META[entry.action] || DEFAULT_META;
          const by = entry.by || {};
          const name = by.name || by.username || 'Unknown';
          return (
            <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              {/* Timeline dot */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 2, flexShrink: 0 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: meta.dot, flexShrink: 0 }} />
                {i < entries.length - 1 && <div style={{ width: 1, flex: 1, background: '#e5e7eb', marginTop: 4, minHeight: compact ? 14 : 18 }} />}
              </div>
              {/* Content */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: meta.color, background: meta.bg, border: `1px solid ${meta.border}`, borderRadius: 4, padding: '1px 6px', textTransform: 'uppercase', letterSpacing: '0.4px', flexShrink: 0 }}>
                    {meta.label}
                  </span>
                  {entry.action === 'status_changed' && entry.from && entry.to && (
                    <span style={{ fontSize: 10, color: '#6b7280' }}>
                      <span style={{ background: '#f1f5f9', padding: '1px 5px', borderRadius: 3 }}>{entry.from}</span>
                      {' → '}
                      <span style={{ background: '#f1f5f9', padding: '1px 5px', borderRadius: 3 }}>{entry.to}</span>
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 11, color: '#374151', marginTop: 3 }}>
                  <span style={{ fontWeight: 600 }}>{name}</span>
                  {by.role && <span style={{ color: '#9ca3af', marginLeft: 4 }}>({by.role})</span>}
                </div>
                <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 2 }}>{fmtDT(entry.at)}</div>
                {entry.note && <div style={{ fontSize: 10, color: '#6b7280', marginTop: 3, fontStyle: 'italic' }}>{entry.note}</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
