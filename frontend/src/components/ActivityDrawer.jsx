import React from 'react';

const F = "'Inter', -apple-system, BlinkMacSystemFont, sans-serif";

const ACTION_META = {
  created:        { label: 'Created',        color: '#059669', bg: '#f0fdf4', border: '#bbf7d0' },
  edited:         { label: 'Edited',          color: '#2563eb', bg: '#eff6ff', border: '#bfdbfe' },
  approved:       { label: 'Approved',        color: '#059669', bg: '#f0fdf4', border: '#bbf7d0' },
  rejected:       { label: 'Rejected',        color: '#dc2626', bg: '#fef2f2', border: '#fecaca' },
  submitted:      { label: 'Submitted',       color: '#7c3aed', bg: '#f5f3ff', border: '#ddd6fe' },
  status_changed: { label: 'Status Changed',  color: '#d97706', bg: '#fffbeb', border: '#fde68a' },
};
const DEFAULT_META = { label: 'Updated', color: '#6b7280', bg: '#f9fafb', border: '#e5e7eb' };

const TYPE_META = {
  so:     { label: 'Sales Order',    color: '#2563eb',  bg: '#eff6ff'  },
  po:     { label: 'Purchase Order', color: '#ea580c',  bg: '#fff7ed'  },
  sb:     { label: 'Sales Bill',     color: '#7c3aed',  bg: '#f5f3ff'  },
  pb:     { label: 'Purchase Bill',  color: '#d97706',  bg: '#fffbeb'  },
  pay:    { label: 'Payment',        color: '#dc2626',  bg: '#fef2f2'  },
  rcpt:   { label: 'Receipt',        color: '#059669',  bg: '#f0fdf4'  },
  client: { label: 'Client',         color: '#0369a1',  bg: '#f0f9ff'  },
  vendor: { label: 'Vendor',         color: '#7c3aed',  bg: '#f5f3ff'  },
  cn:     { label: 'Credit Note',    color: '#6d28d9',  bg: '#f5f3ff'  },
  dn:     { label: 'Debit Note',     color: '#0f766e',  bg: '#f0fdfa'  },
};

function fmtDT(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return d.toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
}

export default function ActivityDrawer({ record, recordType = 'so', recordLabel, onClose }) {
  const open = !!record;
  const audit = record?.audit || [];
  const entries = [...audit].reverse(); // newest first
  const tm = TYPE_META[recordType] || { label: recordType, color: '#374151', bg: '#f9fafb' };

  const label = recordLabel
    || record?.orderNo  || record?.poNo     || record?.poNumber
    || record?.billNo   || record?.cnNo     || record?.dnNo
    || record?.companyName || record?.vendorName || record?.clientName
    || (record?.billId    ? `#${record.billId}`    : null)
    || (record?.orderId   ? `#${record.orderId}`   : null)
    || (record?.clientId  ? `#${record.clientId}`  : null)
    || (record?.vendorId  ? `#${record.vendorId}`  : null)
    || (record?.paymentId ? `#${record.paymentId}` : null)
    || '—';

  return (
    <>
      {/* backdrop */}
      {open && (
        <div
          onClick={onClose}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.18)', zIndex: 1100 }}
        />
      )}

      {/* drawer */}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0,
        width: 360,
        background: '#fff',
        boxShadow: '-4px 0 24px rgba(0,0,0,0.13)',
        zIndex: 1101,
        fontFamily: F,
        display: 'flex', flexDirection: 'column',
        transform: open ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 0.25s cubic-bezier(0.4,0,0.2,1)',
      }}>

        {/* Header */}
        <div style={{ padding: '14px 16px', borderBottom: '1px solid #E5EAF2', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#111' }}>Activity Log</div>
            {record && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: tm.color, background: tm.bg, border: `1px solid ${tm.color}33`, borderRadius: 4, padding: '1px 7px', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                  {tm.label}
                </span>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#374151' }}>{label}</span>
              </div>
            )}
          </div>
          <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid #E5EAF2', background: '#f8fafc', cursor: 'pointer', fontSize: 14, color: '#6b7280', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>✕</button>
        </div>

        {/* Count bar */}
        {open && (
          <div style={{ padding: '8px 16px', background: '#f8fafc', borderBottom: '1px solid #E5EAF2', fontSize: 11, color: '#6b7280', flexShrink: 0 }}>
            {entries.length === 0 ? 'No activity recorded yet' : `${entries.length} event${entries.length !== 1 ? 's' : ''} · newest first`}
          </div>
        )}

        {/* Timeline */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
          {entries.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: '#9ca3af' }}>
              <div style={{ fontSize: 32, marginBottom: 10 }}>📋</div>
              <div style={{ fontSize: 12, fontWeight: 600 }}>No activity yet</div>
              <div style={{ fontSize: 11, marginTop: 4 }}>Activity is recorded when records are created, edited or approved</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {entries.map((entry, i) => {
                const meta = ACTION_META[entry.action] || DEFAULT_META;
                const by = entry.by || {};
                const name = by.name || by.username || 'Unknown';
                const isLast = i === entries.length - 1;
                return (
                  <div key={i} style={{ display: 'flex', gap: 12, paddingBottom: isLast ? 0 : 18, position: 'relative' }}>
                    {/* line */}
                    {!isLast && (
                      <div style={{ position: 'absolute', left: 11, top: 22, bottom: 0, width: 1, background: '#e5e7eb' }} />
                    )}
                    {/* dot */}
                    <div style={{ width: 23, height: 23, borderRadius: '50%', background: meta.bg, border: `2px solid ${meta.color}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, zIndex: 1 }}>
                      <div style={{ width: 7, height: 7, borderRadius: '50%', background: meta.color }} />
                    </div>
                    {/* content */}
                    <div style={{ flex: 1, minWidth: 0, paddingTop: 2 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: meta.color, background: meta.bg, border: `1px solid ${meta.border}`, borderRadius: 4, padding: '1px 7px', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                          {meta.label}
                        </span>
                        {entry.action === 'status_changed' && entry.from && entry.to && (
                          <span style={{ fontSize: 10, color: '#6b7280' }}>
                            <span style={{ background: '#f1f5f9', padding: '1px 5px', borderRadius: 3, fontWeight: 600 }}>{entry.from}</span>
                            {' → '}
                            <span style={{ background: '#f1f5f9', padding: '1px 5px', borderRadius: 3, fontWeight: 600 }}>{entry.to}</span>
                          </span>
                        )}
                      </div>
                      <div style={{ marginTop: 5, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ width: 24, height: 24, borderRadius: '50%', background: '#e0e7ff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, color: '#3730a3', flexShrink: 0 }}>
                          {name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 700, color: '#111' }}>{name}</div>
                          {by.role && <div style={{ fontSize: 10, color: '#9ca3af' }}>{by.role}</div>}
                        </div>
                      </div>
                      <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 4 }}>{fmtDT(entry.at)}</div>
                      {entry.note && <div style={{ fontSize: 10, color: '#6b7280', marginTop: 3, fontStyle: 'italic', background: '#f9fafb', padding: '3px 6px', borderRadius: 4, borderLeft: '2px solid #d1d5db' }}>{entry.note}</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
