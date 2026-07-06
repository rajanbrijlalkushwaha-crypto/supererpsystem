import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useCompany } from '../../../context/CompanyContext';

const API = '/api/financial-docs';
const F   = "'Inter',sans-serif";

const fmt = n => n ? (n / 1024).toFixed(1) + ' KB' : '';

const getFYOptions = () => {
  const cur  = new Date();
  const year = cur.getMonth() >= 3 ? cur.getFullYear() : cur.getFullYear() - 1;
  const fys  = [];
  for (let y = year; y >= year - 4; y--)
    fys.push(`FY ${String(y).slice(2)}-${String(y + 1).slice(2)}`);
  return fys;
};

/* ── PDF Preview Modal ─────────────────────────────── */
function PDFPreviewModal({ doc, cid, onClose, onDownload }) {
  const src = `${API}/${doc.id}/view?companyId=${cid}`;

  const handleKey = useCallback(e => { if (e.key === 'Escape') onClose(); }, [onClose]);
  useEffect(() => {
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [handleKey]);

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(10,20,30,0.72)', backdropFilter: 'blur(3px)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: 20, fontFamily: F,
      }}
    >
      {/* Modal box */}
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 960, height: '90vh',
          background: '#fff', borderRadius: 14,
          boxShadow: '0 30px 80px rgba(0,0,0,0.35)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '12px 18px', borderBottom: '1px solid #e2e8f0',
          background: 'linear-gradient(135deg,#0b3d3d,#0d9488)', flexShrink: 0,
        }}>
          <span style={{ fontSize: 20 }}>📄</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {doc.docName || doc.fileName}
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 2 }}>
              {doc.fy && (
                <span style={{ background: 'rgba(255,255,255,0.18)', color: '#fff', borderRadius: 10, padding: '1px 8px', fontSize: 11, fontWeight: 600 }}>
                  {doc.fy}
                </span>
              )}
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)' }}>{doc.fileName}</span>
              {doc.size && <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>{fmt(doc.size)}</span>}
            </div>
          </div>

          {/* Download button */}
          <button
            onClick={onDownload}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)',
              borderRadius: 7, padding: '6px 14px', color: '#fff',
              fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: F, flexShrink: 0,
            }}
          >
            ↓ Download
          </button>

          {/* Close */}
          <button
            onClick={onClose}
            style={{
              width: 32, height: 32, borderRadius: 8, border: 'none',
              background: 'rgba(255,255,255,0.15)', color: '#fff',
              fontSize: 18, cursor: 'pointer', display: 'flex',
              alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              lineHeight: 1,
            }}
            title="Close (Esc)"
          >
            ✕
          </button>
        </div>

        {/* PDF viewer */}
        <div style={{ flex: 1, background: '#525659', position: 'relative', overflow: 'hidden' }}>
          <iframe
            src={`${src}#toolbar=1&view=FitH`}
            title={doc.docName || doc.fileName}
            style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
            allow="fullscreen"
          />
          {/* Fallback open-in-tab link for non-PDF browsers */}
          <div style={{ position: 'absolute', bottom: 10, right: 14, display: 'flex', gap: 8 }}>
            <a href={src} target="_blank" rel="noopener noreferrer"
              style={{ padding: '5px 13px', background: 'rgba(0,0,0,0.55)', color: '#fff', borderRadius: 6, fontSize: 11.5, fontWeight: 600, textDecoration: 'none' }}>
              Open in new tab ↗
            </a>
          </div>
        </div>

        {/* Footer hint */}
        <div style={{ padding: '6px 18px', background: '#f8fafc', borderTop: '1px solid #e2e8f0', fontSize: 11, color: '#94a3b8', flexShrink: 0 }}>
          Press <kbd style={{ background: '#e2e8f0', borderRadius: 3, padding: '1px 5px', fontSize: 10 }}>Esc</kbd> or click outside to close
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════
   MAIN
══════════════════════════════════════ */
export default function FinancialDocs() {
  const { selectedCompany } = useCompany();
  const cid = selectedCompany?.companyId;

  const [docs,      setDocs]      = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [filterFY,  setFilterFY]  = useState('all');
  const [search,    setSearch]    = useState('');
  const [selected,  setSelected]  = useState(new Set());
  const [uploading, setUploading] = useState(false);
  const [showForm,  setShowForm]  = useState(false);
  const [form,      setForm]      = useState({ fy: getFYOptions()[0], docName: '' });
  const [files,     setFiles]     = useState([]);
  const [error,     setError]     = useState('');
  const [previewDoc, setPreviewDoc] = useState(null);   // doc being previewed in modal
  const fileRef = useRef();

  const load = async () => {
    if (!cid) return;
    setLoading(true);
    try {
      const r = await fetch(`${API}?companyId=${cid}`);
      setDocs(await r.json());
    } catch { setDocs([]); } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [cid]);

  const fyList = useMemo(() => {
    const s = new Set(docs.map(d => d.fy).filter(Boolean));
    return Array.from(s).sort().reverse();
  }, [docs]);

  const filtered = useMemo(() => {
    let r = docs;
    if (filterFY !== 'all') r = r.filter(d => d.fy === filterFY);
    if (search.trim()) {
      const q = search.toLowerCase();
      r = r.filter(d =>
        (d.docName || '').toLowerCase().includes(q) ||
        (d.fileName || '').toLowerCase().includes(q)
      );
    }
    return r.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }, [docs, filterFY, search]);

  const allSelected = filtered.length > 0 && filtered.every(d => selected.has(d.id));

  const toggleAll = () => {
    const next = new Set(selected);
    if (allSelected) filtered.forEach(d => next.delete(d.id));
    else             filtered.forEach(d => next.add(d.id));
    setSelected(next);
  };

  const toggle = id => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };

  const downloadDoc = doc => {
    const a = document.createElement('a');
    a.href = `${API}/${doc.id}/download?companyId=${cid}`;
    a.download = doc.fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const downloadSelected = () => {
    filtered.filter(d => selected.has(d.id)).forEach((doc, i) => {
      setTimeout(() => downloadDoc(doc), i * 400);
    });
  };

  const deleteDoc = async id => {
    if (!window.confirm('Delete this document?')) return;
    await fetch(`${API}/${id}?companyId=${cid}`, { method: 'DELETE' });
    setSelected(prev => { const n = new Set(prev); n.delete(id); return n; });
    if (previewDoc?.id === id) setPreviewDoc(null);
    load();
  };

  const handleUpload = async e => {
    e.preventDefault();
    setError('');
    if (!form.docName.trim()) return setError('Document name is required');
    if (!files.length)        return setError('Select at least one PDF file');
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('companyId', cid);
      fd.append('fy', form.fy);
      fd.append('docName', form.docName.trim());
      files.forEach(f => fd.append('files', f));
      const r = await fetch(API, { method: 'POST', body: fd });
      if (!r.ok) { const d = await r.json(); throw new Error(d.error || 'Upload failed'); }
      setShowForm(false);
      setForm({ fy: getFYOptions()[0], docName: '' });
      setFiles([]);
      load();
    } catch (err) { setError(err.message); }
    finally { setUploading(false); }
  };

  const selCount = filtered.filter(d => selected.has(d.id)).length;

  return (
    <div style={{ padding: '24px', maxWidth: 1100, margin: '0 auto', fontFamily: F }}>

      {/* PDF Preview Modal */}
      {previewDoc && (
        <PDFPreviewModal
          doc={previewDoc}
          cid={cid}
          onClose={() => setPreviewDoc(null)}
          onDownload={() => downloadDoc(previewDoc)}
        />
      )}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#1e293b' }}>Financial Documents</h2>
          <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: 13 }}>Upload and manage financial PDFs by FY</p>
        </div>
        <button onClick={() => { setShowForm(true); setError(''); }}
          style={{ background: '#0d9488', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 18px', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>
          + Upload Documents
        </button>
      </div>

      {/* Upload form */}
      {showForm && (
        <div style={{ background: '#f0fdf9', border: '1.5px solid #99f6e4', borderRadius: 12, padding: 20, marginBottom: 24 }}>
          <h3 style={{ margin: '0 0 16px', fontSize: 16, color: '#0f766e' }}>Upload New Documents</h3>
          <form onSubmit={handleUpload}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={labelStyle}>Financial Year</label>
                <select value={form.fy} onChange={e => setForm(f => ({ ...f, fy: e.target.value }))} style={inputStyle}>
                  {getFYOptions().map(fy => <option key={fy} value={fy}>{fy}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Document Name <span style={{ color: '#ef4444' }}>*</span></label>
                <input style={inputStyle} placeholder="e.g. Audited Balance Sheet, P&L Statement..."
                  value={form.docName} onChange={e => setForm(f => ({ ...f, docName: e.target.value }))} />
              </div>
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>PDF Files <span style={{ color: '#ef4444' }}>*</span> (multiple allowed)</label>
              <div style={{ border: '2px dashed #99f6e4', borderRadius: 8, padding: '16px 20px', cursor: 'pointer', background: '#fff', textAlign: 'center' }}
                onClick={() => fileRef.current?.click()}>
                {files.length ? (
                  <div style={{ textAlign: 'left' }}>
                    {files.map((f, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '2px 0', color: '#374151' }}>
                        <span>📄 {f.name}</span>
                        <span style={{ color: '#6b7280' }}>{fmt(f.size)}</span>
                      </div>
                    ))}
                    <div style={{ marginTop: 8, fontSize: 12, color: '#0d9488' }}>Click to change files</div>
                  </div>
                ) : (
                  <span style={{ color: '#6b7280', fontSize: 13 }}>Click to select PDF files</span>
                )}
                <input ref={fileRef} type="file" accept="application/pdf" multiple style={{ display: 'none' }}
                  onChange={e => setFiles(Array.from(e.target.files || []))} />
              </div>
            </div>
            {error && <div style={{ color: '#ef4444', fontSize: 13, marginBottom: 8 }}>{error}</div>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="submit" disabled={uploading}
                style={{ background: '#0d9488', color: '#fff', border: 'none', borderRadius: 7, padding: '8px 20px', fontWeight: 600, fontSize: 14, cursor: uploading ? 'not-allowed' : 'pointer', opacity: uploading ? 0.7 : 1 }}>
                {uploading ? 'Uploading…' : 'Upload'}
              </button>
              <button type="button" onClick={() => setShowForm(false)}
                style={{ background: '#f1f5f9', color: '#374151', border: 'none', borderRadius: 7, padding: '8px 16px', fontSize: 14, cursor: 'pointer' }}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {['all', ...fyList].map(fy => (
            <button key={fy} onClick={() => setFilterFY(fy)}
              style={{ padding: '5px 13px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: 'none',
                background: filterFY === fy ? '#0d9488' : '#e2e8f0',
                color: filterFY === fy ? '#fff' : '#475569' }}>
              {fy === 'all' ? 'All FY' : fy}
            </button>
          ))}
        </div>
        <input
          style={{ marginLeft: 'auto', padding: '6px 12px', borderRadius: 7, border: '1px solid #e2e8f0', fontSize: 13, width: 220, outline: 'none' }}
          placeholder="Search document name…"
          value={search} onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* Bulk actions */}
      {selCount > 0 && (
        <div style={{ background: '#f0fdf9', border: '1px solid #99f6e4', borderRadius: 8, padding: '10px 16px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 13, color: '#0f766e', fontWeight: 600 }}>{selCount} selected</span>
          <button onClick={downloadSelected}
            style={{ background: '#0d9488', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            Download Selected
          </button>
          <button onClick={() => setSelected(new Set())}
            style={{ background: '#f1f5f9', color: '#374151', border: 'none', borderRadius: 6, padding: '6px 12px', fontSize: 13, cursor: 'pointer' }}>
            Clear
          </button>
        </div>
      )}

      {/* Table */}
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Loading…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>
            {docs.length === 0 ? 'No documents uploaded yet.' : 'No documents match the filter.'}
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                <th style={th}><input type="checkbox" checked={allSelected} onChange={toggleAll} style={{ cursor: 'pointer' }} /></th>
                <th style={{ ...th, textAlign: 'left' }}>FY</th>
                <th style={{ ...th, textAlign: 'left' }}>Document Name</th>
                <th style={{ ...th, textAlign: 'left' }}>File</th>
                <th style={{ ...th, textAlign: 'left' }}>Size</th>
                <th style={{ ...th, textAlign: 'left' }}>Uploaded</th>
                <th style={th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((doc, i) => (
                <tr key={doc.id}
                  style={{ borderBottom: i < filtered.length - 1 ? '1px solid #f1f5f9' : 'none', background: selected.has(doc.id) ? '#f0fdf9' : 'transparent' }}>
                  <td style={{ ...td, textAlign: 'center' }}>
                    <input type="checkbox" checked={selected.has(doc.id)} onChange={() => toggle(doc.id)} style={{ cursor: 'pointer' }} />
                  </td>
                  <td style={td}>
                    <span style={{ background: '#e0f2fe', color: '#0369a1', borderRadius: 12, padding: '2px 9px', fontWeight: 600, fontSize: 11 }}>
                      {doc.fy || '—'}
                    </span>
                  </td>
                  <td style={{ ...td, fontWeight: 500, color: '#1e293b' }}>{doc.docName || '—'}</td>
                  <td style={{ ...td, color: '#475569' }}>📄 {doc.fileName}</td>
                  <td style={{ ...td, color: '#94a3b8' }}>{fmt(doc.size)}</td>
                  <td style={{ ...td, color: '#94a3b8' }}>{doc.createdAt ? new Date(doc.createdAt).toLocaleDateString('en-IN') : '—'}</td>
                  <td style={{ ...td, textAlign: 'center' }}>
                    <div style={{ display: 'flex', gap: 5, justifyContent: 'center' }}>
                      {/* View — opens PDF in in-page modal */}
                      <button onClick={() => setPreviewDoc(doc)}
                        style={{ background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', borderRadius: 5, padding: '4px 11px', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>
                        👁 View
                      </button>
                      <button onClick={() => downloadDoc(doc)}
                        style={{ background: '#0d9488', color: '#fff', border: 'none', borderRadius: 5, padding: '4px 10px', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>
                        ↓ Download
                      </button>
                      <button onClick={() => deleteDoc(doc.id)}
                        style={{ background: '#fee2e2', color: '#ef4444', border: 'none', borderRadius: 5, padding: '4px 8px', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>
                        ✕
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {filtered.length > 0 && (
        <div style={{ marginTop: 8, fontSize: 12, color: '#94a3b8', textAlign: 'right' }}>
          {filtered.length} document{filtered.length !== 1 ? 's' : ''}
        </div>
      )}
    </div>
  );
}

const labelStyle = { display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 };
const inputStyle = { width: '100%', padding: '8px 10px', borderRadius: 7, border: '1px solid #d1fae5', fontSize: 13, outline: 'none', boxSizing: 'border-box', background: '#fff' };
const th = { padding: '10px 12px', fontWeight: 600, color: '#64748b', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.4 };
const td = { padding: '11px 12px', color: '#374151' };
