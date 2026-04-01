import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useCompany } from '../../context/CompanyContext';
import { useNavigate } from 'react-router-dom';

const STEPS = ['Connect', 'Select Company', 'Choose Data', 'Preview & Stage'];

const DATA_TYPE_OPTIONS = [
  { key: 'debtors',        label: 'Debtors',         sub: 'Sundry Debtors → Clients',      icon: '👥', color: '#3b82f6' },
  { key: 'creditors',      label: 'Creditors',       sub: 'Sundry Creditors → Vendors',    icon: '🏭', color: '#8b5cf6' },
  { key: 'salesorders',    label: 'Sales Orders',    sub: 'Sales Orders → SO Records',     icon: '🧾', color: '#10b981' },
  { key: 'purchaseorders', label: 'Purchase Orders', sub: 'Purchase Orders → PO Records',  icon: '📦', color: '#f59e0b' },
  { key: 'payments',       label: 'Payments',        sub: 'Payment Vouchers → Payments',   icon: '💸', color: '#ef4444' },
  { key: 'receipts',       label: 'Receipts',        sub: 'Receipt Vouchers → Receipts',   icon: '🧮', color: '#06b6d4' },
];

const TYPE_COLORS = {
  client: { bg: '#dbeafe', color: '#1d4ed8' },
  vendor: { bg: '#ede9fe', color: '#7c3aed' },
  salesorder: { bg: '#d1fae5', color: '#065f46' },
  purchaseorder: { bg: '#fef3c7', color: '#92400e' },
  payment: { bg: '#fee2e2', color: '#991b1b' },
  receipt: { bg: '#cffafe', color: '#155e75' },
};

const Import = () => {
  const { selectedCompany } = useCompany();
  const navigate = useNavigate();

  const [step, setStep] = useState(0);
  const [config, setConfig] = useState({ host: 'localhost', port: 9000 });
  const [detectedIPs, setDetectedIPs] = useState([]);
  const [connecting, setConnecting] = useState(false);
  const [tallyCompanies, setTallyCompanies] = useState([]);
  const [selectedTallyCompany, setSelectedTallyCompany] = useState('');
  const [dataTypes, setDataTypes] = useState({ debtors: true, creditors: true, salesorders: false, purchaseorders: false, payments: false, receipts: false });
  const [fetching, setFetching] = useState(false);
  const [previewItems, setPreviewItems] = useState([]);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [staging, setStaging] = useState(false);
  const [msg, setMsg] = useState({ text: '', type: '' });
  const [filterType, setFilterType] = useState('all');

  useEffect(() => {
    axios.get('/api/tally/config').then(r => setConfig(r.data)).catch(() => {});
    axios.get('/api/tally/local-ips').then(r => setDetectedIPs(r.data.ips || [])).catch(() => {});
  }, []);

  const showMsg = (text, type = 'error') => setMsg({ text, type });

  // STEP 0: Connect to Tally
  const handleConnect = async () => {
    setConnecting(true);
    setMsg({ text: '', type: '' });
    try {
      await axios.post('/api/tally/config', config);
      const res = await axios.get('/api/tally/companies');
      if (!res.data.companies || res.data.companies.length === 0) {
        const debug = res.data._debug;
        const snippet = debug ? debug.map(d => `[${d.label}]: ${d.snippet}`).join('\n\n') : '';
        showMsg('Connected to Tally but no companies found. Make sure a company is open in Tally.' + (snippet ? `\n\nRaw:\n${snippet}` : ''));
        return;
      }
      setTallyCompanies(res.data.companies);
      setStep(1);
    } catch (err) {
      showMsg(err.response?.data?.error || err.message);
    } finally {
      setConnecting(false);
    }
  };

  // STEP 2: Fetch data from Tally
  const handleFetch = async () => {
    if (!selectedTallyCompany) { showMsg('Please select a Tally company.'); return; }
    const types = Object.entries(dataTypes).filter(([, v]) => v).map(([k]) => k);
    if (types.length === 0) { showMsg('Select at least one data type.'); return; }
    setFetching(true);
    setMsg({ text: '', type: '' });
    try {
      const res = await axios.post('/api/tally/fetch', {
        tallyCompany: selectedTallyCompany,
        dataTypes: types,
        companyId: selectedCompany.companyId,
      });
      setPreviewItems(res.data.items);
      setSelectedIds(new Set(res.data.items.map(i => i.id)));
      setFilterType('all');
      if (res.data.items.length === 0) {
        showMsg('No new or modified entries found. All records are already up to date.', 'success');
      } else {
        setStep(3);
      }
    } catch (err) {
      showMsg(err.response?.data?.error || err.message);
    } finally {
      setFetching(false);
    }
  };

  // STEP 3: Stage for admin review
  const handleStage = async () => {
    const toStage = previewItems.filter(i => selectedIds.has(i.id));
    if (toStage.length === 0) { showMsg('Select at least one item to stage.'); return; }
    setStaging(true);
    try {
      await axios.post('/api/tally/stage', { items: toStage });
      showMsg(`${toStage.length} item(s) sent to admin for review.`, 'success');
      setTimeout(() => navigate('/tally/pending'), 1500);
    } catch (err) {
      showMsg(err.response?.data?.error || err.message);
    } finally {
      setStaging(false);
    }
  };

  const toggleSelect = (id) => {
    setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };
  const toggleAll = () => {
    const visible = filteredItems.map(i => i.id);
    const allSelected = visible.every(id => selectedIds.has(id));
    setSelectedIds(prev => {
      const n = new Set(prev);
      allSelected ? visible.forEach(id => n.delete(id)) : visible.forEach(id => n.add(id));
      return n;
    });
  };

  // Summary counts
  const counts = {
    clients:       previewItems.filter(i => i.targetType === 'client').length,
    vendors:       previewItems.filter(i => i.targetType === 'vendor').length,
    salesorders:   previewItems.filter(i => i.targetType === 'salesorder').length,
    purchaseorders:previewItems.filter(i => i.targetType === 'purchaseorder').length,
    payments:      previewItems.filter(i => i.targetType === 'payment').length,
    receipts:      previewItems.filter(i => i.targetType === 'receipt').length,
    newItems:      previewItems.filter(i => i.changeType === 'new').length,
    modified:      previewItems.filter(i => i.changeType === 'modified').length,
  };

  const filteredItems = filterType === 'all' ? previewItems : previewItems.filter(i => i.targetType === filterType);

  const fmtAmt = (n) => n ? `₹${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '—';

  const renderPreviewCell = (item) => {
    const t = item.targetType;
    if (t === 'client' || t === 'vendor') {
      return (
        <>
          <td><strong>{item.data.companyName}</strong></td>
          <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{item.data.gstin || '—'}</td>
          <td style={{ maxWidth: 160, fontSize: 12, wordBreak: 'break-word' }}>{item.data.address || '—'}</td>
          <td style={{ fontSize: 12 }}>{item.data.phone || '—'}</td>
          <td style={{ fontSize: 12 }}>{item.data.email || '—'}</td>
        </>
      );
    }
    if (t === 'salesorder' || t === 'purchaseorder') {
      const d = item.data;
      const lineItems = d.items || [];
      return (
        <>
          <td>
            <div style={{ fontWeight: 700, fontSize: 12 }}>{d.voucherNumber || '—'}</div>
            {d.reference && <div style={{ fontSize: 10, color: '#6b7280' }}>Ref: {d.reference}</div>}
            {d.orderRef   && <div style={{ fontSize: 10, color: '#6b7280' }}>Order: {d.orderRef}</div>}
          </td>
          <td style={{ fontSize: 12 }}>{d.date || '—'}</td>
          <td style={{ fontSize: 12 }}>
            <div>{d.party || '—'}</div>
            {d.partyGstin    && <div style={{ fontSize: 10, color: '#6b7280', fontFamily: 'monospace' }}>{d.partyGstin}</div>}
            {d.placeOfSupply && <div style={{ fontSize: 10, color: '#6b7280' }}>{d.placeOfSupply}</div>}
          </td>
          <td style={{ fontSize: 11 }}>
            {d.shippedBy    && <div><span style={{ color: '#6b7280' }}>Mode:</span> {d.shippedBy}</div>}
            {d.destination  && <div><span style={{ color: '#6b7280' }}>To:</span> {d.destination}</div>}
            {d.paymentTerms && <div><span style={{ color: '#6b7280' }}>Payment:</span> {d.paymentTerms}</div>}
          </td>
          <td style={{ fontSize: 12, fontWeight: 600 }}>{fmtAmt(d.amount)}</td>
          <td style={{ minWidth: 320 }}>
            {lineItems.length > 0 ? (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                <thead>
                  <tr style={{ background: '#f1f5f9' }}>
                    <th style={{ padding: '3px 6px', textAlign: 'left', color: '#374151', fontWeight: 600 }}>Item</th>
                    <th style={{ padding: '3px 6px', textAlign: 'left', color: '#374151', fontWeight: 600 }}>HSN</th>
                    <th style={{ padding: '3px 6px', textAlign: 'right', color: '#374151', fontWeight: 600 }}>Qty</th>
                    <th style={{ padding: '3px 6px', textAlign: 'right', color: '#374151', fontWeight: 600 }}>Rate</th>
                    <th style={{ padding: '3px 6px', textAlign: 'right', color: '#374151', fontWeight: 600 }}>Amount</th>
                    <th style={{ padding: '3px 6px', textAlign: 'left', color: '#374151', fontWeight: 600 }}>Due</th>
                  </tr>
                </thead>
                <tbody>
                  {lineItems.map((li, idx) => (
                    <tr key={idx} style={{ borderTop: '1px solid #e2e8f0' }}>
                      <td style={{ padding: '3px 6px' }}>
                        <div style={{ fontWeight: 600 }}>{li.itemName}</div>
                        {li.description && <div style={{ fontSize: 10, color: '#64748b' }}>{li.description}</div>}
                      </td>
                      <td style={{ padding: '3px 6px', fontFamily: 'monospace', fontSize: 10 }}>{li.hsnCode || '—'}</td>
                      <td style={{ padding: '3px 6px', textAlign: 'right' }}>{li.quantity} {li.unit}</td>
                      <td style={{ padding: '3px 6px', textAlign: 'right' }}>{fmtAmt(li.rate)}</td>
                      <td style={{ padding: '3px 6px', textAlign: 'right', fontWeight: 600 }}>{fmtAmt(li.amount)}</td>
                      <td style={{ padding: '3px 6px', fontSize: 10, color: '#6b7280' }}>{li.dueDate || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <span style={{ color: '#94a3b8', fontSize: 11 }}>{d.narration || 'No items'}</span>}
          </td>
        </>
      );
    }
    // Payment / Receipt
    return (
      <>
        <td><strong>{item.data.voucherNumber || '—'}</strong></td>
        <td style={{ fontSize: 12 }}>{item.data.date || '—'}</td>
        <td style={{ fontSize: 12 }}>{item.data.party || '—'}</td>
        <td style={{ fontSize: 12, fontWeight: 600 }}>{fmtAmt(item.data.amount)}</td>
        <td style={{ fontSize: 11, color: '#64748b', maxWidth: 160 }}>{item.data.narration || '—'}</td>
      </>
    );
  };

  const showVoucherCols = filteredItems.some(i => ['salesorder', 'purchaseorder', 'payment', 'receipt'].includes(i.targetType));
  const showItemsCols   = filteredItems.some(i => ['salesorder', 'purchaseorder'].includes(i.targetType));

  return (
    <div className="client-list-page">
      {/* Header */}
      <div className="client-list-header">
        <h2 className="form-title" style={{ margin: 0 }}>
          Tally Import
          {step > 0 && <span className="count-badge" style={{ background: '#0ea5e9' }}>Step {step + 1}/4</span>}
        </h2>
        {step === 3 && (
          <button className="add-button" style={{ marginTop: 0, background: '#6b7280' }} onClick={() => { setStep(2); setPreviewItems([]); }}>
            ← Back
          </button>
        )}
      </div>

      {/* Stepper */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 28, borderRadius: 8, overflow: 'hidden', border: '1px solid #e2e8f0' }}>
        {STEPS.map((label, i) => (
          <div key={i} style={{
            flex: 1, padding: '10px 6px', textAlign: 'center', fontSize: 13, fontWeight: i === step ? 700 : 400,
            background: i === step ? '#1a3c6e' : i < step ? '#e0f2fe' : '#f8fafc',
            color: i === step ? '#fff' : i < step ? '#0284c7' : '#94a3b8',
            borderRight: i < 3 ? '1px solid #e2e8f0' : 'none',
          }}>
            {i < step ? '✓ ' : ''}{label}
          </div>
        ))}
      </div>

      {msg.text && (
        <div className={msg.type === 'success' ? 'success-message' : 'error-message'} style={{ marginBottom: 16, whiteSpace: 'pre-wrap' }}>
          {msg.text}
        </div>
      )}

      {/* STEP 0 — Connect */}
      {step === 0 && (
        <div className="form-container" style={{ maxWidth: 560 }}>
          <div className="form-title">Connect to Tally</div>
          <p style={{ color: '#64748b', fontSize: 13, margin: '0 0 16px' }}>
            Make sure Tally is running and the ODBC server is enabled.<br />
            <strong>Gateway of Tally → F12 → Advanced Config → Enable ODBC Server</strong>
          </p>

          {/* Auto-detected IPs */}
          {detectedIPs.length > 0 && (
            <div style={{ marginBottom: 16, padding: '12px 14px', background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#0369a1', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>🔍</span> Auto-Detected PC Addresses — click to use:
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {detectedIPs.map(ip => (
                  <button key={ip} onClick={() => setConfig(p => ({ ...p, host: ip }))} style={{
                    padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    border: `2px solid ${config.host === ip ? '#0284c7' : '#93c5fd'}`,
                    background: config.host === ip ? '#0284c7' : '#e0f2fe',
                    color: config.host === ip ? '#fff' : '#0369a1',
                    fontFamily: 'monospace',
                  }}>
                    {config.host === ip ? '✓ ' : ''}{ip}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="form-section">
            <div className="form-row">
              <div className="form-group">
                <label>Tally Host / IP</label>
                <input type="text" value={config.host} onChange={e => setConfig(p => ({ ...p, host: e.target.value }))} placeholder="localhost or IP address" />
              </div>
              <div className="form-group">
                <label>Port</label>
                <input type="number" value={config.port} onChange={e => setConfig(p => ({ ...p, port: parseInt(e.target.value) || 9000 }))} placeholder="9000" />
              </div>
            </div>
          </div>
          <div className="form-actions">
            <button className="submit-btn" onClick={handleConnect} disabled={connecting}>
              {connecting ? 'Connecting…' : '🔌 Connect & Fetch Companies'}
            </button>
          </div>
        </div>
      )}

      {/* STEP 1 — Select Tally Company */}
      {step === 1 && (
        <div>
          <p style={{ color: '#64748b', fontSize: 14, marginBottom: 16 }}>Select a company from Tally to import data from:</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 24 }}>
            {tallyCompanies.map(co => (
              <div key={co} onClick={() => setSelectedTallyCompany(co)} style={{
                padding: '14px 22px', borderRadius: 10, cursor: 'pointer', border: '2px solid',
                borderColor: selectedTallyCompany === co ? '#1a3c6e' : '#e2e8f0',
                background: selectedTallyCompany === co ? '#eef2ff' : '#fff',
                fontWeight: selectedTallyCompany === co ? 700 : 400,
                color: selectedTallyCompany === co ? '#1a3c6e' : '#374151',
                boxShadow: selectedTallyCompany === co ? '0 2px 8px rgba(26,60,110,0.15)' : '0 1px 3px rgba(0,0,0,0.06)',
                fontSize: 14, minWidth: 180,
              }}>
                <div style={{ fontSize: 24, marginBottom: 4 }}>🏢</div>
                {co}
                {selectedTallyCompany === co && <div style={{ fontSize: 11, color: '#1a3c6e', marginTop: 4 }}>✓ Selected</div>}
              </div>
            ))}
          </div>
          <div className="form-actions" style={{ justifyContent: 'flex-start', padding: 0 }}>
            <button className="cancel-btn" onClick={() => setStep(0)}>← Back</button>
            <button className="submit-btn" onClick={() => { if (!selectedTallyCompany) { showMsg('Please select a company.'); return; } setMsg({ text: '', type: '' }); setStep(2); }} disabled={!selectedTallyCompany}>
              Continue →
            </button>
          </div>
        </div>
      )}

      {/* STEP 2 — Choose Data Types */}
      {step === 2 && (
        <div>
          <p style={{ color: '#64748b', fontSize: 14, marginBottom: 20 }}>
            Importing from: <strong style={{ color: '#1a3c6e' }}>{selectedTallyCompany}</strong><br />
            Into ERP company: <strong style={{ color: '#1a3c6e' }}>{selectedCompany?.companyName}</strong>
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginBottom: 28 }}>
            {DATA_TYPE_OPTIONS.map(({ key, label, sub, icon, color }) => (
              <div key={key} onClick={() => setDataTypes(p => ({ ...p, [key]: !p[key] }))} style={{
                padding: '18px 24px', borderRadius: 12, cursor: 'pointer', border: '2px solid',
                borderColor: dataTypes[key] ? color : '#e2e8f0',
                background: dataTypes[key] ? `${color}12` : '#fff',
                minWidth: 180, userSelect: 'none',
              }}>
                <div style={{ fontSize: 28, marginBottom: 6 }}>{icon}</div>
                <div style={{ fontWeight: 700, color: dataTypes[key] ? color : '#374151', fontSize: 15 }}>{label}</div>
                <div style={{ fontSize: 11, color: '#6b7280', marginTop: 3 }}>{sub}</div>
                <div style={{ marginTop: 10, width: 18, height: 18, borderRadius: 4, border: `2px solid ${dataTypes[key] ? color : '#d1d5db'}`, background: dataTypes[key] ? color : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 12 }}>
                  {dataTypes[key] ? '✓' : ''}
                </div>
              </div>
            ))}
          </div>
          <div className="form-actions" style={{ justifyContent: 'flex-start', padding: 0 }}>
            <button className="cancel-btn" onClick={() => setStep(1)}>← Back</button>
            <button className="submit-btn" onClick={handleFetch} disabled={fetching}>
              {fetching ? 'Fetching from Tally…' : 'Fetch Data →'}
            </button>
          </div>
        </div>
      )}

      {/* STEP 3 — Preview & Stage */}
      {step === 3 && (
        <div>
          {/* Summary chips */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            {[
              { key: 'all',          label: 'All',            count: previewItems.length,  bg: '#f1f5f9', col: '#374151' },
              { key: 'client',       label: 'Clients',        count: counts.clients,        bg: '#dbeafe', col: '#1d4ed8' },
              { key: 'vendor',       label: 'Vendors',        count: counts.vendors,        bg: '#ede9fe', col: '#7c3aed' },
              { key: 'salesorder',   label: 'Sales Orders',   count: counts.salesorders,    bg: '#d1fae5', col: '#065f46' },
              { key: 'purchaseorder',label: 'Purchase Orders',count: counts.purchaseorders, bg: '#fef3c7', col: '#92400e' },
              { key: 'payment',      label: 'Payments',       count: counts.payments,       bg: '#fee2e2', col: '#991b1b' },
              { key: 'receipt',      label: 'Receipts',       count: counts.receipts,       bg: '#cffafe', col: '#155e75' },
            ].filter(c => c.key === 'all' || c.count > 0).map(({ key, label, count, bg, col }) => (
              <button key={key} onClick={() => setFilterType(key)} style={{
                background: filterType === key ? col : bg,
                color: filterType === key ? '#fff' : col,
                border: `1px solid ${col}40`,
                borderRadius: 6, padding: '5px 12px', fontSize: 12, cursor: 'pointer', fontWeight: 600,
              }}>
                {label} <strong>{count}</strong>
              </button>
            ))}
            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 6, padding: '5px 12px', fontSize: 12 }}>
              <strong style={{ color: '#15803d' }}>{counts.newItems}</strong> <span style={{ color: '#6b7280' }}>New</span>
            </div>
            <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 6, padding: '5px 12px', fontSize: 12 }}>
              <strong style={{ color: '#c2410c' }}>{counts.modified}</strong> <span style={{ color: '#6b7280' }}>Modified</span>
            </div>
            <div style={{ marginLeft: 'auto', fontSize: 12, color: '#64748b' }}>
              {selectedIds.size} of {previewItems.length} selected
            </div>
          </div>

          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 36 }}>
                    <input type="checkbox"
                      checked={filteredItems.length > 0 && filteredItems.every(i => selectedIds.has(i.id))}
                      onChange={toggleAll} />
                  </th>
                  <th>Status</th>
                  <th>Type</th>
                  {showVoucherCols ? (
                    <>
                      <th>Voucher / Ref</th>
                      <th>Date</th>
                      <th>Party / GSTIN</th>
                      {showItemsCols && <th>Dispatch / Terms</th>}
                      <th>Amount</th>
                      <th>{showItemsCols ? 'Items (HSN / Qty / Rate / Due Date)' : 'Narration'}</th>
                    </>
                  ) : (
                    <>
                      <th>Name</th>
                      <th>GSTIN</th>
                      <th>Address</th>
                      <th>Phone</th>
                      <th>Email</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {filteredItems.map(item => {
                  const tc = TYPE_COLORS[item.targetType] || { bg: '#f1f5f9', color: '#374151' };
                  const typeLabel = item.tallyType || item.targetType;
                  return (
                    <tr key={item.id} style={{ background: selectedIds.has(item.id) ? '#f0f9ff' : undefined }}>
                      <td>
                        <input type="checkbox" checked={selectedIds.has(item.id)} onChange={() => toggleSelect(item.id)} />
                      </td>
                      <td>
                        <span className={`status-badge ${item.changeType === 'new' ? 'status-approved' : 'status-pending'}`}>
                          {item.changeType === 'new' ? 'New' : 'Modified'}
                        </span>
                      </td>
                      <td>
                        <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 4, background: tc.bg, color: tc.color, fontWeight: 600, whiteSpace: 'nowrap' }}>
                          {typeLabel}
                        </span>
                      </td>
                      {renderPreviewCell(item)}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="table-footer">
              Showing {filteredItems.length} of {previewItems.length} entries from "{selectedTallyCompany}"
            </div>
          </div>

          <div className="form-actions" style={{ justifyContent: 'flex-start', padding: '16px 0 0' }}>
            <button className="cancel-btn" onClick={() => setStep(2)}>← Back</button>
            <button className="submit-btn" onClick={handleStage} disabled={staging || selectedIds.size === 0}>
              {staging ? 'Staging…' : `Send ${selectedIds.size} Item(s) for Admin Approval →`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Import;
