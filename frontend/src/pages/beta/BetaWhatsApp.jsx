/* Beta — WhatsApp: the signed-in user's OWN WhatsApp inside the ERP. Scan the QR once; the login stays on the server
 * (also after a restart), so the same WhatsApp opens in any browser where this user signs in to the ERP.
 * Nobody else sees it — every request works on this user's own session. Server: /api/whatsapp.
 * New messages: the page checks every few seconds (signed-in API, not the open socket). */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import QRCode from 'qrcode';
import { useCompany } from '../../context/CompanyContext';
import { useAuth } from '../../context/AuthContext';

const F = "'Inter', system-ui, sans-serif";
const WA_CSS = `
.wa { display:flex; flex-direction:column; height:100%; min-height:0; font-family:${F}; background:#EFEAE2; }
.wa-top { display:flex; align-items:center; gap:10px; height:44px; padding:0 12px; background:#075E54; color:#fff; flex-shrink:0; }
.wa-top b { font-size:14px; } .wa-top small { color:#CDEBE6; font-size:12px; } .wa-top .sp { flex:1; }
.wa-top button { height:28px; padding:0 12px; border:1px solid rgba(255,255,255,.45); border-radius:5px; background:transparent; color:#fff; cursor:pointer; font:600 12px ${F}; }
.wa-top button:hover { background:rgba(255,255,255,.12); }
.wa-main { flex:1; min-height:0; display:flex; }
.wa-side { width:340px; max-width:42%; display:flex; flex-direction:column; background:#fff; border-right:1px solid #D1D7DB; min-height:0; }
.wa-sh { display:flex; gap:6px; padding:8px; border-bottom:1px solid #E9EDEF; background:#F0F2F5; }
.wa-sh input { flex:1; min-width:0; height:32px; border:0; border-radius:8px; padding:0 12px; background:#fff; font:400 13px ${F}; outline:none; }
.wa-sh button { height:32px; padding:0 10px; border:0; border-radius:8px; background:#00A884; color:#fff; cursor:pointer; font:600 12px ${F}; white-space:nowrap; }
.wa-list { flex:1; overflow-y:auto; }
.wa-it { display:flex; gap:10px; align-items:center; width:100%; padding:9px 12px; border:0; border-bottom:1px solid #F0F2F5; background:#fff; cursor:pointer; text-align:left; font-family:${F}; }
.wa-it:hover { background:#F5F6F6; } .wa-it.on { background:#F0F2F5; }
.wa-av { flex:none; width:40px; height:40px; border-radius:50%; display:grid; place-items:center; color:#fff; font:700 15px ${F}; }
.wa-it .tx { flex:1; min-width:0; } .wa-it .r1 { display:flex; justify-content:space-between; gap:6px; }
.wa-it .nm { font-size:14px; color:#111B21; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; } .wa-it .tm { font-size:11px; color:#667781; white-space:nowrap; }
.wa-it .r2 { display:flex; justify-content:space-between; gap:6px; margin-top:2px; }
.wa-it .ls { font-size:12.5px; color:#667781; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.wa-it .ur { min-width:19px; height:19px; padding:0 5px; border-radius:10px; background:#25D366; color:#fff; font:700 11px/19px ${F}; text-align:center; }
.wa-it.unr .tm { color:#1FA855; font-weight:600; }
.wa-chat { flex:1; min-width:0; display:flex; flex-direction:column; min-height:0;
  background-color:#EFEAE2; background-image:radial-gradient(rgba(0,0,0,.035) 1px, transparent 1px); background-size:16px 16px; }
.wa-ch { display:flex; align-items:center; gap:10px; height:52px; padding:0 14px; background:#F0F2F5; border-bottom:1px solid #D1D7DB; flex-shrink:0; }
.wa-ch b { font-size:14.5px; color:#111B21; } .wa-ch small { display:block; font-size:12px; color:#667781; }
.wa-msgs { flex:1; overflow-y:auto; padding:14px 6% 10px; display:flex; flex-direction:column; gap:3px; }
.wa-day { align-self:center; margin:8px 0; padding:4px 12px; border-radius:7px; background:#fff; color:#54656F; font-size:12px; box-shadow:0 1px .5px rgba(11,20,26,.13); }
.wa-b { max-width:68%; padding:6px 8px 4px; border-radius:8px; font-size:14px; line-height:1.4; color:#111B21; box-shadow:0 1px .5px rgba(11,20,26,.13); white-space:pre-wrap; overflow-wrap:anywhere; position:relative; }
.wa-b.in { align-self:flex-start; background:#fff; border-top-left-radius:0; } .wa-b.out { align-self:flex-end; background:#D9FDD3; border-top-right-radius:0; }
.wa-b .by { display:block; font-size:12px; font-weight:600; color:#06CF9C; margin-bottom:1px; }
.wa-b .mt { float:right; margin:6px 0 -3px 10px; font-size:10.5px; color:#667781; white-space:nowrap; }
.wa-b .tk { margin-left:3px; } .wa-b .tk.rd { color:#53BDEB; }
.wa-b img.pic { display:block; max-width:300px; max-height:320px; border-radius:6px; margin-bottom:3px; cursor:zoom-in; background:#eee; }
.wa-b .doc { display:flex; align-items:center; gap:8px; padding:8px; margin-bottom:3px; border-radius:6px; background:rgba(0,0,0,.05); color:#111B21; text-decoration:none; }
.wa-b .doc i { font-style:normal; font-size:22px; }
.wa-comp { display:flex; align-items:flex-end; gap:8px; padding:8px 12px; background:#F0F2F5; flex-shrink:0; }
.wa-comp textarea { flex:1; min-height:40px; max-height:140px; resize:none; border:0; border-radius:8px; padding:10px 12px; font:400 14px ${F}; outline:none; background:#fff; }
.wa-comp button { flex:none; width:42px; height:42px; border:0; border-radius:50%; cursor:pointer; font-size:18px; display:grid; place-items:center; }
.wa-comp .at { background:transparent; color:#54656F; } .wa-comp .at:hover { background:#E1E5E8; }
.wa-comp .go { background:#00A884; color:#fff; } .wa-comp .go:disabled { background:#B6C2C8; cursor:default; }
.wa-empty { flex:1; display:grid; place-items:center; text-align:center; color:#667781; font-size:14px; padding:20px; }
.wa-err { padding:8px 14px; background:#FEF3F2; color:#B42318; font-size:12.5px; border-bottom:1px solid #FECDCA; display:flex; gap:10px; align-items:center; }
.wa-err button { margin-left:auto; border:0; background:none; cursor:pointer; color:#B42318; font-size:16px; }
.wa-link { flex:1; display:grid; place-items:center; padding:20px; background:#F0F2F5; overflow:auto; }
.wa-card { width:min(820px,100%); background:#fff; border-radius:6px; box-shadow:0 2px 14px rgba(11,20,26,.12); display:flex; gap:34px; padding:34px 38px; flex-wrap:wrap; }
.wa-card .tx { flex:1; min-width:260px; } .wa-card h2 { margin:0 0 18px; font-weight:300; font-size:26px; color:#41525D; }
.wa-card ol { margin:0; padding-left:20px; color:#3B4A54; font-size:15px; line-height:2.1; }
.wa-card .note { margin-top:18px; font-size:13px; color:#667781; line-height:1.5; }
.wa-qr { width:264px; min-height:264px; display:grid; place-items:center; border:1px solid #E9EDEF; border-radius:6px; position:relative; }
.wa-qr canvas { width:244px !important; height:244px !important; }
.wa-qr .ov { position:absolute; inset:0; display:grid; place-items:center; background:rgba(255,255,255,.92); text-align:center; font-size:13px; color:#41525D; padding:10px; }
.wa-big { height:40px; padding:0 22px; border:0; border-radius:20px; background:#00A884; color:#fff; cursor:pointer; font:600 14px ${F}; }
.wa-big:disabled { opacity:.6; cursor:default; }
.wa-zoom { position:fixed; inset:0; z-index:1900; background:rgba(11,20,26,.85); display:grid; place-items:center; cursor:zoom-out; }
.wa-zoom img { max-width:92vw; max-height:92vh; }
@media (max-width:760px) { .wa-side { width:100%; max-width:none; } .wa-main.open .wa-side { display:none; } .wa-main:not(.open) .wa-chat { display:none; } }
`;
const COLORS = ['#25D366', '#34B7F1', '#FF8A65', '#A78BFA', '#F59E0B', '#EC4899', '#10B981', '#6366F1', '#EF4444'];
const avColor = s => COLORS[[...String(s)].reduce((a, ch) => a + ch.charCodeAt(0), 0) % COLORS.length];
const initials = n => String(n || '?').replace(/^\+/, '').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '#';
const tm = t => { const d = new Date(t * 1000); const now = new Date(); if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); const y = new Date(now); y.setDate(now.getDate() - 1); if (d.toDateString() === y.toDateString()) return 'Yesterday'; return d.toLocaleDateString('en-GB'); };
const dayOf = t => { const d = new Date(t * 1000); const now = new Date(); if (d.toDateString() === now.toDateString()) return 'Today'; const y = new Date(now); y.setDate(now.getDate() - 1); if (d.toDateString() === y.toDateString()) return 'Yesterday'; return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }); };
const errOf = (e, d) => e?.response?.data?.error || (e?.response?.status === 404 ? `${d} — the server does not have WhatsApp yet (update / restart the ERP).` : d);

export default function BetaWhatsApp() {
  const { selectedCompany } = useCompany() || {};
  const { user } = useAuth() || {};
  const companyId = selectedCompany?.companyId;
  const [st, setSt] = useState(null);           // { status, qr, me, ver }
  const [chats, setChats] = useState([]);
  const [open, setOpen] = useState(null);       // jid
  const [conv, setConv] = useState(null);       // { name, group, messages }
  const [q, setQ] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [zoom, setZoom] = useState('');
  const verRef = useRef(-1);
  const openRef = useRef(null);
  const qrRef = useRef(null);
  const endRef = useRef(null);
  const fileRef = useRef(null);
  openRef.current = open;
  const P = { params: { companyId } };

  const loadChats = () => axios.get('/api/whatsapp/chats', P).then(r => setChats(Array.isArray(r.data) ? r.data : [])).catch(() => {});
  const loadConv = jid => axios.get(`/api/whatsapp/messages/${encodeURIComponent(jid)}`, P).then(r => { if (openRef.current === jid) setConv(r.data); }).catch(e => setErr(errOf(e, 'Could not open the chat.')));
  const poll = async () => {
    try {
      const r = await axios.get('/api/whatsapp/status', P);
      setSt(r.data);
      if (r.data.status === 'open' && r.data.ver !== verRef.current) {
        verRef.current = r.data.ver;
        await loadChats();
        if (openRef.current) await loadConv(openRef.current);
      }
    } catch (e) { setSt(s => s || { status: 'error', error: errOf(e, 'Could not reach WhatsApp on the server.') }); }
  };
  useEffect(() => {
    if (!companyId) return undefined;
    poll();
    const t = setInterval(poll, 2500);
    return () => clearInterval(t);
  }, [companyId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (st?.status === 'qr' && st.qr && qrRef.current) QRCode.toCanvas(qrRef.current, st.qr, { width: 244, margin: 1 }).catch(() => {}); }, [st?.qr, st?.status]);
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [conv?.messages?.length, open]);

  const connect = async () => { setBusy(true); setErr(''); try { await axios.post('/api/whatsapp/connect', { companyId }, P); await poll(); } catch (e) { setErr(errOf(e, 'Could not start WhatsApp.')); } finally { setBusy(false); } };
  const logout = async () => {
    if (!window.confirm('Unlink WhatsApp from the ERP? Your chats stay on your phone; to use it here again, scan the QR again.')) return;
    try { await axios.post('/api/whatsapp/logout', { companyId }, P); setChats([]); setOpen(null); setConv(null); verRef.current = -1; await poll(); } catch (e) { setErr(errOf(e, 'Could not unlink.')); }
  };
  const pick = jid => { setOpen(jid); setConv(null); setText(''); loadConv(jid); setChats(cs => cs.map(c => (c.id === jid ? { ...c, unread: 0 } : c))); };
  const send = async () => {
    const t = text.trim(); if (!t || !open) return;
    setText(''); setErr('');
    const tmp = { id: `tmp${Date.now()}`, fromMe: true, t: Math.floor(Date.now() / 1000), text: t, status: 0 };
    setConv(c => (c ? { ...c, messages: [...c.messages, tmp] } : c));
    try { await axios.post('/api/whatsapp/send', { companyId, jid: open, text: t }, P); verRef.current = -1; poll(); } catch (e) { setErr(errOf(e, 'Could not send.')); setText(t); }
  };
  const sendFile = async e => {
    const f = e.target.files?.[0]; e.target.value = ''; if (!f || !open) return;
    const caption = window.prompt(`Send “${f.name}” — add a caption (optional):`, '');
    if (caption === null) return;
    setBusy(true); setErr('');
    try { const fd = new FormData(); fd.append('jid', open); fd.append('caption', caption); fd.append('file', f); fd.append('companyId', companyId); await axios.post('/api/whatsapp/send-file', fd, P); verRef.current = -1; poll(); }
    catch (x) { setErr(errOf(x, 'Could not send the file.')); } finally { setBusy(false); }
  };
  const newChat = async () => {
    const ph = window.prompt('Mobile number (with country code, e.g. 91 98765 43210):', ''); if (!ph) return;
    try { const r = await axios.post('/api/whatsapp/number', { companyId, phone: ph }, P); await loadChats(); pick(r.data.jid); } catch (e) { setErr(errOf(e, 'Could not open that number.')); }
  };
  const shown = useMemo(() => { const w = q.toLowerCase().trim(); return w ? chats.filter(c => `${c.name} ${c.id}`.toLowerCase().includes(w)) : chats; }, [chats, q]);
  const mediaUrl = m => `/api/whatsapp/media/${encodeURIComponent(open)}/${encodeURIComponent(m.id)}?companyId=${encodeURIComponent(companyId || '')}`;
  const me = st?.me;
  const meName = me ? (me.name || `+${String(me.id).split(':')[0].split('@')[0]}`) : '';

  let body;
  if (!st) body = <div className="wa-empty">Opening WhatsApp…</div>;
  else if (st.status === 'error' || st.installed === false) body = <div className="wa-empty">{st.error || 'WhatsApp is not available on the server.'}</div>;
  else if (st.status !== 'open') {
    const linking = st.status === 'qr';
    body = (
      <div className="wa-link">
        <div className="wa-card">
          <div className="tx">
            <h2>Use your WhatsApp in Super ERP</h2>
            <ol>
              <li>Open <b>WhatsApp</b> on your phone</li>
              <li>Tap <b>Menu ⋮</b> or <b>Settings</b> and choose <b>Linked devices</b></li>
              <li>Tap <b>Link a device</b> and point your phone at the code</li>
            </ol>
            <div className="note">You scan only once — the login stays on the ERP server, also after a restart. Sign in to the ERP in any browser and your WhatsApp is here.
              It is linked to <b>your</b> ERP login ({user?.name || user?.username}) — no other user sees it.</div>
          </div>
          <div className="wa-qr">
            {linking ? <canvas ref={qrRef} /> : (
              <div className="ov">{st.status === 'connecting' ? 'Connecting to WhatsApp…' : <div>
                <div style={{ marginBottom: 12 }}>{st.status === 'loggedout' ? 'WhatsApp was unlinked from the phone.' : st.expired ? 'The code expired.' : 'Not linked yet.'}</div>
                <button type="button" className="wa-big" onClick={connect} disabled={busy}>{busy ? 'Starting…' : 'Show the QR code'}</button></div>}</div>
            )}
          </div>
        </div>
      </div>
    );
  } else {
    body = (
      <div className={`wa-main${open ? ' open' : ''}`}>
        <div className="wa-side">
          <div className="wa-sh"><input value={q} onChange={e => setQ(e.target.value)} placeholder="Search chats" aria-label="Search chats" /><button type="button" onClick={newChat} title="Chat with a mobile number">+ New</button></div>
          <div className="wa-list">
            {!shown.length ? <div className="wa-empty" style={{ padding: 30 }}>{chats.length ? 'No chat matches.' : 'Your chats appear here as messages come in.'}</div>
              : shown.map(c => (
                <button key={c.id} type="button" className={`wa-it${open === c.id ? ' on' : ''}${c.unread ? ' unr' : ''}`} onClick={() => pick(c.id)}>
                  <span className="wa-av" style={{ background: avColor(c.id) }}>{c.group ? '👥' : initials(c.name)}</span>
                  <span className="tx"><span className="r1"><span className="nm">{c.name}</span><span className="tm">{c.t ? tm(c.t) : ''}</span></span>
                    <span className="r2"><span className="ls">{c.lastMine ? '✓ ' : ''}{c.last}</span>{c.unread > 0 && <span className="ur">{c.unread}</span>}</span></span>
                </button>))}
          </div>
        </div>
        <div className="wa-chat">
          {!open ? <div className="wa-empty"><div><div style={{ fontSize: 38, marginBottom: 8 }}>💬</div>Pick a chat on the left, or “+ New” for a mobile number.<br /><small>Linked as {meName}</small></div></div> : (<>
            <div className="wa-ch">
              <button type="button" className="wa-back" onClick={() => setOpen(null)} style={{ border: 0, background: 'none', cursor: 'pointer', fontSize: 18 }} aria-label="Back to chats">←</button>
              <span className="wa-av" style={{ background: avColor(open), width: 36, height: 36 }}>{conv?.group ? '👥' : initials(conv?.name)}</span>
              <div><b>{conv?.name || '…'}</b><small>{conv?.group ? 'Group' : `+${String(open).split('@')[0]}`}</small></div>
            </div>
            <div className="wa-msgs">
              {!conv ? <div className="wa-empty">Loading…</div> : !conv.messages.length ? <div className="wa-empty">No messages here yet — say hello.</div>
                : conv.messages.map((m, i) => {
                  const d = dayOf(m.t); const showDay = i === 0 || dayOf(conv.messages[i - 1].t) !== d;
                  return (
                    <React.Fragment key={m.id}>
                      {showDay && <div className="wa-day">{d}</div>}
                      <div className={`wa-b ${m.fromMe ? 'out' : 'in'}`}>
                        {conv.group && !m.fromMe && (m.by || m.push) && <span className="by">{m.by || m.push}</span>}
                        {m.media && (m.media.kind === 'image' || m.media.kind === 'sticker') && <img className="pic" src={mediaUrl(m)} alt="" loading="lazy" onClick={() => setZoom(mediaUrl(m))} />}
                        {m.media && m.media.kind === 'video' && <video src={mediaUrl(m)} controls style={{ maxWidth: 300, borderRadius: 6, display: 'block', marginBottom: 3 }} />}
                        {m.media && m.media.kind === 'audio' && <audio src={mediaUrl(m)} controls style={{ display: 'block', marginBottom: 3 }} />}
                        {m.media && m.media.kind === 'document' && <a className="doc" href={mediaUrl(m)} target="_blank" rel="noreferrer"><i>📄</i><span>{m.media.fileName || 'Document'}</span></a>}
                        {m.text && (!m.media || m.text !== (m.media.fileName || '')) ? m.text : null}
                        <span className="mt">{new Date(m.t * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}{m.fromMe && <span className={`tk${m.status >= 4 ? ' rd' : ''}`}>{m.status >= 3 ? '✓✓' : '✓'}</span>}</span>
                      </div>
                    </React.Fragment>
                  );
                })}
              <div ref={endRef} />
            </div>
            <div className="wa-comp">
              <button type="button" className="at" title="Send a picture / file" aria-label="Attach" onClick={() => fileRef.current?.click()} disabled={busy}>📎</button>
              <input ref={fileRef} type="file" hidden onChange={sendFile} />
              <textarea value={text} onChange={e => setText(e.target.value)} placeholder="Type a message" aria-label="Message" rows={1}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} />
              <button type="button" className="go" onClick={send} disabled={!text.trim()} aria-label="Send">➤</button>
            </div>
          </>)}
        </div>
      </div>
    );
  }

  return (
    <div className="wa">
      <style>{WA_CSS}</style>
      <div className="wa-top"><b>WhatsApp</b>{me && <small>· {meName}</small>}<span className="sp" />
        {st?.status === 'open' && <button type="button" onClick={logout} title="Unlink WhatsApp from the ERP">Unlink</button>}</div>
      {err && <div className="wa-err"><span>{err}</span><button type="button" onClick={() => setErr('')} aria-label="Close">×</button></div>}
      {body}
      {zoom && <div className="wa-zoom" onClick={() => setZoom('')} role="dialog" aria-label="Picture"><img src={zoom} alt="" /></div>}
    </div>
  );
}
