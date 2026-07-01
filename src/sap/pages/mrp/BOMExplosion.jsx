/**
 * SAP MODE — BOM Explosion
 */
import React, { useState, useEffect } from 'react';
import { useSAP } from '../../context/SAPContext';
import { Panel, Table, PageHeader, Select, C } from '../../components/SAPShared';

export default function BOMExplosion() {
  const { api, projects } = useSAP();
  const [projectId, setProjectId] = useState('');
  const [bom, setBom] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => { if (projects.length > 0 && !projectId) setProjectId(projects[0]?.projectId || ''); }, [projects]);

  const load = async (pid) => {
    if (!pid) return setBom([]);
    setLoading(true);
    try {
      const r = await api(`/api/sap/mrp/${pid}/bom-explosion`);
      setBom(r.data || []);
    } catch { setBom([]); }
    setLoading(false);
  };

  useEffect(() => { load(projectId); }, [projectId]);

  return (
    <div style={{ fontFamily: C.font, color: C.text }}>
      <PageHeader title="BOM Explosion" sub="Bill of Materials breakdown for manufactured items" />

      <div style={{ padding: '12px 20px', borderBottom: `1px solid ${C.border}` }}>
        <div style={{ width: 320 }}>
          <Select value={projectId} onChange={e => setProjectId(e.target.value)}
            options={[{ value: '', label: '— Select Project —' }, ...projects.map(p => ({ value: p.projectId, label: `${p.projectId} — ${p.projectName}` }))]} />
        </div>
      </div>

      <div style={{ padding: '14px 20px' }}>
        {!projectId
          ? <div style={{ color: C.muted, fontSize: 13 }}>Select a project to view BOM explosion.</div>
          : loading
          ? <div style={{ color: C.muted, fontSize: 13 }}>Loading…</div>
          : bom.length === 0
          ? <div style={{ color: C.muted, fontSize: 13 }}>No manufactured items with BOM in this project.</div>
          : bom.map((item, i) => (
            <div key={i} style={{ marginBottom: 16 }}>
              <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 4, padding: '8px 12px', marginBottom: 4, borderLeft: `3px solid ${C.blue}` }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: C.white }}>{item.itemName}</span>
                <span style={{ fontSize: 11, color: C.muted, marginLeft: 10 }}>Required Qty: {item.requiredQty} {item.unit}</span>
              </div>
              <Panel>
                <Table
                  cols={[
                    { label: 'Raw Material',     key: 'rawMaterial' },
                    { label: 'Unit',             key: 'unit' },
                    { label: 'BOM Qty (per unit)',key: 'bomQty', right: true },
                    { label: 'Total Required',   key: 'totalQty', right: true },
                  ]}
                  rows={item.bomLines || []}
                  emptyMsg="No BOM lines defined"
                />
              </Panel>
            </div>
          ))
        }
      </div>
    </div>
  );
}
