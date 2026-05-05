import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useCompany } from '../../context/CompanyContext';
import { printJobSheet } from '../../utils/printJobSheet';

const F = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const N = '#2F6FED';

const inp = (w, extra = {}) => ({
  fontFamily: F, fontSize: 12, padding: '3px 7px',
  border: '1px solid #b0b8c1', outline: 'none',
  color: '#222', background: '#fff', width: w, ...extra,
});
const roInp = (w) => ({ ...inp(w), background: '#f0f2f5', color: '#555' });
const th = { padding: '5px 8px', fontFamily: F, fontSize: 11, fontWeight: 700,
  background: '#2F6FED', color: '#fff', textAlign: 'left', border: '1px solid #2a3a4a' };
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
  const isEdit = !!jobId;
  const cid = selectedCompany?.companyId;

  const [soList,      setSoList]      = useState([]);
  const [selectedSo,  setSelectedSo]  = useState(null);
  const [selSoId,     setSelSoId]     = useState('');
  const [locations,   setLocations]   = useState([]);

  // Production output — selected items from SO (checkboxes)
  const [outputItems, setOutputItems] = useState([]); // [{itemName,itemCode,qty,uom,checked}]

  // Manufacturing details
  const [locationId,   setLocationId]   = useState('');
  const [locationName, setLocationName] = useState('');
  const [dueDate,      setDueDate]      = useState('');
  const [startDate,    setStartDate]    = useState('');
  const [status,       setStatus]       = useState('pending');
  const [notes,        setNotes]        = useState('');
  const [jobNo,        setJobNo]        = useState('');

  // BOM rows with availableQty
  const [bom, setBom] = useState([{ ...EMPTY_BOM }]);

  const [saving,  setSaving]  = useState(false);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');
  const [saved,   setSaved]   = useState(null); // saved record for print

  /* ── Load SOs ── */
  useEffect(() => {
    if (!cid) return;
    fetch(`/api/manufacturing/so-items?companyId=${cid}`)
      .then(r => r.json()).then(d => setSoList(Array.isArray(d) ? d : [])).catch(() => {});
  }, [cid]);

  /* ── Load locations ── */
  useEffect(() => {
    if (!cid) return;
    fetch(`/api/manufacturing/locations?companyId=${cid}`)
      .then(r => r.json()).then(d => setLocations(Array.isArray(d) ? d : [])).catch(() => {});
  }, [cid]);

  /* ── When soList loads (or selSoId changes), resolve selectedSo and populate outputItems/BOM ── */
  useEffect(() => {
    if (!selSoId || soList.length === 0) return;
    const so = soList.find(s => String(s.soId) === selSoId);
    if (!so) return;
    setSelectedSo(so);
    // Auto-populate outputItems only if empty (old job sheet or initial load)
    setOutputItems(prev =>
      prev.length > 0
        ? prev
        : (so.items || []).map(it => ({ ...it, checked: true }))
    );
    // Auto-populate BOM only if it's still the default empty row
    setBom(prev => {
      const isDefault = prev.length === 1 && !prev[0].material;
      if (!isDefault) return prev; // user has already entered BOM rows — don't overwrite
      const merged = [];
      (so.items || []).forEach(it => {
        (it.bom || []).forEach(b => { if (b.material) merged.push({ ...b }); });
      });
      return merged.length ? merged : prev;
    });
  }, [soList, selSoId]);

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
      setOutputItems((so.items || []).map(it => ({ ...it, checked: true })));
      // Auto-load BOM from all SO items' BOM components
      const merged = [];
      (so.items || []).forEach(it => {
        (it.bom || []).forEach(b => {
          if (b.material) merged.push({ ...b });
        });
      });
      setBom(merged.length ? merged : [{ ...EMPTY_BOM }]);
    } else {
      setOutputItems([]);
      setBom([{ ...EMPTY_BOM }]);
    }
  };

  const toggleItem = (idx) => {
    setOutputItems(prev => prev.map((it, i) => i === idx ? { ...it, checked: !it.checked } : it));
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

  /* ── Save ── */
  const handleSave = async () => {
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
    const payload = {
      companyId: cid,
      soId:         selSoId || null,
      soNumber:     so?.soNumber || '',
      customerName: so?.customerName || '',
      locationId:   locationId ? parseInt(locationId) : 0,
      locationName,
      // primary item for DB columns
      itemName:    primaryItem.itemName   || '',
      itemCode:    primaryItem.itemCode   || '',
      qtyRequired: primaryItem.qty        || 0,
      uom:         primaryItem.uom        || '',
      dueDate:     dueDate   || null,
      startDate:   startDate || null,
      bom:         bom.filter(r => r.material.trim()),
      outputItems: selectedOutput.map(({ checked: _, ...rest }) => rest),
      notes, status,
    };

    try {
      const url = isEdit
        ? `/api/manufacturing/job-sheets/${jobId}?companyId=${cid}`
        : `/api/manufacturing/job-sheets?companyId=${cid}`;
      const res = await fetch(url, {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success) {
        setSaved({ ...payload, jobNo: data.jobNo || jobNo, id: data.id || jobId });
        navigate('/manufacturing/job-sheets');
      } else {
        setError(data.error || 'Save failed');
      }
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
          <div style={{ marginTop: 4 }}>
            <FR label="Customer"><span style={{ fontSize: 12, fontWeight: 700, color: N }}>{so.customerName}</span></FR>
          </div>
        )}
      </Card>

      {/* ══ SECTION 2: Production Output ══ */}
      <SecHead n="2" title="Production Output (Finished Products)" />
      <Card>
        {outputItems.length === 0 ? (
          <div style={{ fontSize: 12, color: '#888', padding: '8px 0' }}>Select a Sales Order above to see items.</div>
        ) : (
          <>
            <div style={{ fontSize: 11, color: '#666', marginBottom: 6 }}>
              ✔ Check the items that need to be manufactured for this job sheet:
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ ...th, width: 30, textAlign: 'center' }}>✓</th>
                  <th style={th}>Item / Product Name</th>
                  <th style={{ ...th, width: 80, textAlign: 'right' }}>SO Qty</th>
                  <th style={{ ...th, width: 70 }}>UOM</th>
                  <th style={{ ...th, width: 110 }}>Item Code</th>
                </tr>
              </thead>
              <tbody>
                {outputItems.map((it, i) => (
                  <tr key={i} onClick={() => toggleItem(i)} style={{ cursor: 'pointer',
                    background: it.checked ? '#f0f7ff' : '#fff' }}>
                    <td style={{ ...td, textAlign: 'center' }}>
                      <input type="checkbox" checked={it.checked} onChange={() => toggleItem(i)}
                        style={{ cursor: 'pointer' }} />
                    </td>
                    <td style={{ ...td, fontWeight: it.checked ? 700 : 400, fontSize: 12 }}>{it.itemName || '—'}</td>
                    <td style={{ ...td, textAlign: 'right', fontSize: 12 }}>{it.qty}</td>
                    <td style={{ ...td, fontSize: 12 }}>{it.uom}</td>
                    <td style={{ ...td, fontSize: 11, color: '#666' }}>{it.itemCode || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {checkedItems.length > 0 && (
              <div style={{ marginTop: 6, fontSize: 11, color: '#2e7d32', fontWeight: 600 }}>
                ✅ {checkedItems.length} item{checkedItems.length > 1 ? 's' : ''} selected for manufacturing
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

      {/* ══ SECTION 4: Manufacturing Details ══ */}
      <SecHead n="4" title="Manufacturing Details" />
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
              No locations — <a href="/manufacturing/locations" style={{ color: '#0070F2' }}>create one first</a>
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
          <select value={status} onChange={e => setStatus(e.target.value)} style={inp(160)}>
            <option value="pending">Pending</option>
            <option value="in-progress">In Progress</option>
            <option value="completed">Completed</option>
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
          <button onClick={handleSave} disabled={saving}
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
