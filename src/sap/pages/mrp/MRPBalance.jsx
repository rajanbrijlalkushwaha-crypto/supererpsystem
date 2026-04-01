/**
 * SAP MODE — MRP Balance (cross-project view)
 */
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSAP } from '../../context/SAPContext';
import { Panel, Table, Badge, Btn, PageHeader, Select, C } from '../../components/SAPShared';

export default function MRPBalance() {
  const { api, projects } = useSAP();
  const navigate = useNavigate();
  const [projectId, setProjectId] = useState('');
  const [mrp, setMrp] = useState([]);
  const [loading, setLoading] = useState(false);

  const load = async (pid) => {
    if (!pid) return setMrp([]);
    setLoading(true);
    try {
      const r = await api(`/api/sap/mrp/${pid}/balance`);
      setMrp(r.data || []);
    } catch { setMrp([]); }
    setLoading(false);
  };

  useEffect(() => { if (projects.length > 0 && !projectId) { setProjectId(projects[0]?.projectId || ''); } }, [projects]);
  useEffect(() => { load(projectId); }, [projectId]);

  const pending   = mrp.filter(m => m.balanceToOrder > 0);
  const inTransit = mrp.filter(m => m.balanceToReceive > 0);

  return (
    <div style={{ fontFamily: C.font, color: C.text }}>
      <PageHeader
        title="MRP Balance"
        sub="Material Requirements Planning — order vs receipt status"
        action={<Btn onClick={() => navigate('/sap/purchase-orders/new')}>+ Create PO</Btn>}
      />

      <div style={{ padding: '12px 20px', borderBottom: `1px solid ${C.border}` }}>
        <div style={{ width: 320 }}>
          <Select value={projectId} onChange={e => setProjectId(e.target.value)}
            options={[{ value: '', label: '— Select Project —' }, ...projects.map(p => ({ value: p.projectId, label: `${p.projectId} — ${p.projectName}` }))]} />
        </div>
      </div>

      <div style={{ padding: '14px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {!projectId
          ? <div style={{ color: C.muted, fontSize: 13 }}>Select a project to view MRP balance.</div>
          : loading
          ? <div style={{ color: C.muted, fontSize: 13 }}>Loading…</div>
          : (
            <>
              {/* Summary */}
              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 4, padding: '10px 16px', borderLeft: `3px solid ${C.yellow}`, minWidth: 160 }}>
                  <div style={{ fontSize: 10, color: C.muted, fontWeight: 600, textTransform: 'uppercase' }}>Pending to Order</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: C.white }}>{pending.length}</div>
                  <div style={{ fontSize: 11, color: C.muted }}>items need PO</div>
                </div>
                <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 4, padding: '10px 16px', borderLeft: `3px solid ${C.cyan}`, minWidth: 160 }}>
                  <div style={{ fontSize: 10, color: C.muted, fontWeight: 600, textTransform: 'uppercase' }}>In Transit</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: C.white }}>{inTransit.length}</div>
                  <div style={{ fontSize: 11, color: C.muted }}>ordered, not received</div>
                </div>
                <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 4, padding: '10px 16px', borderLeft: `3px solid ${C.green}`, minWidth: 160 }}>
                  <div style={{ fontSize: 10, color: C.muted, fontWeight: 600, textTransform: 'uppercase' }}>Fully Fulfilled</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: C.white }}>{mrp.filter(m => m.fulfillmentPct >= 100).length}</div>
                  <div style={{ fontSize: 11, color: C.muted }}>of {mrp.length} total items</div>
                </div>
              </div>

              <Panel title="Material Balance Detail">
                <Table
                  cols={[
                    { label: 'Item Name',        key: 'itemName' },
                    { label: 'Type',             key: 'itemType', muted: true },
                    { label: 'Unit',             key: 'unit' },
                    { label: 'Required',         key: 'requiredQty',    right: true },
                    { label: 'Ordered',          key: 'orderedQty',     right: true },
                    { label: 'Received',         key: 'receivedQty',    right: true },
                    { label: 'Balance to Order', render: r => <span style={{ color: r.balanceToOrder > 0 ? C.yellow : C.green, fontWeight: r.balanceToOrder > 0 ? 700 : 400 }}>{r.balanceToOrder}</span>, right: true },
                    { label: 'Balance to Recv',  render: r => <span style={{ color: r.balanceToReceive > 0 ? C.cyan : C.green, fontWeight: r.balanceToReceive > 0 ? 700 : 400 }}>{r.balanceToReceive}</span>, right: true },
                    { label: 'Fulfillment %',    render: r => {
                      const pct = r.fulfillmentPct;
                      const clr = pct >= 100 ? C.green : pct > 50 ? C.yellow : C.red;
                      return (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
                          <div style={{ width: 50, height: 4, background: C.border, borderRadius: 2, overflow: 'hidden' }}>
                            <div style={{ width: `${Math.min(100, pct)}%`, height: '100%', background: clr, borderRadius: 2 }} />
                          </div>
                          <span style={{ color: clr, minWidth: 30, textAlign: 'right' }}>{pct}%</span>
                        </div>
                      );
                    }, right: true },
                  ]}
                  rows={mrp}
                  emptyMsg="No materials in plan for this project"
                />
              </Panel>

              {pending.length > 0 && (
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <Btn onClick={() => navigate(`/sap/purchase-orders/new?projectId=${projectId}`)}>
                    Create PO for {pending.length} Pending Item{pending.length > 1 ? 's' : ''}
                  </Btn>
                </div>
              )}
            </>
          )
        }
      </div>
    </div>
  );
}
