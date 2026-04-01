/**
 * SAP MODE — Dashboard
 * Entry CTA: New Sales Order (SO → auto-creates Project)
 */
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSAP } from '../context/SAPContext';
import { Panel, KpiCard, Table, Badge, Btn, PageHeader, C, fmt, fmtDate } from '../components/SAPShared';

/* ── Document flow diagram (static) ── */
const FLOW_STEPS = [
  { label: 'Sales Order', icon: '📋', path: '/sap/sales-orders/new', clr: '#4F46E5', primary: true },
  { label: 'Project',     icon: '📁', path: '/sap/projects',         clr: '#7C3AED' },
  { label: 'MRP / BOM',  icon: '⚙️',  path: '/sap/mrp',              clr: '#0891B2' },
  { label: 'Purchase',   icon: '🛒',  path: '/sap/purchase-orders',  clr: '#D97706' },
  { label: 'GRN',        icon: '📦',  path: '/sap/grn',              clr: '#10B981' },
  { label: 'Production', icon: '🏭',  path: '/sap/production',       clr: '#0E7490' },
  { label: 'Invoice',    icon: '💰',  path: '/sap/invoices',         clr: '#4F46E5' },
  { label: 'Payment',    icon: '✅',  path: '/sap/payments',         clr: '#10B981' },
];

export default function SAPDashboard() {
  const { projects, loadingProj, api, companyName } = useSAP();
  const [soList,   setSoList]   = useState([]);
  const [poList,   setPoList]   = useState([]);
  const [tasks,    setTasks]    = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    api('/api/sap/sales-orders').then(r => setSoList(r.data || [])).catch(() => {});
    api('/api/sap/purchase-orders').then(r => setPoList(r.data || [])).catch(() => {});
    api('/api/sap/tasks').then(r => setTasks(r.data || [])).catch(() => {});
  }, [api]);

  const active   = projects.filter(p => p.status === 'Active').length;
  const totalRev = soList.reduce((s, o) => s + (o.grandTotal || 0), 0);
  const openPO   = poList.filter(p => p.status === 'Open' || p.status === 'Partial').length;
  const openTask = tasks.filter(t => t.status !== 'Done').length;

  const recentSO  = [...soList].slice(0, 6);
  const recentProj = [...projects].sort((a, b) => b.createdAt?.localeCompare(a.createdAt || '') || 0).slice(0, 5);

  return (
    <div style={{ fontFamily: C.font, color: C.text }}>
      <PageHeader
        tcode="SAP1"
        title={companyName ? `${companyName} — SAP Easy Access` : 'SAP Easy Access'}
        sub="Enterprise Resource Planning | SD-MM-PP-FI/CO Document Flow"
        action={
          <Btn onClick={() => navigate('/sap/sales-orders/new')} small>VA01 — Create Sales Order</Btn>
        }
      />

      {/* Document Flow Banner */}
      <div style={{ padding: '10px 20px', borderBottom: `1px solid ${C.border}`, background: 'rgba(79,70,229,0.05)' }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>
          ERP Document Flow
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 0, overflowX: 'auto' }}>
          {FLOW_STEPS.map((step, i) => (
            <React.Fragment key={step.label}>
              <button onClick={() => navigate(step.path)}
                style={{ background: step.primary ? `${step.clr}25` : 'transparent', border: `1px solid ${step.primary ? step.clr : C.border}`, borderRadius: 3, padding: '5px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0, fontFamily: C.font }}
                onMouseEnter={e => e.currentTarget.style.background = `${step.clr}20`}
                onMouseLeave={e => e.currentTarget.style.background = step.primary ? `${step.clr}25` : 'transparent'}>
                <span style={{ fontSize: 13 }}>{step.icon}</span>
                <span style={{ fontSize: 11, fontWeight: step.primary ? 700 : 600, color: step.primary ? step.clr : C.text, whiteSpace: 'nowrap' }}>{step.label}</span>
              </button>
              {i < FLOW_STEPS.length - 1 && <span style={{ color: C.muted, padding: '0 2px', fontSize: 12, flexShrink: 0 }}>→</span>}
            </React.Fragment>
          ))}
        </div>
      </div>

      <div style={{ padding: '14px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* KPI row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
          <KpiCard label="Sales Orders"    value={soList.length}   sub={`Total: ${fmt(totalRev)}`}    color="#4F46E5" icon="📋" />
          <KpiCard label="Active Projects" value={active}          sub={`${projects.length} total`}   color="#7C3AED" icon="📁" />
          <KpiCard label="Open POs"        value={openPO}          sub={`${poList.length} total POs`} color="#D97706" icon="🛒" />
          <KpiCard label="Open Tasks"      value={openTask}        sub={`${tasks.length} total`}      color="#0891B2" icon="✓" />
        </div>

        {/* Recent SOs + active projects */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Panel title="Recent Sales Orders" action={<Btn small variant="secondary" onClick={() => navigate('/sap/sales-orders')}>View All</Btn>}>
            <Table
              cols={[
                { label: 'SO #',    key: 'soNumber' },
                { label: 'Client',  key: 'clientName' },
                { label: 'Amount',  render: r => fmt(r.grandTotal), right: true },
                { label: 'Status',  render: r => <Badge status={r.status} /> },
                { label: 'Date',    render: r => fmtDate(r.orderDate), muted: true },
              ]}
              rows={recentSO}
              onRow={r => navigate(`/sap/projects/${r.projectId}`)}
              emptyMsg={loadingProj ? 'Loading…' : (
                <div style={{ textAlign: 'center', padding: '8px 0' }}>
                  <div style={{ color: C.muted, marginBottom: 8 }}>No Sales Orders yet</div>
                  <Btn onClick={() => navigate('/sap/sales-orders/new')}>Create First Sales Order →</Btn>
                </div>
              )}
            />
          </Panel>

          <Panel title="Active Projects" action={<Btn small variant="secondary" onClick={() => navigate('/sap/projects')}>View All</Btn>}>
            <Table
              cols={[
                { label: 'Project', key: 'projectId' },
                { label: 'Name',    key: 'projectName' },
                { label: 'Client',  key: 'clientName' },
                { label: 'Status',  render: r => <Badge status={r.status} /> },
              ]}
              rows={recentProj}
              onRow={r => navigate(`/sap/projects/${r.projectId}`)}
              emptyMsg="No projects — create a Sales Order to auto-generate one"
            />
          </Panel>
        </div>

        {/* Open tasks + open POs */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Panel title="Open Tasks" action={<Btn small variant="secondary" onClick={() => navigate('/sap/tasks')}>Task Board</Btn>}>
            {tasks.filter(t => t.status !== 'Done').slice(0,6).length === 0
              ? <div style={{ color: C.muted, fontSize: 12 }}>No open tasks.</div>
              : tasks.filter(t => t.status !== 'Done').slice(0,6).map(t => (
                <div key={t.taskId} onClick={() => navigate('/sap/tasks')} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: `1px solid ${C.border}`, cursor: 'pointer' }}>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 5px', borderRadius: 2, background: t.status === 'InProgress' ? '#0891B225' : t.status === 'Blocked' ? '#EF444420' : `${C.muted}20`, color: t.status === 'InProgress' ? '#0891B2' : t.status === 'Blocked' ? '#EF4444' : C.muted }}>{t.status}</span>
                  <span style={{ flex: 1, fontSize: 12, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</span>
                  <span style={{ fontSize: 10, color: C.muted }}>{t.projectId}</span>
                </div>
              ))
            }
          </Panel>

          <Panel title="Open Purchase Orders" action={<Btn small variant="secondary" onClick={() => navigate('/sap/purchase-orders')}>View All</Btn>}>
            <Table
              cols={[
                { label: 'PO #',    key: 'poNumber' },
                { label: 'Vendor',  key: 'vendorName' },
                { label: 'Amount',  render: r => fmt(r.grandTotal), right: true },
                { label: 'Status',  render: r => <Badge status={r.status} /> },
              ]}
              rows={poList.filter(p => p.status === 'Open' || p.status === 'Partial').slice(0,5)}
              onRow={r => navigate(`/sap/projects/${r.projectId}`)}
              emptyMsg="No open purchase orders"
            />
          </Panel>
        </div>
      </div>
    </div>
  );
}
