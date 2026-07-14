/**
 * Delivery Challan Module — Create | View | Pending Invoice
 */
import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useLocation, useNavigate } from 'react-router-dom';
import { useCompany } from '../../context/CompanyContext';
import { printDeliveryChallan } from '../../utils/printDeliveryChallan';

const F = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const N = '#104f4f';
const W = '#ffffff';

const fmtN = n => `₹${(parseFloat(n)||0).toFixed(2)}`;
const fmtD = d => {
  if (!d) return '—';
  const dt = new Date(d); if (isNaN(dt)) return d;
  return `${String(dt.getDate()).padStart(2,'0')}-${String(dt.getMonth()+1).padStart(2,'0')}-${dt.getFullYear()}`;
};
const today = () => new Date().toISOString().slice(0, 10);

function Btn({ children, onClick, v='def', disabled, small }) {
  const s = {
    def: { bg:'#d8d8d8', border:'1px solid #888', color:'#000' },
    pri: { bg:N, border:`1px solid #1a3050`, color:W, fw:700 },
    dan: { bg:'#DC2626', border:`1px solid #991100`, color:W, fw:700 },
    suc: { bg:'#006620', border:`1px solid #004410`, color:W, fw:700 },
    war: { bg:'#b06000', border:`1px solid #7a4000`, color:W, fw:700 },
  }[v] || {};
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      style={{ background:s.bg, border:s.border, color:s.color||'#000',
        padding:small?'0 7px':'1px 12px', height:small?20:26,
        fontSize:small?10:11, fontFamily:F, fontWeight:s.fw||400,
        cursor:disabled?'default':'pointer', borderRadius:4,
        whiteSpace:'nowrap', opacity:disabled?0.5:1 }}>
      {children}
    </button>
  );
}

function Inp({ value, onChange, type='text', placeholder, readOnly, disabled, style }) {
  return (
    <input type={type} value={value??''} onChange={onChange}
      placeholder={placeholder} readOnly={readOnly} disabled={disabled}
      style={{ height:28, padding:'0 8px', border:'1px solid #9CA3AF', borderRadius:4,
        fontSize:12, fontFamily:F, color:'#111827',
        background:readOnly?'#F9FAFB':disabled?'#F3F4F6':W,
        outline:'none', width:'100%', boxSizing:'border-box', ...style }}
      onFocus={e=>{ if(!readOnly&&!disabled){e.target.style.borderColor=N;} }}
      onBlur={e=>{ e.target.style.borderColor='#9CA3AF'; }}
    />
  );
}

function FR({ label, children, w=120 }) {
  return (
    <div style={{ display:'flex', alignItems:'center', minHeight:28, borderBottom:'1px solid #E2E8F0', padding:'2px 6px', background:'#fff' }}>
      <label style={{ fontSize:11, fontWeight:700, color:'#374151', minWidth:w, maxWidth:w, flexShrink:0, paddingRight:6 }}>{label}</label>
      <div style={{ flex:1 }}>{children}</div>
    </div>
  );
}

const STATUS = {
  issued:   { bg:'#EFF6FF', color:'#104f4f', border:'#BFDBFE', label:'Issued — Pending Invoice' },
  invoiced: { bg:'#ECFDF5', color:'#065F46', border:'#6EE7B7', label:'Invoiced' },
};

function StatusBadge({ status }) {
  const s = STATUS[status] || STATUS.issued;
  return (
    <span style={{ fontSize:10, fontWeight:700, padding:'1px 8px', borderRadius:10, border:`1px solid ${s.border}`, background:s.bg, color:s.color, whiteSpace:'nowrap' }}>
      {s.label}
    </span>
  );
}

/* ─── Populate DC fields from a Sales Order ─── */
function soToDC(so, extra = {}) {
  return {
    linkedSalesOrderId: so.orderId,
    // client
    clientId:       so.clientCode || so.customerId || '',
    clientName:     so.customerName || so.clientName || '',
    clientGstin:    so.customerGstin || so.partyGstin || '',
    businessType:   so.businessType || '',
    industriesType: so.industriesType || '',
    category:       so.category || '',
    tdsApplicable:  so.tdsApplicable || '',
    panNo:          so.panNo || '',
    cinNo:          so.cinNo || '',
    msme:           so.msme || '',
    gstType:        so.gstType || '',
    gstRegistered:  so.gstRegistered || '',
    // order info
    erpNo:          so.erpNo || String(so.orderId || ''),
    orderNo:        so.orderNo || '',
    orderDate:      so.orderDate || '',
    orderType:      so.orderType || '',
    clientPoDate:   so.clientPoDate || so.poDate || '',
    clientOrderNo:  so.clientOrderNo || so.customerPO || '',
    deliveryDueDate:so.deliveryDate || so.deliveryDueDate || '',
    paymentTerms:   so.paymentTerms || '',
    // billing contact
    billingName:    so.contactPerson || so.billingName || '',
    billingMobile:  so.mobile || so.billingMobile || '',
    billingAlternate:so.alternateMobile || so.billingAlternate || '',
    billingEmail:   so.email || so.billingEmail || '',
    // shipping contact
    shippingName:   so.shipToName || so.shippingName || so.contactPerson || '',
    shippingMobile: so.shipToMobile || so.shippingMobile || so.mobile || '',
    shippingAlternate:'',
    shippingEmail:  so.shipToEmail || so.shippingEmail || '',
    // billing address
    billingAddress: so.billingAddress || so.address || '',
    billingCity:    so.billingCity || so.city || '',
    billingState:   so.billingState || so.customerState || '',
    billingPincode: so.billingPincode || so.pincode || '',
    // shipping address
    shippingAddress:so.shippingAddress || so.shipToAddress || so.deliveryAddress || '',
    shippingCity:   so.shippingCity || so.shipToCity || '',
    shippingState:  so.shippingState || so.shipToState || so.customerState || '',
    shippingPincode:so.shippingPincode || so.shipToPincode || '',
    // items
    items:  (so.items || []).map(it => ({ ...it })),
    addons: (so.addons || []).map(a => ({ ...a })),
    charges:(so.charges || []).map(c => ({ ...c })),
    subTotal:   so.subTotal || 0,
    totalGST:   so.totalGST || 0,
    grandTotal: so.grandTotal || 0,
    ...extra,
  };
}

/* ═══════════════════════ CREATE FORM ═══════════════════════ */
function CreateForm({ salesOrders, onSaved }) {
  const { selectedCompany } = useCompany();
  const cid = selectedCompany?.companyId;

  const [selSO, setSelSO]       = useState('');
  const [soData, setSoData]     = useState(null);
  const [dc, setDC]             = useState({
    dcDate: today(), dispatchThrough: '', vehicleNo: '', invoiceNo: '', invoiceDate: '',
  });
  const [saving, setSaving]     = useState(false);
  const [msg, setMsg]           = useState('');

  const set = (k, v) => setDC(p => ({ ...p, [k]: v }));

  const loadSO = useCallback(async (orderId) => {
    if (!orderId) { setSoData(null); return; }
    try {
      const r = await axios.get(`/api/sales-orders/${orderId}?companyId=${cid}`);
      setSoData(r.data);
    } catch {
      const list = salesOrders.find(o => String(o.orderId) === String(orderId));
      setSoData(list || null);
    }
  }, [cid, salesOrders]);

  useEffect(() => { loadSO(selSO); }, [selSO, loadSO]);

  const handleSave = async () => {
    if (!selSO) { setMsg('Please select a Sales Order'); return; }
    setSaving(true); setMsg('');
    try {
      const payload = { companyId: cid, dcDate: dc.dcDate, dispatchThrough: dc.dispatchThrough,
        vehicleNo: dc.vehicleNo, invoiceNo: dc.invoiceNo, invoiceDate: dc.invoiceDate,
        ...(soData ? soToDC(soData) : {}),
      };
      const r = await axios.post('/api/delivery-challans', payload);
      setMsg(`DC created: ${r.data.dcNo}`);
      setTimeout(() => { onSaved(r.data); }, 1000);
    } catch (e) { setMsg('Error: ' + (e.response?.data?.error || e.message)); }
    setSaving(false);
  };

  const SHdr = ({ children }) => (
    <div style={{ background:'#104f4f', color:W, fontSize:11, fontWeight:700, padding:'4px 10px', marginBottom:1, marginTop:8 }}>{children}</div>
  );

  return (
    <div style={{ fontFamily:F, fontSize:12 }}>
      {msg && (
        <div style={{ margin:'0 0 10px', padding:'8px 12px', borderRadius:6,
          background:msg.startsWith('Error')?'#FEF2F2':'#ECFDF5',
          color:msg.startsWith('Error')?'#DC2626':'#059669',
          border:`1px solid ${msg.startsWith('Error')?'#FECACA':'#A7F3D0'}` }}>{msg}</div>
      )}

      {/* Select SO */}
      <SHdr>Select Sales Order</SHdr>
      <div style={{ border:'1px solid #CBD5E1', marginBottom:4 }}>
        <FR label="Sales Order">
          <select value={selSO} onChange={e => setSelSO(e.target.value)}
            style={{ height:28, padding:'0 8px', border:'1px solid #9CA3AF', borderRadius:4, fontSize:12, fontFamily:F, width:'100%', outline:'none' }}>
            <option value="">— Select Sales Order —</option>
            {salesOrders.map(o => (
              <option key={o.orderId} value={o.orderId}>
                {o.orderNo || `SO-${o.orderId}`} · {o.customerName || o.clientName || '—'}
              </option>
            ))}
          </select>
        </FR>
      </div>

      {/* Dispatch details */}
      <SHdr>Dispatch Details</SHdr>
      <div style={{ border:'1px solid #CBD5E1', marginBottom:4 }}>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr' }}>
          <FR label="DC Date"><Inp type="date" value={dc.dcDate} onChange={e=>set('dcDate',e.target.value)} /></FR>
          <FR label="Invoice No"><Inp value={dc.invoiceNo} onChange={e=>set('invoiceNo',e.target.value)} placeholder="If already issued" /></FR>
          <FR label="Dispatch Through"><Inp value={dc.dispatchThrough} onChange={e=>set('dispatchThrough',e.target.value)} placeholder="Transport company name" /></FR>
          <FR label="Invoice Date"><Inp type="date" value={dc.invoiceDate} onChange={e=>set('invoiceDate',e.target.value)} /></FR>
          <FR label="Vehicle No / T-ID"><Inp value={dc.vehicleNo} onChange={e=>set('vehicleNo',e.target.value)} placeholder="Vehicle number or tracking ID" /></FR>
        </div>
      </div>

      {/* Preview from SO */}
      {soData && (
        <>
          <SHdr>Client Details (from SO — auto-filled)</SHdr>
          <div style={{ border:'1px solid #CBD5E1', marginBottom:4 }}>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr' }}>
              <FR label="Client Name"><Inp value={soData.customerName||soData.clientName||''} readOnly /></FR>
              <FR label="GSTIN"><Inp value={soData.customerGstin||soData.partyGstin||''} readOnly /></FR>
              <FR label="Order No"><Inp value={soData.orderNo||''} readOnly /></FR>
              <FR label="Order Date"><Inp value={soData.orderDate||''} readOnly /></FR>
              <FR label="Delivery Date"><Inp value={soData.deliveryDate||soData.deliveryDueDate||''} readOnly /></FR>
              <FR label="Payment Terms"><Inp value={soData.paymentTerms||''} readOnly /></FR>
            </div>
          </div>

          <SHdr>Items ({(soData.items||[]).length} items)</SHdr>
          <div style={{ border:'1px solid #CBD5E1', marginBottom:4, overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
              <thead>
                <tr style={{ background:'#104f4f', color:W }}>
                  {['#','Item Name','HSN','Qty','Unit','Rate','Taxable'].map(h => (
                    <th key={h} style={{ padding:'4px 8px', fontWeight:700, fontSize:10, textAlign:'left', whiteSpace:'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(soData.items||[]).map((it, i) => {
                  const taxable = (+it.qty||0)*(+it.rate||0);
                  return (
                    <tr key={i} style={{ background:i%2===0?'#fff':'#F8FAFC' }}>
                      <td style={{ padding:'3px 8px', borderBottom:'1px solid #E2E8F0', color:'#9CA3AF' }}>{i+1}</td>
                      <td style={{ padding:'3px 8px', borderBottom:'1px solid #E2E8F0', fontWeight:600 }}>{it.itemName||it.description}</td>
                      <td style={{ padding:'3px 8px', borderBottom:'1px solid #E2E8F0', fontFamily:'monospace' }}>{it.hsnCode||'—'}</td>
                      <td style={{ padding:'3px 8px', borderBottom:'1px solid #E2E8F0', textAlign:'right' }}>{it.qty}</td>
                      <td style={{ padding:'3px 8px', borderBottom:'1px solid #E2E8F0' }}>{it.unit||'NOS'}</td>
                      <td style={{ padding:'3px 8px', borderBottom:'1px solid #E2E8F0', textAlign:'right' }}>{fmtN(it.rate)}</td>
                      <td style={{ padding:'3px 8px', borderBottom:'1px solid #E2E8F0', textAlign:'right', fontWeight:600 }}>{fmtN(taxable)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div style={{ display:'flex', justifyContent:'flex-end', gap:16, padding:'6px 10px', background:'#F8FAFC', border:'1px solid #CBD5E1', marginBottom:4 }}>
            <span>Sub Total: <strong>{fmtN(soData.subTotal)}</strong></span>
            <span>GST: <strong>{fmtN(soData.totalGST)}</strong></span>
            <span style={{ color:N }}>Grand Total: <strong>{fmtN(soData.grandTotal)}</strong></span>
          </div>
        </>
      )}

      <div style={{ display:'flex', gap:8, justifyContent:'flex-end', marginTop:12 }}>
        <Btn v="pri" onClick={handleSave} disabled={saving || !selSO}>
          {saving ? 'Creating DC…' : '🚚 Issue Delivery Challan'}
        </Btn>
      </div>
    </div>
  );
}

/* ═══════════════════════ DC LIST ═══════════════════════ */
function DCList({ dcs, onPrint, onDelete, onEdit, emptyMsg }) {
  const [search, setSearch] = useState('');
  const filtered = dcs.filter(d =>
    !search ||
    (d.dcNo||'').toLowerCase().includes(search.toLowerCase()) ||
    (d.clientName||'').toLowerCase().includes(search.toLowerCase()) ||
    (d.orderNo||'').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <div style={{ padding:'8px 0 10px', display:'flex', gap:8 }}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search DC No, client, SO…"
          style={{ width:280, height:28, padding:'0 10px', border:'1px solid #D1D5DB', borderRadius:4, fontSize:12, fontFamily:F, outline:'none' }} />
        <span style={{ fontSize:12, color:'#6B7280', alignSelf:'center' }}>{filtered.length} records</span>
      </div>
      {filtered.length === 0 ? (
        <div style={{ textAlign:'center', padding:'40px 20px', color:'#9CA3AF', fontSize:14 }}>{emptyMsg}</div>
      ) : (
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12, fontFamily:F }}>
          <thead>
            <tr style={{ background:'#104f4f', color:W }}>
              {['DC No','Date','Sales Order','Client','Amount','Status','Linked Invoice','Actions'].map(h => (
                <th key={h} style={{ padding:'7px 10px', fontWeight:700, fontSize:11, textAlign:'left', whiteSpace:'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((d, i) => (
              <tr key={d.dcId} style={{ background:i%2===0?'#fff':'#F8FAFC' }}>
                <td style={{ padding:'6px 10px', borderBottom:'1px solid #E2E8F0', fontWeight:700, color:N }}>{d.dcNo}</td>
                <td style={{ padding:'6px 10px', borderBottom:'1px solid #E2E8F0', whiteSpace:'nowrap' }}>{fmtD(d.dcDate)}</td>
                <td style={{ padding:'6px 10px', borderBottom:'1px solid #E2E8F0', color:'#555' }}>{d.orderNo||'—'}</td>
                <td style={{ padding:'6px 10px', borderBottom:'1px solid #E2E8F0', fontWeight:600 }}>{d.clientName||'—'}</td>
                <td style={{ padding:'6px 10px', borderBottom:'1px solid #E2E8F0', textAlign:'right', fontWeight:600 }}>{fmtN(d.grandTotal)}</td>
                <td style={{ padding:'6px 10px', borderBottom:'1px solid #E2E8F0' }}><StatusBadge status={d.status} /></td>
                <td style={{ padding:'6px 10px', borderBottom:'1px solid #E2E8F0', color:'#059669', fontSize:11 }}>{d.linkedInvoiceNo||'—'}</td>
                <td style={{ padding:'6px 10px', borderBottom:'1px solid #E2E8F0' }}>
                  <div style={{ display:'flex', gap:4 }}>
                    <Btn small v="pri" onClick={() => onPrint(d)}>🖨 Print</Btn>
                    {d.status !== 'invoiced' && <Btn small onClick={() => onEdit(d)}>✏ï¸ Edit</Btn>}
                    <Btn small v="dan" onClick={() => onDelete(d)}>🗑</Btn>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/* ═══════════════════════ EDIT MODAL ═══════════════════════ */
function EditDCModal({ dc, cid, onSaved, onClose }) {
  const [form, setForm] = useState({
    dcDate:         dc.dcDate || '',
    dispatchThrough:dc.dispatchThrough || '',
    vehicleNo:      dc.vehicleNo || '',
    invoiceNo:      dc.invoiceNo || '',
    invoiceDate:    dc.invoiceDate || '',
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr]       = useState('');
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const save = async () => {
    setSaving(true); setErr('');
    try {
      await axios.put(`/api/delivery-challans/${dc.dcId}`, { companyId: cid, ...form });
      onSaved();
    } catch (e) { setErr(e.response?.data?.error || e.message); }
    setSaving(false);
  };

  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:9000, display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ background:W, width:520, borderRadius:6, overflow:'hidden', boxShadow:'0 8px 32px rgba(0,0,0,0.3)', fontFamily:F }}>
        <div style={{ background:'#104f4f', color:W, padding:'10px 16px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <span style={{ fontWeight:700, fontSize:13 }}>✏ï¸ Edit DC — {dc.dcNo}</span>
          <button onClick={onClose} style={{ background:'none', border:'none', color:W, fontSize:18, cursor:'pointer' }}>✕</button>
        </div>
        <div style={{ padding:14 }}>
          {err && <div style={{ marginBottom:8, padding:'6px 10px', background:'#FEF2F2', color:'#DC2626', borderRadius:4, fontSize:11 }}>{err}</div>}
          <div style={{ border:'1px solid #E2E8F0' }}>
            <FR label="DC Date">      <Inp type="date" value={form.dcDate}          onChange={e=>set('dcDate',e.target.value)} /></FR>
            <FR label="Dispatch Via"> <Inp value={form.dispatchThrough}             onChange={e=>set('dispatchThrough',e.target.value)} placeholder="Transport company" /></FR>
            <FR label="Vehicle No">   <Inp value={form.vehicleNo}                   onChange={e=>set('vehicleNo',e.target.value)} placeholder="Vehicle / tracking ID" /></FR>
            <FR label="Invoice No">   <Inp value={form.invoiceNo}                   onChange={e=>set('invoiceNo',e.target.value)} placeholder="If already issued" /></FR>
            <FR label="Invoice Date"> <Inp type="date" value={form.invoiceDate}     onChange={e=>set('invoiceDate',e.target.value)} /></FR>
          </div>
          <div style={{ display:'flex', gap:8, justifyContent:'flex-end', marginTop:12 }}>
            <Btn onClick={onClose}>Cancel</Btn>
            <Btn v="pri" onClick={save} disabled={saving}>{saving ? 'Saving…' : '💾 Save Changes'}</Btn>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════ MAIN MODULE ═══════════════════════ */
export default function DeliveryChallanModule() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { selectedCompany } = useCompany();
  const cid = selectedCompany?.companyId;

  const [salesOrders, setSOs] = useState([]);
  const [dcs, setDCs]         = useState([]);
  const [createKey, setCreateKey] = useState(0);
  const [toast, setToast]     = useState('');
  const [editDC, setEditDC]   = useState(null);

  const loadSOs = useCallback(async () => {
    if (!cid) return;
    try {
      const r = await axios.get(`/api/sales-orders?companyId=${cid}`);
      setSOs((r.data || []).filter(o => !['draft','rejected'].includes(o.status)));
    } catch { setSOs([]); }
  }, [cid]);

  const loadDCs = useCallback(async () => {
    if (!cid) return;
    try {
      const r = await axios.get(`/api/delivery-challans?companyId=${cid}`);
      setDCs(r.data || []);
    } catch { setDCs([]); }
  }, [cid]);

  useEffect(() => { loadSOs(); loadDCs(); }, [loadSOs, loadDCs]);

  const handleDelete = async (dc) => {
    if (!window.confirm(`Delete DC ${dc.dcNo}? This cannot be undone.`)) return;
    try {
      await axios.delete(`/api/delivery-challans/${dc.dcId}?companyId=${cid}`);
      setToast(`🗑 ${dc.dcNo} deleted`);
      setTimeout(() => setToast(''), 3000);
      loadDCs();
    } catch (e) { alert('Error: ' + (e.response?.data?.error || e.message)); }
  };

  return (
    <div style={{ fontFamily:F, fontSize:12 }}>
      {toast && (
        <div style={{ position:'fixed', top:16, right:16, zIndex:9999, background:'#065F46', color:W, padding:'10px 18px', borderRadius:6, fontSize:13, fontWeight:600, boxShadow:'0 4px 12px rgba(0,0,0,0.2)' }}>
          {toast}
        </div>
      )}
      {editDC && (
        <EditDCModal dc={editDC} cid={cid}
          onSaved={() => { setEditDC(null); setToast('✅ DC updated'); setTimeout(()=>setToast(''),3000); loadDCs(); }}
          onClose={() => setEditDC(null)} />
      )}

      {/* Header */}
      <div style={{ background:'#104f4f', color:W, padding:'10px 16px', display:'flex', alignItems:'center', gap:10, marginBottom:12 }}>
        <span style={{ fontSize:16, fontWeight:700 }}>🚚 Delivery Challan</span>
        <span style={{ fontSize:11, opacity:0.8 }}>— Issue new or manage existing challans</span>
      </div>

      {/* Create form */}
      <div style={{ padding:'0 4px' }}>
        <CreateForm
          key={createKey}
          salesOrders={salesOrders}
          onSaved={(dc) => {
            setToast(`✅ ${dc.dcNo} issued successfully!`);
            setTimeout(() => setToast(''), 3000);
            setCreateKey(k => k + 1);
            loadDCs();
          }}
        />
      </div>

      <div style={{ margin:'16px 4px 0', padding:'10px 14px', background:'#F0F9FF', border:'1px solid #BAE6FD', borderRadius:6, fontSize:11, color:'#104f4f' }}>
        📋 <strong>Note:</strong> Once issued, the DC will appear in <strong>Sales Bill → Delivery Challan tab</strong> as "Invoice Pending". Create the invoice from there when ready.
      </div>

      {/* All DCs list */}
      <div style={{ margin:'20px 4px 0', border:'1px solid #E2E8F0', borderRadius:6, overflow:'hidden' }}>
        <div style={{ background:'#104f4f', color:W, padding:'8px 14px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <span style={{ fontWeight:700, fontSize:12 }}>📋 All Delivery Challans ({dcs.length})</span>
          <Btn small onClick={loadDCs}>🔄 Refresh</Btn>
        </div>
        <DCList
          dcs={dcs}
          onPrint={d => printDeliveryChallan(d, selectedCompany)}
          onDelete={handleDelete}
          onEdit={d => setEditDC(d)}
          emptyMsg="No delivery challans issued yet."
        />
      </div>
    </div>
  );
}
