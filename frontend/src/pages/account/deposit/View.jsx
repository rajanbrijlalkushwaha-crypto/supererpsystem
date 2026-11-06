import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { px, vw, vh } from '../../../utils/uiScale';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { useCompany } from '../../../context/CompanyContext';
import { useAuth } from '../../../context/AuthContext';
import { withPrintFont } from '../../../utils/printFont';

const F   = "'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif";
const P   = '#133d80';

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

/* Fetch the company logo as base64 for embedding in the letter header —
   same pattern as printSalesOrder.js / printDeliveryChallan.js. */
async function fetchLogoB64(company) {
  if (!company?.logoFileName || !company?.companyId) return null;
  try {
    const res  = await fetch(`/api/companies/logo/${encodeURIComponent(company.logoFileName)}?companyId=${company.companyId}`);
    const blob = await res.blob();
    return await new Promise(r => { const rd = new FileReader(); rd.onload = () => r(rd.result); rd.readAsDataURL(blob); });
  } catch { return null; }
}

/* Self-contained company header ROW — logo + name + address + GSTIN,
   matching printDeliveryChallan.js's format. Sits as the first <tr> of
   the letter's outer bordered table (letters are fully digital now,
   no more blank pre-printed-letterhead space). */
function coHeaderHtml(company, logoB64) {
  const coName = company?.companyName || CO_NAME;
  const coAddr = [company?.address, company?.city, company?.state, company?.pincode].filter(Boolean).join(', ');
  const coGstin = company?.gstin || '';
  const coPhone = company?.phone || '';
  const coEmail = company?.email || '';
  const logoTag = logoB64
    ? `<img src="${logoB64}" style="height:44px;max-width:130px;object-fit:contain;">`
    : `<span style="font-size:13pt;font-weight:bold;color:#104f4f;">${coName}</span>`;
  return `<tr><td colspan="2" class="co-header">
  <div style="display:flex;align-items:center;gap:10px;">
    ${logoTag}
    <div>
      <div style="font-size:13pt;font-weight:bold;">${coName}</div>
      <div style="font-size:8.5pt;color:#333;">${coAddr}</div>
      <div style="font-size:8.5pt;color:#333;">${coGstin ? `GSTIN: ${coGstin}` : ''}${coPhone ? ` &nbsp;|&nbsp; Ph: ${coPhone}` : ''}${coEmail ? ` &nbsp;|&nbsp; ${coEmail}` : ''}</div>
    </div>
  </div>
</td></tr>`;
}

/* Resolve the logged-in user's login ID + designation for the company
   signature box — same "Prepared By" lookup pattern as printSalesOrder.js /
   SalesBill.jsx, but keyed off the currently signed-in user rather than an
   order's audit trail (deposits carry no audit trail of their own). */
async function resolveSigner(authUser) {
  if (!authUser?.username) return null;
  let full = null;
  try {
    const r = await fetch('/api/auth/users');
    if (r.ok) {
      const all = await r.json();
      full = all.find(u => String(u.id) === String(authUser.id)) ||
             all.find(u => u.username === authUser.username) || null;
    }
  } catch {}
  return {
    name: authUser.name || authUser.username || '',
    loginId: full?.username || authUser.username || '',
    designation: full?.designation || '',
  };
}

/* Bordered signature box — matches printSalesOrder.js's signature
   convention (empty rectangle + label underneath). `signer` (optional)
   adds the logged-in user's login ID / designation under the company box. */
function sigBoxHtml(forName, signer) {
  return `
<div class="sig-box">Signature &amp; Stamp</div>
<div class="sig-label bold">For, ${forName}</div>
<div class="sig-label">Authorized Signatory</div>
${signer?.loginId ? `<div class="sig-label" style="font-size:8.5pt;color:#555;">Login ID: ${signer.loginId}</div>` : ''}
${signer?.designation ? `<div class="sig-label" style="font-size:8.5pt;color:#555;">${signer.designation}</div>` : ''}`;
}

/* ═══════════════════════════════════════════════════════════
   SHARED BASE CSS  — fully self-contained digital letter with a
   company header (no longer relies on pre-printed letterhead paper)
═══════════════════════════════════════════════════════════ */
const BASE_CSS = `
* { margin:0; padding:0; box-sizing:border-box; }
body {
  font-family: Arial, Helvetica, sans-serif;
  font-size: 11.5pt;
  color: #000;
  padding: 10mm 12mm 10mm;
  line-height: 1.4;
}
/* Outer letter frame — every section is a bordered row/cell,
   matching printDeliveryChallan.js's convention. */
table.outer {
  width: 100%;
  border-collapse: collapse;
  border: 1.5px solid #000;
}
table.outer > tbody > tr > td {
  border: 1px solid #000;
  padding: 8px 14px;
  vertical-align: top;
}
.co-header { padding: 10px 14px; }
.top-right { text-align: right; font-size: 11.5pt; line-height: 1.6; }
.to-block  { font-size: 11.5pt; line-height: 1.6; }
.contract-line { font-size: 11.5pt; }
.subject {
  font-size: 12pt;
  font-weight: bold;
  text-decoration: underline;
}
.sec-hdr {
  font-size: 11.5pt;
  font-weight: bold;
  text-align: center;
  background: #f2f2f2;
  text-decoration: underline;
  padding: 7px 14px !important;
}
p { font-size: 11.5pt; line-height: 1.5; margin-bottom: 6px; }
p:last-child { margin-bottom: 0; }
/* Nested data tables (items / BG detail grid) inside an outer cell */
table.inner { width: 100%; border-collapse: collapse; font-size: 11pt; }
table.inner th {
  border: 1pt solid #000;
  padding: 7px 10px;
  font-weight: bold;
  text-align: center;
  background: #fff;
}
table.inner td {
  border: 1pt solid #000;
  padding: 7px 10px;
  vertical-align: top;
}
table.inner td.lbl { font-weight: bold; background: #fafafa; width: 21%; }
/* Bordered signature box — matches printSalesOrder.js's signature style */
.sig-box {
  border: 1px solid #000;
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #999;
  font-size: 9.5pt;
  margin-bottom: 6px;
}
.sig-label { font-size: 11pt; text-align: center; line-height: 1.5; }
.bold { font-weight: bold; }
.underline { text-decoration: underline; }
@media print {
  @page { size: A4; margin: 8mm; }
  body { padding: 0; }
}
`;

function printLetter(html) {
  const w = window.open('', '_blank', 'width=860,height=720');
  w.document.write(withPrintFont(html));
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 600);
}

/* ─────────────────────────────────────────────────
   1. COVER LETTER — client name+address, order items
───────────────────────────────────────────────── */
async function buildCoverLetter(dep, so, company, authUser) {
  const logoB64 = await fetchLogoB64(company);
  const signer  = await resolveSigner(authUser);
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
        <td style="text-align:right">${it.rate ? Number(it.rate).toFixed(2) : ''}</td>
        <td style="text-align:right">${it.amt ? Number(it.amt).toFixed(2) : ''}</td>
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
    ['Bank Guarantee Amount',      bgAmt ? Number(bgAmt).toFixed(2) : ''],
    ['Bank Guarantee Expiry Date', fmtDash(dep.expiryDate)],
    ['Remarks (if any)',           dep.remarks || ''],
  ];

  /* Pack two label/value pairs per row to save vertical space. */
  const bgPairRows = [];
  for (let i = 0; i < bgRows.length; i += 2) {
    const [l1, v1] = bgRows[i];
    const pair2 = bgRows[i + 1];
    bgPairRows.push(pair2
      ? `<tr><td class="lbl">${l1}</td><td>${v1}</td><td class="lbl">${pair2[0]}</td><td>${pair2[1]}</td></tr>`
      : `<tr><td class="lbl">${l1}</td><td colspan="3">${v1}</td></tr>`);
  }

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Cover Letter – BG Submission</title>
<style>${BASE_CSS}</style></head><body>
<table class="outer"><tbody>
${coHeaderHtml(company, logoB64)}
<tr><td colspan="2" class="top-right">Ref: ${ref}&nbsp;&nbsp;|&nbsp;&nbsp;Date: ${todayDash()}</td></tr>
<tr><td colspan="2" class="to-block">To,&nbsp; <strong>${clientName}</strong>${addrLines ? ', ' + addrLines : ''}</td></tr>
<tr><td colspan="2" class="contract-line">Contract No.:- ${contractNo}</td></tr>
<tr><td colspan="2" class="subject">Sub: Submission of Bank Guarantee</td></tr>
<tr><td colspan="2">
  <p>Dear Sir/Ma'am</p>
  <p>As per above subjected please confirm receiving of bank guarantee and kindly note the order details as per given below:-</p>
</td></tr>
<tr><td colspan="2" class="sec-hdr">Order / Supply Details</td></tr>
<tr><td colspan="2" style="padding:0">
  <table class="inner">
    <tr>
      <th style="width:34px">Sr.</th>
      <th style="text-align:left">Description</th>
      <th style="width:65px">Qty</th>
      <th style="width:85px">Rate (₹)</th>
      <th style="width:95px">Amount (₹)</th>
    </tr>
    ${itemRows}
    ${grandTotal ? `<tr>
      <td colspan="4" style="text-align:right;font-weight:bold">Grand Total</td>
      <td style="text-align:right;font-weight:bold">${Number(grandTotal).toFixed(2)}</td>
    </tr>` : ''}
  </table>
</td></tr>
<tr><td colspan="2" class="sec-hdr">Bank Guarantee Details</td></tr>
<tr><td colspan="2" style="padding:0">
  <table class="inner">
    ${bgPairRows.join('')}
  </table>
</td></tr>
<tr><td colspan="2">
  <p>Please sign and return back original copy of this letter <strong>or</strong> in e-mail scan copy.</p>
</td></tr>
<tr>
  <td style="width:50%;text-align:center;padding-top:12px">${sigBoxHtml(CO_NAME, signer)}</td>
  <td style="width:50%;text-align:center;padding-top:12px">${sigBoxHtml(clientName)}</td>
</tr>
</tbody></table>
</body></html>`;
}

/* ─────────────────────────────────────────────────
   2. CRL FOR BANK  — matches uploaded PDF exactly
───────────────────────────────────────────────── */
async function buildCRLBank(dep, so, company, authUser) {
  const logoB64 = await fetchLogoB64(company);
  const signer    = await resolveSigner(authUser);
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
table.inner td.center { text-align:center; }
.fd-line { margin-top:6px; font-size:9.5pt; color:#444; }
.fd-blank { display:inline-block; width:130px; border-bottom:1pt solid #000; margin-top:2px; }
</style></head><body>
<table class="outer"><tbody>
${coHeaderHtml(company, logoB64)}
<tr><td colspan="2" class="top-right">Ref No: ${ref}&nbsp;&nbsp;|&nbsp;&nbsp;Date: ${todayDash()}</td></tr>
<tr><td colspan="2" class="to-block">To,&nbsp; The Branch Manager, ${bankName}${bankAddr ? ', ' + bankAddr.split('\n').join(', ') : ''}</td></tr>
<tr><td colspan="2" class="subject">Sub: Request for Close BG and Remove Lein and relase FD</td></tr>
<tr><td colspan="2">
  <p>Dear Sir/Ma'am</p>
  <p>As per above subjected please closed our FD which is associate with BG and release payment as per details given below: -</p>
</td></tr>
<tr><td colspan="2" style="padding:0">
  <table class="inner">
    <tr>
      <th style="width:44px">Sr<br>No.</th>
      <th style="width:70px">PBG<br>Date</th>
      <th>PBG No.</th>
      <th>Favoring of</th>
      <th style="width:70px">Amount</th>
      <th style="width:64px">Expiry<br>Date</th>
    </tr>
    <tr>
      <td class="center">01</td>
      <td class="center">${fmtDot(dep.startDate)}</td>
      <td>
        ${dep.bgNo || ''}
        <div class="fd-line">Linked FD No.<br><span class="fd-blank"></span></div>
      </td>
      <td>${clientName}</td>
      <td class="center">${amt ? Number(amt).toFixed(2) + '/-' : ''}</td>
      <td class="center">${fmtDot(dep.expiryDate)}</td>
    </tr>
  </table>
</td></tr>
<tr><td colspan="2">
  <p>And Release our BG Amount as per Bank details given below:</p>
  <p>Beneficiary Name: <strong>${CO_NAME}</strong><br>
  A/c. No: - ${accNo}</p>
  <p><strong><span class="underline">Enclosed: Original BG with Client Letter and</span></strong></p>
</td></tr>
<tr>
  <td style="width:50%"></td>
  <td style="width:50%;text-align:center;padding-top:12px">${sigBoxHtml(CO_NAME, signer)}</td>
</tr>
</tbody></table>
</body></html>`;
}

/* ─────────────────────────────────────────────────
   3. RFCL  — placeholder until PDF uploaded
───────────────────────────────────────────────── */
async function buildRFCL(dep, so, company, authUser) {
  const logoB64 = await fetchLogoB64(company);
  const signer     = await resolveSigner(authUser);
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
<table class="outer"><tbody>
${coHeaderHtml(company, logoB64)}
<tr><td colspan="2" class="top-right">Ref No.: ${ref}&nbsp;&nbsp;|&nbsp;&nbsp;Date: ${todayDash()}</td></tr>
<tr><td colspan="2" class="to-block">To,&nbsp; ${clientAddr ? clientAddr.split('\n').join(', ') : clientName}</td></tr>
<tr><td colspan="2" class="subject">Sub: Request for PBG Original Copy with Release Letter</td></tr>
<tr><td colspan="2">
  <p>Dear Sir/Ma'am</p>
  <p>As per above subjected and Contract no. ${contractNo} dtd:${fmtDash(contractDt)}, We have submitted the bank guarantee as per details given below:</p>
</td></tr>
<tr><td colspan="2" style="padding:0">
  <table class="inner">
    <tr><th style="width:48px">Sr No.</th><th style="width:42%">Particulars</th><th>Description</th></tr>
    ${rows.map(([sr,p,d])=>`<tr><td style="text-align:center">${sr}</td><td>${p}</td><td>${d}</td></tr>`).join('')}
  </table>
</td></tr>
<tr><td colspan="2">
  <p><strong><span class="underline">So, PBG has been expired on ${fmtDash(dep.expiryDate)}</span></strong></p>
  <p>Hence, we are requesting you to please release the original BG copy along with release letter to the address given below:</p>
  <p>
    <strong>${CO_NAME}</strong><br>
    502, Sungrace, Gandhinagar Highway, Motera, Ahmedabad, Gujarat – 380005<br>
    M: +91-9328927032 &nbsp;|&nbsp; Email: Tender@epsilonprefab.org
  </p>
</td></tr>
<tr>
  <td style="width:50%"></td>
  <td style="width:50%;text-align:center;padding-top:12px">${sigBoxHtml(CO_NAME, signer)}</td>
</tr>
</tbody></table>
</body></html>`;
}

/* ═══════════════════════════════════════════════════════════
   CONTEXT MENU — fixed at mouse click, BG rows only
═══════════════════════════════════════════════════════════ */
function ContextMenu({ dep, so, x, y, company, authUser, onClose, onEdit, onApprove, onMarkRelease, onUndoRelease }) {
  const ref = useRef();

  useEffect(() => {
    const close = e => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [onClose]);

  const menuW = 272;
  const left  = Math.min(px(x), vw() - menuW - 16);   // mouse position is in screen px → page px (display size)
  const top   = Math.min(px(y) + 4, vh() - 290);

  const items = [
    { icon:'📄', label:'Print RFCL  (Request for Release)',     fn: async () => { onClose(); printLetter(await buildRFCL(dep, so, company, authUser)); } },
    { icon:'📋', label:'Print Cover Letter  (BG Submission)',   fn: async () => { onClose(); printLetter(await buildCoverLetter(dep, so, company, authUser)); } },
    { icon:'🏦', label:'Print CRL  (Close BG / Release FD)',    fn: async () => { onClose(); printLetter(await buildCRLBank(dep, so, company, authUser)); } },
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
  const { user: authUser } = useAuth();
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
        (x.dep?.fdNo||'').toLowerCase().includes(q)||
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
    <div style={{ fontFamily:F, background:'#f0f4fb', height:'100%', display:'flex', flexDirection:'column', padding:'14px 16px' }}
      onClick={()=>setMenu(null)}>

      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0,
        background:`linear-gradient(135deg,${P},#0d2a5c)`, padding:'10px 16px', borderRadius:8, marginBottom:8 }}>
        <div>
          <div style={{ fontSize:11, color:'rgba(255,255,255,0.65)', marginBottom:2 }}>Account → Deposit</div>
          <div style={{ fontSize:18, fontWeight:800, color:'#fff' }}>Deposits &amp; Bank Guarantees</div>
          <div style={{ fontSize:11, color:'rgba(255,255,255,0.65)', marginTop:2 }}>
            Sorted by nearest expiry · Click a BG row to print / edit / approve
          </div>
        </div>
        <button onClick={e=>{e.stopPropagation();navigate('/account/deposit/create');}}
          style={{ height:34, padding:'0 20px', background:'#fff', border:'none', borderRadius:7, color:P, fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:F }}>
          + Add Deposit
        </button>
      </div>

      {/* Summary chips + Filters + Search — all in one compact line */}
      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8, padding:'6px 10px', flexShrink:0,
        background:'#fff', border:'1px solid #000', flexWrap:'wrap' }}>

        {[
          ['Total Deposits',    summary.total,   '#1d4ed8'],
          ['Bank Guarantees',   summary.bg,      '#1e40af'],
          ['Pending Approval',  summary.pending,  '#92400e'],
          ['Expiring ≤30 Days', summary.exp30,   '#92400e'],
          ['Expired',           summary.expired,  '#dc2626'],
        ].map(([label,val,color],i)=>(
          <div key={label} style={{ display:'flex', alignItems:'center', gap:5, paddingRight:10,
            borderRight: i<4 ? '1px solid #e5e7eb' : 'none' }}>
            <span style={{ fontSize:10, color:'#6b7280', whiteSpace:'nowrap' }}>{label}</span>
            <span style={{ fontSize:14, fontWeight:900, color }}>{val}</span>
          </div>
        ))}

        <div style={{ width:1, height:20, background:'#000' }} />

        <div style={{ display:'flex', gap:2, background:'#fff', border:'1px solid #000', borderRadius:0, padding:3 }}>
          {FILTERS.map(f=>(
            <button key={f} onClick={e=>{e.stopPropagation();setFilter(f);}}
              style={{ padding:'4px 14px', borderRadius:0, border:'none', fontSize:12, fontWeight:filter===f?700:400,
                background:filter===f?P:'transparent', color:filter===f?'#fff':'#000', cursor:'pointer', fontFamily:F }}>
              {f}
            </button>
          ))}
        </div>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search order no, client, BG no…"
          onClick={e=>e.stopPropagation()}
          style={{ height:30, padding:'0 12px', border:'1px solid #000', borderRadius:0, fontSize:12, fontFamily:F, outline:'none', width:220, color:'#000' }}/>
        <div style={{ marginLeft:'auto', fontSize:11.5, color:'#000', whiteSpace:'nowrap' }}>
          {filtered.filter(x=>x.dep).length} deposit(s) · nearest expiry first
        </div>
      </div>

      {/* Table */}
      <div style={{ background:'#fff', border:'1px solid #000', overflow:'hidden', flex:1, display:'flex', flexDirection:'column', minHeight:0 }}>
        {loading ? (
          <div style={{ padding:40, textAlign:'center', color:'#000' }}>Loading…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding:40, textAlign:'center', color:'#000' }}>No records found</div>
        ) : (
          <div style={{ overflow:'auto', flex:1, minHeight:0 }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11.5, fontFamily:F }}>
              <thead>
                <tr style={{ background:P, borderBottom:`2px solid #0d2a5c` }}>
                  {['#','Order No','Client','Contract / PO No','Type','BG No / Ref','Amount','Start Date','Expiry Date','Status'].map((h,i)=>(
                    <th key={i} style={{ padding:'9px 10px', textAlign:'left', fontWeight:700, fontSize:10.5, color:'#fff', whiteSpace:'nowrap', border:'1px solid #0d2a5c', position:'sticky', top:0, background:P, zIndex:1 }}>{h}</th>
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
                        background:   '#fff',
                        cursor:       dep ? 'pointer' : 'default',
                        transition:   'background 0.1s',
                      }}
                      onMouseEnter={e=>{ if(dep) e.currentTarget.style.background='#f5f5f5'; }}
                      onMouseLeave={e=>e.currentTarget.style.background='#fff'}>

                      <td style={{ padding:'8px 10px', color:'#000', fontSize:11, border:'1px solid #000' }}>{idx+1}</td>

                      <td style={{ padding:'8px 10px', border:'1px solid #000' }}>
                        <span style={{ fontWeight:700, color:'#000', fontSize:12 }}>{so?.orderNo||dep?.orderNo||'—'}</span>
                      </td>

                      <td style={{ padding:'8px 10px', maxWidth:160, border:'1px solid #000' }}>
                        <div style={{ fontWeight:600, color:'#000', fontSize:12 }}>{so?.customerName||dep?.customerName||'—'}</div>
                      </td>

                      <td style={{ padding:'8px 10px', fontSize:11, border:'1px solid #000' }}>
                        <div style={{ color:'#000' }}>{so?.customerPO||dep?.customerPO||dep?.contractNo||'—'}</div>
                        {dep?.contractDate && <div style={{ fontSize:10, color:'#000', marginTop:2 }}>{fmtD(dep.contractDate)}</div>}
                      </td>

                      <td style={{ padding:'8px 10px', border:'1px solid #000' }}>
                        {dep
                          ? <span style={{ background:tc.bg, color:tc.color, padding:'2px 8px', borderRadius:5, fontSize:10.5, fontWeight:700 }}>{dep.depositType}</span>
                          : <span style={{ color:'#000' }}>—</span>}
                      </td>

                      <td style={{ padding:'8px 10px', border:'1px solid #000' }}>
                        {dep?.depositType==='BG' ? (
                          <div>
                            <div style={{ fontWeight:700, fontSize:12, color:'#000' }}>{dep.bgNo||'—'}</div>
                            {dep.issuingBankName  && <div style={{ fontSize:10, color:'#000', marginTop:1 }}>Issued by: {dep.issuingBankName}</div>}
                            {dep.issuedToBankName && <div style={{ fontSize:10, color:'#000' }}>In favour of: {dep.issuedToBankName}</div>}
                          </div>
                        ) : dep?.depositType==='FD' ? (
                          <div>
                            <div style={{ fontWeight:700, fontSize:12, color:'#000' }}>{dep.fdNo ? `FD No: ${dep.fdNo}` : '—'}</div>
                            {dep.paymentBank  && <div style={{ fontSize:10, color:'#000', marginTop:1 }}>Bank: {dep.paymentBank}</div>}
                            {dep.interestRate && <div style={{ fontSize:10, color:'#000' }}>Interest: {dep.interestRate}%</div>}
                          </div>
                        ) : (dep?.paymentRef||'—')}
                      </td>

                      <td style={{ padding:'8px 10px', fontWeight:600, fontSize:12, whiteSpace:'nowrap', color:'#000', border:'1px solid #000' }}>
                        {dep?.amount ? `₹${Number(dep.amount).toFixed(2)}` : '—'}
                      </td>

                      <td style={{ padding:'8px 10px', fontSize:11, whiteSpace:'nowrap', color:'#000', border:'1px solid #000' }}>
                        {dep ? fmtD(dep.startDate) : '—'}
                      </td>

                      <td style={{ padding:'8px 10px', fontSize:11, whiteSpace:'nowrap', border:'1px solid #000' }}>
                        {exp
                          ? <span style={{ color:days<0?'#dc2626':days<=30?'#b45309':days<=90?'#c2410c':'#000', fontWeight:days<=30?700:400 }}>{fmtD(exp)}</span>
                          : '—'}
                      </td>

                      <td style={{ padding:'8px 10px', border:'1px solid #000' }}>
                        {st ? (
                          <span style={{ background:st.bg, color:st.color, border:`1px solid ${st.border}`, padding:'2px 8px', borderRadius:5, fontSize:10.5, fontWeight:700, whiteSpace:'nowrap' }}>
                            {st.label}
                          </span>
                        ) : (
                          <button onClick={e=>{e.stopPropagation();navigate(`/account/deposit/create?soId=${so?.orderId}&companyId=${cid}`);}}
                            style={{ padding:'3px 10px', background:'#fff', border:'1px solid #000', borderRadius:5, color:'#000', fontSize:11, fontWeight:600, cursor:'pointer', fontFamily:F }}>
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
          company={selectedCompany}
          authUser={authUser}
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
