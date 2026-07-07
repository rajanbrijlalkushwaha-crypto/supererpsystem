import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import { useChat } from '../context/ChatContext';

const P  = '#104f4f';
const F  = 'Inter, system-ui, sans-serif';
const RTC_CONFIG = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }] };

/* ── message status ── */
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

/* ── User avatar: photo or colored initial ── */
function UserAv({ user, size = 38, border, bg }) {
  const uid  = String(user?.id || user?.userId || '');
  const name = user?.name || user?.username || '?';
  const [imgOk, setImgOk] = React.useState(!!user?.photoExt);
  const initial = (name[0] || '?').toUpperCase();
  const colors  = ['#0d6d6d','#1d4ed8','#7c3aed','#b45309','#0f766e','#be185d'];
  const color   = bg || colors[initial.charCodeAt(0) % colors.length];
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: color, overflow: 'hidden', position: 'relative',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      border: border || 'none',
    }}>
      {imgOk ? (
        <img src={`/api/auth/profile/photo/${uid}`} alt={name}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          onError={() => setImgOk(false)} />
      ) : (
        <span style={{ color: '#fff', fontWeight: 700, fontSize: Math.round(size * 0.38), userSelect: 'none' }}>
          {initial}
        </span>
      )}
    </div>
  );
}

/* ── Group avatar ── */
function GroupAv({ group, size = 38 }) {
  const n = (group?.name || 'G')[0].toUpperCase();
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: '#7c3aed', display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <span style={{ color: '#fff', fontWeight: 700, fontSize: Math.round(size * 0.38) }}>{n}</span>
    </div>
  );
}

/* ── helpers ── */
function fileIcon(mime = '') {
  if (mime.includes('pdf'))                             return '📄';
  if (mime.includes('word') || mime.includes('docx'))   return '📝';
  if (mime.includes('excel') || mime.includes('sheet')) return '📊';
  if (mime.includes('image'))                           return '🖼️';
  if (mime.includes('audio'))                           return '🎙️';
  if (mime.includes('zip') || mime.includes('rar'))     return '🗜️';
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
function fmtDuration(secs) {
  const m = Math.floor(secs / 60).toString().padStart(2, '0');
  const s = (secs % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}
function dayLabel(ts) {
  const d = new Date(ts);
  const today = new Date();
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString())     return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}
function orderStatusColor(s = '') {
  const l = s.toLowerCase();
  if (l.includes('complet') || l.includes('done') || l.includes('approv')) return '#16a34a';
  if (l.includes('cancel') || l.includes('reject'))                         return '#dc2626';
  if (l.includes('pending') || l.includes('draft'))                         return '#d97706';
  return '#0284c7';
}

/* ────────────────────────────────────────────────────
   MAIN CHAT PANEL
──────────────────────────────────────────────────────*/
export default function Chat() {
  const {
    socketRef, onlineIds, isChatOpen, activePeer,
    unread, incomingMsg, typingFrom, msgStatusUpdate,
    incomingCall, setIncomingCall,
    incomingGroupMsg,
    callSignal,
    myId, cid, closePanel, selectPeer,
  } = useChat();

  /* ── state ── */
  const [users,         setUsers]         = useState([]);
  const [messages,      setMessages]      = useState([]);
  const [input,         setInput]         = useState('');
  const [uploading,     setUploading]     = useState(false);
  const [searchQ,       setSearchQ]       = useState('');
  const [loadingMsgs,   setLoadingMsgs]   = useState(false);
  const [statusMap,     setStatusMap]     = useState({});
  const [viewFile,      setViewFile]      = useState(null);
  const [hoveredMsg,    setHoveredMsg]    = useState(null);
  const [replyTo,       setReplyTo]       = useState(null); // { id, text, fromName }
  const [pendingOrder,  setPendingOrder]  = useState(null); // attached order object

  // Order picker
  const [attachMenu,    setAttachMenu]    = useState(false); // "+" popup
  const [orderPicker,   setOrderPicker]   = useState(null);  // 'SO' | 'PO' | null
  const [orders,        setOrders]        = useState([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [orderQ,        setOrderQ]        = useState('');

  // Groups
  const [groups,             setGroups]             = useState([]);
  const [activeGroup,        setActiveGroup]        = useState(null);
  const [groupMessages,      setGroupMessages]      = useState([]);
  const [loadingGroupMsgs,   setLoadingGroupMsgs]   = useState(false);
  const [createGroupOpen,    setCreateGroupOpen]    = useState(false);
  const [newGroupName,       setNewGroupName]       = useState('');
  const [selectedMembers,    setSelectedMembers]    = useState([]);

  // Voice recording
  const [isRecording,    setIsRecording]    = useState(false);
  const [recordingTime,  setRecordingTime]  = useState(0);

  // Calls
  const [callState,     setCallState]     = useState('idle'); // idle|outgoing|incoming|active
  const [callType,      setCallType]      = useState('voice');
  const [callPeerId,    setCallPeerId]    = useState(null);
  const [callDuration,  setCallDuration]  = useState(0);
  const [micMuted,      setMicMuted]      = useState(false);
  const [camOff,        setCamOff]        = useState(false);

  /* ── refs ── */
  const endRef          = useRef(null);
  const fileRef         = useRef(null);
  const inputRef        = useRef(null);
  const typingTimer     = useRef(null);
  const pcRef           = useRef(null);
  const localStreamRef  = useRef(null);
  const localVideoRef   = useRef(null);
  const remoteVideoRef  = useRef(null);
  const mediaRecRef     = useRef(null);
  const audioChunks     = useRef([]);
  const recTimerRef     = useRef(null);
  const callTimerRef    = useRef(null);
  const iceQueueRef     = useRef([]);
  const callPeerRef     = useRef(null); // keep in sync with callPeerId

  useEffect(() => { callPeerRef.current = callPeerId; }, [callPeerId]);

  /* ── load users + groups on mount (also needed for incoming call banner) ── */
  useEffect(() => {
    if (!myId || !cid) return;
    axios.get('/api/auth/users').then(r => setUsers((Array.isArray(r.data) ? r.data : []).filter(u => String(u.id || u.userId) !== myId))).catch(() => {});
    axios.get('/api/chat/groups', { params: { companyId: cid, userId: myId } }).then(r => setGroups(Array.isArray(r.data) ? r.data : [])).catch(() => {});
  }, [myId, cid]);

  /* ── load 1-1 conversation ── */
  useEffect(() => {
    if (activeGroup) return;
    if (!activePeer || !cid || !myId) { setMessages([]); return; }
    setLoadingMsgs(true);
    axios.get('/api/chat/messages', { params: { companyId: cid, fromUserId: myId, toUserId: activePeer } })
      .then(r => setMessages(r.data || []))
      .catch(() => setMessages([]))
      .finally(() => setLoadingMsgs(false));
  }, [activePeer, activeGroup, cid, myId]);

  /* ── load group conversation ── */
  useEffect(() => {
    if (!activeGroup || !cid || !myId) { setGroupMessages([]); return; }
    setLoadingGroupMsgs(true);
    axios.get('/api/chat/group-messages', { params: { companyId: cid, groupId: activeGroup, userId: myId } })
      .then(r => setGroupMessages(r.data || []))
      .catch(() => setGroupMessages([]))
      .finally(() => setLoadingGroupMsgs(false));
  }, [activeGroup, cid, myId]);

  /* ── incoming 1-1 message ── */
  useEffect(() => {
    if (!incomingMsg) return;
    const from = String(incomingMsg.fromUserId);
    const to   = String(incomingMsg.toUserId);
    if (!activeGroup && activePeer && (from === activePeer || to === activePeer)) {
      setMessages(m => m.some(x => x.id === incomingMsg.id) ? m : [...m, incomingMsg]);
    }
    if (to === myId && cid) {
      axios.post('/api/chat/deliver', { companyId: cid, msgId: incomingMsg.id, fromUserId: from, toUserId: myId }).catch(() => {});
      socketRef.current?.emit('chat:deliveredAck', { msgId: incomingMsg.id, toUserId: from });
    }
  }, [incomingMsg]); // eslint-disable-line

  /* ── incoming group message ── */
  useEffect(() => {
    if (!incomingGroupMsg) return;
    if (activeGroup === incomingGroupMsg.groupId) {
      setGroupMessages(m => m.some(x => x.id === incomingGroupMsg.id) ? m : [...m, incomingGroupMsg]);
    }
  }, [incomingGroupMsg, activeGroup]);

  /* ── emit read acks when conversation loads ── */
  useEffect(() => {
    if (!activePeer || !messages.length || !myId || activeGroup) return;
    const unreadIds = messages.filter(m => String(m.fromUserId) === activePeer && !m.read).map(m => m.id);
    if (unreadIds.length > 0) socketRef.current?.emit('chat:readAck', { msgIds: unreadIds, toUserId: activePeer });
  }, [messages, activePeer]); // eslint-disable-line

  /* ── status map updates ── */
  useEffect(() => {
    if (!msgStatusUpdate) return;
    setStatusMap(prev => {
      const next = { ...prev };
      msgStatusUpdate.msgIds.forEach(id => {
        if (msgStatusUpdate.type === 'read' || next[id] !== 'read') next[id] = msgStatusUpdate.type;
      });
      return next;
    });
  }, [msgStatusUpdate]);

  /* ── auto scroll ── */
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, groupMessages, typingFrom]);

  /* ── focus input ── */
  useEffect(() => {
    if (activePeer || activeGroup) setTimeout(() => inputRef.current?.focus(), 80);
  }, [activePeer, activeGroup]);

  /* ── call cleanup (defined first so callSignal effect can reference it) ── */
  const cleanupCall = useCallback(() => {
    clearInterval(callTimerRef.current);
    if (pcRef.current) { pcRef.current.close(); pcRef.current = null; }
    if (localStreamRef.current) { localStreamRef.current.getTracks().forEach(t => t.stop()); localStreamRef.current = null; }
    setCallState('idle');
    setCallPeerId(null);
    setCallDuration(0);
    setMicMuted(false);
    setCamOff(false);
    if (localVideoRef.current)  localVideoRef.current.srcObject  = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
  }, []);

  /* ── debug: log whenever incomingCall changes ── */
  useEffect(() => {
    console.log('[Chat.jsx] incomingCall state:', incomingCall);
  }, [incomingCall]);

  /* ── WebRTC signal handler — driven by callSignal from ChatContext (avoids null-socket timing bug) ── */
  useEffect(() => {
    if (!callSignal) return;
    const { type, data } = callSignal;

    if (type === 'answered') {
      (async () => {
        if (!pcRef.current) return;
        try {
          await pcRef.current.setRemoteDescription(new RTCSessionDescription(data.answer));
          for (const c of iceQueueRef.current) await pcRef.current.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
          iceQueueRef.current = [];
          setCallState('active');
          clearInterval(callTimerRef.current);
          setCallDuration(0);
          callTimerRef.current = setInterval(() => setCallDuration(d => d + 1), 1000);
        } catch {}
      })();
    } else if (type === 'ice') {
      (async () => {
        if (!data?.candidate) return;
        if (pcRef.current?.remoteDescription) {
          await pcRef.current.addIceCandidate(new RTCIceCandidate(data.candidate)).catch(() => {});
        } else {
          iceQueueRef.current.push(data.candidate);
        }
      })();
    } else if (type === 'ended' || type === 'rejected') {
      cleanupCall();
    }
  }, [callSignal, cleanupCall]);

  const createPC = useCallback((peerId) => {
    const pc = new RTCPeerConnection(RTC_CONFIG);
    pc.onicecandidate = e => {
      if (e.candidate) socketRef.current?.emit('call:ice-candidate', { toUserId: peerId, candidate: e.candidate });
    };
    pc.ontrack = e => {
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = e.streams[0];
    };
    pc.onconnectionstatechange = () => {
      if (['disconnected', 'failed', 'closed'].includes(pc.connectionState)) cleanupCall();
    };
    return pc;
  }, [socketRef, cleanupCall]);

  /* ── start outgoing call ── */
  const startCall = useCallback(async (type) => {
    if (!activePeer || callState !== 'idle') return;
    const sock = socketRef.current;
    if (!sock?.connected) {
      alert('Not connected to server — please refresh and try again.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: type === 'video' });
      localStreamRef.current = stream;
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;
      const pc = createPC(activePeer);
      stream.getTracks().forEach(t => pc.addTrack(t, stream));
      pcRef.current = pc;
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      console.log('[Chat] emitting call:offer to', activePeer, 'type:', type);
      sock.emit('call:offer', { toUserId: activePeer, offer: pc.localDescription, callType: type });
      setCallType(type); setCallPeerId(activePeer); setCallState('outgoing');
    } catch (err) { alert('Cannot access mic/camera: ' + err.message); }
  }, [activePeer, callState, createPC, socketRef]);

  /* ── accept incoming call ── */
  const acceptCall = useCallback(async () => {
    if (!incomingCall) return;
    const { fromUserId, offer, callType: ct } = incomingCall;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: ct === 'video' });
      localStreamRef.current = stream;
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;
      const pc = createPC(fromUserId);
      stream.getTracks().forEach(t => pc.addTrack(t, stream));
      pcRef.current = pc;
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      for (const c of iceQueueRef.current) await pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
      iceQueueRef.current = [];
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socketRef.current?.emit('call:answer', { toUserId: fromUserId, answer: pc.localDescription });
      setCallType(ct); setCallPeerId(fromUserId); setCallState('active');
      setIncomingCall(null);
      clearInterval(callTimerRef.current);
      setCallDuration(0);
      callTimerRef.current = setInterval(() => setCallDuration(d => d + 1), 1000);
    } catch (err) { alert('Cannot access mic/camera: ' + err.message); rejectCall(); }
  }, [incomingCall, createPC, socketRef, setIncomingCall]); // eslint-disable-line

  const rejectCall = useCallback(() => {
    if (!incomingCall) return;
    socketRef.current?.emit('call:reject', { toUserId: incomingCall.fromUserId });
    setIncomingCall(null);
  }, [incomingCall, socketRef, setIncomingCall]);

  const hangUp = useCallback(() => {
    if (callPeerRef.current) socketRef.current?.emit('call:end', { toUserId: callPeerRef.current });
    cleanupCall();
  }, [socketRef, cleanupCall]);

  const toggleMic = useCallback(() => {
    if (!localStreamRef.current) return;
    localStreamRef.current.getAudioTracks().forEach(t => { t.enabled = micMuted; });
    setMicMuted(m => !m);
  }, [micMuted]);

  const toggleCam = useCallback(() => {
    if (!localStreamRef.current) return;
    localStreamRef.current.getVideoTracks().forEach(t => { t.enabled = camOff; });
    setCamOff(c => !c);
  }, [camOff]);

  /* ── voice recording ── */
  const startRecording = useCallback(async () => {
    if (isRecording) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/ogg;codecs=opus';
      const mr = new MediaRecorder(stream, { mimeType: mime });
      audioChunks.current = [];
      mr.ondataavailable = e => { if (e.data.size > 0) audioChunks.current.push(e.data); };
      mr.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(audioChunks.current, { type: mime });
        const ext  = mime.includes('webm') ? 'webm' : 'ogg';
        const file = new File([blob], `voice-${Date.now()}.${ext}`, { type: mime });
        await uploadFileObj(file);
      };
      mr.start(100);
      mediaRecRef.current = mr;
      setIsRecording(true);
      setRecordingTime(0);
      recTimerRef.current = setInterval(() => setRecordingTime(t => t + 1), 1000);
    } catch (err) { alert('Mic not accessible: ' + err.message); }
  }, [isRecording]); // eslint-disable-line

  const stopRecording = useCallback(() => {
    clearInterval(recTimerRef.current);
    if (mediaRecRef.current?.state !== 'inactive') mediaRecRef.current?.stop();
    setIsRecording(false);
    setRecordingTime(0);
  }, []);

  /* ── upload a File object (shared by file picker + voice recorder) ── */
  const uploadFileObj = useCallback(async (file) => {
    const target = activeGroup || activePeer;
    if (!file || !target) return;
    if (file.size > 20 * 1024 * 1024) { alert('File must be under 20 MB'); return; }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('companyId', cid);
      fd.append('fromUserId', myId);
      if (activeGroup) fd.append('groupId', activeGroup);
      else fd.append('toUserId', activePeer);
      if (replyTo) fd.append('replyTo', JSON.stringify(replyTo));
      const { data: msg } = await axios.post('/api/chat/upload', fd);
      if (activeGroup) {
        setGroupMessages(m => [...m, msg]);
        const grp = grpList.find(g => g.id === activeGroup);
        if (grp) socketRef.current?.emit('chat:groupRelay', { msg, memberIds: grp.members });
      } else {
        setMessages(m => [...m, msg]);
        socketRef.current?.emit('chat:relay', msg);
      }
      setReplyTo(null);
    } catch (err) { alert('Upload failed: ' + (err.response?.data?.error || err.message)); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ''; }
  }, [activeGroup, activePeer, cid, myId, replyTo, groups, socketRef]);

  /* ── send text ── */
  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text && !pendingOrder) return;
    const target = activeGroup || activePeer;
    if (!target) return;
    setInput('');
    clearTimeout(typingTimer.current);
    if (activePeer) socketRef.current?.emit('chat:stopTyping', { toUserId: activePeer });
    try {
      let msg;
      if (activeGroup) {
        const { data } = await axios.post('/api/chat/group-messages', {
          companyId: cid, groupId: activeGroup, fromUserId: myId,
          text, replyTo: replyTo || null, order: pendingOrder || null,
        });
        msg = data;
        setGroupMessages(m => [...m, msg]);
        const grp = grpList.find(g => g.id === activeGroup);
        if (grp) socketRef.current?.emit('chat:groupRelay', { msg, memberIds: grp.members });
      } else {
        const { data } = await axios.post('/api/chat/messages', {
          companyId: cid, fromUserId: myId, toUserId: activePeer,
          text, replyTo: replyTo || null, order: pendingOrder || null,
        });
        msg = data;
        setMessages(m => [...m, msg]);
        socketRef.current?.emit('chat:relay', msg);
      }
      setReplyTo(null);
      setPendingOrder(null);
    } catch {}
  }, [input, activePeer, activeGroup, cid, myId, socketRef, replyTo, pendingOrder, groups]);

  /* ── typing indicator ── */
  const handleTyping = e => {
    setInput(e.target.value);
    if (!activePeer) return;
    socketRef.current?.emit('chat:typing', { toUserId: activePeer });
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => socketRef.current?.emit('chat:stopTyping', { toUserId: activePeer }), 1500);
  };

  /* ── order picker ── */
  const openOrderPicker = useCallback(async (type) => {
    setOrderPicker(type);
    setAttachMenu(false);
    setOrderQ('');
    setLoadingOrders(true);
    try {
      const url = type === 'SO' ? '/api/sales-orders' : '/api/purchase-orders';
      const { data } = await axios.get(url, { params: { companyId: cid } });
      setOrders(data || []);
    } catch { setOrders([]); }
    finally { setLoadingOrders(false); }
  }, [cid]);

  const selectOrder = useCallback((ord) => {
    const isSOtype = orderPicker === 'SO';
    setPendingOrder({
      type: orderPicker,
      id:     String(ord.orderId || ord.id || ''),
      number: ord.orderNo || ord.poNo || ord.poNumber || String(ord.orderId || ''),
      party:  ord.customerName || ord.vendorName || ord.party || '',
      amount: ord.grandTotal || ord.totalAmount || 0,
      status: ord.status || '',
      label:  isSOtype ? 'Sales Order' : 'Purchase Order',
    });
    setOrderPicker(null);
  }, [orderPicker]);

  /* ── create group ── */
  const createGroup = useCallback(async () => {
    if (!newGroupName.trim() || selectedMembers.length === 0) return;
    try {
      const { data: grp } = await axios.post('/api/chat/groups', {
        companyId: cid, name: newGroupName.trim(),
        members: [...selectedMembers, myId], createdBy: myId,
      });
      setGroups(g => [...g, grp]);
      setCreateGroupOpen(false);
      setNewGroupName('');
      setSelectedMembers([]);
      openGroupConv(grp.id);
    } catch (err) { alert('Failed to create group: ' + (err.response?.data?.error || err.message)); }
  }, [cid, myId, newGroupName, selectedMembers]);

  const openGroupConv = useCallback((gid) => {
    selectPeer(null);
    setActiveGroup(gid);
  }, [selectPeer]);

  const openUserConv = useCallback((uid) => {
    setActiveGroup(null);
    selectPeer(uid);
  }, [selectPeer]);

  if (!isChatOpen) return (
    /* Incoming call notification when panel is closed */
    incomingCall ? (
      <IncomingCallBanner
        call={incomingCall} users={users} myId={myId}
        onAccept={acceptCall} onReject={rejectCall}
      />
    ) : null
  );

  /* ── derived ── */
  const peer        = users.find(u => String(u.id || u.userId) === activePeer);
  const peerName    = peer ? (peer.name || peer.username) : (activePeer || '');
  const peerOnline  = activePeer && onlineIds.includes(activePeer);
  const peerTyping  = activePeer && typingFrom[activePeer];
  const grpList     = Array.isArray(groups) ? groups : [];
  const activeGrp   = grpList.find(g => g.id === activeGroup);
  const isInConv    = !!(activePeer || activeGroup);
  const panelWidth  = isInConv ? 740 : 280;

  const activeMessages = activeGroup ? groupMessages : messages;
  const isLoading      = activeGroup ? loadingGroupMsgs : loadingMsgs;

  // Group day-separated list
  const grouped = [];
  let lastDay = '';
  activeMessages.forEach(m => {
    const dl = dayLabel(m.timestamp);
    if (dl !== lastDay) { grouped.push({ isDay: true, label: dl }); lastDay = dl; }
    grouped.push({ isDay: false, msg: m });
  });

  const filteredOrders = orders.filter(o => {
    if (!orderQ) return true;
    const s = orderQ.toLowerCase();
    return (
      (o.orderNo || o.poNo || '').toLowerCase().includes(s) ||
      (o.customerName || o.vendorName || '').toLowerCase().includes(s)
    );
  });

  const unreadKey = (uid) => `grp_${uid}`;

  return (
    <>
      {/* ── Order Picker Modal ── */}
      {orderPicker && (
        <div onClick={e => e.target === e.currentTarget && setOrderPicker(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 1600, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 14, width: 480, maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 80px rgba(0,0,0,0.4)' }}>
            <div style={{ background: P, padding: '12px 16px', borderRadius: '14px 14px 0 0', display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 18 }}>📋</span>
              <span style={{ color: '#fff', fontWeight: 700, flex: 1 }}>Select {orderPicker === 'SO' ? 'Sales Order' : 'Purchase Order'}</span>
              <button onClick={() => setOrderPicker(null)} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 6, color: '#fff', width: 28, height: 28, cursor: 'pointer', fontSize: 17 }}>×</button>
            </div>
            <div style={{ padding: '10px 12px', borderBottom: '1px solid #f0f0f0' }}>
              <input value={orderQ} onChange={e => setOrderQ(e.target.value)} placeholder="Search by number or party…"
                style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #e5e7eb', borderRadius: 8, padding: '7px 12px', fontSize: 12.5, outline: 'none', fontFamily: F }} />
            </div>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {loadingOrders && <div style={{ textAlign: 'center', padding: 24, color: '#9ca3af', fontSize: 13 }}>Loading…</div>}
              {!loadingOrders && filteredOrders.length === 0 && <div style={{ textAlign: 'center', padding: 24, color: '#9ca3af', fontSize: 13 }}>No orders found</div>}
              {filteredOrders.map(o => {
                const num    = o.orderNo || o.poNo || o.poNumber || String(o.orderId || '');
                const party  = o.customerName || o.vendorName || '';
                const amount = o.grandTotal || 0;
                return (
                  <div key={o.orderId || o.id} onClick={() => selectOrder(o)}
                    style={{ padding: '10px 14px', borderBottom: '1px solid #f8f8f8', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12 }}
                    onMouseEnter={e => { e.currentTarget.style.background = '#f0fafa'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = ''; }}>
                    <div style={{ width: 36, height: 36, borderRadius: 8, background: orderPicker === 'SO' ? '#e0f2f1' : '#ede9fe', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>
                      {orderPicker === 'SO' ? '📦' : '🛒'}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 13, color: '#111' }}>{num}</div>
                      <div style={{ fontSize: 11.5, color: '#555', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{party}</div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 13, color: P }}>₹{Number(amount).toLocaleString('en-IN')}</div>
                      <div style={{ fontSize: 10, color: orderStatusColor(o.status), fontWeight: 600, textTransform: 'capitalize' }}>{o.status || '—'}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── Create Group Modal ── */}
      {createGroupOpen && (
        <div onClick={e => e.target === e.currentTarget && setCreateGroupOpen(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 1600, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 14, width: 420, maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 80px rgba(0,0,0,0.4)' }}>
            <div style={{ background: '#7c3aed', padding: '12px 16px', borderRadius: '14px 14px 0 0', display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 20 }}>👥</span>
              <span style={{ color: '#fff', fontWeight: 700, flex: 1 }}>New Group</span>
              <button onClick={() => setCreateGroupOpen(false)} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 6, color: '#fff', width: 28, height: 28, cursor: 'pointer', fontSize: 17 }}>×</button>
            </div>
            <div style={{ padding: '12px 14px', borderBottom: '1px solid #f0f0f0' }}>
              <input value={newGroupName} onChange={e => setNewGroupName(e.target.value)} placeholder="Group name…"
                style={{ width: '100%', boxSizing: 'border-box', border: '1.5px solid #7c3aed', borderRadius: 8, padding: '8px 12px', fontSize: 13, outline: 'none', fontFamily: F, fontWeight: 600 }} />
            </div>
            <div style={{ padding: '8px 14px 4px', fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 1 }}>
              Select Members ({selectedMembers.length} selected)
            </div>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {users.map(u => {
                const uid    = String(u.id || u.userId);
                const name   = u.name || u.username || uid;
                const sel    = selectedMembers.includes(uid);
                return (
                  <div key={uid} onClick={() => setSelectedMembers(prev => sel ? prev.filter(x => x !== uid) : [...prev, uid])}
                    style={{ padding: '9px 14px', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', background: sel ? '#f5f3ff' : 'transparent', borderBottom: '1px solid #f8f8f8' }}>
                    <UserAv user={u} size={34} />
                    <div style={{ flex: 1, fontWeight: 500, fontSize: 13, color: '#111' }}>{name}</div>
                    <div style={{
                      width: 20, height: 20, borderRadius: '50%', border: `2px solid ${sel ? '#7c3aed' : '#d1d5db'}`,
                      background: sel ? '#7c3aed' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    }}>
                      {sel && <span style={{ color: '#fff', fontSize: 11, fontWeight: 700 }}>✓</span>}
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{ padding: 12, borderTop: '1px solid #f0f0f0' }}>
              <button onClick={createGroup} disabled={!newGroupName.trim() || selectedMembers.length === 0}
                style={{ width: '100%', background: newGroupName.trim() && selectedMembers.length > 0 ? '#7c3aed' : '#d1d5db', color: '#fff', border: 'none', borderRadius: 8, padding: '10px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                Create Group
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── File Viewer Modal ── */}
      {viewFile && (
        <div onClick={e => e.target === e.currentTarget && setViewFile(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 1400, background: 'rgba(0,0,0,0.72)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#1e293b', borderRadius: 12, overflow: 'hidden', width: '90vw', maxWidth: 900, height: '88vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 80px rgba(0,0,0,0.6)' }}>
            <div style={{ background: P, padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
              <span style={{ fontSize: 18 }}>{fileIcon(viewFile.mime)}</span>
              <span style={{ color: '#fff', fontWeight: 600, fontSize: 13, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{viewFile.name}</span>
              <a href={`${viewFile.url}?download=1&name=${encodeURIComponent(viewFile.name)}`}
                style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', border: 'none', borderRadius: 6, padding: '5px 12px', cursor: 'pointer', fontSize: 12, fontWeight: 700, textDecoration: 'none', marginRight: 4 }}>↓ Download</a>
              <button onClick={() => setViewFile(null)}
                style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 6, color: '#fff', width: 30, height: 30, cursor: 'pointer', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
            </div>
            <div style={{ flex: 1, minHeight: 0, position: 'relative', background: '#f8f8f8' }}>
              {viewFile.mime?.includes('pdf') ? (
                <iframe src={viewFile.url} title={viewFile.name}
                  style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none', display: 'block' }} />
              ) : viewFile.mime?.includes('image') ? (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#111' }}>
                  <img src={viewFile.url} alt={viewFile.name} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                </div>
              ) : viewFile.mime?.includes('audio') ? (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}>
                  <div style={{ fontSize: 56 }}>🎙️</div>
                  <audio controls src={viewFile.url} style={{ width: 320 }} />
                  <div style={{ fontSize: 13, color: '#555' }}>{viewFile.name}</div>
                </div>
              ) : (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 40, textAlign: 'center', color: '#555', fontFamily: F }}>
                  <div style={{ fontSize: 56, marginBottom: 16 }}>{fileIcon(viewFile.mime)}</div>
                  <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>{viewFile.name}</div>
                  <a href={`${viewFile.url}?download=1&name=${encodeURIComponent(viewFile.name)}`}
                    style={{ background: P, color: '#fff', padding: '10px 24px', borderRadius: 8, textDecoration: 'none', fontWeight: 700, fontSize: 13 }}>↓ Download File</a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Incoming Call Banner ── */}
      {incomingCall && (
        <IncomingCallBanner
          call={incomingCall} users={users} myId={myId}
          onAccept={acceptCall} onReject={rejectCall}
        />
      )}

      {/* ── Active / Outgoing Call Window ── */}
      {(callState === 'outgoing' || callState === 'active') && (
        <CallWindow
          callState={callState} callType={callType} callDuration={callDuration}
          callPeer={users.find(u => String(u.id || u.userId) === callPeerId)}
          callPeerId={callPeerId}
          micMuted={micMuted} camOff={camOff}
          localVideoRef={localVideoRef} remoteVideoRef={remoteVideoRef}
          onToggleMic={toggleMic} onToggleCam={toggleCam} onHangUp={hangUp}
          panelWidth={panelWidth}
        />
      )}

      <style>{`
        .chat-bounce { animation: chatBounce 1.2s infinite; }
        @keyframes chatBounce { 0%,60%,100% { transform:translateY(0); } 30% { transform:translateY(-5px); } }
        .chat-row:hover { background: #f0fafa !important; }
        .chat-msg-wrap:hover .chat-reply-btn { opacity: 1 !important; }
        @keyframes chatSpin { to { transform: rotate(360deg); } }
        @keyframes recPulse { 0%,100% { opacity:1; } 50% { opacity:0.4; } }
      `}</style>

      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 1200,
        width: panelWidth, display: 'flex',
        boxShadow: '-6px 0 32px rgba(0,0,0,0.18)',
        fontFamily: F, transition: 'width 0.2s ease',
        borderLeft: '1px solid rgba(0,0,0,0.08)',
      }}>

        {/* ── USER LIST ── */}
        <div style={{ width: 280, flexShrink: 0, background: '#fff', display: 'flex', flexDirection: 'column', height: '100%', borderRight: isInConv ? '1px solid #e5e7eb' : 'none' }}>
          {/* Header */}
          <div style={{ background: P, padding: '14px 12px 10px', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <div style={{ flex: 1 }}>
              <div style={{ color: '#fff', fontWeight: 800, fontSize: 15 }}>Team Chat</div>
              <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 10.5 }}>{onlineIds.length} online</div>
            </div>
            <button onClick={() => setCreateGroupOpen(true)} title="New Group"
              style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 6, color: '#fff', width: 28, height: 28, cursor: 'pointer', fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.25)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.15)'; }}>👥</button>
            <button onClick={closePanel} title="Close"
              style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 6, color: '#fff', width: 28, height: 28, cursor: 'pointer', fontSize: 17, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
          </div>

          {/* Search */}
          <div style={{ padding: '8px 10px', borderBottom: '1px solid #f0f0f0', flexShrink: 0 }}>
            <input value={searchQ} onChange={e => setSearchQ(e.target.value)} placeholder="Search…"
              style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #e5e7eb', borderRadius: 8, padding: '6px 10px', fontSize: 12, outline: 'none', background: '#f8f9fa', fontFamily: F }} />
          </div>

          {/* List */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {/* Groups */}
            {grpList.filter(g => !searchQ || g.name.toLowerCase().includes(searchQ.toLowerCase())).map(grp => {
              const cnt    = unread[unreadKey(grp.id)] || 0;
              const active = activeGroup === grp.id;
              return (
                <div key={grp.id} className="chat-row" onClick={() => openGroupConv(grp.id)}
                  style={{ padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', borderBottom: '1px solid #f0f0f0', background: active ? '#f5f3ff' : 'transparent', borderLeft: active ? '3px solid #7c3aed' : '3px solid transparent', transition: 'background 0.1s' }}>
                  <GroupAv group={grp} size={38} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: active || cnt > 0 ? 700 : 500, fontSize: 12.5, color: '#111', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{grp.name}</div>
                    <div style={{ fontSize: 10.5, color: '#9ca3af' }}>{grp.members.length} members</div>
                  </div>
                  {cnt > 0 && <div style={{ background: '#7c3aed', color: '#fff', borderRadius: 10, padding: '2px 7px', fontSize: 10, fontWeight: 800 }}>{cnt}</div>}
                </div>
              );
            })}

            {/* Users */}
            {users.filter(u => !searchQ || (u.name || u.username || '').toLowerCase().includes(searchQ.toLowerCase())).map(u => {
              const uid    = String(u.id || u.userId);
              const name   = u.name || u.username || uid;
              const online = onlineIds.includes(uid);
              const cnt    = unread[uid] || 0;
              const active = uid === activePeer && !activeGroup;
              const isTyp  = typingFrom[uid];
              return (
                <div key={uid} className="chat-row" onClick={() => openUserConv(uid)}
                  style={{ padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', borderBottom: '1px solid #f0f0f0', background: active ? '#e6f2f2' : 'transparent', borderLeft: active ? `3px solid ${P}` : '3px solid transparent', transition: 'background 0.1s' }}>
                  <div style={{ position: 'relative', flexShrink: 0 }}>
                    <UserAv user={u} size={38} />
                    <div style={{ position: 'absolute', bottom: 1, right: 1, width: 10, height: 10, borderRadius: '50%', background: online ? '#22c55e' : '#9ca3af', border: '2px solid #fff' }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: active || cnt > 0 ? 700 : 500, fontSize: 12.5, color: '#111', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</div>
                    <div style={{ fontSize: 10.5, color: online ? '#16a34a' : '#9ca3af', fontStyle: isTyp ? 'italic' : 'normal' }}>{isTyp ? 'typing…' : online ? 'Online' : 'Offline'}</div>
                  </div>
                  {cnt > 0 && <div style={{ background: '#ef4444', color: '#fff', borderRadius: 10, padding: '2px 7px', fontSize: 10, fontWeight: 800 }}>{cnt > 99 ? '99+' : cnt}</div>}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── CONVERSATION PANEL ── */}
        {isInConv && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#f0f2f5', minWidth: 0 }}>

            {/* Header */}
            <div style={{ background: P, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
              <button onClick={() => { setActiveGroup(null); selectPeer(null); }} title="Back"
                style={{ background: 'rgba(255,255,255,0.12)', border: 'none', borderRadius: 6, color: '#fff', width: 28, height: 28, cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>‹</button>

              <div style={{ position: 'relative', flexShrink: 0 }}>
                {activeGroup
                  ? <GroupAv group={activeGrp} size={38} />
                  : <UserAv user={peer || { name: peerName }} size={38} border="2px solid rgba(255,255,255,0.3)" />}
                {!activeGroup && (
                  <div style={{ position: 'absolute', bottom: 1, right: 1, width: 11, height: 11, borderRadius: '50%', background: peerOnline ? '#22c55e' : '#9ca3af', border: `2px solid ${P}` }} />
                )}
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>{activeGroup ? activeGrp?.name : peerName}</div>
                <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: 10.5 }}>
                  {activeGroup
                    ? `${activeGrp?.members?.length || 0} members`
                    : peerTyping ? 'typing…' : peerOnline ? 'Online' : 'Offline'}
                </div>
              </div>

              {/* Call buttons — only in 1-1 chat */}
              {!activeGroup && (
                <>
                  <button onClick={() => startCall('voice')} title="Voice Call"
                    style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 6, color: '#fff', width: 32, height: 32, cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.28)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.15)'; }}>📞</button>
                  <button onClick={() => startCall('video')} title="Video Call"
                    style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 6, color: '#fff', width: 32, height: 32, cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.28)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.15)'; }}>📹</button>
                </>
              )}
            </div>

            {/* Messages */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 3 }}>
              {isLoading && <div style={{ textAlign: 'center', color: '#9ca3af', fontSize: 12, padding: 20 }}>Loading…</div>}
              {!isLoading && grouped.length === 0 && (
                <div style={{ textAlign: 'center', color: '#9ca3af', fontSize: 12, padding: 32 }}>No messages yet. Say hello 👋</div>
              )}

              {grouped.map((g, i) => {
                if (g.isDay) return (
                  <div key={`d${i}`} style={{ textAlign: 'center', margin: '10px 0 6px' }}>
                    <span style={{ background: '#dce8e8', color: '#3d7070', fontSize: 10.5, padding: '3px 12px', borderRadius: 12, fontWeight: 600 }}>{g.label}</span>
                  </div>
                );

                const m      = g.msg;
                const isMine = String(m.fromUserId) === myId;
                const sender = users.find(u => String(u.id || u.userId) === String(m.fromUserId));
                const senderName = sender ? (sender.name || sender.username) : String(m.fromUserId);

                return (
                  <div key={m.id || i} className="chat-msg-wrap"
                    style={{ display: 'flex', justifyContent: isMine ? 'flex-end' : 'flex-start', marginBottom: 2, alignItems: 'flex-end', gap: 6, position: 'relative' }}>

                    {/* Reply button (appears on hover) */}
                    <button className="chat-reply-btn" onClick={() => setReplyTo({ id: m.id, text: m.text || (m.file ? `📎 ${m.file.name}` : m.order ? `📋 ${m.order.number}` : ''), fromName: isMine ? 'You' : senderName })}
                      style={{ opacity: 0, transition: 'opacity 0.15s', background: 'rgba(0,0,0,0.08)', border: 'none', borderRadius: '50%', width: 26, height: 26, cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', order: isMine ? 0 : 1, flexShrink: 0 }}
                      title="Reply">↩</button>

                    <div style={{
                      maxWidth: '72%', padding: m.file ? '8px 10px' : '8px 12px',
                      borderRadius: isMine ? '14px 14px 3px 14px' : '14px 14px 14px 3px',
                      background: isMine ? P : '#fff',
                      color: isMine ? '#fff' : '#111',
                      boxShadow: '0 1px 4px rgba(0,0,0,0.1)',
                      fontSize: 13, lineHeight: 1.5, wordBreak: 'break-word',
                    }}>
                      {/* Group: sender name */}
                      {activeGroup && !isMine && (
                        <div style={{ fontSize: 10.5, fontWeight: 700, color: '#7c3aed', marginBottom: 4 }}>{senderName}</div>
                      )}

                      {/* Quoted reply */}
                      {m.replyTo && (
                        <div style={{ background: isMine ? 'rgba(255,255,255,0.12)' : 'rgba(16,79,79,0.07)', borderLeft: `3px solid ${isMine ? 'rgba(255,255,255,0.5)' : P}`, borderRadius: '3px 6px 6px 3px', padding: '4px 8px', marginBottom: 6, fontSize: 11 }}>
                          <div style={{ fontWeight: 700, opacity: 0.85, marginBottom: 1, color: isMine ? '#a5f3fc' : '#0f766e' }}>{m.replyTo.fromName}</div>
                          <div style={{ opacity: 0.7, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.replyTo.text}</div>
                        </div>
                      )}

                      {/* Order card */}
                      {m.order && (
                        <div style={{ background: isMine ? 'rgba(255,255,255,0.13)' : '#f0fafa', borderRadius: 8, padding: '7px 10px', marginBottom: m.text ? 6 : 0, border: isMine ? '1px solid rgba(255,255,255,0.2)' : `1px solid ${P}30` }}>
                          <div style={{ fontSize: 10, fontWeight: 700, color: isMine ? 'rgba(255,255,255,0.6)' : '#9ca3af', marginBottom: 3, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                            {m.order.type === 'SO' ? '📦 Sales Order' : '🛒 Purchase Order'}
                          </div>
                          <div style={{ fontWeight: 700, fontSize: 13, color: isMine ? '#fff' : P }}>{m.order.number}</div>
                          <div style={{ fontSize: 11.5, color: isMine ? 'rgba(255,255,255,0.75)' : '#374151', marginTop: 1 }}>{m.order.party}</div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                            <span style={{ fontWeight: 700, fontSize: 12, color: isMine ? '#6ee7b7' : '#16a34a' }}>₹{Number(m.order.amount).toLocaleString('en-IN')}</span>
                            <span style={{ fontSize: 10, fontWeight: 600, color: orderStatusColor(m.order.status), textTransform: 'capitalize' }}>{m.order.status}</span>
                          </div>
                        </div>
                      )}

                      {/* File */}
                      {m.file ? (() => {
                        const isAudio  = m.file.mime?.includes('audio');
                        const fileUrl  = `/api/chat/file/${cid}/${m.file.storedAs}`;
                        const dlUrl    = `${fileUrl}?download=1&name=${encodeURIComponent(m.file.name)}`;
                        const canView  = m.file.mime?.includes('pdf') || m.file.mime?.includes('image') || isAudio;
                        const btnBase  = { border: 'none', borderRadius: 5, cursor: 'pointer', fontSize: 11, fontWeight: 700, padding: '4px 10px' };
                        if (isAudio) return (
                          <div style={{ minWidth: 200 }}>
                            <div style={{ fontSize: 10.5, color: isMine ? 'rgba(255,255,255,0.6)' : '#9ca3af', marginBottom: 4 }}>🎙️ Voice Message · {fmtSize(m.file.size)}</div>
                            <audio controls src={fileUrl} style={{ width: '100%', height: 32 }} />
                          </div>
                        );
                        return (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                            <span style={{ fontSize: 26, lineHeight: 1, flexShrink: 0 }}>{fileIcon(m.file.mime)}</span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontWeight: 600, fontSize: 12.5, color: isMine ? '#fff' : '#111', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 180 }}>{m.file.name}</div>
                              <div style={{ fontSize: 10, color: isMine ? 'rgba(255,255,255,0.6)' : '#9ca3af', marginBottom: 6 }}>{fmtSize(m.file.size)}</div>
                              <div style={{ display: 'flex', gap: 6 }}>
                                {canView && <button onClick={() => setViewFile({ url: fileUrl, name: m.file.name, mime: m.file.mime })} style={{ ...btnBase, background: isMine ? 'rgba(255,255,255,0.22)' : '#e0f2f1', color: isMine ? '#fff' : P }}>👁 View</button>}
                                <a href={dlUrl} style={{ ...btnBase, background: isMine ? 'rgba(255,255,255,0.15)' : '#f3f4f6', color: isMine ? '#fff' : '#374151', textDecoration: 'none', display: 'inline-block' }}>↓ Download</a>
                              </div>
                            </div>
                          </div>
                        );
                      })() : m.text ? <span style={{ whiteSpace: 'pre-wrap' }}>{m.text}</span> : null}

                      {/* Time + status */}
                      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 5, marginTop: 4 }}>
                        <span style={{ fontSize: 9.5, color: isMine ? 'rgba(255,255,255,0.6)' : '#aaa' }}>{fmtTime(m.timestamp)}</span>
                        {isMine && !activeGroup && (() => {
                          const st = msgStatus(m, statusMap);
                          const s  = STATUS_STYLE[st];
                          return (
                            <span style={{ fontSize: 9, fontWeight: 700, color: s.color, border: `1px solid ${s.color}`, borderRadius: 4, padding: '1px 5px', letterSpacing: '0.3px', lineHeight: 1.4 }}>
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
              {!activeGroup && peerTyping && (
                <div style={{ display: 'flex', justifyContent: 'flex-start', marginTop: 4 }}>
                  <div style={{ background: '#fff', padding: '10px 14px', borderRadius: '14px 14px 14px 3px', boxShadow: '0 1px 4px rgba(0,0,0,0.1)', display: 'flex', gap: 5, alignItems: 'center' }}>
                    {[0, 1, 2].map(i => <div key={i} className="chat-bounce" style={{ width: 7, height: 7, borderRadius: '50%', background: '#aaa', animationDelay: `${i * 0.18}s` }} />)}
                  </div>
                </div>
              )}

              <div ref={endRef} />
            </div>

            {/* ── Input bar ── */}
            <div style={{ background: '#f0f2f5', padding: replyTo || pendingOrder ? '6px 14px 10px' : '10px 14px', borderTop: '1px solid #e5e7eb', flexShrink: 0 }}>

              {/* Reply preview */}
              {replyTo && (
                <div style={{ background: '#e0f2f1', borderLeft: `3px solid ${P}`, borderRadius: 6, padding: '5px 10px', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: P, marginBottom: 1 }}>Replying to {replyTo.fromName}</div>
                    <div style={{ fontSize: 11, color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{replyTo.text}</div>
                  </div>
                  <button onClick={() => setReplyTo(null)} style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: 15, lineHeight: 1 }}>×</button>
                </div>
              )}

              {/* Pending order preview */}
              {pendingOrder && (
                <div style={{ background: '#f0fafa', border: `1px solid ${P}30`, borderRadius: 6, padding: '5px 10px', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 16 }}>{pendingOrder.type === 'SO' ? '📦' : '🛒'}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af' }}>{pendingOrder.label}</div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: P }}>{pendingOrder.number} · {pendingOrder.party}</div>
                  </div>
                  <button onClick={() => setPendingOrder(null)} style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: 15 }}>×</button>
                </div>
              )}

              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input ref={fileRef} type="file" style={{ display: 'none' }} onChange={e => { uploadFileObj(e.target.files?.[0]); }}
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.zip,.rar,.png,.jpg,.jpeg,.pptx,.webm,.ogg,.mp3" />

                {/* Attach "+" menu */}
                <div style={{ position: 'relative' }}>
                  <button onClick={() => setAttachMenu(v => !v)} title="Attach"
                    style={{ width: 36, height: 36, borderRadius: '50%', background: attachMenu ? P : '#e5e7eb', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 19, flexShrink: 0, transition: 'background 0.15s', color: attachMenu ? '#fff' : '#374151' }}>+</button>
                  {attachMenu && (
                    <div style={{ position: 'absolute', bottom: 44, left: 0, background: '#fff', borderRadius: 10, boxShadow: '0 8px 28px rgba(0,0,0,0.18)', overflow: 'hidden', minWidth: 160, zIndex: 10 }}>
                      {[
                        { icon: '📎', label: 'File', action: () => { fileRef.current?.click(); setAttachMenu(false); } },
                        { icon: '📦', label: 'Sales Order', action: () => openOrderPicker('SO') },
                        { icon: '🛒', label: 'Purchase Order', action: () => openOrderPicker('PO') },
                      ].map(item => (
                        <button key={item.label} onClick={item.action}
                          style={{ width: '100%', border: 'none', background: 'none', padding: '10px 14px', textAlign: 'left', cursor: 'pointer', fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 10, fontFamily: F, fontWeight: 500 }}
                          onMouseEnter={e => { e.currentTarget.style.background = '#f0fafa'; }}
                          onMouseLeave={e => { e.currentTarget.style.background = 'none'; }}>
                          <span style={{ fontSize: 18 }}>{item.icon}</span>{item.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <input ref={inputRef} value={input} onChange={handleTyping}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                  onFocus={() => setAttachMenu(false)}
                  placeholder={isRecording ? `Recording… ${fmtDuration(recordingTime)}` : 'Type a message…'}
                  disabled={isRecording}
                  style={{ flex: 1, border: '1px solid #e5e7eb', borderRadius: 22, padding: '9px 16px', fontSize: 13, outline: 'none', background: isRecording ? '#fef2f2' : '#fff', fontFamily: F, lineHeight: 1.4 }} />

                {/* Voice recorder button */}
                <button onClick={isRecording ? stopRecording : startRecording} title={isRecording ? 'Send Voice' : 'Voice Message'}
                  style={{ width: 36, height: 36, borderRadius: '50%', flexShrink: 0, background: isRecording ? '#ef4444' : '#e5e7eb', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, transition: 'background 0.15s', animation: isRecording ? 'recPulse 1s ease-in-out infinite' : 'none' }}>
                  {isRecording ? '⏹' : '🎙'}
                </button>

                {/* Send button */}
                {!isRecording && (
                  <button onClick={handleSend} disabled={!input.trim() && !pendingOrder} title="Send (Enter)"
                    style={{ width: 36, height: 36, borderRadius: '50%', flexShrink: 0, background: (input.trim() || pendingOrder) ? P : '#d1d5db', border: 'none', cursor: (input.trim() || pendingOrder) ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.15s' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

/* ── Incoming call notification — portalled to document.body to bypass any stacking context ── */
function IncomingCallBanner({ call, users, myId, onAccept, onReject }) {
  const caller  = (users || []).find(u => String(u.id || u.userId) === String(call?.fromUserId));
  const name    = caller ? (caller.name || caller.username) : `User ${call?.fromUserId || '?'}`;
  const isVideo = call?.callType === 'video';

  return createPortal(
    <div style={{
      position: 'fixed', inset: 0, zIndex: 999999,
      background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(6px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'Inter, system-ui, sans-serif',
    }}>
      <style>{`
        @keyframes callRing  { 0%,100%{transform:scale(1)} 50%{transform:scale(1.08)} }
        @keyframes callPulse { 0%,100%{box-shadow:0 0 0 0 rgba(34,197,94,0.5)} 70%{box-shadow:0 0 0 20px rgba(34,197,94,0)} }
      `}</style>
      <div style={{
        background: 'linear-gradient(135deg, #0f172a, #1e293b)',
        borderRadius: 24, padding: '40px 48px', textAlign: 'center',
        boxShadow: '0 32px 80px rgba(0,0,0,0.8)', minWidth: 300,
        animation: 'callRing 1s ease-in-out infinite',
      }}>
        <div style={{ fontSize: 42, marginBottom: 12 }}>{isVideo ? '📹' : '📞'}</div>
        <div style={{ position: 'relative', display: 'inline-block', marginBottom: 16 }}>
          <UserAv user={caller || { name }} size={80} />
          <div style={{
            position: 'absolute', inset: -6, borderRadius: '50%',
            border: '3px solid #22c55e', animation: 'callPulse 1.5s infinite',
          }} />
        </div>
        <div style={{ color: '#fff', fontWeight: 800, fontSize: 20, marginBottom: 6 }}>{name}</div>
        <div style={{ color: '#94a3b8', fontSize: 13, marginBottom: 32 }}>
          Incoming {isVideo ? 'Video' : 'Voice'} Call…
        </div>
        <div style={{ display: 'flex', gap: 24, justifyContent: 'center' }}>
          <div style={{ textAlign: 'center' }}>
            <button onClick={onReject}
              style={{ width: 60, height: 60, borderRadius: '50%', background: '#ef4444', border: 'none', cursor: 'pointer', fontSize: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto', boxShadow: '0 4px 16px rgba(239,68,68,0.5)', transition: 'transform 0.15s' }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.1)'; }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; }}>
              📵
            </button>
            <div style={{ color: '#94a3b8', fontSize: 12, marginTop: 8 }}>Decline</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <button onClick={onAccept}
              style={{ width: 60, height: 60, borderRadius: '50%', background: '#22c55e', border: 'none', cursor: 'pointer', fontSize: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto', boxShadow: '0 4px 16px rgba(34,197,94,0.5)', animation: 'callPulse 1.5s infinite', transition: 'transform 0.15s' }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.1)'; }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; }}>
              {isVideo ? '📹' : '📞'}
            </button>
            <div style={{ color: '#94a3b8', fontSize: 12, marginTop: 8 }}>Accept</div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

/* ── Active/Outgoing call window ── */
function CallWindow({ callState, callType, callDuration, callPeer, callPeerId, micMuted, camOff, localVideoRef, remoteVideoRef, onToggleMic, onToggleCam, onHangUp, panelWidth }) {
  const name = callPeer ? (callPeer.name || callPeer.username) : `User ${callPeerId}`;
  const rightOffset = panelWidth + 12;
  const F2 = 'Inter, system-ui, sans-serif';
  if (callType === 'video') return (
    <div style={{ position: 'fixed', bottom: 12, right: rightOffset, zIndex: 1500, background: '#0f172a', borderRadius: 16, overflow: 'hidden', boxShadow: '0 12px 48px rgba(0,0,0,0.7)', fontFamily: F2, width: 340 }}>
      <video ref={remoteVideoRef} autoPlay playsInline style={{ width: '100%', height: 220, objectFit: 'cover', background: '#1e293b', display: 'block' }} />
      <video ref={localVideoRef} autoPlay playsInline muted style={{ position: 'absolute', top: 10, right: 10, width: 90, height: 68, objectFit: 'cover', borderRadius: 8, border: '2px solid #1e293b', background: '#374151' }} />
      <div style={{ padding: '10px 14px', background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ flex: 1 }}>
          <div style={{ color: '#fff', fontWeight: 700, fontSize: 13 }}>{name}</div>
          <div style={{ color: '#9ca3af', fontSize: 11 }}>{callState === 'outgoing' ? 'Calling…' : fmtDuration(callDuration)}</div>
        </div>
        <CallBtn icon={micMuted ? '🔇' : '🎙'} bg={micMuted ? '#4b5563' : '#374151'} onClick={onToggleMic} />
        <CallBtn icon={camOff ? '🚫' : '📹'} bg={camOff ? '#4b5563' : '#374151'} onClick={onToggleCam} />
        <CallBtn icon="📵" bg="#ef4444" onClick={onHangUp} />
      </div>
    </div>
  );
  return (
    <div style={{ position: 'fixed', bottom: 12, right: rightOffset, zIndex: 1500, background: '#1e293b', borderRadius: 16, padding: '18px 20px', boxShadow: '0 12px 48px rgba(0,0,0,0.55)', fontFamily: F2, width: 240, textAlign: 'center' }}>
      <UserAv user={callPeer || { name }} size={56} />
      <div style={{ color: '#fff', fontWeight: 700, fontSize: 15, marginTop: 10 }}>{name}</div>
      <div style={{ color: '#9ca3af', fontSize: 12, marginBottom: 16 }}>{callState === 'outgoing' ? 'Calling…' : `🎙 ${fmtDuration(callDuration)}`}</div>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 14 }}>
        <CallBtn icon={micMuted ? '🔇' : '🎙'} bg={micMuted ? '#4b5563' : '#374151'} onClick={onToggleMic} />
        <CallBtn icon="📵" bg="#ef4444" onClick={onHangUp} />
      </div>
    </div>
  );
}

function CallBtn({ icon, bg, onClick }) {
  return (
    <button onClick={onClick} style={{ width: 40, height: 40, borderRadius: '50%', background: bg, border: 'none', cursor: 'pointer', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'opacity 0.15s' }}
      onMouseEnter={e => { e.currentTarget.style.opacity = '0.8'; }}
      onMouseLeave={e => { e.currentTarget.style.opacity = '1'; }}>
      {icon}
    </button>
  );
}
