import React, { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { useCompany } from '../../../context/CompanyContext';
import { useAuth } from '../../../context/AuthContext';
import { withPrintFont } from '../../../utils/printFont';
import { brandLine } from '../../../utils/printBranding';

const F  = "'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif";
const P  = '#133d80';
const BD = '#E5EAF2';
const fmt  = n => (parseFloat(n)||0).toFixed(2);
const fmt2 = n => (parseFloat(n)||0).toFixed(2);
const fmtD = ds => {
  if (!ds) return '—';
  const d = new Date(ds);
  return isNaN(d) ? ds : `${String(d.getDate()).padStart(2,'0')}-${String(d.getMonth()+1).padStart(2,'0')}-${d.getFullYear()}`;
};
const now = () => {
  const d = new Date();
  return `${String(d.getDate()).padStart(2,'0')}-${String(d.getMonth()+1).padStart(2,'0')}-${d.getFullYear()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
};

/* ─── Business-friendly balance status label ─── */
const balanceStatus = (partyType, balance, bankType) => {
  const bal = parseFloat(balance) || 0;
  if (bankType) return { label: 'Bank Account', bg: '#f0fdf4', color: '#15803d', border: '#86efac' };
  if (bal === 0) return { label: 'No Dues',      bg: '#f1f5f9', color: '#64748b', border: '#cbd5e1' };

  if (partyType === 'client') {
    // Dr balance = client owes us (receivable); Cr = they overpaid (advance)
    return bal > 0
      ? { label: 'Dues to Receive', bg: '#f0fdf4', color: '#15803d', border: '#86efac' }
      : { label: 'Advance Received', bg: '#f5f3ff', color: '#6d28d9', border: '#ddd6fe' };
  }
  if (partyType === 'vendor') {
    // Cr balance = we owe vendor (payable); Dr = we overpaid (advance)
    return bal < 0
      ? { label: 'Dues to Pay',  bg: '#fef2f2', color: '#dc2626', border: '#fecaca' }
      : { label: 'Advance Paid', bg: '#f0fdf4', color: '#15803d', border: '#86efac' };
  }
  // generic fallback
  return bal > 0
    ? { label: 'Debit',  bg: '#eff6ff', color: '#1e40af', border: '#bfdbfe' }
    : { label: 'Credit', bg: '#f5f3ff', color: '#7c3aed', border: '#ddd6fe' };
};

/* ─── classify ─── */
const classify = (name, partyType) => {
  if (partyType === 'client') return 'Clients';
  if (partyType === 'vendor') return 'Vendors';
  if (partyType === 'bank')   return 'Bank & Cash';
  const n = name.toLowerCase();
  if (n.startsWith('bank -') || n === 'cash') return 'Bank & Cash';
  if (n.includes('gst'))  return 'GST';
  if (['sales','purchase','sales return','purchase return'].includes(n)) return 'Trading';
  if (n.includes('expense')||n.includes('salary')||n.includes('rent')) return 'Expenses';
  if (n.includes('income')||n.includes('revenue')||n.includes('capital')) return 'Income & Equity';
  return 'Other';
};

const GC = {
  'Bank & Cash':         { bg:'#eff6ff', color:'#1e40af', dot:'#3b82f6' },
  'Trading':             { bg:'#f0fdf4', color:'#15803d', dot:'#22c55e' },
  'GST':                 { bg:'#fef9c3', color:'#92400e', dot:'#f59e0b' },
  'Expenses':            { bg:'#fef2f2', color:'#991b1b', dot:'#dc2626' },
  'Income & Equity':     { bg:'#f5f3ff', color:'#6d28d9', dot:'#7c3aed' },
  'Assets & Liabilities':{ bg:'#fff7ed', color:'#9a3412', dot:'#ea580c' },
  'Clients':             { bg:'#ecfeff', color:'#164e63', dot:'#06b6d4' },
  'Vendors':             { bg:'#f0fdf4', color:'#14532d', dot:'#059669' },
  'Other':               { bg:'#f8fafc', color:'#475569', dot:'#94a3b8' },
};
const ALL_GROUPS = ['All','Bank & Cash','Trading','GST','Clients','Vendors','Expenses','Income & Equity','Assets & Liabilities','Other'];

/* ════════════════════════════════════════════════════════
   PRINT HELPERS
════════════════════════════════════════════════════════ */
const companyHeader = (company, printTime) => {
  const logoUrl = company?.logoFileName ? `/api/companies/${company.companyId}/logo` : null;
  return `
  <div style="display:flex;align-items:flex-start;gap:18px;border-bottom:3px solid #133d80;padding-bottom:12px;margin-bottom:14px">
    ${logoUrl ? `<img src="${logoUrl}" style="height:60px;object-fit:contain;flex-shrink:0" onerror="this.style.display='none'"/>` : ''}
    <div style="flex:1">
      <div style="font-size:20px;font-weight:900;color:#133d80">${company?.companyName || ''}</div>
      <div style="color:#475569;margin-top:2px;font-size:11px;line-height:1.5">
        ${(company?.address||'').replace(/\r?\n/g,', ')}${company?.city?', '+company.city:''}${company?.state?', '+company.state:''}${company?.pincode?' - '+company.pincode:''}
      </div>
      <div style="display:flex;gap:20px;margin-top:4px;font-size:10.5px;color:#374151">
        ${company?.gstin?`<span><b>GSTIN:</b> ${company.gstin}</span>`:''}
        ${company?.pan?`<span><b>PAN:</b> ${company.pan}</span>`:''}
        ${company?.phone?`<span><b>Ph:</b> ${company.phone}</span>`:''}
        ${company?.email?`<span><b>Email:</b> ${company.email}</span>`:''}
      </div>
    </div>
    <div style="text-align:right;font-size:10px;color:#94a3b8;white-space:nowrap">Printed: ${printTime}</div>
  </div>`;
};

const srcLabel = s =>
  s==='sales-bill'       ? 'Sales Bill'       :
  s==='purchase-bill'    ? 'Purchase Bill'    :
  s==='receipt'          ? 'Receipt'          :
  s==='payment'          ? 'Payment'          :
  s==='credit-note'      ? 'Credit Note'      :
  s==='debit-note'       ? 'Debit Note'       :
  s==='security-deposit' ? 'Security Deposit' :
  s==='expense'          ? 'Expense'          : 'Journal';

/* Narration / description line for a printed statement row */
/* kept short: bills show the party's own bill no. (+ PO), payments/receipts show
   mode, Reference / Cheque No. and the Notes / Remarks typed on the payment */
const printNarration = (e) => {
  if (e.source === 'purchase-bill') {
    return [`Vendor Bill No. ${e.vendorBillNo || 'Not updated'}`, e.poNo && `PO No. ${e.poNo}`]
      .filter(Boolean).join(' | ');
  }
  if (e.source === 'payment' || e.source === 'receipt') {
    const mode = e.mode || (e.narration || '').replace(/^(Payment|Receipt):\s*/, '').trim();
    const po = e.poNo && !String(e.notes || '').includes(e.poNo) ? `PO No. ${e.poNo}` : '';
    return [mode, e.chqNo && `Ref/Chq No. ${e.chqNo}`, e.notes, po].filter(Boolean).join(' | ') || '—';
  }
  const n = e.narration || '—';
  return e.refNo && !n.includes(e.refNo) ? `${n} — Ref. ${e.refNo}` : n;
};

/* Print individual ledger statements (one per page) — same format as the Sales Order print:
   one outer box whose sections share their borders, section headers, "Label : Value" rows,
   then the statement (column lines only), totals row, "End of Statement" and printed-by line. */
const printSelectedLedgers = (selected, company, user, win) => {
  const pt  = now();
  const esc = v => String(v ?? '').replace(/[&<>"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]));
  const NU  = '<span style="color:#888;font-style:italic">Not updated</span>';
  const val = v => (v != null && String(v).trim() !== '' ? esc(v) : NU);
  const field = (lbl, v) => `<div class="field-row"><span class="field-lbl">${lbl}</span><span class="field-colon">:</span><span class="field-val">${val(v)}</span></div>`;
  const logoUrl = company?.logoFileName
    ? `${window.location.origin}/api/companies/logo/${encodeURIComponent(company.logoFileName)}?companyId=${company.companyId}` : null;
  const coAddr = [(company?.address || '').replace(/\r?\n/g, ', '), company?.city, company?.state].filter(Boolean).join(', ')
    + (company?.pincode ? ` - ${company.pincode}` : '');
  const coLine = [company?.phone && `Ph: ${esc(company.phone)}`, company?.email && `Email: ${esc(company.email)}`].filter(Boolean).join('&nbsp;&nbsp;|&nbsp;&nbsp;');
  const coTax  = [company?.gstin && `GSTIN: ${esc(company.gstin)}`, company?.pan && `PAN: ${esc(company.pan)}`].filter(Boolean).join('&nbsp;&nbsp;|&nbsp;&nbsp;');

  const pages = selected.map((l, idx) => {
    const entries = (l.entries||[]).slice().sort((x,y)=>new Date(x.date)-new Date(y.date));
    const bal  = Math.abs(l.balance);
    const isDr = l.balance >= 0;
    const p    = l.party || {};
    const pAddr = [(p.address || '').replace(/\r?\n/g, ', '), p.city, p.state].filter(Boolean).join(', ') + (p.pincode ? ` - ${p.pincode}` : '');
    const kind  = l.partyType === 'vendor' ? 'Vendor' : l.partyType === 'client' ? 'Client' : 'Party';
    const from  = entries[0]?.date, to = entries[entries.length-1]?.date;

    const net     = entries.reduce((t,e)=>t+(e.debit||0)-(e.credit||0), 0);
    const opening = +((parseFloat(l.balance)||0) - net).toFixed(2);
    const sumDr   = entries.reduce((t,e)=>t+(e.debit||0), 0);
    const sumCr   = entries.reduce((t,e)=>t+(e.credit||0), 0);
    const drcr    = v => (v >= 0 ? 'Dr' : 'Cr');
    let running = opening;
    const trows = entries.map((e,i) => {
      running += (e.debit||0)-(e.credit||0);
      return `<tr>
        <td style="text-align:center">${i+1}</td>
        <td style="white-space:nowrap">${fmtD(e.date)}</td>
        <td style="white-space:nowrap">${e.fileNo ? esc(e.fileNo) : '—'}</td>
        <td>${esc(printNarration(e))}</td>
        <td>${srcLabel(e.source)}</td>
        <td class="num">${e.debit>0?fmt2(e.debit):''}</td>
        <td class="num">${e.credit>0?fmt2(e.credit):''}</td>
        <td class="num">${fmt2(Math.abs(running))} ${running>=0?'Dr':'Cr'}</td>
      </tr>`;
    }).join('');

    const stmt = `<table class="stmt">
          <thead><tr>
            <th style="width:34px">Sr No.</th><th style="width:70px">Date</th><th style="width:92px">File No.</th>
            <th>Narration / Description</th><th style="width:82px">Transaction Type</th>
            <th style="width:84px">Debit (₹)</th><th style="width:84px">Credit (₹)</th><th style="width:100px">Closing Bal. (₹)</th>
          </tr></thead>
          <tbody><tr>
            <td></td><td style="white-space:nowrap">${from ? fmtD(from) : ''}</td><td></td>
            <td style="font-weight:bold">Opening Balance</td><td></td><td></td><td></td>
            <td class="num" style="font-weight:bold">${fmt2(Math.abs(opening))} ${drcr(opening)}</td>
          </tr>${trows}</tbody>
          <tfoot><tr>
            <td colspan="5" style="text-align:right">Total (${entries.length} transaction${entries.length===1?'':'s'})</td>
            <td class="num">${fmt2(sumDr)}</td>
            <td class="num">${fmt2(sumCr)}</td>
            <td class="num">${fmt2(bal)} ${isDr?'Dr':'Cr'}</td>
          </tr></tfoot>
        </table>`;

    return `
    <div class="page" style="${idx>0?'page-break-before:always;':''}">
    <table class="outer">
      <tr><td colspan="2" style="padding:8px 10px;border-bottom:1px solid #000">
        <table style="width:100%;border-collapse:collapse"><tr>
          <td style="width:110px;border:none;padding:0;vertical-align:middle">${logoUrl ? `<img src="${logoUrl}" style="max-height:52px;max-width:105px;object-fit:contain" onerror="this.style.display='none'"/>` : ''}</td>
          <td style="border:none;padding:0;text-align:center;vertical-align:middle">
            <div style="font-size:14pt;font-weight:bold">${esc(company?.companyName)}</div>
            ${coAddr ? `<div style="font-size:8pt;color:#333;white-space:nowrap">${esc(coAddr)}</div>` : ''}
            ${coLine ? `<div style="font-size:8.5pt;color:#333">${coLine}</div>` : ''}
            ${coTax ? `<div style="font-size:8.5pt;color:#333">${coTax}</div>` : ''}
          </td>
          <td style="width:110px;border:none;padding:0"></td>
        </tr></table>
      </td></tr>

      <tr><td colspan="2" style="text-align:center;font-size:13pt;font-weight:bold;padding:6px;border-bottom:1px solid #000">
        Ledger Statement
      </td></tr>

      <tr>
        <td style="width:58%"><span class="col-hdr">${kind} Details</span></td>
        <td><span class="col-hdr">Contact</span></td>
      </tr>
      <tr>
        <td>
          ${field(kind + ' Name', l.ledger)}
          ${field('Address', pAddr)}
          ${field('GSTIN', p.gstin)}
        </td>
        <td>
          ${field('Contact Person', p.contactPerson)}
          ${field('Mobile No.', p.mobile)}
          ${field('Email', p.email)}
        </td>
      </tr>

      <tr><td colspan="2" class="section-hdr">Ledger from ${from ? fmtD(from) : '—'} to ${to ? fmtD(to) : '—'}</td></tr>
      <tr><td colspan="2" style="padding:0">${stmt}</td></tr>

      <tr><td colspan="2" style="text-align:right;font-weight:bold;padding:5px 8px">
        Closing Balance : ₹${fmt2(bal)} ${isDr?'Dr':'Cr'} &nbsp;(${isDr?'Receivable':'Payable'})
      </td></tr>
      <tr><td colspan="2" style="text-align:center;font-weight:bold;padding:8px 6px;font-size:9.5pt;white-space:nowrap;overflow:hidden">
        ------------------------------ End of Statement ------------------------------
      </td></tr>
      <tr><td colspan="2" style="font-size:8pt;color:#555">
        <div style="display:flex;justify-content:space-between"><span>${brandLine(user)}</span><span>Printed: ${pt}</span></div>
      </td></tr>
    </table>
    </div>`;
  });

  const css = `
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:Arial,Helvetica,sans-serif;font-size:10pt;color:#000;background:#fff;padding:16px;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    .outer{border:1px solid #000;width:100%;border-collapse:collapse}
    .outer > tbody > tr > td{border:1px solid #000;padding:3px 6px;vertical-align:top}
    .section-hdr{text-align:center;font-weight:bold;font-size:11pt;padding:3px}
    .col-hdr{font-weight:bold;text-decoration:underline;font-size:10pt}
    .field-row{display:flex;gap:2px;margin:2px 0;font-size:9.5pt}
    .field-lbl{min-width:110px}
    .field-colon{margin:0 4px}
    .field-val{flex:1}
    /* statement: header + totals boxed, body rows show column lines only;
       outer edges dropped so it joins the surrounding box */
    .stmt{width:100%;border-collapse:collapse;font-size:9pt}
    .stmt th{border:1px solid #000;border-top:none;padding:4px 5px;font-weight:bold;text-align:center}
    .stmt tbody td{border-left:1px solid #000;border-right:1px solid #000;padding:3px 5px;vertical-align:top}
    .stmt tfoot td{border:1px solid #000;border-bottom:none;padding:4px 5px;font-weight:bold}
    .stmt tr > :first-child{border-left:none}
    .stmt tr > :last-child{border-right:none}
    .num{text-align:right;white-space:nowrap}
    .btn{background:#133d80;color:#fff;border:none;padding:8px 20px;border-radius:5px;cursor:pointer;font-size:13px;font-weight:700;margin-bottom:14px}
    @media print{.btn{display:none}body{padding:0}@page{margin:8mm;size:A4 portrait}tr{page-break-inside:avoid;break-inside:avoid}}
  `;
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Ledger Statements</title><style>${css}</style></head><body>
  <button class="btn" onclick="window.print()">🖨️ Print / Save as PDF</button>
  ${pages.join('')}
  </body></html>`;

  const w = win || window.open('','_blank','width=900,height=900');
  w.document.open();
  w.document.write(withPrintFont(html));
  w.document.close();
};

/* Print summary of all (or filtered) ledgers */
const printSummary = (ledgerList, company, user) => {
  const pt = now();
  const totalDr = ledgerList.reduce((s,l)=>s+l.totalDebit,0);
  const totalCr = ledgerList.reduce((s,l)=>s+l.totalCredit,0);
  const stLabel = (pt, bal, bk) => {
    if (bk) return 'Bank Account';
    if (bal===0) return 'No Dues';
    if (pt==='client') return bal>0?'Dues to Receive':'Advance Received';
    if (pt==='vendor') return bal<0?'Dues to Pay':'Advance Paid';
    return bal>0?'Debit':'Credit';
  };
  const stColor = (pt, bal, bk) => {
    if (bk) return '#15803d';
    if (bal===0) return '#64748b';
    if (pt==='client') return bal>0?'#1e40af':'#6d28d9';
    if (pt==='vendor') return bal<0?'#dc2626':'#15803d';
    return bal>0?'#1e40af':'#7c3aed';
  };
  const trows = ledgerList.map((l,i) => {
    const bal  = Math.abs(l.balance);
    const isDr = l.balance >= 0;
    const rawBal = parseFloat(l.balance)||0;
    return `<tr>
      <td style="font-weight:600">${l.ledger}</td>
      <td style="color:#6b7280;font-size:10px;text-transform:capitalize">${l.partyType||l.group||'—'}</td>
      <td style="text-align:right;color:${l.totalDebit>0?'#1e40af':'#aaa'};font-weight:${l.totalDebit>0?600:400}">${l.totalDebit>0?'₹'+fmt2(l.totalDebit):'—'}</td>
      <td style="text-align:right;color:${l.totalCredit>0?'#7c3aed':'#aaa'};font-weight:${l.totalCredit>0?600:400}">${l.totalCredit>0?'₹'+fmt2(l.totalCredit):'—'}</td>
      <td style="text-align:right;font-weight:700;color:${isDr?'#1e40af':'#7c3aed'}">${bal===0?'Nil':'₹'+fmt2(bal)}</td>
      <td style="text-align:center;font-weight:700;font-size:10.5px;color:${stColor(l.partyType,rawBal,l.bankType)}">${stLabel(l.partyType,rawBal,l.bankType)}</td>
      <td style="text-align:center;color:#6b7280">${(l.entries||[]).length}</td>
    </tr>`;
  }).join('');

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/>
  <title>Ledger Summary</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:'Segoe UI',Arial,sans-serif;font-size:11.5px;color:#000;background:#fff;padding:20px}
    .page{border:2px solid #000;padding:14px}
    table{width:100%;border-collapse:collapse}
    th{background:#133d80;color:#fff;padding:6px 8px;font-size:10.5px;font-weight:700;text-align:left;border:1px solid #000}
    td{padding:5px 8px;border:1px solid #000;font-size:11px;color:#000;background:#fff}
    .btn{background:#133d80;color:#fff;border:none;padding:8px 20px;border-radius:5px;cursor:pointer;font-size:13px;font-weight:700;margin-bottom:18px}
    @media print{.btn{display:none}@page{margin:12mm;size:A4 portrait}}
  </style></head><body>
  <button class="btn" onclick="window.print()">🖨️ Print / Save as PDF</button>
  <div class="page">
  ${companyHeader(company, pt)}
  <div style="background:#f0f4ff;border:1px solid #c7d2fe;border-radius:6px;padding:12px 16px;margin-bottom:14px;display:flex;justify-content:space-between;align-items:center">
    <div>
      <div style="font-size:10px;color:#6b7280;font-weight:700;text-transform:uppercase">General Ledger Summary</div>
      <div style="font-size:17px;font-weight:900;color:#133d80;margin-top:2px">${ledgerList.length} Ledger Accounts</div>
    </div>
    <div style="display:flex;gap:20px;text-align:center">
      <div><div style="font-size:9px;color:#6b7280;font-weight:700">TOTAL DEBIT</div><div style="font-size:16px;font-weight:900;color:#1e40af">₹${fmt2(totalDr)}</div></div>
      <div><div style="font-size:9px;color:#6b7280;font-weight:700">TOTAL CREDIT</div><div style="font-size:16px;font-weight:900;color:#7c3aed">₹${fmt2(totalCr)}</div></div>
    </div>
  </div>
  <table>
    <thead><tr>
      <th>Ledger / Account Name</th><th style="width:75px">Type</th>
      <th style="text-align:right;width:110px">Total Debit (₹)</th>
      <th style="text-align:right;width:110px">Total Credit (₹)</th>
      <th style="text-align:right;width:100px">Balance</th>
      <th style="text-align:center;width:120px">Status</th>
      <th style="text-align:center;width:60px">Entries</th>
    </tr></thead>
    <tbody>${trows}</tbody>
    <tfoot><tr>
      <td colspan="2" style="background:#e0e7ff;font-weight:800;padding:6px 8px;border:1px solid #c7d2fe">Total (${ledgerList.length} ledgers)</td>
      <td style="background:#e0e7ff;font-weight:800;text-align:right;padding:6px 8px;border:1px solid #c7d2fe;color:#1e40af">₹${fmt2(totalDr)}</td>
      <td style="background:#e0e7ff;font-weight:800;text-align:right;padding:6px 8px;border:1px solid #c7d2fe;color:#7c3aed">₹${fmt2(totalCr)}</td>
      <td colspan="3" style="background:#e0e7ff;padding:6px 8px;border:1px solid #c7d2fe"></td>
    </tr></tfoot>
  </table>
  <div style="margin-top:20px;border-top:1px solid #e2e8f0;padding-top:8px;display:flex;justify-content:space-between;color:#9ca3af;font-size:9.5px">
    <span>${brandLine(user)}</span>
    <span>Computer generated — no signature required.</span>
  </div>
  </div>
  </body></html>`;

  const w = window.open('','_blank','width=860,height=900');
  w.document.write(withPrintFont(html));
  w.document.close();
};

/* ════════════════════════════════════════════════════════
   COMPONENT
════════════════════════════════════════════════════════ */
export default function LedgerView() {
  const { selectedCompany } = useCompany();
  const { user } = useAuth();
  const cid      = selectedCompany?.companyId;
  const navigate = useNavigate();

  const [ledgers,     setLedgers]     = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [search,      setSearch]      = useState('');
  const [group,       setGroup]       = useState('All');
  const [expanded,    setExpanded]    = useState(null);
  const [selected,    setSelected]    = useState(new Set());
  const [msg,         setMsg]         = useState('');
  const [showCleared, setShowCleared] = useState(false);

  const load = useCallback(async () => {
    if (!cid) return;
    setLoading(true);
    try {
      const { data } = await axios.get(`/api/accounts/ledger?companyId=${cid}`);
      setLedgers(Array.isArray(data) ? data : []);
      setSelected(new Set());
    } catch (e) { setMsg('Error: ' + e.message); }
    finally { setLoading(false); }
  }, [cid]);

  useEffect(() => { load(); }, [load]);

  const enriched = useMemo(() =>
    ledgers.map(l => ({ ...l, group: classify(l.ledger, l.partyType) })),
    [ledgers]
  );

  const baseList = useMemo(() => {
    if (showCleared) return enriched;
    return enriched.filter(l => l.bankType || (parseFloat(l.balance) || 0) !== 0);
  }, [enriched, showCleared]);

  const rows = useMemo(() => {
    // When searching, look across all ledgers (including zero-balance); otherwise respect showCleared filter
    let list = search.trim() ? enriched : baseList;
    if (group !== 'All') list = list.filter(l => l.group === group);
    if (search.trim()) { const q = search.toLowerCase(); list = list.filter(l => l.ledger.toLowerCase().includes(q)); }
    return list;
  }, [enriched, baseList, group, search]);

  // figures follow what is on screen (group pill, search, Show Cleared)
  const totals = useMemo(() => ({
    count: rows.length,
    totalDr: rows.reduce((s,l)=>s+l.totalDebit,0),
    totalCr: rows.reduce((s,l)=>s+l.totalCredit,0),
    entries: rows.reduce((s,l)=>s+(l.entries||[]).length,0),
  }), [rows]);

  const toggleSelect = (name) => setSelected(s => {
    const n = new Set(s);
    n.has(name) ? n.delete(name) : n.add(name);
    return n;
  });
  const toggleAll = () => setSelected(s => s.size === rows.length ? new Set() : new Set(rows.map(l=>l.ledger)));
  const selectedLedgers = enriched.filter(l => selected.has(l.ledger));

  /* Print statements. Ledgers the server sent without party details get them from the
     vendor / client masters (matched by name, ignoring case, "M/s" and punctuation).
     The window opens first so the browser's pop-up blocker allows it. */
  const printSelected = async () => {
    const win = window.open('', '_blank', 'width=900,height=900');
    if (win) win.document.write('<p style="font-family:Arial;padding:20px">Preparing statement…</p>');
    let list = selectedLedgers;
    if (list.some(l => !l.party)) {
      const key = n => String(n || '').toLowerCase().replace(/^m\/s\.?\s*/, '').replace(/[^a-z0-9]/g, '');
      const info = o => {
        const cp = (o.contactPersons || []).find(p => p && (p.name || p.mobileNumber)) || {};
        return { address: o.address || o.billingAddr || '', city: o.city || '', state: o.state || '', pincode: o.pincode || '',
          gstin: o.gstin || o.gst || '', contactPerson: cp.name || o.contactPerson || '', mobile: cp.mobileNumber || o.mobile || '', email: cp.email || o.email || '' };
      };
      try {
        const [v, c] = await Promise.all([
          axios.get(`/api/vendors?companyId=${cid}`).then(r => r.data || []).catch(() => []),
          axios.get(`/api/clients?companyId=${cid}`).then(r => r.data || []).catch(() => []),
        ]);
        const byKey = {};
        v.forEach(o => { const k = key(o.vendorName || o.companyName); if (k && !byKey[k]) byKey[k] = info(o); });
        c.forEach(o => { const k = key(o.clientName || o.companyName); if (k && !byKey[k]) byKey[k] = info(o); });
        list = list.map(l => (l.party ? l : { ...l, party: byKey[key(l.ledger)] }));
      } catch { /* print without the extra details */ }
    }
    if (list.some(l => (l.entries || []).some(e => ['purchase-bill','payment','receipt','sales-bill'].includes(e.source) && e.fileNo === undefined))) {
      try {
        const get = u => axios.get(u).then(r => (Array.isArray(r.data) ? r.data : [])).catch(() => []);
        const [pbs, sbs, pos, sos, pays] = await Promise.all([
          get(`/api/bills?type=purchase&companyId=${cid}`), get(`/api/bills?type=sales&companyId=${cid}`),
          get(`/api/purchase-orders?companyId=${cid}`), get(`/api/sales-orders?companyId=${cid}`),
          get(`/api/accounts/payments?companyId=${cid}`),
        ]);
        const by = (arr, k) => { const m = {}; arr.forEach(o => { if (o && o[k] != null) m[String(o[k])] = o; }); return m; };
        const pbById = by(pbs, 'billId'), sbById = by(sbs, 'billId'), poById = by(pos, 'orderId'), soById = by(sos, 'orderId'), payById = by(pays, 'paymentId');
        const fileOf = id => { id = String(id || ''); if (soById[id]) return soById[id].orderNo || ''; const po = poById[id]; return po ? (soById[String(po.linkedSalesOrderId || '')]?.orderNo || '') : ''; };
        const fill = e => {
          if (e.fileNo !== undefined) return e;
          if (e.source === 'purchase-bill') { const b = pbById[String(e.journalId)] || {}; return { ...e, fileNo: fileOf(b.orderId), poNo: b.orderNo || poById[String(b.orderId || '')]?.poNo || '', vendorBillNo: b.vendorBillNo || '' }; }
          if (e.source === 'sales-bill')    { const b = sbById[String(e.journalId)] || {}; return { ...e, fileNo: b.orderNo || fileOf(b.orderId) }; }
          if (e.source === 'payment' || e.source === 'receipt') {
            const p = payById[String(e.journalId || '').replace(/^PMT-/, '')] || {};
            return { ...e, fileNo: fileOf(p.orderId), poNo: poById[String(p.orderId || '')]?.poNo || '',
              mode: p.paymentMode || '', chqNo: p.reference || p.referenceNo || '', notes: p.notes || '' };
          }
          return e;
        };
        list = list.map(l => ({ ...l, entries: (l.entries || []).map(fill) }));
      } catch { /* print with what we have */ }
    }
    printSelectedLedgers(list, selectedCompany, user, win);
  };

  return (
    <div style={{ fontFamily: F, background: '#f0f4fb', height: '100%', boxSizing: 'border-box', padding: '14px 16px',
      display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* ── Header — fixed; only the ledger table below scrolls ── */}
      <div style={{ background: '#fff', border: `1px solid #000`, borderRadius: 10, padding: '8px 14px', marginBottom: 10, boxShadow: '0 1px 4px rgba(0,0,0,0.04)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, display: 'flex', alignItems: 'baseline', gap: 6, whiteSpace: 'nowrap' }}>
            <span style={{ fontSize: 10.5, color: '#000' }}>Account ›</span>
            <span style={{ fontSize: 15, fontWeight: 800, color: '#000' }}>General Ledger</span>
          </div>

          {/* Summary chips */}
          {[
            { label:'Ledgers',  val: totals.count },
            { label:'Total Dr', val:`₹${fmt(totals.totalDr)}` },
            { label:'Total Cr', val:`₹${fmt(totals.totalCr)}` },
            { label:'Entries',  val: totals.entries },
          ].map((c,i) => (
            <div key={i} style={{ background:'#fff', border:`1px solid #000`, borderRadius:8, padding:'0 12px', height:30, display:'flex', alignItems:'center', gap:7, whiteSpace:'nowrap' }}>
              <span style={{ fontSize:9, color:'#000', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.4px' }}>{c.label}</span>
              <span style={{ fontSize:13, fontWeight:800, color:'#000' }}>{c.val}</span>
            </div>
          ))}

          {/* Show Cleared toggle */}
          <button onClick={() => setShowCleared(s => !s)}
            style={{ height:30, padding:'0 12px', background: showCleared ? '#f0fdf4' : '#fff', border:`1px solid #000`, borderRadius:6, fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:F, color: '#000', whiteSpace:'nowrap' }}>
            {showCleared ? '✓ Showing Cleared' : 'Show Cleared'}
          </button>

          {/* Search */}
          <div style={{ position:'relative' }}>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search ledger…"
              style={{ padding:'0 10px 0 28px', border:`1px solid #000`, borderRadius:6, fontSize:12, fontFamily:F, outline:'none', width:200, height:30, color:'#000' }}/>
            <span style={{ position:'absolute', left:8, top:'50%', transform:'translateY(-50%)', color:'#000', fontSize:13 }}>🔍</span>
          </div>

        </div>

        {/* Group filter pills */}
        <div style={{ display:'flex', gap:6, marginTop:7, flexWrap:'wrap', alignItems:'center' }}>
          {ALL_GROUPS.map(g => {
            const gc = GC[g] || GC['Other'];
            const active = group === g;
            const count  = g==='All' ? baseList.length : baseList.filter(l=>l.group===g).length;
            if (count === 0 && g !== 'All') return null;
            return (
              <button key={g} onClick={() => setGroup(g)}
                style={{ padding:'3px 10px', borderRadius:20, border:`1px solid ${active?gc.dot:BD}`,
                  background:active?gc.bg:'#fff', color:active?gc.color:'#374151',
                  fontSize:11, fontWeight:active?700:500, cursor:'pointer', fontFamily:F,
                  display:'flex', alignItems:'center', gap:5 }}>
                {g!=='All' && <span style={{ width:6,height:6,borderRadius:'50%',background:active?gc.dot:'#d1d5db' }}/>}
                {g}
                <span style={{ background:active?gc.dot:'#e2e8f0', color:active?'#fff':'#6b7280', borderRadius:10, padding:'0 5px', fontSize:9.5, fontWeight:700 }}>{count}</span>
              </button>
            );
          })}
          <div style={{ flex:1 }}/>
          {/* selection actions — shown only when ledgers are ticked */}
          {selected.size > 0 && (<>
            <span style={{ fontSize:12, fontWeight:700, color:'#104f4f', whiteSpace:'nowrap' }}>
              {selected.size} ledger{selected.size>1?'s':''} selected
            </span>
            <button onClick={printSelected}
              style={{ height:28, padding:'0 12px', borderRadius:6, fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:F, display:'flex', alignItems:'center', gap:5, whiteSpace:'nowrap', background:'#104f4f', border:'none', color:'#fff' }}>
              🖨️ Print Selected Ledger{selected.size>1?'s':''}
            </button>
            <button onClick={() => printSummary(selectedLedgers, selectedCompany, user)}
              style={{ height:28, padding:'0 12px', borderRadius:6, fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:F, display:'flex', alignItems:'center', gap:5, whiteSpace:'nowrap', background:'#fff', border:'1px solid #104f4f', color:'#104f4f' }}>
              📄 Print Summary Only
            </button>
            <button onClick={() => setSelected(new Set())}
              style={{ height:28, padding:'0 12px', borderRadius:6, fontSize:11, cursor:'pointer', fontFamily:F, display:'flex', alignItems:'center', gap:5, whiteSpace:'nowrap', fontWeight:600, background:'#fff', border:`1px solid ${BD}`, color:'#6b7280' }}>
              ✕ Clear
            </button>
            <div style={{ width:1, height:20, background:BD, margin:'0 2px' }}/>
          </>)}
          <button onClick={() => printSummary(rows, selectedCompany, user)}
            style={{ height:28, padding:'0 12px', borderRadius:6, fontSize:11, cursor:'pointer', fontFamily:F, display:'flex', alignItems:'center', gap:5, whiteSpace:'nowrap', fontWeight:600, background:'#fff', border:`1px solid ${BD}`, color:'#374151' }}>
            📄 Print All Summary ({rows.length})
          </button>
          <button onClick={() => navigate('/account/journal/create')}
            style={{ height:28, padding:'0 14px', background:P, border:'none', borderRadius:6, color:'#fff', fontSize:11.5, fontWeight:700, cursor:'pointer', whiteSpace:'nowrap', fontFamily:F }}>
            + New Journal
          </button>
          <button onClick={load}
            style={{ height:28, padding:'0 12px', background:'#fff', border:`1px solid #000`, borderRadius:6, fontSize:12, cursor:'pointer', fontFamily:F, color:'#000' }}>↻</button>
        </div>
      </div>

      {msg && <div style={{ flexShrink:0, background:'#fef2f2', border:'1px solid #fecaca', borderRadius:8, padding:'8px 14px', marginBottom:12, fontSize:12, color:'#dc2626' }}>{msg}</div>}

      {/* ── Ledger table ── */}
      {/* the card is the scroll box — its column header (sticky th) stays on top */}
      <div style={{ background:'#fff', border:`1px solid #000`, borderRadius:10, boxShadow:'0 1px 4px rgba(0,0,0,0.04)',
        flex:1, minHeight:0, overflow:'auto' }}>
        {loading ? (
          <div style={{ padding:48, textAlign:'center', color:'#9ca3af' }}>Loading ledgers…</div>
        ) : rows.length === 0 ? (
          <div style={{ padding:48, textAlign:'center', color:'#9ca3af' }}>
            No ledgers found.{' '}
            <span onClick={() => navigate('/account/journal/create')} style={{ color:P, cursor:'pointer', fontWeight:600 }}>Create a journal entry →</span>
          </div>
        ) : (
          <div>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12, fontFamily:F }}>
              <thead>
                <tr style={{ background:P }}>
                  {/* checkbox col */}
                  <th style={{ padding:'8px 12px', border:`1px solid #0d2a5c`, width:40, textAlign:'center', background:P, borderTopLeftRadius:9, position:'sticky', top:0, zIndex:20 }}>
                    <input type="checkbox" checked={selected.size===rows.length && rows.length>0}
                      onChange={toggleAll} style={{ cursor:'pointer', width:14, height:14 }}/>
                  </th>
                  {['Ledger / Account Name','Group','Total Debit (₹)','Total Credit (₹)','Balance (₹)','Status','Entries',''].map((h,i) => (
                    <th key={i} style={{ padding:'8px 12px', border:`1px solid #0d2a5c`, fontWeight:700, color:'#fff', background:P, position:'sticky', top:0, zIndex:20,
                      textAlign: i>=2&&i<=5?'right':i===6?'center':'left', whiteSpace:'nowrap', fontSize:11,
                      ...(i===7 ? { borderTopRightRadius:9 } : {}) }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((l, ri) => {
                  const gc      = GC[l.group] || GC['Other'];
                  const isOpen  = expanded === l.ledger;
                  const isSel   = selected.has(l.ledger);
                  const bal     = Math.abs(l.balance);
                  const isDr    = l.balance >= 0;
                  const hasBank = l.bankType;

                  return (
                    <React.Fragment key={l.ledger}>
                      <tr style={{ background: isSel ? '#eff6ff' : '#fff' }}>
                        {/* Checkbox */}
                        <td style={{ padding:'8px 12px', border:`1px solid #000`, textAlign:'center' }}
                          onClick={e => { e.stopPropagation(); toggleSelect(l.ledger); }}>
                          <input type="checkbox" checked={isSel} onChange={()=>{}} style={{ cursor:'pointer', width:14, height:14 }}/>
                        </td>

                        {/* Name — click to expand */}
                        <td style={{ padding:'9px 12px', border:`1px solid #000`, cursor:'pointer' }}
                          onClick={() => setExpanded(isOpen ? null : l.ledger)}>
                          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                            <span style={{ width:8, height:8, borderRadius:'50%', background:gc.dot, flexShrink:0 }}/>
                            <span style={{ fontWeight:700, color:'#000', fontSize:12.5 }}>{l.ledger}</span>
                            {hasBank && l.accountNumber && (
                              <span style={{ fontSize:10, color:'#6b7280', background:'#f1f5f9', borderRadius:4, padding:'1px 5px' }}>
                                ••{String(l.accountNumber).slice(-4)}
                              </span>
                            )}
                          </div>
                        </td>

                        <td style={{ padding:'9px 12px', border:`1px solid #000`, cursor:'pointer' }}
                          onClick={() => setExpanded(isOpen ? null : l.ledger)}>
                          <span style={{ background:gc.bg, color:gc.color, borderRadius:5, padding:'2px 8px', fontSize:10.5, fontWeight:600 }}>{l.group}</span>
                        </td>

                        <td style={{ padding:'9px 12px', border:`1px solid #000`, textAlign:'right', color:l.totalDebit>0?'#000':'#9ca3af', fontWeight:600, cursor:'pointer' }}
                          onClick={() => setExpanded(isOpen ? null : l.ledger)}>
                          {l.totalDebit>0?`₹${fmt(l.totalDebit)}`:'—'}
                        </td>

                        <td style={{ padding:'9px 12px', border:`1px solid #000`, textAlign:'right', color:l.totalCredit>0?'#000':'#9ca3af', fontWeight:600, cursor:'pointer' }}
                          onClick={() => setExpanded(isOpen ? null : l.ledger)}>
                          {l.totalCredit>0?`₹${fmt(l.totalCredit)}`:'—'}
                        </td>

                        <td style={{ padding:'9px 12px', border:`1px solid #000`, textAlign:'right', fontWeight:800, fontSize:13, cursor:'pointer',
                          color:hasBank?'#0f766e':(bal===0?'#9ca3af':'#000') }}
                          onClick={() => setExpanded(isOpen ? null : l.ledger)}>
                          {hasBank && l.currentBalance!==undefined ? `₹${fmt(l.currentBalance)}` : bal===0?'Nil':`₹${fmt(bal)}`}
                        </td>

                        <td style={{ padding:'9px 12px', border:`1px solid #000`, textAlign:'right', cursor:'pointer' }}
                          onClick={() => setExpanded(isOpen ? null : l.ledger)}>
                          {(() => {
                            const st = balanceStatus(l.partyType, l.balance, hasBank);
                            const isPending = !hasBank && bal > 0 && (
                              (l.partyType==='client' && l.balance > 0) ||
                              (l.partyType==='vendor' && l.balance < 0)
                            );
                            return (
                              <span style={{ display:'flex', alignItems:'center', justifyContent:'flex-end', gap:5, flexWrap:'nowrap' }}>
                                {isPending && (
                                  <span style={{ background:'#b45309', color:'#fff', borderRadius:4, padding:'2px 7px', fontSize:9.5, fontWeight:800, letterSpacing:'0.4px' }}>PENDING</span>
                                )}
                                <span style={{ background:st.bg, color:st.color, border:`1px solid ${st.border}`,
                                  borderRadius:5, padding:'3px 9px', fontSize:10.5, fontWeight:700, whiteSpace:'nowrap' }}>
                                  {st.label}
                                </span>
                              </span>
                            );
                          })()}
                        </td>

                        <td style={{ padding:'9px 12px', border:`1px solid #000`, textAlign:'center', color:'#000', cursor:'pointer' }}
                          onClick={() => setExpanded(isOpen ? null : l.ledger)}>
                          {(l.entries||[]).length}
                        </td>

                        {/* Expand toggle */}
                        <td style={{ padding:'8px 10px', border:`1px solid #000`, textAlign:'center', cursor:'pointer' }}
                          onClick={() => setExpanded(isOpen ? null : l.ledger)}>
                          <span style={{ fontSize:11, color:'#000', userSelect:'none' }}>{isOpen?'▲':'▼'}</span>
                        </td>
                      </tr>

                      {/* ── Expanded detail ── */}
                      {isOpen && (
                        <tr>
                          <td colSpan={9} style={{ padding:0, border:`1px solid #000` }}>
                            <div style={{ background:'#f8faff', padding:'12px 16px' }}>
                              {hasBank && l.openingBalance!==undefined && (
                                <div style={{ display:'flex', gap:16, marginBottom:10, fontSize:12 }}>
                                  <span>Opening Balance: <strong style={{ color:'#374151' }}>₹{fmt(l.openingBalance)}</strong></span>
                                  <span>Current Balance: <strong style={{ color:'#0f766e' }}>₹{fmt(l.currentBalance)}</strong></span>
                                </div>
                              )}

                              {(l.entries||[]).length === 0 ? (
                                <div style={{ color:'#9ca3af', fontSize:12, fontStyle:'italic' }}>No transactions recorded for this ledger.</div>
                              ) : (
                                <>
                                  <div style={{ fontSize:11, fontWeight:700, color:'#374151', marginBottom:8, textTransform:'uppercase', letterSpacing:'0.4px' }}>
                                    All Transactions — {l.entries.length} entries
                                  </div>
                                  <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11.5 }}>
                                    {/* same columns, opening balance and narration as the printed statement */}
                                    <thead>
                                      <tr style={{ background:P }}>
                                        {['Sr No.','Date','File No.','Narration / Description','Transaction Type','Debit (₹)','Credit (₹)','Closing Bal.'].map((h,i) => (
                                          <th key={i} style={{ padding:'5px 10px', color:'#fff', fontWeight:700,
                                            textAlign:i>=5?'right':i===0?'center':'left', border:'1px solid rgba(255,255,255,0.2)', whiteSpace:'nowrap' }}>{h}</th>
                                        ))}
                                      </tr>
                                    </thead>
                                    {(() => {
                                      const ents    = (l.entries||[]).slice().sort((x,y)=>new Date(x.date)-new Date(y.date));
                                      const opening = +((parseFloat(l.balance)||0) - ents.reduce((t,e)=>t+(e.debit||0)-(e.credit||0), 0)).toFixed(2);
                                      const sumDr   = ents.reduce((t,e)=>t+(e.debit||0), 0);
                                      const sumCr   = ents.reduce((t,e)=>t+(e.credit||0), 0);
                                      const cell    = { padding:'5px 10px', border:`1px solid ${BD}` };
                                      let running = opening;
                                      return (<>
                                        <tbody>
                                          <tr style={{ background:'#fff' }}>
                                            <td style={cell}></td>
                                            <td style={{ ...cell, whiteSpace:'nowrap' }}>{ents[0] ? fmtD(ents[0].date) : ''}</td>
                                            <td style={cell}></td>
                                            <td style={{ ...cell, fontWeight:700 }}>Opening Balance</td>
                                            <td style={cell}></td><td style={cell}></td><td style={cell}></td>
                                            <td style={{ ...cell, textAlign:'right', fontWeight:700, color:opening>=0?'#1e40af':'#7c3aed' }}>₹{fmt(Math.abs(opening))} {opening>=0?'Dr':'Cr'}</td>
                                          </tr>
                                          {ents.map((e,ii) => {
                                            running += (e.debit||0)-(e.credit||0);
                                            const rd = running >= 0;
                                            const src = e.source;
                                            const scfg = src==='sales-bill'?{bg:'#eff6ff',color:'#1e40af'}
                                              :src==='purchase-bill'?{bg:'#fff7ed',color:'#9a3412'}
                                              :src==='receipt'?{bg:'#f0fdf4',color:'#15803d'}
                                              :src==='payment'?{bg:'#fdf4ff',color:'#7e22ce'}
                                              :src==='expense'?{bg:'#fff7ed',color:'#b45309'}
                                              :{bg:'#f8faff',color:'#374151'};
                                            return (
                                              <tr key={ii} style={{ background:ii%2===0?'#f0f4fb':'#fff' }}>
                                                <td style={{ ...cell, textAlign:'center', color:'#6b7280' }}>{ii+1}</td>
                                                <td style={{ ...cell, whiteSpace:'nowrap' }}>{fmtD(e.date)}</td>
                                                <td style={{ ...cell, whiteSpace:'nowrap', fontWeight:600, color:P }}>{e.fileNo||'—'}</td>
                                                <td style={cell}>{printNarration(e)}</td>
                                                <td style={cell}>
                                                  <span style={{ background:scfg.bg, color:scfg.color, borderRadius:4, padding:'1px 6px', fontSize:10, fontWeight:700, whiteSpace:'nowrap' }}>{srcLabel(src)}</span>
                                                </td>
                                                <td style={{ ...cell, textAlign:'right', color:e.debit>0?'#1e40af':'#d1d5db', fontWeight:e.debit>0?600:400 }}>
                                                  {e.debit>0?`₹${fmt(e.debit)}`:'—'}
                                                </td>
                                                <td style={{ ...cell, textAlign:'right', color:e.credit>0?'#7c3aed':'#d1d5db', fontWeight:e.credit>0?600:400 }}>
                                                  {e.credit>0?`₹${fmt(e.credit)}`:'—'}
                                                </td>
                                                <td style={{ ...cell, textAlign:'right', fontWeight:700 }}>
                                                  <span style={{ display:'flex', alignItems:'center', justifyContent:'flex-end', gap:4 }}>
                                                    {Math.abs(running) > 0.005 && (src==='sales-bill'||src==='purchase-bill') && (
                                                      <span style={{ background:'#b45309', color:'#fff', borderRadius:3, padding:'1px 5px', fontSize:9, fontWeight:800 }}>PENDING</span>
                                                    )}
                                                    <span style={{ color:rd?'#1e40af':'#7c3aed', whiteSpace:'nowrap' }}>₹{fmt(Math.abs(running))} {rd?'Dr':'Cr'}</span>
                                                  </span>
                                                </td>
                                              </tr>
                                            );
                                          })}
                                        </tbody>
                                        <tfoot>
                                          <tr style={{ background:'#e0e7ff', fontWeight:700 }}>
                                            <td colSpan={5} style={{ ...cell, textAlign:'right' }}>Total ({ents.length} transaction{ents.length===1?'':'s'})</td>
                                            <td style={{ ...cell, textAlign:'right', color:'#1e40af' }}>₹{fmt(sumDr)}</td>
                                            <td style={{ ...cell, textAlign:'right', color:'#7c3aed' }}>₹{fmt(sumCr)}</td>
                                            <td style={{ ...cell, textAlign:'right', fontWeight:800, fontSize:13, color:l.balance>=0?'#1e40af':'#7c3aed', whiteSpace:'nowrap' }}>
                                              ₹{fmt(Math.abs(l.balance))} {l.balance>=0?'Dr':'Cr'}
                                            </td>
                                          </tr>
                                        </tfoot>
                                      </>);
                                    })()}
                                  </table>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
            <div style={{ padding:'8px 14px', background:'#f8faff', borderTop:`1px solid ${BD}`, fontSize:11, color:'#6b7280', display:'flex', justifyContent:'space-between' }}>
              <span>Showing {rows.length} of {enriched.length} ledgers{selected.size>0?` · ${selected.size} selected`:''}</span>
              <span>Total Dr: <strong style={{ color:'#1e40af' }}>₹{fmt(rows.reduce((s,l)=>s+l.totalDebit,0))}</strong> &nbsp;|&nbsp; Total Cr: <strong style={{ color:'#7c3aed' }}>₹{fmt(rows.reduce((s,l)=>s+l.totalCredit,0))}</strong></span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
