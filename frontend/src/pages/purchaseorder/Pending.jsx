import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { printPurchaseOrder } from '../../utils/printPurchaseOrder';
import { useCompany } from '../../context/CompanyContext';
import AttachmentPreviewModal from '../../components/AttachmentPreviewModal';

/* ── helpers ── */
const fmt = n => '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const getGrandTotal = (order) => {
  if (order.grandTotal) return parseFloat(order.grandTotal);
  return (order.items || []).reduce((s, it) => {
    const qty     = parseFloat(it.qty || it.quantity) || 0;
    const rate    = parseFloat(it.rate) || 0;
    const base    = qty * rate;
    const disc    = it.discountType === '%'
      ? base * (parseFloat(it.discount) || 0) / 100
      : (parseFloat(it.discount) || 0);
    const taxable = base - disc;
    return s + taxable + taxable * (parseFloat(it.gstPercent) || 0) / 100;
  }, 0);
};

/* ══════════════════════════════════════════════════
   DETAIL MODAL
══════════════════════════════════════════════════ */
const ACC = '#0070F2';

function DetailRow({ label, value, mono }) {
  if (!value && value !== 0) return null;
  return (
    <div style={{ display: 'flex', gap: 8, padding: '5px 0', borderBottom: '1px solid #F3F4F6', fontSize: 12 }}>
      <span style={{ color: '#6A6D70', minWidth: 140, flexShrink: 0 }}>{label}</span>
      <span style={{ fontWeight: 600, fontFamily: mono ? 'monospace' : 'inherit', wordBreak: 'break-all' }}>{value}</span>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: ACC, textTransform: 'uppercase', letterSpacing: '0.7px', borderBottom: `2px solid ${ACC}`, paddingBottom: 3, marginBottom: 8 }}>{title}</div>
      {children}
    </div>
  );
}

function PODetailModal({ order, onClose, onApprove, onReject, onEdit, onPrint, approving }) {
  const [previewAtt, setPreviewAtt] = useState(null);

  // close on backdrop click
  const handleBackdrop = e => { if (e.target === e.currentTarget) onClose(); };

  const items    = order.items || [];
  const attachments = order.attachments || order.documents || [];
  const total    = getGrandTotal(order);
  const attUrl = (a) => `/api/purchase-orders/${order.orderId}/download/${encodeURIComponent(a.fileName)}?companyId=${order.companyId || ''}`;

  return (
    <div onClick={handleBackdrop} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <div style={{
        background: '#fff', borderRadius: 10, width: '100%', maxWidth: 900,
        maxHeight: '92vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)', overflow: 'hidden',
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      }}>

        {/* ── Modal Header ── */}
        <div style={{ background: '#2F6FED', padding: '12px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 10, color: '#A8C4E0', letterSpacing: '0.8px', textTransform: 'uppercase' }}>Purchase Order — Pending Approval</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#fff', display: 'flex', gap: 10, alignItems: 'center', marginTop: 2 }}>
              {order.poNo || order.orderId}
              <span style={{ fontSize: 11, background: '#F59E0B', color: '#fff', borderRadius: 4, padding: '2px 8px', fontWeight: 600 }}>PENDING</span>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', width: 32, height: 32, borderRadius: '50%', cursor: 'pointer', fontSize: 18, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
        </div>

        {/* ── Scrollable Body ── */}
        <div style={{ overflowY: 'auto', padding: '18px 22px', flex: 1 }}>

          {/* Grand Total banner */}
          <div style={{ background: '#F0F9FF', border: `1px solid ${ACC}30`, borderRadius: 8, padding: '10px 16px', marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: 24 }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: ACC }}>{fmt(total)}</div>
                <div style={{ fontSize: 10, color: '#6A6D70' }}>Grand Total</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: '#2F6FED' }}>{items.length}</div>
                <div style={{ fontSize: 10, color: '#6A6D70' }}>Line Items</div>
              </div>
              {attachments.length > 0 && (
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 20, fontWeight: 700, color: '#2F6FED' }}>{attachments.length}</div>
                  <div style={{ fontSize: 10, color: '#6A6D70' }}>Attachments</div>
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 4, background: '#E8F3FF', color: ACC, fontWeight: 600 }}>{order.poType || 'Standard'}</span>
              <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 4, background: '#E8F5E9', color: '#188918', fontWeight: 600 }}>{order.paymentTerms || '—'}</span>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

            {/* ── Order Details ── */}
            <div>
              <Section title="Order Details">
                <DetailRow label="PO Number"       value={order.poNo || String(order.orderId)} mono />
                <DetailRow label="PO Date"         value={order.poDate || order.orderDate} />
                <DetailRow label="PO Type"         value={order.poType} />
                <DetailRow label="Purchase Person" value={order.purchasePerson} />
                <DetailRow label="Delivery Date"   value={order.deliveryDate} />
                <DetailRow label="Incoterms"       value={order.incoterms} />
                {order.linkedSalesOrderId && <DetailRow label="Linked SO" value={`SO #${order.linkedSalesOrderId}`} />}
                {order.vendorRef   && <DetailRow label="Vendor Ref"    value={order.vendorRef} />}
                {order.enquiryRef  && <DetailRow label="Enquiry Ref"   value={order.enquiryRef} />}
                {order.quotationRef&& <DetailRow label="Quotation Ref" value={order.quotationRef} />}
              </Section>

              <Section title="Payment">
                <DetailRow label="Payment Terms" value={order.paymentTerms} />
                <DetailRow label="Payment Mode"  value={order.paymentMode} />
                <DetailRow label="Due Date"      value={order.dueDate} />
                <DetailRow label="Credit Limit"  value={order.creditLimit ? fmt(order.creditLimit) : null} />
                <DetailRow label="Billing Terms" value={order.billingTerms} />
              </Section>

              {(order.dispatchMode || order.transporterName || order.vehicleNumber) && (
                <Section title="Dispatch">
                  <DetailRow label="Mode"        value={order.dispatchMode || order.dispatchedThrough} />
                  <DetailRow label="Transporter" value={order.transporterName} />
                  <DetailRow label="Vehicle/LR"  value={order.vehicleNumber} />
                  <DetailRow label="Instructions"value={order.deliveryInstructions} />
                </Section>
              )}
            </div>

            {/* ── Vendor Details ── */}
            <div>
              <Section title="Vendor Information">
                <DetailRow label="Vendor Name"    value={order.vendorName} />
                <DetailRow label="Vendor Code"    value={order.vendorCode} mono />
                <DetailRow label="GSTIN"          value={order.vendorGstin} mono />
                <DetailRow label="State"          value={order.vendorState} />
                <DetailRow label="Contact Person" value={order.contactPerson} />
                <DetailRow label="Mobile"         value={order.mobile} />
                <DetailRow label="Email"          value={order.email} />
              </Section>

              <Section title="Delivery Address">
                <div style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.6, padding: '4px 0' }}>
                  {order.deliveryAddr || order.deliveryAddress || '—'}
                </div>
                {order.shippingAddr && order.shippingAddr !== order.deliveryAddr && (
                  <>
                    <div style={{ fontSize: 11, color: '#6A6D70', marginTop: 6, marginBottom: 2 }}>Shipping Address</div>
                    <div style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.6 }}>{order.shippingAddr}</div>
                  </>
                )}
              </Section>

              {(order.productSpecs || order.technicalDetails || order.drawingNumber) && (
                <Section title="Specifications">
                  <DetailRow label="Drawing No." value={order.drawingNumber} mono />
                  <DetailRow label="Version"     value={order.version} />
                  {order.productSpecs     && <div style={{ fontSize: 11, color: '#32363A', marginTop: 4 }}><b>Specs:</b> {order.productSpecs}</div>}
                  {order.technicalDetails && <div style={{ fontSize: 11, color: '#32363A', marginTop: 4 }}><b>Technical:</b> {order.technicalDetails}</div>}
                </Section>
              )}
            </div>
          </div>

          {/* ── Items Table ── */}
          <Section title={`Line Items (${items.length})`}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: '#2F6FED' }}>
                    {['#','Item','HSN','Qty','Unit','Rate','Discount','GST%','Amount'].map(h => (
                      <th key={h} style={{ padding: '6px 8px', color: '#fff', fontWeight: 600, fontSize: 11, textAlign: h === '#' ? 'center' : h === 'Amount' || h === 'Rate' ? 'right' : 'left', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, i) => {
                    const qty     = parseFloat(it.qty || it.quantity) || 0;
                    const rate    = parseFloat(it.rate) || 0;
                    const base    = qty * rate;
                    const disc    = it.discountType === '%' ? base * (parseFloat(it.discount) || 0) / 100 : (parseFloat(it.discount) || 0);
                    const taxable = base - disc;
                    const gst     = taxable * (parseFloat(it.gstPercent) || 0) / 100;
                    const rowTotal = taxable + gst;
                    return (
                      <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#F9FAFB', borderBottom: '1px solid #E5E5E5' }}>
                        <td style={{ padding: '5px 8px', textAlign: 'center', color: '#6A6D70', fontWeight: 700 }}>{i + 1}</td>
                        <td style={{ padding: '5px 8px' }}>
                          <div style={{ fontWeight: 600 }}>{it.itemName || it.description || '—'}</div>
                          {it.description && it.itemName && it.description !== it.itemName && (
                            <div style={{ fontSize: 10, color: '#6A6D70' }}>{it.description}</div>
                          )}
                        </td>
                        <td style={{ padding: '5px 8px', fontFamily: 'monospace', fontSize: 11 }}>{it.hsnCode || '—'}</td>
                        <td style={{ padding: '5px 8px', textAlign: 'right', fontWeight: 600 }}>{qty}</td>
                        <td style={{ padding: '5px 8px' }}>{it.unit || 'NOS'}</td>
                        <td style={{ padding: '5px 8px', textAlign: 'right' }}>{fmt(rate)}</td>
                        <td style={{ padding: '5px 8px', textAlign: 'right', color: '#BB0000' }}>
                          {it.discount ? `${it.discount}${it.discountType || '%'}` : '—'}
                        </td>
                        <td style={{ padding: '5px 8px', textAlign: 'center' }}>{it.gstPercent || 0}%</td>
                        <td style={{ padding: '5px 8px', textAlign: 'right', fontWeight: 700, color: ACC }}>{fmt(rowTotal)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Totals summary */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
              <div style={{ background: '#F8FAFC', border: `1px solid ${ACC}20`, borderRadius: 6, padding: '10px 16px', minWidth: 220 }}>
                {[
                  { l: 'Subtotal',         v: order.subTotal },
                  { l: 'Total GST',        v: order.totalGst },
                  order.freightCharges > 0 && { l: 'Freight',  v: order.freightCharges },
                  order.packingCharges > 0 && { l: 'Packing',  v: order.packingCharges },
                  order.overallDiscount > 0&& { l: `Discount (${order.overallDiscount}%)`, v: -(parseFloat(order.subTotal) * parseFloat(order.overallDiscount) / 100) },
                  order.roundOff           && { l: 'Round Off', v: order.roundOff },
                ].filter(Boolean).map(row => (
                  <div key={row.l} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4, color: '#6A6D70' }}>
                    <span>{row.l}</span><span style={{ fontFamily: 'monospace' }}>{fmt(row.v)}</span>
                  </div>
                ))}
                <div style={{ borderTop: '2px solid #2F6FED', marginTop: 6, paddingTop: 6, display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 14, color: '#2F6FED' }}>
                  <span>Grand Total</span>
                  <span style={{ color: ACC, fontFamily: 'monospace' }}>{fmt(total)}</span>
                </div>
              </div>
            </div>
          </Section>

          {/* ── Notes ── */}
          {(order.termsConditions || order.internalNotes || order.vendorNotes || order.notes) && (
            <Section title="Notes & Terms">
              {order.termsConditions && (
                <div style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#6A6D70', marginBottom: 3 }}>TERMS & CONDITIONS</div>
                  <div style={{ fontSize: 12, background: '#F9FAFB', padding: '6px 10px', borderRadius: 4, lineHeight: 1.6 }}>{order.termsConditions}</div>
                </div>
              )}
              {order.internalNotes && (
                <div style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#6A6D70', marginBottom: 3 }}>INTERNAL NOTES</div>
                  <div style={{ fontSize: 12, background: '#FFFBEB', padding: '6px 10px', borderRadius: 4, lineHeight: 1.6 }}>{order.internalNotes}</div>
                </div>
              )}
              {order.vendorNotes && (
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#6A6D70', marginBottom: 3 }}>NOTES TO VENDOR</div>
                  <div style={{ fontSize: 12, background: '#F0F9FF', padding: '6px 10px', borderRadius: 4, lineHeight: 1.6 }}>{order.vendorNotes}</div>
                </div>
              )}
            </Section>
          )}

          {/* ── Attachments ── */}
          {attachments.length > 0 && (
            <Section title={`Attachments (${attachments.length})`}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {attachments.map((a, i) => {
                  const isImg = /\.(jpg|jpeg|png|gif|bmp|webp)$/i.test(a.fileName || '');
                  const isPdf = /\.pdf$/i.test(a.fileName || '');
                  const icon  = isImg ? '🖼️' : isPdf ? '📄' : '📎';
                  return (
                    <div key={i}
                      onClick={() => a.fileName && setPreviewAtt(a)}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: '#F0F9FF', border: `1px solid ${ACC}20`, borderRadius: 6, cursor: a.fileName ? 'pointer' : 'default', transition: 'background 0.15s' }}
                      onMouseEnter={e => { if (a.fileName) e.currentTarget.style.background = '#DBEEFF'; }}
                      onMouseLeave={e => e.currentTarget.style.background = '#F0F9FF'}
                    >
                      <span style={{ fontSize: 20 }}>{icon}</span>
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 600, color: '#1D2D3E' }}>{a.name || a.fileName}</div>
                        {a.fileName && <div style={{ fontSize: 10, color: ACC }}>Click to preview</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Section>
          )}

          {previewAtt && (
            <AttachmentPreviewModal
              attachment={previewAtt}
              downloadUrl={attUrl(previewAtt)}
              onClose={() => setPreviewAtt(null)}
            />
          )}
        </div>

        {/* ── Modal Footer / Actions ── */}
        <div style={{ borderTop: '2px solid #E5E5E5', padding: '12px 22px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0, background: '#F8FAFC' }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onEdit} style={{ background: '#F5F6F7', border: '1px solid #D9D9D9', color: '#32363A', padding: '8px 16px', borderRadius: 4, cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'inherit' }}>✏️ Edit</button>
            <button onClick={onPrint} style={{ background: '#F5F6F7', border: '1px solid #D9D9D9', color: '#32363A', padding: '8px 16px', borderRadius: 4, cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'inherit' }}>🖨️ Print</button>
            <button onClick={onReject} style={{ background: '#FFEBEB', border: '1px solid #F5B8B8', color: '#BB0000', padding: '8px 16px', borderRadius: 4, cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'inherit' }}>✕ Reject</button>
          </div>
          <button onClick={onApprove} disabled={approving} style={{
            background: approving ? '#6A6D70' : '#188918', border: 'none', color: '#fff',
            padding: '9px 28px', borderRadius: 4, cursor: approving ? 'not-allowed' : 'pointer',
            fontSize: 13, fontWeight: 700, fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 8,
          }}>
            {approving ? '⏳ Approving…' : '✓ Approve Purchase Order'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════
   MAIN PAGE
══════════════════════════════════════════════════ */
const PendingPurchaseOrders = () => {
  const [orders,    setOrders]    = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [message,   setMessage]   = useState('');
  const [search,    setSearch]    = useState('');
  const [selected,  setSelected]  = useState(null);   // order shown in modal
  const [approving, setApproving] = useState(false);
  const navigate = useNavigate();
  const { selectedCompany } = useCompany();

  useEffect(() => { fetchOrders(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchOrders = async () => {
    try {
      setLoading(true);
      const res = await axios.get('/api/purchase-orders');
      setOrders(res.data.filter(o => o.status === 'pending'));
    } catch (err) { setMessage('Error: ' + err.message); }
    finally { setLoading(false); }
  };

  const handleApprove = useCallback(async (order) => {
    const o = order || selected;
    if (!o) return;
    setApproving(true);
    try {
      const fd = new FormData();
      const textFields = [
        'poNo','poDate','poType','purchasePerson',
        'vendorName','vendorCode','vendorGstin','vendorState',
        'contactPerson','mobile','email',
        'linkedSalesOrderId','vendorRef','enquiryRef','quotationRef',
        'deliveryDate','incoterms',
        'deliveryAddr','shippingAddr','dispatchMode','transporterName',
        'vehicleNumber','deliveryInstructions',
        'paymentTerms','paymentMode','creditLimit','billingTerms','dueDate',
        'subTotal','totalGst','grandTotal','overallDiscount','freightCharges',
        'packingCharges','roundOff',
        'productSpecs','technicalDetails','drawingNumber','version',
        'termsConditions','internalNotes','vendorNotes',
        'vendorId','orderDate','deliveryAddress','vendorAddress','notes',
        'dispatchedThrough','termsOfDelivery','destination',
      ];
      textFields.forEach(k => { if (o[k] !== undefined && o[k] !== null) fd.append(k, o[k]); });
      fd.append('status',      'approved');
      fd.append('items',       JSON.stringify(o.items        || []));
      fd.append('attachments', JSON.stringify(o.attachments  || o.documents || []));
      fd.append('customFields',JSON.stringify(o.customFields || []));
      await axios.put(`/api/purchase-orders/${o.orderId}`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setMessage(`✓ PO ${o.poNo || o.orderId} approved successfully`);
      setSelected(null);
      fetchOrders();
    } catch (err) {
      setMessage('Error: ' + (err.response?.data?.error || err.message));
    } finally {
      setApproving(false);
    }
  }, [selected]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleReject = useCallback(async (order) => {
    const o = order || selected;
    if (!o) return;
    if (!window.confirm(`Reject PO ${o.poNo || o.orderId}? This will delete the record.`)) return;
    try {
      await axios.delete(`/api/purchase-orders/${o.orderId}`);
      setMessage(`PO ${o.poNo || o.orderId} rejected`);
      setSelected(null);
      fetchOrders();
    } catch (err) { setMessage('Error: ' + (err.response?.data?.error || err.message)); }
  }, [selected]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = orders.filter(o => {
    const q = search.toLowerCase();
    return String(o.orderId).includes(q) ||
      String(o.poNo || '').toLowerCase().includes(q) ||
      (o.vendorName || '').toLowerCase().includes(q) ||
      String(o.linkedSalesOrderId || '').includes(q);
  });

  if (loading) return <div className="loading">Loading pending purchase orders…</div>;

  return (
    <div className="client-list-page">
      {/* Modal */}
      {selected && (
        <PODetailModal
          order={selected}
          approving={approving}
          onClose={() => setSelected(null)}
          onApprove={() => handleApprove(selected)}
          onReject={() => handleReject(selected)}
          onEdit={() => { setSelected(null); navigate(`/purchase-order/edit/${selected.orderId}`); }}
          onPrint={() => printPurchaseOrder(selected, selectedCompany)}
        />
      )}

      {/* Page header */}
      <div className="client-list-header">
        <h2 className="form-title" style={{ margin: 0 }}>
          Pending Approval — Purchase Orders
          <span className="count-badge">{orders.length}</span>
        </h2>
        <div className="client-list-actions">
          <div className="search-box">
            <span className="search-icon">🔍</span>
            <input type="text" placeholder="Search by PO no, vendor…" value={search}
              onChange={e => setSearch(e.target.value)} className="search-input" />
            {search && <button className="search-clear" onClick={() => setSearch('')}>✕</button>}
          </div>
        </div>
      </div>

      {message && (
        <div className={message.includes('Error') ? 'error-message' : 'success-message'}
          style={{ margin: '0 0 12px' }}>{message}</div>
      )}

      {filtered.length === 0 ? (
        <div className="loading">{search ? 'No orders match.' : 'No pending purchase orders.'}</div>
      ) : (
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>PO No.</th>
                <th>PO Type</th>
                <th>Vendor</th>
                <th>GSTIN</th>
                <th>Linked SO</th>
                <th>PO Date</th>
                <th>Delivery Date</th>
                <th>Items</th>
                <th>Grand Total</th>
                <th>Purchase Person</th>
                <th>Submitted</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(order => (
                <tr key={order.orderId}
                  onClick={() => setSelected(order)}
                  style={{ cursor: 'pointer' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#EEF6FF'}
                  onMouseLeave={e => e.currentTarget.style.background = ''}
                >
                  <td>
                    <strong style={{ color: ACC }}>{order.poNo || order.orderId}</strong>
                    {order.poNo && order.poNo !== String(order.orderId) && (
                      <div style={{ fontSize: 10, color: '#6A6D70' }}>ID: {order.orderId}</div>
                    )}
                  </td>
                  <td>
                    <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 4, background: '#E8F3FF', color: ACC, fontWeight: 600 }}>
                      {order.poType || 'Standard'}
                    </span>
                  </td>
                  <td>
                    <div style={{ fontWeight: 600 }}>{order.vendorName || '—'}</div>
                    {order.vendorCode && <div style={{ fontSize: 10, color: '#6A6D70' }}>{order.vendorCode}</div>}
                  </td>
                  <td style={{ fontFamily: 'monospace', fontSize: 11 }}>{order.vendorGstin || '—'}</td>
                  <td>
                    {order.linkedSalesOrderId
                      ? <span className="po-so-ref-badge">SO #{order.linkedSalesOrderId}</span>
                      : <span style={{ color: '#aaa' }}>—</span>}
                  </td>
                  <td>{order.poDate || order.orderDate || '—'}</td>
                  <td>{order.deliveryDate || '—'}</td>
                  <td style={{ textAlign: 'center' }}>{(order.items || []).length}</td>
                  <td><strong style={{ color: ACC }}>{fmt(getGrandTotal(order))}</strong></td>
                  <td style={{ fontSize: 12 }}>{order.purchasePerson || '—'}</td>
                  <td style={{ fontSize: 11 }}>
                    {order.updatedAt ? new Date(order.updatedAt).toLocaleDateString('en-IN') : '—'}
                  </td>
                  <td onClick={e => e.stopPropagation()}>
                    <div className="action-buttons">
                      <button className="approve-btn" onClick={() => handleApprove(order)}>✓ Approve</button>
                      <button className="edit-btn"    onClick={() => navigate(`/purchase-order/edit/${order.orderId}`)}>✏️ Edit</button>
                      <button className="print-btn"   onClick={() => printPurchaseOrder(order, selectedCompany)}>🖨️ Print</button>
                      <button className="delete-btn"  style={{ fontSize: 11, padding: '3px 8px' }} onClick={() => handleReject(order)}>✕ Reject</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="table-footer">
            Click any row to view full details · Showing {filtered.length} of {orders.length} pending
          </div>
        </div>
      )}
    </div>
  );
};

export default PendingPurchaseOrders;
