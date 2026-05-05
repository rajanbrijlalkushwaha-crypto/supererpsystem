import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useCompany } from '../../context/CompanyContext';

const F   = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const HDR = '#2F6FED';
const BD  = '#E5EAF2';
const P   = '#2563EB';

const STATUS_STYLE = {
  'self-registered': { bg:'#FFFBEB', color:'#D97706', label:'Pending Review' },
  approved:          { bg:'#ECFDF5', color:'#059669', label:'Approved' },
  rejected:          { bg:'#FEF2F2', color:'#DC2626', label:'Rejected' },
};

const inp = (err) => ({
  width:'100%', height:34, padding:'0 9px', fontSize:12.5, fontFamily:F,
  border:`1px solid ${err?'#EF4444':'#D1D5DB'}`, borderRadius:5,
  background:'#fff', outline:'none', boxSizing:'border-box',
});

const STATES = [
  'Andhra Pradesh','Arunachal Pradesh','Assam','Bihar','Chhattisgarh','Goa','Gujarat',
  'Haryana','Himachal Pradesh','Jharkhand','Karnataka','Kerala','Madhya Pradesh',
  'Maharashtra','Manipur','Meghalaya','Mizoram','Nagaland','Odisha','Punjab','Rajasthan',
  'Sikkim','Tamil Nadu','Telangana','Tripura','Uttar Pradesh','Uttarakhand','West Bengal',
  'Delhi','Chandigarh','Puducherry','Jammu and Kashmir','Ladakh',
];

/* ── Edit/View modal ── */
function EditModal({ reg, onClose, onSave }) {
  const [form, setForm]   = useState({ ...reg });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg]     = useState(null);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    setSaving(true); setMsg(null);
    try {
      await axios.put(`/api/vendor-portal/registrations/${reg.id}`, form);
      setMsg({ type:'success', text:'Registration updated successfully.' });
      onSave();
    } catch (e) {
      setMsg({ type:'error', text: e.response?.data?.error || e.message });
    } finally { setSaving(false); }
  };

  const isApproved = reg.status === 'approved';

  const Section = ({ title, children }) => (
    <div style={{ border:'1px solid #E5E7EB', borderRadius:8, overflow:'hidden', marginBottom:12 }}>
      <div style={{ background:'#F1F5F9', padding:'6px 12px', fontSize:12, fontWeight:700, color:'#1E293B', borderBottom:'1px solid #E5E7EB' }}>{title}</div>
      <div style={{ padding:'12px', display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>{children}</div>
    </div>
  );

  const FR = ({ label, field, full, sel, opts }) => (
    <div style={{ gridColumn: full?'1/-1':'auto', display:'flex', flexDirection:'column', gap:4 }}>
      <label style={{ fontSize:11, fontWeight:600, color:'#374151' }}>{label}</label>
      {sel ? (
        <select style={inp()} value={form[field]||''} onChange={e=>set(field,e.target.value)} disabled={isApproved}>
          <option value="">— Select —</option>
          {opts.map(o=><option key={o} value={o}>{o}</option>)}
        </select>
      ) : (
        <input style={inp()} value={form[field]||''} onChange={e=>set(field,e.target.value)} disabled={isApproved} />
      )}
    </div>
  );

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center', fontFamily:F }}>
      <div style={{ background:'#fff', borderRadius:12, width:'min(860px,96vw)', maxHeight:'90vh', overflow:'hidden', display:'flex', flexDirection:'column', boxShadow:'0 20px 60px rgba(0,0,0,0.3)' }}>
        <div style={{ background:'#1E293B', color:'#fff', padding:'14px 20px', display:'flex', justifyContent:'space-between', alignItems:'center', flexShrink:0 }}>
          <div>
            <div style={{ fontWeight:700, fontSize:14 }}>{reg.vendorName || reg.companyName} — {isApproved ? 'View Details' : 'Edit Registration'}</div>
            <div style={{ fontSize:11, color:'#94A3B8', marginTop:2 }}>
              {reg.email} · Tracking: <strong>{reg.trackingNo || reg.id}</strong> · {reg.status}
            </div>
          </div>
          <button onClick={onClose} style={{ background:'rgba(255,255,255,0.1)', border:'1px solid rgba(255,255,255,0.2)', color:'#fff', borderRadius:6, width:28, height:28, cursor:'pointer', fontSize:16, display:'flex', alignItems:'center', justifyContent:'center' }}>×</button>
        </div>

        {isApproved && (
          <div style={{ background:'#FFF7ED', borderBottom:'1px solid #FED7AA', padding:'8px 16px', fontSize:12, color:'#92400E' }}>
            ⚠️ This registration is already approved — fields are read-only.
          </div>
        )}

        {msg && (
          <div style={{ padding:'8px 16px', fontSize:12, fontWeight:600,
            background: msg.type==='success'?'#ECFDF5':'#FEF2F2',
            color: msg.type==='success'?'#065F46':'#991B1B',
            borderBottom:`1px solid ${msg.type==='success'?'#A7F3D0':'#FECACA'}` }}>
            {msg.text}
          </div>
        )}

        <div style={{ overflowY:'auto', padding:'16px 20px', flex:1 }}>
          <Section title="🏢 Company Information">
            <FR label="Vendor / Company Name" field="vendorName" full />
            <FR label="Business Type" field="businessType" sel opts={['Proprietorship','Partnership','Private Limited','Public Limited','LLP','Government','Individual','Trust / NGO','HUF']} />
            <FR label="Industry Type" field="industryType" sel opts={['Manufacturing','Trading','Services','Construction','Consulting','Logistics','Others']} />
            <FR label="GST Number" field="gst" />
            <FR label="PAN Number" field="pan" />
            <FR label="CIN Number" field="cin" />
            <FR label="MSME / Udyam No." field="msme" />
          </Section>
          <Section title="📞 Contact Information">
            <FR label="Contact Person" field="contactPerson" />
            <FR label="Mobile" field="mobile" />
            <FR label="Website" field="website" />
            <div style={{ gridColumn:'1/-1', display:'flex', flexDirection:'column', gap:4 }}>
              <label style={{ fontSize:11, fontWeight:600, color:'#374151' }}>Address</label>
              <textarea value={form.address||''} onChange={e=>set('address',e.target.value)} rows={2} disabled={isApproved}
                style={{ ...inp(), height:'auto', padding:'7px 9px', resize:'vertical' }} />
            </div>
            <FR label="City" field="city" />
            <FR label="State" field="state" sel opts={STATES} />
            <FR label="Pincode" field="pincode" />
            <FR label="Country" field="country" />
          </Section>
          <Section title="🏦 Banking Details">
            <FR label="Bank Name" field="bankName" />
            <FR label="Account Holder" field="accountHolder" />
            <FR label="Account Number" field="accountNo" />
            <FR label="IFSC Code" field="ifsc" />
            <FR label="Branch" field="branch" />
          </Section>

          {/* Read-only meta */}
          <div style={{ border:'1px solid #E5E7EB', borderRadius:8, overflow:'hidden' }}>
            <div style={{ background:'#F1F5F9', padding:'6px 12px', fontSize:12, fontWeight:700, color:'#1E293B', borderBottom:'1px solid #E5E7EB' }}>📋 Registration Info</div>
            <div style={{ padding:'10px 12px', display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8 }}>
              {[
                ['Tracking No.', reg.trackingNo || '—'],
                ['Status', reg.status],
                ['Submitted', reg.createdAt ? new Date(reg.createdAt).toLocaleDateString('en-IN') : '—'],
                ['Approved At', reg.approvedAt ? new Date(reg.approvedAt).toLocaleDateString('en-IN') : '—'],
                ['Vendor ID', reg.vendorId || '—'],
                ['Company ID', reg.companyId || '—'],
              ].map(([label, value]) => (
                <div key={label}>
                  <div style={{ fontSize:10.5, color:'#6B7280', fontWeight:600 }}>{label}</div>
                  <div style={{ fontSize:12.5, color:'#1E293B', fontWeight:500 }}>{value}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div style={{ padding:'12px 20px', borderTop:'1px solid #E5E7EB', display:'flex', justifyContent:'flex-end', gap:8, flexShrink:0 }}>
          <button onClick={onClose} style={{ padding:'7px 18px', background:'#fff', border:'1px solid #D1D5DB', borderRadius:6, cursor:'pointer', fontSize:13, fontWeight:600, fontFamily:F }}>Close</button>
          {!isApproved && (
            <button onClick={handleSave} disabled={saving} style={{ padding:'7px 20px', background:saving?'#93C5FD':P, border:'none', borderRadius:6, cursor:saving?'not-allowed':'pointer', fontSize:13, fontWeight:700, fontFamily:F, color:'#fff', opacity:saving?0.7:1 }}>
              {saving ? '⏳ Saving…' : '💾 Save Changes'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Send Query modal ── */
function QueryModal({ reg, onClose }) {
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [msg, setMsg]         = useState(null);

  const handleSend = async () => {
    if (!message.trim()) { setMsg({ type:'error', text:'Message is required.' }); return; }
    setSending(true); setMsg(null);
    try {
      const res = await axios.post(`/api/vendor-portal/send-query/${reg.id}`, { subject, message });
      setMsg({ type:'success', text: res.data.message });
      setMessage(''); setSubject('');
    } catch (e) {
      setMsg({ type:'error', text: e.response?.data?.error || e.message });
    } finally { setSending(false); }
  };

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center', fontFamily:F }}>
      <div style={{ background:'#fff', borderRadius:12, width:'min(520px,94vw)', overflow:'hidden', boxShadow:'0 20px 60px rgba(0,0,0,0.3)' }}>
        <div style={{ background:'#1E293B', color:'#fff', padding:'14px 20px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div>
            <div style={{ fontWeight:700, fontSize:14 }}>📧 Send Query Email</div>
            <div style={{ fontSize:11, color:'#94A3B8', marginTop:2 }}>To: {reg.email} ({reg.vendorName || reg.companyName})</div>
          </div>
          <button onClick={onClose} style={{ background:'rgba(255,255,255,0.1)', border:'1px solid rgba(255,255,255,0.2)', color:'#fff', borderRadius:6, width:28, height:28, cursor:'pointer', fontSize:16, display:'flex', alignItems:'center', justifyContent:'center' }}>×</button>
        </div>

        {msg && (
          <div style={{ padding:'9px 16px', fontSize:12, fontWeight:600,
            background: msg.type==='success'?'#ECFDF5':'#FEF2F2',
            color: msg.type==='success'?'#065F46':'#991B1B',
            borderBottom:`1px solid ${msg.type==='success'?'#A7F3D0':'#FECACA'}` }}>
            {msg.text}
          </div>
        )}

        <div style={{ padding:'18px 20px', display:'flex', flexDirection:'column', gap:12 }}>
          <div>
            <label style={{ fontSize:12, fontWeight:600, color:'#374151', display:'block', marginBottom:4 }}>Subject (optional)</label>
            <input value={subject} onChange={e=>setSubject(e.target.value)} placeholder="Query regarding your vendor registration"
              style={inp()} />
          </div>
          <div>
            <label style={{ fontSize:12, fontWeight:600, color:'#374151', display:'block', marginBottom:4 }}>Message <span style={{ color:'#EF4444' }}>*</span></label>
            <textarea value={message} onChange={e=>{setMessage(e.target.value);setMsg(null);}} rows={6}
              placeholder="Type your query or request for additional information…"
              style={{ width:'100%', padding:'8px 10px', border:'1px solid #D1D5DB', borderRadius:5, fontSize:12.5, fontFamily:F, resize:'vertical', boxSizing:'border-box', outline:'none', minHeight:120 }} />
          </div>
          <div style={{ background:'#EFF6FF', border:'1px solid #BFDBFE', borderRadius:6, padding:'8px 12px', fontSize:11.5, color:'#1E40AF' }}>
            This email will be sent from the configured SMTP account and will include the vendor's tracking number.
          </div>
        </div>

        <div style={{ padding:'12px 20px', borderTop:'1px solid #E5E7EB', display:'flex', justifyContent:'flex-end', gap:8 }}>
          <button onClick={onClose} style={{ padding:'7px 18px', background:'#fff', border:'1px solid #D1D5DB', borderRadius:6, cursor:'pointer', fontSize:13, fontWeight:600, fontFamily:F }}>Cancel</button>
          <button onClick={handleSend} disabled={sending} style={{ padding:'7px 20px', background:sending?'#93C5FD':P, border:'none', borderRadius:6, cursor:sending?'not-allowed':'pointer', fontSize:13, fontWeight:700, fontFamily:F, color:'#fff', opacity:sending?0.7:1 }}>
            {sending ? '⏳ Sending…' : '📤 Send Email'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function SelfRegistrations() {
  const [regs, setRegs]           = useState([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState('');
  const [editTarget, setEditTarget]   = useState(null);
  const [queryTarget, setQueryTarget] = useState(null);
  const [rejectTarget, setRejectTarget] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [busy, setBusy]           = useState({});
  const [msg, setMsg]             = useState('');
  const { selectedCompany } = useCompany();

  useEffect(() => { fetchRegs(); }, []);

  const fetchRegs = async () => {
    setLoading(true);
    try { const r = await axios.get('/api/vendor-portal/registrations'); setRegs(r.data); }
    catch (e) { setMsg('Error: ' + e.message); }
    finally { setLoading(false); }
  };

  const handleApprove = async (reg) => {
    if (!selectedCompany) { setMsg('Please select a company from the header to assign this vendor to.'); return; }
    if (!window.confirm(`Approve "${reg.vendorName || reg.companyName}" and assign to "${selectedCompany.companyName}"?`)) return;
    setBusy(b => ({ ...b, [reg.id]: 'approving' }));
    try {
      const res = await axios.post(`/api/vendor-portal/approve/${reg.id}`, { companyId: selectedCompany.companyId });
      setMsg(`✅ Vendor approved (ID: ${res.data.vendorId}). They can now log in to the vendor portal.`);
      fetchRegs();
    } catch (e) { setMsg('Error: ' + e.message); }
    finally { setBusy(b => { const n={...b}; delete n[reg.id]; return n; }); }
  };

  const handleReject = async () => {
    if (!rejectTarget) return;
    setBusy(b => ({ ...b, [rejectTarget.id]: 'rejecting' }));
    try {
      await axios.post(`/api/vendor-portal/reject/${rejectTarget.id}`, { reason: rejectReason });
      setMsg('Vendor registration rejected.');
      setRejectTarget(null); setRejectReason('');
      fetchRegs();
    } catch (e) { setMsg('Error: ' + e.message); }
    finally { setBusy(b => { const n={...b}; delete n[rejectTarget?.id]; return n; }); }
  };

  const filtered = regs.filter(r => {
    const q = search.toLowerCase();
    return !q || (r.vendorName||r.companyName||'').toLowerCase().includes(q) || r.email.toLowerCase().includes(q) || (r.mobile||'').includes(q);
  });

  const counts = {
    total:    regs.length,
    pending:  regs.filter(r => r.status === 'self-registered').length,
    approved: regs.filter(r => r.status === 'approved').length,
    rejected: regs.filter(r => r.status === 'rejected').length,
  };

  return (
    <div style={{ fontFamily:F, display:'flex', flexDirection:'column', height:'100%', background:'#EBF0F5' }}>

      {editTarget  && <EditModal  reg={editTarget}  onClose={() => setEditTarget(null)}  onSave={() => { setEditTarget(null); fetchRegs(); }} />}
      {queryTarget && <QueryModal reg={queryTarget} onClose={() => setQueryTarget(null)} />}

      {/* Reject modal */}
      {rejectTarget && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center', fontFamily:F }}>
          <div style={{ background:'#fff', borderRadius:10, padding:24, maxWidth:420, width:'90%', boxShadow:'0 16px 48px rgba(0,0,0,0.25)' }}>
            <h3 style={{ margin:'0 0 6px', fontSize:15, color:'#1E293B' }}>Reject Registration</h3>
            <p style={{ margin:'0 0 14px', fontSize:12.5, color:'#64748b' }}>Rejecting <strong>{rejectTarget.vendorName||rejectTarget.companyName}</strong>. They will be notified.</p>
            <label style={{ fontSize:12, fontWeight:600, color:'#374151', display:'block', marginBottom:5 }}>Reason (optional)</label>
            <textarea value={rejectReason} onChange={e=>setRejectReason(e.target.value)} rows={3} placeholder="Reason for rejection…"
              style={{ width:'100%', padding:'7px 10px', border:'1px solid #D1D5DB', borderRadius:6, fontSize:12, fontFamily:F, resize:'vertical', boxSizing:'border-box', outline:'none' }} />
            <div style={{ display:'flex', justifyContent:'flex-end', gap:8, marginTop:14 }}>
              <button onClick={() => { setRejectTarget(null); setRejectReason(''); }} style={{ padding:'7px 18px', background:'#fff', border:'1px solid #D1D5DB', borderRadius:6, cursor:'pointer', fontSize:12.5, fontWeight:600, fontFamily:F }}>Cancel</button>
              <button onClick={handleReject} style={{ padding:'7px 18px', background:'#DC2626', border:'none', borderRadius:6, cursor:'pointer', fontSize:12.5, fontWeight:700, fontFamily:F, color:'#fff' }}>✕ Reject</button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{ background:HDR, padding:'10px 16px', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
        <div>
          <div style={{ fontSize:13, fontWeight:700, color:'#fff', textTransform:'uppercase', letterSpacing:'0.6px' }}>
            Vendor Self-Registrations
            {counts.pending > 0 && <span style={{ background:'#F59E0B', color:'#fff', fontSize:10, fontWeight:800, padding:'1px 8px', borderRadius:10, marginLeft:8 }}>{counts.pending} new</span>}
          </div>
          <div style={{ fontSize:10, color:'rgba(255,255,255,0.55)', marginTop:1 }}>Vendors who registered through the self-registration portal</div>
        </div>
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          <div style={{ position:'relative' }}>
            <span style={{ position:'absolute', left:8, top:'50%', transform:'translateY(-50%)', fontSize:12, color:'rgba(255,255,255,0.5)' }}>🔍</span>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search…"
              style={{ height:28, padding:'0 10px 0 28px', background:'rgba(255,255,255,0.12)', border:'1px solid rgba(255,255,255,0.25)', borderRadius:4, color:'#fff', fontSize:12, fontFamily:F, outline:'none', width:180 }} />
          </div>
          <button onClick={fetchRegs} style={{ height:28, width:28, background:'rgba(255,255,255,0.12)', border:'1px solid rgba(255,255,255,0.25)', color:'#fff', borderRadius:4, cursor:'pointer', fontSize:14 }}>↻</button>
        </div>
      </div>

      {/* KPI strip */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', background:'#fff', borderBottom:`1px solid ${BD}`, flexShrink:0 }}>
        {[
          { label:'Total',    value:counts.total,    color:'#1E293B' },
          { label:'Pending',  value:counts.pending,  color:'#D97706' },
          { label:'Approved', value:counts.approved, color:'#059669' },
          { label:'Rejected', value:counts.rejected, color:'#DC2626' },
        ].map((k, i) => (
          <div key={k.label} style={{ padding:'10px 16px', borderRight: i<3?`1px solid ${BD}`:'none' }}>
            <div style={{ fontSize:10, color:'#6B7280', fontWeight:600 }}>{k.label}</div>
            <div style={{ fontSize:20, fontWeight:800, color:k.color }}>{k.value}</div>
          </div>
        ))}
      </div>

      {msg && (
        <div style={{ margin:'8px 10px 0', padding:'7px 12px', borderRadius:6, fontSize:12, fontFamily:F,
          background: msg.includes('Error')?'#FEE2E2':'#D1FAE5',
          border:`1px solid ${msg.includes('Error')?'#FCA5A5':'#6EE7B7'}`,
          color: msg.includes('Error')?'#991B1B':'#065F46',
          display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <span>{msg}</span>
          <button onClick={()=>setMsg('')} style={{ background:'none', border:'none', cursor:'pointer', fontSize:14 }}>✕</button>
        </div>
      )}

      {!selectedCompany && (
        <div style={{ margin:'8px 10px 0', padding:'7px 12px', background:'#FFFBEB', border:'1px solid #FDE68A', borderRadius:6, fontSize:12, color:'#92400E', fontFamily:F }}>
          ⚠️ Select a company from the header to approve vendors — they will be assigned to that company.
        </div>
      )}

      <div style={{ flex:1, overflowY:'auto', padding:'10px' }}>
        {loading ? (
          <div style={{ textAlign:'center', padding:'40px', color:'#64748B', fontSize:13 }}>Loading…</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign:'center', padding:'50px', color:'#64748B', fontSize:13 }}>
            <div style={{ fontSize:32, marginBottom:8 }}>📋</div>
            <div style={{ fontWeight:700 }}>{search ? `No results for "${search}"` : 'No self-registrations yet'}</div>
            <div style={{ fontSize:12, marginTop:4 }}>Vendors can register at <strong>/vendor-register</strong></div>
          </div>
        ) : (
          <div style={{ background:'#fff', border:`1px solid ${BD}`, borderRadius:8, overflow:'hidden', boxShadow:'0 1px 3px rgba(0,0,0,0.06)' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12, fontFamily:F }}>
              <thead>
                <tr>
                  {['Vendor Name','Business Type','Email','Mobile','Tracking No.','Registered On','Status','Actions'].map(h => (
                    <th key={h} style={{ padding:'7px 10px', fontSize:11, fontWeight:700, color:'#fff', background:HDR, textAlign: h==='Actions'?'center':'left', borderRight:'1px solid rgba(255,255,255,0.12)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => {
                  const st   = STATUS_STYLE[r.status] || STATUS_STYLE['self-registered'];
                  const busy_ = !!busy[r.id];
                  return (
                    <tr key={r.id} style={{ background: i%2===0?'#fff':'#F8FAFC', borderBottom:'1px solid #EEF0F2' }}
                      onMouseEnter={e=>e.currentTarget.style.background='#EBF0F5'}
                      onMouseLeave={e=>e.currentTarget.style.background=i%2===0?'#fff':'#F8FAFC'}>
                      <td style={{ padding:'7px 10px', fontWeight:600, color:'#1E293B' }}>{r.vendorName || r.companyName || '—'}</td>
                      <td style={{ padding:'7px 10px', color:'#475569' }}>{r.businessType || '—'}</td>
                      <td style={{ padding:'7px 10px', color:'#475569' }}>{r.email}</td>
                      <td style={{ padding:'7px 10px', color:'#475569' }}>{r.mobile || '—'}</td>
                      <td style={{ padding:'7px 10px', color:'#475569', fontFamily:'monospace', fontSize:11 }}>{r.trackingNo || '—'}</td>
                      <td style={{ padding:'7px 10px', color:'#475569' }}>{new Date(r.createdAt).toLocaleDateString('en-IN')}</td>
                      <td style={{ padding:'7px 10px' }}>
                        <span style={{ padding:'2px 8px', borderRadius:12, fontSize:11, fontWeight:700, background:st.bg, color:st.color }}>{st.label}</span>
                      </td>
                      <td style={{ padding:'7px 10px', textAlign:'center', whiteSpace:'nowrap' }}>
                        <div style={{ display:'inline-flex', gap:4 }}>
                          <button onClick={() => setEditTarget(r)} style={{ padding:'3px 9px', fontSize:11, fontFamily:F, fontWeight:600, background:'#EBF0F5', border:`1px solid ${BD}`, color:HDR, borderRadius:4, cursor:'pointer' }}>
                            {r.status === 'approved' ? '👁 View' : '✏️ Edit'}
                          </button>
                          <button onClick={() => setQueryTarget(r)} style={{ padding:'3px 9px', fontSize:11, fontFamily:F, fontWeight:600, background:'#EFF6FF', border:'1px solid #BFDBFE', color:'#1D4ED8', borderRadius:4, cursor:'pointer' }}>
                            📧 Query
                          </button>
                          {r.status === 'self-registered' && (
                            <>
                              <button onClick={() => handleApprove(r)} disabled={busy_} style={{ padding:'3px 10px', fontSize:11, fontFamily:F, fontWeight:700, background:'#D1FAE5', border:'1px solid #6EE7B7', color:'#065F46', borderRadius:4, cursor:busy_?'not-allowed':'pointer', opacity:busy_?0.6:1 }}>
                                {busy[r.id]==='approving'?'…':'✓ Approve'}
                              </button>
                              <button onClick={() => { setRejectTarget(r); setRejectReason(''); }} disabled={busy_} style={{ padding:'3px 9px', fontSize:11, fontFamily:F, fontWeight:600, background:'#FEE2E2', border:'1px solid #FCA5A5', color:'#991B1B', borderRadius:4, cursor:busy_?'not-allowed':'pointer', opacity:busy_?0.6:1 }}>
                                ✕ Reject
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div style={{ padding:'6px 12px', background:'#F5F7FB', borderTop:`1px solid ${BD}`, fontSize:11, color:'#5A6475', fontFamily:F }}>
              {filtered.length} of {regs.length} registrations
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
