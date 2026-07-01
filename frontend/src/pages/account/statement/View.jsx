import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useCompany } from '../../../context/CompanyContext';

const F   = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const P   = '#104f4f';
const BD  = '#E5EAF2';
const fmt = n => (parseFloat(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });
const fmtD = d => {
  if (!d) return '—';
  const dt = new Date(d);
  return isNaN(dt) ? d : `${String(dt.getDate()).padStart(2,'0')}-${String(dt.getMonth()+1).padStart(2,'0')}-${dt.getFullYear()}`;
};

const inp = (extra = {}) => ({
  height: 34, padding: '0 10px', border: `1px solid ${BD}`, borderRadius: 6,
  fontSize: 12, fontFamily: F, boxSizing: 'border-box', outline: 'none',
  background: '#fff', width: '100%', ...extra,
});

const MODES = ['Bank Transfer','NEFT','RTGS','UPI','Cheque','Cash','IMPS','DD'];

/* ────────────────────────────────────────────────────────── */
/* Edit Modal                                                 */
/* ────────────────────────────────────────────────────────── */
function EditModal({ row, banks, onClose, onSaved, companyId }) {
  const [form, setForm] = useState({
    date:        row.date || '',
    amount:      row.amount || '',
    paymentMode: row.paymentMode || '',
    bankId:      row.bankId ? String(row.bankId) : '',
    referenceNo: row.referenceNo || '',
    notes:       row.notes || '',
    status:      row.status || 'confirmed',
    entityName:  row.entityName || '',
  });
  const [saving, setSaving] = useState(false);
  const [err,    setErr]    = useState('');

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  const save = async () => {
    if (!form.amount || !form.date) { setErr('Date and Amount are required.'); return; }
    setSaving(true); setErr('');
    try {
      await axios.put(`/api/accounts/payments/${row.paymentId}?companyId=${companyId}`, {
        ...form, amount: parseFloat(form.amount) || 0, companyId,
      });
      onSaved();
    } catch (e) { setErr(e.response?.data?.error || e.message); }
    setSaving(false);
  };

  const ovl = {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999,
  };
  const box = {
    background: '#fff', borderRadius: 10, width: 520, maxWidth: '96vw',
    boxShadow: '0 8px 40px rgba(0,0,0,0.25)', fontFamily: F, overflow: 'hidden',
  };
  const hdr = {
    background: P, color: '#fff', padding: '12px 18px',
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  };
  const lbl = { fontSize: 11, fontWeight: 600, color: '#555', marginBottom: 4, display: 'block' };
  const row2 = (children) => (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
      {children}
    </div>
  );
  const isReceipt = row.type === 'receipt';

  return (
    <div style={ovl} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={box}>
        <div style={hdr}>
          <span style={{ fontWeight: 700, fontSize: 14 }}>
            ✏️ Edit {isReceipt ? 'Receipt' : 'Payment'} — #{row.paymentId}
          </span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#fff', fontSize: 18, cursor: 'pointer' }}>✕</button>
        </div>

        <div style={{ padding: '18px 20px' }}>
          {err && <div style={{ background: '#ffe0e0', border: '1px solid #cc4444', color: '#880000',
            padding: '6px 10px', borderRadius: 5, marginBottom: 10, fontSize: 11 }}>{err}</div>}

          {row2(<>
            <div>
              <label style={lbl}>Date *</label>
              <input type="date" value={form.date} onChange={set('date')} style={inp()} />
            </div>
            <div>
              <label style={lbl}>Amount (₹) *</label>
              <input type="number" value={form.amount} onChange={set('amount')} style={inp()} min="0" step="0.01" />
            </div>
          </>)}

          {row2(<>
            <div>
              <label style={lbl}>Party / Entity Name</label>
              <input value={form.entityName} onChange={set('entityName')} style={inp()} placeholder="Party name" />
            </div>
            <div>
              <label style={lbl}>Payment Mode</label>
              <select value={form.paymentMode} onChange={set('paymentMode')} style={inp({ cursor: 'pointer' })}>
                <option value="">— Select —</option>
                {MODES.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
          </>)}

          {row2(<>
            <div>
              <label style={lbl}>Bank Account</label>
              <select value={form.bankId} onChange={set('bankId')} style={inp({ cursor: 'pointer' })}>
                <option value="">— No Bank —</option>
                {banks.map(b => <option key={b.bankId} value={b.bankId}>{b.bankName} ({b.accountNumber})</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Reference No.</label>
              <input value={form.referenceNo} onChange={set('referenceNo')} style={inp()} placeholder="UTR / Cheque No." />
            </div>
          </>)}

          {row2(<>
            <div>
              <label style={lbl}>Status</label>
              <select value={form.status} onChange={set('status')} style={inp({ cursor: 'pointer' })}>
                <option value="confirmed">Confirmed</option>
                <option value="pending">Pending</option>
                <option value="rejected">Rejected</option>
              </select>
            </div>
            <div>
              <label style={lbl}>Notes</label>
              <input value={form.notes} onChange={set('notes')} style={inp()} placeholder="Optional notes" />
            </div>
          </>)}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 6 }}>
            <button onClick={onClose}
              style={{ height: 34, padding: '0 20px', background: '#f5f5f5', border: `1px solid ${BD}`,
                borderRadius: 6, cursor: 'pointer', fontFamily: F, fontSize: 12, fontWeight: 600 }}>
              Cancel
            </button>
            <button onClick={save} disabled={saving}
              style={{ height: 34, padding: '0 24px', background: saving ? '#aaa' : P, border: 'none',
                borderRadius: 6, cursor: saving ? 'not-allowed' : 'pointer', color: '#fff',
                fontFamily: F, fontSize: 12, fontWeight: 700 }}>
              {saving ? 'Saving…' : '💾 Save Changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────── */
/* Print helper                                              */
/* ────────────────────────────────────────────────────────── */
function printBankStatement(rows, bank, dateFrom, dateTo, companyName, companyData, allBanks) {
  const totalReceipt = rows.filter(r => r.type === 'receipt').reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
  const totalPayment = rows.filter(r => r.type === 'payment').reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
  const showBankCol  = !bank;
  const bankLookup   = {};
  (allBanks || []).forEach(b => { bankLookup[String(b.bankId)] = b.bankName; });

  const bankBlock = bank ? `
  <div style="border:1px solid #104f4f;padding:8px 14px;margin-bottom:10px;background:#f0f4f8">
    <div style="font-size:10px;font-weight:bold;color:#104f4f;margin-bottom:4px">BANK DETAILS</div>
    <table style="width:auto;font-size:10px;border-collapse:collapse">
      <tr><td style="padding:2px 12px 2px 0;color:#555">Bank Name</td><td style="font-weight:bold">${bank.bankName}</td></tr>
      <tr><td style="padding:2px 12px 2px 0;color:#555">Account No.</td><td style="font-weight:bold;font-family:monospace">${bank.accountNumber}</td></tr>
      <tr><td style="padding:2px 12px 2px 0;color:#555">IFSC</td><td>${bank.ifscCode||'—'}</td></tr>
      <tr><td style="padding:2px 12px 2px 0;color:#555">Type</td><td>${bank.accountType||'—'}</td></tr>
    </table>
  </div>` : `<div style="border:1px solid #ccc;padding:5px 12px;margin-bottom:10px;background:#f9f9f9;font-size:10px;color:#555">All Banks — Consolidated Statement</div>`;

  const html = `<!DOCTYPE html><html><head><title>Bank Statement</title><style>
    body{font-family:Arial,sans-serif;font-size:11px;margin:24px;color:#000}
    .co-block{text-align:center;border-bottom:2px solid #104f4f;padding-bottom:8px;margin-bottom:8px}
    .co{font-size:18px;font-weight:bold;color:#104f4f}
    .co-sub{font-size:10px;color:#555;margin-top:2px}
    .title{font-size:13px;font-weight:bold;text-align:center;padding:5px;border:2px solid #104f4f;margin:8px 0;color:#104f4f;letter-spacing:1px}
    .period{font-size:10px;color:#555;text-align:center;margin-bottom:8px}
    table{width:100%;border-collapse:collapse;font-size:10px}
    th{background:#104f4f;color:#fff;padding:4px 7px;text-align:left}
    th.r,td.r{text-align:right}
    td{padding:3px 7px;border-bottom:1px solid #eee}
    tr:nth-child(even){background:#f9f9f9}
    tfoot td{font-weight:bold;background:#f0f0f0;border-top:2px solid #104f4f}
    .boxes{display:flex;gap:16px;margin-top:14px}
    .box{flex:1;border:2px solid #ccc;padding:8px 10px;text-align:center}
    .sig{margin-top:30px;display:flex;justify-content:space-between;font-size:10px;color:#666;border-top:1px solid #ccc;padding-top:8px}
    @media print{body{margin:10px}.boxes{page-break-inside:avoid}}
  </style></head><body>
  <div class="co-block">
    <div class="co">${companyName||'Epsilon Enterprise'}</div>
    <div class="co-sub">${[companyData?.address,companyData?.city,companyData?.state].filter(Boolean).join(', ')||''}</div>
    ${companyData?.gstin?`<div class="co-sub">GSTIN: ${companyData.gstin}</div>`:''}
  </div>
  <div class="title">BANK TRANSACTION STATEMENT</div>
  <div class="period">Period: ${dateFrom?fmtD(dateFrom):'All dates'}${dateTo?' to '+fmtD(dateTo):''} &nbsp;|&nbsp; Printed: ${new Date().toLocaleDateString('en-IN')}</div>
  ${bankBlock}
  <table><thead><tr>
    <th>#</th><th>Date</th><th>Type</th><th>Party</th>
    ${showBankCol?'<th>Bank</th>':''}
    <th>Reference</th><th>Mode</th><th>Notes</th><th class="r">Amount (₹)</th><th>Status</th>
  </tr></thead><tbody>
  ${rows.map((r,i)=>`<tr>
    <td>${i+1}</td><td>${fmtD(r.date)}</td>
    <td style="color:${r.type==='receipt'?'#1b5e20':'#b71c1c'};font-weight:bold">${r.type==='receipt'?'▲ Receipt':'▼ Payment'}</td>
    <td>${r.entityName||'—'}</td>
    ${showBankCol?`<td style="font-size:9px">${r.bankId?(bankLookup[String(r.bankId)]||'#'+r.bankId):'—'}</td>`:''}
    <td>${r.referenceNo||'—'}</td><td>${r.paymentMode||'—'}</td><td>${r.notes||'—'}</td>
    <td class="r" style="color:${r.type==='receipt'?'#1b5e20':'#b71c1c'};font-weight:bold">₹${fmt(r.amount)}</td>
    <td>${r.status||'—'}</td></tr>`).join('')}
  </tbody><tfoot><tr>
    <td colspan="${showBankCol?8:7}" class="r">Total Entries: ${rows.length}</td>
    <td class="r">₹${fmt(rows.reduce((s,r)=>s+(parseFloat(r.amount)||0),0))}</td><td></td>
  </tr></tfoot></table>
  <div class="boxes">
    <div class="box"><div style="font-size:9px;color:#666">Total Receipts (IN)</div><div style="font-size:16px;font-weight:bold;color:#1b5e20">₹${fmt(totalReceipt)}</div></div>
    <div class="box"><div style="font-size:9px;color:#666">Total Payments (OUT)</div><div style="font-size:16px;font-weight:bold;color:#b71c1c">₹${fmt(totalPayment)}</div></div>
    <div class="box" style="border-color:#104f4f"><div style="font-size:9px;color:#666">Net Balance</div><div style="font-size:16px;font-weight:bold;color:#104f4f">₹${fmt(totalReceipt-totalPayment)}</div></div>
  </div>
  <div class="sig">
    <span>Generated by Epsilon ERP</span>
    <span>Printed: ${new Date().toLocaleString('en-IN')}</span>
    <span style="border-top:1px solid #000;padding-top:4px;min-width:150px;text-align:center">Authorised Signatory</span>
  </div></body></html>`;
  const w = window.open('','_blank'); w.document.write(html); w.document.close(); w.onload = () => w.print();
}

/* ────────────────────────────────────────────────────────── */
/* Main Component                                             */
/* ────────────────────────────────────────────────────────── */
export default function StatementView() {
  const { selectedCompany } = useCompany();
  const cid         = selectedCompany?.companyId;
  const companyName = selectedCompany?.companyName;

  const [payments,    setPayments]    = useState([]);
  const [banks,       setBanks]       = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState('');
  const [editRow,     setEditRow]     = useState(null);
  const [deletingId,  setDeletingId]  = useState(null);
  const [msg,         setMsg]         = useState('');

  const [bankId,   setBankId]   = useState('');
  const [typeF,    setTypeF]    = useState('all');
  const [party,    setParty]    = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo,   setDateTo]   = useState('');

  const load = useCallback(async () => {
    if (!cid) return;
    setLoading(true); setError('');
    try {
      const [pmtRes, bankRes] = await Promise.all([
        axios.get(`/api/accounts/payments?companyId=${cid}`),
        axios.get(`/api/accounts/banks?companyId=${cid}`),
      ]);
      setPayments(pmtRes.data.filter(p => p.type === 'payment' || p.type === 'receipt'));
      setBanks(bankRes.data);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [cid]);

  useEffect(() => { load(); }, [load]);

  const filtered = payments.filter(r => {
    if (bankId && String(r.bankId) !== bankId) return false;
    if (typeF !== 'all' && r.type !== typeF) return false;
    if (party && !(r.entityName||'').toLowerCase().includes(party.toLowerCase()) &&
        !(r.referenceNo||'').toLowerCase().includes(party.toLowerCase())) return false;
    if (dateFrom && r.date < dateFrom) return false;
    if (dateTo   && r.date > dateTo)   return false;
    return true;
  });

  const totalIn  = filtered.filter(r => r.type === 'receipt').reduce((s,r) => s + (parseFloat(r.amount)||0), 0);
  const totalOut = filtered.filter(r => r.type === 'payment').reduce((s,r) => s + (parseFloat(r.amount)||0), 0);
  const selectedBank = banks.find(b => String(b.bankId) === bankId) || null;

  const handleDelete = async (row) => {
    if (!window.confirm(`Delete this ${row.type === 'receipt' ? 'receipt' : 'payment'} entry of ₹${fmt(row.amount)} for ${row.entityName || '—'}?\n\nThis cannot be undone.`)) return;
    setDeletingId(row.paymentId);
    try {
      await axios.delete(`/api/accounts/payments/${row.paymentId}?companyId=${cid}`);
      setMsg('Transaction deleted.');
      load();
    } catch (e) { setMsg('Error: ' + (e.response?.data?.error || e.message)); }
    setDeletingId(null);
    setTimeout(() => setMsg(''), 3000);
  };

  const inpStyle = { height: 32, padding: '0 10px', border: `1px solid ${BD}`, borderRadius: 6,
    fontSize: 12, fontFamily: F, boxSizing: 'border-box', outline: 'none', background: '#fff' };

  return (
    <div style={{ fontFamily: F, fontSize: 12, padding: 8 }}>
      {editRow && (
        <EditModal
          row={editRow} banks={banks} companyId={cid}
          onClose={() => setEditRow(null)}
          onSaved={() => { setEditRow(null); load(); setMsg('Transaction updated.'); setTimeout(() => setMsg(''), 3000); }}
        />
      )}

      {/* Header bar */}
      <div style={{ background: P, color: '#fff', padding: '6px 12px', borderRadius: '6px 6px 0 0',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span style={{ fontWeight: 700, fontSize: 14 }}>💳 Bank Transaction Statement</span>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            onClick={() => printBankStatement(filtered, selectedBank, dateFrom, dateTo, companyName, selectedCompany, banks)}
            style={{ height: 30, padding: '0 14px', background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)',
              color: '#fff', borderRadius: 5, cursor: 'pointer', fontSize: 12, fontFamily: F, fontWeight: 600 }}>
            🖨 Print Statement
          </button>
          <button onClick={load}
            style={{ height: 30, padding: '0 14px', background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)',
              color: '#fff', borderRadius: 5, cursor: 'pointer', fontSize: 12, fontFamily: F }}>
            ↻ Refresh
          </button>
        </div>
      </div>

      {error && <div style={{ background:'#ffe0e0', border:'1px solid #cc4444', color:'#880000', padding:'4px 8px', marginBottom:6, fontSize:11, borderRadius:5 }}>Error: {error}</div>}
      {msg   && <div style={{ background: msg.startsWith('Error') ? '#ffe0e0' : '#e8f5e9',
        border: `1px solid ${msg.startsWith('Error') ? '#cc4444' : '#66bb6a'}`,
        color: msg.startsWith('Error') ? '#880000' : '#1b5e20',
        padding:'4px 8px', marginBottom:6, fontSize:11, borderRadius:5 }}>{msg}</div>}

      {/* Filters */}
      <div style={{ background: '#fff', border: `1px solid ${BD}`, borderRadius: 8, padding: '10px 14px',
        marginBottom: 8, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <label style={{ fontSize: 11, fontWeight: 700, color: '#444' }}>Bank:</label>
        <select value={bankId} onChange={e => setBankId(e.target.value)}
          style={{ ...inpStyle, width: 200, cursor: 'pointer' }}>
          <option value="">— All Banks —</option>
          {banks.map(b => <option key={b.bankId} value={b.bankId}>{b.bankName} ({b.accountNumber})</option>)}
        </select>

        <select value={typeF} onChange={e => setTypeF(e.target.value)}
          style={{ ...inpStyle, width: 115, cursor: 'pointer' }}>
          <option value="all">All Types</option>
          <option value="receipt">▲ Receipt</option>
          <option value="payment">▼ Payment</option>
        </select>

        <input value={party} onChange={e => setParty(e.target.value)} placeholder="Party / Reference…"
          style={{ ...inpStyle, width: 160 }} />

        <label style={{ fontSize: 11 }}>From:</label>
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={{ ...inpStyle, width: 120 }} />
        <label style={{ fontSize: 11 }}>To:</label>
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={{ ...inpStyle, width: 120 }} />

        <button onClick={() => { setBankId(''); setTypeF('all'); setParty(''); setDateFrom(''); setDateTo(''); }}
          style={{ ...inpStyle, width: 'auto', padding: '0 12px', cursor: 'pointer', background: '#fff3f3',
            border: '1px solid #ffb3b3', color: '#880000', fontWeight: 600 }}>✕ Clear</button>

        <span style={{ marginLeft: 'auto', fontSize: 11, color: '#666', fontWeight: 600 }}>
          {filtered.length} transaction{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Bank detail strip */}
      {selectedBank && (
        <div style={{ background: '#EEF4FF', border: `1px solid ${BD}`, borderRadius: 6, padding: '6px 12px',
          marginBottom: 6, fontSize: 11, display: 'flex', gap: 20 }}>
          <span><b>Bank:</b> {selectedBank.bankName}</span>
          <span><b>A/C:</b> <span style={{ fontFamily: 'monospace' }}>{selectedBank.accountNumber}</span></span>
          <span><b>IFSC:</b> {selectedBank.ifscCode || '—'}</span>
          <span><b>Type:</b> {selectedBank.accountType}</span>
          {selectedBank.accountHolder && <span><b>Holder:</b> {selectedBank.accountHolder}</span>}
        </div>
      )}

      {/* Summary cards */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        {[
          { label: 'Total Receipts (IN)',  val: `₹${fmt(totalIn)}`,           color: '#1b5e20', bg: '#e8f5e9', border: '#a5d6a7' },
          { label: 'Total Payments (OUT)', val: `₹${fmt(totalOut)}`,           color: '#b71c1c', bg: '#fbe9e7', border: '#ef9a9a' },
          { label: 'Net Balance',          val: `₹${fmt(totalIn - totalOut)}`, color: P,         bg: '#e3f2fd', border: '#90caf9' },
          { label: 'Transactions',         val: filtered.length,               color: '#555',    bg: '#fafafa', border: BD },
        ].map(c => (
          <div key={c.label} style={{ flex: 1, background: c.bg, border: `1px solid ${c.border}`,
            borderRadius: 7, padding: '6px 12px', textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: '#666', marginBottom: 2 }}>{c.label}</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: c.color }}>{c.val}</div>
          </div>
        ))}
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#888', fontSize: 13 }}>Loading transactions…</div>
      ) : (
        <div style={{ border: `1px solid ${BD}`, borderRadius: 8, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, fontFamily: F }}>
            <thead>
              <tr style={{ background: P }}>
                {['#','Date','Type','Party / Entity','Reference No.','Mode','Bank','Amount (₹)','Status','Actions'].map((h, i) => (
                  <th key={i} style={{ padding: '6px 8px', color: '#fff', fontWeight: 700, fontSize: 10,
                    textAlign: [7].includes(i) ? 'right' : 'left',
                    whiteSpace: 'nowrap', borderRight: '1px solid rgba(255,255,255,0.15)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={10} style={{ padding: 30, textAlign: 'center', color: '#888', fontStyle: 'italic' }}>
                    No transactions found
                  </td>
                </tr>
              )}
              {filtered.map((r, i) => {
                const isReceipt = r.type === 'receipt';
                const bk        = banks.find(b => String(b.bankId) === String(r.bankId));
                const rowBg     = i % 2 === 0 ? '#fff' : '#f9fbff';
                return (
                  <tr key={r.paymentId} style={{ background: rowBg, transition: 'background 0.15s' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#EEF4FF'}
                    onMouseLeave={e => e.currentTarget.style.background = rowBg}>
                    <td style={{ padding: '4px 8px', color: '#aaa', borderBottom: '1px solid #eee', fontSize: 10 }}>{i+1}</td>
                    <td style={{ padding: '4px 8px', borderBottom: '1px solid #eee', whiteSpace: 'nowrap', fontWeight: 600 }}>{fmtD(r.date)}</td>
                    <td style={{ padding: '4px 8px', borderBottom: '1px solid #eee', whiteSpace: 'nowrap' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 700,
                        color: isReceipt ? '#1b5e20' : '#b71c1c',
                        background: isReceipt ? '#e8f5e9' : '#fbe9e7',
                        border: `1px solid ${isReceipt ? '#a5d6a7' : '#ef9a9a'}`,
                        borderRadius: 4, padding: '1px 6px' }}>
                        {isReceipt ? '▲ Receipt' : '▼ Payment'}
                      </span>
                    </td>
                    <td style={{ padding: '4px 8px', borderBottom: '1px solid #eee', fontWeight: 600 }}>{r.entityName || '—'}</td>
                    <td style={{ padding: '4px 8px', borderBottom: '1px solid #eee', fontFamily: 'monospace', fontSize: 10, color: '#444' }}>{r.referenceNo || '—'}</td>
                    <td style={{ padding: '4px 8px', borderBottom: '1px solid #eee', fontSize: 10 }}>{r.paymentMode || '—'}</td>
                    <td style={{ padding: '4px 8px', borderBottom: '1px solid #eee', fontSize: 10, color: '#555' }}>
                      {bk ? bk.bankName : r.bankId ? `#${r.bankId}` : '—'}
                    </td>
                    <td style={{ padding: '4px 8px', borderBottom: '1px solid #eee', textAlign: 'right', fontWeight: 700,
                      fontSize: 12, color: isReceipt ? '#1b5e20' : '#b71c1c' }}>
                      ₹{fmt(r.amount)}
                    </td>
                    <td style={{ padding: '4px 8px', borderBottom: '1px solid #eee' }}>
                      <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
                        background: r.status === 'confirmed' ? '#d8f0d8' : r.status === 'pending' ? '#fff3e0' : '#f0f0f0',
                        color:      r.status === 'confirmed' ? '#005500' : r.status === 'pending' ? '#b06000' : '#555',
                        border: '1px solid #ddd' }}>
                        {r.status || 'draft'}
                      </span>
                    </td>
                    <td style={{ padding: '4px 8px', borderBottom: '1px solid #eee', whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button
                          onClick={() => setEditRow(r)}
                          title="Edit transaction"
                          style={{ height: 24, padding: '0 8px', fontSize: 10, fontWeight: 700, cursor: 'pointer',
                            background: '#EEF4FF', border: `1px solid ${BD}`, color: P, borderRadius: 4,
                            fontFamily: F }}>
                          ✏️ Edit
                        </button>
                        <button
                          onClick={() => handleDelete(r)}
                          disabled={deletingId === r.paymentId}
                          title="Delete transaction"
                          style={{ height: 24, padding: '0 8px', fontSize: 10, fontWeight: 700, cursor: 'pointer',
                            background: '#fff3f3', border: '1px solid #ffb3b3', color: '#cc0000', borderRadius: 4,
                            fontFamily: F, opacity: deletingId === r.paymentId ? 0.5 : 1 }}>
                          {deletingId === r.paymentId ? '…' : '🗑 Delete'}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr style={{ background: '#F0F4FF', fontWeight: 700 }}>
                <td colSpan={7} style={{ padding: '5px 8px', textAlign: 'right', fontSize: 11 }}>
                  Total ({filtered.length} entries):
                </td>
                <td style={{ padding: '5px 8px', textAlign: 'right', color: P, fontSize: 12 }}>
                  ₹{fmt(filtered.reduce((s, r) => s + (parseFloat(r.amount)||0), 0))}
                </td>
                <td colSpan={2}></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
