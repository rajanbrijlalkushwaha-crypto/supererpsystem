/* Purchase side shared UI: the PO picker pop-up (search · keyboard) and a little extra CSS. */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { num, fdate, dash } from './BetaSalesBill';

export const PX_CSS = `
.px-tag { display:inline-block; padding:1px 7px; border-radius:99px; font-size:10.5px; font-weight:700; white-space:nowrap; }
.px-tag.bp { background:#FFFAEB; color:#B54708; } .px-tag.mp { background:#EEF4FF; color:#3538CD; } .px-tag.ok { background:#ECFDF3; color:#067647; }
.px-tag.no { background:#F2F4F7; color:#475467; } .px-tag.dc { background:#F0F7F7; color:#03444f; border:1px solid #B9D0D3; }
.px-st { display:inline-grid; place-items:center; width:20px; height:20px; border-radius:50%; color:#fff; font-size:10.5px; font-weight:800; }
.sb-t.px th { white-space:normal; overflow:visible; text-overflow:clip; line-height:1.2; text-align:center; vertical-align:middle; }
.sb-t.px th:last-child { border-right:none; }
.sb-t.px td.no { white-space:normal; overflow-wrap:anywhere; }
/* deleted rows: at the end, red with a line through (the tag cell stays readable) */
.sb-t tbody.gone td { background:#FFF6F5 !important; color:#B42318 !important; }
.sb-t tbody.gone td:not(.keep) { text-decoration:line-through; text-decoration-color:#D92D20; }
.sb-t tbody.gone td.keep { text-decoration:none; }
.px-tag.del { background:#FEE4E2; color:#B42318; border:1px solid #FDA29B; }
.px-sel { height:auto; border:0; border-right:1px solid #B9D0D3; padding:0 10px; background:#fff; font:600 12px 'Inter', sans-serif; color:#03444f; cursor:pointer; outline:none; }
.px-rad { display:flex; gap:8px; flex-wrap:wrap; }
.px-rad label { display:flex; align-items:flex-start; gap:8px; padding:7px 10px; border:1px solid #C9D7DA; border-radius:4px; cursor:pointer; background:#fff; flex:1; min-width:200px; }
.px-rad label.on { border-color:#03444f; background:#F0F7F7; }
.sf .px-rad input { width:auto; height:auto; margin-top:2px; flex-shrink:0; accent-color:#03444f; box-shadow:none; }
.px-rad b { display:block; font-size:12.5px; color:#101828; } .px-rad small { font-size:11px; color:#667085; }
.px-file { display:flex; align-items:center; gap:8px; }
.px-file .fn { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:12px; color:#344054; }
.px-file .fn.mut { color:#98A2B3; }
.px-up { flex-shrink:0; height:30px; padding:0 12px; border:1px solid #03444f; border-radius:2px; background:#fff; color:#03444f; cursor:pointer; font:600 12px 'Inter', sans-serif; }
.px-up:hover:not(:disabled) { background:#03444f; color:#fff; }
.px-from { width:100%; height:28px; font-size:11.5px; }
.px-from.vd { background:#FFFAEB !important; border-color:#F79009 !important; color:#93370D; font-weight:600; }
.px-hint { font-size:11px; color:#667085; }
.px-split { margin-top:5px; border:1px solid #E4E7EC; border-radius:6px; overflow:hidden; }
.px-sr { display:flex; align-items:center; gap:8px; padding:4px 8px; border-bottom:1px solid #EEF2F3; background:#fff; }
.px-sr:last-of-type { border-bottom:0; }
.px-sr.on { background:#FFFAEB; }
.px-sr .nm { flex:1; min-width:0; font-size:12px; font-weight:600; color:#344054; } .px-sr .nm small { font-weight:500; color:#667085; }
.px-sr .sf-q { width:80px !important; height:26px; flex-shrink:0; }
.px-split .px-hint { padding:4px 8px; background:#F9FAFB; }
`;

/* rows: [{ po, so, left, leftLabel }] — left = qty still to bill / receive */
export function POPicker({ rows, title, leftLabel, onPick, onClose }) {
  const [q, setQ] = useState('');
  const [all, setAll] = useState(false);
  const [sel, setSel] = useState(0);
  const inRef = useRef(null), listRef = useRef(null);
  useEffect(() => { inRef.current?.focus(); }, []);
  const list = useMemo(() => {
    const w = q.toLowerCase().split(/\s+/).filter(Boolean);
    return rows.filter(r => (all || r.left > 0) && (!w.length || w.every(x => `${r.po.poNo || ''} ${r.po.orderId} ${r.po.vendorName || ''} ${r.so?.orderNo || ''} ${r.so?.customerName || ''} ${(r.po.items || []).map(i => i && (i.itemName || i.description)).join(' ')}`.toLowerCase().includes(x)))).slice(0, 300);
  }, [rows, q, all]);
  useEffect(() => setSel(0), [q, all]);
  useEffect(() => { listRef.current?.querySelector('tr.sel')?.scrollIntoView({ block: 'nearest' }); }, [sel]);
  const key = e => {
    if (e.key === 'Escape') onClose();
    else if (e.key === 'ArrowDown') { e.preventDefault(); setSel(s => Math.min(s + 1, list.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel(s => Math.max(s - 1, 0)); }
    else if (e.key === 'Enter' && list[sel]) { e.preventDefault(); onPick(list[sel]); }
  };
  return (
    <div className="sf-pkb" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sf-pk" role="dialog" aria-modal="true" aria-label={title} onKeyDown={key} style={{ maxWidth: 1100 }}>
        <div className="sf-pkh"><b>{title}</b><span className="grow" /><small>{list.length} found</small><button type="button" onClick={onClose} aria-label="Close">×</button></div>
        <div className="sf-pks">
          <input type="text" ref={inRef} value={q} onChange={e => setQ(e.target.value)} placeholder="Search PO no., vendor, order, client, product…" aria-label="Search purchase orders" />
          <label><input type="checkbox" checked={all} onChange={e => setAll(e.target.checked)} />Include completed</label>
        </div>
        <div className="sf-pkl" ref={listRef}>
          <table className="sf-t">
            <thead><tr><th>PO No.</th><th>PO Date</th><th>Vendor</th><th>Order No.</th><th>Client</th><th>Products</th><th className="r">PO Qty</th><th className="r">{leftLabel}</th></tr></thead>
            <tbody>{list.length ? list.map((r, i) => (
              <tr key={r.po.orderId} className={i === sel ? 'sel' : ''} onMouseEnter={() => setSel(i)} onClick={() => onPick(r)}>
                <td className="sf-no">{r.po.poNo || r.po.orderId}</td><td>{fdate(r.po.poDate)}</td><td>{dash(r.po.vendorName)}</td>
                <td>{dash(r.so?.orderNo)}</td><td>{dash(r.so?.customerName)}</td>
                <td>{(r.po.items || []).filter(it => it && (it.itemName || it.description)).map(it => it.itemName || it.description).join('; ')}</td>
                <td className="r">{num(r.qty)}</td>
                <td className="r" style={{ fontWeight: 700, color: r.left > 0 ? '#B54708' : '#067647' }}>{r.left > 0 ? num(r.left) : '✓'}</td>
              </tr>
            )) : <tr><td colSpan={8} className="sf-empty">{q ? `Nothing matches “${q}”.` : 'Nothing pending.'}</td></tr>}</tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* a simple pick-one pop-up: rows [{ key, search, cells:[], dim }] · cols [[label, 'r'|'c'?]] — search · arrows · Enter */
export function ListPicker({ title, placeholder, cols, rows, onPick, onClose }) {
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const inRef = useRef(null), listRef = useRef(null);
  useEffect(() => { inRef.current?.focus(); }, []);
  const list = useMemo(() => {
    const w = q.toLowerCase().split(/\s+/).filter(Boolean);
    return rows.filter(r => !w.length || w.every(x => String(r.search || '').toLowerCase().includes(x))).slice(0, 300);
  }, [rows, q]);
  useEffect(() => setSel(0), [q]);
  useEffect(() => { listRef.current?.querySelector('tr.sel')?.scrollIntoView({ block: 'nearest' }); }, [sel]);
  const key = e => {
    if (e.key === 'Escape') onClose();
    else if (e.key === 'ArrowDown') { e.preventDefault(); setSel(s => Math.min(s + 1, list.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel(s => Math.max(s - 1, 0)); }
    else if (e.key === 'Enter' && list[sel]) { e.preventDefault(); onPick(list[sel].key); }
  };
  return (
    <div className="sf-pkb" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sf-pk" role="dialog" aria-modal="true" aria-label={title} onKeyDown={key} style={{ maxWidth: 980 }}>
        <div className="sf-pkh"><b>{title}</b><span className="grow" /><small>{list.length} found</small><button type="button" onClick={onClose} aria-label="Close">×</button></div>
        <div className="sf-pks"><input type="text" ref={inRef} value={q} onChange={e => setQ(e.target.value)} placeholder={placeholder} aria-label="Search" /></div>
        <div className="sf-pkl" ref={listRef}>
          <table className="sf-t">
            <thead><tr>{cols.map(([h, a]) => <th key={h} className={a || ''}>{h}</th>)}</tr></thead>
            <tbody>{list.length ? list.map((r, i) => (
              <tr key={r.key} className={`${i === sel ? 'sel' : ''}${r.dim ? ' off' : ''}`} onMouseEnter={() => setSel(i)} onClick={() => onPick(r.key)}>
                {r.cells.map((c, j) => <td key={j} className={cols[j]?.[1] || ''}>{c}</td>)}
              </tr>
            )) : <tr><td colSpan={cols.length} className="sf-empty">{q ? `Nothing matches “${q}”.` : 'Nothing here.'}</td></tr>}</tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
