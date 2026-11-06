import { useState, useEffect } from 'react';
import axios from 'axios';
import AttachmentPreviewModal from './AttachmentPreviewModal';

const P   = '#133d80';
const PD  = '#1A56D6';
const BD  = '#E5EAF2';
const F   = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

/* ── Status badge ── */
const STATUS_MAP = {
  approved: { bg:'#ECFDF5', color:'#059669', dot:'#059669', label:'Approved' },
  pending:  { bg:'#FFFBEB', color:'#D97706', dot:'#D97706', label:'Pending'  },
  draft:    { bg:'#EFF6FF', color:'#2563EB', dot:'#93C5FD', label:'Draft'    },
};
export const StatusBadge = ({ status }) => {
  const s = STATUS_MAP[status] || STATUS_MAP.draft;
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'3px 10px',
      borderRadius:20, fontSize:11, fontWeight:700, background:s.bg, color:s.color,
      border:`1px solid ${s.dot}50`, fontFamily:F }}>
      <span style={{ width:6, height:6, borderRadius:'50%', background:s.dot, flexShrink:0 }} />
      {s.label}
    </span>
  );
};

/* ── Full-detail popup modal — click a PO to see this first, with Edit /
   Print / Delete actions in the footer, instead of jumping straight into
   the edit form. Shared across every PO list surface (View.jsx, PO
   Tracking, Jobcodes, etc.) so "click a PO" behaves the same everywhere. ── */
export default function POViewModal({ order, onClose, onEdit, onPrint, onDelete, selectedCompany }) {
  const [previewAtt,  setPreviewAtt]  = useState(null);
  const [linkedClient, setLinkedClient] = useState('');

  useEffect(() => {
    if (!order?.linkedSalesOrderId) { setLinkedClient(''); return; }
    const cid = order.companyId || selectedCompany?.companyId || '';
    axios.get(`/api/sales-orders/${order.linkedSalesOrderId}?companyId=${cid}`)
      .then(r => setLinkedClient(r.data?.customerName || r.data?.clientName || ''))
      .catch(() => setLinkedClient(''));
  }, [order?.linkedSalesOrderId]); // eslint-disable-line
  const items   = order.items || [];
  const allDocs = order.attachments || order.documents || [];
  const attUrl  = (a) => `/api/purchase-orders/${order.orderId}/download/${encodeURIComponent(a.fileName)}?companyId=${order.companyId || ''}`;

  const getGrandTotal = () => {
    if (order.grandTotal) return parseFloat(order.grandTotal);
    return items.reduce((s, it) => {
      const qty  = parseFloat(it.qty || it.quantity) || 0;
      const rate = parseFloat(it.rate) || 0;
      const base = qty * rate;
      const disc = it.discountType === '%' ? base * (parseFloat(it.discount) || 0) / 100 : (parseFloat(it.discount) || 0);
      const taxable = base - disc;
      return s + taxable + taxable * (parseFloat(it.gstPercent) || 0) / 100;
    }, 0);
  };

  const gt     = getGrandTotal();
  const fmt    = n => '₹' + Number(n || 0).toFixed(2);
  const fmtD   = d => d ? new Date(d).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' }) : '—';
  const rawDate = order.poDate || order.orderDate || order.date;
  const status  = order.status || 'draft';

  const Section = ({ title, children }) => (
    <div style={{ marginBottom:18 }}>
      <div style={{ fontSize:10.5, fontWeight:800, color:'#fff', background:P,
        padding:'5px 12px', borderRadius:5, marginBottom:10, letterSpacing:'0.8px',
        textTransform:'uppercase', fontFamily:F }}>
        {title}
      </div>
      <div style={{ padding:'0 4px' }}>{children}</div>
    </div>
  );

  const Row = ({ label, value }) => value ? (
    <div style={{ display:'flex', gap:8, marginBottom:6, fontSize:13, fontFamily:F }}>
      <span style={{ color:'#6B7280', minWidth:148, fontSize:12, fontWeight:500 }}>{label}</span>
      <span style={{ fontWeight:600, color:'#111827', flex:1 }}>{value}</span>
    </div>
  ) : null;

  return (
    <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)',
      zIndex:9000, display:'flex', alignItems:'center', justifyContent:'center', padding:16,
      backdropFilter:'blur(2px)' }}>
      <div onClick={e => e.stopPropagation()} style={{ background:'#fff', borderRadius:12, width:'100%',
        maxWidth:900, maxHeight:'92vh', display:'flex', flexDirection:'column',
        boxShadow:'0 20px 60px rgba(0,0,0,0.25)', fontFamily:F }}>

        {/* Header */}
        <div style={{ background:`linear-gradient(135deg,${P} 0%,${PD} 100%)`, color:'#fff',
          padding:'16px 22px', borderRadius:'12px 12px 0 0',
          display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div>
            <div style={{ fontSize:17, fontWeight:800, letterSpacing:'-0.3px' }}>
              Purchase Order — {order.poNo || order.orderId}
            </div>
            <div style={{ fontSize:12, opacity:0.7, marginTop:3 }}>
              {order.vendorName || 'No Vendor'} · {fmtD(rawDate)}
              {linkedClient && <span style={{ marginLeft:10, background:'rgba(255,255,255,0.18)', borderRadius:4, padding:'1px 8px', fontWeight:700 }}>👤 {linkedClient}</span>}
            </div>
          </div>
          <button onClick={onClose}
            style={{ background:'rgba(255,255,255,0.15)', border:'1px solid rgba(255,255,255,0.2)',
              borderRadius:8, color:'#fff', width:34, height:34, cursor:'pointer', fontSize:18,
              display:'flex', alignItems:'center', justifyContent:'center' }}>✕</button>
        </div>

        {/* Grand total banner */}
        <div style={{ background:'#F8FAFF', borderBottom:`1px solid ${BD}`, padding:'12px 22px',
          display:'flex', gap:24, alignItems:'center' }}>
          <div style={{ fontSize:24, fontWeight:800, color:P }}>{fmt(gt)}</div>
          <div style={{ width:1, height:28, background:BD }} />
          <div style={{ fontSize:12, color:'#6B7280', fontWeight:500 }}>
            {items.length} item{items.length !== 1 ? 's' : ''}
          </div>
          {allDocs.length > 0 && (
            <div style={{ fontSize:12, color:'#6B7280', fontWeight:500 }}>
              📎 {allDocs.length} attachment{allDocs.length !== 1 ? 's' : ''}
            </div>
          )}
          <div style={{ marginLeft:'auto' }}><StatusBadge status={status} /></div>
        </div>

        {/* Body */}
        <div style={{ flex:1, overflowY:'auto', padding:'20px 22px' }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20, marginBottom:18 }}>
            <div>
              <Section title="Order Details">
                <Row label="PO Number"       value={order.poNo || order.orderId} />
                <Row label="PO Type"         value={order.poType || 'Standard'} />
                <Row label="PO Date"         value={fmtD(rawDate)} />
                <Row label="Linked SO"       value={order.linkedSalesOrderId ? `SO #${order.linkedSalesOrderId}` : null} />
                {linkedClient && (
                  <div style={{ display:'flex', gap:8, marginBottom:6, fontSize:13, fontFamily:F }}>
                    <span style={{ color:'#6B7280', minWidth:148, fontSize:12, fontWeight:500 }}>Client Name</span>
                    <span style={{ fontWeight:700, color:P, flex:1 }}>👤 {linkedClient}</span>
                  </div>
                )}
                <Row label="Purchase Person" value={order.purchasePerson} />
                <Row label="Enquiry Ref"     value={order.enquiryRef} />
              </Section>
            </div>
            <div>
              <Section title="Vendor Information">
                <Row label="Vendor Name"  value={order.vendorName} />
                <Row label="Vendor Code"  value={order.vendorCode} />
                <Row label="GSTIN"        value={order.vendorGstin} />
                <Row label="State"        value={order.vendorState} />
                <Row label="Contact"      value={order.contactPerson} />
                <Row label="Mobile"       value={order.mobile} />
              </Section>
            </div>
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20, marginBottom:18 }}>
            <div>
              <Section title="Delivery">
                <Row label="Delivery Date"    value={fmtD(order.deliveryDate)} />
                <Row label="Delivery Address" value={order.deliveryAddr || order.deliveryAddress} />
                <Row label="Dispatch Mode"    value={order.dispatchMode} />
                <Row label="Incoterms"        value={order.incoterms} />
              </Section>
            </div>
            <div>
              <Section title="Payment">
                <Row label="Payment Terms" value={order.paymentTerms} />
                <Row label="Advance %"     value={order.advancePercent ? order.advancePercent + '%' : null} />
                <Row label="Vendor Ref"    value={order.vendorRef} />
                <Row label="Quotation Ref" value={order.quotationRef} />
              </Section>
            </div>
          </div>

          {/* Items table */}
          <Section title="Line Items">
            <div style={{ overflowX:'auto', border:`1px solid ${BD}`, borderRadius:8 }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12, fontFamily:F }}>
                <thead>
                  <tr style={{ background:P }}>
                    {['#','Item','HSN','Qty','Unit','Rate','Disc','GST%','Amount'].map(h => (
                      <th key={h} style={{ padding:'7px 10px',
                        textAlign: ['#','Qty','Rate','Disc','GST%','Amount'].includes(h) ? 'center' : 'left',
                        border:`1px solid ${PD}`, fontWeight:700, color:'#fff', fontSize:11 }}>
                        {h}
                      </th>
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
                    const amt     = taxable + gst;
                    return (
                      <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#FAFBFC' }}>
                        <td style={{ padding:'6px 10px', textAlign:'center', border:`1px solid ${BD}`, color:'#6B7280' }}>{i+1}</td>
                        <td style={{ padding:'6px 10px', border:`1px solid ${BD}` }}>
                          <div style={{ fontWeight:600, color:'#111827' }}>{it.itemName || it.description || '—'}</div>
                          {it.description && it.itemName && it.description !== it.itemName && (
                            <div style={{ fontSize:10, color:'#9CA3AF' }}>{it.description}</div>
                          )}
                        </td>
                        <td style={{ padding:'6px 10px', border:`1px solid ${BD}`, fontSize:11, color:'#6B7280' }}>{it.hsnCode || '—'}</td>
                        <td style={{ padding:'6px 10px', border:`1px solid ${BD}`, textAlign:'right', fontWeight:600 }}>{qty}</td>
                        <td style={{ padding:'6px 10px', border:`1px solid ${BD}`, textAlign:'center', color:'#6B7280' }}>{it.unit || 'NOS'}</td>
                        <td style={{ padding:'6px 10px', border:`1px solid ${BD}`, textAlign:'right' }}>{fmt(rate)}</td>
                        <td style={{ padding:'6px 10px', border:`1px solid ${BD}`, textAlign:'right', color:'#6B7280' }}>{it.discount ? it.discount + (it.discountType || '%') : '—'}</td>
                        <td style={{ padding:'6px 10px', border:`1px solid ${BD}`, textAlign:'center', color:'#6B7280' }}>{it.gstPercent || 0}%</td>
                        <td style={{ padding:'6px 10px', border:`1px solid ${BD}`, textAlign:'right', fontWeight:700, color:P }}>{fmt(amt)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div style={{ display:'flex', justifyContent:'flex-end', marginTop:10 }}>
              <div style={{ background:P, color:'#fff', borderRadius:8, padding:'8px 18px',
                fontSize:15, fontWeight:800 }}>
                Grand Total: {fmt(gt)}
              </div>
            </div>
          </Section>

          {(order.notes || order.termsConditions) && (
            <Section title="Notes & Terms">
              {order.notes && <div style={{ fontSize:13, marginBottom:6, color:'#374151' }}><b>Notes:</b> {order.notes}</div>}
              {order.termsConditions && <div style={{ fontSize:13, color:'#374151' }}><b>Terms:</b> {order.termsConditions}</div>}
            </Section>
          )}

          {allDocs.length > 0 && (
            <Section title="Attachments">
              <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
                {allDocs.map((a, i) => {
                  const isImg = /\.(jpg|jpeg|png|gif|bmp|webp)$/i.test(a.fileName || '');
                  const isPdf = /\.pdf$/i.test(a.fileName || '');
                  const icon  = isImg ? '🖼️' : isPdf ? '📄' : '📎';
                  return (
                    <div key={i} onClick={() => a.fileName && setPreviewAtt(a)}
                      style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 12px',
                        background:'#F0F4FF', border:`1px solid ${P}30`, borderRadius:8,
                        cursor: a.fileName ? 'pointer' : 'default', transition:'background 0.15s' }}
                      onMouseEnter={e => { if (a.fileName) e.currentTarget.style.background='#DBEEFF'; }}
                      onMouseLeave={e => e.currentTarget.style.background='#F0F4FF'}>
                      <span style={{ fontSize:20 }}>{icon}</span>
                      <div>
                        <div style={{ fontSize:12, fontWeight:600, color:'#111827' }}>{a.name || a.fileName || `File ${i+1}`}</div>
                        {a.fileName && <div style={{ fontSize:10, color:P, fontWeight:500 }}>Click to preview</div>}
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

        {/* Footer actions */}
        <div style={{ padding:'12px 22px', borderTop:`1px solid ${BD}`, display:'flex', gap:8,
          justifyContent:'flex-end', background:'#FAFBFC', borderRadius:'0 0 12px 12px' }}>
          <button onClick={onClose}
            style={{ padding:'8px 20px', border:`1px solid ${BD}`, borderRadius:7, background:'#fff',
              cursor:'pointer', fontSize:13, fontFamily:F, fontWeight:600, color:'#374151' }}>
            ✕ Close
          </button>
          {onDelete && (
            <button onClick={onDelete}
              style={{ padding:'8px 20px', border:'1px solid #FECACA', borderRadius:7, background:'#FEF2F2',
                cursor:'pointer', fontSize:13, fontFamily:F, fontWeight:600, color:'#DC2626' }}>
              🗑️ Delete
            </button>
          )}
          {onPrint && (
            <button onClick={onPrint}
              style={{ padding:'8px 20px', border:`1px solid ${P}40`, borderRadius:7, background:'#F0F4FF',
                color:P, cursor:'pointer', fontSize:13, fontFamily:F, fontWeight:700 }}>
              🖨️ Print
            </button>
          )}
          {onEdit && (
            <button onClick={onEdit}
              style={{ padding:'8px 20px', border:'none', borderRadius:7, background:P, color:'#fff',
                cursor:'pointer', fontSize:13, fontFamily:F, fontWeight:700,
                boxShadow:`0 2px 6px ${P}50` }}>
              ✏️ Edit
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
