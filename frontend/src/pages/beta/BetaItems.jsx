/* Beta — Stock Items (Stock → Stock Items): the item / product master (/api/items, code 9000001 …).
 * List with search, Edit and Delete; the form adds or edits one item: type, name, unit, HSN.
 * These items are offered on Sales Orders, POs and the rest of the documents. */
import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useCompany } from '../../context/CompanyContext';
import { useAuth } from '../../context/AuthContext';
import { can } from '../../utils/permissions';
import { Svg } from '../../components/ui/Icon';
import { CSS as SALES_CSS, useClearSel } from './BetaSales';
import { key } from './BetaPurchaseLib';
import { PX_CSS } from './BetaPurchaseParts';

const TYPES = ['Ready Product', 'Raw Material', 'Service'];
const UNITS = ['NOS', 'Kg', 'Ltr', 'Mtr', 'Box', 'Pcs', 'Set', 'Sqft', 'MT', 'Ton', 'Pair', 'Roll', 'Job', 'Month', 'Year', 'Hour', 'N/A'];
const EXTRA_CSS = '.itx td { white-space:nowrap; overflow:hidden; text-overflow:ellipsis; } .itx .b { font-weight:700; }';

export default function BetaItems() {
  const navigate = useNavigate();
  const { search } = useLocation();
  const tab = new URLSearchParams(search).get('tab') === 'create' ? 'create' : 'list';
  const { selectedCompany } = useCompany() || {};
  const { user } = useAuth() || {};
  const companyId = selectedCompany?.companyId;
  const [items, setItems] = useState(null);
  const [reload, setReload] = useState(0);
  const [editing, setEditing] = useState(null);
  const [note, setNote] = useState(null);
  const [slot, setSlot] = useState(null);
  const canAdd = can(user, 'items', 'create');

  useEffect(() => {
    if (!companyId) return;
    axios.get('/api/items', { params: { companyId } }).then(r => setItems(Array.isArray(r.data) ? r.data : [])).catch(() => setItems([]));
  }, [companyId, reload]);
  const cur = editing ? 'create' : (tab === 'create' && canAdd ? 'create' : 'list');
  const go = k => { setEditing(null); navigate(`/beta/items?tab=${k}`); };
  const tabs = [['list', 'Stock Items'], ...(canAdd || editing ? [['create', editing ? `Edit ${editing.itemCode}` : 'Add Item']] : [])];

  return (
    <div className="sb">
      <style>{SALES_CSS + PX_CSS + EXTRA_CSS}</style>
      <div className="sb-tabs" role="tablist">
        {tabs.map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={cur === k} className={`sb-tab${cur === k ? ' on' : ''}`} onClick={() => go(k)}>
            {label}{k === 'list' && items && <span className="n">{items.length}</span>}
          </button>
        ))}
        <div className="sb-slot" ref={setSlot} />
      </div>
      {note && <div className="sb-note" role="status">{note}<button type="button" onClick={() => setNote(null)} aria-label="Dismiss">×</button></div>}
      {cur === 'create'
        ? <div className="sb-body"><ItemForm key={editing ? editing.itemCode : 'new'} companyId={companyId} edit={editing} items={items || []}
            onCancel={() => go('list')} onSaved={text => { setReload(x => x + 1); setNote(text); go('list'); }} /></div>
        : <ItemList items={items} companyId={companyId} user={user} slot={slot} setNote={setNote}
            onEdit={it => { setNote(null); setEditing(it); }} onChanged={() => setReload(x => x + 1)} />}
    </div>
  );
}

function ItemForm({ companyId, edit, items, onSaved, onCancel }) {
  const [v, setV] = useState(() => ({ itemType: edit?.itemType || 'Ready Product', itemName: edit?.itemName || '', uom: edit?.uom || 'NOS', hsnCode: edit?.hsnCode || '' }));
  const [nextCode, setNextCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  useEffect(() => {
    if (edit || !companyId) return;
    axios.get('/api/items/next-code', { params: { companyId } }).then(r => setNextCode(String(r.data?.nextCode || ''))).catch(() => setNextCode(''));
  }, [edit, companyId]);
  const set = k => e => { const x = e.target.value; setV(o => ({ ...o, [k]: x })); setMsg(null); };
  const setType = e => { const t = e.target.value; setV(o => ({ ...o, itemType: t, uom: t === 'Service' ? 'N/A' : (o.uom === 'N/A' ? 'NOS' : o.uom) })); };
  const dup = v.itemName.trim() && items.find(x => key(x.itemName) === key(v.itemName) && String(x.itemCode) !== String(edit?.itemCode));

  const save = async () => {
    if (!v.itemName.trim()) return setMsg({ k: 'err', t: 'Enter the item name.' });
    if (dup) return setMsg({ k: 'err', t: `“${v.itemName.trim()}” is already in the list (code ${dup.itemCode}).` });
    setBusy(true);
    const payload = { companyId, itemType: v.itemType, itemName: v.itemName.trim(), uom: v.uom, hsnCode: v.hsnCode.trim() };
    try {
      if (edit) { await axios.put(`/api/items/${edit.itemCode}`, payload, { params: { companyId } }); onSaved(`Updated ${edit.itemCode} ${payload.itemName}.`); }
      else { const r = await axios.post('/api/items', payload, { params: { companyId } }); onSaved(`Added ${r.data?.itemCode || ''} ${payload.itemName}.`); }
    } catch (e) { setMsg({ k: 'err', t: e.response?.data?.error || 'Could not save.' }); }
    finally { setBusy(false); }
  };

  return (
    <div className="sf">
      <div className="sf-hero"><span className="ic"><Svg name="box" size={15} /></span><h1>{edit ? `Edit ${edit.itemCode} · ${edit.itemName}` : 'Add Stock Item'}</h1><span className="grow" /></div>
      <div className="sf-card" style={{ marginTop: 10, maxWidth: 720 }}>
        <div className="sf-ch"><span className="ico"><Svg name="box" size={13} /></span><b>Item</b></div>
        <table className="sf-kv"><tbody>
          <tr><th>Item Code</th><td><input value={edit ? edit.itemCode : (nextCode || 'Given on save')} readOnly className="mono" /></td></tr>
          <tr><th>Item Type <i>*</i></th><td><select value={v.itemType} onChange={setType}>{[...new Set([...TYPES, v.itemType])].map(t => <option key={t}>{t}</option>)}</select></td></tr>
          <tr><th>Item Name <i>*</i></th><td><input value={v.itemName} onChange={set('itemName')} placeholder="e.g. FRP Toilet IWC Size 3x3x7 ft" autoFocus />
            {dup && <div className="sf-msg err" style={{ marginTop: 4 }}>Already in the list — code {dup.itemCode}</div>}</td></tr>
          <tr><th>Unit</th><td><select value={v.uom} onChange={set('uom')}>{[...new Set([...UNITS, v.uom])].map(u => <option key={u}>{u}</option>)}</select></td></tr>
          <tr><th>HSN / SAC</th><td><input value={v.hsnCode} onChange={e => { const x = e.target.value.replace(/\D/g, '').slice(0, 8); setV(o => ({ ...o, hsnCode: x })); setMsg(null); }} inputMode="numeric" className="mono" placeholder="Optional" /></td></tr>
        </tbody></table>
      </div>
      {msg && <div className={`sf-msg ${msg.k}`} role="status">{msg.t}</div>}
      <div className="sf-bar">
        <div className="info">{edit ? <>Code <b>{edit.itemCode}</b></> : 'The code is given on save.'}</div>
        <button type="button" className="sf-b ghost" onClick={onCancel} disabled={busy}>Cancel</button>
        <button type="button" className="sf-b pri" onClick={save} disabled={busy}>{busy ? 'Saving…' : edit ? 'Update' : 'Save'}</button>
      </div>
    </div>
  );
}

function ItemList({ items, companyId, user, slot, setNote, onEdit, onChanged }) {
  const [q, setQ] = useState('');
  const [type, setType] = useState('');
  const [selId, setSelId] = useState(null);
  const [askDel, setAskDel] = useState(null);
  const [busy, setBusy] = useState(false);
  useClearSel(askDel ? null : selId, setSelId, '.sb-t tbody tr, .sb-tools, .sb-ask');
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const list = (items || []).filter(x => (!type || x.itemType === type) && (!words.length || words.every(w => `${x.itemCode} ${x.itemName} ${x.hsnCode} ${x.itemType}`.toLowerCase().includes(w))));
  const sel = list.find(x => String(x.itemCode) === String(selId)) || null;
  const canEdit = can(user, 'items', 'edit'), canDel = can(user, 'items', 'delete');
  const doDelete = async x => {
    setBusy(true);
    try { await axios.delete(`/api/items/${x.itemCode}`, { params: { companyId } }); setAskDel(null); setSelId(null); setNote(`Deleted ${x.itemCode} ${x.itemName}.`); onChanged(); }
    catch (e) { setNote(e.response?.data?.error || 'Could not delete.'); }
    finally { setBusy(false); }
  };
  return (
    <>
      {slot && createPortal(<>
        <input className="sb-search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search code, name, HSN…" aria-label="Search items" />
        <select className="sb-search" style={{ width: 150 }} value={type} onChange={e => setType(e.target.value)} aria-label="Item type"><option value="">All types</option>{TYPES.map(t => <option key={t}>{t}</option>)}</select>
        <div className="sb-tools">
          <span className="sb-picked">{sel ? <>Selected: <b>{sel.itemCode}</b></> : 'Click a row to select'}</span>
          {canEdit && <button type="button" className="sb-tbtn" disabled={!sel} onClick={() => onEdit(sel)}><Svg name="settings" size={13} />Edit</button>}
          {canDel && <button type="button" className="sb-tbtn del" disabled={!sel} onClick={() => setAskDel(sel)}><Svg name="x" size={13} />Delete</button>}
        </div>
      </>, slot)}
      {askDel && (
        <div className="sb-ask" role="alertdialog" aria-label="Confirm delete">
          <span><b>Delete {askDel.itemCode} {askDel.itemName}</b>? It is removed from the item list; old documents keep their text.</span>
          <button type="button" className="sb-abtn" onClick={() => setAskDel(null)} disabled={busy}>Keep</button>
          <button type="button" className="sb-abtn danger" onClick={() => doDelete(askDel)} disabled={busy}>{busy ? 'Deleting…' : 'Yes, delete'}</button>
        </div>
      )}
      <div className="sb-list">
        <table className="sb-t px itx">
          <colgroup><col style={{ width: '5%' }} /><col style={{ width: '11%' }} /><col style={{ width: '50%' }} /><col style={{ width: '14%' }} /><col style={{ width: '8%' }} /><col style={{ width: '12%' }} /></colgroup>
          <thead><tr><th className="r">#</th><th>Code</th><th>Item Name</th><th>Type</th><th>Unit</th><th>HSN / SAC</th></tr></thead>
          <tbody>
            {items === null ? <tr><td colSpan={6} className="sb-empty">Loading…</td></tr>
              : !list.length ? <tr><td colSpan={6} className="sb-empty">{q || type ? 'Nothing matches.' : 'No items yet — click “Add Item”.'}</td></tr>
                : list.map((x, i) => (
                  <tr key={x.itemCode} className={String(selId) === String(x.itemCode) ? 'sel' : ''} onClick={() => setSelId(x.itemCode)} onDoubleClick={() => canEdit && onEdit(x)} style={{ cursor: 'pointer' }}>
                    <td className="r">{i + 1}</td><td className="b mono">{x.itemCode}</td><td title={x.itemName}>{x.itemName}</td><td>{x.itemType || '—'}</td><td>{x.uom || '—'}</td><td className="mono">{x.hsnCode || '—'}</td>
                  </tr>
                ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
