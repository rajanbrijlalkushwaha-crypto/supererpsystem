import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useCompany } from '../../../context/CompanyContext';

const P   = '#104f4f';
const BD  = '#d1dde1';
const F   = "'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif";
const fmt = n => (parseFloat(n)||0).toLocaleString('en-IN', { minimumFractionDigits: 2 });

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

const fmtDate = (ds) => {
  if (!ds) return '—';
  const d = new Date(ds);
  return isNaN(d) ? ds : `${String(d.getDate()).padStart(2,'0')}-${String(d.getMonth()+1).padStart(2,'0')}-${d.getFullYear()}`;
};

/* Category sections — ordered for display */
const DISPLAY_SECTIONS = [
  { key: 'debtors',     label: 'Sundry Debtors',          groupIds: ['sundry-debt'],                                      color: '#1d4ed8', bg: '#eff6ff', border: '#bfdbfe' },
  { key: 'creditors',   label: 'Sundry Creditors',         groupIds: ['sundry-cred'],                                      color: '#7c3aed', bg: '#f5f3ff', border: '#ddd6fe' },
  { key: 'emp-pay',     label: 'Employee Payables',        groupIds: ['employee-pay'],                                     color: '#be185d', bg: '#fdf2f8', border: '#f9a8d4' },
  { key: 'direct-exp',  label: 'Direct Expenses',          groupIds: ['direct-exp'],                                       color: '#b45309', bg: '#fffbeb', border: '#fde68a' },
  { key: 'indirect-exp',label: 'Indirect Expenses & Salary', groupIds: ['indirect-exp', 'salary-exp'],                   color: '#c2410c', bg: '#fff7ed', border: '#fed7aa' },
  { key: 'bank-cash',   label: 'Bank & Cash',              groupIds: ['bank', 'cash'],                                     color: '#0369a1', bg: '#f0f9ff', border: '#bae6fd' },
  { key: 'assets',      label: 'Fixed & Current Assets',   groupIds: ['fixed-assets', 'curr-assets'],                     color: '#065f46', bg: '#ecfdf5', border: '#6ee7b7' },
  { key: 'income',      label: 'Income',                   groupIds: ['indirect-inc', 'direct-inc'],                      color: '#15803d', bg: '#f0fdf4', border: '#86efac' },
  { key: 'capital',     label: 'Capital & Reserves',       groupIds: ['capital', 'reserves'],                             color: '#9a3412', bg: '#fff7ed', border: '#fdba74' },
  { key: 'liabilities', label: 'Other Liabilities',        groupIds: ['curr-liab', 'other-liab', 'duties-taxes', 'loans-liab'], color: '#dc2626', bg: '#fef2f2', border: '#fca5a5' },
];

const ACCOUNT_TYPE_LABELS = {
  general: 'General', employee: 'Employee', contractor: 'Contractor',
  expense: 'Expense A/c', income: 'Income A/c', bank: 'Bank',
  cash: 'Cash', payable: 'Payable', receivable: 'Receivable',
};

export default function LedgerMaster() {
  const { selectedCompany } = useCompany();
  const cid = selectedCompany?.companyId;

  const [accounts, setAccounts] = useState([]);
  const [groups,   setGroups]   = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [search,   setSearch]   = useState('');
  const [filterGroup, setFilterGroup] = useState('');

  /* statement modal */
  const [stmtAccount, setStmtAccount] = useState(null);
  const [stmtData,    setStmtData]    = useState(null);
  const [stmtLoading, setStmtLoading] = useState(false);

  /* form state */
  const [showForm,  setShowForm]  = useState(false);
  const [editId,    setEditId]    = useState(null);
  const [name,      setName]      = useState('');
  const [groupId,   setGroupId]   = useState('');
  const [accType,   setAccType]   = useState('general');
  const [ob,        setOb]        = useState('0');
  const [obNature,  setObNature]  = useState('Dr');
  const [notes,     setNotes]     = useState('');
  const [saving,    setSaving]    = useState(false);
  const [msg,       setMsg]       = useState('');
  const [deleting,  setDeleting]  = useState(null);

  const load = useCallback(() => {
    if (!cid) return;
    setLoading(true);
    Promise.all([
      axios.get(`/api/ledger/accounts?companyId=${cid}`),
      axios.get(`/api/ledger/groups?companyId=${cid}`),
    ]).then(([a, g]) => {
      setAccounts(a.data || []);
      setGroups(g.data || []);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [cid]);

  useEffect(() => { load(); }, [load]);

  const resetForm = () => {
    setEditId(null); setName(''); setGroupId(''); setAccType('general');
    setOb('0'); setObNature('Dr'); setNotes(''); setMsg('');
  };

  const openEdit = (a) => {
    setEditId(a.id); setName(a.name); setGroupId(a.groupId);
    setAccType(a.accountType || 'general'); setOb(String(a.openingBalance || 0));
    setObNature(a.openingBalanceNature || 'Dr'); setNotes(a.notes || '');
    setMsg(''); setShowForm(true);
  };

  const save = async () => {
    if (!name.trim() || !groupId) { setMsg('Name and Group are required.'); return; }
    setSaving(true); setMsg('');
    try {
      const body = { name: name.trim(), groupId, accountType: accType,
        openingBalance: parseFloat(ob)||0, openingBalanceNature: obNature,
        notes, companyId: cid };
      if (editId) await axios.put(`/api/ledger/accounts/${editId}?companyId=${cid}`, body);
      else        await axios.post(`/api/ledger/accounts?companyId=${cid}`, body);
      setMsg('Saved!'); setShowForm(false); resetForm(); load();
    } catch (e) {
      setMsg(e.response?.data?.error || 'Error saving');
    } finally { setSaving(false); }
  };

  const openStatement = async (a) => {
    setStmtAccount(a); setStmtData(null); setStmtLoading(true);
    try {
      const { data } = await axios.get(`/api/ledger/statement/${a.id}?companyId=${cid}`);
      setStmtData(data);
    } catch {}
    setStmtLoading(false);
  };

  const del = async (id) => {
    if (!window.confirm('Delete this ledger account?')) return;
    setDeleting(id);
    try {
      await axios.delete(`/api/ledger/accounts/${id}?companyId=${cid}`);
      load();
    } catch (e) {
      alert(e.response?.data?.error || 'Error');
    } finally { setDeleting(null); }
  };

  /* filter */
  const filtered = accounts.filter(a => {
    const q = search.toLowerCase();
    if (q && !a.name.toLowerCase().includes(q) && !(a.id||'').toLowerCase().includes(q) && !a.groupName?.toLowerCase().includes(q)) return false;
    if (filterGroup && a.groupId !== filterGroup) return false;
    return true;
  });

  /* Assign each account to a display section */
  const sectionMap = {};
  DISPLAY_SECTIONS.forEach(s => { sectionMap[s.key] = []; });
  sectionMap['__other'] = [];

  filtered.forEach(a => {
    const section = DISPLAY_SECTIONS.find(s => s.groupIds.includes(a.groupId));
    if (section) sectionMap[section.key].push(a);
    else sectionMap['__other'].push(a);
  });

  const groupOptions = groups.filter(g => !g.parent).sort((a,b) => a.name.localeCompare(b.name));
  const subGroupOptions = groups.filter(g => g.parent).sort((a,b) => a.name.localeCompare(b.name));
  const selectedGroup = groups.find(g => g.id === groupId);

  const AccRow = ({ a }) => {
    const balColor = a.balance >= 0 ? '#1e40af' : '#dc2626';
    const isAuto = a.isAutoParty;
    return (
      <div style={{
        display: 'grid', gridTemplateColumns: '80px 1fr 130px 80px 120px 90px 130px',
        gap: 6, alignItems: 'center',
        padding: '9px 14px', background: '#fff',
        borderBottom: '1px solid #f1f5f9',
      }}
        onMouseEnter={e => e.currentTarget.style.background = '#fafafa'}
        onMouseLeave={e => e.currentTarget.style.background = '#fff'}
      >
        {/* ID */}
        <div style={{ fontFamily: "'JetBrains Mono','Fira Code',monospace", fontSize: 11,
          color: P, fontWeight: 700, background: '#e8f4f4',
          padding: '2px 6px', borderRadius: 4, textAlign: 'center' }}>
          {a.id}
        </div>

        {/* Name */}
        <div>
          <div style={{ fontWeight: 600, fontSize: 13, color: '#1e293b', display: 'flex', alignItems: 'center', gap: 6 }}>
            {a.name}
            {isAuto && (
              <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3,
                background: '#fef3c7', color: '#92400e', border: '1px solid #fcd34d',
                fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                AUTO
              </span>
            )}
          </div>
          <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 1 }}>{a.groupName}</div>
        </div>

        {/* Account Type */}
        <div style={{ fontSize: 11, color: '#64748b' }}>
          {ACCOUNT_TYPE_LABELS[a.accountType] || a.accountType}
        </div>

        {/* Nature badge */}
        <div>
          <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 10, fontWeight: 700,
            background: a.groupNature === 'Dr' ? '#eff6ff' : '#f0fdf4',
            color: a.groupNature === 'Dr' ? '#1e40af' : '#15803d',
            border: `1px solid ${a.groupNature === 'Dr' ? '#bfdbfe' : '#86efac'}` }}>
            {a.groupNature}
          </span>
        </div>

        {/* Balance */}
        <div style={{ textAlign: 'right', fontSize: 12.5, fontWeight: 700,
          color: balColor, fontVariantNumeric: 'tabular-nums' }}>
          ₹{fmt(Math.abs(a.balance))}
          <span style={{ fontSize: 10, marginLeft: 3 }}>{a.balance >= 0 ? 'Dr' : 'Cr'}</span>
        </div>

        {/* Opening Bal */}
        <div style={{ textAlign: 'right', fontSize: 11, color: '#94a3b8', fontVariantNumeric: 'tabular-nums' }}>
          OB ₹{fmt(a.openingBalance)}
          <span style={{ fontSize: 9, marginLeft: 2 }}>{a.openingBalanceNature}</span>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
          <button onClick={() => openStatement(a)}
            style={{ ...btn(P, { padding: '0 8px', height: 26, fontSize: 11 }) }}>
            Stmt
          </button>
          {!isAuto && (
            <>
              <button onClick={() => openEdit(a)}
                style={{ ...btn('#6366f1', { padding: '0 8px', height: 26, fontSize: 11 }) }}>
                Edit
              </button>
              <button onClick={() => del(a.id)} disabled={deleting === a.id}
                style={{ ...btn('#dc2626', { padding: '0 8px', height: 26, fontSize: 11 }) }}>
                Del
              </button>
            </>
          )}
        </div>
      </div>
    );
  };

  const SectionTable = ({ section, list }) => {
    if (list.length === 0) return null;
    return (
      <div style={{ marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: section.color,
            background: section.bg, border: `1px solid ${section.border}`,
            padding: '3px 12px', borderRadius: 20 }}>
            {section.label} ({list.length})
          </div>
          <div style={{ fontSize: 11, color: '#94a3b8' }}>
            Total Dr: ₹{fmt(list.reduce((s,a) => s + (a.totalDr||0), 0))} ·
            Total Cr: ₹{fmt(list.reduce((s,a) => s + (a.totalCr||0), 0))}
          </div>
        </div>
        <div style={{ borderRadius: 8, overflow: 'hidden', border: '1px solid #e2e8f0',
          boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr 130px 80px 120px 90px 130px',
            gap: 6, padding: '7px 14px', background: '#f8fafc',
            borderBottom: '1px solid #e2e8f0', fontSize: 10,
            fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            <div>ID</div>
            <div>Account Name</div>
            <div>Type</div>
            <div>Nature</div>
            <div style={{ textAlign: 'right' }}>Balance</div>
            <div style={{ textAlign: 'right' }}>Opening</div>
            <div />
          </div>
          {list.map(a => <AccRow key={a.id} a={a} />)}
        </div>
      </div>
    );
  };

  const totalAccounts = filtered.filter(a => !a.isAutoParty).length;
  const totalAutoParty = filtered.filter(a => a.isAutoParty).length;

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', fontFamily: F, background: '#f8fafb' }}>

      {/* Header */}
      <div style={HDR}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 16 }}>Ledger Master</div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', marginTop: 2 }}>
            {totalAccounts} manual ledger{totalAccounts !== 1 ? 's' : ''} · {totalAutoParty} auto-linked (clients + vendors)
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => { resetForm(); setShowForm(true); }} style={btn()}>+ Create Ledger</button>
        </div>
      </div>

      {/* Filters */}
      <div style={{ padding: '10px 16px', borderBottom: `1px solid ${BD}`, background: '#fff',
        display: 'flex', gap: 10, flexShrink: 0, flexWrap: 'wrap', alignItems: 'center' }}>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search by name, ID or group…"
          style={{ ...inp(), maxWidth: 240, height: 32 }} />
        <select value={filterGroup} onChange={e => setFilterGroup(e.target.value)}
          style={{ ...inp(), maxWidth: 200, height: 32 }}>
          <option value="">All Groups</option>
          {groups.sort((a,b)=>a.name.localeCompare(b.name)).map(g => (
            <option key={g.id} value={g.id}>{g.name} ({g.nature})</option>
          ))}
        </select>
        {(search||filterGroup) && (
          <button onClick={() => { setSearch(''); setFilterGroup(''); }}
            style={btn('#64748b', { height: 32, padding: '0 12px', fontSize: 11 })}>
            Clear
          </button>
        )}
        <div style={{ marginLeft: 'auto', fontSize: 12, color: '#64748b' }}>
          {filtered.length} result{filtered.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Create / Edit Form Modal */}
      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div style={{ background: '#fff', borderRadius: 12, width: 500, maxWidth: '95vw',
            boxShadow: '0 8px 32px rgba(0,0,0,0.18)', overflow: 'hidden' }}>
            <div style={{ background: P, color: '#fff', padding: '14px 20px',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontWeight: 700, fontSize: 15 }}>
                {editId ? 'Edit Ledger Account' : 'Create Ledger Account'}
              </span>
              <button onClick={() => { setShowForm(false); resetForm(); }}
                style={{ background: 'none', border: 'none', color: '#fff', fontSize: 18, cursor: 'pointer' }}>✕</button>
            </div>

            <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={lbl}>Account Name *</label>
                <input value={name} onChange={e => setName(e.target.value)}
                  placeholder="e.g. Electricity Expense, Rajan Salary A/c"
                  style={inp()} />
              </div>

              <div>
                <label style={lbl}>Account Group *</label>
                <select value={groupId} onChange={e => {
                  setGroupId(e.target.value);
                  const g = groups.find(x => x.id === e.target.value);
                  if (g) setObNature(g.nature);
                }} style={inp()}>
                  <option value="">— select group —</option>
                  <optgroup label="Primary Groups">
                    {groupOptions.map(g => (
                      <option key={g.id} value={g.id}>{g.name} [{g.nature}]</option>
                    ))}
                  </optgroup>
                  {subGroupOptions.length > 0 && (
                    <optgroup label="Sub Groups">
                      {subGroupOptions.map(g => (
                        <option key={g.id} value={g.id}>  {g.name} [{g.nature}]</option>
                      ))}
                    </optgroup>
                  )}
                </select>
                {selectedGroup && (
                  <div style={{ marginTop: 4, fontSize: 11, color: '#64748b' }}>
                    Nature: <strong>{selectedGroup.nature}</strong> —
                    {selectedGroup.nature === 'Dr' ? ' Assets & Expenses (debit increases balance)' : ' Liabilities & Income (credit increases balance)'}
                  </div>
                )}
              </div>

              <div>
                <label style={lbl}>Account Type</label>
                <select value={accType} onChange={e => setAccType(e.target.value)} style={inp()}>
                  <option value="general">General</option>
                  <option value="employee">Employee</option>
                  <option value="contractor">Contractor / Non-GST</option>
                  <option value="expense">Expense Account</option>
                  <option value="income">Income Account</option>
                  <option value="bank">Bank Account</option>
                  <option value="cash">Cash</option>
                  <option value="payable">Payable / Creditor</option>
                  <option value="receivable">Receivable / Debtor</option>
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px', gap: 10 }}>
                <div>
                  <label style={lbl}>Opening Balance (₹)</label>
                  <input type="number" value={ob} onChange={e => setOb(e.target.value)}
                    min="0" step="0.01" style={inp()} />
                </div>
                <div>
                  <label style={lbl}>Nature</label>
                  <select value={obNature} onChange={e => setObNature(e.target.value)} style={inp()}>
                    <option value="Dr">Dr (Debit)</option>
                    <option value="Cr">Cr (Credit)</option>
                  </select>
                </div>
              </div>

              <div>
                <label style={lbl}>Notes (optional)</label>
                <input value={notes} onChange={e => setNotes(e.target.value)}
                  placeholder="Any remarks…" style={inp()} />
              </div>

              {msg && (
                <div style={{ padding: '8px 12px', borderRadius: 6, fontSize: 12,
                  background: msg === 'Saved!' ? '#f0fdf4' : '#fef2f2',
                  color: msg === 'Saved!' ? '#15803d' : '#dc2626',
                  border: `1px solid ${msg === 'Saved!' ? '#86efac' : '#fca5a5'}` }}>
                  {msg}
                </div>
              )}

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button onClick={() => { setShowForm(false); resetForm(); }}
                  style={{ ...btn('#64748b'), height: 36 }}>Cancel</button>
                <button onClick={save} disabled={saving}
                  style={{ ...btn(P), height: 36, minWidth: 100 }}>
                  {saving ? 'Saving…' : editId ? 'Update' : 'Create Ledger'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Account Statement Modal */}
      {stmtAccount && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div style={{ background: '#fff', borderRadius: 12, width: 860, maxWidth: '96vw',
            maxHeight: '88vh', display: 'flex', flexDirection: 'column',
            boxShadow: '0 8px 40px rgba(0,0,0,0.2)', overflow: 'hidden' }}>
            <div style={{ background: P, color: '#fff', padding: '14px 20px',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15 }}>
                  {stmtAccount.name}
                  <span style={{ marginLeft: 8, fontSize: 11, opacity: 0.7,
                    fontFamily: "'JetBrains Mono','Fira Code',monospace" }}>
                    {stmtAccount.id}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', marginTop: 2 }}>
                  {stmtAccount.groupName} · {stmtAccount.groupNature === 'Dr' ? 'Asset/Expense' : 'Liability/Income'}
                </div>
              </div>
              <button onClick={() => { setStmtAccount(null); setStmtData(null); }}
                style={{ background: 'none', border: 'none', color: '#fff', fontSize: 20, cursor: 'pointer' }}>✕</button>
            </div>

            {stmtData && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)',
                borderBottom: '1px solid #e2e8f0', flexShrink: 0 }}>
                {[
                  { label: 'Opening Balance', val: `₹${fmt(stmtData.openingBalance)} ${stmtData.openingBalanceNature}`, bg: '#f8fafc' },
                  { label: 'Transactions', val: stmtData.entries.length, bg: '#f8fafc' },
                  { label: 'Closing Balance', val: `₹${fmt(stmtData.closingBalance)} ${stmtData.closingBalanceNature}`,
                    bg: stmtData.closingBalanceNature === 'Dr' ? '#eff6ff' : '#f0fdf4',
                    color: stmtData.closingBalanceNature === 'Dr' ? '#1e40af' : '#15803d' },
                ].map((s, i) => (
                  <div key={i} style={{ padding: '10px 16px', background: s.bg || '#f8fafc',
                    borderRight: i < 2 ? '1px solid #e2e8f0' : 'none' }}>
                    <div style={{ fontSize: 10, color: '#64748b', fontWeight: 600, textTransform: 'uppercase',
                      letterSpacing: '0.5px', marginBottom: 3 }}>{s.label}</div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: s.color || '#1e293b' }}>{s.val}</div>
                  </div>
                ))}
              </div>
            )}

            <div style={{ flex: 1, overflowY: 'auto' }}>
              {stmtLoading ? (
                <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>Loading…</div>
              ) : stmtData?.entries?.length === 0 ? (
                <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
                  No transactions yet for this account.
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', position: 'sticky', top: 0 }}>
                      {['Date','Voucher','Narration','Cost Center','DR (₹)','CR (₹)','Balance'].map((h,i) => (
                        <th key={i} style={{ padding: '8px 12px', fontWeight: 700, fontSize: 10.5,
                          color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.4px',
                          textAlign: i >= 4 ? 'right' : 'left', borderBottom: '2px solid #e2e8f0',
                          whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {stmtData?.entries.map((e, i) => (
                      <tr key={e.voucherId} style={{ background: i%2===0 ? '#fff' : '#fafafa' }}>
                        <td style={{ padding: '7px 12px', borderBottom: '1px solid #f1f5f9', whiteSpace: 'nowrap' }}>{fmtDate(e.date)}</td>
                        <td style={{ padding: '7px 12px', borderBottom: '1px solid #f1f5f9', whiteSpace: 'nowrap' }}>
                          <span style={{ fontSize: 10, background: '#e8f4f4', color: P,
                            padding: '2px 6px', borderRadius: 4, fontWeight: 600 }}>{e.voucherType}</span>
                          {e.refNo && <span style={{ marginLeft: 4, fontSize: 10, color: '#94a3b8' }}>#{e.refNo}</span>}
                        </td>
                        <td style={{ padding: '7px 12px', borderBottom: '1px solid #f1f5f9', maxWidth: 200 }}>
                          <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.narration || '—'}</div>
                        </td>
                        <td style={{ padding: '7px 12px', borderBottom: '1px solid #f1f5f9', fontSize: 11, color: '#64748b' }}>
                          {e.costCenter || '—'}
                        </td>
                        <td style={{ padding: '7px 12px', borderBottom: '1px solid #f1f5f9', textAlign: 'right',
                          fontWeight: e.dr > 0 ? 700 : 400, color: e.dr > 0 ? '#1e40af' : '#94a3b8',
                          fontVariantNumeric: 'tabular-nums' }}>
                          {e.dr > 0 ? `₹${fmt(e.dr)}` : '—'}
                        </td>
                        <td style={{ padding: '7px 12px', borderBottom: '1px solid #f1f5f9', textAlign: 'right',
                          fontWeight: e.cr > 0 ? 700 : 400, color: e.cr > 0 ? '#dc2626' : '#94a3b8',
                          fontVariantNumeric: 'tabular-nums' }}>
                          {e.cr > 0 ? `₹${fmt(e.cr)}` : '—'}
                        </td>
                        <td style={{ padding: '7px 12px', borderBottom: '1px solid #f1f5f9', textAlign: 'right',
                          fontWeight: 700, whiteSpace: 'nowrap',
                          color: e.balanceLabel === 'Dr' ? '#1e40af' : '#dc2626',
                          fontVariantNumeric: 'tabular-nums' }}>
                          ₹{fmt(e.balance)} <span style={{ fontSize: 9 }}>{e.balanceLabel}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Main content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#64748b' }}>Loading…</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60 }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📒</div>
            <div style={{ fontSize: 14, color: '#64748b', marginBottom: 8 }}>No ledger accounts found</div>
            <button onClick={() => { resetForm(); setShowForm(true); }}
              style={btn(P, { height: 36, padding: '0 20px' })}>
              + Create First Ledger
            </button>
          </div>
        ) : (
          <>
            {DISPLAY_SECTIONS.map(section => (
              <SectionTable key={section.key} section={section} list={sectionMap[section.key] || []} />
            ))}
            {sectionMap['__other'].length > 0 && (
              <SectionTable
                section={{ label: 'Other / Custom Groups', color: '#475569', bg: '#f8fafc', border: '#cbd5e1' }}
                list={sectionMap['__other']}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
