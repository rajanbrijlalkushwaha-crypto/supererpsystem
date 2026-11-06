import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { useCompany } from '../../../context/CompanyContext';
import { useAuth } from '../../../context/AuthContext';
import { withPrintFont } from '../../../utils/printFont';
import { brandLine } from '../../../utils/printBranding';

const F   = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const P   = '#104f4f';
const BD  = '#E5EAF2';
const fmt = n => (parseFloat(n) || 0).toFixed(2);
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
    status:      'pending',   // any edit goes back for approval
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
              <div style={{ ...inp(), display: 'flex', alignItems: 'center', background: '#FFFBEB', color: '#92400E', fontWeight: 600 }}>
                ⏳ Will be sent for approval
              </div>
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
function printBankStatement(rows, bank, dateFrom, dateTo, companyName, companyData, allBanks, user) {
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
    .page{border:2px solid #000;padding:14px}
    .co-block{text-align:center;border-bottom:2px solid #104f4f;padding-bottom:8px;margin-bottom:8px}
    .co{font-size:18px;font-weight:bold;color:#104f4f}
    .co-sub{font-size:10px;color:#555;margin-top:2px}
    .title{font-size:13px;font-weight:bold;text-align:center;padding:5px;border:2px solid #104f4f;margin:8px 0;color:#104f4f;letter-spacing:1px}
    .period{font-size:10px;color:#555;text-align:center;margin-bottom:8px}
    table{width:100%;border-collapse:collapse;font-size:10px}
    th,td{border:1px solid #000}
    th{background:#104f4f;color:#fff;padding:4px 7px;text-align:left}
    th.r,td.r{text-align:right}
    td{padding:3px 7px;color:#000}
    tfoot td{font-weight:bold;background:#f0f0f0;border-top:2px solid #104f4f}
    .boxes{display:flex;gap:16px;margin-top:14px}
    .box{flex:1;border:2px solid #000;padding:8px 10px;text-align:center}
    .sig{margin-top:30px;display:flex;justify-content:space-between;font-size:10px;color:#000;border-top:1px solid #000;padding-top:8px}
    @media print{body{margin:10px}.boxes{page-break-inside:avoid}}
  </style></head><body><div class="page">
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
    <span>${brandLine(user)}</span>
    <span>Printed: ${new Date().toLocaleString('en-IN')}</span>
    <span style="border-top:1px solid #000;padding-top:4px;min-width:150px;text-align:center">Authorised Signatory</span>
  </div></div></body></html>`;
  const w = window.open('','_blank'); w.document.write(withPrintFont(html)); w.document.close(); w.onload = () => w.print();
}

/* ────────────────────────────────────────────────────────── */
/* Main Component                                             */
/* ────────────────────────────────────────────────────────── */
export default function StatementView() {
  const { selectedCompany } = useCompany();
  const { user } = useAuth();
  const cid         = selectedCompany?.companyId;
  const companyName = selectedCompany?.companyName;

  const [payments,    setPayments]    = useState([]);
  const [banks,       setBanks]       = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState('');
  const [editRow,     setEditRow]     = useState(null);
  const navigate = useNavigate();
  const [deletingId,  setDeletingId]  = useState(null);
  const [msg,         setMsg]         = useState('');

  const [bankId,   setBankId]   = useState('');
  const [typeF,    setTypeF]    = useState('all');
  const [party,    setParty]    = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo,   setDateTo]   = useState('');
  const [inTally,  setInTally]  = useState(new Set());   // ERP entries approved as the same as a Tally voucher

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
      axios.get(`/api/tally-reports/bank/linked-ids?companyId=${cid}`)
        .then(r => setInTally(new Set(Array.isArray(r.data?.paymentIds) ? r.data.paymentIds : []))).catch(() => setInTally(new Set()));
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
  }).sort((a, b) => {
    // oldest first (start → end); entries without a date go last
    if (!a.date || !b.date) return (a.date ? 0 : 1) - (b.date ? 0 : 1);
    return a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
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

  /* ── bank-statement view: running balance + month groups ──
     The balance only makes sense for the full list of one account (or all), so it is
     shown when no type / party filter is applied. It starts from the bank's opening
     balance plus every confirmed entry before the From date; only confirmed entries
     move it (pending / rejected ones are listed but do not change the balance). */
  const showBal = typeF === 'all' && !party.trim();
  const signed  = r => (r.type === 'receipt' ? 1 : -1) * (parseFloat(r.amount) || 0);
  const counts  = r => r.status === 'confirmed';
  const opening = (() => {
    if (!showBal) return 0;
    const ob = selectedBank ? (parseFloat(selectedBank.openingBalance) || 0)
                            : banks.reduce((s, b) => s + (parseFloat(b.openingBalance) || 0), 0);
    if (!dateFrom) return ob;
    return ob + payments.filter(r => (!bankId || String(r.bankId) === bankId) && r.date && r.date < dateFrom && counts(r))
                        .reduce((s, r) => s + signed(r), 0);
  })();
  let running = opening;
  const groups = [];
  filtered.forEach(r => {
    if (counts(r)) running += signed(r);
    const key = r.date ? r.date.slice(0, 7) : 'none';
    let g = groups[groups.length - 1];
    if (!g || g.key !== key) { g = { key, rows: [], inAmt: 0, outAmt: 0 }; groups.push(g); }
    g.rows.push({ r, bal: running });
    if (r.type === 'receipt') g.inAmt += parseFloat(r.amount) || 0; else g.outAmt += parseFloat(r.amount) || 0;
  });
  const closing = running;
  const monthName = k => {
    if (k === 'none') return 'No date';
    const [y, m] = k.split('-');
    return new Date(+y, +m - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  };
  const bankName = id => { const b = banks.find(x => String(x.bankId) === String(id)); return b ? b.bankName : (id ? '—' : 'Cash'); };
  const money = n => (parseFloat(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const balTxt = v => (v < 0 ? '−' : '') + money(Math.abs(v));   // minus = overdrawn

  const ctl = { height: 32, padding: '0 10px', border: '1px solid #D0D5DD', borderRadius: 8, fontSize: 12.5, fontFamily: F,
    boxSizing: 'border-box', outline: 'none', background: '#fff', color: '#101828' };
  const th  = { position: 'sticky', top: 0, zIndex: 2, background: '#F9FAFB', padding: '8px 10px', fontSize: 10.5, fontWeight: 800,
    color: '#475467', textTransform: 'uppercase', letterSpacing: '0.3px', borderBottom: '1px solid #EAECF0', whiteSpace: 'nowrap', textAlign: 'left' };
  const td  = { padding: '7px 10px', borderBottom: '1px solid #F2F4F7', verticalAlign: 'top', fontSize: 12.5, color: '#101828' };
  const num = { textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' };
  const stat = s => s === 'confirmed' ? ['#ECFDF3', '#067647', 'Confirmed'] : s === 'pending' ? ['#FFFAEB', '#B54708', 'Pending'] : s === 'rejected' ? ['#FEF3F2', '#B42318', 'Rejected'] : ['#F2F4F7', '#475467', s || '—'];
  const iconBtn = (color, bg) => ({ width: 28, height: 28, border: '1px solid #EAECF0', borderRadius: 7, background: bg, color, cursor: 'pointer', fontSize: 12, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' });
  const anyFilter = bankId || typeF !== 'all' || party || dateFrom || dateTo;

  return (
    <div style={{ fontFamily: F, fontSize: 12, padding: '12px 14px', background: '#F2F4F7', height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 10 }}>
      {editRow && (
        <EditModal
          row={editRow} banks={banks} companyId={cid}
          onClose={() => setEditRow(null)}
          onSaved={() => { setEditRow(null); load(); setMsg('Transaction updated and sent for approval.'); setTimeout(() => setMsg(''), 3000); }}
        />
      )}

      {/* ── title + summary ── */}
      <div style={{ background: '#fff', border: '1px solid #EAECF0', borderRadius: 12, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap', flexShrink: 0 }}>
        <div style={{ minWidth: 220 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#101828' }}>🏦 Bank Statement</div>
          <div style={{ fontSize: 11.5, color: '#667085', marginTop: 2 }}>
            {selectedBank ? <>{selectedBank.bankName} · A/c <b style={{ fontFamily: 'monospace' }}>{selectedBank.accountNumber}</b>{selectedBank.ifscCode ? ` · IFSC ${selectedBank.ifscCode}` : ''}</> : 'All bank accounts'}
            {(dateFrom || dateTo) && <> · {dateFrom ? fmtD(dateFrom) : 'start'} → {dateTo ? fmtD(dateTo) : 'today'}</>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, flex: 1, flexWrap: 'wrap' }}>
          {[
            showBal && ['Opening', balTxt(opening), '#344054'],
            ['Deposits (In)', money(totalIn), '#067647'],
            ['Withdrawals (Out)', money(totalOut), '#B42318'],
            showBal ? ['Closing Balance', balTxt(closing), closing < 0 ? '#B42318' : '#175CD3'] : ['Net', money(totalIn - totalOut), '#175CD3'],
            ['Entries', String(filtered.length), '#344054'],
          ].filter(Boolean).map(([l, v, c]) => (
            <div key={l} style={{ flex: '1 1 130px', minWidth: 120, padding: '6px 12px', borderRadius: 10, background: '#F9FAFB', border: '1px solid #EAECF0' }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: '#667085', textTransform: 'uppercase' }}>{l}</div>
              <div style={{ fontSize: 15, fontWeight: 800, color: c, fontVariantNumeric: 'tabular-nums' }}>{l === 'Entries' ? v : '₹' + v}</div>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => printBankStatement(filtered, selectedBank, dateFrom, dateTo, companyName, selectedCompany, banks, user)}
            style={{ ...ctl, cursor: 'pointer', fontWeight: 700, background: '#104f4f', color: '#fff', border: 'none', padding: '0 14px' }}>🖨 Print</button>
          <button onClick={() => navigate('/account/tally-bank')} title="Match these entries with Tally's payments & receipts"
            style={{ ...ctl, cursor: 'pointer', fontWeight: 700, color: '#175CD3' }}>⇄ Match with Tally</button>
          <button onClick={load} title="Refresh" style={{ ...ctl, cursor: 'pointer', width: 34, padding: 0 }}>↻</button>
        </div>
      </div>

      {/* ── filters — one line ── */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', flexShrink: 0 }}>
        <select value={bankId} onChange={e => setBankId(e.target.value)} style={{ ...ctl, width: 230, cursor: 'pointer' }}>
          <option value="">All bank accounts</option>
          {banks.map(b => <option key={b.bankId} value={b.bankId}>{b.bankName} ({b.accountNumber})</option>)}
        </select>
        <div style={{ display: 'flex', background: '#fff', border: '1px solid #D0D5DD', borderRadius: 8, padding: 2 }}>
          {[['all', 'All'], ['receipt', '▲ Deposits'], ['payment', '▼ Withdrawals']].map(([v, l]) => (
            <button key={v} onClick={() => setTypeF(v)}
              style={{ height: 26, padding: '0 12px', border: 'none', borderRadius: 6, cursor: 'pointer', fontFamily: F, fontSize: 12, fontWeight: 700,
                background: typeF === v ? '#104f4f' : 'transparent', color: typeF === v ? '#fff' : '#475467' }}>{l}</button>
          ))}
        </div>
        <input value={party} onChange={e => setParty(e.target.value)} placeholder="🔍 Party or reference…" style={{ ...ctl, width: 220 }} />
        <span style={{ fontSize: 11.5, color: '#667085', fontWeight: 600 }}>From</span>
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={{ ...ctl, width: 140 }} />
        <span style={{ fontSize: 11.5, color: '#667085', fontWeight: 600 }}>To</span>
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={{ ...ctl, width: 140 }} />
        {anyFilter && (
          <button onClick={() => { setBankId(''); setTypeF('all'); setParty(''); setDateFrom(''); setDateTo(''); }}
            style={{ ...ctl, cursor: 'pointer', color: '#B42318', fontWeight: 700 }}>✕ Clear</button>
        )}
        {!showBal && <span style={{ fontSize: 11, color: '#B54708', marginLeft: 'auto' }}>Balance column hidden while a type / party filter is on</span>}
      </div>

      {error && <div style={{ background: '#FEF3F2', border: '1px solid #FECDCA', color: '#B42318', padding: '6px 10px', fontSize: 12, borderRadius: 8 }}>Error: {error}</div>}
      {msg && <div style={{ background: msg.startsWith('Error') ? '#FEF3F2' : '#ECFDF3', border: `1px solid ${msg.startsWith('Error') ? '#FECDCA' : '#ABEFC6'}`,
        color: msg.startsWith('Error') ? '#B42318' : '#067647', padding: '6px 10px', fontSize: 12, borderRadius: 8, fontWeight: 600 }}>{msg}</div>}

      {/* ── statement ── */}
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', background: '#fff', border: '1px solid #EAECF0', borderRadius: 12 }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#98A2B3' }}>Loading transactions…</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: F }}>
            <thead>
              <tr>
                <th style={{ ...th, width: 92 }}>Date</th>
                <th style={th}>Particulars</th>
                <th style={{ ...th, width: 120 }}>Mode / Bank</th>
                <th style={{ ...th, ...num, width: 130 }}>Withdrawal</th>
                <th style={{ ...th, ...num, width: 130 }}>Deposit</th>
                {showBal && <th style={{ ...th, ...num, width: 150 }}>Balance</th>}
                <th style={{ ...th, width: 92 }}>Status</th>
                <th style={{ ...th, width: 74 }}></th>
              </tr>
            </thead>
            <tbody>
              {showBal && (
                <tr>
                  <td style={{ ...td, color: '#667085' }}>{dateFrom ? fmtD(dateFrom) : ''}</td>
                  <td style={{ ...td, fontWeight: 800 }} colSpan={4}>Opening Balance</td>
                  <td style={{ ...td, ...num, fontWeight: 800 }}>{balTxt(opening)}</td>
                  <td style={td} colSpan={2}></td>
                </tr>
              )}
              {filtered.length === 0 && (
                <tr><td colSpan={8} style={{ padding: 30, textAlign: 'center', color: '#98A2B3', fontStyle: 'italic' }}>No transactions found</td></tr>
              )}
              {groups.map(g => (
                <React.Fragment key={g.key}>
                  <tr>
                    <td colSpan={showBal ? 8 : 7} style={{ padding: '6px 10px', background: '#F0F9FF', borderBottom: '1px solid #EAECF0', fontSize: 11.5 }}>
                      <b style={{ color: '#175CD3' }}>{monthName(g.key)}</b>
                      <span style={{ color: '#667085', marginLeft: 12 }}>{g.rows.length} entr{g.rows.length === 1 ? 'y' : 'ies'}</span>
                      <span style={{ color: '#B42318', marginLeft: 12 }}>Out ₹{money(g.outAmt)}</span>
                      <span style={{ color: '#067647', marginLeft: 12 }}>In ₹{money(g.inAmt)}</span>
                    </td>
                  </tr>
                  {g.rows.map(({ r, bal }) => {
                    const isIn = r.type === 'receipt';
                    const [sbg, sfg, slb] = stat(r.status);
                    const dim = r.status !== 'confirmed';
                    return (
                      <tr key={r.paymentId} style={{ opacity: r.status === 'rejected' ? 0.55 : 1 }}
                        onMouseEnter={e => { [...e.currentTarget.children].forEach(c => { c.style.background = '#F9FAFB'; }); }}
                        onMouseLeave={e => { [...e.currentTarget.children].forEach(c => { c.style.background = ''; }); }}>
                        <td style={{ ...td, whiteSpace: 'nowrap', fontWeight: 600 }}>{fmtD(r.date)}</td>
                        <td style={td}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: 9.5, fontWeight: 800, padding: '1px 6px', borderRadius: 4, background: isIn ? '#ECFDF3' : '#FEF3F2', color: isIn ? '#067647' : '#B42318' }}>
                              {isIn ? 'RCPT' : 'PMT'}
                            </span>
                            <span style={{ fontWeight: 700 }}>{r.entityName || r.party || '—'}</span>
                          </div>
                          <div style={{ fontSize: 11, color: '#667085', marginTop: 2 }}>
                            #{r.paymentId}
                            {(r.referenceNo || r.reference) && <> · Ref {r.referenceNo || r.reference}</>}
                            {r.orderNo && <> · {r.orderNo}</>}
                            {r.notes && <> · {r.notes}</>}
                          </div>
                        </td>
                        <td style={{ ...td, fontSize: 11.5 }}>
                          <div>{r.paymentMode || '—'}</div>
                          <div style={{ color: '#667085' }}>{bankName(r.bankId)}</div>
                        </td>
                        <td style={{ ...td, ...num, color: '#B42318', fontWeight: 700 }}>{!isIn ? money(r.amount) : ''}</td>
                        <td style={{ ...td, ...num, color: '#067647', fontWeight: 700 }}>{isIn ? money(r.amount) : ''}</td>
                        {showBal && <td style={{ ...td, ...num, fontWeight: 700, color: bal < 0 ? '#B42318' : '#101828', fontStyle: dim ? 'italic' : 'normal' }} title={dim ? 'Not confirmed — balance unchanged' : ''}>{balTxt(bal)}</td>}
                        <td style={td}>
                          <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: sbg, color: sfg, whiteSpace: 'nowrap' }}>{slb}</span>
                          {inTally.has(String(r.paymentId)) && <div style={{ fontSize: 10, fontWeight: 800, color: '#067647', marginTop: 3, whiteSpace: 'nowrap' }} title="Matched with Tally">✓ in Tally</div>}
                        </td>
                        <td style={{ ...td, whiteSpace: 'nowrap' }}>
                          <button title="Edit" onClick={() => r.type === 'receipt' ? setEditRow(r) : navigate(`/account/payment/create?edit=${r.paymentId}`)}
                            style={iconBtn('#175CD3', '#fff')}>✏️</button>{' '}
                          <button title="Delete" disabled={deletingId === r.paymentId} onClick={() => handleDelete(r)}
                            style={{ ...iconBtn('#B42318', '#fff'), opacity: deletingId === r.paymentId ? 0.5 : 1 }}>🗑</button>
                        </td>
                      </tr>
                    );
                  })}
                </React.Fragment>
              ))}
            </tbody>
            {filtered.length > 0 && (
              <tfoot>
                <tr>
                  {[
                    <td key="a" colSpan={3} style={{ fontWeight: 800 }}>Total · {filtered.length} entries</td>,
                    <td key="b" style={{ ...num, color: '#B42318', fontWeight: 800 }}>{money(totalOut)}</td>,
                    <td key="c" style={{ ...num, color: '#067647', fontWeight: 800 }}>{money(totalIn)}</td>,
                    showBal && <td key="d" style={{ ...num, fontWeight: 800 }}>{balTxt(closing)}</td>,
                    <td key="e" colSpan={2}></td>,
                  ].filter(Boolean).map(c => React.cloneElement(c, { style: { position: 'sticky', bottom: 0, background: '#F9FAFB', borderTop: '2px solid #EAECF0', padding: '9px 10px', fontSize: 12.5, ...c.props.style } }))}
                </tr>
              </tfoot>
            )}
          </table>
        )}
      </div>
    </div>
  );
}
