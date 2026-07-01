import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCompany } from '../../context/CompanyContext';

const F = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const BLUE = '#2F6FED';
const fmtN = n => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtD = v => { if (!v) return '—'; const d = new Date(v); return isNaN(d) ? v : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }); };
const normName = s => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();

/* Match a PO item name against an SO item name (fuzzy) */
const namesMatch = (poName, soName) => {
  const a = normName(poName), b = normName(soName);
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
};

/* Pill badge */
function Pill({ label, bg, color, border }) {
  return (
    <span style={{
      padding: '2px 9px', borderRadius: 30, fontSize: 10, fontWeight: 700,
      background: bg, color, border: `1px solid ${border}`,
      fontFamily: F, whiteSpace: 'nowrap', letterSpacing: 0.3,
    }}>
      {label}
    </span>
  );
}

function PendingPill({ qty }) {
  if (qty <= 0) return <Pill label="✓ Covered" bg="#d4edda" color="#155724" border="#c3e6cb" />;
  return <Pill label={`${qty} Pending`} bg="#fff3cd" color="#856404" border="#ffc107" />;
}

export default function POTrackingView() {
  const { selectedCompany } = useCompany();
  const navigate = useNavigate();
  const cid = selectedCompany?.companyId;

  const [salesOrders, setSalesOrders] = useState([]);
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState({});
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    if (!cid) { setLoading(false); return; }
    setLoading(true);
    try {
      const [soRes, poRes] = await Promise.all([
        fetch(`/api/sales-orders?companyId=${cid}`),
        fetch(`/api/purchase-orders?companyId=${cid}`),
      ]);
      const sos = await soRes.json();
      const pos = await poRes.json();
      const soArr = Array.isArray(sos) ? sos : [];
      setSalesOrders(soArr);
      setPurchaseOrders(Array.isArray(pos) ? pos : []);
      /* expand all rows by default */
      const allExpanded = {};
      soArr.forEach(s => { allExpanded[s.orderId] = true; });
      setExpanded(allExpanded);
    } catch { }
    setLoading(false);
  }, [cid]);

  useEffect(() => { load(); }, [load]);

  const toggleExpand = id => setExpanded(p => ({ ...p, [id]: !p[id] }));

  /* ── Build tracking rows ── */
  const trackingData = salesOrders.map(so => {
    const soId = so.orderId;
    const linkedPOs = purchaseOrders.filter(po =>
      po.linkedSalesOrderId === soId || po.linkedSalesOrderId === String(soId)
    );

    const soMaterials = (so.items || []).map(it => ({
      name:  it.material || it.itemName || it.description || '—',
      code:  it.itemCode || it.code || '',
      qty:   parseFloat(it.qty || it.requiredQty || it.quantity) || 0,
      unit:  it.unit || '',
      hsn:   it.hsnCode || '',
      type:  'material',
    }));

    const soAddons = (so.addons || []).map(a => ({
      name:  a.itemName || a.description || a.name || '—',
      code:  a.itemCode || '',
      qty:   parseFloat(a.qty) || 0,
      unit:  a.unit || '',
      hsn:   a.hsnCode || '',
      type:  'addon',
    }));

    const allItems = [...soMaterials, ...soAddons];

    const rows = allItems.map(item => {
      /* Find matching PO items across all linked POs */
      const poHits = [];
      linkedPOs.forEach(po => {
        (po.items || []).forEach(poi => {
          const poName = poi.itemName || poi.description || '';
          if (namesMatch(poName, item.name) || namesMatch(poi.itemCode || '', item.code)) {
            poHits.push({
              poId:       po.orderId,
              poNo:       po.poNumber || po.poNo || po.voucherNumber || po.orderId,
              poStatus:   po.status || 'draft',
              vendorName: po.vendorName || '—',
              vendorCode: po.vendorCode || '',
              rate:       parseFloat(poi.rate) || 0,
              qty:        parseFloat(poi.qty) || 0,
              unit:       poi.unit || item.unit,
            });
          }
        });
      });

      const issuedQty  = poHits.reduce((s, p) => s + p.qty, 0);
      const pendingQty = Math.max(0, item.qty - issuedQty);

      return { ...item, poHits, issuedQty, pendingQty };
    });

    const totalPending = rows.reduce((s, r) => s + r.pendingQty, 0);
    const coveredCount = rows.filter(r => r.pendingQty <= 0 && r.qty > 0).length;
    const itemsWithQty = rows.filter(r => r.qty > 0).length;

    return {
      soId,
      orderNo:      so.orderNo || so.voucherNumber || soId,
      customerName: so.customerName || so.party || '—',
      orderDate:    so.orderDate || so.date || '',
      linkedPOs,
      rows,
      totalPending,
      coveredCount,
      itemsWithQty,
      hasPending: totalPending > 0,
    };
  });

  /* Apply filter + search */
  const visible = trackingData
    .filter(d => {
      if (filter === 'pending')  return d.hasPending;
      if (filter === 'covered')  return !d.hasPending && d.itemsWithQty > 0;
      return true;
    })
    .filter(d => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return d.orderNo.toLowerCase().includes(q) || d.customerName.toLowerCase().includes(q);
    });

  const totalPendingAll = trackingData.filter(d => d.hasPending).length;
  const totalCoveredAll = trackingData.filter(d => !d.hasPending && d.itemsWithQty > 0).length;

  /* ── Styles ── */
  const th = (align = 'left') => ({
    background: BLUE, color: '#fff', fontFamily: F, fontSize: 11,
    fontWeight: 600, padding: '6px 10px', textAlign: align,
    borderRight: '1px solid rgba(255,255,255,0.18)', whiteSpace: 'nowrap',
  });
  const td = (align = 'left', extra = {}) => ({
    fontFamily: F, fontSize: 12, padding: '5px 10px', color: '#222',
    verticalAlign: 'middle', textAlign: align, ...extra,
  });
  const subTh = (align = 'left') => ({
    background: '#e8f0fb', color: '#1a3c6e', fontFamily: F, fontSize: 10,
    fontWeight: 700, padding: '4px 10px', textAlign: align,
    borderRight: '1px solid #c8d8f0', whiteSpace: 'nowrap',
  });
  const subTd = (align = 'left', extra = {}) => ({
    fontFamily: F, fontSize: 11, padding: '4px 10px', color: '#333',
    verticalAlign: 'middle', textAlign: align, ...extra,
  });
  const poDetailTh = (align = 'left') => ({
    background: '#f0f4f8', color: '#555', fontFamily: F, fontSize: 10,
    fontWeight: 600, padding: '3px 8px', textAlign: align,
    borderRight: '1px solid #dde', whiteSpace: 'nowrap',
  });
  const poDetailTd = (align = 'left') => ({
    fontFamily: F, fontSize: 10, padding: '3px 8px', color: '#333',
    verticalAlign: 'middle', textAlign: align,
  });

  return (
    <div style={{ fontFamily: F, padding: '16px 20px', maxWidth: 1400 }}>

      {/* ── Header bar ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: BLUE, color: '#fff', padding: '8px 14px', borderRadius: '4px 4px 0 0',
      }}>
        <span style={{ fontSize: 13, fontWeight: 700 }}>PO Tracking — Sales Order Material Status</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={load} style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 3, padding: '3px 12px', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: F }}>
            ↺ Refresh
          </button>
          <button onClick={() => navigate('/purchase-order/create')} style={{ background: '#fff', color: BLUE, border: 'none', borderRadius: 3, padding: '4px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: F }}>
            + Create PO
          </button>
        </div>
      </div>

      {/* ── Summary stats ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, border: `1px solid ${BLUE}`, borderTop: 'none', padding: 14, background: '#f9fafb' }}>
        {[
          { label: 'Total Sales Orders', value: trackingData.length,  color: '#1a4a7a' },
          { label: 'PO Pending',         value: totalPendingAll,       color: '#856404' },
          { label: 'Fully Covered',      value: totalCoveredAll,       color: '#155724' },
          { label: 'Total POs Issued',   value: purchaseOrders.length, color: '#0a4a8a' },
        ].map(s => (
          <div key={s.label} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 4, padding: '10px 14px' }}>
            <div style={{ fontSize: 10, color: '#888', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3 }}>{s.label}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* ── Filter + Search bar ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, border: `1px solid ${BLUE}`, borderTop: 'none', padding: '8px 14px', background: '#fff' }}>
        {[
          { key: 'all',     label: `All (${trackingData.length})` },
          { key: 'pending', label: `PO Pending (${totalPendingAll})` },
          { key: 'covered', label: `Fully Covered (${totalCoveredAll})` },
        ].map(tab => (
          <button key={tab.key} onClick={() => setFilter(tab.key)} style={{
            padding: '3px 12px', fontSize: 11, fontWeight: 600, fontFamily: F,
            background: filter === tab.key ? BLUE : '#f0f4f8',
            color: filter === tab.key ? '#fff' : '#333',
            border: `1px solid ${filter === tab.key ? BLUE : '#dde'}`,
            borderRadius: 3, cursor: 'pointer',
          }}>
            {tab.label}
          </button>
        ))}
        <button
          onClick={() => {
            const allOpen = visible.every(d => expanded[d.soId]);
            const next = {};
            visible.forEach(d => { next[d.soId] = !allOpen; });
            setExpanded(p => ({ ...p, ...next }));
          }}
          style={{ padding: '3px 10px', fontSize: 11, fontFamily: F, background: '#f0f4f8', color: '#333', border: '1px solid #dde', borderRadius: 3, cursor: 'pointer' }}
        >
          {visible.every(d => expanded[d.soId]) ? '▴ Collapse All' : '▾ Expand All'}
        </button>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search SO No or Client…"
          style={{ marginLeft: 'auto', padding: '4px 10px', fontSize: 11, fontFamily: F, border: '1px solid #ccc', borderRadius: 3, width: 220, outline: 'none' }}
        />
      </div>

      {/* ── Main table ── */}
      <div style={{ border: `1px solid ${BLUE}`, borderTop: 'none', background: '#fff' }}>
        {loading ? (
          <div style={{ padding: 32, textAlign: 'center', color: '#888', fontSize: 13 }}>Loading…</div>
        ) : visible.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: '#888', fontSize: 13 }}>No records match current filter.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ ...th(), width: 28 }}></th>
                <th style={th()}>SO No</th>
                <th style={th()}>Client</th>
                <th style={th()}>Order Date</th>
                <th style={th('center')}>Items</th>
                <th style={th('center')}>POs Issued</th>
                <th style={th('center')}>Status</th>
                <th style={{ ...th('center'), width: 70 }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((so, idx) => {
                const isOpen = !!expanded[so.soId];
                const rowBg = idx % 2 === 0 ? '#fff' : '#fafbfc';
                return [
                  /* SO header row */
                  <tr
                    key={so.soId}
                    style={{ background: rowBg, cursor: 'pointer', borderBottom: '1px solid #e8eaed' }}
                    onClick={() => toggleExpand(so.soId)}
                  >
                    <td style={{ ...td('center'), fontSize: 16, color: BLUE, fontWeight: 700 }}>
                      {isOpen ? '▾' : '▸'}
                    </td>
                    <td style={{ ...td(), fontWeight: 700, color: BLUE }}>{so.orderNo}</td>
                    <td style={td()}>{so.customerName}</td>
                    <td style={td()}>{fmtD(so.orderDate)}</td>
                    <td style={td('center')}>{so.rows.length}</td>
                    <td style={td('center')}>
                      {so.linkedPOs.length > 0
                        ? <span style={{ fontWeight: 700, color: '#155724' }}>{so.linkedPOs.length} PO{so.linkedPOs.length > 1 ? 's' : ''}</span>
                        : <span style={{ color: '#999', fontStyle: 'italic', fontSize: 11 }}>None</span>
                      }
                    </td>
                    <td style={{ ...td('center') }}>
                      <PendingPill qty={so.totalPending} />
                    </td>
                    <td style={{ ...td('center') }} onClick={e => e.stopPropagation()}>
                      <button
                        onClick={() => navigate('/purchase-order/create', { state: { linkedSalesOrderId: so.soId } })}
                        style={{ padding: '2px 8px', fontSize: 10, fontFamily: F, background: BLUE, color: '#fff', border: 'none', borderRadius: 3, cursor: 'pointer' }}
                      >
                        + PO
                      </button>
                    </td>
                  </tr>,

                  /* Expanded detail rows */
                  isOpen && (
                    <tr key={`${so.soId}-detail`}>
                      <td colSpan={8} style={{ padding: '0 0 6px 32px', background: '#f5f8ff', borderBottom: '2px solid #c8d8f0' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 6 }}>
                          <thead>
                            <tr>
                              <th style={subTh()}>Material / Item</th>
                              <th style={subTh()}>Type</th>
                              <th style={subTh()}>HSN</th>
                              <th style={subTh('center')}>SO Qty</th>
                              <th style={subTh('center')}>PO Issued</th>
                              <th style={subTh('center')}>Pending</th>
                              <th style={subTh()}>PO Details</th>
                            </tr>
                          </thead>
                          <tbody>
                            {so.rows.length === 0 ? (
                              <tr>
                                <td colSpan={7} style={{ ...subTd('center'), color: '#aaa', fontStyle: 'italic', padding: '10px' }}>
                                  No items in this Sales Order
                                </td>
                              </tr>
                            ) : so.rows.map((row, ri) => {
                              const rowPending = row.pendingQty > 0;
                              return (
                                <tr key={ri} style={{ background: ri % 2 === 0 ? '#fff' : '#f0f4fb', borderBottom: '1px solid #dde8f8' }}>
                                  <td style={{ ...subTd(), fontWeight: 600 }}>
                                    {row.name}
                                    {row.code ? <span style={{ fontSize: 10, color: '#888', marginLeft: 5 }}>({row.code})</span> : null}
                                  </td>
                                  <td style={subTd()}>
                                    {row.type === 'addon'
                                      ? <Pill label="Add-On" bg="#e8f0fe" color="#1a56db" border="#c7d7fc" />
                                      : <Pill label="Material" bg="#f0fdf4" color="#166534" border="#bbf7d0" />
                                    }
                                  </td>
                                  <td style={{ ...subTd(), color: '#666' }}>{row.hsn || '—'}</td>
                                  <td style={{ ...subTd('center'), fontWeight: 700 }}>
                                    {row.qty} {row.unit}
                                  </td>
                                  <td style={{ ...subTd('center'), color: row.issuedQty > 0 ? '#155724' : '#999' }}>
                                    {row.issuedQty > 0 ? `${row.issuedQty} ${row.unit}` : '—'}
                                  </td>
                                  <td style={{ ...subTd('center') }}>
                                    {row.qty === 0 ? (
                                      <span style={{ color: '#aaa', fontSize: 10 }}>N/A</span>
                                    ) : rowPending ? (
                                      <span style={{ fontWeight: 700, color: '#856404' }}>{row.pendingQty} {row.unit}</span>
                                    ) : (
                                      <span style={{ color: '#155724', fontWeight: 700 }}>✓</span>
                                    )}
                                  </td>
                                  <td style={subTd()}>
                                    {row.poHits.length === 0 ? (
                                      <span style={{ color: '#e53e3e', fontSize: 10, fontStyle: 'italic' }}>No PO raised</span>
                                    ) : (
                                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                        <thead>
                                          <tr>
                                            <th style={poDetailTh()}>PO No</th>
                                            <th style={poDetailTh()}>Vendor</th>
                                            <th style={poDetailTh('right')}>Rate</th>
                                            <th style={poDetailTh('right')}>Qty</th>
                                            <th style={poDetailTh()}>Status</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {row.poHits.map((p, pi) => (
                                            <tr key={pi} style={{ borderBottom: '1px solid #eee' }}>
                                              <td style={{ ...poDetailTd(), color: BLUE, fontWeight: 700, cursor: 'pointer', textDecoration: 'underline' }}
                                                onClick={() => navigate(`/purchase-order/edit/${p.poId}`)}>
                                                {p.poNo}
                                              </td>
                                              <td style={poDetailTd()}>{p.vendorName}</td>
                                              <td style={poDetailTd('right')}>₹ {fmtN(p.rate)}</td>
                                              <td style={{ ...poDetailTd('right'), fontWeight: 700 }}>{p.qty} {p.unit}</td>
                                              <td style={poDetailTd()}>
                                                <Pill
                                                  label={p.poStatus}
                                                  bg={p.poStatus === 'approved' ? '#d4edda' : p.poStatus === 'pending' ? '#fff3cd' : '#e9ecef'}
                                                  color={p.poStatus === 'approved' ? '#155724' : p.poStatus === 'pending' ? '#856404' : '#495057'}
                                                  border={p.poStatus === 'approved' ? '#c3e6cb' : p.poStatus === 'pending' ? '#ffc107' : '#dee2e6'}
                                                />
                                              </td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  ),
                ];
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Footer note */}
      <div style={{ fontSize: 10, color: '#aaa', fontFamily: F, padding: '6px 2px' }}>
        * Item matching is based on item name. PO qty shown is from approved + pending POs linked to each SO.
      </div>
    </div>
  );
}
