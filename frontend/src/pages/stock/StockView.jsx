import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useCompany } from '../../context/CompanyContext';
import { withPrintFont } from '../../utils/printFont';

const P   = '#104f4f';
const BG  = '#F5F7FB';
const BD  = '#E5EAF2';
const F   = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const fmt = n => (parseFloat(n) || 0).toFixed(2);
const fmtD = d => {
  if (!d) return '—';
  const dt = new Date(d);
  return isNaN(dt) ? d : `${String(dt.getDate()).padStart(2, '0')}-${String(dt.getMonth() + 1).padStart(2, '0')}-${dt.getFullYear()}`;
};

const SOURCE_LABEL = {
  purchase: 'Purchase', client: 'Client Material', manufacturing: 'Manufacturing',
  'dc-return': 'DC Return', transfer: 'Transfer', other: 'Other', in: 'Stock In',
};
const DEST_LABEL = {
  client: 'Client Delivery', vendor: 'Vendor', factory: 'Factory',
  transfer: 'Transfer', manufacturing: 'Manufacturing', other: 'Other', out: 'Stock Out',
};

/* ── Delivery Challan Print Modal ── */
const ChallanModal = ({ record, type, company, onClose }) => {
  if (!record) return null;
  const isGRN  = type === 'grn';
  const accentColor = isGRN ? '#104f4f' : '#991B1B';
  const accentBg    = isGRN ? '#ECFDF5' : '#FEF2F2';
  const accentBd    = isGRN ? '#A7F3D0' : '#FECACA';
  const docNo  = isGRN ? record.grnNo  : record.gdnNo;
  const label  = isGRN ? 'GOODS RECEIPT NOTE (GRN)' : 'GOODS DELIVERY NOTE (GDN)';

  const handlePrint = () => {
    const win = window.open('', '_blank');
    win.document.write(withPrintFont(`
      <html><head><title>${label} - ${docNo}</title>
      <style>
        body { font-family: 'Arial', sans-serif; margin: 0; padding: 20px; color: #111; font-size: 12px; }
        h1 { font-size: 22px; margin: 0; } h2 { font-size: 14px; margin: 0; color: #444; }
        .header { display: flex; justify-content: space-between; align-items: flex-start;
          border-bottom: 2px solid #000; padding-bottom: 12px; margin-bottom: 16px; }
        .badge { display: inline-block; border: 2px solid ${accentColor}; color: ${accentColor};
          padding: 4px 14px; font-weight: 800; font-size: 13px; border-radius: 4px; margin-bottom: 4px; }
        .meta { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px;
          background: #f8f8f8; border: 1px solid #ddd; padding: 10px 14px;
          border-radius: 4px; margin-bottom: 16px; }
        .meta div { display: flex; flex-direction: column; }
        .meta label { font-size: 9px; font-weight: 700; color: #888; text-transform: uppercase; }
        .meta span { font-size: 12px; font-weight: 600; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
        th { background: ${accentColor}; color: #fff; padding: 7px 10px; text-align: left; font-size: 11px; }
        td { padding: 6px 10px; border-bottom: 1px solid #e5e5e5; font-size: 11px; }
        tr:nth-child(even) td { background: #fafafa; }
        .sigs { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; margin-top: 40px; }
        .sig { border-top: 1px solid #000; padding-top: 4px; font-size: 10px; color: #555; text-align: center; }
        @media print { body { margin: 0; } }
      </style></head><body>
      <div class="header">
        <div>
          <h1>${company?.companyName || 'Company Name'}</h1>
          <h2>${company?.address || ''}</h2>
          <div style="font-size:11px;color:#666;margin-top:4px;">
            ${company?.gstin ? 'GSTIN: ' + company.gstin : ''}
            ${company?.phone ? ' | Ph: ' + company.phone : ''}
          </div>
        </div>
        <div style="text-align:right">
          <div class="badge">${label}</div>
          <div style="font-size:13px;font-weight:800;">${docNo || '—'}</div>
          <div style="font-size:11px;color:#555;">Date: ${fmtD(record.date)}</div>
        </div>
      </div>
      <div class="meta">
        <div><label>${isGRN ? 'Source Type' : 'Destination Type'}</label>
          <span>${isGRN ? (SOURCE_LABEL[record.sourceType] || record.sourceType || '—') : (DEST_LABEL[record.destinationType] || record.destinationType || '—')}</span></div>
        <div><label>Party / Name</label><span>${record.partyName || '—'}</span></div>
        <div><label>${isGRN ? 'PO Reference' : 'SO Reference'}</label><span>${(isGRN ? record.poRef : record.soRef) || '—'}</span></div>
        <div><label>DC No.</label><span>${record.dcNo || '—'}</span></div>
        <div><label>Vehicle No.</label><span>${record.vehicleNo || '—'}</span></div>
        <div><label>Remarks</label><span>${record.remarks || '—'}</span></div>
      </div>
      <table>
        <thead><tr>
          <th>#</th><th>Item Code</th><th>Item Name</th><th>Qty</th><th>Unit</th>
          <th>Location</th>${isGRN ? '<th>Rate</th>' : ''}
        </tr></thead>
        <tbody>
          ${(record.items || []).map((it, j) => `
            <tr>
              <td>${j + 1}</td>
              <td style="font-family:monospace">${it.itemCode || '—'}</td>
              <td>${it.itemName || '—'}</td>
              <td><strong>${fmt(it.qty)}</strong></td>
              <td>${it.unit || ''}</td>
              <td>${it.location || '—'}</td>
              ${isGRN ? `<td>${it.rate ? '₹' + fmt(it.rate) : '—'}</td>` : ''}
            </tr>
          `).join('')}
        </tbody>
      </table>
      <div class="sigs">
        <div class="sig">Prepared By</div>
        <div class="sig">${isGRN ? 'Received By' : 'Dispatched By'}</div>
        <div class="sig">Authorized By</div>
      </div>
      <script>window.onload=()=>{window.print();window.close();}</script>
      </body></html>
    `));
    win.document.close();
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(15,23,42,0.45)', backdropFilter: 'blur(2px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={onClose}>
      <div style={{
        background: '#fff', borderRadius: 12, width: 680, maxHeight: '88vh',
        overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.22)',
        display: 'flex', flexDirection: 'column', fontFamily: F,
      }} onClick={e => e.stopPropagation()}>

        {/* Modal Header */}
        <div style={{
          background: `linear-gradient(135deg, ${accentColor}, ${isGRN ? '#14532D' : '#7F1D1D'})`,
          padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#fff', textTransform: 'uppercase', letterSpacing: '0.6px' }}>{label}</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', marginTop: 2 }}>
              {docNo} &nbsp;|&nbsp; {fmtD(record.date)}
            </div>
          </div>
          <button onClick={onClose} style={{
            background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)',
            color: '#fff', borderRadius: 6, width: 28, height: 28, cursor: 'pointer', fontSize: 14,
          }}>✕</button>
        </div>

        {/* Body */}
        <div style={{ overflowY: 'auto', padding: 20, flex: 1 }}>

          {/* Meta Grid */}
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px 16px',
            background: accentBg, border: `1px solid ${accentBd}`,
            borderRadius: 8, padding: '12px 16px', marginBottom: 16,
          }}>
            {[
              [isGRN ? 'Source Type' : 'Destination', isGRN ? (SOURCE_LABEL[record.sourceType] || record.sourceType) : (DEST_LABEL[record.destinationType] || record.destinationType)],
              ['Party', record.partyName],
              [isGRN ? 'PO Ref' : 'SO Ref', isGRN ? record.poRef : record.soRef],
              ['DC No.', record.dcNo],
              ['Vehicle No.', record.vehicleNo],
              ['Remarks', record.remarks],
            ].map(([lbl, val]) => (
              <div key={lbl} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontSize: 9, fontWeight: 700, color: accentColor, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{lbl}</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#111827' }}>{val || '—'}</span>
              </div>
            ))}
          </div>

          {/* Items Table */}
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: accentColor }}>
                {['#', 'Item Code', 'Item Name', 'Qty', 'Unit', 'Location', ...(isGRN ? ['Rate'] : [])].map(h => (
                  <th key={h} style={{ padding: '7px 10px', color: '#fff', fontWeight: 700, textAlign: 'left', fontSize: 11 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(record.items || []).map((it, j) => (
                <tr key={j} style={{ background: j % 2 === 0 ? '#fff' : accentBg }}>
                  <td style={{ padding: '6px 10px', color: '#94A3B8' }}>{j + 1}</td>
                  <td style={{ padding: '6px 10px', fontFamily: 'monospace', color: P, fontWeight: 700 }}>{it.itemCode}</td>
                  <td style={{ padding: '6px 10px', fontWeight: 600 }}>{it.itemName}</td>
                  <td style={{ padding: '6px 10px', fontWeight: 800, color: accentColor }}>{fmt(it.qty)}</td>
                  <td style={{ padding: '6px 10px', color: '#6B7280' }}>{it.unit}</td>
                  <td style={{ padding: '6px 10px' }}>{it.location || '—'}</td>
                  {isGRN && <td style={{ padding: '6px 10px' }}>{it.rate ? `₹${fmt(it.rate)}` : '—'}</td>}
                </tr>
              ))}
            </tbody>
          </table>

          {/* Signature Area */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 20, marginTop: 32 }}>
            {['Prepared By', isGRN ? 'Received By' : 'Dispatched By', 'Authorized By'].map(s => (
              <div key={s} style={{ borderTop: `2px solid #CBD5E1`, paddingTop: 4, textAlign: 'center', fontSize: 10, color: '#94A3B8', fontWeight: 600 }}>
                {s}
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: '10px 20px', borderTop: `1px solid ${BD}`, background: BG,
          display: 'flex', justifyContent: 'flex-end', gap: 8,
        }}>
          <button onClick={onClose} style={{
            padding: '6px 16px', fontSize: 12, fontFamily: F, fontWeight: 600,
            background: '#fff', border: `1px solid ${BD}`, color: '#475569',
            borderRadius: 6, cursor: 'pointer',
          }}>Close</button>
          <button onClick={handlePrint} style={{
            padding: '6px 16px', fontSize: 12, fontFamily: F, fontWeight: 600,
            background: accentColor, border: 'none', color: '#fff',
            borderRadius: 6, cursor: 'pointer',
          }}>🖨 Print Challan</button>
        </div>
      </div>
    </div>
  );
};

/* ── Main Component ── */
export default function StockView() {
  const { selectedCompany } = useCompany();
  const cid = selectedCompany?.companyId;

  const [tab,         setTab]         = useState('stock');
  const [levels,      setLevels]      = useState([]);
  const [grns,        setGRNs]        = useState([]);
  const [gdns,        setGDNs]        = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState('');
  const [message,     setMessage]     = useState('');
  const [search,      setSearch]      = useState('');
  const [expanded,    setExpanded]    = useState({});
  const [selectedGRN, setSelectedGRN] = useState(new Set());
  const [selectedGDN, setSelectedGDN] = useState(new Set());
  const [challan,     setChallan]     = useState(null);   // { record, type }
  const [deleting,    setDeleting]    = useState(false);

  const load = useCallback(async () => {
    if (!cid) return;
    setLoading(true); setError('');
    try {
      const [lvlRes, grnRes, gdnRes] = await Promise.all([
        axios.get(`/api/stock/levels?companyId=${cid}`),
        axios.get(`/api/stock/grn?companyId=${cid}`),
        axios.get(`/api/stock/gdn?companyId=${cid}`),
      ]);
      setLevels(lvlRes.data);
      setGRNs(grnRes.data);
      setGDNs(gdnRes.data);
    } catch (e) { setError(e.response?.data?.error || e.message); }
    finally { setLoading(false); }
  }, [cid]);

  useEffect(() => { load(); }, [load]);

  /* GRN selection helpers */
  const toggleGRN = (id) => setSelectedGRN(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const toggleAllGRN = () => {
    if (selectedGRN.size === grns.length) setSelectedGRN(new Set());
    else setSelectedGRN(new Set(grns.map(g => g.txnId)));
  };

  /* GDN selection helpers */
  const toggleGDN = (id) => setSelectedGDN(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const toggleAllGDN = () => {
    if (selectedGDN.size === gdns.length) setSelectedGDN(new Set());
    else setSelectedGDN(new Set(gdns.map(g => g.txnId)));
  };

  /* Delete selected GRNs */
  const deleteSelectedGRN = async () => {
    if (!window.confirm(`Delete ${selectedGRN.size} selected GRN${selectedGRN.size > 1 ? 's' : ''}? Stock levels will be recalculated. This cannot be undone.`)) return;
    setDeleting(true);
    try {
      await Promise.all([...selectedGRN].map(id => axios.delete(`/api/stock/transactions/${id}?companyId=${cid}`)));
      setMessage(`${selectedGRN.size} GRN${selectedGRN.size > 1 ? 's' : ''} deleted.`);
      setSelectedGRN(new Set());
      load();
    } catch (e) { setMessage('Error: ' + (e.response?.data?.error || e.message)); }
    finally { setDeleting(false); }
  };

  /* Delete selected GDNs */
  const deleteSelectedGDN = async () => {
    if (!window.confirm(`Delete ${selectedGDN.size} selected GDN${selectedGDN.size > 1 ? 's' : ''}? Stock levels will be recalculated. This cannot be undone.`)) return;
    setDeleting(true);
    try {
      await Promise.all([...selectedGDN].map(id => axios.delete(`/api/stock/transactions/${id}?companyId=${cid}`)));
      setMessage(`${selectedGDN.size} GDN${selectedGDN.size > 1 ? 's' : ''} deleted.`);
      setSelectedGDN(new Set());
      load();
    } catch (e) { setMessage('Error: ' + (e.response?.data?.error || e.message)); }
    finally { setDeleting(false); }
  };

  const filteredLevels = levels.filter(l => {
    const q = search.toLowerCase();
    return !q || String(l.itemCode).includes(q) || (l.itemName || '').toLowerCase().includes(q);
  });

  const toggle = (key) => setExpanded(p => ({ ...p, [key]: !p[key] }));

  const totalItems   = filteredLevels.length;
  const inStockItems = filteredLevels.filter(l => l.currentStock > 0).length;
  const outOfStock   = filteredLevels.filter(l => l.currentStock <= 0).length;

  const th = (color = P) => ({
    padding: '8px 10px', color: '#fff', fontWeight: 700, textAlign: 'left',
    fontSize: 11, whiteSpace: 'nowrap', background: color, borderRight: `1px solid rgba(255,255,255,0.1)`,
  });
  const td = { padding: '7px 10px', borderBottom: `1px solid ${BD}`, fontSize: 12, fontFamily: F };

  const TABS = [
    { key: 'stock', label: 'Current Stock' },
    { key: 'grn',   label: `GRN History (${grns.length})` },
    { key: 'gdn',   label: `GDN History (${gdns.length})` },
  ];

  /* Selection toolbar for GRN/GDN */
  const SelectionBar = ({ count, type, onViewChallan, onDelete, onClear, record }) => {
    if (count === 0) return null;
    const isGRN   = type === 'grn';
    const accent  = isGRN ? '#104f4f' : '#991B1B';
    const accentBg = isGRN ? '#ECFDF5' : '#FEF2F2';
    const accentBd = isGRN ? '#A7F3D0' : '#FECACA';
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        background: accentBg, border: `1px solid ${accentBd}`,
        borderRadius: 6, padding: '6px 12px', margin: '8px 14px 0',
      }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: accent }}>{count} selected</span>
        {count === 1 && (
          <button onClick={onViewChallan} style={{
            padding: '3px 12px', fontSize: 11, fontFamily: F, fontWeight: 700,
            background: '#EEF4FF', border: '1px solid #BFDBFE', color: '#104f4f',
            borderRadius: 4, cursor: 'pointer',
          }}>📄 View Delivery Challan</button>
        )}
        <button onClick={onDelete} disabled={deleting} style={{
          padding: '3px 12px', fontSize: 11, fontFamily: F, fontWeight: 700,
          background: '#FEE2E2', border: '1px solid #FCA5A5', color: '#991B1B',
          borderRadius: 4, cursor: 'pointer',
        }}>🗑 Delete {count > 1 ? `${count} entries` : 'entry'}</button>
        <button onClick={onClear} style={{
          background: 'none', border: 'none', color: accent,
          cursor: 'pointer', fontSize: 13, marginLeft: 'auto', padding: 0,
        }}>✕ Clear</button>
      </div>
    );
  };

  return (
    <div style={{ background: BG, minHeight: '100%', fontFamily: F }}>

      {/* Challan Modal */}
      {challan && (
        <ChallanModal
          record={challan.record}
          type={challan.type}
          company={selectedCompany}
          onClose={() => setChallan(null)}
        />
      )}

      {/* Page Header */}
      <div style={{ background: P, padding: '14px 20px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', fontWeight: 500,
            textTransform: 'uppercase', letterSpacing: '0.6px' }}>Inventory</div>
          <div style={{ fontSize: 15, fontWeight: 800, color: '#fff', letterSpacing: '-0.2px' }}>
            Stock — Inventory & Movement
          </div>
        </div>
        <button onClick={load}
          style={{ height: 32, padding: '0 14px', fontSize: 12, fontFamily: F, cursor: 'pointer',
            background: 'rgba(255,255,255,0.12)', color: '#fff',
            border: '1px solid rgba(255,255,255,0.25)', borderRadius: 6, fontWeight: 600 }}>
          ↻ Refresh
        </button>
      </div>

      {error && (
        <div style={{ margin: '10px 16px 0', padding: '8px 14px', fontSize: 12, fontFamily: F,
          background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA', borderRadius: 6 }}>
          Error: {error}
        </div>
      )}
      {message && (
        <div style={{
          margin: '10px 16px 0', padding: '8px 14px', fontSize: 12, fontFamily: F,
          background: message.includes('Error') ? '#FEF2F2' : '#ECFDF5',
          color: message.includes('Error') ? '#DC2626' : '#065F46',
          border: `1px solid ${message.includes('Error') ? '#FECACA' : '#A7F3D0'}`,
          borderRadius: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span>{message}</span>
          <button onClick={() => setMessage('')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14 }}>✕</button>
        </div>
      )}

      {/* KPI Strip */}
      <div style={{ background: '#fff', borderBottom: `1px solid ${BD}`, padding: '12px 20px',
        display: 'flex', gap: 20 }}>
        {[
          { label: 'Total Items',   val: totalItems,   color: P,        bg: '#EEF4FF', bd: '#BFDBFE' },
          { label: 'In Stock',      val: inStockItems,  color: '#059669', bg: '#ECFDF5', bd: '#A7F3D0' },
          { label: 'Out of Stock',  val: outOfStock,    color: '#DC2626', bg: '#FEF2F2', bd: '#FECACA' },
          { label: 'GRN Entries',   val: grns.length,   color: '#059669', bg: '#ECFDF5', bd: '#A7F3D0' },
          { label: 'GDN Entries',   val: gdns.length,   color: '#7C3AED', bg: '#F5F3FF', bd: '#DDD6FE' },
        ].map(c => (
          <div key={c.label} style={{ background: c.bg, border: `1px solid ${c.bd}`,
            borderRadius: 8, padding: '8px 16px', minWidth: 110, textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: c.color, fontWeight: 600, textTransform: 'uppercase',
              letterSpacing: '0.4px', marginBottom: 2 }}>{c.label}</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: c.color }}>{c.val}</div>
          </div>
        ))}
      </div>

      <div style={{ padding: '12px 16px' }}>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 0,
          borderBottom: `2px solid ${BD}`, paddingBottom: 0 }}>
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              style={{ padding: '8px 18px', fontSize: 12, fontFamily: F, cursor: 'pointer',
                fontWeight: tab === t.key ? 700 : 500, border: 'none',
                borderRadius: '7px 7px 0 0',
                background: tab === t.key ? '#fff' : 'transparent',
                color: tab === t.key ? P : '#6B7280',
                borderBottom: tab === t.key ? `2px solid ${P}` : '2px solid transparent',
                marginBottom: -2, transition: 'all 0.15s' }}>
              {t.label}
            </button>
          ))}
        </div>

        <div style={{ background: '#fff', border: `1px solid ${BD}`, borderTop: 'none',
          borderRadius: '0 0 10px 10px', overflow: 'hidden',
          boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>

          {/* ── Current Stock Tab ── */}
          {tab === 'stock' && (
            <>
              <div style={{ background: BG, padding: '10px 14px', display: 'flex', gap: 8,
                alignItems: 'center', borderBottom: `1px solid ${BD}` }}>
                <input value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Search item code / name…"
                  style={{ height: 32, padding: '0 10px', border: `1px solid ${BD}`, borderRadius: 6,
                    fontSize: 12, fontFamily: F, outline: 'none', width: 240, background: '#fff' }} />
                {search && (
                  <button onClick={() => setSearch('')}
                    style={{ height: 32, padding: '0 12px', fontSize: 12, cursor: 'pointer',
                      background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA',
                      borderRadius: 6, fontWeight: 600 }}>✕ Clear</button>
                )}
                <span style={{ marginLeft: 'auto', fontSize: 12, color: '#6B7280' }}>
                  {filteredLevels.length} item{filteredLevels.length !== 1 ? 's' : ''}
                </span>
              </div>

              {loading ? (
                <div style={{ padding: 40, textAlign: 'center', color: '#9CA3AF', fontSize: 14 }}>
                  Loading stock data…
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, fontFamily: F }}>
                    <thead>
                      <tr>
                        {['', 'Item Code', 'Item Name', 'Unit', 'Total Received (GRN)', 'Total Issued (GDN)', 'Current Stock'].map((h, i) => (
                          <th key={i} style={{ ...th(P), textAlign: i >= 4 ? 'right' : 'left' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredLevels.length === 0 && (
                        <tr><td colSpan={7}
                          style={{ padding: 30, textAlign: 'center', color: '#9CA3AF', fontSize: 13 }}>
                          No stock records. Use GRN to receive materials.
                        </td></tr>
                      )}
                      {filteredLevels.map((l, i) => {
                        const isOut  = l.currentStock <= 0;
                        const hasLocs = l.locationBreakdown?.length > 1;
                        const isExp  = expanded[l.itemCode];
                        return [
                          <tr key={l.itemCode}
                            onClick={() => hasLocs && toggle(l.itemCode)}
                            style={{ background: isOut ? '#FFF5F5' : i % 2 === 0 ? '#fff' : '#FAFBFC',
                              cursor: hasLocs ? 'pointer' : 'default', transition: 'background 0.1s' }}
                            onMouseEnter={e => { if (!isOut) e.currentTarget.style.background = '#EEF4FF'; }}
                            onMouseLeave={e => e.currentTarget.style.background = isOut ? '#FFF5F5' : i % 2 === 0 ? '#fff' : '#FAFBFC'}>
                            <td style={{ ...td, textAlign: 'center', width: 20, color: '#9CA3AF', fontSize: 10 }}>
                              {hasLocs ? (isExp ? '▼' : '▶') : null}
                            </td>
                            <td style={{ ...td, fontFamily: 'monospace', fontWeight: 700, color: P }}>{l.itemCode}</td>
                            <td style={{ ...td, fontWeight: 600, color: '#111827' }}>{l.itemName}</td>
                            <td style={{ ...td, color: '#6B7280' }}>{l.unit}</td>
                            <td style={{ ...td, textAlign: 'right', color: '#059669', fontWeight: 600 }}>{fmt(l.totalIn)}</td>
                            <td style={{ ...td, textAlign: 'right', color: '#DC2626', fontWeight: 600 }}>{fmt(l.totalOut)}</td>
                            <td style={{ ...td, textAlign: 'right', fontWeight: 800, fontSize: 13,
                              color: isOut ? '#DC2626' : '#059669' }}>
                              {isOut ? '⚠ ' : ''}{fmt(l.currentStock)}
                            </td>
                          </tr>,
                          isExp && l.locationBreakdown?.map((lb, j) => (
                            <tr key={`${l.itemCode}-${j}`} style={{ background: '#EEF4FF' }}>
                              <td style={{ borderBottom: `1px solid ${BD}` }} />
                              <td colSpan={2} style={{ padding: '5px 10px 5px 28px', borderBottom: `1px solid ${BD}`,
                                fontSize: 11, color: '#6B7280' }}>
                                📍 {lb.location}
                              </td>
                              <td style={{ ...td, fontSize: 11 }}>{l.unit}</td>
                              <td style={{ ...td, textAlign: 'right', fontSize: 11, color: '#059669' }}>{fmt(lb.totalIn)}</td>
                              <td style={{ ...td, textAlign: 'right', fontSize: 11, color: '#DC2626' }}>{fmt(lb.totalOut)}</td>
                              <td style={{ ...td, textAlign: 'right', fontSize: 11, fontWeight: 700,
                                color: lb.currentStock <= 0 ? '#DC2626' : '#059669' }}>{fmt(lb.currentStock)}</td>
                            </tr>
                          )),
                        ];
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {/* ── GRN History Tab ── */}
          {tab === 'grn' && (
            <>
              <SelectionBar
                count={selectedGRN.size}
                type="grn"
                onViewChallan={() => {
                  const id  = [...selectedGRN][0];
                  const rec = grns.find(g => g.txnId === id);
                  if (rec) setChallan({ record: rec, type: 'grn' });
                }}
                onDelete={deleteSelectedGRN}
                onClear={() => setSelectedGRN(new Set())}
              />
              <div style={{ overflowX: 'auto' }}>
                {grns.length === 0
                  ? <div style={{ padding: 40, textAlign: 'center', color: '#9CA3AF', fontSize: 13 }}>No GRN records yet.</div>
                  : <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, fontFamily: F }}>
                      <thead>
                        <tr>
                          <th style={{ ...th('#104f4f'), width: 36, textAlign: 'center' }}>
                            <input
                              type="checkbox"
                              checked={selectedGRN.size === grns.length && grns.length > 0}
                              onChange={toggleAllGRN}
                              style={{ cursor: 'pointer', accentColor: '#fff' }}
                            />
                          </th>
                          {['GRN No.', 'Date', 'Source', 'Party', 'PO Ref', 'DC No.', 'Vehicle', 'Items', 'Actions'].map(h => (
                            <th key={h} style={th('#104f4f')}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {grns.map((g, i) => {
                          const isSel = selectedGRN.has(g.txnId);
                          const rowBg = isSel ? '#ECFDF5' : (i % 2 === 0 ? '#fff' : '#FAFBFC');
                          return [
                            <tr key={g.txnId}
                              style={{ background: rowBg, transition: 'background 0.1s' }}
                              onMouseEnter={e => { if (!isSel) e.currentTarget.style.background = '#F0FDF4'; }}
                              onMouseLeave={e => { if (!isSel) e.currentTarget.style.background = rowBg; }}>
                              {/* Checkbox */}
                              <td style={{ ...td, textAlign: 'center', width: 36 }} onClick={e => e.stopPropagation()}>
                                <input
                                  type="checkbox"
                                  checked={isSel}
                                  onChange={() => toggleGRN(g.txnId)}
                                  style={{ cursor: 'pointer', accentColor: '#104f4f' }}
                                />
                              </td>
                              <td style={{ ...td, fontFamily: 'monospace', fontWeight: 700, color: '#104f4f' }}>{g.grnNo}</td>
                              <td style={td}>{fmtD(g.date)}</td>
                              <td style={td}>{SOURCE_LABEL[g.sourceType] || g.sourceType}</td>
                              <td style={{ ...td, fontWeight: 600 }}>{g.partyName || '—'}</td>
                              <td style={{ ...td, fontFamily: 'monospace', fontSize: 11, color: '#6B7280' }}>{g.poRef || '—'}</td>
                              <td style={td}>{g.dcNo || '—'}</td>
                              <td style={td}>{g.vehicleNo || '—'}</td>
                              <td style={{ ...td, textAlign: 'center' }}>
                                <span
                                  onClick={() => toggle(`grn-${g.txnId}`)}
                                  style={{ fontWeight: 700, color: '#104f4f', cursor: 'pointer',
                                    background: '#ECFDF5', padding: '2px 8px', borderRadius: 12,
                                    border: '1px solid #A7F3D0' }}>
                                  {(g.items || []).length} {expanded[`grn-${g.txnId}`] ? '▼' : '▶'}
                                </span>
                              </td>
                              <td style={{ ...td, textAlign: 'center', whiteSpace: 'nowrap' }} onClick={e => e.stopPropagation()}>
                                <button
                                  onClick={() => setChallan({ record: g, type: 'grn' })}
                                  style={{
                                    padding: '2px 8px', fontSize: 11, fontFamily: F, fontWeight: 600,
                                    background: '#EEF4FF', border: '1px solid #BFDBFE', color: '#104f4f',
                                    borderRadius: 4, cursor: 'pointer',
                                  }}>📄 Challan</button>
                              </td>
                            </tr>,
                            expanded[`grn-${g.txnId}`] && (
                              <tr key={`grn-detail-${g.txnId}`}>
                                <td colSpan={10} style={{ padding: 0, background: '#F0FDF4' }}>
                                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                                    <thead>
                                      <tr style={{ background: '#DCFCE7' }}>
                                        {['Item Code', 'Item Name', 'Qty', 'Unit', 'Location', 'Rate'].map(h => (
                                          <th key={h} style={{ padding: '6px 10px', fontWeight: 700,
                                            textAlign: 'left', color: '#104f4f', fontSize: 11 }}>{h}</th>
                                        ))}
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {(g.items || []).map((it, j) => (
                                        <tr key={j} style={{ background: j % 2 === 0 ? '#F0FDF4' : '#ECFDF5' }}>
                                          <td style={{ padding: '5px 10px', fontFamily: 'monospace', color: P }}>{it.itemCode}</td>
                                          <td style={{ padding: '5px 10px' }}>{it.itemName}</td>
                                          <td style={{ padding: '5px 10px', fontWeight: 700, color: '#059669' }}>{fmt(it.qty)}</td>
                                          <td style={{ padding: '5px 10px', color: '#6B7280' }}>{it.unit}</td>
                                          <td style={{ padding: '5px 10px' }}>{it.location}</td>
                                          <td style={{ padding: '5px 10px' }}>{it.rate ? `₹${fmt(it.rate)}` : '—'}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </td>
                              </tr>
                            ),
                          ];
                        })}
                      </tbody>
                    </table>
                }
              </div>
            </>
          )}

          {/* ── GDN History Tab ── */}
          {tab === 'gdn' && (
            <>
              <SelectionBar
                count={selectedGDN.size}
                type="gdn"
                onViewChallan={() => {
                  const id  = [...selectedGDN][0];
                  const rec = gdns.find(g => g.txnId === id);
                  if (rec) setChallan({ record: rec, type: 'gdn' });
                }}
                onDelete={deleteSelectedGDN}
                onClear={() => setSelectedGDN(new Set())}
              />
              <div style={{ overflowX: 'auto' }}>
                {gdns.length === 0
                  ? <div style={{ padding: 40, textAlign: 'center', color: '#9CA3AF', fontSize: 13 }}>No GDN records yet.</div>
                  : <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, fontFamily: F }}>
                      <thead>
                        <tr>
                          <th style={{ ...th('#DC2626'), width: 36, textAlign: 'center' }}>
                            <input
                              type="checkbox"
                              checked={selectedGDN.size === gdns.length && gdns.length > 0}
                              onChange={toggleAllGDN}
                              style={{ cursor: 'pointer', accentColor: '#fff' }}
                            />
                          </th>
                          {['GDN No.', 'Date', 'Destination', 'Party', 'SO Ref', 'DC No.', 'Vehicle', 'Items', 'Actions'].map(h => (
                            <th key={h} style={th('#DC2626')}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {gdns.map((g, i) => {
                          const isSel = selectedGDN.has(g.txnId);
                          const rowBg = isSel ? '#FEF2F2' : (i % 2 === 0 ? '#fff' : '#FAFBFC');
                          return [
                            <tr key={g.txnId}
                              style={{ background: rowBg, transition: 'background 0.1s' }}
                              onMouseEnter={e => { if (!isSel) e.currentTarget.style.background = '#FFF5F5'; }}
                              onMouseLeave={e => { if (!isSel) e.currentTarget.style.background = rowBg; }}>
                              {/* Checkbox */}
                              <td style={{ ...td, textAlign: 'center', width: 36 }} onClick={e => e.stopPropagation()}>
                                <input
                                  type="checkbox"
                                  checked={isSel}
                                  onChange={() => toggleGDN(g.txnId)}
                                  style={{ cursor: 'pointer', accentColor: '#DC2626' }}
                                />
                              </td>
                              <td style={{ ...td, fontFamily: 'monospace', fontWeight: 700, color: '#DC2626' }}>{g.gdnNo}</td>
                              <td style={td}>{fmtD(g.date)}</td>
                              <td style={td}>{DEST_LABEL[g.destinationType] || g.destinationType}</td>
                              <td style={{ ...td, fontWeight: 600 }}>{g.partyName || '—'}</td>
                              <td style={{ ...td, fontFamily: 'monospace', fontSize: 11, color: '#6B7280' }}>{g.soRef || '—'}</td>
                              <td style={td}>{g.dcNo || '—'}</td>
                              <td style={td}>{g.vehicleNo || '—'}</td>
                              <td style={{ ...td, textAlign: 'center' }}>
                                <span
                                  onClick={() => toggle(`gdn-${g.txnId}`)}
                                  style={{ fontWeight: 700, color: '#DC2626', cursor: 'pointer',
                                    background: '#FEF2F2', padding: '2px 8px', borderRadius: 12,
                                    border: '1px solid #FECACA' }}>
                                  {(g.items || []).length} {expanded[`gdn-${g.txnId}`] ? '▼' : '▶'}
                                </span>
                              </td>
                              <td style={{ ...td, textAlign: 'center', whiteSpace: 'nowrap' }} onClick={e => e.stopPropagation()}>
                                <button
                                  onClick={() => setChallan({ record: g, type: 'gdn' })}
                                  style={{
                                    padding: '2px 8px', fontSize: 11, fontFamily: F, fontWeight: 600,
                                    background: '#EEF4FF', border: '1px solid #BFDBFE', color: '#104f4f',
                                    borderRadius: 4, cursor: 'pointer',
                                  }}>📄 Challan</button>
                              </td>
                            </tr>,
                            expanded[`gdn-${g.txnId}`] && (
                              <tr key={`gdn-detail-${g.txnId}`}>
                                <td colSpan={10} style={{ padding: 0, background: '#FEF2F2' }}>
                                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                                    <thead>
                                      <tr style={{ background: '#FECACA' }}>
                                        {['Item Code', 'Item Name', 'Qty', 'Unit', 'Location'].map(h => (
                                          <th key={h} style={{ padding: '6px 10px', fontWeight: 700,
                                            textAlign: 'left', color: '#7F1D1D', fontSize: 11 }}>{h}</th>
                                        ))}
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {(g.items || []).map((it, j) => (
                                        <tr key={j} style={{ background: j % 2 === 0 ? '#FFF5F5' : '#FEF2F2' }}>
                                          <td style={{ padding: '5px 10px', fontFamily: 'monospace', color: P }}>{it.itemCode}</td>
                                          <td style={{ padding: '5px 10px' }}>{it.itemName}</td>
                                          <td style={{ padding: '5px 10px', fontWeight: 700, color: '#DC2626' }}>{fmt(it.qty)}</td>
                                          <td style={{ padding: '5px 10px', color: '#6B7280' }}>{it.unit}</td>
                                          <td style={{ padding: '5px 10px' }}>{it.location}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </td>
                              </tr>
                            ),
                          ];
                        })}
                      </tbody>
                    </table>
                }
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
