import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useCompany } from '../../../context/CompanyContext';

const F  = "'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif";
const P  = '#133d80';
const BD = '#E5EAF2';

const inp = (ex={}) => ({ height:34, padding:'0 10px', border:`1px solid ${BD}`, borderRadius:6, fontSize:12, fontFamily:F, outline:'none', background:'#fff', width:'100%', boxSizing:'border-box', ...ex });
const lbl = { fontSize:11, fontWeight:600, color:'#374151', marginBottom:3, display:'block' };
const card = { background:'#fff', border:`1px solid ${BD}`, borderRadius:10, overflow:'hidden', boxShadow:'0 1px 4px rgba(0,0,0,0.05)', marginBottom:14 };
const SH = (color=P) => ({ background:color, padding:'9px 14px', fontSize:11, fontWeight:700, color:'#fff', textTransform:'uppercase', letterSpacing:'0.6px' });

const DEPOSIT_TYPES = [
  { key:'BG',       label:'Bank Guarantee',   icon:'🏦', desc:'BG issued by bank on behalf of company to client' },
  { key:'EMD',      label:'EMD',               icon:'💵', desc:'Earnest Money Deposit via DD / payment' },
  { key:'FD',       label:'Fixed Deposit',     icon:'📋', desc:'FD placed as security with client or bank' },
  { key:'Security', label:'Security Deposit',  icon:'🔐', desc:'Direct security deposit / payment to client' },
];

const PAYMENT_MODES = ['Demand Draft (DD)', 'RTGS', 'NEFT', 'IMPS', 'Cheque', 'Cash'];

/* ── SO Search Popup ── */
function SOPopup({ orders, onSelect, onClose }) {
  const [q, setQ] = useState('');
  const ref = useRef();
  useEffect(() => { ref.current?.focus(); }, []);
  const list = orders.filter(o => {
    const s = (o.orderNo||'')+(o.customerName||'')+(o.customerPO||'');
    return !q || s.toLowerCase().includes(q.toLowerCase());
  });
  return (
    <div onClick={e=>e.target===e.currentTarget&&onClose()}
      style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:9000, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
      <div style={{ background:'#fff', borderRadius:12, width:'100%', maxWidth:700, maxHeight:'80vh', display:'flex', flexDirection:'column', boxShadow:'0 20px 60px rgba(0,0,0,0.25)' }}>
        <div style={{ background:P, color:'#fff', padding:'12px 16px', borderRadius:'12px 12px 0 0', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <span style={{ fontWeight:700, fontFamily:F, fontSize:13 }}>Select Sales Order</span>
          <button onClick={onClose} style={{ background:'rgba(255,255,255,0.15)', border:'none', borderRadius:6, color:'#fff', width:28, height:28, cursor:'pointer', fontSize:16 }}>✕</button>
        </div>
        <div style={{ padding:'10px 14px', borderBottom:`1px solid ${BD}` }}>
          <input ref={ref} value={q} onChange={e=>setQ(e.target.value)} placeholder="Search order no, client, PO no…" style={{ ...inp(), width:'100%' }}/>
        </div>
        <div style={{ flex:1, overflowY:'auto' }}>
          {list.length===0 && <div style={{ padding:24, textAlign:'center', color:'#9ca3af', fontFamily:F }}>No orders found</div>}
          {list.map((o,i) => (
            <div key={i} onClick={()=>{ onSelect(o); onClose(); }}
              style={{ padding:'10px 16px', borderBottom:`1px solid ${BD}`, cursor:'pointer', fontFamily:F }}
              onMouseEnter={e=>e.currentTarget.style.background='#eff6ff'}
              onMouseLeave={e=>e.currentTarget.style.background='#fff'}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                <div>
                  <div style={{ fontWeight:800, fontSize:13, color:P }}>{o.orderNo}</div>
                  <div style={{ fontSize:12, color:'#111827', marginTop:2 }}>{o.customerName}</div>
                </div>
                <div style={{ textAlign:'right' }}>
                  <div style={{ fontSize:11, color:'#6b7280' }}>PO: {o.customerPO||'—'}</div>
                  <div style={{ fontSize:11, color:'#6b7280', marginTop:2 }}>Date: {o.orderDate||'—'}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════ */
export default function DepositCreate() {
  const { selectedCompany } = useCompany();
  const cid = selectedCompany?.companyId;
  const navigate = useNavigate();
  const { depositId } = useParams(); // for edit mode
  const [searchParams] = useSearchParams();
  const presoId = searchParams.get('soId');
  const isEdit = !!depositId;

  const [orders,  setOrders]  = useState([]);
  const [clients, setClients] = useState([]);
  const [banks,   setBanks]   = useState([]);
  const [showSOPop, setShowSOPop] = useState(false);

  /* Link mode — SO or Direct Client */
  const [linkMode, setLinkMode] = useState('so'); // 'so' | 'client'
  const [directClient, setDirectClient] = useState('');

  /* Selected SO */
  const [so, setSO] = useState(null);

  /* Deposit type */
  const [depositType, setDepositType] = useState('');

  /* Common */
  const [startDate,  setStartDate]  = useState('');
  const [endDate,    setEndDate]    = useState('');
  const [remarks,    setRemarks]    = useState('');

  /* BG fields */
  const [bgNo,              setBgNo]              = useState('');
  const [expiryDate,        setExpiryDate]        = useState('');
  const [claimExpiry,       setClaimExpiry]       = useState('');
  const [pbgContact,        setPbgContact]        = useState('');
  const [bgAmount,          setBgAmount]          = useState('');
  /* Issuing bank (from our bank list) */
  const [issuingBankId,     setIssuingBankId]     = useState('');
  const [issuingBankName,   setIssuingBankName]   = useState('');
  const [issuingBankAccNo,  setIssuingBankAccNo]  = useState('');
  const [issuingBankIfsc,   setIssuingBankIfsc]   = useState('');
  /* Issued-to bank (beneficiary / client's bank — manual) */
  const [issuedToBankName,  setIssuedToBankName]  = useState('');
  const [issuedToBankIfsc,  setIssuedToBankIfsc]  = useState('');
  const [pdfFiles,          setPdfFiles]          = useState([]);
  const [uploadFile,        setUploadFile]        = useState(null);
  const [savedDepositId,    setSavedDepositId]    = useState('');

  /* EMD / FD / Security fields */
  const [amount,       setAmount]       = useState('');
  const [paymentMode,  setPaymentMode]  = useState('');
  const [paymentRef,   setPaymentRef]   = useState('');
  const [paymentBank,  setPaymentBank]  = useState('');
  const [fdNo,         setFdNo]         = useState('');
  const [interestRate, setInterestRate] = useState('');

  const [saving,  setSaving]  = useState(false);
  const [msg,     setMsg]     = useState({ text:'', ok:true });

  /* Load orders + banks */
  useEffect(() => {
    if (!cid) return;
    axios.get(`/api/sales-orders?companyId=${cid}`)
      .then(r => {
        const sos = (r.data||[]).filter(o=>o.status!=='cancelled');
        setOrders(sos);
        if (presoId) {
          const found = sos.find(o=>String(o.orderId)===String(presoId));
          if (found) setSO(found);
        }
      }).catch(()=>{});
    axios.get(`/api/clients?companyId=${cid}`)
      .then(r => setClients(r.data||[])).catch(()=>{});
    axios.get(`/api/accounts/banks?companyId=${cid}`)
      .then(r => setBanks(r.data||[])).catch(()=>{});
  }, [cid, presoId]);

  /* Load existing deposit in edit mode */
  useEffect(() => {
    if (!isEdit || !cid) return;
    axios.get(`/api/deposits/${depositId}?companyId=${cid}`).then(r => {
      const d = r.data;
      setSO({ orderId:d.soId, orderNo:d.orderNo, customerName:d.customerName, customerPO:d.customerPO, poDate:d.poDate, orderDate:d.orderDate });
      setDepositType(d.depositType||'');
      setStartDate(d.startDate||''); setEndDate(d.endDate||''); setRemarks(d.remarks||'');
      setBgNo(d.bgNo||''); setExpiryDate(d.expiryDate||''); setClaimExpiry(d.claimExpiryDate||'');
      setPbgContact(d.pbgContactNo||''); setBgAmount(d.bgAmount||d.amount||'');
      setIssuingBankId(d.issuingBankId||''); setIssuingBankName(d.issuingBankName||'');
      setIssuingBankAccNo(d.issuingBankAccNo||''); setIssuingBankIfsc(d.issuingBankIfsc||'');
      setIssuedToBankName(d.issuedToBankName||''); setIssuedToBankIfsc(d.issuedToBankIfsc||'');
      setAmount(d.amount||''); setPaymentMode(d.paymentMode||''); setPaymentRef(d.paymentRef||'');
      setPaymentBank(d.paymentBank||''); setFdNo(d.fdNo||''); setInterestRate(d.interestRate||'');
      setPdfFiles(d.pdfFiles||[]);
      setSavedDepositId(d.depositId);
    }).catch(()=>{});
  }, [isEdit, depositId, cid]);

  const [currentStatus, setCurrentStatus] = useState('pending');

  /* sync currentStatus from edit load */
  useEffect(() => {
    if (isEdit) {
      axios.get(`/api/deposits/${depositId}?companyId=${cid}`).then(r => {
        setCurrentStatus(r.data.status || 'pending');
      }).catch(() => {});
    }
  }, [isEdit, depositId, cid]);

  const handleSubmit = async () => {
    if (linkMode === 'so' && !so) { setMsg({text:'Please select a Sales Order.',ok:false}); return; }
    if (linkMode === 'client' && !directClient) { setMsg({text:'Please select a client.',ok:false}); return; }
    if (!depositType) { setMsg({text:'Please select a deposit type.',ok:false}); return; }

    /* New deposits go to pending for approval; edits preserve current status */
    const saveStatus = isEdit ? currentStatus : 'pending';

    const customerName = linkMode === 'client' ? directClient : so?.customerName;
    const payload = {
      companyId: cid,
      soId: linkMode === 'so' ? so?.orderId : null,
      orderNo: linkMode === 'so' ? so?.orderNo : null,
      customerName,
      customerPO: linkMode === 'so' ? so?.customerPO : null,
      poDate: linkMode === 'so' ? so?.poDate : null,
      orderDate: linkMode === 'so' ? so?.orderDate : null,
      depositType, startDate, endDate, remarks, status: saveStatus,
      // BG
      bgNo, expiryDate, claimExpiryDate:claimExpiry, pbgContactNo:pbgContact,
      issuingBankId, issuingBankName, issuingBankAccNo, issuingBankIfsc,
      issuedToBankName, issuedToBankIfsc,
      amount: depositType==='BG' ? bgAmount : amount,
      bgAmount: depositType==='BG' ? bgAmount : undefined,
      // EMD/FD/Security
      paymentMode, paymentRef, paymentBank, fdNo, interestRate,
    };

    try {
      setSaving(true);
      let res;
      if (isEdit) {
        res = await axios.put(`/api/deposits/${depositId}?companyId=${cid}`, payload);
      } else {
        res = await axios.post(`/api/deposits?companyId=${cid}`, payload);
      }
      const depId = res.data.depositId;
      setSavedDepositId(depId);

      /* Upload PDF if selected */
      if (uploadFile && depId) {
        const fd = new FormData();
        fd.append('file', uploadFile);
        await axios.post(`/api/deposits/${depId}/upload?companyId=${cid}`, fd);
        setUploadFile(null);
      }

      setMsg({text: isEdit
        ? `Deposit ${depId} updated.`
        : `Deposit ${depId} saved — sent for approval.`,
        ok:true});
      setTimeout(()=>navigate('/account/deposit/view'), 1400);
    } catch(e) {
      setMsg({text:'Error: '+(e.response?.data?.error||e.message),ok:false});
    } finally { setSaving(false); }
  };

  const markReleased = async () => {
    if (!isEdit) return;
    if (!window.confirm('Mark this deposit as Released?')) return;
    try {
      await axios.put(`/api/deposits/${depositId}?companyId=${cid}`, { status:'released', releasedAt: new Date().toISOString() });
      setMsg({text:'Marked as Released.',ok:true});
      setCurrentStatus('released');
    } catch(e) { setMsg({text:'Error: '+e.message, ok:false}); }
  };

  const undoRelease = async () => {
    if (!isEdit) return;
    if (!window.confirm('Undo the Release — set back to Active?')) return;
    try {
      await axios.put(`/api/deposits/${depositId}/unreleased?companyId=${cid}`, {});
      setMsg({text:'Release undone — status set back to Active.',ok:true});
      setCurrentStatus('active');
    } catch(e) { setMsg({text:'Error: '+e.message, ok:false}); }
  };

  const approveDep = async () => {
    if (!isEdit) return;
    try {
      await axios.put(`/api/deposits/${depositId}/approve?companyId=${cid}`, {});
      setMsg({text:'Deposit approved and marked Active.',ok:true});
      setCurrentStatus('active');
    } catch(e) { setMsg({text:'Error: '+e.message, ok:false}); }
  };

  return (
    <div style={{ fontFamily:F, background:'#f0f4fb', minHeight:'100vh', padding:'14px 16px' }}>

      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
        <div>
          <div style={{ fontSize:11, color:'#6b7280', marginBottom:2 }}>Account → Deposit</div>
          <div style={{ fontSize:18, fontWeight:800, color:'#111827' }}>{isEdit ? 'Edit Deposit' : 'Add Deposit'}</div>
        </div>
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          {isEdit && (
            <>
              {/* Approval status badge */}
              <span style={{ padding:'3px 12px', borderRadius:20, fontSize:11, fontWeight:700,
                background: currentStatus==='active'?'#dcfce7': currentStatus==='pending'?'#fef3c7': currentStatus==='released'?'#f3f4f6':'#fee2e2',
                color:      currentStatus==='active'?'#15803d': currentStatus==='pending'?'#92400e': currentStatus==='released'?'#6b7280':'#dc2626',
                border:`1px solid ${currentStatus==='active'?'#bbf7d0':currentStatus==='pending'?'#fde68a':currentStatus==='released'?'#d1d5db':'#fca5a5'}`,
              }}>
                {currentStatus==='pending'?'⏳ Pending Approval': currentStatus==='active'?'✓ Active': currentStatus==='released'?'Released':'Unknown'}
              </span>
              {currentStatus==='pending' && (
                <button onClick={approveDep}
                  style={{ height:34, padding:'0 16px', background:'#f0fdf4', border:'1px solid #bbf7d0', borderRadius:7, fontSize:12, fontWeight:700, color:'#15803d', cursor:'pointer', fontFamily:F }}>
                  ✓ Approve
                </button>
              )}
              {currentStatus==='active' && (
                <button onClick={markReleased}
                  style={{ height:34, padding:'0 16px', background:'#f0fdf4', border:'1px solid #bbf7d0', borderRadius:7, fontSize:12, fontWeight:700, color:'#15803d', cursor:'pointer', fontFamily:F }}>
                  ✓ Mark Released
                </button>
              )}
              {currentStatus==='released' && (
                <button onClick={undoRelease}
                  style={{ height:34, padding:'0 16px', background:'#fef3c7', border:'1px solid #fde68a', borderRadius:7, fontSize:12, fontWeight:700, color:'#92400e', cursor:'pointer', fontFamily:F }}>
                  ↩ Undo Release
                </button>
              )}
            </>
          )}
          <button onClick={()=>navigate('/account/deposit/view')}
            style={{ height:34, padding:'0 16px', background:'#fff', border:`1px solid ${BD}`, borderRadius:7, fontSize:12, cursor:'pointer', fontFamily:F }}>
            ← Back
          </button>
        </div>
      </div>

      {msg.text && (
        <div style={{ background:msg.ok?'#f0fdf4':'#fef2f2', border:`1px solid ${msg.ok?'#bbf7d0':'#fecaca'}`,
          borderRadius:8, padding:'10px 14px', marginBottom:14, fontSize:12.5, color:msg.ok?'#15803d':'#dc2626' }}>
          {msg.text}
        </div>
      )}

      {/* ── Step 1: Link Mode ── */}
      <div style={card}>
        <div style={SH()}>Link To</div>
        <div style={{ padding:'14px 16px' }}>
          {/* Toggle */}
          <div style={{ display:'flex', gap:8, marginBottom:14 }}>
            {[['so','📋 Sales Order'],['client','👤 Direct Client (No SO)']].map(([k,l])=>(
              <button key={k} onClick={()=>{ setLinkMode(k); setSO(null); setDirectClient(''); setDepositType(''); }}
                style={{ padding:'8px 18px', border:`2px solid ${linkMode===k?P:BD}`, borderRadius:8,
                  background:linkMode===k?'#eff6ff':'#fff', color:linkMode===k?P:'#6b7280',
                  fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:F }}>
                {l}
              </button>
            ))}
          </div>

          {/* Sales Order picker */}
          {linkMode === 'so' && (
            so ? (
              <div style={{ display:'grid', gridTemplateColumns:'repeat(6,1fr)', gap:12, background:'#eff6ff', border:'1px solid #bfdbfe', borderRadius:8, padding:'12px 14px', alignItems:'center' }}>
                <div>
                  <div style={{ fontSize:10, color:'#6b7280', marginBottom:2 }}>Order No</div>
                  <div style={{ fontWeight:800, fontSize:13, color:P }}>{so.orderNo}</div>
                </div>
                <div style={{ gridColumn:'span 2' }}>
                  <div style={{ fontSize:10, color:'#6b7280', marginBottom:2 }}>Client</div>
                  <div style={{ fontWeight:700, fontSize:12, color:'#111827' }}>{so.customerName}</div>
                </div>
                <div>
                  <div style={{ fontSize:10, color:'#6b7280', marginBottom:2 }}>Client PO No</div>
                  <div style={{ fontSize:12, color:'#374151' }}>{so.customerPO||'—'}</div>
                </div>
                <div>
                  <div style={{ fontSize:10, color:'#6b7280', marginBottom:2 }}>PO Date</div>
                  <div style={{ fontSize:12, color:'#374151' }}>{so.poDate||'—'}</div>
                </div>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'flex-end' }}>
                  <button onClick={()=>{ setSO(null); setDepositType(''); }}
                    style={{ background:'#fee2e2', border:'1px solid #fca5a5', borderRadius:6, color:'#dc2626', padding:'5px 12px', cursor:'pointer', fontSize:11, fontWeight:700 }}>
                    ✕ Change
                  </button>
                </div>
              </div>
            ) : (
              <button onClick={()=>setShowSOPop(true)}
                style={{ height:40, padding:'0 24px', background:P, border:'none', borderRadius:7, color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:F }}>
                📋 Select Sales Order
              </button>
            )
          )}

          {/* Direct Client picker */}
          {linkMode === 'client' && (
            <div style={{ maxWidth:400 }}>
              <label style={lbl}>Select Client *</label>
              <select value={directClient} onChange={e=>setDirectClient(e.target.value)} style={inp()}>
                <option value="">— Select client —</option>
                {clients.map((c,i)=>(
                  <option key={i} value={c.clientName||c.companyName}>{c.clientName||c.companyName}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* ── Step 2: Deposit Type ── */}
      {(so || directClient) && (
        <div style={card}>
          <div style={SH()}>Deposit Type</div>
          <div style={{ padding:'14px 16px', display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10 }}>
            {DEPOSIT_TYPES.map(({ key, label, icon, desc }) => (
              <button key={key} onClick={()=>setDepositType(key)}
                style={{ padding:'12px 14px', border:`2px solid ${depositType===key?P:BD}`, borderRadius:8,
                  background:depositType===key?'#eff6ff':'#fff', cursor:'pointer', textAlign:'left', fontFamily:F }}>
                <div style={{ fontSize:18, marginBottom:4 }}>{icon}</div>
                <div style={{ fontSize:12.5, fontWeight:800, color:depositType===key?P:'#374151', marginBottom:3 }}>{label}</div>
                <div style={{ fontSize:10, color:'#6b7280', lineHeight:1.4 }}>{desc}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ══════ BG FIELDS ══════ */}
      {depositType==='BG' && (
        <>
          <div style={card}>
            <div style={SH('#1d4ed8')}>Bank Guarantee Details</div>
            <div style={{ padding:'14px 16px', display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12 }}>
              <div>
                <label style={lbl}>BG Number *</label>
                <input value={bgNo} onChange={e=>setBgNo(e.target.value)} placeholder="BG/2026-27/001" style={inp()}/>
              </div>
              <div>
                <label style={lbl}>BG Amount (₹)</label>
                <input type="number" value={bgAmount} onChange={e=>setBgAmount(e.target.value)} placeholder="0.00" min="0" step="0.01" style={{ ...inp(), textAlign:'right' }}/>
              </div>
              <div>
                <label style={lbl}>Start Date *</label>
                <input type="date" value={startDate} onChange={e=>setStartDate(e.target.value)} style={inp()}/>
              </div>
              <div>
                <label style={lbl}>Expiry Date *</label>
                <input type="date" value={expiryDate} onChange={e=>setExpiryDate(e.target.value)} style={inp()}/>
              </div>
              <div>
                <label style={lbl}>Claim Expiry Date</label>
                <input type="date" value={claimExpiry} onChange={e=>setClaimExpiry(e.target.value)} style={inp()}/>
              </div>
              <div>
                <label style={lbl}>PBG Contact No</label>
                <input value={pbgContact} onChange={e=>setPbgContact(e.target.value)} placeholder="Bank contact person / number" style={inp()}/>
              </div>
              <div style={{ gridColumn:'span 3' }}>
                <label style={lbl}>Remarks</label>
                <input value={remarks} onChange={e=>setRemarks(e.target.value)} placeholder="Notes…" style={inp()}/>
              </div>
            </div>
          </div>

          {/* Issuing Bank (our bank) */}
          <div style={card}>
            <div style={SH('#104f4f')}>Issuing Bank — Our Bank Account</div>
            <div style={{ padding:'14px 16px' }}>
              <div style={{ marginBottom:12 }}>
                <label style={lbl}>Select Our Bank *</label>
                <select value={issuingBankId} onChange={e => {
                  const sel = banks.find(b=>String(b.bankId)===e.target.value);
                  setIssuingBankId(e.target.value);
                  setIssuingBankName(sel?.bankName||'');
                  setIssuingBankAccNo(sel?.accountNumber||'');
                  setIssuingBankIfsc(sel?.ifscCode||'');
                }} style={inp()}>
                  <option value="">— Select bank account —</option>
                  {banks.map(b => (
                    <option key={b.bankId} value={String(b.bankId)}>
                      {b.bankName} — A/C {b.accountNumber} ({b.accountType||'Current'})
                    </option>
                  ))}
                </select>
              </div>
              {issuingBankId && (
                <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12, background:'#eff6ff', border:'1px solid #bfdbfe', borderRadius:8, padding:'10px 14px' }}>
                  <div>
                    <div style={{ fontSize:10, color:'#6b7280', marginBottom:2 }}>Bank Name</div>
                    <div style={{ fontSize:12, fontWeight:700, color:'#1e40af' }}>{issuingBankName}</div>
                  </div>
                  <div>
                    <div style={{ fontSize:10, color:'#6b7280', marginBottom:2 }}>Account Number</div>
                    <div style={{ fontSize:12, fontWeight:600, color:'#374151' }}>{issuingBankAccNo}</div>
                  </div>
                  <div>
                    <div style={{ fontSize:10, color:'#6b7280', marginBottom:2 }}>IFSC Code</div>
                    <div style={{ fontSize:12, fontWeight:600, color:'#374151' }}>{issuingBankIfsc||'—'}</div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Issued To Bank (beneficiary / client's bank) */}
          <div style={card}>
            <div style={SH('#104f4f')}>Issued To — Beneficiary Bank Details</div>
            <div style={{ padding:'14px 16px', display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
              <div>
                <label style={lbl}>Beneficiary Bank Name *</label>
                <input value={issuedToBankName} onChange={e=>setIssuedToBankName(e.target.value)}
                  placeholder="e.g. HDFC Bank, New Delhi Branch" style={inp()}/>
              </div>
              <div>
                <label style={lbl}>Beneficiary Bank IFSC Code</label>
                <input value={issuedToBankIfsc} onChange={e=>setIssuedToBankIfsc(e.target.value.toUpperCase())}
                  placeholder="e.g. HDFC0001234" style={{ ...inp(), textTransform:'uppercase', letterSpacing:'1px' }}/>
              </div>
            </div>
          </div>

          {/* BG PDF Upload */}
          <div style={card}>
            <div style={SH('#1d4ed8')}>BG Document Upload</div>
            <div style={{ padding:'14px 16px' }}>
              {pdfFiles.length > 0 && (
                <div style={{ marginBottom:12 }}>
                  <div style={{ fontSize:11, fontWeight:600, color:'#374151', marginBottom:6 }}>Uploaded Documents</div>
                  {pdfFiles.map((f,i) => (
                    <div key={i} style={{ display:'flex', alignItems:'center', gap:10, padding:'6px 12px', background:'#f0f4fb', borderRadius:6, marginBottom:4 }}>
                      <span style={{ fontSize:14 }}>📄</span>
                      <span style={{ fontSize:12, color:'#374151', flex:1 }}>{f.name}</span>
                      <a href={`/api/deposits/${savedDepositId||depositId}/docs/${f.file}?companyId=${cid}`}
                        target="_blank" rel="noreferrer"
                        style={{ fontSize:11, color:P, fontWeight:600, textDecoration:'none' }}>Download</a>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ display:'flex', gap:10, alignItems:'center' }}>
                <label style={{ flex:1 }}>
                  <div style={{ border:`2px dashed ${BD}`, borderRadius:8, padding:'16px 20px', textAlign:'center', cursor:'pointer', background:uploadFile?'#f0fdf4':'#fafafa' }}>
                    <div style={{ fontSize:20, marginBottom:4 }}>📎</div>
                    <div style={{ fontSize:12, color:'#374151', fontWeight:600 }}>{uploadFile ? uploadFile.name : 'Click to upload BG PDF'}</div>
                    <div style={{ fontSize:11, color:'#9ca3af', marginTop:2 }}>PDF, max 20MB</div>
                  </div>
                  <input type="file" accept=".pdf,.jpg,.jpeg,.png" style={{ display:'none' }} onChange={e=>setUploadFile(e.target.files[0]||null)}/>
                </label>
                {uploadFile && (
                  <button onClick={()=>setUploadFile(null)} style={{ background:'#fee2e2', border:'1px solid #fca5a5', borderRadius:6, color:'#dc2626', padding:'6px 12px', cursor:'pointer', fontSize:12, fontWeight:700 }}>✕</button>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* ══════ EMD FIELDS ══════ */}
      {depositType==='EMD' && (
        <div style={card}>
          <div style={SH('#92400e')}>EMD Details</div>
          <div style={{ padding:'14px 16px', display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12 }}>
            <div>
              <label style={lbl}>EMD Amount (₹) *</label>
              <input type="number" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="0.00" min="0" step="0.01" style={{ ...inp(), textAlign:'right' }}/>
            </div>
            <div>
              <label style={lbl}>Payment Mode *</label>
              <select value={paymentMode} onChange={e=>setPaymentMode(e.target.value)} style={inp()}>
                <option value="">Select…</option>
                {PAYMENT_MODES.map(m=><option key={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>DD No / Transaction Ref</label>
              <input value={paymentRef} onChange={e=>setPaymentRef(e.target.value)} placeholder="DD No. or UTR / Ref No." style={inp()}/>
            </div>
            <div>
              <label style={lbl}>Bank Name</label>
              <input value={paymentBank} onChange={e=>setPaymentBank(e.target.value)} placeholder="Issuing bank" style={inp()}/>
            </div>
            <div>
              <label style={lbl}>Submission Date *</label>
              <input type="date" value={startDate} onChange={e=>setStartDate(e.target.value)} style={inp()}/>
            </div>
            <div>
              <label style={lbl}>Expected Return Date</label>
              <input type="date" value={endDate} onChange={e=>setEndDate(e.target.value)} style={inp()}/>
            </div>
            <div style={{ gridColumn:'span 3' }}>
              <label style={lbl}>Remarks</label>
              <input value={remarks} onChange={e=>setRemarks(e.target.value)} placeholder="Notes…" style={inp()}/>
            </div>
          </div>
        </div>
      )}

      {/* ══════ FD FIELDS ══════ */}
      {depositType==='FD' && (
        <div style={card}>
          <div style={SH('#15803d')}>Fixed Deposit Details</div>
          <div style={{ padding:'14px 16px', display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12 }}>
            <div>
              <label style={lbl}>FD Amount (₹) *</label>
              <input type="number" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="0.00" min="0" step="0.01" style={{ ...inp(), textAlign:'right' }}/>
            </div>
            <div>
              <label style={lbl}>FD Number</label>
              <input value={fdNo} onChange={e=>setFdNo(e.target.value)} placeholder="FD receipt / number" style={inp()}/>
            </div>
            <div>
              <label style={lbl}>Bank Name *</label>
              <input value={paymentBank} onChange={e=>setPaymentBank(e.target.value)} placeholder="Bank where FD is held" style={inp()}/>
            </div>
            <div>
              <label style={lbl}>Start Date *</label>
              <input type="date" value={startDate} onChange={e=>setStartDate(e.target.value)} style={inp()}/>
            </div>
            <div>
              <label style={lbl}>Maturity / End Date *</label>
              <input type="date" value={endDate} onChange={e=>setEndDate(e.target.value)} style={inp()}/>
            </div>
            <div>
              <label style={lbl}>Interest Rate (%)</label>
              <input type="number" value={interestRate} onChange={e=>setInterestRate(e.target.value)} placeholder="e.g. 7.5" step="0.01" style={{ ...inp(), textAlign:'right' }}/>
            </div>
            <div style={{ gridColumn:'span 3' }}>
              <label style={lbl}>Remarks</label>
              <input value={remarks} onChange={e=>setRemarks(e.target.value)} placeholder="Notes…" style={inp()}/>
            </div>
          </div>
        </div>
      )}

      {/* ══════ SECURITY DEPOSIT FIELDS ══════ */}
      {depositType==='Security' && (
        <div style={card}>
          <div style={SH('#7c3aed')}>Security Deposit Details</div>
          <div style={{ padding:'14px 16px', display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12 }}>
            <div>
              <label style={lbl}>Amount (₹) *</label>
              <input type="number" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="0.00" min="0" step="0.01" style={{ ...inp(), textAlign:'right' }}/>
            </div>
            <div>
              <label style={lbl}>Payment Mode *</label>
              <select value={paymentMode} onChange={e=>setPaymentMode(e.target.value)} style={inp()}>
                <option value="">Select…</option>
                {PAYMENT_MODES.map(m=><option key={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Payment Ref / DD No</label>
              <input value={paymentRef} onChange={e=>setPaymentRef(e.target.value)} placeholder="Reference number" style={inp()}/>
            </div>
            <div>
              <label style={lbl}>Bank Name</label>
              <input value={paymentBank} onChange={e=>setPaymentBank(e.target.value)} placeholder="Bank name" style={inp()}/>
            </div>
            <div>
              <label style={lbl}>Deposit Date *</label>
              <input type="date" value={startDate} onChange={e=>setStartDate(e.target.value)} style={inp()}/>
            </div>
            <div>
              <label style={lbl}>Expected Return Date</label>
              <input type="date" value={endDate} onChange={e=>setEndDate(e.target.value)} style={inp()}/>
            </div>
            <div style={{ gridColumn:'span 3' }}>
              <label style={lbl}>Remarks</label>
              <input value={remarks} onChange={e=>setRemarks(e.target.value)} placeholder="Notes…" style={inp()}/>
            </div>
          </div>
        </div>
      )}

      {/* Actions */}
      {(so || directClient) && depositType && (
        <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
          <button onClick={()=>navigate('/account/deposit/view')}
            style={{ height:36, padding:'0 20px', background:'#fff', border:`1px solid ${BD}`, borderRadius:7, fontSize:12.5, cursor:'pointer', fontFamily:F }}>Cancel</button>
          <button onClick={()=>handleSubmit()} disabled={saving}
            style={{ height:36, padding:'0 28px', background:P, border:'none', borderRadius:7, fontSize:12.5, fontWeight:700, color:'#fff', cursor:'pointer', fontFamily:F }}>
            {saving ? 'Saving…' : isEdit ? 'Update Deposit' : 'Save & Send for Approval'}
          </button>
        </div>
      )}

      {showSOPop && <SOPopup orders={orders} onSelect={o=>setSO(o)} onClose={()=>setShowSOPop(false)}/>}
    </div>
  );
}
