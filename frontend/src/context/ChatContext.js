import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import axios from 'axios';
import { useAuth } from './AuthContext';
import { useCompany } from './CompanyContext';

const ChatCtx = createContext(null);

export const ChatProvider = ({ children }) => {
  const { user } = useAuth();
  const { selectedCompany } = useCompany();
  const socketRef   = useRef(null);
  const typingTimers = useRef({});

  const [onlineIds,      setOnlineIds]      = useState([]);
  const [isChatOpen,     setIsChatOpen]     = useState(false);
  const [activePeer,     setActivePeer]     = useState(null);   // userId string | null
  const [unread,         setUnread]         = useState({});     // { userId|grp_groupId: count }
  const [incomingMsg,    setIncomingMsg]    = useState(null);   // latest received msg object
  const [typingFrom,     setTypingFrom]     = useState({});     // { userId: true }
  const [msgStatusUpdate, setMsgStatusUpdate] = useState(null); // { type:'delivered'|'read', msgIds:[] }
  const [incomingCall,     setIncomingCall]   = useState(null);   // { fromUserId, callType, offer }
  const [incomingGroupMsg, setIncomingGroupMsg] = useState(null); // latest group msg
  const [callSignal,       setCallSignal]    = useState(null);   // { type, data, _ts } — WebRTC signals for Chat.jsx

  const myId = user ? String(user.id || user.userId) : null;
  const cid  = selectedCompany?.companyId || '';
  const total = Object.values(unread).reduce((a, b) => a + b, 0);

  // ── Socket connection ──
  useEffect(() => {
    if (!myId) return;
    const SOCKET_URL = window.location.port === '3000'
      ? 'http://localhost:5000'
      : window.location.origin;
    const s = io(SOCKET_URL, { transports: ['websocket', 'polling'] });
    socketRef.current = s;

    s.on('connect', () => s.emit('user:join', { userId: myId, companyId: cid }));

    s.on('users:online', ids => setOnlineIds(ids.map(String)));

    s.on('chat:message', msg => {
      setIncomingMsg({ ...msg, _recv: Date.now() });
      const from = String(msg.fromUserId);
      setActivePeer(cur => {
        if (cur !== from) {
          setUnread(u => ({ ...u, [from]: (u[from] || 0) + 1 }));
        }
        return cur;
      });
    });

    s.on('chat:typing', ({ fromUserId }) => {
      const uid = String(fromUserId);
      setTypingFrom(t => ({ ...t, [uid]: true }));
      clearTimeout(typingTimers.current[uid]);
      typingTimers.current[uid] = setTimeout(() => {
        setTypingFrom(t => { const n = { ...t }; delete n[uid]; return n; });
      }, 3000);
    });

    s.on('chat:stopTyping', ({ fromUserId }) => {
      const uid = String(fromUserId);
      clearTimeout(typingTimers.current[uid]);
      setTypingFrom(t => { const n = { ...t }; delete n[uid]; return n; });
    });

    // Delivery/read status updates for messages I sent
    s.on('chat:delivered', ({ msgId }) => {
      setMsgStatusUpdate({ type: 'delivered', msgIds: [msgId], _ts: Date.now() });
    });
    s.on('chat:read', ({ msgIds }) => {
      setMsgStatusUpdate({ type: 'read', msgIds, _ts: Date.now() });
    });

    // Group messages
    s.on('chat:groupMessage', msg => {
      setIncomingGroupMsg({ ...msg, _recv: Date.now() });
      const key = `grp_${msg.groupId}`;
      setActivePeer(cur => {
        if (cur !== key) setUnread(u => ({ ...u, [key]: (u[key] || 0) + 1 }));
        return cur;
      });
    });

    // Call signaling — all events captured here so Chat.jsx doesn't need direct socket access
    s.on('call:incoming',      data => setIncomingCall({ ...data, _ts: Date.now() }));
    s.on('call:answered',      data => setCallSignal({ type: 'answered',  data, _ts: Date.now() }));
    s.on('call:ice-candidate', data => setCallSignal({ type: 'ice',       data, _ts: Date.now() }));
    s.on('call:rejected',      ()   => setCallSignal({ type: 'rejected',  data: null, _ts: Date.now() }));
    s.on('call:ended',         ()   => {
      setIncomingCall(null);
      setCallSignal({ type: 'ended', data: null, _ts: Date.now() });
    });

    return () => { s.disconnect(); socketRef.current = null; };
  }, [myId]); // eslint-disable-line

  // Update companyId on socket when it changes
  useEffect(() => {
    if (socketRef.current?.connected && myId && cid) {
      socketRef.current.emit('user:join', { userId: myId, companyId: cid });
    }
  }, [cid, myId]);

  // Load unread counts
  useEffect(() => {
    if (!myId || !cid) return;
    axios.get('/api/chat/unread', { params: { companyId: cid, userId: myId } })
      .then(r => setUnread(r.data || {}))
      .catch(() => {});
  }, [myId, cid]);

  const openPanel = useCallback(() => setIsChatOpen(true), []);

  const closePanel = useCallback(() => {
    setIsChatOpen(false);
    setActivePeer(null);
  }, []);

  const selectPeer = useCallback((uid) => {
    if (!uid) { setActivePeer(null); return; }
    const k = String(uid);
    setActivePeer(k);
    setIsChatOpen(true);
    setUnread(u => { const n = { ...u }; delete n[k]; return n; });
  }, []);

  return (
    <ChatCtx.Provider value={{
      socketRef, onlineIds,
      isChatOpen, activePeer,
      unread, total, incomingMsg, typingFrom, msgStatusUpdate,
      incomingCall, setIncomingCall,
      incomingGroupMsg,
      callSignal,
      myId, cid,
      openPanel, closePanel, selectPeer,
    }}>
      {children}
    </ChatCtx.Provider>
  );
};

export const useChat = () => useContext(ChatCtx);
