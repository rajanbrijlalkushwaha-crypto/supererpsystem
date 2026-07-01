import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useCompany } from '../../../context/CompanyContext';

const P  = '#104f4f';
const BD = '#d1dde1';
const F  = "'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif";

const HDR = { background: P, color: '#fff', padding: '14px 20px', display: 'flex',
  alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 };
const inp = (extra={}) => ({
  height: 34, padding: '0 10px', border: `1px solid ${BD}`, borderRadius: 6,
  fontSize: 13, fontFamily: F, width: '100%', outline: 'none',
  background: '#fff', boxSizing: 'border-box', ...extra,
});
const lbl = { fontSize: 11, fontWeight: 600, color: '#555', marginBottom: 3, display: 'block' };
const btn = (bg='#104f4f', extra={}) => ({
  background: bg, color: '#fff', border: 'none', borderRadius: 6,
  padding: '0 16px', height: 32, fontSize: 12, fontWeight: 600,
  cursor: 'pointer', fontFamily: F, ...extra,
});

const NATURE_STYLE = {
  Dr: { bg: '#eff6ff', color: '#1e40af', border: '#bfdbfe' },
  Cr: { bg: '#f0fdf4', color: '#15803d', border: '#86efac' },
};

const SYSTEM_GROUPS = [
  'capital','reserves','curr-liab','sundry-cred','employee-pay','other-liab',
  'duties-taxes','loans-liab','curr-assets','sundry-debt','cash','bank',
  'fixed-assets','indirect-exp','salary-exp','direct-exp','indirect-inc','direct-inc',
];

export default function AccountGroups() {
  const { selectedCompany } = useCompany();
  const cid = selectedCompany?.companyId;

  const [groups,   setGroups]   = useState([]);
  const [loading,  setLoading]  = useState(true);

  const [showForm, setShowForm] = useState(false);
  const [name,     setName]     = useState('');
  const [nature,   setNature]   = useState('Dr');
  const [parent,   setParent]   = useState('');
  const [saving,   setSaving]   = useState(false);
  const [msg,      setMsg]      = useState('');
  const [deleting, setDeleting] = useState(null);

  const load = useCallback(() => {
    if (!cid) return;
    setLoading(true);
    axios.get(`/api/ledger/groups?companyId=${cid}`)
      .then(r => setGroups(r.data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [cid]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!name.trim()) { setMsg('Name is required'); return; }
    setSaving(true); setMsg('');
    try {
      await axios.post(`/api/ledger/groups?companyId=${cid}`, {
        name: name.trim(), nature, parent: parent || null, companyId: cid,
      });
      setShowForm(false); setName(''); setNature('Dr'); setParent(''); setMsg('');
      load();
    } catch (e) {
      setMsg(e.response?.data?.error || 'Error');
    } finally { setSaving(false); }
  };

  const del = async (id) => {
    if (!window.confirm('Delete this group? (Only works if no accounts use it)')) return;
    setDeleting(id);
    try {
      await axios.delete(`/api/ledger/groups/${id}?companyId=${cid}`);
      load();
    } catch (e) {
      alert(e.response?.data?.error || 'Error');
    } finally { setDeleting(null); }
  };

  /* Build tree */
  const topGroups = groups.filter(g => !g.parent);
  const childrenOf = (id) => groups.filter(g => g.parent === id);

  const GroupCard = ({ g, level = 0 }) => {
    const ns = NATURE_STYLE[g.nature] || NATURE_STYLE.Dr;
    const children = childrenOf(g.id);
    const isSystem = g.isSystem || SYSTEM_GROUPS.includes(g.id);

    return (
      <div>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: `10px 16px 10px ${16 + level * 24}px`,
          background: '#fff', borderBottom: '1px solid #f1f5f9',
          transition: 'background 0.1s',
        }}
          onMouseEnter={e => e.currentTarget.style.background = '#fafafa'}
          onMouseLeave={e => e.currentTarget.style.background = '#fff'}
        >
          {level > 0 && (
            <span style={{ color: '#94a3b8', fontSize: 16, lineHeight: 1, marginLeft: -8 }}>└</span>
          )}
          <div style={{ flex: 1 }}>
            <span style={{ fontWeight: level === 0 ? 700 : 600, fontSize: 13, color: '#1e293b' }}>
              {g.name}
            </span>
            {isSystem && (
              <span style={{ marginLeft: 6, fontSize: 10, color: '#94a3b8',
                background: '#f1f5f9', padding: '1px 6px', borderRadius: 8, fontWeight: 600 }}>
                System
              </span>
            )}
          </div>
          <span style={{ fontSize: 11, padding: '2px 10px', borderRadius: 10, fontWeight: 700,
            background: ns.bg, color: ns.color, border: `1px solid ${ns.border}` }}>
            {g.nature} — {g.nature === 'Dr' ? 'Asset/Expense' : 'Liability/Income'}
          </span>
          {!isSystem && (
            <button onClick={() => del(g.id)} disabled={deleting === g.id}
              style={{ ...btn('#dc2626', { height: 26, padding: '0 10px', fontSize: 11 }) }}>
              Delete
            </button>
          )}
        </div>
        {children.map(c => <GroupCard key={c.id} g={c} level={level + 1} />)}
      </div>
    );
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', fontFamily: F, background: '#f8fafb' }}>

      <div style={HDR}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 16 }}>Account Groups</div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', marginTop: 2 }}>
            {groups.length} group{groups.length !== 1 ? 's' : ''} — Tally-style hierarchy
          </div>
        </div>
        <button onClick={() => { setShowForm(true); setMsg(''); }}
          style={btn()}>+ Add Group</button>
      </div>

      {/* Explanation */}
      <div style={{ padding: '10px 16px', background: '#e8f4f4', borderBottom: `1px solid ${BD}`,
        fontSize: 12, color: '#104f4f', flexShrink: 0 }}>
        <strong>Dr (Debit) nature</strong> = Assets & Expenses — debit increases balance. &nbsp;|&nbsp;
        <strong>Cr (Credit) nature</strong> = Liabilities & Income — credit increases balance.
        System groups are pre-seeded and cannot be deleted.
      </div>

      {/* Create form modal */}
      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div style={{ background: '#fff', borderRadius: 12, width: 420, maxWidth: '95vw',
            boxShadow: '0 8px 32px rgba(0,0,0,0.18)', overflow: 'hidden' }}>
            <div style={{ background: P, color: '#fff', padding: '14px 20px',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontWeight: 700, fontSize: 15 }}>Create Account Group</span>
              <button onClick={() => setShowForm(false)}
                style={{ background: 'none', border: 'none', color: '#fff', fontSize: 18, cursor: 'pointer' }}>✕</button>
            </div>
            <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={lbl}>Group Name *</label>
                <input value={name} onChange={e => setName(e.target.value)}
                  placeholder="e.g. Marketing Expenses, Capital Reserves"
                  style={inp()} />
              </div>
              <div>
                <label style={lbl}>Nature *</label>
                <select value={nature} onChange={e => setNature(e.target.value)} style={inp()}>
                  <option value="Dr">Dr — Debit (Assets, Expenses)</option>
                  <option value="Cr">Cr — Credit (Liabilities, Income)</option>
                </select>
              </div>
              <div>
                <label style={lbl}>Parent Group (optional)</label>
                <select value={parent} onChange={e => setParent(e.target.value)} style={inp()}>
                  <option value="">— Top-level group (no parent) —</option>
                  {groups.filter(g => !g.parent).sort((a,b)=>a.name.localeCompare(b.name)).map(g => (
                    <option key={g.id} value={g.id}>{g.name} [{g.nature}]</option>
                  ))}
                </select>
              </div>
              {msg && (
                <div style={{ padding: '8px 12px', borderRadius: 6, fontSize: 12,
                  background: '#fef2f2', color: '#dc2626', border: '1px solid #fca5a5' }}>
                  {msg}
                </div>
              )}
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button onClick={() => setShowForm(false)}
                  style={{ ...btn('#64748b'), height: 36 }}>Cancel</button>
                <button onClick={save} disabled={saving}
                  style={{ ...btn(P), height: 36, minWidth: 100 }}>
                  {saving ? 'Saving…' : 'Create Group'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Groups tree */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#64748b' }}>Loading…</div>
        ) : (
          <div style={{ borderRadius: 8, overflow: 'hidden', border: '1px solid #e2e8f0',
            boxShadow: '0 1px 4px rgba(0,0,0,0.05)', background: '#fff' }}>
            {/* Header */}
            <div style={{ padding: '8px 16px', background: '#f8fafc',
              borderBottom: '1px solid #e2e8f0', fontSize: 11, fontWeight: 700,
              color: '#64748b', textTransform: 'uppercase',
              display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ flex: 1 }}>Group Name</span>
              <span>Nature</span>
              <span style={{ width: 70 }} />
            </div>
            {topGroups.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>No groups found</div>
            ) : (
              topGroups.map(g => <GroupCard key={g.id} g={g} />)
            )}
          </div>
        )}
      </div>
    </div>
  );
}
