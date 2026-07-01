/**
 * SAP MODE — Create Production Order
 */
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSAP } from '../../context/SAPContext';
import { Panel, Btn, PageHeader, FormRow, Input, Select, Textarea, ErrorBox, C } from '../../components/SAPShared';

const BLANK_ISSUE = { itemName: '', unit: 'NOS', issuedQty: 0 };

export default function ProductionCreate() {
  const { api, projects, addNotification } = useSAP();
  const navigate = useNavigate();

  const [form,   setForm]   = useState({ projectId: '', itemName: '', unit: 'NOS', plannedQty: 1, startDate: new Date().toISOString().slice(0,10), notes: '' });
  const [issues, setIssues] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const addIssue = () => setIssues(p => [...p, { ...BLANK_ISSUE }]);
  const setIssue = (i, k, v) => setIssues(p => p.map((r, ri) => ri === i ? { ...r, [k]: v } : r));
  const delIssue = (i) => setIssues(p => p.filter((_, ri) => ri !== i));

  const submit = async () => {
    if (!form.projectId) return setError('Project is required');
    if (!form.itemName)  return setError('Item Name is required');
    setSaving(true); setError('');
    try {
      const body = { ...form, plannedQty: parseFloat(form.plannedQty) || 1, materialIssues: issues };
      const res  = await api('/api/sap/production', { method: 'POST', data: body });
      addNotification(`Production Order ${res.data.prodId} created`);
      navigate(`/sap/projects/${form.projectId}`);
    } catch(e) { setError(e.response?.data?.error || e.message); }
    setSaving(false);
  };

  return (
    <div style={{ fontFamily: C.font, color: C.text }}>
      <PageHeader
        title="New Production Order"
        sub="Create a production / manufacturing work order"
        action={
          <>
            <Btn variant="secondary" onClick={() => navigate('/sap/production')}>Cancel</Btn>
            <Btn onClick={submit} disabled={saving}>{saving ? 'Saving…' : 'Create'}</Btn>
          </>
        }
      />

      <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <ErrorBox msg={error} />

        <Panel title="Production Details">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            <FormRow label="Project" required half>
              <Select value={form.projectId} onChange={e => set('projectId', e.target.value)}
                options={[{ value: '', label: '— Select Project —' }, ...projects.map(p => ({ value: p.projectId, label: `${p.projectId} — ${p.projectName}` }))]} />
            </FormRow>
            <FormRow label="Item to Produce" required half>
              <Input value={form.itemName} onChange={e => set('itemName', e.target.value)} placeholder="e.g. MS Frame Assembly" />
            </FormRow>
            <FormRow label="Unit" half>
              <Select value={form.unit} onChange={e => set('unit', e.target.value)}
                options={['NOS', 'KG', 'MTR', 'SQM', 'SQF', 'SET', 'LOT']} />
            </FormRow>
            <FormRow label="Planned Qty" required half>
              <Input type="number" value={form.plannedQty} onChange={e => set('plannedQty', e.target.value)} min="0" />
            </FormRow>
            <FormRow label="Start Date" half>
              <Input type="date" value={form.startDate} onChange={e => set('startDate', e.target.value)} />
            </FormRow>
            <FormRow label="Notes">
              <Textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={2} />
            </FormRow>
          </div>
        </Panel>

        <Panel title="Material Issues (Optional)" action={<Btn small onClick={addIssue}>+ Add Material</Btn>}>
          <div style={{ fontSize: 12, color: C.muted, marginBottom: issues.length > 0 ? 8 : 0 }}>
            {issues.length === 0 ? 'Define raw materials consumed during production. These will be deducted from inventory when you mark production Complete.' : ''}
          </div>
          {issues.length > 0 && (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead><tr style={{ background: C.surface2 }}>
                {['Item Name','Unit','Issue Qty',''].map((h,i) => (
                  <th key={i} style={{ padding: '5px 8px', textAlign: i === 2 ? 'right' : 'left', color: C.muted, fontWeight: 600, fontSize: 11, borderBottom: `1px solid ${C.border}` }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {issues.map((it, i) => (
                  <tr key={i} style={{ borderBottom: `1px solid ${C.border}` }}>
                    <td style={{ padding: '4px 6px', minWidth: 200 }}><Input value={it.itemName} onChange={e => setIssue(i,'itemName',e.target.value)} placeholder="Raw material name" /></td>
                    <td style={{ padding: '4px 6px', width: 80 }}><Input value={it.unit} onChange={e => setIssue(i,'unit',e.target.value)} /></td>
                    <td style={{ padding: '4px 6px', width: 100 }}><Input type="number" value={it.issuedQty} onChange={e => setIssue(i,'issuedQty',e.target.value)} min="0" /></td>
                    <td style={{ padding: '4px 6px' }}><Btn small variant="danger" onClick={() => delIssue(i)}>✕</Btn></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Btn variant="secondary" onClick={() => navigate('/sap/production')}>Cancel</Btn>
          <Btn onClick={submit} disabled={saving}>{saving ? 'Saving…' : 'Create Production Order'}</Btn>
        </div>
      </div>
    </div>
  );
}
