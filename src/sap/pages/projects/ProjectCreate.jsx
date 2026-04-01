/**
 * SAP MODE — Create Project
 */
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSAP } from '../../context/SAPContext';
import { Panel, Btn, PageHeader, FormRow, Input, Select, Textarea, ErrorBox, C } from '../../components/SAPShared';

const TYPES   = ['Prefab', 'Cabin', 'Civil', 'Trading'];
const STATUSES = ['Planning', 'Active'];

const BLANK_MATERIAL = { itemName: '', itemType: 'Raw Material', unit: 'NOS', requiredQty: 1, bomLines: [] };
const BLANK_SCOPE    = { description: '', unit: 'NOS', qty: 1, rate: 0 };

export default function ProjectCreate() {
  const { api, addNotification, refreshProjects } = useSAP();
  const navigate = useNavigate();

  const [form,    setForm]    = useState({ projectName:'', clientName:'', clientId:'', location:'', projectType:'Prefab', startDate:'', endDate:'', budget:'', status:'Planning', notes:'' });
  const [scope,   setScope]   = useState([]);
  const [mats,    setMats]    = useState([]);
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState('');
  const [clients, setClients] = useState([]);

  useEffect(() => {
    api('/api/clients').then(r => setClients(r.data || [])).catch(() => {});
  }, [api]);

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  /* Scope rows */
  const addScope = () => setScope(p => [...p, { ...BLANK_SCOPE }]);
  const setScope_ = (i, k, v) => setScope(p => p.map((r, ri) => ri === i ? { ...r, [k]: v } : r));
  const delScope  = (i) => setScope(p => p.filter((_, ri) => ri !== i));

  /* Material rows */
  const addMat = () => setMats(p => [...p, { ...BLANK_MATERIAL }]);
  const setMat  = (i, k, v) => setMats(p => p.map((r, ri) => ri === i ? { ...r, [k]: v } : r));
  const delMat  = (i) => setMats(p => p.filter((_, ri) => ri !== i));

  const submit = async () => {
    if (!form.projectName.trim()) return setError('Project Name is required');
    if (!form.clientName.trim())  return setError('Client Name is required');
    setSaving(true); setError('');
    try {
      const body = { ...form, budget: parseFloat(form.budget) || 0, scopeItems: scope, materialItems: mats };
      const res  = await api('/api/sap/projects', { method: 'POST', data: body });
      addNotification(`Project ${res.data.projectId} created`, 'success');
      refreshProjects();
      navigate(`/sap/projects/${res.data.projectId}`);
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    }
    setSaving(false);
  };

  const inputRow = (label, key, type, required) => (
    <FormRow label={label} required={required} half>
      <Input type={type || 'text'} value={form[key]} onChange={e => set(key, e.target.value)} />
    </FormRow>
  );

  return (
    <div style={{ fontFamily: C.font, color: C.text }}>
      <PageHeader
        title="Create New Project"
        sub="SAP Project — root entity for all document flow"
        action={
          <>
            <Btn variant="secondary" onClick={() => navigate('/sap/projects')}>Cancel</Btn>
            <Btn onClick={submit} disabled={saving}>{saving ? 'Creating…' : 'Create Project'}</Btn>
          </>
        }
      />

      <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <ErrorBox msg={error} />

        {/* Basic info */}
        <Panel title="Project Information">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            {inputRow('Project Name', 'projectName', 'text', true)}
            <FormRow label="Client Name" required half>
              <div style={{ display: 'flex', gap: 6 }}>
                <Input value={form.clientName} onChange={e => set('clientName', e.target.value)} placeholder="Type or select…" />
                {clients.length > 0 && (
                  <select onChange={e => { const c = clients.find(x => x.clientId === e.target.value); if(c) { set('clientName', c.clientName); set('clientId', c.clientId); } }}
                    style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 2, padding: '5px', fontSize: 12, color: C.text, fontFamily: C.font }}>
                    <option value="">Pick</option>
                    {clients.map(c => <option key={c.clientId} value={c.clientId}>{c.clientName}</option>)}
                  </select>
                )}
              </div>
            </FormRow>
            {inputRow('Location / Site', 'location')}
            <FormRow label="Project Type" half>
              <Select value={form.projectType} onChange={e => set('projectType', e.target.value)} options={TYPES} />
            </FormRow>
            <FormRow label="Initial Status" half>
              <Select value={form.status} onChange={e => set('status', e.target.value)} options={STATUSES} />
            </FormRow>
            {inputRow('Budget (₹)', 'budget', 'number')}
            {inputRow('Start Date', 'startDate', 'date')}
            {inputRow('End Date',   'endDate',   'date')}
            <FormRow label="Notes" style={{ flex: '1 1 100%' }}>
              <Textarea value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Project scope, special instructions…" />
            </FormRow>
          </div>
        </Panel>

        {/* Scope of Work */}
        <Panel title="Scope of Work (Optional)" action={<Btn small onClick={addScope}>+ Add Row</Btn>}>
          {scope.length === 0
            ? <div style={{ color: C.muted, fontSize: 12 }}>No scope items added. Click "+ Add Row" to define deliverables.</div>
            : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead><tr style={{ background: C.surface2 }}>
                  {['Description','Unit','Qty','Rate (₹)',''].map((h,i) => <th key={i} style={{ padding: '5px 8px', textAlign:'left', color: C.muted, fontWeight:600, fontSize:11, borderBottom:`1px solid ${C.border}` }}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {scope.map((r, i) => (
                    <tr key={i} style={{ borderBottom: `1px solid ${C.border}` }}>
                      <td style={{ padding: '4px 6px', width: '40%' }}><Input value={r.description} onChange={e => setScope_(i,'description',e.target.value)} placeholder="e.g. Supply & Erection of Cabin" /></td>
                      <td style={{ padding: '4px 6px', width: '12%' }}><Input value={r.unit} onChange={e => setScope_(i,'unit',e.target.value)} /></td>
                      <td style={{ padding: '4px 6px', width: '12%' }}><Input type="number" value={r.qty} onChange={e => setScope_(i,'qty',e.target.value)} min="0" /></td>
                      <td style={{ padding: '4px 6px', width: '18%' }}><Input type="number" value={r.rate} onChange={e => setScope_(i,'rate',e.target.value)} min="0" /></td>
                      <td style={{ padding: '4px 6px' }}><Btn small variant="danger" onClick={() => delScope(i)}>✕</Btn></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          }
        </Panel>

        {/* Material Plan */}
        <Panel title="Material Plan / BOM (Optional)" action={<Btn small onClick={addMat}>+ Add Material</Btn>}>
          {mats.length === 0
            ? <div style={{ color: C.muted, fontSize: 12 }}>No materials added. Define materials to enable MRP balance tracking.</div>
            : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead><tr style={{ background: C.surface2 }}>
                  {['Item Name','Type','Unit','Required Qty',''].map((h,i) => <th key={i} style={{ padding: '5px 8px', textAlign:'left', color: C.muted, fontWeight:600, fontSize:11, borderBottom:`1px solid ${C.border}` }}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {mats.map((r, i) => (
                    <tr key={i} style={{ borderBottom: `1px solid ${C.border}` }}>
                      <td style={{ padding: '4px 6px', width: '35%' }}><Input value={r.itemName} onChange={e => setMat(i,'itemName',e.target.value)} placeholder="e.g. MS Pipe 50mm" /></td>
                      <td style={{ padding: '4px 6px', width: '18%' }}>
                        <select value={r.itemType} onChange={e => setMat(i,'itemType',e.target.value)}
                          style={{ background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 2, padding: '5px 6px', fontSize: 12, color: C.white, fontFamily: C.font, width: '100%' }}>
                          <option>Raw Material</option><option>Manufactured</option><option>Bought Out</option>
                        </select>
                      </td>
                      <td style={{ padding: '4px 6px', width: '12%' }}><Input value={r.unit} onChange={e => setMat(i,'unit',e.target.value)} /></td>
                      <td style={{ padding: '4px 6px', width: '14%' }}><Input type="number" value={r.requiredQty} onChange={e => setMat(i,'requiredQty',e.target.value)} min="0" /></td>
                      <td style={{ padding: '4px 6px' }}><Btn small variant="danger" onClick={() => delMat(i)}>✕</Btn></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          }
        </Panel>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Btn variant="secondary" onClick={() => navigate('/sap/projects')}>Cancel</Btn>
          <Btn onClick={submit} disabled={saving}>{saving ? 'Creating…' : 'Create Project'}</Btn>
        </div>
      </div>
    </div>
  );
}
