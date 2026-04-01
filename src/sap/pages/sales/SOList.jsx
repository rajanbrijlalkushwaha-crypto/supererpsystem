/**
 * VA05 — List of Sales Orders
 * SAP SD — Sales & Distribution
 */
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSAP } from '../../context/SAPContext';
import { Panel, Table, Badge, Btn, PageHeader, Input, C, fmt, fmtDate } from '../../components/SAPShared';

const STATUSES = ['All', 'Draft', 'Confirmed', 'Invoiced', 'Closed'];

export default function SOList() {
  const { api } = useSAP();
  const navigate = useNavigate();
  const [list,    setList]    = useState([]);
  const [loading, setLoading] = useState(true);
  const [search,  setSearch]  = useState('');
  const [status,  setStatus]  = useState('All');

  const load = () => {
    setLoading(true);
    api('/api/sap/sales-orders')
      .then(r => { setList(r.data || []); setLoading(false); })
      .catch(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const filtered = list.filter(o => {
    const q = search.toLowerCase();
    const matchQ = !q || o.soNumber?.toLowerCase().includes(q) || o.clientName?.toLowerCase().includes(q) || o.projectId?.toLowerCase().includes(q);
    const matchS = status === 'All' || o.status === status;
    return matchQ && matchS;
  });

  const total = filtered.reduce((s, o) => s + (o.grandTotal || 0), 0);

  const confirmSO = async (e, so) => {
    e.stopPropagation();
    try {
      await api(`/api/sap/sales-orders/${so.soId}/confirm`, { method: 'PATCH', data: {} });
      load();
    } catch(err) { alert(err.response?.data?.error || err.message); }
  };

  return (
    <div style={{ fontFamily: C.font, color: C.text, background: C.bg, minHeight: '100%' }}>

      {/* VA05 transaction header */}
      <PageHeader
        tcode="VA05"
        title="List of Sales Orders"
        sub="SD — Sales & Distribution"
        action={
          <div style={{ display: 'flex', gap: 4 }}>
            <Btn variant="secondary" onClick={load} small>↻ Refresh</Btn>
            <Btn onClick={() => navigate('/sap/sales-orders/new')} small>+ VA01 Create</Btn>
          </div>
        }
      />

      {/* Application toolbar */}
      <div style={{
        background: C.surface2, borderBottom: `1px solid ${C.border}`,
        padding: '2px 8px', display: 'flex', alignItems: 'center', gap: 6,
      }}>
        {/* Status filter tabs */}
        {STATUSES.map(s => (
          <button key={s} onClick={() => setStatus(s)}
            style={{
              fontFamily: C.font, fontSize: 11, fontWeight: status === s ? 700 : 400,
              padding: '1px 10px', height: 22, cursor: 'pointer',
              background: status === s ? '#ffffff' : C.surface2,
              color: status === s ? C.sapNavy : C.muted,
              border: `1px solid ${C.border}`,
              borderBottom: status === s ? `1px solid #ffffff` : `1px solid ${C.border}`,
              marginBottom: status === s ? -1 : 0, position: 'relative', zIndex: status === s ? 1 : 0,
            }}>
            {s}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: C.muted }}>
          {filtered.length} orders &nbsp;|&nbsp; Total: <strong style={{ color: C.sapNavy }}>{fmt(total)}</strong>
        </span>
      </div>

      {/* Search bar */}
      <div style={{
        background: C.surface, borderBottom: `1px solid ${C.border}`,
        padding: '4px 8px', display: 'flex', alignItems: 'center', gap: 6,
      }}>
        <span style={{ fontSize: 11, color: C.muted, flexShrink: 0 }}>Search:</span>
        <div style={{ width: 300 }}>
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="SO#, client name, project ID…" />
        </div>
      </div>

      {/* Main ALV grid */}
      <div style={{ padding: '8px 8px 0' }}>
        {filtered.length === 0 && !loading
          ? (
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, padding: '30px 20px', textAlign: 'center' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.sapNavy, marginBottom: 6 }}>No Sales Orders Found</div>
              <div style={{ fontSize: 11, color: C.muted, marginBottom: 12 }}>
                Use VA01 to create the first Sales Order. A project will be auto-generated.
              </div>
              <Btn onClick={() => navigate('/sap/sales-orders/new')}>VA01 — Create Sales Order</Btn>
            </div>
          )
          : (
            <Panel>
              <Table
                cols={[
                  { label: 'Sales Order',  key: 'soNumber' },
                  { label: 'Project',      key: 'projectId', muted: true },
                  { label: 'Sold-to Party',key: 'clientName' },
                  { label: 'Order Date',   render: r => fmtDate(r.orderDate), muted: true },
                  { label: 'Req. Del. Date',render: r => fmtDate(r.deliveryDate), muted: true },
                  { label: 'Net Value',    render: r => fmt(r.grandTotal), right: true },
                  { label: 'Status',       render: r => (
                    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                      <Badge status={r.status} />
                      {r.status === 'Draft' && (
                        <Btn small variant="success" onClick={e => confirmSO(e, r)}>Confirm</Btn>
                      )}
                    </div>
                  )},
                ]}
                rows={filtered}
                onRow={r => navigate(`/sap/projects/${r.projectId}`)}
                emptyMsg={loading ? 'Loading…' : 'No orders match selection criteria'}
              />
            </Panel>
          )
        }
      </div>
    </div>
  );
}
