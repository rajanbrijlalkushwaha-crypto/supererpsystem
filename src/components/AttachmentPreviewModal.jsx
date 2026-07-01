import { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';

const isImage = f => /\.(jpg|jpeg|png|gif|bmp|webp)$/i.test(f || '');
const isPdf   = f => /\.pdf$/i.test(f || '');

const AttachmentPreviewModal = ({ attachment, downloadUrl, onClose }) => {
  const [blobUrl, setBlobUrl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  useEffect(() => {
    if (!attachment?.fileName) return;
    setLoading(true);
    setError(null);
    setBlobUrl(null);

    fetch(downloadUrl)
      .then(r => {
        if (!r.ok) throw new Error(`File not found (${r.status})`);
        return r.blob();
      })
      .then(blob => {
        setBlobUrl(URL.createObjectURL(blob));
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });

    return () => {
      setBlobUrl(prev => { if (prev) URL.revokeObjectURL(prev); return null; });
    };
  }, [downloadUrl, attachment?.fileName]);

  if (!attachment) return null;

  const name = attachment.name || attachment.fileName || 'Attachment';

  const modal = (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.82)',
        zIndex: 99999, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', padding: 20,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#1C2B3A', borderRadius: 10,
          width: '100%', maxWidth: 920,
          height: '90vh',
          display: 'flex', flexDirection: 'column',
          boxShadow: '0 16px 60px rgba(0,0,0,0.6)',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.12)',
          flexShrink: 0,
        }}>
          <span style={{ fontSize: 20 }}>
            {isImage(attachment.fileName) ? '🖼️' : isPdf(attachment.fileName) ? '📄' : '📎'}
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              color: '#fff', fontWeight: 600, fontSize: 14,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>{name}</div>
          </div>
          <a
            href={downloadUrl}
            download={attachment.fileName}
            onClick={e => e.stopPropagation()}
            style={{
              padding: '7px 18px', background: '#0070F2', color: '#fff',
              borderRadius: 6, textDecoration: 'none', fontSize: 13,
              fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0,
            }}
          >
            ⬇️ Download
          </a>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.12)', border: 'none', borderRadius: 6,
              color: '#fff', width: 32, height: 32, cursor: 'pointer',
              fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}
          >✕</button>
        </div>

        {/* Preview body */}
        <div style={{ flex: 1, minHeight: 0, background: '#0D1B2A', borderRadius: '0 0 10px 10px', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {loading ? (
            <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14 }}>Loading preview…</div>
          ) : error ? (
            <div style={{ textAlign: 'center', padding: 32 }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>⚠️</div>
              <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14, marginBottom: 16 }}>{error}</div>
              <a href={downloadUrl} download={attachment.fileName}
                style={{ padding: '10px 24px', background: '#0070F2', color: '#fff', borderRadius: 6, textDecoration: 'none', fontWeight: 600 }}>
                ⬇️ Download File
              </a>
            </div>
          ) : isImage(attachment.fileName) ? (
            <img
              src={blobUrl}
              alt={name}
              style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 4 }}
            />
          ) : isPdf(attachment.fileName) ? (
            <iframe
              src={blobUrl}
              title={name}
              style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
            />
          ) : (
            <div style={{ textAlign: 'center', padding: 32 }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>📎</div>
              <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14, marginBottom: 16 }}>No preview for this file type.</div>
              <a href={downloadUrl} download={attachment.fileName}
                style={{ padding: '10px 24px', background: '#0070F2', color: '#fff', borderRadius: 6, textDecoration: 'none', fontWeight: 600 }}>
                ⬇️ Download File
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return ReactDOM.createPortal(modal, document.body);
};

export default AttachmentPreviewModal;
