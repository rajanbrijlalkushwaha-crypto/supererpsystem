import React, { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { useCompany } from '../../../context/CompanyContext';

const F  = "'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif";
const P  = '#133d80';
const BD = '#E5EAF2';
const fmt  = n => (parseFloat(n)||0).toLocaleString('en-IN', { minimumFractionDigits: 2 });
const fmt2 = n => (parseFloat(n)||0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
      ? { label: 'Dues to Receive', bg: '#eff6ff', color: '#1e40af', border: '#bfdbfe' }
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
  s==='security-deposit' ? 'Security Deposit' : 'Journal';

/* Print individual ledger statements (one per page) */
const printSelectedLedgers = (selected, company) => {
  const pt = now();
  const pages = selected.map((l, idx) => {
    const entries = (l.entries||[]).slice().sort((a,b)=>new Date(a.date)-new Date(b.date));
    const bal  = Math.abs(l.balance);
    const isDr = l.balance >= 0;
    let running = l.openingBalance || 0;
    const trows = entries.map((e,i) => {
      running += (e.debit||0)-(e.credit||0);
      const rd = running >= 0;
      return `<tr style="background:${i%2===0?'#fff':'#f9fafb'}">
        <td>${fmtD(e.date)}</td>
        <td>${e.narration||'—'}</td>
        <td>${e.refNo||'—'}</td>
        <td style="font-size:10px;color:#6b7280">${srcLabel(e.source)}</td>
        <td style="text-align:right;color:${e.debit>0?'#1e40af':'#aaa'};font-weight:${e.debit>0?700:400}">${e.debit>0?'₹'+fmt2(e.debit):'—'}</td>
        <td style="text-align:right;color:${e.credit>0?'#7c3aed':'#aaa'};font-weight:${e.credit>0?700:400}">${e.credit>0?'₹'+fmt2(e.credit):'—'}</td>
        <td style="text-align:right;font-weight:700;color:${rd?'#1e40af':'#7c3aed'}">₹${fmt2(Math.abs(running))} ${rd?'Dr':'Cr'}</td>
      </tr>`;
    }).join('');

    return `
    <div style="${idx>0?'page-break-before:always;':''}padding-top:${idx>0?'20px':'0'}">
      ${companyHeader(company, pt)}
      <div style="background:#f0f4ff;border:1px solid #c7d2fe;border-radius:6px;padding:12px 16px;margin-bottom:12px;display:flex;justify-content:space-between;align-items:center">
        <div>
          <div style="font-size:10px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:0.5px">Ledger Statement</div>
          <div style="font-size:18px;font-weight:900;color:#133d80;margin-top:2px">${l.ledger}</div>
          ${l.partyType?`<div style="font-size:10px;color:#6b7280;text-transform:capitalize;margin-top:2px">${l.partyType}</div>`:''}
        </div>
        <div style="text-align:right">
          <div style="font-size:10px;color:#6b7280">Closing Balance</div>
          <div style="font-size:22px;font-weight:900;color:${isDr?'#1e40af':'#7c3aed'}">₹${fmt2(bal)}</div>
          <div style="font-size:11px;font-weight:700;color:${isDr?'#1e40af':'#7c3aed'}">${isDr?'Dr — Receivable':'Cr — Payable'}</div>
        </div>
      </div>
      <div style="display:flex;gap:12px;margin-bottom:12px">
        ${[{l:'Total Transactions',v:entries.length,c:'#374151'},{l:'Total Debit',v:'₹'+fmt2(l.totalDebit),c:'#1e40af'},{l:'Total Credit',v:'₹'+fmt2(l.totalCredit),c:'#7c3aed'},{l:'Net Balance',v:'₹'+fmt2(bal)+' '+(isDr?'Dr':'Cr'),c:isDr?'#1e40af':'#7c3aed'}]
          .map(s=>`<div style="flex:1;background:#f8faff;border:1px solid #e2e8f0;border-radius:5px;padding:7px 12px;text-align:center">
            <div style="font-size:9px;color:#9ca3af;font-weight:700;text-transform:uppercase">${s.l}</div>
            <div style="font-size:14px;font-weight:800;color:${s.c};margin-top:2px">${s.v}</div>
          </div>`).join('')}
      </div>
      ${entries.length===0
        ? `<div style="padding:24px;text-align:center;color:#9ca3af;font-style:italic">No transactions recorded.</div>`
        : `<table>
          <thead><tr>
            <th style="width:80px">Date</th><th>Narration</th><th style="width:110px">Ref No.</th><th style="width:80px">Source</th>
            <th style="text-align:right;width:110px">Debit (₹)</th><th style="text-align:right;width:110px">Credit (₹)</th><th style="text-align:right;width:120px">Running Bal</th>
          </tr></thead>
          <tbody>${trows}</tbody>
          <tfoot><tr>
            <td colspan="4" style="padding:6px 8px;border:1px solid #c7d2fe;background:#e0e7ff;font-weight:800">Closing Balance</td>
            <td style="padding:6px 8px;border:1px solid #c7d2fe;background:#e0e7ff;text-align:right;font-weight:700;color:#1e40af">₹${fmt2(l.totalDebit)}</td>
            <td style="padding:6px 8px;border:1px solid #c7d2fe;background:#e0e7ff;text-align:right;font-weight:700;color:#7c3aed">₹${fmt2(l.totalCredit)}</td>
            <td style="padding:6px 8px;border:1px solid #c7d2fe;background:#e0e7ff;text-align:right;font-weight:800;color:${isDr?'#1e40af':'#7c3aed'}">₹${fmt2(bal)} ${isDr?'Dr':'Cr'}</td>
          </tr></tfoot>
        </table>`}
      <div style="margin-top:20px;border-top:1px solid #e2e8f0;padding-top:8px;display:flex;justify-content:space-between;color:#9ca3af;font-size:9.5px">
        <span>${company?.companyName||''} | GSTIN: ${company?.gstin||''}</span>
        <span>Computer generated — no signature required.</span>
      </div>
    </div>`;
  });

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/>
  <title>Ledger Statements</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:'Segoe UI',Arial,sans-serif;font-size:11.5px;color:#1f2937;background:#fff;padding:20px}
    table{width:100%;border-collapse:collapse}
    th{background:#133d80;color:#fff;padding:6px 8px;font-size:10.5px;font-weight:700;text-align:left;border:1px solid #0d2d6b}
    td{padding:5px 8px;border:1px solid #e2e8f0;font-size:11px}
    .btn{background:#133d80;color:#fff;border:none;padding:8px 20px;border-radius:5px;cursor:pointer;font-size:13px;font-weight:700;margin-bottom:18px}
    @media print{.btn{display:none}@page{margin:12mm;size:A4 portrait}}
  </style></head><body>
  <button class="btn" onclick="window.print()">🖨ï¸ Print / Save as PDF</button>
  ${pages.join('')}
  </body></html>`;

  const w = window.open('','_blank','width=860,height=900');
  w.document.write(html);
  w.document.close();
};

/* Print summary of all (or filtered) ledgers */
const printSummary = (ledgerList, company) => {
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
    return `<tr style="background:${i%2===0?'#fff':'#f9fafb'}">
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
    body{font-family:'Segoe UI',Arial,sans-serif;font-size:11.5px;color:#1f2937;background:#fff;padding:20px}
    table{width:100%;border-collapse:collapse}
    th{background:#133d80;color:#fff;padding:6px 8px;font-size:10.5px;font-weight:700;text-align:left;border:1px solid #0d2d6b}
    td{padding:5px 8px;border:1px solid #e2e8f0;font-size:11px}
    .btn{background:#133d80;color:#fff;border:none;padding:8px 20px;border-radius:5px;cursor:pointer;font-size:13px;font-weight:700;margin-bottom:18px}
    @media print{.btn{display:none}@page{margin:12mm;size:A4 portrait}}
  </style></head><body>
  <button class="btn" onclick="window.print()">🖨ï¸ Print / Save as PDF</button>
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
    <span>${company?.companyName||''} | GSTIN: ${company?.gstin||''}</span>
    <span>Computer generated — no signature required.</span>
  </div>
  </body></html>`;

  const w = window.open('','_blank','width=860,height=900');
  w.document.write(html);
  w.document.close();
};

/* ════════════════════════════════════════════════════════
   COMPONENT
════════════════════════════════════════════════════════ */
export default function LedgerView() {
  const { selectedCompany } = useCompany();
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

  const totals = useMemo(() => ({
    count: enriched.length,
    totalDr: enriched.reduce((s,l)=>s+l.totalDebit,0),
    totalCr: enriched.reduce((s,l)=>s+l.totalCredit,0),
    entries: enriched.reduce((s,l)=>s+(l.entries||[]).length,0),
  }), [enriched]);

  const baseList = useMemo(() => {
    if (showCleared) return enriched;
    return enriched.filter(l => l.bankType || (parseFloat(l.balance) || 0) !== 0);
  }, [enriched, showCleared]);

  const rows = useMemo(() => {
    let list = baseList;
    if (group !== 'All') list = list.filter(l => l.group === group);
    if (search.trim()) { const q = search.toLowerCase(); list = list.filter(l => l.ledger.toLowerCase().includes(q)); }
    return list;
  }, [baseList, group, search]);

  const toggleSelect = (name) => setSelected(s => {
    const n = new Set(s);
    n.has(name) ? n.delete(name) : n.add(name);
    return n;
  });
  const toggleAll = () => setSelected(s => s.size === rows.length ? new Set() : new Set(rows.map(l=>l.ledger)));
  const selectedLedgers = enriched.filter(l => selected.has(l.ledger));

  return (
    <div style={{ fontFamily: F, background: '#f0f4fb', minHeight: '100vh', padding: '14px 16px' }}>

      {/* ── Header ── */}
      <div style={{ background: '#fff', border: `1px solid ${BD}`, borderRadius: 10, padding: '12px 16px', marginBottom: 14, boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10.5, color: '#6b7280', marginBottom: 1 }}>Account</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#111827' }}>General Ledger</div>
          </div>

          {/* Summary chips */}
          {[
            { label:'Ledgers',  val: totals.count,                     color:'#1e40af' },
            { label:'Total Dr', val:`₹${fmt(totals.totalDr)}`,         color:'#1e40af' },
            { label:'Total Cr', val:`₹${fmt(totals.totalCr)}`,         color:'#7c3aed' },
            { label:'Entries',  val: totals.entries,                   color:'#374151' },
          ].map((c,i) => (
            <div key={i} style={{ background:'#f8faff', border:`1px solid ${BD}`, borderRadius:8, padding:'6px 14px', textAlign:'center' }}>
              <div style={{ fontSize:9, color:'#9ca3af', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.4px' }}>{c.label}</div>
              <div style={{ fontSize:14, fontWeight:800, color:c.color, marginTop:1 }}>{c.val}</div>
            </div>
          ))}

          {/* Show Cleared toggle */}
          <button onClick={() => setShowCleared(s => !s)}
            style={{ height:32, padding:'0 12px', background: showCleared ? '#f0fdf4' : '#fff', border:`1px solid ${showCleared ? '#86efac' : BD}`, borderRadius:6, fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:F, color: showCleared ? '#15803d' : '#374151', whiteSpace:'nowrap' }}>
            {showCleared ? '✓ Showing Cleared' : 'Show Cleared'}
          </button>

          {/* Search */}
          <div style={{ position:'relative' }}>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search ledger…"
              style={{ height:32, padding:'0 10px 0 28px', border:`1px solid ${BD}`, borderRadius:6, fontSize:12, fontFamily:F, outline:'none', width:200 }}/>
            <span style={{ position:'absolute', left:8, top:'50%', transform:'translateY(-50%)', color:'#9ca3af', fontSize:13 }}>🔍</span>
          </div>

          <button onClick={() => navigate('/account/journal/create')}
            style={{ height:32, padding:'0 14px', background:P, border:'none', borderRadius:6, color:'#fff', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:F }}>
            + New Journal
          </button>
          <button onClick={load}
            style={{ height:32, padding:'0 12px', background:'#fff', border:`1px solid ${BD}`, borderRadius:6, fontSize:12, cursor:'pointer', fontFamily:F }}>↻</button>
        </div>

        {/* Group filter pills */}
        <div style={{ display:'flex', gap:6, marginTop:10, flexWrap:'wrap' }}>
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
        </div>
      </div>

      {/* ── Selection / Print bar — appears only when rows are selected ── */}
      {selected.size > 0 && (
        <div style={{ background:'#104f4f', border:'1px solid #1e40af', borderRadius:8, padding:'10px 16px', marginBottom:12,
          display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
          <span style={{ color:'#fff', fontWeight:700, fontSize:13 }}>
            {selected.size} ledger{selected.size>1?'s':''} selected
          </span>
          <div style={{ flex:1 }}/>
          <button onClick={() => printSelectedLedgers(selectedLedgers, selectedCompany)}
            style={{ height:34, padding:'0 18px', background:'#fff', border:'none', borderRadius:6, color:'#104f4f',
              fontSize:12, fontWeight:800, cursor:'pointer', fontFamily:F, display:'flex', alignItems:'center', gap:6 }}>
            🖨ï¸ Print Selected Ledger{selected.size>1?'s':''}
          </button>
          <button onClick={() => printSummary(selectedLedgers, selectedCompany)}
            style={{ height:34, padding:'0 18px', background:'rgba(255,255,255,0.15)', border:'1px solid rgba(255,255,255,0.4)',
              borderRadius:6, color:'#fff', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:F, display:'flex', alignItems:'center', gap:6 }}>
            📄 Print Summary Only
          </button>
          <button onClick={() => setSelected(new Set())}
            style={{ height:34, padding:'0 12px', background:'transparent', border:'1px solid rgba(255,255,255,0.3)',
              borderRadius:6, color:'rgba(255,255,255,0.7)', fontSize:11, cursor:'pointer', fontFamily:F }}>
            ✕ Clear
          </button>
        </div>
      )}

      {/* Print All Summary button — always visible */}
      <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:10, gap:8 }}>
        <button onClick={() => printSummary(rows, selectedCompany)}
          style={{ height:30, padding:'0 14px', background:'#fff', border:`1px solid ${BD}`, borderRadius:6,
            color:'#374151', fontSize:11, fontWeight:600, cursor:'pointer', fontFamily:F, display:'flex', alignItems:'center', gap:5 }}>
          📄 Print All Summary ({rows.length})
        </button>
      </div>

      {msg && <div style={{ background:'#fef2f2', border:'1px solid #fecaca', borderRadius:8, padding:'8px 14px', marginBottom:12, fontSize:12, color:'#dc2626' }}>{msg}</div>}

      {/* ── Ledger table ── */}
      <div style={{ background:'#fff', border:`1px solid ${BD}`, borderRadius:10, overflow:'hidden', boxShadow:'0 1px 4px rgba(0,0,0,0.04)' }}>
        {loading ? (
          <div style={{ padding:48, textAlign:'center', color:'#9ca3af' }}>Loading ledgers…</div>
        ) : rows.length === 0 ? (
          <div style={{ padding:48, textAlign:'center', color:'#9ca3af' }}>
            No ledgers found.{' '}
            <span onClick={() => navigate('/account/journal/create')} style={{ color:P, cursor:'pointer', fontWeight:600 }}>Create a journal entry →</span>
          </div>
        ) : (
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12, fontFamily:F }}>
              <thead>
                <tr style={{ background:'#f8faff' }}>
                  {/* checkbox col */}
                  <th style={{ padding:'8px 12px', border:`1px solid ${BD}`, width:40, textAlign:'center' }}>
                    <input type="checkbox" checked={selected.size===rows.length && rows.length>0}
                      onChange={toggleAll} style={{ cursor:'pointer', width:14, height:14 }}/>
                  </th>
                  {['Ledger / Account Name','Group','Total Debit (₹)','Total Credit (₹)','Balance (₹)','Status','Entries',''].map((h,i) => (
                    <th key={i} style={{ padding:'8px 12px', border:`1px solid ${BD}`, fontWeight:700, color:'#374151',
                      textAlign: i>=2&&i<=5?'right':i===6?'center':'left', whiteSpace:'nowrap', fontSize:11 }}>{h}</th>
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
                      <tr style={{ background: isSel ? '#eff6ff' : ri%2===0 ? '#fff' : '#f8faff' }}>
                        {/* Checkbox */}
                        <td style={{ padding:'8px 12px', border:`1px solid ${BD}`, textAlign:'center' }}
                          onClick={e => { e.stopPropagation(); toggleSelect(l.ledger); }}>
                          <input type="checkbox" checked={isSel} onChange={()=>{}} style={{ cursor:'pointer', width:14, height:14 }}/>
                        </td>

                        {/* Name — click to expand */}
                        <td style={{ padding:'9px 12px', border:`1px solid ${BD}`, cursor:'pointer' }}
                          onClick={() => setExpanded(isOpen ? null : l.ledger)}>
                          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                            <span style={{ width:8, height:8, borderRadius:'50%', background:gc.dot, flexShrink:0 }}/>
                            <span style={{ fontWeight:700, color:'#111827', fontSize:12.5 }}>{l.ledger}</span>
                            {hasBank && l.accountNumber && (
                              <span style={{ fontSize:10, color:'#6b7280', background:'#f1f5f9', borderRadius:4, padding:'1px 5px' }}>
                                ••{String(l.accountNumber).slice(-4)}
                              </span>
                            )}
                          </div>
                        </td>

                        <td style={{ padding:'9px 12px', border:`1px solid ${BD}`, cursor:'pointer' }}
                          onClick={() => setExpanded(isOpen ? null : l.ledger)}>
                          <span style={{ background:gc.bg, color:gc.color, borderRadius:5, padding:'2px 8px', fontSize:10.5, fontWeight:600 }}>{l.group}</span>
                        </td>

                        <td style={{ padding:'9px 12px', border:`1px solid ${BD}`, textAlign:'right', color:l.totalDebit>0?'#1e40af':'#d1d5db', fontWeight:600, cursor:'pointer' }}
                          onClick={() => setExpanded(isOpen ? null : l.ledger)}>
                          {l.totalDebit>0?`₹${fmt(l.totalDebit)}`:'—'}
                        </td>

                        <td style={{ padding:'9px 12px', border:`1px solid ${BD}`, textAlign:'right', color:l.totalCredit>0?'#7c3aed':'#d1d5db', fontWeight:600, cursor:'pointer' }}
                          onClick={() => setExpanded(isOpen ? null : l.ledger)}>
                          {l.totalCredit>0?`₹${fmt(l.totalCredit)}`:'—'}
                        </td>

                        <td style={{ padding:'9px 12px', border:`1px solid ${BD}`, textAlign:'right', fontWeight:800, fontSize:13, cursor:'pointer',
                          color:hasBank?'#0f766e':(bal===0?'#9ca3af':'#111827') }}
                          onClick={() => setExpanded(isOpen ? null : l.ledger)}>
                          {hasBank && l.currentBalance!==undefined ? `₹${fmt(l.currentBalance)}` : bal===0?'Nil':`₹${fmt(bal)}`}
                        </td>

                        <td style={{ padding:'9px 12px', border:`1px solid ${BD}`, textAlign:'right', cursor:'pointer' }}
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

                        <td style={{ padding:'9px 12px', border:`1px solid ${BD}`, textAlign:'center', color:'#6b7280', cursor:'pointer' }}
                          onClick={() => setExpanded(isOpen ? null : l.ledger)}>
                          {(l.entries||[]).length}
                        </td>

                        {/* Expand toggle */}
                        <td style={{ padding:'8px 10px', border:`1px solid ${BD}`, textAlign:'center', cursor:'pointer' }}
                          onClick={() => setExpanded(isOpen ? null : l.ledger)}>
                          <span style={{ fontSize:11, color:'#94a3b8', userSelect:'none' }}>{isOpen?'▲':'▼'}</span>
                        </td>
                      </tr>

                      {/* ── Expanded detail ── */}
                      {isOpen && (
                        <tr>
                          <td colSpan={9} style={{ padding:0, border:`1px solid ${BD}` }}>
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
                                    <thead>
                                      <tr style={{ background:P }}>
                                        {['Ref #','Date','Narration','Source','Debit (₹)','Credit (₹)','Running Bal'].map((h,i) => (
                                          <th key={i} style={{ padding:'5px 10px', color:'#fff', fontWeight:700,
                                            textAlign:i>=4?'right':'left', border:'1px solid rgba(255,255,255,0.2)', whiteSpace:'nowrap' }}>{h}</th>
                                        ))}
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {(() => {
                                        let running = l.openingBalance || 0;
                                        return (l.entries||[]).map((e,ii) => {
                                          running += (e.debit||0)-(e.credit||0);
                                          const rd = running >= 0;
                                          const src = e.source;
                                          const scfg = src==='sales-bill'?{label:'Sales Bill',bg:'#eff6ff',color:'#1e40af'}
                                            :src==='purchase-bill'?{label:'Purchase Bill',bg:'#fff7ed',color:'#9a3412'}
                                            :src==='receipt'?{label:'Receipt',bg:'#f0fdf4',color:'#15803d'}
                                            :src==='payment'?{label:'Payment',bg:'#fdf4ff',color:'#7e22ce'}
                                            :{label:'Journal',bg:'#f8faff',color:'#374151'};
                                          return (
                                            <tr key={ii} style={{ background:ii%2===0?'#fff':'#f0f4fb' }}>
                                              <td style={{ padding:'5px 10px', border:`1px solid ${BD}`, fontWeight:700, color:P }}>{e.refNo||e.journalId||'—'}</td>
                                              <td style={{ padding:'5px 10px', border:`1px solid ${BD}` }}>{fmtD(e.date)}</td>
                                              <td style={{ padding:'5px 10px', border:`1px solid ${BD}`, maxWidth:220, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{e.narration||'—'}</td>
                                              <td style={{ padding:'5px 10px', border:`1px solid ${BD}` }}>
                                                <span style={{ background:scfg.bg, color:scfg.color, borderRadius:4, padding:'1px 6px', fontSize:10, fontWeight:700 }}>{scfg.label}</span>
                                              </td>
                                              <td style={{ padding:'5px 10px', border:`1px solid ${BD}`, textAlign:'right', color:e.debit>0?'#1e40af':'#d1d5db', fontWeight:e.debit>0?600:400 }}>
                                                {e.debit>0?`₹${fmt(e.debit)}`:'—'}
                                              </td>
                                              <td style={{ padding:'5px 10px', border:`1px solid ${BD}`, textAlign:'right', color:e.credit>0?'#7c3aed':'#d1d5db', fontWeight:e.credit>0?600:400 }}>
                                                {e.credit>0?`₹${fmt(e.credit)}`:'—'}
                                              </td>
                                              <td style={{ padding:'5px 10px', border:`1px solid ${BD}`, textAlign:'right', fontWeight:700 }}>
                                                <span style={{ display:'flex', alignItems:'center', justifyContent:'flex-end', gap:4 }}>
                                                  {Math.abs(running) > 0.005 && (src==='sales-bill'||src==='purchase-bill') && (
                                                    <span style={{ background:'#b45309', color:'#fff', borderRadius:3, padding:'1px 5px', fontSize:9, fontWeight:800 }}>PENDING</span>
                                                  )}
                                                  <span style={{ color:rd?'#1e40af':'#7c3aed' }}>₹{fmt(Math.abs(running))} {rd?'Dr':'Cr'}</span>
                                                </span>
                                              </td>
                                            </tr>
                                          );
                                        });
                                      })()}
                                    </tbody>
                                    <tfoot>
                                      <tr style={{ background:'#e0e7ff', fontWeight:700 }}>
                                        <td colSpan={4} style={{ padding:'6px 10px', border:`1px solid ${BD}` }}>Closing Balance</td>
                                        <td style={{ padding:'6px 10px', border:`1px solid ${BD}`, textAlign:'right', color:'#1e40af' }}>₹{fmt(l.totalDebit)}</td>
                                        <td style={{ padding:'6px 10px', border:`1px solid ${BD}`, textAlign:'right', color:'#7c3aed' }}>₹{fmt(l.totalCredit)}</td>
                                        <td style={{ padding:'6px 10px', border:`1px solid ${BD}`, textAlign:'right', fontWeight:800, fontSize:13, color:l.balance>=0?'#1e40af':'#7c3aed' }}>
                                          ₹{fmt(Math.abs(l.balance))} {l.balance>=0?'Dr':'Cr'}
                                        </td>
                                      </tr>
                                    </tfoot>
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
