import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useNavigate, useParams } from 'react-router-dom';
import { useCompany } from '../../../context/CompanyContext';
import { useAuth } from '../../../context/AuthContext';
import { can } from '../../../utils/permissions';

const F   = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const P   = '#104f4f';
const BD  = '#E5EAF2';
const fmt = n => (parseFloat(n)||0).toLocaleString('en-IN', { minimumFractionDigits: 2 });
const today = () => new Date().toISOString().slice(0,10);

const GST_RATES = [0,5,12,18,28];

const inp = (extra={}) => ({
  height: 34, padding: '0 10px', border: `1px solid ${BD}`, borderRadius: 6,
  fontSize: 12, fontFamily: F, boxSizing: 'border-box', outline: 'none',
  background: '#fff', width: '100%', ...extra,
});
const lbl = { fontSize: 11, fontWeight: 600, color: '#555', marginBottom: 3, display: 'block' };

const emptyLine = () => ({ _id: Date.now() + Math.random(), productCode:'', productName:'', description:'', qty:'1', rate:'', gstPercent:'0' });

/* ─────────────────────────────────────────────── */
export default function CreateExpense() {
  const { selectedCompany } = useCompany();
  const { user } = useAuth();
  const cid      = selectedCompany?.companyId;
  const navigate = useNavigate();
  const { expenseId } = useParams();
  const isEdit   = !!expenseId;

  const [projects,    setProjects]    = useState([]);
  const [vendors,     setVendors]     = useState([]);
  const [items,       setItems]       = useState([]);
  const [salesOrders, setSalesOrders] = useState([]);
  const [ledgerAccounts, setLedgerAccounts] = useState([]);
  const [mfgLocations,   setMfgLocations]   = useState([]);

  const [projectId,   setProjectId]   = useState('');
  const [projectName, setProjectName] = useState('');
  const [vendorId,    setVendorId]    = useState('');
  const [vendorName,  setVendorName]  = useState('');
  const [orderId,     setOrderId]     = useState('');
  const [orderNo,     setOrderNo]     = useState('');
  const [invoiceNo,   setInvoiceNo]   = useState('');
  const [voucherNo,   setVoucherNo]   = useState('');
  const [date,        setDate]        = useState(today());
  const [notes,       setNotes]       = useState('');
  const [lines,       setLines]       = useState([emptyLine()]);
  const [saving,      setSaving]      = useState(false);
  const [msg,         setMsg]         = useState('');

  /* Ledger / Cost center */
  const [expenseLedgerId,   setExpenseLedgerId]   = useState('');
  const [expenseLedgerName, setExpenseLedgerName] = useState('');
  const [creditorLedgerId,  setCreditorLedgerId]  = useState('');
  const [creditorLedgerName,setCreditorLedgerName]= useState('');
  const [costCenterType,    setCostCenterType]    = useState('');  // project | office | mfg
  const [costCenterId,      setCostCenterId]      = useState('');
  const [costCenterLabel,   setCostCenterLabel]   = useState('');

  /* load dropdowns */
  useEffect(() => {
    if (!cid) return;
    Promise.all([
      axios.get(`/api/projects?companyId=${cid}`).catch(() => ({ data: [] })),
      axios.get(`/api/vendors?companyId=${cid}`).catch(() => ({ data: [] })),
      axios.get(`/api/items?companyId=${cid}`).catch(() => ({ data: [] })),
      axios.get(`/api/sales-orders?companyId=${cid}`).catch(() => ({ data: [] })),
      axios.get(`/api/ledger/accounts?companyId=${cid}`).catch(() => ({ data: [] })),
      axios.get(`/api/manufacturing/locations?companyId=${cid}`).catch(() => ({ data: [] })),
    ]).then(([p, v, it, so, la, ml]) => {
      setProjects(p.data || []);
      setVendors(v.data || []);
      setItems(it.data || []);
      const orders = Array.isArray(so.data) ? so.data : (so.data?.orders || []);
      setSalesOrders(orders.filter(o => o.status !== 'cancelled'));
      setLedgerAccounts(la.data || []);
      setMfgLocations(ml.data || []);
    });
  }, [cid]);

  /* load for edit */
  useEffect(() => {
    if (!isEdit || !cid) return;
    axios.get(`/api/accounts/expenses/${expenseId}?companyId=${cid}`)
      .then(({ data: e }) => {
        setProjectId(e.projectId || '');
        setProjectName(e.projectName || '');
        setVendorId(e.vendorId ? String(e.vendorId) : '');
        setVendorName(e.vendorName || '');
        setOrderId(e.orderId ? String(e.orderId) : '');
        setOrderNo(e.orderNo || '');
        setExpenseLedgerId(e.expenseLedgerId || '');
        setExpenseLedgerName(e.expenseLedgerName || '');
        setCreditorLedgerId(e.creditorLedgerId || '');
        setCreditorLedgerName(e.creditorLedgerName || '');
        setCostCenterType(e.costCenterType || '');
        setCostCenterId(e.costCenterId || '');
        setCostCenterLabel(e.costCenterLabel || '');
        setInvoiceNo(e.invoiceNo || '');
        setVoucherNo(e.voucherNo || '');
        setDate(e.date || today());
        setNotes(e.notes || '');
        if (Array.isArray(e.items) && e.items.length > 0) {
          setLines(e.items.map(it => ({ ...it, _id: Date.now() + Math.random() })));
        }
      })
      .catch(() => setMsg('Failed to load expense.'));
  }, [isEdit, expenseId, cid]);

  /* line helpers */
  const setLine = (id, field, val) =>
    setLines(ls => ls.map(l => l._id === id ? { ...l, [field]: val } : l));

  const pickProduct = (lineId, code) => {
    const found = items.find(it => String(it.itemCode) === String(code));
    setLines(ls => ls.map(l => l._id === lineId
      ? { ...l, productCode: code, productName: found?.itemName || '' }
      : l));
  };

  const lineTotal = (l) => {
    const base = (parseFloat(l.qty)||0) * (parseFloat(l.rate)||0);
    return base + base * (parseFloat(l.gstPercent)||0) / 100;
  };
  const subtotal   = lines.reduce((s,l) => s + (parseFloat(l.qty)||0)*(parseFloat(l.rate)||0), 0);
  const totalGst   = lines.reduce((s,l) => {
    const base = (parseFloat(l.qty)||0)*(parseFloat(l.rate)||0);
    return s + base*(parseFloat(l.gstPercent)||0)/100;
  }, 0);
  const grandTotal = subtotal + totalGst;

  const pickProject = (id) => {
    const p = projects.find(p => String(p.projectId||p.id) === String(id));
    setProjectId(id);
    setProjectName(p?.projectName || '');
  };

  const pickVendor = (id) => {
    const v = vendors.find(v => String(v.vendorId||v.id) === String(id));
    setVendorId(id);
    setVendorName(v?.vendorName || v?.companyName || '');
  };

  const pickOrder = (id) => {
    const o = salesOrders.find(o => String(o.orderId) === String(id));
    setOrderId(id);
    setOrderNo(o?.orderNo || '');
  };

  const save = async (status) => {
    if (!projectId)  { setMsg('Please select a project.'); return; }
    if (!vendorId)   { setMsg('Please select the vendor (Expense By).'); return; }
    if (!date)       { setMsg('Date is required.'); return; }
    const validLines = lines.filter(l => l.productName || l.description || l.rate);
    if (validLines.length === 0) { setMsg('Add at least one line item.'); return; }
    setSaving(true); setMsg('');
    try {
      const payload = {
        projectId, projectName, vendorId, vendorName,
        orderId, orderNo,
        invoiceNo, voucherNo, date, notes, status,
        items: validLines.map(({ _id, ...rest }) => rest),
        expenseLedgerId, expenseLedgerName,
        creditorLedgerId, creditorLedgerName,
        costCenterType, costCenterId, costCenterLabel,
        companyId: cid,
      };
      let savedExpenseId = expenseId;
      if (isEdit) {
        await axios.put(`/api/accounts/expenses/${expenseId}?companyId=${cid}`, payload);
        setMsg('Expense updated.');
      } else {
        const res = await axios.post(`/api/accounts/expenses?companyId=${cid}`, payload);
        savedExpenseId = res.data.expenseId;
        setMsg(`Expense saved! ID: ${savedExpenseId}`);
      }

      // Post double-entry voucher if both ledger accounts are selected
      if (expenseLedgerId && creditorLedgerId && grandTotal > 0) {
        await axios.post(`/api/ledger/vouchers?companyId=${cid}`, {
          date,
          narration: `Expense — ${validLines.map(l=>l.description||l.productName).filter(Boolean).join(', ')} (Ref: ${invoiceNo || savedExpenseId})`,
          voucherType: 'Expense',
          entries: [
            { accountId: expenseLedgerId,  accountName: expenseLedgerName,  dr: grandTotal, cr: 0 },
            { accountId: creditorLedgerId, accountName: creditorLedgerName, dr: 0, cr: grandTotal },
          ],
          costCenter: costCenterLabel || costCenterId,
          costCenterType,
          refNo: String(savedExpenseId),
          companyId: cid,
        }).catch(() => {}); // voucher is non-blocking — expense still saved
      }

      if (isEdit) {
        setTimeout(() => navigate('/account/expense/view'), 1000);
      } else {
        // Reset form
        setProjectId(''); setProjectName(''); setVendorId(''); setVendorName('');
        setOrderId(''); setOrderNo('');
        setInvoiceNo(''); setVoucherNo(''); setDate(today()); setNotes('');
        setLines([emptyLine()]);
        setExpenseLedgerId(''); setExpenseLedgerName('');
        setCreditorLedgerId(''); setCreditorLedgerName('');
        setCostCenterType(''); setCostCenterId(''); setCostCenterLabel('');
      }
    } catch (e) { setMsg('Error: ' + (e.response?.data?.error || e.message)); }
    setSaving(false);
  };

  const hdr = {
    background: P, color: '#fff', padding: '8px 14px', fontWeight: 700,
    fontSize: 13, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    borderRadius: '6px 6px 0 0', marginBottom: 0,
  };
  const sect = { background: '#F7F9FF', border: `1px solid ${BD}`, borderRadius: 6, padding: '14px 16px', marginBottom: 10 };
  const sectTitle = { fontSize: 11, fontWeight: 800, color: P, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 };

  return (
    <div style={{ fontFamily: F, fontSize: 12, padding: 8, maxWidth: 1100 }}>
      <div style={hdr}>
        <span>{isEdit ? '✏️ Edit Expense' : '➕ New Expense'}</span>
        <button onClick={() => navigate('/account/expense/view')}
          style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', padding: '4px 12px', borderRadius: 5, cursor: 'pointer', fontSize: 12 }}>
          ← Back
        </button>
      </div>

      {msg && (
        <div style={{ padding: '6px 12px', margin: '6px 0', borderRadius: 5, fontSize: 11,
          background: msg.startsWith('Error') || msg.startsWith('Please') ? '#ffe0e0' : '#e8f5e9',
          border: `1px solid ${msg.startsWith('Error') || msg.startsWith('Please') ? '#cc4444' : '#66bb6a'}`,
          color: msg.startsWith('Error') || msg.startsWith('Please') ? '#880000' : '#1b5e20' }}>
          {msg}
        </div>
      )}

      {/* Section 1: Project + Vendor + Invoice */}
      <div style={sect}>
        <div style={sectTitle}>📋 Expense Details</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
          <div>
            <label style={lbl}>Project *</label>
            <select value={projectId} onChange={e => pickProject(e.target.value)} style={inp({ cursor:'pointer' })}>
              <option value="">— Select Project —</option>
              {projects.map(p => (
                <option key={p.projectId||p.id} value={p.projectId||p.id}>{p.projectName}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={lbl}>Linked Sales Order</label>
            <select value={orderId} onChange={e => pickOrder(e.target.value)} style={inp({ cursor:'pointer' })}>
              <option value="">— Select Order —</option>
              {salesOrders.map(o => (
                <option key={o.orderId} value={o.orderId}>
                  {o.orderNo} — {o.customerName || o.clientName || ''}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label style={lbl}>Expense By (Vendor) *</label>
            <select value={vendorId} onChange={e => pickVendor(e.target.value)} style={inp({ cursor:'pointer' })}>
              <option value="">— Select Vendor —</option>
              {vendors.map(v => (
                <option key={v.vendorId||v.id} value={v.vendorId||v.id}>{v.vendorName||v.companyName}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={lbl}>Date *</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} style={inp()} />
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr', gap: 12 }}>
          <div>
            <label style={lbl}>Invoice No.</label>
            <input value={invoiceNo} onChange={e => setInvoiceNo(e.target.value)} placeholder="e.g. INV-2526-001" style={inp()} />
          </div>
          <div>
            <label style={lbl}>Voucher No.</label>
            <input value={voucherNo} onChange={e => setVoucherNo(e.target.value)} placeholder="e.g. VOU-001" style={inp()} />
          </div>
          <div>
            <label style={lbl}>Notes</label>
            <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional notes…" style={inp()} />
          </div>
        </div>
      </div>

      {/* Section 2: Accounting Ledgers + Cost Center */}
      <div style={sect}>
        <div style={sectTitle}>📒 Accounting Ledgers & Cost Center</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <div>
            <label style={lbl}>Expense Ledger (DR — debit side)</label>
            <select value={expenseLedgerId} onChange={e => {
              const acc = ledgerAccounts.find(a => a.id === e.target.value);
              setExpenseLedgerId(e.target.value);
              setExpenseLedgerName(acc?.name || '');
            }} style={inp({ cursor:'pointer' })}>
              <option value="">— Select Expense Account —</option>
              {ledgerAccounts.filter(a => a.groupNature === 'Dr').map(a => (
                <option key={a.id} value={a.id}>{a.name} [{a.groupName}]</option>
              ))}
            </select>
            <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>
              Debit increases expense/asset balance
            </div>
          </div>
          <div>
            <label style={lbl}>Creditor / Payable Ledger (CR — credit side)</label>
            <select value={creditorLedgerId} onChange={e => {
              const acc = ledgerAccounts.find(a => a.id === e.target.value);
              setCreditorLedgerId(e.target.value);
              setCreditorLedgerName(acc?.name || '');
            }} style={inp({ cursor:'pointer' })}>
              <option value="">— Select Creditor / Employee Account —</option>
              {ledgerAccounts.filter(a => a.groupNature === 'Cr').map(a => (
                <option key={a.id} value={a.id}>{a.name} [{a.groupName}]</option>
              ))}
            </select>
            <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>
              Credit records the liability to pay
            </div>
          </div>
        </div>
        {expenseLedgerId && creditorLedgerId && (
          <div style={{ background: '#e8f4f4', border: '1px solid #a7d5d5', borderRadius: 6,
            padding: '8px 12px', fontSize: 11, color: '#104f4f', marginBottom: 12 }}>
            <strong>Journal Entry:</strong> Dr <em>{expenseLedgerName}</em> &nbsp;|&nbsp;
            Cr <em>{creditorLedgerName}</em> &nbsp;—&nbsp;
            Amount ₹{(grandTotal||0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 12 }}>
          <div>
            <label style={lbl}>Cost Center Type</label>
            <select value={costCenterType} onChange={e => {
              setCostCenterType(e.target.value);
              setCostCenterId('');
              setCostCenterLabel('');
            }} style={inp({ cursor:'pointer' })}>
              <option value="">— None —</option>
              <option value="project">Project</option>
              <option value="office">Office</option>
              <option value="mfg">Manufacturing Location</option>
            </select>
          </div>
          {costCenterType === 'project' && (
            <div>
              <label style={lbl}>Project</label>
              <select value={costCenterId} onChange={e => {
                const p = projects.find(x => String(x.projectId||x.id) === String(e.target.value));
                setCostCenterId(e.target.value);
                setCostCenterLabel(p?.projectName || '');
              }} style={inp({ cursor:'pointer' })}>
                <option value="">— Select Project —</option>
                {projects.map(p => (
                  <option key={p.projectId||p.id} value={p.projectId||p.id}>{p.projectName}</option>
                ))}
              </select>
            </div>
          )}
          {costCenterType === 'office' && (
            <div>
              <label style={lbl}>Office / Department</label>
              <input value={costCenterLabel} onChange={e => { setCostCenterId(e.target.value); setCostCenterLabel(e.target.value); }}
                placeholder="e.g. Head Office, Mumbai Branch" style={inp()} />
            </div>
          )}
          {costCenterType === 'mfg' && (
            <div>
              <label style={lbl}>Manufacturing Location</label>
              <select value={costCenterId} onChange={e => {
                const loc = mfgLocations.find(x => String(x.locationId||x.id) === String(e.target.value));
                setCostCenterId(e.target.value);
                setCostCenterLabel(loc?.locationName || loc?.name || e.target.value);
              }} style={inp({ cursor:'pointer' })}>
                <option value="">— Select Location —</option>
                {mfgLocations.map(l => (
                  <option key={l.locationId||l.id} value={l.locationId||l.id}>
                    {l.locationName||l.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Section 3: Line Items */}
      <div style={{ border: `1px solid ${BD}`, borderRadius: 6, overflow: 'hidden', marginBottom: 10 }}>
        <div style={{ background: P, color: '#fff', padding: '7px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontWeight: 700, fontSize: 12 }}>📦 Line Items</span>
          <button onClick={() => setLines(ls => [...ls, emptyLine()])}
            style={{ height: 26, padding: '0 12px', background: 'rgba(255,255,255,0.18)', border: '1px solid rgba(255,255,255,0.3)',
              color: '#fff', borderRadius: 4, cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>
            + Add Line
          </button>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr style={{ background: '#F0F4FF' }}>
                {['#','Product','Description','Qty','Rate (₹)','GST %','Amount (₹)',''].map((h,i) => (
                  <th key={i} style={{ padding: '5px 8px', fontWeight: 700, textAlign: i >= 3 ? 'right' : 'left',
                    borderBottom: `1px solid ${BD}`, fontSize: 10, color: '#444', whiteSpace:'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={l._id} style={{ background: i%2===0?'#fff':'#fafcff' }}>
                  <td style={{ padding: '4px 8px', color: '#aaa', borderBottom: `1px solid #f0f0f0` }}>{i+1}</td>
                  <td style={{ padding: '4px 6px', borderBottom: `1px solid #f0f0f0`, minWidth: 160 }}>
                    <select value={l.productCode} onChange={e => pickProduct(l._id, e.target.value)}
                      style={{ ...inp(), fontSize: 11, height: 30 }}>
                      <option value="">— Select —</option>
                      {items.map(it => (
                        <option key={it.itemCode} value={it.itemCode}>{it.itemName}</option>
                      ))}
                    </select>
                  </td>
                  <td style={{ padding: '4px 6px', borderBottom: `1px solid #f0f0f0`, minWidth: 150 }}>
                    <input value={l.description} onChange={e => setLine(l._id,'description',e.target.value)}
                      placeholder="Description…" style={{ ...inp(), height: 30, fontSize: 11 }} />
                  </td>
                  <td style={{ padding: '4px 6px', borderBottom: `1px solid #f0f0f0`, width: 70 }}>
                    <input type="number" value={l.qty} onChange={e => setLine(l._id,'qty',e.target.value)}
                      min="0" step="1" style={{ ...inp(), height: 30, fontSize: 11, textAlign: 'right' }} />
                  </td>
                  <td style={{ padding: '4px 6px', borderBottom: `1px solid #f0f0f0`, width: 100 }}>
                    <input type="number" value={l.rate} onChange={e => setLine(l._id,'rate',e.target.value)}
                      min="0" step="0.01" placeholder="0.00" style={{ ...inp(), height: 30, fontSize: 11, textAlign: 'right' }} />
                  </td>
                  <td style={{ padding: '4px 6px', borderBottom: `1px solid #f0f0f0`, width: 80 }}>
                    <select value={l.gstPercent} onChange={e => setLine(l._id,'gstPercent',e.target.value)}
                      style={{ ...inp(), height: 30, fontSize: 11, cursor: 'pointer' }}>
                      {GST_RATES.map(r => <option key={r} value={r}>{r}%</option>)}
                    </select>
                  </td>
                  <td style={{ padding: '4px 8px', textAlign: 'right', fontWeight: 600,
                    borderBottom: `1px solid #f0f0f0`, color: '#104f4f', whiteSpace: 'nowrap' }}>
                    ₹{fmt(lineTotal(l))}
                  </td>
                  <td style={{ padding: '4px 6px', borderBottom: `1px solid #f0f0f0` }}>
                    {lines.length > 1 && (
                      <button onClick={() => setLines(ls => ls.filter(x => x._id !== l._id))}
                        style={{ height: 24, width: 24, background: '#fff3f3', border: '1px solid #ffb3b3',
                          color: '#cc0000', borderRadius: 4, cursor: 'pointer', fontSize: 12, padding: 0 }}>
                        ✕
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totals */}
        <div style={{ background: '#F7F9FF', borderTop: `1px solid ${BD}`, padding: '10px 16px',
          display: 'flex', justifyContent: 'flex-end' }}>
          <table style={{ fontSize: 12, borderCollapse: 'collapse' }}>
            <tbody>
              <tr>
                <td style={{ padding: '2px 24px 2px 0', color: '#666' }}>Subtotal</td>
                <td style={{ padding: '2px 0', textAlign: 'right', fontWeight: 600 }}>₹{fmt(subtotal)}</td>
              </tr>
              <tr>
                <td style={{ padding: '2px 24px 2px 0', color: '#666' }}>Total GST</td>
                <td style={{ padding: '2px 0', textAlign: 'right', fontWeight: 600, color: '#b06000' }}>₹{fmt(totalGst)}</td>
              </tr>
              <tr style={{ borderTop: `2px solid ${BD}` }}>
                <td style={{ padding: '4px 24px 0 0', fontWeight: 800, color: P }}>Grand Total</td>
                <td style={{ padding: '4px 0 0', textAlign: 'right', fontWeight: 800, fontSize: 15, color: P }}>
                  ₹{fmt(grandTotal)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', padding: '4px 0' }}>
        <button onClick={() => navigate('/account/expense/view')}
          style={{ height: 36, padding: '0 20px', background: '#f5f5f5', border: `1px solid ${BD}`,
            borderRadius: 6, cursor: 'pointer', fontFamily: F, fontSize: 12, fontWeight: 600 }}>
          Cancel
        </button>
        {!isEdit && (
          <button onClick={() => save('pending')} disabled={saving}
            style={{ height: 36, padding: '0 22px', background: saving ? '#aaa' : '#ff9800', border: 'none',
              borderRadius: 6, cursor: saving ? 'not-allowed' : 'pointer', color: '#fff',
              fontFamily: F, fontSize: 12, fontWeight: 700 }}>
            {saving ? 'Saving…' : '💾 Save as Pending'}
          </button>
        )}
        {(isEdit || can(user,'accExpense','approve')) && (
        <button onClick={() => save('approved')} disabled={saving}
          style={{ height: 36, padding: '0 24px', background: saving ? '#aaa' : P, border: 'none',
            borderRadius: 6, cursor: saving ? 'not-allowed' : 'pointer', color: '#fff',
            fontFamily: F, fontSize: 12, fontWeight: 700 }}>
          {saving ? 'Saving…' : isEdit ? '💾 Save Changes' : '✅ Approve & Save'}
        </button>
        )}
      </div>
    </div>
  );
}
