/**
 * SAP MODE — Project P&L Report
 */
import React, { useState, useEffect } from 'react';
import { useSAP } from '../../context/SAPContext';
import { Panel, Table, KpiCard, PageHeader, Select, C, fmt } from '../../components/SAPShared';

export default function PnLReport() {
  const { api, projects } = useSAP();
  const [pnl,     setPnl]     = useState(null);
  const [loading, setLoading] = useState(false);
  const [allPnl,  setAllPnl]  = useState([]);
  const [projectId, setProjectId] = useState('');

  /* Load all project P&Ls for summary */
  useEffect(() => {
    if (projects.length === 0) return;
    Promise.all(projects.map(p => api(`/api/sap/finance/project-pnl/${p.projectId}`).then(r => ({ ...r.data, projectName: p.projectName })).catch(() => null)))
      .then(res => setAllPnl(res.filter(Boolean)));
  }, [projects, api]);

  const loadPnl = async (pid) => {
    if (!pid) return setPnl(null);
    setLoading(true);
    try {
      const r = await api(`/api/sap/finance/project-pnl/${pid}`);
      setPnl(r.data);
    } catch { setPnl(null); }
    setLoading(false);
  };

  useEffect(() => { loadPnl(projectId); }, [projectId]);

  const totalRev    = allPnl.reduce((s, p) => s + (p.revenue || 0), 0);
  const totalCost   = allPnl.reduce((s, p) => s + (p.procurementCost || 0), 0);
  const totalMargin = allPnl.reduce((s, p) => s + (p.grossMargin || 0), 0);
  const avgMarginPct = totalRev > 0 ? Math.round(totalMargin / totalRev * 100) : 0;

  return (
    <div style={{ fontFamily: C.font, color: C.text }}>
      <PageHeader title="Project P&L Report" sub="Gross margin analysis across all projects" />

      <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Portfolio summary */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          <KpiCard label="Total Revenue"    value={fmt(totalRev)}    color="#4F46E5" />
          <KpiCard label="Total Cost"       value={fmt(totalCost)}   color="#D97706" />
          <KpiCard label="Gross Margin"     value={fmt(totalMargin)} color={totalMargin >= 0 ? '#10B981' : '#EF4444'} />
          <KpiCard label="Avg Margin %"     value={`${avgMarginPct}%`} color="#7C3AED" />
        </div>

        {/* All projects table */}
        <Panel title="All Projects P&L">
          <Table
            cols={[
              { label: 'Project ID',    key: 'projectId' },
              { label: 'Project Name',  key: 'projectName' },
              { label: 'Revenue',       render: r => fmt(r.revenue || 0),          right: true },
              { label: 'Received',      render: r => fmt(r.received || 0),         right: true },
              { label: 'Outstanding',   render: r => <span style={{ color: (r.outstanding || 0) > 0 ? C.red : C.green }}>{fmt(r.outstanding || 0)}</span>, right: true },
              { label: 'Proc. Cost',    render: r => fmt(r.procurementCost || 0),  right: true },
              { label: 'Gross Margin',  render: r => <span style={{ color: (r.grossMargin || 0) >= 0 ? C.green : C.red, fontWeight: 700 }}>{fmt(r.grossMargin || 0)}</span>, right: true },
              { label: 'Margin %',      render: r => {
                const pct = r.marginPct || 0;
                return <span style={{ color: pct >= 20 ? C.green : pct >= 0 ? C.yellow : C.red, fontWeight: 700 }}>{pct}%</span>;
              }, right: true },
            ]}
            rows={allPnl}
            onRow={r => setProjectId(r.projectId)}
            emptyMsg="No projects"
          />
        </Panel>

        {/* Project drill-down */}
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: C.muted }}>Drill down:</span>
          <div style={{ width: 320 }}>
            <Select value={projectId} onChange={e => setProjectId(e.target.value)}
              options={[{ value: '', label: '— Select Project —' }, ...projects.map(p => ({ value: p.projectId, label: `${p.projectId} — ${p.projectName}` }))]} />
          </div>
        </div>

        {pnl && (
          <Panel title={`P&L: ${projectId}`}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 16 }}>
              <KpiCard label="Revenue"       value={fmt(pnl.revenue)}          color="#4F46E5" />
              <KpiCard label="Received"      value={fmt(pnl.received)}         color="#10B981" />
              <KpiCard label="Outstanding"   value={fmt(pnl.outstanding)}      color={pnl.outstanding > 0 ? '#EF4444' : '#10B981'} />
              <KpiCard label="Proc. Cost"    value={fmt(pnl.procurementCost)}  color="#D97706" />
              <KpiCard label="Gross Margin"  value={`${pnl.marginPct}%`}       sub={fmt(pnl.grossMargin)} color={pnl.marginPct >= 0 ? '#10B981' : '#EF4444'} />
            </div>
            <table style={{ width: '60%', fontSize: 12, borderCollapse: 'collapse' }}>
              {[
                ['Revenue (Invoiced)',      fmt(pnl.revenue),         C.white],
                ['Less: Procurement Cost',  `(${fmt(pnl.procurementCost)})`, C.yellow],
                ['Gross Margin',            fmt(pnl.grossMargin),     pnl.grossMargin >= 0 ? C.green : C.red],
                ['Margin %',                `${pnl.marginPct}%`,      pnl.marginPct >= 20 ? C.green : pnl.marginPct >= 0 ? C.yellow : C.red],
                ['Payments Received',       fmt(pnl.received),        C.green],
                ['Outstanding Balance',     fmt(pnl.outstanding),     pnl.outstanding > 0 ? C.red : C.green],
              ].map(([k, v, clr]) => (
                <tr key={k} style={{ borderBottom: `1px solid ${C.border}` }}>
                  <td style={{ padding: '6px 10px', color: C.muted, fontWeight: 600 }}>{k}</td>
                  <td style={{ padding: '6px 10px', color: clr, fontWeight: 700, textAlign: 'right' }}>{v}</td>
                </tr>
              ))}
            </table>
          </Panel>
        )}

        {loading && <div style={{ color: C.muted, fontSize: 12 }}>Loading P&L…</div>}
      </div>
    </div>
  );
}
