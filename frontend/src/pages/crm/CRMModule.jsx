/**
 * CRM Module — Quotes: Create | View | Pending
 */
import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useLocation, useNavigate } from 'react-router-dom';
import { useCompany } from '../../context/CompanyContext';

const N = '#2563EB';
const W = '#ffffff';
const F = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

const api = (url, cfg = {}) => axios({ url, ...cfg });
const fmt = n => `₹${(+n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const today = () => new Date().toISOString().slice(0, 10);
const uid = () => Date.now() + Math.random();
const fmtD = d => {
  if (!d) return '—';
  const dt = new Date(d);
  if (isNaN(dt)) return d;
  return `${String(dt.getDate()).padStart(2,'0')}-${String(dt.getMonth()+1).padStart(2,'0')}-${dt.getFullYear()}`;
};

/* ── Primitives ── */
function Btn({ children, onClick, v = 'def', disabled, type, small }) {
  const s = {
    def: { bg: '#d8d8d8', border: '1px solid #888', color: '#000' },
    pri: { bg: N, border: `1px solid #1a3050`, color: W, fw: 700 },
    dan: { bg: '#DC2626', border: `1px solid #991100`, color: W, fw: 700 },
    suc: { bg: '#006620', border: `1px solid #004410`, color: W, fw: 700 },
    war: { bg: '#b06000', border: `1px solid #7a4000`, color: W, fw: 700 },
  }[v] || {};
  return (
    <button type={type || 'button'} onClick={onClick} disabled={disabled}
      style={{
        background: s.bg, border: s.border, color: s.color || '#000',
        padding: small ? '0 7px' : '1px 12px', height: small ? 20 : 22,
        fontSize: small ? 10 : 11, fontFamily: F, fontWeight: s.fw || 400,
        cursor: disabled ? 'default' : 'pointer', borderRadius: 0,
        whiteSpace: 'nowrap', opacity: disabled ? 0.5 : 1,
      }}>
      {children}
    </button>
  );
}

function Inp({ value, onChange, type = 'text', placeholder, readOnly, disabled, style }) {
  return (
    <input type={type} value={value ?? ''} onChange={onChange}
      placeholder={placeholder} readOnly={readOnly} disabled={disabled}
      style={{
        height: 28, padding: '0 8px', border: '1px solid #9CA3AF', borderRadius: 4,
        fontSize: 12, fontFamily: F, color: '#111827',
        background: readOnly ? '#F9FAFB' : disabled ? '#F3F4F6' : W,
        outline: 'none', width: '100%', boxSizing: 'border-box', ...style,
      }}
      onFocus={e => { if (!readOnly && !disabled) { e.target.style.borderColor = N; e.target.style.boxShadow = '0 0 0 2px rgba(37,99,235,0.15)'; } }}
      onBlur={e => { e.target.style.borderColor = '#9CA3AF'; e.target.style.boxShadow = 'none'; }}
    />
  );
}

function Sel({ value, onChange, options = [], disabled, style }) {
  return (
    <select value={value} onChange={onChange} disabled={disabled}
      style={{
        height: 28, padding: '0 8px', border: '1px solid #9CA3AF', borderRadius: 4,
        fontSize: 12, fontFamily: F, color: '#111827',
        background: disabled ? '#F3F4F6' : W,
        outline: 'none', width: '100%', boxSizing: 'border-box', cursor: 'pointer', ...style,
      }}
      onFocus={e => { e.target.style.borderColor = N; e.target.style.boxShadow = '0 0 0 2px rgba(37,99,235,0.15)'; }}
      onBlur={e => { e.target.style.borderColor = '#9CA3AF'; e.target.style.boxShadow = 'none'; }}
    >
      {options.map((o, i) => <option key={i} value={o.value ?? o}>{o.label ?? o}</option>)}
    </select>
  );
}

function Txt({ value, onChange, placeholder, rows = 3 }) {
  return (
    <textarea value={value ?? ''} onChange={onChange} placeholder={placeholder} rows={rows}
      style={{
        width: '100%', padding: '5px 8px', border: '1px solid #D1D5DB', borderRadius: 5,
        fontSize: 12, fontFamily: F, color: '#111827', background: W,
        resize: 'vertical', outline: 'none', boxSizing: 'border-box', lineHeight: 1.5,
      }}
      onFocus={e => { e.target.style.borderColor = N; e.target.style.boxShadow = '0 0 0 2px rgba(37,99,235,0.15)'; }}
      onBlur={e => { e.target.style.borderColor = '#D1D5DB'; e.target.style.boxShadow = 'none'; }}
    />
  );
}

function FR({ label, children, w = 130, req }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', minHeight: 30, borderBottom: '1px solid #CBD5E1', padding: '2px 6px', background: '#fff' }}>
      <label style={{ fontSize: 11.5, fontWeight: 700, color: '#000', minWidth: w, maxWidth: w, padding: '0 8px 0 0', textAlign: 'left', flexShrink: 0 }}>
        {label}{req && <span style={{ color: '#DC2626', marginLeft: 2 }}>*</span>}
      </label>
      <div style={{ flex: 1, display: 'flex', gap: 4, alignItems: 'center' }}>{children}</div>
    </div>
  );
}

/* ── Status badge ── */
const STATUS_COLORS = {
  draft: { bg: '#F3F4F6', color: '#374151', border: '#D1D5DB' },
  sent: { bg: '#EFF6FF', color: '#1D4ED8', border: '#BFDBFE' },
  approved: { bg: '#ECFDF5', color: '#065F46', border: '#6EE7B7' },
  rejected: { bg: '#FEF2F2', color: '#991B1B', border: '#FECACA' },
};
function StatusBadge({ status }) {
  const s = STATUS_COLORS[status] || STATUS_COLORS.draft;
  return (
    <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 10, border: `1px solid ${s.border}`, background: s.bg, color: s.color, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
      {status || 'draft'}
    </span>
  );
}

/* ── Empty item row ── */
const emptyItem = () => ({ _id: uid(), itemName: '', description: '', hsnCode: '', qty: 1, unit: 'NOS', rate: '', discount: 0, discountType: '%', gstPercent: 18 });

/* ── Calc totals ── */
function calcTotals(items, charges, companyState, clientState, overallDiscount = 0, freightCharges = 0) {
  let subTotal = 0;
  const rows = items.map(it => {
    const base = (+it.qty || 0) * (+it.rate || 0);
    const disc = it.discountType === '%' ? base * (+it.discount || 0) / 100 : (+it.discount || 0);
    const taxable = base - disc;
    const gst = taxable * (+it.gstPercent || 0) / 100;
    subTotal += taxable;
    return { ...it, taxable, gst };
  });

  let chargesTotal = 0;
  let chargesGst = 0;
  charges.forEach(c => {
    const amt = +c.amount || 0;
    const gst = amt * (+c.gstPercent || 0) / 100;
    chargesTotal += amt;
    chargesGst += gst;
  });

  const discAmt = +overallDiscount || 0;
  const freight = +freightCharges || 0;
  const taxableTotal = subTotal - discAmt + chargesTotal + freight;
  const isSameState = (companyState || '').toLowerCase() === (clientState || '').toLowerCase();
  const totalGST = rows.reduce((a, r) => a + r.gst, 0) + chargesGst;
  const cgst = isSameState ? totalGST / 2 : 0;
  const sgst = isSameState ? totalGST / 2 : 0;
  const igst = isSameState ? 0 : totalGST;
  const grandTotal = taxableTotal + totalGST;

  return { subTotal, totalGST, cgst, sgst, igst, grandTotal, taxableTotal };
}

/* ═══════════════════════ QUOTE FORM ═══════════════════════ */
function QuoteForm({ initial, onSave, onCancel, readOnly = false, clients = [] }) {
  const blank = {
    clientName: '', clientId: '', clientGstin: '', clientState: '',
    clientAddress: '', contactPerson: '', mobile: '', email: '',
    quoteDate: today(), validUntil: '', subject: '',
    companyState: '', paymentTerms: '30 Days',
    items: [emptyItem()],
    charges: [],
    overallDiscount: 0, freightCharges: 0,
    termsConditions: '', notes: '',
  };

  const [d, setD] = useState(initial ? { ...blank, ...initial } : blank);
  const [saving, setSaving] = useState(false);
  const [clientSuggestions, setClientSuggestions] = useState([]);
  const [showSug, setShowSug] = useState(false);

  const set = (k, v) => setD(p => ({ ...p, [k]: v }));

  useEffect(() => {
    if (clients.length && d.clientName) {
      const q = d.clientName.toLowerCase();
      setClientSuggestions(clients.filter(c => c.clientName?.toLowerCase().includes(q) || c.clientCode?.toLowerCase().includes(q)));
    } else {
      setClientSuggestions([]);
    }
  }, [d.clientName, clients]);

  const pickClient = (c) => {
    setD(p => ({
      ...p,
      clientName: c.clientName || '',
      clientId: c.clientCode || c.clientId || '',
      clientGstin: c.gstin || c.gstNumber || '',
      clientState: c.state || '',
      clientAddress: c.address || '',
      contactPerson: c.contactPerson || '',
      mobile: c.mobile || c.phone || '',
      email: c.email || '',
    }));
    setShowSug(false);
  };

  /* items */
  const setItem = (idx, k, v) => setD(p => {
    const items = [...p.items];
    items[idx] = { ...items[idx], [k]: v };
    return { ...p, items };
  });
  const addItem = () => setD(p => ({ ...p, items: [...p.items, emptyItem()] }));
  const removeItem = (idx) => setD(p => ({ ...p, items: p.items.filter((_, i) => i !== idx) }));

  /* charges */
  const setCharge = (idx, k, v) => setD(p => {
    const charges = [...p.charges];
    charges[idx] = { ...charges[idx], [k]: v };
    return { ...p, charges };
  });
  const addCharge = () => setD(p => ({ ...p, charges: [...p.charges, { _id: uid(), description: '', amount: '', gstPercent: 18 }] }));
  const removeCharge = (idx) => setD(p => ({ ...p, charges: p.charges.filter((_, i) => i !== idx) }));

  const totals = calcTotals(d.items, d.charges, d.companyState, d.clientState, d.overallDiscount, d.freightCharges);

  const handleSave = async () => {
    if (!d.clientName) return alert('Client name is required');
    if (!d.quoteDate) return alert('Quote date is required');
    setSaving(true);
    try { await onSave({ ...d, ...totals }); }
    finally { setSaving(false); }
  };

  const TH = ({ w, children }) => (
    <th style={{ width: w, padding: '4px 6px', background: '#104f4f', color: W, fontSize: 11, fontWeight: 700, textAlign: 'left', whiteSpace: 'nowrap', border: '1px solid #2a4c7e' }}>
      {children}
    </th>
  );

  return (
    <div style={{ fontFamily: F, fontSize: 12 }}>
      {/* Client Info */}
      <div style={{ background: '#104f4f', color: W, fontSize: 12, fontWeight: 700, padding: '4px 10px', marginBottom: 1 }}>Client Information</div>
      <div style={{ border: '1px solid #CBD5E1', marginBottom: 8, position: 'relative' }}>
        <FR label="Client Name" req>
          <Inp value={d.clientName} onChange={e => { set('clientName', e.target.value); setShowSug(true); }} readOnly={readOnly} placeholder="Search or type client name" />
          {showSug && clientSuggestions.length > 0 && (
            <div style={{ position: 'absolute', top: 30, left: 130, right: 0, zIndex: 999, background: W, border: '1px solid #D1D5DB', borderRadius: 4, boxShadow: '0 4px 12px rgba(0,0,0,0.1)', maxHeight: 200, overflowY: 'auto' }}>
              {clientSuggestions.map((c, i) => (
                <div key={i} onMouseDown={() => pickClient(c)}
                  style={{ padding: '6px 10px', cursor: 'pointer', fontSize: 12, borderBottom: '1px solid #F3F4F6' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#EFF6FF'}
                  onMouseLeave={e => e.currentTarget.style.background = W}>
                  <strong>{c.clientName}</strong> — {c.clientCode}
                </div>
              ))}
            </div>
          )}
        </FR>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
          <FR label="Client GSTIN"><Inp value={d.clientGstin} onChange={e => set('clientGstin', e.target.value)} readOnly={readOnly} /></FR>
          <FR label="Client State"><Inp value={d.clientState} onChange={e => set('clientState', e.target.value)} readOnly={readOnly} /></FR>
          <FR label="Contact Person"><Inp value={d.contactPerson} onChange={e => set('contactPerson', e.target.value)} readOnly={readOnly} /></FR>
          <FR label="Mobile"><Inp value={d.mobile} onChange={e => set('mobile', e.target.value)} readOnly={readOnly} /></FR>
          <FR label="Email"><Inp value={d.email} onChange={e => set('email', e.target.value)} readOnly={readOnly} /></FR>
          <FR label="Client Address"><Inp value={d.clientAddress} onChange={e => set('clientAddress', e.target.value)} readOnly={readOnly} /></FR>
        </div>
      </div>

      {/* Quote Info */}
      <div style={{ background: '#104f4f', color: W, fontSize: 12, fontWeight: 700, padding: '4px 10px', marginBottom: 1 }}>Quote Details</div>
      <div style={{ border: '1px solid #CBD5E1', marginBottom: 8 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
          <FR label="Quote Date" req><Inp type="date" value={d.quoteDate} onChange={e => set('quoteDate', e.target.value)} readOnly={readOnly} /></FR>
          <FR label="Valid Until"><Inp type="date" value={d.validUntil} onChange={e => set('validUntil', e.target.value)} readOnly={readOnly} /></FR>
          <FR label="Subject"><Inp value={d.subject} onChange={e => set('subject', e.target.value)} readOnly={readOnly} placeholder="Quote subject / project name" /></FR>
          <FR label="Payment Terms">
            <Sel value={d.paymentTerms} onChange={e => set('paymentTerms', e.target.value)} disabled={readOnly}
              options={['Advance', '15 Days', '30 Days', '45 Days', '60 Days', '90 Days', 'LC', 'Against Delivery']} />
          </FR>
          <FR label="Company State"><Inp value={d.companyState} onChange={e => set('companyState', e.target.value)} readOnly={readOnly} placeholder="For GST calculation" /></FR>
        </div>
      </div>

      {/* Items */}
      <div style={{ background: '#104f4f', color: W, fontSize: 12, fontWeight: 700, padding: '4px 10px', marginBottom: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>Items</span>
        {!readOnly && <Btn v="suc" small onClick={addItem}>+ Add Item</Btn>}
      </div>
      <div style={{ border: '1px solid #CBD5E1', marginBottom: 8, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
          <thead>
            <tr>
              <TH w={30}>#</TH>
              <TH w={180}>Item Name</TH>
              <TH w={100}>HSN Code</TH>
              <TH w={55}>Qty</TH>
              <TH w={55}>Unit</TH>
              <TH w={90}>Rate (₹)</TH>
              <TH w={60}>Disc%</TH>
              <TH w={60}>GST%</TH>
              <TH w={100}>Amount (₹)</TH>
              {!readOnly && <TH w={30}></TH>}
            </tr>
          </thead>
          <tbody>
            {d.items.map((it, idx) => {
              const base = (+it.qty || 0) * (+it.rate || 0);
              const disc = it.discountType === '%' ? base * (+it.discount || 0) / 100 : (+it.discount || 0);
              const taxable = base - disc;
              const gst = taxable * (+it.gstPercent || 0) / 100;
              const total = taxable + gst;
              const stripe = idx % 2 === 0 ? '#fff' : '#F8FAFC';
              return (
                <tr key={it._id} style={{ background: stripe }}>
                  <td style={{ padding: '3px 6px', textAlign: 'center', border: '1px solid #E2E8F0', color: '#6B7280' }}>{idx + 1}</td>
                  <td style={{ padding: '2px 4px', border: '1px solid #E2E8F0' }}>
                    <Inp value={it.itemName} onChange={e => setItem(idx, 'itemName', e.target.value)} readOnly={readOnly} placeholder="Item / description" />
                  </td>
                  <td style={{ padding: '2px 4px', border: '1px solid #E2E8F0' }}>
                    <Inp value={it.hsnCode} onChange={e => setItem(idx, 'hsnCode', e.target.value)} readOnly={readOnly} />
                  </td>
                  <td style={{ padding: '2px 4px', border: '1px solid #E2E8F0' }}>
                    <Inp type="number" value={it.qty} onChange={e => setItem(idx, 'qty', e.target.value)} readOnly={readOnly} style={{ textAlign: 'right' }} />
                  </td>
                  <td style={{ padding: '2px 4px', border: '1px solid #E2E8F0' }}>
                    <Sel value={it.unit} onChange={e => setItem(idx, 'unit', e.target.value)} disabled={readOnly}
                      options={['NOS', 'KG', 'MTR', 'SQM', 'LTR', 'SET', 'PAIR', 'BOX', 'ROLL', 'RFT', 'SQF']} />
                  </td>
                  <td style={{ padding: '2px 4px', border: '1px solid #E2E8F0' }}>
                    <Inp type="number" value={it.rate} onChange={e => setItem(idx, 'rate', e.target.value)} readOnly={readOnly} style={{ textAlign: 'right' }} />
                  </td>
                  <td style={{ padding: '2px 4px', border: '1px solid #E2E8F0' }}>
                    <Inp type="number" value={it.discount} onChange={e => setItem(idx, 'discount', e.target.value)} readOnly={readOnly} style={{ textAlign: 'right' }} />
                  </td>
                  <td style={{ padding: '2px 4px', border: '1px solid #E2E8F0' }}>
                    <Sel value={it.gstPercent} onChange={e => setItem(idx, 'gstPercent', e.target.value)} disabled={readOnly}
                      options={[0, 5, 12, 18, 28].map(v => ({ value: v, label: `${v}%` }))} />
                  </td>
                  <td style={{ padding: '3px 6px', textAlign: 'right', border: '1px solid #E2E8F0', fontWeight: 600, whiteSpace: 'nowrap' }}>
                    {(+total || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  {!readOnly && (
                    <td style={{ padding: '2px 4px', border: '1px solid #E2E8F0', textAlign: 'center' }}>
                      <Btn v="dan" small onClick={() => removeItem(idx)}>✕</Btn>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Additional Charges */}
      <div style={{ background: '#104f4f', color: W, fontSize: 12, fontWeight: 700, padding: '4px 10px', marginBottom: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>Additional Charges</span>
        {!readOnly && <Btn v="suc" small onClick={addCharge}>+ Add Charge</Btn>}
      </div>
      <div style={{ border: '1px solid #CBD5E1', marginBottom: 8 }}>
        {d.charges.length === 0 ? (
          <div style={{ padding: '8px 12px', color: '#9CA3AF', fontSize: 11 }}>No additional charges</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr>
                <TH>Description</TH>
                <TH w={100}>Amount (₹)</TH>
                <TH w={80}>GST%</TH>
                {!readOnly && <TH w={30}></TH>}
              </tr>
            </thead>
            <tbody>
              {d.charges.map((c, idx) => (
                <tr key={c._id} style={{ background: idx % 2 === 0 ? '#fff' : '#F8FAFC' }}>
                  <td style={{ padding: '2px 4px', border: '1px solid #E2E8F0' }}>
                    <Inp value={c.description} onChange={e => setCharge(idx, 'description', e.target.value)} readOnly={readOnly} />
                  </td>
                  <td style={{ padding: '2px 4px', border: '1px solid #E2E8F0' }}>
                    <Inp type="number" value={c.amount} onChange={e => setCharge(idx, 'amount', e.target.value)} readOnly={readOnly} style={{ textAlign: 'right' }} />
                  </td>
                  <td style={{ padding: '2px 4px', border: '1px solid #E2E8F0' }}>
                    <Sel value={c.gstPercent} onChange={e => setCharge(idx, 'gstPercent', e.target.value)} disabled={readOnly}
                      options={[0, 5, 12, 18, 28].map(v => ({ value: v, label: `${v}%` }))} />
                  </td>
                  {!readOnly && (
                    <td style={{ padding: '2px 4px', border: '1px solid #E2E8F0', textAlign: 'center' }}>
                      <Btn v="dan" small onClick={() => removeCharge(idx)}>✕</Btn>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Totals + Terms */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 8, marginBottom: 8 }}>
        <div>
          <div style={{ background: '#104f4f', color: W, fontSize: 12, fontWeight: 700, padding: '4px 10px', marginBottom: 1 }}>Terms & Notes</div>
          <div style={{ border: '1px solid #CBD5E1', padding: 6 }}>
            <div style={{ marginBottom: 4 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 2 }}>Terms & Conditions</label>
              <Txt value={d.termsConditions} onChange={e => set('termsConditions', e.target.value)} rows={4} placeholder="Payment terms, delivery conditions, warranty..." />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 2 }}>Internal Notes</label>
              <Txt value={d.notes} onChange={e => set('notes', e.target.value)} rows={2} placeholder="Internal notes (not shown to client)" />
            </div>
          </div>
        </div>

        <div>
          <div style={{ background: '#104f4f', color: W, fontSize: 12, fontWeight: 700, padding: '4px 10px', marginBottom: 1 }}>Summary</div>
          <div style={{ border: '1px solid #CBD5E1' }}>
            <FR label="Freight Charges" w={140}>
              <Inp type="number" value={d.freightCharges} onChange={e => set('freightCharges', e.target.value)} readOnly={readOnly} style={{ textAlign: 'right' }} />
            </FR>
            <FR label="Overall Discount" w={140}>
              <Inp type="number" value={d.overallDiscount} onChange={e => set('overallDiscount', e.target.value)} readOnly={readOnly} style={{ textAlign: 'right' }} />
            </FR>
            {[
              ['Sub Total', fmt(totals.subTotal)],
              totals.cgst > 0 ? ['CGST', fmt(totals.cgst)] : null,
              totals.sgst > 0 ? ['SGST', fmt(totals.sgst)] : null,
              totals.igst > 0 ? ['IGST', fmt(totals.igst)] : null,
            ].filter(Boolean).map(([lbl, val]) => (
              <div key={lbl} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 10px', borderBottom: '1px solid #E5E7EB', fontSize: 12 }}>
                <span style={{ color: '#374151' }}>{lbl}</span>
                <span style={{ fontWeight: 600 }}>{val}</span>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', background: '#104f4f', color: W }}>
              <span style={{ fontSize: 13, fontWeight: 700 }}>Grand Total</span>
              <span style={{ fontSize: 14, fontWeight: 700 }}>{fmt(totals.grandTotal)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Actions */}
      {!readOnly && (
        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', paddingTop: 4 }}>
          {onCancel && <Btn onClick={onCancel}>Cancel</Btn>}
          <Btn v="pri" onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save Quote'}</Btn>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════ QUOTE DETAIL MODAL ═══════════════════════ */
function QuoteModal({ quote, onClose, onRefresh, companyId }) {
  const [editing, setEditing] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [showReject, setShowReject] = useState(false);
  const [busy, setBusy] = useState(false);

  const changeStatus = async (status, extra = {}) => {
    setBusy(true);
    try {
      await api(`/api/crm/quotes/${quote.quoteId}/status`, {
        method: 'PUT',
        data: { companyId, status, ...extra },
      });
      onRefresh();
      onClose();
    } finally { setBusy(false); }
  };

  const handleSaveEdit = async (data) => {
    await api(`/api/crm/quotes/${quote.quoteId}`, {
      method: 'PUT',
      data: { companyId, ...data },
    });
    onRefresh();
    onClose();
  };

  const handleDelete = async () => {
    if (!window.confirm('Delete this quote?')) return;
    await api(`/api/crm/quotes/${quote.quoteId}?companyId=${companyId}`, { method: 'DELETE' });
    onRefresh();
    onClose();
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 2000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '20px 16px', overflowY: 'auto' }}>
      <div style={{ background: W, borderRadius: 6, width: '100%', maxWidth: 1100, boxShadow: '0 8px 40px rgba(0,0,0,0.3)', fontFamily: F }}>
        {/* Header */}
        <div style={{ background: '#104f4f', color: W, padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10, borderRadius: '6px 6px 0 0' }}>
          <span style={{ fontSize: 15, fontWeight: 700 }}>{quote.quoteNo}</span>
          <StatusBadge status={quote.status} />
          <span style={{ flex: 1 }} />
          {!editing && quote.status === 'draft' && <Btn v="war" onClick={() => changeStatus('sent')} disabled={busy}>Mark as Sent</Btn>}
          {!editing && (quote.status === 'draft' || quote.status === 'sent') && (
            <>
              <Btn v="suc" onClick={() => changeStatus('approved', { approvedBy: 'Admin' })} disabled={busy}>✔ Approve</Btn>
              <Btn v="dan" onClick={() => setShowReject(true)} disabled={busy}>✕ Reject</Btn>
            </>
          )}
          {!editing && quote.status !== 'approved' && <Btn onClick={() => setEditing(true)} disabled={busy}>Edit</Btn>}
          {!editing && <Btn v="dan" onClick={handleDelete} disabled={busy}>Delete</Btn>}
          {editing && <Btn onClick={() => setEditing(false)}>Cancel Edit</Btn>}
          <Btn onClick={onClose}>✕ Close</Btn>
        </div>

        {/* Reject reason prompt */}
        {showReject && (
          <div style={{ background: '#FEF2F2', padding: '10px 16px', display: 'flex', gap: 8, alignItems: 'center', borderBottom: '1px solid #FECACA' }}>
            <span style={{ fontSize: 12, color: '#991B1B', fontWeight: 700 }}>Rejection Reason:</span>
            <input value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="Enter reason…"
              style={{ flex: 1, height: 28, padding: '0 8px', border: '1px solid #FECACA', borderRadius: 4, fontSize: 12 }} />
            <Btn v="dan" onClick={() => { changeStatus('rejected', { rejectedReason: rejectReason }); setShowReject(false); }} disabled={busy}>Confirm Reject</Btn>
            <Btn onClick={() => setShowReject(false)}>Cancel</Btn>
          </div>
        )}

        {/* Meta info row */}
        {!editing && (
          <div style={{ display: 'flex', gap: 24, padding: '8px 16px', background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', fontSize: 11, color: '#374151' }}>
            <span><strong>Client:</strong> {quote.clientName}</span>
            <span><strong>Date:</strong> {fmtD(quote.quoteDate)}</span>
            {quote.validUntil && <span><strong>Valid Until:</strong> {fmtD(quote.validUntil)}</span>}
            {quote.subject && <span><strong>Subject:</strong> {quote.subject}</span>}
            <span><strong>Total:</strong> <strong style={{ color: '#1D4ED8' }}>{fmt(quote.grandTotal)}</strong></span>
          </div>
        )}

        <div style={{ padding: 16 }}>
          <QuoteForm initial={quote} onSave={editing ? handleSaveEdit : undefined} onCancel={editing ? () => setEditing(false) : undefined} readOnly={!editing} />
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════ LIST VIEW ═══════════════════════ */
function QuoteList({ quotes, onSelect, emptyMsg }) {
  const [search, setSearch] = useState('');
  const filtered = quotes.filter(q =>
    !search || q.quoteNo?.toLowerCase().includes(search.toLowerCase()) ||
    q.clientName?.toLowerCase().includes(search.toLowerCase()) ||
    q.subject?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <div style={{ padding: '8px 0 10px', display: 'flex', gap: 8, alignItems: 'center' }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by quote #, client, subject…"
          style={{ width: 280, height: 28, padding: '0 10px', border: '1px solid #D1D5DB', borderRadius: 4, fontSize: 12, fontFamily: F }} />
        <span style={{ fontSize: 12, color: '#6B7280' }}>{filtered.length} quotes</span>
      </div>
      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: '#9CA3AF', fontSize: 14 }}>{emptyMsg || 'No quotes found'}</div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, fontFamily: F }}>
          <thead>
            <tr style={{ background: '#104f4f', color: W }}>
              {['Quote No', 'Client', 'Subject', 'Date', 'Valid Until', 'Amount', 'Status', 'Actions'].map(h => (
                <th key={h} style={{ padding: '7px 10px', fontWeight: 700, fontSize: 11, textAlign: 'left', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((q, i) => (
              <tr key={q.quoteId} style={{ background: i % 2 === 0 ? '#fff' : '#F8FAFC', cursor: 'pointer' }}
                onMouseEnter={e => e.currentTarget.style.background = '#EFF6FF'}
                onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? '#fff' : '#F8FAFC'}
                onClick={() => onSelect(q)}>
                <td style={{ padding: '6px 10px', borderBottom: '1px solid #E2E8F0', fontWeight: 700, color: N }}>{q.quoteNo}</td>
                <td style={{ padding: '6px 10px', borderBottom: '1px solid #E2E8F0' }}>{q.clientName || '—'}</td>
                <td style={{ padding: '6px 10px', borderBottom: '1px solid #E2E8F0', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{q.subject || '—'}</td>
                <td style={{ padding: '6px 10px', borderBottom: '1px solid #E2E8F0', whiteSpace: 'nowrap' }}>{fmtD(q.quoteDate)}</td>
                <td style={{ padding: '6px 10px', borderBottom: '1px solid #E2E8F0', whiteSpace: 'nowrap' }}>{fmtD(q.validUntil)}</td>
                <td style={{ padding: '6px 10px', borderBottom: '1px solid #E2E8F0', fontWeight: 600, textAlign: 'right' }}>{fmt(q.grandTotal)}</td>
                <td style={{ padding: '6px 10px', borderBottom: '1px solid #E2E8F0' }}><StatusBadge status={q.status} /></td>
                <td style={{ padding: '6px 10px', borderBottom: '1px solid #E2E8F0' }}>
                  <Btn small onClick={e => { e.stopPropagation(); onSelect(q); }}>Open</Btn>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/* ═══════════════════════ MAIN MODULE ═══════════════════════ */
export default function CRMModule() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { selectedCompany } = useCompany();
  const companyId = selectedCompany?.companyId;

  const mode = pathname.includes('/crm/pending') ? 'pending'
    : pathname.includes('/crm/view') ? 'view'
    : 'create';

  const [quotes, setQuotes] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(null);
  const [createKey, setCreateKey] = useState(0);
  const [toast, setToast] = useState(null);

  const showToast = (msg, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  };

  const loadQuotes = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const r = await api(`/api/crm/quotes?companyId=${companyId}`);
      setQuotes(r.data);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [companyId]);

  const loadClients = useCallback(async () => {
    if (!companyId) return;
    try {
      const r = await api(`/api/clients?companyId=${companyId}`);
      setClients(r.data || []);
    } catch { /* ignore */ }
  }, [companyId]);

  useEffect(() => { loadQuotes(); }, [loadQuotes]);
  useEffect(() => { loadClients(); }, [loadClients]);

  const handleCreate = async (data) => {
    await api('/api/crm/quotes', { method: 'POST', data: { companyId, ...data } });
    showToast('Quote created successfully!');
    setCreateKey(k => k + 1);
    loadQuotes();
    navigate('/crm/view');
  };

  const TABS = [
    { key: 'create', label: 'Create Quote', path: '/crm/create' },
    { key: 'view', label: 'All Quotes', path: '/crm/view' },
    { key: 'pending', label: 'Pending Approval', path: '/crm/pending' },
  ];

  const pendingQuotes = quotes.filter(q => q.status === 'draft' || q.status === 'sent');

  return (
    <div style={{ fontFamily: F, fontSize: 12, padding: 0 }}>
      {/* Toast */}
      {toast && (
        <div style={{ position: 'fixed', top: 16, right: 16, zIndex: 9999, background: toast.ok ? '#065F46' : '#991B1B', color: W, padding: '10px 18px', borderRadius: 6, fontSize: 13, fontWeight: 600, boxShadow: '0 4px 12px rgba(0,0,0,0.2)' }}>
          {toast.msg}
        </div>
      )}

      {/* Module header */}
      <div style={{ background: '#104f4f', color: W, padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 16, fontWeight: 700 }}>CRM — Quotations</span>
        {mode === 'pending' && <span style={{ background: '#DC2626', color: W, borderRadius: 10, fontSize: 10, padding: '1px 7px', fontWeight: 700 }}>{pendingQuotes.length}</span>}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 2, background: '#E5E7EB', padding: '0 0 0 0', borderBottom: '2px solid #D1D5DB' }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => navigate(t.path)}
            style={{
              padding: '7px 18px', fontSize: 12, fontWeight: mode === t.key ? 700 : 400,
              background: mode === t.key ? W : 'transparent',
              border: 'none', borderBottom: mode === t.key ? '2px solid #2563EB' : '2px solid transparent',
              color: mode === t.key ? N : '#374151', cursor: 'pointer', fontFamily: F,
              marginBottom: -2,
            }}>
            {t.label}
            {t.key === 'pending' && pendingQuotes.length > 0 && (
              <span style={{ marginLeft: 6, background: '#DC2626', color: W, borderRadius: 10, fontSize: 10, padding: '1px 6px', fontWeight: 700 }}>
                {pendingQuotes.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ padding: 16 }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: '#9CA3AF' }}>Loading…</div>
        ) : mode === 'create' ? (
          <QuoteForm key={createKey} clients={clients} onSave={handleCreate} />
        ) : mode === 'pending' ? (
          <QuoteList quotes={pendingQuotes} onSelect={setSelected} emptyMsg="No quotes pending approval" />
        ) : (
          <QuoteList quotes={quotes} onSelect={setSelected} emptyMsg="No quotes yet. Create your first quote!" />
        )}
      </div>

      {/* Detail Modal */}
      {selected && (
        <QuoteModal quote={selected} companyId={companyId} onClose={() => setSelected(null)} onRefresh={loadQuotes} />
      )}
    </div>
  );
}
