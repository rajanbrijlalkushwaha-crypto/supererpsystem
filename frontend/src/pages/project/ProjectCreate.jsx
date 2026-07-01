import { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useCompany } from '../../context/CompanyContext';

const F = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const N = '#133d80';

const BD = '#E5EAF2';
const btnStyle = (bg = '#12B76A', disabled) => ({
  background: disabled ? '#9CA3AF' : bg,
  border: 'none', color: '#fff', padding: '0 16px', height: 32, fontSize: 12,
  fontFamily: F, cursor: disabled ? 'default' : 'pointer', borderRadius: 6, whiteSpace: 'nowrap',
  fontWeight: 700, opacity: disabled ? 0.7 : 1,
  boxShadow: disabled ? 'none' : '0 2px 6px rgba(0,0,0,0.15)',
});

const INP_STYLE = {
  height: 32, padding: '0 10px', border: `1px solid ${BD}`, borderRadius: 6,
  fontSize: 12, fontFamily: F, outline: 'none', background: '#fff', boxSizing: 'border-box',
};

function FR({ label, children, required }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', minHeight: 26,
      borderBottom: '1px solid #e0e0e0', padding: '3px 6px', gap: 6 }}>
      <label style={{ fontSize: 11, fontWeight: 700, minWidth: 140, color: '#333', fontFamily: F,
        textAlign: 'right', paddingRight: 8 }}>
        {label}{required && <span style={{ color: '#cc0000' }}> *</span>}
      </label>
      <div style={{ flex: 1 }}>{children}</div>
    </div>
  );
}

function SH({ title }) {
  return (
    <div style={{ background: N, color: '#fff', fontSize: 11, fontWeight: 700,
      padding: '3px 8px', marginBottom: 0, letterSpacing: 0.3 }}>
      {title}
    </div>
  );
}

export default function ProjectCreate() {
  const { selectedCompany } = useCompany();
  const cid = selectedCompany?.companyId;
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const editId = searchParams.get('edit');
  const isEdit = !!editId;

  const [clients, setClients]   = useState([]);
  const [form, setForm] = useState({
    projectName: '', clientId: '', clientName: '', startDate: '', endDate: '',
    budget: '', status: 'active', description: '', notes: '',
    projectManager: '', location: '',
  });
  const [message, setMessage] = useState({ text: '', ok: true });
  const [loading, setLoading]  = useState(false);

  useEffect(() => {
    if (!cid) return;
    axios.get(`/api/clients?companyId=${cid}`).then(r => setClients(r.data || [])).catch(() => {});
    if (isEdit) {
      axios.get(`/api/projects/${editId}?companyId=${cid}`)
        .then(r => {
          const d = r.data;
          setForm({
            projectName: d.projectName || '',
            clientId: d.clientId || '',
            clientName: d.clientName || '',
            startDate: d.startDate || '',
            endDate: d.endDate || '',
            budget: d.budget || '',
            status: d.status || 'active',
            description: d.description || '',
            notes: d.notes || '',
            projectManager: d.projectManager || '',
            location: d.location || '',
          });
        })
        .catch(() => setMessage({ text: 'Failed to load project', ok: false }));
    }
  }, [cid, editId]);

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handleClientChange = (clientId) => {
    const client = clients.find(c => String(c.clientId) === clientId);
    set('clientId', clientId);
    set('clientName', client ? (client.clientName || client.companyName || '') : '');
  };

  const handleSubmit = async () => {
    if (!form.projectName.trim()) { setMessage({ text: 'Project name is required.', ok: false }); return; }
    try {
      setLoading(true); setMessage({ text: '', ok: true });
      const payload = { ...form, companyId: cid, budget: parseFloat(form.budget) || 0 };
      if (isEdit) {
        await axios.put(`/api/projects/${editId}?companyId=${cid}`, payload);
        setMessage({ text: 'Project updated successfully.', ok: true });
        setTimeout(() => navigate('/project/list'), 1200);
      } else {
        const r = await axios.post(`/api/projects?companyId=${cid}`, payload);
        setMessage({ text: `Project created — ID: ${r.data.projectId}`, ok: true });
        setForm({ projectName: '', clientId: '', clientName: '', startDate: '', endDate: '',
          budget: '', status: 'active', description: '', notes: '', projectManager: '', location: '' });
      }
    } catch (e) {
      setMessage({ text: 'Error: ' + (e.response?.data?.error || e.message), ok: false });
    } finally { setLoading(false); }
  };

  return (
    <div style={{ fontFamily: F, fontSize: 12, maxWidth: 860, margin: '0 auto', padding: 8 }}>
      <div style={{ background: N, color: '#fff', padding: '4px 10px', fontSize: 13,
        fontWeight: 700, marginBottom: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>{isEdit ? `Edit Project #${editId}` : 'New Project'}</span>
        <button onClick={() => navigate('/project/list')} style={btnStyle()}>← Back to List</button>
      </div>

      {message.text && (
        <div style={{ padding: '4px 10px', marginBottom: 6, fontSize: 11,
          background: message.ok ? '#d8f0d8' : '#ffe0e0',
          border: `1px solid ${message.ok ? '#44aa44' : '#cc4444'}`,
          color: message.ok ? '#005500' : '#880000' }}>
          {message.text}
        </div>
      )}

      {/* Basic Info */}
      <div style={{ border: '1px solid #808080', marginBottom: 6 }}>
        <SH title="Project Information" />
        <FR label="Project Name" required>
          <input value={form.projectName} onChange={e => set('projectName', e.target.value)}
            placeholder="e.g. Office Renovation Phase 1"
            style={{ ...INP_STYLE, width: '100%' }} />
        </FR>
        <FR label="Client">
          <select value={form.clientId} onChange={e => handleClientChange(e.target.value)}
            style={{ ...INP_STYLE, width: '100%', cursor: 'pointer' }}>
            <option value="">— No Client —</option>
            {clients.map(c => (
              <option key={c.clientId} value={c.clientId}>
                {c.clientName || c.companyName} ({c.clientId})
              </option>
            ))}
          </select>
        </FR>
        <FR label="Project Manager">
          <input value={form.projectManager} onChange={e => set('projectManager', e.target.value)}
            placeholder="Name of project manager"
            style={{ ...INP_STYLE, width: '100%' }} />
        </FR>
        <FR label="Location / Site">
          <input value={form.location} onChange={e => set('location', e.target.value)}
            placeholder="Project site or location"
            style={{ ...INP_STYLE, width: '100%' }} />
        </FR>
      </div>

      {/* Timeline & Budget */}
      <div style={{ border: '1px solid #808080', marginBottom: 6 }}>
        <SH title="Timeline & Budget" />
        <FR label="Start Date">
          <input type="date" value={form.startDate} onChange={e => set('startDate', e.target.value)}
            style={{ ...INP_STYLE, width: 160 }} />
        </FR>
        <FR label="End Date">
          <input type="date" value={form.endDate} onChange={e => set('endDate', e.target.value)}
            style={{ ...INP_STYLE, width: 160 }} />
        </FR>
        <FR label="Budget (₹)">
          <input type="number" min="0" step="any" value={form.budget} onChange={e => set('budget', e.target.value)}
            placeholder="0.00"
            style={{ ...INP_STYLE, width: 180 }} />
        </FR>
        <FR label="Status">
          <select value={form.status} onChange={e => set('status', e.target.value)}
            style={{ ...INP_STYLE, width: 160, cursor: 'pointer' }}>
            <option value="active">Active</option>
            <option value="on-hold">On Hold</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </FR>
      </div>

      {/* Description & Notes */}
      <div style={{ border: '1px solid #808080', marginBottom: 6 }}>
        <SH title="Details" />
        <FR label="Description">
          <textarea value={form.description} onChange={e => set('description', e.target.value)}
            rows={3} placeholder="Describe the project scope, deliverables..."
            style={{ width: '100%', padding: '6px 10px', border: `1px solid ${BD}`, borderRadius: 6,
              fontSize: 12, fontFamily: F, resize: 'vertical', boxSizing: 'border-box', outline: 'none' }} />
        </FR>
        <FR label="Notes">
          <textarea value={form.notes} onChange={e => set('notes', e.target.value)}
            rows={2} placeholder="Internal notes..."
            style={{ width: '100%', padding: '6px 10px', border: `1px solid ${BD}`, borderRadius: 6,
              fontSize: 12, fontFamily: F, resize: 'vertical', boxSizing: 'border-box', outline: 'none' }} />
        </FR>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8, padding: '6px 0' }}>
        <button onClick={handleSubmit} disabled={loading}
          style={{ ...btnStyle('#003a0e'), fontWeight: 700 }}>
          {loading ? 'Saving…' : isEdit ? '✔ Update Project' : '💾 Create Project'}
        </button>
        <button onClick={() => navigate('/project/list')} style={btnStyle()}>Cancel</button>
      </div>
    </div>
  );
}
