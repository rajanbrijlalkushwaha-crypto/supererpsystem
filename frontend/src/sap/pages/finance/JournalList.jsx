/**
 * SAP GUI STYLE — Journal Entries
 * Transaction: FB03 — Display G/L Account Document
 * Strictly replicates classic SAP GUI desktop look (no modern UI)
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useSAP } from '../../context/SAPContext';

/* ════════════════════════════════════════════════════════════════
   SAP GUI Design Tokens  (Windows XP / SAP Classic palette)
════════════════════════════════════════════════════════════════ */
const S = {
  /* backgrounds */
  screenBg:    '#f4f4f4',
  panelBg:     '#ffffff',
  menuBg:      '#ECE9D8',
  tblHdrBg:    '#D6D2C8',
  tblRowAlt:   '#F9F9F9',
  tblSelected: '#B8CFE5',
  inputBg:     '#ffffff',
  statusBg:    '#ECE9D8',
  sectionBg:   '#EBE7DE',
  /* borders */
  border:      '#C0C0C0',
  borderDark:  '#808080',
  borderMid:   '#ACA899',
  borderLight: '#ffffff',
  /* text */
  text:        '#000000',
  textMuted:   '#555555',
  textLabel:   '#003366',
  link:        '#0054A6',
  error:       '#CC0000',
  success:     '#007830',
  warn:        '#E6A800',
  /* button (raised 3D) */
  btnBg:       '#D4D0C8',
  /* SAP brand */
  sapNavy:     '#003875',
  sapBlue:     '#0070D2',
  sapSelected: '#316AC5',
  /* fonts */
  font:        "Arial, Helvetica, 'Liberation Sans', sans-serif",
  fs:          '11px',
  fsSm:        '10px',
};

/* ────────────────────────────────────────────────────────────
   Mini helpers
──────────────────────────────────────────────────────────── */
const fmt = (n) => n == null ? '' : Number(n).toFixed(2);
const fmtDate = (d) => {
  if (!d) return '';
  try { const dt = new Date(d); return `${String(dt.getDate()).padStart(2,'0')}/${String(dt.getMonth()+1).padStart(2,'0')}/${dt.getFullYear()}`; }
  catch { return d; }
};
const fy = (d) => { const dt = d ? new Date(d) : new Date(); return dt.getMonth() >= 3 ? dt.getFullYear() : dt.getFullYear()-1; };

/* ────────────────────────────────────────────────────────────
   SAP-style Button (raised 3D effect)
──────────────────────────────────────────────────────────── */
function SapBtn({ children, onClick, disabled, icon, small, danger }) {
  const [pressed, setPressed] = useState(false);
  if (disabled) return (
    <button disabled style={{ ...btnBase(small), color: '#808080', cursor: 'default', borderTopColor: '#ffffff', borderLeftColor: '#ffffff', borderRightColor: '#808080', borderBottomColor: '#808080' }}>
      {icon && <span style={{ marginRight: 3 }}>{icon}</span>}{children}
    </button>
  );
  return (
    <button
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      onMouseLeave={() => setPressed(false)}
      onClick={onClick}
      style={{
        ...btnBase(small),
        borderTopColor:    pressed ? S.borderDark  : S.borderLight,
        borderLeftColor:   pressed ? S.borderDark  : S.borderLight,
        borderRightColor:  pressed ? S.borderLight : S.borderDark,
        borderBottomColor: pressed ? S.borderLight : S.borderDark,
        color: danger ? S.error : S.text,
      }}>
      {icon && <span style={{ marginRight: children ? 3 : 0 }}>{icon}</span>}{children}
    </button>
  );
}
const btnBase = (small) => ({
  background: S.btnBg,
  border: `1px solid`,
  fontFamily: S.font,
  fontSize: small ? S.fsSm : S.fs,
  padding: small ? '1px 5px' : '2px 10px',
  cursor: 'pointer',
  color: S.text,
  userSelect: 'none',
  borderRadius: 0,
  whiteSpace: 'nowrap',
  height: small ? 18 : 22,
  display: 'inline-flex',
  alignItems: 'center',
});

/* ────────────────────────────────────────────────────────────
   SAP Menu Bar
──────────────────────────────────────────────────────────── */
const MENUS = [
  { label: 'Journal', items: ['Display Document', 'Display List', '─', 'Print', '─', 'Exit'] },
  { label: 'Edit',    items: ['Find', 'Select All', 'Deselect All', '─', 'Copy Row', 'Delete Row'] },
  { label: 'Goto',    items: ['Document Header', 'Line Items', 'Back', '─', 'First Page', 'Last Page'] },
  { label: 'Document',items: ['Simulate', 'Post', 'Hold', '─', 'Reset to Original', 'Reverse'] },
  { label: 'Environment', items: ['Account Balances', 'Line Items Report', '─', 'Document Environment'] },
  { label: 'System',  items: ['User Profile', 'Services', '─', 'Log Off'] },
  { label: 'Help',    items: ['Application Help', 'SAP Library', '─', 'About'] },
];

function SapMenuBar({ statusMsg, setStatusMsg }) {
  const [open, setOpen] = useState(null);
  const ref = useRef(null);

  useEffect(() => {
    const fn = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(null); };
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, []);

  return (
    <div ref={ref} style={{ background: S.menuBg, borderBottom: `1px solid ${S.borderMid}`, height: 20, display: 'flex', alignItems: 'stretch', position: 'relative', zIndex: 100, flexShrink: 0 }}>
      {MENUS.map((m, mi) => (
        <div key={m.label} style={{ position: 'relative' }}>
          <div
            onClick={() => setOpen(open === mi ? null : mi)}
            onMouseEnter={() => open !== null && setOpen(mi)}
            style={{ padding: '0 8px', height: '100%', display: 'flex', alignItems: 'center', background: open === mi ? S.sapSelected : 'transparent', color: open === mi ? '#fff' : S.text, fontSize: S.fs, fontFamily: S.font, cursor: 'default', userSelect: 'none', whiteSpace: 'nowrap' }}>
            {m.label}
          </div>
          {open === mi && (
            <div style={{ position: 'absolute', top: '100%', left: 0, background: S.panelBg, border: `1px solid ${S.borderDark}`, boxShadow: '2px 2px 4px rgba(0,0,0,0.3)', zIndex: 200, minWidth: 180 }}>
              {m.items.map((item, ii) => item === '─'
                ? <div key={ii} style={{ borderTop: `1px solid ${S.border}`, margin: '2px 0' }} />
                : <div key={ii}
                    onClick={() => { setOpen(null); setStatusMsg(item); }}
                    style={{ padding: '3px 20px', fontSize: S.fs, fontFamily: S.font, color: S.text, cursor: 'default', userSelect: 'none', whiteSpace: 'nowrap' }}
                    onMouseEnter={e => e.currentTarget.style.background = S.sapSelected + ', color: #fff'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    {item}
                  </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
   SAP Standard Toolbar
──────────────────────────────────────────────────────────── */
function SapToolbar({ onBack, onRefresh, onNew, view, onSearch, searchVal, setSearchVal }) {
  return (
    <div style={{ background: S.menuBg, borderBottom: `1px solid ${S.borderMid}`, height: 28, display: 'flex', alignItems: 'center', padding: '0 4px', gap: 2, flexShrink: 0 }}>
      {/* Standard SAP icon buttons */}
      {[
        { icon: '💾', tip: 'Save', action: null },
        { icon: '◀', tip: 'Back', action: onBack },
        { icon: '✕', tip: 'Exit', action: null },
        { icon: '⛔', tip: 'Cancel', action: null },
      ].map((b, i) => (
        <SapBtn key={i} small onClick={b.action || (() => {})} icon={b.icon} />
      ))}

      <div style={{ width: 1, height: 18, background: S.border, margin: '0 3px' }} />

      {/* Find / refresh */}
      <SapBtn small icon="🔍" onClick={null} />
      <SapBtn small icon="↻"  onClick={onRefresh} />

      <div style={{ width: 1, height: 18, background: S.border, margin: '0 3px' }} />

      {/* View-specific: list-view search */}
      {view === 'list' && (
        <>
          <span style={{ fontSize: S.fsSm, fontFamily: S.font, color: S.text, marginLeft: 4 }}>Search:</span>
          <input
            value={searchVal} onChange={e => setSearchVal(e.target.value)}
            style={{ height: 18, border: `1px solid ${S.borderDark}`, borderRadius: 0, fontSize: S.fs, fontFamily: S.font, padding: '0 4px', width: 200, background: S.inputBg, color: S.text, outline: 'none' }}
            placeholder="Document number, description…"
          />
          <SapBtn small onClick={() => setSearchVal('')}>Clear</SapBtn>
        </>
      )}

      <div style={{ flex: 1 }} />

      {/* T-code box (right side of toolbar — SAP convention) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 3, border: `1px solid ${S.border}`, padding: '1px 6px', background: S.inputBg, marginRight: 4 }}>
        <span style={{ fontSize: S.fsSm, fontFamily: S.font, color: S.textMuted }}>Transaction:</span>
        <span style={{ fontSize: S.fs, fontFamily: S.font, fontWeight: 'bold', color: S.text }}>FB03</span>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
   SAP Application Toolbar (transaction-specific buttons)
──────────────────────────────────────────────────────────── */
function SapAppToolbar({ view, onBack, selected, setStatusMsg }) {
  if (view === 'list') return (
    <div style={{ background: S.menuBg, borderBottom: `1px solid ${S.borderMid}`, height: 26, display: 'flex', alignItems: 'center', padding: '0 6px', gap: 4, flexShrink: 0 }}>
      <SapBtn onClick={() => setStatusMsg('Display List: All G/L Journal Documents')}> Display List </SapBtn>
      <SapBtn onClick={() => setStatusMsg('Filter applied')}> Filter </SapBtn>
      <SapBtn onClick={() => setStatusMsg('Sort ascending')}> Sort ↑ </SapBtn>
      <div style={{ width: 1, height: 18, background: S.border, margin: '0 2px' }} />
      <SapBtn onClick={() => setStatusMsg('Print preview')}> Print </SapBtn>
      <SapBtn onClick={() => setStatusMsg('Export to spreadsheet')}> Export </SapBtn>
    </div>
  );
  return (
    <div style={{ background: S.menuBg, borderBottom: `1px solid ${S.borderMid}`, height: 26, display: 'flex', alignItems: 'center', padding: '0 6px', gap: 4, flexShrink: 0 }}>
      <SapBtn onClick={onBack}> ◀ Back to List </SapBtn>
      <div style={{ width: 1, height: 18, background: S.border, margin: '0 2px' }} />
      <SapBtn onClick={() => setStatusMsg(`Document ${selected?.journalId} — Simulate mode (display only)`)}>Simulate</SapBtn>
      <SapBtn disabled>Post</SapBtn>
      <SapBtn disabled>Hold</SapBtn>
      <div style={{ width: 1, height: 18, background: S.border, margin: '0 2px' }} />
      <SapBtn onClick={() => setStatusMsg(`Document ${selected?.journalId} reversed`)} danger>Reverse</SapBtn>
      <SapBtn onClick={() => setStatusMsg(`Printed: ${selected?.journalId}`)}>Print Preview</SapBtn>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
   SAP Screen Title Bar
──────────────────────────────────────────────────────────── */
function SapTitleBar({ title }) {
  return (
    <div style={{ background: S.sectionBg, borderBottom: `1px solid ${S.border}`, padding: '3px 8px', flexShrink: 0 }}>
      <span style={{ fontSize: '12px', fontWeight: 'bold', fontFamily: S.font, color: S.text }}>{title}</span>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
   SAP Header Form Field (label + input box)
──────────────────────────────────────────────────────────── */
function SapField({ label, value, width, mand }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: 2 }}>
      <span style={{ fontSize: S.fs, fontFamily: S.font, color: mand ? S.sapBlue : S.text, fontWeight: mand ? 'bold' : 'normal', width: 120, textAlign: 'right', paddingRight: 4, flexShrink: 0 }}>
        {label}{mand && <span style={{ color: S.error }}>*</span>}
      </span>
      <input
        readOnly value={value || ''}
        style={{ height: 16, border: `1px solid ${S.borderDark}`, borderRadius: 0, fontSize: S.fs, fontFamily: S.font, padding: '0 3px', width: width || 120, background: value ? S.inputBg : '#FAFAFA', color: S.text, outline: 'none' }}
      />
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
   SAP Document Header Form (FB50 header section)
──────────────────────────────────────────────────────────── */
function DocHeaderForm({ doc, companyName, companyId }) {
  const docType = doc.documentType || 'SA';
  const docDate = fmtDate(doc.postingDate || doc.createdAt);
  const fiscalY = fy(doc.postingDate || doc.createdAt);

  return (
    <div style={{ background: S.panelBg, border: `1px solid ${S.border}`, margin: '6px 6px 0', padding: 0, flexShrink: 0 }}>
      {/* Section title */}
      <div style={{ background: S.sectionBg, borderBottom: `1px solid ${S.border}`, padding: '2px 6px' }}>
        <span style={{ fontSize: S.fsSm, fontFamily: S.font, fontWeight: 'bold', color: S.text }}>Document Header</span>
      </div>
      <div style={{ padding: '6px 8px', display: 'flex', gap: 30, flexWrap: 'wrap' }}>
        {/* Column 1 */}
        <div>
          <SapField label="Document No."   value={doc.journalId}    mand />
          <SapField label="Document Date"  value={docDate}          mand />
          <SapField label="Posting Date"   value={docDate}          mand />
        </div>
        {/* Column 2 */}
        <div>
          <SapField label="Document Type"  value={docType} width={40} />
          <SapField label="Company Code"   value={companyId || 'CORP'} width={60} />
          <SapField label="Fiscal Year"    value={String(fiscalY)} width={60} />
        </div>
        {/* Column 3 */}
        <div>
          <SapField label="Currency"       value="INR"   width={40} />
          <SapField label="Reference"      value={doc.referenceNum || ''} />
          <SapField label="Doc. Header Text" value={doc.description || ''} width={200} />
        </div>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
   SAP G/L Line Items Table (main FB50 grid)
──────────────────────────────────────────────────────────── */
function GlLineTable({ entries }) {
  const totalDr = entries.reduce((s, e) => s + (e.debit  || 0), 0);
  const totalCr = entries.reduce((s, e) => s + (e.credit || 0), 0);
  const balanced = Math.abs(totalDr - totalCr) < 0.01;

  const COL_W = { itm: 36, dc: 28, curr: 40, amount: 110, costCtr: 100 };

  return (
    <div style={{ margin: '4px 6px 6px', border: `1px solid ${S.border}`, background: S.panelBg, flexShrink: 0 }}>
      {/* Column header row */}
      <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
        <colgroup>
          <col style={{ width: COL_W.itm }} />
          <col style={{ width: 160 }} />
          <col />
          <col style={{ width: COL_W.dc }} />
          <col style={{ width: COL_W.curr }} />
          <col style={{ width: COL_W.amount }} />
          <col style={{ width: COL_W.amount }} />
          <col style={{ width: COL_W.costCtr }} />
        </colgroup>
        <thead>
          <tr style={{ background: S.tblHdrBg }}>
            {['Itm','G/L Account','Account Description','D/C','Curr','Debit','Credit','Cost Center'].map((h,i) => (
              <th key={i} style={{ padding: '2px 4px', fontSize: S.fsSm, fontFamily: S.font, fontWeight: 'bold', color: S.text, textAlign: i >= 5 ? 'right' : 'left', borderRight: `1px solid ${S.border}`, borderBottom: `2px solid ${S.borderDark}`, whiteSpace: 'nowrap', overflow: 'hidden' }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {entries.map((e, i) => {
            const isDr = (e.debit || 0) > 0;
            return (
              <tr key={i} style={{ background: i % 2 === 0 ? S.panelBg : S.tblRowAlt, borderBottom: `1px solid ${S.border}` }}
                onMouseEnter={ev => ev.currentTarget.style.background = S.tblSelected}
                onMouseLeave={ev => ev.currentTarget.style.background = i % 2 === 0 ? S.panelBg : S.tblRowAlt}>
                {/* Itm */}
                <td style={{ padding: '1px 4px', fontSize: S.fs, fontFamily: S.font, color: S.text, borderRight: `1px solid ${S.border}`, textAlign: 'center' }}>
                  {String(i + 1).padStart(3, '0')}
                </td>
                {/* G/L Account */}
                <td style={{ padding: '1px 4px', fontSize: S.fs, fontFamily: S.font, color: S.link, borderRight: `1px solid ${S.border}`, fontWeight: 'bold' }}>
                  {e.account}
                </td>
                {/* Description */}
                <td style={{ padding: '1px 4px', fontSize: S.fs, fontFamily: S.font, color: S.text, borderRight: `1px solid ${S.border}`, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {e.account}
                </td>
                {/* D/C */}
                <td style={{ padding: '1px 4px', fontSize: S.fs, fontFamily: S.font, fontWeight: 'bold', textAlign: 'center', color: isDr ? '#00009B' : '#990000', borderRight: `1px solid ${S.border}` }}>
                  {isDr ? 'Dr' : 'Cr'}
                </td>
                {/* Currency */}
                <td style={{ padding: '1px 4px', fontSize: S.fs, fontFamily: S.font, color: S.textMuted, textAlign: 'center', borderRight: `1px solid ${S.border}` }}>
                  INR
                </td>
                {/* Debit */}
                <td style={{ padding: '1px 4px', fontSize: S.fs, fontFamily: S.font, textAlign: 'right', color: isDr ? '#00009B' : S.textMuted, borderRight: `1px solid ${S.border}`, fontWeight: isDr ? 'bold' : 'normal' }}>
                  {isDr ? fmt(e.debit) : ''}
                </td>
                {/* Credit */}
                <td style={{ padding: '1px 4px', fontSize: S.fs, fontFamily: S.font, textAlign: 'right', color: !isDr ? '#990000' : S.textMuted, borderRight: `1px solid ${S.border}`, fontWeight: !isDr ? 'bold' : 'normal' }}>
                  {!isDr ? fmt(e.credit) : ''}
                </td>
                {/* Cost Center */}
                <td style={{ padding: '1px 4px', fontSize: S.fs, fontFamily: S.font, color: S.text }}>
                  {e.costCenter || ''}
                </td>
              </tr>
            );
          })}
        </tbody>
        {/* Totals footer */}
        <tfoot>
          <tr style={{ background: S.sectionBg, borderTop: `2px solid ${S.borderDark}` }}>
            <td colSpan={5} style={{ padding: '2px 4px', fontSize: S.fsSm, fontFamily: S.font, fontWeight: 'bold', color: S.text, borderRight: `1px solid ${S.border}` }}>
              Total
            </td>
            <td style={{ padding: '2px 4px', fontSize: S.fs, fontFamily: S.font, textAlign: 'right', fontWeight: 'bold', color: '#00009B', borderRight: `1px solid ${S.border}` }}>
              {fmt(totalDr)}
            </td>
            <td style={{ padding: '2px 4px', fontSize: S.fs, fontFamily: S.font, textAlign: 'right', fontWeight: 'bold', color: '#990000', borderRight: `1px solid ${S.border}` }}>
              {fmt(totalCr)}
            </td>
            <td style={{ padding: '2px 4px', fontSize: S.fsSm, fontFamily: S.font, fontWeight: 'bold', color: balanced ? S.success : S.error }}>
              {balanced ? '✔ Balanced' : `✘ Difference: ${fmt(Math.abs(totalDr - totalCr))}`}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
   SAP ALV-style Document List
──────────────────────────────────────────────────────────── */
function DocListView({ list, loading, search, onSelect }) {
  const COL_W = { id: 150, type: 90, date: 90, ref: 110 };
  return (
    <div style={{ margin: '4px 6px', border: `1px solid ${S.border}`, background: S.panelBg, overflowX: 'auto' }}>
      {/* ALV toolbar */}
      <div style={{ background: S.sectionBg, borderBottom: `1px solid ${S.border}`, padding: '2px 6px', display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: S.fsSm, fontFamily: S.font, fontWeight: 'bold', color: S.text }}>
          G/L Journal Documents — {list.length} Record{list.length !== 1 ? 's' : ''}
        </span>
        {search && (
          <span style={{ fontSize: S.fsSm, fontFamily: S.font, color: S.error }}>
            [Filter: "{search}" — {list.length} match{list.length !== 1 ? 'es' : ''}]
          </span>
        )}
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
        <colgroup>
          <col style={{ width: 30 }} />
          <col style={{ width: COL_W.id }} />
          <col style={{ width: COL_W.type }} />
          <col />
          <col style={{ width: COL_W.date }} />
          <col style={{ width: COL_W.ref }} />
          <col style={{ width: 80 }} />
        </colgroup>
        <thead>
          <tr style={{ background: S.tblHdrBg }}>
            {['','Document No.','Doc. Type','Header Text / Description','Pst. Date','Reference','Entries'].map((h,i) => (
              <th key={i} style={{ padding: '2px 5px', fontSize: S.fsSm, fontFamily: S.font, fontWeight: 'bold', color: S.text, textAlign: i === 6 ? 'right' : 'left', borderRight: `1px solid ${S.border}`, borderBottom: `2px solid ${S.borderDark}`, whiteSpace: 'nowrap', userSelect: 'none', cursor: i > 0 ? 'pointer' : 'default' }}>
                {h}{i > 0 && i < 6 && <span style={{ color: S.textMuted, marginLeft: 2 }}>▼</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading
            ? <tr><td colSpan={7} style={{ padding: '12px 8px', textAlign: 'center', fontSize: S.fs, fontFamily: S.font, color: S.textMuted }}>Loading document list…</td></tr>
            : list.length === 0
            ? <tr><td colSpan={7} style={{ padding: '12px 8px', textAlign: 'center', fontSize: S.fs, fontFamily: S.font, color: S.textMuted }}>No documents found.</td></tr>
            : list.map((doc, i) => {
              const balanced = (() => {
                const dr = (doc.entries||[]).reduce((s,e)=>s+(e.debit||0),0);
                const cr = (doc.entries||[]).reduce((s,e)=>s+(e.credit||0),0);
                return Math.abs(dr-cr) < 0.01;
              })();
              return (
                <tr key={doc.journalId}
                  style={{ background: i % 2 === 0 ? S.panelBg : S.tblRowAlt, cursor: 'pointer', borderBottom: `1px solid ${S.border}` }}
                  onClick={() => onSelect(doc)}
                  onMouseEnter={e => e.currentTarget.style.background = S.tblSelected}
                  onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? S.panelBg : S.tblRowAlt}>
                  {/* Traffic light icon */}
                  <td style={{ padding: '1px 4px', textAlign: 'center', borderRight: `1px solid ${S.border}` }}>
                    <span style={{ color: balanced ? S.success : S.error, fontSize: 10 }}>{balanced ? '●' : '●'}</span>
                  </td>
                  {/* Document ID */}
                  <td style={{ padding: '1px 5px', fontSize: S.fs, fontFamily: S.font, color: S.link, fontWeight: 'bold', borderRight: `1px solid ${S.border}` }}>
                    {doc.journalId}
                  </td>
                  {/* Type */}
                  <td style={{ padding: '1px 5px', fontSize: S.fs, fontFamily: S.font, color: S.text, borderRight: `1px solid ${S.border}` }}>
                    <span style={{ background: S.sectionBg, border: `1px solid ${S.border}`, padding: '0 4px', fontSize: S.fsSm, fontFamily: S.font }}>
                      {doc.documentType || 'SA'}
                    </span>
                  </td>
                  {/* Description */}
                  <td style={{ padding: '1px 5px', fontSize: S.fs, fontFamily: S.font, color: S.text, borderRight: `1px solid ${S.border}`, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {doc.description}
                  </td>
                  {/* Date */}
                  <td style={{ padding: '1px 5px', fontSize: S.fs, fontFamily: S.font, color: S.text, borderRight: `1px solid ${S.border}`, whiteSpace: 'nowrap' }}>
                    {fmtDate(doc.postingDate)}
                  </td>
                  {/* Reference */}
                  <td style={{ padding: '1px 5px', fontSize: S.fs, fontFamily: S.font, color: S.textMuted, borderRight: `1px solid ${S.border}` }}>
                    {doc.referenceNum || ''}
                  </td>
                  {/* Entry count */}
                  <td style={{ padding: '1px 5px', fontSize: S.fs, fontFamily: S.font, color: S.text, textAlign: 'right' }}>
                    {(doc.entries || []).length}
                  </td>
                </tr>
              );
            })
          }
        </tbody>
      </table>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
   SAP Tab Strip
──────────────────────────────────────────────────────────── */
function SapTabStrip({ tabs, active, onSelect }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', padding: '0 6px', background: S.screenBg, marginTop: 4, gap: 0, flexShrink: 0 }}>
      {tabs.map((t, i) => (
        <div key={t} onClick={() => onSelect(t)}
          style={{ padding: '3px 14px 2px', fontSize: S.fs, fontFamily: S.font, cursor: 'default', userSelect: 'none', background: active === t ? S.panelBg : S.menuBg, border: `1px solid ${S.border}`, borderBottom: active === t ? `1px solid ${S.panelBg}` : `1px solid ${S.border}`, marginRight: 2, fontWeight: active === t ? 'bold' : 'normal', color: active === t ? S.text : S.textMuted, position: 'relative', bottom: -1 }}>
          {t}
        </div>
      ))}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
   SAP Status Bar (bottom)
──────────────────────────────────────────────────────────── */
function SapStatusBar({ msg, docCount, companyId }) {
  const time = new Date().toLocaleTimeString('en-IN', { hour12: false });
  return (
    <div style={{ background: S.statusBg, borderTop: `1px solid ${S.borderMid}`, height: 18, display: 'flex', alignItems: 'center', padding: '0 6px', gap: 0, flexShrink: 0 }}>
      {/* Traffic light */}
      <span style={{ width: 12, height: 12, borderRadius: '50%', background: msg.startsWith('✘') || msg.includes('Error') ? S.error : msg.includes('✔') ? S.success : S.warn, display: 'inline-block', marginRight: 6, flexShrink: 0, border: `1px solid ${S.borderDark}` }} />
      {/* Message */}
      <span style={{ flex: 1, fontSize: S.fs, fontFamily: S.font, color: msg.startsWith('✘') ? S.error : S.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {msg || 'FB03  Display G/L Account Document'}
      </span>
      {/* Right info */}
      <div style={{ display: 'flex', gap: 0, flexShrink: 0 }}>
        {[
          companyId || 'CORP',
          `${docCount} Docs`,
          'INR',
          time,
        ].map((v, i) => (
          <React.Fragment key={i}>
            <div style={{ width: 1, height: 14, background: S.border }} />
            <span style={{ padding: '0 6px', fontSize: S.fsSm, fontFamily: S.font, color: S.textMuted }}>{v}</span>
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   MAIN COMPONENT — FB03 / Journal List
════════════════════════════════════════════════════════════════ */
export default function JournalList() {
  const { api, companyId } = useSAP();
  const [list,    setList]    = useState([]);
  const [loading, setLoading] = useState(true);
  const [search,  setSearch]  = useState('');
  const [view,    setView]    = useState('list');      // 'list' | 'document'
  const [selected,setSelected]= useState(null);
  const [tab,     setTab]     = useState('Basic Data');
  const [statusMsg, setStatusMsg] = useState('FB03  Display G/L Account Document');

  const load = useCallback(() => {
    setLoading(true);
    api('/api/sap/finance/journals')
      .then(r => { setList(r.data || []); setLoading(false); setStatusMsg(`${(r.data||[]).length} documents loaded.`); })
      .catch(() => { setLoading(false); setStatusMsg('✘ Error: Could not load journals.'); });
  }, [api]);

  useEffect(() => { load(); }, [load]);

  const filtered = list.filter(j => {
    const q = search.toLowerCase();
    return !q || j.journalId?.toLowerCase().includes(q) || j.description?.toLowerCase().includes(q) || j.documentType?.toLowerCase().includes(q) || j.referenceNum?.toLowerCase().includes(q);
  });

  const openDoc = (doc) => {
    setSelected(doc);
    setView('document');
    setTab('Basic Data');
    setStatusMsg(`Document ${doc.journalId} displayed.`);
  };

  const backToList = () => {
    setView('list');
    setSelected(null);
    setStatusMsg(`FB03  Display G/L Account Document | ${list.length} documents`);
  };

  const totalDr = (selected?.entries || []).reduce((s, e) => s + (e.debit  || 0), 0);
  const totalCr = (selected?.entries || []).reduce((s, e) => s + (e.credit || 0), 0);

  return (
    /* SAP Screen Root */
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: S.screenBg, fontFamily: S.font, fontSize: S.fs, color: S.text, overflow: 'hidden' }}>

      {/* ① Menu Bar */}
      <SapMenuBar statusMsg={statusMsg} setStatusMsg={setStatusMsg} />

      {/* ② Standard Toolbar */}
      <SapToolbar
        onBack={view === 'document' ? backToList : null}
        onRefresh={load}
        view={view}
        searchVal={search}
        setSearchVal={setSearch}
      />

      {/* ③ Application Toolbar */}
      <SapAppToolbar view={view} onBack={backToList} selected={selected} setStatusMsg={setStatusMsg} />

      {/* ④ Transaction Title */}
      <SapTitleBar
        title={view === 'list'
          ? 'FB03 — Display G/L Account Document: Document List'
          : `FB03 — Display G/L Account Document: ${selected?.journalId}`}
      />

      {/* ⑤ Main Content Area (scrollable) */}
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', background: S.screenBg }}>

        {/* ══ LIST VIEW ══ */}
        {view === 'list' && (
          <DocListView list={filtered} loading={loading} search={search} onSelect={openDoc} />
        )}

        {/* ══ DOCUMENT DETAIL VIEW ══ */}
        {view === 'document' && selected && (
          <>
            {/* Header form */}
            <DocHeaderForm doc={selected} companyId={companyId} />

            {/* Tab strip */}
            <SapTabStrip
              tabs={['Basic Data', 'Additional Data', 'Document Info']}
              active={tab}
              onSelect={setTab}
            />

            {/* Tab content border-top panel */}
            <div style={{ margin: '0 6px', borderLeft: `1px solid ${S.border}`, borderRight: `1px solid ${S.border}`, borderBottom: `1px solid ${S.border}`, background: S.panelBg, padding: '6px 0 0' }}>

              {tab === 'Basic Data' && (
                <>
                  {/* G/L line items section title */}
                  <div style={{ background: S.sectionBg, borderBottom: `1px solid ${S.border}`, borderTop: `1px solid ${S.border}`, padding: '2px 8px', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: S.fsSm, fontFamily: S.font, fontWeight: 'bold', color: S.text }}>G/L Account Line Items</span>
                    <span style={{ fontSize: S.fsSm, fontFamily: S.font, color: S.textMuted }}>({(selected.entries||[]).length} items)</span>
                    <span style={{ marginLeft: 'auto', fontSize: S.fsSm, fontFamily: S.font, fontWeight: 'bold', color: Math.abs(totalDr-totalCr) < 0.01 ? S.success : S.error }}>
                      {Math.abs(totalDr-totalCr) < 0.01 ? '✔ Document Balanced' : `✘ Balance Diff: ${fmt(Math.abs(totalDr-totalCr))}`}
                    </span>
                  </div>
                  <GlLineTable entries={selected.entries || []} />
                </>
              )}

              {tab === 'Additional Data' && (
                <div style={{ padding: '10px 12px' }}>
                  <SapField label="Created By"   value="SYSTEM" />
                  <SapField label="Created On"   value={fmtDate(selected.createdAt)} />
                  <SapField label="Changed On"   value="" />
                  <SapField label="Document Type" value={selected.documentType || 'SA'} />
                  <SapField label="Ref. Doc No." value={selected.referenceId || ''} />
                  <SapField label="Reference"    value={selected.referenceNum || ''} />
                </div>
              )}

              {tab === 'Document Info' && (
                <div style={{ padding: '10px 12px' }}>
                  <table style={{ borderCollapse: 'collapse', fontSize: S.fs, fontFamily: S.font }}>
                    <tbody>
                      {[
                        ['Journal ID',    selected.journalId],
                        ['Document Type', selected.documentType || 'SA'],
                        ['Posting Date',  fmtDate(selected.postingDate)],
                        ['Description',   selected.description || '—'],
                        ['Reference No.', selected.referenceNum || '—'],
                        ['Reference ID',  selected.referenceId || '—'],
                        ['Total Debit',   `INR ${fmt(totalDr)}`],
                        ['Total Credit',  `INR ${fmt(totalCr)}`],
                        ['Balanced',      Math.abs(totalDr-totalCr) < 0.01 ? 'Yes' : 'No'],
                      ].map(([k,v]) => (
                        <tr key={k} style={{ borderBottom: `1px solid ${S.border}` }}>
                          <td style={{ padding: '2px 8px', color: S.textMuted, width: 140, fontWeight: 'bold', borderRight: `1px solid ${S.border}`, background: S.tblHdrBg }}>{k}</td>
                          <td style={{ padding: '2px 8px', color: S.text }}>{v}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* ⑥ Status Bar */}
      <SapStatusBar msg={statusMsg} docCount={list.length} companyId={companyId} />
    </div>
  );
}
