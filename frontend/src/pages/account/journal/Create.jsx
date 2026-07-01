import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { useCompany } from '../../../context/CompanyContext';

const F = "'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif";
const P = '#104f4f'; const BD = '#E5EAF2';

/* Excluded group IDs — banks belong only in Payment/Receipt */
const BANK_GROUP_IDS = ['bank', 'cash'];

const inp = (extra = {}) => ({
  height: 32, padding: '0 10px', border: `1px solid ${BD}`, borderRadius: 6,
  fontSize: 12, fontFamily: F, outline: 'none', background: '#fff',
  width: '100%', boxSizing: 'border-box', ...extra,
});
const lbl = { fontSize: 11, fontWeight: 600, color: '#374151', marginBottom: 3, display: 'block' };
const card = { background: '#fff', border: `1px solid ${BD}`, borderRadius: 10, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.05)', marginBottom: 14 };
const SH = { background: P, padding: '8px 14px', fontSize: 11, fontWeight: 700, color: '#fff', textTransform: 'uppercase', letterSpacing: '0.6px' };
const fmt = n => (parseFloat(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });
let _rid = 1;
const newRow = () => ({ _id: _rid++, ledger: '', type: 'debit', amount: '' });

/* ── Searchable ledger picker with grouped options ── */
function LedgerPicker({ value, onChange, groups }) {
  const [open, setOpen] = useState(false);
  const [q, setQ]       = useState('');
  const wrapRef         = useRef();

  useEffect(() => {
    const close = e => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const filtered = groups
    .map(g => ({ ...g, items: q.trim() ? g.items.filter(i => i.toLowerCase().includes(q.toLowerCase())) : g.items }))
    .filter(g => g.items.length > 0);

  const totalCount = filtered.reduce((s, g) => s + g.items.length, 0);

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <input
        value={open ? q : value}
        onChange={e => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => { setQ(''); setOpen(true); }}
        placeholder={value || 'Search ledger / client / vendor…'}
        style={{
          ...inp({ height: 30 }),
          borderColor: open ? P : BD,
          boxShadow: open ? `0 0 0 2px ${P}22` : 'none',
        }}
      />
      {value && !open && (
        <span style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', fontSize: 10, color: '#9ca3af', pointerEvents: 'none' }}>▼</span>
      )}
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 3px)', left: 0, right: 0,
          zIndex: 1000, background: '#fff', border: `1px solid ${BD}`,
          borderRadius: 8, maxHeight: 280, overflowY: 'auto',
          boxShadow: '0 8px 24px rgba(0,0,0,0.14)',
        }}>
          {totalCount === 0 ? (
            <div style={{ padding: '12px 14px', fontSize: 12, color: '#9ca3af', textAlign: 'center', fontFamily: F }}>
              No ledger found for "{q}"
            </div>
          ) : filtered.map(g => (
            <div key={g.group}>
              <div style={{ padding: '5px 10px 3px', fontSize: 9.5, fontWeight: 800, color: '#94a3b8', background: '#f8faff', textTransform: 'uppercase', letterSpacing: '0.6px', position: 'sticky', top: 0 }}>
                {g.group} ({g.items.length})
              </div>
              {g.items.map(item => (
                <div
                  key={item}
                  onMouseDown={() => { onChange(item); setOpen(false); setQ(''); }}
                  style={{ padding: '7px 14px', cursor: 'pointer', fontSize: 12.5, fontFamily: F, color: item === value ? P : '#111827', fontWeight: item === value ? 700 : 400, background: item === value ? '#eff6ff' : '#fff' }}
                  onMouseEnter={e => { if (item !== value) e.currentTarget.style.background = '#f0f4fb'; }}
                  onMouseLeave={e => { if (item !== value) e.currentTarget.style.background = '#fff'; }}
                >
                  {item}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Main component ── */
export default function CreateJournal() {
  const { selectedCompany } = useCompany();
  const cid      = selectedCompany?.companyId;
  const navigate = useNavigate();

  const [ledgerGroups, setLedgerGroups] = useState([]);
  const [date,         setDate]         = useState(new Date().toISOString().slice(0, 10));
  const [narration,    setNarration]    = useState('');
  const [refNo,        setRefNo]        = useState('');
  const [rows,         setRows]         = useState([newRow(), newRow()]);
  const [saving,       setSaving]       = useState(false);
  const [msg,          setMsg]          = useState({ text: '', ok: true });

  /* Load only Ledger Master accounts — banks excluded (bank/cash belong in Payment/Receipt) */
  const loadLedgers = useCallback(async () => {
    if (!cid) return;
    try {
      const { data: accounts } = await axios.get(`/api/ledger/accounts?companyId=${cid}`);
      const ledgers = (accounts || []).filter(a => !BANK_GROUP_IDS.includes(a.groupId));
      if (ledgers.length === 0) { setLedgerGroups([]); return; }
      // Group by groupName
      const map = {};
      ledgers.forEach(a => {
        const g = a.groupName || 'Other';
        if (!map[g]) map[g] = [];
        map[g].push(a.name);
      });
      setLedgerGroups(
        Object.entries(map)
          .sort(([a],[b]) => a.localeCompare(b))
          .map(([group, items]) => ({ group, items: items.sort() }))
      );
    } catch (e) {
      console.error('Failed to load ledgers:', e);
    }
  }, [cid]);

  useEffect(() => { loadLedgers(); }, [loadLedgers]);

  const updateRow = (id, field, val) => setRows(p => p.map(r => r._id === id ? { ...r, [field]: val } : r));
  const removeRow = id => { if (rows.length > 2) setRows(p => p.filter(r => r._id !== id)); };

  const totalDebit  = rows.filter(r => r.type === 'debit').reduce((s, r)  => s + (parseFloat(r.amount) || 0), 0);
  const totalCredit = rows.filter(r => r.type === 'credit').reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
  const diff        = Math.abs(totalDebit - totalCredit);
  const isBalanced  = diff < 0.01 && totalDebit > 0;

  const handleSubmit = async (status) => {
    if (!cid)           { setMsg({ text: 'No company selected.', ok: false }); return; }
    if (!date || !narration) { setMsg({ text: 'Date and Narration are required.', ok: false }); return; }
    if (rows.some(r => !r.ledger)) { setMsg({ text: 'All rows must have a ledger selected.', ok: false }); return; }
    if (!isBalanced)    { setMsg({ text: `Journal not balanced — difference ₹${fmt(diff)}`, ok: false }); return; }
    try {
      setSaving(true);
      const entries = rows.map(r => ({
        ledger: r.ledger,
        debit:  r.type === 'debit'  ? parseFloat(r.amount) || 0 : 0,
        credit: r.type === 'credit' ? parseFloat(r.amount) || 0 : 0,
      }));
      const res = await axios.post(`/api/accounts/journals?companyId=${cid}`, {
        companyId: cid, date, narration, refNo, entries,
        totalDebit:  +totalDebit.toFixed(2),
        totalCredit: +totalCredit.toFixed(2),
        status,
      });
      setMsg({ text: `Journal Entry #${res.data.journalId} created!`, ok: true });
      setDate(new Date().toISOString().slice(0, 10));
      setNarration(''); setRefNo('');
      setRows([newRow(), newRow()]);
    } catch (e) {
      setMsg({ text: 'Error: ' + (e.response?.data?.error || e.message), ok: false });
    } finally { setSaving(false); }
  };

  return (
    <div style={{ fontFamily: F, background: '#f0f4fb', minHeight: '100%', padding: '14px 16px', boxSizing: 'border-box' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 2 }}>Account → Journal</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#111827' }}>Create Journal Entry</div>
        </div>
        <button onClick={() => navigate('/account/journal/view')}
          style={{ height: 34, padding: '0 16px', background: '#fff', border: `1px solid ${BD}`, borderRadius: 7, fontSize: 12, cursor: 'pointer', fontFamily: F }}>
          ← View All Journals
        </button>
      </div>

      {msg.text && (
        <div style={{ background: msg.ok ? '#f0fdf4' : '#fef2f2', border: `1px solid ${msg.ok ? '#bbf7d0' : '#fecaca'}`, borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: 12.5, color: msg.ok ? '#15803d' : '#dc2626' }}>
          {msg.text}
        </div>
      )}

      {/* Details */}
      <div style={card}>
        <div style={SH}>Journal Details</div>
        <div style={{ padding: 14, display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
          <div>
            <label style={lbl}>Date *</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} style={inp()} />
          </div>
          <div>
            <label style={lbl}>Reference No. (optional)</label>
            <input value={refNo} onChange={e => setRefNo(e.target.value)} placeholder="Voucher / Ref No." style={inp()} />
          </div>
          <div>
            <label style={lbl}>Narration *</label>
            <input value={narration} onChange={e => setNarration(e.target.value)} placeholder="Purpose of this journal entry…" style={inp()} />
          </div>
        </div>
      </div>

      {/* No ledger accounts hint */}
      {ledgerGroups.length === 0 && (
        <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: 12.5, color: '#92400e' }}>
          No Ledger Master accounts found. Go to <strong>Account → Ledger Master</strong> to create ledger accounts before making journal entries. Banks belong in Payment/Receipt only.
        </div>
      )}

      {/* Double Entry Table */}
      <div style={card}>
        <div style={{ ...SH, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Double Entry Ledgers</span>
          <button onClick={() => setRows(p => [...p, newRow()])}
            style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 5, color: '#fff', padding: '3px 12px', fontSize: 11, cursor: 'pointer' }}>
            + Add Row
          </button>
        </div>

        {/* Balance bar */}
        <div style={{ padding: '8px 14px', background: isBalanced ? '#f0fdf4' : diff > 0 ? '#fffbeb' : '#f8faff', borderBottom: `1px solid ${BD}`, display: 'flex', alignItems: 'center', gap: 20, fontSize: 12, flexWrap: 'wrap' }}>
          <span>Total Dr: <strong style={{ color: '#1e40af' }}>₹{fmt(totalDebit)}</strong></span>
          <span>Total Cr: <strong style={{ color: '#7c3aed' }}>₹{fmt(totalCredit)}</strong></span>
          {diff > 0.005 && <span style={{ color: '#dc2626' }}>Difference: <strong>₹{fmt(diff)}</strong></span>}
          <span style={{ marginLeft: 'auto', fontWeight: 700, fontSize: 12.5, color: isBalanced ? '#15803d' : '#dc2626' }}>
            {isBalanced ? '✓ Balanced' : '✗ Not Balanced'}
          </span>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, fontFamily: F }}>
            <thead>
              <tr style={{ background: '#f8faff' }}>
                <th style={{ padding: '7px 10px', border: `1px solid ${BD}`, fontWeight: 700, color: '#374151', textAlign: 'left', width: '46%' }}>Ledger / Account</th>
                <th style={{ padding: '7px 10px', border: `1px solid ${BD}`, fontWeight: 700, color: '#374151', textAlign: 'center', width: 110 }}>Dr / Cr</th>
                <th style={{ padding: '7px 10px', border: `1px solid ${BD}`, fontWeight: 700, color: '#374151', textAlign: 'right' }}>Amount (₹)</th>
                <th style={{ padding: '7px 10px', border: `1px solid ${BD}`, width: 36 }}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, idx) => (
                <tr key={r._id} style={{ background: idx % 2 === 0 ? '#fff' : '#f8faff' }}>
                  <td style={{ padding: '5px 8px', border: `1px solid ${BD}` }}>
                    <LedgerPicker
                      value={r.ledger}
                      onChange={val => updateRow(r._id, 'ledger', val)}
                      groups={ledgerGroups}
                    />
                  </td>
                  <td style={{ padding: '5px 8px', border: `1px solid ${BD}`, textAlign: 'center' }}>
                    <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                      {['debit', 'credit'].map(t => (
                        <button key={t} onClick={() => updateRow(r._id, 'type', t)}
                          style={{
                            padding: '4px 12px', borderRadius: 5, border: 'none', cursor: 'pointer',
                            fontSize: 12, fontWeight: 700, fontFamily: F,
                            background: r.type === t ? (t === 'debit' ? '#1e40af' : '#7c3aed') : '#f1f5f9',
                            color: r.type === t ? '#fff' : '#64748b',
                            transition: 'all 0.12s',
                          }}>
                          {t === 'debit' ? 'Dr' : 'Cr'}
                        </button>
                      ))}
                    </div>
                  </td>
                  <td style={{ padding: '5px 8px', border: `1px solid ${BD}` }}>
                    <input
                      type="number" value={r.amount}
                      onChange={e => updateRow(r._id, 'amount', e.target.value)}
                      min="0" step="0.01" placeholder="0.00"
                      style={{
                        ...inp({ height: 30, textAlign: 'right', fontWeight: 700 }),
                        color: r.type === 'debit' ? '#1e40af' : '#7c3aed',
                      }}
                    />
                  </td>
                  <td style={{ padding: '5px 8px', border: `1px solid ${BD}`, textAlign: 'center' }}>
                    <button onClick={() => removeRow(r._id)}
                      style={{ background: 'none', border: 'none', cursor: rows.length <= 2 ? 'not-allowed' : 'pointer', color: rows.length <= 2 ? '#d1d5db' : '#dc2626', fontSize: 16 }}>
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
              {/* Totals */}
              <tr style={{ background: '#eef3fb', fontWeight: 700 }}>
                <td style={{ padding: '7px 10px', border: `1px solid ${BD}`, fontSize: 12.5 }}>Total</td>
                <td style={{ padding: '7px 10px', border: `1px solid ${BD}` }}></td>
                <td style={{ padding: '7px 10px', border: `1px solid ${BD}`, textAlign: 'right', fontSize: 13 }}>
                  <span style={{ color: '#1e40af' }}>Dr ₹{fmt(totalDebit)}</span>
                  <span style={{ color: '#cbd5e1', margin: '0 8px' }}>|</span>
                  <span style={{ color: '#7c3aed' }}>Cr ₹{fmt(totalCredit)}</span>
                </td>
                <td style={{ border: `1px solid ${BD}` }}></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <button onClick={() => navigate('/account/journal/view')}
          style={{ height: 36, padding: '0 20px', background: '#fff', border: `1px solid ${BD}`, borderRadius: 7, fontSize: 12.5, cursor: 'pointer', fontFamily: F }}>
          Cancel
        </button>
        <button onClick={() => handleSubmit('draft')} disabled={saving}
          style={{ height: 36, padding: '0 20px', background: '#f59e0b', border: 'none', borderRadius: 7, fontSize: 12.5, fontWeight: 700, color: '#fff', cursor: 'pointer', fontFamily: F }}>
          {saving ? 'Saving…' : 'Save Draft'}
        </button>
        <button onClick={() => handleSubmit('posted')} disabled={saving || !isBalanced}
          style={{ height: 36, padding: '0 24px', background: isBalanced ? P : '#9ca3af', border: 'none', borderRadius: 7, fontSize: 12.5, fontWeight: 700, color: '#fff', cursor: isBalanced ? 'pointer' : 'not-allowed', fontFamily: F }}>
          {saving ? 'Posting…' : '✓ Post Journal'}
        </button>
      </div>
    </div>
  );
}
