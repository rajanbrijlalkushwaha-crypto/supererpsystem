import { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate, useParams } from 'react-router-dom';
import { useCompany } from '../../context/CompanyContext';

const P  = '#104f4f';
const PD = '#0b3d3d';
const BG = '#F5F7FB';
const BD = '#E5EAF2';
const F  = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

const ITEM_TYPES = ['Ready Product', 'Raw Material', 'Service'];
const UOM_LIST   = ['NOS', 'Kg', 'Ltr', 'Mtr', 'Box', 'Pcs', 'Set', 'Sqft', 'MT', 'Ton', 'Pair', 'Roll', 'Job', 'Month', 'Year', 'Hour', 'N/A'];

const inp = {
  width: '100%', height: 36, padding: '0 10px',
  border: `1px solid ${BD}`, borderRadius: 6,
  fontSize: 13, fontFamily: F, outline: 'none',
  background: '#fff', color: '#111827', boxSizing: 'border-box',
  transition: 'border-color 0.15s',
};
const sel = { ...inp, cursor: 'pointer' };
const lbl = { fontSize: 12.5, fontWeight: 600, color: '#374151', marginBottom: 5, display: 'block', fontFamily: F };

export default function CreateItem() {
  const { selectedCompany } = useCompany();
  const navigate = useNavigate();
  const { itemCode: editCode } = useParams();
  const isEdit = !!editCode;

  const [form, setForm]     = useState({ itemName:'', uom:'NOS', hsnCode:'', itemType:'Ready Product' });
  const [nextCode, setNextCode] = useState('');
  const [loading,  setLoading]  = useState(false);
  const [message,  setMessage]  = useState('');

  const cid = selectedCompany?.companyId;

  useEffect(() => {
    if (!cid) return;
    if (isEdit) {
      axios.get(`/api/items/${editCode}?companyId=${cid}`)
        .then(r => setForm({
          itemName: r.data.itemName || '',
          uom:      r.data.uom      || 'NOS',
          hsnCode:  r.data.hsnCode  || '',
          itemType: r.data.itemType || 'Raw Material',
        }))
        .catch(() => setMessage('Failed to load item'));
    } else {
      axios.get(`/api/items/next-code?companyId=${cid}`)
        .then(r => setNextCode(r.data.nextCode))
        .catch(() => setNextCode('9000001'));
    }
  }, [cid, isEdit, editCode]);

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handleSubmit = async () => {
    if (!form.itemName.trim()) { setMessage('Item Name is required'); return; }
    setLoading(true);
    setMessage('');
    try {
      if (isEdit) {
        await axios.put(`/api/items/${editCode}?companyId=${cid}`, { ...form, companyId: cid });
        setMessage('Item updated successfully');
        setTimeout(() => navigate('/items/view'), 1000);
      } else {
        const r = await axios.post(`/api/items?companyId=${cid}`, { ...form, companyId: cid });
        setMessage(`Item created successfully — Code: ${r.data.itemCode}`);
        setForm({ itemName:'', uom:'NOS', hsnCode:'', itemType:'Ready Product' });
        axios.get(`/api/items/next-code?companyId=${cid}`)
          .then(r2 => setNextCode(r2.data.nextCode));
      }
    } catch (e) {
      setMessage('Error: ' + (e.response?.data?.error || e.message));
    } finally {
      setLoading(false);
    }
  };

  const isError = message.startsWith('Error') || message.startsWith('Failed');

  return (
    <div style={{ background: BG, minHeight: '100%', fontFamily: F }}>

      {/* Header */}
      <div style={{ background: P, padding: '14px 20px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.6px' }}>
            Item Master
          </div>
          <div style={{ fontSize: 15, fontWeight: 800, color: '#fff', letterSpacing: '-0.2px' }}>
            {isEdit ? `Edit Item — ${editCode}` : 'New Item Registration'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => navigate('/items/view')}
            style={{ height: 32, padding: '0 16px', fontSize: 12, fontFamily: F, cursor: 'pointer',
              background: 'rgba(255,255,255,0.12)', color: '#fff',
              border: '1px solid rgba(255,255,255,0.25)', borderRadius: 6, fontWeight: 600 }}>
            ✕ Cancel
          </button>
          <button onClick={handleSubmit} disabled={loading}
            style={{ height: 32, padding: '0 20px', fontSize: 12, fontFamily: F, cursor: 'pointer',
              background: '#12B76A', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 700,
              opacity: loading ? 0.7 : 1, boxShadow: '0 2px 6px rgba(18,183,106,0.4)' }}>
            {loading ? 'Saving…' : isEdit ? '✔ Update Item' : '✔ Save Item'}
          </button>
        </div>
      </div>

      {/* Message */}
      {message && (
        <div style={{ margin: '12px 20px 0', padding: '10px 14px', fontSize: 12.5, fontFamily: F,
          background: isError ? '#FEF2F2' : '#ECFDF5',
          color: isError ? '#DC2626' : '#059669',
          border: `1px solid ${isError ? '#FECACA' : '#A7F3D0'}`,
          borderRadius: 8 }}>
          {message}
        </div>
      )}

      {/* Form */}
      <div style={{ padding: '16px 20px', maxWidth: 680 }}>

        {/* Item Identity */}
        <div style={{ background: '#fff', border: `1px solid ${BD}`, borderRadius: 10,
          overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', marginBottom: 14 }}>
          <div style={{ background: P, padding: '8px 16px', fontSize: 11, fontWeight: 800,
            color: '#fff', textTransform: 'uppercase', letterSpacing: '0.8px' }}>
            Item Identity
          </div>
          <div style={{ padding: '16px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div>
                <label style={lbl}>Item Code</label>
                <input readOnly value={isEdit ? editCode : (nextCode || 'Auto-assigned')}
                  style={{ ...inp, background: '#F9FAFB', color: P, fontWeight: 700 }} />
                {!isEdit && (
                  <div style={{ fontSize: 10.5, color: '#9CA3AF', marginTop: 4 }}>
                    Auto-assigned — starts at 9000001
                  </div>
                )}
              </div>
              <div>
                <label style={lbl}>Item Type <span style={{ color:'#EF4444' }}>*</span></label>
                <select style={sel} value={form.itemType} onChange={e => {
                  const t = e.target.value;
                  setForm(p => ({ ...p, itemType: t, uom: t === 'Service' ? 'N/A' : (p.uom === 'N/A' ? 'NOS' : p.uom) }));
                }}>
                  {ITEM_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>

            <div style={{ marginTop: 14 }}>
              <label style={lbl}>Item Name <span style={{ color:'#EF4444' }}>*</span></label>
              <input style={inp} value={form.itemName}
                onChange={e => set('itemName', e.target.value)}
                placeholder="e.g. MS Flat Bar 50×6mm" />
            </div>
          </div>
        </div>

        {/* Classification */}
        <div style={{ background: '#fff', border: `1px solid ${BD}`, borderRadius: 10,
          overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', marginBottom: 14 }}>
          <div style={{ background: P, padding: '8px 16px', fontSize: 11, fontWeight: 800,
            color: '#fff', textTransform: 'uppercase', letterSpacing: '0.8px' }}>
            Classification
          </div>
          <div style={{ padding: '16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div>
              <label style={lbl}>Unit of Measure (UOM)</label>
              <select style={sel} value={form.uom} onChange={e => set('uom', e.target.value)}>
                {UOM_LIST.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>{form.itemType === 'Service' ? 'SAC Code' : 'HSN Code'}</label>
              <input style={inp} value={form.hsnCode}
                onChange={e => set('hsnCode', e.target.value)}
                placeholder={form.itemType === 'Service' ? 'e.g. 998314, 9954' : 'e.g. 7208, 8544'}
                maxLength={8} />
            </div>
          </div>
        </div>

        {/* Footer actions */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 8 }}>
          <button onClick={() => navigate('/items/view')}
            style={{ height: 36, padding: '0 20px', fontSize: 13, fontFamily: F, cursor: 'pointer',
              background: '#fff', color: '#374151', border: `1px solid ${BD}`, borderRadius: 7, fontWeight: 600 }}>
            Cancel
          </button>
          <button onClick={handleSubmit} disabled={loading}
            style={{ height: 36, padding: '0 24px', fontSize: 13, fontFamily: F, cursor: 'pointer',
              background: loading ? '#9CA3AF' : '#12B76A', color: '#fff', border: 'none',
              borderRadius: 7, fontWeight: 700, boxShadow: loading ? 'none' : '0 2px 6px rgba(18,183,106,0.35)' }}>
            {loading ? 'Saving…' : isEdit ? '✔ Update Item' : '✔ Save Item'}
          </button>
        </div>
      </div>
    </div>
  );
}
