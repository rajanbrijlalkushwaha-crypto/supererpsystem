import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useCompany } from '../../context/CompanyContext';
import { useNavigate } from 'react-router-dom';

const F = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const P = '#2563EB';
const BD = '#D1D5DB';

const STEPS = ['Connect', 'Select Company', 'Import Company', 'Choose Data', 'Preview & Import'];

const DATA_TYPE_OPTIONS = [
  { key: 'ledgers',       label: 'All Ledgers',      sub: 'All ledger accounts',           icon: '📒', color: '#0891b2' },
  { key: 'debtors',       label: 'Debtors Only',     sub: 'Sundry Debtors → Clients',      icon: '👥', color: '#3b82f6' },
  { key: 'creditors',     label: 'Creditors Only',   sub: 'Sundry Creditors → Vendors',    icon: '🏭', color: '#8b5cf6' },
  { key: 'salesorders',   label: 'Sales Orders',     sub: 'Sales Orders → SO Records',     icon: '🧾', color: '#10b981' },
  { key: 'purchaseorders',label: 'Purchase Orders',  sub: 'Purchase Orders → PO Records',  icon: '📦', color: '#f59e0b' },
  { key: 'payments',      label: 'Payments',         sub: 'Payment Vouchers → Payments',   icon: '💸', color: '#ef4444' },
  { key: 'receipts',      label: 'Receipts',         sub: 'Receipt Vouchers → Receipts',   icon: '🧮', color: '#06b6d4' },
];

const TYPE_COLORS = {
  client:        { bg: '#dbeafe', color: '#1d4ed8' },
  vendor:        { bg: '#ede9fe', color: '#7c3aed' },
  ledger:        { bg: '#e0f2fe', color: '#0369a1' },
  salesorder:    { bg: '#d1fae5', color: '#065f46' },
  purchaseorder: { bg: '#fef3c7', color: '#92400e' },
  payment:       { bg: '#fee2e2', color: '#991b1b' },
  receipt:       { bg: '#cffafe', color: '#155e75' },
};

const ri = () => ({ height:32, padding:'0 10px', border:'1px solid #9CA3AF', borderRadius:6, fontSize:13, fontFamily:F, color:'#111827', background:'#fff', outline:'none', width:'100%', boxSizing:'border-box' });

const Import = () => {
  const { selectedCompany, setSelectedCompany } = useCompany();
  const navigate = useNavigate();

  const [step, setStep]                       = useState(0);
  const [config, setConfig]                   = useState({ host: 'localhost', port: 9000 });
  const [detectedIPs, setDetectedIPs]         = useState([]);
  const [connecting, setConnecting]           = useState(false);
  const [tallyCompanies, setTallyCompanies]   = useState([]); // [{ name, port }]
  const [selectedTallyCompany, setSelectedTallyCompany] = useState('');
  const [selectedTallyPort, setSelectedTallyPort]       = useState(null);
  const [companyInfo, setCompanyInfo]         = useState(null);
  const [loadingInfo, setLoadingInfo]         = useState(false);
  const [erpCompanyForm, setErpCompanyForm]   = useState({ companyName:'', address:'', state:'', pincode:'', email:'', phone:'', gstin:'', pan:'' });
  const [importingCompany, setImportingCompany] = useState(false);
  const [importedErpCompany, setImportedErpCompany] = useState(null);
  const [skipCompanyImport, setSkipCompanyImport] = useState(false);
  const [dataTypes, setDataTypes]             = useState({ ledgers:false, debtors:true, creditors:true, salesorders:false, purchaseorders:false, payments:false, receipts:false });
  const [fetching, setFetching]               = useState(false);
  const [previewItems, setPreviewItems]       = useState([]);
  const [selectedIds, setSelectedIds]         = useState(new Set());
  const [staging, setStaging]                 = useState(false);
  const [msg, setMsg]                         = useState({ text:'', type:'' });
  const [filterType, setFilterType]           = useState('all');
  const [manualCoName, setManualCoName]       = useState('');
  const [pingResult, setPingResult]           = useState(null);
  const [pinging, setPinging]                 = useState(false);

  useEffect(() => {
    axios.get('/api/tally/config').then(r => setConfig(r.data)).catch(() => {});
    axios.get('/api/tally/local-ips').then(r => setDetectedIPs(r.data.ips || [])).catch(() => {});
  }, []);

  const showMsg = (text, type = 'error') => setMsg({ text, type });
  const clearMsg = () => setMsg({ text:'', type:'' });

  const handlePing = async () => {
    setPinging(true); setPingResult(null);
    try {
      await axios.post('/api/tally/config', config);
      const r = await axios.get('/api/tally/ping');
      setPingResult(r.data);
    } catch (err) {
      setPingResult({ error: err.response?.data?.error || err.message });
    } finally { setPinging(false); }
  };

  // STEP 0: Connect
  const handleConnect = async () => {
    setConnecting(true); clearMsg();
    try {
      await axios.post('/api/tally/config', config);
      const res = await axios.get('/api/tally/companies');
      if (!res.data.companies || res.data.companies.length === 0) {
        const debug = res.data._debug || [];
        const debugLines = debug.map(d =>
          `Port ${d.port}: found=[${(d.found||[]).join(', ')||'none'}]  raw=${d.snippet ? d.snippet.substring(0,200) : '(empty)'}`
        ).join('\n');
        showMsg(
          'Connected to Tally but no companies found.\n\n' +
          '→ Make sure at least one company is OPEN in Tally (not just at Gateway screen).\n' +
          '→ In Tally: F12 → Advanced Config → Enable ODBC Server → Yes → Port 9000\n' +
          '→ Then click "Test Raw" button below to see what Tally is actually returning.' +
          (debugLines ? '\n\nPort scan results:\n' + debugLines : '')
        );
        return;
      }
      setTallyCompanies(res.data.companies);
      setStep(1);
    } catch (err) {
      showMsg(err.response?.data?.error || err.message);
    } finally { setConnecting(false); }
  };

  // STEP 1: Select company → fetch its details
  const handleSelectCompany = async (co) => {
    // co is { name, port }
    setSelectedTallyCompany(co.name);
    setSelectedTallyPort(co.port);
    setLoadingInfo(true);
    setCompanyInfo(null);
    try {
      const res = await axios.get(`/api/tally/company-info?name=${encodeURIComponent(co.name)}&port=${co.port}`);
      setCompanyInfo(res.data);
      setErpCompanyForm({
        companyName: res.data.formalName || res.data.name || co,
        address:     res.data.address || '',
        state:       res.data.state || '',
        pincode:     res.data.pincode || '',
        email:       res.data.email || '',
        phone:       res.data.phone || '',
        gstin:       res.data.gstin || '',
        pan:         res.data.pan || '',
      });
    } catch { setCompanyInfo({ name: co }); }
    finally { setLoadingInfo(false); }
  };

  // STEP 2: Import or skip company
  const handleImportCompany = async () => {
    setImportingCompany(true); clearMsg();
    try {
      const res = await axios.post('/api/tally/create-erp-company', {
        name: selectedTallyCompany,
        ...erpCompanyForm,
      });
      setImportedErpCompany(res.data.company);
      showMsg(`Company "${res.data.company.companyName}" created in ERP (ID: ${res.data.company.companyId})`, 'success');
      setTimeout(() => { clearMsg(); setStep(3); }, 1800);
    } catch (err) {
      showMsg(err.response?.data?.error || err.message);
    } finally { setImportingCompany(false); }
  };

  // STEP 3: Fetch data
  const handleFetch = async () => {
    if (!selectedTallyCompany) { showMsg('Please select a Tally company.'); return; }
    const types = Object.entries(dataTypes).filter(([,v]) => v).map(([k]) => k);
    if (types.length === 0) { showMsg('Select at least one data type.'); return; }
    const targetCompanyId = importedErpCompany?.companyId || selectedCompany?.companyId;
    if (!targetCompanyId) { showMsg('No ERP company selected. Import the company first or select an ERP company.'); return; }
    setFetching(true); clearMsg();
    try {
      const res = await axios.post('/api/tally/fetch', {
        tallyCompany: selectedTallyCompany,
        dataTypes: types,
        companyId: targetCompanyId,
        tallyPort: selectedTallyPort,
      });
      setPreviewItems(res.data.items);
      setSelectedIds(new Set(res.data.items.map(i => i.id)));
      setFilterType('all');
      if (res.data.items.length === 0) {
        showMsg('No new or modified entries found. All records are already up to date.', 'success');
      } else {
        setStep(4);
      }
    } catch (err) {
      showMsg(err.response?.data?.error || err.message);
    } finally { setFetching(false); }
  };

  // STEP 4: Stage
  const handleStage = async () => {
    const toStage = previewItems.filter(i => selectedIds.has(i.id));
    if (toStage.length === 0) { showMsg('Select at least one item.'); return; }
    setStaging(true);
    try {
      await axios.post('/api/tally/stage', { items: toStage });
      showMsg(`${toStage.length} item(s) sent for admin review.`, 'success');
      setTimeout(() => navigate('/tally/pending'), 1600);
    } catch (err) {
      showMsg(err.response?.data?.error || err.message);
    } finally { setStaging(false); }
  };

  const toggleSelect = (id) => {
    setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };
  const filteredItems = filterType === 'all' ? previewItems : previewItems.filter(i => i.targetType === filterType);
  const toggleAll = () => {
    const visible = filteredItems.map(i => i.id);
    const allSel  = visible.every(id => selectedIds.has(id));
    setSelectedIds(prev => { const n = new Set(prev); allSel ? visible.forEach(id => n.delete(id)) : visible.forEach(id => n.add(id)); return n; });
  };

  const counts = {
    clients:       previewItems.filter(i => i.targetType === 'client').length,
    vendors:       previewItems.filter(i => i.targetType === 'vendor').length,
    ledgers:       previewItems.filter(i => i.targetType === 'ledger').length,
    salesorders:   previewItems.filter(i => i.targetType === 'salesorder').length,
    purchaseorders:previewItems.filter(i => i.targetType === 'purchaseorder').length,
    payments:      previewItems.filter(i => i.targetType === 'payment').length,
    receipts:      previewItems.filter(i => i.targetType === 'receipt').length,
    newItems:      previewItems.filter(i => i.changeType === 'new').length,
    modified:      previewItems.filter(i => i.changeType === 'modified').length,
  };

  const fmtAmt = n => n ? `₹${Number(n).toFixed(2)}` : '—';

  const renderPreviewCell = (item) => {
    const t = item.targetType;
    if (t === 'client' || t === 'vendor' || t === 'ledger') {
      return (
        <>
          <td><strong>{item.data.companyName || item.data.ledgerName}</strong><div style={{fontSize:10,color:'#6b7280'}}>{item.data.tallyParent}</div></td>
          <td style={{ fontFamily:'monospace', fontSize:12 }}>{item.data.gstin || '—'}</td>
          <td style={{ maxWidth:140, fontSize:12, wordBreak:'break-word' }}>{item.data.address || '—'}</td>
          <td style={{ fontSize:12 }}>{item.data.phone || '—'}</td>
          <td style={{ fontSize:12 }}>{item.data.email || '—'}</td>
          <td style={{ fontSize:12, fontWeight:600 }}>{item.data.openingBalance ? fmtAmt(item.data.openingBalance) : '—'}</td>
        </>
      );
    }
    if (t === 'salesorder' || t === 'purchaseorder') {
      const d = item.data;
      return (
        <>
          <td><div style={{ fontWeight:700, fontSize:12 }}>{d.voucherNumber || '—'}</div>{d.reference && <div style={{ fontSize:10, color:'#6b7280' }}>Ref: {d.reference}</div>}</td>
          <td style={{ fontSize:12 }}>{d.date || '—'}</td>
          <td style={{ fontSize:12 }}><div>{d.party || '—'}</div>{d.partyGstin && <div style={{ fontSize:10, color:'#6b7280', fontFamily:'monospace' }}>{d.partyGstin}</div>}</td>
          <td style={{ fontSize:12, fontWeight:600 }}>{fmtAmt(d.amount)}</td>
          <td style={{ fontSize:11, minWidth:200 }}>
            {(d.items||[]).length > 0 ? (
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:10 }}>
                <thead><tr style={{ background:'#f1f5f9' }}>
                  <th style={{ padding:'2px 4px', textAlign:'left' }}>Item</th>
                  <th style={{ padding:'2px 4px', textAlign:'right' }}>Qty</th>
                  <th style={{ padding:'2px 4px', textAlign:'right' }}>Rate</th>
                  <th style={{ padding:'2px 4px', textAlign:'right' }}>Amt</th>
                </tr></thead>
                <tbody>
                  {d.items.map((li,idx) => (
                    <tr key={idx} style={{ borderTop:'1px solid #e2e8f0' }}>
                      <td style={{ padding:'2px 4px' }}>{li.itemName}</td>
                      <td style={{ padding:'2px 4px', textAlign:'right' }}>{li.quantity} {li.unit}</td>
                      <td style={{ padding:'2px 4px', textAlign:'right' }}>{fmtAmt(li.rate)}</td>
                      <td style={{ padding:'2px 4px', textAlign:'right', fontWeight:600 }}>{fmtAmt(li.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <span style={{ color:'#94a3b8' }}>{d.narration || 'No items'}</span>}
          </td>
        </>
      );
    }
    return (
      <>
        <td><strong>{item.data.voucherNumber || '—'}</strong></td>
        <td style={{ fontSize:12 }}>{item.data.date || '—'}</td>
        <td style={{ fontSize:12 }}>{item.data.party || '—'}</td>
        <td style={{ fontSize:12, fontWeight:600 }}>{fmtAmt(item.data.amount)}</td>
        <td style={{ fontSize:11, color:'#64748b' }}>{item.data.narration || '—'}</td>
        <td />
      </>
    );
  };

  /* ── Styles ── */
  const card = { background:'#fff', border:`1px solid ${BD}`, borderRadius:10, boxShadow:'0 1px 4px rgba(0,0,0,0.06)' };
  const secHead = { background:'#F1F5F9', color:'#1E293B', fontSize:12, fontWeight:700, padding:'8px 14px', letterSpacing:0.2, borderBottom:`1px solid ${BD}`, borderRadius:'10px 10px 0 0' };
  const body = { padding:'16px 18px' };
  const btn = (bg, col='#fff') => ({ height:36, padding:'0 18px', borderRadius:7, border:'none', background:bg, color:col, fontSize:12, fontWeight:700, fontFamily:F, cursor:'pointer', display:'flex', alignItems:'center', gap:6 });
  const outBtn = { height:34, padding:'0 14px', borderRadius:7, border:`1px solid ${BD}`, background:'#fff', color:'#374151', fontSize:12, fontWeight:600, fontFamily:F, cursor:'pointer' };

  return (
    <div style={{ fontFamily:F, padding:'0 2px' }}>

      {/* ── Step bar ── */}
      <div style={{ display:'flex', marginBottom:20, borderRadius:8, overflow:'hidden', border:`1px solid ${BD}` }}>
        {STEPS.map((label, i) => (
          <div key={i} style={{
            flex:1, padding:'9px 6px', textAlign:'center', fontSize:12, fontWeight: i===step ? 700 : 500,
            background: i===step ? '#1E293B' : i<step ? '#DBEAFE' : '#F8FAFC',
            color: i===step ? '#fff' : i<step ? P : '#94a3b8',
            borderRight: i<4 ? `1px solid ${BD}` : 'none',
          }}>
            {i < step ? '✓ ' : `${i+1}. `}{label}
          </div>
        ))}
      </div>

      {/* ── Message banner ── */}
      {msg.text && (
        <div style={{
          marginBottom:16, padding:'10px 14px', borderRadius:8, fontSize:13, fontFamily:F,
          background: msg.type==='success' ? '#ECFDF5' : '#FEF2F2',
          border:`1px solid ${msg.type==='success' ? '#A7F3D0' : '#FECACA'}`,
          color: msg.type==='success' ? '#065F46' : '#991B1B',
          display:'flex', justifyContent:'space-between', alignItems:'flex-start',
          whiteSpace:'pre-wrap',
        }}>
          <span>{msg.text}</span>
          <button onClick={clearMsg} style={{ background:'none', border:'none', cursor:'pointer', fontSize:16, marginLeft:10, flexShrink:0 }}>✕</button>
        </div>
      )}

      {/* ══════ STEP 0: Connect ══════ */}
      {step === 0 && (
        <div style={{ maxWidth:560 }}>
          <div style={card}>
            <div style={secHead}>🔌 Connect to Tally</div>
            <div style={body}>
              <p style={{ color:'#64748b', fontSize:13, margin:'0 0 16px' }}>
                Make sure Tally is open and ODBC server is enabled.<br/>
                <strong>Gateway of Tally → F12 → Advanced Config → Enable ODBC Server (Port 9000)</strong>
              </p>

              {detectedIPs.length > 0 && (
                <div style={{ marginBottom:16, padding:'12px 14px', background:'#F0F9FF', border:'1px solid #BAE6FD', borderRadius:8 }}>
                  <div style={{ fontSize:12, fontWeight:700, color:'#0369A1', marginBottom:8 }}>🔍 Auto-Detected Addresses — click to use:</div>
                  <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                    {detectedIPs.map(ip => (
                      <button key={ip} onClick={() => setConfig(p => ({ ...p, host:ip }))} style={{
                        padding:'4px 12px', borderRadius:16, fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'monospace',
                        border:`2px solid ${config.host===ip ? P : '#93C5FD'}`,
                        background: config.host===ip ? P : '#E0F2FE',
                        color: config.host===ip ? '#fff' : '#0369A1',
                      }}>{config.host===ip ? '✓ ' : ''}{ip}</button>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ display:'grid', gridTemplateColumns:'1fr 120px', gap:12, marginBottom:16 }}>
                <div>
                  <label style={{ fontSize:12, fontWeight:600, color:'#374151', display:'block', marginBottom:4 }}>Tally Host / IP</label>
                  <input style={ri()} value={config.host} onChange={e => setConfig(p => ({ ...p, host:e.target.value }))} placeholder="localhost or IP address"/>
                </div>
                <div>
                  <label style={{ fontSize:12, fontWeight:600, color:'#374151', display:'block', marginBottom:4 }}>Port</label>
                  <input type="number" style={ri()} value={config.port} onChange={e => setConfig(p => ({ ...p, port: parseInt(e.target.value)||9000 }))} placeholder="9000"/>
                </div>
              </div>
              <button onClick={handleConnect} disabled={connecting} style={{ ...btn(P), width:'100%', justifyContent:'center', height:40, fontSize:14 }}>
                {connecting ? '⏳ Connecting…' : '🔌 Connect & Fetch Companies'}
              </button>

              {/* Raw ping test — shows exactly what Tally returns */}
              <div style={{ marginTop:12, display:'flex', gap:8, alignItems:'flex-start' }}>
                <button onClick={handlePing} disabled={pinging} style={{ ...btn('#6B7280'), whiteSpace:'nowrap' }}>
                  {pinging ? '⏳…' : '🩺 Test Raw'}
                </button>
                {pingResult && (
                  <div style={{ flex:1, padding:'8px 12px', borderRadius:7, fontSize:11, fontFamily:'monospace',
                    background: pingResult.error ? '#FEF2F2' : pingResult.isEmpty ? '#FFFBEB' : '#ECFDF5',
                    border: `1px solid ${pingResult.error ? '#FECACA' : pingResult.isEmpty ? '#FDE68A' : '#A7F3D0'}`,
                    color: pingResult.error ? '#991B1B' : '#1E293B', whiteSpace:'pre-wrap', wordBreak:'break-all' }}>
                    {pingResult.error
                      ? `❌ Connection failed:\n${pingResult.error}`
                      : pingResult.isEmpty
                        ? `⚠️ Tally responded on port ${pingResult.port} but returned EMPTY body.\n\nThis usually means:\n• No company is open/selected in Tally (go to a company first, not just Gateway)\n• The HTTP server is not properly enabled\n\nOpen a company in Tally then try again.`
                        : `✅ Tally responded (${pingResult.responseLength} bytes):\n\n${pingResult.responsePreview}`
                    }
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════ STEP 1: Select Company ══════ */}
      {step === 1 && (
        <div>
          <div style={{ marginBottom:16, fontSize:14, color:'#374151' }}>
            <strong>{tallyCompanies.length}</strong> compan{tallyCompanies.length===1?'y':'ies'} found open in Tally. Select one to import:
          </div>
          <div style={{ display:'flex', flexWrap:'wrap', gap:12, marginBottom:24 }}>
            {tallyCompanies.map(co => {
              const isSel = selectedTallyCompany === co.name;
              return (
                <div key={`${co.name}::${co.port}`} onClick={() => handleSelectCompany(co)} style={{
                  padding:'16px 20px', borderRadius:10, cursor:'pointer', border:`2px solid`,
                  borderColor: isSel ? P : BD,
                  background: isSel ? '#EFF6FF' : '#fff',
                  fontWeight: isSel ? 700 : 500,
                  color: isSel ? P : '#374151',
                  boxShadow: isSel ? `0 2px 8px rgba(37,99,235,0.15)` : '0 1px 3px rgba(0,0,0,0.06)',
                  minWidth:180, position:'relative',
                }}>
                  <div style={{ fontSize:28, marginBottom:6 }}>🏢</div>
                  <div style={{ fontSize:14 }}>{co.name}</div>
                  <div style={{ fontSize:10, color:'#94a3b8', marginTop:2, fontFamily:'monospace' }}>Port {co.port}</div>
                  {co.fromDisk && <div style={{ fontSize:10, color:'#d97706', marginTop:2 }}>📁 from data folder</div>}
                  {co.manual   && <div style={{ fontSize:10, color:'#7c3aed', marginTop:2 }}>✏️ added manually</div>}
                  {isSel && <div style={{ fontSize:11, color:P, marginTop:4 }}>✓ Selected</div>}
                  {loadingInfo && isSel && <div style={{ fontSize:10, color:'#94a3b8', marginTop:2 }}>Loading details…</div>}
                </div>
              );
            })}
          </div>

          {/* Company info card */}
          {companyInfo && (
            <div style={{ ...card, marginBottom:20, maxWidth:560 }}>
              <div style={secHead}>📋 Company Details from Tally</div>
              <div style={{ ...body, display:'grid', gridTemplateColumns:'1fr 1fr', gap:'6px 20px' }}>
                {[
                  ['Company Name', companyInfo.formalName || companyInfo.name],
                  ['GSTIN', companyInfo.gstin || '—'],
                  ['PAN', companyInfo.pan || '—'],
                  ['State', companyInfo.state || '—'],
                  ['Address', companyInfo.address || '—'],
                  ['Phone', companyInfo.phone || '—'],
                  ['Email', companyInfo.email || '—'],
                ].map(([l,v]) => (
                  <div key={l} style={{ borderBottom:`1px solid #F1F5F9`, paddingBottom:4 }}>
                    <div style={{ fontSize:10, fontWeight:700, color:'#94a3b8', textTransform:'uppercase' }}>{l}</div>
                    <div style={{ fontSize:12, color:'#1E293B', fontWeight:500 }}>{v}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Manual add — for when Tally only returns the focused company */}
          <div style={{ marginTop:4, marginBottom:20, padding:'14px 16px', background:'#FFFBEB', border:'1px solid #FDE68A', borderRadius:10 }}>
            <div style={{ fontSize:12, fontWeight:700, color:'#92400E', marginBottom:8 }}>
              🔍 Don't see a company? Add it manually by exact name (as it appears in Tally):
            </div>
            <div style={{ display:'flex', gap:8 }}>
              <input
                style={{ ...ri(), flex:1 }}
                value={manualCoName}
                onChange={e => setManualCoName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && manualCoName.trim()) {
                    const name = manualCoName.trim();
                    const already = tallyCompanies.some(c => c.name.toLowerCase() === name.toLowerCase());
                    if (!already) setTallyCompanies(prev => [...prev, { name, port: config.port, manual: true }]);
                    setManualCoName('');
                  }
                }}
                placeholder="Type exact Tally company name and press Enter or Add"
              />
              <button
                style={{ ...btn('#92400E'), whiteSpace:'nowrap' }}
                onClick={() => {
                  const name = manualCoName.trim();
                  if (!name) return;
                  const already = tallyCompanies.some(c => c.name.toLowerCase() === name.toLowerCase());
                  if (!already) setTallyCompanies(prev => [...prev, { name, port: config.port, manual: true }]);
                  setManualCoName('');
                }}
              >+ Add</button>
            </div>
          </div>

          <div style={{ display:'flex', gap:8 }}>
            <button onClick={() => setStep(0)} style={outBtn}>← Back</button>
            <button disabled={!selectedTallyCompany} onClick={() => { if (!selectedTallyCompany) { showMsg('Please select a company.'); return; } clearMsg(); setStep(2); }}
              style={{ ...btn(P), opacity: selectedTallyCompany ? 1 : 0.5 }}>Continue →</button>
          </div>
        </div>
      )}

      {/* ══════ STEP 2: Import / Skip Company ══════ */}
      {step === 2 && (
        <div>
          <div style={{ ...card, marginBottom:16 }}>
            <div style={secHead}>🏢 Import "{selectedTallyCompany}" as ERP Company</div>
            <div style={body}>
              <p style={{ fontSize:13, color:'#64748b', marginTop:0, marginBottom:16 }}>
                Review and edit the details below, then click <strong>Import Company</strong> to create it in ERP.
                Or click <strong>Skip</strong> to use the currently selected ERP company.
              </p>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px 20px' }}>
                {[
                  { k:'companyName', l:'Company Name *' },
                  { k:'gstin',       l:'GSTIN' },
                  { k:'pan',         l:'PAN' },
                  { k:'phone',       l:'Phone' },
                  { k:'email',       l:'Email' },
                  { k:'state',       l:'State' },
                  { k:'pincode',     l:'Pincode' },
                ].map(({ k, l }) => (
                  <div key={k}>
                    <label style={{ fontSize:12, fontWeight:600, color:'#374151', display:'block', marginBottom:4 }}>{l}</label>
                    <input style={ri()} value={erpCompanyForm[k]||''} onChange={e => setErpCompanyForm(p => ({ ...p, [k]: e.target.value }))} placeholder={l}/>
                  </div>
                ))}
                <div style={{ gridColumn:'1 / -1' }}>
                  <label style={{ fontSize:12, fontWeight:600, color:'#374151', display:'block', marginBottom:4 }}>Address</label>
                  <textarea value={erpCompanyForm.address||''} onChange={e => setErpCompanyForm(p => ({ ...p, address: e.target.value }))} rows={2}
                    style={{ ...ri(), height:'auto', padding:'6px 10px', resize:'vertical' }}/>
                </div>
              </div>
            </div>
          </div>

          <div style={{ display:'flex', gap:8, alignItems:'center' }}>
            <button onClick={() => setStep(1)} style={outBtn}>← Back</button>
            <button onClick={() => { setSkipCompanyImport(true); clearMsg(); setStep(3); }}
              style={{ ...btn('#6B7280') }}>Skip — Use Current ERP Company</button>
            <button onClick={handleImportCompany} disabled={importingCompany || !erpCompanyForm.companyName}
              style={{ ...btn('#16A34A'), opacity: erpCompanyForm.companyName ? 1 : 0.5 }}>
              {importingCompany ? '⏳ Creating…' : '✅ Import Company to ERP'}
            </button>
          </div>

          {importedErpCompany && (
            <div style={{ marginTop:12, padding:'10px 14px', background:'#ECFDF5', border:'1px solid #A7F3D0', borderRadius:8, fontSize:13, color:'#065F46', fontWeight:600 }}>
              ✅ Company "{importedErpCompany.companyName}" created (ID: {importedErpCompany.companyId}) — proceeding to data selection…
            </div>
          )}
        </div>
      )}

      {/* ══════ STEP 3: Choose Data Types ══════ */}
      {step === 3 && (
        <div>
          <div style={{ marginBottom:16, padding:'10px 14px', background:'#EFF6FF', border:`1px solid #BFDBFE`, borderRadius:8, fontSize:13 }}>
            <strong>Importing from Tally:</strong> {selectedTallyCompany}
            {importedErpCompany && <> → <strong>ERP Company:</strong> {importedErpCompany.companyName} ({importedErpCompany.companyId})</>}
            {skipCompanyImport && selectedCompany && <> → <strong>ERP Company:</strong> {selectedCompany.companyName}</>}
          </div>

          <div style={{ display:'flex', flexWrap:'wrap', gap:14, marginBottom:24 }}>
            {DATA_TYPE_OPTIONS.map(({ key, label, sub, icon, color }) => {
              const on = dataTypes[key];
              return (
                <div key={key} onClick={() => setDataTypes(p => ({ ...p, [key]: !p[key] }))} style={{
                  padding:'16px 20px', borderRadius:10, cursor:'pointer', border:`2px solid`,
                  borderColor: on ? color : BD,
                  background: on ? `${color}12` : '#fff',
                  minWidth:168, userSelect:'none',
                  boxShadow: on ? `0 2px 8px ${color}30` : '0 1px 3px rgba(0,0,0,0.05)',
                  transition:'all 0.12s',
                }}>
                  <div style={{ fontSize:26, marginBottom:6 }}>{icon}</div>
                  <div style={{ fontWeight:700, color: on ? color : '#374151', fontSize:13 }}>{label}</div>
                  <div style={{ fontSize:11, color:'#6b7280', marginTop:2 }}>{sub}</div>
                  <div style={{ marginTop:10, width:16, height:16, borderRadius:4, border:`2px solid ${on ? color : BD}`, background: on ? color : '#fff', display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontSize:11 }}>
                    {on ? '✓' : ''}
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ display:'flex', gap:8 }}>
            <button onClick={() => setStep(2)} style={outBtn}>← Back</button>
            <button onClick={handleFetch} disabled={fetching} style={{ ...btn(P), height:40, fontSize:13 }}>
              {fetching ? '⏳ Fetching from Tally…' : '📥 Fetch Data from Tally →'}
            </button>
          </div>
        </div>
      )}

      {/* ══════ STEP 4: Preview & Import ══════ */}
      {step === 4 && (
        <div>
          {/* Filter tabs */}
          <div style={{ display:'flex', gap:6, marginBottom:12, flexWrap:'wrap', alignItems:'center' }}>
            {[
              { key:'all',           label:'All',             count:previewItems.length,    bg:'#F1F5F9', col:'#374151' },
              { key:'client',        label:'Clients',         count:counts.clients,          bg:'#DBEAFE', col:'#1D4ED8' },
              { key:'vendor',        label:'Vendors',         count:counts.vendors,          bg:'#EDE9FE', col:'#7C3AED' },
              { key:'ledger',        label:'Ledgers',         count:counts.ledgers,          bg:'#E0F2FE', col:'#0369A1' },
              { key:'salesorder',    label:'Sales Orders',    count:counts.salesorders,      bg:'#D1FAE5', col:'#065F46' },
              { key:'purchaseorder', label:'Purchase Orders', count:counts.purchaseorders,   bg:'#FEF3C7', col:'#92400E' },
              { key:'payment',       label:'Payments',        count:counts.payments,         bg:'#FEE2E2', col:'#991B1B' },
              { key:'receipt',       label:'Receipts',        count:counts.receipts,         bg:'#CFFAFE', col:'#155E75' },
            ].filter(c => c.key==='all' || c.count > 0).map(({ key, label, count, bg, col }) => (
              <button key={key} onClick={() => setFilterType(key)} style={{
                background: filterType===key ? col : bg, color: filterType===key ? '#fff' : col,
                border:`1px solid ${col}40`, borderRadius:6, padding:'4px 12px', fontSize:12, cursor:'pointer', fontWeight:600,
              }}>{label} <strong>{count}</strong></button>
            ))}
            <div style={{ background:'#F0FDF4', border:'1px solid #BBF7D0', borderRadius:6, padding:'4px 12px', fontSize:12 }}>
              <strong style={{ color:'#15803D' }}>{counts.newItems}</strong> <span style={{ color:'#6b7280' }}>New</span>
            </div>
            <div style={{ background:'#FFF7ED', border:'1px solid #FED7AA', borderRadius:6, padding:'4px 12px', fontSize:12 }}>
              <strong style={{ color:'#C2410C' }}>{counts.modified}</strong> <span style={{ color:'#6b7280' }}>Modified</span>
            </div>
            <div style={{ marginLeft:'auto', fontSize:12, color:'#64748b' }}>{selectedIds.size} of {previewItems.length} selected</div>
          </div>

          <div style={{ overflowX:'auto', border:`1px solid ${BD}`, borderRadius:8 }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
              <thead>
                <tr style={{ background:'#F8FAFC' }}>
                  <th style={{ width:36, padding:'8px 10px', borderBottom:`1px solid ${BD}`, textAlign:'center' }}>
                    <input type="checkbox" checked={filteredItems.length>0 && filteredItems.every(i => selectedIds.has(i.id))} onChange={toggleAll}/>
                  </th>
                  <th style={{ padding:'8px 10px', borderBottom:`1px solid ${BD}`, textAlign:'left', fontWeight:700, color:'#374151' }}>Status</th>
                  <th style={{ padding:'8px 10px', borderBottom:`1px solid ${BD}`, textAlign:'left', fontWeight:700, color:'#374151' }}>Type</th>
                  <th style={{ padding:'8px 10px', borderBottom:`1px solid ${BD}`, textAlign:'left', fontWeight:700, color:'#374151' }}>Name / Voucher</th>
                  <th style={{ padding:'8px 10px', borderBottom:`1px solid ${BD}`, textAlign:'left', fontWeight:700, color:'#374151' }}>GSTIN</th>
                  <th style={{ padding:'8px 10px', borderBottom:`1px solid ${BD}`, textAlign:'left', fontWeight:700, color:'#374151' }}>Address / Party</th>
                  <th style={{ padding:'8px 10px', borderBottom:`1px solid ${BD}`, textAlign:'left', fontWeight:700, color:'#374151' }}>Phone / Date</th>
                  <th style={{ padding:'8px 10px', borderBottom:`1px solid ${BD}`, textAlign:'left', fontWeight:700, color:'#374151' }}>Email / Amount</th>
                  <th style={{ padding:'8px 10px', borderBottom:`1px solid ${BD}`, textAlign:'left', fontWeight:700, color:'#374151' }}>Balance / Items</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map(item => {
                  const tc = TYPE_COLORS[item.targetType] || { bg:'#F1F5F9', color:'#374151' };
                  return (
                    <tr key={item.id} style={{ background: selectedIds.has(item.id) ? '#F0F9FF' : '#fff', borderBottom:`1px solid #F1F5F9` }}>
                      <td style={{ textAlign:'center', padding:'6px 10px' }}>
                        <input type="checkbox" checked={selectedIds.has(item.id)} onChange={() => toggleSelect(item.id)}/>
                      </td>
                      <td style={{ padding:'6px 10px' }}>
                        <span style={{ fontSize:11, padding:'2px 7px', borderRadius:4, fontWeight:700,
                          background: item.changeType==='new' ? '#D1FAE5' : '#FEF3C7',
                          color: item.changeType==='new' ? '#065F46' : '#92400E' }}>
                          {item.changeType==='new' ? '✦ New' : '✎ Modified'}
                        </span>
                      </td>
                      <td style={{ padding:'6px 10px' }}>
                        <span style={{ fontSize:11, padding:'2px 7px', borderRadius:4, background:tc.bg, color:tc.color, fontWeight:600, whiteSpace:'nowrap' }}>
                          {item.tallyType || item.targetType}
                        </span>
                      </td>
                      {renderPreviewCell(item)}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div style={{ padding:'8px 14px', fontSize:11, color:'#64748b', background:'#F8FAFC', borderTop:`1px solid ${BD}` }}>
              Showing {filteredItems.length} of {previewItems.length} entries from "{selectedTallyCompany}"
            </div>
          </div>

          <div style={{ display:'flex', gap:8, paddingTop:16 }}>
            <button onClick={() => setStep(3)} style={outBtn}>← Back</button>
            <button onClick={handleStage} disabled={staging || selectedIds.size===0}
              style={{ ...btn('#16A34A'), opacity: selectedIds.size>0 ? 1 : 0.5 }}>
              {staging ? '⏳ Sending…' : `📤 Send ${selectedIds.size} Item(s) for Admin Review →`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Import;
