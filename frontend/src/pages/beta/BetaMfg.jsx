/* Beta — Manufacturing: BOM master, Material Issue / Return, Production Planning (MRP), QC Inspection, Production Cost.
 *   <BetaMfg view="bom|issue|mrp|qc|cost" />
 * BOM        per product: raw materials for a batch qty (+ scrap %), labour and overhead per unit → standard cost
 * Issue      issue slip (MI) takes raw material out of stock against a job sheet; return slip (MR) brings unused material back
 * MRP        open jobs (still to issue) + sales-order qty not yet on a job sheet (via BOM) against stock + open stock POs → what to buy
 * QC         inspection of a job's output: inspected = passed + rework + rejected, check points, result
 * Cost       per job: material issued − returned + labour + overhead − scrap sale value; per unit; vs BOM standard and sale value */
import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useCompany } from '../../context/CompanyContext';
import { useAuth } from '../../context/AuthContext';
import { can } from '../../utils/permissions';
import { Svg } from '../../components/ui/Icon';
import { CSS as SALES_CSS, useClearSel } from './BetaSales';
import { PX_CSS } from './BetaPurchaseParts';
import { ACC_CSS, words, hit, Picker, today } from './BetaAccKit';
import { printVoucher, dmy } from './BetaCertPrint';
import { BK_CSS, printReport, excel } from './BetaBooksLib';
import { stOf } from './BetaJobSheet';
import {
  MFG_CSS, useMfg, rawStock, jobPlan, jobCost, mrp, bomNeed, jobOut, jobNeed, jobLabel, mfgQty, q, money, n, r2, r3, OPEN_JOB, LIVE_JOB,
} from './BetaMfgLib';

const TITLES = { bom: ['BOMs', 'Add BOM'], issue: ['Issue / Return slips', 'New slip'], mrp: ['Production Planning (MRP)'], qc: ['QC Inspections', 'New QC report'], cost: ['Production Cost'] };
const PERM = { bom: 'mfgOrders', issue: 'jobSheets', mrp: 'mfgOrders', qc: 'jobSheets', cost: 'mfgOrders' };
const numIn = v => String(v).replace(/[^\d.]/g, '');
const plural = (c, one, many) => `${c} ${c === 1 ? one : many}`;

export default function BetaMfg({ view = 'bom' }) {
  const navigate = useNavigate();
  const { search } = useLocation();
  const sp = new URLSearchParams(search);
  const { selectedCompany } = useCompany() || {};
  const { user } = useAuth() || {};
  const companyId = selectedCompany?.companyId;
  const [reload, setReload] = useState(0);
  const d = useMfg(companyId, reload);
  const [slot, setSlot] = useState(null);
  const [note, setNote] = useState(null);
  const [editing, setEditing] = useState(null);
  const perm = PERM[view];
  const canAdd = can(user, perm, 'create'), canEdit = can(user, perm, 'edit'), canDel = can(user, perm, 'delete');
  const titles = TITLES[view] || TITLES.bom;
  const hasForm = titles.length > 1;
  const cur = editing ? 'create' : sp.get('tab') === 'create' && hasForm && canAdd ? 'create' : 'list';
  const base = `/beta/mfg/${view}`;
  const go = k => { setEditing(null); navigate(`${base}?tab=${k}`); };
  useEffect(() => { setEditing(null); setNote(null); }, [view]);
  if (!can(user, perm, 'view')) return <div className="sb"><style>{SALES_CSS}</style><div className="sb-empty" style={{ padding: 30 }}>You are not authorized to see this page.</div></div>;
  const ctx = { d, slot, company: selectedCompany, user, companyId, canAdd, canEdit, canDel, setNote,
    onEdit: r => { setNote(null); setEditing(r); }, changed: t => { setReload(x => x + 1); if (t) setNote(t); },
    saved: t => { setReload(x => x + 1); setNote(t); go('list'); }, cancel: () => go('list'), edit: editing, jobParam: sp.get('job') || '' };
  const List = { bom: BomList, issue: IssueList, mrp: MrpView, qc: QcList, cost: CostView }[view] || BomList;
  const Form = { bom: BomForm, issue: IssueForm, qc: QcForm }[view];
  const count = d ? { bom: d.boms.length, issue: d.issues.length, qc: d.qc.length }[view] : null;
  return (
    <div className="sb">
      <style>{SALES_CSS + PX_CSS + ACC_CSS + BK_CSS + MFG_CSS}</style>
      <div className="sb-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={cur === 'list'} className={`sb-tab${cur === 'list' ? ' on' : ''}`} onClick={() => go('list')}>{titles[0]}{count != null && <span className="n">{count}</span>}</button>
        {hasForm && (canAdd || editing) && <button type="button" role="tab" aria-selected={cur === 'create'} className={`sb-tab${cur === 'create' ? ' on' : ''}`} onClick={() => go('create')}>{editing ? `Edit ${editing.code || editing.no}` : titles[1]}</button>}
        <div className="sb-slot" ref={setSlot} />
      </div>
      {note && <div className="sb-note" role="status">{note}<button type="button" onClick={() => setNote(null)} aria-label="Dismiss">×</button></div>}
      {!d ? <div className="sb-empty" style={{ padding: 30 }}>Loading…</div>
        : cur === 'create' && Form ? <div className="sb-body"><Form key={editing ? (editing.bomId || editing.issueId || editing.qcId) : `new-${sp.get('kind') || ''}-${sp.get('job') || ''}`} {...ctx} kindParam={sp.get('kind') || ''} /></div>
          : <List {...ctx} />}
    </div>
  );
}

function Tools({ slot, children }) { return slot ? createPortal(children, slot) : null; }
const Ask = ({ text, busy, onNo, onYes, yes = 'Yes, delete' }) => (
  <div className="sb-ask" role="alertdialog" aria-label="Confirm"><span>{text}</span>
    <button type="button" className="sb-abtn" onClick={onNo} disabled={busy}>Keep</button>
    <button type="button" className="sb-abtn danger" onClick={onYes} disabled={busy}>{busy ? 'Working…' : yes}</button></div>
);
async function remove(url, companyId, ok, fail) {
  try { await axios.delete(url, { params: { companyId } }); ok(); } catch (e) { fail(e.response?.data?.error || 'Could not delete.'); }
}

/* ═════════════ BOM ═════════════ */
function bomStd(bom, stock) {
  const per = n(bom.batchQty) || 1;
  const mat = bomNeed(bom, per).reduce((t, m) => t + m.qty * n(stock[m.rmId]?.avg), 0) / per;
  return { mat: r2(mat), unit: r2(mat + n(bom.labourPerUnit) + n(bom.overheadPerUnit)) };
}
function BomList({ d, slot, company, user, companyId, canEdit, canDel, onEdit, changed, setNote }) {
  const [qs, setQ] = useState('');
  const [selId, setSelId] = useState(null);
  const [open, setOpen] = useState(null);
  const [ask, setAsk] = useState(null);
  const [busy, setBusy] = useState(false);
  useClearSel(ask ? null : selId, setSelId, '.bk tbody tr, .sb-tools, .sb-ask');
  const stock = useMemo(() => rawStock(d), [d]);
  const w = words(qs);
  const list = d.boms.filter(b => hit(`${b.code} ${b.itemName} ${b.itemCode} ${b.materials.map(m => m.name).join(' ')}`, w));
  const sel = list.find(b => b.bomId === selId) || null;
  const printBom = b => { const s = bomStd(b, stock); printVoucher({ title: 'BILL OF MATERIALS', sub: 'MATERIAL NEEDED TO MAKE THE PRODUCT', company, user,
    kv: [['BOM No.', b.code], ['Updated', dmy(b.updatedAt)], ['Batch qty', `${q(b.batchQty)} ${b.uom}`], ['Prepared by', b.updatedBy || b.createdBy]],
    party: { label: 'Product', name: b.itemName, lines: [b.itemCode && `Item code: ${b.itemCode}`, b.notes] },
    heads: [['Sl', '28px', 'c'], ['Code', '60px', 'c'], ['Raw material'], [`Qty for ${q(b.batchQty)} ${b.uom}`, '90px', 'r'], ['Unit', '50px', 'c'], ['Scrap %', '55px', 'r'], ['Avg rate', '80px', 'r'], ['Cost', '90px', 'r']],
    rows: bomNeed(b, n(b.batchQty) || 1).map((m, i) => [i + 1, m.code, m.name, q(m.qty), m.unit, m.scrapPct ? q(m.scrapPct) : '', money(stock[m.rmId]?.avg), money(m.qty * n(stock[m.rmId]?.avg))]),
    totals: [['Material cost per unit', money(s.mat)], ['Labour per unit', money(b.labourPerUnit)], ['Overhead per unit', money(b.overheadPerUnit)], ['Standard cost per unit', money(s.unit)]],
    signs: ['Prepared by (Planning)', `For ${company?.companyName || ''}`] }); };
  const rows = list.map(b => { const s = bomStd(b, stock); return [b.code, b.itemName, b.uom, q(b.batchQty), b.materials.length, money(s.mat), money(b.labourPerUnit), money(b.overheadPerUnit), money(s.unit)]; });
  const heads = ['BOM', 'Product', 'Unit', 'Batch', 'Materials', 'Material / unit', 'Labour / unit', 'Overhead / unit', 'Std cost / unit'];
  return (
    <>
      <Tools slot={slot}>
        <input className="sb-search" value={qs} onChange={e => setQ(e.target.value)} placeholder="Search product, BOM no., material…" aria-label="Search BOMs" />
        <div className="sb-tools">
          <span className="sb-picked">{sel ? <b>{sel.code}</b> : 'Select a BOM'}</span>
          <button type="button" className="sb-tbtn" disabled={!sel} onClick={() => printBom(sel)}><Svg name="file" size={13} />Print</button>
          {canEdit && <button type="button" className="sb-tbtn" disabled={!sel} onClick={() => onEdit(sel)}><Svg name="settings" size={13} />Edit</button>}
          {canDel && <button type="button" className="sb-tbtn del" disabled={!sel} onClick={() => setAsk(sel)}><Svg name="x" size={13} />Delete</button>}
          <button type="button" className="sb-tbtn" disabled={!list.length} onClick={() => printReport({ title: 'BOM LIST', company, user, kv: [['BOMs', String(list.length)]], landscape: true,
            heads: heads.map((h, i) => [h, ['8%', '26%', '6%', '6%', '8%', '11%', '11%', '11%', '13%'][i], i > 2 ? 'r' : '']), rows: rows.map(c => ({ c })) })}><Svg name="file" size={13} />Print list</button>
          <button type="button" className="sb-tbtn" disabled={!list.length} onClick={() => excel('BOM', [{ name: 'BOMs', rows: [heads, ...list.map(b => { const s = bomStd(b, stock); return [b.code, b.itemName, b.uom, b.batchQty, b.materials.length, s.mat, b.labourPerUnit, b.overheadPerUnit, s.unit]; })], widths: [9, 34, 7, 7, 9, 13, 13, 13, 14] },
            { name: 'Materials', rows: [['BOM', 'Product', 'Batch qty', 'RM code', 'Raw material', 'Qty', 'Unit', 'Scrap %'], ...list.flatMap(b => b.materials.map(m => [b.code, b.itemName, b.batchQty, m.code, m.name, m.qty, m.unit, m.scrapPct]))], widths: [9, 30, 9, 9, 30, 9, 7, 8] }])}><Svg name="chart" size={13} />Excel</button>
        </div>
      </Tools>
      {ask && <Ask busy={busy} text={<><b>Delete {ask.code}</b> ({ask.itemName})? Old job sheets keep their materials.</>} onNo={() => setAsk(null)}
        onYes={async () => { setBusy(true); await remove(`/api/production/boms/${ask.bomId}`, companyId, () => { setAsk(null); setSelId(null); changed(`Deleted ${ask.code}.`); }, setNote); setBusy(false); }} />}
      {!d.rms.length && <div className="bk-info">No raw material in the master yet — add them in Manufacturing → Raw Material, then build the BOMs from them.</div>}
      <div className="bk-wrap">
        <table className="bk">
          <thead><tr>{heads.map((h, i) => <th key={h} className={i > 2 ? 'r' : ''}>{h}</th>)}</tr></thead>
          <tbody>
            {!list.length && <tr><td colSpan={9} className="sb-empty">{qs ? 'Nothing matches.' : 'No BOM yet — click “Add BOM”.'}</td></tr>}
            {list.map((b, i) => (
              <React.Fragment key={b.bomId}>
                <tr className={`l${selId === b.bomId ? ' sel' : ''}`} onClick={() => { setSelId(b.bomId); setOpen(o => (o === b.bomId ? null : b.bomId)); }} onDoubleClick={() => canEdit && onEdit(b)}>
                  {rows[i].map((c, k) => <td key={k} className={k > 2 ? 'r' : k === 0 ? 'b' : ''} style={k === 1 ? { fontWeight: 700 } : undefined}>{c}</td>)}
                </tr>
                {open === b.bomId && bomNeed(b, n(b.batchQty) || 1).map((m, k) => (
                  <tr key={k} className="sub"><td>{m.code}</td><td style={{ paddingLeft: 22 }}>{m.name}</td><td>{m.unit}</td><td className="r">{q(m.qty)}</td><td className="r">{m.scrapPct ? `${q(m.scrapPct)}% scrap` : ''}</td>
                    <td className="r">{money(m.qty * n(stock[m.rmId]?.avg) / (n(b.batchQty) || 1))}</td><td className="r" colSpan={3}>stock {q(stock[m.rmId]?.closing)} {m.unit} · avg {money(stock[m.rmId]?.avg)}</td></tr>))}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

let lk = 1;
const blankMat = () => ({ k: lk++, rmId: '', qty: '', scrapPct: '' });
function BomForm({ d, companyId, edit, saved, cancel }) {
  const e0 = edit || {};
  const [v, setV] = useState({ itemName: e0.itemName || '', itemCode: e0.itemCode || '', uom: e0.uom || 'NOS', batchQty: e0.batchQty ? String(e0.batchQty) : '1',
    labourPerUnit: e0.labourPerUnit ? String(e0.labourPerUnit) : '', overheadPerUnit: e0.overheadPerUnit ? String(e0.overheadPerUnit) : '', notes: e0.notes || '' });
  const [mats, setMats] = useState(() => ((e0.materials || []).length ? e0.materials.map(m => ({ k: lk++, rmId: String(m.rmId), qty: String(m.qty), scrapPct: m.scrapPct ? String(m.scrapPct) : '' })) : [blankMat(), blankMat()]));
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const stock = useMemo(() => rawStock(d), [d]);
  useEffect(() => { axios.get('/api/items', { params: { companyId } }).then(r => setItems(Array.isArray(r.data) ? r.data : [])).catch(() => setItems([])); }, [companyId]);
  // products: item master + products on sales orders, without the ones that already have a BOM
  const products = useMemo(() => {
    const m = new Map();
    items.forEach(it => it.itemName && m.set(String(it.itemName).trim().toLowerCase(), { name: String(it.itemName).trim(), code: String(it.itemCode || ''), uom: it.uom && it.uom !== 'N/A' ? it.uom : '' }));
    d.orders.forEach(o => (o.items || []).forEach(it => { const nm = String(it.description || it.itemName || '').trim(); if (nm && !m.has(nm.toLowerCase())) m.set(nm.toLowerCase(), { name: nm, code: String(it.itemCode || ''), uom: it.unit || it.uom || '' }); }));
    const taken = new Set(d.boms.filter(b => b.bomId !== e0.bomId).map(b => String(b.itemName).trim().toLowerCase()));
    return [...m.values()].filter(p => !taken.has(p.name.toLowerCase())).sort((a, b) => a.name.localeCompare(b.name));
  }, [items, d, e0.bomId]);
  const set = k => e => { const x = e.target.value; setV(o => ({ ...o, [k]: x })); setMsg(null); };
  const pickName = e => {
    const x = e.target.value, p = products.find(y => y.name.toLowerCase() === x.trim().toLowerCase());
    setV(o => ({ ...o, itemName: x, itemCode: p ? p.code : o.itemCode, uom: p && p.uom ? p.uom : o.uom })); setMsg(null);
  };
  const setM = (k, f, x) => setMats(l => l.map(r => (r.k === k ? { ...r, [f]: x } : r)));
  const batch = n(v.batchQty) || 1;
  const lines = mats.map(m => { const rm = d.rms.find(x => String(x.rmId) === m.rmId), st = rm ? stock[rm.rmId] : null; const qty = n(m.qty) * (1 + n(m.scrapPct) / 100); return { ...m, rm, st, cost: qty * n(st?.avg) }; });
  const matCost = lines.reduce((t, l) => t + l.cost, 0) / batch;
  const unitCost = matCost + n(v.labourPerUnit) + n(v.overheadPerUnit);
  const save = async () => {
    if (!v.itemName.trim()) return setMsg({ k: 'err', t: 'Enter / pick the product.' });
    const good = lines.filter(l => l.rm && n(l.qty) > 0);
    if (!good.length) return setMsg({ k: 'err', t: 'Pick at least one raw material and its qty.' });
    if (lines.some(l => l.rm && !(n(l.qty) > 0))) return setMsg({ k: 'err', t: 'Every picked material needs a qty.' });
    const ids = good.map(l => l.rm.rmId); if (new Set(ids).size !== ids.length) return setMsg({ k: 'err', t: 'A raw material is listed twice — keep it once.' });
    setBusy(true);
    const payload = { companyId, itemName: v.itemName.trim(), itemCode: v.itemCode, uom: v.uom.trim() || 'NOS', batchQty: batch, labourPerUnit: n(v.labourPerUnit), overheadPerUnit: n(v.overheadPerUnit), notes: v.notes.trim(),
      materials: good.map(l => ({ rmId: l.rm.rmId, code: l.rm.code, name: l.rm.name, unit: l.rm.unit, qty: n(l.qty), scrapPct: n(l.scrapPct) })) };
    try {
      const r = edit ? await axios.put(`/api/production/boms/${edit.bomId}`, payload, { params: { companyId } }) : await axios.post('/api/production/boms', payload, { params: { companyId } });
      saved(`${edit ? 'Updated' : 'Added'} ${r.data?.code || ''} for ${payload.itemName} — standard cost ${money(unitCost)} per ${payload.uom}.`);
    } catch (e) { setMsg({ k: 'err', t: e.response?.data?.error || 'Could not save.' }); } finally { setBusy(false); }
  };
  return (
    <div className="sf">
      <div className="sf-hero"><span className="ic"><Svg name="box" size={15} /></span><h1>{edit ? `Edit ${edit.code} · ${edit.itemName}` : 'Add BOM'}</h1><span className="grow" /></div>
      <div className="sf-2" style={{ marginTop: 10 }}>
        <div className="sf-card"><div className="sf-ch"><span className="ico"><Svg name="box" size={13} /></span><b>Product</b></div>
          <table className="sf-kv"><tbody>
            <tr><th>Product <i>*</i></th><td><input list="bom-products" value={v.itemName} onChange={pickName} placeholder="Type or pick from items / sales orders" autoFocus={!edit} autoComplete="off" />
              <datalist id="bom-products">{products.map(p => <option key={p.name} value={p.name}>{p.code ? `#${p.code}` : ''}</option>)}</datalist></td></tr>
            <tr><th>Item code</th><td><input value={v.itemCode} onChange={set('itemCode')} placeholder="Optional" /></td></tr>
            <tr><th>Unit</th><td><input value={v.uom} onChange={set('uom')} placeholder="NOS, SET, KG…" /></td></tr>
            <tr><th>Materials are for</th><td style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input value={v.batchQty} onChange={e => setV(o => ({ ...o, batchQty: numIn(e.target.value) }))} inputMode="decimal" style={{ width: 90 }} aria-label="Batch qty" /><span>{v.uom || 'unit'} of the product</span></td></tr>
            <tr><th>Notes</th><td><input value={v.notes} onChange={set('notes')} placeholder="Drawing no., revision… (optional)" /></td></tr>
          </tbody></table></div>
        <div className="sf-card"><div className="sf-ch"><span className="ico"><Svg name="wallet" size={13} /></span><b>Cost per {v.uom || 'unit'}</b></div>
          <table className="sf-kv"><tbody>
            <tr><th>Material</th><td><b>{money(matCost)}</b> <span style={{ color: '#667085', fontSize: 12 }}>at average stock rate</span></td></tr>
            <tr><th>Labour (₹)</th><td><input value={v.labourPerUnit} onChange={e => setV(o => ({ ...o, labourPerUnit: numIn(e.target.value) }))} inputMode="decimal" placeholder="Labour cost per unit" /></td></tr>
            <tr><th>Overhead (₹)</th><td><input value={v.overheadPerUnit} onChange={e => setV(o => ({ ...o, overheadPerUnit: numIn(e.target.value) }))} inputMode="decimal" placeholder="Power, machine, factory cost per unit" /></td></tr>
            <tr><th>Standard cost</th><td><b style={{ color: '#03444f', fontSize: 14 }}>{money(unitCost)}</b></td></tr>
          </tbody></table></div>
      </div>
      <div className="sf-card"><div className="sf-ch"><span className="ico"><Svg name="box" size={13} /></span><b>Raw materials for {q(batch)} {v.uom || 'unit'}</b><span className="grow" /><button type="button" className="sf-lnk" onClick={() => setMats(l => [...l, blankMat()])}>+ Add material</button></div>
        {!d.rms.length ? <div className="sf-empty">Add raw materials first in Manufacturing → Raw Material.</div> : (
          <table className="ac-lines"><thead><tr><th>Raw material</th><th className="r" style={{ width: 110 }}>Qty</th><th style={{ width: 60 }}>Unit</th><th className="r" style={{ width: 90 }}>Scrap %</th><th className="r" style={{ width: 110 }}>In stock</th><th className="r" style={{ width: 110 }}>Avg rate</th><th className="r" style={{ width: 120 }}>Cost</th><th style={{ width: 34 }} /></tr></thead>
            <tbody>{lines.map(l => (
              <tr key={l.k}><td><select value={l.rmId} onChange={e => setM(l.k, 'rmId', e.target.value)} aria-label="Raw material"><option value="">— pick —</option>{d.rms.map(rm => <option key={rm.rmId} value={String(rm.rmId)}>{rm.code} · {rm.name}</option>)}</select></td>
                <td><input className="num" inputMode="decimal" value={l.qty} onChange={e => setM(l.k, 'qty', numIn(e.target.value))} aria-label="Qty" /></td><td>{l.rm?.unit || ''}</td>
                <td><input className="num" inputMode="decimal" value={l.scrapPct} onChange={e => setM(l.k, 'scrapPct', numIn(e.target.value))} placeholder="0" aria-label="Scrap %" title="Extra issued for cutting / wastage" /></td>
                <td className="r">{l.st ? q(l.st.closing) : ''}</td><td className="r">{l.st ? money(l.st.avg) : ''}</td><td className="r">{l.rm ? money(l.cost) : ''}</td>
                <td><button type="button" className="ac-x" disabled={mats.length <= 1} onClick={() => setMats(x => x.filter(y => y.k !== l.k))} aria-label="Remove">×</button></td></tr>))}</tbody>
            <tfoot><tr><td colSpan={6} className="r">Material for {q(batch)} {v.uom}</td><td className="r">{money(lines.reduce((t, l) => t + l.cost, 0))}</td><td /></tr></tfoot>
          </table>)}
      </div>
      {msg && <div className={`sf-msg ${msg.k}`} role="status">{msg.t}</div>}
      <div className="sf-bar"><div className="info">{edit ? <>BOM <b>{edit.code}</b></> : 'The BOM no. (BOM0001…) is given on save. Job sheets pick the materials from here.'}</div>
        <button type="button" className="sf-b ghost" onClick={cancel} disabled={busy}>Cancel</button>
        <button type="button" className="sf-b pri" onClick={save} disabled={busy}>{busy ? 'Saving…' : edit ? 'Update' : 'Save'}</button></div>
    </div>
  );
}

/* ═════════════ Material issue / return ═════════════ */
const slipValue = s => r2(s.lines.reduce((t, l) => t + l.qty * l.rate, 0));
function printSlip(s, company, user) {
  const ret = s.kind === 'return';
  printVoucher({ title: ret ? 'MATERIAL RETURN SLIP' : 'MATERIAL ISSUE SLIP', sub: ret ? 'UNUSED MATERIAL BACK TO STORE' : 'RAW MATERIAL FROM STORE TO PRODUCTION', company, user,
    kv: [['Slip No.', s.no], ['Date', dmy(s.date)], ['Job No.', s.jobNo], ['Sales order', s.soNumber]],
    party: { label: 'For job', name: s.jobNo, lines: [s.customerName && `Client: ${s.customerName}`, s.issuedTo && `${ret ? 'Returned by' : 'Issued to'}: ${s.issuedTo}`] },
    heads: [['Sl', '28px', 'c'], ['Code', '60px', 'c'], ['Raw material'], ['Qty', '80px', 'r'], ['Unit', '50px', 'c'], ['Rate', '80px', 'r'], ['Value', '95px', 'r']],
    rows: s.lines.map((l, i) => [i + 1, l.code, l.name, q(l.qty), l.unit, money(l.rate), money(l.qty * l.rate)]),
    totals: [['Total', money(slipValue(s))]], narration: s.remarks, signs: [ret ? 'Returned by' : 'Received by (Production)', 'Store-keeper'] });
}
function IssueList({ d, slot, company, user, companyId, canEdit, canDel, onEdit, changed, setNote }) {
  const navigate = useNavigate();
  const [qs, setQ] = useState('');
  const [kind, setKind] = useState('');
  const [selId, setSelId] = useState(null);
  const [ask, setAsk] = useState(null);
  const [busy, setBusy] = useState(false);
  useClearSel(ask ? null : selId, setSelId, '.bk tbody tr, .sb-tools, .sb-ask');
  const w = words(qs);
  const list = d.issues.filter(s => (!kind || s.kind === kind) && hit(`${s.no} ${s.jobNo} ${s.soNumber} ${s.customerName} ${s.issuedTo} ${s.lines.map(l => l.name).join(' ')}`, w));
  const sel = list.find(s => s.issueId === selId) || null;
  const tot = k => r2(d.issues.filter(s => s.kind === k).reduce((t, s) => t + slipValue(s), 0));
  const heads = ['Slip', 'Date', 'Type', 'Job', 'Order · Client', 'Materials', 'Value', 'By'];
  const cells = s => [s.no, dmy(s.date), s.kind === 'return' ? 'Return' : 'Issue', s.jobNo, [s.soNumber, s.customerName].filter(Boolean).join(' · '), s.lines.map(l => `${l.name} × ${q(l.qty)} ${l.unit}`).join(', '), money(slipValue(s)), s.createdBy || ''];
  return (
    <>
      <Tools slot={slot}>
        <input className="sb-search" value={qs} onChange={e => setQ(e.target.value)} placeholder="Search slip, job, order, material…" aria-label="Search slips" />
        <div className="sb-tools">
          <span className="sb-picked">{sel ? <b>{sel.no}</b> : 'Select a slip'}</span>
          {canEdit && <button type="button" className="sb-tbtn" onClick={() => navigate('/beta/mfg/issue?tab=create&kind=return')}><Svg name="arrow" size={13} />Return</button>}
          <button type="button" className="sb-tbtn" disabled={!sel} onClick={() => printSlip(sel, company, user)}><Svg name="file" size={13} />Print</button>
          {canEdit && <button type="button" className="sb-tbtn" disabled={!sel} onClick={() => onEdit(sel)}><Svg name="settings" size={13} />Edit</button>}
          {canDel && <button type="button" className="sb-tbtn del" disabled={!sel} onClick={() => setAsk(sel)}><Svg name="x" size={13} />Delete</button>}
          <button type="button" className="sb-tbtn" disabled={!list.length} onClick={() => printReport({ title: 'MATERIAL ISSUE / RETURN REGISTER', company, user, landscape: true, kv: [['Slips', String(list.length)]],
            heads: heads.map((h, i) => [h, ['7%', '8%', '6%', '9%', '18%', '34%', '10%', '8%'][i], i === 6 ? 'r' : '']), rows: list.map(s => ({ c: cells(s) })) })}><Svg name="file" size={13} />Print list</button>
          <button type="button" className="sb-tbtn" disabled={!list.length} onClick={() => excel('Material_Issue', [{ name: 'Slip lines', rows: [['Slip', 'Date', 'Type', 'Job', 'Sales order', 'Client', 'RM code', 'Raw material', 'Qty', 'Unit', 'Rate', 'Value'],
            ...list.flatMap(s => s.lines.map(l => [s.no, s.date, s.kind, s.jobNo, s.soNumber, s.customerName, l.code, l.name, l.qty, l.unit, l.rate, r2(l.qty * l.rate)]))], widths: [8, 11, 7, 11, 18, 26, 8, 28, 8, 6, 10, 12] }])}><Svg name="chart" size={13} />Excel</button>
        </div>
      </Tools>
      {ask && <Ask busy={busy} text={<><b>Delete {ask.no}</b> ({ask.jobNo})? The stock moves back.</>} onNo={() => setAsk(null)}
        onYes={async () => { setBusy(true); await remove(`/api/production/issues/${ask.issueId}`, companyId, () => { setAsk(null); setSelId(null); changed(`Deleted ${ask.no}.`); }, t => { setAsk(null); setNote(t); }); setBusy(false); }} />}
      <div className="bk-bar">
        <div className="ac-seg">{[['', 'All', d.issues.length], ['issue', 'Issues', d.issues.filter(s => s.kind === 'issue').length], ['return', 'Returns', d.issues.filter(s => s.kind === 'return').length]].map(([k, l, c]) => <button key={k} type="button" className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>{l}<span>{c}</span></button>)}</div>
        <div className="ac-sum"><div>Issued<b>{money(tot('issue'))}</b></div><div>Returned<b>{money(tot('return'))}</b></div><div>Net to production<b>{money(tot('issue') - tot('return'))}</b></div></div>
      </div>
      <div className="bk-wrap">
        <table className="bk"><thead><tr>{heads.map((h, i) => <th key={h} className={i === 6 ? 'r' : ''}>{h}</th>)}</tr></thead>
          <tbody>
            {!list.length && <tr><td colSpan={8} className="sb-empty">{qs || kind ? 'Nothing matches.' : 'No slip yet — click “New slip” to issue material to a job sheet.'}</td></tr>}
            {list.map(s => { const c = cells(s); return (
              <tr key={s.issueId} className={`l${selId === s.issueId ? ' sel' : ''}`} onClick={() => setSelId(s.issueId)} onDoubleClick={() => canEdit && onEdit(s)}>
                <td style={{ fontWeight: 700 }}>{c[0]}</td><td>{c[1]}</td><td><span className="ac-pill" style={s.kind === 'return' ? { background: '#FFFAEB', color: '#B54708' } : { background: '#EFF8FF', color: '#175CD3' }}>{c[2]}</span></td>
                <td style={{ fontWeight: 700 }}>{c[3]}</td><td>{c[4]}</td><td title={c[5]}>{c[5]}</td><td className="r">{c[6]}</td><td>{c[7]}</td></tr>); })}
          </tbody></table>
      </div>
    </>
  );
}

function IssueForm({ d, companyId, edit, saved, cancel, jobParam, kindParam }) {
  const e0 = edit || {};
  const kind = edit ? e0.kind : kindParam === 'return' ? 'return' : 'issue';
  const ret = kind === 'return';
  // the stock and job position without this slip, so an edit can change its own qty
  const dx = useMemo(() => (edit ? { ...d, issues: d.issues.filter(s => s.issueId !== edit.issueId) } : d), [d, edit]);
  const stock = useMemo(() => rawStock(dx), [dx]);
  const okJobs = d.jobs.filter(j => (ret ? LIVE_JOB : ['approved', 'in-progress']).includes(j.status) || String(j.id) === String(e0.jobId));
  const [jobId, setJobId] = useState(e0.jobId ? String(e0.jobId) : (okJobs.some(j => String(j.id) === jobParam) ? jobParam : ''));
  const [date, setDate] = useState(e0.date || today());
  const [issuedTo, setIssuedTo] = useState(e0.issuedTo || '');
  const [remarks, setRemarks] = useState(e0.remarks || '');
  const prefill = id => { const j = d.jobs.find(x => String(x.id) === id); if (!j || ret) return {}; const st = rawStock(dx);
    return Object.fromEntries(jobPlan(j, dx).filter(p => p.rmId && p.toIssue > 0).map(p => [p.rmId, q(Math.min(p.toIssue, Math.max(0, n(st[p.rmId]?.closing))))])); };
  const [qty, setQty] = useState(() => (edit ? Object.fromEntries((e0.lines || []).map(l => [l.rmId, String(l.qty)])) : prefill(jobId)));
  const [extra, setExtra] = useState(() => (e0.lines || []).map(l => l.rmId));
  const [addRm, setAddRm] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const job = d.jobs.find(j => String(j.id) === jobId) || null;
  const plan = useMemo(() => (job ? jobPlan(job, dx) : []), [job, dx]);
  const rows = useMemo(() => {
    if (!job) return [];
    const out = plan.filter(p => p.rmId && (ret ? p.net > 0 : true)).map(p => ({ ...p, rm: d.rms.find(x => x.rmId === p.rmId) }));
    extra.forEach(id => { if (!out.some(r => r.rmId === id)) { const rm = d.rms.find(x => x.rmId === id); if (rm) out.push({ rmId: id, code: rm.code, name: rm.name, unit: rm.unit, need: 0, issued: 0, returned: 0, net: 0, toIssue: 0, value: 0, rm }); } });
    return out.map(r => ({ ...r, st: stock[r.rmId], rate: ret ? (r.net > 0 ? r2(r.value / r.net) : n(stock[r.rmId]?.avg)) : n(stock[r.rmId]?.avg) }));
  }, [job, plan, extra, d.rms, stock, ret]);
  const free = plan.filter(p => !p.rmId && p.need > 0);
  const pickJob = id => {
    setJobId(id); setMsg(null); setExtra([]); setQty(prefill(id));
  };
  const jobGroups = [{ group: ret ? 'Job sheets (material with them)' : 'Approved / in-progress job sheets', items: okJobs.sort((a, b) => (b.id || 0) - (a.id || 0)).map(j => ({ key: String(j.id), label: jobLabel(j), sub: `${stOf(j.status)[1]} · ${jobOut(j).map(i => i.itemName).join(', ')}` })) }];
  const save = async () => {
    if (!job) return setMsg({ k: 'err', t: 'Pick the job sheet.' });
    const lines = rows.filter(r => n(qty[r.rmId]) > 0).map(r => ({ rmId: r.rmId, code: r.code, name: r.name, unit: r.unit, qty: r3(n(qty[r.rmId])), rate: r.rate }));
    if (!lines.length) return setMsg({ k: 'err', t: 'Enter the qty of at least one material.' });
    const over = ret ? lines.find(l => l.qty > n(rows.find(r => r.rmId === l.rmId)?.net) + 0.0005) : lines.find(l => l.qty > n(stock[l.rmId]?.closing) + 0.0005);
    if (over) return setMsg({ k: 'err', t: ret ? `${over.name}: only ${q(rows.find(r => r.rmId === over.rmId)?.net)} ${over.unit} is with this job.` : `${over.name}: only ${q(stock[over.rmId]?.closing)} ${over.unit} in stock.` });
    setBusy(true);
    const payload = { companyId, kind, date, jobId: String(job.id), jobNo: job.jobNo, soNumber: String(job.soNumber || '').trim(), customerName: job.customerName || '', issuedTo: issuedTo.trim(), remarks: remarks.trim(), lines };
    try {
      const r = edit ? await axios.put(`/api/production/issues/${edit.issueId}`, payload, { params: { companyId } }) : await axios.post('/api/production/issues', payload, { params: { companyId } });
      saved(`${edit ? 'Updated' : 'Saved'} ${r.data?.no || ''} — ${plural(lines.length, 'material', 'materials')} ${ret ? 'returned from' : 'issued to'} ${job.jobNo} (${money(lines.reduce((t, l) => t + l.qty * l.rate, 0))}).`);
    } catch (e) { setMsg({ k: 'err', t: e.response?.data?.error || 'Could not save.' }); } finally { setBusy(false); }
  };
  const total = rows.reduce((t, r) => t + n(qty[r.rmId]) * r.rate, 0);
  return (
    <div className="sf">
      <div className="sf-hero"><span className="ic"><Svg name="box" size={15} /></span><h1>{edit ? `Edit ${edit.no}` : ret ? 'Material Return (job → store)' : 'Material Issue (store → job)'}</h1><span className="grow" /></div>
      <div className="sf-card" style={{ marginTop: 10 }}><div className="sf-ch"><span className="ico"><Svg name="file" size={13} /></span><b>Job</b></div>
        <table className="sf-kv"><tbody>
          <tr><th>Job sheet <i>*</i></th><td>{edit ? <b>{jobLabel(job || e0)}</b> : <Picker value={job ? jobLabel(job) : ''} groups={jobGroups} placeholder="Type job no., order or client…" ariaLabel="Job sheet" autoFocus={!jobId} onPick={o => pickJob(o.key)} />}</td>
            <th>Date</th><td><input type="date" value={date} max={today()} onChange={e => setDate(e.target.value)} /></td></tr>
          <tr><th>Product(s)</th><td>{job ? jobOut(job).map(i => `${i.itemName} × ${q(mfgQty(i))} ${i.uom || ''}`).join(', ') : '—'}</td>
            <th>{ret ? 'Returned by' : 'Issued to'}</th><td><input value={issuedTo} onChange={e => setIssuedTo(e.target.value)} placeholder="Name of the person" /></td></tr>
          <tr><th>Remarks</th><td colSpan={3}><input value={remarks} onChange={e => setRemarks(e.target.value)} placeholder="Optional" /></td></tr>
        </tbody></table></div>
      {!okJobs.length && !edit && <div className="sf-msg err">{ret ? 'No job sheet has material with it.' : 'No approved / in-progress job sheet — approve one in Manufacturing → Job Sheet first.'}</div>}
      <div className="sf-card"><div className="sf-ch"><span className="ico"><Svg name="box" size={13} /></span><b>{ret ? 'Material to return' : 'Material to issue'}</b><span className="grow" />
        {job && <><select value={addRm} onChange={e => setAddRm(e.target.value)} aria-label="Add a raw material" style={{ height: 24, fontSize: 12, marginRight: 6, maxWidth: 240 }}><option value="">+ another raw material…</option>{d.rms.filter(rm => !rows.some(r => r.rmId === rm.rmId)).map(rm => <option key={rm.rmId} value={rm.rmId}>{rm.code} · {rm.name}</option>)}</select>
          <button type="button" className="sf-lnk" disabled={!addRm} onClick={() => { setExtra(x => [...x, Number(addRm)]); setAddRm(''); }}>Add</button></>}</div>
        {!job ? <div className="sf-empty">Pick the job sheet — its materials (BOM) come here with what is still to issue.</div> : !rows.length ? <div className="sf-empty">{ret ? 'Nothing is with this job to return.' : 'This job has no material from the raw material master — add one with “+ another raw material”.'}</div> : (
          <table className="ac-lines"><thead><tr><th style={{ width: 70 }}>Code</th><th>Raw material</th><th className="r">Needed</th><th className="r">Issued (net)</th><th className="r">{ret ? 'With job' : 'Still to issue'}</th><th className="r">In stock</th><th className="r" style={{ width: 110 }}>{ret ? 'Return qty' : 'Issue qty'}</th><th style={{ width: 50 }}>Unit</th><th className="r">Rate</th><th className="r">Value</th></tr></thead>
            <tbody>{rows.map(r => { const v = n(qty[r.rmId]), bad = ret ? v > r.net + 0.0005 : v > n(r.st?.closing) + 0.0005; return (
              <tr key={r.rmId}><td>{r.code}</td><td><b>{r.name}</b>{r.st?.low && <span className="mf-bad" style={{ fontSize: 11 }}> · below min</span>}</td><td className="r">{r.need ? q(r.need) : '—'}</td><td className="r">{q(r.net)}</td>
                <td className="r"><b>{q(ret ? r.net : r.toIssue)}</b></td><td className={`r ${n(r.st?.closing) <= 0 ? 'mf-bad' : ''}`}>{q(r.st?.closing)}</td>
                <td><input className="num" inputMode="decimal" value={qty[r.rmId] || ''} onChange={e => setQty(o => ({ ...o, [r.rmId]: numIn(e.target.value) }))} style={bad ? { borderColor: '#B42318', color: '#B42318' } : undefined} aria-label={`Qty ${r.name}`} /></td>
                <td>{r.unit}</td><td className="r">{money(r.rate)}</td><td className="r">{v ? money(v * r.rate) : ''}</td></tr>); })}</tbody>
            <tfoot><tr><td colSpan={9} className="r">Total</td><td className="r">{money(total)}</td></tr></tfoot>
          </table>)}
        {free.length > 0 && <div className="bk-info" style={{ margin: 0 }}>Not in the raw material master, so not issued from stock: {free.map(f => `${f.name} (${q(f.need)} ${f.unit})`).join(', ')}. Add them in Manufacturing → Raw Material to track them.</div>}
      </div>
      {msg && <div className={`sf-msg ${msg.k}`} role="status">{msg.t}</div>}
      <div className="sf-bar"><div className="info">{ret ? 'Returned qty goes back into raw material stock.' : 'Issued qty is taken out of raw material stock and costed to the job.'}{edit ? '' : ' Slip no. (MI0001 / MR0001) is given on save.'}</div>
        <button type="button" className="sf-b ghost" onClick={cancel} disabled={busy}>Cancel</button>
        <button type="button" className="sf-b pri" onClick={save} disabled={busy || !job}>{busy ? 'Saving…' : edit ? 'Update' : ret ? 'Save return' : 'Save issue'}</button></div>
    </div>
  );
}

/* ═════════════ Production planning (MRP) ═════════════ */
function MrpView({ d, slot, company, user }) {
  const navigate = useNavigate();
  const [seg, setSeg] = useState('need');
  const [onlyShort, setOnlyShort] = useState(false);
  const [qs, setQ] = useState('');
  const [open, setOpen] = useState(null);
  const m = useMemo(() => mrp(d), [d]);
  const w = words(qs);
  const rows = m.rows.filter(r => (!onlyShort || r.toBuy > 0) && hit(`${r.code} ${r.name} ${r.src.map(s => `${s.ref} ${s.who}`).join(' ')}`, w));
  const short = m.rows.filter(r => r.toBuy > 0);
  const buyVal = r2(short.reduce((t, r) => t + r.buyValue, 0));
  const H = ['Code', 'Raw material', 'Unit', 'Open jobs', 'Orders not planned', 'Total need', 'In stock', 'On order (PO)', 'Min level', 'Short now', 'To buy', 'Avg rate', 'Buy value'];
  const cells = r => [r.code, r.name, r.unit, q(r.jobs), q(r.orders), q(r.total), q(r.stock), q(r.ordered), r.min ? q(r.min) : '', r.shortNow ? q(r.shortNow) : '', r.toBuy ? q(r.toBuy) : '', money(r.avg), r.toBuy ? money(r.buyValue) : ''];
  const UH = ['Sales order', 'Client', 'Product', 'Pending qty', 'Unit', 'Delivery', 'BOM'];
  const ucells = u => [u.so, u.client, u.item, q(u.qty), u.uom, dmy(u.due), u.bom];
  const FH = ['Material (job BOM text)', 'Unit', 'Needed', 'Jobs'];
  const fcells = f => [f.name, f.unit, q(f.total), f.src.map(s => s.ref).join(', ')];
  const doPrint = () => {
    if (seg === 'need') printReport({ title: 'MATERIAL REQUIREMENT (MRP)', company, user, landscape: true, kv: [['As on', dmy(today())], ['To buy', `${short.length} item(s) · ${money(buyVal)}`]],
      heads: H.map((h, i) => [h, ['6%', '17%', '5%', '7%', '8%', '7%', '7%', '8%', '6%', '7%', '7%', '7%', '8%'][i], i > 2 ? 'r' : '']), rows: rows.map(r => ({ c: cells(r), cls: r.toBuy > 0 ? 'g' : '' })),
      note: 'To buy = total need − in stock − on order (+ minimum level). Open jobs = BOM qty not yet issued; orders not planned = sales-order qty with a BOM but no job sheet yet.' });
    else if (seg === 'orders') printReport({ title: 'ORDERS NOT YET PLANNED', company, user, kv: [['Lines', String(m.unplanned.length)]], heads: UH.map((h, i) => [h, ['15%', '22%', '28%', '9%', '6%', '10%', '10%'][i], i === 3 ? 'r' : '']), rows: m.unplanned.map(u => ({ c: ucells(u) })) });
    else printReport({ title: 'MATERIAL NOT IN THE MASTER', company, user, heads: FH.map((h, i) => [h, ['40%', '10%', '12%', '38%'][i], i === 2 ? 'r' : '']), rows: m.free.map(f => ({ c: fcells(f) })) });
  };
  return (
    <>
      <Tools slot={slot}>
        <input className="sb-search" value={qs} onChange={e => setQ(e.target.value)} placeholder="Search material, job, order…" aria-label="Search" />
        <div className="sb-tools">
          <button type="button" className="sb-tbtn" onClick={doPrint}><Svg name="file" size={13} />Print</button>
          <button type="button" className="sb-tbtn" onClick={() => excel('MRP', [{ name: 'Requirement', rows: [H, ...m.rows.map(r => [r.code, r.name, r.unit, r.jobs, r.orders, r.total, r.stock, r.ordered, r.min, r.shortNow, r.toBuy, r.avg, r.buyValue])], widths: [8, 30, 6, 10, 12, 10, 10, 11, 9, 10, 10, 10, 12] },
            { name: 'Where needed', rows: [['Raw material', 'For', 'Ref', 'Client', 'Due', 'Qty'], ...m.rows.flatMap(r => r.src.map(s => [r.name, s.t === 'jobs' ? 'Job sheet' : 'Sales order', s.ref, s.who, s.due, s.qty]))], widths: [30, 12, 18, 30, 11, 10] },
            { name: 'Orders not planned', rows: [UH, ...m.unplanned.map(u => [u.so, u.client, u.item, u.qty, u.uom, u.due, u.bom])], widths: [18, 30, 34, 10, 7, 11, 9] },
            { name: 'Not in master', rows: [FH, ...m.free.map(fcells)], widths: [36, 8, 10, 40] }])}><Svg name="chart" size={13} />Excel</button>
          {short.length > 0 && <button type="button" className="sb-tbtn" onClick={() => navigate('/beta/po?tab=create')} title="Make a stock PO for the short material"><Svg name="cart" size={13} />Create PO</button>}
        </div>
      </Tools>
      <div className="bk-bar">
        <div className="ac-seg">{[['need', 'Material requirement', m.rows.length], ['orders', 'Orders not planned', m.unplanned.length], ['free', 'Not in master', m.free.length]].map(([k, l, c]) => <button key={k} type="button" className={seg === k ? 'on' : ''} onClick={() => setSeg(k)}>{l}<span>{c}</span></button>)}</div>
        <div className="ac-sum"><div>Open jobs<b>{d.jobs.filter(j => OPEN_JOB.includes(j.status)).length}</b></div><div>Materials to buy<b style={{ color: short.length ? '#B42318' : '#067647' }}>{short.length}</b></div><div>Buy value<b>{money(buyVal)}</b></div></div>
        {seg === 'need' && <label><input type="checkbox" checked={onlyShort} onChange={e => setOnlyShort(e.target.checked)} />Only to buy</label>}
      </div>
      <div className="bk-wrap">
        {seg === 'need' && <table className="bk"><thead><tr>{H.map((h, i) => <th key={h} className={i > 2 ? 'r' : ''}>{h}</th>)}</tr></thead>
          <tbody>
            {!rows.length && <tr><td colSpan={13} className="sb-empty">{m.rows.length ? 'Nothing matches.' : 'Nothing to plan — no open job sheet needs material from the raw material master, and no sales order with a BOM is waiting.'}</td></tr>}
            {rows.map(r => (
              <React.Fragment key={r.rmId}>
                <tr className={`l${open === r.rmId ? ' sel' : ''}`} onClick={() => setOpen(o => (o === r.rmId ? null : r.rmId))}>
                  {cells(r).map((c, i) => <td key={i} className={`${i > 2 ? 'r' : ''} ${i === 10 && r.toBuy > 0 ? 'mf-bad' : ''} ${i === 9 && r.shortNow > 0 ? 'mf-warn' : ''}`} style={i === 1 ? { fontWeight: 700 } : undefined}>{c}{i === 1 && r.onlyMin ? <span className="mut"> · below min level</span> : null}</td>)}
                </tr>
                {open === r.rmId && r.src.map((s, k) => <tr key={k} className="sub"><td /><td style={{ paddingLeft: 22 }} colSpan={2}>{s.t === 'jobs' ? 'Job sheet' : 'Sales order'} <b>{s.ref}</b></td><td colSpan={5}>{s.who}{s.due ? ` · due ${dmy(s.due)}` : ''}</td><td className="r" colSpan={2}>{q(s.qty)} {r.unit}</td><td colSpan={3} /></tr>)}
              </React.Fragment>))}
          </tbody></table>}
        {seg === 'orders' && <table className="bk"><thead><tr>{UH.map((h, i) => <th key={h} className={i === 3 ? 'r' : ''}>{h}</th>)}</tr></thead>
          <tbody>{!m.unplanned.length && <tr><td colSpan={7} className="sb-empty">Every sales-order product with a BOM is on a job sheet.</td></tr>}
            {m.unplanned.filter(u => hit(`${u.so} ${u.client} ${u.item}`, w)).map((u, i) => <tr key={i}>{ucells(u).map((c, k) => <td key={k} className={k === 3 ? 'r' : ''} style={k === 0 || k === 2 ? { fontWeight: 700 } : undefined}>{c}</td>)}</tr>)}</tbody></table>}
        {seg === 'free' && <table className="bk"><thead><tr>{FH.map((h, i) => <th key={h} className={i === 2 ? 'r' : ''}>{h}</th>)}</tr></thead>
          <tbody>{!m.free.length && <tr><td colSpan={4} className="sb-empty">Every job material is in the raw material master.</td></tr>}
            {m.free.filter(f => hit(`${f.name} ${f.src.map(s => s.ref).join(' ')}`, w)).map((f, i) => <tr key={i}>{fcells(f).map((c, k) => <td key={k} className={k === 2 ? 'r' : ''}>{c}</td>)}</tr>)}</tbody></table>}
      </div>
      {seg === 'free' && m.free.length > 0 && <div className="bk-info">These are typed on job sheets but are not in Manufacturing → Raw Material, so their stock is not known. Add them to the master (same name) to plan and issue them.</div>}
    </>
  );
}

/* ═════════════ QC inspection ═════════════ */
const RESULT = { pass: ['Passed', '#ECFDF3', '#067647'], partial: ['Partly passed', '#FFFAEB', '#B54708'], fail: ['Failed', '#FEF3F2', '#B42318'] };
const CHECKS = ['Dimensions as per drawing', 'Visual finish / surface', 'Thickness', 'Colour / shade', 'Leak / load test', 'Fittings & assembly'];
function printQc(r, company, user) {
  printVoucher({ title: 'QC INSPECTION REPORT', sub: 'QUALITY CHECK OF PRODUCTION', company, user,
    kv: [['QC No.', r.no], ['Date', dmy(r.date)], ['Job No.', r.jobNo], ['Result', RESULT[r.result]?.[0]]],
    party: { label: 'Product inspected', name: r.itemName, lines: [[r.soNumber, r.customerName].filter(Boolean).join(' · '), `Inspected ${q(r.inspected)} ${r.uom} — passed ${q(r.passed)}, rework ${q(r.rework)}, rejected ${q(r.rejected)}`] },
    heads: [['Sl', '28px', 'c'], ['Check point'], ['Specification', '170px'], ['Found', '150px'], ['OK?', '60px', 'c']],
    rows: r.params.map((p, i) => [i + 1, p.name, p.spec, p.actual, p.ok == null ? '' : p.ok ? 'OK' : 'NOT OK']), narration: r.remarks,
    signs: [`Inspected by${r.inspector ? `: ${r.inspector}` : ''}`, 'QC in-charge'] });
}
function QcList({ d, slot, company, user, companyId, canEdit, canDel, onEdit, changed, setNote }) {
  const [qs, setQ] = useState('');
  const [res, setRes] = useState('');
  const [selId, setSelId] = useState(null);
  const [ask, setAsk] = useState(null);
  const [busy, setBusy] = useState(false);
  useClearSel(ask ? null : selId, setSelId, '.bk tbody tr, .sb-tools, .sb-ask');
  const w = words(qs);
  const list = d.qc.filter(r => (!res || r.result === res) && hit(`${r.no} ${r.jobNo} ${r.soNumber} ${r.customerName} ${r.itemName} ${r.inspector}`, w));
  const sel = list.find(r => r.qcId === selId) || null;
  const ins = d.qc.reduce((t, r) => t + n(r.inspected), 0), pas = d.qc.reduce((t, r) => t + n(r.passed), 0);
  const H = ['QC No.', 'Date', 'Job', 'Product', 'Inspected', 'Passed', 'Rework', 'Rejected', 'Result', 'Inspector'];
  const cells = r => [r.no, dmy(r.date), r.jobNo, r.itemName, q(r.inspected), q(r.passed), r.rework ? q(r.rework) : '', r.rejected ? q(r.rejected) : '', RESULT[r.result]?.[0] || '', r.inspector || ''];
  return (
    <>
      <Tools slot={slot}>
        <input className="sb-search" value={qs} onChange={e => setQ(e.target.value)} placeholder="Search QC no., job, product…" aria-label="Search QC" />
        <div className="sb-tools">
          <span className="sb-picked">{sel ? <b>{sel.no}</b> : 'Select a report'}</span>
          <button type="button" className="sb-tbtn" disabled={!sel} onClick={() => printQc(sel, company, user)}><Svg name="file" size={13} />Print</button>
          {canEdit && <button type="button" className="sb-tbtn" disabled={!sel} onClick={() => onEdit(sel)}><Svg name="settings" size={13} />Edit</button>}
          {canDel && <button type="button" className="sb-tbtn del" disabled={!sel} onClick={() => setAsk(sel)}><Svg name="x" size={13} />Delete</button>}
          <button type="button" className="sb-tbtn" disabled={!list.length} onClick={() => printReport({ title: 'QC INSPECTION REGISTER', company, user, landscape: true, kv: [['Reports', String(list.length)]],
            heads: H.map((h, i) => [h, ['8%', '8%', '10%', '26%', '8%', '8%', '7%', '7%', '9%', '9%'][i], i >= 4 && i <= 7 ? 'r' : '']), rows: list.map(r => ({ c: cells(r) })) })}><Svg name="file" size={13} />Print list</button>
          <button type="button" className="sb-tbtn" disabled={!list.length} onClick={() => excel('QC', [{ name: 'QC', rows: [[...H, 'Sales order', 'Client', 'Remarks'], ...list.map(r => [r.no, r.date, r.jobNo, r.itemName, r.inspected, r.passed, r.rework, r.rejected, RESULT[r.result]?.[0], r.inspector, r.soNumber, r.customerName, r.remarks])], widths: [8, 11, 11, 30, 9, 9, 8, 8, 12, 14, 18, 28, 30] }])}><Svg name="chart" size={13} />Excel</button>
        </div>
      </Tools>
      {ask && <Ask busy={busy} text={<><b>Delete {ask.no}</b> ({ask.jobNo} · {ask.itemName})?</>} onNo={() => setAsk(null)}
        onYes={async () => { setBusy(true); await remove(`/api/production/qc/${ask.qcId}`, companyId, () => { setAsk(null); setSelId(null); changed(`Deleted ${ask.no}.`); }, setNote); setBusy(false); }} />}
      <div className="bk-bar">
        <div className="ac-seg">{[['', 'All', d.qc.length], ...Object.entries(RESULT).map(([k, v]) => [k, v[0], d.qc.filter(r => r.result === k).length])].map(([k, l, c]) => <button key={k} type="button" className={res === k ? 'on' : ''} onClick={() => setRes(k)}>{l}<span>{c}</span></button>)}</div>
        <div className="ac-sum"><div>Inspected<b>{q(ins)}</b></div><div>Pass rate<b style={{ color: '#067647' }}>{ins ? `${r2(pas / ins * 100)}%` : '—'}</b></div><div>Rejected<b style={{ color: '#B42318' }}>{q(d.qc.reduce((t, r) => t + n(r.rejected), 0))}</b></div><div>Rework<b style={{ color: '#B54708' }}>{q(d.qc.reduce((t, r) => t + n(r.rework), 0))}</b></div></div>
      </div>
      <div className="bk-wrap">
        <table className="bk"><thead><tr>{H.map((h, i) => <th key={h} className={i >= 4 && i <= 7 ? 'r' : ''}>{h}</th>)}</tr></thead>
          <tbody>
            {!list.length && <tr><td colSpan={10} className="sb-empty">{qs || res ? 'Nothing matches.' : 'No QC report yet — click “New QC report”.'}</td></tr>}
            {list.map(r => { const c = cells(r), [, bg, fg] = RESULT[r.result] || []; return (
              <tr key={r.qcId} className={`l${selId === r.qcId ? ' sel' : ''}`} onClick={() => setSelId(r.qcId)} onDoubleClick={() => canEdit && onEdit(r)}>
                {c.map((x, i) => <td key={i} className={i >= 4 && i <= 7 ? 'r' : ''} style={i === 0 || i === 2 ? { fontWeight: 700 } : undefined}>{i === 8 ? <span className="ac-pill" style={{ background: bg, color: fg }}>{x}</span> : x}</td>)}</tr>); })}
          </tbody></table>
      </div>
    </>
  );
}

let pk = 1;
function QcForm({ d, companyId, user, edit, saved, cancel, jobParam }) {
  const e0 = edit || {};
  const okJobs = d.jobs.filter(j => ['approved', 'in-progress', 'completed'].includes(j.status) || String(j.id) === String(e0.jobId));
  const [jobId, setJobId] = useState(e0.jobId ? String(e0.jobId) : (okJobs.some(j => String(j.id) === jobParam) ? jobParam : ''));
  const job = d.jobs.find(j => String(j.id) === jobId) || null;
  const [v, setV] = useState({ date: e0.date || today(), itemName: e0.itemName || '', inspected: e0.inspected ? String(e0.inspected) : '', rework: e0.rework ? String(e0.rework) : '', rejected: e0.rejected ? String(e0.rejected) : '',
    inspector: e0.inspector || user?.name || '', remarks: e0.remarks || '' });
  const [params, setParams] = useState(() => ((e0.params || []).length ? e0.params : CHECKS.slice(0, 4).map(name => ({ name, spec: '', actual: '', ok: null }))).map(p => ({ ...p, k: pk++ })));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const set = k => e => { const x = k === 'inspected' || k === 'rework' || k === 'rejected' ? numIn(e.target.value) : e.target.value; setV(o => ({ ...o, [k]: x })); setMsg(null); };
  const passed = r3(n(v.inspected) - n(v.rework) - n(v.rejected));
  const outs = job ? jobOut(job) : [];
  const item = outs.find(i => i.itemName === v.itemName) || null;
  const doneQc = job ? r3(d.qc.filter(x => String(x.jobId) === String(job.id) && x.qcId !== e0.qcId && x.itemName === v.itemName).reduce((t, x) => t + n(x.inspected), 0)) : 0;
  const pickJob = id => { setJobId(id); setMsg(null); const j = d.jobs.find(x => String(x.id) === id); const o = j ? jobOut(j) : []; setV(x => ({ ...x, itemName: o[0]?.itemName || '' })); };
  const setP = (k, f, x) => setParams(l => l.map(p => (p.k === k ? { ...p, [f]: x } : p)));
  const save = async () => {
    if (!job) return setMsg({ k: 'err', t: 'Pick the job sheet.' });
    if (!(n(v.inspected) > 0)) return setMsg({ k: 'err', t: 'Enter the qty inspected.' });
    if (passed < 0) return setMsg({ k: 'err', t: 'Rework + rejected is more than the qty inspected.' });
    setBusy(true);
    const payload = { companyId, date: v.date, jobId: String(job.id), jobNo: job.jobNo, soNumber: String(job.soNumber || '').trim(), customerName: job.customerName || '', itemName: v.itemName || outs[0]?.itemName || job.itemName || '', uom: item?.uom || job.uom || '',
      inspected: n(v.inspected), passed, rework: n(v.rework), rejected: n(v.rejected), inspector: v.inspector.trim(), remarks: v.remarks.trim(),
      params: params.filter(p => p.name.trim() && (p.spec.trim() || p.actual.trim() || p.ok != null)).map(({ k, ...p }) => ({ ...p, name: p.name.trim() })) };
    try {
      const r = edit ? await axios.put(`/api/production/qc/${edit.qcId}`, payload, { params: { companyId } }) : await axios.post('/api/production/qc', payload, { params: { companyId } });
      saved(`${edit ? 'Updated' : 'Saved'} ${r.data?.no || ''} — ${payload.itemName}: ${q(passed)} of ${q(payload.inspected)} passed (${RESULT[r.data?.result]?.[0] || ''}).`);
    } catch (e) { setMsg({ k: 'err', t: e.response?.data?.error || 'Could not save.' }); } finally { setBusy(false); }
  };
  const jobGroups = [{ group: 'Job sheets', items: okJobs.sort((a, b) => (b.id || 0) - (a.id || 0)).map(j => ({ key: String(j.id), label: jobLabel(j), sub: `${stOf(j.status)[1]} · produced ${q(j.qtyProduced)} / ${q(jobNeed(j))}` })) }];
  return (
    <div className="sf">
      <div className="sf-hero"><span className="ic"><Svg name="check" size={15} /></span><h1>{edit ? `Edit ${edit.no}` : 'New QC report'}</h1><span className="grow" /></div>
      <div className="sf-2" style={{ marginTop: 10 }}>
        <div className="sf-card"><div className="sf-ch"><span className="ico"><Svg name="file" size={13} /></span><b>Job &amp; product</b></div>
          <table className="sf-kv"><tbody>
            <tr><th>Job sheet <i>*</i></th><td>{edit ? <b>{jobLabel(job || e0)}</b> : <Picker value={job ? jobLabel(job) : ''} groups={jobGroups} placeholder="Type job no., order or client…" ariaLabel="Job sheet" autoFocus={!jobId} onPick={o => pickJob(o.key)} />}</td></tr>
            <tr><th>Product</th><td>{outs.length > 1 ? <select value={v.itemName} onChange={set('itemName')}>{outs.map(i => <option key={i.itemName} value={i.itemName}>{i.itemName}</option>)}</select> : <b>{outs[0]?.itemName || v.itemName || '—'}</b>}</td></tr>
            <tr><th>Job qty</th><td>{job ? <>{q(item ? mfgQty(item) : jobNeed(job))} {item?.uom || job.uom || ''} · produced <b>{q(job.qtyProduced)}</b>{doneQc ? ` · already inspected ${q(doneQc)}` : ''}</> : '—'}</td></tr>
            <tr><th>Date</th><td><input type="date" value={v.date} max={today()} onChange={set('date')} /></td></tr>
            <tr><th>Inspector</th><td><input value={v.inspector} onChange={set('inspector')} placeholder="Name" /></td></tr>
          </tbody></table></div>
        <div className="sf-card"><div className="sf-ch"><span className="ico"><Svg name="check" size={13} /></span><b>Result</b></div>
          <table className="sf-kv"><tbody>
            <tr><th>Inspected <i>*</i></th><td><input value={v.inspected} onChange={set('inspected')} inputMode="decimal" placeholder="Qty checked" /></td></tr>
            <tr><th>Rework</th><td><input value={v.rework} onChange={set('rework')} inputMode="decimal" placeholder="Needs correction" /></td></tr>
            <tr><th>Rejected</th><td><input value={v.rejected} onChange={set('rejected')} inputMode="decimal" placeholder="Scrap / not usable" /></td></tr>
            <tr><th>Passed</th><td><b className={passed < 0 ? 'mf-bad' : 'mf-ok'} style={{ fontSize: 14 }}>{q(passed)}</b> <span style={{ color: '#667085', fontSize: 12 }}>= inspected − rework − rejected</span></td></tr>
            <tr><th>Remarks</th><td><input value={v.remarks} onChange={set('remarks')} placeholder="Defects found, action taken…" /></td></tr>
          </tbody></table></div>
      </div>
      <div className="sf-card"><div className="sf-ch"><span className="ico"><Svg name="info" size={13} /></span><b>Check points</b><span className="grow" />
        <select value="" onChange={e => { const x = e.target.value; if (x) setParams(l => [...l, { k: pk++, name: x === '+' ? '' : x, spec: '', actual: '', ok: null }]); }} aria-label="Add a check point" style={{ height: 24, fontSize: 12 }}>
          <option value="">+ Add check point…</option>{CHECKS.filter(c => !params.some(p => p.name === c)).map(c => <option key={c} value={c}>{c}</option>)}<option value="+">Other (type it)</option></select></div>
        <table className="ac-lines"><thead><tr><th>Check point</th><th style={{ width: '24%' }}>Specification</th><th style={{ width: '24%' }}>Found</th><th style={{ width: 150 }}>OK?</th><th style={{ width: 34 }} /></tr></thead>
          <tbody>{params.map(p => (
            <tr key={p.k}><td><input value={p.name} onChange={e => setP(p.k, 'name', e.target.value)} placeholder="Check point" aria-label="Check point" /></td>
              <td><input value={p.spec} onChange={e => setP(p.k, 'spec', e.target.value)} placeholder="e.g. 1200 × 800 ± 2 mm" aria-label="Specification" /></td>
              <td><input value={p.actual} onChange={e => setP(p.k, 'actual', e.target.value)} placeholder="Measured / seen" aria-label="Found" /></td>
              <td><div className="ac-seg" style={{ padding: 0, border: 0 }}>{[[true, 'OK'], [false, 'Not OK']].map(([b, l]) => <button key={l} type="button" className={p.ok === b ? 'on' : ''} style={p.ok === b && !b ? { background: '#B42318', borderColor: '#B42318' } : { padding: '3px 10px' }} onClick={() => setP(p.k, 'ok', p.ok === b ? null : b)}>{l}</button>)}</div></td>
              <td><button type="button" className="ac-x" onClick={() => setParams(l => l.filter(x => x.k !== p.k))} aria-label="Remove">×</button></td></tr>))}</tbody>
        </table></div>
      {msg && <div className={`sf-msg ${msg.k}`} role="status">{msg.t}</div>}
      <div className="sf-bar"><div className="info">Blank check points are left out. QC no. (QC0001…) is given on save.</div>
        <button type="button" className="sf-b ghost" onClick={cancel} disabled={busy}>Cancel</button>
        <button type="button" className="sf-b pri" onClick={save} disabled={busy || !job}>{busy ? 'Saving…' : edit ? 'Update' : 'Save'}</button></div>
    </div>
  );
}

/* ═════════════ Production cost ═════════════ */
function CostView({ d, slot, company, user, companyId, canEdit, changed }) {
  const [st, setSt] = useState('');
  const [qs, setQ] = useState('');
  const [openId, setOpenId] = useState(null);
  const w = words(qs);
  const all = useMemo(() => d.jobs.filter(j => LIVE_JOB.includes(j.status)).map(j => ({ j, c: jobCost(j, d) })).sort((a, b) => (b.j.id || 0) - (a.j.id || 0)), [d]);
  const list = all.filter(({ j }) => (!st || (st === 'open' ? OPEN_JOB.includes(j.status) : j.status === st)) && hit(`${j.jobNo} ${j.soNumber} ${j.customerName} ${jobOut(j).map(i => i.itemName).join(' ')}`, w));
  const sum = k => r2(list.reduce((t, x) => t + n(x.c[k]), 0));
  const H = ['Job', 'Order · Client', 'Product', 'Qty (made / plan)', 'Material', 'Labour', 'Overhead', 'Scrap (−)', 'Total cost', 'Cost / unit', 'BOM std', 'Sale value', 'Margin', '%'];
  const cells = ({ j, c }) => [j.jobNo, [String(j.soNumber || '').trim(), j.customerName].filter(Boolean).join(' · '), jobOut(j).map(i => i.itemName).join(', '), `${q(c.produced)} / ${q(c.planned)}`,
    money(c.material), money(c.labour), money(c.overhead), c.scrapValue ? money(c.scrapValue) : '', money(c.total), money(c.perUnit), c.std == null ? '' : money(c.std), money(c.sale), money(c.margin), c.sale ? `${c.marginPct}%` : ''];
  const open = all.find(x => String(x.j.id) === String(openId)) || null;
  if (open) return <JobCostSheet x={open} d={d} slot={slot} company={company} user={user} companyId={companyId} canEdit={canEdit} back={() => setOpenId(null)} changed={changed} />;
  return (
    <>
      <Tools slot={slot}>
        <input className="sb-search" value={qs} onChange={e => setQ(e.target.value)} placeholder="Search job, order, client, product…" aria-label="Search jobs" />
        <select className="sb-search" style={{ width: 120 }} value={st} onChange={e => setSt(e.target.value)} aria-label="Status"><option value="">All jobs</option><option value="open">Open</option><option value="completed">Completed</option></select>
        <div className="sb-tools">
          <button type="button" className="sb-tbtn" disabled={!list.length} onClick={() => printReport({ title: 'PRODUCTION COST — JOB-WISE', company, user, landscape: true, kv: [['Jobs', String(list.length)]],
            heads: H.map((h, i) => [h, ['7%', '13%', '13%', '6%', '7%', '6%', '6%', '6%', '7%', '7%', '6%', '7%', '7%', '4%'][i], i >= 3 ? 'r' : '']),
            rows: [...list.map(x => ({ c: cells(x) })), { cls: 'tot', c: ['Total', '', '', '', money(sum('material')), money(sum('labour')), money(sum('overhead')), money(sum('scrapValue')), money(sum('total')), '', '', money(sum('sale')), money(sum('margin')), ''] }],
            note: 'Material = issue slips − return slips at slip rate. Scrap = sale value of scrap. Sale value = sales-order rate × qty made (planned qty until production is entered).' })}><Svg name="file" size={13} />Print</button>
          <button type="button" className="sb-tbtn" disabled={!list.length} onClick={() => excel('Production_Cost', [{ name: 'Job cost', rows: [H, ...list.map(({ j, c }) => [j.jobNo, `${String(j.soNumber || '').trim()} ${j.customerName || ''}`.trim(), jobOut(j).map(i => i.itemName).join(', '), `${c.produced} / ${c.planned}`, c.material, c.labour, c.overhead, c.scrapValue, c.total, c.perUnit, c.std ?? '', c.sale, c.margin, c.marginPct])], widths: [11, 30, 30, 12, 12, 11, 11, 10, 13, 12, 12, 13, 13, 7] }])}><Svg name="chart" size={13} />Excel</button>
        </div>
      </Tools>
      <div className="ac-sum"><div>Jobs<b>{list.length}</b></div><div>Material used<b>{money(sum('material'))}</b></div><div>Labour + overhead<b>{money(sum('labour') + sum('overhead'))}</b></div><div>Total cost<b>{money(sum('total'))}</b></div><div>Sale value<b>{money(sum('sale'))}</b></div><div>Margin<b style={{ color: sum('margin') < 0 ? '#B42318' : '#067647' }}>{money(sum('margin'))}</b></div></div>
      <div className="bk-wrap">
        <table className="bk"><thead><tr>{H.map((h, i) => <th key={h} className={i >= 3 ? 'r' : ''}>{h}</th>)}</tr></thead>
          <tbody>
            {!list.length && <tr><td colSpan={14} className="sb-empty">{qs || st ? 'Nothing matches.' : 'No job sheet yet — the cost of each job shows here once material is issued.'}</td></tr>}
            {list.map(x => <tr key={x.j.id} className="l" onClick={() => setOpenId(x.j.id)} title="Open the cost sheet">{cells(x).map((c, i) => <td key={i} className={`${i >= 3 ? 'r' : ''}${i === 12 && x.c.margin < 0 ? ' neg' : ''}`} style={i === 0 || i === 8 ? { fontWeight: 700 } : undefined}>{c}</td>)}</tr>)}
          </tbody>
          {list.length > 0 && <tfoot><tr><td colSpan={4}>Total</td><td className="r">{money(sum('material'))}</td><td className="r">{money(sum('labour'))}</td><td className="r">{money(sum('overhead'))}</td><td className="r">{money(sum('scrapValue'))}</td><td className="r">{money(sum('total'))}</td><td /><td /><td className="r">{money(sum('sale'))}</td><td className="r">{money(sum('margin'))}</td><td /></tr></tfoot>}
        </table>
      </div>
    </>
  );
}

let ck = 1;
const moneyRows = l => ((l || []).length ? l : [{ desc: '', amount: '' }]).map(x => ({ k: ck++, desc: x.desc || '', amount: x.amount ? String(x.amount) : '' }));
function JobCostSheet({ x: { j, c }, d, slot, company, user, companyId, canEdit, back, changed }) {
  const [labour, setLabour] = useState(() => moneyRows(c.jc.labour));
  const [overhead, setOverhead] = useState(() => moneyRows(c.jc.overhead));
  const [scrap, setScrap] = useState(() => ((c.jc.scrap || []).length ? c.jc.scrap : [{}]).map(s => ({ k: ck++, rmId: s.rmId ? String(s.rmId) : '', qty: s.qty ? String(s.qty) : '', value: s.value ? String(s.value) : '' })));
  const [remarks, setRemarks] = useState(c.jc.remarks || '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const tot = l => l.reduce((t, r) => t + n(r.amount), 0);
  const scrapVal = scrap.reduce((t, r) => t + n(r.value), 0);
  const total = r2(c.material + tot(labour) + tot(overhead) - scrapVal);
  const base = c.produced || c.planned;
  const save = async () => {
    setBusy(true); setMsg(null);
    const rmOf = id => d.rms.find(r => String(r.rmId) === id);
    try {
      await axios.put(`/api/production/jobcost/${j.id}`, { companyId, jobNo: j.jobNo, remarks,
        labour: labour.map(({ desc, amount }) => ({ desc, amount: n(amount) })), overhead: overhead.map(({ desc, amount }) => ({ desc, amount: n(amount) })),
        scrap: scrap.filter(s => s.rmId).map(s => { const rm = rmOf(s.rmId); return { rmId: rm?.rmId, name: rm?.name, unit: rm?.unit, qty: n(s.qty), value: n(s.value) }; }) }, { params: { companyId } });
      changed(`Saved the cost of ${j.jobNo} — total ${money(total)}.`);
    } catch (e) { setMsg({ k: 'err', t: e.response?.data?.error || 'Could not save.' }); } finally { setBusy(false); }
  };
  const doPrint = () => printVoucher({ title: 'JOB COST SHEET', sub: 'PRODUCTION COST OF THE JOB', company, user,
    kv: [['Job No.', j.jobNo], ['Sales order', String(j.soNumber || '').trim()], ['Status', stOf(j.status)[1]], ['Qty made / planned', `${q(c.produced)} / ${q(c.planned)}`]],
    party: { label: 'Client · product', name: j.customerName || 'Stock job', lines: [jobOut(j).map(i => `${i.itemName} × ${q(mfgQty(i))} ${i.uom || ''}`).join(', '), c.passed || c.rejected ? `QC: passed ${q(c.passed)}, rework ${q(c.rework)}, rejected ${q(c.rejected)}` : ''] },
    heads: [['Sl', '28px', 'c'], ['Cost head'], ['Qty', '90px', 'r'], ['Amount', '110px', 'r']],
    rows: [...c.plan.filter(p => p.issued || p.returned).map((p, i) => [i + 1, `Material: ${p.name}`, `${q(p.net)} ${p.unit}`, money(p.value)]),
      ...labour.filter(l => n(l.amount)).map(l => ['', `Labour: ${l.desc || 'Labour'}`, '', money(l.amount)]),
      ...overhead.filter(l => n(l.amount)).map(l => ['', `Overhead: ${l.desc || 'Overhead'}`, '', money(l.amount)]),
      ...scrap.filter(s => s.rmId && n(s.value)).map(s => ['', `Less scrap sold: ${d.rms.find(r => String(r.rmId) === s.rmId)?.name || ''}`, s.qty ? q(s.qty) : '', `− ${money(s.value)}`])],
    totals: [['Total production cost', money(total)], [`Cost per unit (${q(base)})`, money(base ? total / base : 0)], ['Sale value', money(c.sale)], ['Margin', money(c.sale - total)]],
    narration: remarks, signs: ['Prepared by (Accounts)', 'Production manager'] });
  const moneyTable = (title, l, setL, ph) => (
    <div className="sf-card"><div className="sf-ch"><span className="ico"><Svg name="wallet" size={13} /></span><b>{title}</b><span className="grow" />{canEdit && <button type="button" className="sf-lnk" onClick={() => setL(x => [...x, { k: ck++, desc: '', amount: '' }])}>+ Add</button>}</div>
      <table className="ac-lines"><tbody>{l.map(r => (
        <tr key={r.k}><td><input value={r.desc} disabled={!canEdit} onChange={e => setL(x => x.map(y => (y.k === r.k ? { ...y, desc: e.target.value } : y)))} placeholder={ph} aria-label={`${title} description`} /></td>
          <td style={{ width: 140 }}><input className="num" inputMode="decimal" disabled={!canEdit} value={r.amount} onChange={e => setL(x => x.map(y => (y.k === r.k ? { ...y, amount: numIn(e.target.value) } : y)))} placeholder="₹" aria-label={`${title} amount`} /></td>
          <td style={{ width: 34 }}>{canEdit && <button type="button" className="ac-x" disabled={l.length <= 1} onClick={() => setL(x => x.filter(y => y.k !== r.k))} aria-label="Remove">×</button>}</td></tr>))}</tbody>
        <tfoot><tr><td className="r">Total</td><td className="r">{money(tot(l))}</td><td /></tr></tfoot></table></div>);
  return (
    <>
      <Tools slot={slot}><div className="sb-tools">
        <button type="button" className="sb-tbtn" onClick={back}><Svg name="arrow" size={13} />All jobs</button>
        <button type="button" className="sb-tbtn" onClick={doPrint}><Svg name="file" size={13} />Print</button>
      </div></Tools>
      <div className="sb-body"><div className="sf">
        <div className="sf-hero"><span className="ic"><Svg name="wallet" size={15} /></span><h1>Cost of {j.jobNo} · {jobOut(j).map(i => i.itemName).join(', ')}</h1><span className="grow" /><span className="ac-pill" style={{ background: stOf(j.status)[2], color: stOf(j.status)[3] }}>{stOf(j.status)[1]}</span></div>
        <div className="mf-kv" style={{ marginTop: 10 }}>
          <div>Material (net issued)<b>{money(c.material)}</b></div><div>Labour + overhead<b>{money(tot(labour) + tot(overhead))}</b></div><div>Scrap sold (−)<b>{money(scrapVal)}</b></div><div>Total cost<b style={{ color: '#03444f' }}>{money(total)}</b></div>
          <div>Qty made / planned<b>{q(c.produced)} / {q(c.planned)}</b></div><div>Cost per unit<b>{money(base ? total / base : 0)}</b></div><div>BOM standard<b>{c.std == null ? 'No BOM' : money(c.std)}</b></div>
          <div>Sale value · margin<b className={c.sale - total < 0 ? 'mf-bad' : 'mf-ok'}>{money(c.sale)} · {money(c.sale - total)}</b></div>
        </div>
        <div className="sf-card"><div className="sf-ch"><span className="ico"><Svg name="box" size={13} /></span><b>Material</b><span className="grow" /><span style={{ fontSize: 12, color: '#fff' }}>from issue / return slips</span></div>
          {!c.plan.length ? <div className="sf-empty">No material on this job.</div> : (
            <table className="ac-lines"><thead><tr><th>Material</th><th className="r">Needed</th><th className="r">Issued</th><th className="r">Returned</th><th className="r">Used (net)</th><th className="r">Variance</th><th>Unit</th><th className="r">Value</th></tr></thead>
              <tbody>{c.plan.map((p, i) => { const vr = r3(p.net - p.need); return (
                <tr key={i}><td><b>{p.name}</b>{!p.rmId && <span className="mut"> · not in master</span>}</td><td className="r">{q(p.need)}</td><td className="r">{q(p.issued)}</td><td className="r">{q(p.returned)}</td><td className="r"><b>{q(p.net)}</b></td>
                  <td className={`r ${vr > 0 ? 'mf-bad' : vr < 0 ? 'mf-warn' : ''}`} title={vr > 0 ? 'More used than the job BOM' : vr < 0 ? 'Less issued than the job BOM so far' : ''}>{vr ? (vr > 0 ? `+${q(vr)}` : q(vr)) : '—'}</td><td>{p.unit}</td><td className="r">{money(p.value)}</td></tr>); })}</tbody>
              <tfoot><tr><td colSpan={7} className="r">Material cost</td><td className="r">{money(c.material)}</td></tr></tfoot></table>)}
        </div>
        <div className="sf-2">{moneyTable('Labour', labour, setLabour, 'e.g. Fabrication — 3 men × 4 days')}{moneyTable('Overhead', overhead, setOverhead, 'e.g. Power, machine hire, transport')}</div>
        <div className="sf-card"><div className="sf-ch"><span className="ico"><Svg name="box" size={13} /></span><b>Scrap</b><span className="grow" />{canEdit && <button type="button" className="sf-lnk" onClick={() => setScrap(x => [...x, { k: ck++, rmId: '', qty: '', value: '' }])}>+ Add</button>}</div>
          <table className="ac-lines"><thead><tr><th>Material scrapped</th><th className="r" style={{ width: 120 }}>Scrap qty</th><th style={{ width: 60 }}>Unit</th><th className="r" style={{ width: 140 }}>Sale value (₹)</th><th style={{ width: 34 }} /></tr></thead>
            <tbody>{scrap.map(s => { const rm = d.rms.find(r => String(r.rmId) === s.rmId); return (
              <tr key={s.k}><td><select value={s.rmId} disabled={!canEdit} onChange={e => setScrap(x => x.map(y => (y.k === s.k ? { ...y, rmId: e.target.value } : y)))} aria-label="Scrap material"><option value="">— none —</option>{c.plan.filter(p => p.rmId).map(p => <option key={p.rmId} value={String(p.rmId)}>{p.name}</option>)}</select></td>
                <td><input className="num" inputMode="decimal" disabled={!canEdit} value={s.qty} onChange={e => setScrap(x => x.map(y => (y.k === s.k ? { ...y, qty: numIn(e.target.value) } : y)))} aria-label="Scrap qty" /></td><td>{rm?.unit || ''}</td>
                <td><input className="num" inputMode="decimal" disabled={!canEdit} value={s.value} onChange={e => setScrap(x => x.map(y => (y.k === s.k ? { ...y, value: numIn(e.target.value) } : y)))} placeholder="0 if thrown away" aria-label="Scrap value" /></td>
                <td>{canEdit && <button type="button" className="ac-x" disabled={scrap.length <= 1} onClick={() => setScrap(x => x.filter(y => y.k !== s.k))} aria-label="Remove">×</button>}</td></tr>); })}</tbody></table>
          <div style={{ padding: 8 }}><input value={remarks} disabled={!canEdit} onChange={e => setRemarks(e.target.value)} placeholder="Remarks (optional)" style={{ width: '100%', height: 30, border: '1px solid #C9D7DA', borderRadius: 4, padding: '0 8px', boxSizing: 'border-box' }} aria-label="Remarks" /></div>
        </div>
        {msg && <div className={`sf-msg ${msg.k}`} role="status">{msg.t}</div>}
        <div className="sf-bar"><div className="info">Scrap qty is already inside “issued”; its sale value is taken off the cost.</div>
          <button type="button" className="sf-b ghost" onClick={back} disabled={busy}>Back</button>
          {canEdit && <button type="button" className="sf-b pri" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save cost'}</button>}</div>
      </div></div>
    </>
  );
}
