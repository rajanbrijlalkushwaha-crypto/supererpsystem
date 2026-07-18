import React, { useState, useRef } from 'react';
import axios from 'axios';

const F  = "'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif";
const BD = '#E5EAF2';
const P  = '#104f4f';

const fileIcon = name => {
  const ext = (name || '').split('.').pop().toLowerCase();
  if (['pdf'].includes(ext))              return '📄';
  if (['jpg','jpeg','png','gif','bmp','webp'].includes(ext)) return '🖼️';
  if (['xlsx','xls','csv'].includes(ext)) return '📊';
  if (['doc','docx'].includes(ext))       return '📝';
  if (['zip','rar','7z'].includes(ext))   return '📦';
  return '📎';
};

const fmtSize = bytes => {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes/1024).toFixed(1)} KB`;
  return `${(bytes/1048576).toFixed(1)} MB`;
};

/**
 * Reusable document attachment section.
 * Props:
 *   entityType  : 'expense' | 'journal'
 *   entityId    : the record ID
 *   companyId   : company ID string
 *   attachments : array from record ([{ name, fileName, size }])
 *   onUpdate    : callback(newAttachments[]) called after upload/delete
 */
export default function DocAttachments({ entityType, entityId, companyId, attachments = [], onUpdate }) {
  const [uploading, setUploading] = useState(false);
  const [deleting,  setDeleting]  = useState(null);
  const [error,     setError]     = useState('');
  const fileRef = useRef();

  const baseUrl = `/api/accounts/${entityType}s/${entityId}`;

  const handleUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    setUploading(true); setError('');
    try {
      const fd = new FormData();
      files.forEach(f => fd.append('files', f));
      const { data } = await axios.post(`${baseUrl}/upload?companyId=${companyId}`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      onUpdate && onUpdate(data.attachments || []);
    } catch (err) {
      setError('Upload failed: ' + (err.response?.data?.error || err.message));
    }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleDelete = async (att) => {
    if (!window.confirm(`Delete "${att.name || att.fileName}"?`)) return;
    setDeleting(att.fileName); setError('');
    try {
      const { data } = await axios.delete(`${baseUrl}/docs/${encodeURIComponent(att.fileName)}?companyId=${companyId}`);
      onUpdate && onUpdate(data.attachments || []);
    } catch (err) {
      setError('Delete failed: ' + (err.response?.data?.error || err.message));
    }
    setDeleting(null);
  };

  const viewUrl = (att) => `${baseUrl}/download/${encodeURIComponent(att.fileName)}?companyId=${companyId}&inline=1`;
  const dlUrl   = (att) => `${baseUrl}/download/${encodeURIComponent(att.fileName)}?companyId=${companyId}`;

  return (
    <div style={{ background:'#fff', border:`1px solid ${BD}`, borderRadius:10, overflow:'hidden',
      marginBottom:14, boxShadow:'0 1px 4px rgba(0,0,0,0.05)', fontFamily:F }}>

      {/* Header */}
      <div style={{ background:'#f8faff', borderBottom:`2px solid ${P}`, padding:'9px 16px',
        display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <span style={{ fontSize:11, fontWeight:800, color:P, textTransform:'uppercase', letterSpacing:'0.8px' }}>
          📎 Attachments {attachments.length > 0 && `(${attachments.length})`}
        </span>
        <label style={{ height:28, padding:'0 14px', background:P, color:'#fff', borderRadius:6,
          fontSize:12, fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', gap:5 }}>
          {uploading ? 'Uploading…' : '+ Upload Files'}
          <input ref={fileRef} type="file" multiple style={{ display:'none' }}
            disabled={uploading} onChange={handleUpload} />
        </label>
      </div>

      <div style={{ padding:'12px 16px' }}>
        {error && (
          <div style={{ background:'#fef2f2', border:'1px solid #fecaca', borderRadius:6,
            padding:'7px 12px', fontSize:12, color:'#dc2626', marginBottom:10 }}>
            ⚠ {error}
          </div>
        )}

        {attachments.length === 0 ? (
          <div style={{ padding:'20px 0', textAlign:'center', color:'#9ca3af', fontSize:13 }}>
            No documents attached. Click <strong style={{ color:P }}>+ Upload Files</strong> to attach bills, invoices, or any relevant document.
          </div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
            {attachments.map((att, i) => {
              const isDel = deleting === att.fileName;
              return (
                <div key={att.fileName || i} style={{ display:'flex', alignItems:'center', gap:10,
                  padding:'8px 12px', background: i%2===0?'#fafbff':'#fff', border:`1px solid ${BD}`,
                  borderRadius:7, opacity:isDel?0.5:1 }}>
                  <span style={{ fontSize:20, flexShrink:0 }}>{fileIcon(att.name || att.fileName)}</span>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:13, fontWeight:600, color:'#1f2937',
                      overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                      {att.name || att.fileName}
                    </div>
                    {att.size && <div style={{ fontSize:11, color:'#9ca3af', marginTop:1 }}>{fmtSize(att.size)}</div>}
                  </div>
                  <div style={{ display:'flex', gap:6, flexShrink:0 }}>
                    <a href={viewUrl(att)} target="_blank" rel="noreferrer"
                      style={{ height:26, padding:'0 10px', background:'#eff6ff', color:'#1d4ed8',
                        border:'1px solid #bfdbfe', borderRadius:5, fontSize:11, fontWeight:600,
                        textDecoration:'none', display:'flex', alignItems:'center', cursor:'pointer' }}>
                      👁 View
                    </a>
                    <a href={dlUrl(att)} download
                      style={{ height:26, padding:'0 10px', background:'#f0fdf4', color:'#15803d',
                        border:'1px solid #86efac', borderRadius:5, fontSize:11, fontWeight:600,
                        textDecoration:'none', display:'flex', alignItems:'center', cursor:'pointer' }}>
                      ⬇ Download
                    </a>
                    <button onClick={() => handleDelete(att)} disabled={isDel}
                      style={{ height:26, padding:'0 8px', background:'#fef2f2', color:'#dc2626',
                        border:'1px solid #fecaca', borderRadius:5, fontSize:11, cursor:'pointer', fontFamily:F }}>
                      {isDel ? '…' : '🗑'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div style={{ marginTop:10, fontSize:11, color:'#9ca3af' }}>
          Accepted: PDF, images (JPG, PNG), Word, Excel, ZIP — up to 20 files at once.
        </div>
      </div>
    </div>
  );
}
