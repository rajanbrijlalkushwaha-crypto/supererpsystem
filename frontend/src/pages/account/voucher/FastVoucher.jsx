/* FastVoucher — one quick-entry screen for Payment and Receipt vouchers.
 *
 * Tally-style flow, all on one screen and keyboard friendly:
 *   Date → Party (type to search: vendors + ledgers for payments, clients for receipts)
 *   → tick the open PO / SO / expense bills it settles (amount fills with the balance)
 *   → Mode / Bank / Ref → Ctrl+S to save. Date, mode and bank stay for the next entry.
 *
 * Records saved are the same as the old forms:
 *   payment, vendor  → one record; poAllocations holds the split over the ticked POs (₹ per PO), status pending
 *   payment, ledger  → one record covering the ticked expenses (linkedExpenses), status pending
 *   receipt, client  → one record per ticked sales order, status confirmed
 * Edit (payment only): /account/payment/create?edit=<paymentId> — updates that record and
 * sends it back for approval.
 */
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import axios from 'axios';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useCompany } from '../../../context/CompanyContext';

const MODES      = ['Bank Transfer', 'NEFT', 'RTGS', 'Cheque', 'UPI', 'Cash'];
const BANK_MODES = ['Bank Transfer', 'NEFT', 'RTGS', 'Cheque'];
const F   = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const BD  = '#E5EAF2';
const INK = '#104f4f';

const fmt   = n => (parseFloat(n) || 0).toFixed(2);
const money = n => '₹' + (parseFloat(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtD  = d => { if (!d) return '—'; const t = new Date(d); return isNaN(t) ? d : `${String(t.getDate()).padStart(2,'0')}-${String(t.getMonth()+1).padStart(2,'0')}-${t.getFullYear()}`; };
const today = () => new Date().toISOString().slice(0, 10);
const norm  = v => String(v || '').toLowerCase().trim();

/* order value — the saved grand total, else rebuilt from items + charges */
const orderValue = o => {
  const gt = parseFloat(o.grandTotal);
  if (gt > 0) return gt;
  const items = (o.items || []).reduce((s, it) => {
    const base = (parseFloat(it.qty || it.quantity) || 0) * (parseFloat(it.rate) || 0);
    const disc = it.discountType === '%' ? base * (parseFloat(it.discount) || 0) / 100 : (parseFloat(it.discount) || 0);
    return s + (base - disc) * (1 + (parseFloat(it.gstPercent || it.gst) || 0) / 100);
  }, 0);
  const chg = (o.charges || []).reduce((s, c) => { const a = parseFloat(c.amount) || 0; return s + a + a * (parseFloat(c.gst) || 0) / 100; }, 0);
  return items + chg + (parseFloat(o.freightCharges) || 0) + (parseFloat(o.packingCharges) || 0) - (parseFloat(o.overallDiscount) || 0) + (parseFloat(o.roundOff) || 0);
};

/* what a payment paid towards one PO — its PO-wise split, or the whole amount for an old single-PO payment */
export const paidForPo = (p, oid) => (Array.isArray(p.poAllocations) && p.poAllocations.length
  ? p.poAllocations.filter(a => String(a.orderId) === String(oid)).reduce((s, a) => s + (parseFloat(a.amount) || 0), 0)
  : String(p.orderId) === String(oid) ? parseFloat(p.amount) || 0 : 0);

const lastBankKey = t => `fastvoucher-bank-${t}`;
const readLS  = k => { try { return localStorage.getItem(k) || ''; } catch { return ''; } };
const writeLS = (k, v) => { try { localStorage.setItem(k, v); } catch { /* storage blocked */ } };

export default function FastVoucher({ type = 'payment' }) {
  const isPay = type === 'payment';
  const { selectedCompany } = useCompany();
  const cid = selectedCompany?.companyId;
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const editId = isPay ? searchParams.get('edit') : null;

  /* ── master data ── */
  const [vendors, setVendors]   = useState([]);
  const [ledgers, setLedgers]   = useState([]);
  const [clients, setClients]   = useState([]);
  const [banks, setBanks]       = useState([]);
  const [payments, setPayments] = useState([]);
  const [pos, setPos]           = useState([]);
  const [sos, setSos]           = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [loaded, setLoaded]     = useState(false);

  const loadAll = useCallback(async () => {
    if (!cid) return;
    const get = u => axios.get(u).then(r => (Array.isArray(r.data) ? r.data : [])).catch(() => []);
    const q = `companyId=${cid}`;
    const [b, p, s] = await Promise.all([get(`/api/accounts/banks?${q}`), get(`/api/accounts/payments?${q}`), get(`/api/sales-orders?${q}`)]);
    setBanks(b.filter(x => x.status === 'active')); setPayments(p); setSos(s);
    if (isPay) {
      const [v, l, o, e] = await Promise.all([get(`/api/vendors?${q}`), get(`/api/ledger/accounts?${q}`), get(`/api/purchase-orders?${q}`), get(`/api/accounts/expenses?${q}`)]);
      setVendors(v); setLedgers(l); setPos(o); setExpenses(e);
    } else {
      setClients(await get(`/api/clients?${q}`));
    }
    setLoaded(true);
  }, [cid, isPay]);
  useEffect(() => { loadAll(); }, [loadAll]);

  /* ── voucher state ── */
  const [date, setDate]   = useState(today());
  const [party, setParty] = useState(null);          // { kind:'vendor'|'ledger'|'client', id, name, sub, raw }
  const [picked, setPicked] = useState({});          // rowId → amount string
  const [onAcct, setOnAcct] = useState('');          // amount when nothing is ticked (payment)
  const [mode, setMode]   = useState('Bank Transfer');
  const [bankId, setBankId] = useState('');
  const [refNo, setRefNo] = useState('');
  const [notes, setNotes] = useState('');
  const [showSettled, setShowSettled] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg]     = useState(null);          // { ok, text }
  const [editing, setEditing] = useState(null);
  const [advice, setAdvice] = useState(null);        // { paymentId, partyName, amount, email }

  /* default bank: last one used for this voucher type, else the only bank */
  useEffect(() => {
    if (bankId || !banks.length) return;
    const last = readLS(lastBankKey(type));
    if (last && banks.some(b => String(b.bankId) === last)) setBankId(last);
    else if (banks.length === 1) setBankId(String(banks[0].bankId));
  }, [banks, bankId, type]);

  /* ── party search ── */
  const parties = useMemo(() => isPay
    ? [
        ...vendors.map(v => ({ kind: 'vendor', id: v.vendorId, name: v.vendorName || v.companyName || '', sub: [v.vendorCode, v.city, v.gstin].filter(Boolean).join(' · '), raw: v })),
        ...ledgers.map(l => ({ kind: 'ledger', id: l.id, name: l.name || '', sub: [l.groupName, l.code].filter(Boolean).join(' · '), raw: l })),
      ]
    : clients.map(c => ({ kind: 'client', id: c.clientId, name: c.clientName || c.companyName || '', sub: [c.clientId, c.city, c.gstin || c.gst].filter(Boolean).join(' · '), raw: c })),
  [isPay, vendors, ledgers, clients]);

  const [pq, setPq] = useState('');
  const [pOpen, setPOpen] = useState(false);
  const [pIdx, setPIdx] = useState(0);
  const partyRef = useRef(null);
  const matches = useMemo(() => {
    const t = norm(pq);
    const list = t ? parties.filter(p => norm(p.name + ' ' + p.sub).includes(t)) : parties;
    return list.filter(p => p.name).slice(0, 12);
  }, [pq, parties]);

  const choose = p => {
    setParty(p); setPq(p.name); setPOpen(false); setPicked({}); setOnAcct(''); setMsg(null);
  };

  /* ── open bills for the chosen party ── */
  const soById = useMemo(() => { const m = {}; sos.forEach(o => { m[String(o.orderId)] = o; }); return m; }, [sos]);
  const notThis = p => !editId || String(p.paymentId) !== String(editId);

  const rows = useMemo(() => {
    if (!party) return [];
    if (party.kind === 'vendor') {
      const v = party.raw, vn = norm(v.vendorName || v.companyName), vc = String(v.vendorCode || v.vendorId || '');
      return pos.filter(o => (vc && (String(o.vendorCode || '') === vc || String(o.vendorId || '') === vc)) || (vn && norm(o.vendorName) === vn))
        .map(o => {
          const value = orderValue(o);
          const done = payments.filter(p => p.type === 'payment' && p.status === 'confirmed' && notThis(p))
            .reduce((s, p) => s + paidForPo(p, o.orderId), 0);
          return { id: String(o.orderId), no: o.poNo || o.poNumber || `PO #${o.orderId}`, fileNo: soById[String(o.linkedSalesOrderId || '')]?.orderNo || '',
            date: o.poDate || o.date, value, done, bal: Math.max(0, value - done), status: o.status };
        }).sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
    }
    if (party.kind === 'ledger') {
      const l = party.raw;
      return expenses.filter(e => !['rejected', 'draft'].includes(e.status)
          && (norm(e.ledgerName) === norm(l.name) || String(e.ledgerId || '') === String(l.id || '')))
        .map(e => {
          const value = parseFloat(e.grandTotal || e.amount) || 0;
          const done = payments.filter(p => p.type === 'payment' && p.status !== 'rejected' && notThis(p)
              && (String(p.expenseId) === String(e.expenseId) || String(p.orderId) === String(e.expenseId)
                  || (p.linkedExpenses || []).some(x => String(x.expenseId) === String(e.expenseId))))
            .reduce((s, p) => {
              const link = (p.linkedExpenses || []).find(x => String(x.expenseId) === String(e.expenseId));
              return s + (link ? (parseFloat(link.amount) || 0) : (parseFloat(p.amount) || 0));
            }, 0);
          return { id: String(e.expenseId), no: `EXP-${e.expenseId}`, fileNo: e.orderNo || '', date: e.date, value, done,
            bal: Math.max(0, value - done), desc: e.description || e.expenseCategory || e.category || '' };
        }).sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
    }
    const c = party.raw, cn = norm(c.clientName || c.companyName);
    return sos.filter(o => o.status !== 'cancelled' && (String(o.clientId || o.customerCode || '') === String(c.clientId) || norm(o.customerName) === cn))
      .map(o => {
        const value = orderValue(o);
        const done = payments.filter(p => p.type === 'receipt' && String(p.orderId) === String(o.orderId) && p.status === 'confirmed')
          .reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
        return { id: String(o.orderId), no: o.orderNo || `SO #${o.orderId}`, fileNo: o.orderNo || '', clientPO: o.customerPO || '',
          date: o.orderDate || o.date, value, done, bal: Math.max(0, value - done), raw: o };
      }).sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [party, pos, sos, expenses, payments, soById, editId]);

  const visibleRows = rows.filter(r => showSettled || r.bal > 0.005 || picked[r.id] !== undefined);
  const settledCount = rows.length - rows.filter(r => r.bal > 0.005).length;
  const toggle = r => setPicked(p => {
    const n = { ...p };
    if (n[r.id] !== undefined) delete n[r.id]; else n[r.id] = (r.bal > 0 ? r.bal : r.value).toFixed(2);
    return n;
  });
  const pickedRows = rows.filter(r => picked[r.id] !== undefined);
  const total = pickedRows.length ? pickedRows.reduce((s, r) => s + (parseFloat(picked[r.id]) || 0), 0) : (parseFloat(onAcct) || 0);
  const totalBal = rows.reduce((s, r) => s + r.bal, 0);
  const needsBank = BANK_MODES.includes(mode);

  /* ── edit: load the saved payment into the form ── */
  const editLoaded = useRef(false);
  useEffect(() => {
    if (!editId || editLoaded.current || !loaded) return;
    const p = payments.find(x => String(x.paymentId) === String(editId));
    if (!p) return;
    editLoaded.current = true;
    setEditing(p);
    const pt = parties.find(x => (p.entityType === 'ledger' ? x.kind === 'ledger' : x.kind === 'vendor')
        && (String(x.id) === String(p.entityId) || norm(x.name) === norm(p.entityName || p.party)));
    if (pt) { setParty(pt); setPq(pt.name); }
    setDate((p.date || '').slice(0, 10) || today());
    setMode(p.paymentMode || 'Bank Transfer'); setBankId(p.bankId ? String(p.bankId) : '');
    setRefNo(p.referenceNo || p.reference || ''); setNotes(p.notes || p.purpose || '');
    if (p.entityType === 'ledger' && (p.linkedExpenses || []).length) {
      const m = {}; p.linkedExpenses.forEach(x => { m[String(x.expenseId)] = fmt(x.amount); }); setPicked(m);
    } else if ((p.poAllocations || []).length) {   // a payment split over several POs
      const m = {}; p.poAllocations.forEach(x => { m[String(x.orderId)] = fmt(x.amount); }); setPicked(m);
    } else if (p.orderId) setPicked({ [String(p.orderId)]: fmt(p.amount) });
    else setOnAcct(fmt(p.amount));
  }, [editId, loaded, payments, parties]);

  /* ── save ── */
  const resetForNext = () => {
    setParty(null); setPq(''); setPicked({}); setOnAcct(''); setRefNo(''); setNotes('');
    setTimeout(() => partyRef.current?.focus(), 50);
  };

  const save = async () => {
    if (saving) return;
    if (!party) { setMsg({ ok: false, text: `Select the ${isPay ? 'vendor / ledger' : 'client'} first.` }); partyRef.current?.focus(); return; }
    if (!isPay && pickedRows.length === 0) { setMsg({ ok: false, text: 'Tick at least one sales order this receipt is against.' }); return; }
    if (pickedRows.some(r => !(parseFloat(picked[r.id]) > 0))) { setMsg({ ok: false, text: 'Every ticked row needs an amount.' }); return; }
    if (!(total > 0)) { setMsg({ ok: false, text: 'Enter the amount.' }); return; }
    if (needsBank && !bankId) { setMsg({ ok: false, text: 'Select the bank account for this mode.' }); return; }
    if (party.kind === 'ledger' && !pickedRows.length && !notes.trim()) { setMsg({ ok: false, text: 'Write the purpose in Notes for a payment without an expense bill.' }); return; }

    setSaving(true); setMsg(null);
    const common = { date, paymentMode: mode, bankId: mode === 'Cash' ? '' : bankId, referenceNo: refNo, notes, companyId: cid };
    let okText = '';
    try {
      writeLS(lastBankKey(type), bankId);
      if (isPay && party.kind === 'ledger') {
        const body = { ...common, amount: fmt(total), type: 'payment', status: 'pending',
          entityType: 'ledger', entityId: party.id, entityName: party.name, party: party.name,
          orderId: pickedRows.length === 1 ? pickedRows[0].id : '', orderType: '',
          linkedExpenses: pickedRows.map(r => ({ expenseId: r.id, expNo: r.no, amount: parseFloat(picked[r.id]) || 0 })),
          purpose: notes || pickedRows.map(r => r.desc || r.no).join(', ') };
        if (editing) await axios.put(`/api/accounts/payments/${editing.paymentId}?companyId=${cid}`, body);
        else {
          const r = await axios.post(`/api/accounts/payments?companyId=${cid}`, body);
          setAdvice({ paymentId: r.data.paymentId, partyName: party.name, amount: total, email: party.raw.email || '' });
          okText = `✓ Payment saved — ${money(total)} to ${party.name}, sent for approval.`;
        }
      } else if (isPay) {
        // one payment = one record (one bank transaction); poAllocations says how much went to each PO
        const poAllocations = pickedRows.map(r => ({ orderId: r.id, poNo: r.no, amount: parseFloat(picked[r.id]) || 0 }));
        const body = { ...common, amount: fmt(total), type: 'payment', status: 'pending',
          entityType: 'vendor', entityId: party.id, entityName: party.name, party: party.name,
          orderId: poAllocations[0]?.orderId || '', orderType: 'purchase', poAllocations, linkedExpenses: [], purpose: '' };
        if (editing) await axios.put(`/api/accounts/payments/${editing.paymentId}?companyId=${cid}`, body);
        else {
          const r = await axios.post(`/api/accounts/payments?companyId=${cid}`, body);
          setAdvice({ paymentId: r.data.paymentId, partyName: party.name, amount: total, email: party.raw.email || party.raw.vendorEmail || '' });
        }
        okText = `✓ Payment saved — ${money(total)} to ${party.name}${poAllocations.length > 1 ? ` (${poAllocations.map(a => `${a.poNo} ${money(a.amount)}`).join(' + ')})` : ''}, sent for approval.`;
      } else {
        const ids = [];
        for (const r of pickedRows) {
          const res = await axios.post(`/api/accounts/payments?companyId=${cid}`, {
            ...common, type: 'receipt', entityType: 'client', entityId: party.id, party: party.name, entityName: party.name,
            orderId: r.id, orderNo: r.raw?.orderNo || '', amount: fmt(picked[r.id]), orderType: 'sales', status: 'confirmed',
          });
          ids.push(res.data.paymentId);
        }
        okText = `✓ Receipt saved — ${money(total)} from ${party.name} (${ids.join(', ')})`;
      }
      if (editing) {
        setMsg({ ok: true, text: `✓ Payment #${editing.paymentId} updated and sent for approval.` });
        setTimeout(() => navigate(-1), 1100);
      } else {
        setMsg({ ok: true, text: okText });
        await loadAll();
        resetForNext();
      }
    } catch (e) {
      setMsg({ ok: false, text: 'Error: ' + (e.response?.data?.error || e.message) });
    }
    setSaving(false);
  };

  /* Ctrl+S saves from anywhere on the screen */
  const saveRef = useRef(save); saveRef.current = save;
  useEffect(() => {
    const h = e => { if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) { e.preventDefault(); saveRef.current(); } };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  /* ── ui ── */
  const box  = { background: '#fff', border: `1px solid ${BD}`, borderRadius: 12, boxShadow: '0 1px 3px rgba(16,24,40,0.06)' };
  const lbl  = { display: 'block', fontSize: 11, fontWeight: 700, color: '#475467', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.4px' };
  const inp  = { width: '100%', height: 38, padding: '0 11px', border: '1.5px solid #D0D5DD', borderRadius: 8, fontSize: 13.5, fontFamily: F, outline: 'none', boxSizing: 'border-box', background: '#fff', color: '#101828' };
  const kindTag = k => ({ vendor: ['Vendor', '#ECFDF3', '#067647'], ledger: ['Ledger', '#FFF6ED', '#B93815'], client: ['Client', '#EFF8FF', '#175CD3'] }[k]);
  const title = editId ? `Edit Payment — #${editId}` : isPay ? 'Payment Voucher' : 'Receipt Voucher';

  return (
    <div style={{ fontFamily: F, background: '#F2F4F7', minHeight: '100%', padding: '14px 16px 90px' }}>
      <style>{`.fv-in:focus{border-color:${INK} !important; box-shadow:0 0 0 3px rgba(16,79,79,0.14);} .fv-row:hover td{background:#F9FAFB;}`}</style>

      {/* title strip */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <div style={{ width: 38, height: 38, borderRadius: 10, background: isPay ? '#FEE4E2' : '#D1FADF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 19 }}>{isPay ? '💳' : '📥'}</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 17, fontWeight: 800, color: '#101828' }}>{title}</div>
          <div style={{ fontSize: 11.5, color: '#667085' }}>
            {editId ? 'Saving sends this payment back for approval.' : isPay ? 'Money paid out — saved for approval.' : 'Money received from a client.'}
            &nbsp;·&nbsp;<b>Ctrl+S</b> to save
          </div>
        </div>
        {editId && <button onClick={() => navigate(-1)} style={{ height: 34, padding: '0 14px', border: `1px solid ${BD}`, borderRadius: 8, background: '#fff', cursor: 'pointer', fontFamily: F, fontWeight: 600 }}>✕ Cancel</button>}
      </div>

      {msg && (
        <div role="status" style={{ ...box, padding: '9px 14px', marginBottom: 12, fontSize: 12.5, fontWeight: 600,
          background: msg.ok ? '#ECFDF3' : '#FEF3F2', color: msg.ok ? '#067647' : '#B42318', borderColor: msg.ok ? '#ABEFC6' : '#FECDCA' }}>{msg.text}</div>
      )}

      {/* ── 1. date + party ── */}
      <div style={{ ...box, padding: 16, marginBottom: 12, display: 'grid', gridTemplateColumns: '170px 1fr', gap: 14 }}>
        <div>
          <label style={lbl} htmlFor="fv-date">Date</label>
          <input id="fv-date" type="date" className="fv-in" value={date} onChange={e => setDate(e.target.value)} style={inp} />
        </div>
        <div style={{ position: 'relative' }}>
          <label style={lbl} htmlFor="fv-party">{isPay ? 'Paid to — vendor or ledger' : 'Received from — client'}</label>
          <input id="fv-party" ref={partyRef} className="fv-in" autoFocus={!editId} autoComplete="off" value={pq}
            placeholder={loaded ? `Type name, code, city or GSTIN…` : 'Loading…'}
            onChange={e => { setPq(e.target.value); setPOpen(true); setPIdx(0); if (party) { setParty(null); setPicked({}); } }}
            onFocus={() => setPOpen(true)} onBlur={() => setTimeout(() => setPOpen(false), 150)}
            onKeyDown={e => {
              if (!pOpen && e.key === 'ArrowDown') { setPOpen(true); return; }
              if (e.key === 'ArrowDown') { e.preventDefault(); setPIdx(i => Math.min(i + 1, matches.length - 1)); }
              if (e.key === 'ArrowUp')   { e.preventDefault(); setPIdx(i => Math.max(i - 1, 0)); }
              if (e.key === 'Enter' && pOpen && matches[pIdx]) { e.preventDefault(); choose(matches[pIdx]); }
              if (e.key === 'Escape') setPOpen(false);
            }}
            style={{ ...inp, fontWeight: party ? 700 : 400, paddingRight: party ? 90 : 11 }} />
          {party && (
            <span style={{ position: 'absolute', right: 10, top: 31, fontSize: 10.5, fontWeight: 800, padding: '3px 8px', borderRadius: 20,
              background: kindTag(party.kind)[1], color: kindTag(party.kind)[2] }}>{kindTag(party.kind)[0]}</span>
          )}
          {pOpen && !party && matches.length > 0 && (
            <div style={{ position: 'absolute', left: 0, right: 0, top: 66, zIndex: 50, background: '#fff', border: `1px solid ${BD}`, borderRadius: 10,
              boxShadow: '0 12px 32px rgba(16,24,40,0.16)', maxHeight: 320, overflowY: 'auto', padding: 4 }}>
              {matches.map((p, i) => {
                const [t, bg, fg] = kindTag(p.kind);
                return (
                  <div key={p.kind + p.id} onMouseDown={e => { e.preventDefault(); choose(p); }} onMouseEnter={() => setPIdx(i)}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', borderRadius: 7, cursor: 'pointer', background: i === pIdx ? '#F0F9FF' : 'transparent' }}>
                    <span style={{ fontSize: 9.5, fontWeight: 800, padding: '2px 7px', borderRadius: 20, background: bg, color: fg, flexShrink: 0 }}>{t}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#101828' }}>{p.name}</span>
                    <span style={{ fontSize: 11, color: '#98A2B3', marginLeft: 'auto', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.sub}</span>
                  </div>
                );
              })}
            </div>
          )}
          {party && (
            <div style={{ fontSize: 11.5, color: '#667085', marginTop: 5 }}>
              {party.sub || '—'}{rows.length > 0 && <> &nbsp;·&nbsp; Outstanding: <b style={{ color: totalBal > 0 ? '#B54708' : '#067647' }}>{money(totalBal)}</b></>}
            </div>
          )}
        </div>
      </div>

      {/* ── 2. against bills ── */}
      {party && (
        <div style={{ ...box, marginBottom: 12, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', padding: '10px 14px', borderBottom: `1px solid ${BD}` }}>
            <div style={{ fontSize: 12.5, fontWeight: 800, color: '#101828', flex: 1 }}>
              Against {party.kind === 'vendor' ? 'Purchase Orders' : party.kind === 'ledger' ? 'Expense Bills' : 'Sales Orders'}
              <span style={{ fontWeight: 500, color: '#667085' }}> — tick to settle; amount fills with the balance</span>
            </div>
            {settledCount > 0 && (
              <label style={{ fontSize: 11.5, color: '#475467', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                <input type="checkbox" checked={showSettled} onChange={e => setShowSettled(e.target.checked)} /> Show settled ({settledCount})
              </label>
            )}
          </div>
          {visibleRows.length === 0 ? (
            <div style={{ padding: '16px 14px', fontSize: 12.5, color: '#667085' }}>
              {rows.length === 0 ? 'No open bills for this party.' : 'Everything is settled.'}
              {isPay && ' Enter the amount below to record it on account.'}
            </div>
          ) : (
            <div style={{ maxHeight: 300, overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                <thead>
                  <tr>{['', party.kind === 'ledger' ? 'Expense' : party.kind === 'vendor' ? 'PO No' : 'SO No', 'File No', 'Date',
                        party.kind === 'ledger' ? 'Description' : party.kind === 'client' ? 'Client PO' : 'Status',
                        'Value', isPay ? 'Paid' : 'Received', 'Balance', 'Amount'].map((h, i) => (
                    <th key={i} style={{ position: 'sticky', top: 0, background: '#F9FAFB', padding: '7px 10px', fontSize: 10.5, fontWeight: 800, color: '#475467',
                      textTransform: 'uppercase', textAlign: i >= 5 ? 'right' : 'left', borderBottom: `1px solid ${BD}`, whiteSpace: 'nowrap' }}>{h}</th>
                  ))}</tr>
                </thead>
                <tbody>
                  {visibleRows.map(r => {
                    const on = picked[r.id] !== undefined;
                    const td = { padding: '7px 10px', borderBottom: `1px solid #F2F4F7`, background: on ? '#F0FDF9' : '#fff' };
                    return (
                      <tr key={r.id} className="fv-row" onClick={() => toggle(r)} style={{ cursor: 'pointer' }}>
                        <td style={{ ...td, width: 30 }}><input type="checkbox" checked={on} readOnly style={{ accentColor: INK, cursor: 'pointer' }} /></td>
                        <td style={{ ...td, fontWeight: 700, color: INK, whiteSpace: 'nowrap' }}>{r.no}</td>
                        <td style={{ ...td, whiteSpace: 'nowrap' }}>{r.fileNo || '—'}</td>
                        <td style={{ ...td, whiteSpace: 'nowrap' }}>{fmtD(r.date)}</td>
                        <td style={{ ...td, color: '#667085', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.desc || r.clientPO || r.status || '—'}</td>
                        <td style={{ ...td, textAlign: 'right' }}>{fmt(r.value)}</td>
                        <td style={{ ...td, textAlign: 'right', color: '#067647' }}>{fmt(r.done)}</td>
                        <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: r.bal > 0.005 ? '#B54708' : '#98A2B3' }}>{fmt(r.bal)}</td>
                        <td style={{ ...td, width: 160 }} onClick={e => e.stopPropagation()}>
                          <input className="fv-in" disabled={!on} value={on ? picked[r.id] : ''} inputMode="decimal"
                            onChange={e => setPicked(p => ({ ...p, [r.id]: e.target.value.replace(/[^0-9.]/g, '') }))}
                            style={{ ...inp, height: 30, textAlign: 'right', fontWeight: 700, background: on ? '#fff' : '#F9FAFB' }} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── 3. how it was paid ── */}
      <div style={{ ...box, padding: 16, marginBottom: 12 }}>
        <label style={lbl}>Mode</label>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
          {MODES.map(m => (
            <button key={m} type="button" onClick={() => setMode(m)}
              style={{ height: 32, padding: '0 14px', borderRadius: 20, cursor: 'pointer', fontFamily: F, fontSize: 12.5, fontWeight: 700,
                border: `1.5px solid ${mode === m ? INK : '#D0D5DD'}`, background: mode === m ? INK : '#fff', color: mode === m ? '#fff' : '#344054' }}>{m}</button>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: (isPay && !pickedRows.length) ? '1.2fr 1fr 1fr 1.4fr' : '1.2fr 1fr 1.6fr', gap: 12 }}>
          {isPay && !pickedRows.length && (
            <div>
              <label style={lbl} htmlFor="fv-amt">Amount (on account)</label>
              <input id="fv-amt" className="fv-in" value={onAcct} inputMode="decimal" placeholder="0.00"
                onChange={e => setOnAcct(e.target.value.replace(/[^0-9.]/g, ''))} style={{ ...inp, textAlign: 'right', fontWeight: 800 }} />
            </div>
          )}
          <div>
            <label style={lbl} htmlFor="fv-bank">Bank account {needsBank && <span style={{ color: '#D92D20' }}>*</span>}</label>
            <select id="fv-bank" className="fv-in" value={bankId} onChange={e => setBankId(e.target.value)} disabled={!needsBank && mode === 'Cash'} style={{ ...inp, cursor: 'pointer' }}>
              <option value="">{mode === 'Cash' ? 'Cash — no bank' : '— Select bank —'}</option>
              {banks.map(b => <option key={b.bankId} value={String(b.bankId)}>{b.bankName} — {b.accountNumber}</option>)}
            </select>
          </div>
          <div>
            <label style={lbl} htmlFor="fv-ref">{mode === 'Cheque' ? 'Cheque No.' : 'Ref / UTR No.'}</label>
            <input id="fv-ref" className="fv-in" value={refNo} onChange={e => setRefNo(e.target.value)} placeholder={mode === 'Cheque' ? 'Cheque number' : 'UTR / transaction ID'} style={inp} />
          </div>
          <div>
            <label style={lbl} htmlFor="fv-notes">Notes {party?.kind === 'ledger' && !pickedRows.length && <span style={{ color: '#D92D20' }}>* purpose</span>}</label>
            <input id="fv-notes" className="fv-in" value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. Advance against PO" style={inp} />
          </div>
        </div>
      </div>

      {/* ── sticky total + save ── */}
      <div style={{ position: 'sticky', bottom: 0, ...box, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 14, boxShadow: '0 -6px 20px rgba(16,24,40,0.08)' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#667085', textTransform: 'uppercase' }}>
            {isPay ? 'Total payment' : 'Total received'}{pickedRows.length > 1 ? ` · ${pickedRows.length} bills` : ''}
          </div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#101828', letterSpacing: '-0.5px' }}>{money(total)}</div>
        </div>
        {!editId && (
          <button type="button" onClick={resetForNext}
            style={{ height: 42, padding: '0 18px', border: `1px solid #D0D5DD`, borderRadius: 10, background: '#fff', cursor: 'pointer', fontFamily: F, fontWeight: 700, color: '#344054' }}>Clear</button>
        )}
        <button type="button" onClick={save} disabled={saving}
          style={{ height: 42, padding: '0 26px', border: 'none', borderRadius: 10, cursor: saving ? 'wait' : 'pointer', fontFamily: F, fontWeight: 800, fontSize: 14,
            background: isPay ? '#D92D20' : '#079455', color: '#fff', boxShadow: '0 6px 16px rgba(16,24,40,0.18)', opacity: saving ? 0.7 : 1 }}>
          {saving ? 'Saving…' : editId ? '💾 Save & Send for Approval' : isPay ? '💾 Save Payment' : '💾 Save Receipt'}
          <span style={{ fontSize: 10.5, fontWeight: 700, opacity: 0.8, marginLeft: 8 }}>Ctrl+S</span>
        </button>
      </div>

      {/* ── payment advice (after a single payment) ── */}
      {advice && <AdviceModal advice={advice} cid={cid} onClose={() => setAdvice(null)} />}
    </div>
  );
}

function AdviceModal({ advice, cid, onClose }) {
  const [email, setEmail] = useState(advice.email || '');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const send = async () => {
    if (!email.trim()) return;
    setBusy(true); setNote('');
    try {
      await axios.post(`/api/accounts/send-payment-advice?companyId=${cid}`, { paymentId: advice.paymentId, toEmail: email.trim(), companyId: cid });
      setNote('✓ Payment advice sent.'); setTimeout(onClose, 1500);
    } catch (e) { setNote('Error: ' + (e.response?.data?.error || e.message)); }
    setBusy(false);
  };
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(16,24,40,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 440, overflow: 'hidden', fontFamily: F, boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
        <div style={{ padding: '16px 18px', background: '#ECFDF3', borderBottom: '1px solid #ABEFC6' }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: '#067647' }}>✓ Payment PMT-{advice.paymentId} saved</div>
          <div style={{ fontSize: 12.5, color: '#067647', marginTop: 2 }}>{money(advice.amount)} to <b>{advice.partyName}</b> — sent for approval</div>
        </div>
        <div style={{ padding: 18 }}>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#475467', marginBottom: 5, textTransform: 'uppercase' }}>Email payment advice to (optional)</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="party@example.com" autoFocus
            style={{ width: '100%', height: 38, padding: '0 11px', border: '1.5px solid #D0D5DD', borderRadius: 8, fontSize: 13.5, fontFamily: F, boxSizing: 'border-box' }} />
          {note && <div style={{ fontSize: 12, marginTop: 8, fontWeight: 600, color: note.startsWith('✓') ? '#067647' : '#B42318' }}>{note}</div>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
            <button onClick={onClose} style={{ height: 36, padding: '0 16px', border: '1px solid #D0D5DD', borderRadius: 8, background: '#fff', cursor: 'pointer', fontFamily: F, fontWeight: 600 }}>Skip</button>
            <button onClick={send} disabled={busy || !email.trim()} style={{ height: 36, padding: '0 16px', border: 'none', borderRadius: 8, background: INK, color: '#fff', cursor: 'pointer', fontFamily: F, fontWeight: 700, opacity: busy || !email.trim() ? 0.6 : 1 }}>
              {busy ? 'Sending…' : '✉ Send Advice'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
