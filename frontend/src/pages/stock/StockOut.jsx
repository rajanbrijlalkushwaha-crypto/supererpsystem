/**
 * GDN — Goods Delivery Note / Delivery Challan
 *
 * PART 1 — FROM
 *   Source Type: Store (our warehouse) | Vendor (vendor dispatching / we pickup from vendor)
 *   - If Vendor: select vendor → PO of that vendor → vendor address shown
 *   - If Store:  select internal store/warehouse
 *
 * PART 2 — TO
 *   Destination: Client | Vendor | Factory | Internal Transfer | Manufacturing | Other
 *   - If Client: select client → select SO → items auto-load
 *     Items show: Actual Qty | Already Dispatched | Balance | Now Dispatch (editable)
 *     Items with Balance = 0 (fully dispatched) are hidden automatically
 *   - Others: free text / party dropdown
 *
 * Saving: orderId stored as soRef/poRef so next GDN can compute Already Dispatched
 */
import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { useCompany } from '../../context/CompanyContext';

const P   = '#104f4f';
const PD  = '#0b3d3d';
const BG  = '#F5F7FB';
const BD  = '#E5EAF2';
const F   = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const GH  = '#104f4f';   /* FROM green header */
const BH  = '#1E40AF';   /* TO  blue header  */
const fmt = n => (parseFloat(n) || 0).toLocaleString('en-IN', { maximumFractionDigits: 3 });

const inp = (readOnly = false, extra = {}) => ({
  width: '100%', height: 32, padding: '0 10px',
  border: `1px solid ${BD}`, borderRadius: 6,
  fontSize: 12, fontFamily: F, outline: 'none',
  background: readOnly ? '#F9FAFB' : '#fff',
  color: '#111827', boxSizing: 'border-box',
  ...extra,
});
const sel = (extra = {}) => ({ ...inp(false), cursor: 'pointer', ...extra });

const lbl = { fontSize: 11.5, fontWeight: 600, color: '#374151', marginBottom: 4, display: 'block', fontFamily: F };

function FR({ label, children, required, cols }) {
  return (
    <div style={{ ...(cols ? { gridColumn: cols } : {}) }}>
      <label style={lbl}>{label}{required && <span style={{ color: '#EF4444' }}> *</span>}</label>
      {children}
    </div>
  );
}

function SH({ children, color = P, right }) {
  return (
    <div style={{ background: color, padding: '8px 14px', fontSize: 11, fontWeight: 800,
      color: '#fff', textTransform: 'uppercase', letterSpacing: '0.8px',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <span>{children}</span>
      {right}
    </div>
  );
}

/* ── generic search popup ── */
function SearchPopup({ title, columns, rows, onSelect, onClose, searchKeys }) {
  const [q, setQ] = useState('');
  const ref = useRef(null);
  useEffect(() => { ref.current?.focus(); }, []);
  const filtered = rows.filter(r =>
    !q.trim() || searchKeys.some(k => String(r[k] || '').toLowerCase().includes(q.toLowerCase()))
  );
  return (
    <div onClick={e => e.target === e.currentTarget && onClose()}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
        backdropFilter: 'blur(2px)', zIndex: 10000,
        display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#fff', borderRadius: 12, width: '95%', maxWidth: 640,
        maxHeight: '80vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 20px 60px rgba(0,0,0,0.18)', overflow: 'hidden' }}>
        <div style={{ background: P, padding: '12px 16px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 13, fontWeight: 800, color: '#fff', fontFamily: F }}>{title}</span>
          <button onClick={onClose}
            style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff',
              width: 26, height: 26, borderRadius: 6, cursor: 'pointer', fontSize: 14 }}>✕</button>
        </div>
        <div style={{ padding: '10px 14px', borderBottom: `1px solid ${BD}` }}>
          <input ref={ref} value={q} onChange={e => setQ(e.target.value)}
            placeholder="Type to search…"
            style={{ ...inp(), height: 34 }} />
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, fontFamily: F }}>
            <thead style={{ position: 'sticky', top: 0 }}>
              <tr style={{ background: P }}>
                {columns.map(c => (
                  <th key={c.key} style={{ padding: '8px 12px', color: '#fff', fontWeight: 700,
                    textAlign: 'left', fontSize: 11 }}>{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={columns.length}
                  style={{ padding: 20, textAlign: 'center', color: '#9CA3AF', fontSize: 13 }}>
                  No results found
                </td></tr>
              )}
              {filtered.map((row, i) => (
                <tr key={i} onClick={() => { onSelect(row); onClose(); }}
                  style={{ background: i % 2 === 0 ? '#fff' : '#FAFBFC', cursor: 'pointer',
                    borderBottom: `1px solid ${BD}`, transition: 'background 0.1s' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#EEF4FF'}
                  onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? '#fff' : '#FAFBFC'}>
                  {columns.map(c => (
                    <td key={c.key} style={{ padding: '8px 12px', fontWeight: c.bold ? 700 : 400 }}>
                      {row[c.key] || '—'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ padding: '8px 14px', borderTop: `1px solid ${BD}`,
          fontSize: 11, color: '#9CA3AF', fontFamily: F }}>
          {filtered.length} result{filtered.length !== 1 ? 's' : ''} — click to select
        </div>
      </div>
    </div>
  );
}

/* ── stock item search popup ── */
function ItemPopup({ stockLevels, onSelect, onClose }) {
  const [q, setQ] = useState('');
  const ref = useRef(null);
  useEffect(() => { ref.current?.focus(); }, []);
  const list = stockLevels.filter(l => l.currentStock > 0 &&
    (!q.trim() || String(l.itemCode).includes(q) ||
     (l.itemName || '').toLowerCase().includes(q.toLowerCase())));
  return (
    <div onClick={e => e.target === e.currentTarget && onClose()}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
        backdropFilter: 'blur(2px)', zIndex: 9999,
        display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#fff', borderRadius: 12, width: '95%', maxWidth: 600,
        maxHeight: '78vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 20px 60px rgba(0,0,0,0.18)', overflow: 'hidden' }}>
        <div style={{ background: '#DC2626', padding: '12px 16px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 13, fontWeight: 800, color: '#fff', fontFamily: F }}>
            Select Item (In-stock Only)
          </span>
          <button onClick={onClose}
            style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff',
              width: 26, height: 26, borderRadius: 6, cursor: 'pointer', fontSize: 14 }}>✕</button>
        </div>
        <div style={{ padding: '10px 14px', borderBottom: `1px solid ${BD}` }}>
          <input ref={ref} value={q} onChange={e => setQ(e.target.value)}
            placeholder="Search by code or name…"
            style={{ ...inp(), height: 34 }} />
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, fontFamily: F }}>
            <thead style={{ position: 'sticky', top: 0 }}>
              <tr style={{ background: '#DC2626' }}>
                {['Code', 'Item Name', 'Unit', 'Available'].map(h => (
                  <th key={h} style={{ padding: '8px 12px', color: '#fff', fontWeight: 700,
                    textAlign: 'left', fontSize: 11 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {list.length === 0 && (
                <tr><td colSpan={4}
                  style={{ padding: 20, textAlign: 'center', color: '#9CA3AF', fontSize: 13 }}>
                  No items with available stock
                </td></tr>
              )}
              {list.map((l, i) => (
                <tr key={l.itemCode} onClick={() => { onSelect(l); onClose(); }}
                  style={{ background: i % 2 === 0 ? '#fff' : '#FAFBFC', cursor: 'pointer',
                    borderBottom: `1px solid ${BD}`, transition: 'background 0.1s' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#EEF4FF'}
                  onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? '#fff' : '#FAFBFC'}>
                  <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontWeight: 700, color: P }}>{l.itemCode}</td>
                  <td style={{ padding: '8px 12px', fontWeight: 500 }}>{l.itemName}</td>
                  <td style={{ padding: '8px 12px', color: '#6B7280' }}>{l.unit}</td>
                  <td style={{ padding: '8px 12px', fontWeight: 700,
                    color: l.currentStock > 10 ? '#059669' : '#D97706' }}>
                    {fmt(l.currentStock)} {l.unit}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ padding: '8px 14px', borderTop: `1px solid ${BD}`,
          fontSize: 11, color: '#9CA3AF', fontFamily: F }}>
          {list.length} item{list.length !== 1 ? 's' : ''} — click to select
        </div>
      </div>
    </div>
  );
}

const STORES = ['Warehouse A', 'Warehouse B', 'Raw Material Store', 'Finished Goods Store',
  'Production Floor', 'Quality Hold', 'Default'];

const DEST_TYPES = [
  { value: 'client',        label: 'Client Delivery' },
  { value: 'vendor',        label: 'Vendor (Job Work / Return)' },
  { value: 'factory',       label: 'Factory / External Location' },
  { value: 'transfer',      label: 'Internal Store Transfer' },
  { value: 'manufacturing', label: 'Issued to Manufacturing' },
  { value: 'other',         label: 'Other' },
];

const blankRow = () => ({
  itemCode: '', itemName: '', hsnCode: '',
  actualQty: '', dispatchedQty: '', balanceQty: '',
  nowQty: '', unit: '', fromLocation: '',
  availableStock: 0, fromOrder: false,
});

const fmtD = d => {
  if (!d) return '—';
  const dt = new Date(d);
  return isNaN(dt) ? d
    : `${String(dt.getDate()).padStart(2, '0')}-${String(dt.getMonth() + 1).padStart(2, '0')}-${dt.getFullYear()}`;
};

function computeDispatched(allGDNs, orderId) {
  const id = String(orderId);
  const map = {};
  allGDNs.forEach(gdn => {
    const ref = String(gdn.soRef || gdn.poRef || gdn.orderRef || '');
    if (ref !== id) return;
    (gdn.items || []).forEach(it => {
      const k = String(it.itemCode || it.itemName || '').toLowerCase().trim();
      if (k) map[k] = (map[k] || 0) + (parseFloat(it.qty) || 0);
    });
  });
  return map;
}

export default function StockOut() {
  const { selectedCompany } = useCompany();
  const cid = selectedCompany?.companyId;

  const [stockLevels,    setStockLevels]    = useState([]);
  const [vendors,        setVendors]        = useState([]);
  const [clients,        setClients]        = useState([]);
  const [salesOrders,    setSalesOrders]    = useState([]);
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [allGDNs,        setAllGDNs]        = useState([]);
  const [recentGDNs,     setRecentGDNs]     = useState([]);

  /* FROM */
  const [fromType,     setFromType]     = useState('store');
  const [dispatchFrom, setDispatchFrom] = useState('Warehouse A');
  const [fromVendorId, setFromVendorId] = useState('');
  const [fromVendor,   setFromVendor]   = useState(null);
  const [fromPOId,     setFromPOId]     = useState('');
  const [fromPO,       setFromPO]       = useState(null);
  const [date,         setDate]         = useState(new Date().toISOString().slice(0, 10));
  const [preparedBy,   setPreparedBy]   = useState('');

  /* TO */
  const [destType,      setDestType]      = useState('client');
  const [partyId,       setPartyId]       = useState('');
  const [partyName,     setPartyName]     = useState('');
  const [orderType,     setOrderType]     = useState('so');
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [dcNo,          setDcNo]          = useState('');
  const [refDate,       setRefDate]       = useState('');
  const [vehicleNo,     setVehicleNo]     = useState('');
  const [notes,         setNotes]         = useState('');

  const [rows, setRows] = useState([blankRow()]);

  /* ui */
  const [showItemPopup, setShowItemPopup] = useState(false);
  const [popupRowIdx,   setPopupRowIdx]   = useState(null);
  const [showPopup,     setShowPopup]     = useState(null);
  const [orderLoading,  setOrderLoading]  = useState(false);
  const [message,       setMessage]       = useState({ text: '', ok: true });
  const [loading,       setLoading]       = useState(false);

  const loadAll = () => {
    if (!cid) return;
    axios.get(`/api/stock/levels?companyId=${cid}`).then(r => setStockLevels(r.data || [])).catch(() => {});
    axios.get(`/api/vendors?companyId=${cid}`).then(r => setVendors(r.data || [])).catch(() => {});
    axios.get(`/api/clients?companyId=${cid}`).then(r => setClients(r.data || [])).catch(() => {});
    axios.get(`/api/sales-orders?companyId=${cid}`).then(r => setSalesOrders(r.data || [])).catch(() => {});
    axios.get(`/api/purchase-orders?companyId=${cid}`).then(r => setPurchaseOrders(r.data || [])).catch(() => {});
    axios.get(`/api/stock/gdn?companyId=${cid}`).then(r => {
      const all = r.data || [];
      setAllGDNs(all);
      setRecentGDNs(all);
    }).catch(() => {});
  };
  useEffect(() => { loadAll(); }, [cid]);

  const stockMap = {};
  stockLevels.forEach(l => { stockMap[String(l.itemCode)] = l.currentStock; });

  const handleFromTypeChange = (t) => {
    setFromType(t);
    setFromVendorId(''); setFromVendor(null);
    setFromPOId(''); setFromPO(null);
  };

  const handleFromVendorChange = (id) => {
    setFromVendorId(id);
    setFromPOId(''); setFromPO(null);
    const v = vendors.find(x => String(x.vendorId) === id);
    setFromVendor(v || null);
  };

  const vendorPOs = fromVendorId
    ? purchaseOrders.filter(po => String(po.vendorId || po.party || '') === fromVendorId ||
        (fromVendor && (po.vendorName || po.party || '').toLowerCase() === (fromVendor.vendorName || '').toLowerCase()))
    : purchaseOrders;

  const handleFromPOChange = (id) => {
    setFromPOId(id);
    const po = purchaseOrders.find(p => String(p.orderId || p.id || '') === id);
    setFromPO(po || null);
  };

  const handleDestTypeChange = (val) => {
    setDestType(val);
    setPartyId(''); setPartyName('');
    setSelectedOrder(null); setRows([blankRow()]);
    if (val === 'client')      setOrderType('so');
    else if (val === 'vendor') setOrderType('po');
    else                       setOrderType('none');
  };

  const partyList    = destType === 'vendor' ? vendors : clients;
  const partyIdKey   = destType === 'vendor' ? 'vendorId' : 'clientId';
  const partyNameKey = destType === 'vendor' ? 'vendorName' : 'clientName';

  const handlePartyChange = (id) => {
    setPartyId(id);
    setSelectedOrder(null); setRows([blankRow()]);
    const p = partyList.find(x => String(x[partyIdKey]) === id);
    setPartyName(p ? (p[partyNameKey] || p.companyName || '') : '');
  };

  const filteredOrders = (() => {
    if (orderType === 'so') return salesOrders;
    if (orderType === 'po') return purchaseOrders.filter(o =>
      !partyId || String(o.vendorId || '') === partyId);
    return [];
  })();

  const handleOrderSelect = async (orderId) => {
    if (!orderId) { setSelectedOrder(null); setRows([blankRow()]); return; }
    try {
      setOrderLoading(true);
      const url = orderType === 'so'
        ? `/api/sales-orders/${orderId}?companyId=${cid}`
        : `/api/purchase-orders/${orderId}?companyId=${cid}`;
      const res   = await axios.get(url);
      const order = res.data;
      setSelectedOrder(order);

      const dispatched = computeDispatched(allGDNs, orderId);
      const orderItems = order.items || [];
      if (orderItems.length === 0) { setRows([blankRow()]); return; }

      const newRows = orderItems
        .map(it => {
          const code    = String(it.itemCode || '');
          const name    = it.description || it.itemName || it.material || '';
          const actual  = parseFloat(it.qty || it.quantity || 0) || 0;
          const dKey    = (code || name).toLowerCase().trim();
          const done    = dispatched[dKey] || 0;
          const balance = Math.max(0, actual - done);
          const avail   = code ? (stockMap[code] || 0) : 0;
          return {
            itemCode: code, itemName: name, hsnCode: it.hsnCode || '',
            actualQty: actual, dispatchedQty: done, balanceQty: balance,
            nowQty: balance > 0 ? String(balance) : '',
            unit: it.unit || '',
            fromLocation: fromType === 'store' ? dispatchFrom : '',
            availableStock: avail, fromOrder: true,
          };
        })
        .filter(r => r.balanceQty > 0);

      setRows(newRows.length > 0 ? newRows : [blankRow()]);
    } catch {
      setMessage({ text: 'Could not load order items. Add items manually.', ok: false });
      setRows([blankRow()]);
    } finally { setOrderLoading(false); }
  };

  const openPopup  = (i) => { setPopupRowIdx(i); setShowItemPopup(true); };
  const selectItem = (level) => {
    if (popupRowIdx === null) return;
    setRows(rs => rs.map((r, i) => i === popupRowIdx ? {
      ...r, itemCode: level.itemCode, itemName: level.itemName,
      unit: level.unit, availableStock: level.currentStock, fromOrder: false,
    } : r));
  };

  const setRow    = (i, k, v) => setRows(rs => rs.map((r, idx) => idx === i ? { ...r, [k]: v } : r));
  const addRow    = () => setRows(rs => [...rs, blankRow()]);
  const removeRow = (i) => { if (rows.length > 1) setRows(rs => rs.filter((_, idx) => idx !== i)); };

  const hasOver = rows.some(r => r.itemCode && parseFloat(r.nowQty || r.qty || 0) > r.availableStock && r.availableStock > 0);

  const handleSubmit = async () => {
    const qtyKey    = selectedOrder ? 'nowQty' : 'qty';
    const validRows = rows.filter(r => (r.itemCode || r.itemName) && parseFloat(r[qtyKey] || 0) > 0);
    if (validRows.length === 0) { setMessage({ text: 'Add at least one item with dispatch quantity.', ok: false }); return; }
    if (hasOver)                { setMessage({ text: 'One or more items exceed available stock.', ok: false }); return; }

    try {
      setLoading(true); setMessage({ text: '', ok: true });
      const soId = orderType === 'so' ? (selectedOrder?.orderId || selectedOrder?.id || '') : '';
      const poId = orderType === 'po' ? (selectedOrder?.orderId || selectedOrder?.id || '') : '';

      const payload = {
        companyId: cid, date, preparedBy,
        fromType,
        dispatchFrom: fromType === 'store' ? dispatchFrom : '',
        fromVendorId, fromVendorName: fromVendor?.vendorName || '',
        fromPOId, fromPONo: fromPO?.poNo || fromPO?.voucherNumber || '',
        destinationType: destType,
        partyType: ['client', 'vendor'].includes(destType) ? destType : 'other',
        partyId, partyName,
        soRef: String(soId),
        poRef: String(poId),
        orderRef: selectedOrder?.orderNo || selectedOrder?.voucherNumber || selectedOrder?.poNo || '',
        dcNo, refDate, vehicleNo, notes,
        items: validRows.map(r => ({
          itemCode:     r.itemCode,
          itemName:     r.itemName,
          hsnCode:      r.hsnCode || '',
          qty:          parseFloat(r.nowQty || r.qty || 0),
          unit:         r.unit,
          location:     r.fromLocation || dispatchFrom,
          actualQty:    r.actualQty || 0,
          dispatchedQty: r.dispatchedQty || 0,
          balanceQty:   r.balanceQty || 0,
        })),
      };
      const res = await axios.post(`/api/stock/gdn?companyId=${cid}`, payload);
      setMessage({ text: `✓ ${res.data.message}`, ok: true });
      handleReset();
      loadAll();
    } catch (e) {
      setMessage({ text: 'Error: ' + (e.response?.data?.error || e.message), ok: false });
    } finally { setLoading(false); }
  };

  const handleReset = () => {
    setFromType('store'); setDispatchFrom('Warehouse A');
    setFromVendorId(''); setFromVendor(null); setFromPOId(''); setFromPO(null);
    setPreparedBy(''); setDate(new Date().toISOString().slice(0, 10));
    setDestType('client'); setPartyId(''); setPartyName('');
    setOrderType('so'); setSelectedOrder(null);
    setDcNo(''); setRefDate(''); setVehicleNo(''); setNotes('');
    setRows([blankRow()]); setMessage({ text: '', ok: true });
  };

  const handleDeleteGDN = async (g) => {
    if (!window.confirm(`Delete GDN ${g.gdnNo}?\nThis will reverse the stock entry. Cannot be undone.`)) return;
    await axios.delete(`/api/stock/transactions/${g.txnId}?companyId=${cid}`).catch(() => {});
    loadAll();
  };

  const orderLabel = (o) => {
    const no    = o.orderNo || o.voucherNumber || o.poNo || o.orderId || o.id || '';
    const party = o.customerName || o.party || o.vendorName || '';
    return party ? `${no} — ${party}` : no;
  };

  const showOrderSection = !['manufacturing'].includes(destType);

  const card = { background: '#fff', border: `1px solid ${BD}`, borderRadius: 10,
    overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', marginBottom: 12 };
  const grid2 = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, padding: 14 };

  return (
    <div style={{ background: BG, minHeight: '100%', fontFamily: F }}>

      {/* Page Header */}
      <div style={{ background: P, padding: '14px 20px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', fontWeight: 500,
            textTransform: 'uppercase', letterSpacing: '0.6px' }}>Inventory</div>
          <div style={{ fontSize: 15, fontWeight: 800, color: '#fff', letterSpacing: '-0.2px' }}>
            GDN — Goods Delivery Note
            {selectedOrder && (
              <span style={{ fontSize: 12, fontWeight: 500, marginLeft: 10,
                background: 'rgba(255,255,255,0.18)', padding: '2px 10px', borderRadius: 20 }}>
                {orderType === 'so' ? 'SO' : 'PO'}: {selectedOrder.orderNo || selectedOrder.voucherNumber || selectedOrder.poNo || selectedOrder.id}
              </span>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={loadAll}
            style={{ height: 32, padding: '0 14px', fontSize: 12, fontFamily: F, cursor: 'pointer',
              background: 'rgba(255,255,255,0.12)', color: '#fff',
              border: '1px solid rgba(255,255,255,0.25)', borderRadius: 6, fontWeight: 600 }}>
            ↻ Refresh
          </button>
          <button onClick={handleReset}
            style={{ height: 32, padding: '0 14px', fontSize: 12, fontFamily: F, cursor: 'pointer',
              background: 'rgba(255,255,255,0.12)', color: '#fff',
              border: '1px solid rgba(255,255,255,0.25)', borderRadius: 6, fontWeight: 600 }}>
            ↺ Clear Form
          </button>
          <button onClick={handleSubmit} disabled={loading || hasOver}
            style={{ height: 32, padding: '0 20px', fontSize: 12, fontFamily: F, cursor: 'pointer',
              background: loading || hasOver ? '#9CA3AF' : '#12B76A', color: '#fff',
              border: 'none', borderRadius: 6, fontWeight: 700,
              opacity: loading || hasOver ? 0.8 : 1,
              boxShadow: loading || hasOver ? 'none' : '0 2px 6px rgba(18,183,106,0.4)' }}>
            {loading ? 'Saving…' : '📤 Save GDN'}
          </button>
        </div>
      </div>

      {/* Message */}
      {message.text && (
        <div style={{ margin: '10px 16px 0', padding: '9px 14px', fontSize: 12.5, fontFamily: F,
          background: message.ok ? '#ECFDF5' : '#FEF2F2',
          color: message.ok ? '#059669' : '#DC2626',
          border: `1px solid ${message.ok ? '#A7F3D0' : '#FECACA'}`,
          borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{message.text}</span>
          <button onClick={() => setMessage({ text: '', ok: true })}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16,
              color: message.ok ? '#059669' : '#DC2626' }}>✕</button>
        </div>
      )}

      <div style={{ padding: '12px 16px' }}>

        {/* FROM / TO grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 0 }}>

          {/* ─── PART 1 — FROM ─── */}
          <div style={card}>
            <SH color={GH}>Part 1 — From (Dispatch From)</SH>
            <div style={{ ...grid2, gridTemplateColumns: '1fr 1fr' }}>

              <FR label="Date" required>
                <input type="date" value={date} onChange={e => setDate(e.target.value)}
                  style={{ ...inp(), width: '100%' }} />
              </FR>

              <FR label="Prepared By">
                <input value={preparedBy} onChange={e => setPreparedBy(e.target.value)}
                  placeholder="Name of person preparing GDN"
                  style={inp()} />
              </FR>

              <FR label="Source Type" required cols="1 / -1">
                <div style={{ display: 'flex', gap: 16, marginTop: 4 }}>
                  {[{ v: 'store', l: 'Our Store / Warehouse' }, { v: 'vendor', l: 'Vendor Location' }].map(opt => (
                    <label key={opt.v}
                      style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12,
                        cursor: 'pointer', fontFamily: F, fontWeight: 500, color: '#374151' }}>
                      <input type="radio" name="fromType" value={opt.v} checked={fromType === opt.v}
                        onChange={() => handleFromTypeChange(opt.v)} />
                      {opt.l}
                    </label>
                  ))}
                </div>
              </FR>

              {fromType === 'store' && (
                <FR label="Dispatch From Store" required cols="1 / -1">
                  <select value={dispatchFrom} onChange={e => setDispatchFrom(e.target.value)}
                    style={sel()}>
                    {STORES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </FR>
              )}

              {fromType === 'vendor' && (
                <>
                  <FR label="From Vendor" required cols="1 / -1">
                    <div style={{ display: 'flex', gap: 6 }}>
                      <input readOnly value={fromVendor?.vendorName || ''}
                        placeholder="— Click 🔍 to search vendor —"
                        style={{ ...inp(true), flex: 1 }} />
                      <button onClick={() => setShowPopup('fromVendor')}
                        style={{ height: 32, padding: '0 12px', fontSize: 12, cursor: 'pointer',
                          background: '#EEF4FF', color: P, border: `1px solid ${BD}`,
                          borderRadius: 6, fontWeight: 600 }}>🔍</button>
                      {fromVendor && (
                        <button onClick={() => { setFromVendorId(''); setFromVendor(null); setFromPOId(''); setFromPO(null); }}
                          style={{ height: 32, width: 32, background: '#FEF2F2', border: `1px solid #FECACA`,
                            color: '#DC2626', borderRadius: 6, cursor: 'pointer', fontSize: 16 }}>✕</button>
                      )}
                    </div>
                  </FR>

                  {fromVendor && (
                    <div style={{ gridColumn: '1 / -1', background: '#F0FDF4',
                      border: '1px solid #A7F3D0', borderRadius: 8, padding: '10px 14px',
                      fontSize: 12, lineHeight: 1.7, color: '#374151' }}>
                      <div style={{ fontWeight: 700, color: GH, fontSize: 13 }}>{fromVendor.vendorName}</div>
                      {fromVendor.address && <div>{fromVendor.address}</div>}
                      {(fromVendor.city || fromVendor.state) && (
                        <div>{[fromVendor.city, fromVendor.state, fromVendor.pincode].filter(Boolean).join(', ')}</div>
                      )}
                      {fromVendor.gstin && <div style={{ color: '#6B7280' }}>GSTIN: {fromVendor.gstin}</div>}
                    </div>
                  )}

                  <FR label="PO No. (From Vendor)" cols="1 / -1">
                    <div style={{ display: 'flex', gap: 6 }}>
                      <input readOnly value={fromPO ? (fromPO.poNo || fromPO.voucherNumber || fromPO.orderNo || '') : ''}
                        placeholder="— Click 🔍 to search PO —"
                        style={{ ...inp(true), flex: 1 }} />
                      <button onClick={() => setShowPopup('fromPO')}
                        style={{ height: 32, padding: '0 12px', fontSize: 12, cursor: 'pointer',
                          background: '#EEF4FF', color: P, border: `1px solid ${BD}`,
                          borderRadius: 6, fontWeight: 600 }}>🔍</button>
                      {fromPO && (
                        <button onClick={() => { setFromPOId(''); setFromPO(null); }}
                          style={{ height: 32, width: 32, background: '#FEF2F2', border: `1px solid #FECACA`,
                            color: '#DC2626', borderRadius: 6, cursor: 'pointer', fontSize: 16 }}>✕</button>
                      )}
                    </div>
                  </FR>

                  {fromPO && (
                    <div style={{ gridColumn: '1 / -1', background: '#FFFBEB',
                      border: '1px solid #FDE68A', borderRadius: 8, padding: '8px 14px',
                      fontSize: 12, color: '#374151' }}>
                      <span style={{ fontWeight: 700 }}>PO: </span>{fromPO.poNo || fromPO.voucherNumber}
                      {fromPO.poDate && <span style={{ color: '#6B7280', marginLeft: 10 }}>{fmtD(fromPO.poDate)}</span>}
                      {fromPO.vendorName && <span style={{ marginLeft: 10 }}>{fromPO.vendorName || fromPO.party}</span>}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* ─── PART 2 — TO ─── */}
          <div style={card}>
            <SH color={BH}>Part 2 — To (Deliver To)</SH>
            <div style={{ ...grid2, gridTemplateColumns: '1fr 1fr' }}>

              <FR label="Destination Type" required cols="1 / -1">
                <select value={destType} onChange={e => handleDestTypeChange(e.target.value)}
                  style={sel()}>
                  {DEST_TYPES.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                </select>
              </FR>

              {['client', 'vendor'].includes(destType) ? (
                <FR label={destType === 'client' ? 'Client' : 'Vendor'} required cols="1 / -1">
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input readOnly value={partyName}
                      placeholder={`— Click 🔍 to search ${destType === 'client' ? 'client' : 'vendor'} —`}
                      style={{ ...inp(true), flex: 1 }} />
                    <button onClick={() => setShowPopup('toParty')}
                      style={{ height: 32, padding: '0 12px', fontSize: 12, cursor: 'pointer',
                        background: '#EEF4FF', color: P, border: `1px solid ${BD}`,
                        borderRadius: 6, fontWeight: 600 }}>🔍</button>
                    {partyId && (
                      <button onClick={() => { setPartyId(''); setPartyName(''); setSelectedOrder(null); setRows([blankRow()]); }}
                        style={{ height: 32, width: 32, background: '#FEF2F2', border: `1px solid #FECACA`,
                          color: '#DC2626', borderRadius: 6, cursor: 'pointer', fontSize: 16 }}>✕</button>
                    )}
                  </div>
                </FR>
              ) : (
                <FR label="Deliver To" cols="1 / -1">
                  <input value={partyName} onChange={e => setPartyName(e.target.value)}
                    placeholder="Factory / Department / Location…"
                    style={inp()} />
                </FR>
              )}

              {showOrderSection && (
                <>
                  <FR label="Order Type" cols="1 / -1">
                    <div style={{ display: 'flex', gap: 16, marginTop: 4 }}>
                      {[{ v: 'so', l: 'Sales Order' }, { v: 'po', l: 'Purchase Order' }, { v: 'none', l: 'No Order Ref' }].map(opt => (
                        <label key={opt.v}
                          style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12,
                            cursor: 'pointer', fontFamily: F, fontWeight: 500, color: '#374151' }}>
                          <input type="radio" name="orderType" value={opt.v} checked={orderType === opt.v}
                            onChange={() => { setOrderType(opt.v); setSelectedOrder(null); setRows([blankRow()]); }} />
                          {opt.l}
                        </label>
                      ))}
                    </div>
                  </FR>

                  {orderType !== 'none' && (
                    <FR label={orderType === 'so' ? 'Sales Order No.' : 'Purchase Order No.'} cols="1 / -1">
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <input readOnly
                          value={selectedOrder ? orderLabel(selectedOrder) : ''}
                          placeholder="— Click 🔍 to search order —"
                          style={{ ...inp(true), flex: 1 }} />
                        <button onClick={() => setShowPopup('toOrder')}
                          style={{ height: 32, padding: '0 12px', fontSize: 12, cursor: 'pointer',
                            background: '#EEF4FF', color: P, border: `1px solid ${BD}`,
                            borderRadius: 6, fontWeight: 600 }}>🔍</button>
                        {orderLoading && <span style={{ fontSize: 11, color: '#9CA3AF' }}>loading…</span>}
                        {selectedOrder && (
                          <button onClick={() => { setSelectedOrder(null); setRows([blankRow()]); }}
                            style={{ height: 32, width: 32, background: '#FEF2F2', border: `1px solid #FECACA`,
                              color: '#DC2626', borderRadius: 6, cursor: 'pointer', fontSize: 16 }}>✕</button>
                        )}
                      </div>
                    </FR>
                  )}
                </>
              )}

              <FR label="DC / Challan No.">
                <input value={dcNo} onChange={e => setDcNo(e.target.value)}
                  placeholder="Delivery Challan number"
                  style={inp()} />
              </FR>

              <FR label="Ref. Date">
                <input type="date" value={refDate} onChange={e => setRefDate(e.target.value)}
                  style={inp()} />
              </FR>

              <FR label="Vehicle No.">
                <input value={vehicleNo} onChange={e => setVehicleNo(e.target.value)}
                  placeholder="e.g. MH12AB1234"
                  style={inp()} />
              </FR>

              <FR label="Notes">
                <input value={notes} onChange={e => setNotes(e.target.value)}
                  placeholder="Remarks…"
                  style={inp()} />
              </FR>
            </div>
          </div>
        </div>

        {/* Items Table */}
        <div style={card}>
          <SH color="#DC2626" right={
            <button onClick={addRow}
              style={{ height: 24, padding: '0 12px', fontSize: 11, cursor: 'pointer',
                background: 'rgba(255,255,255,0.15)', color: '#fff',
                border: '1px solid rgba(255,255,255,0.3)', borderRadius: 5, fontWeight: 600 }}>
              + Add Row
            </button>
          }>
            Items to Dispatch
            {selectedOrder && <span style={{ fontWeight: 400, fontSize: 10, marginLeft: 8, textTransform: 'none' }}>
              (fully dispatched items hidden)
            </span>}
          </SH>

          {selectedOrder && rows.length === 1 && !rows[0].itemCode && rows[0].fromOrder === false && (
            <div style={{ padding: '10px 14px', background: '#ECFDF5', borderBottom: `1px solid ${BD}`,
              color: '#065F46', fontSize: 12, fontWeight: 500 }}>
              ✓ All items in this order have been fully dispatched. You can add manual rows if needed.
            </div>
          )}

          {hasOver && (
            <div style={{ padding: '8px 14px', background: '#FEF2F2', borderBottom: `1px solid #FECACA`,
              color: '#DC2626', fontSize: 12, fontWeight: 500 }}>
              ⚠ One or more items exceed available stock. Please correct quantities before saving.
            </div>
          )}

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, fontFamily: F }}>
              <thead>
                <tr style={{ background: '#FEF2F2' }}>
                  {[
                    '#', 'Item Code', 'Item Name', 'HSN',
                    ...(selectedOrder ? ['Actual Qty', 'Dispatched', 'Balance'] : []),
                    selectedOrder ? 'Now Dispatch' : 'Qty',
                    'Unit',
                    ...(fromType === 'store' ? ['From Location'] : []),
                    'In Stock', '',
                  ].map((h, i) => (
                    <th key={i} style={{
                      padding: '8px 10px', fontWeight: 700, fontSize: 11,
                      textAlign: ['Actual Qty', 'Dispatched', 'Balance', 'Now Dispatch', 'Qty', 'In Stock'].includes(h) ? 'right' : 'left',
                      borderBottom: `2px solid #FECACA`, borderRight: `1px solid ${BD}`,
                      whiteSpace: 'nowrap', color: '#7F1D1D',
                      background: h === 'Balance' ? '#FFFBEB' : h === 'Now Dispatch' || h === 'Qty' ? '#EEF4FF' : '#FEF2F2',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => {
                  const qty  = parseFloat(row.nowQty || row.qty || 0);
                  const over = row.itemCode && qty > 0 && row.availableStock > 0 && qty > row.availableStock;
                  return (
                    <tr key={i} style={{ background: over ? '#FFF5F5' : i % 2 === 0 ? '#fff' : '#FAFBFC',
                      borderBottom: `1px solid ${BD}` }}>
                      <td style={{ padding: '6px 10px', textAlign: 'center', color: '#9CA3AF',
                        width: 28, fontSize: 11 }}>{i + 1}</td>

                      <td style={{ padding: '4px 6px', width: 120 }}>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <input readOnly value={row.itemCode}
                            style={{ ...inp(true), width: 70, fontFamily: 'monospace', fontWeight: 700,
                              color: P, fontSize: 11, height: 28 }} />
                          <button onClick={() => openPopup(i)}
                            style={{ height: 28, padding: '0 8px', fontSize: 11, cursor: 'pointer',
                              background: '#EEF4FF', color: P, border: `1px solid ${BD}`,
                              borderRadius: 5, fontWeight: 600 }}>🔍</button>
                        </div>
                      </td>

                      <td style={{ padding: '4px 6px' }}>
                        <input value={row.itemName} onChange={e => setRow(i, 'itemName', e.target.value)}
                          readOnly={row.fromOrder}
                          style={{ ...inp(row.fromOrder), width: '100%', minWidth: 140, height: 28 }} />
                      </td>

                      <td style={{ padding: '4px 6px', width: 70 }}>
                        <input value={row.hsnCode} onChange={e => setRow(i, 'hsnCode', e.target.value)}
                          style={{ ...inp(), width: '100%', height: 28 }} />
                      </td>

                      {selectedOrder && (
                        <>
                          <td style={{ padding: '6px 10px', textAlign: 'right', width: 80,
                            color: '#6B7280', fontWeight: 600, fontSize: 11 }}>
                            {row.actualQty !== '' ? fmt(row.actualQty) : '—'}
                          </td>
                          <td style={{ padding: '6px 10px', textAlign: 'right', width: 80,
                            color: '#D97706', fontWeight: 600, fontSize: 11 }}>
                            {row.dispatchedQty !== '' ? fmt(row.dispatchedQty) : '—'}
                          </td>
                          <td style={{ padding: '6px 10px', textAlign: 'right', width: 80,
                            background: '#FFFBEB', fontWeight: 700, fontSize: 11,
                            color: (parseFloat(row.balanceQty) || 0) > 0 ? '#065F46' : '#DC2626' }}>
                            {row.balanceQty !== '' ? fmt(row.balanceQty) : '—'}
                          </td>
                        </>
                      )}

                      <td style={{ padding: '4px 6px', width: 90, background: '#EEF4FF' }}>
                        <input type="number" min="0" step="any"
                          value={selectedOrder ? (row.nowQty || '') : (row.qty || '')}
                          onChange={e => setRow(i, selectedOrder ? 'nowQty' : 'qty', e.target.value)}
                          style={{ ...inp(), width: '100%', textAlign: 'right', height: 28,
                            fontWeight: 700, borderColor: over ? '#FECACA' : BD }} />
                        {over && <div style={{ fontSize: 10, color: '#DC2626', whiteSpace: 'nowrap', marginTop: 2 }}>
                          ⚠ Over stock
                        </div>}
                      </td>

                      <td style={{ padding: '4px 6px', width: 60 }}>
                        <input value={row.unit} onChange={e => setRow(i, 'unit', e.target.value)}
                          style={{ ...inp(), width: '100%', height: 28 }} />
                      </td>

                      {fromType === 'store' && (
                        <td style={{ padding: '4px 6px', width: 150 }}>
                          <select value={row.fromLocation || dispatchFrom}
                            onChange={e => setRow(i, 'fromLocation', e.target.value)}
                            style={{ ...sel(), height: 28, fontSize: 11 }}>
                            {STORES.map(l => <option key={l} value={l}>{l}</option>)}
                          </select>
                        </td>
                      )}

                      <td style={{ padding: '6px 10px', textAlign: 'right', width: 90,
                        fontWeight: 700, fontSize: 11,
                        color: row.availableStock > 0 ? '#059669' : (row.itemCode ? '#DC2626' : '#9CA3AF') }}>
                        {row.itemCode ? `${fmt(row.availableStock)} ${row.unit}` : '—'}
                      </td>

                      <td style={{ padding: '4px 6px', width: 32, textAlign: 'center' }}>
                        <button onClick={() => removeRow(i)}
                          style={{ height: 28, width: 28, background: '#FEF2F2', border: `1px solid #FECACA`,
                            color: '#DC2626', borderRadius: 5, cursor: 'pointer', fontSize: 14 }}>✕</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Recent GDNs */}
        {recentGDNs.length > 0 && (
          <div style={card}>
            <SH color="#7C3AED">Recent GDNs (Last 10)</SH>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, fontFamily: F }}>
                <thead>
                  <tr style={{ background: '#F5F3FF' }}>
                    {['GDN No.', 'Date', 'From', 'Destination', 'Party', 'Order Ref', 'DC No.', 'Items', 'Vehicle', ''].map((h, i) => (
                      <th key={i} style={{ padding: '8px 10px', fontWeight: 700, textAlign: 'left',
                        borderBottom: `2px solid #DDD6FE`, whiteSpace: 'nowrap', fontSize: 11,
                        color: '#5B21B6' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {recentGDNs.map((g, i) => (
                    <tr key={g.txnId}
                      style={{ background: i % 2 === 0 ? '#fff' : '#FAFBFC', borderBottom: `1px solid ${BD}`,
                        transition: 'background 0.1s' }}
                      onMouseEnter={e => e.currentTarget.style.background = '#F5F3FF'}
                      onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? '#fff' : '#FAFBFC'}>
                      <td style={{ padding: '7px 10px', fontFamily: 'monospace', fontWeight: 700, color: '#7C3AED' }}>{g.gdnNo}</td>
                      <td style={{ padding: '7px 10px', color: '#374151' }}>{fmtD(g.date)}</td>
                      <td style={{ padding: '7px 10px', color: GH, fontWeight: 600 }}>
                        {g.fromType === 'vendor' ? (g.fromVendorName || 'Vendor') : (g.dispatchFrom || '—')}
                      </td>
                      <td style={{ padding: '7px 10px', color: '#374151' }}>
                        {DEST_TYPES.find(d => d.value === g.destinationType)?.label || g.destinationType || '—'}
                      </td>
                      <td style={{ padding: '7px 10px', fontWeight: 600, color: '#111827' }}>{g.partyName || '—'}</td>
                      <td style={{ padding: '7px 10px', fontFamily: 'monospace', fontSize: 11, color: '#6B7280' }}>
                        {g.orderRef || g.soRef || g.poRef || '—'}
                      </td>
                      <td style={{ padding: '7px 10px', color: '#374151' }}>{g.dcNo || '—'}</td>
                      <td style={{ padding: '7px 10px', textAlign: 'center' }}>
                        <span style={{ fontWeight: 700, color: '#7C3AED',
                          background: '#F5F3FF', padding: '2px 8px', borderRadius: 12,
                          border: '1px solid #DDD6FE' }}>{(g.items || []).length}</span>
                      </td>
                      <td style={{ padding: '7px 10px', color: '#374151' }}>{g.vehicleNo || '—'}</td>
                      <td style={{ padding: '5px 8px' }}>
                        <button onClick={() => handleDeleteGDN(g)}
                          style={{ padding: '2px 9px', fontSize: 10, cursor: 'pointer',
                            background: '#FEF2F2', color: '#DC2626',
                            border: '1px solid #FECACA', borderRadius: 4,
                            fontFamily: F, fontWeight: 700, whiteSpace: 'nowrap' }}>
                          🗑 Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Popups */}
      {showPopup === 'fromVendor' && (
        <SearchPopup title="Select FROM Vendor"
          columns={[{ key: 'vendorId', label: 'ID' }, { key: 'vendorName', label: 'Vendor Name', bold: true },
            { key: 'city', label: 'City' }, { key: 'gstin', label: 'GSTIN' }]}
          rows={vendors}
          searchKeys={['vendorName', 'vendorId', 'city', 'gstin']}
          onSelect={v => { handleFromVendorChange(String(v.vendorId)); }}
          onClose={() => setShowPopup(null)} />
      )}
      {showPopup === 'fromPO' && (
        <SearchPopup title="Select PO (From Vendor)"
          columns={[{ key: 'poNo', label: 'PO No.', bold: true }, { key: 'voucherNumber', label: 'Voucher' },
            { key: 'vendorName', label: 'Vendor' }, { key: 'poDate', label: 'Date' }]}
          rows={vendorPOs}
          searchKeys={['poNo', 'voucherNumber', 'vendorName']}
          onSelect={po => { handleFromPOChange(String(po.orderId || po.id || '')); }}
          onClose={() => setShowPopup(null)} />
      )}
      {showPopup === 'toParty' && (
        <SearchPopup title={`Select ${destType === 'client' ? 'Client' : 'Vendor'}`}
          columns={destType === 'client'
            ? [{ key: 'clientId', label: 'ID' }, { key: 'clientName', label: 'Name', bold: true },
               { key: 'city', label: 'City' }, { key: 'gstin', label: 'GSTIN' }]
            : [{ key: 'vendorId', label: 'ID' }, { key: 'vendorName', label: 'Name', bold: true },
               { key: 'city', label: 'City' }, { key: 'gstin', label: 'GSTIN' }]}
          rows={partyList}
          searchKeys={destType === 'client' ? ['clientName', 'clientId', 'city'] : ['vendorName', 'vendorId', 'city']}
          onSelect={p => { handlePartyChange(String(p[partyIdKey])); }}
          onClose={() => setShowPopup(null)} />
      )}
      {showPopup === 'toOrder' && (
        <SearchPopup title={orderType === 'so' ? 'Select Sales Order' : 'Select Purchase Order'}
          columns={[
            { key: orderType === 'so' ? 'orderNo' : 'poNo', label: 'Order No.', bold: true },
            { key: orderType === 'so' ? 'customerName' : 'vendorName', label: 'Party' },
            { key: 'orderDate', label: 'Date' },
          ]}
          rows={filteredOrders}
          searchKeys={orderType === 'so'
            ? ['orderNo', 'voucherNumber', 'customerName']
            : ['poNo', 'voucherNumber', 'vendorName']}
          onSelect={o => { handleOrderSelect(String(o.orderId || o.id || '')); }}
          onClose={() => setShowPopup(null)} />
      )}
      {showItemPopup && (
        <ItemPopup stockLevels={stockLevels} onSelect={selectItem} onClose={() => setShowItemPopup(false)} />
      )}
    </div>
  );
}
