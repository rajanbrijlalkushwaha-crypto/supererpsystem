import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { useCompany } from '../../../context/CompanyContext';

const F   = "'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif";
const P   = '#133d80';
const BD  = '#E5EAF2';

const fmtD = d => d ? new Date(d).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' }) : '—';

/* DD.MM.YYYY */
const fmtDot = d => {
  if (!d) return '';
  const dt = new Date(d);
  if (isNaN(dt)) return d;
  return `${String(dt.getDate()).padStart(2,'0')}.${String(dt.getMonth()+1).padStart(2,'0')}.${dt.getFullYear()}`;
};

/* DD-MM-YYYY */
const fmtDash = d => {
  if (!d) return '';
  const dt = new Date(d);
  if (isNaN(dt)) return d;
  return `${String(dt.getDate()).padStart(2,'0')}-${String(dt.getMonth()+1).padStart(2,'0')}-${dt.getFullYear()}`;
};

/* FY based on TODAY (April-March) → "25-26" */
const getFY = () => {
  const d = new Date();
  const m = d.getMonth() + 1;
  const y = d.getFullYear();
  const s = m >= 4 ? y : y - 1;
  return `${String(s).slice(2)}-${String(s+1).slice(2)}`;
};

/* "30-06-2026" */
const todayDash = () => fmtDash(new Date());

const TYPE_COLOR = {
  BG:       { bg:'#dbeafe', color:'#1d4ed8' },
  EMD:      { bg:'#fef9c3', color:'#92400e' },
  FD:       { bg:'#dcfce7', color:'#15803d' },
  Security: { bg:'#f3e8ff', color:'#7c3aed' },
};

function depositStatus(dep) {
  if (dep.status === 'released') return { label:'Released',         bg:'#f3f4f6', color:'#6b7280', border:'#d1d5db' };
  if (dep.status === 'pending')  return { label:'Pending Approval', bg:'#fef3c7', color:'#92400e', border:'#fde68a' };
  if (dep.status === 'claimed')  return { label:'Claimed',          bg:'#fef3c7', color:'#92400e', border:'#fde68a' };
  const exp = dep.expiryDate || dep.endDate;
  if (!exp) return { label:'Active', bg:'#dcfce7', color:'#15803d', border:'#bbf7d0' };
  const days = Math.ceil((new Date(exp) - new Date()) / 86400000);
  if (days < 0)   return { label:'Expired',         bg:'#fee2e2', color:'#dc2626', border:'#fca5a5' };
  if (days <= 30) return { label:`Exp in ${days}d`, bg:'#fef3c7', color:'#b45309', border:'#fde68a' };
  if (days <= 90) return { label:`Exp in ${days}d`, bg:'#fff7ed', color:'#c2410c', border:'#fed7aa' };
  return { label:'Active', bg:'#dcfce7', color:'#15803d', border:'#bbf7d0' };
}

const FILTERS = ['All','BG','EMD','FD','Security'];

const CO_NAME = 'Epsilon Enterprise';

/* ═══════════════════════════════════════════════════════════
   SHARED BASE CSS  — plain letter, no header block
═══════════════════════════════════════════════════════════ */
/*
  Letters are printed on physical Epsilon letterhead paper:
    - Top ~52mm: pre-printed logo (leave blank)
    - Bottom ~25mm: pre-printed address footer (leave blank)
  So the HTML has large top/bottom padding and NO company info in body.
*/
const BASE_CSS = `
* { margin:0; padding:0; box-sizing:border-box; }
body {
  font-family: 'Times New Roman', Times, serif;
  font-size: 12pt;
  color: #000;
  /* top: clear pre-printed logo area; bottom: clear footer */
  padding: 52mm 22mm 28mm;
  line-height: 1.4;
}
.top-right {
  text-align: right;
  margin-bottom: 20px;
  font-size: 11.5pt;
  line-height: 1.9;
}
.to-block {
  margin-bottom: 16px;
  font-size: 11.5pt;
  line-height: 1.8;
}
.contract-line {
  font-size: 12pt;
  margin-bottom: 12px;
}
.subject {
  font-size: 12pt;
  font-weight: bold;
  text-decoration: underline;
  margin: 14px 0 14px;
}
p {
  font-size: 11.5pt;
  line-height: 1.7;
  margin-bottom: 10px;
}
table {
  width: 100%;
  border-collapse: collapse;
  margin: 14px 0;
  font-size: 11pt;
}
table th {
  border: 1pt solid #000;
  padding: 6px 10px;
  font-weight: bold;
  text-align: center;
  background: #f5f5f5;
}
table td {
  border: 1pt solid #000;
  padding: 6px 10px;
  vertical-align: top;
}
.sig-row {
  display: flex;
  justify-content: space-between;
  margin-top: 44px;
  font-size: 11.5pt;
}
.sig-col { width: 46%; }
.auth-row {
  display: flex;
  justify-content: space-between;
  margin-top: 52px;
  font-size: 11.5pt;
}
.bold { font-weight: bold; }
.underline { text-decoration: underline; }
@media print {
  @page { size: A4; margin: 0; }
  body { padding: 52mm 22mm 28mm; }
}
`;

function printLetter(html) {
  const w = window.open('', '_blank', 'width=860,height=720');
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 600);
}

/* ─────────────────────────────────────────────────
   1. COVER LETTER — client name+address, order items
───────────────────────────────────────────────── */
function buildCoverLetter(dep, so) {
  const fy = getFY();
  const ref = `EE/BG/Sub/${fy}/`;

  /* Support both C2 (party/voucherNumber/date/quantity) and C3 (customerName/orderNo/orderDate/qty) */
  const clientName = dep.customerName || so?.customerName || so?.party || '';
  const clientAddr = dep.clientAddress || so?.address || so?.shipToAddress || '';
  const contractNo = dep.contractNo   || so?.customerPO || so?.reference || '';
  const contractDt = dep.contractDate || so?.orderDate  || so?.poDate || so?.date || '';
  const orderNo    = so?.orderNo || so?.voucherNumber || dep.orderNo || '';
  const orderDate  = so?.orderDate || so?.date || '';

  const addrLines = clientAddr
    ? clientAddr.split('\n').map(l => l.trim()).filter(Boolean).join('<br>')
    : '';

  /* Items — handle both qty/quantity and amount vs computed */
  const rawItems = so?.items || dep.items || [];
  const items = rawItems.map(it => {
    const qty  = parseFloat(it.qty || it.quantity || 0);
    const rate = parseFloat(it.rate || it.unitPrice || 0);
    const amt  = parseFloat(it.amount || it.total || (qty * rate) || 0);
    const desc = [it.itemName, it.description].filter(Boolean).join(' — ');
    return { desc, qty, unit: it.unit || it.uom || '', rate, amt };
  });

  const grandTotal = items.reduce((s, it) => s + (it.amt || 0), 0);

  const itemRows = items.length
    ? items.map((it, i) => `<tr>
        <td style="text-align:center">${i + 1}</td>
        <td>${it.desc}</td>
        <td style="text-align:center">${it.qty || ''} ${it.unit}</td>
        <td style="text-align:right">${it.rate ? Number(it.rate).toLocaleString('en-IN') : ''}</td>
        <td style="text-align:right">${it.amt ? Number(it.amt).toLocaleString('en-IN') : ''}</td>
      </tr>`).join('')
    : `<tr><td colspan="5" style="text-align:center;color:#888;padding:10px">No items on this order</td></tr>`;

  const bgAmt = dep.bgAmount || dep.amount || '';

  const bgRows = [
    ['Contract No.',               contractNo],
    ['Contract Date',              fmtDash(contractDt)],
    ['Order No.',                  orderNo],
    ['Order Date',                 fmtDash(orderDate)],
    ['Bank Guarantee No.',         dep.bgNo || ''],
    ['Bank Guarantee Date',        fmtDash(dep.startDate)],
    ['Bank Guarantee Amount',      bgAmt ? Number(bgAmt).toLocaleString('en-IN') : ''],
    ['Bank Guarantee Expiry Date', fmtDash(dep.expiryDate)],
    ['Remarks (if any)',           dep.remarks || ''],
  ];

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Cover Letter – BG Submission</title>
<style>${BASE_CSS}
.sec { font-size:11pt; font-weight:bold; margin:16px 0 5px; text-decoration:underline; }
</style></head><body>
<div class="top-right">
  Ref: ${ref}<br>
  Date: ${todayDash()}
</div>
<div class="to-block">
  To,<br>
  <strong>${clientName}</strong><br>
  ${addrLines}
</div>
<div class="contract-line">Contract No.:- ${contractNo}</div>
<div class="subject">Sub: Submission of Bank Guarantee</div>
<p>Dear Sir/Ma'am</p>
<p>As per above subjected please confirm receiving of bank guarantee and kindly note the order details as per given below:-</p>

<div class="sec">Order / Supply Details</div>
<table>
  <tr>
    <th style="width:38px;text-align:center">Sr.</th>
    <th style="text-align:left">Description</th>
    <th style="width:75px;text-align:center">Qty</th>
    <th style="width:95px;text-align:right">Rate (₹)</th>
    <th style="width:105px;text-align:right">Amount (₹)</th>
  </tr>
  ${itemRows}
  ${grandTotal ? `<tr>
    <td colspan="4" style="text-align:right;font-weight:bold;border-top:1.5pt solid #000">Grand Total</td>
    <td style="text-align:right;font-weight:bold;border-top:1.5pt solid #000">${Number(grandTotal).toLocaleString('en-IN')}</td>
  </tr>` : ''}
</table>

<div class="sec">Bank Guarantee Details</div>
<table>
  ${bgRows.map(([p,d],i)=>`<tr><td style="width:46%">${i+1}.&nbsp; ${p}</td><td>${d}</td></tr>`).join('')}
</table>

<p>Please sign and return back original copy of this letter <strong>or</strong> in e-mail scan copy.</p>
<div class="sig-row">
  <div class="sig-col">For, ${CO_NAME}</div>
  <div class="sig-col">For, ${clientName}</div>
</div>
<div class="auth-row">
  <div class="sig-col">Authorized Signatory</div>
  <div class="sig-col">Authorized Signatory</div>
</div>
</body></html>`;
}

/* ─────────────────────────────────────────────────
   2. CRL FOR BANK  — matches uploaded PDF exactly
───────────────────────────────────────────────── */
function buildCRLBank(dep, so) {
  const fy        = getFY();
  const bankShort = (dep.issuingBankName || 'BG').split(' ')[0].toUpperCase().slice(0, 6);
  const ref       = `EE/${bankShort}/CG/${fy}/`;
  const clientName = dep.customerName    || so?.customerName || '';
  const bankName   = dep.issuingBankName || '';
  const bankAddr   = dep.issuingBankAddr || '';
  const accNo      = dep.issuingBankAccNo || '006405007463';
  const amt        = dep.bgAmount || dep.amount;

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>CRL – Close BG &amp; Release FD</title>
<style>${BASE_CSS}
table td.center { text-align:center; }
.fd-line { margin-top:8px; font-size:10.5pt; color:#444; }
.fd-blank { display:inline-block; width:140px; border-bottom:1pt solid #000; margin-top:2px; }
</style></head><body>
<div class="top-right">
  Ref No: ${ref}<br>
  Date:${todayDash()}
</div>
<div class="to-block">
  To,<br>
  The Branch Manager<br>
  ${bankName}${bankAddr ? ',<br>' + bankAddr.split('\n').join(',<br>') : ''}
</div>
<div class="subject">Sub: Request for Close BG and Remove Lein and relase FD</div>
<p>Dear Sir/Ma'am</p>
<p>As per above subjected please closed our FD which is associate with BG and release payment as per details given below: -</p>
<table>
  <tr>
    <th style="width:48px">Sr<br>No.</th>
    <th style="width:80px">PBG<br>Date</th>
    <th>PBG No.</th>
    <th>Favoring of</th>
    <th style="width:80px">Amount</th>
    <th style="width:72px">Expiry<br>Date</th>
  </tr>
  <tr style="height:110px">
    <td class="center" style="vertical-align:top;padding-top:8px">01</td>
    <td class="center" style="vertical-align:top;padding-top:8px">${fmtDot(dep.startDate)}</td>
    <td style="vertical-align:top;padding-top:8px">
      ${dep.bgNo || ''}
      <div class="fd-line">Linked FD No.<br><span class="fd-blank"></span></div>
    </td>
    <td style="vertical-align:top;padding-top:8px">${clientName}</td>
    <td class="center" style="vertical-align:top;padding-top:8px">${amt ? Number(amt).toLocaleString('en-IN') + '/-' : ''}</td>
    <td class="center" style="vertical-align:top;padding-top:8px">${fmtDot(dep.expiryDate)}</td>
  </tr>
</table>
<p>And Release our BG Amount as per Bank details given below:</p>
<p>Beneficiary Name: <strong>${CO_NAME}</strong><br>
A/c. No: - ${accNo}</p>
<p><strong><span class="underline">Enclosed: Original BG with Client Letter and</span></strong></p>
</body></html>`;
}

/* ─────────────────────────────────────────────────
   3. RFCL  — placeholder until PDF uploaded
───────────────────────────────────────────────── */
function buildRFCL(dep, so) {
  const fy         = getFY();
  const ref        = `EE/PBG/RL/${fy}/`;
  const clientName = dep.customerName || so?.customerName || '';
  const clientAddr = dep.clientAddress || '';
  const contractNo = dep.contractNo   || so?.customerPO   || '';
  const contractDt = dep.contractDate || so?.poDate        || '';

  const rows = [
    ['1A', 'Contract No.',           contractNo],
    ['1B', 'SAP PO No.',             dep.sapPoNo || 'Not Applicable'],
    ['2',  'Contract Date',          fmtDash(contractDt)],
    ['3',  'PBG No.',                dep.bgNo || ''],
    ['4',  'Amount',                 dep.bgAmount || dep.amount || ''],
    ['5',  'PBG Date',               fmtDash(dep.startDate)],
    ['6',  'PBG Expiry Date',        fmtDash(dep.expiryDate)],
    ['7',  'PBG Claim Expiry Date',  fmtDash(dep.claimExpiryDate)],
  ];

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>RFCL – Request for PBG Release</title>
<style>${BASE_CSS}</style></head><body>
<div class="top-right">
  Ref No.: ${ref}<br>
  Date: ${todayDash()}
</div>
<div class="to-block">
  To,<br>
  ${clientAddr ? clientAddr.split('\n').join('<br>') : clientName}
</div>
<div class="subject">Sub: Request for PBG Original Copy with Release Letter</div>
<p>Dear Sir/Ma'am</p>
<p>As per above subjected and Contract no. ${contractNo} dtd:${fmtDash(contractDt)}, We have submitted the bank guarantee as per details given below:</p>
<table>
  <tr><th style="width:48px">Sr No.</th><th style="width:46%">Particulars</th><th>Description</th></tr>
  ${rows.map(([sr,p,d])=>`<tr><td style="text-align:center">${sr}</td><td>${p}</td><td>${d}</td></tr>`).join('')}
</table>
<p><strong><span class="underline">So, PBG has been expired on ${fmtDash(dep.expiryDate)}</span></strong></p>
<p>Hence, we are requesting you to please release the original BG copy along with release letter to the address given below:</p>
<p>
  <strong>${CO_NAME}</strong><br>
  502, Sungrace, Gandhinagar Highway, Motera, Ahmedabad, Gujarat – 380005<br>
  M: +91-9328927032 &nbsp;|&nbsp; Email: Tender@epsilonprefab.org
</p>
</body></html>`;
}

/* ═══════════════════════════════════════════════════════════
   CONTEXT MENU — fixed at mouse click, BG rows only
═══════════════════════════════════════════════════════════ */
function ContextMenu({ dep, so, x, y, onClose, onEdit, onApprove, onMarkRelease, onUndoRelease }) {
  const ref = useRef();

  useEffect(() => {
    const close = e => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [onClose]);

  const menuW = 272;
  const left  = Math.min(x, window.innerWidth  - menuW - 16);
  const top   = Math.min(y + 4, window.innerHeight - 290);

  const items = [
    { icon:'📄', label:'Print RFCL  (Request for Release)',     fn:() => { onClose(); printLetter(buildRFCL(dep, so)); } },
    { icon:'📋', label:'Print Cover Letter  (BG Submission)',   fn:() => { onClose(); printLetter(buildCoverLetter(dep, so)); } },
    { icon:'🏦', label:'Print CRL  (Close BG / Release FD)',    fn:() => { onClose(); printLetter(buildCRLBank(dep, so)); } },
    null,
    { icon:'✏️', label:'Edit Deposit', fn: onEdit },
    ...(dep.status==='pending'  ? [{ icon:'✓', label:'Approve Deposit',  fn: onApprove    }] : []),
    ...(dep.status==='active'   ? [{ icon:'✓', label:'Mark as Released', fn: onMarkRelease }] : []),
    ...(dep.status==='released' ? [{ icon:'↩', label:'Undo Release',     fn: onUndoRelease }] : []),
  ];

  return (
    <div ref={ref}
      onClick={e => e.stopPropagation()}
      style={{
        position:'fixed', left, top, zIndex:9999,
        background:'#fff', border:'1px solid #e2e8f0', borderRadius:9,
        boxShadow:'0 10px 36px rgba(0,0,0,0.17)', minWidth:menuW, overflow:'hidden',
      }}>
      <div style={{ padding:'6px 14px 5px', fontSize:10, fontWeight:700, color:'#9ca3af', letterSpacing:.5, borderBottom:'1px solid #f1f5f9', background:'#fafbff' }}>
        {dep.bgNo || 'BG'} &nbsp;·&nbsp; {dep.customerName || so?.customerName || ''}
      </div>
      {items.map((item, i) =>
        item === null ? (
          <div key={i} style={{ height:1, background:'#f1f5f9' }}/>
        ) : (
          <div key={i} onClick={item.fn}
            style={{ padding:'9px 16px', cursor:'pointer', fontSize:12.5, fontFamily:F, color:'#111827', display:'flex', alignItems:'center', gap:9 }}
            onMouseEnter={e=>e.currentTarget.style.background='#f5f8ff'}
            onMouseLeave={e=>e.currentTarget.style.background='#fff'}>
            <span style={{ fontSize:14, minWidth:18 }}>{item.icon}</span>
            {item.label}
          </div>
        )
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   MAIN PAGE
═══════════════════════════════════════════════════════════ */
export default function DepositView() {
  const { selectedCompany } = useCompany();
  const cid = selectedCompany?.companyId;
  const navigate = useNavigate();

  const [orders,   setOrders]   = useState([]);
  const [deposits, setDeposits] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [filter,   setFilter]   = useState('All');
  const [search,   setSearch]   = useState('');
  const [menu,     setMenu]     = useState(null);

  const load = useCallback(() => {
    if (!cid) return;
    setLoading(true);
    Promise.all([
      axios.get(`/api/sales-orders?companyId=${cid}`).then(r=>r.data||[]).catch(()=>[]),
      axios.get(`/api/deposits?companyId=${cid}`).then(r=>r.data||[]).catch(()=>[]),
    ]).then(([sos, deps]) => {
      setOrders(sos.filter(o=>o.status!=='cancelled'));
      setDeposits(deps);
    }).finally(()=>setLoading(false));
  }, [cid]);

  useEffect(()=>{ load(); }, [load]);

  useEffect(()=>{
    const close = ()=>setMenu(null);
    document.addEventListener('scroll', close, true);
    return ()=>document.removeEventListener('scroll', close, true);
  },[]);

  const rows = useMemo(() => {
    const seenSOs = new Set();
    const result  = [];
    deposits.forEach(dep => {
      const so = orders.find(o=>String(o.orderId)===String(dep.soId));
      result.push({ so:so||null, dep });
      if (dep.soId) seenSOs.add(String(dep.soId));
    });
    if (filter==='All') {
      orders.forEach(so => {
        if (!seenSOs.has(String(so.orderId))) result.push({ so, dep:null });
      });
    }
    result.sort((a,b)=>{
      const ae = a.dep?.expiryDate||a.dep?.endDate||'';
      const be = b.dep?.expiryDate||b.dep?.endDate||'';
      if (!ae&&!be) return 0; if (!ae) return 1; if (!be) return -1;
      return new Date(ae)-new Date(be);
    });
    return result;
  }, [orders, deposits, filter]);

  const filtered = useMemo(()=>{
    let r = rows;
    if (filter!=='All') r = r.filter(x=>x.dep?.depositType===filter);
    if (search) {
      const q = search.toLowerCase();
      r = r.filter(x=>
        (x.so?.orderNo||'').toLowerCase().includes(q)||
        (x.so?.customerName||'').toLowerCase().includes(q)||
        (x.dep?.bgNo||'').toLowerCase().includes(q)||
        (x.dep?.customerName||'').toLowerCase().includes(q)
      );
    }
    return r;
  }, [rows, filter, search]);

  const summary = useMemo(()=>{
    const exp30   = deposits.filter(d=>{ const e=d.expiryDate||d.endDate; if(!e||d.status==='released')return false; const days=Math.ceil((new Date(e)-new Date())/86400000); return days>=0&&days<=30; }).length;
    const expired = deposits.filter(d=>{ const e=d.expiryDate||d.endDate; if(!e||d.status==='released')return false; return new Date(e)<new Date(); }).length;
    const pending = deposits.filter(d=>d.status==='pending').length;
    return { total:deposits.length, bg:deposits.filter(d=>d.depositType==='BG').length, exp30, expired, pending };
  }, [deposits]);

  const quickApprove = async dep => {
    try { await axios.put(`/api/deposits/${dep.depositId}/approve?companyId=${cid}`,{}); load(); }
    catch(e){ alert('Error: '+e.message); }
  };
  const quickRelease = async dep => {
    if (!window.confirm('Mark this deposit as Released?')) return;
    try { await axios.put(`/api/deposits/${dep.depositId}?companyId=${cid}`,{ status:'released', releasedAt:new Date().toISOString() }); load(); }
    catch(e){ alert('Error: '+e.message); }
  };
  const quickUndo = async dep => {
    if (!window.confirm('Undo the Release — set back to Active?')) return;
    try { await axios.put(`/api/deposits/${dep.depositId}/unreleased?companyId=${cid}`,{}); load(); }
    catch(e){ alert('Error: '+e.message); }
  };

  /* FIX: stopPropagation so outer div onClick doesn't kill the menu */
  const handleRowClick = (e, dep, so) => {
    if (!dep) return;
    e.stopPropagation();
    if (dep.depositType === 'BG') {
      setMenu({ dep, so, x:e.clientX, y:e.clientY });
    } else {
      navigate(`/account/deposit/edit/${dep.depositId}?companyId=${cid}`);
    }
  };

  return (
    <div style={{ fontFamily:F, background:'#f0f4fb', minHeight:'100%', padding:'14px 16px' }}
      onClick={()=>setMenu(null)}>

      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
        <div>
          <div style={{ fontSize:11, color:'#6b7280', marginBottom:2 }}>Account → Deposit</div>
          <div style={{ fontSize:18, fontWeight:800, color:'#111827' }}>Deposits &amp; Bank Guarantees</div>
          <div style={{ fontSize:11, color:'#6b7280', marginTop:2 }}>
            Sorted by nearest expiry · Click a BG row to print / edit / approve
          </div>
        </div>
        <button onClick={e=>{e.stopPropagation();navigate('/account/deposit/create');}}
          style={{ height:36, padding:'0 20px', background:P, border:'none', borderRadius:7, color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:F }}>
          + Add Deposit
        </button>
      </div>

      {/* Summary cards */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:10, marginBottom:14 }}>
        {[
          ['Total Deposits',    summary.total,   '#1d4ed8'],
          ['Bank Guarantees',   summary.bg,      '#1e40af'],
          ['Pending Approval',  summary.pending,  '#92400e'],
          ['Expiring ≤30 Days', summary.exp30,   '#92400e'],
          ['Expired',           summary.expired,  '#dc2626'],
        ].map(([label,val,color])=>(
          <div key={label} style={{ background:'#fff', border:`1px solid ${BD}`, borderRadius:10, padding:'10px 14px', boxShadow:'0 1px 3px rgba(0,0,0,0.04)' }}>
            <div style={{ fontSize:10.5, color:'#6b7280', marginBottom:3 }}>{label}</div>
            <div style={{ fontSize:22, fontWeight:900, color }}>{val}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display:'flex', gap:10, marginBottom:12, alignItems:'center' }}>
        <div style={{ display:'flex', gap:2, background:'#fff', border:`1px solid ${BD}`, borderRadius:8, padding:3 }}>
          {FILTERS.map(f=>(
            <button key={f} onClick={e=>{e.stopPropagation();setFilter(f);}}
              style={{ padding:'4px 14px', borderRadius:6, border:'none', fontSize:12, fontWeight:filter===f?700:400,
                background:filter===f?P:'transparent', color:filter===f?'#fff':'#374151', cursor:'pointer', fontFamily:F }}>
              {f}
            </button>
          ))}
        </div>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search order no, client, BG no…"
          onClick={e=>e.stopPropagation()}
          style={{ height:34, padding:'0 12px', border:`1px solid ${BD}`, borderRadius:7, fontSize:12, fontFamily:F, outline:'none', width:260 }}/>
        <div style={{ marginLeft:'auto', fontSize:11.5, color:'#6b7280' }}>
          {filtered.filter(x=>x.dep).length} deposit(s) · nearest expiry first
        </div>
      </div>

      {/* Table */}
      <div style={{ background:'#fff', border:`1px solid ${BD}`, borderRadius:10, overflow:'hidden', boxShadow:'0 1px 4px rgba(0,0,0,0.05)' }}>
        {loading ? (
          <div style={{ padding:40, textAlign:'center', color:'#6b7280' }}>Loading…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding:40, textAlign:'center', color:'#9ca3af' }}>No records found</div>
        ) : (
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11.5, fontFamily:F }}>
              <thead>
                <tr style={{ background:'#f8faff', borderBottom:`2px solid ${BD}` }}>
                  {['#','Order No','Client','Contract / PO No','Type','BG No / Ref','Amount','Start Date','Expiry Date','Status'].map((h,i)=>(
                    <th key={i} style={{ padding:'9px 10px', textAlign:'left', fontWeight:700, fontSize:10.5, color:'#374151', whiteSpace:'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(({ so, dep }, idx) => {
                  const isBG = dep?.depositType === 'BG';
                  const st   = dep ? depositStatus(dep) : null;
                  const tc   = dep ? (TYPE_COLOR[dep.depositType] || TYPE_COLOR.BG) : null;
                  const exp  = dep?.expiryDate || dep?.endDate;
                  const days = exp ? Math.ceil((new Date(exp) - new Date()) / 86400000) : null;

                  return (
                    <tr key={idx}
                      onClick={e => handleRowClick(e, dep, so)}
                      title={isBG ? 'Click to open menu' : ''}
                      style={{
                        borderBottom: `1px solid ${BD}`,
                        background:   idx%2===0 ? '#fff' : '#fafbff',
                        cursor:       dep ? 'pointer' : 'default',
                        transition:   'background 0.1s',
                      }}
                      onMouseEnter={e=>{ if(dep) e.currentTarget.style.background='#eef3ff'; }}
                      onMouseLeave={e=>e.currentTarget.style.background=idx%2===0?'#fff':'#fafbff'}>

                      <td style={{ padding:'8px 10px', color:'#9ca3af', fontSize:11 }}>{idx+1}</td>

                      <td style={{ padding:'8px 10px' }}>
                        <span style={{ fontWeight:700, color:P, fontSize:12 }}>{so?.orderNo||dep?.orderNo||'—'}</span>
                      </td>

                      <td style={{ padding:'8px 10px', maxWidth:160 }}>
                        <div style={{ fontWeight:600, color:'#111827', fontSize:12 }}>{so?.customerName||dep?.customerName||'—'}</div>
                      </td>

                      <td style={{ padding:'8px 10px', fontSize:11 }}>
                        <div style={{ color:'#374151' }}>{so?.customerPO||dep?.customerPO||dep?.contractNo||'—'}</div>
                        {dep?.contractDate && <div style={{ fontSize:10, color:'#9ca3af', marginTop:2 }}>{fmtD(dep.contractDate)}</div>}
                      </td>

                      <td style={{ padding:'8px 10px' }}>
                        {dep
                          ? <span style={{ background:tc.bg, color:tc.color, padding:'2px 8px', borderRadius:5, fontSize:10.5, fontWeight:700 }}>{dep.depositType}</span>
                          : <span style={{ color:'#d1d5db' }}>—</span>}
                      </td>

                      <td style={{ padding:'8px 10px' }}>
                        {dep?.depositType==='BG' ? (
                          <div>
                            <div style={{ fontWeight:700, fontSize:12, color:'#111827' }}>{dep.bgNo||'—'}</div>
                            {dep.issuingBankName  && <div style={{ fontSize:10, color:'#6b7280', marginTop:1 }}>Issued by: {dep.issuingBankName}</div>}
                            {dep.issuedToBankName && <div style={{ fontSize:10, color:'#6b7280' }}>In favour of: {dep.issuedToBankName}</div>}
                          </div>
                        ) : (dep?.paymentRef||'—')}
                      </td>

                      <td style={{ padding:'8px 10px', fontWeight:600, fontSize:12, whiteSpace:'nowrap' }}>
                        {dep?.amount ? `₹${Number(dep.amount).toLocaleString('en-IN')}` : '—'}
                      </td>

                      <td style={{ padding:'8px 10px', fontSize:11, whiteSpace:'nowrap', color:'#374151' }}>
                        {dep ? fmtD(dep.startDate) : '—'}
                      </td>

                      <td style={{ padding:'8px 10px', fontSize:11, whiteSpace:'nowrap' }}>
                        {exp
                          ? <span style={{ color:days<0?'#dc2626':days<=30?'#b45309':days<=90?'#c2410c':'#374151', fontWeight:days<=30?700:400 }}>{fmtD(exp)}</span>
                          : '—'}
                      </td>

                      <td style={{ padding:'8px 10px' }}>
                        {st ? (
                          <span style={{ background:st.bg, color:st.color, border:`1px solid ${st.border}`, padding:'2px 8px', borderRadius:5, fontSize:10.5, fontWeight:700, whiteSpace:'nowrap' }}>
                            {st.label}
                          </span>
                        ) : (
                          <button onClick={e=>{e.stopPropagation();navigate(`/account/deposit/create?soId=${so?.orderId}&companyId=${cid}`);}}
                            style={{ padding:'3px 10px', background:'#f5f3ff', border:'1px solid #ddd6fe', borderRadius:5, color:'#7c3aed', fontSize:11, fontWeight:600, cursor:'pointer', fontFamily:F }}>
                            + Add
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Context menu — rendered at mouse position */}
      {menu && (
        <ContextMenu
          dep={menu.dep} so={menu.so}
          x={menu.x} y={menu.y}
          onClose={()=>setMenu(null)}
          onEdit={()=>{ setMenu(null); navigate(`/account/deposit/edit/${menu.dep.depositId}?companyId=${cid}`); }}
          onApprove={()=>{ setMenu(null); quickApprove(menu.dep); }}
          onMarkRelease={()=>{ setMenu(null); quickRelease(menu.dep); }}
          onUndoRelease={()=>{ setMenu(null); quickUndo(menu.dep); }}
        />
      )}
    </div>
  );
}
