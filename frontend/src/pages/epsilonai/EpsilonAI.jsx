import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import axios from 'axios';
import { useCompany } from '../../context/CompanyContext';

const F  = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const P  = '#3A6186';
const PD = '#2A4D6E';
const BD = '#E5EAF2';
const BG = '#F4F7FB';

const fmt  = n => (parseFloat(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtD = d => {
  if (!d) return '—';
  const dt = new Date(d);
  return isNaN(dt) ? String(d) : `${String(dt.getDate()).padStart(2,'0')}-${String(dt.getMonth()+1).padStart(2,'0')}-${dt.getFullYear()}`;
};

const TABS = [
  { key: 'chat',    label: '💬 AI Chat' },
  { key: 'summary', label: '📊 Order Summary' },
  { key: 'extract', label: '📄 Text Extract (OCR)' },
];

/* ══════════════════════════════════════════════════════════
   Dynamic CDN script loader — same pattern as the print
   utilities' pdf.js loading, kept out of the npm bundle since
   it's only needed when this one tab is actually used.
══════════════════════════════════════════════════════════ */
const loadScript = (src, globalCheck) => new Promise((resolve, reject) => {
  if (globalCheck()) { resolve(); return; }
  const existing = document.querySelector(`script[src="${src}"]`);
  if (existing) { existing.addEventListener('load', () => resolve()); existing.addEventListener('error', reject); return; }
  const s = document.createElement('script');
  s.src = src; s.async = true;
  s.onload = () => resolve();
  s.onerror = () => reject(new Error(`Failed to load ${src}`));
  document.head.appendChild(s);
});

const loadPdfJs = () => loadScript(
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
  () => !!window.pdfjsLib,
).then(() => {
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
});

const loadTesseract = () => loadScript(
  'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js',
  () => !!window.Tesseract,
);

/* ══════════════════════════════════════════════════════════
   AI CHAT TAB — self-hosted (Ollama, running on this machine).
   Streams the reply token-by-token, same feel as ChatGPT.
══════════════════════════════════════════════════════════ */
const EMAIL_PROMPT_TEMPLATE =
  `Here is an email I received:\n\n"""\n[paste the old email here]\n"""\n\nPlease draft a professional reply.`;

function ChatTab() {
  const [messages, setMessages] = useState([]); // [{role:'user'|'assistant', content}]
  const [input, setInput]       = useState('');
  const [sending, setSending]   = useState(false);
  const [error, setError]       = useState('');
  const listRef  = useRef(null);
  const taRef    = useRef(null);
  const abortRef = useRef(null);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages]);

  const send = useCallback(async (text) => {
    const content = (text ?? input).trim();
    if (!content || sending) return;
    setError('');
    setInput('');
    const history = [...messages, { role: 'user', content }];
    setMessages([...history, { role: 'assistant', content: '' }]);
    setSending(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Request failed (${res.status})`);
      }
      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      let acc = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop(); // last (possibly incomplete) line stays in the buffer
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const obj = JSON.parse(line);
            if (obj.message?.content) {
              acc += obj.message.content;
              setMessages(prev => {
                const next = [...prev];
                next[next.length - 1] = { role: 'assistant', content: acc };
                return next;
              });
            }
            if (obj.error) throw new Error(obj.error);
          } catch { /* ignore a stray non-JSON line */ }
        }
      }
    } catch (e) {
      if (e.name !== 'AbortError') {
        setError(e.message || 'Could not reach the local AI. Is Ollama running?');
        setMessages(prev => prev.slice(0, -1)); // drop the empty assistant bubble
      }
    } finally {
      setSending(false);
      abortRef.current = null;
    }
  }, [input, messages, sending]);

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  };

  const stop = () => abortRef.current?.abort();

  const draftEmail = () => {
    setInput(EMAIL_PROMPT_TEMPLATE);
    taRef.current?.focus();
  };

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', maxHeight:'calc(100vh - 150px)' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
        <span style={{ fontSize:11.5, color:'#9CA3AF' }}>Runs on this machine via Ollama — nothing leaves your network.</span>
        <button onClick={draftEmail} style={{ fontSize:11.5, padding:'6px 12px', borderRadius:6, cursor:'pointer',
          border:`1px solid ${BD}`, background:'#fff', fontFamily:F, fontWeight:600, color:P }}>
          📧 Draft a reply from an old email
        </button>
      </div>

      <div ref={listRef} style={{ flex:1, overflowY:'auto', background:'#fff', border:`1px solid ${BD}`,
        borderRadius:10, padding:16, display:'flex', flexDirection:'column', gap:12 }}>
        {messages.length === 0 && (
          <div style={{ color:'#9CA3AF', fontSize:13, textAlign:'center', marginTop:30 }}>
            Ask a question, or click "Draft a reply from an old email" above and paste one in.
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} style={{ display:'flex', justifyContent: m.role==='user' ? 'flex-end' : 'flex-start' }}>
            <div style={{
              maxWidth:'75%', padding:'9px 13px', borderRadius:12, fontSize:13, lineHeight:1.55,
              whiteSpace:'pre-wrap', wordBreak:'break-word',
              background: m.role==='user' ? P : '#F3F6FB',
              color: m.role==='user' ? '#fff' : '#1E293B',
              borderBottomRightRadius: m.role==='user' ? 3 : 12,
              borderBottomLeftRadius:  m.role==='user' ? 12 : 3,
            }}>
              {m.content || (sending && i===messages.length-1 ? '…' : '')}
            </div>
          </div>
        ))}
      </div>

      {error && <div style={{ color:'#dc2626', fontSize:12, fontWeight:600, marginTop:8 }}>{error}</div>}

      <div style={{ display:'flex', gap:8, marginTop:10, alignItems:'flex-end' }}>
        <textarea ref={taRef} value={input} onChange={e=>setInput(e.target.value)} onKeyDown={onKeyDown}
          placeholder="Ask a question or write what you need…" rows={2}
          style={{ flex:1, resize:'none', padding:'9px 12px', border:`1.5px solid ${BD}`, borderRadius:8,
            fontSize:13, fontFamily:F, outline:'none' }}/>
        {sending ? (
          <button onClick={stop} style={{ height:38, padding:'0 16px', borderRadius:8, border:'none',
            background:'#dc2626', color:'#fff', fontWeight:700, fontSize:12.5, cursor:'pointer', fontFamily:F }}>
            ■ Stop
          </button>
        ) : (
          <button onClick={()=>send()} disabled={!input.trim()} style={{ height:38, padding:'0 18px', borderRadius:8,
            border:'none', background: input.trim() ? P : '#CBD5E1', color:'#fff', fontWeight:700, fontSize:12.5,
            cursor: input.trim() ? 'pointer' : 'default', fontFamily:F }}>
            Send
          </button>
        )}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   ORDER SUMMARY TAB
══════════════════════════════════════════════════════════ */
function OrderSummaryTab({ cid }) {
  const [loading, setLoading]   = useState(true);
  const [data, setData]         = useState({ clientDues: [], vendorDues: [] });
  const [q, setQ]               = useState('');
  const [open, setOpen]         = useState(false);
  const [selected, setSelected] = useState(null);
  const boxRef = useRef(null);

  useEffect(() => {
    if (!cid) return;
    setLoading(true);
    axios.get(`/api/accounts/dues?companyId=${cid}`)
      .then(r => setData({ clientDues: r.data?.clientDues || [], vendorDues: r.data?.vendorDues || [] }))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [cid]);

  useEffect(() => {
    const h = e => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const matches = useMemo(() => {
    if (!q.trim()) return data.clientDues.slice(0, 30);
    const lq = q.toLowerCase();
    return data.clientDues.filter(o =>
      (o.orderNo||'').toLowerCase().includes(lq) ||
      (o.entityName||'').toLowerCase().includes(lq)
    ).slice(0, 30);
  }, [q, data.clientDues]);

  const linkedPOs = useMemo(() => {
    if (!selected) return [];
    return data.vendorDues.filter(v => String(v.linkedSalesOrderId||'') === String(selected.orderId));
  }, [selected, data.vendorDues]);

  const totals = useMemo(() => {
    const poValue   = linkedPOs.reduce((s,v) => s + (v.orderTotal||0), 0);
    const poPaid    = linkedPOs.reduce((s,v) => s + (v.paid||0), 0);
    const poDue     = linkedPOs.reduce((s,v) => s + Math.max(0, v.due||0), 0);
    const margin    = (selected?.orderTotal||0) - poValue;
    return { poValue, poPaid, poDue, margin };
  }, [linkedPOs, selected]);

  if (loading) return <div style={{ padding:30, color:'#888', fontSize:12 }}>Loading order data…</div>;

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
      {/* Order search */}
      <div ref={boxRef} style={{ position:'relative', maxWidth:460 }}>
        <input
          value={open ? q : (selected ? `${selected.orderNo} — ${selected.entityName}` : q)}
          onChange={e => { setQ(e.target.value); setOpen(true); setSelected(null); }}
          onFocus={() => setOpen(true)}
          placeholder="Search Sales Order No. or Client Name…"
          style={{ width:'100%', height:36, padding:'0 12px', border:`1.5px solid ${BD}`, borderRadius:8,
            fontSize:13, fontFamily:F, outline:'none' }}
        />
        {open && (
          <div style={{ position:'absolute', top:40, left:0, right:0, zIndex:50, background:'#fff',
            border:`1px solid ${BD}`, borderRadius:8, maxHeight:320, overflowY:'auto',
            boxShadow:'0 8px 24px rgba(0,0,0,0.12)' }}>
            {matches.length === 0 && <div style={{ padding:14, fontSize:12, color:'#999' }}>No orders found</div>}
            {matches.map(o => (
              <div key={o.orderId} onClick={() => { setSelected(o); setOpen(false); setQ(''); }}
                style={{ padding:'8px 12px', cursor:'pointer', borderBottom:`1px solid ${BD}`,
                  display:'flex', justifyContent:'space-between', gap:10 }}
                onMouseEnter={e=>e.currentTarget.style.background='#f3f6fb'}
                onMouseLeave={e=>e.currentTarget.style.background='#fff'}>
                <div>
                  <div style={{ fontWeight:700, fontSize:12.5, color:P }}>{o.orderNo}</div>
                  <div style={{ fontSize:11, color:'#666' }}>{o.entityName}</div>
                </div>
                <div style={{ textAlign:'right' }}>
                  <div style={{ fontSize:11.5, fontWeight:700 }}>₹{fmt(o.orderTotal)}</div>
                  <div style={{ fontSize:10, color:'#999' }}>{fmtD(o.orderDate)}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {!selected && (
        <div style={{ padding:'40px 20px', textAlign:'center', color:'#9CA3AF', fontSize:13 }}>
          Select a Sales Order above to see its client receipts and linked vendor Purchase Orders in one place.
        </div>
      )}

      {selected && (
        <>
          {/* Order header card */}
          <div style={{ background:'#fff', border:`1px solid ${BD}`, borderRadius:10, padding:16,
            display:'flex', flexWrap:'wrap', gap:24 }}>
            {[
              ['Sales Order No.', selected.orderNo],
              ['Order Date', fmtD(selected.orderDate)],
              ['Client', selected.entityName],
              ['Order Value', `₹${fmt(selected.orderTotal)}`],
              ['Received from Client', `₹${fmt(selected.received)}`],
              ['Client Balance Due', `₹${fmt(Math.max(0, selected.due))}`],
            ].map(([lbl, val]) => (
              <div key={lbl}>
                <div style={{ fontSize:10, fontWeight:700, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'0.6px' }}>{lbl}</div>
                <div style={{ fontSize:14, fontWeight:700, color:'#1E293B', marginTop:2 }}>{val}</div>
              </div>
            ))}
          </div>

          {/* Client advance / receipts */}
          <div style={{ background:'#fff', border:`1px solid ${BD}`, borderRadius:10, overflow:'hidden' }}>
            <div style={{ padding:'9px 14px', background:`${P}10`, borderBottom:`2px solid ${P}`,
              fontSize:11.5, fontWeight:800, color:P, textTransform:'uppercase', letterSpacing:'0.5px' }}>
              💰 Client Advance / Receipts
            </div>
            {(!selected.linkedPayments || selected.linkedPayments.length===0) ? (
              <div style={{ padding:14, fontSize:12, color:'#9CA3AF' }}>No receipts recorded against this order yet.</div>
            ) : (
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12.5 }}>
                <thead>
                  <tr style={{ background:'#f8faff' }}>
                    <th style={th}>Date</th><th style={th}>Mode</th><th style={th}>Reference</th><th style={{...th,textAlign:'right'}}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {selected.linkedPayments.map((p,i) => (
                    <tr key={i} style={{ borderBottom:`1px solid ${BD}` }}>
                      <td style={td}>{fmtD(p.date)}</td>
                      <td style={td}>{p.paymentMode || '—'}</td>
                      <td style={td}>{p.referenceNo || '—'}</td>
                      <td style={{...td,textAlign:'right',fontWeight:700}}>₹{fmt(p.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Linked Purchase Orders */}
          <div style={{ background:'#fff', border:`1px solid ${BD}`, borderRadius:10, overflow:'hidden' }}>
            <div style={{ padding:'9px 14px', background:`${P}10`, borderBottom:`2px solid ${P}`,
              fontSize:11.5, fontWeight:800, color:P, textTransform:'uppercase', letterSpacing:'0.5px' }}>
              📦 Linked Purchase Orders — Vendor &amp; Advance Paid
            </div>
            {linkedPOs.length === 0 ? (
              <div style={{ padding:14, fontSize:12, color:'#9CA3AF' }}>No Purchase Orders are linked to this Sales Order.</div>
            ) : (
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12.5 }}>
                <thead>
                  <tr style={{ background:'#f8faff' }}>
                    <th style={th}>Vendor</th><th style={th}>PO No</th><th style={th}>PO Date</th>
                    <th style={{...th,textAlign:'right'}}>PO Value</th>
                    <th style={{...th,textAlign:'right'}}>Paid to Vendor</th>
                    <th style={{...th,textAlign:'right'}}>Due</th>
                  </tr>
                </thead>
                <tbody>
                  {linkedPOs.map(v => (
                    <tr key={v.orderId} style={{ borderBottom:`1px solid ${BD}` }}>
                      <td style={{...td,fontWeight:700,color:'#1e40af'}}>{v.entityName}</td>
                      <td style={td}>{v.orderNo}</td>
                      <td style={td}>{fmtD(v.orderDate)}</td>
                      <td style={{...td,textAlign:'right'}}>₹{fmt(v.orderTotal)}</td>
                      <td style={{...td,textAlign:'right',color:'#16a34a',fontWeight:700}}>₹{fmt(v.paid)}</td>
                      <td style={{...td,textAlign:'right',color:v.due>0?'#dc2626':'#16a34a',fontWeight:700}}>₹{fmt(Math.max(0,v.due))}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ background:'#f3f6fb', fontWeight:800 }}>
                    <td style={td} colSpan={3}>Total</td>
                    <td style={{...td,textAlign:'right'}}>₹{fmt(totals.poValue)}</td>
                    <td style={{...td,textAlign:'right',color:'#16a34a'}}>₹{fmt(totals.poPaid)}</td>
                    <td style={{...td,textAlign:'right',color:totals.poDue>0?'#dc2626':'#16a34a'}}>₹{fmt(totals.poDue)}</td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>

          {/* Quick margin chip */}
          {linkedPOs.length > 0 && (
            <div style={{ display:'flex', gap:10 }}>
              <div style={{ padding:'8px 14px', borderRadius:8, background:totals.margin>=0?'#ecfdf5':'#fef2f2',
                border:`1px solid ${totals.margin>=0?'#86efac':'#fca5a5'}`, fontSize:12 }}>
                <span style={{ color:'#666' }}>Order Value − PO Value (gross margin): </span>
                <b style={{ color: totals.margin>=0?'#16a34a':'#dc2626' }}>₹{fmt(totals.margin)}</b>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

const th = { padding:'7px 12px', textAlign:'left', fontSize:10.5, fontWeight:700, color:'#64748B', textTransform:'uppercase', letterSpacing:'0.4px' };
const td = { padding:'7px 12px' };

/* ══════════════════════════════════════════════════════════
   TEXT EXTRACT (OCR) TAB
══════════════════════════════════════════════════════════ */
function ExtractTab() {
  const [busy, setBusy]       = useState(false);
  const [progress, setProgress] = useState('');
  const [text, setText]       = useState('');
  const [preview, setPreview] = useState(null); // { kind:'image'|'pdf', url, name }
  const [error, setError]     = useState('');
  const [copied, setCopied]   = useState(false);
  const dropRef = useRef(null);
  const fileRef = useRef(null);

  const runOcrOnImageSrc = useCallback(async (src, onProgress) => {
    await loadTesseract();
    const { data } = await window.Tesseract.recognize(src, 'eng', {
      logger: m => { if (m.status && m.progress != null) onProgress(`${m.status} — ${Math.round(m.progress*100)}%`); },
    });
    return data.text || '';
  }, []);

  const processPdf = useCallback(async (file) => {
    await loadPdfJs();
    const buf = await file.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument({ data: buf }).promise;
    let out = '';
    let hasEmbeddedText = false;

    for (let p = 1; p <= pdf.numPages; p++) {
      setProgress(`Reading page ${p} of ${pdf.numPages}…`);
      const page = await pdf.getPage(p);
      const tc = await page.getTextContent();
      const pageText = tc.items.map(i => i.str).join(' ').trim();
      if (pageText.length > 20) hasEmbeddedText = true;
      out += pageText + '\n\n';
    }

    /* Scanned PDF (no real text layer) — fall back to rendering each page
       to a canvas and running OCR on the image, same as a photo upload. */
    if (!hasEmbeddedText) {
      out = '';
      await loadTesseract();
      for (let p = 1; p <= pdf.numPages; p++) {
        setProgress(`OCR on page ${p} of ${pdf.numPages}…`);
        const page = await pdf.getPage(p);
        const vp = page.getViewport({ scale: 2 });
        const canvas = document.createElement('canvas');
        canvas.width = vp.width; canvas.height = vp.height;
        await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
        const pageText = await runOcrOnImageSrc(canvas.toDataURL('image/png'),
          msg => setProgress(`Page ${p}/${pdf.numPages} — ${msg}`));
        out += pageText + '\n\n';
      }
    }
    return out.trim();
  }, [runOcrOnImageSrc]);

  const processFile = useCallback(async (file) => {
    if (!file) return;
    setError(''); setText(''); setBusy(true); setProgress('Starting…');
    try {
      if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name||'')) {
        setPreview({ kind:'pdf', name:file.name });
        const out = await processPdf(file);
        setText(out || '(No text could be extracted from this PDF.)');
      } else if (file.type.startsWith('image/')) {
        const url = URL.createObjectURL(file);
        setPreview({ kind:'image', url, name:file.name });
        const out = await runOcrOnImageSrc(url, msg => setProgress(msg));
        setText(out.trim() || '(No text detected in this image.)');
      } else {
        setError('Unsupported file — please upload an image or a PDF.');
      }
    } catch (e) {
      setError('Could not extract text: ' + (e?.message || e));
    } finally {
      setBusy(false); setProgress('');
    }
  }, [processPdf, runOcrOnImageSrc]);

  const handlePaste = useCallback((e) => {
    const items = e.clipboardData?.items || [];
    for (const it of items) {
      if (it.type.startsWith('image/')) {
        const file = it.getAsFile();
        if (file) { processFile(file); e.preventDefault(); return; }
      }
    }
  }, [processFile]);

  useEffect(() => {
    const el = dropRef.current;
    if (!el) return;
    const onDrop = e => { e.preventDefault(); const f = e.dataTransfer?.files?.[0]; if (f) processFile(f); };
    const onOver = e => e.preventDefault();
    el.addEventListener('drop', onDrop);
    el.addEventListener('dragover', onOver);
    return () => { el.removeEventListener('drop', onDrop); el.removeEventListener('dragover', onOver); };
  }, [processFile]);

  const copyText = () => {
    navigator.clipboard?.writeText(text).then(() => { setCopied(true); setTimeout(()=>setCopied(false), 1500); });
  };

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14 }} onPaste={handlePaste} tabIndex={0}>
      <div ref={dropRef}
        style={{ border:`2px dashed ${BD}`, borderRadius:10, padding:'28px 16px', textAlign:'center',
          background:'#fff', cursor:'pointer' }}
        onClick={() => fileRef.current?.click()}>
        <div style={{ fontSize:28, marginBottom:6 }}>🖼️📄</div>
        <div style={{ fontSize:13, fontWeight:700, color:'#334155' }}>Click to upload, drag &amp; drop, or paste (Ctrl+V) an image / PDF</div>
        <div style={{ fontSize:11, color:'#94A3B8', marginTop:4 }}>Digitally-generated PDFs extract text instantly; scanned PDFs and photos run through OCR.</div>
        <input ref={fileRef} type="file" accept="image/*,application/pdf" style={{ display:'none' }}
          onChange={e => processFile(e.target.files?.[0])}/>
      </div>

      {preview && (
        <div style={{ display:'flex', alignItems:'center', gap:10, fontSize:12, color:'#555' }}>
          {preview.kind === 'image'
            ? <img src={preview.url} alt="preview" style={{ height:60, borderRadius:6, border:`1px solid ${BD}` }}/>
            : <div style={{ height:60, width:46, borderRadius:6, border:`1px solid ${BD}`, display:'flex',
                alignItems:'center', justifyContent:'center', fontSize:20, background:'#f8faff' }}>📄</div>}
          <span>{preview.name}</span>
        </div>
      )}

      {busy && (
        <div style={{ fontSize:12, color:P, fontWeight:600, display:'flex', alignItems:'center', gap:8 }}>
          <span className="epsai-spin" style={{ width:14, height:14, border:`2px solid ${BD}`, borderTopColor:P,
            borderRadius:'50%', display:'inline-block', animation:'epsai-spin 0.8s linear infinite' }}/>
          {progress || 'Working…'}
        </div>
      )}
      <style>{'@keyframes epsai-spin{to{transform:rotate(360deg)}}'}</style>

      {error && <div style={{ color:'#dc2626', fontSize:12.5, fontWeight:600 }}>{error}</div>}

      {text && (
        <div>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
            <span style={{ fontSize:11.5, fontWeight:700, color:'#64748B', textTransform:'uppercase' }}>Extracted Text</span>
            <button onClick={copyText} style={{ fontSize:11, padding:'4px 10px', borderRadius:5, cursor:'pointer',
              border:`1px solid ${BD}`, background: copied ? '#dcfce7' : '#f9fafb', fontFamily:F, fontWeight:600 }}>
              {copied ? '✓ Copied' : '📋 Copy'}
            </button>
          </div>
          <textarea readOnly value={text}
            style={{ width:'100%', minHeight:260, padding:12, border:`1px solid ${BD}`, borderRadius:8,
              fontSize:12.5, fontFamily:'Consolas, monospace', lineHeight:1.5, resize:'vertical', outline:'none' }}/>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   MAIN
══════════════════════════════════════════════════════════ */
export default function EpsilonAI() {
  const { selectedCompany } = useCompany();
  const cid = selectedCompany?.companyId || '';
  const [tab, setTab] = useState('summary');

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', background:BG, fontFamily:F }}>
      <div style={{ flexShrink:0, height:44, background:P, borderBottom:`2px solid ${PD}`,
        display:'flex', alignItems:'stretch' }}>
        <div style={{ display:'flex', alignItems:'center', padding:'0 14px', fontSize:12, fontWeight:800,
          color:'#fff', textTransform:'uppercase', letterSpacing:'0.8px', borderRight:'2px solid rgba(255,255,255,0.18)' }}>
          ✨ Epsilon AI
        </div>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            style={{ display:'flex', alignItems:'center', padding:'0 16px', height:26, alignSelf:'center',
              cursor:'pointer', fontSize:12, fontWeight:tab===t.key?700:600, fontFamily:F,
              color: tab===t.key ? '#fff' : 'rgba(255,255,255,0.85)',
              background: tab===t.key ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.07)',
              border:`1px solid ${tab===t.key?'rgba(255,255,255,0.55)':'rgba(255,255,255,0.22)'}`,
              boxShadow: tab===t.key?'0 2px 6px rgba(0,0,0,0.22)':'0 1px 2px rgba(0,0,0,0.12)',
              borderRadius:6, margin:'0 4px' }}
            onMouseEnter={e=>{if(tab!==t.key){e.currentTarget.style.background='rgba(255,255,255,0.14)';e.currentTarget.style.borderColor='rgba(255,255,255,0.55)';}}}
            onMouseLeave={e=>{if(tab!==t.key){e.currentTarget.style.background='rgba(255,255,255,0.07)';e.currentTarget.style.borderColor='rgba(255,255,255,0.22)';}}}>
            {t.label}
          </button>
        ))}
      </div>

      <div style={{ flex:1, overflow:'auto', padding:18 }}>
        {tab === 'chat' ? <ChatTab/> : tab === 'summary' ? <OrderSummaryTab cid={cid}/> : <ExtractTab/>}
      </div>
    </div>
  );
}
