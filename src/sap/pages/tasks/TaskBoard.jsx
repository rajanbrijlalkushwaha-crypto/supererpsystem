/**
 * SAP MODE — Task Board (Kanban + List view)
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useSAP } from '../../context/SAPContext';
import { Panel, Badge, Btn, PageHeader, FormRow, Input, Select, Textarea, ErrorBox, C, fmtDate } from '../../components/SAPShared';

const STATUSES   = ['Open', 'InProgress', 'Done', 'Blocked'];
const PRIORITIES = ['High', 'Medium', 'Low'];

const STATUS_CLR = { Open: C.muted, InProgress: '#0891B2', Done: '#10B981', Blocked: '#EF4444' };
const PRI_CLR    = { High: '#EF4444', Medium: '#F59E0B', Low: '#10B981' };

const BLANK = { projectId: '', title: '', description: '', assignedTo: '', priority: 'Medium', startDate: new Date().toISOString().slice(0,10), endDate: '' };

export default function TaskBoard() {
  const { api, projects } = useSAP();
  const [tasks,   setTasks]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter,  setFilter]  = useState({ projectId: '', status: 'All' });
  const [view,    setView]    = useState('kanban'); // kanban | list
  const [showNew, setShowNew] = useState(false);
  const [form,    setForm]    = useState({ ...BLANK });
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState('');
  const [editing, setEditing] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const q   = filter.projectId ? `?projectId=${filter.projectId}` : '';
      const res = await api(`/api/sap/tasks${q}`);
      setTasks(res.data || []);
    } catch {}
    setLoading(false);
  }, [api, filter.projectId]);

  useEffect(() => { load(); }, [load]);

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const submitNew = async () => {
    if (!form.projectId) return setError('Project required');
    if (!form.title)     return setError('Title required');
    setSaving(true); setError('');
    try {
      await api('/api/sap/tasks', { method: 'POST', data: form });
      setForm({ ...BLANK });
      setShowNew(false);
      load();
    } catch(e) { setError(e.response?.data?.error || e.message); }
    setSaving(false);
  };

  const changeStatus = async (task, status) => {
    try {
      await api(`/api/sap/tasks/${task.taskId}/status`, { method: 'PATCH', data: { status } });
      load();
    } catch {}
  };

  const deleteTask = async (task) => {
    if (!window.confirm(`Delete task "${task.title}"?`)) return;
    try { await api(`/api/sap/tasks/${task.taskId}?companyId=`, { method: 'DELETE' }); load(); } catch {}
  };

  const filtered = tasks.filter(t => {
    const matchS = filter.status === 'All' || t.status === filter.status;
    return matchS;
  });

  /* Kanban columns */
  const columns = STATUSES.map(s => ({ status: s, tasks: filtered.filter(t => t.status === s) }));

  return (
    <div style={{ fontFamily: C.font, color: C.text }}>
      <PageHeader
        title="Tasks"
        sub={`${tasks.length} total tasks across ${projects.length} projects`}
        action={
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ display: 'flex', background: C.surface2, borderRadius: 3, padding: 2 }}>
              {[['kanban','⊞ Kanban'],['list','≡ List']].map(([v,l]) => (
                <button key={v} onClick={() => setView(v)}
                  style={{ background: view === v ? C.blue : 'transparent', border: 'none', borderRadius: 2, padding: '3px 10px', fontSize: 11, color: view === v ? '#fff' : C.muted, cursor: 'pointer', fontFamily: C.font, fontWeight: 600 }}>
                  {l}
                </button>
              ))}
            </div>
            <Btn onClick={() => setShowNew(p => !p)}>{showNew ? '✕ Cancel' : '+ New Task'}</Btn>
          </div>
        }
      />

      {/* Filter bar */}
      <div style={{ display: 'flex', gap: 8, padding: '10px 20px', borderBottom: `1px solid ${C.border}`, flexWrap: 'wrap' }}>
        <select value={filter.projectId} onChange={e => setFilter(p => ({ ...p, projectId: e.target.value }))}
          style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 2, padding: '4px 8px', fontSize: 11, color: C.text, fontFamily: C.font }}>
          <option value="">All Projects</option>
          {projects.map(p => <option key={p.projectId} value={p.projectId}>{p.projectId} — {p.projectName}</option>)}
        </select>
        {['All', ...STATUSES].map(s => (
          <button key={s} onClick={() => setFilter(p => ({ ...p, status: s }))}
            style={{ background: filter.status === s ? `${STATUS_CLR[s] || C.blue}25` : 'transparent', border: `1px solid ${filter.status === s ? STATUS_CLR[s] || C.blue : C.border}`, borderRadius: 2, padding: '4px 10px', fontSize: 11, fontWeight: 600, color: filter.status === s ? C.white : C.muted, cursor: 'pointer', fontFamily: C.font }}>
            {s}
          </button>
        ))}
        <span style={{ marginLeft: 'auto', fontSize: 11, color: C.muted, alignSelf: 'center' }}>{filtered.length} tasks</span>
      </div>

      {/* New task form */}
      {showNew && (
        <div style={{ padding: '12px 20px', borderBottom: `1px solid ${C.border}` }}>
          <ErrorBox msg={error} />
          <Panel title="Create Task">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
              <FormRow label="Project" required half>
                <Select value={form.projectId} onChange={e => set('projectId', e.target.value)}
                  options={[{ value: '', label: '— Select Project —' }, ...projects.map(p => ({ value: p.projectId, label: `${p.projectId} — ${p.projectName}` }))]} />
              </FormRow>
              <FormRow label="Task Title" required half>
                <Input value={form.title} onChange={e => set('title', e.target.value)} placeholder="e.g. Install cabin frame" />
              </FormRow>
              <FormRow label="Assigned To" half>
                <Input value={form.assignedTo} onChange={e => set('assignedTo', e.target.value)} placeholder="Name or team" />
              </FormRow>
              <FormRow label="Priority" half>
                <Select value={form.priority} onChange={e => set('priority', e.target.value)} options={PRIORITIES} />
              </FormRow>
              <FormRow label="Start Date" half>
                <Input type="date" value={form.startDate} onChange={e => set('startDate', e.target.value)} />
              </FormRow>
              <FormRow label="End Date" half>
                <Input type="date" value={form.endDate} onChange={e => set('endDate', e.target.value)} />
              </FormRow>
              <FormRow label="Description">
                <Textarea value={form.description} onChange={e => set('description', e.target.value)} rows={2} placeholder="Task details…" />
              </FormRow>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
              <Btn onClick={submitNew} disabled={saving}>{saving ? 'Saving…' : 'Create Task'}</Btn>
            </div>
          </Panel>
        </div>
      )}

      <div style={{ padding: '14px 20px' }}>
        {loading
          ? <div style={{ color: C.muted, fontSize: 13 }}>Loading…</div>
          : view === 'kanban'
          ? (
            /* ── Kanban board ── */
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, alignItems: 'start' }}>
              {columns.map(col => (
                <div key={col.status}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, padding: '6px 10px', background: C.surface, border: `1px solid ${C.border}`, borderRadius: 3, borderTop: `3px solid ${STATUS_CLR[col.status]}` }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: STATUS_CLR[col.status], textTransform: 'uppercase', letterSpacing: '0.4px' }}>{col.status}</span>
                    <span style={{ marginLeft: 'auto', background: `${STATUS_CLR[col.status]}25`, color: STATUS_CLR[col.status], borderRadius: 10, padding: '1px 7px', fontSize: 10, fontWeight: 700 }}>{col.tasks.length}</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {col.tasks.map(task => (
                      <TaskCard key={task.taskId} task={task} onStatus={changeStatus} onDelete={deleteTask} projects={projects} />
                    ))}
                    {col.tasks.length === 0 && (
                      <div style={{ padding: '16px 10px', color: C.muted, fontSize: 12, textAlign: 'center', border: `1px dashed ${C.border}`, borderRadius: 3 }}>
                        No tasks
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )
          : (
            /* ── List view ── */
            <Panel>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead><tr style={{ background: C.surface2 }}>
                  {['Title','Project','Assigned To','Priority','Status','Start','End',''].map((h,i) => (
                    <th key={i} style={{ padding: '5px 8px', textAlign: 'left', color: C.muted, fontWeight: 600, fontSize: 10, borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {filtered.length === 0
                    ? <tr><td colSpan={8} style={{ padding: 20, textAlign: 'center', color: C.muted }}>No tasks</td></tr>
                    : filtered.map(task => (
                      <tr key={task.taskId} style={{ borderBottom: `1px solid ${C.border}` }}>
                        <td style={{ padding: '6px 8px', color: C.white, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.title}</td>
                        <td style={{ padding: '6px 8px', color: C.muted, fontSize: 11 }}>{task.projectId}</td>
                        <td style={{ padding: '6px 8px', color: C.text }}>{task.assignedTo || '—'}</td>
                        <td style={{ padding: '6px 8px' }}><span style={{ color: PRI_CLR[task.priority], fontWeight: 700, fontSize: 10 }}>{task.priority}</span></td>
                        <td style={{ padding: '6px 8px' }}>
                          <select value={task.status} onChange={e => changeStatus(task, e.target.value)}
                            style={{ background: `${STATUS_CLR[task.status]}20`, border: `1px solid ${STATUS_CLR[task.status]}50`, borderRadius: 2, padding: '2px 6px', fontSize: 10, color: STATUS_CLR[task.status], fontFamily: C.font, fontWeight: 700 }}>
                            {STATUSES.map(s => <option key={s}>{s}</option>)}
                          </select>
                        </td>
                        <td style={{ padding: '6px 8px', color: C.muted, fontSize: 11 }}>{fmtDate(task.startDate)}</td>
                        <td style={{ padding: '6px 8px', color: C.muted, fontSize: 11 }}>{task.endDate ? fmtDate(task.endDate) : '—'}</td>
                        <td style={{ padding: '6px 8px' }}><Btn small variant="danger" onClick={() => deleteTask(task)}>✕</Btn></td>
                      </tr>
                    ))
                  }
                </tbody>
              </table>
            </Panel>
          )
        }
      </div>
    </div>
  );
}

/* ── Task card (Kanban) ── */
function TaskCard({ task, onStatus, onDelete, projects }) {
  const proj = projects.find(p => p.projectId === task.projectId);
  const STATUS_NEXT = { Open: 'InProgress', InProgress: 'Done', Done: 'Done', Blocked: 'Open' };
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 3, padding: '10px 12px', position: 'relative' }}>
      {/* Priority stripe */}
      <div style={{ position: 'absolute', top: 0, left: 0, width: 3, height: '100%', background: PRI_CLR[task.priority] || C.muted, borderRadius: '3px 0 0 3px' }} />
      <div style={{ paddingLeft: 8 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: C.white, marginBottom: 4, lineHeight: 1.4 }}>{task.title}</div>
        {task.description && <div style={{ fontSize: 11, color: C.muted, marginBottom: 6, lineHeight: 1.4 }}>{task.description.slice(0, 80)}{task.description.length > 80 ? '…' : ''}</div>}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, flexWrap: 'wrap', gap: 4 }}>
          <div style={{ fontSize: 10, color: C.muted }}>
            {proj?.projectName || task.projectId}
            {task.assignedTo && <span style={{ marginLeft: 6, color: C.text }}>→ {task.assignedTo}</span>}
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            {task.status !== 'Done' && (
              <Btn small variant="success" onClick={() => onStatus(task, STATUS_NEXT[task.status])}>
                {task.status === 'Open' ? 'Start' : task.status === 'InProgress' ? 'Done' : ''}
              </Btn>
            )}
            <Btn small variant="danger" onClick={() => onDelete(task)}>✕</Btn>
          </div>
        </div>
        {task.endDate && (
          <div style={{ fontSize: 10, color: new Date(task.endDate) < new Date() && task.status !== 'Done' ? '#EF4444' : C.muted, marginTop: 4 }}>
            Due: {fmtDate(task.endDate)}
          </div>
        )}
      </div>
    </div>
  );
}
