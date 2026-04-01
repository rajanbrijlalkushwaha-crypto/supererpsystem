/**
 * SAP MODE — Project List
 */
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSAP } from '../../context/SAPContext';
import { Panel, Table, Badge, Btn, PageHeader, Input, C, fmt, fmtDate } from '../../components/SAPShared';

const STATUS_OPTIONS = ['All', 'Planning', 'Active', 'OnHold', 'Completed', 'Cancelled'];
const TYPE_OPTIONS   = ['All', 'Prefab', 'Cabin', 'Civil', 'Trading'];

export default function ProjectList() {
  const { projects, loadingProj, refreshProjects } = useSAP();
  const navigate = useNavigate();
  const [search,  setSearch]  = useState('');
  const [status,  setStatus]  = useState('All');
  const [type,    setType]    = useState('All');

  const filtered = projects.filter(p => {
    const q = search.toLowerCase();
    const matchQ = !q || p.projectId?.toLowerCase().includes(q) || p.projectName?.toLowerCase().includes(q) || p.clientName?.toLowerCase().includes(q);
    const matchS = status === 'All' || p.status === status;
    const matchT = type === 'All' || p.projectType === type;
    return matchQ && matchS && matchT;
  });

  return (
    <div style={{ fontFamily: C.font, color: C.text }}>
      <PageHeader
        title="Projects"
        sub={`${projects.length} total projects`}
        action={
          <>
            <Btn variant="secondary" onClick={refreshProjects}>↻ Refresh</Btn>
            <Btn onClick={() => navigate('/sap/projects/new')}>+ New Project</Btn>
          </>
        }
      />

      <div style={{ padding: '12px 20px', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', borderBottom: `1px solid ${C.border}` }}>
        <div style={{ flex: 1, minWidth: 200, maxWidth: 320 }}>
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by ID, name, client…" />
        </div>
        {STATUS_OPTIONS.map(s => (
          <button key={s} onClick={() => setStatus(s)}
            style={{ background: status === s ? `${C.blue}30` : 'transparent', border: `1px solid ${status === s ? C.blue : C.border}`, borderRadius: 2, padding: '4px 10px', fontSize: 11, fontWeight: 600, color: status === s ? C.white : C.muted, cursor: 'pointer', fontFamily: C.font }}>
            {s}
          </button>
        ))}
        <select value={type} onChange={e => setType(e.target.value)}
          style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 2, padding: '4px 8px', fontSize: 11, color: C.text, fontFamily: C.font, cursor: 'pointer' }}>
          {TYPE_OPTIONS.map(t => <option key={t}>{t}</option>)}
        </select>
      </div>

      <div style={{ padding: '12px 20px' }}>
        <Panel>
          <Table
            cols={[
              { label: 'Project ID',  key: 'projectId' },
              { label: 'Project Name',key: 'projectName' },
              { label: 'Client',      key: 'clientName' },
              { label: 'Type',        key: 'projectType' },
              { label: 'Status',      render: r => <Badge status={r.status} /> },
              { label: 'Budget',      render: r => r.budget ? fmt(r.budget) : '—', right: true, muted: true },
              { label: 'Start',       render: r => fmtDate(r.startDate), muted: true },
              { label: 'End',         render: r => fmtDate(r.endDate),   muted: true },
            ]}
            rows={filtered}
            onRow={r => navigate(`/sap/projects/${r.projectId}`)}
            emptyMsg={loadingProj ? 'Loading…' : 'No projects match the filter'}
          />
        </Panel>
        <div style={{ marginTop: 8, fontSize: 11, color: C.muted }}>{filtered.length} of {projects.length} projects</div>
      </div>
    </div>
  );
}
