import React, { useState, useEffect, useMemo, useCallback } from 'react';
import axios from 'axios';
import { useCompany } from '../../context/CompanyContext';
import { useAuth } from '../../context/AuthContext';

const F  = "'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif";
const P  = '#133d80';
const BD = '#E5EAF2';

const fmtD   = d => d ? new Date(d).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}) : '—';
const fmtAmt = n => n != null && n !== '' ? `₹${Number(n).toFixed(2)}` : '—';
const camel  = k => k.replace(/([A-Z])/g,' $1').replace(/^./,c=>c.toUpperCase()).replace(/Id$/,'').trim();

/* ── Module colours ── */
const MC = {
  deposit:'{bg:#dbeafe,c:#1d4ed8}',
};
const MODULE_COLOR = {
  deposit:      { bg:'#dbeafe', color:'#1d4ed8' },
  payment:      { bg:'#dcfce7', color:'#15803d' },
  receipt:      { bg:'#d1fae5', color:'#065f46' },
  journal:      { bg:'#ede9fe', color:'#7c3aed' },
  expense:      { bg:'#fef9c3', color:'#92400e' },
  creditnote:   { bg:'#fee2e2', color:'#dc2626' },
  debitnote:    { bg:'#fef3c7', color:'#b45309' },
  salesorder:   { bg:'#e0f2fe', color:'#0369a1' },
  purchaseorder:{ bg:'#f0fdf4', color:'#166534' },
  salesbill:    { bg:'#dbeafe', color:'#1d4ed8' },
  purchasebill: { bg:'#f0fdf4', color:'#166534' },
  vendor:       { bg:'#fdf4ff', color:'#7e22ce' },
  client:       { bg:'#fff7ed', color:'#c2410c' },
};

const STATUS_STYLE = {
  pending:   { bg:'#fef3c7', color:'#92400e', border:'#fde68a', label:'Pending'   },
  draft:     { bg:'#f3f4f6', color:'#6b7280', border:'#d1d5db', label:'Draft'     },
  approved:  { bg:'#dcfce7', color:'#15803d', border:'#86efac', label:'Approved'  },
  active:    { bg:'#dcfce7', color:'#15803d', border:'#86efac', label:'Active'    },
  confirmed: { bg:'#dcfce7', color:'#15803d', border:'#86efac', label:'Confirmed' },
  posted:    { bg:'#dbeafe', color:'#1d4ed8', border:'#bfdbfe', label:'Posted'    },
  rejected:  { bg:'#fee2e2', color:'#dc2626', border:'#fca5a5', label:'Rejected'  },
};

/* permKey must match the user-permission keys in utils/permissions.js (and the
   backend's PERMISSION_MODULE map in api/notifications.js). */
const ALL_MODULES = [
  { key:'deposit',       label:'BG / Deposit',   permKey:'accDeposit'    },
  { key:'payment',       label:'Payment',         permKey:'accPayment'    },
  { key:'receipt',       label:'Receipt',         permKey:'accReceipt'    },
  { key:'journal',       label:'Journal',         permKey:'accJournal'    },
  { key:'expense',       label:'Expense',         permKey:'accExpense'    },
  { key:'creditnote',    label:'Credit Note',     permKey:'accCreditNote' },
  { key:'debitnote',     label:'Debit Note',      permKey:'accDebitNote'  },
  { key:'salesorder',    label:'Sales Order',     permKey:'salesOrder'    },
  { key:'purchaseorder', label:'Purchase Order',  permKey:'purchaseOrder' },
  { key:'salesbill',     label:'Sales Bill',      permKey:'salesBill'     },
  { key:'purchasebill',  label:'Purchase Bill',   permKey:'purchaseBill'  },
  { key:'vendor',        label:'Vendor',          permKey:'vendor'        },
  { key:'client',        label:'Client',          permKey:'client'        },
];

/* Check if current user can approve a module */
const canApprove = (user, moduleKey) => {
  if (!user) return false;
  if (user.role === 'admin') return true;
  const mod = ALL_MODULES.find(m => m.key === moduleKey);
  if (!mod || !user.permissions) return false;
  return user.permissions[mod.permKey]?.approve === true;
};

/* Attachment URL builder per module */
const attachmentUrl = (module, refId, att, cid) => {
  const f = att.file || att.fileName || att.filename || '';
  if (!f) return null;
  const base = {
    deposit:       `/api/deposits/${refId}/docs/${f}`,
    salesorder:    `/api/sales-orders/${refId}/render-attachment/${f}`,
    purchaseorder: `/api/purchase-orders/${refId}/download/${f}`,
    salesbill:     `/api/bills/${refId}/download/${f}`,
    purchasebill:  `/api/bills/${refId}/download/${f}`,
    vendor:        `/api/vendors/${refId}/download/${f}`,
    client:        `/api/clients/${refId}/download/${f}`,
  }[module];
  return base ? `${base}?companyId=${cid}` : null;
};

/* Pull attachments array from any raw record */
const getAttachments = raw =>
  raw.pdfFiles || raw.attachments || raw.documents || raw.files || [];

/* Fields to SKIP in the generic detail grid (handled specially) */
const SKIP_FIELDS = new Set([
  'items','entries','pdfFiles','attachments','documents','files','charges',
  'scopeItems','bomItems','tasks','materialPlanningItems','specSheet',
  'specFiles','addons','customFields','contacts','password','__v',
  'companyId','updatedAt','_id','bankGuarantee','warranty','lines',
]);

/* Format a raw value for display */
const fmtVal = (v, k = '') => {
  if (Array.isArray(v)) return v.join(', ');
  if (typeof v === 'number' && /(id|no|code|number)$/i.test(k)) return String(v);
  if (typeof v === 'number') {
    /* format numbers ≥ 100 as currency-style */
    return Math.abs(v) >= 100
      ? Number(v).toFixed(2)
      : String(v);
  }
  return String(v).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
};

/* Build flat list of [key, displayValue] from a raw record */
const buildKVPairs = (raw) => {
  const pairs = [];
  Object.entries(raw).forEach(([k, v]) => {
    if (SKIP_FIELDS.has(k)) return;
    if (v === null || v === undefined || v === '') return;
    if (Array.isArray(v)) {
      if (v.length === 0) return;
      if (typeof v[0] !== 'object') pairs.push([k, v.join(', ')]);
      /* arrays of objects (e.g. contactPersons) — skip, handled separately */
      return;
    }
    if (typeof v === 'object') return;
    pairs.push([k, fmtVal(v, k)]);
  });
  return pairs;
};

/* ════════════════════════════════════════════════
   ORDER CONTEXT — for a payment / receipt / expense, the PO and sales order
   it belongs to: Order ID, PO No, SO File No, client, vendor, material and
   how much of the order is already paid.
════════════════════════════════════════════════ */
function OrderContext({ module, raw, cid }) {
  const [ctx, setCtx] = useState(null);
  useEffect(() => {
    if (!cid) return;
    let alive = true;
    const get = u => axios.get(u).then(r => r.data).catch(() => null);
    (async () => {
      const orderId = String(module === 'expense' ? (raw.soId || raw.orderId || '') : (raw.orderId || ''));
      if (!orderId) { if (alive) setCtx({ none: true }); return; }
      let po = null, so = null;
      const wantPO = module === 'payment' ? raw.orderType !== 'sales' : false;
      if (wantPO || /^4/.test(orderId)) po = await get(`/api/purchase-orders/${orderId}?companyId=${cid}`);
      if (po && po.orderId != null) {
        if (po.linkedSalesOrderId) so = await get(`/api/sales-orders/${po.linkedSalesOrderId}?companyId=${cid}`);
      } else {
        po = null;
        so = await get(`/api/sales-orders/${orderId}?companyId=${cid}`);
        if (!so || so.orderId == null) so = null;
      }
      /* paid so far on this order — confirmed entries of the same type, this one excluded */
      let paidBefore = null;
      if (module === 'payment' || module === 'receipt') {
        const list = await get(`/api/accounts/payments?companyId=${cid}`) || [];
        paidBefore = list.filter(p => p.type === (module === 'receipt' ? 'receipt' : 'payment')
            && String(p.orderId) === orderId && p.status === 'confirmed'
            && String(p.paymentId) !== String(raw.paymentId))
          .reduce((t, p) => t + (parseFloat(p.amount) || 0), 0);
      }
      const banks = raw.bankId ? (await get(`/api/accounts/banks?companyId=${cid}`) || []) : [];
      const bank  = banks.find(b => String(b.bankId) === String(raw.bankId));
      if (alive) setCtx({ po, so, paidBefore, bank });
    })();
    return () => { alive = false; };
  }, [module, raw, cid]);

  if (!ctx) return <div style={{ fontSize:11.5, color:'#9ca3af', padding:'6px 0 12px' }}>Loading order details…</div>;
  if (ctx.none) return null;
  const { po, so, paidBefore, bank } = ctx;
  const order = po || so;
  if (!order) return null;

  const items = (order.items || []).filter(it => it && (it.itemName || it.description || it.material));
  const orderValue = parseFloat(order.grandTotal) || 0;
  const thisAmt = parseFloat(raw.amount || raw.grandTotal) || 0;
  const rows = [
    ['Order ID',     order.orderId],
    po && ['PO No',  po.poNo || po.poNumber],
    po && ['PO Date', fmtD(po.poDate || po.date)],
    so && ['SO File No', so.orderNo],
    so && ['Client', so.customerName || so.clientName],
    so && ['Client PO No', so.customerPO],
    ['Vendor',       po ? po.vendorName : (raw.vendorName || raw.ledgerName || raw.entityName)],
    bank && ['Bank', `${bank.bankName || ''}${bank.accountNumber ? ' — ' + bank.accountNumber : ''}`],
  ].filter(r => r && r[1] != null && r[1] !== '');

  const L = { fontSize:11, color:'#6b7280', fontWeight:500, width:120, minWidth:120 };
  const V = { fontSize:11.5, color:'#111827', fontWeight:700, flex:1, wordBreak:'break-word' };
  return (
    <div style={{ border:`1px solid ${BD}`, borderRadius:10, padding:'10px 12px', marginBottom:14, background:'#F8FAFF' }}>
      <div style={{ fontSize:11, fontWeight:700, color:P, letterSpacing:.5, textTransform:'uppercase', marginBottom:6 }}>
        Order Details{po ? ' — Purchase Order' : ' — Sales Order'}
      </div>
      {rows.map(([l, v]) => (
        <div key={l} style={{ display:'flex', gap:8, padding:'3px 0' }}><div style={L}>{l}</div><div style={V}>{String(v)}</div></div>
      ))}
      {items.length > 0 && (
        <div style={{ display:'flex', gap:8, padding:'3px 0' }}>
          <div style={L}>Material</div>
          <div style={{ ...V, fontWeight:600 }}>
            {items.map((it, i) => (
              <div key={i}>{it.itemName || it.material || it.description}{it.qty ? ` — ${it.qty} ${it.unit || ''}` : ''}</div>
            ))}
          </div>
        </div>
      )}
      {orderValue > 0 && (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(110px, 1fr))', gap:6, marginTop:8 }}>
          {[
            ['Order Value', orderValue, '#111827'],
            paidBefore != null && [module === 'receipt' ? 'Received Before' : 'Paid Before', paidBefore, '#15803d'],
            (module === 'payment' || module === 'receipt') && ['This Entry', thisAmt, P],
            paidBefore != null && ['Balance After', orderValue - paidBefore - thisAmt, (orderValue - paidBefore - thisAmt) < 0 ? '#dc2626' : '#b45309'],
          ].filter(Boolean).map(([l, v, c]) => (
            <div key={l} style={{ background:'#fff', border:`1px solid ${BD}`, borderRadius:8, padding:'6px 8px' }}>
              <div style={{ fontSize:9.5, color:'#6b7280', fontWeight:700, textTransform:'uppercase' }}>{l}</div>
              <div style={{ fontSize:12.5, fontWeight:800, color:c }}>{fmtAmt(v)}</div>
            </div>
          ))}
        </div>
      )}
      {paidBefore != null && orderValue > 0 && orderValue - paidBefore - thisAmt < 0 && (
        <div style={{ marginTop:8, fontSize:11, fontWeight:700, color:'#dc2626' }}>⚠ This entry takes the total above the order value.</div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════
   PREVIEW MODAL
════════════════════════════════════════════════ */
function PreviewModal({ item, cid, onClose, onApprove, onReject, canDoApprove }) {
  const raw = item.rawData || {};
  const mc  = MODULE_COLOR[item.module] || { bg:'#f3f4f6', color:'#374151' };
  const sst = STATUS_STYLE[(item.status||'').toLowerCase()] || STATUS_STYLE.pending;
  const isPend = ['pending','draft'].includes((item.status||'').toLowerCase());

  /* ── generic key-value pairs ── */
  const kvPairs = buildKVPairs(raw);

  /* ── items rows (SO, PO, bills) ── */
  const items = raw.items || [];
  const hasItems = items.length > 0;

  /* ── journal entries ── */
  const entries = raw.entries || raw.lines || [];
  const hasEntries = entries.length > 0;

  /* ── attachments ── */
  const atts = getAttachments(raw);

  /* ── module-specific highlighted fields (matched to actual JSON keys) ── */
  const HIGHLIGHTS = {
    deposit:       ['depositType','bgNo','customerName','customerPO','orderNo','amount','bgAmount','orderDate','startDate','expiryDate','claimExpiryDate','issuingBankName','issuingBankAccNo','issuingBankIfsc','issuedToBankName','fdNo','remarks'],
    payment:       ['paymentId','type','party','amount','date','paymentMode','reference','notes','narration','bankName'],
    receipt:       ['paymentId','type','party','amount','date','paymentMode','reference','notes','narration','bankName'],
    journal:       ['refNo','journalId','date','narration','totalDebit','totalCredit'],
    expense:       ['expenseId','expenseNo','category','party','amount','date','narration','reference','paymentMode'],
    creditnote:    ['cnNo','creditNoteNo','party','partyName','amount','date','againstInvoice','narration','reason'],
    debitnote:     ['dnNo','debitNoteNo','party','partyName','amount','date','againstInvoice','narration','reason'],
    salesorder:    ['orderNo','orderType','orderDate','customerName','customerCode','customerPO','poDate','deliveryDate','shipToName','shipToAddress','shipToCity','shipToState','paymentTerms','subTotal','totalGST','grandTotal'],
    purchaseorder: ['poNo','poNumber','poDate','poType','vendorName','vendorCode','vendorGstin','vendorAddress','vendorCity','vendorState','linkedSalesOrderId','deliveryDate','paymentTerms','subTotal','totalGST','grandTotal'],
    salesbill:     ['billNo','billDate','partyName','partyGstin','gstType','billToName','billToAddress','shipToAddress','ewayBillNo','irnNo','subTotal','totalCGST','totalSGST','totalIGST','totalGST','grandTotal'],
    purchasebill:  ['billNo','billDate','vendorBillNo','partyName','partyGstin','gstType','subTotal','totalCGST','totalSGST','totalIGST','totalGST','grandTotal'],
    vendor:        ['vendorName','vendorCode','businessType','pan','gstin','gstType','address','city','state','pincode','country','contactPerson','mobile','altMobile','email','website','bankName','accountHolder','accountNo','ifsc','branch','paymentTerms','creditLimit','paymentModes','remarks'],
    client:        ['companyName','clientName','clientCode','gstin','gstType','pan','address','city','state','pincode','contactPerson','mobile','email','paymentTerms','creditLimit','remarks'],
  };
  const hlKeys = HIGHLIGHTS[item.module] || [];
  const hlPairs = hlKeys
    .map(k => [k, raw[k]])
    .filter(([,v]) => v != null && v !== '' && !(Array.isArray(v) && v.length === 0))
    .map(([k, v]) => [k, fmtVal(v, k)]);
  const hlKeySet = new Set(hlKeys);
  const otherPairs = kvPairs.filter(([k]) => !hlKeySet.has(k));

  const FieldRow = ({ label, value }) => {
    const str = String(value);
    const isMulti = str.includes('\n');
    return (
      <div style={{ display:'flex', gap:8, padding:'5px 0', borderBottom:'1px solid #f3f4f6', fontSize:11.5 }}>
        <div style={{ width:155, minWidth:155, color:'#6b7280', fontWeight:500, paddingTop: isMulti ? 1 : 0 }}>{camel(label)}</div>
        <div style={{ flex:1, color:'#111827', fontWeight:500, wordBreak:'break-word', whiteSpace: isMulti ? 'pre-wrap' : 'normal' }}>
          {str}
        </div>
      </div>
    );
  };

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', zIndex:9998, display:'flex', alignItems:'center', justifyContent:'center', padding:'16px' }}
      onClick={onClose}>
      <div onClick={e=>e.stopPropagation()}
        style={{ background:'#fff', borderRadius:14, width:'min(900px,98vw)', maxHeight:'92vh',
          display:'flex', flexDirection:'column', boxShadow:'0 24px 80px rgba(0,0,0,0.22)', overflow:'hidden', fontFamily:F }}>

        {/* ── Header ── */}
        <div style={{ padding:'16px 22px', borderBottom:`1px solid ${BD}`, display:'flex', alignItems:'flex-start', justifyContent:'space-between', background:'#fafbff' }}>
          <div style={{ display:'flex', gap:14, alignItems:'flex-start' }}>
            <div>
              <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap', marginBottom:4 }}>
                <span style={{ fontFamily:'monospace', fontWeight:900, fontSize:14, color:P }}>{item.approvalId}</span>
                <span style={{ background:mc.bg, color:mc.color, padding:'2px 10px', borderRadius:5, fontSize:11, fontWeight:700 }}>{item.moduleLabel}</span>
                {item.subType && <span style={{ background:'#f3f4f6', color:'#374151', padding:'2px 8px', borderRadius:5, fontSize:10.5, fontWeight:600 }}>{item.subType}</span>}
                <span style={{ background:sst.bg, color:sst.color, border:`1px solid ${sst.border}`, padding:'2px 8px', borderRadius:5, fontSize:11, fontWeight:700 }}>{sst.label}</span>
              </div>
              <div style={{ fontSize:14, fontWeight:800, color:'#111827' }}>{item.party || item.refNo || '—'}</div>
              <div style={{ fontSize:11.5, color:'#6b7280', marginTop:2 }}>
                Ref: {item.refNo} &nbsp;·&nbsp; Date: {fmtD(item.date)}
                {item.amount != null ? ` · ${fmtAmt(item.amount)}` : ''}
              </div>
              {item.registeredAt && <div style={{ fontSize:10.5, color:'#9ca3af', marginTop:2 }}>Submitted: {fmtD(item.registeredAt)}</div>}
            </div>
          </div>
          <button onClick={onClose}
            style={{ border:'none', background:'#f3f4f6', borderRadius:7, width:30, height:30, cursor:'pointer', fontSize:16, color:'#6b7280', lineHeight:'30px', textAlign:'center' }}>
            ✕
          </button>
        </div>

        {/* ── Body ── */}
        <div style={{ flex:1, overflowY:'auto', padding:'18px 22px', display:'flex', gap:20, flexWrap:'wrap' }}>

          {/* Left: Key Details */}
          <div style={{ flex:'1 1 340px', minWidth:280 }}>
            {['payment','receipt','expense'].includes(item.module) && <OrderContext module={item.module} raw={raw} cid={cid} />}
            <div style={{ fontSize:11, fontWeight:700, color:P, letterSpacing:.5, textTransform:'uppercase', marginBottom:8 }}>Key Details</div>
            {hlPairs.length === 0 && otherPairs.length === 0 && (
              <div style={{ color:'#9ca3af', fontSize:12 }}>No details available</div>
            )}
            {hlPairs.map(([k,v]) => <FieldRow key={k} label={k} value={v}/>)}
            {otherPairs.length > 0 && (
              <>
                <div style={{ fontSize:10, color:'#9ca3af', margin:'10px 0 4px', textTransform:'uppercase', letterSpacing:.5 }}>Other Fields</div>
                {otherPairs.map(([k,v]) => <FieldRow key={k} label={k} value={v}/>)}
              </>
            )}
          </div>

          {/* Right: Items + Journal + Attachments */}
          <div style={{ flex:'1 1 340px', minWidth:280 }}>

            {/* Items table */}
            {hasItems && (
              <div style={{ marginBottom:16 }}>
                <div style={{ fontSize:11, fontWeight:700, color:P, letterSpacing:.5, textTransform:'uppercase', marginBottom:8 }}>Order Items</div>
                <div style={{ overflowX:'auto' }}>
                  <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
                    <thead>
                      <tr style={{ background:'#f8faff', borderBottom:`2px solid ${BD}` }}>
                        <th style={{ padding:'5px 8px', textAlign:'left', color:'#374151', fontWeight:700 }}>#</th>
                        <th style={{ padding:'5px 8px', textAlign:'left', color:'#374151', fontWeight:700 }}>Description</th>
                        <th style={{ padding:'5px 8px', textAlign:'center', color:'#374151', fontWeight:700 }}>Qty</th>
                        <th style={{ padding:'5px 8px', textAlign:'right', color:'#374151', fontWeight:700 }}>Rate</th>
                        <th style={{ padding:'5px 8px', textAlign:'right', color:'#374151', fontWeight:700 }}>Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((it, i) => {
                        const qty = it.qty || it.quantity || '';
                        const rate = it.rate || it.unitPrice || '';
                        const amt = it.amount || it.total || (qty && rate ? parseFloat(qty)*parseFloat(rate) : '');
                        const desc = [it.itemName, it.description].filter(Boolean).join(' – ');
                        return (
                          <tr key={i} style={{ borderBottom:`1px solid ${BD}` }}>
                            <td style={{ padding:'5px 8px', color:'#9ca3af' }}>{i+1}</td>
                            <td style={{ padding:'5px 8px', color:'#111827' }}>{desc}</td>
                            <td style={{ padding:'5px 8px', textAlign:'center', color:'#374151' }}>{qty} {it.unit||''}</td>
                            <td style={{ padding:'5px 8px', textAlign:'right', color:'#374151' }}>{rate ? Number(rate).toFixed(2) : '—'}</td>
                            <td style={{ padding:'5px 8px', textAlign:'right', fontWeight:600, color:'#111827' }}>{amt ? Number(amt).toFixed(2) : '—'}</td>
                          </tr>
                        );
                      })}
                      {raw.grandTotal && (
                        <tr style={{ background:'#f8faff', borderTop:`2px solid ${BD}` }}>
                          <td colSpan={4} style={{ padding:'5px 8px', textAlign:'right', fontWeight:700 }}>Total</td>
                          <td style={{ padding:'5px 8px', textAlign:'right', fontWeight:800, color:P }}>{fmtAmt(raw.grandTotal)}</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Journal entries */}
            {hasEntries && (
              <div style={{ marginBottom:16 }}>
                <div style={{ fontSize:11, fontWeight:700, color:P, letterSpacing:.5, textTransform:'uppercase', marginBottom:8 }}>Journal Entries</div>
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
                  <thead>
                    <tr style={{ background:'#f8faff', borderBottom:`2px solid ${BD}` }}>
                      <th style={{ padding:'5px 8px', textAlign:'left', color:'#374151', fontWeight:700 }}>Account</th>
                      <th style={{ padding:'5px 8px', textAlign:'right', color:'#374151', fontWeight:700 }}>DR (₹)</th>
                      <th style={{ padding:'5px 8px', textAlign:'right', color:'#374151', fontWeight:700 }}>CR (₹)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((e, i) => (
                      <tr key={i} style={{ borderBottom:`1px solid ${BD}` }}>
                        <td style={{ padding:'5px 8px', color:'#111827' }}>{e.account||e.ledger||e.name||'—'}</td>
                        <td style={{ padding:'5px 8px', textAlign:'right', color:'#15803d' }}>{e.debit||e.dr ? Number(e.debit||e.dr).toFixed(2) : ''}</td>
                        <td style={{ padding:'5px 8px', textAlign:'right', color:'#dc2626' }}>{e.credit||e.cr ? Number(e.credit||e.cr).toFixed(2) : ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Attachments */}
            <div>
              <div style={{ fontSize:11, fontWeight:700, color:P, letterSpacing:.5, textTransform:'uppercase', marginBottom:8 }}>
                Attachments {atts.length > 0 ? `(${atts.length})` : ''}
              </div>
              {atts.length === 0 ? (
                <div style={{ fontSize:11.5, color:'#9ca3af', padding:'8px 0' }}>No attachments</div>
              ) : (
                <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                  {atts.map((att, i) => {
                    const url = attachmentUrl(item.module, item.refId, att, cid);
                    const name = att.name || att.originalname || att.fileName || att.file || `File ${i+1}`;
                    const ext = (att.file||att.fileName||'').split('.').pop()?.toLowerCase();
                    const isImage = ['jpg','jpeg','png','gif','webp'].includes(ext);
                    const isPdf  = ext === 'pdf';
                    return (
                      <div key={i} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 12px', background:'#f8faff', borderRadius:7, border:`1px solid ${BD}` }}>
                        <span style={{ fontSize:20 }}>{isPdf?'📄':isImage?'🖼️':'📎'}</span>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontSize:12, fontWeight:600, color:'#111827', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{name}</div>
                          {att.uploadedAt && <div style={{ fontSize:10, color:'#9ca3af' }}>{fmtD(att.uploadedAt)}</div>}
                        </div>
                        {url ? (
                          <div style={{ display:'flex', gap:6 }}>
                            <a href={url} target="_blank" rel="noopener noreferrer"
                              style={{ padding:'4px 10px', background:'#eff6ff', border:'1px solid #bfdbfe', borderRadius:5, color:P, fontSize:11, fontWeight:600, textDecoration:'none', whiteSpace:'nowrap' }}>
                              👁 View
                            </a>
                            <a href={url} download
                              style={{ padding:'4px 10px', background:'#f0fdf4', border:'1px solid #86efac', borderRadius:5, color:'#15803d', fontSize:11, fontWeight:600, textDecoration:'none', whiteSpace:'nowrap' }}>
                              ↓
                            </a>
                          </div>
                        ) : (
                          <span style={{ fontSize:11, color:'#9ca3af' }}>No URL</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Footer ── */}
        <div style={{ padding:'14px 22px', borderTop:`1px solid ${BD}`, display:'flex', alignItems:'center', justifyContent:'space-between', background:'#fafbff' }}>
          <button onClick={onClose}
            style={{ padding:'8px 20px', border:`1px solid ${BD}`, borderRadius:7, background:'#fff', fontSize:13, cursor:'pointer', fontFamily:F, color:'#374151' }}>
            Close
          </button>
          {isPend && canDoApprove && (
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={onReject}
                style={{ padding:'8px 20px', background:'#fee2e2', border:'1px solid #fca5a5', borderRadius:7, color:'#dc2626', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:F }}>
                ✗ Reject
              </button>
              <button onClick={onApprove}
                style={{ padding:'8px 24px', background:'#15803d', border:'none', borderRadius:7, color:'#fff', fontSize:13, fontWeight:800, cursor:'pointer', fontFamily:F }}>
                ✓ Approve
              </button>
            </div>
          )}
          {isPend && !canDoApprove && (
            <div style={{ fontSize:12, color:'#9ca3af' }}>You do not have approval rights for this module</div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════
   REJECT REASON MODAL
════════════════════════════════════════════════ */
function RejectModal({ item, onConfirm, onClose }) {
  const [reason, setReason] = useState('');
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ background:'#fff', borderRadius:12, padding:28, width:420, boxShadow:'0 20px 60px rgba(0,0,0,0.2)', fontFamily:F }}>
        <div style={{ fontSize:16, fontWeight:800, color:'#111827', marginBottom:4 }}>Reject Entry</div>
        <div style={{ fontSize:12, color:'#6b7280', marginBottom:16 }}>{item.approvalId} · {item.moduleLabel} · {item.party||item.refNo}</div>
        <textarea value={reason} onChange={e=>setReason(e.target.value)}
          placeholder="Reason for rejection (optional)"
          style={{ width:'100%', height:80, border:`1px solid ${BD}`, borderRadius:7, padding:'8px 10px', fontSize:12, fontFamily:F, outline:'none', resize:'none' }}/>
        <div style={{ display:'flex', gap:10, marginTop:14, justifyContent:'flex-end' }}>
          <button onClick={onClose} style={{ padding:'7px 18px', border:`1px solid ${BD}`, borderRadius:7, background:'#fff', fontSize:12, cursor:'pointer', fontFamily:F }}>Cancel</button>
          <button onClick={()=>onConfirm(reason)} style={{ padding:'7px 18px', background:'#dc2626', border:'none', borderRadius:7, color:'#fff', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:F }}>Reject</button>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════
   MAIN PAGE
════════════════════════════════════════════════ */
const TAB_STATUS = ['pending','approved','rejected','all'];

export default function ApprovalView() {
  const { selectedCompany } = useCompany();
  const { user } = useAuth();
  const cid = selectedCompany?.companyId;

  const [items,      setItems]      = useState([]);
  const [stats,      setStats]      = useState({});
  const [loading,    setLoading]    = useState(true);
  const [tab,        setTab]        = useState('pending');
  const [modFilter,  setModFilter]  = useState('all');
  const [search,     setSearch]     = useState('');
  const [preview,    setPreview]    = useState(null);  // item being previewed
  const [rejectFor,  setRejectFor]  = useState(null);  // item being rejected (after preview)
  const [toast,      setToast]      = useState(null);
  const [selected,   setSelected]   = useState(() => new Set()); // "module:refId"
  const [bulkBusy,   setBulkBusy]   = useState(false);
  const [bulkRejectOpen, setBulkRejectOpen] = useState(false);

  const isAdmin = user?.role === 'admin';

  const showToast = (msg, ok=true) => {
    setToast({ msg, ok });
    setTimeout(()=>setToast(null), 3200);
  };

  const load = useCallback(async () => {
    if (!cid) return;
    setLoading(true);
    try {
      const [iRes, sRes] = await Promise.all([
        axios.get(`/api/approvals?companyId=${cid}&status=${tab}`),
        axios.get(`/api/approvals/stats?companyId=${cid}`),
      ]);
      /* Filter items to only modules this user can approve (for pending tab) */
      const all = iRes.data || [];
      setItems(all);
      setStats(sRes.data || {});
    } catch(e) { showToast('Load error: '+e.message, false); }
    setLoading(false);
  }, [cid, tab]);

  useEffect(()=>{ load(); },[load]);

  const totalPending = useMemo(()=>Object.values(stats).reduce((s,m)=>s+(m.pending||0),0),[stats]);

  /* Modules this user can approve */
  const approveableModules = useMemo(()=>
    ALL_MODULES.filter(m=>canApprove(user,m.key)).map(m=>m.key)
  ,[user]);

  const filtered = useMemo(()=>{
    let r = items;
    /* In pending tab, only show items user can approve */
    if (tab === 'pending') r = r.filter(x => approveableModules.includes(x.module));
    if (modFilter !== 'all') r = r.filter(x=>x.module===modFilter);
    if (search) {
      const q = search.toLowerCase();
      r = r.filter(x=>
        String(x.approvalId||'').toLowerCase().includes(q)||
        String(x.refNo||'').toLowerCase().includes(q)||
        String(x.party||'').toLowerCase().includes(q)||
        String(x.moduleLabel||'').toLowerCase().includes(q)
      );
    }
    return r;
  },[items, modFilter, search, tab, approveableModules]);

  const doApprove = async (item) => {
    setPreview(null);
    try {
      await axios.put(`/api/approvals/approve?companyId=${cid}`,{ module:item.module, refId:item.refId, approvedBy: user?.name||'Admin' });
      showToast(`${item.approvalId} approved ✓`);
      load();
    } catch(e){ showToast('Error: '+e.message,false); }
  };

  const doReject = async (item, reason) => {
    setPreview(null); setRejectFor(null);
    try {
      await axios.put(`/api/approvals/reject?companyId=${cid}`,{ module:item.module, refId:item.refId, rejectedBy:user?.name||'Admin', reason });
      showToast(`${item.approvalId} rejected`);
      load();
    } catch(e){ showToast('Error: '+e.message,false); }
  };

  const isPending = item => ['pending','draft'].includes((item.status||'').toLowerCase());

  /* ── Bulk selection ── */
  const keyOf = it => `${it.module}:${it.refId}`;

  /* Only pending rows the user is allowed to approve can be selected */
  const selectableRows = useMemo(
    () => filtered.filter(it => ['pending','draft'].includes((it.status||'').toLowerCase()) && canApprove(user, it.module)),
    [filtered, user]
  );

  /* Any change of tab/filter/company invalidates the current selection */
  useEffect(()=>{ setSelected(new Set()); }, [tab, modFilter, search, cid]);

  const toggleOne = (it) => setSelected(prev => {
    const next = new Set(prev);
    const k = keyOf(it);
    if (next.has(k)) next.delete(k); else next.add(k);
    return next;
  });

  const allSelected = selectableRows.length > 0 && selectableRows.every(it => selected.has(keyOf(it)));
  const someSelected = selected.size > 0 && !allSelected;

  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(selectableRows.map(keyOf)));

  const doBulk = async (action, reason='') => {
    const chosen = selectableRows.filter(it => selected.has(keyOf(it)));
    if (!chosen.length) return;
    setBulkBusy(true);
    try {
      const { data } = await axios.put(`/api/approvals/bulk?companyId=${cid}`, {
        action,
        items: chosen.map(it => ({ module: it.module, refId: it.refId })),
        by: user?.name || 'Admin',
        reason,
      });
      const verb = action === 'approve' ? 'approved' : 'rejected';
      if (data.failedCount) {
        showToast(`${data.approved} ${verb}, ${data.failedCount} failed`, false);
      } else {
        showToast(`${data.approved} ${verb}`);
      }
      setSelected(new Set());
      await load();
    } catch(e){ showToast('Error: '+(e.response?.data?.error || e.message), false); }
    setBulkBusy(false);
  };

  /* Visible modules for filter bar */
  const visibleMods = tab==='pending'
    ? ALL_MODULES.filter(m=>approveableModules.includes(m.key))
    : ALL_MODULES;

  return (
    <div style={{ fontFamily:F, background:'#f0f4fb', minHeight:'100%', padding:'14px 16px' }}>

      {/* Toast */}
      {toast && (
        <div style={{ position:'fixed', top:18, right:18, zIndex:99999, background:toast.ok?'#15803d':'#dc2626',
          color:'#fff', padding:'10px 22px', borderRadius:8, fontSize:13, fontWeight:600, boxShadow:'0 6px 24px rgba(0,0,0,0.2)', fontFamily:F }}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
        <div>
          <div style={{ fontSize:11, color:'#6b7280', marginBottom:2 }}>Admin → Approval</div>
          <div style={{ fontSize:18, fontWeight:800, color:'#111827', display:'flex', alignItems:'center', gap:10 }}>
            Approval Queue
            {totalPending>0 && <span style={{ background:'#dc2626', color:'#fff', fontSize:11, fontWeight:700, padding:'2px 9px', borderRadius:20 }}>{totalPending} pending</span>}
          </div>
          <div style={{ fontSize:11, color:'#6b7280', marginTop:2 }}>
            {isAdmin ? 'You can approve all modules' : `You can approve: ${approveableModules.map(k=>ALL_MODULES.find(m=>m.key===k)?.label).filter(Boolean).join(', ')||'none'}`}
          </div>
        </div>
        <button onClick={load} style={{ height:34, padding:'0 16px', background:'#fff', border:`1px solid ${BD}`, borderRadius:7, fontSize:12, cursor:'pointer', fontFamily:F, color:'#374151' }}>
          ↻ Refresh
        </button>
      </div>

      {/* Module stats strip */}
      <div style={{ display:'flex', gap:6, flexWrap:'nowrap', overflowX:'auto', padding:'4px 2px 6px', marginBottom:10 }}>
        {visibleMods.map(m=>{
          const s  = stats[m.key]||{};
          const mc = MODULE_COLOR[m.key]||{ bg:'#f3f4f6', color:'#374151' };
          return (
            <div key={m.key} onClick={()=>setModFilter(modFilter===m.key?'all':m.key)}
              style={{ background:'#fff', border:`2px solid ${modFilter===m.key?P:BD}`, borderRadius:9, padding:'6px 8px',
                cursor:'pointer', boxShadow:'0 1px 3px rgba(0,0,0,0.04)', flex:'1 1 0', minWidth:78, transition:'border-color .15s' }}>
              <div style={{ fontSize:10, color:'#6b7280', marginBottom:2, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }} title={m.label}>{m.label}</div>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:6 }}>
                <span style={{ fontWeight:900, fontSize:18, color:s.pending>0?'#dc2626':'#9ca3af' }}>{s.pending||0}</span>
                <span style={{ fontSize:9, background:mc.bg, color:mc.color, padding:'1px 5px', borderRadius:4, fontWeight:700 }}>pend</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Tabs + search */}
      <div style={{ display:'flex', gap:10, marginBottom:12, alignItems:'center' }}>
        <div style={{ display:'flex', gap:2, background:'#fff', border:`1px solid ${BD}`, borderRadius:8, padding:3 }}>
          {TAB_STATUS.map(t=>(
            <button key={t} onClick={()=>{ setTab(t); setItems([]); }}
              style={{ padding:'4px 16px', borderRadius:6, border:'none', fontSize:12, fontWeight:tab===t?700:400,
                background:tab===t?P:'transparent', color:tab===t?'#fff':'#374151', cursor:'pointer', fontFamily:F, textTransform:'capitalize' }}>
              {t}
            </button>
          ))}
        </div>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search APR ID, ref no, party, module…"
          style={{ height:34, padding:'0 12px', border:`1px solid ${BD}`, borderRadius:7, fontSize:12, fontFamily:F, outline:'none', width:300 }}/>
        <div style={{ marginLeft:'auto', fontSize:11.5, color:'#6b7280' }}>
          {filtered.length} item{filtered.length!==1?'s':''}
        </div>
      </div>

      {/* Table */}
      <div style={{ background:'#fff', border:`1px solid ${BD}`, borderRadius:10, overflow:'hidden', boxShadow:'0 1px 4px rgba(0,0,0,0.05)' }}>
        {loading ? (
          <div style={{ padding:40, textAlign:'center', color:'#6b7280' }}>Loading…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding:48, textAlign:'center', color:'#9ca3af' }}>
            <div style={{ fontSize:32, marginBottom:8 }}>✓</div>
            <div style={{ fontSize:14, fontWeight:600 }}>No {tab} items</div>
            {tab==='pending'&&!isAdmin&&approveableModules.length===0&&(
              <div style={{ fontSize:12, marginTop:4, color:'#dc2626' }}>You have no approval permissions assigned. Contact your administrator.</div>
            )}
          </div>
        ) : (
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11.5, fontFamily:F }}>
              <thead>
                <tr style={{ background:'#f8faff', borderBottom:`2px solid ${BD}` }}>
                  <th style={{ padding:'9px 6px 9px 12px', width:34 }}>
                    <input
                      type="checkbox"
                      aria-label="Select all approvable rows"
                      disabled={selectableRows.length===0}
                      checked={allSelected}
                      ref={el=>{ if (el) el.indeterminate = someSelected; }}
                      onChange={toggleAll}
                      style={{ width:15, height:15, cursor:selectableRows.length?'pointer':'not-allowed', accentColor:P }}
                    />
                  </th>
                  {['APR ID','Module','Ref No','Party / Name','Amount','Date','Status','Action'].map((h,i)=>(
                    <th key={i} style={{ padding:'9px 12px', textAlign:'left', fontWeight:700, fontSize:10.5, color:'#374151', whiteSpace:'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((item, idx)=>{
                  const mc  = MODULE_COLOR[item.module]||{ bg:'#f3f4f6', color:'#374151' };
                  const sst = STATUS_STYLE[(item.status||'').toLowerCase()]||STATUS_STYLE.pending;
                  const pend = isPending(item);
                  const canDo = canApprove(user, item.module);
                  const selectable = pend && canDo;
                  const isSel = selected.has(keyOf(item));
                  const rowBg = isSel ? '#eef6ff' : (idx%2===0?'#fff':'#fafbff');
                  return (
                    <tr key={idx}
                      onClick={()=>setPreview(item)}
                      style={{ borderBottom:`1px solid ${BD}`, background:rowBg, cursor:'pointer', transition:'background .1s' }}
                      onMouseEnter={e=>e.currentTarget.style.background='#eef3ff'}
                      onMouseLeave={e=>e.currentTarget.style.background=rowBg}>

                      <td style={{ padding:'8px 6px 8px 12px' }} onClick={e=>e.stopPropagation()}>
                        <input
                          type="checkbox"
                          aria-label={`Select ${item.approvalId}`}
                          disabled={!selectable}
                          checked={isSel}
                          onChange={()=>toggleOne(item)}
                          style={{ width:15, height:15, cursor:selectable?'pointer':'not-allowed', accentColor:P }}
                        />
                      </td>

                      <td style={{ padding:'8px 12px' }}>
                        <span style={{ fontFamily:'monospace', fontWeight:800, fontSize:12, color:P }}>{item.approvalId}</span>
                        {item.subType&&<div style={{ fontSize:9.5, color:'#9ca3af', marginTop:1 }}>{item.subType}</div>}
                      </td>

                      <td style={{ padding:'8px 12px' }}>
                        <span style={{ background:mc.bg, color:mc.color, padding:'2px 8px', borderRadius:5, fontSize:10.5, fontWeight:700, whiteSpace:'nowrap' }}>{item.moduleLabel}</span>
                      </td>

                      <td style={{ padding:'8px 12px', maxWidth:160 }}>
                        <div style={{ fontWeight:600, color:'#111827', fontSize:12 }}>{item.refNo||'—'}</div>
                        <div style={{ fontSize:10, color:'#9ca3af', marginTop:1 }}>{fmtD(item.registeredAt)}</div>
                      </td>

                      <td style={{ padding:'8px 12px', maxWidth:180 }}>
                        <div style={{ fontWeight:500, color:'#374151', fontSize:12 }}>{item.party||'—'}</div>
                      </td>

                      <td style={{ padding:'8px 12px', fontWeight:600, fontSize:12, whiteSpace:'nowrap' }}>
                        {item.amount!=null?fmtAmt(item.amount):'—'}
                      </td>

                      <td style={{ padding:'8px 12px', fontSize:11, whiteSpace:'nowrap', color:'#374151' }}>
                        {fmtD(item.date)}
                      </td>

                      <td style={{ padding:'8px 12px' }}>
                        <span style={{ background:sst.bg, color:sst.color, border:`1px solid ${sst.border}`, padding:'2px 8px', borderRadius:5, fontSize:10.5, fontWeight:700, whiteSpace:'nowrap' }}>
                          {sst.label||item.status}
                        </span>
                        {item.approvedBy&&!pend&&<div style={{ fontSize:10, color:'#6b7280', marginTop:1 }}>{item.approvedBy}</div>}
                        {item.rejectReason&&<div style={{ fontSize:10, color:'#dc2626', marginTop:1, maxWidth:130 }}>{item.rejectReason}</div>}
                      </td>

                      <td style={{ padding:'8px 12px' }} onClick={e=>e.stopPropagation()}>
                        {pend && canDo ? (
                          <button onClick={()=>setPreview(item)}
                            style={{ padding:'4px 14px', background:'#eff6ff', border:'1px solid #bfdbfe', borderRadius:6, color:P, fontSize:11.5, fontWeight:700, cursor:'pointer', fontFamily:F }}>
                            Preview &amp; Approve
                          </button>
                        ) : pend && !canDo ? (
                          <span style={{ fontSize:11, color:'#9ca3af' }}>No rights</span>
                        ) : (
                          <button onClick={()=>setPreview(item)}
                            style={{ padding:'4px 12px', background:'#f8faff', border:`1px solid ${BD}`, borderRadius:6, color:'#6b7280', fontSize:11.5, cursor:'pointer', fontFamily:F }}>
                            View
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Bulk action bar — appears once rows are selected */}
      {selected.size > 0 && (
        <div style={{
          position:'fixed', left:'50%', bottom:22, transform:'translateX(-50%)', zIndex:9998,
          display:'flex', alignItems:'center', gap:14,
          background:'#111827', color:'#fff', padding:'10px 16px', borderRadius:10,
          boxShadow:'0 10px 34px rgba(0,0,0,0.28)', fontFamily:F,
        }}>
          <span style={{ fontSize:12.5, fontWeight:600 }}>
            {selected.size} selected
          </span>
          <button
            onClick={()=>setSelected(new Set())}
            style={{ background:'transparent', border:'none', color:'#9ca3af', fontSize:12, cursor:'pointer', fontFamily:F, textDecoration:'underline' }}>
            Clear
          </button>
          <div style={{ width:1, height:20, background:'#374151' }} />
          <button
            disabled={bulkBusy}
            onClick={()=>doBulk('approve')}
            style={{ padding:'7px 18px', background:bulkBusy?'#166534':'#16a34a', border:'none', borderRadius:7,
                     color:'#fff', fontSize:12.5, fontWeight:700, cursor:bulkBusy?'wait':'pointer', fontFamily:F }}>
            {bulkBusy ? 'Working…' : `Approve ${selected.size}`}
          </button>
          <button
            disabled={bulkBusy}
            onClick={()=>setBulkRejectOpen(true)}
            style={{ padding:'7px 16px', background:'transparent', border:'1px solid #4b5563', borderRadius:7,
                     color:'#fca5a5', fontSize:12.5, fontWeight:600, cursor:bulkBusy?'wait':'pointer', fontFamily:F }}>
            Reject
          </button>
        </div>
      )}

      {/* Bulk reject reason */}
      {bulkRejectOpen && (
        <RejectModal
          item={{ approvalId:`${selected.size} entries`, moduleLabel:'Bulk reject', party:'', refNo:'' }}
          onConfirm={reason=>{ setBulkRejectOpen(false); doBulk('reject', reason); }}
          onClose={()=>setBulkRejectOpen(false)}
        />
      )}

      {/* Preview modal */}
      {preview && (
        <PreviewModal
          item={preview} cid={cid}
          canDoApprove={canApprove(user, preview.module)}
          onClose={()=>setPreview(null)}
          onApprove={()=>doApprove(preview)}
          onReject={()=>{ setRejectFor(preview); setPreview(null); }}
        />
      )}

      {/* Reject reason modal (after preview) */}
      {rejectFor && (
        <RejectModal
          item={rejectFor}
          onConfirm={reason=>doReject(rejectFor, reason)}
          onClose={()=>setRejectFor(null)}
        />
      )}
    </div>
  );
}
