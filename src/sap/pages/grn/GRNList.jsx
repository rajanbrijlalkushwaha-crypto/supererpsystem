/**
 * SAP MODE — GRN List
 */
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSAP } from '../../context/SAPContext';
import { Panel, Table, Badge, Btn, PageHeader, Input, C, fmtDate } from '../../components/SAPShared';

export default function GRNList() {
  const { api } = useSAP();
  const navigate = useNavigate();
  const [list,    setList]    = useState([]);
  const [loading, setLoading] = useState(true);
  const [search,  setSearch]  = useState('');

  useEffect(() => {
    api('/api/sap/grn').then(r => { setList(r.data || []); setLoading(false); }).catch(() => setLoading(false));
  }, [api]);

  const filtered = list.filter(g => {
    const q = search.toLowerCase();
    return !q || g.grnNumber?.toLowerCase().includes(q) || g.poId?.toLowerCase().includes(q) || g.projectId?.toLowerCase().includes(q);
  });

  return (
    <div style={{ fontFamily: C.font, color: C.text }}>
      <PageHeader
        tcode="MIGO"
        title="Goods Receipt — Material Document List"
        sub="MM — Materials Management"
        action={
          <div style={{ display: 'flex', gap: 4 }}>
            <Btn variant="secondary" onClick={() => api('/api/sap/grn').then(r => setList(r.data || []))} small>↻</Btn>
            <Btn onClick={() => navigate('/sap/grn/new')} small>MIGO — Post GR</Btn>
          </div>
        }
      />
      <div style={{ padding: '12px 20px', borderBottom: `1px solid ${C.border}` }}>
        <div style={{ width: 280 }}>
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by GRN#, PO#, project…" />
        </div>
      </div>
      <div style={{ padding: '12px 20px' }}>
        <Panel>
          <Table
            cols={[
              { label: 'GRN #',      key: 'grnNumber' },
              { label: 'PO Ref',     key: 'poId' },
              { label: 'Project',    key: 'projectId' },
              { label: 'Warehouse',  key: 'warehouse', muted: true },
              { label: 'Date',       render: r => fmtDate(r.receiptDate), muted: true },
              { label: 'Status',     render: r => <Badge status={r.posted ? 'Posted' : 'Not Posted'} /> },
            ]}
            rows={filtered}
            onRow={r => navigate(`/sap/projects/${r.projectId}`)}
            emptyMsg={loading ? 'Loading…' : 'No GRNs'}
          />
        </Panel>
      </div>
    </div>
  );
}
