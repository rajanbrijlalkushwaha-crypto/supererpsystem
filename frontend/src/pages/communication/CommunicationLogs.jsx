import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCompany } from '../../context/CompanyContext';
import PageLoader from '../../components/PageLoader';

const F = "'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif";
const P = '#133d80'; // Sales Order module's blue theme

const fmtDate = d => {
  if (!d) return '—';
  const [y, m, dd] = String(d).split('-');
  if (y && y.length === 4 && m && dd) return `${dd}-${m}-${y}`;
  return d;
};

export default function CommunicationLogs() {
  const { selectedCompany } = useCompany();
  const navigate = useNavigate();
  const cid = selectedCompany?.companyId;

  const [orders, setOrders]   = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch]   = useState('');

  const load = useCallback(async () => {
    if (!cid) return;
    setLoading(true);
    try {
      const r    = await fetch(`/api/sales-orders?companyId=${cid}`);
      const data = await r.json();
      setOrders(Array.isArray(data) ? data : []);
    } catch {}
    setLoading(false);
  }, [cid]);

  useEffect(() => { load(); }, [load]);

  const q        = search.toLowerCase();
  const filtered = orders.filter(o => {
    if (!q) return true;
    return (
      String(o.orderId || '').includes(q) ||
      (o.customerName || o.party || '').toLowerCase().includes(q) ||
      (o.orderNo || o.soNumber || o.order_no || '').toLowerCase().includes(q)
    );
  });

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', background:'#f1f5f9', fontFamily:F }}>

      {/* Header */}
      <div style={{ background:'#fff', borderBottom:'1px solid #e2e8f0', padding:'6px 16px',
        display:'flex', alignItems:'center', gap:10, flexShrink:0, height:44 }}>
        <div style={{ width:26, height:26, borderRadius:7, background:`${P}18`,
          border:`1.5px solid ${P}55`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={P}
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
          </svg>
        </div>
        <div style={{ fontSize:14, fontWeight:700, color:'#0f172a', whiteSpace:'nowrap' }}>Communication Logs</div>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by Order ID, Client Name, Order No…"
          style={{ height:28, padding:'0 12px', border:'1px solid #d1d5db', borderRadius:6,
            fontSize:12, fontFamily:F, outline:'none', width:300, marginLeft:8 }}
        />
        <div style={{ marginLeft:'auto', fontSize:12, color:'#94a3b8', whiteSpace:'nowrap' }}>
          {filtered.length} order{filtered.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Table */}
      <div style={{ flex:1, overflow:'auto', padding:'8px 16px 16px' }}>
        {loading ? (
          <PageLoader text="Loading sales orders…" />
        ) : filtered.length === 0 ? (
          <div style={{ textAlign:'center', padding:60, color:'#000', fontSize:13 }}>No orders found.</div>
        ) : (
          <table style={{ width:'100%', borderCollapse:'separate', borderSpacing:0, background:'#fff' }}>
            <thead>
              <tr>
                {['#','Order ID','Client Name','Order Date','Order No','Due Date','Products','Qty'].map(h => (
                  <th key={h} style={{ padding:'9px 12px', textAlign:'left', fontSize:11,
                    fontWeight:700, color:'#fff', background:P, border:'1px solid #000',
                    whiteSpace:'nowrap', letterSpacing:'0.3px', position:'sticky', top:0, zIndex:1 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((o, i) => {
                const items    = Array.isArray(o.items) ? o.items : [];
                const products = items
                  .map(it => it.description || it.itemName || it.name || '')
                  .filter(Boolean).join(', ') || '—';
                const qty = items.reduce((s, it) => s + parseFloat(it.qty || it.quantity || 0), 0);
                return (
                  <tr key={o.orderId}
                    onClick={() => navigate(`/communication/logs/${o.orderId}`)}
                    style={{ cursor:'pointer', background:'#fff' }}
                    onMouseEnter={e => { e.currentTarget.style.background = '#f5f5f5'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = '#fff'; }}>
                    <td style={{ padding:'9px 12px', fontSize:12, color:'#000', border:'1px solid #000', width:36 }}>{i+1}</td>
                    <td style={{ padding:'9px 12px', fontSize:12, fontWeight:700, color:'#000', border:'1px solid #000' }}>#{o.orderId}</td>
                    <td style={{ padding:'9px 12px', fontSize:12, color:'#000', fontWeight:500, border:'1px solid #000' }}>
                      {o.customerName || o.party || '—'}
                    </td>
                    <td style={{ padding:'9px 12px', fontSize:12, color:'#000', whiteSpace:'nowrap', border:'1px solid #000' }}>
                      {fmtDate(o.orderDate || o.order_date)}
                    </td>
                    <td style={{ padding:'9px 12px', fontSize:12, color:'#000', border:'1px solid #000' }}>
                      {o.orderNo || o.soNumber || o.order_no || '—'}
                    </td>
                    <td style={{ padding:'9px 12px', fontSize:12, color:'#000', whiteSpace:'nowrap', border:'1px solid #000' }}>
                      {fmtDate(o.dueDate || o.deliveryDate)}
                    </td>
                    <td style={{ padding:'9px 12px', fontSize:11, color:'#000', maxWidth:200, border:'1px solid #000',
                      overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                      {products}
                    </td>
                    <td style={{ padding:'9px 12px', fontSize:12, color:'#000', border:'1px solid #000' }}>
                      {qty > 0 ? qty : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
