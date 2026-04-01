/**
 * SAP MODE — Production Orders List
 */
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSAP } from '../../context/SAPContext';
import { Panel, Table, Badge, Btn, PageHeader, C, fmtDate } from '../../components/SAPShared';

export default function ProductionList() {
  const { api } = useSAP();
  const navigate = useNavigate();
  const [list,    setList]    = useState([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    api('/api/sap/production').then(r => { setList(r.data || []); setLoading(false); }).catch(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const completeEntry = async (prod) => {
    try {
      await api(`/api/sap/production/${prod.prodId}/complete`, {
        method: 'POST',
        data: { producedQty: prod.plannedQty, materialIssues: prod.materialIssues || [] }
      });
      load();
    } catch(e) { alert(e.response?.data?.error || e.message); }
  };

  return (
    <div style={{ fontFamily: C.font, color: C.text }}>
      <PageHeader
        title="Production Orders"
        sub={`${list.length} total production entries`}
        action={<Btn onClick={() => navigate('/sap/production/new')}>+ New Production</Btn>}
      />
      <div style={{ padding: '12px 20px' }}>
        <Panel>
          <Table
            cols={[
              { label: 'Prod ID',    key: 'prodId' },
              { label: 'Project',    key: 'projectId' },
              { label: 'Item',       key: 'itemName' },
              { label: 'Planned',    key: 'plannedQty',  right: true },
              { label: 'Produced',   key: 'producedQty', right: true },
              { label: 'Unit',       key: 'unit', muted: true },
              { label: 'Start',      render: r => fmtDate(r.startDate), muted: true },
              { label: 'Status',     render: r => <Badge status={r.status} /> },
              { label: '',           render: r => r.status !== 'Completed' ? <Btn small variant="success" onClick={e => { e.stopPropagation(); completeEntry(r); }}>Complete</Btn> : null },
            ]}
            rows={list}
            onRow={r => navigate(`/sap/projects/${r.projectId}`)}
            emptyMsg={loading ? 'Loading…' : 'No production orders'}
          />
        </Panel>
      </div>
    </div>
  );
}
