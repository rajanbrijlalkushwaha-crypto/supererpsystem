/**
 * SAP MODE — Project Detail Hub
 * Shows document flow: SO → PO → GRN → Production → Invoice → Payment
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useSAP } from '../../context/SAPContext';
import { Panel, Table, Badge, Btn, PageHeader, KpiCard, ErrorBox, C, fmt, fmtDate } from '../../components/SAPShared';

const TAB = ['Overview', 'Materials', 'Document Flow', 'Finance'];

export default function ProjectDetail() {
  const { projectId } = useParams();
  const { api, addNotification, refreshProjects } = useSAP();
  const navigate = useNavigate();

  const [proj,    setProj]    = useState(null);
  const [tab,     setTab]     = useState('Overview');
  const [docFlow, setDocFlow] = useState(null);
  const [mrp,     setMrp]     = useState([]);
  const [pnl,     setPnl]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [pr, df, mr, pl] = await Promise.all([
        api(`/api/sap/projects/${projectId}`),
        api(`/api/sap/mrp/${projectId}/document-flow`),
        api(`/api/sap/mrp/${projectId}/balance`),
        api(`/api/sap/finance/project-pnl/${projectId}`),
      ]);
      setProj(pr.data);
      setDocFlow(df.data);
      setMrp(mr.data || []);
      setPnl(pl.data);
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    }
    setLoading(false);
  }, [api, projectId]);

  useEffect(() => { load(); }, [load]);

  const changeStatus = async (status) => {
    try {
      await api(`/api/sap/projects/${projectId}/status`, { method: 'PATCH', data: { status } });
      addNotification(`Status updated to ${status}`);
      load();
      refreshProjects();
    } catch(e) { setError(e.message); }
  };

  if (loading) return <div style={{ padding: 40, color: C.muted, fontFamily: C.font }}>Loading project…</div>;
  if (!proj)   return <div style={{ padding: 40, color: C.red,  fontFamily: C.font }}>Project not found. <Btn variant="secondary" onClick={() => navigate('/sap/projects')}>Back</Btn></div>;

  const statusActions = {
    Planning: ['Active', 'Cancelled'],
    Active:   ['OnHold', 'Completed', 'Cancelled'],
    OnHold:   ['Active', 'Cancelled'],
    Completed:[],
    Cancelled:[],
  }[proj.status] || [];

  return (
    <div style={{ fontFamily: C.font, color: C.text }}>
      <PageHeader
        title={`${proj.projectId} — ${proj.projectName}`}
        sub={`${proj.projectType} | ${proj.clientName} | ${proj.location || 'No location'}`}
        action={
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <Badge status={proj.status} />
            {statusActions.map(s => (
              <Btn key={s} small variant="secondary" onClick={() => changeStatus(s)}>{s}</Btn>
            ))}
            <Btn small onClick={() => navigate('/sap/sales-orders/new')}>+ Sales Order</Btn>
            <Btn small variant="secondary" onClick={() => navigate('/sap/purchase-orders/new')}>+ PO</Btn>
            <Btn small variant="secondary" onClick={() => navigate('/sap/grn/new')}>+ GRN</Btn>
          </div>
        }
      />

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, borderBottom: `1px solid ${C.border}`, padding: '0 20px' }}>
        {TAB.map(t => (
          <button key={t} onClick={() => setTab(t)}
            style={{ background: 'none', border: 'none', borderBottom: tab === t ? `2px solid ${C.blue}` : '2px solid transparent', color: tab === t ? C.white : C.muted, padding: '8px 14px', cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: C.font, marginBottom: -1 }}>
            {t}
          </button>
        ))}
      </div>

      <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <ErrorBox msg={error} />

        {/* ── Overview tab ── */}
        {tab === 'Overview' && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
              <KpiCard label="Revenue"         value={fmt(pnl?.revenue || 0)}         color="#4F46E5" />
              <KpiCard label="Received"        value={fmt(pnl?.received || 0)}        color="#10B981" />
              <KpiCard label="Outstanding"     value={fmt(pnl?.outstanding || 0)}     color="#EF4444" />
              <KpiCard label="Procurement"     value={fmt(pnl?.procurementCost || 0)} color="#D97706" />
              <KpiCard label="Gross Margin"    value={`${pnl?.marginPct || 0}%`}      sub={fmt(pnl?.grossMargin || 0)} color={pnl?.marginPct >= 0 ? '#10B981' : '#EF4444'} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <Panel title="Project Info">
                <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                  {[
                    ['Project ID',   proj.projectId],
                    ['Type',         proj.projectType],
                    ['Client',       proj.clientName],
                    ['Location',     proj.location || '—'],
                    ['Budget',       proj.budget ? fmt(proj.budget) : '—'],
                    ['Start Date',   fmtDate(proj.startDate)],
                    ['End Date',     fmtDate(proj.endDate)],
                    ['Created',      fmtDate(proj.createdAt)],
                  ].map(([k, v]) => (
                    <tr key={k} style={{ borderBottom: `1px solid ${C.border}` }}>
                      <td style={{ padding: '5px 8px', color: C.muted, width: '40%', fontWeight: 600 }}>{k}</td>
                      <td style={{ padding: '5px 8px', color: C.white }}>{v}</td>
                    </tr>
                  ))}
                </table>
              </Panel>

              <Panel title="Scope of Work">
                {(proj.scopeItems || []).length === 0
                  ? <div style={{ color: C.muted, fontSize: 12 }}>No scope items defined.</div>
                  : <Table
                      cols={[
                        { label: 'Description', key: 'description', wrap: true },
                        { label: 'Qty', key: 'qty', right: true },
                        { label: 'Unit', key: 'unit' },
                      ]}
                      rows={proj.scopeItems}
                    />
                }
              </Panel>
            </div>

            {proj.notes && (
              <Panel title="Notes">
                <p style={{ fontSize: 12, color: C.text, margin: 0, lineHeight: 1.6 }}>{proj.notes}</p>
              </Panel>
            )}
          </>
        )}

        {/* ── Materials tab ── */}
        {tab === 'Materials' && (
          <Panel title="MRP Balance — Material Planning">
            <Table
              cols={[
                { label: 'Item',             key: 'itemName' },
                { label: 'Type',             key: 'itemType', muted: true },
                { label: 'Unit',             key: 'unit' },
                { label: 'Required',         key: 'requiredQty',     right: true },
                { label: 'Ordered',          key: 'orderedQty',      right: true },
                { label: 'Received',         key: 'receivedQty',     right: true },
                { label: 'Balance to Order', render: r => <span style={{ color: r.balanceToOrder > 0 ? C.yellow : C.green }}>{r.balanceToOrder}</span>, right: true },
                { label: 'Balance to Recv',  render: r => <span style={{ color: r.balanceToReceive > 0 ? C.cyan : C.green }}>{r.balanceToReceive}</span>, right: true },
                { label: 'Fulfillment',      render: r => <span style={{ color: r.fulfillmentPct >= 100 ? C.green : r.fulfillmentPct > 50 ? C.yellow : C.red }}>{r.fulfillmentPct}%</span>, right: true },
              ]}
              rows={mrp}
              emptyMsg="No materials in MRP plan"
            />
            {mrp.some(r => r.balanceToOrder > 0) && (
              <div style={{ marginTop: 12 }}>
                <Btn onClick={() => navigate('/sap/purchase-orders/new')}>Create Purchase Order for Balance Items</Btn>
              </div>
            )}
          </Panel>
        )}

        {/* ── Document Flow tab ── */}
        {tab === 'Document Flow' && docFlow && (
          <>
            {/* Summary counts */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 10 }}>
              {[
                { label: 'Sales Orders',     v: docFlow.summary?.salesOrders     || 0, clr: '#0891B2' },
                { label: 'Purchase Orders',  v: docFlow.summary?.purchaseOrders  || 0, clr: '#D97706' },
                { label: 'GRNs',             v: docFlow.summary?.grns            || 0, clr: '#10B981' },
                { label: 'Productions',      v: docFlow.summary?.productions     || 0, clr: '#7C3AED' },
                { label: 'Invoices',         v: docFlow.summary?.invoices        || 0, clr: '#4F46E5' },
                { label: 'Payments',         v: docFlow.summary?.payments        || 0, clr: '#10B981' },
              ].map(x => <KpiCard key={x.label} label={x.label} value={x.v} color={x.clr} />)}
            </div>

            {/* Sales Orders */}
            {(docFlow.salesOrders || []).length > 0 && (
              <Panel title="Sales Orders">
                <Table
                  cols={[
                    { label: 'SO #',    key: 'soNumber' },
                    { label: 'Client',  key: 'clientName' },
                    { label: 'Amount',  render: r => fmt(r.grandTotal), right: true },
                    { label: 'Status',  render: r => <Badge status={r.status} /> },
                    { label: 'Date',    render: r => fmtDate(r.orderDate), muted: true },
                  ]}
                  rows={docFlow.salesOrders}
                />
              </Panel>
            )}

            {/* Purchase Orders */}
            {(docFlow.purchaseOrders || []).length > 0 && (
              <Panel title="Purchase Orders">
                <Table
                  cols={[
                    { label: 'PO #',    key: 'poNumber' },
                    { label: 'Vendor',  key: 'vendorName' },
                    { label: 'Amount',  render: r => fmt(r.grandTotal), right: true },
                    { label: 'Status',  render: r => <Badge status={r.status} /> },
                    { label: 'Date',    render: r => fmtDate(r.orderDate), muted: true },
                  ]}
                  rows={docFlow.purchaseOrders}
                />
              </Panel>
            )}

            {/* GRNs */}
            {(docFlow.grns || []).length > 0 && (
              <Panel title="Goods Receipts (GRN)">
                <Table
                  cols={[
                    { label: 'GRN #',   key: 'grnNumber' },
                    { label: 'PO Ref',  key: 'poId' },
                    { label: 'Status',  render: r => <Badge status={r.posted ? 'Posted' : 'Not Posted'} /> },
                    { label: 'Date',    render: r => fmtDate(r.receiptDate), muted: true },
                  ]}
                  rows={docFlow.grns}
                />
              </Panel>
            )}

            {/* Productions */}
            {(docFlow.productions || []).length > 0 && (
              <Panel title="Production Orders">
                <Table
                  cols={[
                    { label: 'Prod ID',  key: 'prodId' },
                    { label: 'Item',     key: 'itemName' },
                    { label: 'Planned',  key: 'plannedQty', right: true },
                    { label: 'Produced', key: 'producedQty', right: true },
                    { label: 'Status',   render: r => <Badge status={r.status} /> },
                  ]}
                  rows={docFlow.productions}
                />
              </Panel>
            )}
          </>
        )}

        {/* ── Finance tab ── */}
        {tab === 'Finance' && docFlow && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <Panel title="Invoices" action={<Btn small onClick={() => navigate('/sap/invoices')}>View All</Btn>}>
                <Table
                  cols={[
                    { label: 'Invoice #', key: 'invNumber' },
                    { label: 'Amount',    render: r => fmt(r.grandTotal), right: true },
                    { label: 'Paid',      render: r => fmt(r.paidAmount), right: true },
                    { label: 'Status',    render: r => <Badge status={r.status} /> },
                  ]}
                  rows={docFlow.invoices || []}
                  emptyMsg="No invoices"
                />
              </Panel>

              <Panel title="Payments" action={<Btn small onClick={() => navigate('/sap/payments')}>View All</Btn>}>
                <Table
                  cols={[
                    { label: 'Pay ID',   key: 'payId' },
                    { label: 'Client',   key: 'clientName' },
                    { label: 'Amount',   render: r => fmt(r.amount), right: true },
                    { label: 'Mode',     key: 'paymentMode', muted: true },
                    { label: 'Date',     render: r => fmtDate(r.paymentDate), muted: true },
                  ]}
                  rows={docFlow.payments || []}
                  emptyMsg="No payments"
                />
              </Panel>
            </div>

            <Panel title="P&L Summary">
              <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                {[
                  ['Total Revenue (Invoiced)', fmt(pnl?.revenue || 0), C.white],
                  ['Total Received',           fmt(pnl?.received || 0), C.green],
                  ['Outstanding',              fmt(pnl?.outstanding || 0), C.red],
                  ['Procurement Cost',         fmt(pnl?.procurementCost || 0), C.yellow],
                  ['Gross Margin',             `${fmt(pnl?.grossMargin || 0)} (${pnl?.marginPct || 0}%)`, pnl?.grossMargin >= 0 ? C.green : C.red],
                ].map(([k, v, clr]) => (
                  <tr key={k} style={{ borderBottom: `1px solid ${C.border}` }}>
                    <td style={{ padding: '7px 10px', color: C.muted, fontWeight: 600, width: '50%' }}>{k}</td>
                    <td style={{ padding: '7px 10px', color: clr, fontWeight: 700, textAlign: 'right' }}>{v}</td>
                  </tr>
                ))}
              </table>
            </Panel>
          </>
        )}
      </div>
    </div>
  );
}
