import { useState, useEffect } from 'react';
import axios from 'axios';

const F = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

/**
 * Modal shown when submitting a record for approval. Lets the submitter
 * optionally pick one specific approver; leaving it blank notifies every
 * user with approve rights on that module.
 *
 * Usage: <ApproverPickerModal module="salesorder" recordLabel="SO-1001"
 *          onConfirm={(approverId) => submit('pending', approverId)}
 *          onCancel={() => setShowPicker(false)} />
 */
export default function ApproverPickerModal({ module, recordLabel, onConfirm, onCancel }) {
  const [approvers, setApprovers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState('');

  useEffect(() => {
    axios.get(`/api/notifications/approvers/${module}`)
      .then(r => setApprovers(r.data || []))
      .catch(() => setApprovers([]))
      .finally(() => setLoading(false));
  }, [module]);

  return (
    <div style={{ position:'fixed', inset:0, zIndex:99999, display:'flex', alignItems:'center', justifyContent:'center',
      background:'rgba(15,23,42,0.55)', backdropFilter:'blur(4px)', fontFamily:F }}
      onClick={onCancel}>
      <div onClick={e => e.stopPropagation()} style={{ background:'#fff', borderRadius:12, width:400,
        maxWidth:'92vw', boxShadow:'0 24px 60px rgba(0,0,0,0.22)', overflow:'hidden' }}>
        <div style={{ background:'linear-gradient(135deg,#1e293b,#334155)', padding:'14px 18px' }}>
          <div style={{ fontSize:14, fontWeight:700, color:'#fff' }}>Submit for Approval</div>
          {recordLabel && <div style={{ fontSize:11, color:'#94a3b8', marginTop:2 }}>{recordLabel}</div>}
        </div>
        <div style={{ padding:'16px 18px' }}>
          <label style={{ fontSize:12, fontWeight:600, color:'#374151', display:'block', marginBottom:6 }}>
            Select Approver <span style={{ fontWeight:400, color:'#9ca3af' }}>(optional)</span>
          </label>
          <select value={selected} onChange={e => setSelected(e.target.value)} disabled={loading}
            style={{ width:'100%', padding:'8px 10px', border:'1px solid #E5E7EB', borderRadius:7,
              fontSize:13, fontFamily:F, background:'#fff', color:'#111827', outline:'none' }}>
            <option value="">— Notify everyone with approval rights —</option>
            {approvers.map(u => (
              <option key={u.id} value={u.id}>{u.name || u.username}{u.role === 'admin' ? ' (Admin)' : ''}</option>
            ))}
          </select>
          {!loading && approvers.length === 0 && (
            <div style={{ fontSize:11, color:'#9ca3af', marginTop:6 }}>
              No users with approval rights found for this module yet — everyone with rights will still be notified once assigned.
            </div>
          )}
          <div style={{ fontSize:11, color:'#9ca3af', marginTop:8, lineHeight:1.5 }}>
            The chosen approver gets an in-app notification. Leave blank to notify all eligible approvers.
          </div>
        </div>
        <div style={{ padding:'12px 18px', background:'#F8FAFC', borderTop:'1px solid #F1F5F9', display:'flex', gap:8, justifyContent:'flex-end' }}>
          <button onClick={onCancel} style={{ height:34, padding:'0 16px', border:'1.5px solid #E5E7EB', borderRadius:7,
            background:'#fff', color:'#374151', fontSize:12.5, fontWeight:600, cursor:'pointer', fontFamily:F }}>
            Cancel
          </button>
          <button onClick={() => onConfirm(selected || null)} autoFocus style={{ height:34, padding:'0 18px', border:'none', borderRadius:7,
            background:'#2563EB', color:'#fff', fontSize:12.5, fontWeight:700, cursor:'pointer', fontFamily:F,
            boxShadow:'0 3px 10px rgba(37,99,235,0.3)' }}>
            📤 Submit for Approval
          </button>
        </div>
      </div>
    </div>
  );
}
