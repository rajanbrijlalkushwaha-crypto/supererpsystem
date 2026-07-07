import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { useChat } from '../context/ChatContext';

const P  = '#104f4f';
const F  = 'Inter, system-ui, sans-serif';

/* ── message status helper ── */
function msgStatus(msg, statusMap) {
  if (msg.read      || statusMap[msg.id] === 'read')      return 'read';
  if (msg.delivered || statusMap[msg.id] === 'delivered') return 'delivered';
  return 'sent';
}

const STATUS_STYLE = {
  sent:      { label: 'Sent',      color: 'rgba(255,255,255,0.45)' },
  delivered: { label: 'Delivered', color: '#93c5fd' },
  read:      { label: 'Seen',      color: '#6ee7b7' },
};

/* ── helpers ── */
function fileIcon(mime = '') {
  if (mime.includes('pdf'))                              return '📄';
  if (mime.includes('word') || mime.includes('docx'))    return '📝';
  if (mime.includes('excel') || mime.includes('sheet'))  return '📊';
  if (mime.includes('image'))                            return '🖼️';
  if (mime.includes('zip') || mime.includes('rar'))      return '🗜️';
  return '📎';
}

function fmtSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024)        return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fmtTime(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

function dayLabel(ts) {
  const d = new Date(ts);
  const today = new Date();
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString())     return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

/* ─────────────────────────────────────────
   MAIN CHAT PANEL (fixed right-side drawer)
───────────────────────────────────────────*/
export default function Chat() {
  const {
    socketRef, onlineIds, isChatOpen, activePeer,
    unread, incomingMsg, typingFrom, msgStatusUpdate,
    myId, cid, closePanel, selectPeer,
  } = useChat();

  const [users,     setUsers]     = useState([]);
  const [messages,  setMessages]  = useState([]);
  const [input,     setInput]     = useState('');
  const [uploading, setUploading] = useState(false);
  const [searchQ,   setSearchQ]   = useState('');
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  // statusMap: { [msgId]: 'delivered' | 'read' } — real-time status for sent messages
  const [statusMap, setStatusMap] = useState({});
  // viewFile: { url, name, mime } | null — file preview modal
  const [viewFile,  setViewFile]  = useState(null);

  const endRef      = useRef(null);
  const fileRef     = useRef(null);
  const inputRef    = useRef(null);
  const typingTimer = useRef(null);

  // Load user list when panel opens
  useEffect(() => {
    if (!isChatOpen) return;
    axios.get('/api/auth/users')
      .then(r => setUsers((r.data || []).filter(u => String(u.id || u.userId) !== myId)))
      .catch(() => {});
  }, [isChatOpen, myId]);

  // Load conversation when peer changes
  useEffect(() => {
    if (!activePeer || !cid || !myId) { setMessages([]); return; }
    setLoadingMsgs(true);
    axios.get('/api/chat/messages', {
      params: { companyId: cid, fromUserId: myId, toUserId: activePeer },
    })
      .then(r => setMessages(r.data || []))
      .catch(() => setMessages([]))
      .finally(() => setLoadingMsgs(false));
  }, [activePeer, cid, myId]);

  // Append incoming messages from socket + emit delivered ack
  useEffect(() => {
    if (!incomingMsg) return;
    const from = String(incomingMsg.fromUserId);
    const to   = String(incomingMsg.toUserId);
    if (activePeer && (from === activePeer || to === activePeer)) {
      setMessages(m => {
        if (m.some(x => x.id === incomingMsg.id)) return m;
        return [...m, incomingMsg];
      });
    }
    // If I'm the recipient, mark as delivered on server + notify sender
    if (to === myId && cid) {
      axios.post('/api/chat/deliver', {
        companyId: cid, msgId: incomingMsg.id,
        fromUserId: from, toUserId: myId,
      }).catch(() => {});
      socketRef.current?.emit('chat:deliveredAck', {
        msgId: incomingMsg.id,
        toUserId: from, // tell the sender
      });
    }
  }, [incomingMsg]); // eslint-disable-line

  // When conversation loads, emit readAck for all unread messages from activePeer
  useEffect(() => {
    if (!activePeer || !messages.length || !myId) return;
    const unreadIds = messages
      .filter(m => String(m.fromUserId) === activePeer && !m.read)
      .map(m => m.id);
    if (unreadIds.length > 0) {
      socketRef.current?.emit('chat:readAck', {
        msgIds: unreadIds,
        toUserId: activePeer,
      });
    }
  }, [messages, activePeer]); // eslint-disable-line

  // Apply incoming status updates (delivered / read) to statusMap
  useEffect(() => {
    if (!msgStatusUpdate) return;
    setStatusMap(prev => {
      const next = { ...prev };
      msgStatusUpdate.msgIds.forEach(id => {
        if (msgStatusUpdate.type === 'read' || next[id] !== 'read') {
          next[id] = msgStatusUpdate.type;
        }
      });
      return next;
    });
  }, [msgStatusUpdate]);

  // Auto-scroll to bottom
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, typingFrom]);

  // Focus input when peer selected
  useEffect(() => {
    if (activePeer) setTimeout(() => inputRef.current?.focus(), 80);
  }, [activePeer]);

  /* ── send text ── */
  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || !activePeer) return;
    setInput('');
    clearTimeout(typingTimer.current);
    socketRef.current?.emit('chat:stopTyping', { toUserId: activePeer });
    try {
      const { data: msg } = await axios.post('/api/chat/messages', {
        companyId: cid, fromUserId: myId, toUserId: activePeer, text,
      });
      setMessages(m => [...m, msg]);
      socketRef.current?.emit('chat:relay', msg);
    } catch {}
  }, [input, activePeer, cid, myId, socketRef]);

  /* ── send file ── */
  const handleFile = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!file || !activePeer) return;
    if (file.size > 20 * 1024 * 1024) {
      alert('File size must be under 20 MB');
      if (fileRef.current) fileRef.current.value = '';
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('companyId', cid);
      fd.append('fromUserId', myId);
      fd.append('toUserId', activePeer);
      const { data: msg } = await axios.post('/api/chat/upload', fd);
      setMessages(m => [...m, msg]);
      socketRef.current?.emit('chat:relay', msg);
    } catch (err) {
      alert('Upload failed: ' + (err.response?.data?.error || err.message));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }, [activePeer, cid, myId, socketRef]);

  /* ── typing indicator ── */
  const handleTyping = (e) => {
    setInput(e.target.value);
    if (!activePeer) return;
    socketRef.current?.emit('chat:typing', { toUserId: activePeer });
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(
      () => socketRef.current?.emit('chat:stopTyping', { toUserId: activePeer }),
      1500,
    );
  };

  if (!isChatOpen) return null;

  /* ── File viewer modal ── */
  const FileModal = viewFile ? (
    <div
      onClick={e => { if (e.target === e.currentTarget) setViewFile(null); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 1400,
        background: 'rgba(0,0,0,0.72)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      }}
    >
      {/* Modal box */}
      <div style={{
        background: '#1e293b', borderRadius: 12, overflow: 'hidden',
        width: '90vw', maxWidth: 900, height: '88vh',
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
      }}>
        {/* Header */}
        <div style={{
          background: P, padding: '10px 16px',
          display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
        }}>
          <span style={{ fontSize: 18 }}>{fileIcon(viewFile.mime)}</span>
          <span style={{ color: '#fff', fontWeight: 600, fontSize: 13, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {viewFile.name}
          </span>
          <a
            href={`${viewFile.url}?download=1&name=${encodeURIComponent(viewFile.name)}`}
            style={{
              background: 'rgba(255,255,255,0.15)', color: '#fff', border: 'none',
              borderRadius: 6, padding: '5px 12px', cursor: 'pointer', fontSize: 12,
              fontWeight: 700, textDecoration: 'none', marginRight: 4,
            }}
          >↓ Download</a>
          <button
            onClick={() => setViewFile(null)}
            style={{
              background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 6,
              color: '#fff', width: 30, height: 30, cursor: 'pointer', fontSize: 18,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >×</button>
        </div>
        {/* Content */}
        <div style={{ flex: 1, overflow: 'hidden', background: '#f8f8f8' }}>
          {viewFile.mime?.includes('pdf') ? (
            <iframe
              src={`${viewFile.url}#toolbar=1&view=FitH`}
              title={viewFile.name}
              style={{ width: '100%', height: '100%', border: 'none' }}
            />
          ) : viewFile.mime?.includes('image') ? (
            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#111', overflow: 'auto' }}>
              <img
                src={viewFile.url}
                alt={viewFile.name}
                style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
              />
            </div>
          ) : (
            <div style={{ padding: 40, textAlign: 'center', color: '#555', fontFamily: F }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>{fileIcon(viewFile.mime)}</div>
              <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>{viewFile.name}</div>
              <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 24 }}>Preview not available for this file type</div>
              <a href={`${viewFile.url}?download=1&name=${encodeURIComponent(viewFile.name)}`}
                style={{ background: P, color: '#fff', padding: '10px 24px', borderRadius: 8, textDecoration: 'none', fontWeight: 700, fontSize: 13 }}>
                ↓ Download File
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  ) : null;

  const peer     = users.find(u => String(u.id || u.userId) === activePeer);
  const peerName = peer ? (peer.name || peer.username) : (activePeer || '');
  const peerOnline  = activePeer && onlineIds.includes(activePeer);
  const peerTyping  = activePeer && typingFrom[activePeer];
  const panelWidth  = activePeer ? 720 : 280;

  // group messages by day
  const grouped = [];
  let lastDay = '';
  messages.forEach(m => {
    const dl = dayLabel(m.timestamp);
    if (dl !== lastDay) { grouped.push({ isDay: true, label: dl }); lastDay = dl; }
    grouped.push({ isDay: false, msg: m });
  });

  const filteredUsers = users.filter(u => {
    if (!searchQ) return true;
    const n = (u.name || u.username || '').toLowerCase();
    return n.includes(searchQ.toLowerCase());
  });

  return (
    <>
      {FileModal}
      <style>{`
        .chat-bounce { animation: chatBounce 1.2s infinite; }
        @keyframes chatBounce {
          0%,60%,100% { transform:translateY(0); }
          30%          { transform:translateY(-5px); }
        }
        .chat-user-row:hover { background: #f0fafa !important; }
        @keyframes chatSpin { to { transform: rotate(360deg); } }
      `}</style>

      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 1200,
        width: panelWidth, display: 'flex',
        boxShadow: '-6px 0 32px rgba(0,0,0,0.18)',
        fontFamily: F, transition: 'width 0.2s ease',
        borderLeft: '1px solid rgba(0,0,0,0.08)',
      }}>

        {/* ────────── USER LIST PANEL ────────── */}
        <div style={{
          width: 280, flexShrink: 0, background: '#fff',
          display: 'flex', flexDirection: 'column', height: '100%',
          borderRight: activePeer ? '1px solid #e5e7eb' : 'none',
        }}>
          {/* Header */}
          <div style={{
            background: P, padding: '14px 12px 10px',
            display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
          }}>
            <div style={{ flex: 1 }}>
              <div style={{ color: '#fff', fontWeight: 800, fontSize: 15 }}>Team Chat</div>
              <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 10.5 }}>
                {onlineIds.length} user{onlineIds.length !== 1 ? 's' : ''} online
              </div>
            </div>
            <button onClick={closePanel} title="Close" style={{
              background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 6,
              color: '#fff', width: 28, height: 28, cursor: 'pointer', fontSize: 17,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>×</button>
          </div>

          {/* Search */}
          <div style={{ padding: '8px 10px', borderBottom: '1px solid #f0f0f0', flexShrink: 0 }}>
            <input
              value={searchQ} onChange={e => setSearchQ(e.target.value)}
              placeholder="Search users…"
              style={{
                width: '100%', boxSizing: 'border-box', border: '1px solid #e5e7eb',
                borderRadius: 8, padding: '6px 10px', fontSize: 12, outline: 'none',
                background: '#f8f9fa', fontFamily: F,
              }}
            />
          </div>

          {/* Users */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {filteredUsers.length === 0 && (
              <div style={{ padding: 24, textAlign: 'center', color: '#9ca3af', fontSize: 12 }}>No users</div>
            )}
            {filteredUsers.map(u => {
              const uid    = String(u.id || u.userId);
              const name   = u.name || u.username || uid;
              const online = onlineIds.includes(uid);
              const cnt    = unread[uid] || 0;
              const active = uid === activePeer;
              const isTyp  = typingFrom[uid];
              return (
                <div
                  key={uid}
                  className="chat-user-row"
                  onClick={() => selectPeer(uid)}
                  style={{
                    padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10,
                    cursor: 'pointer', borderBottom: '1px solid #f0f0f0',
                    background: active ? '#e6f2f2' : 'transparent',
                    borderLeft: active ? `3px solid ${P}` : '3px solid transparent',
                    transition: 'background 0.1s',
                  }}
                >
                  <div style={{ position: 'relative', flexShrink: 0 }}>
                    <div style={{
                      width: 38, height: 38, borderRadius: '50%', background: P,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: '#fff', fontWeight: 700, fontSize: 15, userSelect: 'none',
                    }}>
                      {(name[0] || '?').toUpperCase()}
                    </div>
                    <div style={{
                      position: 'absolute', bottom: 1, right: 1,
                      width: 10, height: 10, borderRadius: '50%',
                      background: online ? '#22c55e' : '#9ca3af',
                      border: '2px solid #fff',
                    }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontWeight: active || cnt > 0 ? 700 : 500, fontSize: 12.5,
                      color: '#111', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>{name}</div>
                    <div style={{ fontSize: 10.5, color: online ? '#16a34a' : '#9ca3af', fontStyle: isTyp ? 'italic' : 'normal' }}>
                      {isTyp ? 'typing…' : online ? 'Online' : 'Offline'}
                    </div>
                  </div>
                  {cnt > 0 && (
                    <div style={{
                      background: '#ef4444', color: '#fff', borderRadius: 10,
                      padding: '2px 7px', fontSize: 10, fontWeight: 800,
                      minWidth: 18, textAlign: 'center', flexShrink: 0,
                    }}>
                      {cnt > 99 ? '99+' : cnt}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ────────── CONVERSATION PANEL ────────── */}
        {activePeer && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#f0f2f5', minWidth: 0 }}>

            {/* Conv header */}
            <div style={{
              background: P, padding: '10px 14px',
              display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
            }}>
              <button onClick={() => selectPeer(null)} title="Back" style={{
                background: 'rgba(255,255,255,0.12)', border: 'none', borderRadius: 6,
                color: '#fff', width: 28, height: 28, cursor: 'pointer', fontSize: 16,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>‹</button>
              <div style={{ position: 'relative', flexShrink: 0 }}>
                <div style={{
                  width: 38, height: 38, borderRadius: '50%', background: 'rgba(255,255,255,0.2)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#fff', fontWeight: 700, fontSize: 16,
                }}>
                  {(peerName[0] || '?').toUpperCase()}
                </div>
                <div style={{
                  position: 'absolute', bottom: 1, right: 1,
                  width: 11, height: 11, borderRadius: '50%',
                  background: peerOnline ? '#22c55e' : '#9ca3af',
                  border: `2px solid ${P}`,
                }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>{peerName}</div>
                <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: 10.5 }}>
                  {peerTyping
                    ? 'typing…'
                    : peerOnline
                      ? 'Online'
                      : 'Offline — messages saved and delivered when they come online'}
                </div>
              </div>
            </div>

            {/* Messages area */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 3 }}>
              {loadingMsgs && (
                <div style={{ textAlign: 'center', color: '#9ca3af', fontSize: 12, padding: 20 }}>Loading…</div>
              )}
              {!loadingMsgs && grouped.length === 0 && (
                <div style={{ textAlign: 'center', color: '#9ca3af', fontSize: 12, padding: 32 }}>
                  No messages yet. Say hello 👋
                </div>
              )}

              {grouped.map((g, i) => {
                if (g.isDay) return (
                  <div key={`d${i}`} style={{ textAlign: 'center', margin: '10px 0 6px' }}>
                    <span style={{
                      background: '#dce8e8', color: '#3d7070', fontSize: 10.5,
                      padding: '3px 12px', borderRadius: 12, fontWeight: 600,
                    }}>{g.label}</span>
                  </div>
                );

                const m      = g.msg;
                const isMine = String(m.fromUserId) === myId;
                return (
                  <div key={m.id || i} style={{ display: 'flex', justifyContent: isMine ? 'flex-end' : 'flex-start', marginBottom: 2 }}>
                    <div style={{
                      maxWidth: '70%', padding: m.file ? '8px 10px' : '8px 12px',
                      borderRadius: isMine ? '14px 14px 3px 14px' : '14px 14px 14px 3px',
                      background: isMine ? P : '#fff',
                      color: isMine ? '#fff' : '#111',
                      boxShadow: '0 1px 4px rgba(0,0,0,0.1)',
                      fontSize: 13, lineHeight: 1.5, wordBreak: 'break-word',
                    }}>
                      {m.file ? (() => {
                        const fileUrl  = `/api/chat/file/${cid}/${m.file.storedAs}`;
                        const dlUrl    = `${fileUrl}?download=1&name=${encodeURIComponent(m.file.name)}`;
                        const canView  = m.file.mime?.includes('pdf') || m.file.mime?.includes('image');
                        const btnBase  = {
                          border: 'none', borderRadius: 5, cursor: 'pointer',
                          fontSize: 11, fontWeight: 700, padding: '4px 10px',
                          transition: 'opacity 0.15s',
                        };
                        return (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                            <span style={{ fontSize: 26, lineHeight: 1, flexShrink: 0 }}>{fileIcon(m.file.mime)}</span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{
                                fontWeight: 600, fontSize: 12.5,
                                color: isMine ? '#fff' : '#111',
                                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                maxWidth: 180,
                              }}>{m.file.name}</div>
                              <div style={{ fontSize: 10, color: isMine ? 'rgba(255,255,255,0.6)' : '#9ca3af', marginBottom: 6 }}>
                                {fmtSize(m.file.size)}
                              </div>
                              <div style={{ display: 'flex', gap: 6 }}>
                                {canView && (
                                  <button
                                    onClick={() => setViewFile({ url: fileUrl, name: m.file.name, mime: m.file.mime })}
                                    style={{ ...btnBase, background: isMine ? 'rgba(255,255,255,0.22)' : '#e0f2f1', color: isMine ? '#fff' : P }}
                                  >👁 View</button>
                                )}
                                <a
                                  href={dlUrl}
                                  style={{ ...btnBase, background: isMine ? 'rgba(255,255,255,0.15)' : '#f3f4f6', color: isMine ? '#fff' : '#374151', textDecoration: 'none', display: 'inline-block' }}
                                >↓ Download</a>
                              </div>
                            </div>
                          </div>
                        );
                      })() : (
                        <span style={{ whiteSpace: 'pre-wrap' }}>{m.text}</span>
                      )}
                      <div style={{
                        display: 'flex', justifyContent: 'flex-end', alignItems: 'center',
                        gap: 5, marginTop: 4,
                      }}>
                        <span style={{ fontSize: 9.5, color: isMine ? 'rgba(255,255,255,0.6)' : '#aaa' }}>
                          {fmtTime(m.timestamp)}
                        </span>
                        {isMine && (() => {
                          const st = msgStatus(m, statusMap);
                          const s  = STATUS_STYLE[st];
                          return (
                            <span style={{
                              fontSize: 9, fontWeight: 700, color: s.color,
                              border: `1px solid ${s.color}`,
                              borderRadius: 4, padding: '1px 5px',
                              letterSpacing: '0.3px', lineHeight: 1.4,
                            }}>
                              {s.label}
                            </span>
                          );
                        })()}
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Typing indicator */}
              {peerTyping && (
                <div style={{ display: 'flex', justifyContent: 'flex-start', marginTop: 4 }}>
                  <div style={{
                    background: '#fff', padding: '10px 14px', borderRadius: '14px 14px 14px 3px',
                    boxShadow: '0 1px 4px rgba(0,0,0,0.1)', display: 'flex', gap: 5, alignItems: 'center',
                  }}>
                    {[0, 1, 2].map(i => (
                      <div key={i} className="chat-bounce" style={{
                        width: 7, height: 7, borderRadius: '50%', background: '#aaa',
                        animationDelay: `${i * 0.18}s`,
                      }} />
                    ))}
                  </div>
                </div>
              )}

              <div ref={endRef} />
            </div>

            {/* Input bar */}
            <div style={{
              background: '#f0f2f5', padding: '10px 14px',
              borderTop: '1px solid #e5e7eb',
              display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
            }}>
              <input
                ref={fileRef} type="file" style={{ display: 'none' }}
                onChange={handleFile}
                accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.zip,.rar,.png,.jpg,.jpeg,.pptx"
              />
              <button
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                title="Attach file (max 20 MB)"
                style={{
                  width: 36, height: 36, borderRadius: '50%',
                  background: '#e5e7eb', border: 'none', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 17, flexShrink: 0, transition: 'background 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = '#d1d5db'; }}
                onMouseLeave={e => { e.currentTarget.style.background = '#e5e7eb'; }}
              >
                {uploading ? (
                  <span style={{ animation: 'chatSpin 0.8s linear infinite', display: 'inline-block' }}>⏳</span>
                ) : '📎'}
              </button>

              <input
                ref={inputRef}
                value={input}
                onChange={handleTyping}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                placeholder="Type a message…"
                style={{
                  flex: 1, border: '1px solid #e5e7eb', borderRadius: 22,
                  padding: '9px 16px', fontSize: 13, outline: 'none',
                  background: '#fff', fontFamily: F, lineHeight: 1.4,
                }}
              />

              <button
                onClick={handleSend}
                disabled={!input.trim()}
                title="Send (Enter)"
                style={{
                  width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                  background: input.trim() ? P : '#d1d5db',
                  border: 'none', cursor: input.trim() ? 'pointer' : 'default',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'background 0.15s',
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                  stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
