/**
 * SAP MODE — Document Flow Report
 */
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSAP } from '../../context/SAPContext';
import { Panel, Table, Badge, Btn, PageHeader, Select, C, fmt, fmtDate } from '../../components/SAPShared';

const CHAIN = ['salesOrders', 'purchaseOrders', 'grns', 'productions', 'invoices', 'payments'];
const CHAIN_LABELS = { salesOrders:'Sales Orders', purchaseOrders:'Purchase Orders', grns:'GRNs', productions:'Production', invoices:'Invoices', payments:'Payments' };

export default function DocFlowReport() {
  const { api, projects } = useSAP();
  const navigate = useNavigate();
  const [projectId, setProjectId] = useState('');
  const [flow,      setFlow]      = useState(null);
  const [loading,   setLoading]   = useState(false);

  useEffect(() => { if (projects.length > 0 && !projectId) setProjectId(projects[0]?.projectId || ''); }, [projects]);

  const load = async (pid) => {
    if (!pid) return setFlow(null);
    setLoading(true);
    try {
      const r = await api(`/api/sap/mrp/${pid}/document-flow`);
      setFlow(r.data);
    } catch { setFlow(null); }
    setLoading(false);
  };

  useEffect(() => { load(projectId); }, [projectId]);

  const proj = projects.find(p => p.projectId === projectId);

  return (
    <div style={{ fontFamily: C.font, color: C.text }}>
      <PageHeader
        title="Document Flow Report"
        sub="End-to-end document chain per project"
        action={projectId && <Btn onClick={() => navigate(`/sap/projects/${projectId}`)}>Open Project</Btn>}
      />

      <div style={{ padding: '12px 20px', borderBottom: `1px solid ${C.border}` }}>
        <div style={{ width: 360 }}>
          <Select value={projectId} onChange={e => setProjectId(e.target.value)}
            options={[{ value: '', label: '— Select Project —' }, ...projects.map(p => ({ value: p.projectId, label: `${p.projectId} — ${p.projectName}` }))]} />
        </div>
      </div>

      {loading && <div style={{ padding: 20, color: C.muted, fontSize: 13 }}>Loading…</div>}

      {flow && (
        <div style={{ padding: '14px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Summary bar */}
          <div style={{ display: 'flex', gap: 0, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 4, overflow: 'hidden' }}>
            {CHAIN.map((key, i) => {
              const count = (flow[key] || []).length;
              const clrs  = ['#4F46E5','#D97706','#10B981','#7C3AED','#0891B2','#10B981'];
              return (
                <div key={key} style={{ flex: 1, padding: '10px 12px', borderRight: i < CHAIN.length-1 ? `1px solid ${C.border}` : 'none', position: 'relative' }}>
                  {i < CHAIN.length-1 && <div style={{ position: 'absolute', right: -6, top: '50%', transform: 'translateY(-50%)', color: C.muted, zIndex: 1, fontSize: 14 }}>→</div>}
                  <div style={{ fontSize: 18, fontWeight: 700, color: count > 0 ? clrs[i] : C.muted }}>{count}</div>
                  <div style={{ fontSize: 10, color: C.muted, fontWeight: 600, textTransform: 'uppercase' }}>{CHAIN_LABELS[key]}</div>
                </div>
              );
            })}
          </div>

          {/* Project header */}
          {proj && (
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 4, padding: '10px 14px', borderLeft: `3px solid ${C.blue}` }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: C.white }}>{proj.projectId} — {proj.projectName}</span>
              <span style={{ fontSize: 12, color: C.muted, marginLeft: 12 }}>{proj.clientName} | {proj.projectType}</span>
              <Badge status={proj.status} />
            </div>
          )}

          {/* Each document type */}
          {CHAIN.map(key => {
            const docs = flow[key] || [];
            if (docs.length === 0) return null;

            const colMap = {
              salesOrders:    [{ label:'SO #', key:'soNumber'}, {label:'Client', key:'clientName'}, {label:'Amount', render:r=>fmt(r.grandTotal), right:true}, {label:'Status', render:r=><Badge status={r.status}/>}, {label:'Date', render:r=>fmtDate(r.orderDate), muted:true}],
              purchaseOrders: [{ label:'PO #', key:'poNumber'}, {label:'Vendor', key:'vendorName'}, {label:'Amount', render:r=>fmt(r.grandTotal), right:true}, {label:'Status', render:r=><Badge status={r.status}/>}, {label:'Date', render:r=>fmtDate(r.orderDate), muted:true}],
              grns:           [{ label:'GRN #', key:'grnNumber'}, {label:'PO Ref', key:'poId'}, {label:'Status', render:r=><Badge status={r.posted?'Posted':'Not Posted'}/>}, {label:'Date', render:r=>fmtDate(r.receiptDate), muted:true}],
              productions:    [{ label:'Prod ID', key:'prodId'}, {label:'Item', key:'itemName'}, {label:'Planned', key:'plannedQty', right:true}, {label:'Produced', key:'producedQty', right:true}, {label:'Status', render:r=><Badge status={r.status}/>}],
              invoices:       [{ label:'Inv #', key:'invNumber'}, {label:'Amount', render:r=>fmt(r.grandTotal), right:true}, {label:'Paid', render:r=>fmt(r.paidAmount), right:true}, {label:'Status', render:r=><Badge status={r.status}/>}, {label:'Date', render:r=>fmtDate(r.invoiceDate), muted:true}],
              payments:       [{ label:'Pay ID', key:'payId'}, {label:'Amount', render:r=><span style={{color:C.green, fontWeight:700}}>{fmt(r.amount)}</span>, right:true}, {label:'Mode', key:'paymentMode', muted:true}, {label:'Date', render:r=>fmtDate(r.paymentDate), muted:true}],
            };

            return (
              <Panel key={key} title={CHAIN_LABELS[key]}>
                <Table cols={colMap[key]} rows={docs} />
              </Panel>
            );
          })}

          {CHAIN.every(key => (flow[key] || []).length === 0) && (
            <div style={{ color: C.muted, fontSize: 13 }}>No documents found for this project.</div>
          )}
        </div>
      )}
    </div>
  );
}
