/**
 * VA01 — Create Standard Order: Overview
 * Exact SAP GUI replica matching classic desktop screenshot.
 * Single screen (no wizard) with header form + tabs + ALV item table.
 */
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useSAP } from '../../context/SAPContext';

/* ── SAP GUI design tokens ── */
const G = {
  screen:    '#dfe3e8',
  panel:     '#ffffff',
  toolbar:   '#ECE9D8',
  tblHdr:    '#D6D2C8',
  tblAlt:    '#F8F6F2',
  tblSel:    '#B8CFE5',
  inputBg:   '#ffffff',
  readOnly:  '#F0EDE4',
  border:    '#a0a0a0',
  borderDk:  '#808080',
  borderLt:  '#ffffff',
  btnBg:     '#D4D0C8',
  btnHover:  '#C4C0B8',
  text:      '#000000',
  muted:     '#555555',
  label:     '#000080',
  error:     '#CC0000',
  errorBg:   '#FFF0F0',
  success:   '#007830',
  sapNavy:   '#003875',
  sapBlue:   '#0070D2',
  font:      "Arial, Helvetica, 'Liberation Sans', sans-serif",
  fs:        '12px',
  fsSm:      '11px',
  fsXs:      '10px',
};

/* ── 3-D raised button ── */
function Btn3D({ children, onClick, title, disabled, variant, wide, style }) {
  const [p, setP] = useState(false);
  const [h, setH] = useState(false);
  const clr = {
    default: { bg: h ? G.btnHover : G.btnBg, fg: G.text },
    primary: { bg: p ? '#005BA8' : (h ? '#0061BA' : G.sapBlue), fg: '#fff' },
    success: { bg: p ? '#005A20' : (h ? '#006828' : '#007830'), fg: '#fff' },
    danger:  { bg: p ? '#AA0000' : (h ? '#BB0000' : '#CC0000'), fg: '#fff' },
  }[variant || 'default'];
  return (
    <button title={title} onClick={!disabled ? onClick : undefined} disabled={disabled}
      style={{
        fontFamily: G.font, fontSize: G.fsSm, cursor: disabled ? 'default' : 'pointer',
        padding: wide ? '1px 10px' : '1px 4px',
        minWidth: wide ? 50 : 22, height: 22,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 3,
        background: clr.bg, color: clr.fg,
        border: '1px solid',
        borderTopColor:    p ? G.borderDk : G.borderLt,
        borderLeftColor:   p ? G.borderDk : G.borderLt,
        borderRightColor:  p ? G.borderLt : G.borderDk,
        borderBottomColor: p ? G.borderLt : G.borderDk,
        userSelect: 'none', boxSizing: 'border-box', opacity: disabled ? 0.5 : 1,
        ...style,
      }}
      onMouseEnter={() => !disabled && setH(true)}
      onMouseLeave={() => { setH(false); setP(false); }}
      onMouseDown={() => !disabled && setP(true)}
      onMouseUp={() => setP(false)}
    >
      {children}
    </button>
  );
}

/* ── SAP field (label + input inline) ── */
function SapField({ label, children, labelW = 100, required }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
      <label style={{
        width: labelW, minWidth: labelW, fontSize: G.fsSm, fontFamily: G.font,
        color: G.label, fontWeight: 700, flexShrink: 0, paddingRight: 4,
        textAlign: 'right',
      }}>
        {label}{required && <span style={{ color: G.error }}>*</span>}
      </label>
      {children}
    </div>
  );
}

/* ── SAP text input ── */
function SapIn({ value, onChange, width = 120, type = 'text', placeholder, readOnly, disabled, min }) {
  return (
    <input type={type} value={value ?? ''} onChange={onChange}
      placeholder={placeholder} readOnly={readOnly} disabled={disabled} min={min}
      style={{
        width, height: 20, boxSizing: 'border-box',
        background: readOnly ? G.readOnly : (disabled ? '#E8E4DC' : G.inputBg),
        border: '1px solid',
        borderTopColor: G.borderDk, borderLeftColor: G.borderDk,
        borderRightColor: G.borderLt, borderBottomColor: G.borderLt,
        padding: '0 3px', fontSize: G.fs, fontFamily: G.font, color: G.text, outline: 'none',
      }}
      onFocus={e => !readOnly && (e.target.style.outline = `1px solid ${G.sapBlue}`)}
      onBlur={e => (e.target.style.outline = 'none')}
    />
  );
}

/* ── SAP dropdown ── */
function SapSel({ value, onChange, options, width = 120, disabled }) {
  return (
    <select value={value} onChange={onChange} disabled={disabled}
      style={{
        width, height: 20, boxSizing: 'border-box',
        background: disabled ? '#E8E4DC' : G.inputBg,
        border: '1px solid',
        borderTopColor: G.borderDk, borderLeftColor: G.borderDk,
        borderRightColor: G.borderLt, borderBottomColor: G.borderLt,
        padding: '0 2px', fontSize: G.fs, fontFamily: G.font, color: G.text, outline: 'none',
        cursor: 'pointer',
      }}>
      {(options || []).map((o, i) => (
        <option key={i} value={o.value ?? o}>{o.label ?? o}</option>
      ))}
    </select>
  );
}

/* ── Toolbar separator ── */
function Sep() {
  return <div style={{ width: 1, height: 18, background: G.borderDk, margin: '0 2px', flexShrink: 0 }} />;
}

/* ── Display-only text field (like SAP description field) ── */
function DispField({ value, width = 260 }) {
  return (
    <span style={{
      display: 'inline-block', width, height: 20, lineHeight: '20px',
      fontSize: G.fsSm, fontFamily: G.font, color: G.sapBlue,
      textDecoration: 'underline', paddingLeft: 4, cursor: 'default',
      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
    }}>
      {value}
    </span>
  );
}

/* ── Search icon button ── */
function SearchBtn({ onClick }) {
  return (
    <Btn3D onClick={onClick} title="Search client" style={{ minWidth: 18, width: 18, height: 18, fontSize: 10 }}>🔍</Btn3D>
  );
}

const fmt = (n) => (n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const PROJECT_TYPES = ['Prefab', 'Cabin', 'Civil', 'Trading'];
const PAYMENT_TERMS = ['0001 Payable immediately', 'Net 30', 'Net 45', 'Net 60', '50% Advance', 'On Delivery'];
const BLANK_ITEM = { material: '', description: '', itCa: 'TAN', qty: 1, unit: 'NOS', unitPrice: 0, taxPct: 18, plant: '1000', firstDate: new Date().toISOString().slice(0, 10) };
const BLANK_MAT  = { itemName: '', itemType: 'Raw Material', unit: 'NOS', requiredQty: 1 };

export default function SOCreate() {
  const { api, projects, addNotification, refreshProjects } = useSAP();
  const navigate = useNavigate();
  const [params] = useSearchParams();

  /* ── project ── */
  const [projMode,  setProjMode]  = useState('auto');
  const [projectId, setProjectId] = useState(params.get('projectId') || '');
  const [projName,  setProjName]  = useState('');
  const [projType,  setProjType]  = useState('Cabin');
  const [location,  setLocation]  = useState('');

  /* ── header fields ── */
  const [soldTo,    setSoldTo]    = useState('');       // clientId
  const [soldToName,setSoldToName]= useState('');       // clientName display
  const [poNumber,  setPONumber]  = useState('');
  const [orderDate, setOrderDate] = useState(new Date().toISOString().slice(0, 10));
  const [deliveryDate, setDeliveryDate] = useState('');
  const [payTerms,  setPayTerms]  = useState(PAYMENT_TERMS[0]);
  const [notes,     setNotes]     = useState('');

  /* ── sales tab extra fields ── */
  const [pricingDate, setPricingDate] = useState(new Date().toISOString().slice(0, 10));
  const [incoterms,   setIncoterms]   = useState('CIF');
  const [salesOrg,    setSalesOrg]    = useState('1000 / 10 / 00');

  /* ── items ── */
  const [items,   setItems]   = useState([{ ...BLANK_ITEM }]);
  const [selRow,  setSelRow]  = useState(null);
  const [mats,    setMats]    = useState([]);

  /* ── ui ── */
  const [clients, setClients] = useState([]);
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState('');
  const [tab,     setTab]     = useState('Sales');
  const [showClientDrop, setShowClientDrop] = useState(false);
  const [clientSearch, setClientSearch] = useState('');
  const clientRef = useRef(null);

  const TABS = ['Sales', 'Item Overview', 'Item Detail', 'Ordering Party', 'Procurement'];

  useEffect(() => {
    api('/api/clients').then(r => setClients(r.data || [])).catch(() => {});
    if (params.get('projectId')) { setProjMode('existing'); setProjectId(params.get('projectId')); }
  }, [api]);

  useEffect(() => {
    const h = (e) => { if (clientRef.current && !clientRef.current.contains(e.target)) setShowClientDrop(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  useEffect(() => {
    if (projMode === 'auto' && soldToName && !projName) {
      setProjName(`${soldToName} — ${projType}`);
    }
  }, [soldToName, projType, projMode]);

  const selectClient = (c) => {
    setSoldTo(c.clientId || '');
    setSoldToName(c.companyName || c.clientName || c.name || '');
    setShowClientDrop(false);
    setClientSearch('');
  };

  const setItem  = (i, k, v) => setItems(p => p.map((r, ri) => ri === i ? { ...r, [k]: v } : r));
  const addItem  = () => setItems(p => [...p, { ...BLANK_ITEM }]);
  const delItem  = (i) => { setItems(p => p.filter((_, ri) => ri !== i)); setSelRow(null); };
  const addMat   = () => setMats(p => [...p, { ...BLANK_MAT }]);
  const setMat   = (i, k, v) => setMats(p => p.map((r, ri) => ri === i ? { ...r, [k]: v } : r));
  const delMat   = (i) => setMats(p => p.filter((_, ri) => ri !== i));

  const subtotal   = items.reduce((s, it) => s + (parseFloat(it.qty)||0)*(parseFloat(it.unitPrice)||0), 0);
  const taxTotal   = items.reduce((s, it) => { const sub=(parseFloat(it.qty)||0)*(parseFloat(it.unitPrice)||0); return s+sub*(parseFloat(it.taxPct)||0)/100; }, 0);
  const grandTotal = subtotal + taxTotal;

  const submit = async () => {
    if (!soldToName.trim()) return setError('Sold-to party (client name) is required');
    if (projMode === 'existing' && !projectId) return setError('Select a project');
    if (projMode === 'auto' && !projName.trim()) return setError('Project name is required');
    if (items.some(it => !it.description.trim() && !it.material.trim())) return setError('All line items need a description or material');
    setSaving(true); setError('');
    try {
      const body = {
        clientName:   soldToName,
        clientId:     soldTo,
        orderDate,
        deliveryDate,
        paymentTerms: payTerms,
        notes,
        projectId:    projMode === 'existing' ? projectId : undefined,
        projectName:  projMode === 'auto' ? projName : undefined,
        projectType:  projMode === 'auto' ? projType : undefined,
        location:     projMode === 'auto' ? location : undefined,
        materialItems: mats.filter(m => m.itemName.trim()),
        items: items.map(it => ({
          description: it.description || it.material,
          qty: parseFloat(it.qty) || 0,
          unitPrice: parseFloat(it.unitPrice) || 0,
          taxPct: parseFloat(it.taxPct) || 0,
        })),
      };
      const res = await api('/api/sap/sales-orders', { method: 'POST', data: body });
      const so  = res.data;
      addNotification(`${so.soNumber} created${so.projectCreated ? ` + Project ${so.projectId}` : ''}`);
      refreshProjects();
      navigate(`/sap/projects/${so.projectId}`);
    } catch (e) {
      setError(e.response?.data?.error || e.message);
      setSaving(false);
    }
  };

  /* ─── RENDER ─── */
  return (
    <div style={{ fontFamily: G.font, fontSize: G.fs, color: G.text, background: G.screen, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* ══ TITLE BAR ══ */}
      <div style={{ padding: '4px 8px 2px', borderBottom: `1px solid ${G.border}`, background: G.screen, flexShrink: 0 }}>
        <div style={{ fontSize: '14px', fontWeight: 700, color: G.text, fontFamily: G.font }}>
          VA01 — Create Standard Order: Overview
        </div>
      </div>

      {/* ══ APPLICATION TOOLBAR ══ */}
      <div style={{
        background: G.toolbar, borderBottom: `1px solid ${G.border}`,
        padding: '2px 6px', display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0,
      }}>
        <Btn3D onClick={submit} disabled={saving} title="Save (Ctrl+S)" variant="primary" wide>
          💾 {saving ? 'Saving…' : 'Save'}
        </Btn3D>
        <Btn3D onClick={() => navigate('/sap/sales-orders')} title="Back (F3)">◀</Btn3D>
        <Btn3D onClick={() => navigate('/sap')} title="Exit (Shift+F3)">⌂</Btn3D>
        <Btn3D onClick={() => navigate('/sap/sales-orders')} title="Cancel (F12)">✕</Btn3D>
        <Sep />
        <Btn3D onClick={() => navigate('/sap/sales-orders')} title="Orders List" wide>Orders</Btn3D>
        <Btn3D title="Net value / Totals" style={{ fontSize: 13, fontWeight: 700 }}>Σ</Btn3D>
        <Sep />
        <Btn3D onClick={addItem} title="Add line item" wide>+ Item</Btn3D>
        {selRow !== null && <Btn3D onClick={() => delItem(selRow)} title="Delete selected row" variant="danger">✕ Del</Btn3D>}
        <div style={{ flex: 1 }} />
        {error && (
          <span style={{ fontSize: G.fsXs, color: G.error, fontFamily: G.font, maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            ⊗ {error}
          </span>
        )}
      </div>

      {/* ══ HEADER FORM ══ */}
      <div style={{
        background: G.panel, borderBottom: `1px solid ${G.border}`,
        padding: '6px 10px', flexShrink: 0,
      }}>
        {/* Row 1 */}
        <div style={{ display: 'flex', gap: 20, marginBottom: 3 }}>
          <SapField label="Standard Order" labelW={110}>
            <SapIn value="" readOnly width={120} placeholder="(auto)" />
          </SapField>
          <div style={{ flex: 1 }} />
          <SapField label="Net value" labelW={75}>
            <SapIn value={fmt(grandTotal)} readOnly width={100} />
          </SapField>
          <span style={{ fontSize: G.fsSm, color: G.muted, alignSelf: 'center', paddingLeft: 4 }}>INR</span>
        </div>

        {/* Row 2 — Sold-to party */}
        <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginBottom: 3 }} ref={clientRef}>
          <SapField label="Sold-to party" labelW={110}>
            <SapIn value={soldTo} onChange={e => setSoldTo(e.target.value)} width={80} placeholder="ID" />
          </SapField>
          <DispField value={soldToName || 'Click 📋 to search client'} />
          <div style={{ position: 'relative' }}>
            <SearchBtn onClick={() => setShowClientDrop(p => !p)} />
            {showClientDrop && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, zIndex: 9000, minWidth: 340,
                background: G.panel, border: `1px solid ${G.borderDk}`,
                boxShadow: '2px 2px 6px rgba(0,0,0,0.3)',
              }}>
                <div style={{ padding: '2px 6px', fontSize: G.fsXs, fontWeight: 700, color: G.sapNavy, background: G.tblHdr, borderBottom: `1px solid ${G.border}` }}>
                  Search Client
                </div>
                <div style={{ padding: '4px 6px', borderBottom: `1px solid ${G.border}` }}>
                  <input
                    autoFocus
                    value={clientSearch}
                    onChange={e => setClientSearch(e.target.value)}
                    placeholder="Search by name, ID, GSTIN, state, mobile…"
                    style={{
                      width: '100%', height: 20, boxSizing: 'border-box',
                      border: `1px solid ${G.borderDk}`, padding: '0 4px',
                      fontSize: G.fsSm, fontFamily: G.font, outline: 'none',
                    }}
                  />
                </div>
                <div style={{ maxHeight: 220, overflowY: 'auto' }}>
                  <div
                    style={{ padding: '3px 8px', fontSize: G.fsSm, cursor: 'pointer', color: G.muted, borderBottom: `1px solid ${G.border}` }}
                    onClick={() => { setSoldToName(''); setSoldTo(''); setShowClientDrop(false); setClientSearch(''); }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#316AC5', e.currentTarget.style.color = '#fff')}
                    onMouseLeave={e => (e.currentTarget.style.background = '', e.currentTarget.style.color = G.muted)}>
                    — Type manually —
                  </div>
                  {clients
                    .filter(c => {
                      const q = clientSearch.toLowerCase();
                      if (!q) return true;
                      return (
                        String(c.clientId).includes(q) ||
                        (c.companyName || '').toLowerCase().includes(q) ||
                        (c.gstin || '').toLowerCase().includes(q) ||
                        (c.state || '').toLowerCase().includes(q) ||
                        (c.city || '').toLowerCase().includes(q) ||
                        (c.contactPersons || []).some(p =>
                          (p.mobileNumber || '').includes(q) ||
                          (p.name || '').toLowerCase().includes(q)
                        )
                      );
                    })
                    .map(c => (
                      <div key={c.clientId} onClick={() => selectClient(c)}
                        style={{ padding: '3px 8px', fontSize: G.fsSm, cursor: 'pointer', borderBottom: `1px solid ${G.border}` }}
                        onMouseEnter={e => (e.currentTarget.style.background = '#316AC5', e.currentTarget.style.color = '#fff')}
                        onMouseLeave={e => (e.currentTarget.style.background = '', e.currentTarget.style.color = G.text)}>
                        <span style={{ marginRight: 8, color: G.muted, fontWeight: 700 }}>{c.clientId}</span>
                        <span>{c.companyName}</span>
                        {c.state && <span style={{ marginLeft: 8, color: G.muted, fontSize: G.fsXs }}>({c.state})</span>}
                      </div>
                    ))
                  }
                  {clients.length === 0 && (
                    <div style={{ padding: '6px 8px', fontSize: G.fsSm, color: G.muted }}>No clients found</div>
                  )}
                </div>
              </div>
            )}
          </div>
          {!soldToName && (
            <SapIn value={soldToName} onChange={e => setSoldToName(e.target.value)} width={200} placeholder="Enter client name manually…" />
          )}
        </div>

        {/* Row 3 — Ship-to party (same as sold-to) */}
        <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginBottom: 3 }}>
          <SapField label="Ship-to party" labelW={110}>
            <SapIn value={soldTo} readOnly width={80} />
          </SapField>
          <DispField value={soldToName || '—'} />
          <SearchBtn />
        </div>

        {/* Row 4 — PO Number + PO date */}
        <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
          <SapField label="PO Number" labelW={110}>
            <SapIn value={poNumber} onChange={e => setPONumber(e.target.value)} width={120} placeholder="Customer PO ref" />
          </SapField>
          <SapField label="PO date" labelW={55}>
            <SapIn type="date" value={orderDate} onChange={e => setOrderDate(e.target.value)} width={110} />
          </SapField>
          <SearchBtn />
        </div>
      </div>

      {/* ══ TAB STRIP ══ */}
      <div style={{
        background: G.toolbar, borderBottom: `1px solid ${G.border}`,
        display: 'flex', alignItems: 'flex-end', padding: '3px 4px 0', flexShrink: 0,
      }}>
        {TABS.map(t => {
          const isAct = t === tab;
          return (
            <button key={t} onClick={() => setTab(t)}
              style={{
                fontFamily: G.font, fontSize: G.fsSm,
                fontWeight: isAct ? 700 : 400, color: isAct ? G.sapNavy : G.muted,
                background: isAct ? G.panel : G.btnBg,
                border: `1px solid ${G.border}`,
                borderBottom: isAct ? `1px solid ${G.panel}` : `1px solid ${G.border}`,
                marginBottom: isAct ? -1 : 0,
                padding: '2px 12px', cursor: 'pointer', marginRight: 2,
                position: 'relative', zIndex: isAct ? 1 : 0,
              }}>
              {t}
            </button>
          );
        })}
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', gap: 1, marginRight: 4, alignItems: 'center' }}>
          <Btn3D title="Scroll tabs left" style={{ height: 18, minWidth: 18 }}>◄</Btn3D>
          <Btn3D title="Scroll tabs right" style={{ height: 18, minWidth: 18 }}>►</Btn3D>
        </div>
      </div>

      {/* ══ TAB CONTENT ══ */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', background: G.panel }}>

        {/* ── SALES TAB ── */}
        {tab === 'Sales' && (
          <div style={{ padding: '6px 10px', borderBottom: `1px solid ${G.border}` }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 20px' }}>
              {/* Col 1 */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <SapField label="Delivery block" labelW={115}>
                  <SapSel value="" onChange={() => {}} options={['', 'Credit limit', 'Export hold']} width={140} />
                </SapField>
                <SapField label="Billing block" labelW={115}>
                  <SapSel value="" onChange={() => {}} options={['', 'Pending approval', 'Hold']} width={140} />
                </SapField>
                <SapField label="Payment card" labelW={115}>
                  <SapIn value="" onChange={() => {}} width={80} placeholder="Card no." />
                  <SapIn value="" onChange={() => {}} width={55} placeholder="Exp." style={{ marginLeft: 4 }} />
                </SapField>
                <SapField label="Payment terms" labelW={115}>
                  <SapSel value={payTerms} onChange={e => setPayTerms(e.target.value)} options={PAYMENT_TERMS} width={250} />
                </SapField>
                <SapField label="Order reason" labelW={115}>
                  <SapSel value="" onChange={() => {}} options={['', 'Repeat order', 'New business', 'Campaign']} width={200} />
                </SapField>
                <SapField label="Sales area" labelW={115}>
                  <SapIn value={salesOrg} onChange={e => setSalesOrg(e.target.value)} width={100} />
                  <span style={{ fontSize: G.fsXs, color: G.muted, paddingLeft: 6 }}>Enterprise sales, Cross-division</span>
                </SapField>
              </div>
              {/* Col 2 */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <SapField label="Volume" labelW={95}>
                  <SapIn value="0.000" readOnly width={80} />
                </SapField>
                <SapField label="Pricing date" labelW={95}>
                  <SapIn type="date" value={pricingDate} onChange={e => setPricingDate(e.target.value)} width={110} />
                </SapField>
                <SapField label="Exp.date" labelW={95}>
                  <SapIn value="" onChange={() => {}} width={110} type="date" />
                </SapField>
                <SapField label="Incoterms" labelW={95}>
                  <SapSel value={incoterms} onChange={e => setIncoterms(e.target.value)}
                    options={['CIF', 'FOB', 'EXW', 'DDP', 'FCA']} width={60} />
                  <SapIn value="" onChange={() => {}} width={120} placeholder="Location" style={{ marginLeft: 4 }} />
                </SapField>
                <SapField label="Req.del.date" labelW={95}>
                  <SapIn type="date" value={deliveryDate} onChange={e => setDeliveryDate(e.target.value)} width={110} />
                </SapField>
              </div>
            </div>

            {/* Project linkage section */}
            <div style={{ marginTop: 8, borderTop: `1px solid ${G.border}`, paddingTop: 6 }}>
              <div style={{ fontSize: G.fsXs, fontWeight: 700, color: G.sapNavy, textTransform: 'uppercase', marginBottom: 4 }}>
                Project Linkage (PS — Project System)
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                {[['auto', 'Auto-Create New Project'], ['existing', 'Link to Existing']].map(([mode, label]) => (
                  <label key={mode} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: G.fsSm, cursor: 'pointer' }}>
                    <input type="radio" name="projMode" value={mode} checked={projMode === mode} onChange={() => setProjMode(mode)} />
                    {label}
                  </label>
                ))}
              </div>
              {projMode === 'auto' ? (
                <div style={{ display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                  <SapField label="Project Name" labelW={100}>
                    <SapIn value={projName} onChange={e => setProjName(e.target.value)} width={200} placeholder="e.g. Cabin — ABC Corp" />
                  </SapField>
                  <SapField label="Type" labelW={40}>
                    <SapSel value={projType} onChange={e => setProjType(e.target.value)} options={PROJECT_TYPES} width={100} />
                  </SapField>
                  <SapField label="Location" labelW={62}>
                    <SapIn value={location} onChange={e => setLocation(e.target.value)} width={150} placeholder="Site address" />
                  </SapField>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                  <SapField label="Project ID" labelW={80}>
                    <SapSel value={projectId} onChange={e => setProjectId(e.target.value)}
                      options={[{ value: '', label: '— Select Project —' }, ...projects.map(p => ({ value: p.projectId, label: `${p.projectId} — ${p.projectName}` }))]}
                      width={280} />
                  </SapField>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── ITEM OVERVIEW TAB ── */}
        {tab === 'Item Overview' && (
          <div style={{ padding: '6px 0' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: G.fs }}>
              <thead>
                <tr style={{ background: G.tblHdr }}>
                  {['Item','Material','Description','ItCa','Qty','Unit','Unit Price','Tax%','Net Value','Plant','1st Date'].map((h, i) => (
                    <th key={i} style={{
                      padding: '2px 5px', textAlign: i >= 4 && i <= 8 ? 'right' : 'left',
                      color: G.sapNavy, fontWeight: 700, fontSize: G.fsSm,
                      border: `1px solid ${G.border}`, borderBottom: `2px solid ${G.borderDk}`,
                      whiteSpace: 'nowrap', background: G.tblHdr,
                    }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((it, i) => {
                  const sub = (parseFloat(it.qty)||0)*(parseFloat(it.unitPrice)||0);
                  const tax = sub*(parseFloat(it.taxPct)||0)/100;
                  const isSel = selRow === i;
                  return (
                    <tr key={i} onClick={() => setSelRow(i)}
                      style={{
                        background: isSel ? G.tblSel : (i % 2 === 0 ? G.panel : G.tblAlt),
                        cursor: 'pointer',
                      }}
                      onMouseEnter={e => !isSel && (e.currentTarget.style.background = '#D4E8F5')}
                      onMouseLeave={e => !isSel && (e.currentTarget.style.background = i % 2 === 0 ? G.panel : G.tblAlt)}
                    >
                      {/* Item no */}
                      <td style={{ padding: '1px 5px', border: `1px solid ${G.border}`, width: 40, textAlign: 'right', color: G.muted }}>
                        {(i + 1) * 10}
                      </td>
                      {/* Material code */}
                      <td style={{ padding: '1px 4px', border: `1px solid ${G.border}`, width: 80 }}>
                        <input value={it.material} onChange={e => setItem(i, 'material', e.target.value)}
                          style={{ width: 75, height: 18, border: 'none', background: 'transparent', fontSize: G.fsSm, fontFamily: G.font, color: G.text, outline: 'none' }} />
                      </td>
                      {/* Description */}
                      <td style={{ padding: '1px 4px', border: `1px solid ${G.border}`, minWidth: 160 }}>
                        <input value={it.description} onChange={e => setItem(i, 'description', e.target.value)}
                          placeholder="Description / Item name"
                          style={{ width: '100%', minWidth: 155, height: 18, border: 'none', background: 'transparent', fontSize: G.fsSm, fontFamily: G.font, color: G.text, outline: 'none' }} />
                      </td>
                      {/* ItCa */}
                      <td style={{ padding: '1px 4px', border: `1px solid ${G.border}`, width: 50 }}>
                        <input value={it.itCa} onChange={e => setItem(i, 'itCa', e.target.value)}
                          style={{ width: 45, height: 18, border: 'none', background: 'transparent', fontSize: G.fsSm, fontFamily: G.font, outline: 'none' }} />
                      </td>
                      {/* Qty */}
                      <td style={{ padding: '1px 4px', border: `1px solid ${G.border}`, width: 65, textAlign: 'right' }}>
                        <input type="number" value={it.qty} onChange={e => setItem(i, 'qty', e.target.value)} min="0"
                          style={{ width: 60, height: 18, border: 'none', background: 'transparent', fontSize: G.fsSm, fontFamily: G.font, textAlign: 'right', outline: 'none' }} />
                      </td>
                      {/* Unit */}
                      <td style={{ padding: '1px 4px', border: `1px solid ${G.border}`, width: 50 }}>
                        <input value={it.unit} onChange={e => setItem(i, 'unit', e.target.value)}
                          style={{ width: 45, height: 18, border: 'none', background: 'transparent', fontSize: G.fsSm, fontFamily: G.font, outline: 'none' }} />
                      </td>
                      {/* Unit Price */}
                      <td style={{ padding: '1px 4px', border: `1px solid ${G.border}`, width: 90, textAlign: 'right' }}>
                        <input type="number" value={it.unitPrice} onChange={e => setItem(i, 'unitPrice', e.target.value)} min="0"
                          style={{ width: 85, height: 18, border: 'none', background: 'transparent', fontSize: G.fsSm, fontFamily: G.font, textAlign: 'right', outline: 'none' }} />
                      </td>
                      {/* Tax % */}
                      <td style={{ padding: '1px 4px', border: `1px solid ${G.border}`, width: 50, textAlign: 'right' }}>
                        <input type="number" value={it.taxPct} onChange={e => setItem(i, 'taxPct', e.target.value)} min="0" max="100"
                          style={{ width: 45, height: 18, border: 'none', background: 'transparent', fontSize: G.fsSm, fontFamily: G.font, textAlign: 'right', outline: 'none' }} />
                      </td>
                      {/* Net value */}
                      <td style={{ padding: '1px 6px', border: `1px solid ${G.border}`, width: 90, textAlign: 'right', color: G.text, fontSize: G.fsSm }}>
                        {fmt(sub + tax)}
                      </td>
                      {/* Plant */}
                      <td style={{ padding: '1px 4px', border: `1px solid ${G.border}`, width: 50 }}>
                        <input value={it.plant} onChange={e => setItem(i, 'plant', e.target.value)}
                          style={{ width: 45, height: 18, border: 'none', background: 'transparent', fontSize: G.fsSm, fontFamily: G.font, outline: 'none' }} />
                      </td>
                      {/* First date */}
                      <td style={{ padding: '1px 4px', border: `1px solid ${G.border}`, width: 95 }}>
                        <input type="date" value={it.firstDate} onChange={e => setItem(i, 'firstDate', e.target.value)}
                          style={{ width: 90, height: 18, border: 'none', background: 'transparent', fontSize: G.fsXs, fontFamily: G.font, outline: 'none' }} />
                      </td>
                    </tr>
                  );
                })}
                {/* Empty add row hint */}
                <tr style={{ background: G.tblAlt }}>
                  <td colSpan={11} style={{ padding: '2px 8px', border: `1px solid ${G.border}`, color: G.muted, fontSize: G.fsXs, cursor: 'pointer' }}
                    onClick={addItem}>
                    Click here or press [+Item] to add a new line item…
                  </td>
                </tr>
              </tbody>
              <tfoot>
                <tr style={{ background: G.tblHdr }}>
                  <td colSpan={8} style={{ padding: '2px 8px', border: `1px solid ${G.border}`, textAlign: 'right', fontWeight: 700, fontSize: G.fsSm, color: G.sapNavy }}>
                    Subtotal: {fmt(subtotal)} &nbsp;|&nbsp; Tax: {fmt(taxTotal)}
                  </td>
                  <td style={{ padding: '2px 6px', border: `1px solid ${G.border}`, textAlign: 'right', fontWeight: 700, color: G.success, fontSize: G.fsSm }}>
                    {fmt(grandTotal)}
                  </td>
                  <td colSpan={2} style={{ padding: '2px 6px', border: `1px solid ${G.border}`, fontSize: G.fsXs, color: G.muted }}>INR</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {/* ── ITEM DETAIL TAB ── */}
        {tab === 'Item Detail' && (
          <div style={{ padding: '8px 10px' }}>
            <div style={{ fontSize: G.fsSm, color: G.sapNavy, fontWeight: 700, marginBottom: 6 }}>
              Material Plan — BOM / MRP Items
            </div>
            <div style={{ marginBottom: 6, display: 'flex', gap: 4 }}>
              <Btn3D onClick={addMat} wide>+ Add Material</Btn3D>
            </div>
            {mats.length === 0 ? (
              <div style={{ fontSize: G.fsSm, color: G.muted, padding: '8px 0' }}>
                No material plan items. Add materials for MRP tracking, or skip — you can add them later from the project page.
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: G.fs }}>
                <thead>
                  <tr style={{ background: G.tblHdr }}>
                    {['Item Name','Item Type','Unit','Required Qty',''].map((h, i) => (
                      <th key={i} style={{ padding: '2px 6px', textAlign: 'left', color: G.sapNavy, fontWeight: 700, fontSize: G.fsSm, border: `1px solid ${G.border}`, borderBottom: `2px solid ${G.borderDk}` }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {mats.map((m, i) => (
                    <tr key={i} style={{ background: i % 2 === 0 ? G.panel : G.tblAlt }}>
                      <td style={{ padding: '1px 4px', border: `1px solid ${G.border}`, minWidth: 160 }}>
                        <input value={m.itemName} onChange={e => setMat(i,'itemName',e.target.value)} placeholder="e.g. MS Pipe 50mm"
                          style={{ width: '100%', height: 18, border: 'none', background: 'transparent', fontSize: G.fsSm, fontFamily: G.font, outline: 'none' }} />
                      </td>
                      <td style={{ padding: '1px 4px', border: `1px solid ${G.border}`, width: 130 }}>
                        <select value={m.itemType} onChange={e => setMat(i,'itemType',e.target.value)}
                          style={{ width: 125, height: 18, border: 'none', background: 'transparent', fontSize: G.fsSm, fontFamily: G.font }}>
                          <option>Raw Material</option><option>Manufactured</option><option>Bought Out</option>
                        </select>
                      </td>
                      <td style={{ padding: '1px 4px', border: `1px solid ${G.border}`, width: 60 }}>
                        <input value={m.unit} onChange={e => setMat(i,'unit',e.target.value)}
                          style={{ width: 55, height: 18, border: 'none', background: 'transparent', fontSize: G.fsSm, fontFamily: G.font, outline: 'none' }} />
                      </td>
                      <td style={{ padding: '1px 4px', border: `1px solid ${G.border}`, width: 90, textAlign: 'right' }}>
                        <input type="number" value={m.requiredQty} onChange={e => setMat(i,'requiredQty',e.target.value)} min="0"
                          style={{ width: 85, height: 18, border: 'none', background: 'transparent', fontSize: G.fsSm, fontFamily: G.font, textAlign: 'right', outline: 'none' }} />
                      </td>
                      <td style={{ padding: '1px 4px', border: `1px solid ${G.border}`, width: 30, textAlign: 'center' }}>
                        <Btn3D onClick={() => delMat(i)} title="Delete row" variant="danger" style={{ height: 18, minWidth: 18, fontSize: 10 }}>✕</Btn3D>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* ── ORDERING PARTY TAB ── */}
        {tab === 'Ordering Party' && (
          <div style={{ padding: '8px 10px' }}>
            <SapField label="Notes / Header text" labelW={120}>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={5}
                placeholder="Special instructions, delivery notes, terms…"
                style={{
                  width: 400, boxSizing: 'border-box', resize: 'vertical',
                  background: G.inputBg, border: '1px solid',
                  borderTopColor: G.borderDk, borderLeftColor: G.borderDk,
                  borderRightColor: G.borderLt, borderBottomColor: G.borderLt,
                  padding: '2px 4px', fontSize: G.fs, fontFamily: G.font, color: G.text, outline: 'none',
                }} />
            </SapField>
          </div>
        )}

        {/* ── PROCUREMENT TAB ── */}
        {tab === 'Procurement' && (
          <div style={{ padding: '8px 10px' }}>
            <div style={{ fontSize: G.fsSm, color: G.muted }}>
              Procurement details will be available after the Sales Order is saved and the project is created. Navigate to the Project → MRP to plan materials.
            </div>
          </div>
        )}

        {/* ══ "All items" summary box (visible on Sales tab) ══ */}
        {tab === 'Sales' && (
          <div style={{ margin: '0 0', borderTop: `1px solid ${G.border}` }}>
            {/* Group box header */}
            <div style={{
              background: G.tblHdr, borderBottom: `1px solid ${G.border}`,
              padding: '2px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <span style={{ fontSize: G.fsSm, fontWeight: 700, color: G.sapNavy }}>All items</span>
              <Btn3D onClick={addItem} title="Add item row" style={{ fontSize: G.fsXs, height: 18, minWidth: 18 }}>+</Btn3D>
            </div>

            {/* Dense items table */}
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: G.fsSm }}>
                <thead>
                  <tr style={{ background: G.tblHdr }}>
                    {['Item','Material','ItCa','DG','HgLvlt','D','First date','Plnt','Batch','CnTy','Amount'].map((h, i) => (
                      <th key={i} style={{
                        padding: '2px 5px', border: `1px solid ${G.border}`, borderBottom: `2px solid ${G.borderDk}`,
                        color: G.sapNavy, fontWeight: 700, fontSize: G.fsXs, whiteSpace: 'nowrap',
                        textAlign: i >= 10 ? 'right' : 'left',
                      }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, i) => {
                    const sub = (parseFloat(it.qty)||0)*(parseFloat(it.unitPrice)||0);
                    const tax = sub*(parseFloat(it.taxPct)||0)/100;
                    const isSel = selRow === i;
                    return (
                      <tr key={i} onClick={() => setSelRow(i)}
                        style={{
                          background: isSel ? G.tblSel : (i % 2 === 0 ? G.panel : G.tblAlt),
                          cursor: 'pointer', height: 20,
                        }}
                        onMouseEnter={e => !isSel && (e.currentTarget.style.background = '#D4E8F5')}
                        onMouseLeave={e => !isSel && (e.currentTarget.style.background = i % 2 === 0 ? G.panel : G.tblAlt)}
                      >
                        <td style={{ padding: '1px 5px', border: `1px solid ${G.border}`, width: 35, textAlign: 'right', color: G.muted }}>{(i+1)*10}</td>
                        <td style={{ padding: '1px 4px', border: `1px solid ${G.border}`, width: 75, color: G.sapBlue }}>{it.material || '—'}</td>
                        <td style={{ padding: '1px 4px', border: `1px solid ${G.border}`, width: 40 }}>{it.itCa}</td>
                        <td style={{ padding: '1px 4px', border: `1px solid ${G.border}`, width: 30 }}></td>
                        <td style={{ padding: '1px 4px', border: `1px solid ${G.border}`, width: 50 }}></td>
                        <td style={{ padding: '1px 4px', border: `1px solid ${G.border}`, width: 25 }}>D</td>
                        <td style={{ padding: '1px 4px', border: `1px solid ${G.border}`, width: 80 }}>{it.firstDate}</td>
                        <td style={{ padding: '1px 4px', border: `1px solid ${G.border}`, width: 45 }}>{it.plant}</td>
                        <td style={{ padding: '1px 4px', border: `1px solid ${G.border}`, width: 50 }}></td>
                        <td style={{ padding: '1px 4px', border: `1px solid ${G.border}`, width: 40 }}>{it.itCa}</td>
                        <td style={{ padding: '1px 6px', border: `1px solid ${G.border}`, width: 90, textAlign: 'right' }}>{fmt(sub+tax)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* ══ BOTTOM ICON BAR ══ */}
            <div style={{
              background: G.toolbar, borderTop: `1px solid ${G.border}`,
              padding: '2px 6px', display: 'flex', alignItems: 'center', gap: 2,
            }}>
              {[
                { icon: '📋', title: 'Copy row' },
                { icon: '✕', title: 'Delete row', onClick: () => selRow !== null && delItem(selRow) },
                { icon: '↑', title: 'Move up' },
                { icon: '↓', title: 'Move down' },
                null,
                { icon: '🔍', title: 'Find' },
                { icon: '◀', title: 'Previous page' },
                { icon: '▶', title: 'Next page' },
                null,
                { icon: '⊕', title: 'Add sub-item' },
                { icon: '⊗', title: 'Remove sub-item' },
                null,
                { icon: 'Σ', title: 'Totals', style: { fontWeight: 700, fontSize: 14 } },
                { icon: '🖨', title: 'Print' },
              ].map((btn, i) =>
                btn === null
                  ? <Sep key={i} />
                  : <Btn3D key={i} onClick={btn.onClick} title={btn.title} style={btn.style}>{btn.icon}</Btn3D>
              )}
              <div style={{ flex: 1 }} />
              <span style={{ fontSize: G.fsXs, color: G.muted }}>{items.length} item{items.length !== 1 ? 's' : ''}</span>
            </div>
          </div>
        )}
      </div>

      {/* ══ HORIZONTAL SCROLLBAR HINT ══ */}
      <div style={{
        height: 14, background: G.toolbar, borderTop: `1px solid ${G.border}`,
        display: 'flex', alignItems: 'center', padding: '0 6px', flexShrink: 0,
      }}>
        <div style={{ flex: 1, height: 8, background: '#D0CCB8', border: `1px solid ${G.border}`, position: 'relative' }}>
          <div style={{ width: '20%', height: '100%', background: G.btnBg, border: `1px solid ${G.borderDk}` }} />
        </div>
      </div>
    </div>
  );
}
