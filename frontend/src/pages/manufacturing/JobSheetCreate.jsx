import { useState, useEffect } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { useCompany } from '../../context/CompanyContext';
import { printJobSheet } from '../../utils/printJobSheet';

const F = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const N = '#104f4f';

const inp = (w, extra = {}) => ({
  fontFamily: F, fontSize: 12, padding: '3px 7px',
  border: '1px solid #b0b8c1', outline: 'none',
  color: '#222', background: '#fff', width: w, ...extra,
});
const roInp = (w) => ({ ...inp(w), background: '#f0f2f5', color: '#555' });
const th = { padding: '5px 8px', fontFamily: F, fontSize: 11, fontWeight: 700,
  background: '#104f4f', color: '#fff', textAlign: 'left', border: '1px solid #2a3a4a' };
const td = { padding: '3px 6px', border: '1px solid #dde', verticalAlign: 'middle' };

function SecHead({ n, title }) {
  return (
    <div style={{ background: N, color: '#fff', fontFamily: F, fontSize: 12, fontWeight: 700,
      padding: '5px 12px', marginTop: 18, marginBottom: 0, letterSpacing: 0.3 }}>
      {n && <span style={{ opacity: 0.7, marginRight: 8 }}>{n}.</span>}{title}
    </div>
  );
}
function Card({ children }) {
  return <div style={{ border: '1px solid #b0b8c1', borderTop: 'none', padding: '12px 14px', background: '#fff' }}>{children}</div>;
}
function FR({ label, req, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', minHeight: 24, borderBottom: '1px solid #f0f0f0', padding: '3px 0', gap: 0 }}>
      <div style={{ width: 150, minWidth: 150, fontSize: 11, fontWeight: 700, color: '#444', fontFamily: F, textAlign: 'right', paddingRight: 10 }}>
        {label}{req && <span style={{ color: '#c00' }}>*</span>}
      </div>
      <div style={{ flex: 1 }}>{children}</div>
    </div>
  );
}

const EMPTY_BOM = { material: '', qty: '', uom: '', hsn: '', availableQty: '' };

function sufficient(required, available) {
  const r = parseFloat(required) || 0;
  const a = parseFloat(available);
  if (!r || isNaN(a) || available === '') return null;
  return a >= r;
}

export default function JobSheetCreate() {
  const { selectedCompany } = useCompany();
  const navigate = useNavigate();
  const { jobId } = useParams();
  const { state: navState } = useLocation();
  const isEdit = !!jobId;
  const cid = selectedCompany?.companyId;

  const [soList,      setSoList]      = useState([]);
  const [selectedSo,  setSelectedSo]  = useState(null);
  const [selSoId,     setSelSoId]     = useState('');
  const [locations,   setLocations]   = useState([]);

  // Production output — selected items from SO (checkboxes)
  const [outputItems, setOutputItems] = useState([]); // [{itemName,itemCode,qty,uom,checked}]

  // Manufacturing details
  const [locationId,       setLocationId]       = useState('');
  const [locationName,     setLocationName]     = useState('');
  const [dueDate,          setDueDate]          = useState('');
  const [startDate,        setStartDate]        = useState('');
  const [status,           setStatus]           = useState('pending');
  const [notes,            setNotes]            = useState('');
  const [specifications,   setSpecifications]   = useState('');
  const [workInstructions, setWorkInstructions] = useState('');
  const [attachments,      setAttachments]      = useState([]); // saved files
  const [newFiles,         setNewFiles]         = useState([]); // pending upload
  const [newFileNames,     setNewFileNames]     = useState([]); // display names
  const [jobNo,            setJobNo]            = useState('');

  // BOM rows with availableQty
  const [bom, setBom] = useState([{ ...EMPTY_BOM }]);

  const [saving,  setSaving]  = useState(false);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');
  const [saved,   setSaved]   = useState(null); // saved record for print

  /* ── Pre-fill from PO Tracking navigation state ── */
  useEffect(() => {
    if (!navState?.linkedSalesOrderId || isEdit) return;
    setSelSoId(String(navState.linkedSalesOrderId));
  }, [navState, isEdit]);

  /* ── Load SOs (pass editJobId so already-counted qty excludes current job sheet in edit mode) ── */
  useEffect(() => {
    if (!cid) return;
    const qs = isEdit && jobId ? `&editJobId=${jobId}` : '';
    fetch(`/api/manufacturing/so-items?companyId=${cid}${qs}`)
      .then(r => r.json()).then(d => setSoList(Array.isArray(d) ? d : [])).catch(() => {});
  }, [cid, isEdit, jobId]);

  /* ── Load locations ── */
  useEffect(() => {
    if (!cid) return;
    fetch(`/api/manufacturing/locations?companyId=${cid}`)
      .then(r => r.json()).then(d => setLocations(Array.isArray(d) ? d : [])).catch(() => {});
  }, [cid]);

  /* ── When soList loads (or selSoId changes), resolve selectedSo and populate outputItems/BOM/specs ── */
  useEffect(() => {
    if (!selSoId || soList.length === 0) return;
    const so = soList.find(s => String(s.soId) === selSoId);
    if (!so) return;
    setSelectedSo(so);
    // Auto-populate outputItems only if empty (old job sheet or initial load)
    setOutputItems(prev =>
      prev.length > 0
        ? prev
        : (so.items || []).map(it => ({ ...it, mfgQty: it.pendingQty ?? it.soQty ?? it.qty, checked: true }))
    );
    // Auto-populate BOM only if it's still the default empty row
    setBom(prev => {
      const isDefault = prev.length === 1 && !prev[0].material;
      if (!isDefault) return prev;
      const merged = [];
      (so.items || []).forEach(it => {
        (it.bom || []).forEach(b => { if (b.material) merged.push({ ...b }); });
      });
      return merged.length ? merged : prev;
    });
    // Auto-fill specifications from SO for new job sheets only
    if (!isEdit) {
      setSpecifications(prev => {
        if (prev) return prev; // don't overwrite if user typed something
        const parts = [so.productSpecs, so.technicalDetails].filter(Boolean);
        return parts.join('\n\n');
      });
    }
  }, [soList, selSoId, isEdit]);

  /* ── Load existing job sheet (edit mode) ── */
  useEffect(() => {
    if (!isEdit || !cid) return;
    setLoading(true);
    fetch(`/api/manufacturing/job-sheets/${jobId}?companyId=${cid}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) { setError(d.error); return; }
        setJobNo(d.jobNo || '');
        setSelSoId(d.soId ? String(d.soId) : '');
        setLocationId(d.locationId ? String(d.locationId) : '');
        setLocationName(d.locationName || '');
        setDueDate(d.dueDate ? d.dueDate.slice(0, 10) : '');
        setStartDate(d.startDate ? d.startDate.slice(0, 10) : '');
        setStatus(d.status || 'pending');
        setNotes(d.notes || '');
        setSpecifications(d.specifications || '');
        setWorkInstructions(d.workInstructions || '');
        setAttachments(d.attachments || []);
        setBom(d.bom?.length ? d.bom : [{ ...EMPTY_BOM }]);
        if (d.outputItems?.length) setOutputItems(d.outputItems.map(x => ({ ...x, checked: true })));
        setSaved(d);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [isEdit, jobId, cid]);

  /* ── When SO selected ── */
  const handleSoChange = (e) => {
    const id = e.target.value;
    setSelSoId(id);
    const so = soList.find(s => String(s.soId) === id);
    setSelectedSo(so || null);
    if (so) {
      setOutputItems((so.items || []).map(it => ({ ...it, mfgQty: it.pendingQty ?? it.soQty ?? it.qty, checked: true })));
      // Auto-load BOM
      const merged = [];
      (so.items || []).forEach(it => {
        (it.bom || []).forEach(b => { if (b.material) merged.push({ ...b }); });
      });
      setBom(merged.length ? merged : [{ ...EMPTY_BOM }]);
      // Pre-fill specifications from SO (only if not already edited)
      if (!specifications) {
        const parts = [so.productSpecs, so.technicalDetails].filter(Boolean);
        if (parts.length) setSpecifications(parts.join('\n\n'));
      }
    } else {
      setOutputItems([]);
      setBom([{ ...EMPTY_BOM }]);
    }
  };

  const toggleItem = (idx) => {
    setOutputItems(prev => prev.map((it, i) => i === idx ? { ...it, checked: !it.checked } : it));
  };

  const updateMfgQty = (idx, val) => {
    setOutputItems(prev => prev.map((it, i) => i === idx ? { ...it, mfgQty: val } : it));
  };

  /* ── Location change ── */
  const handleLocChange = (e) => {
    const id = e.target.value;
    setLocationId(id);
    const loc = locations.find(l => String(l.id) === id);
    setLocationName(loc ? loc.name : '');
  };

  /* ── BOM ── */
  const addBom    = () => setBom(p => [...p, { ...EMPTY_BOM }]);
  const removeBom = (i) => setBom(p => p.filter((_, j) => j !== i));
  const updateBom = (i, k, v) => setBom(p => p.map((r, j) => j === i ? { ...r, [k]: v } : r));

  /* ── Save (statusOverride lets "Submit for Approval" pass 'submitted') ── */
  const handleSave = async (statusOverride) => {
    setError('');
    const selectedOutput = outputItems.filter(it => it.checked);
    const validBom = bom.filter(r => r.material && r.material.trim());
    if (!selSoId && selectedOutput.length === 0 && validBom.length === 0) {
      setError('Please select a Sales Order or add at least one BOM item to manufacture.');
      return;
    }
    setSaving(true);

    const so = soList.find(s => String(s.soId) === selSoId);
    const primaryItem = selectedOutput[0] || {};
    // Normalize each output item: store mfgQty (this job's qty), soQty, alreadyMfg, pendingQty
    const normalizedOutput = selectedOutput.map(({ checked: _, ...rest }) => ({
      ...rest,
      mfgQty: parseFloat(rest.mfgQty) || parseFloat(rest.pendingQty) || parseFloat(rest.soQty) || 0,
    }));

    try {
      const fd = new FormData();
      fd.append('companyId', cid);
      fd.append('soId', selSoId || '');
      fd.append('soNumber', so?.soNumber || '');
      fd.append('customerName', so?.customerName || '');
      fd.append('locationId', String(locationId ? parseInt(locationId) : 0));
      fd.append('locationName', locationName || '');
      fd.append('itemName', primaryItem.itemName || '');
      fd.append('itemCode', primaryItem.itemCode || '');
      fd.append('qtyRequired', String(parseFloat(primaryItem.mfgQty) || parseFloat(primaryItem.pendingQty) || primaryItem.soQty || 0));
      fd.append('uom', primaryItem.uom || '');
      fd.append('dueDate', dueDate || '');
      fd.append('startDate', startDate || '');
      fd.append('status', statusOverride || status);
      fd.append('notes', notes || '');
      fd.append('specifications', specifications || '');
      fd.append('workInstructions', workInstructions || '');
      fd.append('bom', JSON.stringify(bom.filter(r => r.material.trim())));
      fd.append('outputItems', JSON.stringify(normalizedOutput));
      fd.append('existingAttachments', JSON.stringify(attachments));
      newFiles.forEach((f, i) => {
        fd.append('attachmentFiles', f);
        fd.append('attachmentNames', newFileNames[i] || f.name);
      });

      const url = isEdit
        ? `/api/manufacturing/job-sheets/${jobId}?companyId=${cid}`
        : `/api/manufacturing/job-sheets?companyId=${cid}`;
      const response = await fetch(url, { method: isEdit ? 'PUT' : 'POST', body: fd });
      const data = await response.json();
      if (!data.success) { setError(data.error || 'Save failed'); return; }

      if (data.attachments) setAttachments(data.attachments);
      setNewFiles([]);
      setNewFileNames([]);
      setSaved({
        jobNo: data.jobNo || jobNo, id: data.id || jobId,
        soNumber: so?.soNumber, customerName: so?.customerName,
        locationName, dueDate, startDate,
        status: statusOverride || status, notes,
        specifications, workInstructions,
        bom: bom.filter(r => r.material.trim()),
        outputItems: normalizedOutput,
        attachments: data.attachments || attachments,
      });
      navigate('/manufacturing/job-sheets');
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div style={{ padding: 20, fontFamily: F, color: '#666' }}>Loading…</div>;

  const checkedItems = outputItems.filter(it => it.checked);
  const so = soList.find(s => String(s.soId) === selSoId);

  return (
    <div style={{ fontFamily: F, padding: '14px 16px', maxWidth: 900 }}>

      {/* ── Header bar ── */}
      <div style={{ background: N, color: '#fff', padding: '7px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: 0.3 }}>
          {isEdit ? `Edit Job Sheet — ${jobNo}` : 'Create Job Sheet'}
        </span>
        {jobNo && (
          <span style={{ fontSize: 11, background: 'rgba(255,255,255,0.18)', padding: '2px 10px', borderRadius: 3, fontWeight: 700, letterSpacing: 1 }}>
            {jobNo}
          </span>
        )}
      </div>

      {error && (
        <div style={{ background: '#fff3cd', border: '1px solid #ffc107', color: '#856404',
          padding: '6px 12px', fontSize: 12, marginTop: 6 }}>{error}</div>
      )}

      {/* ══ SECTION 1: Sales Order ══ */}
      <SecHead n="1" title="Sales Order" />
      <Card>
        <FR label="Sales Order" req>
          <select value={selSoId} onChange={handleSoChange} style={inp(320)}>
            <option value="">— Select Confirmed / Approved SO —</option>
            {soList.map(s => (
              <option key={s.soId} value={s.soId}>
                {s.soNumber} — {s.customerName}
              </option>
            ))}
          </select>
        </FR>
        {so && (
          <>
            <FR label="Customer"><span style={{ fontSize: 12, fontWeight: 700, color: N }}>{so.customerName}</span></FR>

            {/* Scope of Work from SO */}
            {so.scopeItems?.length > 0 && (
              <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid #e8eef8' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: N, marginBottom: 5 }}>📋 Scope of Work (from Sales Order)</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                  {so.scopeItems.filter(sc => sc.ourScope).map((sc, i) => (
                    <span key={i} style={{ background: '#e8f5e9', color: '#1b5e20', border: '1px solid #c3e6cb', borderRadius: 12, fontSize: 11, padding: '2px 9px', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      ✓ {sc.item}{sc.remarks ? ` — ${sc.remarks}` : ''}
                    </span>
                  ))}
                  {so.scopeItems.filter(sc => !sc.ourScope).map((sc, i) => (
                    <span key={i} style={{ background: '#f0f0f0', color: '#777', border: '1px solid #ddd', borderRadius: 12, fontSize: 11, padding: '2px 9px' }}>
                      ○ {sc.item} (Client)
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Technical Specifications from SO */}
            {(so.productSpecs || so.technicalDetails || so.drawingNumber) && (
              <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid #e8eef8' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: N, marginBottom: 5 }}>📐 Technical Specifications (from SO)</div>
                {so.productSpecs && <div style={{ fontSize: 11, color: '#222', marginBottom: 3, whiteSpace: 'pre-wrap' }}>{so.productSpecs}</div>}
                {so.technicalDetails && <div style={{ fontSize: 11, color: '#333', marginBottom: 3, whiteSpace: 'pre-wrap' }}>{so.technicalDetails}</div>}
                {so.drawingNumber && (
                  <div style={{ fontSize: 11, color: '#555' }}>
                    Drawing No: <strong>{so.drawingNumber}</strong>
                    {so.version ? ` (Rev. ${so.version})` : ''}
                  </div>
                )}
              </div>
            )}

            {/* SO Attachments — specs, drawings */}
            {so.soAttachments?.length > 0 && (
              <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid #e8eef8' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: N, marginBottom: 5 }}>📎 SO Documents (Specs / Drawings)</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {so.soAttachments.map((a, i) => (
                    <a key={i}
                      href={`/api/sales-orders/${a.soId}/render-attachment/${a.fileName}?companyId=${cid}`}
                      target="_blank" rel="noreferrer"
                      style={{ fontSize: 11, color: '#104f4f', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4, background: '#EBF4FF', border: '1px solid #b0ccf0', borderRadius: 4, padding: '3px 9px' }}>
                      📄 {a.name || a.fileName}
                    </a>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </Card>

      {/* ══ SECTION 2: Production Output ══ */}
      <SecHead n="2" title="Production Output — Select Items for Manufacturing" />
      <Card>
        {outputItems.length === 0 ? (
          <div style={{ fontSize: 12, color: '#888', padding: '8px 0' }}>Select a Sales Order above to see pending items.</div>
        ) : (
          <>
            <div style={{ fontSize: 11, color: '#555', marginBottom: 6 }}>
              Only items with pending manufacturing qty are shown. Check items to include in this job sheet and enter the qty to manufacture.
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ ...th, width: 30, textAlign: 'center' }}>✓</th>
                  <th style={th}>Item / Product Name</th>
                  <th style={{ ...th, width: 72, textAlign: 'right' }}>Order Qty</th>
                  <th style={{ ...th, width: 80, textAlign: 'right' }}>Manufactured</th>
                  <th style={{ ...th, width: 72, textAlign: 'right' }}>Pending</th>
                  <th style={{ ...th, width: 100, textAlign: 'right' }}>Mfg Qty *</th>
                  <th style={{ ...th, width: 60 }}>UOM</th>
                  <th style={{ ...th, width: 110 }}>Item Code</th>
                </tr>
              </thead>
              <tbody>
                {outputItems.map((it, i) => (
                  <tr key={i} style={{ background: it.checked ? '#f0f7ff' : '#fff' }}>
                    <td style={{ ...td, textAlign: 'center' }}>
                      <input type="checkbox" checked={it.checked} onChange={() => toggleItem(i)}
                        style={{ cursor: 'pointer' }} />
                    </td>
                    <td style={{ ...td, fontWeight: it.checked ? 700 : 400, fontSize: 12, cursor: 'pointer' }}
                        onClick={() => toggleItem(i)}>{it.itemName || '—'}</td>
                    <td style={{ ...td, textAlign: 'right', fontSize: 12, color: '#555' }}>{it.soQty ?? it.qty ?? '—'}</td>
                    <td style={{ ...td, textAlign: 'right', fontSize: 12, color: it.alreadyMfg > 0 ? '#104f4f' : '#aaa' }}>
                      {it.alreadyMfg > 0 ? it.alreadyMfg : '—'}
                    </td>
                    <td style={{ ...td, textAlign: 'right', fontSize: 12, fontWeight: 700, color: '#c62828' }}>
                      {it.pendingQty ?? ((it.soQty ?? it.qty ?? 0) - (it.alreadyMfg || 0))}
                    </td>
                    <td style={{ ...td, padding: '2px 4px' }}>
                      <input
                        type="number" min="0"
                        max={it.pendingQty ?? it.soQty ?? it.qty}
                        value={it.mfgQty ?? ''}
                        onChange={e => updateMfgQty(i, e.target.value)}
                        disabled={!it.checked}
                        style={{ ...inp(84), textAlign: 'right',
                          background: it.checked ? '#fff' : '#f4f4f4',
                          border: it.checked ? '1px solid #104f4f' : '1px solid #ddd',
                          fontWeight: 700, color: '#104f4f' }}
                        placeholder="0"
                      />
                    </td>
                    <td style={{ ...td, fontSize: 12 }}>{it.uom}</td>
                    <td style={{ ...td, fontSize: 11, color: '#666' }}>{it.itemCode || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {checkedItems.length > 0 && (
              <div style={{ marginTop: 6, fontSize: 11, color: '#2e7d32', fontWeight: 600 }}>
                ✅ {checkedItems.length} item{checkedItems.length > 1 ? 's' : ''} selected —
                Total Mfg Qty: {checkedItems.reduce((s, it) => s + (parseFloat(it.mfgQty) || 0), 0)}
              </div>
            )}
          </>
        )}
      </Card>

      {/* ══ SECTION 3: Bill of Materials ══ */}
      <SecHead n="3" title="Bill of Materials (BOM) — Raw Materials Required" />
      <Card>
        <div style={{ fontSize: 11, color: '#666', marginBottom: 8 }}>
          Enter all raw materials needed. Fill "Available at Factory" to check if stock is sufficient.
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 680 }}>
            <thead>
              <tr>
                <th style={{ ...th, width: 28, textAlign: 'center' }}>#</th>
                <th style={th}>Raw Material / Component</th>
                <th style={{ ...th, width: 90, textAlign: 'right' }}>Required Qty</th>
                <th style={{ ...th, width: 80 }}>UOM</th>
                <th style={{ ...th, width: 90 }}>HSN Code</th>
                <th style={{ ...th, width: 110, textAlign: 'right' }}>Available at Factory</th>
                <th style={{ ...th, width: 70, textAlign: 'center' }}>Status</th>
                <th style={{ ...th, width: 36, textAlign: 'center' }}>✕</th>
              </tr>
            </thead>
            <tbody>
              {bom.map((row, i) => {
                const suf = sufficient(row.qty, row.availableQty);
                return (
                  <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#f9fafb' }}>
                    <td style={{ ...td, textAlign: 'center', fontSize: 11, color: '#888' }}>{i + 1}</td>
                    <td style={td}>
                      <input value={row.material} onChange={e => updateBom(i, 'material', e.target.value)}
                        style={{ ...inp('100%'), border: 'none', background: 'transparent' }}
                        placeholder="e.g. MS Steel Pipe" />
                    </td>
                    <td style={td}>
                      <input type="number" value={row.qty} onChange={e => updateBom(i, 'qty', e.target.value)}
                        style={{ ...inp('100%'), border: 'none', background: 'transparent', textAlign: 'right' }}
                        placeholder="0" min="0" />
                    </td>
                    <td style={td}>
                      <input value={row.uom} onChange={e => updateBom(i, 'uom', e.target.value)}
                        style={{ ...inp('100%'), border: 'none', background: 'transparent' }}
                        placeholder="KG / NOS" />
                    </td>
                    <td style={td}>
                      <input value={row.hsn} onChange={e => updateBom(i, 'hsn', e.target.value)}
                        style={{ ...inp('100%'), border: 'none', background: 'transparent' }}
                        placeholder="HSN" />
                    </td>
                    <td style={td}>
                      <input type="number" value={row.availableQty}
                        onChange={e => updateBom(i, 'availableQty', e.target.value)}
                        style={{ ...inp('100%'), border: 'none',
                          background: suf === true ? '#e8f5e9' : suf === false ? '#ffebee' : 'transparent',
                          textAlign: 'right' }}
                        placeholder="Enter stock" min="0" />
                    </td>
                    <td style={{ ...td, textAlign: 'center' }}>
                      {suf === true  && <span style={{ color: '#2e7d32', fontWeight: 700, fontSize: 14 }}>✅</span>}
                      {suf === false && <span style={{ color: '#c62828', fontWeight: 700, fontSize: 14 }}>❌</span>}
                      {suf === null  && <span style={{ color: '#bbb', fontSize: 11 }}>—</span>}
                    </td>
                    <td style={{ ...td, textAlign: 'center' }}>
                      {bom.length > 1 && (
                        <button onClick={() => removeBom(i)}
                          style={{ background: '#dc3545', color: '#fff', border: 'none',
                            padding: '1px 7px', cursor: 'pointer', borderRadius: 2, fontFamily: F, fontSize: 13 }}>
                          ×
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <button onClick={addBom}
          style={{ marginTop: 8, background: '#f0f4f8', border: `1px solid ${N}`, color: N,
            padding: '4px 14px', fontSize: 11, cursor: 'pointer', fontFamily: F, fontWeight: 600 }}>
          + Add Material Row
        </button>

        {/* BOM summary */}
        {bom.some(r => r.material && r.availableQty !== '') && (
          <div style={{ marginTop: 10, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, color: '#2e7d32', fontWeight: 700 }}>
              ✅ Sufficient: {bom.filter(r => sufficient(r.qty, r.availableQty) === true).length}
            </span>
            <span style={{ fontSize: 11, color: '#c62828', fontWeight: 700 }}>
              ❌ Short: {bom.filter(r => sufficient(r.qty, r.availableQty) === false).length}
            </span>
            <span style={{ fontSize: 11, color: '#888' }}>
              — Not checked: {bom.filter(r => sufficient(r.qty, r.availableQty) === null).length}
            </span>
          </div>
        )}
      </Card>

      {/* ══ SECTION 4: Manufacturing Instructions & Attachments ══ */}
      <SecHead n="4" title="Manufacturing Instructions & Attachments" />
      <Card>
        <FR label="Specifications">
          <div style={{ flex: 1 }}>
            <textarea value={specifications} onChange={e => setSpecifications(e.target.value)} rows={5}
              style={{ ...inp('100%'), resize: 'vertical', maxWidth: 580 }}
              placeholder="Dimensions, sizes, material grades, finish, tolerances, colour…&#10;&#10;(Auto-filled from SO technical specs if available)" />
            {so && (so.productSpecs || so.technicalDetails) && !specifications && (
              <button type="button" onClick={() => {
                const parts = [so.productSpecs, so.technicalDetails].filter(Boolean);
                setSpecifications(parts.join('\n\n'));
              }} style={{ marginTop: 4, fontSize: 11, color: N, background: '#EBF4FF', border: `1px solid ${N}`, borderRadius: 3, padding: '2px 10px', cursor: 'pointer', fontFamily: F }}>
                ↙ Copy from SO specs
              </button>
            )}
          </div>
        </FR>
        <FR label="Work Instructions">
          <textarea value={workInstructions} onChange={e => setWorkInstructions(e.target.value)} rows={4}
            style={{ ...inp('100%'), resize: 'vertical', maxWidth: 580 }}
            placeholder="Step-by-step manufacturing instructions for the factory team…&#10;e.g. 1. Cut MS plate to 40x10 ft. 2. Weld frame. 3. Apply primer coat…" />
        </FR>

        {/* Attachments */}
        <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid #f0f0f0' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#444', marginBottom: 6 }}>📎 Drawings / Spec Sheets for Factory</div>

          {/* Saved attachments */}
          {attachments.map((a, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
              <a href={`/api/manufacturing/job-sheets/${jobId || 'new'}/docs/${a.fileName}?companyId=${cid}`}
                target="_blank" rel="noreferrer"
                style={{ fontSize: 12, color: '#104f4f', textDecoration: 'underline' }}>📄 {a.name || a.fileName}</a>
              <button onClick={() => {
                setAttachments(prev => prev.filter((_, j) => j !== i));
                if (isEdit) fetch(`/api/manufacturing/job-sheets/${jobId}/attachments/${a.fileName}?companyId=${cid}`, { method: 'DELETE' }).catch(() => {});
              }} style={{ background: 'none', border: 'none', color: '#c00', cursor: 'pointer', fontSize: 14, padding: 0 }}>×</button>
            </div>
          ))}

          {/* Pending new files */}
          {newFiles.map((f, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
              <span style={{ fontSize: 12, color: '#888' }}>🆕</span>
              <input value={newFileNames[i] || ''} placeholder={f.name}
                onChange={e => setNewFileNames(prev => prev.map((n, j) => j === i ? e.target.value : n))}
                style={{ ...inp(220), fontSize: 11 }} />
              <span style={{ fontSize: 11, color: '#aaa' }}>({(f.size/1024).toFixed(0)} KB)</span>
              <button onClick={() => { setNewFiles(prev => prev.filter((_, j) => j !== i)); setNewFileNames(prev => prev.filter((_, j) => j !== i)); }}
                style={{ background: 'none', border: 'none', color: '#c00', cursor: 'pointer', fontSize: 14, padding: 0 }}>×</button>
            </div>
          ))}

          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', background: '#f0f4f8', border: `1px solid ${N}`, color: N, padding: '5px 14px', fontSize: 11, fontFamily: F, borderRadius: 3, marginTop: 4 }}>
            <input type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.dwg,.dxf,.xlsx,.docx"
              style={{ display: 'none' }}
              onChange={e => {
                const files = Array.from(e.target.files);
                setNewFiles(prev => [...prev, ...files]);
                setNewFileNames(prev => [...prev, ...files.map(f => f.name)]);
                e.target.value = '';
              }} />
            + Upload Files
          </label>
          <span style={{ fontSize: 11, color: '#aaa', marginLeft: 8 }}>PDF, Images, DWG, Excel, Word</span>
        </div>
      </Card>

      {/* ══ SECTION 5: Manufacturing Details ══ */}
      <SecHead n="5" title="Manufacturing Details" />
      <Card>
        <FR label="Location">
          <select value={locationId} onChange={handleLocChange} style={inp(260)}>
            <option value="">— Select Factory / Workshop —</option>
            {locations.filter(l => l.status === 'active').map(l => (
              <option key={l.id} value={l.id}>{l.name} ({l.type})</option>
            ))}
          </select>
          {locations.length === 0 && (
            <span style={{ fontSize: 11, color: '#e65100', marginLeft: 8 }}>
              No locations — <a href="/manufacturing/locations" style={{ color: '#104f4f' }}>create one first</a>
            </span>
          )}
        </FR>
        <FR label="Due Date">
          <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} style={inp(160)} />
        </FR>
        <FR label="Start Date">
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={inp(160)} />
        </FR>
        <FR label="Status">
          <select value={status} onChange={e => setStatus(e.target.value)} style={inp(200)}>
            <option value="pending">Pending (Draft)</option>
            <option value="submitted">Submitted for Approval</option>
            <option value="approved">Approved</option>
            <option value="in-progress">In Progress</option>
            <option value="completed">Completed</option>
            <option value="rejected">Rejected</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </FR>
        <FR label="Notes">
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
            style={{ ...inp(400), resize: 'vertical' }} placeholder="Internal notes…" />
        </FR>
      </Card>

      {/* ── Footer ── */}
      <div style={{ display: 'flex', gap: 8, paddingTop: 14, marginTop: 6,
        borderTop: '1px solid #ddd', alignItems: 'center', justifyContent: 'space-between' }}>
        <button onClick={() => navigate('/manufacturing/job-sheets')}
          style={{ background: '#f0f2f5', color: '#333', border: '1px solid #b0b8c1',
            padding: '5px 16px', fontSize: 12, cursor: 'pointer', fontFamily: F }}>
          ← Back
        </button>
        <div style={{ display: 'flex', gap: 8 }}>
          {saved && (
            <button onClick={() => printJobSheet(saved, selectedCompany)}
              style={{ background: '#f0f4f8', color: N, border: `1px solid ${N}`,
                padding: '5px 16px', fontSize: 12, cursor: 'pointer', fontFamily: F, fontWeight: 600 }}>
              🖨️ Print
            </button>
          )}
          {!isEdit && (
            <button onClick={() => handleSave('submitted')} disabled={saving}
              style={{ background: saving ? '#888' : '#E67E00', color: '#fff', border: 'none',
                padding: '5px 18px', fontSize: 12, cursor: saving ? 'not-allowed' : 'pointer',
                fontFamily: F, fontWeight: 700 }}>
              📤 Submit for Approval
            </button>
          )}
          <button onClick={() => handleSave()} disabled={saving}
            style={{ background: saving ? '#888' : N, color: '#fff', border: 'none',
              padding: '5px 22px', fontSize: 12, cursor: saving ? 'not-allowed' : 'pointer',
              fontFamily: F, fontWeight: 700 }}>
            {saving ? 'Saving…' : '💾 Save Job Sheet'}
          </button>
        </div>
      </div>
    </div>
  );
}
