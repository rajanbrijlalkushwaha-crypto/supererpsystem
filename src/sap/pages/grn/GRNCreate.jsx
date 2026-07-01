/**
 * SAP MODE — Create GRN (Goods Receipt Note)
 * Fetches PO items and pre-fills pending quantities
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useSAP } from '../../context/SAPContext';
import { Panel, Btn, PageHeader, FormRow, Input, Select, Textarea, ErrorBox, C } from '../../components/SAPShared';

export default function GRNCreate() {
  const { api, projects, addNotification } = useSAP();
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const [form,   setForm]   = useState({ projectId: params.get('projectId') || '', poId: params.get('poId') || '', receivedDate: new Date().toISOString().slice(0,10), warehouse: 'Main Store', notes: '' });
  const [items,  setItems]  = useState([]);
  const [pos,    setPos]    = useState([]);
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  /* Load POs for selected project */
  const loadPOs = useCallback(async (pid) => {
    if (!pid) return setPos([]);
    try {
      const r = await api(`/api/sap/purchase-orders?projectId=${pid}`);
      setPos((r.data || []).filter(p => p.status !== 'Cancelled' && p.status !== 'Received'));
    } catch { setPos([]); }
  }, [api]);

  useEffect(() => { loadPOs(form.projectId); }, [form.projectId, loadPOs]);

  /* Load PO items when PO selected */
  const loadPOItems = useCallback(async (poId) => {
    if (!poId) return setItems([]);
    try {
      const r = await api(`/api/sap/purchase-orders/${poId}`);
      const po = r.data;
      setItems((po.items || []).map(it => ({
        itemName: it.itemName,
        unit: it.unit,
        poQty: it.orderedQty,
        pendingQty: it.pendingQty ?? (it.orderedQty - (it.receivedQty || 0)),
        receivedQty: it.pendingQty ?? (it.orderedQty - (it.receivedQty || 0)),
      })));
    } catch { setItems([]); }
  }, [api]);

  useEffect(() => { loadPOItems(form.poId); }, [form.poId, loadPOItems]);

  const setItem = (i, v) => setItems(p => p.map((r, ri) => ri === i ? { ...r, receivedQty: parseFloat(v) || 0 } : r));

  const submit = async () => {
    if (!form.projectId) return setError('Project is required');
    if (!form.poId)      return setError('Purchase Order is required');
    if (items.length === 0) return setError('No items to receive');
    setSaving(true); setError('');
    try {
      const body = { ...form, items: items.map(it => ({ itemName: it.itemName, unit: it.unit, receivedQty: it.receivedQty })) };
      const res  = await api('/api/sap/grn', { method: 'POST', data: body });
      const grnId = res.data.grnId;
      /* Auto-post the GRN */
      await api(`/api/sap/grn/${grnId}/post`, { method: 'POST', data: { companyId: body.companyId } });
      addNotification(`GRN ${res.data.grnNumber} posted — inventory updated`);
      navigate(`/sap/projects/${form.projectId}`);
    } catch(e) { setError(e.response?.data?.error || e.message); }
    setSaving(false);
  };

  return (
    <div style={{ fontFamily: C.font, color: C.text }}>
      <PageHeader
        title="New Goods Receipt (GRN)"
        sub="Record material receipt against a purchase order"
        action={
          <>
            <Btn variant="secondary" onClick={() => navigate('/sap/grn')}>Cancel</Btn>
            <Btn onClick={submit} disabled={saving}>{saving ? 'Saving…' : 'Create & Post GRN'}</Btn>
          </>
        }
      />

      <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <ErrorBox msg={error} />

        <Panel title="GRN Details">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            <FormRow label="Project" required half>
              <Select value={form.projectId} onChange={e => { set('projectId', e.target.value); set('poId', ''); setItems([]); }}
                options={[{ value: '', label: '— Select Project —' }, ...projects.map(p => ({ value: p.projectId, label: `${p.projectId} — ${p.projectName}` }))]} />
            </FormRow>
            <FormRow label="Purchase Order" required half>
              <Select value={form.poId} onChange={e => set('poId', e.target.value)}
                options={[{ value: '', label: '— Select PO —' }, ...pos.map(p => ({ value: p.poId, label: `${p.poNumber} — ${p.vendorName}` }))]}
                disabled={!form.projectId} />
            </FormRow>
            <FormRow label="Receipt Date" half>
              <Input type="date" value={form.receivedDate} onChange={e => set('receivedDate', e.target.value)} />
            </FormRow>
            <FormRow label="Warehouse / Store" half>
              <Input value={form.warehouse} onChange={e => set('warehouse', e.target.value)} />
            </FormRow>
            <FormRow label="Notes">
              <Textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={2} />
            </FormRow>
          </div>
        </Panel>

        {items.length > 0 && (
          <Panel title="Items to Receive">
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead><tr style={{ background: C.surface2 }}>
                {['Item Name','Unit','PO Qty','Pending Qty','Received Qty (Enter)'].map((h,i) => (
                  <th key={i} style={{ padding: '5px 8px', textAlign: i >= 2 ? 'right' : 'left', color: C.muted, fontWeight: 600, fontSize: 11, borderBottom: `1px solid ${C.border}` }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {items.map((it, i) => (
                  <tr key={i} style={{ borderBottom: `1px solid ${C.border}` }}>
                    <td style={{ padding: '6px 8px', color: C.white }}>{it.itemName}</td>
                    <td style={{ padding: '6px 8px', color: C.muted }}>{it.unit}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', color: C.muted }}>{it.poQty}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', color: C.yellow }}>{it.pendingQty}</td>
                    <td style={{ padding: '4px 8px', textAlign: 'right', width: 140 }}>
                      <Input type="number" value={it.receivedQty} onChange={e => setItem(i, e.target.value)} min="0" max={it.pendingQty} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        )}

        {!form.poId && form.projectId && (
          <div style={{ color: C.muted, fontSize: 12, padding: '8px 0' }}>Select a purchase order to see items.</div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Btn variant="secondary" onClick={() => navigate('/sap/grn')}>Cancel</Btn>
          <Btn onClick={submit} disabled={saving || items.length === 0}>{saving ? 'Saving…' : 'Create & Post GRN'}</Btn>
        </div>
      </div>
    </div>
  );
}
