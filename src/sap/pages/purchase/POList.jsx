/**
 * SAP MODE — Purchase Orders List
 */
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSAP } from '../../context/SAPContext';
import { Panel, Table, Badge, Btn, PageHeader, Input, C, fmt, fmtDate } from '../../components/SAPShared';

export default function POList() {
  const { api } = useSAP();
  const navigate = useNavigate();
  const [list,    setList]    = useState([]);
  const [loading, setLoading] = useState(true);
  const [search,  setSearch]  = useState('');
  const [status,  setStatus]  = useState('All');

  useEffect(() => {
    api('/api/sap/purchase-orders').then(r => { setList(r.data || []); setLoading(false); }).catch(() => setLoading(false));
  }, [api]);

  const statuses = ['All', 'Open', 'Partial', 'Received', 'Closed', 'Cancelled'];
  const filtered = list.filter(p => {
    const q = search.toLowerCase();
    const matchQ = !q || p.poNumber?.toLowerCase().includes(q) || p.vendorName?.toLowerCase().includes(q) || p.projectId?.toLowerCase().includes(q);
    const matchS = status === 'All' || p.status === status;
    return matchQ && matchS;
  });

  return (
    <div style={{ fontFamily: C.font, color: C.text }}>
      <PageHeader
        tcode="ME2N"
        title="Purchase Orders — List"
        sub="MM — Materials Management"
        action={
          <div style={{ display: 'flex', gap: 4 }}>
            <Btn variant="secondary" onClick={() => api('/api/sap/purchase-orders').then(r => setList(r.data || []))} small>↻</Btn>
            <Btn onClick={() => navigate('/sap/purchase-orders/new')} small>ME21N — Create PO</Btn>
          </div>
        }
      />

      <div style={{ padding: '12px 20px', display: 'flex', gap: 8, flexWrap: 'wrap', borderBottom: `1px solid ${C.border}` }}>
        <div style={{ width: 260 }}>
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by PO#, vendor, project…" />
        </div>
        {statuses.map(s => (
          <button key={s} onClick={() => setStatus(s)}
            style={{ background: status === s ? `${C.blue}30` : 'transparent', border: `1px solid ${status === s ? C.blue : C.border}`, borderRadius: 2, padding: '4px 10px', fontSize: 11, fontWeight: 600, color: status === s ? C.white : C.muted, cursor: 'pointer', fontFamily: C.font }}>
            {s}
          </button>
        ))}
      </div>

      <div style={{ padding: '12px 20px' }}>
        <Panel>
          <Table
            cols={[
              { label: 'PO #',      key: 'poNumber' },
              { label: 'Project',   key: 'projectId' },
              { label: 'Vendor',    key: 'vendorName' },
              { label: 'Date',      render: r => fmtDate(r.orderDate), muted: true },
              { label: 'Due',       render: r => fmtDate(r.deliveryDate), muted: true },
              { label: 'Amount',    render: r => fmt(r.grandTotal), right: true },
              { label: 'Status',    render: r => <Badge status={r.status} /> },
            ]}
            rows={filtered}
            onRow={r => navigate(`/sap/projects/${r.projectId}`)}
            emptyMsg={loading ? 'Loading…' : 'No purchase orders'}
          />
        </Panel>
      </div>
    </div>
  );
}
